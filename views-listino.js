// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-listino.js
// ═══════════════════════════════════════════════════════════
// Listino fornitori: i prezzi di ogni articolo, lo storico e la vista d'insieme.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
// Diviso da views-catalog.js nella 0.141.0: stesso ordine di caricamento, subito prima.

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
//
// Dalla 0.157.0 la data della quotazione è anche il giorno **da cui vale**: una
// quotazione con la data di domani è un listino annunciato, e fino a domani
// vale quella prima. `giorno` è il giorno del documento (di norma oggi). Se il
// fornitore ha solo quotazioni future, vale comunque la più vicina: meglio un
// prezzo annunciato che una casella vuota.
function supplierPriceRow(it, supplierId, giorno) {
  if (!it || !supplierId) return null;
  const g = giorno || oggiISO();
  const tutte = priceRows(it).filter(r => r.supplierId === supplierId);
  const valide = tutte.filter(r => !priceRowFutura(r, g));
  const sue = valide.length ? valide : tutte;
  const quotate = sue.filter(priceRowQuoted);
  if (!valide.length) {
    // Solo listini annunciati: il primo che entra in vigore.
    return (quotate.length ? quotate : sue)
      .reduce((best, r) => (!best || (r.date || '') < (best.date || '') ? r : best), null);
  }
  return (quotate.length ? quotate : sue)
    .reduce((best, r) => (!best || (r.date || '') >= (best.date || '') ? r : best), null);
}
// Una quotazione che entra in vigore dopo `giorno`.
function priceRowFutura(r, giorno) { return !!r && !!r.date && r.date > (giorno || oggiISO()); }
// Una quotazione scaduta: il fornitore ha detto fino a quando valeva, e quel
// giorno è passato. Si usa lo stesso (non c'è niente di meglio), ma lo si dice.
function priceRowScaduta(r, giorno) { return !!r && !!r.validTo && r.validTo < (giorno || oggiISO()); }
function priceRowQuoted(r) { return !!r && r.price !== '' && r.price != null; }
// ─── Quotazioni sostituite: lo storico ───
// Un fornitore non ha due prezzi nello stesso momento: la quotazione nuova
// sostituisce la vecchia, che resta a listino solo come storico. Le sostituite
// non entrano nel confronto (la ↓, il risparmio del Riepilogo e del
// fabbisogno) e non si possono più scegliere come prezzo in uso. Una riga
// senza fornitore non ne sostituisce e non ne è sostituita: non si sa di chi è.
function priceRowSuperseded(it, row) {
  if (!row || !row.supplierId || !priceRowQuoted(row)) return false;
  if (priceRowFutura(row)) return false;   // un listino annunciato non è storico
  const valida = supplierPriceRow(it, row.supplierId);
  return !!valida && valida.id !== row.id && !priceRowFutura(valida);
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
// ─── Scaglioni di quantità (dalla 0.157.0) ───
// Una quotazione può avere più prezzi secondo la quantità: «da 25 pz 14,00»,
// «da 50 pz 12,60». Il prezzo base della quotazione è il primo scaglione (da
// Q.tà min, o da zero); gli altri stanno in `row.breaks`, [{ fromQty, price,
// discount }], soglie nell'unità della quotazione come Q.tà min. Il prezzo
// dello scaglione raggiunto vale **per tutta la quantità**, come quotano quasi
// tutti i fornitori.
function priceRowTiers(row) {
  if (!priceRowQuoted(row)) return [];
  const base = { fromQty: Number(row.minQty) || 0, price: Number(row.price) || 0, discount: row.discount || '', base: true };
  const altri = (Array.isArray(row.breaks) ? row.breaks : [])
    .filter(b => b && b.price !== '' && b.price != null && (Number(b.fromQty) || 0) > base.fromQty)
    .map(b => ({ fromQty: Number(b.fromQty) || 0, price: Number(b.price) || 0, discount: b.discount || '' }))
    .sort((a, b) => a.fromQty - b.fromQty);
  return [base].concat(altri);
}
// La quantità su cui si calcola il costo in uso: il lotto di riordino, che è
// quello che si compra di solito; senza lotto, il primo scaglione.
function priceQtaRiferimento(it) { return Math.max(0, Number(it && it.lotSize) || 0); }
// Lo scaglione per `qty` (nell'unità di gestione; senza, la quantità di
// riferimento). La soglia si porta nell'unità di gestione prima del confronto.
function priceRowTier(it, row, qty) {
  const scaglioni = priceRowTiers(row);
  if (!scaglioni.length) return null;
  const q = qty == null ? priceQtaRiferimento(it) : (Number(qty) || 0);
  const u = priceUomOf(it, row);
  return scaglioni.reduce((vale, t) => (fromAltUom(it, t.fromQty, u) <= q + 1e-9 ? t : vale), scaglioni[0]);
}
// Lo scaglione dopo quello di `qty`, se c'è: «da 50 pz costa 11,34».
function priceRowNextTier(it, row, qty) {
  const scaglioni = priceRowTiers(row);
  const u = priceUomOf(it, row);
  return scaglioni.find(t => fromAltUom(it, t.fromQty, u) > (Number(qty) || 0) + 1e-9) || null;
}
// Il prezzo di una quotazione **nell'unità di gestione**, che è l'unica in cui i
// costi hanno senso: le quantità delle distinte sono in quella.
// 2 €/kg su una barra da 8 kg/m fanno 16 €/m. È il prezzo di listino, prima
// degli sconti: quello che va sulla riga del documento accanto allo sconto.
// `qty` sceglie lo scaglione (vedi priceRowTier).
function rowUnitGross(it, row, qty) {
  const t = priceRowTier(it, row, qty);
  if (!t) return null;
  return t.price * uomFactor(it, priceUomOf(it, row));
}
// Lo sconto della quotazione per quella quantità: ogni scaglione ha il suo.
function rowUnitDiscount(it, row, qty) {
  const t = priceRowTier(it, row, qty);
  return t ? (t.discount || '') : '';
}
// Quello che si paga davvero (dalla 0.157.0): il prezzo di listino, meno lo
// sconto della quotazione, meno lo sconto del fornitore sull'intero documento.
// È il costo che entra nella costificazione e quello su cui si confrontano i
// fornitori: 10 € al 40% costano meno di 7 € netti. Senza `qty`, alla quantità
// di riferimento dell'articolo: la stessa per tutti i fornitori.
function rowUnitCost(it, row, qty) {
  const t = priceRowTier(it, row, qty);
  if (!t) return null;
  const sup = row.supplierId ? getSupplier(row.supplierId) : null;
  return t.price * uomFactor(it, priceUomOf(it, row)) * scontoFattore(t.discount) * scontoFattore(sup && sup.discount);
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
  const quotate = validPriceRows(it).filter(r => priceRowQuoted(r) && !priceRowFutura(r)
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

// Lo sconto del fornitore entra nel costo di ogni sua quotazione: quando cambia,
// gli articoli che costano col suo listino si ricalcolano. Torna quanti.
function fornitoreRiapplicaCosti(supplierId) {
  let n = 0;
  (db.items || []).forEach(it => {
    const row = activePriceRow(it);
    if (!row || row.supplierId !== supplierId || !priceRowQuoted(row) || !costField(it)) return;
    const prima = Number(it[costField(it)]) || 0;
    applyPriceRow(it, row);
    if (Math.abs((Number(it[costField(it)]) || 0) - prima) > 0.0000005) { touch(it); n++; }
  });
  return n;
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
function priceListScontiVisibili(it) {
  // Anche gli scaglioni (dalla 0.157.2): a modulo spento muovono ancora il
  // costo, e un costo che non si sa spiegare dal listino non si deve vedere.
  return moduloAttivo('listini') || priceRows(it).some(r => r.discount || r.validTo || (Array.isArray(r.breaks) && r.breaks.length));
}
// Sotto il prezzo di listino: lo sconto della quotazione e quello che si paga,
// nell'unità di gestione, con lo sconto del fornitore se ne ha uno.
function priceRowScontoHtml(it, r, ro) {
  const sup = r.supplierId ? getSupplier(r.supplierId) : null;
  const netto = priceRowQuoted(r) && (r.discount || (sup && sup.discount))
    ? `<span title="Quello che si paga${sup && sup.discount ? ', compreso lo sconto fornitore ' + esc(sup.discount) + '%' : ''}, nell'unità di gestione">netto ${fmtN(rowUnitCost(it, r) || 0)}/${esc(it.uom || '')}</span>`
    : '';
  return `<div class="pl-sub pl-col"><input class="rfq-sconto-input" value="${esc(r.discount || '')}" placeholder="sconto %" title="Sconto della quotazione, anche a cascata: 10+5 è il 10% e poi il 5%; con il meno è una maggiorazione" aria-label="Sconto %" ${ro} onchange="priceSetField('${r.id}','discount',this.value)">${netto}</div>`;
}
// ─── Gli scaglioni nel listino dell'articolo ───
// Si aprono sotto la quotazione con il pulsante sotto il fornitore. Chi non li
// usa non vede niente in più.
const _plScaglioniAperti = new Set();
function priceTiersBtn(r) {
  const n = priceRowTiers(r).length - 1;
  const aperto = _plScaglioniAperti.has(r.id);
  return `<button class="mini-btn pl-tiers-btn" title="Prezzi diversi secondo la quantità ordinata" aria-expanded="${aperto}" onclick="priceTiersToggle('${r.id}')">${n > 0 ? `${n + 1} scaglioni` : '+ scaglioni'} ${aperto ? '▴' : '▾'}</button>`;
}
function priceTiersToggle(rowId) {
  if (_plScaglioniAperti.has(rowId)) _plScaglioniAperti.delete(rowId); else _plScaglioniAperti.add(rowId);
  priceListRefresh();
}
function priceTiersRowHtml(it, r, ro) {
  const u = priceUomOf(it, r);
  const sup = r.supplierId ? getSupplier(r.supplierId) : null;
  const netto = (price, sconto) => price === '' || price == null ? '—'
    : fmtN((Number(price) || 0) * scontoFattore(sconto) * scontoFattore(sup && sup.discount));
  const base = `<tr><td>${r.minQty === '' || r.minQty == null ? '—' : esc(fmtQtyIt(r.minQty))} <span class="pl-tier-nota">(Q.tà min)</span></td>
      <td class="num">${priceRowQuoted(r) ? esc(fmtN(Number(r.price) || 0)) : '—'}</td><td>${esc(r.discount || '')}</td>
      <td class="num">${netto(r.price, r.discount)}</td><td></td></tr>`;
  const altre = (r.breaks || []).map((b, i) => `<tr>
      <td><input type="number" class="num pl-small" min="0" step="any" value="${b.fromQty === '' || b.fromQty == null ? '' : b.fromQty}" placeholder="da q.tà" aria-label="Da quantità" ${ro} onchange="priceTierSet('${r.id}',${i},'fromQty',this.value)"></td>
      <td><input type="number" class="num pl-price" min="0" step="0.0001" value="${b.price === '' || b.price == null ? '' : b.price}" placeholder="prezzo" aria-label="Prezzo" ${ro} onchange="priceTierSet('${r.id}',${i},'price',this.value)"></td>
      <td><input class="rfq-sconto-input" value="${esc(b.discount || '')}" placeholder="sconto %" aria-label="Sconto %" ${ro} onchange="priceTierSet('${r.id}',${i},'discount',this.value)"></td>
      <td class="num">${netto(b.price, b.discount)}</td>
      <td>${ro ? '' : `<button class="mini-btn danger" title="Togli lo scaglione" onclick="priceTierDel('${r.id}',${i})">${ico('trash', 'tinted', 'Togli lo scaglione')}</button>`}</td></tr>`).join('');
  return `<tr class="pl-tiers-row"><td></td><td colspan="6">
    <div class="pl-tiers">
      <div class="pl-tiers-head">Scaglioni di ${esc(supplierName(r.supplierId) || 'questa quotazione')} <span>— il prezzo vale per tutta la quantità ordinata da quella soglia in su; il primo è il prezzo della quotazione</span></div>
      <table class="price-table pl-tiers-table"><thead><tr><th scope="col">Da q.tà (${esc(u)})</th><th scope="col" class="num">Prezzo (${esc(cur())}/${esc(u)})</th><th scope="col">Sconto %</th><th scope="col" class="num" title="Con lo sconto del fornitore, se ne ha uno">Netto</th><th scope="col"></th></tr></thead>
        <tbody>${base}${altre}</tbody></table>
      ${ro ? '' : `<button class="add-btn-sm" onclick="priceTierAdd('${r.id}')">+ Scaglione</button>`}
    </div></td></tr>`;
}
// Ogni modifica a uno scaglione della quotazione in uso muove il costo, come il prezzo.
function priceTierSalva(it, row) {
  touch(row); touch(it);
  if (it.activePriceId === row.id) applyPriceRow(it, row);
  saveDB(); priceListRefresh(); renderCatalogs();
}
function priceTierAdd(rowId) {
  if (!roleGuard('catalog')) return;
  const found = priceRowById(rowId); if (!found || !found.row) return;
  if (!Array.isArray(found.row.breaks)) found.row.breaks = [];
  found.row.breaks.push({ fromQty: '', price: '', discount: '' });
  _plScaglioniAperti.add(rowId);
  priceTierSalva(found.it, found.row);
}
function priceTierSet(rowId, i, field, value) {
  if (!roleGuard('catalog')) { priceListRefresh(); return; }
  const found = priceRowById(rowId); if (!found || !found.row) return;
  const { it, row } = found;
  const b = (row.breaks || [])[i]; if (!b) return;
  if (field === 'discount') {
    const norm = scontoNorm(value);
    if (norm == null) { showToast(SCONTO_ERRORE, 'error'); priceListRefresh(); return; }
    b.discount = norm;
  } else if (field === 'price') {
    b.price = value === '' ? '' : clampNum(parseFloat(value), 0);
  } else if (field === 'fromQty') {
    const q = value === '' ? '' : clampNum(parseFloat(value), 0);
    const min = Number(row.minQty) || 0;
    if (q !== '' && q <= min) {
      showToast(`La soglia va oltre la quantità minima della quotazione (${fmtQtyIt(min)}): sotto vale il prezzo base`, 'error'); priceListRefresh(); return;
    }
    if (q !== '' && row.breaks.some((x, j) => j !== i && Number(x.fromQty) === q)) {
      showToast('C\'è già uno scaglione con questa soglia', 'error'); priceListRefresh(); return;
    }
    b.fromQty = q;
    // In ordine di soglia, quelle ancora vuote in fondo.
    row.breaks.sort((x, y) => (x.fromQty === '' ? Infinity : x.fromQty) - (y.fromQty === '' ? Infinity : y.fromQty));
  } else return;
  priceTierSalva(it, row);
}
function priceTierDel(rowId, i) {
  if (!roleGuard('catalog')) return;
  const found = priceRowById(rowId); if (!found || !found.row) return;
  found.row.breaks = (found.row.breaks || []).filter((_, j) => j !== i);
  priceTierSalva(found.it, found.row);
}
function priceListBody(id) {
  const it = getItem(id); if (!it) return '';
  const campo = costField(it);
  const inUso = activePriceRow(it);
  const migliore = bestPriceRow(it);
  const scrivibile = canWrite('catalog');
  const doppia = hasAltUom(it);   // la colonna dell'unità compare solo se serve
  // Sconto e scadenza (dalla 0.157.0) col modulo Listini e sconti, o se una
  // quotazione li ha già: un dato scritto non si nasconde.
  const sconti = priceListScontiVisibili(it);
  const oggi = oggiISO();

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
          ${sconti ? priceTiersBtn(r) : ''}
          ${attiva && superataDa ? `<span class="home-ris-superato">sostituita dal listino del ${esc(fmtDateIt(superataDa.date) || '—')}</span>` : ''}
        </div>
      </td>
      <td><input type="number" class="num pl-price" min="0" step="0.0001" value="${r.price === '' || r.price == null ? '' : r.price}" ${ro} onchange="priceSetField('${r.id}','price',this.value)">
        ${sconti ? priceRowScontoHtml(it, r, ro) : ''}
        ${doppia ? `<div class="pl-sub"><select ${ro} title="Unità in cui il fornitore quota" onchange="priceSetField('${r.id}','priceUom',this.value)">${itemUomOptions(it, priceUomOf(it, r))}</select>
          ${priceUomOf(it, r) !== (it.uom || '') ? `<span title="Costo convertito nell'unità di gestione">= ${fmtN(rowUnitCost(it, r) || 0)}/${esc(it.uom || '')}</span>` : ''}</div>` : ''}</td>
      <td><input type="number" class="num pl-small" min="0" step="any" value="${r.minQty === '' || r.minQty == null ? '' : r.minQty}" placeholder="—" title="Quantità minima, nell'unità della quotazione" ${ro} onchange="priceSetField('${r.id}','minQty',this.value)"></td>
      <td><input type="number" class="num pl-small" min="0" max="9999" step="1" value="${r.leadDays === '' || r.leadDays == null ? '' : r.leadDays}" placeholder="—" title="Giorni di consegna" ${ro} onchange="priceSetField('${r.id}','leadDays',this.value)"></td>
      <td><input type="date" class="pl-date" value="${esc(r.date || '')}" title="${sconti ? 'Valida dal' : 'Data della quotazione'}" ${ro} onchange="priceSetField('${r.id}','date',this.value)">
        ${sconti ? `<div class="pl-sub"><input type="date" class="pl-date" value="${esc(r.validTo || '')}" title="Valida fino al: vuoto se il fornitore non ha messo una scadenza" aria-label="Valida fino al" ${ro} onchange="priceSetField('${r.id}','validTo',this.value)"></div>` : ''}
        ${priceRowFutura(r, oggi) ? `<div class="pl-sub pl-col"><span class="home-ris-superato" title="Fino a quel giorno vale la quotazione precedente">valida dal ${esc(fmtDateIt(r.date))}</span></div>`
    : priceRowScaduta(r, oggi) ? `<div class="pl-sub pl-col"><span class="mrp-warn" title="Si usa lo stesso, ma il fornitore potrebbe non tenerla più">⚠ scaduta il ${esc(fmtDateIt(r.validTo))}</span></div>` : ''}</td>
      <td class="pl-act">
        ${attiva ? '' : `<button class="mini-btn" title="Usa questo prezzo nella costificazione" onclick="priceUseRow('${r.id}')">✓ Usa</button>`}
        <button class="mini-btn danger" title="Elimina la voce" onclick="priceDelRow('${r.id}')">${ico('trash', 'tinted', 'Elimina la voce')}</button>
      </td></tr>${sconti && _plScaglioniAperti.has(r.id) ? priceTiersRowHtml(it, r, ro) : ''}`;
  }).join('');

  const vuoto = `<tr><td colspan="7" class="empty-text">Nessuna quotazione registrata. Aggiungine una, oppure registrale da una richiesta di offerta ricevuta.</td></tr>`;
  const attuale = campo
    ? `<p style="margin-bottom:12px">Prezzo in uso nella costificazione: <strong style="font-family:var(--mono)">${fmtPer(Number(it[campo]) || 0, itemUom(it))}</strong>${inUso && priceRowTiers(inUso).length > 1 ? ` <span style="color:var(--text-dim)">— ${priceQtaRiferimento(it) > 0 ? `netto per ${esc(fmtQtyIt(priceQtaRiferimento(it)))} ${esc(itemUom(it))}, il lotto di riordino` : 'netto del primo scaglione: senza lotto di riordino non c\'è una quantità di riferimento'}</span>` : ''}${doppia ? ` <span style="color:var(--text-dim)">— ${esc(itemUom(it))} è l'unità con cui l'articolo si gestisce e si mette in distinta</span>` : ''}${inUso ? '' : ' <span style="color:var(--text-dim)">(inserito a mano, non da listino)</span>'}</p>`
    : `<p style="margin-bottom:12px;color:var(--text-dim)">Il costo di questa parte è derivato dalla sua distinta e dal ciclo di lavorazione. Con “✓ Usa” si può passare al prezzo del fornitore, cambiando il modo di calcolo.</p>`;
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
      <td class="num">${priceRowQuoted(r) ? fmtPer(Number(r.price) || 0, priceUomOf(it, r)) + (r.discount ? ` −${esc(r.discount)}%` : '') : '—'}</td>
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
    <div class="table-wrap"><table class="price-table${sconti ? ' pl-sconti' : ''}">
      <thead><tr><th scope="col"></th><th scope="col">Fornitore</th><th scope="col">${sconti ? `Listino · Sconto % (${esc(cur())}/${esc(uQuot)})` : `Prezzo (${esc(cur())}/${esc(uQuot)})`}</th><th scope="col">Q.tà min (${esc(uQuot)})</th>
        <th scope="col" title="Giorni di consegna">GG</th><th scope="col">${sconti ? 'Valida dal · al' : 'Data'}</th><th scope="col"></th></tr></thead>
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
      // Scadute o in scadenza entro 30 giorni, fra quelle ancora valide: è la
      // lista dei prezzi da farsi riconfermare.
      if (_plv.solo === 'scadenza' && (storico || !r.validTo || r.validTo > plvFra30())) return;
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
function plvFra30() {
  const d = new Date(oggiISO() + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
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
  return `<span style="font-family:var(--mono)">${fmtPer(Number(x.r.price) || 0, u)}</span>`
    + (x.r.discount ? `<div class="pl-sub" title="Sconto della quotazione">−${esc(x.r.discount)}%</div>` : '')
    + (priceRowTiers(x.r).length > 1 ? `<div class="pl-sub" title="${esc(plvScaglioniTesto(x.it, x.r))}">${priceRowTiers(x.r).length} scaglioni</div>` : '');
}
// Gli scaglioni in una riga di testo: «da 25: 14 −10+5 · da 50: 12,6 −10».
function plvScaglioniTesto(it, r) {
  const t = priceRowTiers(r);
  if (t.length < 2) return '';
  return t.map(x => `da ${fmtQtyIt(x.fromQty)}: ${fmtN(x.price)}${x.discount ? ' −' + x.discount + '%' : ''}`).join(' · ');
}
function plvValidita(r) {
  if (!r.validTo) return '—';
  const scaduta = priceRowScaduta(r);
  return `<span class="${scaduta ? 'mrp-warn' : ''}" title="${scaduta ? 'Scaduta: si usa lo stesso, ma va fatta riconfermare' : 'Valida fino al'}">${scaduta ? '⚠ ' : ''}${esc(fmtDateIt(r.validTo))}</span>`;
}
function plvBody(righe) {
  if (!righe.length) {
    const nulla = !(db.items || []).some(it => hasPriceList(it) && priceRows(it).length);
    return `<p class="empty-text">${nulla
      ? 'Nessuna quotazione registrata. Si aggiungono dal listino di un articolo, oppure tornano con i prezzi di una richiesta di offerta.'
      : 'Nessuna quotazione corrisponde ai filtri.'}</p>`;
  }
  // La classe dei fornitori (modulo Qualità): una volta per disegno, non per riga.
  const classi = typeof qcClassiIndice === 'function' ? qcClassiIndice() : new Map();
  return `<div class="table-wrap"><table class="price-table plv-table">
    <thead><tr><th scope="col"></th><th scope="col">Articolo</th><th scope="col">Descrizione</th><th scope="col">Fornitore</th>
      <th scope="col">Cod. fornitore</th><th scope="col" class="num">Prezzo</th><th scope="col" class="num">Q.tà min</th>
      <th scope="col" class="num" title="Giorni di consegna">GG</th><th scope="col">Data</th><th scope="col">Valida al</th><th scope="col">Origine</th></tr></thead>
    <tbody>${righe.map(x => `<tr class="${x.attiva ? 'price-active' : x.storico ? 'price-storico' : ''}" style="cursor:pointer" tabindex="0" onclick="priceListModal('${x.it.id}')" onkeydown="if(event.key==='Enter')priceListModal('${x.it.id}')" title="Apri il listino di ${esc(x.it.code)}">
      <td class="pl-flag">${x.attiva ? '<span title="Prezzo in uso nella costificazione">✓</span>' : ''}${x.best ? '<span class="price-best" title="Quotazione più bassa">↓</span>' : ''}${x.storico ? '<span class="price-tag-storico" title="Sostituita da una quotazione più recente dello stesso fornitore">storico</span>' : ''}</td>
      <td><span class="code">${esc(x.it.code)}</span></td>
      <td>${esc(x.it.name)} <span style="color:var(--text-dim)">· ${esc(typeLabel(x.it.type))}</span></td>
      <td>${x.sup ? esc(x.sup.name) + (typeof qcClasseBadge === 'function' ? qcClasseBadge(classi.get(x.sup.id)) : '') : '<span style="color:var(--text-dim)">—</span>'}</td>
      <td>${esc(x.r.code || '')}</td>
      <td class="num">${plvPrezzo(x)}</td>
      <td class="num">${x.r.minQty === '' || x.r.minQty == null ? '—' : esc(fmtQtyIt(x.r.minQty))}</td>
      <td class="num">${x.r.leadDays === '' || x.r.leadDays == null ? '—' : esc(String(x.r.leadDays))}</td>
      <td>${x.r.date ? esc(fmtDateIt(x.r.date)) : '—'}</td>
      <td>${plvValidita(x.r)}</td>
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
        <option value="scadenza" ${_plv.solo === 'scadenza' ? 'selected' : ''}>Scadute o in scadenza (30 giorni)</option>
      </select>
      <span class="doc-filter-count">${righe.length} ${righe.length === 1 ? 'quotazione' : 'quotazioni'}</span>
    </div>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Tutte le quotazioni di commerciali, materie prime e parti. ✓ è il prezzo in uso nella costificazione, ↓ la quotazione più bassa dell'articolo. Per ogni fornitore vale la quotazione più recente già in vigore: le precedenti sono segnate «storico» e non entrano nei confronti. Un clic sulla riga apre il listino dell'articolo, dove si modifica e si sceglie il prezzo in uso.</p>
    <div id="plv-body">${plvBody(righe)}</div>
  </div>`;
}
function plvExportSpec() {
  const righe = plvRows();
  const solo = { uso: 'Solo i prezzi in uso', senza: 'Senza prezzo', valide: 'Senza lo storico', scadenza: 'Scadute o in scadenza' }[_plv.solo] || '';
  return {
    titolo: 'Listino fornitori',
    slug: 'listino_fornitori',
    filtri: [['Testo', _plv.q.trim()], ['Fornitore', _plv.sup ? ((getSupplier(_plv.sup) || {}).name || '') : ''],
      ['Tipo', _plv.tipo ? typeLabel(_plv.tipo) : ''], ['Quotazioni', solo]],
    sezioni: [{
      nome: 'Quotazioni',
      colonne: [
        { h: 'Codice', w: 14 }, { h: 'Descrizione', w: 30 }, { h: 'Tipo', w: 14 }, { h: 'Fornitore', w: 24 },
        { h: 'Cod. fornitore', w: 14 }, { h: 'Prezzo', w: 12, num: true }, { h: 'Sconto %', w: 9 }, { h: 'U.M.', w: 6 },
        { h: 'Q.tà min', w: 9, num: true }, { h: 'GG', w: 6, num: true }, { h: 'Data', w: 11, data: true },
        { h: 'Valida al', w: 11, data: true }, { h: 'Scaglioni', w: 30 },
        { h: 'In uso', w: 7 }, { h: 'Storico', w: 8 }, { h: 'Origine', w: 14 }],
      righe: righe.map(x => [x.it.code || '', x.it.name || '', typeLabel(x.it.type), x.sup ? x.sup.name : '',
        x.r.code || '', x.r.price === '' || x.r.price == null ? '' : Number(x.r.price) || 0, x.r.discount || '', priceUomOf(x.it, x.r),
        x.r.minQty === '' || x.r.minQty == null ? '' : Number(x.r.minQty) || 0,
        x.r.leadDays === '' || x.r.leadDays == null ? '' : Number(x.r.leadDays) || 0,
        x.r.date || '', x.r.validTo || '', plvScaglioniTesto(x.it, x.r), x.attiva ? 'sì' : '', x.storico ? 'sì' : '', priceRowOrigin(x.r)]),
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
    id: gid(), supplierId: it.supplierId || null, price: '', discount: '', minQty: '', leadDays: '',
    code: '', desc: '', date: oggiISO(), validTo: '', breaks: [], rfqId: null, note: '',
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
  } else if (field === 'discount') {
    const norm = scontoNorm(value);
    if (norm == null) { showToast(SCONTO_ERRORE, 'error'); priceListRefresh(); return; }
    row.discount = norm;
  } else if (field === 'validTo') {
    if (value && row.date && value < row.date) {
      showToast('La scadenza viene prima del giorno da cui vale la quotazione', 'error'); priceListRefresh(); return;
    }
    row.validTo = value || '';
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
  const RIAPPLICA = ['price', 'priceUom', 'supplierId', 'code', 'desc', 'discount', 'minQty'];
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
    <p style="margin-bottom:14px">Il costo di <strong>${esc(found.it.code)}</strong> lo determinano la sua distinta e il suo
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
    return !fatta || rfqQuoteDiversa(r, l, fatta);
  });
}
// Dalla 0.157.0 la quotazione prende dalla riga il prezzo di listino e lo
// sconto, e dalla richiesta la scadenza dell'offerta: se una delle tre cose è
// cambiata, la quotazione è da aggiornare.
function rfqQuoteDiversa(r, l, fatta) {
  return Number(fatta.price) !== (Number(rigaPrezzoLordo(l)) || 0)
    || (fatta.discount || '') !== (l.discount || '')
    || (fatta.validTo || '') !== (r.offerValidTo || '');
}
function rfqPrezzoTesto(prezzo, sconto) { return fmtPrezzo(Number(prezzo) || 0) + (sconto ? ' −' + sconto + '%' : ''); }
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
    const prezzo = rfqPrezzoTesto(rigaPrezzoLordo(l), l.discount);
    return `<label class="rfq-pick-row"><input type="checkbox" value="${esc(l.id)}" checked onchange="rfqRecordPickCount()">
      <span style="font-family:var(--mono)">${esc(it.code || '')}</span> ${esc(it.name || '')}
      <span class="rfq-pick-type">${fatta ? esc(rfqPrezzoTesto(fatta.price, fatta.discount)) + ' → ' : ''}${esc(prezzo)}</span></label>`;
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
    const prezzo = Number(rigaPrezzoLordo(l)) || 0;
    const sconto = l.discount || '';
    const fatta = rfqQuoteRow(it, r, l);
    if (fatta) {
      fatta.price = prezzo;
      fatta.discount = sconto;
      fatta.validTo = r.offerValidTo || '';
      touch(fatta);
      // Quella in uso porta il prezzo nel costo: si riapplica, come quando lo
      // si corregge dal listino (priceSetField).
      if (it.activePriceId === fatta.id) applyPriceRow(it, fatta);
      aggiornate++;
    } else {
      const si = rfqLineSupInfo(r, l);
      it.priceList.push(stampNew({
        id: rfqQuoteId(r.id, l.id), supplierId: r.supplierId, price: prezzo, discount: sconto,
        minQty: '', leadDays: '', code: (si && si.code) || '', desc: (si && si.desc) || '',
        date: data, validTo: r.offerValidTo || '', breaks: [], rfqId: r.id, lineId: l.id, note: '',
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
