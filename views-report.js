// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-report.js
// ═══════════════════════════════════════════════════════════
// Vista Costificazione: distinta esplosa, incidenza delle voci, export.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  VISTA: COSTIFICAZIONE & REPORT
// ═══════════════════════════════════════════════════════════
// `pos` è la posizione gerarchica della riga (1, 1.1, 1.1.1…, vedi bomPos in views-bom.js):
// vuota sulla radice, così i componenti di primo livello partono da 1.
// `mult` è quante volte il padre entra nella radice: `line` resta il costo riga
// nel suo padre (è la colonna a video), `tot` e `qtyTot` sono gli stessi numeri
// riportati alla radice — un M1 da 3 pezzi in un gruppo usato due volte sono 6.
function flattenBom(itemId, qty, scrap, level, rows, ancestors, pos, mult) {
  if (mult == null) mult = 1;
  const it = getItem(itemId); if (!it) return;
  const cyc = ancestors.includes(itemId);
  const unit = cyc ? 0 : costOf(itemId).total;
  const factor = (Number(qty) || 0) * (1 + (Number(scrap) || 0) / 100);
  pos = pos || '';
  rows.push({ level, pos, itemId, code: it.code, name: it.name + (cyc ? ' (ciclo!)' : ''), type: typeLabel(it.type),
    qty: Number(qty) || 0, uom: it.uom || '', unit, line: unit * factor,
    qtyTot: (Number(qty) || 0) * mult, tot: unit * factor * mult });
  if (isAssembly(it.type) && !cyc) {
    (it.components || []).forEach((c, i) => flattenBom(c.itemId, c.qty, c.scrapPct, level + 1, rows, ancestors.concat(itemId), bomPos(pos, i), mult * factor));
  }
  // Una Parte esplode il proprio ciclo di lavorazione: i costi riga sono scalati per la quantità del padre,
  // così la somma dei figli coincide col costo riga della Parte.
  // (una parte comprata non si esplode: il suo costo è il prezzo del fornitore)
  if (it.type === 'parte' && !cyc && partSourcing(it) !== 'buy') {
    // Le fasi di lavorazione non prendono posizione: numerata è la sola
    // distinta, come nell'albero della distinta.
    // Prima la distinta della parte (dalla 0.125.0 sta lì), poi le fasi.
    distintaRighe(it).forEach((row, n) => {
      const rowCost = cycleRowCost(row);
      const ci = getItem(row.itemId); if (!ci) return;
      const q = (Number(row.qty) || 0) * (1 + (Number(row.scrapPct) || 0) / 100);
      rows.push({ level: level + 1, pos: bomPos(pos, n), itemId: ci.id, code: ci.code, name: ci.name, type: typeLabel(ci.type),
        qty: Number(row.qty) || 0, uom: ci.uom || '', unit: costOf(row.itemId).total, line: rowCost * factor,
        qtyTot: q * factor * mult, tot: rowCost * factor * mult });
    });
    cicloFasi(it).forEach(row => {
      const rowCost = cycleRowCost(row);
      const wc = getWorkCenter(row.workCenterId);
      const sup = supplierName(row.supplierId);
      rows.push({ level: level + 1, pos: '', code: '', name: '🔧 ' + (wc ? wc.name : '?') + (sup ? ' · ' + sup : ''),
        type: 'Lavorazione', qty: 1, uom: '', unit: rowCost, line: rowCost * factor,
        qtyTot: factor * mult, tot: rowCost * factor * mult });
    });
  }
}
function renderReport() {
  invalidateCaches();
  // sincronizza i due selettori
  if (!reportBomId) reportBomId = currentBomId;
  ensureCurrentBom(); if (!reportBomId) reportBomId = currentBomId;
  // renderInto salta il ridisegno se il menu è a fuoco: un elenco che si
  // rimescola sotto il mouse mentre lo si sta usando non si può ripristinare.
  renderInto('report-select', () => productOptions(reportBomId));
  reportBomId = val('report-select') || reportBomId;
  const it = getItem(reportBomId);
  const wrap = document.getElementById('report-content');
  if (!wrap) return;   // la vista non è montata: come fanno tutte le altre
  if (!it) { wrap.innerHTML = '<div class="empty-text">Seleziona un prodotto.</div>'; return; }

  const c = costOf(it.id);
  const price = sellingPrice(it.id);
  const cats = [
    { name: 'Materiale', val: c.material, color: 'var(--orange)' },
    { name: 'Commerciali', val: c.purchased, color: 'var(--accent)' },
    { name: 'Parti', val: c.parts, color: 'var(--purple)' },
    { name: 'Lavorazioni', val: c.labor, color: 'var(--green)' },
    { name: 'Spese generali', val: c.overhead, color: 'var(--text-dim)' },
  ];
  const mx = Math.max(...cats.map(x => x.val), 0.0001);
  const bars = cats.map(x => `<div class="breakdown-row">
    <div class="breakdown-name">${x.name}</div>
    <div class="breakdown-bar"><div class="breakdown-fill" style="width:${x.val / mx * 100}%;background:${x.color}"></div></div>
    <div class="breakdown-stats"><span>${fmtN(x.val)}</span><span style="color:var(--text-dim)">${c.total ? (x.val / c.total * 100).toFixed(1) : '0.0'}%</span></div>
  </div>`).join('');

  const rows = [];
  flattenBom(it.id, 1, 0, 0, rows, []);
  // Il costo unitario è per una unità **di quella riga**, e ogni riga ha la sua
  // unità: un cavo al metro sotto un assieme al pezzo. Il denominatore sta quindi
  // nella cella, non in testa alla colonna.
  const tableRows = rows.map(r => `<tr>
    <td style="font-family:var(--mono);color:var(--text-dim)">${esc(r.pos)}</td>
    <td style="font-family:var(--mono);padding-left:${12 + r.level * 18}px">${r.level ? '└ ' : ''}${codeLink(r.itemId, r.code)}</td>
    <td>${esc(r.name)}</td>
    <td style="color:var(--text-dim)">${esc(r.type)}</td>
    <td style="font-family:var(--mono)">${fmtUom(r.qty, r.uom)}</td>
    <td style="font-family:var(--mono)">${fmtPer(r.unit, r.uom)}</td>
    <td style="font-family:var(--mono)">${fmtN(r.line)}</td></tr>`).join('');

  const u = itemUom(it);
  wrap.innerHTML = `
    <div class="cost-summary">
      ${kpi('Materiale', fmtPer(c.material, u), 'orange')}
      ${kpi('Commerciali', fmtPer(c.purchased, u), 'accent')}
      ${kpi('Parti', fmtPer(c.parts, u), 'purple')}
      ${kpi('Lavorazioni', fmtPer(c.labor, u), 'green')}
      ${kpi('Spese generali', fmtPer(c.overhead, u), '')}
      ${kpi('Costo totale', fmtPer(c.total, u), '')}
      ${kpi('Prezzo vendita', fmtPer(price, u), 'green')}
    </div>
    <div class="breakdown-section" style="margin-bottom:20px"><h3 class="sub-title">Incidenza voci di costo
      <button class="btn-outline" style="margin-left:10px" onclick="costWhyModal('${it.id}')">${ico('search', 'tinted', '')} Da dove viene questo costo</button></h3>${bars}</div>
    <div class="breakdown-section"><h3 class="sub-title">Distinta base esplosa</h3>
      <div class="table-wrap"><table><thead><tr><th scope="col">Pos.</th><th scope="col">Codice</th><th scope="col">Articolo</th><th scope="col">Tipo</th><th scope="col">Q.tà</th><th scope="col">Costo un.</th><th scope="col">Costo riga</th></tr></thead>
      <tbody>${tableRows}</tbody></table></div></div>`;
}

// ─── «Da dove viene questo costo» ───
// I riquadri dicono *quanto* costa e le barre *di che tipo* è la spesa, ma non
// **chi** la fa. Su una distinta a cinque livelli la domanda vera è sempre la
// stessa — «perché costa così tanto?» — e la risposta finora andava cercata a
// mano nella tabella esplosa, riga per riga.
//
// Qui si sommano i costi riga per articolo (lo stesso componente in tre rami
// conta una volta sola, con la somma) e si mostrano i primi in ordine di peso.
// Nessun calcolo nuovo: è la stessa esplosione della tabella qui sotto, letta
// per la domanda giusta.
const COST_WHY_TOP = 10;
function costContributors(itemId) {
  const rows = [];
  flattenBom(itemId, 1, 0, 0, rows, []);
  const per = new Map();
  // La radice è la riga 0: è il totale, non un contributo a se stesso.
  rows.slice(1).forEach(r => {
    // Le righe di lavorazione (🔧) non portano un articolo: stanno nelle barre
    // di incidenza, come dice la finestra, non qui.
    if (!r.itemId) return;
    // Si risolve e si aggrega per id, non per codice: i codici duplicati
    // esistono (vedi duplicateCodeGroups) e per codice due articoli distinti
    // si fonderebbero, o un assieme omonimo di una foglia falserebbe il filtro.
    const it = getItem(r.itemId);
    // Solo le foglie: un assieme e i suoi componenti conterebbero due volte la
    // stessa spesa. Una parte prodotta in casa che esplode il proprio ciclo
    // conta con le sue righe, non con se stessa — stessa regola.
    const esplode = it && (isAssembly(it.type)
      || (it.type === 'parte' && partSourcing(it) !== 'buy' && (distintaRighe(it).length || cicloFasi(it).length)));
    if (esplode) return;
    const e = per.get(r.itemId) || { id: r.itemId, code: r.code, name: r.name, type: r.type, qty: 0, line: 0 };
    // Riportati alla radice: il costo riga nel suo padre non basta quando il
    // padre entra più volte (vedi `mult` in flattenBom).
    e.qty += r.qtyTot; e.line += r.tot;
    per.set(r.itemId, e);
  });
  return Array.from(per.values()).filter(x => x.line > 0).sort((a, b) => b.line - a.line);
}
function costWhyModal(itemId) {
  const it = getItem(itemId); if (!it) return;
  const totale = costOf(it.id).total;
  const tutti = costContributors(it.id);
  const top = tutti.slice(0, COST_WHY_TOP);
  const coperto = top.reduce((s, x) => s + x.line, 0);
  const quota = x => totale > 0 ? (x.line / totale * 100) : 0;
  const righe = top.map((x, i) => `<div class="breakdown-row">
      <div class="breakdown-name" title="${esc(x.name)}">${i + 1}. <span style="font-family:var(--mono)">${codeLink(x.id, x.code || '')}</span> ${esc(x.name)}</div>
      <div class="breakdown-bar"><div class="breakdown-fill" style="width:${totale > 0 ? Math.min(100, x.line / (top[0].line || 1) * 100) : 0}%;background:var(--accent)"></div></div>
      <div class="breakdown-stats"><span>${fmtN(x.line)}</span><span style="color:var(--text-dim)">${quota(x).toFixed(1)}%</span></div>
    </div>`).join('');
  openModal(`<h3>${ico('search', 'tinted pill', '')} Da dove viene il costo di ${esc(it.code)}</h3>
    <p>${esc(it.name)} — costo totale <strong>${fmtPer(totale, itemUom(it))}</strong>.</p>
    ${tutti.length ? `<p class="empty-text" style="text-align:left;padding:0 0 10px">I ${top.length} articoli che pesano di più, sommati su tutta la distinta: ${totale > 0 ? (coperto / totale * 100).toFixed(0) : 0}% del costo${tutti.length > top.length ? `, su ${tutti.length} voci in tutto` : ''}. Le lavorazioni e le spese generali non compaiono qui: stanno nelle barre di incidenza.</p>
      ${righe}`
    : '<div class="empty-text">Nessun componente con un costo: la distinta è vuota, oppure tutto quello che contiene vale zero.</div>'}
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'costo');
}

// ─── EXPORT ───
function reportRows() { const r = []; flattenBom(reportBomId || currentBomId, 1, 0, 0, r, []); return r; }
function exportBomExcel() {
  const it = getItem(reportBomId || currentBomId); if (!it) { showToast('Seleziona un prodotto', 'error'); return; }
  const c = costOf(it.id);
  const rows = reportRows();
  // Nel foglio i numeri restano numeri (si devono poter sommare): la valuta va
  // detta in intestazione, che è l'unico posto dove non rompe una formula.
  const data = [['Pos.', 'Codice', 'Articolo', 'Livello', 'Tipo', 'Quantità', 'U.M.',
    `Costo unitario (${cur()}/U.M.)`, `Costo riga (${cur()})`]];
  rows.forEach(r => data.push([r.pos, '  '.repeat(r.level) + r.code, r.name, r.level, r.type, r.qty, r.uom, +r.unit.toFixed(4), +r.line.toFixed(4)]));
  data.push([]);
  data.push(['', '', 'Materiale', '', '', '', '', '', +c.material.toFixed(2)]);
  data.push(['', '', 'Commerciali', '', '', '', '', '', +c.purchased.toFixed(2)]);
  data.push(['', '', 'Parti', '', '', '', '', '', +c.parts.toFixed(2)]);
  data.push(['', '', 'Lavorazioni', '', '', '', '', '', +c.labor.toFixed(2)]);
  data.push(['', '', 'Spese generali', '', '', '', '', '', +c.overhead.toFixed(2)]);
  data.push(['', '', 'COSTO TOTALE', '', '', '', '', '', +c.total.toFixed(2)]);
  data.push(['', '', 'PREZZO VENDITA', '', '', '', '', '', +sellingPrice(it.id).toFixed(2)]);
  if (!requireXlsx()) return;
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Distinta');
  XLSX.writeFile(wb, 'Distinta_' + nomeFileSicuro(it.code || it.name, 'articolo') + '.xlsx');
  showToast('Excel esportato');
}
function exportBomPDF() {
  const it = getItem(reportBomId || currentBomId); if (!it) { showToast('Seleziona un prodotto', 'error'); return; }
  const jsPDF = requirePdf(); if (!jsPDF) return;
  const doc = new jsPDF();
  const c = costOf(it.id);
  doc.setFontSize(15); doc.text(`Distinta base — ${it.name}`, 14, 16);
  doc.setFontSize(10); doc.setTextColor(120);
  doc.text(`Codice: ${it.code || '-'}   Data: ${new Date().toLocaleDateString('it-IT')}`, 14, 23);
  // Il rientro sta sul codice, come a video: la descrizione parte sempre dallo stesso margine.
  const rows = reportRows().map(r => [r.pos, '  '.repeat(r.level) + r.code, r.name, r.type,
    (r.qty + ' ' + r.uom).trim(), fmtN(r.unit) + (r.uom ? '/' + r.uom : ''), fmtN(r.line)]);
  doc.autoTable({
    startY: 28, head: [['Pos.', 'Codice', 'Articolo', 'Tipo', 'Q.tà', 'Costo un.', 'Costo riga']], body: rows,
    styles: { fontSize: 8 }, headStyles: { fillColor: [58, 123, 232] },
  });
  let y = doc.lastAutoTable.finalY + 8;
  const sum = [
    ['Materiale', fmtN(c.material)], ['Commerciali', fmtN(c.purchased)], ['Parti', fmtN(c.parts)], ['Lavorazioni', fmtN(c.labor)],
    ['Spese generali', fmtN(c.overhead)], ['COSTO TOTALE', fmtN(c.total)], ['PREZZO VENDITA', fmtN(sellingPrice(it.id))],
  ];
  doc.autoTable({ startY: y, body: sum, theme: 'plain', styles: { fontSize: 10 },
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right', fontStyle: 'bold' } }, tableWidth: 90 });
  doc.save('Distinta_' + nomeFileSicuro(it.code || it.name, 'articolo') + '.pdf');
  showToast('PDF esportato');
}
