// Avanzamento: il Gantt del piano con quello che è successo davvero.
//
// Le proprietà che contano:
//   1. il programma è quello del Gantt: stesse date, nodo per nodo;
//   2. l'avanzamento si legge dai documenti del piano — ricevuto sugli ordini,
//      pezzi dichiarati sulle fasi dell'ODP, rientri sugli ODL — e lo stato ne
//      segue, con le parole del suo tipo di riga (dalla 0.113.0): un acquisto
//      è da ordinare, ordinato, arrivato o da magazzino; una fase da
//      programmare, programmata, in lavorazione o fatta. Il ritardo si conta
//      a parte, in giorni;
//   3. senza documento la vista non inventa: un montaggio senza ODP è
//      «programmato», un acquisto che il magazzino copre è «da magazzino»;
//   4. una parte con ciclo ha una riga di testa e sotto le sue fasi;
//   5. la vista non scrive niente.

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
    fatto: r.fatto, totale: r.totale, start: r.start, end: r.end, docs: r.docs.map(d => d.number + ' ' + d.testo), nota: r.nota,
    ritardo: r.ritardo, meno: r.meno, numero: r.numero || '', label: r.label })) }); })()`));
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
    assert.deepEqual(m.righe.map(r => r.code + ':' + r.tipo), ['MAC:asm', 'C1:buy', 'P1:ciclo', 'P1:int', 'P1:est']);
    const albero = JSON.parse(a.eval(`(function(){ const f = planFeasibility(getPlan('pl1'))[0];
      return JSON.stringify(schedFlat(f.tree).map(x => [x.node.start, x.node.end])); })()`));
    assert.deepEqual([riga(m, 'MAC').start, riga(m, 'MAC').end], albero[0]);
    assert.deepEqual([riga(m, 'C1').start, riga(m, 'C1').end], albero[1]);
  });
});

describe('Avanzamento: la sequenza delle righe', () => {
  it('il materiale del ciclo sta sotto il codice, prima delle sue fasi (0.111.0, 0.113.0)', () => {
    const a = app(60);
    a.eval(`getItem('p1').cycle.unshift({ kind: 'item', itemId: 'tondo', qty: 1 });
      db.items.push(Object.assign(${JSON.stringify({})}, getItem('c1'), { id: 'tondo', code: 'TONDO', name: 'tondo' }));
      invalidateCaches();`);
    const m = modello(a);
    assert.deepEqual(m.righe.map(r => r.code + ':' + r.tipo), ['MAC:asm', 'C1:buy', 'P1:ciclo', 'TONDO:buy', 'P1:int', 'P1:est']);
  });

  it('il codice con ciclo ha le fasi sotto, col numero di fase e chi le fa (0.113.0)', () => {
    const a = app(60);
    const m = modello(a);
    const testa = riga(m, 'P1', 'ciclo');
    assert.equal(testa.label, 'ciclo di 2 fasi');
    assert.equal(testa.stato, 'da fare');
    assert.equal(riga(m, 'P1', 'int').numero, 'fase 10');
    assert.equal(riga(m, 'P1', 'est').numero, 'fase 20');
    assert.match(riga(m, 'P1', 'int').label, /· interna$/);
    assert.match(riga(m, 'P1', 'est').label, /· Beta$/);
    // La testa non si conta due volte: le due fasi da programmare, non la parte.
    assert.equal(m.conteggi['da fare'], 0);
    assert.equal(m.conteggi['da programmare'], 2);
  });
});

describe('Avanzamento: gli acquisti', () => {
  it('senza ordine è da ordinare; in bozza anche; inviato è ordinato; ricevuto è arrivato', () => {
    const a = app(60);
    assert.equal(riga(modello(a), 'C1').stato, 'da ordinare');
    ordine(a, 'bozza', 4, 'addDays(oggiISO(), 20)');
    assert.equal(riga(modello(a), 'C1').stato, 'da ordinare');
    a.eval("db.orders[0].status = 'inviato'; saveDB();");
    const r = riga(modello(a), 'C1');
    assert.equal(r.stato, 'ordinato');
    assert.equal(r.ritardo, 0);
    assert.equal(r.totale, 4);
    assert.match(r.docs[0], /^ODA-2026-001 Inviato · 0\/4/);
    a.eval("db.orders[0].lines[0].received = 4; saveDB();");
    assert.equal(riga(modello(a), 'C1').stato, 'arrivato');
  });

  it('un arrivo atteso oltre la data del programma è un ritardo, anche se oggi è presto', () => {
    const a = app(60);
    ordine(a, 'inviato', 4, 'addDays(oggiISO(), 80)');
    const r = riga(modello(a), 'C1');
    assert.equal(r.stato, 'ordinato');
    assert.ok(r.ritardo > 0, 'il ritardo si conta in giorni oltre la fine');
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
    assert.equal(riga(modello(a), 'C1').stato, 'da ordinare');
  });

  it('scaduta la data d\'ordine senza ordine, è in ritardo', () => {
    const a = app(-5);
    const m = modello(a);
    assert.equal(riga(m, 'C1').stato, 'da ordinare');
    assert.ok(riga(m, 'C1').ritardo > 0);
  });
});

describe('Avanzamento: le fasi dell\'ordine di produzione', () => {
  it('ogni tappa segue le sue fasi: lanciata programmata, avviata in lavorazione, dichiarata fatta', () => {
    const a = app(60);
    lanciaOdp(a);
    let m = modello(a);
    assert.equal(riga(m, 'P1', 'int').stato, 'programmato');
    assert.equal(riga(m, 'P1', 'ciclo').stato, 'da fare');
    assert.match(riga(m, 'P1', 'int').docs[0], /^ODP-2026-001 fase 10 · 0\/2 · ferma qui/);
    a.eval("(function(){ const o = getOdp('odp1'); opAvvia('odp1', o.phases[0].id, {}); })()");
    m = modello(a);
    assert.equal(riga(m, 'P1', 'int').stato, 'lavorazione');
    assert.equal(riga(m, 'P1', 'ciclo').stato, 'lavorazione');
    a.eval("(function(){ const o = getOdp('odp1'); opDichiara('odp1', o.phases[0].id, { qty: 2 }); })()");
    m = modello(a);
    assert.equal(riga(m, 'P1', 'int').stato, 'fatto');
    // La prima fase è finita, la seconda non è partita: i pezzi aspettano.
    assert.equal(riga(m, 'P1', 'ciclo').stato, 'attesa');
    assert.equal(riga(m, 'P1', 'int').fatto, 2);
    assert.match(riga(m, 'P1', 'est').docs[0], /fase 20 · 0\/2 · ferma qui/);
    // Dichiarata l'ultima fase, i pezzi entrano a magazzino (opDichiara) e il
    // codice è fatto.
    a.eval("(function(){ const o = getOdp('odp1'); opAvvia('odp1', o.phases[1].id, {}); opDichiara('odp1', o.phases[1].id, { qty: 2 }); })()");
    m = modello(a);
    assert.equal(riga(m, 'P1', 'est').stato, 'fatto');
    assert.equal(a.eval("opVersato(getOdp('odp1'))"), 2);
    assert.equal(riga(m, 'P1', 'ciclo').stato, 'fatto');
  });

  it('la tratta dal terzista: con il solo ODP è da programmare, con l\'ODL programmata (0.113.0)', () => {
    const a = app(60);
    lanciaOdp(a);
    assert.equal(riga(modello(a), 'P1', 'est').stato, 'da programmare');
    a.eval(`(function(){ const o = getOdp('odp1');
      opAvvia('odp1', o.phases[0].id, {}); opDichiara('odp1', o.phases[0].id, { qty: 2 });
      opGeneraOdl('odp1', o.phases[1].id); })()`);
    const r = riga(modello(a), 'P1', 'est');
    const docs = r.docs;
    assert.equal(docs.length, 2);
    assert.match(docs[1], /^ODL-\d{4}-\d+ Bozza · rientrati 0\/2/);
    assert.equal(r.stato, 'programmato');
    // Un ODL inviato non basta: in lavorazione solo con la fase In corso sull'ODP.
    a.eval("(function(){ const o = db.workOrders.find(w => w.active !== false); o.status = 'inviato'; saveDB(); })()");
    assert.equal(riga(modello(a), 'P1', 'est').stato, 'programmato');
    a.eval("(function(){ const o = getOdp('odp1'); opAvvia('odp1', o.phases[1].id, {}); })()");
    assert.equal(riga(modello(a), 'P1', 'est').stato, 'lavorazione');
  });

  it('senza ordine di produzione la tappa lo dice', () => {
    const a = app(60);
    const r = riga(modello(a), 'P1', 'int');
    assert.equal(r.stato, 'da programmare');
    assert.equal(r.nota, 'Nessun ordine di produzione');
  });
});

describe('Avanzamento: quello che non si registra non si inventa', () => {
  it('il montaggio senza ODP è programmato', () => {
    const a = app(60);
    const r = riga(modello(a), 'MAC');
    assert.equal(r.stato, 'asm-programmato');
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
    assert.equal((h.match(/class="avz-svg"/g) || []).length, 5);
    // Le fasi stanno sotto il codice, col loro numero.
    assert.match(h, /<tr class="avz-fase">\s*<td[^>]*>fase 10<\/td>/);
    // Sulle barre il riquadro è nostro, non il <title> del browser.
    assert.doesNotMatch(h, /<title>/);
    assert.match(h, /data-tip="P1 — fase 10 · /);
    assert.equal(a.eval('JSON.stringify(db)'), prima);
  });

  it('senza piani lo dice', () => {
    const a = app(60);
    a.eval("db.plans = []; saveDB(); setView('avz')");
    assert.match(a.html('view-avz'), /Nessun piano aperto/);
  });

  it('l\'export ha una riga per tappa, più la testa del codice con ciclo', () => {
    const a = app(60);
    a.eval("setView('avz')");
    assert.equal(a.eval('avzExportSpec().sezioni[0].righe.length'), 5);
  });

  it('cliccare un documento apre il documento', () => {
    const a = app(60);
    ordine(a, 'inviato', 4, 'addDays(oggiISO(), 20)');
    a.eval("setView('avz'); avzApriDoc('order', 'o1')");
    assert.equal(a.eval('activeView'), 'orders');
    assert.equal(a.eval('currentOrderId'), 'o1');
  });
});
