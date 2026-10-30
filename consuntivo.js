// ═══════════════════════════════════════════════════════════
//  BOMTRACK — consuntivo.js
// ═══════════════════════════════════════════════════════════
// Modulo Costi reali (dalla 0.122.0): il consuntivo di commessa. Quanto si
// pensava di spendere — il preventivo, fotografato — e quanto si è speso
// davvero, voce per voce. Classic script, scope globale condiviso.
//
// Il preventivo è il costo industriale delle righe dei piani della commessa
// (costOf × quantità), diviso nelle voci della costificazione, più
// l'attrezzaggio delle fasi interne a costo orario, una volta per lotto. Si **congela**
// quando la commessa va in produzione: senza fotografia il confronto
// cambierebbe a ogni ritocco di listino. «Aggiorna preventivo» la rifà.
//
// Il reale si legge dai documenti, senza scrivere niente:
//   - materiali: per ogni articolo, quello che la commessa ha **consumato**
//     (prelievi degli ODP, uscite a conto lavoro, montaggi dichiarati, al netto
//     dei resi) valorizzato come il magazzino (costoGiacenza: listino, o costo
//     medio). Un articolo che la commessa non ha mai prelevato conta per quanto
//     è arrivato sui suoi ODA. Mai tutte e due: la merce comprata per la
//     commessa entra a magazzino e poi ne esce, e contarla due volte
//     raddoppierebbe il costo;
//   - lavorazioni esterne: le righe ricevute degli ODL, al prezzo dell'ordine;
//   - lavorazioni interne: i pezzi lavorati nelle fasi interne degli ODP per il
//     costo di fase del ciclo congelato (ore × tariffa, o costo fisso a pezzo)
//     e l'attrezzaggio delle fasi avviate, più le operazioni di montaggio degli assiemi dichiarati montati;
//   - spese generali: nella stessa proporzione del preventivo.

const CONS_VOCI = [
  { id: 'materiali', nome: 'Materiali e acquisti' },
  { id: 'lavorazioni', nome: 'Lavorazioni' },
  { id: 'generali', nome: 'Spese generali' },
];
// I movimenti che portano materiale dentro una commessa (negativi) o lo
// restituiscono (positivi). Versamenti e rientri sono il prodotto, non il
// materiale: non si contano.
const CONS_KIND_CONSUMO = new Set(['scarico', 'clOut', 'reso']);

function consPreventivoCalcolato(jobId) {
  const out = { materiali: 0, lavorazioni: 0, generali: 0, righe: 0 };
  jobPlans(jobId).forEach(p => (p.lines || []).forEach(l => {
    const q = Number(l.qty) || 0;
    if (!l.itemId || !(q > 0)) return;
    const c = costOf(l.itemId);
    out.materiali += (c.material + c.purchased + c.parts) * q;
    out.lavorazioni += c.labor * q;
    out.generali += c.overhead * q;
    out.righe++;
  }));
  // L'attrezzaggio delle fasi interne, una volta per fase e per piano: il
  // costo per pezzo non lo contiene, perché dipende dal lotto.
  jobPlans(jobId).forEach(p => mrpExplodePlan(p).intOps.forEach(e => { out.lavorazioni += costoAttrezzaggio(e.row); }));
  out.totale = out.materiali + out.lavorazioni + out.generali;
  return out;
}
function consCongela(jobId) {
  const j = getJob(jobId); if (!j) return null;
  const p = consPreventivoCalcolato(jobId);
  j.costSnapshot = { date: oggiISO(), materiali: p.materiali, lavorazioni: p.lavorazioni, generali: p.generali, totale: p.totale, righe: p.righe };
  touch(j);
  return j.costSnapshot;
}
function consAggiornaPreventivo(jobId) {
  if (!roleGuard('docs')) return;
  if (!consCongela(jobId)) return;
  saveDB(); renderJobs();
  showToast('Preventivo aggiornato con i costi di oggi');
}
// Chiamato quando la commessa va in produzione: la prima volta fotografa.
function consCongelaAlLancio(j) {
  if (j && !j.costSnapshot && moduloAttivo('costiReali')) consCongela(j.id);
}

// Gli id dei documenti che consumano materiale per la commessa.
function consOrigini(jobId) {
  const piani = new Set(jobPlans(jobId).map(p => p.id));
  const odp = (db.prodOrders || []).filter(o => o.status !== 'annullato' && (o.jobId === jobId || (o.planId && piani.has(o.planId))));
  const { orders, workOrders } = jobDocs(jobId);
  const montaggi = (db.productions || []).filter(r => r.planId && piani.has(r.planId));
  return { piani, odp, orders: orders.filter(o => o.status !== 'annullato'), odl: workOrders.filter(o => o.status !== 'annullato'), montaggi };
}
function consFaseCostoPezzo(f) {
  return f.costMode === 'orario' ? (Number(f.hours) || 0) * (Number(f.rate) || 0) + costoMacchinaFase(f) : (Number(f.cost) || 0);
}
function consReale(jobId) {
  const o = consOrigini(jobId);
  const dettaglio = [];   // { voce, testo, ref, valore }
  // ── Materiali: consumi, o ricevuto se l'articolo non è mai stato prelevato ──
  const docConsumo = new Set([].concat(o.odp, o.odl, o.montaggi).map(d => d.id));
  const consumi = new Map();
  (db.movements || []).forEach(m => {
    if (!m.itemId || !docConsumo.has(m.orderId) || !CONS_KIND_CONSUMO.has(m.kind)) return;
    consumi.set(m.itemId, (consumi.get(m.itemId) || 0) - (Number(m.qty) || 0));
  });
  let materiali = 0;
  consumi.forEach((q, id) => {
    if (!(Math.abs(q) > 0.000001)) return;
    const it = getItem(id);
    const v = q * costoGiacenza(it);
    materiali += v;
    dettaglio.push({ voce: 'materiali', testo: `${it ? it.code : '?'} — prelevati ${fmtQtyIt(+q.toFixed(4))} ${it ? itemUom(it) : ''}`, valore: v });
  });
  let ordinatoAperto = 0;
  o.orders.forEach(d => (d.lines || []).forEach(l => {
    const r = Number(l.received) || 0, p = Number(l.price) || 0;
    ordinatoAperto += Math.max(0, (Number(l.qty) || 0) - r) * p;
    if (!r || (l.itemId && consumi.has(l.itemId))) return;
    const it = l.itemId ? getItem(l.itemId) : null;
    materiali += r * p;
    dettaglio.push({ voce: 'materiali', testo: `${it ? it.code : (l.desc || 'riga libera')} — ricevuti ${fmtQtyIt(r)} ${l.uom || (it ? itemUom(it) : '')} su ${d.number || 'ODA'}`, valore: r * p });
  }));
  // ── Lavorazioni esterne: gli ODL ricevuti ──
  let lavorazioni = 0;
  o.odl.forEach(d => (d.lines || []).forEach(l => {
    const r = Number(l.received) || 0, p = Number(l.price) || 0;
    ordinatoAperto += Math.max(0, (Number(l.qty) || 0) - r) * p;
    if (!r) return;
    lavorazioni += r * p;
    dettaglio.push({ voce: 'lavorazioni', testo: `${d.number || 'ODL'} — ${supplierName(d.supplierId) || 'terzista'}, ${fmtQtyIt(r)} pz ricevuti`, valore: r * p });
  }));
  // ── Lavorazioni interne: le fasi degli ODP e i montaggi ──
  // Con il modulo Officina e delle timbrature sulla fase, le ore timbrate
  // prendono il posto di quelle del ciclo, alla tariffa della fase (o del centro).
  const timbrate = moduloAttivo('officina') && typeof oreTimbrate === 'function';
  o.odp.forEach(d => (d.phases || []).forEach(f => {
    if (f.supplierId) return;
    const ore = timbrate ? oreTimbrate(d.id, f.id) : 0;
    let v, testo;
    if (ore > 0) {
      const wc = getWorkCenter(f.workCenterId);
      const tariffa = f.costMode === 'orario' && Number(f.rate) > 0 ? Number(f.rate) : (wc ? Number(wc.hourlyRate) || 0 : 0);
      // La macchina lavora le ore timbrate divise per gli operatori della fase.
      const macchina = costoMacchinaOre(f, ore);
      v = ore * tariffa + macchina;
      testo = `${d.number || 'ODP'} fase ${f.seq} ${f.wcName || ''}${f.machineName ? ' · ' + f.machineName : ''} — ${fmtOre(ore)} timbrate${macchina > 0 ? `, di cui macchina ${fmtN(macchina)}` : ''}`;
    } else {
      const n = opProcessati(d, f);
      // L'attrezzaggio si è speso quando la fase è partita.
      const att = opAvviata(d, f) ? costoAttrezzaggio(f) : 0;
      v = n * consFaseCostoPezzo(f) + att;
      testo = `${d.number || 'ODP'} fase ${f.seq} ${f.wcName || ''} — ${fmtQtyIt(n)} pz${att > 0 ? `, più attrezzaggio ${fmtOre(faseAttrezzaggio(f))}` : ''}`;
    }
    if (!v) return;
    lavorazioni += v;
    dettaglio.push({ voce: 'lavorazioni', testo, valore: v });
  }));
  o.montaggi.forEach(r => {
    const asm = getItem(r.itemId); if (!asm) return;
    const v = cicloFasi(asm).reduce((a, op) => a + cycleRowCost(op), 0) * (Number(r.qty) || 0);
    if (!v) return;
    lavorazioni += v;
    dettaglio.push({ voce: 'lavorazioni', testo: `Montaggio ${asm.code || ''} — ${fmtQtyIt(Number(r.qty) || 0)} pz`, valore: v });
  });
  return { materiali, lavorazioni, ordinatoAperto, dettaglio };
}
// Preventivo (fotografato o, se manca, provvisorio), reale e scostamenti.
function jobConsuntivo(jobId) {
  const j = getJob(jobId); if (!j) return null;
  const congelato = !!j.costSnapshot;
  const prev = congelato ? j.costSnapshot : consPreventivoCalcolato(jobId);
  const r = consReale(jobId);
  const basePrev = (Number(prev.materiali) || 0) + (Number(prev.lavorazioni) || 0);
  const quotaGen = basePrev > 0 ? (Number(prev.generali) || 0) / basePrev : 0;
  const reale = { materiali: r.materiali, lavorazioni: r.lavorazioni, generali: (r.materiali + r.lavorazioni) * quotaGen };
  reale.totale = reale.materiali + reale.lavorazioni + reale.generali;
  const voci = CONS_VOCI.concat([{ id: 'totale', nome: 'Totale' }]).map(v => {
    const p = Number(prev[v.id]) || 0, x = reale[v.id] || 0;
    return { id: v.id, nome: v.nome, prev: p, reale: x, diff: x - p, pct: p ? (x - p) / p * 100 : null };
  });
  return { congelato, data: congelato ? j.costSnapshot.date : '', voci, ordinatoAperto: r.ordinatoAperto, dettaglio: r.dettaglio };
}

function consuntivoHtml(jobId) {
  const c = jobConsuntivo(jobId); if (!c) return '';
  const pct = v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + '%';
  const col = d => d > 0.005 ? 'var(--red)' : d < -0.005 ? 'var(--green)' : 'inherit';
  const righe = c.voci.map(v => `<tr${v.id === 'totale' ? ' style="font-weight:600"' : ''}><td>${esc(v.nome)}</td>
      <td class="num">${fmtN(v.prev)}</td><td class="num">${fmtN(v.reale)}</td>
      <td class="num" style="color:${col(v.diff)}">${v.diff > 0 ? '+' : ''}${fmtN(v.diff)}</td>
      <td class="num" style="color:${col(v.diff)}">${pct(v.pct)}</td></tr>`).join('');
  const dett = c.dettaglio.slice().sort((a, b) => b.valore - a.valore).map(d =>
    `<tr><td>${esc(CONS_VOCI.find(v => v.id === d.voce).nome)}</td><td>${esc(d.testo)}</td><td class="num">${fmtN(d.valore)}</td></tr>`).join('');
  const testa = c.congelato
    ? `Preventivo congelato il ${esc(fmtDateIt(c.data))}.`
    : 'Preventivo <strong>provvisorio</strong>: segue i costi di oggi finché la commessa non va in produzione, quando si congela.';
  return `<div class="mrp-section">
    <div class="cycle-section-head"><h3>${ico('euro', 'tinted', '')} Consuntivo</h3>
      ${canWrite('docs') ? `<button class="btn-outline" onclick="consAggiornaPreventivo('${jobId}')">${ico('refresh', 'tinted', '')} ${c.congelato ? 'Aggiorna preventivo' : 'Congela preventivo'}</button>` : ''}</div>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">${testa} Il reale cresce con il lavoro: materiale prelevato o ricevuto, lavorazioni ricevute dai terzisti, pezzi lavorati in casa.${c.ordinatoAperto > 0 ? ` Ordinato e non ancora arrivato: <strong>${fmtN(c.ordinatoAperto)}</strong>.` : ''}</p>
    <div class="table-wrap"><table class="dash-table"><thead><tr><th>Voce</th><th class="num">Preventivo</th><th class="num">Reale</th><th class="num">Scostamento</th><th class="num">%</th></tr></thead>
      <tbody>${righe}</tbody></table></div>
    ${dett ? `<details style="margin-top:8px"><summary>Da dove viene il reale (${c.dettaglio.length})</summary>
      <div class="table-wrap"><table class="dash-table"><thead><tr><th>Voce</th><th>Origine</th><th class="num">Valore</th></tr></thead><tbody>${dett}</tbody></table></div></details>` : ''}
  </div>`;
}
