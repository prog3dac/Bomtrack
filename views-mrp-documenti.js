// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-mrp-documenti.js
// ═══════════════════════════════════════════════════════════
// Dal fabbisogno ai documenti: le richieste di offerta, gli ordini a fornitore,
// gli ordini di lavoro e di produzione che nascono da un piano.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
// Diviso da views-mrp.js nella 0.141.0: stesso ordine di caricamento, subito dopo.

// ═══════════════════════════════════════════════════════════
//  DAL FABBISOGNO AI DOCUMENTI (richieste di offerta e ordini)
// ═══════════════════════════════════════════════════════════
// Il piano sa già cosa comprare e da chi: fin qui finiva in un export e la
// stessa lista si riscriveva a mano nei documenti. Qui il giro si chiude — un
// documento per fornitore, con le righe scelte. Nulla parte da solo: la modale
// è il momento in cui si guarda cosa manca (fornitori, prezzi, minimi d'ordine)
// prima di mandare qualcosa fuori.
const PLAN_DOC_KINDS = { rfq: 'Richieste di offerta', order: 'Ordini a fornitore', odl: 'Ordini di lavoro', odp: 'Ordini di produzione' };
// Che cosa può finire in un documento **di quel tipo**. È la regola che tiene
// separati i due ordini: un ordine d'acquisto compra merce, un ordine di lavoro
// manda pezzi a lavorare, e nessuno dei due contiene le righe dell'altro. La
// richiesta d'offerta li tiene invece insieme, e non è un'incoerenza: chiedere
// a un terzista quanto costa il materiale **e** quanto costa lavorarlo è una
// domanda sola, ed è il documento che la fa.
//
// Le **parti da fabbricare** entrano solo negli ordini di produzione: non si
// comprano da nessuno, e una richiesta d'offerta su una parte che si produce in
// casa è una domanda che non si fa.
const PLAN_DOC_FILTER = {
  rfq: r => !r.isMake,
  order: r => !r.isPhase && !r.isMake,
  odl: r => !!r.isPhase,
  odp: r => !!r.isMake,
};

// ─── Cosa è già stato messo in un documento di questo piano ───
// Generare due volte lo stesso ordine dallo stesso fabbisogno è l'errore facile:
// si sceglie un fornitore, si genera, si torna indietro per il fornitore
// successivo e le righe di prima sono ancora lì, spuntate, identiche. Il doppio
// ordine si scopre alla consegna.
//
// Il conto si fa **leggendo i documenti**, non segnando gli articoli: nessun
// campo nuovo, nessuna divergenza possibile. Se un documento viene eliminato o
// annullato le sue righe tornano disponibili da sole, ed è giusto così —
// quell'ordine non esiste più.
//
// Il blocco è **per tipo di documento**, e la distinzione non è un dettaglio:
// chiedere un'offerta e poi ordinare è il flusso normale, quello che l'app
// accompagna dalla 0.21.0. Bloccare l'ordine perché esiste già una richiesta
// significherebbe rendere impossibile proprio il percorso che si vuole
// incoraggiare. Si impedisce di rifare *lo stesso tipo* di documento; l'altro
// resta consentito, e l'articolo mostra comunque dove è già finito.
//
// ─── Come si riconosce una fase di conto lavoro già documentata ───
// La riga di documento di una fase ha `itemId` **nullo** — deve averlo, è la
// garanzia contro il doppio conteggio di magazzino (vedi planPhaseDocLine) — e
// quindi qui non si trova per id articolo. Porta invece una `phaseKey`,
// congelata alla generazione come già lo sono `code` e `description`: la riga di
// documento è una fotografia, e questa la rende una fotografia della fase.
//
// **Come può sbagliare**: chi riordina le fasi del ciclo dopo aver generato il
// documento cambia l'indice, la chiave non corrisponde più e la fase viene
// **riproposta**. È un falso negativo, e si vede — il documento è lì nell'elenco
// di quelli generati dal piano. L'alternativa (ricalcolare la chiave a ogni
// lettura) sbaglierebbe nell'altro verso: bloccherebbe la fase *sbagliata*, e
// quello non si vedrebbe. Fra i due modi di sbagliare, si è scelto quello
// visibile.
function planDocumentedKeys(planId) {
  const map = new Map();
  const aggiungi = (d, kind) => (d.lines || []).forEach(l => {
    // Una riga di lavorazione copre una **tratta**, cioè può valere per più
    // fasi: `phaseKeys` le elenca tutte. Indicizzando solo la prima, le altre
    // risulterebbero ancora da documentare e il fabbisogno le riproporrebbe —
    // in un ordine di lavoro che le contiene già.
    const chiavi = l.itemId ? [l.itemId] : clPhaseKeys(l);
    if (!chiavi.length) return;                  // riga manuale: non viene dal fabbisogno
    chiavi.forEach(k => {
      const l2 = map.get(k) || [];
      l2.push({ kind, number: d.number, id: d.id, lineId: l.id, qty: Number(l.qty) || 0, uom: l.uom || '' });
      map.set(k, l2);
    });
  });
  (db.rfqs || []).filter(r => r.planId === planId).forEach(d => aggiungi(d, 'rfq'));
  // Un ordine annullato non è un ordine: le sue righe tornano da comprare.
  (db.orders || []).filter(o => o.planId === planId && o.status !== 'annullato').forEach(d => aggiungi(d, 'order'));
  (db.workOrders || []).filter(o => o.planId === planId && o.status !== 'annullato').forEach(d => aggiungi(d, 'odl'));
  // Un ordine di produzione copre **due** cose: la parte che fabbrica, e ognuna
  // delle sue fasi esterne — l'ordine di lavoro per quelle si genera da lì, e
  // generarlo anche dal piano produrrebbe due documenti per la stessa
  // lavorazione. Le fasi si leggono dalle fasi **congelate** dell'ordine, non
  // dal ciclo vivo: è l'ordine ad aver promesso quelle, non il ciclo di oggi.
  (db.prodOrders || []).filter(o => o.planId === planId && o.status !== 'annullato').forEach(d => {
    const ref = { kind: 'odp', number: d.number, id: d.id, qty: Number(d.qty) || 0, uom: d.uom || '' };
    const push = (k, r) => { const l = map.get(k) || []; l.push(r); map.set(k, l); };
    push('make#' + d.itemId, ref);
    (d.phases || []).filter(f => f.supplierId && f.phaseKey).forEach(f =>
      push(f.phaseKey, Object.assign({ faseId: f.id, seq: f.seq }, ref)));
  });
  return map;
}
// Se una riga è già coperta per il tipo di documento che si sta generando.
// L'eccezione: un ordine di produzione copre anche gli **ordini di lavoro**
// delle sue fasi, perché è da lui che si generano.
// Una parte da fabbricare fa eccezione (dalla 0.105.5): un suo ODP copre i
// pezzi che lancia, non la parte per sempre. Se ne mancano ancora — scarti,
// una chiusura corta, un fabbisogno cresciuto — la riga resta lanciabile per
// quelli, e `qtyOrder` li conta già al netto degli ODP (daLanciare).
function planBloccata(refs, kind, riga) {
  if (kind === 'odp' && riga && riga.isMake) return !(riga.qtyOrder > 0);
  return (refs || []).some(x => x.kind === kind)
    || (kind === 'odl' && (refs || []).some(x => x.kind === 'odp'));
}
function docRefLabel(ref) { return ({ rfq: 'richiesta ', order: 'ordine ', odl: 'ordine di lavoro ', odp: 'ordine di produzione ' }[ref.kind] || 'documento ') + ref.number; }

// La chiave con cui una riga di fabbisogno viaggia nella modale e nel documento:
// l'id articolo per un acquisto, la `phaseKey` per una fase. Non collidono mai —
// una chiave di fase contiene `#`, che in un UUID non compare.
// Il prefisso `make#` non è decorazione: senza, la chiave di una parte da
// fabbricare collide con quella della stessa parte comprata, e un ordine di
// produzione bloccherebbe un ordine d'acquisto (o viceversa) su un articolo che
// nei due casi è una cosa diversa.
function planRowKey(r) { return r.phaseKey || (r.isMake ? r.makeKey : r.item.id); }
// Righe del piano indicizzate per chiave: la modale lavora su spunte, e alla
// conferma deve poter ritrovare la riga da quella chiave. Acquisti e fasi
// stanno nella stessa mappa perché la modale ne ha una sola.
function planRowIndex(plan) {
  const map = new Map();
  const exp = mrpExplodePlan(plan);
  mrpRowsOf(exp.buy, plan.id).forEach(r => map.set(r.item.id, r));
  // Le fasi entrano come **tratte**: è la tratta che diventa una riga di
  // documento, e la chiave è quella della sua prima fase.
  //
  // **Al netto del prodotto**, come la tabella che le mostra: da qui
  // planCreateDocs() pesca le righe che scrive sul documento, e una quantità
  // diversa da quella spuntata un attimo prima manderebbe al terzista un ordine
  // per pezzi che sono già stati fatti.
  mrpPhaseRuns(mrpPhaseRowsNette(plan.id, exp.phases)).forEach(r => map.set(r.phaseKey, r));
  mrpDaProdurre(exp).map(e => mrpMakeRow(e, plan.id)).forEach(r => map.set(r.makeKey, r));
  return map;
}
// Il tipo di documento si sceglie **prima**, dal pulsante che si preme: sono
// due gesti diversi — «chiedo quanto costa» e «compro» — e metterli in un menu
// dentro la scheda li faceva sembrare la stessa cosa scelta due volte. Con la
// scelta già fatta, la scheda mostra da subito le righe giuste: quelle già
// finite in un documento *di quel tipo* risultano bloccate all'apertura, senza
// dover toccare un selettore per scoprirlo.
function planDocsModal(id, kind) {
  if (!roleGuard('docs')) return;
  const p = getPlan(id); if (!p) return;
  const k = PLAN_DOC_KINDS[kind] ? kind : 'rfq';
  // Le righe già coperte da magazzino e ordini non entrano nei documenti: sono
  // proprio quelle che il netto serve a non ricomprare.
  const gruppi = planDocGroups(planDocRows(p, k).filter(r => r.qtyOrder > 0), k);
  if (!gruppi.length) {
    showToast(mrpNet ? 'Niente da ordinare: esistente e in arrivo coprono tutto il piano' : 'Il piano non ha nulla da comprare', 'error');
    return;
  }
  window.__planDocsId = id;
  window.__planDocsKind = k;
  const titoloModale = { rfq: ico('mail', 'tinted pill', '') + ' Genera richieste di offerta',
    order: ico('receipt', 'tinted pill', '') + ' Genera ordini a fornitore',
    odl: ico('wrench', 'tinted pill', '') + ' Genera ordini di lavoro',
    odp: ico('factory', 'tinted pill', '') + ' Genera ordini di produzione' }[k];
  openModal(`<h3>${titoloModale} — ${esc(p.number)}</h3>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">${k === 'odp' ? 'Quantità <strong>lorde</strong> — il netto non si applica a una parte da fabbricare' : `Quantità <strong>${mrpNet ? 'nette' : 'lorde'}</strong>`}${mrpNet ? ' — tolti esistente e in arrivo, e tolto quello che i piani aperti più urgenti hanno già impegnato' : ' — l\'intero fabbisogno del piano'}. Si cambia col pulsante <em>Fabbisogno netto</em> nell\'elenco.</p>
    <p class="empty-text" style="text-align:left;padding:0 0 12px">${planDocsHint(k)}</p>
    <div id="plandoc-body">${planDocsBody(gruppi, id, k)}</div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="planCreateDocs()">${{ rfq: 'Genera richieste', order: 'Genera ordini', odl: 'Genera ordini di lavoro', odp: 'Genera ordini di produzione' }[k]}</button>
    </div>`, true, 'plandocs');
  planDocsCount();
}
// Un pulsante per tipo, col numero di righe ancora da documentare. Disabilitato
// quando non ne restano: un pulsante che si può premere e non fa niente è
// peggio di uno spento, perché costringe a scoprirlo aprendo.
function planDocButton(p, kind, label) {
  const n = planDocsAvailable(p, kind);
  const doc = { rfq: 'una richiesta', odl: 'un ordine di lavoro', odp: 'un ordine di produzione' }[kind] || 'un ordine';
  const titolo = n
    ? `${n} ${n === 1 ? 'riga ancora da mettere' : 'righe ancora da mettere'} in ${doc}`
    : `Tutte le righe di questo fabbisogno sono già in ${doc}`;
  const btn = `<button class="${kind === 'order' ? 'add-btn-sm' : 'btn-outline'}" onclick="planDocsModal('${p.id}','${kind}')"
    ${n ? '' : 'disabled'} title="${esc(titolo)}">${label}${n ? ` (${n})` : ''}</button>`;
  // Un pulsante disattivato non riceve il mouse, e il suo suggerimento non
  // compare: proprio dove serve dire *perché* non si può. Lo dice l'involucro.
  return n ? btn : `<span class="plan-gen-off" title="${esc(titolo)}">${btn}</span>`;
}
function planDocsHint(kind) {
  if (kind === 'odp') return 'Un ordine di produzione <strong>per parte</strong>: le fasi del ciclo si congelano dentro, in successione. Da lì si seguono i pezzi, si generano gli ordini di lavoro per le fasi esterne, e il magazzino si muove ai due estremi del ciclo. Il <strong>fabbisogno netto non si applica</strong>: lanciare un pezzo è una decisione di produzione, non di acquisto.';
  if (kind === 'rfq') return 'Le richieste nascono senza prezzo: è quello che si sta chiedendo. Quando l&rsquo;offerta arriva, i prezzi si registrano a listino dalla richiesta stessa. Una richiesta può contenere insieme materiale e lavorazioni dello stesso fornitore.';
  if (kind === 'odl') return 'Gli ordini di lavoro contengono <strong>solo lavorazioni</strong>: la tariffa è quella scritta nel ciclo. Il materiale dello stesso terzista si ordina a parte, con un ordine d&rsquo;acquisto.';
  return 'Gli ordini d&rsquo;acquisto contengono <strong>solo merce</strong>, col prezzo che il listino di quel fornitore dà oggi. Un articolo che il fornitore non ha a listino nasce senza prezzo: registralo a listino prima, o scrivilo dopo nell&rsquo;ordine. Le lavorazioni hanno un documento loro.';
}
// Quante righe restano da mettere in un documento di quel tipo. Sta sul
// pulsante: quanto lavoro resta si deve vedere prima di aprire la scheda, non
// dopo averla aperta e letta.
function planDocsAvailable(plan, kind) {
  const gia = planDocumentedKeys(plan.id);
  return planDocRows(plan, kind)
    .filter(r => r.qtyOrder > 0 && !planBloccata(gia.get(planRowKey(r)), kind, r)).length;
}
// Tutto ciò che da questo piano può diventare una riga di documento: gli
// acquisti prima, le fasi di conto lavoro dopo, filtrate per il tipo di
// documento che si sta generando (vedi PLAN_DOC_FILTER).
function planDocRows(plan, kind) {
  const f = PLAN_DOC_FILTER[kind] || PLAN_DOC_FILTER.rfq;
  return mrpBuyRows(plan, mrpNet)
    .concat(mrpPhaseRuns(mrpPhaseRows(plan)))
    .concat(mrpMakeRows(plan))
    .filter(f);
}
function planDocsBody(gruppi, planId, kind) {
  const gia = planDocumentedKeys(planId);
  // Già usato *per questo tipo* = non riselezionabile. Gli altri riferimenti si
  // mostrano lo stesso: sapere che di quell'articolo esiste già una richiesta è
  // utile anche mentre si prepara un ordine.
  const usati = r => planBloccata(gia.get(planRowKey(r)), kind, r)
    ? (gia.get(planRowKey(r)) || []).filter(x => x.kind === kind || (kind === 'odl' && x.kind === 'odp')) : [];
  const altri = r => (gia.get(planRowKey(r)) || []).filter(x => !usati(r).includes(x));
  // Quanto varrà davvero la riga sul documento. Senza listino applicabile la
  // riga nascerà vuota: qui resta la stima da costificazione, che è l'unica
  // cifra disponibile per decidere se conviene generare.
  // Una fase non ha un listino da consultare: il suo prezzo è la tariffa scritta
  // nel ciclo, e quello è già l'importo del documento.
  // Una parte da fabbricare non ha listino né fornitore: vale il suo costo
  // (dalla 0.105.6; prima la scheda degli ODP mostrava zero su ogni riga).
  const importoDoc = r => (r.isPhase || r.isMake || r.noDocPrice ? r.amount : r.amountDoc);

  const corpo = gruppi.map(g => {
    // La spunta porta la chiave del **gruppo**, non del fornitore: per gli
    // ordini di lavoro un terzista può averne due, e la seconda passata è un
    // documento a sé.
    const key = g.key != null ? g.key : (g.supplierId || '');
    const disponibili = g.rows.filter(r => !usati(r).length);
    const righe = g.rows.map(r => {
      const bloccata = usati(r);
      const seg = [];
      if (bloccata.length) {
        seg.push(`<span class="mrp-warn" title="Già inserito in ${esc(bloccata.map(docRefLabel).join(', '))}: per cambiarne la quantità si modifica quel documento">
          ${ico('lock', 'tinted', '')} già in ${esc(bloccata.map(x => x.number).join(', '))}</span>`);
      } else if (r.isMake) {
        const a = altri(r);
        if (kind === 'odp' && a.some(x => x.kind === 'odp')) seg.push(`<span class="price-best" title="Già lanciata in parte (${esc(a.filter(x => x.kind === 'odp').map(docRefLabel).join(', '))}): la quantità proposta è solo quella che manca">${ico('factory', 'tinted', '')} ${esc(a.filter(x => x.kind === 'odp').map(x => x.number).join(', '))}</span>`);
        else if (a.length) seg.push(`<span class="price-best" title="Esiste già ${esc(a.map(docRefLabel).join(', '))}, di tipo diverso: questa riga resta selezionabile">${ico('file', 'tinted', '')} ${esc(a.map(x => x.number).join(', '))}</span>`);
        // Una parte senza fasi non ha una successione da seguire: l'ordine che
        // ne uscirebbe è una scheda vuota, e va detto prima di generarlo.
        if (r.senzaCiclo) seg.push(`<span class="mrp-warn" title="Il ciclo di questa parte non ha lavorazioni: l'ordine di produzione nascerebbe senza fasi">${ico('warning', 'tinted', '')} senza ciclo</span>`);
        // Da dove vengono i pezzi in più: va detto, o un 50 al posto di 8 sembra un errore.
        if (r.scorta > 0) seg.push(`<span class="price-best" title="Lo scaffale è sotto la scorta minima della parte: questo è il piano più urgente che la fabbrica, e la riporta alla scorta">+${fmtUom(r.scorta, r.uom)} per la scorta minima</span>`);
        if (r.arrotondato) seg.push(`<span class="price-best" title="Arrotondato al lotto di riordino della parte, come sugli acquisti">${r.lotMode === 'min' ? 'lotto minimo' : 'lotto'} di ${fmtUom(r.lotSize, r.uom)}</span>`);
      } else if (r.isPhase) {
        // Una fase non ha magazzino: gli unici avvisi che la riguardano sono il
        // documento gemello già esistente e il prezzo a zero.
        const a = altri(r);
        if (a.length) seg.push(`<span class="price-best" title="Esiste già ${esc(a.map(docRefLabel).join(', '))}, di tipo diverso: questa riga resta selezionabile">${ico('file', 'tinted', '')} ${esc(a.map(x => x.number).join(', '))}</span>`);
        if (r.noPrice) seg.push('<span class="mrp-warn" title="La fase non ha una tariffa nel ciclo: la riga nascerà senza prezzo">' + ico('warning', 'tinted', '') + ' senza tariffa</span>');
      } else {
        const a = altri(r);
        if (a.length) seg.push(`<span class="price-best" title="Esiste già ${esc(a.map(docRefLabel).join(', '))}, di tipo diverso: questa riga resta selezionabile">${ico('file', 'tinted', '')} ${esc(a.map(x => x.number).join(', '))}</span>`);
        if ((r.bozze || []).length) seg.push(mrpBozzeBadge(r));
        if (r.underMin) seg.push(`<span class="mrp-warn" title="Quantità minima del fornitore: ${fmtUom(r.minQty, r.uom)}">${ico('warning', 'tinted', '')} sotto il minimo di ${fmtUom(r.minQty, r.uom)}</span>`);
        // Due assenze diverse, e la seconda è quella che manda fuori un ordine
        // sbagliato: l'articolo un prezzo ce l'ha, ma non da questo fornitore.
        if (r.noDocPrice) seg.push(`<span class="mrp-warn" title="${esc(supplierName(r.supplierId) || 'Questo fornitore')} non ha questo articolo a listino: la riga nascerà senza prezzo, da compilare a mano. Il prezzo di un altro fornitore non si applica.">${ico('warning', 'tinted', '')} non a listino</span>`);
        else if (r.noPrice) seg.push('<span class="mrp-warn" title="Senza prezzo la riga vale zero">' + ico('warning', 'tinted', '') + ' senza prezzo</span>');
        // Il listino applicabile non è quello con cui è stato costificato: il
        // documento seguirà il listino, e il totale qui sopra viene dal costo.
        else if (r.listinoDiverso) seg.push(`<span class="mrp-warn" title="Costificato a ${fmtPer(r.price, r.uom)}, ma ${esc(supplierName(r.supplierId) || 'il fornitore')} oggi quota ${fmtPer(r.docInGestione, r.uom)}. Sul documento va il listino.">${ico('refresh', 'tinted', '')} a listino ${fmtPer(r.priceDoc, r.uom)}</span>`);
      }
      // Questo pannello è l'anteprima del documento: l'importo è quello che il
      // documento porterà, cioè il listino applicabile. Senza una quotazione di
      // quel fornitore resta la stima da costificazione — e accanto c'è il
      // badge che dice che sul documento quella cifra non ci sarà.
      // Una fase si nomina per quello che è — la lavorazione, su quale parte —
      // e porta l'icona della chiave inglese: nella lista di un fornitore che
      // vende anche materiale, distinguerle a colpo d'occhio è ciò che evita di
      // ordinare due volte la stessa cosa con due nomi diversi.
      const etichetta = r.isPhase
        ? `<span class="cycle-phase">${esc((r.phaseNos || [r.phaseNo]).join('-'))}</span> ${ico('wrench', 'tinted', '')} ${esc(r.wcName)}
           <span style="opacity:.7">su ${codeLink(r.item.id, r.item.code)} ${esc(r.item.name)}</span>`
        : r.isMake
          ? `${ico('factory', 'tinted', '')} <span style="font-family:var(--mono)">${codeLink(r.item.id, r.item.code)}</span> ${esc(r.item.name)}
             <span style="opacity:.7">${r.senzaCiclo ? '' : esc(r.nFasi + (r.nFasi === 1 ? ' fase' : ' fasi') + (r.nEsterne ? ', ' + r.nEsterne + ' in conto lavoro' : ''))}</span>`
          : `<span style="font-family:var(--mono)">${codeLink(r.item.id, r.item.code)}</span> ${esc(r.item.name)}`;
      return `<label class="plandoc-row${bloccata.length ? ' plandoc-used' : ''}">
        <input type="checkbox" class="plandoc-line" data-sup="${esc(key)}" value="${esc(planRowKey(r))}"
          ${bloccata.length ? 'disabled' : (kind === 'order' && (r.bozze || []).length ? '' : 'checked')} onchange="planDocsCount()">
        ${etichetta}
        <span class="plandoc-qty">${fmtUom(r.qtyOrder, r.uom)}${!r.isPhase && mrpNet && r.qtyOrder !== r.qty ? ` <span style="opacity:.6">(lordo ${fmtUom(r.qty, r.uom)})</span>` : ''} · ${fmtN(importoDoc(r))}</span> ${seg.join(' ')}</label>`;
    }).join('');
    const totDisp = disponibili.reduce((s, r) => s + importoDoc(r), 0);
    return `<div class="plandoc-group">
      <label class="plandoc-head">
        <input type="checkbox" class="plandoc-sup" data-sup="${esc(key)}" ${disponibili.length ? 'checked' : 'disabled'} onchange="planDocsToggleGroup(this)">
        ${ico('factory', 'tinted', '')} <strong>${esc(g.name)}</strong>
        <span class="plandoc-qty">${disponibili.length ? `${disponibili.length} ${disponibili.length === 1 ? 'riga' : 'righe'} · ${fmtN(totDisp)}` : 'tutto già documentato'}${disponibili.length < g.rows.length ? ` <span style="opacity:.6">(${g.rows.length - disponibili.length} già ${{ rfq: 'in richiesta', odl: 'in ordine di lavoro', odp: 'in ordine di produzione' }[kind] || 'in ordine'})</span>` : ''}</span>
        ${g.supplierId ? '' : '<span class="mrp-warn" title="Nessun fornitore: il documento nasce da intestare">' + ico('warning', 'tinted', '') + ' da assegnare</span>'}
      </label>
      ${righe}</div>`;
  }).join('');
  const nDisp = gruppi.reduce((s, g) => s + g.rows.filter(r => !usati(r).length).length, 0);
  const avviso = nDisp ? '' : `<div class="rfq-warn">Tutte le righe di questo fabbisogno sono già finite in ${{ rfq: 'una richiesta', odl: 'un ordine di lavoro', odp: 'un ordine di produzione' }[kind] || 'un ordine'}. Per cambiare quantità o fornitore si modifica il documento, oppure lo si elimina e si rigenera.</div>`;
  return `${avviso}${corpo}<p class="empty-text" style="text-align:left;padding:8px 0 0" id="plandoc-count"></p>`;
}
// Spunta di gruppo: trascina le sue righe, ed è il modo rapido di escludere un
// fornitore intero senza toccare riga per riga.
function planDocsToggleGroup(cb) {
  // Le righe già documentate restano fuori: la spunta di gruppo è una comodità,
  // non un modo per aggirare il blocco.
  document.querySelectorAll(`.plandoc-line[data-sup="${cb.dataset.sup}"]`)
    .forEach(x => { if (!x.disabled) x.checked = cb.checked; });
  planDocsCount();
}
function planDocsCount() {
  const el = document.getElementById('plandoc-count'); if (!el) return;
  const sel = planDocsSelection();
  const n = Array.from(sel.values()).reduce((s, ids) => s + ids.length, 0);
  el.textContent = n
    ? `${sel.size} ${sel.size === 1 ? 'documento' : 'documenti'} · ${n} ${n === 1 ? 'riga' : 'righe'}`
    : 'Nessuna riga selezionata.';
}
// → Map<supplierId|'', [chiave]>, solo i gruppi con almeno una riga spuntata.
// La chiave è l'id articolo per un acquisto e la phaseKey per una fase: vedi
// planRowKey.
function planDocsSelection() {
  const sel = new Map();
  document.querySelectorAll('.plandoc-line').forEach(cb => {
    if (!cb.checked) return;
    const k = cb.dataset.sup || '';
    if (!sel.has(k)) sel.set(k, []);
    sel.get(k).push(cb.value);
  });
  return sel;
}
function planCreateDocs() {
  if (!roleGuard('docs')) return;
  const p = getPlan(window.__planDocsId); if (!p) return;
  // Il tipo l'ha deciso il pulsante che ha aperto la scheda, non un menu qui
  // dentro: qui si scelgono solo le righe.
  const kind = PLAN_DOC_KINDS[window.__planDocsKind] ? window.__planDocsKind : 'rfq';
  const sel = planDocsSelection();
  if (!sel.size) { showToast('Nessuna riga selezionata', 'error'); return; }
  const index = planRowIndex(p);
  // Seconda guardia, oltre alle spunte disabilitate: la selezione arriva dal
  // DOM, e ciò che decide se una riga può finire in un documento deve
  // stare accanto alla scrittura, non solo nell'interfaccia.
  const gia = planDocumentedKeys(p.id);
  const bloccato = chiave => planBloccata(gia.get(chiave), kind, index.get(chiave));
  const gruppi = [];
  let scartate = 0;
  sel.forEach((chiavi, chiaveGruppo) => {
    // La chiave del gruppo può portare la passata (ordini di lavoro): il
    // fornitore è la prima metà, e il resto ha già fatto il suo mestiere
    // separando i documenti.
    const supplierId = String(chiaveGruppo).split('#')[0];
    const ammesse = chiavi.filter(k => { if (bloccato(k)) { scartate++; return false; } return true; });
    const righe = ammesse.map(k => index.get(k)).filter(Boolean);
    if (righe.length) gruppi.push({ supplierId, righe });
  });
  if (!gruppi.length) {
    showToast(scartate ? 'Quelle righe sono già in un documento di questo tipo' : 'Nessun documento generato', 'error');
    return;
  }
  // Un ordine di produzione è **di una parte sola**: da un gruppo ne escono
  // tanti quante sono le righe, non uno solo con dentro tutto. È l'unica
  // differenza strutturale fra questo tipo e gli altri tre.
  const quanti = kind === 'odp' ? gruppi.reduce((n, g) => n + g.righe.length, 0) : gruppi.length;
  return conNumeri({ [PLAN_DOC_SERIE[kind]]: quanti }, () => planCreateDocsFatto(p, kind, gruppi));
}
const PLAN_DOC_SERIE = { rfq: 'RFQ', order: 'ODA', odl: 'ODL', odp: 'ODP' };
function planCreateDocsFatto(p, kind, gruppi) {
  // Con l'archivio condiviso fra la scelta e la creazione c'è un giro al
  // server (i numeri): un secondo clic, o un collega appena arrivato, può aver
  // già messo quelle righe in un documento. Si ricontrolla qui (0.105.5).
  const gia = planDocumentedKeys(p.id), indice = planRowIndex(p);
  gruppi = gruppi.map(g => ({ supplierId: g.supplierId, righe: g.righe
    .map(r => indice.get(planRowKey(r)))
    .filter(r => r && r.qtyOrder > 0 && !planBloccata(gia.get(planRowKey(r)), kind, r)) }))
    .filter(g => g.righe.length);
  if (!gruppi.length) { closeModal(); showToast('Quelle righe sono già in un documento di questo tipo', 'error'); renderMrp(); return; }
  const creati = [];
  gruppi.forEach(({ supplierId, righe }) => {
    if (kind === 'odp') { righe.forEach(r => creati.push(planNewOdp(p, r))); return; }
    creati.push(kind === 'rfq' ? planNewRfq(p, supplierId, righe)
      : (kind === 'odl' ? planNewOdl(p, supplierId, righe) : planNewOrder(p, supplierId, righe)));
  });
  saveDB(); closeModal();
  // Un documento solo: si apre. Più d'uno: si va all'elenco, non c'è una scelta
  // sensata su quale aprire per primo.
  const vista = { rfq: 'rfq', order: 'orders', odl: 'odl', odp: 'odp' }[kind];
  docLeave(kind);
  if (creati.length === 1) {
    if (kind === 'rfq') { currentRfqId = creati[0].id; rfqView = 'edit'; }
    else if (kind === 'odl') { currentOdlId = creati[0].id; odlView = 'edit'; }
    else if (kind === 'odp') { currentOdpId = creati[0].id; odpView = 'edit'; }
    else { currentOrderId = creati[0].id; orderView = 'edit'; }
  } else if (kind === 'odp') { odpView = 'list'; currentOdpId = null; }
  else if (kind === 'rfq') { rfqView = 'list'; currentRfqId = null; }
  else if (kind === 'odl') { odlView = 'list'; currentOdlId = null; }
  else { orderView = 'list'; currentOrderId = null; }
  setView(vista);
  const nome = { rfq: ['Richiesta ', ' richieste create da '],
    order: ['Ordine ', ' ordini creati da '],
    odl: ['Ordine di lavoro ', ' ordini di lavoro creati da '],
    odp: ['Ordine di produzione ', ' ordini di produzione creati da '] }[kind];
  showToast(creati.length === 1
    ? nome[0] + creati[0].number + ' creato da ' + p.number
    : creati.length + nome[1] + p.number);
}
// Testata comune ai due tipi: intestatario, condizioni e legame col piano.
function planDocHead(p, supplierId) {
  const sup = supplierId ? getSupplier(supplierId) : null;
  return {
    title: p.title ? p.title + ' — ' + (sup ? sup.name : 'da assegnare') : ('Da ' + p.number),
    date: oggiISO(), status: 'bozza', supplierId: supplierId || null,
    transport: (sup && sup.defaultTransport) || db.settings.transportDefault || '',
    payment: (sup && sup.defaultPayment) || db.settings.paymentDefault || '',
    // La commessa segue il piano fino al documento: è la catena che permette di
    // chiedere «cosa abbiamo ordinato per la commessa 240?» e avere risposta.
    planId: p.id, jobId: p.jobId || null, notes: '', notesInternal: '', active: true,
  };
}
function planDocLine(r, conPrezzo) {
  const it = r.item;
  // La quantità del documento è quella mostrata nell'elenco: netta se il
  // fabbisogno netto è acceso, lorda altrimenti. Nascondere all'utente quale
  // delle due sta ordinando sarebbe il modo più rapido di fargli mandare al
  // fornitore un numero che non ha visto.
  // Unità sempre quella di gestione dell'articolo — è quella con cui si
  // ordina e si riceve davvero. Il prezzo è il costo del **listino
  // applicabile** (la quotazione più recente del fornitore a cui il
  // documento è intestato, vedi mrpBuyRow) già convertito in
  // quell'unità: se il fornitore quota a chilo, sulla riga va comunque
  // l'equivalente al metro, mai il prezzo grezzo al chilo.
  // Se quel fornitore non ha quotato l'articolo la riga parte **senza prezzo**:
  // una casella vuota si vede, il prezzo di un altro no.
  // La data di consegna richiesta è quella in cui il materiale serve: era
  // sempre vuota, e chi generava un ordine dal fabbisogno doveva riscriverla a
  // mano su ogni riga — cioè non la scriveva.
  return { id: gid(), itemId: it.id, code: it.code || '', description: it.name || '',
    uom: itemUom(it) || defaultUom(),
    qty: Number(r.qtyOrder != null ? r.qtyOrder : r.qty) || 0,
    price: conPrezzo && !r.noDocPrice && r.priceDoc > 0 ? r.priceDoc : '',
    deliveryDate: r.due || '', note: '' };
}
// Riga di documento di una **fase di conto lavoro**.
//
// `itemId` resta **rigorosamente nullo**, e non è una comodità: è la garanzia
// strutturale contro il doppio conteggio di magazzino. `stockIndex()` carica la
// giacenza dalle righe d'ordine che hanno un articolo (via `received`) e dai
// movimenti; una riga di conto lavoro non ha articolo, quindi non carica nulla
// da sé, e il rientro dei pezzi lo racconta un movimento. Mettendoci un `itemId`
// le due strade si sommerebbero e i pezzi risulterebbero il doppio.
//
// Il `code` è quello della **parte**: è il pezzo che il terzista riceve, lavora
// e rispedisce, ed è il codice con cui lo cercherà nella sua bolla.
//
// La quantità sono i **pezzi**, mai le ore. La riga di documento ha una quantità
// e una unità di misura sole: mettendoci le ore si perderebbe il numero di
// pezzi, che è ciò che si consegna, si conta e si riceve. Il dettaglio
// ore/tariffa va nella nota, che la stampa mostra sotto la descrizione.
//
// La riga copre una **tratta**: `phaseKey` ne nomina la prima fase — è
// l'identità della riga, quella che gli ancoraggi del conto lavoro leggono — e
// `phaseKeys` le elenca tutte, perché il fabbisogno non riproponga le fasi che
// stanno già dentro questa riga.
//
// Il prezzo è la somma delle tariffe per pezzo delle fasi della tratta; il
// dettaglio di ciascuna sta nella nota, dove la stampa lo mostra sotto la
// descrizione. Metterlo in righe separate avrebbe rimesso il terzista davanti a
// due lavorazioni dove ce n'è una sola da fatturare.
function planPhaseDocLine(r, conPrezzo) {
  const it = r.item;
  const fasi = r.fasi || [r];
  const dettaglio = f => (f.costMode === 'orario'
    // fmtPer porta gia' la valuta e il "per unita'": scriverle a mano qui
    // produceva "€32.00 €/h".
    ? `${fmtQtyIt(f.hoursUnit)} h/pz × ${fmtPer(f.rate, 'h')}`
    : fmtPer(f.price, 'pz'));
  const note = fasi.length > 1
    ? fasi.map(f => `fase ${f.phaseNo} ${f.wcName}: ${dettaglio(f)}`).join(' · ')
    : (fasi[0].costMode === 'orario' ? dettaglio(fasi[0]) : '');
  return { id: gid(), itemId: null, phaseKey: r.phaseKey,
    phaseKeys: (r.phaseKeys || [r.phaseKey]).join(','),
    code: it.code || '',
    description: `${r.wcName} — ${mrpRunFasiLabel(r)} su ${it.code || ''} ${it.name || ''}`.trim(),
    uom: itemUom(it) || defaultUom(),
    qty: Number(r.qtyOrder != null ? r.qtyOrder : r.qty) || 0,
    price: conPrezzo && r.price > 0 ? r.price : '',
    deliveryDate: r.due || '',
    note };
}
// Lo smistatore: le due fabbriche di riga hanno la stessa firma, e chi genera i
// documenti non deve sapere quale delle due sta usando.
function planDocLineOf(r, conPrezzo) {
  return r.isPhase ? planPhaseDocLine(r, conPrezzo) : planDocLine(r, conPrezzo);
}
function planNewRfq(p, supplierId, righe) {
  // Una richiesta d'offerta non porta il prezzo: è la domanda, non la risposta.
  const r = stampNew(Object.assign({ id: gid(), number: nextRfqNumber() }, planDocHead(p, supplierId),
    { lines: righe.map(x => planDocLineOf(x, false)) }));
  db.rfqs.push(r);
  return r;
}
// La riga di un ordine di lavoro: la riga di fase col prezzo, i pezzi tornati a
// zero e l'**inizio lavoro** — il giorno in cui consegniamo il materiale, che è
// la data d'invio della tratta (dalla 0.113.0). Una fabbrica sola per le tre
// strade (piano, ordine di produzione, a mano dal ciclo).
function planOdlLine(r) {
  return Object.assign(planPhaseDocLine(r, true), { received: 0, startDate: r.orderBy || '' });
}
// Un ordine di lavoro: stessa testata, righe di sola lavorazione. Il tipo di
// documento decide già quali righe arrivano fin qui (PLAN_DOC_FILTER), e la
// fabbrica di riga è quella delle fasi — non lo smistatore, perché qui non c'è
// niente da smistare.
function planNewOdl(p, supplierId, righe) {
  const o = stampNew(Object.assign({ id: gid(), number: nextOdlNumber() }, planDocHead(p, supplierId),
    { rfqId: null, supplierConfirmation: '',
      lines: righe.map(planOdlLine) }));
  db.workOrders.push(o);
  return o;
}
// Un ordine di produzione: una parte, i suoi pezzi, e le fasi del suo ciclo
// congelate. Passa dalla **stessa fabbrica** di uno scritto a mano (`odpNew`),
// perché un ordine generato dal piano che si comportasse diversamente sarebbe
// una seconda specie di ordine da ricordarsi.
function planNewOdp(p, r) {
  const o = odpNew(r.item, r.qtyOrder != null ? r.qtyOrder : r.qty, r.due || p.dueDate || '',
    { planId: p.id, jobId: p.jobId || null, title: p.title ? `${p.title} — ${r.item.code || ''}` : `Da ${p.number}` });
  db.prodOrders.push(o);
  return o;
}
function planNewOrder(p, supplierId, righe) {
  const o = stampNew(Object.assign({ id: gid(), number: nextOrderNumber() }, planDocHead(p, supplierId),
    { rfqId: null, supplierConfirmation: '',
      lines: righe.map(x => Object.assign(planDocLineOf(x, true), { received: 0 })) }));
  db.orders.push(o);
  return o;
}
// ─── Documenti già generati da un piano ───
function planDocs(planId) {
  return {
    rfqs: (db.rfqs || []).filter(r => r.planId === planId),
    orders: (db.orders || []).filter(o => o.planId === planId),
    workOrders: (db.workOrders || []).filter(o => o.planId === planId),
    prodOrders: (db.prodOrders || []).filter(o => o.planId === planId),
  };
}
function planDocsList(planId) {
  const d = planDocs(planId);
  if (!d.rfqs.length && !d.orders.length && !d.workOrders.length && !d.prodOrders.length) return '';
  const riga = (x, apri, icona) => `<span class="plandoc-link" ${clickAttrs(apri, 'Apri ' + x.number)}><span style="font-family:var(--mono)">${icona} ${esc(x.number)}</span> · ${esc(supplierName(x.supplierId) || 'da assegnare')}</span>`;
  return `<div class="mrp-section">
    <div class="cycle-section-head"><h3>${ico('clipboard', 'tinted pill', '')} Documenti generati</h3></div>
    <div class="plandoc-links">
      ${d.rfqs.map(r => riga(r, `openRfqFromPlan('${r.id}')`, ico('mail', 'tinted', 'Richiesta di offerta'))).join('')}
      ${d.orders.map(o => riga(o, `openOrderFromPlan('${o.id}')`, ico('receipt', 'tinted', 'Ordine a fornitore'))).join('')}
      ${d.workOrders.map(o => riga(o, `openOdlFromPlan('${o.id}')`, ico('wrench', 'tinted', 'Ordine di lavoro'))).join('')}
      ${d.prodOrders.map(o => `<span class="plandoc-link" ${clickAttrs(`openOdpFromPlan('${o.id}')`, 'Apri ' + o.number)}><span style="font-family:var(--mono)">${ico('factory', 'tinted', 'Ordine di produzione')} ${esc(o.number)}</span> · ${esc(o.code || '')}</span>`).join('')}
    </div></div>`;
}
// Stato prima, vista dopo: setView disegna già, chiamare open*Edit prima
// significherebbe disegnare due volte la stessa scheda.
function openRfqFromPlan(id) {
  docLeave('rfq'); currentRfqId = id; rfqView = 'edit';
  setView('rfq');
}
function openOrderFromPlan(id) {
  docLeave('order'); currentOrderId = id; orderView = 'edit';
  setView('orders');
}
function openOdlFromPlan(id) {
  docLeave('odl'); currentOdlId = id; odlView = 'edit';
  setView('odl');
}
function openOdpFromPlan(id) {
  currentOdpId = id; odpView = 'edit';
  setView('odp');
}

// ─── Disegno ───
function renderMrp() {
  invalidateCaches();
  const host = document.getElementById('view-mrp');
  if (mrpView === 'edit' && !getPlan(currentPlanId)) { mrpView = 'list'; currentPlanId = null; }
  host.innerHTML = worklistHtml({
    titolo: 'Fabbisogno materiali', icona: 'list', listaId: 'plan-list',
    comandi: `<button class="add-btn-sm" onclick="newPlan()">+ Nuovo piano</button>
      ${listExportButtons('planListExportSpec')}`,
    filtri: `<input type="text" class="search" id="plan-search" value="${esc(val('plan-search'))}" placeholder="Numero o titolo..." oninput="planSearchInput()">
      ${dateRangeFilter('plan-date', val('plan-date-from'), val('plan-date-to'), 'planFilterChange()', 'piano')}
      <span class="doc-filter-count" id="plan-count">${planCountText()}</span>`,
    righe: planListRows(),
    doc: mrpView === 'edit' ? renderPlanEdit(currentPlanId) : '',
    nota: `Un piano <strong>aperto</strong> impegna il materiale che gli serve: gli altri piani lo vedono come non disponibile e non se lo contano. Chiuderlo — dalla testata del piano — restituisce quella quota, senza cancellare niente.`,
    vuoto: {
      titolo: 'Nessun piano aperto qui',
      testo: 'Scegli un piano dall\'elenco a destra: al centro compaiono cosa produrre, cosa comprare — al lordo o al netto di magazzino, ordinato e impegnato — e cosa fabbricare in casa.',
      comandi: '<button class="add-btn-sm" onclick="newPlan()">+ Nuovo piano</button>',
    },
  });
  a11yFields(host);
}
// Come per la ricerca: si ridisegna solo l'elenco, la barra resta com'è.
function planFilterChange() {
  renderInto('plan-list', planListRows);
  const c = document.getElementById('plan-count');
  if (c) c.textContent = planCountText();
}
function planCountText() {
  return worklistCount(planFilteredList().length, (db.plans || []).length, 'piano', 'piani');
}
// I piani che l'elenco mostra. Estratta dal disegno perché la usa l'export.
function planFilteredList() {
  const q = (val('plan-search') || '').toLowerCase();
  const da = val('plan-date-from'), al = val('plan-date-to');
  const tutti = (db.plans || []).slice().sort((a, b) => (b.number || '').localeCompare(a.number || ''));
  return tutti.filter(p => {
    if (!inDateRange(p.date, da, al)) return false;
    if (!q) return true;
    return (p.number + ' ' + (p.title || '')).toLowerCase().includes(q);
  });
}
// ─── Export dell'elenco dei piani ───
// L'elenco, non il contenuto di un piano: quello ha già i suoi export
// (`exportMrpExcel`/`exportMrpPDF`) dentro il piano aperto.
function planListExportSpec() {
  return {
    titolo: 'Fabbisogno materiali — piani',
    slug: 'piani',
    filtri: [['Ricerca', val('plan-search')], ['Data', dateRangeText(val('plan-date-from'), val('plan-date-to'))]],
    sezioni: [{
      nome: 'Piani',
      colonne: [
        { h: 'Numero', w: 18 }, { h: 'Titolo', w: 34 }, { h: 'Stato', w: 12 },
        { h: 'Data', w: 12, data: true }, { h: 'Consegna', w: 12, data: true }, { h: 'Articoli a piano', w: 14, num: true },
      ],
      righe: planFilteredList().map(p => [
        p.number || '', p.title || '', p.active === false ? 'chiuso' : 'aperto',
        p.date || '', p.dueDate || '', (p.lines || []).length,
      ]),
    }],
  };
}
function planListRows() {
  const tutti = db.plans || [];
  const list = planFilteredList();
  return list.map(p => {
    const n = (p.lines || []).length;
    const chiuso = p.active === false;
    return worklistRow({
      numero: p.number,
      badge: `<span class="doc-badge ${chiuso ? 'st-chiusa' : 'st-aperta'}" title="${chiuso ? 'Chiuso: non impegna più materiale a magazzino' : 'Aperto: impegna a magazzino il materiale che gli serve'}">${chiuso ? 'chiuso' : 'aperto'}</span>`,
      titolo: p.title || '',
      meta: `${n} ${n === 1 ? 'articolo a piano' : 'articoli a piano'}${p.date ? ' · ' + esc(fmtDateIt(p.date)) : ''}`,
      sel: mrpView === 'edit' && currentPlanId === p.id,
      spenta: chiuso,
      azione: `openPlanEdit('${p.id}')`,
      etichetta: `Apri il piano ${p.number}`,
    });
  }).join('') || `<div class="empty-text">${tutti.length
    ? 'Nessun piano con questa ricerca.'
    : 'Nessun piano di produzione. Creane uno per sapere cosa comprare per costruire N macchine.'}</div>`;
}
function renderPlanEdit(id) {
  const p = getPlan(id);
  const exp = mrpExplodePlan(p);
  const prodInterna = areaAttiva('produzione');
  const buy = mrpRowsOf(exp.buy, id);
  // Al netto dei pezzi già fatti, come i documenti che ne nascono (0.105.5).
  const fasi = mrpPhaseRowsNette(id, exp.phases);
  // Dove ogni riga è già finita: si legge dai documenti del piano, una volta
  // per disegno invece che una volta per riga.
  const gia = planDocumentedKeys(id);
  buy.forEach(r => { r.docRefs = gia.get(r.item.id) || []; });
  fasi.forEach(r => { r.docRefs = gia.get(r.phaseKey) || []; });
  const totaleCl = fasi.reduce((s, r) => s + r.amount, 0);
  const totale = buy.reduce((s, r) => s + r.amount, 0);
  const fornitori = new Set(buy.filter(r => r.supplierId).map(r => r.supplierId)).size;
  const risparmio = buy.reduce((s, r) => s + r.saving, 0);
  const nImpegnate = buy.filter(r => r.committed > 0).length;

  const feas = planFeasibility(p);
  const fattibili = new Map(feas.map(f => [f.lineId, f]));
  const planRows = (p.lines || []).map(l => {
    const it = getItem(l.itemId);
    if (!it) return `<tr><td colspan="7" class="empty-text">${ico('warning', 'tinted', '')} articolo mancante</td>
      <td class="line-actions"><button class="mini-btn danger" onclick="planDelLine('${id}','${l.id}')" title="Togli dal piano">${ico('trash', 'tinted', 'Togli dal piano')}</button></td></tr>`;
    return `<tr>
      <td style="font-family:var(--mono)">${codeLink(it.id, it.code)}</td>
      <td>${esc(it.name)}<span class="bom-type-tag tt-${typeKey(it.type)}" style="margin-left:6px">${typeShort(it.type)}</span>${varRichiedeScelte(it)
        ? ` <span class="mrp-warn" title="Le righe che dipendono dalle scelte non sono contate: genera la macchina dal configuratore e metti in piano quella">${ico('warning', 'tinted', '')} modello da configurare</span>` : ''}</td>
      <td>${esc(it.uom || '')}</td>
      <td><input type="number" class="rfq-qty-input" min="0" step="any" value="${Number(l.qty) || 0}"
        onchange="planSetLineQty('${id}','${l.id}',this.value)"></td>
      <td><input type="date" class="rfq-date-input" value="${esc(l.dueDate || '')}" title="Quando serve pronto: da qui nascono le date d'ordine di tutto ciò che ci va dentro"
        onchange="planSetLineDue('${id}','${l.id}',this.value)"></td>
      ${planFeasCell(fattibili.get(l.id))}
      <td class="line-actions"><button class="mini-btn danger" onclick="planDelLine('${id}','${l.id}')" title="Togli dal piano">${ico('trash', 'tinted', 'Togli dal piano')}</button></td></tr>`;
  }).join('') || `<tr><td colspan="8" class="empty-text">Nessun articolo a piano. Usa "+ Aggiungi al piano".</td></tr>`;

  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      <div class="bom-toolbar-left">
        ${worklistCloseBtn('planBackToList()', 'il piano')}
        <h2 class="section-title" style="margin:0">${ico('list', 'tinted pill', 'Piano di fabbisogno')} ${esc(p.number)}</h2>
        ${storiaBtn('plan', id)}
        <button class="btn-outline" onclick="planToggleActive('${id}')" title="${p.active === false
          ? 'Chiuso: non impegna materiale. Riaprendolo tornerà a riservarsi quello che gli serve.'
          : 'Aperto: impegna a magazzino il materiale che gli serve, e gli altri piani non se lo contano. Chiudendolo quella quota torna libera.'}">${p.active === false ? ico('unlock', 'tinted', '') + ' Chiuso — riapri' : ico('lock', 'tinted', '') + ' Aperto — chiudi'}</button>
      </div>
      <div class="bom-toolbar-right">
        ${menuEsporta(`exportMrpExcel('${id}')`, `exportMrpPDF('${id}')`)}
        ${menuAltro([
          { label: 'Duplica il piano', icon: 'copy', onclick: `duplicatePlan('${id}')` },
          { label: 'Elimina il piano', icon: 'trash', onclick: `delPlan('${id}')`, danger: true },
        ])}
      </div>
    </div>
    <div class="modal-grid">
      <div class="modal-field"><label>Titolo</label>
        <input id="plan-title" value="${esc(p.title || '')}" placeholder="es. Lotto settembre" onchange="planSetField('${id}','title',this.value)"></div>
      <div class="modal-field"><label>Data</label>
        <input type="date" id="plan-date" value="${esc(p.date || '')}" onchange="planSetField('${id}','date',this.value)"></div>
      <div class="modal-field"><label>Consegna richiesta</label>
        <input type="date" id="plan-due" value="${esc(p.dueDate || '')}" title="Proposta alle righe nuove: si può cambiare riga per riga" onchange="planSetField('${id}','dueDate',this.value)"></div>
      <div class="modal-field"><label>Commessa</label>
        <select id="plan-job" onchange="planSetField('${id}','jobId',this.value)">${jobOptions(p.jobId || '')}</select></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Note</label>
        <input id="plan-notes" value="${esc(p.notes || '')}" onchange="planSetField('${id}','notes',this.value)"></div>
    </div>
    ${stampLine(p)}

    <div class="mrp-section">
      <div class="cycle-section-head">
        <h3>${ico('wrench', 'tinted pill', '')} Da produrre</h3>
        <button class="add-btn-sm" onclick="planAddModal('${id}')">+ Aggiungi al piano</button>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th scope="col">Codice</th><th scope="col">Articolo</th><th scope="col">U.M.</th><th scope="col" style="width:120px">Q.tà</th>
          <th scope="col" style="width:150px" title="Data in cui questo deve essere pronto">Serve per</th>
          <th scope="col" title="Quando può essere pronto davvero cominciando oggi: giacenze, ordini in arrivo, giorni dei fornitori e tempi di lavorazione">Fattibile</th>
          <th scope="col" title="Giorni lavorativi fra la data fattibile e quella richiesta: negativo = in ritardo">Margine</th><th scope="col"></th></tr></thead>
        <tbody>${planRows}</tbody></table></div>
    </div>

    <div class="cost-summary">
      ${kpi('Totale acquisti', fmtN(totale), 'accent')}
      ${kpi('Articoli da comprare', String(buy.length), 'orange')}
      ${kpi('Fornitori coinvolti', String(fornitori), '')}
      ${prodInterna ? kpi('Parti da fabbricare', String(exp.make.length), 'purple') : ''}
      ${prodInterna && fasi.length ? kpi('Conto lavoro', fmtN(totaleCl), 'green') : ''}
      ${prodInterna ? planAvanzamentoKpi(id, exp.make) : ''}
    </div>
    ${exp.cycle ? '<div class="empty-text" style="color:var(--red)">' + ico('warning', 'tinted', '') + ' Rilevato riferimento ciclico nelle distinte: il fabbisogno è troncato su quel ramo.</div>' : ''}

    ${planTabsHtml([
      { id: 'buy', label: 'Da acquistare', n: buy.length, html: `
        <div class="plan-genera">
          ${planDocButton(p, 'rfq', ico('mail', 'tinted', '') + ' Genera richieste')}
          ${planDocButton(p, 'order', ico('receipt', 'tinted', '') + ' Genera ordini')}
        </div>
        ${risparmio > 0 ? `<div class="empty-text" style="text-align:left">↓ Passando, dove conviene, a un altro fornitore che a listino quota meno il totale scenderebbe di <strong>${fmtN(risparmio)}</strong>. Il prezzo in uso si cambia dal listino dell'articolo.</div>` : ''}
        <div class="mrp-section">
          <div class="cycle-section-head">
            <h3>${ico('cart', 'tinted pill', '')} Da acquistare</h3>
            <button class="btn-outline${mrpNet ? ' active' : ''}" onclick="toggleMrpNet()" title="Toglie dal fabbisogno quello che è già a magazzino, quello già ordinato e quello già impegnato dai piani aperti più urgenti">${mrpNet ? '☑' : '☐'} Fabbisogno netto</button>
            <button class="btn-outline${mrpGrouped ? ' active' : ''}" onclick="toggleMrpGroup()">${mrpGrouped ? '☑' : '☐'} Raggruppa per fornitore</button>
          </div>
          ${mrpNet ? `<p class="empty-text" style="text-align:left;padding:0 0 8px">Netto = <strong>lordo + scorta minima + impegnato − esistente − in arrivo</strong>, arrotondato al lotto di riordino. L'esistente è calcolato da ricevimenti e movimenti; l'in arrivo è ciò che è stato ordinato e non è ancora entrato; l'<strong>impegnato</strong> è quanto hanno già promesso gli <em>altri piani aperti che consegnano prima</em> — senza toglierlo, due piani sugli stessi articoli si direbbero coperti entrambi con la stessa merce. Chi consegna prima prende prima, e ogni piano compra solo la sua parte scoperta: se i più urgenti chiedono più merce di quanta ce ne sia, il resto lo comprano loro. Il lordo resta in colonna: serve a capire il prodotto, il netto a capire cosa comprare.</p>
          ${nImpegnate ? `<p class="empty-text" style="text-align:left;padding:0 0 8px">${ico('lock', 'tinted', '')} ${nImpegnate} ${nImpegnate === 1 ? 'riga contende' : 'righe contendono'} materiale con altri piani aperti. Un piano che non serve più si chiude dall'elenco: la sua quota torna libera.</p>` : ''}` : ''}
          ${mrpBuyTable(buy)}
        </div>` },
      { id: 'cl', label: 'Conto lavoro', n: fasi.length, html: `
        <div class="plan-genera">
          ${planDocButton(p, 'rfq', ico('mail', 'tinted', '') + ' Genera richieste')}
          ${planDocButton(p, 'odl', ico('wrench', 'tinted', '') + ' Genera ordini di lavoro')}
        </div>
        <div class="mrp-section">
          <div class="cycle-section-head"><h3>${ico('wrench', 'tinted pill', '')} Da far lavorare fuori</h3></div>
          <p class="empty-text" style="text-align:left;padding:0 0 8px">Le fasi del ciclo affidate a un terzista. Entrano nelle richieste d'offerta e negli ordini di lavoro, un documento per fornitore. Le quantità sono <strong>al netto dei pezzi dichiarati fatti</strong> in «Da fabbricare»: una parte finita ha già attraversato tutte le sue fasi, e non va rimandata fuori. Una parte ferma <em>a metà ciclo</em> conta invece ancora per intero — si dichiara la parte finita, non la fase superata — quindi il conto qui è prudente per scelta: si rischia di riproporre una lavorazione già avviata, mai di dimenticarne una da fare. Una fase <strong>coperta da un ordine di produzione</strong> è il caso in cui la fase superata si sa davvero: quella esce da qui, e l'ordine di lavoro si genera da lì.</p>
          ${mrpPhaseTable(fasi)}
        </div>` },
      { id: 'make', label: 'Da fabbricare', n: exp.make.length, html: `
        <div class="plan-genera">
          ${planDocButton(p, 'odp', ico('factory', 'tinted', '') + ' Genera ordini di produzione')}
        </div>
        <div class="mrp-section">
          <div class="cycle-section-head"><h3>${ico('factory', 'tinted pill', '')} Da fabbricare</h3></div>
          ${mrpMakeTable(exp.make, id)}
        </div>
        ${exp.stock.length ? `<div class="mrp-section">
          <div class="cycle-section-head"><h3>${ico('package', 'tinted pill', '')} Dal magazzino</h3></div>
          ${mrpStockTable(exp.stock)}
        </div>` : ''}` },
      { id: 'asm', label: 'Da montare', n: exp.asm.length, html: `
        ${prodInterna && exp.asm.some(e => asmHaCiclo(e.item)) ? `<div class="plan-genera">
          ${planDocButton(p, 'odp', ico('factory', 'tinted', '') + ' Genera ordini di produzione')}
        </div>` : ''}
        <div class="mrp-section">
          <div class="cycle-section-head"><h3>${ico('wrench', 'tinted pill', '')} Da montare</h3></div>
          ${mrpAsmTable(exp.asm, id)}
        </div>` },
      { id: 'agenda', label: 'Programma', html: `<div class="mrp-section">${planAgendaHtml(p)}</div>` },
      { id: 'gantt', label: 'Gantt', html: `<div class="mrp-section">${planGanttHtml(p, feas)}</div>` },
      { id: 'load', label: 'Carico', html: `
        <div class="mrp-section">
          <div class="cycle-section-head"><h3>${ico('wrench', 'tinted pill', '')} Carico dei centri</h3></div>
          <p class="empty-text" style="text-align:left;padding:0 0 8px">Le ore che <strong>questo piano</strong> chiede ai centri interni, per settimana. Il carico vero è la somma di tutti i piani aperti: si guarda in <em>Pianificazione → Carico centri</em>, perché il centro è condiviso e un piano solo non dice se regge.</p>
          ${loadTableHtml(mrpLoad(p), id)}
        </div>` },
      { id: 'docs', label: 'Documenti', n: planDocsTotale(id), html: planDocsList(id) || '<p class="empty-text">Nessun documento generato da questo piano: si creano dai pulsanti «Genera» delle altre schede.</p>' },
    // Senza Produzione interna non c'è niente da fabbricare né da far lavorare
    // fuori, e nessun centro da caricare: restano acquisti e montaggio.
    ].filter(t => prodInterna || !PLAN_TAB_PRODUZIONE.includes(t.id)))}</div>`;
}
// ─── Le schede del piano ───
// Fino alla 0.91 le sezioni stavano una sotto l'altra — acquisti, conto
// lavoro, da fabbricare, programma, Gantt, carico, documenti — e la scheda
// arrivava a quasi tre schermate: per vedere il conto lavoro si scorreva oltre
// gli acquisti, ogni volta. Ora testata, righe a piano e numeri restano in
// alto, e il resto sta in schede con il loro conteggio; ogni pulsante «Genera»
// sta nella scheda delle righe su cui agisce.
//
// Le schede si disegnano **tutte**, e quelle non scelte restano nascoste:
// cambiare scheda non ridisegna niente, la stampa le mostra tutte (vedi
// style.css), e chi cerca una sezione nel testo della pagina la trova ancora.
// La scheda scelta vale per tutti i piani e dura quanto la sessione, come la
// memoria dei gruppi della barra.
let planTab = 'buy';
const PLAN_TAB_PRODUZIONE = ['cl', 'make', 'load'];
// Quanti documenti ha generato un piano, per il numero sulla scheda. Fino alla
// 0.125.0 si chiamava planDocsCount come il contatore delle righe spuntate qui
// sopra, e in uno script classico la seconda definizione copriva la prima:
// nella scheda «Genera documenti» il conto delle righe scelte restava vuoto.
function planDocsTotale(planId) {
  const d = planDocs(planId);
  return d.rfqs.length + d.orders.length + d.workOrders.length + d.prodOrders.length;
}
function planTabsHtml(tabs) {
  if (!tabs.some(t => t.id === planTab)) planTab = tabs[0].id;
  const bar = tabs.map(t => {
    const on = t.id === planTab;
    return `<button type="button" role="tab" id="plan-tab-${t.id}" class="plan-tab${on ? ' active' : ''}" aria-selected="${on}" aria-controls="plan-panel-${t.id}" tabindex="${on ? 0 : -1}"
      onclick="planSetTab('${t.id}')" onkeydown="planTabKey(event)">${esc(t.label)}${t.n != null ? ` <span class="plan-tab-n">${t.n}</span>` : ''}</button>`;
  }).join('');
  const panels = tabs.map(t => `<div role="tabpanel" id="plan-panel-${t.id}" class="plan-tabpanel" aria-labelledby="plan-tab-${t.id}"${t.id === planTab ? '' : ' hidden'}>${t.html}</div>`).join('');
  return `<div class="plan-tabs" role="tablist" aria-label="Sezioni del piano">${bar}</div>${panels}`;
}
function planSetTab(t) {
  planTab = t;
  if (typeof document === 'undefined') return;
  const tab = document.getElementById('plan-tab-' + t);
  if (!tab) return;
  document.querySelectorAll('.plan-tab').forEach(b => {
    const on = b === tab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
    b.setAttribute('tabindex', on ? '0' : '-1');
  });
  document.querySelectorAll('.plan-tabpanel').forEach(x => { x.hidden = x.id !== 'plan-panel-' + t; });
}
// Frecce sinistra/destra fra le schede, come in ogni elenco di schede.
function planTabKey(e) {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const tabs = Array.from(document.querySelectorAll('.plan-tab'));
  const i = tabs.indexOf(e.currentTarget);
  const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  if (!next) return;
  e.preventDefault();
  planSetTab(next.id.replace('plan-tab-', ''));
  next.focus();
}
// ─── Il programma del piano: l'agenda ───
// Le date ci sono già tutte nelle tabelle sotto — ordinare entro, invio,
// rientro, lancio — ma ognuna nella sua: questa le mette **in fila**, che è la
// domanda di chi organizza la settimana. Nessun conto nuovo: le righe sono le
// stesse delle tabelle (acquisti col modo netto/lordo scelto, tratte al netto
// del prodotto, parti per il residuo), e lo stato viene dai documenti del piano.
//   evento = { data, tipo, testo, itemId, codice, nome, dove, qty, uom, stato, docs }
//   stato  = 'fatto' | 'richiesto' | 'ritardo' | 'da fare' | 'previsto'
// `previsto` è per ciò che non ha un documento da emettere (rientri, fasi
// interne, montaggi, consegne): ha solo una data, e se è passata è `ritardo`.
const AGENDA_TIPI = {
  ordina: { label: 'Ordinare', icona: 'cart' },
  invia: { label: 'Inviare al terzista', icona: 'truck' },
  rientro: { label: 'Rientro dal terzista', icona: 'truck' },
  lancio: { label: 'Lanciare in produzione', icona: 'factory' },
  lavora: { label: 'Fase interna', icona: 'wrench' },
  montaggio: { label: 'Montaggio', icona: 'wrench' },
  arrivo: { label: 'Arrivo dal fornitore', icona: 'package' },
  consegna: { label: 'Consegna', icona: 'clipboard' },
};
const AGENDA_STATI = { fatto: 'fatto', lavorazione: 'in lavorazione', emesso: 'ODL emesso', richiesto: 'richiesto', ritardo: 'in ritardo',
  'da fare': 'da fare', previsto: 'previsto' };
// A che punto è una tratta dal terzista, dai documenti che la coprono (dalla
// 0.113.0). L'ordine di lavoro **non è l'invio**: si emette prima, per avvisare
// il terzista che a quella data prenderà in carico la lavorazione. L'invio è il
// materiale che parte — l'avvio della fase sull'ordine di produzione, o
// l'uscita registrata dalla riga dell'ODL — e la tratta è fatta quando i pezzi
// sono rientrati: le fasi dichiarate e chiuse, o i pezzi della riga tornati.
//   '' (non partita) · 'lavorazione' · 'fatto'
function planTrattaAvanzamento(refs) {
  const stati = [];
  (refs || []).forEach(x => {
    if (x.kind === 'odl') {
      const o = getOdl(x.id), l = o && (o.lines || []).find(r => r.id === x.lineId);
      if (l) stati.push(odlAvanzamentoRiga(o, l));
    } else if (x.kind === 'odp' && x.faseId && typeof getOdp === 'function') {
      const o = getOdp(x.id), f = o && (o.phases || []).find(p => p.id === x.faseId);
      if (f) stati.push(odpAvanzamentoTratta(o, f));
    }
  });
  if (!stati.some(Boolean)) return '';
  return stati.every(s => s === 'fatto') ? 'fatto' : 'lavorazione';
}
// Il giorno d'invio concordato col terzista, se l'ordine di lavoro lo porta:
// vince sulla data calcolata, perché è quella che gli abbiamo scritto.
function planTrattaInizio(refs) {
  const date = [];
  (refs || []).forEach(x => {
    if (x.kind !== 'odl') return;
    const o = getOdl(x.id), l = o && (o.lines || []).find(r => r.id === x.lineId);
    if (l && l.startDate) date.push(String(l.startDate).slice(0, 10));
  });
  return date.sort()[0] || '';
}
function planAgenda(plan) {
  const oggi = oggiISO();
  const exp = mrpExplodePlan(plan);
  const gia = planDocumentedKeys(plan.id);
  const out = [];
  const stato = (data, refs, docKinds) => {
    if (docKinds) {
      if ((refs || []).some(x => docKinds.includes(x.kind))) return 'fatto';
      if ((refs || []).some(x => x.kind === 'rfq')) return data && data < oggi ? 'ritardo' : 'richiesto';
      return data && data < oggi ? 'ritardo' : 'da fare';
    }
    return data && data < oggi ? 'ritardo' : 'previsto';
  };
  const ev = (o) => out.push(Object.assign({ codice: o.item ? o.item.code || '' : '', nome: o.item ? o.item.name || '' : '',
    itemId: o.item ? o.item.id : '', uom: o.item ? itemUom(o.item) : '', dove: '', qty: 0, docs: [] }, o));

  mrpRowsOf(exp.buy, plan.id).forEach(r => {
    if (!(r.qtyOrder > 0) || !r.orderBy) return;
    const refs = gia.get(r.item.id) || [];
    ev({ data: r.orderBy, tipo: 'ordina', item: r.item, qty: r.qtyOrder, dove: supplierName(r.supplierId) || '',
      testo: `serve per il ${fmtDateIt(r.due)}`, stato: stato(r.orderBy, refs, ['order']), docs: refs });
  });
  // Gli arrivi degli ordini del piano (dalla 0.111.0): con l'ordine emesso
  // l'acquisto era «fatto» e spariva, anche se il fornitore aveva spostato la
  // consegna oltre il giorno in cui il materiale serve. La data è quella
  // confermata, o quella chiesta; in ritardo se viene dopo il «serve per» o se
  // è passata senza che la merce sia arrivata.
  const servePer = new Map(exp.buy.map(e => [e.item.id, e.due || '']));
  (db.orders || []).filter(o => o.planId === plan.id && o.active !== false && ORDER_INCOMING_STATES.includes(o.status)).forEach(o =>
    (o.lines || []).forEach(l => {
      if (!l.itemId || !servePer.has(l.itemId)) return;
      const it = getItem(l.itemId); if (!it) return;
      const manca = (Number(l.qty) || 0) - (Number(l.received) || 0);
      const data = String(l.confirmedDate || l.deliveryDate || '').slice(0, 10);
      if (!(manca > 0) || !data) return;
      const serve = servePer.get(l.itemId);
      const scaduto = data < oggi;
      ev({ data, tipo: 'arrivo', item: it, qty: fromAltUom(it, manca, l.uom), dove: supplierName(o.supplierId) || '',
        testo: `${scaduto ? 'scaduto, ' : ''}${serve ? 'serve per il ' + fmtDateIt(serve) : ''}`,
        stato: scaduto || (serve && data > serve) ? 'ritardo' : 'previsto',
        docs: [{ kind: 'order', id: o.id, number: o.number || '' }] });
    }));
  mrpPhaseRuns(mrpPhaseRowsNette(plan.id, exp.phases)).forEach(r => {
    const refs = [].concat(...(r.phaseKeys || [r.phaseKey]).map(k => gia.get(k) || []));
    // L'invio è fatto quando il materiale parte, non quando esce l'ordine di
    // lavoro: con l'ODL emesso la voce resta da fare, col numero accanto.
    const av = planTrattaAvanzamento(refs);
    const invio = planTrattaInizio(refs) || r.orderBy;
    const emesso = refs.some(x => x.kind === 'odl' || x.kind === 'odp');
    const st = av ? (av === 'fatto' ? 'fatto' : 'lavorazione')
      : emesso ? (invio && invio < oggi ? 'ritardo' : 'emesso') : stato(invio, refs, []);
    const fasi = mrpRunFasiLabel(r);
    if (invio) ev({ data: invio, tipo: 'invia', item: r.item, qty: r.qty, dove: supplierName(r.supplierId) || '',
      testo: `${fasi} ${r.wcName}, rientro il ${fmtDateIt(r.due)}`, stato: st, docs: refs });
    if (r.due) ev({ data: r.due, tipo: 'rientro', item: r.item, qty: r.qty, dove: supplierName(r.supplierId) || '',
      testo: `${fasi} ${r.wcName}`,
      stato: av === 'fatto' ? 'fatto' : (av && r.due >= oggi ? 'lavorazione' : stato(r.due)), docs: refs });
  });
  exp.make.map(e => mrpMakeRow(e, plan.id)).forEach(r => {
    if (!(r.qtyOrder > 0) || !r.orderBy) return;
    const refs = gia.get(r.makeKey) || [];
    ev({ data: r.orderBy, tipo: 'lancio', item: r.item, qty: r.qtyOrder,
      testo: `pronta per il ${fmtDateIt(r.due)}`, stato: stato(r.orderBy, refs, ['odp']), docs: refs });
  });
  exp.intOps.forEach(e => {
    if (!e.start) return;
    const wc = getWorkCenter(e.workCenterId);
    ev({ data: e.start, tipo: 'lavora', item: e.item, qty: e.qty, dove: wc ? wc.name : '',
      testo: `fase ${e.phaseNo}, fino al ${fmtDateIt(e.due)}`, stato: stato(e.start) });
  });
  exp.asm.forEach(e => {
    if (!e.start || !e.due || e.start === e.due) return;
    ev({ data: e.start, tipo: 'montaggio', item: e.item, qty: e.qty, testo: `fino al ${fmtDateIt(e.due)}`, stato: stato(e.start) });
  });
  (plan.lines || []).forEach(l => {
    const it = getItem(l.itemId);
    if (!it || !l.dueDate) return;
    ev({ data: l.dueDate, tipo: 'consegna', item: it, qty: Number(l.qty) || 0, testo: 'pronto da consegnare', stato: stato(l.dueDate) });
  });
  // In un giorno: prima le cose da emettere, poi quelle che accadono; la
  // consegna per ultima, come nella realtà.
  const ordine = ['ordina', 'invia', 'lancio', 'rientro', 'arrivo', 'lavora', 'montaggio', 'consegna'];
  return out.sort((a, b) => a.data.localeCompare(b.data) || ordine.indexOf(a.tipo) - ordine.indexOf(b.tipo)
    || String(a.codice).localeCompare(String(b.codice)));
}
let agendaSoloDaFare = false;
function toggleAgendaDaFare() { agendaSoloDaFare = !agendaSoloDaFare; renderMrp(); }
function agendaStatoHtml(st) {
  if (st === 'fatto') return `<span class="price-best">${ico('check', 'tinted', '')} fatto</span>`;
  if (st === 'ritardo') return `<span class="mrp-warn">${ico('warning', 'tinted', '')} in ritardo</span>`;
  if (st === 'richiesto') return `<span class="empty-text" style="padding:0">${ico('mail', 'tinted', '')} richiesto</span>`;
  if (st === 'emesso') return `<span class="empty-text" style="padding:0">${ico('mail', 'tinted', '')} ODL emesso</span>`;
  if (st === 'lavorazione') return `<span class="empty-text" style="padding:0">${ico('truck', 'tinted', '')} in lavorazione</span>`;
  return `<span class="empty-text" style="padding:0">${esc(AGENDA_STATI[st] || st)}</span>`;
}
function planAgendaHtml(plan) {
  const tutti = planAgenda(plan);
  const ev = agendaSoloDaFare ? tutti.filter(e => !['fatto', 'previsto', 'lavorazione'].includes(e.stato)) : tutti;
  const ritardi = tutti.filter(e => e.stato === 'ritardo').length;
  const testa = `<div class="cycle-section-head"><h3>${ico('clock', 'tinted pill', '')} Programma</h3>
      <button class="btn-outline${agendaSoloDaFare ? ' active' : ''}" onclick="toggleAgendaDaFare()" title="Solo ciò che va ancora emesso: ordini, invii, lanci">${agendaSoloDaFare ? '☑' : '☐'} Solo da fare</button>
      ${menuEsporta('exportListXlsx(planAgendaExportSpec())', 'exportListPdf(planAgendaExportSpec())', { cls: 'dd-export dd-push' })}</div>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Tutto quello che deve succedere perché le consegne reggano, <strong>in ordine di data</strong>: le date vengono dalla programmazione a ritroso sul calendario di fabbrica. «Fatto» vuol dire che il documento è stato emesso da questo piano; per le tratte dal terzista l'ordine di lavoro emesso non basta: l'invio è <strong>in lavorazione</strong> quando il materiale è partito (fase avviata, o uscita registrata dall'ordine di lavoro) ed è <strong>fatto</strong> quando i pezzi sono rientrati.${ritardi ? ` <span class="mrp-warn">${ico('warning', 'tinted', '')} ${ritardi} ${ritardi === 1 ? 'voce è' : 'voci sono'} già oltre la data.</span>` : ''}</p>`;
  if (!ev.length) return `${testa}<div class="empty-text">${tutti.length ? 'Niente da fare: è tutto emesso.' : 'Nessuna data: le righe di piano non hanno una consegna.'}</div>`;
  let giorno = '';
  const corpo = ev.map(e => {
    const t = AGENDA_TIPI[e.tipo] || { label: e.tipo, icona: 'list' };
    const nuovoGiorno = e.data !== giorno; giorno = e.data;
    const docs = (e.docs || []).length ? ` <span class="empty-text" style="padding:0">${esc(e.docs.map(x => x.number).join(', '))}</span>` : '';
    return `<tr${nuovoGiorno ? ' class="agenda-day"' : ''}>
      <td style="white-space:nowrap">${nuovoGiorno ? `<strong>${esc(fmtDateIt(e.data))}</strong>` : ''}</td>
      <td>${ico(t.icona, 'tinted', '')} ${esc(t.label)}</td>
      <td style="font-family:var(--mono)">${e.itemId ? codeLink(e.itemId, e.codice) : esc(e.codice)}</td>
      <td>${esc(e.nome)} <span class="empty-text" style="padding:0">${esc(e.testo || '')}</span></td>
      <td>${esc(e.dove || '')}</td>
      <td style="font-family:var(--mono);text-align:right">${e.qty ? fmtQtyIt(+e.qty.toFixed(3)) + ' ' + esc(e.uom || '') : ''}</td>
      <td>${agendaStatoHtml(e.stato)}${docs}</td></tr>`;
  }).join('');
  return `${testa}<div class="table-wrap"><table>
    <thead><tr><th scope="col" style="width:100px">Data</th><th scope="col">Cosa</th><th scope="col">Codice</th>
      <th scope="col">Articolo</th><th scope="col">Dove</th><th scope="col" style="text-align:right">Q.tà</th><th scope="col">Stato</th></tr></thead>
    <tbody>${corpo}</tbody></table></div>`;
}
function planAgendaExportSpec() {
  const p = getPlan(currentPlanId);
  const ev = p ? planAgenda(p) : [];
  return {
    titolo: 'Programma del piano' + (p ? ' ' + p.number : ''),
    slug: 'programma_' + (p ? p.number : 'piano'),
    filtri: [['Piano', p ? p.number + (p.title ? ' — ' + p.title : '') : '']],
    sezioni: [{
      nome: 'Programma',
      colonne: [
        { h: 'Data', w: 12, data: true }, { h: 'Cosa', w: 22 }, { h: 'Codice', w: 18 }, { h: 'Articolo', w: 30 },
        { h: 'Dettaglio', w: 30 }, { h: 'Dove', w: 22 }, { h: 'Q.tà', w: 10, num: true }, { h: 'U.M.', w: 6 },
        { h: 'Stato', w: 12 }, { h: 'Documenti', w: 18 },
      ],
      righe: ev.map(e => [e.data, (AGENDA_TIPI[e.tipo] || {}).label || e.tipo, e.codice, e.nome, e.testo || '', e.dove || '',
        +(Number(e.qty) || 0).toFixed(3), e.uom || '', AGENDA_STATI[e.stato] || e.stato, (e.docs || []).map(x => x.number).join(', ')]),
      totali: null,
    }],
  };
}

// ─── Il Gantt ───
// Una riga di piano alla volta, un nodo dell'albero per riga del disegno:
// assiemi, parti con le loro tappe, acquisti. Le barre piene sono il programma
// **a ritroso** (entro quando deve succedere); il contorno rosso segna il
// percorso critico, cioè ciò che decide la data fattibile. SVG scritto a mano,
// come il grafico del carico, con gli stessi colori-token dell'app.
//   acquisto = attesa del fornitore · tratta = conto lavoro · fase interna · montaggio
// Ogni barra porta la sua <title>: il disegno dice dove guardare, le date
// esatte stanno nella tabella del Programma e nel suggerimento.
const GANTT_MAX_RIGHE = 60;
const GANTT_COLORI = { buy: 'var(--orange)', est: 'var(--purple)', int: 'var(--accent)', asm: 'var(--green)' };
let ganttRiga = '';
function ganttSetRiga(id) { ganttRiga = id || ''; renderMrp(); }
function ganttGiorni(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
function planGanttHtml(plan, feas) {
  const conAlbero = (feas || []).filter(f => f.tree && f.richiesta);
  const testa = `<div class="cycle-section-head"><h3>${ico('chart', 'tinted pill', '')} Gantt</h3>
    ${conAlbero.length > 1 ? `<select class="gantt-pick" onchange="ganttSetRiga(this.value)" title="Quale riga di piano disegnare">
      ${conAlbero.map(f => `<option value="${esc(f.lineId)}" ${f.lineId === ganttRiga ? 'selected' : ''}>${esc(f.tree.item.code || '')} — ${esc(fmtDateIt(f.richiesta))}</option>`).join('')}</select>` : ''}</div>`;
  if (!conAlbero.length) return `${testa}<div class="empty-text">Nessuna riga di piano con una data di consegna.</div>`;
  const f = conAlbero.find(x => x.lineId === ganttRiga) || conAlbero[0];
  const critici = new Set(f.critico);
  const tutte = schedFlat(f.tree);
  const righe = tutte.slice(0, GANTT_MAX_RIGHE);
  // L'asse va dalla prima data utile all'ultima, oggi compreso.
  const date = [oggiISO(), f.richiesta, f.fattibile].filter(Boolean);
  righe.forEach(({ node: n }) => {
    [n.start, n.end, n.attesa].forEach(d => { if (d) date.push(d); });
    n.steps.forEach(st => [st.start, st.end].forEach(d => { if (d) date.push(d); }));
  });
  const da = date.reduce((m, d) => d < m ? d : m), al = date.reduce((m, d) => d > m ? d : m);
  const giorni = Math.max(1, ganttGiorni(da, al) + 1);
  const L = 230, W = 640, H = 22, top = 24;
  const x = d => L + (ganttGiorni(da, d) / giorni) * W;
  const barra = (d1, d2, y, colore, crit, titolo) => {
    if (!d1 || !d2) return '';
    const x1 = x(d1), x2 = Math.max(x(d2), x1 + 2);
    return `<rect x="${x1.toFixed(1)}" y="${y + 5}" width="${(x2 - x1).toFixed(1)}" height="${H - 10}" rx="2" fill="${colore}"
      ${crit ? 'stroke="var(--red)" stroke-width="1.5"' : ''}><title>${esc(titolo)}</title></rect>`;
  };
  // Le tacche: un lunedì per settimana, con la data.
  let tacche = '';
  for (let d = inizioSettimana(da); d <= al; d = addDays(d, 7)) {
    if (d < da) continue;
    tacche += `<line x1="${x(d).toFixed(1)}" y1="${top - 4}" x2="${x(d).toFixed(1)}" y2="${top + righe.length * H}" stroke="var(--hairline)" stroke-width="1"/>
      <text x="${(x(d) + 2).toFixed(1)}" y="${top - 8}" class="load-chart-lbl">${esc(fmtDateIt(d).slice(0, 5))}</text>`;
  }
  const corpo = righe.map(({ node: n, livello }, i) => {
    const y = top + i * H;
    const crit = critici.has(n);
    const etichetta = `<text x="${4 + livello * 12}" y="${y + H / 2 + 4}" class="gantt-lbl${crit ? ' gantt-crit' : ''}">${esc(n.item.code || '')}</text>`;
    let barre = '';
    if (n.kind === 'buy') {
      const arrivo = schedArrivoTesto(n);
      barre = barra(n.start, n.end, y, GANTT_COLORI.buy, crit,
        `${n.item.code} — ${schedNodeLabel(n)}: ordinare entro ${fmtDateIt(n.start)}, serve il ${fmtDateIt(n.end)}${arrivo ? ' — ' + arrivo : ''}`);
      // L'arrivo di quello che è già ordinato (dalla 0.111.0): le barre sono il
      // programma a ritroso e non si muovono, il rombo sì. Rosso se arriva dopo
      // il giorno in cui serve, o se l'ordine è scaduto.
      if (n.attesa) {
        const tardi = (n.scaduti || []).length || (n.end && n.attesa > n.end);
        const cx = x(n.attesa), cy = y + H / 2;
        barre += `<polygon class="gantt-arrivo${tardi ? ' gantt-arrivo-tardi' : ''}" points="${(cx - 5).toFixed(1)},${cy} ${cx.toFixed(1)},${cy - 5} ${(cx + 5).toFixed(1)},${cy} ${cx.toFixed(1)},${cy + 5}"
          fill="${tardi ? 'var(--red)' : 'var(--text)'}"><title>${esc(`${n.item.code} — ${arrivo}${tardi && !(n.scaduti || []).length ? ', serve il ' + fmtDateIt(n.end) : ''}`)}</title></polygon>`;
      }
    } else if (n.kind === 'asm') {
      barre = barra(n.start, n.end, y, GANTT_COLORI.asm, crit, `${n.item.code} — montaggio dal ${fmtDateIt(n.start)} al ${fmtDateIt(n.end)}`);
    } else {
      barre = n.steps.map(st => barra(st.start, st.end, y, st.esterna ? GANTT_COLORI.est : GANTT_COLORI.int, crit,
        `${n.item.code} — ${schedStepLabel(n, st)}: dal ${fmtDateIt(st.start)} al ${fmtDateIt(st.end)}`)).join('');
    }
    return `<g>${etichetta}${barre}</g>`;
  }).join('');
  const altezza = top + righe.length * H + 6;
  const linea = (d, colore, testo) => d ? `<line x1="${x(d).toFixed(1)}" y1="${top - 4}" x2="${x(d).toFixed(1)}" y2="${altezza - 4}" stroke="${colore}" stroke-width="1.5" stroke-dasharray="4 3"><title>${esc(testo)}</title></line>` : '';
  // La data fattibile (dalla 0.111.0): entrava nella scala ma non si vedeva, e
  // spostare un ordine non cambiava niente nel disegno. Arancione se viene dopo
  // la consegna richiesta.
  const fattOk = !f.fattibile || !f.richiesta || f.fattibile <= f.richiesta;
  const legenda = [['buy', 'attesa fornitore'], ['int', 'fase interna'], ['est', 'conto lavoro'], ['asm', 'montaggio']]
    .map(([k, t]) => `<span class="gantt-key"><i style="background:${GANTT_COLORI[k]}"></i>${t}</span>`).join('');
  const descr = `Gantt di ${f.tree.item.code}: ${righe.length} righe, dal ${fmtDateIt(da)} al ${fmtDateIt(al)}, consegna richiesta ${fmtDateIt(f.richiesta)}, fattibile ${fmtDateIt(f.fattibile)}`;
  return `${testa}
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Le barre sono il programma a ritroso: entro quando deve succedere ogni cosa perché la consegna regga. Il contorno <span style="color:var(--red)">rosso</span> segna il percorso critico; la linea rossa è la consegna richiesta, quella blu oggi, quella ${fattOk ? 'verde' : 'arancione'} la data fattibile. Il rombo è l'arrivo atteso di un ordine già emesso: rosso se arriva dopo il giorno in cui serve, o se è scaduto.</p>
    <div class="gantt-legend">${legenda}</div>
    <figure class="gantt"><svg viewBox="0 0 ${L + W + 10} ${altezza}" preserveAspectRatio="xMinYMin meet" role="img" aria-label="${esc(descr)}">
      ${tacche}${corpo}${linea(oggiISO(), 'var(--accent)', 'Oggi')}${linea(f.richiesta, 'var(--red)', 'Consegna richiesta ' + fmtDateIt(f.richiesta))}${linea(f.fattibile, fattOk ? 'var(--green)' : 'var(--orange)', 'Data fattibile ' + fmtDateIt(f.fattibile))}
    </svg></figure>
    ${tutte.length > righe.length ? `<p class="empty-text" style="text-align:left">${ico('warning', 'tinted', '')} Disegnate le prime ${righe.length} righe su ${tutte.length}: la distinta è più grande di quanto un Gantt leggibile possa mostrare. Il Programma le elenca tutte.</p>` : ''}`;
}

// ─── Fattibile e margine, nella tabella «Da produrre» ───
function planFeasCell(f) {
  if (!f || !f.fattibile) return '<td></td><td></td>';
  const neg = f.margine != null && f.margine < 0;
  const marg = f.margine == null ? '' : (f.margine > 0 ? '+' : '') + f.margine + ' gg';
  const apri = clickAttrs(`planCriticoModal('${currentPlanId}','${f.lineId}')`, 'Percorso critico: cosa decide la data fattibile');
  return `<td style="white-space:nowrap"><span class="plandoc-link plandoc-link-sm" ${apri}>${esc(fmtDateIt(f.fattibile))}</span></td>
    <td style="white-space:nowrap">${marg ? `<span class="${neg ? 'mrp-warn' : 'empty-text'}" style="padding:0" title="${neg ? 'Giorni lavorativi di ritardo sulla consegna richiesta' : 'Giorni lavorativi di margine sulla consegna richiesta'}">${neg ? ico('warning', 'tinted', '') + ' ' : ''}${esc(marg)}</span>` : ''}</td>`;
}
// L'arrivo già ordinato di un acquisto, accanto alla sua data: «in arrivo il
// 5/11», o in rosso gli ordini scaduti — la data è passata e la merce non c'è,
// e il programma la aspetta al prossimo giorno lavorativo (dalla 0.111.0).
function schedArrivoTesto(n) {
  if (!n || n.kind !== 'buy') return '';
  if ((n.scaduti || []).length) return 'ordine scaduto: ' + n.scaduti.map(x => `${x.number || 'senza numero'} (atteso il ${fmtDateIt(x.eta)})`).join(', ');
  return n.attesa ? 'in arrivo il ' + fmtDateIt(n.attesa) : '';
}
function schedArrivoHtml(n) {
  const t = schedArrivoTesto(n);
  if (!t) return '';
  return (n.scaduti || []).length
    ? ` <span class="mrp-warn" style="padding:0" title="La data dell'ordine è passata e la merce non è stata ricevuta: il programma la aspetta al prossimo giorno lavorativo. Sollecita il fornitore e aggiorna la data confermata.">${ico('warning', 'tinted', '')} ${esc(t)}</span>`
    : ` <span class="empty-text" style="padding:0">${esc(t)}</span>`;
}
function planCriticoModal(planId, lineId) {
  const p = getPlan(planId); if (!p) return;
  const f = planFeasibility(p).find(x => x.lineId === lineId);
  if (!f || !f.tree) return;
  const voci = f.critico.map((n, i) => `<div class="mgmt-item">
      <span style="width:24px" class="empty-text">${i + 1}</span>
      <span style="width:120px;font-family:var(--mono)">${codeLink(n.item.id, n.item.code)}</span>
      <span style="flex:1">${esc(n.item.name || '')} <span class="empty-text" style="padding:0">${esc(schedNodeLabel(n))}</span>${schedArrivoHtml(n)}</span>
      <span style="width:190px;text-align:right;font-family:var(--mono)">${esc(fmtDateIt(n.fStart))} → ${esc(fmtDateIt(n.fEnd))}</span>
    </div>`).join('');
  const neg = f.margine != null && f.margine < 0;
  openModal(`<h3>${ico('clock', 'tinted pill', '')} Percorso critico — ${esc(f.tree.item.code || '')}</h3>
    <p>Richiesta per il <strong>${esc(fmtDateIt(f.richiesta) || '—')}</strong>, fattibile il <strong>${esc(fmtDateIt(f.fattibile))}</strong>${f.margine == null ? '' : neg
      ? ` — <span class="mrp-warn">${-f.margine} gg lavorativi di ritardo</span>` : ` — ${f.margine} gg lavorativi di margine`}.</p>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Cominciando oggi, ciascun passo può partire solo quando è pronto quello sotto: questa è la catena che arriva per ultima. Accorciare la consegna vuol dire accorciare uno di questi passi — un fornitore più rapido, una fase in parallelo, materiale già a magazzino. Capacità infinita: i centri si suppongono liberi.</p>
    <div style="display:flex;flex-direction:column;gap:6px">${voci}</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'critico');
}

// Il lordo non sparisce mai dalla riga: nel netto resta accanto, in chiaro.
// Vedere "servono 40, ne hai 25, ne compri 15" è tutt'altra cosa che vedere 15
// e doversi fidare.
function mrpBuyLineHtml(r) {
  const seg = [];
  if (r.bestPrice != null && r.saving > 0) seg.push(`<span class="price-best" title="Un altro fornitore quota ${fmtPer(r.bestPrice, r.uom)}: sulla quantità da ordinare si risparmiano ${fmtN(r.saving)}">↓ ${fmtN(r.saving)}</span>`);
  if (r.underMin) seg.push(`<span class="mrp-warn" title="Quantità minima del fornitore: ${fmtUom(r.minQty, r.uom)}">${ico('warning', 'tinted', '')} sotto il minimo</span>`);
  if (r.noPrice) seg.push(`<span class="mrp-warn" title="Nessun prezzo in uso: la riga varrebbe zero in un ordine">${ico('warning', 'tinted', '')} senza prezzo</span>`);
  if (mrpNet && r.lotSize > 0 && r.net > 0) seg.push(r.lotMode === 'min'
    ? `<span class="mrp-warn" title="Portato al minimo ordinabile di ${fmtUom(r.lotSize, r.uom)}">↑ minimo ${fmtUom(r.lotSize, r.uom)}</span>`
    : `<span class="mrp-warn" title="Arrotondato al lotto di riordino di ${fmtUom(r.lotSize, r.uom)}">↑ lotto ${fmtUom(r.lotSize, r.uom)}</span>`);
  if (r.coperto) seg.push(`<span class="price-best" title="Esistente e in arrivo bastano, al netto di quanto è già impegnato">✓ coperto</span>`);
  if (r.arrivoTardi) seg.push(`<span class="mrp-warn" title="Già ordinato, ma l'ordine arriva il ${fmtDateIt(r.arrivoTardi)} e serve il ${fmtDateIt(r.due)}: sollecita il fornitore o rivedi la consegna">${ico('clock', 'tinted', '')} arriva il ${esc(fmtDateIt(r.arrivoTardi))}</span>`);
  if ((r.scaduti || []).length) seg.push(`<span class="mrp-warn" title="Righe d'ordine con la data passata e la merce non ricevuta: ${esc(r.scaduti.map(x => `${x.number} (atteso il ${fmtDateIt(x.eta)})`).join(', '))}">${ico('warning', 'tinted', '')} ordine scaduto ${esc(r.scaduti.map(x => x.number).join(', '))}</span>`);
  // L'impegno si segnala **sempre**, anche col netto spento: è la risposta alla
  // domanda «la giacenza che vedo è davvero mia?», e nasconderla dietro un
  // toggle significherebbe lasciar promettere due volte la stessa merce a chi
  // quel toggle non l'ha acceso.
  if (r.committed > 0) {
    const chi = r.impegni.map(c => `${c.number}${c.title ? ' — ' + c.title : ''}: ${fmtQtyIt(c.qty)} ${r.uom}`.trim()).join('\n');
    seg.push(`<span class="mrp-warn" title="Già promesso ai piani aperti più urgenti:\n${esc(chi)}\n\nLibero = esistente + in arrivo − impegnato = ${fmtUom(r.libero, r.uom)}">🔒 impegnato ${fmtUom(r.committed, r.uom)}</span>`);
  }
  const urg = URGENZA_LABEL[r.urgenza];
  if (urg && urg.txt) seg.push(`<span class="${urg.cls}" title="${esc(urg.desc)}: ordinare entro il ${fmtDateIt(r.orderBy)}">${urg.txt}</span>`);
  // Dove è già finita questa riga. Si vede qui, senza aprire la generazione:
  // è la domanda «l'ho già ordinato?», e va risposta dove si guarda per primo.
  (r.docRefs || []).forEach(x => seg.push(
    `<span class="price-best" title="Questo articolo è già in ${esc(docRefLabel(x))} (${fmtQtyIt(x.qty)} ${esc(x.uom)}) generato da questo fabbisogno">📄 ${esc(x.number)}</span>`));
  if ((r.bozze || []).length) seg.push(mrpBozzeBadge(r));
  if (typeof altBadgeRiga === 'function') seg.push(...altBadgeRiga(r));
  const celleStock = mrpNet ? `
    <td style="font-family:var(--mono);text-align:right;color:var(--text-dim)">${fmtQtyIt(r.qty)}</td>
    <td style="font-family:var(--mono);text-align:right">${fmtQtyIt(r.onHand)}${r.safety > 0 ? `<span class="empty-text" style="padding:0"> (min ${fmtQtyIt(r.safety)})</span>` : ''}</td>
    <td style="font-family:var(--mono);text-align:right${r.committed > 0 ? ';color:var(--orange,#d90)' : ''}">${r.committed > 0 ? '−' + fmtQtyIt(r.committed) : '—'}
      ${r.committed > 0 ? `<div class="empty-text" style="padding:0${r.libero < 0 ? ';color:var(--red)' : ''}">libero ${fmtQtyIt(r.libero)}</div>` : ''}</td>
    <td style="font-family:var(--mono);text-align:right">${fmtQtyIt(r.incoming)}</td>` : '';
  // Le due date stanno insieme: quella in cui serve non si può cambiare, quella
  // entro cui ordinare è l'unica su cui si può ancora fare qualcosa.
  const celleDate = `<td style="white-space:nowrap">${r.due ? esc(fmtDateIt(r.due)) : '<span class="empty-text" style="padding:0">—</span>'}</td>
    <td style="white-space:nowrap${r.urgenza === 'ritardo' ? ';color:var(--red);font-weight:700' : (r.urgenza === 'urgente' ? ';color:var(--orange,#d90)' : '')}">
      ${r.orderBy ? esc(fmtDateIt(r.orderBy)) : '<span class="empty-text" style="padding:0">—</span>'}
      ${r.leadDays ? `<div class="empty-text" style="padding:0">${r.leadDays} gg</div>` : ''}</td>`;
  return `<tr${r.coperto ? ' style="opacity:.55"' : ''}>
    <td style="font-family:var(--mono)">${codeLink(r.item.id, r.item.code)}</td>
    <td>${esc(r.item.name)} ${seg.join(' ')}</td>
    <td>${esc(supplierName(r.supplierId) || '—')}</td>
    ${celleDate}
    <td>${esc(r.uom)}</td>
    ${celleStock}
    <td style="font-family:var(--mono);text-align:right"><strong>${fmtQtyIt(r.qtyOrder)}</strong></td>
    <td style="font-family:var(--mono);text-align:right">${fmtN(r.price)}</td>
    <td style="font-family:var(--mono);text-align:right">${fmtN(r.amount)}</td></tr>`;
}
function mrpBozzeBadge(r) {
  const b = r.bozze || [];
  return `<span class="mrp-warn" title="C'è già una bozza d'ordine con questo articolo, fuori da questo piano: ${esc(b.map(x => `${x.number} (${fmtQtyIt(x.qty)} ${r.uom})`).join(', '))}. Non è ancora in arrivo: prima di ordinarlo di nuovo, guarda se basta quella.">${ico('file', 'tinted', '')} in bozza ${esc(b.map(x => x.number).join(', '))}</span>`;
}
function mrpBuyTable(rows) {
  if (!rows.length) return '<div class="empty-text">Niente da comprare: il piano è vuoto o i suoi articoli non hanno distinta.</div>';
  const colonneStock = mrpNet
    ? `<th scope="col" style="text-align:right" title="Quanto serve in tutto">Lordo</th>
       <th scope="col" style="text-align:right" title="Calcolato da ricevimenti e movimenti">Esistente</th>
       <th scope="col" style="text-align:right" title="Già promesso ai piani di fabbisogno aperti più urgenti: esistente meno questo è quello di cui si può disporre">Impegnato</th>
       <th scope="col" style="text-align:right" title="Ordinato e non ancora ricevuto">In arrivo</th>` : '';
  const nCol = (mrpNet ? 11 : 7) + 2;   // + le due colonne di data
  const head = `<thead><tr><th scope="col">Codice</th><th scope="col">Articolo</th><th scope="col">Fornitore</th>
    <th scope="col" title="Data in cui il materiale serve">Serve per</th>
    <th scope="col" title="Data in cui serve meno i giorni di consegna del fornitore">Ordinare entro</th>
    <th scope="col">U.M.</th>
    ${colonneStock}<th scope="col" style="text-align:right">${mrpNet ? 'Da comprare' : 'Q.tà'}</th>
    <th scope="col" style="text-align:right" title="Prezzo di una unità, nella U.M. della colonna U.M.">Prezzo (${esc(cur())}/U.M.)</th>
    <th scope="col" style="text-align:right">Importo (${esc(cur())})</th></tr></thead>`;
  const totale = rows.reduce((s, r) => s + r.amount, 0);
  let body;
  if (mrpGrouped) {
    body = mrpGroupBySupplier(rows).map(g => `
      <tr class="mrp-group"><td colspan="${nCol - 1}">${ico('factory', 'tinted', '')} ${esc(g.name)} — ${g.rows.length} ${g.rows.length === 1 ? 'articolo' : 'articoli'}</td>
        <td style="font-family:var(--mono);text-align:right">${fmtN(g.total)}</td></tr>
      ${g.rows.map(mrpBuyLineHtml).join('')}`).join('');
  } else {
    body = rows.map(mrpBuyLineHtml).join('');
  }
  return `<div class="table-wrap"><table>${head}<tbody>${body}
    <tr class="mrp-total"><td colspan="${nCol - 1}">Totale acquisti${mrpNet ? ' (netti)' : ''}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtN(totale)}</td></tr></tbody></table></div>`;
}
// ─── Da far lavorare fuori ───
// Le fasi di conto lavoro del piano. Non hanno giacenza né netto — vedi
// mrpPhaseRow — quindi la tabella non ha le colonne che nel «da acquistare»
// raccontano la copertura: qui non ci sarebbe niente da raccontare.
function mrpPhaseTable(rows) {
  if (!rows.length) return '<div class="empty-text">Nessuna lavorazione in conto lavoro in questo piano. Le fasi del ciclo senza fornitore sono interne.</div>';
  const corpo = rows.map(r => {
    const seg = [];
    // Una fase coperta da un ordine di produzione non si ordina da qui: l'ordine
    // di lavoro si genera da lì, dove la successione dice anche *quando*.
    const odp = (r.docRefs || []).filter(x => x.kind === 'odp');
    const altri = (r.docRefs || []).filter(x => x.kind !== 'odp');
    if (odp.length) seg.push(`<span class="price-best" ${clickAttrs(`openOdpFromPlan('${odp[0].id}')`, "Apri l'ordine di produzione: l'ordine di lavoro per questa fase si genera da lì")} title="Coperta da un ordine di produzione: l'ordine di lavoro si genera da lì, quando la fase precedente è chiusa">${ico('factory', 'tinted', '')} coperta da ${esc(odp.map(x => x.number).join(', '))}</span>`);
    if (altri.length) seg.push(`<span class="price-best" title="Già in ${esc(altri.map(docRefLabel).join(', '))}">${ico('file', 'tinted', '')} ${esc(altri.map(x => x.number).join(', '))}</span>`);
    if (r.noPrice) seg.push(`<span class="mrp-warn" title="La fase non ha una tariffa nel ciclo: in un ordine varrebbe zero">${ico('warning', 'tinted', '')} senza tariffa</span>`);
    const u = URGENZA_LABEL[r.urgenza] || null;
    return `<tr>
      <td style="font-family:var(--mono)">${r.phaseNo}</td>
      <td>${esc(r.wcName)} ${seg.join(' ')}</td>
      <td style="font-family:var(--mono)">${codeLink(r.item.id, r.item.code)}</td>
      <td>${esc(r.item.name)}</td>
      <td>${esc(supplierName(r.supplierId) || '—')}</td>
      <td>${r.due ? fmtDateIt(r.due) : '—'}</td>
      <td>${r.orderBy ? fmtDateIt(r.orderBy) : '—'}${r.leadDays ? ` <span class="empty-text" style="padding:0">−${r.leadDays} gg</span>` : ''}${u && u.txt ? ` <span class="${u.cls}" title="${esc(u.desc)}">${u.txt}</span>` : ''}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtQtyIt(r.qty)} ${esc(r.uom)}</td>
      <td style="font-family:var(--mono);text-align:right">${r.hours ? fmtQtyIt(r.hours) : '—'}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtN(r.price)}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtN(r.amount)}</td></tr>`;
  }).join('');
  const tot = rows.reduce((s, r) => s + r.amount, 0);
  const totOre = rows.reduce((s, r) => s + r.hours, 0);
  return `<div class="table-wrap"><table>
    <thead><tr><th scope="col">Fase</th><th scope="col">Lavorazione</th><th scope="col">Codice</th>
      <th scope="col">Parte</th><th scope="col">Terzista</th><th scope="col">Serve per</th>
      <th scope="col" title="Invio al terzista: a ritroso dal rientro, che è l'inizio della fase dopo (o la data in cui la parte serve), meno i giorni di attraversamento e di trasporto">Ordinare entro</th>
      <th scope="col" style="text-align:right">Q.tà</th>
      <th scope="col" style="text-align:right" title="Ore totali della fase: ore per pezzo x pezzi. Non entrano nel costo se la fase e a costo fisso">Ore tot.</th>
      <th scope="col" style="text-align:right">Prezzo/pz (${esc(cur())})</th>
      <th scope="col" style="text-align:right">Importo (${esc(cur())})</th></tr></thead>
    <tbody>${corpo}</tbody>
    <tfoot><tr><td colspan="8">Totale conto lavoro</td>
      <td style="font-family:var(--mono);text-align:right">${totOre ? fmtQtyIt(totOre) : '—'}</td>
      <td></td><td style="font-family:var(--mono);text-align:right">${fmtN(tot)}</td></tr></tfoot></table></div>`;
}
// `planId` serve all'avanzamento: quante di queste parti sono già state fatte si
// dichiara **dentro un piano**, non sull'articolo — la stessa parte in due piani
// diversi è due lavori diversi.
// A che punto è il lavoro. Compare **solo** quando qualcuno ha dichiarato
// qualcosa: su un piano appena aperto «fatto 0%» non informa nessuno, occupa un
// posto in fila agli altri numeri e li fa leggere peggio.
function planAvanzamentoKpi(planId, make) {
  const av = pianoAvanzamento(planId, make);
  if (!av || !av.pezziFatti) return '';
  const pct = Math.round(av.quota * 100);
  return kpi('Prodotto', pct + '%', pct >= 100 ? 'green' : 'orange');
}
// Questa sezione dice ora **tre** cose che prima non diceva: quando la parte
// serve, quanti pezzi sono stati dichiarati fatti, e se è stata lanciata con un
// ordine di produzione. Erano tre modi diversi di rispondere alla stessa
// domanda — «a che punto è» — e vivevano in tre posti.
function mrpMakeTable(make, planId) {
  if (!make.length) return '<div class="empty-text">Nessuna parte da fabbricare in questo piano.</div>';
  const puoScrivere = canWriteShop('docs');   // l'officina dichiara anche le parti (dalla 0.105.6), come il montaggio
  const gia = planId ? planDocumentedKeys(planId) : new Map();
  const rows = make.map(e => {
    const c = costOf(e.item.id).total;
    const refs = (gia.get('make#' + e.item.id) || []).filter(x => x.kind === 'odp');
    const fasi = clCycleRuns(e.item);
    const seg = [];
    if (refs.length) seg.push(`<span class="price-best" ${clickAttrs(`openOdpFromPlan('${refs[0].id}')`, "Apri l'ordine di produzione")} title="Già lanciata con un ordine di produzione: le fasi si seguono lì">${ico('factory', 'tinted', '')} ${esc(refs.map(x => x.number).join(', '))}</span>`);
    else if (!fasi.length) seg.push(`<span class="mrp-warn" title="Il ciclo di questa parte non ha lavorazioni: non c'è nessuna successione da seguire">${ico('warning', 'tinted', '')} senza ciclo</span>`);
    const fatti = planId ? prodottiDi(planId, e.item.id) : 0;
    const resta = planId ? daFare(planId, e.item.id, e.qty) : e.qty;
    // Finita si dice in verde e si smette di chiederlo: una riga chiusa non deve
    // continuare a somigliare a lavoro da fare.
    const statoFatti = !planId ? ''
      : fatti <= 0 ? '<span class="empty-text" style="padding:0">—</span>'
        : resta > 0 ? `<span class="mrp-warn">${fmtQtyIt(fatti)}</span>`
          : `<span class="price-best">${fmtQtyIt(fatti)}</span>`;
    const azione = planId && puoScrivere
      ? `<button class="mini-btn" title="Dichiara quanti pezzi sono stati fatti" onclick="produzioneModal('${planId}','${e.item.id}',${e.qty})">${ico('factory', 'tinted', 'Avanzamento')}</button>`
      : '';
    return `<tr>
      <td style="font-family:var(--mono)">${codeLink(e.item.id, e.item.code)}</td>
      <td>${esc(e.item.name)} ${seg.join(' ')}</td>
      <td>${esc(e.item.uom || '')}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtQtyIt(e.qty)}</td>
      <td>${e.due ? fmtDateIt(e.due) : '—'}${e.start && e.due && e.start < e.due ? `<div class="empty-text" style="padding:0" title="Inizio della prima fase del ciclo, a ritroso dalla data in cui serve: entro questa data va lanciato l'ordine di produzione">lancio ${esc(fmtDateIt(e.start))}</div>` : ''}</td>
      <td style="font-family:var(--mono);text-align:right">${statoFatti}</td>
      <td style="font-family:var(--mono);text-align:right">${planId ? (resta > 0 ? fmtQtyIt(resta) : '<span class="price-best">finita</span>') : ''}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtN(c)}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtN(c * e.qty)}</td>
      <td class="row-actions" style="text-align:right">${azione}</td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table>
    <thead><tr><th scope="col">Codice</th><th scope="col">Parte</th><th scope="col">U.M.</th>
      <th scope="col" style="text-align:right">Q.tà</th>
      <th scope="col" title="Data in cui questa parte deve essere pronta; sotto, entro quando lanciarla">Serve per</th>
      <th scope="col" style="text-align:right" title="Pezzi dichiarati fatti su questo piano">Fatti</th>
      <th scope="col" style="text-align:right" title="Quanti ne restano da fare">Restano</th>
      <th scope="col" style="text-align:right">Costo un. (${esc(cur())}/U.M.)</th>
      <th scope="col" style="text-align:right">Importo (${esc(cur())})</th>
      <th scope="col"></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}
// ─── Le parti prese dallo scaffale (dalla 0.100.0) ───
// Non si fabbricano: ci sono già. Si dicono comunque, o il «da fabbricare» più
// corto del previsto sembrerebbe un errore.
function mrpStockTable(stock) {
  const rows = stock.map(e => `<tr>
      <td style="font-family:var(--mono)">${codeLink(e.item.id, e.item.code)}</td>
      <td>${esc(e.item.name)}</td>
      <td>${esc(e.item.uom || '')}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtQtyIt(e.qty)}</td>
      <td style="font-family:var(--mono);text-align:right">${fmtQtyIt(onHandOf(e.item.id))}</td></tr>`).join('');
  return `<p class="empty-text" style="text-align:left;padding:0 0 8px">Parti già pronte a magazzino che questo piano usa invece di fabbricarle: sotto di loro non si compra materiale e non si lancia niente. Lo scaffale si spartisce fra i piani aperti in ordine di consegna, e le parti fabbricate per un piano restano a lui.</p>
    <div class="table-wrap"><table>
    <thead><tr><th scope="col">Codice</th><th scope="col">Parte</th><th scope="col">U.M.</th>
      <th scope="col" style="text-align:right" title="Pezzi che il piano prende dallo scaffale">Presi</th>
      <th scope="col" style="text-align:right">Esistente</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}
// ─── Gli assiemi da montare (dalla 0.100.0) ───
// Il montaggio si dichiara qui, come la produzione di una parte: quanti ne sono
// stati montati, e i componenti diretti escono dal magazzino (produzione.js).
function mrpAsmTable(asm, planId) {
  if (!asm.length) return '<div class="empty-text">Nessun assieme da montare in questo piano.</div>';
  const puoScrivere = canWriteShop('docs');
  const rows = asm.map(e => {
    const fatti = prodottiDi(planId, e.item.id);
    const resta = daFare(planId, e.item.id, e.qty);
    const nComp = montaggioComponenti(e.item, 1).stock.length;
    const statoFatti = fatti <= 0 ? '<span class="empty-text" style="padding:0">—</span>'
      : resta > 0 ? `<span class="mrp-warn">${fmtQtyIt(fatti)}</span>` : `<span class="price-best">${fmtQtyIt(fatti)}</span>`;
    // Un assieme con un ordine di produzione nel piano si monta da lì: fasi,
    // prelievo dei componenti e pezzi fatti passano dall'ordine, e dichiararlo
    // anche qui farebbe uscire i componenti due volte (montaggioDichiara).
    const odp = odpDelPiano(planId, e.item.id);
    const azione = odp.length
      ? odp.map(o => `<span class="code-link" ${clickAttrs(`openOdpFromPlan('${o.id}')`, 'Apri ' + o.number)}>${ico('factory', 'tinted', '')} ${esc(o.number)}</span>`).join(' ')
      : puoScrivere
        ? `<button class="mini-btn" title="Dichiara il montaggio: i componenti escono dal magazzino" onclick="montaggioModal('${planId}','${e.item.id}',${e.qty})">${ico('wrench', 'tinted', 'Montaggio')}</button>`
        : '';
    return `<tr>
      <td style="font-family:var(--mono)">${codeLink(e.item.id, e.item.code)}</td>
      <td>${esc(e.item.name)}<span class="bom-type-tag tt-${typeKey(e.item.type)}" style="margin-left:6px">${typeShort(e.item.type)}</span></td>
      <td style="font-family:var(--mono);text-align:right">${fmtQtyIt(e.qty)}</td>
      <td>${e.start && e.due && e.start < e.due ? `${fmtDateIt(e.start)} → ${fmtDateIt(e.due)}` : (e.due ? fmtDateIt(e.due) : '—')}</td>
      <td style="text-align:right">${nComp}</td>
      <td style="font-family:var(--mono);text-align:right">${statoFatti}</td>
      <td style="font-family:var(--mono);text-align:right">${resta > 0 ? fmtQtyIt(resta) : '<span class="price-best">montati</span>'}</td>
      <td class="row-actions" style="text-align:right">${azione}</td></tr>`;
  }).join('');
  return `<p class="empty-text" style="text-align:left;padding:0 0 8px">Dichiarare un montaggio <strong>scarica i componenti diretti</strong> dell'assieme che stanno a magazzino — commerciali, parti, materiali — come consumo di produzione per questo piano. I sottoassiemi si dichiarano ciascuno per sé. Un assieme che ha un <strong>ciclo</strong> si può invece lanciare con un ordine di produzione: le fasi di montaggio si seguono da lì, in reparto, e i componenti escono all'avvio della prima.</p>
    <div class="table-wrap"><table>
    <thead><tr><th scope="col">Codice</th><th scope="col">Assieme</th>
      <th scope="col" style="text-align:right">Q.tà</th>
      <th scope="col" title="Inizio e fine del montaggio, a ritroso dalla consegna">Montaggio</th>
      <th scope="col" style="text-align:right" title="Componenti diretti che si tengono a magazzino">Componenti</th>
      <th scope="col" style="text-align:right">Montati</th>
      <th scope="col" style="text-align:right">Restano</th>
      <th scope="col"></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}
// Le quantità esplose sono float (scarti e frazioni): si mostrano senza zeri
// inutili. La formattazione — e l'unità che le va accanto — stanno in core.js:
// fmtQty / fmtUom / fmtPer.

// ─── Export ───
// L'export porta **quello che la scheda mostra**: testata del piano, righe a
// piano con la data fattibile, acquisti con le date e le note, conto lavoro,
// parti da fabbricare con l'avanzamento, parti dal magazzino e assiemi da
// montare. Prima della 0.112.0 il foglio aveva solo codice, quantità e prezzo, e
// chi lo riceveva doveva tornare all'app per sapere *quando* ordinare e *cosa*
// era già stato fatto. I dati si raccolgono una volta qui, con gli stessi conti
// di renderPlanEdit, e Excel e PDF li scrivono ciascuno a modo suo.
function mrpExportData(p) {
  const exp = mrpExplodePlan(p);
  const buy = mrpRowsOf(exp.buy, p.id);
  const fasi = mrpPhaseRowsNette(p.id, exp.phases);
  const gia = planDocumentedKeys(p.id);
  buy.forEach(r => { r.docRefs = gia.get(r.item.id) || []; });
  fasi.forEach(r => { r.docRefs = gia.get(r.phaseKey) || []; });
  const feas = new Map(planFeasibility(p).map(f => [f.lineId, f]));
  const righe = (p.lines || []).map(l => ({ l, it: getItem(l.itemId), f: feas.get(l.id) || null }));
  const make = exp.make.map(e => ({
    e, costo: costOf(e.item.id).total,
    fatti: prodottiDi(p.id, e.item.id), resta: daFare(p.id, e.item.id, e.qty),
    odp: (gia.get('make#' + e.item.id) || []).filter(x => x.kind === 'odp'),
    senzaCiclo: !clCycleRuns(e.item).length,
  }));
  const asm = exp.asm.map(e => ({
    e, fatti: prodottiDi(p.id, e.item.id), resta: daFare(p.id, e.item.id, e.qty),
    nComp: montaggioComponenti(e.item, 1).stock.length,
  }));
  const job = p.jobId ? getJob(p.jobId) : null;
  return {
    exp, righe, make, asm, fasi, stock: exp.stock,
    buy: mrpGrouped ? mrpGroupBySupplier(buy).flatMap(g => g.rows) : buy,
    commessa: job ? jobLabel(job) : '',
    totale: buy.reduce((s, r) => s + r.amount, 0),
    totaleCl: fasi.reduce((s, r) => s + r.amount, 0),
    totaleMake: make.reduce((s, m) => s + m.costo * m.e.qty, 0),
    fornitori: new Set(buy.filter(r => r.supplierId).map(r => r.supplierId)).size,
    risparmio: buy.reduce((s, r) => s + r.saving, 0),
  };
}
// Le etichette accanto al nome, scritte in parole: in un foglio non c'è il
// tooltip, e «sotto il minimo» o «già in ODA-…» sono proprio le cose che
// cambiano cosa fare di quella riga.
const URGENZA_TESTO = { ritardo: 'in ritardo', urgente: 'da ordinare' };
function mrpBuyNoteTesto(r) {
  const n = [];
  if (r.coperto) n.push('coperto');
  if (URGENZA_TESTO[r.urgenza]) n.push(URGENZA_TESTO[r.urgenza]);
  if (r.underMin) n.push(`sotto il minimo del fornitore (${fmtQtyIt(r.minQty)} ${r.uom})`.replace(' )', ')'));
  if (r.noPrice) n.push('senza prezzo');
  if (mrpNet && r.lotSize > 0 && r.net > 0) n.push((r.lotMode === 'min' ? 'portato al minimo ' : 'arrotondato al lotto ') + `${fmtQtyIt(r.lotSize)} ${r.uom}`.trim());
  if (r.arrivoTardi) n.push('già ordinato, arriva il ' + fmtDateIt(r.arrivoTardi));
  if ((r.scaduti || []).length) n.push('ordine scaduto ' + r.scaduti.map(x => x.number).join(', '));
  if (r.committed > 0) n.push(`impegnato da ${r.impegni.map(c => c.number).join(', ')}`);
  if (r.saving > 0) n.push('altro fornitore: risparmio ' + fmtN(r.saving));
  (r.docRefs || []).forEach(x => n.push('già in ' + docRefLabel(x)));
  if ((r.bozze || []).length) n.push('in bozza ' + r.bozze.map(x => x.number).join(', '));
  return n.join('; ');
}
function mrpPhaseNoteTesto(r) {
  const n = [];
  if (URGENZA_TESTO[r.urgenza]) n.push(URGENZA_TESTO[r.urgenza]);
  (r.docRefs || []).forEach(x => n.push((x.kind === 'odp' ? 'coperta da ' : 'già in ') + docRefLabel(x)));
  if (r.noPrice) n.push('senza tariffa');
  return n.join('; ');
}
function mrpMakeNoteTesto(m) {
  if (m.odp.length) return 'lanciata con ' + m.odp.map(docRefLabel).join(', ');
  return m.senzaCiclo ? 'senza ciclo' : '';
}
function mrpMargineTesto(f) {
  return f && f.margine != null ? (f.margine > 0 ? '+' : '') + f.margine + ' gg' : '';
}
function exportMrpExcel(id) {
  const p = getPlan(id); if (!p) return;
  const d = mrpExportData(p);
  // Le quantità restano numeri, sommabili: l'unità è nella colonna U.M. e la
  // valuta nell'intestazione delle colonne di denaro. Le date sono quelle
  // della scheda, scritte all'italiana come negli altri export.
  const q = n => +(Number(n) || 0).toFixed(3), eur = n => +(Number(n) || 0).toFixed(2);
  const piano = [
    ['Piano', p.number], ['Titolo', p.title || ''], ['Stato', p.active === false ? 'chiuso' : 'aperto'],
    ['Data', fmtDateIt(p.date)], ['Consegna richiesta', fmtDateIt(p.dueDate)],
    ['Commessa', d.commessa], ['Note', p.notes || ''],
    ['Quantità acquisti', mrpNet ? 'nette' : 'lorde'],
    [],
    ['Codice', 'Da produrre', 'U.M.', 'Quantità', 'Serve per', 'Fattibile', 'Margine'],
  ];
  d.righe.forEach(({ l, it, f }) => piano.push([it ? it.code : '?', it ? it.name : 'articolo mancante', it ? (it.uom || '') : '',
    q(l.qty), fmtDateIt(l.dueDate), f ? fmtDateIt(f.fattibile) : '', mrpMargineTesto(f)]));
  piano.push([], ['Riepilogo'],
    [`Totale acquisti (${cur()})`, eur(d.totale)], ['Articoli da comprare', d.buy.length],
    ['Fornitori coinvolti', d.fornitori], ['Parti da fabbricare', d.make.length]);
  if (d.fasi.length) piano.push([`Conto lavoro (${cur()})`, eur(d.totaleCl)]);
  if (d.risparmio > 0) piano.push([`Risparmio possibile cambiando fornitore (${cur()})`, eur(d.risparmio)]);
  if (d.exp.cycle) piano.push([], ['Attenzione: riferimento ciclico nelle distinte, il fabbisogno è troncato su quel ramo']);

  const colPrezzo = `Prezzo (${cur()}/U.M.)`, colImporto = `Importo (${cur()})`;
  const date = ['Serve per', 'Ordinare entro', 'Giorni consegna'];
  const acquisti = [mrpNet
    ? ['Codice', 'Articolo', 'Fornitore', ...date, 'U.M.', 'Lordo', 'Esistente', 'Scorta minima', 'Impegnato', 'Libero', 'In arrivo', 'Da comprare', colPrezzo, colImporto, 'Note']
    : ['Codice', 'Articolo', 'Fornitore', ...date, 'U.M.', 'Quantità', colPrezzo, colImporto, 'Note']];
  d.buy.forEach(r => {
    const testa = [r.item.code, r.item.name, supplierName(r.supplierId) || '', fmtDateIt(r.due), fmtDateIt(r.orderBy), r.leadDays || '', r.uom];
    const coda = [+r.price.toFixed(4), eur(r.amount), mrpBuyNoteTesto(r)];
    acquisti.push(mrpNet
      ? testa.concat([q(r.qty), q(r.onHand), q(r.safety), q(r.committed), r.committed > 0 ? q(r.libero) : '', q(r.incoming), q(r.qtyOrder)], coda)
      : testa.concat([q(r.qty)], coda));
  });
  acquisti.push([]);
  const rigaTotale = new Array(acquisti[0].length).fill('');
  rigaTotale[1] = 'TOTALE';
  rigaTotale[rigaTotale.length - 2] = eur(d.totale);
  acquisti.push(rigaTotale);

  // Foglio a sé, e non righe in coda agli acquisti: le colonne sono diverse
  // (una fase ha una parte, un centro e delle ore) e mescolarle produrrebbe un
  // foglio pieno di celle vuote che nessuno può filtrare.
  const contoLavoro = [['Fase', 'Lavorazione', 'Codice parte', 'Parte', 'Terzista', 'Serve per',
    'Giorni', 'Ordinare entro', 'Quantità', 'U.M.', 'Ore totali', `Prezzo/pz (${cur()})`, `Importo (${cur()})`, 'Note']];
  d.fasi.forEach(r => contoLavoro.push([r.phaseNo, r.wcName, r.item.code, r.item.name,
    supplierName(r.supplierId) || '', fmtDateIt(r.due), r.leadDays, fmtDateIt(r.orderBy),
    q(r.qty), r.uom, +r.hours.toFixed(2), +r.price.toFixed(4), eur(r.amount), mrpPhaseNoteTesto(r)]));
  if (d.fasi.length) contoLavoro.push([], ['', 'TOTALE', '', '', '', '', '', '', '', '',
    +d.fasi.reduce((s, r) => s + r.hours, 0).toFixed(2), '', eur(d.totaleCl), '']);

  const produzione = [['Codice', 'Parte', 'U.M.', 'Quantità', 'Serve per', 'Lancio entro', 'Fatti', 'Restano',
    `Costo unitario (${cur()}/U.M.)`, `Importo (${cur()})`, 'Note']];
  d.make.forEach(m => {
    const e = m.e;
    produzione.push([e.item.code, e.item.name, e.item.uom || '', q(e.qty), fmtDateIt(e.due),
      e.start && e.due && e.start < e.due ? fmtDateIt(e.start) : '', q(m.fatti), q(Math.max(0, m.resta)),
      +m.costo.toFixed(4), eur(m.costo * e.qty), mrpMakeNoteTesto(m)]);
  });
  if (d.make.length) produzione.push([], ['', 'TOTALE', '', '', '', '', '', '', '', eur(d.totaleMake), '']);

  const magazzino = [['Codice', 'Parte', 'U.M.', 'Presi', 'Esistente']];
  d.stock.forEach(e => magazzino.push([e.item.code, e.item.name, e.item.uom || '', q(e.qty), q(onHandOf(e.item.id))]));
  const montaggio = [['Codice', 'Assieme', 'Quantità', 'Inizio montaggio', 'Fine montaggio', 'Componenti', 'Montati', 'Restano']];
  d.asm.forEach(a => montaggio.push([a.e.item.code, a.e.item.name, q(a.e.qty),
    a.e.start && a.e.due && a.e.start < a.e.due ? fmtDateIt(a.e.start) : '', fmtDateIt(a.e.due),
    a.nComp, q(a.fatti), q(Math.max(0, a.resta))]));

  if (!requireXlsx()) return;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(piano), 'Piano');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(acquisti), 'Acquisti');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(contoLavoro), 'Conto lavoro');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(produzione), 'Produzione');
  if (d.stock.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(magazzino), 'Dal magazzino');
  if (d.asm.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(montaggio), 'Da montare');
  XLSX.writeFile(wb, 'Fabbisogno_' + nomeFileSicuro(p.number, 'piano') + '.xlsx');
  showToast('Excel esportato');
}
function exportMrpPDF(id) {
  const p = getPlan(id); if (!p) return;
  const d = mrpExportData(p);
  const jsPDF = requirePdf(); if (!jsPDF) return;
  // Orizzontale: con le date e le note le colonne non stanno in verticale.
  const doc = new jsPDF({ orientation: 'landscape' });
  const qu = (n, u) => (fmtQtyIt(n) + ' ' + (u || '')).trim();
  const dt = v => v ? fmtDateIt(v) : '—';
  const stile = colore => ({ styles: { fontSize: 7.5 }, headStyles: { fillColor: colore } });
  doc.setFontSize(15); doc.text(`Fabbisogno materiali — ${p.number}${p.active === false ? ' (chiuso)' : ''}`, 14, 16);
  doc.setFontSize(10); doc.setTextColor(120);
  const testata = [p.title || '', 'Data: ' + (p.date ? fmtDateIt(p.date) : new Date().toLocaleDateString('it-IT')),
    p.dueDate ? 'Consegna: ' + fmtDateIt(p.dueDate) : '', d.commessa ? 'Commessa: ' + d.commessa : ''].filter(Boolean).join('   ');
  doc.text(testata, 14, 23);
  let y = 28;
  if (p.notes) { doc.text('Note: ' + p.notes, 14, 28); y = 33; }
  const riep = [`Totale acquisti ${fmtN(d.totale)}`, `${d.buy.length} articoli da comprare`, `${d.fornitori} fornitori`,
    `${d.make.length} parti da fabbricare`, d.fasi.length ? `Conto lavoro ${fmtN(d.totaleCl)}` : ''].filter(Boolean).join('  ·  ');
  doc.text(riep, 14, y); y += 5;
  doc.setTextColor(0);
  doc.autoTable(Object.assign({
    startY: y, head: [['Codice', 'Da produrre', 'Q.tà', 'U.M.', 'Serve per', 'Fattibile', 'Margine']],
    body: d.righe.map(({ l, it, f }) => [it ? it.code : '?', it ? it.name : '⚠ mancante', fmtQtyIt(l.qty), it ? (it.uom || '') : '',
      dt(l.dueDate), f && f.fattibile ? fmtDateIt(f.fattibile) : '—', mrpMargineTesto(f) || '—']),
  }, stile([58, 123, 232])));
  // Nel netto le colonne che spiegano il numero ci sono anche qui: chi riceve
  // il foglio deve poter rifare il conto senza tornare all'app.
  const testaBuy = ['Codice', mrpNet ? 'Da acquistare (netto)' : 'Da acquistare', 'Fornitore', 'Serve per', 'Ordinare entro']
    .concat(mrpNet ? ['Lordo', 'Esistente', 'Impegnato', 'In arrivo', 'Da comprare'] : ['Q.tà'], ['Prezzo', 'Importo', 'Note']);
  const righe = d.buy.map(r => [r.item.code, r.item.name, supplierName(r.supplierId) || '—', dt(r.due),
    dt(r.orderBy) + (r.leadDays ? ` (${r.leadDays} gg)` : '')]
    .concat(mrpNet ? [qu(r.qty, r.uom), qu(r.onHand, r.uom), r.committed > 0 ? qu(r.committed, r.uom) : '—', qu(r.incoming, r.uom), qu(r.qtyOrder, r.uom)] : [qu(r.qtyOrder, r.uom)],
      [fmtN(r.price) + (r.uom ? '/' + r.uom : ''), fmtN(r.amount), mrpBuyNoteTesto(r)]));
  const totBuy = new Array(testaBuy.length).fill('');
  totBuy[1] = 'TOTALE'; totBuy[testaBuy.length - 2] = fmtN(d.totale);
  righe.push(totBuy);
  doc.autoTable(Object.assign({ startY: doc.lastAutoTable.finalY + 8, head: [testaBuy], body: righe }, stile([58, 123, 232])));
  if (d.fasi.length) {
    const righeCl = d.fasi.map(r => [String(r.phaseNo), r.wcName, r.item.code, r.item.name,
      supplierName(r.supplierId) || '—', dt(r.due), dt(r.orderBy) + (r.leadDays ? ` (${r.leadDays} gg)` : ''),
      qu(r.qty, r.uom), r.hours ? fmtQtyIt(r.hours) : '—', fmtN(r.price), fmtN(r.amount), mrpPhaseNoteTesto(r)]);
    righeCl.push(['', 'TOTALE', '', '', '', '', '', '', fmtQtyIt(d.fasi.reduce((s, r) => s + r.hours, 0)), '', fmtN(d.totaleCl), '']);
    doc.autoTable(Object.assign({
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Fase', 'Da far lavorare fuori', 'Codice', 'Parte', 'Terzista', 'Serve per', 'Ordinare entro', 'Q.tà', 'Ore tot.', 'Prezzo/pz', 'Importo', 'Note']],
      body: righeCl,
    }, stile([46, 164, 121])));
  }
  if (d.make.length) {
    const righeMake = d.make.map(m => {
      const e = m.e, u = e.item.uom || '';
      return [e.item.code, e.item.name, qu(e.qty, u),
        dt(e.due) + (e.start && e.due && e.start < e.due ? ` (lancio ${fmtDateIt(e.start)})` : ''),
        m.fatti > 0 ? fmtQtyIt(m.fatti) : '—', m.resta > 0 ? fmtQtyIt(m.resta) : 'finita',
        fmtN(m.costo) + (u ? '/' + u : ''), fmtN(m.costo * e.qty), mrpMakeNoteTesto(m)];
    });
    righeMake.push(['', 'TOTALE', '', '', '', '', '', fmtN(d.totaleMake), '']);
    doc.autoTable(Object.assign({
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Codice', 'Da fabbricare', 'Q.tà', 'Serve per', 'Fatti', 'Restano', 'Costo un.', 'Importo', 'Note']],
      body: righeMake,
    }, stile([155, 109, 255])));
  }
  if (d.stock.length) {
    doc.autoTable(Object.assign({
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Codice', 'Dal magazzino', 'Presi', 'Esistente']],
      body: d.stock.map(e => [e.item.code, e.item.name, qu(e.qty, e.item.uom), qu(onHandOf(e.item.id), e.item.uom)]),
    }, stile([120, 120, 120])));
  }
  if (d.asm.length) {
    doc.autoTable(Object.assign({
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Codice', 'Da montare', 'Q.tà', 'Montaggio', 'Componenti', 'Montati', 'Restano']],
      body: d.asm.map(a => [a.e.item.code, a.e.item.name, fmtQtyIt(a.e.qty),
        a.e.start && a.e.due && a.e.start < a.e.due ? `${fmtDateIt(a.e.start)} – ${fmtDateIt(a.e.due)}` : dt(a.e.due),
        String(a.nComp), a.fatti > 0 ? fmtQtyIt(a.fatti) : '—', a.resta > 0 ? fmtQtyIt(a.resta) : 'montati']),
    }, stile([217, 136, 30])));
  }
  doc.save('Fabbisogno_' + nomeFileSicuro(p.number, 'piano') + '.pdf');
  showToast('PDF esportato');
}
