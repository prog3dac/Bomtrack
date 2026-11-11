// Testi per i documenti (dalla 0.154.1): scritti una volta in Gestione, si
// inseriscono nelle note con «＋ Testo» o escono sempre in fondo al PDF.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

const FINTI = `
  scaricati.length = 0;
  jspdf = { jsPDF: function () {
    const self = this;
    self.testi = []; self.pagine = 1;
    self.lastAutoTable = { finalY: 40 };
    self.internal = { pageSize: { getWidth: function () { return 297; }, getHeight: function () { return 210; } },
      getNumberOfPages: function () { return self.pagine; } };
    self.setPage = function () { return self; };
    self.setFontSize = self.setTextColor = function () { return self; };
    self.splitTextToSize = function (t) { return [String(t)]; };
    self.addPage = function () { self.pagine++; };
    self.text = function (t) { self.testi.push(Array.isArray(t) ? t.join(' ') : String(t)); };
    self.autoTable = function () {};
    self.save = function (nome) { scaricati.push({ nome: nome, testi: self.testi }); };
  } };
  XLSX = { utils: {
      aoa_to_sheet: function (data) { return { _data: data }; },
      book_new: function () { return { fogli: [] }; },
      book_append_sheet: function (wb, ws) { wb.fogli.push(ws); },
    },
    writeFile: function (wb, nome) { scaricati.push({ nome: nome, celle: wb.fogli[0]._data }); },
  };
  qrPdfDraw = function () {};
  askMarkSent = function () {};
`;

const TESTI = [
  { id: 't1', title: 'Imballo', text: 'Imballare su pallet a perdere.', docs: ['order', 'odl'], always: false },
  { id: 't2', title: 'Condizioni generali', text: 'Vale il nostro capitolato CGA-01.', docs: ['order'], always: true },
  { id: 't3', title: 'Offerta', text: 'Indicare i tempi di consegna.', docs: ['rfq'], always: false },
];

function app(role) {
  const a = loadApp({ silent: true });
  a.eval(FINTI);
  a.setDb(makeDb({
    settings: { currency: '€', docTexts: JSON.parse(JSON.stringify(TESTI)) },
    suppliers: [{ id: 's1', name: 'SKF', active: true }],
    items: [acq('c1', 5)],
    rfqs: [{ id: 'r1', number: 'RDO-1', title: '', status: 'bozza', date: '2026-11-01', supplierId: 's1', active: true, notes: '',
      lines: [{ id: 'rl1', itemId: 'c1', code: 'c1', description: 'x', uom: 'pz', qty: 1, price: '', deliveryDate: '' }] }],
    orders: [{ id: 'o1', number: 'ODA-1', title: '', status: 'bozza', date: '2026-11-01', supplierId: 's1', active: true, notes: 'Urgente',
      lines: [{ id: 'l1', itemId: 'c1', code: 'c1', description: 'x', uom: 'pz', qty: 1, price: 5, received: 0 }] }],
  }));
  a.asRole(role || 'admin');
  return a;
}

describe('Testi per i documenti', () => {
  it('«＋ Testo» offre solo i testi a scelta di quel tipo di documento', () => {
    const a = app();
    a.eval('renderOrders(); openOrderEdit("o1")');
    const h = a.html('view-orders');
    assert.match(h, /docInserisciTesto\('ord','o1','t1'\)/);
    assert.ok(!/'t2'\)/.test(h), 'un testo «sempre» non si inserisce');
    assert.ok(!/'t3'\)/.test(h), 'un testo della richiesta non sta sull\'ordine');
    a.eval('renderRfq(); openRfqEdit("r1")');
    assert.match(a.html('view-rfq'), /docInserisciTesto\('rfq','r1','t3'\)/);
  });

  it('senza testi il pulsante non c\'è', () => {
    const a = app();
    a.eval('db.settings.docTexts = []; renderOrders(); openOrderEdit("o1")');
    assert.ok(!/＋ Testo/.test(a.html('view-orders')));
  });

  it('il testo si aggiunge in fondo alle note, una volta sola', () => {
    const a = app();
    a.eval('renderOrders(); openOrderEdit("o1"); docInserisciTesto("ord","o1","t1")');
    assert.equal(a.eval('getOrder("o1").notes'), 'Urgente\nImballare su pallet a perdere.');
    a.eval('docInserisciTesto("ord","o1","t1")');
    assert.equal(a.eval('getOrder("o1").notes'), 'Urgente\nImballare su pallet a perdere.');
  });

  it('un testo «sempre» esce in fondo al PDF e all\'Excel del suo tipo', () => {
    const a = app();
    a.eval('exportOrderPDF("o1")');
    assert.ok(a.eval('scaricati[0].testi.join("\\n")').includes('Condizioni generali: Vale il nostro capitolato CGA-01.'));
    a.eval('exportOrderExcel("o1")');
    const celle = JSON.parse(a.eval('JSON.stringify(scaricati[1].celle)'));
    assert.ok(celle.some(r => r[0] === 'Condizioni generali' && r[1] === 'Vale il nostro capitolato CGA-01.'));
    a.eval('exportRfqPDF("r1")');
    assert.ok(!a.eval('scaricati[2].testi.join("\\n")').includes('CGA-01'), 'non sulla richiesta');
  });

  it('in Gestione si aggiungono, si modificano e si eliminano', () => {
    const a = app();
    a.eval('mgmtTab = "testi"; renderManage()');
    assert.match(a.eval('renderDocTexts()'), /value="Imballo"/);
    a.eval('docTestoNuovo()');
    const id = a.eval('db.settings.docTexts[3].id');
    a.eval(`docTestoSet('${id}','title','Certificati'); docTestoSet('${id}','text','Allegare il 3.1.  \\n'); docTestoDoc('${id}','rfq',false); docTestoSet('${id}','always',true)`);
    const t = JSON.parse(a.eval('JSON.stringify(db.settings.docTexts[3])'));
    assert.deepEqual([t.title, t.text, t.docs, t.always], ['Certificati', 'Allegare il 3.1.', ['order', 'odl'], true]);
    a.eval(`askConfirm = function (m, ok) { ok(); }; docTestoDel('${id}')`);
    assert.equal(a.eval('db.settings.docTexts.length'), 3);
  });

  it('chi non gestisce le impostazioni non li cambia', () => {
    const a = app('lettore');
    a.eval('docTestoNuovo(); docTestoSet("t1","text","altro")');
    assert.equal(a.eval('db.settings.docTexts.length'), 3);
    assert.equal(a.eval('db.settings.docTexts[0].text'), 'Imballare su pallet a perdere.');
  });
});
