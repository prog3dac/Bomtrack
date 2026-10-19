// ═══════════════════════════════════════════════════════════
//  BOMTRACK — inventario.js (inventario guidato, dalla 0.101.0)
// ═══════════════════════════════════════════════════════════
// Contare il magazzino un articolo dopo l'altro: si sceglie cosa contare (gli
// articoli elencati, un'ubicazione, tutto), l'app li mette in fila nell'ordine
// degli scaffali, e per ognuno si scrive quanti ce ne sono. Un QR letto —
// fotocamera, pistola USB o codice scritto — porta all'articolo o
// all'ubicazione giusta anche fuori dalla fila. Alla fine un riepilogo mostra
// solo le differenze, e «Registra» le scrive come **rettifiche d'inventario**.
//
// ── Cosa NON fa ──
// Contare non tocca il magazzino: finché non si registra non cambia niente, e
// si può chiudere, riprendere, ricontare. Il conteggio in corso resta in
// questo browser (come una bozza), non nel database: è il lavoro di una
// persona con un telefono in mano, e un altro dispositivo non ne sa niente.
//
// ── La differenza si calcola alla fine ──
// La rettifica scrive *contato − esistente al momento della registrazione*.
// Se fra il conteggio e la registrazione qualcosa entra o esce, quel
// movimento finisce nella differenza: si registra a fine giro, non il giorno
// dopo.

const INV_KEY = 'bomtrack_inventario';
let _inv = null;           // { titolo, ids, conteggi: { id: qty }, pos, mostra, creato }
let _invUltimaLettura = { testo: '', t: 0 };

function invSalva() {
  try { if (_inv) localStorage.setItem(INV_KEY, JSON.stringify(_inv)); } catch (e) { /* resta in memoria */ }
}
function invCarica() {
  try {
    const v = JSON.parse(localStorage.getItem(INV_KEY) || 'null');
    if (v && Array.isArray(v.ids)) {
      v.ids = v.ids.filter(id => hasStock(getItem(id)));
      v.conteggi = v.conteggi && typeof v.conteggi === 'object' ? v.conteggi : {};
      Object.keys(v.conteggi).forEach(id => { if (!v.ids.includes(id)) delete v.conteggi[id]; });
      v.pos = Math.max(0, Math.min(v.ids.length - 1, Number(v.pos) || 0));
      return v.ids.length ? v : null;
    }
  } catch (e) { /* bozza illeggibile: si riparte */ }
  return null;
}
function invCancella() {
  _inv = null;
  try { localStorage.removeItem(INV_KEY); } catch (e) { /* niente da togliere */ }
}
function invContati(s) { return Object.keys((s || _inv || {}).conteggi || {}).length; }

// Gli articoli da contare, nell'ordine in cui si cammina fra gli scaffali.
// ambito: 'elenco' (quelli che il Magazzino mostra adesso), 'ubi', 'tutto'.
function invElenco(ambito, ubi) {
  let rows;
  if (ambito === 'ubi') rows = articoliInUbicazione(ubi);
  else if (ambito === 'elenco') rows = stockFilteredRows();
  else rows = (db.items || []).filter(hasStock);
  return rows.filter(i => !i.obsolete || onHandOf(i.id) !== 0).slice().sort(ordinePerUbicazione).map(i => i.id);
}

// ─── Si comincia ───
function inventarioModal() {
  if (!roleGuardShop('catalog')) return;
  const bozza = invCarica();
  const nElenco = invElenco('elenco').length;
  const ubi = ubicazioniElenco();
  const riprendi = bozza ? `<div class="rfq-warn" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <span style="flex:1">C'è un inventario in corso: <strong>${esc(bozza.titolo)}</strong>, ${invContati(bozza)} contati su ${bozza.ids.length}.</span>
      <button class="add-btn-sm" onclick="inventarioRiprendi()">Riprendi</button>
    </div>` : '';
  openModal(`<h3>${ico('clipboard', 'tinted pill', '')} Inventario</h3>
    ${riprendi}
    <p class="empty-text" style="text-align:left;padding:4px 0 8px">Gli articoli vengono in fila nell'ordine delle ubicazioni. Per ognuno scrivi quanti ne conti; un QR letto porta all'articolo o all'ubicazione giusta. Il magazzino non cambia finché non registri le differenze, alla fine.</p>
    <div class="modal-field"><label>Cosa conti</label>
      <select id="inv-ambito" onchange="document.getElementById('inv-ubi-box').style.display = this.value === 'ubi' ? '' : 'none'">
        <option value="elenco">Gli articoli elencati in Magazzino (${nElenco})</option>
        ${ubi.length ? '<option value="ubi">Un\'ubicazione</option>' : ''}
        <option value="tutto">Tutto il magazzino (${(db.items || []).filter(hasStock).length})</option>
      </select></div>
    <div class="modal-field" id="inv-ubi-box" style="display:none"><label>Ubicazione</label>
      <select id="inv-ubi">${ubi.map(u => `<option value="${esc(u)}">${esc(u)} (${articoliInUbicazione(u).length})</option>`).join('')}</select></div>
    <label class="flag-check" style="margin:6px 0"><input type="checkbox" id="inv-mostra"> Mostra l'esistente mentre conto</label>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Senza, si conta senza sapere cosa aspettarsi: è il modo di non farsi guidare dal numero.</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="inventarioAvvia({ ambito: val('inv-ambito'), ubi: val('inv-ubi'), mostra: !!(document.getElementById('inv-mostra') || {}).checked })">${bozza ? 'Ricomincia da capo' : 'Inizia'}</button>
    </div>`, false, 'form');
}
// Da qui parte anche la scheda di un'ubicazione letta col QR.
function inventarioAvvia(opz) {
  if (!roleGuardShop('catalog')) return false;
  const o = opz || {};
  const ambito = ['elenco', 'ubi', 'tutto'].includes(o.ambito) ? o.ambito : 'tutto';
  const ubi = ubicazioneNorm(o.ubi);
  const ids = invElenco(ambito, ubi);
  if (!ids.length) { showToast('Niente da contare con questa scelta', 'error'); return false; }
  const titolo = ambito === 'ubi' ? 'Ubicazione ' + ubi : ambito === 'tutto' ? 'Tutto il magazzino' : 'Articoli elencati';
  _inv = { titolo, ids, conteggi: {}, pos: 0, mostra: !!o.mostra, creato: oggiISO() };
  invSalva();
  invContaModal();
  return true;
}
// Dal QR di uno scaffale (dalla 0.105.3): con un inventario in corso si
// chiede prima. Contare gli scaffali è proprio quello che si fa durante un
// inventario, e partire da capo senza dirlo buttava via tutti i conteggi.
function inventarioAvviaDaQr(opz) {
  const bozza = invCarica();
  const n = invContati(bozza);
  if (!bozza || !n) return inventarioAvvia(opz);
  askConfirm(`C'è un inventario in corso («${bozza.titolo}», ${n} ${n === 1 ? 'articolo contato' : 'articoli contati'}).\nRicominciare da capo con questa ubicazione? I conteggi fatti si perdono.`,
    () => inventarioAvvia(opz), { title: 'Inventario in corso', ok: 'Ricomincia da capo' });
  return false;
}
function inventarioRiprendi() {
  _inv = invCarica();
  if (!_inv) { showToast('Nessun inventario da riprendere', 'error'); return; }
  invContaModal();
}

// ─── Si conta ───
// La finestra si disegna una volta; poi cambiano solo i riquadri dentro, così
// la fotocamera accesa non si spegne a ogni articolo.
function invContaModal() {
  if (!_inv) return;
  openModal(`<h3>${ico('clipboard', 'tinted pill', '')} Inventario — ${esc(_inv.titolo)}</h3>
    <div class="inv-barra"><span id="inv-prog" class="empty-text" style="padding:0;flex:1;text-align:left"></span>
      <button class="btn-outline" id="inv-cam-btn" onclick="invCamera()">${ico('qr', 'tinted', '')} Fotocamera</button></div>
    <div class="qr-video-box inv-video" id="inv-video-box" style="display:none"><video id="qr-video" playsinline muted></video></div>
    <p class="empty-text" id="qr-scan-msg" style="text-align:left;padding:4px 0;display:none"></p>
    <div class="modal-field"><label>Leggi un'etichetta o scrivi un codice</label>
      <input id="inv-scan" autocomplete="off" placeholder="Codice articolo o ubicazione"
        onkeydown="if(event.key==='Enter'){event.preventDefault();invLetto(this.value)}"></div>
    <div id="inv-corrente" class="inv-corrente"></div>
    <div id="inv-lista" class="inv-lista"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="invChiudi()">Chiudi e continua dopo</button>
      <button class="add-btn-sm" onclick="invRiepilogoModal()">${ico('check', '', '')} Riepilogo differenze</button>
    </div>`, true, 'form');
  invDisegna();
}
function invDisegna(senzaFuoco) {
  if (!_inv) return;
  const prog = document.getElementById('inv-prog');
  if (prog) prog.textContent = `${invContati()} contati su ${_inv.ids.length}`;
  const cur = document.getElementById('inv-corrente');
  const it = getItem(_inv.ids[_inv.pos]);
  if (cur && it) {
    const u = itemUom(it), ub = ubicazioneOf(it);
    const gia = _inv.conteggi[it.id];
    cur.innerHTML = `<div class="inv-art">
        <div><span style="font-family:var(--mono);font-weight:700">${esc(it.code)}</span>${ub ? ` · ${ico('pin', 'tinted', '')} <span style="font-family:var(--mono)">${esc(ub)}</span>` : ''}</div>
        <div>${esc(it.name || '')}</div>
        ${_inv.mostra ? `<div class="empty-text" style="padding:0;text-align:left">Esistente per l'app: ${fmtUom(onHandOf(it.id), u)}</div>` : ''}
      </div>
      <div class="inv-qty">
        <input id="inv-qty" class="num" type="number" inputmode="decimal" min="0" step="any" value="${gia != null ? gia : ''}" aria-label="Quanti ne conti"
          onkeydown="if(event.key==='Enter'){event.preventDefault();invConferma()}">
        <span>${esc(u)}</span>
        <button class="btn-outline" onclick="invSalta()">Salta</button>
        <button class="add-btn-sm" onclick="invConferma()">${ico('check', '', '')} Conta</button>
      </div>`;
  }
  const lista = document.getElementById('inv-lista');
  if (lista) {
    lista.innerHTML = _inv.ids.map((id, i) => {
      const a = getItem(id); if (!a) return '';
      const c = _inv.conteggi[id];
      return `<div class="mgmt-item inv-riga${i === _inv.pos ? ' inv-attuale' : ''}" ${clickAttrs(`invVai(${i})`, 'Conta ' + a.code)}>
        <span style="width:90px;font-family:var(--mono);color:var(--text-dim)">${esc(ubicazioneOf(a) || '—')}</span>
        <span style="width:150px;font-family:var(--mono)">${esc(a.code)}</span>
        <span style="flex:1">${esc(a.name || '')}</span>
        <span class="num">${c != null ? fmtUom(c, itemUom(a)) : '<span class="empty-text" style="padding:0">da contare</span>'}</span>
      </div>`;
    }).join('');
    const att = lista.querySelector && lista.querySelector('.inv-attuale');
    if (att && att.scrollIntoView) att.scrollIntoView({ block: 'nearest' });
  }
  if (!senzaFuoco) { const q = document.getElementById('inv-qty'); if (q && q.focus) q.focus(); }
}
// Il prossimo da contare dopo `da`, girando in fondo; -1 se sono tutti contati.
function invProssimo(da) {
  const n = _inv.ids.length;
  for (let k = 1; k <= n; k++) {
    const i = (da + k) % n;
    if (_inv.conteggi[_inv.ids[i]] == null) return i;
  }
  return -1;
}
// Scrive il conteggio dell'articolo corrente. Un campo vuoto non è uno zero:
// «non ce n'è nessuno» si scrive 0.
function invConta(qty) {
  if (!_inv) return false;
  const q = typeof qty === 'string' ? (qty.trim() === '' ? NaN : parseFloat(qty.replace(',', '.'))) : Number(qty);
  if (!isFinite(q)) { showToast('Scrivi quanti ne conti: 0 se non ce n\'è nessuno', 'error'); return false; }
  if (q < 0) { showToast('Una quantità contata non è negativa', 'error'); return false; }
  _inv.conteggi[_inv.ids[_inv.pos]] = q;
  const dopo = invProssimo(_inv.pos);
  if (dopo < 0) showToast('Contati tutti: apri il riepilogo delle differenze');
  else _inv.pos = dopo;
  invSalva();
  return true;
}
function invConferma() {
  const el = document.getElementById('inv-qty');
  if (invConta(el ? String(el.value) : '')) invDisegna();
}
function invSalta() {
  if (!_inv) return;
  const dopo = invProssimo(_inv.pos);
  _inv.pos = dopo < 0 ? (_inv.pos + 1) % _inv.ids.length : dopo;
  invSalva(); invDisegna();
}
function invVai(i) {
  if (!_inv || i < 0 || i >= _inv.ids.length) return;
  _inv.pos = i; invSalva(); invDisegna();
}
// Un QR o un codice: l'articolo (aggiunto alla fila se non c'era) o la prima
// cosa da contare in quell'ubicazione.
function invLetto(testo) {
  if (!_inv) return false;
  const campo = document.getElementById('inv-scan');
  const letto = qrParse(testo);
  const r = letto && qrResolve(letto.tipo === 'art' || letto.tipo === 'ubi' ? letto.tipo : '', letto.codice);
  if (!r || (r.tipo !== 'art' && r.tipo !== 'ubi')) {
    showToast(`«${String(testo || '').trim().slice(0, 60)}»: non è un articolo né un'ubicazione`, 'error');
    return false;
  }
  if (campo) campo.value = '';
  if (r.tipo === 'art') {
    if (!hasStock(r.rec)) { showToast(`${r.rec.code}: non si tiene a magazzino`, 'error'); return false; }
    let i = _inv.ids.indexOf(r.rec.id);
    if (i < 0) { _inv.ids.push(r.rec.id); i = _inv.ids.length - 1; showToast(`${r.rec.code} aggiunto all'inventario`); }
    _inv.pos = i;
  } else {
    const suoi = r.rec.items.map(x => x.id);
    suoi.forEach(id => { if (!_inv.ids.includes(id)) _inv.ids.push(id); });
    const i = _inv.ids.findIndex(id => suoi.includes(id) && _inv.conteggi[id] == null);
    _inv.pos = i >= 0 ? i : _inv.ids.indexOf(suoi[0]);
    showToast(`Ubicazione ${r.rec.code}: ${suoi.length === 1 ? '1 articolo' : suoi.length + ' articoli'}`);
  }
  invSalva(); invDisegna();
  return true;
}
// Dalla fotocamera la stessa etichetta arriva più volte al secondo: si prende
// una volta, e la fotocamera resta accesa per la prossima.
function invLettoDaCamera(testo) {
  const ora = Date.now();
  if (testo === _invUltimaLettura.testo && ora - _invUltimaLettura.t < 2500) return false;
  _invUltimaLettura = { testo, t: ora };
  invLetto(testo);
  return false;
}
function invCamera() {
  const box = document.getElementById('inv-video-box');
  const msg = document.getElementById('qr-scan-msg');
  if (!box) return;
  if (box.style.display !== 'none') { qrScanStop(); box.style.display = 'none'; if (msg) msg.style.display = 'none'; return; }
  box.style.display = ''; if (msg) { msg.style.display = ''; msg.textContent = 'Inquadra l\'etichetta dell\'articolo o dello scaffale.'; }
  qrScanAvvia(invLettoDaCamera);
}
function invChiudi() {
  qrScanStop();
  closeModal();
  if (_inv && invContati()) showToast(`Inventario lasciato a metà: ${invContati()} contati. Riprendilo da Magazzino › Inventario`);
}

// ─── Il riepilogo ───
// Le righe contate con la differenza calcolata adesso. Le differenze nulle si
// vedono ma non si registrano: una rettifica a zero non è un movimento.
function invDifferenze(s) {
  const sess = s || _inv;
  if (!sess) return [];
  return sess.ids.filter(id => sess.conteggi[id] != null).map(id => {
    const it = getItem(id);
    const esistente = onHandOf(id), contato = Number(sess.conteggi[id]) || 0;
    return { it, esistente, contato, diff: +(contato - esistente).toFixed(6), valore: (contato - esistente) * (Number(it && it.unitCost) || 0) };
  }).filter(r => r.it);
}
function invRiepilogoModal() {
  if (!_inv) return;
  qrScanStop();
  const righe = invDifferenze();
  const diverse = righe.filter(r => r.diff !== 0);
  const nonContati = _inv.ids.length - righe.length;
  const valore = diverse.reduce((a, r) => a + r.valore, 0);
  const tabella = righe.length ? `<div class="table-wrap" style="max-height:45vh;overflow:auto"><table class="dash-table">
      <thead><tr><th></th><th>Codice</th><th>Descrizione</th><th>Ubicazione</th><th class="num">Esistente</th><th class="num">Contato</th><th class="num">Differenza</th></tr></thead>
      <tbody>${righe.map((r, i) => `<tr>
        <td>${r.diff !== 0 ? `<input type="checkbox" id="inv-ok-${i}" checked aria-label="Registra ${esc(r.it.code)}">` : ''}</td>
        <td style="font-family:var(--mono)">${esc(r.it.code)}</td><td>${esc(r.it.name || '')}</td>
        <td style="font-family:var(--mono)">${esc(ubicazioneOf(r.it) || '—')}</td>
        <td class="num">${fmtQtyIt(r.esistente)}</td><td class="num">${fmtQtyIt(r.contato)}</td>
        <td class="num" style="color:${r.diff < 0 ? 'var(--red)' : r.diff > 0 ? 'var(--green)' : 'var(--text-dim)'}">${r.diff > 0 ? '+' : ''}${fmtQtyIt(r.diff)}${uomSuffix(itemUom(r.it))}</td>
      </tr>`).join('')}</tbody></table></div>` : '<p class="empty-text">Nessun articolo contato.</p>';
  openModal(`<h3>${ico('clipboard', 'tinted pill', '')} Riepilogo inventario — ${esc(_inv.titolo)}</h3>
    <div class="cost-summary" style="margin:8px 0">
      ${kpi('Contati', String(righe.length), '')}
      ${kpi('Con differenza', String(diverse.length), diverse.length ? 'orange' : '')}
      ${kpi('Non contati', String(nonContati), nonContati ? 'accent' : '')}
      ${kpi(`Valore differenze (${esc(cur())})`, fmtN(valore), valore < 0 ? 'red' : '')}
    </div>
    ${tabella}
    ${nonContati ? `<p class="empty-text" style="text-align:left;padding:6px 0">Gli articoli non contati restano come sono: nessuna rettifica.</p>` : ''}
    <div class="modal-field"><label>Nota delle rettifiche</label>
      <input id="inv-nota" autocomplete="off" value="${esc('Inventario del ' + fmtDateIt(oggiISO()) + ' — ' + _inv.titolo)}"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="invContaModal()">Torna a contare</button>
      <button class="btn-outline" onclick="askConfirm('Buttare via questo inventario? I conteggi si perdono, il magazzino resta com\\'è.', () => { invCancella(); closeModal(); showToast('Inventario annullato'); })">Annulla l'inventario</button>
      <button class="add-btn-sm" onclick="invRegistraDaModal()">${ico('check', '', '')} Registra ${diverse.length === 1 ? '1 rettifica' : diverse.length + ' rettifiche'}</button>
    </div>`, true, 'form');
}
// Scrive le rettifiche e chiude l'inventario. `scelti`: gli id da registrare
// (tutti quelli con differenza se manca). Torna quante ne ha scritte.
function invRegistra(scelti, nota) {
  if (!roleGuardShop('catalog') || !_inv) return 0;
  const righe = invDifferenze().filter(r => r.diff !== 0 && (!scelti || scelti.includes(r.it.id)));
  let n = 0;
  righe.forEach(r => {
    // Si ricalcola sull'esistente del momento, non su quello del riepilogo.
    const delta = r.contato - onHandOf(r.it.id);
    if (delta && addMovement(r.it.id, 'rettifica', delta, nota || ('Inventario del ' + fmtDateIt(oggiISO())))) n++;
  });
  invCancella();
  return n;
}
function invRegistraDaModal() {
  // La guardia prima di tutto: un rifiuto (ruolo, senza collegamento) chiudeva
  // la finestra con «Inventario chiuso: nessuna differenza», e i conteggi
  // restavano lì senza che nessuno lo sapesse.
  if (!_inv || !roleGuardShop('catalog')) return;
  const righe = invDifferenze();
  const scelti = righe.map((r, i) => {
    const el = document.getElementById('inv-ok-' + i);
    return r.diff !== 0 && el && el.checked ? r.it.id : null;
  }).filter(Boolean);
  const nota = val('inv-nota');
  // Le differenze si calcolano sull'esistente aggiornato ai movimenti dei
  // colleghi (dalla 0.105.4): con l'archivio condiviso, prima si riceve.
  const registra = () => invRegistraEChiudi(scelti, nota);
  return typeof conArchivioAggiornato === 'function' ? conArchivioAggiornato(registra) : registra();
}
function invRegistraEChiudi(scelti, nota) {
  if (!_inv) return;
  const n = invRegistra(scelti, nota);
  closeModal();
  if (typeof activeView !== 'undefined' && activeView === 'stock' && typeof renderStock === 'function') renderStock();
  showToast(n ? (n === 1 ? '1 rettifica registrata' : n + ' rettifiche registrate') : 'Inventario chiuso: nessuna differenza da registrare');
}
