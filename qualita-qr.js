// ═══════════════════════════════════════════════════════════
//  BOMTRACK — qualita-qr.js  (modulo Qualità: QR, cartellino, scheda del piano)
// ═══════════════════════════════════════════════════════════
// Il collaudo si fa davanti al bancale, la non conformità si chiude in
// officina con il rapporto in mano: i documenti della qualità portano lo
// stesso QR di ODP, ODA e ODL (qr.js), e inquadrato apre una scheda rapida
// con i gesti che servono lì. Tre tipi nuovi nell'indirizzo `#/q/…`:
//   col  il collaudo, per numero (COL-2026-004)
//   nc   la non conformità, per numero (NC-2026-001)
//   pc   il piano di controllo, per id: un piano non ha numero
//
// ── Il cartellino ──
// Il foglio A4 che si attacca alla merce: da collaudare (giallo), accettato
// (verde) o non conforme (rosso), con il QR. Si stampa dalla scheda del
// collaudo, o — se lo si accende in Gestione → Qualità — si propone subito
// dopo il ricevimento.
//
// ── Un limite ──
// Il numero COL non lo riserva il server come quello NC: due PC che ricevono
// insieme possono dare lo stesso numero. Il QR apre allora il collaudo ancora
// aperto, e fra più aperti il più recente (qcPerNumero).

// Il collaudo con quel numero: l'aperto prima, poi il più recente.
function qcPerNumero(numero) {
  const k = String(numero == null ? '' : numero).trim().toLowerCase();
  if (!k) return null;
  const l = qcTutti().filter(x => String(x.number || '').trim().toLowerCase() === k || x.id === numero);
  if (!l.length) return null;
  return l.sort((a, b) => (a.status === 'aperto' ? 0 : 1) - (b.status === 'aperto' ? 0 : 1)
    || String(b.createdAt || b.date || '').localeCompare(String(a.createdAt || a.date || '')))[0];
}
function ncPerNumero(numero) {
  const k = String(numero == null ? '' : numero).trim().toLowerCase();
  if (!k) return null;
  return ncTutte().find(x => String(x.number || '').trim().toLowerCase() === k) || ncTutte().find(x => x.id === numero) || null;
}
// ─── Il cartellino A4 ───
// Un foglio da attaccare al bancale, con lo stato scritto grande, in italiano e
// in inglese, e un colore che si riconosce da lontano: giallo da collaudare,
// verde accettato, rosso non conforme. Un collaudo chiuso in parte accettato e
// in parte respinto dà due fogli, uno per ciascun mucchio.
const QC_CARTELLINI = {
  collaudo: { colore: [222, 140, 0], titolo: 'MATERIALE DA COLLAUDARE', title: 'MATERIAL TO BE INSPECTED',
    riga: 'Non usare fino all\'esito del collaudo  ·  Do not use until released' },
  accettato: { colore: [30, 135, 60], titolo: 'MATERIALE COLLAUDATO E ACCETTATO', title: 'INSPECTED AND ACCEPTED',
    riga: 'Libero per l\'uso  ·  Released for use' },
  deroga: { colore: [30, 135, 60], titolo: 'MATERIALE ACCETTATO IN DEROGA', title: 'ACCEPTED UNDER CONCESSION',
    riga: 'Usabile con le riserve della non conformità  ·  Use as stated in the non-conformity' },
  nonconforme: { colore: [200, 30, 30], titolo: 'MATERIALE NON CONFORME', title: 'NON-CONFORMING MATERIAL',
    riga: 'Non usare  ·  Tenere separato  ·  Do not use  ·  Keep segregated' },
};
const QC_DESTINI_EN = { sostituzione: 'return for replacement', accredito: 'return for credit', scarto: 'scrap', rilavorazione: 'rework, on hold' };
// I fogli che servono per un collaudo, nel suo stato di adesso.
function qcCartelliniTipi(x) {
  if (!x) return [];
  if (x.status === 'aperto') return ['collaudo'];
  const t = [];
  if ((Number(x.qtyOk) || 0) > 0.000001) t.push(x.esito === 'deroga' ? 'deroga' : 'accettato');
  if ((Number(x.qtyKo) || 0) > 0.000001) t.push('nonconforme');
  return t;
}
function qcCartellinoPagina(doc, x, tipo) {
  const c = QC_CARTELLINI[tipo];
  const it = getItem(x.itemId);
  const p = x.planId && typeof qcPianoGet === 'function' ? qcPianoGet(x.planId) : null;
  const nc = typeof ncDiCollaudo === 'function' ? ncDiCollaudo(x.id) : null;
  const W = 210, M = 12;
  doc.setDrawColor(...c.colore); doc.setLineWidth(3); doc.rect(6, 6, W - 12, 285);
  doc.setFillColor(...c.colore); doc.rect(6, 6, W - 12, 46, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold');
  // Il titolo più lungo si stringe fino a stare nella fascia.
  let fs = 34;
  doc.setFontSize(fs);
  while (fs > 20 && doc.getTextWidth(c.titolo) > W - 2 * M - 4) { fs -= 1; doc.setFontSize(fs); }
  doc.text(c.titolo, W / 2, 26, { align: 'center' });
  doc.setFontSize(22); doc.text(c.title, W / 2, 40, { align: 'center' });
  doc.setFontSize(11.5); doc.setFont('helvetica', 'normal');
  doc.text(c.riga, W / 2, 48, { align: 'center' });
  // Codice, descrizione e la quantità di questo mucchio.
  const qta = tipo === 'collaudo' ? x.qty : tipo === 'nonconforme' ? x.qtyKo : x.qtyOk;
  doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(30);
  doc.text(String(it ? it.code : '(articolo eliminato)'), M, 72);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(15);
  doc.splitTextToSize(String(it ? it.name || '' : ''), 115).slice(0, 3).forEach((r, i) => doc.text(r, M, 82 + i * 7));
  doc.setFont('helvetica', 'bold'); doc.setFontSize(24);
  doc.text(`${fmtQtyIt(qta)} ${x.uom || ''}`.trim(), M, 112);
  if (tipo !== 'collaudo' && (Number(x.qty) || 0) > (Number(qta) || 0) + 0.000001) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90);
    doc.text(`su ${fmtQtyIt(x.qty)} ${x.uom || ''} arrivati / of ${fmtQtyIt(x.qty)} received`, M, 119);
  }
  // Il QR: sul non conforme apre la NC, se c'è; altrimenti il collaudo.
  const lato = 64;
  const [qt, qn] = tipo === 'nonconforme' && nc && nc.number ? ['nc', nc.number] : ['col', x.number];
  if (qn) qrPdfDraw(doc, qrLink(qt, qn), W - M - lato, 58, lato);
  doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(String(qn || ''), W - M - lato / 2, 58 + lato + 7, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
  doc.text(tipo === 'collaudo' ? 'Inquadra per collaudare · Scan to inspect' : 'Inquadra per i dettagli · Scan for details', W - M - lato / 2, 58 + lato + 12, { align: 'center' });
  // I dati.
  const ordine = typeof qcOrdineNumero === 'function' ? qcOrdineNumero(x) : '';
  const forn = x.source === 'odp'
    ? ['Fatto da / Made by', supplierName(x.supplierId) || 'In casa / In-house']
    : [x.source === 'odl' ? 'Terzista / Subcontractor' : 'Fornitore / Supplier', supplierName(x.supplierId) || '—'];
  const arrivo = x.source === 'odp' ? [['Ordine di produzione / Work order', ordine || '—']]
    : [['Ordine / Order', ordine || '—'], ['DDT / Delivery note', x.ddt || '—'], ['Lotto fornitore / Supplier lot', x.supplierLot || '—']];
  const chi = x.updatedBy && typeof actorName === 'function' ? actorName(x.updatedBy) : '';
  const quando = fmtDateIt(String(x.closedAt || '').slice(0, 10));
  const righe = tipo === 'collaudo' ? [
    ['Collaudo / Inspection', x.number || ''], ['Arrivato il / Received', fmtDateIt(x.date)], forn, ...arrivo,
    ['Piano di controllo / Inspection plan', p ? p.name : '—'],
    ['Pezzi da guardare / Sample size', x.sampleSize ? `${fmtQtyIt(x.sampleSize)}${x.skipLot ? ' (lotto saltato / skipped)' : ''}` : '—'],
    ['Certificato / Certificate', x.cert === 'atteso' ? 'richiesto, non ancora arrivato / required, not received' : x.cert === 'ok' ? 'arrivato / received' : '—'],
  ] : tipo === 'nonconforme' ? [
    ['Collaudo / Inspection', x.number || ''], ['Non conformità / NCR', nc ? nc.number || '' : '—'],
    ['Respinto il / Rejected on', quando || '—'], forn, ...arrivo,
    ['Destinazione / Disposition', x.destino ? `${QC_DESTINI[x.destino] || x.destino} / ${QC_DESTINI_EN[x.destino] || ''}` : '—'],
    ['Causa / Cause', nc && nc.cause ? nc.cause : '—'],
  ] : [
    ['Collaudo / Inspection', x.number || ''], ['Collaudato il / Inspected on', quando || '—'],
    x.skipLot ? ['Collaudato da / Inspected by', 'lotto saltato, accettato senza collaudo / skip lot, not inspected']
      : ['Collaudato da / Inspected by', chi || '—'], forn, ...arrivo,
    ['Piano di controllo / Inspection plan', p ? p.name : '—'],
    ...(tipo === 'deroga' ? [['Non conformità / NCR', nc ? nc.number || '' : '—']] : []),
  ];
  if (tipo !== 'collaudo' && x.note) righe.push(['Nota / Note', x.note]);
  doc.autoTable({ startY: 146, margin: { left: M, right: M }, theme: 'grid',
    styles: { fontSize: 11, cellPadding: 2.6, lineColor: 200, textColor: 20 },
    columnStyles: { 0: { cellWidth: 74, textColor: 100 }, 1: { fontStyle: 'bold' } }, body: righe });
  // In fondo: quello che resta da scrivere a mano.
  let y = doc.lastAutoTable.finalY + 12;
  doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.setDrawColor(60); doc.setLineWidth(0.4);
  if (tipo === 'collaudo') {
    doc.text('ESITO / RESULT', M, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    ['Accettato / Accepted', 'In deroga / Concession', 'Respinto / Rejected'].forEach((t, i) => {
      const xx = M + i * 64; doc.rect(xx, y + 5, 6, 6); doc.text(t, xx + 9, y + 10);
    });
    y += 26;
  } else if (tipo === 'nonconforme') {
    doc.text('DESTINAZIONE ESEGUITA / DISPOSITION DONE', M, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    ['Reso al fornitore / Returned', 'Rottamato / Scrapped', 'Rilavorato / Reworked'].forEach((t, i) => {
      const xx = M + i * 64; doc.rect(xx, y + 5, 6, 6); doc.text(t, xx + 9, y + 10);
    });
    y += 26;
  } else {
    doc.text('MERCE LIBERATA / RELEASED', M, y);
    y += 16;
  }
  doc.line(M, y, M + 80, y); doc.line(W - M - 80, y, W - M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(100);
  doc.text('Data / Date', M, y + 5); doc.text('Firma / Signature', W - M - 80, y + 5);
  doc.setFontSize(8); doc.text(`Bomtrack · stampato il ${fmtDateIt(nowISO())}`, W / 2, 287, { align: 'center' });
}
// Un PDF con i fogli di uno o più collaudi (più righe ricevute insieme).
function qcCartelliniPdf(ids) {
  const fogli = [];
  (ids || []).forEach(id => { const x = qcGet(id); qcCartelliniTipi(x).forEach(t => fogli.push([x, t])); });
  if (!fogli.length) { showToast('Niente da stampare per questo collaudo', 'error'); return null; }
  const jsPDF = requirePdf(); if (!jsPDF) return null;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  fogli.forEach(([x, t], i) => { if (i) doc.addPage(); qcCartellinoPagina(doc, x, t); });
  const primo = fogli[0][0];
  doc.save(`bomtrack_cartellino_${String(fogli.length > 1 && ids.length > 1 ? 'collaudi' : primo.number || 'collaudo').replace(/[^\w-]+/g, '_')}.pdf`);
  return doc;
}
function qcCartellino(id) { return qcCartelliniPdf([id]); }

// ─── Proporre il cartellino al ricevimento ───
// I collaudi aperti nello stesso gesto (un ricevimento di più righe) si
// raccolgono e si propongono con un avviso solo, dopo quello del ricevimento.
let qcCartelliniNuovi = [];
function qcCartellinoAlRicevimento() { return !!(db.settings && db.settings.qcCartellino); }
function qcProponiCartellino(rec) {
  if (!rec || rec.status !== 'aperto' || !qcCartellinoAlRicevimento() || typeof document === 'undefined') return;
  qcCartelliniNuovi.push(rec.id);
  if (qcCartelliniNuovi.length === 1) setTimeout(qcCartellinoAvviso, 0);
}
function qcCartellinoAvviso() {
  const ids = qcCartelliniNuovi; qcCartelliniNuovi = [];
  if (!ids.length) return;
  showToast(ids.length === 1 ? 'Merce in collaudo: stampa il cartellino da attaccare al bancale' : `${ids.length} lotti in collaudo: stampa i cartellini`,
    'success', { label: ids.length === 1 ? 'Cartellino' : 'Cartellini', fn: () => qcCartelliniPdf(ids) });
}

// ─── Le schede rapide ───
function qcQrSchedaHtml(tipo, rec) {
  if (tipo === 'col') {
    const x = rec, it = getItem(x.itemId);
    const bottoni = [];
    if (x.status === 'aperto' && qcPuoScrivere()) bottoni.push(qrBtn('Collauda', 'search', `qcApriDaAltrove('${x.id}')`, true));
    else bottoni.push(qrBtn('Apri il collaudo', 'search', `qcApriDaAltrove('${x.id}')`, true));
    bottoni.push(qrBtn('Rapporto PDF', 'file', `qcRapportoPdf('${x.id}')`));
    const cert = qcCertificatoRichiesto(x) ? `<p>Certificato ${esc(qcCertificatoDi(x))}: <strong>${x.cert === 'ok' ? 'arrivato e conforme' : 'non ancora arrivato'}</strong></p>` : '';
    return `<h3>${ico('search', 'tinted pill', '')} ${esc(x.number || '')} ${qcBadge(x)}</h3>
      <p><strong>${it ? esc(it.code + ' — ' + (it.name || '')) : '—'}</strong></p>
      <p>${fmtQtyIt(x.qty)} ${esc(x.uom || '')} · ${esc(supplierName(x.supplierId) || '—')} · ${esc(qcOrdineNumero(x) || '')} · ${esc(fmtDateIt(x.date))}</p>
      ${x.sampleRule ? `<p class="empty-text" style="text-align:left;padding:0 0 6px">${esc(x.sampleRule)} · ${fmtQtyIt(x.sampleSize || 0)} pz da guardare</p>` : ''}
      ${cert}<div class="qr-azioni">${bottoni.join('')}</div>`;
  }
  if (tipo === 'nc') {
    const x = rec, it = getItem(x.itemId), scrive = canWrite('docs') && x.status !== 'chiusa';
    const azioni = (x.actions || []).map(a => `<label class="mgmt-item qr-nc-azione">
        <input type="checkbox" ${a.done ? 'checked' : ''} ${scrive ? '' : 'disabled'} onchange="ncAzioneSet('${x.id}','${a.id}','done',this.checked)">
        <span style="flex:1">${esc(a.text || '(azione senza testo)')}</span>
        <span class="empty-text" style="padding:0">${esc([a.who, a.due ? fmtDateIt(a.due) : ''].filter(Boolean).join(' · '))}</span></label>`).join('');
    return `<h3>${ico('warning', 'tinted pill', '')} ${esc(x.number || '')} ${ncBadge(x)}</h3>
      <p><strong>${it ? esc(it.code + ' — ' + (it.name || '')) : '—'}</strong>${x.supplierId ? ' · ' + esc(supplierName(x.supplierId) || '') : ''}</p>
      <p>${x.decision ? 'Decisione: <strong>' + esc(NC_DECISIONI[x.decision] || x.decision) + '</strong> · ' : ''}${x.dueDate ? 'da chiudere entro il ' + esc(fmtDateIt(x.dueDate)) : ''}</p>
      ${azioni ? `<div style="display:flex;flex-direction:column;gap:4px;margin:8px 0">${azioni}</div>` : '<p class="empty-text" style="text-align:left;padding:0 0 8px">Nessuna azione scritta.</p>'}
      <div class="qr-azioni">${qrBtn('Apri la non conformità', 'warning', `ncApriDaAltrove('${x.id}')`, true)}</div>`;
  }
  // Il piano: che cosa si guarda, e i collaudi aperti che lo usano.
  const p = rec;
  const aperti = qcTutti().filter(x => x.planId === p.id && x.status === 'aperto');
  const car = (p.characteristics || []).map(c => `<div class="mgmt-item"><span style="flex:1">${esc(c.name || '—')}</span><span class="num">${esc(qcTolleranzaTesto(c))}</span></div>`).join('');
  const col = aperti.map(x => `<div class="mgmt-item" ${clickAttrs(`closeModal();qcApriDaAltrove('${x.id}')`, 'Apri ' + x.number)} style="cursor:pointer">
      <span style="width:130px;font-family:var(--mono)">${esc(x.number || '')}</span><span style="flex:1">${esc((getItem(x.itemId) || {}).code || '')}</span>
      <span class="num">${fmtQtyIt(x.qty)} ${esc(x.uom || '')}</span></div>`).join('');
  return `<h3>${ico('ruler', 'tinted pill', '')} ${esc(p.name || '')}</h3>
    <p>${esc(QC_CAMPIONI[p.sampling] || QC_CAMPIONI.tutto)} · ${qcPianoCodici(p).length} codici</p>
    ${p.notes ? `<p class="empty-text" style="text-align:left;padding:0 0 6px">${esc(p.notes)}</p>` : ''}
    ${car ? `<div style="display:flex;flex-direction:column;gap:4px;margin:8px 0">${car}</div>` : ''}
    <p><strong>${aperti.length ? `${aperti.length} collaud${aperti.length === 1 ? 'o aperto' : 'i aperti'}` : 'Nessun collaudo aperto'}</strong></p>
    ${col ? `<div style="display:flex;flex-direction:column;gap:4px;margin:8px 0;max-height:35vh;overflow:auto">${col}</div>` : ''}
    <div class="qr-azioni">${qrBtn('Apri il piano', 'ruler', `pqApriDaAltrove('${p.id}')`, true)}</div>`;
}
// Chi può registrare l'esito: le stesse guardie della scheda (qcGuard).
function qcPuoScrivere() { return canWrite('docs') || canWriteShop('docs'); }
function pqApriDaAltrove(id) { pqCurrentId = id; setView('pianiqc'); }

// ─── La scheda del piano, stampata ───
// Da appendere accanto al banco di collaudo: le caratteristiche con i loro
// limiti, il campionamento, le istruzioni e il messaggio se fallisce. Il QR
// apre il piano e i collaudi aperti che lo usano.
function qcPianoPdf(id) {
  const p = qcPianoGet(id); if (!p) return null;
  const jsPDF = requirePdf(); if (!jsPDF) return null;
  const doc = new jsPDF();
  qrPdfDraw(doc, qrLink('pc', p.id), doc.internal.pageSize.getWidth() - 14 - 22, 5, 22);
  doc.setFontSize(15); doc.setTextColor(30); doc.text(`Piano di controllo / Inspection plan`, 14, 16);
  doc.setFontSize(11); doc.text(String(p.name || ''), 14, 23);
  doc.setFontSize(9); doc.setTextColor(90); doc.text(`Stampato il / Printed: ${fmtDateIt(nowISO())}`, 14, 29);
  const es = qcCampionamento(p, 500, 'normale');
  doc.autoTable({ startY: 36, theme: 'plain', styles: { fontSize: 9, cellPadding: 1.2 }, columnStyles: { 0: { textColor: 110, cellWidth: 60 } },
    body: [
      ['Campionamento / Sampling', QC_CAMPIONI[p.sampling] || QC_CAMPIONI.tutto],
      ['Esempio su 500 pz / Example', `${es.regola} · ${fmtQtyIt(es.size)} pz`],
      ['Salto lotti / Skip lot', (Number(p.skipAfter) || 0) > 0 && (Number(p.skipEvery) || 0) >= 2 ? `dopo ${p.skipAfter} accettati, 1 ogni ${p.skipEvery}` : '—'],
      ['Certificato / Certificate', p.cert || '—'],
    ] });
  const car = p.characteristics || [];
  if (car.length) {
    doc.autoTable({ startY: doc.lastAutoTable.finalY + 6, styles: { fontSize: 8.5 }, headStyles: { fillColor: [58, 123, 232] },
      head: [['#', 'Caratteristica\nCharacteristic', 'Specifica\nSpecification', 'Strumento\nGauge']],
      body: car.map((c, i) => [i + 1, c.name || '', qcTolleranzaTesto(c), c.tool || '']) });
  }
  let y = doc.lastAutoTable.finalY + 8;
  const blocco = (titolo, testo, rosso) => {
    if (!testo) return;
    doc.setFontSize(9); doc.setTextColor(rosso ? 180 : 110); doc.text(titolo, 14, y); y += 5;
    doc.setTextColor(rosso ? 180 : 40);
    doc.splitTextToSize(String(testo), 180).forEach(r => { doc.text(r, 14, y); y += 4.5; });
    y += 3;
  };
  blocco('Istruzioni / Instructions', p.notes, false);
  blocco('Se il controllo fallisce / If the check fails', p.failMessage, true);
  const codici = qcPianoCodici(p).map(getItem).filter(Boolean).sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
  if (codici.length) {
    doc.autoTable({ startY: y + 2, styles: { fontSize: 8 }, headStyles: { fillColor: [120, 120, 120] },
      head: [['Codice / Code', 'Descrizione / Description']], body: codici.map(it => [it.code || '', it.name || '']) });
  }
  doc.save(`bomtrack_piano_controllo_${String(p.name || 'piano').replace(/[^\w-]+/g, '_').slice(0, 40)}.pdf`);
  return doc;
}
