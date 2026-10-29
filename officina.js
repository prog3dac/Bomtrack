// ═══════════════════════════════════════════════════════════
//  BOMTRACK — officina.js
// ═══════════════════════════════════════════════════════════
// Modulo Officina (dalla 0.123.0), nell'area Produzione interna: il terminale
// di reparto e la manutenzione dei centri. Classic script, scope globale.
//
// ─── Il terminale di reparto ───
// Una schermata a pulsanti grandi, pensata per il telefono di chi sta alla
// macchina: le fasi interne degli ODP aperti, filtrate per centro, con
// Inizia / Pausa / Fine. Ogni Inizia apre una **timbratura** (timeLogs), ogni
// Pausa o Fine la chiude: le ore di una fase sono la somma delle timbrature.
// Fine porta alla dichiarazione dei pezzi buoni e degli scarti, la stessa
// dell'ordine di produzione. Una fase non avviata si avvia prima, con la
// finestra di sempre (il materiale esce lì), e la timbratura parte dopo.
//
// Ogni operatore timbra con il suo utente: una persona ha al più una
// timbratura aperta, e cominciare una fase mette in pausa quella in corso.
//
// ─── La manutenzione ───
// Piani per centro (ogni N giorni, ogni N ore lavorate, o tutti e due) con i
// ricambi di serie; gli interventi registrati, con i ricambi che escono dal
// magazzino e il fermo macchina (dal / al), che la capacità finita legge come
// giorni in cui il centro non lavora. Le ore lavorate sono quelle timbrate.

// ═══════════════════════════════════════════════════════════
//  TIMBRATURE
// ═══════════════════════════════════════════════════════════
function timeLogs() { return (db.timeLogs || []).filter(l => l.active !== false); }
function logOre(l, adesso) {
  const a = Date.parse(l.startedAt), b = l.endedAt ? Date.parse(l.endedAt) : Date.parse(adesso || nowISO());
  return isFinite(a) && isFinite(b) && b > a ? (b - a) / 3600000 : 0;
}
function logsDiFase(odpId, faseId) { return timeLogs().filter(l => l.odpId === odpId && l.phaseId === faseId); }
// Ore timbrate su una fase, chiuse e aperte (quella aperta conta fino ad ora).
function oreTimbrate(odpId, faseId) { return logsDiFase(odpId, faseId).reduce((s, l) => s + logOre(l), 0); }
function logAperto(userId) { return timeLogs().find(l => !l.endedAt && l.userId === userId) || null; }
function logApertoDiFase(odpId, faseId, userId) {
  return timeLogs().find(l => !l.endedAt && l.odpId === odpId && l.phaseId === faseId && (!userId || l.userId === userId)) || null;
}
function utenteId() { return currentUser ? currentUser.id : null; }

function timbraInizia(odpId, faseId) {
  if (!roleGuardShop('docs')) return false;
  const o = getOdp(odpId); const f = o && (o.phases || []).find(x => x.id === faseId);
  if (!f) return false;
  if (!opAvviata(o, f)) { showToast(`La fase ${f.seq} va avviata prima di timbrare`, 'error'); return false; }
  const chi = utenteId();
  if (logApertoDiFase(odpId, faseId, chi)) return true;
  const aperto = logAperto(chi);
  if (aperto) Store.update('timeLogs', aperto.id, { endedAt: nowISO() });
  Store.insert('timeLogs', { id: gid(), odpId, phaseId: faseId, workCenterId: f.workCenterId || null, userId: chi,
    startedAt: nowISO(), endedAt: null, note: '', active: true });
  saveDB();
  return true;
}
function timbraPausa(odpId, faseId) {
  if (!roleGuardShop('docs')) return false;
  const l = logApertoDiFase(odpId, faseId, utenteId());
  if (!l) return false;
  Store.update('timeLogs', l.id, { endedAt: nowISO() });
  saveDB();
  return true;
}

// ─── I gesti del terminale ───
let repartoCentro = null;   // null = da leggere dalla preferenza del browser
const REPARTO_CENTRO_KEY = 'bomtrack_reparto_centro';
function repartoCentroScelto() {
  if (repartoCentro != null) return repartoCentro;
  try { repartoCentro = localStorage.getItem(REPARTO_CENTRO_KEY) || ''; } catch (e) { repartoCentro = ''; }
  return repartoCentro;
}
function repartoSetCentro(id) {
  repartoCentro = id || '';
  try { localStorage.setItem(REPARTO_CENTRO_KEY, repartoCentro); } catch (e) { /* preferenza non salvata */ }
  renderReparto();
}
// Le fasi interne su cui si può lavorare adesso: avviabili o in corso.
function repartoFasi(centroId) {
  const out = [];
  (db.prodOrders || []).forEach(o => {
    if (!ODP_APERTI.includes(o.status)) return;
    (o.phases || []).forEach(f => {
      if (f.supplierId) return;
      if (centroId && f.workCenterId !== centroId) return;
      const stato = opStatoFase(o, f);
      if (stato !== 'avviabile' && stato !== 'corso') return;
      out.push({ o, f, stato });
    });
  });
  return out.sort((a, b) => String(a.o.dueDate || '9999').localeCompare(String(b.o.dueDate || '9999'))
    || String(a.o.number).localeCompare(String(b.o.number)) || (a.f.seq - b.f.seq));
}
function repartoInizia(odpId, faseId) {
  const o = getOdp(odpId); const f = o && (o.phases || []).find(x => x.id === faseId);
  if (!f) return;
  if (!opAvviata(o, f)) { window.__repartoDopoAvvio = { odpId, faseId }; opAvviaModal(odpId, faseId); return; }
  if (timbraInizia(odpId, faseId)) { renderReparto(); showToast(`Fase ${f.seq} iniziata`); }
}
// Chiamato da opAvviaSave: l'avvio dal terminale porta con sé la timbratura.
function repartoDopoAvvio(odpId, faseId) {
  const x = window.__repartoDopoAvvio;
  window.__repartoDopoAvvio = null;
  if (x && x.odpId === odpId && x.faseId === faseId) timbraInizia(odpId, faseId);
}
function repartoPausa(odpId, faseId) { if (timbraPausa(odpId, faseId)) { renderReparto(); showToast('In pausa'); } }
function repartoFine(odpId, faseId) {
  timbraPausa(odpId, faseId);
  renderReparto();
  opDichiaraModal(odpId, faseId);
}
function fmtOre(h) {
  const m = Math.round((Number(h) || 0) * 60);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}'`;
}

function renderReparto() {
  const host = document.getElementById('view-reparto'); if (!host) return;
  invalidateCaches();
  const centri = (db.workCenters || []).filter(w => w.active !== false);
  let centro = repartoCentroScelto();
  if (centro && !centri.some(w => w.id === centro)) centro = '';
  const fasi = repartoFasi(centro);
  const chi = utenteId();
  const mio = logAperto(chi);
  const scrive = canWriteShop('docs');
  const card = ({ o, f, stato }) => {
    const aperto = logApertoDiFase(o.id, f.id, chi);
    const altri = timeLogs().filter(l => !l.endedAt && l.odpId === o.id && l.phaseId === f.id && l.userId !== chi).length;
    const ore = oreTimbrate(o.id, f.id);
    const previste = (Number(f.hours) || 0) * opDaFare(o, f);
    const bottoni = !scrive ? '' : aperto
      ? `<button class="add-btn-sm reparto-btn" onclick="repartoPausa('${o.id}','${f.id}')">${ico('clock', '', '')} Pausa</button>
         <button class="btn-outline reparto-btn" onclick="repartoFine('${o.id}','${f.id}')">${ico('check', 'tinted', '')} Fine e dichiara</button>`
      : `<button class="add-btn-sm reparto-btn" onclick="repartoInizia('${o.id}','${f.id}')">${ico('factory', '', '')} ${stato === 'corso' && ore > 0 ? 'Riprendi' : 'Inizia'}</button>
         ${stato === 'corso' ? `<button class="btn-outline reparto-btn" onclick="opDichiaraModal('${o.id}','${f.id}')">${ico('check', 'tinted', '')} Dichiara</button>` : ''}`;
    return `<div class="reparto-card${aperto ? ' attiva' : ''}">
      <div class="reparto-testa"><strong>${esc(o.number || '')}</strong> · fase ${esc(String(f.seq))} ${esc(f.wcName || '')}
        <span class="doc-badge">${aperto ? 'In lavorazione' : esc(ODP_FASE_LABELS[stato] || stato)}</span></div>
      <div>${esc(o.code || '')} ${esc(o.name || '')}${o.dueDate ? ` <span class="empty-text" style="padding:0">· serve il ${esc(fmtDateIt(o.dueDate))}</span>` : ''}</div>
      <div class="empty-text" style="text-align:left;padding:4px 0">Da fare ${fmtQtyIt(opResidua(o, f))} di ${fmtQtyIt(opDaFare(o, f))} pz · timbrate ${fmtOre(ore)}${previste > 0 ? ` su ${fmtOre(previste)} previste` : ''}${altri ? ` · ${altri === 1 ? 'un collega ci sta lavorando' : altri + ' colleghi ci stanno lavorando'}` : ''}</div>
      ${f.note ? `<div class="empty-text" style="text-align:left;padding:0 0 4px">${esc(f.note)}</div>` : ''}
      <div class="reparto-azioni">${bottoni}</div></div>`;
  };
  host.innerHTML = `<div class="manage-wrap">
    <div class="bom-toolbar"><div class="bom-toolbar-left">
      <h2 class="section-title">${ico('factory', 'tinted pill', '')} Reparto</h2></div></div>
    <div class="catalog-filters">
      <select onchange="repartoSetCentro(this.value)" aria-label="Centro di lavoro">
        <option value="">Tutti i centri</option>
        ${centri.map(w => `<option value="${esc(w.id)}" ${w.id === centro ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}
      </select>
    </div>
    ${mio && !fasi.some(x => x.o.id === mio.odpId && x.f.id === mio.phaseId) ? `<div class="rfq-warn">${ico('clock', 'tinted', '')} Hai una timbratura aperta su un'altra fase: ${esc((getOdp(mio.odpId) || {}).number || '')}. Cominciando questa, quella va in pausa.</div>` : ''}
    <div class="reparto-lista">${fasi.length ? fasi.map(card).join('') : '<div class="empty-text">Nessuna fase interna da lavorare' + (centro ? ' su questo centro' : '') + ': gli ordini vanno lanciati dalla vista Ordini di produzione.</div>'}</div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════
//  MANUTENZIONE
// ═══════════════════════════════════════════════════════════
function maintPlans() { return (db.maintPlans || []).filter(p => p.active !== false); }
function maintEvents() { return (db.maintEvents || []).filter(e => e.active !== false); }
function getMaintPlan(id) { return (db.maintPlans || []).find(p => p.id === id) || null; }
function ultimoIntervento(planId) {
  return maintEvents().filter(e => e.planId === planId).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
}
// Ore lavorate da un centro dopo una data: le timbrature che cominciano dopo.
function oreCentroDal(workCenterId, dal) {
  return timeLogs().filter(l => l.workCenterId === workCenterId && (!dal || String(l.startedAt).slice(0, 10) > dal))
    .reduce((s, l) => s + logOre(l), 0);
}
// Lo stato di un piano: quando scade, e se le ore l'hanno già fatto scadere.
// Senza interventi registrati si conta dalla data in cui il piano è nato.
function maintStato(p, oggi) {
  const g = oggi || oggiISO();
  const ult = ultimoIntervento(p.id);
  const dal = ult ? String(ult.date).slice(0, 10) : String(p.createdAt || g).slice(0, 10);
  const giorni = Number(p.everyDays) || 0, ore = Number(p.everyHours) || 0;
  const scadenza = giorni > 0 ? addDays(dal, giorni) : '';
  const oreFatte = ore > 0 ? oreCentroDal(p.workCenterId, dal) : 0;
  const perOre = ore > 0 && oreFatte >= ore;
  const perData = !!scadenza && scadenza <= g;
  const vicino = !!scadenza && !perData && scadenza <= addDays(g, 7) || (ore > 0 && !perOre && oreFatte >= ore * 0.9);
  return { dal, scadenza, oreFatte, scaduto: perOre || perData, vicino, ultimo: ult };
}
// I giorni di fermo di un centro: gli interventi registrati con un fermo.
function fermiCentro(workCenterId) {
  return maintEvents().filter(e => e.workCenterId === workCenterId && e.downFrom)
    .map(e => ({ from: String(e.downFrom).slice(0, 10), to: String(e.downTo || e.downFrom).slice(0, 10) }));
}
function centroFermo(workCenterId, iso) {
  if (!moduloAttivo('officina')) return false;
  return fermiCentro(workCenterId).some(c => iso >= c.from && iso <= c.to);
}

function maintPlanModal(id) {
  if (!roleGuard('manage')) return;
  const p = id ? getMaintPlan(id) : null;
  const centri = (db.workCenters || []).filter(w => w.active !== false || (p && w.id === p.workCenterId));
  const ric = (p && p.ricambi || []).map(r => { const it = getItem(r.itemId); return it ? `${it.code} ${r.qty}` : ''; }).filter(Boolean).join('\n');
  openModal(`<h3>${ico('wrench', 'tinted pill', '')} ${p ? 'Piano di manutenzione' : 'Nuovo piano di manutenzione'}</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Centro di lavoro</label><select id="mp-wc">${centri.map(w => `<option value="${esc(w.id)}" ${p && p.workCenterId === w.id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></div>
      <div class="modal-field"><label>Intervento</label><input id="mp-title" value="${esc(p ? p.title : '')}" placeholder="es. cambio olio mandrino"></div>
      <div class="modal-field"><label>Ogni (giorni)</label><input id="mp-days" type="number" min="0" step="1" value="${p && p.everyDays ? esc(String(p.everyDays)) : ''}"></div>
      <div class="modal-field"><label>Ogni (ore lavorate)</label><input id="mp-hours" type="number" min="0" step="1" value="${p && p.everyHours ? esc(String(p.everyHours)) : ''}"></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Ricambi di serie (un codice per riga, con la quantità: «CMM-001 2»)</label>
        <textarea id="mp-ric" rows="3">${esc(ric)}</textarea></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Note</label><input id="mp-notes" value="${esc(p ? p.notes || '' : '')}"></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:4px 0">Scade quando passano i giorni o quando il centro ha lavorato le ore, la prima delle due. Le ore sono quelle timbrate dal terminale di reparto.</p>
    <div class="modal-actions">
      ${p ? `<button class="btn-ghost" style="margin-right:auto;color:var(--red)" onclick="maintPlanElimina('${p.id}')">Elimina</button>` : ''}
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="maintPlanSave('${p ? p.id : ''}')">Salva</button>
    </div>`, false, 'form');
}
// «CMM-001 2» per riga → [{ itemId, qty }]. Le righe che non si capiscono si
// restituiscono a parte, per dirle invece di perderle.
function leggiRicambi(testo) {
  const out = [], scartate = [];
  String(testo || '').split('\n').map(r => r.trim()).filter(Boolean).forEach(r => {
    const m = /^(\S+)\s+([\d.,]+)$/.exec(r) || /^(\S+)$/.exec(r);
    const it = m && (db.items || []).find(i => i.code === m[1]);
    const q = m && m[2] ? parseFloat(m[2].replace(',', '.')) : 1;
    if (it && hasStock(it) && q > 0) out.push({ itemId: it.id, qty: q }); else scartate.push(r);
  });
  return { ricambi: out, scartate };
}
function maintPlanSave(id) {
  if (!roleGuard('manage')) return;
  const title = val('mp-title');
  if (!title) { showToast('Scrivi che intervento è', 'error'); return; }
  const everyDays = numVal('mp-days', 0), everyHours = numVal('mp-hours', 0);
  if (!(everyDays > 0) && !(everyHours > 0)) { showToast('Serve una scadenza: ogni quanti giorni o quante ore', 'error'); return; }
  const { ricambi, scartate } = leggiRicambi(val('mp-ric'));
  const dati = { workCenterId: val('mp-wc') || null, title, everyDays, everyHours, ricambi, notes: val('mp-notes') };
  if (id) Store.update('maintPlans', id, dati);
  else Store.insert('maintPlans', Object.assign({ id: gid(), active: true }, dati));
  saveDB(); closeModal(); renderManutenzione();
  if (scartate.length) showToast('Salvato, ma questi ricambi non li ho trovati: ' + scartate.join(', '), 'error');
  else savedToast('Piano salvato');
}
function maintPlanElimina(id) {
  if (!roleGuard('manage')) return;
  askConfirm('Eliminare il piano di manutenzione? Gli interventi già registrati restano.', () => {
    Store.update('maintPlans', id, { active: false }); saveDB(); closeModal(); renderManutenzione();
  });
}
function maintEventModal(planId, workCenterId) {
  if (!roleGuardShop('docs')) return;
  const p = planId ? getMaintPlan(planId) : null;
  const wc = getWorkCenter(p ? p.workCenterId : workCenterId);
  const ric = (p && p.ricambi || []).map(r => { const it = getItem(r.itemId); return it ? `${it.code} ${r.qty}` : ''; }).filter(Boolean).join('\n');
  openModal(`<h3>${ico('wrench', 'tinted pill', '')} Registra intervento</h3>
    <p><strong>${esc(wc ? wc.name : '')}</strong>${p ? ' — ' + esc(p.title) : ''}</p>
    <div class="modal-grid">
      <div class="modal-field"><label>Data</label><input id="me-date" type="date" value="${esc(oggiISO())}"></div>
      <div class="modal-field"></div>
      <div class="modal-field"><label>Fermo macchina dal</label><input id="me-from" type="date"></div>
      <div class="modal-field"><label>al</label><input id="me-to" type="date"></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Ricambi usati (escono dal magazzino)</label><textarea id="me-ric" rows="3">${esc(ric)}</textarea></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Nota</label><input id="me-note" placeholder="cosa si è fatto"></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:4px 0">Un fermo anche futuro si scrive qui: la capacità finita non mette fasi su quel centro in quei giorni.</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="maintEventSave('${p ? p.id : ''}','${esc(wc ? wc.id : '')}')">Registra</button>
    </div>`, false, 'form');
}
function maintEventSave(planId, workCenterId) {
  if (!roleGuardShop('docs')) return;
  const date = val('me-date') || oggiISO();
  const downFrom = val('me-from'), downTo = val('me-to');
  if (downTo && !downFrom) { showToast('Il fermo ha bisogno della data d\'inizio', 'error'); return; }
  if (downFrom && downTo && downTo < downFrom) { showToast('Il fermo finisce prima di cominciare', 'error'); return; }
  const { ricambi, scartate } = leggiRicambi(val('me-ric'));
  const ev = Store.insert('maintEvents', { id: gid(), planId: planId || null, workCenterId: workCenterId || null, date,
    downFrom: downFrom || null, downTo: downTo || downFrom || null, ricambi, note: val('me-note'), active: true });
  if (!ev) return;
  const wc = getWorkCenter(workCenterId);
  ricambi.forEach(r => addMovement(r.itemId, 'scarico', -r.qty, `Manutenzione ${wc ? wc.name : ''}`.trim(), { orderId: ev.id }));
  saveDB(); closeModal(); renderManutenzione();
  if (scartate.length) showToast('Registrato, ma questi ricambi non li ho trovati: ' + scartate.join(', '), 'error');
  else savedToast('Intervento registrato');
}

function renderManutenzione() {
  const host = document.getElementById('view-manutenzione'); if (!host) return;
  invalidateCaches();
  const oggi = oggiISO();
  const piani = maintPlans().map(p => ({ p, s: maintStato(p, oggi), wc: getWorkCenter(p.workCenterId) }))
    .sort((a, b) => (b.s.scaduto - a.s.scaduto) || String(a.s.scadenza || '9999').localeCompare(String(b.s.scadenza || '9999')));
  const gestisce = canWrite('manage'), registra = canWriteShop('docs');
  const righe = piani.map(({ p, s, wc }) => `<tr>
      <td>${esc(wc ? wc.name : '(centro mancante)')}</td><td>${esc(p.title)}</td>
      <td>${[p.everyDays ? `ogni ${p.everyDays} gg` : '', p.everyHours ? `ogni ${p.everyHours} h` : ''].filter(Boolean).join(' o ')}</td>
      <td>${s.ultimo ? esc(fmtDateIt(s.ultimo.date)) : '<span class="empty-text" style="padding:0">mai</span>'}</td>
      <td style="color:${s.scaduto ? 'var(--red)' : s.vicino ? 'var(--orange)' : 'inherit'}">${s.scaduto ? 'Scaduto' : s.scadenza ? esc(fmtDateIt(s.scadenza)) : '—'}${p.everyHours ? ` · ${fmtQtyIt(+s.oreFatte.toFixed(1))} / ${p.everyHours} h` : ''}</td>
      <td style="white-space:nowrap">${registra ? `<button class="btn-outline" onclick="maintEventModal('${p.id}')">Registra</button>` : ''}
        ${gestisce ? `<button class="btn-ghost" onclick="maintPlanModal('${p.id}')">${ico('edit', 'tinted', 'Modifica')}</button>` : ''}</td></tr>`).join('');
  const storico = maintEvents().slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30).map(e => {
    const wc = getWorkCenter(e.workCenterId), p = getMaintPlan(e.planId);
    return `<tr><td>${esc(fmtDateIt(e.date))}</td><td>${esc(wc ? wc.name : '')}</td><td>${esc(p ? p.title : 'fuori piano')}</td>
      <td>${e.downFrom ? `${esc(fmtDateIt(e.downFrom))}${e.downTo && e.downTo !== e.downFrom ? ' → ' + esc(fmtDateIt(e.downTo)) : ''}` : '—'}</td>
      <td>${(e.ricambi || []).map(r => { const it = getItem(r.itemId); return it ? esc(it.code) + ' ×' + fmtQtyIt(r.qty) : ''; }).filter(Boolean).join(', ') || '—'}</td>
      <td>${esc(e.note || '')}</td></tr>`;
  }).join('');
  host.innerHTML = `<div class="manage-wrap">
    <div class="bom-toolbar"><div class="bom-toolbar-left">
      <h2 class="section-title">${ico('wrench', 'tinted pill', '')} Manutenzione</h2></div>
      <div class="bom-toolbar-right">${gestisce ? `<button class="add-btn-sm" onclick="maintPlanModal()">+ Nuovo piano</button>` : ''}</div></div>
    <div class="mrp-section"><div class="cycle-section-head"><h3>Piani</h3></div>
      ${righe ? `<div class="table-wrap"><table class="dash-table"><thead><tr><th>Centro</th><th>Intervento</th><th>Frequenza</th><th>Ultimo</th><th>Prossimo</th><th></th></tr></thead><tbody>${righe}</tbody></table></div>`
        : '<div class="empty-text">Nessun piano di manutenzione. Uno per intervento ricorrente su un centro: ogni quanti giorni, o ogni quante ore lavorate.</div>'}</div>
    <div class="mrp-section"><div class="cycle-section-head"><h3>Interventi registrati</h3>
      ${registra && (db.workCenters || []).length ? `<select onchange="if(this.value){maintEventModal('', this.value); this.value='';}" aria-label="Intervento fuori piano"><option value="">+ Intervento fuori piano…</option>${(db.workCenters || []).filter(w => w.active !== false).map(w => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}</select>` : ''}</div>
      ${storico ? `<div class="table-wrap"><table class="dash-table"><thead><tr><th>Data</th><th>Centro</th><th>Intervento</th><th>Fermo</th><th>Ricambi</th><th>Nota</th></tr></thead><tbody>${storico}</tbody></table></div>`
        : '<div class="empty-text">Nessun intervento registrato.</div>'}</div>
  </div>`;
}
