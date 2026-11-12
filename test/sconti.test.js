// Sconti a cascata su righe e documenti (dalla 0.157.0, modulo Listini e sconti).
//
// Le proprietà che contano:
//   1. «10+5» è il 10% e poi il 5% (0,855), il meno è una maggiorazione, e
//      quello che non si legge non entra;
//   2. `price` resta il netto della riga: lordo e sconto stanno accanto, e
//      scrivere il netto a mano toglie lo sconto;
//   3. lo sconto del documento sta sotto il totale delle righe, e il prezzo
//      pagato (costo medio, consuntivo, impegno di commessa) ne tiene conto;
//   4. il fornitore porta il suo sconto sui documenti nuovi;
//   5. PDF ed Excel aggiungono listino e sconto solo quando servono;
//   6. archivi di prima e archivio condiviso non cambiano.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

const J = (a, expr) => JSON.parse(a.eval(`JSON.stringify(${expr})`));

function app(over, moduli) {
  const a = loadApp({ silent: true });
  a.setDb(makeDb(Object.assign({
    suppliers: [{ id: 's1', name: 'Rossi', active: true, discount: '2' }, { id: 's2', name: 'Bianchi', active: true }],
    items: [acq('a1', 5), acq('a2', 3)],
    orders: [{ id: 'o1', number: 'ODA-1', status: 'bozza', supplierId: 's1', active: true, date: '2026-10-01', discount: '', lines: [
      { id: 'l1', itemId: 'a1', code: 'A1', uom: 'pz', qty: 10, price: 14, received: 0 },
      { id: 'l2', itemId: 'a2', code: 'A2', uom: 'pz', qty: 3, price: 2.5, received: 0 }] }],
    settings: { modules: moduli === undefined ? { listini: true } : moduli },
  }, over || {})));
  a.asRole('admin');
  a.eval('migrateDB()');   // i campi vuoti, come al caricamento di un archivio
  return a;
}

describe('Lo sconto si scrive come lo scrive il fornitore', () => {
  const a = app();
  it('a cascata: 10+5 è 0,855, non 0,85', () => {
    assert.equal(a.eval("scontoFattore('10+5')"), 0.855);
    assert.equal(a.eval("scontoEquivalente('10+5')"), '14,5%');
  });
  it('il meno è una maggiorazione', () => {
    assert.ok(Math.abs(a.eval("scontoFattore('10+5-2')") - 0.8721) < 1e-12);
    assert.equal(a.eval("scontoEquivalente('-3')"), '+3%');
  });
  it('spazi, virgole e simbolo % si accettano; gli zeri cadono', () => {
    assert.equal(a.eval("scontoNorm(' 10 % + 2,5 ')"), '10+2,5');
    assert.equal(a.eval("scontoNorm('10+0')"), '10');
    assert.equal(a.eval("scontoNorm('0')"), '');
    assert.equal(a.eval("scontoNorm('')"), '');
  });
  it('quello che non si legge non entra', () => {
    for (const x of ['120', 'abc', '10++5', '1+1+1+1+1', '10+', '5%5']) {
      assert.equal(a.eval(`scontoNorm(${JSON.stringify(x)})`), null, x);
      assert.equal(a.eval(`scontoFattore(${JSON.stringify(x)})`), 1, x + ' vale nessuno sconto');
    }
  });
});

describe('La riga: lordo, sconto e netto', () => {
  const riga = a => J(a, "(({ price, listPrice, discount }) => ({ price, listPrice, discount }))(getOrder('o1').lines[0])");
  it('lo sconto parte dal prezzo che c\'era, che diventa il listino', () => {
    const a = app();
    a.eval("ordSetLine('o1', 'l1', 'discount', '10+5')");
    assert.deepEqual(riga(a), { price: 11.97, listPrice: 14, discount: '10+5' });
    assert.equal(a.eval("importoRiga(getOrder('o1').lines[0])"), 119.7);
  });
  it('cambiando il listino il netto segue lo sconto', () => {
    const a = app();
    a.eval("ordSetLine('o1', 'l1', 'discount', '10'); ordSetLine('o1', 'l1', 'listPrice', '20')");
    assert.deepEqual(riga(a), { price: 18, listPrice: 20, discount: '10' });
  });
  it('togliendo lo sconto il netto torna il listino', () => {
    const a = app();
    a.eval("ordSetLine('o1', 'l1', 'discount', '10'); ordSetLine('o1', 'l1', 'discount', '')");
    assert.deepEqual(riga(a), { price: 14, listPrice: '', discount: '' });
  });
  it('scrivere il netto a mano toglie lo sconto: è un prezzo concordato', () => {
    const a = app();
    a.eval("ordSetLine('o1', 'l1', 'discount', '10'); ordSetLine('o1', 'l1', 'price', '12')");
    assert.deepEqual(riga(a), { price: 12, listPrice: '', discount: '' });
  });
  it('uno sconto che non si legge non cambia la riga', () => {
    const a = app();
    a.eval("ordSetLine('o1', 'l1', 'discount', '200')");
    assert.deepEqual(riga(a), { price: 14, listPrice: '', discount: '' });
  });
  it('a ordine inviato prezzo e sconto non si toccano', () => {
    const a = app();
    a.eval("getOrder('o1').status = 'inviato'; ordSetLine('o1', 'l1', 'discount', '10')");
    assert.deepEqual(riga(a), { price: 14, listPrice: '', discount: '' });
  });
  it('anche dalla finestra della riga', () => {
    const a = app();
    a.eval("ordEditLineModal('o1', 'l1')");
    a.eval("document.getElementById('ol-price').value = '20'; document.getElementById('ol-discount').value = '50'; document.getElementById('ol-qty').value = '10'; document.getElementById('ol-desc').value = 'x'");
    a.eval("ordSaveLineEdit('o1', 'l1')");
    assert.deepEqual(riga(a), { price: 10, listPrice: 20, discount: '50' });
  });
});

describe('La tabella delle righe', () => {
  const pagina = a => { a.eval("renderOrders(); openOrderEdit('o1')"); return a.html('view-orders'); };
  it('con il modulo: listino e sconto sopra, netto e importo sotto', () => {
    const a = app();
    a.eval("ordSetLine('o1', 'l1', 'discount', '10+5')");
    const h = pagina(a);
    assert.match(h, /Listino · Sconto %/);
    assert.match(h, /'l1','discount',this\.value/);
    assert.match(h, /class="ln-netto"[^>]*>[^<]*11,97/);
    assert.match(h, /Sconto documento %/);
  });
  it('senza il modulo la tabella è quella di sempre', () => {
    const h = pagina(app({}, {}));
    assert.doesNotMatch(h, /Listino · Sconto/);
    assert.doesNotMatch(h, /Sconto documento/);
    assert.match(h, /'l1','price',this\.value/);
  });
  it('senza il modulo, un documento che ha già degli sconti li mostra', () => {
    const a = app({}, {});
    a.eval("getOrder('o1').discount = '3'");
    assert.match(pagina(a), /Sconto documento %/);
  });
  it('l\'ordine di lavoro ha la stessa cella', () => {
    const a = app({ workOrders: [{ id: 'w1', number: 'ODL-1', status: 'bozza', supplierId: 's1', active: true, date: '2026-10-01', discount: '5', lines: [
      { id: 'w1l', itemId: null, code: 'P1', description: 'Zincatura', uom: 'pz', qty: 100, price: 0.5, received: 0, phaseKey: 'x' }] }] });
    a.eval("odlSetLine('w1', 'w1l', 'discount', '10')");
    assert.equal(a.eval("getOdl('w1').lines[0].price"), 0.45);
    a.eval("renderOdl(); openOdlEdit('w1')");
    const h = a.html('view-odl');
    assert.match(h, /'w1l','listPrice',this\.value/);
    assert.match(h, /Sconto documento 5%/);
  });
});

describe('Lo sconto del documento', () => {
  it('sta sotto il totale delle righe, e il totale dell\'ordine è l\'imponibile', () => {
    const a = app();
    a.eval("ordSetField('o1', 'discount', '10+5')");
    assert.deepEqual(J(a, "totaliDocumento(getOrder('o1'))"), { righe: 147.5, sconto: 21.39, imponibile: 126.11, fattore: 0.855 });
    assert.equal(a.eval("orderTotal(getOrder('o1'))"), 126.11);
    a.eval("renderOrders(); openOrderEdit('o1')");
    const h = a.html('view-orders');
    assert.match(h, /Totale righe/);
    assert.match(h, /Sconto documento 10\+5% \(14,5%\)/);
  });
  it('uno sconto documento che non si legge non entra', () => {
    const a = app();
    a.eval("ordSetField('o1', 'discount', 'boh')");
    assert.equal(a.eval("getOrder('o1').discount"), '');
  });
  it('il prezzo pagato tiene conto dello sconto del documento: costo medio, consuntivo, commessa', () => {
    const a = app({ orders: [{ id: 'o1', number: 'ODA-1', status: 'evaso', supplierId: 's1', active: true, jobId: 'J', discount: '10', lines: [
      { id: 'l1', itemId: 'a1', uom: 'pz', qty: 10, price: 20, received: 10 }] }],
      jobs: [{ id: 'J', number: 'C-1', status: 'aperta', active: true }] }, { listini: true, costiReali: true });
    assert.equal(a.eval("costoMedioOf('a1')"), 18);
    assert.equal(a.eval("consPrezziPagati(consAmbitoCommessa('J')).get('a1').valore"), 180);
    assert.equal(a.eval("jobTotals('J').ordinato"), 180);
  });
});

describe('Il fornitore porta il suo sconto', () => {
  it('in Gestione si scrive e si controlla', () => {
    const a = app();
    a.eval("editSupplierModal('s2'); document.getElementById('es-name').value = 'Bianchi'; document.getElementById('es-discount').value = '5+3'; saveSupplier('s2')");
    assert.equal(a.eval("getSupplier('s2').discount"), '5+3');
    a.eval("editSupplierModal('s2'); document.getElementById('es-name').value = 'Altro'; document.getElementById('es-discount').value = 'tanto'; saveSupplier('s2')");
    assert.deepEqual(J(a, "[getSupplier('s2').name, getSupplier('s2').discount]"), ['Bianchi', '5+3'], 'niente si scrive se lo sconto è sbagliato');
  });
  it('i documenti nuovi lo prendono', () => {
    const a = app();
    const p = { id: 'p1', number: 'FAB-1', title: 'x' };
    assert.equal(J(a, `planDocHead(${JSON.stringify(p)}, 's1')`).discount, '2');
    assert.equal(J(a, `planDocHead(${JSON.stringify(p)}, 's2')`).discount, '');
  });
  it('va e torna col foglio Fornitori, e uno sbagliato si segnala', () => {
    const a = app();
    const fogli = J(a, 'settingsSheets()');
    const f = fogli.find(x => x.key === 'suppliers').aoa;
    const c = f[0].indexOf('Sconto fornitore %');
    assert.ok(c > 0);
    assert.equal(f.find(r => r[0] === 'Rossi')[c], '2');
    a.eval("importSettingsSheets({ 'Fornitori': [{ 'Nome': 'Bianchi', 'Sconto fornitore %': '4+1' }] })");
    assert.equal(a.eval("getSupplier('s2').discount"), '4+1');
  });
});

describe('PDF ed Excel', () => {
  it('le colonne di listino e sconto compaiono solo se una riga ha uno sconto', () => {
    const a = app();
    assert.deepEqual(J(a, "docStampaPrezzoHead(getOrder('o1'), 'P')"), ['P']);
    a.eval("ordSetLine('o1', 'l1', 'discount', '10')");
    assert.equal(J(a, "docStampaPrezzoHead(getOrder('o1'), 'P')").length, 3);
    assert.deepEqual(J(a, "docXlsPrezzoCelle(getOrder('o1'), getOrder('o1').lines[0])"), [14, '10', 12.6]);
    assert.deepEqual(J(a, "docXlsPrezzoCelle(getOrder('o1'), getOrder('o1').lines[1])"), [2.5, '', 2.5]);
  });
  it('il piede porta totale righe, sconto e imponibile solo se c\'è uno sconto documento', () => {
    const a = app();
    assert.equal(J(a, "docXlsFoot(getOrder('o1'))").length, 1);
    a.eval("ordSetField('o1', 'discount', '10')");
    assert.deepEqual(J(a, "docXlsFoot(getOrder('o1'))"), [['', 'Totale righe / Lines total', 147.5], ['', 'Sconto / Discount 10%', -14.75], ['', 'TOTALE IMPONIBILE / TOTAL', 132.75]]);
    const foot = J(a, "docPdfFoot(getOrder('o1'), 7, 5)");
    assert.equal(foot.length, 3);
    assert.equal(foot[2][4].content, 'Totale / Total');
  });
});

describe('Archivi di prima e archivio condiviso', () => {
  it('un ordine di prima prende i campi vuoti, e i suoi numeri non cambiano', () => {
    const a = app();
    a.eval("delete getOrder('o1').discount; getOrder('o1').lines.forEach(l => { delete l.listPrice; delete l.discount; }); delete getSupplier('s2').discount; migrateDB()");
    assert.deepEqual(J(a, "[getOrder('o1').discount, getOrder('o1').lines[0].listPrice, getOrder('o1').lines[0].discount, getSupplier('s2').discount]"), ['', '', '', '']);
    assert.equal(a.eval("orderTotal(getOrder('o1'))"), 147.5);
  });
  it('il listino vuoto va come NULL e torna vuoto; lo sconto resta testo', () => {
    const a = app();
    const r = J(a, "righeCloud({ order_lines: [{ id: '00000000-0000-4000-8000-000000000001', listPrice: '', discount: '10+5', price: 1 }] }, { uuid: false }).order_lines[0]");
    assert.equal(r.list_price, null);
    assert.equal(r.discount, '10+5');
    const l = J(a, "righeLocali({ order_lines: [{ id: 'x', list_price: null, discount: '10' }] }).order_lines[0]");
    assert.equal(l.listPrice, '');
  });
});
