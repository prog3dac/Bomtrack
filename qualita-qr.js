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
// L'etichetta di stato che si attacca alla merce in attesa: «IN COLLAUDO»,
// numero, articolo, quantità, fornitore. Si stampa con i formati delle
// etichette QR (qrEtichetteModal), dalla scheda del collaudo, o — se lo si
// accende in Gestione → Qualità — si propone subito dopo il ricevimento.
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
// Le righe del cartellino, come qrEtichettaTesti le vuole: il codice in
// grassetto (qui lo stato e il numero), poi le righe piccole.
function qcCartellinoTesti(x) {
  const it = getItem(x.itemId);
  const stato = x.status === 'aperto' ? 'IN COLLAUDO' : x.esito === 'respinto' ? 'RESPINTO' : x.esito === 'deroga' ? 'IN DEROGA' : 'ACCETTATO';
  return {
    codice: `${stato} · ${x.number || ''}`,
    righe: [it ? `${it.code} ${it.name || ''}` : '', `${fmtQtyIt(x.qty)} ${x.uom || ''} · ${supplierName(x.supplierId) || ''}`.trim(),
      [x.ddt ? 'DDT ' + x.ddt.replace(/^DDT\s*/i, '') : '', fmtDateIt(x.date)].filter(Boolean).join(' · ')],
  };
}
function qcCartellino(id) { qrEtichetteModal([id], 'col'); }

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
    'success', { label: ids.length === 1 ? 'Cartellino' : 'Cartellini', fn: () => qrEtichetteModal(ids, 'col') });
}

// ─── Le schede rapide ───
function qcQrSchedaHtml(tipo, rec) {
  if (tipo === 'col') {
    const x = rec, it = getItem(x.itemId);
    const bottoni = [];
    if (x.status === 'aperto' && qcPuoScrivere()) bottoni.push(qrBtn('Collauda', 'search', `qcApriDaAltrove('${x.id}')`, true));
    else bottoni.push(qrBtn('Apri il collaudo', 'search', `qcApriDaAltrove('${x.id}')`, true));
    bottoni.push(qrBtn('Rapporto PDF', 'file', `qcRapportoPdf('${x.id}')`));
    const cert = qcCertificatoRichiesto(x) ? `<p>Certificato ${esc(qcCertificatoPiano(x) || qcCertificato(it) || '')}: <strong>${x.cert === 'ok' ? 'arrivato e conforme' : 'non ancora arrivato'}</strong></p>` : '';
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
