// ─── La barra Filtri, a scomparsa ───
//
// Ogni vista che elenca articoli aveva già la propria barra filtri: qui non
// se ne aggiunge una diversa, si dà solo un modo di **nasconderla** quando non
// serve, e di farne condividere quattro campi — famiglia, sottofamiglia,
// macchina, gruppo — con le altre viste che li usano, così scegliere "solo
// questa macchina" vale ovunque, senza riselezionarla a ogni vista.
//
// Il meccanismo è lo stesso di `columns.js`: i controlli restano quelli di
// sempre, stesso `id`, stesso `onchange` — non si ricreano mai, altrimenti
// scrivere nel campo di ricerca perderebbe il focus a ogni ridisegno. Aprire
// o chiudere la barra è una classe sul `<body>`, non un ridisegno di HTML:
// `.filt-fields{display:none} body.filt-open .filt-fields{display:flex}` (in
// style.css) e viceversa per `.filt-summary`. Qui si scrive solo lo stato (che
// nasconde cosa) e il piccolo riepilogo — le pasticche e il pulsante "Rimuovi
// filtri" — che invece va davvero ridisegnato a ogni cambio filtro.

const FILT_KEY = 'bomtrack_filters';

let filtOpen = false;   // chiusa di serie: nessun comportamento nuovo finché nessuno la apre
// Le quattro dimensioni condivise. '' = nessun vincolo, come oggi.
let filtScope = { familyId: '', subFamilyId: '', machineId: '', groupId: '' };

function filtPrefsLoad() {
  try {
    const p = JSON.parse(localStorage.getItem(FILT_KEY) || 'null');
    if (!p || typeof p !== 'object') return;
    if (typeof p.open === 'boolean') filtOpen = p.open;
    if (p.scope && typeof p.scope === 'object') Object.assign(filtScope, p.scope);
  } catch (e) { /* preferenze illeggibili: si riparte chiusi e senza vincoli */ }
}
function filtPrefsSave() {
  try { localStorage.setItem(FILT_KEY, JSON.stringify({ open: filtOpen, scope: filtScope })); }
  catch (e) { /* niente da rompere */ }
}

// Suffisso dell'id campo e chiave dello scope per ciascuna delle 4 dimensioni.
const FILT_DIM_SUFFIX = { family: 'family', subfamily: 'subfamily', machine: 'machine', group: 'group' };
const FILT_DIM_SCOPEKEY = { family: 'familyId', subfamily: 'subFamilyId', machine: 'machineId', group: 'groupId' };

// ─── Registro: i campi filtro di ogni vista, condivisi o locali ───
// `dims`: quali delle 4 dimensioni condivise questa vista sa filtrare (cioè
// per quali esiste già un `<pfx>-<dim>` nella sua barra).
// `fields`: ogni campo filtro della vista, nell'ordine in cui compare in
// barra — serve sia alle pasticche del riepilogo sia a "Rimuovi filtri".
// `refresh`: la stessa funzione che l'`onchange` di quei campi chiama già,
// per far ripartire filtro e ridisegno dopo un azzeramento.
const FILT_PANELS = {
  buy: {
    pfx: 'buy', dims: ['family', 'subfamily'], refresh: () => catalogFilterChange('buy'),
    fields: [
      { id: 'buy-search', label: 'Testo', kind: 'text' },
      { id: 'buy-type', label: 'Tipo', kind: 'select' },
      { id: 'buy-family', label: 'Famiglia', kind: 'select', dim: 'family' },
      { id: 'buy-subfamily', label: 'Sottofamiglia', kind: 'select', dim: 'subfamily' },
      { id: 'buy-fav', label: 'Solo preferiti', kind: 'toggle' },
    ],
  },
  design: {
    pfx: 'des', dims: ['family', 'subfamily', 'machine', 'group'], refresh: () => catalogFilterChange('design'),
    fields: [
      { id: 'des-search', label: 'Testo', kind: 'text' },
      { id: 'des-type', label: 'Tipo', kind: 'select' },
      { id: 'des-family', label: 'Famiglia', kind: 'select', dim: 'family' },
      { id: 'des-subfamily', label: 'Sottofamiglia', kind: 'select', dim: 'subfamily' },
      { id: 'des-machine', label: 'Macchina', kind: 'select', dim: 'machine' },
      { id: 'des-group', label: 'Gruppo', kind: 'select', dim: 'group' },
    ],
  },
  stock: {
    pfx: 'stk', dims: ['family', 'subfamily', 'machine', 'group'], refresh: () => stockFilterChange(),
    fields: [
      { id: 'stk-search', label: 'Testo', kind: 'text' },
      { id: 'stk-type', label: 'Tipo', kind: 'select' },
      { id: 'stk-family', label: 'Famiglia', kind: 'select', dim: 'family' },
      { id: 'stk-subfamily', label: 'Sottofamiglia', kind: 'select', dim: 'subfamily' },
      { id: 'stk-machine', label: 'Macchina', kind: 'select', dim: 'machine' },
      { id: 'stk-group', label: 'Gruppo', kind: 'select', dim: 'group' },
      { id: 'stk-loc', label: 'Ubicazione', kind: 'select' },
      { id: 'stk-state', label: 'Stato', kind: 'select' },
    ],
  },
  cycles: {
    pfx: 'cyc', dims: ['family', 'subfamily'], refresh: () => onCycleFilterChange(),
    fields: [
      { id: 'cyc-search', label: 'Testo', kind: 'text' },
      { id: 'cyc-family', label: 'Famiglia', kind: 'select', dim: 'family' },
      { id: 'cyc-subfamily', label: 'Sottofamiglia', kind: 'select', dim: 'subfamily' },
    ],
  },
  bom: {
    pfx: 'bom', dims: ['machine'], refresh: () => onBomFilterChange(),
    fields: [
      { id: 'bom-search', label: 'Testo', kind: 'text' },
      { id: 'bom-type', label: 'Livello', kind: 'select' },
      { id: 'bom-machine', label: 'Macchina', kind: 'select', dim: 'machine' },
    ],
  },
};
function filtPanelFor(view) { return FILT_PANELS[view] || null; }

// ─── Aprire/chiudere ───
// Una sola scelta per tutta l'app (non per vista): chi apre i filtri in
// Acquisti se li ritrova aperti passando a Magazzino. `body.filt-open` è
// l'unica cosa che cambia — tutte le viste la leggono dalla stessa regola CSS.
function filtToggle() {
  filtOpen = !filtOpen;
  filtPrefsSave();
  if (typeof document !== 'undefined') document.body.classList.toggle('filt-open', filtOpen);
  if (typeof activeView !== 'undefined') filtMount(activeView);
}

// ─── Scope condiviso ───
// Chiamata dall'onchange di un campo condiviso, PRIMA dell'handler esistente
// di quel campo (che resta intatto e fa tutto quello che faceva già). Qui si
// registra solo la scelta, per le altre viste.
function filtScopeChange(view, dim) {
  const panel = filtPanelFor(view); if (!panel || !panel.dims.includes(dim)) return;
  filtScope[FILT_DIM_SCOPEKEY[dim]] = val(panel.pfx + '-' + FILT_DIM_SUFFIX[dim]);
  filtPrefsSave();
}
// Scrive lo scope condiviso negli elementi della vista che si sta per aprire.
// Va chiamata prima del render di quella vista: il render legge questi stessi
// elementi, e le sue funzioni di sincronizzazione già validano da sole un
// valore non più coerente (una famiglia di un altro ambito, un gruppo di
// un'altra macchina) tornando vuote, come fanno oggi con qualunque valore
// rimasto da una scelta precedente.
//
// `sync` è la sincronizzazione della vista: sottofamiglia e gruppo hanno le
// opzioni della famiglia/macchina scelta, e prima che il padre sia scritto e
// le opzioni rifatte sono quelle del padre di prima — il valore non
// prenderebbe, e comparirebbe solo al ridisegno successivo, facendo saltare
// l'elenco sotto la mano. Quindi: prima i padri, poi le opzioni, poi i figli.
const FILT_DIM_FIGLI = ['subfamily', 'group'];
function filtScopeApply(view, sync) {
  const panel = filtPanelFor(view); if (!panel) return;
  const scrivi = dim => setVal(panel.pfx + '-' + FILT_DIM_SUFFIX[dim], filtScope[FILT_DIM_SCOPEKEY[dim]] || '');
  panel.dims.filter(d => !FILT_DIM_FIGLI.includes(d)).forEach(scrivi);
  if (typeof sync === 'function') sync();
  panel.dims.filter(d => FILT_DIM_FIGLI.includes(d)).forEach(scrivi);
}

// ─── Rimuovi filtri ───
// Azzera ogni campo di questa vista — condiviso o locale — e lo scope
// condiviso: la restrizione sparisce davvero, non ricompare entrando in
// un'altra vista che la stesse ancora applicando.
function filtClearAll(view) {
  const panel = filtPanelFor(view); if (!panel) return;
  panel.fields.forEach(f => {
    if (f.kind === 'toggle') {
      if (typeof favOnly !== 'undefined' && favOnly) {
        favOnly = false;
        const b = document.getElementById(f.id); if (b) b.classList.remove('active');
      }
    } else setVal(f.id, '');
  });
  filtScope = { familyId: '', subFamilyId: '', machineId: '', groupId: '' };
  filtPrefsSave();
  panel.refresh();
}

// ─── Riepilogo a barra chiusa: pasticche + pulsante "Rimuovi filtri" ───
// Letto sempre dal DOM vivo della vista, mai da `filtScope`: quest'ultimo è
// "l'ultima scelta da propagare", non necessariamente ciò che la vista aperta
// sta applicando ora (una famiglia valida altrove può non esserlo qui).
function filtActiveChips(view) {
  const panel = filtPanelFor(view); if (!panel) return [];
  return panel.fields.map(f => {
    if (f.kind === 'toggle') return (typeof favOnly !== 'undefined' && favOnly) ? f.label : null;
    const el = document.getElementById(f.id); if (!el || !el.value) return null;
    if (f.kind === 'text') return f.label + ': ' + el.value;
    // Il testo dell'opzione scelta, non il suo value interno — "Cuscinetti",
    // non un id. Se l'elemento non porta un vero elenco di <option> (un test,
    // non un browser) resta il valore grezzo: meglio una pasticca imprecisa
    // che nessuna pasticca.
    const opt = el.options && el.options[el.selectedIndex];
    return f.label + ': ' + (opt ? opt.textContent : el.value);
  }).filter(Boolean);
}
// Chiamata a fine di ogni render* delle viste in ambito: aggiorna le
// pasticche e lo stato del pulsante "Rimuovi filtri" per la vista appena
// disegnata. Non tocca mai i campi veri (`.filt-fields`), che restano gli
// stessi nodi statici di sempre.
function filtMount(view) {
  const panel = filtPanelFor(view); if (!panel) return;
  const chips = filtActiveChips(view);
  const chipsHost = document.getElementById('filt-chips-' + view);
  if (chipsHost) chipsHost.innerHTML = chips.map(c => `<span class="filt-chip">${esc(c)}</span>`).join('');
  const clearBtn = document.getElementById('filt-clear-' + view);
  if (clearBtn) clearBtn.disabled = !chips.length;
  const toggleBtn = document.getElementById('filt-toggle-' + view);
  if (toggleBtn) toggleBtn.innerHTML = filtToggleLabel();
}
function filtToggleLabel() {
  return `${ico(filtOpen ? 'chevronDown' : 'chevronRight', 'tinted', '')} Filtri`;
}

if (typeof document !== 'undefined') {
  filtPrefsLoad();
  if (document.body) document.body.classList.toggle('filt-open', filtOpen);
}
