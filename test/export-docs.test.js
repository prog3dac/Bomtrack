// Export PDF ed Excel dei documenti: richiesta, ordine, ordine di lavoro.
//
// Erano le funzioni più esposte dell'app senza un solo test — e
// `docs/analisi-tecnica.md` (C1, C3) le indica da tempo come il motivo per cui
// la deduplica della presentazione non si può fare: «un export si verifica sui
// dati che produce, non sul PDF. Serve prima quello».
//
// Questo è quello. Non si scrive nessun file: si sostituiscono jsPDF e SheetJS
// con due finti che **annotano** ciò che l'app passa loro — le righe della
// tabella, il piede, il nome del file — e si verifica quello. È la stessa
// scelta di export-lists.test.js, spinta un passo più in là: lì si controlla la
// specifica che descrive l'elenco, qui il contenuto vero e proprio.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

// ─── I due finti ───
// jsPDF raccoglie le chiamate ad autoTable (head/body/foot), il testo scritto a
// mano e il nome con cui il documento sarebbe stato salvato. SheetJS conserva
// la matrice di celle così com'è: è esattamente il foglio che si aprirebbe.
const FINTI = `
  scaricati.length = 0;
  jspdf = { jsPDF: function (opts) {
    const self = this;
    self.opts = opts || null;
    self.tabelle = []; self.testi = []; self.pagine = 1;
    self.lastAutoTable = { finalY: 40 };
    self.internal = { pageSize: { getWidth: function () { return 210; }, getHeight: function () { return 297; } },
      getNumberOfPages: function () { return self.pagine; } };
    self.setPage = function () { return self; };
    self.setFontSize = function () { return self; };
    self.setTextColor = function () { return self; };
    self.splitTextToSize = function (t, w) {
      const perRiga = Math.max(1, Math.floor(w / 2));
      const s = String(t); const out = [];
      for (let i = 0; i < s.length; i += perRiga) out.push(s.slice(i, i + perRiga));
      return out;
    };
    self.addPage = function () { self.pagine++; };
    self.text = function (t, x, y) { self.testi.push({ testo: Array.isArray(t) ? t.join('') : String(t), y: y }); };
    self.autoTable = function (cfg) { self.tabelle.push(cfg); self.lastAutoTable = { finalY: 40 }; };
    self.save = function (nome) { scaricati.push({ tipo: 'pdf', nome: nome, doc: self }); };
  } };
  XLSX = { utils: {
      aoa_to_sheet: function (data) { return { _data: data }; },
      book_new: function () { return { fogli: [] }; },
      book_append_sheet: function (wb, ws, nome) { wb.fogli.push({ nome: nome, ws: ws }); },
    },
    writeFile: function (wb, nome) { scaricati.push({ tipo: 'xlsx', nome: nome, wb: wb }); },
  };
`;

function app(dbObj) {
  const a = loadApp({ silent: true });
  a.eval(FINTI);
  a.setDb(dbObj);
  a.asRole('admin');
  return a;
}
// Quello che l'app avrebbe consegnato, riportato nel realm di Node.
const scaricato = (a, i) => JSON.parse(a.eval('JSON.stringify(scaricati[' + (i || 0) + '])'));
const nomeFile = (a, i) => a.eval('scaricati[' + (i || 0) + '].nome');
// Solo le cifre di un importo formattato («€3.02» → 3.02).
const num = v => Number(String(v).replace(/[^0-9.-]/g, ''));

function base(extra) {
  return makeDb(Object.assign({
    settings: { company: { name: 'Officina Bianchi', vat: '01234567890' } },
    suppliers: [{ id: 's1', name: 'SKF Italia', active: true }],
    items: [acq('C1', 5)],
  }, extra || {}));
}
function ordine(campi, righe) {
  return base({
    orders: [Object.assign({
      id: 'o1', number: 'ODA-2026-007', status: 'inviato', supplierId: 's1',
      date: '2026-08-02', active: true, lines: righe,
    }, campi || {})],
  });
}
const riga = (id, prezzo) => ({ id, code: 'C1', description: 'Cuscinetto', qty: 1, price: prezzo, uom: 'pz' });

// ═══════════════════════════════════════════════════════════
//  Il totale e le righe devono raccontare la stessa cifra
// ═══════════════════════════════════════════════════════════
// Tre righe dallo stesso prezzo a quattro decimali — che il listino ammette
// (step 0.0001) — sono il caso in cui la colonna e il piede divergevano: ogni
// riga veniva arrotondata ai centesimi per essere stampata, il totale sommava i
// prodotti a piena precisione e arrotondava solo alla fine.
describe('Export documenti — il totale torna con le righe', () => {
  it('PDF: la colonna Importo somma al totale stampato nel piede', () => {
    const a = app(ordine(null, [riga('a', 1.005), riga('b', 1.005), riga('c', 1.005)]));
    a.eval('exportOrderPDF("o1")');
    const cfg = scaricato(a).doc.tabelle[0];
    const iImporto = cfg.head[0].indexOf('Importo\nAmount');
    assert.ok(iImporto > 0, 'la colonna Importo deve esserci');
    const somma = cfg.body.reduce((s, r) => s + num(r[iImporto]), 0);
    const piede = num(cfg.foot[0].filter(c => c && c.content).pop().content);
    assert.equal(somma.toFixed(2), piede.toFixed(2),
      'un fornitore che somma la colonna deve ritrovare il totale scritto sotto');
  });

  it('Excel: la colonna Importo somma al TOTALE IMPONIBILE', () => {
    const a = app(ordine(null, [riga('a', 1.005), riga('b', 1.005), riga('c', 1.005)]));
    a.eval('exportOrderExcel("o1")');
    const data = scaricato(a).wb.fogli[0].ws._data;
    const iIntest = data.findIndex(r => r[0] === '#');
    const iImporto = data[iIntest].findIndex(c => String(c).startsWith('Importo'));
    const righe = data.slice(iIntest + 1).filter(r => typeof r[0] === 'number');
    assert.equal(righe.length, 3, 'tre righe di dettaglio');
    const somma = righe.reduce((s, r) => s + (Number(r[iImporto]) || 0), 0);
    const tot = data.find(r => r[1] === 'TOTALE IMPONIBILE / TOTAL');
    assert.equal(+somma.toFixed(2), +Number(tot[2]).toFixed(2),
      'in Excel la colonna si somma per davvero: se non torna, si vede subito');
  });

  it('vale anche per l\'ordine di lavoro', () => {
    const db = base({
      workOrders: [{ id: 'w1', number: 'ODL-2026-003', status: 'inviato', supplierId: 's1',
        date: '2026-08-02', active: true,
        lines: [riga('a', 0.335), riga('b', 0.335), riga('c', 0.335)] }],
    });
    const a = app(db);
    a.eval('exportOdlPDF("w1")');
    const cfg = scaricato(a).doc.tabelle[0];
    const iImporto = cfg.head[0].indexOf('Importo\nAmount');
    const somma = cfg.body.reduce((s, r) => s + num(r[iImporto]), 0);
    const piede = num(cfg.foot[0].filter(c => c && c.content).pop().content);
    assert.equal(somma.toFixed(2), piede.toFixed(2));
  });
});

// ═══════════════════════════════════════════════════════════
//  Il nome del file
// ═══════════════════════════════════════════════════════════
// In officina «AB/123-01» è un codice normale e «Rossi & C. / Milano» una
// ragione sociale normale. Il browser, davanti a un nome di file invalido, non
// protesta: tronca o salva con un altro nome, e il documento non si ritrova.
const VIETATI = /[\\/:*?"<>|]/;
describe('Export documenti — il nome del file', () => {
  it('un numero di documento con la barra non produce un nome invalido', () => {
    const a = app(ordine({ number: 'ODA/2026/007' }, [riga('a', 2)]));
    a.eval('exportOrderPDF("o1")');
    const nome = nomeFile(a);
    assert.ok(!VIETATI.test(nome), 'nome con caratteri vietati: ' + nome);
    assert.ok(nome.endsWith('.pdf'));
  });

  it('anche la ragione sociale del fornitore viene ripulita', () => {
    const db = base({
      suppliers: [{ id: 's1', name: 'Rossi & C. / Milano', active: true }],
      orders: [{ id: 'o1', number: 'ODA-2026-001', status: 'inviato', supplierId: 's1',
        active: true, lines: [riga('a', 2)] }],
    });
    const a = app(db);
    a.eval('exportOrderExcel("o1")');
    const nome = nomeFile(a);
    assert.ok(!VIETATI.test(nome), 'nome con caratteri vietati: ' + nome);
    assert.ok(nome.endsWith('.xlsx'));
  });

  it('un nome che si riduce a niente ricade su un ripiego, non sul vuoto', () => {
    const a = app(ordine({ number: '///', supplierId: '' }, [riga('a', 2)]));
    a.eval('exportOrderPDF("o1")');
    assert.notEqual(nomeFile(a), '.pdf', 'un file senza nome non è un file');
  });
});

// ═══════════════════════════════════════════════════════════
//  Le condizioni in coda
// ═══════════════════════════════════════════════════════════
describe('Export documenti — le condizioni in coda', () => {
  it('una nota lunga viene mandata a capo, non tagliata al margine', () => {
    const a = app(ordine({ notes: 'N'.repeat(600) }, [riga('a', 2)]));
    a.eval('exportOrderPDF("o1")');
    const nota = scaricato(a).doc.testi.find(t => t.testo.includes('Note / Notes'));
    assert.ok(nota, 'la nota deve essere stata scritta');
    assert.ok(nota.testo.length >= 600, 'la nota non deve perdere pezzi per strada');
  });

  it('quando non ci sta più, si passa a una pagina nuova', () => {
    const a = app(ordine({ transport: 'Franco fabbrica', payment: '30 gg', notes: 'X'.repeat(12000) }, [riga('a', 2)]));
    a.eval('exportOrderPDF("o1")');
    const doc = scaricato(a).doc;
    assert.ok(doc.pagine > 1, 'il testo che non ci sta va su un foglio nuovo, non oltre il bordo');
  });

  it('trasporto, pagamento e note escono tutti e tre', () => {
    const a = app(ordine({ transport: 'Franco fabbrica', payment: '30 gg f.m.', notes: 'Consegna al mattino' }, [riga('a', 2)]));
    a.eval('exportOrderPDF("o1")');
    const testi = scaricato(a).doc.testi.map(t => t.testo).join(' | ');
    assert.ok(testi.includes('Franco fabbrica'), 'manca il trasporto');
    assert.ok(testi.includes('30 gg f.m.'), 'manca il pagamento');
    assert.ok(testi.includes('Consegna al mattino'), 'manca la nota');
  });

  it('le note interne non escono mai sul documento', () => {
    const a = app(ordine({ notes: 'Consegna al mattino', notesInternal: 'FORNITORE INAFFIDABILE' }, [riga('a', 2)]));
    a.eval('exportOrderPDF("o1")');
    assert.ok(!JSON.stringify(scaricato(a)).includes('INAFFIDABILE'),
      'quello che si scrive per sé non va sul foglio che legge il fornitore');
  });

  it('e nemmeno su quello Excel', () => {
    const a = app(ordine({ notes: 'ok', notesInternal: 'FORNITORE INAFFIDABILE' }, [riga('a', 2)]));
    a.eval('exportOrderExcel("o1")');
    assert.ok(!JSON.stringify(scaricato(a)).includes('INAFFIDABILE'));
  });
});

// ═══════════════════════════════════════════════════════════
//  Le guardie
// ═══════════════════════════════════════════════════════════
describe('Export documenti — le guardie', () => {
  it('un documento senza righe non produce nessun file', () => {
    const a = app(ordine({ status: 'bozza' }, []));
    a.eval('exportOrderPDF("o1")');
    a.eval('exportOrderExcel("o1")');
    assert.equal(a.eval('scaricati.length'), 0, 'niente righe, niente documento');
  });

  it('un id inesistente non lancia e non scarica niente', () => {
    const a = app(base({ orders: [] }));
    assert.doesNotThrow(() => a.eval('exportOrderPDF("mai-esistito")'));
    assert.doesNotThrow(() => a.eval('exportOrderExcel("mai-esistito")'));
    assert.equal(a.eval('scaricati.length'), 0);
  });

  it('senza la libreria PDF non si scarica un file vuoto', () => {
    const a = app(ordine(null, [riga('a', 2)]));
    a.eval('jspdf = null;');
    assert.doesNotThrow(() => a.eval('exportOrderPDF("o1")'));
    assert.equal(a.eval('scaricati.length'), 0, 'meglio un messaggio che un PDF a caso');
  });
});

// ═══════════════════════════════════════════════════════════
//  La richiesta di offerta
// ═══════════════════════════════════════════════════════════
describe('Export richiesta di offerta', () => {
  function rfq(campi, righe) {
    return base({
      rfqs: [Object.assign({
        id: 'r1', number: 'RFQ-2026-001', status: 'inviata', supplierId: 's1',
        date: '2026-08-01', active: true, lines: righe,
      }, campi || {})],
    });
  }

  it('ogni riga del documento finisce nella tabella, nessuna di più', () => {
    const a = app(rfq(null, [riga('a', 2), riga('b', 3)]));
    a.eval('exportRfqPDF("r1")');
    assert.equal(scaricato(a).doc.tabelle[0].body.length, 2);
  });

  it('il prezzo esce con la sua unità: «3,20» e «3,20/m» sono due offerte diverse', () => {
    const db = base({
      rfqs: [{ id: 'r1', number: 'RFQ-2026-001', status: 'bozza', supplierId: 's1', active: true,
        lines: [{ id: 'a', code: 'B1', description: 'Barra', qty: 10, price: 3.2, uom: 'm' }] }],
    });
    const a = app(db);
    a.eval('exportRfqPDF("r1")');
    const testo = JSON.stringify(scaricato(a).doc.tabelle[0].body);
    assert.ok(testo.includes('/m'), 'il denominatore del prezzo deve essere stampato');
  });

  it('una richiesta senza righe non produce niente', () => {
    const a = app(rfq(null, []));
    a.eval('exportRfqPDF("r1")');
    a.eval('exportRfqExcel("r1")');
    assert.equal(a.eval('scaricati.length'), 0);
  });
});
