// ═══════════════════════════════════════════════════════════
//  BOMTRACK — calendario.js
// ═══════════════════════════════════════════════════════════
// Il calendario di fabbrica: quali giorni si lavora. Serve alla
// programmazione a ritroso del fabbisogno (views-mrp.js), che da una data di
// consegna risale ciclo e distinta e deve sapere che «tre giorni di tornitura
// prima di lunedì» cominciano il mercoledì prima, non il venerdì.
//
// Due regole, scelte e non ovvie:
//   1. **Le lavorazioni interne** si contano in giorni lavorativi: è il nostro
//      reparto, e il sabato o il 15 agosto non lavora.
//   2. **I giorni dei fornitori** (consegna a listino, attraversamento del
//      terzista) restano di calendario, come li dichiarano loro; la data che
//      ne esce — entro quando ordinare, quando spedire — si sposta al giorno
//      lavorativo **precedente** se cade su un festivo: un ordine si manda da
//      un ufficio aperto, e anticipare è il modo giusto di sbagliare.
//
// Stessa disciplina di addDays(): le date sono stringhe `YYYY-MM-DD` e i conti
// si fanno in UTC, dove le date non hanno fuso. Costruirle a mezzanotte locale
// le farebbe scivolare di un giorno a est di Greenwich.
// Classic script, scope globale condiviso con gli altri.

// Il calendario di serie (lunedì–venerdì e festivi nazionali) sta in store.js,
// `calDefault()`: lo usa la migrazione, che gira prima che questo file esista.
// Il calendario in uso. Senza impostazioni (un archivio che non le ha ancora
// migrate, un test) vale quello di serie: lunedì–venerdì e festivi nazionali.
// Il calendario di serie è uno solo per tutta la sessione: un oggetto nuovo a
// ogni lettura svuoterebbe la cache a ogni giorno contato.
let _calDiSerie = null;
function calSettings() {
  const c = (typeof db !== 'undefined' && db && db.settings && db.settings.calendar) || null;
  if (c && Array.isArray(c.workDays)) return c;
  return _calDiSerie || (_calDiSerie = calDefault());
}

// ─── La cache ───
// Un calendario si legge migliaia di volte per esplodere un piano, e cambia
// quando qualcuno lo modifica in Gestione — che lo **sostituisce** intero
// (saveSettings), così basta riconoscere l'oggetto. Chi lo modificasse sul
// posto passa da invalidateCaches(), che chiama calInvalidate(). Dentro la
// cache si ricordano anche i giorni già classificati e i conti già fatti:
// un piano chiede cento volte «tre giorni lavorativi prima del 14».
let _calCache = null;
function calInvalidate() { _calCache = null; }
function calState() {
  const cal = calSettings();
  if (_calCache && _calCache.cal === cal) return _calCache;
  const firma = JSON.stringify(cal);
  if (_calCache && _calCache.firma === firma) { _calCache.cal = cal; return _calCache; }
  const lavorativi = new Set((cal.workDays || []).map(Number).filter(n => n >= 0 && n <= 6));
  _calCache = {
    firma, cal,
    // Un calendario senza nemmeno un giorno lavorativo non si può rispettare:
    // si lavora tutti i giorni, invece di cercare all'infinito un giorno che
    // non arriverà.
    lavorativi: lavorativi.size ? lavorativi : new Set([0, 1, 2, 3, 4, 5, 6]),
    ricorrenti: new Set((cal.holidays || []).map(s => String(s).trim().slice(-5))),
    chiusure: (cal.closures || []).filter(c => c && c.from).map(c => ({ from: String(c.from).slice(0, 10), to: String(c.to || c.from).slice(0, 10) })),
    pasque: new Map(),
    giorni: new Map(),   // iso → si lavora?
    conti: new Map(),    // 'iso|n' → addWorkDays
  };
  return _calCache;
}

// ─── Pasqua ───
// Algoritmo di Meeus/Jones/Butcher per il calendario gregoriano. Pasquetta è
// il giorno dopo, ed è quello che in fabbrica conta: la domenica è già festa.
function pasqua(anno) {
  const a = anno % 19, b = Math.floor(anno / 100), c = anno % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return anno + '-' + String(mese).padStart(2, '0') + '-' + String(giorno).padStart(2, '0');
}
function pasquetta(anno) { return calShift(pasqua(anno), 1); }

// Un giorno in più o in meno, senza calendario: il mattone di tutto il resto.
function calShift(iso, giorni) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  if (isNaN(d)) return '';
  d.setUTCDate(d.getUTCDate() + giorni);
  return d.toISOString().slice(0, 10);
}
const CAL_ISO = /^\d{4}-\d{2}-\d{2}/;
function calValida(iso) {
  if (!iso) return false;
  const s = String(iso);
  return CAL_ISO.test(s) ? !isNaN(new Date(s.slice(0, 10) + 'T00:00:00Z')) : false;
}

function calLavora(st, iso) {
  let v = st.giorni.get(iso);
  if (v === undefined) { v = calClassifica(st, iso); st.giorni.set(iso, v); }
  return v;
}
function calClassifica(st, iso) {
  const d = new Date(iso + 'T00:00:00Z');
  if (!st.lavorativi.has(d.getUTCDay())) return false;
  if (st.ricorrenti.has(iso.slice(5))) return false;
  if (st.cal.easter !== false) {
    const anno = d.getUTCFullYear();
    if (!st.pasque.has(anno)) st.pasque.set(anno, pasquetta(anno));
    if (st.pasque.get(anno) === iso) return false;
  }
  for (const c of st.chiusure) if (iso >= c.from && iso <= c.to) return false;
  return true;
}
// Il tetto ai passi: dieci anni di giorni. Un calendario patologico (tutto
// chiuso per sempre) non deve bloccare la pagina.
const CAL_MAX_PASSI = 3660;

function isWorkDay(iso) {
  if (!calValida(iso)) return false;
  return calLavora(calState(), String(iso).slice(0, 10));
}
// La data stessa se si lavora, altrimenti il primo giorno lavorativo prima.
function prevWorkDay(iso) {
  if (!calValida(iso)) return '';
  const st = calState();
  let d = String(iso).slice(0, 10);
  for (let n = 0; n < CAL_MAX_PASSI && !calLavora(st, d); n++) d = calShift(d, -1);
  return d;
}
function nextWorkDay(iso) {
  if (!calValida(iso)) return '';
  const st = calState();
  let d = String(iso).slice(0, 10);
  for (let n = 0; n < CAL_MAX_PASSI && !calLavora(st, d); n++) d = calShift(d, 1);
  return d;
}
// `n` giorni lavorativi prima (n < 0) o dopo (n > 0). Con n = 0 la data resta
// com'è: zero giorni di lavoro non spostano niente, nemmeno da un festivo.
//
// A ritroso il risultato è l'**n-esimo giorno lavorativo prima** della data:
// una fase di un giorno che deve finire lunedì comincia il venerdì. È la
// lettura «la data è il mattino in cui il pezzo è pronto», la stessa di
// addDays per il materiale (serve il 30, consegna in 10 giorni → si ordina il 20).
function addWorkDays(iso, n) {
  if (!iso) return '';
  const passi = Math.round(Number(n) || 0);
  let d = String(iso).slice(0, 10);
  const st = calState();
  const chiave = d + '|' + passi;
  const noto = st.conti.get(chiave);
  if (noto !== undefined) return noto;
  if (!calValida(d)) return '';
  if (!passi) return d;
  const verso = passi > 0 ? 1 : -1;
  let fatti = 0;
  for (let k = 0; k < CAL_MAX_PASSI * 2 && fatti < Math.abs(passi); k++) {
    d = calShift(d, verso);
    if (calLavora(st, d)) fatti++;
  }
  st.conti.set(chiave, d);
  return d;
}
// I giorni lavorativi in [a, b): quanti giorni di lavoro ci sono da a fino al
// giorno prima di b. Negativo se b viene prima di a — è il margine di una
// data rispetto a un'altra, e un margine negativo è un ritardo.
function workDaysBetween(a, b) {
  if (!calValida(a) || !calValida(b)) return 0;
  const da = String(a).slice(0, 10), al = String(b).slice(0, 10);
  if (da === al) return 0;
  const st = calState();
  const [x, y, segno] = da < al ? [da, al, 1] : [al, da, -1];
  let d = x, n = 0;
  for (let k = 0; k < CAL_MAX_PASSI * 2 && d < y; k++) {
    if (calLavora(st, d)) n++;
    d = calShift(d, 1);
  }
  return n * segno;
}
// Quanti giorni lavorativi ha una settimana tipo: serve a tradurre la capacità
// settimanale di un centro in ore al giorno.
function workDaysPerWeek() { return calState().lavorativi.size; }

// ─── I giorni dei fornitori ───
// Consegna a listino, attraversamento e trasporto del terzista, ritardi
// confermati: dalla 0.110.0 si contano di serie in giorni **lavorativi** del
// calendario, come li scrive quasi ogni fornitore italiano («10 gg lav.»), e la
// settimana è di cinque giorni anche per loro. Chi ha fornitori che dichiarano
// giorni di calendario lo dice in Gestione › Calendario (`supplierDays:
// 'calendario'`): allora valgono pieni, sabati e domeniche compresi, come
// prima. Un archivio che non ha il campo vale lavorativi.
function calFornitoriLavorativi() { return calSettings().supplierDays !== 'calendario'; }
// La data `n` giorni-fornitore prima di `iso` (n > 0): l'ultimo giorno in cui
// mandare l'ordine o la merce perché arrivi il mattino di `iso`. Cade sempre su
// un giorno lavorativo: un ordine si manda da un ufficio aperto, e anticipare è
// il modo giusto di sbagliare.
function supplierDaysBefore(iso, n) {
  if (!calValida(iso)) return '';
  const g = Math.max(0, Math.round(Number(n) || 0));
  if (calFornitoriLavorativi() && g > 0) return addWorkDays(iso, -g);
  return prevWorkDay(calShift(iso, -g));
}
// La data `n` giorni-fornitore dopo `iso`: quando arriva quello che parte (o si
// ordina) quel giorno. Un arrivo che cadesse in un giorno di chiusura si
// riceve il primo giorno lavorativo dopo: il magazzino è chiuso anche per lui.
// Con n = 0 la data resta com'è.
function supplierDaysAfter(iso, n) {
  if (!calValida(iso)) return '';
  const g = Math.max(0, Math.round(Number(n) || 0));
  if (!g) return String(iso).slice(0, 10);
  if (calFornitoriLavorativi()) return addWorkDays(iso, g);
  return nextWorkDay(calShift(iso, g));
}
// Quanti giorni-fornitore da `a` a `b`: il ritardo di una conferma sulla data
// richiesta, o di una consegna scaduta. Negativo se `b` viene prima.
function supplierDaysBetween(a, b) {
  if (!calValida(a) || !calValida(b)) return null;
  if (calFornitoriLavorativi()) return workDaysBetween(a, b);
  return Math.round((Date.parse(String(b).slice(0, 10) + 'T00:00:00Z') - Date.parse(String(a).slice(0, 10) + 'T00:00:00Z')) / 86400000);
}
// «3 giorni lavorativi», «1 giorno»: il ritardo detto nell'unità in cui è contato.
function supplierDaysText(n) {
  const uno = Math.abs(n) === 1;
  return n + ' ' + (uno ? 'giorno' : 'giorni') + (calFornitoriLavorativi() ? (uno ? ' lavorativo' : ' lavorativi') : '');
}
