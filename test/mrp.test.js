// Fabbisogno materiali: esplosione delle distinte e lista d'acquisto consolidata.
// Il rischio è che questo motore e quello dei costi raccontino due storie
// diverse sulla stessa distinta — uno dice quanto costa, l'altro cosa comprare,
// e devono partire dagli stessi pezzi. Per questo l'ultimo describe confronta
// le due strade invece di fidarsi dei numeri scritti a mano qui sopra.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm, comp, wc } = require('./fixtures.js');

function conDb(dbObj, role) {
  const app = loadApp({ silent: true });
  app.setDb(dbObj);
  app.asRole(role || 'admin');
  return app;
}
// Esplode un piano scritto come [[itemId, qty], …] e restituisce
// { buy: { CODICE: q.tà }, make: {…}, cycle } in oggetti del realm di Node.
function esplodi(app, piano) {
  const lines = piano.map(([itemId, qty]) => ({ itemId, qty }));
  return JSON.parse(app.eval(`(() => {
    const r = mrpExplode(${JSON.stringify(lines)});
    const m = l => Object.fromEntries(l.map(e => [e.item.code, e.qty]));
    return JSON.stringify({ buy: m(r.buy), make: m(r.make), cycle: r.cycle });
  })()`));
}

describe('mrpExplode — quantità', () => {
  it('moltiplica lungo i livelli', () => {
    const app = conDb(makeDb({ items: [
      acq('vite', 1),
      asm('sg', 'sottogruppo', { components: [comp('vite', 4)] }),
      asm('g', 'gruppo', { components: [comp('sg', 3)] }),
      asm('mac', 'macchina', { components: [comp('g', 2)] }),
    ] }));
    assert.deepEqual(esplodi(app, [['mac', 5]]).buy, { VITE: 5 * 2 * 3 * 4 });
  });

  it('somma in una riga sola lo stesso articolo su rami diversi (diamante)', () => {
    const app = conDb(makeDb({ items: [
      acq('vite', 1),
      asm('g1', 'gruppo', { components: [comp('vite', 4)] }),
      asm('g2', 'gruppo', { components: [comp('vite', 6)] }),
      asm('mac', 'macchina', { components: [comp('g1', 1), comp('g2', 2)] }),
    ] }));
    const buy = esplodi(app, [['mac', 1]]).buy;
    assert.deepEqual(Object.keys(buy), ['VITE']);
    approx(buy.VITE, 4 + 12);
  });

  it('lo scarto entra nella quantità, in cascata', () => {
    const app = conDb(makeDb({ items: [
      mat('m', 1),
      asm('g', 'gruppo', { components: [comp('m', 10, 20)] }),      // +20%
      asm('mac', 'macchina', { components: [comp('g', 1, 50)] }),   // +50%
    ] }));
    approx(esplodi(app, [['mac', 2]]).buy.M, 2 * 1.5 * 12);
  });

  it('più macchine nello stesso piano si sommano', () => {
    const app = conDb(makeDb({ items: [
      acq('vite', 1),
      asm('a', 'macchina', { components: [comp('vite', 2)] }),
      asm('b', 'macchina', { components: [comp('vite', 3)] }),
    ] }));
    approx(esplodi(app, [['a', 3], ['b', 2]]).buy.VITE, 6 + 6);
  });

  it('quantità nulla o articolo sparito: nessuna riga, nessun errore', () => {
    const app = conDb(makeDb({ items: [
      acq('vite', 1), asm('mac', 'macchina', { components: [comp('vite', 2)] }),
    ] }));
    assert.deepEqual(esplodi(app, [['mac', 0]]).buy, {});
    assert.deepEqual(esplodi(app, [['sparito', 5]]).buy, {});
    assert.deepEqual(esplodi(app, []).buy, {});
  });

  it('le lavorazioni degli assiemi non generano fabbisogno', () => {
    const app = conDb(makeDb({
      workCenters: [wc('w1', 50)],
      items: [asm('mac', 'macchina', { operations: [{ workCenterId: 'w1', hours: 3 }] })],
    }));
    assert.deepEqual(esplodi(app, [['mac', 1]]).buy, {});
  });
});

describe('mrpExplode — parti', () => {
  const dbParte = (sourcing) => makeDb({
    workCenters: [wc('w1', 0)],
    items: [
      mat('m', 2), acq('a', 5),
      parte('p', { sourcing, unitCost: 99, cycle: [
        { kind: 'item', itemId: 'm', qty: 3 },
        { kind: 'op', workCenterId: 'w1', cost: 10 },
        { kind: 'item', itemId: 'a', qty: 1 },
      ] }),
      asm('mac', 'macchina', { components: [comp('p', 2)] }),
    ],
  });

  it('la parte va tra quelle da fabbricare e la sua distinta tra gli acquisti', () => {
    const r = esplodi(conDb(dbParte('make')), [['mac', 4]]);
    assert.deepEqual(r.make, { P: 8 });
    assert.deepEqual(r.buy, { M: 24, A: 8 });
  });

  it('le lavorazioni del ciclo non finiscono negli acquisti', () => {
    const r = esplodi(conDb(dbParte('make')), [['p', 1]]);
    assert.deepEqual(Object.keys(r.buy).sort(), ['A', 'M']);
  });

  it('una parte messa a piano direttamente vale come radice', () => {
    const r = esplodi(conDb(dbParte('make')), [['p', 10]]);
    assert.deepEqual(r.make, { P: 10 });
    approx(r.buy.M, 30);
  });
});

describe('mrpExplode — parti acquistate da fornitore (sourcing)', () => {
  // Stessa parte, stesso ciclo: cambia solo chi la fa. Da acquisto è una foglia,
  // il suo materiale e le sue lavorazioni li mette il fornitore.
  const dbSourcing = (sourcing) => makeDb({
    workCenters: [wc('w1', 0)],
    items: [
      mat('m', 2), acq('a', 5),
      parte('p', { sourcing, unitCost: 40, cycle: [
        { kind: 'item', itemId: 'm', qty: 3 },
        { kind: 'op', workCenterId: 'w1', cost: 10 },
        { kind: 'item', itemId: 'a', qty: 1 },
      ] }),
      asm('mac', 'macchina', { components: [comp('p', 2)] }),
    ],
  });

  it('da produrre: la parte è in fabbricazione e la sua distinta negli acquisti', () => {
    const r = esplodi(conDb(dbSourcing('make')), [['mac', 3]]);
    assert.deepEqual(r.make, { P: 6 });
    assert.deepEqual(r.buy, { M: 18, A: 6 });
  });

  it('da acquisto: la parte è negli acquisti e la sua distinta sparisce', () => {
    const r = esplodi(conDb(dbSourcing('buy')), [['mac', 3]]);
    assert.deepEqual(r.make, {});
    assert.deepEqual(r.buy, { P: 6 });
  });

  it('senza il campo la parte si produce in casa, come sempre', () => {
    const r = esplodi(conDb(dbSourcing(undefined)), [['mac', 1]]);
    assert.deepEqual(r.make, { P: 2 });
  });

  it('un valore inatteso non trasforma la parte in un acquisto', () => {
    const r = esplodi(conDb(dbSourcing('boh')), [['mac', 1]]);
    assert.deepEqual(r.make, { P: 2 });
  });

  it('costo e fabbisogno raccontano la stessa storia', () => {
    // Prima erano due interruttori separati e potevano contraddirsi: comprare la
    // parte da fuori ma continuare a costificarla dal ciclo interno.
    approx(conDb(dbSourcing('buy')).ref('costOf')('p').total, 40, 'acquistata: il prezzo a listino');
    approx(conDb(dbSourcing('make')).ref('costOf')('p').total, 2 * 3 + 5 + 10, 'prodotta: il valore del ciclo');
  });
});

describe('mrpExplode — anelli', () => {
  it('un assieme che contiene sé stesso viene segnalato e non esplode lo stack', () => {
    const app = conDb(makeDb({ items: [
      acq('vite', 1),
      asm('g', 'gruppo', { components: [comp('vite', 2), comp('g', 1)] }),
    ] }));
    const r = esplodi(app, [['g', 1]]);
    assert.equal(r.cycle, true);
    approx(r.buy.VITE, 2);   // il ramo buono resta
  });

  it('anello indiretto attraverso una parte', () => {
    const app = conDb(makeDb({ items: [
      parte('p', { cycle: [{ kind: 'item', itemId: 'g', qty: 1 }] }),
      asm('g', 'gruppo', { components: [comp('p', 1)] }),
    ] }));
    assert.equal(esplodi(app, [['g', 1]]).cycle, true);
  });

  it('senza anelli il flag resta falso', () => {
    const app = conDb(makeDb({ items: [
      acq('vite', 1), asm('g', 'gruppo', { components: [comp('vite', 2)] }),
    ] }));
    assert.equal(esplodi(app, [['g', 1]]).cycle, false);
  });
});

describe('Coerenza con la costificazione', () => {
  it('la somma degli importi d\'acquisto è materiale + commerciali del rollup', () => {
    const app = conDb(makeDb({ items: [
      mat('m', 3.5), acq('a', 7.25), acq('v', 0.4),
      parte('p', { cycle: [{ kind: 'item', itemId: 'm', qty: 2.5 }] }),
      // Scarto del 10%: 33 viti tonde. Con un 5% sarebbero 31,5, e l'ordine
      // (dalla 0.105.5) ne chiede 32 interi, che il costo non conta.
      asm('sg', 'sottogruppo', { components: [comp('p', 2), comp('v', 10, 10)] }),
      asm('mac', 'macchina', { components: [comp('sg', 3), comp('a', 1)] }),
    ] }));
    const totale = app.eval(`(() => {
      const buy = mrpExplode([{ itemId: 'mac', qty: 1 }]).buy.map(mrpBuyRow);
      return buy.reduce((s, r) => s + r.amount, 0);
    })()`);
    const c = app.eval('costOf("mac")');
    approx(totale, c.material + c.purchased);
  });
});

describe('mrpBuyRow — fornitore, prezzo e segnalazioni', () => {
  function dbListino(over) {
    return makeDb({
      suppliers: [{ id: 'sup1', name: 'Alfa', active: true }, { id: 'sup2', name: 'Beta', active: true }],
      items: [
        Object.assign(acq('a', 10), {
          supplierId: 'sup1', priceListSeeded: true, activePriceId: 'q1',
          priceList: [
            { id: 'q1', supplierId: 'sup1', price: 10, minQty: 50, date: '2026-01-01' },
            { id: 'q2', supplierId: 'sup2', price: 8, minQty: '', date: '2026-02-01' },
          ],
        }, over || {}),
        asm('mac', 'macchina', { components: [comp('a', 10)] }),
      ],
    });
  }
  const riga = (app, piano) => JSON.parse(app.eval(`(() => {
    const r = mrpExplode(${JSON.stringify(piano.map(([itemId, qty]) => ({ itemId, qty })))}).buy.map(mrpBuyRow)[0];
    return JSON.stringify({ sup: r.supplierId, qty: r.qty, price: r.price, amount: r.amount,
      best: r.bestPrice, saving: r.saving, underMin: r.underMin });
  })()`));

  it('prende fornitore e prezzo dalla quotazione in uso, non dalla più bassa', () => {
    const r = riga(conDb(dbListino()), [['mac', 2]]);
    assert.equal(r.sup, 'sup1');
    approx(r.price, 10);
    approx(r.qty, 20);
    approx(r.amount, 200);
  });

  it('segnala il risparmio della quotazione migliore, sulla quantità di piano', () => {
    const r = riga(conDb(dbListino()), [['mac', 2]]);
    approx(r.best, 8);
    approx(r.saving, (10 - 8) * 20);
  });

  it('nessun risparmio da segnalare se in uso c\'è già la più bassa', () => {
    const app = conDb(dbListino({ activePriceId: 'q2', supplierId: 'sup2', purchasePrice: 8 }));
    const r = riga(app, [['mac', 1]]);
    assert.equal(r.saving, 0);
    assert.equal(r.sup, 'sup2');
  });

  it('avvisa quando la quantità è sotto il minimo del fornitore', () => {
    assert.equal(riga(conDb(dbListino()), [['mac', 1]]).underMin, true);    // 10 < 50
    assert.equal(riga(conDb(dbListino()), [['mac', 6]]).underMin, false);   // 60 ≥ 50
  });

  it('un articolo senza listino non lancia e resta senza fornitore', () => {
    const app = conDb(makeDb({ items: [mat('m', 2), asm('mac', 'macchina', { components: [comp('m', 3)] })] }));
    const r = riga(app, [['mac', 1]]);
    assert.equal(r.sup, '');
    approx(r.amount, 6);
    assert.equal(r.best, null);
  });
});

describe('mrpGroupBySupplier', () => {
  it('raggruppa, somma e mette in coda chi non ha fornitore', () => {
    const app = conDb(makeDb({
      suppliers: [{ id: 'sup1', name: 'Alfa', active: true }],
      items: [
        Object.assign(acq('a', 10), { supplierId: 'sup1' }),
        mat('m', 5),
        asm('mac', 'macchina', { components: [comp('a', 2), comp('m', 4)] }),
      ],
    }));
    const g = JSON.parse(app.eval(`(() => {
      const rows = mrpExplode([{ itemId: 'mac', qty: 1 }]).buy.map(mrpBuyRow);
      return JSON.stringify(mrpGroupBySupplier(rows).map(x => ({ name: x.name, n: x.rows.length, tot: x.total })));
    })()`));
    assert.deepEqual(g.map(x => x.name), ['Alfa', 'Da assegnare']);
    approx(g[0].tot, 20);
    approx(g[1].tot, 20);
  });
});

describe('Piani di produzione', () => {
  function dbPiano() {
    return makeDb({ plans: [], items: [
      acq('vite', 1), asm('mac', 'macchina', { components: [comp('vite', 4)] }),
    ] });
  }
  it('newPlan crea un piano numerato e progressivo', () => {
    const app = conDb(dbPiano());
    app.eval('newPlan()');
    app.eval('newPlan()');
    const nums = app.snapshot().plans.map(p => p.number);
    const anno = new Date().getFullYear();
    assert.deepEqual(nums, [`FAB-${anno}-001`, `FAB-${anno}-002`]);
  });

  it('lo stesso articolo aggiunto due volte somma invece di duplicare la riga', () => {
    const app = conDb(dbPiano());
    app.eval('newPlan()');
    const id = app.snapshot().plans[0].id;
    app.eval(`planAddLines(${JSON.stringify(id)}, ['mac'])`);
    app.eval(`planAddLines(${JSON.stringify(id)}, ['mac'])`);
    const p = app.snapshot().plans[0];
    assert.equal(p.lines.length, 1);
    approx(p.lines[0].qty, 2);
  });

  it('la quantità si salva e il fabbisogno la segue', () => {
    const app = conDb(dbPiano());
    app.eval('newPlan()');
    const p0 = app.snapshot().plans[0];
    app.eval(`planAddLines(${JSON.stringify(p0.id)}, ['mac'])`);
    const lineId = app.snapshot().plans[0].lines[0].id;
    app.eval(`planSetLineQty(${JSON.stringify(p0.id)}, ${JSON.stringify(lineId)}, '5')`);
    approx(app.snapshot().plans[0].lines[0].qty, 5);
    approx(esplodi(app, [['mac', 5]]).buy.VITE, 20);
    // Salvato davvero, non solo in memoria
    assert.equal(JSON.parse(app.storage.getItem(app.ref('DB_KEY'))).plans[0].lines[0].qty, 5);
  });

  it('una quantità negativa viene riportata a zero', () => {
    const app = conDb(dbPiano());
    app.eval('newPlan()');
    const p0 = app.snapshot().plans[0];
    app.eval(`planAddLines(${JSON.stringify(p0.id)}, ['mac'])`);
    const lineId = app.snapshot().plans[0].lines[0].id;
    app.eval(`planSetLineQty(${JSON.stringify(p0.id)}, ${JSON.stringify(lineId)}, '-3')`);
    approx(app.snapshot().plans[0].lines[0].qty, 0);
  });

  it('duplicare un piano copia le righe con un numero nuovo', () => {
    const app = conDb(dbPiano());
    app.eval('newPlan()');
    const src = app.snapshot().plans[0];
    app.eval(`planAddLines(${JSON.stringify(src.id)}, ['mac'])`);
    app.eval(`duplicatePlan(${JSON.stringify(src.id)})`);
    const plans = app.snapshot().plans;
    assert.equal(plans.length, 2);
    assert.notEqual(plans[1].number, plans[0].number);
    assert.deepEqual(plans[1].lines.map(l => l.itemId), ['mac']);
    assert.notEqual(plans[1].lines[0].id, plans[0].lines[0].id);
  });

  it('il ruolo lettore non crea né modifica piani', () => {
    const app = conDb(dbPiano(), 'lettore');
    app.eval('newPlan()');
    assert.equal(app.snapshot().plans.length, 0);
  });

  it('la collezione nasce anche sui database che non la conoscevano', () => {
    const app = loadApp({ silent: true });
    app.seedStorage({ schemaVersion: 2, items: [], settings: {} });
    app.eval('Store.load()');
    assert.deepEqual(app.snapshot().plans, []);
  });
});

// 0.105.5: scarti e coefficienti davano mezze viti sugli ordini.
describe('Le quantità da ordinare', () => {
  it('i pezzi si arrotondano all\'intero in su, il resto a sei decimali', () => {
    const app = conDb(makeDb({ items: [
      Object.assign(acq('vite', 1), { uom: 'pz' }),
      Object.assign(mat('olio', 1), { uom: 'l' }),
      Object.assign(parte('p', { cycle: [] }), { uom: 'pz' }),
      asm('g', 'gruppo', { components: [Object.assign(comp('vite', 1), { scrapPct: 5 }), comp('olio', 0.1), Object.assign(comp('p', 1), { scrapPct: 5 })] }),
    ], plans: [{ id: 'pl1', number: 'FAB-1', active: true, lines: [{ id: 'l1', itemId: 'g', qty: 3, dueDate: '2026-12-01' }] }] }));
    const r = JSON.parse(app.eval(`(invalidateCaches(), JSON.stringify({
      buy: Object.fromEntries(mrpBuyRows(getPlan('pl1'), false).map(x => [x.item.id, x.qtyOrder])),
      make: Object.fromEntries(mrpMakeRows(getPlan('pl1')).map(x => [x.item.id, x.qtyOrder])) }))`));
    assert.deepEqual(r, { buy: { vite: 4, olio: 0.3 }, make: { p: 4 } });
  });
});
