// ═══════════════════════════════════════════════════════════
//  BOMTRACK — qualita-fornitori.js  (modulo Qualità, fase 4: valutazione fornitori)
// ═══════════════════════════════════════════════════════════
// Il riesame dei fornitori che la ISO 9001 (§8.4) chiede una volta l'anno,
// fatto con i dati che l'app ha già raccolto.
//
// ── Che cosa si conta ──
// Per ogni fornitore, nel periodo scelto:
//   - i **lotti collaudati** (i collaudi chiusi, senza quelli saltati: un lotto
//     non guardato non dice niente sulla qualità), quanti accettati, in deroga
//     e respinti, e i **PPM** — pezzi respinti per milione arrivati;
//   - le **non conformità** che lo riguardano;
//   - la **puntualità**: gli arrivi sulle righe dei suoi ordini rispetto alla
//     data confermata (o richiesta, se non l'ha confermata). Un arrivo si
//     data dal ricevimento registrato con l'archivio condiviso, oppure dal
//     collaudo che quell'arrivo ha aperto; una riga ancora aperta oltre la sua
//     data conta come un ritardo, perché lo è.
//
// ── Il punteggio ──
// Da 0 a 100, due parti con i pesi di Gestione → Qualità:
//   qualità      100 × (accettati + ½ deroghe) / lotti collaudati, meno 10
//                punti per ogni non conformità che non viene da un collaudo
//                (un reclamo, uno scarto in produzione) — quelle dei
//                collaudi sono già contate dal respinto
//   puntualità   100 × arrivi in tempo / (arrivi + righe in ritardo aperte)
// Se una delle due non ha dati vale l'altra da sola; senza nessuna delle due
// il fornitore non ha classe, invece di averne una inventata.
// Classe A, B o C secondo le soglie.

function qcValutazionePesi() {
  const v = (db.settings && db.settings.qcVendor) || {};
  const n = (x, d) => (x === '' || x == null || !isFinite(Number(x)) ? d : Number(x));
  return { qualita: n(v.qualita, 60), puntualita: n(v.puntualita, 40), sogliaA: n(v.sogliaA, 85), sogliaB: n(v.sogliaB, 70) };
}
// Il periodo di serie: gli ultimi dodici mesi fino a oggi.
function qcPeriodoSerie() {
  const oggi = oggiISO();
  const d = new Date(oggi + 'T12:00:00'); d.setFullYear(d.getFullYear() - 1); d.setDate(d.getDate() + 1);
  return { from: d.toISOString().slice(0, 10), to: oggi };
}

// Gli arrivi di una riga d'ordine: [{ date, qty }]. Dai ricevimenti quando ci
// sono (archivio condiviso), altrimenti dai collaudi.
function qcArriviRiga(o, l) {
  const ev = (db.receipts || []).filter(r => r.orderId === o.id && r.lineId === l.id && (Number(r.qty) || 0) > 0 && r.date);
  if (ev.length) return ev.map(r => ({ date: String(r.date).slice(0, 10), qty: Number(r.qty) || 0 }));
  return qcTutti().filter(x => x.source === 'oda' && x.orderId === o.id && x.lineId === l.id && x.date)
    .map(x => ({ date: String(x.date).slice(0, 10), qty: Number(x.qty) || 0 }));
}

function qcValutaFornitore(supplierId, from, to) {
  const g = oggiISO();
  const dentro = d => inDateRange(d, from, to);
  const col = qcTutti().filter(x => x.supplierId === supplierId && x.status === 'chiuso' && x.esito && dentro(x.date));
  const guardati = col.filter(x => !x.skipLot);
  const r = {
    supplierId, lotti: guardati.length, saltati: col.length - guardati.length,
    accettati: guardati.filter(x => x.esito === 'accettato').length,
    deroghe: guardati.filter(x => x.esito === 'deroga').length,
    respinti: guardati.filter(x => x.esito === 'respinto').length,
    qty: 0, qtyKo: 0, ppm: null, nc: 0, ncAperte: 0, ncCosto: 0,
    arrivi: 0, inTempo: 0, ritardiAperti: 0, qualita: null, puntualita: null, punteggio: null, classe: '',
  };
  guardati.forEach(x => {
    const it = getItem(x.itemId);
    const f = x.qty ? qcQtaGestione(x, it) / (Number(x.qty) || 1) : 1;
    r.qty += (Number(x.qty) || 0) * f; r.qtyKo += (Number(x.qtyKo) || 0) * f;
  });
  if (r.qty > 0) r.ppm = Math.round(r.qtyKo / r.qty * 1e6);
  const nc = typeof ncTutte === 'function' ? ncTutte().filter(x => x.supplierId === supplierId && dentro(x.date)) : [];
  r.nc = nc.length; r.ncAperte = nc.filter(x => x.status !== 'chiusa').length;
  r.ncCosto = nc.reduce((s, x) => s + (Number(x.cost) || 0), 0);
  const ncSenzaCollaudo = nc.filter(x => !x.inspectionId).length;
  // Puntualità sulle righe dei suoi ordini.
  (db.orders || []).filter(o => o.supplierId === supplierId && o.active !== false && o.status !== 'bozza' && o.status !== 'annullato')
    .forEach(o => (o.lines || []).forEach(l => {
      const due = String(l.confirmedDate || l.deliveryDate || '').slice(0, 10);
      if (!due) return;
      qcArriviRiga(o, l).forEach(a => {
        if (!dentro(a.date)) return;
        r.arrivi++;
        if (a.date <= due) r.inTempo++;
      });
      const resta = (Number(l.qty) || 0) - (Number(l.received) || 0);
      if (resta > 0.000001 && due < g && dentro(due)) r.ritardiAperti++;
    }));
  if (r.lotti > 0) r.qualita = Math.max(0, Math.round(100 * (r.accettati + 0.5 * r.deroghe) / r.lotti - 10 * ncSenzaCollaudo));
  else if (ncSenzaCollaudo) r.qualita = Math.max(0, 100 - 10 * ncSenzaCollaudo);
  const base = r.arrivi + r.ritardiAperti;
  if (base > 0) r.puntualita = Math.round(100 * r.inTempo / base);
  const p = qcValutazionePesi();
  if (r.qualita != null && r.puntualita != null) {
    const w = (p.qualita + p.puntualita) || 1;
    r.punteggio = Math.round((r.qualita * p.qualita + r.puntualita * p.puntualita) / w);
  } else if (r.qualita != null) r.punteggio = r.qualita;
  else if (r.puntualita != null) r.punteggio = r.puntualita;
  if (r.punteggio != null) r.classe = r.punteggio >= p.sogliaA ? 'A' : r.punteggio >= p.sogliaB ? 'B' : 'C';
  return r;
}
// Tutti i fornitori in una passata, per gli elenchi che mostrano la classe
// accanto al nome (listino, anagrafica): si calcola una volta per disegno.
function qcClassiIndice(from, to) {
  const idx = new Map();
  if (!qcAttivo()) return idx;
  const per = from || to ? { from, to } : qcPeriodoSerie();
  (db.suppliers || []).forEach(s => { const v = qcValutaFornitore(s.id, per.from, per.to); if (v.classe) idx.set(s.id, v); });
  return idx;
}
function qcClasseBadge(v) {
  if (!v || !v.classe) return '';
  const cls = { A: 'st-evaso', B: 'st-parziale', C: 'st-annullato' }[v.classe];
  return ` <span class="doc-badge ${cls}" title="Valutazione fornitore degli ultimi 12 mesi: ${v.punteggio} punti">Classe ${v.classe}</span>`;
}

// ═══════════════════════════════════════════════════════════
//  La vista
// ═══════════════════════════════════════════════════════════
let vfFiltro = null;   // { from, to, soloDati }
function vfPeriodo() { if (!vfFiltro) vfFiltro = Object.assign({ soloDati: true }, qcPeriodoSerie()); return vfFiltro; }
function vfDateChange() { const f = vfPeriodo(); f.from = val('vf-from'); f.to = val('vf-to'); renderFornitoriQc(); }
function vfSoloChange() { vfPeriodo().soloDati = isChecked('vf-solo'); renderFornitoriQc(); }
function vfRighe() {
  const f = vfPeriodo();
  return inOrdineAlfa((db.suppliers || []).filter(s => s.active !== false), s => s.name)
    .map(s => Object.assign({ nome: s.name }, qcValutaFornitore(s.id, f.from, f.to)))
    .filter(r => !f.soloDati || r.lotti || r.nc || r.arrivi || r.ritardiAperti);
}
const vfPct = v => (v == null ? '—' : v + '%');
const vfNum = v => (v == null ? '—' : String(v));

function renderFornitoriQc() {
  const el = document.getElementById('view-fornitoriqc'); if (!el) return;
  const f = vfPeriodo();
  const righe = vfRighe();
  const p = qcValutazionePesi();
  const conta = k => righe.filter(r => r.classe === k).length;
  el.innerHTML = `<div class="manage-wrap">
    <div class="bom-toolbar">
      <div class="bom-toolbar-left">
        <h2 class="section-title">${ico('chart', 'tinted pill', '')} Valutazione fornitori</h2>
      </div>
      <div class="bom-toolbar-right">
        <button class="btn-outline" onclick="vfExportExcel()">${ico('sheet', 'tinted', '')} Excel</button>
        <button class="btn-outline" onclick="vfExportPdf()">${ico('file', 'tinted', '')} PDF</button>
      </div>
    </div>
    <div class="qc-toolbar">
      ${dateRangeFilter('vf', f.from, f.to, 'vfDateChange()', 'del periodo')}
      <label class="flag-check"><input type="checkbox" id="vf-solo" ${f.soloDati ? 'checked' : ''} onchange="vfSoloChange()"> Solo i fornitori con dati nel periodo</label>
    </div>
    <div class="kpi-row qc-stats">
      ${kpi('Classe A', String(conta('A')), 'green')}
      ${kpi('Classe B', String(conta('B')), 'orange')}
      ${kpi('Classe C', String(conta('C')), conta('C') ? 'red' : '')}
    </div>
    ${righe.length ? `<div class="table-wrap"><table class="qc-table vf-table">
      <thead><tr><th scope="col">Fornitore</th><th scope="col" class="num">Lotti</th><th scope="col" class="num">Accettati</th>
        <th scope="col" class="num">Deroga</th><th scope="col" class="num">Respinti</th><th scope="col" class="num" title="Pezzi respinti per milione arrivati">PPM</th>
        <th scope="col" class="num">NC</th><th scope="col" class="num" title="Arrivi entro la data confermata">Puntualità</th>
        <th scope="col" class="num">Qualità</th><th scope="col" class="num">Punti</th><th scope="col">Classe</th></tr></thead>
      <tbody>${righe.map(r => `<tr>
        <td>${esc(r.nome)}</td><td class="num">${r.lotti}${r.saltati ? ` <span class="empty-text" title="Lotti saltati, non collaudati">+${r.saltati}</span>` : ''}</td>
        <td class="num">${r.accettati}</td><td class="num">${r.deroghe}</td><td class="num">${r.respinti}</td>
        <td class="num">${r.ppm == null ? '—' : r.ppm.toLocaleString('it-IT')}</td>
        <td class="num">${r.nc}${r.ncAperte ? ` <span class="empty-text">(${r.ncAperte} aperte)</span>` : ''}</td>
        <td class="num">${vfPct(r.puntualita)}${r.arrivi + r.ritardiAperti ? ` <span class="empty-text">${r.inTempo}/${r.arrivi + r.ritardiAperti}</span>` : ''}</td>
        <td class="num">${vfPct(r.qualita)}</td><td class="num"><strong>${vfNum(r.punteggio)}</strong></td>
        <td>${r.classe ? qcClasseBadge(r).trim() : '<span class="empty-text">senza dati</span>'}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="empty-text">Nessun fornitore con collaudi, non conformità o consegne nel periodo.</p>'}
    <p class="empty-text qc-hint">Punteggio = qualità × ${p.qualita}% + puntualità × ${p.puntualita}%. Classe A da ${p.sogliaA} punti, B da ${p.sogliaB}, C sotto. La <strong>qualità</strong> pesa i lotti collaudati (una deroga vale mezzo) e toglie 10 punti per ogni non conformità che non viene da un collaudo; la <strong>puntualità</strong> conta gli arrivi entro la data confermata dal fornitore (o richiesta, se non l'ha confermata) e le righe ancora aperte oltre la data. I pesi e le soglie si cambiano in Gestione → Qualità.</p>
  </div>`;
  a11yFields(el);
}

function vfTabella() {
  const head = ['Fornitore', 'Lotti', 'Saltati', 'Accettati', 'Deroga', 'Respinti', 'PPM', 'NC', 'NC aperte', 'Costo NC', 'Arrivi in tempo', 'Arrivi + ritardi', 'Puntualità %', 'Qualità %', 'Punti', 'Classe'];
  const body = vfRighe().map(r => [r.nome, r.lotti, r.saltati, r.accettati, r.deroghe, r.respinti, r.ppm == null ? '' : r.ppm,
    r.nc, r.ncAperte, r.ncCosto, r.inTempo, r.arrivi + r.ritardiAperti, r.puntualita == null ? '' : r.puntualita,
    r.qualita == null ? '' : r.qualita, r.punteggio == null ? '' : r.punteggio, r.classe]);
  return { head, body };
}
function vfExportExcel() {
  if (!requireXlsx()) return false;
  const f = vfPeriodo();
  const t = vfTabella();
  const co = (db.settings && db.settings.company && db.settings.company.name) || 'Bomtrack';
  const data = [[`${co} — Valutazione fornitori`], [`Periodo: ${dateRangeText(f.from, f.to) || 'tutto'}`], [], t.head].concat(t.body);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Fornitori');
  XLSX.writeFile(wb, nomeFileSicuro('Valutazione fornitori ' + (f.to || oggiISO()), 'valutazione-fornitori') + '.xlsx');
  showToast('Excel esportato');
  return true;
}
function vfExportPdf() {
  const jsPDF = requirePdf(); if (!jsPDF) return false;
  const f = vfPeriodo();
  const t = vfTabella();
  const doc = new jsPDF({ orientation: 'landscape' });
  const co = (db.settings && db.settings.company && db.settings.company.name) || 'Bomtrack';
  doc.setFontSize(15); doc.setTextColor(30); doc.text(`${co} — Valutazione fornitori`, 14, 16);
  doc.setFontSize(9); doc.setTextColor(90);
  doc.text(`Periodo: ${dateRangeText(f.from, f.to) || 'tutto'} · ISO 9001 §8.4`, 14, 22);
  doc.autoTable({ startY: 28, head: [t.head], body: t.body, styles: { fontSize: 7 }, headStyles: { fillColor: [58, 123, 232] } });
  const p = qcValutazionePesi();
  doc.setFontSize(8); doc.setTextColor(90);
  doc.text(doc.splitTextToSize(`Punteggio = qualità × ${p.qualita}% + puntualità × ${p.puntualita}%. Classe A da ${p.sogliaA} punti, B da ${p.sogliaB}, C sotto.`, 260), 14, doc.lastAutoTable.finalY + 8);
  doc.save(nomeFileSicuro('Valutazione fornitori ' + (f.to || oggiISO()), 'valutazione-fornitori') + '.pdf');
  showToast('PDF esportato');
  return true;
}
