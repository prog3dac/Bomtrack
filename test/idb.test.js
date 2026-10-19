// L'archivio in IndexedDB (0.87.0).
//
// localStorage tiene circa 5 MB; IndexedDB lo spazio del disco. Il trasloco è
// il momento in cui un errore costa l'archivio, quindi qui si prova soprattutto
// quello che può andare storto:
//   - il trasloco cancella l'originale solo dopo averne riletto la copia;
//   - una scheda con l'app vecchia che scrive ancora in localStorage non perde
//     il suo lavoro;
//   - se IndexedDB un giorno non si apre, l'app non riparte dai dati di
//     esempio salvandoli sopra l'archivio vero;
//   - una scrittura fallita si dice, come con localStorage.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp, makeStorage } = require('./harness.js');
const { makeDb, mat } = require('./fixtures.js');

// Un IndexedDB finto ma con le regole che contano: transazioni che si chiudono
// in ordine di creazione, scritture applicate solo alla chiusura (tutto o
// niente), onupgradeneeded alla prima apertura, errori a comando.
function fakeIdb() {
  const dbs = new Map();
  const dopo = fn => setTimeout(fn, 0);
  const f = {
    dbs, apertura: true, quota: false, falsaRilettura: false,
    open(name) {
      const req = {};
      dopo(() => {
        if (!f.apertura) { req.error = new Error('apertura negata'); if (req.onerror) req.onerror(); return; }
        let d = dbs.get(name); const nuovo = !d;
        if (!d) { d = { stores: new Map() }; dbs.set(name, d); }
        req.result = {
          objectStoreNames: { contains: n => d.stores.has(n) },
          createObjectStore: n => { d.stores.set(n, new Map()); },
          transaction: (n, mode) => transazione(d.stores.get(n), mode),
        };
        if (nuovo && req.onupgradeneeded) req.onupgradeneeded();
        if (req.onsuccess) req.onsuccess();
      });
      return req;
    },
    leggi: (k, nome) => { const d = dbs.get(nome || 'bomtrack_archivio'); return d && d.stores.get('archivio').get(k); },
  };
  function transazione(store, mode) {
    const scritture = [];
    const tx = {
      objectStore: () => ({
        get(k) {
          const req = {};
          dopo(() => { req.result = f.falsaRilettura && k === 'db' && store.has(k) ? 'alterato' : store.get(k); if (req.onsuccess) req.onsuccess(); });
          return req;
        },
        put(v, k) { scritture.push([k, v]); return {}; },
      }),
    };
    dopo(() => {
      if (mode === 'readwrite' && f.quota) {
        tx.error = Object.assign(new Error('spazio esaurito'), { name: 'QuotaExceededError' });
        if (tx.onerror) tx.onerror(); else if (tx.onabort) tx.onabort();
        return;
      }
      scritture.forEach(([k, v]) => store.set(k, v));
      if (tx.oncomplete) tx.oncomplete();
    });
    return tx;
  }
  return f;
}
// Aspetta che le transazioni finte si chiudano: qualche giro dell'event loop.
const asciuga = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 5)); };

function archivio(codice) {
  return makeDb({ items: [Object.assign(mat('m1', 10), { code: codice || 'MIO-001' })],
    users: [{ id: 'u1', name: 'Test', email: 't@t.it', role: 'admin', active: true }] });
}
async function avvia(storage, idb, opts) {
  const a = loadApp(Object.assign({ silent: true, storage }, opts || {}));
  a.ctx.__idb = idb;
  await a.eval('Store.preparaArchivio(__idb)');
  a.eval('Store.load()');
  a.asRole('admin');
  return a;
}

// 0.105.5: la fotografia dell'archivio condiviso in localStorage, oltre
// qualche decina di migliaia di record, non ci stava più.
describe('La fotografia del cloud accanto all\'archivio', () => {
  it('si salva in IndexedDB, fuori da localStorage, e torna al riavvio', async () => {
    const storage = makeStorage();
    const idb = fakeIdb();
    const a = await avvia(storage, idb);
    const grande = { ids: { items: Object.fromEntries(Array.from({ length: 70000 }, (_, i) => ['id-' + i, '2026-10-19T00:00:00.000Z'])) } };
    a.ctx.__grande = grande;
    assert.equal(a.eval(`Store.salvaExtra('cloudBase', __grande)`), true);
    assert.equal(a.eval(`Store.salvaExtra('altro', 1)`), false, 'solo le chiavi previste');
    await asciuga();
    const b = await avvia(storage, idb);
    assert.equal(Object.keys(b.eval(`Store.leggiExtra('cloudBase')`).ids.items).length, 70000);
  });
});

describe('Il trasloco da localStorage', () => {
  it('la prima volta copia l\'archivio, lo rilegge, e solo allora libera localStorage', async () => {
    const storage = makeStorage();
    const idb = fakeIdb();
    storage.setItem('bomtrack_v1', JSON.stringify(archivio()));
    storage.setItem('bomtrack_v1_rev', '7');
    const a = await avvia(storage, idb);
    assert.equal(a.eval('Store.archivio'), 'indexeddb');
    assert.equal(a.eval('db.items[0].code'), 'MIO-001');
    assert.equal(storage.getItem('bomtrack_v1'), null, 'i 5 MB tornano liberi');
    assert.equal(JSON.parse(idb.leggi('db')).items[0].code, 'MIO-001');
    assert.equal(idb.leggi('rev'), 7);
    assert.equal(storage.getItem('bomtrack_v1_in_indexeddb'), '1');
  });

  it('se la copia non torna identica, l\'originale resta dov\'è e si resta su localStorage', async () => {
    const storage = makeStorage();
    const idb = fakeIdb();
    idb.falsaRilettura = true;
    const json = JSON.stringify(archivio());
    storage.setItem('bomtrack_v1', json);
    const a = await avvia(storage, idb);
    assert.equal(a.eval('Store.archivio'), 'local');
    assert.equal(storage.getItem('bomtrack_v1'), json);
    assert.equal(a.eval('db.items[0].code'), 'MIO-001');
  });

  it('un\'installazione nuova parte direttamente in IndexedDB', async () => {
    const storage = makeStorage();
    const idb = fakeIdb();
    const a = await avvia(storage, idb);
    assert.equal(a.eval('Store.archivio'), 'indexeddb');
    await asciuga();
    assert.ok(idb.leggi('db'), 'i dati iniziali sono stati scritti lì');
    assert.equal(storage.getItem('bomtrack_v1'), null);
    assert.equal(storage.getItem('bomtrack_v1_in_indexeddb'), '1', 'segnato alla prima scrittura riuscita');
  });

  it('senza IndexedDB tutto come prima', async () => {
    const storage = makeStorage();
    storage.setItem('bomtrack_v1', JSON.stringify(archivio()));
    const a = await avvia(storage, null);
    assert.equal(a.eval('Store.archivio'), 'local');
    assert.equal(a.eval('db.items[0].code'), 'MIO-001');
  });
});

describe('Dopo il trasloco', () => {
  it('le modifiche arrivano in IndexedDB, e alla riapertura si ritrovano', async () => {
    const storage = makeStorage();
    const idb = fakeIdb();
    storage.setItem('bomtrack_v1', JSON.stringify(archivio()));
    const a = await avvia(storage, idb);
    a.eval('db.items[0].code = "CAMBIATO"; Store.commit()');
    assert.equal(a.eval('Store.scrittureInVolo()'), 1, 'partita ma non ancora arrivata');
    assert.equal(a.eval('lavoroInSospeso()'), true, 'chiudere adesso la perderebbe: lo si dice');
    await asciuga();
    assert.equal(a.eval('Store.scrittureInVolo()'), 0);
    assert.equal(a.eval('lavoroInSospeso()'), false);
    assert.equal(idb.leggi('rev'), a.eval('Store.revisione()'));
    const b = await avvia(storage, idb);
    assert.equal(b.eval('db.items[0].code'), 'CAMBIATO');
  });

  it('le scritture arrivano nell\'ordine in cui partono: vince l\'ultima', async () => {
    const storage = makeStorage();
    const idb = fakeIdb();
    const a = await avvia(storage, idb);
    for (let i = 1; i <= 5; i++) a.eval(`db.settings.nota = "v${i}"; Store.commit()`);
    await asciuga();
    assert.equal(JSON.parse(idb.leggi('db')).settings.nota, 'v5');
  });

  it('una scheda con l\'app vecchia che scrive in localStorage dopo il trasloco non perde il lavoro', async () => {
    const storage = makeStorage();
    const idb = fakeIdb();
    storage.setItem('bomtrack_v1', JSON.stringify(archivio('NUOVA')));
    await avvia(storage, idb);
    // L'app vecchia, aperta in un'altra scheda: scrive in localStorage e alza il contatore.
    storage.setItem('bomtrack_v1', JSON.stringify(archivio('DALLA-VECCHIA')));
    storage.setItem('bomtrack_v1_rev', String(Number(storage.getItem('bomtrack_v1_rev') || 0) + 1));
    const b = await avvia(storage, idb);
    assert.equal(b.eval('db.items[0].code'), 'DALLA-VECCHIA');
  });

  it('localStorage rimasto indietro non vince su IndexedDB', async () => {
    const storage = makeStorage();
    const idb = fakeIdb();
    storage.setItem('bomtrack_v1', JSON.stringify(archivio('A')));
    const a = await avvia(storage, idb);
    a.eval('db.items[0].code = "B"; Store.commit()');
    await asciuga();
    storage.setItem('bomtrack_v1', JSON.stringify(archivio('VECCHIO')));   // stessa revisione, o più bassa
    const b = await avvia(storage, idb);
    assert.equal(b.eval('db.items[0].code'), 'B');
  });

  it('se IndexedDB non si apre più, non si riparte dai dati di esempio: non si salva niente', async () => {
    const storage = makeStorage();
    const idb = fakeIdb();
    storage.setItem('bomtrack_v1', JSON.stringify(archivio()));
    await avvia(storage, idb);
    idb.apertura = false;
    const b = await avvia(storage, idb);
    assert.equal(b.eval('Store.archivio'), 'irraggiungibile');
    assert.equal(storage.getItem('bomtrack_v1'), null, 'niente dati di esempio in localStorage, a fare da archivio con una revisione più alta');
    assert.equal(b.eval('Store.commit()'), false);
    idb.apertura = true;
    const c = await avvia(storage, idb);
    assert.equal(c.eval('db.items[0].code'), 'MIO-001', 'l\'archivio vero è ancora lì');
  });
});

describe('Spazio ed errori', () => {
  it('un archivio oltre i 5 MB di localStorage si salva', async () => {
    const storage = makeStorage(5 * 1024 * 1024);
    const idb = fakeIdb();
    const a = await avvia(storage, idb);
    a.eval('db.settings.zavorra = "x".repeat(8 * 1024 * 1024); Store.commit()');
    await asciuga();
    assert.equal(a.eval('Store.isUnsaved()'), false);
    assert.ok(idb.leggi('db').length > 8 * 1024 * 1024);
  });

  it('una scrittura rifiutata si dice come con localStorage, e la successiva riuscita lo ritira', async () => {
    const storage = makeStorage();
    const idb = fakeIdb();
    const a = await avvia(storage, idb);
    await asciuga();   // il salvataggio dell'avvio arriva prima che lo spazio finisca
    const eventi = [];
    a.ctx.__spia = e => eventi.push(e);
    a.eval('onPersistError = function (kind) { __spia("errore:" + kind); }; onPersistRecovered = function () { __spia("ripreso"); };');
    idb.quota = true;
    a.eval('db.settings.nota = "uno"; Store.commit()');
    await asciuga();
    assert.deepEqual(eventi, ['errore:quota']);
    assert.equal(a.eval('Store.isUnsaved()'), true);
    idb.quota = false;
    a.eval('db.settings.nota = "due"; Store.commit()');
    assert.equal(a.eval('Store.isUnsaved()'), true, 'non è ancora arrivata: non si dichiara salvato');
    await asciuga();
    assert.deepEqual(eventi, ['errore:quota', 'ripreso']);
    assert.equal(a.eval('Store.isUnsaved()'), false);
  });

  it('la scheda Backup dice dove stanno i dati', async () => {
    const a = await avvia(makeStorage(), fakeIdb());
    assert.match(a.eval('renderBackup()'), /IndexedDB/);
    assert.doesNotMatch(a.eval('dbSizeLine()'), /circa 5 MB/);
  });
});

// ── Il browser vero ──
let playwright = null;
try { require.resolve('playwright'); playwright = true; } catch (e) { playwright = false; }
describe('In Chromium, con IndexedDB vero', () => {
  if (!playwright) { it('saltato: Playwright non disponibile (in CI c\'è)', () => {}); return; }
  const path = require('node:path');
  const { execFileSync } = require('node:child_process');
  const esito = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'idb-browser.js')],
    { encoding: 'utf8', env: process.env, maxBuffer: 16 * 1024 * 1024, timeout: 180000 }));
  if (esito.errore) { it('il browser è partito', () => assert.fail(esito.errore)); return; }

  it('l\'app parte in IndexedDB, e un archivio da 8 MB si salva e si ritrova', () => {
    assert.equal(esito.archivio, 'indexeddb');
    assert.equal(esito.nonSalvato, false);
    assert.equal(esito.zavorraDopoRicarica, 8 * 1024 * 1024);
    assert.equal(esito.lsDopo, null);
    assert.deepEqual(esito.errori, []);
  });
  it('un archivio lasciato in localStorage trasloca da solo', () => {
    assert.deepEqual(esito.trasloco, { archivio: 'indexeddb', codice: 'DA-LOCALSTORAGE', ls: null, segno: '1' });
  });
  it('due schede: l\'altra se ne accorge, non sovrascrive, e ricaricando trova il lavoro della prima', () => {
    assert.equal(esito.dueSchede.avviso, true);
    assert.equal(esito.dueSchede.salva, false);
    assert.equal(esito.dueSchede.dopoRicarica, 'DALLA-PRIMA');
  });
});
