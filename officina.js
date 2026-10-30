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
// La schermata (dalla 0.132.0): i centri in una barra a sinistra; ogni scheda
// ha in cima la situazione (da avviare, avviata, in ritardo sulle date
// pianificate dell'ODP, terminata) e in fondo se si lavora o si è in pausa.
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
  Store.insert('timeLogs', { id: gid(), odpId, phaseId: faseId, workCenterId: f.workCenterId || null, machineId: f.machineId || null, userId: chi,
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
// Le fasi interne su cui si può lavorare adesso: avviabili o in corso. Con
// `tutte` (la schermata, dalla 0.132.0) anche le fasi future, in attesa della
// precedente, per inizio previsto, e in fondo quelle già terminate degli
// ordini ancora aperti: una timbratura rimasta aperta su una fase che un
// collega ha chiuso si può ancora fermare.
const REPARTO_GRUPPO = { avviabile: 0, corso: 0, attesa: 1, chiusa: 2 };
function repartoFasi(centroId, tutte) {
  const out = [];
  (db.prodOrders || []).forEach(o => {
    if (!ODP_APERTI.includes(o.status)) return;
    (o.phases || []).forEach(f => {
      if (f.supplierId) return;
      // Il filtro è un centro, o una macchina («m:<id>», modulo Macchine utensili).
      if (centroId && (String(centroId).startsWith('m:') ? f.machineId !== centroId.slice(2) : f.workCenterId !== centroId)) return;
      const stato = opStatoFase(o, f);
      if (stato !== 'avviabile' && stato !== 'corso' && !tutte) return;
      out.push({ o, f, stato });
    });
  });
  return out.sort((a, b) => REPARTO_GRUPPO[a.stato] - REPARTO_GRUPPO[b.stato]
    || (a.stato === 'attesa' ? String(a.f.plannedStart || '9999').localeCompare(String(b.f.plannedStart || '9999')) : 0)
    || String(a.o.dueDate || '9999').localeCompare(String(b.o.dueDate || '9999'))
    || String(a.o.number).localeCompare(String(b.o.number)) || (a.f.seq - b.f.seq));
}
// La situazione della fase, nella riga in cima alla scheda (dalla 0.132.0):
// da avviare, avviata, in ritardo sulle date pianificate dell'ODP, terminata.
// Il ritardo vince sugli altri due: una fase non partita che doveva partire,
// o una che doveva già finire.
function repartoSituazione(o, f, stato) {
  if (stato === 'chiusa') return { id: 'terminata', label: 'Terminata', nota: '' };
  const oggi = oggiISO();
  const avviata = stato === 'corso';
  if (f.plannedEnd && f.plannedEnd < oggi) return { id: 'ritardo', label: 'In ritardo', nota: `doveva finire il ${fmtDateIt(f.plannedEnd)}` };
  if (!avviata && f.plannedStart && f.plannedStart < oggi) return { id: 'ritardo', label: 'In ritardo', nota: `doveva iniziare il ${fmtDateIt(f.plannedStart)}` };
  if (avviata) return { id: 'avviata', label: 'Avviata', nota: '' };
  const prec = stato === 'attesa' ? opPrecedente(o, f) : null;
  return { id: 'avviare', label: 'Da avviare', nota: prec ? `dopo la fase ${prec.seq}` : '' };
}
// Da quanto si lavora senza interruzioni: dalla timbratura aperta più vecchia
// della fase. Zero se nessuno ci lavora.
function repartoOreSessione(odpId, faseId) {
  const aperti = logsDiFase(odpId, faseId).filter(l => !l.endedAt);
  return aperti.reduce((m, l) => Math.max(m, logOre(l)), 0);
}
// I tempi delle schede si aggiornano da soli ogni minuto, senza ridisegnare la
// schermata: chi sta scrivendo una nota o ha il fuoco su un pulsante non lo perde.
function repartoTempo(odpId, faseId, tipo) {
  const v = tipo === 'sessione' ? repartoOreSessione(odpId, faseId) : oreTimbrate(odpId, faseId);
  return `<span class="reparto-tempo" data-odp="${esc(odpId)}" data-fase="${esc(faseId)}" data-tipo="${tipo}">${fmtOre(v)}</span>`;
}
function repartoAggiornaTempi() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('#view-reparto .reparto-tempo, #reparto-qr-scheda .reparto-tempo').forEach(el => {
    const v = el.dataset.tipo === 'sessione' ? repartoOreSessione(el.dataset.odp, el.dataset.fase) : oreTimbrate(el.dataset.odp, el.dataset.fase);
    el.textContent = fmtOre(v);
  });
}
let _repartoGiro = null;
// Chi ci sta lavorando adesso: le timbrature aperte sulla fase, «tu» per primo.
function repartoChiLavora(o, f, chi) {
  const aperti = timeLogs().filter(l => !l.endedAt && l.odpId === o.id && l.phaseId === f.id);
  const nomi = aperti.map(l => l.userId === chi ? 'tu' : ((typeof getUser === 'function' && getUser(l.userId) || {}).name || 'un collega'));
  return nomi.sort((a, b) => (b === 'tu') - (a === 'tu'));
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

// La scheda di una fase: la stessa nella schermata, nella scheda rapida del
// suo QR e sul foglio stampato.
function repartoCardHtml(o, f, stato) {
  const chi = utenteId();
  const scrive = canWriteShop('docs');
  const conMacchine = moduloAttivo('macchine');
  const aperto = logApertoDiFase(o.id, f.id, chi);
  const sit = repartoSituazione(o, f, stato);
  const lavorano = repartoChiLavora(o, f, chi);
  const ore = oreTimbrate(o.id, f.id);
  const attesa = stato === 'attesa';
  const pezzi = attesa ? opAttesiFase(o, f) : opDaFare(o, f);
  const previste = (Number(f.hours) || 0) * pezzi;
  const bottoni = !scrive ? '' : aperto
    ? `<button class="add-btn-sm reparto-btn" onclick="repartoPausa('${o.id}','${f.id}')">${ico('clock', '', '')} Pausa</button>
       ${stato !== 'chiusa' ? `<button class="btn-outline reparto-btn" onclick="repartoFine('${o.id}','${f.id}')">${ico('check', 'tinted', '')} Fine e dichiara</button>` : ''}`
    : stato === 'chiusa' || attesa ? ''
    : `<button class="add-btn-sm reparto-btn" onclick="repartoInizia('${o.id}','${f.id}')">${ico('factory', '', '')} ${stato === 'corso' && ore > 0 ? 'Riprendi' : 'Inizia'}</button>
       ${stato === 'corso' ? `<button class="btn-outline reparto-btn" onclick="opDichiaraModal('${o.id}','${f.id}')">${ico('check', 'tinted', '')} Dichiara</button>` : ''}`;
  // La riga in fondo: si lavora o no, adesso. Una fase terminata la mostra
  // solo se qualcuno ha ancora una timbratura aperta.
  const lavoro = lavorano.length
    ? `<div class="reparto-lavoro on">${ico('factory', '', '')} <span>In lavorazione da ${repartoTempo(o.id, f.id, 'sessione')} · ${esc(lavorano.join(', '))}</span></div>`
    : stato === 'corso' ? `<div class="reparto-lavoro pausa">${ico('clock', '', '')} <span>In pausa${ore > 0 ? '' : ' · nessuna timbratura'}</span></div>`
    : stato === 'avviabile' ? `<div class="reparto-lavoro">Non ancora iniziata</div>`
    : attesa ? `<div class="reparto-lavoro">In attesa · ${esc(opAvviabile(o, f).motivo || '')}</div>` : '';
  const codiceQr = repartoCodiceQr(o, f);
  return `<div class="reparto-card${lavorano.length ? ' attiva' : ''}" data-odp="${esc(o.id)}" data-fase="${esc(f.id)}">
    <div class="reparto-sit ${sit.id}"><strong>${esc(sit.label)}</strong>${sit.nota ? `<span>${esc(sit.nota)}</span>` : ''}</div>
    <div class="reparto-corpo">
    <div class="reparto-testa"><span><strong>${esc(o.number || '')}</strong> · fase ${esc(String(f.seq))} ${esc(f.wcName || '')}${conMacchine && f.machineId ? ' · ' + esc(machineLabel(getMachine(f.machineId)) || f.machineName || '') : ''}</span>
      <button type="button" class="btn-ghost reparto-stampa" onclick="repartoStampa('${o.id}','${f.id}')" title="Stampa questa scheda, con il suo QR" aria-label="Stampa la scheda">${ico('printer', 'tinted', '')}</button></div>
    <div>${esc(o.code || '')} ${esc(o.name || '')}</div>
    <div class="reparto-date">Inizio previsto <strong>${f.plannedStart ? esc(fmtDateIt(f.plannedStart)) : 'non pianificato'}</strong>${f.plannedEnd ? ` · fine ${esc(fmtDateIt(f.plannedEnd))}` : ''}${o.dueDate ? ` · serve il ${esc(fmtDateIt(o.dueDate))}` : ''}</div>
    <div class="reparto-numeri">
      <div><span class="reparto-num-l">${stato === 'chiusa' ? 'Fatti' : attesa ? 'Attesi' : 'Da fare'}</span>
        <strong>${stato === 'chiusa' ? fmtQtyIt(opFatti(o, f)) : attesa ? fmtQtyIt(pezzi) : `${fmtQtyIt(opResidua(o, f))} <span class="reparto-num-di">di ${fmtQtyIt(opDaFare(o, f))}</span>`} pz</strong></div>
      <div><span class="reparto-num-l">Tempo lavorato</span>
        <strong>${repartoTempo(o.id, f.id, 'totale')}</strong>${previste > 0 ? ` <span class="reparto-num-di">su ${fmtOre(previste)} previste</span>` : ''}</div>
    </div>
    ${f.note ? `<div class="empty-text" style="text-align:left;padding:0 0 4px">${esc(f.note)}</div>` : ''}
    ${bottoni ? `<div class="reparto-azioni">${bottoni}</div>` : ''}
    ${typeof qrSvg === 'function' && qrDisponibile() ? `<div class="reparto-qr">${qrSvg(qrLink('fase', codiceQr), 96)}<span>${esc(codiceQr)}</span></div>` : ''}
    </div>
    ${lavoro}</div>`;
}

// Il codice del QR della scheda (dalla 0.132.0): numero dell'ODP e fase,
// leggibili a occhio come gli altri codici (qr.js).
function repartoCodiceQr(o, f) { return `${o.number || o.id}/${f.seq}`; }
// La scheda aperta dal suo QR, se c'è, segue i gesti come la schermata.
function repartoAggiornaScheda() {
  const el = typeof document !== 'undefined' && document.getElementById('reparto-qr-scheda');
  if (!el) return;
  const o = getOdp(el.dataset.odp); const f = o && (o.phases || []).find(x => x.id === el.dataset.fase);
  if (f) el.innerHTML = repartoCardHtml(o, f, opStatoFase(o, f));
}
// Stampa: tutte le schede della schermata (il centro scelto), o una sola.
function repartoStampa(odpId, faseId) {
  if (typeof document === 'undefined') return;
  const una = !!(odpId && faseId);
  document.body.classList.add('reparto-stampa');
  if (una) {
    document.body.classList.add('reparto-stampa-una');
    document.querySelectorAll('#view-reparto .reparto-card').forEach(c => c.classList.toggle('stampa-sola', c.dataset.odp === odpId && c.dataset.fase === faseId));
  }
  const pulisci = () => {
    document.body.classList.remove('reparto-stampa', 'reparto-stampa-una');
    document.querySelectorAll('.reparto-card.stampa-sola').forEach(c => c.classList.remove('stampa-sola'));
    window.removeEventListener('afterprint', pulisci);
  };
  window.addEventListener('afterprint', pulisci);
  printView();
}

function renderReparto() {
  const host = document.getElementById('view-reparto'); if (!host) return;
  invalidateCaches();
  const centri = (db.workCenters || []).filter(w => w.active !== false);
  let centro = repartoCentroScelto();
  const conMacchine = moduloAttivo('macchine');
  if (centro && !(centro.startsWith('m:') ? conMacchine && machines().some(m => 'm:' + m.id === centro) : centri.some(w => w.id === centro))) centro = '';
  const fasi = repartoFasi(centro, true);
  const chi = utenteId();
  const mio = logAperto(chi);
  // La barra dei centri: ognuno con le fasi da lavorare (non le terminate).
  const voce = (id, nome, sotto) => {
    const n = repartoFasi(id).length;
    const on = id === centro;
    return `<button type="button" class="reparto-centro${sotto ? ' sotto' : ''}${on ? ' on' : ''}" aria-pressed="${on}" onclick="repartoSetCentro('${esc(id)}')">
      <span>${sotto ? '↳ ' : ''}${esc(nome)}</span><span class="reparto-centro-n">${n}</span></button>`;
  };
  const barra = voce('', 'Tutti i centri') + centri.map(w => voce(w.id, w.name)
    + (conMacchine ? macchineDelCentro(w.id).filter(m => m.active !== false).map(m => voce('m:' + m.id, machineLabel(m), true)).join('') : '')).join('');
  if (!_repartoGiro && typeof setInterval === 'function') _repartoGiro = setInterval(repartoAggiornaTempi, 60000);
  host.innerHTML = `<div class="manage-wrap">
    <div class="bom-toolbar"><div class="bom-toolbar-left">
      <h2 class="section-title">${ico('factory', 'tinted pill', '')} Reparto</h2></div>
      <div class="bom-toolbar-right"><button class="btn-outline" onclick="repartoStampa()" ${fasi.length ? '' : 'disabled'}>${ico('printer', 'tinted', '')} Stampa le schede</button></div></div>
    <div class="reparto-layout">
      <nav class="reparto-centri" aria-label="Centri di lavoro">${barra}</nav>
      <div>
        ${mio && !fasi.some(x => x.o.id === mio.odpId && x.f.id === mio.phaseId) ? `<div class="rfq-warn">${ico('clock', 'tinted', '')} Hai una timbratura aperta su un'altra fase: ${esc((getOdp(mio.odpId) || {}).number || '')}. Cominciando questa, quella va in pausa.</div>` : ''}
        <div class="reparto-lista">${fasi.length ? fasi.map(x => repartoCardHtml(x.o, x.f, x.stato)).join('') : '<div class="empty-text">Nessuna fase interna da lavorare' + (centro ? (centro.startsWith('m:') ? ' su questa macchina' : ' su questo centro') : '') + ': gli ordini vanno lanciati dalla vista Ordini di produzione.</div>'}</div>
      </div>
    </div>
  </div>`;
  repartoAggiornaScheda();
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
  // Un piano di una macchina conta le ore di quella macchina, non del reparto.
  const perMacchina = p.machineId && moduloAttivo('macchine');
  const oreFatte = ore > 0 ? (perMacchina ? oreMacchinaDal(p.machineId, dal) : oreCentroDal(p.workCenterId, dal)) : 0;
  const perOre = ore > 0 && oreFatte >= ore;
  const perData = !!scadenza && scadenza <= g;
  const vicino = !!scadenza && !perData && scadenza <= addDays(g, 7) || (ore > 0 && !perOre && oreFatte >= ore * 0.9);
  return { dal, scadenza, oreFatte, scaduto: perOre || perData, vicino, ultimo: ult };
}
// I giorni di fermo di un centro: gli interventi registrati con un fermo.
// Con il modulo Macchine utensili il fermo di una macchina ferma lei sola
// (macchinaFerma, quotaCentroAttiva in macchine.js); senza, ferma il centro.
function fermiCentro(workCenterId) {
  const perMacchina = moduloAttivo('macchine');
  return maintEvents().filter(e => e.workCenterId === workCenterId && e.downFrom && !(perMacchina && e.machineId))
    .map(e => ({ from: String(e.downFrom).slice(0, 10), to: String(e.downTo || e.downFrom).slice(0, 10) }));
}
function centroFermo(workCenterId, iso) {
  if (!moduloAttivo('officina')) return false;
  return fermiCentro(workCenterId).some(c => iso >= c.from && iso <= c.to);
}

function maintPlanModal(id) {
  if (!roleGuard('manage')) return;
  const p = id ? getMaintPlan(id) : null;
  const ric = (p && p.ricambi || []).map(r => { const it = getItem(r.itemId); return it ? `${it.code} ${r.qty}` : ''; }).filter(Boolean).join('\n');
  const conMacchine = moduloAttivo('macchine');
  openModal(`<h3>${ico('wrench', 'tinted pill', '')} ${p ? 'Piano di manutenzione' : 'Nuovo piano di manutenzione'}</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>${conMacchine ? 'Centro o macchina' : 'Centro di lavoro'}</label><select id="mp-wc">${doveOptions(doveValore(p))}</select></div>
      <div class="modal-field"><label>Intervento</label><input id="mp-title" value="${esc(p ? p.title : '')}" placeholder="es. cambio olio mandrino"></div>
      <div class="modal-field"><label>Ogni (giorni)</label><input id="mp-days" type="number" min="0" step="1" value="${p && p.everyDays ? esc(String(p.everyDays)) : ''}"></div>
      <div class="modal-field"><label>Ogni (ore lavorate)</label><input id="mp-hours" type="number" min="0" step="1" value="${p && p.everyHours ? esc(String(p.everyHours)) : ''}"></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Ricambi di serie (un codice per riga, con la quantità: «CMM-001 2»)</label>
        <textarea id="mp-ric" rows="3">${esc(ric)}</textarea></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Note</label><input id="mp-notes" value="${esc(p ? p.notes || '' : '')}"></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:4px 0">Scade quando passano i giorni o quando ${conMacchine ? 'il centro (o la macchina)' : 'il centro'} ha lavorato le ore, la prima delle due. Le ore sono quelle timbrate dal terminale di reparto${conMacchine ? '; per una macchina, divise per gli operatori della fase' : ''}.</p>
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
  const dove = leggiDove(val('mp-wc'));
  if (!dove.workCenterId) { showToast('Scegli il centro', 'error'); return; }
  const dati = { workCenterId: dove.workCenterId, machineId: dove.machineId, title, everyDays, everyHours, ricambi, notes: val('mp-notes') };
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
// `dove` è un centro o una macchina, come nella tendina (leggiDove): «wc:…»,
// «m:…», o l'id nudo di un centro.
function maintEventModal(planId, dove) {
  if (!roleGuardShop('docs')) return;
  const p = planId ? getMaintPlan(planId) : null;
  const d = p ? { workCenterId: p.workCenterId, machineId: moduloAttivo('macchine') ? p.machineId || null : null } : leggiDove(dove);
  const wc = getWorkCenter(d.workCenterId);
  const ric = (p && p.ricambi || []).map(r => { const it = getItem(r.itemId); return it ? `${it.code} ${r.qty}` : ''; }).filter(Boolean).join('\n');
  openModal(`<h3>${ico('wrench', 'tinted pill', '')} Registra intervento</h3>
    <p><strong>${esc(dovePlanLabel(d))}</strong>${p ? ' — ' + esc(p.title) : ''}</p>
    <div class="modal-grid">
      <div class="modal-field"><label>Data</label><input id="me-date" type="date" value="${esc(oggiISO())}"></div>
      <div class="modal-field"></div>
      <div class="modal-field"><label>Fermo macchina dal</label><input id="me-from" type="date"></div>
      <div class="modal-field"><label>al</label><input id="me-to" type="date"></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Ricambi usati (escono dal magazzino)</label><textarea id="me-ric" rows="3">${esc(ric)}</textarea></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Nota</label><input id="me-note" placeholder="cosa si è fatto"></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:4px 0">Un fermo anche futuro si scrive qui: la capacità finita non mette fasi su ${d.machineId ? 'quella macchina' : 'quel centro'} in quei giorni${d.machineId ? ', e il centro lavora con le altre' : ''}.</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="maintEventSave('${p ? p.id : ''}','${esc(d.machineId ? 'm:' + d.machineId : wc ? 'wc:' + wc.id : '')}')">Registra</button>
    </div>`, false, 'form');
}
function maintEventSave(planId, dove) {
  if (!roleGuardShop('docs')) return;
  const date = val('me-date') || oggiISO();
  const downFrom = val('me-from'), downTo = val('me-to');
  if (downTo && !downFrom) { showToast('Il fermo ha bisogno della data d\'inizio', 'error'); return; }
  if (downFrom && downTo && downTo < downFrom) { showToast('Il fermo finisce prima di cominciare', 'error'); return; }
  const { ricambi, scartate } = leggiRicambi(val('me-ric'));
  // Un intervento di un piano sta dove sta il piano.
  const p = planId ? getMaintPlan(planId) : null;
  const d = p ? { workCenterId: p.workCenterId || null, machineId: p.machineId || null } : leggiDove(dove);
  const ev = Store.insert('maintEvents', { id: gid(), planId: planId || null, workCenterId: d.workCenterId, machineId: d.machineId, date,
    downFrom: downFrom || null, downTo: downTo || downFrom || null, ricambi, note: val('me-note'), active: true });
  if (!ev) return;
  ricambi.forEach(r => addMovement(r.itemId, 'scarico', -r.qty, `Manutenzione ${dovePlanLabel(d)}`.trim(), { orderId: ev.id }));
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
      <td>${esc(dovePlanLabel(p))}</td><td>${esc(p.title)}</td>
      <td>${[p.everyDays ? `ogni ${p.everyDays} gg` : '', p.everyHours ? `ogni ${p.everyHours} h` : ''].filter(Boolean).join(' o ')}</td>
      <td>${s.ultimo ? esc(fmtDateIt(s.ultimo.date)) : '<span class="empty-text" style="padding:0">mai</span>'}</td>
      <td style="color:${s.scaduto ? 'var(--red)' : s.vicino ? 'var(--orange)' : 'inherit'}">${s.scaduto ? 'Scaduto' : s.scadenza ? esc(fmtDateIt(s.scadenza)) : '—'}${p.everyHours ? ` · ${fmtQtyIt(+s.oreFatte.toFixed(1))} / ${p.everyHours} h` : ''}</td>
      <td style="white-space:nowrap">${registra ? `<button class="btn-outline" onclick="maintEventModal('${p.id}')">Registra</button>` : ''}
        ${gestisce ? `<button class="btn-ghost" onclick="maintPlanModal('${p.id}')">${ico('edit', 'tinted', 'Modifica')}</button>` : ''}</td></tr>`).join('');
  const storico = maintEvents().slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30).map(e => {
    const p = getMaintPlan(e.planId);
    return `<tr><td>${esc(fmtDateIt(e.date))}</td><td>${esc(dovePlanLabel(e))}</td><td>${esc(p ? p.title : 'fuori piano')}</td>
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
      ${registra && (db.workCenters || []).length ? `<select onchange="if(this.value){maintEventModal('', this.value); this.value='';}" aria-label="Intervento fuori piano"><option value="">+ Intervento fuori piano…</option>${doveOptions('')}</select>` : ''}</div>
      ${storico ? `<div class="table-wrap"><table class="dash-table"><thead><tr><th>Data</th><th>Centro</th><th>Intervento</th><th>Fermo</th><th>Ricambi</th><th>Nota</th></tr></thead><tbody>${storico}</tbody></table></div>`
        : '<div class="empty-text">Nessun intervento registrato.</div>'}</div>
  </div>`;
}
