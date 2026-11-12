// Testi per i documenti (dalla 0.155.0): scritti una volta in Gestione, si
// scelgono dal pulsante «Testi sul PDF» del documento (dalla 0.155.1, senza
// passare dalle note) o escono sempre in fondo al PDF. Sul foglio va il testo,
// non il titolo.

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
  it('il pulsante sta nella barra, con quanti testi escono e i loro titoli', () => {
    const a = app();
    a.eval('getOrder("o1").texts = [{ id: "t1", title: "Imballo", text: "Imballare su pallet a perdere." }]; renderOrders(); openOrderEdit("o1")');
    const h = a.html('view-orders');
    const rail = h.slice(h.indexOf('class="doc-rail"'), h.indexOf('</aside>'));
    assert.match(rail, /docTestiApri\('order','o1'\)/);
    assert.match(rail, /Testi sul PDF <span class="conta-pill">2<\/span>/);
    assert.match(rail, /Condizioni generali · Imballo/);
    assert.ok(!/docInserisciTesto|＋ Testo/.test(h), 'niente più testi dentro le note');
  });

  it('senza testi in Gestione il pulsante non c\'è', () => {
    const a = app();
    a.eval('db.settings.docTexts = []; renderOrders(); openOrderEdit("o1")');
    assert.ok(!/docTestiApri/.test(a.html('view-orders')));
  });

  it('la finestra elenca i testi del tipo, con i «sempre» spuntati e fermi', () => {
    const a = app();
    a.eval('globalThis.__m = ""; openModal = h => { __m = h; }; renderOrders(); openOrderEdit("o1"); docTestiApri("order","o1")');
    const m = a.eval('__m');
    assert.match(m, /value="t2" checked disabled/);
    assert.match(m, /value="t1"\s+onchange/, "a scelta: libero e non spuntato");
    assert.ok(!/value="t3"/.test(m), 'un testo della richiesta non sta sull\'ordine');
  });

  it('la scelta si copia sul documento, non nelle note, e resta se poi il testo cambia', () => {
    const a = app();
    a.eval('renderOrders(); openOrderEdit("o1"); docTestiImposta("order","o1",["t1"])');
    assert.equal(a.eval('getOrder("o1").notes'), 'Urgente');
    assert.deepEqual(JSON.parse(a.eval('JSON.stringify(getOrder("o1").texts)')), [{ id: 't1', title: 'Imballo', text: 'Imballare su pallet a perdere.' }]);
    a.eval('db.settings.docTexts[0].text = "Altro"; docTestiImposta("order","o1",["t1"])');
    assert.equal(a.eval('getOrder("o1").texts[0].text'), 'Imballare su pallet a perdere.', 'resta la copia di quando si è scelto');
    a.eval('docTestiImposta("order","o1",[])');
    assert.equal(a.eval('getOrder("o1").texts.length'), 0);
  });

  it('un testo «sempre» e quelli scelti escono in fondo al PDF e all\'Excel, senza titolo', () => {
    const a = app();
    a.eval('getOrder("o1").texts = [{ id: "t1", title: "Imballo", text: "Imballare su pallet a perdere." }]; exportOrderPDF("o1")');
    const t = a.eval('scaricati[0].testi.join("\\n")');
    assert.ok(t.includes('Vale il nostro capitolato CGA-01.\nImballare su pallet a perdere.'), t);
    assert.ok(!/Condizioni generali:|Imballo:/.test(t), 'il titolo non va sul foglio');
    a.eval('exportOrderExcel("o1")');
    const celle = JSON.parse(a.eval('JSON.stringify(scaricati[1].celle)'));
    assert.ok(celle.some(r => r.length === 1 && r[0] === 'Vale il nostro capitolato CGA-01.'));
    assert.ok(celle.some(r => r.length === 1 && r[0] === 'Imballare su pallet a perdere.'));
    a.eval('exportRfqPDF("r1")');
    assert.ok(!a.eval('scaricati[2].testi.join("\\n")').includes('CGA-01'), 'non sulla richiesta');
  });

  it('su un ordine protetto i testi non cambiano senza sblocco', () => {
    const a = app();
    a.eval('getOrder("o1").status = "confermato"; renderOrders(); openOrderEdit("o1")');
    assert.equal(a.eval('docTestiImposta("order","o1",["t1"])'), false);
    assert.equal(a.eval('getOrder("o1").texts ? getOrder("o1").texts.length : 0'), 0);
  });

  it('la frase su DDT e fattura diventa un testo «sempre» di Gestione, una volta sola', () => {
    const a = app();
    a.eval('db.settings.docTexts = []; delete db.settings.docTextsRifDdt; migrateDB()');
    const t = JSON.parse(a.eval('JSON.stringify(db.settings.docTexts)'));
    assert.equal(t.length, 1);
    assert.deepEqual([t[0].always, t[0].docs], [true, ['order', 'odl']]);
    assert.match(t[0].text, /n° ordine e il n° di riga su DDT e fattura/);
    a.eval('db.settings.docTexts = []; migrateDB()');
    assert.equal(a.eval('db.settings.docTexts.length'), 0, 'eliminata, non torna');
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
