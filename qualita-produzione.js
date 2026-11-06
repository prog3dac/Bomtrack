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
  const x = qcGet(inspId); if (!x || !(qcFermi(x) > 0.000001)) return null;
  const nc = typeof ncDiCollaudo === 'function' ? ncDiCollaudo(x.id) : null;
  const held = qcFermi(x);
  Store.update('inspections', x.id, { qtyHeld: arrotondaQta((Number(x.qtyHeld) || 0) - held) });
  const nuovo = qcCrea({ source: x.source, orderId: x.orderId, lineId: x.lineId, itemId: x.itemId, qty: held,
    uom: x.uom, supplierId: null, declId: null });
  if (nuovo && nuovo.id) Store.update('inspections', nuovo.id, { note: `Dopo la rilavorazione${nc ? ' (' + nc.number + ')' : ''}` });
  invalidateStock();
  showToast(nuovo ? `${fmtQtyIt(held)} ${x.uom || ''} di nuovo al collaudo`.replace('  ', ' ') : `${fmtQtyIt(held)} ${x.uom || ''} liberi`.replace('  ', ' '));
  return nuovo || true;
}
// Da rilavorare a rottamati: escono come consumo, come il «tenuto e rottamato».
function qcRottamaTrattenuti(inspId, testo) {
  const x = qcGet(inspId); if (!x || !(qcFermi(x) > 0.000001)) return false;
  const held = qcFermi(x);
  const it = getItem(x.itemId);
  if (it && hasStock(it)) {
    addMovement(x.itemId, 'scarico', -qcQtaGestione({ qty: held, uom: x.uom, itemId: x.itemId }, it),
      testo || `Rottamato dopo il collaudo ${x.number}`, { orderId: x.orderId || null, lineId: x.lineId || null });
  }
  Store.update('inspections', x.id, { qtyHeld: arrotondaQta((Number(x.qtyHeld) || 0) - held) });
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
  if (c && qcFermi(c) > 0.000001) qcRottamaTrattenuti(c.id, `Rottamato con ${x.number}`);
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
  const held = c ? qcFermi(c) : 0;
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
      ${ncRipresaHtml(x, scrive)}
    </div>`;
}

// ═══════════════════════════════════════════════════════════
//  L'ODP DI RIPRESA (dalla 0.145.0)
// ═══════════════════════════════════════════════════════════
// La rilavorazione ha il suo documento: un ODP separato, lanciato dalla NC,
// collegato all'originale (`reworkOfId`) e alla NC (`ncId`). Ha una **fase
// dedicata al ripristino**, scritta per quel caso, più le fasi dell'originale
// che i pezzi non hanno ancora fatto (uno scarto a metà ciclo), se servono.
//
// Il materiale sono i pezzi da riprendere. Se erano fermi a magazzino (un
// respinto al collaudo) escono come prelievo all'avvio della prima fase, e da
// lì non sono più fermi: `qcFermi` li conta togliendo quello che le riprese
// del collaudo hanno prelevato (`reworkInspectionId`). Se erano scarti di
// fase, a magazzino non sono mai entrati e l'ODP parte senza prelievo.
//
// Eredita piano e commessa dell'originale: per il fabbisogno è un ODP del piano
// che promette i pezzi che mancano, quindi non se ne propone un altro.

// I pezzi davvero ancora fermi di un collaudo: quelli da rilavorare meno quelli
// che un ODP di ripresa ha già prelevato.
function qcFermi(x) {
  const held = Number(x && x.qtyHeld) || 0;
  if (!(held > 0.000001)) return 0;
  const riprese = new Set((db.prodOrders || []).filter(o => o.reworkInspectionId === x.id && o.status !== 'annullato').map(o => o.id));
  if (!riprese.size) return held;
  const presi = (db.movements || []).filter(m => riprese.has(m.orderId) && m.itemId === x.itemId && m.kind === 'scarico')
    .reduce((s, m) => s - (Number(m.qty) || 0), 0);
  return Math.max(0, arrotondaQta(held - presi));
}
function ncRipresa(nc) {
  return nc ? (db.prodOrders || []).find(o => o.ncId === nc.id && o.status !== 'annullato') || null : null;
}
// Le fasi dell'originale dopo quella responsabile: quelle che un pezzo
// scartato lì non ha ancora fatto. Con il materiale o «non individuata» come
// responsabile, tutte.
function ncRipresaFasiDopo(nc, orig) {
  const fasi = (orig && orig.phases) || [];
  const k = fasi.findIndex(f => f.id === nc.respPhase);
  return k >= 0 ? fasi.slice(k + 1) : fasi.slice();
}
// Le fasi congelate della ripresa, con tratte e numeri rifatti sul nuovo
// ordine: è un ODP come gli altri, e la successione la legge da qui.
function ncRipresaFasi(ripristino, dopo, ncId) {
  const campi = ['workCenterId', 'wcName', 'machineId', 'machineName', 'machineRate', 'supplierId', 'supplierName',
    'costMode', 'hours', 'operators', 'days', 'setupHours', 'queueDays', 'transitDays', 'rate', 'cost', 'note'];
  const base = { workCenterId: null, wcName: '', machineId: null, machineName: '', machineRate: 0, supplierId: null, supplierName: '',
    costMode: 'fisso', hours: 0, operators: 1, days: 0, setupHours: 0, queueDays: 0, transitDays: 0, rate: 0, cost: 0, note: '' };
  const fasi = [ripristino].concat(dopo).map((f, k) => {
    const out = Object.assign({}, base);
    campi.forEach(c => { if (f[c] !== undefined) out[c] = f[c]; });
    return Object.assign(out, { id: newId(), seq: cyclePhaseNumber(k), opIndex: k, phaseKey: `ripresa|${ncId}|${k}` });
  });
  const tratte = [];
  fasi.forEach((f, k) => {
    const sup = f.supplierId || '';
    const u = tratte[tratte.length - 1];
    if (u && u.sup === sup && u.to === k - 1) u.to = k; else tratte.push({ from: k, to: k, sup });
  });
  const viste = new Map();
  tratte.forEach(t => {
    const passata = t.sup ? (viste.get(t.sup) || 0) : 0;
    if (t.sup) viste.set(t.sup, passata + 1);
    for (let k = t.from; k <= t.to; k++) Object.assign(fasi[k], { runFrom: t.from, runTo: t.to, passata });
  });
  return fasi;
}
// `dati` = { qty, descr, workCenterId, supplierId, aCarico, prezzo, ore,
// giorni, fasiDopo: [id delle fasi dell'originale], dueDate }.
function ncRipresaCrea(ncId, dati) {
  if (!roleGuard('docs')) return null;
  const nc = ncGet(ncId); if (!nc || nc.status === 'chiusa') return null;
  const orig = nc.productionOrderId ? getOdp(nc.productionOrderId) : null;
  if (!orig) { showToast('La ripresa si lancia da una NC di un ordine di produzione', 'error'); return null; }
  const gia = ncRipresa(nc);
  if (gia) { showToast(`Questa NC ha già la sua ripresa: ${gia.number}`, 'error'); return null; }
  const part = getItem(orig.itemId); if (!part) return null;
  const c = nc.inspectionId ? qcGet(nc.inspectionId) : null;
  const fermi = c ? qcFermi(c) : 0;
  const d = dati || {};
  const max = fermi > 0 ? fermi : Number(nc.qty) || 0;
  const qty = arrotondaQta(Math.max(0, Number(d.qty) || 0));
  if (!(qty > 0)) { showToast('Quanti pezzi si riprendono?', 'error'); return null; }
  if (qty > max + 0.000001) { showToast(`Si riprendono al massimo ${fmtQtyIt(max)} pezzi`, 'error'); return null; }
  const descr = String(d.descr || '').trim();
  if (!descr) { showToast('Scrivi che cosa fa la fase di ripristino', 'error'); return null; }
  const sup = d.supplierId ? getSupplier(d.supplierId) : null;
  const wc = d.workCenterId ? getWorkCenter(d.workCenterId) : null;
  if (!sup && !wc) { showToast('Scegli il centro di lavoro o il terzista del ripristino', 'error'); return null; }
  // Dal terzista il prezzo lo decide la NC, volta per volta: a suo carico è
  // zero, altrimenti quello concordato per pezzo.
  const ripristino = sup
    ? { workCenterId: wc ? wc.id : null, wcName: wc ? wc.name : 'Ripristino', supplierId: sup.id, supplierName: sup.name || '',
      costMode: 'fisso', cost: d.aCarico ? 0 : Math.max(0, Number(d.prezzo) || 0), days: Math.max(0, Number(d.giorni) || 0), note: descr }
    : { workCenterId: wc.id, wcName: wc.name || '', costMode: 'orario', hours: Math.max(0, Number(d.ore) || 0),
      rate: Number(wc.hourlyRate) || 0, note: descr };
  const scelte = new Set(d.fasiDopo || []);
  const dopo = ncRipresaFasiDopo(nc, orig).filter(f => scelte.has(f.id));
  const materiali = fermi > 0 ? [{ id: newId(), itemId: part.id, code: part.code || '', name: part.name || '', uom: itemUom(part),
    perPezzo: 1, qty, opIndex: 0 }] : [];
  const o = odpPianifica(stampNew({
    id: gid(), number: nextOdpNumber(), itemId: part.id, code: part.code || '', name: part.name || '', uom: itemUom(part),
    qty, date: oggiISO(), dueDate: d.dueDate || orig.dueDate || '', status: 'bozza',
    title: `Ripresa ${nc.number || ''} di ${orig.number || ''}`.trim(), notes: '', notesInternal: descr,
    planId: orig.planId || null, jobId: orig.jobId || null,
    phases: ncRipresaFasi(ripristino, dopo, nc.id), materials: materiali, active: true,
    reworkOfId: orig.id, ncId: nc.id, reworkInspectionId: fermi > 0 ? c.id : null,
  }));
  db.prodOrders.push(o);
  opLancia(o.id);
  if (nc.decision !== 'rilavorazione') Store.update('nonconformities', nc.id, { decision: 'rilavorazione' });
  invalidateStock(); saveDB();
  return o;
}
// Il costo della ripresa finora: le fasi interne per i pezzi lavorati (più
// l'attrezzaggio di quelle partite), quelle esterne per i rientri dell'ODL al
// suo prezzo. Il materiale no: sono gli stessi pezzi, già contati.
function qcCostoRipresa(o) {
  if (!o) return 0;
  let tot = 0;
  const righe = new Set();
  (o.phases || []).forEach(f => {
    if (f.supplierId) {
      const x = opOdlDi(f);
      if (x && !righe.has(x.line.id)) { righe.add(x.line.id); tot += (Number(x.line.received) || 0) * (Number(x.line.price) || 0); }
      return;
    }
    const pezzo = typeof consFaseCostoPezzo === 'function' ? consFaseCostoPezzo(f)
      : (f.costMode === 'orario' ? (Number(f.hours) || 0) * (Number(f.rate) || 0) : Number(f.cost) || 0);
    const att = opAvviata(o, f) && typeof costoAttrezzaggio === 'function' ? costoAttrezzaggio(f) : 0;
    tot += opProcessati(o, f) * pezzo + att;
  });
  return Math.round(tot * 100) / 100;
}
function ncCostoDaRipresa(ncId) {
  if (!ncGuard()) return false;
  const nc = ncGet(ncId); const o = ncRipresa(nc);
  if (!nc || !o || nc.status === 'chiusa') return false;
  Store.update('nonconformities', ncId, { cost: qcCostoRipresa(o) });
  return true;
}
// Sulla scheda della NC: la ripresa, o il comando per lanciarla.
function ncRipresaHtml(x, scrive) {
  if (!x.productionOrderId || typeof getOdp !== 'function' || !getOdp(x.productionOrderId)) return '';
  const aperta = x.status !== 'chiusa';
  const o = ncRipresa(x);
  if (o) {
    return `<p class="empty-text qc-hint">${ico('refresh', 'tinted', '')} Ripresa: <a href="#" onclick="openOdpFromOdl('${o.id}');return false">${esc(o.number || '')}</a>
      · ${esc(ODP_STATUS[o.status] || o.status || '')} · ${fmtQtyIt(o.qty)} ${esc(o.uom || '')} · costo finora <strong>${esc(fmtN(qcCostoRipresa(o)))}</strong></p>
      ${scrive && aperta ? `<div class="modal-actions" style="justify-content:flex-start">
        <button class="btn-outline" onclick="ncCostoDaRipresa('${x.id}');ncRidisegna()" title="Scrive nel costo della NC quello che la ripresa è costata finora">Porta nel costo della NC</button></div>` : ''}`;
  }
  if (!scrive || !aperta) return '';
  return `<div class="modal-actions" style="justify-content:flex-start">
      <button class="btn-outline" onclick="ncRipresaModal('${x.id}')" title="Un ordine di produzione separato, con la fase di ripristino">${ico('factory', 'tinted', '')} Lancia l'ODP di ripresa</button></div>`;
}
function ncRipresaModal(ncId) {
  const nc = ncGet(ncId); if (!nc || !roleGuard('docs')) return;
  const orig = nc.productionOrderId ? getOdp(nc.productionOrderId) : null; if (!orig) return;
  const c = nc.inspectionId ? qcGet(nc.inspectionId) : null;
  const fermi = c ? qcFermi(c) : 0;
  const qty = fermi > 0 ? fermi : Number(nc.qty) || 0;
  const resp = qcFaseOdp(orig, nc.respPhase);
  const dopo = ncRipresaFasiDopo(nc, orig);
  window.__ripFasi = dopo.map(f => f.id);
  const centri = (db.workCenters || []).filter(w => w.active !== false);
  const forn = (db.suppliers || []).filter(s => s.active !== false);
  const wcSel = resp && !resp.supplierId ? resp.workCenterId : '';
  const supSel = resp && resp.supplierId ? resp.supplierId : '';
  openModal(`<h3>${ico('factory', 'tinted pill', '')} ODP di ripresa</h3>
    <p>${esc(nc.number || '')} · ${esc(orig.number || '')} · <strong>${esc((orig.code || '') + ' ' + (orig.name || ''))}</strong></p>
    <div class="modal-grid">
      <div class="modal-field"><label for="rip-qty">Pezzi da riprendere</label>
        <input class="num" type="number" id="rip-qty" min="0" max="${qty}" step="any" value="${qty}"></div>
      <div class="modal-field"><label for="rip-due">Serve per</label><input type="date" id="rip-due" value="${esc((orig.dueDate || '').slice(0, 10))}"></div>
    </div>
    <h4>La fase di ripristino</h4>
    <div class="modal-field"><label for="rip-descr">Che cosa si fa</label>
      <input id="rip-descr" autocomplete="off" placeholder="es. ripresa della quota di foratura"></div>
    <div class="modal-grid">
      <div class="modal-field"><label for="rip-wc">Centro di lavoro</label>
        <select id="rip-wc"><option value="">—</option>${centri.map(w => `<option value="${esc(w.id)}" ${w.id === wcSel ? 'selected' : ''}>${esc(w.name || '')}</option>`).join('')}</select></div>
      <div class="modal-field"><label for="rip-sup">Terzista (se fuori)</label>
        <select id="rip-sup"><option value="">— in casa —</option>${forn.map(s => `<option value="${esc(s.id)}" ${s.id === supSel ? 'selected' : ''}>${esc(s.name || '')}</option>`).join('')}</select></div>
      <div class="modal-field"><label for="rip-ore">Ore per pezzo (in casa)</label><input class="num" type="number" id="rip-ore" min="0" step="any" value="0"></div>
      <div class="modal-field"><label for="rip-giorni">Giorni (dal terzista)</label><input class="num" type="number" id="rip-giorni" min="0" step="1" value="5"></div>
      <div class="modal-field"><label><input type="checkbox" id="rip-carico" checked> A carico del terzista</label></div>
      <div class="modal-field"><label for="rip-prezzo">Prezzo per pezzo, se addebitato (${esc(cur())})</label><input class="num" type="number" id="rip-prezzo" min="0" step="any" value="0"></div>
    </div>
    ${dopo.length ? `<h4>Dopo il ripristino</h4>
    <p class="empty-text" style="text-align:left;padding:0 0 6px">${fermi > 0 ? 'I pezzi hanno già fatto tutto il ciclo: spunta solo le fasi da rifare.' : 'Gli scarti si sono fermati alla fase responsabile: queste sono le fasi che non hanno ancora fatto.'}</p>
    ${dopo.map((f, i) => `<label class="rfq-pick-row"><input type="checkbox" id="rip-f-${i}" ${fermi > 0 ? '' : 'checked'}> ${esc(qcFaseTesto(f))}</label>`).join('')}` : ''}
    <p class="empty-text" style="text-align:left;padding:8px 0">${fermi > 0
    ? `Il materiale sono i <strong>${fmtQtyIt(fermi)} pezzi fermi</strong>: escono all'avvio della prima fase e tornano col versamento, che apre un collaudo nuovo.`
    : 'Gli scarti non sono a magazzino: l\'ordine parte <strong>senza prelievo</strong>, e il versamento finale apre un collaudo nuovo.'} Eredita piano e commessa di ${esc(orig.number || '')}, e nasce già lanciato.</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="ncRipresaSalva('${nc.id}')">Crea e lancia</button>
    </div>`, false, 'form');
}
function ncRipresaSalva(ncId) {
  const fasiDopo = (window.__ripFasi || []).filter((id, i) => { const el = document.getElementById('rip-f-' + i); return el && el.checked; });
  const carico = document.getElementById('rip-carico');
  const dati = { qty: rawNum('rip-qty'), dueDate: val('rip-due'), descr: val('rip-descr'), workCenterId: val('rip-wc'), supplierId: val('rip-sup'),
    ore: rawNum('rip-ore'), giorni: rawNum('rip-giorni'), aCarico: !!(carico && carico.checked), prezzo: rawNum('rip-prezzo'), fasiDopo };
  return conNumeri({ ODP: 1 }, () => {
    const o = ncRipresaCrea(ncId, dati); if (!o) return;
    closeModal(); ncRidisegna();
    showToast(`Ripresa ${o.number} lanciata`);
  });
}
// Sull'ODP di ripresa: da dove viene.
function odpRipresaHtml(o) {
  if (!o || !o.reworkOfId) return '';
  const orig = getOdp(o.reworkOfId);
  const nc = o.ncId && typeof ncGet === 'function' ? ncGet(o.ncId) : null;
  return `<p class="empty-text qc-hint" style="text-align:left">${ico('refresh', 'tinted', '')} Ripresa di
    ${orig ? `<a href="#" onclick="openOdpEdit('${orig.id}');return false">${esc(orig.number || '')}</a>` : 'un ordine eliminato'}${nc ? ` per la non conformità <a href="#" onclick="ncApriDaAltrove('${nc.id}');return false">${esc(nc.number || '')}</a>` : ''}.</p>`;
}
