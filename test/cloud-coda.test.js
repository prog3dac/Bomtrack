// La coda d'invio dell'archivio condiviso quando qualcosa va storto (0.105.6):
// un rinnovo del token che trova Auth in difficoltà, un'uscita che non chiude
// gli altri PC, una distinta che arriva senza il suo articolo, un documento di
// conto lavoro in modifica, le impostazioni di due amministratori, un rifiuto
// per permesso e un record che il server non accetta. Le prime prove girano
// senza server; le altre contro il Supabase finto (test/supabase-finto.js),
// con il Postgres vero dietro.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp, makeStorage } = require('./harness.js');
const { dbCloudCompleto, U } = require('./fixtures.js');
const pg = require('./pg.js');

const ev = (a, code) => JSON.parse(a.eval(`JSON.stringify(${code})`));
function appCondivisa(db) {
  const storage = makeStorage();
  storage.setItem('bomtrack_cloud', JSON.stringify({ url: 'http://x', chiave: 'k', allineato: true }));
  const a = loadApp({ silent: true, storage });
  a.seedStorage(db);
  a.eval('Store.load(); Store.markSynced();');
  return a;
}
// Un fetch finto che risponde sempre allo stesso modo e si segna gli indirizzi.
function fetchFinto(a, stato, corpo) {
  const chiamate = [];
  a.ctx.fetch = async (url, o) => {
    chiamate.push({ url, metodo: o && o.method });
    return { ok: stato >= 200 && stato < 300, status: stato, text: async () => (corpo === undefined ? '' : JSON.stringify(corpo)) };
  };
  return chiamate;
}
const SESSIONE_SCADUTA = { access_token: 'a', refresh_token: 'r', expires_at: 1, user: { id: 'u', email: 'a@x.it' } };
const ID = { item: U(7), g1: U(10), ord: U(17), s1: U(1), odl: U(25) };

describe('Archivio condiviso — la sessione', () => {
  // Punto 4: un 503 o un 429 di Auth durante il rinnovo buttava fuori l'utente,
  // e senza sessione nemmeno la copia locale si apriva più.
  it('un errore passeggero di Auth nel rinnovo tiene la sessione', async () => {
    for (const stato of [503, 502, 429]) {
      const a = appCondivisa(dbCloudCompleto());
      a.eval(`cloudScrivi(CLOUD_SESS_KEY, ${JSON.stringify(SESSIONE_SCADUTA)})`);
      fetchFinto(a, stato, { message: 'Service Unavailable' });
      const e = await a.eval('cloudToken().then(() => null, e => ({ cloud: e.cloud, msg: e.message }))');
      assert.ok(e, 'il token non c\'è');
      assert.notEqual(e.cloud, 'accesso', `HTTP ${stato}: non è una sessione finita`);
      assert.ok(a.eval('!!cloudSessione()'), `HTTP ${stato}: la sessione resta, e si riprova al giro dopo`);
    }
  });

  it('un rifiuto vero del rinnovo chiude la sessione', async () => {
    const a = appCondivisa(dbCloudCompleto());
    a.eval(`cloudScrivi(CLOUD_SESS_KEY, ${JSON.stringify(SESSIONE_SCADUTA)})`);
    fetchFinto(a, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
    const e = await a.eval('cloudToken().then(() => null, e => ({ cloud: e.cloud }))');
    assert.equal(e.cloud, 'accesso');
    assert.equal(a.eval('cloudSessione()'), null);
  });

  // Punto 33: il logout senza scope è «global» e chiudeva lo stesso utente su ogni PC.
  it('uscire chiude la sessione di questo PC soltanto', async () => {
    const a = appCondivisa(dbCloudCompleto());
    a.eval(`cloudScrivi(CLOUD_SESS_KEY, ${JSON.stringify(SESSIONE_SCADUTA)})`);
    const chiamate = fetchFinto(a, 204);
    await a.eval('cloudEsci()');
    assert.equal(chiamate.length, 1);
    assert.match(chiamate[0].url, /\/auth\/v1\/logout\?scope=local$/);
  });
});

describe('Archivio condiviso — quello che arriva, nei casi di confine', () => {
  const risposta = t => ({ now: '2026-05-01T00:00:00Z', tables: t.tables || {}, removed: t.removed || {}, settings: null });
  // Punto 5: le righe di distinta arrivate senza il loro articolo (le due
  // letture di pull_changes non vedono lo stesso istante) si aggiungevano a
  // quelle che c'erano: la distinta raddoppiava.
  it('una distinta arrivata senza il suo articolo si rifà, non si raddoppia', () => {
    const a = appCondivisa(dbCloudCompleto());
    const righe = ev(a, `dbVersoCloud({ items: [Store.getById('items', '${ID.g1}')] }).item_components`);
    const prima = ev(a, `Store.getById('items', '${ID.g1}').components`);
    assert.ok(prima.length >= 2);
    const n = a.eval(`cloudApplica(db, ${JSON.stringify(risposta({ tables: { item_components: righe } }))})`);
    assert.equal(ev(a, `Store.getById('items', '${ID.g1}').components.length`), prima.length, 'era il doppio');
    assert.equal(n, 0, 'la stessa distinta: niente di cambiato');
    // Un componente in meno, sempre senza l'articolo: l'insieme si rifà.
    a.eval(`cloudApplica(db, ${JSON.stringify(risposta({ tables: { item_components: righe.slice(1) } }))})`);
    assert.equal(ev(a, `Store.getById('items', '${ID.g1}').components.length`), prima.length - 1);
  });

  // Trovato strada facendo: il margine di ricezione ripesca i ricevimenti già
  // noti, e il ricevuto della riga spariva senza ricalcolo né salvataggio. Al
  // giro dopo la riga risultava modificata qui e ripartiva.
  it('un ricevimento già noto, ripescato dal margine, non tocca la riga', () => {
    const a = appCondivisa(dbCloudCompleto());
    const ev1 = ev(a, `dbVersoCloud({ receipts: db.receipts }).order_receipts`);
    a.eval(`Store.applicaRemoto(d => cloudApplica(d, ${JSON.stringify(risposta({ tables: { order_receipts: ev1 } }))}))`);
    assert.equal(ev(a, `Store.getById('orders', '${ID.ord}').lines[0].received`), 40);
    assert.equal(a.eval(`cloudApplica(db, ${JSON.stringify(risposta({ tables: { order_receipts: ev1 } }))})`), 0);
    assert.equal(ev(a, `Store.getById('orders', '${ID.ord}').lines[0].received`), 40);
    assert.equal(a.eval('Store.hasPendingChanges()'), false);
  });

  // Punto 25: un ODL con modifiche non salvate non fermava la ricezione.
  it('un ordine di lavoro in modifica ferma la ricezione come gli altri documenti', () => {
    const a = appCondivisa(dbCloudCompleto());
    assert.equal(a.eval('cloudPuoApplicare()'), true);
    assert.equal(a.eval('odlDirty = true; cloudPuoApplicare()'), false);
    assert.equal(a.eval('odlDirty = false; orderDirty = true; cloudPuoApplicare()'), false);
  });

  it('dopo un reset non resta aperto l\'ordine di lavoro di prima', () => {
    const a = appCondivisa(dbCloudCompleto());
    a.eval(`currentOdlId = '${ID.odl}'; odlView = 'edit'; odlUnlockedId = '${ID.odl}'; odlDirty = true; docFilters.odl.q = 'x';`);
    a.eval('resetViewState()');
    assert.deepEqual(ev(a, '[currentOdlId, odlView, odlUnlockedId, odlDirty, docFilters.odl.q]'), [null, 'list', null, false, '']);
  });
});

// ═══════════════════════════════════════════════════════════
//  Contro il server
// ═══════════════════════════════════════════════════════════
describe('Archivio condiviso — la coda non si blocca', () => {
  if (!pg.disponibile()) {
    it('saltato: BOMTRACK_PG non impostata (vedi test/pg.js)', () => {});
    return;
  }
  const { avviaSupabaseFinto } = require('./supabase-finto.js');
  let fila = Promise.resolve();
  const passo = (nome, fn) => it(nome, () => { const p = fila.then(fn); fila = p.catch(() => {}); return p; });
  let srv, A, B, C, anna, bruno, carla;
  const giro = a => a.eval('cloudGiro()');
  const avvisi = a => a.ctx.__avvisi.splice(0);
  const pc = (seed) => {
    const st = makeStorage();
    st.setItem('bomtrack_cloud', JSON.stringify({ url: srv.url, chiave: srv.chiave, allineato: false }));
    const a = loadApp({ silent: true, storage: st });
    a.ctx.fetch = fetch;
    if (seed) a.seedStorage(seed);
    a.eval('Store.load(); cloudAvvio(); globalThis.__avvisi = []; showToast = m => __avvisi.push(m);');
    return a;
  };

  passo('tre PC sullo stesso archivio: due amministratori e un collega degli acquisti', async () => {
    srv = await avviaSupabaseFinto();
    anna = srv.crea('a@x.it', 'pa', 'Anna');
    bruno = srv.crea('b@x.it', 'pb', 'Bruno');
    carla = srv.crea('c@x.it', 'pc', 'Carla');
    const db = dbCloudCompleto();
    db.users.push({ id: U(801), name: 'Bruno', email: 'b@x.it', role: 'acquisti', active: true, createdAt: '2026-03-01T08:00:00.000Z', updatedAt: '2026-03-01T08:00:00.000Z' });
    db.users.push({ id: U(802), name: 'Carla', email: 'c@x.it', role: 'admin', active: true, createdAt: '2026-03-01T08:00:00.000Z', updatedAt: '2026-03-01T08:00:00.000Z' });
    A = pc(db);
    const e = await A.eval(`cloudAccediConPassword('a@x.it', 'pa').then(() => cloudDopoAccesso())`);
    await A.eval(`cloudCaricaArchivio(${JSON.stringify(e.stato)})`);
    A.eval(`currentUser = getUser('${anna}'); Store.setActor(currentUser.id);`);
    B = pc();
    await B.eval(`cloudAccediConPassword('b@x.it', 'pb').then(() => cloudDopoAccesso())`);
    await B.eval('cloudScaricaArchivio()');
    B.eval(`currentUser = getUser('${bruno}'); Store.setActor(currentUser.id);`);
    C = pc();
    await C.eval(`cloudAccediConPassword('c@x.it', 'pc').then(() => cloudDopoAccesso())`);
    await C.eval('cloudScaricaArchivio()');
    C.eval(`currentUser = getUser('${carla}'); Store.setActor(currentUser.id);`);
    assert.equal(B.eval('currentUser.role'), 'acquisti');
    assert.equal(C.eval('currentUser.role'), 'admin');
  });

  // Punto 6: le impostazioni partivano intere e senza controllo: l'amministratore
  // con la copia indietro riportava indietro quelle del collega.
  passo('due amministratori che cambiano impostazioni diverse le tengono tutte e due', async () => {
    A.eval(`db.settings.currency = 'CHF'; saveDB();`);
    assert.equal(await giro(A), true);
    assert.equal(srv.db.sql(`select data->>'currency' from settings`), 'CHF');
    // Carla non ha ancora ricevuto: la sua copia dice ancora la valuta di prima.
    C.eval(`db.settings.marginPct = 33; saveDB();`);
    assert.equal(await giro(C), true);
    assert.equal(srv.db.sql(`select data->>'currency' || ' ' || (data->>'marginPct') from settings`), 'CHF 33', 'la valuta di Anna resta');
    assert.equal(C.eval('db.settings.currency'), 'CHF', 'e Carla la riceve');
    await giro(A);
    assert.equal(A.eval('db.settings.marginPct'), 33);
    assert.equal(A.eval('Store.hasPendingChanges()') || C.eval('Store.hasPendingChanges()'), false);
  });

  passo('la stessa impostazione cambiata da due: vince chi invia per ultimo, come prima', async () => {
    A.eval(`db.settings.overheadPct = 10; saveDB();`);
    C.eval(`db.settings.overheadPct = 20; saveDB();`);
    await giro(A); await giro(C);
    assert.equal(srv.db.sql(`select data->>'overheadPct' from settings`), '20');
    await giro(A);
    assert.equal(A.eval('db.settings.overheadPct'), 20);
  });

  // Punto 31: un rifiuto per permesso teneva il lotto in testa alla coda per
  // sempre, e con lui ogni modifica legittima e la ricezione.
  passo('un rifiuto per permesso scarta solo quello che il ruolo non scrive, e il resto parte', async () => {
    const nome = srv.db.sql(`select name from items where id = '${ID.item}'`);
    B.eval(`Store.update('items', '${ID.item}', { name: 'Tentativo di Bruno' })`);
    B.eval(`{ const o = Store.getById('orders', '${ID.ord}'); o.title = 'Titolo di Bruno'; touch(o); saveDB(); }`);
    avvisi(B);
    assert.equal(await giro(B), true, 'la coda non resta ferma');
    assert.equal(srv.db.sql(`select title from orders where id = '${ID.ord}'`), 'Titolo di Bruno', 'la modifica permessa è arrivata');
    assert.equal(srv.db.sql(`select name from items where id = '${ID.item}'`), nome);
    assert.equal(B.eval(`Store.getById('items', '${ID.item}').name`), nome, 'l\'articolo torna come sul server');
    assert.equal(B.eval('Store.hasPendingChanges()'), false);
    assert.match(avvisi(B).join(' | '), /non può modificare/);
    // E la ricezione riprende.
    A.eval(`Store.update('suppliers', '${ID.s1}', { notes: 'nota di Anna' })`);
    await giro(A);
    await giro(B);
    assert.equal(B.eval(`Store.getById('suppliers', '${ID.s1}').notes`), 'nota di Anna');
  });

  passo('un articolo nuovo che il ruolo non scrive se ne va, senza portarsi via il resto', async () => {
    B.eval(`db.items.push(stampNew({ id: '${U(950)}', code: 'X-NUOVO', name: 'Nuovo di Bruno', type: 'acquistato', uom: 'pz', active: true, priceList: [] })); saveDB();`);
    B.eval(`{ const o = Store.getById('orders', '${ID.ord}'); o.notes = 'nota di Bruno'; touch(o); saveDB(); }`);
    assert.equal(await giro(B), true);
    assert.equal(B.eval(`!!Store.getById('items', '${U(950)}')`), false);
    assert.equal(srv.db.sql(`select count(*) from items where id = '${U(950)}'`), '0');
    assert.equal(srv.db.sql(`select notes from orders where id = '${ID.ord}'`), 'nota di Bruno');
    assert.equal(B.eval('Store.hasPendingChanges()'), false);
  });

  // Il miglioramento: un record che il server rifiuta per un motivo che l'app
  // non sa riparare blocca la coda; l'uscita era solo «Scarta e riscarica», che
  // buttava tutto il lavoro in attesa.
  passo('un record rifiutato blocca la coda; «Scarta solo i rifiutati» manda il resto', async () => {
    srv.db.sql(`create or replace function public.rifiuta_prova() returns trigger language plpgsql as $$
      begin if new.name = 'Rifiutami' then raise exception 'nome non ammesso'; end if; return new; end $$;
      create trigger rifiuta_prova before insert or update on public.items for each row execute function public.rifiuta_prova();`);
    try {
      await giro(A);   // la copia di Anna al passo con le note di Bruno
      const nome = srv.db.sql(`select name from items where id = '${ID.item}'`);
      A.eval(`Store.update('items', '${ID.item}', { name: 'Rifiutami' })`);
      A.eval(`Store.update('items', '${ID.g1}', { notes: 'nota sul gruppo' })`);
      A.eval(`Store.update('suppliers', '${ID.s1}', { notes: 'nota di Anna, bloccata' })`);
      A.eval(`{ const o = Store.getById('orders', '${ID.ord}'); o.title = 'Titolo di Anna'; touch(o); saveDB(); }`);
      assert.equal(await giro(A), false);
      assert.match(A.eval('_cloud.messaggio'), /nome non ammesso/);
      assert.match(A.eval('_cloud.messaggio'), /Scarta solo i rifiutati/, 'il messaggio dice l\'uscita');
      assert.notEqual(srv.db.sql(`select title from orders where id = '${ID.ord}'`), 'Titolo di Anna');
      avvisi(A);
      const esito = JSON.parse(JSON.stringify(await A.eval('cloudScartaRifiutati()')));
      assert.equal(esito.scartati, 1);
      assert.equal(srv.db.sql(`select title from orders where id = '${ID.ord}'`), 'Titolo di Anna');
      assert.equal(srv.db.sql(`select notes from suppliers where id = '${ID.s1}'`), 'nota di Anna, bloccata');
      assert.equal(srv.db.sql(`select notes from items where id = '${ID.g1}'`), 'nota sul gruppo', 'l\'altro articolo è partito');
      assert.equal(srv.db.sql(`select name from items where id = '${ID.item}'`), nome);
      assert.equal(A.eval(`Store.getById('items', '${ID.item}').name`), nome, 'il rifiutato torna come sul server');
      assert.equal(A.eval('Store.hasPendingChanges()'), false);
      assert.match(avvisi(A).join(' | '), /Barra|MAT-ACC-BAR-001/, 'e si dice quale');
      assert.equal(await giro(A), true);
      assert.equal(A.eval('_cloud.stato'), 'ok');
      await giro(B);
      assert.equal(B.eval(`Store.getById('orders', '${ID.ord}').title`), 'Titolo di Anna');
    } finally {
      srv.db.sql('drop trigger rifiuta_prova on public.items; drop function public.rifiuta_prova();');
    }
  });

  passo('un record cancellato qui e rifiutato dal server torna', async () => {
    srv.db.sql(`create or replace function public.rifiuta_prova() returns trigger language plpgsql as $$
      begin raise exception 'i promemoria non si cancellano'; end $$;
      create trigger rifiuta_prova before delete on public.reminders for each row execute function public.rifiuta_prova();`);
    try {
      const rem = U(35);
      A.eval(`Store.remove('reminders', '${rem}')`);
      A.eval(`Store.update('suppliers', '${ID.s1}', { notes: 'dopo la cancellazione' })`);
      assert.equal(await giro(A), false);
      const esito = JSON.parse(JSON.stringify(await A.eval('cloudScartaRifiutati()')));
      assert.equal(esito.scartati, 1);
      assert.equal(srv.db.sql(`select notes from suppliers where id = '${ID.s1}'`), 'dopo la cancellazione');
      assert.equal(A.eval(`!!Store.getById('reminders', '${rem}')`), true, 'il promemoria è tornato');
      assert.equal(A.eval(`db.trash.some(t => t.record && t.record.id === '${rem}')`), false, 'e non è anche nel cestino');
      assert.equal(A.eval('Store.hasPendingChanges()'), false);
    } finally {
      srv.db.sql('drop trigger rifiuta_prova on public.reminders; drop function public.rifiuta_prova();');
      await srv.chiudi();
    }
  });
});
