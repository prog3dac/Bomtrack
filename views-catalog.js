// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-catalog.js
// ═══════════════════════════════════════════════════════════
// Anagrafiche articoli (Acquisti e Progetto), listino fornitori con lo storico
// prezzi, scheda articolo e vista Cicli di lavorazione.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  LISTINO FORNITORI E STORICO PREZZI
// ═══════════════════════════════════════════════════════════
// Un articolo comprato viene quotato da più fornitori, e le quotazioni
// cambiano nel tempo. Il listino le conserva tutte; una sola è "in uso" ed è
// quella che finisce nei campi dell'articolo, cioè nella costificazione.
// Nessun costo viene derivato dal listino di nascosto: il passaggio è sempre
// una scelta esplicita, così un prezzo non cambia da solo sotto un'offerta.
// Anche le parti: molte si comprano già lavorate da terzi, e chi le produce in
// casa usa comunque il listino come unico posto dove nasce un costo unitario.
function hasPriceList(it) { return !!it && (it.type === 'acquistato' || it.type === 'materiale' || it.type === 'parte'); }
function priceRows(it) { return (it && it.priceList) || []; }
function activePriceRow(it) { return priceRows(it).find(r => r.id === it.activePriceId) || null; }
// ─── La quotazione con cui si parla a UN fornitore preciso ───
// Prezzo, unità, codice e descrizione su un documento non sono dell'articolo:
// sono di quel fornitore. Rossi lo chiama ROSSI-1 e lo quota 10 €/m, Bianchi lo
// chiama BIA-9 e lo quota 12 €/kg, e la stessa riga d'ordine porta l'uno o
// l'altro a seconda di a chi è intestata.
//
// Prenderli dalla quotazione **in uso** rispondeva alla domanda sbagliata —
// «quanto lo pago di solito?» invece di «quanto me lo fa questo qui?» — e
// mandava a un fornitore il prezzo di un altro.
//
// Fra le sue quotazioni vince la **più recente**: è l'ultima volta che ci si è
// parlati, e un listino vecchio di due anni non è il prezzo di oggi. A parità di
// data vince l'ultima registrata. La quotazione in uso non ha alcun privilegio
// qui: quella riguarda la costificazione, che è un'altra domanda.
//
// Dalla 0.109.0 conta solo una quotazione **con un prezzo**: una riga appena
// aggiunta e ancora vuota non è un'offerta, e non deve far sparire quella che
// c'è. Se il fornitore non ha ancora quotato niente, vale la riga vuota più
// recente — il documento la mostra «senza prezzo», come prima.
function supplierPriceRow(it, supplierId) {
  if (!it || !supplierId) return null;
  const sue = priceRows(it).filter(r => r.supplierId === supplierId);
  const quotate = sue.filter(priceRowQuoted);
  return (quotate.length ? quotate : sue)
    .reduce((best, r) => (!best || (r.date || '') >= (best.date || '') ? r : best), null);
}
function priceRowQuoted(r) { return !!r && r.price !== '' && r.price != null; }
// ─── Quotazioni sostituite: lo storico ───
// Un fornitore non ha due prezzi nello stesso momento: la quotazione nuova
// sostituisce la vecchia, che resta a listino solo come storico. Le sostituite
// non entrano nel confronto (la ↓, il risparmio del Riepilogo e del
// fabbisogno) e non si possono più scegliere come prezzo in uso. Una riga
// senza fornitore non ne sostituisce e non ne è sostituita: non si sa di chi è.
function priceRowSuperseded(it, row) {
  if (!row || !row.supplierId || !priceRowQuoted(row)) return false;
  const valida = supplierPriceRow(it, row.supplierId);
  return !!valida && valida.id !== row.id;
}
function validPriceRows(it) { return priceRows(it).filter(r => !priceRowSuperseded(it, r)); }
// ─── Quotazioni in un'unità diversa da quella di gestione ───
// L'unità in cui è espressa QUESTA quotazione. Vale solo se è l'unità
// alternativa dell'articolo: qualunque altra cosa vale come unità di gestione,
// così un dato sporco non produce una conversione inventata.
function priceUomOf(it, row) {
  const u = row && row.priceUom;
  return (u && hasAltUom(it) && u === altUomOf(it)) ? u : (it ? (it.uom || '') : '');
}
// Il costo di una quotazione **nell'unità di gestione**, che è l'unica in cui i
// costi hanno senso: le quantità delle distinte sono in quella.
// 2 €/kg su una barra da 8 kg/m fanno 16 €/m.
function rowUnitCost(it, row) {
  if (!row || row.price === '' || row.price == null) return null;
  return (Number(row.price) || 0) * uomFactor(it, priceUomOf(it, row));
}
// La quotazione più bassa tra quelle valorizzate (a parità, la più recente).
// Il confronto è sui costi **convertiti**, mai sui prezzi grezzi: «2 €/kg»
// sembrerebbe più conveniente di «5 €/m» su una barra che pesa 8 kg/m, e la
// segnalazione di risparmio consiglierebbe il fornitore più caro — un errore
// silenzioso e per giunta a effetto opposto.
//
// Solo fra le quotazioni **valide** (vedi priceRowSuperseded). Con
// `esclusoFornitore` si cerca un'alternativa a quel fornitore: è la domanda del
// risparmio, perché il prezzo nuovo dello stesso fornitore non è un'alternativa
// ma il suo prezzo di oggi.
function bestPriceRow(it, esclusoFornitore) {
  const quotate = validPriceRows(it).filter(r => priceRowQuoted(r)
    && !(esclusoFornitore && r.supplierId === esclusoFornitore));
  if (!quotate.length) return null;
  return quotate.reduce((best, r) => {
    const d = (rowUnitCost(it, r) || 0) - (rowUnitCost(it, best) || 0);
    if (d < 0) return r;
    if (d > 0) return best;
    return (r.date || '') > (best.date || '') ? r : best;
  });
}
// ─── Il prezzo in uso confrontato con il listino ───
// Due domande, la stessa per Riepilogo, fabbisogno e scheda articolo:
//   - la quotazione in uso è stata **sostituita** da una più recente dello
//     stesso fornitore? Allora il prezzo di riferimento è quello nuovo;
//   - un **altro** fornitore quota meno del riferimento? Quello è il risparmio.
// Un fornitore solo non dà mai risparmio: il suo prezzo nuovo è un
// aggiornamento, e si segnala come tale.
function priceCompare(it) {
  const campo = costField(it); if (!campo) return null;
  const inUso = Number(it[campo]) || 0;
  const attiva = activePriceRow(it);
  const fornitore = (attiva && attiva.supplierId) || '';
  const superata = !!attiva && priceRowSuperseded(it, attiva);
  const valida = superata ? supplierPriceRow(it, fornitore) : null;
  const attuale = valida ? (rowUnitCost(it, valida) || 0) : null;
  // Il riferimento è il listino di oggi del fornitore in uso; senza una
  // quotazione in uso, il prezzo scritto a mano nell'articolo.
  const riferimento = attuale != null ? attuale
    : attiva && priceRowQuoted(attiva) ? (rowUnitCost(it, attiva) || 0) : inUso;
  const best = bestPriceRow(it, fornitore);
  const migliore = best ? (rowUnitCost(it, best) || 0) : 0;
  const conviene = riferimento > 0 && migliore > 0 && migliore < riferimento - 0.00005;
  return { inUso, attiva, superata, valida, attuale, riferimento,
    best: conviene ? best : null, migliore: conviene ? migliore : null,
    saving: conviene ? riferimento - migliore : 0 };
}
// Porta una quotazione nei campi dell'articolo: da qui in poi è quella che costa.
// È la porta unica in cui avviene la conversione, ed è il motivo per cui il
// motore di costo non sa niente di unità di misura: riceve già tutto nell'unità
// di gestione e continua a moltiplicare un costo per una quantità.
function applyPriceRow(it, row) {
  const campo = costField(it);
  if (campo) it[campo] = rowUnitCost(it, row) || 0;
  // Il fornitore vale per ogni tipo con listino: senza, una materia prima o una
  // parte acquistata arriverebbero al fabbisogno e ai documenti senza intestatario.
  it.supplierId = row.supplierId || null;
  it.supplierCode = row.code || '';
  it.supplierDesc = row.desc || '';
  it.activePriceId = row.id;
}

// La scheda listino ricorda su quale articolo sta lavorando in una variabile
// globale: chiusa la scheda, la variabile va spenta, o un ridisegno arrivato da
// altrove continuerebbe a scrivere sull'articolo di prima.
onPanelClose('listino', () => { window.__priceItemId = null; });
function priceListModal(id) {
  const it = getItem(id); if (!it) return;
  if (!hasPriceList(it)) { showToast('Il listino vale solo per commerciali, materie prime e parti', 'error'); return; }
  window.__priceItemId = id;
  openModal(`<h3>${ico('euro', 'tinted pill', '')} Listino fornitori — ${esc(it.code)}</h3>
    <p style="color:var(--text-dim);margin-bottom:14px">${esc(it.name)} · ${typeLabel(it.type)}</p>
    <div id="pricelist-body">${priceListBody(id)}</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'listino');
}
function priceListRefresh() {
  const host = document.getElementById('pricelist-body');
  if (host && window.__priceItemId) host.innerHTML = priceListBody(window.__priceItemId);
}
function priceListBody(id) {
  const it = getItem(id); if (!it) return '';
  const campo = costField(it);
  const inUso = activePriceRow(it);
  const migliore = bestPriceRow(it);
  const scrivibile = canWrite('catalog');
  const doppia = hasAltUom(it);   // la colonna dell'unità compare solo se serve

  // Le quotazioni più recenti in cima: è quello che si guarda per primo.
  // Quelle sostituite da una più recente dello stesso fornitore vanno nello
  // storico, sotto: in sola lettura, e non si possono più usare. Fa eccezione
  // quella in uso, che resta qui con l'avviso finché non si sceglie la nuova.
  const tutte = priceRows(it).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const storico = tutte.filter(r => priceRowSuperseded(it, r) && !(inUso && r.id === inUso.id));
  const righe = tutte.filter(r => !storico.includes(r));
  const superataDa = inUso && priceRowSuperseded(it, inUso) ? supplierPriceRow(it, inUso.supplierId) : null;
  // La ↓ ha senso solo se c'è con chi confrontare: almeno due quotazioni valide.
  const confrontabili = validPriceRows(it).filter(priceRowQuoted).length;

  const corpo = righe.map(r => {
    const attiva = inUso && r.id === inUso.id;
    const best = migliore && r.id === migliore.id && confrontabili > 1;
    const ro = scrivibile ? '' : 'disabled';
    return `<tr class="${attiva ? 'price-active' : ''}">
      <td class="pl-flag">${attiva ? '<span title="Prezzo in uso nella costificazione">✓</span>' : ''}${best ? '<span class="price-best" title="Quotazione più bassa">↓</span>' : ''}</td>
      <td class="pl-sup">
        <select class="sel-cerca" ${ro} onchange="priceSetField('${r.id}','supplierId',this.value)">${supplierOptions(r.supplierId || '')}</select>
        <div class="pl-sub">
          <input class="pl-code" value="${esc(r.code || '')}" placeholder="codice fornitore" title="Codice dell'articolo presso il fornitore" ${ro} onchange="priceSetField('${r.id}','code',this.value)">
          <input class="pl-desc" value="${esc(r.desc || '')}" placeholder="descrizione fornitore" title="Descrizione dell'articolo presso il fornitore" ${ro} onchange="priceSetField('${r.id}','desc',this.value)">
          <span title="Da dove arriva la quotazione">${esc(priceRowOrigin(r))}</span>
          ${attiva && superataDa ? `<span class="home-ris-superato">sostituita dal listino del ${esc(fmtDateIt(superataDa.date) || '—')}</span>` : ''}
        </div>
      </td>
      <td><input type="number" class="num pl-price" min="0" step="0.0001" value="${r.price === '' || r.price == null ? '' : r.price}" ${ro} onchange="priceSetField('${r.id}','price',this.value)">
        ${doppia ? `<div class="pl-sub"><select ${ro} title="Unità in cui il fornitore quota" onchange="priceSetField('${r.id}','priceUom',this.value)">${itemUomOptions(it, priceUomOf(it, r))}</select>
          ${priceUomOf(it, r) !== (it.uom || '') ? `<span title="Costo convertito nell'unità di gestione">= ${fmtN(rowUnitCost(it, r) || 0)}/${esc(it.uom || '')}</span>` : ''}</div>` : ''}</td>
      <td><input type="number" class="num pl-small" min="0" step="any" value="${r.minQty === '' || r.minQty == null ? '' : r.minQty}" placeholder="—" title="Quantità minima, nell'unità della quotazione" ${ro} onchange="priceSetField('${r.id}','minQty',this.value)"></td>
      <td><input type="number" class="num pl-small" min="0" max="9999" step="1" value="${r.leadDays === '' || r.leadDays == null ? '' : r.leadDays}" placeholder="—" title="Giorni di consegna" ${ro} onchange="priceSetField('${r.id}','leadDays',this.value)"></td>
      <td><input type="date" class="pl-date" value="${esc(r.date || '')}" ${ro} onchange="priceSetField('${r.id}','date',this.value)"></td>
      <td class="pl-act">
        ${attiva ? '' : `<button class="mini-btn" title="Usa questo prezzo nella costificazione" onclick="priceUseRow('${r.id}')">✓ Usa</button>`}
        <button class="mini-btn danger" title="Elimina la voce" onclick="priceDelRow('${r.id}')">${ico('trash', 'tinted', 'Elimina la voce')}</button>
      </td></tr>`;
  }).join('');

  const vuoto = `<tr><td colspan="7" class="empty-text">Nessuna quotazione registrata. Aggiungine una, oppure registrale da una richiesta di offerta ricevuta.</td></tr>`;
  const attuale = campo
    ? `<p style="margin-bottom:12px">Prezzo in uso nella costificazione: <strong style="font-family:var(--mono)">${fmtPer(Number(it[campo]) || 0, itemUom(it))}</strong>${doppia ? ` <span style="color:var(--text-dim)">— ${esc(itemUom(it))} è l'unità con cui l'articolo si gestisce e si mette in distinta</span>` : ''}${inUso ? '' : ' <span style="color:var(--text-dim)">(inserito a mano, non da listino)</span>'}</p>`
    : `<p style="margin-bottom:12px;color:var(--text-dim)">Il costo di questa parte è derivato dalla distinta parte e dal ciclo di lavorazione. Con “✓ Usa” si può passare al prezzo del fornitore, cambiando il modo di calcolo.</p>`;
  // Prezzo e quantità minima sono entrambi nell'unità **della quotazione**, che
  // può non essere quella di gestione: quando le due differiscono la colonna
  // dell'unità compare accanto al prezzo e l'intestazione non la anticipa.
  const uQuot = doppia ? 'U.M. quotazione' : (itemUom(it) || 'U.M.');
  const avvisoSuperata = superataDa ? `<div class="price-superata">
      <span style="flex:1">${ico('warning', 'tinted', '')} Il prezzo in uso viene da una quotazione di <strong>${esc(supplierName(inUso.supplierId) || 'questo fornitore')}</strong>
        sostituita da quella del ${esc(fmtDateIt(superataDa.date) || '—')}: <strong style="font-family:var(--mono)">${fmtPer(rowUnitCost(it, superataDa) || 0, itemUom(it))}</strong>.</span>
      ${scrivibile ? `<button class="add-btn-sm" onclick="priceUseRow('${superataDa.id}')">✓ Usa la nuova</button>` : ''}
    </div>` : '';
  const righeStorico = storico.map(r => `<tr class="price-storico">
      <td>${esc(supplierName(r.supplierId) || '—')}${r.code ? ` <span style="font-family:var(--mono)">${esc(r.code)}</span>` : ''}</td>
      <td class="num">${priceRowQuoted(r) ? fmtPer(Number(r.price) || 0, priceUomOf(it, r)) : '—'}</td>
      <td>${r.date ? esc(fmtDateIt(r.date)) : '—'}</td>
      <td>${esc(priceRowOrigin(r))}</td>
      <td class="pl-act">${scrivibile ? `<button class="mini-btn danger" title="Elimina dallo storico" onclick="priceDelRow('${r.id}')">${ico('trash', 'tinted', 'Elimina dallo storico')}</button>` : ''}</td></tr>`).join('');
  const storicoHtml = storico.length ? `<details class="price-storico-box">
      <summary>Storico: ${storico.length} ${storico.length === 1 ? 'quotazione sostituita' : 'quotazioni sostituite'} da una più recente dello stesso fornitore</summary>
      <div class="table-wrap"><table class="price-table">
        <thead><tr><th scope="col">Fornitore</th><th scope="col" class="num">Prezzo</th><th scope="col">Data</th><th scope="col">Origine</th><th scope="col"></th></tr></thead>
        <tbody>${righeStorico}</tbody></table></div>
    </details>` : '';
  return `${attuale}${avvisoSuperata}
    <div class="table-wrap"><table class="price-table">
      <thead><tr><th scope="col"></th><th scope="col">Fornitore</th><th scope="col">Prezzo (${esc(cur())}/${esc(uQuot)})</th><th scope="col">Q.tà min (${esc(uQuot)})</th>
        <th scope="col" title="Giorni di consegna">GG</th><th scope="col">Data</th><th scope="col"></th></tr></thead>
      <tbody>${corpo || vuoto}</tbody></table></div>
    <div style="margin-top:10px"><button class="add-btn-sm" onclick="priceAddRow()">+ Aggiungi quotazione</button></div>
    ${storicoHtml}`;
}
// ═══════════════════════════════════════════════════════════
//  LISTINO FORNITORI — la vista d'insieme
// ═══════════════════════════════════════════════════════════
// Fino alla 0.90 il listino si apriva solo dalla scheda di un articolo, e a
// domande come «cosa mi quota Bonfiglioli?» o «quali prezzi hanno più di un
// anno?» non rispondeva nessuna schermata. Qui ci sono tutte le quotazioni,
// una per riga; per modificarne una si apre il listino del suo articolo, che
// resta l'unico posto dove un prezzo si scrive e si mette in uso.
const _plv = { q: '', sup: '', tipo: '', solo: '' };
function plvRows() {
  const q = _plv.q.trim().toLowerCase();
  const out = [];
  (db.items || []).forEach(it => {
    if (!hasPriceList(it) || it.active === false) return;
    if (_plv.tipo && it.type !== _plv.tipo) return;
    const inUso = activePriceRow(it);
    const migliore = bestPriceRow(it);
    const confrontabili = validPriceRows(it).filter(priceRowQuoted).length;
    const righe = priceRows(it);
    righe.forEach(r => {
      if (_plv.sup && (r.supplierId || '') !== _plv.sup) return;
      const attiva = !!inUso && r.id === inUso.id;
      if (_plv.solo === 'uso' && !attiva) return;
      if (_plv.solo === 'senza' && r.price !== '' && r.price != null) return;
      const storico = priceRowSuperseded(it, r);
      if (_plv.solo === 'valide' && storico) return;
      const sup = getSupplier(r.supplierId);
      if (q) {
        const testo = [it.code, it.name, sup && sup.name, r.code, r.desc].join(' ').toLowerCase();
        if (!testo.includes(q)) return;
      }
      out.push({ it, r, sup, attiva, storico, best: !!migliore && r.id === migliore.id && confrontabili > 1 });
    });
  });
  // Per codice articolo, e dentro l'articolo le quotazioni più recenti in cima:
  // lo stesso ordine della scheda.
  return out.sort((a, b) => (a.it.code || '').localeCompare(b.it.code || '', 'it', { numeric: true })
    || (b.r.date || '').localeCompare(a.r.date || ''));
}
function plvSet(campo, valore) { _plv[campo] = valore; renderPriceListView(); }
function plvSearchInput(v) {
  _plv.q = v;
  const host = document.getElementById('plv-body');
  if (host) host.innerHTML = plvBody(plvRows());
}
function plvPrezzo(x) {
  if (x.r.price === '' || x.r.price == null) return '<span style="color:var(--text-dim)">—</span>';
  const u = priceUomOf(x.it, x.r);
  return `<span style="font-family:var(--mono)">${fmtPer(Number(x.r.price) || 0, u)}</span>`;
}
function plvBody(righe) {
  if (!righe.length) {
    const nulla = !(db.items || []).some(it => hasPriceList(it) && priceRows(it).length);
    return `<p class="empty-text">${nulla
      ? 'Nessuna quotazione registrata. Si aggiungono dal listino di un articolo, oppure tornano con i prezzi di una richiesta di offerta.'
      : 'Nessuna quotazione corrisponde ai filtri.'}</p>`;
  }
  return `<div class="table-wrap"><table class="price-table plv-table">
    <thead><tr><th scope="col"></th><th scope="col">Articolo</th><th scope="col">Descrizione</th><th scope="col">Fornitore</th>
      <th scope="col">Cod. fornitore</th><th scope="col" class="num">Prezzo</th><th scope="col" class="num">Q.tà min</th>
      <th scope="col" class="num" title="Giorni di consegna">GG</th><th scope="col">Data</th><th scope="col">Origine</th></tr></thead>
    <tbody>${righe.map(x => `<tr class="${x.attiva ? 'price-active' : x.storico ? 'price-storico' : ''}" style="cursor:pointer" tabindex="0" onclick="priceListModal('${x.it.id}')" onkeydown="if(event.key==='Enter')priceListModal('${x.it.id}')" title="Apri il listino di ${esc(x.it.code)}">
      <td class="pl-flag">${x.attiva ? '<span title="Prezzo in uso nella costificazione">✓</span>' : ''}${x.best ? '<span class="price-best" title="Quotazione più bassa">↓</span>' : ''}${x.storico ? '<span class="price-tag-storico" title="Sostituita da una quotazione più recente dello stesso fornitore">storico</span>' : ''}</td>
      <td><span class="code">${esc(x.it.code)}</span></td>
      <td>${esc(x.it.name)} <span style="color:var(--text-dim)">· ${esc(typeLabel(x.it.type))}</span></td>
      <td>${x.sup ? esc(x.sup.name) : '<span style="color:var(--text-dim)">—</span>'}</td>
      <td>${esc(x.r.code || '')}</td>
      <td class="num">${plvPrezzo(x)}</td>
      <td class="num">${x.r.minQty === '' || x.r.minQty == null ? '—' : esc(fmtQtyIt(x.r.minQty))}</td>
      <td class="num">${x.r.leadDays === '' || x.r.leadDays == null ? '—' : esc(String(x.r.leadDays))}</td>
      <td>${x.r.date ? esc(fmtDateIt(x.r.date)) : '—'}</td>
      <td>${esc(priceRowOrigin(x.r))}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderPriceListView() {
  const host = document.getElementById('view-pricelist'); if (!host) return;
  invalidateCaches();
  if (_plv.sup && !getSupplier(_plv.sup)) _plv.sup = '';
  const righe = plvRows();
  const tipi = ['acquistato', 'materiale', 'parte'];
  host.innerHTML = `<div class="manage-wrap">
    <div class="bom-toolbar">
      <div class="bom-toolbar-left">
        <h2 class="section-title">${ico('euro', 'tinted pill', '')} Listino fornitori</h2>
      </div>
      <div class="bom-toolbar-right">${listExportButtons('plvExportSpec')}</div>
    </div>
    <div class="catalog-filters">
      <input type="text" class="search" id="plv-search" placeholder="Cerca articolo, fornitore o codice fornitore..." value="${esc(_plv.q)}" oninput="plvSearchInput(this.value)">
      <select id="plv-sup" class="sel-cerca" onchange="plvSet('sup', this.value)" title="Fornitore">
        <option value="">Tutti i fornitori</option>
        ${(db.suppliers || []).map(s => `<option value="${esc(s.id)}" ${s.id === _plv.sup ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>
      <select id="plv-tipo" onchange="plvSet('tipo', this.value)" title="Tipo di articolo">
        <option value="">Tutti i tipi</option>
        ${tipi.map(t => `<option value="${t}" ${t === _plv.tipo ? 'selected' : ''}>${esc(typeLabel(t))}</option>`).join('')}
      </select>
      <select id="plv-solo" onchange="plvSet('solo', this.value)" title="Quali quotazioni">
        <option value="">Tutte le quotazioni</option>
        <option value="uso" ${_plv.solo === 'uso' ? 'selected' : ''}>Solo i prezzi in uso</option>
        <option value="valide" ${_plv.solo === 'valide' ? 'selected' : ''}>Senza lo storico</option>
        <option value="senza" ${_plv.solo === 'senza' ? 'selected' : ''}>Senza prezzo</option>
      </select>
      <span class="doc-filter-count">${righe.length} ${righe.length === 1 ? 'quotazione' : 'quotazioni'}</span>
    </div>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Tutte le quotazioni di commerciali, materie prime e parti. ✓ è il prezzo in uso nella costificazione, ↓ la quotazione più bassa dell'articolo. Per ogni fornitore vale la quotazione più recente: le precedenti sono segnate «storico» e non entrano nei confronti. Un clic sulla riga apre il listino dell'articolo, dove si modifica e si sceglie il prezzo in uso.</p>
    <div id="plv-body">${plvBody(righe)}</div>
  </div>`;
}
function plvExportSpec() {
  const righe = plvRows();
  const solo = { uso: 'Solo i prezzi in uso', senza: 'Senza prezzo', valide: 'Senza lo storico' }[_plv.solo] || '';
  return {
    titolo: 'Listino fornitori',
    slug: 'listino_fornitori',
    filtri: [['Testo', _plv.q.trim()], ['Fornitore', _plv.sup ? ((getSupplier(_plv.sup) || {}).name || '') : ''],
      ['Tipo', _plv.tipo ? typeLabel(_plv.tipo) : ''], ['Quotazioni', solo]],
    sezioni: [{
      nome: 'Quotazioni',
      colonne: [
        { h: 'Codice', w: 14 }, { h: 'Descrizione', w: 30 }, { h: 'Tipo', w: 14 }, { h: 'Fornitore', w: 24 },
        { h: 'Cod. fornitore', w: 14 }, { h: 'Prezzo', w: 12, num: true }, { h: 'U.M.', w: 6 },
        { h: 'Q.tà min', w: 9, num: true }, { h: 'GG', w: 6, num: true }, { h: 'Data', w: 11, data: true },
        { h: 'In uso', w: 7 }, { h: 'Storico', w: 8 }, { h: 'Origine', w: 14 }],
      righe: righe.map(x => [x.it.code || '', x.it.name || '', typeLabel(x.it.type), x.sup ? x.sup.name : '',
        x.r.code || '', x.r.price === '' || x.r.price == null ? '' : Number(x.r.price) || 0, priceUomOf(x.it, x.r),
        x.r.minQty === '' || x.r.minQty == null ? '' : Number(x.r.minQty) || 0,
        x.r.leadDays === '' || x.r.leadDays == null ? '' : Number(x.r.leadDays) || 0,
        x.r.date || '', x.attiva ? 'sì' : '', x.storico ? 'sì' : '', priceRowOrigin(x.r)]),
    }],
  };
}
function priceRowOrigin(r) {
  if (!r.rfqId) return 'a mano';
  const q = db.rfqs.find(x => x.id === r.rfqId);
  return q ? q.number : 'richiesta eliminata';
}
// ─── Mutatori del listino ───
// Ogni operazione salva: il listino è un dato dell'articolo come gli altri.
function priceRowById(rowId) {
  const it = getItem(window.__priceItemId);
  if (!it) return null;
  return { it, row: priceRows(it).find(r => r.id === rowId) || null };
}
function priceAddRow() {
  if (!roleGuard('catalog')) return;
  const it = getItem(window.__priceItemId); if (!it) return;
  // Il listino lo semina migrateDB() su ogni articolo che ne ha diritto, quindi
  // di norma c'è già; ma dipendere da una migrazione per non lanciare è una
  // fragilità che costa una riga togliere.
  if (!Array.isArray(it.priceList)) it.priceList = [];
  it.priceList.push(stampNew({
    id: gid(), supplierId: it.supplierId || null, price: '', minQty: '', leadDays: '',
    code: '', desc: '', date: oggiISO(), rfqId: null, note: '',
  }));
  touch(it); saveDB(); priceListRefresh(); renderCatalogs();
}
function priceSetField(rowId, field, value) {
  if (!roleGuard('catalog')) { priceListRefresh(); return; }
  const found = priceRowById(rowId); if (!found || !found.row) return;
  const { it, row } = found;
  if (field === 'price' || field === 'minQty') {
    row[field] = value === '' ? '' : clampNum(parseFloat(value), 0);
  } else if (field === 'priceUom') {
    // Vuoto o pari all'unità di gestione = nessuna conversione: si toglie il
    // campo invece di scriverci dentro un valore che vuol dire "niente".
    if (value && hasAltUom(it) && value === altUomOf(it)) row.priceUom = value;
    else delete row.priceUom;
  } else if (field === 'leadDays') {
    // La colonna è larga quattro cifre: oltre 9999 giorni non è un termine di consegna.
    row.leadDays = value === '' ? '' : clampNum(parseFloat(value), 0, 9999);
  } else if (field === 'supplierId') {
    row.supplierId = value || null;
  } else {
    row[field] = value;
  }
  touch(row); touch(it);
  // Correggere il prezzo della quotazione in uso deve muovere anche il costo:
  // altrimenti listino e costificazione direbbero due cose diverse. Vale anche
  // per l'unità: cambiarla senza ricalcolare lascerebbe un costo che è un
  // numero giusto nell'unità sbagliata, cioè un numero sbagliato.
  //
  // E vale per fornitore, codice e descrizione: l'articolo ne tiene una copia
  // (è il "prezzo in uso"), e correggere un refuso nel codice del fornitore
  // sulla riga in uso lasciava quella copia al valore vecchio — cioè lasciava
  // in giro un secondo codice, sbagliato, che nessuna schermata mostrava come
  // tale. Si riapplica la riga: è già la porta unica per questo travaso.
  const RIAPPLICA = ['price', 'priceUom', 'supplierId', 'code', 'desc'];
  if (RIAPPLICA.includes(field) && it.activePriceId === row.id) applyPriceRow(it, row);
  saveDB(); priceListRefresh(); renderCatalogs();
}
function priceUseRow(rowId) {
  if (!roleGuard('catalog')) return;
  const found = priceRowById(rowId); if (!found || !found.row) return;
  if (priceRowSuperseded(found.it, found.row)) {
    showToast('Questa quotazione è stata sostituita da una più recente dello stesso fornitore: usa quella', 'error'); return;
  }
  // Parte prodotta in casa: il costo lo determina il ciclo, non c'è un campo dove
  // scrivere il prezzo. Usarlo significa dire che quella parte la si compra —
  // decisione che sposta il costo di ogni distinta che la contiene, quindi si chiede.
  if (!costField(found.it)) { priceSourcingModal(rowId); return; }
  priceApplyRow(rowId);
}
// Il passaggio vero e proprio, una volta che c'è un campo dove scrivere.
function priceApplyRow(rowId) {
  if (!roleGuard('catalog')) return;
  const found = priceRowById(rowId); if (!found || !found.row) return;
  applyPriceRow(found.it, found.row);
  touch(found.it); saveDB(); priceListRefresh(); renderCatalogs();
  // showToast passa già da esc(): l'unità va concatenata cruda, non da fmtPer.
  const uRiga = priceUomOf(found.it, found.row);
  showToast('Prezzo in uso aggiornato: ' + fmtN(Number(found.row.price) || 0) + (uRiga ? '/' + uRiga : ''));
}
function priceSourcingModal(rowId) {
  const found = priceRowById(rowId); if (!found || !found.row) return;
  openModal(`<h3>Questa parte risulta prodotta in casa</h3>
    <p style="margin-bottom:14px">Il costo di <strong>${esc(found.it.code)}</strong> lo determinano la sua distinta parte e il suo
      ciclo di lavorazione. Per usare il prezzo del fornitore va segnata come <strong>acquistata</strong>: il costo diventa
      quello a listino e nel fabbisogno la sua distinta smette di esplodersi.</p>
    <p style="margin-bottom:14px;color:var(--text-dim)">Distinta e ciclo restano salvati: si può tornare indietro dalla scheda articolo.</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="priceUseAsBought('${rowId}')">Segna come acquistata e usa il prezzo</button>
    </div>`, true, 'listino-sourcing');
}
function priceUseAsBought(rowId) {
  if (!roleGuard('catalog')) return;
  const found = priceRowById(rowId); if (!found || !found.row) return;
  found.it.sourcing = 'buy';
  closeModal();
  priceApplyRow(rowId);
  renderBom();
  showToast(found.it.code + ': parte acquistata da fornitore');
}
function priceDelRow(rowId) {
  if (!roleGuard('catalog')) return;
  const found = priceRowById(rowId); if (!found || !found.row) return;
  const { it, row } = found;
  const attiva = it.activePriceId === row.id;
  askConfirm(attiva
    ? 'Questa è la quotazione in uso. Eliminandola il costo dell\'articolo resta quello attuale, ma non sarà più legato a un fornitore. Procedere?'
    : 'Eliminare questa quotazione dal listino?', () => {
    it.priceList = it.priceList.filter(r => r.id !== rowId);
    if (attiva) it.activePriceId = null;   // il costo resta, si sgancia il riferimento
    touch(it); saveDB(); priceListRefresh(); renderCatalogs();
  });
}

// ─── Dalla richiesta di offerta al listino ───
// Le righe da catalogo con un prezzo compilato diventano quotazioni. Una riga
// già registrata non si duplica: la coppia richiesta + riga è la chiave.
// Se dopo la registrazione il prezzo sulla richiesta cambia (un errore di
// battitura, un'offerta rivista), la quotazione si aggiorna invece di restare
// al prezzo vecchio senza che niente lo dica.
function rfqQuoteRow(it, r, l) { return priceRows(it).find(p => p.rfqId === r.id && p.lineId === l.id) || null; }
function rfqPriceCandidates(r) {
  if (!r || !r.supplierId) return [];
  return (r.lines || []).filter(l => {
    if (!l.itemId || l.price === '' || l.price == null) return false;
    const it = getItem(l.itemId);
    if (!hasPriceList(it)) return false;
    const fatta = rfqQuoteRow(it, r, l);
    return !fatta || Number(fatta.price) !== (Number(l.price) || 0);
  });
}
// L'id della quotazione nasce dalla richiesta e dalla riga, uguale su ogni PC:
// due colleghi che registrano la stessa offerta prima di essersi visti
// scrivono la stessa quotazione, non due che il server rifiuta (c'è un indice
// unico su articolo + richiesta + riga) bloccando l'invio di chi arriva dopo.
function rfqQuoteId(rfqId, lineId) { return idDaChiave(String(rfqId) + '|' + String(lineId)); }
// Con più righe da registrare si sceglie quali: un'offerta può avere prezzi
// che non si vogliono a listino (un lotto speciale, un prezzo da ritrattare).
// Con una riga sola non c'è niente da scegliere e si registra subito.
function rfqRecordPricesModal(id) {
  if (!roleGuard('catalog')) return;
  const r = getRfq(id); if (!r) return;
  if (!r.supplierId) { showToast('La richiesta non ha un fornitore', 'error'); return; }
  const righe = rfqPriceCandidates(r);
  if (!righe.length) { showToast('Nessun prezzo nuovo da registrare', 'error'); return; }
  if (righe.length === 1) { rfqRecordPrices(id); return; }
  const elenco = righe.map(l => {
    const it = getItem(l.itemId);
    const fatta = rfqQuoteRow(it, r, l);
    const prezzo = fmtPrezzo(Number(l.price) || 0);
    return `<label class="rfq-pick-row"><input type="checkbox" value="${esc(l.id)}" checked onchange="rfqRecordPickCount()">
      <span style="font-family:var(--mono)">${esc(it.code || '')}</span> ${esc(it.name || '')}
      <span class="rfq-pick-type">${fatta ? esc(fmtPrezzo(Number(fatta.price) || 0)) + ' → ' : ''}${esc(prezzo)}</span></label>`;
  }).join('');
  openModal(`<h3>${ico('euro', 'tinted pill', '')} Registra a listino</h3>
    <p>Scegli quali prezzi di ${esc(supplierName(r.supplierId) || 'questo fornitore')} registrare. Quelli già a listino con un prezzo diverso si aggiornano.</p>
    <div class="rfq-pick-list" id="rfq-rec-list">${elenco}</div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" id="rfq-rec-ok" onclick="rfqRecordPicked('${r.id}')">${ico('check', '', '')} Registra (${righe.length})</button>
    </div>`, false, 'form');
}
function rfqRecordPickIds() {
  return Array.from(document.querySelectorAll('#rfq-rec-list input:checked')).map(c => c.value);
}
function rfqRecordPickCount() {
  const b = document.getElementById('rfq-rec-ok'); if (!b) return;
  const n = rfqRecordPickIds().length;
  b.disabled = !n;
  b.innerHTML = `${ico('check', '', '')} Registra (${n})`;
}
function rfqRecordPicked(id) {
  const ids = rfqRecordPickIds();
  if (!ids.length) return;
  closeModal();
  rfqRecordPrices(id, ids);
}
// `lineIds` limita la registrazione a quelle righe; senza, si registrano tutte.
// La data della quotazione è quella in cui entra a listino, non quella della
// richiesta: l'offerta arriva giorni o settimane dopo la richiesta.
function rfqRecordPrices(id, lineIds) {
  if (!roleGuard('catalog')) return;
  const r = getRfq(id); if (!r) return;
  if (!r.supplierId) { showToast('La richiesta non ha un fornitore', 'error'); return; }
  const righe = rfqPriceCandidates(r).filter(l => !lineIds || lineIds.includes(l.id));
  if (!righe.length) { showToast('Nessun prezzo nuovo da registrare', 'error'); return; }
  const data = oggiISO();
  let nuove = 0, aggiornate = 0;
  righe.forEach(l => {
    const it = getItem(l.itemId);
    const prezzo = Number(l.price) || 0;
    const fatta = rfqQuoteRow(it, r, l);
    if (fatta) {
      fatta.price = prezzo;
      // Quella in uso porta il prezzo nel costo: si riapplica, come quando lo
      // si corregge dal listino (priceSetField).
      if (it.activePriceId === fatta.id) applyPriceRow(it, fatta);
      aggiornate++;
    } else {
      const si = rfqLineSupInfo(r, l);
      it.priceList.push(stampNew({
        id: rfqQuoteId(r.id, l.id), supplierId: r.supplierId, price: prezzo,
        minQty: '', leadDays: '', code: (si && si.code) || '', desc: (si && si.desc) || '',
        date: data, rfqId: r.id, lineId: l.id, note: '',
      }));
      nuove++;
    }
    touch(it);
  });
  saveDB(); renderRfq(); renderCatalogs();
  const parti = [];
  if (nuove) parti.push(nuove + (nuove === 1 ? ' prezzo registrato' : ' prezzi registrati'));
  if (aggiornate) parti.push(aggiornate + (aggiornate === 1 ? ' prezzo aggiornato' : ' prezzi aggiornati'));
  showToast(parti.join(', ') + ' a listino');
}

function usageModal(id) {
  const it = getItem(id); if (!it) return;
  window.__usageItemId = id;
  openModal(`<h3>${ico('link', 'tinted pill', '')} Dove è usato — ${esc(it.code)}</h3>
    <p style="color:var(--text-dim);margin-bottom:14px">${esc(it.name)} · ${typeLabel(it.type)}</p>
    ${usageWhatIfField(it)}
    <div id="usage-body">${usageBody(id)}</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'usage');
}
function usageWhatIfField(it) {
  const campo = costField(it);
  if (!campo) return '';
  const attuale = Number(it[campo]) || 0;
  return `<div class="modal-field">
    <label>Simula un costo diverso (${cur()}/${esc(it.uom || 'U.M.')})</label>
    <input type="number" id="usage-whatif" min="0" step="0.0001" placeholder="${attuale.toFixed(4)}"
      oninput="debounced('whatif', usageRecalc)" autocomplete="off">
    <small style="color:var(--text-dim)">Il valore non viene salvato: serve solo a vedere l'effetto sulle macchine qui sotto.</small>
  </div>`;
}
// Ridisegna solo il corpo: la barra della simulazione resta com'è, altrimenti
// il campo perderebbe il focus a ogni cifra digitata.
function usageRecalc() {
  if (window.__usageItemId) renderInto('usage-body', () => usageBody(window.__usageItemId));
}
function usageBody(id) {
  const it = getItem(id); if (!it) return '';
  const diretti = directUses(id);
  const cime = impactedTops(id);
  const simula = costField(it) && val('usage-whatif') !== '';
  const nuovo = simula ? numVal('usage-whatif', 0) : null;

  if (!diretti.length) {
    return `<div class="empty-text">Questo articolo non è usato da nessuna parte: si può eliminare senza conseguenze.</div>`;
  }

  // Le quantità in colonna sono di **questo** articolo dentro i suoi padri: la
  // sua unità vale per tutte le righe e si dice una volta, in testa.
  const u = itemUom(it);
  const tabDiretti = `<div class="cat-group-title">Impieghi diretti (${diretti.length})</div>
    <table><thead><tr><th scope="col">Codice</th><th scope="col">Articolo</th><th scope="col">Tipo</th><th scope="col" style="text-align:right">${labelUom('Q.tà', u)}</th><th scope="col"></th></tr></thead>
    <tbody>${diretti.map(r => `<tr>
      <td style="font-family:var(--mono)">${codeLink(r.item.id, r.item.code)}</td>
      <td>${esc(r.item.name)}</td>
      <td><span class="bom-type-tag tt-${typeKey(r.item.type)}">${typeShort(r.item.type)}</span> ${typeLabel(r.item.type)}</td>
      <td style="text-align:right;font-family:var(--mono)">${fmtQtyIt(r.qty)}</td>
      <td style="text-align:right"><button class="mini-btn" title="Apri qui" onclick="usageModal('${r.item.id}')">${ico('link', 'tinted', 'Apri qui')}</button></td>
    </tr>`).join('')}</tbody></table>`;

  if (!cime.length) return tabDiretti;

  const etichettaCime = cime.some(c => c.item.type === 'macchina') ? 'Macchine impattate' : 'Assiemi di testa impattati';
  const colonneSim = simula ? '<th scope="col" style="text-align:right">Costo simulato</th><th scope="col" style="text-align:right">Differenza</th>' : '';
  // Un solo withTempCost per tutte le cime: entra e esce dalla simulazione una
  // volta, non una per riga — ogni giro azzerava le cache globali due volte e
  // rifaceva ogni rollup da zero, a ogni carattere digitato nel campo.
  const costiDopo = simula ? withTempCost(it, nuovo, () => cime.map(c => costOf(c.item.id).total)) : null;
  const righe = cime.map((c, i) => {
    const costoOra = costOf(c.item.id).total;
    const prezzoOra = sellingPrice(c.item.id);
    // Costi e prezzi qui sono di una unità della **cima** impattata, che ha la
    // sua unità e non quella dell'articolo simulato.
    const uc = itemUom(c.item);
    let celleSim = '';
    if (simula) {
      const costoDopo = costiDopo[i];
      const delta = costoDopo - costoOra;
      const segno = delta > 0 ? '+' : '';
      const colore = Math.abs(delta) < 0.005 ? 'var(--text-dim)' : (delta > 0 ? 'var(--red)' : 'var(--green)');
      celleSim = `<td style="text-align:right;font-family:var(--mono)">${fmtPer(costoDopo, uc)}</td>
        <td style="text-align:right;font-family:var(--mono);color:${colore}">${segno}${fmtPer(delta, uc)}</td>`;
    }
    return `<tr>
      <td style="font-family:var(--mono)">${codeLink(c.item.id, c.item.code)}</td>
      <td>${esc(c.item.name)}</td>
      <td style="text-align:right;font-family:var(--mono)">${fmtQtyIt(c.qty)}</td>
      <td style="text-align:right;font-family:var(--mono)">${fmtPer(costoOra, uc)}</td>
      <td style="text-align:right;font-family:var(--mono)">${fmtPer(prezzoOra, uc)}</td>
      ${celleSim}</tr>`;
  }).join('');

  return `${tabDiretti}
    <div class="cat-group-title">${etichettaCime} (${cime.length})</div>
    <table><thead><tr><th scope="col">Codice</th><th scope="col">Articolo</th>
      <th scope="col" style="text-align:right">${labelUom('Q.tà impiegata', u)}</th><th scope="col" style="text-align:right">Costo attuale</th>
      <th scope="col" style="text-align:right">Prezzo vendita</th>${colonneSim}</tr></thead>
    <tbody>${righe}</tbody></table>
    <p style="color:var(--text-dim);font-size:12px;margin-top:10px">La quantità è quella necessaria per una unità dell'assieme di testa, scarto compreso.</p>`;
}

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
function toggleFavorite(id) {
  if (!roleGuard('catalog')) return;
  const it = getItem(id); if (!it) return;
  it.favorite = !it.favorite;
  touch(it); saveDB(); renderCatalogs();
}
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
    + (i.obsolete ? ' <span class="obs-mark" title="Articolo obsoleto">' + ico('blocked', 'tinted') + '</span>' : '');
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
  return (i.favorite ? '★ ' : '') + (i.obsolete ? '⛔ ' : '');
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
  else if (isAssembly(i.type)) meta = (i.components || []).length + ' comp. / ' + (i.operations || []).length + ' lav.';
  else if (i.type === 'parte') {
    // Una parte comprata si riconosce dal fornitore, non dal suo ciclo
    meta = partSourcing(i) === 'buy'
      ? (supplierName(i.supplierId) || 'da acquistare')
      : ((i.cycle || []).length ? cycleCountLabel(i) : '—');
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
    <td class="col-code" style="font-family:var(--mono)">${codeLink(i.id, i.code)}${codeManualMark(i)}</td>
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
      ${i.type === 'parte' ? `<button class="mini-btn" title="Distinta parte e ciclo di lavorazione" onclick="openCycleFor('${i.id}')">${ico('wrench', 'tinted', 'Distinta parte e ciclo di lavorazione')}</button>` : ''}
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
  const keys = Object.keys(groups).sort((a, b) => groups[a].ord - groups[b].ord || a.localeCompare(b));
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
  return rows.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
}
// Le intestazioni delle colonne facoltative, gemelle di `catalogExtraCells`/
// `catalogDesignCells`: stessa classe col-X, stesso ordine.
const CAT_EXTRA_HEAD = `<th scope="col" class="col-subfamily">Sottofamiglia</th>
    <th scope="col" class="col-supplier">Fornitore</th>
    <th scope="col" class="col-altuom">UM acquisto</th>
    <th scope="col" class="col-altfactor">Fattore</th>
    <th scope="col" class="col-safety">Scorta minima</th>
    <th scope="col" class="col-lot">Lotto</th>
    <th scope="col" class="col-notes">Note</th>
    <th scope="col" class="col-autore">Creato/aggiornato da</th>`;
const CAT_DESIGN_HEAD = `<th scope="col" class="col-concept">Concetto</th>
    <th scope="col" class="col-sourcing">Approvvigionamento</th>`;
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
  const head = `<thead><tr><th scope="col" class="col-flags"></th><th scope="col" class="col-code">Codice</th><th scope="col" class="col-name">Descrizione</th>
    <th scope="col" class="col-type">Tipo</th><th scope="col" class="col-family">Famiglia</th><th scope="col" class="col-uom">U.M.</th>
    <th scope="col" class="col-cost" title="Costo di una unità, nella U.M. della colonna accanto">Costo un. (${esc(cur())}/U.M.)</th>
    <th scope="col" class="col-meta">Dettaglio</th>
    ${CAT_EXTRA_HEAD}
    ${scope === 'design' ? CAT_DESIGN_HEAD : ''}
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
  sourcing: { h: 'Approvvigionamento', w: 16, v: i => (i.type === 'parte' ? PART_SOURCING[partSourcing(i)] || '' : '') },
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
function itemModalBody(it, scope) {
  const sc = CATALOG_SCOPES[scope] || CATALOG_SCOPES.buy;
  const t = it ? it.type : sc.types[0];
  const lock = itemLockState(it);
  const dis = cond => cond ? 'disabled' : '';
  const sourcePicker = it ? '' : `
    <div class="modal-field"><label>Parti da (opzionale)</label>
      <input type="text" id="src-search" class="search" placeholder="Duplica da un articolo esistente..." oninput="debounced('src', renderSourceResults)" autocomplete="off">
      <div id="src-results" class="picker-results"></div>
    </div>`;
  // In modifica il tipo è bloccato: resta l'unica voce dell'articolo, qualunque sia lo scope
  const types = it ? [it.type] : sc.types;
  return `${itemLockNote(lock)}${sourcePicker}
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
      <div class="modal-field"><label>Unità di misura</label><select id="it-uom" onchange="itemUomLabelsRefresh()" ${dis(lock.structLocked)} title="${lock.structLocked ? 'Articolo già usato: cambiare l\'unità reinterpreterebbe giacenza, distinte e costi' : ''}">${uomOptions(it ? (it.uom || defaultUom()) : defaultUom())}</select></div>
      <div class="modal-field" id="fld-sourcing"><label>Approvvigionamento</label>
        <select id="it-sourcing">${partSourcingOptions(it ? partSourcing(it) : defaultPartSourcing())}</select></div>
      <div class="modal-field" id="fld-assembly-note" style="grid-column:1/-1"><label>Composizione</label><span class="empty-text" style="padding:0">La distinta (componenti e lavorazioni) si gestisce in <strong>Tecnico → Gestione DB</strong>.</span></div>
    </div>
    <div class="modal-field" id="fld-pricing">
      <label>Fornitore e prezzo d'acquisto</label>
      ${itemPricingSummary(it)}
    </div>
    <div class="modal-grid" id="fld-family">
      <div class="modal-field"><label>Macrofamiglia</label><select id="it-family" onchange="onItemFamilyChange()" ${dis(lock.structLocked)}>${familyOptions(it ? it.familyId : '', usesFamily(t) ? t : '')}</select></div>
      <div class="modal-field"><label>Sottofamiglia</label><select id="it-subfamily" onchange="onItemSubFamilyChange()" ${dis(lock.structLocked)}>${subFamilyOptions(it ? it.familyId : '', it ? it.subFamilyId : '')}</select></div>
    </div>
    ${codingFieldsHtml(it, lock.structLocked)}
    <div class="modal-field" id="fld-cycle">
      <label>Distinta parte e ciclo di lavorazione</label>
      <span class="empty-text" style="padding:0">${it
        ? `${cycleCountLabel(it)} — si gestiscono nella vista <strong>${ico('wrench', 'tinted')} Cicli di lavorazione</strong>.
           <button class="btn-outline" style="margin-left:8px" onclick="closeModal();openCycleFor('${it.id}')">${ico('wrench', 'tinted', '')} Apri il ciclo</button>`
        : `Si gestiscono nella vista <strong>${ico('wrench', 'tinted')} Cicli di lavorazione</strong>, dopo aver creato l'articolo.`}</span>
    </div>
    <div class="modal-grid" id="fld-flags">
      <div class="modal-field" id="fld-flag-fav"><label>Preferito</label>
        <label class="flag-check"><input type="checkbox" id="it-favorite" ${it && it.favorite ? 'checked' : ''}> ★ Segna come preferito</label></div>
      <div class="modal-field" id="fld-flag-obs"><label>Obsoleto</label>
        <label class="flag-check"><input type="checkbox" id="it-obsolete" ${it && it.obsolete ? 'checked' : ''}> ${ico('blocked', 'tinted')} Articolo obsoleto (non più utilizzabile)</label></div>
    </div>
    <div class="modal-grid" id="fld-altuom">
      <div class="modal-field"><label>U.M. d'acquisto (se diversa)</label>
        <select id="it-altuom" onchange="itemUomLabelsRefresh()">${uomOptions(it ? (it.altUom || '') : '')}</select></div>
      <div class="modal-field"><label id="it-altfactor-label">${altFactorLabel(it ? (it.altUom || '') : '', it ? (it.uom || defaultUom()) : defaultUom())}</label>
        <input type="number" id="it-altfactor" min="0" step="any" value="${it && it.altFactor != null ? it.altFactor : ''}" placeholder="es. 8"></div>
      <div class="modal-field" style="grid-column:1/-1"><span class="empty-text" style="padding:0">Da usare quando il fornitore quota in un'unità diversa da quella con cui l'articolo si gestisce e si mette in distinta. Il fattore dice <strong>quante unità d'acquisto stanno in una di gestione</strong>: una barra gestita in <span style="font-family:var(--mono)">m</span> che pesa 8 kg al metro ha U.M. d'acquisto <span style="font-family:var(--mono)">kg</span> e fattore <span style="font-family:var(--mono)">8</span>.<br>Serve a non sbagliare il costo: senza, un prezzo a chilo finirebbe nella costificazione come se fosse al metro. Lasciare vuoto se le due unità coincidono.</span></div>
    </div>
    <div class="modal-grid" id="fld-stock">
      <div class="modal-field"><label id="it-safety-label">${labelUom('Scorta minima', it ? (it.uom || defaultUom()) : defaultUom())}</label>
        <input type="number" id="it-safety" min="0" step="any" value="${it && it.safetyStock != null ? it.safetyStock : ''}" placeholder="0"></div>
      <div class="modal-field"><label id="it-lot-label">${labelUom('Lotto di riordino', it ? (it.uom || defaultUom()) : defaultUom())}</label>
        <input type="number" id="it-lot" min="0" step="any" value="${it && it.lotSize != null ? it.lotSize : ''}" placeholder="nessuno"></div>
      <div class="modal-field"><label>Il lotto è</label>
        <select id="it-lotmode">
          <option value="multiple" ${(!it || it.lotMode !== 'min') ? 'selected' : ''}>un multiplo esatto (6, 12, 18…)</option>
          <option value="min" ${(it && it.lotMode === 'min') ? 'selected' : ''}>una quantità minima (poi libera)</option>
        </select></div>
      <div class="modal-field"><label>Ubicazione a scaffale</label>
        <input id="it-loc" list="it-loc-list" autocomplete="off" maxlength="40" value="${esc(it ? ubicazioneOf(it) : '')}" placeholder="es. A-03-2">
        <datalist id="it-loc-list">${ubicazioniElenco().map(u => `<option value="${esc(u)}">`).join('')}</datalist></div>
      <div class="modal-field" style="grid-column:1/-1"><span class="empty-text" style="padding:0">La <strong>scorta minima</strong> è la quantità che il fabbisogno netto vuole lasciare a magazzino dopo aver coperto il piano. Il <strong>lotto di riordino</strong> arrotonda per eccesso quanto si compra — vuoto: nessun arrotondamento; <strong>multiplo esatto</strong>: si compra solo a passi del lotto, come una barra da 6 m che non si taglia; <strong>quantità minima</strong>: sotto soglia si arrotonda al minimo, sopra si compra esattamente quanto serve.</span></div>
    </div>
    ${it ? stockPanelHtml(it) : ''}
    <div class="modal-field"><label>Note</label><textarea id="it-notes" rows="2">${it ? esc(it.notes || '') : ''}</textarea></div>
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
  mostra('fld-sourcing', t === 'parte');
  const showFam = usesFamily(t);
  mostra('fld-family', showFam);
  mostra('fld-assembly-note', isAssembly(t));
  mostra('fld-cycle', t === 'parte');
  // Flag: preferito su commerciali e materie prime, obsoleto su qualunque tipo
  // — è l'unico modo per ritirare un codice già usato e sbagliato, senza
  // eliminarlo e perdere lo storico che lo referenzia.
  mostra('fld-flag-fav', canFavorite(t));
  mostra('fld-flag-obs', true);
  mostra('fld-flags', true);
  // Magazzino: solo su ciò che si tiene a scorta. Un assieme si produce, e la
  // sua giacenza sarebbe quella dei componenti contata due volte.
  mostra('fld-stock', hasStock({ type: t }));
  // Doppia unità: solo dove esiste un listino, perché è il prezzo del fornitore
  // che può essere espresso in un'altra unità.
  mostra('fld-altuom', hasPriceList({ type: t }));
  // Codifica gerarchica: schema per la macchina, appartenenza per gli altri tipi
  const isChild = t === 'gruppo' || t === 'sottogruppo' || t === 'parte';
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
  refreshItemCode();
}
function onItemFamilyChange() {
  document.getElementById('it-subfamily').innerHTML = subFamilyOptions(val('it-family'), '');
  refreshItemCode();
}
function onItemSubFamilyChange() { refreshItemCode(); }

// ═══════════════════════════════════════════════════════════
//  VISTA: CICLI DI LAVORAZIONE (distinta parte + fasi)
// ═══════════════════════════════════════════════════════════
// Distinta parte e ciclo sono due sezioni della STESSA lista `it.cycle`: le
// righe kind:'item' sono gli articoli necessari, le kind:'op' le lavorazioni.
// Un array solo significa nessuna conversione dei dati e motore di costo,
// albero di distinta, report ed export che continuano a leggere ciò che
// leggevano prima. Le funzioni che modificano una riga usano sempre il suo
// indice ASSOLUTO nell'array: quello di sezione servirebbe solo a sbagliare.
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
  const rows = (it && it.cycle) || [];
  const art = rows.filter(r => r.kind !== 'op').length;
  const lav = rows.filter(r => r.kind === 'op').length;
  if (!art && !lav) return 'Distinta parte e ciclo vuoti';
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
function partItems() { return (db.items || []).filter(i => i.type === 'parte'); }
// Famiglie e sottofamiglie delle parti, con le selezioni preservate se ancora
// valide (stesso patto di updateCatFamilyFilters nelle anagrafiche).
function updateCycleFamilyFilters() {
  const famSel = document.getElementById('cyc-family');
  const subSel = document.getElementById('cyc-subfamily');
  if (!famSel || !subSel) return;
  const fams = (db.families || []).filter(f => (f.kind || 'acquistato') === 'parte');
  const keepFam = fams.some(f => f.id === famSel.value) ? famSel.value : '';
  famSel.innerHTML = `<option value="">Tutte le famiglie</option>` +
    fams.map(f => `<option value="${f.id}" ${f.id === keepFam ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
  const subs = (getFamily(keepFam) || {}).subs || [];
  const keepSub = subs.some(s => s.id === subSel.value) ? subSel.value : '';
  subSel.innerHTML = `<option value="">Tutte le sottofamiglie</option>` +
    subs.map(s => `<option value="${s.id}" ${s.id === keepSub ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}
function cycleFilteredParts() {
  const q = (val('cyc-search') || '').toLowerCase();
  const fam = val('cyc-family');
  const sub = val('cyc-subfamily');
  let rows = partItems();
  if (fam) rows = rows.filter(i => i.familyId === fam);
  if (sub) rows = rows.filter(i => i.subFamilyId === sub);
  if (q) rows = rows.filter(i => (i.code + ' ' + i.name).toLowerCase().includes(q));
  return rows.sort((a, b) => String(a.code).localeCompare(String(b.code)));
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
  if (!it || it.type !== 'parte') return;
  currentCycleItemId = id;
  setVal('cyc-search', ''); setVal('cyc-family', ''); setVal('cyc-subfamily', '');
  // Anche lo scope condiviso (filters.js), altrimenti setView lo riscriverebbe
  // subito dopo sui campi appena svuotati, e la parte scelta potrebbe restare
  // fuori dal filtro come prima di questa pulizia.
  if (typeof filtScope !== 'undefined') { filtScope.familyId = ''; filtScope.subFamilyId = ''; filtPrefsSave(); }
  setView('cycles');
}
function currentCycleItem() {
  const it = getItem(currentCycleItemId);
  return it && it.type === 'parte' ? it : null;
}

// Da dove viene il costo di questa parte, detto qui perché è la vista in cui si
// costruisce il ciclo — e vedere le righe senza sapere se contano sarebbe
// fuorviante. La scelta si fa nella scheda articolo, non qui: un solo posto.
function cycleSourcingNote(it) {
  const apri = `<button class="mini-btn" style="margin-left:8px" onclick="editItemModal('${it.id}')">${ico('edit', 'tinted', '')} Scheda articolo</button>`;
  if (partSourcing(it) === 'buy') {
    const forn = supplierName(it.supplierId);
    return `<div class="cycle-note">${ico('cart', 'tinted')} <strong>Parte acquistata</strong>${forn ? ' da ' + esc(forn) : ' (nessun fornitore a listino)'}:
      il costo è il prezzo scelto nel listino. Distinta e ciclo qui sotto restano documentali — non concorrono al costo e nel
      fabbisogno non vengono esplosi.${apri}</div>`;
  }
  const vuoto = !(it.cycle || []).length;
  return `<div class="cycle-note">${ico('factory', 'tinted')} <strong>Parte prodotta in casa</strong>: il costo lo determinano la distinta parte e il ciclo
    qui sotto.${vuoto ? ' Finché sono vuoti vale il prezzo a listino.' : ''}${apri}</div>`;
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
    ? parts.map(p => `<option value="${p.id}" ${p.id === currentCycleItemId ? 'selected' : ''}>${esc(itemBadgesTxt(p) + p.code + ' — ' + p.name)}</option>`).join('')
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
  const rows = (it.cycle || []).map((r, i) => ({ r, i }));
  const bomRows = rows.filter(x => x.r.kind !== 'op');
  const opRows = rows.filter(x => x.r.kind === 'op');
  body.innerHTML = `
    ${cycleSourcingNote(it)}
    <div class="cycle-section">
      <div class="cycle-section-head">
        <h3>${ico('package', 'tinted pill', '')} Distinta parte <span class="cycle-dim">${bomRows.length} ${bomRows.length === 1 ? 'articolo' : 'articoli'}</span></h3>
        <button class="add-btn-sm" onclick="addCycleItemRow()">+ Articolo</button>
      </div>
      <div class="cycle-box">${cycleBomTable(bomRows)}</div>
      <div id="picker-bom"></div>
    </div>
    <div class="cycle-section">
      <div class="cycle-section-head">
        <h3>${ico('wrench', 'tinted pill', '')} Ciclo di lavorazione <span class="cycle-dim">${opRows.length} ${opRows.length === 1 ? 'fase' : 'fasi'}</span></h3>
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
  const rows = it.cycle || [];
  const bomTot = rows.filter(r => r.kind !== 'op').reduce((s, r) => s + cycleRowCost(r), 0);
  const opsTot = rows.filter(r => r.kind === 'op').reduce((s, r) => s + cycleRowCost(r), 0);
  const c = costOf(it.id);
  const u = itemUom(it);
  el.innerHTML = [
    kpi('Distinta parte', fmtPer(bomTot, u), 'orange'),
    kpi('Lavorazioni', fmtPer(opsTot, u), 'green'),
    kpi('Costo unitario a mano', fmtPer(Number(it.unitCost) || 0, u), 'purple'),
    kpi('Costo parte', fmtPer(c.total, u), ''),
  ].join('') + (c.cycle ? '<div class="empty-text" style="color:var(--red)">' + ico('warning', 'tinted') + ' Rilevato riferimento ciclico: una riga risale a questa stessa parte.</div>' : '');
}
function cycleBomTable(bomRows) {
  if (!bomRows.length) return '<div class="empty-text" style="padding:8px 0">Nessun articolo. Usa "+ Articolo" per aggiungere commerciali e materie prime.</div>';
  const head = `<div class="cycle-row cycle-head">
    <span>Voce</span><span>Fornitore</span><span>U.M.</span><span class="num">Q.tà</span>
    <span class="num" title="Costo dell'intera riga (quantità compresa) al posto di quello calcolato: vuoto = calcolato dall'anagrafica">Costo riga forzato (${esc(cur())})</span>
    <span class="num">Costo riga (${esc(cur())})</span><span></span></div>`;
  return head + bomRows.map(({ r, i }) => {
    const ci = getItem(r.itemId);
    return `<div class="cycle-row">
      <span class="cycle-name">${cycleRowLabel(r)}</span>
      <span class="cycle-dim">${esc(supplierName(ci && ci.supplierId) || '—')}</span>
      <span class="cycle-dim">${esc(ci ? (ci.uom || '') : '')}</span>
      <input class="num" type="number" min="0" step="0.001" value="${Number(r.qty) || 0}"
        onchange="updateCycleRow(${i})" id="cyc-qty-${i}">
      <input class="num" type="number" min="0" step="0.01" value="${r.costOverride != null ? r.costOverride : ''}"
        placeholder="${cycleRowComputed(r).toFixed(2)}" title="Costo della riga intera, non di un'unità. Lascia vuoto per usare quello calcolato"
        onchange="updateCycleRow(${i})" id="cyc-ovr-${i}">
      <span class="num cost" id="cyc-cost-${i}">${fmtN(cycleRowCost(r))}</span>
      <button class="mini-btn danger" title="Elimina" onclick="delCycleRow(${i})">${ico('trash', 'tinted', 'Elimina')}</button>
    </div>`;
  }).join('');
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
    <span class="num" title="Interna: ore di occupazione del centro, che alimentano il Carico centri. Conto lavoro: giorni di attraversamento, da cui si ricava entro quando mandare l'ordine di lavoro">Tempo</span>
    <span class="num">Costo (${esc(cur())})</span><span class="num">Costo riga (${esc(cur())})</span><span>Ordine</span><span></span></div>`;
  const last = opRows.length - 1;
  return head + opRows.map(({ r, i }, k) => {
    const orario = r.costMode === 'orario';
    const esterna = !!r.supplierId;
    // In modo orario le ore sono la base del costo e stanno con la tariffa: su
    // una fase esterna sono l'unico posto in cui compaiono, perché la colonna
    // del tempo lì misura giorni.
    const costoCell = orario
      ? `<span class="cycle-op-cost">
          ${esterna ? `<input class="num" type="number" min="0" step="0.25" value="${Number(r.hours) || 0}" title="Ore fatturate dal terzista, per pezzo" placeholder="ore"
            onchange="updateCycleRow(${i})" id="cyc-ophours-${i}">` : ''}
          <input class="num" type="number" min="0" step="0.5" value="${Number(r.rate) || 0}" title="Tariffa ${esc(cur())}/h" placeholder="${esc(cur())}/h"
            onchange="updateCycleRow(${i})" id="cyc-oprate-${i}">
        </span>`
      : `<input class="num" type="number" min="0" step="0.01" value="${Number(r.cost) || 0}"
          title="Costo fisso della lavorazione" onchange="updateCycleRow(${i})" id="cyc-cost-in-${i}">`;
    const tempoCell = esterna
      ? `<span class="cycle-op-time"><input class="num" type="number" min="0" step="1" value="${Number(r.days) || 0}"
          title="Giorni di attraversamento dal terzista: da qui si ricava entro quando mandargli l'ordine di lavoro"
          onchange="updateCycleRow(${i})" id="cyc-opdays-${i}"><em>gg</em></span>`
      : `<span class="cycle-op-time"><input class="num" type="number" min="0" step="0.25" value="${Number(r.hours) || 0}"
          title="Ore per pezzo${orario ? '' : ' — non entra nel costo, serve al carico del centro'}"
          onchange="updateCycleRow(${i})" id="cyc-ophours-${i}"><em>h</em></span>`;
    return `<div class="cycle-row cycle-op-row">
      <span class="cycle-phase">${cyclePhaseNumber(k)}</span>
      <span class="cycle-name">${cycleRowLabel(r)}</span>
      <select class="cycle-sup sel-cerca" title="Interna, o conto lavoro se si sceglie un fornitore" onchange="onCycleRowSupplierChange(${i})" id="cyc-sup-${i}">${wcSupplierOptions(getWorkCenter(r.workCenterId), r.supplierId || '')}</select>
      <select onchange="onCycleRowModeChange(${i})" id="cyc-opmode-${i}">
        <option value="fisso" ${!orario ? 'selected' : ''}>Fisso</option>
        <option value="orario" ${orario ? 'selected' : ''}>Orario</option>
      </select>
      ${tempoCell}
      ${costoCell}
      <span class="num cost" id="cyc-cost-${i}">${fmtN(cycleRowCost(r))}</span>
      <span class="cycle-move">
        <button class="mini-btn" title="Sposta su" onclick="moveCycleOp(${k},-1)" ${k === 0 ? 'disabled' : ''}>↑</button>
        <button class="mini-btn" title="Sposta giù" onclick="moveCycleOp(${k},1)" ${k === last ? 'disabled' : ''}>↓</button>
      </span>
      <button class="mini-btn danger" title="Elimina" onclick="delCycleRow(${i})">${ico('trash', 'tinted', 'Elimina')}</button>
    </div>`;
  }).join('');
}
// ─── Export del ciclo aperto ───
// I Cicli non sono un elenco ma una scheda: si esporta la parte che si sta
// guardando, con le sue due tavole. `cycleRowLabel` qui non serve — restituisce
// HTML, e in un foglio di calcolo un tag è solo sporcizia.
function cycleExportSpec() {
  const it = currentCycleItem();
  const righe = ((it && it.cycle) || []).map((r, i) => ({ r, i }));
  const bom = righe.filter(x => x.r.kind !== 'op');
  const ops = righe.filter(x => x.r.kind === 'op');
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
        nome: 'Distinta parte',
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
        totali: bom.length ? ['Totale distinta parte', '', '', '', '', '', tot(bom)] : null,
      },
      {
        nome: 'Ciclo di lavorazione',
        colonne: [
          { h: 'Fase', w: 8, num: true }, { h: 'Lavorazione', w: 34 }, { h: 'Fornitore', w: 24 },
          // Due colonne e non una: le ore e i giorni misurano cose diverse, e in
          // un foglio di calcolo una colonna che cambia unità riga per riga non
          // si può sommare né filtrare.
          { h: 'Ore (h)', w: 10, num: true }, { h: 'Giorni (gg)', w: 12, num: true },
          { h: `Costo (${cur()})`, w: 16, num: true },
        ],
        righe: ops.map(({ r }, k) => {
          const wc = getWorkCenter(r.workCenterId);
          return [cyclePhaseNumber(k), wc ? wc.name : '(centro mancante)',
            supplierName(r.supplierId) || '', Number(r.hours) || 0, Number(r.days) || 0,
            +cycleRowCost(r).toFixed(2)];
        }),
        totali: ops.length
          ? ['Totale lavorazioni', '', '', +ops.reduce((s, x) => s + (Number(x.r.hours) || 0), 0).toFixed(2),
            +ops.reduce((s, x) => s + (Number(x.r.days) || 0), 0).toFixed(0), tot(ops)]
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
    if (el) el.textContent = fmtN(cycleRowCost(row));
    const ovr = document.getElementById('cyc-ovr-' + i);
    if (ovr) ovr.placeholder = cycleRowComputed(row).toFixed(2);
  });
  renderCycleSummary(it);
}

// ─── Modifiche (salvataggio immediato) ───
function updateCycleRow(idx) {
  const it = currentCycleItem(); if (!it) return;
  // Il ridisegno rimette il valore salvato: senza permessi il campo non resta modificato a video
  if (!roleGuard('catalog')) { renderCycles(); return; }
  const row = (it.cycle || [])[idx]; if (!row) return;
  if (row.kind === 'op') {
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
    if (eraEsterna) row.days = numVal('cyc-opdays-' + idx, 0);
    else row.hours = numVal('cyc-ophours-' + idx, 0);
    if (row.costMode === 'orario') {
      row.rate = numVal('cyc-oprate-' + idx, 0);
      // Su una fase esterna a costo orario le ore sono quelle **fatturate**, e
      // stanno con la tariffa: è l'unico punto in cui compaiono.
      if (eraEsterna) row.hours = numVal('cyc-ophours-' + idx, 0);
    } else row.cost = numVal('cyc-cost-in-' + idx, 0);
  } else {
    row.qty = numVal('cyc-qty-' + idx, 0);
    // Vuoto = nessun override, si usa il costo calcolato. Un negativo si corregge
    // in silenzio: è una cella di tabella, non un form con la sua validazione.
    const ovr = val('cyc-ovr-' + idx);
    row.costOverride = ovr === '' ? null : clampNum(parseFloat(ovr), 0);
  }
  touch(it); saveDB();
  refreshCycleCosts(it);
}
// Cambiare il fornitore di una lavorazione a costo orario ripropone la
// tariffa (quella registrata per quel fornitore sul centro di lavoro, o
// quella del centro) prima di salvare — resta comunque un campo modificabile.
function onCycleRowSupplierChange(idx) {
  const it = currentCycleItem(); if (!it) return;
  const row = (it.cycle || [])[idx]; if (!row) return;
  if (row.costMode === 'orario') {
    const wc = getWorkCenter(row.workCenterId);
    const rateEl = document.getElementById('cyc-oprate-' + idx);
    if (rateEl) rateEl.value = wcRateFor(wc, val('cyc-sup-' + idx));
  }
  const eraEsterna = !!row.supplierId;
  updateCycleRow(idx);
  // Passare da interna a conto lavoro (o viceversa) cambia **cosa misura** la
  // colonna del tempo: si ridisegna, o resterebbe a video un campo che scrive
  // in un altro posto.
  if (eraEsterna !== !!row.supplierId) renderCycles();
}
// Passare da fisso a orario (o viceversa) cambia quali campi contano per il
// costo: si ridisegna la riga così i campi giusti compaiono subito.
function onCycleRowModeChange(idx) {
  const it = currentCycleItem(); if (!it) return;
  if (!roleGuard('catalog')) { renderCycles(); return; }
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
  if (!roleGuard('catalog')) return;
  if (!(it.cycle || [])[idx]) return;
  it.cycle.splice(idx, 1);
  touch(it); saveDB(); renderCycles(); savedToast('Riga eliminata');
}
function moveCycleOp(k, dir) {
  const it = currentCycleItem(); if (!it) return;
  if (!roleGuard('catalog')) return;
  const next = moveKindRow(it.cycle || [], 'op', k, dir);
  if (next === it.cycle) return;   // già in cima o in fondo
  it.cycle = next;
  touch(it); saveDB(); renderCycles();
}
function closeCyclePicker() {
  ['picker-bom', 'picker-op'].forEach(id => { const b = document.getElementById(id); if (b) b.innerHTML = ''; });
}
// Picker inline di un articolo (commerciale o materia prima) per la distinta parte.
function addCycleItemRow() {
  if (!roleGuard('catalog')) return;
  const box = document.getElementById('picker-bom'); if (!box) return;
  // Un articolo Obsoleto resta dov'è già inserito nei cicli, ma non si propone
  // più come NUOVO materiale/commerciale.
  window.__cyclePickerCandidates = db.items
    .filter(i => CYCLE_CHILD_TYPES.includes(i.type) && !i.obsolete)
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
  if (!window.__cyclePickerCandidates.length) {
    showToast('Nessun commerciale o materia prima a catalogo.', 'error'); return;
  }
  box.innerHTML = `<div class="cycle-picker-box">
    <input type="text" id="cycpick-search" class="search" placeholder="Cerca codice o nome..." oninput="debounced('cycpick', renderCyclePickerResults)" autocomplete="off">
    <div id="cycpick-results" class="picker-results"></div>
    <div class="cycle-actions"><button class="btn-ghost" onclick="closeCyclePicker()">Annulla</button></div>
  </div>`;
  renderCyclePickerResults();
  const s = document.getElementById('cycpick-search'); if (s) s.focus();
}
function renderCyclePickerResults() {
  const box = document.getElementById('cycpick-results'); if (!box) return;
  const q = (val('cycpick-search') || '').toLowerCase();
  let rows = window.__cyclePickerCandidates || [];
  if (q) rows = rows.filter(i => (i.code + ' ' + i.name).toLowerCase().includes(q));
  const total = rows.length;
  rows = rows.slice(0, 50);
  let html = rows.map(i =>
    `<div class="picker-row" ${clickAttrs(`pickCycleItem('${i.id}')`, `Scegli ${i.code}`)}>
       <span class="picker-type">${typeLabel(i.type)}</span><b>${esc(i.code)}</b> — ${esc(i.name)}${itemBadges(i)}
     </div>`).join('');
  if (!html) html = `<div class="picker-empty">Nessun articolo trovato</div>`;
  else if (total > rows.length) html += `<div class="picker-empty">+${total - rows.length} altri — affina la ricerca</div>`;
  box.innerHTML = html;
}
function pickCycleItem(id) {
  const it = currentCycleItem(); if (!it) return;
  if (!roleGuard('catalog')) return;
  // Le stesse due guardie della distinta base. Il selettore propone già solo i
  // tipi ammessi e oggi quei tipi sono foglie, quindi nessuna delle due può
  // scattare: sono qui perché la regola stia scritta accanto alla scrittura che
  // la deve rispettare, non nel filtro di un elenco.
  const child = getItem(id);
  if (!child || !CYCLE_CHILD_TYPES.includes(child.type)) { showToast('Nella distinta parte vanno solo commerciali e materie prime', 'error'); return; }
  if (createsCycle(it.id, id)) { showToast('Operazione annullata: creerebbe un ciclo', 'error'); return; }
  if (!Array.isArray(it.cycle)) it.cycle = [];
  // Come nella distinta base (dalla 0.105.7): un articolo già presente prende
  // una unità in più invece di una seconda riga. Non se la riga ha un costo
  // forzato: quello vale per la riga intera, e aumentandone la quantità il
  // pezzo in più resterebbe gratis.
  const gia = it.cycle.find(r => r.kind !== 'op' && r.itemId === id && r.costOverride == null);
  if (gia) gia.qty = Math.round(((Number(gia.qty) || 0) + 1) * 1e6) / 1e6;
  else it.cycle.push({ kind: 'item', itemId: id, qty: 1, costOverride: null });
  closeCyclePicker();
  touch(it); saveDB(); renderCycles(); savedToast(gia ? 'Quantità aumentata: l\'articolo era già nella distinta parte' : 'Articolo aggiunto alla distinta parte');
}
// Selettore inline di una lavorazione da un centro di lavoro esistente:
// interna o conto lavoro (a seconda del fornitore scelto), a costo fisso o
// orario (ore × tariffa, proposta dal fornitore/centro e poi modificabile).
function addCycleOpRow() {
  if (!roleGuard('catalog')) return;
  const box = document.getElementById('picker-op'); if (!box) return;
  if (!db.workCenters.length) { showToast('Aggiungi prima un centro di lavoro in Gestione', 'error'); return; }
  const wc = db.workCenters.filter(w => w.active !== false)[0] || null;
  box.innerHTML = `<div class="cycle-picker-box">
    <div class="modal-grid">
      <div class="modal-field"><label>Centro di lavoro</label><select id="cyc-wc" onchange="onCycleOpWcChange()">${wcOptionsNoRate(null)}</select></div>
      <div class="modal-field"><label>Interna / Conto lavoro</label><select id="cyc-opsup" class="sel-cerca" onchange="onCycleOpModeChange()">${wcSupplierOptions(wc, '')}</select></div>
    </div>
    <div class="modal-grid">
      <div class="modal-field"><label>Costo</label><select id="cyc-opmode" onchange="onCycleOpModeChange()">
        <option value="fisso">Fisso</option><option value="orario">Orario</option></select></div>
      <div class="modal-field" id="cyc-optime-h"><label>Ore (h)</label><input type="number" id="cyc-ophours" min="0" step="0.25" value="1"
        title="Ore di occupazione del centro. A costo fisso non entrano nel costo: servono al Carico centri"></div>
      <div class="modal-field" id="cyc-optime-gg" style="display:none"><label>Giorni (gg)</label><input type="number" id="cyc-opdays" min="0" step="1" value="0"
        title="Giorni di attraversamento dal terzista: da qui si ricava entro quando mandargli l'ordine di lavoro"></div>
    </div>
    <div class="modal-grid" id="cyc-opmode-fisso">
      <div class="modal-field"><label>Costo (${cur()})</label><input type="number" id="cyc-opcost" min="0" step="0.01" value="0"></div>
    </div>
    <div class="modal-grid" id="cyc-opmode-orario" style="display:none">
      <div class="modal-field"><label>Tariffa (${cur()}/h)</label><input type="number" id="cyc-oprate" min="0" step="0.5" value="0"></div>
    </div>
    <div class="cycle-actions">
      <button class="btn-ghost" onclick="closeCyclePicker()">Annulla</button>
      <button class="add-btn-sm" onclick="pickCycleOp()">Aggiungi</button>
    </div>
  </div>`;
}
// Cambiare centro di lavoro ricostruisce l'elenco fornitori (i "conto lavoro
// abituali" dipendono dal centro scelto), stesso schema a cascata delle
// famiglie/sottofamiglie (syncFamilyFilters).
function onCycleOpWcChange() {
  const supSel = document.getElementById('cyc-opsup');
  if (supSel) supSel.innerHTML = wcSupplierOptions(getWorkCenter(val('cyc-wc')), '');
  onCycleOpModeChange();
}
function onCycleOpModeChange() {
  const orario = val('cyc-opmode') === 'orario';
  const esterna = !!val('cyc-opsup');
  const mostra = (id, si) => { const el = document.getElementById(id); if (el) el.style.display = si ? '' : 'none'; };
  mostra('cyc-opmode-fisso', !orario);
  mostra('cyc-opmode-orario', orario);
  // Il tempo di una fase interna sono ore di macchina; quello di una in conto
  // lavoro sono giorni di attraversamento. A costo orario anche una fase esterna
  // vuole le ore, ma come base del costo: lì si chiedono entrambi.
  mostra('cyc-optime-h', !esterna || orario);
  mostra('cyc-optime-gg', esterna);
  if (orario) {
    const rateEl = document.getElementById('cyc-oprate');
    if (rateEl) rateEl.value = wcRateFor(getWorkCenter(val('cyc-wc')), val('cyc-opsup'));
  }
}
function pickCycleOp() {
  const it = currentCycleItem(); if (!it) return;
  if (!roleGuard('catalog')) return;
  const wcId = val('cyc-wc');
  if (!wcId) { showToast('Seleziona un centro di lavoro', 'error'); return; }
  if (!Array.isArray(it.cycle)) it.cycle = [];
  const orario = val('cyc-opmode') === 'orario';
  const supplierId = val('cyc-opsup');
  const esterna = !!supplierId;
  // In fondo all'elenco: l'ultima fase aggiunta è l'ultima del ciclo, poi si sposta con ↑↓
  // Ore e giorni: si legge solo il campo che era davvero a video (stessa
  // condizione di onCycleOpModeChange) — altrimenti il valore proposto di
  // serie nel campo nascosto (le "Ore" nascono a 1) entrerebbe come se
  // qualcuno l'avesse scritto.
  const row = { kind: 'op', workCenterId: wcId, supplierId,
    costMode: orario ? 'orario' : 'fisso',
    hours: (!esterna || orario) ? numVal('cyc-ophours', 0) : 0,
    days: esterna ? numVal('cyc-opdays', 0) : 0, note: '' };
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
  if (src.type === 'parte') setVal('it-sourcing', partSourcing(src));
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
  // L'approvvigionamento prima del listino: la quotazione in uso si applica
  // solo a una parte comprata, e passando da «fabbrica» a «compra» il costo
  // restava quello vecchio (dalla 0.105.5).
  if (it.type === 'parte') { const s = val('it-sourcing'); if (PART_SOURCING[s]) it.sourcing = s; }
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
  if (nameErr) { showToast(nameErr, 'error'); return; }
  const codErr = validateItemCoding(null);
  if (codErr) { showToast(codErr, 'error'); return; }
  const manErr = codeManualErr();
  if (manErr) { showToast(manErr, 'error'); return; }
  const dupErr = validateItemCode(val('it-code'), null, null);
  if (dupErr) { showToast(dupErr, 'error'); return; }
  const it = { id: gid(), type: val('it-type') };
  if (isAssembly(it.type)) { it.components = []; it.operations = []; }
  if (it.type === 'parte') { it.cycle = []; it.sourcing = defaultPartSourcing(); }
  readItemForm(it);
  const src = window.__dupSourceId ? getItem(window.__dupSourceId) : null;
  if (src && isAssembly(it.type)) {
    it.components = (src.components || []).map(c => Object.assign({}, c));
    it.operations = (src.operations || []).map(o => Object.assign({}, o));
  }
  // Duplicando una parte si porta dietro distinta e ciclo, come gli assiemi coi componenti
  if (src && it.type === 'parte') {
    it.cycle = (src.cycle || []).map(r => Object.assign({}, r));
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
  const scope = scopeOf(it.type);
  const p = openModal(`<h3>${ico('edit', 'tinted pill', '')} Modifica articolo</h3>${itemModalBody(it, scope)}
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveItemEdit('${id}')">Salva</button></div>`, true);
  if (!p) return;
  // All'apertura il codice resta quello che è, anche se fuori schema: lo si
  // ricompone solo se si cambia una scelta che lo determina.
  itemCodeAuto = false;
  window.__editingItemId = id;
  window.__itemScope = scope;
  toggleItemFields();
  itemCodeAuto = !it.codeManual;
}
function saveItemEdit(id) {
  if (!roleGuard('catalog')) return;
  const it = getItem(id); if (!it) return;
  const nameErr = validateItemName(it.type);
  if (nameErr) { showToast(nameErr, 'error'); return; }
  const codErr = validateItemCoding(id);
  if (codErr) { showToast(codErr, 'error'); return; }
  const manErr = codeManualErr();
  if (manErr) { showToast(manErr, 'error'); return; }
  const dupErr = validateItemCode(val('it-code'), id, it.code);
  if (dupErr) { showToast(dupErr, 'error'); return; }
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
