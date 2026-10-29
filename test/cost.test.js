// Motore di costificazione (costing.js, costOf / cycleRowCost / sellingPrice / flattenBom).
// È il cuore dell'app: da qui escono i prezzi che finiscono su offerte e ordini.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm, comp, wc } = require('./fixtures.js');

// Un'app fresca per ogni scenario: db isolato, nessuna contaminazione tra test.
function withDb(dbObj) {
  const app = loadApp({ silent: true });
  app.setDb(dbObj);
  return app;
}
// Invariante strutturale: le categorie devono ricomporre esattamente il totale.
function assertCoerente(c, msg) {
  approx(c.material + c.purchased + c.labor + c.parts + c.overhead, c.total, (msg || '') + ' somma categorie = total');
  approx(c.base + c.overhead, c.total, (msg || '') + ' base + overhead = total');
}

describe('costOf — foglie', () => {
  it('materiale: unitCost finisce in "material"', () => {
    const app = withDb(makeDb({ items: [mat('m', 12.5)] }));
    const c = app.ref('costOf')('m');
    approx(c.material, 12.5); approx(c.total, 12.5); approx(c.base, 12.5);
    approx(c.purchased, 0); approx(c.overhead, 0);
    assert.equal(c.cycle, false);
    assertCoerente(c);
  });

  it('acquistato: purchasePrice finisce in "purchased"', () => {
    const app = withDb(makeDb({ items: [acq('a', 320)] }));
    const c = app.ref('costOf')('a');
    approx(c.purchased, 320); approx(c.total, 320); approx(c.material, 0);
    assertCoerente(c);
  });

  it('le foglie non prendono spese generali', () => {
    const app = withDb(makeDb({ items: [mat('m', 100)], settings: { overheadPct: 25 } }));
    approx(app.ref('costOf')('m').total, 100);
  });

  it('articolo inesistente: ritorna zero senza lanciare', () => {
    const app = withDb(makeDb({ items: [] }));
    const c = app.ref('costOf')('non-esiste');
    approx(c.total, 0); assert.equal(c.cycle, false);
  });

  it('costo mancante o non numerico vale 0, mai NaN', () => {
    const app = withDb(makeDb({ items: [
      { id: 'x', type: 'materiale', unitCost: 'abc' },
      { id: 'y', type: 'acquistato' },
    ] }));
    approx(app.ref('costOf')('x').total, 0);
    approx(app.ref('costOf')('y').total, 0);
  });
});

describe('costOf — assiemi', () => {
  it('applica quantità e scarto a tutte le categorie', () => {
    const app = withDb(makeDb({
      workCenters: [wc('w', 50)],
      items: [
        mat('m', 10), acq('a', 20), parte('p', { unitCost: 30, sourcing: 'buy' }),
        asm('g', 'gruppo', {
          components: [comp('m', 2, 10), comp('a', 1), comp('p', 1)],
          operations: [{ workCenterId: 'w', hours: 2 }],
        }),
      ],
    }));
    const c = app.ref('costOf')('g');
    approx(c.material, 22, 'scarto 10% su 2 kg da 10');
    approx(c.purchased, 20);
    approx(c.parts, 30);
    approx(c.labor, 100, 'ore x tariffa');
    approx(c.total, 172);
    assertCoerente(c);
  });

  it('centro di lavoro inesistente: manodopera 0, non NaN', () => {
    const app = withDb(makeDb({
      workCenters: [],
      items: [asm('g', 'gruppo', { operations: [{ workCenterId: 'fantasma', hours: 3 }] })],
    }));
    const c = app.ref('costOf')('g');
    approx(c.labor, 0); approx(c.total, 0);
    assert.ok(!Number.isNaN(c.total));
  });

  it('spese generali in cascata: la quota dei figli non viene rimaggiorata', () => {
    const app = withDb(makeDb({
      settings: { overheadPct: 10 },
      items: [
        mat('m', 100),
        asm('sg', 'sottogruppo', { components: [comp('m', 1)] }),
        asm('g', 'gruppo', { components: [comp('sg', 1)] }),
        asm('mac', 'macchina', { components: [comp('g', 1)] }),
      ],
    }));
    const costOf = app.ref('costOf');
    approx(costOf('sg').total, 110, 'sottogruppo');
    approx(costOf('g').overhead, 20, 'gruppo: 10 del figlio + 10 propri');
    approx(costOf('g').total, 120, 'gruppo');
    const mac = costOf('mac');
    approx(mac.overhead, 30, 'macchina: 20 dai figli + 10 propri');
    approx(mac.base, 100, 'la base resta il costo puro');
    approx(mac.total, 130, 'macchina');
    assertCoerente(mac, 'macchina');
  });

  it('overheadPctOverride = 0 vince sull\'impostazione globale', () => {
    const app = withDb(makeDb({
      settings: { overheadPct: 10 },
      items: [mat('m', 100), asm('g', 'gruppo', { components: [comp('m', 1)], overheadPctOverride: 0 })],
    }));
    const c = app.ref('costOf')('g');
    approx(c.overhead, 0, 'lo zero esplicito non deve cadere sul default');
    approx(c.total, 100);
  });

  it('overheadPctOverride valorizzato sostituisce il globale', () => {
    const app = withDb(makeDb({
      settings: { overheadPct: 10 },
      items: [mat('m', 100), asm('g', 'gruppo', { components: [comp('m', 1)], overheadPctOverride: 50 })],
    }));
    approx(app.ref('costOf')('g').total, 150);
  });

  it('diamante: un componente condiviso viene contato una volta per ramo', () => {
    const app = withDb(makeDb({
      items: [
        acq('d', 50),
        asm('g1', 'gruppo', { components: [comp('d', 1)] }),
        asm('g2', 'gruppo', { components: [comp('d', 1)] }),
        asm('mac', 'macchina', { components: [comp('g1', 1), comp('g2', 1)] }),
      ],
    }));
    const c = app.ref('costOf')('mac');
    approx(c.purchased, 100, 'D contato in entrambi i rami');
    approx(c.total, 100);
  });
});

// Da dove viene il costo di una parte lo decide una domanda sola: la facciamo o
// la compriamo? Prima erano due interruttori (modo di calcolo + fabbisogno) che
// potevano dire cose diverse sulla stessa parte.
describe('costOf — parti: il costo segue l\'approvvigionamento', () => {
  const dbConCiclo = sourcing => makeDb({
    items: [
      mat('m', 10), acq('a', 5),
      parte('p', {
        unitCost: 30, sourcing,
        cycle: [
          { kind: 'item', itemId: 'm', qty: 2 },
          { kind: 'item', itemId: 'a', qty: 1 },
          { kind: 'op', workCenterId: 'w', cost: 15 },
        ],
      }),
    ],
  });

  it('acquistata: costa il prezzo a listino, il ciclo è ignorato', () => {
    const c = withDb(dbConCiclo('buy')).ref('costOf')('p');
    approx(c.parts, 30); approx(c.material, 0); approx(c.labor, 0); approx(c.total, 30);
    assertCoerente(c);
  });

  it('prodotta in casa: ogni riga del ciclo confluisce nella propria categoria', () => {
    const c = withDb(dbConCiclo('make')).ref('costOf')('p');
    approx(c.material, 20, 'materie prime del ciclo');
    approx(c.purchased, 5, 'commerciali del ciclo');
    approx(c.labor, 15, 'lavorazione a costo fisso');
    approx(c.parts, 0, 'il prezzo a listino non concorre: la parte la facciamo noi');
    approx(c.total, 40);
    assertCoerente(c);
  });

  it('il prezzo a listino non si somma mai al ciclo', () => {
    // Il vecchio modo "somma" non esiste più: o è il ciclo, o è il fornitore.
    const c = withDb(dbConCiclo('make')).ref('costOf')('p');
    approx(c.total, 40, 'niente 70');
  });

  it('sourcing assente: si comporta come prodotta in casa', () => {
    const d = dbConCiclo(undefined);
    delete d.items[2].sourcing;
    approx(withDb(d).ref('costOf')('p').total, 40);
  });

  it('sourcing non valido: si comporta come prodotta in casa', () => {
    approx(withDb(dbConCiclo('inventato')).ref('costOf')('p').total, 40);
  });

  it('prodotta in casa ma senza righe di ciclo: resta il prezzo a listino', () => {
    const app = withDb(makeDb({ items: [parte('p', { unitCost: 42, sourcing: 'make', cycle: [] })] }));
    const c = app.ref('costOf')('p');
    approx(c.parts, 42); approx(c.total, 42);
  });

  it('lavorazione del ciclo senza costo: 0, non NaN', () => {
    const app = withDb(makeDb({ items: [parte('p', { cycle: [{ kind: 'op', workCenterId: 'w' }] })] }));
    approx(app.ref('costOf')('p').total, 0);
  });

  it('riga di ciclo che punta a un articolo inesistente viene ignorata', () => {
    const app = withDb(makeDb({ items: [
      mat('m', 10),
      parte('p', { cycle: [{ kind: 'item', itemId: 'm', qty: 1 }, { kind: 'item', itemId: 'boh', qty: 5 }] }),
    ] }));
    approx(app.ref('costOf')('p').total, 10);
  });
});

describe('cycleRowCost — override di riga', () => {
  const riga = over => makeDb({ items: [
    mat('m', 10),
    parte('p', { costMode: 'cycle', cycle: [Object.assign({ kind: 'item', itemId: 'm', qty: 2 }, over)] }),
  ] });

  it('nessun override: quantità x costo unitario', () => {
    approx(withDb(riga({})).ref('costOf')('p').total, 20);
  });
  it('override stringa vuota NON è un override', () => {
    approx(withDb(riga({ costOverride: '' })).ref('costOf')('p').total, 20);
  });
  it('override null NON è un override', () => {
    approx(withDb(riga({ costOverride: null })).ref('costOf')('p').total, 20);
  });
  it('override 0 È un override e azzera la riga', () => {
    approx(withDb(riga({ costOverride: 0 })).ref('costOf')('p').total, 0);
  });
  it('override valorizzato sostituisce il calcolo', () => {
    approx(withDb(riga({ costOverride: 7.5 })).ref('costOf')('p').total, 7.5);
  });
});

// Una lavorazione di ciclo è a costo fisso di default (costMode assente =
// comportamento di sempre); costMode:'orario' la fa costare ore × tariffa.
describe('cycleRowCost — lavorazione a costo orario', () => {
  const conLavorazione = op => makeDb({ items: [
    parte('p', { sourcing: 'make', cycle: [Object.assign({ kind: 'op', workCenterId: 'w1' }, op)] }),
  ] });

  it('senza costMode: resta il costo fisso di sempre', () => {
    approx(withDb(conLavorazione({ cost: 15 })).ref('costOf')('p').total, 15);
  });
  it('costMode fisso esplicito: uguale', () => {
    approx(withDb(conLavorazione({ costMode: 'fisso', cost: 15 })).ref('costOf')('p').total, 15);
  });
  it('costMode orario: ore × tariffa, il campo "cost" non conta', () => {
    approx(withDb(conLavorazione({ costMode: 'orario', hours: 2, rate: 40, cost: 999 })).ref('costOf')('p').total, 80);
  });
  it('costMode orario senza ore o tariffa: 0, non NaN', () => {
    approx(withDb(conLavorazione({ costMode: 'orario' })).ref('costOf')('p').total, 0);
  });
});

describe('wcRateFor — tariffa proposta per una lavorazione oraria', () => {
  it('fornitore registrato sul centro: la sua tariffa', () => {
    const wc = { hourlyRate: 40, suppliers: [{ id: 'x', supplierId: 's1', rate: 55 }] };
    assert.equal(withDb(makeDb({})).ref('wcRateFor')(wc, 's1'), 55);
  });
  it('fornitore non registrato lì, o nessun fornitore (interna): tariffa del centro', () => {
    const wc = { hourlyRate: 40, suppliers: [{ id: 'x', supplierId: 's1', rate: 55 }] };
    assert.equal(withDb(makeDb({})).ref('wcRateFor')(wc, 's2'), 40);
    assert.equal(withDb(makeDb({})).ref('wcRateFor')(wc, ''), 40);
  });
  it('nessun centro: 0', () => {
    assert.equal(withDb(makeDb({})).ref('wcRateFor')(null, 's1'), 0);
  });
});

describe('costOf — rilevamento cicli', () => {
  it('auto-anello: segnalato, nessuno stack overflow', () => {
    const app = withDb(makeDb({ items: [asm('g', 'gruppo', { components: [comp('g', 1)] })] }));
    const c = app.ref('costOf')('g');
    assert.equal(c.cycle, true);
    assert.ok(!Number.isNaN(c.total));
  });

  it('anello indiretto A→B→C→A: propagato fino alla radice', () => {
    const app = withDb(makeDb({ items: [
      asm('a', 'macchina', { components: [comp('b', 1)] }),
      asm('b', 'gruppo', { components: [comp('c', 1)] }),
      asm('c', 'sottogruppo', { components: [comp('a', 1)] }),
    ] }));
    assert.equal(app.ref('costOf')('a').cycle, true);
    assert.equal(app.ref('costOf')('b').cycle, true);
  });

  // Dall'interfaccia un ciclo di lavorazione accetta solo materie prime e
  // commerciali (foglie), ma import Excel e backup possono produrre altro.
  it('anello dentro il ciclo di lavorazione di una parte: segnalato', () => {
    const app = withDb(makeDb({ items: [
      parte('p', { costMode: 'cycle', cycle: [{ kind: 'item', itemId: 'p', qty: 1 }] }),
    ] }));
    assert.equal(app.ref('costOf')('p').cycle, true);
  });

  it('anello parte → assieme → parte: risalito fino alla parte', () => {
    const app = withDb(makeDb({ items: [
      parte('p', { costMode: 'cycle', cycle: [{ kind: 'item', itemId: 'g', qty: 1 }] }),
      asm('g', 'sottogruppo', { components: [comp('p', 1)] }),
    ] }));
    assert.equal(app.ref('costOf')('p').cycle, true, 'la parte deve segnalare l\'anello');
    assert.equal(app.ref('costOf')('g').cycle, true, 'e anche l\'assieme');
  });

  it('un override di riga interrompe la dipendenza e il costo torna valido', () => {
    const app = withDb(makeDb({ items: [
      parte('p', { costMode: 'cycle', cycle: [{ kind: 'item', itemId: 'p', qty: 1, costOverride: 12 }] }),
    ] }));
    const c = app.ref('costOf')('p');
    assert.equal(c.cycle, false, 'con l\'override non si scende più nel sottoalbero');
    approx(c.total, 12);
  });

  it('un ramo sano accanto a un anello conserva il proprio costo', () => {
    const app = withDb(makeDb({ items: [
      acq('ok', 100),
      asm('anello', 'sottogruppo', { components: [comp('anello', 1)] }),
      asm('mac', 'macchina', { components: [comp('ok', 1), comp('anello', 1)] }),
    ] }));
    const c = app.ref('costOf')('mac');
    assert.equal(c.cycle, true, 'la macchina segnala l\'anello');
    approx(c.purchased, 100, 'il ramo sano resta valorizzato');
  });
});

describe('sellingPrice', () => {
  it('applica il margine globale', () => {
    const app = withDb(makeDb({ settings: { marginPct: 20 }, items: [acq('a', 100)] }));
    approx(app.ref('sellingPrice')('a'), 120);
  });
  it('marginPctOverride = 0 vince sul globale', () => {
    const app = withDb(makeDb({ settings: { marginPct: 20 }, items: [Object.assign(acq('a', 100), { marginPctOverride: 0 })] }));
    approx(app.ref('sellingPrice')('a'), 100);
  });
  it('marginPctOverride valorizzato sostituisce il globale', () => {
    const app = withDb(makeDb({ settings: { marginPct: 20 }, items: [Object.assign(acq('a', 100), { marginPctOverride: 50 })] }));
    approx(app.ref('sellingPrice')('a'), 150);
  });
});

describe('flattenBom — coerenza con il motore', () => {
  it('senza spese generali né lavorazioni di testa, i figli sommano al totale', () => {
    const app = withDb(makeDb({
      items: [
        mat('m', 10), acq('a', 20),
        asm('g', 'gruppo', { components: [comp('m', 3), comp('a', 2)] }),
        asm('mac', 'macchina', { components: [comp('g', 2)] }),
      ],
    }));
    const rows = [];
    app.ref('flattenBom')('mac', 1, 0, 0, rows, []);
    const figli = rows.filter(r => r.level === 1).reduce((s, r) => s + r.line, 0);
    approx(figli, app.ref('costOf')('mac').total, 'somma righe di primo livello');
  });

  it('una parte esplode il proprio ciclo e le righe sommano al costo della parte', () => {
    const app = withDb(makeDb({
      items: [
        mat('m', 10), acq('a', 5),
        parte('p', { unitCost: 30, cycle: [
          { kind: 'item', itemId: 'm', qty: 2 },
          { kind: 'item', itemId: 'a', qty: 1 },
          { kind: 'op', workCenterId: 'w', cost: 15 },
        ] }),
      ],
    }));
    const rows = [];
    app.ref('flattenBom')('p', 1, 0, 0, rows, []);
    const figli = rows.filter(r => r.level === 1).reduce((s, r) => s + r.line, 0);
    approx(figli, app.ref('costOf')('p').total, 'le righe del ciclo sommano al costo della parte');
  });

  it('una parte acquistata non esplode: la sua distinta non concorre', () => {
    const app = withDb(makeDb({
      items: [
        mat('m', 10),
        parte('p', { unitCost: 30, sourcing: 'buy', cycle: [{ kind: 'item', itemId: 'm', qty: 2 }] }),
      ],
    }));
    const rows = [];
    app.ref('flattenBom')('p', 1, 0, 0, rows, []);
    assert.equal(rows.length, 1, 'solo la parte stessa');
    approx(rows[0].unit, 30);
  });

  it('un anello viene marcato e non esplode ricorsivamente', () => {
    const app = withDb(makeDb({ items: [asm('g', 'gruppo', { components: [comp('g', 1)] })] }));
    const rows = [];
    app.ref('flattenBom')('g', 1, 0, 0, rows, []);
    assert.ok(rows.length < 5, 'la ricorsione si ferma');
    assert.ok(rows.some(r => /ciclo!/.test(r.name)), 'la riga in anello è segnalata');
  });
});

describe('posizione gerarchica delle righe (1, 1.1, 1.1.1…)', () => {
  it('bomPos numera dal padre e riparte da 1 sotto ogni ramo', () => {
    const app = withDb(makeDb({ items: [] }));
    const bomPos = app.ref('bomPos');
    assert.equal(bomPos('', 0), '1', 'primo livello senza padre');
    assert.equal(bomPos('', 1), '2');
    assert.equal(bomPos('1', 0), '1.1');
    assert.equal(bomPos('1.2', 2), '1.2.3');
  });

  it('la radice non ha posizione e i figli scendono di livello in livello', () => {
    const app = withDb(makeDb({
      items: [
        mat('m', 10), acq('a', 20),
        asm('sg', 'sottogruppo', { components: [comp('m', 1)] }),
        asm('g', 'gruppo', { components: [comp('sg', 1), comp('a', 2)] }),
        asm('mac', 'macchina', { components: [comp('g', 1), comp('a', 1)] }),
      ],
    }));
    const rows = [];
    app.ref('flattenBom')('mac', 1, 0, 0, rows, []);
    assert.deepEqual(rows.map(r => r.pos), ['', '1', '1.1', '1.1.1', '1.2', '2']);
  });

  it('la distinta della parte continua la numerazione, le lavorazioni restano senza numero', () => {
    const app = withDb(makeDb({
      items: [
        mat('m', 10), acq('a', 5),
        parte('p', { unitCost: 30, cycle: [
          { kind: 'item', itemId: 'm', qty: 2 },
          { kind: 'op', workCenterId: 'w', cost: 15 },
          { kind: 'item', itemId: 'a', qty: 1 },
        ] }),
        asm('mac', 'macchina', { components: [comp('a', 1), comp('p', 1)] }),
      ],
    }));
    const rows = [];
    app.ref('flattenBom')('mac', 1, 0, 0, rows, []);
    // Prima la distinta della parte (dalla 0.125.0 sta lì), poi le fasi: la
    // fase non consuma un numero, la serie degli articoli resta 2.1, 2.2.
    assert.deepEqual(rows.map(r => r.pos), ['', '1', '2', '2.1', '2.2', '']);
    assert.equal(rows[5].type, 'Lavorazione');
    // Nessuna riga "costo unitario manuale": il prezzo a listino non si somma
    // più al ciclo, quindi la serie finisce con l'ultimo articolo.
    assert.equal(rows.length, 6);
  });
});
