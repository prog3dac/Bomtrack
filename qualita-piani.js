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
// Dalla 0.142.0 un piano vale per **l'elenco dei codici** che gli si
// assegnano (`itemIds`), e un codice sta in un piano solo: è la regola che
// legge chi collauda («per questo codice si guarda questo»), e due piani sullo
// stesso codice vorrebbero dire due risposte. I piani nati prima valevano per
// un articolo (`itemId`) o per una famiglia (`familyId`), con un eventuale
// fornitore: finché non vengono convertiti (qcPianiConverti) si leggono così,
// e il fornitore non restringe più niente.
function qcPiani() { return (db.qualityPlans || []).filter(p => p && p.active !== false); }
function qcPianoGet(id) { return (db.qualityPlans || []).find(p => p.id === id) || null; }
function qcPianoCodici(p) {
  if (!p) return [];
  if (Array.isArray(p.itemIds)) return p.itemIds;
  if (p.itemId) return [p.itemId];
  if (p.familyId) return (db.items || []).filter(it => it.familyId === p.familyId && !it.obsolete && hasStock(it)).map(it => it.id);
  return [];
}
// Con due piani sullo stesso codice — piani vecchi, o due PC che lo hanno
// assegnato nello stesso momento prima di sincronizzarsi — vince l'elenco
// esplicito, poi il piano d'articolo, poi quello di famiglia; a parità il più
// vecchio. Così la risposta è la stessa su ogni PC.
function qcPianoPeso(p) { return Array.isArray(p.itemIds) ? 3 : p.itemId ? 2 : 1; }
function qcPianoDelCodice(itemId, tranne) {
  let meglio = null;
  qcPiani().forEach(p => {
    if (p.id === tranne || !qcPianoCodici(p).includes(itemId)) return;
    const pp = qcPianoPeso(p), pm = meglio ? qcPianoPeso(meglio) : -1;
    if (pp > pm || (pp === pm && String(p.createdAt || p.id) < String(meglio.createdAt || meglio.id))) meglio = p;
  });
  return meglio;
}
// Il piano che vale per questo articolo, o null. Il fornitore resta nella
// firma: lo usa lo stato del salto lotti, non la scelta del piano.
function qcPianoPer(it) { return it ? qcPianoDelCodice(it.id) : null; }
function qcPianoAmbito(p) {
  if (!p) return '';
  const l = qcPianoCodici(p);
  if (!l.length) return 'Nessun codice';
  const primo = getItem(l[0]);
  return l.length === 1 ? (primo ? `${primo.code} — ${primo.name}` : '1 codice') : `${l.length} codici`;
}
// Gli articoli che si collaudano (per scelta loro o della famiglia) ma non
// stanno in nessun piano: il collaudo nasce, ma senza dire che cosa misurare.
// Prima della 0.142 un piano di famiglia copriva anche i codici nuovi; con
// l'elenco no, e il Riepilogo lo ricorda.
function qcSenzaPiano() {
  if (typeof qcAttivo !== 'function' || !qcAttivo()) return [];
  return (db.items || []).filter(it => !it.obsolete && hasStock(it) && it.qc !== 'no'
    && (it.qc === 'si' || qcFamigliaRichiede(it)) && !qcPianoPer(it))
    .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
}
// I codici che stanno anche in un altro piano: dopo una sincronizzazione può
// capitare, e la scheda lo dice invece di lasciarlo scoprire a chi collauda.
function qcPianoContesi(p) {
  return qcPianoCodici(p).map(id => ({ itemId: id, piano: qcPianoDelCodice(id) })).filter(x => x.piano && x.piano.id !== p.id);
}
// Converte i piani d'articolo e di famiglia nell'elenco dei codici di oggi.
// Prima gli articoli, poi le famiglie: un codice già preso resta a chi ce l'ha.
// Restituisce quanti piani ha convertito e quanti codici ha lasciato fuori.
function qcPianiConverti() {
  if (!canWrite('docs')) return null;
  const vecchi = qcPiani().filter(p => !Array.isArray(p.itemIds))
    .sort((a, b) => qcPianoPeso(b) - qcPianoPeso(a) || String(a.createdAt || a.id).localeCompare(String(b.createdAt || b.id)));
  if (!vecchi.length) return null;
  const presi = new Set();
  qcPiani().filter(p => Array.isArray(p.itemIds)).forEach(p => p.itemIds.forEach(id => presi.add(id)));
  let fuori = 0;
  vecchi.forEach(p => {
    const l = qcPianoCodici(p).filter(id => { if (presi.has(id)) { fuori++; return false; } presi.add(id); return true; });
    Store.update('qualityPlans', p.id, { itemIds: l, itemId: null, familyId: null, supplierId: null });
  });
  return { piani: vecchi.length, fuori };
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
    nominal: x.nominal, tolMin: x.tolMin, tolMax: x.tolMax, isoClass: x.isoClass || '', uom: x.uom || '', tool: x.tool || '', value: '',
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
// L'esito calcolato dalla misura: '' se manca il valore o mancano i limiti.
// Fino alla 0.141 una misura senza nominale passava sempre: non c'era niente
// con cui confrontarla, e l'app diceva «OK» per lei.
function qcCheckCalcolato(c) {
  if (!c || c.kind === 'ok') return '';
  if (c.value === '' || c.value == null) return '';
  const v = Number(String(c.value).replace(',', '.'));
  const lim = qcLimiti(c);
  if (!isFinite(v) || !lim) return '';
  return v >= lim.min - 1e-9 && v <= lim.max + 1e-9 ? 'ok' : 'ko';
}
// L'esito di una riga. Su una misura, la scelta a mano (`verdict`) vince sul
// calcolo: è l'unica risposta quando la tolleranza è solo indicativa, e la
// correzione di chi collauda quando lo strumento dice una cosa e il pezzo
// un'altra (resta scritto che è forzata: qcCheckForzato).
function qcCheckEsito(c) {
  if (!c) return '';
  if (c.kind === 'ok') return c.value === 'ok' || c.value === 'ko' ? c.value : '';
  if (c.verdict === 'ok' || c.verdict === 'ko') return c.verdict;
  return qcCheckCalcolato(c);
}
function qcCheckForzato(c) {
  if (!c || c.kind === 'ok' || !(c.verdict === 'ok' || c.verdict === 'ko')) return false;
  const calc = qcCheckCalcolato(c);
  return calc !== '' && calc !== c.verdict;
}
function qcTolleranzaTesto(c) {
  if (!c || c.kind === 'ok') return 'sì / no';
  const lim = qcLimiti(c);
  const f = v => fmtQtyIt(v);
  if (!lim) return c.nominal === '' || c.nominal == null ? 'esito a mano' : `${f(c.nominal)}${c.uom ? ' ' + c.uom : ''} (indicativa)`;
  const tmi = Number(c.tolMin) || 0, tma = Number(c.tolMax) || 0;
  const tol = c.isoClass ? c.isoClass
    : tmi === -tma ? `± ${f(tma)}` : `${tmi >= 0 ? '+' : '−'}${f(Math.abs(tmi))} / ${tma >= 0 ? '+' : '−'}${f(Math.abs(tma))}`;
  return `${f(c.nominal)} ${tol} (${f(lim.min)} – ${f(lim.max)})${c.uom ? ' ' + c.uom : ''}`;
}
// Il collaudo dice di respingere: una riga fuori, o i pezzi non conformi
// arrivati al numero di rifiuto. È quando compare il messaggio del piano.
function qcCollaudoFuori(insp) {
  if (!insp || insp.skipLot) return false;
  if ((insp.checks || []).some(c => qcCheckEsito(c) === 'ko')) return true;
  return insp.rejectNo != null && (Number(insp.defects) || 0) >= (Number(insp.rejectNo) || 1);
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
// La scelta a mano dell'esito di una misura: 'ok', 'ko' o '' (torna al calcolo).
function qcSetVerdetto(id, checkId, valore) {
  if (!qcGuard()) return false;
  const insp = qcGet(id); if (!insp || insp.status !== 'aperto') return false;
  const v = valore === 'ok' || valore === 'ko' ? valore : '';
  const checks = (insp.checks || []).map(c => c.id === checkId && c.kind !== 'ok' ? Object.assign({}, c, { verdict: v }) : c);
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
  // Un codice che ha già un piano non entra in uno nuovo (la regola di
  // qcPianoCodiciSet vale anche qui).
  const codici = Array.isArray(d.itemIds) ? d.itemIds.filter((id, i, l) => l.indexOf(id) === i && !qcPianoDelCodice(id)) : [];
  const p = Store.insert('qualityPlans', {
    name: String(d.name || 'Nuovo piano di controllo'),
    itemIds: codici,
    cert: String(d.cert || ''), sampling: QC_CAMPIONI[d.sampling] ? d.sampling : 'tutto',
    sampleQty: Number(d.sampleQty) || 5, samplePct: Number(d.samplePct) || 10, aql: Number(d.aql) || 1,
    skipAfter: parseInt(d.skipAfter, 10) || 0, skipEvery: parseInt(d.skipEvery, 10) || 0,
    characteristics: Array.isArray(d.characteristics) ? d.characteristics.map(c => Object.assign({ id: gid() }, c)) : [],
    notes: String(d.notes || ''), failMessage: String(d.failMessage || ''), active: true,
  });
  return p;
}
const QC_PIANO_CAMPI = ['name', 'cert', 'sampling', 'sampleQty', 'samplePct', 'aql', 'skipAfter', 'skipEvery', 'notes', 'failMessage'];
function qcPianoSet(id, campo, valore) {
  if (!qcPianoGuard()) return false;
  const p = qcPianoGet(id); if (!p || !QC_PIANO_CAMPI.includes(campo)) return false;
  let v = valore == null ? '' : String(valore).trim();
  const patch = {};
  if (['sampleQty', 'samplePct', 'aql'].includes(campo)) v = Math.max(0, Number(v.replace(',', '.')) || 0);
  else if (['skipAfter', 'skipEvery'].includes(campo)) v = Math.max(0, parseInt(v, 10) || 0);
  else if (campo === 'sampling' && !QC_CAMPIONI[v]) v = 'tutto';
  else if (campo === 'name' && !v) v = 'Piano di controllo';
  patch[campo] = v;
  Store.update('qualityPlans', id, patch);
  return true;
}
// I codici del piano, tutti insieme (la finestra di scelta li conferma così).
// Un codice che nel frattempo è entrato in un altro piano resta fuori, e lo si
// dice: la finestra lo mostrava libero, ma la regola vale al salvataggio.
// Restituisce { codici, scartati: [{ itemId, piano }] } o null.
function qcPianoCodiciSet(id, ids) {
  if (!qcPianoGuard()) return null;
  const p = qcPianoGet(id); if (!p) return null;
  const scartati = [];
  const codici = (ids || []).filter((x, i, l) => x && l.indexOf(x) === i && getItem(x)).filter(x => {
    const altro = qcPianoDelCodice(x, id);
    if (altro) { scartati.push({ itemId: x, piano: altro }); return false; }
    return true;
  });
  Store.update('qualityPlans', id, { itemIds: codici, itemId: null, familyId: null, supplierId: null });
  return { codici, scartati };
}
const QC_CAR_CAMPI = ['name', 'kind', 'nominal', 'tolMin', 'tolMax', 'isoClass', 'uom', 'tool'];
function qcCarAggiungi(id, kind) {
  if (!qcPianoGuard()) return null;
  const p = qcPianoGet(id); if (!p) return null;
  const c = { id: gid(), name: '', kind: kind === 'ok' ? 'ok' : 'misura', nominal: '', tolMin: '', tolMax: '', isoClass: '', uom: kind === 'ok' ? '' : 'mm', tool: '' };
  Store.update('qualityPlans', id, { characteristics: (p.characteristics || []).concat([c]) });
  pqRidisegna();
  return c;
}
// Un numero scritto come lo scrive un disegno: «20», «Ø20», «20 mm», «+0,05»,
// «−0,02». '' se vuoto, null se non si legge.
function qcLeggiNumero(testo) {
  const t = String(testo == null ? '' : testo).trim().replace(/^[ØøΦφ⌀]\s*/, '').replace(/\s*mm$/i, '')
    .replace('−', '-').replace('–', '-').replace(',', '.').replace(/^\+/, '');
  if (t === '') return '';
  const n = Number(t);
  return isFinite(n) ? n : null;
}
// Scrive un campo di una caratteristica. Restituisce false se il valore non si
// legge: il vecchio resta, e la vista colora il campo invece di buttare via in
// silenzio quello che si è scritto (fino alla 0.141 «±0,05» diventava vuoto).
// Con la classe ISO gli scostamenti li decide la tabella: si ricalcolano a ogni
// cambio di nominale o di classe.
function qcCarSet(id, carId, campo, valore) {
  if (!qcPianoGuard()) return false;
  const p = qcPianoGet(id); if (!p || !QC_CAR_CAMPI.includes(campo)) return false;
  const c0 = (p.characteristics || []).find(c => c.id === carId); if (!c0) return false;
  let v = valore == null ? '' : String(valore).trim();
  if (['nominal', 'tolMin', 'tolMax'].includes(campo)) {
    v = qcLeggiNumero(v);
    if (v === null) return false;
  }
  if (campo === 'isoClass' && v) {
    const iso = iso286Leggi(v);
    if (!iso) return false;
    v = iso.classe;
  }
  if (campo === 'kind') v = v === 'ok' ? 'ok' : 'misura';
  const c = Object.assign({}, c0, { [campo]: v });
  if (c.isoClass && (campo === 'isoClass' || campo === 'nominal')) {
    const t = iso286Tolleranze(c.nominal, c.isoClass);
    if (!t && c.nominal !== '') return false;
    Object.assign(c, t || { tolMin: '', tolMax: '' });
  }
  Store.update('qualityPlans', id, { characteristics: (p.characteristics || []).map(x => x.id === carId ? c : x) });
  if (['kind', 'isoClass', 'nominal', 'tolMin', 'tolMax'].includes(campo)) pqRidisegna();
  return true;
}
// Dalla vista: se il valore non si legge, il campo diventa rosso e lo si dice.
function qcCarSetDaCampo(el, id, carId, campo) {
  const ok = qcCarSet(id, carId, campo, el.value);
  if (!ok && el.isConnected) {
    el.classList.add('qc-campo-ko');
    showToast(campo === 'isoClass' ? 'Classe non in tabella: si usano le lettere D–P / d–p e i gradi da 5 a 11, fino a 500 mm'
      : campo === 'nominal' ? 'Nominale non valido, o fuori dalle tabelle ISO (oltre 500 mm)' : 'Numero non valido', 'error');
  }
  return ok;
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
  // Senza codici: con gli stessi violerebbe subito la regola «un codice, un piano».
  copia.itemIds = [];
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
  // I piani d'articolo e di famiglia diventano elenchi di codici la prima
  // volta che li apre chi li può scrivere; chi li legge soltanto li vede già
  // così (qcPianoCodici).
  const conv = qcPianiConverti();
  if (conv) showToast(`${conv.piani} pian${conv.piani === 1 ? 'o convertito' : 'i convertiti'} in elenchi di codici${conv.fuori ? `: ${conv.fuori} codic${conv.fuori === 1 ? 'e era' : 'i erano'} in due piani e ${conv.fuori === 1 ? 'è rimasto' : 'sono rimasti'} in quello d'articolo` : ''}`);
  const q = (pqFiltro.q || '').toLowerCase();
  const tutti = qcPiani();
  const cercaCodici = p => qcPianoCodici(p).map(id => { const it = getItem(id); return it ? it.code + ' ' + it.name : ''; }).join(' ');
  const righe = tutti.filter(p => !q || [p.name, p.cert, cercaCodici(p)].some(v => String(v || '').toLowerCase().includes(q)))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'it'));
  const corrente = pqCurrentId ? qcPianoGet(pqCurrentId) : null;
  const scrive = canWrite('docs');
  el.innerHTML = worklistHtml({
    titolo: 'Piani di controllo', icona: 'ruler', listaId: 'pq-list',
    comandi: scrive ? `<button class="add-btn-sm" onclick="pqNuovo()">${ico('plus', 'tinted', '')} Nuovo piano</button>` : '',
    filtri: `<input type="text" class="search" id="pq-search" placeholder="Cerca piano o codice…" value="${esc(pqFiltro.q)}" oninput="pqSearchInput()">`,
    righe: righe.length ? righe.map(p => {
      const n = qcPianoCodici(p).length;
      return worklistRow({
        numero: `${n} codic${n === 1 ? 'e' : 'i'}`, sel: corrente && corrente.id === p.id,
        badge: `<span class="doc-badge st-bozza">${(p.characteristics || []).length} caratt.</span>`,
        titolo: p.name, meta: `${esc(qcPianoAmbito(p))} · ${esc(QC_CAMPIONI[p.sampling] || QC_CAMPIONI.tutto)}`,
        azione: `pqApri('${p.id}')`, etichetta: `Apri il piano ${p.name}`,
      });
    }).join('') : '<p class="empty-text">Nessun piano di controllo.</p>',
    nota: worklistCount(righe.length, tutti.length, 'piano', 'piani'),
    doc: corrente ? pqSchedaHtml(corrente, scrive) : '',
    vuoto: {
      titolo: 'Piani di controllo',
      testo: 'Un piano dice <strong>che cosa misurare</strong> e <strong>su quanti pezzi</strong> quando arrivano i codici che gli assegni. Un codice sta in un piano solo. Il collaudo che nasce ne prende una copia: le caratteristiche da compilare, il campione e i numeri di accettazione. Un piano basta a far collaudare i suoi codici.',
      comandi: scrive ? `<button class="add-btn-sm" onclick="pqNuovo()">${ico('plus', 'tinted', '')} Nuovo piano</button>` : '',
    },
  });
  a11yFields(el);
}

// I codici del piano nella scheda, in un riquadro che si apre e si chiude.
// Nasce chiuso, con il conteggio: un piano può avere centinaia di codici, e
// la scheda non deve diventare un elenco. Aperto mostra l'elenco intero; la
// scelta vale finché non si cambia piano.
let pqCodiciAperti = null;
function pqCodiciApriChiudi(id) { pqCodiciAperti = pqCodiciAperti === id ? null : id; renderPianiQc(); }

function pqCodiciHtml(p, scrive) {
  const l = qcPianoCodici(p).map(getItem).filter(Boolean).sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
  const contesi = qcPianoContesi(p);
  const aperto = pqCodiciAperti === p.id;
  const famiglia = it => { const f = it.familyId ? getFamily(it.familyId) : null; return f ? f.name : '—'; };
  const titolo = l.length
    ? `<button type="button" class="var-toggle pq-codici-toggle" aria-expanded="${aperto}" onclick="pqCodiciApriChiudi('${p.id}')">${ico(aperto ? 'chevronDown' : 'chevronRight', 'tinted', '')} Codici del piano <span class="qc-conta">${l.length}</span></button>`
    : 'Codici del piano <span class="qc-conta">0</span>';
  return `<div class="qc-card">
    <h3>${titolo}</h3>
    ${!l.length ? `<p class="empty-text qc-hint">${ico('warning', 'tinted', '')} Nessun codice: finché non ne scegli il piano non si applica a niente.</p>`
    : aperto ? `<div class="table-wrap"><table class="qc-table">
      <thead><tr><th scope="col">Codice</th><th scope="col">Descrizione</th><th scope="col">Famiglia</th></tr></thead>
      <tbody>${l.map(it => `<tr><td class="mono">${esc(it.code || '')}</td><td>${esc(it.name || '')}</td><td>${esc(famiglia(it))}</td></tr>`).join('')}</tbody></table></div>`
    : `<p class="empty-text qc-hint">${esc(l.slice(0, 3).map(it => it.code || '').join(', '))}${l.length > 3 ? ` e altri ${l.length - 3}` : ''}.</p>`}
    ${contesi.length ? `<p class="empty-text qc-hint qc-avviso">${ico('warning', 'tinted', '')} ${contesi.length} codic${contesi.length === 1 ? 'e è' : 'i sono'} anche in un altro piano (${esc(contesi.slice(0, 3).map(x => x.piano.name).join(', '))}) e lì vale quello: toglil${contesi.length === 1 ? 'o' : 'i'} da uno dei due.</p>` : ''}
    ${scrive ? `<div class="modal-actions" style="justify-content:flex-start">
      <button class="btn-outline" onclick="qcCodiciModal('${p.id}')">${ico('list', 'tinted', '')} Scegli i codici…</button></div>` : ''}
  </div>`;
}

function pqSchedaHtml(p, scrive) {
  const dis = scrive ? '' : 'disabled';
  const set = campo => `onchange="qcPianoSet('${p.id}','${campo}',this.value);pqRidisegna()"`;
  const m = QC_CAMPIONI[p.sampling] ? p.sampling : 'tutto';
  const esempio = qcCampionamento(p, 500, 'normale');
  const usato = qcTutti().filter(x => x.planId === p.id).length;
  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      <div class="bom-toolbar-left">
        ${worklistCloseBtn('pqChiudi()', 'il piano')}
        <h2 class="section-title">${esc(p.name)}</h2>
      </div>
      <div class="bom-toolbar-right">
        <button class="btn-outline" onclick="qcPianoPdf('${p.id}')">${ico('file', 'tinted', '')} Scheda PDF</button>
        ${scrive ? `<button class="btn-outline" onclick="qcPianoDuplica('${p.id}')">${ico('copy', 'tinted', '')} Duplica</button>
        <button class="btn-outline danger" onclick="qcPianoElimina('${p.id}')">${ico('trash', 'tinted', '')} Elimina</button>` : ''}
      </div>
    </div>
    <div class="qc-card">
      <h3>Il piano</h3>
      <div class="modal-grid">
        <div class="modal-field"><label>Nome del piano</label><input value="${esc(p.name)}" ${dis} ${set('name')}></div>
        <div class="modal-field"><label>Certificato richiesto</label><input value="${esc(p.cert || '')}" maxlength="60" placeholder="es. 3.1 EN 10204" ${dis} ${set('cert')}></div>
      </div>
    </div>
    ${pqCodiciHtml(p, scrive)}
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
      <h3>Per chi collauda</h3>
      <div class="modal-grid">
        <div class="modal-field qc-campo-largo"><label>Istruzioni</label>
          <textarea rows="3" ${dis} onchange="qcPianoSet('${p.id}','notes',this.value)" placeholder="es. Misurare a 20 °C dopo 2 ore di stabilizzazione">${esc(p.notes || '')}</textarea></div>
        <div class="modal-field qc-campo-largo"><label>Messaggio se il controllo fallisce</label>
          <textarea rows="2" ${dis} onchange="qcPianoSet('${p.id}','failMessage',this.value)" placeholder="es. Separare il lotto, etichettare RESPINTO e avvisare l'ufficio acquisti">${esc(p.failMessage || '')}</textarea></div>
      </div>
      <p class="empty-text qc-hint">Il messaggio compare in rosso nel collaudo appena una riga risulta fuori o i pezzi non conformi arrivano al numero di rifiuto.</p>
    </div>
    <p class="empty-text qc-hint">${usato ? `${usato} collaud${usato === 1 ? 'o è nato' : 'i sono nati'} da questo piano. Le modifiche valgono dai prossimi arrivi: chi è già nato tiene la sua copia.` : 'Nessun collaudo è ancora nato da questo piano.'}</p>
    ${stampLine(p)}
  </div>`;
}
// Una caratteristica su due righe: in alto che cosa e con che cosa, sotto la
// quota. La tolleranza si scrive come classe ISO 286 (gli scostamenti li dà la
// tabella e restano bloccati) oppure come due scostamenti; in entrambi i casi
// si vedono subito il minimo e il massimo che vedrà chi collauda.
function pqCaratteristicheHtml(p, scrive) {
  const l = p.characteristics || [];
  if (!l.length) return '<p class="empty-text qc-hint">Nessuna caratteristica: il collaudo chiederà solo l\'esito.</p>';
  const dis = scrive ? '' : 'disabled';
  const num = v => v === '' || v == null ? '' : String(v).replace('.', ',');
  const campo = (c, k, etichetta, attr, valore) => `<div class="modal-field"><label>${etichetta}</label>
      <input ${attr || ''} value="${esc(valore != null ? valore : num(c[k]))}" ${dis}
        onchange="qcCarSetDaCampo(this,'${p.id}','${c.id}','${k}')"></div>`;
  return `<div class="qc-car-list">${l.map((c, i) => {
    const lim = qcLimiti(c);
    const segno = v => v === '' || v == null ? '' : (Number(v) > 0 ? '+' : '') + num(v);
    return `<div class="qc-car">
      <div class="qc-car-riga1">
        <span class="qc-car-num">${i + 1}</span>
        ${campo(c, 'name', 'Caratteristica', 'placeholder="es. Diametro esterno"', c.name || '')}
        <div class="modal-field"><label>Tipo</label>
          <select ${dis} onchange="qcCarSet('${p.id}','${c.id}','kind',this.value)">
            <option value="misura" ${c.kind !== 'ok' ? 'selected' : ''}>Misura</option><option value="ok" ${c.kind === 'ok' ? 'selected' : ''}>Sì / no</option></select></div>
        ${campo(c, 'tool', 'Strumento', 'placeholder="es. Calibro, tampone 20 H7"', c.tool || '')}
        ${scrive ? `<div class="qc-row-cmds">
          <button class="mini-btn" onclick="qcCarSposta('${p.id}','${c.id}',-1)" ${i === 0 ? 'disabled' : ''} title="Sposta su" aria-label="Sposta su">↑</button>
          <button class="mini-btn" onclick="qcCarSposta('${p.id}','${c.id}',1)" ${i === l.length - 1 ? 'disabled' : ''} title="Sposta giù" aria-label="Sposta giù">↓</button>
          <button class="mini-btn danger" onclick="qcCarElimina('${p.id}','${c.id}')" title="Elimina la caratteristica">${ico('trash', 'tinted', 'Elimina')}</button></div>` : ''}
      </div>
      ${c.kind === 'ok' ? '<p class="empty-text qc-hint">Si risponde passa / non passa.</p>' : `<div class="qc-car-riga2">
        ${campo(c, 'nominal', 'Nominale', 'inputmode="decimal" class="num" placeholder="es. 20"')}
        ${campo(c, 'isoClass', 'Classe ISO', 'maxlength="5" placeholder="es. h7"', c.isoClass || '')}
        ${campo(c, 'tolMin', 'Toll. −', `inputmode="decimal" class="num" placeholder="-0,05" ${c.isoClass ? 'readonly title="Lo dà la classe ISO"' : ''}`, segno(c.tolMin))}
        ${campo(c, 'tolMax', 'Toll. +', `inputmode="decimal" class="num" placeholder="+0,05" ${c.isoClass ? 'readonly title="Lo dà la classe ISO"' : ''}`, segno(c.tolMax))}
        ${campo(c, 'uom', 'U.M.', 'maxlength="8"', c.uom || '')}
        <div class="modal-field"><label>Min – max</label><div class="qc-val qc-limiti">${lim ? `${esc(fmtQtyIt(lim.min))} – ${esc(fmtQtyIt(lim.max))}` : '<span class="empty-text">esito a mano</span>'}</div></div>
      </div>`}
    </div>`;
  }).join('')}</div>`;
}

// ─── La finestra di scelta dei codici ───
// Tutti gli articoli a magazzino, con i filtri del catalogo e una spunta a
// sinistra. Chi è già in un altro piano si vede, ma la spunta è spenta e dice
// dove sta: si toglie di là, prima. Le spunte valgono solo con «Conferma».
function qcCodiciModal(id) {
  if (!qcPianoGuard()) return;
  const p = qcPianoGet(id); if (!p) return;
  const miei = new Set(qcPianoCodici(p));
  const articoli = (db.items || []).filter(it => !it.obsolete && hasStock(it))
    .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
  const righe = articoli.map(it => {
    const altro = miei.has(it.id) ? null : qcPianoDelCodice(it.id, id);
    const f = it.familyId ? getFamily(it.familyId) : null;
    return `<label class="rfq-pick-row qcs-row${altro ? ' qcs-preso' : ''}" data-type="${esc(it.type || '')}" data-fam="${esc(it.familyId || '')}" data-sub="${esc(it.subFamilyId || '')}" data-sup="${esc(it.supplierId || '')}" data-cerca="${esc(((it.code || '') + ' ' + (it.name || '')).toLowerCase())}">
      <input type="checkbox" value="${it.id}" ${miei.has(it.id) ? 'checked' : ''} ${altro ? 'disabled' : ''} onchange="qcCodiciConta()">
      <span class="mono">${esc(it.code || '')}</span> <span class="qcs-nome">${esc(it.name || '')}</span>
      <span class="qcs-fam">${esc(f ? f.name : '')}</span>
      ${altro ? `<span class="rfq-pick-type" title="Si toglie dal piano «${esc(altro.name)}» prima">nel piano ${esc(altro.name)}</span>` : ''}</label>`;
  }).join('');
  openModal(`<h3>${ico('list', 'tinted pill', '')} Codici del piano «${esc(p.name)}»</h3>
    <div class="rfq-pick-filters">
      <input class="search" id="qcs-search" placeholder="Codice o descrizione…" oninput="debounced('qcs', qcCodiciFiltra)">
      <select id="qcs-type" onchange="qcCodiciFiltra()" aria-label="Tipo"><option value="">Tutti i tipi</option>${ALL_TYPES.map(t => `<option value="${t}">${typeLabel(t)}</option>`).join('')}</select>
      <select id="qcs-fam" onchange="qcCodiciFamiglia()" aria-label="Macrofamiglia"><option value="">Tutte le famiglie</option>${(db.families || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'it')).map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('')}</select>
      <select id="qcs-sub" onchange="qcCodiciFiltra()" aria-label="Sottofamiglia"><option value="">Tutte le sottofamiglie</option></select>
      <select id="qcs-sup" class="sel-cerca" onchange="qcCodiciFiltra()" aria-label="Fornitore"><option value="">Tutti i fornitori</option>${(db.suppliers || []).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
      <label class="flag-check"><input type="checkbox" id="qcs-solo" onchange="qcCodiciFiltra()"> Solo i selezionati</label>
    </div>
    <div class="qcs-comandi">
      <button class="btn-outline" onclick="qcCodiciSpunta(true)">Spunta i visibili</button>
      <button class="btn-outline" onclick="qcCodiciSpunta(false)">Togli i visibili</button>
      <span class="qc-conta" id="qcs-conta"></span>
    </div>
    <div class="rfq-pick-list qcs-list" id="qcs-list">${righe || '<div class="empty-text">Nessun articolo a magazzino.</div>'}</div>
    <div class="empty-text" id="qcs-empty" style="display:none">Nessun articolo con questi filtri.</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="qcCodiciConferma('${p.id}')">Conferma</button></div>`, true);
  qcCodiciConta();
}
function qcCodiciFamiglia() {
  const f = getFamily(val('qcs-fam'));
  const sel = document.getElementById('qcs-sub');
  if (sel) sel.innerHTML = '<option value="">Tutte le sottofamiglie</option>' + ((f && f.subs) || []).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  qcCodiciFiltra();
}
function qcCodiciFiltra() {
  const q = (val('qcs-search') || '').toLowerCase();
  const ty = val('qcs-type'), fam = val('qcs-fam'), sub = val('qcs-sub'), sup = val('qcs-sup');
  const solo = !!(document.getElementById('qcs-solo') || {}).checked;
  let visti = 0;
  document.querySelectorAll('#qcs-list .qcs-row').forEach(el => {
    const cb = el.querySelector('input');
    const ok = (el.dataset.cerca || '').includes(q) && (!ty || el.dataset.type === ty) && (!fam || el.dataset.fam === fam)
      && (!sub || el.dataset.sub === sub) && (!sup || el.dataset.sup === sup) && (!solo || (cb && cb.checked));
    el.style.display = ok ? '' : 'none';
    if (ok) visti++;
  });
  const vuoto = document.getElementById('qcs-empty');
  if (vuoto) vuoto.style.display = visti ? 'none' : '';
}
// Spunta o toglie le righe visibili che si possono scegliere.
function qcCodiciSpunta(si) {
  document.querySelectorAll('#qcs-list .qcs-row').forEach(el => {
    const cb = el.querySelector('input');
    if (cb && !cb.disabled && el.style.display !== 'none') cb.checked = si;
  });
  qcCodiciConta();
}
function qcCodiciConta() {
  const n = document.querySelectorAll('#qcs-list input:checked').length;
  const el = document.getElementById('qcs-conta');
  if (el) el.textContent = `${n} selezionat${n === 1 ? 'o' : 'i'}`;
}
function qcCodiciConferma(id) {
  const ids = Array.from(document.querySelectorAll('#qcs-list input:checked')).map(c => c.value);
  const r = qcPianoCodiciSet(id, ids);
  if (!r) return;
  closeModal();
  renderPianiQc();
  if (r.scartati.length) {
    showToast(`${r.codici.length} codici nel piano; ${r.scartati.length} lasciat${r.scartati.length === 1 ? 'o' : 'i'} fuori perché nel frattempo ${r.scartati.length === 1 ? 'è entrato' : 'sono entrati'} in un altro piano`, 'error');
  } else savedToast(`${r.codici.length} codic${r.codici.length === 1 ? 'e' : 'i'} nel piano`);
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
  // Il QR apre la scheda rapida del collaudo (qualita-qr.js): con il rapporto
  // in mano, davanti alla merce, si collauda da lì.
  if (x.number) qrPdfDraw(doc, qrLink('col', x.number), doc.internal.pageSize.getWidth() - 14 - 22, 5, 22);
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
        ({ ok: 'OK', ko: 'NON OK / NOT OK' }[qcCheckEsito(c)] || '—') + (c.kind !== 'ok' && c.verdict && (qcCheckForzato(c) || !qcLimiti(c)) ? ' (manuale / manual)' : '')]) });
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
