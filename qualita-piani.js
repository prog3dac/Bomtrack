// ═══════════════════════════════════════════════════════════
//  BOMTRACK — qualita-piani.js  (modulo Qualità, fase 2: piani di controllo)
// ═══════════════════════════════════════════════════════════
// Che cosa si guarda, e su quanti pezzi.
//
// ── Il problema ──
// La fase 1 apre un collaudo e chiede un esito: sì o no. Non dice al
// magazziniere che cosa misurare, né su quanti pezzi di un bancale da 500, e
// non lascia scritto che cosa è stato misurato. Un esito senza misure è
// un'opinione: alla prima contestazione col fornitore non regge.
//
// ── Il piano ──
// Un **piano di controllo** vale per un articolo o per una famiglia, e può
// restringersi a un fornitore. Porta:
//   - le **caratteristiche** da verificare: una misura con nominale e
//     tolleranze, oppure un controllo sì/no («marcatura presente»);
//   - la **regola di campionamento**: tutto, un numero fisso, una percentuale,
//     o il piano singolo normale ISO 2859-1 a livello generale II per un AQL;
//   - il **salto lotti**: dopo N lotti accettati di fila dallo stesso
//     fornitore se ne collauda uno ogni K, e al primo respinto (o con una non
//     conformità aperta) si torna al 100% finché il fornitore non si rifà.
//
// Quando nasce un collaudo, il piano si **copia** dentro di lui: caratteristiche
// e campione restano quelli del giorno dell'arrivo anche se domani il piano
// cambia. È la regola dei documenti emessi (documenti.js): una registrazione
// non si riscrive perché è cambiata la regola.
//
// ── Quale piano vince ──
// Il più specifico: articolo e fornitore, poi articolo, poi famiglia e
// fornitore, poi famiglia. Un piano attivo vale come «sì, da collaudare»; un
// articolo segnato espressamente «No» resta fuori anche se la sua famiglia ha
// un piano, perché chi l'ha scritto lo ha scritto per quello.
//
// ── Il salto lotti, e perché non le tabelle II-B e II-C ──
// La norma prevede di passare dal collaudo normale al ridotto e al rinforzato
// con tabelle proprie. Qui il passaggio si fa come la fa la maggior parte dei
// gestionali (SAP lo chiama *dynamic modification*): ridotto = si salta il
// lotto, rinforzato = si guarda tutto. È più severo della norma nel rinforzato
// e meno complicato nel ridotto, e soprattutto si spiega in una riga a chi
// sta davanti al bancale. Lo stato non si salva: si ricava ogni volta dalla
// storia dei collaudi di quel piano con quel fornitore, così non c'è niente
// che possa andare fuori sincronia.

// ─── Regole di campionamento ───
const QC_CAMPIONI = {
  tutto: 'Tutti i pezzi',
  fisso: 'Un numero fisso di pezzi',
  perc: 'Una percentuale del lotto',
  aql: 'AQL — ISO 2859-1, livello II',
};
// Gli AQL che si offrono: quelli in percentuale di pezzi non conformi. Oltre il
// 6,5 la norma passa a «difetti per cento unità», che è un'altra domanda.
const QC_AQL = [0.065, 0.1, 0.15, 0.25, 0.4, 0.65, 1, 1.5, 2.5, 4, 6.5];
// La scala completa delle colonne della tabella II-A, da cui si conta la
// diagonale: ogni passo a destra (AQL più largo) vale come un passo in giù
// (campione più grande).
const ISO_AQL_SCALA = [0.01, 0.015, 0.025, 0.04, 0.065, 0.1, 0.15, 0.25, 0.4, 0.65, 1, 1.5, 2.5, 4, 6.5, 10];
const ISO_LETTERE = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R'];
const ISO_CAMPIONE = [2, 3, 5, 8, 13, 20, 32, 50, 80, 125, 200, 315, 500, 800, 1250, 2000];
// Lettera di codice per il livello generale II (tabella I), dal lotto.
const ISO_LOTTI_II = [[8, 0], [15, 1], [25, 2], [50, 3], [90, 4], [150, 5], [280, 6], [500, 7], [1200, 8],
  [3200, 9], [10000, 10], [35000, 11], [150000, 12], [500000, 13], [Infinity, 14]];
// La tabella II-A (normale, singolo) è una diagonale: lungo ogni riga i numeri
// di accettazione si ripetono uguali spostandosi di un AQL e di una lettera.
// La chiave è indice AQL + indice lettera; `su`/`giu` sono le frecce della
// norma («usa il piano sopra / sotto»).
const ISO_DIAGONALE = { 14: 0, 15: 'su', 16: 'giu', 17: 1, 18: 2, 19: 3, 20: 5, 21: 7, 22: 10, 23: 14, 24: 21 };

function isoLetteraLotto(n) {
  const q = Math.max(2, Math.ceil(Number(n) || 0));
  return ISO_LOTTI_II.find(([max]) => q <= max)[1];
}
// Il piano singolo normale per un lotto e un AQL: { lettera, n, ac, re }.
// Le frecce si seguono fino al primo piano vero; il campione può così uscire
// più grande o più piccolo di quello della lettera del lotto, come in tabella.
function isoPianoNormale(lotto, aql) {
  const ia = ISO_AQL_SCALA.findIndex(x => Math.abs(x - Number(aql)) < 1e-9);
  if (ia < 0) return null;
  let il = isoLetteraLotto(lotto);
  for (let giro = 0; giro < ISO_LETTERE.length; giro++) {
    const s = ia + il;
    const v = s < 14 ? 'giu' : s > 24 ? 'su' : ISO_DIAGONALE[s];
    if (v === 'giu') { if (il >= ISO_LETTERE.length - 1) return null; il++; continue; }
    if (v === 'su') { if (il <= 0) return null; il--; continue; }
    return { lettera: ISO_LETTERE[il], n: ISO_CAMPIONE[il], ac: v, re: v + 1 };
  }
  return null;
}

// ─── I piani ───
function qcPiani() { return (db.qualityPlans || []).filter(p => p && p.active !== false); }
function qcPianoGet(id) { return (db.qualityPlans || []).find(p => p.id === id) || null; }
// Il piano che vale per questo articolo da questo fornitore, o null.
function qcPianoPer(it, supplierId) {
  if (!it) return null;
  let meglio = null, punti = -1;
  qcPiani().forEach(p => {
    if (p.supplierId && p.supplierId !== supplierId) return;
    let s;
    if (p.itemId) { if (p.itemId !== it.id) return; s = 4; }
    else if (p.familyId) { if (!it.familyId || p.familyId !== it.familyId) return; s = 2; }
    else return;
    if (p.supplierId) s += 1;
    if (s > punti) { meglio = p; punti = s; }
  });
  return meglio;
}
function qcPianoAmbito(p) {
  if (!p) return '';
  const it = p.itemId ? getItem(p.itemId) : null;
  const f = p.familyId && typeof getFamily === 'function' ? getFamily(p.familyId) : null;
  const chi = p.itemId ? (it ? `${it.code} — ${it.name}` : '(articolo eliminato)')
    : p.familyId ? `Famiglia ${f ? f.name : '(eliminata)'}` : 'Nessun articolo né famiglia';
  return chi + (p.supplierId ? ` · solo ${supplierName(p.supplierId) || 'fornitore eliminato'}` : '');
}

// ─── Lo stato del fornitore su quel piano ───
// Dalla storia, ogni volta: i collaudi chiusi di questo piano con questo
// fornitore, dal più recente indietro.
//   rinforzato  l'ultimo lotto guardato è stato respinto, o c'è una non
//               conformità aperta su articolo e fornitore: si guarda tutto
//   ridotto     gli ultimi `skipAfter` lotti guardati sono stati accettati
//               (una deroga interrompe la serie): si salta, tranne uno ogni
//               `skipEvery`
//   normale     tutto il resto
function qcStatoPiano(p, supplierId, itemId) {
  const out = { stato: 'normale', motivo: '', salta: false };
  if (!p) return out;
  const storia = qcTutti().filter(x => x.planId === p.id && (x.supplierId || null) === (supplierId || null) && x.status === 'chiuso' && x.esito)
    .sort((a, b) => String(b.closedAt || b.date || '').localeCompare(String(a.closedAt || a.date || '')) || String(b.number || '').localeCompare(String(a.number || '')));
  const guardati = storia.filter(x => !x.skipLot);
  const ncAperta = typeof ncAperteDi === 'function' && ncAperteDi(itemId || p.itemId, supplierId).length > 0;
  if (ncAperta) return { stato: 'rinforzato', motivo: 'c\'è una non conformità aperta su questo articolo e fornitore', salta: false };
  if (guardati.length && guardati[0].esito === 'respinto') {
    return { stato: 'rinforzato', motivo: `l'ultimo lotto (${guardati[0].number}) è stato respinto`, salta: false };
  }
  const dopo = Math.max(0, parseInt(p.skipAfter, 10) || 0);
  const ogni = Math.max(1, parseInt(p.skipEvery, 10) || 1);
  if (!dopo || ogni < 2) return out;
  // Il rinforzato finisce come il ridotto comincia: con N buoni di fila.
  const serie = guardati.slice(0, dopo);
  if (serie.length < dopo || serie.some(x => x.esito !== 'accettato')) return out;
  // Quanti lotti si sono saltati dall'ultimo guardato: si salta finché non se
  // ne sono saltati ogni−1.
  let saltati = 0;
  for (const x of storia) { if (!x.skipLot) break; saltati++; }
  const salta = saltati < ogni - 1;
  return { stato: 'ridotto', motivo: `${dopo} lotti accettati di fila: se ne collauda uno ogni ${ogni}`, salta };
}

// ─── Quanti pezzi ───
// `lotto` è nell'unità di gestione. Restituisce { size, ac, re, regola }.
// Rinforzato vuol dire tutto; per le regole senza AQL basta un pezzo non
// conforme per respingere (Ac 0, Re 1).
function qcCampionamento(p, lotto, stato) {
  const N = Math.max(0, Number(lotto) || 0);
  const intero = Math.ceil(N - 1e-9);
  const tutto = { size: intero, ac: 0, re: 1, regola: 'Tutti i pezzi' };
  if (!p) return tutto;
  if (stato === 'rinforzato') return Object.assign({}, tutto, { regola: 'Tutti i pezzi (rinforzato)' });
  const m = QC_CAMPIONI[p.sampling] ? p.sampling : 'tutto';
  if (m === 'fisso') {
    const n = Math.max(1, Math.ceil(Number(p.sampleQty) || 1));
    return { size: Math.min(intero, n), ac: 0, re: 1, regola: `${n} pezz${n === 1 ? 'o' : 'i'} per lotto` };
  }
  if (m === 'perc') {
    const pct = Math.min(100, Math.max(0, Number(p.samplePct) || 0));
    return { size: Math.min(intero, Math.max(1, Math.ceil(N * pct / 100 - 1e-9))), ac: 0, re: 1, regola: `${fmtQtyIt(pct)}% del lotto` };
  }
  if (m === 'aql') {
    const iso = isoPianoNormale(N, p.aql);
    if (!iso) return tutto;
    const regola = `AQL ${fmtQtyIt(p.aql)} · livello II · lettera ${iso.lettera} · Ac ${iso.ac} Re ${iso.re}`;
    // Campione più grande del lotto: si guarda tutto, con gli stessi numeri.
    return { size: Math.min(intero, iso.n), ac: iso.ac, re: iso.re, regola: iso.n >= intero ? regola + ' (lotto intero)' : regola };
  }
  return tutto;
}

// ─── Il piano dentro il collaudo ───
// Chiamato da qcCrea prima dell'inserimento: completa il record con la copia
// del piano e il campione. Se il lotto si salta e non c'è un certificato da
// controllare, il collaudo nasce già chiuso: resta scritto che è arrivato e
// che non è stato guardato, e conta per la serie del salto lotti.
function qcApplicaPiano(rec, it) {
  const p = qcPianoPer(it, rec.supplierId);
  if (!p) return rec;
  const st = qcStatoPiano(p, rec.supplierId, it.id);
  rec.planId = p.id;
  rec.planState = st.stato;
  if (p.cert) rec.cert = 'atteso';
  if (st.salta) {
    rec.skipLot = true;
    rec.checks = [];
    rec.sampleSize = 0; rec.acceptNo = 0; rec.rejectNo = 1;
    rec.sampleRule = 'Lotto saltato · ' + st.motivo;
    if (rec.cert !== 'atteso') {
      Object.assign(rec, { status: 'chiuso', esito: 'accettato', qtyOk: rec.qty, qtyKo: 0, destino: '', closedAt: nowISO(),
        note: 'Salto lotto: accettato senza collaudo' });
    }
    return rec;
  }
  const c = qcCampionamento(p, qcQtaGestione(rec, it), st.stato);
  rec.sampleSize = c.size; rec.acceptNo = c.ac; rec.rejectNo = c.re;
  rec.sampleRule = c.regola + (st.stato === 'rinforzato' && st.motivo ? ' · ' + st.motivo : '');
  rec.checks = (p.characteristics || []).map(x => ({
    id: x.id, name: x.name || '', kind: x.kind === 'ok' ? 'ok' : 'misura',
    nominal: x.nominal, tolMin: x.tolMin, tolMax: x.tolMax, uom: x.uom || '', tool: x.tool || '', value: '',
  }));
  return rec;
}
// Il certificato del piano vince su quello dell'articolo: il piano è la regola
// più specifica, e spesso è proprio lì che si scrive «3.1 per questo fornitore».
function qcCertificatoPiano(insp) {
  const p = insp && insp.planId ? qcPianoGet(insp.planId) : null;
  return p && p.cert ? String(p.cert) : '';
}

// ─── Le misure ───
// I limiti di una caratteristica: nominale più tolleranze (con il segno).
function qcLimiti(c) {
  const nom = Number(c && c.nominal);
  if (!c || c.kind === 'ok' || c.nominal === '' || c.nominal == null || !isFinite(nom)) return null;
  const lo = nom + (Number(c.tolMin) || 0), hi = nom + (Number(c.tolMax) || 0);
  return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
}
function qcCheckEsito(c) {
  if (!c) return '';
  if (c.kind === 'ok') return c.value === 'ok' || c.value === 'ko' ? c.value : '';
  if (c.value === '' || c.value == null) return '';
  const v = Number(String(c.value).replace(',', '.'));
  if (!isFinite(v)) return '';
  const lim = qcLimiti(c);
  if (!lim) return 'ok';
  return v >= lim.min - 1e-9 && v <= lim.max + 1e-9 ? 'ok' : 'ko';
}
function qcTolleranzaTesto(c) {
  if (!c || c.kind === 'ok') return 'sì / no';
  const lim = qcLimiti(c);
  if (!lim) return '—';
  const f = v => fmtQtyIt(v);
  const tmi = Number(c.tolMin) || 0, tma = Number(c.tolMax) || 0;
  const tol = tmi === -tma ? `± ${f(tma)}` : `${tmi >= 0 ? '+' : '−'}${f(Math.abs(tmi))} / ${tma >= 0 ? '+' : '−'}${f(Math.abs(tma))}`;
  return `${f(c.nominal)} ${tol}${c.uom ? ' ' + c.uom : ''}`;
}
// L'esito che le misure suggeriscono. Non decide: chi collauda può accettare
// in deroga un pezzo fuori tolleranza, ed è giusto che sia lui a dirlo.
function qcEsitoSuggerito(insp) {
  if (!insp) return '';
  const checks = insp.checks || [];
  if (checks.some(c => qcCheckEsito(c) === 'ko')) return 'respinto';
  const dif = Number(insp.defects) || 0;
  if (insp.rejectNo != null && dif >= (Number(insp.rejectNo) || 1)) return 'respinto';
  if (checks.length && checks.some(c => qcCheckEsito(c) === '')) return '';
  return 'accettato';
}
function qcSetCheck(id, checkId, valore) {
  if (!qcGuard()) return false;
  const insp = qcGet(id); if (!insp || insp.status !== 'aperto') return false;
  const checks = (insp.checks || []).map(c => c.id === checkId ? Object.assign({}, c, { value: String(valore == null ? '' : valore).trim() }) : c);
  Store.update('inspections', id, { checks });
  return true;
}
function qcSetDifetti(id, valore) {
  if (!qcGuard()) return false;
  const insp = qcGet(id); if (!insp || insp.status !== 'aperto') return false;
  Store.update('inspections', id, { defects: Math.max(0, Math.floor(Number(valore) || 0)) });
  return true;
}

// ─── Scrivere i piani ───
// Piani e caratteristiche li scrive chi scrive i documenti (`docs`): sono la
// regola, non il gesto di tutti i giorni, e l'officina li usa senza cambiarli.
function qcPianoGuard() { return roleGuard('docs'); }
function qcPianoNuovo(dati) {
  if (!qcPianoGuard()) return null;
  const d = dati || {};
  const p = Store.insert('qualityPlans', {
    name: String(d.name || 'Nuovo piano di controllo'),
    itemId: d.itemId || null, familyId: d.itemId ? null : (d.familyId || null), supplierId: d.supplierId || null,
    cert: String(d.cert || ''), sampling: QC_CAMPIONI[d.sampling] ? d.sampling : 'tutto',
    sampleQty: Number(d.sampleQty) || 5, samplePct: Number(d.samplePct) || 10, aql: Number(d.aql) || 1,
    skipAfter: parseInt(d.skipAfter, 10) || 0, skipEvery: parseInt(d.skipEvery, 10) || 0,
    characteristics: Array.isArray(d.characteristics) ? d.characteristics.map(c => Object.assign({ id: gid() }, c)) : [],
    notes: String(d.notes || ''), active: true,
  });
  return p;
}
const QC_PIANO_CAMPI = ['name', 'itemId', 'familyId', 'supplierId', 'cert', 'sampling', 'sampleQty', 'samplePct', 'aql', 'skipAfter', 'skipEvery', 'notes'];
function qcPianoSet(id, campo, valore) {
  if (!qcPianoGuard()) return false;
  const p = qcPianoGet(id); if (!p || !QC_PIANO_CAMPI.includes(campo)) return false;
  let v = valore == null ? '' : String(valore).trim();
  const patch = {};
  if (['sampleQty', 'samplePct', 'aql'].includes(campo)) v = Math.max(0, Number(v.replace(',', '.')) || 0);
  else if (['skipAfter', 'skipEvery'].includes(campo)) v = Math.max(0, parseInt(v, 10) || 0);
  else if (['itemId', 'familyId', 'supplierId'].includes(campo)) v = v || null;
  else if (campo === 'sampling' && !QC_CAMPIONI[v]) v = 'tutto';
  else if (campo === 'name' && !v) v = 'Piano di controllo';
  patch[campo] = v;
  // Articolo e famiglia si escludono: un piano vale per l'uno o per l'altra.
  if (campo === 'itemId' && v) patch.familyId = null;
  if (campo === 'familyId' && v) patch.itemId = null;
  Store.update('qualityPlans', id, patch);
  return true;
}
// L'ambito si cambia con un gesto solo: «per famiglia» svuota l'articolo.
function qcPianoAmbitoSet(id, ambito) {
  if (!qcPianoGuard()) return false;
  const p = qcPianoGet(id); if (!p) return false;
  Store.update('qualityPlans', id, ambito === 'famiglia' ? { itemId: null } : { familyId: null });
  pqRidisegna();
  return true;
}
const QC_CAR_CAMPI = ['name', 'kind', 'nominal', 'tolMin', 'tolMax', 'uom', 'tool'];
function qcCarAggiungi(id, kind) {
  if (!qcPianoGuard()) return null;
  const p = qcPianoGet(id); if (!p) return null;
  const c = { id: gid(), name: '', kind: kind === 'ok' ? 'ok' : 'misura', nominal: '', tolMin: '', tolMax: '', uom: kind === 'ok' ? '' : 'mm', tool: '' };
  Store.update('qualityPlans', id, { characteristics: (p.characteristics || []).concat([c]) });
  pqRidisegna();
  return c;
}
function qcCarSet(id, carId, campo, valore) {
  if (!qcPianoGuard()) return false;
  const p = qcPianoGet(id); if (!p || !QC_CAR_CAMPI.includes(campo)) return false;
  let v = valore == null ? '' : String(valore).trim();
  if (['nominal', 'tolMin', 'tolMax'].includes(campo)) {
    const n = Number(v.replace(',', '.').replace('−', '-'));
    v = v === '' || !isFinite(n) ? '' : n;
  }
  if (campo === 'kind') v = v === 'ok' ? 'ok' : 'misura';
  Store.update('qualityPlans', id, { characteristics: (p.characteristics || []).map(c => c.id === carId ? Object.assign({}, c, { [campo]: v }) : c) });
  if (campo === 'kind') pqRidisegna();
  return true;
}
function qcCarElimina(id, carId) {
  if (!qcPianoGuard()) return false;
  const p = qcPianoGet(id); if (!p) return false;
  Store.update('qualityPlans', id, { characteristics: (p.characteristics || []).filter(c => c.id !== carId) });
  pqRidisegna();
  return true;
}
function qcCarSposta(id, carId, dir) {
  if (!qcPianoGuard()) return false;
  const p = qcPianoGet(id); if (!p) return false;
  const l = (p.characteristics || []).slice();
  const i = l.findIndex(c => c.id === carId), j = i + (dir < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= l.length) return false;
  [l[i], l[j]] = [l[j], l[i]];
  Store.update('qualityPlans', id, { characteristics: l });
  pqRidisegna();
  return true;
}
// Eliminare un piano non tocca i collaudi che ne sono nati: hanno la loro copia.
function qcPianoElimina(id) {
  if (!qcPianoGuard()) return;
  const p = qcPianoGet(id); if (!p) return;
  const usato = qcTutti().filter(x => x.planId === id).length;
  askConfirm(`Eliminare il piano «${p.name}»?${usato ? `\nI ${usato} collaudi che ne sono nati restano come sono: ognuno ha la sua copia delle caratteristiche.` : ''}`, () => {
    if (pqCurrentId === id) pqCurrentId = null;
    removeConUndo('qualityPlans', id, `Piano «${p.name}» eliminato`, () => renderPianiQc());
  });
}
function qcPianoDuplica(id) {
  const p = qcPianoGet(id); if (!p) return null;
  const copia = JSON.parse(JSON.stringify(p));
  ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy'].forEach(k => delete copia[k]);
  copia.name = p.name + ' (copia)';
  copia.characteristics = (copia.characteristics || []).map(c => Object.assign(c, { id: gid() }));
  const n = qcPianoNuovo(copia);
  if (n) { pqCurrentId = n.id; renderPianiQc(); }
  return n;
}

// ═══════════════════════════════════════════════════════════
//  La vista dei piani
// ═══════════════════════════════════════════════════════════
let pqCurrentId = null;
let pqFiltro = { q: '' };
function pqRidisegna() { if (typeof activeView !== 'undefined' && activeView === 'pianiqc') renderPianiQc(); }
function pqSearchInput() { pqFiltro.q = val('pq-search'); renderPianiQc(); }
function pqApri(id) { pqCurrentId = id; renderPianiQc(); }
function pqChiudi() { pqCurrentId = null; renderPianiQc(); }
function pqNuovo() { const p = qcPianoNuovo(); if (p) { pqCurrentId = p.id; renderPianiQc(); } }

function renderPianiQc() {
  const el = document.getElementById('view-pianiqc'); if (!el) return;
  const q = (pqFiltro.q || '').toLowerCase();
  const tutti = qcPiani();
  const righe = tutti.filter(p => !q || [p.name, qcPianoAmbito(p), p.cert].some(v => String(v || '').toLowerCase().includes(q)))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'it'));
  const corrente = pqCurrentId ? qcPianoGet(pqCurrentId) : null;
  const scrive = canWrite('docs');
  el.innerHTML = worklistHtml({
    titolo: 'Piani di controllo', icona: 'ruler', listaId: 'pq-list',
    comandi: scrive ? `<button class="add-btn-sm" onclick="pqNuovo()">${ico('plus', 'tinted', '')} Nuovo piano</button>` : '',
    filtri: `<input type="text" class="search" id="pq-search" placeholder="Cerca piano, articolo, famiglia…" value="${esc(pqFiltro.q)}" oninput="pqSearchInput()">`,
    righe: righe.length ? righe.map(p => worklistRow({
      numero: p.itemId ? 'Articolo' : 'Famiglia', sel: corrente && corrente.id === p.id,
      badge: `<span class="doc-badge st-bozza">${(p.characteristics || []).length} caratt.</span>`,
      titolo: p.name, meta: `${esc(qcPianoAmbito(p))} · ${esc(QC_CAMPIONI[p.sampling] || QC_CAMPIONI.tutto)}`,
      azione: `pqApri('${p.id}')`, etichetta: `Apri il piano ${p.name}`,
    })).join('') : '<p class="empty-text">Nessun piano di controllo.</p>',
    nota: worklistCount(righe.length, tutti.length, 'piano', 'piani'),
    doc: corrente ? pqSchedaHtml(corrente, scrive) : '',
    vuoto: {
      titolo: 'Piani di controllo',
      testo: 'Un piano dice <strong>che cosa misurare</strong> e <strong>su quanti pezzi</strong> quando arriva un articolo, o un\'intera famiglia, eventualmente da un solo fornitore. Il collaudo che nasce ne prende una copia: le caratteristiche da compilare, il campione e i numeri di accettazione. Un piano attivo basta a far collaudare l\'articolo.',
      comandi: scrive ? `<button class="add-btn-sm" onclick="pqNuovo()">${ico('plus', 'tinted', '')} Nuovo piano</button>` : '',
    },
  });
  a11yFields(el);
}

function pqSchedaHtml(p, scrive) {
  const dis = scrive ? '' : 'disabled';
  const set = campo => `onchange="qcPianoSet('${p.id}','${campo}',this.value);pqRidisegna()"`;
  const ambito = p.familyId && !p.itemId ? 'famiglia' : 'articolo';
  const articoli = (db.items || []).filter(it => !it.obsolete && hasStock(it))
    .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
  const famiglie = (db.families || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'it'));
  const fornitori = (db.suppliers || []).filter(s => s.active !== false).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'it'));
  const m = QC_CAMPIONI[p.sampling] ? p.sampling : 'tutto';
  const esempio = qcCampionamento(p, 500, 'normale');
  const usato = qcTutti().filter(x => x.planId === p.id).length;
  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      <div class="bom-toolbar-left">
        ${worklistCloseBtn('pqChiudi()', 'il piano')}
        <h2 class="section-title">${esc(p.name)}</h2>
      </div>
      ${scrive ? `<div class="bom-toolbar-right">
        <button class="btn-outline" onclick="qcPianoDuplica('${p.id}')">${ico('copy', 'tinted', '')} Duplica</button>
        <button class="btn-outline danger" onclick="qcPianoElimina('${p.id}')">${ico('trash', 'tinted', '')} Elimina</button>
      </div>` : ''}
    </div>
    <div class="qc-card">
      <h3>A cosa si applica</h3>
      <div class="modal-grid">
        <div class="modal-field"><label>Nome del piano</label><input value="${esc(p.name)}" ${dis} ${set('name')}></div>
        <div class="modal-field"><label>Vale per</label>
          <select ${dis} onchange="qcPianoAmbitoSet('${p.id}', this.value)">
            <option value="articolo" ${ambito === 'articolo' ? 'selected' : ''}>Un articolo</option>
            <option value="famiglia" ${ambito === 'famiglia' ? 'selected' : ''}>Una famiglia</option>
          </select></div>
        ${ambito === 'articolo' ? `<div class="modal-field"><label>Articolo</label>
          <select class="sel-cerca" ${dis} ${set('itemId')}><option value="">— scegli —</option>
            ${articoli.map(it => `<option value="${it.id}" ${p.itemId === it.id ? 'selected' : ''}>${esc(it.code + ' — ' + it.name)}</option>`).join('')}</select></div>`
    : `<div class="modal-field"><label>Famiglia</label>
          <select class="sel-cerca" ${dis} ${set('familyId')}><option value="">— scegli —</option>
            ${famiglie.map(f => `<option value="${f.id}" ${p.familyId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></div>`}
        <div class="modal-field"><label>Solo per il fornitore</label>
          <select class="sel-cerca" ${dis} ${set('supplierId')}><option value="">Tutti i fornitori</option>
            ${fornitori.map(s => `<option value="${s.id}" ${p.supplierId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
        <div class="modal-field"><label>Certificato richiesto</label><input value="${esc(p.cert || '')}" maxlength="60" placeholder="es. 3.1 EN 10204" ${dis} ${set('cert')}></div>
      </div>
      ${!p.itemId && !p.familyId ? `<p class="empty-text qc-hint">${ico('warning', 'tinted', '')} Finché non scegli un articolo o una famiglia il piano non si applica a niente.</p>` : ''}
    </div>
    <div class="qc-card">
      <h3>Campionamento</h3>
      <div class="modal-grid">
        <div class="modal-field"><label>Quanti pezzi si guardano</label>
          <select ${dis} ${set('sampling')}>${Object.keys(QC_CAMPIONI).map(k => `<option value="${k}" ${m === k ? 'selected' : ''}>${esc(QC_CAMPIONI[k])}</option>`).join('')}</select></div>
        ${m === 'fisso' ? `<div class="modal-field"><label>Pezzi per lotto</label><input type="number" min="1" step="1" value="${esc(String(p.sampleQty || ''))}" ${dis} ${set('sampleQty')}></div>` : ''}
        ${m === 'perc' ? `<div class="modal-field"><label>Percentuale del lotto</label><input type="number" min="0" max="100" step="any" value="${esc(String(p.samplePct || ''))}" ${dis} ${set('samplePct')}></div>` : ''}
        ${m === 'aql' ? `<div class="modal-field"><label>AQL (% non conformi)</label>
          <select ${dis} ${set('aql')}>${QC_AQL.map(a => `<option value="${a}" ${Math.abs((Number(p.aql) || 0) - a) < 1e-9 ? 'selected' : ''}>${fmtQtyIt(a)}</option>`).join('')}</select></div>` : ''}
        <div class="modal-field"><label>Salto lotti: dopo quanti accettati di fila</label><input type="number" min="0" step="1" value="${esc(String(p.skipAfter || 0))}" ${dis} ${set('skipAfter')}></div>
        <div class="modal-field"><label>…se ne collauda uno ogni</label><input type="number" min="0" step="1" value="${esc(String(p.skipEvery || 0))}" ${dis} ${set('skipEvery')}></div>
      </div>
      <p class="empty-text qc-hint">Su un lotto di 500 pezzi: <strong>${esc(esempio.regola)}</strong>, cioè ${fmtQtyIt(esempio.size)} pezzi da guardare${esempio.ac || m === 'aql' ? `; si accetta con al massimo ${esempio.ac} non conform${esempio.ac === 1 ? 'e' : 'i'}` : ', e un solo pezzo non conforme fa respingere'}.
        ${(Number(p.skipAfter) || 0) > 0 && (Number(p.skipEvery) || 0) >= 2 ? `Dopo ${p.skipAfter} lotti accettati di fila dallo stesso fornitore se ne collauda uno ogni ${p.skipEvery}; al primo respinto, o con una non conformità aperta, si guarda tutto finché non tornano ${p.skipAfter} accettati.` : 'Salto lotti spento: si collauda ogni arrivo.'}</p>
    </div>
    <div class="qc-card">
      <h3>Caratteristiche da verificare</h3>
      ${pqCaratteristicheHtml(p, scrive)}
      ${scrive ? `<div class="modal-actions" style="justify-content:flex-start">
        <button class="btn-outline" onclick="qcCarAggiungi('${p.id}','misura')">${ico('ruler', 'tinted', '')} Aggiungi una misura</button>
        <button class="btn-outline" onclick="qcCarAggiungi('${p.id}','ok')">${ico('check', 'tinted', '')} Aggiungi un controllo sì/no</button>
      </div>` : ''}
    </div>
    <div class="qc-card">
      <h3>Istruzioni per chi collauda</h3>
      <textarea rows="3" ${dis} onchange="qcPianoSet('${p.id}','notes',this.value)" placeholder="es. Misurare a 20 °C dopo 2 ore di stabilizzazione">${esc(p.notes || '')}</textarea>
    </div>
    <p class="empty-text qc-hint">${usato ? `${usato} collaud${usato === 1 ? 'o è nato' : 'i sono nati'} da questo piano. Le modifiche valgono dai prossimi arrivi: chi è già nato tiene la sua copia.` : 'Nessun collaudo è ancora nato da questo piano.'}</p>
    ${stampLine(p)}
  </div>`;
}
function pqCaratteristicheHtml(p, scrive) {
  const l = p.characteristics || [];
  if (!l.length) return '<p class="empty-text qc-hint">Nessuna caratteristica: il collaudo chiederà solo l\'esito.</p>';
  const dis = scrive ? '' : 'disabled';
  const inp = (c, campo, attr) => `<input ${attr || ''} value="${esc(c[campo] == null ? '' : String(c[campo]).replace('.', ','))}" ${dis}
      onchange="qcCarSet('${p.id}','${c.id}','${campo}',this.value)" aria-label="${esc(campo)}">`;
  return `<div class="table-wrap"><table class="qc-table">
    <thead><tr><th scope="col">Caratteristica</th><th scope="col">Tipo</th><th scope="col" class="num">Nominale</th>
      <th scope="col" class="num">Toll. −</th><th scope="col" class="num">Toll. +</th><th scope="col">U.M.</th><th scope="col">Strumento</th>${scrive ? '<th scope="col"><span class="sr-only">Comandi</span></th>' : ''}</tr></thead>
    <tbody>${l.map((c, i) => `<tr>
      <td>${inp(c, 'name', 'placeholder="es. Diametro esterno"')}</td>
      <td><select ${dis} onchange="qcCarSet('${p.id}','${c.id}','kind',this.value)" aria-label="Tipo">
        <option value="misura" ${c.kind !== 'ok' ? 'selected' : ''}>Misura</option><option value="ok" ${c.kind === 'ok' ? 'selected' : ''}>Sì / no</option></select></td>
      ${c.kind === 'ok' ? '<td colspan="4" class="empty-text">passa / non passa</td>' : `
      <td class="num">${inp(c, 'nominal', 'inputmode="decimal" class="num"')}</td>
      <td class="num">${inp(c, 'tolMin', 'inputmode="decimal" class="num" placeholder="-0,05"')}</td>
      <td class="num">${inp(c, 'tolMax', 'inputmode="decimal" class="num" placeholder="+0,05"')}</td>
      <td>${inp(c, 'uom', 'maxlength="8"')}</td>`}
      <td>${inp(c, 'tool', 'placeholder="es. Calibro"')}</td>
      ${scrive ? `<td class="qc-row-cmds">
        <button class="mini-btn" onclick="qcCarSposta('${p.id}','${c.id}',-1)" ${i === 0 ? 'disabled' : ''} title="Sposta su">↑</button>
        <button class="mini-btn" onclick="qcCarSposta('${p.id}','${c.id}',1)" ${i === l.length - 1 ? 'disabled' : ''} title="Sposta giù">↓</button>
        <button class="mini-btn danger" onclick="qcCarElimina('${p.id}','${c.id}')" title="Elimina la caratteristica">${ico('trash', 'tinted', 'Elimina')}</button></td>` : ''}
    </tr>`).join('')}</tbody></table></div>`;
}

// ─── Il rapporto di collaudo ───
// Un PDF bilingue come gli altri documenti che possono uscire dall'azienda:
// l'arrivo, il campione, le misure e l'esito. Si archivia come copia emessa
// (documenti.js, cartella COL).
function qcRapportoPdf(id, modo) {
  const x = qcGet(id); if (!x) return null;
  const jsPDF = requirePdf(); if (!jsPDF) return null;
  const it = getItem(x.itemId);
  const doc = new jsPDF();
  const startY = docPdfTesta(doc, { titolo: 'Rapporto di collaudo / Inspection report', rec: Object.assign({}, x, { title: it ? `${it.code} — ${it.name}` : '' }),
    chi: 'CLIENTE / CUSTOMER', controparte: 'FORNITORE / SUPPLIER', vuota: '—', xControparte: 110 });
  const u = x.uom || (it ? itemUom(it) : '');
  doc.autoTable({ startY, theme: 'plain', styles: { fontSize: 9, cellPadding: 1.2 }, columnStyles: { 0: { textColor: 110, cellWidth: 60 } },
    body: [
      ['Ordine / Order', qcOrdineNumero(x) || '—'],
      ['Quantità / Quantity', `${fmtQtyIt(x.qty)} ${u}`],
      ['DDT / Delivery note', x.ddt || '—'],
      ['Lotto fornitore / Supplier lot', x.supplierLot || '—'],
      ['Certificato / Certificate', (qcCertificatoPiano(x) || (it ? qcCertificato(it) : '')) ? `${qcCertificatoPiano(x) || qcCertificato(it)} — ${x.cert === 'ok' ? 'ricevuto / received' : 'non ricevuto / not received'}` : '—'],
      ['Campionamento / Sampling', x.sampleRule ? `${x.sampleRule} · ${fmtQtyIt(x.sampleSize || 0)} pz` : 'Tutti i pezzi / 100%'],
      ['Non conformi nel campione / Nonconforming', String(Number(x.defects) || 0)],
    ] });
  const checks = x.checks || [];
  if (checks.length) {
    doc.autoTable({ startY: doc.lastAutoTable.finalY + 6, styles: { fontSize: 8 }, headStyles: { fillColor: [58, 123, 232] },
      head: [['#', 'Caratteristica\nCharacteristic', 'Specifica\nSpecification', 'Strumento\nGauge', 'Rilevato\nMeasured', 'Esito\nResult']],
      body: checks.map((c, i) => [i + 1, c.name || '', qcTolleranzaTesto(c), c.tool || '',
        c.kind === 'ok' ? (c.value === 'ok' ? 'sì / yes' : c.value === 'ko' ? 'no' : '') : String(c.value || '').replace('.', ','),
        { ok: 'OK', ko: 'NON OK / NOT OK' }[qcCheckEsito(c)] || '—']) });
  }
  const esiti = { accettato: 'Accettato / Accepted', deroga: 'Accettato in deroga / Accepted under concession', respinto: 'Respinto / Rejected' };
  doc.autoTable({ startY: doc.lastAutoTable.finalY + 6, theme: 'plain', styles: { fontSize: 10, cellPadding: 1.4 }, columnStyles: { 0: { textColor: 110, cellWidth: 60 } },
    body: [
      ['Esito / Result', x.status === 'aperto' ? 'In corso / In progress' : (esiti[x.esito] || '—')],
      ['Accettati / Accepted', x.status === 'aperto' ? '—' : `${fmtQtyIt(x.qtyOk)} ${u}`],
      ['Respinti / Rejected', x.status === 'aperto' ? '—' : `${fmtQtyIt(x.qtyKo)} ${u}`],
      ['Data esito / Date', x.closedAt ? fmtDateIt(x.closedAt.slice(0, 10)) : '—'],
    ] });
  doc.setTextColor(80); doc.setFontSize(9);
  docCoda(doc, [{ etichetta: 'Note / Notes', testo: x.note }], doc.lastAutoTable.finalY + 8);
  return qcPdfEmetti('inspection', x, doc, 'collaudo', renderCollaudi, modo);
}
// Il seguito di un rapporto: il download, oppure (dal pulsante «Archivia» della
// scheda) la copia in archivio. Niente domanda «segnare come inviato»: un
// rapporto non ha uno stato d'invio, e l'archivio si sceglie quando serve.
function qcPdfEmetti(kind, rec, doc, ripiego, rerender, modo) {
  const nome = docNomeFile(rec, rec.supplierId ? getSupplier(rec.supplierId) : null, ripiego, '.pdf');
  if (modo === 'archivia') return docEmessoArchivia(kind, rec, doc.output('blob'), nome).then(r => { if (r) rerender(); return r; });
  doc.save(nome);
  showToast('PDF esportato');
  return null;
}
