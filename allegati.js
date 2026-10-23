// ═══════════════════════════════════════════════════════════
//  BOMTRACK — allegati.js
// ═══════════════════════════════════════════════════════════
// Disegni, schede tecniche e fotografie appesi a un articolo.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
//
// ── Perché non in localStorage ──
// Un solo disegno in PDF pesa più di tutto il database messo insieme.
// `localStorage` dà qualche megabyte in tutto — l'app già avvisa a quota 4 su
// ~5 (`dbSizeLine`) — e ci si può tenere del testo, non dei file. Metterceli
// dentro non avrebbe fatto crescere il database: lo avrebbe fatto **smettere di
// salvare**, e con esso tutto il resto del lavoro.
//
// ── La divisione ──
// I **byte** stanno in IndexedDB, che è fatta per questo e non ha quel limite.
// I **dati** dell'allegato — nome, tipo, dimensione, a quale articolo appartiene,
// chi l'ha messo e quando — restano in `db.attachments` come ogni altra
// collezione: passano da `Store`, finiscono nel backup JSON, si vedono negli
// elenchi, e il giorno del cloud seguono la strada di tutti gli altri.
//
// Il prezzo di questa divisione va detto, ed è scritto anche in Gestione e nel
// README: **il backup JSON non contiene i file**. Porta l'elenco di quali erano,
// così chi lo ripristina su un altro PC vede che cosa manca invece di scoprirlo
// aprendo una scheda vuota. Copiare i file veri è un gesto a sé, e per ora si fa
// riscaricandoli prima di trasferirsi.
//
// ── Sincrono contro asincrono ──
// Tutta l'app è sincrona: si legge `db`, si disegna, si salva. IndexedDB no.
// Il confine sta qui dentro e non passa oltre: le funzioni che l'app chiama per
// **disegnare** leggono solo i dati di `db` e restano sincrone; solo prendere o
// depositare i byte è una promessa, e succede su un gesto esplicito — aggiungi,
// scarica, elimina — dove un attimo di attesa è normale e atteso.

// ── Due modi di allegare, e perché convivono ──
// Dalla 0.78.0 un allegato può essere di due specie, e la scheda lo dice:
//
//   • **documento d'archivio** — un PDF che sta in una cartella fuori dall'app
//     (archivio.js), di cui qui si memorizza solo il percorso. È la forma
//     normale: il backup lo porta davvero, lo stesso file vale per più codici,
//     e il PDF resta quello che il fornitore aggiorna;
//   • **file nel database** — i byte in IndexedDB, la forma nata con la 0.77.0.
//     Resta, e resta funzionante: sostituirla avrebbe significato buttare via
//     gli allegati già caricati, che sono esattamente ciò che non si fa. Ma non
//     si propone più per i nuovi.
//
// Le due specie stanno nella stessa collezione `db.attachments` e si
// distinguono da un campo: chi ha `docId` è un collegamento, chi non ce l'ha
// custodisce i byte. Così ogni conteggio, ogni elenco e ogni pannello che
// esisteva prima continua a vedere tutti gli allegati di un articolo senza
// sapere niente di questa divisione.

const ALLEGATI_DB = 'bomtrack_allegati';
const ALLEGATI_STORE = 'file';
// Oltre questa soglia si rifiuta. Non è un limite tecnico di IndexedDB — che
// regge molto di più — ma un argine al caso in cui qualcuno appende il video
// della prova di collaudo a un codice articolo: il deposito è sul PC, non c'è
// nessuno che lo sorveglia, e la sorpresa arriverebbe mesi dopo sotto forma di
// disco pieno.
const ALLEGATO_MAX_MB = 25;
// Quello che ha senso appendere a un articolo in officina.
const ALLEGATI_ACCETTATI = '.pdf,.dwg,.dxf,.step,.stp,.igs,.iges,.png,.jpg,.jpeg,.webp,.txt,.csv,.xlsx,.docx';

// ─── Il deposito dei byte ───
// Una tabella sola, con l'id dell'allegato per chiave: l'id lo genera il record
// in `db.attachments`, quindi i due lati si ritrovano senza una mappa in mezzo.
let _allegatiDb = null;
function allegatiDisponibili() {
  return typeof indexedDB !== 'undefined' && !!indexedDB;
}
function allegatiApri() {
  if (_allegatiDb) return Promise.resolve(_allegatiDb);
  if (!allegatiDisponibili()) return Promise.reject(new Error('IndexedDB non disponibile'));
  return new Promise((ok, no) => {
    // Versione 2: si aggiunge la tabella `config`, dove archivio.js conserva il
    // riferimento alla cartella. Le due tabelle restano separate perché la
    // pulizia degli orfani spazza `file` per chiavi, e una configurazione
    // finita lì dentro sarebbe un file che non appartiene a nessun articolo —
    // cioè esattamente ciò che quella pulizia butta via.
    const req = indexedDB.open(ALLEGATI_DB, 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(ALLEGATI_STORE)) d.createObjectStore(ALLEGATI_STORE);
      if (!d.objectStoreNames.contains(ARCHIVIO_CONFIG_STORE)) d.createObjectStore(ARCHIVIO_CONFIG_STORE);
    };
    req.onsuccess = () => { _allegatiDb = req.result; ok(_allegatiDb); };
    req.onerror = () => no(req.error || new Error('apertura fallita'));
  });
}
function _transazione(modo, fn) {
  return allegatiApri().then(d => new Promise((ok, no) => {
    const tx = d.transaction(ALLEGATI_STORE, modo);
    const req = fn(tx.objectStore(ALLEGATI_STORE));
    req.onsuccess = () => ok(req.result);
    req.onerror = () => no(req.error || new Error('operazione fallita'));
  }));
}
function allegatoScrivi(id, blob) { return _transazione('readwrite', s => s.put(blob, id)); }
function allegatoLeggi(id) { return _transazione('readonly', s => s.get(id)); }
function allegatoCancella(id) { return _transazione('readwrite', s => s.delete(id)); }

// ─── I dati, che stanno in db ───
function allegatiDi(itemId) {
  return (db.attachments || []).filter(a => a.itemId === itemId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}
function allegatiCount(itemId) { return allegatiDi(itemId).length; }
// Dimensione leggibile. Sotto il mega si scrive in KB: «0,02 MB» non dice niente
// a nessuno.
function pesoFile(bytes) {
  const n = Number(bytes) || 0;
  return n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1024 / 1024).toFixed(1) + ' MB';
}

// ═══════════════════════════════════════════════════════════
//  I DOCUMENTI D'ARCHIVIO
// ═══════════════════════════════════════════════════════════
// Un documento è un PDF dentro la cartella d'archivio, censito una volta sola.
// I codici che lo riguardano ci si **collegano**: il legame è una riga di
// `db.attachments` con il `docId` dentro.

function allegatoDoc(docId) { return (db.attachmentDocs || []).find(d => d.id === docId) || null; }
// Il nome del file, che è l'ultimo segmento del percorso. Serve tenerlo
// derivato e non salvato: un percorso e un nome scritti in due campi diversi
// sono due cose che possono smettere di essere d'accordo.
function allegatoDocNomeFile(d) {
  const p = String((d && d.path) || '');
  const i = p.lastIndexOf('/');
  return i < 0 ? p : p.slice(i + 1);
}
// Che cosa si scrive in elenco. Il nome del file di un catalogo commerciale —
// `SKF-CAT-RS4412-IT-rev3.pdf` — non dice niente a chi guarda la scheda di un
// codice: la descrizione è il campo che lo rende leggibile, e per questo viene
// prima. Se manca si ripiega sul nome, che è sempre meglio di uno spazio vuoto.
function allegatoDocEtichetta(d) {
  if (!d) return 'documento sconosciuto';
  return String(d.description || '').trim() || allegatoDocNomeFile(d);
}
function allegatoDocUsi(docId) { return (db.attachments || []).filter(a => a.docId === docId).length; }
function allegatiDocs() {
  return (db.attachmentDocs || []).slice()
    .sort((a, b) => allegatoDocEtichetta(a).localeCompare(allegatoDocEtichetta(b), 'it', { sensitivity: 'base' }));
}
function allegatoDocPerPath(path) {
  const p = String(path || '').toLowerCase();
  return (db.attachmentDocs || []).find(d => String(d.path || '').toLowerCase() === p) || null;
}

// ─── Collegare ───
// Un solo gesto per i due casi, perché per chi lo compie sono lo stesso gesto:
// se quel PDF è già censito si aggiunge il legame, altrimenti nasce prima il
// documento. Il contrario — «prima registra il documento, poi collegalo» —
// sarebbe una procedura in due tempi per una cosa sola.
function allegatoCollega(itemId, path, descrizione, pagina) {
  if (!roleGuard('catalog')) return null;
  const it = getItem(itemId);
  if (!it || !path) return null;
  let doc = allegatoDocPerPath(path);
  const desc = String(descrizione || '').trim();
  if (!doc) {
    doc = Store.insert('attachmentDocs', { id: newId(), path: String(path), description: desc });
  } else if (desc && desc !== doc.description) {
    // Descrizione scritta meglio dell'ultima volta: vale per tutti i codici che
    // citano quel documento, ed è il motivo per cui il documento è uno solo.
    Store.update('attachmentDocs', doc.id, { description: desc });
  }
  const gia = (db.attachments || []).find(a => a.itemId === itemId && a.docId === doc.id);
  if (gia) { showToast('Questo documento è già allegato al codice', 'error'); return null; }
  const p = Math.max(0, parseInt(pagina, 10) || 0);
  const rec = Store.insert('attachments', { id: newId(), itemId, docId: doc.id, page: p || undefined });
  savedToast('Documento allegato');
  return rec;
}
// Togliere il legame. Se altri codici citano lo stesso PDF — il catalogo di un
// commerciale, appeso a tutta una serie — il file resta: cancellarlo
// romperebbe l'allegato a tutti gli altri. Se era l'ultimo codice a citarlo,
// il documento si cancella davvero, dall'elenco e dalla cartella d'archivio
// (0.112.0, scelta di Andrea: un allegato tolto non deve restare in giro).
function allegatoScollega(id) {
  if (!roleGuard('catalog')) return;
  const rec = (db.attachments || []).find(a => a.id === id);
  if (!rec) return;
  const doc = allegatoDoc(rec.docId);
  const altri = doc ? allegatoDocUsi(doc.id) - 1 : 0;
  const seguito = !doc ? ''
    : (altri > 0 ? `\nIl file resta in archivio: è allegato anche ${altri === 1 ? 'a un altro codice' : 'ad altri ' + altri + ' codici'}.`
      : '\nNessun altro codice lo cita: il PDF verrà cancellato anche dalla cartella d\'archivio.');
  askConfirm(`Togliere "${allegatoDocEtichetta(doc)}" da questo codice?${seguito}`, () => {
    Store.remove('attachments', id);
    if (doc && altri <= 0) {
      allegatoDocCancella(doc).then(() => allegatiRefresh());
      return;
    }
    savedToast('Documento scollegato');
    allegatiRefresh();
  }, altri > 0 || !doc ? undefined : { title: 'Scollega e cancella', ok: 'Scollega e cancella il PDF' });
}
// Il documento esce dall'elenco e il suo PDF dalla cartella. Se il file non si
// può togliere (cartella non impostata su questo PC, permesso negato) il
// documento resta nell'elenco di Gestione → Backup, senza codici, e da lì si
// cancella da un PC che ha la cartella: un file dimenticato in archivio è
// proprio ciò che non si vuole.
function allegatoDocCancella(doc) {
  if (archivioStato() !== 'configurato') {
    showToast('Scollegato, ma il PDF non è stato cancellato: la cartella d\'archivio non è impostata su questo PC. Si cancella da Gestione → Backup', 'error');
    return Promise.resolve(false);
  }
  return archivioElimina(doc.path).then(esito => {
    if (!esito) {
      showToast('Il PDF non si è potuto cancellare dalla cartella: resta in Gestione → Backup', 'error');
      return false;
    }
    Store.remove('attachmentDocs', doc.id);
    savedToast(esito === 'ok' ? 'Documento scollegato e PDF cancellato' : 'Documento tolto (il PDF non era già più in cartella)');
    return true;
  });
}
function allegatoDocDescrizione(docId, testo) {
  if (!roleGuard('catalog')) return;
  const doc = allegatoDoc(docId); if (!doc) return;
  Store.update('attachmentDocs', docId, { description: String(testo || '').trim() });
}
// Eliminare il documento: dall'elenco e, dalla 0.112.0, anche il PDF dalla
// cartella d'archivio. Non si fa finché qualcuno lo cita: stessa regola del
// cliente citato da una commessa.
function allegatoDocElimina(docId) {
  if (!roleGuard('catalog')) return;
  const doc = allegatoDoc(docId); if (!doc) return;
  const usi = allegatoDocUsi(docId);
  if (usi) { showToast(`Documento allegato a ${usi} ${usi === 1 ? 'codice' : 'codici'}: va prima scollegato`, 'error'); return; }
  askConfirm(`Eliminare "${allegatoDocEtichetta(doc)}"?\nIl PDF viene cancellato anche dalla cartella d'archivio.`, () => {
    allegatoDocCancella(doc).then(() => {
      allegatiRefresh();
      if (typeof activeView !== 'undefined' && activeView === 'manage') renderManage();
    });
  }, { title: 'Elimina documento', ok: 'Elimina e cancella il PDF' });
}
// Il percorso cambia — qualcuno ha rinominato o spostato il PDF — e si corregge
// qui, una volta, per tutti i codici che lo citano. È il rimedio al difetto
// dichiarato di questo disegno: il collegamento che si rompe in silenzio.
function allegatoDocRicollega(docId, path) {
  if (!roleGuard('catalog')) return;
  const doc = allegatoDoc(docId); if (!doc || !path) return;
  Store.update('attachmentDocs', docId, { path: String(path) });
  savedToast('Documento ricollegato');
}

// ─── Come si legge un allegato, di qualunque specie ───
// Le due specie hanno campi diversi; chi disegna un elenco non deve saperlo.
function allegatoEtichetta(a) {
  if (!a) return '';
  return a.docId ? allegatoDocEtichetta(allegatoDoc(a.docId)) : String(a.name || 'documento');
}
function allegatoDettaglio(a) {
  if (!a) return '';
  if (!a.docId) return pesoFile(a.size);
  const doc = allegatoDoc(a.docId);
  if (!doc) return 'documento mancante';
  const nome = allegatoDocNomeFile(doc);
  // La pagina si scrive in chiaro anche quando il visualizzatore la aprirebbe da
  // sé: un catalogo di trecento pagine si consulta anche stampato, e il numero
  // serve lì.
  return nome + (a.page > 1 ? ' · pag. ' + a.page : '');
}

// ─── Aprire ───
// I tre esiti che l'utente deve poter distinguere, e che sono tre rimedi
// diversi: non hai ancora allegato niente; il tuo PC non sa dove sia
// l'archivio; il file da quella cartella è sparito.
function allegatoApri(id) {
  const rec = (db.attachments || []).find(a => a.id === id);
  if (!rec) { showToast('NESSUN DOCUMENTO SALVATO', 'error'); return Promise.resolve('nessuno'); }
  if (!rec.docId) { allegatoScarica(id); return Promise.resolve('file'); }
  const doc = allegatoDoc(rec.docId);
  if (!doc) { showToast('NESSUN DOCUMENTO SALVATO', 'error'); return Promise.resolve('nessuno'); }
  return archivioApri(doc.path, rec.page).then(esito => {
    if (esito === 'non-supportato') showToast('Questo browser non può leggere l\'archivio: servono Chrome o Edge', 'error');
    else if (esito === 'non-configurato') showToast('Archivio allegati non impostato su questo PC: scegli la cartella dalla scheda Allegati o da Gestione → Backup', 'error');
    else if (esito === 'negato') showToast('Permesso negato sulla cartella d\'archivio', 'error');
    else if (esito === 'assente') showToast(`DOCUMENTO NON TROVATO — "${doc.path}" non è in ${archivioNome() || 'archivio'}`, 'error');
    else if (esito === 'errore') showToast('Documento non apribile', 'error');
    else if (esito === 'non-pdf') showToast(`"${doc.path}" non è un PDF: dall'archivio si aprono solo i PDF`, 'error');
    return esito;
  });
}

// ─── Aggiungere ───
// Il record nasce **dopo** che i byte sono stati depositati: al contrario si
// avrebbe un allegato in elenco che non si può scaricare, ed è la forma di
// guasto peggiore — visibile, permanente e senza spiegazione.
function allegatoAggiungi(itemId, file) {
  if (!roleGuard('catalog')) return Promise.resolve(null);
  const it = getItem(itemId);
  if (!it || !file) return Promise.resolve(null);
  if (file.size > ALLEGATO_MAX_MB * 1024 * 1024) {
    showToast(`Il file supera ${ALLEGATO_MAX_MB} MB: troppo per stare qui`, 'error');
    return Promise.resolve(null);
  }
  if (!allegatiDisponibili()) {
    showToast('Questo browser non consente di conservare i file allegati', 'error');
    return Promise.resolve(null);
  }
  const id = newId();
  return allegatoScrivi(id, file)
    .then(() => {
      Store.insert('attachments', {
        id, itemId,
        name: String(file.name || 'documento'),
        mime: String(file.type || ''),
        size: Number(file.size) || 0,
      });
      savedToast('Allegato aggiunto');
      return id;
    })
    .catch(e => {
      console.error('Allegato non salvato:', e);
      showToast('Allegato non salvato: spazio esaurito o archivio non disponibile', 'error');
      return null;
    });
}

// ─── Scaricare ───
function allegatoScarica(id) {
  const rec = (db.attachments || []).find(a => a.id === id);
  if (!rec) return;
  allegatoLeggi(id).then(blob => {
    if (!blob) {
      // Il record c'è e il file no: succede se il deposito del browser è stato
      // svuotato (pulizia dei dati dei siti) o se il database è stato importato
      // da un altro PC — il backup JSON i file non li porta, e lo dice.
      // Con l'archivio condiviso il motivo è un altro, e più comune (dalla
      // 0.105.6): l'elenco degli allegati viaggia fra i PC, i byte no. Dare
      // la colpa al backup JSON mandava a cercare un problema che non c'era.
      if (typeof cloudAttivo === 'function' && cloudAttivo()) {
        const chi = rec.createdBy ? actorName(rec.createdBy) : '';
        showToast(`Il file è stato caricato su un altro PC${chi ? ' (da ' + chi + ')' : ''}: l'archivio condiviso porta l'elenco degli allegati, non i file. Chiedilo a chi l'ha caricato, o mettilo nella cartella d'archivio`, 'error');
        return;
      }
      showToast('Il file non è su questo computer: il backup JSON non trasporta gli allegati', 'error');
      return;
    }
    // Stessa strada di exportBackup(): un <a download> usa e getta.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = rec.name;
    a.click(); URL.revokeObjectURL(url);
  }).catch(e => {
    console.error('Allegato non leggibile:', e);
    showToast('Allegato non leggibile', 'error');
  });
}

// ─── Eliminare ───
// Prima il record, poi i byte: l'ordine opposto a quello dell'inserimento, e
// per la stessa ragione. Se la cancellazione dei byte fallisce resta un file
// orfano nel deposito — spazio sprecato, che si recupera con la pulizia in
// Gestione — mentre l'ordine contrario lascerebbe in elenco un allegato che
// non si può più aprire.
function allegatoElimina(id) {
  if (!roleGuard('catalog')) return;
  const rec = (db.attachments || []).find(a => a.id === id);
  if (!rec) return;
  askConfirm(`Eliminare l'allegato "${rec.name}"?`, () => {
    // I byte restano (dalla 0.105.3): il record va nel cestino per TRASH_DAYS
    // giorni, e ripristinarlo dava un allegato senza file. Li toglie la pulizia
    // dei file orfani in Gestione, quando la voce di cestino non c'è più.
    Store.remove('attachments', id);
    savedToast('Allegato eliminato');
    // La scheda si ridisegna, così l'allegato sparisce dall'elenco invece di
    // restarci finché non la si chiude e riapre.
    allegatiRefresh();
  });
}

// Il pulsante «apri documento» sulla riga di catalogo: un gesto solo per il
// caso normale, che è un codice con un documento solo. Con più documenti non si
// indovina quale serva — si apre l'elenco, che è la domanda giusta; con nessuno
// si dice che non c'è, che è la risposta che l'utente sta cercando.
function allegatoApriPrimo(itemId) {
  const lista = allegatiDi(itemId);
  if (!lista.length) { showToast('NESSUN DOCUMENTO SALVATO', 'error'); return Promise.resolve('nessuno'); }
  if (lista.length > 1) { allegatiModal(itemId); return Promise.resolve('elenco'); }
  return allegatoApri(lista[0].id);
}

// ═══════════════════════════════════════════════════════════
//  LA SCHEDA
// ═══════════════════════════════════════════════════════════
// Chiave propria ('allegati'), come il listino: si affianca a ciò che è già
// aperto invece di buttare via un form a metà. E come il listino ricorda su
// quale articolo sta lavorando in una globale, che va spenta alla chiusura.
onPanelClose('allegati', () => { window.__allegatiItemId = null; });
function allegatiModal(id) {
  const it = getItem(id); if (!it) return;
  window.__allegatiItemId = id;
  openModal(`<h3>${ico('folder', 'tinted pill', '')} Allegati — ${esc(it.code)}</h3>
    <p style="color:var(--text-dim);margin-bottom:14px">${esc(it.name)} · ${typeLabel(it.type)}</p>
    <div id="allegati-body">${allegatiBody(id)}</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'allegati');
}
function allegatiRefresh() {
  if (!window.__allegatiItemId) return;
  renderInto('allegati-body', () => allegatiBody(window.__allegatiItemId));
}
function allegatiBody(id) {
  const lista = allegatiDi(id);
  const puoScrivere = canWrite('catalog');
  const collegati = lista.filter(a => a.docId);
  const custoditi = lista.filter(a => !a.docId);
  const meta = a => `${a.createdAt ? esc(fmtDateIt(a.createdAt)) : ''}${a.createdBy ? ' · ' + esc(actorName(a.createdBy)) : ''}`;

  // ── I documenti d'archivio ──
  // Il pulsante che apre è il nome stesso, come ovunque nell'app il codice è il
  // pulsante che apre la scheda: non c'è una seconda colonna di «apri».
  const righeDoc = collegati.map(a => `<div class="mgmt-item">
    <span class="mgmt-item-name">${ico('file', 'tinted', '')}
      <button class="code-link" title="Apri il documento" onclick="allegatoApri('${a.id}')">${esc(allegatoEtichetta(a))}</button></span>
    <span class="mgmt-item-meta">${esc(allegatoDettaglio(a))}${meta(a) ? ' · ' + meta(a) : ''}
      ${puoScrivere ? `<button class="mini-btn danger" title="Togli da questo codice" onclick="allegatoScollega('${a.id}')">${ico('close', 'tinted', 'Scollega')}</button>` : ''}</span>
  </div>`).join('');
  const sezioneDoc = `<h4 class="settings-group-title" style="margin-top:0">${ico('folder', 'tinted', '')} Documenti d'archivio</h4>`
    + (righeDoc ? `<div class="mgmt-list">${righeDoc}</div>`
      : '<div class="empty-text" style="text-align:left;padding:0">NESSUN DOCUMENTO SALVATO</div>')
    + (puoScrivere
      ? `<div style="margin-top:10px"><button class="add-btn-sm" onclick="allegatoCollegaModal('${id}')">+ Collega documento</button></div>`
      : '');

  // ── I file custoditi dal database ──
  // La sezione compare solo se ce n'è almeno uno: a chi parte da zero non si
  // racconta una forma che non deve più usare.
  let sezioneFile = '';
  if (custoditi.length) {
    const righe = custoditi.map(a => `<div class="mgmt-item">
      <span class="mgmt-item-name">${ico('file', 'tinted', '')}
        <button class="code-link" title="Scarica" onclick="allegatoScarica('${a.id}')">${esc(a.name)}</button></span>
      <span class="mgmt-item-meta">${esc(pesoFile(a.size))}${meta(a) ? ' · ' + meta(a) : ''}
        ${puoScrivere ? `<button class="mini-btn danger" title="Elimina l'allegato" onclick="allegatoElimina('${a.id}')">${ico('trash', 'tinted', 'Elimina')}</button>` : ''}</span>
    </div>`).join('');
    sezioneFile = `<h4 class="settings-group-title">${ico('save', 'tinted', '')} File nel database</h4>
      <div class="mgmt-list">${righe}</div>
      <p class="empty-text" style="text-align:left;padding:6px 0 0">Allegati caricati dentro Bomtrack prima della 0.78.0. Restano dove sono e continuano a funzionare, ma <strong>il backup JSON non li porta</strong>: prima di trasferire i dati su un altro PC vanno riscaricati. Per i nuovi si usa l'archivio.</p>`;
  }

  // Dove l'archivio non è disponibile — Firefox, Safari, o l'app aperta con un
  // doppio click — la vecchia strada resta aperta: togliere l'unico modo di
  // allegare a chi non può usare il nuovo significherebbe lasciarlo senza.
  // L'input sta nascosto e lo apre il pulsante: un <input type=file> nudo non
  // somiglia a nessun altro controllo dell'app.
  //
  // Con l'archivio condiviso il pulsante resta, ma dice la verità (dalla
  // 0.105.6): il file finisce nel browser di questo PC, mentre l'allegato
  // compare a tutti i colleghi — che cliccandolo non trovano niente. Chi
  // carica credeva di aver condiviso il disegno.
  const condiviso = typeof cloudAttivo === 'function' && cloudAttivo();
  const ripiego = (puoScrivere && archivioStato() === 'non-supportato')
    ? `<div style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <input type="file" id="allegato-file" style="display:none" accept="${ALLEGATI_ACCETTATI}" onchange="allegatoScelto(event)">
        <button class="${condiviso ? 'btn-outline' : 'add-btn-sm'}" onclick="document.getElementById('allegato-file').click()">+ Carica file ${condiviso ? 'solo su questo PC' : 'nel database'}</button>
        ${condiviso
          ? `<span class="empty-text" style="padding:0;color:var(--orange)"><strong>Il file resta solo su questo PC:</strong> i colleghi vedranno l'allegato nell'elenco ma non potranno aprirlo. Per condividerlo usa la cartella d'archivio comune, da Chrome o Edge.</span>`
          : `<span class="empty-text" style="padding:0">Fino a ${ALLEGATO_MAX_MB} MB l'uno, e fuori dal backup JSON.</span>`}
      </div>`
    : '';

  return archivioBlocco() + sezioneDoc + sezioneFile + ripiego;
}

// ─── Lo stato dell'archivio, scritto dove serve ───
// Compare nella scheda Allegati e in Gestione, ed è lo stesso testo: la cartella
// è un'impostazione **di questo PC**, quindi deve poterla sistemare chiunque
// apra un allegato, non solo chi ha accesso a Gestione.
// `conPulsante` a false dove il pulsante c'è già accanto, e sarebbe lo stesso
// comando scritto due volte a un centimetro di distanza.
function archivioBlocco(conPulsante) {
  const pulsante = conPulsante !== false;
  const stato = archivioStato();
  if (stato === 'non-supportato') {
    return `<p class="empty-text" style="text-align:left;padding:0 0 12px">${ico('warning', 'tinted', '')}
      <strong>Archivio non disponibile su questo browser.</strong> Serve Chrome o Edge, e Bomtrack va aperta dal suo indirizzo
      (non con un doppio click su <span style="font-family:var(--mono)">index.html</span>). I documenti già allegati restano, ma da qui non si aprono.</p>`;
  }
  if (stato === 'non-configurato') {
    return `<p class="empty-text" style="text-align:left;padding:0 0 12px">${ico('warning', 'tinted', '')}
      <strong>Archivio allegati non impostato su questo PC.</strong> Indica la cartella dove stanno i PDF — una cartella locale, oppure quella di un servizio sincronizzato.
      ${pulsante ? `<button class="mini-btn" onclick="archivioSceglieModal()">${ico('folder', 'tinted', '')} Scegli cartella</button>` : ''}</p>`;
  }
  return `<p class="empty-text" style="text-align:left;padding:0 0 12px">
    Archivio di questo PC: <strong>${esc(archivioNome())}</strong>
    ${pulsante ? `<button class="mini-btn" onclick="archivioSceglieModal()" title="Scegli un'altra cartella">${ico('edit', 'tinted', 'Cambia')}</button>` : ''}</p>`;
}
// La scelta passa da qui e non direttamente da `archivioScegli()` perché dopo
// va ridisegnato ciò che è aperto: il nome della cartella compare in due
// pannelli e in Gestione.
function archivioSceglieModal() {
  archivioScegli().then(ok => {
    if (!ok) return;
    allegatiRefresh();
    allegatoCollegaRefresh();
    if (typeof activeView !== 'undefined' && activeView === 'manage') renderManage();
  });
}
// Il file scelto dalla finestra di sistema. Si svuota l'input subito dopo:
// senza, riscegliere lo stesso file non scatenerebbe un secondo `change`.
function allegatoScelto(ev) {
  const file = ev && ev.target && ev.target.files && ev.target.files[0];
  const id = window.__allegatiItemId;
  if (ev && ev.target) ev.target.value = '';
  if (!id || !file) return;
  allegatoAggiungi(id, file).then(() => allegatiRefresh());
}

// ═══════════════════════════════════════════════════════════
//  COLLEGARE UN DOCUMENTO
// ═══════════════════════════════════════════════════════════
// Il pannello che sceglie il PDF. È una **ricerca**, non un elenco da scorrere:
// i cataloghi dei fornitori si chiamano `SKF-CAT-RS4412-IT-rev3.pdf`, e un nome
// così non si riconosce a occhio in mezzo a mille — si cerca.
//
// Le voci sono di due specie e stanno nello stesso elenco, perché per chi
// sceglie sono la stessa cosa: i documenti **già censiti** (allegati ad altri
// codici, quindi con una descrizione già scritta da qualcuno) vengono prima, e
// dietro i PDF che stanno in cartella e che nessuno ha ancora collegato. È il
// caso più frequente di tutti — lo stesso catalogo su quaranta codici — e
// ritrovarsi in cima quello che qualcun altro ha già descritto risparmia di
// riscrivere la descrizione ogni volta.
onPanelClose('allegato-collega', () => {
  window.__collegaItemId = null; window.__collegaDocId = null; window.__collegaPath = null;
  window.__collegaFiltro = ''; window.__collegaFile = null;
});
function allegatoCollegaModal(itemId) {
  if (!roleGuard('catalog')) return;
  const it = getItem(itemId); if (!it) return;
  window.__collegaItemId = itemId;
  window.__collegaDocId = null;
  window.__collegaPath = null;
  window.__collegaFiltro = '';
  window.__collegaFile = null;
  openModal(`<h3>${ico('folder', 'tinted pill', '')} Collega documento — ${esc(it.code)}</h3>
    <div id="collega-body">${allegatoCollegaBody()}</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'allegato-collega');
  allegatoCollegaLeggi(false);
}
function allegatoCollegaRefresh() {
  if (!window.__collegaItemId) return;
  renderInto('collega-body', () => allegatoCollegaBody());
}
// La lettura della cartella. `forza` la riscandisce davvero: serve a chi ha
// appena copiato un PDF nell'archivio da fuori e non lo vede in elenco.
function allegatoCollegaLeggi(forza) {
  if (archivioStato() !== 'configurato') return;
  archivioElenco(forza).then(lista => {
    window.__collegaFile = lista || [];
    allegatoCollegaRefresh();
  }).catch(() => { window.__collegaFile = []; allegatoCollegaRefresh(); });
}
function allegatoCollegaFiltra(v) { window.__collegaFiltro = String(v || ''); allegatoCollegaRefresh(); }
function allegatoCollegaScegli(path) {
  // Ricollegare non passa dal secondo tempo: descrizione e pagina esistono già,
  // e quello che è cambiato è solo dove sta il file.
  if (window.__collegaDocId) {
    allegatoDocRicollega(window.__collegaDocId, path);
    window.__archivioMancanti = null;
    closeModal();
    if (typeof activeView !== 'undefined' && activeView === 'manage') renderManage();
    return;
  }
  window.__collegaPath = path;
  allegatoCollegaRefresh();
}
function allegatoCollegaAnnulla() { window.__collegaPath = null; allegatoCollegaRefresh(); }
function allegatoCollegaBody() {
  if (archivioStato() !== 'configurato') return archivioBlocco();
  // ── Secondo tempo: si è scelto il file, restano descrizione e pagina ──
  if (window.__collegaPath) {
    const doc = allegatoDocPerPath(window.__collegaPath);
    const usi = doc ? allegatoDocUsi(doc.id) : 0;
    return archivioBlocco()
      + `<div class="mgmt-item" style="margin-bottom:12px"><span class="mgmt-item-name">${ico('file', 'tinted', '')} ${esc(window.__collegaPath)}</span>
        <span class="mgmt-item-meta">${usi ? `già allegato a ${usi} ${usi === 1 ? 'codice' : 'codici'}` : 'non ancora usato'}</span></div>
      <div class="modal-grid">
        <div class="modal-field"><label>Descrizione</label><input id="collega-desc" value="${esc((doc && doc.description) || '')}" placeholder="Es. Catalogo cuscinetti SKF"></div>
        <div class="modal-field"><label>Pagina (facoltativa)</label><input type="number" id="collega-pag" min="0" step="1" value="" placeholder="—"></div>
      </div>
      <p class="empty-text" style="text-align:left;padding:4px 0 10px">La <strong>descrizione</strong> è quello che si legge nella scheda del codice: vale per tutti i codici che citano questo file, e riscriverla qui la corregge per tutti.<br>La <strong>pagina</strong> è di questo codice soltanto: un catalogo di trecento pagine si apre dove serve a lui.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="add-btn-sm" onclick="allegatoCollegaConferma()">Collega</button>
        <button class="btn-ghost" onclick="allegatoCollegaAnnulla()">Scegli un altro file</button>
      </div>`;
  }
  // ── Primo tempo: quale file ──
  const q = String(window.__collegaFiltro || '').trim().toLowerCase();
  const lista = window.__collegaFile;
  const noti = new Map();
  (db.attachmentDocs || []).forEach(d => noti.set(String(d.path || '').toLowerCase(), d));
  const voci = (lista || []).map(f => {
    const doc = noti.get(f.path.toLowerCase());
    return { path: f.path, size: f.size, doc, etichetta: doc ? allegatoDocEtichetta(doc) : f.path };
  });
  // I documenti censiti il cui file non c'è più restano scegliibili: ricollegarli
  // è un altro gesto (in Gestione), ma nasconderli qui farebbe credere che non
  // siano mai esistiti.
  (db.attachmentDocs || []).forEach(d => {
    if (!voci.some(v => v.path.toLowerCase() === String(d.path || '').toLowerCase())) {
      voci.push({ path: d.path, size: null, doc: d, etichetta: allegatoDocEtichetta(d), mancante: true });
    }
  });
  const filtrate = voci.filter(v => !q
    || v.path.toLowerCase().includes(q)
    || v.etichetta.toLowerCase().includes(q));
  // I censiti in cima: è da lì che si sceglie quasi sempre.
  filtrate.sort((a, b) => (a.doc ? 0 : 1) - (b.doc ? 0 : 1)
    || a.etichetta.localeCompare(b.etichetta, 'it', { sensitivity: 'base' }));
  const righe = filtrate.slice(0, 300).map(v => {
    const usi = v.doc ? allegatoDocUsi(v.doc.id) : 0;
    const nota = v.mancante ? 'file non trovato in archivio'
      : (v.doc ? `${usi} ${usi === 1 ? 'codice' : 'codici'} · ${esc(v.path)}` : (v.size != null ? esc(pesoFile(v.size)) : ''));
    // Il percorso finisce dentro un attributo `onclick`: passa da jsAttr(). Un
    // nome di file può contenere apici, virgolette e `&` — è testo che scrive chi vuole.
    return `<div class="picker-row" onclick="allegatoCollegaScegli(${jsAttr(v.path)})">
      <span>${ico('file', 'tinted', '')} ${esc(v.etichetta)}</span>
      <span class="mgmt-item-meta">${nota}</span></div>`;
  }).join('');
  const vuoto = lista == null
    ? '<div class="empty-text" style="text-align:left;padding:0">Lettura dell\'archivio in corso…</div>'
    : `<div class="empty-text" style="text-align:left;padding:0">${q ? 'Nessun documento corrisponde alla ricerca.' : 'Nessun PDF nella cartella d\'archivio.'}</div>`;
  return archivioBlocco()
    + `<div class="modal-field" style="margin-bottom:10px"><label>Cerca</label>
        <input id="collega-cerca" value="${esc(window.__collegaFiltro || '')}" oninput="allegatoCollegaFiltra(this.value)" placeholder="Nome del file o descrizione"></div>`
    + (righe ? `<div class="mgmt-list">${righe}</div>` : vuoto)
    + (filtrate.length > 300 ? `<p class="empty-text" style="text-align:left;padding:6px 0 0">Mostrati i primi 300 di ${filtrate.length}: restringi la ricerca.</p>` : '')
    + `<div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="file" id="collega-copia" style="display:none" accept=".pdf" onchange="allegatoCopiaScelto(event)">
        <button class="btn-outline" onclick="document.getElementById('collega-copia').click()">${ico('upload', 'tinted', '')} Copia un PDF nell'archivio</button>
        <button class="btn-outline" onclick="allegatoCollegaLeggi(true)">${ico('refresh', 'tinted', '')} Rileggi la cartella</button>
      </div>
      <p class="empty-text" style="text-align:left;padding:8px 0 0">Un PDF che sta fuori dall'archivio — sul desktop, in una mail — non si può collegare: sugli altri PC quel percorso non esiste. «Copia nell'archivio» lo mette dentro e poi lo collega.</p>`;
}
function allegatoCollegaConferma() {
  const itemId = window.__collegaItemId, path = window.__collegaPath;
  if (!itemId || !path) return;
  const rec = allegatoCollega(itemId, path, val('collega-desc'), val('collega-pag'));
  if (!rec) return;
  closeModal();
  allegatiRefresh();
  // Il conteggio sul pulsante 📁 della riga di catalogo è appena cambiato.
  if (typeof renderCatalogs === 'function') renderCatalogs();
}
// Il PDF scelto da fuori si copia in archivio e si propone subito: senza la
// copia sarebbe un collegamento rotto su ogni altro PC, e chiederlo come gesto
// separato vorrebbe dire che qualcuno se lo dimentica.
function allegatoCopiaScelto(ev) {
  const file = ev && ev.target && ev.target.files && ev.target.files[0];
  if (ev && ev.target) ev.target.value = '';
  if (!file) return;
  if (!/\.pdf$/i.test(file.name)) { showToast('Nell\'archivio vanno i PDF', 'error'); return; }
  archivioNomeLibero(file.name)
    .then(nome => archivioSalva(nome, file))
    .then(nome => {
      if (!nome) { showToast('Copia nell\'archivio non riuscita', 'error'); return; }
      showToast('Copiato in archivio');
      window.__collegaPath = nome;
      allegatoCollegaLeggi(true);
      allegatoCollegaRefresh();
    });
}

// ═══════════════════════════════════════════════════════════
//  L'ARCHIVIO IN GESTIONE
// ═══════════════════════════════════════════════════════════
// L'elenco dei documenti censiti, con quanti codici li citano, e la verifica.
//
// Perché la verifica sta qui e non altrove: il difetto di questo disegno è il
// collegamento che si rompe **in silenzio** — qualcuno rinomina un PDF e
// nessuno lo sa finché non prova ad aprirlo, magari mesi dopo, magari davanti a
// un fornitore. Un comando che lo dice a richiesta è il rimedio, e va eseguito
// sui documenti, non sui collegamenti: un catalogo citato da quaranta codici
// manca una volta sola e va segnalato una volta sola.
function renderArchivio() {
  const mancanti = window.__archivioMancanti instanceof Set ? window.__archivioMancanti : null;
  const docs = allegatiDocs();
  const righe = docs.map(d => {
    const usi = allegatoDocUsi(d.id);
    const perso = mancanti && mancanti.has(String(d.path || '').toLowerCase());
    return `<div class="mgmt-item">
      <span class="mgmt-item-name">${ico(perso ? 'warning' : 'file', 'tinted', '')} ${esc(allegatoDocEtichetta(d))}</span>
      <span class="mgmt-item-meta" style="font-family:var(--mono)">${esc(d.path || '')}</span>
      <span class="doc-badge">${usi} ${usi === 1 ? 'codice' : 'codici'}</span>
      ${perso ? '<span class="doc-badge st-sospeso">non trovato</span>' : ''}
      <div class="mgmt-item-actions">
        <button class="mini-btn" title="Ricollega a un altro file" onclick="allegatoRicollegaModal('${d.id}')">${ico('link', 'tinted', 'Ricollega')}</button>
        <button class="mini-btn danger" title="Togli dall'elenco" onclick="allegatoDocElimina('${d.id}')">${ico('trash', 'tinted', 'Elimina')}</button>
      </div></div>`;
  }).join('') || '<div class="empty-text">Nessun documento d\'archivio.</div>';
  const esito = mancanti
    ? (mancanti.size
      ? `<p style="color:var(--red);margin-top:6px"><strong>${mancanti.size} ${mancanti.size === 1 ? 'documento non trovato' : 'documenti non trovati'}</strong> nella cartella: rinominati, spostati o non ancora sincronizzati. Si sistemano con «Ricollega», una volta per documento e per tutti i codici che lo citano.</p>`
      : '<p style="margin-top:6px">Tutti i documenti censiti sono al loro posto.</p>')
    : '';
  return `<div class="cloud-section" style="margin-top:16px">
    <div style="flex:1">
      <strong>${ico('folder', 'tinted', '')} Archivio allegati</strong>
      <p>I PDF non stanno dentro Bomtrack: stanno in una cartella, e il database ne memorizza il percorso. La cartella è un'impostazione <strong>di questo PC</strong> — ognuno indica la propria, che sia locale o quella di un servizio sincronizzato — e non finisce nel backup: un altro computer avrà un'altra lettera di unità.</p>
      ${archivioBlocco(false)}
      ${esito}
      ${typeof docEmessiVerificaHtml === 'function' ? docEmessiVerificaHtml() : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px">
        <button class="btn-outline" onclick="archivioVerificaUI()">${ico('check', 'tinted', '')} Verifica archivio</button>
        <button class="btn-outline" onclick="archivioSceglieModal()">${ico('folder', 'tinted', '')} ${archivioNome() ? 'Cambia cartella' : 'Scegli cartella'}</button>
      </div>
      <div class="mgmt-list">${righe}</div>
      <p class="empty-text" style="text-align:left;padding:6px 0 0">Eliminare un documento <strong>cancella anche il PDF</strong> dalla cartella d'archivio. Non si può finché un codice lo cita; scollegandolo dall'ultimo codice si cancella da sé.</p>
    </div></div>`;
}
function archivioVerificaUI() {
  if (archivioStato() !== 'configurato') { archivioSceglieModal(); return; }
  // Gli allegati e i documenti emessi stanno nella stessa cartella: una
  // verifica sola le controlla tutte e due.
  Promise.all([archivioVerifica(), docEmessiVerifica()]).then(([mancanti, emessi]) => {
    if (!mancanti) { showToast('Archivio non leggibile: permesso negato o cartella non disponibile', 'error'); return; }
    window.__archivioMancanti = new Set(mancanti.map(d => String(d.path || '').toLowerCase()));
    window.__emessiEsito = emessi;
    const guasti = mancanti.length + (emessi ? emessi.mancanti.length + emessi.alterati.length : 0);
    showToast(guasti ? `${guasti} documenti da controllare` : 'Tutti i documenti sono al loro posto');
    if (typeof activeView !== 'undefined' && activeView === 'manage') renderManage();
  });
}
// Ricollegare passa dallo stesso pannello di scelta: è la stessa domanda —
// «quale file?» — e meritava lo stesso elenco con la stessa ricerca.
function allegatoRicollegaModal(docId) {
  if (!roleGuard('catalog')) return;
  const doc = allegatoDoc(docId); if (!doc) return;
  window.__collegaItemId = null;
  window.__collegaDocId = docId;
  window.__collegaPath = null;
  window.__collegaFiltro = '';
  window.__collegaFile = null;
  openModal(`<h3>${ico('link', 'tinted pill', '')} Ricollega — ${esc(allegatoDocEtichetta(doc))}</h3>
    <p style="color:var(--text-dim);margin-bottom:14px">Era <span style="font-family:var(--mono)">${esc(doc.path || '')}</span> · ${allegatoDocUsi(docId)} codici lo citano</p>
    <div id="collega-body">${allegatoCollegaBody()}</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'allegato-collega');
  allegatoCollegaLeggi(false);
}

// ─── I file rimasti senza un record ───
// Il cestino conserva il record per TRASH_DAYS giorni, quindi un allegato
// eliminato si può rimettere a posto — e per questo i byte non si buttano
// subito. Restano però i casi veri di scarto: un articolo cancellato, un
// database importato da un altro PC, un ripristino. Questa funzione dice quanto
// spazio occupano i file che non appartengono più a nessuno.
function allegatiOrfani() {
  if (!allegatiDisponibili()) return Promise.resolve([]);
  const vivi = new Set((db.attachments || []).map(a => a.id));
  (db.trash || []).forEach(t => { if (t.coll === 'attachments' && t.record) vivi.add(t.record.id); });
  return _transazione('readonly', s => s.getAllKeys())
    .then(chiavi => (chiavi || []).filter(k => !vivi.has(k)))
    .catch(() => []);
}
function allegatiPulisci() {
  if (!roleGuard('manage')) return;
  allegatiOrfani().then(orfani => {
    if (!orfani.length) { showToast('Nessun file da recuperare'); return; }
    askConfirm(`Eliminare ${orfani.length} file che non appartengono più a nessun articolo?`, () => {
      Promise.all(orfani.map(k => allegatoCancella(k)))
        .then(() => { savedToast(`${orfani.length} file rimossi`); renderManage(); })
        .catch(() => showToast('Pulizia non riuscita', 'error'));
    });
  });
}
