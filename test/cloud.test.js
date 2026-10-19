// L'archivio condiviso (cloud.js): invio, ricezione, primo collegamento.
//
// Due parti. La prima prova le due traduzioni — dal conto delle modifiche al
// lotto di push_changes(), e dalla risposta di pull_changes() all'archivio
// locale — senza rete né server. La seconda fa lavorare più PC veri (l'app
// intera, ciascuno con il suo localStorage) contro il Supabase finto di
// test/supabase-finto.js, che dietro ha Postgres con supabase/schema.sql: le
// stesse funzioni, le stesse policy e gli stessi trigger della produzione.
// Gira dove c'è un Postgres (BOMTRACK_PG, vedi test/pg.js).

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp, makeStorage } = require('./harness.js');
const { makeDb, dbCloudCompleto, U } = require('./fixtures.js');
const pg = require('./pg.js');

const ev = (a, code) => JSON.parse(a.eval(`JSON.stringify(${code})`));
// Un'app in modo condiviso con il suo archivio già caricato, e la fotografia
// presa: quello che c'è adesso è «già inviato».
function appCondivisa(db) {
  const storage = makeStorage();
  storage.setItem('bomtrack_cloud', JSON.stringify({ url: 'http://x', chiave: 'k', allineato: true }));
  const a = loadApp({ silent: true, storage });
  a.seedStorage(db);
  a.eval('Store.load(); Store.markSynced();');
  return a;
}
const ID = { item: U(7), pr1: U(12), pr2: U(13), ord: U(17), ol1: U(18), rc1: U(30), rem: U(35), fam: U(4), sub: U(5) };

describe('Archivio condiviso — il lotto da inviare', () => {
  it('un articolo cambiato viaggia da solo, con la sua posizione', () => {
    const a = appCondivisa(dbCloudCompleto());
    a.eval(`Store.update('items', '${ID.item}', { name: 'Barra tonda' })`);
    const p = ev(a, `cloudPayload(Store.pendingChanges(), new Date(Date.now() - 60000).toISOString(), true).payload`);
    assert.deepEqual(Object.keys(p.upsert).sort(), ['items']);
    assert.equal(p.upsert.items.length, 1);
    assert.equal(p.upsert.items[0].name, 'Barra tonda');
    assert.equal(p.upsert.items[0].pos, 0, 'la posizione nella collezione intera');
    assert.equal(p.remove, undefined);
  });

  it('di un padre già noto partono solo le righe cambiate', () => {
    const a = appCondivisa(dbCloudCompleto());
    a.eval(`{ const it = Store.getById('items', '${ID.item}'); it.priceList.find(p => p.id === '${ID.pr2}').price = 5.1; saveDB(); }`);
    const p = ev(a, `cloudPayload(Store.pendingChanges(), new Date(Date.now() - 60000).toISOString(), true).payload`);
    assert.deepEqual(p.upsert.item_prices.map(r => r.id), [ID.pr2], 'la quotazione non toccata resta a casa');
  });

  it('un padre nuovo manda tutte le sue righe', () => {
    const a = appCondivisa(dbCloudCompleto());
    a.eval(`{ const o = JSON.parse(JSON.stringify(Store.getById('orders', '${ID.ord}')));
      o.id = '${U(600)}'; o.number = 'ODA-2026-002'; o.lines[0].id = '${U(601)}'; o.lines[0].updatedAt = '2020-01-01T00:00:00.000Z';
      db.orders.push(o); saveDB(); }`);
    const p = ev(a, `cloudPayload(Store.pendingChanges(), new Date().toISOString(), true).payload`);
    assert.deepEqual(p.upsert.order_lines.map(r => r.id), [U(601)], 'anche con una data vecchia: il server non l\'ha mai vista');
  });

  it('le righe tolte e i record eliminati diventano cancellazioni', () => {
    const a = appCondivisa(dbCloudCompleto());
    a.eval(`{ const pl = Store.getById('items', '${ID.item}').priceList; pl.splice(pl.findIndex(p => p.id === '${ID.pr2}'), 1); saveDB(); } Store.remove('reminders', '${ID.rem}');`);
    const p = ev(a, `cloudPayload(Store.pendingChanges(), null, true).payload`);
    assert.deepEqual(p.remove.item_prices, [ID.pr2]);
    assert.deepEqual(p.remove.reminders, [ID.rem]);
    assert.ok(p.upsert.trash, 'il cestino viaggia: è la rete sotto le eliminazioni di tutti');
  });

  it('le impostazioni partono solo con la gestione', () => {
    const a = appCondivisa(dbCloudCompleto());
    a.eval(`db.settings.currency = 'CHF'; saveDB();`);
    const si = ev(a, `cloudPayload(Store.pendingChanges(), null, true)`);
    assert.equal(si.payload.settings.data.currency, 'CHF');
    const no = ev(a, `cloudPayload(Store.pendingChanges(), null, false)`);
    assert.equal(no.payload.settings, undefined);
    assert.equal(no.impostazioniTenute, true);
  });

  it('la fotografia salvata tiene in coda una modifica anche dopo un riavvio', () => {
    const a = appCondivisa(dbCloudCompleto());
    a.eval('cloudSalvaBase()');
    a.eval(`Store.update('items', '${ID.item}', { name: 'Modificato offline' })`);
    // Riavvio: stesso archivio, app nuova. Il caricamento rifotografa l'adesso;
    // cloudAvvio() rimette la fotografia dell'ultimo invio.
    const b = loadApp({ silent: true, storage: a.storage });
    b.eval('Store.load()');
    assert.equal(b.eval('Store.hasPendingChanges()'), false, 'senza la fotografia la modifica sarebbe persa');
    b.eval('cloudAvvio()');
    assert.deepEqual(ev(b, 'Store.pendingChanges()').items.upsert, [ID.item]);
  });
});

describe('Archivio condiviso — quello che arriva', () => {
  const risposta = t => ({ now: '2026-05-01T00:00:00Z', tables: t.tables || {}, removed: t.removed || {}, settings: t.settings || null });
  it('un record cambiato si sostituisce e tiene le sue righe', () => {
    const a = appCondivisa(dbCloudCompleto());
    const riga = ev(a, `dbVersoCloud({ items: [Store.getById('items', '${ID.item}')] }).items[0]`);
    riga.name = 'Dal collega'; riga.updated_at = '2026-05-01T00:00:00.000Z';
    a.eval(`cloudApplica(db, ${JSON.stringify(risposta({ tables: { items: [riga] } }))})`);
    const it = ev(a, `Store.getById('items', '${ID.item}')`);
    assert.equal(it.name, 'Dal collega');
    assert.equal(it.priceList.length, 2, 'le quotazioni arrivano dalla loro tabella: quelle locali restano');
  });

  it('una riga per riga si fonde, una distinta si rifà', () => {
    const a = appCondivisa(dbCloudCompleto());
    const g1 = U(10);
    const righe = ev(a, `dbVersoCloud({ items: [Store.getById('items', '${g1}')] })`);
    righe.item_components = [righe.item_components[0]];   // il collega ha tolto un componente
    const prezzo = ev(a, `dbVersoCloud({ items: [Store.getById('items', '${ID.item}')] }).item_prices[0]`);
    prezzo.price = 9.9;
    a.eval(`cloudApplica(db, ${JSON.stringify(risposta({ tables: { items: righe.items, item_components: righe.item_components, item_prices: [prezzo] } }))})`);
    assert.equal(ev(a, `Store.getById('items', '${g1}').components.length`), 1);
    const pl = ev(a, `Store.getById('items', '${ID.item}').priceList`);
    assert.deepEqual(pl.map(p => p.price), [9.9, 4.8], 'cambia solo la riga arrivata, al suo posto');
  });

  // 0.105.5: il margine di ricezione ripesca sempre le ultime righe, e ogni
  // giro risalvava l'archivio anche senza niente di nuovo.
  it('righe uguali a quelle che ci sono non contano come cambiate', () => {
    const a = appCondivisa(dbCloudCompleto());
    const g1 = U(10);
    const t = ev(a, `dbVersoCloud({ items: [Store.getById('items', '${g1}'), Store.getById('items', '${ID.item}')] })`);
    a.eval(`Store.applicaRemoto(d => cloudApplica(d, ${JSON.stringify(risposta({ tables: t }))}))`);   // i campi solo locali se ne vanno qui
    const impostazioni = ev(a, 'db.settings');
    assert.equal(a.eval(`cloudApplica(db, ${JSON.stringify(risposta({ tables: t, settings: { data: impostazioni } }))})`), 0);
    // Le impostazioni del server, uguali a meno di un '' che lì è null: restano quelle di qui,
    // o al giro dopo risulterebbero una modifica da rimandare (e il giro non finirebbe mai).
    a.eval('db.settings.__vuoto = ""; globalThis.__prima = db.settings;');
    assert.equal(a.eval(`cloudApplica(db, ${JSON.stringify(risposta({ settings: { data: impostazioni } }))}) + (db.settings === __prima ? 'stesse' : 'sostituite')`), '0stesse');
    let salvati = 0;
    a.ctx.__conta = () => salvati++;
    a.eval('{ const c = Store.commit; Store.commit = function () { __conta(); return c.apply(this, arguments); }; }');
    assert.equal(a.eval(`Store.applicaRemoto(d => cloudApplica(d, ${JSON.stringify(risposta({ tables: t }))}))`), true);
    assert.equal(salvati, 0, 'niente di nuovo, niente da salvare');
    t.item_components = [t.item_components[0]];
    assert.ok(a.eval(`cloudApplica(db, ${JSON.stringify(risposta({ tables: t }))})`) > 0, 'una distinta con un componente in meno è cambiata');
    t.item_prices[0].price = 9.9;
    assert.equal(a.eval(`cloudApplica(db, ${JSON.stringify(risposta({ tables: { item_prices: [t.item_prices[0]] } }))})`), 1);
  });

  it('le lapidi tolgono record e righe', () => {
    const a = appCondivisa(dbCloudCompleto());
    a.eval(`cloudApplica(db, ${JSON.stringify(risposta({ removed: { reminders: [ID.rem], item_prices: [ID.pr2] } }))})`);
    assert.equal(ev(a, 'db.reminders.length'), 0);
    assert.equal(ev(a, `Store.getById('items', '${ID.item}').priceList.length`), 1);
  });

  it('un ricevimento nuovo rifà il ricevuto della riga', () => {
    const a = appCondivisa(dbCloudCompleto());
    a.eval(`Store.applicaRemoto(d => cloudApplica(d, ${JSON.stringify(risposta({ tables: { order_receipts: [
      { id: U(700), coll: 'orders', order_id: ID.ord, line_id: ID.ol1, qty: 15, kind: 'ricevimento', date: '2026-05-01', note: '', updated_at: '2026-05-01T00:00:00.000Z' }] } }))}))`);
    assert.equal(ev(a, `Store.getById('orders', '${ID.ord}').lines[0].received`), 55);
    assert.equal(ev(a, 'Store.hasPendingChanges()'), false, 'quello che arriva non torna indietro');
  });
});

// ═══════════════════════════════════════════════════════════
//  Più PC, un server
// ═══════════════════════════════════════════════════════════
describe('Archivio condiviso — più PC contro Supabase (finto, con Postgres vero)', () => {
  if (!pg.disponibile()) {
    it('saltato: BOMTRACK_PG non impostata (vedi test/pg.js)', () => {});
    return;
  }
  const { avviaSupabaseFinto } = require('./supabase-finto.js');
  // I passi dipendono l'uno dall'altro: girano in fila.
  let fila = Promise.resolve();
  const passo = (nome, fn) => it(nome, () => { const p = fila.then(fn); fila = p.catch(() => {}); return p; });

  let srv, A, B, C, anna, bruno, dario;
  const pc = (storage) => {
    const st = storage || makeStorage();
    if (!storage) st.setItem('bomtrack_cloud', JSON.stringify({ url: srv.url, chiave: srv.chiave, allineato: false }));
    const a = loadApp({ silent: true, storage: st });
    a.ctx.fetch = fetch;
    return a;
  };
  const entra = (a, id) => a.eval(`currentUser = getUser('${id}'); Store.setActor(currentUser.id);`);
  const giro = a => a.eval('cloudGiro()');

  passo('il primo utente creato su Supabase è l\'amministratore, gli altri nascono sospesi', async () => {
    srv = await avviaSupabaseFinto();
    anna = srv.crea('a@x.it', 'pw-anna', 'Anna');
    bruno = srv.crea('b@x.it', 'pw-bruno', 'Bruno');
    assert.equal(srv.db.sql(`select role || ' ' || active from profiles where id = '${anna}'`), 'admin true');
    assert.equal(srv.db.sql(`select role || ' ' || active from profiles where id = '${bruno}'`), 'lettore false');
  });

  passo('l\'amministratore carica l\'archivio del suo PC; gli utenti passano per email', async () => {
    const db = dbCloudCompleto();
    db.users.push({ id: U(801), name: 'Bruno', email: 'B@x.it', role: 'acquisti', active: true, createdAt: '2026-03-01T08:00:00.000Z', updatedAt: '2026-03-01T08:00:00.000Z' });
    db.users.push({ id: U(802), name: 'Carlo', email: 'c@x.it', role: 'lettore', active: true, createdAt: '2026-03-01T08:00:00.000Z', updatedAt: '2026-03-01T08:00:00.000Z' });
    const st = makeStorage();
    st.setItem('bomtrack_cloud', JSON.stringify({ url: srv.url, chiave: srv.chiave, allineato: false }));
    A = loadApp({ silent: true, storage: st });
    A.ctx.fetch = fetch;
    A.seedStorage(db);
    A.eval('Store.load(); cloudAvvio();');
    assert.equal(A.eval('Store.modoCondiviso'), true);
    // Pezzi piccoli: il caricamento e lo scaricamento a pezzi passano di qui (0.105.4).
    A.eval('CLOUD_LOTTO_RIGHE = 2; CLOUD_PAGINA = 2;');
    const esito = await A.eval(`cloudAccediConPassword('a@x.it', 'pw-anna').then(() => cloudDopoAccesso())`);
    assert.equal(esito.primo, true);
    assert.equal(esito.stato.vuoto, true);
    const r = JSON.parse(JSON.stringify(await A.eval(`cloudCaricaArchivio(${JSON.stringify(esito.stato)})`)));
    assert.deepEqual(r.fuori.map(u => u.name), ['Carlo'], 'chi non ha un utente su Supabase resta fuori, e lo si dice');
    entra(A, anna);
    assert.equal(srv.db.sql('select count(*) from items'), '5');
    assert.equal(srv.db.sql(`select role || ' ' || active from profiles where id = '${bruno}'`), 'acquisti true', 'ruolo e stato dal PC che carica');
    assert.equal(srv.db.sql(`select created_by from items where code = 'MAT-ACC-BAR-001'`), '', 'nessun autore registrato nella fixture');
    assert.equal(A.eval(`Store.getAll('users').map(u => u.id).sort().join()`), [anna, bruno].sort().join(), 'gli id sono quelli di Supabase');
    assert.equal(A.eval('Store.hasPendingChanges()'), false);
    assert.equal(JSON.parse(A.storage.getItem('bomtrack_cloud')).allineato, true);
  });

  passo('un collega scarica l\'archivio condiviso al primo accesso', async () => {
    B = pc();
    B.eval('Store.load(); cloudAvvio(); CLOUD_PAGINA = 2;');
    const esito = await B.eval(`cloudAccediConPassword('b@x.it', 'pw-bruno').then(() => cloudDopoAccesso())`);
    assert.equal(esito.primo, true);
    assert.equal(esito.stato.vuoto, false);
    await B.eval('cloudScaricaArchivio()');
    entra(B, bruno);
    assert.equal(B.eval('db.items.length'), 5);
    assert.equal(B.eval(`Store.getById('orders', '${ID.ord}').lines[0].received`), 40, 'il ricevuto torna dagli eventi');
    assert.equal(B.eval('Store.hasPendingChanges()'), false, 'scaricare non crea niente da rimandare');
    assert.equal(B.eval(`currentUser.role`), 'acquisti');
  });

  passo('un giro senza novità non risalva l\'archivio', async () => {
    await giro(B);
    let salvati = 0;
    B.ctx.__conta = () => salvati++;
    B.eval('{ const c = Store.commit; Store.commit = function () { __conta(); return c.apply(this, arguments); }; }');
    await giro(B); await giro(B);
    assert.equal(salvati, 0, 'le righe ripescate dal margine sono uguali a quelle che ci sono');
  });

  // 0.105.4: uno schema di prima non ha pull_pagina, e lo scaricamento torna al pull intero.
  passo('con uno schema senza la lettura a pagine si scarica lo stesso', async () => {
    const testo = require('fs').readFileSync(require('path').join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
    const funzione = /create or replace function public\.pull_pagina[\s\S]*?\nend \$\$;/.exec(testo)[0];
    srv.db.sql('drop function public.pull_pagina(text, text, int);');
    try {
      const r = await B.eval('cloudPullTutto()');
      assert.equal(r.tables.items.length, 5);
    } finally {
      srv.db.sql(funzione + '\ngrant execute on function public.pull_pagina(text, text, int) to authenticated;');
    }
    assert.equal((await B.eval('cloudPullTutto()')).tables.items.length, 5);
  });

  // 0.105.4: dalla schermata d'accesso chiunque scollegava il PC, e poi
  // entrava da amministratore scegliendo la prima password.
  passo('dalla schermata d\'accesso scollega solo un amministratore, e il PC resta suo', async () => {
    const D = pc();
    D.ctx.location = { reload() { D.ctx.__ricaricato = true; } };
    D.eval('Store.load(); cloudAvvio(); cloudPannelloScollega();');
    D.el('cl-sc-email').value = 'b@x.it'; D.el('cl-sc-pw').value = 'pw-bruno';
    assert.equal(await D.eval('cloudScollegaDaFuori()'), false);
    assert.match(D.el('cl-sc-esito').textContent, /Solo un amministratore/);
    assert.ok(D.eval('cloudAttivo()'), 'resta collegato');
    D.el('cl-sc-email').value = 'a@x.it'; D.el('cl-sc-pw').value = 'pw-anna';
    assert.equal(await D.eval('cloudScollegaDaFuori()'), true);
    assert.equal(D.eval('cloudAttivo()'), false);
    assert.deepEqual(JSON.parse(D.storage.getItem('bomtrack_scollegato_da')), { id: anna });
    assert.equal(D.eval(`cloudPrimaPasswordPer({ id: '${anna}' }) && !cloudPrimaPasswordPer({ id: '${bruno}' })`), true);
  });

  // 0.105.4: la sessione di Supabase si rinnova da sola, e la durata scelta in
  // Gestione → Accesso valeva solo in locale.
  passo('la durata della sessione vale anche con l\'archivio condiviso', async () => {
    const D = pc();
    D.eval('Store.load(); cloudAvvio();');
    await D.eval(`cloudAccediConPassword('a@x.it', 'pw-anna')`);
    D.eval('cloudAggiornaConfig({ allineato: true }); db.settings.sessionDays = 30;');
    const sess = () => JSON.parse(D.storage.getItem('bomtrack_cloud_sessione'));
    assert.ok(Date.now() - Date.parse(sess().ts) < 60000, 'la sessione porta la data dell\'ultimo uso');
    D.eval(`cloudScrivi(CLOUD_SESS_KEY, Object.assign(cloudSessione(), { ts: new Date(Date.now() - 31 * 86400000).toISOString() }))`);
    assert.equal(D.eval('cloudRipristinaSessione()'), false);
    assert.equal(sess(), null, 'scaduta: si rientra con la password');
    await D.eval(`cloudAccediConPassword('a@x.it', 'pw-anna')`);
    D.eval(`cloudScrivi(CLOUD_SESS_KEY, Object.assign(cloudSessione(), { ts: new Date(Date.now() - 29 * 86400000).toISOString() }))`);
    D.eval('cloudRipristinaSessione()');
    assert.ok(sess(), 'dentro la durata resta');
  });

  passo('una modifica parte da sola e arriva all\'altro PC al giro', async () => {
    A.eval(`Store.update('items', '${ID.item}', { name: 'Barra tonda' })`);
    assert.equal(await giro(A), true);
    assert.equal(srv.db.sql(`select name from items where id = '${ID.item}'`), 'Barra tonda');
    assert.equal(await giro(B), true);
    assert.equal(B.eval(`Store.getById('items', '${ID.item}').name`), 'Barra tonda');
    assert.equal(B.eval('Store.hasPendingChanges()'), false);
  });

  passo('anche nell\'altro verso, con le righe del documento', async () => {
    B.eval(`{ const o = Store.getById('orders', '${ID.ord}'); o.title = 'Urgente'; o.lines[0].qty = 120; touch(o); saveDB(); }`);
    await giro(B);
    await giro(A);
    const o = ev(A, `Store.getById('orders', '${ID.ord}')`);
    assert.equal(o.title, 'Urgente');
    assert.equal(o.lines[0].qty, 120);
  });

  passo('due quotazioni sullo stesso articolo, da due PC, convivono', async () => {
    A.eval(`{ const it = Store.getById('items', '${ID.item}'); it.priceList.push({ id: '${U(901)}', supplierId: null, price: 4.2, minQty: '', leadDays: '', code: '', desc: 'da A', date: '2026-05-01', rfqId: null, note: '' }); saveDB(); }`);
    // Bruno è dell'ufficio acquisti: non scrive i listini. Scrive la terza,
    // Dario, che arriva adesso.
    dario = srv.crea('d@x.it', 'pw-dario', 'Dario');
    await giro(A);   // porta anche il profilo di Dario, ancora sospeso
    A.eval(`{ const u = getUser('${dario}'); u.role = 'progettazione'; u.active = true; touch(u); saveDB(); }`);
    await giro(A);
    assert.equal(srv.db.sql(`select role || ' ' || active from profiles where id = '${dario}'`), 'progettazione true');
    C = pc();
    C.eval('Store.load(); cloudAvvio();');
    await C.eval(`cloudAccediConPassword('d@x.it', 'pw-dario').then(() => cloudScaricaArchivio())`);
    entra(C, dario);
    C.eval(`{ const it = Store.getById('items', '${ID.item}'); it.priceList.push({ id: '${U(902)}', supplierId: null, price: 4.1, minQty: '', leadDays: '', code: '', desc: 'da C', date: '2026-05-01', rfqId: null, note: '' }); saveDB(); }`);
    await giro(C);
    await giro(A);
    const descr = ev(A, `Store.getById('items', '${ID.item}').priceList.map(p => p.desc)`);
    assert.ok(descr.includes('da A') && descr.includes('da C'), JSON.stringify(descr));
  });

  passo('chi salva per secondo una versione più vecchia la perde, e riceve quella che ha vinto', async () => {
    // A scrive prima, B dopo; A però manda per secondo.
    const tA = new Date(Date.now() + 1000).toISOString(), tB = new Date(Date.now() + 2000).toISOString();
    A.eval(`{ const o = Store.getById('orders', '${ID.ord}'); o.notes = 'nota di A'; o.updatedAt = '${tA}'; saveDB(); }`);
    B.eval(`{ const o = Store.getById('orders', '${ID.ord}'); o.notes = 'nota di B'; o.updatedAt = '${tB}'; saveDB(); }`);
    await giro(B);
    await giro(A);
    assert.equal(A.eval('_cloud.respinti.length'), 1, 'A lo sa');
    assert.equal(A.eval(`Store.getById('orders', '${ID.ord}').notes`), 'nota di B', 'e vede quella che ha vinto');
    assert.equal(srv.db.sql(`select notes from orders where id = '${ID.ord}'`), 'nota di B');
  });

  passo('una cancellazione arriva come cancellazione', async () => {
    A.eval(`Store.remove('reminders', '${ID.rem}')`);
    await giro(A);
    await giro(B);
    assert.equal(B.eval(`!!Store.getById('reminders', '${ID.rem}')`), false);
    assert.equal(B.eval(`db.trash.some(t => t.record && t.record.id === '${ID.rem}')`), true, 'ed è nel cestino di tutti');
  });

  // Fino alla 0.105.5 la coda restava ferma, e l'uscita era riscaricare tutto.
  // Ora la modifica che il ruolo non scrive si scarta da sola (test/cloud-coda.test.js).
  passo('quello che il ruolo non scrive il server lo rifiuta, e la modifica torna come sul server', async () => {
    B.eval(`Store.update('items', '${ID.item}', { name: 'Tentativo di Bruno' })`);
    assert.equal(await giro(B), true);
    assert.equal(B.eval('_cloud.stato'), 'ok');
    assert.equal(B.eval('Store.hasPendingChanges()'), false);
    assert.equal(srv.db.sql(`select name from items where id = '${ID.item}'`), 'Barra tonda');
    // Riscaricare resta possibile.
    await B.eval('cloudScaricaArchivio()');
    assert.equal(B.eval(`Store.getById('items', '${ID.item}').name`), 'Barra tonda');
    assert.equal(B.eval('Store.hasPendingChanges()'), false);
  });

  passo('le impostazioni di chi non è amministratore restano sul suo PC, senza fermare il resto', async () => {
    B.eval(`{ db.settings.currency = 'CHF'; const o = Store.getById('orders', '${ID.ord}'); o.title = 'Con impostazioni'; touch(o); saveDB(); }`);
    assert.equal(await giro(B), true);
    assert.equal(srv.db.sql(`select title from orders where id = '${ID.ord}'`), 'Con impostazioni');
    assert.notEqual(srv.db.sql(`select data->>'currency' from settings`), 'CHF');
  });

  passo('senza rete si lavora; la coda sopravvive a un riavvio e parte al ritorno', async () => {
    srv.spento = true;
    A.eval(`Store.update('items', '${ID.item}', { notes: 'scritto offline' })`);
    assert.equal(await giro(A), false);
    assert.equal(A.eval('_cloud.stato'), 'offline');
    // Il PC si spegne e si riaccende.
    const A2 = pc(A.storage);
    A2.eval('Store.load(); cloudAvvio();');
    entra(A2, anna);
    assert.equal(A2.eval('Store.hasPendingChanges()'), true);
    srv.spento = false;
    assert.equal(await giro(A2), true);
    assert.equal(srv.db.sql(`select notes from items where id = '${ID.item}'`), 'scritto offline');
    A = A2;
  });

  passo('un token scaduto si rinnova da solo', async () => {
    srv.scadiTutto();
    A.eval(`Store.update('items', '${ID.item}', { notes: 'dopo il rinnovo' })`);
    assert.equal(await giro(A), true);
    assert.equal(srv.db.sql(`select notes from items where id = '${ID.item}'`), 'dopo il rinnovo');
  });

  passo('uno schema più vecchio dell\'app lo dice, invece dell\'errore di PostgREST', async () => {
    await assert.rejects(A.eval(`cloudRpc('funzione_che_non_esiste', {})`), /riesegui supabase\/schema\.sql/);
  });

  passo('un utente sospeso dall\'amministratore esce, anche se era dentro, e non entra più', async () => {
    assert.ok(B.eval('!!currentUser'));
    A.eval(`{ const u = getUser('${bruno}'); u.active = false; touch(u); saveDB(); }`);
    await giro(A);
    // Bruno è dentro, con una modifica in coda che il server non gli accetta più.
    B.eval(`Store.update('items', '${ID.item}', { notes: 'da sospeso' })`);
    B.eval('globalThis.__avvisi = []; showToast = m => __avvisi.push(m);');
    await giro(B);
    await new Promise(r => setTimeout(r, 300));   // il controllo del profilo parte dopo l'errore
    assert.equal(B.eval('!!currentUser'), false, 'restava dentro a lavorare su una copia ferma');
    assert.match(B.eval('__avvisi.join()'), /sospeso/);
    await assert.rejects(B.eval(`cloudAccediConPassword('b@x.it', 'pw-bruno').then(() => cloudDopoAccesso())`), /non è ancora attivo/);
    await srv.chiudi();
  });
});

// ═══════════════════════════════════════════════════════════
//  Due colleghi sulla stessa cosa (0.103.2)
// ═══════════════════════════════════════════════════════════
// I casi in cui il last-write-wins da solo perdeva dati o bloccava la coda.
describe('Archivio condiviso — due colleghi sulla stessa cosa', () => {
  if (!pg.disponibile()) {
    it('saltato: BOMTRACK_PG non impostata (vedi test/pg.js)', () => {});
    return;
  }
  const { avviaSupabaseFinto } = require('./supabase-finto.js');
  let fila = Promise.resolve();
  const passo = (nome, fn) => it(nome, () => { const p = fila.then(fn); fila = p.catch(() => {}); return p; });
  let srv, A, B, anna, bruno;
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
  const SUP = U(500), ORD2 = U(501);

  passo('due PC sullo stesso archivio', async () => {
    srv = await avviaSupabaseFinto();
    anna = srv.crea('a@x.it', 'pa', 'Anna');
    bruno = srv.crea('b@x.it', 'pb', 'Bruno');
    const db = dbCloudCompleto();
    db.users.push({ id: U(801), name: 'Bruno', email: 'b@x.it', role: 'admin', active: true, createdAt: '2026-03-01T08:00:00.000Z', updatedAt: '2026-03-01T08:00:00.000Z' });
    A = pc(db);
    const e = await A.eval(`cloudAccediConPassword('a@x.it', 'pa').then(() => cloudDopoAccesso())`);
    await A.eval(`cloudCaricaArchivio(${JSON.stringify(e.stato)})`);
    A.eval(`currentUser = getUser('${anna}'); Store.setActor(currentUser.id);`);
    B = pc();
    await B.eval(`cloudAccediConPassword('b@x.it', 'pb').then(() => cloudDopoAccesso())`);
    await B.eval('cloudScaricaArchivio()');
    B.eval(`currentUser = getUser('${bruno}'); Store.setActor(currentUser.id);`);
    assert.equal(B.eval('db.items.length'), 5);
  });

  passo('chi salva da una copia vecchia non cancella in silenzio la modifica del collega', async () => {
    A.eval(`Store.update('items', '${ID.item}', { unitCost: 9.99 })`);
    await giro(A);
    // Bruno non ha ancora ricevuto: la sua scheda è quella di prima.
    B.eval(`Store.update('items', '${ID.item}', { notes: 'nota di Bruno' })`);
    avvisi(B);
    await giro(B);
    assert.equal(srv.db.sql(`select unit_cost from items where id = '${ID.item}'`), '9.99', 'la modifica di Anna resta');
    assert.match(avvisi(B).join(), /non è entrata/, 'e Bruno lo sa');
    await giro(B);
    assert.equal(B.eval(`Store.getById('items', '${ID.item}').unitCost`), 9.99, 'e vede la versione che ha vinto');
    // Dalla versione giusta, la sua modifica passa.
    B.eval(`Store.update('items', '${ID.item}', { notes: 'nota di Bruno' })`);
    await giro(B);
    assert.equal(srv.db.sql(`select notes || ' ' || unit_cost from items where id = '${ID.item}'`), 'nota di Bruno 9.99');
    await giro(A);
  });

  passo('un fornitore eliminato da un collega ma usato qui torna, e la coda non si blocca', async () => {
    A.eval(`Store.insert('suppliers', { id: '${SUP}', name: 'Nuovo fornitore', active: true })`);
    await giro(A); await giro(B);
    A.eval(`Store.remove('suppliers', '${SUP}')`);
    await giro(A);
    // Bruno non ha ancora ricevuto la cancellazione, e lo usa.
    B.eval(`{ const o = Store.getById('orders', '${ID.ord}'); o.supplierId = '${SUP}'; touch(o); saveDB(); }`);
    avvisi(B);
    assert.equal(await giro(B), true, 'l\'invio va');
    assert.match(avvisi(B).join(), /Nuovo fornitore.*ripristinato/);
    assert.equal(srv.db.sql(`select name from suppliers where id = '${SUP}'`), 'Nuovo fornitore');
    assert.equal(srv.db.sql(`select supplier_id from orders where id = '${ID.ord}'`), SUP);
    assert.equal(B.eval('Store.hasPendingChanges()'), false);
    await giro(A);
    assert.equal(A.eval(`!!Store.getById('suppliers', '${SUP}')`), true, 'torna anche ad Anna');
  });

  passo('qui si elimina un fornitore che un collega ha appena usato: l\'eliminazione si ritira', async () => {
    const SUP2 = U(502);
    A.eval(`Store.insert('suppliers', { id: '${SUP2}', name: 'Terzista', active: true })`);
    await giro(A); await giro(B);
    A.eval(`{ const o = Store.getById('orders', '${ID.ord}'); o.supplierId = '${SUP2}'; touch(o); saveDB(); }`);
    await giro(A);
    // Bruno non lo sa ancora: per lui il fornitore non è usato da nessuno.
    B.eval(`Store.remove('suppliers', '${SUP2}')`);
    avvisi(B);
    assert.equal(await giro(B), true);
    assert.match(avvisi(B).join(), /eliminazione è stata annullata/);
    assert.equal(srv.db.sql(`select name from suppliers where id = '${SUP2}'`), 'Terzista', 'sul server resta');
    await giro(B);
    assert.equal(B.eval(`!!Store.getById('suppliers', '${SUP2}')`), true, 'e torna a Bruno');
    assert.equal(B.eval('Store.hasPendingChanges()'), false);
  });

  passo('due ordini nuovi con lo stesso numero: il più recente si rinumera', async () => {
    await giro(A); await giro(B);
    const n = A.eval('nextOrderNumber()');
    assert.equal(B.eval('nextOrderNumber()'), n, 'i due PC propongono lo stesso numero');
    A.eval(`Store.insert('orders', { id: '${U(600)}', number: nextOrderNumber(), status: 'bozza', date: '2026-10-16', supplierId: null, lines: [], active: true })`);
    await giro(A);
    B.eval(`Store.insert('orders', { id: '${ORD2}', number: nextOrderNumber(), status: 'bozza', date: '2026-10-16', supplierId: null, lines: [], active: true })`);
    avvisi(B);
    await giro(B);   // invia il suo, poi riceve quello di Anna
    const numB = B.eval(`Store.getById('orders', '${ORD2}').number`);
    assert.notEqual(numB, n, 'quello di Bruno, nato dopo, cambia numero');
    assert.match(avvisi(B).join(), /stesso numero/);
    await giro(B);
    assert.equal(srv.db.sql(`select count(distinct number) from orders where id in ('${U(600)}', '${ORD2}')`), '2');
    await giro(A);
    assert.equal(A.eval(`Store.getById('orders', '${U(600)}').number`), n, 'quello di Anna resta com\'era');
  });

  // 0.105.2: le due quotazioni nascevano con id diversi, il server rifiutava la
  // seconda per l'indice unico, e l'invio di Bruno restava bloccato per sempre.
  passo('due colleghi registrano a listino la stessa offerta: una quotazione, e l\'invio va avanti', async () => {
    const RFQ = U(610), RL = U(611), C1 = U(8), S1 = U(1);
    A.eval(`Store.insert('rfqs', { id: '${RFQ}', number: 'RFQ-2026-050', status: 'ricevuta', date: '2026-10-16', supplierId: '${S1}', active: true,
      lines: [{ id: '${RL}', itemId: '${C1}', code: 'CMM-001', description: 'Cuscinetto', uom: 'pz', qty: 10, price: 9.5 }] })`);
    await giro(A); await giro(B);
    A.eval(`rfqRecordPrices('${RFQ}')`);
    B.eval(`rfqRecordPrices('${RFQ}')`);
    await giro(A);
    avvisi(B);
    assert.equal(await giro(B), true, 'l\'invio di Bruno non si blocca');
    await giro(B); await giro(A);
    assert.equal(B.eval('Store.hasPendingChanges()'), false);
    assert.equal(srv.db.sql(`select count(*) from item_prices where rfq_id = '${RFQ}'`), '1');
    for (const a of [A, B]) assert.equal(a.eval(`getItem('${C1}').priceList.filter(p => p.rfqId === '${RFQ}').length`), 1);
  });

  // 0.105.3: Bruno, senza aver ancora ricevuto la cancellazione di Anna, ritocca
  // il piano. La sua data batteva la lapide e il piano tornava sul server, ma
  // senza la riga che la cancellazione aveva portato via: per tutti gli altri
  // un piano vuoto, e nessun avviso.
  passo('la modifica di una copia di prima della cancellazione non fa tornare il record senza righe', async () => {
    const PL = U(630), PLL = U(631);
    A.eval(`Store.insert('plans', { id: '${PL}', number: 'FAB-2026-050', title: 'Da eliminare', date: '2026-10-16', notes: '', active: true,
      lines: [{ id: '${PLL}', itemId: '${ID.item}', qty: 1 }] })`);
    await giro(A); await giro(B);
    assert.equal(srv.db.sql(`select count(*) from production_plan_lines where plan_id = '${PL}'`), '1');
    A.eval(`Store.remove('plans', '${PL}')`);
    await giro(A);
    B.eval(`{ const p = Store.getById('plans', '${PL}'); p.title = 'Ritoccato da Bruno'; touch(p); saveDB(); }`);
    avvisi(B);
    await giro(B); await giro(B); await giro(A);
    // Qui la riga del piano è recente e parte con il ritocco: per il server è
    // usata, e il piano torna (cloudRiparaRiferimento). Con una riga vecchia
    // vince la cancellazione (schema-sql.test.js). Mai però un piano vuoto.
    const sulServer = srv.db.sql(`select count(*) from production_plans where id = '${PL}'`);
    assert.equal(srv.db.sql(`select count(*) from production_plans p where p.id = '${PL}'
      and not exists (select 1 from production_plan_lines l where l.plan_id = p.id)`), '0', 'un piano tornato senza la sua riga');
    for (const a of [A, B]) assert.equal(a.eval(`!!Store.getById('plans', '${PL}')`), sulServer === '1', 'tutti vedono quello che ha il server');
    assert.equal(B.eval('Store.hasPendingChanges()'), false);
  });

  // Il padre che torna perché qui è ancora usato porta con sé tutte le sue righe.
  passo('un record ripristinato perché usato torna con tutte le sue righe', async () => {
    const PL = U(632), PLL = U(633), ORD3 = U(634);
    A.eval(`Store.insert('plans', { id: '${PL}', number: 'FAB-2026-051', title: 'Usato da Bruno', date: '2026-10-16', notes: '', active: true,
      lines: [{ id: '${PLL}', itemId: '${ID.item}', qty: 2 }] })`);
    await giro(A); await giro(B);
    A.eval(`Store.remove('plans', '${PL}')`);
    await giro(A);
    // Bruno non ha ancora ricevuto, e ci lega un ordine nuovo.
    B.eval(`Store.insert('orders', { id: '${ORD3}', number: 'ODA-2026-090', status: 'bozza', date: '2026-10-16', supplierId: null, planId: '${PL}', lines: [], active: true })`);
    // Una riga che da sola non ripartirebbe più: la soglia di cloudPayload è
    // oltre la sua data.
    B.eval(`cloudAggiornaConfig({ soglia: new Date(Date.now() + 3600000).toISOString() })`);
    avvisi(B);
    await giro(B);
    assert.equal(srv.db.sql(`select count(*) from production_plans where id = '${PL}'`), '1', 'il piano usato torna');
    assert.equal(srv.db.sql(`select count(*) from production_plan_lines where plan_id = '${PL}'`), '1', 'e con la sua riga');
    await giro(A);
    assert.equal(A.eval(`(Store.getById('plans', '${PL}') || { lines: [] }).lines.length`), 1, 'anche per Anna');
  });

  // 0.105.5: la rettifica scrive «contato − esistente», e l'esistente era
  // quello di questo PC: il carico di un collega non ancora ricevuto si
  // sommava poi alla rettifica, contato due volte.
  passo('una rettifica si calcola sulla giacenza aggiornata ai colleghi', async () => {
    await giro(A); await giro(B);
    const prima = A.eval(`onHandOf('${ID.item}')`);
    B.eval(`addMovement('${ID.item}', 'carico', 10, 'arrivato da Bruno')`);
    await giro(B);
    // Anna conta lo scaffale, dove ci sono anche i 10 di Bruno.
    const contato = prima + 10 + 3;
    A.el('mv-kind').value = 'rettifica'; A.el('mv-qty').value = String(contato); A.el('mv-note').value = ''; A.el('mv-ord').value = '';
    await A.eval(`saveStockAdjust('${ID.item}')`);
    await giro(A); await giro(B);
    assert.equal(A.eval(`(invalidateCaches(), onHandOf('${ID.item}'))`), contato, 'la differenza è 3, non 13');
    assert.equal(B.eval(`(invalidateCaches(), onHandOf('${ID.item}'))`), contato);
  });

  // 0.105.4: con l'orologio del PC indietro il record ripristinato era più
  // vecchio della lapide, e il server lo respingeva: al giro dopo il pull lo
  // ricancellava, e dal cestino era già uscito. Ora il ripristino si dichiara.
  passo('un ripristino dal cestino regge anche con l\'orologio del PC indietro', async () => {
    const SUP = U(640);
    A.eval(`Store.insert('suppliers', { id: '${SUP}', name: 'Fornitore ripreso', active: true })`);
    await giro(A); await giro(B);
    A.eval(`Store.remove('suppliers', '${SUP}')`);
    await giro(A);
    assert.equal(srv.db.sql(`select count(*) from sync_tombstones where id = '${SUP}'`), '1');
    A.eval(`Store.restore(Store.lastRemoved())`);
    // L'orologio indietro: la data del ripristino è prima della lapide.
    A.eval(`{ const r = Store.getById('suppliers', '${SUP}'); r.updatedAt = '2020-01-01T00:00:00.000Z'; saveDB(); }`);
    avvisi(A);
    await giro(A); await giro(A);
    assert.equal(srv.db.sql(`select count(*) from suppliers where id = '${SUP}'`), '1', 'il server lo riprende');
    assert.equal(srv.db.sql(`select count(*) from sync_tombstones where id = '${SUP}'`), '0', 'e la lapide se ne va');
    assert.ok(A.eval(`!!Store.getById('suppliers', '${SUP}')`), 'qui resta');
    assert.equal(A.eval('cloudConfig().ripristinati || null'), null, 'il ripristino partito non si rimanda');
    await giro(B);
    assert.ok(B.eval(`!!Store.getById('suppliers', '${SUP}')`), 'e torna anche al collega');
  });

  // 0.105.3: questo PC elimina una richiesta che un ordine cita ancora, e il
  // pull che ne svuoterebbe il riferimento non si applica (un pannello aperto).
  // Ogni giro inciampava nel vincolo, e la modifica dell'ordine non partiva più.
  passo('un documento eliminato qui e ancora citato non blocca la coda', async () => {
    const RFQ = U(620);
    A.eval(`Store.insert('rfqs', { id: '${RFQ}', number: 'RFQ-2026-060', status: 'bozza', date: '2026-10-16', supplierId: null, active: true, lines: [] })`);
    A.eval(`{ const o = Store.getById('orders', '${ID.ord}'); o.rfqId = '${RFQ}'; touch(o); saveDB(); }`);
    await giro(A); await giro(B);
    assert.equal(srv.db.sql(`select rfq_id from orders where id = '${ID.ord}'`), RFQ);
    A.eval('globalThis.__puo = cloudPuoApplicare; cloudPuoApplicare = () => false;');
    try {
      A.eval(`Store.remove('rfqs', '${RFQ}')`);
      await giro(A);
      A.eval(`{ const o = Store.getById('orders', '${ID.ord}'); o.notes = 'dopo la richiesta'; touch(o); saveDB(); }`);
      avvisi(A);
      await giro(A);
      assert.equal(srv.db.sql(`select notes from orders where id = '${ID.ord}'`), 'dopo la richiesta', 'la modifica arriva');
      assert.equal(srv.db.sql(`select coalesce(rfq_id::text, '-') from orders where id = '${ID.ord}'`), '-');
      assert.equal(A.eval(`Store.getById('orders', '${ID.ord}').rfqId`), null, 'il riferimento si svuota anche qui, come sul server');
      assert.equal(A.eval('Store.hasPendingChanges()'), false, 'e la coda è vuota');
    } finally { A.eval('cloudPuoApplicare = __puo;'); }
    await giro(A); await giro(B);
  });

  // 0.105.2: il flag della semina non ha una colonna, e un articolo arrivato
  // dal server ne è senza: a ogni ricarica ogni PC aggiungeva un'altra copia
  // della quotazione a mano.
  passo('un articolo arrivato dal server non si semina di nuovo, e le copie già seminate spariscono', async () => {
    const C1 = U(8), S1 = U(1);
    const manuali = a => a.eval(`getItem('${C1}').priceList.filter(p => !p.rfqId).length`);
    const sulServer = () => srv.db.sql(`select count(*) from item_prices where item_id = '${C1}' and rfq_id is null`);
    // Due copie della stessa quotazione a mano, come le lasciava la semina.
    A.eval(`{ const it = getItem('${C1}');
      const copia = () => stampNew({ id: gid(), supplierId: '${S1}', price: 12, minQty: '', leadDays: '', code: '', desc: '', date: '2026-03-01', rfqId: null, note: '' });
      it.priceList.push(copia(), copia()); touch(it); saveDB(); }`);
    await giro(A); await giro(B);
    const prima = Number(sulServer());
    assert.ok(prima >= 2);
    // Bruno riapre l'app.
    const B2 = loadApp({ silent: true, storage: B.storage });
    B2.ctx.fetch = fetch;
    B2.eval(`Store.load(); cloudAvvio(); globalThis.__avvisi = []; showToast = m => __avvisi.push(m); currentUser = getUser('${bruno}'); Store.setActor(currentUser.id);`);
    assert.equal(manuali(B2), prima - 1, 'una copia in meno, e nessuna semina nuova');
    await giro(B2); await giro(A);
    assert.equal(sulServer(), String(prima - 1), 'la copia tolta sparisce anche dal server');
    assert.equal(manuali(A), prima - 1);
    B2.eval('Store.load()');
    assert.equal(manuali(B2), prima - 1, 'e ricaricando non ricompare niente');
    B = B2;
    await srv.chiudi();
  });
});

describe('Archivio condiviso — numeri e codici li dà il server', () => {
  if (!pg.disponibile()) {
    it('saltato: BOMTRACK_PG non impostata (vedi test/pg.js)', () => {});
    return;
  }
  const { avviaSupabaseFinto } = require('./supabase-finto.js');
  let fila = Promise.resolve();
  const passo = (nome, fn) => it(nome, () => { const p = fila.then(fn); fila = p.catch(() => {}); return p; });
  let srv, A, B, anna, bruno;
  const giro = a => a.eval('cloudGiro()');
  const avvisi = a => a.ctx.__avvisi.splice(0);
  const anno = new Date().getFullYear();
  const pc = (seed) => {
    const st = makeStorage();
    st.setItem('bomtrack_cloud', JSON.stringify({ url: srv.url, chiave: srv.chiave, allineato: false }));
    const a = loadApp({ silent: true, storage: st });
    a.ctx.fetch = fetch;
    if (seed) a.seedStorage(seed);
    a.eval('Store.load(); cloudAvvio(); globalThis.__avvisi = []; showToast = m => __avvisi.push(m);');
    return a;
  };

  passo('due PC sullo stesso archivio', async () => {
    srv = await avviaSupabaseFinto();
    anna = srv.crea('a@x.it', 'pa', 'Anna');
    bruno = srv.crea('b@x.it', 'pb', 'Bruno');
    const db = dbCloudCompleto();
    // La serie dell'anno in corso parte da un ordine che c'è già.
    db.orders[0].number = `ODA-${anno}-007`;
    db.workOrders[0].number = `ODL-${anno}-001`;
    db.users.push({ id: U(801), name: 'Bruno', email: 'b@x.it', role: 'admin', active: true, createdAt: '2026-03-01T08:00:00.000Z', updatedAt: '2026-03-01T08:00:00.000Z' });
    A = pc(db);
    const e = await A.eval(`cloudAccediConPassword('a@x.it', 'pa').then(() => cloudDopoAccesso())`);
    await A.eval(`cloudCaricaArchivio(${JSON.stringify(e.stato)})`);
    A.eval(`currentUser = getUser('${anna}'); Store.setActor(currentUser.id);`);
    B = pc();
    await B.eval(`cloudAccediConPassword('b@x.it', 'pb').then(() => cloudDopoAccesso())`);
    await B.eval('cloudScaricaArchivio()');
    B.eval(`currentUser = getUser('${bruno}'); Store.setActor(currentUser.id);`);
    await giro(A); await giro(B);
  });

  passo('senza collegamento si consulta soltanto, e si torna a lavorare quando il server risponde', async () => {
    assert.equal(A.eval(`canWrite('docs')`), true);
    srv.spento = true;
    await giro(A);
    assert.equal(A.eval(`cloudSolaLettura()`), true);
    assert.equal(A.eval(`canWrite('docs')`), false, 'nessuna area si scrive');
    assert.equal(A.eval(`canWriteRuolo('docs')`), true, 'il ruolo resta quello');
    const prima = A.eval('db.orders.length');
    avvisi(A);
    A.eval('newOrder()');
    assert.equal(A.eval('db.orders.length'), prima, 'nessun ordine nasce');
    assert.match(avvisi(A).join(), /si consulta soltanto/);
    srv.spento = false;
    await giro(A);
    assert.equal(A.eval(`canWrite('docs')`), true);
  });

  passo('un PC appena avviato aspetta la prima risposta del server prima di scrivere', async () => {
    const st = makeStorage();
    A.storage._map.forEach((v, k) => st.setItem(k, v));
    const C = loadApp({ silent: true, storage: st });
    C.ctx.fetch = fetch;
    C.eval(`Store.load(); cloudAvvio(); currentUser = getUser('${anna}');`);
    assert.equal(C.eval(`canWrite('docs')`), false);
    await giro(C);
    assert.equal(C.eval(`canWrite('docs')`), true);
  });

  passo('due colleghi che creano un ordine insieme hanno due numeri diversi, dopo quello che c\'era', async () => {
    const [na, nb] = [A.eval('db.orders.length'), B.eval('db.orders.length')];
    avvisi(A); avvisi(B);
    await Promise.all([A.eval('newOrder()'), B.eval('newOrder()')]);
    assert.equal(avvisi(A).concat(avvisi(B)).join(' | '), '');
    const oa = A.eval(`db.orders[db.orders.length - 1].number`), ob = B.eval(`db.orders[db.orders.length - 1].number`);
    assert.equal(A.eval('db.orders.length'), na + 1);
    assert.equal(B.eval('db.orders.length'), nb + 1);
    assert.notEqual(oa, ob);
    assert.deepEqual([oa, ob].sort(), [`ODA-${anno}-008`, `ODA-${anno}-009`]);
    await giro(A); await giro(B); await giro(A);
    assert.equal(srv.db.sql(`select count(distinct number) from orders where number like 'ODA-${anno}-%'`), '3');
  });

  passo('un documento con più numeri li prende tutti insieme, consecutivi', async () => {
    const n = await A.eval(`conNumeri({ ODL: 3 }, () => [nextOdlNumber(), nextOdlNumber(), nextOdlNumber()])`);
    const altro = await B.eval(`conNumeri({ ODL: 1 }, () => nextOdlNumber())`);
    assert.equal(Array.from(n).join(), [`ODL-${anno}-002`, `ODL-${anno}-003`, `ODL-${anno}-004`].join());
    assert.equal(altro, `ODL-${anno}-005`, 'il collega continua da dove ha lasciato il server');
    assert.equal(A.eval(`Object.keys(_numeriRiservati).length`), 0, 'i numeri non usati non restano in giro');
  });

  passo('un numero riservato e non usato torna libero: la serie non ha buchi', async () => {
    const prossimo = `ODA-${anno}-` + String(await A.eval(`cloudRpc('riserva_numeri', { prefisso: 'ODA-${anno}-', quanti: 1, minimo: 0 })`).then(n => n[0])).padStart(3, '0');
    await A.eval(`cloudRpc('libera_numeri', { prefisso: 'ODA-${anno}-', numeri: [${Number(prossimo.slice(-3))}] })`);
    // Un documento che alla fine non nasce: il numero preso torna indietro da sé.
    assert.equal(await A.eval(`conNumeri({ ODA: 1 }, () => null)`), null);
    assert.equal(await B.eval(`conNumeri({ ODA: 1 }, () => nextOrderNumber())`), prossimo, 'il collega prende proprio quello');
  });

  passo('un buco lasciato mentre un collega andava avanti si riempie con il prossimo', async () => {
    const pre = `ODA-${anno}-`;
    const [a] = Array.from(await A.eval(`cloudRpc('riserva_numeri', { prefisso: '${pre}', quanti: 1, minimo: 0 })`));
    const [b] = Array.from(await B.eval(`cloudRpc('riserva_numeri', { prefisso: '${pre}', quanti: 1, minimo: 0 })`));
    assert.equal(b, a + 1);
    await A.eval(`cloudRpc('libera_numeri', { prefisso: '${pre}', numeri: [${a}] })`);
    const dopo = Array.from(await A.eval(`cloudRpc('riserva_numeri', { prefisso: '${pre}', quanti: 2, minimo: 0 })`));
    assert.deepEqual(dopo.join(), [a, b + 1].join(), 'prima il buco, poi dopo il più alto');
    await A.eval(`cloudRpc('libera_numeri', { prefisso: '${pre}', numeri: [${dopo.join(',')}] })`);
    await B.eval(`cloudRpc('libera_numeri', { prefisso: '${pre}', numeri: [${b}] })`);
  });

  passo('eliminato l\'ultimo documento, il suo numero torna al prossimo', async () => {
    await B.eval(`newJob()`);
    const j = B.eval('db.jobs[db.jobs.length - 1]');
    await giro(B);
    B.eval(`Store.remove('jobs', '${j.id}')`);
    await giro(B);
    assert.equal(await A.eval(`conNumeri({ COM: 1 }, () => nextJobNumber())`), j.number);
  });

  passo('un codice articolo preso da un collega non si dà due volte, anche prima che il suo articolo arrivi', async () => {
    const famiglia = U(4), sotto = U(5);
    const codice = A.eval(`genFamilyCode('materiale', '${famiglia}', '${sotto}')`);
    assert.equal(B.eval(`genFamilyCode('materiale', '${famiglia}', '${sotto}')`), codice, 'i due PC propongono lo stesso');
    assert.deepEqual(Array.from(await A.eval(`cloudImpegnaCodici([{ codice: '${codice}' }])`)), [], 'il primo lo prende');
    // Bruno salva il suo articolo con il codice automatico: il server dice di
    // no, e il codice si ricalcola saltando quello di Anna.
    const it = { id: U(900), type: 'materiale', familyId: famiglia, subFamilyId: sotto, name: 'Barra tonda', code: codice, active: true };
    B.eval(`globalThis.__it = ${JSON.stringify(it)}`);
    avvisi(B);
    await B.eval(`conCodiceImpegnato(__it, () => genItemCode(__it), () => Store.insert('items', __it))`);
    const dato = B.eval(`Store.getById('items', '${U(900)}').code`);
    assert.notEqual(dato, codice);
    assert.match(avvisi(B).join(), /l'aveva appena preso un collega/);
    // Un codice scritto a mano non si cambia da solo: si chiede di sceglierne un altro.
    B.eval(`globalThis.__it2 = { id: '${U(901)}', type: 'materiale', name: 'Altra', code: '${codice.toLowerCase()} ', active: true }`);
    const r = await B.eval(`conCodiceImpegnato(__it2, null, () => Store.insert('items', __it2))`);
    assert.equal(r, null);
    assert.equal(B.eval(`!!Store.getById('items', '${U(901)}')`), false);
    assert.match(avvisi(B).join(), /scegline un altro/);
    // Il codice di un articolo che esiste è suo: rimpegnarlo per lo stesso articolo va.
    await giro(B);
    assert.deepEqual(Array.from(await B.eval(`cloudImpegnaCodici([{ codice: '${dato}', item: '${U(900)}' }])`)), []);
    assert.deepEqual(Array.from(await A.eval(`cloudImpegnaCodici([{ codice: '${dato}' }])`)), [dato], 'per un altro no');
  });

  passo('l\'import del catalogo impegna i suoi codici e salta quelli dei colleghi', async () => {
    // Un prefisso che nessuno ha ancora usato: il primo codice lo prende Bruno.
    const prossimo = A.eval(`genFamilyCode('materiale', '${U(4)}', null)`);
    assert.deepEqual(Array.from(await B.eval(`cloudImpegnaCodici([{ codice: '${prossimo}' }])`)), []);
    const righe = [{ 'Descrizione *': 'Barra da import', Macrofamiglia: 'Acciaio', UM: 'm' },
      { Codice: 'MANUALE-1', 'Descrizione *': 'Con codice', UM: 'pz' }];
    const rep = await A.eval(`catImportaImpegnando({ scope: 'buy', byName: ${JSON.stringify({ 'Materie prime': righe })} })`);
    assert.equal(rep.errors.length, 0, rep.errors.join());
    const nuovo = A.eval(`db.items.find(i => i.name === 'Barra da import').code`);
    assert.notEqual(nuovo, prossimo, 'il codice impegnato dal collega si salta');
    assert.equal(Array.from(await B.eval(`cloudImpegnaCodici([{ codice: '${nuovo}' }, { codice: 'manuale-1' }])`)).join(), [nuovo, 'manuale-1'].join(),
      'e quelli dell\'import sono impegnati');
    assert.equal(A.eval('_cloud.pausa'), 0);
  });

  passo('un codice impegnato e restituito lo prende subito un collega', async () => {
    const c = 'PROVA-LIBERA-1';
    assert.deepEqual(Array.from(await A.eval(`cloudImpegnaCodici([{ codice: '${c}' }])`)), []);
    assert.equal(Array.from(await B.eval(`cloudImpegnaCodici([{ codice: '${c}' }])`)).join(), c);
    await A.eval(`cloudLiberaCodici(['${c}'])`);
    assert.deepEqual(Array.from(await B.eval(`cloudImpegnaCodici([{ codice: '${c}' }])`)), []);
  });

  passo('un lettore non prenota numeri', async () => {
    srv.db.sql(`set session_replication_role = replica; update profiles set role = 'lettore' where id = '${bruno}';`);
    await assert.rejects(B.eval(`cloudRpc('riserva_numeri', { prefisso: 'ODA-${anno}-', quanti: 1, minimo: 0 })`), /non scrive/);
    await assert.rejects(B.eval(`cloudRpc('riserva_numeri', { prefisso: 'XYZ; drop', quanti: 1, minimo: 0 })`), /non valida|non scrive/);
    await srv.chiudi();
  });
});

describe('Archivio condiviso — i colleghi si creano dall\'app', () => {
  if (!pg.disponibile()) {
    it('saltato: BOMTRACK_PG non impostata (vedi test/pg.js)', () => {});
    return;
  }
  const { avviaSupabaseFinto } = require('./supabase-finto.js');
  let fila = Promise.resolve();
  const passo = (nome, fn) => it(nome, () => { const p = fila.then(fn); fila = p.catch(() => {}); return p; });
  let srv, A, anna, nuovo;
  const giro = a => a.eval('cloudGiro()');

  passo('l\'amministratore crea un collega: nasce col suo ruolo, attivo, e riceve un link', async () => {
    srv = await avviaSupabaseFinto();
    anna = srv.crea('a@x.it', 'pa', 'Anna');
    const st = makeStorage();
    st.setItem('bomtrack_cloud', JSON.stringify({ url: srv.url, chiave: srv.chiave, allineato: false }));
    A = loadApp({ silent: true, storage: st });
    A.ctx.fetch = fetch;
    A.seedStorage(dbCloudCompleto());
    A.eval('Store.load(); cloudAvvio();');
    const e = await A.eval(`cloudAccediConPassword('a@x.it', 'pa').then(() => cloudDopoAccesso())`);
    await A.eval(`cloudCaricaArchivio(${JSON.stringify(e.stato)})`);
    A.eval(`currentUser = getUser('${anna}'); Store.setActor(currentUser.id);`);
    await giro(A);
    const r = await A.eval(`cloudUtenti({ azione: 'invita', email: 'C@x.it', nome: 'Carla', ruolo: 'acquisti' })`);
    nuovo = r.id;
    assert.match(r.link, /type=invite/);
    assert.equal(srv.db.sql(`select name || ' ' || role || ' ' || active from profiles where id = '${nuovo}'`), 'Carla acquisti true');
    assert.equal(srv.db.sql(`select coalesce(raw_user_meta_data->>'role', '-') from auth.users where id = '${nuovo}'`), '-', 'il ruolo non passa dai metadati');
    await giro(A);
    assert.equal(A.eval(`getUser('${nuovo}').role`), 'acquisti', 'e arriva nella gestione utenti');
    // Con il link, Carla entra già attiva.
    const tok = /access_token=([^&]+)/.exec(r.link)[1];
    const st2 = makeStorage();
    st2.setItem('bomtrack_cloud', JSON.stringify({ url: srv.url, chiave: srv.chiave, allineato: false }));
    const C = loadApp({ silent: true, storage: st2 });
    C.ctx.fetch = fetch;
    C.eval(`cloudSalvaSessione({ access_token: '${tok}', expires_in: 3600 })`);
    const ec = await C.eval('cloudDopoAccesso()');
    assert.equal(ec.stato.profilo.active, true);
    assert.equal(ec.stato.profilo.role, 'acquisti');
  });

  passo('una email che ha già un utente non si crea due volte', async () => {
    await assert.rejects(A.eval(`cloudUtenti({ azione: 'invita', email: 'c@x.it', nome: 'Carla bis', ruolo: 'lettore' })`), /già un utente/);
  });

  passo('il link per reimpostare la password: per un collega sì, per un altro amministratore no', async () => {
    const r = await A.eval(`cloudUtenti({ azione: 'reimposta', id: '${nuovo}' })`);
    assert.match(r.link, /type=recovery/);
    const altro = srv.crea('d@x.it', 'pd', 'Dario');
    srv.db.sql(`set session_replication_role = replica; update profiles set role = 'admin', active = true where id = '${altro}';`);
    await assert.rejects(A.eval(`cloudUtenti({ azione: 'reimposta', id: '${altro}' })`), /altro amministratore/);
  });

  passo('chi non è amministratore non crea utenti', async () => {
    const tok = srv.crea('e@x.it', 'pe', 'Elena');
    srv.db.sql(`set session_replication_role = replica; update profiles set role = 'progettazione', active = true where id = '${tok}';`);
    const st = makeStorage();
    st.setItem('bomtrack_cloud', JSON.stringify({ url: srv.url, chiave: srv.chiave, allineato: true }));
    const E = loadApp({ silent: true, storage: st });
    E.ctx.fetch = fetch;
    await E.eval(`cloudAccediConPassword('e@x.it', 'pe')`);
    await assert.rejects(E.eval(`cloudUtenti({ azione: 'invita', email: 'f@x.it', nome: 'F', ruolo: 'admin' })`), /Solo un amministratore/);
  });

  passo('l\'ultimo amministratore attivo non si declassa nemmeno passando dall\'API', async () => {
    srv.db.sql(`set session_replication_role = replica; update profiles set active = false where role = 'admin' and id <> '${anna}';`);
    assert.throws(() => srv.db.come(anna).sql(`update profiles set role = 'lettore' where id = '${anna}';`), /almeno un amministratore/);
  });

  passo('una funzione non pubblicata lo dice, con dove guardare', async () => {
    srv.senzaFunzioni = true;
    await assert.rejects(A.eval(`cloudUtenti({ azione: 'reimposta', id: '${nuovo}' })`), /non è pubblicata/);
    srv.senzaFunzioni = false;
    // Senza le intestazioni CORS il browser vede solo un errore di rete.
    srv.funzioneMuta = true;
    await assert.rejects(A.eval(`cloudUtenti({ azione: 'reimposta', id: '${nuovo}' })`), /bomtrack-utenti non risponde/);
    srv.funzioneMuta = false;
    // Il codice d'esempio di Supabase al posto di quello di Bomtrack.
    srv.funzioneDiEsempio = true;
    await assert.rejects(A.eval(`cloudUtenti({ azione: 'reimposta', id: '${nuovo}' })`), /non con il codice di Bomtrack/);
    srv.funzioneDiEsempio = false;
    assert.equal(A.eval('cloudSolaLettura()'), false);
    await srv.chiudi();
  });
});
