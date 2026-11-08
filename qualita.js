// ═══════════════════════════════════════════════════════════
//  BOMTRACK — qualita.js  (modulo Qualità: il collaudo in entrata)
// ═══════════════════════════════════════════════════════════
// Il controllo della merce che arriva, agganciato al ricevimento che l'app
// registra già.
//
// ── Il problema ──
// Oggi scrivere «ricevuto 50» carica il magazzino, e da quel momento quei 50
// pezzi si possono prelevare, consumare, mandare a un terzista. Nessuno chiede
// se qualcuno li ha guardati. In un'officina che lavora su commessa un lotto
// fuori tolleranza scoperto al montaggio costa il montaggio; scoperto al
// bancale costa una telefonata al fornitore.
//
// ── Come funziona ──
// Un articolo che sta in un **piano di controllo** chiede il controllo in
// entrata. Quando arriva merce di quell'articolo — ricevimento di un ordine fornitore,
// o rientro dei pezzi dall'ultima fase di un ordine di lavoro — nasce da solo
// un **collaudo**, e quella quantità resta **in collaudo**: è a scaffale, si
// vede, ma non è **libera**. Il collaudo si chiude con un esito, e l'esito è il
// solo gesto che la libera:
//
//   accettato   la quantità diventa libera, e basta
//   in deroga   come accettato, ma resta scritto che è passata con riserva
//   respinto    la merce torna indietro: su un ordine fornitore il ricevuto
//               scende (la riga torna ad avere un residuo e il fornitore deve
//               consegnare di nuovo), su un ordine di lavoro i pezzi escono
//               verso il terzista che li ha lavorati
//
// ── La scelta di fondo: una trattenuta, non un magazzino a parte ──
// La merce in collaudo **resta nell'esistente**. Pagata è pagata, e sullo
// scaffale c'è: toglierla dall'esistente vorrebbe dire due giacenze da tenere
// d'accordo, due valori di magazzino e un inventario che non torna. Quello che
// cambia è il **libero**, che è già la colonna che dice «di quanto posso
// davvero disporre»: da lì il collaudo si sottrae, come l'impegnato. Per la
// stessa ragione il fabbisogno continua a contarla — è merce arrivata, e
// ricomprarla perché è in attesa di un esito sarebbe il difetto peggiore di
// quello che si vuole curare.
//
// ── Il resto del modulo ──
// Qui c'è il giro di una cosa sola — la merce non si usa prima che qualcuno
// l'abbia guardata. Il resto si appoggia a questo, ciascuno nel suo file:
//   qualita-piani.js      che cosa misurare e su quanti pezzi (fase 2)
//   qualita-nc.js         le non conformità con le loro azioni (fase 3)
//   qualita-fornitori.js  la valutazione dei fornitori (fase 4)

// ─── Il modulo è acceso? ───
function qcAttivo() { return typeof moduloAttivo === 'function' && moduloAttivo('qualita'); }

// ─── Chi si controlla ───
// Dalla 0.149.0 lo decide **solo il piano di controllo** (qualita-piani.js):
// un codice che sta in un piano si collauda, uno che non sta in nessun piano
// entra libero. Prima c'erano tre posti dove dirlo — l'articolo (sì, no, come
// la famiglia), la macrofamiglia e la sottofamiglia — più il piano, e la
// risposta usciva da una gerarchia che nessuno sapeva leggere a colpo
// d'occhio. Ora la domanda «questo si collauda?» ha una risposta sola, ed è
// scritta dove sta anche che cosa si misura.
//
// I vecchi campi (`qc` e `qcCert` su articoli, famiglie e sottofamiglie)
// restano nell'archivio ma non decidono più niente: servono solo al Riepilogo
// per dire chi ha cambiato comportamento (qcVecchieScelte), e il certificato
// dell'articolo ai collaudi nati prima, che lo aspettavano già.
function qcRichiesto(it) {
  if (!qcAttivo() || !it || !hasStock(it)) return false;
  return typeof qcPianoPer === 'function' && !!qcPianoPer(it);
}
// Che cosa avrebbe risposto la regola di prima: serve solo a trovare chi, col
// passaggio al piano, ha cambiato comportamento.
function qcVecchiaScelta(it) {
  if (!it) return false;
  if (it.qc === 'si') return true;
  if (it.qc === 'no') return false;
  const f = it.familyId && typeof getFamily === 'function' ? getFamily(it.familyId) : null;
  if (!f) return false;
  const sub = (f.subs || []).find(s => s.id === it.subFamilyId);
  if (sub && (sub.qc === 'si' || sub.qc === 'no')) return sub.qc === 'si';
  return f.qc === 'si';
}
// Gli articoli per cui il piano dice il contrario di quello che si era
// scelto prima: `fuori` si collaudavano e non stanno in nessun piano (ora
// entrano liberi), `dentro` erano segnati «No» ma stanno in un piano (ora si
// collaudano). Solo chi aveva una scelta scritta: chi non l'aveva non cambia.
function qcVecchieScelte() {
  const out = { fuori: [], dentro: [] };
  if (!qcAttivo()) return out;
  (db.items || []).forEach(it => {
    if (!it || it.obsolete || !hasStock(it)) return;
    const prima = qcVecchiaScelta(it), ora = qcRichiesto(it);
    if (prima && !ora) out.fuori.push(it);
    else if (!prima && ora && it.qc === 'no') out.dentro.push(it);
  });
  const per = (a, b) => String(a.code || '').localeCompare(String(b.code || ''));
  out.fuori.sort(per); out.dentro.sort(per);
  return out;
}
// La finestra del Riepilogo: i due elenchi, la strada per i piani e la
// conferma. Confermare toglie le vecchie scelte (non i certificati, che i
// collaudi già nati possono ancora aspettare): l'avviso così non torna.
function qcVecchieScelteModal() {
  const v = qcVecchieScelte();
  const riga = it => `<tr><td class="mono">${esc(it.code || '')}</td><td>${esc(it.name || '')}</td></tr>`;
  const tabella = (l, titolo, testo) => l.length ? `<div class="qc-card">
      <h3>${titolo} <span class="qc-conta">${l.length}</span></h3>
      <p class="empty-text qc-hint" style="padding:0 0 8px">${testo}</p>
      <div class="table-wrap"><table class="qc-table"><thead><tr><th scope="col">Codice</th><th scope="col">Descrizione</th></tr></thead>
      <tbody>${l.map(riga).join('')}</tbody></table></div></div>` : '';
  openModal(`<h3>${ico('ruler', 'tinted pill', '')} Il collaudo ora lo decide il piano</h3>
    <p class="empty-text" style="text-align:left;padding:0">Dalla 0.149.0 si collauda all'arrivo solo un codice che sta in un <strong>piano di controllo</strong>. Questi articoli avevano una scelta scritta nella scheda o nella famiglia che ora non conta più.</p>
    ${tabella(v.fuori, 'Prima si collaudavano, ora entrano liberi', 'Non stanno in nessun piano. Se devono continuare a collaudarsi, aggiungili a un piano.')}
    ${tabella(v.dentro, 'Prima erano esclusi, ora si collaudano', 'Erano segnati «No» ma stanno in un piano. Se non vanno collaudati, toglili dal piano.')}
    ${!v.fuori.length && !v.dentro.length ? '<p class="empty-text">Nessun articolo da rivedere.</p>' : ''}
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button>
      <button class="btn-outline" onclick="closeModal();setView('pianiqc')">${ico('ruler', 'tinted', '')} Piani di controllo</button>
      ${canWrite('manage') && canWrite('catalog') ? `<button class="add-btn-sm" onclick="qcVecchieScelteConferma()">Va bene così</button>` : ''}</div>`, true);
}
// Tocca articoli e famiglie: serve chi può scrivere tutte e due.
function qcVecchieScelteConferma() {
  if (!roleGuard('manage') || !roleGuard('catalog')) return;
  let n = 0;
  (db.items || []).forEach(it => { if (it && 'qc' in it) { delete it.qc; touch(it); n++; } });
  (db.families || []).forEach(f => {
    let cambiata = false;
    if (f && 'qc' in f) { delete f.qc; cambiata = true; }
    (f && f.subs || []).forEach(s => { if ('qc' in s) { delete s.qc; touch(s); cambiata = true; } });
    if (cambiata) { touch(f); n++; }
  });
  saveDB(); closeModal();
  if (typeof renderHome === 'function' && typeof activeView !== 'undefined' && activeView === 'home') renderHome();
  savedToast(n ? 'Vecchie scelte tolte: decide il piano' : 'Niente da togliere');
}
// Il certificato scritto sull'articolo o sulla famiglia prima della 0.149.0.
// Non si imposta più: lo leggono solo i collaudi nati allora, che lo
// aspettano ancora.
function qcCertificatoVecchio(it) {
  if (!it) return '';
  if (it.qcCert) return String(it.qcCert);
  if (!it.familyId || typeof getFamily !== 'function') return '';
  const f = getFamily(it.familyId);
  return (f && f.qcCert) ? String(f.qcCert) : '';
}

// ─── Nella scheda articolo ───
// Nessuna scelta: il riquadro dice in quale piano sta il codice, o che non sta
// in nessuno, e porta al piano. Modulo spento: stringa vuota, e la scheda
// resta quella di prima.
function qcItemCampiHtml(it) {
  if (!qcAttivo()) return '';
  const testa = '<div class="it-sec">Controllo in entrata</div>';
  if (!it) return testa + `<p class="empty-text it-hint">Se si collauda all'arrivo lo decide il <strong>piano di controllo</strong>: dopo aver creato l'articolo, aggiungilo a un piano.</p>`;
  const p = typeof qcPianoPer === 'function' ? qcPianoPer(it) : null;
  const vai = (azione, testo) => `<div class="qc-item-azioni"><button type="button" class="btn-outline" onclick="${azione}">${ico('ruler', 'tinted', '')} ${testo}</button></div>`;
  if (!p) return testa + `<div class="qc-card qc-item" id="fld-qc">
      <p class="qc-item-testa"><span class="doc-badge st-bozza">Nessun piano</span> <strong>Non si collauda all'arrivo</strong></p>
      <p class="empty-text qc-hint">Il codice non è in nessun piano di controllo: quando arriva entra subito come merce <strong>libera</strong>. Per farlo collaudare, aggiungilo a un piano.</p>
      ${vai("closeModal();setView('pianiqc')", 'Piani di controllo')}
    </div>`;
  const n = qcPianoCodici(p).length, car = (p.characteristics || []).length;
  const campione = p.sampling === 'aql' ? `campione AQL ${esc(fmtQtyIt(p.aql))} (ISO 2859-1, livello II)`
    : esc((QC_CAMPIONI[p.sampling] || QC_CAMPIONI.tutto).toLowerCase());
  return testa + `<div class="qc-card qc-item" id="fld-qc">
      <p class="qc-item-testa"><span class="doc-badge st-attivo">Si collauda</span> <strong>${esc(p.name || '(piano senza nome)')}</strong></p>
      <p class="empty-text qc-hint">${car} caratteristic${car === 1 ? 'a' : 'he'} da verificare · ${campione}${p.cert ? ` · certificato <strong>${esc(p.cert)}</strong>` : ''} · il piano vale per ${n} codic${n === 1 ? 'e' : 'i'}.</p>
      <p class="empty-text qc-hint">Ogni ricevimento di questo articolo — e ogni rientro dal terzista — apre un <strong>collaudo</strong>: la merce resta a scaffale ma <strong>non è libera</strong> finché qualcuno non registra l'esito. Per non collaudarlo più, toglilo dal piano.</p>
      ${vai(`closeModal();pqApriDaAltrove('${p.id}')`, 'Apri il piano')}
    </div>`;
}

// ─── I collaudi ───
const QC_ESITI = { accettato: 'Accettato', deroga: 'Accettato in deroga', respinto: 'Respinto' };
const QC_DESTINI = {
  sostituzione: 'Reso al fornitore, da sostituire',
  accredito: 'Reso al fornitore, a credito',
  scarto: 'Tenuto e rottamato',
  // Dalla 0.144.0, per i pezzi fatti in casa (qualita-produzione.js).
  rilavorazione: 'Da rilavorare, restano fermi',
};
// Le destinazioni che hanno senso per ogni origine: un ODP non ha un
// fornitore a cui rendere, un terzista non accredita la nostra merce.
function qcDestiniDi(source) {
  if (source === 'odp') return ['rilavorazione', 'scarto'];
  if (source === 'odl') return ['sostituzione', 'scarto'];
  return ['sostituzione', 'accredito', 'scarto'];
}
function qcTutti() { return (db.inspections || []).filter(x => x && x.active !== false); }
function qcGet(id) { return qcTutti().find(x => x.id === id) || null; }
function qcAperti() { return qcTutti().filter(x => x.status === 'aperto'); }

// La quantità di un collaudo **nell'unità di gestione**. La riga di un ordine
// può essere nell'unità del fornitore (120 kg che a magazzino sono 15 m):
// senza questa conversione la trattenuta sarebbe sbagliata di un fattore, e
// il libero con lei.
function qcQtaGestione(insp, it) {
  const q = Number(insp && insp.qty) || 0;
  const art = it || (typeof getItem === 'function' ? getItem(insp && insp.itemId) : null);
  return art && typeof fromAltUom === 'function' ? fromAltUom(art, q, insp.uom) : q;
}
// Tutto in una passata: l'indice delle giacenze lo chiede una volta sola per
// tutti gli articoli, invece di rileggere i collaudi per ogni riga.
function qcIndice() {
  const idx = new Map();
  if (!qcAttivo()) return idx;
  qcAperti().forEach(x => {
    if (!x.itemId) return;
    idx.set(x.itemId, (idx.get(x.itemId) || 0) + qcQtaGestione(x));
  });
  // I pezzi respinti da rilavorare restano fermi anche a collaudo chiuso.
  // Meno quelli che un ODP di ripresa ha già prelevato (qcFermi).
  qcTutti().filter(x => x.status !== 'aperto' && x.itemId && Number(x.qtyHeld) > 0.000001).forEach(x => {
    const fermi = typeof qcFermi === 'function' ? qcFermi(x) : Number(x.qtyHeld) || 0;
    if (fermi > 0.000001) idx.set(x.itemId, (idx.get(x.itemId) || 0) + qcQtaGestione({ qty: fermi, uom: x.uom, itemId: x.itemId }));
  });
  return idx;
}

// ─── Nascere ───
// `qty` è nell'unità in cui la merce è arrivata (quella della riga d'ordine per
// un ODA, quella dell'articolo per un rientro da conto lavoro).
// Il numero è progressivo per anno come gli altri documenti. Non lo riserva il
// server: un collaudo non esce dall'azienda, e due magazzinieri che ricevono
// nello stesso minuto possono al massimo dare lo stesso numero a due collaudi
// diversi — il Controllo dati lo dice, come per le altre serie.
function qcCrea(dati) {
  const d = dati || {};
  const it = getItem(d.itemId);
  if (!it || !qcRichiesto(it)) return null;
  const qty = Number(d.qty) || 0;
  if (!(qty > 0.000001)) return null;
  const rec = {
    id: gid(), number: numeroProgressivo('COL'),
    source: d.source === 'odl' || d.source === 'odp' ? d.source : 'oda',
    orderId: d.orderId || null, lineId: d.lineId || null,
    itemId: it.id, qty, uom: d.uom || itemUom(it),
    supplierId: d.supplierId || null,
    date: typeof oggiISO === 'function' ? oggiISO() : nowISO().slice(0, 10),
    // Il certificato da aspettare lo dice il piano (qcApplicaPiano).
    ddt: '', supplierLot: '', cert: '',
    status: 'aperto', esito: '', qtyOk: 0, qtyKo: 0, destino: qcDestiniDi(d.source)[0],
    note: '', closedAt: null, active: true,
  };
  // Dall'ODP: la dichiarazione che l'ha aperto e, fino a prova contraria,
  // l'ultima fase come responsabile di un difetto.
  if (rec.source === 'odp') { rec.declId = d.declId || null; rec.respPhase = d.lineId || ''; rec.qtyHeld = 0; rec.cert = ''; }
  // Il piano di controllo, se c'è: caratteristiche, campione, salto lotti.
  if (typeof qcApplicaPiano === 'function') qcApplicaPiano(rec, it);
  const nuovo = Store.insert('inspections', rec);
  // Il cartellino da attaccare al bancale, se in Gestione → Qualità si è
  // chiesto di proporlo al ricevimento (qualita-qr.js).
  if (nuovo && typeof qcProponiCartellino === 'function') qcProponiCartellino(nuovo);
  return nuovo;
}
// Dopo un ricevimento su una riga d'ordine fornitore. `delta` è quanto è
// entrato adesso: un ricevuto corretto in giù (una registrazione sbagliata)
// non apre niente.
function qcDopoRicevimento(doc, l, delta) {
  if (!qcAttivo() || !doc || !l || !l.itemId) return null;
  const q = Number(delta) || 0;
  if (!(q > 0.000001)) return null;
  return qcCrea({ source: 'oda', orderId: doc.id, lineId: l.id, itemId: l.itemId,
    qty: q, uom: l.uom || '', supplierId: doc.supplierId || null });
}
// Dopo il rientro dei pezzi dall'ultima fase di un ordine di lavoro. Qui
// l'articolo è la **parte**, non il materiale: è quello che è tornato.
function qcDopoRientro(odl, l, part, qty) {
  if (!qcAttivo() || !odl || !part) return null;
  return qcCrea({ source: 'odl', orderId: odl.id, lineId: l ? l.id : null, itemId: part.id,
    qty, uom: itemUom(part), supplierId: odl.supplierId || null });
}

// ─── Chiudersi ───
// La guardia è `docs` **oppure** `shop`: il collaudo lo registra chi sta in
// magazzino davanti alla merce, e un esito respinto riscrive il ricevuto di un
// ordine — cioè le stesse tabelle che l'officina già tocca.
function qcGuard() {
  if (typeof roleGuardShop === 'function') return roleGuardShop('docs');
  return roleGuard('docs');
}
// Esito. `qtyKo` è quanto si respinge, nell'unità del collaudo; il resto è
// accettato. Ritorna vero se ha registrato.
function qcRegistraEsito(id, dati) {
  if (!qcGuard()) return false;
  const insp = qcGet(id); if (!insp) return false;
  if (insp.status !== 'aperto') { showToast('Questo collaudo è già chiuso', 'error'); return false; }
  const d = dati || {};
  const tot = Number(insp.qty) || 0;
  const ko = Math.min(tot, Math.max(0, Number(d.qtyKo) || 0));
  const ok = arrotondaQta(tot - ko);
  const esito = QC_ESITI[d.esito] ? d.esito : (ko > 0.000001 ? 'respinto' : 'accettato');
  // Un «accettato» con dei respinti sarebbe una contraddizione scritta
  // nell'archivio: l'esito lo decide la quantità, la scelta dice solo se quel
  // che entra entra pulito o con riserva.
  if (esito !== 'respinto' && ko > 0.000001) { showToast('Con dei pezzi respinti l\'esito è «respinto»', 'error'); return false; }
  if (esito === 'respinto' && !(ko > 0.000001)) { showToast('Un respinto senza pezzi respinti non è un respinto', 'error'); return false; }
  // Certificato richiesto e non arrivato: la merce può entrare solo con la
  // riserva scritta (in deroga) o tornare indietro. Accettarla «pulita»
  // vorrebbe dire dichiarare conforme una cosa di cui manca la prova.
  if (esito === 'accettato' && qcCertificatoRichiesto(insp) && insp.cert !== 'ok') {
    showToast('Manca il certificato: si può accettare solo in deroga', 'error'); return false;
  }
  const ammessi = qcDestiniDi(insp.source);
  const destino = d.destino ? d.destino : ammessi[0];
  // Il terzista lavora roba nostra: non c'è niente da accreditare. E un ODP
  // non ha un fornitore a cui rendere: si rilavora o si rottama.
  if (ko > 0.000001 && !ammessi.includes(destino)) {
    showToast(insp.source === 'odp' ? 'I pezzi fatti in casa si rilavorano o si rottamano'
      : insp.source === 'odl' ? 'Da un ordine di lavoro il reso è solo da rifare o da rottamare' : 'Destinazione non valida', 'error');
    return false;
  }
  const note = String(d.note || '').trim();
  // Prima la merce, poi la chiusura: se il reso non si può registrare il
  // collaudo resta aperto e la trattenuta con lui.
  if (ko > 0.000001 && !qcRespingi(insp, ko, destino, note)) return false;
  const patch = { status: 'chiuso', esito, qtyOk: ok, qtyKo: arrotondaQta(ko),
    destino: ko > 0.000001 ? destino : '', closedAt: nowISO() };
  // Dall'ODP (dalla 0.144.0): la fase che ha generato il difetto decide chi ne
  // risponde. Il terzista di quella fase entra nella valutazione, una fase
  // interna no. I pezzi da rilavorare restano fermi.
  if (insp.source === 'odp') {
    const o = typeof getOdp === 'function' ? getOdp(insp.orderId) : null;
    if (esito !== 'accettato') {
      const resp = d.respPhase || insp.respPhase || QC_RESP_ND;
      patch.respPhase = resp;
      patch.supplierId = qcRespFornitore(o, resp);
    }
    patch.qtyHeld = ko > 0.000001 && destino === 'rilavorazione' ? arrotondaQta(ko) : 0;
  }
  if (note) patch.note = note;
  Store.update('inspections', insp.id, patch);
  invalidateStock();
  showToast(`${insp.number}: ${QC_ESITI[esito]}${ko > 0.000001 ? ` · ${fmtQtyIt(ko)} ${insp.uom || ''}`.trimEnd() + ' respinti' : ''}`);
  // Un respinto o una deroga aprono la non conformità (qualita-nc.js): il
  // problema ha un numero e qualcuno che lo chiude.
  if (esito !== 'accettato' && typeof ncDaCollaudo === 'function') ncDaCollaudo(qcGet(insp.id));
  return true;
}
// Il certificato che questo collaudo aspetta: quello del piano. Un collaudo
// nato prima della 0.149.0 può aspettare quello che allora si scriveva
// sull'articolo o sulla famiglia, e lo trova ancora lì.
function qcCertificatoDi(insp) {
  if (!insp) return '';
  const dalPiano = typeof qcCertificatoPiano === 'function' ? qcCertificatoPiano(insp) : '';
  if (dalPiano) return dalPiano;
  if (!insp.cert) return '';
  const it = getItem(insp.itemId);
  return it ? qcCertificatoVecchio(it) : '';
}
function qcCertificatoRichiesto(insp) { return !!(insp && (insp.cert === 'atteso' || insp.cert === 'ok') && qcCertificatoDi(insp)); }
// La merce che torna indietro. Due strade, una per origine, e nessuna delle
// due inventa un movimento nuovo:
//  - ordine fornitore: **scende il ricevuto**. È la stessa correzione che si
//    farebbe a mano scrivendo un numero più basso nella colonna Ricevuto, con
//    tutto quello che ne segue già scritto altrove — la giacenza cala, la riga
//    torna ad avere un residuo, l'ordine torna «Parziale», la merce torna «in
//    arrivo» e il fabbisogno la aspetta di nuovo.
//  - ordine di lavoro: i pezzi **escono verso il terzista** che li ha
//    lavorati, con un'uscita a conto lavoro, e i rientrati tornano indietro.
//    Da lì in poi il prospetto «Presso terzi» li racconta come prima.
// Tenuto e rottamato: la merce resta fuori dal libero per sempre, quindi esce
// come consumo. Non è un reso — il fornitore non la rivede — ma nemmeno roba
// che si può montare.
function qcRespingi(insp, ko, destino, note) {
  const it = getItem(insp.itemId);
  const testo = note || `Respinto al collaudo ${insp.number}`;
  if (destino === 'scarto') {
    if (!it || !hasStock(it)) return true;
    addMovement(insp.itemId, 'scarico', -qcQtaGestione(insp, it) * (ko / (Number(insp.qty) || 1)), testo,
      { orderId: insp.orderId || null, lineId: insp.lineId || null });
    return true;
  }
  // Da rilavorare: la merce resta dov'è, ferma (qtyHeld, nel patch di chi chiama).
  if (insp.source === 'odp') return true;
  if (insp.source === 'odl') {
    const o = typeof getOdl === 'function' ? getOdl(insp.orderId) : null;
    if (!o) { showToast('Ordine di lavoro non trovato: il collaudo resta aperto', 'error'); return false; }
    const l = (o.lines || []).find(x => x.id === insp.lineId) || null;
    if (it && hasStock(it)) {
      addMovement(insp.itemId, 'clOut', -ko, testo, { orderId: o.id, lineId: insp.lineId || null, supplierId: o.supplierId || null });
    }
    // I pezzi non sono più rientrati: l'ordine torna ad aspettarli.
    if (l && typeof odlAncore === 'function' && typeof odlSpostaRientrati === 'function') {
      odlSpostaRientrati(o, odlAncore(o, l).sorelle, -ko);
    }
    if (typeof ordAutoStatus === 'function') ordAutoStatus(o);
    touch(o); saveDB();
    return true;
  }
  const o = typeof getOrder === 'function' ? getOrder(insp.orderId) : null;
  if (!o) { showToast('Ordine non trovato: il collaudo resta aperto', 'error'); return false; }
  const l = (o.lines || []).find(x => x.id === insp.lineId);
  if (!l) { showToast('Riga d\'ordine non trovata: il collaudo resta aperto', 'error'); return false; }
  // A credito (dalla 0.143.0) il fornitore non li rimanda: scende anche
  // l'ordinato, così la riga non resta aperta ad aspettarli e il fabbisogno,
  // che non li vede più in arrivo, torna scoperto e si riordina. È una
  // modifica alla riga, quindi la fa chi scrive gli ordini: l'officina sul
  // server cambia solo lo stato (→ MANUALE, archivio condiviso).
  const accredito = destino === 'accredito';
  if (accredito && !canWrite('docs')) {
    showToast('Il reso a credito riduce l\'ordine: lo registra l\'Ufficio acquisti', 'error'); return false;
  }
  registraRicevuto('orders', o, l, Math.max(0, arrotondaQta((Number(l.received) || 0) - ko)));
  if (accredito) l.qty = Math.max(0, arrotondaQta((Number(l.qty) || 0) - ko));
  if (typeof ordAutoStatus === 'function') ordAutoStatus(o);
  touch(o); saveDB();
  return true;
}
// I dati dell'arrivo (DDT, lotto del fornitore, certificato) si scrivono
// mentre la merce è ancora lì, non alla chiusura.
function qcSetCampo(id, campo, valore) {
  if (!qcGuard()) return false;
  if (!['ddt', 'supplierLot', 'cert', 'note'].includes(campo)) return false;
  const insp = qcGet(id); if (!insp) return false;
  if (campo === 'cert' && valore !== 'ok' && valore !== 'atteso') return false;
  Store.update('inspections', id, { [campo]: String(valore == null ? '' : valore).trim() });
  return true;
}

// ─── Quando l'arrivo sparisce ───
// Un ordine eliminato toglie la sua merce dal magazzino (è la regola di
// sempre): il collaudo di quella merce non ha più niente da guardare, e
// lasciarlo aperto terrebbe trattenuto un libero che non esiste più.
function qcChiudiOrfani(orderId) {
  qcAperti().filter(x => x.orderId === orderId).forEach(x => {
    Store.update('inspections', x.id, { status: 'chiuso', esito: '', qtyOk: 0, qtyKo: 0, closedAt: nowISO(),
      note: (x.note ? x.note + ' · ' : '') + 'Chiuso: il documento d\'origine non c\'è più' });
  });
  invalidateStock();
}

// ─── Il contorno, per chi guarda ───
function qcOrdineNumero(insp) {
  if (!insp || !insp.orderId) return '';
  const o = insp.source === 'odl'
    ? (typeof getOdl === 'function' ? getOdl(insp.orderId) : null)
    : insp.source === 'odp' ? (typeof getOdp === 'function' ? getOdp(insp.orderId) : null)
      : (typeof getOrder === 'function' ? getOrder(insp.orderId) : null);
  return o ? (o.number || '') : '';
}
function qcBadge(insp) {
  if (!insp) return '';
  if (insp.status === 'aperto') return '<span class="doc-badge st-corso">Da collaudare</span>';
  if (insp.esito === 'accettato') return '<span class="doc-badge st-evaso">Accettato</span>';
  if (insp.esito === 'deroga') return '<span class="doc-badge st-parziale">In deroga</span>';
  if (insp.esito === 'respinto') return '<span class="doc-badge st-annullato">Respinto</span>';
  return '<span class="doc-badge st-bozza">Chiuso</span>';
}
// L'etichetta che l'ordine mostra sulla riga: dice se quella merce è ancora
// ferma, e quanto.
function qcEtichettaRiga(coll, doc, l) {
  if (!qcAttivo() || !doc || !l) return '';
  const righe = qcTutti().filter(x => x.orderId === doc.id && x.lineId === l.id);
  if (!righe.length) return '';
  const fermi = righe.filter(x => x.status === 'aperto');
  if (fermi.length) {
    const q = fermi.reduce((s, x) => s + (Number(x.qty) || 0), 0);
    return `<div class="qc-line-tag qc-open" title="In attesa di collaudo: non è merce libera">${ico('search', 'tinted', '')} in collaudo ${fmtQtyIt(q)} · ${esc(fermi[fermi.length - 1].number)}</div>`;
  }
  const ko = righe.filter(x => x.esito === 'respinto');
  if (ko.length) return `<div class="qc-line-tag qc-ko">${ico('warning', 'tinted', '')} respinto · ${esc(ko[ko.length - 1].number)}</div>`;
  return `<div class="qc-line-tag qc-ok">${ico('check', 'tinted', '')} collaudato · ${esc(righe[righe.length - 1].number)}</div>`;
}

// ═══════════════════════════════════════════════════════════
//  La vista
// ═══════════════════════════════════════════════════════════
let qcCurrentId = null;
let qcFiltro = { q: '', stato: 'aperto' };

function qcFiltrati() {
  const q = (qcFiltro.q || '').trim().toLowerCase();
  return qcTutti().filter(x => {
    if (qcFiltro.stato === 'aperto' && x.status !== 'aperto') return false;
    if (qcFiltro.stato === 'chiuso' && x.status === 'aperto') return false;
    if (qcFiltro.stato === 'respinto' && x.esito !== 'respinto') return false;
    if (!q) return true;
    const it = getItem(x.itemId);
    return [x.number, x.supplierLot, x.ddt, qcOrdineNumero(x), it && it.code, it && it.name, supplierName(x.supplierId)]
      .some(v => String(v || '').toLowerCase().includes(q));
  }).sort((a, b) => String(b.number || '').localeCompare(String(a.number || '')));
}
function qcSearchInput() { qcFiltro.q = val('qc-search'); ridisegnaCercando('qc-search', renderCollaudi); }
function qcStatoChange() { qcFiltro.stato = val('qc-stato'); renderCollaudi(); }
function qcApri(id) { qcCurrentId = id; renderCollaudi(); }
// Da un'altra vista (il Riepilogo, il QR): prima si arriva, poi si sceglie.
function qcApriDaAltrove(id) { qcCurrentId = id; setView('collaudi'); }
function qcChiudiScheda() { qcCurrentId = null; renderCollaudi(); }

function renderCollaudi() {
  const el = document.getElementById('view-collaudi'); if (!el) return;
  const righe = qcFiltrati();
  const corrente = qcCurrentId ? qcGet(qcCurrentId) : null;
  const aperti = qcAperti().length;
  el.innerHTML = worklistHtml({
    titolo: 'Collaudi', icona: 'search', listaId: 'qc-list',
    filtri: `<input type="text" class="search" id="qc-search" placeholder="Cerca collaudo, articolo, lotto…" value="${esc(qcFiltro.q)}" oninput="qcSearchInput()">
      <select id="qc-stato" onchange="qcStatoChange()">
        <option value="aperto" ${qcFiltro.stato === 'aperto' ? 'selected' : ''}>Da collaudare (${aperti})</option>
        <option value="" ${qcFiltro.stato === '' ? 'selected' : ''}>Tutti</option>
        <option value="chiuso" ${qcFiltro.stato === 'chiuso' ? 'selected' : ''}>Chiusi</option>
        <option value="respinto" ${qcFiltro.stato === 'respinto' ? 'selected' : ''}>Respinti</option>
      </select>`,
    righe: righe.length ? righe.map(x => {
      const it = getItem(x.itemId);
      return worklistRow({
        numero: x.number, badge: qcBadge(x), sel: corrente && corrente.id === x.id,
        titolo: it ? `${it.code} — ${it.name}` : '(articolo eliminato)',
        meta: `${esc(supplierName(x.supplierId) || '—')} · ${fmtQtyIt(x.qty)} ${esc(x.uom || '')} · ${esc(qcOrdineNumero(x) || '—')}`,
        azione: `qcApri('${x.id}')`, etichetta: `Apri il collaudo ${x.number}`,
      });
    }).join('') : `<p class="empty-text">Nessun collaudo${qcFiltro.stato === 'aperto' ? ' da fare' : ''}.</p>`,
    nota: worklistCount ? worklistCount(righe.length, qcTutti().length, 'collaudo', 'collaudi') : '',
    doc: corrente ? qcSchedaHtml(corrente) : '',
    vuoto: {
      titolo: 'Collaudo della merce in entrata',
      testo: 'Un collaudo nasce da solo quando arriva merce di un articolo da controllare: il ricevimento di un ordine fornitore, o i pezzi che rientrano dall\'ultima fase di un ordine di lavoro. Finché non ha un esito quella quantità è a scaffale ma <strong>non è libera</strong>: il magazzino la mostra nella colonna <em>In collaudo</em> e la toglie dal libero.',
    },
  });
  a11yFields(el);
}

function qcSchedaHtml(x) {
  const it = getItem(x.itemId);
  const u = x.uom || (it ? itemUom(it) : '');
  const cert = qcCertificatoDi(x);
  const scrivibile = x.status === 'aperto' && (typeof canWriteShop === 'function' ? canWriteShop('docs') : canWrite('docs'));
  const campo = (etichetta, chiave, placeholder) => `<div class="modal-field"><label>${esc(etichetta)}</label>
    <input value="${esc(x[chiave] || '')}" placeholder="${esc(placeholder || '')}" ${scrivibile ? '' : 'disabled'}
      onchange="qcSetCampo('${x.id}', '${chiave}', this.value)"></div>`;
  const dato = (etichetta, valore) => `<div class="modal-field"><label>${esc(etichetta)}</label><div class="qc-val">${valore}</div></div>`;
  const certCampo = !cert ? '' : `<div class="modal-field"><label>Certificato ${esc(cert)}</label>
    <select ${scrivibile ? '' : 'disabled'} onchange="qcSetCampo('${x.id}','cert',this.value);renderCollaudi()">
      <option value="atteso" ${x.cert !== 'ok' ? 'selected' : ''}>Non ancora arrivato</option>
      <option value="ok" ${x.cert === 'ok' ? 'selected' : ''}>Arrivato e conforme</option>
    </select></div>`;
  const nc = typeof ncDiCollaudo === 'function' ? ncDiCollaudo(x.id) : null;
  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      <div class="bom-toolbar-left">
        <button class="btn-outline" onclick="qcChiudiScheda()" title="Chiudi il collaudo: l'elenco resta a destra">${ico('close', 'tinted', '')} Chiudi</button>
        <h2 class="section-title" style="font-family:var(--mono)">${esc(x.number)}</h2>
        ${qcBadge(x)}
        ${storiaBtn('insp', x.id)}
      </div>
      <div class="bom-toolbar-right">
        <button class="btn-outline" onclick="qcCartellino('${x.id}')" title="Il foglio A4 da attaccare alla merce: da collaudare, accettato o non conforme, con il QR">${ico('qr', 'tinted', '')} Cartellino</button>
        <button class="btn-outline" onclick="qcRapportoPdf('${x.id}')" title="Il rapporto di collaudo in PDF, in italiano e inglese">${ico('file', 'tinted', '')} Rapporto PDF</button>
      </div>
    </div>
    ${x.source === 'odp' ? `<div class="qc-card">
      <h3>Da dove vengono</h3>
      <div class="modal-grid">
        ${dato('Articolo', it ? `<span style="font-family:var(--mono)">${codeLink(it.id, it.code)}</span> ${esc(it.name)}` : '—')}
        ${dato('Ordine di produzione', esc(qcOrdineNumero(x) || '—'))}
        ${dato('Ultima fase', esc(qcFaseTesto(qcFaseOdp(typeof getOdp === 'function' ? getOdp(x.orderId) : null, x.lineId)) || '—'))}
        ${dato('Quantità versata', `<strong>${fmtQtyIt(x.qty)} ${esc(u)}</strong> · ${esc(fmtDateIt(x.date))}`)}
      </div>` : `<div class="qc-card">
      <h3>L'arrivo</h3>
      <div class="modal-grid">
        ${dato('Articolo', it ? `<span style="font-family:var(--mono)">${codeLink(it.id, it.code)}</span> ${esc(it.name)}` : '—')}
        ${dato('Fornitore', esc(supplierName(x.supplierId) || '—'))}
        ${dato(x.source === 'odl' ? 'Ordine di lavoro' : 'Ordine fornitore', esc(qcOrdineNumero(x) || '—'))}
        ${dato('Quantità arrivata', `<strong>${fmtQtyIt(x.qty)} ${esc(u)}</strong> · ${esc(fmtDateIt(x.date))}`)}
        ${campo('DDT del fornitore', 'ddt', 'es. DDT 88412 del 03/11')}
        ${campo('Lotto o colata del fornitore', 'supplierLot', 'es. L24-0871')}
        ${certCampo}
      </div>`}
      ${cert ? `<p class="empty-text qc-hint">Il certificato si allega all'articolo (scheda articolo → Allegati) e resta lì: qui si registra che è arrivato. Senza, il lotto si può accettare solo in deroga.</p>` : ''}
    </div>
    ${qcControlloHtml(x, u, scrivibile)}
    ${x.status === 'aperto' ? qcEsitoHtml(x, u, scrivibile) : qcEsitoChiusoHtml(x, u)}
    ${nc ? `<p class="empty-text qc-hint">${ico('warning', 'tinted', '')} Non conformità <a href="#" onclick="ncApriDaAltrove('${nc.id}');return false">${esc(nc.number)}</a> · ${esc(NC_STATI[nc.status] || nc.status)}</p>` : ''}
    ${typeof docEmessiHtml === 'function' ? docEmessiHtml('inspection', x) : ''}
    ${stampLine(x)}
  </div>`;
}
// Il piano dentro il collaudo: quanti pezzi guardare, che cosa misurare, e le
// misure man mano che si prendono. Senza piano la scheda resta quella della
// fase 1: arrivo ed esito.
function qcControlloHtml(x, u, scrivibile) {
  if (!x.planId && !(x.checks || []).length && !x.sampleRule) return '';
  const p = x.planId && typeof qcPianoGet === 'function' ? qcPianoGet(x.planId) : null;
  const dis = scrivibile ? '' : 'disabled';
  const stati = { normale: 'Normale', ridotto: 'Ridotto (salto lotti)', rinforzato: 'Rinforzato' };
  const checks = x.checks || [];
  const righe = checks.map((c, i) => {
    const e = qcCheckEsito(c);
    const nome = esc(c.name || 'caratteristica ' + (i + 1));
    const cella = c.kind === 'ok'
      ? `<select ${dis} onchange="qcSetCheck('${x.id}','${c.id}',this.value);renderCollaudi()" aria-label="Esito ${nome}">
          <option value="" ${!c.value ? 'selected' : ''}>—</option><option value="ok" ${c.value === 'ok' ? 'selected' : ''}>Passa</option><option value="ko" ${c.value === 'ko' ? 'selected' : ''}>Non passa</option></select>`
      : `<input class="num ${e === 'ko' ? 'qc-ko-val' : ''}" inputmode="decimal" value="${esc(String(c.value || '').replace('.', ','))}" ${dis}
          onchange="qcSetCheck('${x.id}','${c.id}',this.value.replace(',', '.'));renderCollaudi()" aria-label="Misura ${nome}">`;
    // Su una misura l'esito si può scegliere: senza limiti è l'unico modo di
    // averne uno, con i limiti corregge il calcolo e resta segnato «a mano».
    const calc = qcCheckCalcolato(c);
    const esito = c.kind === 'ok'
      ? (e === 'ok' ? '<span class="doc-badge st-evaso">OK</span>' : e === 'ko' ? '<span class="doc-badge st-annullato">Fuori</span>' : '')
      : `<select class="qc-verdetto ${e === 'ko' ? 'qc-ko-val' : ''}" ${dis} onchange="qcSetVerdetto('${x.id}','${c.id}',this.value);renderCollaudi()" aria-label="Esito ${nome}">
          <option value="" ${!c.verdict ? 'selected' : ''}>${calc === 'ok' ? 'OK (calcolato)' : calc === 'ko' ? 'Fuori (calcolato)' : qcLimiti(c) ? '— (manca il valore)' : '— scegli'}</option>
          <option value="ok" ${c.verdict === 'ok' ? 'selected' : ''}>OK</option><option value="ko" ${c.verdict === 'ko' ? 'selected' : ''}>Fuori</option></select>
          ${qcCheckForzato(c) ? '<span class="doc-badge st-bozza" title="Diverso da quello che dicono i limiti">a mano</span>' : ''}`;
    return `<tr class="${e === 'ko' ? 'qc-row-ko' : ''}">
      <td>${esc(c.name || '—')}</td><td>${esc(qcTolleranzaTesto(c))}</td><td>${esc(c.tool || '—')}</td>
      <td class="num">${cella}</td>
      <td class="qc-esito-cella">${esito}</td></tr>`;
  }).join('');
  const sugg = x.status === 'aperto' ? qcEsitoSuggerito(x) : '';
  const fuori = p && p.failMessage && qcCollaudoFuori(x);
  return `<div class="qc-card">
    <h3>Il controllo${p ? ` · ${esc(p.name)}` : ''}</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Campionamento</label><div class="qc-val">${esc(x.sampleRule || 'Tutti i pezzi')}</div></div>
      <div class="modal-field"><label>Pezzi da guardare</label><div class="qc-val"><strong>${fmtQtyIt(x.sampleSize || 0)}</strong>${x.skipLot ? ' (lotto saltato)' : ''}</div></div>
      ${x.planState ? `<div class="modal-field"><label>Livello</label><div class="qc-val">${esc(stati[x.planState] || x.planState)}</div></div>` : ''}
      ${x.skipLot ? '' : `<div class="modal-field"><label>Pezzi non conformi nel campione</label>
        <input type="number" min="0" step="1" value="${Number(x.defects) || 0}" ${dis} onchange="qcSetDifetti('${x.id}', this.value);renderCollaudi()"></div>`}
    </div>
    ${p && p.notes ? `<p class="empty-text qc-hint">${ico('book', 'tinted', '')} ${esc(p.notes)}</p>` : ''}
    ${fuori ? `<p class="qc-fail-msg" role="alert">${ico('warning', 'tinted', '')} ${esc(p.failMessage)}</p>` : ''}
    ${checks.length ? `<div class="table-wrap"><table class="qc-table">
      <thead><tr><th scope="col">Caratteristica</th><th scope="col">Specifica</th><th scope="col">Strumento</th><th scope="col" class="num">Rilevato</th><th scope="col">Esito</th></tr></thead>
      <tbody>${righe}</tbody></table></div>` : ''}
    ${!x.skipLot && x.rejectNo != null ? `<p class="empty-text qc-hint">Si accetta con al massimo <strong>${Number(x.acceptNo) || 0}</strong> pezz${Number(x.acceptNo) === 1 ? 'o' : 'i'} non conform${Number(x.acceptNo) === 1 ? 'e' : 'i'}, si respinge da <strong>${Number(x.rejectNo) || 1}</strong>.${sugg ? ` Le misure dicono: <strong>${esc(QC_ESITI[sugg])}</strong>.` : ''}</p>` : ''}
  </div>`;
}
function qcEsitoHtml(x, u, scrivibile) {
  // Proposta dalle misure, se le misure dicono qualcosa; un certificato
  // mancante sposta l'«accettato» sulla deroga.
  let pre = (typeof qcEsitoSuggerito === 'function' ? qcEsitoSuggerito(x) : '') || 'accettato';
  if (pre === 'accettato' && qcCertificatoRichiesto(x) && x.cert !== 'ok') pre = 'deroga';
  const opt = (k, t) => `<option value="${k}" ${pre === k ? 'selected' : ''}>${t}</option>`;
  return `<div class="qc-card">
    <h3>L'esito</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Decisione</label>
        <select id="qc-esito" onchange="qcEsitoChange()" ${scrivibile ? '' : 'disabled'}>
          ${opt('accettato', 'Accettato')}
          ${opt('deroga', 'Accettato in deroga')}
          ${opt('respinto', 'Respinto (tutto o in parte)')}
        </select></div>
      <div class="modal-field" id="qc-ko-field" style="${pre === 'respinto' ? '' : 'display:none'}"><label>Pezzi respinti (${esc(u)})</label>
        <input type="number" id="qc-ko" min="0" max="${Number(x.qty) || 0}" step="any" value="${Number(x.qty) || 0}" ${scrivibile ? '' : 'disabled'} oninput="qcEsitoChange()"></div>
      <div class="modal-field" id="qc-destino-field" style="${pre === 'respinto' ? '' : 'display:none'}"><label>Che fine fanno</label>
        <select id="qc-destino" onchange="qcEsitoChange()" ${scrivibile ? '' : 'disabled'}>
          ${qcDestiniDi(x.source).map(k => `<option value="${k}">${esc(QC_DESTINI[k])}</option>`).join('')}
        </select></div>
      ${x.source === 'odp' ? `<div class="modal-field" id="qc-resp-field" style="${pre === 'accettato' ? 'display:none' : ''}"><label>Fase che ha generato il difetto</label>
        <select id="qc-resp" ${scrivibile ? '' : 'disabled'}>${qcRespOpzioni(typeof getOdp === 'function' ? getOdp(x.orderId) : null, x.respPhase || x.lineId || '')}</select></div>` : ''}
    </div>
    <div class="modal-field"><label>Nota</label>
      <textarea id="qc-note" rows="2" ${scrivibile ? '' : 'disabled'}>${esc(x.note || '')}</textarea></div>
    <p class="empty-text qc-hint" id="qc-conseguenza">${qcConseguenzaTesto(x, pre, pre === 'respinto' ? Number(x.qty) || 0 : 0, qcDestiniDi(x.source)[0])}</p>
    ${scrivibile ? `<div class="modal-actions" style="justify-content:flex-start">
      <button class="add-btn-sm" onclick="qcRegistraDallaScheda('${x.id}')">${ico('check', 'tinted', '')} Registra l'esito</button>
    </div>` : ''}
  </div>`;
}
function qcEsitoChiusoHtml(x, u) {
  return `<div class="qc-card">
    <h3>L'esito</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Decisione</label><div class="qc-val">${esc(QC_ESITI[x.esito] || 'Chiuso senza esito')}</div></div>
      <div class="modal-field"><label>Accettati</label><div class="qc-val">${fmtQtyIt(x.qtyOk)} ${esc(u)}</div></div>
      <div class="modal-field"><label>Respinti</label><div class="qc-val">${fmtQtyIt(x.qtyKo)} ${esc(u)}</div></div>
      ${x.destino ? `<div class="modal-field"><label>Destinazione</label><div class="qc-val">${esc(QC_DESTINI[x.destino] || '—')}</div></div>` : ''}
      ${x.source === 'odp' && x.respPhase ? `<div class="modal-field"><label>Fase che ha generato il difetto</label><div class="qc-val">${esc(qcRespTesto(typeof getOdp === 'function' ? getOdp(x.orderId) : null, x.respPhase) || '—')}</div></div>` : ''}
    </div>
    ${typeof qcFermi === 'function' && qcFermi(x) > 0.000001 ? `<p class="empty-text qc-hint"><strong>${fmtQtyIt(qcFermi(x))} ${esc(u)}</strong> da rilavorare, fermi: tornano al collaudo o si rottamano dalla non conformità.</p>` : ''}
    ${x.note ? `<p class="empty-text qc-hint">${esc(x.note)}</p>` : ''}
    <p class="empty-text qc-hint">Chiuso il ${esc(fmtDateIt((x.closedAt || '').slice(0, 10)))}. Un esito non si corregge: la merce si è già mossa. Quello che è tornato indietro si rivede sul documento d'origine.</p>
  </div>`;
}
// Cosa succederà, detto prima di premere. È la riga che evita la domanda «e
// adesso cosa è cambiato a magazzino?».
function qcConseguenzaTesto(x, esito, ko, destino) {
  const u = x.uom || '';
  const tot = Number(x.qty) || 0;
  const ok = Math.max(0, tot - (Number(ko) || 0));
  if (esito !== 'respinto') {
    return `${fmtQtyIt(tot)} ${esc(u)} diventano merce libera${esito === 'deroga' ? ', con la riserva scritta nel collaudo e una non conformità da chiudere' : ''}.`;
  }
  if (x.source === 'odp') {
    const fine = destino === 'scarto'
      ? 'escono come scarto'
      : 'restano a magazzino ma fermi, finché dalla non conformità non tornano al collaudo, rilavorati, o non si rottamano';
    return `${fmtQtyIt(ok)} ${esc(u)} diventano liberi; ${fmtQtyIt(ko)} ${esc(u)} ${fine}. Si apre una non conformità sulla fase che ha generato il difetto.`;
  }
  const dove = destino === 'scarto'
    ? 'restano qui ed escono come consumo: il ricevuto della riga non cambia'
    : x.source === 'odl'
      ? 'escono verso il terzista come uscita a conto lavoro, e l\'ordine di lavoro torna ad aspettarli'
      : destino === 'accredito'
        ? 'tolgono il ricevuto e l\'ordinato dalla riga d\'ordine: il fornitore non li rimanda, la riga si chiude su quello che resta e il fabbisogno torna scoperto. La non conformità aspetta la nota di credito'
        : 'tolgono il ricevuto dalla riga d\'ordine: la giacenza cala, la riga torna ad avere un residuo e il fabbisogno li aspetta di nuovo';
  return `${fmtQtyIt(ok)} ${esc(u)} diventano liberi; ${fmtQtyIt(ko)} ${esc(u)} ${dove}. Si apre una non conformità verso il fornitore.`;
}
function qcEsitoChange() {
  const x = qcCurrentId ? qcGet(qcCurrentId) : null; if (!x) return;
  const esito = val('qc-esito');
  const respinto = esito === 'respinto';
  const f1 = document.getElementById('qc-ko-field'), f2 = document.getElementById('qc-destino-field');
  if (f1) f1.style.display = respinto ? '' : 'none';
  if (f2) f2.style.display = respinto ? '' : 'none';
  const f3 = document.getElementById('qc-resp-field');
  if (f3) f3.style.display = esito === 'accettato' ? 'none' : '';
  const ko = respinto ? Math.min(Number(x.qty) || 0, Math.max(0, parseFloat(val('qc-ko')) || 0)) : 0;
  const p = document.getElementById('qc-conseguenza');
  if (p) p.innerHTML = qcConseguenzaTesto(x, esito, ko, val('qc-destino'));
}
function qcRegistraDallaScheda(id) {
  const x = qcGet(id); if (!x) return false;
  const esito = val('qc-esito');
  const ok = qcRegistraEsito(id, {
    esito,
    qtyKo: esito === 'respinto' ? parseFloat(val('qc-ko')) || 0 : 0,
    destino: val('qc-destino'),
    respPhase: document.getElementById('qc-resp') ? val('qc-resp') : '',
    note: val('qc-note'),
  });
  if (ok) renderCollaudi();
  return ok;
}
