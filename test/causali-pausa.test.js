// Le causali di pausa del reparto e le ore perse (dalla 0.159.0).

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

// Le ore si scrivono nell'ora locale del PC che fa girare i test: la fine
// della giornata (17:00) è un'ora locale.
function app(o) {
  const x = o || {};
  const a = loadApp({ silent: true });
  const fase = (id, seq, extra) => Object.assign({ id, seq, opIndex: 0, workCenterId: 'w1', wcName: 'Tornio', costMode: 'orario', hours: 1, rate: 50, cost: 0 }, extra || {});
  a.setDb(makeDb({
    items: [acq('v1', 5), { id: 'p1', code: 'P1', name: 'Parte', type: 'parte', uom: 'pz', sourcing: 'make', active: true, cycle: [] }],
    workCenters: [{ id: 'w1', name: 'Tornio', hourlyRate: 40, hoursPerDay: 8, active: true },
      { id: 'w2', name: 'Fresa', hourlyRate: 40, hoursPerDay: 8, active: true }],
    machines: [{ id: 'm1', code: 'T1', name: 'Tornio CNC', workCenterId: 'w1', active: true }],
    prodOrders: [{ id: 'A', number: 'ODP-A', itemId: 'p1', code: 'P1', qty: 12, status: 'corso', dueDate: '2026-11-02', active: true,
      phases: [fase('fa', 10, { machineId: 'm1' }), fase('fb', 20, { workCenterId: 'w2', wcName: 'Fresa' })] }],
    prodDecls: [{ id: 'd1', odpId: 'A', phaseId: 'fa', kind: 'avvio', qty: 0, scrap: 0 },
      { id: 'd2', odpId: 'A', phaseId: 'fb', kind: 'avvio', qty: 0, scrap: 0 }],
    movements: [], timeLogs: [], maintPlans: [], maintEvents: [],
    users: [{ id: 'u1', name: 'Anna', email: 'a@x.it', role: 'admin', active: true },
      { id: 'u2', name: 'Bruno', email: 'b@x.it', role: 'officina', active: true }],
    settings: { modules: Object.assign({ officina: true }, x.modules || {}),
      calendar: Object.assign({ workDays: [0, 1, 2, 3, 4, 5, 6], holidays: [], closures: [], easter: false }, x.calendar || {}) },
  }));
  a.asRole('admin');
  a.eval("currentUser = db.users[0]; oggiISO = () => '2026-10-28'; if (typeof calInvalidate === 'function') calInvalidate()");
  return a;
}
// Una timbratura chiusa, con orari locali «AAAA-MM-GGTHH:MM».
function log(a, id, user, fase, da, al, causale, wc) {
  a.eval(`db.timeLogs.push({ id: '${id}', odpId: 'A', phaseId: '${fase}', workCenterId: '${wc || (fase === 'fb' ? 'w2' : 'w1')}', machineId: ${fase === 'fa' ? "'m1'" : 'null'},
    userId: '${user}', startedAt: localeAIso('${da}'), endedAt: ${al ? `localeAIso('${al}')` : 'null'}, pauseReason: '${causale || ''}', pauseNote: '', note: '', active: true })`);
}
const pause = (a, adesso) => a.eval(`pauseTimbrate({ adesso: localeAIso('${adesso || '2026-10-28T12:00'}') }).map(p => p.causaleId + ':' + p.ore.toFixed(2) + ':' + p.perse.toFixed(2))`);

describe('Causali di pausa: in reparto', () => {
  it('Pausa chiede la causale e la timbratura resta aperta finché non si sceglie', () => {
    const a = app();
    a.eval("timbraInizia('A', 'fa')");
    a.eval('globalThis.__m = ""; { const vero = openModal; openModal = (h, ...r) => { __m = h; return vero(h, ...r); }; }');
    a.eval("repartoPausa('A', 'fa')");
    assert.match(a.eval('__m'), /Perché ti fermi\?[\s\S]*Fine turno[\s\S]*Attesa materiale[\s\S]*Guasto macchina/);
    assert.equal(a.eval("!!logApertoDiFase('A', 'fa', 'u1')"), true);
    a.eval("repartoPausaCon('A', 'fa', 'materiale')");
    assert.equal(a.eval("logAperto('u1')"), null);
    assert.equal(a.eval("db.timeLogs[0].pauseReason"), 'materiale');
  });
  it('la scheda dice la causale della pausa e da quando', () => {
    const a = app();
    a.eval("timbraInizia('A', 'fa'); repartoPausaCon('A', 'fa', 'materiale'); setView('reparto')");
    assert.match(a.html('view-reparto'), /In pausa · Attesa materiale · dal(le| \d{2}\/\d{2}\/\d{4}) \d{2}:\d{2}/);
  });
  it('«Altro» vuole il motivo scritto', () => {
    const a = app();
    a.eval("timbraInizia('A', 'fa')");
    a.eval("repartoPausaCon('A', 'fa', 'altro')");
    assert.equal(a.eval("!!logApertoDiFase('A', 'fa', 'u1')"), true, 'senza motivo non si ferma');
    a.eval("document.getElementById('pausa-nota').value = ''; repartoPausaCon('A', 'fa', 'altro', true)");
    assert.equal(a.eval("!!logApertoDiFase('A', 'fa', 'u1')"), true);
    a.eval("document.getElementById('pausa-nota').value = 'manca la gru'; repartoPausaCon('A', 'fa', 'altro', true)");
    assert.equal(a.eval("db.timeLogs[0].pauseReason + '|' + db.timeLogs[0].pauseNote"), 'altro|manca la gru');
  });
  it('un guasto propone l\'intervento sulla macchina, con il fermo da oggi', () => {
    const a = app({ modules: { macchine: true } });
    a.eval("timbraInizia('A', 'fa')");
    a.eval('globalThis.__m = ""; { const vero = openModal; openModal = (h, ...r) => { __m = h; return vero(h, ...r); }; }');
    a.eval("repartoPausaCon('A', 'fa', 'guasto')");
    assert.match(a.eval('__m'), /Registrare un intervento di manutenzione su T1/);
    a.eval('confirmYes()');
    assert.match(a.eval('__m'), /Registra intervento[\s\S]*id="me-from" type="date" value="2026-10-28"[\s\S]*Guasto durante ODP-A fase 10/);
  });
  it('passare a un\'altra fase chiude la prima come «Cambio lavoro», senza chiedere', () => {
    const a = app();
    a.eval("timbraInizia('A', 'fa'); timbraInizia('A', 'fb')");
    assert.equal(a.eval("db.timeLogs.find(l => l.phaseId === 'fa').pauseReason"), 'cambio');
    assert.equal(a.eval("causaleNome('cambio')"), 'Cambio lavoro');
  });
  it('Fine e dichiara chiude senza causale', () => {
    const a = app();
    a.eval("timbraInizia('A', 'fa'); opDichiaraModal = () => {}; repartoFine('A', 'fa')");
    assert.equal(a.eval("db.timeLogs[0].pauseReason || ''"), '');
  });
});

describe('Causali di pausa: le ore perse', () => {
  it('la pausa va fino a quando la stessa persona riprende, anche su un\'altra fase', () => {
    const a = app();
    log(a, 't1', 'u1', 'fa', '2026-10-27T08:00', '2026-10-27T10:00', 'materiale');
    log(a, 't2', 'u1', 'fb', '2026-10-27T10:30', '2026-10-27T12:00', 'turno');
    log(a, 't3', 'u1', 'fa', '2026-10-27T13:00', '2026-10-27T14:00');
    assert.deepEqual(Array.from(pause(a)), ['turno:1.00:0.00', 'materiale:0.50:0.50']);
    assert.equal(a.eval("orePerseFase('A', 'fa').toFixed(2)"), '0.50');
  });
  it('una pausa che non riprende in giornata si ferma alla fine della giornata', () => {
    const a = app();
    log(a, 't1', 'u1', 'fa', '2026-10-27T08:00', '2026-10-27T15:00', 'guasto');
    log(a, 't2', 'u1', 'fa', '2026-10-28T08:00', '2026-10-28T09:00');
    assert.deepEqual(Array.from(pause(a)), ['guasto:2.00:2.00']);
  });
  it('l\'ora di fine giornata si sceglie nel calendario', () => {
    const a = app({ calendar: { dayEnd: '16:30' } });
    log(a, 't1', 'u1', 'fa', '2026-10-27T08:00', '2026-10-27T15:00', 'guasto');
    assert.deepEqual(Array.from(pause(a)), ['guasto:1.50:1.50']);
  });
  it('una pausa ancora aperta conta fino ad adesso; dopo la fine giornata non conta', () => {
    const a = app();
    log(a, 't1', 'u1', 'fa', '2026-10-28T08:00', '2026-10-28T10:00', 'controllo');
    log(a, 't2', 'u2', 'fa', '2026-10-27T17:00', '2026-10-27T18:00', 'materiale');
    assert.deepEqual(Array.from(pause(a, '2026-10-28T11:15')), ['controllo:1.25:1.25', 'materiale:0.00:0.00']);
  });
  it('le timbrature di prima, senza causale, non fanno pause', () => {
    const a = app();
    log(a, 't1', 'u1', 'fa', '2026-10-27T08:00', '2026-10-27T10:00');
    log(a, 't2', 'u1', 'fa', '2026-10-27T11:00', '2026-10-27T12:00');
    assert.equal(a.eval("pauseTimbrate().length"), 0);
  });
  it('la tabella del Carico centri: per centro e macchina, per causale, con la quota sulle timbrate', () => {
    const a = app({ modules: { macchine: true } });
    log(a, 't1', 'u1', 'fa', '2026-10-27T08:00', '2026-10-27T10:00', 'materiale');
    log(a, 't2', 'u1', 'fa', '2026-10-27T11:00', '2026-10-27T13:00', 'guasto');
    log(a, 't3', 'u1', 'fa', '2026-10-27T14:00', '2026-10-27T16:00', 'turno');
    const t = a.eval(`(() => { const t = orePerseTabella({ adesso: localeAIso('2026-10-28T12:00') });
      return { colonne: t.colonne.map(c => c.id), righe: t.righe.map(r => r.nome + ':' + r.perse.toFixed(2) + ':' + r.timbrate.toFixed(2)) }; })()`);
    assert.deepEqual(Array.from(t.colonne), ['materiale', 'guasto']);
    assert.deepEqual(Array.from(t.righe), ['Tornio:2.00:6.00', 'T1 — Tornio CNC:2.00:6.00'].map(s => s.replace('T1 — Tornio CNC', a.eval("machineLabel(getMachine('m1'))"))));
    a.eval("setView('load')");
    assert.match(a.html('view-load'), /Ore perse[\s\S]*Attesa materiale[\s\S]*Guasto macchina[\s\S]*33%/);
  });
  it('si corregge a mano dalla finestra delle timbrature', () => {
    const a = app();
    log(a, 't1', 'u1', 'fa', '2026-10-27T08:00', '2026-10-27T10:00', 'turno');
    const l = a.eval("db.timeLogs[0]");
    const e = a.eval(`timbratureApplica('A', 'fa', [{ id: 't1', userId: 'u1', startedAt: '${l.startedAt}', endedAt: '${l.endedAt}', pauseReason: 'attrezzaggio' }])`);
    assert.equal(e.ok, true);
    assert.equal(e.cambiate, 1);
    assert.equal(a.eval("db.timeLogs[0].pauseReason"), 'attrezzaggio');
    // Un chiamante che non passa la causale la lascia com'è.
    a.eval(`timbratureApplica('A', 'fa', [{ id: 't1', userId: 'u1', startedAt: '${l.startedAt}', endedAt: '${l.endedAt}' }])`);
    assert.equal(a.eval("db.timeLogs[0].pauseReason"), 'attrezzaggio');
    a.eval('globalThis.__m = ""; { const vero = openModal; openModal = (h, ...r) => { __m = h; return vero(h, ...r); }; }');
    a.eval("timbratureModal('A', 'fa')");
    assert.match(a.eval('__m'), /Causale della pausa[\s\S]*value="attrezzaggio" selected/);
  });
});

describe('Causali di pausa: in Gestione', () => {
  it('si aggiungono, si sospendono e, se mai usate, si eliminano', () => {
    const a = app();
    a.eval("document.getElementById('cp-name').value = 'Attesa gru'; document.getElementById('cp-lost').checked = true; causalePausaAggiungi()");
    const nuova = a.eval("db.settings.pauseReasons.find(c => c.name === 'Attesa gru')");
    assert.equal(nuova.lost, true);
    assert.equal(a.eval('db.settings.pauseReasons.length'), 8);
    a.eval(`causalePausaAttiva('${nuova.id}')`);
    assert.equal(a.eval(`causaliPausa().some(c => c.id === '${nuova.id}')`), false);
    log(a, 't1', 'u1', 'fa', '2026-10-27T08:00', '2026-10-27T10:00', 'materiale');
    a.eval("causalePausaElimina('materiale')");
    assert.equal(a.eval("causaliPausa(true).some(c => c.id === 'materiale')"), true, 'usata: resta');
    a.eval(`causalePausaElimina('${nuova.id}')`);
    assert.equal(a.eval(`causaliPausa(true).some(c => c.id === '${nuova.id}')`), false);
  });
  it('si vedono in Centri di lavoro e la fine giornata nel calendario, solo con il modulo Officina', () => {
    const a = app();
    a.eval("setView('manage'); setMgmtTab('workcenters')");
    assert.match(a.html('mgmt-content'), /Causali di pausa[\s\S]*Fine turno/);
    a.eval("setMgmtTab('calendario')");
    assert.match(a.html('mgmt-content'), /set-cal-end[^>]*value="17:00"/);
    const b = app({ modules: { officina: false } });
    b.eval("setView('manage'); setMgmtTab('workcenters')");
    assert.doesNotMatch(b.html('mgmt-content'), /Causali di pausa/);
    b.eval("setMgmtTab('calendario')");
    assert.doesNotMatch(b.html('mgmt-content'), /set-cal-end/);
    assert.equal(b.eval("orePerseHtml('')"), '');
  });
  it('salvando il calendario senza il campo, l\'ora di fine giornata resta', () => {
    const a = app({ modules: { officina: false }, calendar: { dayEnd: '16:00' } });
    a.eval("setView('manage'); setMgmtTab('calendario')");
    // Il DOM finto ha ogni id: qui il campo non c'è, come nella pagina vera.
    a.eval("{ const vero = document.getElementById; document.getElementById = id => id === 'set-cal-end' ? null : vero.call(document, id); }");
    assert.equal(a.eval('readCalendarSettings().cal.dayEnd'), '16:00');
  });
});
