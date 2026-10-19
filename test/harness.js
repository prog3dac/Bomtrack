// Carica i file dell'app in un contesto `vm` isolato, riproducendo il modo in
// cui index.html li include: classic script in sequenza, un solo scope globale.
//
// Nota importante per chi scrive test: in un contesto vm le `function` top-level
// finiscono su globalThis (quindi `ctx.costOf` esiste), ma `const Store` e
// `let db` NO — vivono nel global lexical scope. Vanno letti con ref('Store') /
// ref('db'), che è ciò che questo harness espone.

const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// Stessa sequenza di index.html: i file si caricano nello stesso contesto e
// condividono lo scope globale, esattamente come i <script> della pagina.
const SRC = ['icons.js', 'theme.js', 'store.js', 'cloud-map.js', 'cloud.js', 'core.js', 'auth.js', 'costing.js', 'calendario.js', 'shell.js', 'worklist.js',
  'views-bom.js', 'views-rev.js', 'views-stock.js', 'views-catalog.js', 'views-report.js', 'views-jobs.js', 'views-home.js', 'views-dash.js', 'produzione.js', 'views-mrp.js', 'allegati.js', 'archivio.js', 'views-item.js',
  'views-docs.js', 'views-prod.js', 'views-avanzamento.js', 'views-manage.js', 'export-lists.js', 'import-catalog.js', 'columns.js', 'filters.js', 'inspector.js', 'qr.js', 'inventario.js', 'combo.js', 'import-export.js'];

// localStorage finto. `quotaBytes` opzionale: oltre soglia lancia lo stesso
// errore dei browser, per poter testare la gestione dello spazio esaurito.
function makeStorage(quotaBytes) {
  const map = new Map();
  return {
    quotaBytes: quotaBytes == null ? Infinity : quotaBytes,
    get size() { let n = 0; map.forEach((v, k) => { n += k.length + v.length; }); return n; },
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) {
      const s = String(v);
      let n = s.length + String(k).length;
      map.forEach((vv, kk) => { if (kk !== k) n += kk.length + vv.length; });
      if (n > this.quotaBytes) {
        const e = new Error('quota exceeded (finto)');
        e.name = 'QuotaExceededError';
        e.code = 22;
        throw e;
      }
      map.set(String(k), s);
    },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); },
    _map: map,
  };
}

// Elemento permissivo: accetta qualunque lettura o scrittura senza fare nulla.
function elementoFinto() {
  return {
    value: '', textContent: '', innerHTML: '', placeholder: '', title: '',
    disabled: false, checked: false, style: {}, className: '',
    // I pannelli si contano e si cercano tra i figli di #modal-root: qui la
    // parentela è finta ma reale abbastanza da farli comparire e sparire.
    children: [], dataset: {}, parentNode: null,
    offsetWidth: 0, offsetHeight: 0,
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; return c; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    insertBefore(c) { this.children.unshift(c); c.parentNode = this; return c; },
    firstChild: null,
    remove() {}, click() {}, closest() { return null; },
    querySelectorAll() { return []; }, querySelector() { return null; },
    insertAdjacentHTML() {},
    // Gli attributi si ricordano davvero. Erano un no-op, quindi tutto ciò che
    // l'app scrive in un attributo — i ruoli dei pannelli, le etichette che
    // a11yFields ripara, l'urgenza della live region del toast — non era
    // verificabile: si poteva provare che il codice non lancia, non che dica
    // la cosa giusta.
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
    removeAttribute(k) { delete this.attrs[k]; },
    // Il minimo che serve a renderInto(): chi ha il focus, chi contiene chi, e
    // il punto di digitazione. Il focus è finto ma coerente — `focus()` lo
    // sposta davvero, così un test può verificare che il ridisegno lo restituisca.
    tagName: 'DIV', id: '', selectionStart: null, selectionEnd: null,
    scrollTop: 0, scrollLeft: 0,
    focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; },
    contains(x) { return x === this || this.children.includes(x); },
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; },
  };
}

function loadApp(opts) {
  const o = opts || {};
  const storage = o.storage || makeStorage(o.quotaBytes);

  const sandbox = {
    console: o.silent ? { log() {}, warn() {}, error() {} } : console,
    crypto: globalThis.crypto || require('node:crypto').webcrypto,
    // Globale della piattaforma, presente in ogni browser ma non nei contesti
    // vm: lo usa sha256Hex() per convertire la stringa in byte UTF-8.
    TextEncoder,
    localStorage: storage,
    // Volutamente assenti: `document` e `window`. La guardia in fondo a import-export.js
    // (`if (typeof document !== 'undefined') init()`) impedisce l'avvio dell'app.
  };
  const ctx = vm.createContext(sandbox);

  SRC.forEach(f => {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  });

  // Il `document` finto si installa DOPO il caricamento, mai prima: la guardia
  // in fondo a import-export.js avvierebbe l'app. Serve solo a far passare a vuoto le
  // funzioni di interfaccia (showToast, openModal, il badge) quando un test
  // esercita un percorso che le attraversa. Nessun test verifica il DOM.
  // Gli elementi sono memorizzati per id: quello che una funzione di render
  // scrive in innerHTML resta leggibile dal test (vedi app.html()).
  const elementi = new Map();
  sandbox.document = {
    getElementById(id) {
      if (!elementi.has(id)) {
        const e = elementoFinto();
        e.id = id; e.ownerDocument = sandbox.document;
        elementi.set(id, e);
      }
      return elementi.get(id);
    },
    querySelectorAll() { return []; },
    createElement() { return elementoFinto(); },
    body: elementoFinto(),
    // L'elemento radice: è dove theme.js scrive `data-theme`, e senza si poteva
    // solo verificare che themeApply() non esplodesse. Era il test del tema a
    // fabbricarselo da sé — l'unico che estendeva il DOM finto dal di fuori — e
    // il secondo che ne avesse avuto bisogno l'avrebbe ricopiato.
    documentElement: elementoFinto(),
    // Chi ha il focus. `null` come nel DOM vero prima di ogni interazione:
    // le funzioni che lo confrontano si comportano come su una pagina appena
    // caricata, dove nessun campo è a fuoco.
    activeElement: null,
  };
  sandbox.window = sandbox;
  // ── File in entrata e in uscita ──
  // Erano l'ultimo pezzo di piattaforma che mancava, e senza restavano fuori
  // dalla suite tutte le porte d'ingresso dell'app: l'import distinte, quello
  // delle impostazioni, il ripristino di un backup. Sono le funzioni che
  // toccano più dati in una volta, ed erano le uniche non provabili.
  //
  // La lettura è **sincrona**, a differenza del browser: un test che debba
  // aspettare un evento è un test che a volte passa. `fileFinto()` costruisce
  // ciò che un <input type=file> consegna.
  sandbox.FileReader = function FileReader() {
    this.result = null;
    this.error = null;
    const consegna = (r, valore) => {
      r.result = valore;
      if (typeof r.onload === 'function') r.onload({ target: r });
    };
    this.readAsText = function (file) {
      if (file && file._errore) { this.error = file._errore; if (this.onerror) this.onerror({ target: this }); return; }
      consegna(this, file ? file._testo : '');
    };
    this.readAsArrayBuffer = function (file) {
      if (file && file._errore) { this.error = file._errore; if (this.onerror) this.onerror({ target: this }); return; }
      const t = file ? file._testo : '';
      const buf = typeof t === 'string' ? Buffer.from(t, 'binary') : Buffer.from(t);
      consegna(this, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    };
  };
  // I file scaricati non finiscono su disco: si annotano, così un test può
  // verificare che cosa l'app avrebbe consegnato e con che nome.
  sandbox.scaricati = [];
  sandbox.Blob = function Blob(parti) { this.parti = parti || []; this._testo = (parti || []).join(''); };
  sandbox.URL = {
    createObjectURL(b) { sandbox.scaricati.push({ contenuto: b && b._testo }); return 'blob:finto/' + sandbox.scaricati.length; },
    revokeObjectURL() {},
  };
  // ── IndexedDB finto ──
  // Dove finiscono i byte degli allegati (allegati.js). È una mappa in memoria
  // con la forma delle richieste di IndexedDB: le callback si chiamano subito,
  // non al giro successivo, perché un test che aspetta un evento è un test che
  // qualche volta passa. Resta comunque una Promise dal lato dell'app, quindi i
  // test la aspettano come farebbero nel browser.
  const deposito = new Map();
  sandbox.__deposito = deposito;
  // Le tabelle del database degli allegati: `file` per i byte, `config` per il
  // riferimento alla cartella d'archivio. Erano una sola, condivisa da tutti i
  // nomi, e finché archivio.js non è esistito non si notava — ma con due
  // tabelle finte che sono la stessa mappa la configurazione della cartella
  // risulterebbe un file orfano, e `allegatiPulisci()` la butterebbe via.
  const tabelle = { file: deposito, config: new Map() };
  sandbox.__config = tabelle.config;
  function richiesta(esegui) {
    const r = { onsuccess: null, onerror: null, result: undefined, error: null };
    // Il codice che la riceve aggancia onsuccess **dopo** il ritorno: si dà un
    // giro di coda prima di chiamarla, altrimenti non ci sarebbe nessuno ad
    // ascoltare. È l'unico punto asincrono di tutto l'harness.
    Promise.resolve().then(() => {
      try { r.result = esegui(); if (r.onsuccess) r.onsuccess(); }
      catch (e) { r.error = e; if (r.onerror) r.onerror(); }
    });
    return r;
  }
  const tabella = nome => {
    const m = tabelle[nome] || (tabelle[nome] = new Map());
    return {
      put: (v, k) => richiesta(() => { m.set(k, v); return k; }),
      get: k => richiesta(() => m.get(k)),
      delete: k => richiesta(() => { m.delete(k); return undefined; }),
      getAllKeys: () => richiesta(() => Array.from(m.keys())),
    };
  };
  sandbox.indexedDB = {
    open() {
      const d = {
        objectStoreNames: { contains: n => Object.prototype.hasOwnProperty.call(tabelle, n) },
        createObjectStore: n => tabella(n),
        transaction: n => ({ objectStore: () => tabella(n) }),
      };
      return richiesta(() => d);
    },
  };
  // ── La cartella d'archivio, finta ──
  // Riproduce ciò che `showDirectoryPicker` consegna: una cartella che si può
  // scorrere, leggere e scrivere, con le sottocartelle e il permesso. Serve a
  // provare le cose che contano davvero — il documento che non c'è, il permesso
  // negato, il file copiato dentro — che nel browser vero sono proprio quelle
  // che nessuno prova a mano.
  //
  // `__cartella` la costruisce da un oggetto piatto { 'a/b.pdf': 'contenuto' }.
  function cartellaFinta(nome, files, permesso) {
    const dir = (n, prefisso) => {
      const h = {
        kind: 'directory', name: n,
        _permesso: permesso || 'granted',
        queryPermission() { return Promise.resolve(h._permesso); },
        requestPermission() { return Promise.resolve(h._permesso === 'prompt' ? 'granted' : h._permesso); },
        entries() {
          const dentro = new Set();
          Object.keys(files).forEach(path => {
            if (prefisso && !path.startsWith(prefisso)) return;
            const resto = prefisso ? path.slice(prefisso.length) : path;
            const taglio = resto.indexOf('/');
            dentro.add(taglio < 0 ? resto : resto.slice(0, taglio) + '/');
          });
          const voci = Array.from(dentro).map(v => (v.endsWith('/')
            ? [v.slice(0, -1), dir(v.slice(0, -1), (prefisso || '') + v)]
            : [v, fileH((prefisso || '') + v)]));
          let i = 0;
          return { next: () => Promise.resolve(i < voci.length ? { done: false, value: voci[i++] } : { done: true }) };
        },
        getDirectoryHandle(sub) {
          const p = (prefisso || '') + sub + '/';
          if (!Object.keys(files).some(k => k.startsWith(p))) return Promise.reject(new Error('NotFound'));
          return Promise.resolve(dir(sub, p));
        },
        getFileHandle(sub, opt) {
          const p = (prefisso || '') + sub;
          if (files[p] == null && !(opt && opt.create)) return Promise.reject(new Error('NotFound'));
          return Promise.resolve(fileH(p));
        },
        removeEntry(sub) {
          const p = (prefisso || '') + sub;
          if (files[p] == null) return Promise.reject(new Error('NotFound'));
          delete files[p];
          return Promise.resolve();
        },
      };
      return h;
    };
    const fileH = path => ({
      kind: 'file', name: path.split('/').pop(),
      getFile: () => Promise.resolve({
        name: path.split('/').pop(), size: String(files[path] || '').length,
        lastModified: 0, _testo: files[path],
      }),
      createWritable: () => Promise.resolve({
        write(b) { files[path] = typeof b === 'string' ? b : (b && (b._testo || b.name)) || ''; return Promise.resolve(); },
        close() { return Promise.resolve(); },
      }),
    });
    return dir(nome, '');
  }
  // I test la montano così: `a.archivio({ 'catalogo.pdf': '...' })`.
  sandbox.__cartella = cartellaFinta;
  sandbox.__aperti = [];
  sandbox.open = (url) => { sandbox.__aperti.push(url); return null; };
  sandbox.innerWidth = 1280; sandbox.innerHeight = 800;   // i pannelli si posizionano rispetto alla finestra
  sandbox.confirm = () => true;   // le richieste di conferma si accettano: il test verifica l'effetto
  sandbox.setTimeout = (fn) => { void fn; return 0; };   // niente code differite nei test
  sandbox.clearTimeout = () => {};                       // globale della piattaforma, assente nei contesti vm
  sandbox.setInterval = (fn) => { void fn; return 0; };
  sandbox.clearInterval = () => {};

  const ref = name => vm.runInContext(name, ctx);

  return {
    ctx,
    storage,
    ref,
    // Elemento finto per id (persistente): permette di leggere ciò che una
    // funzione di render ha scritto e di preimpostare il valore di un campo.
    // Passa dalla stessa porta dell'app: un elemento creato qui e uno creato da
    // getElementById devono essere lo stesso oggetto, con id e documento.
    el(id) { return sandbox.document.getElementById(id); },
    html(id) { return this.el(id).innerHTML; },
    // Sessione finta: i mutatori passano da roleGuard() e senza utente sono
    // tutti bloccati. Il ruolo si sceglie, così si può verificare anche chi
    // NON deve poter scrivere.
    asRole(role) {
      vm.runInContext(`currentUser = { id: 'u-test', name: 'Test', email: 't@t.it', role: ${JSON.stringify(role || 'admin')}, active: true };`, ctx);
      return this;
    },
    // Collega una cartella d'archivio finta, come se l'utente l'avesse scelta.
    // `files` è piatto: { 'cataloghi/skf.pdf': 'contenuto' }. Le opzioni servono
    // ai casi che contano — `permesso: 'denied'` per il permesso negato,
    // `collega: false` per il PC che non l'ha ancora configurata, `rifiuta` per
    // chi chiude la finestra di sistema senza scegliere.
    archivio(files, opt) {
      const o = opt || {};
      const h = sandbox.__cartella(o.nome || 'Disegni', files || {}, o.permesso);
      sandbox.showDirectoryPicker = () => (o.rifiuta
        ? Promise.reject(Object.assign(new Error('annullato'), { name: 'AbortError' }))
        : Promise.resolve(h));
      if (o.collega !== false) {
        tabelle.config.set('cartella', h);
        storage.setItem('bomtrack_archivio_nome', h.name);
      }
      return h;
    },
    // Collega una cartella dei backup automatici finta. `files` resta vivo: il
    // test lo legge dopo per vedere cosa l'app ha scritto e cosa ha tolto.
    cartellaBackup(files, opt) {
      const o = opt || {};
      const h = sandbox.__cartella(o.nome || 'Backup', files, o.permesso);
      sandbox.showDirectoryPicker = () => (o.rifiuta
        ? Promise.reject(Object.assign(new Error('annullato'), { name: 'AbortError' }))
        : Promise.resolve(h));
      if (o.collega !== false) {
        tabelle.config.set('cartellaBackup', h);
        storage.setItem('bomtrack_backup_cartella_nome', h.name);
      }
      return h;
    },
    // Gli URL che l'app ha aperto in una scheda nuova (i PDF).
    aperti() { return sandbox.__aperti; },
    // Imposta il database in memoria senza passare da localStorage.
    // Serializzato apposta: evita ogni problema di oggetti cross-realm.
    setDb(obj) { vm.runInContext('db = ' + JSON.stringify(obj), ctx); return ref('db'); },
    // Preimposta il blob persistito: il test chiama poi Store.load() e passa
    // dalle migrazioni, come al primo avvio su un PC con dati vecchi.
    seedStorage(obj) { storage.setItem(ref('DB_KEY'), typeof obj === 'string' ? obj : JSON.stringify(obj)); },
    // Copia in realm Node del db (comoda per confronti con JSON.stringify)
    snapshot() { return JSON.parse(vm.runInContext('JSON.stringify(db)', ctx)); },
    eval(expr) { return vm.runInContext(expr, ctx); },
    // L'evento che un <input type=file> consegna al suo gestore. `contenuto` è
    // il testo del file; `errore` simula il file illeggibile (disco rimosso,
    // permessi), che ha un percorso suo e va provato quanto gli altri.
    fileEvent(nome, contenuto, errore) {
      const file = { name: nome, _testo: contenuto, _errore: errore || null };
      return { target: { files: [file], value: nome } };
    },
    // I file che l'app ha "scaricato" durante il test, in ordine.
    scaricati() { return ref('scaricati'); },
  };
}

module.exports = { loadApp, makeStorage };
