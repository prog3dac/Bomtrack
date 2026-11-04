// Modulo Qualità, fasi 2-4: piani di controllo, non conformità, valutazione
// dei fornitori (0.140.0).
//
// Le domande:
//  - il campione AQL è quello della tabella ISO 2859-1, frecce comprese;
//  - il piano giusto entra nel collaudo, e il salto lotti salta davvero;
//  - un certificato mancante non lascia accettare «pulito»;
//  - un respinto o una deroga aprono una non conformità, che rinforza il
//    controllo finché è aperta;
//  - la valutazione conta quello che è successo, e la classe ne segue.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

function base(opz) {
  const o = opz || {};
  const art = Object.assign(acq('c1', 5), { uom: 'pz', supplierId: 's1', familyId: 'f1' });
  if (o.qc) art.qc = o.qc;
  return makeDb({
    suppliers: [{ id: 's1', name: 'SKF', active: true }, { id: 's2', name: 'Beta', active: true }],
    families: [{ id: 'f1', name: 'Cuscinetti', kind: 'acquistato', sigla: 'CUS', subs: [] }],
    items: [art],
    settings: { overheadPct: 0, marginPct: 0, currency: '€', modules: { qualita: true } },
    qualityPlans: o.piani || [],
    orders: [{ id: 'o1', number: 'ODA-2026-001', title: '', date: '2026-02-01', status: 'confermato',
      supplierId: o.fornitore || 's1', notes: '', notesInternal: '', supplierConfirmation: 'X', active: true,
      lines: [{ id: 'l1', itemId: 'c1', code: 'CMM-001', description: 'Cuscinetto', uom: 'pz',
        qty: 100000, price: 5, deliveryDate: o.consegna || '', confirmedDate: o.confermata || '', received: 0, note: '' }] }],
  });
}
const piano = extra => Object.assign({ id: 'p1', name: 'Cuscinetti', itemId: null, familyId: 'f1', supplierId: null, cert: '',
  sampling: 'aql', aql: 1, sampleQty: 5, samplePct: 10, skipAfter: 0, skipEvery: 0,
  characteristics: [{ id: 'k1', name: 'Diametro', kind: 'misura', nominal: 20, tolMin: -0.05, tolMax: 0.05, uom: 'mm', tool: 'Calibro' },
    { id: 'k2', name: 'Marcatura', kind: 'ok' }], notes: '', active: true }, extra || {});
function app(db, role) {
  const a = loadApp({ silent: true });
  a.setDb(db || base({ piani: [piano()] }));
  a.asRole(role || 'admin');
  return a;
}
const J = (a, expr) => JSON.parse(a.eval(`JSON.stringify(${expr})`));
// Ogni arrivo è un ricevuto in più sulla stessa riga.
function arriva(a, q) {
  const ora = Number(a.eval('getOrder("o1").lines[0].received')) || 0;
  a.eval(`ordSetLine('o1','l1','received', ${JSON.stringify(String(ora + q))})`);
  return J(a, 'qcTutti()[qcTutti().length - 1] || null');
}
const esito = (a, id, d) => a.eval(`qcRegistraEsito(${JSON.stringify(id)}, ${JSON.stringify(d)})`);

describe('Campionamento ISO 2859-1, livello II, normale', () => {
  const casi = [
    [1000, 2.5, 'J', 80, 5, 6],     // l'esempio dei manuali
    [1000, 1, 'J', 80, 2, 3],
    [500, 1, 'H', 50, 1, 2],
    [200, 0.4, 'G', 32, 0, 1],
    [5000, 6.5, 'L', 200, 21, 22],
    [50, 6.5, 'D', 8, 1, 2],
    [100, 1, 'E', 13, 0, 1],         // freccia in su: F → E
    [20, 4, 'B', 3, 0, 1],           // freccia in su: C → B
    [50, 1, 'E', 13, 0, 1],          // freccia in giù: D → E
    [10, 0.065, 'L', 200, 0, 1],     // giù fino a dove c'è un piano
  ];
  casi.forEach(([lotto, aql, lettera, n, ac, re]) => {
    it(`lotto ${lotto}, AQL ${aql}: lettera ${lettera}, ${n} pezzi, Ac ${ac} Re ${re}`, () => {
      const a = app();
      assert.deepEqual(J(a, `isoPianoNormale(${lotto}, ${aql})`), { lettera, n, ac, re });
    });
  });
  it('un campione più grande del lotto vuol dire guardarlo tutto', () => {
    const a = app();
    const c = J(a, 'qcCampionamento({ sampling: "aql", aql: 0.065 }, 10, "normale")');
    assert.equal(c.size, 10);
    assert.match(c.regola, /lotto intero/);
  });
});

describe('Il piano entra nel collaudo', () => {
  it('un piano sulla famiglia basta a far collaudare, e il collaudo ne prende la copia', () => {
    const a = app();
    assert.equal(a.eval('qcRichiesto(getItem("c1"), "s1")'), true);
    const c = arriva(a, 1000);
    assert.equal(c.planId, 'p1');
    assert.equal(c.sampleSize, 80);
    assert.equal(c.acceptNo, 2);
    assert.deepEqual(c.checks.map(x => x.name), ['Diametro', 'Marcatura']);
    a.eval('qcPianoGet("p1").characteristics = []');
    assert.equal(J(a, 'qcGet(' + JSON.stringify(c.id) + ').checks').length, 2, 'cambiare il piano non riscrive i collaudi nati');
  });

  it('vince il piano più specifico: articolo e fornitore prima della famiglia', () => {
    const a = app(base({ piani: [piano(), piano({ id: 'p2', name: 'Solo SKF', familyId: null, itemId: 'c1', supplierId: 's1', sampling: 'fisso', sampleQty: 7 })] }));
    assert.equal(a.eval('qcPianoPer(getItem("c1"), "s1").id'), 'p2');
    assert.equal(a.eval('qcPianoPer(getItem("c1"), "s2").id'), 'p1', 'per un altro fornitore vale la famiglia');
    assert.equal(arriva(a, 100).sampleSize, 7);
  });

  it('un «No» sull\'articolo vince anche sul piano della famiglia', () => {
    const a = app(base({ qc: 'no', piani: [piano()] }));
    assert.equal(a.eval('qcRichiesto(getItem("c1"), "s1")'), false);
    arriva(a, 100);
    assert.equal(a.eval('qcTutti().length'), 0);
  });

  it('le misure suggeriscono l\'esito, e una fuori tolleranza dice respinto', () => {
    const a = app();
    const c = arriva(a, 100);
    const id = JSON.stringify(c.id);
    assert.equal(a.eval(`qcEsitoSuggerito(qcGet(${id}))`), '', 'senza misure non suggerisce niente');
    a.eval(`qcSetCheck(${id}, 'k1', '20.03'); qcSetCheck(${id}, 'k2', 'ok')`);
    assert.equal(a.eval(`qcEsitoSuggerito(qcGet(${id}))`), 'accettato');
    a.eval(`qcSetCheck(${id}, 'k1', '20.08')`);
    assert.equal(a.eval(`qcCheckEsito(qcGet(${id}).checks[0])`), 'ko');
    assert.equal(a.eval(`qcEsitoSuggerito(qcGet(${id}))`), 'respinto');
  });

  it('i pezzi non conformi oltre il numero di rifiuto dicono respinto', () => {
    const a = app(base({ piani: [piano({ characteristics: [] })] }));
    const c = arriva(a, 1000);   // Ac 2 Re 3
    const id = JSON.stringify(c.id);
    a.eval(`qcSetDifetti(${id}, 2)`);
    assert.equal(a.eval(`qcEsitoSuggerito(qcGet(${id}))`), 'accettato');
    a.eval(`qcSetDifetti(${id}, 3)`);
    assert.equal(a.eval(`qcEsitoSuggerito(qcGet(${id}))`), 'respinto');
  });
});

describe('Salto lotti e rinforzato', () => {
  it('dopo N accettati se ne salta, tranne uno ogni K; al primo respinto si guarda tutto', () => {
    const a = app(base({ piani: [piano({ sampling: 'fisso', sampleQty: 5, characteristics: [], skipAfter: 2, skipEvery: 3 })] }));
    const ok = () => { const c = arriva(a, 100); assert.equal(c.status, 'aperto'); esito(a, c.id, { esito: 'accettato' }); return c; };
    ok(); ok();
    const s1 = arriva(a, 100);
    assert.equal(s1.skipLot, true);
    assert.equal(s1.status, 'chiuso', 'senza certificato un lotto saltato si chiude da solo');
    assert.equal(Number(a.eval('inQCOf("c1")')), 0, 'e non trattiene niente');
    assert.equal(arriva(a, 100).skipLot, true);
    const g = arriva(a, 100);
    assert.ok(!g.skipLot, 'il terzo si guarda');
    assert.equal(g.planState, 'ridotto');
    esito(a, g.id, { esito: 'respinto', qtyKo: 100, destino: 'sostituzione' });
    const r = arriva(a, 100);
    assert.equal(r.planState, 'rinforzato');
    assert.equal(r.sampleSize, 100, 'rinforzato: tutto il lotto');
  });

  it('con un certificato da controllare il lotto saltato resta aperto per il certificato', () => {
    const a = app(base({ piani: [piano({ sampling: 'fisso', characteristics: [], skipAfter: 1, skipEvery: 2, cert: '3.1' })] }));
    const c = arriva(a, 10);
    a.eval(`qcSetCampo(${JSON.stringify(c.id)}, 'cert', 'ok')`);
    esito(a, c.id, { esito: 'accettato' });
    const s = arriva(a, 10);
    assert.equal(s.skipLot, true);
    assert.equal(s.status, 'aperto');
    assert.equal(s.sampleSize, 0);
  });
});

describe('Il certificato', () => {
  it('mancante, si accetta solo in deroga', () => {
    const a = app(base({ piani: [piano({ cert: '3.1 EN 10204', characteristics: [] })] }));
    const c = arriva(a, 10);
    assert.equal(c.cert, 'atteso');
    assert.equal(esito(a, c.id, { esito: 'accettato' }), false);
    assert.equal(esito(a, c.id, { esito: 'deroga' }), true);
  });
  it('arrivato, si accetta', () => {
    const a = app(base({ piani: [piano({ cert: '3.1 EN 10204', characteristics: [] })] }));
    const c = arriva(a, 10);
    a.eval(`qcSetCampo(${JSON.stringify(c.id)}, 'cert', 'ok')`);
    assert.equal(esito(a, c.id, { esito: 'accettato' }), true);
  });
});

describe('Le non conformità', () => {
  it('un respinto apre una NC verso il fornitore, con quantità e decisione', () => {
    const a = app();
    const c = arriva(a, 100);
    a.eval(`qcSetCheck(${JSON.stringify(c.id)}, 'k1', '19.5')`);
    esito(a, c.id, { esito: 'respinto', qtyKo: 30, destino: 'sostituzione' });
    const nc = J(a, 'ncTutte()');
    assert.equal(nc.length, 1);
    assert.match(nc[0].number, /^NC-\d{4}-\d{3}$/);
    assert.equal(nc[0].supplierId, 's1');
    assert.equal(nc[0].qty, 30);
    assert.equal(nc[0].decision, 'reso');
    assert.equal(nc[0].cause, 'Fuori tolleranza dimensionale');
    assert.match(nc[0].description, /Diametro/);
    assert.equal(a.eval(`ncDiCollaudo(${JSON.stringify(c.id)}).id`), nc[0].id);
  });

  it('una deroga ne apre una, un accettato no', () => {
    const a = app(base({ piani: [piano({ characteristics: [] })] }));
    esito(a, arriva(a, 10).id, { esito: 'accettato' });
    assert.equal(a.eval('ncTutte().length'), 0);
    esito(a, arriva(a, 10).id, { esito: 'deroga' });
    assert.equal(a.eval('ncTutte()[0].decision'), 'deroga');
  });

  it('finché è aperta il fornitore si collauda al 100%', () => {
    const a = app(base({ piani: [piano({ sampling: 'fisso', sampleQty: 5, characteristics: [] })] }));
    esito(a, arriva(a, 50).id, { esito: 'deroga' });
    const r = arriva(a, 50);
    assert.equal(r.planState, 'rinforzato');
    assert.equal(r.sampleSize, 50);
    const nc = a.eval('ncTutte()[0].id');
    a.eval(`ncSet(${JSON.stringify(nc)}, 'cause', 'Altro'); ncChiudi(${JSON.stringify(nc)})`);
    esito(a, r.id, { esito: 'accettato' });
    assert.equal(arriva(a, 50).planState, 'normale');
  });

  it('si chiude solo con decisione e causa', () => {
    const a = app(makeDb({ settings: { modules: { qualita: true } } }));
    const x = a.eval('JSON.stringify(ncCrea({ source: "interna", description: "Bava sul pezzo" }))');
    const id = JSON.stringify(JSON.parse(x).id);
    assert.equal(a.eval(`ncChiudi(${id})`), false, 'senza decisione');
    a.eval(`ncSet(${id}, 'decision', 'rilavorazione')`);
    assert.equal(a.eval(`ncChiudi(${id})`), false, 'senza causa');
    a.eval(`ncSet(${id}, 'cause', 'Errore di lavorazione')`);
    assert.equal(a.eval(`ncChiudi(${id})`), true);
    assert.equal(a.eval(`ncGet(${id}).status`), 'chiusa');
    assert.equal(a.eval(`ncSet(${id}, 'cost', '50')`), false, 'chiusa non si cambia');
  });

  it('scaduta: oltre la data, o con un\'azione oltre la sua; e il Riepilogo lo dice', () => {
    const a = app(makeDb({ settings: { modules: { qualita: true } } }));
    const id = JSON.stringify(JSON.parse(a.eval('JSON.stringify(ncCrea({ description: "x" }))')).id);
    assert.equal(a.eval('ncScadute().length'), 0);
    a.eval(`ncAzioneAggiungi(${id}); ncAzioneSet(${id}, ncGet(${id}).actions[0].id, 'due', '2000-01-01')`);
    assert.equal(a.eval('ncScadute().length'), 1);
    assert.ok(a.eval('JSON.stringify(homeSegnali())').includes('non conformità scaduta'));
    a.eval(`ncAzioneSet(${id}, ncGet(${id}).actions[0].id, 'done', true)`);
    assert.equal(a.eval('ncScadute().length'), 0);
  });

  it('l\'officina la apre registrando il respinto, ma non la lavora', () => {
    const a = app();
    const c = arriva(a, 100);
    a.asRole('officina');
    assert.equal(esito(a, c.id, { esito: 'respinto', qtyKo: 10, destino: 'scarto' }), true);
    const nc = J(a, 'ncTutte()[0]');
    assert.equal(nc.decision, 'rottamazione');
    assert.equal(a.eval(`ncSet(${JSON.stringify(nc.id)}, 'cost', '10')`), false);
    a.asRole('acquisti');
    assert.equal(a.eval(`ncSet(${JSON.stringify(nc.id)}, 'cost', '10')`), true);
  });
});

describe('La valutazione dei fornitori', () => {
  const ieri = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };
  it('qualità dai lotti, puntualità dalle date, classe dalle soglie', () => {
    const a = app(base({ piani: [piano({ sampling: 'fisso', characteristics: [] })], confermata: '2999-12-31' }));
    esito(a, arriva(a, 10).id, { esito: 'accettato' });
    esito(a, arriva(a, 10).id, { esito: 'accettato' });
    esito(a, arriva(a, 10).id, { esito: 'respinto', qtyKo: 10, destino: 'accredito' });
    const v = J(a, 'qcValutaFornitore("s1")');
    assert.equal(v.lotti, 3);
    assert.equal(v.respinti, 1);
    assert.equal(v.qualita, 67);
    assert.equal(v.ppm, Math.round(10 / 30 * 1e6));
    assert.equal(v.arrivi, 3);
    assert.equal(v.puntualita, 100);
    assert.equal(v.punteggio, Math.round((67 * 60 + 100 * 40) / 100));
    assert.equal(v.classe, 'B');
  });

  it('una riga oltre la data e ancora aperta conta come ritardo', () => {
    const a = app(base({ piani: [piano({ characteristics: [] })], confermata: ieri() }));
    const v = J(a, 'qcValutaFornitore("s1")');
    assert.equal(v.ritardiAperti, 1);
    assert.equal(v.puntualita, 0);
    assert.equal(v.classe, 'C');
  });

  it('senza dati niente classe, invece di una inventata', () => {
    const a = app();
    assert.equal(a.eval('qcValutaFornitore("s2").classe'), '');
    assert.equal(a.eval('qcClassiIndice().has("s2")'), false);
  });
});

describe('Le viste', () => {
  it('piani, non conformità e valutazione si disegnano', () => {
    const a = app();
    const c = arriva(a, 100);
    esito(a, c.id, { esito: 'respinto', qtyKo: 5, destino: 'sostituzione' });
    a.eval('setView("pianiqc"); pqApri("p1")');
    assert.match(a.html('view-pianiqc'), /Caratteristiche da verificare/);
    assert.match(a.html('view-pianiqc'), /lettera/);
    a.eval('setView("nc"); ncApri(ncTutte()[0].id)');
    assert.match(a.html('view-nc'), /Analisi e decisione/);
    a.eval('setView("fornitoriqc")');
    assert.match(a.html('view-fornitoriqc'), /SKF/);
    a.eval(`setView("collaudi"); qcApri(${JSON.stringify(c.id)})`);
    assert.match(a.html('view-collaudi'), /Il controllo/);
    assert.match(a.html('view-collaudi'), /NC-\d{4}-\d{3}/);
  });

  it('il gruppo Qualità c\'è solo col modulo acceso', () => {
    const acceso = app();
    assert.deepEqual(J(acceso, 'navGroups().map(g => g.id)').includes('quality'), true);
    const db = base(); db.settings.modules.qualita = false;
    const spento = app(db);
    assert.deepEqual(J(spento, 'navGroups().map(g => g.id)').includes('quality'), false);
  });
});
