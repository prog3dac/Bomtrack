// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-oda.js
// ═══════════════════════════════════════════════════════════
// Ordini a fornitore (ODA), ordini di lavoro in conto lavoro (ODL) e l'avvio
// e la dichiarazione sulla riga.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
// Diviso da views-docs.js nella 0.141.0: stesso ordine di caricamento, subito dopo.

// ═══════════════════════════════════════════════════════════
//  VISTA: ORDINI A FORNITORE (ODA)
// ═══════════════════════════════════════════════════════════
function getOrder(id) { return db.orders.find(o => o.id === id); }
function ordMode(o) { return docMode('order', o); }
function ordGuard(id, kind) { return docGuard('order', id, kind); }
function ordUnlock(id) { return docUnlock('order', id); }
// ─── Data richiesta contro data confermata ───
// Il fornitore conferma quasi sempre una data diversa da quella chiesta, e
// finora quella risposta non si scriveva da nessuna parte: restava in una mail.
// Qui si registra accanto alla richiesta, e lo scarto si vede — perché è lo
// scarto, non la data, a dire se la commessa va rifatta.
// In UTC come addDays(): qui la differenza farebbe cadere gli offset, ma il
// passaggio dell'ora legale fra le due date lascerebbe un'ora di scarto, e
// arrotondare a giorni interi è più fragile che non averne bisogno.
function giorniTra(a, b) {
  if (!a || !b) return null;
  const d1 = new Date(a + 'T00:00:00Z'), d2 = new Date(b + 'T00:00:00Z');
  if (isNaN(d1) || isNaN(d2)) return null;
  return Math.round((d2 - d1) / 86400000);
}
// Lo scarto si conta in giorni-fornitore (calendario.js): lavorativi di serie
// dalla 0.110.0, come i giorni di consegna a listino.
function ordLineDelay(l) {
  const a = l && l.deliveryDate, b = l && l.confirmedDate;
  if (!a || !b) return null;
  const g = typeof supplierDaysBetween === 'function' ? supplierDaysBetween(a, b) : giorniTra(a, b);
  return g == null ? null : g;
}
function ordLineDelayHtml(l) {
  const g = ordLineDelay(l);
  if (g == null || g === 0) return '';
  return g > 0
    ? `<div class="line-note" style="color:var(--red)">+${supplierDaysText(g)} sulla richiesta</div>`
    : `<div class="line-note" style="color:var(--green)">${supplierDaysText(g)} — in anticipo</div>`;
}
// Il ritardo peggiore dell'ordine: è quello che decide se la commessa slitta.
function orderWorstDelay(o) {
  let peggiore = null;
  (o.lines || []).forEach(l => {
    const g = ordLineDelay(l);
    if (g != null && g > 0 && (peggiore == null || g > peggiore)) peggiore = g;
  });
  return peggiore;
}
function orderTotal(o) { return totaleRighe(o.lines); }
function orderReception(o) {
  let ordered = 0, received = 0;
  (o.lines || []).forEach(l => { ordered += Number(l.qty) || 0; received += Number(l.received) || 0; });
  return { ordered, received, residual: ordered - received };
}
// Parziale/Evaso sono un fatto misurabile sui ricevimenti, non una scelta: li
// deriviamo. Bozza e Annullato restano decisioni dell'utente e non si toccano.
// Azzerando i ricevimenti si torna indietro, a Confermato o Inviato a seconda
// che la conferma d'ordine del fornitore sia arrivata.
function ordAutoStatus(o) {
  if (o.status === 'bozza' || o.status === 'annullato') return;
  const { ordered, received } = orderReception(o);
  // «Confermato» scelto a mano resta, anche senza il numero di conferma.
  if (received <= 0) o.status = (o.supplierConfirmation || o.status === 'confermato') ? 'confermato' : 'inviato';
  else if (ordered > 0 && received >= ordered) o.status = 'evaso';
  else o.status = 'parziale';
}
function nextOrderNumber() { return numeroProgressivo('ODA'); }

function renderOrders() {
  const host = document.getElementById('view-orders');
  if (orderView === 'edit' && !getOrder(currentOrderId)) { orderView = 'list'; currentOrderId = null; }
  const o = orderView === 'edit' ? getOrder(currentOrderId) : null;
  host.innerHTML = worklistHtml({
    titolo: 'Ordini a fornitore', icona: 'receipt', listaId: 'order-list',
    comandi: `<button class="add-btn-sm" onclick="newOrder()">+ Nuovo ordine</button>
      ${listExportButtons('orderListExportSpec')}`,
    filtri: docFilterBar('order', ORDER_STATUS, docFilterApply('order', db.orders).length, db.orders.length),
    righe: orderListRows(),
    doc: o ? renderOrderEdit(currentOrderId) : '',
    vuoto: {
      titolo: 'Nessun ordine aperto qui',
      testo: 'Scegli un ordine dall\'elenco a destra: al centro compaiono le righe con il prezzo, la data confermata dal fornitore e la colonna dei ricevimenti, che e\' quella che alimenta il magazzino.',
      comandi: '<button class="add-btn-sm" onclick="newOrder()">+ Nuovo ordine</button>',
    },
  });
  if (o) applyDocLock(ordMode(o), host);
  a11yFields(host);
}

function orderListRows() {
  const list = docFilterApply('order', db.orders.slice().sort((a, b) => (b.number || '').localeCompare(a.number || '')));
  return list.map(o => {
    const sup = o.supplierId ? supplierName(o.supplierId) : '— nessun fornitore —';
    const rec = orderReception(o);
    const recTxt = rec.ordered ? `ric. ${fmtQtyIt(rec.received)}/${fmtQtyIt(rec.ordered)}` : '';
    return worklistRow({
      numero: o.number,
      badge: statusBadge(ORDER_STATUS, o.status),
      titolo: o.title || '',
      meta: `${esc(sup)} · ${fmtN(orderTotal(o))}${recTxt ? ' · ' + recTxt : ''}${o.date ? ' · ' + esc(fmtDateIt(o.date)) : ''}`,
      sel: orderView === 'edit' && currentOrderId === o.id,
      spenta: o.status === 'annullato',
      azione: `openOrderEdit('${o.id}')`,
      etichetta: `Apri l'ordine ${o.number}`,
    });
  }).join('') || `<div class="empty-text">${db.orders.length ? 'Nessun ordine con questi filtri.' : 'Nessun ordine. Creane uno, oppure generalo da una richiesta di offerta, dal Fabbisogno o dal riordino del Magazzino.'}</div>`;
}
function newOrder() {
  if (!roleGuard('docs')) return;
  return conNumeri({ ODA: 1 }, () => {
    const o = Store.insert('orders', { id: gid(), number: nextOrderNumber(), title: '', date: oggiISO(),
      status: 'bozza', supplierId: null, transport: db.settings.transportDefault || '', payment: db.settings.paymentDefault || '',
      rfqId: null, planId: null, supplierConfirmation: '', notes: '', notesInternal: '', lines: [], active: true });
    docLeave('order'); currentOrderId = o.id; orderView = 'edit'; renderOrders();
  });
}
function orderFromRfq(rfqId) {
  if (!roleGuard('docs')) return;
  const r = getRfq(rfqId); if (!r) return;
  // Quanti numeri servono si sa prima: un ODA per la merce (o per una
  // richiesta senza lavorazioni), un ODL per ogni passata.
  const conFase = (r.lines || []).filter(l => !!l.phaseKey);
  const nOda = conFase.length < (r.lines || []).length || !conFase.length ? 1 : 0;
  // Fra il clic e la creazione c'è il giro dei numeri: un secondo clic, o un
  // collega, può aver creato l'ordine nel frattempo. Allora ci si ferma.
  const crea = () => {
    const prima = ordiniDaRfq(r.id).length;
    return conNumeri({ ODA: nOda, ODL: new Set(conFase.map(clPassataDiRiga)).size }, () => {
      if (ordiniDaRfq(r.id).length > prima) { showToast(`L'ordine da ${r.number} è appena stato creato`, 'error'); return; }
      return orderFromRfqFatto(r);
    });
  };
  // Un ordine da questa richiesta c'è già (dalla 0.105.5): un secondo nasce
  // solo se lo si vuole davvero. Prima ne nasceva uno a ogni clic.
  const gia = ordiniDaRfq(r.id);
  if (gia.length) {
    return askConfirm(`Da ${r.number} esiste già ${gia.map(d => d.number).join(', ')}. Crearne un altro?`, crea,
      { title: 'Ordine già creato', ok: 'Crea un altro ordine' });
  }
  return crea();
}
function ordiniDaRfq(rfqId) {
  return [].concat(db.orders || [], db.workOrders || []).filter(d => d.rfqId === rfqId && d.status !== 'annullato');
}
function orderFromRfqFatto(r) {
  const sup = r.supplierId ? getSupplier(r.supplierId) : null;
  const o = stampNew({ id: gid(), number: nextOrderNumber(),
    title: r.title || ('Da ' + r.number), date: oggiISO(), status: 'bozza',
    supplierId: r.supplierId || null,
    transport: r.transport || (sup && sup.defaultTransport) || db.settings.transportDefault || '',
    payment: r.payment || (sup && sup.defaultPayment) || db.settings.paymentDefault || '',
    rfqId: r.id, planId: r.planId || null, supplierConfirmation: '', notes: r.notes || '', notesInternal: r.notesInternal || '',
    lines: [], active: true });
  // Una richiesta può contenere insieme merce e lavorazioni dello stesso
  // fornitore — chiedere quanto costa il materiale e quanto costa lavorarlo è
  // una domanda sola. Gli **ordini** invece sono due, e qui la richiesta si
  // divide: le righe con una fase vanno in un ordine di lavoro, le altre in un
  // ordine d'acquisto. Mescolarle sarebbe il contrario della separazione.
  const copia = l => ({ id: gid(), itemId: l.itemId || null, code: l.code || '', description: l.description || '',
    uom: l.uom || defaultUom(), qty: Number(l.qty) || 0, price: (l.price === '' || l.price == null) ? '' : Number(l.price),
    deliveryDate: l.deliveryDate || '', received: 0, note: l.note || '',
    phaseKey: l.phaseKey || null, phaseKeys: l.phaseKeys || l.phaseKey || null });
  const merce = (r.lines || []).filter(l => !l.phaseKey);
  const fasi = (r.lines || []).filter(l => !!l.phaseKey);
  const creati = [];
  // L'ordine d'acquisto è il caso normale e resta il ripiego: una richiesta
  // senza righe, o con solo merce, produce un ODA — anche vuoto, com'è sempre
  // stato. Solo una richiesta di **sole** lavorazioni non ne genera nessuno.
  if (merce.length || !fasi.length) {
    o.lines = merce.map(copia);
    db.orders.push(o); creati.push({ kind: 'order', doc: o });
  }
  let w = null;
  // Una richiesta d'offerta tiene insieme le due passate dello stesso terzista —
  // chiedere non è commissionare, e a un preventivo si risponde una volta. Un
  // **ordine** no: fra la prima e la seconda passata il pezzo torna da noi, e
  // le due lavorazioni non si possono fare di seguito. Qui si separano.
  const perPassata = new Map();
  fasi.forEach(l => {
    const k = clPassataDiRiga(l);
    if (!perPassata.has(k)) perPassata.set(k, []);
    perPassata.get(k).push(l);
  });
  Array.from(perPassata.keys()).sort((a, b) => a - b).forEach(k => {
    const doc = stampNew(Object.assign({}, o, { id: gid(), number: nextOdlNumber(),
      lines: perPassata.get(k).map(l => Object.assign(copia(l), { itemId: null, startDate: '' })) }));
    db.workOrders.push(doc); creati.push({ kind: 'odl', doc });
    if (!w) w = doc;
  });
  // La richiesta ha esaurito il suo scopo: si chiude da sé, ma solo se era
  // davvero uscita (da una bozza si può generare un ordine di prova).
  let closed = false;
  if (r.status === 'inviata' || r.status === 'ricevuta') { r.status = 'chiusa'; touch(r); closed = true; }
  saveDB();
  // Si apre il primo dei due: l'altro è nel suo elenco, e il messaggio lo dice.
  const primo = creati[0];
  // Anche la richiesta si lascia: i prezzi scritti prima di «Crea ordine» sono
  // appena stati salvati, e il segno «da salvare» fermava la ricezione dei
  // colleghi nell'archivio condiviso.
  docLeave('rfq');
  docLeave(primo.kind);
  if (primo.kind === 'order') { currentOrderId = primo.doc.id; orderView = 'edit'; setView('orders'); }
  else { currentOdlId = primo.doc.id; odlView = 'edit'; setView('odl'); }
  const nomi = creati.map(c => (c.kind === 'odl' ? 'ordine di lavoro ' : 'ordine ') + c.doc.number).join(' e ');
  showToast(`Creat${creati.length > 1 ? 'i' : 'o'} ${nomi} dalla richiesta${closed ? ' · ' + r.number + ' chiusa' : ''}`);
}
function openOrderEdit(id) { docLeave('order'); currentOrderId = id; orderView = 'edit'; renderOrders(); }
function orderBackToList() { docBackToList('order'); }
function orderMarkDirty() { docMarkDirty('order'); }
function ordSave(id) { docSave('order', id); }
function ordSetField(id, field, value) { docSetField('order', id, field, value); }
function ordSetSupplier(id, sid) { docSetSupplier('order', id, sid); }
function ordSetLine(id, lineId, field, value) { docSetLine('order', id, lineId, field, value); }
function ordDelLine(id, lineId) { docDelLine('order', id, lineId); }
// Ritorna vero se ha registrato: il QR lo usa per dire com'è andata.
function ordMarkAllReceived(id) {
  if (!ordGuard(id, 'reception')) return false;
  const o = getOrder(id); if (!o) return false;
  (o.lines || []).forEach(l => {
    const prima = Number(l.received) || 0;
    registraRicevuto('orders', o, l, Number(l.qty) || 0);
    if (typeof qcDopoRicevimento === 'function') qcDopoRicevimento(o, l, (Number(l.received) || 0) - prima);
  });
  ordAutoStatus(o); touch(o); orderMarkDirty(); renderOrders();
  return true;
}

function ordAddManualLineModal(id) { docAddManualLineModal('order', id); }
function ordAddManualLine(id) { docAddManualLine('order', id); }
function ordEditLineModal(id, lineId) { docEditLineModal('order', id, lineId); }
function ordSaveLineEdit(id, lineId) { docSaveLineEdit('order', id, lineId); }
function ordAddCatalogModal(id) { if (!ordGuard(id, 'contract')) return; catalogPickerModal(ids => ordAddCatalogLines(id, ids)); }
function ordAddCatalogLines(id, ids) { docAddCatalogLines('order', id, ids); }

// ─── La riga porta ancora il listino di un altro? ───
// Le righe si compilano e *poi* si sceglie il fornitore, o lo si cambia a
// documento avviato. I prezzi non si riscrivono da soli — in quest'app nessun
// prezzo cambia da sé, è la regola su cui poggia tutto il resto — ma una riga
// che porta la quotazione di Rossi su un ordine passato a Bianchi va detta,
// altrimenti resta un numero sbagliato dall'aria giusta fino alla fattura.
//
// Si confronta con la quotazione più recente del fornitore attuale, nel
// **costo convertito** nell'unità di gestione — che è quella in cui la riga
// vive sempre, indipendentemente da come quel fornitore valorizza il
// listino. Niente avviso su una riga manuale (non viene da un listino), né
// su una riga senza prezzo (l'assenza si vede già da sé).
function ordLineListinoWarn(o, l) {
  if (!l.itemId || !o.supplierId) return '';
  const prezzo = (l.price === '' || l.price == null) ? null : Number(l.price);
  if (prezzo == null) return '';
  const it = getItem(l.itemId);
  const row = supplierPriceRow(it, o.supplierId);
  const sup = supplierName(o.supplierId) || 'questo fornitore';
  if (!row || row.price === '' || row.price == null) {
    return `<span class="mrp-warn" title="${esc(sup)} non ha questo articolo a listino: il prezzo in riga viene da un'altra parte. Verificalo prima di mandare l'ordine.">⚠ non a listino</span>`;
  }
  const cost = rowUnitCost(it, row) || 0;
  if (Math.abs(cost - prezzo) < 0.00005) return '';
  const uom = priceUomOf(it, row);
  const grezzo = uom !== (it.uom || '') ? ` (a listino ${fmtPer(row.price, uom)})` : '';
  return `<span class="mrp-warn" title="A listino ${esc(sup)} quota ${fmtPer(cost, itemUom(it))}${grezzo}. La riga dice altro: può essere un prezzo concordato, o il listino di un fornitore diverso rimasto da prima.">⚠ ${fmtPer(cost, itemUom(it))} a listino</span>`;
}

function renderOrderEdit(id) {
  const o = getOrder(id); if (!o) { orderView = 'list'; return ''; }
  const lines = (o.lines || []).map((l, i) => {
    const si = lineSupInfo(o.supplierId, l);
    const siSub = docSupInfoSub(si);
    const warn = ordLineListinoWarn(o, l);
    const lotWarn = lineLotWarn(l);
    const qty = Number(l.qty) || 0, price = (l.price === '' || l.price == null) ? null : Number(l.price);
    const amount = price != null ? importoRiga(l) : null;
    const rec = Number(l.received) || 0, residual = qty - rec;
    return `<tr>
      ${cell2(i + 1, '', 'ln-idx')}
      ${cell2(`<span class="ln-code">${codeLink(l.itemId, l.code || '')}</span>`,
    `${esc(l.description)}${lineOriginTag(l)}${warn ? ' ' + warn : ''}${lotWarn ? ' ' + lotWarn : ''}${siSub}${docLineNoteSub(l)}${ordClLineActions(o, l)}`)}
      ${cell2(`<input type="number" class="rfq-qty-input lock-contract" value="${l.qty}" min="0" step="any" title="Quantità ordinata" onchange="ordSetLine('${id}','${l.id}','qty',this.value)">`,
    esc(l.uom || ''))}
      ${cell2(`<input type="number" class="rfq-price-input lock-contract" value="${price != null ? price : ''}" min="0" step="any" placeholder="—" title="Prezzo unitario" onchange="ordSetLine('${id}','${l.id}','price',this.value)">`,
    `<span class="ln-amount">${amount != null ? fmtN(amount) : '—'}</span>`)}
      ${cell2(`<input type="date" class="rfq-date-input lock-contract" value="${esc(l.deliveryDate || '')}" title="Data che abbiamo chiesto" onchange="ordSetLine('${id}','${l.id}','deliveryDate',this.value)">`,
    `<input type="date" class="rfq-date-input lock-reception" value="${esc(l.confirmedDate || '')}" title="Data che il fornitore ha confermato" onchange="ordSetLine('${id}','${l.id}','confirmedDate',this.value)">${ordLineDelayHtml(l)}`)}
      ${cell2(`<input type="number" class="rfq-qty-input lock-reception" value="${rec}" min="0" step="any" title="${l.phaseKey ? 'Pezzi rientrati dal terzista: portano questo ordine a parziale o evaso, ma non caricano il magazzino. Il rientro si registra come movimento.' : 'Quantità ricevuta'}" onchange="ordSetLine('${id}','${l.id}','received',this.value)">`,
    `<span class="ln-residual ${residual > 0 ? 'pos' : ''}" title="Residuo da ricevere">${fmtQtyIt(residual)}</span>${typeof qcEtichettaRiga === 'function' ? qcEtichettaRiga('orders', o, l) : ''}`)}
      ${docLineActionsCell('ord', id, l)}
    </tr>`;
  }).join('') || `<tr><td colspan="7" class="empty-text">Nessuna riga. Aggiungi articoli dal catalogo o manualmente.</td></tr>`;
  const total = orderTotal(o);
  // Se il fornitore ha confermato più tardi di quanto chiesto, si dice subito e
  // in testata: è l'informazione che fa decidere se la commessa slitta, e non
  // deve stare nascosta in una colonna in fondo.
  const ritardo = orderWorstDelay(o);
  const mode = ordMode(o);
  const lockBanner = docLockBanner(mode, 'Ordine ' + (ORDER_STATUS[o.status] || o.status).toLowerCase(), 'order', id);
  return `<div class="manage-wrap">
    ${docToolbarHtml({ chiudi: 'orderBackToList()', cosa: "l'ordine", rec: o, stati: ORDER_STATUS, dirty: orderDirty,
      saveId: 'order-save-btn', salva: `ordSave('${id}')`, menu: [{ label: "Elimina l'ordine", icon: 'trash', onclick: `delOrder('${id}')`, danger: true }] })}
    ${docStepperHtml('order', o)}${docLinksHtml('order', o)}
    ${docCoWarnHtml()}${lockBanner}${stampLine(o)}
    ${docTestaHtml({ pfx: 'ord', rec: o, stati: ORDER_STATUS, controparte: 'Fornitore', data: 'Data ordine', conferma: "N° conferma d'ordine fornitore", note: 'Note' })}
    ${ritardo != null ? `<div class="rfq-warn">${ico('clock', 'tinted', '')} Il fornitore ha confermato con <strong>${supplierDaysText(ritardo)}</strong> di ritardo sulla data richiesta. Se questo materiale è a commessa, la consegna al cliente va verificata.</div>` : ''}
    <h3 class="rfq-subhead">Righe ordine
      <span class="rfq-head-actions">
        <button class="add-btn-sm lock-contract" onclick="ordAddCatalogModal('${id}')">+ Da catalogo</button>
        <button class="btn-outline lock-contract" onclick="ordAddManualLineModal('${id}')">+ Riga manuale</button>
        <button class="btn-outline lock-reception" onclick="ordMarkAllReceived('${id}')">✓ Segna tutto ricevuto</button>
      </span></h3>
    <div class="table-wrap"><table class="rfq-table rfq-table-2">
      <thead><tr>
        <th scope="col" class="ln-idx">#</th>
        ${th2('Codice', 'Descrizione')}
        ${th2('Q.tà', 'U.M.')}
        ${th2(`Prezzo unit. (${esc(cur())}/U.M.)`, `Importo (${esc(cur())})`, 'Prezzo di una unità, nella U.M. della riga; sotto, quanto fa per la quantità di riga')}
        ${th2('Richiesta', 'Confermata', 'Sopra la data che abbiamo chiesto, sotto quella che il fornitore ha confermato')}
        ${th2('Ricevuto', 'Residuo', 'Sopra quanto è arrivato, sotto quanto manca')}
        <th scope="col"></th></tr></thead>
      <tbody>${lines}</tbody>
      <tfoot><tr class="rfq-cmp-total"><td colspan="3" style="text-align:right">Totale imponibile</td><td>${fmtN(total)}</td><td colspan="3"></td></tr></tfoot>
    </table></div>
    ${docExportBarHtml({ etichetta: "Documento d'ordine:", cls: 'order-export-btn', pdf: `exportOrderPDF('${id}')`, xls: `exportOrderExcel('${id}')`, dirty: orderDirty, cosa: "l'ordine", kind: 'order', rec: o })}
  </div>`;
}

function exportOrderPDF(id, modo) {
  const o = getOrder(id); if (!o) return;
  if (!(o.lines || []).length) { showToast('Nessuna riga da esportare', 'error'); return; }
  const jsPDF = requirePdf(); if (!jsPDF) return;
  const hasSup = (o.lines || []).some(l => lineSupInfo(o.supplierId, l));
  const doc = new jsPDF({ orientation: 'landscape' });
  // Il QR in alto a destra apre la scheda rapida dell'ordine (qr.js): chi riceve
  // la merce inquadra la copia stampata e registra il ricevimento da lì.
  if (o.number) qrPdfDraw(doc, qrLink('oda', o.number), doc.internal.pageSize.getWidth() - 14 - 22, 5, 22);
  const startY = docPdfTesta(doc, { titolo: 'Ordine di acquisto / Purchase Order', rec: o,
    chi: 'RICHIEDENTE / BUYER', controparte: 'FORNITORE / SUPPLIER', vuota: '(fornitore non selezionato / not selected)' });
  const head = hasSup
    ? ['#', 'Codice\nCode', 'Descrizione\nDescription', 'Cod. forn.\nSuppl. code', 'Descr. forn.\nSuppl. desc.', 'Q.tà\nQty', 'Prezzo unit.\nUnit price', 'Importo\nAmount', 'Data consegna\nDelivery date']
    : ['#', 'Codice\nCode', 'Descrizione\nDescription', 'Q.tà\nQty', 'Prezzo unit.\nUnit price', 'Importo\nAmount', 'Data consegna\nDelivery date'];
  const body = (o.lines || []).map((l, i) => {
    const si = lineSupInfo(o.supplierId, l);
    const qty = Number(l.qty) || 0, price = (l.price === '' || l.price == null) ? null : Number(l.price);
    const tail = [(fmtQtyIt(qty) + ' ' + (l.uom || '')).trim(),
      price != null ? fmtPrezzo(price) + (l.uom ? '/' + l.uom : '') : '',
      price != null ? fmtN(importoRiga(l)) : '', fmtDateIt(l.deliveryDate)];
    return hasSup ? [i + 1, l.code || '', lineDescDoc(l), si ? si.code : '', si ? si.desc : '', ...tail] : [i + 1, l.code || '', lineDescDoc(l), ...tail];
  });
  const totLabel = { content: 'Totale / Total', styles: { halign: 'right', fontStyle: 'bold' } };
  const totVal = { content: fmtN(orderTotal(o)), styles: { fontStyle: 'bold' } };
  const foot = hasSup ? [['', '', '', '', '', '', totLabel, totVal, '']] : [['', '', '', '', totLabel, totVal, '']];
  doc.autoTable({ startY, head: [head], body, foot, styles: { fontSize: 8 }, headStyles: { fillColor: [58, 123, 232] }, footStyles: { fillColor: [235, 238, 245], textColor: 20 } });
  doc.setTextColor(80); doc.setFontSize(9);
  // Solo o.notes: le note interne (notesInternal) non escono mai sul documento.
  docCoda(doc, [
    { etichetta: 'Trasporto / Shipping', testo: o.transport },
    { etichetta: 'Pagamento / Payment', testo: o.payment },
    { etichetta: 'Conferma fornitore / Order confirmation', testo: o.supplierConfirmation },
    { etichetta: 'Note / Notes', testo: o.notes },
  ], doc.lastAutoTable.finalY + 8);
  return docPdfEmetti('order', o, doc, { ripiego: 'ordine', modo, stato: 'inviato', rerender: renderOrders,
    domanda: `PDF generato.\nSegnare l'ordine ${o.number} come inviato?` });
}

function exportOrderExcel(id) {
  const o = getOrder(id); if (!o) return;
  if (!(o.lines || []).length) { showToast('Nessuna riga da esportare', 'error'); return; }
  const data = docXlsTesta({ titolo: 'Ordine di acquisto / Purchase Order', rec: o, chi: 'RICHIEDENTE', controparte: 'FORNITORE', voci: [
    ['Da richiesta', o.rfqId && getRfq(o.rfqId) ? getRfq(o.rfqId).number : ''],
    ['Trasporto / Shipping', o.transport], ['Pagamento / Payment', o.payment],
    ['Conferma fornitore / Order confirmation', o.supplierConfirmation]] });
  const hasSup = (o.lines || []).some(l => lineSupInfo(o.supplierId, l));
  // Nel foglio i numeri restano numeri: la valuta si dichiara in intestazione,
  // l'unità sta nella sua colonna e vale per q.tà, ricevuto e residuo.
  const hPrezzo = `Prezzo unitario (${cur()}/U.M.)`, hImporto = `Importo (${cur()})`;
  data.push(hasSup
    ? ['#', 'Codice', 'Descrizione', 'Codice fornitore', 'Descrizione fornitore', 'Q.tà', 'U.M.', hPrezzo, hImporto, 'Consegna', 'Ricevuto', 'Residuo', 'Nota']
    : ['#', 'Codice', 'Descrizione', 'Q.tà', 'U.M.', hPrezzo, hImporto, 'Consegna', 'Ricevuto', 'Residuo', 'Nota']);
  (o.lines || []).forEach((l, i) => {
    const si = lineSupInfo(o.supplierId, l);
    const qty = Number(l.qty) || 0, price = (l.price === '' || l.price == null) ? '' : Number(l.price);
    const amount = price === '' ? '' : importoRiga(l);
    const rec = Number(l.received) || 0;
    const supCols = hasSup ? [si ? si.code : '', si ? si.desc : ''] : [];
    data.push([i + 1, l.code || '', l.description, ...supCols, qty, l.uom || '', price, amount, fmtDateIt(l.deliveryDate), rec, qty - rec, l.note || '']);
  });
  data.push([]);
  data.push(['', 'TOTALE IMPONIBILE / TOTAL', orderTotal(o)]);
  if (!docXlsSalva(data, o, 'Ordine', 'ordine')) return;
  askMarkSent(o, `Excel generato.\nSegnare l'ordine ${o.number} come inviato?`, 'inviato', renderOrders);
}

// ═══════════════════════════════════════════════════════════
//  ORDINI DI LAVORO (ODL) — conto lavoro
// ═══════════════════════════════════════════════════════════
// Le lavorazioni affidate a un terzista. Un ordine d'acquisto compra della
// merce, un ordine di lavoro manda dei pezzi a lavorare: due documenti diversi,
// due numerazioni, due elenchi. Tenerli insieme costringeva ogni conto — il
// totale acquistato, il carico di magazzino, la copertura di commessa — a
// filtrare per un campo, ed è il tipo di distinzione che prima o poi qualcuno
// dimentica in uno dei posti.
//
// Quello che invece **si riusa per intero** è la macchina dei documenti: stati,
// blocchi per stato, salvataggio differito, righe, ricevimenti, guardie di
// ruolo. Sta tutta in DOC_KINDS, e l'ODL è la terza voce di quel registro.
function getOdl(id) { return (db.workOrders || []).find(o => o.id === id); }
function odlMode(o) { return docMode('odl', o); }
function odlGuard(id, kind) { return docGuard('odl', id, kind); }
function odlUnlock(id) { return docUnlock('odl', id); }
function odlTotal(o) { return totaleRighe(o.lines); }
// Progressivo per anno: ODL-<anno>-NNN. Numerazione **sua**: un ODL e un ODA
// dello stesso giorno non devono avere lo stesso numero, o al telefono col
// terzista non si capisce di quale documento si stia parlando.
function nextOdlNumber() { return numeroProgressivo('ODL'); }

function renderOdl() {
  const host = document.getElementById('view-odl'); if (!host) return;
  if (odlView === 'edit' && !getOdl(currentOdlId)) { odlView = 'list'; currentOdlId = null; }
  const o = odlView === 'edit' ? getOdl(currentOdlId) : null;
  const tutti = db.workOrders || [];
  host.innerHTML = worklistHtml({
    titolo: 'Ordini di lavoro', icona: 'wrench', listaId: 'odl-list',
    comandi: `<button class="add-btn-sm" onclick="newOdl()">+ Nuovo ordine di lavoro</button>
      ${listExportButtons('odlListExportSpec')}`,
    filtri: docFilterBar('odl', ORDER_STATUS, docFilterApply('odl', tutti).length, tutti.length),
    righe: odlListRows(),
    doc: o ? renderOdlEdit(currentOdlId) : '',
    vuoto: {
      titolo: 'Nessun ordine di lavoro aperto qui',
      testo: 'Scegli un ordine dall\'elenco a destra. Gli ordini di lavoro nascono dal Fabbisogno o da un ordine di produzione, dalle fasi di ciclo affidate a un terzista, oppure si scrivono a mano: al centro compaiono le lavorazioni con la tariffa, la data e i pezzi rientrati.',
      comandi: '<button class="add-btn-sm" onclick="newOdl()">+ Nuovo ordine di lavoro</button>',
    },
  });
  if (o) applyDocLock(odlMode(o), host);
  a11yFields(host);
}
function odlListRows() {
  const tutti = db.workOrders || [];
  const list = docFilterApply('odl', tutti.slice().sort((a, b) => (b.number || '').localeCompare(a.number || '')));
  return list.map(o => {
    const sup = o.supplierId ? supplierName(o.supplierId) : '— nessun terzista —';
    const rec = orderReception(o);
    const recTxt = rec.ordered ? `rientr. ${fmtQtyIt(rec.received)}/${fmtQtyIt(rec.ordered)}` : '';
    return worklistRow({
      numero: o.number,
      badge: statusBadge(ORDER_STATUS, o.status),
      titolo: o.title || '',
      meta: `${esc(sup)} · ${fmtN(odlTotal(o))}${recTxt ? ' · ' + recTxt : ''}${o.date ? ' · ' + esc(fmtDateIt(o.date)) : ''}`,
      sel: odlView === 'edit' && currentOdlId === o.id,
      spenta: o.status === 'annullato',
      azione: `openOdlEdit('${o.id}')`,
      etichetta: `Apri l'ordine di lavoro ${o.number}`,
    });
  }).join('') || `<div class="empty-text">${tutti.length ? 'Nessun ordine di lavoro con questi filtri.' : 'Nessun ordine di lavoro. Si generano dal Fabbisogno o da un ordine di produzione, dalle fasi affidate a un terzista, oppure si scrivono a mano con «+ Nuovo ordine di lavoro».'}</div>`;
}
function newOdl() {
  if (!roleGuard('docs')) return;
  return conNumeri({ ODL: 1 }, () => {
    const o = Store.insert('workOrders', { id: gid(), number: nextOdlNumber(), title: '', date: oggiISO(),
      status: 'bozza', supplierId: null, transport: db.settings.transportDefault || '', payment: db.settings.paymentDefault || '',
      rfqId: null, planId: null, jobId: null, supplierConfirmation: '', notes: '', notesInternal: '', lines: [], active: true });
    docLeave('odl'); currentOdlId = o.id; odlView = 'edit'; renderOdl();
  });
}
function openOdlEdit(id) { if (!vistaAttiva('odl')) return; docLeave('odl'); currentOdlId = id; odlView = 'edit'; renderOdl(); }
function odlBackToList() { docBackToList('odl'); }
function odlMarkDirty() { docMarkDirty('odl'); }
function odlSave(id) { docSave('odl', id); }
function odlSetField(id, field, value) { docSetField('odl', id, field, value); }
function odlSetSupplier(id, sid) { docSetSupplier('odl', id, sid); }
function odlSetLine(id, lineId, field, value) { docSetLine('odl', id, lineId, field, value); }
// Una riga avviata o con dei rientri ha mosso il magazzino: toglierla
// lascerebbe i suoi movimenti senza un documento che li spieghi.
function odlDelLine(id, lineId) {
  const o = getOdl(id), l = o && (o.lines || []).find(x => x.id === lineId);
  if (l && odlEventiRiga(o, l).length) { showToast('Questa lavorazione è già avviata: annulla prima avvio e rientri, nello storico qui sotto', 'error'); return; }
  docDelLine('odl', id, lineId);
}
function odlAddManualLineModal(id) { docAddManualLineModal('odl', id); }
function odlAddManualLine(id) { docAddManualLine('odl', id); }
function odlEditLineModal(id, lineId) { docEditLineModal('odl', id, lineId); }
function odlSaveLineEdit(id, lineId) { docSaveLineEdit('odl', id, lineId); }
function odlListExportSpec() { return docListExportSpec('odl'); }
function delOdl(id) {
  if ((db.prodDecls || []).some(d => d.odlId === id)) { showToast('Su questo ordine di lavoro ci sono avvii o rientri: annullalo invece di eliminarlo, o annulla prima quelli', 'error'); return; }
  docDel('odl', id);
}
// ═══════════════════════════════════════════════════════════
//  AVVIA E DICHIARA SULLA RIGA (dalla 0.116.0)
// ═══════════════════════════════════════════════════════════
// Gli stessi due gesti dell'ordine di produzione, qualunque sia l'origine
// della riga. Prima l'ordine di lavoro aveva quattro comandi suoi — spedisci
// materiale, manda al terzista, ritira dal terzista, registra rientro — che
// scrivevano movimenti e basta: niente scarti, niente stato, e i pezzi
// rientrati da scrivere a mano una seconda volta.
//
// **Un solo padrone per tratta.** Se la riga viene da un ordine di produzione,
// o dal fabbisogno di un piano che ne ha lanciato uno per quella parte, il
// padrone è l'ODP: avvia e dichiara aprono le sue schede e scrivono le sue
// dichiarazioni, e lo stesso gesto non si può registrare due volte da due
// documenti. Altrimenti il padrone è la riga, che porta eventi propri nella
// stessa collezione dell'ODP (`prodDecls`, con `odlId` e `odlLineId`).
//
// Il magazzino si muove come prima, ai due estremi del ciclo: l'avvio della
// prima tratta esterna fa uscire il materiale (clOut), la dichiarazione
// dell'ultima carica il codice della parte (clIn); in mezzo i pezzi passano e
// basta (clStep). Una riga scritta a mano, senza ciclo, non muove niente.
const ODL_EV_ETICHETTA = { avvio: 'Avvio', avanzamento: 'Rientro' };
function odlEventiRiga(o, l, opz) {
  const ev = (db.prodDecls || []).filter(d => d.odlId === o.id && d.odlLineId === l.id)
    .slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  if (!(opz && opz.conVecchi)) return ev;
  // I movimenti registrati con i comandi di prima non hanno una dichiarazione
  // che li spieghi: valgono come un avvio e un rientro senza data, e nessun
  // dato di prima va migrato per continuare a contare.
  const vecchi = (db.movements || []).filter(m => m.orderId === o.id && m.lineId === l.id && !m.declId && isContoLavoroKind(m.kind));
  const prima = [];
  if (vecchi.some(odlMovUscita) && !ev.some(d => d.kind === 'avvio')) prima.push({ kind: 'avvio', vecchio: true, note: '' });
  const dichiarati = ev.reduce((t, d) => t + (d.kind === 'avanzamento' ? (Number(d.qty) || 0) + (Number(d.scrap) || 0) : 0), 0);
  const tornati = vecchi.filter(m => !odlMovUscita(m)).reduce((t, m) => t + Math.abs(Number(m.qty) || 0), 0);
  const resto = Math.max(tornati, (Number(l.received) || 0) - dichiarati);
  const dopo = resto > 0.000001 ? [{ kind: 'avanzamento', vecchio: true, qty: resto, scrap: 0, note: '' }] : [];
  return prima.concat(ev, dopo);
}
function odlMovUscita(m) { return m.kind === 'clOut' || (m.kind === 'clStep' && !m.fromSupplierId); }
// La riga ha mosso qualcosa da sé: eventi suoi, o movimenti dei comandi di
// prima. I soli rientrati scritti a mano non contano — non hanno mosso niente,
// e passata la tratta all'ODP resterebbero lì a sembrare eventi da prendere.
function odlHaEventiPropri(o, l) {
  return (db.prodDecls || []).some(d => d.odlId === o.id && d.odlLineId === l.id)
    || (db.movements || []).some(m => m.orderId === o.id && m.lineId === l.id && !m.declId && isContoLavoroKind(m.kind));
}
// Dove sta la riga nella sua tratta. Un ordine di lavoro di prima delle tratte
// ha una riga per fase: si avvia dalla prima e si dichiara dall'ultima, e i
// rientrati valgono per tutte (`sorelle`). Una riga senza ciclo è libera: si
// avvia e si dichiara lei, senza magazzino.
function odlAncore(o, l) {
  const ruolo = l.phaseKey ? clLineRole(o, l) : null;
  if (!ruolo || !ruolo.prima) {
    return { libera: true, prima: l, ultima: l, sorelle: [l], apre: true, chiude: true, outKind: '', inKind: '', part: null };
  }
  return { libera: false, prima: ruolo.prima, ultima: ruolo.ultima, sorelle: ruolo.sorelle.length ? ruolo.sorelle : [l],
    apre: ruolo.out, chiude: ruolo.in, outKind: ruolo.outKind, inKind: ruolo.inKind, part: ruolo.part };
}
// Il legame che decide il padrone. Una riga del piano che è partita da sola
// prima del lancio dell'ODP resta sua finché l'ODP è in bozza: al lancio i suoi
// eventi passano all'ODP (opRilevaOdl).
function odlLegameAttivo(o, l) {
  if (typeof opLegameRigaOdl !== 'function') return null;
  const leg = opLegameRigaOdl(o, l);
  if (!leg) return null;
  if (leg.dalPiano && leg.odp.status === 'bozza' && odlHaEventiPropri(o, l)) return null;
  return leg;
}
function odlRigaAvviata(o, l) {
  const p = odlAncore(o, l).prima;
  return odlEventiRiga(o, p, { conVecchi: true }).some(d => d.kind === 'avvio');
}
function odlRigaResta(l) { return Math.max(0, (Number(l.qty) || 0) - (Number(l.received) || 0)); }
// In bozza l'ordine non è ancora arrivato al terzista: il materiale non parte.
function odlNonAvviabile(o) {
  if (o.status === 'bozza') return "l'ordine è in bozza: segnalo come inviato prima di mandare il materiale";
  if (o.status === 'annullato') return "l'ordine è annullato";
  return '';
}
// Cosa esce all'avvio: il materiale del ciclo all'inizio della prima tratta
// esterna, altrimenti i pezzi stessi. Al netto di quanto è già uscito.
function odlMaterialeProposto(o, l) {
  const a = odlAncore(o, l);
  if (a.libera || !a.apre) return [];
  const pezzi = Number(l.qty) || 0;
  const righe = a.outKind === 'clStep'
    ? (a.part && hasStock(a.part) ? [{ item: a.part, perPezzo: 1, qty: pezzi }] : [])
    : (typeof sostituzioniMateriali === 'function' ? sostituzioniMateriali(o.planId, clMaterialsOf(a.part, pezzi)) : clMaterialsOf(a.part, pezzi));
  const gia = clRegistrato(o, l, 'out');
  return righe.map(x => Object.assign({}, x, { gia: gia.get(x.item.id) || 0, residuo: Math.max(0, x.qty - (gia.get(x.item.id) || 0)) }));
}
function odlRigaDi(docId, lineId) {
  const o = getOdl(docId); if (!o) return null;
  const l = (o.lines || []).find(x => x.id === lineId);
  return l ? { o, l } : null;
}
function odlNuovoEvento(o, l, kind, extra) {
  return Store.insert('prodDecls', Object.assign({
    id: gid(), odpId: null, phaseId: null, odlId: o.id, odlLineId: l.id, kind,
    date: nowISO(), qty: 0, scrap: 0, note: '', motivo: '',
  }, extra || {}));
}
// I rientrati si muovono insieme su tutte le righe della tratta, e passano da
// registraRicevuto: nell'archivio condiviso sono una somma di eventi.
function odlSpostaRientrati(o, righe, delta) {
  righe.forEach(s => {
    const qty = Number(s.qty) || 0;
    registraRicevuto('workOrders', o, s, Math.min(qty, Math.max(0, (Number(s.received) || 0) + delta)));
  });
}

// ─── I mutatori ───
// `opz.materiali` [{ itemId, qty }]: senza, esce il residuo proposto.
function odlAvvia(docId, lineId, opz) {
  if (!odlGuard(docId, 'reception')) return false;
  const x = odlRigaDi(docId, lineId); if (!x) return false;
  const { o, l } = x;
  if (odlLegameAttivo(o, l)) { showToast('Questa lavorazione si avvia dall\'ordine di produzione', 'error'); return false; }
  const blocco = odlNonAvviabile(o);
  if (blocco) { showToast('Non si può avviare: ' + blocco, 'error'); return false; }
  const a = odlAncore(o, l);
  if (!a.apre) { showToast(`Questa lavorazione si avvia dalla riga della fase ${cyclePhaseNumber(clPhaseIndex(a.prima))}`, 'error'); return false; }
  if (odlRigaAvviata(o, l)) { showToast('La lavorazione è già avviata', 'error'); return false; }
  const opzioni = opz || {};
  const note = String(opzioni.note || '').trim();
  // L'id nasce dall'ordine e dalla riga, come l'avvio di una fase: due colleghi
  // che avviano la stessa riga prima di vedersi scrivono lo stesso avvio.
  const avvio = odlNuovoEvento(o, l, 'avvio', { id: idDaChiaveLibero(`odlavvio|${o.id}|${l.id}`, 'prodDecls'), note });
  const righe = opzioni.materiali || odlMaterialeProposto(o, l).map(m => ({ itemId: m.item.id, qty: m.residuo }));
  righe.forEach((r, i) => {
    const q = Number(r.qty) || 0;
    if (!(q > 0) || !a.outKind) return;
    const extra = { orderId: o.id, lineId: l.id, declId: avvio.id, supplierId: o.supplierId,
      id: idDaChiaveLibero(`odlavvio|${avvio.id}|${i}|${r.itemId}`, 'movements') };
    if (a.outKind === 'clStep') addMovement(r.itemId, 'clStep', q, note || `Pezzi al terzista per ${o.number}`, extra);
    else addMovement(r.itemId, 'clOut', -q, note || `Materiale per ${o.number}`, extra);
  });
  touch(o); saveDB();
  return true;
}
function odlDichiara(docId, lineId, dati) {
  if (!odlGuard(docId, 'reception')) return false;
  const x = odlRigaDi(docId, lineId); if (!x) return false;
  const { o, l } = x;
  if (odlLegameAttivo(o, l)) { showToast('I pezzi di questa lavorazione si dichiarano sull\'ordine di produzione', 'error'); return false; }
  const a = odlAncore(o, l);
  if (!a.chiude) { showToast(`Questa lavorazione si dichiara dalla riga della fase ${cyclePhaseNumber(clPhaseIndex(a.ultima))}`, 'error'); return false; }
  if (!odlRigaAvviata(o, l)) { showToast('La lavorazione non è stata avviata', 'error'); return false; }
  const d = dati || {};
  const qty = Math.max(0, Number(d.qty) || 0);
  const scrap = Math.max(0, Number(d.scrap) || 0);
  if (!(qty > 0) && !(scrap > 0)) { showToast('Niente da dichiarare: pezzi e scarti sono a zero', 'error'); return false; }
  const motivo = scrap > 0 ? String(d.motivo || '').trim() : '';
  if (typeof qcScartoMotivoOk === 'function' && !qcScartoMotivoOk(scrap, motivo)) return false;
  const note = String(d.note || '').trim();
  const decl = odlNuovoEvento(o, l, 'avanzamento', { qty, scrap, note, motivo });
  // Lo scarto del terzista apre la NC verso di lui (dalla 0.144.0).
  if (scrap > 0 && typeof ncDaScarto === 'function') ncDaScarto({ odl: o, riga: l }, a.part ? a.part.id : (l.itemId || null), scrap, motivo, decl.id);
  if (qty > 0 && a.part && hasStock(a.part) && a.inKind) {
    const extra = { orderId: o.id, lineId: l.id, declId: decl.id };
    if (a.inKind === 'clStep') { extra.fromSupplierId = o.supplierId; addMovement(a.part.id, 'clStep', qty, note || `Pezzi dal terzista per ${o.number}`, extra); }
    else {
      extra.supplierId = o.supplierId;
      addMovement(a.part.id, 'clIn', qty, note || `Rientro da ${o.number}`, extra);
      // I pezzi lavorati fuori sono il caso in cui un controllo in entrata
      // serve di più: il terzista ha lavorato roba nostra su disegno nostro.
      if (typeof qcDopoRientro === 'function') qcDopoRientro(o, l, a.part, qty);
    }
  }
  odlSpostaRientrati(o, a.sorelle, qty + scrap);
  ordAutoStatus(o); touch(o); saveDB();
  return true;
}
// Un avvio si annulla finché la riga non ha rientri; un rientro sempre. Con
// l'evento se ne vanno **i suoi** movimenti, e i rientrati tornano indietro.
function odlEventoAnnullabile(o, d) {
  if (!o || !d || (d.kind !== 'avvio' && d.kind !== 'avanzamento')) return { ok: false, motivo: 'questo evento non si annulla' };
  const l = (o.lines || []).find(x => x.id === d.odlLineId);
  if (d.kind === 'avvio' && l && odlEventiRiga(o, odlAncore(o, l).ultima, { conVecchi: true }).some(x => x.kind === 'avanzamento')) {
    return { ok: false, motivo: 'la lavorazione ha già dei rientri: annulla prima quelli' };
  }
  return { ok: true };
}
function odlAnnullaEvento(declId) {
  const d = (db.prodDecls || []).find(x => x.id === declId); if (!d || !d.odlId) return false;
  if (!odlGuard(d.odlId, 'reception')) return false;
  const o = getOdl(d.odlId); if (!o) return false;
  const ok = odlEventoAnnullabile(o, d);
  if (!ok.ok) { showToast(`Non si può annullare: ${ok.motivo}`, 'error'); return false; }
  (db.movements || []).filter(m => m.declId === declId).forEach(m => Store.remove('movements', m.id));
  if (typeof ncScartoAnnulla === 'function') ncScartoAnnulla(declId);
  Store.remove('prodDecls', declId);
  const l = (o.lines || []).find(x => x.id === d.odlLineId);
  if (l && d.kind === 'avanzamento') odlSpostaRientrati(o, odlAncore(o, l).sorelle, -((Number(d.qty) || 0) + (Number(d.scrap) || 0)));
  ordAutoStatus(o); touch(o); saveDB();
  return true;
}
// «Dichiara tutto rientrato»: il residuo di ogni riga avviata, come pezzi
// buoni. Prima segnava i rientrati senza movimenti, e il codice non si
// caricava mai: era la strada che saltava il magazzino.
function odlMarkAllReceived(id) {
  if (!odlGuard(id, 'reception')) return false;
  const o = getOdl(id); if (!o) return false;
  let fatte = 0, daOdp = 0, ferme = 0;
  (o.lines || []).forEach(l => {
    if (odlLegameAttivo(o, l)) { daOdp++; return; }
    const a = odlAncore(o, l);
    if (!a.chiude) return;
    const resta = odlRigaResta(l);
    if (!(resta > 0.000001)) return;
    if (!odlRigaAvviata(o, l)) { ferme++; return; }
    if (odlDichiara(id, l.id, { qty: resta })) fatte++;
  });
  renderOdl();
  const avvisi = [];
  if (ferme) avvisi.push(`${ferme} ${ferme === 1 ? 'riga non è avviata' : 'righe non sono avviate'}`);
  if (daOdp) avvisi.push(`${daOdp} ${daOdp === 1 ? 'riga si dichiara' : 'righe si dichiarano'} sull'ordine di produzione`);
  if (avvisi.length) showToast(avvisi.join(' · '), 'error');
  return fatte > 0;
}

// ─── I comandi sotto la riga ───
function odlLink(azione, testo, titolo) {
  return `<span class="plandoc-link plandoc-link-sm" ${clickAttrs(azione, titolo)}>${esc(testo)}</span>`;
}
function odlLineActions(o, l) {
  const leg = odlLegameAttivo(o, l);
  if (leg) return odlAzioniDaOdp(o, l, leg);
  const a = odlAncore(o, l);
  const fase = x => 'fase ' + cyclePhaseNumber(clPhaseIndex(x));
  // Una riga in mezzo a una tratta di un ordine di prima non ha comandi: dice
  // dove sono, invece di sembrare un difetto.
  if (!a.apre && !a.chiude) {
    return `<div class="line-cl-actions"><span title="Le fasi della stessa tratta si avviano dalla prima riga e si dichiarano dall'ultima.">${ico('factory', 'tinted', '')} si avvia alla ${esc(fase(a.prima))}, si dichiara alla ${esc(fase(a.ultima))}</span></div>`;
  }
  const avviata = odlRigaAvviata(o, l);
  const cmd = [];
  if (!avviata) {
    if (a.apre) {
      const blocco = odlNonAvviabile(o);
      if (blocco) cmd.push(`<span class="empty-text" style="padding:0">${esc(blocco)}</span>`);
      else cmd.push(odlLink(`odlAvviaModal('${o.id}','${l.id}')`, 'avvia', a.libera ? 'Avvia la lavorazione: il magazzino non si muove'
        : a.outKind === 'clStep' ? 'Avvia la lavorazione e manda i pezzi al terzista: non tocca il magazzino'
          : 'Avvia la lavorazione e manda il materiale del ciclo al terzista: esce dal magazzino'));
    } else cmd.push(`<span class="empty-text" style="padding:0">si avvia alla ${esc(fase(a.prima))}</span>`);
  } else if (a.chiude && odlRigaResta(l) > 0.000001) {
    cmd.push(odlLink(`odlDichiaraModal('${o.id}','${l.id}')`, 'dichiara', a.libera ? 'Dichiara i pezzi tornati e gli scarti'
      : a.inKind === 'clStep' ? 'Dichiara i pezzi tornati e gli scarti: restano in lavorazione, il magazzino non si muove'
        : 'Dichiara i pezzi tornati e gli scarti: i buoni entrano a magazzino col codice della parte'));
  }
  if (!cmd.length) return '';
  // Dove il gesto non tocca il magazzino si dice perché: un comando che sembra
  // un carico e non carica fa perdere fiducia in una giacenza.
  const note = [];
  if (!a.libera) {
    if (a.apre && !a.chiude) note.push('si dichiara alla ' + fase(a.ultima));
    if (a.outKind === 'clStep' && a.inKind === 'clStep') note.push('passaggio di lavorazione: il magazzino non si muove');
    else if (!avviata && a.outKind === 'clStep') note.push('il materiale era gi&agrave; uscito');
    else if (avviata && a.inKind === 'clStep') note.push('il codice si carica alla fine del ciclo');
  }
  const nota = note.length ? ` <span class="empty-text" style="padding:0">· ${note.join(' · ')}</span>` : '';
  return `<div class="line-cl-actions">${ico('factory', 'tinted', '')}${cmd.join('')}${nota}</div>`;
}
// La riga di un ODP: gli stessi comandi, che aprono le schede delle sue fasi.
function odlAzioniDaOdp(o, l, leg) {
  const { odp, fasi } = leg;
  const prima = fasi[0];
  const rimando = `<span class="plandoc-link plandoc-link-sm" ${clickAttrs(`openOdpFromOdl('${odp.id}')`,
    'Apri l\'ordine di produzione: avvio e rientri di questa lavorazione sono suoi')}>${esc(odp.number)} › fase ${esc(fasi.map(f => f.seq).join('-'))}</span>`;
  const cmd = [];
  const stato = odpAvanzamentoTratta(odp, prima);
  if (odp.status === 'bozza') cmd.push('<span class="empty-text" style="padding:0">l\'ordine di produzione è in bozza: va lanciato</span>');
  else if (stato === 'fatto') cmd.push('<span class="empty-text" style="padding:0">rientrata</span>');
  else if (!opAvviata(odp, prima)) {
    const st = opStatoFase(odp, prima);
    if (st === 'avviabile') {
      cmd.push(odlLink(`odlAvviaModal('${o.id}','${l.id}')`, 'avvia', opEPrima(odp, prima)
        ? 'Avvia la fase sull\'ordine di produzione e manda il materiale del ciclo al terzista: esce dal magazzino'
        : 'Avvia la fase sull\'ordine di produzione. Il magazzino non si muove: i pezzi sono già fuori dallo scaffale'));
    } else {
      const blocco = opAvviabile(odp, prima);
      cmd.push(`<span class="empty-text" style="padding:0">${esc(blocco.motivo || 'non avviabile')}</span>`);
      if (blocco.fase) cmd.push(odlLink(`opForzaModal('${odp.id}','${prima.id}')`, 'forza avvio', 'Avvia comunque, dichiarando il motivo: resta scritto nello storico dell\'ordine di produzione'));
    }
  } else {
    const ultima = fasi[fasi.length - 1];
    cmd.push(odlLink(`odlDichiaraModal('${o.id}','${l.id}')`, 'dichiara', opEUltima(odp, ultima)
      ? 'Dichiara i pezzi tornati e gli scarti sull\'ordine di produzione: i buoni entrano a magazzino col codice della parte'
      : 'Dichiara i pezzi tornati e gli scarti sull\'ordine di produzione'));
  }
  return `<div class="line-cl-actions">${ico('factory', 'tinted', '')}${cmd.join('')} ${rimando}</div>`;
}

// ─── Le schede ───
function odlTestaModal(o, l, titolo) {
  return `<h3>${ico('factory', 'tinted pill', '')} ${esc(titolo)}</h3>
    <p>${esc(o.number)} · <strong>${esc(supplierName(o.supplierId) || '')}</strong> — ${esc(((l.code || '') + ' ' + (l.description || '')).trim())}, ${fmtQtyIt(Number(l.qty) || 0)} ${esc(l.uom || 'pz')}</p>`;
}
function odlAvviaModal(docId, lineId) {
  const x = odlRigaDi(docId, lineId); if (!x) return;
  const { o, l } = x;
  if (!roleGuardShop('docs')) return;
  const leg = odlLegameAttivo(o, l);
  if (leg) {
    if (opRilevaOdl(leg.odp)) { odpAutoStatus(leg.odp); touch(leg.odp); saveDB(); }
    if (opAvviata(leg.odp, leg.fasi[0])) { renderOdl(); return; }
    opAvviaModal(leg.odp.id, leg.fasi[0].id);
    return;
  }
  const a = odlAncore(o, l);
  const righe = odlMaterialeProposto(o, l);
  window.__odlAvviaMat = righe.map(m => m.item.id);
  window.__odlAvviaKind = a.outKind;
  const passo = a.outKind === 'clStep';
  const corpo = righe.map((m, i) => `<div class="mgmt-item">
      <span style="width:110px;font-family:var(--mono)">${esc(m.item.code || '')}</span>
      <span style="flex:1">${esc(m.item.name || '')}${passo ? '' : ` <span class="empty-text" style="padding:0">${fmtQtyIt(m.perPezzo)} ${esc(itemUom(m.item))}/pz${giacenzeVisibili() ? ` · a magazzino ${fmtQtyIt(onHandOf(m.item.id))}` : ''}</span>`}${m.gia ? ` <span class="rfq-clavoro-tag">già ${fmtQtyIt(+m.gia.toFixed(4))}</span>` : ''}</span>
      <input class="num" type="number" id="odl-a-q-${i}" min="0" step="any" value="${+m.residuo.toFixed(4)}" style="width:110px" oninput="odlAvviaAvviso()">
      <span class="empty-text" style="padding:0;width:40px">${esc(itemUom(m.item))}</span>
    </div>`).join('');
  const spiega = a.libera
    ? 'Questa riga non viene da un ciclo: l&rsquo;avvio dice che la lavorazione è partita, e il magazzino <strong>non si muove</strong>.'
    : passo
      ? 'È un <strong>passaggio di lavorazione</strong>: i pezzi tornati dalla fase precedente vanno al terzista e <strong>il magazzino non si muove</strong>. Il materiale era già uscito all&rsquo;inizio del ciclo.'
      : righe.length
        ? 'Il materiale del <strong>ciclo</strong>, per i pezzi della riga, <strong>esce dal magazzino</strong> e va dal terzista: il prospetto <em>presso terzi</em> dice da chi sta. Esce <strong>una volta sola</strong>, qui.'
        : 'Il ciclo di questa parte non ha materiale a magazzino, o è già uscito tutto: l&rsquo;avvio dice solo che la lavorazione è partita.';
  openModal(`${odlTestaModal(o, l, 'Avvia la lavorazione')}
    ${corpo ? `<h4 class="settings-group-title">${passo ? 'Pezzi che vanno al terzista' : 'Materiale che esce, dal ciclo della parte'}</h4>
      <div style="display:flex;flex-direction:column;gap:6px">${corpo}</div>
      ${passo ? '' : `<div id="odl-a-avviso">${avvisoSottoZeroHtml(righe.map(m => ({ itemId: m.item.id, qty: m.residuo })))}</div>`}` : ''}
    <p class="empty-text" style="text-align:left;padding:8px 0">${spiega}</p>
    <div class="modal-field"><label>Nota</label><input id="odl-a-note" placeholder="es. bolla 412" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="odlAvviaSave('${esc(docId)}','${esc(lineId)}')">Avvia</button>
    </div>`, !!corpo, 'form');
}
function odlAvviaRighe() { return (window.__odlAvviaMat || []).map((itemId, i) => ({ itemId, qty: rawNum('odl-a-q-' + i) })); }
function odlAvviaAvviso() { const el = document.getElementById('odl-a-avviso'); if (el) el.innerHTML = avvisoSottoZeroHtml(odlAvviaRighe()); }
function odlAvviaSave(docId, lineId) {
  const materiali = odlAvviaRighe();
  const sotto = window.__odlAvviaKind === 'clOut' ? avvisoSottoZero(materiali) : [];
  if (!odlAvvia(docId, lineId, { materiali, note: val('odl-a-note') })) return;
  closeModal(); renderOdl();
  if (sotto.length) showToast('Lavorazione avviata, ma l\'esistente va sotto zero: ' + sotto.join('; '), 'error');
  else showToast('Lavorazione avviata');
}
function odlDichiaraModal(docId, lineId) {
  const x = odlRigaDi(docId, lineId); if (!x) return;
  const { o, l } = x;
  if (!roleGuardShop('docs')) return;
  const leg = odlLegameAttivo(o, l);
  if (leg) {
    if (opRilevaOdl(leg.odp)) { odpAutoStatus(leg.odp); touch(leg.odp); saveDB(); }
    opDichiaraTrattaModal(leg.odp.id, leg.fasi[0].id);
    return;
  }
  const a = odlAncore(o, l);
  const resta = odlRigaResta(l);
  const spiega = a.libera
    ? 'I pezzi tornati portano l&rsquo;ordine a parziale o evaso. Il magazzino <strong>non si muove</strong>: la riga non viene da un ciclo.'
    : a.inKind === 'clStep'
      ? 'I pezzi tornano da noi fra due tratte: <strong>non entrano a magazzino</strong>. Il codice della parte si carica una volta sola, alla fine del ciclo.'
      : `I pezzi buoni <strong>entrano a magazzino</strong> col codice <strong>${esc((a.part && a.part.code) || l.code || '')}</strong>, ed è l&rsquo;unico punto in cui si carica. Gli scarti contano come tornati, ma non si caricano.`;
  openModal(`${odlTestaModal(o, l, 'Dichiara il rientro dal terzista')}
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Pezzi della riga: <strong>${fmtQtyIt(Number(l.qty) || 0)}</strong> · già tornati: <strong>${fmtQtyIt(Number(l.received) || 0)}</strong> · restano <strong>${fmtQtyIt(resta)}</strong>.</p>
    <div class="modal-grid">
      <div class="modal-field"><label>Pezzi buoni</label>
        <input class="num" type="number" id="odl-d-qty" min="0" step="any" value="${+resta.toFixed(4)}"></div>
      <div class="modal-field"><label>Scarti</label>
        <input class="num" type="number" id="odl-d-scrap" min="0" step="any" value="0"></div>
      ${typeof qcScartoCampoHtml === 'function' ? qcScartoCampoHtml('odl-d-motivo') : ''}
    </div>
    <p class="empty-text" style="text-align:left;padding:8px 0">${spiega}</p>
    <div class="modal-field"><label>Nota</label><input id="odl-d-note" placeholder="es. bolla 412" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="odlDichiaraSave('${esc(docId)}','${esc(lineId)}')">Registra</button>
    </div>`, false, 'form');
}
function odlDichiaraSave(docId, lineId) {
  if (!odlDichiara(docId, lineId, { qty: rawNum('odl-d-qty'), scrap: rawNum('odl-d-scrap'), note: val('odl-d-note'), motivo: val('odl-d-motivo') })) return;
  closeModal(); renderOdl(); showToast('Rientro registrato');
}
function odlAnnullaEventoAsk(declId) {
  const d = (db.prodDecls || []).find(x => x.id === declId); if (!d) return;
  const domanda = d.kind === 'avvio'
    ? 'Annullare l\'avvio di questa lavorazione?\nIl materiale uscito con lui torna a magazzino, e la riga torna da avviare.'
    : `Annullare questo rientro di ${fmtQtyIt((Number(d.qty) || 0) + (Number(d.scrap) || 0))} pezzi?\nI movimenti di magazzino che ha generato vengono tolti con lui.`;
  askConfirm(domanda, () => {
    if (!odlAnnullaEvento(declId)) return;
    renderOdl(); showToast('Annullato');
  }, { title: 'Annulla', ok: 'Annulla l\'evento' });
}
// Lo storico degli avvii e dei rientri dell'ordine, come quello dell'ODP: è il
// posto dove si annulla un gesto sbagliato.
function odlDeclBlock(o) {
  const decls = (db.prodDecls || []).filter(d => d.odlId === o.id)
    .slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  if (!decls.length) return '';
  const riga = id => { const l = (o.lines || []).find(x => x.id === id); return l ? ((l.code || '') + ' ' + (l.description || '')).trim() : '—'; };
  return `<div class="mrp-section">
    <div class="cycle-section-head"><h3>${ico('clock', 'tinted pill', '')} Avvii e rientri</h3></div>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col" style="width:150px">Quando</th><th scope="col">Lavorazione</th><th scope="col" style="width:100px">Cosa</th>
        <th scope="col" style="width:80px">Pezzi</th><th scope="col" style="width:80px">Scarti</th><th scope="col">Nota</th>
        <th scope="col" style="width:60px"></th></tr></thead>
      <tbody>${decls.map(d => `<tr>
        <td>${esc(String(d.date || '').slice(0, 16).replace('T', ' '))}</td>
        <td>${esc(riga(d.odlLineId))}</td>
        <td>${esc(ODL_EV_ETICHETTA[d.kind] || d.kind)}</td>
        <td class="num">${d.qty ? fmtQtyIt(d.qty) : '—'}</td>
        <td class="num">${d.scrap ? fmtQtyIt(d.scrap) : '—'}</td>
        <td>${esc(d.note || '')}</td>
        <td>${odlEventoAnnullabile(o, d).ok
    ? `<button class="mini-btn danger lock-reception" onclick="odlAnnullaEventoAsk('${d.id}')" title="${d.kind === 'avvio'
      ? "Annulla l'avvio e rimette a magazzino il materiale uscito con lui" : 'Annulla questo rientro e i movimenti che ha generato'}">${ico('trash', 'tinted', 'Annulla')}</button>`
    : ''}</td></tr>`).join('')}</tbody>
    </table></div></div>`;
}

// ─── Una lavorazione scritta a mano, partendo dal ciclo ───
// Fin qui un ordine di lavoro nasceva solo da un piano: l'unico modo di
// riempirne uno vuoto era la riga manuale, testo libero senza `phaseKey` — e
// quindi senza tariffa dal ciclo e senza nessuno dei comandi del conto lavoro.
// Ma commissionare una lavorazione fuori piano è il caso normale: un pezzo
// urgente, un ripasso, una prova.
//
// Si parte dal **ciclo**, non da un campo vuoto: si sceglie la parte, si sceglie
// la tratta, si dicono i pezzi. La riga che ne esce è **identica** a quella
// generata dal fabbisogno — stessa fabbrica, `planPhaseDocLine` — perché una
// riga scritta a mano che si comportasse diversamente sarebbe una seconda
// specie di riga da ricordarsi.
function odlAddPhaseModal(id) {
  if (!odlGuard(id, 'contract')) return;
  catalogPickerModal(ids => odlPhasePickModal(id, ids), {
    titolo: '+ Lavorazione da ciclo',
    // Solo gli articoli che una lavorazione ce l'hanno: gli altri aprirebbero
    // una scheda vuota, e scoprirlo dopo averli scelti è il modo peggiore.
    filtro: i => cicloFasi(i).length > 0,
    vuoto: 'Nessun articolo ha un ciclo di lavorazione. Le fasi si scrivono nella scheda dell’articolo, sotto <em>Ciclo</em>.',
  });
}
// La scelta della tratta. Si vedono **tutte** — anche quelle di un altro
// terzista e quelle interne — marcate per quello che sono: mandare fuori una
// lavorazione che di solito si fa in casa è un caso vero, e l'app lo segnala
// invece di impedirlo.
function odlPhasePickModal(id, ids) {
  const o = getOdl(id); if (!o) return;
  const parti = (ids || []).map(getItem).filter(it => it && cicloFasi(it).length > 0);
  if (!parti.length) { showToast('Nessun articolo con un ciclo di lavorazione', 'error'); return; }
  const blocchi = parti.map((it, pi) => {
    const righe = clCycleRuns(it).map(t => {
      const suo = t.supplierId === o.supplierId;
      const tag = t.esterna
        ? (suo ? '' : `<span class="rfq-manual-tag" title="Il ciclo assegna questa lavorazione a un altro terzista">${esc(supplierName(t.supplierId) || 'altro terzista')}</span>`)
        : '<span class="rfq-manual-tag" title="Il ciclo la fa in casa: mettendola qui la si manda fuori questa volta">interna</span>';
      const nos = [];
      for (let k = t.from; k <= t.to; k++) nos.push(cyclePhaseNumber(k));
      const nomi = odlRunNomi(it, t);
      return `<label class="rfq-pick-row">
        <input type="checkbox" class="odl-fase" value="${esc(it.id)}#${t.from}" ${suo ? 'checked' : ''}>
        <span class="cycle-phase">${esc(nos.join('-'))}</span> ${esc(nomi)} ${tag}</label>`;
    }).join('');
    return `<h4 class="settings-group-title">${esc(it.code || '')} ${esc(it.name || '')}</h4>
      <div class="rfq-pick-list">${righe}</div>
      <div class="modal-field"><label>${labelUom('Pezzi da lavorare', itemUom(it))}</label>
        <input type="number" id="odl-pz-${pi}" min="0" step="any" value="1"></div>`;
  }).join('');
  window.__odlFasiParti = parti.map(x => x.id);
  openModal(`<h3>${ico('wrench', 'tinted pill', '')} Lavorazioni da mettere in ${esc(o.number)}</h3>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Le fasi <strong>consecutive dello stesso terzista</strong> stanno in una riga sola: è una lavorazione da commissionare, non due. Tariffa e giorni vengono dal ciclo, e si possono correggere sulla riga.</p>
    ${blocchi}
    <div class="modal-field"><label>Data di consegna richiesta</label><input type="date" id="odl-fase-due" value=""></div>
    <p class="empty-text" style="text-align:left;padding:8px 0">Questo ordine <strong>non è legato a un piano</strong>: se la stessa fase sta anche in un fabbisogno, lì continuerà a risultare da ordinare. Il legame col piano lo dà la generazione dal fabbisogno, non questa scheda.</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="odlAddPhases('${esc(id)}')">Aggiungi</button>
    </div>`, true, 'form');
}
// I centri di lavoro toccati da una tratta, nell'ordine del ciclo.
function odlRunNomi(it, t) {
  const nomi = [];
  cicloFasi(it).forEach((r, i) => {
    if (i < t.from || i > t.to) return;
    const wc = getWorkCenter(r.workCenterId);
    nomi.push(wc ? wc.name : '(centro mancante)');
  });
  return Array.from(new Set(nomi)).join(' + ');
}
// Le righe che nascono da una scelta di tratte. Sta fuori dal gesto perché
// **la decisione è qui** e il gesto è solo il modo di esprimerla: così si può
// verificare che una riga scritta a mano abbia la stessa forma di una generata,
// senza passare da caselle e pulsanti.
function odlPhaseLines(scelte, pezziDi, due) {
  const out = [];
  (scelte || []).forEach(chiave => {
    const itemId = String(chiave).split('#')[0];
    const from = Number(String(chiave).split('#')[1]) || 0;
    const it = getItem(itemId); if (!it) return;
    const pezzi = Number(pezziDi(itemId)) || 0;
    if (!(pezzi > 0)) return;                  // zero pezzi non è una lavorazione
    const t = clCycleRuns(it).find(x => x.from === from); if (!t) return;
    const r = clRunRow(it, t, pezzi, due || '');
    if (!r) return;
    out.push(planOdlLine(r));
  });
  return out;
}
function odlAddPhases(id) {
  if (!odlGuard(id, 'contract')) return;
  const o = getOdl(id); if (!o) return;
  const scelte = Array.from(document.querySelectorAll('.odl-fase'))
    .filter(cb => cb.checked).map(cb => cb.value);
  if (!scelte.length) { showToast('Nessuna lavorazione selezionata', 'error'); return; }
  const parti = window.__odlFasiParti || [];
  const righe = odlPhaseLines(scelte, itemId => rawNum('odl-pz-' + parti.indexOf(itemId)), val('odl-fase-due'));
  if (!righe.length) { showToast('Niente da aggiungere: i pezzi devono essere maggiori di zero', 'error'); return; }
  righe.forEach(l => o.lines.push(l));
  touch(o); odlMarkDirty(); closeModal(); renderOdl();
  showToast(righe.length === 1 ? 'Lavorazione aggiunta' : righe.length + ' lavorazioni aggiunte');
}

function renderOdlEdit(id) {
  const o = getOdl(id); if (!o) { odlView = 'list'; return ''; }
  const lines = (o.lines || []).map((l, i) => {
    const qty = Number(l.qty) || 0, price = (l.price === '' || l.price == null) ? null : Number(l.price);
    const amount = price != null ? importoRiga(l) : null;
    const rec = Number(l.received) || 0, residual = qty - rec;
    // Avvia e dichiara stanno sotto la riga che li giustifica: terzista e
    // ordine sono già decisi, resta da dire cosa esce e cosa torna.
    const cl = odlLineActions(o, l);
    return `<tr>
      ${cell2(i + 1, '', 'ln-idx')}
      ${cell2(`<span class="ln-code">${esc(l.code || '')}</span>`,
    `${esc(l.description)}${docLineNoteSub(l)}${cl}`)}
      ${cell2(`<input type="number" class="rfq-qty-input lock-contract" value="${l.qty}" min="0" step="any" title="Pezzi da lavorare" onchange="odlSetLine('${id}','${l.id}','qty',this.value)">`,
    esc(l.uom || ''))}
      ${cell2(`<input type="number" class="rfq-price-input lock-contract" value="${price != null ? price : ''}" min="0" step="any" placeholder="—" title="Tariffa per pezzo" onchange="odlSetLine('${id}','${l.id}','price',this.value)">`,
    `<span class="ln-amount">${amount != null ? fmtN(amount) : '—'}</span>`)}
      ${cell2(`<input type="date" class="rfq-date-input lock-contract" value="${esc(l.startDate || '')}" title="Inizio lavoro: il giorno in cui consegniamo il materiale al terzista" onchange="odlSetLine('${id}','${l.id}','startDate',this.value)">`,
    `<span class="empty-text" style="padding:0" title="Da inviare finché il materiale non parte; in lavorazione quando è uscito; rientrata quando i pezzi sono tornati">${esc(ODL_AVANZAMENTO[odlAvanzamentoRiga(o, l)])}</span>`)}
      ${cell2(`<input type="date" class="rfq-date-input lock-contract" value="${esc(l.deliveryDate || '')}" title="Data che abbiamo chiesto" onchange="odlSetLine('${id}','${l.id}','deliveryDate',this.value)">`,
    `<input type="date" class="rfq-date-input lock-reception" value="${esc(l.confirmedDate || '')}" title="Data che il terzista ha confermato" onchange="odlSetLine('${id}','${l.id}','confirmedDate',this.value)">${ordLineDelayHtml(l)}`)}
      ${cell2(`<input type="number" class="rfq-qty-input lock-reception" value="${rec}" min="0" step="any" disabled title="${odlLegameAttivo(o, l) ? 'I pezzi rientrati li dichiara l&rsquo;ordine di produzione: qui si leggono, non si scrivono.' : 'Pezzi tornati dal terzista, buoni e scarti: si scrivono con «dichiara», che muove anche il magazzino.'}">`,
    `<span class="ln-residual ${residual > 0 ? 'pos' : ''}" title="Pezzi ancora dal terzista">${fmtQtyIt(residual)}</span>`)}
      ${docLineActionsCell('odl', id, l)}
    </tr>`;
  }).join('') || `<tr><td colspan="8" class="empty-text">Nessuna lavorazione. Un ordine di lavoro si genera dal <strong>Fabbisogno</strong>, oppure si scrive qui con <em>+ Lavorazione da ciclo</em>: si sceglie la parte, le fasi da mandare fuori e i pezzi.</td></tr>`;
  const total = odlTotal(o);
  const ritardo = orderWorstDelay(o);
  const lockBanner = docLockBanner(odlMode(o), 'Ordine di lavoro ' + (ORDER_STATUS[o.status] || o.status).toLowerCase(), 'odl', id);
  return `<div class="manage-wrap">
    ${docToolbarHtml({ chiudi: 'odlBackToList()', cosa: "l'ordine di lavoro", rec: o, stati: ORDER_STATUS, dirty: odlDirty,
      saveId: 'odl-save-btn', salva: `odlSave('${id}')`, menu: [{ label: "Elimina l'ordine di lavoro", icon: 'trash', onclick: `delOdl('${id}')`, danger: true }] })}
    ${docStepperHtml('odl', o)}${docLinksHtml('odl', o)}
    ${docCoWarnHtml()}${odlOdpRef(o)}${lockBanner}${stampLine(o)}
    ${docTestaHtml({ pfx: 'odl', rec: o, stati: ORDER_STATUS, controparte: 'Terzista', data: 'Data ordine', conferma: 'N° conferma del terzista', note: 'Note' })}
    ${ritardo != null ? `<div class="rfq-warn">${ico('clock', 'tinted', '')} Il terzista ha confermato con <strong>${supplierDaysText(ritardo)}</strong> di ritardo sulla data richiesta.</div>` : ''}
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Ogni lavorazione si <strong>avvia</strong> quando il materiale parte e si <strong>dichiara</strong> quando i pezzi tornano, buoni e scarti: come sull'ordine di produzione. Il magazzino si muove ai due estremi del <strong>ciclo</strong> — il materiale esce all'avvio della prima tratta, il codice della parte si carica al rientro dell'ultima — e in mezzo i pezzi passano e basta. Se la lavorazione viene da un <strong>ordine di produzione</strong>, avvia e dichiara scrivono sulle sue fasi: il gesto è uno, in qualunque dei due documenti lo si faccia.</p>
    <h3 class="rfq-subhead">Lavorazioni
      <span class="rfq-head-actions">
        <button class="add-btn-sm lock-contract" onclick="odlAddPhaseModal('${id}')" title="Scegli una parte col suo ciclo e le fasi da commissionare">+ Lavorazione da ciclo</button>
        <button class="btn-outline lock-contract" onclick="odlAddManualLineModal('${id}')">+ Riga manuale</button>
        <button class="btn-outline lock-reception" onclick="odlMarkAllReceived('${id}')" title="Dichiara come pezzi buoni il residuo di ogni lavorazione avviata">✓ Dichiara tutto rientrato</button>
      </span></h3>
    <div class="table-wrap"><table class="rfq-table rfq-table-2">
      <thead><tr>
        <th scope="col" class="ln-idx">#</th>
        ${th2('Parte', 'Lavorazione')}
        ${th2('Pezzi', 'U.M.')}
        ${th2(`Tariffa (${esc(cur())}/pz)`, `Importo (${esc(cur())})`, 'Quanto costa lavorare un pezzo; sotto, quanto fa per i pezzi di riga')}
        ${th2('Inizio lavoro', 'Stato', 'Sopra il giorno in cui consegniamo il materiale al terzista, sotto a che punto è la lavorazione')}
        ${th2('Richiesta', 'Confermata', 'Sopra la data che abbiamo chiesto, sotto quella che il terzista ha confermato')}
        ${th2('Rientrati', 'Ancora fuori', 'Sopra quanti pezzi sono tornati, sotto quanti restano dal terzista')}
        <th scope="col"></th></tr></thead>
      <tbody>${lines}</tbody>
      <tfoot><tr class="rfq-cmp-total"><td colspan="3" style="text-align:right">Totale imponibile</td><td>${fmtN(total)}</td><td colspan="4"></td></tr></tfoot>
    </table></div>
    ${odlDeclBlock(o)}
    ${docExportBarHtml({ etichetta: "Documento d'ordine di lavoro:", cls: 'odl-export-btn', pdf: `exportOdlPDF('${id}')`, xls: `exportOdlExcel('${id}')`, dirty: odlDirty, cosa: "l'ordine di lavoro", kind: 'workOrder', rec: o })}
  </div>`;
}

// ─── Documento dell'ordine di lavoro ───
// Bilingue come l'ordine d'acquisto, e con le colonne che servono a un
// terzista: la parte, la lavorazione, i pezzi. Nessuna colonna «codice presso
// il fornitore»: una lavorazione non ha un codice a catalogo di nessuno.
function exportOdlPDF(id, modo) {
  const o = getOdl(id); if (!o) return;
  if (!(o.lines || []).length) { showToast('Nessuna riga da esportare', 'error'); return; }
  const jsPDF = requirePdf(); if (!jsPDF) return;
  const doc = new jsPDF({ orientation: 'landscape' });
  // Come sull'ordine d'acquisto: il QR apre la scheda rapida dell'ODL.
  if (o.number) qrPdfDraw(doc, qrLink('odl', o.number), doc.internal.pageSize.getWidth() - 14 - 22, 5, 22);
  const startY = docPdfTesta(doc, { titolo: 'Ordine di lavoro / Subcontract Order', rec: o,
    chi: 'COMMITTENTE / PRINCIPAL', controparte: 'TERZISTA / SUBCONTRACTOR', vuota: '(terzista non selezionato / not selected)' });
  const head = ['#', 'Parte\nPart', 'Lavorazione\nOperation', 'Pezzi\nQty', 'Tariffa\nUnit rate', 'Importo\nAmount',
    'Inizio lavoro\nWork start', 'Data consegna\nDelivery date'];
  const body = (o.lines || []).map((l, i) => {
    const qty = Number(l.qty) || 0, price = (l.price === '' || l.price == null) ? null : Number(l.price);
    return [i + 1, l.code || '', lineDescDoc(l), (fmtQtyIt(qty) + ' ' + (l.uom || '')).trim(),
      price != null ? fmtPrezzo(price) + (l.uom ? '/' + l.uom : '') : '',
      price != null ? fmtN(importoRiga(l)) : '', fmtDateIt(l.startDate), fmtDateIt(l.deliveryDate)];
  });
  const totLabel = { content: 'Totale / Total', styles: { halign: 'right', fontStyle: 'bold' } };
  const totVal = { content: fmtN(odlTotal(o)), styles: { fontStyle: 'bold' } };
  doc.autoTable({ startY, head: [head], body, foot: [['', '', '', '', totLabel, totVal, '', '']],
    styles: { fontSize: 8 }, headStyles: { fillColor: [46, 164, 121] }, footStyles: { fillColor: [235, 242, 238], textColor: 20 } });
  doc.setTextColor(80); doc.setFontSize(9);
  // Solo o.notes: le note interne (notesInternal) non escono mai sul documento.
  docCoda(doc, [
    { etichetta: 'Trasporto / Shipping', testo: o.transport },
    { etichetta: 'Pagamento / Payment', testo: o.payment },
    { etichetta: 'Conferma terzista / Order confirmation', testo: o.supplierConfirmation },
    { etichetta: 'Note / Notes', testo: o.notes },
  ], doc.lastAutoTable.finalY + 8);
  return docPdfEmetti('workOrder', o, doc, { ripiego: 'ordine', modo, stato: 'inviato', rerender: renderOdl,
    domanda: `PDF generato.\nSegnare l'ordine di lavoro ${o.number} come inviato?` });
}
function exportOdlExcel(id) {
  const o = getOdl(id); if (!o) return;
  if (!(o.lines || []).length) { showToast('Nessuna riga da esportare', 'error'); return; }
  const data = docXlsTesta({ titolo: 'Ordine di lavoro / Subcontract Order', rec: o, chi: 'COMMITTENTE', controparte: 'TERZISTA', voci: [
    ['Da richiesta', o.rfqId && getRfq(o.rfqId) ? getRfq(o.rfqId).number : ''],
    ['Trasporto / Shipping', o.transport], ['Pagamento / Payment', o.payment],
    ['Conferma terzista / Order confirmation', o.supplierConfirmation]] });
  data.push(['#', 'Parte', 'Lavorazione', 'Pezzi', 'U.M.', `Tariffa (${cur()}/pz)`, `Importo (${cur()})`, 'Inizio lavoro', 'Consegna', 'Rientrati', 'Ancora fuori', 'Nota']);
  (o.lines || []).forEach((l, i) => {
    const qty = Number(l.qty) || 0, price = (l.price === '' || l.price == null) ? '' : Number(l.price);
    const amount = price === '' ? '' : importoRiga(l);
    const rec = Number(l.received) || 0;
    data.push([i + 1, l.code || '', l.description, qty, l.uom || '', price, amount, fmtDateIt(l.startDate), fmtDateIt(l.deliveryDate), rec, qty - rec, l.note || '']);
  });
  data.push([]);
  data.push(['', 'TOTALE IMPONIBILE / TOTAL', odlTotal(o)]);
  if (!docXlsSalva(data, o, 'Ordine di lavoro', 'ordine')) return;
  askMarkSent(o, `Excel generato.\nSegnare l'ordine di lavoro ${o.number} come inviato?`, 'inviato', renderOdl);
}

function delOrder(id) {
  docDel('order', id, () => {
    // L'eliminazione porta via anche la merce ricevuta: un collaudo aperto su
    // quell'arrivo resterebbe a trattenere un libero che non esiste più.
    if (typeof qcChiudiOrfani === 'function') qcChiudiOrfani(id);
    if (currentOrderId === id) { currentOrderId = null; orderView = 'list'; }
  }, o => {
    // Un ordine con merce già arrivata non si cancella per sbaglio: il numero
    // dei ricevuti è la ragione per cui vale la pena fermarsi a rileggere.
    const rec = orderReception(o);
    return rec.received ? ` con ${fmtQtyIt(rec.received)} già ricevuti` : '';
  });
}
