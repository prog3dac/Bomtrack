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

// ── Revisioni approvate (dalla 0.159.0) ──
// Il modello qui sopra lasciava usare la distinta mentre la si scriveva: piani,
// ODP e fasi per il terzista leggevano la copia in lavorazione, e la revisione
// rilasciata era solo una fotografia per lo storico. Da quando le revisioni
// approvate sono attive (Gestione → Revisioni, `settings.revApprovate`) vale la
// regola opposta, ma solo dove conta: **la bozza resta sempre modificabile, e
// piani e ODP usano soltanto una revisione approvata e valida alla data in cui
// il pezzo serve**. La fotografia diventa così la cosa che si usa, non un
// ricordo.
//
// Le numerazioni sono due e indipendenti:
//   - la revisione di distinta e ciclo (v0, v1, v2…) è gestita qui: bozza,
//     richiesta, approvazione, validità;
//   - la revisione del codice (00, 01, 02…) si decide fuori, nell'ufficio
//     tecnico o nel CAD, e l'app la registra soltanto (più sotto).
//
// Validità: ogni revisione approvata ha un «dal» (`validFrom`). Il suo «al» non
// si scrive da nessuna parte: è il giorno prima del «dal» della successiva.
// Così le date non si sovrappongono e non lasciano buchi per costruzione, e i
// record restano eventi che non si riscrivono, come nell'archivio condiviso.

// Revisione in lavorazione, salvata come lettera (A, B, C…) come prima della
// 0.159.0: è la stessa sequenza, e riscrivere ogni articolo e ogni revisione per
// cambiarle nome avrebbe solo creato traffico verso l'archivio condiviso. A
// video diventa v0, v1, v2 (revLabel). Gli articoli già a catalogo non hanno il
// campo: valgono A, cioè v0.
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
// La lettera come numero: A = 0, Z = 25, AA = 26. È la stessa sequenza di
// nextRev, contata.
function revNum(letter) {
  const s = String(letter || 'A').toUpperCase().replace(/[^A-Z]/g, '') || 'A';
  let n = 0;
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
function revLabel(letter) { return 'v' + revNum(letter); }
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

// ─── Validità ───
// Il «dal» di una revisione: quello scelto all'approvazione, o per le
// revisioni di prima il giorno del rilascio.
function revDal(r) { return (r && r.validFrom) || String((r && r.date) || '').slice(0, 10); }
// Le revisioni di un articolo nell'ordine in cui entrano in vigore, ognuna col
// suo periodo. `mai`: superata prima ancora di cominciare (due approvazioni con
// lo stesso «dal»: vale l'ultima).
function revPeriodi(itemId) {
  const c = (db.revisions || []).map((r, i) => ({ r, i }))
    .filter(x => x.r.itemId === itemId)
    .sort((a, b) => revDal(a.r).localeCompare(revDal(b.r)) || String(a.r.date || '').localeCompare(String(b.r.date || '')) || a.i - b.i)
    .map(x => x.r);
  return c.map((r, k) => {
    const dal = revDal(r), dopo = c[k + 1];
    const al = dopo ? addDays(revDal(dopo), -1) : '';
    return { r, dal, al, mai: !!(al && al < dal) };
  });
}
function revPeriodo(r) { return r ? revPeriodi(r.itemId).find(p => p.r === r) || null : null; }
// La revisione approvata valida in una data (oggi se non la si dice).
function revValidaAl(itemId, data) {
  const d = data || oggiISO();
  let ok = null;
  revPeriodi(itemId).forEach(p => { if (!p.mai && p.dal <= d && (!p.al || d <= p.al)) ok = p.r; });
  return ok;
}
// La prima revisione approvata che entra in vigore dopo oggi, se c'è.
function revProssima(itemId) {
  const oggi = oggiISO();
  const p = revPeriodi(itemId).find(x => !x.mai && x.dal > oggi);
  return p ? p.r : null;
}
// Il «dal» più vicino che si può scegliere: da oggi, e non prima dell'ultima
// revisione approvata (le date non tornano indietro).
function revDalMinimo(itemId) {
  const oggi = oggiISO();
  const per = revPeriodi(itemId);
  const ultimo = per.length ? per[per.length - 1].dal : '';
  return ultimo > oggi ? ultimo : oggi;
}
// Che cosa non va in un «dal» proposto; '' se va bene.
function revDalErrore(itemId, dal) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dal || ''))) return 'Scegli la data da cui vale la revisione';
  if (dal < oggiISO()) return 'La data da cui vale non può essere nel passato';
  const min = revDalMinimo(itemId);
  if (dal < min) return `La revisione approvata più recente vale dal ${fmtDateIt(min)}: la nuova non può cominciare prima`;
  return '';
}

// ─── Chi usa che cosa ───
// Le revisioni approvate sono attive? Prima che l'Amministratore le attivi,
// piani e ODP continuano a usare la bozza come hanno sempre fatto: un archivio
// che ha mille distinte e nessuna revisione non deve svegliarsi con i piani
// vuoti.
function revApprovateAttive() { return !!(db.settings && db.settings.revApprovate); }
// Ha bisogno di una revisione per essere usato? Un assieme sì, e una parte
// fatta in casa. Una parte comprata è una foglia d'acquisto: la sua distinta
// non scende nel fabbisogno, e non serve approvarla per comprarla.
function revServe(it) { return hasRevisions(it) && (it.type !== 'parte' || partSourcing(it) === 'make'); }
// L'articolo come lo vedono piani, ODP e ordini di lavoro alla data `data`:
// le sue righe di distinta e le sue fasi sono quelle della revisione valida.
// Una copia superficiale — chi la riceve legge soltanto. Senza una revisione
// valida l'articolo resta senza righe e porta `_senzaRev`: il fabbisogno lo
// segnala invece di esplodere la bozza.
function itemOperativo(it, data) {
  if (!it || !revApprovateAttive() || !revServe(it)) return it;
  const r = revValidaAl(it.id, data);
  if (!r) return Object.assign({}, it, { components: [], cycle: [], operations: [], _senzaRev: true });
  const s = r.snapshot || {};
  return Object.assign({}, it, { components: s.components || [], cycle: s.cycle || [], operations: s.operations || [],
    sourcing: s.sourcing || it.sourcing, _rev: r });
}
function getItemOperativo(id, data) { return itemOperativo(getItem(id), data); }
// La bozza è in approvazione: distinta e ciclo si guardano ma non si toccano,
// così chi approva firma esattamente quello che vede.
function revInApprovazione(it) { return !!(it && it.revRequest && revApprovateAttive()); }
function revBozzaLibera(itemId) {
  const it = getItem(itemId);
  if (!revInApprovazione(it)) return true;
  showToast(`La bozza ${revLabel(itemRev(it))} di ${it.code} è in approvazione: per modificarla ritira prima la richiesta`, 'error');
  return false;
}

// La fotografia. Si copia in profondità: se restassero riferimenti agli array
// vivi, modificare la distinta domani cambierebbe la revisione di ieri — cioè
// esattamente il difetto che si sta risolvendo.
function revSnapshot(it) {
  const c = costOf(it.id);
  return {
    code: it.code, name: it.name, type: it.type, uom: it.uom || '',
    sourcing: it.sourcing || null,
    // La distinta e le fasi, anche quelle non ancora passate dalla migrazione
    // (distintaRighe, cicloFasi): sono la stessa definizione. Di una parte,
    // dalla 0.125.0 il materiale sta nella distinta e nel ciclo le sole fasi.
    components: JSON.parse(JSON.stringify(distintaRighe(it))),
    cycle: JSON.parse(JSON.stringify(cicloFasi(it))),
    // Il costo del giorno del rilascio: senza, la revisione direbbe *cosa* c'era
    // ma non *quanto* costava, e i prezzi di allora non tornano più.
    cost: { material: c.material, purchased: c.purchased, labor: c.labor,
      parts: c.parts, overhead: c.overhead, total: c.total },
  };
}

// Rilascia (approva) la revisione in lavorazione e ne apre la successiva.
// Ritorna il record creato, o null se non c'era niente da rilasciare.
// `eco` (facoltativo): { tipo, dal, richiestaDa, iniziale } — il tipo di
// modifica tecnica, la data da cui vale (oggi se manca), chi l'aveva chiesta.
// Il numero MT-… e l'impatto sui documenti aperti li calcola il rilascio
// stesso: sono un fatto del momento, e chi chiama non deve poterli scrivere
// diversi. L'approvazione iniziale (`iniziale`) non prende un numero MT: non è
// una modifica, è il punto di partenza.
function releaseRevision(itemId, motivo, eco) {
  // La guardia sta nel mutatore, non solo nei chiamanti: la funzione è globale
  // e chiunque la raggiunga deve passare dallo stesso controllo.
  if (!roleGuard('bom')) return null;
  const it = getItem(itemId);
  if (!it || !hasRevisions(it)) return null;
  const e = eco || {};
  // Con le revisioni approvate attive, approva solo l'Amministratore: gli
  // altri chiedono (revRichiedi).
  if (revApprovateAttive() && !isAdmin()) { showToast('Solo l\'Amministratore approva una revisione: chiedi l\'approvazione', 'error'); return null; }
  const dal = e.dal || oggiISO();
  const errDal = revApprovateAttive() ? revDalErrore(it.id, dal) : '';
  if (errDal) { showToast(errDal, 'error'); return null; }
  const rev = itemRev(it);
  const snapshot = revSnapshot(it);
  const ultima = revisionsOf(it.id)[0];
  const rec = {
    id: gid(), itemId, rev,
    date: nowISO(),
    validFrom: dal,
    codeRev: itemCodeRev(it, dal),
    motivo: String(motivo || '').trim(),
    snapshot,
    ecoNumber: e.iniziale ? '' : nextEcoNumber(),
    ecoKind: ECO_TIPI[e.tipo] ? e.tipo : '',
    ecoImpact: e.iniziale ? [] : ecoImpatto(it.id, ultima ? revDiff(ultima.snapshot, snapshot) : null),
  };
  if (e.richiestaDa) rec.requestedBy = e.richiestaDa;
  // Prima si avanza l'articolo, poi si inserisce: Store.insert salva una volta
  // sola e porta con sé entrambe le modifiche. Passa da lì anche perché crea la
  // collezione se manca — su un database precedente alla 0.25.0 non c'è.
  it.rev = nextRev(rev);
  if (it.revRequest) it.revRequest = null;
  if (it.revRejected) it.revRejected = null;
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
        <span>${esc(revLabel(r.rev))}${r.validFrom ? ' · dal ' + esc(fmtDateIt(r.validFrom)) : ''}</span>
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
  // La distinta di una parte (dalla 0.125.0 nei componenti, prima nel ciclo)
  // ha la sua chiave: confrontata con una revisione di prima, la stessa
  // materia prima è la stessa riga.
  const parte = snapshot.type === 'parte';
  const rigaParte = r => {
    const ci = getItem(r.itemId);
    somma('c:' + r.itemId, ci ? ci.code + ' — ' + ci.name : '(articolo eliminato)', r.qty,
      { tipo: 'Distinta parte', uom: itemUom(ci), scrapPct: Number(r.scrapPct) || 0,
        dati: { forzato: r.costOverride != null && r.costOverride !== '' ? Number(r.costOverride) : null } });
  };
  (snapshot.components || []).forEach(c => {
    if (parte) { rigaParte(c); return; }
    const ci = getItem(c.itemId);
    somma('i:' + c.itemId, ci ? ci.code + ' — ' + ci.name : '(articolo eliminato)',
      c.qty, { tipo: 'Componente', uom: itemUom(ci), scrapPct: Number(c.scrapPct) || 0 });
  });
  // Le fasi si riconoscono per posizione e centro (dalla 0.105.5): due fasi
  // sullo stesso centro senza nota erano una riga sola. E portano quello che
  // ne fa il costo e il tempo, perché anche quello è una modifica.
  // Le lavorazioni d'assieme di una revisione di prima della 0.124.0 si leggono
  // come fasi, nello stesso modo della migrazione (asmOpInCiclo): confrontata
  // con una revisione nuova, la stessa lavorazione è la stessa fase.
  let fase = 0;
  (snapshot.cycle || []).concat((snapshot.operations || []).map(asmOpInCiclo)).forEach(r => {
    if (r.kind === 'op') {
      const w = getWorkCenter(r.workCenterId);
      const k = fase++;
      somma('f:' + k + ':' + r.workCenterId, '🔧 ' + cyclePhaseNumber(k) + ' ' + (w ? w.name : '(centro eliminato)') + (r.note ? ' · ' + r.note : ''),
        1, { tipo: 'Fase ciclo', cost: cycleRowCost(r), dati: {
          costo: +(cycleRowCost(r) || 0).toFixed(4), ore: Number(r.hours) || 0, operatori: r.supplierId ? null : faseOperatori(r), giorni: Number(r.days) || 0,
          terzista: r.supplierId ? (supplierName(r.supplierId) || r.supplierId) : 'interna', modo: r.costMode || 'fisso',
          // Solo dove c'è: le fasi senza macchina restano uguali a quelle di prima della 0.126.0.
          ...(r.machineId && !r.supplierId ? { macchina: machineLabel(getMachine(r.machineId)) || '(macchina eliminata)' } : {}) } });
    } else rigaParte(r);
  });
  return m;
}
const REV_DATI = { costo: 'costo', ore: 'ore', operatori: 'operatori', giorni: 'giorni', terzista: 'terzista', macchina: 'macchina', modo: 'modo di costo', forzato: 'costo forzato' };
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

// ─── Revisione del codice (dalla 0.159.0) ───
// Il numero che si legge nel cartiglio del disegno: 00 alla creazione, poi 01,
// 02… Si decide fuori dall'app (ufficio tecnico, CAD) e qui si **registra**,
// con la data da cui vale, il riferimento al disegno, una nota e la fotografia
// dei dati tecnici di quel momento. Non passa da un'approvazione: è già stata
// decisa. La storia sta sull'articolo (`codeRevs`), dalla più vecchia; la 00
// iniziale non ha bisogno di una voce.
const CODE_REV_TECNICI = ['drawingRef', 'material', 'finish', 'treatment', 'weightKg', 'grossWeightKg', 'lengthM', 'widthM', 'heightM', 'volumeM3'];
function codeRevPad(n) { return String(Math.max(0, Number(n) || 0)).padStart(2, '0'); }
// La revisione del codice valida in una data (oggi se non la si dice).
function itemCodeRev(it, data) {
  const d = data || oggiISO();
  let ok = '00';
  ((it && it.codeRevs) || []).forEach(x => { if (x && x.from && x.from <= d) ok = x.rev; });
  return ok;
}
// L'ultima registrata, anche se vale da una data futura.
function itemCodeRevUltima(it) {
  const st = (it && it.codeRevs) || [];
  return st.length ? st[st.length - 1].rev : '00';
}
function nextCodeRev(rev) { return codeRevPad(Number(rev || 0) + 1); }
function registraCodeRev(itemId, dati) {
  if (!roleGuard('bom')) return null;
  const it = getItem(itemId); if (!it) return null;
  const d = dati || {};
  const ultima = itemCodeRevUltima(it);
  const rev = /^\d{1,3}$/.test(String(d.rev || '')) ? codeRevPad(d.rev) : nextCodeRev(ultima);
  if (Number(rev) <= Number(ultima)) { showToast(`La revisione del codice dev'essere dopo la ${ultima}`, 'error'); return null; }
  const st = it.codeRevs || [];
  const dal = d.dal || oggiISO();
  const prima = st.length ? st[st.length - 1].from : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dal) || (prima && dal < prima)) { showToast('La data da cui vale non può essere prima di quella della revisione precedente', 'error'); return null; }
  const tecnici = {};
  CODE_REV_TECNICI.forEach(k => { if (it[k] != null && it[k] !== '') tecnici[k] = it[k]; });
  const voce = { rev, from: dal, drawingRef: String(d.drawingRef != null ? d.drawingRef : (it.drawingRef || '')).trim(),
    note: String(d.note || '').trim(), tech: tecnici, by: currentUser ? currentUser.id : null, at: nowISO() };
  it.codeRevs = st.concat([voce]);
  if (voce.drawingRef) it.drawingRef = voce.drawingRef;
  touch(it); saveDB();
  return voce;
}
// Distinta e ciclo validi sono fatti per una revisione del codice di prima?
function revDaAllineare(it) {
  if (!hasRevisions(it)) return null;
  const r = revValidaAl(it.id) || revisionsOf(it.id)[0];
  if (!r) return null;
  const cr = itemCodeRev(it);
  return (r.codeRev || '00') !== cr && !(it.codeRevOk === cr) ? { r, cr } : null;
}
function codeRevConfermaAllineata(itemId) {
  if (!roleGuard('bom')) return;
  const it = getItem(itemId); if (!it) return;
  it.codeRevOk = itemCodeRev(it); touch(it); saveDB();
  revRidisegna(it); savedToast(`Distinta e ciclo valgono anche per la rev. ${it.codeRevOk}`);
}
function codeRevModal(itemId) {
  if (!roleGuard('bom')) return;
  const it = getItem(itemId); if (!it) return;
  const ultima = itemCodeRevUltima(it);
  const storia = (it.codeRevs || []).slice().reverse().map(x => `<li><strong>Rev. ${esc(x.rev)}</strong> dal ${esc(fmtDateIt(x.from))}${x.drawingRef ? ' · ' + esc(x.drawingRef) : ''}${x.note ? ' — ' + esc(x.note) : ''} <span class="storico-prima">${esc(x.by ? actorName(x.by) : '')}</span></li>`).join('');
  openModal(`<h3>${ico('pin', 'tinted pill', '')} Registra revisione del codice</h3>
    <p><strong>${esc(it.code)} — ${esc(it.name)}</strong> è alla <strong>rev. ${esc(ultima)}</strong>. La revisione del codice è quella del disegno, decisa fuori dall'app: qui si registra, con i dati tecnici di oggi.</p>
    <div class="modal-field"><label>Nuova revisione</label><input id="crev-num" value="${esc(nextCodeRev(ultima))}" autocomplete="off" inputmode="numeric"></div>
    <div class="modal-field"><label>Valida dal</label><input id="crev-dal" type="date" value="${esc(oggiISO())}"></div>
    <div class="modal-field"><label>Riferimento disegno</label><input id="crev-dis" value="${esc(it.drawingRef || '')}" autocomplete="off"></div>
    <div class="modal-field"><label>Nota</label><input id="crev-nota" placeholder="es. Foro Ø12 portato a Ø14" autocomplete="off"></div>
    ${storia ? `<div class="modal-field"><label>Revisioni registrate</label><ul class="storico-campi">${storia}</ul></div>` : ''}
    ${hasRevisions(it) ? '<p class="empty-text" style="text-align:left;padding:0 0 10px">Dopo la registrazione la barra revisioni chiede se distinta e ciclo validi vanno bene anche per la nuova revisione.</p>' : ''}
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="codeRevConfirm('${it.id}')">Registra</button>
    </div>`, false, 'form');
}
function codeRevConfirm(itemId) {
  const voce = registraCodeRev(itemId, { rev: val('crev-num'), dal: val('crev-dal'), drawingRef: val('crev-dis'), note: val('crev-nota') });
  if (!voce) return;
  closeModal();
  const it = getItem(itemId);
  revRidisegna(it);
  if (typeof activeView !== 'undefined' && activeView === 'catalog' && typeof renderCatalog === 'function') renderCatalog();
  savedToast(`Revisione del codice ${voce.rev} registrata`);
}

// ─── Richiesta, approvazione, respingimento (dalla 0.159.0) ───
// Progettazione prepara la bozza e chiede l'approvazione; l'Amministratore la
// approva e fissa da quando vale, oppure la respinge con una nota. La richiesta
// sta sull'articolo (`revRequest`): non è ancora una revisione, e così il
// registro delle revisioni resta fatto solo di revisioni approvate.
function revRichiedi(itemId, dati) {
  if (!roleGuard('bom')) return false;
  const it = getItem(itemId); if (!it || !hasRevisions(it)) return false;
  const d = dati || {};
  const err = revDalErrore(it.id, d.dal);
  if (err) { showToast(err, 'error'); return false; }
  it.revRequest = { by: currentUser ? currentUser.id : null, at: nowISO(), tipo: ECO_TIPI[d.tipo] ? d.tipo : '',
    motivo: String(d.motivo || '').trim(), dal: d.dal };
  it.revRejected = null;
  touch(it); saveDB();
  return true;
}
function revRitira(itemId) {
  if (!roleGuard('bom')) return;
  const it = getItem(itemId); if (!it || !it.revRequest) return;
  if (!isAdmin() && currentUser && it.revRequest.by && it.revRequest.by !== currentUser.id) { showToast('La richiesta la ritira chi l\'ha fatta, o l\'Amministratore', 'error'); return; }
  it.revRequest = null; touch(it); saveDB();
  revRidisegna(it); savedToast('Richiesta ritirata: la bozza torna modificabile');
}
function revRespingi(itemId, nota) {
  if (!roleGuard('bom')) return false;
  if (!isAdmin()) { showToast('Solo l\'Amministratore respinge una richiesta', 'error'); return false; }
  const it = getItem(itemId); if (!it || !it.revRequest) return false;
  it.revRejected = { by: currentUser ? currentUser.id : null, at: nowISO(), note: String(nota || '').trim(), rev: itemRev(it) };
  it.revRequest = null; touch(it); saveDB();
  return true;
}
// Le richieste in attesa, dalla più vecchia: la Home dell'Amministratore.
function revDaApprovare() {
  return (db.items || []).filter(i => i.revRequest && hasRevisions(i) && i.active !== false)
    .sort((a, b) => String(a.revRequest.at || '').localeCompare(String(b.revRequest.at || '')));
}

// ─── Attivazione (dalla 0.159.0) ───
// Il passaggio dal modello di prima: ogni assieme e parte fatta in casa che ha
// una distinta o un ciclo riceve una revisione approvata valida da oggi, se
// la bozza è diversa dall'ultima rilasciata o se non c'è mai stato un rilascio.
// Senza numero MT: non è una modifica, è il punto di partenza.
function revDaApprovareAllAvvio() {
  return (db.items || []).filter(it => {
    if (!revServe(it) || it.active === false) return false;
    if (!distintaRighe(it).length && !cicloFasi(it).length) return false;
    const ultima = revisionsOf(it.id)[0];
    return !ultima || !revDiffVuoto(revDiff(ultima.snapshot, revSnapshot(it)));
  });
}
function revAttivaModal() {
  if (!isAdmin()) { showToast('Le revisioni approvate le attiva l\'Amministratore', 'error'); return; }
  const lista = revDaApprovareAllAvvio();
  openModal(`<h3>${ico('pin', 'tinted pill', '')} Attiva le revisioni approvate</h3>
    <p>Da adesso piani, ODP e ordini di lavoro useranno solo distinte e cicli <strong>approvati e validi</strong> alla data in cui il pezzo serve. La bozza resta modificabile, ma non la usa più nessuno finché non viene approvata.</p>
    <p>Per non fermare niente, <strong>${lista.length} ${lista.length === 1 ? 'codice riceve' : 'codici ricevono'}</strong> adesso un'approvazione iniziale valida da oggi: quelli che non sono mai stati rilasciati o la cui bozza è cambiata dall'ultimo rilascio. Gli altri usano l'ultima revisione rilasciata.</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="revAttivaConfirm()">Attiva</button>
    </div>`, false, 'form');
}
function revAttiva() {
  if (!roleGuard('bom') || !isAdmin()) return -1;
  const lista = revDaApprovareAllAvvio();
  lista.forEach(it => releaseRevision(it.id, 'Approvazione iniziale', { iniziale: true }));
  db.settings.revApprovate = true;
  saveDB();
  return lista.length;
}
function revAttivaConfirm() {
  const n = revAttiva();
  if (n < 0) return;
  closeModal();
  if (typeof renderView === 'function') renderView(activeView);
  savedToast(`Revisioni approvate attive${n ? ` · ${n} approvazioni iniziali` : ''}`);
}

// ─── Interfaccia ───
function revBadge(it) {
  if (!hasRevisions(it)) return '';
  const n = revisionsOf(it.id).length;
  if (!revApprovateAttive()) {
    const titolo = n ? `Revisione in lavorazione. ${n} ${n === 1 ? 'revisione rilasciata' : 'revisioni rilasciate'}` : 'Revisione in lavorazione. Nessun rilascio finora';
    return `<span class="doc-badge rev-badge" title="${esc(titolo)}">${esc(revLabel(itemRev(it)))}${n ? ' · ' + n + ' rilasciate' : ''}</span>`;
  }
  const valida = revValidaAl(it.id), prossima = revProssima(it.id);
  const per = valida ? revPeriodo(valida) : null;
  return [
    `<span class="doc-badge rev-badge" title="Revisione del codice, quella del disegno">Codice rev. ${esc(itemCodeRev(it))}</span>`,
    valida ? `<span class="doc-badge rev-badge" title="La revisione che usano piani e ODP oggi">Valida: ${esc(revLabel(valida.rev))} dal ${esc(fmtDateIt(per.dal))}</span>`
      : (revServe(it) ? '<span class="doc-badge rev-badge" style="color:var(--red)" title="Piani e ODP non possono usare questo codice">Nessuna revisione approvata</span>' : ''),
    prossima ? `<span class="doc-badge rev-badge" title="Approvata, entra in vigore più avanti">Prossima: ${esc(revLabel(prossima.rev))} dal ${esc(fmtDateIt(revDal(prossima)))}</span>` : '',
    `<span class="doc-badge rev-badge" title="La bozza: si modifica liberamente, nessuno la usa finché non è approvata">Bozza ${esc(revLabel(itemRev(it)))}${revInApprovazione(it) ? ' · in approvazione' : ''}</span>`,
  ].join(' ');
}
// Fasce sopra la distinta: in approvazione, respinta, da allineare.
function revFasceHtml(it) {
  if (!revApprovateAttive() || !hasRevisions(it)) return '';
  const out = [];
  const q = it.revRequest;
  if (q) out.push(`<div class="rev-fascia">${ico('clock', 'tinted', '')} La bozza ${esc(revLabel(itemRev(it)))} è <strong>in approvazione</strong> dal ${esc(fmtDateIt(q.at))}, chiesta da ${esc(actorName(q.by) || '—')}, valida dal ${esc(fmtDateIt(q.dal))}. Distinta e ciclo non si modificano finché l'Amministratore non decide.</div>`);
  const no = it.revRejected;
  if (!q && no) out.push(`<div class="rev-fascia">${ico('blocked', 'tinted', '')} Richiesta respinta il ${esc(fmtDateIt(no.at))} da ${esc(actorName(no.by) || '—')}${no.note ? ': <em>' + esc(no.note) + '</em>' : ''}</div>`);
  const al = revDaAllineare(it);
  if (al) out.push(`<div class="rev-fascia">${ico('pin', 'tinted', '')} Distinta e ciclo validi (${esc(revLabel(al.r.rev))}) sono fatti per la rev. ${esc(al.r.codeRev || '00')} del codice, che ora è alla <strong>${esc(al.cr)}</strong>.
    <button class="btn-ghost" onclick="codeRevConfermaAllineata('${it.id}')">Vanno bene anche per la ${esc(al.cr)}</button></div>`);
  return out.join('');
}
// La stessa barra serve due viste: le distinte degli assiemi e i cicli delle
// parti. Sono la stessa cosa — ciò che definisce il costo di un articolo — e
// congelare l'una senza l'altra lascerebbe metà storico.
function renderRevBar(elId, itemId) {
  const el = document.getElementById(elId); if (!el) return;
  const it = getItem(itemId);
  if (!it || !hasRevisions(it)) { el.innerHTML = ''; return; }
  const attive = revApprovateAttive();
  let azioni;
  if (!attive) azioni = `<button class="btn-outline" onclick="releaseRevisionModal('${it.id}')">${ico('pin', 'tinted', '')} Nuova revisione</button>`;
  else if (it.revRequest) azioni = (isAdmin() ? `<button class="btn-outline" onclick="releaseRevisionModal('${it.id}')">${ico('pin', 'tinted', '')} Approva o respingi</button>` : '')
    + `<button class="btn-outline" onclick="revRitira('${it.id}')">Ritira richiesta</button>`;
  else azioni = `<button class="btn-outline" onclick="releaseRevisionModal('${it.id}')">${ico('pin', 'tinted', '')} ${isAdmin() ? 'Approva bozza' : 'Chiedi approvazione'}</button>`;
  el.innerHTML = `${revBadge(it)}
    ${azioni}
    <button class="btn-outline" onclick="revHistoryModal('${it.id}')">${ico('clock', 'tinted', '')} Storico revisioni</button>
    ${attive ? `<button class="btn-outline" onclick="codeRevModal('${it.id}')" title="La revisione del disegno, decisa fuori dall'app">Revisione del codice</button>` : ''}
    <button class="btn-outline" onclick="ecoRegistroModal()" title="Tutte le revisioni approvate, di tutti gli articoli">Modifiche tecniche</button>${isAssembly(it.type) ? `
    <button class="btn-outline" onclick="bomCompareModal('${it.id}')" title="Le differenze con un'altra distinta, su tutti i livelli">⇄ Confronta con…</button>` : ''}
    ${!attive && isAdmin() ? `<button class="btn-ghost" onclick="revAttivaModal()" title="Piani e ODP useranno solo revisioni approvate">Attiva le revisioni approvate…</button>` : ''}
    ${revFasceHtml(it)}`;
}
function renderBomRevBar() { renderRevBar('bom-rev-bar', currentBomId); }
function renderCyclesRevBar() { renderRevBar('cycles-rev-bar', currentCycleItemId); }
// Si ridisegna la vista da cui si è partiti, non quella dell'altro tipo.
function revRidisegna(it) {
  if (typeof activeView === 'undefined') return;
  if (activeView === 'cycles' && typeof renderCycles === 'function') renderCycles();
  else if (activeView === 'bom' && typeof renderBom === 'function') renderBom();
}

// La finestra del rilascio. Prima dell'attivazione è quella di sempre; dopo,
// con la data da cui vale, e diventa «chiedi», «approva» o «approva o
// respingi» secondo il ruolo e lo stato della bozza.
function releaseRevisionModal(itemId) {
  if (!roleGuard('bom')) return;
  const it = getItem(itemId || currentBomId); if (!it || !hasRevisions(it)) return;
  const attive = revApprovateAttive();
  const rev = itemRev(it), nome = revLabel(rev);
  const q = attive ? it.revRequest : null;
  const decide = attive && isAdmin();
  const ultima = revisionsOf(it.id)[0];
  const d = ultima ? revDiff(ultima.snapshot, revSnapshot(it)) : null;
  // Se dall'ultimo rilascio non è cambiato niente, si dice invece di lasciar
  // creare una revisione identica alla precedente: uno storico pieno di
  // revisioni uguali non è uno storico.
  const avviso = d && revDiffVuoto(d)
    ? `<p style="color:var(--red)"><strong>Dalla revisione ${esc(revLabel(ultima.rev))} non è cambiato niente.</strong> Approvarla creerebbe una copia identica.</p>` : '';
  const riepilogo = d && !revDiffVuoto(d)
    ? `<p>Rispetto alla ${esc(revLabel(ultima.rev))}: ${d.aggiunte.length} aggiunte, ${d.rimosse.length} rimosse, ${d.cambiate.length} modificate.</p>` : '';
  const dalMin = attive ? revDalMinimo(it.id) : oggiISO();
  const valida = attive ? revValidaAl(it.id) : null;
  const titolo = !attive ? `Rilascia revisione ${esc(nome)}` : (q ? `Approva o respingi la ${esc(nome)}` : (decide ? `Approva la ${esc(nome)}` : `Chiedi l'approvazione della ${esc(nome)}`));
  const testa = !attive
    ? `<p>La distinta di <strong>${esc(it.code)} — ${esc(it.name)}</strong> viene <strong>congelata così com'è</strong>, col costo di oggi. Da qui in poi si lavora sulla <strong>${esc(revLabel(nextRev(rev)))}</strong>: la ${esc(nome)} resta consultabile e non cambia più.</p>`
    : `<p>Distinta e ciclo di <strong>${esc(it.code)} — ${esc(it.name)}</strong>, per la rev. ${esc(itemCodeRev(it))} del codice. ${decide ? 'Approvata, la bozza viene <strong>congelata così com\'è</strong> e piani e ODP la useranno dalla data scelta.' : 'La bozza si blocca finché l\'Amministratore non decide.'}</p>
       ${q ? `<p>Chiesta da <strong>${esc(actorName(q.by) || '—')}</strong> il ${esc(fmtDateIt(q.at))}.</p>` : ''}`;
  const tipo = q ? q.tipo : '', motivo = q ? q.motivo : '', dal = q && q.dal >= dalMin ? q.dal : dalMin;
  const campoDal = attive ? `<div class="modal-field"><label>Valida dal</label>
      <input id="rev-dal" type="date" value="${esc(dal)}" min="${esc(dalMin)}" ${q && !decide ? 'disabled' : ''} oninput="revDalAnteprima('${it.id}')"></div>
      <p class="empty-text" id="rev-dal-nota" style="text-align:left;padding:0 0 10px">${revDalNota(it.id, dal, valida)}</p>` : '';
  const bottoni = !attive ? `<button class="add-btn-sm" onclick="releaseRevisionConfirm('${it.id}')">Rilascia ${esc(nome)}</button>`
    : q ? (decide ? `<button class="btn-outline" onclick="revRespingiModal('${it.id}')">Respingi…</button>
        <button class="add-btn-sm" onclick="releaseRevisionConfirm('${it.id}')">Approva ${esc(nome)}</button>` : '')
    : decide ? `<button class="add-btn-sm" onclick="releaseRevisionConfirm('${it.id}')">Approva ${esc(nome)}</button>`
    : `<button class="add-btn-sm" onclick="revRichiediConfirm('${it.id}')">Chiedi approvazione</button>`;
  const sola = q ? 'disabled' : '';
  openModal(`<h3>${ico('pin', 'tinted pill', '')} ${titolo}</h3>
    ${testa}
    ${riepilogo}${avviso}
    <div class="modal-field"><label>Tipo di modifica</label>
      <select id="rev-tipo" ${sola}><option value="">— scegli —</option>${Object.entries(ECO_TIPI).map(([k, v]) => `<option value="${k}"${k === tipo ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
    ${campoDal}
    <div class="modal-field"><label>Documenti aperti costruiti sulla ${attive && valida ? esc(revLabel(valida.rev)) : 'revisione attuale'}</label>
      ${ecoImpattoHtml(ecoImpatto(it.id, d), true)}</div>
    <div class="modal-field"><label>Motivo</label>
      <input id="rev-motivo" value="${esc(motivo)}" ${sola} placeholder="es. Cambio terzista per la zincatura" autocomplete="off"></div>
    <p class="empty-text" style="text-align:left;padding:0 0 10px">Il motivo è quello che si legge fra un anno per capire perché la distinta è cambiata. Vale la pena scriverlo.</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      ${bottoni}
    </div>`, false, 'form');
  setTimeout(() => { const e = document.getElementById('rev-motivo'); if (e && !e.disabled) e.focus(); }, 50);
}
// Che cosa succede alla revisione che vale oggi, con la data scelta.
function revDalNota(itemId, dal, valida) {
  const err = revDalErrore(itemId, dal);
  if (err) return `<span style="color:var(--red)">${esc(err)}</span>`;
  const per = revPeriodi(itemId).filter(p => !p.mai);
  const ultima = per.length ? per[per.length - 1] : null;
  if (!ultima) return 'È la prima revisione approvata: da quella data il codice si può usare in piani e ODP.';
  if (ultima.dal === dal) return `La ${esc(revLabel(ultima.r.rev))} comincia lo stesso giorno e non entrerà mai in vigore: vale la nuova.`;
  return `La ${esc(revLabel(ultima.r.rev))} vale fino al ${esc(fmtDateIt(addDays(dal, -1)))}.`;
}
function revDalAnteprima(itemId) {
  const el = document.getElementById('rev-dal-nota'); if (!el) return;
  el.innerHTML = revDalNota(itemId, val('rev-dal'), revValidaAl(itemId));
}
function releaseRevisionConfirm(itemId) {
  if (!roleGuard('bom')) return;
  const it = getItem(itemId || currentBomId); if (!it) return;
  const motivo = val('rev-motivo'), tipo = val('rev-tipo');
  const attive = revApprovateAttive();
  const dal = attive ? val('rev-dal') : '';
  if (attive) { const err = revDalErrore(it.id, dal); if (err) { showToast(err, 'error'); return; } }
  const richiestaDa = attive && it.revRequest ? it.revRequest.by : null;
  return conNumeri({ MT: 1 }, () => releaseRevisionFatto(it, motivo, tipo, dal, richiestaDa));
}
function releaseRevisionFatto(it, motivo, tipo, dal, richiestaDa) {
  const rec = releaseRevision(it.id, motivo, { tipo, dal, richiestaDa });
  if (!rec) { if (!revApprovateAttive()) showToast('Questo articolo non ha una distinta da rilasciare', 'error'); return; }
  closeModal();
  revRidisegna(it);
  const quando = revApprovateAttive() ? ` · valida dal ${fmtDateIt(rec.validFrom)}` : '';
  showToast(`${rec.ecoNumber}: revisione ${revLabel(rec.rev)} ${revApprovateAttive() ? 'approvata' : 'rilasciata'}${quando} — la bozza è la ${revLabel(itemRev(getItem(it.id)))}${rec.ecoImpact.length ? ` · ${rec.ecoImpact.length} documenti aperti da verificare` : ''}`);
}
function revRichiediConfirm(itemId) {
  const ok = revRichiedi(itemId, { tipo: val('rev-tipo'), motivo: val('rev-motivo'), dal: val('rev-dal') });
  if (!ok) return;
  closeModal();
  revRidisegna(getItem(itemId));
  savedToast('Approvazione chiesta: la bozza resta bloccata finché l\'Amministratore non decide');
}
function revRespingiModal(itemId) {
  const it = getItem(itemId); if (!it || !it.revRequest) return;
  openModal(`<h3>${ico('blocked', 'tinted pill', '')} Respingi la ${esc(revLabel(itemRev(it)))}</h3>
    <p>La bozza di <strong>${esc(it.code)}</strong> torna modificabile. La nota resta nella barra revisioni finché non arriva una nuova richiesta.</p>
    <div class="modal-field"><label>Perché</label><input id="rev-nota" placeholder="es. Manca la fase di sbavatura" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="revRespingiConfirm('${it.id}')">Respingi</button>
    </div>`, false, 'form');
  setTimeout(() => { const e = document.getElementById('rev-nota'); if (e) e.focus(); }, 50);
}
function revRespingiConfirm(itemId) {
  if (!revRespingi(itemId, val('rev-nota'))) return;
  closeModal();
  revRidisegna(getItem(itemId));
  savedToast('Richiesta respinta');
}

function revHistoryModal(itemId) {
  const it = getItem(itemId || currentBomId); if (!it) return;
  const lista = revisionsOf(it.id);
  const attive = revApprovateAttive();
  // La fotografia dell'attuale è la stessa per tutte le righe: si scatta una
  // volta, non tre deep-clone e un rollup di costo per ogni revisione in elenco.
  const attuale = lista.length ? revSnapshot(it) : null;
  const periodi = new Map(revPeriodi(it.id).map(p => [p.r, p]));
  const valida = revValidaAl(it.id);
  const corpo = lista.length ? lista.map(r => {
    const d = revDiff(r.snapshot, attuale);
    const quante = d.aggiunte.length + d.rimosse.length + d.cambiate.length;
    const p = periodi.get(r);
    const validita = p ? (p.mai ? 'mai entrata in vigore' : `valida dal ${fmtDateIt(p.dal)}${p.al ? ' al ' + fmtDateIt(p.al) : ''}`) : '';
    return `<div class="mgmt-item" style="display:block">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <strong style="font-family:var(--mono)">${esc(revLabel(r.rev))}</strong>${r.ecoNumber ? ` <span class="empty-text" style="padding:0;font-family:var(--mono)">${esc(r.ecoNumber)}</span>` : ''}${r.ecoKind ? ` <span class="doc-badge">${esc(ecoTipoLabel(r.ecoKind))}</span>` : ''}${attive && r === valida ? ' <span class="doc-badge">in vigore</span>' : ''}
        <span class="empty-text" style="padding:0">${esc(validita)}${r.codeRev ? ' · codice rev. ' + esc(r.codeRev) : ''}</span>
        <span style="flex:1"></span>
        <span class="empty-text" style="padding:0">${fmtPer(r.snapshot.cost ? r.snapshot.cost.total : 0, itemUom(it))}</span>
        <button class="btn-ghost" onclick="revCompareModal('${r.id}')">${quante ? '⇄ Confronta (' + quante + ')' : '⇄ Confronta'}</button>
      </div>
      <div class="empty-text" style="text-align:left;padding:2px 0 0">${esc(attive ? 'Approvata' : 'Rilasciata')} il ${esc(fmtDateIt(r.date))} da ${esc(r.createdBy ? actorName(r.createdBy) : '—')}${r.requestedBy ? ', chiesta da ' + esc(actorName(r.requestedBy)) : ''}</div>
      ${r.motivo ? `<div style="margin-top:4px">${esc(r.motivo)}</div>` : '<div class="empty-text" style="text-align:left;padding:2px 0 0">nessun motivo indicato</div>'}
      ${(r.ecoImpact || []).length ? `<div style="margin-top:4px"><span class="storico-campo">Documenti aperti al rilascio</span>${ecoImpattoHtml(r.ecoImpact)}</div>` : ''}
    </div>`;
  }).join('') : `<div class="empty-text">Nessuna revisione ${attive ? 'approvata' : 'rilasciata'}. La bozza è la ${esc(revLabel(itemRev(it)))}.</div>`;
  openModal(`<h3>${ico('clock', 'tinted pill', '')} Revisioni — ${esc(it.code)} ${esc(it.name)}</h3>
    <p>Bozza: <strong>${esc(revLabel(itemRev(it)))}</strong>. Le revisioni qui sotto sono congelate e non cambiano più.</p>
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
  const nomeDopo = dopo ? revLabel(dopo.rev) : 'bozza (' + revLabel(itemRev(it)) + ')';
  // Il selettore propone sempre l'altra metà del confronto: la distinta attuale
  // e ogni revisione diversa da quella di partenza.
  const opzioni = [`<option value=""${!contro ? ' selected' : ''}>la bozza (${esc(revLabel(itemRev(it)))})</option>`]
    .concat(lista.filter(x => x.id !== r.id).map(x =>
      `<option value="${esc(x.id)}"${contro && contro.id === x.id ? ' selected' : ''}>la ${esc(revLabel(x.rev))} del ${esc(String(x.date || '').slice(0, 10))}</option>`)).join('');
  const motivo = dopo && dopo.motivo ? dopo.motivo : (!dopo && prima.motivo ? prima.motivo : '');
  openModal(`<h3>⇄ ${esc(revLabel(prima.rev))} → ${esc(nomeDopo)}</h3>
    <p>${esc(it.code)} — ${esc(it.name)}${motivo ? ` · <em>${esc(motivo)}</em>` : ''}</p>
    ${lista.length > 1 ? `<div class="modal-field" style="max-width:420px;margin-top:10px"><label>Confronta la ${esc(revLabel(r.rev))} con</label>
      <select id="rev-contro" onchange="revCompareModal('${r.id}', this.value)">${opzioni}</select></div>` : ''}
    <div class="cost-summary">
      ${kpi('Costo alla ' + esc(revLabel(prima.rev)), fmtPer(costoPrima, u), '')}
      ${kpi(dopo ? 'Costo alla ' + esc(revLabel(dopo.rev)) : 'Costo della bozza', fmtPer(costoDopo, u), '')}
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
