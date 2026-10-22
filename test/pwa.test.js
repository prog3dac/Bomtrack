// L'app installabile e offline: manifest e service worker.
//
// Non si prova il comportamento del service worker — servirebbe un browser — ma
// le tre cose che possono andare fuori sincrono **in silenzio**, e che si
// manifestano solo offline, cioè esattamente dove nessuno sta guardando:
//
//   1. uno script aggiunto a index.html e dimenticato in sw.js: online
//      funziona, offline l'app si apre bianca;
//   2. la versione della cache non aggiornata: i browser che hanno già visitato
//      l'app continuano a servire la versione vecchia, per sempre;
//   3. un file elencato che non esiste: `addAll` è atomica e fallisce tutta,
//      quindi l'app resta senza cache senza dirlo a nessuno.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const leggi = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// I file elencati in sw.js, senza il './' davanti.
function fileDelWorker() {
  const m = leggi('sw.js').match(/const FILE = \[([\s\S]*?)\];/);
  assert.ok(m, 'sw.js deve dichiarare l\'elenco FILE');
  // Solo le voci vere dell'elenco: un apostrofo dentro un commento («dell'app»)
  // finirebbe altrimenti fra i file da cercare su disco.
  return [...m[1].matchAll(/'(\.\/[^']*)'/g)].map(x => x[1].replace(/^\.\//, ''));
}
function scriptDiIndex() {
  return [...leggi('index.html').matchAll(/<script src="([^"]+)"><\/script>/g)].map(x => x[1]);
}

describe('Service worker — l\'elenco dei file', () => {
  it('contiene ogni script che la pagina carica', () => {
    const inCache = new Set(fileDelWorker());
    const mancanti = scriptDiIndex().filter(s => !inCache.has(s));
    assert.deepEqual(mancanti, [],
      'uno script fuori dalla cache funziona online e sparisce offline: è il difetto che non si vede provando');
  });

  it('non elenca file che non esistono', () => {
    const assenti = fileDelWorker()
      .filter(f => f !== '')                       // './' è la radice, non un file
      .filter(f => !fs.existsSync(path.join(ROOT, f)));
    assert.deepEqual(assenti, [],
      'caches.addAll() è atomica: un file mancante lascia l\'app senza cache, in silenzio');
  });

  it('mette in cache anche il foglio di stile e il manuale', () => {
    const inCache = new Set(fileDelWorker());
    assert.ok(inCache.has('style.css'), 'senza il foglio di stile l\'app offline è illeggibile');
    assert.ok(inCache.has('manuale.html'), 'il manuale si consulta proprio quando la rete manca');
  });

  it('mette in cache le librerie di export', () => {
    const inCache = new Set(fileDelWorker());
    ['vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js', 'vendor/xlsx.full.min.js', 'vendor/qrcode.js', 'vendor/jsQR.js']
      .forEach(f => assert.ok(inCache.has(f), 'manca ' + f));
  });
});

describe('Service worker — la versione', () => {
  it('è la stessa di APP_VERSION', () => {
    const app = leggi('core.js').match(/const APP_VERSION = '([^']+)'/)[1];
    const sw = leggi('sw.js').match(/const VERSIONE = '([^']+)'/)[1];
    assert.equal(sw, app,
      'una versione nuova con la cache vecchia resta invisibile a chi ha già aperto l\'app');
  });
  // Il changelog, l'app, la sua cache e il manuale devono dire la stessa
  // versione: finora lo garantiva solo la memoria di chi la cambiava.
  it('è quella in cima al CHANGELOG, e quella del manuale', () => {
    const app = leggi('core.js').match(/const APP_VERSION = '([^']+)'/)[1];
    const log = leggi('CHANGELOG.md').match(/^### (\d+\.\d+\.\d+) —/m)[1];
    assert.equal(app, log, 'la versione in cima a CHANGELOG.md va anche in APP_VERSION (core.js) e in sw.js');
    assert.match(leggi('manuale.html'), new RegExp('<span class="chip">v' + app.replace(/\./g, '\\.') + '</span>'),
      'manuale.html va rigenerato: python genera-manuale.py');
  });
});

describe('Il manifest', () => {
  const man = () => JSON.parse(leggi('manifest.webmanifest'));

  it('è JSON valido', () => {
    assert.doesNotThrow(man, 'un manifest illeggibile viene ignorato senza un errore visibile');
  });

  it('parte dalla pagina dell\'app, con percorsi relativi', () => {
    const m = man();
    assert.ok(m.start_url.startsWith('./'), 'un percorso assoluto rompe l\'app servita da una sottocartella');
    assert.ok(m.scope.startsWith('./'));
  });

  it('dichiara icone che esistono davvero', () => {
    man().icons.forEach(i => {
      assert.ok(fs.existsSync(path.join(ROOT, i.src.replace(/^\.\//, ''))), 'manca l\'icona ' + i.src);
    });
  });
});

describe('La pagina', () => {
  it('dichiara il manifest', () => {
    assert.ok(/<link rel="manifest" href="manifest\.webmanifest">/.test(leggi('index.html')));
  });

  // La registrazione non deve nemmeno essere tentata su file://, che è il modo
  // in cui l'app si apre col doppio click: il browser la rifiuterebbe, e
  // l'errore finirebbe nella rete di onAppError come se qualcosa non andasse.
  it('non tenta di registrare il service worker aperta col doppio click', () => {
    const core = leggi('core.js');
    const i = core.indexOf("navigator.serviceWorker.register");
    assert.ok(i > 0, 'la registrazione deve esserci');
    const intorno = core.slice(Math.max(0, i - 400), i);
    assert.ok(intorno.includes("location.protocol !== 'file:'"),
      'su file:// non si registra niente: aprire l\'app con un doppio click è il caso normale, non un errore');
  });

  it('i caratteri non bloccano il primo disegno della pagina', () => {
    const html = leggi('index.html');
    const righe = html.split('\n').filter(l => l.includes('fonts.googleapis.com') && l.includes('rel="stylesheet"'));
    const bloccanti = righe.filter(l => !l.includes('media="print"') && !l.includes('<noscript>'));
    assert.deepEqual(bloccanti, [],
      'un foglio di stile bloccante verso la rete, su un PC senza rete, è una finestra bianca per tutto il timeout del DNS');
  });
});
