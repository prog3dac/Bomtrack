// ═══════════════════════════════════════════════════════════
//  BOMTRACK — qualita-nc.js  (modulo Qualità, fase 3: non conformità)
// ═══════════════════════════════════════════════════════════
// Ogni problema ha un numero, un responsabile e una data di chiusura.
//
// ── Il problema ──
// Un collaudo respinto dice che quel lotto non andava bene. Non dice perché,
// chi deve fare cosa perché non si ripeta, quanto è costato, né se il
// fornitore ha risposto. Quelle cose oggi vivono in una mail, e la mail non
// si ritrova quando la ISO chiede «che cosa avete fatto per quel fornitore».
//
// ── La non conformità ──
// Nasce da sola da un collaudo respinto o accettato in deroga, oppure a mano:
// dagli scarti di un ordine di produzione, da un reclamo del cliente, da una
// cosa vista in reparto. Porta:
//   - da dove viene e che cosa riguarda (articolo, fornitore, quantità);
//   - la **causa**, scelta da un elenco che si tiene in Gestione, e la
//     gravità: è quello che rende confrontabili cento NC fra un anno;
//   - la **decisione** su che cosa fare della merce;
//   - le **azioni**, ognuna con chi e entro quando;
//   - il costo, e la data entro cui va chiusa.
// Chiusa, resta: è la storia che la valutazione dei fornitori legge.
//
// Una NC aperta su un articolo e un fornitore mette il piano di controllo in
// **rinforzato** (qualita-piani.js): finché il problema non è chiuso, quel
// fornitore si collauda al 100%.
//
// ── Il numero ──
// La NC esce dall'azienda (il rapporto va al fornitore): il numero lo riserva
// il server, come per gli ordini, e due colleghi non possono darne uno uguale.

const NC_ORIGINI = {
  fornitore: 'Fornitore',
  produzione: 'Produzione',
  cliente: 'Reclamo cliente',
  interna: 'Interna',
};
const NC_GRAVITA = { minore: 'Minore', maggiore: 'Maggiore', critica: 'Critica' };
const NC_DECISIONI = {
  '': 'Da decidere',
  reso: 'Reso al fornitore',
  rilavorazione: 'Rilavorazione',
  deroga: 'Uso in deroga',
  rottamazione: 'Rottamazione',
  accettato: 'Accettato com\'è',
};
const NC_STATI = { aperta: 'Aperta', chiusa: 'Chiusa' };
// Le causali di serie: le più comuni in un'officina meccanica. Si cambiano in
// Gestione → Qualità.
const NC_CAUSALI_SERIE = ['Fuori tolleranza dimensionale', 'Difetto superficiale o estetico', 'Materiale non conforme',
  'Certificato mancante o errato', 'Quantità o codice errato', 'Danno da imballo o trasporto', 'Errore di lavorazione', 'Altro'];
// I giorni entro cui una NC va chiusa, se nessuno dice altro.
const NC_GIORNI_SERIE = 30;

function ncCausali() {
  const l = db.settings && Array.isArray(db.settings.qcCauses) ? db.settings.qcCauses.filter(Boolean) : null;
  return l && l.length ? l : NC_CAUSALI_SERIE;
}
function ncGiorni() {
  const g = parseInt(db.settings && db.settings.qcNcDays, 10);
  return g > 0 ? g : NC_GIORNI_SERIE;
}
function ncTutte() { return (db.nonconformities || []).filter(x => x && x.active !== false); }
function ncGet(id) { return ncTutte().find(x => x.id === id) || null; }
function ncAperte() { return ncTutte().filter(x => x.status !== 'chiusa'); }
function ncAperteDi(itemId, supplierId) {
  if (!itemId) return [];
  return ncAperte().filter(x => x.itemId === itemId && (!supplierId || x.supplierId === supplierId));
}
function ncDiCollaudo(inspectionId) { return ncTutte().find(x => x.inspectionId === inspectionId) || null; }
// Scaduta: aperta oltre la data, oppure con un'azione aperta oltre la sua.
function ncScaduta(x, oggi) {
  if (!x || x.status === 'chiusa') return false;
  const g = oggi || oggiISO();
  if (x.dueDate && x.dueDate < g) return true;
  return (x.actions || []).some(a => !a.done && a.due && a.due < g);
}
function ncScadute() { const g = oggiISO(); return ncAperte().filter(x => ncScaduta(x, g)); }
function ncScadenzaDa(iso, giorni) {
  const d = new Date((iso || oggiISO()) + 'T12:00:00');
  d.setDate(d.getDate() + (giorni || ncGiorni()));
  return d.toISOString().slice(0, 10);
}

// ─── Nascere ───
// `dati` = { source, itemId, supplierId, qty, uom, inspectionId, orderId,
// description, decision, cause, gravita }. Ritorna la NC (o una promessa, con
// l'archivio condiviso: il numero lo dà il server).
function ncCrea(dati) {
  const d = dati || {};
  const fare = () => {
    const it = d.itemId ? getItem(d.itemId) : null;
    const oggi = oggiISO();
    return Store.insert('nonconformities', {
      number: numeroProgressivo('NC'),
      source: NC_ORIGINI[d.source] ? d.source : 'interna',
      inspectionId: d.inspectionId || null, orderId: d.orderId || null,
      itemId: it ? it.id : null, supplierId: d.supplierId || null,
      qty: Math.max(0, Number(d.qty) || 0), uom: d.uom || (it ? itemUom(it) : ''),
      date: oggi, cause: String(d.cause || ''), gravita: NC_GRAVITA[d.gravita] ? d.gravita : 'maggiore',
      description: String(d.description || '').trim(), decision: NC_DECISIONI[d.decision] !== undefined ? (d.decision || '') : '',
      actions: [], cost: 0, dueDate: ncScadenzaDa(oggi), status: 'aperta', closedAt: null, note: '', active: true,
    });
  };
  return typeof conNumeri === 'function' ? conNumeri({ NC: 1 }, fare) : fare();
}
// Dal collaudo: una sola NC per collaudo, con quello che il collaudo sa già.
// La guardia è quella del collaudo: chi registra l'esito apre anche la NC,
// e chi la lavora poi è l'ufficio (ncGuard).
function ncDaCollaudo(insp) {
  if (!insp || !qcAttivo() || ncDiCollaudo(insp.id)) return null;
  const respinto = insp.esito === 'respinto';
  const fuori = (insp.checks || []).filter(c => qcCheckEsito(c) === 'ko').map(c => c.name).filter(Boolean);
  const testo = [
    respinto ? `Lotto respinto al collaudo ${insp.number}` : `Lotto accettato in deroga al collaudo ${insp.number}`,
    insp.supplierLot ? `lotto fornitore ${insp.supplierLot}` : '',
    insp.ddt ? (/^ddt\b/i.test(insp.ddt) ? insp.ddt : `DDT ${insp.ddt}`) : '',
    fuori.length ? `fuori specifica: ${fuori.join(', ')}` : '',
    insp.note || '',
  ].filter(Boolean).join(' · ');
  const causa = fuori.length ? 'Fuori tolleranza dimensionale'
    : (qcCertificatoRichiesto(insp) && insp.cert !== 'ok' ? 'Certificato mancante o errato' : '');
  return ncCrea({
    source: 'fornitore', inspectionId: insp.id, orderId: insp.orderId,
    itemId: insp.itemId, supplierId: insp.supplierId, qty: respinto ? insp.qtyKo : insp.qty, uom: insp.uom,
    description: testo, cause: ncCausali().includes(causa) ? causa : '',
    decision: !respinto ? 'deroga' : insp.destino === 'scarto' ? 'rottamazione' : 'reso',
  });
}

// ─── Lavorarla ───
function ncGuard() { return roleGuard('docs'); }
const NC_CAMPI = ['cause', 'gravita', 'description', 'decision', 'cost', 'dueDate', 'note', 'qty', 'supplierId', 'itemId'];
function ncSet(id, campo, valore) {
  if (!ncGuard()) return false;
  const x = ncGet(id); if (!x || !NC_CAMPI.includes(campo)) return false;
  if (x.status === 'chiusa') { showToast('La non conformità è chiusa: riaprila per cambiarla', 'error'); return false; }
  let v = valore == null ? '' : String(valore).trim();
  if (campo === 'cost' || campo === 'qty') v = Math.max(0, Number(v.replace(',', '.')) || 0);
  if (campo === 'gravita' && !NC_GRAVITA[v]) v = 'maggiore';
  if (campo === 'decision' && NC_DECISIONI[v] === undefined) v = '';
  if ((campo === 'supplierId' || campo === 'itemId')) v = v || null;
  Store.update('nonconformities', id, { [campo]: v });
  return true;
}
function ncAzioneAggiungi(id) {
  if (!ncGuard()) return null;
  const x = ncGet(id); if (!x || x.status === 'chiusa') return null;
  const a = { id: gid(), text: '', who: '', due: ncScadenzaDa(oggiISO(), Math.min(15, ncGiorni())), done: false };
  Store.update('nonconformities', id, { actions: (x.actions || []).concat([a]) });
  ncRidisegna();
  return a;
}
function ncAzioneSet(id, azId, campo, valore) {
  if (!ncGuard()) return false;
  const x = ncGet(id); if (!x || x.status === 'chiusa' || !['text', 'who', 'due', 'done'].includes(campo)) return false;
  const v = campo === 'done' ? !!valore : String(valore == null ? '' : valore).trim();
  Store.update('nonconformities', id, { actions: (x.actions || []).map(a => a.id === azId ? Object.assign({}, a, { [campo]: v }) : a) });
  if (campo === 'done') ncRidisegna();
  return true;
}
function ncAzioneElimina(id, azId) {
  if (!ncGuard()) return false;
  const x = ncGet(id); if (!x || x.status === 'chiusa') return false;
  Store.update('nonconformities', id, { actions: (x.actions || []).filter(a => a.id !== azId) });
  ncRidisegna();
  return true;
}
// Chiudere chiede una decisione e una causa: una NC chiusa senza le due cose
// non insegna niente a chi la rilegge. Le azioni aperte non bloccano, ma si
// dice: a volte un'azione resta in carico a un altro reparto.
function ncChiudi(id) {
  if (!ncGuard()) return false;
  const x = ncGet(id); if (!x || x.status === 'chiusa') return false;
  if (!x.decision) { showToast('Prima di chiudere scegli la decisione', 'error'); return false; }
  if (!x.cause) { showToast('Prima di chiudere scegli la causa', 'error'); return false; }
  const aperte = (x.actions || []).filter(a => !a.done).length;
  const chiudi = () => {
    Store.update('nonconformities', id, { status: 'chiusa', closedAt: nowISO() });
    showToast(`${x.number} chiusa`);
    ncRidisegna();
  };
  if (aperte) {
    askConfirm(`${x.number} ha ${aperte} azion${aperte === 1 ? 'e' : 'i'} non ancora fatt${aperte === 1 ? 'a' : 'e'}.\nChiuderla lo stesso?`, chiudi, { title: 'Chiudere la non conformità', ok: 'Sì, chiudi', safe: true });
    return true;
  }
  chiudi();
  return true;
}
function ncRiapri(id) {
  if (!ncGuard()) return false;
  const x = ncGet(id); if (!x || x.status !== 'chiusa') return false;
  Store.update('nonconformities', id, { status: 'aperta', closedAt: null });
  ncRidisegna();
  return true;
}
// Si elimina solo l'ultima della serie, come ogni documento numerato.
function ncElimina(id) {
  if (!ncGuard()) return;
  const x = ncGet(id); if (!x) return;
  if (!guardiaDocumentoUltimo(x, db.nonconformities, 'Chiudila invece di eliminarla.')) return;
  askConfirm(`Eliminare la non conformità ${x.number}?`, () => eliminaSeAncoraUltimo(() => {
    const d = ncGet(id);
    return !!d && guardiaDocumentoUltimo(d, db.nonconformities, 'Chiudila invece di eliminarla.');
  }, () => {
    if (ncCurrentId === id) ncCurrentId = null;
    removeConUndo('nonconformities', id, `Non conformità ${x.number} eliminata`, () => renderNc());
  }));
}

// ─── Nuova, a mano ───
function ncNuovaModal() {
  if (!ncGuard()) return;
  const articoli = (db.items || []).filter(it => !it.obsolete).sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
  const fornitori = (db.suppliers || []).filter(s => s.active !== false).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'it'));
  const odp = (db.prodOrders || []).filter(o => o.active !== false && o.status !== 'bozza')
    .sort((a, b) => String(b.number || '').localeCompare(String(a.number || ''))).slice(0, 200);
  openModal(`<h2 class="modal-title">${ico('warning', 'tinted', '')} Nuova non conformità</h2>
    <div class="modal-grid">
      <div class="modal-field"><label>Da dove viene</label>
        <select id="nc-n-src" onchange="ncNuovaOrigine()">${Object.keys(NC_ORIGINI).map(k => `<option value="${k}" ${k === 'interna' ? 'selected' : ''}>${esc(NC_ORIGINI[k])}</option>`).join('')}</select></div>
      <div class="modal-field" id="nc-n-odp-f" style="display:none"><label>Ordine di produzione</label>
        <select id="nc-n-odp" class="sel-cerca" onchange="ncNuovaOdp()"><option value="">—</option>
          ${odp.map(o => `<option value="${o.id}">${esc(o.number + ' — ' + (o.code || '') + ' ' + (o.name || ''))}</option>`).join('')}</select></div>
      <div class="modal-field"><label>Articolo</label>
        <select id="nc-n-item" class="sel-cerca"><option value="">—</option>
          ${articoli.map(it => `<option value="${it.id}">${esc(it.code + ' — ' + it.name)}</option>`).join('')}</select></div>
      <div class="modal-field" id="nc-n-sup-f" style="display:none"><label>Fornitore</label>
        <select id="nc-n-sup" class="sel-cerca"><option value="">—</option>
          ${fornitori.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
      <div class="modal-field"><label>Quantità coinvolta</label><input type="number" id="nc-n-qty" min="0" step="any" value="0"></div>
      <div class="modal-field"><label>Gravità</label>
        <select id="nc-n-grav">${Object.keys(NC_GRAVITA).map(k => `<option value="${k}" ${k === 'maggiore' ? 'selected' : ''}>${esc(NC_GRAVITA[k])}</option>`).join('')}</select></div>
    </div>
    <div class="modal-field"><label>Che cosa è successo</label><textarea id="nc-n-descr" rows="3" placeholder="es. 12 pezzi con la cava fuori quota"></textarea></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="ncNuovaSalva()">Crea</button></div>`);
}
function ncNuovaOrigine() {
  const s = val('nc-n-src');
  const a = document.getElementById('nc-n-odp-f'), b = document.getElementById('nc-n-sup-f');
  if (a) a.style.display = s === 'produzione' ? '' : 'none';
  if (b) b.style.display = s === 'fornitore' ? '' : 'none';
}
// Scelto un ODP, l'articolo è il suo e la quantità sono i suoi scarti.
function ncNuovaOdp() {
  const o = typeof getOdp === 'function' ? getOdp(val('nc-n-odp')) : null; if (!o) return;
  const sel = document.getElementById('nc-n-item');
  if (sel) {
    sel.value = o.itemId || '';
    // Il campo in cui si scrive (combo.js) si riallinea all'evento.
    if (typeof sel.dispatchEvent === 'function' && typeof Event === 'function') sel.dispatchEvent(new Event('change'));
  }
  const q = document.getElementById('nc-n-qty');
  if (q) q.value = String(ncScartiOdp(o));
}
function ncScartiOdp(o) {
  if (!o || typeof opScarti !== 'function') return 0;
  return (o.phases || []).reduce((s, f) => s + (Number(opScarti(o, f)) || 0), 0);
}
function ncNuovaSalva() {
  if (!ncGuard()) return null;
  const src = val('nc-n-src');
  const descr = val('nc-n-descr');
  if (!descr) { showToast('Scrivi che cosa è successo', 'error'); return null; }
  const r = ncCrea({ source: src, itemId: val('nc-n-item') || null, supplierId: src === 'fornitore' ? (val('nc-n-sup') || null) : null,
    orderId: src === 'produzione' ? (val('nc-n-odp') || null) : null, qty: rawNum('nc-n-qty'), gravita: val('nc-n-grav'), description: descr });
  const dopo = x => { if (!x) return x; closeModal(); ncCurrentId = x.id; if (activeView === 'nc') renderNc(); else setView('nc'); showToast(`Non conformità ${x.number} creata`); return x; };
  return r && typeof r.then === 'function' ? r.then(dopo) : dopo(r);
}

// ─── Il contorno ───
function ncBadge(x) {
  if (!x) return '';
  if (x.status === 'chiusa') return '<span class="doc-badge st-evaso">Chiusa</span>';
  if (ncScaduta(x)) return '<span class="doc-badge st-annullato">Scaduta</span>';
  return '<span class="doc-badge st-corso">Aperta</span>';
}
function ncOrigineNumero(x) {
  if (!x) return '';
  if (x.inspectionId) { const c = qcGet(x.inspectionId); if (c) return c.number; }
  if (x.source === 'produzione' && x.orderId && typeof getOdp === 'function') { const o = getOdp(x.orderId); if (o) return o.number; }
  return '';
}

// ═══════════════════════════════════════════════════════════
//  La vista
// ═══════════════════════════════════════════════════════════
let ncCurrentId = null;
let ncFiltro = { q: '', stato: 'aperta' };
function ncRidisegna() { if (typeof activeView !== 'undefined' && activeView === 'nc') renderNc(); }
function ncSearchInput() { ncFiltro.q = val('nc-search'); renderNc(); }
function ncStatoChange() { ncFiltro.stato = val('nc-stato'); renderNc(); }
function ncApri(id) { ncCurrentId = id; renderNc(); }
function ncApriDaAltrove(id) { ncCurrentId = id; setView('nc'); }
function ncChiudiScheda() { ncCurrentId = null; renderNc(); }

function ncFiltrate() {
  const q = (ncFiltro.q || '').trim().toLowerCase();
  const g = oggiISO();
  return ncTutte().filter(x => {
    if (ncFiltro.stato === 'aperta' && x.status === 'chiusa') return false;
    if (ncFiltro.stato === 'chiusa' && x.status !== 'chiusa') return false;
    if (ncFiltro.stato === 'scaduta' && !ncScaduta(x, g)) return false;
    if (!q) return true;
    const it = x.itemId ? getItem(x.itemId) : null;
    return [x.number, x.description, x.cause, ncOrigineNumero(x), it && it.code, it && it.name, supplierName(x.supplierId)]
      .some(v => String(v || '').toLowerCase().includes(q));
  }).sort((a, b) => String(b.number || '').localeCompare(String(a.number || '')));
}

function renderNc() {
  const el = document.getElementById('view-nc'); if (!el) return;
  const righe = ncFiltrate();
  const corrente = ncCurrentId ? ncGet(ncCurrentId) : null;
  const scrive = canWrite('docs');
  const nuova = scrive ? `<button class="add-btn-sm" onclick="ncNuovaModal()">${ico('plus', 'tinted', '')} Nuova non conformità</button>` : '';
  el.innerHTML = worklistHtml({
    titolo: 'Non conformità', icona: 'warning', listaId: 'nc-list', comandi: nuova,
    filtri: `<input type="text" class="search" id="nc-search" placeholder="Cerca NC, articolo, fornitore, causa…" value="${esc(ncFiltro.q)}" oninput="ncSearchInput()">
      <select id="nc-stato" onchange="ncStatoChange()">
        <option value="aperta" ${ncFiltro.stato === 'aperta' ? 'selected' : ''}>Aperte (${ncAperte().length})</option>
        <option value="scaduta" ${ncFiltro.stato === 'scaduta' ? 'selected' : ''}>Scadute (${ncScadute().length})</option>
        <option value="chiusa" ${ncFiltro.stato === 'chiusa' ? 'selected' : ''}>Chiuse</option>
        <option value="" ${ncFiltro.stato === '' ? 'selected' : ''}>Tutte</option>
      </select>`,
    righe: righe.length ? righe.map(x => {
      const it = x.itemId ? getItem(x.itemId) : null;
      return worklistRow({
        numero: x.number, badge: ncBadge(x), sel: corrente && corrente.id === x.id,
        titolo: it ? `${it.code} — ${it.name}` : (x.description || '(senza articolo)'),
        meta: `${esc(NC_ORIGINI[x.source] || '')}${x.supplierId ? ' · ' + esc(supplierName(x.supplierId)) : ''} · ${esc(NC_GRAVITA[x.gravita] || '')}${x.dueDate && x.status !== 'chiusa' ? ' · entro ' + esc(fmtDateIt(x.dueDate)) : ''}`,
        azione: `ncApri('${x.id}')`, etichetta: `Apri la non conformità ${x.number}`,
      });
    }).join('') : `<p class="empty-text">Nessuna non conformità${ncFiltro.stato === 'aperta' ? ' aperta' : ''}.</p>`,
    nota: worklistCount(righe.length, ncTutte().length, 'non conformità', 'non conformità'),
    doc: corrente ? ncSchedaHtml(corrente, scrive) : '',
    vuoto: {
      titolo: 'Non conformità',
      testo: 'Una non conformità nasce da sola quando un collaudo è <strong>respinto</strong> o <strong>accettato in deroga</strong>, oppure si apre a mano: dagli scarti di un ordine di produzione, da un reclamo, da qualcosa visto in reparto. Porta la causa, la decisione, le azioni con chi e entro quando, e il rapporto PDF da mandare al fornitore. Finché è aperta, quel fornitore si collauda al 100%.',
      comandi: nuova,
    },
  });
  a11yFields(el);
}

function ncSchedaHtml(x, scrive) {
  const aperta = x.status !== 'chiusa';
  const dis = scrive && aperta ? '' : 'disabled';
  const it = x.itemId ? getItem(x.itemId) : null;
  const set = campo => `onchange="ncSet('${x.id}','${campo}',this.value);ncRidisegna()"`;
  const dato = (etichetta, valore) => `<div class="modal-field"><label>${esc(etichetta)}</label><div class="qc-val">${valore}</div></div>`;
  const causali = ncCausali();
  const origine = ncOrigineNumero(x);
  const link = x.inspectionId
    ? `<a href="#" onclick="qcApriDaAltrove('${x.inspectionId}');return false">${esc(origine)}</a>` : esc(origine);
  const rifOrigine = origine ? ' · ' + link : '';
  const g = oggiISO();
  const azioni = (x.actions || []).map(a => `<tr class="${!a.done && a.due && a.due < g ? 'qc-row-ko' : ''}">
      <td><input type="checkbox" ${a.done ? 'checked' : ''} ${dis} onchange="ncAzioneSet('${x.id}','${a.id}','done',this.checked)" aria-label="Fatta"></td>
      <td><input value="${esc(a.text || '')}" placeholder="es. Chiedere al fornitore l'8D" ${dis} onchange="ncAzioneSet('${x.id}','${a.id}','text',this.value)" aria-label="Azione"></td>
      <td><input value="${esc(a.who || '')}" placeholder="Chi" ${dis} onchange="ncAzioneSet('${x.id}','${a.id}','who',this.value)" aria-label="Chi"></td>
      <td><input type="date" value="${esc(a.due || '')}" ${dis} onchange="ncAzioneSet('${x.id}','${a.id}','due',this.value)" aria-label="Entro"></td>
      ${scrive && aperta ? `<td><button class="mini-btn danger" onclick="ncAzioneElimina('${x.id}','${a.id}')" title="Elimina l'azione">${ico('trash', 'tinted', 'Elimina')}</button></td>` : ''}
    </tr>`).join('');
  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      <div class="bom-toolbar-left">
        ${worklistCloseBtn('ncChiudiScheda()', 'la non conformità')}
        <h2 class="section-title" style="font-family:var(--mono)">${esc(x.number)}</h2>
        ${ncBadge(x)}
      </div>
      <div class="bom-toolbar-right">
        <button class="btn-outline" onclick="ncRapportoPdf('${x.id}')" title="Il rapporto di non conformità in PDF, in italiano e inglese">${ico('file', 'tinted', '')} Rapporto PDF</button>
        ${scrive ? (aperta
    ? `<button class="add-btn-sm" onclick="ncChiudi('${x.id}')">${ico('check', 'tinted', '')} Chiudi la NC</button>`
    : `<button class="btn-outline" onclick="ncRiapri('${x.id}')">${ico('refresh', 'tinted', '')} Riapri</button>`) : ''}
        ${scrive ? `<button class="btn-outline danger" onclick="ncElimina('${x.id}')" title="Elimina (solo l'ultima della serie)">${ico('trash', 'tinted', 'Elimina')}</button>` : ''}
      </div>
    </div>
    <div class="qc-card">
      <h3>Che cosa riguarda</h3>
      <div class="modal-grid">
        ${dato('Origine', esc(NC_ORIGINI[x.source] || '—') + rifOrigine)}
        ${dato('Articolo', it ? `<span style="font-family:var(--mono)">${codeLink(it.id, it.code)}</span> ${esc(it.name)}` : '—')}
        ${dato('Fornitore', esc(supplierName(x.supplierId) || '—'))}
        <div class="modal-field"><label>Quantità coinvolta${x.uom ? ' (' + esc(x.uom) + ')' : ''}</label><input type="number" min="0" step="any" value="${Number(x.qty) || 0}" ${dis} ${set('qty')}></div>
        ${dato('Aperta il', esc(fmtDateIt(x.date)))}
      </div>
      <div class="modal-field"><label>Che cosa è successo</label><textarea rows="3" ${dis} ${set('description')}>${esc(x.description || '')}</textarea></div>
    </div>
    <div class="qc-card">
      <h3>Analisi e decisione</h3>
      <div class="modal-grid">
        <div class="modal-field"><label>Causa</label>
          <select ${dis} ${set('cause')}><option value="">— scegli —</option>
            ${causali.concat(x.cause && !causali.includes(x.cause) ? [x.cause] : []).map(c => `<option value="${esc(c)}" ${x.cause === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <div class="modal-field"><label>Gravità</label>
          <select ${dis} ${set('gravita')}>${Object.keys(NC_GRAVITA).map(k => `<option value="${k}" ${x.gravita === k ? 'selected' : ''}>${esc(NC_GRAVITA[k])}</option>`).join('')}</select></div>
        <div class="modal-field"><label>Decisione sulla merce</label>
          <select ${dis} ${set('decision')}>${Object.keys(NC_DECISIONI).map(k => `<option value="${k}" ${(x.decision || '') === k ? 'selected' : ''}>${esc(NC_DECISIONI[k])}</option>`).join('')}</select></div>
        <div class="modal-field"><label>Costo (${esc(cur())})</label><input type="number" min="0" step="any" value="${Number(x.cost) || 0}" ${dis} ${set('cost')}></div>
        <div class="modal-field"><label>Da chiudere entro</label><input type="date" value="${esc(x.dueDate || '')}" ${dis} ${set('dueDate')}></div>
      </div>
    </div>
    <div class="qc-card">
      <h3>Azioni</h3>
      ${azioni ? `<div class="table-wrap"><table class="qc-table">
        <thead><tr><th scope="col">Fatta</th><th scope="col">Azione</th><th scope="col">Chi</th><th scope="col">Entro</th>${scrive && aperta ? '<th scope="col"><span class="sr-only">Comandi</span></th>' : ''}</tr></thead>
        <tbody>${azioni}</tbody></table></div>` : '<p class="empty-text qc-hint">Nessuna azione: chi deve fare cosa, perché non si ripeta?</p>'}
      ${scrive && aperta ? `<div class="modal-actions" style="justify-content:flex-start">
        <button class="btn-outline" onclick="ncAzioneAggiungi('${x.id}')">${ico('plus', 'tinted', '')} Aggiungi un'azione</button></div>` : ''}
    </div>
    <div class="qc-card">
      <h3>Note interne</h3>
      <div class="modal-field"><label class="sr-only">Note interne</label>
        <textarea rows="3" ${dis} ${set('note')} placeholder="Non escono sul rapporto">${esc(x.note || '')}</textarea></div>
    </div>
    ${x.status === 'chiusa' ? `<p class="empty-text qc-hint">Chiusa il ${esc(fmtDateIt((x.closedAt || '').slice(0, 10)))}. Per cambiarla va riaperta.</p>` : ''}
    ${typeof docEmessiHtml === 'function' ? docEmessiHtml('nonconformity', x) : ''}
    ${stampLine(x)}
  </div>`;
}

// ─── Il rapporto ───
// Bilingue come le richieste d'offerta: va al fornitore, spesso straniero. Le
// note interne restano dentro.
function ncRapportoPdf(id, modo) {
  const x = ncGet(id); if (!x) return null;
  const jsPDF = requirePdf(); if (!jsPDF) return null;
  const it = x.itemId ? getItem(x.itemId) : null;
  const doc = new jsPDF();
  // Il QR apre la scheda rapida della NC (qualita-qr.js): le azioni si
  // spuntano da lì, con il rapporto in mano.
  if (x.number) qrPdfDraw(doc, qrLink('nc', x.number), doc.internal.pageSize.getWidth() - 14 - 22, 5, 22);
  const startY = docPdfTesta(doc, { titolo: 'Non conformità / Nonconformity report', rec: Object.assign({}, x, { title: it ? `${it.code} — ${it.name}` : '' }),
    chi: 'EMESSA DA / ISSUED BY', controparte: 'FORNITORE / SUPPLIER', vuota: '—', xControparte: 110 });
  const ins = x.inspectionId ? qcGet(x.inspectionId) : null;
  const orig = { fornitore: 'Fornitore / Supplier', produzione: 'Produzione / Production', cliente: 'Reclamo cliente / Customer complaint', interna: 'Interna / Internal' };
  const grav = { minore: 'Minore / Minor', maggiore: 'Maggiore / Major', critica: 'Critica / Critical' };
  const dec = { '': 'Da decidere / Pending', reso: 'Reso al fornitore / Return to supplier', rilavorazione: 'Rilavorazione / Rework',
    deroga: 'Uso in deroga / Use as is under concession', rottamazione: 'Rottamazione / Scrap', accettato: 'Accettato / Accepted' };
  doc.autoTable({ startY, theme: 'plain', styles: { fontSize: 9, cellPadding: 1.2 }, columnStyles: { 0: { textColor: 110, cellWidth: 60 } },
    body: [
      ['Origine / Source', orig[x.source] || '—'],
      ['Riferimento / Reference', [ncOrigineNumero(x), ins && ins.ddt ? (/^ddt\b/i.test(ins.ddt) ? ins.ddt : 'DDT ' + ins.ddt) : '', ins && ins.supplierLot ? 'Lotto / Lot ' + ins.supplierLot : ''].filter(Boolean).join(' · ') || '—'],
      ['Quantità / Quantity', `${fmtQtyIt(x.qty)} ${x.uom || ''}`.trim()],
      ['Causa / Cause', x.cause || '—'],
      ['Gravità / Severity', grav[x.gravita] || '—'],
      ['Decisione / Disposition', dec[x.decision || ''] || '—'],
      ['Da chiudere entro / Due date', x.dueDate ? fmtDateIt(x.dueDate) : '—'],
      ['Stato / Status', x.status === 'chiusa' ? `Chiusa / Closed ${x.closedAt ? fmtDateIt(x.closedAt.slice(0, 10)) : ''}`.trim() : 'Aperta / Open'],
    ] });
  doc.setTextColor(40); doc.setFontSize(9);
  let y = doc.lastAutoTable.finalY + 6;
  doc.setTextColor(110); doc.text('Descrizione / Description', 14, y);
  doc.setTextColor(40);
  const righe = doc.splitTextToSize(x.description || '—', 180);
  doc.text(righe, 14, y + 5);
  y += 5 + righe.length * 4.5 + 4;
  if ((x.actions || []).length) {
    doc.autoTable({ startY: y, styles: { fontSize: 8 }, headStyles: { fillColor: [58, 123, 232] },
      head: [['#', 'Azione\nAction', 'Chi\nOwner', 'Entro\nDue', 'Fatta\nDone']],
      body: x.actions.map((a, i) => [i + 1, a.text || '', a.who || '', a.due ? fmtDateIt(a.due) : '', a.done ? 'sì / yes' : 'no']) });
  }
  return qcPdfEmetti('nonconformity', x, doc, 'non-conformita', renderNc, modo);
}

// ─── Le impostazioni (Gestione → Qualità) ───
function renderQcSettings() {
  const s = db.settings || {};
  const v = typeof qcValutazionePesi === 'function' ? qcValutazionePesi() : null;
  return `<h3 class="settings-group-title">${ico('qr', 'tinted', '')} Collaudi</h3>
    <label class="flag-check"><input type="checkbox" id="set-qc-cartellino" ${s.qcCartellino ? 'checked' : ''}> Proponi il cartellino da stampare quando si riceve merce da collaudare</label>
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Il cartellino è l'etichetta «IN COLLAUDO» con il QR, da attaccare al bancale. Si stampa sempre anche dalla scheda del collaudo.</p>
    <h3 class="settings-group-title">${ico('warning', 'tinted', '')} Non conformità</h3>
    <div class="modal-field"><label>Causali (una per riga)</label>
      <textarea id="set-qc-causali" rows="8">${esc(ncCausali().join('\n'))}</textarea></div>
    <div class="modal-grid">
      <div class="modal-field"><label>Giorni per chiudere una NC</label><input type="number" id="set-qc-ncdays" min="1" max="365" step="1" value="${ncGiorni()}"></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Le causali sono quelle che si scelgono sulla non conformità: tenerle poche e chiare è ciò che rende confrontabili le NC di un anno. Una causale tolta dall'elenco resta sulle NC che già la portano.</p>
    ${v ? `<h3 class="settings-group-title">${ico('chart', 'tinted', '')} Valutazione fornitori</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Peso della qualità (%)</label><input type="number" id="set-qc-wq" min="0" max="100" step="1" value="${v.qualita}"></div>
      <div class="modal-field"><label>Peso della puntualità (%)</label><input type="number" id="set-qc-wp" min="0" max="100" step="1" value="${v.puntualita}"></div>
      <div class="modal-field"><label>Classe A da (punti)</label><input type="number" id="set-qc-sa" min="0" max="100" step="1" value="${v.sogliaA}"></div>
      <div class="modal-field"><label>Classe B da (punti)</label><input type="number" id="set-qc-sb" min="0" max="100" step="1" value="${v.sogliaB}"></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Il punteggio va da 0 a 100: la qualità pesa i lotti accettati (una deroga vale mezzo) e toglie le non conformità, la puntualità conta le consegne arrivate entro la data confermata. Sotto la soglia della classe B il fornitore è in classe C.</p>` : ''}`;
}
// Restituisce '' o il motivo per cui non si salva.
function readQcSettings() {
  if (!document.getElementById('set-qc-causali')) return '';
  const causali = String(document.getElementById('set-qc-causali').value || '').split('\n').map(x => x.trim()).filter(Boolean);
  const viste = new Set();
  db.settings.qcCauses = causali.filter(c => { const k = c.toLowerCase(); if (viste.has(k)) return false; viste.add(k); return true; });
  const cart = document.getElementById('set-qc-cartellino');
  if (cart) db.settings.qcCartellino = !!cart.checked;
  db.settings.qcNcDays = Math.min(365, Math.max(1, parseInt(val('set-qc-ncdays'), 10) || NC_GIORNI_SERIE));
  if (document.getElementById('set-qc-wq')) {
    const wq = numVal('set-qc-wq', 0, 100), wp = numVal('set-qc-wp', 0, 100);
    const sa = numVal('set-qc-sa', 0, 100), sb = numVal('set-qc-sb', 0, 100);
    if (wq + wp <= 0) return 'Qualità e puntualità non possono pesare zero tutte e due';
    if (sb > sa) return 'La soglia della classe B non può superare quella della classe A';
    db.settings.qcVendor = { qualita: wq, puntualita: wp, sogliaA: sa, sogliaB: sb };
  }
  return '';
}
