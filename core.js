// ═══════════════════════════════════════════════════════════
//  BOMTRACK — core.js
// ═══════════════════════════════════════════════════════════
// Stato dell'applicazione, utility, ruoli, pannelli e conferme.
// È il fondo comune: tutto il resto lo dà per caricato.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  BOMTRACK — Distinte Base & Costificazione (DB locale)
// ═══════════════════════════════════════════════════════════

// Revisione in esecuzione, mostrata accanto al logo. Va tenuta allineata alla
// voce in cima a CHANGELOG.md (l'app si copia a mano tra PC: sapere
// quale revisione sta girando su una postazione è l'unico modo per capirlo).
const APP_VERSION = '0.110.1';

let currentUser = null;      // utente della sessione (null = schermata di accesso)
let currentBomId = null;     // articolo prodotto attualmente aperto nelle Distinte
let currentCycleItemId = null; // Parte aperta nella vista Cicli di lavorazione
let reportBomId = null;      // articolo selezionato nel report
let mgmtTab = 'suppliers';
let bomExpanded = new Set(); // chiavi-percorso dei nodi espansi
let favOnly = false;         // filtro "solo preferiti" nella vista Acquisti
let activeView = 'bom';
let rfqView = 'list';        // 'list' | 'edit' | 'compare'
let currentRfqId = null;     // richiesta di offerta aperta in editor
let rfqCompareSel = [];      // id delle richieste selezionate nel confronto tra richieste
let rfqDirty = false;        // modifiche non salvate nell'editor RFQ (il documento si genera solo dopo il salvataggio)
let mrpView = 'list';        // 'list' | 'edit' — vista Fabbisogno materiali
let currentPlanId = null;    // piano di produzione aperto
let mrpGrouped = false;      // lista d'acquisto raggruppata per fornitore
let mrpNet = false;          // fabbisogno netto (tolti esistente e in arrivo) invece che lordo
let orderView = 'list';      // 'list' | 'edit'
let currentOrderId = null;   // ordine d'acquisto aperto in editor
let orderDirty = false;      // modifiche non salvate nell'editor ordine
let odlView = 'list';        // 'list' | 'edit' — Ordini di lavoro (conto lavoro)
let currentOdlId = null;     // ordine di lavoro aperto in editor
let odlDirty = false;        // modifiche non salvate nell'editor ODL
let odpView = 'list';        // 'list' | 'edit' — Ordini di produzione (ODP)
let currentOdpId = null;     // ordine di produzione aperto in editor
let odpDirty = false;        // modifiche non salvate nell'editor ODP


// ═══════════════════════════════════════════════════════════
//  UTILITY
// ═══════════════════════════════════════════════════════════
function cur() { return (db.settings && db.settings.currency) || '€'; }
// Gli importi si scrivono all'italiana: «€ 1.125,50», non «€1125.50». Su un
// ordine che parte verso un fornitore il formato inglese si nota subito, e il
// punto senza separatore delle migliaia si legge male da mille in su.
// Scritto a mano e non con toLocaleString: il risultato non deve dipendere dai
// dati di lingua che il browser ha installato — su alcuni manca l'italiano, e
// lo stesso PDF uscirebbe diverso da un PC all'altro.
// Vale per ciò che si **legge** (schermo, PDF): gli Excel scrivono numeri veri,
// e i campi di input vogliono il punto.
function numIt(n, decimali) {
  const d = decimali == null ? 2 : decimali;
  const v = Number(n) || 0;
  const s = Math.abs(v).toFixed(d);
  const [intera, fraz] = s.split('.');
  const gruppi = intera.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 && Number(s) !== 0 ? '-' : '') + gruppi + (fraz ? ',' + fraz : '');
}
function fmtN(n) { return cur() + ' ' + numIt(n, 2); }
// Il prezzo unitario di un documento, con i decimali che ha (da 2 a 4): un
// listino a 4 decimali stampato a 2 è un prezzo diverso da quello concordato, e
// prezzo × quantità non tornava con l'importo della riga.
function fmtPrezzo(n) {
  const v = Number(n) || 0;
  const fraz = (String(+v.toFixed(4)).split('.')[1] || '').length;
  return cur() + ' ' + numIt(v, Math.min(4, Math.max(2, fraz)));
}
// ─── L'importo di una riga di documento ───
// Quantità × prezzo, arrotondato ai centesimi **una volta sola**.
//
// Esiste perché il totale e le righe arrotondavano in due momenti diversi: ogni
// riga finiva a schermo e in PDF passata per fmtN() — cioè a 2 decimali — mentre
// il totale sommava i prodotti a piena precisione e arrotondava solo alla fine.
// Con i prezzi a quattro decimali che il listino ammette, tre righe da 1×1,005
// stampano 1,01 + 1,01 + 1,01 in colonna e 3,02 nel piede.
//
// Su un documento che parte verso un fornitore un totale che non torna con la
// somma delle righe è un errore che si vede, e che tocca a qualcuno spiegare.
// Si arrotonda dove l'importo nasce, e si somma ciò che il fornitore legge.
function importoRiga(l) {
  return +(((Number(l && l.qty) || 0) * (Number(l && l.price) || 0)).toFixed(2));
}
function totaleRighe(lines) { return (lines || []).reduce((s, l) => s + importoRiga(l), 0); }
// L'apice singolo c'è perché il codice scrive di continuo attributi come
// onclick="fn('${x}')". Oggi `x` è sempre un id generato, quindi non c'è niente
// da sfruttare — ma il contratto dell'helper deve reggere l'uso che se ne fa: il
// primo onclick="fn('${esc(it.name)}')" si romperebbe su un articolo chiamato
// «L'albero», e su uno chiamato peggio farebbe altro.
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
// ─── Un dato dentro un onclick ───
// esc() rende innocuo un testo **per l'HTML**, non per il JavaScript che
// l'attributo contiene: il browser prima decodifica l'attributo, poi esegue, e
// un apice decodificato chiude la stringa. Ogni dato scritto da qualcuno — un
// codice, un nome, un percorso, un'ubicazione — che finisce come argomento di
// un comando passa da qui (dalla 0.105.6): JSON.stringify ne fa un letterale
// JavaScript corretto (apici, barre, a capo), esc() lo rende innocuo per
// l'attributo, fra virgolette o fra apici. Il risultato porta già le sue
// virgolette: onclick="fn(${jsAttr(x)})", senza apici intorno.
// Prima c'erano tre ricette a mano (jsAttrStr, esc(JSON.stringify(…)), e
// niente): una sola si controlla, tre si copiano sbagliate.
function jsAttr(v) { return esc(JSON.stringify(String(v == null ? '' : v))); }

// ─── L'unità di misura accanto al numero ───
// Un numero senza unità è un numero da indovinare. «15» in una riga di
// fabbisogno sono quindici pezzi o quindici metri? «3,20» è al pezzo o al chilo?
// Chi ha scritto quella riga lo sa; chi la legge tre settimane dopo — o il
// fornitore che riceve il PDF — no, e sbaglia in silenzio.
//
// Le quantità si formattavano già in due posti diversi (views-mrp e views-docs
// ne avevano una copia a testa, identiche per caso): la definizione sta qui, una
// sola, e con lei i tre modi di appiccicare un'unità a un numero.
//
//   fmtQty  15        →  "15"          quantità nuda (una colonna U.M. accanto)
//   fmtUom  15, 'm'   →  "15 m"        quantità con la sua unità
//   fmtPer  3.2, 'kg' →  "€ 3,20/kg"   prezzo o costo *per* unità
//   labelUom('Scorta minima', 'm')     →  "Scorta minima (m)"
//
// L'unità vuota non produce niente: un articolo senza U.M. resta un numero
// nudo, non "15 " con uno spazio in fondo o "15 (—)".
function fmtQty(n) { n = Number(n) || 0; return Number.isInteger(n) ? String(n) : String(+n.toFixed(3)); }
// La stessa quantità con la virgola, per tutto quello che si **legge**: le
// viste, i messaggi, i PDF («1,5 kg», «0,25 h/pz × € 32,00/h»). Dalla 0.107.0
// ogni vista usa questa. fmtQty resta col punto per i campi numerici, che la
// virgola non la accettano, e per i file che rientrano in un altro programma.
function fmtQtyIt(n) { return fmtQty(n).replace('.', ','); }
function uomSuffix(u) { return u ? ' ' + esc(u) : ''; }
function fmtUom(n, u) { return fmtQtyIt(n) + uomSuffix(u); }
function fmtPer(n, u) { return fmtN(n) + (u ? '/' + esc(u) : ''); }
function labelUom(testo, u) { return u ? `${testo} (${esc(u)})` : String(testo); }
// L'unità di un articolo, pronta da appendere. `itemUom(null)` non lancia:
// molte righe puntano ad articoli che possono essere spariti.
function itemUom(it) { return (it && it.uom) || ''; }
// ─── Indice articoli e cache dei costi ───
// getItem era una scansione lineare di db.items, chiamata dentro costOf e per
// ogni riga di catalogo. L'indice si ricostruisce da solo quando l'array cambia
// identità o lunghezza: copre così anche le mutazioni dirette (db.items.push,
// splice, riassegnazione di db in loadDB/importSnapshot) sparse per le viste.
let _itemIdx = null, _itemIdxArr = null, _itemIdxLen = -1;
function itemIndex() {
  if (_itemIdx && db.items === _itemIdxArr && db.items.length === _itemIdxLen) return _itemIdx;
  _itemIdx = new Map(db.items.map(i => [i.id, i]));
  _itemIdxArr = db.items; _itemIdxLen = db.items.length;
  return _itemIdx;
}
function getItem(id) { return itemIndex().get(id); }
// ─── Indice per codice articolo ───
// L'import cerca gli articoli per codice, una `db.items.find` per riga: un
// foglio da 5.000 righe su un catalogo da 5.000 articoli sono ~50 milioni di
// confronti. Serve anche al controllo di unicità del codice, che senza indice
// costerebbe una scansione a ogni salvataggio.
//
// La chiave normalizza come faceva il confronto che sostituisce: senza spazi ai
// bordi e senza distinzione di maiuscole. "M1" e " m1 " sono lo stesso codice.
function itemCodeKey(code) { return String(code == null ? '' : code).trim().toLowerCase(); }
let _codeIdx = null, _codeIdxArr = null, _codeIdxLen = -1;
function codeIndex() {
  if (_codeIdx && db.items === _codeIdxArr && db.items.length === _codeIdxLen) return _codeIdx;
  const idx = new Map();
  (db.items || []).forEach(i => {
    const k = itemCodeKey(i.code);
    // Il primo vince, come faceva il `.find()` che questo indice sostituisce:
    // finché i duplicati sono possibili, il comportamento non deve cambiare.
    if (k && !idx.has(k)) idx.set(k, i);
  });
  _codeIdx = idx; _codeIdxArr = db.items; _codeIdxLen = db.items.length;
  return idx;
}
function getItemByCode(code) { const k = itemCodeKey(code); return k ? codeIndex().get(k) : undefined; }
// Registra un articolo appena creato senza ricostruire l'indice. Serve
// all'import, che aggiunge migliaia di righe prima del salvataggio: senza
// questo, ogni riga farebbe scattare la ricostruzione (il push cambia la
// lunghezza) e si tornerebbe al costo quadratico di prima.
// Chi dimentica di chiamarla non rompe niente: la ricostruzione successiva
// rimette tutto a posto, semplicemente costa.
function codeIndexAdd(it) {
  if (!_codeIdx || db.items !== _codeIdxArr) return;
  const k = itemCodeKey(it && it.code);
  if (k && !_codeIdx.has(k)) _codeIdx.set(k, it);
  _codeIdxLen = db.items.length;
}
// Codici usati da più di un articolo. Oggi nulla lo impedisce, e l'import ci
// inciampa in silenzio: risolve sempre sul primo trovato. Il report in
// Gestione › Backup li mostra perché qualcuno decida quale tenere — rinominarli
// da soli significherebbe cambiare un identificativo aziendale di nascosto.
function duplicateCodeGroups() {
  const per = new Map();
  (db.items || []).forEach(i => {
    const k = itemCodeKey(i.code);
    if (!k) return;
    let l = per.get(k);
    if (!l) { l = []; per.set(k, l); }
    l.push(i);
  });
  const out = [];
  per.forEach((items, k) => { if (items.length > 1) out.push({ code: items[0].code, key: k, items }); });
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
// ─── Indici per fornitori e centri di lavoro ───
// Stesso motivo dell'indice articoli: `db.suppliers.find(...)` compariva dentro
// il disegno di ogni riga di elenco e di ogni lavorazione del rollup.
let _supIdx = null, _wcIdx = null;
// Famiglie, concetti e utenti tengono anche la lunghezza dell'array da cui sono
// nati: gli import creano famiglie **dentro il ciclo** e chiedono subito dopo il
// codice dell'articolo, che passa da getFamily. Un indice fermo alla foto di
// prima non troverebbe la famiglia appena creata, e il codice uscirebbe senza
// la sua sigla. È la stessa guardia di itemIndex(), per la stessa ragione.
let _famIdx = null, _famIdxArr = null, _famIdxLen = -1;
let _cptIdx = null, _cptIdxLen = -1;
let _userIdx = null, _userIdxArr = null, _userIdxLen = -1;
function supplierIndex() {
  if (!_supIdx) _supIdx = new Map((db.suppliers || []).map(s => [s.id, s]));
  return _supIdx;
}
function getSupplier(id) { return id ? supplierIndex().get(id) : undefined; }
function workCenterIndex() {
  if (!_wcIdx) _wcIdx = new Map((db.workCenters || []).map(w => [w.id, w]));
  return _wcIdx;
}
function getWorkCenter(id) { return id ? workCenterIndex().get(id) : undefined; }
// Famiglie, concetti e autori: stessa ragione, e il carico è lo stesso.
// getFamily la chiamano familyLabel per ogni riga di catalogo e familySigla per
// ogni codice generato; actorName la chiama stampLine per ogni scheda.
function familyIndex() {
  const arr = db.families || [];
  if (_famIdx && arr === _famIdxArr && arr.length === _famIdxLen) return _famIdx;
  _famIdx = new Map(arr.map(f => [f.id, f]));
  _famIdxArr = arr; _famIdxLen = arr.length;
  return _famIdx;
}
function conceptIndex() {
  const arr = conceptList();
  if (_cptIdx && arr.length === _cptIdxLen) return _cptIdx;
  _cptIdx = new Map(arr.map(c => [c.id, c]));
  _cptIdxLen = arr.length;
  return _cptIdx;
}
function userIndex() {
  const arr = db.users || [];
  if (_userIdx && arr === _userIdxArr && arr.length === _userIdxLen) return _userIdx;
  _userIdx = new Map(arr.map(u => [u.id, u]));
  _userIdxArr = arr; _userIdxLen = arr.length;
  return _userIdx;
}
// I nomi dell'anagrafica clienti, pronti da agganciare a un campo di testo con
// `list=`. È un suggerimento, non un vincolo: la commessa di un cliente nuovo
// si scrive comunque, e l'anagrafica si compila dopo.
function customerNames() {
  return (db.customers || []).filter(c => c.active !== false).map(c => c.name || '')
    .filter(Boolean).sort((a, b) => a.localeCompare(b));
}
function customerDatalist(id) {
  return `<datalist id="${id}">${customerNames().map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>`;
}
// ─── Indice inverso figlio → padri ───
// usedBy() scansionava tutto il catalogo a ogni chiamata, e "Dove è usato" la
// invoca una volta per antenato e una seconda per ogni riga della simulazione:
// su un catalogo grande il costo diventava quadratico. L'indice si costruisce
// una volta sola per giro di disegno, come quello degli articoli.
let _parentIdx = null;
function parentIndex() {
  if (_parentIdx) return _parentIdx;
  const idx = new Map();
  const aggiungi = (childId, padre) => {
    if (!childId) return;
    let l = idx.get(childId);
    if (!l) { l = []; idx.set(childId, l); }
    // Lo stesso figlio può comparire più volte nella stessa distinta: il padre
    // va elencato una volta sola, le quantità le somma usageQty().
    if (l[l.length - 1] !== padre) l.push(padre);
  };
  (db.items || []).forEach(i => {
    if (isAssembly(i.type)) (i.components || []).forEach(c => aggiungi(c.itemId, i));
    else if (i.type === 'parte') (i.cycle || []).forEach(r => { if (r.kind !== 'op') aggiungi(r.itemId, i); });
  });
  _parentIdx = idx;
  return idx;
}
// ─── "Usato da qualche parte", in senso ampio ───
// usedBy()/parentIndex() rispondono a «è componente/riga di ciclo di un altro
// articolo?»: basta per bloccare l'eliminazione con un messaggio preciso, ma
// un codice può essere "in uso" anche solo in un movimento di magazzino, una
// riga di RFQ/ordine, un piano MRP o una revisione congelata — nessuno di
// questi lo rende "genitore" di niente, eppure rinominarlo o cancellarlo
// silenzierebbe quel riferimento.
//
// Non serve un secondo elenco di campi da tenere aggiornato a mano: REFS
// (store.js) è già la mappa completa "quale campo punta a un articolo",
// scritta per la migrazione v2 e mantenuta apposta perché aggiungerne una
// fosse una riga sola in un posto solo. La si legge qui, in sola lettura,
// con lo stesso giro che fa migrateV2() per riscriverli.
function isItemUsedAnywhere(id) {
  if (!id) return false;
  const puntaAllItem = campi => Object.keys(campi).some(k => campi[k] === 'item');
  for (const coll of Object.keys(REFS)) {
    const def = REFS[coll];
    const recs = db[coll] || [];
    if (def.fields && puntaAllItem(def.fields)) {
      const chiavi = Object.keys(def.fields).filter(k => def.fields[k] === 'item');
      if (recs.some(rec => chiavi.some(k => rec[k] === id))) return true;
    }
    for (const figlio of Object.keys(def.children || {})) {
      const campiFiglio = def.children[figlio];
      if (!puntaAllItem(campiFiglio)) continue;
      const chiavi = Object.keys(campiFiglio).filter(k => campiFiglio[k] === 'item');
      if (recs.some(rec => (rec[figlio] || []).some(r => chiavi.some(k => r[k] === id)))) return true;
    }
  }
  // Le revisioni congelate (dalla 0.105.6). REFS conosce solo il proprietario
  // della revisione (`itemId`), non quello che la fotografia contiene: le righe
  // di distinta e di ciclo stanno dentro `snapshot`, che è un oggetto libero e
  // non una collezione figlia. Un articolo tolto dalla Rev B ma presente nella
  // Rev A restava così eliminabile, e da quel momento la Rev A — e il registro
  // delle modifiche — diceva «(articolo eliminato)» al posto di quello che
  // c'era davvero. Le lavorazioni (`kind: 'op'`) non puntano a un articolo.
  const inFotografia = (db.revisions || []).some(r => {
    const s = r && r.snapshot;
    if (!s) return false;
    return (s.components || []).some(c => c && c.itemId === id)
      || (s.cycle || []).some(c => c && c.kind !== 'op' && c.itemId === id);
  });
  if (inFotografia) return true;
  // Le righe ODL non hanno un campo itemId proprio: lo portano dentro
  // `phaseKey` (`itemId#indice#workCenterId`), la stessa eccezione che REFS
  // documenta per la migrazione — va controllata a parte.
  return (db.workOrders || []).some(o => (o.lines || [])
    .some(l => typeof l.phaseKey === 'string' && l.phaseKey.startsWith(id + '#')));
}
// Risultati di costOf già calcolati in questo giro di rendering.
let _costCache = new Map();
// Azzera indice e cache. Chiamata da Store.commit() — l'unico punto di scrittura
// da cui passano tutti i salvataggi — e in testa alle viste che mostrano costi.
function invalidateCaches() {
  _costCache.clear();
  _itemIdx = null; _itemIdxArr = null; _itemIdxLen = -1;
  _codeIdx = null; _codeIdxArr = null; _codeIdxLen = -1;
  _supIdx = null; _wcIdx = null; _parentIdx = null;
  _prefixIdx = null; _prefixIdxArr = null; _prefixIdxLen = -1;
  _famIdx = null; _famIdxArr = null; _famIdxLen = -1;
  _cptIdx = null; _cptIdxLen = -1;
  _userIdx = null; _userIdxArr = null; _userIdxLen = -1;
  if (typeof calInvalidate === 'function') calInvalidate();           // sta in calendario.js, caricato dopo
  if (typeof invalidateStock === 'function') invalidateStock();   // sta in views-stock.js, caricato dopo
  if (typeof invalidateItemDocs === 'function') invalidateItemDocs(); // sta in views-item.js, caricato dopo
  if (typeof invalidateProd === 'function') invalidateProd();       // sta in views-prod.js, caricato dopo
  if (typeof invalidateNomiImport === 'function') invalidateNomiImport(); // sta in import-export.js, caricato dopo
}
// ─── Librerie esterne (PDF ed Excel) ───
// Stanno in vendor/, dentro il repo: l'app è fatta per aprirsi con un doppio
// click su file:// e girare offline. Senza di esse `window.jspdf` semplicemente
// non esiste: la destrutturazione lanciava un TypeError che nessuno
// intercettava e l'utente premeva "Esporta" senza vedere accadere nulla.
//
// Il messaggio nomina il file, non la rete. Fino alla 0.43.0 le librerie
// arrivavano da un CDN e «serve la connessione a internet» era la diagnosi
// giusta; da quando sono nel repo quella frase manda a cercare il guasto dalla
// parte sbagliata — si controlla la linea mentre manca un file.
function requirePdf() {
  const lib = typeof window !== 'undefined' && window.jspdf;
  if (lib && lib.jsPDF) return lib.jsPDF;
  showToast('Libreria PDF non disponibile: manca vendor/jspdf.umd.min.js', 'error');
  return null;
}
function requireXlsx() {
  if (typeof XLSX !== 'undefined' && XLSX) return XLSX;
  showToast('Libreria Excel non disponibile: manca vendor/xlsx.full.min.js', 'error');
  return null;
}
// ─── Nome di un file da scaricare ───
// Codici articolo e ragioni sociali finiscono nel nome dei PDF e degli Excel
// esportati, e tutti e due contengono abitualmente caratteri che un nome di file
// non ammette: in officina «AB/123-01» è un codice normalissimo, e la barra lo
// è altrettanto in «Rossi & C. / Milano». Il browser, davanti a un nome
// invalido, non protesta: tronca, oppure salva con un nome che non è quello
// annunciato — e il file non si ritrova più.
//
// Si tiene tutto il resto com'è: accenti e spazi in un nome di file vanno
// benissimo, e sostituirli renderebbe i documenti meno leggibili senza motivo.
const FILE_VIETATI = /[\\/:*?"<>|\x00-\x1f]/g;
function nomeFileSicuro(s, ripiego) {
  const pulito = String(s == null ? '' : s).replace(FILE_VIETATI, '-')
    .replace(/\s+/g, ' ').replace(/^[\s.]+|[\s.]+$/g, '').slice(0, 120).trim();
  return pulito || (ripiego || 'documento');
}
// ─── Ridisegno che non fa perdere il posto ───
// Riscrive l'innerHTML di un contenitore preservando ciò che un ridisegno
// integrale butta via: lo scroll, il focus (ritrovato per id) e il punto di
// digitazione. È la regola generale dietro le toppe che le viste si erano
// scritte da sole — «ridisegna solo la lista», «salta il select se ha il
// focus», «conserva il valore del campo».
//
// Due comportamenti da conoscere:
// - se il focus è su un <select> dentro il contenitore, NON si ridisegna e si
//   ritorna false: un menu a tendina aperto che si richiude sotto il mouse non
//   si può "ripristinare", si può solo non rompere. Il chiamante ridisegnerà
//   al giro successivo.
// - il focus si ritrova per id: un campo attivo senza id non può essere
//   ripristinato, e il ridisegno glielo toglie. I campi su cui si digita
//   dentro un contenitore ridisegnabile devono avere un id.
function renderInto(id, htmlFn) {
  const host = typeof id === 'string' ? document.getElementById(id) : id;
  if (!host) return false;
  const att = document.activeElement;
  const dentro = att && (att === host || (host.contains && host.contains(att)));
  if (dentro && att.tagName === 'SELECT') return false;
  const stato = dentro && att.id ? {
    id: att.id, value: att.value,
    selStart: att.selectionStart, selEnd: att.selectionEnd,
  } : null;
  const scrollTop = host.scrollTop, scrollLeft = host.scrollLeft;
  host.innerHTML = htmlFn();
  a11yFields(host);
  host.scrollTop = scrollTop; host.scrollLeft = scrollLeft;
  if (stato) {
    const el = document.getElementById(stato.id);
    if (el) {
      if (el.value !== undefined && stato.value !== undefined) el.value = stato.value;
      if (el.focus) el.focus();
      if (stato.selStart != null && el.setSelectionRange) {
        try { el.setSelectionRange(stato.selStart, stato.selEnd); } catch { /* tipi senza selezione (number, date…) */ }
      }
    }
  }
  return true;
}
// Indirizzo strutturato → righe di testo (per documenti) o riga singola (per liste)
function addressLines(o) {
  if (!o) return [];
  const l1 = [o.street, o.streetNumber].filter(Boolean).join(' ');
  const cityPart = [o.zip, o.city].filter(Boolean).join(' ');
  const l2 = [cityPart, o.province ? '(' + o.province + ')' : ''].filter(Boolean).join(' ');
  return [l1, l2, o.country].map(s => (s || '').trim()).filter(Boolean);
}
// Tassonomia tipi articolo e regole di contenimento (distinta meccanica)
const ALL_TYPES = ['macchina', 'gruppo', 'sottogruppo', 'parte', 'materiale', 'acquistato'];
const ALLOWED_CHILDREN = {
  macchina: ['gruppo', 'sottogruppo'],
  gruppo: ['sottogruppo', 'parte', 'materiale', 'acquistato'],
  sottogruppo: ['sottogruppo', 'parte', 'materiale', 'acquistato'],
  parte: [], materiale: [], acquistato: [],
};
// ─── Ruoli e permessi ───
// I ruoli limitano la SCRITTURA, non la lettura: tutti vedono tutto. Le aree
// sono quattro: catalog (articoli), bom (distinte), docs (RFQ/ODA), manage.
// Il controllo vero arriverà con Supabase (RLS): qui è una divisione di
// responsabilità tra colleghi, non una barriera di sicurezza.
const ROLES = {
  admin: 'Amministratore',
  acquisti: 'Ufficio acquisti',
  progettazione: 'Progettazione',
  officina: 'Officina e magazzino',
  lettore: 'Lettore',
};
const ROLE_WRITE = {
  admin: ['catalog', 'bom', 'docs', 'manage', 'agenda', 'shop'],
  acquisti: ['docs', 'agenda'],
  progettazione: ['catalog', 'bom', 'agenda'],
  // Chi sta in officina e in magazzino: dichiara l'avanzamento degli ordini di
  // produzione, registra i ricevimenti, rettifica le giacenze e muove il
  // materiale verso i terzisti. Non scrive richieste, ordini, piani né
  // anagrafiche. Prima doveva essere «acquisti», che scrive anche gli ordini.
  officina: ['shop', 'agenda'],
  lettore: [],
};
// L'area `shop` è un sottoinsieme di gesti che prima stavano dentro `docs`
// (avanzamento, ricevimenti) e `catalog` (giacenze): chi aveva quelle aree li
// fa ancora, e chi ha solo `shop` fa solo quelli. Per questo la guardia di quei
// gesti accetta l'una o l'altra, invece di spostarli e togliere qualcosa a
// qualcuno.
function canWriteShop(oppure) { return canWrite('shop') || canWrite(oppure); }
// Senza collegamento (dalla 0.105.6) chi i gesti di officina li fa davvero
// legge che manca il server, non che il suo ruolo non può: roleGuard(oppure)
// guardava solo l'area alternativa, e all'officina — che `catalog` o `docs` non
// li ha — dava la colpa al ruolo proprio nel momento in cui era la rete.
function roleGuardShop(oppure) {
  if (canWriteShop(oppure)) return true;
  if (canWriteRuolo('shop') || canWriteRuolo(oppure)) { showToast(CLOUD_SOLA_LETTURA_MSG, 'error'); return false; }
  return roleGuard(oppure);
}
const AREA_LABELS = { catalog: 'anagrafiche articoli', bom: 'distinte base', docs: 'richieste e ordini', manage: 'gestione', agenda: 'promemoria', shop: 'avanzamento, ricevimenti e giacenze' };
function roleLabel(r) { return ROLES[r] || r || '—'; }
// Il ruolo dice che cosa si può scrivere; il collegamento, se si può adesso.
// Con l'archivio condiviso un PC senza collegamento consulta soltanto
// (cloudSolaLettura): numeri e codici li assegna il server, e una modifica
// fatta al buio arriverebbe ai colleghi chissà quando, magari su un documento
// che nel frattempo hanno cambiato loro.
function canWriteRuolo(area) {
  if (!currentUser) return false;
  return (ROLE_WRITE[currentUser.role] || []).includes(area);
}
function canWrite(area) {
  return canWriteRuolo(area) && !(typeof cloudSolaLettura === 'function' && cloudSolaLettura());
}
function isAdmin() { return !!currentUser && currentUser.role === 'admin'; }
// Guardia dei mutatori, sul modello di rfqGuard: blocca e spiega.
function roleGuard(area) {
  if (canWrite(area)) return true;
  if (canWriteRuolo(area)) { showToast(CLOUD_SOLA_LETTURA_MSG, 'error'); return false; }
  showToast(`Il ruolo "${roleLabel(currentUser && currentUser.role)}" non può modificare ${AREA_LABELS[area] || area}`, 'error');
  return false;
}
// La guardia dei gesti che leggono soltanto (esportare, fare un backup) ma
// sono riservati a un ruolo: valgono anche senza collegamento.
function roleGuardRuolo(area) {
  if (canWriteRuolo(area)) return true;
  showToast(`Il ruolo "${roleLabel(currentUser && currentUser.role)}" non può modificare ${AREA_LABELS[area] || area}`, 'error');
  return false;
}
// Area di scrittura corrispondente a ciascuna vista (per il banner di sola lettura)
// `load` (Carico centri) è null come `report`: è un prospetto derivato, in sola
// lettura, da cui non si scrive niente.
const VIEW_AREA = { home: null, dash: null, bom: 'bom', buy: 'catalog', design: 'catalog', stock: 'catalog', cycles: 'catalog', load: null, avz: null, report: null, jobs: 'docs', mrp: 'docs', rfq: 'docs', orders: 'docs', odl: 'docs', odp: 'docs', pricelist: 'catalog', manage: 'manage' };
// Le viste in cui l'officina lavora pur senza l'area della vista: lì non va in
// sola lettura, e le guardie dei singoli gesti fanno il resto.
const SHOP_VIEWS = new Set(['stock', 'orders', 'odl', 'odp']);

// Le due viste di anagrafica: ciò che si compra e ciò che si progetta.
// Ogni vista ha i suoi filtri (prefisso degli id nella pagina) e la creazione
// di articoli è ristretta ai tipi di sua competenza.
const CATALOG_SCOPES = {
  buy: { types: ['acquistato', 'materiale'], pfx: 'buy', title: 'Commerciali & materie prime' },
  design: { types: ['macchina', 'gruppo', 'sottogruppo', 'parte'], pfx: 'des', title: 'Macchine, gruppi e parti' },
};
function scopeOf(type) { return CATALOG_SCOPES.buy.types.includes(type) ? 'buy' : 'design'; }
// Tipi inseribili nel ciclo di lavorazione di una Parte (le lavorazioni sono a parte, dai centri di lavoro)
const CYCLE_CHILD_TYPES = ['acquistato', 'materiale'];
const TYPE_LABELS = { macchina: 'Macchina', gruppo: 'Gruppo', sottogruppo: 'Sottogruppo', parte: 'Parte', materiale: 'Materia prima', acquistato: 'Commerciale' };
const TYPE_SHORTS = { macchina: 'MAC', gruppo: 'GRP', sottogruppo: 'SGR', parte: 'PRT', materiale: 'MAT', acquistato: 'CMM' };
// Il tipo arriva dall'archivio, e nell'archivio condiviso lo scrive un collega:
// un valore fuori elenco non deve mai finire nell'HTML così com'è.
function typeLabel(t) { return TYPE_LABELS[t] || esc(t); }
// Per le classi CSS (tt-…): solo i tipi noti.
function typeKey(t) { return TYPE_LABELS[t] ? t : 'x'; }
function typeShort(t) { return TYPE_SHORTS[t] || '?'; }

// ─── Unità di misura (elenco gestito in Gestione › Unità di misura) ───
function uomList() { return (db.settings && db.settings.uoms) || []; }
function defaultUom() {
  const d = db.settings && db.settings.uomDefault;
  if (d) return d;
  const first = uomList()[0];
  return first ? first.code : 'pz';
}
// Il valore corrente resta selezionabile anche se non è (più) in elenco: i dati
// storici non devono cambiare U.M. da soli.
function uomOptions(selected) {
  const sel = String(selected == null ? '' : selected).trim();
  const list = uomList().slice();
  if (sel && !list.some(u => u.code === sel)) list.unshift({ code: sel, name: '(non in elenco)' });
  if (!sel) list.unshift({ code: '', name: '—' });
  return list.map(u => `<option value="${esc(u.code)}" ${u.code === sel ? 'selected' : ''}>${esc(u.code)}${u.name ? ' — ' + esc(u.name) : ''}</option>`).join('');
}
// ─── Doppia unità di misura: si gestisce in metri, si compra a chilo ───
// Una barra si gestisce in metri — la distinta dice «2 m», il magazzino conta
// metri — ma il fornitore quota **a chilo**. Senza conversione il prezzo del
// listino finisce tale e quale nel costo dell'articolo, che risulta in €/kg
// mentre le quantità sono in metri: il totale della distinta è sbagliato di un
// fattore, in silenzio, e nessuno se ne accorge finché non arriva la fattura.
// È l'errore peggiore che questa app possa fare — il numero c'è, è plausibile,
// ed è falso.
//
// La divisione dei dati segue la natura di ciò che descrivono:
//   `altUom` + `altFactor` stanno sull'**articolo**, perché sono fisica e non
//   commercio: una barra pesa quel che pesa, uguale per tutti i fornitori.
//   Duplicare il fattore su ogni quotazione vorrebbe dire poterlo sbagliare in
//   un posto solo su cinque.
//   `priceUom` sta sulla **riga di listino**: quella sì è una scelta del
//   fornitore, e due fornitori possono quotare lo stesso articolo diversamente.
//
// Articoli senza `altUom` e righe senza `priceUom` si comportano esattamente
// come prima: fattore 1, nessuna conversione, nessuna migrazione.
function altUomOf(it) { return (it && it.altUom) ? String(it.altUom) : ''; }
function altFactorOf(it) {
  const f = Number(it && it.altFactor);
  return isFinite(f) && f > 0 ? f : 0;
}
// Un'unità alternativa serve solo se ha anche un fattore: senza, sarebbe
// un'etichetta che non converte niente e produrrebbe conti a caso.
function hasAltUom(it) { return !!altUomOf(it) && altFactorOf(it) > 0 && altUomOf(it) !== (it.uom || ''); }
// Quante `uom` stanno in 1 unità di gestione dell'articolo.
// Sconosciuta o uguale a quella di gestione → 1, cioè nessuna conversione.
function uomFactor(it, uom) {
  if (!uom || !hasAltUom(it) || uom === (it.uom || '')) return 1;
  return uom === altUomOf(it) ? altFactorOf(it) : 1;
}
// Gestione → altra unità (15 m → 120 kg). Nell'app non la chiama nessuno — la
// conversione che serve va sempre nell'altro verso, ed è fromAltUom — ma è metà
// del contratto e ha i suoi test: senza, la coppia sarebbe zoppa e chi arriva
// dovrebbe riscriverla per verificare che l'inversa torni.
// Gestione → altra unità (15 m → 120 kg)
function toAltUom(it, qty, uom) { return (Number(qty) || 0) * uomFactor(it, uom); }
// Altra unità → gestione (120 kg → 15 m). È la direzione che riporta a casa i
// ricevimenti: il fornitore consegna chili, il magazzino conta metri.
function fromAltUom(it, qty, uom) {
  const f = uomFactor(it, uom);
  return f > 0 ? (Number(qty) || 0) / f : (Number(qty) || 0);
}
// Le due unità di un articolo, per i menu a tendina. Una sola se non c'è la seconda.
function itemUomOptions(it, selected) {
  const uoms = [it.uom || ''];
  if (hasAltUom(it)) uoms.push(altUomOf(it));
  const sel = uoms.includes(selected) ? selected : uoms[0];
  return uoms.map(u => `<option value="${esc(u)}" ${u === sel ? 'selected' : ''}>${esc(u)}</option>`).join('');
}

// ── Concetti (parte "standardizzata" del nome di una Parte) ──
function conceptList() { return (db.settings && db.settings.concepts) || []; }
function conceptById(id) { return id ? conceptIndex().get(id) : undefined; }
function conceptName(id) { const c = conceptById(id); return c ? c.name : ''; }
function conceptOptions(selectedId) {
  const sel = selectedId || '';
  return `<option value="">—</option>` + conceptList()
    .map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
}
// Nome finale di una parte: concetto + descrizione libera
function composePartName(conceptId, free) {
  return (conceptName(conceptId) + ' ' + (free || '')).trim();
}
// Registra al volo un'U.M. incontrata nell'import massivo
function ensureUom(code) {
  const c = String(code || '').trim();
  if (!c) return '';
  if (!db.settings.uoms) db.settings.uoms = [];
  if (!db.settings.uoms.some(u => u.code === c)) db.settings.uoms.push({ code: c, name: '' });
  return c;
}

// ─── Famiglie / sottofamiglie (materie prime e componenti commerciali) ───
function getFamily(id) { return id ? familyIndex().get(id) : undefined; }
function familyName(id) { const f = getFamily(id); return f ? f.name : ''; }
function subFamilyName(famId, subId) { const f = getFamily(famId); const s = f && (f.subs || []).find(x => x.id === subId); return s ? s.name : ''; }
// Tipi articolo che usano famiglie/sottofamiglie e codifica per famiglia
function usesFamily(t) { return t === 'acquistato' || t === 'materiale' || t === 'parte'; }
function familyLabel(it) {
  if (!it || !usesFamily(it.type) || !it.familyId) return '—';
  const fn = familyName(it.familyId); const sn = subFamilyName(it.familyId, it.subFamilyId);
  return sn ? fn + ' › ' + sn : (fn || '—');
}
function familyOptions(selectedId, kind) {
  return `<option value="">—</option>` + (db.families || [])
    .filter(f => !kind || (f.kind || 'acquistato') === kind)
    .map(f => `<option value="${f.id}" ${f.id === selectedId ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
}
function subFamilyOptions(familyId, selectedSubId) {
  const f = getFamily(familyId);
  return `<option value="">—</option>` + ((f && f.subs) || [])
    .map(s => `<option value="${s.id}" ${s.id === selectedSubId ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}
// ─── Sigle famiglia/sottofamiglia + codifica automatica articoli ───
function familySigla(famId) { const f = getFamily(famId); return f ? (f.sigla || siglaFromName(f.name)) : ''; }
function subFamilySigla(famId, subId) {
  const f = getFamily(famId); const s = f && (f.subs || []).find(x => x.id === subId);
  return s ? (s.sigla || siglaFromName(s.name)) : '';
}
// ─── Unicità delle sigle ───
// La sigla compone il codice: CMM-MEC-CUS-007. Se due macrofamiglie commerciali
// portano entrambe MEC, da quel codice non si risale più a quale delle due
// appartenga — e un codice che non identifica la sua famiglia ha perso la
// ragione per cui è costruito così.
//
// Il campo di gara è quello che il codice non ha già fissato da sé: per una
// macrofamiglia è il suo ambito (il prefisso CMM/MAT/PRT separa già i tre), per
// una sottofamiglia è la macrofamiglia che la contiene (il segmento precedente
// l'ha già scelta). Fuori di lì la stessa sigla non crea ambiguità e si può
// ripetere: pretendere di più esaurirebbe presto le sigle di tre lettere.
function siglaKey(s) { return String(s || '').trim().toUpperCase(); }
// `exceptId` è chi sta salvando: senza, modificare una famiglia senza toccarne
// la sigla la farebbe collidere con sé stessa. Stessa forma di validateItemCode.
function validateFamilySigla(sigla, kind, exceptId, dedotta) {
  const k = siglaKey(sigla); if (!k) return null;
  const amb = kind || 'acquistato';
  const altra = (db.families || []).find(f => f.id !== exceptId
    && (f.kind || 'acquistato') === amb
    && siglaKey(f.sigla || siglaFromName(f.name)) === k);
  if (!altra) return null;
  return siglaInUso(k, 'la macrofamiglia', altra.name, dedotta);
}
function validateSubFamilySigla(sigla, familyId, exceptSubId, dedotta) {
  const k = siglaKey(sigla); if (!k) return null;
  const f = getFamily(familyId); if (!f) return null;
  const altra = (f.subs || []).find(s => s.id !== exceptSubId
    && siglaKey(s.sigla || siglaFromName(s.name)) === k);
  if (!altra) return null;
  return siglaInUso(k, 'la sottofamiglia', altra.name, dedotta);
}
// Chi lascia vuoto il campo sigla non ha scritto MEC da nessuna parte: senza
// dire che è dedotta dal nome, l'errore sembrerebbe arrivare dal nulla.
function siglaInUso(k, cosa, nome, dedotta) {
  return dedotta
    ? `Sigla "${k}", dedotta dal nome, già usata da "${nome}": indicane una diversa`
    : `Sigla "${k}" già usata da ${cosa} "${nome}"`;
}
// Le sigle ripetute che erano già in archivio. Da questa versione non se ne
// possono più introdurre, ma quelle che c'erano restano e non bloccano il
// lavoro: si mostrano in Gestione perché qualcuno decida quale cambiare —
// rifarle da soli cambierebbe di nascosto il prefisso dei codici futuri.
// Stessa scelta, e stessa forma, di duplicateCodeGroups().
function duplicateSiglaGroups(kind) {
  const out = [];
  // `extra` porta l'ambito o la famiglia del gruppo: sono le due chiavi con cui
  // chi disegna ritrova la riga da segnare in rosso. Il nome da solo non basta,
  // due famiglie di ambiti diversi possono chiamarsi uguale.
  const raggruppa = (voci, dove, extra) => {
    const per = new Map();
    voci.forEach(v => {
      const k = siglaKey(v.sigla || siglaFromName(v.name)); if (!k) return;
      let l = per.get(k); if (!l) { l = []; per.set(k, l); }
      l.push(v.name || '(senza nome)');
    });
    per.forEach((nomi, sigla) => {
      if (nomi.length > 1) out.push(Object.assign({ sigla, dove, nomi }, extra));
    });
  };
  const fam = (db.families || []).filter(f => !kind || (f.kind || 'acquistato') === kind);
  // Le macrofamiglie si confrontano dentro il proprio ambito e non fra ambiti:
  // Meccanico commerciale e Meccanica generale a materie prime portano
  // entrambe MEC senza che nessun codice diventi ambiguo — CMM-MEC e MAT-MEC
  // sono già distinti dal prefisso. Raggrupparle tutte insieme segnalerebbe
  // come problema proprio il caso che la regola ammette.
  const perAmbito = new Map();
  fam.forEach(f => {
    const a = f.kind || 'acquistato';
    let l = perAmbito.get(a); if (!l) { l = []; perAmbito.set(a, l); }
    l.push(f);
  });
  perAmbito.forEach((lista, ambito) => raggruppa(lista, 'macrofamiglie', { kind: ambito }));
  fam.forEach(f => raggruppa(f.subs || [], f.name, { kind: f.kind || 'acquistato', familyId: f.id }));
  return out.sort((a, b) => a.dove.localeCompare(b.dove) || a.sigla.localeCompare(b.sigla));
}
function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// Numero di cifre della parte incrementale (configurabile in Impostazioni)
function codeDigits() {
  const n = parseInt(db.settings && db.settings.codeDigits, 10);
  return (n >= 1 && n <= 10) ? n : 3;
}
// Prossimo codice libero per un prefisso, es. 'MAT-ACC-LAM-' → 'MAT-ACC-LAM-003'
// Il massimo progressivo già assegnato, per ogni prefisso, in una passata sola.
//
// Prima si compilava una regex e la si provava su **ogni** articolo, a ogni
// chiamata. Durante un import è una chiamata per riga nuova: cinquemila righe
// contro cinquemila articoli fanno venticinque milioni di confronti, ed è lo
// stesso costo quadratico che codeIndex() toglie alla *ricerca* e che era
// rimasto intatto sulla *generazione*. Qui la passata è una e vale per tutti i
// prefissi insieme.
let _prefixIdx = null, _prefixIdxArr = null, _prefixIdxLen = -1;
function prefixIndex() {
  const arr = db.items || [];
  if (_prefixIdx && arr === _prefixIdxArr && arr.length === _prefixIdxLen) return _prefixIdx;
  const m = new Map();
  arr.forEach(it => {
    // La coda di cifre e ciò che le sta davanti: «MAT-ACC-001» → «MAT-ACC-» + 1.
    // La chiave è quella dei doppioni, itemCodeKey(): senza spazi ai bordi e in
    // minuscolo (dalla 0.105.6). Era il testo grezzo, e un «mat-acc-002»
    // importato da Excel non contava per MAT-ACC-: la generazione proponeva
    // MAT-ACC-002, e il controllo dei doppioni — che le maiuscole le ignora —
    // lo rifiutava come già usato. Ogni volta, per tutta la famiglia.
    const t = String(it.code || '').trim().match(/^(.*?)(\d+)$/);
    if (!t) return;
    const n = parseInt(t[2], 10);
    const k = itemCodeKey(t[1]);
    const era = m.get(k);
    if (era === undefined || n > era) m.set(k, n);
  });
  _prefixIdx = m; _prefixIdxArr = arr; _prefixIdxLen = arr.length;
  return m;
}
function nextCodeForPrefix(prefix) {
  let n = (prefixIndex().get(itemCodeKey(prefix)) || 0) + 1;
  while (codicePresoAltrove(prefix + String(n).padStart(codeDigits(), '0'))) n++;
  return prefix + String(n).padStart(codeDigits(), '0');
}
// I codici che l'archivio condiviso ha detto già presi da un collega, anche se
// il suo articolo qui non è ancora arrivato (cloud.js, _codiciAltrui): la
// generazione automatica li salta come salta quelli che vede.
function codicePresoAltrove(code) {
  return typeof _codiciAltrui !== 'undefined' && _codiciAltrui.has(itemCodeKey(code));
}
// Le code numeriche dei codici presi altrove con quel prefisso.
function numeriPresiAltrove(prefisso) {
  if (typeof _codiciAltrui === 'undefined' || !_codiciAltrui.size) return [];
  const p = itemCodeKey(prefisso), out = [];
  _codiciAltrui.forEach(k => { if (k.startsWith(p) && /^\d+$/.test(k.slice(p.length))) out.push(parseInt(k.slice(p.length), 10)); });
  return out;
}
// ─── Numeri dei documenti ───
// Progressivo per anno: <SIGLA>-<anno>-NNN, una serie per tipo di documento.
// Con l'archivio condiviso il numero lo dà il server (conNumeri in cloud.js
// lo riserva prima di creare il documento e lo lascia in _numeriRiservati);
// in locale, o se una serie non ne ha di riservati, si continua dal più alto
// che c'è qui.
const SERIE_DOCUMENTI = {
  RFQ: () => db.rfqs || [], ODA: () => db.orders || [], ODL: () => db.workOrders || [],
  ODP: () => db.prodOrders || [], FAB: () => db.plans || [], COM: () => db.jobs || [],
  MT: () => (db.revisions || []).map(r => ({ id: r.id, number: r.ecoNumber })),   // le modifiche tecniche
};
const SERIE_COLLEZIONE = { RFQ: 'rfqs', ODA: 'orders', ODL: 'workOrders', ODP: 'prodOrders', FAB: 'plans', COM: 'jobs', MT: 'revisions' };
function seriePrefisso(sigla) { return `${sigla}-${new Date().getFullYear()}-`; }
function serieMassimo(prefisso, lista) {
  return (lista || []).reduce((m, d) => {
    const n = (d.number || '').startsWith(prefisso) ? (parseInt(d.number.slice(prefisso.length), 10) || 0) : 0;
    return n > m ? n : m;
  }, 0);
}
// ─── Doppioni e buchi nelle serie (dalla 0.105.6) ───
// Per i codici articolo c'è il Controllo dati; per i numeri dei documenti non
// c'era niente, e un ODA-2026-008 doppio (un ripristino, due PC che numeravano
// da soli prima dell'archivio condiviso) o un COM-2026-002 mancante (una
// prenotazione scaduta) li scopriva il fornitore o il revisore dei conti.
// Per ogni serie e per ciascuno degli anni chiesti: i numeri usati più volte,
// con i loro documenti, e quelli che mancano sotto il più alto.
function controlloSerieDocumenti(anni) {
  const out = [];
  Object.keys(SERIE_DOCUMENTI).forEach(sigla => {
    const docs = SERIE_DOCUMENTI[sigla]();
    (anni || []).forEach(anno => {
      const prefisso = `${sigla}-${anno}-`;
      const perNumero = new Map();
      docs.forEach(d => {
        const num = String((d && d.number) || '').trim();
        if (!num.startsWith(prefisso)) return;
        const coda = num.slice(prefisso.length);
        if (!/^\d+$/.test(coda)) return;
        const n = parseInt(coda, 10);
        if (!perNumero.has(n)) perNumero.set(n, []);
        perNumero.get(n).push(d);
      });
      if (!perNumero.size) return;
      const massimo = Math.max(...perNumero.keys());
      const doppi = [], buchi = [];
      perNumero.forEach((ds, n) => { if (ds.length > 1) doppi.push({ n, numero: prefisso + String(n).padStart(3, '0'), docs: ds }); });
      for (let n = 1; n < massimo; n++) if (!perNumero.has(n)) buchi.push(n);
      doppi.sort((a, b) => a.n - b.n);
      if (doppi.length || buchi.length) out.push({ sigla, prefisso, doppi, buchi, massimo });
    });
  });
  return out;
}
function numeroProgressivo(sigla) {
  const prefisso = seriePrefisso(sigla);
  const riservati = typeof _numeriRiservati !== 'undefined' ? _numeriRiservati[prefisso] : null;
  const n = riservati && riservati.length ? riservati.shift() : serieMassimo(prefisso, SERIE_DOCUMENTI[sigla]()) + 1;
  return prefisso + String(n).padStart(3, '0');
}
// ─── Niente buchi: si elimina solo l'ultimo della serie ───
// Un documento o un codice in mezzo alla serie, eliminato, lascerebbe un buco
// nella numerazione. Si elimina solo l'ultimo, il cui numero torna al
// prossimo; gli altri si annullano, si chiudono o si segnano obsoleti.
function serieDiNumero(s) {
  const m = /^(.*?)(\d+)$/.exec(String(s == null ? '' : s).trim());
  return m ? { prefisso: m[1].toLowerCase(), n: parseInt(m[2], 10) } : null;
}
function documentoUltimo(doc, lista) {
  const x = serieDiNumero(doc && doc.number);
  if (!x) return true;
  return !(lista || []).some(d => {
    if (d === doc || d.id === doc.id) return false;
    const s = serieDiNumero(d.number);
    return s && s.prefisso === x.prefisso && s.n > x.n;
  });
}
function guardiaDocumentoUltimo(doc, lista, invece) {
  if (documentoUltimo(doc, lista)) return true;
  showToast(`${doc.number} non è l'ultimo della serie: eliminandolo resterebbe un buco nella numerazione. ${invece}`, 'error');
  return false;
}
// I sottogruppi contano a scendere (da 999), tutti gli altri a salire: l'ultimo
// è quello più in là nella propria direzione. `via`: gli id che se ne vanno
// insieme a questo (un'eliminazione di più articoli).
// Vale per i codici **fatti come quelli della numerazione dell'app**, con il
// numero dopo un trattino (MAT-ACC-007, TRN-BAS-999, TRN-S01) (dalla 0.105.5):
// un codice scritto a mano che per caso finisce con un numero (VITE-M6X20,
// SKF 6205) non è in nessuna serie, e bloccava l'eliminazione degli altri.
function articoloUltimo(it, via) {
  const x = serieDiNumero(it && it.code);
  if (!x || !/-s?$/.test(x.prefisso)) return true;
  const giu = it.type === 'sottogruppo';
  return !(db.items || []).some(o => {
    if (o.id === it.id || (via && via.has(o.id)) || (o.type === 'sottogruppo') !== giu) return false;
    const s = serieDiNumero(o.code);
    return s && s.prefisso === x.prefisso && (giu ? s.n < x.n : s.n > x.n);
  });
}
// Con l'archivio condiviso «l'ultimo» di questo PC può non esserlo più: un
// collega può aver appena creato il successivo, non ancora arrivato. Prima di
// eliminare si manda e si riceve, e la guardia si ripete sull'archivio
// aggiornato (dalla 0.105.5). Senza archivio condiviso `fn` parte subito.
function eliminaSeAncoraUltimo(guardia, fn) {
  const vai = () => { if (guardia()) fn(); };
  return typeof conArchivioAggiornato === 'function' ? conArchivioAggiornato(vai) : vai();
}
const ARTICOLO_NON_ULTIMO = c => `Il codice ${c} non è l'ultimo della sua serie: eliminandolo resterebbe un buco nella codifica. Segnalo come obsoleto invece di eliminarlo.`;
// Codice per famiglia: materie prime, commerciali e parti non legate a una macchina
function genFamilyCode(type, familyId, subFamilyId) {
  let base = '';
  if (type === 'materiale') base = (db.settings.codePrefixMateriale || 'MAT') + '-';
  else if (type === 'acquistato') base = (db.settings.codePrefixAcquistato || 'CMM') + '-';
  else if (type === 'parte') base = (db.settings.codePrefixParte || 'PRT') + '-';
  if (!base) return '';
  let prefix = base;
  if (familyId) {
    prefix += familySigla(familyId) + '-';
    if (subFamilyId) prefix += subFamilySigla(familyId, subFamilyId) + '-';
  }
  return nextCodeForPrefix(prefix);
}

// ─── Codifica gerarchica macchina › gruppo › sottogruppo/parte ───
// Es. TRN-S00 (macchina), TRN-BAS-S00 (gruppo), TRN-BAS-999 (sottogruppo, a scendere),
// TRN-BAS-001 (parte, a salire). Lo schema (lunghezza sigle, cifre) è per macchina.
const CODE_TYPES = { alpha: 'Alfabetico', num: 'Numerico', alnum: 'Alfanumerico' };
// Default retrocompatibili: le macchine create prima non hanno schema
function machineScheme(m) {
  return {
    gLen: (m && m.gCodeLen) || 3, gType: (m && m.gCodeType) || 'alpha',
    incrS: (m && m.incrDigitsS) || 2,   // progressivo S## (macchina/gruppo)
    incrN: (m && m.incrDigitsN) || 3,   // numerico ### (sottogruppo/parte)
  };
}
function codeTypePattern(type) {
  if (type === 'num') return /^[0-9]+$/;
  if (type === 'alnum') return /^[A-Z0-9]+$/;
  return /^[A-Z]+$/;
}
function validateCodeFormat(code, len, type) {
  if (code.length !== len) return `La sigla deve essere esattamente ${len} caratteri`;
  if (!codeTypePattern(type).test(code)) {
    const t = type === 'num' ? 'numerici (0-9)' : type === 'alnum' ? 'alfanumerici (A-Z, 0-9)' : 'alfabetici (A-Z)';
    return `La sigla deve contenere solo caratteri ${t}`;
  }
  return null;
}
function typeHint(len, type) { return `${len} car., ${(CODE_TYPES[type] || '').toLowerCase()}`; }
function typeOptionsHtml(sel) {
  return Object.keys(CODE_TYPES).map(v => `<option value="${v}" ${v === sel ? 'selected' : ''}>${CODE_TYPES[v]}</option>`).join('');
}
function machineItems() { return (db.items || []).filter(i => i.type === 'macchina'); }
function groupItemsFor(machineId) { return (db.items || []).filter(i => i.type === 'gruppo' && i.machineItemId === machineId); }
function itemSigla(id) { const it = getItem(id); return it ? (it.sigla || '') : ''; }
// Numeri già usati dai codici degli articoli passati (parte finale numerica del codice)
function usedCodeNumbers(items) {
  return items
    .map(i => { const m = String(i.code || '').match(/(\d+)$/); return m ? parseInt(m[1], 10) : null; })
    .filter(n => n != null);
}
// Prossimo progressivo: sottogruppi a scendere da 10^incrN-1, gli altri a salire.
// Restituisce null quando la numerazione è esaurita.
//
// `altri` sono gli articoli che condividono lo stesso prefisso ma non il tipo.
// Sottogruppi e parti vivono entrambi in MAC-GRP-###, uno scendendo da 999 e
// l'altro salendo da 1: filtrando per tipo non si vedevano, e quando i due
// blocchi si incontravano l'app generava un codice già preso — per poi
// rifiutarlo da sé con «codice già in uso», sullo stesso codice a ogni
// tentativo. Un vicolo cieco da cui si usciva solo scrivendolo a mano.
function nextCodeNumber(type, siblings, sm, altri, prefisso) {
  const used = usedCodeNumbers(siblings);
  const presi = new Set(usedCodeNumbers((siblings || []).concat(altri || [])).concat(prefisso ? numeriPresiAltrove(prefisso) : []));
  const max = 10 ** sm.incrN - 1;
  // Si continua nella direzione del proprio blocco finché non si trova un
  // numero che nessuno dei due sta usando.
  const libero = (n, passo, limite) => {
    while (presi.has(n)) n += passo;
    return (passo < 0 ? n < limite : n > limite) ? null : n;
  };
  if (type === 'sottogruppo') {
    const n = used.length ? Math.min(...used) - 1 : max;
    return n < 0 ? null : libero(n, -1, 0);
  }
  if (type === 'parte') {
    const n = used.length ? Math.max(...used) + 1 : 1;
    return n > max ? null : libero(n, 1, max);
  }
  // macchina e gruppo: progressivo S## a salire da 0
  const n = used.length ? Math.max(...used) + 1 : 0;
  return libero(n, 1, 10 ** sm.incrS - 1);
}
// ─── Perché il codice non è stato generato ───
// genItemCode() è logica di dominio e non deve parlare all'interfaccia: durante
// un import viene chiamata una volta per riga, e sparava un toast per ognuna —
// decine di riquadri sovrapposti su un file che invece ha un report suo, fatto
// apposta per raccontare riga per riga cos'è successo.
//
// Dice qui perché non ce l'ha fatta, e chi ha davanti una persona lo mostra
// (genItemCodeUI), chi sta leggendo un file lo scrive nel report.
let codeGenError = '';
function codeFallito(msg) { codeGenError = msg; return ''; }
// La versione per le schede: genera e, se non ci riesce, lo dice.
function genItemCodeUI(it) {
  const c = genItemCode(it);
  if (!c && codeGenError) showToast(codeGenError, 'error');
  return c;
}
// Codice automatico dell'articolo (bozza o esistente). '' quando non è generabile.
function genItemCode(it) {
  codeGenError = '';
  if (!it) return '';
  const type = it.type;
  if (type === 'materiale' || type === 'acquistato') return genFamilyCode(type, it.familyId, it.subFamilyId);

  if (type === 'macchina') {
    if (!it.sigla) return '';
    const sm = machineScheme(it);
    // Progressivo tra le macchine che condividono la stessa sigla (esclusa se stessa in modifica)
    const siblings = machineItems().filter(m => m.sigla === it.sigla && m.id !== it.id);
    const n = nextCodeNumber('macchina', siblings, sm, null, `${it.sigla}-S`);
    if (n == null) return codeFallito('Numerazione macchine esaurita');
    return `${it.sigla}-S${String(n).padStart(sm.incrS, '0')}`;
  }

  const mac = getItem(it.machineItemId);
  if (type === 'gruppo') {
    if (!mac || !it.sigla) return '';
    const sm = machineScheme(mac);
    const siblings = groupItemsFor(mac.id).filter(g => g.sigla === it.sigla && g.id !== it.id);
    const n = nextCodeNumber('gruppo', siblings, sm, null, `${mac.sigla}-${it.sigla}-S`);
    if (n == null) return codeFallito('Numerazione gruppi esaurita');
    return `${mac.sigla}-${it.sigla}-S${String(n).padStart(sm.incrS, '0')}`;
  }

  if (type === 'sottogruppo' || type === 'parte') {
    const grp = getItem(it.groupItemId);
    // La parte senza macchina/gruppo mantiene la codifica per famiglia
    if (!mac || !grp) return type === 'parte' ? genFamilyCode(type, it.familyId, it.subFamilyId) : '';
    const sm = machineScheme(mac);
    // Lo stesso **prefisso**, non lo stesso gruppo (dalla 0.105.5): due gruppi
    // con la stessa sigla (TRN-BAS-S00, TRN-BAS-S01) scrivono i codici delle
    // loro parti nello stesso TRN-BAS-###, e contando per gruppo il secondo
    // ripartiva da 001, già preso.
    const stessoGruppo = i => i.machineItemId === mac.id && i.id !== it.id
      && (i.groupItemId === grp.id || itemSigla(i.groupItemId) === grp.sigla);
    const siblings = (db.items || []).filter(i => i.type === type && stessoGruppo(i));
    // L'altro blocco che abita lo stesso prefisso: le parti per un sottogruppo,
    // i sottogruppi per una parte. Vedi il commento su nextCodeNumber.
    const altroTipo = type === 'parte' ? 'sottogruppo' : 'parte';
    const altri = (db.items || []).filter(i => i.type === altroTipo && stessoGruppo(i));
    const n = nextCodeNumber(type, siblings, sm, altri, `${mac.sigla}-${grp.sigla}-`);
    if (n == null) return codeFallito(`Numerazione ${type === 'parte' ? 'parti' : 'sottogruppi'} esaurita`);
    return `${mac.sigla}-${grp.sigla}-${String(n).padStart(sm.incrN, '0')}`;
  }
  return '';
}
// Etichetta di appartenenza per il catalogo: "TRN › BAS"
function codingLabel(it) {
  if (!it) return '';
  if (it.type === 'macchina') return it.sigla || '';
  const ms = itemSigla(it.machineItemId);
  if (!ms) return '';
  const gs = it.type === 'gruppo' ? it.sigla : itemSigla(it.groupItemId);
  return gs ? ms + ' › ' + gs : ms;
}

// ─── Avvisi che restano (dalla 0.105.6) ───
// Il toast dura due secondi e mezzo: va bene per «salvato», non per una cosa
// che resta vera finché qualcuno non la sistema — una distinta ad anello
// arrivata da un collega, una versione nuova dell'app che aspetta di essere
// caricata. Questi stanno in basso, in una striscia che non copre il lavoro,
// finché la causa non sparisce o chi legge non li chiude.
// `chiave` identifica l'avviso (uno per chiave: ridarlo lo aggiorna); `html` è
// già pronto, e chi chiama ne fa l'escape. La chiave finisce in un onclick:
// va scelta fra le costanti del codice, mai da un dato.
const _avvisiFissi = new Map();
function avvisoFisso(chiave, html) {
  _avvisiFissi.set(chiave, html);
  disegnaAvvisiFissi();
}
function avvisoFissoTogli(chiave) {
  if (!_avvisiFissi.delete(chiave)) return;
  disegnaAvvisiFissi();
}
function disegnaAvvisiFissi() {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('avvisi-fissi');
  if (!el) {
    el = document.createElement('div');
    el.id = 'avvisi-fissi';
    if (document.body) document.body.appendChild(el);
  }
  // `polite`: sono notizie, non errori che interrompono quello che si sta facendo.
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = Array.from(_avvisiFissi, ([k, h]) => `<div class="avviso-fisso" data-avviso="${esc(k)}">
    <span class="avviso-fisso-testo">${h}</span>
    <button class="avviso-fisso-chiudi" onclick="avvisoFissoTogli('${esc(k)}')" title="Chiudi l'avviso" aria-label="Chiudi l'avviso">×</button></div>`).join('');
}

// `azione` opzionale: { label, fn }. È l'annulla subito dopo un'eliminazione —
// l'unico momento in cui serve davvero, perché è l'unico in cui l'utente sa
// ancora cosa ha appena fatto. Andare a cercarlo nel cestino cinque minuti dopo
// è un'altra cosa, e infatti il cestino c'è lo stesso.
let _toastAzione = null, _toastTimer = null;
const TOAST_MS = 2500, TOAST_AZIONE_MS = 7000;   // con un pulsante serve il tempo di leggerlo e cliccarlo
function showToast(m, t = 'success', azione) {
  const el = document.getElementById('toast');
  if (!el) return;
  _toastAzione = (azione && typeof azione.fn === 'function') ? azione.fn : null;
  el.innerHTML = esc(m) + (_toastAzione
    ? ` <button class="toast-action" onclick="toastAzione()">${esc(azione.label || 'Annulla')}</button>` : '');
  // I solidi, non i colori da leggere: sopra ci va il bianco (vedi style.css)
  el.style.background = t === 'error' ? 'var(--red-solid)' : 'var(--green-solid)';
  // Un errore interrompe, una conferma aspetta il proprio turno: sono le due
  // urgenze che una live region sa distinguere, ed è la differenza fra sapere
  // subito che il salvataggio è stato rifiutato e scoprirlo dopo.
  el.setAttribute('aria-live', t === 'error' ? 'assertive' : 'polite');
  el.setAttribute('role', t === 'error' ? 'alert' : 'status');
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.classList.remove('show'); _toastAzione = null; }, _toastAzione ? TOAST_AZIONE_MS : TOAST_MS);
}
function toastAzione() {
  const fn = _toastAzione; _toastAzione = null;
  const el = document.getElementById('toast'); if (el) el.classList.remove('show');
  if (fn) fn();
}
// Elimina e offre di rimettere a posto. Da usare al posto di showToast dopo
// ogni Store.remove: il record è nel cestino comunque, questo è solo il modo
// più rapido di riaverlo.
function toastEliminato(msg, onUndo) {
  showToast(msg, 'success', { label: '↶ Annulla', fn: onUndo });
}
// Elimina, ridisegna, avvisa e offre di rimettere a posto: il gesto completo in
// una riga sola, così nessun punto di eliminazione se lo dimentica per strada.
// `dopo` è il ridisegno della vista, e viene richiamato anche al ripristino.
function removeConUndo(coll, id, msg, dopo) {
  if (!Store.remove(coll, id)) return false;
  const voce = Store.lastRemoved();
  if (typeof dopo === 'function') dopo();
  toastEliminato(msg, () => {
    if (!Store.restore(voce)) { showToast(Store.rifiutoRipristino() || 'Non c\'è più niente da ripristinare', 'error'); return; }
    if (typeof dopo === 'function') dopo();
    showToast('Ripristinato');
  });
  return true;
}
// ─── Esito del salvataggio locale ───
// Hook chiamati da Store.commit(). Quando localStorage rifiuta la scrittura
// l'app continua a mostrare i dati aggiornati, ma non li conserva: chiudere la
// scheda in quello stato perde tutto il lavoro fatto dall'errore in poi.
let persistErrorShown = false;   // il messaggio si mostra una volta, poi resta il badge
function onPersistError(kind, info) {
  renderUnsavedBadge();
  if (persistErrorShown) return;
  persistErrorShown = true;
  // Differito: chi ha appena salvato chiama closeModal() subito dopo, e
  // chiuderebbe questa finestra prima che si riesca a leggerla.
  setTimeout(() => showPersistErrorModal(kind, info), 0);
}
function onPersistRecovered() {
  persistErrorShown = false;
  renderUnsavedBadge();
  showToast('Salvataggio ripristinato');
}
function showPersistErrorModal(kind, info) {
  const mb = info && info.bytes ? ` (il database occupa ${(info.bytes / 1024 / 1024).toFixed(1)} MB)` : '';
  const testo = kind === 'quota'
    ? `<p>Lo spazio che il browser riserva a questa app è esaurito${mb}.</p>
       <p><strong>Le modifiche fatte da ora in poi non vengono salvate.</strong> I dati che vedi sono ancora tutti in memoria, ma chiudendo questa scheda andrebbero persi.</p>
       <p>Esporta subito un backup JSON, poi libera spazio: elimina richieste e ordini vecchi, oppure azzera il database e reimporta solo ciò che serve.</p>`
    : kind === 'rescue'
      ? `<p>L'archivio di questo computer non si è potuto leggere, e non è stato possibile metterne da parte una copia.</p>
         <p><strong>Per non scriverci sopra, l'app non salva niente</strong> finché non lo scarichi come file. Poi potrai lavorare, o reimportare l'ultimo backup.</p>
         ${Store.grezzoIlleggibile() ? `<p><button class="add-btn-sm" onclick="closeModal(); scaricaIlleggibile()">${ico('download', 'tinted', '')} Scarica i dati illeggibili</button></p>` : ''}`
    : kind === 'storage'
      ? `<p>Questo browser non consente il salvataggio locale: succede in navigazione privata o quando i dati dei siti sono bloccati.</p>
         <p><strong>L'app funziona, ma alla chiusura non resterà nulla.</strong> Esporta un backup JSON prima di uscire.</p>`
      : `<p>I dati in memoria non sono salvabili: c'è un valore che non si riesce a convertire in JSON.</p>
         <p><strong>Le modifiche non vengono salvate.</strong> Esporta un backup e segnala il problema.</p>`;
  // Il backup contiene gli utenti: il pulsante compare solo a chi può esportarlo.
  const btnBackup = canWrite('manage')
    ? `<button class="add-btn-sm" onclick="closeModal(); exportBackup()">${ico('download', 'tinted', '')} Esporta backup JSON ora</button>` : '';
  // Chiave propria: l'avviso si affianca a quello che è aperto invece di
  // buttar via un form a metà compilazione.
  openModal(`<h3>${ico('warning', 'tinted pill', '')} Salvataggio non riuscito</h3>${testo}
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Ho capito</button>${btnBackup}</div>`, false, 'avviso');
}
// ─── Un'altra scheda ha modificato l'archivio ───
// Terzo della famiglia, dopo onPersistError (non si è riusciti a scrivere) e
// onLoadError (non si è riusciti a leggere): qui si **sarebbe** riusciti a
// scrivere, ed è proprio per questo che ci si ferma. Sotto c'è il lavoro di
// qualcun altro, e sovrascriverlo non darebbe nessun errore a nessuno dei due.
//
// Non si offre una fusione, perché non esiste: per fondere due fotografie del
// database bisognerebbe sapere, riga per riga, quale delle due versioni è
// quella buona, e quella risposta non ce l'ha né l'app né chi la usa. Si
// offrono le due scelte che si possono davvero fare — ricaricare (si perde
// quello che si stava facendo qui) o tenere la propria versione (si perde
// quello che ha fatto l'altra scheda) — dicendo per ciascuna che cosa costa.
let conflittoMostrato = false;
function onExternalChange() {
  renderUnsavedBadge();
  if (conflittoMostrato) return;
  conflittoMostrato = true;
  setTimeout(showExternalChangeModal, 0);
}
function showExternalChangeModal() {
  const btnBackup = canWrite('manage')
    ? `<button class="btn-outline" onclick="exportBackup()">${ico('download', 'tinted', '')} Esporta backup</button>` : '';
  openModal(`<h3>${ico('warning', 'tinted pill', '')} Modificato in un'altra scheda</h3>
    <p>Questi dati sono stati modificati altrove — un'altra scheda o un'altra finestra con Bomtrack aperto — dopo che questa scheda li ha caricati.</p>
    <p><strong>L'ultima modifica non è stata salvata</strong>, di proposito: salvarla adesso cancellerebbe tutto il lavoro fatto nell'altra scheda, senza lasciarne traccia.</p>
    <p>Prima di decidere conviene esportare un backup: qualunque strada si prenda, una delle due versioni resta indietro.</p>
    <div class="modal-actions">
      ${btnBackup}
      <button class="btn-outline" onclick="forzaSalvataggio()">Tieni questa versione</button>
      <button class="add-btn-sm" onclick="location.reload()">Ricarica dall'archivio</button>
    </div>`, false, 'avviso');
}
// «Tieni questa versione»: si riscrive sopra, consapevolmente. Il conflitto si
// considera chiuso, così il prossimo avviso riguarderà una modifica nuova.
function forzaSalvataggio() {
  Store.forzaProssimaScrittura();
  const ok = Store.commit();
  conflittoMostrato = false;
  closeModal();
  if (ok) savedToast('Versione di questa scheda salvata');
}
// ─── Archivio locale illeggibile all'avvio ───
// Gemello di onPersistError, dall'altro capo: là non si è riusciti a scrivere,
// qui non si è riusciti a leggere. È la situazione più spaventosa che l'app
// possa presentare — si apre e il lavoro di mesi non c'è — e merita di essere
// spiegata per intero, a partire dal fatto che i dati sono quasi sempre ancora
// recuperabili.
function onLoadError(info) {
  if (typeof document === 'undefined' || !document.getElementById('modal-root')) return;
  // Differito come per i salvataggi: init() sta ancora montando la schermata di
  // accesso, e un pannello aperto adesso finirebbe sotto.
  setTimeout(() => showLoadErrorModal(info), 0);
}
function showLoadErrorModal(info) {
  const kb = info && info.bytes ? ` (erano circa ${Math.round(info.bytes / 1024)} KB)` : '';
  // Tre casi (dalla 0.105.6): copia fatta, copia che c'era già, copia non
  // riuscita. Nel terzo l'originale esiste solo al suo posto, e l'app non
  // salva niente finché non lo si scarica: va detto, non rassicurato.
  const dove = info && info.rescueFailed
    ? `<strong style="color:var(--red)">Non è stato possibile metterne da parte una copia</strong> (lo spazio del browser non basta). Esistono solo al loro posto: <strong>scaricali adesso come file</strong>. Finché non lo fai, l'app non salva nessuna modifica, per non scriverci sopra.`
    : info && info.rescued
    ? (Store.archivio === 'indexeddb'
      ? `Sono stati messi da parte così com'erano, alla voce <span style="font-family:var(--mono)">illeggibile</span> del database <span style="font-family:var(--mono)">${esc(IDB_NOME)}</span> del browser, e restano recuperabili a mano.`
      : `Sono stati messi da parte così com'erano, sotto la voce <span style="font-family:var(--mono)">${esc(DB_KEY_RESCUE)}</span> dell'archivio locale del browser, e restano recuperabili a mano.`)
    : 'Una copia di scorta era già stata messa da parte in precedenza, e non è stata toccata.';
  // Il file si offre sempre: è la copia più facile da portare a chi deve recuperarla.
  const btnScarica = info && info.kind === 'parse' && Store.grezzoIlleggibile()
    ? `<button class="${info.rescueFailed ? 'add-btn-sm' : 'btn-outline'}" onclick="scaricaIlleggibile()">${ico('download', 'tinted', '')} Scarica i dati illeggibili</button>` : '';
  const testo = info && info.kind === 'parse'
    ? `<p>I dati salvati su questo computer non si riescono più a leggere${kb}: il contenuto risulta interrotto o alterato.</p>
       <p><strong>Non sono stati cancellati.</strong> ${dove}</p>
       <p>Quello che vedi adesso è un database di esempio, e <strong>non è ancora stato salvato</strong>: finché non modifichi qualcosa, l'originale resta dov'è. Prima di lavorare, reimporta l'ultimo backup JSON — o fai vedere questa schermata a chi segue l'app.</p>`
    : Store.archivio === 'irraggiungibile'
    ? `<p>L'archivio sta nel database del browser (IndexedDB), e questa volta il browser non l'ha aperto. <strong>I dati non sono persi.</strong></p>
       <p>Chiudi le altre schede o finestre con Bomtrack e ricarica la pagina. Finché l'archivio non torna raggiungibile, l'app non salva niente: quello che vedi è un database di esempio.</p>`
    : `<p>Il browser non consente di leggere l'archivio locale: succede in navigazione privata, o quando i dati dei siti sono bloccati.</p>
       <p>Quello che vedi è un database di esempio. <strong>Non lavorarci sopra</strong>: alla chiusura non resterebbe nulla.</p>`;
  // Chiave propria, come per l'avviso di salvataggio: si affianca a ciò che è
  // aperto invece di buttar via un form a metà.
  openModal(`<h3>${ico('warning', 'tinted pill', '')} Dati non caricati</h3>${testo}
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Ho capito</button>${btnScarica}</div>`, false, 'avviso');
}
// ─── Una versione nuova dell'app (dalla 0.105.6) ───
// sw.js, alla versione nuova, si installa e prende il controllo delle schede
// aperte (skipWaiting + clients.claim). Ma una scheda già aperta continua a
// girare con il codice che ha caricato: in officina il PC resta acceso per
// settimane, e la versione nuova arrivava solo al primo F5 di qualcuno. Il
// cambio di controllore è il segnale: lo si dice con un avviso che resta, e il
// ricaricamento lo sceglie chi lavora — a metà di un ordine non si ricarica
// niente da soli.
// Il primo controllore di una pagina appena installata non è una versione
// nuova: per questo si guarda se ce n'era già uno all'apertura.
function swAscoltaVersioni(sw) {
  if (!sw || typeof sw.addEventListener !== 'function') return;
  let precedente = !!sw.controller;
  sw.addEventListener('controllerchange', () => {
    if (!precedente) { precedente = true; return; }
    avvisoFisso('versione', `<strong>È disponibile una versione nuova</strong> di Bomtrack.
      <button class="avviso-fisso-azione" onclick="swRicarica()">Ricarica</button>`);
  });
}
// Il browser cerca un sw.js nuovo solo a una navigazione, o al massimo una
// volta al giorno: una scheda che resta aperta lo chiede ogni ora.
const SW_CONTROLLO_MS = 60 * 60 * 1000;
function swControllaOgni(reg) {
  if (!reg || typeof reg.update !== 'function' || typeof setInterval !== 'function') return;
  setInterval(() => { Promise.resolve().then(() => reg.update()).catch(() => { /* offline: si riprova al giro dopo */ }); }, SW_CONTROLLO_MS);
}
// Ricaricare con un documento a metà o un salvataggio in volo perderebbe
// lavoro: lo si chiede prima, con la stessa domanda dell'uscita.
function swRicarica() {
  if (lavoroInSospeso() && !confirm('Ci sono modifiche non ancora salvate: ricaricando andrebbero perse. Ricaricare lo stesso?')) return;
  location.reload();
}

// L'archivio illeggibile, così com'era, in un file (dalla 0.105.6). È anche ciò
// che sblocca i salvataggi quando la copia di soccorso non è riuscita: da qui
// in poi una copia esiste, nella cartella dei download.
function scaricaIlleggibile() {
  const grezzo = Store.grezzoIlleggibile();
  if (!grezzo) { showToast('Non c\'è nessun archivio illeggibile da scaricare', 'error'); return; }
  const url = URL.createObjectURL(new Blob([grezzo], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = `bomtrack_illeggibile_${oggiISO()}.json`;
  a.click(); URL.revokeObjectURL(url);
  const eraBloccato = Store.senzaCopia();
  Store.scaricatoIlleggibile();
  showToast(eraBloccato ? 'File scaricato: da ora le modifiche si salvano' : 'File scaricato');
}
// ─── C'è del lavoro che una chiusura porterebbe via? ───
// Due sorgenti distinte, e basta una delle due:
//   - il salvataggio è fallito (quota esaurita, archivio negato): ciò che si
//     vede a schermo non è mai arrivato su disco;
//   - un documento è aperto a metà compilazione. I tre flag esistono già, li
//     alzano gli editor di richieste, ordini e ordini di lavoro.
// Sta accanto a renderUnsavedBadge() perché è lo stesso stato, detto in un
// altro momento: quello lo mostra mentre si lavora, questo lo difende all'uscita.
function lavoroInSospeso() {
  if (typeof Store !== 'undefined' && Store.isUnsaved && Store.isUnsaved()) return true;
  if (typeof Store !== 'undefined' && Store.scrittureInVolo && Store.scrittureInVolo() > 0) return true;
  return documentoInModifica();
}
// I tre flag in un posto solo (dalla 0.105.6): li legge anche l'archivio
// condiviso, che non ridisegna sopra un documento a metà. Lì i flag erano due,
// e l'ordine di lavoro in modifica veniva sostituito dalla versione del collega.
function documentoInModifica() {
  return !!(typeof rfqDirty !== 'undefined' && rfqDirty)
    || !!(typeof orderDirty !== 'undefined' && orderDirty)
    || !!(typeof odlDirty !== 'undefined' && odlDirty);
}
// Indicatore fisso nell'header finché c'è divergenza tra memoria e persistito.
function renderUnsavedBadge() {
  const el = document.getElementById('unsaved-badge'); if (!el) return;
  const aperto = Store.isUnsaved();
  el.style.display = aperto ? '' : 'none';
  el.textContent = aperto ? '⚠ Modifiche non salvate' : '';
  el.title = aperto ? 'Le ultime modifiche sono rimaste solo in memoria: esporta un backup prima di chiudere la scheda' : '';
}

// ─── La conferma di un salvataggio riuscito ───
// «Aggiornato», «Eliminato», «Impostazioni salvate»: sono la conferma di un
// fatto, e vanno dette solo se il fatto è avvenuto. Fino alla 0.59 arrivavano
// comunque — con l'archivio pieno o in navigazione privata si vedeva il toast
// verde e, sopra, la finestra rossa che diceva che non era stato salvato
// niente. Due messaggi opposti sullo stesso gesto: chi legge sceglie quello che
// preferisce, e di solito sceglie male.
//
// Non serve controllare l'esito a ogni chiamata: Store.isUnsaved() è già il
// flag autorevole, alzato da commitFailed() e abbassato dal primo salvataggio
// che riesce. Quando è alzato tace il toast, e a parlare resta l'avviso di
// salvataggio non riuscito — che è esplicito e non sparisce da solo.
function savedToast(msg) {
  if (Store.isUnsaved()) return false;
  showToast(msg);
  return true;
}
// ─── Errori non previsti ───
// Fuori da store.js non c'era nessuna rete: un'eccezione dentro un render*
// lasciava la vista a metà — mezza tabella, un pannello vuoto — senza dire
// niente. L'utente vedeva l'app "ferma" e non aveva modo di sapere che era
// successo qualcosa, né di raccontarlo a chi doveva ripararla.
//
// Qui non si tenta nessun recupero: un errore in un render lascia comunque uno
// stato incerto, e fingere che sia tutto a posto è peggio che dirlo. Si fa
// l'unica cosa utile — renderlo visibile e conservarlo.
const ERROR_LOG_MAX = 20;    // gli ultimi errori: quanto basta a raccontare cos'è successo
const _errorLog = [];
function logAppError(kind, msg, err) {
  const rec = {
    ts: nowISO(),
    kind,
    msg: String(msg || ''),
    stack: err && err.stack ? String(err.stack).split('\n').slice(0, 8).join('\n') : '',
    view: typeof activeView !== 'undefined' ? activeView : '',
    version: APP_VERSION,
  };
  _errorLog.push(rec);
  if (_errorLog.length > ERROR_LOG_MAX) _errorLog.shift();
  return rec;
}
function appErrorLog() { return _errorLog.slice(); }
// Come per il salvataggio: la finestra esplicativa si mostra una volta sola,
// poi restano il toast e il registro. Ripeterla a ogni errore di un render che
// fallisce a ripetizione renderebbe l'app inutilizzabile.
let appErrorShown = false;
function onAppError(kind, msg, err) {
  const rec = logAppError(kind, msg, err);
  if (typeof console !== 'undefined') console.error('Errore non gestito (' + kind + '):', msg, err || '');
  if (typeof document === 'undefined' || !document.getElementById('toast')) return rec;
  showToast('Si è verificato un errore: la schermata potrebbe essere incompleta', 'error');
  if (!appErrorShown) {
    appErrorShown = true;
    setTimeout(() => showAppErrorModal(rec), 0);
  }
  return rec;
}
function showAppErrorModal(rec) {
  openModal(`<h3>${ico('warning', 'tinted pill', '')} Errore non previsto</h3>
    <p>Qualcosa è andato storto mentre l'app disegnava la pagina: <strong>quello che vedi a schermo potrebbe essere incompleto</strong>. I dati salvati non sono stati toccati.</p>
    <p>Ricarica la pagina per tornare a uno stato pulito. Se l'errore si ripete, scarica il registro e allegalo alla segnalazione.</p>
    <p class="empty-text" style="text-align:left;font-family:var(--mono,monospace);font-size:12px">${esc(rec.msg)}</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Ho capito</button>
      <button class="btn-ghost" onclick="downloadErrorLog()">${ico('download', 'tinted', '')} Scarica registro errori</button>
      <button class="add-btn-sm" onclick="location.reload()">↻ Ricarica la pagina</button>
    </div>`, false, 'avviso');
}
function downloadErrorLog() {
  if (!_errorLog.length) { showToast('Nessun errore registrato in questa sessione'); return; }
  const testo = _errorLog.map(r =>
    `[${r.ts}] ${r.kind} · vista: ${r.view} · Bomtrack ${r.version}\n${r.msg}\n${r.stack}`).join('\n\n───\n\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([testo], { type: 'text/plain' }));
  a.download = `bomtrack-errori-${oggiISO()}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Pannelli ───
// Le schede non oscurano più la pagina: sono finestre mobili appoggiate sopra
// il contenuto, si spostano trascinandole per il titolo e si ridimensionano
// dall'angolo. Dietro si continua a navigare: si può tenere aperto il listino
// di un articolo mentre si sfoglia una distinta.
//
// Ogni pannello ha una chiave e per ogni chiave ce n'è uno solo: riaprire la
// stessa scheda riusa il pannello invece di duplicarlo. Non è una restrizione
// grafica ma sostanziale — lo stato di una scheda aperta vive in una variabile
// sola (window.__priceItemId e simili), quindi due listini affiancati
// scriverebbero l'uno sull'articolo dell'altro. Chiavi diverse convivono
// senza toccarsi.
// Il click fuori dalla finestra non chiude: si esce solo con Salva/Annulla
// (o Chiudi, la ✕, Esc).
// wide = true per i form ampi, es. la scheda articolo.
const PANEL_Z = 100;
let _panelZ = PANEL_Z;
function panelRoot() { return document.getElementById('modal-root'); }
function openModal(h, wide, key) {
  const root = panelRoot(); if (!root) return null;
  const k = key || 'form';
  let p = Array.prototype.find.call(root.children, el => el.dataset.panelKey === k);
  // Con la pagina viva dietro, un form aperto si può lasciare lì e aprirne un
  // altro: prima l'overlay lo impediva, ora va chiesto. Vale solo per i form,
  // le schede di consultazione non hanno niente da perdere.
  // L'unico confirm() nativo rimasto, e resta per una ragione di forma, non di
  // pigrizia: openModal è **sincrona** — restituisce il pannello, e ottanta
  // chiamanti ci scrivono dentro subito dopo — mentre askConfirm risponde con
  // una richiamata. Sostituirlo qui vorrebbe dire rendere asincrona l'apertura
  // di ogni scheda dell'app. Il prezzo è un riquadro di sistema fuori tema in un
  // caso che capita di rado; il resto dell'app askConfirm ce l'ha.
  //
  // Dalla 0.105.6 si chiede solo se quel form è stato **davvero** cambiato:
  // la domanda arrivava anche su una scheda appena aperta e mai toccata, e una
  // domanda che non ha mai niente da proteggere si impara a confermare senza
  // leggerla — proprio la volta che conta.
  if (p && k === 'form' && panelModificato(p) && !confirm('Una scheda è già aperta: le modifiche non salvate andranno perse. Continuare?')) return null;
  const nuovo = !p;
  if (nuovo) {
    p = document.createElement('div');
    p.dataset.panelKey = k;
    // Una scheda è un dialogo: chi naviga con un lettore di schermo deve
    // sentirsi dire che ne è stata aperta una, non trovarsi del testo nuovo
    // in mezzo alla pagina senza sapere da dove arriva.
    //
    // `role` sì, `aria-modal` no. Quest'ultimo dichiara che tutto il resto della
    // pagina è inerte, e qui non lo è per scelta: le schede si lasciano aperte,
    // se ne apre un'altra accanto, la vista dietro resta viva e usabile. Il Tab
    // esce eccome — e chi usa un lettore di schermo si trovava a leggere del
    // contenuto che l'attributo gli aveva appena dichiarato inesistente.
    // Dicevano il falso anche due schede aperte insieme, entrambe «l'unica».
    // Si toglie l'attributo invece di rinchiudere il Tab: la pagina viva dietro
    // è il disegno, non un difetto da correggere.
    p.setAttribute('role', 'dialog');
    // Dove tornare quando si chiude: senza, il focus finisce a inizio pagina e
    // chi usa la tastiera deve rifare tutta la strada per riprendere il lavoro.
    p._focusPrima = document.activeElement || null;
    root.appendChild(p);
  }
  p.className = 'panel' + (wide ? ' panel-wide' : '');
  p.innerHTML = `<button class="panel-x" title="Chiudi (Esc)" aria-label="Chiudi (Esc)" onclick="closePanel(this.parentNode)">✕</button>${h}`;
  if (nuovo) panelPlace(p);
  panelRaise(p);
  a11yFields(p);
  panelFocus(p);
  // Lo stato di partenza dei campi, per sapere poi se il form è cambiato. Si
  // fissa subito e di nuovo al giro di coda: molti chiamanti riempiono i campi
  // dopo che openModal ha restituito il pannello (le tendine, i valori
  // calcolati), e quei valori sono la partenza, non una modifica. Chi scrive
  // non può farlo prima di quel giro: è lo stesso tratto sincrono.
  panelFissaStato(p);
  Promise.resolve().then(() => panelFissaStato(p));
  return p;
}
// I valori dei campi di una scheda, in una stringa sola da confrontare.
function panelStato(p) {
  if (!p || typeof p.querySelectorAll !== 'function') return '';
  return Array.prototype.map.call(p.querySelectorAll('input, select, textarea'), c =>
    (c.type === 'checkbox' || c.type === 'radio' ? (c.checked ? '1' : '0') : String(c.value == null ? '' : c.value))).join('\u0000');
}
function panelFissaStato(p) { if (p) p._statoIniziale = panelStato(p); }
// Senza uno stato di partenza si risponde «cambiato»: nel dubbio si chiede.
function panelModificato(p) { return !p || p._statoIniziale == null || panelStato(p) !== p._statoIniziale; }
// ─── Etichette, pulsanti-icona e titolo della scheda ───
// I template scrivono `<div class="modal-field"><label>Nome</label><input id="…">`:
// l'associazione fra i due c'è per posizione ma non per il browser, quindi
// cliccare l'etichetta non mette a fuoco il campo e un lettore di schermo
// annuncia «casella di testo» senza dire di cosa. Collegarli a mano avrebbe
// voluto dire centocinquanta modifiche e centocinquanta occasioni di sbagliare
// un id; qui si fa una volta, sulla struttura, e vale anche per i form che
// verranno.
//
// Stessa logica per i pulsanti a sola icona (✏ 🗑 🔗 ★): il `title` che hanno
// già dice cosa fanno a chi passa il mouse, e diventa l'etichetta accessibile
// per chi non lo usa.
let _a11ySeq = 0;
function a11yFields(host) {
  if (!host || !host.querySelectorAll) return;
  host.querySelectorAll('.modal-field').forEach(f => {
    const lab = f.querySelector('label');
    if (!lab || lab.getAttribute('for')) return;
    const campo = f.querySelector('input, select, textarea');
    if (!campo) return;
    if (!campo.id) campo.id = 'a11y-' + (++_a11ySeq);
    lab.setAttribute('for', campo.id);
  });
  host.querySelectorAll('button[title]').forEach(b => {
    if (b.getAttribute('aria-label')) return;
    // Solo i pulsanti che non hanno un testo leggibile: dove c'è già una
    // parola, ripeterla nell'etichetta la farebbe annunciare due volte.
    const txt = (b.textContent || '').replace(/[^\p{L}\p{N}]/gu, '').trim();
    if (!txt) b.setAttribute('aria-label', b.getAttribute('title'));
  });
  // Il titolo della scheda le dà un nome: senza, un dialogo si annuncia senza
  // dire quale.
  if (host.getAttribute && host.getAttribute('role') === 'dialog' && !host.getAttribute('aria-label')) {
    const h3 = host.querySelector('h3');
    if (h3 && h3.textContent) host.setAttribute('aria-label', h3.textContent.trim());
  }
}
// ─── Righe e simboli cliccabili, raggiungibili anche da tastiera ───
// Un `<div onclick>` è invisibile alla tastiera: non si può raggiungere col
// tabulatore e Invio non lo attiva. Chi non usa il mouse — per abitudine o
// perché non può — resta fuori da quella funzione senza che nulla glielo dica.
// Questi attributi sono lo stesso patto che `codeLink` rispetta da sempre:
// dichiararsi pulsante, entrare nel giro del tabulatore, rispondere a Invio e
// alla barra spaziatrice. `azione` è la stessa chiamata che sta nell'onclick.
function clickAttrs(azione, etichetta) {
  const a = String(azione);
  return `role="button" tabindex="0" onclick="${a}"`
    + ` onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${a}}"`
    + (etichetta ? ` aria-label="${esc(etichetta)}"` : '');
}
// Il focus entra nella scheda appena aperta: sul primo campo da compilare, o —
// se non ce ne sono — sul primo pulsante, che nelle conferme è sempre quello
// che **non** fa danni.
function panelFocus(p) {
  if (!p || !p.querySelector) return;
  const primo = p.querySelector('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])')
    || p.querySelector('.modal-actions button');
  if (primo && primo.focus) setTimeout(() => primo.focus(), 0);
}
// Il primo pannello al centro, i successivi a scalare: due schede aperte non
// devono coprirsi esattamente, altrimenti sembra che sia una sola.
function panelPlace(p) {
  const n = panelRoot().children.length - 1;
  const off = (n % 6) * 26;
  const w = p.offsetWidth, h = p.offsetHeight;
  const maxL = Math.max(8, window.innerWidth - w - 8);
  const maxT = Math.max(8, window.innerHeight - h - 8);
  p.style.left = Math.min(Math.max(8, (window.innerWidth - w) / 2 + off), maxL) + 'px';
  p.style.top = Math.min(Math.max(8, window.innerHeight * 0.06 + off), maxT) + 'px';
}
// Portare avanti un pannello alza un contatore: in una sessione lunga
// salirebbe sopra al toast (z-index 999), che deve restare visibile. Prima di
// arrivarci si rinumera dal basso, mantenendo l'ordine attuale.
function panelRaise(p) {
  if (!p) return;
  if (_panelZ > PANEL_Z + 600) {
    const ord = Array.prototype.slice.call(panelRoot().children)
      .sort((a, b) => (+a.style.zIndex || 0) - (+b.style.zIndex || 0));
    _panelZ = PANEL_Z;
    ord.forEach(el => { el.style.zIndex = ++_panelZ; });
  }
  p.style.zIndex = ++_panelZ;
}
// Il pannello davanti a tutti: è quello su cui si sta lavorando, ed è quello
// che closeModal() chiude dopo un salvataggio.
function panelTop() {
  const root = panelRoot(); if (!root) return null;
  return Array.prototype.reduce.call(root.children,
    (best, el) => (!best || (+el.style.zIndex || 0) >= (+best.style.zIndex || 0)) ? el : best, null);
}
// Lo stato di una scheda vive in una variabile globale (window.__priceItemId e
// simili, vedi il commento sopra openModal). Chiudendo la scheda quella
// variabile restava a puntare all'articolo di prima: il listino chiuso, e un
// ridisegno arrivato da altrove continuava a lavorare sull'articolo sbagliato.
//
// Ogni chiave dichiara come si ripulisce, e core.js non ha bisogno di sapere
// cosa siano quelle variabili — le registra chi le usa, accanto a dove le usa.
// Si accumulano invece di sostituirsi: la chiave di serie ('form') è condivisa
// da schede di file diversi, e l'ultimo a registrarsi non deve zittire gli altri.
const PANEL_CLEANUP = {};
function onPanelClose(key, fn) { (PANEL_CLEANUP[key] = PANEL_CLEANUP[key] || []).push(fn); }
function panelCleanup(key) { (PANEL_CLEANUP[key] || []).forEach(fn => fn()); }
function closePanel(p) {
  const torna = p && p._focusPrima;
  const k = p && p.dataset && p.dataset.panelKey;
  if (k) panelCleanup(k);
  if (p && p.parentNode) p.parentNode.removeChild(p);
  if (!panelRoot() || !panelRoot().children.length) _panelZ = PANEL_Z;   // gli z-index non crescono all'infinito
  // Il focus torna da dove era partito: chi ha aperto la scheda dal pulsante ✏
  // di una riga si ritrova su quel pulsante, non a inizio pagina.
  if (torna && torna.focus && torna.parentNode) torna.focus();
}
// Chiude la scheda in primo piano: le decine di "Annulla" e i salvataggi che
// chiamano closeModal() intendono sempre quella con cui si sta lavorando.
function closeModal() { closePanel(panelTop()); }
function closeAllPanels() {
  const r = panelRoot();
  if (r) Array.prototype.forEach.call(r.children, el => {
    const k = el.dataset && el.dataset.panelKey;
    if (k) panelCleanup(k);
  });
  if (r) r.innerHTML = '';
  _panelZ = PANEL_Z;
}

// ─── Conferme in scheda ───
// confirm() nativo blocca il browser, esce dallo stile dell'app e non lascia
// scrivere la domanda con un minimo di cura. Qui la domanda è una scheda come
// le altre; non essendo bloccante, il seguito dell'azione arriva come funzione:
//   askConfirm('Eliminare X?', () => { …il resto… })
// L'unica confirm() nativa che resta è quella dentro openModal: fa da guardia
// al meccanismo stesso dei pannelli e non può aprirne uno per chiederlo.
let _confirmFn = null;
function askConfirm(message, onYes, opts) {
  const o = opts || {};
  _confirmFn = typeof onYes === 'function' ? onYes : null;
  openModal(`<h3>${ico('warning', 'tinted pill', '')} ${esc(o.title || 'Conferma')}</h3>
    <p class="confirm-text">${esc(message).replace(/\n/g, '<br>')}</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="confirmNo()">${esc(o.cancel || 'Annulla')}</button>
      <button class="add-btn-sm${o.safe ? '' : ' btn-danger'}" onclick="confirmYes()">${esc(o.ok || 'Conferma')}</button>
    </div>`, false, 'confirm');
}
function confirmNo() { _confirmFn = null; closeModal(); }
// ─── Autore delle modifiche ───
// createdBy/updatedBy sono scritti da sempre da stampNew()/touch(), ma non si
// erano mai visti: in due su un database condiviso "chi ha cambiato questo
// prezzo?" è la prima domanda che arriva.
function actorName(id) {
  if (!id) return '';
  const u = userIndex().get(id);
  return u ? u.name : 'utente rimosso';
}
// ─── Date ───
// Oggi secondo il calendario di chi lavora, non secondo Greenwich: alle 23 del
// 30 settembre in Italia è ancora il 30, e un semaforo che dicesse «1 ottobre»
// segnalerebbe in ritardo qualcosa che non lo è. Al contrario, fra mezzanotte e
// le due `toISOString()` dà ancora il giorno prima — ed era così che
// l'import datava le quotazioni, dove la data **è** l'identità della riga.
function oggiISO() {
  const n = new Date();
  return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
// Una data ISO detta all'italiana. Stava in views-docs.js e la usavano altre
// quattro viste: è gemella di fmtStamp, e il suo posto è qui.
function fmtDateIt(d) { return d ? new Date(d).toLocaleDateString('it-IT') : ''; }
function fmtStamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}
// Riga "creato/aggiornato da" per il fondo di una scheda. Vuota se il record
// non porta timestamp (dati importati o precedenti allo schema v2).
function stampLine(rec) {
  if (!rec) return '';
  const parts = [];
  if (rec.createdAt) parts.push(`Creato${rec.createdBy ? ' da ' + esc(actorName(rec.createdBy)) : ''} il ${esc(fmtStamp(rec.createdAt))}`);
  if (rec.updatedAt && rec.updatedAt !== rec.createdAt) parts.push(`aggiornato${rec.updatedBy ? ' da ' + esc(actorName(rec.updatedBy)) : ''} il ${esc(fmtStamp(rec.updatedAt))}`);
  if (!parts.length) return '';
  return `<p class="stamp-line">${ico('clock', 'tinted', '')} ${parts.join(' · ')}</p>`;
}
// Versione testuale, una riga, per una cella di tabella: l'ultimo tocco (o la
// creazione, se non è mai stato aggiornato) invece della frase intera di
// `stampLine`, che è pensata per il fondo di una scheda.
function recordAuthorShort(rec) {
  if (!rec) return '—';
  const at = rec.updatedAt || rec.createdAt;
  if (!at) return '—';
  const by = rec.updatedAt ? rec.updatedBy : rec.createdBy;
  return (by ? actorName(by) + ' · ' : '') + fmtDateIt(at);
}
function confirmYes() {
  const fn = _confirmFn; _confirmFn = null;
  closeModal();
  if (fn) fn();
}

// ─── Trascinamento e messa in primo piano ───
// Delegato sulla radice: i pannelli nascono e muoiono di continuo, agganciare
// gli ascoltatori a ognuno significherebbe ricordarsi di staccarli.
let _drag = null;
function panelDragStart(e) {
  const p = e.target.closest ? e.target.closest('.panel') : null;
  if (!p) return;
  panelRaise(p);
  // Si trascina solo per il titolo, e solo per quello del pannello (children[1]:
  // children[0] è la ✕). Un <h3> dentro al corpo non deve muovere la finestra.
  const h = e.target.closest('h3');
  if (!h || h !== p.children[1] || e.button !== 0) return;
  const r = p.getBoundingClientRect();
  _drag = { p, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height };
  e.preventDefault();   // niente selezione del testo del titolo mentre si sposta
}
function panelDragMove(e) {
  if (!_drag) return;
  const maxL = Math.max(0, window.innerWidth - _drag.w);
  const maxT = Math.max(0, window.innerHeight - 34);   // il titolo resta sempre afferrabile
  _drag.p.style.left = Math.min(Math.max(0, e.clientX - _drag.dx), maxL) + 'px';
  _drag.p.style.top = Math.min(Math.max(0, e.clientY - _drag.dy), maxT) + 'px';
}
function panelDragEnd() { _drag = null; }
if (typeof document !== 'undefined') {
  document.addEventListener('mousedown', panelDragStart, true);
  document.addEventListener('mousemove', panelDragMove);
  document.addEventListener('mouseup', panelDragEnd);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && panelTop()) { closeModal(); e.preventDefault(); }
    // Ctrl+K (⌘K su Mac): la ricerca globale da qualunque punto dell'app
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K') && currentUser) {
      globalSearchModal(); e.preventDefault();
    }
    // Ctrl+I: apre e chiude il pannello laterale, senza andare a cercare il
    // pulsante ogni volta che serve un po' di larghezza in più.
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I') && currentUser) {
      inspectorToggle(); e.preventDefault();
    }
    // Frecce, Invio ed Esc sull'elenco: li gestisce il pannello, che sa se c'è
    // una riga scelta e se il fuoco è dentro un campo. Se non se ne occupa lui,
    // i tasti restano al browser.
    else if (currentUser && typeof inspectorKey === 'function' && inspectorKey(e)) e.preventDefault();
  });
  // Il Ctrl+P del browser deve trovare l'intestazione già compilata.
  // Riferimento differito: printHeadFill sta in uno script caricato dopo questo.
  window.addEventListener('beforeprint', () => printHeadFill());
  // Chiudere la scheda con del lavoro per aria: si chiede, non si lascia andare.
  //
  // Due cose diverse finiscono qui. La prima è il salvataggio **fallito**:
  // showPersistErrorModal() dice testualmente «chiudendo questa scheda
  // andrebbero persi», e il badge ⚠ in testata lo ricorda — ma finché non c'era
  // questa riga la scheda si chiudeva senza una parola, e quel lavoro spariva
  // davvero. La seconda sono i documenti a metà compilazione: rfqDirty,
  // orderDirty e odlDirty esistono già e nessuno li guardava all'uscita.
  //
  // Il testo non lo decide l'app: i browser mostrano da anni una frase loro, e
  // l'unica cosa che conta è **restituire qualcosa** da preventDefault. Si tace
  // quando non c'è niente in sospeso, perché un avviso che compare sempre è un
  // avviso che si impara a scacciare senza leggerlo.
  window.addEventListener('beforeunload', e => {
    if (!lavoroInSospeso()) return;
    e.preventDefault();
    e.returnValue = '';       // richiesto dai browser più vecchi
    return '';
  });
  // Rete per tutto ciò che non ha un try/catch proprio. `error` cattura anche il
  // caricamento fallito di uno script, che però ha già le sue guardie
  // (requirePdf/requireXlsx) e non va segnalato due volte.
  window.addEventListener('error', e => {
    if (e.target && e.target !== window && e.target.tagName) return;   // risorsa non caricata, non un'eccezione
    onAppError('errore', e.message || 'errore sconosciuto', e.error);
  });
  // Indietro/Avanti del browser e link con hash: la navigazione risponde
  // all'indirizzo. Riferimento differito: onHashChange sta in shell.js.
  // L'altra scheda che scrive si fa sentire **subito**, non al primo
  // salvataggio di questa: chi continua a lavorare su dati ormai vecchi accumula
  // modifiche che poi non potrà più salvare senza cancellare quelle altrui.
  // L'evento `storage` arriva solo alle **altre** schede, mai a chi ha scritto.
  window.addEventListener('storage', e => {
    if (e.key && e.key !== DB_KEY_REV && e.key !== DB_KEY) return;
    if (typeof Store !== 'undefined' && Store.revisione && Store.revisione() !== undefined) onExternalChange();
  });
  // ── L'app anche senza rete ──
  // Il service worker mette in cache i file del programma (non i dati: quelli
  // stanno nel browser, in IndexedDB o localStorage, e non passano di lì) così l'app si apre offline e si
  // può installare sul PC dell'officina.
  //
  // Su file:// non esiste e il browser lo rifiuta: è il modo in cui l'app si
  // apre col doppio click, ed è **il caso normale**, non un ripiego. Per questo
  // l'errore si ignora in silenzio invece di finire in onAppError — non c'è
  // niente che non va, e un avviso a ogni avvio sarebbe rumore. Le librerie di
  // export stanno in vendor/ proprio perché l'offline non dipenda da qui.
  if (typeof navigator !== 'undefined' && navigator.serviceWorker && location.protocol !== 'file:') {
    swAscoltaVersioni(navigator.serviceWorker);
    navigator.serviceWorker.register('sw.js')
      .then(reg => swControllaOgni(reg))
      .catch(() => { /* niente cache: l'app funziona lo stesso */ });
  }
  window.addEventListener('hashchange', () => onHashChange());
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason;
    onAppError('promessa', r && r.message ? r.message : String(r), r instanceof Error ? r : null);
  });
}
// Il valore di un campo scritto a mano, ripulito ai bordi. I form passano da
// val(), che il trim lo fa da sempre; i campi di richieste, ordini, piani e
// commesse scrivono invece `this.value` grezzo dentro il loro setter, e gli
// spazi restavano nel dato.
//
// Sul Cliente di una commessa non è cosmesi: quel testo **è la chiave** verso
// l'anagrafica, e « Rossi Srl » con gli spazi si porta dietro un valore che
// coincide con il cliente solo perché ogni confronto, altrove, ricorda di
// togliere gli spazi. Basta che uno se ne dimentichi.
//
// Vale sui campi commessi con onchange — cioè quando si esce dal campo, non
// mentre si scrive — quindi il cursore non ne risente.
function campoTesto(v) { return typeof v === 'string' ? v.trim() : v; }
// ─── Le chiavi dell'archivio locale ───
// Tutte con l'underscore: `bomtrack_v1`, `bomtrack_session`, `bomtrack_theme`.
// Due preferenze usavano il punto (`bomtrack.columns`, `bomtrack.inspector`) e
// nessuna regola distingueva i due gruppi — contengono la stessa cosa, comodità
// personali di chi guarda lo schermo — con l'effetto che nessuna pulizia o
// diagnostica poteva raccoglierle per prefisso.
//
// Rinominare una chiave, però, vuol dire buttare via ciò che c'era dentro: le
// colonne che qualcuno ha nascosto in Anagrafica sono una scelta fatta a mano,
// e ricomparirebbero tutte senza spiegazione. Il travaso avviene una volta,
// alla prima lettura, e la chiave vecchia si toglie subito dopo.
function localPref(key, keyVecchia) {
  try {
    const v = localStorage.getItem(key);
    if (v != null) return v;
    if (!keyVecchia) return null;
    const vecchio = localStorage.getItem(keyVecchia);
    if (vecchio == null) return null;
    localStorage.setItem(key, vecchio);
    localStorage.removeItem(keyVecchia);
    return vecchio;
  } catch (e) { return null; }   // modo privato o spazio esaurito: si riparte dai valori di serie
}
function val(id) { const e = document.getElementById(id); return e ? e.value.trim() : ''; }
// Il valore di un campo che non può restare vuoto. Torna '' e lo dice, così il
// chiamante fa `const n = requireVal('x', 'Nome richiesto'); if (!n) return;`.
//
// Esiste perché la validazione stava solo sul ramo «aggiungi»: addSupplier
// chiedeva il nome, saveSupplier lo lasciava svuotare — e un fornitore con nome
// vuoto compare come riga bianca in Gestione, mentre ogni richiesta e ordine
// intestati a lui stampano «senza fornitore» in PDF senza che niente lo segnali.
// Lo stesso valeva per i centri di lavoro, le famiglie e le sottofamiglie.
function requireVal(id, messaggio) {
  const v = val(id);
  if (!v) showToast(messaggio || 'Campo obbligatorio', 'error');
  return v;
}
function setVal(id, v) { const e = document.getElementById(id); if (e) e.value = v; }
// ─── Digitazione: rinvio del ridisegno ───
// I campi di ricerca ridisegnano interi elenchi a ogni carattere. Con poche
// centinaia di articoli si sente: la digitazione "impasta". Si aspetta una
// breve pausa e si disegna una volta sola. Il rinvio è per chiave, così due
// campi diversi non si annullano a vicenda.
const SEARCH_DELAY = 160;   // ms: sotto la soglia in cui si percepisce un ritardo
const _debounceTimers = {};
function debounced(key, fn, ms) {
  clearTimeout(_debounceTimers[key]);
  _debounceTimers[key] = setTimeout(fn, ms == null ? SEARCH_DELAY : ms);
}

// ─── Lettura dei campi numerici ───
// parseFloat da solo lascia passare i negativi e Infinity: un costo negativo si
// propaga per tutto il rollup, un Infinity fa comparire NaN ovunque.
// clampNum è logica pura, senza DOM: è la parte che la suite verifica.
function clampNum(v, min, max) {
  if (!isFinite(v)) return min != null ? min : 0;      // campo vuoto, testo, NaN, Infinity
  if (min != null && v < min) return min;
  if (max != null && v > max) return max;
  return v;
}
// Valore così com'è stato digitato (0 se vuoto o non numerico): serve a
// riconoscere un negativo prima di correggerlo.
function rawNum(id) {
  const e = document.getElementById(id);
  const v = parseFloat(e ? e.value : '');
  return isFinite(v) ? v : 0;
}
function numVal(id, min, max) { return clampNum(rawNum(id), min, max); }
// Percentuali e valori di bozza si riportano dentro l'intervallo in silenzio
// (come già fa codeDigits); costi, prezzi e quantità no: lì un negativo è un
// errore di battitura, e azzerarlo lo farebbe sparire senza dirlo a nessuno.
function isNeg(id) { return rawNum(id) < 0; }
function isChecked(id) { const e = document.getElementById(id); return !!(e && e.checked); }
