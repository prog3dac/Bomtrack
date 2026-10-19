// Allegati: disegni e schede tecniche appesi a un articolo.
//
// La proprietà che conta è la **divisione**: i dati dell'allegato stanno in
// `db.attachments` come ogni altra collezione, i byte del file in IndexedDB.
// Da quella divisione discendono le due cose che possono andare storte, e sono
// le due che questi test guardano per prime:
//
//   1. un record senza il suo file — un allegato che si vede in elenco e non si
//      scarica, cioè un guasto visibile, permanente e senza spiegazione;
//   2. il backup JSON che sembra portarsi dietro i file e invece no.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat } = require('./fixtures.js');

function app() {
  const a = loadApp({ silent: true });
  a.setDb(makeDb({ items: [mat('M1', 10), mat('M2', 20)] }));
  a.asRole('admin');
  return a;
}
// Quello che un <input type=file> consegna: qui basta che abbia nome, tipo e
// dimensione — il "contenuto" lo tratta il deposito come un valore opaco,
// esattamente come farebbe con un Blob vero.
function file(nome, size, testo) {
  return { name: nome, type: 'application/pdf', size: size == null ? 1024 : size, _testo: testo || 'PDF' };
}
const deposito = a => a.eval('__deposito');
// `allegatoAggiungi` ritorna una Promise che vive nel realm della vm: si
// aspetta il suo esito passando dall'id che restituisce.
function aggiungi(a, itemId, f) {
  a.ctx.__f = f;
  return a.eval('allegatoAggiungi(' + JSON.stringify(itemId) + ', __f)');
}

describe('Allegati — aggiungere', () => {
  it('il record nasce solo dopo che il file è stato depositato', async () => {
    const a = app();
    const id = await aggiungi(a, 'M1', file('disegno.pdf'));
    assert.ok(id, 'deve tornare l\'id dell\'allegato');
    assert.equal(a.snapshot().attachments.length, 1);
    assert.ok(deposito(a).has(id), 'i byte devono essere nel deposito');
  });

  it('il record porta nome, dimensione e articolo', async () => {
    const a = app();
    await aggiungi(a, 'M1', file('schema elettrico.pdf', 2048));
    const rec = a.snapshot().attachments[0];
    assert.equal(rec.name, 'schema elettrico.pdf');
    assert.equal(rec.size, 2048);
    assert.equal(rec.itemId, 'M1');
  });

  it('un file troppo grande viene rifiutato, e non lascia niente dietro', async () => {
    const a = app();
    const max = a.eval('ALLEGATO_MAX_MB');
    const id = await aggiungi(a, 'M1', file('video.mp4', (max + 1) * 1024 * 1024));
    assert.equal(id, null);
    assert.equal(a.snapshot().attachments.length, 0, 'nessun record');
    assert.equal(deposito(a).size, 0, 'e nessun file: il deposito non è una discarica');
  });

  it('un articolo che non esiste non produce nessun allegato', async () => {
    const a = app();
    const id = await aggiungi(a, 'mai-esistito', file('x.pdf'));
    assert.equal(id, null);
    assert.equal(a.snapshot().attachments.length, 0);
  });

  it('chi non può scrivere il catalogo non può allegare', async () => {
    const a = app();
    a.asRole('lettore');
    const id = await aggiungi(a, 'M1', file('disegno.pdf'));
    assert.equal(id, null);
    assert.equal(a.snapshot().attachments.length, 0);
  });
});

describe('Allegati — elencare', () => {
  it('ogni articolo vede solo i propri', async () => {
    const a = app();
    await aggiungi(a, 'M1', file('uno.pdf'));
    await aggiungi(a, 'M2', file('due.pdf'));
    assert.equal(a.eval('allegatiDi("M1").length'), 1);
    assert.equal(a.eval('allegatiDi("M1")[0].name'), 'uno.pdf');
    assert.equal(a.eval('allegatiCount("M2")'), 1);
  });

  it('un articolo senza allegati non ne inventa', () => {
    const a = app();
    assert.equal(a.eval('allegatiCount("M1")'), 0);
  });
});

describe('Allegati — eliminare', () => {
  it('toglie il record e il file', async () => {
    const a = app();
    const id = await aggiungi(a, 'M1', file('disegno.pdf'));
    // L'eliminazione passa da askConfirm, che è una scheda: si conferma.
    a.eval('allegatoElimina(' + JSON.stringify(id) + '); confirmYes();');
    assert.equal(a.snapshot().attachments.length, 0, 'il record se ne va subito');
  });

  // Il record eliminato finisce nel cestino per TRASH_DAYS giorni, quindi si può
  // rimettere a posto: per questo i byte non vanno buttati come orfani finché
  // la voce di cestino è lì.
  it('ripristinato dal cestino, l\'allegato ha ancora il suo file', async () => {
    const a = app();
    const id = await aggiungi(a, 'M1', file('disegno.pdf'));
    a.eval('allegatoElimina(' + JSON.stringify(id) + '); confirmYes();');
    await new Promise(r => setImmediate(r));
    a.eval('Store.restore(db.trash[db.trash.length - 1].id)');
    const blob = await a.eval('allegatoLeggi(' + JSON.stringify(id) + ')');
    assert.ok(blob, 'prima i byte se ne andavano subito, e il ripristino dava un allegato vuoto');
  });

  it('un allegato eliminato di recente non è un file orfano', async () => {
    const a = app();
    const id = await aggiungi(a, 'M1', file('disegno.pdf'));
    a.eval('allegatoElimina(' + JSON.stringify(id) + '); confirmYes();');
    const orfani = await a.eval('allegatiOrfani()');
    assert.deepEqual(Array.from(orfani), [],
      'finché si può annullare l\'eliminazione, il file deve restare dov\'è');
  });

  it('un file senza più nessun record risulta orfano', async () => {
    const a = app();
    await aggiungi(a, 'M1', file('disegno.pdf'));
    // Il caso vero: database importato da un altro PC, o articolo sparito.
    a.eval('db.attachments = []; db.trash = [];');
    const orfani = await a.eval('allegatiOrfani()');
    assert.equal(Array.from(orfani).length, 1, 'lo spazio va recuperabile');
  });
});

describe('Allegati — il backup', () => {
  it('porta l\'elenco degli allegati', async () => {
    const a = app();
    await aggiungi(a, 'M1', file('disegno.pdf'));
    const snap = JSON.parse(a.eval('Store.exportSnapshot()'));
    assert.equal(snap.attachments.length, 1);
    assert.equal(snap.attachments[0].name, 'disegno.pdf');
  });

  // È il punto su cui l'app deve essere onesta, e lo dice in tre posti
  // (Gestione, la scheda, il README): il JSON non contiene i file.
  it('ma non il contenuto dei file', async () => {
    const a = app();
    await aggiungi(a, 'M1', file('disegno.pdf', 1024, 'CONTENUTO-SEGRETO'));
    assert.ok(!a.eval('Store.exportSnapshot()').includes('CONTENUTO-SEGRETO'),
      'i byte non stanno nel JSON: è l\'intero motivo per cui vivono in IndexedDB');
  });
});

describe('Allegati — la collezione', () => {
  it('è dichiarata nello schema, come tutte le altre', () => {
    const a = app();
    assert.ok(a.eval('!!Store.schema().attachments'), 'senza, il giorno del cloud resterebbe indietro');
    assert.equal(a.eval('Store.schema().attachments.table'), 'attachments');
  });

  it('il riferimento all\'articolo è dichiarato in REFS', () => {
    const a = app();
    assert.equal(a.eval('REFS.attachments.fields.itemId'), 'item');
  });

  it('un database vuoto la trova già pronta', () => {
    const a = app();
    a.eval('Store.clearAll(null)');
    assert.ok(Array.isArray(a.snapshot().attachments), 'una collezione dichiarata esiste sempre');
  });
});
