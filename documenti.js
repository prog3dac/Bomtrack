// ═══════════════════════════════════════════════════════════
//  BOMTRACK — documenti.js
// ═══════════════════════════════════════════════════════════
// I documenti emessi: la copia PDF di una richiesta d'offerta, di un ordine
// d'acquisto o di un ordine di lavoro così come è partita verso il fornitore.
// Classic script, scope globale condiviso con gli altri.
//
// ── Perché una copia, se i dati ci sono già ──
// Il PDF si può rigenerare quando si vuole, ma esce con i dati **di oggi**: un
// prezzo corretto, una riga aggiunta dopo lo sblocco, l'indirizzo del fornitore
// cambiato. Quello che il fornitore ha ricevuto è un'altra cosa, e chi lo
// cerca — un collega, una contestazione, una verifica — vuole quello.
//
// ── Dove sta ──
// Nella stessa cartella d'archivio degli allegati (archivio.js), in una
// sottocartella sua: `Documenti Bomtrack/<RFQ|ODA|ODL>/<anno>/`. Il database
// (`generatedDocs`) ne tiene il percorso, a quale documento appartiene, la
// revisione e l'impronta SHA-256; i byte non passano mai dal server. Con la
// cartella sincronizzata (OneDrive, Dropbox, rete) la copia è subito su tutti
// i PC, e con l'archivio condiviso l'elenco arriva ai colleghi da solo.
//
// ── Quando si archivia ──
// Al momento in cui il documento diventa ufficiale: «Segna come inviato» dopo
// aver generato il PDF. Le bozze di controllo restano un download e basta. Un
// documento già inviato e poi cambiato (sbloccato, corretto, rigenerato) si
// archivia come **nuova revisione** (`_r1`, `_r2`…): una copia emessa non si
// sovrascrive e non si corregge mai, perché vale come prova di ciò che è partito.
//
// Il download resta sempre: chi oggi allega il PDF a una mail a mano continua a
// farlo. L'archivio si aggiunge, non sostituisce niente — ed è anche ciò che
// permette di lavorare su Firefox o senza cartella, dove l'archivio non c'è.

// I tre tipi di documento, con la loro sottocartella e il modo di ridisegnarli.
// Le chiavi sono il `kind` scritto nel record: non si rinominano.
const DOC_EMESSI_TIPI = {
  rfq: { cartella: 'RFQ', coll: 'rfqs', nome: 'richiesta', render: () => renderRfq() },
  order: { cartella: 'ODA', coll: 'orders', nome: 'ordine', render: () => renderOrders() },
  workOrder: { cartella: 'ODL', coll: 'workOrders', nome: 'ordine di lavoro', render: () => renderOdl() },
};

// Le copie di un documento, dalla prima all'ultima.
function docEmessi(kind, refId) {
  return (db.generatedDocs || []).filter(d => d.kind === kind && d.refId === refId)
    .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}
function docEmessoUltimo(kind, refId) {
  const l = docEmessi(kind, refId);
  return l.length ? l[l.length - 1] : null;
}
// La revisione che riceverà la prossima copia: 0 la prima, poi 1, 2…
function docEmessoProssimaSeq(kind, refId) {
  const u = docEmessoUltimo(kind, refId);
  return u ? (Number(u.seq) || 0) + 1 : 0;
}

// Il percorso dentro la cartella d'archivio. L'anno è quello del **documento**,
// non di oggi: la revisione di gennaio di un ordine di dicembre resta accanto
// all'ordine. Il nome è quello del download, con `_rN` dalla seconda copia.
function docEmessoPercorso(kind, rec, nomeFile, seq) {
  const t = DOC_EMESSI_TIPI[kind];
  const anno = /^\d{4}/.test(String(rec.date || '')) ? String(rec.date).slice(0, 4) : oggiISO().slice(0, 4);
  const punto = nomeFile.lastIndexOf('.');
  const base = punto > 0 ? nomeFile.slice(0, punto) : nomeFile;
  const est = punto > 0 ? nomeFile.slice(punto) : '';
  const nome = seq > 0 ? base + '_r' + seq + est : nomeFile;
  return [ARCHIVIO_CARTELLA_EMESSI, t.cartella, anno, nome].join('/');
}

// Va proposta una copia nuova? Su un documento già inviato che si rigenera:
// sì se non ne esiste ancora una (inviato prima di questa funzione), o se il
// documento è cambiato dopo l'ultima. Una ristampa dello stesso documento non
// chiede niente — sarebbe una domanda a ogni click.
function docEmessoDaProporre(kind, rec) {
  if (!rec || rec.status === 'bozza') return false;
  const u = docEmessoUltimo(kind, rec.id);
  if (!u) return true;
  return String(rec.updatedAt || '') > String(u.createdAt || '');
}

// ─── Archiviare ───
// Il record nasce **dopo** che il file è stato scritto, come per gli allegati:
// al contrario si avrebbe in elenco una copia che non esiste. Restituisce il
// record, o null con il motivo già detto all'utente: il PDF è comunque nei
// download, quindi niente è perso.
function docEmessoArchivia(kind, rec, blob, nomeFile) {
  if (!DOC_EMESSI_TIPI[kind] || !rec || !blob) return Promise.resolve(null);
  if (!canWrite('docs')) return Promise.resolve(null);
  const stato = archivioStato();
  if (stato !== 'configurato') {
    showToast(stato === 'non-supportato'
      ? 'PDF non archiviato: questo browser non scrive nella cartella d\'archivio (servono Chrome o Edge)'
      : 'PDF non archiviato: la cartella d\'archivio non è impostata su questo PC', 'error');
    return Promise.resolve(null);
  }
  const seq = docEmessoProssimaSeq(kind, rec.id);
  const voluto = docEmessoPercorso(kind, rec, nomeFile, seq);
  return archivioSalvaIn(voluto, blob).then(path => {
    if (!path) { showToast('PDF non archiviato: scrittura nella cartella non riuscita', 'error'); return null; }
    return archivioImpronta(blob).then(sha => {
      const ora = nowISO();
      const nuovo = Store.insert('generatedDocs', {
        kind, refId: rec.id, number: rec.number || '', seq,
        path, format: 'pdf', size: Number(blob.size) || 0, sha256: sha,
        // Oggi l'invio lo fa l'utente, a mano: la copia archiviata è quella che
        // ha in mano in quel momento. `sentVia`/`sentTo` sono pronti per il
        // giorno in cui la mail partirà dall'app.
        sentAt: ora, sentVia: 'manuale', sentTo: '',
      });
      showToast(seq > 0 ? `Archiviato come revisione ${seq}` : 'PDF archiviato');
      return nuovo;
    });
  });
}

// Il seguito comune di «Genera documento PDF» per i tre tipi.
//   o = { ripiego, domanda, stato, rerender, modo }
// `modo: 'archivia'` è il pulsante «Archivia» della scheda: niente download e
// niente domanda, la copia va dritta in archivio.
function docPdfEmetti(kind, rec, doc, o) {
  const nome = docNomeFile(rec, rec.supplierId ? getSupplier(rec.supplierId) : null, o.ripiego, '.pdf');
  const archivia = () => docEmessoArchivia(kind, rec, doc.output('blob'), nome).then(r => { if (r) o.rerender(); return r; });
  if (o.modo === 'archivia') return archivia();
  doc.save(nome);
  showToast('PDF esportato');
  if (rec.status === 'bozza') {
    askMarkSent(rec, o.domanda, o.stato, o.rerender, archivioStato() === 'configurato' ? archivia : null);
    return null;
  }
  // Già inviato: la copia si propone solo dove si può scrivere, e solo se c'è
  // qualcosa di nuovo da conservare.
  if (!canWrite('docs') || archivioStato() !== 'configurato' || !docEmessoDaProporre(kind, rec)) return null;
  const seq = docEmessoProssimaSeq(kind, rec.id);
  askConfirm(seq > 0
    ? `Il documento ${rec.number} è cambiato dopo l'ultima copia archiviata.\nArchiviare questo PDF come revisione ${seq}?`
    : `Il documento ${rec.number} risulta già inviato ma non ha una copia in archivio.\nArchiviare questo PDF?`,
  archivia, { title: 'Copia in archivio', ok: 'Sì, archivia', cancel: 'No, solo download', safe: true });
  return null;
}

// Il pulsante «Archivia» della scheda rigenera il PDF senza scaricarlo.
function docEmessoArchiviaOra(kind, id) {
  if (!roleGuard('docs')) return;
  const fn = { rfq: exportRfqPDF, order: exportOrderPDF, workOrder: exportOdlPDF }[kind];
  if (fn) fn(id, 'archivia');
}

// ─── Aprire ───
// Gli stessi esiti degli allegati, con le stesse parole: è la stessa cartella.
function docEmessoApri(id) {
  const d = (db.generatedDocs || []).find(x => x.id === id);
  if (!d) return Promise.resolve('nessuno');
  return archivioApri(d.path).then(esito => {
    if (esito === 'non-supportato') showToast('Questo browser non può leggere l\'archivio: servono Chrome o Edge', 'error');
    else if (esito === 'non-configurato') showToast('Archivio non impostato su questo PC: scegli la cartella da Gestione → Backup', 'error');
    else if (esito === 'negato') showToast('Permesso negato sulla cartella d\'archivio', 'error');
    else if (esito === 'assente') showToast(`DOCUMENTO NON TROVATO — "${d.path}" non è in ${archivioNome() || 'archivio'}`, 'error');
    else if (esito === 'errore') showToast('Documento non apribile', 'error');
    return esito;
  });
}

// La cartella scelta dalla scheda del documento: dopo si ridisegna la scheda,
// non Gestione.
function docEmessiScegliCartella(kind) {
  archivioScegli().then(ok => { if (ok && DOC_EMESSI_TIPI[kind]) DOC_EMESSI_TIPI[kind].render(); });
}

// ─── In scheda ───
// Sotto i pulsanti di generazione: le copie archiviate, apribili, e il modo di
// aggiungerne una. Su una bozza non c'è niente da mostrare se non una riga che
// dice quando succederà.
function docEmessiHtml(kind, rec) {
  if (!rec || !DOC_EMESSI_TIPI[kind]) return '';
  const copie = docEmessi(kind, rec.id);
  const stato = archivioStato();
  const scrive = canWrite('docs') && rec.status !== 'bozza';
  const righe = copie.slice().reverse().map(d => `<div class="mgmt-item">
      <span class="mgmt-item-name">${ico('file', 'tinted', '')} ${Number(d.seq) > 0 ? 'Revisione ' + esc(String(d.seq)) : 'Prima emissione'}</span>
      <span class="mgmt-item-meta">${esc(fmtDateIt(d.sentAt || d.createdAt))}${d.createdBy ? ' · ' + esc(actorName(d.createdBy)) : ''} · <span style="font-family:var(--mono)">${esc(d.path || '')}</span></span>
      <div class="mgmt-item-actions"><button class="mini-btn" title="Apri il PDF archiviato" onclick="docEmessoApri('${d.id}')">${ico('eye', 'tinted', 'Apri')}</button></div>
    </div>`).join('');
  let nota = '';
  if (stato === 'non-supportato') nota = 'Questo browser non scrive nella cartella d\'archivio (servono Chrome o Edge): il PDF resta un download.';
  else if (stato === 'non-configurato') nota = `La cartella d'archivio non è impostata su questo PC: il PDF resta un download. <button class="mini-btn" onclick="docEmessiScegliCartella('${kind}')">${ico('folder', 'tinted', '')} Scegli cartella</button>`;
  else if (rec.status === 'bozza' && !copie.length) nota = 'Il PDF va in archivio quando il documento si segna come inviato.';
  else if (!copie.length) nota = 'Nessuna copia archiviata.';
  const pulsante = scrive && stato === 'configurato'
    ? `<button class="btn-outline" onclick="docEmessoArchiviaOra('${kind}','${rec.id}')">${ico('folder', 'tinted', '')} ${copie.length ? 'Archivia come nuova revisione' : 'Archivia il PDF'}</button>` : '';
  return `<div class="doc-emessi">
      <label>${ico('folder', 'tinted', '')} Copie in archivio${copie.length ? ' (' + copie.length + ')' : ''}</label>
      ${righe ? `<div class="mgmt-list">${righe}</div>` : ''}
      ${nota ? `<p class="empty-text" style="text-align:left;padding:4px 0 0">${nota}</p>` : ''}
      ${pulsante ? `<div style="margin-top:6px">${pulsante}</div>` : ''}
    </div>`;
}

// ─── Verificare ───
// Ogni copia si cerca per percorso, senza scandire la cartella: sono annidate
// più in profondità di quanto la scansione degli allegati scenda, e sapere quali
// cercare basta. Chi c'è si confronta anche per impronta: un PDF sostituito a
// mano con lo stesso nome non è più la copia emessa, e va detto.
// → { mancanti: [record], alterati: [record] }, o null se la cartella non è pronta.
function docEmessiVerifica() {
  return archivioPronto(true).then(h => {
    if (!h) return null;
    const esito = { mancanti: [], alterati: [] };
    const lista = (db.generatedDocs || []).slice();
    const passo = i => {
      if (i >= lista.length) return Promise.resolve(esito);
      const d = lista[i];
      return archivioFile(d.path, false).then(f => {
        if (!f) { esito.mancanti.push(d); return null; }
        if (!d.sha256) return null;
        return archivioImpronta(f).then(sha => { if (sha && sha !== d.sha256) esito.alterati.push(d); });
      }).then(() => passo(i + 1));
    };
    return passo(0);
  });
}

// L'esito in Gestione → Backup, sotto quello degli allegati. Prima della
// verifica dice solo quante copie ci sono; dopo, quali mancano e quali non
// corrispondono più all'impronta registrata.
function docEmessiVerificaHtml() {
  const n = (db.generatedDocs || []).length;
  if (!n) return '';
  const e = window.__emessiEsito;
  const etichetta = d => `${esc(d.number || '')}${Number(d.seq) > 0 ? ' rev. ' + esc(String(d.seq)) : ''} <span style="font-family:var(--mono)">${esc(d.path || '')}</span>`;
  if (!e) return `<p style="margin-top:6px">${ico('file', 'tinted', '')} Documenti emessi in archivio: <strong>${n}</strong>. La verifica controlla anche loro.</p>`;
  if (!e.mancanti.length && !e.alterati.length) return `<p style="margin-top:6px">Tutti i ${n} documenti emessi sono al loro posto e integri.</p>`;
  const voci = e.mancanti.map(d => `<li>${etichetta(d)} — <strong>non trovato</strong></li>`)
    .concat(e.alterati.map(d => `<li>${etichetta(d)} — <strong>diverso dalla copia emessa</strong></li>`)).join('');
  return `<div style="color:var(--red);margin-top:6px"><strong>Documenti emessi da controllare:</strong>
    <ul style="margin:4px 0 0 18px">${voci}</ul>
    <p style="color:var(--text-dim);margin-top:4px">Un file non trovato è stato spostato, rinominato o non è ancora sincronizzato. Un file diverso è stato sostituito o modificato fuori da Bomtrack: la copia emessa non è più quella.</p></div>`;
}
