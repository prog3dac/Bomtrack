// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-docs.js
// ═══════════════════════════════════════════════════════════
// Documenti verso i fornitori: blocco per stato, richieste di offerta e ordini.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  BLOCCO MODIFICHE PER STATO (condiviso RFQ / Ordini)
// ═══════════════════════════════════════════════════════════
// Un documento uscito verso il fornitore non va più toccato per distrazione, ma
// deve restare correggibile: si blocca il contenuto *contrattuale* (fornitore,
// condizioni, righe) lasciando libero l'avanzamento *operativo*.
//   'full'      tutto modificabile        (bozza, o documento sbloccato a mano)
//   'offer'     + prezzo/consegna riga    (RFQ inviata: l'offerta si compila al ritorno)
//   'reception' + colonna Ricevuto        (ODA in corso: le merci arrivano dopo l'invio)
//   'none'      sola lettura              (documento concluso o annullato)
// Stato, note documento e note di riga ('ops') restano sempre modificabili.
const LOCK_KINDS = { full: ['contract', 'offer', 'reception'], offer: ['offer'], reception: ['reception'], none: [] };
function modeAllows(mode, kind) {
  return kind === 'ops' || (LOCK_KINDS[mode] || LOCK_KINDS.full).includes(kind);
}
// Lo sblocco vale per il documento aperto e dura quanto la sessione di editing:
// uscendo verso l'elenco il documento si richiude da solo.
let rfqUnlockedId = null, orderUnlockedId = null, odlUnlockedId = null;
function docLockBanner(mode, kind, docKind, id) {
  if (mode === 'full') return '';
  const what = mode === 'offer' ? 'Prezzo unitario e data consegna restano compilabili'
    : mode === 'reception' ? 'La colonna Ricevuto resta compilabile'
      : 'Il documento è in sola lettura';
  // Il gestore si compone qui da un tipo noto, non arriva come JavaScript grezzo
  // dal chiamante: nessun template deve poter iniettare codice in un onclick.
  // Una mappa e non una catena di ternari: l'ODL ricadeva su `rfqUnlock`, che
  // su un id di ordine di lavoro non trova niente e torna in silenzio — il
  // pulsante c'era e non sbloccava nulla.
  const fn = { order: 'ordUnlock', odl: 'odlUnlock', odp: 'odpUnlock' }[docKind] || 'rfqUnlock';
  return `<div class="doc-lock-banner">
    <span>${ico('lock', 'tinted', '')} ${esc(kind)} — i dati sono protetti dalle modifiche accidentali. ${what}; note e stato restano sempre modificabili.</span>
    <button class="btn-outline" onclick="${fn}('${esc(id)}')">${ico('unlock', 'tinted', '')} Sblocca per modifica</button></div>`;
}
// Disabilita in un passaggio gli input marcati, invece di condizionare ogni template.
function applyDocLock(mode, host) {
  if (!host) return;
  ['contract', 'offer', 'reception'].forEach(kind => {
    const off = !modeAllows(mode, kind);
    host.querySelectorAll('.lock-' + kind).forEach(el => {
      el.disabled = off;
      if (off) el.title = 'Documento bloccato: usa «Sblocca per modifica»';
    });
  });
}
function statusBadge(map, status) {
  return `<span class="doc-badge st-${esc(status)}">${esc(map[status] || status)}</span>`;
}
// Generare il documento è il momento in cui esce verso il fornitore, ma capita
// di stampare una bozza di controllo: si chiede, non si impone.
// Solo a chi può cambiare lo stato (dalla 0.105.3): esportare è una lettura e
// non ha guardia, e un lettore che rispondeva «sì» segnava il documento come
// inviato — nell'archivio condiviso un invio che il server rifiuta e che
// fermava la coda.
// `dopo` (dalla 0.112.0) è ciò che segue il «sì»: la copia del PDF in archivio
// (documenti.js). Il documento diventa ufficiale in quel momento, ed è quella
// la copia da conservare.
function askMarkSent(doc, question, sentStatus, rerender, dopo) {
  if (doc.status !== 'bozza' || !canWrite('docs')) return;
  askConfirm(question + (dopo ? '\nIl PDF verrà copiato nella cartella d\'archivio.' : ''), () => {
    doc.status = sentStatus;
    touch(doc); saveDB(); rerender();
    showToast('Stato: ' + sentStatus.charAt(0).toUpperCase() + sentStatus.slice(1));
    if (dopo) dopo();
  }, { title: 'Documento generato', ok: 'Sì, segna come inviato', cancel: 'No, resta in bozza', safe: true });
}

// ═══════════════════════════════════════════════════════════
//  I DUE TIPI DI DOCUMENTO
// ═══════════════════════════════════════════════════════════
// Richieste d'offerta e ordini sono lo stesso oggetto — una testata con un
// fornitore, delle righe, uno stato e un blocco che dipende dallo stato — e per
// molte versioni sono stati due copie quasi identiche di una ventina di
// funzioni. Le differenze vere sono poche e stanno tutte qui dentro:
//
//   la richiesta                        l'ordine
//   ─────────────────────────────────   ────────────────────────────────────
//   il prezzo è la risposta attesa,     il prezzo è concordato e nasce con
//   arriva dopo l'invio ('offer')       la riga; dopo l'invio arrivano invece
//                                       le merci ('reception')
//   lo stato deriva dai prezzi          lo stato deriva dai ricevimenti
//   nessun ricevimento sulle righe      ogni riga porta il proprio `received`
//
// Tutto il resto — guardie, blocchi, sblocco, modifica campi e righe,
// aggiunta da catalogo, salvataggio, eliminazione — è una funzione sola,
// parametrica sul tipo. I nomi storici (`rfqSetLine`, `ordSetLine`…) restano
// come adattatori di una riga: sono citati in centinaia di `onclick` nei
// template, e cambiarli non avrebbe aggiunto niente se non rischio.
const RFQ_STATUS = { bozza: 'Bozza', inviata: 'Inviata', ricevuta: 'Offerta ricevuta', chiusa: 'Chiusa' };
const RFQ_LOCK = { bozza: 'full', inviata: 'offer', ricevuta: 'offer', chiusa: 'none' };
const ORDER_STATUS = { bozza: 'Bozza', inviato: 'Inviato', confermato: 'Confermato', parziale: 'Parziale', evaso: 'Evaso', annullato: 'Annullato' };
// Dopo l'invio le merci continuano ad arrivare: si blocca il contenuto dell'ordine
// ma non la registrazione dei ricevimenti.
const ORDER_LOCK = { bozza: 'full', inviato: 'reception', confermato: 'reception', parziale: 'reception', evaso: 'reception', annullato: 'none' };

const DOC_KINDS = {
  rfq: {
    coll: 'rfqs', pfx: 'rl',
    nome: 'Richiesta', articolo: 'La richiesta', pronome: 'la', suffisso: 'a',   // «sbloccarla», «richiesta sbloccata»
    STATUS: RFQ_STATUS, LOCK: RFQ_LOCK,
    hasLinePrice: false,          // la richiesta è la domanda, non la risposta
    get: id => getRfq(id),
    all: () => db.rfqs,
    render: () => renderRfq(),
    autoStatus: r => rfqAutoStatus(r),
    unlocked: () => rfqUnlockedId,
    setUnlocked: v => { rfqUnlockedId = v; },
    dirty: v => { if (v === undefined) return rfqDirty; rfqDirty = v; return v; },
    currentId: () => currentRfqId,
    saveBtnId: 'rfq-save-btn', exportBtnClass: 'rfq-export-btn',
    dirtyHint: 'Salva la richiesta prima di generare il documento',
    // Campi che restano modificabili a documento bloccato.
    opsFields: ['status', 'notes', 'notesInternal'],
    // Il campo di riga decide quale blocco lo governa: prezzo e consegna sono
    // ciò che torna con l'offerta, e restano aperti a richiesta inviata.
    lineLock: field => (field === 'price' || field === 'deliveryDate') ? 'offer' : 'contract',
    numLineFields: ['qty', 'price'],
    newLineExtra: () => ({}),
    // Una riga da catalogo su una richiesta non porta prezzo: si chiede
    // un'offerta nell'unità in cui quel fornitore quota, non gli si dice quanto
    // deve costare.
    catalogLine: riga => Object.assign(riga, { price: '' }),
    catalogToast: (n) => n + ' righe aggiunte',
  },
  order: {
    coll: 'orders', pfx: 'ol',
    nome: 'Ordine', articolo: "L'ordine", pronome: 'lo', suffisso: 'o',
    STATUS: ORDER_STATUS, LOCK: ORDER_LOCK,
    hasLinePrice: true,
    get: id => getOrder(id),
    all: () => db.orders,
    render: () => renderOrders(),
    autoStatus: o => ordAutoStatus(o),
    unlocked: () => orderUnlockedId,
    setUnlocked: v => { orderUnlockedId = v; },
    dirty: v => { if (v === undefined) return orderDirty; orderDirty = v; return v; },
    currentId: () => currentOrderId,
    saveBtnId: 'order-save-btn', exportBtnClass: 'order-export-btn',
    dirtyHint: "Salva l'ordine prima di generare il documento",
    opsFields: ['status', 'notes', 'notesInternal', 'supplierConfirmation'],
    // I ricevimenti si registrano proprio a ordine inviato, e la data confermata
    // dal fornitore arriva dopo l'invio per definizione: stesso gruppo.
    lineLock: field => (field === 'received' || field === 'confirmedDate') ? 'reception' : 'contract',
    numLineFields: ['qty', 'price', 'received'],
    newLineExtra: () => ({ received: 0 }),
    catalogLine: riga => Object.assign(riga, { received: 0 }),
    catalogToast: (n, senzaPrezzo, doc) => senzaPrezzo
      // Le righe senza prezzo si dicono subito. Restano vuote apposta — questo
      // fornitore non le ha mai quotate — ma un ordine che parte con righe a
      // zero è un ordine da rifare, e chi lo compila deve saperlo adesso.
      // (showToast passa già da esc(): il nome del fornitore va concatenato crudo.)
      ? `${n} righe aggiunte · ${senzaPrezzo} senza prezzo: ${supplierName(doc.supplierId) || 'questo fornitore'} non le ha a listino`
      : n + ' righe aggiunte',
    // Il n° di conferma d'ordine è la prova che il fornitore ha accettato.
    afterSetField: (o, field, value) => {
      if (field === 'supplierConfirmation' && value && o.status === 'inviato') o.status = 'confermato';
    },
    // Non si può ricevere più di quanto ordinato: sarebbe una riga in eccedenza
    // che manderebbe l'ordine in "evaso" con numeri incoerenti.
    afterSetLine: (o, l, field) => {
      if (field !== 'received') return;
      const ordinata = Number(l.qty) || 0;
      if (l.received > ordinata) { l.received = ordinata; showToast('Non si può ricevere più di quanto ordinato', 'error'); }
    },
  },
  // ─── Ordine di lavoro (ODL) ───
  // Le lavorazioni affidate a un terzista. Stessa forma di un ordine
  // d'acquisto — si manda a un fornitore, si conferma, rientra a pezzi — e un
  // documento diverso: uno chiede della merce, l'altro manda dei pezzi a
  // lavorare. Stati e blocchi sono gli stessi, e riusarli è deliberato: dove il
  // comportamento coincide davvero, due copie divergono.
  //
  // Le sue righe **non hanno mai un articolo**: portano la fase del ciclo da cui
  // vengono. È la garanzia contro il doppio conteggio di magazzino, e vale qui
  // per costruzione invece che per disciplina — dall'ODL non si aggiungono righe
  // da catalogo, perché non c'è niente da catalogo da aggiungere.
  odl: {
    coll: 'workOrders', pfx: 'wl',
    nome: 'Ordine di lavoro', articolo: "L'ordine di lavoro", pronome: 'lo', suffisso: 'o',
    STATUS: ORDER_STATUS, LOCK: ORDER_LOCK,
    hasLinePrice: true,
    get: id => getOdl(id),
    all: () => db.workOrders,
    render: () => renderOdl(),
    autoStatus: o => ordAutoStatus(o),
    unlocked: () => odlUnlockedId,
    setUnlocked: v => { odlUnlockedId = v; },
    dirty: v => { if (v === undefined) return odlDirty; odlDirty = v; return v; },
    currentId: () => currentOdlId,
    saveBtnId: 'odl-save-btn', exportBtnClass: 'odl-export-btn',
    dirtyHint: "Salva l'ordine di lavoro prima di generare il documento",
    opsFields: ['status', 'notes', 'notesInternal', 'supplierConfirmation'],
    lineLock: field => (field === 'received' || field === 'confirmedDate') ? 'reception' : 'contract',
    numLineFields: ['qty', 'price', 'received'],
    newLineExtra: () => ({ received: 0, startDate: '', phaseKey: null, phaseKeys: null, odpId: null, odpPhaseId: null }),
    // Non si aggiungono righe da catalogo a un ordine di lavoro: un articolo non
    // è una lavorazione. La voce non compare nell'interfaccia; se qualcuno ci
    // arrivasse lo stesso, qui non succede niente invece di nascere una riga che
    // caricherebbe il magazzino da un documento che non deve caricarlo.
    catalogLine: riga => Object.assign(riga, { received: 0, startDate: '', itemId: null, phaseKey: null, phaseKeys: null, odpId: null, odpPhaseId: null }),
    catalogToast: n => n + ' righe aggiunte',
    afterSetField: (o, field, value) => {
      if (field === 'supplierConfirmation' && value && o.status === 'inviato') o.status = 'confermato';
    },
    afterSetLine: (o, l, field) => {
      if (field !== 'received') return;
      const ordinata = Number(l.qty) || 0;
      if (l.received > ordinata) { l.received = ordinata; showToast('Non si può ricevere più di quanto ordinato', 'error'); }
    },
  },
};
// Su una riga che viene da un ordine di produzione i **pezzi rientrati** li
// dichiara quello: è lo stesso fatto scritto in due posti, e tenerli d'accordo
// a mano è il modo di vederli divergere. Il campo resta quello di sempre, con
// gli stessi lettori — cambia solo chi lo scrive.
function odlRigaDaOdp(l) { return !!(l && l.odpId); }
// A che punto è la lavorazione di una riga (dalla 0.113.0). Emettere l'ordine
// di lavoro non è mandare il pezzo: la riga è **in lavorazione** quando è
// avviata e **fatta** quando i pezzi sono rientrati. Se il padrone è un ordine
// di produzione lo dicono avvio e dichiarazione delle sue fasi; sulle altre gli
// eventi della riga (o i movimenti dei comandi di prima), e i rientrati.
//   '' · 'lavorazione' · 'fatto'
function odlAvanzamentoRiga(o, l) {
  const leg = odlLegameAttivo(o, l);
  if (leg) return odpAvanzamentoTratta(leg.odp, leg.fasi[0]);
  const qty = Number(l.qty) || 0;
  const somma = m => Array.from(m.values()).reduce((a, b) => a + b, 0);
  const tornati = Math.max(Number(l.received) || 0, l.phaseKey ? somma(clRegistrato(o, odlAncore(o, l).ultima, 'in')) : 0);
  if (qty > 0 && tornati >= qty - 0.000001) return 'fatto';
  return odlRigaAvviata(o, l) || tornati > 0 ? 'lavorazione' : '';
}
const ODL_AVANZAMENTO = { '': 'da inviare', lavorazione: 'in lavorazione', fatto: 'rientrata' };
// Da quale ordine di produzione viene questo ordine di lavoro. Serve a
// ritrovare, mesi dopo, *perché* si è commissionata una lavorazione — e a
// sapere dove si registrano i suoi movimenti.
function odlOdpRef(o) {
  if (!o.odpId || typeof getOdp !== 'function') return '';
  const p = getOdp(o.odpId); if (!p) return '';
  return `<div class="empty-text" style="text-align:left">${ico('factory', 'tinted', '')} Generato dall'ordine di produzione <strong>${esc(p.number)}</strong> — ${esc((p.code || '') + ' ' + (p.name || ''))}. Il materiale e i pezzi si registrano <strong>lì</strong>.</div>`;
}
function docKind(k) { return DOC_KINDS[k] || DOC_KINDS.rfq; }
function docStatusLabel(K, doc) { return (K.STATUS[doc.status] || doc.status || '').toLowerCase(); }

function docMode(k, doc) {
  const K = docKind(k);
  return (doc && K.unlocked() === doc.id) ? 'full' : ((doc && K.LOCK[doc.status]) || 'full');
}
// Guard dei mutatori: il blocco vive qui, non nella UI (che si limita a
// disabilitare). Il ruolo viene prima dello stato — chi non può scrivere
// documenti non passa nemmeno su una bozza.
function docGuard(k, id, lockKind) {
  const K = docKind(k);
  // I ricevimenti li registra anche l'officina (area `shop`).
  if (!(lockKind === 'reception' ? roleGuardShop('docs') : roleGuard('docs'))) return false;
  const doc = K.get(id); if (!doc) return false;
  if (modeAllows(docMode(k, doc), lockKind)) return true;
  showToast(`${K.nome} ${docStatusLabel(K, doc)}: usa «Sblocca per modifica»`, 'error');
  return false;
}
// Le funzioni di riga di ogni tipo di documento (rfqSaveLineEdit, ordSaveLineEdit,
// odlSaveLineEdit…): l'ODL passava da quelle della richiesta, che non lo
// trovavano, e «Salva» e «Aggiungi» non facevano niente.
const DOC_PFX_FN = { rfq: 'rfq', order: 'ord', odl: 'odl' };
function docUnlock(k, id) {
  if (!roleGuard('docs')) return;
  const K = docKind(k);
  const doc = K.get(id); if (!doc) return;
  askConfirm(`${K.articolo} ${doc.number} risulta ${docStatusLabel(K, doc)}.\nSbloccarl${K.suffisso} per modificarl${K.suffisso}?`, () => {
    K.setUnlocked(id); K.render(); showToast(`${K.nome} sbloccat${K.suffisso}`);
  }, { title: 'Sblocca per modifica', ok: 'Sblocca', safe: true });
}
// Salvataggio differito: le modifiche restano in memoria e si persistono solo
// con "Salva". Finché ci sono modifiche non salvate i pulsanti che generano il
// documento restano disabilitati — un PDF che non corrisponde a ciò che è
// salvato è peggio di nessun PDF.
function docMarkDirty(k) {
  const K = docKind(k);
  K.dirty(true);
  const sv = document.getElementById(K.saveBtnId); if (sv) sv.classList.add('dirty');
  document.querySelectorAll('.' + K.exportBtnClass).forEach(b => { b.disabled = true; b.title = K.dirtyHint; });
}
function docSave(k, id) {
  const K = docKind(k);
  const doc = K.get(id); if (!doc) return;
  // Si tocca il documento solo se c'era davvero qualcosa in sospeso (dalla
  // 0.105.6). Il «Salva» premuto a vuoto lo ritoccava comunque, anche da chi
  // non scrive i documenti — un lettore, o l'officina su una richiesta — e
  // nell'archivio condiviso quella riga «modificata» il server la respingeva,
  // fermando con sé il lotto delle modifiche in attesa. Le modifiche vere
  // passano già dalle loro guardie, e ciascuna tocca il documento da sé.
  if (K.dirty()) touch(doc);
  saveDB(); K.dirty(false); K.render();
  showToast(`${K.nome} salvat${K.suffisso}`);
}
function docSetField(k, id, field, value) {
  const K = docKind(k);
  const lockKind = K.opsFields.includes(field) ? 'ops' : 'contract';
  if (!docGuard(k, id, lockKind)) { K.render(); return; }
  const doc = K.get(id); if (!doc) return;
  const before = doc.status;
  doc[field] = campoTesto(value) || (field === 'supplierId' ? null : '');
  if (K.afterSetField) K.afterSetField(doc, field, value);
  touch(doc); docMarkDirty(k);
  // Il cambio di stato cambia anche il livello di blocco: la vista va rifatta.
  if (doc.status !== before || field === 'status') {
    K.render();
    if (doc.status !== before) showToast('Stato: ' + (K.STATUS[doc.status] || doc.status));
  }
}
// Alla scelta del fornitore si ereditano le sue condizioni predefinite.
function docSetSupplier(k, id, sid) {
  const K = docKind(k);
  if (!docGuard(k, id, 'contract')) { K.render(); return; }
  const doc = K.get(id); if (!doc) return;
  const prima = doc.supplierId || null;
  doc.supplierId = sid || null;
  const sup = sid ? getSupplier(sid) : null;
  if (sup) {
    if (sup.defaultTransport) doc.transport = sup.defaultTransport;
    if (sup.defaultPayment) doc.payment = sup.defaultPayment;
  }
  touch(doc); docMarkDirty(k); K.render();
  if (k !== 'rfq' && sup && sup.id !== prima) docListinoModal(k, id);
}

// ─── Il listino del fornitore appena scelto (dalla 0.105.6) ───
// Le righe si compilano anche prima di scegliere il fornitore, e allora
// nascono senza prezzo (docLineFromItem); cambiato il fornitore, ogni riga
// dice «⚠ … a listino» (ordLineListinoWarn). In tutti e due i casi le
// quotazioni ci sono, e ricopiarle a mano riga per riga era il solo modo.
// Qui si **propongono**: nessun prezzo cambia da sé, è la regola su cui poggia
// il resto, ma un clic le applica. Di serie solo alle righe senza prezzo; a
// quelle che ne hanno uno diverso solo se lo si chiede, perché quel numero può
// essere un prezzo concordato.
//
// La richiesta d'offerta resta fuori: lì il prezzo è la risposta del
// fornitore, non un listino da applicare.
function docListinoProposta(k, id) {
  const doc = docKind(k).get(id);
  const out = { vuote: [], diverse: [] };
  if (!doc || !doc.supplierId) return out;
  (doc.lines || []).forEach(l => {
    if (!l.itemId) return;
    const it = getItem(l.itemId);
    const row = supplierPriceRow(it, doc.supplierId);
    if (!row || row.price === '' || row.price == null) return;
    if (l.price === '' || l.price == null) out.vuote.push(l.id);
    else if (Math.abs((rowUnitCost(it, row) || 0) - Number(l.price)) >= 0.00005) out.diverse.push(l.id);
  });
  return out;
}
function docListinoModal(k, id) {
  const doc = docKind(k).get(id); if (!doc) return;
  const pr = docListinoProposta(k, id);
  const nv = pr.vuote.length, nd = pr.diverse.length;
  if (!nv && !nd) return;
  const sup = supplierName(doc.supplierId) || 'questo fornitore';
  const righe = n => n === 1 ? '1 riga' : n + ' righe';
  openModal(`<h3>${ico('tag', 'tinted pill', '')} Applicare il listino di ${esc(sup)}?</h3>
    <p>${esc(sup)} ha a listino ${nv ? `<strong>${righe(nv)} senza prezzo</strong>` : ''}${nv && nd ? ' e ' : ''}${nd ? `${righe(nd)} con un prezzo diverso da quello in riga` : ''}.</p>
    ${nd ? `<label class="flag-check" style="margin:6px 0"><input type="checkbox" id="lst-diverse"${nv ? '' : ' checked'}> Sostituisci anche i prezzi già scritti (${righe(nd)})</label>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Un prezzo in riga può essere concordato: lascialo se non sei sicuro.</p>` : ''}
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">No, lascia i prezzi</button>
      <button class="add-btn-sm" onclick="docApplicaListino('${k}','${id}', !!(document.getElementById('lst-diverse') || {}).checked); closeModal()">${ico('check', '', '')} Applica il listino</button>
    </div>`, false, 'form');
}
// Torna quante righe ha cambiato. Il prezzo passa da rowUnitCost(), la stessa
// porta di docLineFromItem: già convertito nell'unità di gestione della riga.
function docApplicaListino(k, id, ancheDiverse) {
  const K = docKind(k);
  if (!docGuard(k, id, 'contract')) return 0;
  const doc = K.get(id); if (!doc) return 0;
  const pr = docListinoProposta(k, id);
  const ids = pr.vuote.concat(ancheDiverse ? pr.diverse : []);
  let n = 0;
  (doc.lines || []).forEach(l => {
    if (!ids.includes(l.id)) return;
    const it = getItem(l.itemId);
    l.price = rowUnitCost(it, supplierPriceRow(it, doc.supplierId)) || 0;
    n++;
  });
  if (!n) return 0;
  if (K.autoStatus) K.autoStatus(doc);
  touch(doc); docMarkDirty(k); K.render();
  showToast(`Listino di ${supplierName(doc.supplierId) || 'fornitore'} applicato: ${n === 1 ? '1 riga' : n + ' righe'}`);
  return n;
}
function docSetLine(k, id, lineId, field, value) {
  const K = docKind(k);
  if (!docGuard(k, id, K.lineLock(field))) { K.render(); return; }
  const doc = K.get(id); if (!doc) return;
  const l = (doc.lines || []).find(x => x.id === lineId); if (!l) return;
  const before = doc.status;
  const ricevutoPrima = l.received;
  // Modifica diretta in tabella: niente messaggi, si riporta a 0 (il vincolo è
  // anche sull'input, qui si copre l'incollaggio di testo).
  if (K.numLineFields.includes(field)) {
    l[field] = (value === '' ? (field === 'received' ? 0 : '') : clampNum(parseFloat(value), 0));
  } else l[field] = value;
  if (K.afterSetLine) K.afterSetLine(doc, l, field);
  // Il ricevuto non si scrive: si registra la differenza come evento. Il
  // totale digitato resta la cosa che l'utente vede e controlla.
  if (field === 'received') {
    const totale = l.received;
    l.received = ricevutoPrima;
    registraRicevuto(K.coll, doc, l, totale);
  }
  // Lo stato si ricalcola solo se cambia ciò da cui dipende: ricevuto,
  // quantità, prezzo (per la richiesta). Una nota o una data confermata non
  // devono riscrivere uno stato scelto a mano (dalla 0.105.5: un ordine
  // chiuso corto come «Evaso» tornava «Parziale» alla prima nota).
  if (['received', 'qty', 'price'].includes(field)) K.autoStatus(doc);
  touch(doc); docMarkDirty(k);
  if (doc.status !== before) { K.render(); showToast('Stato: ' + (K.STATUS[doc.status] || doc.status)); }
  else if (K.numLineFields.includes(field)) K.render();
}
// ─── La riga rispetta il lotto d'acquisto dell'articolo? ───
// Solo informativo, mai bloccante: chi scrive la riga può avere ragioni che
// l'app non vede (un resto di magazzino, un accordo particolare). Vale solo
// per righe da catalogo — una riga manuale non ha un articolo da cui prendere
// il lotto.
function lineLotWarn(l) {
  if (!l.itemId) return '';
  const it = getItem(l.itemId);
  const lot = it && lotSizeOf(it);
  if (!(lot > 0)) return '';
  const uom = l.uom || itemUom(it);
  // La quantità di riga può essere nell'unità alternativa (es. kg su un
  // articolo gestito a metri): il lotto è definito nell'unità di gestione,
  // quindi il confronto va fatto lì.
  const qty = uom === altUomOf(it) ? fromAltUom(it, l.qty, uom) : (Number(l.qty) || 0);
  if (!(qty > 0)) return '';
  const gUom = it.uom || uom;
  if (lotModeOf(it) === 'min') {
    if (qty >= lot - 1e-9) return '';
    return `<span class="mrp-warn" title="Sotto il minimo ordinabile di ${esc(fmtUom(lot, gUom))} per questo articolo">↑ minimo ${esc(fmtUom(lot, gUom))}</span>`;
  }
  const resto = qty % lot;
  if (resto < 1e-9 || lot - resto < 1e-9) return '';
  const multiplo = Math.ceil(qty / lot - 1e-9) * lot;
  return `<span class="mrp-warn" title="Questo articolo si compra solo a multipli di ${esc(fmtUom(lot, gUom))}: il più vicino per eccesso è ${esc(fmtUom(multiplo, gUom))}">↑ lotto ${esc(fmtUom(lot, gUom))}</span>`;
}
function docDelLine(k, id, lineId) {
  const K = docKind(k);
  if (!docGuard(k, id, 'contract')) return;
  const doc = K.get(id); if (!doc) return;
  doc.lines = (doc.lines || []).filter(x => x.id !== lineId);
  K.autoStatus(doc); touch(doc); docMarkDirty(k); K.render();
}
function docAddManualLine(k, id) {
  const K = docKind(k), p = K.pfx;
  if (!docGuard(k, id, 'contract')) return;
  const doc = K.get(id); if (!doc) return;
  const desc = val(p + '-desc'); if (!desc) { showToast('Descrizione richiesta', 'error'); return; }
  if (isNeg(p + '-qty')) { showToast('La quantità non può essere negativa', 'error'); return; }
  if (K.hasLinePrice && isNeg(p + '-price')) { showToast('Il prezzo non può essere negativo', 'error'); return; }
  doc.lines.push(Object.assign({
    id: gid(), itemId: null, code: val(p + '-code'), description: desc, uom: val(p + '-uom') || defaultUom(),
    qty: numVal(p + '-qty', 0) || 1,
    price: K.hasLinePrice ? (val(p + '-price') === '' ? '' : numVal(p + '-price', 0)) : '',
    deliveryDate: '', note: val(p + '-note'),
  }, K.newLineExtra()));
  K.autoStatus(doc); touch(doc); docMarkDirty(k); closeModal(); K.render();
}
// Modifica riga: per le righe manuali si possono correggere anche codice,
// descrizione e U.M.; per quelle da catalogo restano legate all'articolo.
// Su documento bloccato resta modificabile la sola nota: gli altri campi si
// mostrano comunque, in grigio, così la riga è consultabile per intero.
function docEditLineModal(k, id, lineId) {
  const K = docKind(k), p = K.pfx;
  const doc = K.get(id); if (!doc) return;
  const l = (doc.lines || []).find(x => x.id === lineId); if (!l) return;
  const ro = !modeAllows(docMode(k, doc), 'contract');
  const lotWarn = lineLotWarn(l);
  const qty = `<div class="modal-field"><label id="${p}-qty-label">${docQtyLabel(l.uom || '')}</label>
    <input id="${p}-qty" type="number" value="${l.qty}" min="0" step="any" ${ro ? 'disabled' : ''}>
    ${lotWarn ? `<span class="empty-text" style="padding:0">${lotWarn}</span>` : ''}</div>`;
  const prezzo = K.hasLinePrice ? `<div class="modal-field"><label id="${p}-price-label">${docPriceLabel(l.uom || '')}</label>
    <input id="${p}-price" type="number" min="0" step="any" value="${l.price === '' || l.price == null ? '' : l.price}" ${ro ? 'disabled' : ''}></div>` : '';
  openModal(`<h3>${ico('edit', 'tinted pill', '')} Modifica riga</h3>
    ${lineIdentityFields(p, l, ro)}
    ${prezzo ? `<div class="modal-grid">${qty}${prezzo}</div>` : qty}
    <div class="modal-field"><label>Nota (stampata sul documento)</label><textarea id="${p}-note" rows="2">${esc(l.note || '')}</textarea></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="${DOC_PFX_FN[k] || 'rfq'}SaveLineEdit('${esc(id)}','${esc(lineId)}')">Salva</button></div>`);
}
function docSaveLineEdit(k, id, lineId) {
  const K = docKind(k), p = K.pfx;
  // La nota passa anche a documento bloccato, ma solo a chi scrive i documenti.
  if (!roleGuard('docs')) { closeModal(); return; }
  const doc = K.get(id); if (!doc) return;
  const l = (doc.lines || []).find(x => x.id === lineId); if (!l) return;
  const prima = { qty: l.qty, price: l.price };
  if (modeAllows(docMode(k, doc), 'contract')) {
    if (!readLineIdentity(p, l)) return;
    if (isNeg(p + '-qty')) { showToast('La quantità non può essere negativa', 'error'); return; }
    if (K.hasLinePrice && isNeg(p + '-price')) { showToast('Il prezzo non può essere negativo', 'error'); return; }
    l.qty = numVal(p + '-qty', 0);
    if (K.hasLinePrice) l.price = val(p + '-price') === '' ? '' : numVal(p + '-price', 0);
  }
  l.note = val(p + '-note');   // la nota passa sempre, anche a documento bloccato
  if (l.qty !== prima.qty || l.price !== prima.price) K.autoStatus(doc);   // come in docSetLine
  touch(doc); docMarkDirty(k); closeModal(); K.render();
}
function docAddCatalogLines(k, id, ids) {
  const K = docKind(k);
  if (!docGuard(k, id, 'contract')) return;
  const doc = K.get(id); if (!doc) return;
  let senzaPrezzo = 0;
  ids.forEach(itemId => {
    const it = getItem(itemId); if (!it) return;
    const riga = K.catalogLine(docLineFromItem(it, doc.supplierId));
    if (riga.price === '') senzaPrezzo++;
    doc.lines.push(riga);
  });
  K.autoStatus(doc); touch(doc); docMarkDirty(k); closeModal(); K.render();
  showToast(K.catalogToast(ids.length, senzaPrezzo, doc));
}
// ─── Intestazione di un documento che esce: chi ordina, chi riceve ───
// Le stesse righe su PDF ed Excel, per la richiesta e per l'ordine: nome,
// indirizzo, partita IVA, referente e recapiti. Le vuote cadono qui, così un
// fornitore senza telefono non lascia una riga bianca in mezzo al blocco.
// `bilingue` mette l'etichetta IT/EN dei documenti stampati, che vanno anche
// a fornitori esteri.
function docPartyLines(e, bilingue) {
  if (!e) return [];
  const iva = bilingue ? 'P.IVA / VAT ' : 'P.IVA ';
  return [e.name, ...addressLines(e), e.vat ? iva + e.vat : '', e.referente, e.email, e.phone]
    .map(s => s || '').filter(Boolean);
}
// ─── La coda di un documento stampato: trasporto, pagamento, note ───
// Le condizioni che chiudono richieste, ordini e ordini di lavoro. Erano tre
// blocchi identici, e tutti e tre scrivevano con doc.text() a y crescente senza
// mai guardare dove finisse la pagina.
//
// Due modi di sparire,**entrambi silenziosi** — il PDF si generava senza un
// errore, e mancava solo quando qualcuno andava a cercarlo:
//   - una nota lunga usciva dal margine destro e veniva tagliata, perché
//     doc.text() non manda a capo da solo;
//   - su un ordine con molte righe finalY è già in fondo al foglio, e le
//     condizioni venivano disegnate **oltre il bordo**, dove non esiste carta.
//
// Sono le condizioni contrattuali di un ordine che parte verso un fornitore:
// il posto meno adatto a un troncamento che non si annuncia.
const PDF_MARGINE = 14;          // lo stesso margine sinistro del resto del foglio
const PDF_INTERLINEA = 5;
function docCoda(doc, voci, y) {
  const pagina = doc.internal.pageSize;
  const largh = (pagina.getWidth ? pagina.getWidth() : pagina.width) - PDF_MARGINE * 2;
  const fondo = (pagina.getHeight ? pagina.getHeight() : pagina.height) - PDF_MARGINE;
  voci.filter(v => v && v.testo).forEach(v => {
    // Una voce può occupare più righe: si spezza sulla larghezza utile, e poi si
    // scrive **a gruppi di righe che ci stanno**. Non basta cambiare foglio
    // quando il blocco non entra: una nota di quattromila caratteri è più alta
    // di una pagina intera, e spostarla su un foglio nuovo la farebbe traboccare
    // da quello — stesso troncamento silenzioso, un foglio più in là.
    const righe = doc.splitTextToSize(v.etichetta + ': ' + v.testo, largh);
    let i = 0;
    while (i < righe.length) {
      if (y + PDF_INTERLINEA > fondo) { doc.addPage(); y = PDF_MARGINE + 6; }
      const quante = Math.max(1, Math.floor((fondo - y) / PDF_INTERLINEA));
      const blocco = righe.slice(i, i + quante);
      doc.text(blocco, PDF_MARGINE, y);
      y += blocco.length * PDF_INTERLINEA;
      i += blocco.length;
    }
  });
  return y;
}

// ─── Le parti uguali di richiesta, ordine e ordine di lavoro (dalla 0.107.0) ───
// La logica dei tre documenti è comune dalla 0.41.0 (§22 di
// docs/analisi-tecnica.md); la presentazione era rimasta scritta tre volte, e
// una correzione fatta su un documento si dimenticava sugli altri due. Qui le
// parti identiche: la testata dello schermo, la barra dei documenti, la testata
// del PDF e del foglio Excel, il nome del file. Le righe restano di ciascuno,
// perché sono proprio quello in cui i tre documenti differiscono.
//
// `pfx` è il prefisso dei gestori del documento (rfq, ord, odl): rfqSetField,
// ordSetLine, odlEditLineModal… hanno tutti lo stesso nome a meno di quello.

function docCoWarnHtml() {
  const co = db.settings.company || {};
  return co.name ? '' : `<div class="rfq-warn">${ico('warning', 'tinted', '')} Dati azienda non impostati: compilali in <strong>Gestione › Dati azienda</strong> per stamparli sul documento.</div>`;
}
// Il codice e la descrizione che il fornitore usa per l'articolo, sotto la riga.
function docSupInfoSub(si) {
  return si ? `<div class="rfq-cmp-sub">${ico('tag', 'tinted', 'Codice presso il fornitore')} ${esc(si.code || '—')}${si.desc ? ' · ' + esc(si.desc) : ''}</div>` : '';
}
function docLineNoteSub(l) {
  return l.note ? `<div class="line-note">${ico('edit', 'tinted', 'Nota di riga')} ${esc(l.note)}</div>` : '';
}
function docLineActionsCell(pfx, id, l) {
  return cell2(`<button class="mini-btn" onclick="${pfx}EditLineModal('${id}','${l.id}')" title="Modifica riga / nota">${ico('edit', 'tinted', 'Modifica riga / nota')}</button>`,
    `<button class="mini-btn danger lock-contract" onclick="${pfx}DelLine('${id}','${l.id}')" title="Togli la riga">${ico('trash', 'tinted', 'Togli la riga')}</button>`, 'line-actions');
}
// Chiudi, numero, stato, Salva e il menu «⋯».
//   o = { chiudi, cosa, rec, stati, dirty, saveId, salva, menu }
function docToolbarHtml(o) {
  return `<div class="bom-toolbar">
      <div class="bom-toolbar-left">
        ${worklistCloseBtn(o.chiudi, o.cosa)}
        <h2 class="section-title" style="font-family:var(--mono)">${esc(o.rec.number)}</h2>
        ${statusBadge(o.stati, o.rec.status)}
        <button class="add-btn-sm rfq-save-btn ${o.dirty ? 'dirty' : ''}" id="${o.saveId}" onclick="${o.salva}">${ico('save', 'tinted', '')} Salva</button>
      </div>
      <div class="bom-toolbar-right">
        ${menuAltro(o.menu)}
      </div>
    </div>`;
}
// Titolo, controparte, data, stato, condizioni e note.
//   o = { pfx, rec, stati, controparte, data, conferma?, note }
// `conferma` è l'etichetta del numero di conferma della controparte: la
// richiesta d'offerta non ce l'ha.
function docTestaHtml(o) {
  const r = o.rec, id = r.id;
  const campo = (k, v) => `onchange="${o.pfx}SetField('${id}','${k}',${v || 'this.value'})"`;
  const opzioni = arr => (arr || []).map(x => `<option value="${esc(x)}"></option>`).join('');
  return `<div class="rfq-head">
      <div class="modal-field"><label>Titolo / oggetto</label><input class="lock-contract" value="${esc(r.title || '')}" ${campo('title')}></div>
      <div class="rfq-head-row">
        <div class="modal-field"><label>${o.controparte}</label><select class="lock-contract sel-cerca" onchange="${o.pfx}SetSupplier('${id}',this.value)">${supplierOptions(r.supplierId)}</select></div>
        <div class="modal-field"><label>${o.data}</label><input type="date" class="lock-contract" value="${(r.date || '').slice(0, 10)}" ${campo('date')}></div>
        <div class="modal-field"><label>Stato</label><select ${campo('status')}>
          ${Object.entries(o.stati).map(([k, v]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select></div>
      </div>
      <div class="rfq-head-row">
        <div class="modal-field"><label>Tipo di trasporto / resa</label>
          <input list="${o.pfx}-transport-opts" class="lock-contract" value="${esc(r.transport || '')}" placeholder="es. Porto franco, EXW, DAP…" ${campo('transport')}>
          <datalist id="${o.pfx}-transport-opts">${opzioni(db.settings.transportOptions)}</datalist></div>
        <div class="modal-field"><label>Tipo di pagamento</label>
          <input list="${o.pfx}-payment-opts" class="lock-contract" value="${esc(r.payment || '')}" placeholder="es. Bonifico 30gg, RiBa 60gg…" ${campo('payment')}>
          <datalist id="${o.pfx}-payment-opts">${opzioni(db.settings.paymentOptions)}</datalist></div>
      </div>
      ${o.conferma ? `<div class="rfq-head-row">
        <div class="modal-field"><label>${o.conferma}</label><input value="${esc(r.supplierConfirmation || '')}" ${campo('supplierConfirmation')}></div>
      </div>` : ''}
      <div class="modal-field"><label>${o.note}</label><textarea rows="2" ${campo('notes')}>${esc(r.notes || '')}</textarea></div>
      <div class="modal-field"><label>${ico('lock', 'tinted', '')} Note interne (non stampate sui documenti)</label><textarea rows="2" class="notes-internal" ${campo('notesInternal')}>${esc(r.notesInternal || '')}</textarea></div>
    </div>`;
}
// «Genera documento PDF / Excel», spenti finché il documento non è salvato.
// Sotto, le copie già in archivio (documenti.js).
//   o = { etichetta, cls, pdf, xls, dirty, cosa, kind, rec }
function docExportBarHtml(o) {
  const dis = o.dirty ? `disabled title="Salva ${o.cosa} prima di generare il documento"` : '';
  return `<div class="rfq-export-bar">
      <label>${o.etichetta}</label>
      <button class="export-btn-pdf ${o.cls}" onclick="${o.pdf}" ${dis}>${ico('file', 'tinted', '')} Genera documento PDF</button>
      <button class="export-btn-xls ${o.cls}" onclick="${o.xls}" ${dis}>${ico('sheet', 'tinted', '')} Genera documento Excel</button>
      ${o.dirty ? '<span class="rfq-dirty-hint">Salva per abilitare la generazione del documento</span>' : ''}
    </div>
    ${o.kind && !o.dirty ? docEmessiHtml(o.kind, o.rec) : ''}`;
}
// Il nome del file: numero e controparte, senza i caratteri che un disco rifiuta.
function docNomeFile(rec, sup, ripiego, ext) {
  return nomeFileSicuro(rec.number + (sup ? '_' + (sup.name || '') : ''), ripiego) + ext;
}
// La testata del PDF: titolo col numero, data, oggetto, e i due blocchi di chi
// ordina e di chi riceve. Restituisce la y da cui parte la tabella delle righe.
//   o = { titolo, rec, chi, controparte, vuota, xControparte }
function docPdfTesta(doc, o) {
  const r = o.rec;
  doc.setFontSize(15); doc.setTextColor(30); doc.text(`${o.titolo} — ${r.number}`, 14, 16);
  doc.setFontSize(9); doc.setTextColor(90);
  doc.text(`Data / Date: ${fmtDateIt(r.date) || fmtDateIt(nowISO())}`, 14, 22);
  if (r.title) doc.text(`Oggetto / Subject: ${r.title}`, 14, 27);
  const yTop = 36;
  const block = (x, title, rowsTxt) => {
    doc.setFontSize(8); doc.setTextColor(130); doc.text(title, x, yTop);
    doc.setFontSize(9); doc.setTextColor(40);
    const rows = rowsTxt.filter(Boolean);
    rows.forEach((t, i) => doc.text(String(t), x, yTop + 5 + i * 4.5));
    return rows.length;
  };
  const sup = r.supplierId ? getSupplier(r.supplierId) : null;
  const n1 = block(14, o.chi, docPartyLines(db.settings.company || {}, true));
  const n2 = block(o.xControparte || 160, o.controparte, sup ? docPartyLines(sup, true) : [o.vuota]);
  return yTop + 5 + Math.max(n1, n2) * 4.5 + 4;
}
// La testata del foglio Excel: le stesse informazioni, una per riga.
//   o = { titolo, rec, voci: [[etichetta, valore]…], chi, controparte }
// Le voci vuote non fanno righe.
function docXlsTesta(o) {
  const r = o.rec;
  const sup = r.supplierId ? getSupplier(r.supplierId) : null;
  const data = [[o.titolo, r.number], ['Data', fmtDateIt(r.date)]];
  if (r.title) data.push(['Oggetto', r.title]);
  o.voci.forEach(([etichetta, valore]) => { if (valore) data.push([etichetta, valore]); });
  data.push([]);
  data.push([o.chi, '', o.controparte]);
  const coLines = docPartyLines(db.settings.company || {}), supLines = docPartyLines(sup);
  for (let i = 0; i < Math.max(coLines.length, supLines.length); i++) data.push([coLines[i] || '', '', supLines[i] || '']);
  data.push([]);
  return data;
}
// Le note per la controparte in fondo al foglio, e il file. Solo rec.notes: le
// note interne (notesInternal) non escono mai sul documento.
function docXlsSalva(data, rec, foglio, ripiego) {
  if (rec.notes) { data.push([]); data.push(['Note', rec.notes]); }
  if (!requireXlsx()) return false;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), foglio);
  XLSX.writeFile(wb, docNomeFile(rec, rec.supplierId ? getSupplier(rec.supplierId) : null, ripiego, '.xlsx'));
  showToast('Excel esportato');
  return true;
}
// Eliminazione. Su un documento che non è più una bozza l'avviso dice **cosa**
// si sta cancellando: «risulta inviato» ferma la mano più di «sei sicuro?».
// `extraWarn` aggiunge ciò che solo quel tipo sa (i ricevimenti di un ordine).
function docDel(k, id, before, extraWarn) {
  const K = docKind(k);
  if (!roleGuard('docs')) return;
  const doc = K.get(id); if (!doc) return;
  if (!guardiaDocumentoUltimo(doc, db[K.coll], k === 'rfq' ? 'Chiudila invece di eliminarla.' : 'Annullalo invece di eliminarlo.')) return;
  const warn = doc.status === 'bozza' ? ''
    : `\nAttenzione: risulta ${docStatusLabel(K, doc)}${extraWarn ? extraWarn(doc) : ''}.`;
  // Le copie emesse si cancellano con il documento (documenti.js): si dice prima.
  const kEmessi = { rfq: 'rfq', order: 'order', odl: 'workOrder' }[k];
  const copie = docEmessi(kEmessi, id).length;
  const avviso = copie ? `\nVerrà cancellat${copie === 1 ? 'a anche la copia PDF' : 'e anche le ' + copie + ' copie PDF'} nella cartella d'archivio, e ripristinando il documento non tornerà${copie === 1 ? '' : 'nno'}.` : '';
  const invece = k === 'rfq' ? 'Chiudila invece di eliminarla.' : 'Annullalo invece di eliminarlo.';
  askConfirm(`Eliminare ${K.pronome} ${K.nome.toLowerCase()} ${doc.number}?${warn}${avviso}`, () => eliminaSeAncoraUltimo(() => {
    const d = K.get(id);
    return !!d && guardiaDocumentoUltimo(d, db[K.coll], invece);
  }, () => {
    if (before) before();
    // Il documento aperto che si elimina non ha più niente da salvare.
    if (K.dirty() && K.currentId && K.currentId() === id) K.dirty(false);
    if (removeConUndo(K.coll, id, `${K.nome} ${doc.number} eliminat${K.suffisso}`, () => K.render()) && copie) docEmessiElimina(kEmessi, id);
  }));
}
// Lasciare il documento aperto: quel che era in sospeso si salva, e lo sblocco
// decade. Vale sia chiudendolo sia passando direttamente a un altro documento
// dall'elenco a destra, che e' la stessa uscita senza il giro dall'elenco.
function docLeave(k) {
  const K = docKind(k);
  if (K.dirty()) { saveDB(); K.dirty(false); }
  K.setUnlocked(null);
}
function docBackToList(k) {
  const K = docKind(k);
  docLeave(k);
  if (k === 'order') { orderView = 'list'; currentOrderId = null; }
  else if (k === 'odl') { odlView = 'list'; currentOdlId = null; }
  else { rfqView = 'list'; currentRfqId = null; }
  K.render();
}

// ═══════════════════════════════════════════════════════════
//  VISTA: RICHIESTE DI OFFERTA (RFQ)
// ═══════════════════════════════════════════════════════════
function rfqMode(r) { return docMode('rfq', r); }
function rfqGuard(id, kind) { return docGuard('rfq', id, kind); }
function rfqUnlock(id) { return docUnlock('rfq', id); }
// Se tutte le righe hanno un prezzo l'offerta è tornata: è un fatto, non una scelta.
function rfqAutoStatus(r) {
  if (r.status !== 'inviata' && r.status !== 'ricevuta') return;
  const lines = r.lines || [];
  const priced = lines.length > 0 && lines.every(l => l.price !== '' && l.price != null);
  r.status = priced ? 'ricevuta' : 'inviata';
}
function getRfq(id) { return db.rfqs.find(r => r.id === id); }
// ─── Codice e descrizione «presso il fornitore», sulla riga di un documento ───
// Escono **solo se il fornitore coincide**: sono il modo in cui quel fornitore
// chiama l'articolo, e stamparli su un documento intestato a un altro non è
// un'imprecisione — è un codice d'ordine sbagliato, che il fornitore prende per
// buono e su cui spedisce il pezzo di qualcun altro.
//
// La coincidenza si verifica dentro il listino, non sui campi dell'articolo:
// `it.supplierCode`/`it.supplierDesc` sono la copia della sola quotazione **in
// uso**, e su un ordine al secondo fornitore lasciavano la casella vuota pur
// avendo il dato a listino. La quotazione giusta la trova supplierPriceRow().
function lineSupInfo(supplierId, l) {
  if (!l.itemId || !supplierId) return null;
  const row = supplierPriceRow(getItem(l.itemId), supplierId);
  if (!row || (!row.code && !row.desc)) return null;
  return { code: row.code || '', desc: row.desc || '' };
}
function rfqLineSupInfo(r, l) { return lineSupInfo(r.supplierId, l); }

// ─── Una riga di documento nata da un articolo di catalogo ───
// Il listino che si applica è quello del **fornitore a cui il documento è
// intestato**, nella sua quotazione più recente: prezzo, unità, codice e
// descrizione vengono tutti da quella riga sola.
//
// Se quel fornitore non ha quotazioni **non si applica niente**: la riga nasce
// senza prezzo, nell'unità di gestione. È l'unica risposta onesta — il prezzo di
// un altro fornitore su un ordine a questo è un numero sbagliato che ha tutta
// l'aria di essere giusto, e si scopre alla fattura. Una casella vuota si vede
// subito, e il fabbisogno la segnala già come «⚠ senza prezzo».
//
// Il documento senza intestatario (capita: si compilano le righe e il fornitore
// si sceglie dopo) ricade nello stesso caso: nessun listino da applicare.
function docLineFromItem(it, supplierId) {
  const row = supplierPriceRow(it, supplierId);
  const quotato = row && row.price !== '' && row.price != null;
  return {
    id: gid(), itemId: it.id, code: it.code || '', description: it.name || '',
    // La riga è sempre nell'unità di gestione dell'articolo — è quella con
    // cui si ordina, si riceve e si monta — anche quando il fornitore
    // valorizza il listino in un'altra unità. Il prezzo passa dalla stessa
    // "porta unica" di applyPriceRow: arriva già convertito, mai il numero
    // grezzo del listino nell'unità sua.
    //
    // Una barra d'acciaio da 6 m, gestita a metri, che pesa 20 kg/m:
    //   il fornitore quota a kg  →  riga in m, prezzo = 20 × (prezzo al kg)
    //   il fornitore quota a m   →  riga in m, prezzo tale e quale
    // La seconda riga non è un caso a parte: priceUomOf() ricade sull'unità
    // di gestione e uomFactor() vale 1, quindi la conversione c'è sempre e
    // qualche volta non fa niente. Un ramo in meno da sbagliare.
    uom: itemUom(it) || defaultUom(),
    qty: 1, price: quotato ? (rowUnitCost(it, row) || 0) : '', deliveryDate: '', note: '',
  };
}
// Nei documenti la nota di riga si stampa sotto la descrizione, nella stessa cella.
// L'etichetta di una riga senza articolo a catalogo. Non sono tutte uguali: una
// riga **manuale** l'ha scritta qualcuno a mano, una riga di **conto lavoro**
// viene dal fabbisogno ed è una fase del ciclo di una parte. Chiamarle entrambe
// «manuale» faceva sembrare improvvisato ciò che l'app ha generato da sé.
//
// `itemId` su una riga di conto lavoro è nullo per forza, non per caso: è la
// garanzia contro il doppio conteggio di magazzino (vedi planPhaseDocLine).
// I due gesti del conto lavoro, sotto la riga che li giustifica: il terzista e
// l'ordine sono già decisi, resta da dire cosa esce e quanto. Compaiono solo
// sulle righe di conto lavoro, e solo con un fornitore intestato — senza, il
// movimento non saprebbe da chi sta la merce.
// Dalla 0.69.0 le lavorazioni vivono negli **ordini di lavoro**, e i due gesti
// stanno lì. Questa resta per le righe di conto lavoro finite in un ordine
// d'acquisto **prima** della separazione: sono poche o nessuna, ma toglierle il
// comando le lascerebbe senza modo di muovere il materiale.
function ordClLineActions(o, l) { return l.phaseKey ? docClActions(o, l) : ''; }
// ─── I due comandi del conto lavoro, dove hanno senso e per quel che fanno ───
// Un documento ha una riga per **tratta** — le fasi consecutive dello stesso
// terzista stanno insieme — e il materiale non esce a ogni fase: esce una volta
// all'inizio del ciclo, e i pezzi rientrano una volta alla fine. Due fasi dallo
// stesso terzista per quattro pezzi sono quattro pezzi fuori e quattro dentro,
// non otto e otto.
//
// I comandi cambiano **nome e effetto** secondo dove sta la tratta nel ciclo:
// ai due estremi muovono il magazzino, in mezzo sono un passaggio che sposta il
// pezzo e basta. Chiamarli allo stesso modo avrebbe fatto credere che caricassero
// quattro volte lo stesso codice.
function docClActions(o, l) {
  if (!l.phaseKey || !o.supplierId) return '';
  // La riga viene da un **ordine di produzione**: là il magazzino ha un padrone
  // solo, e gli estremi sono quelli del ciclo intero invece che quelli di questo
  // documento. Offrire i comandi anche qui vorrebbe dire poter registrare due
  // volte lo stesso gesto, da due schede che non si sanno l'una dell'altra.
  if (l.odpId && typeof opRimandoHtml === 'function') return opRimandoHtml(l);
  const ruolo = clLineRole(o, l);
  const cmd = [];
  if (ruolo.out) {
    const passo = ruolo.outKind === 'clStep';
    cmd.push(`<span class="plandoc-link plandoc-link-sm" ${clickAttrs(`clFromOdlModal('${o.id}','${l.id}','out')`,
      passo ? 'Manda al terzista i pezzi tornati dalla fase precedente: non tocca il magazzino'
        : 'Spedisci il materiale del ciclo al terzista: esce dal magazzino')}>${passo ? 'manda al terzista' : 'spedisci materiale'}</span>`);
  }
  if (ruolo.in) {
    const passo = ruolo.inKind === 'clStep';
    cmd.push(`<span class="plandoc-link plandoc-link-sm" ${clickAttrs(`clFromOdlModal('${o.id}','${l.id}','in')`,
      passo ? 'Ritira i pezzi: restano in lavorazione e non caricano il magazzino'
        : 'Registra il rientro dei pezzi lavorati: entrano a magazzino')}>${passo ? 'ritira dal terzista' : 'registra rientro'}</span>`);
  }
  // Una riga in mezzo a una tratta non muove niente, e la sua assenza di comandi
  // somiglierebbe a un difetto: dice dove sono finiti.
  if (!cmd.length) {
    const fase = x => 'fase ' + cyclePhaseNumber(clPhaseIndex(x));
    return `<div class="line-cl-actions"><span title="Il pezzo esce una volta all'inizio della tratta e torna una volta alla fine: questa fase sta in mezzo e non muove niente.">${ico('factory', 'tinted', '')} in uscita alla ${esc(fase(ruolo.prima))}, rientro alla ${esc(fase(ruolo.ultima))}</span></div>`;
  }
  // Dove il gesto è un passaggio si dice **perché** non muove il magazzino: un
  // comando che sembra un carico e non carica è il modo più rapido di far
  // perdere fiducia in una giacenza.
  const note = [];
  if (ruolo.out && !ruolo.in) note.push('i pezzi rientrano alla ' + 'fase ' + cyclePhaseNumber(clPhaseIndex(ruolo.ultima)));
  if (ruolo.in && !ruolo.out) note.push('sono usciti alla ' + 'fase ' + cyclePhaseNumber(clPhaseIndex(ruolo.prima)));
  if (ruolo.outKind === 'clStep' && ruolo.inKind === 'clStep') note.push('passaggio di lavorazione: il magazzino non si muove');
  else if (ruolo.inKind === 'clStep' && ruolo.in) note.push('il codice si carica al rientro dell&rsquo;ultima fase');
  else if (ruolo.outKind === 'clStep' && ruolo.out) note.push('il materiale era gi&agrave; uscito alla prima fase');
  const nota = note.length ? ` <span class="empty-text" style="padding:0">· ${note.join(' · ')}</span>` : '';
  return `<div class="line-cl-actions">${ico('factory', 'tinted', '')}${cmd.join('')}${nota}</div>`;
}
function lineOriginTag(l) {
  if (l.itemId) return '';
  if (l.phaseKey) return ` <span class="rfq-clavoro-tag" title="Lavorazione in conto lavoro, non un articolo a magazzino: i pezzi rientrati portano l'ordine a evaso, mentre il magazzino lo muovono i movimenti di conto lavoro o, se la riga viene da un ordine di produzione, la dichiarazione su quell'ordine.">conto lavoro</span>`;
  return ' <span class="rfq-manual-tag">manuale</span>';
}
function lineDescDoc(l) { return l.note ? (l.description || '') + '\n' + l.note : (l.description || ''); }

// ═══════════════════════════════════════════════════════════
//  A CHE PUNTO È, E DA DOVE VIENE (0.93.0)
// ═══════════════════════════════════════════════════════════
// Il giro commessa → piano → richiesta → ordine → ricevimento stava scritto nel
// manuale e in un menu «Stato»: il documento diceva in che stato era, non quale
// fosse il passo dopo, né a quali altri documenti fosse legato. Qui due pezzi,
// uguali per ogni documento:
//   - la **barra di stato**: i passi in fila, quello attuale acceso, e il passo
//     successivo come pulsante quando l'app sa farlo da sé (altrimenti una riga
//     che dice cosa manca);
//   - la riga **Collegati**: da dove viene il documento e cosa ne è nato, ogni
//     voce cliccabile.
// Il menu «Stato» resta dov'era: la barra è una scorciatoia, non l'unica strada.
//
// I passi di ciascun documento. `fuori` sono gli stati che escono dal giro
// (annullato): la barra li dichiara invece di accendere un passo a caso.
const DOC_FLOW = {
  rfq: { passi: ['bozza', 'inviata', 'ricevuta', 'chiusa'], fuori: [] },
  order: { passi: ['bozza', 'inviato', 'confermato', 'parziale', 'evaso'], fuori: ['annullato'] },
  odl: { passi: ['bozza', 'inviato', 'confermato', 'parziale', 'evaso'], fuori: ['annullato'] },
  odp: { passi: ['bozza', 'lanciato', 'corso', 'completato', 'chiuso'], fuori: ['annullato'] },
  job: { passi: ['aperta', 'produzione', 'chiusa'], fuori: ['annullata'] },
};
function docFlowStatusMap(k) {
  return { rfq: RFQ_STATUS, order: ORDER_STATUS, odl: ORDER_STATUS,
    odp: typeof ODP_STATUS !== 'undefined' ? ODP_STATUS : {}, job: typeof JOB_STATUS !== 'undefined' ? JOB_STATUS : {} }[k] || {};
}
// Il passo successivo: { azione, etichetta } quando c'è un comando che lo fa,
// { suggerimento } quando lo fa una persona altrove (registrare l'offerta,
// dichiarare i pezzi), null quando il giro è finito.
function docNextStep(k, d) {
  const id = d.id, st = d.status;
  if (k === 'rfq') {
    if (st === 'bozza') return { azione: `docAdvance('rfq','${id}','inviata')`, etichetta: 'Segna come inviata', icona: 'mail' };
    if (st === 'inviata') return { suggerimento: 'Quando arriva l’offerta, scrivi i prezzi nelle righe: la richiesta passa da sola a «Offerta ricevuta».' };
    if (st === 'ricevuta') return { azione: `orderFromRfq('${id}')`, etichetta: 'Crea ordine', icona: 'receipt' };
    return null;
  }
  if (k === 'order' || k === 'odl') {
    if (st === 'bozza') return { azione: `docAdvance('${k}','${id}','inviato')`, etichetta: 'Segna come inviato', icona: 'mail' };
    if (st === 'inviato') return { suggerimento: 'Quando il fornitore conferma, scrivi il n° di conferma d’ordine: lo stato passa da solo a «Confermato».' };
    if (st === 'confermato' || st === 'parziale') {
      if (k === 'odl' && (d.lines || []).some(l => odlLegameAttivo(d, l))) return { suggerimento: 'I pezzi rientrati si dichiarano sull’ordine di produzione collegato.' };
      return { azione: k === 'odl' ? `odlMarkAllReceived('${id}')` : `ordMarkAllReceived('${id}')`, etichetta: k === 'odl' ? 'Dichiara tutto rientrato' : 'Segna tutto ricevuto', icona: 'check' };
    }
    return null;
  }
  if (k === 'odp') {
    if (st === 'bozza') return { azione: `odpLancia('${id}')`, etichetta: 'Lancia', icona: 'factory' };
    if (st === 'lanciato' || st === 'corso') return { suggerimento: 'Dichiara pezzi buoni e scarti sulle fasi, nella tabella qui sotto.' };
    if (st === 'completato') return { azione: `odpChiudi('${id}')`, etichetta: 'Chiudi l’ordine', icona: 'lock' };
    return null;
  }
  if (k === 'job') {
    if (st === 'aperta') return { azione: `jobSetField('${id}','status','produzione')`, etichetta: 'Metti in produzione', icona: 'factory' };
    if (st === 'produzione') return { azione: `jobSetField('${id}','status','chiusa')`, etichetta: 'Chiudi la commessa', icona: 'lock' };
    return null;
  }
  return null;
}
// Un passo si fa come dal menu «Stato», e si salva subito: è un gesto
// deliberato, non un ritocco da confermare con «Salva».
function docAdvance(k, id, status) {
  const K = docKind(k);
  const d = K.get(id); if (!d) return;
  const prima = d.status;
  docSetField(k, id, 'status', status);
  if (d.status !== prima) docSave(k, id);
}
function docStepperHtml(k, d) {
  const flow = DOC_FLOW[k]; if (!flow || !d) return '';
  const map = docFlowStatusMap(k);
  const fuori = flow.fuori.includes(d.status);
  const at = flow.passi.indexOf(d.status);
  const passi = flow.passi.map((s, i) => {
    const cls = fuori ? 'off' : (i < at ? 'done' : (i === at ? 'now' : ''));
    return `<li class="doc-step ${cls}"${i === at && !fuori ? ' aria-current="step"' : ''}><span class="doc-step-dot" aria-hidden="true">${i < at && !fuori ? '✓' : i + 1}</span>${esc(map[s] || s)}</li>`;
  }).join('');
  const next = fuori ? null : docNextStep(k, d);
  const coda = fuori
    ? `<span class="doc-step-note">${ico('blocked', 'tinted', '')} ${esc(map[d.status] || d.status)}: fuori dal giro.</span>`
    : !next ? `<span class="doc-step-note">${ico('check', 'tinted', '')} Giro completato.</span>`
      : next.azione ? `<button class="add-btn-sm doc-step-next" onclick="${next.azione}">${ico(next.icona || 'check', 'tinted', '')} ${esc(next.etichetta)}</button>`
        : `<span class="doc-step-note">${esc(next.suggerimento)}</span>`;
  return `<div class="doc-flow"><ol class="doc-steps" aria-label="Avanzamento">${passi}</ol><div class="doc-step-next-wrap">${coda}</div></div>`;
}
// ─── I documenti collegati ───
// Una voce = { tipo, id, numero, ruolo }. Il tipo è quello di homeApri, che sa
// già aprire ogni documento nella sua vista.
function docLinks(k, d) {
  const v = [];
  const add = (tipo, x, ruolo) => { if (x) v.push({ tipo, id: x.id, numero: x.number || '', ruolo }); };
  const job = d.jobId && typeof getJob === 'function' ? getJob(d.jobId) : null;
  const plan = d.planId ? (db.plans || []).find(p => p.id === d.planId) : null;
  if (k !== 'job') add('job', job, 'commessa');
  add('plan', plan, 'piano');
  if (k === 'order' || k === 'odl') add('rfq', d.rfqId ? getRfq(d.rfqId) : null, 'richiesta');
  if (k === 'odl' && d.odpId && typeof getOdp === 'function') add('odp', getOdp(d.odpId), 'ordine di produzione');
  if (k === 'rfq') {
    (db.orders || []).filter(o => o.rfqId === d.id).forEach(o => add('order', o, 'ordine'));
    (db.workOrders || []).filter(o => o.rfqId === d.id).forEach(o => add('odl', o, 'ordine di lavoro'));
  }
  if (k === 'odp') (db.workOrders || []).filter(o => o.odpId === d.id).forEach(o => add('odl', o, 'ordine di lavoro'));
  return v;
}
function docLinksHtml(k, d) {
  const v = docLinks(k, d);
  if (!v.length) return '';
  const icona = { job: 'clipboard', plan: 'list', rfq: 'mail', order: 'receipt', odl: 'wrench', odp: 'factory' };
  return `<div class="doc-links"><span class="doc-links-label">Collegati</span>${v.map(x =>
    `<button type="button" class="doc-link" onclick="homeApri('${x.tipo}','${x.id}')" title="Apri ${esc(x.ruolo)} ${esc(x.numero)}">${ico(icona[x.tipo] || 'file', 'tinted', '')} <span class="doc-link-role">${esc(x.ruolo)}</span> <span class="doc-link-num">${esc(x.numero)}</span></button>`).join('')}</div>`;
}

// ─── Filtri degli elenchi documenti (condivisi tra richieste e ordini) ───
// Gli elenchi si ridisegnano interi a ogni operazione: i criteri vivono qui
// fuori, così sopravvivono al re-render, e la digitazione aggiorna solo la
// lista (toccare la barra filtri farebbe perdere il focus al campo di ricerca).
const docFilters = {
  rfq: { q: '', status: '', supplierId: '', from: '', to: '' },
  order: { q: '', status: '', supplierId: '', from: '', to: '' },
  odl: { q: '', status: '', supplierId: '', from: '', to: '' },
};
function docFiltersVuoti() { return { q: '', status: '', supplierId: '', from: '', to: '' }; }
// Una voce di stato in più per gli ordini (dalla 0.101.0): gli ordini ancora da
// ricevere, cioè gli stati di ORDER_INCOMING_STATES insieme. È quella su cui
// porta la card «Ordini da evadere» del Riepilogo.
const DOC_STATUS_EVADERE = '@evadere';
// I campi di filtro dell'elenco, senza contenitore: li incolonna `wl-filters`
// del telaio (worklist.js). In una colonna da 360px tre menu affiancati
// sarebbero tre fessure — qui vanno uno sotto l'altro, larghi quanto la colonna.
function docFilterBar(kind, statusMap, shown, total) {
  const f = docFilters[kind];
  const sups = db.suppliers.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return `<input type="text" class="search" id="${kind}f-q" value="${esc(f.q)}" placeholder="Cerca numero, oggetto, fornitore o riga..." oninput="docFilterInput('${kind}')">
    <select id="${kind}f-status" onchange="docFilterChange('${kind}')">
      <option value="">Tutti gli stati</option>
      ${kind === 'order' ? `<option value="${DOC_STATUS_EVADERE}" ${f.status === DOC_STATUS_EVADERE ? 'selected' : ''}>Da evadere (inviati, confermati, parziali)</option>` : ''}
      ${Object.entries(statusMap).map(([k, v]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${v}</option>`).join('')}
    </select>
    <select id="${kind}f-sup" class="sel-cerca" onchange="docFilterChange('${kind}')">
      <option value="">Tutti i fornitori</option>
      <option value="none" ${f.supplierId === 'none' ? 'selected' : ''}>— senza fornitore —</option>
      ${sups.map(s => `<option value="${s.id}" ${f.supplierId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
    </select>
    ${dateRangeFilter(kind + 'f', f.from, f.to, `docFilterChange('${kind}')`, 'documento')}
    <span class="doc-filter-count" id="${kind}f-count">${docFilterCountText(shown, total)}</span>
    ${docFilterActive(kind) ? `<button class="btn-outline" onclick="docFilterReset('${kind}')">✕ Azzera filtri</button>` : ''}`;
}
function docFilterCountText(shown, total) { return worklistCount(shown, total, 'documento', 'documenti'); }
function docFilterActive(kind) { const f = docFilters[kind]; return !!(f.q || f.status || f.supplierId || f.from || f.to); }
// Digitazione nel campo di ricerca: si aspetta la pausa. I menu a tendina
// restano immediati — un click è già un'intenzione conclusa.
function docFilterInput(kind) { debounced('doc-' + kind, () => docFilterChange(kind)); }
function docFilterChange(kind) {
  const f = docFilters[kind];
  f.q = (val(kind + 'f-q') || '').toLowerCase();
  f.status = val(kind + 'f-status');
  f.supplierId = val(kind + 'f-sup');
  f.from = val(kind + 'f-from');
  f.to = val(kind + 'f-to');
  // Solo la lista: la barra filtri resta com'è, altrimenti il campo perde il focus
  const count = document.getElementById(kind + 'f-count');
  const all = docKind(kind).all();
  renderInto(kind + '-list', () => kind === 'rfq' ? rfqListRows() : kind === 'odl' ? odlListRows() : orderListRows());
  if (count) count.textContent = docFilterCountText(docFilterApply(kind, all).length, all.length);
}
function docFilterReset(kind) {
  docFilters[kind] = docFiltersVuoti();
  docKind(kind).render();
}
// Testo cercabile di un documento, righe comprese. Costruirlo significa
// scorrere tutte le righe: senza memoria si rifarebbe per ogni documento a
// ogni carattere digitato. La chiave di validità è updatedAt, che cambia a
// ogni touch() — se il documento non è stato toccato, il testo è ancora buono.
const _docHay = new WeakMap();
function docSearchText(d) {
  const memo = _docHay.get(d);
  if (memo && memo.stamp === d.updatedAt) return memo.hay;
  const hay = [d.number, d.title, supplierName(d.supplierId), d.notes, d.notesInternal]
    .concat((d.lines || []).map(l => [l.code, l.description, l.note].join(' ')))
    .join(' ').toLowerCase();
  _docHay.set(d, { stamp: d.updatedAt, hay });
  return hay;
}
// Il testo cerca anche dentro le righe: spesso si risale al documento dal codice ordinato
function docFilterApply(kind, docs) {
  const f = docFilters[kind];
  return docs.filter(d => {
    if (f.status === DOC_STATUS_EVADERE) { if (!ORDER_INCOMING_STATES.includes(d.status)) return false; }
    else if (f.status && d.status !== f.status) return false;
    if (f.supplierId === 'none' ? !!d.supplierId : (f.supplierId && d.supplierId !== f.supplierId)) return false;
    if (!inDateRange(d.date, f.from, f.to)) return false;
    if (!f.q) return true;
    return docSearchText(d).includes(f.q);
  });
}

// ─── Export dell'elenco documenti ───
// Una funzione per i due tipi: richieste e ordini si filtrano allo stesso modo
// e si guardano per le stesse ragioni. L'unica differenza è ciò che l'ordine sa
// in più — quanto vale e quanto ne è arrivato — e sta in due colonne.
// Attenzione a cosa **non** è: l'export del documento aperto, che esiste già
// (`exportRfqPDF`, `exportOrderExcel`…) ed è quello che parte verso il fornitore.
function docListExportSpec(kind) {
  const K = docKind(kind);
  // Le colonne di importo e ricevimento valgono per i due tipi di ordine, non
  // per la richiesta: è la richiesta a essere il caso diverso, non l'ODL.
  const ordini = kind === 'order' || kind === 'odl';
  const f = docFilters[kind];
  const mappaStati = ordini ? ORDER_STATUS : RFQ_STATUS;
  const docs = docFilterApply(kind, K.all().slice()
    .sort((a, b) => (b.number || '').localeCompare(a.number || '')));
  const odl = kind === 'odl';
  const colonne = [
    { h: 'Numero', w: 18 }, { h: 'Oggetto', w: 34 }, { h: 'Stato', w: 14 },
    { h: odl ? 'Terzista' : 'Fornitore', w: 28 }, { h: 'Data', w: 12, data: true },
    { h: odl ? 'Lavorazioni' : 'Righe', w: 12, num: true },
  ];
  if (ordini) colonne.push({ h: `Totale (${cur()})`, w: 16, num: true },
    { h: odl ? 'Pezzi' : 'Ordinato', w: 12, num: true },
    { h: odl ? 'Rientrati' : 'Ricevuto', w: 12, num: true });
  return {
    titolo: { rfq: 'Richieste di offerta', order: 'Ordini a fornitore', odl: 'Ordini di lavoro' }[kind],
    slug: { rfq: 'richieste', order: 'ordini', odl: 'ordini_di_lavoro' }[kind],
    filtri: [
      ['Ricerca', f.q],
      ['Stato', f.status === DOC_STATUS_EVADERE ? 'Da evadere (inviati, confermati, parziali)' : (mappaStati[f.status] || '')],
      ['Fornitore', f.supplierId === 'none' ? 'senza fornitore' : (supplierName(f.supplierId) || '')],
      ['Data', dateRangeText(f.from, f.to)],
    ],
    sezioni: [{
      nome: K.nome,
      colonne,
      righe: docs.map(d => {
        const base = [d.number || '', d.title || '', mappaStati[d.status] || d.status || '',
          supplierName(d.supplierId) || '', d.date || '', (d.lines || []).length];
        if (!ordini) return base;
        const rec = orderReception(d);
        return base.concat([+(odl ? odlTotal(d) : orderTotal(d)).toFixed(2), rec.ordered, rec.received]);
      }),
    }],
  };
}
function rfqListExportSpec() { return docListExportSpec('rfq'); }
function orderListExportSpec() { return docListExportSpec('order'); }

function renderRfq() {
  const host = document.getElementById('view-rfq');
  if (rfqView === 'edit' && !getRfq(currentRfqId)) { rfqView = 'list'; currentRfqId = null; }
  const r = rfqView === 'edit' ? getRfq(currentRfqId) : null;
  const nuove = `<button class="add-btn-sm" onclick="newRfq()">+ Nuova richiesta</button>
      <button class="btn-outline" onclick="openRfqCompare()">${ico('chart', 'tinted', '')} Confronta offerte</button>`;
  host.innerHTML = worklistHtml({
    titolo: 'Richieste di offerta', icona: 'mail', listaId: 'rfq-list',
    comandi: nuove + listExportButtons('rfqListExportSpec'),
    filtri: docFilterBar('rfq', RFQ_STATUS, docFilterApply('rfq', db.rfqs).length, db.rfqs.length),
    righe: rfqListRows(),
    doc: r ? renderRfqEdit(currentRfqId) : (rfqView === 'compare' ? renderRfqCompare() : ''),
    vuoto: {
      titolo: 'Nessuna richiesta aperta qui',
      testo: 'Scegli una richiesta dall\'elenco a destra: al centro compaiono il fornitore, le righe da quotare e i prezzi tornati con l\'offerta, pronti da registrare a listino.',
      comandi: nuove,
    },
  });
  // Il blocco vale per il documento al centro: i filtri dell'elenco non hanno
  // classi `lock-*` e restano manovrabili anche a documento protetto.
  if (r) applyDocLock(rfqMode(r), host);
  a11yFields(host);
}

// Progressivo per anno: RFQ-<anno>-NNN
function nextRfqNumber() { return numeroProgressivo('RFQ'); }

function rfqListRows() {
  const list = docFilterApply('rfq', db.rfqs.slice().sort((a, b) => (b.number || '').localeCompare(a.number || '')));
  return list.map(r => {
    const nl = (r.lines || []).length;
    const sup = r.supplierId ? supplierName(r.supplierId) : '— nessun fornitore —';
    return worklistRow({
      numero: r.number,
      badge: statusBadge(RFQ_STATUS, r.status),
      titolo: r.title || '',
      meta: `${esc(sup)} · ${nl} ${nl === 1 ? 'riga' : 'righe'}${r.date ? ' · ' + esc(fmtDateIt(r.date)) : ''}`,
      sel: rfqView === 'edit' && currentRfqId === r.id,
      azione: `openRfqEdit('${r.id}')`,
      etichetta: `Apri la richiesta ${r.number}`,
    });
  }).join('') || `<div class="empty-text">${db.rfqs.length ? 'Nessuna richiesta con questi filtri.' : 'Nessuna richiesta di offerta. Creane una per chiedere prezzi a un fornitore.'}</div>`;
}
function newRfq() {
  if (!roleGuard('docs')) return;
  return conNumeri({ RFQ: 1 }, () => {
    const r = Store.insert('rfqs', { id: gid(), number: nextRfqNumber(), title: '', date: oggiISO(),
      status: 'bozza', notes: '', notesInternal: '', supplierId: null, planId: null,
      transport: db.settings.transportDefault || '', payment: db.settings.paymentDefault || '',
      lines: [], active: true });
    docLeave('rfq'); currentRfqId = r.id; rfqView = 'edit'; renderRfq();
  });
}
// Aprire un documento chiude quello di prima: `docLeave` salva cio' che era in
// sospeso, come faceva l'uscita verso l'elenco. Senza, saltare da una riga
// all'altra perderebbe le modifiche non salvate senza dire niente.
function openRfqEdit(id) { docLeave('rfq'); currentRfqId = id; rfqView = 'edit'; renderRfq(); }
function openRfqCompare() { rfqView = 'compare'; renderRfq(); }
function rfqBackToList() { docBackToList('rfq'); }
function rfqMarkDirty() { docMarkDirty('rfq'); }
function rfqSave(id) { docSave('rfq', id); }
function rfqSetField(id, field, value) { docSetField('rfq', id, field, value); }
function rfqSetSupplier(id, sid) { docSetSupplier('rfq', id, sid); }
function rfqSetLine(id, lineId, field, value) { docSetLine('rfq', id, lineId, field, value); }
function rfqDelLine(id, lineId) { docDelLine('rfq', id, lineId); }

// ─── Nuova riga manuale ───
// L'unico punto in cui i due tipi hanno form diversi: sull'ordine il prezzo è
// concordato e si scrive subito, sulla richiesta si sta chiedendo proprio
// quello e la casella non esiste.
function docAddManualLineModal(k, id) {
  const K = docKind(k), p = K.pfx;
  if (!docGuard(k, id, 'contract')) return;
  const prezzo = K.hasLinePrice
    ? `<div class="modal-field"><label id="${p}-price-label">${docPriceLabel(defaultUom())}</label><input id="${p}-price" type="number" min="0" step="any"></div>` : '';
  const segnaposto = K.hasLinePrice ? 'Es. consegna parziale ammessa, rif. disegno…' : 'Es. materiale certificato, disegno allegato…';
  openModal(`<h3>+ Riga manuale</h3>
    <div class="modal-field"><label>Descrizione</label><input id="${p}-desc"></div>
    <div class="modal-field"><label>Codice (opzionale)</label><input id="${p}-code"></div>
    <div class="modal-grid">
      <div class="modal-field"><label>U.M.</label><select id="${p}-uom" onchange="docLineUomLabels('${p}')">${uomOptions(defaultUom())}</select></div>
      <div class="modal-field"><label id="${p}-qty-label">${docQtyLabel(defaultUom())}</label><input id="${p}-qty" type="number" value="1" min="0" step="any"></div>
      ${prezzo}
    </div>
    <div class="modal-field"><label>Nota (stampata sul documento)</label><textarea id="${p}-note" rows="2" placeholder="${segnaposto}"></textarea></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="${DOC_PFX_FN[k] || 'rfq'}AddManualLine('${esc(id)}')">Aggiungi</button></div>`);
}
function rfqAddManualLineModal(id) { docAddManualLineModal('rfq', id); }
function rfqAddManualLine(id) { docAddManualLine('rfq', id); }
function rfqEditLineModal(id, lineId) { docEditLineModal('rfq', id, lineId); }
function rfqSaveLineEdit(id, lineId) { docSaveLineEdit('rfq', id, lineId); }

// ─── Campi identità riga (codice/descrizione/U.M.), condivisi RFQ e Ordini ───
// Sola lettura per le righe da catalogo (seguono l'anagrafica) e per i
// documenti bloccati dallo stato.
function lineIdentityFields(pfx, l, locked) {
  if (l.itemId) {
    return `<div class="modal-field"><label>Articolo da catalogo</label>
      <input value="${esc((l.code || '') + (l.code ? ' — ' : '') + (l.description || ''))}" disabled></div>
      <p class="empty-text" style="text-align:left;padding:0 0 8px">Codice, descrizione e U.M. seguono l'anagrafica articolo. Modificali nell'anagrafica articolo.</p>`;
  }
  if (locked) {
    return `<div class="modal-field"><label>Riga manuale</label>
      <input value="${esc((l.code || '') + (l.code ? ' — ' : '') + (l.description || '') + ' · ' + (l.qty || 0) + ' ' + (l.uom || ''))}" disabled></div>
      <p class="empty-text" style="text-align:left;padding:0 0 8px">Documento bloccato dallo stato: modificabile la sola nota. Usa <strong>${ico('unlock', 'tinted', '')} Sblocca per modifica</strong> per correggere il resto.</p>`;
  }
  return `<div class="modal-field"><label>Descrizione</label><input id="${pfx}-desc" value="${esc(l.description || '')}"></div>
    <div class="modal-field"><label>Codice (opzionale)</label><input id="${pfx}-code" value="${esc(l.code || '')}"></div>
    <div class="modal-field"><label>U.M.</label><select id="${pfx}-uom" onchange="docLineUomLabels('${pfx}')">${uomOptions(l.uom)}</select></div>`;
}
// ─── Quantità e prezzo, nell'unità della riga ───
// Su un documento che esce di qui — un ordine che il fornitore leggerà — «100»
// e «3,20» senza unità sono l'errore più caro che si possa fare: cento pezzi
// invece di cento metri arrivano davvero, e si pagano. L'unità della riga si
// sceglie nello stesso form (o è già scritta sulla riga), quindi le etichette
// la portano con sé: «Quantità (m)», «Prezzo unitario (€/m)».
function docLineUomLabels(pfx) {
  const u = val(pfx + '-uom') || '';
  const set = (id, testo) => { const el = document.getElementById(id); if (el) el.textContent = testo; };
  set(pfx + '-qty-label', 'Quantità' + (u ? ' (' + u + ')' : ''));
  set(pfx + '-price-label', 'Prezzo unitario (' + cur() + (u ? '/' + u : '') + ')');
}
function docQtyLabel(u) { return labelUom('Quantità', u); }
function docPriceLabel(u) { return `Prezzo unitario (${esc(cur())}${u ? '/' + esc(u) : ''})`; }
// Scrive i campi identità sulla riga; ritorna false se la validazione fallisce.
function readLineIdentity(pfx, l) {
  if (l.itemId) return true;
  const desc = val(pfx + '-desc');
  if (!desc) { showToast('Descrizione richiesta', 'error'); return false; }
  l.description = desc;
  l.code = val(pfx + '-code');
  l.uom = val(pfx + '-uom') || defaultUom();
  return true;
}

// ─── Picker catalogo con filtri, condiviso tra RFQ e Ordini ───
let __pickOnAdd = null;
// `opts` è facoltativo: chi chiamava prima non lo passa e vede il catalogo
// intero. Serve a chi ha bisogno di un sottoinsieme — le lavorazioni si
// scelgono fra gli articoli che un ciclo ce l'hanno, e mostrare gli altri
// significherebbe farli scegliere per poi dire di no.
function catalogPickerModal(onAddIds, opts) {
  __pickOnAdd = onAddIds;
  const cfg = opts || {};
  const filtro = cfg.filtro || (() => true);
  // Un articolo Obsoleto resta nelle righe già create, ma non si propone più
  // come NUOVA riga di RFQ/ordine/ODL/piano.
  const scelte = db.items.filter(i => i.active !== false && !i.obsolete && filtro(i)).sort((a, b) => (a.code || '').localeCompare(b.code || ''))
    .map(i => `<label class="rfq-pick-row" data-type="${esc(i.type)}" data-fam="${esc(i.familyId || '')}" data-sub="${esc(i.subFamilyId || '')}" data-sup="${esc(i.supplierId || '')}" data-cerca="${esc(((i.code || '') + ' ' + (i.name || '')).toLowerCase())}"><input type="checkbox" value="${i.id}">
      <span style="font-family:var(--mono)">${esc(i.code || '')}</span> ${esc(i.name)}${itemBadges(i)}
      <span class="rfq-pick-type">${TYPE_LABELS[i.type] || i.type}</span></label>`).join('');
  const typeOpts = ALL_TYPES.map(t => `<option value="${t}">${typeLabel(t)}</option>`).join('');
  const famOpts = (db.families || []).map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
  openModal(`<h3>${esc(cfg.titolo || '+ Aggiungi da catalogo')}</h3>
    <div class="rfq-pick-filters">
      <input class="search" id="pick-search" placeholder="Codice o nome..." oninput="debounced('pick', pickFilter)">
      <select id="pick-type" onchange="pickFilter()"><option value="">Tutti i tipi</option>${typeOpts}</select>
      <select id="pick-fam" onchange="pickFamilyChange()"><option value="">Tutte le famiglie</option>${famOpts}</select>
      <select id="pick-sub" onchange="pickFilter()"><option value="">Tutte le sottofamiglie</option></select>
      <select id="pick-sup" class="sel-cerca" onchange="pickFilter()"><option value="">Tutti i fornitori</option>${db.suppliers.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
    </div>
    <div class="rfq-pick-list" id="pick-list">${scelte || `<div class="empty-text">${cfg.vuoto || 'Catalogo vuoto.'}</div>`}</div>
    <div class="empty-text" id="pick-empty" style="display:none">Nessun articolo con questi filtri.</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="pickConfirm()">Aggiungi selezionati</button></div>`, true);
}
function pickFamilyChange() {
  const f = getFamily(val('pick-fam'));
  const subs = (f && f.subs) || [];
  const sel = document.getElementById('pick-sub');
  if (sel) sel.innerHTML = '<option value="">Tutte le sottofamiglie</option>' + subs.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  pickFilter();
}
function pickFilter() {
  const q = (val('pick-search') || '').toLowerCase();
  const ty = val('pick-type'), fam = val('pick-fam'), sub = val('pick-sub'), sup = val('pick-sup');
  let shown = 0;
  document.querySelectorAll('#pick-list .rfq-pick-row').forEach(el => {
    // Si cerca in codice e nome, non in `textContent`: quello si porta dentro
    // anche l'etichetta del tipo e i contrassegni della riga, e bastava
    // scrivere «parte» per non filtrare niente (tutte le parti contengono la
    // parola) o «obsoleto» per pescare articoli che non c'entrano. Gli altri
    // picker dell'app confrontano codice e nome: questo faceva eccezione.
    const ok = (el.dataset.cerca || '').includes(q)
      && (!ty || el.dataset.type === ty)
      && (!fam || el.dataset.fam === fam)
      && (!sub || el.dataset.sub === sub)
      && (!sup || el.dataset.sup === sup);
    el.style.display = ok ? '' : 'none';
    if (ok) shown++;
  });
  const empty = document.getElementById('pick-empty');
  if (empty) empty.style.display = shown ? 'none' : '';
}
function pickConfirm() {
  const ids = Array.from(document.querySelectorAll('#pick-list input:checked')).map(c => c.value);
  if (!ids.length) { showToast('Nessun articolo selezionato', 'error'); return; }
  const cb = __pickOnAdd; __pickOnAdd = null;
  if (cb) cb(ids);
}
function rfqAddCatalogModal(id) { if (!rfqGuard(id, 'contract')) return; catalogPickerModal(ids => rfqAddCatalogLines(id, ids)); }
function rfqAddCatalogLines(id, ids) { docAddCatalogLines('rfq', id, ids); }

// ─── Righe di documento a due piani ───
// Una riga d'ordine ha dodici colonne, e dodici colonne su uno schermo normale
// vogliono dire o testo minuscolo o scorrimento orizzontale — e con lo
// scorrimento il codice, che è l'identità della riga, esce dallo schermo.
//
// Le colonne però non erano dodici cose diverse: erano sei coppie. Il codice e
// la sua descrizione, la quantità e la sua unità, il prezzo unitario e
// l'importo che ne discende, la data chiesta e quella confermata, il ricevuto e
// il residuo che ne resta, la modifica e l'eliminazione. Sopra sta il dato che
// si compila, sotto quello che lo spiega o ne consegue.
//
// Il vantaggio non è solo lo spazio: le due metà si leggono insieme. «10 pz» e
// «120,00 €» stanno una sotto l'altra invece che a mezzo schermo di distanza.
function cell2(sopra, sotto, cls) {
  return `<td${cls ? ` class="${cls}"` : ''}><div class="ln-a">${sopra}</div><div class="ln-b">${sotto == null ? '' : sotto}</div></td>`;
}
function th2(sopra, sotto, titolo) {
  return `<th scope="col"${titolo ? ` title="${esc(titolo)}"` : ''}><div class="ln-a">${sopra}</div><div class="ln-b">${sotto || ''}</div></th>`;
}

function renderRfqEdit(id) {
  const r = getRfq(id); if (!r) { rfqView = 'list'; return ''; }
  const lines = (r.lines || []).map((l, i) => {
    const si = rfqLineSupInfo(r, l);
    const siSub = docSupInfoSub(si);
    const noteSub = docLineNoteSub(l);
    const lotWarn = lineLotWarn(l);
    const qty = Number(l.qty) || 0;
    const price = (l.price === '' || l.price == null) ? null : Number(l.price);
    return `<tr>
      ${cell2(i + 1, '', 'ln-idx')}
      ${cell2(`<span class="ln-code">${codeLink(l.itemId, l.code || '')}</span>`,
    `${esc(l.description)}${lineOriginTag(l)}${lotWarn ? ' ' + lotWarn : ''}${siSub}${noteSub}`)}
      ${cell2(`<input type="number" class="rfq-qty-input lock-contract" value="${l.qty}" min="0" step="any" title="Quantità" onchange="rfqSetLine('${id}','${l.id}','qty',this.value)">`,
    esc(l.uom || ''))}
      ${cell2(`<input type="number" class="rfq-price-input lock-offer" value="${price == null ? '' : price}" min="0" step="any" placeholder="—" title="Prezzo unitario" onchange="rfqSetLine('${id}','${l.id}','price',this.value)">`,
    `<span class="ln-amount">${price != null ? fmtN(importoRiga(l)) : '—'}</span>`)}
      ${cell2(`<input type="date" class="rfq-date-input lock-offer" value="${esc(l.deliveryDate || '')}" title="Data di consegna richiesta" onchange="rfqSetLine('${id}','${l.id}','deliveryDate',this.value)">`, '')}
      ${docLineActionsCell('rfq', id, l)}
    </tr>`;
  }).join('')
    || `<tr><td colspan="6" class="empty-text">Nessuna riga. Aggiungi articoli dal catalogo o manualmente.</td></tr>`;
  const mode = rfqMode(r);
  const lockBanner = docLockBanner(mode, 'Richiesta ' + (RFQ_STATUS[r.status] || r.status).toLowerCase(), 'rfq', id);
  return `<div class="manage-wrap">
    ${docToolbarHtml({ chiudi: 'rfqBackToList()', cosa: 'la richiesta', rec: r, stati: RFQ_STATUS, dirty: rfqDirty,
      saveId: 'rfq-save-btn', salva: `rfqSave('${id}')`, menu: [
        { label: 'Crea ordine da questa richiesta', icon: 'receipt', onclick: `orderFromRfq('${id}')` },
        { label: 'Elimina la richiesta', icon: 'trash', onclick: `delRfq('${id}')`, danger: true },
      ] })}
    ${docStepperHtml('rfq', r)}${docLinksHtml('rfq', r)}
    ${docCoWarnHtml()}${lockBanner}${stampLine(r)}
    ${docTestaHtml({ pfx: 'rfq', rec: r, stati: RFQ_STATUS, controparte: 'Fornitore', data: 'Data', note: 'Note per il fornitore' })}
    <h3 class="rfq-subhead">Righe richiesta
      <span class="rfq-head-actions">
        <button class="add-btn-sm lock-contract" onclick="rfqAddCatalogModal('${id}')">+ Da catalogo</button>
        <button class="btn-outline lock-contract" onclick="rfqAddManualLineModal('${id}')">+ Riga manuale</button>
      </span></h3>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Prezzo unitario e data consegna si lasciano vuoti nel documento inviato e si compilano al ritorno dell'offerta.</p>
    <div class="table-wrap"><table class="rfq-table rfq-table-2">
      <thead><tr>
        <th scope="col" class="ln-idx">#</th>
        ${th2('Codice', 'Descrizione')}
        ${th2('Q.tà', 'U.M.')}
        ${th2(`Prezzo unit. (${esc(cur())}/U.M.)`, `Importo (${esc(cur())})`, 'Prezzo di una unità, nella U.M. della riga; sotto, quanto fa per la quantità di riga')}
        ${th2('Data consegna', '')}
        <th scope="col"></th></tr></thead>
      <tbody>${lines}</tbody></table></div>
    ${docExportBarHtml({ etichetta: 'Documento di richiesta:', cls: 'rfq-export-btn', pdf: `exportRfqPDF('${id}')`, xls: `exportRfqExcel('${id}')`, dirty: rfqDirty, cosa: 'la richiesta', kind: 'rfq', rec: r })}
    ${rfqPriceBar(r)}
  </div>`;
}
// I prezzi tornati con l'offerta valgono oltre questa richiesta: da qui
// diventano quotazioni a listino, riutilizzabili e confrontabili nel tempo.
// L'operazione è esplicita: non si tocca il costo di un articolo di nascosto.
function rfqPriceBar(r) {
  if (!canWrite('catalog')) return '';
  const candidate = rfqPriceCandidates(r);
  const nuove = candidate.length;
  // Già registrati e ancora allo stesso prezzo: quelli cambiati stanno fra le nuove.
  const già = (r.lines || []).filter(l => {
    const it = l.itemId ? getItem(l.itemId) : null;
    return hasPriceList(it) && !candidate.includes(l) && !!rfqQuoteRow(it, r, l);
  }).length;
  if (!nuove && !già) return '';
  return `<div class="rfq-export-bar">
    <label>Prezzi d'offerta:</label>
    <button class="btn-outline" onclick="rfqRecordPricesModal('${r.id}')" ${nuove ? '' : 'disabled'}>${ico('euro', 'tinted', '')} Registra a listino${nuove ? ' (' + nuove + ')' : ''}</button>
    <span class="rfq-dirty-hint" style="color:var(--text-dim)">${già ? già + ' già registrati. ' : ''}Le quotazioni restano nel listino dell'articolo; il costo in uso si sceglie da lì.</span>
  </div>`;
}

function exportRfqPDF(id, modo) {
  const r = getRfq(id); if (!r) return;
  if (!(r.lines || []).length) { showToast('Nessuna riga da esportare', 'error'); return; }
  const jsPDF = requirePdf(); if (!jsPDF) return;
  // Le colonne "codice/descrizione fornitore" compaiono solo se qualche riga è legata
  // allo stesso fornitore della richiesta; in tal caso si usa l'orientamento orizzontale.
  const hasSup = (r.lines || []).some(l => rfqLineSupInfo(r, l));
  const doc = new jsPDF(hasSup ? { orientation: 'landscape' } : undefined);
  // Documento bilingue IT / EN per fornitori esteri
  const startY = docPdfTesta(doc, { titolo: 'Richiesta di offerta / Request for Quotation', rec: r,
    chi: 'RICHIEDENTE / BUYER', controparte: 'FORNITORE / SUPPLIER', vuota: '(fornitore non selezionato / not selected)',
    xControparte: hasSup ? 160 : 110 });
  const head = hasSup
    ? ['#', 'Codice\nCode', 'Descrizione\nDescription', 'Cod. forn.\nSuppl. code', 'Descr. forn.\nSuppl. desc.', 'Q.tà\nQty', 'Prezzo unit.\nUnit price', 'Data consegna\nDelivery date']
    : ['#', 'Codice\nCode', 'Descrizione\nDescription', 'Q.tà\nQty', 'Prezzo unit.\nUnit price', 'Data consegna\nDelivery date'];
  const body = (r.lines || []).map((l, i) => {
    const si = rfqLineSupInfo(r, l);
    // Il prezzo esce con il suo denominatore: su un documento che parte verso il
    // fornitore «3,20» e «3,20/m» sono due offerte diverse.
    const price = l.price === '' || l.price == null ? '' : fmtPrezzo(l.price) + (l.uom ? '/' + l.uom : '');
    const tail = [(fmtQtyIt(l.qty) + ' ' + (l.uom || '')).trim(), price, fmtDateIt(l.deliveryDate)];
    return hasSup ? [i + 1, l.code || '', lineDescDoc(l), si ? si.code : '', si ? si.desc : '', ...tail]
      : [i + 1, l.code || '', lineDescDoc(l), ...tail];
  });
  doc.autoTable({ startY, head: [head], body, styles: { fontSize: 8 }, headStyles: { fillColor: [58, 123, 232] } });
  doc.setTextColor(80); doc.setFontSize(9);
  // Solo r.notes: le note interne (notesInternal) non escono mai sul documento.
  docCoda(doc, [
    { etichetta: 'Trasporto / Shipping', testo: r.transport },
    { etichetta: 'Pagamento / Payment', testo: r.payment },
    { etichetta: 'Note / Notes', testo: r.notes },
  ], doc.lastAutoTable.finalY + 8);
  return docPdfEmetti('rfq', r, doc, { ripiego: 'richiesta', modo, stato: 'inviata', rerender: renderRfq,
    domanda: `PDF generato.\nSegnare la richiesta ${r.number} come inviata?` });
}

function exportRfqExcel(id) {
  const r = getRfq(id); if (!r) return;
  if (!(r.lines || []).length) { showToast('Nessuna riga da esportare', 'error'); return; }
  const data = docXlsTesta({ titolo: 'Richiesta di offerta', rec: r, chi: 'RICHIEDENTE', controparte: 'FORNITORE', voci: [
    ['Trasporto / Shipping', r.transport], ['Pagamento / Payment', r.payment]] });
  const hasSup = (r.lines || []).some(l => rfqLineSupInfo(r, l));
  // Come nell'ordine: valuta in intestazione, unità nella colonna U.M.
  const hPrezzo = `Prezzo unitario (${cur()}/U.M.)`;
  data.push(hasSup
    ? ['#', 'Codice', 'Descrizione', 'Codice fornitore', 'Descrizione fornitore', 'Q.tà', 'U.M.', hPrezzo, 'Data consegna', 'Nota']
    : ['#', 'Codice', 'Descrizione', 'Q.tà', 'U.M.', hPrezzo, 'Data consegna', 'Nota']);
  (r.lines || []).forEach((l, i) => {
    const si = rfqLineSupInfo(r, l);
    const price = l.price === '' || l.price == null ? '' : l.price;
    data.push(hasSup
      ? [i + 1, l.code || '', l.description, si ? si.code : '', si ? si.desc : '', l.qty || 0, l.uom || '', price, fmtDateIt(l.deliveryDate), l.note || '']
      : [i + 1, l.code || '', l.description, l.qty || 0, l.uom || '', price, fmtDateIt(l.deliveryDate), l.note || '']);
  });
  if (!docXlsSalva(data, r, 'RFQ', 'richiesta')) return;
  askMarkSent(r, `Excel generato.\nSegnare la richiesta ${r.number} come inviata?`, 'inviata', renderRfq);
}

// ─── Confronto offerte tra più richieste (una per fornitore) ───
function rfqLineKey(l) { return l.itemId || ('m:' + (l.code || '') + '|' + (l.description || '')); }
function rfqToggleCompare(rid, on) {
  if (on) { if (!rfqCompareSel.includes(rid)) rfqCompareSel.push(rid); }
  else rfqCompareSel = rfqCompareSel.filter(x => x !== rid);
  renderRfq();
}
function renderRfqCompare() {
  rfqCompareSel = rfqCompareSel.filter(id => getRfq(id));
  const head = `<div class="bom-toolbar">
      ${worklistCloseBtn('rfqBackToList()', 'il confronto')}
      <h2 class="section-title">${ico('chart', 'tinted pill', '')} Confronto offerte tra richieste</h2></div>`;
  const picker = db.rfqs.slice().sort((a, b) => (b.number || '').localeCompare(a.number || '')).map(r => {
    const on = rfqCompareSel.includes(r.id);
    return `<label class="rfq-sup-chk"><input type="checkbox" ${on ? 'checked' : ''} onchange="rfqToggleCompare('${r.id}',this.checked)">
      <span style="font-family:var(--mono)">${esc(r.number)}</span> ${esc(r.supplierId ? supplierName(r.supplierId) : '(nessun fornitore)')}</label>`;
  }).join('') || '<div class="empty-text">Nessuna richiesta disponibile.</div>';
  const sel = rfqCompareSel.map(id => getRfq(id)).filter(Boolean);
  let matrix;
  if (sel.length < 2) {
    matrix = '<div class="empty-text">Seleziona almeno due richieste per confrontare i prezzi articolo per articolo.</div>';
  } else {
    const keys = [], meta = {};
    sel.forEach(r => (r.lines || []).forEach(l => {
      const k = rfqLineKey(l);
      if (!(k in meta)) { keys.push(k); meta[k] = { itemId: l.itemId, code: l.code, description: l.description }; }
    }));
    const totals = sel.map(() => 0);
    // Quante righe ha quotato ciascuna offerta. Il totale somma solo le righe
    // con un prezzo: chi quota una riga su tre ha il totale più basso, e
    // finiva in verde come l'offerta migliore (dalla 0.105.6). Il minimo si
    // cerca solo fra le offerte complete; le altre dicono quante ne mancano.
    const quotate = sel.map(() => 0);
    const bodyRows = keys.map(k => {
      const cellsData = sel.map(r => {
        const l = (r.lines || []).find(x => rfqLineKey(x) === k);
        return (l && l.price !== '' && l.price != null) ? { price: Number(l.price), qty: Number(l.qty) || 0, uom: l.uom || '', del: l.deliveryDate } : null;
      });
      const valid = cellsData.filter(p => p && p.price > 0).map(p => p.price);
      const min = valid.length ? Math.min(...valid) : null;
      const cells = cellsData.map((p, ci) => {
        if (!p) return `<td class="rfq-cmp-cell">—</td>`;
        totals[ci] += p.price * p.qty;
        if (p.price > 0) quotate[ci]++;
        const isMin = min != null && p.price === min;
        // L'unità è quella della riga d'offerta, non "pz": ogni fornitore quota
        // nella sua, e confrontare €/kg con €/m senza dirlo è peggio che non
        // confrontare affatto.
        return `<td class="rfq-cmp-cell ${isMin ? 'rfq-min' : ''}">${fmtPer(p.price, p.uom)}<span class="rfq-line-tot">${fmtUom(p.qty, p.uom)}${p.del ? ' · ' + fmtDateIt(p.del) : ''}</span></td>`;
      }).join('');
      const m = meta[k];
      return `<tr><td>${esc(m.description || '')}<div class="rfq-cmp-sub">${codeLink(m.itemId, m.code || '')}</div></td>${cells}</tr>`;
    }).join('');
    const completa = ci => quotate[ci] === keys.length;
    const posTotals = totals.filter((t, ci) => t > 0 && completa(ci));
    const minTot = posTotals.length ? Math.min(...posTotals) : null;
    const totalRow = `<tr class="rfq-cmp-total"><td>Totale offerta</td>${totals.map((t, ci) => completa(ci)
      ? `<td class="${minTot != null && t === minTot ? 'rfq-min' : ''}">${fmtN(t)}</td>`
      : `<td title="Il totale somma solo le righe quotate: non si confronta con le offerte complete">${fmtN(t)}<span class="rfq-line-tot">incompleta (${quotate[ci]}/${keys.length})</span></td>`).join('')}</tr>`;
    const header = `<tr><th scope="col">Articolo</th>${sel.map(r => `<th scope="col">${esc(r.supplierId ? supplierName(r.supplierId) : r.number)}<div class="rfq-cmp-sub">${esc(r.number)}</div></th>`).join('')}</tr>`;
    matrix = `<div class="table-wrap"><table class="rfq-table rfq-cmp-table">
      <thead>${header}</thead><tbody>${bodyRows}${totalRow}</tbody></table></div>
      <p class="empty-text" style="text-align:left">Prezzo minimo per riga e totale offerta più basso evidenziati in verde. I totali usano la quantità indicata in ciascuna richiesta; un'offerta che non quota tutte le righe si dice incompleta e non entra nel confronto dei totali.</p>`;
  }
  return `<div class="manage-wrap">${head}
    <h3 class="rfq-subhead">Richieste da confrontare</h3>
    <div class="rfq-sup-grid">${picker}</div>
    <h3 class="rfq-subhead">Confronto prezzi</h3>
    ${matrix}
  </div>`;
}

function delRfq(id) {
  docDel('rfq', id, () => {
    rfqCompareSel = rfqCompareSel.filter(x => x !== id);
    if (currentRfqId === id) { currentRfqId = null; rfqView = 'list'; }
  });
}

// ═══════════════════════════════════════════════════════════
//  VISTA: ORDINI A FORNITORE (ODA)
// ═══════════════════════════════════════════════════════════
function getOrder(id) { return db.orders.find(o => o.id === id); }
function ordMode(o) { return docMode('order', o); }
function ordGuard(id, kind) { return docGuard('order', id, kind); }
function ordUnlock(id) { return docUnlock('order', id); }
// ─── Data richiesta contro data confermata ───
// Il fornitore conferma quasi sempre una data diversa da quella chiesta, e
// finora quella risposta non si scriveva da nessuna parte: restava in una mail.
// Qui si registra accanto alla richiesta, e lo scarto si vede — perché è lo
// scarto, non la data, a dire se la commessa va rifatta.
// In UTC come addDays(): qui la differenza farebbe cadere gli offset, ma il
// passaggio dell'ora legale fra le due date lascerebbe un'ora di scarto, e
// arrotondare a giorni interi è più fragile che non averne bisogno.
function giorniTra(a, b) {
  if (!a || !b) return null;
  const d1 = new Date(a + 'T00:00:00Z'), d2 = new Date(b + 'T00:00:00Z');
  if (isNaN(d1) || isNaN(d2)) return null;
  return Math.round((d2 - d1) / 86400000);
}
// Lo scarto si conta in giorni-fornitore (calendario.js): lavorativi di serie
// dalla 0.110.0, come i giorni di consegna a listino.
function ordLineDelay(l) {
  const a = l && l.deliveryDate, b = l && l.confirmedDate;
  if (!a || !b) return null;
  const g = typeof supplierDaysBetween === 'function' ? supplierDaysBetween(a, b) : giorniTra(a, b);
  return g == null ? null : g;
}
function ordLineDelayHtml(l) {
  const g = ordLineDelay(l);
  if (g == null || g === 0) return '';
  return g > 0
    ? `<div class="line-note" style="color:var(--red)">+${supplierDaysText(g)} sulla richiesta</div>`
    : `<div class="line-note" style="color:var(--green)">${supplierDaysText(g)} — in anticipo</div>`;
}
// Il ritardo peggiore dell'ordine: è quello che decide se la commessa slitta.
function orderWorstDelay(o) {
  let peggiore = null;
  (o.lines || []).forEach(l => {
    const g = ordLineDelay(l);
    if (g != null && g > 0 && (peggiore == null || g > peggiore)) peggiore = g;
  });
  return peggiore;
}
function orderTotal(o) { return totaleRighe(o.lines); }
function orderReception(o) {
  let ordered = 0, received = 0;
  (o.lines || []).forEach(l => { ordered += Number(l.qty) || 0; received += Number(l.received) || 0; });
  return { ordered, received, residual: ordered - received };
}
// Parziale/Evaso sono un fatto misurabile sui ricevimenti, non una scelta: li
// deriviamo. Bozza e Annullato restano decisioni dell'utente e non si toccano.
// Azzerando i ricevimenti si torna indietro, a Confermato o Inviato a seconda
// che la conferma d'ordine del fornitore sia arrivata.
function ordAutoStatus(o) {
  if (o.status === 'bozza' || o.status === 'annullato') return;
  const { ordered, received } = orderReception(o);
  // «Confermato» scelto a mano resta, anche senza il numero di conferma.
  if (received <= 0) o.status = (o.supplierConfirmation || o.status === 'confermato') ? 'confermato' : 'inviato';
  else if (ordered > 0 && received >= ordered) o.status = 'evaso';
  else o.status = 'parziale';
}
function nextOrderNumber() { return numeroProgressivo('ODA'); }

function renderOrders() {
  const host = document.getElementById('view-orders');
  if (orderView === 'edit' && !getOrder(currentOrderId)) { orderView = 'list'; currentOrderId = null; }
  const o = orderView === 'edit' ? getOrder(currentOrderId) : null;
  host.innerHTML = worklistHtml({
    titolo: 'Ordini a fornitore', icona: 'receipt', listaId: 'order-list',
    comandi: `<button class="add-btn-sm" onclick="newOrder()">+ Nuovo ordine</button>
      ${listExportButtons('orderListExportSpec')}`,
    filtri: docFilterBar('order', ORDER_STATUS, docFilterApply('order', db.orders).length, db.orders.length),
    righe: orderListRows(),
    doc: o ? renderOrderEdit(currentOrderId) : '',
    vuoto: {
      titolo: 'Nessun ordine aperto qui',
      testo: 'Scegli un ordine dall\'elenco a destra: al centro compaiono le righe con il prezzo, la data confermata dal fornitore e la colonna dei ricevimenti, che e\' quella che alimenta il magazzino.',
      comandi: '<button class="add-btn-sm" onclick="newOrder()">+ Nuovo ordine</button>',
    },
  });
  if (o) applyDocLock(ordMode(o), host);
  a11yFields(host);
}

function orderListRows() {
  const list = docFilterApply('order', db.orders.slice().sort((a, b) => (b.number || '').localeCompare(a.number || '')));
  return list.map(o => {
    const sup = o.supplierId ? supplierName(o.supplierId) : '— nessun fornitore —';
    const rec = orderReception(o);
    const recTxt = rec.ordered ? `ric. ${fmtQtyIt(rec.received)}/${fmtQtyIt(rec.ordered)}` : '';
    return worklistRow({
      numero: o.number,
      badge: statusBadge(ORDER_STATUS, o.status),
      titolo: o.title || '',
      meta: `${esc(sup)} · ${fmtN(orderTotal(o))}${recTxt ? ' · ' + recTxt : ''}${o.date ? ' · ' + esc(fmtDateIt(o.date)) : ''}`,
      sel: orderView === 'edit' && currentOrderId === o.id,
      spenta: o.status === 'annullato',
      azione: `openOrderEdit('${o.id}')`,
      etichetta: `Apri l'ordine ${o.number}`,
    });
  }).join('') || `<div class="empty-text">${db.orders.length ? 'Nessun ordine con questi filtri.' : 'Nessun ordine. Creane uno, oppure generalo da una richiesta di offerta, dal Fabbisogno o dal riordino del Magazzino.'}</div>`;
}
function newOrder() {
  if (!roleGuard('docs')) return;
  return conNumeri({ ODA: 1 }, () => {
    const o = Store.insert('orders', { id: gid(), number: nextOrderNumber(), title: '', date: oggiISO(),
      status: 'bozza', supplierId: null, transport: db.settings.transportDefault || '', payment: db.settings.paymentDefault || '',
      rfqId: null, planId: null, supplierConfirmation: '', notes: '', notesInternal: '', lines: [], active: true });
    docLeave('order'); currentOrderId = o.id; orderView = 'edit'; renderOrders();
  });
}
function orderFromRfq(rfqId) {
  if (!roleGuard('docs')) return;
  const r = getRfq(rfqId); if (!r) return;
  // Quanti numeri servono si sa prima: un ODA per la merce (o per una
  // richiesta senza lavorazioni), un ODL per ogni passata.
  const conFase = (r.lines || []).filter(l => !!l.phaseKey);
  const nOda = conFase.length < (r.lines || []).length || !conFase.length ? 1 : 0;
  // Fra il clic e la creazione c'è il giro dei numeri: un secondo clic, o un
  // collega, può aver creato l'ordine nel frattempo. Allora ci si ferma.
  const crea = () => {
    const prima = ordiniDaRfq(r.id).length;
    return conNumeri({ ODA: nOda, ODL: new Set(conFase.map(clPassataDiRiga)).size }, () => {
      if (ordiniDaRfq(r.id).length > prima) { showToast(`L'ordine da ${r.number} è appena stato creato`, 'error'); return; }
      return orderFromRfqFatto(r);
    });
  };
  // Un ordine da questa richiesta c'è già (dalla 0.105.5): un secondo nasce
  // solo se lo si vuole davvero. Prima ne nasceva uno a ogni clic.
  const gia = ordiniDaRfq(r.id);
  if (gia.length) {
    return askConfirm(`Da ${r.number} esiste già ${gia.map(d => d.number).join(', ')}. Crearne un altro?`, crea,
      { title: 'Ordine già creato', ok: 'Crea un altro ordine' });
  }
  return crea();
}
function ordiniDaRfq(rfqId) {
  return [].concat(db.orders || [], db.workOrders || []).filter(d => d.rfqId === rfqId && d.status !== 'annullato');
}
function orderFromRfqFatto(r) {
  const sup = r.supplierId ? getSupplier(r.supplierId) : null;
  const o = stampNew({ id: gid(), number: nextOrderNumber(),
    title: r.title || ('Da ' + r.number), date: oggiISO(), status: 'bozza',
    supplierId: r.supplierId || null,
    transport: r.transport || (sup && sup.defaultTransport) || db.settings.transportDefault || '',
    payment: r.payment || (sup && sup.defaultPayment) || db.settings.paymentDefault || '',
    rfqId: r.id, planId: r.planId || null, supplierConfirmation: '', notes: r.notes || '', notesInternal: r.notesInternal || '',
    lines: [], active: true });
  // Una richiesta può contenere insieme merce e lavorazioni dello stesso
  // fornitore — chiedere quanto costa il materiale e quanto costa lavorarlo è
  // una domanda sola. Gli **ordini** invece sono due, e qui la richiesta si
  // divide: le righe con una fase vanno in un ordine di lavoro, le altre in un
  // ordine d'acquisto. Mescolarle sarebbe il contrario della separazione.
  const copia = l => ({ id: gid(), itemId: l.itemId || null, code: l.code || '', description: l.description || '',
    uom: l.uom || defaultUom(), qty: Number(l.qty) || 0, price: (l.price === '' || l.price == null) ? '' : Number(l.price),
    deliveryDate: l.deliveryDate || '', received: 0, note: l.note || '',
    phaseKey: l.phaseKey || null, phaseKeys: l.phaseKeys || l.phaseKey || null });
  const merce = (r.lines || []).filter(l => !l.phaseKey);
  const fasi = (r.lines || []).filter(l => !!l.phaseKey);
  const creati = [];
  // L'ordine d'acquisto è il caso normale e resta il ripiego: una richiesta
  // senza righe, o con solo merce, produce un ODA — anche vuoto, com'è sempre
  // stato. Solo una richiesta di **sole** lavorazioni non ne genera nessuno.
  if (merce.length || !fasi.length) {
    o.lines = merce.map(copia);
    db.orders.push(o); creati.push({ kind: 'order', doc: o });
  }
  let w = null;
  // Una richiesta d'offerta tiene insieme le due passate dello stesso terzista —
  // chiedere non è commissionare, e a un preventivo si risponde una volta. Un
  // **ordine** no: fra la prima e la seconda passata il pezzo torna da noi, e
  // le due lavorazioni non si possono fare di seguito. Qui si separano.
  const perPassata = new Map();
  fasi.forEach(l => {
    const k = clPassataDiRiga(l);
    if (!perPassata.has(k)) perPassata.set(k, []);
    perPassata.get(k).push(l);
  });
  Array.from(perPassata.keys()).sort((a, b) => a - b).forEach(k => {
    const doc = stampNew(Object.assign({}, o, { id: gid(), number: nextOdlNumber(),
      lines: perPassata.get(k).map(l => Object.assign(copia(l), { itemId: null, startDate: '' })) }));
    db.workOrders.push(doc); creati.push({ kind: 'odl', doc });
    if (!w) w = doc;
  });
  // La richiesta ha esaurito il suo scopo: si chiude da sé, ma solo se era
  // davvero uscita (da una bozza si può generare un ordine di prova).
  let closed = false;
  if (r.status === 'inviata' || r.status === 'ricevuta') { r.status = 'chiusa'; touch(r); closed = true; }
  saveDB();
  // Si apre il primo dei due: l'altro è nel suo elenco, e il messaggio lo dice.
  const primo = creati[0];
  // Anche la richiesta si lascia: i prezzi scritti prima di «Crea ordine» sono
  // appena stati salvati, e il segno «da salvare» fermava la ricezione dei
  // colleghi nell'archivio condiviso.
  docLeave('rfq');
  docLeave(primo.kind);
  if (primo.kind === 'order') { currentOrderId = primo.doc.id; orderView = 'edit'; setView('orders'); }
  else { currentOdlId = primo.doc.id; odlView = 'edit'; setView('odl'); }
  const nomi = creati.map(c => (c.kind === 'odl' ? 'ordine di lavoro ' : 'ordine ') + c.doc.number).join(' e ');
  showToast(`Creat${creati.length > 1 ? 'i' : 'o'} ${nomi} dalla richiesta${closed ? ' · ' + r.number + ' chiusa' : ''}`);
}
function openOrderEdit(id) { docLeave('order'); currentOrderId = id; orderView = 'edit'; renderOrders(); }
function orderBackToList() { docBackToList('order'); }
function orderMarkDirty() { docMarkDirty('order'); }
function ordSave(id) { docSave('order', id); }
function ordSetField(id, field, value) { docSetField('order', id, field, value); }
function ordSetSupplier(id, sid) { docSetSupplier('order', id, sid); }
function ordSetLine(id, lineId, field, value) { docSetLine('order', id, lineId, field, value); }
function ordDelLine(id, lineId) { docDelLine('order', id, lineId); }
// Ritorna vero se ha registrato: il QR lo usa per dire com'è andata.
function ordMarkAllReceived(id) {
  if (!ordGuard(id, 'reception')) return false;
  const o = getOrder(id); if (!o) return false;
  (o.lines || []).forEach(l => { registraRicevuto('orders', o, l, Number(l.qty) || 0); });
  ordAutoStatus(o); touch(o); orderMarkDirty(); renderOrders();
  return true;
}

function ordAddManualLineModal(id) { docAddManualLineModal('order', id); }
function ordAddManualLine(id) { docAddManualLine('order', id); }
function ordEditLineModal(id, lineId) { docEditLineModal('order', id, lineId); }
function ordSaveLineEdit(id, lineId) { docSaveLineEdit('order', id, lineId); }
function ordAddCatalogModal(id) { if (!ordGuard(id, 'contract')) return; catalogPickerModal(ids => ordAddCatalogLines(id, ids)); }
function ordAddCatalogLines(id, ids) { docAddCatalogLines('order', id, ids); }

// ─── La riga porta ancora il listino di un altro? ───
// Le righe si compilano e *poi* si sceglie il fornitore, o lo si cambia a
// documento avviato. I prezzi non si riscrivono da soli — in quest'app nessun
// prezzo cambia da sé, è la regola su cui poggia tutto il resto — ma una riga
// che porta la quotazione di Rossi su un ordine passato a Bianchi va detta,
// altrimenti resta un numero sbagliato dall'aria giusta fino alla fattura.
//
// Si confronta con la quotazione più recente del fornitore attuale, nel
// **costo convertito** nell'unità di gestione — che è quella in cui la riga
// vive sempre, indipendentemente da come quel fornitore valorizza il
// listino. Niente avviso su una riga manuale (non viene da un listino), né
// su una riga senza prezzo (l'assenza si vede già da sé).
function ordLineListinoWarn(o, l) {
  if (!l.itemId || !o.supplierId) return '';
  const prezzo = (l.price === '' || l.price == null) ? null : Number(l.price);
  if (prezzo == null) return '';
  const it = getItem(l.itemId);
  const row = supplierPriceRow(it, o.supplierId);
  const sup = supplierName(o.supplierId) || 'questo fornitore';
  if (!row || row.price === '' || row.price == null) {
    return `<span class="mrp-warn" title="${esc(sup)} non ha questo articolo a listino: il prezzo in riga viene da un'altra parte. Verificalo prima di mandare l'ordine.">⚠ non a listino</span>`;
  }
  const cost = rowUnitCost(it, row) || 0;
  if (Math.abs(cost - prezzo) < 0.00005) return '';
  const uom = priceUomOf(it, row);
  const grezzo = uom !== (it.uom || '') ? ` (a listino ${fmtPer(row.price, uom)})` : '';
  return `<span class="mrp-warn" title="A listino ${esc(sup)} quota ${fmtPer(cost, itemUom(it))}${grezzo}. La riga dice altro: può essere un prezzo concordato, o il listino di un fornitore diverso rimasto da prima.">⚠ ${fmtPer(cost, itemUom(it))} a listino</span>`;
}

function renderOrderEdit(id) {
  const o = getOrder(id); if (!o) { orderView = 'list'; return ''; }
  const lines = (o.lines || []).map((l, i) => {
    const si = lineSupInfo(o.supplierId, l);
    const siSub = docSupInfoSub(si);
    const warn = ordLineListinoWarn(o, l);
    const lotWarn = lineLotWarn(l);
    const qty = Number(l.qty) || 0, price = (l.price === '' || l.price == null) ? null : Number(l.price);
    const amount = price != null ? importoRiga(l) : null;
    const rec = Number(l.received) || 0, residual = qty - rec;
    return `<tr>
      ${cell2(i + 1, '', 'ln-idx')}
      ${cell2(`<span class="ln-code">${codeLink(l.itemId, l.code || '')}</span>`,
    `${esc(l.description)}${lineOriginTag(l)}${warn ? ' ' + warn : ''}${lotWarn ? ' ' + lotWarn : ''}${siSub}${docLineNoteSub(l)}${ordClLineActions(o, l)}`)}
      ${cell2(`<input type="number" class="rfq-qty-input lock-contract" value="${l.qty}" min="0" step="any" title="Quantità ordinata" onchange="ordSetLine('${id}','${l.id}','qty',this.value)">`,
    esc(l.uom || ''))}
      ${cell2(`<input type="number" class="rfq-price-input lock-contract" value="${price != null ? price : ''}" min="0" step="any" placeholder="—" title="Prezzo unitario" onchange="ordSetLine('${id}','${l.id}','price',this.value)">`,
    `<span class="ln-amount">${amount != null ? fmtN(amount) : '—'}</span>`)}
      ${cell2(`<input type="date" class="rfq-date-input lock-contract" value="${esc(l.deliveryDate || '')}" title="Data che abbiamo chiesto" onchange="ordSetLine('${id}','${l.id}','deliveryDate',this.value)">`,
    `<input type="date" class="rfq-date-input lock-reception" value="${esc(l.confirmedDate || '')}" title="Data che il fornitore ha confermato" onchange="ordSetLine('${id}','${l.id}','confirmedDate',this.value)">${ordLineDelayHtml(l)}`)}
      ${cell2(`<input type="number" class="rfq-qty-input lock-reception" value="${rec}" min="0" step="any" title="${l.phaseKey ? 'Pezzi rientrati dal terzista: portano questo ordine a parziale o evaso, ma non caricano il magazzino. Il rientro si registra come movimento.' : 'Quantità ricevuta'}" onchange="ordSetLine('${id}','${l.id}','received',this.value)">`,
    `<span class="ln-residual ${residual > 0 ? 'pos' : ''}" title="Residuo da ricevere">${fmtQtyIt(residual)}</span>`)}
      ${docLineActionsCell('ord', id, l)}
    </tr>`;
  }).join('') || `<tr><td colspan="7" class="empty-text">Nessuna riga. Aggiungi articoli dal catalogo o manualmente.</td></tr>`;
  const total = orderTotal(o);
  // Se il fornitore ha confermato più tardi di quanto chiesto, si dice subito e
  // in testata: è l'informazione che fa decidere se la commessa slitta, e non
  // deve stare nascosta in una colonna in fondo.
  const ritardo = orderWorstDelay(o);
  const mode = ordMode(o);
  const lockBanner = docLockBanner(mode, 'Ordine ' + (ORDER_STATUS[o.status] || o.status).toLowerCase(), 'order', id);
  return `<div class="manage-wrap">
    ${docToolbarHtml({ chiudi: 'orderBackToList()', cosa: "l'ordine", rec: o, stati: ORDER_STATUS, dirty: orderDirty,
      saveId: 'order-save-btn', salva: `ordSave('${id}')`, menu: [{ label: "Elimina l'ordine", icon: 'trash', onclick: `delOrder('${id}')`, danger: true }] })}
    ${docStepperHtml('order', o)}${docLinksHtml('order', o)}
    ${docCoWarnHtml()}${lockBanner}${stampLine(o)}
    ${docTestaHtml({ pfx: 'ord', rec: o, stati: ORDER_STATUS, controparte: 'Fornitore', data: 'Data ordine', conferma: "N° conferma d'ordine fornitore", note: 'Note' })}
    ${ritardo != null ? `<div class="rfq-warn">${ico('clock', 'tinted', '')} Il fornitore ha confermato con <strong>${supplierDaysText(ritardo)}</strong> di ritardo sulla data richiesta. Se questo materiale è a commessa, la consegna al cliente va verificata.</div>` : ''}
    <h3 class="rfq-subhead">Righe ordine
      <span class="rfq-head-actions">
        <button class="add-btn-sm lock-contract" onclick="ordAddCatalogModal('${id}')">+ Da catalogo</button>
        <button class="btn-outline lock-contract" onclick="ordAddManualLineModal('${id}')">+ Riga manuale</button>
        <button class="btn-outline lock-reception" onclick="ordMarkAllReceived('${id}')">✓ Segna tutto ricevuto</button>
      </span></h3>
    <div class="table-wrap"><table class="rfq-table rfq-table-2">
      <thead><tr>
        <th scope="col" class="ln-idx">#</th>
        ${th2('Codice', 'Descrizione')}
        ${th2('Q.tà', 'U.M.')}
        ${th2(`Prezzo unit. (${esc(cur())}/U.M.)`, `Importo (${esc(cur())})`, 'Prezzo di una unità, nella U.M. della riga; sotto, quanto fa per la quantità di riga')}
        ${th2('Richiesta', 'Confermata', 'Sopra la data che abbiamo chiesto, sotto quella che il fornitore ha confermato')}
        ${th2('Ricevuto', 'Residuo', 'Sopra quanto è arrivato, sotto quanto manca')}
        <th scope="col"></th></tr></thead>
      <tbody>${lines}</tbody>
      <tfoot><tr class="rfq-cmp-total"><td colspan="3" style="text-align:right">Totale imponibile</td><td>${fmtN(total)}</td><td colspan="3"></td></tr></tfoot>
    </table></div>
    ${docExportBarHtml({ etichetta: "Documento d'ordine:", cls: 'order-export-btn', pdf: `exportOrderPDF('${id}')`, xls: `exportOrderExcel('${id}')`, dirty: orderDirty, cosa: "l'ordine", kind: 'order', rec: o })}
  </div>`;
}

function exportOrderPDF(id, modo) {
  const o = getOrder(id); if (!o) return;
  if (!(o.lines || []).length) { showToast('Nessuna riga da esportare', 'error'); return; }
  const jsPDF = requirePdf(); if (!jsPDF) return;
  const hasSup = (o.lines || []).some(l => lineSupInfo(o.supplierId, l));
  const doc = new jsPDF({ orientation: 'landscape' });
  // Il QR in alto a destra apre la scheda rapida dell'ordine (qr.js): chi riceve
  // la merce inquadra la copia stampata e registra il ricevimento da lì.
  if (o.number) qrPdfDraw(doc, qrLink('oda', o.number), doc.internal.pageSize.getWidth() - 14 - 22, 5, 22);
  const startY = docPdfTesta(doc, { titolo: 'Ordine di acquisto / Purchase Order', rec: o,
    chi: 'RICHIEDENTE / BUYER', controparte: 'FORNITORE / SUPPLIER', vuota: '(fornitore non selezionato / not selected)' });
  const head = hasSup
    ? ['#', 'Codice\nCode', 'Descrizione\nDescription', 'Cod. forn.\nSuppl. code', 'Descr. forn.\nSuppl. desc.', 'Q.tà\nQty', 'Prezzo unit.\nUnit price', 'Importo\nAmount', 'Data consegna\nDelivery date']
    : ['#', 'Codice\nCode', 'Descrizione\nDescription', 'Q.tà\nQty', 'Prezzo unit.\nUnit price', 'Importo\nAmount', 'Data consegna\nDelivery date'];
  const body = (o.lines || []).map((l, i) => {
    const si = lineSupInfo(o.supplierId, l);
    const qty = Number(l.qty) || 0, price = (l.price === '' || l.price == null) ? null : Number(l.price);
    const tail = [(fmtQtyIt(qty) + ' ' + (l.uom || '')).trim(),
      price != null ? fmtPrezzo(price) + (l.uom ? '/' + l.uom : '') : '',
      price != null ? fmtN(importoRiga(l)) : '', fmtDateIt(l.deliveryDate)];
    return hasSup ? [i + 1, l.code || '', lineDescDoc(l), si ? si.code : '', si ? si.desc : '', ...tail] : [i + 1, l.code || '', lineDescDoc(l), ...tail];
  });
  const totLabel = { content: 'Totale / Total', styles: { halign: 'right', fontStyle: 'bold' } };
  const totVal = { content: fmtN(orderTotal(o)), styles: { fontStyle: 'bold' } };
  const foot = hasSup ? [['', '', '', '', '', '', totLabel, totVal, '']] : [['', '', '', '', totLabel, totVal, '']];
  doc.autoTable({ startY, head: [head], body, foot, styles: { fontSize: 8 }, headStyles: { fillColor: [58, 123, 232] }, footStyles: { fillColor: [235, 238, 245], textColor: 20 } });
  doc.setTextColor(80); doc.setFontSize(9);
  // Solo o.notes: le note interne (notesInternal) non escono mai sul documento.
  docCoda(doc, [
    { etichetta: 'Trasporto / Shipping', testo: o.transport },
    { etichetta: 'Pagamento / Payment', testo: o.payment },
    { etichetta: 'Conferma fornitore / Order confirmation', testo: o.supplierConfirmation },
    { etichetta: 'Note / Notes', testo: o.notes },
  ], doc.lastAutoTable.finalY + 8);
  return docPdfEmetti('order', o, doc, { ripiego: 'ordine', modo, stato: 'inviato', rerender: renderOrders,
    domanda: `PDF generato.\nSegnare l'ordine ${o.number} come inviato?` });
}

function exportOrderExcel(id) {
  const o = getOrder(id); if (!o) return;
  if (!(o.lines || []).length) { showToast('Nessuna riga da esportare', 'error'); return; }
  const data = docXlsTesta({ titolo: 'Ordine di acquisto / Purchase Order', rec: o, chi: 'RICHIEDENTE', controparte: 'FORNITORE', voci: [
    ['Da richiesta', o.rfqId && getRfq(o.rfqId) ? getRfq(o.rfqId).number : ''],
    ['Trasporto / Shipping', o.transport], ['Pagamento / Payment', o.payment],
    ['Conferma fornitore / Order confirmation', o.supplierConfirmation]] });
  const hasSup = (o.lines || []).some(l => lineSupInfo(o.supplierId, l));
  // Nel foglio i numeri restano numeri: la valuta si dichiara in intestazione,
  // l'unità sta nella sua colonna e vale per q.tà, ricevuto e residuo.
  const hPrezzo = `Prezzo unitario (${cur()}/U.M.)`, hImporto = `Importo (${cur()})`;
  data.push(hasSup
    ? ['#', 'Codice', 'Descrizione', 'Codice fornitore', 'Descrizione fornitore', 'Q.tà', 'U.M.', hPrezzo, hImporto, 'Consegna', 'Ricevuto', 'Residuo', 'Nota']
    : ['#', 'Codice', 'Descrizione', 'Q.tà', 'U.M.', hPrezzo, hImporto, 'Consegna', 'Ricevuto', 'Residuo', 'Nota']);
  (o.lines || []).forEach((l, i) => {
    const si = lineSupInfo(o.supplierId, l);
    const qty = Number(l.qty) || 0, price = (l.price === '' || l.price == null) ? '' : Number(l.price);
    const amount = price === '' ? '' : importoRiga(l);
    const rec = Number(l.received) || 0;
    const supCols = hasSup ? [si ? si.code : '', si ? si.desc : ''] : [];
    data.push([i + 1, l.code || '', l.description, ...supCols, qty, l.uom || '', price, amount, fmtDateIt(l.deliveryDate), rec, qty - rec, l.note || '']);
  });
  data.push([]);
  data.push(['', 'TOTALE IMPONIBILE / TOTAL', orderTotal(o)]);
  if (!docXlsSalva(data, o, 'Ordine', 'ordine')) return;
  askMarkSent(o, `Excel generato.\nSegnare l'ordine ${o.number} come inviato?`, 'inviato', renderOrders);
}

// ═══════════════════════════════════════════════════════════
//  ORDINI DI LAVORO (ODL) — conto lavoro
// ═══════════════════════════════════════════════════════════
// Le lavorazioni affidate a un terzista. Un ordine d'acquisto compra della
// merce, un ordine di lavoro manda dei pezzi a lavorare: due documenti diversi,
// due numerazioni, due elenchi. Tenerli insieme costringeva ogni conto — il
// totale acquistato, il carico di magazzino, la copertura di commessa — a
// filtrare per un campo, ed è il tipo di distinzione che prima o poi qualcuno
// dimentica in uno dei posti.
//
// Quello che invece **si riusa per intero** è la macchina dei documenti: stati,
// blocchi per stato, salvataggio differito, righe, ricevimenti, guardie di
// ruolo. Sta tutta in DOC_KINDS, e l'ODL è la terza voce di quel registro.
function getOdl(id) { return (db.workOrders || []).find(o => o.id === id); }
function odlMode(o) { return docMode('odl', o); }
function odlGuard(id, kind) { return docGuard('odl', id, kind); }
function odlUnlock(id) { return docUnlock('odl', id); }
function odlTotal(o) { return totaleRighe(o.lines); }
// Progressivo per anno: ODL-<anno>-NNN. Numerazione **sua**: un ODL e un ODA
// dello stesso giorno non devono avere lo stesso numero, o al telefono col
// terzista non si capisce di quale documento si stia parlando.
function nextOdlNumber() { return numeroProgressivo('ODL'); }

function renderOdl() {
  const host = document.getElementById('view-odl'); if (!host) return;
  if (odlView === 'edit' && !getOdl(currentOdlId)) { odlView = 'list'; currentOdlId = null; }
  const o = odlView === 'edit' ? getOdl(currentOdlId) : null;
  const tutti = db.workOrders || [];
  host.innerHTML = worklistHtml({
    titolo: 'Ordini di lavoro', icona: 'wrench', listaId: 'odl-list',
    comandi: `<button class="add-btn-sm" onclick="newOdl()">+ Nuovo ordine di lavoro</button>
      ${listExportButtons('odlListExportSpec')}`,
    filtri: docFilterBar('odl', ORDER_STATUS, docFilterApply('odl', tutti).length, tutti.length),
    righe: odlListRows(),
    doc: o ? renderOdlEdit(currentOdlId) : '',
    vuoto: {
      titolo: 'Nessun ordine di lavoro aperto qui',
      testo: 'Scegli un ordine dall\'elenco a destra. Gli ordini di lavoro nascono dal Fabbisogno o da un ordine di produzione, dalle fasi di ciclo affidate a un terzista, oppure si scrivono a mano: al centro compaiono le lavorazioni con la tariffa, la data e i pezzi rientrati.',
      comandi: '<button class="add-btn-sm" onclick="newOdl()">+ Nuovo ordine di lavoro</button>',
    },
  });
  if (o) applyDocLock(odlMode(o), host);
  a11yFields(host);
}
function odlListRows() {
  const tutti = db.workOrders || [];
  const list = docFilterApply('odl', tutti.slice().sort((a, b) => (b.number || '').localeCompare(a.number || '')));
  return list.map(o => {
    const sup = o.supplierId ? supplierName(o.supplierId) : '— nessun terzista —';
    const rec = orderReception(o);
    const recTxt = rec.ordered ? `rientr. ${fmtQtyIt(rec.received)}/${fmtQtyIt(rec.ordered)}` : '';
    return worklistRow({
      numero: o.number,
      badge: statusBadge(ORDER_STATUS, o.status),
      titolo: o.title || '',
      meta: `${esc(sup)} · ${fmtN(odlTotal(o))}${recTxt ? ' · ' + recTxt : ''}${o.date ? ' · ' + esc(fmtDateIt(o.date)) : ''}`,
      sel: odlView === 'edit' && currentOdlId === o.id,
      spenta: o.status === 'annullato',
      azione: `openOdlEdit('${o.id}')`,
      etichetta: `Apri l'ordine di lavoro ${o.number}`,
    });
  }).join('') || `<div class="empty-text">${tutti.length ? 'Nessun ordine di lavoro con questi filtri.' : 'Nessun ordine di lavoro. Si generano dal Fabbisogno o da un ordine di produzione, dalle fasi affidate a un terzista, oppure si scrivono a mano con «+ Nuovo ordine di lavoro».'}</div>`;
}
function newOdl() {
  if (!roleGuard('docs')) return;
  return conNumeri({ ODL: 1 }, () => {
    const o = Store.insert('workOrders', { id: gid(), number: nextOdlNumber(), title: '', date: oggiISO(),
      status: 'bozza', supplierId: null, transport: db.settings.transportDefault || '', payment: db.settings.paymentDefault || '',
      rfqId: null, planId: null, jobId: null, supplierConfirmation: '', notes: '', notesInternal: '', lines: [], active: true });
    docLeave('odl'); currentOdlId = o.id; odlView = 'edit'; renderOdl();
  });
}
function openOdlEdit(id) { docLeave('odl'); currentOdlId = id; odlView = 'edit'; renderOdl(); }
function odlBackToList() { docBackToList('odl'); }
function odlMarkDirty() { docMarkDirty('odl'); }
function odlSave(id) { docSave('odl', id); }
function odlSetField(id, field, value) { docSetField('odl', id, field, value); }
function odlSetSupplier(id, sid) { docSetSupplier('odl', id, sid); }
function odlSetLine(id, lineId, field, value) { docSetLine('odl', id, lineId, field, value); }
// Una riga avviata o con dei rientri ha mosso il magazzino: toglierla
// lascerebbe i suoi movimenti senza un documento che li spieghi.
function odlDelLine(id, lineId) {
  const o = getOdl(id), l = o && (o.lines || []).find(x => x.id === lineId);
  if (l && odlEventiRiga(o, l).length) { showToast('Questa lavorazione è già avviata: annulla prima avvio e rientri, nello storico qui sotto', 'error'); return; }
  docDelLine('odl', id, lineId);
}
function odlAddManualLineModal(id) { docAddManualLineModal('odl', id); }
function odlAddManualLine(id) { docAddManualLine('odl', id); }
function odlEditLineModal(id, lineId) { docEditLineModal('odl', id, lineId); }
function odlSaveLineEdit(id, lineId) { docSaveLineEdit('odl', id, lineId); }
function odlListExportSpec() { return docListExportSpec('odl'); }
function delOdl(id) {
  if ((db.prodDecls || []).some(d => d.odlId === id)) { showToast('Su questo ordine di lavoro ci sono avvii o rientri: annullalo invece di eliminarlo, o annulla prima quelli', 'error'); return; }
  docDel('odl', id);
}
// ═══════════════════════════════════════════════════════════
//  AVVIA E DICHIARA SULLA RIGA (dalla 0.116.0)
// ═══════════════════════════════════════════════════════════
// Gli stessi due gesti dell'ordine di produzione, qualunque sia l'origine
// della riga. Prima l'ordine di lavoro aveva quattro comandi suoi — spedisci
// materiale, manda al terzista, ritira dal terzista, registra rientro — che
// scrivevano movimenti e basta: niente scarti, niente stato, e i pezzi
// rientrati da scrivere a mano una seconda volta.
//
// **Un solo padrone per tratta.** Se la riga viene da un ordine di produzione,
// o dal fabbisogno di un piano che ne ha lanciato uno per quella parte, il
// padrone è l'ODP: avvia e dichiara aprono le sue schede e scrivono le sue
// dichiarazioni, e lo stesso gesto non si può registrare due volte da due
// documenti. Altrimenti il padrone è la riga, che porta eventi propri nella
// stessa collezione dell'ODP (`prodDecls`, con `odlId` e `odlLineId`).
//
// Il magazzino si muove come prima, ai due estremi del ciclo: l'avvio della
// prima tratta esterna fa uscire il materiale (clOut), la dichiarazione
// dell'ultima carica il codice della parte (clIn); in mezzo i pezzi passano e
// basta (clStep). Una riga scritta a mano, senza ciclo, non muove niente.
const ODL_EV_ETICHETTA = { avvio: 'Avvio', avanzamento: 'Rientro' };
function odlEventiRiga(o, l, opz) {
  const ev = (db.prodDecls || []).filter(d => d.odlId === o.id && d.odlLineId === l.id)
    .slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  if (!(opz && opz.conVecchi)) return ev;
  // I movimenti registrati con i comandi di prima non hanno una dichiarazione
  // che li spieghi: valgono come un avvio e un rientro senza data, e nessun
  // dato di prima va migrato per continuare a contare.
  const vecchi = (db.movements || []).filter(m => m.orderId === o.id && m.lineId === l.id && !m.declId && isContoLavoroKind(m.kind));
  const prima = [];
  if (vecchi.some(odlMovUscita) && !ev.some(d => d.kind === 'avvio')) prima.push({ kind: 'avvio', vecchio: true, note: '' });
  const dichiarati = ev.reduce((t, d) => t + (d.kind === 'avanzamento' ? (Number(d.qty) || 0) + (Number(d.scrap) || 0) : 0), 0);
  const tornati = vecchi.filter(m => !odlMovUscita(m)).reduce((t, m) => t + Math.abs(Number(m.qty) || 0), 0);
  const resto = Math.max(tornati, (Number(l.received) || 0) - dichiarati);
  const dopo = resto > 0.000001 ? [{ kind: 'avanzamento', vecchio: true, qty: resto, scrap: 0, note: '' }] : [];
  return prima.concat(ev, dopo);
}
function odlMovUscita(m) { return m.kind === 'clOut' || (m.kind === 'clStep' && !m.fromSupplierId); }
// La riga ha mosso qualcosa da sé: eventi suoi, o movimenti dei comandi di
// prima. I soli rientrati scritti a mano non contano — non hanno mosso niente,
// e passata la tratta all'ODP resterebbero lì a sembrare eventi da prendere.
function odlHaEventiPropri(o, l) {
  return (db.prodDecls || []).some(d => d.odlId === o.id && d.odlLineId === l.id)
    || (db.movements || []).some(m => m.orderId === o.id && m.lineId === l.id && !m.declId && isContoLavoroKind(m.kind));
}
// Dove sta la riga nella sua tratta. Un ordine di lavoro di prima delle tratte
// ha una riga per fase: si avvia dalla prima e si dichiara dall'ultima, e i
// rientrati valgono per tutte (`sorelle`). Una riga senza ciclo è libera: si
// avvia e si dichiara lei, senza magazzino.
function odlAncore(o, l) {
  const ruolo = l.phaseKey ? clLineRole(o, l) : null;
  if (!ruolo || !ruolo.prima) {
    return { libera: true, prima: l, ultima: l, sorelle: [l], apre: true, chiude: true, outKind: '', inKind: '', part: null };
  }
  return { libera: false, prima: ruolo.prima, ultima: ruolo.ultima, sorelle: ruolo.sorelle.length ? ruolo.sorelle : [l],
    apre: ruolo.out, chiude: ruolo.in, outKind: ruolo.outKind, inKind: ruolo.inKind, part: ruolo.part };
}
// Il legame che decide il padrone. Una riga del piano che è partita da sola
// prima del lancio dell'ODP resta sua finché l'ODP è in bozza: al lancio i suoi
// eventi passano all'ODP (opRilevaOdl).
function odlLegameAttivo(o, l) {
  if (typeof opLegameRigaOdl !== 'function') return null;
  const leg = opLegameRigaOdl(o, l);
  if (!leg) return null;
  if (leg.dalPiano && leg.odp.status === 'bozza' && odlHaEventiPropri(o, l)) return null;
  return leg;
}
function odlRigaAvviata(o, l) {
  const p = odlAncore(o, l).prima;
  return odlEventiRiga(o, p, { conVecchi: true }).some(d => d.kind === 'avvio');
}
function odlRigaResta(l) { return Math.max(0, (Number(l.qty) || 0) - (Number(l.received) || 0)); }
// In bozza l'ordine non è ancora arrivato al terzista: il materiale non parte.
function odlNonAvviabile(o) {
  if (o.status === 'bozza') return "l'ordine è in bozza: segnalo come inviato prima di mandare il materiale";
  if (o.status === 'annullato') return "l'ordine è annullato";
  return '';
}
// Cosa esce all'avvio: il materiale del ciclo all'inizio della prima tratta
// esterna, altrimenti i pezzi stessi. Al netto di quanto è già uscito.
function odlMaterialeProposto(o, l) {
  const a = odlAncore(o, l);
  if (a.libera || !a.apre) return [];
  const pezzi = Number(l.qty) || 0;
  const righe = a.outKind === 'clStep'
    ? (a.part && hasStock(a.part) ? [{ item: a.part, perPezzo: 1, qty: pezzi }] : [])
    : (typeof sostituzioniMateriali === 'function' ? sostituzioniMateriali(o.planId, clMaterialsOf(a.part, pezzi)) : clMaterialsOf(a.part, pezzi));
  const gia = clRegistrato(o, l, 'out');
  return righe.map(x => Object.assign({}, x, { gia: gia.get(x.item.id) || 0, residuo: Math.max(0, x.qty - (gia.get(x.item.id) || 0)) }));
}
function odlRigaDi(docId, lineId) {
  const o = getOdl(docId); if (!o) return null;
  const l = (o.lines || []).find(x => x.id === lineId);
  return l ? { o, l } : null;
}
function odlNuovoEvento(o, l, kind, extra) {
  return Store.insert('prodDecls', Object.assign({
    id: gid(), odpId: null, phaseId: null, odlId: o.id, odlLineId: l.id, kind,
    date: nowISO(), qty: 0, scrap: 0, note: '', motivo: '',
  }, extra || {}));
}
// I rientrati si muovono insieme su tutte le righe della tratta, e passano da
// registraRicevuto: nell'archivio condiviso sono una somma di eventi.
function odlSpostaRientrati(o, righe, delta) {
  righe.forEach(s => {
    const qty = Number(s.qty) || 0;
    registraRicevuto('workOrders', o, s, Math.min(qty, Math.max(0, (Number(s.received) || 0) + delta)));
  });
}

// ─── I mutatori ───
// `opz.materiali` [{ itemId, qty }]: senza, esce il residuo proposto.
function odlAvvia(docId, lineId, opz) {
  if (!odlGuard(docId, 'reception')) return false;
  const x = odlRigaDi(docId, lineId); if (!x) return false;
  const { o, l } = x;
  if (odlLegameAttivo(o, l)) { showToast('Questa lavorazione si avvia dall\'ordine di produzione', 'error'); return false; }
  const blocco = odlNonAvviabile(o);
  if (blocco) { showToast('Non si può avviare: ' + blocco, 'error'); return false; }
  const a = odlAncore(o, l);
  if (!a.apre) { showToast(`Questa lavorazione si avvia dalla riga della fase ${cyclePhaseNumber(clPhaseIndex(a.prima))}`, 'error'); return false; }
  if (odlRigaAvviata(o, l)) { showToast('La lavorazione è già avviata', 'error'); return false; }
  const opzioni = opz || {};
  const note = String(opzioni.note || '').trim();
  // L'id nasce dall'ordine e dalla riga, come l'avvio di una fase: due colleghi
  // che avviano la stessa riga prima di vedersi scrivono lo stesso avvio.
  const avvio = odlNuovoEvento(o, l, 'avvio', { id: idDaChiaveLibero(`odlavvio|${o.id}|${l.id}`, 'prodDecls'), note });
  const righe = opzioni.materiali || odlMaterialeProposto(o, l).map(m => ({ itemId: m.item.id, qty: m.residuo }));
  righe.forEach((r, i) => {
    const q = Number(r.qty) || 0;
    if (!(q > 0) || !a.outKind) return;
    const extra = { orderId: o.id, lineId: l.id, declId: avvio.id, supplierId: o.supplierId,
      id: idDaChiaveLibero(`odlavvio|${avvio.id}|${i}|${r.itemId}`, 'movements') };
    if (a.outKind === 'clStep') addMovement(r.itemId, 'clStep', q, note || `Pezzi al terzista per ${o.number}`, extra);
    else addMovement(r.itemId, 'clOut', -q, note || `Materiale per ${o.number}`, extra);
  });
  touch(o); saveDB();
  return true;
}
function odlDichiara(docId, lineId, dati) {
  if (!odlGuard(docId, 'reception')) return false;
  const x = odlRigaDi(docId, lineId); if (!x) return false;
  const { o, l } = x;
  if (odlLegameAttivo(o, l)) { showToast('I pezzi di questa lavorazione si dichiarano sull\'ordine di produzione', 'error'); return false; }
  const a = odlAncore(o, l);
  if (!a.chiude) { showToast(`Questa lavorazione si dichiara dalla riga della fase ${cyclePhaseNumber(clPhaseIndex(a.ultima))}`, 'error'); return false; }
  if (!odlRigaAvviata(o, l)) { showToast('La lavorazione non è stata avviata', 'error'); return false; }
  const d = dati || {};
  const qty = Math.max(0, Number(d.qty) || 0);
  const scrap = Math.max(0, Number(d.scrap) || 0);
  if (!(qty > 0) && !(scrap > 0)) { showToast('Niente da dichiarare: pezzi e scarti sono a zero', 'error'); return false; }
  const note = String(d.note || '').trim();
  const decl = odlNuovoEvento(o, l, 'avanzamento', { qty, scrap, note });
  if (qty > 0 && a.part && hasStock(a.part) && a.inKind) {
    const extra = { orderId: o.id, lineId: l.id, declId: decl.id };
    if (a.inKind === 'clStep') { extra.fromSupplierId = o.supplierId; addMovement(a.part.id, 'clStep', qty, note || `Pezzi dal terzista per ${o.number}`, extra); }
    else { extra.supplierId = o.supplierId; addMovement(a.part.id, 'clIn', qty, note || `Rientro da ${o.number}`, extra); }
  }
  odlSpostaRientrati(o, a.sorelle, qty + scrap);
  ordAutoStatus(o); touch(o); saveDB();
  return true;
}
// Un avvio si annulla finché la riga non ha rientri; un rientro sempre. Con
// l'evento se ne vanno **i suoi** movimenti, e i rientrati tornano indietro.
function odlEventoAnnullabile(o, d) {
  if (!o || !d || (d.kind !== 'avvio' && d.kind !== 'avanzamento')) return { ok: false, motivo: 'questo evento non si annulla' };
  const l = (o.lines || []).find(x => x.id === d.odlLineId);
  if (d.kind === 'avvio' && l && odlEventiRiga(o, odlAncore(o, l).ultima, { conVecchi: true }).some(x => x.kind === 'avanzamento')) {
    return { ok: false, motivo: 'la lavorazione ha già dei rientri: annulla prima quelli' };
  }
  return { ok: true };
}
function odlAnnullaEvento(declId) {
  const d = (db.prodDecls || []).find(x => x.id === declId); if (!d || !d.odlId) return false;
  if (!odlGuard(d.odlId, 'reception')) return false;
  const o = getOdl(d.odlId); if (!o) return false;
  const ok = odlEventoAnnullabile(o, d);
  if (!ok.ok) { showToast(`Non si può annullare: ${ok.motivo}`, 'error'); return false; }
  (db.movements || []).filter(m => m.declId === declId).forEach(m => Store.remove('movements', m.id));
  Store.remove('prodDecls', declId);
  const l = (o.lines || []).find(x => x.id === d.odlLineId);
  if (l && d.kind === 'avanzamento') odlSpostaRientrati(o, odlAncore(o, l).sorelle, -((Number(d.qty) || 0) + (Number(d.scrap) || 0)));
  ordAutoStatus(o); touch(o); saveDB();
  return true;
}
// «Dichiara tutto rientrato»: il residuo di ogni riga avviata, come pezzi
// buoni. Prima segnava i rientrati senza movimenti, e il codice non si
// caricava mai: era la strada che saltava il magazzino.
function odlMarkAllReceived(id) {
  if (!odlGuard(id, 'reception')) return false;
  const o = getOdl(id); if (!o) return false;
  let fatte = 0, daOdp = 0, ferme = 0;
  (o.lines || []).forEach(l => {
    if (odlLegameAttivo(o, l)) { daOdp++; return; }
    const a = odlAncore(o, l);
    if (!a.chiude) return;
    const resta = odlRigaResta(l);
    if (!(resta > 0.000001)) return;
    if (!odlRigaAvviata(o, l)) { ferme++; return; }
    if (odlDichiara(id, l.id, { qty: resta })) fatte++;
  });
  renderOdl();
  const avvisi = [];
  if (ferme) avvisi.push(`${ferme} ${ferme === 1 ? 'riga non è avviata' : 'righe non sono avviate'}`);
  if (daOdp) avvisi.push(`${daOdp} ${daOdp === 1 ? 'riga si dichiara' : 'righe si dichiarano'} sull'ordine di produzione`);
  if (avvisi.length) showToast(avvisi.join(' · '), 'error');
  return fatte > 0;
}

// ─── I comandi sotto la riga ───
function odlLink(azione, testo, titolo) {
  return `<span class="plandoc-link plandoc-link-sm" ${clickAttrs(azione, titolo)}>${esc(testo)}</span>`;
}
function odlLineActions(o, l) {
  const leg = odlLegameAttivo(o, l);
  if (leg) return odlAzioniDaOdp(o, l, leg);
  const a = odlAncore(o, l);
  const fase = x => 'fase ' + cyclePhaseNumber(clPhaseIndex(x));
  // Una riga in mezzo a una tratta di un ordine di prima non ha comandi: dice
  // dove sono, invece di sembrare un difetto.
  if (!a.apre && !a.chiude) {
    return `<div class="line-cl-actions"><span title="Le fasi della stessa tratta si avviano dalla prima riga e si dichiarano dall'ultima.">${ico('factory', 'tinted', '')} si avvia alla ${esc(fase(a.prima))}, si dichiara alla ${esc(fase(a.ultima))}</span></div>`;
  }
  const avviata = odlRigaAvviata(o, l);
  const cmd = [];
  if (!avviata) {
    if (a.apre) {
      const blocco = odlNonAvviabile(o);
      if (blocco) cmd.push(`<span class="empty-text" style="padding:0">${esc(blocco)}</span>`);
      else cmd.push(odlLink(`odlAvviaModal('${o.id}','${l.id}')`, 'avvia', a.libera ? 'Avvia la lavorazione: il magazzino non si muove'
        : a.outKind === 'clStep' ? 'Avvia la lavorazione e manda i pezzi al terzista: non tocca il magazzino'
          : 'Avvia la lavorazione e manda il materiale del ciclo al terzista: esce dal magazzino'));
    } else cmd.push(`<span class="empty-text" style="padding:0">si avvia alla ${esc(fase(a.prima))}</span>`);
  } else if (a.chiude && odlRigaResta(l) > 0.000001) {
    cmd.push(odlLink(`odlDichiaraModal('${o.id}','${l.id}')`, 'dichiara', a.libera ? 'Dichiara i pezzi tornati e gli scarti'
      : a.inKind === 'clStep' ? 'Dichiara i pezzi tornati e gli scarti: restano in lavorazione, il magazzino non si muove'
        : 'Dichiara i pezzi tornati e gli scarti: i buoni entrano a magazzino col codice della parte'));
  }
  if (!cmd.length) return '';
  // Dove il gesto non tocca il magazzino si dice perché: un comando che sembra
  // un carico e non carica fa perdere fiducia in una giacenza.
  const note = [];
  if (!a.libera) {
    if (a.apre && !a.chiude) note.push('si dichiara alla ' + fase(a.ultima));
    if (a.outKind === 'clStep' && a.inKind === 'clStep') note.push('passaggio di lavorazione: il magazzino non si muove');
    else if (!avviata && a.outKind === 'clStep') note.push('il materiale era gi&agrave; uscito');
    else if (avviata && a.inKind === 'clStep') note.push('il codice si carica alla fine del ciclo');
  }
  const nota = note.length ? ` <span class="empty-text" style="padding:0">· ${note.join(' · ')}</span>` : '';
  return `<div class="line-cl-actions">${ico('factory', 'tinted', '')}${cmd.join('')}${nota}</div>`;
}
// La riga di un ODP: gli stessi comandi, che aprono le schede delle sue fasi.
function odlAzioniDaOdp(o, l, leg) {
  const { odp, fasi } = leg;
  const prima = fasi[0];
  const rimando = `<span class="plandoc-link plandoc-link-sm" ${clickAttrs(`openOdpFromOdl('${odp.id}')`,
    'Apri l\'ordine di produzione: avvio e rientri di questa lavorazione sono suoi')}>${esc(odp.number)} › fase ${esc(fasi.map(f => f.seq).join('-'))}</span>`;
  const cmd = [];
  const stato = odpAvanzamentoTratta(odp, prima);
  if (odp.status === 'bozza') cmd.push('<span class="empty-text" style="padding:0">l\'ordine di produzione è in bozza: va lanciato</span>');
  else if (stato === 'fatto') cmd.push('<span class="empty-text" style="padding:0">rientrata</span>');
  else if (!opAvviata(odp, prima)) {
    const st = opStatoFase(odp, prima);
    if (st === 'avviabile') {
      cmd.push(odlLink(`odlAvviaModal('${o.id}','${l.id}')`, 'avvia', opEPrima(odp, prima)
        ? 'Avvia la fase sull\'ordine di produzione e manda il materiale del ciclo al terzista: esce dal magazzino'
        : 'Avvia la fase sull\'ordine di produzione. Il magazzino non si muove: i pezzi sono già fuori dallo scaffale'));
    } else {
      const blocco = opAvviabile(odp, prima);
      cmd.push(`<span class="empty-text" style="padding:0">${esc(blocco.motivo || 'non avviabile')}</span>`);
      if (blocco.fase) cmd.push(odlLink(`opForzaModal('${odp.id}','${prima.id}')`, 'forza avvio', 'Avvia comunque, dichiarando il motivo: resta scritto nello storico dell\'ordine di produzione'));
    }
  } else {
    const ultima = fasi[fasi.length - 1];
    cmd.push(odlLink(`odlDichiaraModal('${o.id}','${l.id}')`, 'dichiara', opEUltima(odp, ultima)
      ? 'Dichiara i pezzi tornati e gli scarti sull\'ordine di produzione: i buoni entrano a magazzino col codice della parte'
      : 'Dichiara i pezzi tornati e gli scarti sull\'ordine di produzione'));
  }
  return `<div class="line-cl-actions">${ico('factory', 'tinted', '')}${cmd.join('')} ${rimando}</div>`;
}

// ─── Le schede ───
function odlTestaModal(o, l, titolo) {
  return `<h3>${ico('factory', 'tinted pill', '')} ${esc(titolo)}</h3>
    <p>${esc(o.number)} · <strong>${esc(supplierName(o.supplierId) || '')}</strong> — ${esc(((l.code || '') + ' ' + (l.description || '')).trim())}, ${fmtQtyIt(Number(l.qty) || 0)} ${esc(l.uom || 'pz')}</p>`;
}
function odlAvviaModal(docId, lineId) {
  const x = odlRigaDi(docId, lineId); if (!x) return;
  const { o, l } = x;
  if (!roleGuardShop('docs')) return;
  const leg = odlLegameAttivo(o, l);
  if (leg) {
    if (opRilevaOdl(leg.odp)) { odpAutoStatus(leg.odp); touch(leg.odp); saveDB(); }
    if (opAvviata(leg.odp, leg.fasi[0])) { renderOdl(); return; }
    opAvviaModal(leg.odp.id, leg.fasi[0].id);
    return;
  }
  const a = odlAncore(o, l);
  const righe = odlMaterialeProposto(o, l);
  window.__odlAvviaMat = righe.map(m => m.item.id);
  window.__odlAvviaKind = a.outKind;
  const passo = a.outKind === 'clStep';
  const corpo = righe.map((m, i) => `<div class="mgmt-item">
      <span style="width:110px;font-family:var(--mono)">${esc(m.item.code || '')}</span>
      <span style="flex:1">${esc(m.item.name || '')}${passo ? '' : ` <span class="empty-text" style="padding:0">${fmtQtyIt(m.perPezzo)} ${esc(itemUom(m.item))}/pz · a magazzino ${fmtQtyIt(onHandOf(m.item.id))}</span>`}${m.gia ? ` <span class="rfq-clavoro-tag">già ${fmtQtyIt(+m.gia.toFixed(4))}</span>` : ''}</span>
      <input class="num" type="number" id="odl-a-q-${i}" min="0" step="any" value="${+m.residuo.toFixed(4)}" style="width:110px" oninput="odlAvviaAvviso()">
      <span class="empty-text" style="padding:0;width:40px">${esc(itemUom(m.item))}</span>
    </div>`).join('');
  const spiega = a.libera
    ? 'Questa riga non viene da un ciclo: l&rsquo;avvio dice che la lavorazione è partita, e il magazzino <strong>non si muove</strong>.'
    : passo
      ? 'È un <strong>passaggio di lavorazione</strong>: i pezzi tornati dalla fase precedente vanno al terzista e <strong>il magazzino non si muove</strong>. Il materiale era già uscito all&rsquo;inizio del ciclo.'
      : righe.length
        ? 'Il materiale del <strong>ciclo</strong>, per i pezzi della riga, <strong>esce dal magazzino</strong> e va dal terzista: il prospetto <em>presso terzi</em> dice da chi sta. Esce <strong>una volta sola</strong>, qui.'
        : 'Il ciclo di questa parte non ha materiale a magazzino, o è già uscito tutto: l&rsquo;avvio dice solo che la lavorazione è partita.';
  openModal(`${odlTestaModal(o, l, 'Avvia la lavorazione')}
    ${corpo ? `<h4 class="settings-group-title">${passo ? 'Pezzi che vanno al terzista' : 'Materiale che esce, dal ciclo della parte'}</h4>
      <div style="display:flex;flex-direction:column;gap:6px">${corpo}</div>
      ${passo ? '' : `<div id="odl-a-avviso">${avvisoSottoZeroHtml(righe.map(m => ({ itemId: m.item.id, qty: m.residuo })))}</div>`}` : ''}
    <p class="empty-text" style="text-align:left;padding:8px 0">${spiega}</p>
    <div class="modal-field"><label>Nota</label><input id="odl-a-note" placeholder="es. bolla 412" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="odlAvviaSave('${esc(docId)}','${esc(lineId)}')">Avvia</button>
    </div>`, !!corpo, 'form');
}
function odlAvviaRighe() { return (window.__odlAvviaMat || []).map((itemId, i) => ({ itemId, qty: rawNum('odl-a-q-' + i) })); }
function odlAvviaAvviso() { const el = document.getElementById('odl-a-avviso'); if (el) el.innerHTML = avvisoSottoZeroHtml(odlAvviaRighe()); }
function odlAvviaSave(docId, lineId) {
  const materiali = odlAvviaRighe();
  const sotto = window.__odlAvviaKind === 'clOut' ? avvisoSottoZero(materiali) : [];
  if (!odlAvvia(docId, lineId, { materiali, note: val('odl-a-note') })) return;
  closeModal(); renderOdl();
  if (sotto.length) showToast('Lavorazione avviata, ma l\'esistente va sotto zero: ' + sotto.join('; '), 'error');
  else showToast('Lavorazione avviata');
}
function odlDichiaraModal(docId, lineId) {
  const x = odlRigaDi(docId, lineId); if (!x) return;
  const { o, l } = x;
  if (!roleGuardShop('docs')) return;
  const leg = odlLegameAttivo(o, l);
  if (leg) {
    if (opRilevaOdl(leg.odp)) { odpAutoStatus(leg.odp); touch(leg.odp); saveDB(); }
    opDichiaraTrattaModal(leg.odp.id, leg.fasi[0].id);
    return;
  }
  const a = odlAncore(o, l);
  const resta = odlRigaResta(l);
  const spiega = a.libera
    ? 'I pezzi tornati portano l&rsquo;ordine a parziale o evaso. Il magazzino <strong>non si muove</strong>: la riga non viene da un ciclo.'
    : a.inKind === 'clStep'
      ? 'I pezzi tornano da noi fra due tratte: <strong>non entrano a magazzino</strong>. Il codice della parte si carica una volta sola, alla fine del ciclo.'
      : `I pezzi buoni <strong>entrano a magazzino</strong> col codice <strong>${esc((a.part && a.part.code) || l.code || '')}</strong>, ed è l&rsquo;unico punto in cui si carica. Gli scarti contano come tornati, ma non si caricano.`;
  openModal(`${odlTestaModal(o, l, 'Dichiara il rientro dal terzista')}
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Pezzi della riga: <strong>${fmtQtyIt(Number(l.qty) || 0)}</strong> · già tornati: <strong>${fmtQtyIt(Number(l.received) || 0)}</strong> · restano <strong>${fmtQtyIt(resta)}</strong>.</p>
    <div class="modal-grid">
      <div class="modal-field"><label>Pezzi buoni</label>
        <input class="num" type="number" id="odl-d-qty" min="0" step="any" value="${+resta.toFixed(4)}"></div>
      <div class="modal-field"><label>Scarti</label>
        <input class="num" type="number" id="odl-d-scrap" min="0" step="any" value="0"></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:8px 0">${spiega}</p>
    <div class="modal-field"><label>Nota</label><input id="odl-d-note" placeholder="es. bolla 412" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="odlDichiaraSave('${esc(docId)}','${esc(lineId)}')">Registra</button>
    </div>`, false, 'form');
}
function odlDichiaraSave(docId, lineId) {
  if (!odlDichiara(docId, lineId, { qty: rawNum('odl-d-qty'), scrap: rawNum('odl-d-scrap'), note: val('odl-d-note') })) return;
  closeModal(); renderOdl(); showToast('Rientro registrato');
}
function odlAnnullaEventoAsk(declId) {
  const d = (db.prodDecls || []).find(x => x.id === declId); if (!d) return;
  const domanda = d.kind === 'avvio'
    ? 'Annullare l\'avvio di questa lavorazione?\nIl materiale uscito con lui torna a magazzino, e la riga torna da avviare.'
    : `Annullare questo rientro di ${fmtQtyIt((Number(d.qty) || 0) + (Number(d.scrap) || 0))} pezzi?\nI movimenti di magazzino che ha generato vengono tolti con lui.`;
  askConfirm(domanda, () => {
    if (!odlAnnullaEvento(declId)) return;
    renderOdl(); showToast('Annullato');
  }, { title: 'Annulla', ok: 'Annulla l\'evento' });
}
// Lo storico degli avvii e dei rientri dell'ordine, come quello dell'ODP: è il
// posto dove si annulla un gesto sbagliato.
function odlDeclBlock(o) {
  const decls = (db.prodDecls || []).filter(d => d.odlId === o.id)
    .slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  if (!decls.length) return '';
  const riga = id => { const l = (o.lines || []).find(x => x.id === id); return l ? ((l.code || '') + ' ' + (l.description || '')).trim() : '—'; };
  return `<div class="mrp-section">
    <div class="cycle-section-head"><h3>${ico('clock', 'tinted pill', '')} Avvii e rientri</h3></div>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col" style="width:150px">Quando</th><th scope="col">Lavorazione</th><th scope="col" style="width:100px">Cosa</th>
        <th scope="col" style="width:80px">Pezzi</th><th scope="col" style="width:80px">Scarti</th><th scope="col">Nota</th>
        <th scope="col" style="width:60px"></th></tr></thead>
      <tbody>${decls.map(d => `<tr>
        <td>${esc(String(d.date || '').slice(0, 16).replace('T', ' '))}</td>
        <td>${esc(riga(d.odlLineId))}</td>
        <td>${esc(ODL_EV_ETICHETTA[d.kind] || d.kind)}</td>
        <td class="num">${d.qty ? fmtQtyIt(d.qty) : '—'}</td>
        <td class="num">${d.scrap ? fmtQtyIt(d.scrap) : '—'}</td>
        <td>${esc(d.note || '')}</td>
        <td>${odlEventoAnnullabile(o, d).ok
    ? `<button class="mini-btn danger lock-reception" onclick="odlAnnullaEventoAsk('${d.id}')" title="${d.kind === 'avvio'
      ? "Annulla l'avvio e rimette a magazzino il materiale uscito con lui" : 'Annulla questo rientro e i movimenti che ha generato'}">${ico('trash', 'tinted', 'Annulla')}</button>`
    : ''}</td></tr>`).join('')}</tbody>
    </table></div></div>`;
}

// ─── Una lavorazione scritta a mano, partendo dal ciclo ───
// Fin qui un ordine di lavoro nasceva solo da un piano: l'unico modo di
// riempirne uno vuoto era la riga manuale, testo libero senza `phaseKey` — e
// quindi senza tariffa dal ciclo e senza nessuno dei comandi del conto lavoro.
// Ma commissionare una lavorazione fuori piano è il caso normale: un pezzo
// urgente, un ripasso, una prova.
//
// Si parte dal **ciclo**, non da un campo vuoto: si sceglie la parte, si sceglie
// la tratta, si dicono i pezzi. La riga che ne esce è **identica** a quella
// generata dal fabbisogno — stessa fabbrica, `planPhaseDocLine` — perché una
// riga scritta a mano che si comportasse diversamente sarebbe una seconda
// specie di riga da ricordarsi.
function odlAddPhaseModal(id) {
  if (!odlGuard(id, 'contract')) return;
  catalogPickerModal(ids => odlPhasePickModal(id, ids), {
    titolo: '+ Lavorazione da ciclo',
    // Solo gli articoli che una lavorazione ce l'hanno: gli altri aprirebbero
    // una scheda vuota, e scoprirlo dopo averli scelti è il modo peggiore.
    filtro: i => (i.cycle || []).some(r => r.kind === 'op'),
    vuoto: 'Nessun articolo ha un ciclo di lavorazione. Le fasi si scrivono nella scheda dell’articolo, sotto <em>Ciclo</em>.',
  });
}
// La scelta della tratta. Si vedono **tutte** — anche quelle di un altro
// terzista e quelle interne — marcate per quello che sono: mandare fuori una
// lavorazione che di solito si fa in casa è un caso vero, e l'app lo segnala
// invece di impedirlo.
function odlPhasePickModal(id, ids) {
  const o = getOdl(id); if (!o) return;
  const parti = (ids || []).map(getItem).filter(it => it && (it.cycle || []).some(r => r.kind === 'op'));
  if (!parti.length) { showToast('Nessun articolo con un ciclo di lavorazione', 'error'); return; }
  const blocchi = parti.map((it, pi) => {
    const righe = clCycleRuns(it).map(t => {
      const suo = t.supplierId === o.supplierId;
      const tag = t.esterna
        ? (suo ? '' : `<span class="rfq-manual-tag" title="Il ciclo assegna questa lavorazione a un altro terzista">${esc(supplierName(t.supplierId) || 'altro terzista')}</span>`)
        : '<span class="rfq-manual-tag" title="Il ciclo la fa in casa: mettendola qui la si manda fuori questa volta">interna</span>';
      const nos = [];
      for (let k = t.from; k <= t.to; k++) nos.push(cyclePhaseNumber(k));
      const nomi = odlRunNomi(it, t);
      return `<label class="rfq-pick-row">
        <input type="checkbox" class="odl-fase" value="${esc(it.id)}#${t.from}" ${suo ? 'checked' : ''}>
        <span class="cycle-phase">${esc(nos.join('-'))}</span> ${esc(nomi)} ${tag}</label>`;
    }).join('');
    return `<h4 class="settings-group-title">${esc(it.code || '')} ${esc(it.name || '')}</h4>
      <div class="rfq-pick-list">${righe}</div>
      <div class="modal-field"><label>${labelUom('Pezzi da lavorare', itemUom(it))}</label>
        <input type="number" id="odl-pz-${pi}" min="0" step="any" value="1"></div>`;
  }).join('');
  window.__odlFasiParti = parti.map(x => x.id);
  openModal(`<h3>${ico('wrench', 'tinted pill', '')} Lavorazioni da mettere in ${esc(o.number)}</h3>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Le fasi <strong>consecutive dello stesso terzista</strong> stanno in una riga sola: è una lavorazione da commissionare, non due. Tariffa e giorni vengono dal ciclo, e si possono correggere sulla riga.</p>
    ${blocchi}
    <div class="modal-field"><label>Data di consegna richiesta</label><input type="date" id="odl-fase-due" value=""></div>
    <p class="empty-text" style="text-align:left;padding:8px 0">Questo ordine <strong>non è legato a un piano</strong>: se la stessa fase sta anche in un fabbisogno, lì continuerà a risultare da ordinare. Il legame col piano lo dà la generazione dal fabbisogno, non questa scheda.</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="odlAddPhases('${esc(id)}')">Aggiungi</button>
    </div>`, true, 'form');
}
// I centri di lavoro toccati da una tratta, nell'ordine del ciclo.
function odlRunNomi(it, t) {
  const nomi = [];
  let k = 0;
  (it.cycle || []).forEach(r => {
    if (r.kind !== 'op') return;
    const i = k++;
    if (i < t.from || i > t.to) return;
    const wc = getWorkCenter(r.workCenterId);
    nomi.push(wc ? wc.name : '(centro mancante)');
  });
  return Array.from(new Set(nomi)).join(' + ');
}
// Le righe che nascono da una scelta di tratte. Sta fuori dal gesto perché
// **la decisione è qui** e il gesto è solo il modo di esprimerla: così si può
// verificare che una riga scritta a mano abbia la stessa forma di una generata,
// senza passare da caselle e pulsanti.
function odlPhaseLines(scelte, pezziDi, due) {
  const out = [];
  (scelte || []).forEach(chiave => {
    const itemId = String(chiave).split('#')[0];
    const from = Number(String(chiave).split('#')[1]) || 0;
    const it = getItem(itemId); if (!it) return;
    const pezzi = Number(pezziDi(itemId)) || 0;
    if (!(pezzi > 0)) return;                  // zero pezzi non è una lavorazione
    const t = clCycleRuns(it).find(x => x.from === from); if (!t) return;
    const r = clRunRow(it, t, pezzi, due || '');
    if (!r) return;
    out.push(planOdlLine(r));
  });
  return out;
}
function odlAddPhases(id) {
  if (!odlGuard(id, 'contract')) return;
  const o = getOdl(id); if (!o) return;
  const scelte = Array.from(document.querySelectorAll('.odl-fase'))
    .filter(cb => cb.checked).map(cb => cb.value);
  if (!scelte.length) { showToast('Nessuna lavorazione selezionata', 'error'); return; }
  const parti = window.__odlFasiParti || [];
  const righe = odlPhaseLines(scelte, itemId => rawNum('odl-pz-' + parti.indexOf(itemId)), val('odl-fase-due'));
  if (!righe.length) { showToast('Niente da aggiungere: i pezzi devono essere maggiori di zero', 'error'); return; }
  righe.forEach(l => o.lines.push(l));
  touch(o); odlMarkDirty(); closeModal(); renderOdl();
  showToast(righe.length === 1 ? 'Lavorazione aggiunta' : righe.length + ' lavorazioni aggiunte');
}

function renderOdlEdit(id) {
  const o = getOdl(id); if (!o) { odlView = 'list'; return ''; }
  const lines = (o.lines || []).map((l, i) => {
    const qty = Number(l.qty) || 0, price = (l.price === '' || l.price == null) ? null : Number(l.price);
    const amount = price != null ? importoRiga(l) : null;
    const rec = Number(l.received) || 0, residual = qty - rec;
    // Avvia e dichiara stanno sotto la riga che li giustifica: terzista e
    // ordine sono già decisi, resta da dire cosa esce e cosa torna.
    const cl = odlLineActions(o, l);
    return `<tr>
      ${cell2(i + 1, '', 'ln-idx')}
      ${cell2(`<span class="ln-code">${esc(l.code || '')}</span>`,
    `${esc(l.description)}${docLineNoteSub(l)}${cl}`)}
      ${cell2(`<input type="number" class="rfq-qty-input lock-contract" value="${l.qty}" min="0" step="any" title="Pezzi da lavorare" onchange="odlSetLine('${id}','${l.id}','qty',this.value)">`,
    esc(l.uom || ''))}
      ${cell2(`<input type="number" class="rfq-price-input lock-contract" value="${price != null ? price : ''}" min="0" step="any" placeholder="—" title="Tariffa per pezzo" onchange="odlSetLine('${id}','${l.id}','price',this.value)">`,
    `<span class="ln-amount">${amount != null ? fmtN(amount) : '—'}</span>`)}
      ${cell2(`<input type="date" class="rfq-date-input lock-contract" value="${esc(l.startDate || '')}" title="Inizio lavoro: il giorno in cui consegniamo il materiale al terzista" onchange="odlSetLine('${id}','${l.id}','startDate',this.value)">`,
    `<span class="empty-text" style="padding:0" title="Da inviare finché il materiale non parte; in lavorazione quando è uscito; rientrata quando i pezzi sono tornati">${esc(ODL_AVANZAMENTO[odlAvanzamentoRiga(o, l)])}</span>`)}
      ${cell2(`<input type="date" class="rfq-date-input lock-contract" value="${esc(l.deliveryDate || '')}" title="Data che abbiamo chiesto" onchange="odlSetLine('${id}','${l.id}','deliveryDate',this.value)">`,
    `<input type="date" class="rfq-date-input lock-reception" value="${esc(l.confirmedDate || '')}" title="Data che il terzista ha confermato" onchange="odlSetLine('${id}','${l.id}','confirmedDate',this.value)">${ordLineDelayHtml(l)}`)}
      ${cell2(`<input type="number" class="rfq-qty-input lock-reception" value="${rec}" min="0" step="any" disabled title="${odlLegameAttivo(o, l) ? 'I pezzi rientrati li dichiara l&rsquo;ordine di produzione: qui si leggono, non si scrivono.' : 'Pezzi tornati dal terzista, buoni e scarti: si scrivono con «dichiara», che muove anche il magazzino.'}">`,
    `<span class="ln-residual ${residual > 0 ? 'pos' : ''}" title="Pezzi ancora dal terzista">${fmtQtyIt(residual)}</span>`)}
      ${docLineActionsCell('odl', id, l)}
    </tr>`;
  }).join('') || `<tr><td colspan="8" class="empty-text">Nessuna lavorazione. Un ordine di lavoro si genera dal <strong>Fabbisogno</strong>, oppure si scrive qui con <em>+ Lavorazione da ciclo</em>: si sceglie la parte, le fasi da mandare fuori e i pezzi.</td></tr>`;
  const total = odlTotal(o);
  const ritardo = orderWorstDelay(o);
  const lockBanner = docLockBanner(odlMode(o), 'Ordine di lavoro ' + (ORDER_STATUS[o.status] || o.status).toLowerCase(), 'odl', id);
  return `<div class="manage-wrap">
    ${docToolbarHtml({ chiudi: 'odlBackToList()', cosa: "l'ordine di lavoro", rec: o, stati: ORDER_STATUS, dirty: odlDirty,
      saveId: 'odl-save-btn', salva: `odlSave('${id}')`, menu: [{ label: "Elimina l'ordine di lavoro", icon: 'trash', onclick: `delOdl('${id}')`, danger: true }] })}
    ${docStepperHtml('odl', o)}${docLinksHtml('odl', o)}
    ${docCoWarnHtml()}${odlOdpRef(o)}${lockBanner}${stampLine(o)}
    ${docTestaHtml({ pfx: 'odl', rec: o, stati: ORDER_STATUS, controparte: 'Terzista', data: 'Data ordine', conferma: 'N° conferma del terzista', note: 'Note' })}
    ${ritardo != null ? `<div class="rfq-warn">${ico('clock', 'tinted', '')} Il terzista ha confermato con <strong>${supplierDaysText(ritardo)}</strong> di ritardo sulla data richiesta.</div>` : ''}
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Ogni lavorazione si <strong>avvia</strong> quando il materiale parte e si <strong>dichiara</strong> quando i pezzi tornano, buoni e scarti: come sull'ordine di produzione. Il magazzino si muove ai due estremi del <strong>ciclo</strong> — il materiale esce all'avvio della prima tratta, il codice della parte si carica al rientro dell'ultima — e in mezzo i pezzi passano e basta. Se la lavorazione viene da un <strong>ordine di produzione</strong>, avvia e dichiara scrivono sulle sue fasi: il gesto è uno, in qualunque dei due documenti lo si faccia.</p>
    <h3 class="rfq-subhead">Lavorazioni
      <span class="rfq-head-actions">
        <button class="add-btn-sm lock-contract" onclick="odlAddPhaseModal('${id}')" title="Scegli una parte col suo ciclo e le fasi da commissionare">+ Lavorazione da ciclo</button>
        <button class="btn-outline lock-contract" onclick="odlAddManualLineModal('${id}')">+ Riga manuale</button>
        <button class="btn-outline lock-reception" onclick="odlMarkAllReceived('${id}')" title="Dichiara come pezzi buoni il residuo di ogni lavorazione avviata">✓ Dichiara tutto rientrato</button>
      </span></h3>
    <div class="table-wrap"><table class="rfq-table rfq-table-2">
      <thead><tr>
        <th scope="col" class="ln-idx">#</th>
        ${th2('Parte', 'Lavorazione')}
        ${th2('Pezzi', 'U.M.')}
        ${th2(`Tariffa (${esc(cur())}/pz)`, `Importo (${esc(cur())})`, 'Quanto costa lavorare un pezzo; sotto, quanto fa per i pezzi di riga')}
        ${th2('Inizio lavoro', 'Stato', 'Sopra il giorno in cui consegniamo il materiale al terzista, sotto a che punto è la lavorazione')}
        ${th2('Richiesta', 'Confermata', 'Sopra la data che abbiamo chiesto, sotto quella che il terzista ha confermato')}
        ${th2('Rientrati', 'Ancora fuori', 'Sopra quanti pezzi sono tornati, sotto quanti restano dal terzista')}
        <th scope="col"></th></tr></thead>
      <tbody>${lines}</tbody>
      <tfoot><tr class="rfq-cmp-total"><td colspan="3" style="text-align:right">Totale imponibile</td><td>${fmtN(total)}</td><td colspan="4"></td></tr></tfoot>
    </table></div>
    ${odlDeclBlock(o)}
    ${docExportBarHtml({ etichetta: "Documento d'ordine di lavoro:", cls: 'odl-export-btn', pdf: `exportOdlPDF('${id}')`, xls: `exportOdlExcel('${id}')`, dirty: odlDirty, cosa: "l'ordine di lavoro", kind: 'workOrder', rec: o })}
  </div>`;
}

// ─── Documento dell'ordine di lavoro ───
// Bilingue come l'ordine d'acquisto, e con le colonne che servono a un
// terzista: la parte, la lavorazione, i pezzi. Nessuna colonna «codice presso
// il fornitore»: una lavorazione non ha un codice a catalogo di nessuno.
function exportOdlPDF(id, modo) {
  const o = getOdl(id); if (!o) return;
  if (!(o.lines || []).length) { showToast('Nessuna riga da esportare', 'error'); return; }
  const jsPDF = requirePdf(); if (!jsPDF) return;
  const doc = new jsPDF({ orientation: 'landscape' });
  // Come sull'ordine d'acquisto: il QR apre la scheda rapida dell'ODL.
  if (o.number) qrPdfDraw(doc, qrLink('odl', o.number), doc.internal.pageSize.getWidth() - 14 - 22, 5, 22);
  const startY = docPdfTesta(doc, { titolo: 'Ordine di lavoro / Subcontract Order', rec: o,
    chi: 'COMMITTENTE / PRINCIPAL', controparte: 'TERZISTA / SUBCONTRACTOR', vuota: '(terzista non selezionato / not selected)' });
  const head = ['#', 'Parte\nPart', 'Lavorazione\nOperation', 'Pezzi\nQty', 'Tariffa\nUnit rate', 'Importo\nAmount',
    'Inizio lavoro\nWork start', 'Data consegna\nDelivery date'];
  const body = (o.lines || []).map((l, i) => {
    const qty = Number(l.qty) || 0, price = (l.price === '' || l.price == null) ? null : Number(l.price);
    return [i + 1, l.code || '', lineDescDoc(l), (fmtQtyIt(qty) + ' ' + (l.uom || '')).trim(),
      price != null ? fmtPrezzo(price) + (l.uom ? '/' + l.uom : '') : '',
      price != null ? fmtN(importoRiga(l)) : '', fmtDateIt(l.startDate), fmtDateIt(l.deliveryDate)];
  });
  const totLabel = { content: 'Totale / Total', styles: { halign: 'right', fontStyle: 'bold' } };
  const totVal = { content: fmtN(odlTotal(o)), styles: { fontStyle: 'bold' } };
  doc.autoTable({ startY, head: [head], body, foot: [['', '', '', '', totLabel, totVal, '', '']],
    styles: { fontSize: 8 }, headStyles: { fillColor: [46, 164, 121] }, footStyles: { fillColor: [235, 242, 238], textColor: 20 } });
  doc.setTextColor(80); doc.setFontSize(9);
  // Solo o.notes: le note interne (notesInternal) non escono mai sul documento.
  docCoda(doc, [
    { etichetta: 'Trasporto / Shipping', testo: o.transport },
    { etichetta: 'Pagamento / Payment', testo: o.payment },
    { etichetta: 'Conferma terzista / Order confirmation', testo: o.supplierConfirmation },
    { etichetta: 'Note / Notes', testo: o.notes },
  ], doc.lastAutoTable.finalY + 8);
  return docPdfEmetti('workOrder', o, doc, { ripiego: 'ordine', modo, stato: 'inviato', rerender: renderOdl,
    domanda: `PDF generato.\nSegnare l'ordine di lavoro ${o.number} come inviato?` });
}
function exportOdlExcel(id) {
  const o = getOdl(id); if (!o) return;
  if (!(o.lines || []).length) { showToast('Nessuna riga da esportare', 'error'); return; }
  const data = docXlsTesta({ titolo: 'Ordine di lavoro / Subcontract Order', rec: o, chi: 'COMMITTENTE', controparte: 'TERZISTA', voci: [
    ['Da richiesta', o.rfqId && getRfq(o.rfqId) ? getRfq(o.rfqId).number : ''],
    ['Trasporto / Shipping', o.transport], ['Pagamento / Payment', o.payment],
    ['Conferma terzista / Order confirmation', o.supplierConfirmation]] });
  data.push(['#', 'Parte', 'Lavorazione', 'Pezzi', 'U.M.', `Tariffa (${cur()}/pz)`, `Importo (${cur()})`, 'Inizio lavoro', 'Consegna', 'Rientrati', 'Ancora fuori', 'Nota']);
  (o.lines || []).forEach((l, i) => {
    const qty = Number(l.qty) || 0, price = (l.price === '' || l.price == null) ? '' : Number(l.price);
    const amount = price === '' ? '' : importoRiga(l);
    const rec = Number(l.received) || 0;
    data.push([i + 1, l.code || '', l.description, qty, l.uom || '', price, amount, fmtDateIt(l.startDate), fmtDateIt(l.deliveryDate), rec, qty - rec, l.note || '']);
  });
  data.push([]);
  data.push(['', 'TOTALE IMPONIBILE / TOTAL', odlTotal(o)]);
  if (!docXlsSalva(data, o, 'Ordine di lavoro', 'ordine')) return;
  askMarkSent(o, `Excel generato.\nSegnare l'ordine di lavoro ${o.number} come inviato?`, 'inviato', renderOdl);
}

function delOrder(id) {
  docDel('order', id, () => {
    if (currentOrderId === id) { currentOrderId = null; orderView = 'list'; }
  }, o => {
    // Un ordine con merce già arrivata non si cancella per sbaglio: il numero
    // dei ricevuti è la ragione per cui vale la pena fermarsi a rileggere.
    const rec = orderReception(o);
    return rec.received ? ` con ${fmtQtyIt(rec.received)} già ricevuti` : '';
  });
}
