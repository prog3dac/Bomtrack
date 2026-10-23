// I documenti emessi: la copia PDF di richieste, ordini e ordini di lavoro,
// scritta nella cartella d'archivio quando il documento diventa ufficiale.
//
// Le proprietà che contano:
//
//   1. **si archivia quando parte**, non a ogni click: «Segna come inviato»
//      scrive la copia, una ristampa dello stesso documento non chiede niente;
//   2. **una copia emessa non si sovrascrive mai**: un documento cambiato dopo
//      l'invio diventa una revisione nuova, e un nome già preso in cartella
//      resta di chi l'ha;
//   3. **senza cartella non si perde niente**: il download resta, e l'app dice
//      che la copia non è stata archiviata;
//   4. **la verifica** trova le copie sparite e quelle sostituite a mano.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

// jsPDF finto: annota il download e consegna, a chi lo chiede, un «PDF» fatto
// del numero del documento e di quante volte è stato generato. Basta a
// distinguere una copia dall'altra e a calcolarne l'impronta.
const FINTI = `
  scaricati.length = 0;
  var __generati = 0;
  jspdf = { jsPDF: function () {
    const self = this;
    self.n = ++__generati;
    self.lastAutoTable = { finalY: 40 };
    self.internal = { pageSize: { getWidth: function () { return 297; }, getHeight: function () { return 210; } } };
    self.setFontSize = self.setTextColor = function () { return self; };
    self.splitTextToSize = function (t) { return [String(t)]; };
    self.addPage = function () {};
    self.text = function () {};
    self.autoTable = function () {};
    self.save = function (nome) { scaricati.push({ tipo: 'pdf', nome: nome }); };
    self.output = function () {
      const testo = 'PDF-' + self.n;
      return { _testo: testo, size: testo.length,
        arrayBuffer: function () { return Promise.resolve(new TextEncoder().encode(testo).buffer); } };
    };
  } };
  qrPdfDraw = function () {};
`;

function app(stato, files, opt) {
  const a = loadApp({ silent: true });
  a.eval(FINTI);
  a.setDb(makeDb({
    suppliers: [{ id: 's1', name: 'SKF', active: true }],
    items: [acq('C1', 5)],
    orders: [{ id: 'o1', number: 'ODA-2026-007', status: stato || 'bozza', supplierId: 's1', date: '2026-08-02',
      active: true, createdAt: '2026-08-02T08:00:00.000Z', updatedAt: '2026-08-02T08:00:00.000Z',
      lines: [{ id: 'l1', itemId: 'C1', code: 'C1', description: 'Cuscinetto', qty: 2, price: 5, uom: 'pz' }] }],
  }));
  a.asRole((opt && opt.ruolo) || 'admin');
  const cartella = files || {};
  // `senzaArchivio`: il browser saprebbe, ma questo PC la cartella non l'ha scelta.
  a.archivio(cartella, { collega: !(opt && opt.senzaArchivio) });
  return { a, files: cartella };
}
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
const emessi = a => JSON.parse(a.eval('JSON.stringify(db.generatedDocs)'));
const scaricati = a => JSON.parse(a.eval('JSON.stringify(scaricati)'));
// Le scritture in cartella e l'impronta sono asincrone: si aspetta che
// l'effetto ci sia, con un tetto.
async function finche(cond) {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise(r => setTimeout(r, 5));
}
const PERCORSO = 'Documenti Bomtrack/ODA/2026/ODA-2026-007_SKF.pdf';

describe('Documenti emessi — quando si archivia', () => {
  it('«Segna come inviato» scrive il PDF in archivio e lo registra', async () => {
    const { a, files } = app('bozza');
    a.eval('exportOrderPDF("o1")');
    assert.equal(scaricati(a).length, 1, 'il download resta');
    assert.match(a.eval('_confirmFn ? "sì" : "no"'), /sì/);
    a.eval('confirmYes()');
    await finche(() => emessi(a).length);
    assert.equal(a.eval('getOrder("o1").status'), 'inviato');
    const [d] = emessi(a);
    assert.equal(d.kind, 'order');
    assert.equal(d.refId, 'o1');
    assert.equal(d.number, 'ODA-2026-007');
    assert.equal(d.seq, 0);
    assert.equal(d.path, PERCORSO);
    assert.equal(d.format, 'pdf');
    assert.equal(d.sentVia, 'manuale');
    assert.ok(d.sentAt);
    assert.equal(files[PERCORSO], 'PDF-1');
    assert.equal(d.sha256, sha('PDF-1'));
  });

  it('«No, resta in bozza» non archivia niente', () => {
    const { a, files } = app('bozza');
    a.eval('exportOrderPDF("o1")');
    a.eval('confirmNo()');
    assert.equal(emessi(a).length, 0);
    assert.deepEqual(Object.keys(files), []);
  });

  it('la ristampa di un documento già archiviato e non cambiato non chiede niente', async () => {
    const { a } = app('bozza');
    a.eval('exportOrderPDF("o1")');
    a.eval('confirmYes()');
    await finche(() => emessi(a).length);
    a.eval('exportOrderPDF("o1")');
    assert.equal(a.eval('_confirmFn === null'), true);
    assert.equal(scaricati(a).length, 2);
    assert.equal(emessi(a).length, 1);
  });

  it('un documento cambiato dopo l\'ultima copia diventa una revisione, senza toccare la prima', async () => {
    const { a, files } = app('bozza');
    a.eval('exportOrderPDF("o1")');
    a.eval('confirmYes()');
    await finche(() => emessi(a).length);
    a.eval('getOrder("o1").updatedAt = "2999-01-01T00:00:00.000Z"');
    a.eval('exportOrderPDF("o1")');
    a.eval('confirmYes()');
    await finche(() => emessi(a).length === 2);
    const [prima, rev] = emessi(a);
    assert.equal(rev.seq, 1);
    assert.equal(rev.path, 'Documenti Bomtrack/ODA/2026/ODA-2026-007_SKF_r1.pdf');
    assert.equal(files[prima.path], 'PDF-1', 'la prima copia resta com\'era');
    assert.equal(files[rev.path], 'PDF-2');
  });

  it('un documento inviato prima di questa funzione propone la sua prima copia', async () => {
    const { a } = app('inviato');
    a.eval('exportOrderPDF("o1")');
    assert.equal(a.eval('_confirmFn !== null'), true);
    a.eval('confirmYes()');
    await finche(() => emessi(a).length);
    assert.equal(emessi(a)[0].seq, 0);
  });

  it('il pulsante «Archivia» non scarica e non chiede', async () => {
    const { a } = app('inviato');
    a.eval('docEmessoArchiviaOra("order", "o1")');
    await finche(() => emessi(a).length);
    assert.equal(scaricati(a).length, 0);
    assert.equal(emessi(a).length, 1);
  });

  it('richieste e ordini di lavoro vanno nelle loro cartelle', () => {
    const { a } = app();
    const p = a.eval(`[docEmessoPercorso('rfq', { date: '2025-12-30' }, 'RDO-1_SKF.pdf', 0),
      docEmessoPercorso('workOrder', { date: '2026-01-02' }, 'ODL-1_Beta.pdf', 2)].join('|')`);
    assert.equal(p, 'Documenti Bomtrack/RFQ/2025/RDO-1_SKF.pdf|Documenti Bomtrack/ODL/2026/ODL-1_Beta_r2.pdf');
  });
});

describe('Documenti emessi — mai sovrascrivere', () => {
  it('un nome già preso in cartella resta di chi l\'ha, e si registra il percorso vero', async () => {
    const { a, files } = app('bozza', { [PERCORSO]: 'DEL COLLEGA' });
    a.eval('exportOrderPDF("o1")');
    a.eval('confirmYes()');
    await finche(() => emessi(a).length);
    assert.equal(files[PERCORSO], 'DEL COLLEGA');
    assert.equal(emessi(a)[0].path, 'Documenti Bomtrack/ODA/2026/ODA-2026-007_SKF (2).pdf');
    assert.equal(files[emessi(a)[0].path], 'PDF-1');
  });
});

describe('Documenti emessi — senza cartella e senza permessi', () => {
  it('senza cartella d\'archivio il PDF si scarica e si segna inviato, senza copia', async () => {
    const { a } = app('bozza', null, { senzaArchivio: true });
    a.eval('exportOrderPDF("o1")');
    a.eval('confirmYes()');
    await finche(() => false);
    assert.equal(a.eval('getOrder("o1").status'), 'inviato');
    assert.equal(scaricati(a).length, 1);
    assert.equal(emessi(a).length, 0);
  });

  it('chi non scrive i documenti scarica e basta', () => {
    const { a } = app('inviato', null, { ruolo: 'officina' });
    a.eval('exportOrderPDF("o1")');
    assert.equal(a.eval('_confirmFn === null'), true);
    assert.equal(scaricati(a).length, 1);
    assert.equal(emessi(a).length, 0);
  });

  it('la scheda dice perché il PDF resta un download', () => {
    const { a } = app('inviato', null, { senzaArchivio: true });
    assert.match(a.eval('docEmessiHtml("order", getOrder("o1"))'), /non è impostata su questo PC/);
  });

  it('su un browser senza cartelle lo dice, e il PDF resta un download', () => {
    const { a } = app('inviato');
    a.eval('delete window.showDirectoryPicker;');
    assert.match(a.eval('docEmessiHtml("order", getOrder("o1"))'), /servono Chrome o Edge/);
    a.eval('exportOrderPDF("o1")');
    assert.equal(a.eval('_confirmFn === null'), true);
    assert.equal(scaricati(a).length, 1);
  });
});

describe('Documenti emessi — in scheda', () => {
  it('elenca le copie dalla più recente, con il pulsante per aprirle', async () => {
    const { a } = app('inviato');
    a.eval('docEmessoArchiviaOra("order", "o1")');
    await finche(() => emessi(a).length);
    a.eval('getOrder("o1").updatedAt = "2999-01-01T00:00:00.000Z"');
    a.eval('docEmessoArchiviaOra("order", "o1")');
    await finche(() => emessi(a).length === 2);
    const html = a.eval('docEmessiHtml("order", getOrder("o1"))');
    assert.ok(html.indexOf('Revisione 1') < html.indexOf('Prima emissione'));
    assert.match(html, /Archivia come nuova revisione/);
    assert.match(html, /Copie in archivio \(2\)/);
  });

  it('su una bozza dice quando la copia arriverà, e non offre il pulsante', () => {
    const { a } = app('bozza');
    const html = a.eval('docEmessiHtml("order", getOrder("o1"))');
    assert.match(html, /quando il documento si segna come inviato/);
    assert.doesNotMatch(html, /docEmessoArchiviaOra/);
  });

  it('aprire una copia la consegna al visualizzatore', async () => {
    const { a } = app('inviato');
    a.eval('docEmessoArchiviaOra("order", "o1")');
    await finche(() => emessi(a).length);
    assert.equal(await a.eval(`docEmessoApri(${JSON.stringify(emessi(a)[0].id)})`), 'ok');
  });
});

describe('Documenti emessi — la verifica', () => {
  it('trova le copie sparite e quelle sostituite a mano', async () => {
    const { a, files } = app('inviato');
    a.eval(`db.generatedDocs = [
      { id: 'g1', kind: 'order', refId: 'o1', number: 'ODA-1', seq: 0, path: 'Documenti Bomtrack/ODA/2026/a.pdf', sha256: '${sha('ORIGINALE')}' },
      { id: 'g2', kind: 'order', refId: 'o1', number: 'ODA-1', seq: 1, path: 'Documenti Bomtrack/ODA/2026/b.pdf', sha256: '${sha('B')}' },
      { id: 'g3', kind: 'order', refId: 'o1', number: 'ODA-1', seq: 2, path: 'Documenti Bomtrack/ODA/2026/c.pdf', sha256: '' }];`);
    files['Documenti Bomtrack/ODA/2026/a.pdf'] = 'RITOCCATO';
    files['Documenti Bomtrack/ODA/2026/c.pdf'] = 'C';
    const e = await a.eval('docEmessiVerifica()');
    assert.deepEqual(Array.from(e.mancanti).map(d => d.id), ['g2']);
    assert.deepEqual(Array.from(e.alterati).map(d => d.id), ['g1']);
  });

  it('i documenti emessi non finiscono nell\'elenco degli allegati da collegare', async () => {
    const { a } = app('inviato', { 'catalogo.pdf': 'x', 'Documenti Bomtrack/a.pdf': 'y', 'altro/Documenti Bomtrack/b.pdf': 'z' });
    const lista = await a.eval('archivioElenco(true)');
    assert.deepEqual(Array.from(lista).map(f => f.path).sort(), ['altro/Documenti Bomtrack/b.pdf', 'catalogo.pdf']);
  });
});

describe('Documenti emessi — nel database', () => {
  it('la collezione esiste anche in un database salvato prima', () => {
    const { a } = app();
    a.eval('delete db.generatedDocs; migrateDB();');
    assert.equal(a.eval('Array.isArray(db.generatedDocs)'), true);
    assert.equal(a.eval('Store.schema().generatedDocs.table'), 'generated_docs');
  });
});

describe('Documenti emessi — il documento eliminato', () => {
  async function conCopia() {
    const r = app('inviato');
    r.a.eval('docEmessoArchiviaOra("order", "o1")');
    await finche(() => emessi(r.a).length);
    return r;
  }

  it('l\'eliminazione avvisa che la copia resta, e non tocca né il file né il record', async () => {
    const { a, files } = await conCopia();
    a.eval('var __msg = ""; var __ac = askConfirm; askConfirm = function (m, f, o) { __msg = m; return __ac(m, f, o); };');
    a.eval('delOrder("o1")');
    assert.match(a.eval('__msg'), /La copia PDF in archivio resta nella cartella/);
    a.eval('confirmYes()');
    assert.equal(a.eval('getOrder("o1") ? "c\'è" : "eliminato"'), 'eliminato');
    assert.equal(emessi(a).length, 1);
    assert.equal(files[PERCORSO], 'PDF-1');
  });

  it('in Gestione la copia di un documento eliminato si ritrova, e si apre', async () => {
    const { a } = await conCopia();
    a.eval('Store.remove("orders", "o1")');
    assert.equal(a.eval('docEmessiOrfani().length'), 1);
    const html = a.eval('docEmessiVerificaHtml()');
    assert.match(html, /Copie di documenti eliminati \(1\)/);
    assert.match(html, /ODA-2026-007/);
    assert.match(html, /docEmessoApri/);
  });

  it('ripristinato dal cestino, il documento ritrova le sue copie', async () => {
    const { a } = await conCopia();
    a.eval('Store.remove("orders", "o1")');
    a.eval('Store.restore(Store.lastRemoved())');
    assert.equal(a.eval('docEmessiOrfani().length'), 0);
    assert.equal(a.eval('docEmessi("order", "o1").length'), 1);
  });
});
