// Moduli Officina (terminale di reparto, manutenzione; dalla 0.123.0) e
// Capacità finita (dalla 0.123.0).

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

// Un centro da 8 ore al giorno, lavorativo tutti i giorni; due ODP lanciati
// con una fase interna da 1 h a pezzo, avviata sul primo.
function app(modules, o) {
  const x = o || {};
  const a = loadApp({ silent: true });
  const fase = id => ({ id, seq: 10, opIndex: 0, workCenterId: 'w1', wcName: 'Tornio', costMode: 'orario', hours: 1, rate: 50, cost: 0 });
  const db = makeDb({
    items: [acq('v1', 5), { id: 'p1', code: 'P1', name: 'Parte', type: 'parte', uom: 'pz', sourcing: 'make', active: true, cycle: [] }],
    workCenters: [{ id: 'w1', name: 'Tornio', hourlyRate: 40, hoursPerDay: 8, active: true }],
    prodOrders: [
      { id: 'A', number: 'ODP-A', itemId: 'p1', code: 'P1', qty: 12, status: 'corso', dueDate: x.dueA || '2026-11-02', active: true, phases: [fase('fa')] },
      { id: 'B', number: 'ODP-B', itemId: 'p1', code: 'P1', qty: 8, status: 'lanciato', dueDate: '2026-11-30', active: true, phases: [fase('fb')] },
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

describe('Terminale di reparto', () => {
  it('le fasi interne avviabili e in corso, per data di consegna', () => {
    const f = app({ officina: true }).eval("repartoFasi('').map(x => x.o.number)");
    assert.deepEqual(Array.from(f), ['ODP-A', 'ODP-B']);
  });
  it('Inizia apre una timbratura, Pausa la chiude; una persona ne ha una sola aperta', () => {
    const a = app({ officina: true });
    a.eval("timbraInizia('A', 'fa')");
    assert.equal(a.eval("!!logApertoDiFase('A', 'fa', 'u1')"), true);
    a.eval("timbraPausa('A', 'fa')");
    assert.equal(a.eval("logAperto('u1')"), null);
    assert.equal(a.eval("timeLogs().length"), 1);
  });
  it('non si timbra una fase non avviata', () => {
    const a = app({ officina: true });
    assert.equal(a.eval("timbraInizia('B', 'fb')"), false);
  });
  it('le ore timbrate sono la somma delle timbrature', () => {
    const a = app({ officina: true }, { timeLogs: [
      { id: 't1', odpId: 'A', phaseId: 'fa', workCenterId: 'w1', userId: 'u1', startedAt: '2026-10-27T08:00:00.000Z', endedAt: '2026-10-27T10:00:00.000Z', active: true },
      { id: 't2', odpId: 'A', phaseId: 'fa', workCenterId: 'w1', userId: 'u1', startedAt: '2026-10-27T11:00:00.000Z', endedAt: '2026-10-27T11:30:00.000Z', active: true }] });
    assert.equal(a.eval("oreTimbrate('A', 'fa')"), 2.5);
  });
  it('la schermata: fasi future in attesa e terminate, con la situazione', () => {
    const a = app({ officina: true });
    a.eval(`const o = getOdp('A'); o.phases.push({ id: 'fa2', seq: 20, opIndex: 1, workCenterId: 'w1', wcName: 'Tornio', costMode: 'orario', hours: 1, rate: 50, cost: 0, plannedStart: '2026-11-05', plannedEnd: '2026-11-06' });
      getOdp('B').phases[0].plannedStart = '2026-10-20'`);
    assert.deepEqual(Array.from(a.eval("repartoFasi('').map(x => x.f.id)")), ['fa', 'fb']);
    assert.deepEqual(Array.from(a.eval("repartoFasi('', true).map(x => x.f.id + ':' + x.stato)")), ['fa:corso', 'fb:avviabile', 'fa2:attesa']);
    assert.equal(a.eval("repartoSituazione(getOdp('A'), getOdp('A').phases[0], 'corso').id"), 'avviata');
    assert.equal(a.eval("repartoSituazione(getOdp('B'), getOdp('B').phases[0], 'avviabile').id"), 'ritardo');
    assert.equal(a.eval("repartoSituazione(getOdp('A'), getOdp('A').phases[1], 'attesa').nota"), 'dopo la fase 10');
    a.eval("opDichiara('A', 'fa', { qty: 12 })");
    assert.deepEqual(Array.from(a.eval("repartoFasi('', true).map(x => x.f.id + ':' + x.stato)")), ['fa2:avviabile', 'fb:avviabile', 'fa:chiusa']);
    assert.equal(a.eval("repartoSituazione(getOdp('A'), getOdp('A').phases[0], 'chiusa').id"), 'terminata');
  });
  it('la scheda dice chi lavora e chi è in pausa; i centri in una barra', () => {
    const a = app({ officina: true });
    a.eval("timbraInizia('A', 'fa'); setView('reparto')");
    const h = a.html('view-reparto');
    assert.match(h, /reparto-centri/);
    assert.match(h, /reparto-sit avviata/);
    assert.match(h, /In lavorazione da <span class="reparto-tempo"[^>]*data-tipo="sessione">0 h 00'<\/span> · tu/);
    assert.match(h, /Tempo lavorato/);
    assert.match(h, /Inizio previsto/);
    a.eval("timbraPausa('A', 'fa'); renderReparto()");
    assert.match(a.html('view-reparto'), /In pausa/);
  });
  it('il tempo della sessione è la timbratura aperta più vecchia', () => {
    const a = app({ officina: true }, { timeLogs: [
      { id: 't1', odpId: 'A', phaseId: 'fa', workCenterId: 'w1', userId: 'u1', startedAt: '2026-10-27T08:00:00.000Z', endedAt: '2026-10-27T10:00:00.000Z', active: true },
      { id: 't2', odpId: 'A', phaseId: 'fa', workCenterId: 'w1', userId: 'u1', startedAt: new Date(Date.now() - 90 * 60000).toISOString(), endedAt: null, active: true },
      { id: 't3', odpId: 'A', phaseId: 'fa', workCenterId: 'w1', userId: 'u2', startedAt: new Date(Date.now() - 30 * 60000).toISOString(), endedAt: null, active: true }] });
    assert.equal(Math.round(a.eval("repartoOreSessione('A', 'fa')") * 60), 90);
    assert.equal(Math.round(a.eval("oreTimbrate('A', 'fa')") * 60), 240);
  });
  it('ogni scheda ha il suo QR, che riapre la scheda della fase', () => {
    const a = app({ officina: true });
    a.eval(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'vendor', 'qrcode.js'), 'utf8'));
    a.eval("setView('reparto')");
    assert.match(a.html('view-reparto'), /class="reparto-qr"><svg[^]*?<span>ODP-A\/10<\/span>/);
    const r = a.eval("(() => { const x = qrResolve('fase', 'ODP-A/10'); return x && x.rec.odp.id + ':' + x.rec.fase.id; })()");
    assert.equal(r, 'A:fa');
    assert.equal(a.eval("JSON.stringify(qrParse('https://x/app/#/q/fase/ODP-A%2F10'))"), JSON.stringify({ tipo: 'fase', codice: 'ODP-A/10' }));
    assert.equal(a.eval("qrResolve('fase', 'ODP-A/90')"), null);
    assert.equal(a.eval("qrApri({ tipo: 'fase', codice: 'ODP-A/10' })"), true);
    const h = a.eval("qrSchedaHtml('fase', qrResolve('fase', 'ODP-A/10').rec)");
    assert.match(h, /Fase 10 di ODP-A/);
    assert.match(h, /id="reparto-qr-scheda"[^>]*>\s*<div class="reparto-card/);
    assert.match(h, /repartoPausa\('A','fa'\)|repartoInizia\('A','fa'\)/);
  });
  it('la vista si disegna, e senza il modulo non si apre', () => {
    const a = app({ officina: true });
    a.eval("setView('reparto')");
    assert.match(a.html('view-reparto'), /ODP-A/);
    const b = app({});
    b.eval("setView('reparto')");
    assert.equal(b.eval('activeView'), 'home');
  });
});

describe('Manutenzione', () => {
  const piano = { id: 'mp', workCenterId: 'w1', title: 'Olio', everyDays: 30, everyHours: 0, ricambi: [{ itemId: 'v1', qty: 2 }], createdAt: '2026-09-01T00:00:00.000Z', active: true };
  it('scade dopo i giorni dall\'ultimo intervento', () => {
    const a = app({ officina: true }, { maintPlans: [piano] });
    assert.equal(a.eval("maintStato(getMaintPlan('mp')).scaduto"), true);
    const b = app({ officina: true }, { maintPlans: [piano], maintEvents: [{ id: 'e1', planId: 'mp', workCenterId: 'w1', date: '2026-10-20', active: true }] });
    assert.equal(b.eval("maintStato(getMaintPlan('mp')).scadenza"), '2026-11-19');
  });
  it('scade anche per le ore lavorate dal centro', () => {
    const a = app({ officina: true }, { maintPlans: [Object.assign({}, piano, { everyDays: 0, everyHours: 2 })], timeLogs: [
      { id: 't1', odpId: 'A', phaseId: 'fa', workCenterId: 'w1', userId: 'u1', startedAt: '2026-10-27T08:00:00.000Z', endedAt: '2026-10-27T10:30:00.000Z', active: true }] });
    assert.equal(a.eval("maintStato(getMaintPlan('mp')).scaduto"), true);
  });
  it('i ricambi dell\'intervento escono dal magazzino', () => {
    const a = app({ officina: true }, { maintPlans: [piano] });
    a.eval("document.getElementById('me-ric').value = 'V1 3'; document.getElementById('me-date').value = '2026-10-28'; maintEventSave('mp', 'w1')");
    assert.equal(a.eval("onHandOf('v1')"), -3);
    assert.equal(a.eval("maintEvents().length"), 1);
  });
  it('la manutenzione scaduta è un segnale del Riepilogo', () => {
    const a = app({ officina: true }, { maintPlans: [piano] });
    assert.ok(Array.from(a.eval("homeSegnali().map(s => s.vista)")).includes('manutenzione'));
  });
});

describe('Capacità finita', () => {
  it('le fasi si mettono in fila sul centro, 8 ore al giorno', () => {
    // A: 12 h dal 28 → 28 (8 h) e 29 (4 h); B: 8 h, attrezzaggio zero → 29 (4 h) e 30 (4 h)
    const s = app({ capacita: true }).eval("(() => { const r = capSchedula(); return { a: r.fasi.get('fa'), b: r.fasi.get('fb') }; })()");
    assert.equal(s.a.start, '2026-10-28'); assert.equal(s.a.end, '2026-10-29');
    assert.equal(s.b.start, '2026-10-29'); assert.equal(s.b.end, '2026-10-30');
  });
  it('un ordine che finisce dopo la data richiesta è in ritardo', () => {
    const a = app({ capacita: true }, { dueA: '2026-10-28' });
    assert.deepEqual(Array.from(a.eval("capInRitardo().map(o => o.number)")), ['ODP-A']);
  });
  it('un fermo di manutenzione toglie i suoi giorni al centro', () => {
    const a = app({ capacita: true, officina: true }, { maintEvents: [{ id: 'e1', workCenterId: 'w1', date: '2026-10-28', downFrom: '2026-10-28', downTo: '2026-10-28', active: true }] });
    assert.equal(a.eval("capSchedula().fasi.get('fa').start"), '2026-10-29');
  });
  it('col modulo spento non dice niente', () => {
    assert.equal(app({}).eval("capOrdine('A')"), null);
  });
});
