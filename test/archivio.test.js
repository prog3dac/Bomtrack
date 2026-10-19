// L'archivio dei documenti: i PDF stanno in una cartella fuori dall'app, e
// Bomtrack ne memorizza il percorso.
//
// Le proprietà che contano, e sono quelle che nel browser vero nessuno prova a
// mano perché servirebbe rinominare file e revocare permessi:
//
//   1. **un documento, tanti codici** — il catalogo di un commerciale vale per
//      quaranta articoli, e deve restare un record solo: è l'intera ragione per
//      cui `attachmentDocs` è una collezione a sé;
//   2. **i tre esiti dell'apertura** sono tre — nessun documento salvato,
//      archivio non impostato su questo PC, documento non trovato — perché sono
//      tre rimedi diversi, e dirne due al posto di tre manda l'utente a cercare
//      la cosa sbagliata;
//   3. **il backup li porta davvero**, che è ciò che il vecchio allegato in
//      IndexedDB non sapeva fare.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat } = require('./fixtures.js');

function app(files, opt) {
  const a = loadApp({ silent: true });
  a.setDb(makeDb({ items: [mat('M1', 10), mat('M2', 20)] }));
  a.asRole('admin');
  a.archivio(files || { 'catalogo.pdf': 'PDF-1', 'cataloghi/skf.pdf': 'PDF-2' }, opt);
  return a;
}
const collega = (a, item, path, desc, pag) =>
  a.eval(`allegatoCollega(${JSON.stringify(item)}, ${JSON.stringify(path)}, ${JSON.stringify(desc || '')}, ${JSON.stringify(pag == null ? '' : String(pag))})`);

describe('Archivio — collegare un documento', () => {
  it('nasce il documento e nasce il legame', () => {
    const a = app();
    collega(a, 'M1', 'catalogo.pdf', 'Catalogo SKF');
    const snap = a.snapshot();
    assert.equal(snap.attachmentDocs.length, 1);
    assert.equal(snap.attachmentDocs[0].path, 'catalogo.pdf');
    assert.equal(snap.attachmentDocs[0].description, 'Catalogo SKF');
    assert.equal(snap.attachments.length, 1);
    assert.equal(snap.attachments[0].docId, snap.attachmentDocs[0].id);
  });

  // È il caso che ha deciso la forma dei dati: lo stesso PDF su più codici.
  it('lo stesso file su due codici resta un documento solo', () => {
    const a = app();
    collega(a, 'M1', 'catalogo.pdf', 'Catalogo SKF');
    collega(a, 'M2', 'catalogo.pdf', '');
    const snap = a.snapshot();
    assert.equal(snap.attachmentDocs.length, 1, 'il percorso non va scritto due volte');
    assert.equal(snap.attachments.length, 2, 'ma i legami sono due');
    assert.equal(a.eval('allegatoDocUsi(db.attachmentDocs[0].id)'), 2);
  });

  it('lo stesso documento non si allega due volte allo stesso codice', () => {
    const a = app();
    collega(a, 'M1', 'catalogo.pdf', 'Catalogo');
    collega(a, 'M1', 'catalogo.pdf', 'Catalogo');
    assert.equal(a.snapshot().attachments.length, 1);
  });

  // La descrizione appartiene al documento, non al legame: correggerla da un
  // codice la corregge per tutti, che è il motivo per cui il documento è uno.
  it('la descrizione riscritta vale per tutti i codici', () => {
    const a = app();
    collega(a, 'M1', 'catalogo.pdf', 'Catalgo SKF');
    collega(a, 'M2', 'catalogo.pdf', 'Catalogo cuscinetti SKF');
    assert.equal(a.snapshot().attachmentDocs[0].description, 'Catalogo cuscinetti SKF');
  });

  // La pagina invece appartiene al legame: un catalogo di trecento pagine si
  // apre dove serve a *questo* codice.
  it('la pagina appartiene al singolo codice', () => {
    const a = app();
    collega(a, 'M1', 'catalogo.pdf', 'Catalogo', 12);
    collega(a, 'M2', 'catalogo.pdf', '', 48);
    const pagine = a.snapshot().attachments.map(x => x.page).sort((x, y) => x - y);
    assert.deepEqual(pagine, [12, 48]);
  });

  it('chi non può scrivere il catalogo non può collegare', () => {
    const a = app();
    a.asRole('lettore');
    collega(a, 'M1', 'catalogo.pdf', 'Catalogo');
    assert.equal(a.snapshot().attachments.length, 0);
    assert.equal(a.snapshot().attachmentDocs.length, 0);
  });
});

describe('Archivio — scollegare ed eliminare', () => {
  it('scollegare toglie il legame e lascia il documento', () => {
    const a = app();
    collega(a, 'M1', 'catalogo.pdf', 'Catalogo');
    collega(a, 'M2', 'catalogo.pdf', '');
    const id = a.snapshot().attachments[0].id;
    a.eval(`allegatoScollega(${JSON.stringify(id)}); confirmYes();`);
    const snap = a.snapshot();
    assert.equal(snap.attachments.length, 1, 'l\'altro codice lo tiene');
    assert.equal(snap.attachmentDocs.length, 1, 'e il documento resta censito');
  });

  // Stessa regola del cliente citato da una commessa: un riferimento vivo non
  // si cancella di sotto a chi lo usa.
  it('un documento citato da un codice non si elimina', () => {
    const a = app();
    collega(a, 'M1', 'catalogo.pdf', 'Catalogo');
    const docId = a.snapshot().attachmentDocs[0].id;
    a.eval(`allegatoDocElimina(${JSON.stringify(docId)}); confirmYes();`);
    assert.equal(a.snapshot().attachmentDocs.length, 1);
  });

  it('senza più nessun codice si elimina, e il file resta in archivio', () => {
    const a = app();
    collega(a, 'M1', 'catalogo.pdf', 'Catalogo');
    const docId = a.snapshot().attachmentDocs[0].id;
    a.eval('db.attachments = [];');
    a.eval(`allegatoDocElimina(${JSON.stringify(docId)}); confirmYes();`);
    assert.equal(a.snapshot().attachmentDocs.length, 0);
  });
});

describe('Archivio — aprire', () => {
  it('un documento che c\'è si apre, e con la sua pagina', async () => {
    const a = app();
    collega(a, 'M1', 'cataloghi/skf.pdf', 'Catalogo SKF', 12);
    const id = a.snapshot().attachments[0].id;
    const esito = await a.eval(`allegatoApri(${JSON.stringify(id)})`);
    assert.equal(esito, 'ok');
    assert.ok(a.aperti().some(u => String(u).includes('#page=12')),
      'la pagina si chiede al visualizzatore, non si lascia cercare a mano');
  });

  // Il caso che l'utente incontra davvero: qualcuno ha rinominato il PDF.
  it('un file sparito dall\'archivio dà «documento non trovato»', async () => {
    const a = app();
    collega(a, 'M1', 'catalogo.pdf', 'Catalogo');
    const id = a.snapshot().attachments[0].id;
    a.eval('_archivioElenco = null;');
    // Il legame resta, il file no: è esattamente ciò che succede rinominandolo.
    a.eval('db.attachmentDocs[0].path = "catalogo-rev2.pdf";');
    assert.equal(await a.eval(`allegatoApri(${JSON.stringify(id)})`), 'assente');
  });

  it('un codice senza allegati dice «nessun documento salvato»', async () => {
    const a = app();
    assert.equal(await a.eval('allegatoApriPrimo("M1")'), 'nessuno');
  });

  // Tre esiti, non due: «non l'hai allegato» e «il tuo PC non sa dov'è
  // l'archivio» portano a due rimedi diversi.
  it('senza archivio configurato lo dice, invece di parlare del file', async () => {
    const a = app({ 'catalogo.pdf': 'PDF' }, { collega: false });
    // Il legame c'è (arriva da un backup, o da un collega che l'ha creato): è il
    // PC che non sa dove guardare.
    a.eval('db.attachmentDocs = [{ id: "d1", path: "catalogo.pdf", description: "Catalogo" }];');
    a.eval('db.attachments = [{ id: "l1", itemId: "M1", docId: "d1" }];');
    assert.equal(await a.eval('allegatoApri("l1")'), 'non-configurato');
  });

  it('con il permesso negato non si finge che il file non ci sia', async () => {
    const a = app({ 'catalogo.pdf': 'PDF' }, { permesso: 'denied' });
    a.eval('db.attachmentDocs = [{ id: "d1", path: "catalogo.pdf", description: "Catalogo" }];');
    a.eval('db.attachments = [{ id: "l1", itemId: "M1", docId: "d1" }];');
    assert.equal(await a.eval('allegatoApri("l1")'), 'negato');
  });

  it('con più documenti si apre l\'elenco invece di indovinare', async () => {
    const a = app();
    collega(a, 'M1', 'catalogo.pdf', 'Uno');
    collega(a, 'M1', 'cataloghi/skf.pdf', 'Due');
    assert.equal(await a.eval('allegatoApriPrimo("M1")'), 'elenco');
  });
});

describe('Archivio — leggere la cartella', () => {
  it('elenca i PDF, anche nelle sottocartelle, con il percorso relativo', async () => {
    const a = app({ 'a.pdf': 'x', 'cataloghi/b.pdf': 'y', 'cataloghi/2024/c.pdf': 'z' });
    const lista = await a.eval('archivioElenco(true)');
    assert.deepEqual(Array.from(lista).map(f => f.path).sort(),
      ['a.pdf', 'cataloghi/2024/c.pdf', 'cataloghi/b.pdf']);
  });

  // L'archivio è una cartella vera, dove sta anche altro: un .xlsx o un .dwg non
  // sono documenti da allegare qui, e comparirebbero solo per confondere.
  it('quello che non è PDF resta fuori', async () => {
    const a = app({ 'a.pdf': 'x', 'listino.xlsx': 'y', 'pezzo.dwg': 'z' });
    const lista = await a.eval('archivioElenco(true)');
    assert.deepEqual(Array.from(lista).map(f => f.path), ['a.pdf']);
  });

  it('copiare un PDF dentro l\'archivio non sovrascrive un nome già preso', async () => {
    const a = app({ 'scheda.pdf': 'vecchio' });
    const nome = await a.eval('archivioNomeLibero("scheda.pdf")');
    assert.equal(nome, 'scheda (2).pdf');
  });

  // L'elenco si legge una volta per sessione: un file messo da un collega dopo
  // non c'è, e scriverci sopra cancellerebbe il suo su tutti i PC.
  it('un file comparso dopo la lettura della cartella non si sovrascrive', async () => {
    const files = { 'altro.pdf': 'x' };
    const a = app(files);
    await a.eval('archivioElenco(true)');
    files['catalogo.pdf'] = 'DEL COLLEGA';
    const nome = await a.eval('archivioNomeLibero("catalogo.pdf")');
    assert.equal(nome, 'catalogo (2).pdf');
    assert.equal(await a.eval('archivioSalva("catalogo.pdf", "MIO")'), null, 'il nome preso si rifiuta');
    assert.equal(files['catalogo.pdf'], 'DEL COLLEGA');
    assert.equal(await a.eval('archivioSalva(' + JSON.stringify(nome) + ', "MIO")'), 'catalogo (2).pdf');
    assert.equal(files['catalogo (2).pdf'], 'MIO');
  });
});

describe('Archivio — la verifica', () => {
  // Il difetto dichiarato di questo disegno è il collegamento che si rompe in
  // silenzio. Questo è il rimedio, e va contato per documento: un catalogo
  // citato da quaranta codici manca una volta sola.
  it('nomina i documenti che non sono più in cartella, una volta ciascuno', async () => {
    const a = app({ 'c\'e.pdf': 'x' });
    a.eval(`db.attachmentDocs = [
      { id: 'd1', path: "c'e.pdf", description: 'C\\u00e8' },
      { id: 'd2', path: 'sparito.pdf', description: 'Sparito' }];`);
    a.eval(`db.attachments = [
      { id: 'l1', itemId: 'M1', docId: 'd2' },
      { id: 'l2', itemId: 'M2', docId: 'd2' }];`);
    const mancanti = await a.eval('archivioVerifica()');
    assert.equal(Array.from(mancanti).length, 1);
    assert.equal(Array.from(mancanti)[0].path, 'sparito.pdf');
  });

  // Ricollegare è il gesto che ripara, e ripara in un punto solo: è il guadagno
  // vero della divisione fra documento e legame.
  it('ricollegare sistema tutti i codici in una volta', () => {
    const a = app({ 'catalogo-rev2.pdf': 'x' });
    collega(a, 'M1', 'catalogo.pdf', 'Catalogo');
    collega(a, 'M2', 'catalogo.pdf', '');
    const docId = a.snapshot().attachmentDocs[0].id;
    a.eval(`allegatoDocRicollega(${JSON.stringify(docId)}, 'catalogo-rev2.pdf')`);
    const snap = a.snapshot();
    assert.equal(snap.attachmentDocs.length, 1);
    assert.equal(snap.attachmentDocs[0].path, 'catalogo-rev2.pdf');
    assert.equal(snap.attachments.length, 2, 'i legami non si toccano: puntano al documento, non al file');
  });
});

describe('Archivio — il backup', () => {
  // È il punto in cui questa forma batte quella vecchia: il percorso è un dato,
  // e un dato nel JSON ci sta.
  it('porta i documenti con il loro percorso', () => {
    const a = app();
    collega(a, 'M1', 'cataloghi/skf.pdf', 'Catalogo SKF', 12);
    const snap = JSON.parse(a.eval('Store.exportSnapshot()'));
    assert.equal(snap.attachmentDocs[0].path, 'cataloghi/skf.pdf');
    assert.equal(snap.attachments[0].page, 12);
  });

  // La cartella no, e volutamente: ogni PC ha la sua, e importare quella di un
  // altro significherebbe imporre a tutti la lettera di unità del primo.
  it('ma non la cartella, che è di questo PC', () => {
    const a = app();
    collega(a, 'M1', 'catalogo.pdf', 'Catalogo');
    assert.ok(!a.eval('Store.exportSnapshot()').includes('Disegni'),
      'il nome della cartella resta locale');
  });

  it('la collezione è dichiarata nello schema, come tutte le altre', () => {
    const a = app();
    assert.equal(a.eval('Store.schema().attachmentDocs.table'), 'attachment_docs');
    a.eval('Store.clearAll(null)');
    assert.ok(Array.isArray(a.snapshot().attachmentDocs));
  });
});

describe('Archivio — la configurazione, che è locale', () => {
  it('scegliere la cartella la ricorda per nome', async () => {
    const a = app(null, { collega: false });
    assert.equal(a.eval('archivioStato()'), 'non-configurato');
    assert.equal(await a.eval('archivioScegli()'), true);
    assert.equal(a.eval('archivioStato()'), 'configurato');
    assert.equal(a.eval('archivioNome()'), 'Disegni');
  });

  // Chiudere la finestra di sistema senza scegliere è un ripensamento, non un
  // guasto: non deve lasciare niente dietro né dire niente di rosso.
  it('annullare la scelta non configura niente', async () => {
    const a = app(null, { collega: false, rifiuta: true });
    assert.equal(await a.eval('archivioScegli()'), false);
    assert.equal(a.eval('archivioStato()'), 'non-configurato');
  });

  // Il riferimento alla cartella vive nello stesso database dei byte degli
  // allegati ma in un'altra tabella: se finisse fra i file, la pulizia degli
  // orfani lo troverebbe senza padrone e lo butterebbe via.
  it('la cartella non è un file orfano', async () => {
    const a = app();
    const orfani = await a.eval('allegatiOrfani()');
    assert.deepEqual(Array.from(orfani), []);
  });
});

describe('Archivio — quello che si vede', () => {
  it('la scheda di un codice elenca i documenti con la descrizione, non col nome del file', () => {
    const a = app();
    collega(a, 'M1', 'cataloghi/skf.pdf', 'Catalogo cuscinetti SKF', 12);
    const html = a.eval('allegatiBody("M1")');
    assert.ok(html.includes('Catalogo cuscinetti SKF'), 'la descrizione è ciò che si legge');
    assert.ok(html.includes('skf.pdf'), 'e il nome del file resta come dettaglio');
    assert.ok(html.includes('pag. 12'), 'la pagina si legge anche senza aprire il PDF');
  });

  it('un codice senza allegati lo dice con le parole giuste', () => {
    const a = app();
    assert.ok(a.eval('allegatiBody("M1")').includes('NESSUN DOCUMENTO SALVATO'));
  });

  // Chi non ha configurato la cartella deve trovare qui il rimedio, non in
  // Gestione: è un'impostazione di macchina, e la tocca anche chi in Gestione
  // non entra.
  it('senza cartella la scheda offre di sceglierla', () => {
    const a = app(null, { collega: false });
    const html = a.eval('allegatiBody("M1")');
    assert.ok(html.includes('non impostato su questo PC'));
    assert.ok(html.includes('archivioSceglieModal()'));
  });

  // La vecchia strada resta aperta dove la nuova non c'è: togliere a qualcuno
  // l'unico modo che ha di allegare non è una semplificazione.
  it('dove l\'archivio non è disponibile resta il caricamento nel database', () => {
    const a = app(null, { collega: false });
    a.eval('delete window.showDirectoryPicker;');
    const html = a.eval('allegatiBody("M1")');
    assert.equal(a.eval('archivioStato()'), 'non-supportato');
    assert.ok(html.includes('Carica file nel database'));
  });

  it('il pannello di scelta elenca i PDF della cartella', async () => {
    const a = app({ 'catalogo.pdf': 'x', 'cataloghi/skf.pdf': 'y' });
    a.eval('allegatoCollegaModal("M1")');
    await a.eval('archivioElenco(true)').then(l => a.eval('window.__collegaFile = ' + JSON.stringify(Array.from(l))));
    const html = a.eval('allegatoCollegaBody()');
    assert.ok(html.includes('catalogo.pdf') && html.includes('cataloghi/skf.pdf'));
  });

  // Un nome di file è testo che scrive chiunque: apici e virgolette ci stanno,
  // e finiscono dentro un attributo onclick.
  it('un nome di file con un apice non rompe il pannello', () => {
    const a = app();
    a.eval(`window.__collegaItemId = 'M1'; window.__collegaFile = [{ path: "c'è un \\"apice\\".pdf", size: 10 }];`);
    const html = a.eval('allegatoCollegaBody()');
    assert.ok(!html.includes('onclick="allegatoCollegaScegli("'), 'l\'attributo non deve chiudersi a metà');
    assert.ok(html.includes('&#39;') || html.includes('&quot;'), 'il percorso passa da esc()');
  });

  it('Gestione elenca i documenti con quanti codici li citano', () => {
    const a = app();
    collega(a, 'M1', 'catalogo.pdf', 'Catalogo');
    collega(a, 'M2', 'catalogo.pdf', '');
    const html = a.eval('renderArchivio()');
    assert.ok(html.includes('Catalogo'));
    assert.ok(html.includes('2 codici'));
    assert.ok(html.includes('allegatoRicollegaModal'));
  });
});
