// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-rev.js
// ═══════════════════════════════════════════════════════════
// Revisioni della distinta base: rilascio, storico e confronto.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
//
// ── Il problema ──
// Fino alla 0.24.0 modificare una distinta riscriveva il passato. Un costo
// calcolato tre mesi fa non era più riproducibile, e un ordine emesso su una
// distinta poi cambiata non era più giustificabile: restava il documento, ma
// non ciò su cui era stato deciso. In meccanica è la mancanza che si sente di
// più, ed è l'unica che peggiora da sola — più dati si accumulano senza
// storico, più costa introdurlo.
//
// ── Il modello, e perché questo e non l'altro ──
// La strada ovvia sarebbe: una distinta rilasciata si blocca, e per modificarla
// bisogna aprire una revisione nuova. Blocca però il lavoro di tutti i giorni
// per un beneficio che si vede una volta ogni tanto, e chi lavora impara a
// evitarla.
//
// Qui il verso è opposto: **quella su cui si lavora è sempre modificabile, e
// rilasciare significa metterne da parte una copia congelata**. La revisione
// rilasciata è immutabile perché è una fotografia, non perché un lucchetto lo
// impedisce — e una fotografia nessuno la modifica per sbaglio.
// Rilasciata la A, la distinta viva diventa la B e si continua a lavorare.

// Revisione in lavorazione. Gli articoli già a catalogo non hanno il campo:
// valgono A, senza bisogno di riscrivere il database.
function itemRev(it) { return (it && it.rev) || 'A'; }
// A → B … Z → AA → AB. Le lettere bastano per anni; quando finiscono, si
// continua a contare invece di fermarsi.
function nextRev(letter) {
  const s = String(letter || 'A').toUpperCase();
  const chars = s.split('');
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] !== 'Z') { chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1); return chars.join(''); }
    chars[i] = 'A'; i--;
  }
  return 'A' + chars.join('');
}
// Solo ciò che ha una distinta: un commerciale non ha revisioni di distinta,
// ha un prezzo.
function hasRevisions(it) { return !!it && (isAssembly(it.type) || it.type === 'parte'); }

// Dalla più recente. Due rilasci nello stesso millisecondo hanno la stessa
// data — succede nei test e succederebbe a chi rilascia due articoli di fila:
// a parità vince l'ordine di inserimento, che è quello vero.
function revisionsOf(itemId) {
  return (db.revisions || [])
    .map((r, i) => ({ r, i }))
    .filter(x => x.r.itemId === itemId)
    .sort((a, b) => {
      const c = String(b.r.date || '').localeCompare(String(a.r.date || ''));
      return c !== 0 ? c : b.i - a.i;
    })
    .map(x => x.r);
}
function getRevision(id) { return (db.revisions || []).find(r => r.id === id); }

// La fotografia. Si copia in profondità: se restassero riferimenti agli array
// vivi, modificare la distinta domani cambierebbe la revisione di ieri — cioè
// esattamente il difetto che si sta risolvendo.
function revSnapshot(it) {
  const c = costOf(it.id);
  return {
    code: it.code, name: it.name, type: it.type, uom: it.uom || '',
    sourcing: it.sourcing || null,
    components: JSON.parse(JSON.stringify(it.components || [])),
    operations: JSON.parse(JSON.stringify(it.operations || [])),
    cycle: JSON.parse(JSON.stringify(it.cycle || [])),
    // Il costo del giorno del rilascio: senza, la revisione direbbe *cosa* c'era
    // ma non *quanto* costava, e i prezzi di allora non tornano più.
    cost: { material: c.material, purchased: c.purchased, labor: c.labor,
      parts: c.parts, overhead: c.overhead, total: c.total },
  };
}

// Rilascia la revisione in lavorazione e ne apre la successiva.
// Ritorna il record creato, o null se non c'era niente da rilasciare.
// `eco` (facoltativo): { tipo } — il tipo di modifica tecnica. Il numero
// MT-… e l'impatto sui documenti aperti li calcola il rilascio stesso: sono un
// fatto del momento, e chi chiama non deve poterli scrivere diversi.
function releaseRevision(itemId, motivo, eco) {
  // La guardia sta nel mutatore, non solo nei chiamanti: la funzione è globale
  // e chiunque la raggiunga deve passare dallo stesso controllo.
  if (!roleGuard('bom')) return null;
  const it = getItem(itemId);
  if (!it || !hasRevisions(it)) return null;
  const rev = itemRev(it);
  const snapshot = revSnapshot(it);
  const ultima = revisionsOf(it.id)[0];
  const rec = {
    id: gid(), itemId, rev,
    date: nowISO(),
    motivo: String(motivo || '').trim(),
    snapshot,
    ecoNumber: nextEcoNumber(),
    ecoKind: ECO_TIPI[eco && eco.tipo] ? eco.tipo : '',
    ecoImpact: ecoImpatto(it.id, ultima ? revDiff(ultima.snapshot, snapshot) : null),
  };
  // Prima si avanza l'articolo, poi si inserisce: Store.insert salva una volta
  // sola e porta con sé entrambe le modifiche. Passa da lì anche perché crea la
  // collezione se manca — su un database precedente alla 0.25.0 non c'è.
  it.rev = nextRev(rev);
  touch(it);
  Store.insert('revisions', rec);
  return rec;
}

// ═══ Modifiche tecniche ═══
// Una revisione diceva *che cosa* era cambiato e, se qualcuno lo scriveva,
// *perché*. Mancavano le due domande che si fanno il giorno dopo: che modifica
// era (un errore da correggere o un miglioramento? chiesto dal cliente?) e
// **cosa c'era già in giro** costruito sulla versione vecchia — piani aperti,
// ordini di produzione lanciati, ordini a fornitore di un componente tolto.
//
// Il rilascio diventa quindi una modifica tecnica numerata (MT-AAAA-NNN), col
// suo tipo e la fotografia dei documenti aperti toccati. La fotografia è del
// momento del rilascio: fra un mese quei documenti saranno chiusi, e la domanda
// «chi ha costruito sulla B?» deve avere ancora una risposta.
const ECO_TIPI = {
  correttiva: 'Correttiva — corregge un errore',
  migliorativa: 'Migliorativa',
  cliente: 'Richiesta del cliente',
  fornitore: 'Cambio di fornitore o componente',
  costo: 'Riduzione dei costi',
};
function nextEcoNumber() { return numeroProgressivo('MT'); }
// L'articolo e tutto ciò che lo contiene, a qualunque livello: un piano aperto
// sulla macchina è toccato da una modifica a una sua vite.
function ecoAntenati(itemId) {
  const visti = new Set([itemId]);
  const coda = [itemId];
  const idx = parentIndex();
  while (coda.length) {
    (idx.get(coda.shift()) || []).forEach(p => { if (!visti.has(p.id)) { visti.add(p.id); coda.push(p.id); } });
  }
  return visti;
}
// I documenti **aperti** costruiti sulla versione che si sta lasciando:
//   - piani di fabbisogno e ordini di produzione dell'articolo o di chi lo
//     contiene (si costruisce con la distinta vecchia);
//   - richieste e ordini a fornitore, e ordini di lavoro, dei componenti che
//     la modifica aggiunge, toglie o cambia (si compra per la distinta vecchia).
// [{ k, id, number, perche }]
function ecoImpatto(itemId, diff) {
  const sopra = ecoAntenati(itemId);
  const toccati = new Set([itemId]);
  if (diff) [].concat(diff.aggiunte, diff.rimosse, diff.cambiate).forEach(r => {
    const m = /^[ic]:(.+)$/.exec(r.chiave || '');
    if (m && getItem(m[1])) toccati.add(m[1]);
  });
  const out = [];
  const nome = id => { const i = getItem(id); return i ? i.code || i.name : ''; };
  (db.plans || []).forEach(p => {
    if (p.active === false) return;
    const l = (p.lines || []).find(x => sopra.has(x.itemId));
    if (l) out.push({ k: 'plan', id: p.id, number: p.number || '', perche: 'piano aperto su ' + nome(l.itemId) });
  });
  (db.prodOrders || []).forEach(o => {
    if (['completato', 'chiuso', 'annullato'].includes(o.status)) return;
    if (sopra.has(o.itemId)) out.push({ k: 'odp', id: o.id, number: o.number || '', perche: 'ordine di produzione ' + (o.status || '') + ' di ' + nome(o.itemId) });
  });
  const righe = (k, docs, chiusi) => (docs || []).forEach(d => {
    if (chiusi.includes(d.status) || d.active === false) return;
    const l = (d.lines || []).find(x => x.itemId && toccati.has(x.itemId));
    if (l) out.push({ k, id: d.id, number: d.number || '', perche: (d.status || '') + ', con ' + nome(l.itemId) });
  });
  righe('rfq', db.rfqs, ['chiusa']);
  righe('order', db.orders, ['evaso', 'annullato']);
  righe('odl', db.workOrders, ['evaso', 'annullato']);
  return out;
}
const ECO_DOC = { plan: 'Piano', odp: 'ODP', rfq: 'Richiesta', order: 'Ordine', odl: 'ODL' };
function ecoApri(k, id) {
  closeModal();
  if (k === 'plan') { setView('mrp'); openPlanEdit(id); }
  else if (k === 'odp') { setView('odp'); openOdpEdit(id); }
  else if (k === 'rfq') { setView('rfq'); openRfqEdit(id); }
  else if (k === 'order') { setView('orders'); openOrderEdit(id); }
  else if (k === 'odl') { setView('odl'); openOdlEdit(id); }
}
function ecoImpattoHtml(lista, vivo) {
  if (!lista || !lista.length) return `<p class="empty-text" style="text-align:left;padding:0">${vivo ? 'Nessun documento aperto è costruito sulla versione attuale.' : 'Nessun documento aperto era toccato.'}</p>`;
  return `<ul class="storico-campi">${lista.map(d => {
    const esiste = { plan: getPlan, odp: getOdp, rfq: getRfq, order: getOrder, odl: getOdl }[d.k];
    const vivoDoc = typeof esiste === 'function' && esiste(d.id);
    const n = `${esc(ECO_DOC[d.k] || d.k)} ${esc(d.number)}`;
    return `<li>${vivoDoc ? `<a href="#" onclick="ecoApri(${jsAttr(d.k)},${jsAttr(d.id)});return false">${n}</a>` : n} <span class="storico-prima">— ${esc(d.perche)}</span></li>`;
  }).join('')}</ul>`;
}
function ecoTipoLabel(k) { return ECO_TIPI[k] ? ECO_TIPI[k].split(' — ')[0] : ''; }
// Tutte le modifiche tecniche, di tutti gli articoli, dalla più recente.
function ecoRegistro() {
  return (db.revisions || []).map((r, i) => ({ r, i }))
    .sort((a, b) => String(b.r.date || '').localeCompare(String(a.r.date || '')) || b.i - a.i)
    .map(x => x.r);
}
function ecoRegistroModal() {
  const lista = ecoRegistro();
  const corpo = lista.length ? lista.map(r => {
    const it = getItem(r.itemId);
    return `<div class="mgmt-item" style="display:block">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <strong style="font-family:var(--mono)">${esc(r.ecoNumber || '—')}</strong>
        ${it ? codeLink(it.id, it.code) : '<span class="empty-text" style="padding:0">(articolo eliminato)</span>'}
        <span>Rev. ${esc(r.rev)}</span>
        ${r.ecoKind ? `<span class="doc-badge">${esc(ecoTipoLabel(r.ecoKind))}</span>` : ''}
        <span style="flex:1"></span>
        <span class="empty-text" style="padding:0">${esc(fmtDateIt(r.date))} · ${esc(r.createdBy ? actorName(r.createdBy) : '—')}</span>
        ${it ? `<button class="btn-ghost" onclick="revCompareModal('${r.id}')">⇄ Confronta</button>` : ''}
      </div>
      ${r.motivo ? `<div style="margin-top:4px">${esc(r.motivo)}</div>` : ''}
      ${(r.ecoImpact || []).length ? `<div style="margin-top:4px"><span class="storico-campo">Documenti aperti al rilascio</span>${ecoImpattoHtml(r.ecoImpact)}</div>` : ''}
    </div>`;
  }).join('') : '<div class="empty-text">Nessuna modifica tecnica: si registrano rilasciando una revisione di distinta o di ciclo.</div>';
  openModal(`<h3>${ico('clock', 'tinted pill', '')} Registro delle modifiche tecniche</h3>
    <p>Ogni revisione rilasciata è una modifica tecnica: numero, tipo, motivo, chi e quando, e i documenti aperti che erano costruiti sulla versione precedente.</p>
    <div style="display:flex;flex-direction:column;gap:8px">${corpo}</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'eco');
}

// ─── Confronto ───
// Le righe si confrontano per articolo, sommando le quantità quando lo stesso
// componente compare più volte nella stessa distinta: è la domanda che si fa
// davvero guardando due revisioni («di questo, quanti ne servono adesso?»),
// non «la terza riga è cambiata».
function revRowsOf(snapshot) {
  const m = new Map();
  const somma = (chiave, etichetta, qty, extra) => {
    const r = m.get(chiave) || Object.assign({ chiave, etichetta, qty: 0 }, extra || {});
    r.qty += Number(qty) || 0;
    m.set(chiave, r);
  };
  // Ogni riga porta con sé la propria unità: nel confronto «2 → 3» va detto di
  // che cosa, e le lavorazioni si misurano in ore mentre i componenti no.
  (snapshot.components || []).forEach(c => {
    const ci = getItem(c.itemId);
    somma('i:' + c.itemId, ci ? ci.code + ' — ' + ci.name : '(articolo eliminato)',
      c.qty, { tipo: 'Componente', uom: itemUom(ci), scrapPct: Number(c.scrapPct) || 0 });
  });
  (snapshot.operations || []).forEach(o => {
    const w = getWorkCenter(o.workCenterId);
    somma('o:' + o.workCenterId, '🔧 ' + (w ? w.name : '(centro eliminato)'), o.hours, { tipo: 'Lavorazione', uom: 'h' });
  });
  // Le fasi si riconoscono per posizione e centro (dalla 0.105.5): due fasi
  // sullo stesso centro senza nota erano una riga sola. E portano quello che
  // ne fa il costo e il tempo, perché anche quello è una modifica.
  let fase = 0;
  (snapshot.cycle || []).forEach(r => {
    if (r.kind === 'op') {
      const w = getWorkCenter(r.workCenterId);
      const k = fase++;
      somma('f:' + k + ':' + r.workCenterId, '🔧 ' + cyclePhaseNumber(k) + ' ' + (w ? w.name : '(centro eliminato)') + (r.note ? ' · ' + r.note : ''),
        1, { tipo: 'Fase ciclo', cost: cycleRowCost(r), dati: {
          costo: +(cycleRowCost(r) || 0).toFixed(4), ore: Number(r.hours) || 0, giorni: Number(r.days) || 0,
          terzista: r.supplierId ? (supplierName(r.supplierId) || r.supplierId) : 'interna', modo: r.costMode || 'fisso' } });
    } else {
      const ci = getItem(r.itemId);
      somma('c:' + r.itemId, ci ? ci.code + ' — ' + ci.name : '(articolo eliminato)', r.qty,
        { tipo: 'Distinta parte', uom: itemUom(ci), dati: { forzato: r.costOverride != null && r.costOverride !== '' ? Number(r.costOverride) : null } });
    }
  });
  return m;
}
const REV_DATI = { costo: 'costo', ore: 'ore', giorni: 'giorni', terzista: 'terzista', modo: 'modo di costo', forzato: 'costo forzato' };
// Che cosa è cambiato, oltre alla quantità: «costo 3 → 4; terzista interna → Beta».
function revCambiDati(a, b) {
  const x = a || {}, y = b || {};
  return Object.keys(REV_DATI).filter(k => (k in x || k in y) && String(x[k] == null ? '—' : x[k]) !== String(y[k] == null ? '—' : y[k]))
    .map(k => `${REV_DATI[k]} ${x[k] == null ? '—' : x[k]} → ${y[k] == null ? '—' : y[k]}`);
}
// { aggiunte, rimosse, cambiate, invariate } — righe pronte da mostrare.
function revDiff(snapPrima, snapDopo) {
  const a = revRowsOf(snapPrima || {}), b = revRowsOf(snapDopo || {});
  const out = { aggiunte: [], rimosse: [], cambiate: [], invariate: 0 };
  b.forEach((riga, k) => {
    const vecchia = a.get(k);
    if (!vecchia) { out.aggiunte.push(riga); return; }
    const altro = revCambiDati(vecchia.dati, riga.dati);
    if (Math.abs(vecchia.qty - riga.qty) > 1e-9 || (vecchia.scrapPct || 0) !== (riga.scrapPct || 0) || altro.length) {
      out.cambiate.push(Object.assign({}, riga, { qtyPrima: vecchia.qty, scrapPrima: vecchia.scrapPct || 0, altro }));
    } else out.invariate++;
  });
  a.forEach((riga, k) => { if (!b.has(k)) out.rimosse.push(riga); });
  // Comprata o fabbricata: per una parte è la modifica più grande di tutte.
  const sa = (snapPrima || {}).sourcing || null, sb = (snapDopo || {}).sourcing || null;
  if (sa !== sb && (sa || sb)) {
    const nome = s => (typeof PART_SOURCING !== 'undefined' && PART_SOURCING[s]) || s || '—';
    out.cambiate.push({ chiave: 's', etichetta: 'Approvvigionamento', tipo: 'Parte', qty: 0, qtyPrima: 0, scrapPrima: 0,
      altro: [`${nome(sa)} → ${nome(sb)}`] });
  }
  return out;
}
function revDiffVuoto(d) { return !d.aggiunte.length && !d.rimosse.length && !d.cambiate.length; }

// ─── Interfaccia ───
function revBadge(it) {
  if (!hasRevisions(it)) return '';
  const n = revisionsOf(it.id).length;
  const titolo = n ? `Revisione in lavorazione. ${n} ${n === 1 ? 'revisione rilasciata' : 'revisioni rilasciate'}` : 'Revisione in lavorazione. Nessun rilascio finora';
  return `<span class="doc-badge" title="${esc(titolo)}">Rev. ${esc(itemRev(it))}${n ? ' · ' + n + ' rilasciate' : ''}</span>`;
}
// La stessa barra serve due viste: le distinte degli assiemi e i cicli delle
// parti. Sono la stessa cosa — ciò che definisce il costo di un articolo — e
// congelare l'una senza l'altra lascerebbe metà storico.
function renderRevBar(elId, itemId) {
  const el = document.getElementById(elId); if (!el) return;
  const it = getItem(itemId);
  if (!it || !hasRevisions(it)) { el.innerHTML = ''; return; }
  el.innerHTML = `${revBadge(it)}
    <button class="btn-outline" onclick="releaseRevisionModal('${it.id}')">${ico('pin', 'tinted', '')} Nuova revisione</button>
    <button class="btn-outline" onclick="revHistoryModal('${it.id}')">${ico('clock', 'tinted', '')} Storico revisioni</button>
    <button class="btn-outline" onclick="ecoRegistroModal()" title="Tutte le revisioni rilasciate, di tutti gli articoli">Modifiche tecniche</button>${isAssembly(it.type) ? `
    <button class="btn-outline" onclick="bomCompareModal('${it.id}')" title="Le differenze con un'altra distinta, su tutti i livelli">⇄ Confronta con…</button>` : ''}`;
}
function renderBomRevBar() { renderRevBar('bom-rev-bar', currentBomId); }
function renderCyclesRevBar() { renderRevBar('cycles-rev-bar', currentCycleItemId); }

function releaseRevisionModal(itemId) {
  if (!roleGuard('bom')) return;
  const it = getItem(itemId || currentBomId); if (!it || !hasRevisions(it)) return;
  const rev = itemRev(it);
  const ultima = revisionsOf(it.id)[0];
  const d = ultima ? revDiff(ultima.snapshot, revSnapshot(it)) : null;
  // Se dall'ultimo rilascio non è cambiato niente, si dice invece di lasciar
  // creare una revisione identica alla precedente: uno storico pieno di
  // revisioni uguali non è uno storico.
  const avviso = d && revDiffVuoto(d)
    ? `<p style="color:var(--red)"><strong>Dalla revisione ${esc(ultima.rev)} non è cambiato niente.</strong> Rilasciarla creerebbe una copia identica.</p>` : '';
  const riepilogo = d && !revDiffVuoto(d)
    ? `<p>Rispetto alla ${esc(ultima.rev)}: ${d.aggiunte.length} aggiunte, ${d.rimosse.length} rimosse, ${d.cambiate.length} modificate.</p>` : '';
  openModal(`<h3>${ico('pin', 'tinted pill', '')} Rilascia revisione ${esc(rev)}</h3>
    <p>La distinta di <strong>${esc(it.code)} — ${esc(it.name)}</strong> viene <strong>congelata così com'è</strong>, col costo di oggi. Da qui in poi si lavora sulla <strong>${esc(nextRev(rev))}</strong>: la ${esc(rev)} resta consultabile e non cambia più.</p>
    ${riepilogo}${avviso}
    <div class="modal-field"><label>Tipo di modifica</label>
      <select id="rev-tipo"><option value="">— scegli —</option>${Object.entries(ECO_TIPI).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
    <div class="modal-field"><label>Documenti aperti costruiti sulla ${esc(rev)}</label>
      ${ecoImpattoHtml(ecoImpatto(it.id, d), true)}</div>
    <div class="modal-field"><label>Motivo del rilascio</label>
      <input id="rev-motivo" placeholder="es. Approvata per produzione lotto 2026-08" autocomplete="off"></div>
    <p class="empty-text" style="text-align:left;padding:0 0 10px">Il motivo è quello che si legge fra un anno per capire perché la distinta è cambiata. Vale la pena scriverlo.</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="releaseRevisionConfirm('${it.id}')">Rilascia ${esc(rev)}</button>
    </div>`, false, 'form');
  setTimeout(() => { const e = document.getElementById('rev-motivo'); if (e) e.focus(); }, 50);
}
function releaseRevisionConfirm(itemId) {
  if (!roleGuard('bom')) return;
  const it = getItem(itemId || currentBomId); if (!it) return;
  const motivo = val('rev-motivo'), tipo = val('rev-tipo');
  return conNumeri({ MT: 1 }, () => releaseRevisionFatto(it, motivo, tipo));
}
function releaseRevisionFatto(it, motivo, tipo) {
  const rec = releaseRevision(it.id, motivo, { tipo });
  if (!rec) { showToast('Questo articolo non ha una distinta da rilasciare', 'error'); return; }
  closeModal();
  // Si ridisegna la vista da cui si è partiti, non quella dell'altro tipo.
  if (it.type === 'parte' && typeof renderCycles === 'function' && activeView === 'cycles') renderCycles();
  else renderBom();
  showToast(`${rec.ecoNumber}: revisione ${rec.rev} rilasciata — si lavora sulla ${itemRev(getItem(it.id))}${rec.ecoImpact.length ? ` · ${rec.ecoImpact.length} documenti aperti da verificare` : ''}`);
}

function revHistoryModal(itemId) {
  const it = getItem(itemId || currentBomId); if (!it) return;
  const lista = revisionsOf(it.id);
  // La fotografia dell'attuale è la stessa per tutte le righe: si scatta una
  // volta, non tre deep-clone e un rollup di costo per ogni revisione in elenco.
  const attuale = lista.length ? revSnapshot(it) : null;
  const corpo = lista.length ? lista.map(r => {
    const d = revDiff(r.snapshot, attuale);
    const quante = d.aggiunte.length + d.rimosse.length + d.cambiate.length;
    return `<div class="mgmt-item" style="display:block">
      <div style="display:flex;align-items:center;gap:8px">
        <strong style="font-family:var(--mono)">Rev. ${esc(r.rev)}</strong>${r.ecoNumber ? ` <span class="empty-text" style="padding:0;font-family:var(--mono)">${esc(r.ecoNumber)}</span>` : ''}${r.ecoKind ? ` <span class="doc-badge">${esc(ecoTipoLabel(r.ecoKind))}</span>` : ''}
        <span class="empty-text" style="padding:0">${esc(String(r.date || '').slice(0, 10))} · ${esc(r.createdBy ? actorName(r.createdBy) : '—')}</span>
        <span style="flex:1"></span>
        <span class="empty-text" style="padding:0">${fmtPer(r.snapshot.cost ? r.snapshot.cost.total : 0, itemUom(it))}</span>
        <button class="btn-ghost" onclick="revCompareModal('${r.id}')">${quante ? '⇄ Confronta (' + quante + ')' : '⇄ Confronta'}</button>
      </div>
      ${r.motivo ? `<div style="margin-top:4px">${esc(r.motivo)}</div>` : '<div class="empty-text" style="text-align:left;padding:2px 0 0">nessun motivo indicato</div>'}
      ${(r.ecoImpact || []).length ? `<div style="margin-top:4px"><span class="storico-campo">Documenti aperti al rilascio</span>${ecoImpattoHtml(r.ecoImpact)}</div>` : ''}
    </div>`;
  }).join('') : `<div class="empty-text">Nessuna revisione rilasciata. La distinta attuale è la ${esc(itemRev(it))}.</div>`;
  openModal(`<h3>${ico('clock', 'tinted pill', '')} Revisioni — ${esc(it.code)} ${esc(it.name)}</h3>
    <p>In lavorazione: <strong>Rev. ${esc(itemRev(it))}</strong>. Le revisioni qui sotto sono congelate e non cambiano più.</p>
    <div style="display:flex;flex-direction:column;gap:8px">${corpo}</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'storico');
}

// Confronto fra una revisione rilasciata e un'altra, o la distinta attuale.
// `controId` vuoto = la distinta attuale. Fra due revisioni si legge sempre
// dalla più vecchia alla più nuova, qualunque si sia scelta per prima: «aggiunta»
// vuol dire aggiunta col passare del tempo, non «c'è a destra e non a sinistra».
function revCompareModal(revId, controId) {
  const r = getRevision(revId); if (!r) return;
  const it = getItem(r.itemId); if (!it) return;
  const lista = revisionsOf(it.id);   // dalla più recente
  const contro = controId ? getRevision(controId) : null;
  let prima = r, dopo = contro;
  if (contro && lista.indexOf(contro) > lista.indexOf(r)) { prima = contro; dopo = r; }
  const d = revDiff(prima.snapshot, dopo ? dopo.snapshot : revSnapshot(it));
  const riga = (x, segno, colore, extra) => `<div class="mgmt-item">
      <span style="color:${colore};font-weight:700;width:18px">${segno}</span>
      <span style="flex:1">${esc(x.etichetta)}</span>
      <span class="empty-text" style="padding:0">${esc(x.tipo)}</span>
      <span style="font-family:var(--mono)">${extra}</span>
    </div>`;
  const sezione = (titolo, righe) => righe.length
    ? `<h4 class="settings-group-title">${titolo} (${righe.length})</h4>${righe.join('')}` : '';
  const costoPrima = prima.snapshot.cost ? prima.snapshot.cost.total : 0;
  const costoDopo = dopo ? (dopo.snapshot.cost ? dopo.snapshot.cost.total : 0) : costOf(it.id).total;
  const delta = costoDopo - costoPrima;
  const u = itemUom(it);
  const nomeDopo = dopo ? 'Rev. ' + dopo.rev : 'attuale (' + itemRev(it) + ')';
  // Il selettore propone sempre l'altra metà del confronto: la distinta attuale
  // e ogni revisione diversa da quella di partenza.
  const opzioni = [`<option value=""${!contro ? ' selected' : ''}>la distinta attuale (${esc(itemRev(it))})</option>`]
    .concat(lista.filter(x => x.id !== r.id).map(x =>
      `<option value="${esc(x.id)}"${contro && contro.id === x.id ? ' selected' : ''}>la Rev. ${esc(x.rev)} del ${esc(String(x.date || '').slice(0, 10))}</option>`)).join('');
  const motivo = dopo && dopo.motivo ? dopo.motivo : (!dopo && prima.motivo ? prima.motivo : '');
  openModal(`<h3>⇄ Rev. ${esc(prima.rev)} → ${esc(nomeDopo)}</h3>
    <p>${esc(it.code)} — ${esc(it.name)}${motivo ? ` · <em>${esc(motivo)}</em>` : ''}</p>
    ${lista.length > 1 ? `<div class="modal-field" style="max-width:420px;margin-top:10px"><label>Confronta la Rev. ${esc(r.rev)} con</label>
      <select id="rev-contro" onchange="revCompareModal('${r.id}', this.value)">${opzioni}</select></div>` : ''}
    <div class="cost-summary">
      ${kpi('Costo alla Rev. ' + esc(prima.rev), fmtPer(costoPrima, u), '')}
      ${kpi(dopo ? 'Costo alla Rev. ' + esc(dopo.rev) : 'Costo attuale', fmtPer(costoDopo, u), '')}
      ${kpi('Differenza', (delta >= 0 ? '+' : '') + fmtPer(delta, u), delta > 0 ? 'orange' : (delta < 0 ? 'green' : ''))}
    </div>
    ${revDiffVuoto(d) ? '<div class="empty-text">Nessuna differenza nella distinta. Se il costo è cambiato, è cambiato un prezzo, non la distinta.</div>' : ''}
    ${sezione('Aggiunte', d.aggiunte.map(x => riga(x, '+', 'var(--green)', fmtUom(x.qty, x.uom))))}
    ${sezione('Rimosse', d.rimosse.map(x => riga(x, '−', 'var(--red)', fmtUom(x.qty, x.uom))))}
    ${sezione('Cambiate', d.cambiate.map(x => riga(x, '≠', 'var(--orange, #d90)',
      [Math.abs(x.qtyPrima - x.qty) > 1e-9 ? `${fmtQtyIt(x.qtyPrima)} → ${fmtUom(x.qty, x.uom)}` : '']
        .concat(x.altro || []).filter(Boolean).map(esc).join('; '))))}
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'confronto');
}

// ─── Confronto fra due distinte qualsiasi ───
// Le revisioni rispondono a «com'era questa macchina»; qui la domanda è
// «che differenza c'è fra queste due»: la variante, la versione per un altro
// cliente, la macchina nuova nata da una vecchia. Si confronta su tutti i
// livelli, per articolo, con le quantità **totali per una macchina** — le
// stesse del fabbisogno, perché è mrpExplode a calcolarle: scarti compresi,
// e lo stesso componente in due rami è sommato.
// Due elenchi come nel piano: quello che si compra e quello che si fabbrica.
// Il valore cambia solo sul primo: una parte fabbricata vale i suoi materiali
// e le sue ore, già contati sotto — sommarli due volte gonfierebbe la differenza.
function confrontaDistinte(aId, bId) {
  const esplodi = id => mrpExplode([{ itemId: id, qty: 1 }]);
  const ea = esplodi(aId), eb = esplodi(bId);
  const righe = [];
  [['buy', 'Da acquistare'], ['make', 'Da fabbricare']].forEach(([k, sezione]) => {
    const m = new Map();
    ea[k].forEach(e => m.set(e.item.id, { item: e.item, sezione: k, qa: e.qty, qb: 0 }));
    eb[k].forEach(e => {
      const r = m.get(e.item.id) || { item: e.item, sezione: k, qa: 0, qb: 0 };
      r.qb = e.qty; m.set(e.item.id, r);
    });
    m.forEach(r => {
      r.delta = r.qb - r.qa;
      if (Math.abs(r.delta) < 1e-9) r.delta = 0;
      r.stato = !r.qa ? 'aggiunto' : (!r.qb ? 'tolto' : (r.delta ? 'cambiato' : 'uguale'));
      r.valore = k === 'buy' ? r.delta * itemUnitCost(r.item) : null;
      righe.push(r);
    });
  });
  righe.sort((x, y) => x.sezione.localeCompare(y.sezione) || String(x.item.code).localeCompare(String(y.item.code)));
  return { righe, costoA: costOf(aId).total, costoB: costOf(bId).total, anello: ea.cycle || eb.cycle };
}

let _bomConfronto = { a: '', b: '', soloDiff: true };
// Con il segno sempre davanti al simbolo: «+€ 8,00», «−€ 320,00», non «€ -320,00».
function fmtNSegno(v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + fmtN(Math.abs(v)); }
const qtyUomIt = (n, u) => fmtQtyIt(n) + uomSuffix(u);
function bomCompareModal(aId, bId) {
  const a = getItem(aId || currentBomId); if (!a) return;
  const candidati = (db.items || []).filter(i => isAssembly(i.type) && i.id !== a.id && i.active !== false)
    .sort((x, y) => String(x.code).localeCompare(String(y.code)));
  if (bId === undefined) bId = _bomConfronto.a === a.id ? _bomConfronto.b : '';
  _bomConfronto.a = a.id; _bomConfronto.b = bId || '';
  const b = bId ? getItem(bId) : null;
  const scelta = `<div class="modal-field" style="max-width:520px"><label>Confronta ${esc(a.code)} con</label>
    <select id="bom-contro" onchange="bomCompareModal('${a.id}', this.value)">
      <option value="">— scegli una distinta —</option>
      ${candidati.map(i => `<option value="${esc(i.id)}"${b && b.id === i.id ? ' selected' : ''}>${esc(i.code)} — ${esc(i.name)}</option>`).join('')}
    </select></div>`;
  let corpo = '';
  if (!candidati.length) corpo = '<div class="empty-text">Non ci sono altre distinte con cui confrontarla.</div>';
  else if (b) {
    const c = confrontaDistinte(a.id, b.id);
    const delta = c.costoB - c.costoA;
    const diverse = c.righe.filter(r => r.stato !== 'uguale');
    const mostrate = _bomConfronto.soloDiff ? diverse : c.righe;
    const segno = { aggiunto: ['+', 'var(--green)'], tolto: ['−', 'var(--red)'], cambiato: ['≠', 'var(--orange, #d90)'], uguale: ['=', 'var(--text-dim)'] };
    const tabella = sez => {
      const rr = mostrate.filter(r => r.sezione === sez);
      if (!rr.length) return '';
      return `<h4 class="settings-group-title">${sez === 'buy' ? 'Da acquistare' : 'Da fabbricare'} (${rr.length})</h4>
      <div class="table-wrap"><table class="bom-compare">
        <thead><tr><th></th><th>Codice</th><th>Descrizione</th><th class="num">${esc(a.code)}</th><th class="num">${esc(b.code)}</th><th class="num">Δ</th>${sez === 'buy' ? '<th class="num">Δ valore</th>' : ''}</tr></thead>
        <tbody>${rr.map(r => `<tr>
          <td style="color:${segno[r.stato][1]};font-weight:700">${segno[r.stato][0]}</td>
          <td><span class="code-link" ${clickAttrs(`itemInfoModal('${r.item.id}', event)`, 'Scheda di ' + r.item.code)}>${esc(r.item.code)}</span></td>
          <td>${esc(r.item.name)}</td>
          <td class="num">${r.qa ? qtyUomIt(r.qa, itemUom(r.item)) : '—'}</td>
          <td class="num">${r.qb ? qtyUomIt(r.qb, itemUom(r.item)) : '—'}</td>
          <td class="num">${r.delta ? (r.delta > 0 ? '+' : '−') + fmtQtyIt(Math.abs(r.delta)) : ''}</td>
          ${sez === 'buy' ? `<td class="num">${r.valore ? fmtNSegno(r.valore) : ''}</td>` : ''}
        </tr>`).join('')}</tbody></table></div>`;
    };
    corpo = `<div class="cost-summary">
        ${kpi('Costo ' + esc(a.code), fmtN(c.costoA), '')}
        ${kpi('Costo ' + esc(b.code), fmtN(c.costoB), '')}
        ${kpi('Differenza', fmtNSegno(delta), delta > 0 ? 'orange' : (delta < 0 ? 'green' : ''))}
      </div>
      ${c.anello ? '<p style="color:var(--red)">Una delle due distinte contiene sé stessa: l\'esplosione si ferma all\'anello.</p>' : ''}
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:8px 0">
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" ${_bomConfronto.soloDiff ? 'checked' : ''}
          onchange="_bomConfronto.soloDiff = this.checked; bomCompareModal('${a.id}', '${b.id}')"> Solo le differenze</label>
        <span class="empty-text" style="padding:0">${diverse.length} articoli diversi su ${c.righe.length} · quantità per una macchina, su tutti i livelli, scarti compresi</span>
        <span style="flex:1"></span>
        ${listExportButtons('bomCompareExportSpec')}
      </div>
      ${mostrate.length ? tabella('buy') + tabella('make') : '<div class="empty-text">Le due distinte usano gli stessi articoli nelle stesse quantità.</div>'}`;
  }
  openModal(`<h3>⇄ Confronta distinte — ${esc(a.code)} ${esc(a.name)}</h3>
    ${scelta}${corpo}
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'confronto-db');
}
function bomCompareExportSpec() {
  const a = getItem(_bomConfronto.a), b = getItem(_bomConfronto.b);
  if (!a || !b) return null;
  const c = confrontaDistinte(a.id, b.id);
  const righe = c.righe.filter(r => !_bomConfronto.soloDiff || r.stato !== 'uguale');
  const STATO = { aggiunto: 'Solo in ' + b.code, tolto: 'Solo in ' + a.code, cambiato: 'Quantità diversa', uguale: 'Uguale' };
  const colonne = [{ h: 'Codice', w: 18 }, { h: 'Descrizione', w: 40 }, { h: 'UM', w: 6 },
    { h: a.code, w: 12, num: true }, { h: b.code, w: 12, num: true }, { h: 'Δ', w: 10, num: true }, { h: 'Esito', w: 18 }];
  const sez = (k, nome) => {
    const rr = righe.filter(r => r.sezione === k);
    const cols = k === 'buy' ? colonne.concat([{ h: 'Δ valore', w: 12, num: true }]) : colonne;
    return { nome, colonne: cols, righe: rr.map(r => {
      const base = [r.item.code, r.item.name, itemUom(r.item), r.qa, r.qb, r.delta, STATO[r.stato]];
      return k === 'buy' ? base.concat([r.valore || 0]) : base;
    }) };
  };
  return { titolo: `Confronto distinte ${a.code} / ${b.code}`, slug: `confronto_${a.code}_${b.code}`,
    filtri: [['Distinta A', a.code + ' — ' + a.name], ['Distinta B', b.code + ' — ' + b.name],
      ['Costo A', c.costoA], ['Costo B', c.costoB], ['Righe', _bomConfronto.soloDiff ? 'solo le differenze' : 'tutte']],
    sezioni: [sez('buy', 'Da acquistare'), sez('make', 'Da fabbricare')] };
}
