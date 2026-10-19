// ─── Il pannello laterale ───
//
// Gli elenchi sono arrivati a nove colonne più una di pulsanti: sei icone mute
// per riga, che rubano larghezza ai dati e si spiegano solo passandoci sopra.
// Il pannello sposta quei comandi in un posto fisso a destra, dove c'è spazio
// per scriverli per esteso, e con loro le schede che oggi aprono una finestra
// per ogni domanda («quanto costa», «dove è usato», «che listino ha»).
//
// Il patto è che **non aggiunge funzioni**: i comandi sono le stesse chiamate
// che stavano nelle righe, alle stesse condizioni. Cambia dove si trovano, non
// cosa fanno — e chiudendo il pannello la colonna dei pulsanti torna al suo
// posto, così chi ha l'abitudine di lavorare così non perde niente.
//
// Le viste che non compaiono nel registro qui sotto non hanno pannello e non
// se ne accorgono: `inspectorFor()` restituisce niente e tutto resta com'era.

// Vedi COLS_KEY in columns.js: stessa convenzione, stesso travaso.
const INSP_KEY = 'bomtrack_inspector';
const INSP_KEY_VECCHIA = 'bomtrack.inspector';
const INSP_MIN = 260, INSP_MAX = 720, INSP_DEF = 340;

// Cosa è selezionato. `ids` è una lista anche se oggi ne contiene sempre al
// più uno: il giorno della selezione multipla non si riscrive il modello, si
// toglie un vincolo.
let inspSel = { view: null, kind: null, ids: [] };
let inspOpen = true;
let inspWidth = INSP_DEF;
let inspTab = {};        // ultima scheda aperta, per vista

// ─── Preferenze ───
// Larghezza e apertura vivono nel browser di chi lavora, non nel database: sono
// una comodità personale, non un dato aziendale. Se localStorage rifiuta — modo
// privato, spazio esaurito — si continua con i valori di serie: una preferenza
// non deve poter impedire l'avvio.
function inspPrefsLoad() {
  // Di serie aperto solo dove c'è spazio: sotto i 1400 px il pannello toglieva
  // all'elenco 340 px e i codici andavano a capo. Chi lo apre o lo chiude a mano
  // fa testo, su qualunque schermo: la scelta salvata vince su questa.
  if (typeof window !== 'undefined' && typeof window.innerWidth === 'number' && window.innerWidth < 1400) inspOpen = false;
  try {
    const p = JSON.parse(localPref(INSP_KEY, INSP_KEY_VECCHIA) || 'null');
    if (!p) return;
    if (typeof p.open === 'boolean') inspOpen = p.open;
    if (p.width) inspWidth = inspClampWidth(p.width);
    if (p.tab && typeof p.tab === 'object') inspTab = p.tab;
  } catch (e) { /* preferenze illeggibili: si riparte da quelle di serie */ }
}
function inspPrefsSave() {
  try {
    localStorage.setItem(INSP_KEY, JSON.stringify({ open: inspOpen, width: inspWidth, tab: inspTab }));
  } catch (e) { /* niente da salvare, niente da rompere */ }
}
// Sotto i 260px non ci sta un pulsante con la sua etichetta; sopra i 720 il
// pannello ruba all'elenco lo spazio che gli stiamo restituendo.
function inspClampWidth(w) {
  const n = Number(w) || INSP_DEF;
  return Math.min(INSP_MAX, Math.max(INSP_MIN, Math.round(n)));
}

// ─── Registro: cosa si seleziona in ogni vista e cosa se ne può fare ───
// Aggiungere una vista è aggiungere una riga qui. `azioni` e `schede` ricevono
// l'elemento selezionato e restituiscono dati, non HTML: il disegno è uno solo,
// più in basso, così tutte le viste vengono uguali senza doverlo ricordare.
const INSPECTORS = {
  buy: { kind: 'item', area: 'catalog', azioni: inspAzioniArticolo, schede: inspSchedeArticolo },
  design: { kind: 'item', area: 'catalog', azioni: inspAzioniArticolo, schede: inspSchedeArticolo },
  stock: { kind: 'item', area: 'catalog', azioni: inspAzioniGiacenza, schede: inspSchedeArticolo },
};
function inspectorFor(view) { return INSPECTORS[view] || null; }

// Un comando: etichetta scritta, icona, la stessa chiamata che stava in riga.
// `write` marca quelli che modificano — spariscono a chi ha la vista in sola
// lettura, esattamente come sparisce il pulsante nella riga.
function cmd(icona, testo, azione, extra) {
  return Object.assign({ icona, testo, azione }, extra || {});
}
function inspAzioniArticolo(it) {
  return [
    cmd('edit', 'Modifica articolo', `editItemModal('${it.id}')`, { write: true }),
    cmd('copy', 'Duplica', `duplicateItemModal('${it.id}')`, { write: true }),
    hasPriceList(it) ? cmd('euro', 'Listino fornitori', `priceListModal('${it.id}')`) : null,
    it.type === 'parte' ? cmd('wrench', 'Distinta parte e ciclo', `openCycleFor('${it.id}')`) : null,
    // Il conteggio nell'etichetta, come per i movimenti qui sotto: dice se c'è
    // un disegno senza doverlo aprire per scoprirlo. Non è marcato `write`
    // perché la scheda si apre e si scarica anche in sola lettura — chi va in
    // officina con il disegno non è detto che possa modificare l'anagrafica; ad
    // aggiungere ed eliminare pensa la scheda, che ha le sue guardie.
    cmd('file', 'Apri documento', `allegatoApriPrimo('${it.id}')`),
    cmd('folder', `Allegati${allegatiCount(it.id) ? ' (' + allegatiCount(it.id) + ')' : ''}`, `allegatiModal('${it.id}')`),
    cmd('link', 'Dove è usato e impatto costi', `usageModal('${it.id}')`),
    cmd('eye', 'Scheda completa', `itemInfoModal('${it.id}')`),
    cmd('trash', 'Elimina articolo', `delItem('${it.id}')`, { write: true, danger: true }),
  ].filter(Boolean);
}
function inspAzioniGiacenza(it) {
  return [
    cmd('scale', 'Rettifica giacenza', `stockAdjustModal('${it.id}')`, { write: true }),
    cmd('clock', `Movimenti (${movementsOf(it.id).length})`, `stockMovementsModal('${it.id}')`),
    cmd('link', 'Dove è usato e impatto costi', `usageModal('${it.id}')`),
    cmd('folder', `Allegati${allegatiCount(it.id) ? ' (' + allegatiCount(it.id) + ')' : ''}`, `allegatiModal('${it.id}')`),
    cmd('edit', 'Modifica articolo', `editItemModal('${it.id}')`, { write: true }),
    cmd('eye', 'Scheda completa', `itemInfoModal('${it.id}')`),
  ].filter(Boolean);
}
// Le schede sono i corpi che esistono già: il pannello non ne scrive di nuovi,
// li ospita. Due copie della stessa scheda divergerebbero al primo ritocco.
function inspSchedeArticolo(it) {
  return [
    { id: 'scheda', testo: 'Scheda', corpo: () => itemInfoBody(it) },
    hasPriceList(it) ? { id: 'listino', testo: 'Listino', corpo: () => priceListBody(it.id) } : null,
    { id: 'usato', testo: 'Dove è usato', corpo: () => usageBody(it.id) },
    { id: 'storico', testo: 'Storico', corpo: () => storicoBody('items', it.id) },
  ].filter(Boolean);
}

// ─── Selezione ───
// La selezione vale per la vista in cui è stata fatta e per un articolo che
// esiste ancora: un filtro che nasconde la riga, o un'eliminazione, la fanno
// decadere. Mostrare comandi che agiscono su qualcosa che non si vede più è il
// modo più rapido di far premere il pulsante sbagliato.
function inspectorSelected() {
  const reg = inspectorFor(activeView);
  if (!reg || inspSel.view !== activeView || !inspSel.ids.length) return null;
  const it = getItem(inspSel.ids[0]);
  if (!it) return null;
  return it;
}
// Gli articoli scelti che esistono ancora, nell'ordine in cui sono stati scelti.
function inspectorSelectedAll() {
  if (inspSel.view !== activeView) return [];
  return inspSel.ids.map(getItem).filter(Boolean);
}
function inspectorSelect(id) {
  const reg = inspectorFor(activeView);
  if (!reg) return;
  inspSel = { view: activeView, kind: reg.kind, ids: id ? [id] : [] };
  renderInspector();
  inspectorMarkRows();
}
// Aggiunge o toglie una riga senza perdere le altre (Ctrl+click).
function inspectorAddToSelection(id) {
  const reg = inspectorFor(activeView);
  if (!reg || !id) return;
  const ids = inspSel.view === activeView ? inspSel.ids.slice() : [];
  const i = ids.indexOf(id);
  if (i < 0) ids.push(id); else ids.splice(i, 1);
  inspSel = { view: activeView, kind: reg.kind, ids };
  renderInspector();
  inspectorMarkRows();
}
// Da qui a lì (Maiusc+click): l'intervallo è quello **che si vede**, nell'ordine
// in cui le righe stanno sullo schermo — che è l'unico ordine di cui chi sceglie
// abbia coscienza. Righe filtrate via o non ancora disegnate restano fuori.
function inspectorExtendSelection(id) {
  const reg = inspectorFor(activeView);
  if (!reg || !id) return;
  const righe = inspectorRowIds();
  const da = inspSel.view === activeView && inspSel.ids.length ? inspSel.ids[inspSel.ids.length - 1] : null;
  const i = righe.indexOf(da), j = righe.indexOf(id);
  if (i < 0 || j < 0) { inspectorSelect(id); return; }
  const [a, b] = i <= j ? [i, j] : [j, i];
  const nuovi = righe.slice(a, b + 1);
  // Chi c'era resta: si estende una scelta, non la si ricomincia.
  // Il controllo dei doppioni passa da un Set: con Maiusc+click dalla prima
  // all'ultima riga di un elenco lungo, `includes` dentro il ciclo faceva
  // crescere il costo col quadrato delle righe scelte.
  const ids = (inspSel.view === activeView ? inspSel.ids : []).slice();
  const gia = new Set(ids);
  nuovi.forEach(x => { if (!gia.has(x)) { gia.add(x); ids.push(x); } });
  inspSel = { view: activeView, kind: reg.kind, ids };
  renderInspector();
  inspectorMarkRows();
}
function inspectorRowIds() {
  const p = typeof document === 'undefined' ? null : document.getElementById('view-' + activeView);
  if (!p || !p.querySelectorAll) return [];
  return Array.prototype.map.call(p.querySelectorAll('tr[data-sel]'), tr => tr.dataset.sel);
}
function inspectorClear() {
  inspSel = { view: null, kind: null, ids: [] };
  renderInspector();
  inspectorMarkRows();
}
function inspectorSetTab(t) {
  inspTab[activeView] = t;
  inspPrefsSave();
  renderInspector();
}
function inspectorToggle() {
  inspOpen = !inspOpen;
  inspPrefsSave();
  renderInspector();
}
// Quale scheda mostrare: l'ultima usata in questa vista, se esiste ancora per
// l'articolo scelto (un commerciale ha il listino, una macchina no).
function inspectorTabAttiva(schede) {
  const voluta = inspTab[activeView];
  return schede.some(s => s.id === voluta) ? voluta : (schede[0] && schede[0].id);
}

// ─── Disegno ───
// `inspectorHtml()` non tocca il DOM: prende lo stato e restituisce HTML, come
// ogni altra vista del repo. È la parte che la suite verifica.
function inspectorHtml() {
  const reg = inspectorFor(activeView);
  if (!reg) return '';
  const scelti = inspectorSelectedAll();
  const it = inspectorSelected();
  const titolo = scelti.length > 1 ? `${scelti.length} articoli scelti` : (it ? esc(it.code) : 'Pannello');
  const testa = `<div class="insp-head">
      <strong class="insp-title">${titolo}</strong>
      <button class="mini-btn" title="Chiudi il pannello (Ctrl+I)" onclick="inspectorToggle()">${ico('close', '', 'Chiudi il pannello')}</button>
    </div>`;
  if (scelti.length > 1) return testa + inspectorMultiHtml(reg, scelti);
  if (!it) {
    return testa + `<div class="insp-empty">
      <p><strong>Scegli una riga</strong> dell'elenco: qui compaiono i comandi che si possono eseguire su quella riga e le schede da consultare.</p>
      <p class="insp-hint">Con il pannello aperto la colonna dei pulsanti sparisce dall'elenco, che resta largo quanto i dati. Le frecce ↑ e ↓ spostano la scelta, Invio apre la scheda completa.</p>
      <p class="insp-hint"><strong>Ctrl+click</strong> aggiunge una riga alla scelta, <strong>Maiusc+click</strong> prende tutto quello che sta in mezzo: da lì si agisce su tutte insieme.</p>
    </div>`;
  }

  const scrivibile = canWrite(reg.area);
  const azioni = reg.azioni(it).filter(a => !a.write || scrivibile);
  const schede = reg.schede(it);
  const tab = inspectorTabAttiva(schede);
  const scheda = schede.find(s => s.id === tab);

  return testa
    + inspectorSommario(it)
    + `<div class="insp-cmds">${azioni.map(a =>
      `<button class="insp-cmd${a.danger ? ' danger' : ''}" onclick="${a.azione}">${ico(a.icona, 'tinted', '')} ${esc(a.testo)}</button>`).join('')}</div>`
    + `<div class="insp-tabs" role="tablist">${schede.map(s =>
      `<button class="insp-tab${s.id === tab ? ' active' : ''}" role="tab" aria-selected="${s.id === tab}"
        onclick="inspectorSetTab('${s.id}')">${esc(s.testo)}</button>`).join('')}</div>`
    + `<div class="insp-body">${scheda ? scheda.corpo() : ''}</div>`;
}

// ─── Più righe insieme ───
// Segnare obsoleti quaranta codici uno per uno è il lavoro che si rimanda per
// sempre, e l'anagrafica resta sporca. Le azioni sono poche di proposito: quelle
// che hanno senso su un mucchio di articoli **qualsiasi**. Tutto ciò che
// dipende dal singolo — il listino, il ciclo, la distinta — resta dov'era.
function inspectorMultiHtml(reg, scelti) {
  const scrivibile = canWrite(reg.area);
  const ids = scelti.map(i => i.id);
  const lista = `'${ids.join("','")}'`;
  const tipi = {};
  scelti.forEach(i => { tipi[typeLabel(i.type)] = (tipi[typeLabel(i.type)] || 0) + 1; });
  const obsoleti = scelti.filter(i => i.obsolete).length;
  const favoribili = scelti.filter(i => canFavorite(i.type)).length;
  const usati = scelti.filter(i => usedBy(i.id).length).length;

  const righe = [
    ['Scelti', `<strong>${scelti.length}</strong> articoli`],
    ['Di che tipo', Object.keys(tipi).map(t => `${tipi[t]} ${esc(t)}`).join(' · ')],
    obsoleti ? ['Già obsoleti', `${obsoleti} su ${scelti.length}`] : null,
    // Chi è usato in una distinta non si elimina: dirlo prima evita di scoprirlo
    // a metà del gesto.
    usati ? ['Usati in distinta', `${usati} — non si eliminano`] : null,
  ].filter(Boolean);

  const cmd = (icona, testo, azione, extra) =>
    `<button class="insp-cmd${extra && extra.danger ? ' danger' : ''}" onclick="${azione}">${ico(icona, 'tinted', '')} ${esc(testo)}</button>`;
  const azioni = [
    scrivibile && obsoleti < scelti.length ? cmd('blocked', 'Segna come non più utilizzabili', `bulkObsolete([${lista}], true)`) : '',
    scrivibile && obsoleti ? cmd('check', 'Rendi di nuovo utilizzabili', `bulkObsolete([${lista}], false)`) : '',
    scrivibile && favoribili ? cmd('tag', `Segna preferiti (${favoribili})`, `bulkFavorite([${lista}], true)`) : '',
    scrivibile && favoribili ? cmd('close', 'Togli dai preferiti', `bulkFavorite([${lista}], false)`) : '',
    cmd('sheet', 'Esporta la selezione in Excel', `exportListXlsx(${inspectorExportSpec(ids)})`),
    cmd('file', 'Esporta la selezione in PDF', `exportListPdf(${inspectorExportSpec(ids)})`),
    cmd('qr', 'Etichette QR della selezione', `qrEtichetteModal([${lista}])`),
    scrivibile ? cmd('trash', `Elimina ${scelti.length - usati > 0 ? scelti.length - usati : 0} articoli`, `bulkDelete([${lista}])`, { danger: true }) : '',
  ].filter(Boolean).join('');

  return `<div class="insp-sum">${righe.map(([k, v]) =>
    `<div class="insp-sum-row"><span class="insp-sum-k">${esc(k)}</span><span class="insp-sum-v">${v}</span></div>`).join('')}</div>
    <div class="insp-cmds">${azioni}</div>
    <div class="insp-multi-list">${scelti.map(i =>
      `<div class="insp-multi-row">${codeLink(i.id, i.code)} <span>${esc(i.name)}</span></div>`).join('')}</div>
    <div class="insp-cmds"><button class="insp-cmd" onclick="inspectorClear()">${ico('close', 'tinted', '')} Annulla la scelta</button></div>`;
}
// L'export della selezione riusa la specifica della vista, con la scelta come
// filtro in più: le colonne e i totali restano quelli dell'elenco.
function inspectorExportSpec(ids) {
  const lista = `['${ids.join("','")}']`;
  return activeView === 'stock' ? `stockExportSpec(${lista})` : `catalogExportSpec('${activeView}', ${lista})`;
}

// Il riepilogo risponde alle domande veloci — cos'è, quanto costa, quanto ce
// n'è, chi lo usa — senza aprire niente. È il motivo per cui il pannello fa
// risparmiare click anche a chi non esegue nessun comando.
function inspectorSommario(it) {
  const u = itemUom(it);
  const st = stockOf(it.id);
  const usi = directUses(it.id).length;
  const righe = [
    ['Articolo', esc(it.name)],
    ['Tipo', `<span class="bom-type-tag tt-${typeKey(it.type)}">${typeShort(it.type)}</span> ${esc(typeLabel(it.type))}`],
    ['Costo unitario', `<strong>${fmtPer(itemUnitCost(it), u)}</strong>`],
    hasStock(it) ? ['Giacenza', `${fmtUom(st.onHand, u)}${st.incoming ? ' · in arrivo ' + fmtUom(st.incoming, u) : ''}`] : null,
    ['Dove è usato', usi ? `${usi} ${usi === 1 ? 'impiego diretto' : 'impieghi diretti'}` : 'nessun impiego'],
  ].filter(Boolean);
  return `<div class="insp-sum">${righe.map(([k, v]) =>
    `<div class="insp-sum-row"><span class="insp-sum-k">${esc(k)}</span><span class="insp-sum-v">${v}</span></div>`).join('')}</div>`;
}
// ─── Innesto nella pagina ───
function inspectorEl() { return typeof document === 'undefined' ? null : document.getElementById('inspector'); }
// La larghezza vive in una variabile CSS, che pannello e margine leggono
// entrambi: così restano d'accordo senza doverli aggiornare in due punti.
function inspApplyWidth() {
  const r = typeof document !== 'undefined' && document.documentElement;
  if (r && r.style && r.style.setProperty) r.style.setProperty('--insp-w', inspWidth + 'px');
}
function renderInspector() {
  const el = inspectorEl();
  if (!el) return;
  const reg = inspectorFor(activeView);
  const attivo = !!reg && inspOpen;
  document.body.classList.toggle('insp-on', attivo);
  document.body.classList.toggle('insp-rail', !!reg && !inspOpen);
  inspApplyWidth();
  // In sola lettura il pannello si comporta come la vista: i comandi che
  // modificano non li disegna nemmeno, così non promette quello che le guardie
  // poi rifiutano.
  el.classList.toggle('insp-readonly', !!reg && !canWrite(reg.area));
  el.innerHTML = attivo ? inspectorHtml() : (reg ? inspectorRailHtml() : '');
  a11yFields(el);
}
// Chiuso, il pannello lascia una striscia con il pulsante per riaprirlo: un
// comando che sparisce del tutto è un comando che nessuno ritrova.
function inspectorRailHtml() {
  return `<button class="insp-rail-btn" title="Apri il pannello dei comandi (Ctrl+I)"
    onclick="inspectorToggle()">${ico('chevronRight', '', 'Apri il pannello dei comandi')}</button>`;
}
// Dopo ogni ridisegno dell'elenco: l'evidenza sulla riga va rimessa, e una
// selezione rimasta senza riga (filtro cambiato, articolo eliminato) va lasciata
// cadere insieme ai suoi comandi.
function inspectorSync() {
  if (!inspectorFor(activeView)) return;
  // Cadono le righe che non ci sono più — filtro cambiato, articolo eliminato —
  // e restano le altre: un filtro più stretto non deve buttare via una scelta
  // fatta a mano su venti articoli.
  // Una sola passata sul DOM invece di una ricerca per ogni id scelto: con
  // «Mostra tutti» su qualche migliaio di righe, inspectorSync() gira a ogni
  // carattere digitato nel filtro, e lì la differenza si sente.
  if (inspSel.ids.length) {
    const presenti = new Set(inspectorRowIds());
    inspSel.ids = inspSel.ids.filter(id => presenti.has(id));
  }
  renderInspector();
  inspectorMarkRows();
}
function inspectorMarkRows() {
  const p = typeof document === 'undefined' ? null : document.getElementById('view-' + activeView);
  if (!p || !p.querySelectorAll) return;
  // Set invece dell'array: `includes` per ogni riga rendeva quadratico anche
  // il solo evidenziare la scelta, e questo gira a ogni ridisegno della griglia.
  const scelti = new Set(inspSel.view === activeView ? inspSel.ids : []);
  p.querySelectorAll('tr[data-sel]').forEach(tr => {
    tr.classList.toggle('row-selected', scelti.has(tr.dataset.sel));
  });
}

// Un solo ascoltatore per tutta la pagina invece di un onclick per riga: le
// righe si ridisegnano di continuo, e un gestore delegato non va riagganciato.
// I click sui comandi di riga e sul codice non selezionano: lì l'intenzione è
// un'altra, ed era già espressa prima che il pannello esistesse.
function inspectorRowClick(e) {
  if (!inspectorFor(activeView) || !inspOpen) return;
  const t = e.target;
  if (!t || !t.closest) return;
  if (t.closest('button, a, input, select, textarea, .code-link, [role="button"]')) return;
  const tr = t.closest('tr[data-sel]');
  if (!tr) return;
  const id = tr.dataset.sel;
  // Ctrl aggiunge, Maiusc prende l'intervallo, il click secco ricomincia. Sono
  // i gesti che si fanno in ogni elenco da trent'anni: qui non si inventa niente.
  if (e.ctrlKey || e.metaKey) { inspectorAddToSelection(id); return; }
  if (e.shiftKey) {
    // Il browser selezionerebbe il testo fra le due righe: qui il gesto vuol
    // dire un'altra cosa.
    if (typeof getSelection === 'function') { const s = getSelection(); if (s && s.removeAllRanges) s.removeAllRanges(); }
    inspectorExtendSelection(id);
    return;
  }
  const solaScelta = inspSel.view === activeView && inspSel.ids.length === 1 && inspSel.ids[0] === id;
  inspectorSelect(solaScelta ? null : id);
}
// Frecce per scorrere l'elenco, Invio per la scheda completa: chi inserisce
// dati tutto il giorno tiene le mani sulla tastiera, e cercare una riga col
// mouse a ogni articolo è il genere di attrito che si paga mille volte.
function inspectorArrow(passo, estendi) {
  const p = document.getElementById('view-' + activeView);
  if (!p || !p.querySelectorAll) return false;
  const righe = Array.prototype.slice.call(p.querySelectorAll('tr[data-sel]'));
  if (!righe.length) return false;
  // Ci si muove dall'**ultima** riga scelta, che è quella su cui è rimasta la
  // mano: con una scelta sola le due cose coincidono.
  const da = inspSel.view === activeView && inspSel.ids.length ? inspSel.ids[inspSel.ids.length - 1] : null;
  const cur = righe.findIndex(tr => tr.dataset.sel === da);
  const next = cur < 0 ? (passo > 0 ? 0 : righe.length - 1) : Math.min(righe.length - 1, Math.max(0, cur + passo));
  if (estendi) inspectorExtendSelection(righe[next].dataset.sel);
  else inspectorSelect(righe[next].dataset.sel);
  if (righe[next].scrollIntoView) righe[next].scrollIntoView({ block: 'nearest' });
  return true;
}
// I tasti valgono solo mentre si guarda l'elenco: dentro un campo la freccia
// muove il cursore, e nessuna scorciatoia deve rubarla.
function inspectorKey(e) {
  if (!inspectorFor(activeView) || !inspOpen) return false;
  const a = document.activeElement;
  if (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName || '')) return false;
  if (typeof panelTop === 'function' && panelTop()) return false;   // c'è una scheda aperta: comanda lei
  // Con Maiusc la freccia allarga la scelta invece di spostarla, come in
  // qualunque elenco: è il modo di prenderne venti senza staccare le mani.
  if (e.key === 'ArrowDown') return inspectorArrow(1, e.shiftKey);
  if (e.key === 'ArrowUp') return inspectorArrow(-1, e.shiftKey);
  if (e.key === 'Enter' && inspSel.ids.length === 1 && inspectorSelected()) { itemInfoModal(inspSel.ids[0]); return true; }
  if (e.key === 'Escape' && inspectorSelectedAll().length) { inspectorClear(); return true; }
  return false;
}

// ─── Ridimensionamento ───
// Stesso schema con cui si trascinano i pannelli (core.js): mousedown per
// prendere la misura, mousemove per aggiornarla, mouseup per lasciarla.
let _inspDrag = null;
function inspResizeStart(e) {
  if (!e.target || !e.target.classList || !e.target.classList.contains('insp-resizer')) return;
  _inspDrag = { x: e.clientX, w: inspWidth };
  document.body.classList.add('insp-resizing');
  e.preventDefault();
}
function inspResizeMove(e) {
  if (!_inspDrag) return;
  // Il pannello sta a destra: trascinando verso sinistra si allarga, quindi il
  // segno è invertito rispetto al movimento del mouse.
  inspWidth = inspClampWidth(_inspDrag.w + (_inspDrag.x - e.clientX));
  inspApplyWidth();
}
function inspResizeEnd() {
  if (!_inspDrag) return;
  _inspDrag = null;
  document.body.classList.remove('insp-resizing');
  inspPrefsSave();
}

if (typeof document !== 'undefined' && document.addEventListener) {
  inspPrefsLoad();
  document.addEventListener('click', inspectorRowClick);
  // pointer* invece di mouse*: sostituzione uno a uno, e la maniglia comincia a
  // funzionare anche col dito. Su tablet era inerte, e il pannello restava
  // largo quanto nasce rubando spazio all'elenco per sempre.
  document.addEventListener('pointerdown', inspResizeStart);
  document.addEventListener('pointermove', inspResizeMove);
  document.addEventListener('pointerup', inspResizeEnd);
  document.addEventListener('pointercancel', inspResizeEnd);   // il dito che esce dallo schermo
}
