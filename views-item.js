// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-item.js
// ═══════════════════════════════════════════════════════════
// Scheda articolo di **sola lettura**: tutto quello che si sa di un codice, in
// una finestra sola, raggiungibile da ovunque quel codice compaia.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
//
// ── Il problema ──
// Le informazioni di un articolo erano tutte nell'app, ma sparse in sei posti
// diversi e raggiungibili solo passando dalla vista giusta: il costo in
// costificazione, il prezzo nel listino, la giacenza nella scheda del catalogo,
// gli impieghi in *Dove è usato*, la distinta nell'albero, i documenti negli
// elenchi. Chi leggeva un codice in una lista d'acquisto o in un ordine e si
// chiedeva «ma questo cos'è?» doveva ricordarsi dove andare a guardare, uscire
// da dove stava lavorando e poi tornarci.
//
// ── La scelta ──
// Il codice diventa **cliccabile ovunque**, e apre questa scheda. Un solo
// gesto, sempre lo stesso, da qualunque tabella.
//
// E la scheda **non modifica niente**. Non è una limitazione da togliere più
// avanti: è la ragione per cui la si può aprire senza pensarci, in mezzo a
// qualunque lavoro, anche mentre un form è aperto dietro. Una scheda che non
// scrive non ha uno stato da salvare, non chiede conferme all'uscita e non può
// rovinare niente per un click di troppo. Le modifiche restano dove stanno —
// anagrafica, listino, distinta — dove chi le fa ci è arrivato apposta.

// ─── Il codice cliccabile ───
// Unico punto in cui nasce un codice a schermo. Le tabelle passano di qui e
// non ripetono né lo stile né il gesto: cambiare cosa fa un click su un codice
// è una modifica sola.
//
// `stopPropagation` non è un dettaglio: molte righe hanno già un loro click —
// la riga di distinta si espande, la riga del catalogo si apre in modifica — e
// senza, un click sul codice farebbe due cose insieme, di cui una indesiderata.
function codeLink(itemId, testo, cls) {
  const txt = esc(testo == null ? '' : String(testo));
  if (!itemId || !getItem(itemId)) return txt;   // codice libero o articolo cancellato: niente da aprire
  return `<span class="code-link${cls ? ' ' + cls : ''}" role="button" tabindex="0"
    title="Scheda completa (sola lettura)"
    onclick="itemInfoModal('${itemId}', event)"
    onkeydown="if(event.key==='Enter'||event.key===' '){itemInfoModal('${itemId}', event)}">${txt}</span>`;
}
// Comodità per il caso normale: il codice dell'articolo stesso.
function itemCodeLink(it, cls) { return it ? codeLink(it.id, it.code, cls) : ''; }

// ─── La scheda ───
// Una chiave di pannello sola: cliccare un codice dentro la scheda sostituisce
// il contenuto invece di aprire una seconda finestra sopra la prima. È la
// navigazione di un browser, e come in un browser serve il tasto indietro —
// altrimenti scendere in una distinta è un viaggio di sola andata.
let _itemInfoStack = [];
function itemInfoModal(id, ev, indietro) {
  if (ev && ev.stopPropagation) { ev.stopPropagation(); ev.preventDefault(); }
  const it = getItem(id);
  if (!it) { showToast('Articolo non più a catalogo', 'error'); return; }
  if (!indietro) {
    const corrente = window.__itemInfoId;
    if (corrente && corrente !== id) _itemInfoStack.push(corrente);
  }
  window.__itemInfoId = id;
  openModal(itemInfoHtml(it), true, 'iteminfo');
}
function itemInfoBack() {
  const prev = _itemInfoStack.pop();
  if (prev) itemInfoModal(prev, null, true);
}
// Chiudendo si dimentica la strada percorsa: riaprire da un'altra tabella
// comincia da capo, e un "indietro" che riporta a un articolo di mezz'ora fa
// sarebbe più sorprendente che utile.
function itemInfoClose() { _itemInfoStack = []; window.__itemInfoId = null; closeModal(); }

// Le sezioni della scheda, senza intestazione né pulsanti. Stanno per conto
// loro perché la stessa scheda si legge in due posti: la finestra flottante,
// che ha bisogno di titolo e «Chiudi», e il pannello laterale, che il titolo lo
// ha già suo. Il corpo è lo stesso — due copie divergerebbero al primo ritocco.
function itemInfoBody(it) {
  return `${itemInfoAnagrafica(it)}
    ${itemInfoAcquisto(it)}
    ${itemInfoCosto(it)}
    ${itemInfoMagazzino(it)}
    ${itemInfoComposizione(it)}
    ${itemInfoImpieghi(it)}
    ${itemInfoDocumenti(it)}
    ${itemInfoAllegati(it)}
    ${itemInfoRevisioni(it)}
    ${stampLine(it)}`;
}

function itemInfoHtml(it) {
  const back = _itemInfoStack.length
    ? `<button class="btn-outline" onclick="itemInfoBack()" title="Torna a ${esc(getItem(_itemInfoStack[_itemInfoStack.length - 1]) ? getItem(_itemInfoStack[_itemInfoStack.length - 1]).code : '')}">← Indietro</button>`
    : '';
  return `<h3>${ico('eye', 'tinted pill', 'Scheda di sola lettura')} ${esc(it.code)} — ${esc(it.name)}${itemBadges(it)}</h3>
    <p style="color:var(--text-dim);margin-bottom:4px">
      <span class="bom-type-tag tt-${typeKey(it.type)}">${typeShort(it.type)}</span> ${esc(typeLabel(it.type))}
      · U.M. <strong>${esc(it.uom || '—')}</strong>${hasRevisions(it) ? ` · revisione in lavorazione <strong>${esc(itemRev(it))}</strong>` : ''}</p>
    <p class="empty-text" style="text-align:left;padding:0 0 12px">Scheda di <strong>sola lettura</strong>: qui non si modifica niente, e per questo si può aprire in mezzo a qualunque lavoro. Le modifiche si fanno dall'anagrafica, dal listino e dalla distinta.</p>
    ${itemInfoBody(it)}
    <div class="modal-actions">
      ${back}
      <button class="btn-ghost" onclick="itemInfoClose()">Chiudi</button>
    </div>`;
}

// Titolo di sezione + corpo. Le sezioni che non hanno niente da dire non si
// disegnano: una scheda piena di «—» nasconde le righe che contano.
function itemInfoSection(titolo, corpo) {
  return corpo ? `<h4 class="settings-group-title">${titolo}</h4>${corpo}` : '';
}
// Griglia etichetta/valore. Le voci vuote cadono qui, una volta per tutte.
// Il testo viene escapato qui dentro, come ovunque nel repo: un valore che è
// già HTML lo dichiara passando da rawHtml() — così una voce nuova aggiunta
// senza pensarci è al sicuro per costruzione, non per disciplina.
function rawHtml(h) { return { html: String(h == null ? '' : h) }; }
function itemInfoRows(voci) {
  const righe = voci.filter(v => v && v[1] !== '' && v[1] != null)
    .map(([k, v]) => {
      const val = (v && typeof v === 'object' && 'html' in v) ? v.html : esc(String(v));
      return `<div class="info-row"><span class="info-key">${esc(k)}</span><span class="info-val">${val}</span></div>`;
    })
    .join('');
  return righe ? `<div class="info-grid">${righe}</div>` : '';
}
const _mono = s => `<span style="font-family:var(--mono)">${esc(s)}</span>`;

function itemInfoAnagrafica(it) {
  const fam = familyName(it.familyId);
  const sub = subFamilyName(it.familyId, it.subFamilyId);
  const mac = getItem(it.machineItemId);
  const grp = getItem(it.groupItemId);
  return itemInfoSection('Anagrafica', itemInfoRows([
    ['Codice', rawHtml(_mono(it.code))],
    ['Descrizione', it.name],
    it.type === 'parte' && it.conceptId ? ['Concetto', conceptName(it.conceptId)] : null,
    ['Tipo', typeLabel(it.type)],
    ['Unità di misura', rawHtml(_mono(it.uom || '—'))],
    it.type === 'parte' ? ['Approvvigionamento', PART_SOURCING[partSourcing(it)]] : null,
    fam ? ['Macrofamiglia', fam] : null,
    sub ? ['Sottofamiglia', sub] : null,
    it.sigla ? ['Sigla', rawHtml(_mono(it.sigla))] : null,
    mac ? ['Macchina', rawHtml(codeLink(mac.id, mac.code) + ' — ' + esc(mac.name))] : null,
    grp ? ['Gruppo', rawHtml(codeLink(grp.id, grp.code) + ' — ' + esc(grp.name))] : null,
    it.favorite ? ['Preferito', '★ sì'] : null,
    it.obsolete ? ['Obsoleto', rawHtml('<span style="color:var(--red)">' + ico('blocked', 'tinted', '') + ' non più utilizzabile</span>')] : null,
    it.notes ? ['Note', it.notes] : null,
  ]));
}

// Fornitore, prezzo in uso e listino completo. Il prezzo in uso e la quotazione
// più bassa sono due numeri diversi e vanno detti come tali: l'app non cambia
// mai un prezzo da sé, quindi la differenza è una scelta di qualcuno.
function itemInfoAcquisto(it) {
  if (!hasPriceList(it)) return '';
  const campo = costField(it);
  const inUso = campo ? (Number(it[campo]) || 0) : null;
  const attiva = activePriceRow(it);
  const best = bestPriceRow(it);
  const bestCosto = best ? rowUnitCost(it, best) : null;
  const righe = priceRows(it);

  // Codice e descrizione si leggono dalla quotazione in uso, non dalla copia sui
  // campi dell'articolo: è la stessa cosa, ma da un posto solo. Sono di **quel**
  // fornitore, quindi l'etichetta lo nomina — gli altri stanno in tabella, ognuno
  // col suo.
  const nomeForn = supplierName(it.supplierId);
  const presso = nomeForn ? ` presso ${nomeForn}` : ' presso il fornitore';
  const testa = itemInfoRows([
    ['Fornitore', nomeForn || '— nessuno'],
    attiva && attiva.code ? ['Codice' + presso, rawHtml(_mono(attiva.code))] : null,
    attiva && attiva.desc ? ['Descrizione' + presso, attiva.desc] : null,
    inUso != null ? ['Costo in uso', rawHtml(`<strong>${fmtPer(inUso, itemUom(it))}</strong>${inUso > 0 ? '' : ' <span style="color:var(--red)">' + ico('warning', 'tinted', '') + ' nessun prezzo</span>'}`)] : null,
    attiva ? ['Quotazione in uso', rawHtml(`${fmtPer(attiva.price, priceUomOf(it, attiva))}${attiva.date ? ' · ' + esc(fmtDateIt(attiva.date)) : ''}`)] : null,
    attiva && attiva.leadDays ? ['Giorni di consegna', String(attiva.leadDays) + ' gg'] : null,
    attiva && attiva.minQty ? ['Quantità minima', fmtUom(attiva.minQty, priceUomOf(it, attiva))] : null,
    hasAltUom(it) ? ['U.M. d\'acquisto', rawHtml(`${_mono(altUomOf(it))} · ${fmtUom(altFactorOf(it), altUomOf(it))} in 1 ${esc(itemUom(it))}`)] : null,
    best && bestCosto != null && inUso != null && bestCosto < inUso - 0.00005
      ? ['Miglior quotazione', rawHtml(`<span class="price-best">${fmtPer(bestCosto, itemUom(it))} da ${esc(supplierName(best.supplierId) || '—')}</span> — più bassa di quella in uso, ma il prezzo non cambia da sé: si sceglie dal listino`)]
      : null,
  ]);

  const tabella = righe.length ? `<div class="table-wrap"><table>
    <thead><tr><th scope="col">Fornitore</th><th scope="col" title="Come questo fornitore chiama l'articolo: è quello che finisce sui suoi documenti">Codice e descrizione presso il fornitore</th>
      <th scope="col" style="text-align:right" title="Prezzo di una unità, nella U.M. della colonna accanto">Prezzo (${esc(cur())}/U.M.)</th><th scope="col">U.M.</th>
      <th scope="col" style="text-align:right">Q.tà min.</th><th scope="col" style="text-align:right" title="Giorni di consegna dichiarati dal fornitore">Consegna (gg)</th>
      <th scope="col">Data</th><th scope="col"></th></tr></thead>
    <tbody>${righe.map(r => {
      const u = priceUomOf(it, r);
      return `<tr${r.id === it.activePriceId ? ' style="font-weight:700"' : ''}>
        <td>${esc(supplierName(r.supplierId) || '—')}</td>
        <td style="font-family:var(--mono)">${esc(r.code || '—')}${r.desc ? `<div class="empty-text" style="padding:0;font-family:inherit">${esc(r.desc)}</div>` : ''}</td>
        <td style="font-family:var(--mono);text-align:right">${r.price === '' || r.price == null ? '<span class="empty-text" style="padding:0">in attesa</span>' : fmtN(r.price)}</td>
        <td>${esc(u)}</td>
        <td style="font-family:var(--mono);text-align:right">${r.minQty ? fmtUom(r.minQty, u) : '—'}</td>
        <td style="font-family:var(--mono);text-align:right">${r.leadDays ? esc(String(r.leadDays)) + ' gg' : '—'}</td>
        <td>${r.date ? esc(fmtDateIt(r.date)) : '—'}</td>
        <td>${r.id === it.activePriceId ? '<span class="price-best">✓ in uso</span>' : ''}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="empty-text">Nessuna quotazione a listino.</div>';

  return itemInfoSection(ico('euro', 'tinted', '') + ' Acquisto e listino', testa + tabella);
}

// La ripartizione del costo, con le sole voci che pesano. Il totale c'è sempre,
// anche a zero: è il numero che si è venuti a cercare.
function itemInfoCosto(it) {
  const c = costOf(it.id);
  const u = itemUom(it);
  const voci = [
    ['Materiale', c.material], ['Commerciali', c.purchased], ['Lavorazioni', c.labor],
    ['Parti', c.parts], ['Spese generali', c.overhead],
  ].filter(v => Math.abs(v[1]) > 0.00005);
  // Ogni voce è la sua quota **per unità**, non la spesa di un lotto: senza il
  // denominatore la ripartizione si legge come un totale e non torna con niente.
  const corpo = itemInfoRows(voci.map(([k, v]) => [k, rawHtml(`<span style="font-family:var(--mono)">${fmtPer(v, u)}</span>`)]).concat([
    ['Costo industriale', rawHtml(`<strong style="font-family:var(--mono)">${fmtPer(c.total, u)}</strong>`)],
    ['Prezzo di vendita', rawHtml(`<span style="font-family:var(--mono)">${fmtPer(sellingPrice(it.id), u)}</span>`)],
    c.cycle ? ['Attenzione', rawHtml('<span style="color:var(--red)">' + ico('warning', 'tinted', '') + ' Riferimento ciclico nella distinta: il costo è troncato su quel ramo.</span>')] : null,
  ]));
  return itemInfoSection(ico('euro', 'tinted', '') + ' Costo unitario', corpo);
}

// Magazzino in sola lettura: gli stessi numeri della scheda del catalogo, senza
// i pulsanti che li cambiano.
function itemInfoMagazzino(it) {
  if (!hasStock(it)) return '';
  const s = stockOf(it.id);
  const imp = commitsOn(it.id, null);
  const impQty = imp.reduce((a, x) => a + x.qty, 0);
  const libero = s.onHand + s.incoming - impQty;
  const u = itemUom(it);
  const dettaglio = imp.length
    ? `<div class="empty-text" style="text-align:left;padding:0 0 8px">Impegnato dai piani aperti: ${imp.map(x => `${esc(x.number)}${x.title ? ' (' + esc(x.title) + ')' : ''} ${fmtUom(x.qty, u)}`).join(' · ')}.</div>`
    : '';
  return itemInfoSection(ico('package', 'tinted', '') + ' Magazzino', itemInfoRows([
    ['Esistente', rawHtml(`<span style="font-family:var(--mono)">${fmtUom(s.onHand, u)}</span>`)],
    ['In arrivo', rawHtml(`<span style="font-family:var(--mono)">${fmtUom(s.incoming, u)}</span>`)],
    ['Impegnato', rawHtml(`<span style="font-family:var(--mono)">${fmtUom(impQty, u)}</span>`)],
    ['Libero', rawHtml(`<strong style="font-family:var(--mono)${libero < 0 ? ';color:var(--red)' : ''}">${fmtUom(libero, u)}</strong>`)],
    safetyStockOf(it) ? ['Scorta minima', rawHtml(`<span style="font-family:var(--mono)">${fmtUom(safetyStockOf(it), u)}</span>`)] : null,
    lotSizeOf(it) ? ['Lotto di riordino', rawHtml(`<span style="font-family:var(--mono)">${fmtUom(lotSizeOf(it), u)}</span>`)] : null,
    ['Movimenti registrati', String(movementsOf(it.id).length)],
  ]) + dettaglio);
}

// Di cosa è fatto: componenti per un assieme, distinta parte e ciclo per una
// parte. Un solo livello — scendere si fa cliccando il codice, che è il gesto
// che questa scheda insegna.
function itemInfoComposizione(it) {
  if (isAssembly(it.type)) {
    const comps = it.components || [];
    const ops = it.operations || [];
    if (!comps.length && !ops.length) return itemInfoSection(ico('tree', 'tinted', '') + ' Composizione', '<div class="empty-text">Distinta vuota.</div>');
    const righe = comps.map(c => {
      const ci = getItem(c.itemId);
      if (!ci) return `<tr><td colspan="5" class="empty-text">${ico('warning', 'tinted', '')} componente mancante</td></tr>`;
      return `<tr>
        <td>${codeLink(ci.id, ci.code)}</td>
        <td><span class="bom-type-tag tt-${typeKey(ci.type)}">${typeShort(ci.type)}</span> ${esc(ci.name)}${itemBadges(ci)}</td>
        <td style="font-family:var(--mono);text-align:right">${fmtUom(c.qty, itemUom(ci))}</td>
        <td style="font-family:var(--mono);text-align:right">${c.scrapPct ? fmtQty(c.scrapPct) + '%' : '—'}</td>
        <td style="font-family:var(--mono);text-align:right">${fmtN(costOf(ci.id).total * (Number(c.qty) || 0) * (1 + (Number(c.scrapPct) || 0) / 100))}</td></tr>`;
    }).join('');
    const righeOp = ops.map(o => {
      const wc = getWorkCenter(o.workCenterId);
      return `<tr><td>${ico('wrench', 'tinted')}</td><td>${esc(wc ? wc.name : '?')}</td>
        <td style="font-family:var(--mono);text-align:right">${fmtUom(o.hours, 'h')}</td><td>—</td>
        <td style="font-family:var(--mono);text-align:right">${fmtN((Number(o.hours) || 0) * (wc ? (Number(wc.hourlyRate) || 0) : 0))}</td></tr>`;
    }).join('');
    return itemInfoSection(`${ico('tree', 'tinted', '')} Composizione (${comps.length} ${comps.length === 1 ? 'componente' : 'componenti'}${ops.length ? ' · ' + ops.length + (ops.length === 1 ? ' lavorazione' : ' lavorazioni') : ''})`,
      `<div class="table-wrap"><table>
        <thead><tr><th scope="col">Codice</th><th scope="col">Componente</th><th scope="col" style="text-align:right">Q.tà</th>
          <th scope="col" style="text-align:right">Scarto</th><th scope="col" style="text-align:right">Costo riga</th></tr></thead>
        <tbody>${righe}${righeOp}</tbody></table></div>`);
  }

  if (it.type !== 'parte') return '';
  const rows = it.cycle || [];
  if (!rows.length) return itemInfoSection(ico('wrench', 'tinted', '') + ' Distinta parte e ciclo', '<div class="empty-text">Distinta parte e ciclo vuoti.</div>');
  let fase = 0;
  const righe = rows.map(r => {
    if (r.kind === 'op') {
      fase++;
      const wc = getWorkCenter(r.workCenterId);
      const sup = supplierName(r.supplierId);
      return `<tr><td style="font-family:var(--mono)">${cyclePhaseNumber(fase - 1)}</td>
        <td>${ico('wrench', 'tinted')} ${esc(wc ? wc.name : '?')}${sup ? ' · ' + esc(sup) : ''}${r.note ? ' — ' + esc(r.note) : ''}</td>
        <td style="text-align:right">—</td>
        <td style="font-family:var(--mono);text-align:right">${fmtN(cycleRowCost(r))}</td></tr>`;
    }
    const ci = getItem(r.itemId);
    if (!ci) return `<tr><td colspan="4" class="empty-text">${ico('warning', 'tinted', '')} articolo mancante</td></tr>`;
    return `<tr><td>${codeLink(ci.id, ci.code)}</td>
      <td><span class="bom-type-tag tt-${typeKey(ci.type)}">${typeShort(ci.type)}</span> ${esc(ci.name)}${itemBadges(ci)}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtUom(r.qty, itemUom(ci))}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtN(cycleRowCost(r))}${r.costOverride != null && r.costOverride !== '' ? '<div class="empty-text" style="padding:0">forzato</div>' : ''}</td></tr>`;
  }).join('');
  // Una parte comprata da terzi ha ciclo e distinta salvati, ma non è da lì che
  // viene il suo costo: dirlo qui evita di leggere due numeri e crederli in
  // contraddizione.
  const nota = partSourcing(it) === 'buy'
    ? '<p class="empty-text" style="text-align:left;padding:6px 0 0">Questa parte si <strong>acquista</strong>: il suo costo è il prezzo a listino, non la somma di queste righe. Distinta e ciclo restano salvati e tornano a contare se l\'approvvigionamento passa a produzione interna.</p>'
    : '';
  return itemInfoSection(`${ico('wrench', 'tinted', '')} Distinta parte e ciclo — ${esc(cycleCountLabel(it))}`,
    `<div class="table-wrap"><table>
      <thead><tr><th scope="col">Codice / Fase</th><th scope="col">Riga</th><th scope="col" style="text-align:right">Q.tà</th><th scope="col" style="text-align:right">Costo</th></tr></thead>
      <tbody>${righe}</tbody></table></div>${nota}`);
}

// Dove è usato, in forma compatta. La versione completa — con la simulazione
// del costo — resta in *Dove è usato*: quella è uno strumento, questa è una
// risposta.
function itemInfoImpieghi(it) {
  const diretti = directUses(it.id);
  if (!diretti.length) return itemInfoSection(ico('link', 'tinted', '') + ' Dove è usato', '<div class="empty-text">Non è usato da nessuna parte.</div>');
  const cime = impactedTops(it.id);
  // La quantità in colonna è quella di **questo** articolo dentro il padre, non
  // del padre: l'unità che le va accanto è la sua, e va detta una volta in testa.
  const u = itemUom(it);
  const tab = (titolo, righe) => `<div class="cat-group-title">${titolo}</div>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Codice</th><th scope="col">Articolo</th><th scope="col" style="text-align:right">${labelUom('Q.tà', u)}</th></tr></thead>
      <tbody>${righe.map(r => `<tr>
        <td>${codeLink(r.item.id, r.item.code)}</td>
        <td><span class="bom-type-tag tt-${typeKey(r.item.type)}">${typeShort(r.item.type)}</span> ${esc(r.item.name)}</td>
        <td style="font-family:var(--mono);text-align:right">${fmtQty(r.qty)}</td></tr>`).join('')}</tbody></table></div>`;
  const etichetta = cime.some(c => c.item.type === 'macchina') ? 'Macchine impattate' : 'Assiemi di testa impattati';
  return itemInfoSection(ico('link', 'tinted', '') + ' Dove è usato',
    tab(`Impieghi diretti (${diretti.length})`, diretti)
    + (cime.length ? tab(`${etichetta} (${cime.length}) — q.tà per una unità, scarto compreso`, cime) : ''));
}

// In quali documenti e piani compare. È la domanda che segue sempre le altre —
// «l'ho già ordinato?», «per cosa serviva?» — e finora si rispondeva solo
// aprendo gli elenchi e filtrandoli uno per uno.
// Indice articolo → piani in cui compare (in riga diretta o nell'esplosione).
// Copre anche i piani chiusi: la domanda della scheda è storica («per cosa
// serviva?»), mentre commitIndex() guarda i soli piani aperti e risponde a
// un'altra domanda. Stesso ciclo di vita degli altri indici: costruito al primo
// uso, azzerato da invalidateCaches() via l'hook in core.js — prima la scheda
// riesplodeva tutti i piani a ogni apertura, ed è il gesto più frequente
// dell'app.
let _planUseIdx = null;
function invalidateItemDocs() { _planUseIdx = null; }
function planUseIndex() {
  if (_planUseIdx) return _planUseIdx;
  const idx = new Map();
  const aggiungi = (itemId, planId) => {
    if (!itemId) return;
    let s = idx.get(itemId);
    if (!s) { s = new Set(); idx.set(itemId, s); }
    s.add(planId);
  };
  (db.plans || []).forEach(p => {
    (p.lines || []).forEach(l => aggiungi(l.itemId, p.id));
    if ((p.lines || []).length && typeof mrpExplode === 'function') {
      mrpExplode(p.lines).buy.forEach(e => aggiungi(e.item.id, p.id));
    }
  });
  _planUseIdx = idx;
  return idx;
}

function itemInfoDocumenti(it) {
  const conRiga = (lista) => (lista || []).filter(d => (d.lines || []).some(l => l.itemId === it.id));
  const rfqs = conRiga(db.rfqs);
  const ordini = conRiga(db.orders);
  const inPiani = planUseIndex().get(it.id);
  const piani = inPiani ? (db.plans || []).filter(p => inPiani.has(p.id)) : [];
  if (!rfqs.length && !ordini.length && !piani.length) return '';
  const qtaIn = d => (d.lines || []).filter(l => l.itemId === it.id).reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const voce = (icona, d, extra) => `<div class="mgmt-item">
    <span class="mgmt-item-name">${icona} <span style="font-family:var(--mono)">${esc(d.number)}</span>${d.title ? ' — ' + esc(d.title) : ''}</span>
    <span class="mgmt-item-meta">${extra}</span></div>`;
  const u = itemUom(it);
  const corpo = [
    ...rfqs.map(d => voce(ico('mail', 'tinted', 'Richiesta di offerta'), d, `${esc(d.status || '')} · ${fmtUom(qtaIn(d), u)}`)),
    ...ordini.map(d => voce(ico('receipt', 'tinted', 'Ordine a fornitore'), d, `${esc(d.status || '')} · ${fmtUom(qtaIn(d), u)} · ricevuto ${fmtUom((d.lines || []).filter(l => l.itemId === it.id).reduce((s, l) => s + (Number(l.received) || 0), 0), u)}`)),
    ...piani.map(p => voce(ico('list', 'tinted', 'Piano di fabbisogno'), p, p.active === false ? 'piano chiuso' : 'piano aperto')),
  ].join('');
  return itemInfoSection(ico('clipboard', 'tinted', '') + ' Documenti e piani in cui compare', `<div class="mgmt-list">${corpo}</div>`);
}

// ─── Allegati, in sola lettura ───
// Qui si **dice** che ci sono e come si chiamano, e basta. Niente pulsanti,
// niente campo per aggiungerne: la scheda si apre in mezzo a qualunque lavoro
// proprio perché non ha uno stato da salvare, e `test/iteminfo.test.js` tiene
// ferma quella proprietà per tutti — un allegato non vale l'eccezione.
// Si aggiungono e si tolgono da «Allegati» sulla riga di catalogo, che è dove
// stanno già gli altri editor per articolo (il listino fornitori, la distinta).
function itemInfoAllegati(it) {
  const lista = allegatiDi(it.id);
  if (!lista.length) return '';
  const righe = lista.map(a => `<div class="mgmt-item">
    <span class="mgmt-item-name">${ico('file', 'tinted', '')} ${esc(allegatoEtichetta(a))}</span>
    <span class="mgmt-item-meta">${esc(allegatoDettaglio(a))}${a.createdAt ? ' · ' + esc(fmtDateIt(a.createdAt)) : ''}${a.createdBy ? ' · ' + esc(actorName(a.createdBy)) : ''}</span>
  </div>`).join('');
  // I documenti d'archivio stanno in una cartella fuori dall'app, e quale
  // cartella lo decide ogni PC: dirlo qui evita che chi non trova un file lo
  // creda perduto invece che non configurato.
  const dove = lista.some(a => a.docId)
    ? `I documenti d'archivio stanno nella cartella impostata su <strong>questo computer</strong>${archivioNome() ? ' (' + esc(archivioNome()) + ')' : ''}; il database ne porta il percorso, non il contenuto.`
    : 'I file stanno su <strong>questo computer</strong>: il backup JSON ne porta l\'elenco, non il contenuto.';
  return itemInfoSection(ico('folder', 'tinted', '') + ' Allegati',
    `<div class="mgmt-list">${righe}</div>
     <p class="empty-text" style="text-align:left;padding:6px 0 0">${dove}</p>`);
}

function itemInfoRevisioni(it) {
  if (!hasRevisions(it)) return '';
  const revs = revisionsOf(it.id);
  if (!revs.length) return itemInfoSection(ico('clock', 'tinted', '') + ' Revisioni', `<div class="empty-text">Nessun rilascio: si sta lavorando sulla <strong>${esc(itemRev(it))}</strong>, la prima.</div>`);
  return itemInfoSection(ico('clock', 'tinted', '') + ' Revisioni', `<div class="mgmt-list">${revs.map(r => {
      const tot = r.snapshot && r.snapshot.cost ? r.snapshot.cost.total : null;
      return `<div class="mgmt-item">
        <span class="mgmt-item-name"><strong>${esc(r.rev || '')}</strong>${r.motivo ? ' — ' + esc(r.motivo) : ''}</span>
        <span class="mgmt-item-meta">${esc(fmtStamp(r.date))}${tot != null ? ' · costo congelato ' + fmtPer(tot, itemUom(it)) : ''}</span>
      </div>`;
    }).join('')}</div>
    <p class="empty-text" style="text-align:left;padding:6px 0 0">In lavorazione: <strong>${esc(itemRev(it))}</strong>. Le revisioni rilasciate sono fotografie e non cambiano più.</p>`);
}

// ═══════════════════════════════════════════════════════════
//  Storico delle modifiche: come si legge
// ═══════════════════════════════════════════════════════════
// Il registro lo scrive store.js a ogni salvataggio (storicoRegistra); qui si
// disegna. I nomi dei campi nel registro sono quelli dei dati (`supplierId`,
// `minStock`): a chi legge si mostrano in italiano, e gli id si risolvono nel
// nome **di adesso** — un fornitore rinominato si legge col nome nuovo, che è
// quello che chi cerca ha in testa.
const STORICO_COLL = {
  items: 'Articolo', suppliers: 'Fornitore', customers: 'Cliente', rfqs: 'Richiesta d\'offerta',
  orders: 'Ordine fornitore', workOrders: 'Ordine di lavoro', plans: 'Piano di fabbisogno',
  prodOrders: 'Ordine di produzione', jobs: 'Commessa', users: 'Utente', families: 'Famiglia',
  workCenters: 'Centro di lavoro', reminders: 'Promemoria', attachments: 'Allegato',
  attachmentDocs: 'Documento d\'archivio', productions: 'Produzione', settings: 'Impostazioni',
};
const STORICO_CAMPI = {
  code: 'Codice', name: 'Nome', description: 'Descrizione', type: 'Tipo', uom: 'U.M.',
  price: 'Prezzo', cost: 'Costo', supplierId: 'Fornitore', activePriceId: 'Prezzo in uso',
  priceList: 'Listino', components: 'Componenti', cycle: 'Ciclo', operations: 'Lavorazioni',
  lines: 'Righe', status: 'Stato', qty: 'Quantità', dueDate: 'Consegna', date: 'Data',
  notes: 'Note', notesInternal: 'Note interne', minStock: 'Scorta minima', familyId: 'Famiglia',
  active: 'Attivo', title: 'Titolo', customer: 'Cliente', customerId: 'Cliente', role: 'Ruolo',
  email: 'Email', passwordHash: 'Password', transport: 'Trasporto', payment: 'Pagamento',
  number: 'Numero', leadDays: 'Giorni di consegna', weight: 'Peso', workCenterId: 'Centro di lavoro',
  itemId: 'Articolo', jobId: 'Commessa', planId: 'Piano', makeOrBuy: 'Fare o comprare',
};
const STORICO_RIF = { supplierId: 'suppliers', customerId: 'customers', familyId: 'families',
  workCenterId: 'workCenters', itemId: 'items', jobId: 'jobs', planId: 'plans' };
function _storicoNomeRif(k, v) {
  const c = STORICO_RIF[k];
  if (!c || !v) return v;
  const r = (db[c] || []).find(x => x && x.id === v);
  return r ? storicoEtichetta(r) : v;
}
function _storicoQuando(t) {
  const d = new Date(t);
  return isNaN(d) ? '' : d.toLocaleDateString('it-IT') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function _storicoChi(u) {
  const x = u ? getUser(u) : null;
  return x ? x.name || x.username || x.email : (u ? 'utente rimosso' : '(nessun utente)');
}
const STORICO_OP = { n: 'ha creato', m: 'ha modificato', x: 'ha eliminato', b: 'modifiche in blocco su' };
// `conRecord`: nel registro generale si dice anche *che cosa*; nella scheda di
// un record si sa già.
function storicoVoceHtml(e, conRecord) {
  const coll = STORICO_COLL[e.c] || e.c;
  const cosa = e.op === 'b' ? `${coll.toLowerCase()}: ${esc(e.n || '')}`
    : (conRecord ? `${coll.toLowerCase()} <strong>${esc(e.n || '')}</strong>` : '');
  const righe = (e.d || []).map(x => {
    const a = _storicoNomeRif(x.k, x.a), b = _storicoNomeRif(x.k, x.b);
    return `<li><span class="storico-campo">${esc(STORICO_CAMPI[x.k] || x.k)}</span>
      ${a !== '' ? `<span class="storico-prima">${esc(a)}</span> → ` : ''}${b !== '' ? esc(b) : '<em>(vuoto)</em>'}${x.r ? ` <span class="storico-prima">(${esc(x.r)})</span>` : ''}</li>`;
  }).join('');
  return `<div class="storico-voce">
    <div class="storico-testa"><span class="storico-quando">${esc(_storicoQuando(e.t))}</span> <strong>${esc(_storicoChi(e.u))}</strong> ${STORICO_OP[e.op] || ''} ${cosa}</div>
    ${righe ? `<ul class="storico-campi">${righe}</ul>` : ''}</div>`;
}
// Le modifiche di un record, dalla più recente: la scheda «Storico» del
// pannello laterale.
function storicoBody(coll, id) {
  const voci = storicoDi(coll, id);
  if (!voci.length) return '<div class="empty-text">Nessuna modifica registrata. Lo storico conta dalla 0.95.0: le modifiche precedenti non sono state annotate.</div>';
  return `<div class="storico">${voci.map(e => storicoVoceHtml(e, false)).join('')}</div>`;
}
// Il registro intero, nella scheda Backup: le ultime STORICO_MOSTRA voci che
// passano il filtro. Il filtro cerca in tutto quello che si legge.
const STORICO_MOSTRA = 200;
let storicoFiltro = '';
function storicoVociFiltrate(q) {
  const tutte = Array.isArray(db.storico) ? db.storico : [];
  const f = String(q || '').trim().toLowerCase();
  const out = [];
  for (let i = tutte.length - 1; i >= 0 && out.length < STORICO_MOSTRA; i--) {
    const e = tutte[i];
    if (f) {
      const testo = [e.n, _storicoChi(e.u), STORICO_COLL[e.c] || e.c, _storicoQuando(e.t)]
        .concat((e.d || []).map(x => [STORICO_CAMPI[x.k] || x.k, _storicoNomeRif(x.k, x.a), _storicoNomeRif(x.k, x.b)].join(' ')))
        .join(' ').toLowerCase();
      if (testo.indexOf(f) < 0) continue;
    }
    out.push(e);
  }
  return out;
}
function storicoElencoHtml() {
  const voci = storicoVociFiltrate(storicoFiltro);
  if (!voci.length) return `<div class="empty-text">${storicoFiltro ? 'Nessuna modifica corrisponde alla ricerca.' : 'Nessuna modifica registrata finora.'}</div>`;
  return voci.map(e => storicoVoceHtml(e, true)).join('');
}
function storicoFiltra(q) {
  storicoFiltro = q;
  const el = document.getElementById('storico-elenco');
  if (el) el.innerHTML = storicoElencoHtml();
}
function renderStorico() {
  const n = Array.isArray(db.storico) ? db.storico.length : 0;
  return `<div class="cloud-section" style="margin-top:16px">
    <div style="flex:1">
      <strong>${ico('clock', 'tinted', '')} Storico delle modifiche</strong>
      <p>Chi ha cambiato cosa, e da quale valore a quale: articoli, documenti, anagrafiche, utenti e impostazioni. Si annota a ogni salvataggio, viaggia nel backup e tiene le ultime ${STORICO_MAX} modifiche (ora ${n}). Un import o una generazione di documenti che tocca molti record diventa una voce sola. La modifica di un articolo si vede anche nel pannello laterale, scheda <em>Storico</em>.</p>
      <input type="text" class="search" placeholder="Cerca per codice, numero, utente, campo…" value="${esc(storicoFiltro)}" oninput="storicoFiltra(this.value)" aria-label="Cerca nello storico" style="margin:8px 0;width:100%;max-width:420px">
      <div id="storico-elenco" class="storico">${storicoElencoHtml()}</div>
    </div></div>`;
}
