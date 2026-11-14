// Che cosa esce sui documenti per i fornitori (dalla 0.154.0): disegno e
// certificato sulla riga, revisione e pagine, il rimando a DDT e fattura, i
// dati di fatturazione nostri, l'offerta del fornitore, «rispondere entro»,
// il materiale che parte con un ordine di lavoro.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

// jsPDF finto: tiene i testi scritti a mano e le tabelle.
const FINTI = `
  scaricati.length = 0;
  jspdf = { jsPDF: function () {
    const self = this;
    self.testi = []; self.tabelle = []; self.pagine = 1;
    self.lastAutoTable = { finalY: 40 };
    self.internal = { pageSize: { getWidth: function () { return 297; }, getHeight: function () { return 210; } },
      getNumberOfPages: function () { return self.pagine; } };
    self.setPage = function () { return self; };
    self.setFontSize = self.setTextColor = function () { return self; };
    self.splitTextToSize = function (t) { return [String(t)]; };
    self.addPage = function () { self.pagine++; };
    self.text = function (t) { self.testi.push(Array.isArray(t) ? t.join(' ') : String(t)); };
    self.autoTable = function (cfg) { self.tabelle.push({ head: cfg.head, body: cfg.body }); };
    self.save = function (nome) { scaricati.push({ nome: nome, doc: self }); };
    self.output = function () { return { size: 1, arrayBuffer: function () { return Promise.resolve(new ArrayBuffer(1)); } }; };
  } };
  qrPdfDraw = function () {};
  askMarkSent = function () {};
`;

function app(extra) {
  const a = loadApp({ silent: true });
  a.eval(FINTI);
  const disegnato = Object.assign(acq('c1', 5), { drawingRef: '12-345', rev: 'C', codeRevs: [{ rev: '03', from: '2026-01-01' }] });
  a.setDb(makeDb(Object.assign({
    settings: { currency: '€', modules: { qualita: true },
      company: { name: 'Officina Bianchi', vat: '01234567890', fiscalCode: 'BNCMRA80A01F257X', sdi: 'ABC1234', pec: 'bianchi@pec.it' } },
    suppliers: [{ id: 's1', name: 'SKF', active: true }],
    items: [disegnato, acq('c2', 3), { id: 'p1', code: 'P1', name: 'Staffa', type: 'parte', drawingRef: 'ST-9', rev: 'B', codeRevs: [{ rev: '01', from: '2026-01-01' }] }],
    qualityPlans: [{ id: 'q1', name: 'Cuscinetti', itemIds: ['c1'], cert: '3.1 EN 10204', sampling: 'tutto', characteristics: [], active: true }],
    rfqs: [{ id: 'r1', number: 'RDO-2026-001', title: '', status: 'bozza', date: '2026-11-01', supplierId: 's1', replyBy: '2026-11-20', active: true,
      lines: [{ id: 'rl1', itemId: 'c1', code: 'c1', description: 'Cuscinetto', uom: 'pz', qty: 10, price: '', deliveryDate: '' }] }],
    orders: [{ id: 'o1', number: 'ODA-2026-001', title: '', status: 'bozza', date: '2026-11-01', supplierId: 's1',
      supplierQuote: '245 del 03/11/2026', active: true,
      lines: [{ id: 'l1', itemId: 'c1', code: 'c1', description: 'Cuscinetto', uom: 'pz', qty: 10, price: 5, received: 0 },
        { id: 'l2', itemId: 'c2', code: 'c2', description: 'Vite', uom: 'pz', qty: 5, price: 1, received: 0 }] }],
    workOrders: [{ id: 'w1', number: 'ODL-2026-001', title: '', status: 'bozza', date: '2026-11-01', supplierId: 's1', shipDdt: '87 del 12/11/2026', active: true,
      lines: [{ id: 'wl1', itemId: null, phaseKey: 'p1#0', code: 'P1', description: 'Zincatura', uom: 'pz', qty: 40, price: 1, received: 0, startDate: '2026-11-12' },
        { id: 'wl2', itemId: null, phaseKey: 'p1#1', code: 'P1', description: 'Passivazione', uom: 'pz', qty: 40, price: 1, received: 0, startDate: '' }] }],
  }, extra || {})));
  a.asRole('admin');
  return a;
}
const pdf = (a, chiamata) => { a.eval(chiamata); return JSON.parse(a.eval('JSON.stringify(scaricati[scaricati.length - 1].doc)')); };

describe('Documenti per i fornitori', () => {
  it('la riga porta disegno, revisione e certificato del piano di controllo', () => {
    const a = app();
    const d = pdf(a, "exportOrderPDF('o1')");
    const desc = d.tabelle[0].body.map(r => r[2]);
    // La revisione del codice (dalla 0.159.0), non la lettera della distinta.
    assert.match(desc[0], /Dis\. \/ Drw\. 12-345 rev\. 03/);
    assert.match(desc[0], /Certificate required: 3\.1 EN 10204/);
    assert.equal(desc[1], 'Vite', 'un articolo senza disegno né piano resta com\'era');
  });

  it('senza modulo Qualità il certificato non esce', () => {
    const a = app();
    a.eval('db.settings.modules.qualita = false');
    assert.ok(!/Certificat/.test(a.eval("lineDescDoc(getOrder('o1').lines[0])")));
  });

  it('l\'ordine stampa l\'offerta del fornitore e le pagine', () => {
    const a = app();
    const t = pdf(a, "exportOrderPDF('o1')").testi.join('\n');
    assert.match(t, /Vostra offerta \/ Your quotation: 245 del 03\/11\/2026/);
    assert.match(t, /ODA-2026-001 · Pagina 1 di 1/);
    assert.match(t, /C\.F\. BNCMRA80A01F257X · SDI ABC1234 · PEC bianchi@pec\.it/);
  });

  it('la richiesta dice entro quando rispondere', () => {
    const a = app();
    const t = pdf(a, "exportRfqPDF('r1')").testi.join('\n');
    assert.match(t, /Rispondere entro il \/ Please reply by: 20\/11\/2026/);
  });

  it('la revisione: cambiato dopo la copia in archivio esce come la successiva', () => {
    const a = app({ generatedDocs: [{ id: 'g1', kind: 'order', refId: 'o1', number: 'ODA-2026-001', seq: 1, path: 'x.pdf', createdAt: '2026-11-02T10:00:00Z' }] });
    a.eval("getOrder('o1').status = 'inviato'; getOrder('o1').updatedAt = '2026-11-03T10:00:00Z'");
    assert.equal(a.eval("docRevisioneTesto('order', getOrder('o1'))"), 'Rev. 2 — sostituisce la rev. 1 / supersedes rev. 1');
    a.eval("getOrder('o1').updatedAt = '2026-11-01T10:00:00Z'");
    assert.equal(a.eval("docRevisioneTesto('order', getOrder('o1'))"), 'Rev. 1', 'ristampato senza modifiche resta la sua');
    assert.equal(a.eval("docRevisioneTesto('rfq', getRfq('r1'))"), '', 'senza archivio niente');
  });

  it('l\'ordine di lavoro elenca il materiale che parte, una volta per tratta, e il DDT', () => {
    const a = app();
    const m = JSON.parse(a.eval("JSON.stringify(odlMaterialeInviato(getOdl('w1')))"));
    assert.equal(m.length, 1, 'due fasi della stessa parte: il pezzo parte una volta');
    assert.equal(m[0].qty, 40);
    assert.equal(m[0].disegno, 'Dis. ST-9 rev. 01');
    const d = pdf(a, "exportOdlPDF('w1')");
    assert.equal(d.tabelle.length, 2, 'righe e materiale');
    assert.match(d.tabelle[1].head[0][0], /Materiale che vi inviamo/);
    assert.match(d.testi.join('\n'), /nostro DDT n° 87 del 12\/11\/2026 causale «conto lavorazione»/);
  });

  it('i campi nuovi stanno nelle testate', () => {
    const a = app();
    a.eval('renderOrders(); openOrderEdit("o1")');
    assert.match(a.html('view-orders'), /Vostra offerta n° \/ del<\/label><input class="lock-contract" value="245 del 03\/11\/2026"/);
    a.eval('renderRfq(); openRfqEdit("r1")');
    assert.match(a.html('view-rfq'), /Rispondere entro<\/label><input type="date" class="lock-contract" value="2026-11-20"/);
    a.eval('renderOdl(); openOdlEdit("w1")');
    assert.match(a.html('view-odl'), /DDT di invio \(conto lavorazione\)<\/label><input value="87 del 12\/11\/2026"/);
  });
});
