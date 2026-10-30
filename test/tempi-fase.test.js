// Attrezzaggio, coda e trasporto sulla fase del ciclo (dalla 0.131.0).
//
// Prima l'attrezzaggio e la coda erano del centro e il trasporto del
// fornitore: uguali per tutte le fasi. Ora sono della fase, e centro e
// fornitore li propongono. La migrazione copia sulle fasi i valori di prima,
// e nessuna data deve cambiare.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, parte, wc } = require('./fixtures.js');

const op = o => Object.assign({ kind: 'op', supplierId: '', costMode: 'orario', rate: 40, cost: 0, hours: 1, days: 0, note: '' }, o);
function app(cycle, over) {
  const a = loadApp({ silent: true });
  a.asRole('admin');
  a.setDb(makeDb(Object.assign({
    suppliers: [{ id: 'beta', name: 'Beta', active: true, transitDays: 2 }],
    workCenters: [
      Object.assign(wc('tor', 40), { hoursPerDay: 8, setupHours: 4, queueDays: 1 }),
      Object.assign(wc('zin', 30), {}),
    ],
    items: [parte('p', { cycle: cycle || [
      op({ workCenterId: 'tor', hours: 0.5 }),
      op({ workCenterId: 'zin', supplierId: 'beta', costMode: 'fisso', cost: 2, hours: 0, days: 3 }),
      op({ workCenterId: 'zin', supplierId: 'beta', costMode: 'fisso', cost: 1, hours: 0, days: 1 }),
    ] })],
    plans: [{ id: 'pl', number: 'FAB-1', title: '', date: '2026-11-02', notes: '', active: true,
      lines: [{ id: 'l1', itemId: 'p', qty: 40, dueDate: '2026-11-27' }] }],
  }, over || {})));
  a.eval("db.settings.calendar = calDefault(); invalidateCaches();");
  return a;
}
const ev = (a, code) => JSON.parse(a.eval(`JSON.stringify(${code})`));

describe('Tempi sulla fase: migrazione', () => {
  it('copia sulle fasi i valori di centro e fornitore', () => {
    const a = app();
    a.eval('migrateDB()');
    const c = ev(a, "getItem('p').cycle.map(r => [r.setupHours, r.queueDays, r.transitDays])");
    assert.deepEqual(c, [[4, 1, 0], [0, 0, 2], [0, 0, 2]]);
  });
  it('le date del fabbisogno non cambiano', () => {
    const a = app();
    const prima = ev(a, "schedPart(getItem('p'), 40, '2026-11-27')");
    a.eval('migrateDB(); invalidateCaches()');
    const dopo = ev(a, "schedPart(getItem('p'), 40, '2026-11-27')");
    assert.deepEqual(dopo.fasi.map(f => [f.start, f.end]), prima.fasi.map(f => [f.start, f.end]));
    assert.equal(dopo.start, prima.start);
  });
  it('una fase che ha già i suoi valori li tiene', () => {
    const a = app([op({ workCenterId: 'tor', setupHours: 0.5, queueDays: 0 })]);
    a.eval('migrateDB()');
    assert.deepEqual(ev(a, "[getItem('p').cycle[0].setupHours, getItem('p').cycle[0].queueDays]"), [0.5, 0]);
  });
});

describe('Tempi sulla fase: calcolo', () => {
  it('due fasi sullo stesso centro con attrezzaggi diversi durano diverso', () => {
    const a = app();
    // 20 pezzi a 0,5 h = 10 h; con 2 h di attrezzaggio 12 h = 2 gg, con 7 h 17 h = 3 gg.
    assert.equal(a.eval("internalOpDays({ workCenterId: 'tor', hours: 0.5, setupHours: 2, queueDays: 0 }, 20)"), 2);
    assert.equal(a.eval("internalOpDays({ workCenterId: 'tor', hours: 0.5, setupHours: 7, queueDays: 0 }, 20)"), 3);
  });
  it('senza il campo la fase vale il centro', () => {
    const a = app();
    // 4 h del centro + 10 h = 14 h = 2 gg, più 1 di coda del centro.
    assert.equal(a.eval("internalOpDays({ workCenterId: 'tor', hours: 0.5 }, 20)"), 3);
  });
  it('il trasporto scritto sulla fase vince su quello del fornitore', () => {
    const a = app();
    assert.equal(a.eval("runLeadDays([{ supplierId: 'beta', days: 3, transitDays: 5 }])"), 8);
    assert.equal(a.eval("runLeadDays([{ supplierId: 'beta', days: 3 }])"), 5);
  });
  it('in una tratta di più fasi il trasporto si conta una volta, dalla prima', () => {
    const a = app();
    assert.equal(a.eval("runLeadDays([{ supplierId: 'beta', days: 3, transitDays: 1 }, { supplierId: 'beta', days: 1, transitDays: 9 }])"), 5);
  });
  it('il carico centri porta l attrezzaggio una volta per lotto', () => {
    const a = app([op({ workCenterId: 'tor', hours: 0.5, setupHours: 3, queueDays: 0 })]);
    const load = ev(a, "mrpExplodePlan(getPlan('pl')).load");
    const tot = load.reduce((s, e) => s + e.hours, 0);
    assert.equal(tot, 40 * 0.5 + 3);
    assert.equal(load[0].voci[0].setup, 3);
  });
  it('l attrezzaggio orario costa una volta, e non entra nel costo per pezzo', () => {
    const a = app([op({ workCenterId: 'tor', hours: 0.5, setupHours: 3, rate: 40 })]);
    assert.equal(a.eval("costoAttrezzaggio(getItem('p').cycle[0])"), 120);
    assert.equal(a.eval("cycleRowCost(getItem('p').cycle[0])"), 20);
    assert.equal(a.eval("costoAttrezzaggio(Object.assign({}, getItem('p').cycle[0], { costMode: 'fisso' }))"), 0);
  });
});

describe('Tempi sulla fase: ODP e capacità finita', () => {
  it('l ordine di produzione congela attrezzaggio, coda e trasporto', () => {
    const a = app();
    a.eval('migrateDB()');
    a.eval(`(() => { const o = odpNew(getItem('p'), 10, '2026-11-27'); db.prodOrders.push(o); window.__o = o.id; })()`);
    const f = ev(a, "getOdp(window.__o).phases.map(f => [f.setupHours, f.queueDays, f.transitDays])");
    assert.deepEqual(f, [[4, 1, 0], [0, 0, 2], [0, 0, 2]]);
    // Cambiare il centro dopo non tocca l'ordine.
    a.eval("getWorkCenter('tor').setupHours = 9; getItem('p').cycle[0].setupHours = 9");
    assert.equal(a.eval("getOdp(window.__o).phases[0].setupHours"), 4);
  });
  it('le fasi dopo la prima di un ODP appena lanciato hanno le loro ore', () => {
    const a = app([
      op({ workCenterId: 'tor', hours: 0.25, setupHours: 2, queueDays: 0 }),
      op({ workCenterId: 'tor', hours: 0.5, setupHours: 1, queueDays: 0 }),
    ]);
    a.eval(`(() => { db.settings.modules = { capacita: true }; oggiISO = () => '2026-11-02';
      const o = odpNew(getItem('p'), 40, '2026-11-27'); db.prodOrders.push(o); window.__o = o.id; opLancia(o.id); invalidateCaches(); })()`);
    const f = ev(a, "getOdp(window.__o).phases.map(f => capFase(f.id))");
    assert.equal(f[0].ore, 12);
    assert.equal(f[1].ore, 21);
    // 12 h a 8 al giorno: lun 2 e mar 3; poi 21 h: mer 4, gio 5, ven 6.
    assert.deepEqual([f[0].start, f[0].end, f[1].start, f[1].end], ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-06']);
  });
  it('la coda della fase sposta l inizio anche nella capacità finita', () => {
    const a = app([op({ workCenterId: 'tor', hours: 0.25, setupHours: 0, queueDays: 2 })]);
    a.eval(`(() => { db.settings.modules = { capacita: true }; oggiISO = () => '2026-11-02';
      const o = odpNew(getItem('p'), 8, '2026-11-27'); db.prodOrders.push(o); window.__o = o.id; opLancia(o.id); invalidateCaches(); })()`);
    assert.equal(ev(a, "capFase(getOdp(window.__o).phases[0].id)").start, '2026-11-04');
  });
});

describe('Tempi sulla fase: valori proposti', () => {
  it('cambiando il valore del centro si aggiornano solo le fasi che avevano quello di prima', () => {
    const a = app([
      op({ workCenterId: 'tor', setupHours: 4 }),
      op({ workCenterId: 'tor', setupHours: 1.5 }),
    ]);
    const n = a.eval("fasiAggiornaValore(r => !r.supplierId && r.workCenterId === 'tor', 'setupHours', 4, 6)");
    assert.equal(n, 1);
    assert.deepEqual(ev(a, "getItem('p').cycle.map(r => r.setupHours)"), [6, 1.5]);
  });
  it('l editor del ciclo mostra attrezzaggio e coda, e il trasporto solo sulla prima fase della tratta', () => {
    const a = app();
    a.eval("migrateDB(); openCycleFor('p')");
    const h = a.html('cyc-body');
    assert.match(h, /id="cyc-opsetup-0"/);
    assert.match(h, /id="cyc-opqueue-0"/);
    assert.match(h, /id="cyc-optransit-1"/);
    assert.match(h, /id="cyc-optransit-2"[^>]*disabled|disabled[^>]*id="cyc-optransit-2"/);
    a.eval("document.getElementById('cyc-opsetup-0').value = '2.5'; updateCycleRow(0)");
    assert.equal(a.eval("getItem('p').cycle[0].setupHours"), 2.5);
    a.eval("document.getElementById('cyc-optransit-1').value = '4'; updateCycleRow(1)");
    assert.equal(a.eval("getItem('p').cycle[1].transitDays"), 4);
  });
});
