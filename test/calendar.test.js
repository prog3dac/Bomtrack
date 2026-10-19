// Calendario scadenze nel Riepilogo.
//
// I segnali dicono quante cose sono in ritardo; il calendario dice quando
// scadono. Questi test fissano da dove arriva ciascuna data, quale gravità
// prende, e che i promemoria scritti a mano seguano le stesse regole di ruolo
// del resto dell'app.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, asm, comp } = require('./fixtures.js');

function app(db, role) {
  const a = loadApp({ silent: true });
  a.setDb(db || makeDb({ items: [] }));
  a.asRole(role || 'admin');
  return a;
}
const eventi = a => JSON.parse(a.eval('JSON.stringify(homeEventi())'));
const oggi = a => a.eval('oggiISO()');
const giorni = (a, n) => a.eval(`addDays(oggiISO(), ${n})`);

describe('Calendario: da dove arrivano le date', () => {
  it('un database vuoto non ha scadenze', () => {
    assert.deepEqual(eventi(app()), []);
  });

  it('una commessa scaduta è rossa, una lontana è in programma', () => {
    const a = app();
    a.eval(`db.jobs = [
      { id: 'j1', number: 'COM-1', status: 'aperta', dueDate: '2020-01-01', active: true },
      { id: 'j2', number: 'COM-2', status: 'produzione', dueDate: addDays(oggiISO(), 60), active: true },
      { id: 'j3', number: 'COM-3', status: 'chiusa', dueDate: '2020-01-01', active: true }]`);
    const e = eventi(a);
    assert.equal(e.length, 2, 'una commessa chiusa non è più una scadenza');
    assert.equal(e[0].data, '2020-01-01');
    assert.equal(e[0].gravita, 'alta');
    assert.match(e[0].azione, /homeApri\('job','j1'\)/, 'ogni voce porta dove si risolve');
    assert.equal(e[1].gravita, 'info');
  });

  it('il fabbisogno mette la data entro cui ordinare, raggruppata per piano', () => {
    const a = app(makeDb({
      suppliers: [{ id: 's1', name: 'SKF', active: true }],
      items: [
        asm('mac', 'macchina', { components: [comp('m1', 4), comp('m2', 2)] }),
        Object.assign(mat('m1', 10), { priceList: [{ id: 'p1', supplierId: 's1', price: 10, leadDays: 10, date: '2026-01-01' }], activePriceId: 'p1', supplierId: 's1' }),
        Object.assign(mat('m2', 5), { priceList: [{ id: 'p2', supplierId: 's1', price: 5, leadDays: 10, date: '2026-01-01' }], activePriceId: 'p2', supplierId: 's1' }),
      ],
    }));
    const due = giorni(a, 13);
    a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-1', active: true, lines: [{ id: 'l1', itemId: 'mac', qty: 1, dueDate: '${due}' }] })`);
    const f = eventi(a).filter(e => e.tipo === 'fabbisogno');
    assert.equal(f.length, 1, 'due articoli dello stesso piano nello stesso giorno sono una voce sola');
    // L'ordine parte in un giorno lavorativo: se fra 3 giorni è sabato, domenica
    // o un festivo, si ordina il lavorativo prima. Senza questo il test dipendeva
    // dal giorno della settimana in cui gira.
    assert.equal(f[0].data, a.eval(`prevWorkDay(addDays(oggiISO(), 3))`), 'serve fra 13 giorni, consegna in 10: si ordina fra 3, o il lavorativo prima');
    assert.equal(f[0].gravita, 'media', 'dentro la finestra d\'avviso');
    assert.match(f[0].testo, /2 articoli/);
    assert.match(f[0].azione, /homeApri\('plan','pl1'\)/);
  });

  it('un ordine da ricevere compare alla data confermata; evaso o ricevuto no', () => {
    const a = app();
    const conf = giorni(a, 30), rich = giorni(a, 20);
    a.eval(`db.orders = [
      { id: 'o1', number: 'ODA-1', status: 'confermato', active: true, lines: [
        { id: 'r1', qty: 5, received: 0, deliveryDate: '${rich}', confirmedDate: '${conf}' },
        { id: 'r2', qty: 5, received: 5, deliveryDate: '${rich}' }] },
      { id: 'o2', number: 'ODA-2', status: 'evaso', active: true, lines: [{ id: 'r3', qty: 1, received: 0, deliveryDate: '${rich}' }] }]`);
    const e = eventi(a);
    assert.equal(e.length, 1, 'una riga già ricevuta e un ordine evaso non sono scadenze');
    assert.equal(e[0].data, conf, 'la data che conta è quella promessa dal fornitore');
    assert.equal(e[0].gravita, 'media', 'confermato più tardi del chiesto: da tenere d\'occhio');
    assert.equal(e[0].ritardo, true);
  });

  it('una consegna d\'ordine già passata e non ricevuta è rossa', () => {
    const a = app();
    a.eval(`db.orders = [{ id: 'o1', number: 'ODA-1', status: 'inviato', active: true, lines: [{ id: 'r1', qty: 5, received: 2, deliveryDate: '2020-02-01' }] }]`);
    assert.equal(eventi(a)[0].gravita, 'alta');
  });

  it('un ODL da far rientrare sta accanto agli ordini, e apre l\'ODL', () => {
    const a = app();
    const d = giorni(a, 20);
    a.eval(`db.workOrders = [{ id: 'w1', number: 'ODL-1', status: 'inviato', active: true, lines: [{ id: 'r1', qty: 3, received: 0, deliveryDate: '${d}' }] }]`);
    const e = eventi(a);
    assert.equal(e.length, 1);
    assert.match(e[0].testo, /ODL-1/);
    assert.match(e[0].azione, /homeApri\('odl','w1'\)/);
  });

  it('un ordine di produzione lanciato mostra la data di fine; una bozza no', () => {
    const a = app();
    a.eval(`db.prodOrders = [
      { id: 'p1', number: 'ODP-1', status: 'lanciato', dueDate: '2020-03-01', active: true },
      { id: 'p2', number: 'ODP-2', status: 'bozza', dueDate: '2020-03-01', active: true }]`);
    const e = eventi(a);
    assert.equal(e.length, 1);
    assert.equal(e[0].gravita, 'alta');
    assert.match(e[0].azione, /homeApri\('odp','p1'\)/);
  });

  it('le voci sono in ordine di data, e a parità la più grave prima', () => {
    const a = app();
    const d = giorni(a, 40);
    a.eval(`db.reminders = [
      { id: 'r1', title: 'normale', date: '${d}', gravita: 'info', active: true },
      { id: 'r2', title: 'critico', date: '${d}', gravita: 'alta', active: true },
      { id: 'r3', title: 'prima', date: '${giorni(a, 35)}', gravita: 'info', active: true }]`);
    assert.deepEqual(eventi(a).map(e => e.testo), ['prima', 'critico', 'normale']);
  });
});

describe('Calendario: griglia e navigazione', () => {
  it('la griglia parte di lunedì e copre settimane intere', () => {
    const a = app();
    const g = JSON.parse(a.eval('JSON.stringify(calGiorniGriglia("2026-09"))'));
    assert.equal(g[0], '2026-08-31', 'il 1° settembre 2026 è martedì');
    assert.equal(g.length % 7, 0);
    assert.equal(g[g.length - 1], '2026-10-04');
  });

  it('febbraio che inizia di lunedì sta in quattro settimane', () => {
    const a = app();
    assert.equal(a.eval('calGiorniGriglia("2027-02").length'), 28);
  });

  it('si sfoglia avanti e indietro, anche a cavallo d\'anno', () => {
    const a = app();
    assert.equal(a.eval('calSpostaMese("2026-12", 1)'), '2027-01');
    assert.equal(a.eval('calSpostaMese("2026-01", -1)'), '2025-12');
  });

  it('le scadute restano in vista anche sfogliando un altro mese', () => {
    const a = app();
    a.eval(`db.jobs = [{ id: 'j1', number: 'COM-1', status: 'aperta', dueDate: '2020-01-01', active: true }]`);
    a.eval('renderHome(); homeCalMove(3);');
    const h = a.html('home-cal');   // sfogliare ridisegna solo il calendario
    assert.match(h, /Scadute e non risolte \(1\)/);
    assert.match(h, /COM-1/);
    assert.match(h, /class="cal-grid"/);
  });

  it('un giorno con scadenze lo dice anche a chi non vede i pallini', () => {
    const a = app();
    a.eval(`db.reminders = [{ id: 'r1', title: 'Collaudo', date: oggiISO(), gravita: 'info', active: true }]`);
    a.eval('renderHome()');
    assert.match(a.html('view-home'), /aria-label="[^"]*, 1 scadenza"/);
  });

  it('scegliere un giorno mostra le sue voci', () => {
    const a = app();
    const d = giorni(a, 45);
    a.eval(`db.reminders = [{ id: 'r1', title: 'Collaudo in officina', date: '${d}', gravita: 'info', active: true }]`);
    a.eval(`renderHome(); homeCalPick('${d}')`);
    assert.equal(a.eval('homeCalMese'), d.slice(0, 7));
    assert.match(a.html('home-cal'), /Collaudo in officina/);
  });
});

describe('Il calendario si sfoglia senza ricalcolare il Riepilogo', () => {
  // Le scadenze sono quelle dell'ultimo renderHome: un clic su un giorno, una
  // freccia o un filtro ne mostra un'altra fetta, non rifà il fabbisogno di
  // ogni piano aperto.
  it('giorno, mese, oggi e filtri non rifanno i segnali né le scadenze', () => {
    const a = app();
    const d = giorni(a, 45);
    a.eval(`db.reminders = [{ id: 'r1', title: 'Collaudo in officina', date: '${d}', gravita: 'info', active: true }]`);
    a.eval('renderHome(); __conti = { segnali: 0, eventi: 0 };'
      + ' { const s = homeSegnali, e = homeEventi;'
      + ' homeSegnali = () => (__conti.segnali++, s()); homeEventi = () => (__conti.eventi++, e()); }');
    a.eval(`homeCalPick('${d}'); homeCalMove(1); homeCalMove(-1); homeCalToday(); homeCalFiltro('promemoria'); homeCalTutti(); homeCalPick('${d}')`);
    assert.deepEqual(JSON.parse(a.eval('JSON.stringify(__conti)')), { segnali: 0, eventi: 0 });
    assert.match(a.html('home-cal'), /Collaudo in officina/);
  });
});

describe('Promemoria', () => {
  function compila(a, campi) {
    Object.entries(campi).forEach(([k, v]) => { a.el(k).value = v; });
  }

  it('si aggiunge, entra nel calendario e «fatto» lo toglie', () => {
    const a = app();
    const d = giorni(a, 5);
    a.eval(`reminderModal(null, '${d}')`);
    compila(a, { 'rem-title': 'Sollecitare SKF', 'rem-date': d, 'rem-grav': 'media', 'rem-job': '', 'rem-notes': '' });
    a.eval('reminderSave(null)');
    const r = a.eval('JSON.stringify(db.reminders)');
    const lista = JSON.parse(r);
    assert.equal(lista.length, 1);
    assert.ok(lista[0].createdAt, 'porta i timestamp come ogni record');
    const e = eventi(a);
    assert.equal(e[0].testo, 'Sollecitare SKF');
    assert.equal(e[0].gravita, 'media');
    a.eval(`reminderDone('${lista[0].id}')`);
    assert.deepEqual(eventi(a), []);
    assert.equal(a.eval('db.reminders.length'), 1, 'fatto non vuol dire cancellato');
  });

  it('senza titolo o senza data non si salva', () => {
    const a = app();
    a.eval('reminderModal(null)');
    compila(a, { 'rem-title': '', 'rem-date': oggi(a), 'rem-grav': 'info', 'rem-job': '', 'rem-notes': '' });
    a.eval('reminderSave(null)');
    compila(a, { 'rem-title': 'x', 'rem-date': '' });
    a.eval('reminderSave(null)');
    assert.equal(a.eval('(db.reminders || []).length'), 0);
  });

  it('un promemoria scaduto diventa rosso, qualunque importanza avesse', () => {
    const a = app();
    a.eval(`db.reminders = [{ id: 'r1', title: 'x', date: '2020-01-01', gravita: 'info', active: true }]`);
    assert.equal(eventi(a)[0].gravita, 'alta');
  });

  it('un lettore non li crea e non li chiude', () => {
    const a = app(null, 'lettore');
    a.eval(`db.reminders = [{ id: 'r1', title: 'x', date: oggiISO(), gravita: 'info', active: true }]`);
    a.eval('reminderSave(null); reminderDone("r1")');
    assert.equal(a.eval('db.reminders.length'), 1);
    assert.equal(a.eval('db.reminders[0].done'), undefined);
    a.eval('renderHome()');
    assert.ok(!a.html('view-home').includes('+ Promemoria'), 'il pulsante non si offre a chi non può usarlo');
  });

  it('eliminato finisce nel cestino e si può riavere', () => {
    const a = app();
    a.eval(`Store.insert('reminders', { id: 'r1', title: 'x', date: oggiISO(), gravita: 'info', active: true })`);
    a.eval('reminderDelete("r1"); confirmYes();');
    assert.equal(a.eval('db.reminders.length'), 0);
    assert.equal(a.eval('db.trash.filter(t => t.coll === "reminders").length'), 1);
  });

  it('la migrazione crea la collezione vuota sui database vecchi', () => {
    const a = app();
    a.eval('delete db.reminders; migrateDB();');
    assert.equal(a.eval('Array.isArray(db.reminders) && db.reminders.length'), 0);
  });
});

// 0.98.0: l'avvio delle fasi programmate degli ODP lanciati, e i filtri per tipo.
describe('Calendario: avvio delle fasi degli ordini di produzione', () => {
  function conOdp(stato) {
    const a = app();
    a.eval(`db.suppliers = [{ id: 'beta', name: 'Beta', active: true }];
      db.items = [{ id: 'p1', code: 'P1', name: 'Perno', type: 'parte', uom: 'pz', cycle: [], active: true }];
      db.prodOrders = [{ id: 'odp1', number: 'ODP-2026-001', itemId: 'p1', qty: 5, status: '${stato}', active: true, dueDate: addDays(oggiISO(), 30),
        phases: [
          { id: 'f1', seq: 10, opIndex: 0, wcName: 'Tornio', supplierId: null, plannedStart: addDays(oggiISO(), -2), plannedEnd: addDays(oggiISO(), 1) },
          { id: 'f2', seq: 20, opIndex: 1, wcName: 'Zincatura', supplierId: 'beta', supplierName: 'Beta', plannedStart: addDays(oggiISO(), 20), plannedEnd: addDays(oggiISO(), 25) },
          { id: 'f3', seq: 30, opIndex: 2, wcName: 'Passivazione', supplierId: 'beta', supplierName: 'Beta', plannedStart: addDays(oggiISO(), 20), plannedEnd: addDays(oggiISO(), 25) },
        ] }];
      db.prodDecls = []; invalidateCaches();`);
    return a;
  }
  const fasi = a => eventi(a).filter(e => e.tipo === 'fase');

  it('ogni giorno d\'avvio di un ODP lanciato è una voce; la tratta dal terzista è una sola', () => {
    const a = conOdp('lanciato');
    const f = fasi(a);
    assert.equal(f.length, 2);
    assert.equal(f[0].testo, 'Avviare fase 10 di ODP-2026-001');
    assert.equal(f[0].gravita, 'alta', 'doveva partire due giorni fa');
    assert.equal(f[1].testo, 'Avviare fasi 20, 30 di ODP-2026-001');
    assert.match(f[1].dettaglio, /P1 — Beta/);
    assert.match(f[1].azione, /homeApri\('odp','odp1'\)/);
  });

  it('una fase avviata non chiede più di essere avviata', () => {
    const a = conOdp('corso');
    a.eval(`db.prodDecls.push({ id: 'd1', odpId: 'odp1', phaseId: 'f1', kind: 'avvio', date: oggiISO() }); invalidateCaches();`);
    assert.deepEqual(fasi(a).map(e => e.testo), ['Avviare fasi 20, 30 di ODP-2026-001']);
  });

  it('un ODP in bozza o chiuso non mette fasi in calendario', () => {
    assert.equal(fasi(conOdp('bozza')).length, 0);
    assert.equal(fasi(conOdp('chiuso')).length, 0);
  });
});

describe('Calendario: filtri per tipo', () => {
  function popolato() {
    const a = app();
    a.eval(`db.jobs = [{ id: 'j1', number: 'COM-1', status: 'aperta', dueDate: '2020-01-01', active: true }];
      db.reminders = [{ id: 'r1', title: 'Collaudo', date: oggiISO(), gravita: 'info', active: true }];
      homeCalNascosti = null; localStorage.removeItem(CAL_FILTRI_KEY); renderHome();`);
    return a;
  }

  it('ogni tipo di scadenza ha il suo filtro', () => {
    const a = app();
    const tipi = ['commessa', 'piano', 'programma', 'fabbisogno', 'ordine', 'richiesta', 'fase', 'produzione', 'promemoria'];
    tipi.forEach(t => assert.ok(a.eval(`!!calFiltroDi('${t}')`), t));
  });

  it('spegnere un tipo lo toglie da scadute, giorno e prossimi, e lo dice', () => {
    const a = popolato();
    let h = a.html('view-home');
    assert.match(h, /COM-1/);
    assert.match(h, /Collaudo/);
    a.eval("homeCalFiltro('commesse')");
    h = a.html('home-cal');
    assert.doesNotMatch(h, /Scadute e non risolte/);
    assert.match(h, /Collaudo/, 'gli altri tipi restano');
    assert.match(h, /1 scadenza nascosta dai filtri/);
    assert.match(h, /aria-pressed="false"[^>]*>Commesse/);
  });

  it('la scelta si ricorda in questo browser, e «Mostra tutto» la azzera', () => {
    const a = popolato();
    a.eval("homeCalFiltro('promemoria')");
    assert.equal(a.eval('localStorage.getItem(CAL_FILTRI_KEY)'), '["promemoria"]');
    a.eval('homeCalNascosti = null; renderHome()');
    assert.doesNotMatch(a.html('view-home'), /Collaudo/);
    a.eval('homeCalTutti()');
    assert.match(a.html('home-cal'), /Collaudo/);
    assert.equal(a.eval('localStorage.getItem(CAL_FILTRI_KEY)'), '[]');
  });

  it('una preferenza illeggibile non rompe niente: si vede tutto', () => {
    const a = popolato();
    a.eval(`localStorage.setItem(CAL_FILTRI_KEY, '{rotto'); homeCalNascosti = null; renderHome();`);
    assert.match(a.html('view-home'), /Collaudo/);
  });
});
