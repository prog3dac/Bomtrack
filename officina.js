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
  // Passare a un'altra fase chiude quella in corso come «Cambio lavoro»: non
  // è tempo perso, e non si chiede niente (dalla 0.160.0).
  const aperto = logAperto(chi);
  if (aperto) Store.update('timeLogs', aperto.id, { endedAt: nowISO(), pauseReason: PAUSA_CAMBIO, pauseNote: '' });
  Store.insert('timeLogs', { id: gid(), odpId, phaseId: faseId, workCenterId: f.workCenterId || null, machineId: f.machineId || null, userId: chi,
    startedAt: nowISO(), endedAt: null, note: '', active: true });
  saveDB();
  return true;
}
// `causale` (dalla 0.160.0): l'id della causale della pausa; senza, la
// timbratura si chiude e basta (Fine e dichiara: la fase è finita).
function timbraPausa(odpId, faseId, causale, nota) {
  if (!roleGuardShop('docs')) return false;
  const l = logApertoDiFase(odpId, faseId, utenteId());
  if (!l) return false;
  const campi = { endedAt: nowISO() };
  if (causale) { campi.pauseReason = causale; campi.pauseNote = String(nota || '').trim(); }
  Store.update('timeLogs', l.id, campi);
  saveDB();
  return true;
}

// ═══════════════════════════════════════════════════════════
//  CAUSALI DI PAUSA (dalla 0.160.0)
// ═══════════════════════════════════════════════════════════
// La Pausa del reparto chiede perché, con un tocco. La pausa non è un record:
// è il tempo fra la fine di una timbratura e la timbratura dopo della stessa
// persona, e la causale sta sulla timbratura che si chiude. Le causali che
// «contano come tempo perso» fanno le ore perse del centro e della macchina
// della fase; le ore lavorate non cambiano, e con loro consuntivo, contatori
// delle macchine e manutenzione.
//
// Una pausa che non riprende in giornata si ferma all'ora di fine giornata del
// calendario di fabbrica: la notte non è tempo perso, e un guasto di più
// giorni è un fermo di manutenzione, che la capacità finita già conosce.
const PAUSA_CAMBIO = 'cambio';   // fissa: passare a un'altra fase, non si chiede
const PAUSE_DI_SERIE = [
  { id: 'turno', name: 'Fine turno', lost: false, maint: false },
  { id: 'personale', name: 'Pausa personale', lost: false, maint: false },
  { id: 'materiale', name: 'Attesa materiale', lost: true, maint: false },
  { id: 'attrezzaggio', name: 'Attesa attrezzaggio o utensile', lost: true, maint: false },
  { id: 'controllo', name: 'Attesa controllo qualità', lost: true, maint: false },
  { id: 'guasto', name: 'Guasto macchina', lost: true, maint: true },
  { id: 'altro', name: 'Altro', lost: true, maint: false, nota: true },
];
function causaliPausa(tutte) {
  const l = db.settings && Array.isArray(db.settings.pauseReasons) ? db.settings.pauseReasons : PAUSE_DI_SERIE;
  return tutte ? l : l.filter(c => c.active !== false);
}
function causalePausa(id) {
  if (!id) return null;
  if (id === PAUSA_CAMBIO) return { id, name: 'Cambio lavoro', lost: false, maint: false, fissa: true };
  return causaliPausa(true).find(c => c.id === id) || null;
}
function causaleNome(id) { const c = causalePausa(id); return c ? c.name : (id ? 'causale eliminata' : ''); }

// L'ora di fine giornata del calendario, «HH:MM» (di serie le 17:00).
function fineGiornataOra() {
  const v = typeof calSettings === 'function' ? calSettings().dayEnd : '';
  return /^\d{2}:\d{2}$/.test(v || '') ? v : '17:00';
}
// La fine della giornata in cui cade un istante, nell'ora locale.
function fineGiornataDi(ms) {
  const d = new Date(ms);
  const [h, m] = fineGiornataOra().split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

// Le pause: una per timbratura chiusa con una causale. Va da quando la
// timbratura si chiude alla timbratura dopo della stessa persona (su qualsiasi
// fase), o ad adesso se non ha ripreso; mai oltre la fine di quella giornata.
// `dal` e `al` (AAAA-MM-GG) filtrano sul giorno in cui la pausa comincia.
function pauseTimbrate(opts) {
  const o = opts || {};
  const adesso = Date.parse(o.adesso || nowISO());
  const perUtente = new Map();
  timeLogs().forEach(l => {
    const k = l.userId || '';
    if (!perUtente.has(k)) perUtente.set(k, []);
    perUtente.get(k).push(l);
  });
  const out = [];
  perUtente.forEach(lista => {
    lista.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
    lista.forEach((l, i) => {
      if (!l.endedAt || !l.pauseReason) return;
      if (o.odpId && (l.odpId !== o.odpId || l.phaseId !== o.faseId)) return;
      const da = Date.parse(l.endedAt);
      if (!isFinite(da)) return;
      const giorno = giornoLocaleDi(da);
      if ((o.dal && giorno < o.dal) || (o.al && giorno > o.al)) return;
      const dopo = lista.slice(i + 1).find(x => Date.parse(x.startedAt) >= da);
      const ripresa = dopo ? Date.parse(dopo.startedAt) : null;
      const fine = Math.min(ripresa != null ? ripresa : adesso, fineGiornataDi(da));
      const ore = fine > da ? (fine - da) / 3600000 : 0;
      const c = causalePausa(l.pauseReason);
      out.push({ log: l, causale: c, causaleId: l.pauseReason, nota: l.pauseNote || '', da: l.endedAt,
        ore, perse: c && c.lost ? ore : 0, aperta: ripresa == null });
    });
  });
  return out.sort((a, b) => String(b.da).localeCompare(String(a.da)));
}
// Il giorno locale di un istante, AAAA-MM-GG.
function giornoLocaleDi(ms) {
  const d = new Date(ms);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function orePerseFase(odpId, faseId) {
  return pauseTimbrate({ odpId, faseId }).reduce((s, p) => s + p.perse, 0);
}
// L'ultima pausa di una fase ferma: la timbratura chiusa più di recente, se
// ha una causale e nessuno ha ripreso dopo.
function pausaInCorso(odpId, faseId) {
  const chiuse = logsDiFase(odpId, faseId).filter(l => l.endedAt).sort((a, b) => String(b.endedAt).localeCompare(String(a.endedAt)));
  const l = chiuse[0];
  if (!l || !l.pauseReason || l.pauseReason === PAUSA_CAMBIO) return null;
  if (logsDiFase(odpId, faseId).some(x => x !== l && Date.parse(x.startedAt) >= Date.parse(l.endedAt))) return null;
  return { causale: causaleNome(l.pauseReason), nota: l.pauseNote || '', da: l.endedAt };
}

// ─── La scelta della causale, in reparto ───
function repartoPausaModal(odpId, faseId, conNota) {
  const o = getOdp(odpId); const f = o && (o.phases || []).find(x => x.id === faseId);
  if (!f) return;
  const voci = causaliPausa();
  const nota = conNota ? causalePausa(conNota) : null;
  openModal(`<h3>${ico('clock', 'tinted pill', '')} Perché ti fermi?</h3>
    <p><strong>${esc(o.code || '')}</strong> · fase ${esc(String(f.seq))} ${esc(f.wcName || '')}</p>
    ${nota ? `<div class="modal-field"><label for="pausa-nota">${esc(nota.name)}: scrivi il motivo</label><input id="pausa-nota" maxlength="200" autocomplete="off"
        onkeydown="if(event.key==='Enter'){event.preventDefault();repartoPausaCon('${o.id}','${f.id}','${esc(nota.id)}',true)}"></div>
      <div class="modal-actions"><button class="btn-ghost" onclick="repartoPausaModal('${o.id}','${f.id}')">Indietro</button>
        <button class="add-btn-sm" onclick="repartoPausaCon('${o.id}','${f.id}','${esc(nota.id)}',true)">Metti in pausa</button></div>`
    : `<div class="pausa-causali">${voci.map(c => `<button type="button" class="btn-outline reparto-btn${c.lost ? '' : ' pausa-normale'}" onclick="repartoPausaCon('${o.id}','${f.id}','${esc(c.id)}')">${esc(c.name)}</button>`).join('')}</div>
      <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Continua a lavorare</button></div>`}`, false, 'pausa');
  if (nota && typeof document !== 'undefined') { const el = document.getElementById('pausa-nota'); if (el && el.focus) el.focus(); }
}
function repartoPausaCon(odpId, faseId, id, letta) {
  const c = causalePausa(id);
  if (!c) return;
  if (c.nota && !letta) { repartoPausaModal(odpId, faseId, id); return; }
  const nota = letta ? val('pausa-nota') : '';
  if (c.nota && !nota) { showToast('Scrivi il motivo della pausa', 'error'); return; }
  closeModal();
  if (!timbraPausa(odpId, faseId, id, nota)) return;
  renderReparto();
  showToast('In pausa · ' + c.name);
  if (c.maint) repartoGuasto(odpId, faseId);
}
// Un guasto propone l'intervento di manutenzione, già sulla macchina (o sul
// centro) della fase e con il fermo da oggi.
function repartoGuasto(odpId, faseId) {
  const o = getOdp(odpId); const f = o && (o.phases || []).find(x => x.id === faseId);
  if (!f || !f.workCenterId) return;
  const conMacchina = moduloAttivo('macchine') && f.machineId;
  const dove = conMacchina ? 'm:' + f.machineId : 'wc:' + f.workCenterId;
  const nome = conMacchina ? (machineLabel(getMachine(f.machineId)) || f.machineName || 'la macchina') : (f.wcName || 'il centro');
  askConfirm(`Registrare un intervento di manutenzione su ${nome}?`, () => maintEventModal(null, dove, { fermoDa: oggiISO(),
    nota: `Guasto durante ${o.number || ''} fase ${f.seq}`.trim() }), { title: 'Guasto', ok: 'Registra intervento', cancel: 'No, solo pausa', safe: true });
}

// ─── I gesti del terminale ───
let repartoCentro = null;   // null = da leggere dalla preferenza del browser
const REPARTO_CENTRO_KEY = 'bomtrack_reparto_centro';
function repartoCentroScelto() {
  if (repartoCentro != null) return repartoCentro;
  try { repartoCentro = localStorage.getItem(REPARTO_CENTRO_KEY) || ''; } catch (e) { repartoCentro = ''; }
  return repartoCentro;
}
// Come si dispongono le schede (dalla 0.132.0): in colonne per codice, per
// giorno di inizio previsto o per ODP. Preferenza del dispositivo, come il centro.
const REPARTO_ORDINI = { codice: 'Codice', data: 'Data', odp: 'ODP' };
const REPARTO_ORDINE_KEY = 'bomtrack_reparto_ordine';
let repartoOrdine = null;
function repartoOrdineScelto() {
  if (repartoOrdine != null) return repartoOrdine;
  try { repartoOrdine = localStorage.getItem(REPARTO_ORDINE_KEY) || ''; } catch (e) { repartoOrdine = ''; }
  if (!REPARTO_ORDINI[repartoOrdine]) repartoOrdine = 'data';
  return repartoOrdine;
}
function repartoSetOrdine(o) {
  repartoOrdine = REPARTO_ORDINI[o] ? o : 'data';
  try { localStorage.setItem(REPARTO_ORDINE_KEY, repartoOrdine); } catch (e) { /* preferenza non salvata */ }
  renderReparto();
}
// Le colonne: [{ chiave, titolo, sotto, oggi, fasi }]. Per codice, una colonna
// per parte con le sue fasi in ordine di ODP e di fase; per data, una per
// giorno di inizio previsto (le fasi senza data in fondo); per ODP, una per
// ordine, per data di consegna, con le fasi in sequenza.
function repartoColonne(fasi, ordine) {
  const mappa = new Map();
  const chiaveDi = x => ordine === 'codice' ? (x.o.itemId || x.o.code || '') : ordine === 'odp' ? x.o.id : String(x.f.plannedStart || '').slice(0, 10);
  fasi.forEach(x => {
    const k = chiaveDi(x);
    if (!mappa.has(k)) mappa.set(k, []);
    mappa.get(k).push(x);
  });
  const oggi = oggiISO();
  const per = (a, b) => String(a).localeCompare(String(b));
  const colonne = Array.from(mappa, ([chiave, lista]) => {
    const { o } = lista[0];
    if (ordine === 'codice') {
      lista.sort((a, b) => per(a.o.dueDate || '9999', b.o.dueDate || '9999') || per(a.o.number, b.o.number) || a.f.seq - b.f.seq);
      return { chiave, ordina: o.code || '', titolo: o.code || '—', sotto: o.name || '', fasi: lista };
    }
    if (ordine === 'odp') {
      lista.sort((a, b) => a.f.seq - b.f.seq);
      return { chiave, ordina: (o.dueDate || '9999') + '|' + (o.number || ''), titolo: o.number || '', sotto: `${o.code || ''}${o.dueDate ? ' · serve il ' + fmtDateIt(o.dueDate) : ''}`, fasi: lista };
    }
    lista.sort((a, b) => REPARTO_GRUPPO[a.stato] - REPARTO_GRUPPO[b.stato] || per(a.o.dueDate || '9999', b.o.dueDate || '9999') || per(a.o.number, b.o.number));
    if (!chiave) return { chiave, ordina: '9999', titolo: 'Senza data', sotto: 'fasi non pianificate', fasi: lista };
    const g = new Date(chiave + 'T00:00:00');
    const nome = isFinite(g) ? g.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }) : chiave;
    return { chiave, ordina: chiave, titolo: nome.charAt(0).toUpperCase() + nome.slice(1), sotto: chiave === oggi ? 'oggi' : chiave < oggi ? 'giorno passato' : '', oggi: chiave === oggi, fasi: lista };
  });
  return colonne.sort((a, b) => per(a.ordina, b.ordina));
}
// Il filtro libero (dalla 0.148.0): ogni parola scritta deve comparire, in
// qualunque ordine, senza badare a maiuscole e accenti, nel testo della scheda:
// codice e descrizione, ODP e commessa, fase, centro e macchina, note e
// situazione. Non si ricorda fra una visita e l'altra: è una ricerca, non una
// preferenza. Si combina col centro scelto e con l'ordinamento.
let repartoQ = '';
function repartoTestoScheda(x) {
  const { o, f } = x;
  const job = o.jobId && typeof getJob === 'function' ? getJob(o.jobId) : null;
  const mac = f.machineId && typeof getMachine === 'function' ? getMachine(f.machineId) : null;
  const sit = repartoSituazione(o, f, x.stato);
  return comboNorm([o.code, o.name, o.number, job && job.number, job && job.customer,
    'fase ' + f.seq, f.wcName, mac ? machineLabel(mac) : f.machineName, sit.label, sit.nota,
    ...repartoNoteFase(o, f).map(n => n.testo)].filter(Boolean).join(' \n '));
}
function repartoFiltra(fasi, q) {
  const parole = comboNorm(q).split(/\s+/).filter(Boolean);
  if (!parole.length) return fasi;
  return fasi.filter(x => { const t = repartoTestoScheda(x); return parole.every(p => t.includes(p)); });
}
// Il valore si legge com'è, spazi compresi: val() li toglierebbe, e ridisegnando
// lo spazio appena scritto fra due parole sparirebbe sotto le dita.
function repartoCercaInput() {
  const el = document.getElementById('reparto-q');
  repartoQ = el ? String(el.value || '') : '';
  debounced('reparto-q', () => ridisegnaCercando('reparto-q', renderReparto));
}
function repartoCercaTasto(ev) { if (ev && ev.key === 'Escape' && repartoQ) { ev.preventDefault(); repartoCercaPulisci(); } }
function repartoCercaPulisci() {
  repartoQ = '';
  renderReparto();
  const el = document.getElementById('reparto-q');
  if (el && el.focus) el.focus();
}
function repartoSetCentro(id) {
  repartoCentro = id || '';
  try { localStorage.setItem(REPARTO_CENTRO_KEY, repartoCentro); } catch (e) { /* preferenza non salvata */ }
  renderReparto();
}
// Le fasi interne su cui si può lavorare adesso: avviabili o in corso. Con
// `tutte` (la schermata, dalla 0.132.0) anche le fasi future, in attesa della
// precedente, per inizio previsto, e in fondo quelle già terminate: una
// timbratura rimasta aperta su una fase che un collega ha chiuso si può ancora
// fermare. Dalla 0.135.1 la schermata tiene anche gli ordini **completati**
// (tutte le fasi dichiarate): chiusa l'ultima fase, le schede dell'ordine non
// spariscono più tutte insieme, e restano finché l'ordine non si chiude.
const REPARTO_GRUPPO = { avviabile: 0, corso: 0, attesa: 1, chiusa: 2 };
function repartoFasi(centroId, tutte) {
  const out = [];
  (db.prodOrders || []).forEach(o => {
    if (!ODP_APERTI.includes(o.status) && !(tutte && o.status === 'completato')) return;
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
// La Pausa chiede sempre la causale (dalla 0.160.0): la timbratura si chiude
// quando se ne sceglie una.
function repartoPausa(odpId, faseId) {
  if (!roleGuardShop('docs') || !logApertoDiFase(odpId, faseId, utenteId())) return;
  repartoPausaModal(odpId, faseId);
}
function repartoFine(odpId, faseId) {
  timbraPausa(odpId, faseId);
  renderReparto();
  opDichiaraModal(odpId, faseId);
}
function fmtOre(h) {
  const m = Math.round((Number(h) || 0) * 60);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}'`;
}

// ─── Correggere a mano le timbrature (dalla 0.136.0) ───
// Una timbratura sbagliata — la fase lasciata attiva la sera, una pausa
// dimenticata, un Inizia mai premuto — si corregge dalla scheda della fase:
// l'elenco delle sue timbrature, con inizio e fine da cambiare, quelle da
// togliere e quelle da aggiungere. È di chi gestisce gli ordini di produzione
// (area `docs`), non dell'operatore: le ore entrano nel consuntivo. Ogni
// modifica passa dallo storico, come le altre, e una timbratura tolta va nel
// cestino.
function timbratureCorreggibili() { return canWrite('docs'); }
// «2026-10-27T08:00:00.000Z» → «2026-10-27T10:00», l'ora del campo, che è locale.
function isoALocale(iso) {
  const t = Date.parse(iso || '');
  if (!isFinite(t)) return '';
  const d = new Date(t);
  return new Date(t - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function localeAIso(v) {
  if (!v) return null;
  const t = new Date(v).getTime();   // senza fuso: ora locale
  return isFinite(t) ? new Date(t).toISOString() : null;
}
function nomeOperatore(id) {
  const u = id && typeof getUser === 'function' ? getUser(id) : null;
  return u ? u.name || u.email || 'utente' : (id ? 'utente rimosso' : 'nessun utente');
}
// Le correzioni, tutte insieme: [{ id?, userId, startedAt, endedAt, elimina }].
// Una riga senza id è una timbratura nuova. Controlla prima, scrive dopo: o
// passano tutte o nessuna. Restituisce { ok, errore?, cambiate }.
function timbratureApplica(odpId, faseId, righe, adesso) {
  const o = getOdp(odpId); const f = o && (o.phases || []).find(x => x.id === faseId);
  if (!f) return { ok: false, errore: 'Fase non trovata' };
  const ora = Date.parse(adesso || nowISO()) + 60000;   // un minuto di tolleranza sull'orologio
  const proprie = new Map(logsDiFase(odpId, faseId).map(l => [l.id, l]));
  const tenute = [];
  for (const r of righe) {
    if (r.id && !proprie.has(r.id)) return { ok: false, errore: 'Una timbratura non c\'è più: chiudi e riapri la finestra' };
    if (r.elimina) continue;
    const a = Date.parse(r.startedAt || ''), b = r.endedAt ? Date.parse(r.endedAt) : null;
    const chi = nomeOperatore(r.userId);
    if (!isFinite(a)) return { ok: false, errore: `Manca l'inizio di una timbratura di ${chi}` };
    if (b != null && !isFinite(b)) return { ok: false, errore: `La fine di una timbratura di ${chi} non si legge` };
    if (a > ora || (b != null && b > ora)) return { ok: false, errore: `Una timbratura di ${chi} è nel futuro` };
    if (b != null && b <= a) return { ok: false, errore: `In una timbratura di ${chi} la fine viene prima dell'inizio` };
    if (!r.id && b == null) return { ok: false, errore: `Una timbratura aggiunta a mano va chiusa: scrivi la fine` };
    tenute.push({ r, a, b: b == null ? ora : b });
  }
  // Una persona lavora a una cosa alla volta: le timbrature cambiate o nuove
  // non si sovrappongono alle altre sue, su questa fase e sulle altre.
  const altre = timeLogs().filter(l => !proprie.has(l.id)).map(l => ({ r: l, a: Date.parse(l.startedAt), b: l.endedAt ? Date.parse(l.endedAt) : ora }));
  const cambiata = x => {
    const l = x.r.id && proprie.get(x.r.id);
    return !l || l.startedAt !== x.r.startedAt || (l.endedAt || null) !== (x.r.endedAt || null) || l.userId !== x.r.userId;
  };
  for (const x of tenute.filter(cambiata)) {
    const sopra = tenute.concat(altre).find(y => y !== x && y.r.userId === x.r.userId && y.a < x.b && x.a < y.b);
    if (sopra) return { ok: false, errore: `Le timbrature di ${nomeOperatore(x.r.userId)} si sovrappongono (${fmtStamp(sopra.r.startedAt)})` };
    if (!x.r.endedAt && altre.some(y => y.r.userId === x.r.userId && !y.r.endedAt)) return { ok: false, errore: `${nomeOperatore(x.r.userId)} ha già una timbratura aperta su un'altra fase` };
  }
  let cambiate = 0;
  righe.forEach(r => {
    if (r.id && r.elimina) { Store.remove('timeLogs', r.id); cambiate++; return; }
    if (r.elimina) return;
    const x = tenute.find(t => t.r === r);
    // La causale (dalla 0.160.0) vale solo per una timbratura chiusa; chi non
    // la passa (un chiamante di prima) la lascia com'è.
    const causale = r.pauseReason === undefined ? undefined : (r.endedAt ? r.pauseReason || '' : '');
    if (r.id) {
      const l = proprie.get(r.id);
      const nuovaCausale = causale !== undefined && causale !== (l.pauseReason || '');
      if (!cambiata(x) && !nuovaCausale) return;
      const campi = cambiata(x) ? { startedAt: r.startedAt, endedAt: r.endedAt || null } : {};
      if (nuovaCausale) { campi.pauseReason = causale; campi.pauseNote = ''; }
      Store.update('timeLogs', r.id, campi);
    } else {
      Store.insert('timeLogs', { id: gid(), odpId, phaseId: faseId, workCenterId: f.workCenterId || null, machineId: f.machineId || null, userId: r.userId || null,
        startedAt: r.startedAt, endedAt: r.endedAt, pauseReason: causale || '', pauseNote: '', note: 'aggiunta a mano', active: true });
    }
    cambiate++;
  });
  if (cambiate) saveDB();
  return { ok: true, cambiate };
}

// La finestra: le righe in bozza finché non si salva.
let _tmb = null;
function timbratureModal(odpId, faseId) {
  if (!roleGuard('docs')) return;
  const o = getOdp(odpId); const f = o && (o.phases || []).find(x => x.id === faseId);
  if (!f) return;
  const righe = logsDiFase(odpId, faseId).slice().sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)))
    .map(l => ({ id: l.id, userId: l.userId, inizio: isoALocale(l.startedAt), fine: isoALocale(l.endedAt), causale: l.pauseReason || '', elimina: false, prima: l }));
  _tmb = { odpId, faseId, righe };
  openModal(`<h3>${ico('clock', 'tinted pill', '')} Correggi le timbrature</h3>
    <p><strong>${esc(o.number || '')}</strong> · ${esc(o.code || '')} · fase ${esc(String(f.seq))} ${esc(f.wcName || '')}</p>
    <div id="tmb-righe">${timbratureRigheHtml()}</div>
    <button type="button" class="btn-ghost" onclick="timbratureAggiungi()">${ico('plus', 'tinted', '')} Aggiungi una timbratura</button>
    <p class="empty-text" style="text-align:left;padding:8px 0 0">Una fase rimasta attiva per errore si chiude scegliendo l\'ora di fine (senza data vale il giorno dell\'inizio); una fine vuota vuol dire che si lavora ancora. Le modifiche finiscono nello storico, e una timbratura eliminata va nel cestino.</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="timbratureSalva()">Salva</button>
    </div>`, false, 'form');
}
function timbratureRigheHtml() {
  if (!_tmb) return '';
  if (!_tmb.righe.length) return '<div class="empty-text" style="text-align:left">Nessuna timbratura su questa fase.</div>';
  const utenti = userList().filter(u => u.active !== false);
  return _tmb.righe.map((r, i) => {
    const a = Date.parse(localeAIso(r.inizio) || ''), b = r.fine ? Date.parse(localeAIso(r.fine) || '') : Date.now();
    const durata = isFinite(a) && isFinite(b) && b > a ? fmtOre((b - a) / 3600000) : '—';
    const chi = r.id ? `<strong>${esc(nomeOperatore(r.userId))}</strong>`
      : `<select id="tmb-u-${i}" aria-label="Operatore">${utenti.map(u => `<option value="${esc(u.id)}"${u.id === r.userId ? ' selected' : ''}>${esc(u.name || u.email || '')}</option>`).join('')}</select>`;
    return `<div class="tmb-riga${r.elimina ? ' via' : ''}${r.id ? '' : ' nuova'}">
      <div class="tmb-testa">${chi}<span class="tmb-durata">${r.elimina ? 'da eliminare' : `${durata}${r.fine ? '' : ' · in corso'}`}</span>
        <button type="button" class="btn-ghost tmb-via" onclick="timbratureElimina(${i})" title="${r.elimina ? 'Tieni' : 'Elimina'} questa timbratura" aria-label="${r.elimina ? 'Tieni' : 'Elimina'} la timbratura">${r.elimina ? ico('refresh', 'tinted', '') : ico('trash', 'tinted', '')}</button></div>
      <div class="tmb-ore">
        <div class="modal-field"><label for="tmb-a-${i}">Inizio</label>${timbratureCampoHtml('tmb-a-' + i, r.inizio, r.elimina, false)}</div>
        <div class="modal-field"><label for="tmb-b-${i}">Fine</label>${timbratureCampoHtml('tmb-b-' + i, r.fine, r.elimina, true)}</div>
      </div>${r.fine ? `<div class="modal-field tmb-causale"><label for="tmb-c-${i}">Causale della pausa</label>${timbratureCausaleHtml(i, r.causale, r.elimina)}</div>` : ''}</div>`;
  }).join('');
}
// La causale della pausa che segue la timbratura (dalla 0.160.0). «—» vuol
// dire nessuna: la timbratura si è chiusa con Fine e dichiara, o è di prima.
function timbratureCausaleHtml(i, sel, spento) {
  const voci = causaliPausa().slice();
  [PAUSA_CAMBIO, sel].forEach(id => { if (id && !voci.some(c => c.id === id)) voci.push(causalePausa(id) || { id, name: 'causale eliminata' }); });
  return `<select id="tmb-c-${i}"${spento ? ' disabled' : ''}><option value="">—</option>${voci.map(c => `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>${esc(c.name)}${c.lost ? ' · tempo perso' : ''}</option>`).join('')}</select>`;
}
// Il campo di un orario (dalla 0.151.0): la data, e l'ora in un solo elenco a
// passi di 5 minuti. Un orario timbrato fuori dai 5 minuti (08:02) resta
// nell'elenco com'è, così salvando non cambia da solo. La fine può restare vuota.
function timbratureOreOpzioni(ora, vuota) {
  const p2 = n => String(n).padStart(2, '0');
  let html = vuota ? `<option value=""${ora ? '' : ' selected'}>—</option>` : '', messa = !ora;
  for (let t = 0; t < 1440; t += 5) {
    const s = p2(Math.floor(t / 60)) + ':' + p2(t % 60);
    if (!messa && ora < s) { html += `<option value="${ora}" selected>${ora}</option>`; messa = true; }
    if (s === ora) messa = true;
    html += `<option value="${s}"${s === ora ? ' selected' : ''}>${s}</option>`;
  }
  if (!messa) html += `<option value="${ora}" selected>${ora}</option>`;
  return html;
}
function timbratureCampoHtml(id, v, spento, vuota) {
  const dis = spento ? ' disabled' : '';
  const ora = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v || '') ? v.slice(11, 16) : '';
  return `<div class="tmb-campo"><input id="${id}" type="date" value="${esc((v || '').slice(0, 10))}"${dis} onchange="timbratureLeggi(true)">`
    + `<select id="${id}-h" aria-label="Ora"${dis} onchange="timbratureLeggi(true)">${timbratureOreOpzioni(ora, vuota || !ora)}</select></div>`;
}
// Data e ora di un campo. Con l'ora e senza la data vale il giorno dell'inizio
// (chiudere una fase dimenticata è scegliere l'ora); una data senza ora resta
// a metà, e Salva lo dice.
function timbratureCampoLeggi(id, giorno) {
  const d = document.getElementById(id), h = document.getElementById(id + '-h');
  const data = d ? d.value : '', ora = h ? h.value : '';
  if (!ora) return { v: '', meta: !!data };
  const g = data || giorno || '';
  return g ? { v: g + 'T' + ora, meta: false } : { v: '', meta: true };
}
// I campi nella bozza; con `ridisegna` anche le durate.
function timbratureLeggi(ridisegna) {
  if (!_tmb || typeof document === 'undefined') return;
  _tmb.righe.forEach((r, i) => {
    const a = document.getElementById('tmb-a-' + i), b = document.getElementById('tmb-b-' + i), u = document.getElementById('tmb-u-' + i);
    r.aMeta = false;
    if (a && !a.disabled) { const x = timbratureCampoLeggi('tmb-a-' + i, ''); r.inizio = x.v; r.aMeta = x.meta; }
    if (b && !b.disabled) { const x = timbratureCampoLeggi('tmb-b-' + i, (r.inizio || '').slice(0, 10)); r.fine = x.v; r.aMeta = r.aMeta || x.meta; }
    if (u && !r.id) r.userId = u.value;
    const c = document.getElementById('tmb-c-' + i);
    if (c && !c.disabled) r.causale = c.value;
    if (!r.fine) r.causale = '';
  });
  if (ridisegna) { const el = document.getElementById('tmb-righe'); if (el) el.innerHTML = timbratureRigheHtml(); }
}
function timbratureElimina(i) {
  timbratureLeggi();
  const r = _tmb && _tmb.righe[i]; if (!r) return;
  if (!r.id) _tmb.righe.splice(i, 1); else r.elimina = !r.elimina;
  timbratureLeggi(true);
}
// Una timbratura nuova parte dalla fine dell'ultima, per un'ora, a nome di chi
// ha timbrato per ultimo la fase (o di chi corregge).
function timbratureAggiungi() {
  if (!_tmb) return;
  timbratureLeggi();
  const ultima = _tmb.righe.filter(r => !r.elimina).slice(-1)[0];
  const base = ultima && ultima.fine ? new Date(localeAIso(ultima.fine)).getTime() : Date.now() - 3600000;
  const cinque = 300000;   // a passi di 5 minuti, come l'elenco delle ore
  const inizio = Math.floor(Math.min(base, Date.now() - 3600000) / cinque) * cinque;
  _tmb.righe.push({ id: null, userId: (ultima && ultima.userId) || utenteId(), inizio: isoALocale(new Date(inizio).toISOString()), fine: isoALocale(new Date(inizio + 3600000).toISOString()), elimina: false });
  timbratureLeggi(true);
}
function timbratureSalva() {
  if (!_tmb || !roleGuard('docs')) return;
  timbratureLeggi();
  if (_tmb.righe.some(r => !r.elimina && r.aMeta)) { showToast('Manca l\'ora, o la data, in una timbratura', 'error'); return; }
  // Il campo non ha i secondi: un orario non toccato resta quello timbrato.
  const ora = (v, iso) => (iso && v === isoALocale(iso) ? iso : (v ? localeAIso(v) : null));
  const righe = _tmb.righe.map(r => ({ id: r.id, userId: r.userId, elimina: r.elimina, pauseReason: r.causale || '',
    startedAt: ora(r.inizio, r.prima && r.prima.startedAt), endedAt: r.fine ? ora(r.fine, r.prima && r.prima.endedAt) : null }));
  const esito = timbratureApplica(_tmb.odpId, _tmb.faseId, righe);
  if (!esito.ok) { showToast(esito.errore, 'error'); return; }
  _tmb = null;
  closeModal();
  if (document.getElementById('view-reparto')) renderReparto();
  savedToast(esito.cambiate ? 'Timbrature corrette' : 'Nessuna modifica');
}

// Le note della scheda (dalla 0.133.2). La nota della fase del ciclo si legge
// dal ciclo di oggi, non da quella congelata al lancio: un ODP lanciato prima
// che la nota ci fosse, o prima che cambiasse, la mostra lo stesso. La fase del
// ciclo è quella al suo posto (opIndex) sullo stesso centro: se il ciclo è
// stato riordinato e al suo posto c'è un'altra fase, non si mostra nulla.
// La nota congelata sull'ODP resta, a parte, solo se dice altro.
function repartoNotaCiclo(o, f) {
  // Il ciclo in vigore oggi, mai la bozza (dalla 0.162.0).
  const it = o && o.itemId && typeof getItem === 'function' ? itemInVigore(getItem(o.itemId)) : null;
  if (!it || f.opIndex == null) return '';
  const r = cicloFasi(it)[f.opIndex];
  if (!r || String(r.workCenterId || '') !== String(f.workCenterId || '')) return '';
  return String(r.note || '').trim();
}
function repartoNoteFase(o, f) {
  const ciclo = repartoNotaCiclo(o, f);
  const odp = String(f.note || '').trim();
  const out = [];
  if (ciclo) out.push({ label: 'Note fase ciclo', testo: ciclo, ciclo: true });
  if (odp && odp !== ciclo) out.push({ label: ciclo ? 'Note dell\'ODP' : 'Note', testo: odp, ciclo: false });
  return out;
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
  // Attrezzaggio compreso, come nei Tempi del consuntivo: le timbrature lo contano.
  const previste = consOreFase(f, pezzi, true);
  const perse = orePerseFase(o.id, f.id);
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
    : stato === 'corso' ? `<div class="reparto-lavoro pausa">${ico('clock', '', '')} <span>In pausa${logsDiFase(o.id, f.id).length ? repartoPausaTesto(o, f) : ' · nessuna timbratura'}</span></div>`
    : stato === 'avviabile' ? `<div class="reparto-lavoro">Non ancora iniziata</div>`
    : attesa ? `<div class="reparto-lavoro">In attesa · ${esc(opAvviabile(o, f).motivo || '')}</div>` : '';
  const codiceQr = repartoCodiceQr(o, f);
  return `<div class="reparto-card${lavorano.length ? ' attiva' : ''}" data-odp="${esc(o.id)}" data-fase="${esc(f.id)}">
    <div class="reparto-sit ${sit.id}"><strong>${esc(sit.label)}</strong>${sit.nota ? `<span>${esc(sit.nota)}</span>` : ''}</div>
    <div class="reparto-corpo">
    <div class="reparto-testa"><span class="reparto-codice">${esc(o.code || '')}</span>
      <button type="button" class="btn-ghost reparto-stampa" onclick="repartoStampa('${o.id}','${f.id}')" title="Stampa questa scheda, con il suo QR" aria-label="Stampa la scheda">${ico('printer', 'tinted', '')}</button></div>
    <div class="reparto-descr">${esc(o.name || '')}</div>
    <div class="reparto-fase">Fase <strong>${esc(String(f.seq))}</strong> · ${esc(f.wcName || '')}${conMacchine && f.machineId ? ` · ${ico('wrench', 'tinted', '')} ${esc(machineLabel(getMachine(f.machineId)) || f.machineName || '')}` : ''}</div>
    <div class="reparto-odp">${esc(o.number || '')}</div>
    <div class="reparto-date">Inizio previsto <strong>${f.plannedStart ? esc(fmtDateIt(f.plannedStart)) : 'non pianificato'}</strong>${f.plannedEnd ? ` · fine ${esc(fmtDateIt(f.plannedEnd))}` : ''}${o.dueDate ? ` · serve il ${esc(fmtDateIt(o.dueDate))}` : ''}</div>
    <div class="reparto-numeri">
      <div><span class="reparto-num-l">${stato === 'chiusa' ? 'Fatti' : attesa ? 'Attesi' : 'Da fare'}</span>
        <strong>${stato === 'chiusa' ? fmtQtyIt(opFatti(o, f)) : attesa ? fmtQtyIt(pezzi) : `${fmtQtyIt(opResidua(o, f))} <span class="reparto-num-di">di ${fmtQtyIt(opDaFare(o, f))}</span>`} pz</strong></div>
      <div><span class="reparto-num-l">Tempo lavorato</span>
        <strong>${repartoTempo(o.id, f.id, 'totale')}</strong>${previste > 0 ? ` <span class="reparto-num-di">su ${fmtOre(previste)} previste</span>` : ''}${perse > 0 ? ` <span class="reparto-num-di reparto-perse">· perse ${fmtOre(perse)}</span>` : ''}
        ${scrive && timbratureCorreggibili() ? `<button type="button" class="reparto-correggi" onclick="timbratureModal('${o.id}','${f.id}')" title="Correggi a mano le timbrature di questa fase">${ico('edit', '', '')} Correggi i tempi</button>` : ''}</div>
    </div>
    ${repartoNoteFase(o, f).map(n => `<div class="reparto-nota${n.ciclo ? ' ciclo' : ''}"><span class="reparto-num-l">${esc(n.label)}</span>${esc(n.testo)}</div>`).join('')}
    ${bottoni ? `<div class="reparto-azioni">${bottoni}</div>` : ''}
    ${typeof qrSvg === 'function' && qrDisponibile() ? `<div class="reparto-qr">${qrSvg(qrLink('fase', codiceQr), 96)}<span>${esc(codiceQr)}</span></div>` : ''}
    </div>
    ${lavoro}</div>`;
}

// «· Attesa materiale · dalle 10:40» (dalla 0.160.0): la causale dell'ultima pausa.
function repartoPausaTesto(o, f) {
  const p = pausaInCorso(o.id, f.id);
  if (!p) return '';
  const d = new Date(p.da);
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const quando = giornoLocaleDi(d.getTime()) === oggiISO() ? 'dalle ' + ora : 'dal ' + fmtDateIt(p.da) + ' ' + ora;
  return ` · ${esc(p.causale)}${p.nota ? ' (' + esc(p.nota) + ')' : ''} · ${quando}`;
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
  const fasi = repartoFiltra(repartoFasi(centro, true), repartoQ);
  const ordine = repartoOrdineScelto();
  const cerca = repartoQ.trim();
  const chi = utenteId();
  const mio = logAperto(chi);
  // La barra dei centri: ognuno con le fasi da lavorare (non le terminate).
  const voce = (id, nome, sotto) => {
    const n = repartoFiltra(repartoFasi(id), repartoQ).length;
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
      <div class="bom-toolbar-right"><div class="reparto-cerca">
          <input type="search" class="search" id="reparto-q" value="${esc(repartoQ)}" placeholder="Cerca codice, ODP, centro, note…" aria-label="Filtra le schede" autocomplete="off" oninput="repartoCercaInput()" onkeydown="repartoCercaTasto(event)">
          ${repartoQ ? `<button type="button" class="reparto-cerca-via" onclick="repartoCercaPulisci()" title="Cancella il filtro" aria-label="Cancella il filtro">${ico('close', '', '')}</button>` : ''}</div>
        <div class="reparto-ordina" role="group" aria-label="Ordina le schede per"><span>Ordina per</span>${Object.keys(REPARTO_ORDINI).map(k => `<button type="button" class="${k === ordine ? 'on' : ''}" aria-pressed="${k === ordine}" onclick="repartoSetOrdine('${k}')">${REPARTO_ORDINI[k]}</button>`).join('')}</div>
        <button class="btn-outline" onclick="repartoStampa()" ${fasi.length ? '' : 'disabled'}>${ico('printer', 'tinted', '')} Stampa le schede</button></div></div>
    <div class="reparto-layout">
      <nav class="reparto-centri" aria-label="Centri di lavoro">${barra}</nav>
      <div>
        ${mio && !fasi.some(x => x.o.id === mio.odpId && x.f.id === mio.phaseId) ? `<div class="rfq-warn">${ico('clock', 'tinted', '')} Hai una timbratura aperta su un'altra fase: ${esc((getOdp(mio.odpId) || {}).number || '')}. Cominciando questa, quella va in pausa.</div>` : ''}
        ${fasi.length ? `<div class="reparto-colonne">${repartoColonne(fasi, ordine).map(c => `<section class="reparto-col${c.oggi ? ' oggi' : ''}">
          <header class="reparto-col-testa"><div><strong>${esc(c.titolo)}</strong>${c.sotto ? `<span>${esc(c.sotto)}</span>` : ''}</div><span class="reparto-centro-n">${c.fasi.length}</span></header>
          ${c.fasi.map(x => repartoCardHtml(x.o, x.f, x.stato)).join('')}</section>`).join('')}</div>` : ''}
        <div class="reparto-lista">${fasi.length ? '' : cerca
          ? `<div class="empty-text">Nessuna scheda corrisponde a «${esc(cerca)}»${centro ? (centro.startsWith('m:') ? ' su questa macchina' : ' su questo centro') : ''}. <button type="button" class="btn-ghost" onclick="repartoCercaPulisci()">Cancella il filtro</button></div>`
          : '<div class="empty-text">Nessuna fase interna da lavorare' + (centro ? (centro.startsWith('m:') ? ' su questa macchina' : ' su questo centro') : '') + ': gli ordini vanno lanciati dalla vista Ordini di produzione.</div>'}</div>
      </div>
    </div>
  </div>`;
  repartoAggiornaScheda();
}

// ─── Le ore perse, nel Carico centri (dalla 0.160.0) ───
// Per centro (e per macchina, col modulo) e per causale, le pause che contano
// come tempo perso negli ultimi N giorni, con la quota sulle ore timbrate.
const PERSE_PERIODI = [7, 30, 90];
let persePeriodo = 30;
function perseSetPeriodo(g) { persePeriodo = PERSE_PERIODI.includes(Number(g)) ? Number(g) : 30; if (typeof renderLoad === 'function') renderLoad(); }
function perseDal(giorni, oggi) {
  const d = new Date((oggi || oggiISO()) + 'T12:00:00');
  d.setDate(d.getDate() - (giorni - 1));
  return giornoLocaleDi(d.getTime());
}
// { colonne: [causali], righe: [{ wcId, machineId, nome, sotto, celle: Map(causale → ore), perse, timbrate }] }
function orePerseTabella(opts) {
  const o = opts || {};
  const dal = perseDal(o.giorni || persePeriodo, o.oggi);
  const conMacchine = moduloAttivo('macchine');
  const passa = l => !o.wcId || l.workCenterId === o.wcId;
  const pause = pauseTimbrate({ dal, adesso: o.adesso }).filter(p => p.perse > 0 && passa(p.log));
  const righe = new Map();
  const riga = (wcId, machineId) => {
    const k = wcId + '|' + (machineId || '');
    if (!righe.has(k)) {
      const m = machineId ? getMachine(machineId) : null;
      const wc = getWorkCenter(wcId);
      righe.set(k, { wcId, machineId: machineId || null, nome: machineId ? (machineLabel(m) || 'macchina eliminata') : (wc ? wc.name : 'centro eliminato'),
        sotto: !!machineId, celle: new Map(), perse: 0, timbrate: 0 });
    }
    return righe.get(k);
  };
  pause.forEach(p => {
    const dove = [riga(p.log.workCenterId || '', null)];
    if (conMacchine && p.log.machineId) dove.push(riga(p.log.workCenterId || '', p.log.machineId));
    dove.forEach(r => { r.celle.set(p.causaleId, (r.celle.get(p.causaleId) || 0) + p.perse); r.perse += p.perse; });
  });
  timeLogs().filter(l => passa(l) && giornoLocaleDi(Date.parse(l.startedAt)) >= dal).forEach(l => {
    const ore = logOre(l, o.adesso);
    const a = righe.get((l.workCenterId || '') + '|'), b = conMacchine && l.machineId ? righe.get((l.workCenterId || '') + '|' + l.machineId) : null;
    if (a) a.timbrate += ore;
    if (b) b.timbrate += ore;
  });
  const usate = new Set(pause.map(p => p.causaleId));
  const colonne = causaliPausa(true).filter(c => usate.has(c.id));
  usate.forEach(id => { if (!colonne.some(c => c.id === id)) colonne.push(causalePausa(id) || { id, name: 'causale eliminata' }); });
  // Un centro e sotto le sue macchine, i centri per ore perse.
  const centri = Array.from(righe.values()).filter(r => !r.sotto).sort((a, b) => b.perse - a.perse || a.nome.localeCompare(b.nome));
  const ordinate = [];
  centri.forEach(c => { ordinate.push(c); Array.from(righe.values()).filter(r => r.sotto && r.wcId === c.wcId).sort((a, b) => b.perse - a.perse).forEach(r => ordinate.push(r)); });
  return { dal, colonne, righe: ordinate, pause };
}
function orePerseHtml(wcId) {
  if (!moduloAttivo('officina')) return '';
  const t = orePerseTabella({ wcId });
  const periodo = `<select onchange="perseSetPeriodo(this.value)" aria-label="Periodo delle ore perse">${PERSE_PERIODI.map(g => `<option value="${g}"${g === persePeriodo ? ' selected' : ''}>Ultimi ${g} giorni</option>`).join('')}</select>`;
  const testa = `<div class="cycle-section-head"><h3>${ico('clock', 'tinted', '')} Ore perse</h3>${periodo}</div>`;
  if (!t.righe.length) return `<div class="mrp-section">${testa}<div class="empty-text">Nessuna pausa con una causale di tempo perso dal ${esc(fmtDateIt(t.dal))}${wcId ? ' su questo centro' : ''}. Le causali si scelgono in Reparto, a ogni Pausa.</div></div>`;
  const cella = (r, id, ore) => ore > 0
    ? `<span class="code-link" ${clickAttrs(`orePerseDettaglio('${esc(r.wcId)}','${esc(r.machineId || '')}','${esc(id)}')`, 'Le pause di ' + r.nome)}>${fmtOre(ore)}</span>` : '';
  const corpo = t.righe.map(r => `<tr${r.sotto ? ' class="perse-sotto"' : ''}><td>${r.sotto ? '↳ ' : ''}${esc(r.nome)}</td>
    ${t.colonne.map(c => `<td class="num">${cella(r, c.id, r.celle.get(c.id) || 0)}</td>`).join('')}
    <td class="num"><strong>${cella(r, '', r.perse)}</strong></td>
    <td class="num">${r.timbrate > 0 ? Math.round(r.perse / r.timbrate * 100) + '%' : '—'}</td></tr>`).join('');
  return `<div class="mrp-section">${testa}
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Le pause scelte in Reparto con una causale che conta come tempo perso, dal ${esc(fmtDateIt(t.dal))}: dalla Pausa a quando la stessa persona riprende, mai oltre le ${esc(fineGiornataOra())} di quel giorno. La quota è sulle ore timbrate nello stesso periodo. Le causali si cambiano in <em>Gestione → Centri di lavoro</em>.</p>
    <div class="table-wrap"><table class="dash-table"><thead><tr><th>Centro</th>${t.colonne.map(c => `<th class="num">${esc(c.name)}</th>`).join('')}<th class="num">Totale</th><th class="num">Sulle timbrate</th></tr></thead>
    <tbody>${corpo}</tbody></table></div></div>`;
}
function orePerseDettaglio(wcId, machineId, causaleId) {
  const t = orePerseTabella({ wcId });
  const l = t.pause.filter(p => (p.log.workCenterId || '') === wcId && (!machineId || p.log.machineId === machineId) && (!causaleId || p.causaleId === causaleId));
  const wc = getWorkCenter(wcId), m = machineId ? getMachine(machineId) : null;
  const dove = m ? machineLabel(m) : (wc ? wc.name : 'centro eliminato');
  openModal(`<h3>${ico('clock', 'tinted pill', '')} Ore perse — ${esc(dove)}</h3>
    <p>${causaleId ? esc(causaleNome(causaleId)) : 'Tutte le causali'} · dal ${esc(fmtDateIt(t.dal))}</p>
    <div class="table-wrap"><table class="dash-table"><thead><tr><th>Quando</th><th>Ordine</th><th>Fase</th><th>Chi</th><th>Causale</th><th class="num">Ore</th></tr></thead><tbody>
    ${l.map(p => { const o = getOdp(p.log.odpId); const f = o && (o.phases || []).find(x => x.id === p.log.phaseId);
      return `<tr><td>${esc(fmtStamp(p.da))}${p.aperta ? ' · in corso' : ''}</td><td>${o ? `<span class="code-link" ${clickAttrs(`closeModal();homeApri('odp','${o.id}')`, 'Apri ' + (o.number || ''))}>${esc(o.number || '')}</span> ${esc(o.code || '')}` : 'ordine eliminato'}</td>
        <td>${f ? esc(String(f.seq)) : '—'}</td><td>${esc(nomeOperatore(p.log.userId))}</td><td>${esc(causaleNome(p.causaleId))}${p.nota ? ' — ' + esc(p.nota) : ''}</td><td class="num">${fmtOre(p.perse)}</td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'consulta');
}
// La sezione dell'Excel del Carico centri.
function orePerseExportSezione() {
  const t = orePerseTabella({ wcId: typeof loadSoloCentro !== 'undefined' ? loadSoloCentro : '' });
  const righe = t.pause.filter(p => p.perse > 0).map(p => {
    const o = getOdp(p.log.odpId); const f = o && (o.phases || []).find(x => x.id === p.log.phaseId);
    const wc = getWorkCenter(p.log.workCenterId), m = p.log.machineId ? getMachine(p.log.machineId) : null;
    return [fmtStamp(p.da), wc ? wc.name : '', m ? machineLabel(m) : '', o ? o.number || '' : '', o ? o.code || '' : '', f ? f.seq : '',
      nomeOperatore(p.log.userId), causaleNome(p.causaleId), p.nota, +p.perse.toFixed(2)];
  });
  return { nome: 'Ore perse',
    colonne: [{ h: 'Quando', w: 18 }, { h: 'Centro', w: 22 }, { h: 'Macchina', w: 20 }, { h: 'Ordine', w: 16 }, { h: 'Codice', w: 18 }, { h: 'Fase', w: 8, num: true },
      { h: 'Chi', w: 20 }, { h: 'Causale', w: 26 }, { h: 'Nota', w: 28 }, { h: 'Ore perse', w: 12, num: true }],
    righe, totali: null };
}

// ─── Le causali, in Gestione → Centri di lavoro (dalla 0.160.0) ───
// Stanno nelle impostazioni, come il calendario: viaggiano con il backup e con
// l'archivio condiviso. Al primo cambio la lista di serie si copia e da lì è
// dell'azienda. Una causale già usata si sospende, non si elimina: le pause di
// ieri devono continuare a dire perché.
function causaliPausaGestioneHtml() {
  if (!moduloAttivo('officina')) return '';
  const usate = new Set(timeLogs().map(l => l.pauseReason).filter(Boolean));
  const righe = causaliPausa(true).map(c => `<div class="mgmt-item mgmt-row">
    <div class="mgmt-item-main"><span class="mgmt-item-name">${esc(c.name)}</span>
      <span class="mgmt-item-meta">${c.lost ? 'tempo perso' : 'non conta come perso'}${c.maint ? ' · propone un intervento di manutenzione' : ''}${c.nota ? ' · chiede il motivo' : ''}</span></div>
    <div class="mgmt-item-badges">${activeBadge(c)}</div>
    <div class="mgmt-item-actions">
      <button class="mini-btn" onclick="causalePausaAttiva('${esc(c.id)}')" title="${c.active === false ? 'Riattiva' : 'Sospendi'} la causale">${ico(c.active === false ? 'check' : 'pause', 'tinted', c.active === false ? 'Riattiva' : 'Sospendi')}</button>
      <button class="mini-btn" onclick="causalePausaModal('${esc(c.id)}')" title="Modifica la causale">${ico('edit', 'tinted', 'Modifica la causale')}</button>
      ${usate.has(c.id) ? '' : `<button class="mini-btn danger" onclick="causalePausaElimina('${esc(c.id)}')" title="Elimina la causale">${ico('trash', 'tinted', 'Elimina la causale')}</button>`}</div></div>`).join('');
  return `<h3 class="settings-group-title" style="margin-top:24px">${ico('clock', 'tinted', '')} Causali di pausa</h3>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">In Reparto la <strong>Pausa</strong> chiede una di queste, con un tocco. Quelle di <strong>tempo perso</strong> fanno le ore perse del <em>Carico centri</em>. Passare a un'altra fase chiude la timbratura come <em>Cambio lavoro</em>, senza chiedere.</p>
    <div class="mgmt-panel"><div class="mgmt-list">${righe}</div>
    <div class="mgmt-form"><input id="cp-name" placeholder="Nuova causale (es. Attesa gru)" maxlength="60">
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="cp-lost" checked> Tempo perso</label>
      <button class="add-btn-sm" onclick="causalePausaAggiungi()">+ Aggiungi</button></div></div>`;
}
// La lista da scrivere: una copia, la prima volta quella di serie.
function causaliPausaDaScrivere() { return causaliPausa(true).map(c => Object.assign({}, c)); }
function causaliPausaSalva(lista, msg) {
  db.settings.pauseReasons = lista;
  saveDB(); renderManage(); savedToast(msg);
}
function causalePausaAggiungi() {
  if (!roleGuard('manage')) return;
  const nome = val('cp-name');
  if (!nome) { showToast('Scrivi il nome della causale', 'error'); return; }
  const lista = causaliPausaDaScrivere();
  if (lista.some(c => c.name.toLowerCase() === nome.toLowerCase())) { showToast('Questa causale c\'è già', 'error'); return; }
  const el = typeof document !== 'undefined' && document.getElementById('cp-lost');
  lista.push({ id: gid(), name: nome, lost: el ? !!el.checked : true, maint: false, active: true });
  causaliPausaSalva(lista, 'Causale aggiunta');
}
function causalePausaModal(id) {
  if (!roleGuard('manage')) return;
  const c = causalePausa(id); if (!c || c.fissa) return;
  openModal(`<h3>${ico('edit', 'tinted pill', '')} Modifica la causale</h3>
    <div class="modal-field"><label for="cpe-name">Nome</label><input id="cpe-name" value="${esc(c.name)}" maxlength="60"></div>
    <label style="display:flex;gap:6px;align-items:center;margin:4px 0"><input type="checkbox" id="cpe-lost" ${c.lost ? 'checked' : ''}> Conta come tempo perso</label>
    <label style="display:flex;gap:6px;align-items:center;margin:4px 0"><input type="checkbox" id="cpe-maint" ${c.maint ? 'checked' : ''}> Propone un intervento di manutenzione</label>
    <label style="display:flex;gap:6px;align-items:center;margin:4px 0"><input type="checkbox" id="cpe-nota" ${c.nota ? 'checked' : ''}> Chiede di scrivere il motivo</label>
    <p class="empty-text" style="text-align:left;padding:4px 0">Cambiare «tempo perso» cambia anche le ore perse delle pause già fatte con questa causale.</p>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="causalePausaModifica('${esc(c.id)}')">Salva</button></div>`, false, 'form');
}
function causalePausaModifica(id) {
  if (!roleGuard('manage')) return;
  const nome = val('cpe-name');
  if (!nome) { showToast('Scrivi il nome della causale', 'error'); return; }
  const lista = causaliPausaDaScrivere();
  const c = lista.find(x => x.id === id); if (!c) return;
  if (lista.some(x => x.id !== id && x.name.toLowerCase() === nome.toLowerCase())) { showToast('Questa causale c\'è già', 'error'); return; }
  const spunta = k => { const el = document.getElementById(k); return !!(el && el.checked); };
  Object.assign(c, { name: nome, lost: spunta('cpe-lost'), maint: spunta('cpe-maint'), nota: spunta('cpe-nota') });
  closeModal();
  causaliPausaSalva(lista, 'Causale salvata');
}
function causalePausaAttiva(id) {
  if (!roleGuard('manage')) return;
  const lista = causaliPausaDaScrivere();
  const c = lista.find(x => x.id === id); if (!c) return;
  if (c.active !== false && lista.filter(x => x.active !== false).length <= 1) { showToast('Serve almeno una causale attiva', 'error'); return; }
  c.active = c.active === false;
  causaliPausaSalva(lista, c.active ? 'Causale riattivata' : 'Causale sospesa');
}
function causalePausaElimina(id) {
  if (!roleGuard('manage')) return;
  if (timeLogs().some(l => l.pauseReason === id)) { showToast('La causale è già usata: si può solo sospendere', 'error'); return; }
  const lista = causaliPausaDaScrivere();
  if (lista.filter(x => x.id !== id && x.active !== false).length < 1) { showToast('Serve almeno una causale attiva', 'error'); return; }
  causaliPausaSalva(lista.filter(x => x.id !== id), 'Causale eliminata');
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
// `pre` (dalla 0.160.0): { fermoDa, nota } già scritti, per il guasto dal reparto.
function maintEventModal(planId, dove, pre) {
  const pr = pre || {};
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
      <div class="modal-field"><label>Fermo macchina dal</label><input id="me-from" type="date" value="${esc(pr.fermoDa || '')}"></div>
      <div class="modal-field"><label>al</label><input id="me-to" type="date"></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Ricambi usati (escono dal magazzino)</label><textarea id="me-ric" rows="3">${esc(ric)}</textarea></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Nota</label><input id="me-note" placeholder="cosa si è fatto" value="${esc(pr.nota || '')}"></div>
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
