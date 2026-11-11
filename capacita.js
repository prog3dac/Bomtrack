// ═══════════════════════════════════════════════════════════
//  BOMTRACK — capacita.js
// ═══════════════════════════════════════════════════════════
// Modulo Capacità finita (dalla 0.123.0), nell'area Produzione interna.
// Classic script, scope globale condiviso.
//
// Il fabbisogno e gli ODP pianificano **a ritroso** dalla data in cui il pezzo
// serve, a capacità infinita: ogni fase ha il suo tempo, come se il centro
// fosse libero. Qui si fa il conto **in avanti**, da oggi: le fasi interne
// degli ODP lanciati e in corso si mettono in fila sul loro centro, per data
// di consegna, senza superare le ore che il centro lavora in un giorno, nei
// giorni lavorativi del calendario e fuori dai fermi di manutenzione. Una fase
// in un giorno non fa più delle ore dei suoi operatori (faseOreGiorno). Ne esce
// la **data fattibile** di ogni ordine, accanto a quella richiesta.
//
// Propone e non comanda: le date pianificate restano quelle di prima, e un
// ritardo qui è un avviso da guardare, non una data riscritta.
//
// Le ore di una fase sono le ore del ciclo per i pezzi ancora da fare, più
// l'attrezzaggio della fase se non è partita, dopo la sua coda; con il modulo Officina acceso, le
// ore già timbrate su una fase in corso non si tolgono — il ciclo dice quanto
// resta per pezzo, le timbrature quanto si è speso.
// Una fase esterna non occupa centri: dura i suoi giorni dal terzista, più il
// trasporto, e sposta in avanti la fase interna che la segue.

const CAP_ORIZZONTE = 730;   // due anni di giorni: oltre, la fila non si fa
let _capCache = null;
function invalidateCapacita() { _capCache = null; }

// I pezzi che restano da fare sono quelli **attesi** dalla fase, non quelli
// già arrivati: su un ordine appena lanciato alla 20 non è entrato ancora
// niente, ma i pezzi arriveranno e le ore del centro vanno messe in fila
// adesso (dalla 0.131.0; prima le fasi dopo la prima valevano zero ore, e la
// data fattibile usciva troppo presto).
function capOreFase(o, f) {
  const resta = Math.max(0, opAttesiFase(o, f) - opProcessati(o, f));
  const setup = opAvviata(o, f) ? 0 : faseAttrezzaggio(f);
  return resta > 0.000001 ? setup + (Number(f.hours) || 0) * resta : 0;
}
function capOreGiorno(wc, iso) {
  if (!isWorkDay(iso)) return 0;
  if (typeof centroFermo === 'function' && centroFermo(wc.id, iso)) return 0;
  // Con le macchine (macchine.js) una ferma toglie la sua parte del centro.
  return wcOreGiornoCentro(wc) * (typeof quotaCentroAttiva === 'function' ? quotaCentroAttiva(wc.id, iso) : 1);
}
// La macchina della fase, se il modulo Macchine utensili è acceso e la
// macchina esiste ancora: la fase fa la fila anche su di lei.
function capMacchinaFase(f) {
  if (f.supplierId || !f.machineId || typeof getMachine !== 'function' || !moduloAttivo('macchine')) return null;
  return getMachine(f.machineId);
}
// → { fasi: Map faseId → { start, end, ore }, ordini: Map odpId → { fattibile, ritardo } }
function capSchedula(oggi) {
  const g = oggi || oggiISO();
  if (_capCache && _capCache.oggi === g) return _capCache.r;
  const usato = new Map();   // wcId|giorno → ore già occupate
  const fasi = new Map(), ordini = new Map();
  const odp = (db.prodOrders || []).filter(o => ODP_APERTI.includes(o.status))
    .sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')) || String(a.number).localeCompare(String(b.number)));
  odp.forEach(o => {
    let pronto = nextWorkDay(g);   // il primo giorno in cui la fase successiva può cominciare
    let fine = '';
    (o.phases || []).forEach(f => {
      if (opChiusa(o, f)) return;
      if (f.supplierId) {
        // Il trasporto una volta per tratta, sulla sua prima fase.
        const prima = !(Number(f.opIndex) > Number(f.runFrom));
        const gg = Math.max(0, Number(f.days) || 0) + (prima ? faseTrasporto(f) : 0);
        const end = gg > 0 ? addWorkDays(pronto, gg) : pronto;
        fasi.set(f.id, { start: pronto, end, ore: 0, esterna: true });
        fine = end; pronto = end;
        return;
      }
      const wc = getWorkCenter(f.workCenterId);
      const mac = capMacchinaFase(f);
      const op = faseOperatori(f);
      let resta = capOreFase(o, f);
      if (!wc || !(resta > 0)) { fasi.set(f.id, { start: pronto, end: pronto, ore: 0 }); fine = pronto; return; }
      // La coda della fase: i giorni che il pezzo aspetta davanti al centro
      // prima di essere lavorato. Una fase già avviata l'ha già fatta.
      const coda = opAvviata(o, f) ? 0 : faseCoda(f);
      const arrivo = pronto;   // il giorno in cui il pezzo arriva davanti al centro
      if (coda > 0) pronto = addWorkDays(pronto, coda);
      const giorni = [];       // { d, ore }: le ore che la fase prende, giorno per giorno
      let d = pronto, start = '', end = pronto;
      for (let n = 0; resta > 1e-9 && n < CAP_ORIZZONTE; n++, d = calShift(d, 1)) {
        const cap = capOreGiorno(wc, d);
        if (!(cap > 0)) continue;
        if (mac && macchinaFerma(mac.id, d)) continue;
        const k = wc.id + '|' + d;
        const libero = cap - (usato.get(k) || 0);
        if (!(libero > 1e-9)) continue;
        // Una macchina lavora al più le ore al giorno di un operatore del suo
        // centro (un turno), in ore di macchina: le ore-uomo della fase divise
        // per i suoi operatori. Due fasi sulla stessa macchina se la dividono.
        const km = mac ? 'm|' + mac.id + '|' + d : '';
        const liberaMac = mac ? (wcHoursPerDay(wc) - (usato.get(km) || 0)) * op : Infinity;
        if (!(liberaMac > 1e-9)) continue;
        // Una fase non fa più delle ore dei suoi operatori in un giorno.
        const preso = Math.min(libero, resta, faseOreGiorno(wc, f.operators), liberaMac);
        usato.set(k, (usato.get(k) || 0) + preso);
        if (mac) usato.set(km, (usato.get(km) || 0) + preso / op);
        resta -= preso;
        giorni.push({ d, ore: preso });
        if (!start) start = d;
        end = d;
      }
      fasi.set(f.id, { start: start || pronto, end, ore: capOreFase(o, f), oltre: resta > 1e-9,
        arrivo, codaFino: coda > 0 ? pronto : '', giorni, setup: opAvviata(o, f) ? 0 : faseAttrezzaggio(f) });
      fine = end;
      // La fase dopo comincia il giorno lavorativo successivo.
      pronto = addWorkDays(end, 1);
    });
    const due = String(o.dueDate || '').slice(0, 10);
    ordini.set(o.id, { fattibile: fine, ritardo: !!(due && fine && fine > due) });
  });
  const r = { fasi, ordini, usato };
  _capCache = { oggi: g, r };
  return r;
}
function capOrdine(odpId) { return moduloAttivo('capacita') ? capSchedula().ordini.get(odpId) || null : null; }
function capFase(faseId) { return moduloAttivo('capacita') ? capSchedula().fasi.get(faseId) || null : null; }
function capInRitardo() {
  if (!moduloAttivo('capacita')) return [];
  const s = capSchedula();
  return (db.prodOrders || []).filter(o => { const x = s.ordini.get(o.id); return x && x.ritardo; });
}

// La riga sopra le fasi dell'ODP.
function capOdpHtml(o) {
  const x = capOrdine(o.id);
  if (!x || !x.fattibile) return '';
  const gg = x.ritardo ? workDaysBetween(String(o.dueDate).slice(0, 10), x.fattibile) : 0;
  return `<div class="${x.ritardo ? 'rfq-warn' : 'empty-text'}" style="text-align:left">${ico('clock', 'tinted', '')} A capacità finita l'ordine finisce il <strong>${esc(fmtDateIt(x.fattibile))}</strong>${x.ritardo ? `: ${gg} ${gg === 1 ? 'giorno lavorativo' : 'giorni lavorativi'} dopo la data richiesta` : ', in tempo'}. Le fasi in fila sui centri per data di consegna, nelle ore che ogni centro lavora.</div>`;
}
// La fila di un centro, per il Carico centri.
function capCodaHtml() {
  if (!moduloAttivo('capacita')) return '';
  const s = capSchedula();
  const perCentro = new Map();
  (db.prodOrders || []).filter(o => ODP_APERTI.includes(o.status)).forEach(o => (o.phases || []).forEach(f => {
    const x = s.fasi.get(f.id);
    if (!x || x.esterna || !(x.ore > 0)) return;
    const l = perCentro.get(f.workCenterId) || [];
    l.push({ o, f, x });
    perCentro.set(f.workCenterId, l);
  }));
  if (!perCentro.size) return `<div class="mrp-section"><div class="cycle-section-head"><h3>${ico('clock', 'tinted', '')} Coda a capacità finita</h3></div><div class="empty-text">Nessuna fase interna da fare sugli ordini lanciati.</div></div>`;
  const blocchi = Array.from(perCentro.entries()).map(([wcId, l]) => {
    const wc = getWorkCenter(wcId);
    l.sort((a, b) => a.x.start.localeCompare(b.x.start));
    return `<h4 class="settings-group-title">${esc(wc ? wc.name : '(centro mancante)')} · ${fmtQtyIt(+wcOreGiornoCentro(wc).toFixed(2))} h al giorno</h4>
      <div class="table-wrap"><table class="dash-table"><thead><tr><th>Ordine</th><th>Fase</th><th class="num">Ore</th><th>Dal</th><th>Al</th><th>Serve il</th></tr></thead><tbody>
      ${l.map(({ o, f, x }) => { const r = (s.ordini.get(o.id) || {}).ritardo; return `<tr><td><span class="code-link" ${clickAttrs(`homeApri('odp','${o.id}')`, 'Apri ' + (o.number || ''))}>${esc(o.number || '')}</span> ${esc(o.code || '')}</td>
        <td>${esc(String(f.seq))}</td><td class="num">${fmtQtyIt(+x.ore.toFixed(2))}</td><td>${esc(fmtDateIt(x.start))}</td>
        <td style="color:${r ? 'var(--red)' : 'inherit'}">${esc(fmtDateIt(x.end))}${x.oltre ? ' …' : ''}</td><td>${o.dueDate ? esc(fmtDateIt(o.dueDate)) : '—'}</td></tr>`; }).join('')}
      </tbody></table></div>`;
  }).join('');
  return `<div class="mrp-section"><div class="cycle-section-head"><h3>${ico('clock', 'tinted', '')} Coda a capacità finita</h3></div>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Gli ordini di produzione lanciati e in corso, in fila sui centri per data di consegna, da oggi in avanti: nei giorni lavorativi, nelle ore al giorno di ogni centro, fuori dai fermi di manutenzione. A sinistra della linea di oggi quello che è successo, a destra quello che succederà. In rosso gli ordini che finiscono dopo la data richiesta. Le date pianificate degli ordini non cambiano.</p>
    ${capLineaHtml()}
    <details class="cap-tabelle"><summary>Le fasi in tabella</summary>${blocchi}</details></div>`;
}

// ─── La linea temporale dei centri (dalla 0.152.0) ───
// La coda sopra in figura: per ogni centro una striscia di giorni, e su di
// essa le fasi che lo impegnano. Il grafico della saturazione dice quanto è
// pieno un centro; questa dice **di cosa** è pieno, e quando.
//
// A sinistra di oggi c'è quello che è successo, a destra quello che succederà:
//   - il **reale**: i giorni in cui la fase è stata timbrata (modulo Officina)
//     o, senza timbrature, dall'avvio all'ultima dichiarazione;
//   - il **previsto** a capacità finita, con l'attrezzaggio (le prime ore
//     della fase non avviata), il lavoro e l'**attraversamento**: la coda
//     davanti al centro e i giorni in cui la fase aspetta che il centro si
//     liberi;
//   - il **pianificato** dell'ODP, una riga sottile sopra la barra: dove la
//     fase doveva stare. Lo scarto fra le due è il ritardo, senza conti.
// Le fasi che non si toccano stanno sulla stessa corsia: una linea per centro,
// che si allarga solo quando il centro lavora più fasi insieme.
const CAP_LINEA_PRIMA = 14;    // giorni di calendario prima di oggi
const CAP_LINEA_DOPO = 120;    // oltre, la linea si taglia
const CAP_LINEA_GG = 24;       // larghezza di un giorno, in px

// Il reale di una fase: giorno → ore timbrate, oppure l'intervallo dall'avvio
// all'ultima dichiarazione (fino a oggi se la fase è ancora aperta).
function capRealeFase(o, f, oggi) {
  const giorni = new Map();
  if (moduloAttivo('officina') && typeof logsDiFase === 'function') {
    logsDiFase(o.id, f.id).forEach(l => {
      const d = String(l.startedAt || '').slice(0, 10);
      if (d) giorni.set(d, (giorni.get(d) || 0) + logOre(l));
    });
  }
  const decl = opDecls(o.id, f.id);
  const avvio = decl.find(d => d.kind === 'avvio');
  const date = decl.filter(d => ['avvio', 'avanzamento', 'chiusura'].includes(d.kind)).map(d => String(d.date || '').slice(0, 10)).filter(Boolean);
  const chiusa = opChiusa(o, f);
  const dal = avvio ? String(avvio.date || '').slice(0, 10) : '';
  const al = date.length ? date[date.length - 1] : '';
  return { giorni, dal, al: chiusa ? al : (dal ? oggi : ''), chiusa };
}

function capLineaDati(oggi) {
  const s = capSchedula(oggi);
  const perCentro = new Map();
  (db.prodOrders || []).filter(o => ODP_APERTI.includes(o.status)).forEach(o => (o.phases || []).forEach(f => {
    if (f.supplierId || !f.workCenterId) return;
    const x = s.fasi.get(f.id);
    const prev = x && !x.esterna && x.ore > 0 ? x : null;
    const reale = capRealeFase(o, f, oggi);
    if (!prev && !reale.dal) return;
    const estremi = [prev && (prev.arrivo || prev.start), prev && prev.end, reale.dal, reale.al,
      ...Array.from(reale.giorni.keys())].filter(Boolean).sort();
    if (!estremi.length) return;
    const l = perCentro.get(f.workCenterId) || [];
    l.push({ o, f, prev, reale, dal: estremi[0], al: estremi[estremi.length - 1], ritardo: !!(s.ordini.get(o.id) || {}).ritardo });
    perCentro.set(f.workCenterId, l);
  }));
  return perCentro;
}
// Le corsie: ogni fase va sulla prima corsia libera dal suo primo giorno (il
// pianificato compreso, se cade nella finestra), con un giorno di respiro.
// `ii`: indice del primo e dell'ultimo giorno di ogni fase, etichetta compresa.
function capLineaCorsie(voci) {
  const fine = [];
  voci.sort((a, b) => a.i0 - b.i0 || a.i1 - b.i1);
  voci.forEach(v => {
    let k = fine.findIndex(x => x < v.i0);
    if (k < 0) { k = fine.length; fine.push(-1); }
    fine[k] = v.i1; v.corsia = k;
  });
  return fine.length;
}

function capLineaHtml(oggi) {
  if (!moduloAttivo('capacita')) return '';
  const g = oggi || oggiISO();
  const perCentro = capLineaDati(g);
  if (!perCentro.size) return '';
  const dal = calShift(g, -CAP_LINEA_PRIMA);
  let al = g;
  perCentro.forEach(l => l.forEach(v => { if (v.al > al) al = v.al; }));
  const limite = calShift(g, CAP_LINEA_DOPO);
  const tagliata = al > limite;
  if (tagliata) al = limite;
  const giorni = [];
  for (let d = dal; d <= al && giorni.length < CAP_LINEA_PRIMA + CAP_LINEA_DOPO + 2; d = calShift(d, 1)) giorni.push(d);
  const idx = new Map(giorni.map((d, i) => [d, i]));
  const blocchi = Array.from(perCentro.entries())
    .map(([wcId, l]) => ({ wc: getWorkCenter(wcId), l }))
    .sort((a, b) => String(a.wc ? a.wc.name : '').localeCompare(String(b.wc ? b.wc.name : '')))
    .map(({ wc, l }) => capLineaCentro(wc, l, giorni, idx, g)).join('');
  return `<div class="cap-linea">
    ${capLineaLegenda()}
    ${blocchi}
    ${tagliata ? `<p class="empty-text" style="text-align:left;padding:4px 0 0">La linea si ferma al ${esc(fmtDateIt(al))}: le fasi oltre sono nella tabella di ogni centro.</p>` : ''}
  </div>`;
}
function capLineaLegenda() {
  const voce = (cls, testo) => `<span class="cap-leg"><i class="${cls}"></i>${esc(testo)}</span>`;
  return `<div class="cap-legenda" aria-hidden="true">
    ${voce('cap-sw-att', 'Attrezzaggio')}${voce('cap-sw-lav', 'Lavoro')}${voce('cap-sw-coda', 'Attraversamento: coda e attesa del centro')}
    ${voce('cap-sw-reale', 'Reale: timbrato o dichiarato')}${voce('cap-sw-pian', 'Pianificato nell’ODP')}
    ${voce('cap-sw-serve', 'Serve il')}${voce('cap-sw-oggi', 'Oggi')}</div>`;
}
function capLineaCentro(wc, l, giorni, idx, oggi) {
  const DW = CAP_LINEA_GG, primo = giorni[0], ultimo = giorni[giorni.length - 1];
  const cl = d => (d < primo ? primo : d > ultimo ? ultimo : d);
  const xDi = d => (idx.get(cl(d)) || 0) * DW;
  // Il riquadro di ogni fase per le corsie: reale, previsto e pianificato.
  const voci = l.map(v => {
    const p = [v.dal, v.al, v.f.plannedStart, v.f.plannedEnd].filter(d => d && d >= primo && d <= ultimo).sort();
    const da = cl(p[0] || v.dal), a = cl(p[p.length - 1] || v.al);
    // Il rombo della consegna sta sulla corsia della fase: conta anche lui.
    const due = String(v.o.dueDate || '').slice(0, 10);
    const ultimoUsato = due && due > a && due <= ultimo ? due : a;
    // L'etichetta occupa i suoi giorni: due fasi vicine non ci scrivono sopra.
    const i0 = idx.get(da) || 0;
    const lungo = Math.ceil((String(v.o.number || '').length + String(v.f.seq).length + 4) * 6.4 / DW);
    return Object.assign(v, { da, a, i0, i1: Math.max(idx.get(ultimoUsato) || 0, i0 + lungo - 1) });
  }).filter(v => v.a >= primo && v.da <= ultimo);
  if (!voci.length) return '';
  const corsie = capLineaCorsie(voci);
  const ALT = 40, TESTA = 34, W = giorni.length * DW + 120;
  const H = TESTA + corsie * ALT + 4;
  // Lo sfondo: i giorni di chiusura e il fermo del centro, le settimane.
  const fondo = giorni.map((d, i) => {
    const chiuso = !(capOreGiorno(wc, d) > 0);
    const lun = new Date(d + 'T00:00:00Z').getUTCDay() === 1;
    return (chiuso ? `<rect x="${i * DW}" y="${TESTA}" width="${DW}" height="${H - TESTA}" class="cap-chiuso"/>` : '')
      + (lun ? `<line x1="${i * DW}" y1="${TESTA - 18}" x2="${i * DW}" y2="${H}" class="cap-sett"/>
        <text x="${i * DW + 3}" y="${TESTA - 21}" class="cap-ax cap-ax-lun">${esc(fmtDateIt(d).slice(0, 5))}</text>` : '')
      + `<text x="${i * DW + DW / 2}" y="${TESTA - 9}" text-anchor="middle" class="cap-ax${chiuso ? ' cap-ax-chiuso' : ''}">${esc(['D', 'L', 'M', 'M', 'G', 'V', 'S'][new Date(d + 'T00:00:00Z').getUTCDay()])}</text>`;
  }).join('');
  const fasi = voci.map(v => capLineaFase(v, wc, xDi, primo, ultimo, TESTA + v.corsia * ALT, DW)).join('');
  const xo = xDi(oggi) ;
  const linOggi = oggi >= primo && oggi <= ultimo
    ? `<line x1="${xo}" y1="${TESTA - 18}" x2="${xo}" y2="${H}" class="cap-oggi"/>` : '';
  const nome = wc ? wc.name : '(centro mancante)';
  const inRit = new Set(voci.filter(v => v.ritardo).map(v => v.o.id)).size;
  return `<figure class="cap-centro">
    <figcaption><strong>${esc(nome)}</strong> <span class="empty-text" style="padding:0">${fmtQtyIt(+wcOreGiornoCentro(wc).toFixed(2))} h al giorno · ${voci.length} ${voci.length === 1 ? 'fase' : 'fasi'}${inRit ? ` · <span style="color:var(--red)">${inRit} ${inRit === 1 ? 'ordine' : 'ordini'} in ritardo</span>` : ''}</span></figcaption>
    <div class="cap-scorri" data-oggi="${linOggi ? xo : ''}"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="${esc(`${nome}: ${voci.length} fasi dal ${fmtDateIt(primo)} al ${fmtDateIt(ultimo)}`)}">${fondo}${fasi}${linOggi}</svg></div>
  </figure>`;
}
// Una fase: il pianificato sopra, sotto la barra con il reale e il previsto.
function capLineaFase(v, wc, xDi, primo, ultimo, y, DW) {
  const { o, f, prev, reale } = v;
  const dentro = d => d && d >= primo && d <= ultimo;
  const yb = y + 14, hb = 16;
  // L'ambito della fase: un fondo tenue che tiene insieme i suoi pezzi.
  const parti = [`<rect x="${xDi(v.da)}" y="${yb - 2}" width="${xDi(v.a) + DW - xDi(v.da)}" height="${hb + 4}" rx="4" class="cap-ambito"/>`];
  // Il pianificato: una riga sottile sotto la barra.
  if (f.plannedStart && f.plannedEnd && f.plannedEnd >= primo && f.plannedStart <= ultimo) {
    const x1 = xDi(f.plannedStart), x2 = xDi(f.plannedEnd) + DW;
    parti.push(`<rect x="${x1 + 1}" y="${yb + hb + 4}" width="${Math.max(2, x2 - x1 - 2)}" height="3" rx="1.5" class="cap-pian"><title>${esc(`Pianificata dal ${fmtDateIt(f.plannedStart)} al ${fmtDateIt(f.plannedEnd)}`)}</title></rect>`);
  }
  // Il reale.
  if (reale.giorni.size) {
    reale.giorni.forEach((ore, d) => {
      if (!dentro(d)) return;
      parti.push(`<rect x="${xDi(d) + 1}" y="${yb}" width="${DW - 2}" height="${hb}" rx="2" class="cap-reale"><title>${esc(`${fmtDateIt(d)}: ${fmtOre(ore)} timbrate`)}</title></rect>`);
    });
  } else if (reale.dal && reale.al >= primo && reale.dal <= ultimo) {
    const x1 = xDi(reale.dal), x2 = xDi(reale.al) + DW;
    parti.push(`<rect x="${x1 + 1}" y="${yb}" width="${Math.max(2, x2 - x1 - 2)}" height="${hb}" rx="2" class="cap-reale cap-reale-dich"><title>${esc(`Avviata il ${fmtDateIt(reale.dal)}${reale.chiusa ? ', chiusa il ' + fmtDateIt(reale.al) : ', in corso'}`)}</title></rect>`);
  }
  // Il previsto: coda, attesa, attrezzaggio e lavoro, giorno per giorno.
  if (prev) {
    const usati = new Set(prev.giorni.map(x => x.d));
    if (prev.codaFino && prev.arrivo < prev.codaFino) {
      const x1 = xDi(prev.arrivo), x2 = xDi(calShift(prev.codaFino, -1)) + DW;
      if (prev.codaFino > primo && prev.arrivo <= ultimo) parti.push(`<rect x="${x1 + 1}" y="${yb + 3}" width="${Math.max(2, x2 - x1 - 2)}" height="${hb - 6}" rx="2" class="cap-coda"><title>${esc(`Coda davanti al centro: dal ${fmtDateIt(prev.arrivo)}`)}</title></rect>`);
    }
    // L'attesa: dal primo giorno utile alla fine, i giorni lavorativi in cui
    // la fase non prende ore perché il centro lavora altro.
    const daAttesa = prev.codaFino || prev.arrivo;
    for (let d = daAttesa; d && d <= prev.end && d <= ultimo; d = calShift(d, 1)) {
      if (d < primo || usati.has(d) || !(capOreGiorno(wc, d) > 0)) continue;
      parti.push(`<rect x="${xDi(d) + 1}" y="${yb + hb / 2 - 2}" width="${DW - 2}" height="4" rx="2" class="cap-attesa"><title>${esc(`${fmtDateIt(d)}: in attesa, il centro lavora altre fasi`)}</title></rect>`);
    }
    let setup = prev.setup || 0;
    prev.giorni.forEach(({ d, ore }) => {
      if (!dentro(d)) { setup = Math.max(0, setup - ore); return; }
      const att = Math.min(setup, ore); setup -= att;
      const x = xDi(d) + 1, w = DW - 2, wa = ore > 0 ? w * att / ore : 0;
      const tit = `${fmtDateIt(d)}: ${fmtOre(ore)}${att > 0 ? ` (attrezzaggio ${fmtOre(att)})` : ''}`;
      if (wa > 0) parti.push(`<rect x="${x}" y="${yb}" width="${wa.toFixed(1)}" height="${hb}" rx="2" class="cap-att"><title>${esc(tit)}</title></rect>`);
      if (w - wa > 0.5) parti.push(`<rect x="${(x + wa).toFixed(1)}" y="${yb}" width="${(w - wa).toFixed(1)}" height="${hb}" rx="2" class="cap-lav"><title>${esc(tit)}</title></rect>`);
    });
  }
  // Serve il: un rombo sulla corsia, rosso se l'ordine non ci arriva.
  const due = String(o.dueDate || '').slice(0, 10);
  if (dentro(due)) {
    const xd = xDi(due) + DW / 2, yd = yb + hb / 2;
    parti.push(`<path d="M${xd} ${yd - 6} l6 6 l-6 6 l-6 -6 z" class="cap-serve${v.ritardo ? ' cap-serve-rit' : ''}"><title>${esc(`${o.number}: serve il ${fmtDateIt(due)}`)}</title></path>`);
  }
  // L'etichetta: numero dell'ordine e fase, sopra l'inizio della barra.
  const x0 = xDi(v.da) + 2;
  const etichetta = `<text x="${x0}" y="${yb - 5}" class="cap-etich${v.ritardo ? ' cap-etich-rit' : ''}">${esc(`${o.number || ''} · ${f.seq}`)}</text>`;
  const titolo = `${o.number || ''} fase ${f.seq} — ${o.code || ''}${prev ? `: ${fmtQtyIt(+prev.ore.toFixed(2))} h da fare, ${fmtDateIt(prev.start)} → ${fmtDateIt(prev.end)}` : (reale.chiusa ? ': chiusa' : '')}`;
  return `<g class="cap-fase" ${clickAttrs(`homeApri('odp','${o.id}')`, titolo)}><title>${esc(titolo)}</title>${parti.join('')}${etichetta}</g>`;
}

// Al telefono la linea non ci sta: si apre con oggi vicino al bordo
// sinistro, e i giorni passati restano a un gesto di distanza.
function capLineaScorri(host) {
  (host || document).querySelectorAll('.cap-scorri[data-oggi]').forEach(el => {
    const x = Number(el.dataset.oggi);
    if (Number.isFinite(x) && el.scrollWidth > el.clientWidth) el.scrollLeft = Math.max(0, x - 4 * CAP_LINEA_GG);
  });
}
