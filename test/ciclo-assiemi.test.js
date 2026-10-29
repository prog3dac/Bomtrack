// Il ciclo di macchine, gruppi e sottogruppi (dalla 0.124.0): le lavorazioni
// di montaggio sono fasi come quelle di una parte, e un assieme con un ciclo
// si lancia con un ordine di produzione che preleva i componenti della
// distinta.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq, asm, comp, wc } = require('./fixtures.js');

const fase = (o) => Object.assign({ kind: 'op', itemId: null, workCenterId: 'mon', supplierId: null,
  costMode: 'orario', hours: 2, rate: 30, days: 0, note: '' }, o || {});

// Un gruppo con due viti e un sottogruppo; il gruppo ha una fase interna di
// montaggio (2 h a 30 €/h) e un collaudo dal terzista a costo fisso.
function app(over) {
  const o = over || {};
  const a = loadApp({ silent: true });
  a.setDb(makeDb({
    suppliers: [{ id: 'beta', name: 'Beta', transitDays: 0, active: true }],
    workCenters: [Object.assign(wc('mon', 30), { hoursPerDay: 8 }), wc('col', 20)],
    items: [
      acq('vite', 5),
      asm('sub', 'sottogruppo', { components: [comp('vite', 1)] }),
      asm('grp', 'gruppo', Object.assign({ components: [comp('vite', 2), comp('sub', 1)],
        cycle: o.cycle || [fase(), fase({ workCenterId: 'col', supplierId: 'beta', costMode: 'fisso', cost: 15, hours: 0, days: 2 })] }, o.grp || {})),
    ],
    plans: [{ id: 'pl', number: 'FAB-1', title: '', date: '2026-10-01', notes: '', active: true,
      lines: [{ id: 'l1', itemId: 'grp', qty: 2, dueDate: '2026-11-20' }] }],
    settings: Object.assign({ calendar: { workDays: [0, 1, 2, 3, 4, 5, 6], holidays: [], closures: [], easter: false } }, o.settings || {}),
  }));
  a.asRole('admin');
  a.eval("oggiISO = () => '2026-10-28'; if (typeof calInvalidate === 'function') calInvalidate()");
  return a;
}
const js = (a, expr) => JSON.parse(a.eval(`JSON.stringify(${expr})`));

describe('Ciclo di un assieme: migrazione', () => {
  it('le vecchie lavorazioni diventano fasi a costo orario, con la tariffa del centro', () => {
    const a = app({ cycle: [], grp: { operations: [{ workCenterId: 'mon', hours: 3, note: 'banco' }] } });
    const prima = a.eval("costOf('grp').total");
    a.eval('migrateDB()');
    const g = js(a, "getItem('grp')");
    assert.equal(g.operations.length, 0);
    assert.equal(g.cycle.length, 1);
    assert.equal(g.cycle[0].costMode, 'orario');
    assert.equal(g.cycle[0].rate, 30);
    assert.equal(g.cycle[0].note, 'banco');
    a.eval('invalidateCaches()');
    approx(a.eval("costOf('grp').total"), prima, 'il costo non cambia');
  });
  it('rifatta due volte, non raddoppia le fasi', () => {
    const a = app({ cycle: [], grp: { operations: [{ workCenterId: 'mon', hours: 3, note: '' }] } });
    a.eval('migrateDB(); migrateDB()');
    assert.equal(a.eval("getItem('grp').cycle.length"), 1);
  });
  it('anche senza migrazione le lavorazioni vecchie si leggono come fasi', () => {
    const a = app({ cycle: [], grp: { operations: [{ workCenterId: 'mon', hours: 3, note: '' }] } });
    assert.equal(a.eval("cicloFasi(getItem('grp')).length"), 1);
    approx(a.eval("costOf('grp').labor"), 3 * 30 + 5 * 0, 'ore × tariffa');
  });
  it('l impronta di una macchina modello non cambia passando al ciclo', () => {
    const a = app({ cycle: [], grp: { operations: [{ workCenterId: 'mon', hours: 3, note: 'x' }] } });
    const prima = a.eval("varFirma(getItem('grp'))");
    a.eval('migrateDB()');
    assert.equal(a.eval("varFirma(getItem('grp'))"), prima);
  });
});

describe('Ciclo di un assieme: costo e fabbisogno', () => {
  it('ogni fase costa come una riga di ciclo: orario e fisso, interna o in conto lavoro', () => {
    const a = app();
    // viti 2 × 5 + sottogruppo 5 + montaggio 2 h × 30 + collaudo 15
    approx(a.eval("costOf('grp').labor"), 75);
    approx(a.eval("costOf('grp').total"), 90);
  });
  it('la fase interna carica il suo centro con il numero di fase', () => {
    const a = app();
    const load = js(a, "mrpExplodePlan(getPlan('pl')).load.filter(e => e.workCenterId === 'mon').map(e => ({ h: e.hours, f: e.voci[0].faseNo }))");
    assert.equal(load.length, 1);
    approx(load[0].h, 4, '2 h per due gruppi');
    assert.equal(load[0].f, 10);
  });
  it('la fase dal terzista è conto lavoro da commissionare, con rientro prima della consegna', () => {
    const a = app();
    const f = js(a, "mrpExplodePlan(getPlan('pl')).phases.map(p => ({ item: p.item.id, sup: p.supplierId, due: p.due, start: p.start, qty: p.qty }))");
    assert.equal(f.length, 1);
    assert.equal(f[0].item, 'grp');
    assert.equal(f[0].sup, 'beta');
    assert.equal(f[0].qty, 2);
    assert.equal(f[0].due, '2026-11-20');
    assert.equal(f[0].start, '2026-11-18', 'due giorni dal terzista');
  });
  it('il montaggio comincia con la prima fase, e i componenti servono da lì', () => {
    const a = app();
    const e = js(a, "mrpExplodePlan(getPlan('pl')).asm.find(x => x.item.id === 'grp')");
    // collaudo dal 18 al 20, montaggio 4 h = un giorno: dal 17
    assert.equal(e.start, '2026-11-17');
  });
  it('con i giorni dichiarati il montaggio resta un blocco solo', () => {
    const a = app({ grp: { assemblyDays: 5 } });
    const e = js(a, "mrpExplodePlan(getPlan('pl')).asm.find(x => x.item.id === 'grp')");
    assert.equal(e.start, '2026-11-15');
  });
  it('l assieme con un ciclo si lancia con un ordine di produzione; senza ciclo no', () => {
    const a = app();
    const righe = js(a, "mrpMakeRows(getPlan('pl')).map(r => ({ id: r.item.id, asm: r.isAsm, n: r.nFasi, q: r.qtyOrder }))");
    assert.deepEqual(righe, [{ id: 'grp', asm: true, n: 2, q: 2 }]);
  });
  it('senza Produzione interna nessun ordine di produzione, anche per gli assiemi', () => {
    const a = app({ settings: { modules: { produzione: false } } });
    assert.equal(a.eval("mrpMakeRows(getPlan('pl')).length"), 0);
  });
});

describe('Ordine di produzione di un assieme', () => {
  function lanciato() {
    const a = app();
    a.eval(`(() => { const o = odpNew(getItem('grp'), 2, '2026-11-20', { planId: 'pl' }); db.prodOrders.push(o); window.__o = o.id; opLancia(o.id); })()`);
    return a;
  }
  it('le fasi sono quelle del ciclo, il materiale i componenti diretti a magazzino', () => {
    const a = lanciato();
    const o = js(a, 'getOdp(window.__o)');
    assert.deepEqual(o.phases.map(f => [f.seq, f.workCenterId, f.supplierId || '']), [[10, 'mon', ''], [20, 'col', 'beta']]);
    assert.deepEqual(o.materials.map(m => [m.itemId, m.qty]), [['vite', 4]], 'il sottogruppo si monta col suo ordine');
  });
  it('all avvio della prima fase escono i componenti; alla fine gli assiemi montati contano come fatti', () => {
    const a = lanciato();
    a.eval("(() => { const o = getOdp(window.__o); opAvvia(o.id, o.phases[0].id); opDichiara(o.id, o.phases[0].id, { qty: 2 }); opAvvia(o.id, o.phases[1].id); opDichiara(o.id, o.phases[1].id, { qty: 2 }); })()");
    assert.equal(a.eval("db.movements.filter(m => m.itemId === 'vite' && m.kind === 'scarico').reduce((s, m) => s + m.qty, 0)"), -4);
    assert.equal(a.eval("db.movements.filter(m => m.itemId === 'grp').length"), 0, 'un assieme non ha giacenza');
    assert.equal(a.eval('opVersato(getOdp(window.__o))'), 2);
    assert.equal(a.eval("prodottiDi('pl', 'grp')"), 2);
    assert.equal(a.eval("getOdp(window.__o).status"), 'completato');
  });
  it('con un ordine nel piano il montaggio non si dichiara una seconda volta', () => {
    const a = lanciato();
    assert.equal(a.eval("montaggioDichiara('pl', 'grp', 2)"), null);
    assert.equal(a.eval('db.productions.length'), 0);
  });
  it('dal piano, una riga lanciata non si ripropone', () => {
    const a = lanciato();
    assert.equal(a.eval("mrpMakeRows(getPlan('pl'))[0].qtyOrder"), 0);
  });
  it('le fasi interne vanno in reparto e nella coda a capacità finita', () => {
    const a = lanciato();
    a.eval("(() => { db.settings.modules = { officina: true, capacita: true }; const o = getOdp(window.__o); opAvvia(o.id, o.phases[0].id); invalidateCaches(); })()");
    assert.deepEqual(Array.from(a.eval("repartoFasi('mon').map(x => x.o.id)")), [a.eval('window.__o')]);
    assert.ok(a.eval("!!capFase(getOdp(window.__o).phases[0].id)"));
  });
});

describe('Ciclo di un assieme: interfaccia', () => {
  it('la vista Cicli apre un assieme, senza la distinta parte', () => {
    const a = app();
    a.eval("openCycleFor('grp')");
    const h = a.html('cyc-body');
    assert.match(h, /Ciclo di montaggio/);
    assert.doesNotMatch(h, /Distinta parte/);
  });
  it('la distinta mostra il ciclo in sola lettura, con il link al ciclo', () => {
    const a = app();
    a.eval("currentBomId = 'grp'; setView('bom')");
    const h = a.html('bom-tree');
    assert.match(h, /Ciclo di montaggio/);
    assert.match(h, /openCycleFor\('grp'\)/);
    assert.doesNotMatch(h, /editOperationModal|delOperation/);
    assert.equal(a.eval("typeof addOperationModal"), 'undefined');
  });
  it('i giorni di montaggio si dichiarano nel ciclo', () => {
    const a = app();
    a.eval("openCycleFor('grp'); document.getElementById('cyc-asmdays').value = '4'; saveCycleAsmDays()");
    assert.equal(a.eval("getItem('grp').assemblyDays"), 4);
  });
});

describe('Operatori sulla fase', () => {
  it('i giorni sono le ore divise per le ore di un operatore per gli operatori', () => {
    const a = app();
    // 80 h, 2 operatori da 8 h: 5 giorni; da soli 10.
    assert.equal(a.eval("internalOpDays(getWorkCenter('mon'), 80, 1, 2)"), 5);
    assert.equal(a.eval("internalOpDays(getWorkCenter('mon'), 80, 1)"), 10);
  });
  it('le ore al giorno a zero sono otto, non più la capacità divisa per i giorni', () => {
    const a = app();
    a.eval("Object.assign(getWorkCenter('mon'), { hoursPerDay: 0, capacityHours: 200 })");
    assert.equal(a.eval("wcHoursPerDay(getWorkCenter('mon'))"), 8);
  });
  it('il fabbisogno e l ordine di produzione usano gli operatori', () => {
    const a = app({ cycle: [fase({ hours: 16, operators: 2 })] });
    const e = js(a, "mrpExplodePlan(getPlan('pl')).asm.find(x => x.item.id === 'grp')");
    // 2 gruppi × 16 h = 32 h, a 16 h al giorno: 2 giorni prima del 20
    assert.equal(e.start, '2026-11-18');
    a.eval(`(() => { const o = odpNew(getItem('grp'), 2, '2026-11-20'); db.prodOrders.push(o); window.__o = o.id; })()`);
    assert.equal(a.eval('getOdp(window.__o).phases[0].operators'), 2);
  });
  it('nella capacità finita una fase non fa più delle ore dei suoi operatori', () => {
    const a = app({ cycle: [fase({ hours: 16, operators: 1 })] });
    a.eval(`(() => { db.settings.modules = { capacita: true }; getWorkCenter('mon').capacityHours = 280;
      const o = odpNew(getItem('grp'), 2, '2026-11-20'); db.prodOrders.push(o); window.__o = o.id; opLancia(o.id); invalidateCaches(); })()`);
    const f = js(a, "capFase(getOdp(window.__o).phases[0].id)");
    // 32 h a 8 al giorno per un operatore: quattro giorni, anche se il centro ne dà 40
    assert.equal((Date.parse(f.end) - Date.parse(f.start)) / 864e5, 3);
  });
  it('il campo Operatori si scrive dalla vista Cicli', () => {
    const a = app();
    a.eval("openCycleFor('grp'); document.getElementById('cyc-opop-0').value = '3'; updateCycleRow(0)");
    assert.equal(a.eval("getItem('grp').cycle[0].operators"), 3);
    assert.match(a.html('cyc-body'), /1 pz: 1 gg/);
  });
});
