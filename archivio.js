// ═══════════════════════════════════════════════════════════
//  BOMTRACK — archivio.js
// ═══════════════════════════════════════════════════════════
// La cartella dei documenti: dove stanno i PDF di disegni, schede tecniche e
// cataloghi. Classic script, scope globale condiviso con gli altri: nessun
// modulo e nessun build.
//
// ── Perché una cartella e non il database ──
// Gli allegati "storici" (allegati.js) portano i byte dentro IndexedDB: l'app
// custodisce il file. Funziona, ma paga tre prezzi. Il backup JSON non se li
// porta dietro — è scritto in testa ad allegati.js —, un catalogo che vale per
// quaranta codici viene copiato quaranta volte, e il PDF dentro il browser non
// è più il PDF che il fornitore aggiorna: è una fotografia di com'era.
//
// Qui la scelta è opposta. L'archivio **fisico** resta fuori: una cartella sul
// PC, o la cartella locale di un servizio sincronizzato (OneDrive, Dropbox),
// che è già su tutte le macchine di chi usa Bomtrack. L'app memorizza soltanto
// **dove sta il file dentro quella cartella**, che è un dato come gli altri:
// passa da Store, entra nel backup JSON, e ripristinando altrove continua a
// funzionare purché quel PC abbia la sua copia dell'archivio. Chi aggiorna il
// disegno lo aggiorna nella cartella, con il programma vero, e Bomtrack punta
// già alla versione nuova senza che nessuno riallegi niente.
//
// ── Quale cartella: una scelta locale, per PC ──
// Il percorso NON sta nel database: ogni PC ha il suo archivio, e scriverlo nel
// database vorrebbe dire imporre a tutti la lettera di unità di chi l'ha
// configurato per primo. Sta quindi in locale, come il tema e le colonne
// nascoste, e va impostato una volta su ciascuna macchina.
//
// ── Perché non basta scrivere «C:\Disegni» in un campo ──
// Un browser non apre un percorso scritto a mano: non ha accesso al disco per
// stringa, e non lo avrà mai — è la ragione per cui esiste. L'unico modo è che
// sia **l'utente** a indicare la cartella con una finestra di sistema
// (`showDirectoryPicker`), che consegna un riferimento vivo: da lì l'app può
// elencare, leggere e scrivere, e nient'altro. Il riferimento si conserva in
// IndexedDB e sopravvive alla chiusura, quindi la scelta si fa una volta sola.
//
// Il prezzo è dichiarato e va detto agli utenti: funziona su **Chrome ed Edge**
// (Firefox e Safari non hanno questa interfaccia) e solo se Bomtrack è aperta
// da un indirizzo `https` o `localhost` — aprendo `index.html` con un doppio
// click il browser non ha nessuna origine sotto cui ricordare un permesso, e
// l'archivio non è disponibile. Chi si trova in quel caso deve vederlo scritto,
// non trovare un pulsante che non fa niente: è il motivo per cui
// `archivioStato()` distingue «non supportato» da «non configurato».
//
// ── Il permesso ──
// Il browser ricorda la cartella ma non sempre il permesso: alla prima apertura
// di una sessione può volerne la riconferma, e può chiederla solo mentre
// l'utente sta cliccando qualcosa. Per questo non si chiede niente all'avvio —
// sarebbe una finestra a freddo, che si scaccia senza leggerla — ma al primo
// gesto che ne ha bisogno, dove la domanda ha un perché visibile.

// Il nome leggibile della cartella scelta. Serve solo a **dirlo** in pagina
// («Archivio: Disegni»): il riferimento vero sta in IndexedDB e non è una
// stringa. Tenerne una copia qui permette di disegnare la scheda senza aspettare
// una promessa, come fa tutto il resto dell'app.
const ARCHIVIO_NOME_KEY = 'bomtrack_archivio_nome';
const ARCHIVIO_CONFIG_STORE = 'config';
const ARCHIVIO_CONFIG_KEY = 'cartella';
// Quanto in profondità scendere nelle sottocartelle. Un archivio organizzato per
// anno o per fornitore fa due o tre livelli; oltre, quasi certamente si è scelta
// per sbaglio la radice del disco, e scandirla tutta bloccherebbe l'app per
// minuti senza che nessuno capisca perché.
const ARCHIVIO_PROFONDITA = 3;
// Stessa ragione, dall'altro lato: un tetto al numero di file elencati.
const ARCHIVIO_MAX_FILE = 5000;

// ─── C'è o non c'è ───
function archivioSupportato() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}
function archivioNome() {
  return localPref(ARCHIVIO_NOME_KEY) || '';
}
// Tre stati, non due: «questo browser non può» è una risposta diversa da «non
// l'hai ancora scelta», e porta a un rimedio diverso.
function archivioStato() {
  if (!archivioSupportato()) return 'non-supportato';
  return archivioNome() ? 'configurato' : 'non-configurato';
}

// ─── Dove si conserva il riferimento alla cartella ───
// Nello stesso database dei byte degli allegati, in una tabella sua: un
// riferimento di cartella non è un file, e mescolarli renderebbe la pulizia
// degli orfani (allegatiOrfani) capace di buttare via la configurazione.
function _archivioTx(modo, fn) {
  return allegatiApri().then(d => new Promise((ok, no) => {
    const tx = d.transaction(ARCHIVIO_CONFIG_STORE, modo);
    const req = fn(tx.objectStore(ARCHIVIO_CONFIG_STORE));
    req.onsuccess = () => ok(req.result);
    req.onerror = () => no(req.error || new Error('operazione fallita'));
  }));
}
function archivioHandle() {
  if (!archivioSupportato()) return Promise.resolve(null);
  return _archivioTx('readonly', s => s.get(ARCHIVIO_CONFIG_KEY)).catch(() => null);
}

// ─── Scegliere la cartella ───
// Va chiamata da un click: `showDirectoryPicker` esige che sia l'utente a
// muoversi. L'`id` fa sì che il browser riapra la finestra dove l'aveva lasciata
// la volta prima, invece che nella cartella dei download.
function archivioScegli() {
  if (!archivioSupportato()) {
    showToast('Questo browser non consente di collegare una cartella: servono Chrome o Edge', 'error');
    return Promise.resolve(false);
  }
  return window.showDirectoryPicker({ id: 'bomtrack-archivio', mode: 'readwrite' })
    .then(h => _archivioTx('readwrite', s => s.put(h, ARCHIVIO_CONFIG_KEY)).then(() => {
      try { localStorage.setItem(ARCHIVIO_NOME_KEY, String(h.name || 'cartella')); } catch (e) { /* niente da rompere */ }
      _archivioElenco = null;
      showToast('Archivio allegati collegato');
      return true;
    }))
    // Chiudere la finestra di sistema senza scegliere niente non è un errore: è
    // un ripensamento, e non merita un messaggio rosso.
    .catch(e => {
      if (e && e.name === 'AbortError') return false;
      console.error('Archivio non collegato:', e);
      showToast('Archivio non collegato', 'error');
      return false;
    });
}
function archivioDimentica() {
  _archivioElenco = null;
  try { localStorage.removeItem(ARCHIVIO_NOME_KEY); } catch (e) { /* niente da rompere */ }
  return _archivioTx('readwrite', s => s.delete(ARCHIVIO_CONFIG_KEY)).catch(() => null);
}

// ─── Il permesso, chiesto quando serve ───
function _permesso(h, chiedi) {
  if (!h || typeof h.queryPermission !== 'function') return Promise.resolve(true);
  const opt = { mode: 'readwrite' };
  return h.queryPermission(opt).then(p => {
    if (p === 'granted') return true;
    if (!chiedi || typeof h.requestPermission !== 'function') return false;
    return h.requestPermission(opt).then(r => r === 'granted');
  }).catch(() => false);
}
// La cartella pronta all'uso, o null con il motivo già raccontato da chi chiama.
// `chiedi` distingue i due usi: su un gesto dell'utente si può chiedere il
// permesso, mentre si disegna una pagina no.
function archivioPronto(chiedi) {
  return archivioHandle().then(h => {
    if (!h) return null;
    return _permesso(h, chiedi !== false).then(ok => (ok ? h : null));
  });
}

// ─── Elencare ───
// L'elenco serve a **scegliere** un documento, e con nomi come
// `SKF-CAT-RS4412-IT-rev3.pdf` scegliere significa cercare: senza elenco
// resterebbe digitare il nome esatto a memoria.
//
// Si scorre una volta per sessione e si tiene da parte: una cartella di
// cataloghi non cambia mentre si compila una scheda, e riscandirla a ogni
// carattere digitato nel filtro renderebbe la ricerca inutilizzabile. Il
// pulsante «Rileggi» esiste per il caso in cui sia cambiata davvero.
let _archivioElenco = null;
function _perOgniVoce(dir, fn) {
  const it = dir.entries();
  const passo = () => it.next().then(r => (r.done ? null : Promise.resolve(fn(r.value[0], r.value[1])).then(passo)));
  return passo();
}
function _scandisci(dir, prefisso, prof, out) {
  if (prof > ARCHIVIO_PROFONDITA || out.length >= ARCHIVIO_MAX_FILE) return Promise.resolve(out);
  return _perOgniVoce(dir, (nome, h) => {
    if (out.length >= ARCHIVIO_MAX_FILE) return null;
    const path = prefisso ? prefisso + '/' + nome : nome;
    if (h.kind === 'directory') return _scandisci(h, path, prof + 1, out);
    if (!/\.pdf$/i.test(nome)) return null;
    return h.getFile()
      .then(f => { out.push({ path, size: f.size, lastModified: f.lastModified }); })
      // Un file che il sistema non lascia leggere (in uso, permessi) non deve
      // far fallire l'intera scansione: sparisce dall'elenco e basta.
      .catch(() => null);
  }).then(() => out);
}
function archivioElenco(forza) {
  if (_archivioElenco && !forza) return Promise.resolve(_archivioElenco);
  return archivioPronto(true).then(h => {
    if (!h) return null;
    return _scandisci(h, '', 1, []).then(lista => {
      lista.sort((a, b) => a.path.localeCompare(b.path, 'it', { sensitivity: 'base' }));
      _archivioElenco = lista;
      return lista;
    });
  });
}

// ─── Prendere un file per percorso ───
// Il percorso è relativo alla cartella d'archivio e può attraversare
// sottocartelle: si scende un segmento alla volta. Una cartella o un file che
// non ci sono danno `null`, non un'eccezione — «documento non trovato» è un
// esito normale di questa app, non un guasto.
function archivioFile(path, chiedi) {
  const parti = String(path || '').split('/').filter(Boolean);
  if (!parti.length) return Promise.resolve(null);
  return archivioPronto(chiedi !== false).then(h => {
    if (!h) return null;
    const scendi = (dir, i) => {
      if (i === parti.length - 1) return dir.getFileHandle(parti[i]).then(fh => fh.getFile());
      return dir.getDirectoryHandle(parti[i]).then(sub => scendi(sub, i + 1));
    };
    return scendi(h, 0).catch(() => null);
  });
}

// ─── Metterci dentro un file ───
// Serve a una cosa sola: chi sceglie un PDF che sta fuori dall'archivio — sul
// desktop, in una mail scaricata — creerebbe un collegamento che sugli altri PC
// non punta a niente. Copiarlo dentro trasforma quel gesto in un allegato vero.
function archivioSalva(nome, blob) {
  return archivioPronto(true).then(h => {
    if (!h) return null;
    // Ultima prova sulla cartella vera, subito prima di scrivere: un nome
    // comparso nel frattempo non si tocca (createWritable lo azzererebbe).
    return _archivioEsiste(h, nome).then(c_e => {
      if (c_e) { console.error('Copia in archivio rifiutata: ' + nome + ' esiste già'); return null; }
      return h.getFileHandle(nome, { create: true })
        .then(fh => fh.createWritable())
        .then(w => Promise.resolve(w.write(blob)).then(() => w.close()))
        .then(() => { _archivioElenco = null; return nome; });
    }).catch(e => { console.error('Copia in archivio fallita:', e); return null; });
  });
}
const _archivioEsiste = (h, nome) => h.getFileHandle(nome).then(() => true, () => false);
// Un nome già preso non si sovrascrive: il file che c'è appartiene a qualcun
// altro, e il codice che lo cita non saprebbe mai di aver perso il suo.
// Si chiede alla cartella vera, non all'elenco: quello è letto una volta per
// sessione e si ferma a 5000 PDF, e un file messo da un collega dopo non c'è.
function archivioNomeLibero(nome) {
  return archivioPronto(true).then(h => {
    if (!h) return nome;
    const punto = nome.lastIndexOf('.');
    const base = punto > 0 ? nome.slice(0, punto) : nome;
    const est = punto > 0 ? nome.slice(punto) : '';
    const prova = i => {
      if (i >= 999) return base + ' ' + Date.now() + est;
      const c = i === 1 ? nome : base + ' (' + i + ')' + est;
      return _archivioEsiste(h, c).then(c_e => (c_e ? prova(i + 1) : c));
    };
    return prova(1);
  });
}

// ─── Aprire un PDF ───
// Il file si consegna al visualizzatore del browser come `blob:`, in una scheda
// sua: si legge accanto all'app invece che al posto suo. `#page=` chiede la
// pagina al visualizzatore PDF integrato — se un browser lo ignora si apre
// comunque, alla prima pagina, ed è per questo che il numero di pagina resta
// scritto anche in chiaro nella scheda.
//
// Torna il motivo, non un booleano: chi chiama deve poter dire *quale* delle
// tre cose è andata storta, che è metà di ciò che l'utente chiede.
// Solo PDF (dalla 0.105.3): il file si apre come pagina dell'app, e un HTML o un
// SVG aperto così eseguirebbe i suoi script con i dati e la sessione di
// Bomtrack. Il percorso viaggia con l'archivio condiviso: lo scrive chiunque.
function archivioApri(path, pagina) {
  if (!/\.pdf$/i.test(String(path || ''))) return Promise.resolve('non-pdf');
  if (!archivioSupportato()) return Promise.resolve('non-supportato');
  if (!archivioNome()) return Promise.resolve('non-configurato');
  return archivioFile(path, true).then(f => {
    if (!f) return archivioPronto(false).then(h => (h ? 'assente' : 'negato'));
    const url = URL.createObjectURL(f) + (pagina > 1 ? '#page=' + pagina : '');
    window.open(url, '_blank');
    // L'oggetto resta valido finché la scheda non l'ha caricato: revocarlo
    // subito mostrerebbe una pagina vuota. Un minuto è largo e non trattiene
    // niente di serio — il file vero sta su disco.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return 'ok';
  }).catch(e => { console.error('Apertura fallita:', e); return 'errore'; });
}

// ─── Verificare ───
// Il difetto di questo disegno è il collegamento che si rompe in silenzio:
// qualcuno rinomina o sposta un PDF, e l'app se ne accorge solo il giorno in cui
// qualcun altro prova ad aprirlo. Questo è il rimedio, e va eseguito sui
// **documenti**, non sui collegamenti: un catalogo citato da quaranta codici
// manca una volta sola, e va segnalato una volta sola.
function archivioVerifica() {
  return archivioElenco(true).then(lista => {
    if (!lista) return null;
    const presenti = new Set(lista.map(f => f.path.toLowerCase()));
    return (db.attachmentDocs || []).filter(d => !presenti.has(String(d.path || '').toLowerCase()));
  });
}
