// ─── Colonne degli elenchi ───
//
// L'altra metà del problema che il pannello laterale ha cominciato a risolvere.
// Il pannello ha tolto dalle righe i comandi; qui si tolgono le colonne che a
// una certa persona, in un certo lavoro, non servono: chi compra non guarda il
// lotto, chi controlla il magazzino non guarda la famiglia. Nascondere non è
// perdere — l'articolo ha tutto nel pannello, che di spazio ne ha.
//
// Il meccanismo è deliberatamente stupido: ogni cella porta la classe della sua
// colonna (`col-uom`, `col-lot`…) e nascondere significa scrivere una regola
// CSS. Nessun ridisegno, nessuna tabella da ricostruire, nessun conteggio di
// `<td>` da tenere allineato con i `<th>` — la stessa classe sta su entrambi, e
// se sbagli sparisce la coppia, non mezza tabella.
//
// La scelta è **per vista**, non per utente e non nel database: Acquisti e
// Progetto disegnano le righe con la stessa funzione ma sono due elenchi
// diversi, e chi li usa li guarda per motivi diversi.

// Underscore come tutte le altre chiavi locali. La vecchia col punto si
// travasa alla prima lettura (localPref, core.js): le colonne nascoste a mano
// non devono ricomparire tutte per un cambio di nome.
const COLS_KEY = 'bomtrack_columns';
const COLS_KEY_VECCHIA = 'bomtrack.columns';

// Codice e Descrizione non si nascondono: sono l'identità della riga, e un elenco in
// cui non si sa più di cosa parla ogni riga non è un elenco più pulito, è un
// elenco rotto. La colonna dei comandi non è qui: la governa il pannello.
// Colonne comuni ad Acquisti e Progetto oltre a quelle già mostrate oggi:
// campi che i due elenchi possono davvero ospitare (fornitore e listino, doppia
// unità d'acquisto, scorte, note, autore), ma che restano nascosti finché
// qualcuno non li accende — vedi `defaultHidden` più sotto.
const CAT_EXTRA_COLUMNS = [
  { key: 'subfamily', label: 'Sottofamiglia', defaultHidden: true },
  { key: 'supplier', label: 'Fornitore', defaultHidden: true },
  { key: 'altuom', label: 'UM acquisto', defaultHidden: true },
  { key: 'altfactor', label: 'Fattore conversione', defaultHidden: true },
  { key: 'safety', label: 'Scorta minima', defaultHidden: true },
  { key: 'lot', label: 'Lotto', defaultHidden: true },
  { key: 'notes', label: 'Note', defaultHidden: true },
  { key: 'autore', label: 'Creato/aggiornato da', defaultHidden: true },
];
const COLUMNS = {
  buy: [
    { key: 'flags', label: 'Indicatori' },
    { key: 'code', label: 'Codice', fissa: true },
    { key: 'name', label: 'Descrizione', fissa: true },
    { key: 'type', label: 'Tipo' },
    { key: 'family', label: 'Famiglia' },
    { key: 'uom', label: 'U.M.' },
    { key: 'cost', label: 'Costo unitario' },
    { key: 'meta', label: 'Dettaglio' },
    ...CAT_EXTRA_COLUMNS,
  ],
  stock: [
    { key: 'flags', label: 'Indicatori' },
    { key: 'code', label: 'Codice', fissa: true },
    { key: 'name', label: 'Descrizione', fissa: true },
    { key: 'type', label: 'Tipo' },
    { key: 'family', label: 'Famiglia' },
    { key: 'uom', label: 'U.M.' },
    { key: 'location', label: 'Ubicazione' },
    { key: 'onhand', label: 'Esistente' },
    // Modulo Qualità: nascosta finché non serve, come le altre colonne che non
    // tutti usano. Accesa, dice quanta merce aspetta un esito.
    { key: 'inqc', label: 'In collaudo', defaultHidden: true },
    { key: 'incoming', label: 'In arrivo' },
    { key: 'committed', label: 'Impegnato' },
    { key: 'free', label: 'Libero' },
    { key: 'safety', label: 'Scorta minima' },
    { key: 'lot', label: 'Lotto' },
    { key: 'subfamily', label: 'Sottofamiglia', defaultHidden: true },
    { key: 'lotmode', label: 'Modalità lotto', defaultHidden: true },
    { key: 'atsupplier', label: 'Presso terzi', defaultHidden: true },
    { key: 'inwork', label: 'In lavorazione', defaultHidden: true },
    { key: 'notes', label: 'Note', defaultHidden: true },
    { key: 'autore', label: 'Creato/aggiornato da', defaultHidden: true },
  ],
};
// Le due anagrafiche condividono le colonne di base ma NON sono un clone:
// Progetto ospita anche le parti, che portano due campi che Acquisti non avrà
// mai (concetto e approvvigionamento). Una copia esplicita, non un alias —
// l'alias funzionava solo finché nessuno lo mutava.
COLUMNS.design = COLUMNS.buy.map(c => Object.assign({}, c)).concat([
  { key: 'concept', label: 'Concetto (parti)', defaultHidden: true },
  { key: 'sourcing', label: 'Approvvigionamento (parti)', defaultHidden: true },
]);
// Dove sta la tabella di ciascuna vista: la regola CSS si limita a quella, così
// nascondere una colonna in Acquisti non la nasconde in Progetto.
const COL_TABLE = { buy: 'buy-table', design: 'des-table', stock: 'stk-table' };

let colsHidden = {};    // vista → elenco delle colonne nascoste

function colsFor(view) { return COLUMNS[view] || null; }
function colsHiddenOf(view) { return colsHidden[view] || []; }
// Una colonna normale è nascosta quando la sua chiave sta nell'array salvato.
// Una colonna nuova (`defaultHidden`) nasce nascosta: qui la presenza nell'array
// significa il contrario, «l'ho accesa io» — così chi non tocca niente non vede
// comparire colonne che ieri non c'erano, e chi la accende la ritrova domani.
function colIsHidden(view, key) {
  const col = colsFor(view) && colsFor(view).find(c => c.key === key);
  const inArr = colsHiddenOf(view).includes(key);
  return (col && col.defaultHidden) ? !inArr : inArr;
}

function colsLoad() {
  try {
    const p = JSON.parse(localPref(COLS_KEY, COLS_KEY_VECCHIA) || 'null');
    if (p && typeof p === 'object') colsHidden = p;
  } catch (e) { /* preferenze illeggibili: si riparte da tutte le colonne */ }
  colsSanitize();
}
function colsSave() {
  try { localStorage.setItem(COLS_KEY, JSON.stringify(colsHidden)); } catch (e) { /* niente da rompere */ }
}
// Una colonna tolta dal codice, o resa fissa, non deve restare nascosta per
// sempre per via di una preferenza salvata mesi fa: si scarta ciò che non
// esiste più e ciò che non si può nascondere.
function colsSanitize() {
  Object.keys(colsHidden).forEach(view => {
    const cols = colsFor(view);
    if (!cols) { delete colsHidden[view]; return; }
    const buone = (colsHidden[view] || []).filter(k => cols.some(c => c.key === k && !c.fissa));
    if (buone.length) colsHidden[view] = buone; else delete colsHidden[view];
  });
}

// Nascondere e rimettere è lo stesso gesto: si scrive la regola e basta.
function colToggle(view, key) {
  const cols = colsFor(view);
  const col = cols && cols.find(c => c.key === key);
  if (!col || col.fissa) return;
  const attuali = colsHiddenOf(view);
  colsHidden[view] = attuali.includes(key) ? attuali.filter(k => k !== key) : attuali.concat(key);
  if (!colsHidden[view].length) delete colsHidden[view];
  colsSave();
  colsApply();
  colsRenderPicker(view);
}
// «Mostra tutte»: per le colonne normali significa svuotare l'array, ma per
// una colonna nata nascosta (`defaultHidden`) significa il contrario —
// scriverne la chiave, che per quelle è come dire «mostrata». Le due cose
// insieme fanno «tutto acceso», qualunque sia il significato della presenza.
function colsResetView(view) {
  const accese = (colsFor(view) || []).filter(c => c.defaultHidden).map(c => c.key);
  if (accese.length) colsHidden[view] = accese; else delete colsHidden[view];
  colsSave();
  colsApply();
  colsRenderPicker(view);
}
// Quante colonne mancano davvero all'elenco: non la lunghezza grezza
// dell'array salvato (che per le colonne `defaultHidden` conta il contrario),
// ma quante `colIsHidden` dichiara nascoste.
function colsHiddenCount(view) {
  return (colsFor(view) || []).filter(c => !c.fissa && colIsHidden(view, c.key)).length;
}

// Tutte le regole in una stringa sola: è la funzione che la suite verifica, e
// non tocca il DOM. Itera il registro (non più solo `colsHidden`, che da solo
// non basta più a dire chi è nascosto: una colonna `defaultHidden` lo è anche
// quando la sua chiave NON è nell'array) e chiede a `colIsHidden` colonna per
// colonna.
function colsHideCss() {
  return Object.keys(COL_TABLE).map(view => {
    const t = COL_TABLE[view];
    const keys = (colsFor(view) || []).filter(c => !c.fissa && colIsHidden(view, c.key)).map(c => c.key);
    if (!t || !keys.length) return '';
    return keys.map(k => `#${t} .col-${k}`).join(',') + '{display:none}';
  }).filter(Boolean).join('\n');
}
// Un solo foglio di stile, riscritto per intero a ogni cambio: niente regole
// vecchie da rincorrere.
function colsApply() {
  if (typeof document === 'undefined' || !document.createElement) return;
  let st = document.getElementById('col-style');
  if (!st) {
    st = document.createElement('style');
    st.id = 'col-style';
    if (document.head && document.head.appendChild) document.head.appendChild(st);
  }
  st.textContent = colsHideCss();
}

// ─── Dividere l'elenco per famiglia (o per tipo) ───
// La divisione non è una colonna: spacca la tabella in più `<table>`, una per
// gruppo (`itemGrid`/`catalogGroups`, views-catalog.js). Non si può quindi
// spegnere con una regola CSS come le colonne — serve un ridisegno vero — ma
// l'interruttore vive nello stesso pannello, perché per chi lo usa è la stessa
// domanda: «cosa mi mostra questo elenco?». Scelta per vista come le colonne;
// storage a parte apposta, per non toccare lo schema di `colsHidden`.
const GROUP_KEY = 'bomtrack_group_off';
let groupOff = {};   // vista → true se l'utente ha spento la divisione
function isGrouped(view) { return !groupOff[view]; }   // assente = diviso, come sempre
function groupLoad() {
  try {
    const p = JSON.parse(localStorage.getItem(GROUP_KEY) || 'null');
    if (p && typeof p === 'object') groupOff = p;
  } catch (e) { /* preferenza illeggibile: si riparte divisi, come sempre */ }
}
function groupSave() {
  try { localStorage.setItem(GROUP_KEY, JSON.stringify(groupOff)); } catch (e) { /* niente da rompere */ }
}
function groupToggle(view) {
  if (!colsFor(view)) return;
  groupOff[view] = !groupOff[view];
  groupSave();
  // La struttura della tabella cambia: una regola CSS non basta, serve
  // rifare il disegno della vista che quella tabella la costruisce.
  if (view === 'stock') renderStock(); else renderCatalog(view);
  colsRenderPicker(view);
}

// ─── La scheda per scegliere ───
function colsPickerModal(view) {
  if (!colsFor(view)) return;
  openModal(colsPickerHtml(view), false, 'colonne');
}
function colsPickerHtml(view) {
  const cols = colsFor(view);
  const nascoste = colsHiddenCount(view);
  return `<h3>${ico('list', 'tinted pill', '')} Colonne dell'elenco</h3>
    <p class="empty-text" style="text-align:left;padding:0 0 12px">Le colonne che togli restano tolte anche
    domani. Quello che sparisce dall'elenco resta nel <strong>pannello laterale</strong>, che dell'articolo
    scelto dice tutto.</p>
    <label class="flag-check" style="margin-bottom:12px">
      <input type="checkbox" ${isGrouped(view) ? 'checked' : ''} onchange="groupToggle('${view}')">
      Dividi l'elenco per famiglia</label>
    <p class="empty-text" style="text-align:left;padding:0 0 12px">Spegnendola l'elenco torna a una tabella
    sola, senza sezioni (vale anche per le sezioni per tipo di Progetto — macchine, gruppi, parti).</p>
    <div id="col-picker">${colsPickerBody(view)}</div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="colsResetView('${view}')" ${nascoste ? '' : 'disabled'}>Mostra tutte</button>
      <button class="btn-outline" onclick="closeModal()">Chiudi</button>
    </div>`;
}
function colsPickerBody(view) {
  const cols = colsFor(view);
  return cols.map(c => {
    const vis = !colIsHidden(view, c.key);
    if (c.fissa) {
      return `<label class="flag-check col-pick-fissa" title="Identifica la riga: non si può nascondere">
        <input type="checkbox" checked disabled> ${esc(c.label)}</label>`;
    }
    return `<label class="flag-check">
      <input type="checkbox" ${vis ? 'checked' : ''} onchange="colToggle('${view}','${c.key}')"> ${esc(c.label)}</label>`;
  }).join('');
}
// Ridisegna solo l'elenco delle caselle: la scheda resta aperta, così si tolgono
// tre colonne di fila senza riaprirla ogni volta.
function colsRenderPicker(view) {
  if (typeof document === 'undefined') return;
  const box = document.getElementById('col-picker');
  if (box) box.innerHTML = colsPickerBody(view);
}
// Il pulsante che apre la scheda, con il conto di quante colonne mancano: senza,
// un elenco a cui manca una colonna sembra un elenco rotto.
function colsButton(view) {
  const n = colsHiddenCount(view);
  return `<button class="btn-outline${n ? ' active' : ''}" onclick="colsPickerModal('${view}')"
    title="Scegli quali colonne mostrare in questo elenco">${ico('list', 'tinted', '')} Colonne${n ? ` (${n} ${n === 1 ? 'nascosta' : 'nascoste'})` : ''}</button>`;
}
// Il pulsante vive dentro la barra dei filtri, che è HTML statico: lo si innesta
// al primo disegno della vista e lo si aggiorna a ogni cambio.
function colsMountButton(view) {
  if (typeof document === 'undefined') return;
  const host = document.getElementById('cols-btn-' + view);
  if (host) host.innerHTML = colsButton(view);
}

if (typeof document !== 'undefined') { colsLoad(); groupLoad(); }
