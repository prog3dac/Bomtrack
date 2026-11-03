// Più organizzazioni sullo stesso PC (organizzazioni.js, dalla 0.136.0).
//
// Il requisito è uno: i dati di un'organizzazione non devono mai finire in
// un'altra. Qui si prova che è così da tutti i lati da cui potrebbe succedere:
//   - la prima organizzazione tiene i nomi di sempre (nessun trasloco);
//   - un'organizzazione nuova non vede archivio, allegati, sessione, coda e
//     collegamento di un'altra, e scrivendo non tocca le chiavi altrui;
//   - una sessione emessa da un altro progetto non si usa;
//   - un link di un progetto nuovo crea un'organizzazione nuova invece di
//     sostituire il collegamento di quella aperta;
//   - togliere un'organizzazione toglie solo le sue cose;
//   - ogni chiave del browser che l'app usa sceglie da che parte stare:
//     dell'organizzazione (chiaveOrg) o personale. Una chiave nuova scritta
//     senza pensarci fa fallire questo file.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('./tap.js');
const { loadApp, makeStorage } = require('./harness.js');
const { makeDb, mat } = require('./fixtures.js');

const ROOT = path.join(__dirname, '..');
const ev = (a, code) => JSON.parse(a.eval(`JSON.stringify(${code})`));

// Un IndexedDB finto che distingue i database per nome: è proprio il nome a
// separare gli archivi delle organizzazioni.
function idbPerNome() {
  const dbs = new Map();
  const dopo = fn => setTimeout(fn, 0);
  const richiesta = fn => { const q = {}; dopo(() => { q.result = fn(); if (q.onsuccess) q.onsuccess(); }); return q; };
  const f = {
    dbs, aperti: [], cancellati: [],
    open(name) {
      f.aperti.push(name);
      const req = {};
      dopo(() => {
        let d = dbs.get(name); const nuovo = !d;
        if (!d) { d = new Map(); dbs.set(name, d); }
        req.result = {
          objectStoreNames: { contains: n => d.has(n) },
          createObjectStore: n => { d.set(n, new Map()); },
          transaction: n => {
            const st = d.get(n);
            const tx = { objectStore: () => ({
              get: k => richiesta(() => st.get(k)),
              put: (v, k) => richiesta(() => { st.set(k, v); return k; }),
              delete: k => richiesta(() => { st.delete(k); }),
            }) };
            dopo(() => dopo(() => { if (tx.oncomplete) tx.oncomplete(); }));
            return tx;
          },
        };
        if (nuovo && req.onupgradeneeded) req.onupgradeneeded();
        if (req.onsuccess) req.onsuccess();
      });
      return req;
    },
    deleteDatabase(n) { f.cancellati.push(n); dbs.delete(n); return {}; },
  };
  return f;
}
const attesa = ms => new Promise(r => setTimeout(r, ms || 20));
async function apri(storage, scheda, idb) {
  const a = loadApp({ silent: true, storage, sessionStorage: scheda || makeStorage() });
  a.ctx.__idb = idb;
  await a.eval('Store.preparaArchivio(__idb)');
  a.eval('Store.load()');
  return a;
}
const chiavi = st => Array.from(st._map.keys()).sort();
const fotografia = (st, filtro) => {
  const o = {};
  st._map.forEach((v, k) => { if (filtro(k)) o[k] = v; });
  return o;
};

describe('Organizzazioni — la prima tiene i nomi di sempre', () => {
  it('senza elenco si apre la prima, con le chiavi e i database di prima', () => {
    const a = loadApp({ silent: true });
    assert.equal(a.eval('orgAttiva()'), '');
    assert.equal(a.eval('DB_KEY'), 'bomtrack_v1');
    assert.equal(a.eval('DB_KEY_REV'), 'bomtrack_v1_rev');
    assert.equal(a.eval('IDB_NOME'), 'bomtrack_archivio');
    assert.equal(a.eval('ALLEGATI_DB'), 'bomtrack_allegati');
    assert.equal(a.eval('CLOUD_KEY'), 'bomtrack_cloud');
    assert.equal(a.eval('CLOUD_SESS_KEY'), 'bomtrack_cloud_sessione');
    assert.equal(a.eval('SESSION_KEY'), 'bomtrack_session');
    assert.equal(a.eval('orgPiuDiUna()'), false, 'con una sola organizzazione la schermata d\'accesso non cambia');
  });

  it('un PC già collegato ritrova collegamento e archivio dove li aveva', () => {
    const st = makeStorage();
    st.setItem('bomtrack_cloud', JSON.stringify({ url: 'https://vecchio.supabase.co', chiave: 'k', allineato: true }));
    const a = loadApp({ silent: true, storage: st });
    assert.equal(ev(a, 'cloudConfig()').url, 'https://vecchio.supabase.co');
    assert.equal(a.eval('orgHost("")'), 'vecchio.supabase.co');
  });
});

describe('Organizzazioni — i dati restano separati', () => {
  it('una seconda organizzazione non vede niente della prima, e scrivendo non la tocca', async () => {
    const st = makeStorage();
    const idb = idbPerNome();
    // La prima: archivio condiviso, sessione, dati, una modifica in coda.
    st.setItem('bomtrack_cloud', JSON.stringify({ url: 'https://acme.supabase.co', chiave: 'kA', allineato: true }));
    const A = await apri(st, null, idb);
    A.setDb(makeDb({ items: [Object.assign(mat('a-1', 1), { name: 'Segreto di Acme' })] }));
    A.eval('saveDB()');
    A.eval(`cloudSalvaSessione({ access_token: 'token-acme', refresh_token: 'r', expires_in: 3600, user: { id: 'u-acme', email: 'anna@acme.it' } })`);
    A.eval(`ricordaEmail('anna@acme.it')`);
    await attesa();
    assert.ok(idb.dbs.get('bomtrack_archivio').get('archivio').get('db').includes('Segreto di Acme'));
    const id = A.eval(`orgAggiungi('Beta', 'https://beta.supabase.co', 'kB')`);
    assert.match(id, /^[a-z0-9]{6,16}$/);
    const primaDiB = fotografia(st, k => !k.includes('@') && k !== 'bomtrack_organizzazioni');

    // La seconda, in un'altra scheda.
    const scheda = makeStorage();
    scheda.setItem('bomtrack_org_attiva', id);
    const B = await apri(st, scheda, idb);
    assert.equal(B.eval('orgAttiva()'), id);
    assert.equal(B.eval('IDB_NOME'), 'bomtrack_archivio@' + id);
    assert.equal(B.eval('ALLEGATI_DB'), 'bomtrack_allegati@' + id);
    assert.equal(ev(B, 'cloudConfig()').url, 'https://beta.supabase.co', 'il collegamento è il suo');
    assert.equal(ev(B, 'cloudConfig()').allineato, false, 'e parte da capo: il primo accesso scarica il suo archivio');
    assert.equal(B.eval('cloudSessione()'), null, 'la sessione di Acme non si vede');
    assert.equal(B.eval('emailRicordata()'), null, 'nemmeno l\'email ricordata');
    assert.equal(B.eval('Store.hasPendingChanges()'), false, 'la coda di Acme non è la sua');
    assert.ok(!JSON.stringify(B.snapshot()).includes('Segreto di Acme'), 'l\'archivio di Acme non entra');
    assert.ok(!idb.aperti.filter(n => n.startsWith('bomtrack_archivio')).slice(1).includes('bomtrack_archivio'), 'B non apre il database di A');

    // B lavora: scrive solo chiavi sue (o le comodità personali), mai quelle di A.
    B.setDb(makeDb({ items: [Object.assign(mat('b-1', 1), { name: 'Pezzo di Beta' })] }));
    B.eval('saveDB()');
    B.eval(`cloudSalvaSessione({ access_token: 'token-beta', refresh_token: 'r', expires_in: 3600, user: { id: 'u-beta', email: 'bruno@beta.it' } })`);
    B.eval(`ricordaEmail('bruno@beta.it')`);
    await attesa();
    assert.deepEqual(fotografia(st, k => !k.includes('@') && k !== 'bomtrack_organizzazioni'), primaDiB, 'le chiavi di Acme sono identiche a prima');
    const nuove = chiavi(st).filter(k => !(k in primaDiB) && k !== 'bomtrack_organizzazioni');
    assert.ok(nuove.length > 0);
    nuove.forEach(k => assert.ok(k.endsWith('@' + id) || k === 'bomtrack_org_attiva', 'chiave di B senza il suo suffisso: ' + k));
    assert.ok(!idb.dbs.get('bomtrack_archivio').get('archivio').get('db').includes('Pezzo di Beta'), 'l\'archivio di Acme non riceve niente');
    assert.ok(idb.dbs.get('bomtrack_archivio@' + id).get('archivio').get('db').includes('Pezzo di Beta'));

    // E Acme, riaperta, è com'era: i suoi dati, la sua sessione, niente di Beta.
    const A2 = await apri(st, makeStorage(), idb);
    assert.equal(A2.eval('orgAttiva()'), '');
    const tutto = JSON.stringify(A2.snapshot());
    assert.ok(tutto.includes('Segreto di Acme') && !tutto.includes('Pezzo di Beta'));
    assert.equal(ev(A2, 'cloudSessione()').access_token, 'token-acme');
  });

  it('una scheda nuova si apre sull\'ultima scelta, una scheda aperta resta sulla sua', () => {
    const st = makeStorage();
    const a = loadApp({ silent: true, storage: st });
    const id = a.eval(`orgAggiungi('Beta', 'https://beta.supabase.co', 'kB')`);
    a.eval(`orgScegli('${id}')`);
    const nuova = loadApp({ silent: true, storage: st });
    assert.equal(nuova.eval('orgAttiva()'), id);
    const sua = makeStorage(); sua.setItem('bomtrack_org_attiva', '');
    const ferma = loadApp({ silent: true, storage: st, sessionStorage: sua });
    assert.equal(ferma.eval('orgAttiva()'), '', 'la scheda che era sulla prima resta lì');
  });

  it('un\'organizzazione tolta da un\'altra scheda non si apre più: si torna alla prima', () => {
    const st = makeStorage();
    st.setItem('bomtrack_organizzazioni', JSON.stringify([{ id: '', nome: '' }]));
    const scheda = makeStorage(); scheda.setItem('bomtrack_org_attiva', 'sparita123');
    const a = loadApp({ silent: true, storage: st, sessionStorage: scheda });
    assert.equal(a.eval('orgAttiva()'), '');
  });

  it('una sessione emessa da un altro progetto non si usa', () => {
    const st = makeStorage();
    st.setItem('bomtrack_cloud', JSON.stringify({ url: 'https://acme.supabase.co', chiave: 'k', allineato: true }));
    st.setItem('bomtrack_cloud_sessione', JSON.stringify({ access_token: 't', refresh_token: 'r', expires_at: 9e9, url: 'https://beta.supabase.co', user: { id: 'u' } }));
    const a = loadApp({ silent: true, storage: st });
    assert.equal(a.eval('cloudSessione()'), null);
    // Quella del suo progetto sì, e una di prima della 0.136.0 (senza indirizzo) anche.
    a.eval(`cloudSalvaSessione({ access_token: 't2', refresh_token: 'r', expires_in: 3600, user: { id: 'u' } })`);
    assert.equal(ev(a, 'cloudSessione()').url, 'https://acme.supabase.co');
    st.setItem('bomtrack_cloud_sessione', JSON.stringify({ access_token: 't3', expires_at: 9e9, user: { id: 'u' } }));
    assert.equal(ev(a, 'cloudSessione()').access_token, 't3');
  });
});

describe('Organizzazioni — il link di collegamento', () => {
  const conLink = (a, cerca, hash) => {
    const fatti = { ricaricata: 0, indirizzo: null };
    a.ctx.location = { search: cerca, hash: hash || '', pathname: '/', origin: 'https://app.it', href: 'https://app.it/' + cerca, reload() { fatti.ricaricata++; } };
    a.ctx.history = { replaceState(s, t, u) { fatti.indirizzo = u; } };
    // Le schede del link si aprono con un attimo di ritardo; qui subito (il
    // setTimeout delle prove non esegue niente).
    a.ctx.setTimeout = fn => { fn(); return 0; };
    return fatti;
  };

  it('il link di un progetto nuovo aggiunge un\'organizzazione, senza toccare il collegamento aperto', async () => {
    const st = makeStorage();
    st.setItem('bomtrack_cloud', JSON.stringify({ url: 'https://acme.supabase.co', chiave: 'kA', allineato: true }));
    const scheda = makeStorage();
    const a = loadApp({ silent: true, storage: st, sessionStorage: scheda });
    const fatti = conLink(a, '?supabase=https%3A%2F%2Fbeta.supabase.co&chiave=kB&nome=Beta');
    assert.equal(a.eval('cloudAllAvvio()'), true);
    await attesa(100);
    assert.match(JSON.stringify(a.el('modal-root').children.map(c => c.innerHTML)), /organizzazione nuova/);
    a.el('cl-org-nome').value = 'Beta';
    a.eval('cloudLinkScelta(true)');
    assert.equal(JSON.parse(st.getItem('bomtrack_cloud')).url, 'https://acme.supabase.co', 'il collegamento di Acme resta');
    const voci = JSON.parse(st.getItem('bomtrack_organizzazioni'));
    const beta = voci.find(o => o.nome === 'Beta');
    assert.ok(beta);
    assert.equal(JSON.parse(st.getItem('bomtrack_cloud@' + beta.id)).url, 'https://beta.supabase.co');
    assert.equal(scheda.getItem('bomtrack_org_attiva'), beta.id, 'la scheda passa a Beta');
    assert.equal(fatti.ricaricata, 1);
    assert.match(fatti.indirizzo, /supabase=/, 'e ricarica con il link, che si completa dentro Beta');
  });

  it('il link di un progetto già sul PC apre la sua organizzazione', () => {
    const st = makeStorage();
    st.setItem('bomtrack_cloud', JSON.stringify({ url: 'https://acme.supabase.co', chiave: 'kA', allineato: true }));
    const a = loadApp({ silent: true, storage: st });
    const id = a.eval(`orgAggiungi('Beta', 'https://beta.supabase.co', 'kB')`);
    const scheda = makeStorage();
    const b = loadApp({ silent: true, storage: st, sessionStorage: scheda });
    const fatti = conLink(b, '?supabase=https%3A%2F%2Fbeta.supabase.co&chiave=kB');
    assert.equal(b.eval('cloudAllAvvio()'), true);
    assert.equal(scheda.getItem('bomtrack_org_attiva'), id);
    assert.equal(fatti.ricaricata, 1);
    assert.equal(fatti.indirizzo, null, 'l\'indirizzo resta com\'è: lo consuma Beta');
    assert.equal(JSON.parse(st.getItem('bomtrack_cloud')).url, 'https://acme.supabase.co');
  });

  it('un PC con dati suoi e senza collegamento sceglie: collegarli o tenerli separati', () => {
    const prova = scelta => {
      const st = makeStorage();
      const scheda = makeStorage();
      const a = loadApp({ silent: true, storage: st, sessionStorage: scheda });
      a.setDb(makeDb({ items: [mat('m-1', 1)] }));
      conLink(a, '?supabase=https%3A%2F%2Fbeta.supabase.co&chiave=kB');
      a.eval('cloudAllAvvio()');
      const scheda1 = JSON.stringify(a.el('modal-root').children.map(c => c.innerHTML));
      assert.match(scheda1, /organizzazione separata/);
      assert.match(scheda1, /Collega</);
      a.eval(`cloudLinkScelta(${scelta})`);
      return { st, scheda, a };
    };
    const unita = prova(false);
    assert.equal(JSON.parse(unita.st.getItem('bomtrack_cloud')).url, 'https://beta.supabase.co', 'collegati: come prima della 0.136.0');
    assert.equal(unita.a.eval('orgElenco().length'), 1);
    const separata = prova(true);
    assert.equal(separata.st.getItem('bomtrack_cloud'), null, 'separati: questo PC resta senza collegamento');
    assert.equal(separata.a.eval('orgElenco().length'), 2);
    assert.notEqual(separata.scheda.getItem('bomtrack_org_attiva'), '');
  });

  it('su un PC vuoto e senza collegamento il link collega come prima', async () => {
    const st = makeStorage();
    const a = loadApp({ silent: true, storage: st });
    a.setDb(makeDb({}));
    const fatti = conLink(a, '?supabase=https%3A%2F%2Facme.supabase.co&chiave=kA');
    assert.equal(a.eval('cloudAllAvvio()'), true);
    await attesa(100);
    a.eval('confirmYes()');
    assert.equal(JSON.parse(st.getItem('bomtrack_cloud')).url, 'https://acme.supabase.co');
    assert.equal(a.eval('orgElenco().length'), 1, 'nessuna organizzazione in più');
    assert.equal(fatti.ricaricata, 1);
  });

  it('il link porta il nome dell\'organizzazione', () => {
    const st = makeStorage();
    st.setItem('bomtrack_cloud', JSON.stringify({ url: 'https://acme.supabase.co', chiave: 'kA' }));
    const a = loadApp({ silent: true, storage: st });
    a.ctx.location = { origin: 'https://app.it', pathname: '/', href: 'https://app.it/' };
    a.eval(`orgRinomina('', 'Acme Srl')`);
    assert.match(a.eval('cloudLinkCollegamento(cloudConfig())'), /&nome=Acme%20Srl$/);
  });
});

describe('Organizzazioni — togliere', () => {
  it('toglie solo le chiavi e i database di quella organizzazione', () => {
    const st = makeStorage();
    st.setItem('bomtrack_cloud', JSON.stringify({ url: 'https://acme.supabase.co', chiave: 'kA' }));
    st.setItem('bomtrack_v1_rev', '7');
    const a = loadApp({ silent: true, storage: st });
    const id = a.eval(`orgAggiungi('Beta', 'https://beta.supabase.co', 'kB')`);
    st.setItem('bomtrack_v1_rev@' + id, '3');
    st.setItem('bomtrack_cloud_sessione@' + id, '{}');
    const cancellati = [];
    a.ctx.indexedDB.deleteDatabase = n => { cancellati.push(n); return {}; };
    assert.equal(a.eval(`orgTogli('${id}', false)`), true);
    assert.deepEqual(chiavi(st).filter(k => k.includes('@')), []);
    assert.equal(st.getItem('bomtrack_v1_rev'), '7', 'la prima resta intatta');
    assert.deepEqual(cancellati.sort(), ['bomtrack_allegati@' + id, 'bomtrack_archivio@' + id]);
    assert.equal(a.eval('orgPiuDiUna()'), false);
  });

  it('mai quella aperta, mai la prima', () => {
    const st = makeStorage();
    const a = loadApp({ silent: true, storage: st });
    const id = a.eval(`orgAggiungi('Beta', 'https://beta.supabase.co', 'kB')`);
    const scheda = makeStorage(); scheda.setItem('bomtrack_org_attiva', id);
    const b = loadApp({ silent: true, storage: st, sessionStorage: scheda });
    assert.equal(b.eval(`orgTogli('${id}', false)`), false, 'quella aperta');
    assert.equal(b.eval(`orgTogli('', false)`), false, 'la prima');
    assert.equal(b.eval('orgPiuDiUna()'), true);
  });
});

describe('Organizzazioni — ogni chiave del browser sceglie da che parte stare', () => {
  // Le comodità di chi guarda lo schermo: nessun dato dentro, comuni a tutte.
  const PERSONALI = new Set(['bomtrack_columns', 'bomtrack.columns', 'bomtrack_group_off', 'bomtrack_filters',
    'bomtrack_inspector', 'bomtrack.inspector', 'bomtrack_theme', 'bomtrack_densita', 'bomtrack_bom_panel',
    'bomtrack_sort', 'bomtrack_cal_nascosti', 'bomtrack_reparto_ordine']);
  const sorgenti = fs.readdirSync(ROOT).filter(f => f.endsWith('.js') && f !== 'organizzazioni.js' && f !== 'sw.js');
  it('ogni nome «bomtrack_…» del codice passa da chiaveOrg() o è una comodità personale', () => {
    const scoperte = [];
    sorgenti.forEach(f => {
      const testo = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const re = /(chiaveOrg\(\s*)?'(bomtrack[_.][a-z0-9_.]*)'/g;
      let m;
      while ((m = re.exec(testo))) {
        const nome = m[2];
        if (m[1] || PERSONALI.has(nome) || nome.endsWith('_')) continue;   // `bomtrack_illeggibile_…`: un nome di file
        scoperte.push(f + ': ' + nome);
      }
    });
    assert.deepEqual(scoperte, [], 'decidi se sono dati dell\'organizzazione (chiaveOrg) o comodità personali (PERSONALI qui)');
  });
});

describe('Organizzazioni — la versione dello schema', () => {
  it('l\'app e schema.sql dicono la stessa versione', () => {
    const a = loadApp({ silent: true });
    const v = a.eval('CLOUD_SCHEMA_VERSIONE');
    const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
    assert.match(sql, new RegExp(`'schema_versione', ${v}\\)`));
  });
  it('uno schema senza versione, o più vecchio, si segnala con il nome dell\'organizzazione', () => {
    const st = makeStorage();
    const a = loadApp({ silent: true, storage: st });
    assert.equal(a.eval('cloudSchemaIndietro({})'), true);
    assert.equal(a.eval('cloudSchemaIndietro({ schema_versione: CLOUD_SCHEMA_VERSIONE })'), false);
    a.eval(`orgAggiungi('Beta', 'https://beta.supabase.co', 'kB'); orgRinomina('', 'Acme')`);
    a.eval('cloudControllaSchema({})');
    assert.match(a.eval('_cloud.messaggio'), /di Acme/);
  });
});
