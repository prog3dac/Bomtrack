// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-cicli.js
// ═══════════════════════════════════════════════════════════
// Vista Cicli di lavorazione: le fasi di parti e assiemi, i centri, i tempi.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
// Diviso da views-catalog.js nella 0.141.0: stesso ordine di caricamento, subito dopo.

// ═══════════════════════════════════════════════════════════
//  VISTA: CICLI DI LAVORAZIONE (le fasi di parti e assiemi)
// ═══════════════════════════════════════════════════════════
// Dalla 0.125.0 qui stanno solo le fasi, di parti e assiemi: il materiale di
// una parte sta nella sua distinta (Distinte base), come i componenti di un
// assieme. Le funzioni che modificano una riga usano il suo indice ASSOLUTO
// nell'array `cycle`: in un dato non ancora migrato ci sono anche le righe
// materiale, e un indice di sezione servirebbe solo a sbagliare.
// Nessuna bozza: qui si è in una vista, non in un form, e ogni azione salva
// subito come nella vista della distinta.

// Sposta di una posizione la k-esima riga di un certo kind, scambiandola con la
// riga vicina dello STESSO kind: tutte le altre restano dove sono. Logica pura
// (è l'unico punto con aritmetica sugli indici): ritorna un nuovo array, o
// quello ricevuto se lo spostamento non è possibile.
function moveKindRow(rows, kind, k, dir) {
  const list = Array.isArray(rows) ? rows : [];
  const pos = [];
  list.forEach((r, i) => { if (r && r.kind === kind) pos.push(i); });
  const to = k + (dir < 0 ? -1 : 1);
  if (k < 0 || k >= pos.length || to < 0 || to >= pos.length) return rows;
  const out = list.slice();
  const a = pos[k], b = pos[to];
  const tmp = out[a]; out[a] = out[b]; out[b] = tmp;
  return out;
}
// Numero di fase mostrato accanto a una lavorazione: 10, 20, 30… Deriva
// dall'ordine e non si salva, così non c'è una numerazione da tenere allineata.
function cyclePhaseNumber(k) { return (k + 1) * 10; }

// Riassunto testuale del contenuto, per il catalogo e la scheda articolo
function cycleCountLabel(it) {
  const art = distintaRighe(it).length;
  const lav = cicloFasi(it).length;
  if (!art && !lav) return 'Distinta e ciclo vuoti';
  return `${art} ${art === 1 ? 'articolo' : 'articoli'} · ${lav} ${lav === 1 ? 'lavorazione' : 'lavorazioni'}`;
}
function cycleRowLabel(row) {
  if (row.kind === 'op') {
    const wc = getWorkCenter(row.workCenterId);
    // Nella tabella delle fasi il tipo è già dato dalla sezione: basta il centro di lavoro
    return `${ico('wrench', 'tinted')} ${esc(wc ? wc.name : '?')}`;
  }
  const it = getItem(row.itemId);
  if (!it) return ico('warning', 'tinted') + ' articolo mancante';
  return `<span class="bom-type-tag tt-${typeKey(it.type)}">${typeShort(it.type)}</span>
    <span class="cycle-code">${codeLink(it.id, it.code)}</span> ${esc(it.name)}${itemBadges(it)}`;
}
// ─── Selezione della parte (filtri in cima alla vista) ───
// Dalla 0.124.0 anche gli assiemi: il loro ciclo sono le fasi di montaggio.
// Gli stessi articoli e gli stessi filtri delle Distinte base (distinteFiltrate
// in views-bom.js): testo, tipo, famiglia, sottofamiglia, macchina, gruppo.
function partItems() { return distinteArticoli(); }
function updateCycleFamilyFilters() { syncDistinteFiltri('cyc'); }
function cycleFilteredParts() {
  // Prima le parti, poi gli assiemi: chi apre i cicli cerca quasi sempre una parte.
  return distinteFiltrate('cyc').sort((a, b) => (isAssembly(a.type) - isAssembly(b.type)) || String(a.code).localeCompare(String(b.code)));
}
function cycleSearchInput() { debounced('cyc-sel', renderCycles); }
function onCycleFilterChange() { renderCycles(); }
function onCyclePartSelect() { currentCycleItemId = val('cyc-part'); renderCycles(); }
// La selezione resta valida finché la parte esiste ed è tra quelle filtrate,
// altrimenti si ricade sulla prima (stesso patto di ensureCurrentBom).
function ensureCurrentCycleItem(parts) {
  if (!parts.some(p => p.id === currentCycleItemId)) currentCycleItemId = parts.length ? parts[0].id : null;
}
// Apertura diretta su una parte, dal catalogo o dall'albero di distinta: i
// filtri si azzerano, altrimenti la parte appena scelta potrebbe non comparire.
function openCycleFor(id) {
  const it = getItem(id);
  if (!it || (it.type !== 'parte' && !isAssembly(it.type))) return;
  if (!vistaAttiva('cycles')) { setView('cycles'); return; }   // avvisa e resta al Riepilogo
  currentCycleItemId = id;
  ['search', 'type', 'family', 'subfamily', 'machine', 'group'].forEach(k => setVal('cyc-' + k, ''));
  // Anche lo scope condiviso (filters.js), altrimenti setView lo riscriverebbe
  // subito dopo sui campi appena svuotati, e la parte scelta potrebbe restare
  // fuori dal filtro come prima di questa pulizia.
  if (typeof filtScope !== 'undefined') { filtScope = { familyId: '', subFamilyId: '', machineId: '', groupId: '' }; filtPrefsSave(); }
  setView('cycles');
}
function currentCycleItem() {
  const it = getItem(currentCycleItemId);
  return it && (it.type === 'parte' || isAssembly(it.type)) ? it : null;
}

// Da dove viene il costo di questa parte, detto qui perché è la vista in cui si
// costruisce il ciclo — e vedere le righe senza sapere se contano sarebbe
// fuorviante. La scelta si fa nella scheda articolo, non qui: un solo posto.
function cycleSourcingNote(it) {
  const apri = `<button class="mini-btn" style="margin-left:8px" onclick="editItemModal('${it.id}')">${ico('edit', 'tinted', '')} Scheda articolo</button>`;
  const dist = `<button class="mini-btn" style="margin-left:8px" onclick="openBomFor('${it.id}')">${ico('tree', 'tinted', '')} Distinta</button>`;
  const n = distintaRighe(it).length;
  const materiale = `Il materiale per farla sta nella <strong>distinta</strong> della parte (${n ? n + (n === 1 ? ' riga' : ' righe') : 'vuota'}), qui le <strong>fasi</strong>.`;
  if (partSourcing(it) === 'buy') {
    const forn = supplierName(it.supplierId);
    return `<div class="cycle-note">${ico('cart', 'tinted')} <span><strong>Parte acquistata</strong>${forn ? ' da ' + esc(forn) : ' (nessun fornitore a listino)'}:
      il costo è il prezzo scelto nel listino. ${materiale} Distinta e ciclo restano documentali: non concorrono al costo e nel
      fabbisogno non vengono esplosi.</span>${dist}${apri}</div>`;
  }
  const vuoto = !(n || cicloFasi(it).length);
  return `<div class="cycle-note">${ico('factory', 'tinted')} <span><strong>Parte prodotta in casa</strong>: il costo lo determinano la distinta
    e il ciclo. ${materiale}${vuoto ? ' Finché sono vuoti vale il prezzo a listino.' : ''}</span>${dist}${apri}</div>`;
}

// Un assieme: i componenti stanno nella distinta, qui solo le fasi. I giorni
// di montaggio vengono sempre dalle fasi (dalla 0.124.0 non si dichiarano più).
function cycleAssiemeNote(it) {
  const apri = `<button class="mini-btn" style="margin-left:8px" onclick="apriAnelloDistinta('${it.id}')">${ico('tree', 'tinted', '')} Distinta</button>`;
  return `<div class="cycle-note">${ico('wrench', 'tinted')} <span><strong>${esc(typeLabel(it.type))}</strong>: i componenti stanno nella distinta, qui le <strong>fasi di montaggio</strong>.
    Entrano nel costo come le lavorazioni di una parte, caricano i centri, e con un ciclo l'assieme si può lanciare con un ordine di produzione.
    I giorni di montaggio vengono dalle fasi: ore ÷ (ore al giorno × operatori) in fila, e i giorni dal terzista per quelle in conto lavoro.</span>${apri}</div>`;
}

// ─── Disegno della vista ───
function renderCycles() {
  invalidateCaches();   // la cache dei costi vive dentro un singolo disegno
  updateCycleFamilyFilters();
  filtScopeApply('cycles', updateCycleFamilyFilters);   // dopo il sync, non prima: vedi nota in renderCatalog
  const parts = cycleFilteredParts();
  ensureCurrentCycleItem(parts);
  const partSel = document.getElementById('cyc-part');
  if (partSel) partSel.innerHTML = parts.length
    ? parts.map(p => `<option value="${p.id}" ${p.id === currentCycleItemId ? 'selected' : ''}>${esc(itemBadgesTxt(p) + (isAssembly(p.type) ? typeShort(p.type) + ' · ' : '') + p.code + ' — ' + p.name)}</option>`).join('')
    : `<option value="">— nessuna parte —</option>`;

  const body = document.getElementById('cyc-body');
  const it = currentCycleItem();
  renderCyclesRevBar();   // anche senza parte aperta: si svuota invece di restare com'era
  if (!it) {
    document.getElementById('cyc-summary').innerHTML = '';
    body.innerHTML = `<div class="empty-text">${partItems().length
      ? 'Nessuna parte con questi filtri.'
      : `Nessuna parte a catalogo. Creane una in <strong>${ico('tree', 'tinted')} Tecnico → Articoli di progetto → + Nuovo articolo</strong>.`}</div>`;
    filtMount('cycles');
    return;
  }
  renderCycleSummary(it);
  // Gli indici sono quelli dell'array `cycle`, perché è quello che le
  // modifiche toccano: in un dato non ancora migrato ci sono anche le righe
  // materiale di una parte, che qui non si mostrano (stanno nella distinta).
  const opRows = (it.cycle || []).map((r, i) => ({ r, i })).filter(x => x.r.kind === 'op');
  const assieme = isAssembly(it.type);
  body.innerHTML = `
    ${assieme ? cycleAssiemeNote(it) : cycleSourcingNote(it)}
    <div class="cycle-section">
      <div class="cycle-section-head">
        <h3>${ico('wrench', 'tinted pill', '')} ${assieme ? 'Ciclo di montaggio' : 'Ciclo di lavorazione'} <span class="cycle-dim">${opRows.length} ${opRows.length === 1 ? 'fase' : 'fasi'}</span></h3>
        <button class="add-btn-sm" onclick="addCycleOpRow()">+ Lavorazione</button>
      </div>
      <div class="cycle-box">${cycleOpsTable(opRows)}</div>
      <div id="picker-op"></div>
    </div>`;
  a11yFields(body);
  filtMount('cycles');
}
// Riepilogo in cima: le due metà del costo separate, come le due sezioni sotto.
function renderCycleSummary(it) {
  const el = document.getElementById('cyc-summary'); if (!el) return;
  const bomTot = distintaRighe(it).reduce((s, r) => s + cycleRowCost(r), 0);
  const opsTot = cicloFasi(it).reduce((s, r) => s + cycleRowCost(r), 0);
  const c = costOf(it.id);
  const u = itemUom(it);
  el.innerHTML = (isAssembly(it.type) ? [
    kpi('Fasi di montaggio', fmtPer(opsTot, u), 'green'),
    kpi('Costo ' + typeLabel(it.type).toLowerCase(), fmtPer(c.total, u), ''),
  ] : [
    kpi('Distinta', fmtPer(bomTot, u), 'orange'),
    kpi('Lavorazioni', fmtPer(opsTot, u), 'green'),
    kpi('Costo unitario a mano', fmtPer(Number(it.unitCost) || 0, u), 'purple'),
    kpi('Costo parte', fmtPer(c.total, u), ''),
  ]).join('') + (c.cycle ? '<div class="empty-text" style="color:var(--red)">' + ico('warning', 'tinted') + ' Rilevato riferimento ciclico: una riga risale a questa stessa parte.</div>' : '');
}
function cycleOpsTable(opRows) {
  if (!opRows.length) return '<div class="empty-text" style="padding:8px 0">Nessuna lavorazione. Usa "+ Lavorazione" per aggiungere una fase.</div>';
  // ── La colonna «Tempo» misura due cose diverse, e non è una scorciatoia ──
  // Una fase **interna** occupa una macchina: il suo tempo si conta in **ore**,
  // ed è quello che finisce nel carico dei centri.
  // Una fase in **conto lavoro** non occupa niente di nostro: il pezzo esce e
  // torna, e il suo tempo è un **attraversamento in giorni**. Contarlo in ore
  // significherebbe rispondere alla domanda sbagliata — a nessuno interessa
  // quante ore ci mette il terzista, interessa **quando ripresenta il pezzo**,
  // ed è da lì che si ricava entro quando mandargli l'ordine di lavoro.
  //
  // Le ore di una fase esterna a costo orario non spariscono: restano dove sono
  // un **costo**, cioè accanto alla tariffa nella cella del costo. Sono le ore
  // che il terzista fattura, non il nostro tempo.
  const head = `<div class="cycle-row cycle-op-row cycle-head">
    <span>Fase</span><span>Lavorazione</span><span>Fornitore</span><span>Modo</span>
    <span class="num" title="Interna: tempo fase e attrezzaggio in minuti, l'occupazione del centro che alimenta il Carico centri. Conto lavoro: giorni di attraversamento, da cui si ricava entro quando mandare l'ordine di lavoro">Tempo</span>
    <span class="num">Costo</span><span class="num">Costo riga (${esc(cur())}/pz)</span><span>Ordine</span><span></span></div>`;
  const last = opRows.length - 1;
  const tratte = typeof clCycleRuns === 'function' ? clCycleRuns(currentCycleItem()) : [];
  return head + opRows.map(({ r, i }, k) => {
    const orario = r.costMode === 'orario';
    const esterna = !!r.supplierId;
    // In modo orario le ore sono la base del costo e stanno con la tariffa: su
    // una fase esterna sono l'unico posto in cui compaiono, perché la colonna
    // del tempo lì misura giorni.
    const costoCell = orario
      ? `<span class="cycle-op-cost">
          ${esterna ? `<label class="cycle-op-f"><span>Ore fatturate (h/pz)</span><input class="num" type="number" min="0" step="0.25" value="${Number(r.hours) || 0}" title="Ore fatturate dal terzista, per pezzo"
            onchange="updateCycleRow(${i})" id="cyc-ophours-${i}"></label>` : ''}
          <label class="cycle-op-f"><span>Tariffa (${esc(cur())}/h)</span><input class="num" type="number" min="0" step="0.5" value="${Number(r.rate) || 0}" title="Tariffa ${esc(cur())}/h"
            onchange="updateCycleRow(${i})" id="cyc-oprate-${i}"></label>
        </span>`
      : `<label class="cycle-op-f"><span>Costo fisso (${esc(cur())}/pz)</span><input class="num" type="number" min="0" step="0.01" value="${Number(r.cost) || 0}"
          title="Costo fisso della lavorazione, per pezzo" onchange="updateCycleRow(${i})" id="cyc-cost-in-${i}"></label>`;
    // Attrezzaggio e coda (fase interna) e trasporto (conto lavoro) sono della
    // fase dalla 0.131.0, proposti da centro e fornitore. Nessun conto in
    // giorni qui: il ciclo non sa quanti pezzi si faranno, e i giorni li
    // calcola chi la quantità ce l'ha — fabbisogno, ODP, capacità finita.
    const tratta = esterna ? tratte.find(t => k >= t.from && k <= t.to) : null;
    const primaTratta = !tratta || tratta.from === k;
    const sup = esterna ? getSupplier(r.supplierId) : null;
    const tempoCell = esterna
      ? `<span class="cycle-op-time cycle-op-time-int"><label class="cycle-op-f"><span>Attraversamento (gg)</span><input class="num" type="number" min="0" step="1" value="${Number(r.days) || 0}"
          title="Giorni di attraversamento dal terzista: da qui si ricava entro quando mandargli l'ordine di lavoro"
          onchange="updateCycleRow(${i})" id="cyc-opdays-${i}"></label>
          <label class="cycle-op-f"><span>Trasporto (gg)</span><input class="num" type="number" min="0" max="99" step="1" value="${primaTratta ? faseTrasporto(r) : 0}" ${primaTratta ? '' : 'disabled'}
          title="${primaTratta ? `Trasporto verso e dal terzista, andata più ritorno, in giorni. Proposto dal fornitore${sup ? ` (${Number(sup.transitDays) || 0} gg)` : ''}, si può cambiare` : `Il trasporto della tratta è quello della fase ${cyclePhaseNumber(tratta.from)}: il pezzo va e torna una volta sola`}"
          onchange="updateCycleRow(${i})" id="cyc-optransit-${i}"></label></span>`
      : `<span class="cycle-op-time cycle-op-time-int cycle-op-time-grid"><label class="cycle-op-f"><span>Tempo/pz (min)</span><input class="num" type="number" min="0" step="1" value="${minDaOre(r.hours)}"
          title="Tempo fase: minuti-uomo per pezzo${orario ? '' : ' — non entrano nel costo, servono al carico del centro'}"
          onchange="updateCycleRow(${i})" id="cyc-opmin-${i}"></label>
          <label class="cycle-op-f"><span>Operatori (n.)</span><input class="num" type="number" min="1" step="1" value="${faseOperatori(r)}"
          title="Operatori che lavorano insieme sulla fase: i giorni sono le ore divise per le ore al giorno di un operatore per gli operatori"
          onchange="updateCycleRow(${i})" id="cyc-opop-${i}"></label>
          <label class="cycle-op-f"><span>Attrezz. (min)</span><input class="num" type="number" min="0" step="1" value="${minDaOre(faseAttrezzaggio(r))}"
          title="Attrezzaggio della fase, in minuti: si conta una volta per lotto, non per pezzo. Proposto dal centro (${fmtMin(wcAttrezzaggio(getWorkCenter(r.workCenterId)))})"
          onchange="updateCycleRow(${i})" id="cyc-opsetup-${i}"></label>
          <label class="cycle-op-f"><span>Coda (gg)</span><input class="num" type="number" min="0" max="99" step="1" value="${faseCoda(r)}"
          title="Giorni di coda: quanto il pezzo aspetta davanti al centro prima della fase. Proposto dal centro (${wcCoda(getWorkCenter(r.workCenterId))} gg)"
          onchange="updateCycleRow(${i})" id="cyc-opqueue-${i}"></label></span>`;
    return `<div class="cycle-row cycle-op-row">
      <span class="cycle-phase">${cyclePhaseNumber(k)}</span>
      <span class="cycle-name">${cycleRowLabel(r)}${cycleMachineCell(r, i)}</span>
      <select class="cycle-sup sel-cerca" title="Interna, o conto lavoro se si sceglie un fornitore" onchange="onCycleRowSupplierChange(${i})" id="cyc-sup-${i}">${wcSupplierOptions(getWorkCenter(r.workCenterId), r.supplierId || '')}</select>
      <select onchange="onCycleRowModeChange(${i})" id="cyc-opmode-${i}">
        <option value="fisso" ${!orario ? 'selected' : ''}>Fisso</option>
        <option value="orario" ${orario ? 'selected' : ''}>Orario</option>
      </select>
      ${tempoCell}
      ${costoCell}
      <span class="num cost" id="cyc-cost-${i}" title="${esc(costoFaseDettaglio(r))}">${fmtN(cycleRowCost(r))}</span>
      <span class="cycle-move">
        <button class="mini-btn" title="Sposta su" onclick="moveCycleOp(${k},-1)" ${k === 0 ? 'disabled' : ''}>↑</button>
        <button class="mini-btn" title="Sposta giù" onclick="moveCycleOp(${k},1)" ${k === last ? 'disabled' : ''}>↓</button>
      </span>
      <button class="mini-btn danger" title="Elimina" onclick="delCycleRow(${i})">${ico('trash', 'tinted', 'Elimina')}</button>
      <label class="cycle-op-nota"><span>Note per il reparto</span><input type="text" maxlength="500" value="${esc(r.note || '')}" id="cyc-opnote-${i}"
        placeholder="es. controllare il diametro ogni 10 pezzi" title="Vanno sull'ordine di produzione al lancio, e sulla scheda della fase in Reparto"
        onchange="updateCycleNote(${i})"></label>
    </div>`;
  }).join('');
}
// ─── Export del ciclo aperto ───
// I Cicli non sono un elenco ma una scheda: si esporta la parte che si sta
// guardando, con le sue due tavole. `cycleRowLabel` qui non serve — restituisce
// HTML, e in un foglio di calcolo un tag è solo sporcizia.
function cycleExportSpec() {
  const it = currentCycleItem();
  // La distinta della parte resta nell'export del suo ciclo: è il foglio che
  // si dà a chi la fa, e il materiale ci serve.
  const bom = distintaRighe(it).map((r, i) => ({ r, i }));
  const ops = cicloFasi(it).map((r, i) => ({ r, i }));
  const fam = getFamily(val('cyc-family'));
  const sub = (fam && (fam.subs || []).find(s => s.id === val('cyc-subfamily'))) || null;
  const tot = rs => +rs.reduce((s, x) => s + cycleRowCost(x.r), 0).toFixed(2);
  const nome = it ? ((it.code || '') + ' — ' + (it.name || '')).trim() : '(nessuna parte)';
  return {
    titolo: 'Ciclo di lavorazione — ' + nome,
    // Il codice finisce nel nome del file: quello che non è lettera o cifra
    // diventa un trattino, perché una barra in un nome di file non è un nome.
    slug: 'ciclo_' + String((it && it.code) || 'parte').replace(/[^A-Za-z0-9]+/g, '-'),
    filtri: [
      ['Parte', nome],
      ['Ricerca', val('cyc-search')],
      ['Famiglia', fam ? fam.name : ''],
      ['Sottofamiglia', sub ? sub.name : ''],
    ],
    sezioni: [
      {
        nome: 'Distinta',
        colonne: [
          { h: 'Codice', w: 18 }, { h: 'Descrizione', w: 34 }, { h: 'Fornitore', w: 24 },
          { h: 'U.M.', w: 8 }, { h: 'Q.tà', w: 10, num: true },
          { h: `Costo unitario (${cur()}/U.M.)`, w: 18, num: true },
          { h: `Costo riga (${cur()})`, w: 16, num: true },
        ],
        righe: bom.map(({ r }) => {
          const ci = getItem(r.itemId);
          return [ci ? (ci.code || '') : '(articolo mancante)', ci ? (ci.name || '') : '',
            supplierName(ci && ci.supplierId) || '', ci ? (ci.uom || '') : '',
            // Il costo di un'unità, come dice la colonna: prima c'era quello della riga.
            Number(r.qty) || 0, +(ci ? costOf(ci.id).total : 0).toFixed(4), +cycleRowCost(r).toFixed(2)];
        }),
        totali: bom.length ? ['Totale distinta', '', '', '', '', '', tot(bom)] : null,
      },
      {
        nome: 'Ciclo di lavorazione',
        colonne: [
          { h: 'Fase', w: 8, num: true }, { h: 'Lavorazione', w: 34 }, { h: 'Fornitore', w: 24 },
          // Due colonne e non una: le ore e i giorni misurano cose diverse, e in
          // un foglio di calcolo una colonna che cambia unità riga per riga non
          // si può sommare né filtrare.
          // Tempo fase e attrezzaggio in minuti come nell'editor; le ore che il
          // terzista fattura a costo orario restano ore, accanto alla tariffa.
          { h: 'Tempo fase (min/pz)', w: 18, num: true }, { h: 'Attrezzaggio (min)', w: 16, num: true },
          { h: 'Ore fatturate (h/pz)', w: 18, num: true },
          { h: 'Coda (gg)', w: 10, num: true }, { h: 'Giorni (gg)', w: 12, num: true }, { h: 'Trasporto (gg)', w: 13, num: true },
          { h: `Costo (${cur()})`, w: 16, num: true },
        ],
        righe: ops.map(({ r }, k) => {
          const wc = getWorkCenter(r.workCenterId);
          const mac = !r.supplierId ? faseMacchinaNome(r) : '';
          return [cyclePhaseNumber(k), (wc ? wc.name : '(centro mancante)') + (mac ? ' · ' + mac : ''),
            supplierName(r.supplierId) || '', r.supplierId ? '' : minDaOre(r.hours),
            r.supplierId ? '' : minDaOre(faseAttrezzaggio(r)), r.supplierId ? (Number(r.hours) || 0) : '', r.supplierId ? '' : faseCoda(r),
            Number(r.days) || 0, r.supplierId ? faseTrasporto(r) : '',
            +cycleRowCost(r).toFixed(2)];
        }),
        totali: ops.length
          ? ['Totale lavorazioni', '', '', +ops.reduce((s, x) => s + (x.r.supplierId ? 0 : minDaOre(x.r.hours)), 0).toFixed(2), '', '', '',
            +ops.reduce((s, x) => s + (Number(x.r.days) || 0), 0).toFixed(0), '', tot(ops)]
          : null,
      },
    ],
  };
}

// Dopo una modifica di valore si aggiornano solo le celle calcolate: ridisegnare
// tutto porterebbe via il campo su cui l'utente sta passando col tabulatore.
function refreshCycleCosts(it) {
  (it.cycle || []).forEach((row, i) => {
    const el = document.getElementById('cyc-cost-' + i);
    if (el) { el.textContent = fmtN(cycleRowCost(row)); if (row.kind === 'op') el.title = costoFaseDettaglio(row); }
    const ovr = document.getElementById('cyc-ovr-' + i);
    if (ovr) ovr.placeholder = cycleRowComputed(row).toFixed(2);
  });
  renderCycleSummary(it);
}

// ─── Modifiche (salvataggio immediato) ───
function updateCycleRow(idx) {
  const it = currentCycleItem(); if (!it) return;
  // Il ridisegno rimette il valore salvato: senza permessi il campo non resta modificato a video
  if (!roleGuard('catalog') || !revBozzaLibera(it.id)) { renderCycles(); return; }
  const row = (it.cycle || [])[idx]; if (!row || row.kind !== 'op') return;
  {
    // Il tempo cambia unità con la natura della fase: ore su una lavorazione
    // interna, giorni di attraversamento su una in conto lavoro. I due campi
    // esistono entrambi sulla riga, ma solo uno per volta è a video — leggere
    // quello assente riporterebbe zero e cancellerebbe l'altro.
    // La domanda giusta è cosa mostra il DOM **adesso**, cioè prima di questo
    // salvataggio: se questa chiamata arriva da un cambio di fornitore, la riga
    // non si è ancora ridisegnata, e `row.supplierId` già nuovo direbbe il
    // contrario di ciò che l'utente ha davanti (leggendo un campo che non c'è
    // si azzererebbe in silenzio quello vero).
    const eraEsterna = !!row.supplierId;
    row.supplierId = val('cyc-sup-' + idx);
    if (eraEsterna) {
      row.days = numVal('cyc-opdays-' + idx, 0);
      // Solo la prima fase della tratta ha il trasporto a video: le altre lo
      // hanno spento, e lì non si scrive niente.
      const tr = document.getElementById('cyc-optransit-' + idx);
      if (tr && !tr.disabled) row.transitDays = Math.round(numVal('cyc-optransit-' + idx, 0, 99));
    } else {
      // Tempo fase e attrezzaggio a video in minuti, salvati in ore.
      row.hours = oreDaCampoMin('cyc-opmin-' + idx, row.hours);
      row.operators = Math.max(1, Math.round(numVal('cyc-opop-' + idx, 1)));
      row.setupHours = oreDaCampoMin('cyc-opsetup-' + idx, row.setupHours);
      row.queueDays = Math.round(numVal('cyc-opqueue-' + idx, 0, 99));
    }
    if (row.costMode === 'orario') {
      row.rate = numVal('cyc-oprate-' + idx, 0);
      // Su una fase esterna a costo orario le ore sono quelle **fatturate**, e
      // stanno con la tariffa: è l'unico punto in cui compaiono.
      if (eraEsterna) row.hours = numVal('cyc-ophours-' + idx, 0);
    } else row.cost = numVal('cyc-cost-in-' + idx, 0);
  }
  touch(it); saveDB();
  refreshCycleCosts(it);
}
// Le note della fase (dalla 0.132.0): le istruzioni per chi la lavora. Le
// porta l'ODP, che le congela al lancio come il resto della fase, e le mostra
// la scheda di reparto.
function updateCycleNote(idx) {
  const it = currentCycleItem(); if (!it) return;
  if (!roleGuard('catalog') || !revBozzaLibera(it.id)) { renderCycles(); return; }
  const row = (it.cycle || [])[idx]; if (!row || row.kind !== 'op') return;
  row.note = val('cyc-opnote-' + idx).trim();
  touch(it); saveDB();
}
// Cambiare il fornitore di una lavorazione a costo orario ripropone la
// tariffa (quella registrata per quel fornitore sul centro di lavoro, o
// quella del centro) prima di salvare — resta comunque un campo modificabile.
function onCycleRowSupplierChange(idx) {
  const it = currentCycleItem(); if (!it) return;
  if (!revBozzaLibera(it.id)) { renderCycles(); return; }
  const row = (it.cycle || [])[idx]; if (!row) return;
  if (row.costMode === 'orario') {
    const wc = getWorkCenter(row.workCenterId);
    const rateEl = document.getElementById('cyc-oprate-' + idx);
    if (rateEl) rateEl.value = wcRateFor(wc, val('cyc-sup-' + idx));
  }
  const eraEsterna = !!row.supplierId;
  const primaSup = row.supplierId || '';
  updateCycleRow(idx);
  // Un terzista nuovo propone il suo trasporto, come propone la sua tariffa;
  // tornando interna la fase riprende quelli proposti dal centro.
  if ((row.supplierId || '') !== primaSup) {
    if (row.supplierId) row.transitDays = supplierTransitDays(row.supplierId);
    else {
      const wc = getWorkCenter(row.workCenterId);
      row.setupHours = wcAttrezzaggio(wc);
      row.queueDays = wcCoda(wc);
    }
    touch(it); saveDB();
  }
  // Passare da interna a conto lavoro (o viceversa) cambia **cosa misura** la
  // colonna del tempo: si ridisegna, o resterebbe a video un campo che scrive
  // in un altro posto.
  if (eraEsterna !== !!row.supplierId || (row.supplierId || '') !== primaSup) renderCycles();
}
// Passare da fisso a orario (o viceversa) cambia quali campi contano per il
// costo: si ridisegna la riga così i campi giusti compaiono subito.
function onCycleRowModeChange(idx) {
  const it = currentCycleItem(); if (!it) return;
  if (!roleGuard('catalog') || !revBozzaLibera(it.id)) { renderCycles(); return; }
  const row = (it.cycle || [])[idx]; if (!row) return;
  row.costMode = val('cyc-opmode-' + idx) === 'orario' ? 'orario' : 'fisso';
  // Le ore non si toccano cambiando modo: sono un tempo, e il tempo della fase
  // non cambia perché è cambiato il modo in cui la si paga. Il valore proposto
  // alle fasi nuove sta in pickCycleOp.
  if (row.costMode === 'orario' && !row.rate) {
    row.rate = wcRateFor(getWorkCenter(row.workCenterId), row.supplierId);
  }
  touch(it); saveDB(); renderCycles();
}
function delCycleRow(idx) {
  const it = currentCycleItem(); if (!it) return;
  if (!roleGuard('catalog') || !revBozzaLibera(it.id)) return;
  if (!(it.cycle || [])[idx]) return;
  it.cycle.splice(idx, 1);
  touch(it); saveDB(); renderCycles(); savedToast('Riga eliminata');
}
function moveCycleOp(k, dir) {
  const it = currentCycleItem(); if (!it) return;
  if (!roleGuard('catalog') || !revBozzaLibera(it.id)) return;
  const next = moveKindRow(it.cycle || [], 'op', k, dir);
  if (next === it.cycle) return;   // già in cima o in fondo
  it.cycle = next;
  touch(it); saveDB(); renderCycles();
}
function closeCyclePicker() {
  ['picker-op'].forEach(id => { const b = document.getElementById(id); if (b) b.innerHTML = ''; });
}
// Selettore inline di una lavorazione da un centro di lavoro esistente:
// interna o conto lavoro (a seconda del fornitore scelto), a costo fisso o
// orario (ore × tariffa, proposta dal fornitore/centro e poi modificabile).
function addCycleOpRow() {
  if (!roleGuard('catalog') || !revBozzaLibera(currentCycleItemId)) return;
  const box = document.getElementById('picker-op'); if (!box) return;
  if (!db.workCenters.length) { showToast('Aggiungi prima un centro di lavoro in Gestione', 'error'); return; }
  const wc = db.workCenters.filter(w => w.active !== false)[0] || null;
  box.innerHTML = `<div class="cycle-picker-box">
    <div class="modal-grid">
      <div class="modal-field"><label>Centro di lavoro</label><select id="cyc-wc" onchange="onCycleOpWcChange()">${wcOptionsNoRate(null)}</select></div>
      <div class="modal-field"><label>Interna / Conto lavoro</label><select id="cyc-opsup" class="sel-cerca" onchange="onCycleOpSupChange()">${wcSupplierOptions(wc, '')}</select></div>
      <div class="modal-field" id="cyc-mac-box" style="display:none"><label>Macchina</label><select id="cyc-mac"
        title="La macchina del centro su cui si fa la fase: a costo orario la sua tariffa si somma a quella del centro, sulle ore divise per gli operatori"></select></div>
    </div>
    <div class="modal-grid">
      <div class="modal-field"><label>Costo</label><select id="cyc-opmode" onchange="onCycleOpModeChange()">
        <option value="fisso">Fisso</option><option value="orario">Orario</option></select></div>
      <div class="modal-field" id="cyc-optime-min"><label>Tempo fase (min/pz)</label><input type="number" id="cyc-opmin" min="0" step="1" value="60"
        title="Minuti-uomo per pezzo: l'occupazione del centro. A costo fisso non entrano nel costo: servono al Carico centri"></div>
      <div class="modal-field" id="cyc-optime-h" style="display:none"><label>Ore fatturate (h/pz)</label><input type="number" id="cyc-ophours" min="0" step="0.25" value="1"
        title="Ore che il terzista fattura per pezzo, alla tariffa oraria"></div>
      <div class="modal-field" id="cyc-optime-op"><label>Operatori (n.)</label><input type="number" id="cyc-opop" min="1" step="1" value="1"
        title="Quanti lavorano insieme sulla fase: i giorni sono le ore divise per le ore al giorno di un operatore per gli operatori"></div>
      <div class="modal-field" id="cyc-optime-gg" style="display:none"><label>Attraversamento (gg)</label><input type="number" id="cyc-opdays" min="0" step="1" value="0"
        title="Giorni di attraversamento dal terzista: da qui si ricava entro quando mandargli l'ordine di lavoro"></div>
      <div class="modal-field" id="cyc-optime-setup"><label>Attrezzaggio (min)</label><input type="number" id="cyc-opsetup" min="0" step="1" value="${minDaOre(wcAttrezzaggio(wc))}"
        title="Minuti di attrezzaggio della fase, una volta per lotto. Proposti dal centro"></div>
      <div class="modal-field" id="cyc-optime-queue"><label>Coda (gg)</label><input type="number" id="cyc-opqueue" min="0" max="99" step="1" value="${wcCoda(wc)}"
        title="Giorni che il pezzo aspetta davanti al centro prima della fase. Proposti dal centro"></div>
      <div class="modal-field" id="cyc-optime-transit" style="display:none"><label>Trasporto (gg)</label><input type="number" id="cyc-optransit" min="0" max="99" step="1" value="0"
        title="Giorni di trasporto verso e dal terzista, andata più ritorno. Proposti dal fornitore"></div>
    </div>
    <div class="modal-grid" id="cyc-opmode-fisso">
      <div class="modal-field"><label>Costo fisso (${cur()}/pz)</label><input type="number" id="cyc-opcost" min="0" step="0.01" value="0"></div>
    </div>
    <div class="modal-grid" id="cyc-opmode-orario" style="display:none">
      <div class="modal-field"><label>Tariffa (${cur()}/h)</label><input type="number" id="cyc-oprate" min="0" step="0.5" value="0"></div>
    </div>
    <div class="modal-field"><label>Note per il reparto</label><input type="text" id="cyc-opnote" maxlength="500" placeholder="es. controllare il diametro ogni 10 pezzi" autocomplete="off"></div>
    <div class="cycle-actions">
      <button class="btn-ghost" onclick="closeCyclePicker()">Annulla</button>
      <button class="add-btn-sm" onclick="pickCycleOp()">Aggiungi</button>
    </div>
  </div>`;
  cyclePickerMachineSync();
}
// Cambiare centro di lavoro ricostruisce l'elenco fornitori (i "conto lavoro
// abituali" dipendono dal centro scelto), stesso schema a cascata delle
// famiglie/sottofamiglie (syncFamilyFilters).
function onCycleOpWcChange() {
  const wc = getWorkCenter(val('cyc-wc'));
  const supSel = document.getElementById('cyc-opsup');
  if (supSel) supSel.innerHTML = wcSupplierOptions(wc, '');
  // Attrezzaggio e coda proposti dal centro scelto, come la tariffa.
  const setup = document.getElementById('cyc-opsetup'); if (setup) setup.value = minDaOre(wcAttrezzaggio(wc));
  const coda = document.getElementById('cyc-opqueue'); if (coda) coda.value = wcCoda(wc);
  onCycleOpSupChange();
}
// Il trasporto proposto dal terzista scelto.
function onCycleOpSupChange() {
  const tr = document.getElementById('cyc-optransit');
  if (tr) tr.value = supplierTransitDays(val('cyc-opsup'));
  onCycleOpModeChange();
}
function onCycleOpModeChange() {
  const orario = val('cyc-opmode') === 'orario';
  const esterna = !!val('cyc-opsup');
  const mostra = (id, si) => { const el = document.getElementById(id); if (el) el.style.display = si ? '' : 'none'; };
  mostra('cyc-opmode-fisso', !orario);
  mostra('cyc-opmode-orario', orario);
  // Il tempo di una fase interna sono minuti per pezzo; quello di una in conto
  // lavoro sono giorni di attraversamento. A costo orario una fase esterna
  // vuole anche le ore fatturate, ma come base del costo: lì si chiedono entrambi.
  mostra('cyc-optime-min', !esterna);
  mostra('cyc-optime-h', esterna && orario);
  mostra('cyc-optime-gg', esterna);
  mostra('cyc-optime-op', !esterna);
  mostra('cyc-optime-setup', !esterna);
  mostra('cyc-optime-queue', !esterna);
  mostra('cyc-optime-transit', esterna);
  if (orario) {
    const rateEl = document.getElementById('cyc-oprate');
    if (rateEl) rateEl.value = wcRateFor(getWorkCenter(val('cyc-wc')), val('cyc-opsup'));
  }
  cyclePickerMachineSync();
}
function pickCycleOp() {
  const it = currentCycleItem(); if (!it) return;
  if (!roleGuard('catalog') || !revBozzaLibera(it.id)) return;
  const wcId = val('cyc-wc');
  if (!wcId) { showToast('Seleziona un centro di lavoro', 'error'); return; }
  if (!Array.isArray(it.cycle)) it.cycle = [];
  const orario = val('cyc-opmode') === 'orario';
  const supplierId = val('cyc-opsup');
  const esterna = !!supplierId;
  // In fondo all'elenco: l'ultima fase aggiunta è l'ultima del ciclo, poi si sposta con ↑↓
  // Ore e giorni: si legge solo il campo che era davvero a video (stessa
  // condizione di onCycleOpModeChange) — altrimenti il valore proposto di
  // serie nel campo nascosto (le ore fatturate nascono a 1) entrerebbe come se
  // qualcuno l'avesse scritto.
  const row = { kind: 'op', workCenterId: wcId, supplierId,
    costMode: orario ? 'orario' : 'fisso',
    hours: !esterna ? oreDaMin(numVal('cyc-opmin', 0)) : orario ? numVal('cyc-ophours', 0) : 0,
    days: esterna ? numVal('cyc-opdays', 0) : 0, note: val('cyc-opnote').trim() };
  if (!esterna) row.operators = Math.max(1, Math.round(numVal('cyc-opop', 1)));
  // Tutte e tre su ogni fase, a zero dove non servono, come le scrive la
  // migrazione: la colonna c'è per tutte le righe.
  row.setupHours = esterna ? 0 : oreDaMin(numVal('cyc-opsetup', 0));
  row.queueDays = esterna ? 0 : Math.round(numVal('cyc-opqueue', 0, 99));
  row.transitDays = esterna ? Math.round(numVal('cyc-optransit', 0, 99)) : 0;
  if (!esterna && val('cyc-mac')) impostaMacchinaFase(row, val('cyc-mac'));
  if (orario) row.rate = numVal('cyc-oprate', 0);
  else row.cost = numVal('cyc-opcost', 0);
  it.cycle.push(row);
  closeCyclePicker();
  touch(it); saveDB(); renderCycles(); savedToast('Lavorazione aggiunta');
}

// La scheda si apre **prima**, e solo se si apre davvero si dichiara su cosa si
// sta lavorando. openModal() può rifiutare — con un'altra scheda già aperta
// chiede conferma, e «Annulla» vuol dire «lascia le cose come stanno» — ma lo
// stato era già stato riscritto sopra: restava la scheda di prima a schermo con
// le variabili che parlavano di un altro articolo. Un «Annulla» che cambia
// qualcosa è peggio del problema che voleva evitare.
function newItemModal(scope) {
  if (!roleGuard('catalog')) return;
  scope = CATALOG_SCOPES[scope] ? scope : 'buy';
  const p = openModal(`<h3>${ico(scope === 'buy' ? 'package' : 'tree', 'tinted pill', '')} Nuovo articolo — ${esc(CATALOG_SCOPES[scope].title)}</h3>${itemModalBody(null, scope)}
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveNewItem()">Crea</button></div>`, true);
  if (!p) return;
  itemCodeAuto = true;
  window.__dupSourceId = null;
  window.__editingItemId = null;
  window.__itemScope = scope;
  itemTabCorrente = 'ana';
  toggleItemFields();
}
// Ricerca live di un articolo sorgente da cui duplicare (tutti i tipi).
function renderSourceResults() {
  const box = document.getElementById('src-results'); if (!box) return;
  const q = (val('src-search') || '').toLowerCase();
  if (!q) { box.innerHTML = ''; return; }
  // Solo articoli dello stesso scope: il menu Tipo della modale non conosce gli altri
  const types = (CATALOG_SCOPES[window.__itemScope] || CATALOG_SCOPES.buy).types;
  const rows = db.items.filter(i => types.includes(i.type) && (i.code + ' ' + i.name).toLowerCase().includes(q))
    .sort((a, b) => String(a.code).localeCompare(String(b.code))).slice(0, 50);
  box.innerHTML = rows.map(i =>
    `<div class="picker-row" ${clickAttrs(`applyItemSource('${i.id}')`, `Copia i dati di ${i.code}`)}>
       <span class="picker-type">${typeLabel(i.type)}</span><b>${esc(i.code)}</b> — ${esc(i.name)}${itemBadges(i)}
     </div>`).join('') || `<div class="picker-empty">Nessun articolo trovato</div>`;
}
// Precompila il form "Nuovo articolo" coi dati della sorgente (codice escluso, sempre univoco).
function applyItemSource(id) {
  const src = getItem(id); if (!src) return;
  window.__dupSourceId = id;
  itemCodeAuto = true;
  codeManualUi(false);
  setVal('it-type', src.type); toggleItemFields();
  if (usesFamily(src.type)) {
    setVal('it-family', src.familyId || '');
    document.getElementById('it-subfamily').innerHTML = subFamilyOptions(src.familyId || '', src.subFamilyId || '');
  }
  // Appartenenza copiata; la sigla della macchina no (deve restare univoca)
  if (src.type === 'gruppo' || src.type === 'sottogruppo' || src.type === 'parte') {
    setVal('it-machine', src.machineItemId || '');
    onItemMachineChange();
    if (src.type === 'gruppo') setVal('it-sigla-grp', src.sigla || '');
    else setVal('it-group', src.groupItemId || '');
  }
  // Nome: le parti copiano concetto + descrizione, gli altri tipi il nome libero
  if (src.type === 'parte') {
    setVal('it-concept', src.conceptId || '');
    setVal('it-namefree', (src.nameFree != null ? src.nameFree : src.name) + ' (copia)');
    updatePartNamePreview();
  } else {
    setVal('it-name', src.name + ' (copia)');
  }
  setVal('it-uom', src.uom || defaultUom());
  // L'unità alternativa e il fattore viaggiano con le quotazioni copiate (dalla
  // 0.105.3): una quotazione a kg su una copia senza kg diventava un prezzo al
  // metro, e il costo usciva sbagliato del fattore (8 volte, su una barra).
  if (document.getElementById('it-altuom')) {
    setVal('it-altuom', src.altUom || '');
    setVal('it-altfactor', src.altFactor != null ? src.altFactor : '');
    if (typeof itemUomLabelsRefresh === 'function') itemUomLabelsRefresh();
  }
  if (src.type === 'parte') setVal('it-sourcing', partSourcingScritto(src));
  // Il codice a barre no: identifica quel prodotto, e sul duplicato sarebbe
  // subito un doppione.
  ITEM_TECH_FIELDS.forEach(([k, id]) => { if (k !== 'barcode') setVal(id, src[k] != null ? src[k] : ''); });
  setVal('it-notes', src.notes || '');
  setVal('it-code', '');
  refreshItemCode();
  const box = document.getElementById('src-results'); if (box) box.innerHTML = '';
  setVal('src-search', src.code + ' — ' + src.name);
}
function duplicateItemModal(id) {
  if (!roleGuard('catalog')) return;
  const src = getItem(id); if (!src) return;
  newItemModal(scopeOf(src.type));
  applyItemSource(id);
}
function readItemForm(it) {
  // Difesa in profondità: gli stessi campi che la scheda disabilita non si
  // riscrivono nemmeno da qui, indipendentemente da cosa contiene il form —
  // un campo disabled non cambia valore da solo, ma non è questo il punto in
  // cui fidarsi del DOM è la sola garanzia.
  const lock = itemLockState(it);
  if (!lock.structLocked) {
    it.code = val('it-code') || it.id;
    const man = !itemCodeAuto;
    if (man && !it.codeManual) { it.codeManualAt = nowISO(); it.codeManualBy = actorId || null; }
    if (!man) { delete it.codeManualAt; delete it.codeManualBy; }
    it.codeManual = man;
  }
  // Il motivo si può scrivere anche dopo, quando il codice è ormai bloccato.
  if (it.codeManual) it.codeNote = val('it-code-note');
  else delete it.codeNote;
  // Le parti compongono il nome da concetto + descrizione libera; gli altri tipi restano a testo libero
  if (!lock.nameLocked) {
    if (it.type === 'parte') {
      it.conceptId = val('it-concept');
      it.nameFree = val('it-namefree');
      it.name = composePartName(it.conceptId, it.nameFree);
    } else {
      it.name = val('it-name');
    }
  }
  // L'unità di un articolo già usato non cambia (dalla 0.105.5): giacenza,
  // quantità di distinta, scorta, lotto e costo sono numeri in quell'unità, e
  // cambiarla li reinterpreterebbe tutti senza toccarli.
  if (!lock.structLocked) it.uom = val('it-uom') || defaultUom();
  it.notes = val('it-notes');
  readItemTechFields(it);
  // L'approvvigionamento prima del listino: la quotazione in uso si applica
  // solo a una parte comprata, e passando da «fabbrica» a «compra» il costo
  // restava quello vecchio (dalla 0.105.5).
  // Con la Produzione interna spenta il campo è nascosto: una parte nuova
  // nasce «compra», una esistente resta com'era scritta.
  if (it.type === 'parte') {
    const s = areaAttiva('produzione') ? val('it-sourcing') : (it.sourcing || 'buy');
    if (PART_SOURCING[s]) it.sourcing = s;
  }
  // Parametri di scorta: solo su ciò che si tiene a magazzino. Vuoto resta
  // vuoto — zero e "non impostato" qui vogliono dire la stessa cosa, ma un
  // campo lasciato in bianco non deve comparire come 0 alla riapertura.
  if (hasStock(it)) {
    const sa = val('it-safety'), lo = val('it-lot');
    it.safetyStock = sa === '' ? null : clampNum(parseFloat(sa), 0);
    it.lotSize = lo === '' ? null : clampNum(parseFloat(lo), 0);
    // La modalità ha senso solo insieme a un lotto: senza, non deve restare in
    // giro un valore che non si applica a niente.
    if (it.lotSize) { if (val('it-lotmode') === 'min') it.lotMode = 'min'; else delete it.lotMode; }
    else delete it.lotMode;
    // Vuota: il campo sparisce, come la modalità lotto senza lotto.
    const ub = ubicazioneNorm(val('it-loc'));
    if (ub) it.location = ub; else delete it.location;
  }
  // Doppia unità di misura. Le due voci vanno insieme: un'unità senza fattore
  // non converte niente, un fattore senza unità non si applica a niente.
  if (hasPriceList(it)) {
    const au = val('it-altuom'), af = val('it-altfactor');
    const fattore = af === '' ? 0 : clampNum(parseFloat(af), 0);
    if (au && au !== it.uom && fattore > 0) { it.altUom = au; it.altFactor = fattore; }
    else { delete it.altUom; delete it.altFactor; }
    // Cambiare il fattore cambia il costo di ogni quotazione espressa
    // nell'altra unità: quella in uso va ricalcolata subito, altrimenti la
    // costificazione resterebbe ferma alla conversione di prima.
    const attiva = activePriceRow(it);
    if (attiva) applyPriceRow(it, attiva);
  }
  // Flag: preferito (solo commerciali e materie prime), obsoleto (qualunque tipo)
  if (canFavorite(it.type)) it.favorite = isChecked('it-favorite');
  it.obsolete = isChecked('it-obsolete');
  // Prezzo, fornitore, codice e descrizione presso il fornitore NON si leggono
  // da qui: li scrive solo applyPriceRow() quando si sceglie una quotazione.
  // Solo un valore valido sovrascrive: in creazione il campo può non esserci
  // ancora, e lì vale il default delle impostazioni scritto da saveNewItem.
  // (L'approvvigionamento si legge più su, prima del listino.)
  if (usesFamily(it.type) && !lock.structLocked) { it.familyId = val('it-family'); it.subFamilyId = val('it-subfamily'); }
  // Codifica gerarchica: schema sulla macchina, appartenenza sugli altri tipi
  if (!lock.structLocked) {
    const d = itemDraftFromForm();
    if (it.type === 'macchina') {
      it.sigla = d.sigla; it.gCodeLen = d.gCodeLen; it.gCodeType = d.gCodeType;
      it.incrDigitsS = d.incrDigitsS; it.incrDigitsN = d.incrDigitsN;
    } else if (it.type === 'gruppo') {
      it.machineItemId = d.machineItemId; it.sigla = d.sigla;
    } else if (it.type === 'sottogruppo' || it.type === 'parte') {
      it.machineItemId = d.machineItemId; it.groupItemId = d.groupItemId;
    }
  }
  // Distinta parte, ciclo e modo di calcolo non passano da qui: si modificano
  // nella vista Cicli di lavorazione, che salva per conto suo.
}
// Controlli sulla codifica: sigle valide e univoche. Restituisce un messaggio o null.
function validateItemCoding(id) {
  const d = itemDraftFromForm();
  if (d.type === 'macchina') {
    if (!d.sigla) return null; // sigla facoltativa: senza, niente codice automatico
    if (!/^[A-Z0-9]+$/.test(d.sigla)) return 'La sigla macchina ammette solo A-Z e 0-9';
    if (machineItems().some(m => m.sigla === d.sigla && m.id !== id)) return `Sigla macchina "${d.sigla}" già in uso`;
    if (!(d.gCodeLen >= 1 && d.gCodeLen <= 10)) return 'N° caratteri sigla gruppo non valido (1-10)';
    if (!(d.incrDigitsS >= 1 && d.incrDigitsS <= 6)) return 'Cifre progressivo S## non valide (1-6)';
    if (!(d.incrDigitsN >= 1 && d.incrDigitsN <= 6)) return 'Cifre numerazione ### non valide (1-6)';
  } else if (d.type === 'gruppo') {
    if (!d.machineItemId || !d.sigla) return null; // senza macchina+sigla il codice resta manuale
    const sm = machineScheme(getItem(d.machineItemId));
    const err = validateCodeFormat(d.sigla, sm.gLen, sm.gType);
    if (err) return err;
    if (groupItemsFor(d.machineItemId).some(g => g.sigla === d.sigla && g.id !== id))
      return `Sigla gruppo "${d.sigla}" già usata su questa macchina`;
  }
  return null;
}
// Unicità del codice articolo. Fino alla 0.22.0 non la controllava nessuno, ma
// tutto ciò che cerca un articolo per codice — l'import massivo, la ricerca — dà
// per scontato che sia unico e risolve sul primo trovato, in silenzio. In cloud
// diventerà un vincolo del database.
//
// `codiceAttuale` è la chiave della regola: si impedisce di *introdurre* un
// duplicato, non si blocca chi sta correggendo altro su un articolo che era già
// duplicato prima. Chi ripulisce i duplicati esistenti lo fa dal report in
// Gestione › Backup, non venendo bloccato mentre rinomina un articolo.
function validateItemCode(code, exceptId, codiceAttuale) {
  const k = itemCodeKey(code);
  if (!k) return null;                                   // vuoto: readItemForm ci mette l'id, unico per costruzione
  if (codiceAttuale != null && k === itemCodeKey(codiceAttuale)) return null;
  const altro = getItemByCode(k);
  if (altro && altro.id !== exceptId) return `Codice "${code}" già usato da ${altro.name || altro.id}`;
  return null;
}
// Controlli sul nome secondo il tipo: le parti richiedono concetto + descrizione, gli altri il nome libero.
function validateItemName(type) {
  if (type === 'parte') {
    if (!val('it-concept')) return 'Concetto richiesto';
    if (!val('it-namefree')) return 'Descrizione richiesta';
    return null;
  }
  return val('it-name') ? null : 'Descrizione richiesta';
}
function saveNewItem() {
  if (!roleGuard('catalog')) return;
  const nameErr = validateItemName(val('it-type'));
  if (nameErr) { itemFormErr(nameErr, 'ana'); return; }
  const codErr = validateItemCoding(null);
  if (codErr) { itemFormErr(codErr, 'ana'); return; }
  const manErr = codeManualErr();
  if (manErr) { itemFormErr(manErr, 'ana'); return; }
  const dupErr = validateItemCode(val('it-code'), null, null);
  if (dupErr) { itemFormErr(dupErr, 'ana'); return; }
  const barErr = barcodeErr(null, val('it-type'));
  if (barErr) { itemFormErr(barErr, 'mag'); return; }
  const it = { id: gid(), type: val('it-type') };
  if (isAssembly(it.type)) { it.components = []; it.operations = []; it.cycle = []; }
  if (it.type === 'parte') { it.components = []; it.cycle = []; it.sourcing = defaultPartSourcing(); }
  readItemForm(it);
  const src = window.__dupSourceId ? getItem(window.__dupSourceId) : null;
  if (src && isAssembly(it.type)) {
    it.components = (src.components || []).map(c => Object.assign({}, c));
    it.cycle = cicloFasi(src).map(o => Object.assign({}, o));
  }
  // Duplicando una parte si porta dietro distinta e ciclo, come gli assiemi coi componenti
  if (src && it.type === 'parte') {
    it.components = distintaRighe(src).map(c => Object.assign({}, c));
    it.cycle = cicloFasi(src).map(r => Object.assign({}, r));
  }
  if (src) {
    if (src.overheadPctOverride != null) it.overheadPctOverride = src.overheadPctOverride;
    if (src.marginPctOverride != null) it.marginPctOverride = src.marginPctOverride;
  }
  // Il listino è dove vive il prezzo: duplicando un articolo si porta dietro
  // anche le sue quotazioni, altrimenti la copia nascerebbe a costo zero.
  if (hasPriceList(it)) {
    it.priceList = [];
    it.priceListSeeded = true;
    if (src && hasPriceList(src)) {
      const rimappa = {};
      // Rete di sicurezza: le quotazioni copiate in un'unità alternativa
      // vogliono quell'unità anche sulla copia.
      if (hasAltUom(src) && !hasAltUom(it) && (it.uom || '') === (src.uom || '')
          && priceRows(src).some(r => r.priceUom && r.priceUom === src.altUom)) {
        it.altUom = src.altUom; it.altFactor = src.altFactor;
      }
      it.priceList = priceRows(src).map(r => {
        const n = stampNew(Object.assign({}, r, { id: gid() }));
        rimappa[r.id] = n.id;
        return n;
      });
      if (src.activePriceId && rimappa[src.activePriceId]) {
        const attiva = it.priceList.find(r => r.id === rimappa[src.activePriceId]);
        if (attiva) applyPriceRow(it, attiva);
      }
    }
  }
  // Con l'archivio condiviso il codice si impegna sul server prima di salvare:
  // se un collega l'ha appena preso, quello automatico si ricalcola.
  return conCodiceImpegnato(it, itemCodeAuto ? () => genItemCode(it) : null, () => {
    Store.insert('items', it);
    closeModal(); renderCatalogs(); savedToast(src ? 'Copia creata' : 'Articolo creato');
    // Un articolo appena creato non ha modo di ricevere un prezzo: la scheda non
    // lo chiede più. Il listino si apre da solo, ma solo se non è già arrivato
    // dalla copia — lì il prezzo c'è già.
    if (hasPriceList(it) && !priceRows(it).length) priceListModal(it.id);
  });
}
// La scheda articolo ricorda chi si sta modificando: chiusa, non deve
// ricordarlo più — itemDraftFromForm legge questa variabile.
onPanelClose('form', () => { window.__editingItemId = null; window.__itemScope = null; });
// Stesso ordine di newItemModal, e per la stessa ragione.
function editItemModal(id) {
  if (!roleGuard('catalog')) return;
  const it = getItem(id); if (!it) return;
  // Una variante nata prima della 0.120.3 non aveva ancora la codifica del
  // modello: la prende qui, prima che la scheda la mostri vuota.
  if (it.configuredFromId && typeof varAllineaCodifica === 'function') varAllineaCodifica([it]);
  const scope = scopeOf(it.type);
  const p = openModal(`<h3>${ico('edit', 'tinted pill', '')} Modifica articolo${varMarca(it)}</h3>${itemModalBody(it, scope)}
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveItemEdit('${id}')">Salva</button></div>`, true);
  if (!p) return;
  // All'apertura il codice resta quello che è, anche se fuori schema: lo si
  // ricompone solo se si cambia una scelta che lo determina.
  itemCodeAuto = false;
  window.__editingItemId = id;
  window.__itemScope = scope;
  itemTabCorrente = 'ana';
  toggleItemFields();
  itemCodeAuto = !it.codeManual;
}
function saveItemEdit(id) {
  if (!roleGuard('catalog')) return;
  const it = getItem(id); if (!it) return;
  const nameErr = validateItemName(it.type);
  if (nameErr) { itemFormErr(nameErr, 'ana'); return; }
  const codErr = validateItemCoding(id);
  if (codErr) { itemFormErr(codErr, 'ana'); return; }
  const manErr = codeManualErr();
  if (manErr) { itemFormErr(manErr, 'ana'); return; }
  const dupErr = validateItemCode(val('it-code'), id, it.code);
  if (dupErr) { itemFormErr(dupErr, 'ana'); return; }
  const barErr = barcodeErr(id, it.type);
  if (barErr) { itemFormErr(barErr, 'mag'); return; }
  const fare = () => {
    readItemForm(it);
    touch(it);
    // Le varianti generate da questa macchina ne seguono la codifica.
    if (typeof varEreditaCodifica === 'function') varEreditaCodifica(it);
    saveDB(); closeModal(); renderCatalogs(); savedToast('Articolo aggiornato');
  };
  // Solo un codice cambiato va impegnato: quello che l'articolo ha già è suo.
  const nuovo = val('it-code');
  if (!nuovo || itemCodeKey(nuovo) === itemCodeKey(it.code) || itemLockState(it).structLocked) return fare();
  // Il codice lasciato torna libero subito: impegnato da questo utente quando
  // l'articolo è nato, bloccava per un'ora chiunque lo volesse riusare.
  const vecchio = it.code;
  return conCodiceImpegnato({ id: it.id, code: nuovo }, null, () => {
    const fatto = fare();
    cloudLiberaCodici([vecchio]);
    return fatto;
  });
}
function delItem(id) {
  if (!roleGuard('catalog')) return;
  const it = getItem(id); if (!it) return;
  // Invece del solo elenco di codici, si apre direttamente il "dove è usato":
  // da lì si vede chi lo contiene e si può risalire.
  const used = usedBy(id);
  if (used.length) { showToast('Usato in ' + used.length + ' articoli: rimuovilo prima.', 'error'); usageModal(id); return; }
  // Oltre a distinte/cicli, il codice può essere già in movimenti di
  // magazzino, documenti, piani o revisioni congelate: nessuno di questi lo
  // rende "genitore" di niente (usedBy non lo vede), ma cancellarlo perderebbe
  // comunque quello storico. Qui non c'è eccezione di ruolo: l'unica via per
  // ritirare un codice sbagliato è marcarlo Obsoleto.
  const dip = codificaDipendenti(id);
  if (dip.length) {
    const quali = it.type === 'macchina' ? (dip.length === 1 ? 'del gruppo' : 'dei ' + dip.length + ' gruppi')
      : (dip.length === 1 ? 'del sottogruppo' : 'dei ' + dip.length + ' sottogruppi');
    const codici = dip.slice(0, 5).map(i => i.code).join(', ') + (dip.length > 5 ? '…' : '');
    showToast(`"${it.code}" è nella codifica ${quali} ${codici}: eliminali o spostali prima, oppure segnalo come obsoleto.`, 'error');
    return;
  }
  if (isItemUsedAnywhere(id)) {
    showToast('Articolo già movimentato (magazzino, cicli, documenti o piani): non può essere eliminato. Segnalo come obsoleto per impedirne il riuso.', 'error');
    return;
  }
  if (!articoloUltimo(it)) { showToast(ARTICOLO_NON_ULTIMO(it.code), 'error'); return; }
  askConfirm(`Eliminare "${it.name}"?`, () => eliminaSeAncoraUltimo(() => {
    const x = getItem(id);
    if (x && articoloUltimo(x)) return true;
    if (x) showToast(ARTICOLO_NON_ULTIMO(x.code), 'error');
    return false;
  }, () => {
    if (currentBomId === id) currentBomId = null;
    removeConUndo('items', id, `"${it.name}" eliminato`, renderCatalogs);
  }));
}

// ─── Azioni su più articoli insieme ───
// Marcare obsoleti quaranta codici uno per uno è il genere di lavoro che si fa
// una volta e poi non si fa più: si rimanda, e l'anagrafica resta sporca. Qui
// il gesto è uno solo, ma le regole non cambiano — stesse guardie di ruolo,
// stesso `touch()` sull'autore, stesso cestino con il ripristino.
//
// Il conto di **quanti** sono cambiati davvero viene detto sempre, e non è un
// dettaglio: chi ne sceglie quaranta e ne vede cambiare trentotto deve sapere
// che due non si potevano toccare, invece di scoprirlo fra un mese.
function bulkSetFlag(ids, campo, valore, ammesso) {
  if (!roleGuard('catalog')) return 0;
  let n = 0;
  (ids || []).forEach(id => {
    const it = getItem(id);
    if (!it || (ammesso && !ammesso(it)) || !!it[campo] === !!valore) return;
    it[campo] = !!valore;
    touch(it);
    n++;
  });
  if (n) { saveDB(); renderCatalogs(); }
  return n;
}
function bulkObsolete(ids, valore) {
  const n = bulkSetFlag(ids, 'obsolete', valore);
  const tot = (ids || []).length;
  if (!n) { showToast('Nessun articolo da cambiare: erano già tutti così', 'error'); return; }
  showToast(`${n} ${n === 1 ? 'articolo segnato' : 'articoli segnati'} ${valore ? 'come non più utilizzabili' : 'di nuovo utilizzabili'}${n < tot ? ` (${tot - n} erano già così)` : ''}`);
}
function bulkFavorite(ids, valore) {
  // Il preferito vale solo su ciò che si acquista: sugli altri non è che
  // fallisce, è che non esiste.
  const n = bulkSetFlag(ids, 'favorite', valore, it => canFavorite(it.type));
  if (!n) { showToast('Il preferito vale solo su commerciali e materie prime', 'error'); return; }
  showToast(`${n} ${n === 1 ? 'articolo' : 'articoli'} ${valore ? 'segnati come preferiti' : 'tolti dai preferiti'}`);
}
// Eliminare in blocco è l'azione che più merita una rete. Chi è usato in una
// distinta non si tocca — è la stessa regola di `delItem`, e la conferma dice
// prima quanti ne resteranno fuori, invece di lasciarlo scoprire dopo.
function bulkDelete(ids) {
  if (!roleGuard('catalog')) return;
  const items = (ids || []).map(getItem).filter(Boolean);
  // La stessa doppia regola di delItem: non solo le distinte, anche documenti,
  // cicli, piani e magazzino. Fino alla 0.81 qui contava solo la distinta, e un
  // articolo già ordinato o movimentato spariva lasciando righe e movimenti
  // orfani — che il database condiviso, con le sue chiavi, avrebbe rifiutato
  // facendo fallire l'intero invio.
  const inUso = it => usedBy(it.id).length > 0 || isItemUsedAnywhere(it.id);
  const usati = items.filter(inUso);
  // Senza buchi nella codifica: se ne vanno solo quelli in coda alla propria
  // serie, contando che anche gli altri scelti se ne vanno.
  const candidati = items.filter(it => !inUso(it));
  const via = new Set(candidati.map(it => it.id));
  let liberi = candidati;
  for (;;) {
    const restano = liberi.filter(it => articoloUltimo(it, via));
    if (restano.length === liberi.length) break;
    liberi = restano;
    via.clear(); liberi.forEach(it => via.add(it.id));
  }
  const inMezzo = candidati.length - liberi.length;
  if (!liberi.length) {
    showToast(usati.length
      ? `${usati.length === 1 ? 'L\'articolo è usato' : 'Sono tutti usati'} in distinte, documenti o magazzino: rimuovili prima, o segnali come obsoleti.`
      : (inMezzo === 1 ? ARTICOLO_NON_ULTIMO(candidati[0].code) : 'Nessuno di questi codici è l\'ultimo della sua serie: eliminandoli resterebbero buchi nella codifica. Segnali come obsoleti invece di eliminarli.'), 'error');
    return;
  }
  const avviso = (usati.length
    ? `\n\n${usati.length} ${usati.length === 1 ? 'articolo resta' : 'articoli restano'} dov'${usati.length === 1 ? 'è' : 'erano'}: ${usati.length === 1 ? 'è usato' : 'sono usati'} in distinte, documenti o magazzino.`
    : '') + (inMezzo
    ? `\n\n${inMezzo} ${inMezzo === 1 ? 'articolo resta' : 'articoli restano'}: ${inMezzo === 1 ? 'non è l\'ultimo' : 'non sono gli ultimi'} della serie, e ${inMezzo === 1 ? 'il suo codice lascerebbe' : 'i loro codici lascerebbero'} un buco. ${inMezzo === 1 ? 'Segnalo' : 'Segnali'} come obsolet${inMezzo === 1 ? 'o' : 'i'}.`
    : '');
  askConfirm(`Eliminare ${liberi.length} ${liberi.length === 1 ? 'articolo' : 'articoli'}?${avviso}`, () => {
    const cestinati = [];
    liberi.forEach(it => {
      if (currentBomId === it.id) currentBomId = null;
      if (Store.remove('items', it.id)) cestinati.push(Store.lastRemoved());
    });
    renderCatalogs();
    // Un ripristino solo per tutti: chi si è pentito si è pentito dell'intero
    // gesto, non di una riga.
    showToast(`${cestinati.length} ${cestinati.length === 1 ? 'articolo eliminato' : 'articoli eliminati'}`, 'success', {
      label: '↶ Annulla',
      fn: () => {
        let no = '';
        cestinati.forEach(v => { if (!Store.restore(v)) no = no || Store.rifiutoRipristino(); });
        renderCatalogs();
        if (no) showToast(no, 'error'); else savedToast('Ripristinati');
      },
    });
  });
}

if (typeof document !== 'undefined') catalogSortLoad();
