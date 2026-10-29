// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-bom.js
// ═══════════════════════════════════════════════════════════
// Vista Distinte base e finestra "Dove è usato" con la simulazione dei costi.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  VISTA: DISTINTE BASE
// ═══════════════════════════════════════════════════════════
// ─── Filtri dell'elenco distinte (e dei cicli) ───
// Dalla 0.125.0 anche le parti hanno una distinta, e Distinte base e Cicli
// elencano gli stessi articoli: macchine, gruppi, sottogruppi e parti. Le due
// barre hanno quindi gli stessi filtri, scritti una volta qui: testo, tipo,
// famiglia e sottofamiglia (delle parti: gli assiemi non ne hanno), macchina e
// gruppo di appartenenza. `pfx` è il prefisso degli id della vista.
const DISTINTE_TIPI = ['macchina', 'gruppo', 'sottogruppo', 'parte'];
function distinteArticoli() { return (db.items || []).filter(i => DISTINTE_TIPI.includes(i.type)); }
function distinteFiltrate(pfx) {
  const leggi = k => (document.getElementById(pfx + '-' + k) || {}).value || '';
  const q = leggi('search').toLowerCase();
  const ft = leggi('type'), ff = leggi('family'), fsf = leggi('subfamily');
  const fm = leggi('machine'), fg = leggi('group');
  let rows = distinteArticoli();
  if (ft) rows = rows.filter(i => i.type === ft);
  if (ff) rows = rows.filter(i => usesFamily(i.type) && i.familyId === ff);
  if (fsf) rows = rows.filter(i => i.subFamilyId === fsf);
  // La macchina stessa vale come "appartenente a sé": filtrando per una macchina
  // ci si aspetta di trovarci dentro anche lei, non solo i suoi gruppi. Così il
  // gruppo, con le sue parti e i suoi sottogruppi.
  if (fm) rows = rows.filter(i => i.type === 'macchina' ? i.id === fm || i.configuredFromId === fm : i.machineItemId === fm);
  if (fg) rows = rows.filter(i => i.type === 'gruppo' ? i.id === fg : i.groupItemId === fg);
  if (q) rows = rows.filter(i => (i.code + ' ' + i.name).toLowerCase().includes(q));
  return rows;
}
// Ripopola famiglie, macchine e gruppi conservando le scelte ancora valide
// (stesso patto delle anagrafiche: syncFamilyFilters, syncMachineFilters).
function syncDistinteFiltri(pfx) {
  if (!document.getElementById(pfx + '-type')) return;
  syncFamilyFilters(pfx, DISTINTE_TIPI);
  syncMachineFilters(pfx);
}
function bomProducts() { return distinteArticoli(); }
function bomFilteredProducts() {
  return distinteFiltrate('bom').sort((a, b) => String(a.code).localeCompare(String(b.code)));
}
function updateBomMachineFilter() { syncDistinteFiltri('bom'); }
function bomSearchInput() { debounced('bom', renderBom); }
function onBomFilterChange() { renderBom(); }

function productOptions(selectedId) {
  const opt = (i) => `<option value="${i.id}" ${i.id === selectedId ? 'selected' : ''}>${itemBadgesTxt(i)}${esc(i.code)} — ${esc(i.name)}</option>`;
  // La distinta aperta resta sempre in elenco, anche se non passa i filtri:
  // altrimenti restringere la ricerca chiuderebbe l'albero sotto le mani.
  const rows = bomFilteredProducts();
  const aperta = getItem(selectedId);
  if (aperta && DISTINTE_TIPI.includes(aperta.type) && !rows.some(i => i.id === selectedId)) rows.push(aperta);
  const groups = [['macchina', 'Macchine'], ['gruppo', 'Gruppi'], ['sottogruppo', 'Sottogruppi'], ['parte', 'Parti']];
  let h = groups.map(([t, lbl]) => {
    const items = rows.filter(i => i.type === t);
    return items.length ? `<optgroup label="${lbl}">${items.map(opt).join('')}</optgroup>` : '';
  }).join('');
  if (!h) h = '<option value="">— nessuna distinta —</option>';
  return h;
}
// La selezione ricade sui prodotti NON filtrati: i filtri restringono l'elenco,
// non decidono cosa si sta guardando.
function ensureCurrentBom() {
  const products = bomProducts();
  if (!currentBomId || !products.some(p => p.id === currentBomId)) {
    const m = products.find(p => p.type === 'macchina') || products[0];
    currentBomId = m ? m.id : null;
  }
}
function onBomSelect() { currentBomId = val('bom-select'); bomExpanded = new Set(); renderBom(); }

function renderBom() {
  invalidateCaches();   // rete di sicurezza: la cache dei costi vive dentro un singolo disegno
  // Chi ha aperto la distinta dall'avviso dell'anello e ha tolto la riga lo
  // vede sparire qui, al ridisegno: il controllo si rifà solo se l'avviso c'è.
  if (_avvisiFissi.has('anelli')) controllaAnelliDistinta();
  updateBomMachineFilter();
  filtScopeApply('bom', updateBomMachineFilter);   // dopo il sync, non prima: vedi nota in renderCatalog (views-catalog.js)
  ensureCurrentBom();
  document.getElementById('bom-select').innerHTML = productOptions(currentBomId);
  const conta = document.getElementById('bom-count');
  if (conta) {
    const n = bomFilteredProducts().length, tot = bomProducts().length;
    conta.textContent = n === tot ? `${tot} ${tot === 1 ? 'distinta' : 'distinte'}` : `${n} di ${tot}`;
  }
  const it = getItem(currentBomId);
  renderBomRevBar();
  const summary = document.getElementById('bom-cost-summary');
  const tree = document.getElementById('bom-tree');
  if (!it) {
    summary.innerHTML = '';
    tree.innerHTML = '<div class="empty-text">Nessun prodotto. Creane uno in <strong>Tecnico → Articoli di progetto → + Nuovo articolo</strong>.</div>';
    refreshBomPanelIfOpen();
    filtMount('bom');
    return;
  }
  const c = costOf(it.id);
  const price = sellingPrice(it.id);
  // Sono tutti costi **unitari**, per una unità dell'assieme aperto: senza il
  // denominatore si leggono come il costo di una commessa intera.
  const u = itemUom(it);
  summary.innerHTML = [
    kpi('Materiale', fmtPer(c.material, u), 'orange'),
    kpi('Commerciali', fmtPer(c.purchased, u), 'accent'),
    kpi('Parti', fmtPer(c.parts, u), 'purple'),
    kpi('Lavorazioni', fmtPer(c.labor, u), 'green'),
    kpi('Spese generali', fmtPer(c.overhead, u), ''),
    kpi('Costo totale', fmtPer(c.total, u), ''),
    kpi('Prezzo vendita', fmtPer(price, u), 'green'),
  ].join('') + (c.cycle ? '<div class="empty-text" style="color:var(--red)">' + ico('warning', 'tinted') + ' Rilevato riferimento ciclico nella distinta!</div>' : '');

  // Albero
  const head = `<div class="bom-head"><span>Articolo</span><span class="num">Q.tà</span><span>U.M.</span>
    <span class="num">Costo un.</span><span class="num">Scarto %</span><span class="num">Costo riga</span><span style="text-align:right">Azioni</span></div>`;
  const rootRow = renderBomRootNode(it);
  // Una parte di dati non ancora migrati legge la distinta da distintaRighe:
  // gli indici delle righe modificabili valgono però su `components`, che è
  // quello che le modifiche toccano (dopo parteDistintaViva).
  const rows = distintaRighe(it).map((comp, idx) =>
    renderBomNode(comp, 1, it.id, true, idx, it.id, [it.id], bomPos('', idx))).join('');
  const opsRow = renderOpsBlock(it, true);
  const nota = it.type === 'parte' && partSourcing(it) === 'buy'
    ? `<div class="empty-text" style="text-align:left;padding:6px 0">${ico('cart', 'tinted')} Questa parte si <strong>acquista</strong>: il suo costo è il prezzo a listino, e la distinta non entra né nel costo né nel fabbisogno finché l'approvvigionamento non passa a produzione interna.</div>` : '';
  tree.innerHTML = varRigaBom(it) + nota + head + rootRow + (rows || `<div class="empty-text">Nessun componente. Usa "+ Aggiungi componenti".</div>`) + opsRow;
  refreshBomPanelIfOpen();
  filtMount('bom');
}
// `opz.azione` (dalla 0.101.0) rende la card un pulsante: un filtro sulla
// tabella sotto, o la vista che spiega il numero. `opz.attiva` la segna quando
// il suo filtro è quello in uso, così si vede cosa sta filtrando la tabella.
function kpi(label, value, cls, opz) {
  // L'unità appesa al numero (`€8951.50/pz`) è informazione di contorno: stampata
  // grande quanto la cifra ruba larghezza e costringe a rimpicciolire tutto il
  // riquadro. Va in piccolo, così la cifra — il dato vero — resta leggibile.
  const v = String(value).replace(/(\/[^<>/\s]+)$/, '<span class="kpi-uom">$1</span>');
  const o = opz || {};
  if (o.azione) {
    return `<div class="kpi-card kpi-click ${cls || ''}${o.attiva ? ' kpi-on' : ''}" ${clickAttrs(o.azione, o.titolo || '')}${o.titolo ? ` title="${esc(o.titolo)}"` : ''}${o.attiva ? ' aria-pressed="true"' : ''}><div class="kpi-value">${v}</div><div class="kpi-label">${label}</div></div>`;
  }
  return `<div class="kpi-card ${cls}"><div class="kpi-value">${v}</div><div class="kpi-label">${label}</div></div>`;
}

// Posizione gerarchica di una riga: "1", poi "1.2", "1.2.1"… La radice non ha numero,
// e sotto ogni padre la numerazione riparte da 1.
function bomPos(parentPos, idx) { return parentPos ? parentPos + '.' + (idx + 1) : String(idx + 1); }

// Render ricorsivo di un nodo (componente). editable = riga di primo livello dell'articolo aperto.
function renderBomNode(comp, level, parentId, editable, idx, pathPrefix, ancestorIds, pos) {
  const child = getItem(comp.itemId);
  if (!child) return `<div class="bom-node"><span class="bom-name"><span class="bom-pos">${esc(pos || '')}</span>${ico('warning', 'tinted')} articolo mancante</span></div>`;
  const nodeKey = pathPrefix + '>' + comp.itemId + '#' + idx;
  const cyc = ancestorIds.includes(comp.itemId);
  const isProd = isAssembly(child.type);
  // Anche una Parte è espandibile: mostra la sua distinta e il suo ciclo (dalla
  // 0.125.0 stanno separati, come per gli assiemi). Una parte comprata no: la
  // sua distinta non concorre al costo e non va mostrata nell'albero.
  const isParte = child.type === 'parte' && partSourcing(child) !== 'buy';
  const figli = (isProd || isParte) ? distintaRighe(child) : [];
  const expandable = !cyc && (figli.length > 0 || (isParte && cicloFasi(child).length > 0));
  const expanded = bomExpanded.has(nodeKey);
  const unit = cyc ? 0 : costOf(comp.itemId).total;
  const qty = Number(comp.qty) || 0;
  const factor = qty * (1 + (Number(comp.scrapPct) || 0) / 100);
  // Il costo di riga forzato, che ha solo la distinta di una parte.
  const forzato = comp.costOverride != null && comp.costOverride !== '';
  const lineCost = forzato ? Number(comp.costOverride) || 0 : unit * factor;
  const indent = (level - 1) * 18;
  const toggle = expandable
    ? `<span class="bom-toggle" ${clickAttrs(`toggleBom('${nodeKey}')`, (expanded ? 'Richiudi ' : 'Espandi ') + child.code)}
        aria-expanded="${expanded}">${expanded ? ico('chevronDown') : ico('chevronRight')}</span>`
    : `<span class="bom-toggle leaf">•</span>`;
  const actions = `<button class="mini-btn" title="Dove è usato e impatto costi" onclick="usageModal('${comp.itemId}')">${ico('link', 'tinted', 'Dove è usato e impatto costi')}</button>`
    + (child.type === 'parte' && vistaAttiva('cycles') ? `<button class="mini-btn" title="Ciclo di lavorazione" onclick="openCycleFor('${comp.itemId}')">${ico('wrench', 'tinted', 'Ciclo di lavorazione')}</button>` : '')
    + (editable
      ? `<button class="mini-btn" title="Modifica" onclick="editComponentModal(${idx})">${ico('edit', 'tinted', 'Modifica')}</button>
         <button class="mini-btn danger" title="Elimina" onclick="delComponent(${idx})">${ico('trash', 'tinted', 'Elimina')}</button>`
      : '');

  let h = `<div class="bom-node" style="padding-left:${18 + indent}px">
    <span class="bom-name"><span class="bom-pos">${esc(pos || '')}</span>${toggle}
      <span class="bom-code">${codeLink(child.id, child.code)}</span>
      <span class="bom-type-tag tt-${typeKey(child.type)}">${typeShort(child.type)}</span>
      <span class="nm" title="${esc(child.name)}">${esc(child.name)}${cyc ? ' ' + ico('warning', 'tinted') : ''}${altMarker(child)}${varTagRiga(comp, getItem(parentId))}</span>
    </span>
    <span class="num">${qty}</span>
    <span>${esc(child.uom || '')}</span>
    <span class="num cost">${fmtN(unit)}</span>
    <span class="num">${Number(comp.scrapPct) || 0}</span>
    <span class="num cost"${forzato ? ' title="Costo di riga forzato"' : ''}>${fmtN(lineCost)}${forzato ? '*' : ''}</span>
    <span class="bom-row-actions">${actions}</span>
  </div>`;

  if (expandable && expanded) {
    h += figli.map((cc, i) =>
      renderBomNode(cc, level + 1, child.id, false, i, nodeKey, ancestorIds.concat(child.id), bomPos(pos, i))).join('');
    if (cicloFasi(child).length) h += renderOpsBlock(child, false, 18 + indent + 18);
  }
  return h;
}

// Riga radice: mostra l'articolo padre (macchina/gruppo selezionata) come prima riga dell'albero.
function renderBomRootNode(it) {
  const unit = costOf(it.id).total;
  return `<div class="bom-node bom-node-root">
    <span class="bom-name">
      <span class="bom-pos"></span>
      <span class="bom-toggle leaf">•</span>
      <span class="bom-code">${codeLink(it.id, it.code)}</span>
      <span class="bom-type-tag tt-${typeKey(it.type)}">${typeShort(it.type)}</span>
      <span class="nm" title="${esc(it.name)}">${esc(it.name)}</span>
    </span>
    <span class="num">1</span>
    <span>${esc(it.uom || '')}</span>
    <span class="num cost">${fmtN(unit)}</span>
    <span class="num">0</span>
    <span class="num cost">${fmtN(unit)}</span>
    <span class="bom-row-actions"></span>
  </div>`;
}

// Le fasi del ciclo dell'assieme (dalla 0.124.0) o della parte (dalla
// 0.125.0), in sola lettura: si scrivono tutte nella vista Cicli, e da qui ci
// si arriva col link. `editable` dice solo se è la riga della distinta aperta,
// che il link ce l'ha anche senza fasi.
function renderOpsBlock(item, editable, padLeft) {
  const ops = cicloFasi(item);
  const pl = padLeft != null ? padLeft : 18;
  const tags = ops.map((o, i) => {
    const wc = getWorkCenter(o.workCenterId);
    const tempo = o.supplierId ? `${Number(o.days) || 0} gg da ${esc(supplierName(o.supplierId) || 'terzista')}`
      : `${Number(o.hours) || 0}h${faseOperatori(o) > 1 ? ' × ' + faseOperatori(o) + ' op' : ''}`;
    return `<span class="bom-op-tag"><span><span class="cycle-phase">${cyclePhaseNumber(i)}</span> ${ico('wrench', 'tinted')} ${esc(wc ? wc.name : '?')} · ${tempo} · ${fmtN(cycleRowCost(o))}</span></span>`;
  }).join('');
  if (!ops.length && !editable) return '';
  const nome = item.type === 'parte' ? 'Ciclo di lavorazione' : 'Ciclo di montaggio';
  const label = editable ? nome : 'Ciclo (' + esc(item.name) + ')';
  const ciclo = editable && vistaAttiva('cycles')
    ? ` <span class="bom-op-tag"><span style="cursor:pointer" ${clickAttrs(`openCycleFor('${item.id}')`, 'Apri il ' + nome.toLowerCase())}>${ico('edit', 'tinted')} Apri ciclo</span></span>` : '';
  return `<div class="bom-ops" style="padding-left:${pl}px"><strong style="color:var(--text-dim);font-size:11px">${label}:</strong> ${tags || '<span class="empty-text" style="padding:0">nessuna fase</span>'}${ciclo}</div>`;
}

function toggleBom(key) { if (bomExpanded.has(key)) bomExpanded.delete(key); else bomExpanded.add(key); renderBom(); }
function expandAllBom(on) {
  bomExpanded = new Set();
  if (on) {
    // Gli antenati si portano come elenco di id, come fa renderBomNode. Prima si
    // cercavano tra i pezzi della chiave, che sono `itemId#indice`: l'id nudo
    // c'era solo per la radice, e un giro chiuso più in basso (S1 dentro S2
    // dentro S1, possibile in archivio condiviso) riempiva lo stack (dalla 0.105.6).
    const walk = (item, prefix, antenati) => {
      distintaRighe(item).forEach((comp, idx) => {
        const key = prefix + '>' + comp.itemId + '#' + idx;
        const child = getItem(comp.itemId);
        if (!child || antenati.includes(comp.itemId)) return;
        if (isAssembly(child.type)) { bomExpanded.add(key); walk(child, key, antenati.concat(comp.itemId)); }
        // Una Parte con distinta o ciclo si espande; i suoi figli sono foglie
        else if (child.type === 'parte' && (distintaRighe(child).length || cicloFasi(child).length)) bomExpanded.add(key);
      });
    };
    const it = getItem(currentBomId); if (it) walk(it, it.id, [it.id]);
  }
  renderBom();
}

// ─── CRUD componenti / lavorazioni dell'articolo aperto ───
// Picker a ricerca live: candidati ammessi dal tipo padre, filtrabili per codice/nome.
// Motore condiviso da due consumatori con id distinti (prefisso `pfx`), così
// possono stare aperti insieme senza pestarsi i piedi: la modale "Modifica
// componente" (pfx 'cmp') e il pannello "Aggiungi componenti" (pfx 'bpn').
onPanelClose('form', () => { window.__pickerCandidates = null; if (window.__pickerAllowed) window.__pickerAllowed.cmp = null; });
function pickerCandidates(parentType, excludeId) {
  const allowed = ALLOWED_CHILDREN[parentType] || [];
  // Un articolo Obsoleto resta dov'è già inserito, ma non si propone più come
  // NUOVO componente: è il senso stesso del marcarlo tale.
  return db.items
    .filter(i => allowed.includes(i.type) && i.id !== excludeId && !i.obsolete)
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
}
// Filtri del picker: tipo (solo se il padre ne ammette più di uno, es. un
// gruppo può contenere sottogruppi/parti/materie/commerciali) e famiglia/
// sottofamiglia (solo se tra i tipi ammessi ce n'è uno che le usa). Con
// decine o centinaia di candidati la sola ricerca testuale non basta.
function pickerFiltersHtml(pfx, allowed) {
  window.__pickerAllowed = window.__pickerAllowed || {};
  window.__pickerAllowed[pfx] = allowed;
  const typeHtml = allowed.length > 1
    ? `<div class="modal-field"><label>Tipo</label>
        <select id="${pfx}-type" onchange="onPickerTypeChange('${pfx}')">
          <option value="">Tutti i tipi</option>
          ${allowed.map(t => `<option value="${t}">${typeLabel(t)}</option>`).join('')}
        </select></div>` : '';
  const famHtml = allowed.some(usesFamily)
    ? `<div class="modal-grid">
        <div class="modal-field"><label>Famiglia</label><select id="${pfx}-family" onchange="onPickerFamilyChange('${pfx}')"><option value="">Tutte le famiglie</option></select></div>
        <div class="modal-field"><label>Sottofamiglia</label><select id="${pfx}-subfamily" onchange="onPickerResultsRefresh('${pfx}')"><option value="">Tutte le sottofamiglie</option></select></div>
      </div>` : '';
  return typeHtml + famHtml;
}
// Ridisegna i soli risultati del consumatore che ha cambiato filtro (la modale
// ha il suo elenco, il pannello il suo: non si ridisegnano a vicenda).
function onPickerResultsRefresh(pfx) {
  if (pfx === 'cmp') renderPickerResults(); else if (pfx === 'bpn') renderBomPanelResults();
}
function onPickerTypeChange(pfx) { updatePickerFamilyOptions(pfx); onPickerResultsRefresh(pfx); }
function onPickerFamilyChange(pfx) { updatePickerFamilyOptions(pfx); onPickerResultsRefresh(pfx); }
// Allinea famiglia/sottofamiglia al tipo scelto nel picker, come in Anagrafica (syncFamilyFilters)
function updatePickerFamilyOptions(pfx) {
  const famSel = document.getElementById(pfx + '-family'); if (!famSel) return;
  const subSel = document.getElementById(pfx + '-subfamily');
  const typeF = val(pfx + '-type');
  const kinds = (typeF ? [typeF] : ((window.__pickerAllowed && window.__pickerAllowed[pfx]) || [])).filter(usesFamily);
  famSel.disabled = !kinds.length; subSel.disabled = !kinds.length;
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
// Applica ai candidati gli stessi filtri (testo + tipo + famiglia/sottofamiglia)
// per il consumatore `pfx`: unica logica di filtro, due elenchi di risultati diversi.
function pickerFilterRows(pfx, candidates) {
  const q = (val(pfx + '-search') || '').toLowerCase();
  const typeF = val(pfx + '-type');
  const famF = val(pfx + '-family');
  const subF = val(pfx + '-subfamily');
  let rows = candidates || [];
  if (typeF) rows = rows.filter(i => i.type === typeF);
  if (famF) rows = rows.filter(i => i.familyId === famF);
  if (subF) rows = rows.filter(i => i.subFamilyId === subF);
  if (q) rows = rows.filter(i => (i.code + ' ' + i.name).toLowerCase().includes(q));
  return rows;
}
// Markup del campo di selezione articolo (filtri + input ricerca + lista risultati + valore nascosto).
function itemPickerField(selectedId, allowed) {
  const sel = selectedId ? getItem(selectedId) : null;
  return `${pickerFiltersHtml('cmp', allowed)}
    <div class="modal-field"><label>Articolo</label>
      <input type="hidden" id="cmp-item" value="${selectedId ? esc(selectedId) : ''}">
      <input type="text" id="cmp-search" class="search" placeholder="Cerca codice o nome..."
        value="${sel ? esc(sel.code + ' — ' + sel.name) : ''}" oninput="debounced('picker', renderPickerResults)" autocomplete="off">
      <div id="cmp-results" class="picker-results"></div>
    </div>`;
}
function renderPickerResults() {
  const box = document.getElementById('cmp-results'); if (!box) return;
  let rows = pickerFilterRows('cmp', window.__pickerCandidates);
  const total = rows.length;
  rows = rows.slice(0, 50);
  const sel = val('cmp-item');
  let html = rows.map(i =>
    `<div class="picker-row ${i.id === sel ? 'is-sel' : ''}" ${clickAttrs(`selectPickerItem('${i.id}')`, `Scegli ${i.code}`)}>
       <span class="picker-type">${typeLabel(i.type)}</span><b>${esc(i.code)}</b> — ${esc(i.name)}${itemBadges(i)}
     </div>`).join('');
  if (!html) html = `<div class="picker-empty">Nessun articolo trovato</div>`;
  else if (total > rows.length) html += `<div class="picker-empty">+${total - rows.length} altri — affina la ricerca</div>`;
  box.innerHTML = html;
}
function selectPickerItem(id) {
  const hidden = document.getElementById('cmp-item'); if (!hidden) return;
  hidden.value = id;
  const it = getItem(id);
  const search = document.getElementById('cmp-search');
  if (search && it) search.value = it.code + ' — ' + it.name;
  renderPickerResults();
  cmpQtyLabelRefresh();
}
// «Quantità» da sola non dice quantità *di che cosa*: due o due metri cambiano
// la distinta. L'unità è quella del componente, che qui si sceglie dopo aver
// aperto il form — quindi l'etichetta la segue invece di essere scritta una
// volta sola. Finché non si è scelto niente resta "Quantità", senza parentesi
// vuote da riempire con l'immaginazione.
function cmpQtyLabelRefresh() {
  const lbl = document.getElementById('cmp-qty-label'); if (!lbl) return;
  lbl.textContent = labelUom('Quantità', itemUom(getItem(val('cmp-item'))));
}
function allowedHint(parentType) {
  const allowed = (ALLOWED_CHILDREN[parentType] || []).map(typeLabel);
  return allowed.length ? `Tipi ammessi in ${inUn(parentType)}: ${allowed.join(', ')}.` : '';
}
// «un gruppo», ma «una parte».
function inUn(t) { return (t === 'parte' ? 'una ' : 'un ') + typeLabel(t).toLowerCase(); }
function isAllowedChild(parentType, childId) {
  const child = getItem(childId);
  return !!child && (ALLOWED_CHILDREN[parentType] || []).includes(child.type);
}
function editComponentModal(idx) {
  if (!roleGuard('bom')) return;
  const it = parteDistintaViva(getItem(currentBomId)); if (!it) return;
  const comp = it.components[idx]; if (!comp) return;
  // Il costo di riga forzato c'è solo nella distinta di una parte (prima stava
  // nel ciclo): il prezzo concordato per quel pezzo di lamiera, per esempio.
  const forzato = it.type === 'parte'
    ? `<div class="modal-field"><label>Costo riga forzato (${esc(cur())})</label><input type="number" id="cmp-ovr" min="0" step="0.01"
        value="${comp.costOverride != null && comp.costOverride !== '' ? comp.costOverride : ''}" placeholder="${cycleRowComputed(comp).toFixed(2)}"
        title="Costo della riga intera, non di un'unità. Vuoto = calcolato dall'anagrafica"></div>` : '';
  window.__pickerCandidates = pickerCandidates(it.type, it.id);
  openModal(`<h3>${ico('edit', 'tinted pill', '')} Modifica componente</h3>
    <p class="empty-text" style="text-align:left;padding:0 0 10px">${allowedHint(it.type)}</p>
    ${itemPickerField(comp.itemId, ALLOWED_CHILDREN[it.type] || [])}
    <div class="modal-grid">
      <div class="modal-field"><label id="cmp-qty-label">${labelUom('Quantità', itemUom(getItem(comp.itemId)))}</label><input type="number" id="cmp-qty" min="0" step="0.001" value="${comp.qty}"></div>
      <div class="modal-field"><label>Scarto %</label><input type="number" id="cmp-scrap" min="0" step="0.1" value="${comp.scrapPct || 0}"></div>
      ${forzato}
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveComponentEdit(${idx})">Salva</button></div>`);
  updatePickerFamilyOptions('cmp');
  renderPickerResults();
}
function saveComponentEdit(idx) {
  if (!roleGuard('bom')) return;
  const it = parteDistintaViva(getItem(currentBomId)); if (!it) return;
  const comp = it.components[idx]; if (!comp) return;
  const itemId = val('cmp-item');
  // Senza questo controllo, il picker lasciato senza selezione salvava
  // itemId '' e la distinta si ritrovava una riga orfana, che il report
  // stampa vuota e il costo non sa valorizzare.
  if (!itemId) { showToast('Seleziona un articolo', 'error'); return; }
  if (!isAllowedChild(it.type, itemId)) { showToast('Tipo non ammesso in ' + inUn(it.type), 'error'); return; }
  if (createsCycle(it.id, itemId)) { showToast('Operazione annullata: creerebbe un ciclo', 'error'); return; }
  if (isNeg('cmp-qty')) { showToast('La quantità non può essere negativa', 'error'); return; }
  if (it.type === 'parte' && isNeg('cmp-ovr')) { showToast('Il costo non può essere negativo', 'error'); return; }
  comp.itemId = itemId; comp.qty = numVal('cmp-qty', 0); comp.scrapPct = numVal('cmp-scrap', 0, 100);
  if (it.type === 'parte') { const o = val('cmp-ovr'); comp.costOverride = o === '' || o == null ? null : numVal('cmp-ovr', 0); }
  touch(it);
  saveDB(); closeModal(); renderBom(); savedToast('Componente aggiornato');
}
function delComponent(idx) {
  if (!roleGuard('bom')) return;
  const it = parteDistintaViva(getItem(currentBomId)); if (!it) return;
  askConfirm('Eliminare questo componente dalla distinta?', () => {
    it.components.splice(idx, 1); touch(it); saveDB(); renderBom(); savedToast('Componente eliminato');
  });
}

// ─── Pannello "Aggiungi componenti" ───
// Pannello laterale fisso, sul modello visivo dell'Ispettore di Anagrafica ma
// indipendente da esso: qui non si agisce sull'articolo selezionato nella
// vista corrente, si cercano candidati e li si inserisce come componenti
// della distinta aperta. Niente checkbox: ogni riga ha una quantità (0 =
// non scelta) e un solo pulsante "Inserisci", sempre visibile in alto,
// aggiunge in un colpo solo tutti gli articoli a cui è stata cambiata la
// quantità — uno solo (inserimento rapido) o molti insieme (multiplo). Le
// quantità restano impostate anche affinando la ricerca, finché non si
// inserisce, si cambia distinta o si chiude il pannello.
let bomPanelQty = new Map();   // itemId -> quantità impostata (solo voci > 0)
// La distinta a cui appartengono le quantità qui sopra. Serve a distinguere
// «la vista si è ridisegnata» da «si è cambiata distinta»: sono la stessa
// chiamata, e senza questo riferimento erano indistinguibili.
let bomPanelFor = null;

// ─── Ridimensionamento del pannello ───
// Stesso schema dell'Ispettore di Anagrafica (inspector.js): variabili e
// chiave di preferenze proprie, per non toccarne una riga.
const BPN_KEY = 'bomtrack_bom_panel';
const BPN_MIN = 260, BPN_MAX = 720, BPN_DEF = 360;
let bomPanelWidth = BPN_DEF;
function bpnClampWidth(w) {
  const n = Number(w) || BPN_DEF;
  return Math.min(BPN_MAX, Math.max(BPN_MIN, Math.round(n)));
}
function bpnPrefsLoad() {
  try {
    const p = JSON.parse(localPref(BPN_KEY) || 'null');
    if (p && p.width) bomPanelWidth = bpnClampWidth(p.width);
  } catch (e) { /* preferenze illeggibili: si riparte da quella di serie */ }
}
function bpnPrefsSave() {
  try { localStorage.setItem(BPN_KEY, JSON.stringify({ width: bomPanelWidth })); } catch (e) { /* niente da salvare, niente da rompere */ }
}
function bpnApplyWidth() {
  const r = typeof document !== 'undefined' && document.documentElement;
  if (r && r.style && r.style.setProperty) r.style.setProperty('--bpn-w', bomPanelWidth + 'px');
}
let _bpnDrag = null;
function bpnResizeStart(e) {
  if (!e.target || !e.target.classList || !e.target.classList.contains('bpn-resizer')) return;
  _bpnDrag = { x: e.clientX, w: bomPanelWidth };
  document.body.classList.add('bpn-resizing');
  e.preventDefault();
}
function bpnResizeMove(e) {
  if (!_bpnDrag) return;
  // Il pannello sta a destra: trascinando verso sinistra si allarga, quindi il
  // segno è invertito rispetto al movimento del mouse.
  bomPanelWidth = bpnClampWidth(_bpnDrag.w + (_bpnDrag.x - e.clientX));
  bpnApplyWidth();
}
function bpnResizeEnd() {
  if (!_bpnDrag) return;
  _bpnDrag = null;
  document.body.classList.remove('bpn-resizing');
  bpnPrefsSave();
}
if (typeof document !== 'undefined' && document.addEventListener) {
  bpnPrefsLoad();
  document.addEventListener('pointerdown', bpnResizeStart);
  document.addEventListener('pointermove', bpnResizeMove);
  document.addEventListener('pointerup', bpnResizeEnd);
  document.addEventListener('pointercancel', bpnResizeEnd);
}

function toggleBomPanel() {
  if (!roleGuard('bom')) return;
  const it = getItem(currentBomId);
  if (!it) { showToast('Seleziona prima una macchina, un gruppo o un sottogruppo', 'error'); return; }
  const panel = document.getElementById('bom-panel'); if (!panel) return;
  if (panel.classList.contains('open')) closeBomPanel(); else openBomPanel();
}
function openBomPanel() {
  const it = getItem(currentBomId); if (!it) return;
  // Si apre sempre vuoto, e si dichiara subito per quale distinta: senza,
  // il primo ridisegno lo troverebbe «di un'altra» e lo azzererebbe di nuovo.
  bomPanelQty = new Map();
  bomPanelFor = it.id;
  document.getElementById('bom-panel').classList.add('open');
  document.body.classList.add('bom-panel-on');
  bpnApplyWidth();
  renderBomPanel();
}
function closeBomPanel() {
  const panel = document.getElementById('bom-panel'); if (!panel) return;
  panel.classList.remove('open');
  document.body.classList.remove('bom-panel-on');
}
// Richiamata da renderBom() ad ogni ridisegno: tiene il pannello coerente con
// la distinta aperta quando cambia (menu a tendina o click nell'albero).
//
// Le quantità si azzerano **solo** quando la distinta cambia davvero. Prima
// l'azzeramento era incondizionato, e siccome renderBom() passa di qui a ogni
// ridisegno bastava espandere un nodo dell'albero — toggleBom() ridisegna — per
// perdere le quantità impostate su dieci articoli, il testo di ricerca e il
// punto in cui si stava scrivendo. Era anche l'opposto di quanto promette il
// commento su bomPanelQty: «restano impostate finché non si inserisce, si
// cambia distinta o si chiude il pannello».
function refreshBomPanelIfOpen() {
  const panel = document.getElementById('bom-panel');
  if (!panel || !panel.classList.contains('open')) return;
  const it = getItem(currentBomId);
  if (!it) { closeBomPanel(); return; }
  if (bomPanelFor !== it.id) { bomPanelQty = new Map(); bomPanelFor = it.id; }
  renderBomPanel();
}
function renderBomPanel() {
  const panel = document.getElementById('bom-panel'); if (!panel) return;
  const it = getItem(currentBomId); if (!it) return;
  const allowed = ALLOWED_CHILDREN[it.type] || [];
  window.__bomPanelCandidates = pickerCandidates(it.type, it.id);
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px">
      <h3 style="margin:0">${ico('plus', 'tinted pill', '')} Aggiungi componenti</h3>
      <button class="btn-ghost" onclick="closeBomPanel()" title="Chiudi">✕</button>
    </div>
    <button class="add-btn-sm" id="bpn-insert-btn" style="width:100%;margin-bottom:10px" onclick="bomPanelInsertAll()">Inserisci</button>
    <p class="empty-text" style="text-align:left;padding:0 0 10px">${allowedHint(it.type)}</p>
    ${pickerFiltersHtml('bpn', allowed)}
    <div class="modal-field">
      <input type="text" id="bpn-search" class="search" placeholder="Cerca codice o nome..."
        oninput="debounced('bompanel', renderBomPanelResults)" autocomplete="off">
    </div>
    <div id="bpn-results" class="bpn-results"></div>`;
  updatePickerFamilyOptions('bpn');
  renderBomPanelResults();
  bomPanelUpdateInsertBtn();
}
function renderBomPanelResults() {
  const box = document.getElementById('bpn-results'); if (!box) return;
  const base = window.__bomPanelCandidates || [];
  let rows = pickerFilterRows('bpn', base);
  const total = rows.length;
  rows = rows.slice(0, 50);
  let html = rows.map(i => `
    <div class="bpn-row">
      <div class="bpn-info">
        <span class="bpn-code">${esc(i.code)}</span>
        <span class="bpn-name" title="${esc(i.name)}">${esc(i.name)}</span>
      </div>
      <div class="bpn-stepper">
        <button type="button" class="bpn-step" onclick="bomPanelStep('${i.id}', -1)" title="Diminuisci di 1">−</button>
        <input type="number" class="bpn-qty" id="bpn-qty-${i.id}" min="0" step="1" value="${bomPanelQty.get(i.id) || 0}"
          title="Quantità da inserire" oninput="bomPanelQtyChange('${i.id}', this.value)">
        <button type="button" class="bpn-step" onclick="bomPanelStep('${i.id}', 1)" title="Aumenta di 1">+</button>
        <span class="bpn-uom">${esc(itemUom(i))}</span>
      </div>
    </div>`).join('');
  if (!html) {
    html = base.length
      ? `<div class="picker-empty">Nessun articolo trovato</div>`
      : `<div class="picker-empty">Nessun articolo dei tipi ammessi. Crealo prima in Tecnico (Articoli di progetto o d\x27acquisto).</div>`;
  } else if (total > rows.length) html += `<div class="picker-empty">+${total - rows.length} altri — affina la ricerca</div>`;
  box.innerHTML = html;
}
function bomPanelQtyChange(id, v) {
  const n = parseFloat(v);
  if (isFinite(n) && n > 0) bomPanelQty.set(id, n); else bomPanelQty.delete(id);
  bomPanelUpdateInsertBtn();
}
// Frecce ±1: la digitazione libera resta possibile (utile per una quantità come
// 2.5 kg), ma il gesto rapido è cliccare, non calcolare a mente lo scarto.
function bomPanelStep(id, delta) {
  const next = Math.max(0, (bomPanelQty.get(id) || 0) + delta);
  if (next > 0) bomPanelQty.set(id, next); else bomPanelQty.delete(id);
  const input = document.getElementById('bpn-qty-' + id);
  if (input) input.value = next;
  bomPanelUpdateInsertBtn();
}
function bomPanelUpdateInsertBtn() {
  const btn = document.getElementById('bpn-insert-btn'); if (!btn) return;
  const n = bomPanelQty.size;
  btn.textContent = n ? `Inserisci (${n})` : 'Inserisci';
}
function bomPanelInsertAll() {
  if (!roleGuard('bom')) return;
  const it = parteDistintaViva(getItem(currentBomId)); if (!it) return;
  if (!bomPanelQty.size) { showToast('Imposta una quantità per almeno un articolo', 'error'); return; }
  let added = 0, skipped = 0;
  bomPanelQty.forEach((qty, itemId) => {
    if (!isAllowedChild(it.type, itemId) || createsCycle(it.id, itemId)) { skipped++; return; }
    // Un articolo che c'è già non fa una seconda riga: se ne aumenta la
    // quantità (dalla 0.105.7). Due righe dello stesso codice si leggevano
    // come due voci diverse, e chi correggeva la quantità ne vedeva una sola.
    // Non una riga col costo forzato: quello vale per la riga intera, e
    // aumentandone la quantità il pezzo in più resterebbe gratis.
    const gia = it.components.find(c => c.itemId === itemId && (c.costOverride == null || c.costOverride === ''));
    if (gia) gia.qty = Math.round(((Number(gia.qty) || 0) + qty) * 1e6) / 1e6;
    else it.components.push({ itemId, qty, scrapPct: 0 });
    added++;
  });
  bomPanelQty = new Map();
  if (added) { touch(it); saveDB(); }
  renderBom();
  if (added) savedToast(added + (added === 1 ? ' componente aggiunto' : ' componenti aggiunti') + (skipped ? `, ${skipped} scartati` : ''));
  else showToast('Nessun componente aggiunto: tipi non ammessi o cicli', 'error');
}

// Verifica se aggiungere childId dentro parentId creerebbe un ciclo.
//
// La discesa segue entrambe le strade con cui un articolo ne contiene un altro:
// i `components` degli assiemi e la distinta di una parte (distintaRighe, la
// stessa regola di parentIndex() e del motore di costo).
// Fino alla 0.22.0 guardava solo i componenti e usciva subito se il figlio non
// era un assieme: l'anello passando per una parte era impossibile solo perché
// lì entravano le sole foglie — una difesa che nessuno aveva scritto, e che
// sarebbe caduta il giorno in cui si fosse allargato quell'elenco.
//
// Vale la pena ricordare perché è importante: un anello in distinta manda
// costOf() in ricorsione, e il flag `cycle` che risale fino alla UI è
// contenimento del danno, non una cura.
function createsCycle(parentId, childId) {
  if (parentId === childId) return true;
  const visited = new Set();
  const dfs = (id) => {
    if (id === parentId) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    const node = getItem(id);
    if (!node) return false;
    if (isAssembly(node.type) || node.type === 'parte') return distintaRighe(node).some(c => dfs(c.itemId));
    return false;
  };
  return dfs(childId);
}

// ─── Anelli arrivati da fuori (dalla 0.105.6) ───
// createsCycle() protegge solo le modifiche fatte su questo PC. In archivio
// condiviso due colleghi possono mettere, nello stesso giro, S2 dentro S1 e S1
// dentro S2: ciascuno controlla il proprio archivio, dove l'anello non c'è
// ancora, e il server accetta entrambe le righe. L'anello si forma solo quando
// le due modifiche si incontrano, cioè qui, alla ricezione. Fino ad allora
// l'unico segnale era la riga rossa nel riepilogo costi di quell'assieme — e i
// costi di quel ramo restano troncati, l'esplosione MRP si ferma lì.
//
// Ogni anello si riporta una volta, come elenco di id nell'ordine del giro.
// Basta trovarne uno per ciascun intreccio: chi lo apre vede gli altri.
function anelliDistinta() {
  const items = db.items || [];
  const perId = new Map(items.map(i => [i.id, i]));
  const figli = it => (isAssembly(it.type) || it.type === 'parte' ? distintaRighe(it).map(c => c.itemId) : []);
  const stato = new Map();   // 1 = sul cammino aperto, 2 = già esplorato fino in fondo
  const cammino = [], anelli = [], visti = new Set();
  const visita = id => {
    stato.set(id, 1); cammino.push(id);
    (figli(perId.get(id)) || []).forEach(f => {
      if (!perId.has(f)) return;
      const s = stato.get(f);
      if (s === 1) {
        const giro = cammino.slice(cammino.indexOf(f));
        const k = giro.slice().sort().join('|');
        if (!visti.has(k)) { visti.add(k); anelli.push(giro); }
      } else if (!s) visita(f);
    });
    cammino.pop(); stato.set(id, 2);
  };
  items.forEach(i => { if (!stato.get(i.id)) visita(i.id); });
  return anelli;
}
// Lo dice con un avviso che resta, coi codici del giro e il modo di arrivarci.
// Si richiama dopo ogni ricezione (Store.applicaRemoto) e all'apertura di una
// distinta: quando l'anello sparisce, sparisce anche l'avviso.
function controllaAnelliDistinta() {
  const anelli = anelliDistinta();
  if (!anelli.length) { avvisoFissoTogli('anelli'); return anelli; }
  const codice = id => esc((getItem(id) || {}).code || id);
  const giri = anelli.slice(0, 3).map(g => g.concat(g[0]).map(codice).join(' → ')).join('; ')
    + (anelli.length > 3 ? ` e altri ${anelli.length - 3}` : '');
  const primo = anelli[0].find(id => { const x = getItem(id); return x && isAssembly(x.type); }) || anelli[0][0];
  avvisoFisso('anelli', `<strong>Distinta ad anello</strong>: ${giri}. Un articolo contiene sé stesso, di solito per due modifiche fatte insieme da due PC: costi e fabbisogni di quel ramo sono incompleti finché non si toglie una delle righe.
    <button class="avviso-fisso-azione" onclick="apriAnelloDistinta(${jsAttr(primo)})">Apri distinta</button>`);
  return anelli;
}
function apriAnelloDistinta(id) {
  const it = getItem(id); if (!it) return;
  if (DISTINTE_TIPI.includes(it.type)) openBomFor(it.id);
  else { setView(scopeOf(it.type)); editItemModal(it.id); }
}
// Apre la distinta di un assieme o (dalla 0.125.0) di una parte. I filtri
// restano: productOptions tiene in elenco la distinta aperta anche se non li
// passa.
function openBomFor(id) {
  const it = getItem(id); if (!it || !DISTINTE_TIPI.includes(it.type)) return;
  currentBomId = it.id; bomExpanded = new Set(); setView('bom');
}

function supplierName(id) { const s = getSupplier(id); return s ? s.name : ''; }
function supplierOptions(selectedId) {
  return `<option value="">—</option>` + db.suppliers
    .map(s => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}
// Selettore fornitore per una riga di ciclo: la prima voce è "Interna" (nessun
// fornitore, valore vuoto — la lavorazione si fa in casa), poi i fornitori
// conto lavoro già registrati su quel centro con la loro tariffa in etichetta
// (così si riconoscono a colpo d'occhio), poi gli altri fornitori a catalogo,
// scelta comunque libera se quello che serve non è ancora registrato lì.
function wcSupplierOptions(wc, selectedId) {
  const noti = new Set((wc && wc.suppliers || []).map(s => s.supplierId));
  const opt = (s, extra) => `<option value="${s.id}" ${s.id === selectedId ? 'selected' : ''}>${esc(s.name)}${extra || ''}</option>`;
  const abituali = (wc && wc.suppliers || [])
    .map(s => db.suppliers.find(x => x.id === s.supplierId) && { sup: db.suppliers.find(x => x.id === s.supplierId), rate: s.rate })
    .filter(Boolean)
    .map(({ sup, rate }) => opt(sup, ` — ${fmtN(rate)}/h`));
  const altri = db.suppliers.filter(s => !noti.has(s.id)).map(s => opt(s));
  return `<option value="">— Interna —</option>` + abituali.join('') + altri.join('');
}
// Solo il nome del centro: la tariffa oraria del centro non si applica da sé
// alle righe di ciclo, ci sono anche quelle a costo fisso (vedi cycleOpsTable).
// Il centro già scelto resta in elenco anche se sospeso, come fa uomOptions:
// senza, il menu mostrava il primo centro attivo e salvare la lavorazione la
// spostava lì senza dirlo (dalla 0.105.5).
function wcScelti(selectedId) { return db.workCenters.filter(w => w.active !== false || w.id === selectedId); }
const wcSospeso = w => w.active === false ? ' (sospeso)' : '';
function wcOptionsNoRate(selectedId) {
  return wcScelti(selectedId)
    .map(w => `<option value="${w.id}" ${w.id === selectedId ? 'selected' : ''}>${esc(w.name)}${wcSospeso(w)}</option>`).join('');
}
function wcOptions(selectedId) {
  return wcScelti(selectedId)
    .map(w => `<option value="${w.id}" ${w.id === selectedId ? 'selected' : ''}>${esc(w.name)} (${fmtN(w.hourlyRate)}/h)${wcSospeso(w)}</option>`).join('');
}
// ─── Macchina / testata prodotto ───
function editCurrentItemModal() {
  if (!roleGuard('bom')) return;
  const it = getItem(currentBomId); if (!it) return;
  openModal(`<h3>${ico('edit', 'tinted pill', '')} Modifica testata — <span style="color:var(--text-dim);font-weight:500">${typeLabel(it.type)}</span></h3>
    <p class="empty-text" style="text-align:left;padding:0 0 10px">Codice, descrizione e U.M. si modificano solo in Tecnico → Articoli di progetto.</p>
    <div class="modal-grid">
      <div class="modal-field"><label>Codice</label><input value="${esc(it.code)}" disabled style="font-family:var(--mono);font-weight:700"></div>
      <div class="modal-field"><label>U.M.</label><input value="${esc(it.uom || defaultUom())}" disabled></div>
    </div>
    <div class="modal-field"><label>Descrizione</label><input value="${esc(it.name)}" disabled></div>
    <div class="modal-grid">
      ${it.type === 'parte' ? '' /* le spese generali si applicano agli assiemi, non alle parti */ : `<div class="modal-field"><label>Spese generali % (override)</label><input type="number" id="mac-ov" step="0.1" value="${it.overheadPctOverride != null ? it.overheadPctOverride : ''}" placeholder="default ${db.settings.overheadPct}%"></div>`}
      <div class="modal-field"><label>Margine % (override)</label><input type="number" id="mac-mg" step="0.1" value="${it.marginPctOverride != null ? it.marginPctOverride : ''}" placeholder="default ${db.settings.marginPct}%"></div>
    </div>
    <div class="modal-field"><label>Note</label><textarea id="mac-notes" rows="2">${esc(it.notes || '')}</textarea></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveCurrentItem()">Salva</button></div>`);
}
function saveCurrentItem() {
  if (!roleGuard('bom')) return;
  const it = getItem(currentBomId); if (!it) return;
  it.notes = val('mac-notes');
  // Vuoto = nessuna sovrascrittura (si usa l'impostazione globale); un valore
  // fuori scala viene riportato dentro l'intervallo, come per le impostazioni.
  if (it.type !== 'parte') { const ov = val('mac-ov'); it.overheadPctOverride = ov === '' ? null : clampNum(parseFloat(ov), 0, 1000); }
  const mg = val('mac-mg'); it.marginPctOverride = mg === '' ? null : clampNum(parseFloat(mg), 0, 1000);
  touch(it);
  saveDB(); closeModal(); renderBom(); savedToast('Testata aggiornata');
}
function deleteCurrentMachine() {
  if (!roleGuard('bom')) return;
  const it = getItem(currentBomId); if (!it) return;
  const used = usedBy(it.id);
  if (used.length) { showToast('Usato in: ' + used.map(u => u.code).join(', ') + '. Rimuovilo prima.', 'error'); return; }
  // Come in delItem (views-catalog.js): oltre a distinte/cicli, il codice può
  // essere già in magazzino, documenti, piani o revisioni — nessuna eccezione
  // di ruolo, l'unica via è marcarlo Obsoleto.
  if (isItemUsedAnywhere(it.id)) {
    showToast('Articolo già movimentato (magazzino, cicli, documenti o piani): non può essere eliminato. Segnalo come obsoleto per impedirne il riuso.', 'error');
    return;
  }
  if (!articoloUltimo(it)) { showToast(ARTICOLO_NON_ULTIMO(it.code), 'error'); return; }
  askConfirm(`Eliminare "${it.name}" e la sua distinta?`, () => eliminaSeAncoraUltimo(() => {
    const x = getItem(it.id);
    if (x && articoloUltimo(x)) return true;
    if (x) showToast(ARTICOLO_NON_ULTIMO(x.code), 'error');
    return false;
  }, () => {
    currentBomId = null;
    removeConUndo('items', it.id, `"${it.name}" eliminato`, renderBom);
  }));
}
// Chi contiene questo articolo, dall'indice inverso: una lettura invece di una
// scansione del catalogo. La copia protegge l'indice da chi ordina il risultato.
function usedBy(itemId) {
  const l = parentIndex().get(itemId);
  return l ? l.slice() : [];
}

// ═══════════════════════════════════════════════════════════
//  DOVE È USATO E IMPATTO SUI COSTI
// ═══════════════════════════════════════════════════════════
// La distinta si è sempre potuta leggere dall'alto verso il basso. Qui si
// risale: dato un articolo, chi lo contiene e quali macchine ne risentono se
// il suo costo cambia.

// Quantità di `childId` dentro una unità di `parent`, scarto compreso.
// Un componente può comparire più volte nella stessa distinta: si sommano.
function usageQty(parent, childId) {
  let q = 0;
  // La distinta di una parte comprata non conta: il suo costo è il listino.
  if (isAssembly(parent.type) || (parent.type === 'parte' && partSourcing(parent) !== 'buy')) {
    distintaRighe(parent).forEach(c => {
      if (c.itemId === childId) q += (Number(c.qty) || 0) * (1 + (Number(c.scrapPct) || 0) / 100);
    });
  }
  return q;
}
// Impieghi diretti: chi contiene l'articolo, con la quantità per unità.
function directUses(itemId) {
  return usedBy(itemId)
    .map(p => ({ item: p, qty: usageQty(p, itemId) }))
    .sort((a, b) => (a.item.code || '').localeCompare(b.item.code || ''));
}
// Tutti gli antenati, con la quantità complessiva che ne serve per una unità di
// ciascuno: si moltiplicano le quantità lungo la risalita. Il percorso già
// attraversato ferma gli anelli.
function ancestorTotals(itemId) {
  const totali = new Map();
  const salita = (id, qty, percorso) => {
    usedBy(id).forEach(p => {
      if (percorso.has(p.id)) return;
      const q = qty * usageQty(p, id);
      totali.set(p.id, (totali.get(p.id) || 0) + q);
      const oltre = new Set(percorso); oltre.add(p.id);
      salita(p.id, q, oltre);
    });
  };
  salita(itemId, 1, new Set([itemId]));
  return totali;
}
// Assiemi di testa impattati: le macchine, oppure — se l'articolo non arriva a
// nessuna macchina — gli assiemi più alti che lo contengono.
function impactedTops(itemId) {
  const totali = ancestorTotals(itemId);
  const righe = [...totali.entries()]
    .map(([id, qty]) => ({ item: getItem(id), qty }))
    .filter(r => r.item);
  const macchine = righe.filter(r => r.item.type === 'macchina');
  const cime = macchine.length ? macchine : righe.filter(r => !usedBy(r.item.id).length);
  return cime.sort((a, b) => (a.item.code || '').localeCompare(b.item.code || ''));
}

// ─── Il campo dove vive il costo proprio dell'articolo ───
// Dipende dal tipo. Gli assiemi non ne hanno uno (il loro costo è derivato) e
// nemmeno le parti prodotte in casa con un ciclo: lì non c'è un prezzo da
// simulare o da prendere a listino, lo determinano distinta e lavorazioni.
function costField(it) {
  if (!it) return null;
  if (it.type === 'acquistato') return 'purchasePrice';
  if (it.type === 'materiale') return 'unitCost';
  // Una parte prodotta in casa ha il costo derivato da distinta e ciclo: non
  // c'è un campo da scrivere. Senza righe il costo torna il prezzo a listino.
  if (it.type === 'parte') return (partSourcing(it) === 'buy' || !(distintaRighe(it).length || cicloFasi(it).length)) ? 'unitCost' : null;
  return null;
}
// Esegue `fn` come se l'articolo costasse `valore`, poi rimette tutto a posto.
// Nulla viene salvato: si tocca l'oggetto in memoria e lo si ripristina sempre,
// anche se il calcolo solleva un'eccezione.
function withTempCost(it, valore, fn) {
  const campo = costField(it);
  if (!campo) return fn();
  const prima = it[campo];
  it[campo] = valore;
  invalidateCaches();
  try { return fn(); }
  finally { it[campo] = prima; invalidateCaches(); }
}
