// L'archivio condiviso nel Chromium vero, contro il Supabase finto
// (test/supabase-finto.js, con Postgres). Stampa un JSON che
// test/cloud-ui.test.js controlla. Due PC: quello dell'amministratore, che
// collega l'app dalla schermata d'accesso e carica il suo archivio, e il
// telefono di un collega, che arriva dal link di collegamento e lo scarica.
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { avviaSupabaseFinto } = require('./supabase-finto.js');
const ROOT = path.join(__dirname, '..');
const FOTO = process.env.BOMTRACK_FOTO || '';   // cartella per gli screenshot, facoltativa

const SEED = () => {
  Store.reset();
  const u = { id: newId(), name: 'Anna Bianchi', username: 'anna', email: 'a@x.it', role: 'admin', color: '#3A7BE8', active: true };
  setUserPassword(u, 'locale'); stampNew(u); db.users.push(u);
  saveDB();
  return u.id;
};

(async () => {
  let browser, srv;
  const r = {};
  try {
    srv = await avviaSupabaseFinto({ statico: ROOT });
    srv.crea('a@x.it', 'pw-anna-1', 'Anna Bianchi');
    srv.crea('b@x.it', 'pw-bruno-1', 'Bruno');
    browser = await chromium.launch();
    const errori = [];
    const foto = async (p, nome) => { if (FOTO) await p.screenshot({ path: path.join(FOTO, nome + '.png') }); };

    // ── PC dell'amministratore ──
    const A = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    A.on('pageerror', e => errori.push('A: ' + e.message));
    await A.goto(srv.url + '/index.html');
    await A.waitForFunction(() => typeof Store !== 'undefined' && typeof db !== 'undefined' && db);
    await A.evaluate(SEED);
    await A.waitForFunction(() => Store.scrittureInVolo() === 0);
    await A.reload();
    await A.waitForSelector('#login-note a');
    r.notaLocale = await A.textContent('#login-note');
    await A.click('#login-note a');
    await A.fill('#cl-url', srv.url);
    await A.fill('#cl-chiave', srv.chiave);
    await A.click('text=Prova');
    await A.waitForFunction(() => /risponde/.test(document.getElementById('cl-esito').textContent));
    await foto(A, '1-collega');
    await Promise.all([A.waitForNavigation(), A.click('text=Collega questo PC')]);
    await A.waitForSelector('#login-note');
    r.notaCloud = await A.textContent('#login-note');
    await A.fill('#login-email', 'a@x.it');
    await A.fill('#login-password', 'pw-anna-1');
    await A.click('#login-submit');
    await A.waitForSelector('#cl-primo-ok');
    r.primoA = await A.textContent('#cl-primo-ok');
    await foto(A, '2-primo-collegamento');
    await A.click('#cl-primo-ok');
    await A.waitForSelector('#app-header', { state: 'visible' });
    await A.waitForFunction(() => document.getElementById('cloud-stato').classList.contains('cs-ok'), null, { timeout: 15000 });
    r.serverArticoli = Number(srv.db.sql('select count(*) from items'));
    r.localeArticoli = await A.evaluate(() => db.items.length);
    r.utenteA = await A.evaluate(() => ({ id: currentUser.id, ruolo: currentUser.role }));
    await foto(A, '3-dentro');
    await A.click('#cloud-stato');
    await A.waitForSelector('#cl-link');
    r.link = await A.inputValue('#cl-link');
    await foto(A, '4-pannello');
    await A.evaluate(() => closeModal());

    // ── Il telefono del collega, dal link ──
    const B = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
    B.on('pageerror', e => errori.push('B: ' + e.message));
    await B.goto(r.link);
    await B.waitForSelector('text=Collegare questo PC');
    await foto(B, '5-link');
    await Promise.all([B.waitForNavigation(), B.click('button:has-text("Collega")')]);
    r.indirizzoPulito = !/chiave=/.test(B.url());
    await B.waitForSelector('#login-email');
    await B.fill('#login-email', 'b@x.it');
    await B.fill('#login-password', 'pw-bruno-1');
    await B.click('#login-submit');
    // Bruno è stato invitato ma non è nell'archivio di Anna: è sospeso.
    await B.waitForSelector('#login-error', { state: 'visible' });
    r.sospesoB = await B.textContent('#login-error');
    await foto(B, '6-sospeso');
    // Anna lo vede arrivare in Gestione → Utenti, gli dà un ruolo e lo attiva.
    // Il giro riceve solo quando non ha niente da inviare, e un giro già in
    // corso (quello del timer) fa tornare subito il secondo: il profilo di
    // Bruno arriva a uno dei giri dopo. Si aspetta lui, non un numero di giri.
    r.attesaB = await A.evaluate(async () => {
      for (let i = 0; i < 80 && !db.users.some(x => x.email === 'b@x.it'); i++) {
        await cloudGiro();
        await new Promise(r => setTimeout(r, 250));
      }
      // Se non arriva, perché: lo dice il fallimento invece di un TypeError.
      return db.users.some(x => x.email === 'b@x.it') ? 'ok' : JSON.stringify({ stato: _cloud.stato, msg: _cloud.messaggio,
        coda: Store.hasPendingChanges(), applica: cloudPuoApplicare(), attivo: document.activeElement && document.activeElement.id,
        pannello: typeof panelTop === 'function' && !!panelTop(), utenti: db.users.map(u => u.email) });
    });
    if (r.attesaB !== 'ok') throw new Error('Il profilo di Bruno non arriva ad Anna: ' + r.attesaB);
    await A.evaluate(() => { setView('manage'); setMgmtTab('users'); });
    r.utentiA = await A.$$eval('.mgmt-item-name', v => v.map(x => x.textContent.trim()));
    await foto(A, '5-utenti');
    await A.evaluate(() => { const u = db.users.find(x => x.email === 'b@x.it'); u.role = 'acquisti'; touch(u); saveDB(); toggleUserActive(u.id); });
    await A.evaluate(() => cloudGiro());
    await B.fill('#login-password', 'pw-bruno-1');
    await B.click('#login-submit');
    await B.waitForSelector('#cl-primo-ok');
    r.primoB = await B.textContent('#cl-primo-ok');
    await B.click('#cl-primo-ok');
    await B.waitForSelector('#app-header', { state: 'visible' });
    r.localeB = await B.evaluate(() => db.items.length);
    r.ruoloB = await B.evaluate(() => currentUser.role);
    r.scrollOrizzontaleB = await B.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    await foto(B, '7-telefono');

    // ── Una modifica di A arriva a B ──
    const id = await A.evaluate(() => { const it = db.items[0]; Store.update('items', it.id, { name: 'Rinominato da Anna' }); return it.id; });
    await A.evaluate(() => cloudGiro());
    r.serverNome = srv.db.sql(`select name from items where id = '${id}'`);
    await B.evaluate(() => cloudGiro());
    r.nomeB = await B.evaluate(i => Store.getById('items', i).name, id);
    r.statoB = await B.evaluate(() => _cloud.stato);
    // ── E l'uscita ──
    await B.evaluate(() => logout());
    r.dopoUscita = await B.evaluate(() => ({ sessione: !!localStorage.getItem('bomtrack_cloud_sessione'), login: getComputedStyle(document.getElementById('login-screen')).display }));
    r.errori = errori;
  } catch (e) {
    r.errore = String(e && e.stack || e);
  } finally {
    if (browser) await browser.close();
    if (srv) await srv.chiudi();
    process.stdout.write(JSON.stringify(r));
  }
})();
