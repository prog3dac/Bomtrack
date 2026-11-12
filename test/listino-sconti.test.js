// Sconto e validità nel listino fornitori (dalla 0.157.0, passo 2 del modulo
// Listini e sconti).
//
// Le proprietà che contano:
//   1. la data di una quotazione è il giorno da cui vale: un listino annunciato
//      non sostituisce quello di oggi, e non è storico;
//   2. una quotazione scaduta si usa lo stesso, e lo si dice;
//   3. il costo in uso è quello che si paga: listino, sconto della quotazione e
//      sconto del fornitore, e i confronti si fanno su quello;
//   4. i documenti prendono lordo e sconto dalla quotazione, e lo sconto del
//      fornitore dalla testata;
//   5. la richiesta d'offerta porta lordo, sconto e scadenza fino al listino;
//   6. archivio condiviso e foglio catalogo portano i campi nuovi.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

const J = (a, expr) => JSON.parse(a.eval(`JSON.stringify(${expr})`));
const approx = (x, y, m) => assert.ok(Math.abs(x - y) < 1e-6, `${m || ''} ${x} ≠ ${y}`);

function giorno(delta) {
  const n = new Date(); n.setDate(n.getDate() + delta);
  return new Date(n.getTime() - n.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
const IERI = giorno(-1), OGGI = giorno(0), DOMANI = giorno(1), MESE_FA = giorno(-30);

function app(righe, over) {
  const a = loadApp({ silent: true });
  a.setDb(makeDb(Object.assign({
    suppliers: [{ id: 's1', name: 'Rossi', active: true, discount: '' }, { id: 's2', name: 'Bianchi', active: true, discount: '' }],
    items: [Object.assign(acq('a1', 10), { priceList: righe || [
      { id: 'p1', supplierId: 's1', price: 10, discount: '', date: MESE_FA, validTo: '' },
    ], activePriceId: 'p1', supplierId: 's1', priceListSeeded: true })],
    settings: { modules: { listini: true } },
  }, over || {})));
  a.asRole('admin');
  a.eval('migrateDB()');
  return a;
}

describe('La data della quotazione è il giorno da cui vale', () => {
  const righe = () => [
    { id: 'p1', supplierId: 's1', price: 10, date: MESE_FA },
    { id: 'p2', supplierId: 's1', price: 12, date: DOMANI },
  ];
  it('oggi vale quella in vigore, non quella annunciata per domani', () => {
    const a = app(righe());
    assert.equal(a.eval("supplierPriceRow(getItem('a1'), 's1').id"), 'p1');
    assert.equal(a.eval(`supplierPriceRow(getItem('a1'), 's1', '${DOMANI}').id`), 'p2', 'da domani vale la nuova');
  });
  it('quella annunciata non è storico, e quella di oggi non è sostituita', () => {
    const a = app(righe());
    assert.equal(a.eval("priceRowSuperseded(getItem('a1'), priceRows(getItem('a1'))[1])"), false);
    assert.equal(a.eval("priceRowSuperseded(getItem('a1'), priceRows(getItem('a1'))[0])"), false);
  });
  it('e non entra nel confronto dei prezzi', () => {
    const a = app([{ id: 'p1', supplierId: 's1', price: 10, date: MESE_FA }, { id: 'p2', supplierId: 's2', price: 5, date: DOMANI }]);
    assert.equal(a.eval("bestPriceRow(getItem('a1')).id"), 'p1');
  });
  it('se il fornitore ha solo listini annunciati, vale il primo che entra in vigore', () => {
    const a = app([{ id: 'p2', supplierId: 's1', price: 12, date: giorno(10) }, { id: 'p3', supplierId: 's1', price: 13, date: giorno(20) }]);
    assert.equal(a.eval("supplierPriceRow(getItem('a1'), 's1').id"), 'p2');
  });
  it('la riga d\'ordine prende la quotazione valida alla data del documento', () => {
    const a = app(righe());
    assert.equal(J(a, `docLineFromItem(getItem('a1'), 's1', '${OGGI}')`).price, 10);
    assert.equal(J(a, `docLineFromItem(getItem('a1'), 's1', '${DOMANI}')`).price, 12);
  });
});

describe('Una quotazione scaduta si usa, e lo si dice', () => {
  it('scaduta ieri: è ancora quella del fornitore', () => {
    const a = app([{ id: 'p1', supplierId: 's1', price: 10, date: MESE_FA, validTo: IERI }]);
    assert.equal(a.eval("supplierPriceRow(getItem('a1'), 's1').id"), 'p1');
    assert.equal(a.eval("priceRowScaduta(priceRows(getItem('a1'))[0])"), true);
    assert.equal(a.eval(`priceRowScaduta(priceRows(getItem('a1'))[0], '${MESE_FA}')`), false);
  });
  it('l\'ordine la segnala accanto alla riga', () => {
    const a = app([{ id: 'p1', supplierId: 's1', price: 10, date: MESE_FA, validTo: IERI }], {
      orders: [{ id: 'o1', number: 'ODA-1', status: 'bozza', supplierId: 's1', active: true, date: OGGI, discount: '',
        lines: [{ id: 'l1', itemId: 'a1', code: 'A1', uom: 'pz', qty: 1, price: 10, received: 0 }] }] });
    assert.match(a.eval("ordLineListinoWarn(getOrder('o1'), getOrder('o1').lines[0])"), /listino scaduto/);
  });
  it('la vista d\'insieme le filtra, con quelle in scadenza nei 30 giorni', () => {
    const a = app([
      { id: 'p1', supplierId: 's1', price: 10, date: MESE_FA, validTo: IERI },
      { id: 'p2', supplierId: 's2', price: 11, date: MESE_FA, validTo: giorno(10) },
    ], { items: [Object.assign(acq('a1', 10), { priceListSeeded: true, priceList: [
      { id: 'p1', supplierId: 's1', price: 10, date: MESE_FA, validTo: IERI },
      { id: 'p2', supplierId: 's2', price: 11, date: MESE_FA, validTo: giorno(10) },
    ] }), Object.assign(acq('a2', 4), { priceListSeeded: true, priceList: [{ id: 'p3', supplierId: 's1', price: 4, date: MESE_FA, validTo: giorno(90) }] })] });
    a.eval("_plv.solo = 'scadenza'");
    assert.deepEqual(J(a, 'plvRows().map(x => x.r.id).sort()'), ['p1', 'p2']);
  });
});

describe('Il costo in uso è quello che si paga', () => {
  it('listino, sconto della quotazione e sconto del fornitore', () => {
    const a = app([{ id: 'p1', supplierId: 's1', price: 10, discount: '10+5', date: MESE_FA }],
      { suppliers: [{ id: 's1', name: 'Rossi', active: true, discount: '2' }] });
    approx(a.eval("rowUnitGross(getItem('a1'), priceRows(getItem('a1'))[0])"), 10);
    approx(a.eval("rowUnitCost(getItem('a1'), priceRows(getItem('a1'))[0])"), 10 * 0.855 * 0.98);
  });
  it('lo sconto scritto sul listino ricalcola il costo della quotazione in uso', () => {
    const a = app();
    a.eval("window.__priceItemId = 'a1'; priceSetField('p1', 'discount', '20')");
    approx(a.eval("getItem('a1').purchasePrice"), 8);
  });
  it('uno sconto che non si legge non entra', () => {
    const a = app();
    a.eval("window.__priceItemId = 'a1'; priceSetField('p1', 'discount', 'abc')");
    assert.equal(a.eval("priceRows(getItem('a1'))[0].discount"), '');
    approx(a.eval("getItem('a1').purchasePrice"), 10);
  });
  it('la scadenza non può venire prima del giorno da cui vale', () => {
    const a = app();
    a.eval(`window.__priceItemId = 'a1'; priceSetField('p1', 'validTo', '${giorno(-60)}')`);
    assert.equal(a.eval("priceRows(getItem('a1'))[0].validTo"), '');
    a.eval(`priceSetField('p1', 'validTo', '${DOMANI}')`);
    assert.equal(a.eval("priceRows(getItem('a1'))[0].validTo"), DOMANI);
  });
  it('i fornitori si confrontano sul prezzo scontato: 10 € al 40% batte 7 € netti', () => {
    const a = app([{ id: 'p1', supplierId: 's1', price: 7, date: MESE_FA }, { id: 'p2', supplierId: 's2', price: 10, discount: '40', date: MESE_FA }]);
    assert.equal(a.eval("bestPriceRow(getItem('a1')).id"), 'p2');
  });
  it('cambiando lo sconto del fornitore si ricalcolano i costi dei suoi articoli', () => {
    const a = app();
    assert.equal(a.eval("db.suppliers.find(s => s.id === 's1').discount = '5'; fornitoreRiapplicaCosti('s1')"), 1);
    approx(a.eval("getItem('a1').purchasePrice"), 9.5);
    assert.equal(a.eval("fornitoreRiapplicaCosti('s1')"), 0, 'una seconda volta non cambia niente');
  });
});

describe('I documenti prendono listino e sconto dalla quotazione', () => {
  const quot = [{ id: 'p1', supplierId: 's1', price: 10, discount: '10', date: MESE_FA }];
  it('una riga da catalogo: lordo 10, sconto 10, netto 9', () => {
    const a = app(quot);
    const l = J(a, "docLineFromItem(getItem('a1'), 's1')");
    assert.deepEqual([l.listPrice, l.discount, l.price], [10, '10', 9]);
  });
  it('cambiando fornitore la riga prende listino e sconto del nuovo', () => {
    const a = app([{ id: 'p1', supplierId: 's1', price: 10, date: MESE_FA }, { id: 'p2', supplierId: 's2', price: 20, discount: '25', date: MESE_FA }], {
      orders: [{ id: 'o1', number: 'ODA-1', status: 'bozza', supplierId: 's1', active: true, date: OGGI, discount: '',
        lines: [{ id: 'l1', itemId: 'a1', code: 'A1', uom: 'pz', qty: 1, price: 10, received: 0 }] }] });
    a.eval("ordSetSupplier('o1', 's2')");
    const l = J(a, "getOrder('o1').lines[0]");
    assert.deepEqual([l.listPrice, l.discount, l.price], [20, '25', 15]);
  });
  it('l\'ordine non segnala niente se lordo e sconto sono quelli del listino', () => {
    const a = app(quot, { orders: [{ id: 'o1', number: 'ODA-1', status: 'bozza', supplierId: 's1', active: true, date: OGGI, discount: '',
      lines: [{ id: 'l1', itemId: 'a1', code: 'A1', uom: 'pz', qty: 1, price: 9, listPrice: 10, discount: '10', received: 0 }] }] });
    assert.equal(a.eval("ordLineListinoWarn(getOrder('o1'), getOrder('o1').lines[0])"), '');
    a.eval("ordSetLine('o1', 'l1', 'discount', '5')");
    assert.match(a.eval("ordLineListinoWarn(getOrder('o1'), getOrder('o1').lines[0])"), /10%|−10/);
  });
  it('il fabbisogno passa al documento lordo e sconto, non il netto', () => {
    const a = app(quot);
    const l = J(a, "planDocLine({ item: getItem('a1'), qty: 4, qtyOrder: 4, priceDoc: 9, docLordo: 10, docSconto: '10', due: '' }, true)");
    assert.deepEqual([l.listPrice, l.discount, l.price], [10, '10', 9]);
  });
});

describe('Dalla richiesta d\'offerta al listino', () => {
  function rfqApp() {
    return app([], {
      rfqs: [{ id: 'r1', number: 'RDO-1', status: 'inviata', supplierId: 's1', active: true, date: MESE_FA, offerValidTo: '',
        lines: [{ id: 'rl1', itemId: 'a1', code: 'A1', uom: 'pz', qty: 5, price: '' }] }],
    });
  }
  it('a richiesta inviata si scrivono listino, sconto e scadenza dell\'offerta', () => {
    const a = rfqApp();
    a.eval("rfqSetLine('r1', 'rl1', 'listPrice', '20'); rfqSetLine('r1', 'rl1', 'discount', '10+5'); rfqSetField('r1', 'offerValidTo', '" + giorno(60) + "')");
    const l = J(a, "getRfq('r1').lines[0]");
    assert.deepEqual([l.listPrice, l.discount, l.price], [20, '10+5', 17.1]);
    assert.equal(a.eval("getRfq('r1').offerValidTo"), giorno(60));
    assert.equal(a.eval("getRfq('r1').status"), 'ricevuta', 'con tutti i prezzi l\'offerta è ricevuta');
  });
  it('la quotazione registrata prende lordo, sconto e scadenza', () => {
    const a = rfqApp();
    a.eval("rfqSetLine('r1', 'rl1', 'listPrice', '20'); rfqSetLine('r1', 'rl1', 'discount', '10'); rfqSetField('r1', 'offerValidTo', '" + giorno(60) + "')");
    a.eval("rfqRecordPrices('r1')");
    const q = J(a, "priceRows(getItem('a1')).find(r => r.rfqId === 'r1')");
    assert.deepEqual([q.price, q.discount, q.validTo], [20, '10', giorno(60)]);
    assert.equal(a.eval("rfqPriceCandidates(getRfq('r1')).length"), 0, 'registrata, non è più da registrare');
    a.eval("rfqSetLine('r1', 'rl1', 'discount', '15')");
    assert.equal(a.eval("rfqPriceCandidates(getRfq('r1')).length"), 1, 'cambiato lo sconto, è da aggiornare');
    a.eval("rfqRecordPrices('r1')");
    assert.equal(a.eval("priceRows(getItem('a1')).find(r => r.rfqId === 'r1').discount"), '15');
  });
  it('l\'ordine nato dall\'offerta tiene lordo e sconto', () => {
    const a = rfqApp();
    a.eval("rfqSetLine('r1', 'rl1', 'listPrice', '20'); rfqSetLine('r1', 'rl1', 'discount', '10')");
    a.eval("orderFromRfqFatto(getRfq('r1'))");
    const l = J(a, "db.orders.find(o => o.rfqId === 'r1').lines[0]");
    assert.deepEqual([l.listPrice, l.discount, l.price], [20, '10', 18]);
  });
});

describe('Archivio condiviso e foglio catalogo', () => {
  it('scadenze vuote vanno come NULL e tornano vuote', () => {
    const a = app();
    const r = J(a, "righeCloud({ item_prices: [{ id: '00000000-0000-4000-8000-000000000001', itemId: '00000000-0000-4000-8000-000000000002', validTo: '', discount: '5', price: 1 }] }, { uuid: false }).item_prices[0]");
    assert.equal(r.valid_to, null);
    assert.equal(r.discount, '5');
    const q = J(a, "righeLocali({ rfqs: [{ id: 'x', offer_valid_to: null }] }).rfqs[0]");
    assert.equal(q.offerValidTo, '');
  });
  it('un archivio di prima prende i campi vuoti', () => {
    const a = app([{ id: 'p1', supplierId: 's1', price: 10, date: MESE_FA }]);
    const q = J(a, "priceRows(getItem('a1'))[0]");
    assert.deepEqual([q.discount, q.validTo], ['', '']);
  });
  it('il foglio catalogo porta sconto e scadenza, avanti e indietro', () => {
    const a = app();
    const imp = rows => J(a, `importCatalogSheets(${JSON.stringify({ Commerciali: rows })}, 'buy', {})`);
    const rep = imp([{ Codice: 'C1', Nome: 'Cuscinetto', UM: 'pz', Fornitore: 'Rossi', Prezzo: 20, 'Sconto %': '10+5',
      'Data prezzo': '2026-03-01', 'Valida al': '31/12/2026', 'In uso': 'Sì' }]);
    assert.deepEqual(rep.warnings, []);
    const q = J(a, "priceRows(db.items.find(i => i.code === 'C1'))[0]");
    assert.deepEqual([q.price, q.discount, q.validTo], [20, '10+5', '2026-12-31']);
    const foglio = J(a, "catalogSheets('buy').find(s => s.name === 'Commerciali').aoa");
    const h = foglio[0], riga = foglio.find(r => r[h.indexOf('Codice')] === 'C1');
    assert.equal(riga[h.indexOf('Sconto %')], '10+5');
    assert.equal(riga[h.indexOf('Valida al')], '2026-12-31');
  });
  it('uno sconto o una scadenza scritti male si segnalano e non entrano', () => {
    const a = app();
    const rep = J(a, `importCatalogSheets(${JSON.stringify({ Commerciali: [{ Codice: 'C2', Nome: 'Vite', UM: 'pz', Fornitore: 'Rossi', Prezzo: 1,
      'Sconto %': 'tanto', 'Data prezzo': '2026-03-01', 'Valida al': '2026-01-01' }] })}, 'buy', {})`);
    assert.equal(rep.warnings.length, 2);
    const q = J(a, "priceRows(db.items.find(i => i.code === 'C2'))[0]");
    assert.deepEqual([q.discount, q.validTo], ['', '']);
  });
});
