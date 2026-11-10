// ═══════════════════════════════════════════════════════════
//  BOMTRACK — consuntivo.js
// ═══════════════════════════════════════════════════════════
// Modulo Costi reali (dalla 0.122.0): il consuntivo. Quanto si pensava di
// spendere — il preventivo, fotografato — e quanto si è speso davvero, voce per
// voce. Classic script, scope globale condiviso.
//
// L'**ambito** è una commessa (con i suoi piani e i documenti che la citano) o,
// dalla 0.150.0, un piano senza commessa: un piano di scorta ha i suoi costi
// come una commessa, e prima non aveva un confronto. Un piano con commessa si
// guarda nella commessa.
//
// Il preventivo è il costo industriale delle righe dei piani (costOf ×
// quantità), diviso nelle voci della costificazione, più l'attrezzaggio delle
// fasi interne a costo orario, una volta per fase e per piano. Dalla 0.150.0
// porta anche **cosa** si pensava di usare: gli articoli d'acquisto con
// quantità e prezzo, e le ore per centro. Tutto viene dall'esplosione **lorda**,
// come il costo delle righe: le parti pronte a scaffale non tolgono niente al
// preventivo, perché anche quelle la commessa le paga.
// Si **congela** quando la commessa va in produzione (o, per un piano senza
// commessa, al lancio del primo ODP): senza fotografia il confronto
// cambierebbe a ogni ritocco di listino. «Aggiorna preventivo» la rifà.
//
// Il reale si legge dai documenti, senza scrivere niente:
//   - materiali: per ogni articolo, quello che è stato **consumato** (prelievi
//     degli ODP, uscite a conto lavoro, montaggi dichiarati, al netto dei
//     resi), tolte le parti che i suoi ODP hanno versato (contano già con il
//     loro materiale e le loro fasi). Vale il prezzo pagato sugli ODA
//     dell'ambito, se l'articolo ci è arrivato; altrimenti il valore di
//     magazzino (costoGiacenza: listino, o costo medio). Un articolo mai
//     prelevato conta per quanto è arrivato sugli ODA. Mai tutte e due: la merce
//     comprata entra a magazzino e poi ne esce, e contarla due volte
//     raddoppierebbe il costo;
//   - lavorazioni esterne: le righe ricevute degli ODL al prezzo dell'ordine (e
//     le righe di conto lavoro rimaste negli ODA di prima della 0.69.0);
//   - lavorazioni interne: i pezzi lavorati nelle fasi interne degli ODP per il
//     costo di fase congelato e l'attrezzaggio delle fasi avviate. Con il modulo
//     Officina una fase **a costo orario** paga le ore timbrate; una a costo
//     fisso resta a pezzo, come nel preventivo (le ore si confrontano nei
//     Tempi). I montaggi dichiarati senza ODP non hanno ore: valgono il costo
//     standard del loro ciclo;
//   - spese generali: non c'è un documento che le misuri. Si assorbono con la
//     stessa quota che hanno nel preventivo, e la tabella lo dice.

const CONS_VOCI = [
  { id: 'materiali', nome: 'Materiali e acquisti' },
  { id: 'lavorazioni', nome: 'Lavorazioni' },
  { id: 'generali', nome: 'Spese generali' },
];
// I movimenti che portano materiale dentro l'ambito (negativi) o lo
// restituiscono (positivi). Versamenti e rientri sono il prodotto, non il
// materiale: non si contano.
const CONS_KIND_CONSUMO = new Set(['scarico', 'clOut', 'reso']);
const CONS_EPS = 0.000001;
const consNonAnnullato = d => d && d.status !== 'annullato';

// ─── L'ambito: commessa o piano senza commessa ───
// `holder` è dove sta la fotografia del preventivo (`costSnapshot`).
function consAmbitoCommessa(jobId) {
  const j = getJob(jobId); if (!j) return null;
  const piani = jobPlans(jobId);
  const ids = new Set(piani.map(p => p.id));
  const { orders, workOrders } = jobDocs(jobId);
  return {
    tipo: 'commessa', id: jobId, holder: j, piani, pianiIds: ids,
    odp: (db.prodOrders || []).filter(o => consNonAnnullato(o) && (o.jobId === jobId || (o.planId && ids.has(o.planId)))),
    orders: orders.filter(consNonAnnullato), odl: workOrders.filter(consNonAnnullato),
    montaggi: (db.productions || []).filter(r => r.planId && ids.has(r.planId)),
  };
}
function consAmbitoPiano(planId) {
  const p = getPlan(planId); if (!p) return null;
  const suo = d => consNonAnnullato(d) && d.planId === planId;
  return {
    tipo: 'piano', id: planId, holder: p, piani: [p], pianiIds: new Set([planId]),
    odp: (db.prodOrders || []).filter(suo), orders: (db.orders || []).filter(suo), odl: (db.workOrders || []).filter(suo),
    montaggi: (db.productions || []).filter(r => r.planId === planId),
  };
}
function consAmbito(tipo, id) { return tipo === 'piano' ? consAmbitoPiano(id) : consAmbitoCommessa(id); }
// Un documento della commessa che non viene da nessuno dei suoi piani: lo cita
// direttamente. Nel preventivo non c'è, e il reale lo dice.
function consFuoriPiano(amb, d) { return amb.tipo === 'commessa' && !(d.planId && amb.pianiIds.has(d.planId)); }

// ─── Preventivo ───
// L'esplosione lorda di un piano, con le sostituzioni decise sul piano.
function consEsplosione(p) {
  return mrpExplode(p.lines || [], { sostituzioni: typeof sostituzioniPiano === 'function' ? sostituzioniPiano(p.id) : [] });
}
// Le ore che una fase interna chiede per `pezzi`, attrezzaggio compreso: la
// stessa misura delle timbrature, che contano anche il tempo di attrezzare.
function consOreFase(r, pezzi, conAttrezzaggio) {
  return (Number(r && r.hours) || 0) * (Number(pezzi) || 0) + (conAttrezzaggio ? faseAttrezzaggio(r) : 0);
}
function consPreventivoCalcolato(amb) {
  const out = { materiali: 0, lavorazioni: 0, generali: 0, righe: 0, articoli: [], ore: {}, piani: amb.piani.map(p => p.id) };
  const articoli = new Map();
  amb.piani.forEach(p => {
    (p.lines || []).forEach(l => {
      const q = Number(l.qty) || 0;
      if (!l.itemId || !(q > 0)) return;
      const c = costOf(l.itemId);
      out.materiali += (c.material + c.purchased + c.parts) * q;
      out.lavorazioni += c.labor * q;
      out.generali += c.overhead * q;
      out.righe++;
    });
    const exp = consEsplosione(p);
    // L'attrezzaggio delle fasi interne, una volta per fase e per piano: il
    // costo per pezzo non lo contiene, perché dipende dal lotto.
    exp.intOps.forEach(e => {
      out.lavorazioni += costoAttrezzaggio(e.row);
      const wc = e.row.workCenterId || '';
      out.ore[wc] = (out.ore[wc] || 0) + consOreFase(e.row, e.qty, true);
    });
    exp.buy.forEach(e => {
      const a = articoli.get(e.item.id) || { id: e.item.id, qty: 0, unit: itemUnitCost(e.item) };
      a.qty += Number(e.qty) || 0;
      articoli.set(e.item.id, a);
    });
  });
  out.articoli = Array.from(articoli.values());
  out.totale = out.materiali + out.lavorazioni + out.generali;
  return out;
}
function consCongela(amb) {
  if (!amb) return null;
  const p = consPreventivoCalcolato(amb);
  amb.holder.costSnapshot = { date: oggiISO(), materiali: p.materiali, lavorazioni: p.lavorazioni, generali: p.generali,
    totale: p.totale, righe: p.righe, piani: p.piani, articoli: p.articoli, ore: p.ore };
  touch(amb.holder);
  return amb.holder.costSnapshot;
}
function consAggiornaPreventivo(tipo, id) {
  if (!roleGuard('docs')) return;
  if (!consCongela(consAmbito(tipo, id))) return;
  saveDB();
  if (tipo === 'piano') renderMrp(); else renderJobs();
  showToast('Preventivo aggiornato con i costi di oggi');
}
// Chiamato quando la commessa va in produzione: la prima volta fotografa.
function consCongelaAlLancio(j) {
  if (j && !j.costSnapshot && moduloAttivo('costiReali')) consCongela(consAmbitoCommessa(j.id));
}
// Chiamato al lancio di un ODP (dalla 0.150.0): un piano senza commessa si
// fotografa quando comincia a produrre. Con la commessa decide la commessa.
function consCongelaPianoAlLancio(odp) {
  const p = odp && odp.planId ? getPlan(odp.planId) : null;
  if (p && !p.jobId && !p.costSnapshot && moduloAttivo('costiReali')) consCongela(consAmbitoPiano(p.id));
}

// ─── Reale ───
function consFaseCostoPezzo(f) {
  return f.costMode === 'orario' ? (Number(f.hours) || 0) * (Number(f.rate) || 0) + costoMacchinaFase(f) : (Number(f.cost) || 0);
}
// Quanto si è pagato ogni articolo sugli ODA dell'ambito: { qty, valore } con
// la quantità nell'unità di gestione, come il costo medio (views-stock.js).
function consPrezziPagati(amb) {
  const idx = new Map();
  amb.orders.forEach(d => (d.lines || []).forEach(l => {
    const ric = Number(l.received) || 0, prezzo = Number(l.price);
    if (!l.itemId || l.phaseKey || !(ric > 0) || l.price === '' || l.price == null || !isFinite(prezzo)) return;
    const it = getItem(l.itemId);
    const q = it ? fromAltUom(it, ric, l.uom) : ric;
    if (!(q > 0)) return;
    const e = idx.get(l.itemId) || { qty: 0, valore: 0 };
    e.qty += q; e.valore += ric * prezzo;
    idx.set(l.itemId, e);
  }));
  return idx;
}
// Le ore di ogni fase interna degli ODP: quelle che il ciclo dà per i pezzi
// lavorati (attrezzaggio compreso se la fase è partita) e quelle timbrate.
function consTempiFasi(odps) {
  const timbrate = moduloAttivo('officina');
  const righe = [];
  odps.forEach(o => (o.phases || []).forEach(f => {
    if (f.supplierId) return;
    const pezzi = opProcessati(o, f);
    righe.push({ odp: o, fase: f, wcId: f.workCenterId || '', pezzi,
      standard: consOreFase(f, pezzi, opAvviata(o, f)), timbrate: timbrate ? oreTimbrate(o.id, f.id) : 0 });
  }));
  return righe;
}
function consReale(amb) {
  const dettaglio = [];   // { voce, testo, valore, fuori }
  const fuoriDi = new Map();
  [].concat(amb.odp, amb.odl, amb.orders).forEach(d => fuoriDi.set(d.id, consFuoriPiano(amb, d)));
  amb.montaggi.forEach(d => fuoriDi.set(d.id, false));
  let fuori = 0;
  const aggiungi = (voce, testo, valore, docFuori) => {
    dettaglio.push({ voce, testo, valore, fuori: !!docFuori });
    if (docFuori) fuori += valore;
  };
  // ── Materiali: consumi, o ricevuto se l'articolo non è mai stato prelevato ──
  // Anche gli ODA con righe di conto lavoro di prima della 0.69.0: il materiale
  // mandato al terzista porta il loro id.
  const clSuOda = amb.orders.filter(d => (d.lines || []).some(l => l.phaseKey));
  const docConsumo = new Set([].concat(amb.odp, amb.odl, amb.montaggi, clSuOda).map(d => d.id));
  const consumi = new Map();   // itemId → { q, qFuori }
  (db.movements || []).forEach(m => {
    if (!m.itemId || !docConsumo.has(m.orderId) || !CONS_KIND_CONSUMO.has(m.kind)) return;
    const e = consumi.get(m.itemId) || { q: 0, qFuori: 0 };
    const q = -(Number(m.qty) || 0);
    e.q += q; if (fuoriDi.get(m.orderId)) e.qFuori += q;
    consumi.set(m.itemId, e);
  });
  // Le parti che l'ambito si è fatto da sé (dalla 0.150.0): versate dai suoi
  // ODP e poi prelevate da un montaggio o dall'ODP dell'assieme. Il loro costo
  // c'è già — il materiale prelevato dall'ODP e le sue fasi —, e contarle anche
  // al valore di magazzino, che li contiene tutti e due, raddoppierebbe la
  // parte. Vale il prelevato oltre il versato: quello è uscito dalla scorta.
  const fatte = new Map();
  amb.odp.forEach(d => {
    if (!d.itemId || odpDiAssieme(d)) return;
    fatte.set(d.itemId, (fatte.get(d.itemId) || 0) + opVersato(d));
  });
  const pagati = consPrezziPagati(amb);
  const articoli = new Map();   // itemId → { qty, valore }
  let materiali = 0;
  consumi.forEach((e, id) => {
    const q = e.q;
    if (!(Math.abs(q) > CONS_EPS)) return;
    const it = getItem(id);
    const proprie = q > 0 ? Math.min(q, fatte.get(id) || 0) : 0;
    const daScorta = q - proprie;
    if (!(Math.abs(daScorta) > CONS_EPS)) return;
    const pag = pagati.get(id);
    const unit = pag && pag.qty > 0 ? pag.valore / pag.qty : costoGiacenza(it);
    const v = daScorta * unit;
    materiali += v;
    const a = articoli.get(id) || { qty: 0, valore: 0 };
    a.qty += daScorta; a.valore += v; articoli.set(id, a);
    const u = it ? itemUom(it) : '';
    const testo = `${it ? it.code : '?'} — prelevati ${fmtQtyIt(+q.toFixed(4))} ${u}`
      + (proprie > 0 ? `, di cui ${fmtQtyIt(+proprie.toFixed(4))} fatti qui (già nei loro ODP)` : '')
      + (pag && pag.qty > 0 ? ', al prezzo pagato sugli ordini' : ', a valore di magazzino');
    // La quota fuori dai piani va con i pezzi che l'hanno prelevata.
    const quotaFuori = q > CONS_EPS ? Math.min(1, Math.max(0, e.qFuori / q)) : 0;
    dettaglio.push({ voce: 'materiali', testo, valore: v, fuori: quotaFuori > 0.5 });
    fuori += v * quotaFuori;
  });
  let ordinatoAperto = 0;
  let lavorazioni = 0;
  amb.orders.forEach(d => (d.lines || []).forEach(l => {
    const r = Number(l.received) || 0, p = Number(l.price) || 0;
    ordinatoAperto += Math.max(0, (Number(l.qty) || 0) - r) * p;
    if (!r) return;
    // Una riga di conto lavoro rimasta in un ODA è una lavorazione, non merce.
    if (l.phaseKey) {
      lavorazioni += r * p;
      aggiungi('lavorazioni', `${d.number || 'ODA'} — conto lavoro${l.description ? ' ' + l.description : ''}, ${fmtQtyIt(r)} pz ricevuti`, r * p, fuoriDi.get(d.id));
      return;
    }
    if (l.itemId && consumi.has(l.itemId)) return;
    const it = l.itemId ? getItem(l.itemId) : null;
    materiali += r * p;
    if (it) {
      const a = articoli.get(it.id) || { qty: 0, valore: 0 };
      a.qty += fromAltUom(it, r, l.uom); a.valore += r * p; articoli.set(it.id, a);
    }
    aggiungi('materiali', `${it ? it.code : (l.description || l.desc || 'riga libera')} — ricevuti ${fmtQtyIt(r)} ${l.uom || (it ? itemUom(it) : '')} su ${d.number || 'ODA'}`, r * p, fuoriDi.get(d.id));
  }));
  // ── Lavorazioni esterne: gli ODL ricevuti ──
  amb.odl.forEach(d => (d.lines || []).forEach(l => {
    const r = Number(l.received) || 0, p = Number(l.price) || 0;
    ordinatoAperto += Math.max(0, (Number(l.qty) || 0) - r) * p;
    if (!r) return;
    lavorazioni += r * p;
    aggiungi('lavorazioni', `${d.number || 'ODL'} — ${supplierName(d.supplierId) || 'terzista'}, ${fmtQtyIt(r)} pz ricevuti`, r * p, fuoriDi.get(d.id));
  }));
  // ── Lavorazioni interne: le fasi degli ODP e i montaggi ──
  // Con il modulo Officina le ore timbrate di una fase a costo orario prendono
  // il posto di quelle del ciclo, alla tariffa della fase (o del centro).
  const timbrate = moduloAttivo('officina');
  amb.odp.forEach(d => (d.phases || []).forEach(f => {
    if (f.supplierId) return;
    const ore = timbrate ? oreTimbrate(d.id, f.id) : 0;
    const nome = `${d.number || 'ODP'} fase ${f.seq} ${f.wcName || ''}`;
    let v, testo;
    if (ore > 0 && f.costMode === 'orario') {
      const wc = getWorkCenter(f.workCenterId);
      const tariffa = Number(f.rate) > 0 ? Number(f.rate) : (wc ? Number(wc.hourlyRate) || 0 : 0);
      // La macchina lavora le ore timbrate divise per gli operatori della fase.
      const macchina = costoMacchinaOre(f, ore);
      v = ore * tariffa + macchina;
      testo = `${nome}${f.machineName ? ' · ' + f.machineName : ''} — ${fmtOre(ore)} timbrate${macchina > 0 ? `, di cui macchina ${fmtN(macchina)}` : ''}`;
    } else {
      const n = opProcessati(d, f);
      // L'attrezzaggio si è speso quando la fase è partita.
      const att = opAvviata(d, f) ? costoAttrezzaggio(f) : 0;
      v = n * consFaseCostoPezzo(f) + att;
      testo = `${nome} — ${fmtQtyIt(n)} pz${att > 0 ? `, più attrezzaggio ${fmtMin(faseAttrezzaggio(f))}` : ''}`
        + (ore > 0 ? ` (costo fisso a pezzo; ${fmtOre(ore)} timbrate, nei Tempi)` : '');
    }
    if (!v) return;
    lavorazioni += v;
    aggiungi('lavorazioni', testo, v, fuoriDi.get(d.id));
  }));
  amb.montaggi.forEach(r => {
    const asm = getItem(r.itemId); if (!asm) return;
    const v = cicloFasi(asm).reduce((a, op) => a + cycleRowCost(op), 0) * (Number(r.qty) || 0);
    if (!v) return;
    lavorazioni += v;
    aggiungi('lavorazioni', `Montaggio ${asm.code || ''} — ${fmtQtyIt(Number(r.qty) || 0)} pz, a costo standard del ciclo (senza ODP non ci sono ore)`, v, false);
  });
  return { materiali, lavorazioni, ordinatoAperto, dettaglio, articoli, fuori, tempi: consTempiFasi(amb.odp) };
}

// ─── Confronto ───
// Per articolo: effetto quantità ai prezzi del preventivo, effetto prezzo
// sulle quantità vere. Sommati fanno lo scostamento.
function consArticoli(prevArticoli, reali) {
  const prev = new Map((prevArticoli || []).map(a => [a.id, a]));
  const ids = new Set([].concat(Array.from(prev.keys()), Array.from(reali.keys())));
  return Array.from(ids).map(id => {
    const it = getItem(id), p = prev.get(id), r = reali.get(id) || { qty: 0, valore: 0 };
    const qP = p ? Number(p.qty) || 0 : 0;
    const uR = r.qty > CONS_EPS ? r.valore / r.qty : null;
    const uP = p ? Number(p.unit) || 0 : (uR || 0);
    const effQ = (r.qty - qP) * uP;
    const effP = uR != null ? (uR - uP) * r.qty : 0;
    return { id, code: it ? it.code : '?', name: it ? it.name : '', uom: it ? itemUom(it) : '', previsto: !!p,
      qP, qR: r.qty, vP: qP * uP, vR: r.valore, effQ, effP, diff: r.valore - qP * uP };
  }).filter(a => Math.abs(a.qP) > CONS_EPS || Math.abs(a.qR) > CONS_EPS)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}
// Per centro: ore a preventivo, ore del ciclo sui pezzi lavorati, ore timbrate.
function consTempiCentri(prevOre, tempi) {
  const m = new Map();
  const riga = wc => m.get(wc) || (m.set(wc, { wcId: wc, preventivo: 0, standard: 0, timbrate: 0 }), m.get(wc));
  Object.keys(prevOre || {}).forEach(wc => { riga(wc).preventivo += Number(prevOre[wc]) || 0; });
  tempi.forEach(t => { const r = riga(t.wcId); r.standard += t.standard; r.timbrate += t.timbrate; });
  return Array.from(m.values()).map(r => {
    const wc = getWorkCenter(r.wcId);
    return Object.assign(r, { nome: wc ? wc.name : (r.wcId ? '(centro mancante)' : 'senza centro') });
  }).sort((a, b) => a.nome.localeCompare(b.nome));
}
function consCalcola(amb) {
  if (!amb) return null;
  const snap = amb.holder.costSnapshot;
  const congelato = !!snap;
  const prev = congelato ? snap : consPreventivoCalcolato(amb);
  const r = consReale(amb);
  const basePrev = (Number(prev.materiali) || 0) + (Number(prev.lavorazioni) || 0);
  const quotaGen = basePrev > 0 ? (Number(prev.generali) || 0) / basePrev : 0;
  const reale = { materiali: r.materiali, lavorazioni: r.lavorazioni, generali: (r.materiali + r.lavorazioni) * quotaGen };
  reale.totale = reale.materiali + reale.lavorazioni + reale.generali;
  const voci = CONS_VOCI.concat([{ id: 'totale', nome: 'Totale' }]).map(v => {
    const p = Number(prev[v.id]) || 0, x = reale[v.id] || 0;
    return { id: v.id, nome: v.nome, prev: p, reale: x, diff: x - p, pct: p ? (x - p) / p * 100 : null };
  });
  // Una fotografia di prima della 0.150.0 non ha articoli, ore e piani.
  const completo = !congelato || Array.isArray(snap.articoli);
  const pianiFoto = congelato && Array.isArray(snap.piani) ? new Set(snap.piani) : null;
  return {
    tipo: amb.tipo, id: amb.id, congelato, data: congelato ? snap.date : '', voci, quotaGen, completo,
    ordinatoAperto: r.ordinatoAperto, dettaglio: r.dettaglio, fuori: r.fuori,
    articoli: completo ? consArticoli(prev.articoli, r.articoli) : [],
    tempi: r.tempi, centri: consTempiCentri(completo ? prev.ore : null, r.tempi),
    pianiDopo: pianiFoto ? amb.piani.filter(p => !pianiFoto.has(p.id)) : [],
    pianiTolti: pianiFoto ? Array.from(pianiFoto).filter(id => !amb.pianiIds.has(id)).length : 0,
    pezzi: amb.odp.map(o => {
      const scarti = (o.phases || []).reduce((s, f) => s + opScarti(o, f), 0);
      return { odp: o, lanciati: Number(o.qty) || 0, buoni: opVersato(o), scarti };
    }),
  };
}
// Preventivo (fotografato o, se manca, provvisorio), reale e scostamenti.
function jobConsuntivo(jobId) { return consCalcola(consAmbitoCommessa(jobId)); }
function pianoConsuntivo(planId) { return consCalcola(consAmbitoPiano(planId)); }

// ─── Disegno ───
const consPct = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + '%';
const consColore = d => d > 0.005 ? 'var(--red)' : d < -0.005 ? 'var(--green)' : 'inherit';
const consDiff = d => `<td class="num" style="color:${consColore(d)}">${d > 0 ? '+' : ''}${fmtN(d)}</td>`;
const consOreDiff = d => `<td class="num" style="color:${consColore(d)}">${d > 0.005 ? '+' : d < -0.005 ? '−' : ''}${fmtOre(Math.abs(d))}</td>`;
function consArticoliHtml(c) {
  if (!c.articoli.length) return '';
  const righe = c.articoli.map(a => `<tr><td>${codeLink(a.id, a.code)}${a.previsto ? '' : ' <span class="empty-text" style="padding:0">· fuori preventivo</span>'}</td>
    <td class="num">${fmtQtyIt(+a.qP.toFixed(3))} ${esc(a.uom)}</td><td class="num">${fmtQtyIt(+a.qR.toFixed(3))} ${esc(a.uom)}</td>
    <td class="num">${fmtN(a.vP)}</td><td class="num">${fmtN(a.vR)}</td>${consDiff(a.effQ)}${consDiff(a.effP)}</tr>`).join('');
  return `<details style="margin-top:8px"><summary>Materiali per articolo (${c.articoli.length})</summary>
    <p class="empty-text" style="text-align:left;padding:4px 0 8px">Gli articoli d'acquisto del preventivo contro quelli usati. L'<strong>effetto quantità</strong> è quanto si è usato in più (o in meno) ai prezzi del preventivo: dentro ci sono scarti e sfridi, e a metà lavoro è negativo per definizione. L'<strong>effetto prezzo</strong> è quanto si è pagato di più sulle quantità vere. Una parte presa a scaffale compare fuori preventivo, e il suo materiale come non usato.</p>
    <div class="table-wrap"><table class="dash-table"><thead><tr><th>Articolo</th><th class="num">Previsto</th><th class="num">Usato</th><th class="num">Preventivo</th><th class="num">Reale</th><th class="num">Effetto quantità</th><th class="num">Effetto prezzo</th></tr></thead>
    <tbody>${righe}</tbody></table></div></details>`;
}
function consTempiHtml(c) {
  if (!moduloAttivo('officina') || !c.centri.length) return '';
  const righe = c.centri.map(r => `<tr><td>${esc(r.nome)}</td><td class="num">${fmtOre(r.preventivo)}</td>
    <td class="num">${fmtOre(r.standard)}</td><td class="num">${fmtOre(r.timbrate)}</td>${consOreDiff(r.timbrate - r.standard)}
    <td class="num" style="color:${consColore(r.timbrate - r.standard)}">${consPct(r.standard > 0 ? (r.timbrate - r.standard) / r.standard * 100 : null)}</td></tr>`).join('');
  return `<details style="margin-top:8px"><summary>Tempi per centro</summary>
    <p class="empty-text" style="text-align:left;padding:4px 0 8px">Le ore a preventivo sono per tutto il lavoro; quelle <strong>a ciclo</strong> sono quelle che il ciclo dà per i pezzi già lavorati, attrezzaggio compreso. Lo scostamento confronta queste con le timbrate.${c.completo ? '' : ' Il preventivo è stato congelato prima che portasse le ore: «Aggiorna preventivo» le aggiunge.'}</p>
    <div class="table-wrap"><table class="dash-table"><thead><tr><th>Centro</th><th class="num">A preventivo</th><th class="num">A ciclo</th><th class="num">Timbrate</th><th class="num">Scostamento</th><th class="num">%</th></tr></thead>
    <tbody>${righe}</tbody></table></div>${consTempiFasiHtml(c.tempi, true)}</details>`;
}
// Le fasi una per una: nel consuntivo con il numero dell'ODP, nella scheda
// dell'ODP senza.
function consTempiFasiHtml(tempi, conOdp) {
  const t = tempi.filter(x => x.standard > 0 || x.timbrate > 0);
  if (!t.length) return '';
  return `<div class="table-wrap" style="margin-top:8px"><table class="dash-table"><thead><tr>${conOdp ? '<th>ODP</th>' : ''}<th>Fase</th><th class="num">Pezzi lavorati</th><th class="num">A ciclo</th><th class="num">Timbrate</th><th class="num">Scostamento</th></tr></thead>
    <tbody>${t.map(x => `<tr>${conOdp ? `<td>${esc(x.odp.number || '')}</td>` : ''}<td>${esc(String(x.fase.seq))} ${esc(x.fase.wcName || '')}</td>
      <td class="num">${fmtQtyIt(x.pezzi)}</td><td class="num">${fmtOre(x.standard)}</td><td class="num">${fmtOre(x.timbrate)}</td>${consOreDiff(x.timbrate - x.standard)}</tr>`).join('')}</tbody></table></div>`;
}
// Nella scheda dell'ODP, con il modulo Officina: le ore della sua produzione.
function consTempiOdpHtml(o) {
  if (!o || !moduloAttivo('officina')) return '';
  const tabella = consTempiFasiHtml(consTempiFasi([o]), false);
  if (!tabella) return '';
  return `<div class="mrp-section"><div class="cycle-section-head"><h3>${ico('clock', 'tinted pill', '')} Tempi</h3></div>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Le ore che il ciclo dà per i pezzi già lavorati, attrezzaggio compreso, e quelle timbrate in reparto.</p>${tabella}</div>`;
}
function consPezziHtml(c) {
  const p = c.pezzi.filter(x => x.lanciati > 0);
  if (!p.length) return '';
  return `<details style="margin-top:8px"><summary>Pezzi degli ordini di produzione (${p.length})</summary>
    <div class="table-wrap"><table class="dash-table"><thead><tr><th>ODP</th><th>Articolo</th><th class="num">Lanciati</th><th class="num">Buoni</th><th class="num">Scarti</th><th class="num">% scarto</th></tr></thead>
    <tbody>${p.map(x => `<tr><td>${esc(x.odp.number || '')}</td><td>${esc(x.odp.code || '')}</td><td class="num">${fmtQtyIt(x.lanciati)}</td>
      <td class="num">${fmtQtyIt(x.buoni)}</td><td class="num"${x.scarti > 0 ? ' style="color:var(--red)"' : ''}>${fmtQtyIt(x.scarti)}</td>
      <td class="num">${consPct(x.lanciati > 0 ? x.scarti / x.lanciati * 100 : null).replace('+', '')}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function consHtml(c) {
  if (!c) return '';
  const nomeGen = `Spese generali <span class="empty-text" style="padding:0" title="Nessun documento le misura: si assorbono sul reale con la stessa quota del preventivo">(assorbite al ${numIt(c.quotaGen * 100, 1)}%)</span>`;
  const righe = c.voci.map(v => `<tr${v.id === 'totale' ? ' style="font-weight:600"' : ''}><td>${v.id === 'generali' ? nomeGen : esc(v.nome)}</td>
      <td class="num">${fmtN(v.prev)}</td><td class="num">${fmtN(v.reale)}</td>${consDiff(v.diff)}
      <td class="num" style="color:${consColore(v.diff)}">${consPct(v.pct)}</td></tr>`).join('');
  const dett = c.dettaglio.slice().sort((a, b) => b.valore - a.valore).map(d =>
    `<tr><td>${esc(CONS_VOCI.find(v => v.id === d.voce).nome)}</td><td>${esc(d.testo)}${d.fuori ? ' <span class="empty-text" style="padding:0">· fuori dai piani</span>' : ''}</td><td class="num">${fmtN(d.valore)}</td></tr>`).join('');
  const chi = c.tipo === 'piano' ? 'il piano' : 'la commessa';
  const testa = c.congelato
    ? `Preventivo congelato il ${esc(fmtDateIt(c.data))}.`
    : `Preventivo <strong>provvisorio</strong>: segue i costi di oggi finché ${chi} non ${c.tipo === 'piano' ? 'lancia il primo ordine di produzione' : 'va in produzione'}, quando si congela.`;
  const avvisi = [];
  if (c.pianiDopo.length) avvisi.push(`${c.pianiDopo.map(p => esc(p.number || 'un piano')).join(', ')} ${c.pianiDopo.length === 1 ? 'è stato aggiunto' : 'sono stati aggiunti'} dopo il congelamento: il preventivo non ${c.pianiDopo.length === 1 ? 'lo' : 'li'} comprende, il reale sì.`);
  if (c.pianiTolti) avvisi.push(`${c.pianiTolti === 1 ? 'Un piano del preventivo non è più' : c.pianiTolti + ' piani del preventivo non sono più'} nella commessa.`);
  if (c.fuori > 0.005) avvisi.push(`Del reale, <strong>${fmtN(c.fuori)}</strong> viene da documenti che citano la commessa senza venire da un suo piano: nel preventivo non ci sono.`);
  if (c.congelato && !c.completo) avvisi.push('Il preventivo è stato congelato prima che portasse articoli e ore: «Aggiorna preventivo» li aggiunge, con i costi di oggi.');
  const tipoArg = c.tipo === 'piano' ? 'piano' : 'commessa';
  return `<div class="mrp-section">
    <div class="cycle-section-head"><h3>${ico('euro', 'tinted', '')} Consuntivo</h3>
      ${canWrite('docs') ? `<button class="btn-outline" onclick="consAggiornaPreventivo('${tipoArg}','${c.id}')">${ico('refresh', 'tinted', '')} ${c.congelato ? 'Aggiorna preventivo' : 'Congela preventivo'}</button>` : ''}</div>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">${testa} Il reale cresce con il lavoro: materiale prelevato o ricevuto, lavorazioni ricevute dai terzisti, pezzi lavorati in casa.${c.ordinatoAperto > 0 ? ` Ordinato e non ancora arrivato: <strong>${fmtN(c.ordinatoAperto)}</strong>.` : ''}</p>
    ${avvisi.map(a => `<div class="rfq-warn">${ico('warning', 'tinted', '')} ${a}</div>`).join('')}
    <div class="table-wrap"><table class="dash-table"><thead><tr><th>Voce</th><th class="num">Preventivo</th><th class="num">Reale</th><th class="num">Scostamento</th><th class="num">%</th></tr></thead>
      <tbody>${righe}</tbody></table></div>
    ${consArticoliHtml(c)}
    ${consTempiHtml(c)}
    ${consPezziHtml(c)}
    ${dett ? `<details style="margin-top:8px"><summary>Da dove viene il reale (${c.dettaglio.length})</summary>
      <div class="table-wrap"><table class="dash-table"><thead><tr><th>Voce</th><th>Origine</th><th class="num">Valore</th></tr></thead><tbody>${dett}</tbody></table></div></details>` : ''}
  </div>`;
}
function consuntivoHtml(jobId) { return consHtml(jobConsuntivo(jobId)); }
// La scheda Consuntivo di un piano senza commessa (dalla 0.150.0).
function consuntivoPianoHtml(planId) { return consHtml(pianoConsuntivo(planId)); }
