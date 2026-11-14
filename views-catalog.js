// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-catalog.js
// ═══════════════════════════════════════════════════════════
// Anagrafiche articoli (Acquisti e Progetto) e scheda articolo. Il listino sta
// in views-listino.js e i cicli in views-cicli.js (dalla 0.141.0).
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  VISTE: ANAGRAFICHE ARTICOLI (Acquisti / Progetto)
// ═══════════════════════════════════════════════════════════
function onCatTypeChange(scope) {
  updateCatFamilyFilters(scope);
  catalogFilterChange(scope);
}
function onCatFamilyChange(scope) {
  updateCatFamilyFilters(scope);
  catalogFilterChange(scope);
}
// Ridisegna la vista di anagrafica attiva (le due condividono le funzioni di render)
function renderCatalogs() {
  if (activeView === 'buy' || activeView === 'design') renderCatalog(activeView);
  // I costi mostrati nei cicli vengono dalle stesse anagrafiche: cambiando un
  // articolo la vista aperta deve rifare i conti.
  else if (activeView === 'cycles') renderCycles();
  // Il Magazzino elenca gli stessi articoli: una rettifica di giacenza registrata
  // da lì deve aggiornare la riga senza far cambiare pagina a chi la sta facendo.
  else if (activeView === 'stock') renderStock();
  // Il listino in elenco legge le stesse quotazioni che la scheda modifica.
  else if (activeView === 'pricelist') renderPriceListView();
}
// Allinea i filtri famiglia/sottofamiglia al tipo selezionato, preservando le selezioni compatibili
function updateCatFamilyFilters(scope) {
  syncFamilyFilters(CATALOG_SCOPES[scope].pfx, CATALOG_SCOPES[scope].types);
}
// Il corpo vero, su prefisso e tipi anziché su uno scope di anagrafica: la vista
// Magazzino ha la stessa barra di filtri ma non è una delle due anagrafiche, e
// due copie della stessa logica si sarebbero disallineate alla prima modifica.
function syncFamilyFilters(pfx, types) {
  const famSel = document.getElementById(pfx + '-family');
  const subSel = document.getElementById(pfx + '-subfamily');
  const ft = document.getElementById(pfx + '-type').value;
  // Senza tipo selezionato valgono le famiglie di tutti i tipi in elenco che ne usano
  const kinds = (ft ? [ft] : types).filter(usesFamily);
  const famApplies = !!kinds.length; // gli assiemi non hanno famiglia
  famSel.disabled = !famApplies; subSel.disabled = !famApplies;
  const fams = (db.families || []).filter(f => kinds.includes(f.kind || 'acquistato'));
  const keepFam = fams.some(f => f.id === famSel.value) ? famSel.value : '';
  famSel.innerHTML = `<option value="">Tutte le famiglie</option>` +
    fams.map(f => `<option value="${f.id}" ${f.id === keepFam ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
  const f = getFamily(keepFam);
  const subs = (f && f.subs) || [];
  const keepSub = subs.some(s => s.id === subSel.value) ? subSel.value : '';
  subSel.innerHTML = `<option value="">Tutte le sottofamiglie</option>` +
    subs.map(s => `<option value="${s.id}" ${s.id === keepSub ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}
// Filtri Macchina/Gruppo di Progetto e Magazzino — Acquisti non li ha in barra
// (commerciali e materie prime non sono mai legati a una macchina), e qui
// esce subito perché gli elementi non esistono. Il gruppo si restringe alla
// macchina scelta, come la sottofamiglia si restringe alla famiglia.
function syncMachineFilters(pfx) {
  const macSel = document.getElementById(pfx + '-machine');
  const grpSel = document.getElementById(pfx + '-group');
  if (!macSel || !grpSel) return;
  const macchine = machineItems();
  const keepMac = macchine.some(m => m.id === macSel.value) ? macSel.value : '';
  macSel.innerHTML = `<option value="">Tutte le macchine</option>` +
    macchine.map(m => `<option value="${m.id}" ${m.id === keepMac ? 'selected' : ''}>${esc(m.code)} — ${esc(m.name)}</option>`).join('');
  const gruppi = keepMac ? groupItemsFor(keepMac) : (db.items || []).filter(i => i.type === 'gruppo');
  const keepGrp = gruppi.some(g => g.id === grpSel.value) ? grpSel.value : '';
  grpSel.innerHTML = `<option value="">Tutti i gruppi</option>` +
    gruppi.map(g => `<option value="${g.id}" ${g.id === keepGrp ? 'selected' : ''}>${esc(g.code)} — ${esc(g.name)}</option>`).join('');
}
// Preferiti: solo su ciò che si acquista, per ritrovare in fretta gli articoli ricorrenti
function canFavorite(type) { return type === 'acquistato' || type === 'materiale'; }
function toggleFavFilter() {
  favOnly = !favOnly;
  const b = document.getElementById('buy-fav');
  if (b) b.classList.toggle('active', favOnly);
  catalogFilterChange('buy');
}
// Badge preferito/obsoleto, mostrati in ogni selezione dell'articolo (righe picker).
function itemBadges(i) {
  if (!i) return '';
  return (i.favorite ? ' <span class="pick-fav" title="Preferito">★</span>' : '')
    + (i.obsolete ? ' <span class="obs-mark" title="Articolo obsoleto">' + ico('blocked', 'tinted') + '</span>' : '')
    + varMarca(i);
}
// Il codice scritto a mano, accanto al codice: un'eccezione voluta (0.115.0).
function codeManualMark(i) {
  if (!i || !i.codeManual) return '';
  const t = 'Codice scritto a mano' + (i.codeNote ? ': ' + i.codeNote : '');
  return ` <span class="code-man-mark" title="${esc(t)}">manuale</span>`;
}
// Variante testuale per i menu a tendina: dentro un <option> non entra né HTML
// né un’icona, quindi qui il simbolo resta un carattere.
function itemBadgesTxt(i) {
  if (!i) return '';
  return (i.favorite ? '★ ' : '') + (i.obsolete ? '⛔ ' : '') + varMarcaTxt(i);
}
// Costo di una unità, nella U.M. di gestione dell'articolo: calcolato per ciò
// che si produce, letto dal listino per ciò che si compra.
function itemUnitCost(i) {
  if (!i) return 0;
  if (isAssembly(i.type) || i.type === 'parte') return costOf(i.id).total;
  return i.type === 'acquistato' ? (i.purchasePrice || 0) : (i.unitCost || 0);
}
// La colonna «Dettaglio»: cosa c'è da sapere su quell'articolo in una riga
// sola, e cambia con il tipo. Estratta dalla riga perché la usa anche l'export.
function catalogMeta(i) {
  let meta = '';
  if (i.type === 'acquistato') { const s = getSupplier(i.supplierId); meta = s ? s.name : '—'; }
  else if (i.type === 'materiale' && priceRows(i).length) meta = '';
  else if (isAssembly(i.type)) meta = (i.components || []).length + ' comp. / ' + cicloFasi(i).length + ' fasi';
  else if (i.type === 'parte') {
    // Una parte comprata si riconosce dal fornitore, non dal suo ciclo
    meta = partSourcing(i) === 'buy'
      ? (supplierName(i.supplierId) || 'da acquistare')
      : ((distintaRighe(i).length || cicloFasi(i).length) ? cycleCountLabel(i) : '—');
  }
  else meta = '—';
  // Più quotazioni a listino: si segnala qui, è il posto dove si confrontano i costi
  const quot = hasPriceList(i) ? priceRows(i).length : 0;
  if (quot > 1) meta = (meta && meta !== '—' ? meta + ' · ' : '') + quot + ' quotazioni';
  else if (!meta) meta = '—';
  return meta;
}
// Fornitore in uso: dalla quotazione attiva se c'è, altrimenti dal campo
// sull'articolo — stessa priorità di `itemPricingSummary`, per non dire due
// cose diverse nella riga e nella scheda.
function catalogSupplierName(i) {
  if (!hasPriceList(i)) return '—';
  const riga = activePriceRow(i);
  const sid = (riga && riga.supplierId) || i.supplierId;
  return sid ? (supplierName(sid) || '—') : '—';
}
// Le celle dei campi facoltativi (colonne nascoste di serie, columns.js):
// sempre presenti nel markup — è la CSS a nasconderle — sennò non ci sarebbe
// nessuna casella da nascondere quando l'articolo non ha quel campo.
function catalogExtraCells(i) {
  return `<td class="col-subfamily" style="color:var(--text-dim)">${esc(usesFamily(i.type) && i.familyId ? (subFamilyName(i.familyId, i.subFamilyId) || '—') : '—')}</td>
    <td class="col-supplier" style="color:var(--text-dim)">${esc(catalogSupplierName(i))}</td>
    <td class="col-altuom">${esc(i.altUom || '—')}</td>
    <td class="col-altfactor" style="font-family:var(--mono)">${i.altFactor ? fmtN(i.altFactor) : '—'}</td>
    <td class="col-safety" style="font-family:var(--mono)">${i.safetyStock ? fmtN(i.safetyStock) : '—'}</td>
    <td class="col-lot" style="font-family:var(--mono)">${i.lotSize ? fmtN(i.lotSize) : '—'}</td>
    <td class="col-notes" style="color:var(--text-dim)">${esc(i.notes || '—')}</td>
    <td class="col-autore" style="color:var(--text-dim)">${esc(recordAuthorShort(i))}</td>`;
}
// Solo Progetto ospita parti: Acquisti non avrà mai queste due celle né le
// loro colonne nel registro (`COLUMNS.buy`).
function catalogDesignCells(i) {
  return `<td class="col-concept" style="color:var(--text-dim)">${esc(i.type === 'parte' ? (conceptName(i.conceptId) || '—') : '—')}</td>
    <td class="col-sourcing" style="color:var(--text-dim)">${esc(i.type === 'parte' ? (PART_SOURCING[partSourcing(i)] || '—') : '—')}</td>`;
}
function catalogRow(i, scope) {
  const unit = itemUnitCost(i);
  const meta = catalogMeta(i);
  // Indicatori a sinistra, di sola visione (i flag si impostano nella scheda articolo)
  const flags = `${i.favorite ? '<span class="pick-fav" title="Preferito">★</span>' : ''}${i.obsolete ? `<span class="obs-mark" title="Obsoleto">${ico('blocked', 'tinted')}</span>` : ''}`
    + (i.type === 'parte' && partSourcing(i) === 'buy' ? `<span class="buy-mark" title="Parte acquistata da fornitore">${ico('cart', 'tinted')}</span>` : '');
  return `<tr data-sel="${i.id}" class="${i.obsolete ? 'row-obsolete' : ''}">
    <td class="col-flags" style="width:1%;white-space:nowrap">${flags}</td>
    <td class="col-code" style="font-family:var(--mono)">${codeLink(i.id, i.code)}${codeManualMark(i)}${varMarca(i, true)}</td>
    <td class="col-name">${esc(i.name)}</td>
    <td class="col-type"><span class="bom-type-tag tt-${typeKey(i.type)}">${typeShort(i.type)}</span> ${typeLabel(i.type)}</td>
    <td class="col-family" style="color:var(--text-dim)">${esc(codingLabel(i) || familyLabel(i))}</td>
    <td class="col-uom">${esc(i.uom || '')}</td>
    <td class="col-cost" style="font-family:var(--mono)">${fmtN(unit)}</td>
    <td class="col-meta" style="color:var(--text-dim)">${esc(meta)}</td>
    ${catalogExtraCells(i)}
    ${scope === 'design' ? catalogDesignCells(i) : ''}
    <td class="row-actions" style="text-align:right;white-space:nowrap">
      ${hasPriceList(i) ? `<button class="mini-btn" title="Listino fornitori e storico prezzi" onclick="priceListModal('${i.id}')">${ico('euro', 'tinted', 'Listino fornitori e storico prezzi')}</button>` : ''}
      ${i.type === 'parte' && vistaAttiva('cycles') ? `<button class="mini-btn" title="Ciclo di lavorazione" onclick="openCycleFor('${i.id}')">${ico('wrench', 'tinted', 'Ciclo di lavorazione')}</button>` : ''}
      <button class="mini-btn" title="Apri documento" onclick="allegatoApriPrimo('${i.id}')">${ico('file', 'tinted', 'Apri documento')}</button>
      <button class="mini-btn" title="Allegati: disegni e schede tecniche" onclick="allegatiModal('${i.id}')">${ico('folder', 'tinted', 'Allegati')}${allegatiCount(i.id) ? '<span class="mini-count">' + allegatiCount(i.id) + '</span>' : ''}</button>
      <button class="mini-btn" title="Dove è usato e impatto costi" onclick="usageModal('${i.id}')">${ico('link', 'tinted', 'Dove è usato e impatto costi')}</button>
      <button class="mini-btn" title="Modifica articolo" onclick="editItemModal('${i.id}')">${ico('edit', 'tinted', 'Modifica articolo')}</button>
      <button class="mini-btn" title="Duplica" onclick="duplicateItemModal('${i.id}')">${ico('copy', 'tinted', 'Duplica')}</button>
      <button class="mini-btn danger" title="Elimina articolo" onclick="delItem('${i.id}')">${ico('trash', 'tinted', 'Elimina articolo')}</button>
    </td></tr>`;
}
// ─── Quante righe disegnare per volta ───
// Il catalogo costruisce l'HTML di tutti gli articoli filtrati in una stringa
// sola: oltre qualche centinaio di righe il ridisegno si vede. Si mostra un
// blocco per volta, con i pulsanti per allargare. Il limite riparte da capo a
// ogni cambio di filtro: chi filtra vuole vedere l'inizio del nuovo risultato.
const CATALOG_PAGE = 200;
const catalogLimit = { buy: CATALOG_PAGE, design: CATALOG_PAGE };
function catalogShowMore(scope) { catalogLimit[scope] += CATALOG_PAGE; renderCatalog(scope); }
function catalogShowAll(scope) { catalogLimit[scope] = Infinity; renderCatalog(scope); }
// Punto d'ingresso di tutti i filtri: azzera il limite e ridisegna.
function catalogFilterChange(scope) {
  catalogLimit[scope] = CATALOG_PAGE;
  renderCatalog(scope);
}
// Ricerca testuale: stesso effetto, ma dopo la pausa di digitazione.
function catalogSearchInput(scope) {
  debounced('cat-' + scope, () => catalogFilterChange(scope));
}
// ─── La griglia raggruppata, condivisa da Anagrafica e Magazzino ───
// Le due viste disegnano lo stesso oggetto: gruppi con un titolo che dice
// quanti articoli contengono, le prime N righe, e un piede che offre di vederne
// altre. Erano due copie parallele, e ogni correzione andava fatta due volte —
// il `.table-wrap` che mancava a tutte e due lo ha dimostrato, perché mancava a
// tutte e due. La seconda, prima o poi, si dimentica.
//
// Quello che le due viste hanno davvero di diverso resta fuori e si passa:
// l'intestazione, il disegno della riga, il limite corrente, i comandi del
// piede e cosa dire quando non c'è niente da mostrare.
//
// La divisione in gruppi è una preferenza (`isGrouped`, columns.js): spenta,
// le stesse righe finiscono in una tabella sola — il contratto del piede
// (quante ne mancano, "Mostra altri"/"Mostra tutti") resta identico nei due
// rami, così i chiamanti non se ne accorgono.
//
//   itemGrid({ hostId, rows, head, riga, limite, pagina, altro, tutti, vuoto, colonne })
function itemGrid(o) {
  const host = document.getElementById(o.hostId);
  if (!host) return;   // la vista non è montata
  let html, disegnati;
  if (isGrouped(o.colonne)) {
    const { groups, keys } = catalogGroups(o.rows);
    // Si riempiono i gruppi nell'ordine di visualizzazione finché c'è spazio: il
    // taglio non prende un po' da ognuno, che sarebbe un elenco di nessuno.
    let restanti = o.limite;
    disegnati = 0;
    html = keys.map(k => {
      const tutti = groups[k].items;
      const visibili = tutti.slice(0, Math.max(0, restanti));
      restanti -= visibili.length;
      disegnati += visibili.length;
      if (!visibili.length) return '';
      // Il titolo nomina sempre il totale del gruppo, anche quando ne disegna solo
      // i primi: un conteggio che mentisse lì manderebbe qualcuno a decidere
      // sulla base di un elenco tagliato senza saperlo.
      const conteggio = visibili.length < tutti.length ? `${visibili.length} di ${tutti.length}` : `${tutti.length}`;
      return `<div class="cat-group-title">${esc(k)} <span style="color:var(--text-dim);font-weight:500">(${conteggio})</span></div>
        <div class="table-wrap"><table>${o.head}<tbody>${visibili.map(o.riga).join('')}</tbody></table></div>`;
    }).join('');
  } else {
    // Divisione spenta: una tabella sola, nell'ordine che le righe già hanno.
    const visibili = o.rows.slice(0, Math.max(0, o.limite));
    disegnati = visibili.length;
    html = visibili.length ? `<div class="table-wrap"><table>${o.head}<tbody>${visibili.map(o.riga).join('')}</tbody></table></div>` : '';
  }
  const mancanti = o.rows.length - disegnati;
  const piu = mancanti > 0 ? `<div class="cat-more">
      <span>Mostrati ${disegnati} di ${o.rows.length} articoli</span>
      <button class="btn-outline" onclick="${o.altro}">Mostra altri ${Math.min(o.pagina, mancanti)}</button>
      <button class="btn-outline" onclick="${o.tutti}">Mostra tutti</button>
    </div>` : '';
  host.innerHTML = o.rows.length ? html + piu : `<div class="empty-text">${o.vuoto}</div>`;
  a11yFields(host);
  colsMountButton(o.colonne);
  colsApply();
  filtMount(o.colonne);
  // La tabella si riscrive per intero a ogni filtro: il pannello rimette
  // l'evidenza sulla riga scelta, e la lascia cadere se quella riga non c'è più.
  inspectorSync();
}
// ─── Raggruppamento delle righe ───
// Commerciali, materie prime e parti per macrofamiglia; gli altri tipi per
// categoria. Restituisce i gruppi e le loro chiavi già in ordine di
// visualizzazione. Lo usano l'anagrafica e il magazzino: la stessa lista di
// articoli deve raggrupparsi allo stesso modo ovunque la si guardi.
function catalogGroups(rows) {
  const GROUP_LABELS = { materiale: 'Materie prime', parte: 'Parti', sottogruppo: 'Sottogruppi', gruppo: 'Gruppi', macchina: 'Macchine' };
  const ORDER = { acquistato: 0, materiale: 1, parte: 2, sottogruppo: 3, gruppo: 4, macchina: 5 };
  const NO_FAMILY_LABELS = { acquistato: 'Commerciali senza famiglia', materiale: 'Materie prime senza famiglia', parte: 'Parti senza famiglia' };
  const groupKey = (i) => usesFamily(i.type)
    ? (i.familyId ? familyName(i.familyId) : NO_FAMILY_LABELS[i.type])
    : GROUP_LABELS[i.type];
  const order = (i) => ORDER[i.type] != null ? ORDER[i.type] : 9;
  const groups = {};
  rows.forEach(i => { const k = groupKey(i); (groups[k] = groups[k] || { items: [], ord: order(i) }).items.push(i); });
  const keys = Object.keys(groups).sort((a, b) => groups[a].ord - groups[b].ord || confrontaAlfa(a, b));
  return { groups, keys };
}
// Gli articoli che la vista mostra, filtrati e ordinati. Come per il magazzino
// sta fuori dal disegno: l'export deve dare esattamente queste righe, e un
// filtro scritto due volte prima o poi dice due cose diverse.
function catalogFilteredRows(scope, soloIds) {
  const sc = CATALOG_SCOPES[scope]; if (!sc) return [];
  const leggi = k => (document.getElementById(sc.pfx + '-' + k) || {}).value || '';
  const q = leggi('search').toLowerCase();
  const ft = leggi('type'), ff = leggi('family'), fsf = leggi('subfamily');
  const fm = leggi('machine'), fg = leggi('group');
  let rows = db.items.filter(i => sc.types.includes(i.type));
  if (ft) rows = rows.filter(i => i.type === ft);
  if (scope === 'buy' && favOnly) rows = rows.filter(i => i.favorite);
  if (ff) rows = rows.filter(i => usesFamily(i.type) && i.familyId === ff);
  if (fsf) rows = rows.filter(i => i.subFamilyId === fsf);
  // Acquisti non ha questi due filtri in barra: `leggi` dà sempre '' e qui non
  // scattano mai.
  if (fm) rows = rows.filter(i => i.type === 'macchina' ? i.id === fm || i.configuredFromId === fm : i.machineItemId === fm);
  if (fg) rows = rows.filter(i => i.type === 'gruppo' ? i.id === fg : i.groupItemId === fg);
  if (q) rows = rows.filter(i => (i.code + ' ' + i.name).toLowerCase().includes(q));
  // La scelta fatta a mano è un filtro come gli altri, ma applicato per ultimo:
  // esportare la selezione deve dare le righe scelte, non le righe scelte più
  // quelle che il filtro avrebbe aggiunto.
  if (soloIds && soloIds.length) rows = rows.filter(i => soloIds.includes(i.id));
  return catalogSortRows(rows, scope);
}
// ─── Ordinare l'elenco per colonna (dalla 0.128.0) ───
// Un clic sull'intestazione ordina per quella colonna, un secondo clic inverte.
// Di serie l'ordine è per codice, crescente. Il confronto è quello naturale di
// confrontaAlfa (PRT-2 prima di PRT-10), i numeri si confrontano come numeri, e
// le celle vuote vanno in fondo in tutti e due i versi: chi ordina per fornitore
// vuole vedere i fornitori, non cento righe di «—». Con la divisione per
// famiglia accesa l'ordine vale dentro ogni gruppo (catalogGroups tiene l'ordine
// delle righe). I valori sono quelli dell'export (CATALOG_EXPORT_COLS): il file
// esce nello stesso ordine dello schermo e la colonna si legge in un posto solo.
// La scelta è per vista e resta nel browser, come le colonne nascoste.
const SORT_KEY = 'bomtrack_sort';
let catalogSort = {};   // scope → { key, dir }; dir 1 crescente, -1 decrescente
function catalogSortOf(scope) {
  const s = catalogSort[scope];
  return s && CATALOG_EXPORT_COLS[s.key] && (s.dir === 1 || s.dir === -1) ? s : { key: 'code', dir: 1 };
}
function catalogSortLoad() {
  try {
    const p = JSON.parse(localStorage.getItem(SORT_KEY) || 'null');
    if (p && typeof p === 'object') catalogSort = p;
  } catch (e) { /* preferenza illeggibile: si riparte per codice */ }
}
function catalogSortSave() {
  try { localStorage.setItem(SORT_KEY, JSON.stringify(catalogSort)); } catch (e) { /* niente da rompere */ }
}
function catalogSortBy(scope, key) {
  if (!CATALOG_SCOPES[scope] || !CATALOG_EXPORT_COLS[key]) return;
  const s = catalogSortOf(scope);
  catalogSort[scope] = { key, dir: s.key === key ? -s.dir : 1 };
  catalogSortSave();
  catalogFilterChange(scope);
}
function catalogSortRows(rows, scope) {
  const { key, dir } = catalogSortOf(scope);
  const col = CATALOG_EXPORT_COLS[key];
  const vuoto = v => v == null || v === '' || (col.num && !Number(v));
  const righe = rows.map(i => ({ i, k: col.v(i) }));
  righe.sort((a, b) => {
    const va = vuoto(a.k), vb = vuoto(b.k);
    if (va !== vb) return va ? 1 : -1;
    const c = va ? 0 : col.num ? (Number(a.k) || 0) - (Number(b.k) || 0) : confrontaAlfa(a.k, b.k);
    return dir * c || confrontaAlfa(a.i.code, b.i.code);
  });
  return righe.map(r => r.i);
}
// L'intestazione cliccabile: un pulsante dentro la cella di testata, così si raggiunge da
// tastiera, e aria-sort dice a chi usa un lettore di schermo come è ordinato.
// `etichetta` è già HTML sicuro; `testo` serve al title.
function catalogTh(scope, key, etichetta, testo, title) {
  const s = catalogSortOf(scope), on = s.key === key;
  const verso = on ? (s.dir > 0 ? 'ascending' : 'descending') : 'none';
  const freccia = on ? (s.dir > 0 ? '▲' : '▼') : '';
  const aiuto = (title ? title + '. ' : '') + (on && s.dir > 0 ? 'Clic: ordina in verso decrescente' : 'Clic: ordina per ' + testo.toLowerCase());
  return `<th scope="col" class="col-${key}" aria-sort="${verso}"><button type="button" class="th-sort${on ? ' on' : ''}" onclick="catalogSortBy('${scope}','${key}')" title="${esc(aiuto)}">${etichetta}<span class="th-sort-ico" aria-hidden="true">${freccia}</span></button></th>`;
}
// Le intestazioni delle colonne facoltative, gemelle di `catalogExtraCells`/
// `catalogDesignCells`: stessa classe col-X, stesso ordine.
const CAT_EXTRA_HEAD = [['subfamily', 'Sottofamiglia'], ['supplier', 'Fornitore'], ['altuom', 'UM acquisto'],
  ['altfactor', 'Fattore'], ['safety', 'Scorta minima'], ['lot', 'Lotto'], ['notes', 'Note'], ['autore', 'Creato/aggiornato da']];
const CAT_DESIGN_HEAD = [['concept', 'Concetto'], ['sourcing', 'Approvvigionamento']];
function renderCatalog(scope) {
  invalidateCaches();
  const sc = CATALOG_SCOPES[scope]; if (!sc) return;
  updateCatFamilyFilters(scope);
  syncMachineFilters(sc.pfx);
  // Lo scope condiviso (filters.js) va scritto qui, non prima: gli elementi
  // hanno appena preso le loro <option> fresche da syncMachineFilters/
  // updateCatFamilyFilters, e un valore assegnato a un <select> senza
  // un'opzione corrispondente non prende — è per questo che l'ordine conta.
  filtScopeApply(scope, () => { updateCatFamilyFilters(scope); syncMachineFilters(sc.pfx); });
  const pfx = sc.pfx;
  const rows = catalogFilteredRows(scope);

  // «Costo un.» è per una unità dell'articolo, cioè nella U.M. della colonna
  // accanto: si dice in intestazione, una volta, invece che su ogni riga.
  const th = (k, t, title) => catalogTh(scope, k, esc(t), t, title);
  const head = `<thead><tr><th scope="col" class="col-flags"></th>${th('code', 'Codice')}${th('name', 'Descrizione')}
    ${th('type', 'Tipo')}${th('family', 'Famiglia')}${th('uom', 'U.M.')}
    ${th('cost', `Costo un. (${cur()}/U.M.)`, 'Costo di una unità, nella U.M. della colonna accanto')}
    ${th('meta', 'Dettaglio')}
    ${CAT_EXTRA_HEAD.map(([k, t]) => th(k, t)).join('')}
    ${scope === 'design' ? CAT_DESIGN_HEAD.map(([k, t]) => th(k, t)).join('') : ''}
    <th scope="col" class="row-actions"></th></tr></thead>`;
  itemGrid({
    hostId: pfx + '-table',
    rows,
    head,
    riga: i => catalogRow(i, scope),
    limite: catalogLimit[scope],
    pagina: CATALOG_PAGE,
    altro: `catalogShowMore('${scope}')`,
    tutti: `catalogShowAll('${scope}')`,
    vuoto: 'Nessun articolo trovato.',
    colonne: scope,
  });
}
// ─── Export dell'anagrafica ───
// È l'elenco che si sta guardando, non il template d'import: quello resta
// `exportCatalogXlsx` in Gestione, con tutte le colonne e i fogli di contorno.
// Sono due cose diverse e vanno tenute diverse — chi esporta da qui vuole le
// righe che ha davanti, non un file da ricaricare.
function catalogExportSpec(scope, soloIds) {
  const sc = CATALOG_SCOPES[scope] || CATALOG_SCOPES.buy;
  const leggi = k => (document.getElementById(sc.pfx + '-' + k) || {}).value || '';
  const fam = getFamily(leggi('family'));
  const sub = (fam && (fam.subs || []).find(s => s.id === leggi('subfamily'))) || null;
  const mac = getItem(leggi('machine')), grp = getItem(leggi('group'));
  // Le colonne sono quelle accese a schermo (dalla 0.105.6, vedi export-lists.js).
  const vis = listColonneVisibili(scope, CATALOG_EXPORT_COLS);
  const righe = catalogFilteredRows(scope, soloIds).map(vis.riga);
  return {
    titolo: scope === 'buy' ? 'Anagrafica — Commerciali e materie prime' : 'Anagrafica — Macchine, gruppi e parti',
    slug: scope === 'buy' ? 'anagrafica_acquisti' : 'anagrafica_progetto',
    filtri: [
      ['Ricerca', leggi('search')],
      ['Tipo', leggi('type') ? typeLabel(leggi('type')) : ''],
      ['Famiglia', fam ? fam.name : ''],
      ['Sottofamiglia', sub ? sub.name : ''],
      ['Macchina', mac ? `${mac.code} — ${mac.name}` : ''],
      ['Gruppo', grp ? `${grp.code} — ${grp.name}` : ''],
      ['Preferiti', scope === 'buy' && favOnly ? 'solo i preferiti' : ''],
      ['Selezione', soloIds && soloIds.length ? soloIds.length + ' righe scelte a mano' : ''],
    ],
    sezioni: [{
      nome: scope === 'buy' ? 'Acquisti' : 'Progetto',
      colonne: vis.colonne,
      righe,
    }],
  };
}
// Le colonne dell'anagrafica nel file, per chiave del registro (COLUMNS in
// columns.js). Un trattino a schermo è una cella vuota nel file: «—» in un
// foglio non si filtra e non si somma.
const vuotoSeTrattino = t => (t === '—' ? '' : t || '');
const CATALOG_EXPORT_COLS = {
  code: { h: 'Codice', w: 18, v: i => i.code || '' },
  name: { h: 'Descrizione', w: 34, v: i => i.name || '' },
  type: { h: 'Tipo', w: 16, v: i => typeLabel(i.type) },
  family: { h: 'Famiglia', w: 24, v: i => codingLabel(i) || familyLabel(i) },
  uom: { h: 'U.M.', w: 8, v: i => i.uom || '' },
  // La valuta sta in intestazione: nella cella romperebbe ogni formula.
  cost: { h: () => `Costo unitario (${cur()}/U.M.)`, w: 18, num: true, v: i => +(itemUnitCost(i) || 0).toFixed(4) },
  meta: { h: 'Dettaglio', w: 28, v: i => catalogMeta(i) },
  subfamily: { h: 'Sottofamiglia', w: 20, v: i => (usesFamily(i.type) && i.familyId ? subFamilyName(i.familyId, i.subFamilyId) || '' : '') },
  supplier: { h: 'Fornitore', w: 22, v: i => vuotoSeTrattino(catalogSupplierName(i)) },
  altuom: { h: 'UM acquisto', w: 10, v: i => i.altUom || '' },
  altfactor: { h: 'Fattore conversione', w: 12, num: true, v: i => Number(i.altFactor) || 0 },
  safety: { h: 'Scorta minima', w: 12, num: true, v: i => Number(i.safetyStock) || 0 },
  lot: { h: 'Lotto', w: 10, num: true, v: i => Number(i.lotSize) || 0 },
  notes: { h: 'Note', w: 30, v: i => i.notes || '' },
  autore: { h: 'Creato/aggiornato da', w: 24, v: i => recordAuthorShort(i) },
  concept: { h: 'Concetto', w: 20, v: i => (i.type === 'parte' ? conceptName(i.conceptId) || '' : '') },
  sourcing: { h: 'Approvvigionamento', w: 16, v: i => (i.type === 'parte' ? PART_SOURCING[partSourcingScritto(i)] || '' : '') },
};
// Etichette del menu "Tipo" (l'elenco è ristretto ai tipi della vista di provenienza)
const TYPE_OPTION_LABELS = {
  acquistato: 'Componente commerciale', materiale: 'Materia prima', parte: 'Parte (lavorato)',
  sottogruppo: 'Sottogruppo', gruppo: 'Gruppo', macchina: 'Macchina',
};
// Riepilogo in sola lettura di fornitore e prezzo dentro la scheda articolo.
// Non sono campi: fornitore, prezzo, codice e descrizione presso il fornitore
// nascono tutti nel listino, e il listino è l'unico posto che li scrive. Con due
// porte sullo stesso dato lo storico dei prezzi resterebbe pieno di buchi.
function itemPricingSummary(it) {
  const apri = it
    ? `<button class="btn-outline" style="margin-left:8px" onclick="closeModal();priceListModal('${it.id}')">${ico('euro', 'tinted', '')} Apri il listino</button>`
    : '';
  if (!it) return `<span class="empty-text" style="padding:0">Fornitore e prezzo si inseriscono nel <strong>listino fornitori</strong>, che si apre da solo appena l'articolo è creato.</span>`;
  const campo = costField(it);
  const riga = activePriceRow(it);
  const n = priceRows(it).length;
  const prezzo = campo
    ? `<strong style="font-family:var(--mono)">${fmtPer(Number(it[campo]) || 0, itemUom(it) || 'U.M.')}</strong>`
    : '<em>derivato dal ciclo di lavorazione</em>';
  const forn = riga && riga.supplierId
    ? esc(supplierName(riga.supplierId) || '—')
    : (it.supplierId ? esc(supplierName(it.supplierId) || '—') : '<span style="color:var(--text-dim)">nessun fornitore</span>');
  // Dalla quotazione in uso, non dalla copia sull'articolo: un posto solo.
  const rif = riga ? [riga.code, riga.desc].filter(Boolean).map(esc).join(' · ') : '';
  return `<span class="empty-text" style="padding:0">
    ${prezzo} · ${forn}${rif ? ' · ' + rif : ''}<br>
    ${n ? `${n} ${n === 1 ? 'quotazione a listino' : 'quotazioni a listino'}${riga ? '' : ' — nessuna in uso'}` : 'Nessuna quotazione a listino'}${apri}</span>`;
}
// Vero se l'articolo è già usato in un qualunque ambito (distinte, cicli,
// magazzino, documenti, piani, revisioni): oltre quel punto i campi che ne
// determinano identità e codifica smettono di essere modificabili, per non
// disallineare in silenzio ciò che lo referenzia già. `admin` fa eccezione
// solo per nome/concetto/descrizione, mai per codice/famiglia/codifica.
function itemLockState(it) {
  const used = !!it && isItemUsedAnywhere(it.id);
  // Una macchina generata da un modello (varianti.js) eredita tutta la
  // codifica: codice, famiglia, sigla e schema si cambiano sul modello.
  const ereditata = !!it && !!it.configuredFromId;
  return { used, ereditata, structLocked: used || ereditata, nameLocked: used && !isAdmin() };
}
function itemLockNote(lock) {
  if (lock.ereditata) return `<p class="empty-text" style="text-align:left;padding:0 0 10px">${ico('lock', 'tinted', '')} Variante generata da un modello: codice e codifica (famiglia, sigla macchina, schema dei codici) sono quelli del modello e si cambiano lì.</p>`;
  if (!lock.used) return '';
  const extra = lock.nameLocked ? '' : ' Come amministratore puoi comunque correggere nome/concetto/descrizione.';
  return `<p class="empty-text" style="text-align:left;padding:0 0 10px">${ico('lock', 'tinted', '')} Articolo già utilizzato: i campi identificativi non sono più modificabili.${extra}</p>`;
}
// ── Dati tecnici nella scheda di modifica (dalla 0.138.0) ──
// [campo dell'articolo, id dell'input, numerico]
// Dalla 0.139.0 anche il peso lordo, il codice a barre e il riferimento disegno.
const ITEM_TECH_FIELDS = [
  ['lengthM', 'it-len', true], ['widthM', 'it-wid', true], ['heightM', 'it-hei', true],
  ['weightKg', 'it-weight', true], ['grossWeightKg', 'it-grossweight', true], ['volumeM3', 'it-volume', true],
  ['manufacturer', 'it-mfr', false], ['manufacturerCode', 'it-mfrcode', false],
  ['material', 'it-material', false], ['finish', 'it-finish', false], ['treatment', 'it-treatment', false],
  ['drawingRef', 'it-drawing', false], ['barcode', 'it-barcode', false],
];
// Su quali tipi vale ciascun campo: il produttore su ciò che si compra già
// fatto, materiale, finitura e trattamento sulle parti, il disegno su ciò che
// si progetta, il codice a barre su ciò che sta a scaffale. Misure e pesi
// valgono per tutti. Una regola sola per la scheda, la lettura e l'import.
function itemTechCampoVale(k, t) {
  if (k === 'manufacturer' || k === 'manufacturerCode') return t === 'acquistato' || t === 'materiale';
  if (k === 'material' || k === 'finish' || k === 'treatment') return t === 'parte';
  if (k === 'drawingRef') return t === 'parte' || isAssembly(t);
  if (k === 'barcode') return hasStock({ type: t });
  return true;
}
// I valori già scritti su altri articoli, per scrivere «S235JR» sempre allo stesso modo.
function itemTechValori(k) {
  const set = new Set();
  (db.items || []).forEach(i => { const v = String(i[k] || '').trim(); if (v) set.add(v); });
  return [...set].sort((a, b) => a.localeCompare(b, 'it'));
}
function itemTechVal(it, k) { return it && it[k] != null ? esc(String(it[k])) : ''; }
function itemTechNum(it, id, k, label, ph) {
  return `<div class="modal-field"><label>${label}</label>
        <input type="number" id="${id}" min="0" step="any" value="${itemTechVal(it, k)}" placeholder="${ph || ''}" oninput="itemTechVolumeHint()"></div>`;
}
function itemTechTxt(it, id, k, label, ph, elenco) {
  return `<div class="modal-field"><label>${label}</label>
        <input id="${id}" ${elenco ? `list="${id}-list"` : ''} autocomplete="off" maxlength="80" value="${itemTechVal(it, k)}" placeholder="${ph || ''}">
        ${elenco ? `<datalist id="${id}-list">${itemTechValori(k).map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : ''}</div>`;
}
// La parte «Dati fisici», produttore, materiale e disegno della sottoscheda Tecnico.
function itemTechFieldsHtml(it) {
  const vol = itemVolume(it);
  const v = k => itemTechVal(it, k);
  // Le tre misure stanno in un campo solo, «L × P × H»: tre etichette lunghe
  // in fila non ci stanno su un telefono, e le misure si leggono insieme.
  const dim = (id, k, lettera, nome) => `<input type="number" id="${id}" min="0" step="any" value="${v(k)}" placeholder="${lettera}" aria-label="${nome} (m)" title="${nome} (m)" oninput="itemTechVolumeHint()">`;
  return `<div class="it-sec">Dati fisici</div>
    <div id="fld-tech">
      <div class="modal-grid modal-grid-3">
        ${itemTechNum(it, 'it-weight', 'weightKg', 'Peso netto (kg)', it && isAssembly(it.type) ? 'dalla distinta' : '')}
        ${itemTechNum(it, 'it-grossweight', 'grossWeightKg', 'Peso lordo (kg)', 'con imballo')}
        ${itemTechNum(it, 'it-volume', 'volumeM3', 'Volume (m³)', vol && vol.calcolato ? fmtTech(vol.value) : 'L × P × H')}
      </div>
      <div class="modal-field"><label for="it-len">Dimensioni L × P × H (m)</label>
        <div class="dim3">
          ${dim('it-len', 'lengthM', 'L', 'Lunghezza')}
          ${dim('it-wid', 'widthM', 'P', 'Larghezza')}
          ${dim('it-hei', 'heightM', 'H', 'Altezza')}
        </div></div>
      <p class="empty-text it-hint">${it && isAssembly(it.type)
        ? 'Il peso netto lasciato vuoto è la somma della distinta; si scrive quando la macchina è stata pesata.'
        : 'Il volume lasciato vuoto è il prodotto delle tre dimensioni; si scrive a mano quando non lo è (sfuso, forme irregolari).'}</p>
    </div>
    <div id="fld-mfr">
      <div class="it-sec">Produttore</div>
      <div class="modal-grid">
        ${itemTechTxt(it, 'it-mfr', 'manufacturer', 'Produttore', 'es. SKF', true)}
        ${itemTechTxt(it, 'it-mfrcode', 'manufacturerCode', 'Codice produttore', 'es. 6204-2RSH', true)}
      </div>
      <p class="empty-text it-hint">Chi lo fabbrica, distinto dal fornitore che lo vende: fornitore, prezzo e codice del fornitore restano nel listino.</p>
    </div>
    <div id="fld-matfin">
      <div class="it-sec">Materiale</div>
      <div class="modal-grid modal-grid-3">
        ${itemTechTxt(it, 'it-material', 'material', 'Materiale', 'es. S235JR', true)}
        ${itemTechTxt(it, 'it-finish', 'finish', 'Finitura', 'es. Ra 1,6', true)}
        ${itemTechTxt(it, 'it-treatment', 'treatment', 'Trattamento', 'es. zincatura', true)}
      </div>
    </div>
    <div class="modal-grid" id="fld-drawing">
      ${itemTechTxt(it, 'it-drawing', 'drawingRef', 'Riferimento disegno', 'es. DIS-0412', false)}
      ${it && it.id && hasRevisions(it) ? `<div class="modal-field"><label>Revisione del codice</label><span id="it-coderev" class="empty-text" style="padding:0;text-align:left">${codeRevCampoHtml(it)}</span></div>` : ''}
    </div>`;
}
// Un numero tecnico in italiano, senza zeri inutili.
function fmtTech(n) { return n == null ? '' : String(+Number(n).toFixed(6)).replace('.', ','); }
// Il volume vuoto suggerisce il prodotto delle dimensioni mentre si scrivono.
function itemTechVolumeHint() {
  const el = document.getElementById('it-volume'); if (!el) return;
  const vol = itemVolume({ lengthM: val('it-len'), widthM: val('it-wid'), heightM: val('it-hei') });
  el.placeholder = vol ? fmtTech(vol.value) : 'L × P × H';
}
function readItemTechFields(it) {
  ITEM_TECH_FIELDS.forEach(([k, id, isNum]) => {
    if (!document.getElementById(id) || !itemTechCampoVale(k, it.type)) return;
    const raw = String(val(id) == null ? '' : val(id)).trim();
    if (isNum) {
      const n = raw === '' ? null : numTecnico(parseFloat(raw.replace(',', '.')));
      if (n == null) delete it[k]; else it[k] = n;
    } else if (raw) it[k] = raw; else delete it[k];
  });
}
// Un codice a barre identifica un prodotto solo: lo stesso EAN su due articoli
// farebbe trovare quello sbagliato a chi lo legge in magazzino.
function barcodeErr(id, type) {
  if (!itemTechCampoVale('barcode', type)) return null;
  const b = String(val('it-barcode') || '').trim();
  if (!b) return null;
  const altro = (db.items || []).find(i => i.id !== id && String(i.barcode || '').trim() === b);
  return altro ? `Codice a barre già usato da ${altro.code}` : null;
}

// ─── Le sottoschede della scheda articolo (dalla 0.139.0) ───
// I campi sono tanti e di argomenti diversi: in una colonna sola la scorta
// minima stava sotto la codifica della macchina, e i dati tecnici in fondo a
// tutto. Ogni sottoscheda tiene un argomento. Tutti i campi restano nel DOM
// anche quando la loro sottoscheda è nascosta: lettura, duplicazione e
// controlli non sanno niente delle sottoschede.
const ITEM_TABS = [
  { k: 'ana', label: 'Anagrafica', icon: 'tag', sub: 'Chi è l\'articolo: codice, descrizione, classificazione e stato.' },
  { k: 'acq', label: 'Acquisto', icon: 'cart', sub: 'Da chi si compra e come si quota. Fornitore e prezzo stanno nel listino.' },
  { k: 'mag', label: 'Magazzino', icon: 'package', sub: 'Quanto ce n\'è, come si tiene a scaffale e quando si riordina.' },
  { k: 'tec', label: 'Tecnico', icon: 'ruler', sub: 'Come è fatto: dati fisici, produttore, materiale, distinta e ciclo.' },
];
// Le sottoschede di un tipo: un assieme non si compra e non sta a scaffale.
function itemTabsFor(t) {
  return ITEM_TABS.map(x => x.k).filter(k =>
    k === 'acq' ? hasPriceList({ type: t })
      : k === 'mag' ? hasStock({ type: t }) && giacenzeVisibili()
        : true);
}
let itemTabCorrente = 'ana';
function itemTab(k) {
  const tipo = document.getElementById('it-type');
  const ammesse = itemTabsFor(tipo ? tipo.value : '');
  if (!ammesse.includes(k)) k = 'ana';
  itemTabCorrente = k;
  ITEM_TABS.forEach(x => {
    const pane = document.getElementById('it-tab-' + x.k);
    const btn = document.getElementById('it-tabbtn-' + x.k);
    const on = x.k === k;
    if (pane) pane.style.display = on ? '' : 'none';
    if (btn) {
      btn.style.display = ammesse.includes(x.k) ? '' : 'none';
      btn.className = 'it-tabbtn' + (on ? ' on' : '');
      if (btn.setAttribute) { btn.setAttribute('aria-selected', on ? 'true' : 'false'); btn.setAttribute('tabindex', on ? '0' : '-1'); }
    }
  });
}
// Frecce su e giù (o sinistra e destra al telefono) fra le sottoschede, come
// in ogni gruppo di schede: Tab porta direttamente ai campi.
function itemTabKey(ev) {
  const avanti = ev.key === 'ArrowDown' || ev.key === 'ArrowRight';
  const indietro = ev.key === 'ArrowUp' || ev.key === 'ArrowLeft';
  if (!avanti && !indietro) return;
  ev.preventDefault();
  const tipo = document.getElementById('it-type');
  const ammesse = itemTabsFor(tipo ? tipo.value : '');
  const i = ammesse.indexOf(itemTabCorrente);
  const k = ammesse[(i + (avanti ? 1 : -1) + ammesse.length) % ammesse.length];
  itemTab(k);
  const b = document.getElementById('it-tabbtn-' + k);
  if (b && b.focus) b.focus();
}
// Un errore al salvataggio porta alla sottoscheda del campo sbagliato:
// l'avviso da solo parlerebbe di un campo che non si vede.
function itemFormErr(msg, tab) {
  itemTab(tab || 'ana');
  showToast(msg, 'error');
}
function itemTabsHtml(panes) {
  const nav = ITEM_TABS.map(x => `<button type="button" role="tab" id="it-tabbtn-${x.k}" class="it-tabbtn${x.k === 'ana' ? ' on' : ''}"
      aria-controls="it-tab-${x.k}" aria-selected="${x.k === 'ana'}" tabindex="${x.k === 'ana' ? 0 : -1}"
      onclick="itemTab('${x.k}')" onkeydown="itemTabKey(event)">${ico(x.icon, 'tinted', '')}<span>${x.label}</span></button>`).join('');
  const corpo = ITEM_TABS.map(x => `<section class="it-pane" id="it-tab-${x.k}" role="tabpanel" aria-labelledby="it-tabbtn-${x.k}"${x.k === 'ana' ? '' : ' style="display:none"'}>
      <h4 class="it-pane-title">${x.label}</h4><p class="it-pane-sub">${x.sub}</p>
      ${panes[x.k] || ''}
    </section>`).join('');
  return `<div class="it-tabs"><nav class="it-nav" role="tablist" aria-label="Sezioni della scheda articolo" aria-orientation="vertical">${nav}</nav><div class="it-panes">${corpo}</div></div>`;
}
function itemModalBody(it, scope) {
  const sc = CATALOG_SCOPES[scope] || CATALOG_SCOPES.buy;
  const t = it ? it.type : sc.types[0];
  const lock = itemLockState(it);
  const dis = cond => cond ? 'disabled' : '';
  const uomCorrente = it ? (it.uom || defaultUom()) : defaultUom();
  // «Parti da» riempie tutte le sottoschede: sta sopra, fuori da tutte.
  const sourcePicker = it ? '' : `
    <div class="modal-field"><label>Parti da (opzionale)</label>
      <input type="text" id="src-search" class="search" placeholder="Duplica da un articolo esistente..." oninput="debounced('src', renderSourceResults)" autocomplete="off">
      <div id="src-results" class="picker-results"></div>
    </div>`;
  // In modifica il tipo è bloccato: resta l'unica voce dell'articolo, qualunque sia lo scope
  const types = it ? [it.type] : sc.types;
  const ana = `${itemLockNote(lock)}
    <div class="modal-grid">
      <div class="modal-field"><label>Tipo</label>
        <select id="it-type" onchange="toggleItemFields()" ${it ? 'disabled' : ''}>
          ${types.map(x => `<option value="${x}" ${t === x ? 'selected' : ''}>${TYPE_OPTION_LABELS[x]}</option>`).join('')}
        </select>
      </div>
      ${itemCodeFieldHtml(it, lock)}
    </div>
    ${itemCodeNoteHtml(it, lock)}
    <div class="modal-field" id="fld-name-std"><label>Descrizione</label><input id="it-name" value="${it ? esc(it.name) : ''}" ${dis(lock.nameLocked)}></div>
    <div class="modal-grid" id="fld-name-parte">
      <div class="modal-field"><label>Concetto</label>
        <select id="it-concept" onchange="updatePartNamePreview()" ${dis(lock.nameLocked)}>${conceptOptions(it ? it.conceptId : '')}</select></div>
      <div class="modal-field"><label>Descrizione</label>
        <input id="it-namefree" value="${it ? esc(it.nameFree != null ? it.nameFree : it.name) : ''}" oninput="updatePartNamePreview()" ${dis(lock.nameLocked)}></div>
      <div class="modal-field" style="grid-column:1/-1;margin-top:-4px">
        <span class="empty-text" style="padding:0">Descrizione: <strong id="part-name-preview"></strong></span></div>
    </div>
    <div class="modal-grid">
      <div class="modal-field"><label>Unità di misura</label><select id="it-uom" onchange="itemUomLabelsRefresh()" ${dis(lock.structLocked)} title="${lock.structLocked ? 'Articolo già usato: cambiare l\'unità reinterpreterebbe giacenza, distinte e costi' : ''}">${uomOptions(uomCorrente)}</select></div>
    </div>
    <div id="fld-family">
      <div class="it-sec">Classificazione</div>
      <div class="modal-grid">
        <div class="modal-field"><label>Macrofamiglia</label><select id="it-family" onchange="onItemFamilyChange()" ${dis(lock.structLocked)}>${familyOptions(it ? it.familyId : '', usesFamily(t) ? t : '')}</select></div>
        <div class="modal-field"><label>Sottofamiglia</label><select id="it-subfamily" onchange="onItemSubFamilyChange()" ${dis(lock.structLocked)}>${subFamilyOptions(it ? it.familyId : '', it ? it.subFamilyId : '')}</select></div>
      </div>
    </div>
    <div class="it-sec" id="sec-coding">Codifica</div>
    ${codingFieldsHtml(it, lock.structLocked)}
    <div class="it-sec">Stato e note</div>
    <div class="modal-grid" id="fld-flags">
      <div class="modal-field" id="fld-flag-fav"><label>Preferito</label>
        <label class="flag-check"><input type="checkbox" id="it-favorite" ${it && it.favorite ? 'checked' : ''}> ★ Segna come preferito</label></div>
      <div class="modal-field" id="fld-flag-obs"><label>Obsoleto</label>
        <label class="flag-check"><input type="checkbox" id="it-obsolete" ${it && it.obsolete ? 'checked' : ''}> ${ico('blocked', 'tinted')} Articolo obsoleto (non più utilizzabile)</label></div>
    </div>
    <div class="modal-field"><label>Note</label><textarea id="it-notes" rows="2">${it ? esc(it.notes || '') : ''}</textarea></div>`;
  const acq = `<div class="modal-field" id="fld-pricing">
      <label>Fornitore e prezzo d'acquisto</label>
      ${itemPricingSummary(it)}
    </div>
    <div id="fld-altuom">
      <div class="it-sec">Unità d'acquisto</div>
      <div class="modal-grid">
        <div class="modal-field"><label>U.M. d'acquisto (se diversa)</label>
          <select id="it-altuom" onchange="itemUomLabelsRefresh()">${uomOptions(it ? (it.altUom || '') : '')}</select></div>
        <div class="modal-field"><label id="it-altfactor-label">${altFactorLabel(it ? (it.altUom || '') : '', uomCorrente)}</label>
          <input type="number" id="it-altfactor" min="0" step="any" value="${it && it.altFactor != null ? it.altFactor : ''}" placeholder="es. 8"></div>
      </div>
      <p class="empty-text it-hint">Da usare quando il fornitore quota in un'unità diversa da quella con cui l'articolo si gestisce e si mette in distinta. Il fattore dice <strong>quante unità d'acquisto stanno in una di gestione</strong>: una barra gestita in <span style="font-family:var(--mono)">m</span> che pesa 8 kg al metro ha U.M. d'acquisto <span style="font-family:var(--mono)">kg</span> e fattore <span style="font-family:var(--mono)">8</span>.<br>Serve a non sbagliare il costo: senza, un prezzo a chilo finirebbe nella costificazione come se fosse al metro. Lasciare vuoto se le due unità coincidono.</p>
    </div>`;
  const mag = `${it ? stockPanelHtml(it) : ''}
    <div id="fld-stock">
      <div class="it-sec">Scorta e riordino</div>
      <div class="modal-grid">
        <div class="modal-field"><label id="it-safety-label">${labelUom('Scorta minima', uomCorrente)}</label>
          <input type="number" id="it-safety" min="0" step="any" value="${it && it.safetyStock != null ? it.safetyStock : ''}" placeholder="0"></div>
        <div class="modal-field"><label id="it-lot-label">${labelUom('Lotto di riordino', uomCorrente)}</label>
          <input type="number" id="it-lot" min="0" step="any" value="${it && it.lotSize != null ? it.lotSize : ''}" placeholder="nessuno"></div>
        <div class="modal-field"><label>Il lotto è</label>
          <select id="it-lotmode">
            <option value="multiple" ${(!it || it.lotMode !== 'min') ? 'selected' : ''}>un multiplo esatto (6, 12, 18…)</option>
            <option value="min" ${(it && it.lotMode === 'min') ? 'selected' : ''}>una quantità minima (poi libera)</option>
          </select></div>
        <div class="modal-field"><label>Ubicazione a scaffale</label>
          <input id="it-loc" list="it-loc-list" autocomplete="off" maxlength="40" value="${esc(it ? ubicazioneOf(it) : '')}" placeholder="es. A-03-2">
          <datalist id="it-loc-list">${ubicazioniElenco().map(u => `<option value="${esc(u)}">`).join('')}</datalist></div>
      </div>
      <p class="empty-text it-hint">La <strong>scorta minima</strong> è la quantità che il fabbisogno netto vuole lasciare a magazzino dopo aver coperto il piano. Il <strong>lotto di riordino</strong> arrotonda per eccesso quanto si compra — vuoto: nessun arrotondamento; <strong>multiplo esatto</strong>: si compra solo a passi del lotto, come una barra da 6 m che non si taglia; <strong>quantità minima</strong>: sotto soglia si arrotonda al minimo, sopra si compra esattamente quanto serve.</p>
      <div class="modal-grid" id="fld-barcode">
        ${itemTechTxt(it, 'it-barcode', 'barcode', 'Codice a barre / EAN', 'es. 8012345678901', false)}
      </div>
      ${typeof qcItemCampiHtml === 'function' ? qcItemCampiHtml(it) : ''}
    </div>`;
  const tec = `<div class="modal-field" id="fld-sourcing"><label>Approvvigionamento</label>
      <select id="it-sourcing">${partSourcingOptions(it ? partSourcingScritto(it) : defaultPartSourcing())}</select></div>
    <div class="modal-field" id="fld-assembly-note"><label>Composizione</label><span class="empty-text" style="padding:0">La distinta (componenti e lavorazioni) si gestisce in <strong>Tecnico → Gestione DB</strong>.</span></div>
    <div class="modal-field" id="fld-cycle">
      <label>Distinta e ciclo di lavorazione</label>
      <span class="empty-text" style="padding:0">${it
        ? `${cycleCountLabel(it)} — la distinta si gestisce in <strong>${ico('tree', 'tinted')} Gestione DB</strong>, il ciclo in <strong>${ico('wrench', 'tinted')} Cicli di lavorazione</strong>.
           <button class="btn-outline" style="margin-left:8px" onclick="closeModal();openBomFor('${it.id}')">${ico('tree', 'tinted', '')} Apri la distinta</button>
           <button class="btn-outline" style="margin-left:8px" onclick="closeModal();openCycleFor('${it.id}')">${ico('wrench', 'tinted', '')} Apri il ciclo</button>`
        : `La distinta si gestisce in <strong>${ico('tree', 'tinted')} Gestione DB</strong> e il ciclo in <strong>${ico('wrench', 'tinted')} Cicli di lavorazione</strong>, dopo aver creato l'articolo.`}</span>
    </div>
    ${itemTechFieldsHtml(it)}`;
  return `${sourcePicker}${itemTabsHtml({ ana, acq, mag, tec })}
    ${stampLine(it)}`;
}
// ─── Le etichette che seguono l'unità di misura ───
// Scorta minima e lotto di riordino sono quantità dell'articolo, e il fattore di
// conversione è un rapporto fra due unità: scriverli senza unità lascia decidere
// a chi compila, che tira a indovinare e sbaglia di un fattore. L'unità però si
// sceglie **dentro lo stesso form**, qualche riga più su, quindi le etichette la
// inseguono a ogni cambio invece di essere fissate al primo disegno.
function altFactorLabel(altUom, uom) {
  return altUom && altUom !== uom
    ? `Fattore di conversione (${esc(altUom)} in 1 ${esc(uom || 'U.M.')})`
    : 'Fattore di conversione';
}
function itemUomLabelsRefresh() {
  const u = val('it-uom') || defaultUom();
  const set = (id, testo) => { const el = document.getElementById(id); if (el) el.textContent = testo; };
  // textContent: l'unità arriva da un <select> di codici già validati, e passarla
  // come testo evita di doverla riescapare a mano.
  set('it-safety-label', `Scorta minima${u ? ' (' + u + ')' : ''}`);
  set('it-lot-label', `Lotto di riordino${u ? ' (' + u + ')' : ''}`);
  const alt = val('it-altuom');
  set('it-altfactor-label', alt && alt !== u ? `Fattore di conversione (${alt} in 1 ${u || 'U.M.'})` : 'Fattore di conversione');
}

// ─── Campi di codifica (macchina › gruppo) nella modale articolo ───
function machineOptions(selectedId) {
  return `<option value="">—</option>` + machineItems()
    .map(m => `<option value="${m.id}" ${m.id === selectedId ? 'selected' : ''}>${esc((m.sigla ? m.sigla + ' — ' : '') + m.name)}</option>`).join('');
}
function groupOptions(machineId, selectedId) {
  return `<option value="">—</option>` + groupItemsFor(machineId)
    .map(g => `<option value="${g.id}" ${g.id === selectedId ? 'selected' : ''}>${esc((g.sigla ? g.sigla + ' — ' : '') + g.name)}</option>`).join('');
}
function codingFieldsHtml(it, structLocked) {
  const sm = machineScheme(it);
  const macId = it ? (it.machineItemId || '') : '';
  const grpId = it ? (it.groupItemId || '') : '';
  const gsm = machineScheme(getItem(macId));
  const dis = structLocked ? 'disabled' : '';
  return `
    <div id="fld-coding-mac" class="modal-grid">
      <div class="modal-field"><label>Sigla macchina</label>
        <input id="it-sigla-mac" maxlength="10" value="${it ? esc(it.sigla || '') : ''}" placeholder="es. TRN"
          style="text-transform:uppercase;font-family:var(--mono);font-weight:700"
          oninput="this.value=this.value.toUpperCase();refreshItemCode()" ${dis}></div>
      <div class="modal-field"><label>N° car. sigla gruppo</label>
        <input type="number" id="it-glen" min="1" max="10" value="${sm.gLen}" onchange="refreshItemCode()" ${dis}></div>
      <div class="modal-field"><label>Tipo car. sigla gruppo</label>
        <select id="it-gtype" onchange="refreshItemCode()" ${dis}>${typeOptionsHtml(sm.gType)}</select></div>
      <div class="modal-field"><label>Cifre progressivo S## </label>
        <input type="number" id="it-incrs" min="1" max="6" value="${sm.incrS}" onchange="refreshItemCode()" ${dis}></div>
      <div class="modal-field"><label>Cifre numerazione ###</label>
        <input type="number" id="it-incrn" min="1" max="6" value="${sm.incrN}" onchange="refreshItemCode()" ${dis}></div>
    </div>
    <div id="fld-coding-child" class="modal-grid">
      <div class="modal-field"><label>Macchina</label>
        <select id="it-machine" onchange="onItemMachineChange()" ${dis}>${machineOptions(macId)}</select></div>
      <div class="modal-field" id="fld-coding-gsigla"><label id="it-sigla-grp-label">Sigla gruppo (${typeHint(gsm.gLen, gsm.gType)})</label>
        <input id="it-sigla-grp" maxlength="${gsm.gLen}" value="${it && it.type === 'gruppo' ? esc(it.sigla || '') : ''}" placeholder="es. BAS"
          style="text-transform:uppercase;font-family:var(--mono);font-weight:700"
          oninput="this.value=this.value.toUpperCase();refreshItemCode()" ${dis}></div>
      <div class="modal-field" id="fld-coding-group"><label>Gruppo</label>
        <select id="it-group" onchange="refreshItemCode()" ${dis}>${groupOptions(macId, grpId)}</select></div>
    </div>
    <div id="code-preview" class="code-preview" style="display:none" aria-live="polite"></div>`;
}
// Il riquadro «Anteprima codici» di macchine e gruppi: che codici avranno i
// figli con le scelte di adesso. Si ridisegna a ogni cambio della codifica.
function renderCodePreview() {
  const box = document.getElementById('code-preview');
  if (!box) return;
  // Una variante generata non ha figli suoi: i gruppi stanno sul modello.
  const gen = getItem(window.__editingItemId);
  const a = gen && gen.configuredFromId ? null : anteprimaCodiciFigli(itemDraftFromForm(), val('it-code'));
  if (!a) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = '';
  const righe = a.righe.map(r => `<div class="code-preview-row">
      <span class="code-preview-tipo">${esc(r.tipo)}</span>
      <span class="code-preview-code">${esc(r.codice)}</span>
      <span class="code-preview-nota">${esc(r.nota || '')}</span></div>`).join('');
  const avvisi = a.avvisi.map(t => `<p class="code-preview-avviso">${ico('warning', 'tinted', '')} ${esc(t)}</p>`).join('');
  box.innerHTML = `<div class="code-preview-title">${ico('eye', 'tinted', '')} Anteprima codici</div>${righe ? `<div class="code-preview-grid">${righe}</div>` : ''}${avvisi}`;
}
function onItemMachineChange() {
  const macId = val('it-machine');
  const gsm = machineScheme(getItem(macId));
  const lbl = document.getElementById('it-sigla-grp-label');
  const inp = document.getElementById('it-sigla-grp');
  if (lbl) lbl.textContent = `Sigla gruppo (${typeHint(gsm.gLen, gsm.gType)})`;
  if (inp) inp.maxLength = gsm.gLen;
  const grpSel = document.getElementById('it-group');
  if (grpSel) grpSel.innerHTML = groupOptions(macId, '');
  refreshItemCode();
}
// Bozza dell'articolo con i soli campi che determinano il codice automatico
function itemDraftFromForm() {
  const t = val('it-type');
  const draft = { id: window.__editingItemId || null, type: t, familyId: val('it-family'), subFamilyId: val('it-subfamily') };
  if (t === 'macchina') {
    draft.sigla = val('it-sigla-mac');
    draft.gCodeLen = parseInt(val('it-glen'), 10) || 3;
    draft.gCodeType = val('it-gtype') || 'alpha';
    draft.incrDigitsS = parseInt(val('it-incrs'), 10) || 2;
    draft.incrDigitsN = parseInt(val('it-incrn'), 10) || 3;
  } else if (t === 'gruppo') {
    draft.machineItemId = val('it-machine');
    draft.sigla = val('it-sigla-grp');
  } else if (t === 'sottogruppo' || t === 'parte') {
    draft.machineItemId = val('it-machine');
    draft.groupItemId = val('it-group');
  }
  return draft;
}
// Stato: true finché il codice è "automatico", cioè composto dalle scelte.
// Diventa false solo con la spunta «Manuale» confermata (dalla 0.115.0):
// prima bastava un tasto nel campo, e un codice cambiato per sbaglio non si
// distingueva più da uno voluto.
let itemCodeAuto = true;
function refreshItemCode() {
  const codeEl = document.getElementById('it-code');
  if (codeEl && itemCodeAuto) codeEl.value = itemCodeAutomatico();
  renderCodePreview();
}
// Il codice automatico della scheda. In modifica l'articolo tiene il suo,
// finché è ancora coerente con le scelte: rigenerarlo darebbe il numero
// successivo, non il suo.
function itemCodeAutomatico() {
  const d = itemDraftFromForm();
  const it = d.id ? getItem(d.id) : null;
  if (it && it.code && !codiceFuoriSchema(Object.assign({}, d, { code: it.code }))) return it.code;
  return genItemCodeUI(d);
}
// Il campo Codice: si legge e basta, finché non si spunta «Manuale».
function itemCodeFieldHtml(it, lock) {
  const man = !!(it && it.codeManual);
  const ro = lock.structLocked ? 'disabled' : (man ? '' : 'readonly');
  return `<div class="modal-field"><label for="it-code">Codice</label>
      <div class="code-field">
        <input id="it-code" value="${it ? esc(it.code) : ''}" ${ro} class="${man ? '' : 'code-auto'}" oninput="renderCodePreview()">
        <label class="flag-check code-manual-check" title="Scrivere il codice a mano invece di comporlo dalle scelte">
          <input type="checkbox" id="it-code-manual" ${man ? 'checked' : ''} ${lock.structLocked ? 'disabled' : ''} onclick="return codeManualClick(this)"> Manuale</label>
      </div></div>`;
}
// Il motivo, facoltativo, e l'avviso per un codice fuori schema che nessuno ha
// dichiarato manuale (scritto prima della 0.115.0, o arrivato da un import).
function itemCodeNoteHtml(it, lock) {
  const man = !!(it && it.codeManual);
  const fuori = it && !man && codiceFuoriSchema(it);
  const chi = man && it.codeManualAt
    ? ` <span class="empty-text" style="padding:0">— deciso${it.codeManualBy ? ' da ' + esc(actorName(it.codeManualBy)) : ''} il ${esc(fmtStamp(it.codeManualAt))}</span>` : '';
  return `<div class="modal-field" id="fld-code-note" style="${man ? '' : 'display:none'}">
      <label for="it-code-note">Motivo del codice manuale (facoltativo)${chi}</label>
      <input id="it-code-note" value="${it ? esc(it.codeNote || '') : ''}" placeholder="es. sigla commerciale della macchina"></div>
    ${fuori ? `<p class="empty-text code-warn" id="code-warn">${ico('warning', 'tinted', '')} Il codice non segue la codifica (${esc(codiceAtteso(it))}…). ${lock.structLocked
      ? 'L\'articolo è già usato e il codice resta questo: se è voluto, confermalo come manuale da Gestione › Backup.'
      : `Se è voluto spunta «Manuale». <button type="button" class="btn-ghost" onclick="setCodeManual(false)">Usa il codice automatico</button>`}</p>` : ''}`;
}
// La spunta non cambia da sola: chiede prima, e cambia solo con il «Sì».
// Annullare la domanda in qualunque modo la lascia com'era.
function codeManualClick(cb) {
  const verso = cb.checked;          // lo stato che il clic vorrebbe
  if (verso) askConfirm('Vuoi modificare manualmente il codice?\nDi regola il codice si compone da solo dalle scelte dell\'articolo: scriverlo a mano è un\'eccezione, e resterà segnalata.',
    () => setCodeManual(true), { title: 'Codice manuale', ok: 'Sì', cancel: 'No', safe: true });
  else askConfirm('Ripristinare il codice automatico?\nIl codice scritto a mano viene sostituito da quello composto dalle scelte.',
    () => setCodeManual(false), { title: 'Codice automatico', ok: 'Sì', cancel: 'No', safe: true });
  return false;
}
function setCodeManual(on) {
  codeManualUi(on);
  if (on) { const el = document.getElementById('it-code'); if (el && el.focus) el.focus(); }
  else refreshItemCode();
}
function codeManualUi(on) {
  const cb = document.getElementById('it-code-manual');
  const el = document.getElementById('it-code');
  if (cb) cb.checked = on;
  itemCodeAuto = !on;
  if (el) {
    el.readOnly = !on;
    el.className = on ? '' : 'code-auto';
  }
  const nota = document.getElementById('fld-code-note');
  if (nota) nota.style.display = on ? '' : 'none';
  const warn = document.getElementById('code-warn');
  if (warn) warn.style.display = 'none';
}
// Spuntato «Manuale» e lasciato vuoto: l'articolo prenderebbe come codice il
// suo id interno, che non è certo l'eccezione che si voleva scrivere.
function codeManualErr() {
  return !itemCodeAuto && !val('it-code') ? 'Codice manuale: scrivi il codice, o togli la spunta per quello automatico' : null;
}
// Anteprima del nome composto (concetto + descrizione) nella modale parte
function updatePartNamePreview() {
  const el = document.getElementById('part-name-preview');
  if (el) el.textContent = composePartName(val('it-concept'), val('it-namefree')) || '—';
}
// Mostra e nasconde i blocchi della scheda articolo secondo il tipo scelto.
//
// `mostra` invece di getElementById(...).style: dodici dereferenziazioni nude e
// due guardate, nella stessa funzione, erano una regola che non c'era. Il giorno
// in cui un campo esce dal template, l'apertura della scheda articolo smetteva
// di funzionare del tutto — e la scheda è il centro dell'anagrafica.
function toggleItemFields() {
  const tipo = document.getElementById('it-type');
  if (!tipo) return;   // la scheda non è aperta
  const t = tipo.value;
  const mostra = (id, cond) => {
    const el = document.getElementById(id);
    if (el) el.style.display = cond ? '' : 'none';
  };
  // Nome: campo libero singolo per tutti i tipi tranne "parte", che usa concetto + descrizione
  mostra('fld-name-std', t !== 'parte');
  mostra('fld-name-parte', t === 'parte');
  if (t === 'parte') updatePartNamePreview();
  // Prezzo e fornitore: riepilogo in sola lettura, si modificano solo dal listino
  mostra('fld-pricing', hasPriceList({ type: t }));
  mostra('fld-sourcing', t === 'parte' && areaAttiva('produzione'));
  const showFam = usesFamily(t);
  mostra('fld-family', showFam);
  mostra('fld-assembly-note', isAssembly(t));
  mostra('fld-cycle', t === 'parte' && areaAttiva('produzione'));
  // Flag: preferito su commerciali e materie prime, obsoleto su qualunque tipo
  // — è l'unico modo per ritirare un codice già usato e sbagliato, senza
  // eliminarlo e perdere lo storico che lo referenzia.
  mostra('fld-flag-fav', canFavorite(t));
  mostra('fld-flag-obs', true);
  mostra('fld-flags', true);
  // Dati tecnici (dalla 0.138.0): misure e peso per tutti, il produttore su
  // ciò che si compra già fatto, materiale, finitura e trattamento sulle parti.
  // Dalla 0.139.0 anche il disegno (ciò che si progetta) e il codice a barre
  // (ciò che sta a scaffale): la regola è itemTechCampoVale, una per tutti.
  mostra('fld-tech', true);
  mostra('fld-mfr', itemTechCampoVale('manufacturer', t));
  mostra('fld-matfin', itemTechCampoVale('material', t));
  mostra('fld-drawing', itemTechCampoVale('drawingRef', t));
  mostra('fld-barcode', itemTechCampoVale('barcode', t));
  // Magazzino: solo su ciò che si tiene a scorta. Un assieme si produce, e la
  // sua giacenza sarebbe quella dei componenti contata due volte.
  mostra('fld-stock', hasStock({ type: t }) && giacenzeVisibili());
  // Doppia unità: solo dove esiste un listino, perché è il prezzo del fornitore
  // che può essere espresso in un'altra unità.
  mostra('fld-altuom', hasPriceList({ type: t }));
  // Codifica gerarchica: schema per la macchina, appartenenza per gli altri tipi
  const isChild = t === 'gruppo' || t === 'sottogruppo' || t === 'parte';
  mostra('sec-coding', t === 'macchina' || isChild);
  mostra('fld-coding-mac', t === 'macchina');
  mostra('fld-coding-child', isChild);
  mostra('fld-coding-gsigla', t === 'gruppo');
  mostra('fld-coding-group', t === 'sottogruppo' || t === 'parte');
  if (showFam) {
    // Ripopola le famiglie con quelle del tipo selezionato, preservando la selezione se compatibile
    const famSel = document.getElementById('it-family');
    if (famSel) {
      const cur = famSel.value;
      famSel.innerHTML = familyOptions(cur, t);
      const subSel = document.getElementById('it-subfamily');
      if (famSel.value !== cur && subSel) subSel.innerHTML = subFamilyOptions('', '');
    }
  }
  // Le sottoschede del tipo: cambiando tipo in creazione può sparire quella
  // aperta (da parte a macchina non c'è più Magazzino), e allora si torna ad
  // Anagrafica, dove sta il campo appena cambiato.
  itemTab(itemTabCorrente);
  refreshItemCode();
}
function onItemFamilyChange() {
  document.getElementById('it-subfamily').innerHTML = subFamilyOptions(val('it-family'), '');
  refreshItemCode();
}
function onItemSubFamilyChange() { refreshItemCode(); }
