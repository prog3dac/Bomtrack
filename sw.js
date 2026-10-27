// ═══════════════════════════════════════════════════════════
//  BOMTRACK — sw.js (service worker)
// ═══════════════════════════════════════════════════════════
// Mette in cache i file dell'app perché si apra **anche senza rete**, e perché
// si possa installare come applicazione sul PC dell'officina.
//
// ── Cosa NON fa ──
// Non tocca i dati. Il database sta in localStorage e non passa mai di qui:
// questo file mette al riparo il *programma*, non l'archivio. Chi cerca il
// backup dei dati lo trova in Gestione › Backup, ed è un'altra cosa.
//
// ── Perché "prima la cache" ──
// I file dell'app cambiano quando cambia la versione, mai da soli. Servirli
// dalla cache è quindi sempre corretto e sempre istantaneo; il giorno in cui
// cambiano, cambia CACHE con la versione e il vecchio deposito viene buttato
// per intero all'`activate`. È l'opposto della scelta giusta per dei *dati*,
// e infatti qui di dati non ce ne sono.
//
// ── L'apertura con doppio click ──
// Su `file://` i service worker non esistono: il browser li rifiuta, e la
// registrazione in core.js se ne accorge e tace. L'app continua a funzionare
// esattamente come prima — è per questo che le librerie stanno in `vendor/`
// invece che qui dentro. Questo file serve a chi la apre da un indirizzo
// `http://`, cioè da Live Server, da una cartella condivisa pubblicata, o dal
// giorno in cui l'app finirà su un dominio.

// La versione la tiene allineata `test/pwa.test.js` a quella di core.js:
// dimenticarla vorrebbe dire spedire una versione nuova che i browser già
// visitati continuano a servire dalla cache vecchia, per sempre.
const VERSIONE = '0.114.1';
const CACHE = 'bomtrack-v' + VERSIONE;

// Tutto ciò che serve a disegnare la prima schermata. L'elenco ricalca
// `index.html` nello stesso ordine, ed è la ragione per cui esiste un test che
// confronta i due: uno script aggiunto alla pagina e dimenticato qui
// funzionerebbe online e sparirebbe offline — cioè il difetto si manifesta
// esattamente dove non lo si sta guardando.
const FILE = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './icona.svg',
  // Librerie di export, già dentro il repo dalla 0.43.0
  './vendor/jspdf.umd.min.js',
  './vendor/jspdf.plugin.autotable.min.js',
  './vendor/xlsx.full.min.js',
  // Codici QR (dalla 0.99.0): disegno e lettura
  './vendor/qrcode.js',
  './vendor/jsQR.js',
  // Gli script dell'app, nell'ordine di index.html
  './icons.js',
  './theme.js',
  './store.js',
  './cloud-map.js',
  './cloud.js',
  './core.js',
  './auth.js',
  './costing.js',
  './calendario.js',
  './shell.js',
  './worklist.js',
  './views-bom.js',
  './views-rev.js',
  './views-stock.js',
  './views-catalog.js',
  './views-report.js',
  './views-jobs.js',
  './views-home.js',
  './views-dash.js',
  './produzione.js',
  './views-mrp.js',
  './allegati.js',
  './archivio.js',
  './documenti.js',
  './views-item.js',
  './views-docs.js',
  './views-prod.js',
  './views-avanzamento.js',
  './views-manage.js',
  './export-lists.js',
  './import-catalog.js',
  './columns.js',
  './filters.js',
  './inspector.js',
  './qr.js',
  './inventario.js',
  './combo.js',
  './import-export.js',
  // Il manuale si consulta mentre si lavora, e in officina la rete è
  // esattamente ciò che manca quando serve consultarlo.
  './manuale.html',
];

self.addEventListener('install', e => {
  // `addAll` è atomica: se un file dell'elenco non c'è, l'installazione
  // fallisce tutta invece di lasciare in giro una cache a metà — che offline
  // si manifesterebbe come una schermata bianca senza spiegazione.
  // `cache: 'reload'`: i file si chiedono al server, non alla cache HTTP del
  // browser (dalla 0.105.3). Altrimenti una versione nuova pubblicata entro i
  // minuti di validità della vecchia si installava con i file vecchi, o con un
  // misto, e restava così fino alla versione dopo.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // Fuori i depositi delle versioni precedenti, e si prende il controllo delle
  // schede già aperte senza aspettare che vengano chiuse. Quelle schede però
  // girano ancora col codice vecchio: il cambio di controllore che `claim()`
  // provoca è il segnale con cui core.js (swAscoltaVersioni) mostra l'avviso
  // «È disponibile una versione nuova — Ricarica» (dalla 0.105.6).
  e.waitUntil(
    caches.keys()
      .then(chiavi => Promise.all(chiavi.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  // Solo le letture, e solo quelle di questa origine: un POST o una richiesta
  // altrove non ha niente a che fare con i file dell'app.
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req).then(colpo => colpo || fetch(req).then(res => {
      // Si deposita solo ciò che è arrivato davvero: una risposta di errore
      // messa in cache diventerebbe un errore permanente.
      if (res && res.ok && res.type === 'basic') {
        const copia = res.clone();
        caches.open(CACHE).then(c => c.put(req, copia));
      }
      return res;
    }).catch(() => {
      // Offline e non in cache. Per una navigazione si torna alla pagina
      // dell'app, che c'è di sicuro; per il resto si lascia fallire la
      // richiesta, che è la verità.
      if (req.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    }))
  );
});
