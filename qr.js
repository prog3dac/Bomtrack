// ═══════════════════════════════════════════════════════════
//  BOMTRACK — qr.js (codici QR)
// ═══════════════════════════════════════════════════════════
// Un QR è solo un indirizzo stampato: `…/index.html#/q/art/MAT-ACC-LAM-001`.
// Inquadrato con la fotocamera del telefono apre l'app sulla scheda rapida di
// quell'articolo o di quell'ordine; letto dal pulsante «Scansiona», o da una
// pistola USB che lo digita in un campo, fa la stessa cosa senza uscire.
//
// ── Cosa c'è dentro il codice ──
// Il **codice leggibile** (codice articolo, numero d'ordine), non l'id interno:
// un'etichetta che si legge anche a occhio, e che sopravvive a un ripristino da
// backup o a un passaggio al cloud, dove gli id possono cambiare. Il prezzo è
// che rinominare un codice rende vecchie le etichette già stampate: per
// questo, se il codice non si trova, si prova anche come id.
//
// ── Cosa NON fa ──
// Non scrive niente da solo. La scheda rapida offre i gesti che esistono già
// (rettifica, avvio fase, dichiarazione, ricevimento): ognuno passa dalle sue
// guardie e dalle sue conferme, esattamente come dalla vista normale.
//
// Le due librerie stanno in `vendor/` (vedi LEGGIMI.md): `qrcode` disegna,
// `jsQR` legge quando il browser non ha un lettore suo (BarcodeDetector).

// I tipi che un QR può nominare. La sigla va nell'indirizzo, quindi è corta e
// non cambia mai: etichette già stampate la contengono.
const QR_TIPI = {
  art: 'Articolo',
  odp: 'Ordine di produzione',
  oda: 'Ordine di acquisto',
  odl: 'Ordine di lavoro',
  ubi: 'Ubicazione',   // dalla 0.101.0: il QR sullo scaffale
};

// ─── L'indirizzo ───
// La base è quella scritta in Impostazioni, altrimenti quella da cui l'app è
// aperta, se è un indirizzo vero. Da `file://` non c'è niente da mettere: un
// telefono non apre il disco del PC dell'ufficio. In quel caso il QR porta
// solo la parte dopo il `#`, che il pulsante «Scansiona» capisce lo stesso.
function qrSettings() {
  const q = (db.settings && db.settings.qr) || {};
  return {
    baseUrl: String(q.baseUrl || '').trim(),
    formato: QR_FORMATI[q.formato] ? q.formato : 'a4-3x8',
  };
}
function qrBaseUrl() {
  const scritta = qrSettings().baseUrl;
  if (scritta) return scritta.replace(/#.*$/, '');
  if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol || '')) {
    return location.origin + location.pathname;
  }
  return '';
}
function qrLink(tipo, codice) {
  return qrBaseUrl() + '#/q/' + tipo + '/' + encodeURIComponent(String(codice == null ? '' : codice));
}

// Da un testo letto (un indirizzo intero, solo il frammento, o un codice nudo
// digitato da una pistola) a { tipo, codice }. Il tipo è '' quando il testo
// non lo dice: chi risolve cercherà dappertutto.
function qrParse(testo) {
  const t = String(testo == null ? '' : testo).trim();
  if (!t) return null;
  const m = /#\/?q\/([a-z]+)\/([^#?\s]*)/i.exec(t);
  if (m) {
    const tipo = m[1].toLowerCase();
    let codice = m[2];
    try { codice = decodeURIComponent(codice); } catch (e) { /* lasciato com'è */ }
    if (!QR_TIPI[tipo] || !codice) return null;
    return { tipo, codice };
  }
  // Un indirizzo che non è nostro non si scambia per un codice articolo.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return null;
  return { tipo: '', codice: t };
}

// { tipo, rec } oppure null. Il codice prima, l'id come ripiego.
function qrResolve(tipo, codice) {
  const c = String(codice == null ? '' : codice).trim();
  if (!c) return null;
  const k = c.toLowerCase();
  const perNumero = lista => (lista || []).find(o => String(o.number || '').trim().toLowerCase() === k)
    || (lista || []).find(o => o.id === c) || null;
  const cerca = {
    art: () => codeIndex().get(itemCodeKey(c)) || getItem(c) || null,
    odp: () => perNumero(db.prodOrders),
    oda: () => perNumero(db.orders),
    odl: () => perNumero(db.workOrders),
    // Ultima: un codice nudo che è sia un articolo sia un'ubicazione è l'articolo.
    ubi: () => ubicazioneRec(c),
  };
  const tipi = tipo && cerca[tipo] ? [tipo] : Object.keys(cerca);
  for (const t of tipi) {
    const rec = cerca[t]();
    if (rec) return { tipo: t, rec };
  }
  return null;
}

// ─── Il disegno ───
// La libreria restituisce la matrice; il disegno lo facciamo noi, in SVG per lo
// schermo e in rettangoli vettoriali per il PDF. Così il QR stampato resta
// nitido a qualunque misura, senza passare da un'immagine.
function qrDisponibile() { return typeof qrcode === 'function'; }
function qrMatrice(testo) {
  if (!qrDisponibile()) return null;
  // UTF-8: un codice con una lettera accentata deve uscire uguale a come entra.
  if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  // Correzione M: regge una macchia o un graffio sul 15% del codice, che in
  // officina è la norma, senza far crescere troppo i moduli.
  const q = qrcode(0, 'M');
  q.addData(String(testo));
  q.make();
  const n = q.getModuleCount();
  const righe = [];
  for (let r = 0; r < n; r++) {
    const riga = [];
    for (let c = 0; c < n; c++) riga.push(q.isDark(r, c));
    righe.push(riga);
  }
  return righe;
}
// Le corse orizzontali di moduli scuri: un rettangolo per corsa invece che per
// modulo, e niente righine bianche fra moduli vicini nel PDF.
function qrCorse(m) {
  const out = [];
  m.forEach((riga, r) => {
    let c = 0;
    while (c < riga.length) {
      if (!riga[c]) { c++; continue; }
      const da = c;
      while (c < riga.length && riga[c]) c++;
      out.push([r, da, c - da]);
    }
  });
  return out;
}
function qrSvg(testo, px) {
  const m = qrMatrice(testo);
  if (!m) return '';
  const n = m.length, bordo = 4, lato = n + bordo * 2;
  const d = qrCorse(m).map(([r, c, l]) => `M${c + bordo} ${r + bordo}h${l}v1h-${l}z`).join('');
  return `<svg class="qr-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lato} ${lato}" width="${px || 160}" height="${px || 160}" shape-rendering="crispEdges" role="img" aria-label="Codice QR"><rect width="${lato}" height="${lato}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
// Il QR dentro un PDF jsPDF, in millimetri. `lato` comprende già il margine
// bianco (due moduli: sulla carta bianca basta, e il codice resta grande).
function qrPdfDraw(doc, testo, x, y, lato) {
  const m = qrMatrice(testo);
  if (!m || !doc || typeof doc.rect !== 'function') return false;
  const bordo = 2, mod = lato / (m.length + bordo * 2);
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, lato, lato, 'F');
  doc.setFillColor(0, 0, 0);
  qrCorse(m).forEach(([r, c, l]) => {
    doc.rect(x + (c + bordo) * mod, y + (r + bordo) * mod, l * mod + 0.01, mod + 0.01, 'F');
  });
  return true;
}

// ─── Le etichette ───
// Formati in millimetri. Il foglio A4 3×8 è il più comune in cartoleria
// (70×37, codici tipo 3475/3490); i rotoli sono una pagina per etichetta,
// che è ciò che si aspettano i driver delle stampanti termiche.
const QR_FORMATI = {
  'a4-3x8': { nome: 'Foglio A4 · 3×8 (70×37 mm)', pagina: [210, 297], col: 3, righe: 8, w: 70, h: 37, x0: 0, y0: 0.5 },
  'a4-2x7': { nome: 'Foglio A4 · 2×7 (99×38 mm)', pagina: [210, 297], col: 2, righe: 7, w: 99, h: 38, x0: 6, y0: 15.5 },
  'rotolo-50x30': { nome: 'Rotolo · 50×30 mm', pagina: [50, 30], col: 1, righe: 1, w: 50, h: 30, x0: 0, y0: 0 },
  'rotolo-62x29': { nome: 'Rotolo · 62×29 mm', pagina: [62, 29], col: 1, righe: 1, w: 62, h: 29, x0: 0, y0: 0 },
};
// Le righe di testo di un'etichetta, per tipo. Il codice prima: è quello che
// si cerca con gli occhi sullo scaffale.
function qrEtichettaTesti(tipo, rec) {
  if (tipo === 'art') return { codice: rec.code || '', righe: [rec.name || '', [typeLabel(rec.type), itemUom(rec)].filter(Boolean).join(' · '), ubicazioneOf(rec) ? 'Ubic. ' + ubicazioneOf(rec) : ''] };
  if (tipo === 'ubi') {
    const n = (rec.items || []).length;
    return { codice: rec.code || '', righe: ['Ubicazione', n === 1 ? '1 articolo' : n + ' articoli'] };
  }
  if (tipo === 'odp') return { codice: rec.number || '', righe: [`${rec.code || ''} ${rec.name || ''}`.trim(), `${fmtQty(rec.qty)} ${rec.uom || ''}`.trim()] };
  return { codice: rec.number || '', righe: [rec.title || '', rec.supplierId ? (supplierName(rec.supplierId) || '') : ''] };
}
function qrCodiceDi(tipo, rec) { return tipo === 'art' || tipo === 'ubi' ? rec.code : rec.number; }

// voci: [{ tipo, rec, copie }]. `salta` lascia vuote le prime etichette di un
// foglio già usato in parte: senza, un foglio iniziato si butta.
function qrEtichettePdf(voci, opz) {
  const o = opz || {};
  const f = QR_FORMATI[o.formato] || QR_FORMATI[qrSettings().formato];
  const elenco = [];
  (voci || []).forEach(v => {
    if (!v || !v.rec || !qrCodiceDi(v.tipo, v.rec)) return;
    const n = Math.max(1, Math.min(500, Math.round(Number(v.copie) || 1)));
    for (let i = 0; i < n; i++) elenco.push(v);
  });
  if (!elenco.length) { showToast('Nessuna etichetta da stampare', 'error'); return false; }
  if (!qrDisponibile()) { showToast('Libreria QR non disponibile: manca vendor/qrcode.js', 'error'); return false; }
  const jsPDF = requirePdf(); if (!jsPDF) return false;
  const doc = new jsPDF({ unit: 'mm', format: f.pagina, orientation: f.pagina[0] > f.pagina[1] ? 'landscape' : 'portrait' });
  const perPagina = f.col * f.righe;
  const salta = f.col * f.righe > 1 ? Math.max(0, Math.min(perPagina - 1, Math.round(Number(o.salta) || 0))) : 0;
  elenco.forEach((v, i) => {
    const pos = i + salta;
    if (i > 0 && pos % perPagina === 0) doc.addPage(f.pagina, f.pagina[0] > f.pagina[1] ? 'landscape' : 'portrait');
    const k = pos % perPagina;
    const x = f.x0 + (k % f.col) * f.w, y = f.y0 + Math.floor(k / f.col) * f.h;
    const pad = 2;
    const lato = Math.min(f.h - pad * 2, f.w * 0.45);
    qrPdfDraw(doc, qrLink(v.tipo, qrCodiceDi(v.tipo, v.rec)), x + pad, y + (f.h - lato) / 2, lato);
    const t = qrEtichettaTesti(v.tipo, v.rec);
    const tx = x + pad + lato + 2, tw = f.w - (tx - x) - pad;
    let ty = y + pad + 4;
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(f.h < 32 ? 9 : 10);
    doc.splitTextToSize(String(t.codice), tw).slice(0, 2).forEach(r => { doc.text(r, tx, ty); ty += 4.2; });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    const maxY = y + f.h - pad;
    t.righe.filter(Boolean).forEach(riga => {
      doc.splitTextToSize(String(riga), tw).forEach(r => { if (ty <= maxY) { doc.text(r, tx, ty); ty += 3; } });
    });
  });
  // La data di qui, non quella di Greenwich: fra mezzanotte e le due il file
  // prendeva il giorno prima. E il prefisso degli altri export dell'app.
  doc.save(`bomtrack_etichette_qr_${oggiISO()}.pdf`);
  showToast(elenco.length === 1 ? '1 etichetta pronta' : elenco.length + ' etichette pronte');
  return true;
}

// La finestra prima della stampa: quante copie, che formato, da dove partire.
// Riceve gli id degli articoli; per un documento la stessa cosa con un id solo.
function qrEtichetteModal(ids, tipo) {
  const t = tipo || 'art';
  const prendi = { art: getItem, odp: getOdp, oda: getOrder, odl: getOdl, ubi: ubicazioneRec }[t];
  const recs = (ids || []).map(id => prendi(id)).filter(r => r && qrCodiceDi(t, r));
  if (!recs.length) {
    showToast(t === 'ubi' ? 'Nessuna ubicazione da etichettare: scrivila nella scheda degli articoli' : 'Nessun articolo da etichettare con questi filtri', 'error');
    return;
  }
  window.__qrEtichette = { tipo: t, ids: recs.map(r => r.id) };
  const s = qrSettings();
  const avviso = qrBaseUrl() ? '' : `<div class="rfq-warn">${ico('warning', 'tinted', '')} L'app è aperta dal disco: il QR non contiene un indirizzo, quindi la fotocamera del telefono non saprà dove andare. Si leggerà solo con <strong>Scansiona</strong> dentro Bomtrack. Per i telefoni, scrivi l'indirizzo dell'app in <em>Gestione › Impostazioni › Etichette QR</em>.</div>`;
  const elenco = recs.slice(0, 200).map((r, i) => {
    const e = qrEtichettaTesti(t, r);
    return `<div class="mgmt-item">
      <span style="width:150px;font-family:var(--mono)">${esc(e.codice)}</span>
      <span style="flex:1">${esc(e.righe[0] || '')}</span>
      <input class="num" type="number" id="qr-copie-${i}" min="1" max="500" step="1" value="1" style="width:70px" aria-label="Copie di ${esc(e.codice)}">
    </div>`;
  }).join('');
  const oltre = recs.length > 200 ? `<p class="empty-text" style="text-align:left;padding:4px 0">…e altri ${recs.length - 200}, una copia ciascuno.</p>` : '';
  const nomi = { art: ['articolo', 'articoli'], ubi: ['ubicazione', 'ubicazioni'] }[t] || ['documento', 'documenti'];
  openModal(`<h3>${ico('qr', 'tinted pill', '')} Etichette QR — ${recs.length === 1 ? '1 ' + nomi[0] : recs.length + ' ' + nomi[1]}</h3>
    ${avviso}
    <div class="modal-grid">
      <div class="modal-field"><label>Formato</label><select id="qr-formato">
        ${Object.keys(QR_FORMATI).map(k => `<option value="${k}"${k === s.formato ? ' selected' : ''}>${esc(QR_FORMATI[k].nome)}</option>`).join('')}
      </select></div>
      <div class="modal-field"><label>Etichette già usate sul foglio</label>
        <input class="num" type="number" id="qr-salta" min="0" max="39" step="1" value="0"></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;max-height:40vh;overflow:auto">${elenco}</div>${oltre}
    <p class="empty-text" style="text-align:left;padding:8px 0">Ogni QR apre la scheda rapida ${t === 'art' ? 'dell\'articolo: giacenza, rettifica, movimenti' : t === 'ubi' ? 'dell\'ubicazione: gli articoli che ci stanno, e il conteggio d\'inventario' : 'del documento'}. Nel PDF i codici sono vettoriali: si stampano nitidi a qualunque misura, con la stampa al <strong>100%</strong> (non «adatta alla pagina»).</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="qrEtichetteStampa()">${ico('printer', 'tinted', '')} Crea il PDF</button>
    </div>`, recs.length > 1, 'form');
}
function qrEtichetteStampa() {
  const sel = window.__qrEtichette; if (!sel) return;
  const prendi = { art: getItem, odp: getOdp, oda: getOrder, odl: getOdl, ubi: ubicazioneRec }[sel.tipo];
  const voci = sel.ids.map((id, i) => {
    const el = document.getElementById('qr-copie-' + i);
    return { tipo: sel.tipo, rec: prendi(id), copie: el && el.value !== '' ? el.value : 1 };
  });
  if (qrEtichettePdf(voci, { formato: val('qr-formato'), salta: val('qr-salta') })) closeModal();
}
// Dalla barra del Magazzino: gli articoli che l'elenco mostra adesso, con i
// suoi filtri. Dalla selezione dell'ispettore: quelli scelti.
function qrEtichetteMagazzino(soloIds) { qrEtichetteModal(stockFilteredRows(soloIds).map(it => it.id), 'art'); }
// Le ubicazioni degli articoli elencati, una volta ciascuna, nell'ordine in cui
// si cammina fra gli scaffali.
function qrEtichetteUbicazioni(soloIds) {
  const set = new Set();
  stockFilteredRows(soloIds).forEach(it => { const u = ubicazioneOf(it); if (u) set.add(u); });
  qrEtichetteModal(Array.from(set).sort(ubicazioneConfronta), 'ubi');
}

// ─── Arrivare da un QR ───
// L'indirizzo `#/q/…` non è una vista: si apre la scheda rapida sopra la vista
// in cui si è, e l'indirizzo torna a quello della vista. Senza, un Indietro
// del browser riaprirebbe la scheda, e un aggiornamento pure.
function qrDaHash() {
  if (typeof location === 'undefined') return null;
  const h = location.hash || '';
  return /^#\/?q\//i.test(h) ? qrParse(h) : null;
}
function qrPulisciHash() {
  if (typeof location === 'undefined') return;
  const v = activeView || 'home';
  if (typeof history !== 'undefined' && history.replaceState) history.replaceState(null, '', '#' + v);
  else location.hash = v;
}
function qrApri(letto) {
  if (!letto) { showToast('Codice non riconosciuto', 'error'); return false; }
  const r = qrResolve(letto.tipo, letto.codice);
  if (!r) {
    showToast(`${letto.tipo ? QR_TIPI[letto.tipo] : 'Codice'} «${letto.codice}» non trovato in archivio`, 'error');
    return false;
  }
  qrSchedaModal(r.tipo, r.rec);
  return true;
}

// ─── La scheda rapida ───
// Poche righe e i gesti che servono davanti allo scaffale o alla macchina.
// Ogni pulsante chiude la scheda e apre la finestra che l'app ha già: nessun
// gesto nuovo, nessuna scorciatoia attorno alle guardie.
function qrBtn(testo, icona, azione, primario) {
  // Sul pulsante pieno l'icona prende il colore del testo: tinta sparirebbe nel fondo.
  return `<button class="${primario ? 'add-btn-sm' : 'btn-outline'}" onclick="closeModal(); ${azione}">${ico(icona, primario ? '' : 'tinted', '')} ${esc(testo)}</button>`;
}
function qrSchedaHtml(tipo, rec) {
  if (tipo === 'art') {
    const it = rec, u = itemUom(it);
    const bottoni = [qrBtn('Scheda completa', 'eye', `itemInfoModal('${it.id}')`)];
    let corpo = '';
    if (hasStock(it)) {
      const s = stockOf(it.id);
      const imp = commitsOn(it.id, null).reduce((a, c) => a + c.qty, 0);
      corpo = `<div class="cost-summary" style="margin:8px 0">
        ${kpi('Esistente', fmtUom(s.onHand, u), safetyStockOf(it) > 0 && s.onHand < safetyStockOf(it) ? 'orange' : '')}
        ${kpi('In arrivo', fmtUom(s.incoming, u), 'accent')}
        ${kpi('Impegnato', fmtUom(imp, u), imp > 0 ? 'orange' : '')}
        ${kpi('Libero', fmtUom(s.onHand + s.incoming - imp, u), s.onHand + s.incoming - imp < 0 ? 'red' : '')}
      </div>`;
      if (canWriteShop('catalog')) bottoni.unshift(qrBtn('Rettifica giacenza', 'scale', `stockAdjustModal('${it.id}')`, true));
      bottoni.push(qrBtn(`Movimenti (${s.nMov})`, 'clock', `stockMovementsModal('${it.id}')`));
    } else {
      corpo = '<p class="empty-text" style="text-align:left;padding:4px 0">Articolo senza giacenza (macchina o gruppo).</p>';
    }
    const ub = ubicazioneOf(it);
    const dove = ub ? ` · <span class="code-link" ${clickAttrs(`qrApri({ tipo: 'ubi', codice: ${jsAttrStr(ub)} })`, 'Ubicazione ' + ub)}>${ico('pin', 'tinted', '')} ${esc(ub)}</span>` : '';
    return `<h3>${ico('package', 'tinted pill', '')} ${esc(it.code)}</h3>
      <p><strong>${esc(it.name || '')}</strong> · ${esc(typeLabel(it.type))}${dove}${it.obsolete ? ' · <span style="color:var(--red)">non più utilizzabile</span>' : ''}</p>
      ${corpo}<div class="qr-azioni">${bottoni.join('')}</div>`;
  }
  if (tipo === 'ubi') {
    // Lo scaffale: cosa ci sta, quanto ne dice l'app, e il conteggio da qui.
    const righe = (rec.items || []).map(it => `<div class="mgmt-item" ${clickAttrs(`qrSchedaModal('art', getItem('${it.id}'))`, 'Scheda di ' + it.code)} style="cursor:pointer">
        <span style="width:150px;font-family:var(--mono)">${esc(it.code || '')}</span>
        <span style="flex:1">${esc(it.name || '')}</span>
        <span class="num">${fmtUom(onHandOf(it.id), itemUom(it))}</span>
      </div>`).join('');
    const bottoni = [];
    if (canWriteShop('catalog')) bottoni.push(qrBtn('Conta questa ubicazione', 'clipboard', `inventarioAvviaDaQr({ ambito: 'ubi', ubi: ${jsAttrStr(rec.code)} })`, true));
    bottoni.push(qrBtn('Etichetta QR', 'qr', `qrEtichetteModal([${jsAttrStr(rec.code)}], 'ubi')`));
    return `<h3>${ico('pin', 'tinted pill', '')} ${esc(rec.code)}</h3>
      <p>${rec.items.length === 1 ? '1 articolo' : rec.items.length + ' articoli'} in questa ubicazione.</p>
      <div style="display:flex;flex-direction:column;gap:4px;margin:8px 0;max-height:45vh;overflow:auto">${righe}</div>
      <div class="qr-azioni">${bottoni.join('')}</div>`;
  }
  if (tipo === 'odp') {
    const o = rec;
    const f = opFaseCorrente(o);
    const bottoni = [];
    let fase = '';
    if (f) {
      const stato = opStatoFase(o, f);
      fase = `<p>Fase ${esc(String(f.seq))} <strong>${esc(f.wcName || '')}</strong>${f.supplierId ? ' · ' + esc(f.supplierName || supplierName(f.supplierId) || '') : ''} — ${esc(ODP_FASE_LABELS[stato] || stato)} · ${fmtQty(opProcessati(o, f))} di ${fmtQty(opDaFare(o, f))}</p>`;
      if (canWriteShop('docs')) {
        if (stato === 'avviabile') bottoni.push(qrBtn('Avvia la fase ' + f.seq, 'factory', `opAvviaModal('${o.id}','${f.id}')`, true));
        else if (stato === 'corso') bottoni.push(qrBtn('Dichiara avanzamento', 'check', `opDichiaraModal('${o.id}','${f.id}')`, true));
      }
      if (stato === 'attesa') fase += `<p class="empty-text" style="text-align:left;padding:0 0 8px">${esc(opAvviabile(o, f).motivo || '')}</p>`;
    } else if ((o.phases || []).length) {
      fase = '<p>Tutte le fasi sono chiuse.</p>';
    }
    bottoni.push(qrBtn("Apri l'ordine", 'factory', `openOdpFromPlan('${o.id}')`, !bottoni.length));
    return `<h3>${ico('factory', 'tinted pill', '')} ${esc(o.number)} ${statusBadge(ODP_STATUS, o.status)}</h3>
      <p><strong>${esc(`${o.code || ''} ${o.name || ''}`.trim())}</strong> · ${fmtQty(o.qty)} ${esc(o.uom || '')}${o.dueDate ? ' · serve per il ' + esc(fmtDateIt(o.dueDate)) : ''}</p>
      ${fase}<div class="qr-azioni">${bottoni.join('')}</div>`;
  }
  // Ordine di acquisto e di lavoro: stessa forma, stesso registro di stati.
  const o = rec, odl = tipo === 'odl';
  const righe = (o.lines || []).map(l => `<div class="mgmt-item">
      <span style="width:130px;font-family:var(--mono)">${esc(l.code || '')}</span>
      <span style="flex:1">${esc(l.description || l.name || '')}</span>
      <span class="num">${fmtQty(Number(l.received) || 0)} / ${fmtQty(Number(l.qty) || 0)} ${esc(l.uom || '')}</span>
    </div>`).join('');
  const aperto = ['inviato', 'confermato', 'parziale'].includes(o.status);
  const daRicevere = (o.lines || []).some(l => (Number(l.received) || 0) < (Number(l.qty) || 0));
  const bottoni = [qrBtn("Apri l'ordine", 'file', `${odl ? 'openOdlFromPlan' : 'openOrderFromPlan'}('${o.id}')`, !(aperto && daRicevere))];
  if (aperto && daRicevere && canWriteShop('docs')) {
    bottoni.unshift(qrBtn('Ricevi tutto', 'truck', `qrRiceviTutto('${tipo}','${o.id}')`, true),
      qrBtn('Ricevi una parte', 'truck', `qrRiceviModal('${tipo}','${o.id}')`));
  }
  return `<h3>${ico(odl ? 'truck' : 'cart', 'tinted pill', '')} ${esc(o.number)} ${statusBadge(ORDER_STATUS, o.status)}</h3>
    <p>${o.supplierId ? '<strong>' + esc(supplierName(o.supplierId) || '') + '</strong> · ' : ''}${esc(fmtDateIt(o.date) || '')}${o.title ? ' · ' + esc(o.title) : ''}</p>
    ${righe ? `<div style="display:flex;flex-direction:column;gap:4px;margin:8px 0">${righe}</div>` : ''}
    <div class="qr-azioni">${bottoni.join('')}</div>`;
}
function qrSchedaModal(tipo, rec) {
  openModal(qrSchedaHtml(tipo, rec), false, 'qr');
}
// Ricevere tutto dal telefono è un gesto che sposta il magazzino: si chiede.
function qrRiceviTutto(tipo, id) {
  const o = tipo === 'odl' ? getOdl(id) : getOrder(id);
  if (!o) return;
  askConfirm(`Registrare come ricevute tutte le righe di ${o.number}?`, () => {
    const k = tipo === 'odl' ? 'odl' : 'order';
    if (!(k === 'odl' ? odlMarkAllReceived(id) : ordMarkAllReceived(id))) return;
    // Dal QR non c'è un editor con «Salva»: si salva subito (dalla 0.105.3).
    // Restava in memoria con il segno «da salvare», e un telefono chiuso lo
    // perdeva; nell'archivio condiviso quel segno fermava la ricezione.
    docLeave(k);
    showToast('Ricevimento registrato');
  });
}

// ─── Ricevere una parte (dalla 0.105.6) ───
// Una consegna porta spesso 40 pezzi su 100, e dal telefono c'era solo
// «Ricevi tutto»: o si apriva l'editor completo, a dodici colonne e con il
// «Salva» da ricordare, o si riceveva tutto e si correggeva dopo, con
// magazzino e fabbisogno sbagliati nel frattempo. Qui le righe aperte, una
// sotto l'altra, con il campo già pieno del residuo: si corregge solo quella
// che arriva diversa, e una conferma registra e salva.
//
// Il numero è **quanto arriva adesso**, non il totale ricevuto: è quello che
// c'è sulla bolla in mano. Le righe di un ODL che vengono da un ordine di
// produzione restano fuori, come in «Ricevi tutto»: si dichiarano lì.
function qrRigheDaRicevere(tipo, o) {
  return (o.lines || []).filter(l => (Number(l.received) || 0) < (Number(l.qty) || 0)
    && !(tipo === 'odl' && odlRigaDaOdp(l)));
}
function qrRiceviModal(tipo, id) {
  const o = tipo === 'odl' ? getOdl(id) : getOrder(id);
  if (!o) return;
  const righe = qrRigheDaRicevere(tipo, o);
  if (!righe.length) { showToast(`${o.number}: niente da ricevere`); return; }
  const campi = righe.map((l, i) => {
    const residuo = arrotondaQta((Number(l.qty) || 0) - (Number(l.received) || 0));
    return `<div class="mgmt-item" style="flex-wrap:wrap">
      <span style="flex:1;min-width:140px"><span style="font-family:var(--mono)">${esc(l.code || '')}</span> ${esc(l.description || l.name || '')}
        <span class="empty-text" style="display:block;padding:0;text-align:left">Ricevuti ${fmtQty(Number(l.received) || 0)} su ${fmtQty(Number(l.qty) || 0)}</span></span>
      <input id="qr-ric-${i}" class="num" type="number" inputmode="decimal" min="0" step="any" value="${residuo}" style="width:90px" aria-label="Quanti ne arrivano di ${esc(l.code || '')}">
      <span>${esc(l.uom || '')}</span>
    </div>`;
  }).join('');
  openModal(`<h3>${ico('truck', 'tinted pill', '')} Ricevi — ${esc(o.number)}</h3>
    <p class="empty-text" style="text-align:left;padding:4px 0 8px">Scrivi quanti ne arrivano adesso, riga per riga: 0 per quello che non è arrivato.</p>
    <div style="display:flex;flex-direction:column;gap:4px;margin:8px 0;max-height:55vh;overflow:auto">${campi}</div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="qrRiceviConferma('${tipo}','${o.id}')">${ico('check', '', '')} Registra il ricevimento</button>
    </div>`, false, 'form');
}
// Legge i campi della finestra. Torna quante righe ha registrato, o false.
function qrRiceviConferma(tipo, id) {
  const o = tipo === 'odl' ? getOdl(id) : getOrder(id);
  if (!o) return false;
  const quantita = {};
  let errore = false;
  qrRigheDaRicevere(tipo, o).forEach((l, i) => {
    const el = document.getElementById('qr-ric-' + i);
    const t = el ? String(el.value).trim().replace(',', '.') : '';
    if (t === '') return;                       // vuoto: per quella riga non arriva niente
    const q = parseFloat(t);
    if (!isFinite(q) || q < 0) { errore = true; return; }
    if (q > 0) quantita[l.id] = q;
  });
  if (errore) { showToast('Le quantità ricevute non sono negative', 'error'); return false; }
  if (!Object.keys(quantita).length) { showToast('Nessuna quantità da registrare', 'error'); return false; }
  const n = qrRiceviRighe(tipo, id, quantita);
  if (n) closeModal();
  return n;
}
// `quantita`: { lineId: quanto arriva adesso }. Passa dalle stesse porte
// dell'editor (guardia di ricevimento, registraRicevuto, stato automatico) e
// salva subito, come «Ricevi tutto».
function qrRiceviRighe(tipo, id, quantita) {
  const k = tipo === 'odl' ? 'odl' : 'order';
  if (!docGuard(k, id, 'reception')) return false;
  const o = docKind(k).get(id); if (!o) return false;
  const coll = k === 'odl' ? 'workOrders' : 'orders';
  let n = 0;
  qrRigheDaRicevere(tipo, o).forEach(l => {
    const q = Number(quantita && quantita[l.id]) || 0;
    if (q <= 0) return;
    registraRicevuto(coll, o, l, (Number(l.received) || 0) + q);
    n++;
  });
  if (!n) return false;
  ordAutoStatus(o); touch(o); docMarkDirty(k);
  docLeave(k);
  docKind(k).render();
  showToast(`Ricevimento registrato: ${n === 1 ? '1 riga' : n + ' righe'}`);
  return n;
}

// ─── Scansiona ───
// La fotocamera dentro l'app: il lettore del browser se c'è (Chrome su
// Android), jsQR altrimenti. Il campo di testo sotto serve alle pistole USB,
// che «digitano» il codice letto e premono Invio, e a chi non ha fotocamera.
let _qrScan = null;
function qrScanModal() {
  openModal(`<h3>${ico('qr', 'tinted pill', '')} Scansiona un QR</h3>
    <div class="qr-video-box"><video id="qr-video" playsinline muted></video></div>
    <p class="empty-text" id="qr-scan-msg" style="text-align:left;padding:6px 0">Inquadra il codice dell'etichetta o del documento.</p>
    <div class="modal-field"><label>Oppure scrivi o leggi con la pistola</label>
      <input id="qr-scan-text" autocomplete="off" placeholder="es. MAT-ACC-LAM-001 o ODP-2026-012"
        onkeydown="if(event.key==='Enter'){event.preventDefault();qrScanTesto()}"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="qrScanStop(); closeModal()">Chiudi</button>
      <button class="add-btn-sm" onclick="qrScanTesto()">Apri</button>
    </div>`, false, 'qr');
  const campo = document.getElementById('qr-scan-text');
  if (campo && campo.focus) campo.focus();
  qrScanAvvia();
}
function qrScanMsg(t) { const e = document.getElementById('qr-scan-msg'); if (e) e.textContent = t; }
function qrScanTesto() {
  const t = val('qr-scan-text');
  if (!t) return;
  qrScanFine(t);
}
// Chi apre la fotocamera può dire cosa fare di quello che legge (l'inventario
// lo usa per passare all'articolo dopo senza chiudere niente). `onRead` torna
// true quando la lettura chiude il giro; senza, si apre la scheda rapida.
function qrScanFine(testo) {
  const letto = qrParse(testo);
  const r = letto && qrResolve(letto.tipo, letto.codice);
  if (!r) {
    qrScanMsg(`«${String(testo).slice(0, 80)}»: non trovato in archivio.`);
    return false;
  }
  qrScanStop();
  closeModal();
  qrSchedaModal(r.tipo, r.rec);
  return true;
}
function qrScanStop() {
  if (!_qrScan) return;
  _qrScan.attivo = false;
  if (_qrScan.stream) _qrScan.stream.getTracks().forEach(t => t.stop());
  _qrScan = null;
}
function qrScanAvvia(onRead) {
  qrScanStop();
  const video = document.getElementById('qr-video');
  const md = typeof navigator !== 'undefined' && navigator.mediaDevices;
  if (!video || !md || !md.getUserMedia) {
    qrScanMsg('Fotocamera non disponibile qui: usa il campo qui sotto. Sul telefono serve l\'app aperta da un indirizzo https.');
    return;
  }
  const stato = { attivo: true, stream: null, onRead: typeof onRead === 'function' ? onRead : qrScanFine };
  _qrScan = stato;
  md.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(stream => {
    if (!stato.attivo) { stream.getTracks().forEach(t => t.stop()); return; }
    stato.stream = stream;
    video.srcObject = stream;
    return video.play().then(() => qrScanCiclo(stato, video));
  }).catch(() => {
    if (stato.attivo) qrScanMsg('La fotocamera non è stata concessa: usa il campo qui sotto.');
  });
}
function qrScanCiclo(stato, video) {
  let rivela = null;
  if (typeof BarcodeDetector !== 'undefined') {
    try { rivela = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { rivela = null; }
  }
  const tela = document.createElement('canvas');
  const giro = () => {
    // Chiusa la scheda (Esc, la ×, un'altra vista), la fotocamera si spegne:
    // una spia accesa che nessuno guarda è la prima cosa che un operatore nota.
    if (!stato.attivo || !document.body.contains(video)) { if (stato === _qrScan) qrScanStop(); return; }
    const prossimo = () => setTimeout(giro, 200);
    if (rivela) {
      rivela.detect(video).then(c => {
        if (c && c.length && stato.onRead(c[0].rawValue)) return;
        prossimo();
      }).catch(() => { rivela = null; prossimo(); });
      return;
    }
    if (typeof jsQR === 'function' && video.videoWidth) {
      const w = Math.min(640, video.videoWidth), h = Math.round(video.videoHeight * w / video.videoWidth);
      tela.width = w; tela.height = h;
      const g = tela.getContext('2d');
      g.drawImage(video, 0, 0, w, h);
      const r = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
      if (r && r.data && stato.onRead(r.data)) return;
    }
    prossimo();
  };
  giro();
}

// ─── Impostazioni ───
function renderQrSettings() {
  const s = qrSettings();
  const aperta = typeof location !== 'undefined' && /^https?:$/.test(location.protocol || '') ? location.origin + location.pathname : '';
  return `<h3 class="settings-group-title">${ico('qr', 'tinted', '')} Etichette QR</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Indirizzo dell'app nei QR</label><input id="set-qr-base" value="${esc(s.baseUrl)}" placeholder="${esc(aperta || 'https://…/index.html')}" autocomplete="off"></div>
      <div class="modal-field"><label>Formato etichette (default)</label><select id="set-qr-formato">
        ${Object.keys(QR_FORMATI).map(k => `<option value="${k}"${k === s.formato ? ' selected' : ''}>${esc(QR_FORMATI[k].nome)}</option>`).join('')}
      </select></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">È l'indirizzo che il telefono apre quando inquadra un'etichetta. Vuoto = quello da cui l'app è aperta adesso${aperta ? ` (<span style="font-family:var(--mono)">${esc(aperta)}</span>)` : ', che però è un file sul disco: un telefono non lo raggiunge'}. Le etichette contengono il <strong>codice</strong> dell'articolo o il <strong>numero</strong> dell'ordine: cambiare questo indirizzo dopo averle stampate le rende inutili per la fotocamera, non per <em>Scansiona</em>.</p>`;
}
// Restituisce un messaggio d'errore, o '' se è tutto a posto.
function readQrSettings() {
  if (!document.getElementById('set-qr-base')) return '';
  const base = val('set-qr-base');
  if (base && !/^https?:\/\/\S+$/i.test(base)) return 'L\'indirizzo dei QR deve iniziare con http:// o https://';
  const formato = val('set-qr-formato');
  db.settings.qr = { baseUrl: base, formato: QR_FORMATI[formato] ? formato : 'a4-3x8' };
  return '';
}
