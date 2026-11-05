// ═══════════════════════════════════════════════════════════
//  BOMTRACK — qualita-iso.js  (modulo Qualità: tolleranze ISO 286)
// ═══════════════════════════════════════════════════════════
// Sul disegno una quota d'accoppiamento non porta i limiti in millimetri: porta
// la classe, «Ø20 h7», «Ø40 G8». Fino alla 0.141 la caratteristica di un piano
// sapeva solo nominale ± scostamenti, e chi scriveva il piano doveva aprire la
// tabella e ricopiarla. Qui la tabella c'è: dalla classe e dal nominale
// escono i due scostamenti, e da quelli i limiti che vede chi collauda.
//
// ── Che cosa copre ──
// ISO 286-1:2010 (sistema ISO di tolleranze per dimensioni lineari) per le
// classi d'uso comune in officina: fori D E F G H JS K M N P, alberi
// d e f g h js k m n p, gradi IT5…IT11, nominali fino a 500 mm. Le lettere
// lontane (a, b, c, r, s, t… z) e i gradi fuori da quella forbice restano
// fuori: si scrivono come scostamenti numerici, che è quello che si faceva
// prima. Meglio dire «non in tabella» che inventare.
//
// ── Come si calcola ──
// Uno scostamento è fondamentale (quello più vicino alla linea dello zero,
// dipende dalla lettera e dalla fascia) e l'altro si ottiene aggiungendo o
// togliendo il grado IT. Per i fori K M N P la norma aggiunge un Δ che dipende
// dalla fascia e dal grado (la «regola speciale», ISO 286-1 tab. 3) finché il
// grado è fine; oltre, valgono le regole generali. Tutti i valori sono in µm,
// fascia per fascia: «oltre 3 fino a 6» sta nella seconda colonna.
//
// I test (test/qualita-iso.test.js) confrontano il risultato con valori letti
// dalle tabelle di ISO 286-2 per molte classi e fasce: se qualcuno tocca un
// numero qui, se ne accorge.

// Il limite superiore di ogni fascia, compreso. La prima è «fino a 3».
const ISO286_FASCE = [3, 6, 10, 18, 30, 50, 80, 120, 180, 250, 315, 400, 500];
// I gradi di tolleranza normalizzati, in µm.
const ISO286_IT = {
  5: [4, 5, 6, 8, 9, 11, 13, 15, 18, 20, 23, 25, 27],
  6: [6, 8, 9, 11, 13, 16, 19, 22, 25, 29, 32, 36, 40],
  7: [10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 57, 63],
  8: [14, 18, 22, 27, 33, 39, 46, 54, 63, 72, 81, 89, 97],
  9: [25, 30, 36, 43, 52, 62, 74, 87, 100, 115, 130, 140, 155],
  10: [40, 48, 58, 70, 84, 100, 120, 140, 160, 185, 210, 230, 250],
  11: [60, 75, 90, 110, 130, 160, 190, 220, 250, 290, 320, 360, 400],
};
// Alberi da d a g: lo scostamento fondamentale è quello superiore (es), negativo.
const ISO286_ES_ALBERI = {
  d: [-20, -30, -40, -50, -65, -80, -100, -120, -145, -170, -190, -210, -230],
  e: [-14, -20, -25, -32, -40, -50, -60, -72, -85, -100, -110, -125, -135],
  f: [-6, -10, -13, -16, -20, -25, -30, -36, -43, -50, -56, -62, -68],
  g: [-2, -4, -5, -6, -7, -9, -10, -12, -14, -15, -17, -18, -20],
  h: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};
// Alberi da k a p: lo scostamento fondamentale è quello inferiore (ei),
// positivo. Per k vale tra IT4 e IT7; fuori, ei = 0.
const ISO286_EI_ALBERI = {
  k: [0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5],
  m: [2, 4, 6, 7, 8, 9, 11, 13, 15, 17, 20, 21, 23],
  n: [4, 8, 10, 12, 15, 17, 20, 23, 27, 31, 34, 37, 40],
  p: [6, 12, 15, 18, 22, 26, 32, 37, 43, 50, 56, 62, 68],
};
// Il Δ della regola speciale per i fori, per grado (ISO 286-1, tab. 3).
const ISO286_DELTA = {
  5: [0, 1, 2, 3, 3, 4, 5, 5, 6, 6, 7, 7, 7],
  6: [0, 3, 3, 3, 4, 5, 6, 7, 7, 9, 9, 11, 13],
  7: [0, 4, 6, 7, 8, 9, 11, 13, 15, 17, 20, 21, 23],
  8: [0, 6, 7, 9, 12, 14, 16, 19, 23, 26, 29, 32, 34],
};
const ISO286_LETTERE = ['d', 'e', 'f', 'g', 'h', 'js', 'k', 'm', 'n', 'p'];

// «h7», «H7», «js6», «JS 7», «G8» → { foro, lettera (minuscola), grado }.
// Le minuscole sono alberi, le maiuscole fori, come sul disegno.
function iso286Leggi(testo) {
  const t = String(testo == null ? '' : testo).replace(/\s+/g, '');
  const m = /^(js|JS|[a-zA-Z])(\d{1,2})$/.exec(t);
  if (!m) return null;
  const foro = m[1] === m[1].toUpperCase();
  const lettera = m[1].toLowerCase();
  const grado = parseInt(m[2], 10);
  if (!ISO286_LETTERE.includes(lettera) || !ISO286_IT[grado]) return null;
  return { foro, lettera, grado, classe: (foro ? lettera.toUpperCase() : lettera) + grado };
}
function iso286Fascia(nominale) {
  const n = Number(nominale);
  if (!isFinite(n) || n <= 0 || n > ISO286_FASCE[ISO286_FASCE.length - 1]) return -1;
  return ISO286_FASCE.findIndex(max => n <= max + 1e-9);
}
// Gli scostamenti in µm, { inf, sup }, o null se la classe o il nominale non
// stanno in tabella.
function iso286Scostamenti(nominale, classe) {
  const c = typeof classe === 'string' ? iso286Leggi(classe) : classe;
  const i = iso286Fascia(nominale);
  if (!c || i < 0) return null;
  const it = ISO286_IT[c.grado][i];
  if (c.lettera === 'js') {
    // ± IT/2, anche quando IT è dispari (js7 da 6 a 10: ± 7,5), come nelle
    // tabelle di ISO 286-2:2010.
    return { inf: -it / 2, sup: it / 2 };
  }
  if (!c.foro) {
    if (ISO286_ES_ALBERI[c.lettera]) {
      const es = ISO286_ES_ALBERI[c.lettera][i];
      return { inf: es - it, sup: es };
    }
    let ei = ISO286_EI_ALBERI[c.lettera][i];
    if (c.lettera === 'k' && (c.grado < 4 || c.grado > 7)) ei = 0;
    return { inf: ei, sup: ei + it };
  }
  // I fori da D a H sono lo specchio degli alberi: EI = −es.
  if (ISO286_ES_ALBERI[c.lettera]) {
    const ei = -ISO286_ES_ALBERI[c.lettera][i];
    return { inf: ei, sup: ei + it };
  }
  // K, M, N, P: lo scostamento fondamentale è quello superiore (ES).
  const delta = ISO286_DELTA[c.grado] ? ISO286_DELTA[c.grado][i] : 0;
  const eiAlbero = ISO286_EI_ALBERI[c.lettera][i];
  let es;
  if (i === 0) es = { k: 0, m: -2, n: -4, p: -6 }[c.lettera];
  else if (c.lettera === 'k') es = c.grado <= 8 ? -eiAlbero + delta : 0;
  else if (c.lettera === 'm') es = c.grado <= 8 ? -eiAlbero + delta : -eiAlbero;
  else if (c.lettera === 'n') es = c.grado <= 8 ? -eiAlbero + delta : 0;
  else es = c.grado <= 7 ? -eiAlbero + delta : -eiAlbero;
  return { inf: es - it, sup: es };
}
// Gli scostamenti in mm, come li vuole la caratteristica (tolMin, tolMax).
function iso286Tolleranze(nominale, classe) {
  const s = iso286Scostamenti(nominale, classe);
  if (!s) return null;
  const mm = v => Math.round(v) === v ? v / 1000 : Math.round(v * 10) / 10000;
  return { tolMin: mm(s.inf), tolMax: mm(s.sup) };
}
