// ═══════════════════════════════════════════════════════════
//  BOMTRACK — genealogia.js
// ═══════════════════════════════════════════════════════════
// La storia di un documento (dalla 0.146.0): Riepilogo → Storia documenti.
// Si sceglie un documento qualsiasi — commessa, piano, richiesta, ordine,
// ordine di lavoro, ordine di produzione, collaudo, non conformità, modifica
// tecnica — e il grafo mostra da cosa è nato e che cosa ha generato. Un clic
// su un altro documento del grafo lo mette al centro.
//
// Niente di nuovo nello schema: i legami ci sono già (`jobId`, `planId`,
// `rfqId`, `odpId`, `orderId` del collaudo, `inspectionId` della NC, i
// documenti aperti al rilascio di una modifica tecnica). Qui si leggono e
// basta.
//
// Ogni documento ha **un padre solo**, il più vicino: un ordine nato da una
// richiesta che porta anche il piano e la commessa è figlio della richiesta,
// non dei tre. Così la famiglia è un albero e il grafo non si aggroviglia.
// Le modifiche tecniche fanno eccezione: «riguardano» i documenti aperti al
// rilascio, e si disegnano tratteggiate a parte.
// Classic script, scope globale condiviso con gli altri.

// I tipi, nell'ordine in cui si cercano. `col` è la variabile di colore
// dell'area (il bordo del nodo).
const STORIA_TIPI = {
  job: { sigla: 'COM', nome: 'Commessa', col: '--accent' },
  plan: { sigla: 'FAB', nome: 'Piano di fabbisogno', col: '--yellow' },
  rfq: { sigla: 'RDO', nome: 'Richiesta d\'offerta', col: '--orange' },
  order: { sigla: 'ODA', nome: 'Ordine fornitore', col: '--orange' },
  odp: { sigla: 'ODP', nome: 'Ordine di produzione', col: '--purple' },
  odl: { sigla: 'ODL', nome: 'Ordine di lavoro', col: '--purple' },
  insp: { sigla: 'COL', nome: 'Collaudo', col: '--green' },
  nc: { sigla: 'NC', nome: 'Non conformità', col: '--red' },
  rev: { sigla: 'MT', nome: 'Modifica tecnica', col: '--text-dim' },
};
// Oltre questi nodi la famiglia intera non si disegna: si passa alla sola linea.
const STORIA_MAX = 80;
// Misure del grafo, in pixel.
const STORIA_W = 184, STORIA_H = 96, STORIA_GX = 54, STORIA_GY = 14;

let storiaFocus = null;          // { k, id } del documento al centro
let storiaModo = 'famiglia';     // 'famiglia' | 'linea'
let storiaQ = '';                // il testo della ricerca

function storiaElenco(k) {
  if (k === 'job') return db.jobs || [];
  if (k === 'plan') return db.plans || [];
  if (k === 'rfq') return db.rfqs || [];
  if (k === 'order') return db.orders || [];
  if (k === 'odl') return db.workOrders || [];
  if (k === 'odp') return db.prodOrders || [];
  if (k === 'insp') return (db.inspections || []).filter(x => x && x.active !== false);
  if (k === 'nc') return (db.nonconformities || []).filter(x => x && x.active !== false);
  if (k === 'rev') return (db.revisions || []).filter(r => r && r.ecoNumber);
  return [];
}
// Durante un disegno i documenti si cercano in una mappa: fra padri, figli e
// ordinamento si chiedono migliaia di volte. Fuori dal disegno la mappa non
// c'è, e si legge l'archivio com'è adesso.
let _storiaMappa = null;
function storiaMappa() {
  const m = new Map();
  Object.keys(STORIA_TIPI).forEach(k => storiaElenco(k).forEach(d => { if (d && d.id) m.set(storiaChiave(k, d.id), d); }));
  return m;
}
function storiaGet(k, id) {
  if (!id) return null;
  if (_storiaMappa) return _storiaMappa.get(storiaChiave(k, id)) || null;
  return storiaElenco(k).find(d => d.id === id) || null;
}
const storiaChiave = (k, id) => k + ':' + id;
function storiaDaChiave(key) { const i = key.indexOf(':'); return { k: key.slice(0, i), id: key.slice(i + 1) }; }

// Il documento (ordine, ODL o ODP) a cui punta un `orderId` senza chiave esterna.
function storiaDocDiOrdine(orderId, source) {
  if (!orderId) return null;
  const pref = source === 'odl' ? ['odl', 'order', 'odp'] : source === 'odp' ? ['odp', 'odl', 'order'] : ['order', 'odl', 'odp'];
  for (const k of pref) if (storiaGet(k, orderId)) return { k, id: orderId };
  return null;
}
// Il padre di un documento: il più vicino fra quelli che esistono ancora.
// Torna { k, id, perche } o null.
function storiaPadre(k, d) {
  if (!d) return null;
  const prova = (pk, id, perche) => id && storiaGet(pk, id) ? { k: pk, id, perche } : null;
  const commessa = () => prova('job', d.jobId, 'della commessa');
  const piano = () => prova('plan', d.planId, 'dal piano');
  if (k === 'plan') return commessa();
  if (k === 'rfq') return piano() || commessa();
  if (k === 'order') return prova('rfq', d.rfqId, 'dall\'offerta') || piano() || commessa();
  // L'ODP di ripresa (0.145.0) nasce dalla NC che l'ha lanciato.
  if (k === 'odp') return prova('nc', d.ncId, 'ripresa della NC') || piano() || commessa();
  if (k === 'odl') {
    const riga = (d.lines || []).find(l => l && l.odpId && storiaGet('odp', l.odpId));
    return prova('odp', d.odpId, 'fase esterna dell\'ODP') || (riga ? { k: 'odp', id: riga.odpId, perche: 'fase esterna dell\'ODP' } : null)
      || prova('rfq', d.rfqId, 'dall\'offerta') || piano() || commessa();
  }
  if (k === 'insp') {
    const o = storiaDocDiOrdine(d.orderId, d.source);
    return o ? Object.assign(o, { perche: o.k === 'odp' ? 'a fine ciclo' : o.k === 'odl' ? 'al rientro dal terzista' : 'al ricevimento' }) : null;
  }
  if (k === 'nc') {
    const c = prova('insp', d.inspectionId, 'dal collaudo');
    if (c) return c;
    const o = storiaDocDiOrdine(d.orderId) || storiaDocDiOrdine(d.productionOrderId, 'odp');
    return o ? Object.assign(o, { perche: 'dagli scarti' }) : null;
  }
  return null;   // commessa e modifica tecnica stanno in cima
}
// Tutti i legami, una volta per disegno: padre di ciascuno, figli di ciascuno,
// e i documenti che ogni modifica tecnica riguarda.
function storiaIndice() {
  const prima = _storiaMappa; _storiaMappa = prima || storiaMappa();
  try { return storiaIndiceDentro(); } finally { _storiaMappa = prima; }
}
function storiaIndiceDentro() {
  const padre = new Map(), figli = new Map(), riguarda = new Map();
  Object.keys(STORIA_TIPI).forEach(k => storiaElenco(k).forEach(d => {
    const key = storiaChiave(k, d.id);
    if (k === 'rev') {
      const t = (d.ecoImpact || []).filter(x => x && storiaGet(x.k, x.id)).map(x => storiaChiave(x.k, x.id));
      if (t.length) riguarda.set(key, t);
      return;
    }
    const p = storiaPadre(k, d); if (!p) return;
    const pk = storiaChiave(p.k, p.id);
    padre.set(key, { key: pk, perche: p.perche });
    if (!figli.has(pk)) figli.set(pk, []);
    figli.get(pk).push(key);
  }));
  // I figli in ordine di data, poi di numero: la lettura dall'alto in basso
  // segue il tempo.
  const ordine = new Map();
  const chiaveOrdine = key => {
    if (!ordine.has(key)) { const x = storiaDaChiave(key), d = storiaGet(x.k, x.id) || {}; ordine.set(key, String(d.date || '').slice(0, 10) + ' ' + (d.number || '')); }
    return ordine.get(key);
  };
  figli.forEach(arr => arr.sort((a, b) => chiaveOrdine(a).localeCompare(chiaveOrdine(b))));
  return { padre, figli, riguarda };
}
// Gli antenati, dal più vicino al più lontano.
function storiaAntenati(ix, key) {
  const out = []; const visti = new Set([key]);
  let p = ix.padre.get(key);
  while (p && !visti.has(p.key)) { out.push(p.key); visti.add(p.key); p = ix.padre.get(p.key); }
  return out;
}
function storiaDiscendenti(ix, key) {
  const out = []; const coda = [key]; const visti = new Set([key]);
  while (coda.length) {
    const c = coda.shift();
    (ix.figli.get(c) || []).forEach(f => { if (!visti.has(f)) { visti.add(f); out.push(f); coda.push(f); } });
  }
  return out;
}
// Che cosa si disegna attorno a `key`: l'albero (radice e nodi), la linea del
// documento (antenati, lui, discendenti) e le modifiche tecniche che toccano
// qualcuno dei nodi.
//   modo 'famiglia': tutto quello che scende dalla radice;
//   modo 'linea':    solo la linea.
function storiaGrafo(key, modo) {
  const ix = storiaIndice();
  const { k } = storiaDaChiave(key);
  if (k === 'rev') {
    // Una modifica tecnica non ha padre né figli: al centro, con i documenti
    // che riguarda.
    const t = ix.riguarda.get(key) || [];
    return { ix, radice: key, nodi: [key].concat(t), linea: new Set([key].concat(t)), mt: [], troppi: false, modo: 'linea', soloMt: true };
  }
  const antenati = storiaAntenati(ix, key);
  const radice = antenati.length ? antenati[antenati.length - 1] : key;
  const linea = new Set([key].concat(antenati, storiaDiscendenti(ix, key)));
  let nodi = [radice].concat(storiaDiscendenti(ix, radice));
  let troppi = false;
  if (modo === 'linea' || nodi.length > STORIA_MAX) {
    troppi = modo !== 'linea';
    nodi = nodi.filter(n => linea.has(n));
  }
  const dentro = new Set(nodi);
  const mt = [];
  ix.riguarda.forEach((t, rk) => { if (t.some(x => dentro.has(x))) mt.push(rk); });
  return { ix, radice, nodi, linea, mt, troppi, modo: troppi ? 'linea' : modo, soloMt: false };
}
// Le posizioni: colonna = generazione, riga dall'alto. Un albero con un padre
// solo per nodo si mette in fila senza incroci: ogni foglia prende la riga
// dopo, ogni padre sta in mezzo ai suoi figli.
function storiaLayout(g) {
  const pos = new Map();
  const dentro = new Set(g.nodi);
  let riga = 0;
  if (g.soloMt) {
    pos.set(g.radice, { col: 0, row: Math.max(0, (g.nodi.length - 2) / 2) });
    g.nodi.slice(1).forEach((n, i) => pos.set(n, { col: 1, row: i }));
    return { pos, cols: g.nodi.length > 1 ? 2 : 1, rows: Math.max(1, g.nodi.length - 1) };
  }
  const piazza = (key, col) => {
    const figli = (g.ix.figli.get(key) || []).filter(f => dentro.has(f));
    if (!figli.length) { pos.set(key, { col, row: riga++ }); return; }
    figli.forEach(f => piazza(f, col + 1));
    const a = pos.get(figli[0]).row, b = pos.get(figli[figli.length - 1]).row;
    pos.set(key, { col, row: (a + b) / 2 });
  };
  piazza(g.radice, 0);
  let cols = 0; pos.forEach(p => { cols = Math.max(cols, p.col + 1); });
  // Le modifiche tecniche sotto l'albero, una colonna prima del primo
  // documento che riguardano.
  g.mt.forEach(rk => {
    const col = Math.min.apply(null, g.ix.riguarda.get(rk).filter(x => pos.has(x)).map(x => pos.get(x).col));
    pos.set(rk, { col: Math.max(0, col - 1), row: riga++ });
  });
  return { pos, cols: Math.max(1, cols), rows: Math.max(1, riga) };
}

// ─── Quel che si scrive di ogni documento ───
function storiaNodo(key) {
  const { k, id } = storiaDaChiave(key);
  const d = storiaGet(k, id); if (!d) return null;
  const T = STORIA_TIPI[k];
  const articolo = itemId => { const it = itemId ? getItem(itemId) : null; return it ? [it.code, it.name].filter(Boolean).join(' ') : ''; };
  const forn = sid => sid ? supplierName(sid) : '';
  const n = { key, k, id, tipo: T.nome, numero: d.number || '', titolo: d.title || '', sotto: '', data: String(d.date || '').slice(0, 10), badge: '' };
  if (k === 'job') { n.sotto = d.customer || ''; n.badge = statusBadge(JOB_STATUS, d.status || 'aperta'); }
  else if (k === 'plan') { n.sotto = (d.lines || []).length + ' righe'; n.badge = d.active === false ? '<span class="doc-badge st-chiuso">Chiuso</span>' : '<span class="doc-badge st-aperta">Aperto</span>'; }
  else if (k === 'rfq') { n.sotto = forn(d.supplierId); n.badge = statusBadge(RFQ_STATUS, d.status); }
  else if (k === 'order' || k === 'odl') { n.sotto = forn(d.supplierId); n.badge = statusBadge(ORDER_STATUS, d.status); }
  else if (k === 'odp') { n.titolo = [d.code, d.name].filter(Boolean).join(' ') || n.titolo; n.sotto = fmtQtyIt(d.qty) + ' ' + (d.uom || 'pz'); n.badge = statusBadge(ODP_STATUS, d.status); }
  else if (k === 'insp') { n.titolo = articolo(d.itemId); n.sotto = [fmtQtyIt(d.qty) + ' ' + (d.uom || ''), forn(d.supplierId)].filter(s => s.trim()).join(' · '); n.badge = qcBadge(d); }
  else if (k === 'nc') { n.titolo = d.description || articolo(d.itemId); n.sotto = NC_DECISIONI[d.decision] || ''; n.badge = ncBadge(d); }
  else if (k === 'rev') { n.numero = d.ecoNumber || ''; n.titolo = articolo(d.itemId) + (d.rev ? ' rev. ' + d.rev : ''); n.sotto = d.motivo || ''; n.badge = '<span class="doc-badge st-chiuso">Rilasciata</span>'; }
  return n;
}
// Il testo che si cerca di un documento: numero, titolo, controparte, articolo.
function storiaTestoRicerca(n) { return [n.numero, n.titolo, n.sotto, n.tipo].join(' ').toLowerCase(); }
function storiaCerca(q) {
  const s = String(q || '').toLowerCase().trim(); if (!s) return [];
  const prima = _storiaMappa; _storiaMappa = prima || storiaMappa();
  try { return storiaCercaDentro(s); } finally { _storiaMappa = prima; }
}
function storiaCercaDentro(s) {
  const out = [];
  Object.keys(STORIA_TIPI).forEach(k => storiaElenco(k).forEach(d => {
    const n = storiaNodo(storiaChiave(k, d.id));
    if (n && storiaTestoRicerca(n).includes(s)) out.push(Object.assign(n, { esatto: n.numero.toLowerCase().startsWith(s) ? 0 : 1 }));
  }));
  return out.sort((a, b) => a.esatto - b.esatto || b.data.localeCompare(a.data)).slice(0, 12);
}

// ─── Aprire ───
// Dal pulsante «Storia» di un documento, o da una riga della ricerca.
function storiaApri(k, id) {
  if (!storiaGet(k, id)) return;
  storiaFocus = { k, id }; storiaQ = '';
  if (activeView === 'storia') renderStoria(); else setView('storia');
}
// Il clic su un nodo: quel documento va al centro.
function storiaCentra(key) {
  const { k, id } = storiaDaChiave(key);
  if (!storiaGet(k, id)) return;
  storiaFocus = { k, id };
  renderStoria();
}
function storiaSetModo(m) { storiaModo = m === 'linea' ? 'linea' : 'famiglia'; renderStoria(); }
// Il documento nella sua vista. Torna false se la vista è spenta.
function storiaApriDocumento(k, id) {
  if (k === 'insp' || k === 'nc') {
    if (!moduloAttivo('qualita')) { showToast('Qualità: modulo spento in Gestione → Aree e moduli', 'error'); return false; }
    if (k === 'insp') qcApriDaAltrove(id); else ncApriDaAltrove(id);
    return true;
  }
  if (k === 'rev') { const r = storiaGet('rev', id); if (r) revHistoryModal(r.itemId); return !!r; }
  homeApri(k, id);
  return true;
}
function storiaBtn(k, id) {
  return `<button class="btn-outline" onclick="storiaApri(${jsAttr(k)},${jsAttr(id)})" title="Da cosa è nato questo documento e che cosa ha generato">${ico('tree', 'tinted', '')} Storia</button>`;
}

// ─── Disegno ───
function storiaNodoHtml(n, x, y, cls) {
  return `<button type="button" class="storia-nodo ${cls}" style="--c:var(${STORIA_TIPI[n.k].col});left:${x}px;top:${y}px;width:${STORIA_W}px;height:${STORIA_H}px"
      onclick="storiaCentra(${jsAttr(n.key)})" title="${esc(n.tipo + ' ' + n.numero)}: metti al centro">
    <span class="storia-tipo">${esc(n.tipo)}</span>
    <span class="storia-num">${esc(n.numero || '—')}</span>
    <span class="storia-tit">${esc(n.titolo || '—')}</span>
    <span class="storia-sotto">${esc([n.sotto, n.data ? fmtDateIt(n.data) : ''].filter(Boolean).join(' · '))}</span>
    <span class="storia-badge">${n.badge}</span></button>`;
}
function storiaGrafoHtml(g, focusKey) {
  const L = storiaLayout(g);
  const xy = key => { const p = L.pos.get(key); return { x: p.col * (STORIA_W + STORIA_GX), y: p.row * (STORIA_H + STORIA_GY) }; };
  const W = L.cols * (STORIA_W + STORIA_GX) - STORIA_GX, H = L.rows * (STORIA_H + STORIA_GY) - STORIA_GY;
  const linee = [];
  const arco = (a, b, accesa, tratto) => {
    const A = xy(a), B = xy(b);
    const x1 = A.x + STORIA_W, y1 = A.y + STORIA_H / 2;
    let d;
    if (tratto && !g.soloMt) {
      // Le modifiche tecniche stanno sotto l'albero: la freccia sale ed entra
      // dal fondo del documento, invece di attraversare la sua colonna.
      const x2 = B.x + STORIA_W / 2, y2 = B.y + STORIA_H + 3;
      d = `M${x1},${y1} C${x2},${y1} ${x2},${Math.min(y1, y2 + 40)} ${x2},${y2}`;
    } else {
      const x2 = B.x - 3, y2 = B.y + STORIA_H / 2, m = (x1 + x2) / 2;
      d = `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`;
    }
    linee.push(`<path d="${d}" class="storia-arco${accesa ? ' accesa' : ''}${tratto ? ' tratto' : ''}" marker-end="url(#storia-fr${accesa ? '-on' : ''})"/>`);
  };
  const dentro = new Set(g.nodi);
  g.nodi.forEach(n => {
    if (g.soloMt) { if (n !== g.radice) arco(g.radice, n, true, true); return; }
    const p = g.ix.padre.get(n);
    if (p && dentro.has(p.key)) arco(p.key, n, g.linea.has(p.key) && g.linea.has(n), false);
  });
  g.mt.forEach(rk => g.ix.riguarda.get(rk).filter(t => dentro.has(t)).forEach(t => arco(rk, t, t === focusKey, true)));
  const nodi = g.nodi.concat(g.mt).map(key => {
    const n = storiaNodo(key); if (!n) return '';
    const { x, y } = xy(key);
    const cls = key === focusKey ? 'is-focus' : g.linea.has(key) ? '' : 'is-fuori';
    return storiaNodoHtml(n, x, y, cls);
  }).join('');
  return `<div class="storia-tela" id="storia-tela"><div class="storia-piano" style="width:${W}px;height:${H}px">
    <svg class="storia-archi" width="${W}" height="${H}" aria-hidden="true"><defs>
      <marker id="storia-fr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" class="storia-punta"/></marker>
      <marker id="storia-fr-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" class="storia-punta accesa"/></marker>
    </defs>${linee.join('')}</svg>${nodi}</div></div>`;
}
// Sul telefono il grafo diventa un elenco rientrato: lo stesso albero, dall'alto.
function storiaElencoHtml(g, focusKey) {
  const righe = [];
  const dentro = new Set(g.nodi);
  const riga = (key, liv, nota) => {
    const n = storiaNodo(key); if (!n) return;
    const cls = key === focusKey ? 'is-focus' : g.linea.has(key) ? '' : 'is-fuori';
    righe.push(`<button type="button" class="storia-riga ${cls}" style="--c:var(${STORIA_TIPI[n.k].col});margin-left:${Math.min(liv, 6) * 14}px" onclick="storiaCentra(${jsAttr(key)})">
      <span class="storia-tipo">${esc(n.tipo)}${nota ? ' · ' + esc(nota) : ''}</span>
      <span class="storia-riga-testa"><span class="storia-num">${esc(n.numero || '—')}</span>${n.badge}</span>
      <span class="storia-tit">${esc(n.titolo || '—')}${n.data ? ` <span class="storia-sotto">· ${esc(fmtDateIt(n.data))}</span>` : ''}</span></button>`);
  };
  const giu = (key, liv) => {
    const p = g.ix.padre.get(key);
    riga(key, liv, liv && p ? p.perche : '');
    (g.ix.figli.get(key) || []).filter(f => dentro.has(f)).forEach(f => giu(f, liv + 1));
  };
  if (g.soloMt) { riga(g.radice, 0, ''); g.nodi.slice(1).forEach(n => riga(n, 1, 'riguarda')); }
  else giu(g.radice, 0);
  g.mt.forEach(rk => riga(rk, 0, 'riguarda ' + g.ix.riguarda.get(rk).filter(t => dentro.has(t)).map(t => (storiaNodo(t) || {}).numero).join(', ')));
  return `<div class="storia-elenco">${righe.join('')}</div>`;
}
// Il riquadro del documento al centro: i dati, da dove viene, i ricevimenti.
function storiaDettaglioHtml(g, key) {
  const n = storiaNodo(key); if (!n) return '';
  const d = storiaGet(n.k, n.id);
  const p = g.ix.padre.get(key);
  const pn = p ? storiaNodo(p.key) : null;
  const figli = (g.ix.figli.get(key) || []).map(storiaNodo).filter(Boolean);
  const mt = [];
  g.ix.riguarda.forEach((t, rk) => { if (t.includes(key)) mt.push(storiaNodo(rk)); });
  const link = x => `<a href="#" onclick="storiaCentra(${jsAttr(x.key)});return false">${esc(x.numero)}</a>`;
  const legami = [];
  if (pn) legami.push(`<div class="storia-dato"><span>Nato da</span><span>${link(pn)} <span class="storia-sotto">${esc(p.perche)}</span></span></div>`);
  if (figli.length) legami.push(`<div class="storia-dato"><span>Ha generato</span><span>${figli.map(link).join(', ')}</span></div>`);
  if (mt.length) legami.push(`<div class="storia-dato"><span>Lo riguarda</span><span>${mt.map(link).join(', ')}</span></div>`);
  if (!legami.length) legami.push('<p class="empty-text" style="text-align:left;padding:0">Nessun documento collegato.</p>');
  // I ricevimenti e i rientri, per ordini e ordini di lavoro.
  let eventi = '';
  if (n.k === 'order' || n.k === 'odl') {
    const coll = n.k === 'order' ? 'orders' : 'workOrders';
    const ev = (db.receipts || []).filter(r => r && r.orderId === n.id && r.coll === coll)
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    const codice = lid => { const l = (d.lines || []).find(x => x.id === lid); return l ? l.code || l.description || '' : ''; };
    eventi = `<div><h3 class="storia-h3">${n.k === 'order' ? 'Ricevimenti' : 'Rientri'}</h3>${ev.length ? ev.map(r =>
      `<div class="storia-dato"><span>${esc(fmtDateIt(r.date))}${r.kind && r.kind !== 'ricevimento' ? ' · ' + esc(r.kind) : ''}</span><span class="storia-mono">${esc(fmtQtyIt(r.qty))} ${esc(codice(r.lineId))}</span></div>`).join('')
      : '<p class="empty-text" style="text-align:left;padding:0">Ancora niente.</p>'}</div>`;
  }
  return `<div class="storia-dett">
    <div><h3 class="storia-h3">${esc(n.tipo)} <span class="storia-mono">${esc(n.numero)}</span> ${n.badge}</h3>
      <div class="storia-dato"><span>Oggetto</span><span>${esc(n.titolo || '—')}</span></div>
      ${n.sotto ? `<div class="storia-dato"><span>${n.k === 'job' ? 'Cliente' : ['rfq', 'order', 'odl'].includes(n.k) ? 'Fornitore' : 'Dettaglio'}</span><span>${esc(n.sotto)}</span></div>` : ''}
      ${n.data ? `<div class="storia-dato"><span>Data</span><span>${esc(fmtDateIt(n.data))}</span></div>` : ''}
      <div style="margin-top:10px"><button class="add-btn-sm" onclick="storiaApriDocumento(${jsAttr(n.k)},${jsAttr(n.id)})">${ico('eye', 'tinted', '')} Apri il documento</button></div></div>
    <div><h3 class="storia-h3">Collegamenti</h3>${legami.join('')}</div>
    ${eventi}</div>`;
}
function storiaRisultatiHtml() {
  const hits = storiaCerca(storiaQ);
  if (!storiaQ.trim()) return '';
  return hits.map(h => `<div class="picker-row" onclick="storiaApri(${jsAttr(h.k)},${jsAttr(h.id)})">
      <span class="picker-type">${esc(STORIA_TIPI[h.k].sigla)}</span><b>${esc(h.numero)}</b> — ${esc(h.titolo || '(senza titolo)')}
      <span class="gs-meta">${esc([h.sotto, h.data ? fmtDateIt(h.data) : ''].filter(Boolean).join(' · '))}</span></div>`).join('')
    || `<div class="picker-empty">Nessun documento per "${esc(storiaQ)}"</div>`;
}
// La digitazione ridisegna solo i risultati: il campo non perde il fuoco.
function storiaCercaInput(v) {
  storiaQ = String(v || '');
  const box = document.getElementById('storia-ris'); if (box) box.innerHTML = storiaRisultatiHtml();
}
function storiaStretto() { return typeof window !== 'undefined' && window.innerWidth > 0 && window.innerWidth < 700; }
function renderStoria() {
  const host = document.getElementById('view-storia'); if (!host) return;
  _storiaMappa = storiaMappa();
  try { renderStoriaDentro(host); } finally { _storiaMappa = null; }
}
function renderStoriaDentro(host) {
  if (storiaFocus && !storiaGet(storiaFocus.k, storiaFocus.id)) storiaFocus = null;
  const cerca = `<div class="storia-cerca">
      <input type="text" id="storia-q" class="storia-input" placeholder="Cerca un documento: numero, oggetto, fornitore, articolo…" autocomplete="off"
        value="${esc(storiaQ)}" oninput="storiaCercaInput(this.value)" aria-label="Cerca un documento">
      <div id="storia-ris" class="picker-results">${storiaRisultatiHtml()}</div></div>`;
  const testa = `<div class="bom-toolbar"><div class="bom-toolbar-left"><h2 class="section-title">${ico('tree', 'tinted pill', '')} Storia documenti</h2></div></div>`;
  if (!storiaFocus) {
    host.innerHTML = `<div class="manage-wrap">${testa}<div class="storia-card">${cerca}
      <p class="empty-text" style="text-align:left">Scegli un documento — commessa, piano, richiesta d'offerta, ordine fornitore, ordine di produzione o di lavoro, collaudo, non conformità, modifica tecnica — per vedere da cosa è nato e che cosa ha generato. Si arriva qui anche dal pulsante <strong>Storia</strong> di ogni documento.</p></div></div>`;
    return;
  }
  const key = storiaChiave(storiaFocus.k, storiaFocus.id);
  const g = storiaGrafo(key, storiaModo);
  const tot = g.nodi.length + g.mt.length;
  const seg = (m, t) => `<button type="button" class="${g.modo === m && !g.soloMt ? 'on' : ''}" onclick="storiaSetModo('${m}')"${g.soloMt ? ' disabled' : ''}>${t}</button>`;
  host.innerHTML = `<div class="manage-wrap">${testa}<div class="storia-card">
    <div class="storia-barra">${cerca}<div class="storia-seg" role="group" aria-label="Quanto mostrare">${seg('famiglia', 'Tutta la famiglia')}${seg('linea', 'Solo la linea')}</div></div>
    ${g.troppi ? `<p class="storia-avviso">${ico('warning', 'tinted', '')} La famiglia ha più di ${STORIA_MAX} documenti: si vede solo la linea di questo.</p>` : ''}
    <p class="storia-guida">${storiaStretto() ? 'Dall\'alto in basso: chi ha generato chi.' : 'Da sinistra a destra: chi ha generato chi.'} In blu la linea del documento scelto, tratteggiate le modifiche tecniche che lo riguardano. Un clic su un documento lo mette al centro. <span class="storia-sotto">${tot} document${tot === 1 ? 'o' : 'i'}</span></p>
    ${storiaStretto() ? storiaElencoHtml(g, key) : storiaGrafoHtml(g, key)}
    </div><div class="storia-card" style="margin-top:14px">${storiaDettaglioHtml(g, key)}</div></div>`;
  // Il documento al centro anche quando la tela scorre.
  const tela = document.getElementById('storia-tela');
  const nodo = host.querySelector && host.querySelector('.storia-nodo.is-focus');
  // Si scorre solo se non si vede già: la radice a sinistra resta in vista
  // finché c'è posto.
  if (tela && nodo && typeof tela.scrollTo === 'function') {
    const fuoriX = nodo.offsetLeft + STORIA_W > tela.clientWidth, fuoriY = nodo.offsetTop + STORIA_H > tela.clientHeight;
    if (fuoriX || fuoriY) tela.scrollTo({ left: fuoriX ? nodo.offsetLeft - (tela.clientWidth - STORIA_W) / 2 : 0, top: fuoriY ? nodo.offsetTop - (tela.clientHeight - STORIA_H) / 2 : 0 });
  }
}
