// Modulo Macchine utensili (dalla 0.126.0): le macchine dei centri, con la
// tariffa che si somma a quella del centro, la manutenzione e i fermi per
// macchina, la fila per macchina nella capacità finita.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

// Un centro con due torni; una parte con una fase oraria da 2 h-uomo, due
// operatori, sul primo tornio. Due ODP lanciati, il primo avviato.
function app(modules, o) {
  const x = o || {};
  const a = loadApp({ silent: true });
  const fase = (id, extra) => Object.assign({ id, seq: 10, opIndex: 0, workCenterId: 'w1', wcName: 'Tornitura', costMode: 'orario',
    hours: 1, operators: 1, rate: 30, cost: 0, machineId: 'm1', machineName: 'T01 Tornio CNC', machineRate: 20 }, extra || {});
  const db = makeDb({
    items: [acq('v1', 5), { id: 'p1', code: 'P1', name: 'Parte', type: 'parte', uom: 'pz', sourcing: 'make', active: true,
      cycle: [{ kind: 'op', workCenterId: 'w1', supplierId: '', costMode: 'orario', hours: 2, operators: 2, days: 0, rate: 30, cost: 0, note: '',
        machineId: 'm1', machineRate: 25 }] }],
    workCenters: [{ id: 'w1', name: 'Tornitura', hourlyRate: 30, hoursPerDay: 8, active: true }],
    machines: [
      { id: 'm1', code: 'T01', name: 'Tornio CNC', workCenterId: 'w1', hourlyRate: 25, hoursStart: 100, active: true },
      { id: 'm2', code: 'T02', name: 'Tornio parallelo', workCenterId: 'w1', hourlyRate: 10, hoursStart: 0, active: true }],
    prodOrders: [
      { id: 'A', number: 'ODP-A', itemId: 'p1', code: 'P1', qty: 12, status: 'corso', dueDate: '2026-11-02', active: true, phases: [fase('fa')] },
      { id: 'B', number: 'ODP-B', itemId: 'p1', code: 'P1', qty: 8, status: 'lanciato', dueDate: '2026-11-30', active: true, phases: [fase('fb', x.faseB)] },
    ],
    prodDecls: [{ id: 'd1', odpId: 'A', phaseId: 'fa', kind: 'avvio', qty: 0, scrap: 0 }],
    movements: [], timeLogs: x.timeLogs || [], maintPlans: x.maintPlans || [], maintEvents: x.maintEvents || [],
    users: [{ id: 'u1', name: 'Op', email: 'o@x.it', role: 'admin', active: true }],
    settings: { modules: Object.assign({}, modules), calendar: { workDays: [0, 1, 2, 3, 4, 5, 6], holidays: [], closures: [], easter: false } },
  });
  a.setDb(db); a.asRole('admin');
  a.eval("currentUser = db.users[0]; oggiISO = () => '2026-10-28'; if (typeof calInvalidate === 'function') calInvalidate()");
  return a;
}
const log = (id, machineId, da, a, faseId) => ({ id, odpId: 'A', phaseId: faseId || 'fa', workCenterId: 'w1', machineId, userId: 'u1',
  startedAt: '2026-10-27T' + da + ':00.000Z', endedAt: '2026-10-27T' + a + ':00.000Z', active: true });

describe('Costo della fase: operatore + macchina', () => {
  it('ore-uomo × tariffa del centro + ore macchina × tariffa della macchina', () => {
    // 2 h × 30 = 60; 2 h ÷ 2 operatori = 1 h di macchina × 25 = 25
    const a = app({ macchine: true });
    assert.equal(a.eval("cycleRowCost(getItem('p1').cycle[0])"), 85);
    assert.equal(a.eval("costOf('p1').total"), 85);
  });
  it('col modulo spento la macchina non costa', () => {
    assert.equal(app({}).eval("cycleRowCost(getItem('p1').cycle[0])"), 60);
  });
  it('a costo fisso, o dal terzista, la macchina non entra', () => {
    const a = app({ macchine: true });
    assert.equal(a.eval("cycleRowCost(Object.assign({}, getItem('p1').cycle[0], { costMode: 'fisso', cost: 7 }))"), 7);
    assert.equal(a.eval("cycleRowCost(Object.assign({}, getItem('p1').cycle[0], { supplierId: 's1' }))"), 60);
  });
  it('il tooltip dice da dove viene il costo', () => {
    const t = app({ macchine: true }).eval("costoFaseDettaglio(getItem('p1').cycle[0])");
    assert.match(t, /Operatore: 2 h × 30 = 60/);
    assert.match(t, /Macchina T01 Tornio CNC: 1 h × 25 = 25/);
  });
});

describe('Anagrafica macchine', () => {
  it('la scheda di Gestione c\'è solo col modulo acceso', () => {
    const a = app({ macchine: true });
    a.eval("setView('manage'); setMgmtTab('machines')");
    assert.match(a.html('mgmt-content'), /T01 Tornio CNC/);
    assert.match(a.html('mgmt-tabs'), /Macchine utensili/);
    const b = app({});
    b.eval("setView('manage'); setMgmtTab('machines')");
    assert.doesNotMatch(b.html('mgmt-tabs'), /Macchine utensili/);
  });
  it('si aggiunge in un centro, con la sua tariffa', () => {
    const a = app({ macchine: true });
    a.eval("document.getElementById('mac-name').value = 'Fresa'; document.getElementById('mac-code').value = 'F01'; document.getElementById('mac-wc').value = 'w1'; document.getElementById('mac-rate').value = '18'; addMachine()");
    const m = a.eval("db.machines.find(m => m.name === 'Fresa')");
    assert.equal(m.workCenterId, 'w1'); assert.equal(m.hourlyRate, 18); assert.equal(m.code, 'F01');
  });
  it('cambiando la tariffa si aggiornano le fasi dei cicli che la usano', () => {
    const a = app({ macchine: true });
    a.eval(`editMachineModal('m1'); document.getElementById('em-name').value = 'Tornio CNC'; document.getElementById('em-wc').value = 'w1';
      document.getElementById('em-rate').value = '40'; saveMachine('m1')`);
    assert.equal(a.eval("getItem('p1').cycle[0].machineRate"), 40);
    assert.equal(a.eval("cycleRowCost(getItem('p1').cycle[0])"), 100);
  });
  it('il calcolo proposto: ammortamento, manutenzione ed energia sulle ore dell\'anno', () => {
    const a = app({ macchine: true });
    a.eval(`editMachineModal('m1');
      [['em-calc-val', 100000], ['em-calc-anni', 10], ['em-calc-man', 2000], ['em-calc-ore', 1600], ['em-calc-kw', 10], ['em-calc-ekwh', 0.2]]
        .forEach(([k, v]) => { document.getElementById(k).value = String(v); });
      machineRateCalcApplica()`);
    // (10000 + 2000) / 1600 + 10 × 0.2 = 7.5 + 2 = 9.5
    assert.equal(a.eval("document.getElementById('em-rate').value"), '9.5');
  });
  it('usata in un ciclo non si elimina: si sospende', () => {
    const a = app({ macchine: true });
    a.eval("delMachine('m1')");
    assert.ok(a.eval("!!getMachine('m1')"));
  });
  it('un centro con macchine non si elimina', () => {
    const a = app({ macchine: true });
    a.eval("db.items = db.items.filter(i => i.id !== 'p1'); db.prodOrders = []; delWc('w1')");
    assert.ok(a.eval("!!getWorkCenter('w1')"));
  });
  it('il contatore: ore all\'ingresso più ore timbrate divise per gli operatori', () => {
    const a = app({ macchine: true }, { timeLogs: [log('t1', 'm1', '08:00', '12:00')] });
    a.eval("getOdp('A').phases[0].operators = 2");
    assert.equal(a.eval("oreMacchinaTotali(getMachine('m1'))"), 102);
  });
});

describe('La macchina sulla fase', () => {
  it('l\'ordine di produzione congela macchina, nome e tariffa di oggi', () => {
    const a = app({ macchine: true });
    const f = a.eval("opFreezePhases(getItem('p1'))[0]");
    assert.equal(f.machineId, 'm1'); assert.equal(f.machineName, 'T01 Tornio CNC'); assert.equal(f.machineRate, 25);
  });
  it('prima dell\'avvio la fase passa a un\'altra macchina, con la sua tariffa', () => {
    const a = app({ macchine: true });
    a.eval("odpSetMachine('B', 'fb', 'm2')");
    const f = a.eval("getOdp('B').phases[0]");
    assert.equal(f.machineId, 'm2'); assert.equal(f.machineRate, 10); assert.equal(f.machineName, 'T02 Tornio parallelo');
    a.eval("odpSetMachine('A', 'fa', 'm2')");   // avviata: resta dov'è
    assert.equal(a.eval("getOdp('A').phases[0].machineId"), 'm1');
  });
  it('la timbratura porta la macchina della fase', () => {
    const a = app({ macchine: true, officina: true });
    a.eval("timbraInizia('A', 'fa')");
    assert.equal(a.eval("timeLogs()[0].machineId"), 'm1');
  });
  it('il reparto si filtra per macchina', () => {
    const a = app({ macchine: true, officina: true }, { faseB: { machineId: 'm2' } });
    assert.deepEqual(Array.from(a.eval("repartoFasi('m:m2').map(x => x.o.number)")), ['ODP-B']);
    assert.deepEqual(Array.from(a.eval("repartoFasi('w1').map(x => x.o.number)")), ['ODP-A', 'ODP-B']);
  });
  it('nel ciclo la tendina compare solo per i centri con macchine e col modulo acceso', () => {
    const a = app({ macchine: true });
    assert.match(a.eval("cycleMachineCell(getItem('p1').cycle[0], 0)"), /T02 Tornio parallelo/);
    assert.equal(app({}).eval("cycleMachineCell(getItem('p1').cycle[0], 0)"), '');
  });
});

describe('Consuntivo con la macchina', () => {
  it('le ore timbrate pagano operatore e macchina', () => {
    const a = app({ macchine: true, officina: true }, { timeLogs: [log('t1', 'm1', '08:00', '10:00')] });
    a.eval("db.jobs = [{ id: 'J', number: 'C1', status: 'aperta', active: true }]; getOdp('A').jobId = 'J'");
    // 2 h × 30 + 2 h ÷ 1 operatore × 20 (tariffa congelata sull'ODP) = 100
    assert.equal(a.eval("consReale('J').lavorazioni"), 100);
  });
});

describe('Manutenzione per macchina', () => {
  const piano = { id: 'mp', workCenterId: 'w1', machineId: 'm1', title: 'Olio', everyDays: 0, everyHours: 3, ricambi: [], createdAt: '2026-09-01T00:00:00.000Z', active: true };
  it('scade sulle ore della sua macchina, non del reparto', () => {
    const logs = [log('t1', 'm2', '08:00', '12:00')];
    const a = app({ macchine: true, officina: true }, { maintPlans: [piano], timeLogs: logs });
    assert.equal(a.eval("maintStato(getMaintPlan('mp')).scaduto"), false);
    const b = app({ macchine: true, officina: true }, { maintPlans: [piano], timeLogs: logs.concat([log('t2', 'm1', '13:00', '16:30')]) });
    assert.equal(b.eval("maintStato(getMaintPlan('mp')).scaduto"), true);
  });
  it('l\'intervento di un piano sta sulla sua macchina', () => {
    const a = app({ macchine: true, officina: true }, { maintPlans: [piano] });
    a.eval("document.getElementById('me-date').value = '2026-10-28'; document.getElementById('me-ric').value = ''; maintEventSave('mp', '')");
    const e = a.eval("maintEvents()[0]");
    assert.equal(e.machineId, 'm1'); assert.equal(e.workCenterId, 'w1');
  });
  it('un piano nuovo su una macchina porta anche il suo centro', () => {
    const a = app({ macchine: true, officina: true });
    a.eval(`maintPlanModal(); document.getElementById('mp-wc').value = 'm:m2'; document.getElementById('mp-title').value = 'Ingrassaggio';
      document.getElementById('mp-days').value = '30'; document.getElementById('mp-ric').value = ''; maintPlanSave('')`);
    const p = a.eval("maintPlans()[0]");
    assert.equal(p.machineId, 'm2'); assert.equal(p.workCenterId, 'w1');
    assert.equal(a.eval("dovePlanLabel(maintPlans()[0])"), 'Tornitura · T02 Tornio parallelo');
  });
});

describe('Fermi e capacità finita per macchina', () => {
  const fermo = { id: 'e1', workCenterId: 'w1', machineId: 'm1', date: '2026-10-28', downFrom: '2026-10-28', downTo: '2026-10-28', active: true };
  it('il fermo di una macchina non ferma il centro: ne toglie la parte', () => {
    const a = app({ macchine: true, officina: true }, { maintEvents: [fermo] });
    assert.equal(a.eval("centroFermo('w1', '2026-10-28')"), false);
    assert.equal(a.eval("macchinaFerma('m1', '2026-10-28')"), true);
    assert.equal(a.eval("quotaCentroAttiva('w1', '2026-10-28')"), 0.5);
  });
  it('senza il modulo il fermo di una macchina ferma il centro, come prima', () => {
    const a = app({ officina: true }, { maintEvents: [fermo] });
    assert.equal(a.eval("centroFermo('w1', '2026-10-28')"), true);
  });
  it('la fase sulla macchina ferma aspetta il giorno dopo', () => {
    const a = app({ macchine: true, officina: true, capacita: true }, { maintEvents: [fermo] });
    assert.equal(a.eval("capSchedula().fasi.get('fa').start"), '2026-10-29');
  });
  it('due fasi sulla stessa macchina se ne dividono il turno', () => {
    // A: 12 h-uomo con 1 operatore su m1 → 28 e 29 (8 + 4); B sulla stessa
    // macchina comincia il 29 con le 4 ore rimaste, anche se il centro (senza
    // capacità dichiarata) ne avrebbe di più.
    const a = app({ macchine: true, capacita: true });
    const s = a.eval("(() => { const r = capSchedula(); return { a: r.fasi.get('fa'), b: r.fasi.get('fb') }; })()");
    assert.equal(s.a.end, '2026-10-29');
    assert.equal(s.b.start, '2026-10-29'); assert.equal(s.b.end, '2026-10-30');
  });
});

describe('La macchina nei documenti (0.127.1)', () => {
  it('il foglio dell\'ODP per l\'officina dice su quale macchina', () => {
    const fase = m => m.eval("odpDocSpec(getOdp('A')).sezioni[0].righe[0][2]");
    assert.equal(fase(app({ macchine: true })), 'T01 Tornio CNC');
    assert.equal(fase(app({})), 'Interna', 'col modulo spento resta com\'era');
  });
  it('l\'export del ciclo porta la macchina accanto al centro', () => {
    const a = app({ macchine: true });
    a.eval("currentCycleItemId = 'p1'");
    assert.equal(a.eval("cycleExportSpec().sezioni[1].righe[0][1]"), 'Tornitura · T01 Tornio CNC');
  });
  it('una macchina che cambia centro si porta dietro i suoi piani di manutenzione', () => {
    const a = app({ macchine: true, officina: true }, { maintPlans: [
      { id: 'pm', workCenterId: 'w1', machineId: 'm2', title: 'Olio', everyDays: 30, everyHours: 0, ricambi: [], active: true }] });
    a.eval(`db.workCenters.push({ id: 'w2', name: 'Fresatura', hourlyRate: 35, hoursPerDay: 8, active: true });
      editMachineModal('m2'); document.getElementById('em-code').value = 'T02'; document.getElementById('em-name').value = 'Tornio parallelo'; document.getElementById('em-wc').value = 'w2';
      document.getElementById('em-rate').value = '10'; saveMachine('m2')`);
    assert.equal(a.eval("getMachine('m2').workCenterId"), 'w2');
    assert.equal(a.eval("getMaintPlan('pm').workCenterId"), 'w2');
    assert.equal(a.eval("dovePlanLabel(getMaintPlan('pm'))"), 'Fresatura · T02 Tornio parallelo');
  });
});
