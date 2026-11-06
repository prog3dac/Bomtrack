// ═══════════════════════════════════════════════════════════
//  QUALITÀ IN PRODUZIONE (dalla 0.144.0)
// ═══════════════════════════════════════════════════════════
// Il collaudo dei pezzi fatti in casa e le non conformità degli scarti.
//
// Due fatti nuovi, tutti e due dentro il modulo Qualità:
//  - **il collaudo a fine ciclo**: la dichiarazione dell'ultima fase di un ODP
//    versa i pezzi buoni e, se l'articolo è da collaudare, apre un collaudo
//    come il ricevimento di un ordine fornitore. Fino all'esito i pezzi sono
//    nell'esistente ma non nel libero;
//  - **lo scarto con la causale**: chi dichiara degli scarti (su una fase di
//    ODP o sul rientro di un ODL) dice perché, e la NC nasce da sola. Una NC
//    per documento, fase e causale finché è aperta: dieci scarti da un pezzo
//    non fanno dieci NC.
//
// La differenza con gli acquisti è il responsabile. Lì è sempre il fornitore,
// qui è una **fase**: interna (la NC è di produzione) o di un terzista (la NC
// va verso di lui, ed entra nella sua valutazione). Oppure il materiale, o
// nessuno che si sappia. `respPhase` lo dice con l'id della fase, o con
// QC_RESP_MATERIALE / QC_RESP_ND.
//
// Il respinto non torna a nessun fornitore: o si rilavora o si rottama. Da
// rilavorare, i pezzi **restano bloccati** (`qtyHeld` sul collaudo chiuso)
// finché dalla NC non tornano al collaudo, rilavorati, o non si rottamano.
// L'ODP di ripresa che li lavorerà è il passo dopo: per ora la ripresa si fa
// fuori dall'app, e l'app tiene i pezzi fermi e il conto giusto.

const QC_RESP_MATERIALE = 'materiale';
const QC_RESP_ND = 'nd';

// ─── Le fasi di un ODP, dette a parole ───
function qcFaseOdp(o, faseId) { return o && faseId ? (o.phases || []).find(f => f.id === faseId) || null : null; }
function qcFaseTesto(f) {
  if (!f) return '';
  return `Fase ${f.seq} · ${f.wcName || ''}${f.supplierId ? ' · ' + (f.supplierName || supplierName(f.supplierId) || '') : ''}`.trim();
}
// Chi risponde di un difetto, a parole: la fase, il materiale o nessuno.
function qcRespTesto(o, resp) {
  if (resp === QC_RESP_MATERIALE) return 'Il materiale';
  if (resp === QC_RESP_ND) return 'Non individuata';
  const f = qcFaseOdp(o, resp);
  return f ? qcFaseTesto(f) : '';
}
// Il terzista della fase responsabile, o nessuno: una fase interna, il
// materiale o il «non si sa» non hanno un fornitore da valutare.
function qcRespFornitore(o, resp) {
  const f = qcFaseOdp(o, resp);
  return f && f.supplierId ? f.supplierId : null;
}
function qcRespOpzioni(o, scelta) {
  const fasi = (o && o.phases) || [];
  return fasi.map(f => `<option value="${esc(f.id)}" ${scelta === f.id ? 'selected' : ''}>${esc(qcFaseTesto(f))}</option>`).join('')
    + `<option value="${QC_RESP_MATERIALE}" ${scelta === QC_RESP_MATERIALE ? 'selected' : ''}>Il materiale</option>`
    + `<option value="${QC_RESP_ND}" ${scelta === QC_RESP_ND ? 'selected' : ''}>Non individuata</option>`;
}

// ─── Il collaudo a fine ciclo ───
// Dopo il versamento dell'ultima fase. Un assieme non ha giacenza (il
// magazzino non si muove), quindi non c'è niente da tenere fermo.
function qcDopoVersamento(o, fase, qty, decl) {
  if (!qcAttivo() || !o || !fase || !(Number(qty) > 0.000001)) return null;
  if (typeof odpDiAssieme === 'function' && odpDiAssieme(o)) return null;
  const it = getItem(o.itemId);
  if (!it || !hasStock(it)) return null;
  return qcCrea({ source: 'odp', orderId: o.id, lineId: fase.id, itemId: it.id, qty: Number(qty),
    uom: itemUom(it), supplierId: fase.supplierId || null, declId: decl ? decl.id : null });
}
// Il collaudo che una dichiarazione ha aperto, se c'è.
function qcDiDichiarazione(declId) {
  return declId ? qcTutti().find(x => x.declId === declId) || null : null;
}
// Annullare la dichiarazione: un collaudo ancora aperto se ne va con lei, uno
// chiuso no — la merce si è già mossa, e l'esito non si corregge.
function qcDichiarazioneAnnullabile(declId) {
  const c = qcDiDichiarazione(declId);
  if (c && c.status !== 'aperto') return { ok: false, motivo: `il collaudo ${c.number} è già chiuso` };
  return { ok: true };
}
function qcAnnullaDichiarazione(declId) {
  const c = qcDiDichiarazione(declId);
  if (c && c.status === 'aperto') { Store.remove('inspections', c.id); invalidateStock(); }
  if (typeof ncScartoAnnulla === 'function') ncScartoAnnulla(declId);
}

// ─── I pezzi da rilavorare, fermi ───
// Rilavorati: tornano al collaudo con un collaudo nuovo, che li tiene fermi
// lui fino al suo esito. Se l'articolo nel frattempo non è più da collaudare,
// diventano liberi e basta.
function qcRilavoratiAlCollaudo(inspId) {
  if (!qcGuard()) return null;
  const x = qcGet(inspId); if (!x || !(Number(x.qtyHeld) > 0.000001)) return null;
  const nc = typeof ncDiCollaudo === 'function' ? ncDiCollaudo(x.id) : null;
  const held = Number(x.qtyHeld) || 0;
  Store.update('inspections', x.id, { qtyHeld: 0 });
  const nuovo = qcCrea({ source: x.source, orderId: x.orderId, lineId: x.lineId, itemId: x.itemId, qty: held,
    uom: x.uom, supplierId: null, declId: null });
  if (nuovo && nuovo.id) Store.update('inspections', nuovo.id, { note: `Dopo la rilavorazione${nc ? ' (' + nc.number + ')' : ''}` });
  invalidateStock();
  showToast(nuovo ? `${fmtQtyIt(held)} ${x.uom || ''} di nuovo al collaudo`.replace('  ', ' ') : `${fmtQtyIt(held)} ${x.uom || ''} liberi`.replace('  ', ' '));
  return nuovo || true;
}
// Da rilavorare a rottamati: escono come consumo, come il «tenuto e rottamato».
function qcRottamaTrattenuti(inspId, testo) {
  const x = qcGet(inspId); if (!x || !(Number(x.qtyHeld) > 0.000001)) return false;
  const it = getItem(x.itemId);
  if (it && hasStock(it)) {
    addMovement(x.itemId, 'scarico', -qcQtaGestione({ qty: x.qtyHeld, uom: x.uom, itemId: x.itemId }, it),
      testo || `Rottamato dopo il collaudo ${x.number}`, { orderId: x.orderId || null, lineId: x.lineId || null });
  }
  Store.update('inspections', x.id, { qtyHeld: 0 });
  invalidateStock();
  return true;
}

// ─── Gli scarti con la causale ───
// La causale serve solo col modulo acceso: spento, lo scarto resta un numero
// come prima.
function qcScartoMotivoOk(scrap, motivo) {
  if (!(Number(scrap) > 0) || !qcAttivo()) return true;
  if (ncCausali().includes(String(motivo || '').trim())) return true;
  showToast('Per gli scarti scegli la causale: serve alla non conformità', 'error');
  return false;
}
// Il campo da mettere sotto «Scarti» nelle finestre di dichiarazione.
function qcScartoCampoHtml(id) {
  if (!qcAttivo()) return '';
  return `<div class="modal-field"><label for="${id}">Causale degli scarti</label>
    <select id="${id}"><option value="">— se ci sono scarti —</option>${ncCausali().map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></div>`;
}
// La NC dello scarto: nuova, o la stessa ancora aperta per quel documento,
// quella fase e quella causale, a cui si somma. `rif` = { odp, fase } oppure
// { odl, riga }; `itemId` è quello che si stava facendo.
function ncDaScarto(rif, itemId, qty, motivo, declId) {
  if (!qcAttivo() || !(Number(qty) > 0) || !rif) return null;
  const doc = rif.odp || rif.odl; if (!doc) return null;
  const fase = rif.fase || null;
  const supplierId = fase ? fase.supplierId || null : (rif.odl ? rif.odl.supplierId || null : null);
  const respPhase = fase ? fase.id : '';
  const causa = String(motivo || '').trim();
  const voce = { id: declId || null, qty: Number(qty) };
  const aperta = ncAperte().find(x => x.orderId === doc.id && (x.respPhase || '') === respPhase && x.cause === causa
    && Array.isArray(x.scrapDecls) && x.scrapDecls.length);
  if (aperta) {
    Store.update('nonconformities', aperta.id, { qty: arrotondaQta((Number(aperta.qty) || 0) + voce.qty), scrapDecls: aperta.scrapDecls.concat([voce]) });
    return aperta;
  }
  const it = itemId ? getItem(itemId) : null;
  const dove = fase ? qcFaseTesto(fase) : (rif.odl ? `rientro dal terzista${rif.riga && rif.riga.code ? ' · ' + rif.riga.code : ''}` : '');
  return ncCrea({
    source: supplierId ? 'fornitore' : 'produzione', orderId: doc.id, productionOrderId: rif.odp ? rif.odp.id : null,
    itemId: it ? it.id : null, supplierId, qty: voce.qty, uom: it ? itemUom(it) : '',
    description: `Scarti dichiarati su ${doc.number || ''}${dove ? ' · ' + dove : ''}`, cause: causa,
    gravita: 'minore', decision: 'rottamazione', respPhase, scrapDecls: [voce],
  });
}
// Una dichiarazione annullata toglie il suo scarto dalla NC. Se non resta
// niente e nessuno ci ha lavorato, se ne va anche la NC.
function ncScartoAnnulla(declId) {
  if (!declId) return;
  ncTutte().filter(x => Array.isArray(x.scrapDecls) && x.scrapDecls.some(v => v.id === declId)).forEach(x => {
    const via = x.scrapDecls.filter(v => v.id === declId).reduce((s, v) => s + (Number(v.qty) || 0), 0);
    const resto = x.scrapDecls.filter(v => v.id !== declId);
    const toccata = x.status === 'chiusa' || (x.actions || []).length || String(x.note || '').trim() || (Number(x.cost) || 0) > 0;
    if (!resto.length && !toccata) { Store.remove('nonconformities', x.id); return; }
    Store.update('nonconformities', x.id, { qty: Math.max(0, arrotondaQta((Number(x.qty) || 0) - via)), scrapDecls: resto });
  });
}

// ─── Dalla NC ───
// La fase responsabile si corregge finché la NC è aperta: spesso la causa
// vera si capisce dopo. Con lei cambiano l'origine e il fornitore.
function ncSetFaseResponsabile(id, resp) {
  if (!ncGuard()) return false;
  const x = ncGet(id); if (!x || x.status === 'chiusa') return false;
  const o = x.productionOrderId && typeof getOdp === 'function' ? getOdp(x.productionOrderId) : null;
  if (!o) return false;
  const v = resp === QC_RESP_MATERIALE || resp === QC_RESP_ND || qcFaseOdp(o, resp) ? resp : QC_RESP_ND;
  const forn = qcRespFornitore(o, v);
  Store.update('nonconformities', id, { respPhase: v, supplierId: forn, source: forn ? 'fornitore' : (v === QC_RESP_MATERIALE ? 'interna' : 'produzione') });
  return true;
}
// Il caso più comune per uno scarto: è già buttato, non c'è altro da fare.
// Rottama anche i pezzi ancora fermi da rilavorare, se la NC ne ha.
function ncRottamaChiudi(id) {
  if (!ncGuard()) return false;
  const x = ncGet(id); if (!x || x.status === 'chiusa') return false;
  const c = x.inspectionId ? qcGet(x.inspectionId) : null;
  if (c && Number(c.qtyHeld) > 0.000001) qcRottamaTrattenuti(c.id, `Rottamato con ${x.number}`);
  const patch = { decision: 'rottamazione' };
  if (!x.cause) patch.cause = ncCausali().includes('Errore di lavorazione') ? 'Errore di lavorazione' : (ncCausali()[0] || '');
  Store.update('nonconformities', id, patch);
  return ncChiudi(id);
}
// La scheda della NC, la parte di produzione: la fase responsabile e i
// pezzi ancora fermi.
function ncProduzioneHtml(x, scrive) {
  const o = x.productionOrderId && typeof getOdp === 'function' ? getOdp(x.productionOrderId) : null;
  const c = x.inspectionId ? qcGet(x.inspectionId) : null;
  const held = c ? Number(c.qtyHeld) || 0 : 0;
  if (!o && !(held > 0)) return '';
  const aperta = x.status !== 'chiusa';
  const dis = scrive && aperta ? '' : 'disabled';
  const fase = o ? `<div class="modal-field"><label>Fase che ha generato il difetto</label>
      <select ${dis} onchange="ncSetFaseResponsabile('${x.id}', this.value);ncRidisegna()">${qcRespOpzioni(o, x.respPhase || '')}</select></div>` : '';
  const fermi = held > 0 ? `<p class="empty-text qc-hint"><strong>${fmtQtyIt(held)} ${esc(c.uom || '')}</strong> da rilavorare, fermi a magazzino: non sono liberi finché non tornano al collaudo o non si rottamano.</p>
      ${scrive && aperta ? `<div class="modal-actions" style="justify-content:flex-start">
        <button class="btn-outline" onclick="qcRilavoratiAlCollaudo('${c.id}');ncRidisegna()">${ico('refresh', 'tinted', '')} Rilavorati: di nuovo al collaudo</button></div>` : ''}` : '';
  return `<div class="qc-card">
      <h3>La produzione</h3>
      <div class="modal-grid">
        ${o ? `<div class="modal-field"><label>Ordine di produzione</label><div class="qc-val">${esc(o.number || '')} · ${esc((o.code || '') + ' ' + (o.name || ''))}</div></div>` : ''}
        ${fase}
      </div>
      ${fermi}
    </div>`;
}
