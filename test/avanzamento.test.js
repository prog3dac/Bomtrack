// Avanzamento: il Gantt del piano con quello che è successo davvero.
//
// Le proprietà che contano:
//   1. il programma è quello del Gantt: stesse date, nodo per nodo;
//   2. l'avanzamento si legge dai documenti del piano — ricevuto sugli ordini,
//      pezzi dichiarati sulle fasi dell'ODP, rientri sugli ODL — e lo stato ne
//      segue: fatto, in corso, in ritardo, da fare, da magazzino;
//   3. senza documento la vista non inventa: un montaggio senza ODP è
//      «previsto», un acquisto che il magazzino copre è «da magazzino»;
//   4. la vista non scrive niente.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq, parte, asm, comp, wc } = require('./fixtures.js');

const fase = (wcId, supplierId) => ({ kind: 'op', workCenterId: wcId, supplierId: supplierId || null,
  costMode: 'fisso', cost: 3, hours: 0.5, days: supplierId ? 3 : 0, note: '' });

// Una macchina con un commerciale e una parte a due fasi, una interna e una
// dal terzista. `giorni` è la distanza della consegna da oggi.
function app(giorni) {
  const a = loadApp({ silent: true });
  a.asRole('admin');
  a.setDb(makeDb({
    suppliers: [{ id: 'beta', name: 'Beta', active: true }, { id: 's1', name: 'SKF', active: true }],
    workCenters: [wc('tor', 40), wc('zin', 30)],
    items: [
      asm('mac', 'macchina', { components: [comp('c1', 4), comp('p1', 2)] }),
      acq('c1', 5),
      parte('p1', { cycle: [fase('tor'), fase('zin', 'beta')] }),
    ],
    movements: [],
    plans: [],
  }));
  a.eval(`db.plans.push({ id: 'pl1', number: 'FAB-2026-001', title: 'Prova', date: oggiISO(), notes: '', active: true, jobId: null,
    lines: [{ id: 'l1', itemId: 'mac', qty: 1, dueDate: addDays(oggiISO(), ${giorni}) }] }); saveDB();`);
  return a;
}
const modello = a => JSON.parse(a.eval(`(function(){ const m = avzModello('pl1');
  return JSON.stringify({ conteggi: m.conteggi, righe: m.righe.map(r => ({ code: r.item.code, tipo: r.tipo, stato: r.stato,
    fatto: r.fatto, totale: r.totale, start: r.start, end: r.end, docs: r.docs.map(d => d.number + ' ' + d.testo), nota: r.nota })) }); })()`));
const riga = (m, code, tipo) => m.righe.find(r => r.code === code && (!tipo || r.tipo === tipo));
function ordine(a, stato, qty, consegna) {
  a.eval(`db.orders.push({ id: 'o1', number: 'ODA-2026-001', status: '${stato}', supplierId: 's1', planId: 'pl1', active: true, date: oggiISO(),
    lines: [{ id: 'ol1', itemId: 'c1', code: 'C1', description: 'c1', uom: 'pz', qty: ${qty}, price: 5, received: 0, deliveryDate: ${consegna} }] }); saveDB();`);
}
function lanciaOdp(a) {
  a.eval(`(function () {
    const part = getItem('p1');
    db.prodOrders.push({ id: 'odp1', number: 'ODP-2026-001', itemId: 'p1', code: 'P1', name: part.name, uom: 'pz', qty: 2,
      date: oggiISO(), dueDate: addDays(oggiISO(), 50), status: 'bozza', title: '', notes: '', notesInternal: '',
      planId: 'pl1', jobId: null, phases: opFreezePhases(part), materials: [], active: true });
    invalidateCaches(); opLancia('odp1');
  })()`);
}

describe('Avanzamento: il programma è quello del Gantt', () => {
  it('una riga per tappa, con le date dell\'albero del programma', () => {
    const a = app(60);
    const m = modello(a);
    assert.deepEqual(m.righe.map(r => r.code + ':' + r.tipo), ['MAC:asm', 'C1:buy', 'P1:int', 'P1:est']);
    const albero = JSON.parse(a.eval(`(function(){ const f = planFeasibility(getPlan('pl1'))[0];
      return JSON.stringify(schedFlat(f.tree).map(x => [x.node.start, x.node.end])); })()`));
    assert.deepEqual([riga(m, 'MAC').start, riga(m, 'MAC').end], albero[0]);
    assert.deepEqual([riga(m, 'C1').start, riga(m, 'C1').end], albero[1]);
  });
});

describe('Avanzamento: la sequenza delle righe', () => {
  it('il materiale del ciclo viene prima delle fasi della sua parte (0.111.0)', () => {
    const a = app(60);
    a.eval(`getItem('p1').cycle.unshift({ kind: 'item', itemId: 'tondo', qty: 1 });
      db.items.push(Object.assign(${JSON.stringify({})}, getItem('c1'), { id: 'tondo', code: 'TONDO', name: 'tondo' }));
      invalidateCaches();`);
    const m = modello(a);
    assert.deepEqual(m.righe.map(r => r.code + ':' + r.tipo), ['MAC:asm', 'C1:buy', 'TONDO:buy', 'P1:int', 'P1:est']);
  });
});

describe('Avanzamento: gli acquisti', () => {
  it('senza ordine e in tempo è da fare; ordinato è in corso; ricevuto è fatto', () => {
    const a = app(60);
    assert.equal(riga(modello(a), 'C1').stato, 'da fare');
    ordine(a, 'inviato', 4, 'addDays(oggiISO(), 20)');
    const r = riga(modello(a), 'C1');
    assert.equal(r.stato, 'corso');
    assert.equal(r.totale, 4);
    assert.match(r.docs[0], /^ODA-2026-001 Inviato · 0\/4/);
    a.eval("db.orders[0].lines[0].received = 4; saveDB();");
    assert.equal(riga(modello(a), 'C1').stato, 'fatto');
  });

  it('un arrivo atteso oltre la data del programma è un ritardo, anche se oggi è presto', () => {
    const a = app(60);
    ordine(a, 'inviato', 4, 'addDays(oggiISO(), 80)');
    assert.equal(riga(modello(a), 'C1').stato, 'ritardo');
  });

  it('un acquisto che il magazzino copre è da magazzino, non da fare', () => {
    const a = app(60);
    a.eval("addMovement('c1', 'carico', 100, '')");
    const r = riga(modello(a), 'C1');
    assert.equal(r.stato, 'coperto');
    assert.equal(r.docs.length, 0);
  });

  it('un ordine annullato non conta', () => {
    const a = app(60);
    ordine(a, 'annullato', 4, 'addDays(oggiISO(), 20)');
    assert.equal(riga(modello(a), 'C1').stato, 'da fare');
  });

  it('scaduta la data d\'ordine senza ordine, è in ritardo', () => {
    const a = app(-5);
    assert.equal(riga(modello(a), 'C1').stato, 'ritardo');
  });
});

describe('Avanzamento: le fasi dell\'ordine di produzione', () => {
  it('ogni tappa segue le sue fasi: dichiarata fatta, avviata in corso', () => {
    const a = app(60);
    lanciaOdp(a);
    let m = modello(a);
    assert.equal(riga(m, 'P1', 'int').stato, 'da fare');
    assert.match(riga(m, 'P1', 'int').docs[0], /^ODP-2026-001 fase 10 · 0\/2 · ferma qui/);
    a.eval("(function(){ const o = getOdp('odp1'); opAvvia('odp1', o.phases[0].id, {}); })()");
    assert.equal(riga(modello(a), 'P1', 'int').stato, 'corso');
    a.eval("(function(){ const o = getOdp('odp1'); opDichiara('odp1', o.phases[0].id, { qty: 2 }); })()");
    m = modello(a);
    assert.equal(riga(m, 'P1', 'int').stato, 'fatto');
    assert.equal(riga(m, 'P1', 'int').fatto, 2);
    assert.match(riga(m, 'P1', 'est').docs[0], /fase 20 · 0\/2 · ferma qui/);
  });

  it('la tratta dal terzista mostra anche il suo ordine di lavoro', () => {
    const a = app(60);
    lanciaOdp(a);
    a.eval(`(function(){ const o = getOdp('odp1');
      opAvvia('odp1', o.phases[0].id, {}); opDichiara('odp1', o.phases[0].id, { qty: 2 });
      opGeneraOdl('odp1', o.phases[1].id); })()`);
    const docs = riga(modello(a), 'P1', 'est').docs;
    assert.equal(docs.length, 2);
    assert.match(docs[1], /^ODL-\d{4}-\d+ Bozza · rientrati 0\/2/);
  });

  it('senza ordine di produzione la tappa lo dice', () => {
    const a = app(60);
    const r = riga(modello(a), 'P1', 'int');
    assert.equal(r.stato, 'da fare');
    assert.equal(r.nota, 'Nessun ordine di produzione');
  });
});

describe('Avanzamento: quello che non si registra non si inventa', () => {
  it('il montaggio senza ODP è previsto', () => {
    const a = app(60);
    const r = riga(modello(a), 'MAC');
    assert.equal(r.stato, 'previsto');
    assert.match(r.nota, /Nessun montaggio dichiarato/);
  });
  it('il montaggio dichiarato sul piano dice a che punto è (dalla 0.100.0)', () => {
    const a = app(60);
    a.eval("montaggioDichiara('pl1', 'mac', 1)");
    const r = riga(modello(a), 'MAC');
    assert.equal(r.stato, 'fatto');
    assert.match(r.nota, /Montati/);
  });
});

describe('Avanzamento: la vista', () => {
  it('si apre da Pianificazione, disegna una riga per tappa e non scrive niente', () => {
    const a = app(60);
    ordine(a, 'inviato', 4, 'addDays(oggiISO(), 20)');
    lanciaOdp(a);
    const prima = a.eval('JSON.stringify(db)');
    a.eval("setView('avz')");
    const h = a.html('view-avz');
    assert.equal(a.eval("groupOfView('avz').label"), 'Pianificazione');
    assert.match(h, /ODA-2026-001/);
    assert.match(h, /ODP-2026-001/);
    assert.equal((h.match(/class="avz-svg"/g) || []).length, 4);
    assert.equal(a.eval('JSON.stringify(db)'), prima);
  });

  it('senza piani lo dice', () => {
    const a = app(60);
    a.eval("db.plans = []; saveDB(); setView('avz')");
    assert.match(a.html('view-avz'), /Nessun piano aperto/);
  });

  it('l\'export ha una riga per tappa', () => {
    const a = app(60);
    a.eval("setView('avz')");
    assert.equal(a.eval('avzExportSpec().sezioni[0].righe.length'), 4);
  });

  it('cliccare un documento apre il documento', () => {
    const a = app(60);
    ordine(a, 'inviato', 4, 'addDays(oggiISO(), 20)');
    a.eval("setView('avz'); avzApriDoc('order', 'o1')");
    assert.equal(a.eval('activeView'), 'orders');
    assert.equal(a.eval('currentOrderId'), 'o1');
  });
});
