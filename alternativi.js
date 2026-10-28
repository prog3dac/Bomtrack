// ═══════════════════════════════════════════════════════════
//  BOMTRACK — alternativi.js (modulo Alternativi, dalla 0.118.0)
// ═══════════════════════════════════════════════════════════
// Due cose diverse, tenute separate:
//   - un **alternativo** è un articolo equivalente, che si può usare al posto
//     del principale quando il principale manca (il cuscinetto FAG al posto
//     dell'SKF). Si dichiara una volta sull'articolo, in ordine di preferenza,
//     e vale in tutte le distinte;
//   - il **sostitutivo** prende il posto di un articolo fuori produzione, per
//     sempre: `replacedById` su un articolo `obsolete`.
//
// ── Nessuna sostituzione di nascosto ──
// Il fabbisogno non scambia mai un articolo con un altro da solo. Dice che
// l'equivalente c'è, e chi pianifica decide: la decisione è una riga di
// `plan.substitutions` — «in questo piano, N di questo articolo diventano
// quell'altro» — e da lì in avanti l'alternativo è un articolo come gli altri.
// L'esplosione del piano (mrpExplode) sposta la quantità, e netto, impegni,
// date d'ordine, documenti, montaggi e ordini di produzione seguono da soli,
// perché leggono tutti l'esplosione. È la stessa regola delle commesse messe
// in produzione con materiale mancante: l'app avvisa, la persona decide.
//
// ── Cosa non cambia ──
// La distinta e la costificazione restano sul principale: è quello progettato.
// Le revisioni non vedono niente, perché una decisione di piano non è una
// modifica del prodotto.
//
// Con il modulo spento le righe restano dove sono e nessuno le legge:
// riaccendendolo tornano com'erano.

// Le alternative valgono solo su ciò che il fabbisogno compra: commerciali,
// materie prime e parti comprate già lavorate. Una parte fatta in casa ha un
// ciclo, e «usa l'altra» lì vorrebbe dire fabbricarne un'altra, che è
// un'altra decisione.
function altAmmesso(it) {
  if (!it) return false;
  if (it.type === 'acquistato' || it.type === 'materiale') return true;
  return it.type === 'parte' && partSourcing(it) === 'buy';
}
// Un equivalente deve potersi contare con la stessa unità: 1:1, niente
// conversioni. Un cuscinetto in pezzi non sostituisce una barra in metri.
function altCompatibile(it, alt) {
  return !!it && !!alt && alt.id !== it.id && altAmmesso(alt) && itemUom(alt) === itemUom(it);
}
// Gli alternativi validi di un articolo, nell'ordine di preferenza dichiarato.
// Uno eliminato nel frattempo, o diventato incompatibile, si salta.
function altDi(it) {
  if (!it || !Array.isArray(it.alternatives)) return [];
  const visti = new Set();
  return it.alternatives.map(r => ({ r, alt: getItem(r && r.itemId) }))
    .filter(x => x.alt && altCompatibile(it, x.alt) && !visti.has(x.alt.id) && visti.add(x.alt.id))
    .map(x => ({ item: x.alt, note: x.r.note || '' }));
}
// Il sostitutivo di un articolo fuori produzione, se c'è e se è utilizzabile.
function sostitutivoDi(it) {
  if (!it || !it.obsolete || !it.replacedById) return null;
  const s = getItem(it.replacedById);
  return s && !s.obsolete && s.id !== it.id ? s : null;
}
// Chi dichiara questo articolo come proprio alternativo, o come sostitutivo.
function altUsatoDa(id) {
  return (db.items || []).filter(i => i.id !== id && (
    (i.alternatives || []).some(r => r && r.itemId === id) || i.replacedById === id));
}
// Le scelte da proporre nel fabbisogno, nell'ordine: prima il sostitutivo di un
// obsoleto (è l'unico da comprare), poi gli alternativi.
function altCandidati(it) {
  const out = [];
  const s = sostitutivoDi(it);
  if (s && altCompatibile(it, s)) out.push({ item: s, note: '', sostitutivo: true });
  altDi(it).forEach(a => { if (!out.some(x => x.item.id === a.item.id)) out.push(a); });
  return out;
}

// ═══════════════════════════════════════════════════════════
//  NEL PIANO: le decisioni di sostituzione
// ═══════════════════════════════════════════════════════════
function sostituzioniPiano(planId) {
  if (!moduloAttivo('alternativi')) return [];
  const p = planId ? getPlan(planId) : null;
  return (p && p.substitutions) || [];
}
// Applicata all'esplosione, alla fine: l'accumulo degli acquisti è già per
// articolo, e spostare la quantità lì vale per tutti i rami insieme. Una
// sostituzione per più di quanto serve si ferma a quanto serve: il resto non si
// compra. Restituisce quanto ha spostato ciascuna decisione (id → quantità),
// senza scrivere niente sulle decisioni: sono record salvati, e un campo di
// calcolo lì dentro finirebbe nel database.
function mrpApplicaSostituzioni(buy, subs) {
  const fatto = new Map();
  (subs || []).forEach(s => {
    fatto.set(s.id, 0);
    const e = buy.get(s.itemId);
    const alt = getItem(s.altItemId);
    if (!e || !alt || !altAmmesso(alt) || alt.id === s.itemId) return;
    const q = Math.min(Number(s.qty) || 0, e.qty);
    if (!(q > 0)) return;
    e.qty -= q;
    e.sostituito = (e.sostituito || 0) + q;
    if (!(e.qty > 0.000001)) buy.delete(s.itemId);
    let a = buy.get(alt.id);
    if (a) { a.qty += q; a.due = primaData(a.due, e.due); a.start = primaData(a.start, e.start || e.due); }
    else { a = { item: alt, qty: q, due: e.due || '', start: e.start || e.due || '' }; buy.set(alt.id, a); }
    a.sostituisce = (a.sostituisce || []).concat([{ itemId: s.itemId, qty: q }]);
    fatto.set(s.id, q);
  });
  return fatto;
}
// Lo stato di ogni decisione di un piano, per mostrarla: quanto è stato davvero
// spostato. Una decisione che non sposta più niente (il principale non serve
// più, o un articolo è sparito) resta finché qualcuno non la toglie: sparire da
// sola vorrebbe dire cambiare un ordine senza che nessuno l'abbia deciso.
function sostituzioniStato(planId) {
  const p = getPlan(planId);
  if (!p || !moduloAttivo('alternativi')) return [];
  const subs = p.substitutions || [];
  const buy = new Map();
  mrpExplode(p.lines || [], { scaffale: mrpScaffale(planId) }).buy.forEach(e => buy.set(e.item.id, Object.assign({}, e)));
  // L'esplosione qui sopra è senza sostituzioni: si riapplicano sulla copia,
  // nello stesso ordine, per sapere quanto ciascuna sposta.
  const fatto = mrpApplicaSostituzioni(buy, subs);
  return subs.map(s => ({ sub: s, item: getItem(s.itemId), alt: getItem(s.altItemId), applicata: fatto.get(s.id) || 0 }));
}
function sostituzioneAggiungi(planId, itemId, altItemId, qty, note) {
  if (!roleGuard('docs')) return null;
  const p = getPlan(planId), it = getItem(itemId), alt = getItem(altItemId);
  if (!p || !it || !alt) return null;
  if (!altCompatibile(it, alt)) { showToast(`${alt.code} non può prendere il posto di ${it.code}: serve un articolo d'acquisto con la stessa unità (${itemUom(it)})`, 'error'); return null; }
  const q = Number(qty) || 0;
  if (!(q > 0)) { showToast('Scrivi quanti ne usi dell\'alternativo', 'error'); return null; }
  if (!Array.isArray(p.substitutions)) p.substitutions = [];
  // Una decisione per coppia: la seconda volta si corregge la quantità.
  const gia = p.substitutions.find(s => s.itemId === itemId && s.altItemId === altItemId);
  let rec;
  if (gia) { gia.qty = q; gia.note = String(note || gia.note || '').trim(); touch(gia); rec = gia; }
  else {
    rec = stampNew({ id: newId(), itemId, altItemId, qty: q, note: String(note || '').trim() });
    p.substitutions.push(rec);
  }
  touch(p);
  saveDB();
  return rec;
}
function sostituzioneTogli(planId, subId) {
  if (!roleGuard('docs')) return false;
  const p = getPlan(planId);
  if (!p || !Array.isArray(p.substitutions)) return false;
  const i = p.substitutions.findIndex(s => s.id === subId);
  if (i < 0) return false;
  p.substitutions.splice(i, 1);
  touch(p);
  saveDB();
  return true;
}

// ─── Nel montaggio e negli ordini di produzione ───
// Il fabbisogno ha comprato l'alternativo: è lui che deve uscire dal magazzino,
// non il principale, o la giacenza del principale scenderebbe per pezzi mai
// usati e quella dell'alternativo resterebbe lì per sempre. `righe` è
// [{ itemId, qty }]: la quota sostituita e non ancora prelevata dal piano passa
// all'alternativo, il resto resta al principale.
function sostituzioniPrelievo(planId, righe) {
  const subs = sostituzioniPiano(planId);
  if (!subs.length) return righe;
  const out = [];
  righe.forEach(r => {
    let resta = Number(r.qty) || 0;
    subs.filter(s => s.itemId === r.itemId).forEach(s => {
      if (!(resta > 0)) return;
      const alt = getItem(s.altItemId);
      if (!alt) return;
      const libera = Math.max(0, (Number(s.qty) || 0) - prelevatoPer(alt.id, planId));
      const q = Math.min(resta, libera);
      if (!(q > 0)) return;
      out.push(Object.assign({}, r, { itemId: alt.id, qty: q, sostituisce: r.itemId }));
      resta -= q;
    });
    if (resta > 0.000001) out.push(Object.assign({}, r, { qty: resta }));
  });
  return out;
}

// La stessa cosa sulle righe nella forma di clMaterialsOf ({ item, perPezzo,
// qty }): il materiale che parte per il terzista con un ordine di lavoro.
function sostituzioniMateriali(planId, righe) {
  if (!planId || !sostituzioniPiano(planId).length) return righe;
  const orig = new Map(righe.map(x => [x.item.id, x]));
  return sostituzioniPrelievo(planId, righe.map(x => ({ itemId: x.item.id, qty: x.qty }))).map(r => {
    const o = orig.get(r.sostituisce || r.itemId);
    return { item: getItem(r.itemId), perPezzo: o && o.qty > 0 ? o.perPezzo * r.qty / o.qty : 0, qty: r.qty, sostituisce: r.sostituisce || null };
  }).filter(x => x.item);
}

// ═══════════════════════════════════════════════════════════
//  LA SCHEDA DELL'ARTICOLO
// ═══════════════════════════════════════════════════════════
function altRidisegna() {
  if (activeView === 'buy' || activeView === 'design') renderCatalogs();
  else if (activeView === 'bom') renderBom();
  else if (activeView === 'stock') renderStock();
  else if (activeView === 'mrp') renderMrp();
  renderInspector();
}
// Il segno accanto a una riga di distinta: questo componente ha equivalenti, o
// è fuori produzione e ha un sostitutivo. Vuoto a modulo spento.
function altMarker(it) {
  if (!it || typeof moduloAttivo !== 'function' || !moduloAttivo('alternativi')) return '';
  const s = sostitutivoDi(it);
  if (s) return ` <span class="mrp-warn" title="Fuori produzione: il sostitutivo è ${esc(s.code)} ${esc(s.name)}">⇄ sostituito da ${esc(s.code)}</span>`;
  const n = altDi(it).length;
  return n ? ` <span class="price-best" title="${esc(altDi(it).map(a => a.item.code + ' ' + a.item.name).join('\n'))}">⇄ ${n}</span>` : '';
}
// Il corpo della scheda, in sola lettura: lo ospita il pannello laterale.
function altBody(id) {
  const it = getItem(id); if (!it) return '';
  const alt = altDi(it);
  const sost = it.replacedById ? getItem(it.replacedById) : null;
  const daChi = altUsatoDa(id);
  const riga = (x, extra) => `<div class="insp-multi-row">${codeLink(x.id, x.code)} <span>${esc(x.name)}</span>${extra || ''}</div>`;
  const giac = x => hasStock(x) ? ` <span class="empty-text" style="padding:0">· ${fmtUom(onHandOf(x.id), itemUom(x))}</span>` : '';
  return `${it.obsolete ? `<p style="margin:0 0 8px"><strong>Sostituito da:</strong> ${sost ? `${codeLink(sost.id, sost.code)} ${esc(sost.name)}` : '<span class="empty-text" style="padding:0">nessuno indicato</span>'}</p>` : ''}
    <p style="margin:0 0 4px"><strong>Alternativi</strong>, in ordine di preferenza</p>
    ${alt.length ? alt.map((a, i) => riga(a.item, `${giac(a.item)}${a.note ? ` <span class="empty-text" style="padding:0">— ${esc(a.note)}</span>` : ''}`)).join('') : '<p class="empty-text" style="text-align:left;padding:0 0 8px">Nessun alternativo.</p>'}
    ${daChi.length ? `<p style="margin:10px 0 4px"><strong>È l'alternativo o il sostitutivo di</strong></p>${daChi.map(x => riga(x)).join('')}` : ''}
    ${canWrite('catalog') && altAmmesso(it) ? `<div class="insp-cmds"><button class="insp-cmd" onclick="altModal('${it.id}')">${ico('edit', 'tinted', '')} Modifica alternativi${it.obsolete ? ' e sostitutivo' : ''}</button></div>` : ''}`;
}

onPanelClose('alternativi', () => { window.__altItemId = null; });
function altModal(id) {
  const it = getItem(id); if (!it) return;
  if (!altAmmesso(it)) { showToast('Gli alternativi valgono per commerciali, materie prime e parti comprate', 'error'); return; }
  window.__altItemId = id;
  openModal(`<h3>${ico('link', 'tinted pill', '')} Alternativi — ${esc(it.code)}</h3>
    <p style="color:var(--text-dim);margin-bottom:14px">${esc(it.name)} · ${esc(typeLabel(it.type))} · ${esc(itemUom(it))}</p>
    <div id="alt-body">${altModalBody(id)}</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'alternativi');
}
function altModalRefresh() {
  const host = document.getElementById('alt-body');
  if (host && window.__altItemId) host.innerHTML = altModalBody(window.__altItemId);
  altRidisegna();
}
// Le scelte possibili: stessi tipi d'acquisto, stessa unità, non già in elenco.
function altOpzioni(it, escludi) {
  const via = new Set([it.id].concat(escludi || []));
  return (db.items || []).filter(x => !via.has(x.id) && altCompatibile(it, x) && !x.obsolete)
    .sort((a, b) => String(a.code).localeCompare(String(b.code)))
    .map(x => `<option value="${x.id}">${esc(x.code)} — ${esc(x.name)}</option>`).join('');
}
function altModalBody(id) {
  const it = getItem(id); if (!it) return '';
  const scrivibile = canWrite('catalog');
  const righe = Array.isArray(it.alternatives) ? it.alternatives : [];
  const tab = righe.length ? `<div class="table-wrap"><table class="price-table"><thead><tr><th scope="col">#</th><th scope="col">Codice</th><th scope="col">Articolo</th><th scope="col">Nota</th><th scope="col"></th></tr></thead><tbody>
    ${righe.map((r, i) => {
      const a = getItem(r.itemId);
      const ok = a && altCompatibile(it, a);
      return `<tr>
        <td>${i + 1}</td>
        <td style="font-family:var(--mono)">${a ? codeLink(a.id, a.code) : '—'}</td>
        <td>${a ? esc(a.name) : '<span class="empty-text" style="padding:0">(articolo eliminato)</span>'}${a && !ok ? ` <span class="mrp-warn" title="Non si conta con la stessa unità, o non è più un articolo d'acquisto: il fabbisogno non lo propone">${ico('warning', 'tinted', '')} non utilizzabile</span>` : ''}</td>
        <td>${scrivibile ? `<input value="${esc(r.note || '')}" placeholder="es. stesse quote" onchange="altNota('${it.id}', ${i}, this.value)">` : esc(r.note || '')}</td>
        <td style="white-space:nowrap">${scrivibile ? `
          <button class="mini-btn" title="Più preferito" ${i === 0 ? 'disabled' : ''} onclick="altSposta('${it.id}', ${i}, -1)">↑</button>
          <button class="mini-btn" title="Meno preferito" ${i === righe.length - 1 ? 'disabled' : ''} onclick="altSposta('${it.id}', ${i}, 1)">↓</button>
          <button class="mini-btn" title="Togli" onclick="altTogli('${it.id}', ${i})">${ico('trash', 'tinted', 'Togli')}</button>` : ''}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`
    : '<p class="empty-text" style="text-align:left;padding:0 0 8px">Nessun alternativo. Quando il principale manca, il fabbisogno proporrà quelli che aggiungi qui, nell\'ordine.</p>';
  const opz = altOpzioni(it, righe.map(r => r.itemId));
  const aggiungi = scrivibile ? `<div class="modal-field" style="margin-top:10px"><label>Aggiungi un alternativo</label>
      <div style="display:flex;gap:8px"><select id="alt-add" class="sel-cerca" style="flex:1"><option value="">— scegli —</option>${opz}</select>
      <button class="add-btn-sm" onclick="altAggiungi('${it.id}', val('alt-add'))">Aggiungi</button></div></div>` : '';
  const sost = it.obsolete ? `<h4 style="margin:18px 0 6px">Sostitutivo</h4>
    <p class="empty-text" style="text-align:left;padding:0 0 6px">Questo articolo è segnato come non più utilizzabile. Il sostitutivo è quello che il fabbisogno propone al suo posto, e il Riepilogo segnala le distinte che lo usano ancora.</p>
    ${scrivibile ? `<select id="alt-sost" class="sel-cerca" onchange="altSostitutivo('${it.id}', this.value)"><option value="">— nessuno —</option>${
      (db.items || []).filter(x => x.id === it.replacedById || (altCompatibile(it, x) && !x.obsolete))
        .sort((a, b) => String(a.code).localeCompare(String(b.code)))
        .map(x => `<option value="${x.id}" ${x.id === it.replacedById ? 'selected' : ''}>${esc(x.code)} — ${esc(x.name)}</option>`).join('')}</select>`
      : (sostitutivoDi(it) ? `${codeLink(it.replacedById, getItem(it.replacedById).code)}` : 'nessuno')}`
    : '';
  return `${tab}${aggiungi}${sost}
    <p class="empty-text" style="text-align:left;padding:12px 0 0">Gli alternativi valgono in tutte le distinte e si contano uno a uno, con la stessa unità (${esc(itemUom(it))}). Distinta e costo restano sul principale: il fabbisogno propone l'alternativo quando il principale manca, e la scelta resta a chi pianifica.</p>`;
}
function altMuta(id, fn) {
  if (!roleGuard('catalog')) return;
  const it = getItem(id); if (!it) return;
  if (!Array.isArray(it.alternatives)) it.alternatives = [];
  if (fn(it) === false) return;
  if (!it.alternatives.length) delete it.alternatives;
  touch(it);
  saveDB();
  altModalRefresh();
}
function altAggiungi(id, altId) {
  const it = getItem(id), alt = getItem(altId);
  if (!alt) { showToast('Scegli l\'articolo da aggiungere', 'error'); return; }
  if (!altCompatibile(it, alt)) { showToast(`${alt.code} non si conta in ${itemUom(it)}: un alternativo deve avere la stessa unità`, 'error'); return; }
  altMuta(id, x => {
    if (x.alternatives.some(r => r.itemId === altId)) { showToast(`${alt.code} è già fra gli alternativi`, 'error'); return false; }
    x.alternatives.push({ itemId: altId, note: '' });
  });
}
function altTogli(id, i) { altMuta(id, x => { x.alternatives.splice(i, 1); }); }
function altSposta(id, i, d) {
  altMuta(id, x => {
    const j = i + d;
    if (j < 0 || j >= x.alternatives.length) return false;
    const [r] = x.alternatives.splice(i, 1);
    x.alternatives.splice(j, 0, r);
  });
}
function altNota(id, i, testo) { altMuta(id, x => { if (!x.alternatives[i]) return false; x.alternatives[i].note = String(testo || '').trim(); }); }
function altSostitutivo(id, sostId) {
  if (!roleGuard('catalog')) return;
  const it = getItem(id); if (!it) return;
  if (sostId) {
    const s = getItem(sostId);
    if (!s || !altCompatibile(it, s)) { showToast('Il sostitutivo deve essere un articolo d\'acquisto con la stessa unità', 'error'); return; }
    it.replacedById = sostId;
  } else delete it.replacedById;
  touch(it);
  saveDB();
  altModalRefresh();
}

// ═══════════════════════════════════════════════════════════
//  NEL FABBISOGNO: la proposta e la decisione
// ═══════════════════════════════════════════════════════════
// La proposta su una riga d'acquisto del piano: gli equivalenti con merce
// libera (esistente + in arrivo − impegnato dagli altri piani), quando la riga
// ha ancora qualcosa da comprare, o quando l'articolo è obsoleto con un
// sostitutivo — lì va proposto sempre, perché il principale non si compra più.
function altProposte(it, planId, netto) {
  if (!moduloAttivo('alternativi') || !planId || !altAmmesso(it)) return [];
  const obsoleto = !!sostitutivoDi(it);
  if (!(netto > 0.000001) && !obsoleto) return [];
  return altCandidati(it).map(c => ({ item: c.item, note: c.note, sostitutivo: !!c.sostitutivo,
    libero: altLiberoPerPiano(c.item.id, planId) }))
    .filter(c => c.sostitutivo || c.libero > 0.000001);
}
// Quanto di un equivalente questo piano può ancora prendere: il libero verso
// gli altri piani, meno quello che questo piano gli ha già assegnato con le
// sue decisioni — o il pulsante continuerebbe a offrire pezzi già presi.
function altLiberoPerPiano(altId, planId) {
  const gia = sostituzioniPiano(planId).filter(s => s.altItemId === altId).reduce((t, s) => t + (Number(s.qty) || 0), 0);
  return Math.max(0, freeStockOf(altId, planId) - gia);
}
// Il badge sulla riga, e quello che dice che una parte è già passata all'altro.
function altBadgeRiga(r) {
  if (!moduloAttivo('alternativi')) return [];
  const seg = [];
  if (r.sostituito > 0) seg.push(`<span class="price-best" title="In questo piano ${fmtUom(r.sostituito, r.uom)} sono passati a un alternativo: la quantità qui è quella che resta su questo articolo">⇄ ${fmtUom(r.sostituito, r.uom)} all'alternativo</span>`);
  (r.sostituisce || []).forEach(s => {
    const p = getItem(s.itemId);
    seg.push(`<span class="price-best" title="Usato al posto di ${esc(p ? p.code + ' ' + p.name : 'un articolo')} per ${fmtUom(s.qty, r.uom)}, per decisione presa su questo piano">⇄ al posto di ${esc(p ? p.code : '?')}</span>`);
  });
  if (r.planId && (r.alternative || []).length) {
    const a = r.alternative;
    const testo = a[0].sostitutivo ? `obsoleto: c'è ${a[0].item.code}` : `alternativo a scaffale: ${a[0].item.code}, ${fmtUom(a[0].libero, r.uom)} liberi${a.length > 1 ? ` (+${a.length - 1})` : ''}`;
    seg.push(`<button class="mini-btn mrp-warn" title="Scegli se usare un equivalente al posto di questo articolo, in questo piano" onclick="sostituzioneModal('${r.planId}','${r.item.id}')">⇄ ${esc(testo)}</button>`);
  }
  return seg;
}

onPanelClose('sostituzione', () => { window.__sostPlanId = null; window.__sostItemId = null; });
function sostituzioneModal(planId, itemId) {
  const p = getPlan(planId), it = getItem(itemId);
  if (!p || !it) return;
  window.__sostPlanId = planId;
  window.__sostItemId = itemId;
  openModal(`<h3>${ico('link', 'tinted pill', '')} Usa un alternativo — ${esc(it.code)}</h3>
    <p style="color:var(--text-dim);margin-bottom:14px">${esc(it.name)} · piano <strong>${esc(p.number || '')}</strong></p>
    <div id="sost-body">${sostituzioneBody(planId, itemId)}</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'sostituzione');
}
function sostituzioneRefresh() {
  const host = document.getElementById('sost-body');
  if (host && window.__sostPlanId) host.innerHTML = sostituzioneBody(window.__sostPlanId, window.__sostItemId);
  if (activeView === 'mrp') renderMrp();
}
function sostituzioneBody(planId, itemId) {
  const it = getItem(itemId); if (!it) return '';
  const p = getPlan(planId); if (!p) return '';
  const scrivibile = canWrite('docs');
  const u = itemUom(it);
  // Quanto il piano chiede di questo articolo prima delle decisioni, e quanto
  // ne resta da coprire: è da lì che parte la quantità proposta.
  const lordo = (mrpExplode(p.lines || [], { scaffale: mrpScaffale(planId) }).buy.find(e => e.item.id === itemId) || {}).qty || 0;
  const riga = mrpBuyRows(p, true).find(r => r.item.id === itemId);
  const netto = riga ? riga.net : 0;
  const prese = sostituzioniStato(planId).filter(s => s.sub.itemId === itemId);
  const cand = altCandidati(it);
  const gia = prese.length ? `<h4 style="margin:0 0 6px">Già deciso in questo piano</h4>
    <div class="table-wrap"><table class="price-table"><thead><tr><th scope="col">Al posto di ${esc(it.code)}</th><th scope="col" style="text-align:right">Quantità</th><th scope="col">Nota</th><th scope="col"></th></tr></thead><tbody>
    ${prese.map(s => `<tr><td>${s.alt ? `${codeLink(s.alt.id, s.alt.code)} ${esc(s.alt.name)}` : '(articolo eliminato)'}</td>
      <td style="text-align:right;font-family:var(--mono)">${fmtUom(Number(s.sub.qty) || 0, u)}${s.applicata < (Number(s.sub.qty) || 0) - 0.000001 ? `<div class="mrp-warn" title="Il piano chiede meno di così: si sposta solo quanto serve">${s.applicata > 0 ? 'ne usa ' + fmtUom(s.applicata, u) : 'non serve più'}</div>` : ''}</td>
      <td>${esc(s.sub.note || '')}</td>
      <td>${scrivibile ? `<button class="mini-btn" title="Annulla la sostituzione: torna tutto su ${esc(it.code)}" onclick="sostituzioneTogliUI('${planId}','${s.sub.id}')">${ico('trash', 'tinted', 'Annulla')} Annulla</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '';
  const proposte = cand.length ? `<h4 style="margin:14px 0 6px">Equivalenti</h4>
    <div class="table-wrap"><table class="price-table"><thead><tr><th scope="col">Articolo</th><th scope="col" style="text-align:right">Libero</th><th scope="col" style="text-align:right">Quanti ne usi</th><th scope="col"></th></tr></thead><tbody>
    ${cand.map(c => {
      const libero = altLiberoPerPiano(c.item.id, planId);
      // Proposta: il netto che manca, fin dove l'alternativo basta. Per un
      // obsoleto si propone tutto il lordo: il principale non si compra più.
      const prop = c.sostitutivo ? lordo : Math.min(netto, libero);
      const fid = 'sost-q-' + c.item.id;
      return `<tr><td>${codeLink(c.item.id, c.item.code)} ${esc(c.item.name)}${c.sostitutivo ? ' <span class="price-best">sostitutivo</span>' : ''}${c.note ? `<div class="empty-text" style="padding:0">${esc(c.note)}</div>` : ''}</td>
        <td style="text-align:right;font-family:var(--mono)">${fmtUom(libero, u)}</td>
        <td style="text-align:right">${scrivibile ? `<input id="${fid}" class="num" type="number" min="0" step="any" value="${fmtNumInput(prop)}" style="width:100px">` : ''}</td>
        <td>${scrivibile ? `<button class="add-btn-sm" onclick="sostituzioneAggiungiUI('${planId}','${itemId}','${c.item.id}', val('${fid}'))">Usa</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<p class="empty-text" style="text-align:left">Questo articolo non ha alternativi dichiarati.</p>';
  return `<p style="margin:0 0 12px">Il piano chiede <strong>${fmtUom(lordo, u)}</strong> di ${esc(it.code)}${netto > 0 ? `, e ne mancano <strong>${fmtUom(netto, u)}</strong>` : ''}.</p>
    ${gia}${proposte}
    <p class="empty-text" style="text-align:left;padding:12px 0 0">La quantità scelta passa all'alternativo in questo piano soltanto: lista d'acquisto, impegni, montaggi e ordini di produzione la leggono da qui. Distinta e costo restano su ${esc(it.code)}.</p>`;
}
function fmtNumInput(n) { const x = Math.round((Number(n) || 0) * 1000) / 1000; return x > 0 ? String(x) : '0'; }
function sostituzioneAggiungiUI(planId, itemId, altId, qty) {
  if (sostituzioneAggiungi(planId, itemId, altId, qty)) { savedToast('Sostituzione registrata nel piano'); sostituzioneRefresh(); }
}
function sostituzioneTogliUI(planId, subId) {
  if (sostituzioneTogli(planId, subId)) { savedToast('Sostituzione annullata'); sostituzioneRefresh(); }
}

// ═══════════════════════════════════════════════════════════
//  RIEPILOGO: le distinte che usano ancora un articolo fuori produzione
// ═══════════════════════════════════════════════════════════
// Solo gli obsoleti con un sostitutivo: è il caso in cui c'è qualcosa da fare,
// e si sa cosa. Un obsoleto senza sostitutivo nelle distinte è una domanda per
// il progettista che il Riepilogo non sa formulare meglio di così.
function distinteConObsoleti() {
  if (!moduloAttivo('alternativi')) return [];
  const out = [];
  (db.items || []).forEach(asm => {
    if (asm.obsolete) return;
    const righe = (asm.components || []).concat((asm.cycle || []).filter(r => r.kind !== 'op'));
    righe.forEach(r => {
      const it = getItem(r && r.itemId);
      const s = sostitutivoDi(it);
      if (s) out.push({ asm, item: it, sost: s });
    });
  });
  return out;
}
