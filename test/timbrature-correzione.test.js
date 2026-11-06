// Correggere a mano le timbrature di una fase (dalla 0.136.0): una fase
// rimasta attiva per errore, una timbratura da togliere o da aggiungere.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

const log = (id, user, da, a, fase) => ({ id, odpId: 'A', phaseId: fase || 'fa', workCenterId: 'w1', userId: user,
  startedAt: '2026-10-27T' + da + ':00.000Z', endedAt: a ? '2026-10-27T' + a + ':00.000Z' : null, note: '', active: true });
const ADESSO = '2026-10-28T09:00:00.000Z';

function app(timeLogs, role) {
  const a = loadApp({ silent: true });
  const fase = (id, seq) => ({ id, seq, opIndex: 0, workCenterId: 'w1', wcName: 'Tornio', costMode: 'orario', hours: 1, rate: 50, cost: 0 });
  a.setDb(makeDb({
    items: [acq('v1', 5), { id: 'p1', code: 'P1', name: 'Parte', type: 'parte', uom: 'pz', sourcing: 'make', active: true, cycle: [] }],
    workCenters: [{ id: 'w1', name: 'Tornio', hourlyRate: 40, hoursPerDay: 8, active: true }],
    prodOrders: [{ id: 'A', number: 'ODP-A', itemId: 'p1', code: 'P1', qty: 12, status: 'corso', dueDate: '2026-11-02', active: true, phases: [fase('fa', 10), fase('fa2', 20)] }],
    prodDecls: [{ id: 'd1', odpId: 'A', phaseId: 'fa', kind: 'avvio', qty: 0, scrap: 0 }],
    movements: [], timeLogs: timeLogs || [], maintPlans: [], maintEvents: [],
    users: [{ id: 'u1', name: 'Anna', email: 'a@x.it', role: role || 'admin', active: true },
      { id: 'u2', name: 'Bruno', email: 'b@x.it', role: 'officina', active: true }],
    settings: { modules: { officina: true }, calendar: { workDays: [0, 1, 2, 3, 4, 5, 6], holidays: [], closures: [], easter: false } },
  }));
  a.asRole(role || 'admin');
  a.eval("currentUser = db.users[0]; oggiISO = () => '2026-10-28'");
  return a;
}
const applica = (a, righe) => a.eval(`timbratureApplica('A', 'fa', ${JSON.stringify(righe)}, '${ADESSO}')`);

describe('Correzione delle timbrature', () => {
  it('chiude a mano una fase rimasta attiva, e la correzione va nello storico', () => {
    const a = app([log('t1', 'u2', '08:00', null)]);
    a.eval('storicoFotografa()');
    assert.ok(a.eval("oreTimbrate('A', 'fa', '" + ADESSO + "')") > 20);
    const e = applica(a, [{ id: 't1', userId: 'u2', startedAt: '2026-10-27T08:00:00.000Z', endedAt: '2026-10-27T16:30:00.000Z' }]);
    assert.equal(e.ok, true);
    assert.equal(e.cambiate, 1);
    assert.equal(a.eval("oreTimbrate('A', 'fa')"), 8.5);
    assert.equal(a.eval("logAperto('u2')"), null);
    const v = a.eval("storicoDi('timeLogs', 't1')[0]");
    assert.equal(v.n, 'ODP-A fase 10');
    assert.deepEqual(Array.from(v.d.map(x => x.k)), ['endedAt']);
    assert.match(a.eval("storicoVoceHtml(storicoDi('timeLogs', 't1')[0], true)"), /Fine<\/span>\s*\d{2}\/10\/2026 \d{2}:30/);
  });
  it('elimina una timbratura (nel cestino) e ne aggiunge una a mano', () => {
    const a = app([log('t1', 'u2', '08:00', '10:00'), log('t2', 'u2', '10:00', '11:00')]);
    const e = applica(a, [
      { id: 't1', userId: 'u2', startedAt: '2026-10-27T08:00:00.000Z', endedAt: '2026-10-27T10:00:00.000Z' },
      { id: 't2', userId: 'u2', startedAt: '2026-10-27T10:00:00.000Z', endedAt: '2026-10-27T11:00:00.000Z', elimina: true },
      { userId: 'u1', startedAt: '2026-10-27T13:00:00.000Z', endedAt: '2026-10-27T14:30:00.000Z' }]);
    assert.equal(e.ok, true);
    assert.equal(e.cambiate, 2);
    assert.equal(a.eval("oreTimbrate('A', 'fa')"), 3.5);
    assert.equal(a.eval("db.trash.some(t => t.coll === 'timeLogs' && t.record.id === 't2')"), true);
    assert.equal(a.eval("logsDiFase('A', 'fa').find(l => l.userId === 'u1').note"), 'aggiunta a mano');
  });
  it('rifiuta fine prima dell\'inizio, orari nel futuro e sovrapposizioni, senza scrivere niente', () => {
    const a = app([log('t1', 'u2', '08:00', '10:00'), log('t9', 'u2', '12:00', '13:00', 'fa2')]);
    const prima = a.eval('JSON.stringify(db.timeLogs)');
    assert.match(applica(a, [{ id: 't1', userId: 'u2', startedAt: '2026-10-27T10:00:00.000Z', endedAt: '2026-10-27T09:00:00.000Z' }]).errore, /fine viene prima/);
    assert.match(applica(a, [{ id: 't1', userId: 'u2', startedAt: '2026-10-27T08:00:00.000Z', endedAt: '2026-10-29T09:00:00.000Z' }]).errore, /futuro/);
    assert.match(applica(a, [{ id: 't1', userId: 'u2', startedAt: '2026-10-27T08:00:00.000Z', endedAt: '2026-10-27T12:30:00.000Z' }]).errore, /Bruno si sovrappongono/);
    assert.match(applica(a, [{ id: 't1', userId: 'u2', startedAt: '2026-10-27T08:00:00.000Z', endedAt: '2026-10-27T10:00:00.000Z' },
      { userId: 'u2', startedAt: '2026-10-27T09:00:00.000Z', endedAt: '2026-10-27T09:30:00.000Z' }]).errore, /sovrappongono/);
    assert.match(applica(a, [{ userId: 'u1', startedAt: '2026-10-27T15:00:00.000Z', endedAt: null }]).errore, /va chiusa/);
    assert.equal(a.eval('JSON.stringify(db.timeLogs)'), prima);
  });
  it('un orario non toccato resta quello timbrato, al secondo', () => {
    const a = app([Object.assign(log('t1', 'u2', '08:00', null), { startedAt: '2026-10-27T08:00:17.421Z' })]);
    a.eval('globalThis.__m = ""; { const vero = openModal; openModal = (h, ...r) => { __m = h; return vero(h, ...r); }; }');
    a.eval("timbratureModal('A', 'fa')");
    assert.match(a.eval('__m'), /Correggi le timbrature[\s\S]*Bruno[\s\S]*type="datetime-local"/);
    // Il campo come lo mostra la finestra, senza i secondi; la fine scritta a mano.
    a.eval("document.getElementById('tmb-a-0').value = isoALocale('2026-10-27T08:00:17.421Z'); document.getElementById('tmb-b-0').value = isoALocale('2026-10-27T16:00:00.000Z'); timbratureSalva()");
    const l = a.eval("db.timeLogs.find(l => l.id === 't1')");
    assert.equal(l.startedAt, '2026-10-27T08:00:17.421Z');
    assert.equal(l.endedAt, '2026-10-27T16:00:00.000Z');
  });
  it('il pulsante Correggi è sulla scheda per chi gestisce, non per l\'officina', () => {
    const a = app([log('t1', 'u2', '08:00', '10:00')]);
    a.eval("setView('reparto')");
    assert.match(a.html('view-reparto'), /timbratureModal\('A','fa'\)/);
    const b = app([log('t1', 'u2', '08:00', '10:00')], 'officina');
    b.eval("setView('reparto')");
    assert.doesNotMatch(b.html('view-reparto'), /timbratureModal/);
    assert.match(b.html('view-reparto'), /Inizia|Riprendi/);
    b.eval('globalThis.__m = ""; openModal = h => { __m = h; }');
    b.eval("timbratureModal('A', 'fa')");
    assert.equal(b.eval('__m'), '');
  });
});
