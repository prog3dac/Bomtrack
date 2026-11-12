// Scaglioni di quantità sulle quotazioni (dalla 0.157.0, passo 3 del modulo
// Listini e sconti).
//
// Le proprietà che contano:
//   1. il prezzo dello scaglione raggiunto vale per tutta la quantità, e le
//      soglie stanno nell'unità della quotazione;
//   2. il costo in uso è quello del lotto di riordino, senza lotto il primo
//      scaglione;
//   3. sui documenti lo scaglione si conta sulla somma delle righe dello stesso
//      articolo, una riga intatta lo segue e una scritta a mano no;
//   4. il fabbisogno mette sul documento lo scaglione della quantità da
//      ordinare, e dice quando lo scaglione dopo è a un passo.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

const J = (a, expr) => JSON.parse(a.eval(`JSON.stringify(${expr})`));
const approx = (x, y, m) => assert.ok(Math.abs(x - y) < 1e-6, `${m || ''} ${x} ≠ ${y}`);

// Rossi: da 1 pz 14 −10+5, da 50 pz 12,60 −10, da 200 pz 11,80 −10.
const QUOT = () => ({ id: 'p1', supplierId: 's1', price: 14, discount: '10+5', minQty: '', date: '2026-01-01',
  breaks: [{ fromQty: 200, price: 11.8, discount: '10' }, { fromQty: 50, price: 12.6, discount: '10' }] });

function app(over, item) {
  const a = loadApp({ silent: true });
  a.setDb(makeDb(Object.assign({
    suppliers: [{ id: 's1', name: 'Rossi', active: true, discount: '' }, { id: 's2', name: 'Bianchi', active: true, discount: '' }],
    items: [Object.assign(acq('a1', 0), { priceList: [QUOT()], activePriceId: 'p1', supplierId: 's1', priceListSeeded: true }, item || {})],
    settings: { modules: { listini: true } },
  }, over || {})));
  a.asRole('admin');
  a.eval('migrateDB()');
  return a;
}
const ordine = (righe) => ({ orders: [{ id: 'o1', number: 'ODA-1', status: 'bozza', supplierId: 's1', active: true, date: '2026-06-01', discount: '',
  lines: righe }] });
const riga = (id, qty, extra) => Object.assign({ id, itemId: 'a1', code: 'A1', uom: 'pz', qty, price: '', listPrice: '', discount: '', received: 0 }, extra || {});

describe('Lo scaglione per la quantità', () => {
  const a = app();
  const lordo = q => a.eval(`rowUnitGross(getItem('a1'), priceRows(getItem('a1'))[0], ${q})`);
  it('sotto la prima soglia vale il prezzo base', () => { approx(lordo(1), 14); approx(lordo(49), 14); });
  it('sulla soglia esatta vale lo scaglione', () => { approx(lordo(50), 12.6); approx(lordo(200), 11.8); });
  it('fra due soglie vale quella sotto, anche con gli scaglioni scritti in disordine', () => { approx(lordo(120), 12.6); });
  it('ogni scaglione ha il suo sconto', () => {
    assert.equal(a.eval("rowUnitDiscount(getItem('a1'), priceRows(getItem('a1'))[0], 10)"), '10+5');
    assert.equal(a.eval("rowUnitDiscount(getItem('a1'), priceRows(getItem('a1'))[0], 60)"), '10');
  });
  it('uno scaglione senza prezzo o sotto la quantità minima non conta', () => {
    const b = app(null, { priceList: [Object.assign(QUOT(), { minQty: 60, breaks: [{ fromQty: 50, price: 1 }, { fromQty: 100, price: '' }] })] });
    assert.equal(b.eval("priceRowTiers(priceRows(getItem('a1'))[0]).length"), 1);
  });
  it('le soglie sono nell\'unità della quotazione: 100 kg su una barra da 8 kg/m sono 12,5 m', () => {
    const b = app(null, { uom: 'm', altUom: 'kg', altFactor: 8,
      priceList: [{ id: 'p1', supplierId: 's1', price: 2, priceUom: 'kg', date: '2026-01-01', breaks: [{ fromQty: 100, price: 1.5 }] }] });
    approx(b.eval("rowUnitGross(getItem('a1'), priceRows(getItem('a1'))[0], 12)"), 16, '12 m = 96 kg: prezzo base, 2 €/kg × 8');
    approx(b.eval("rowUnitGross(getItem('a1'), priceRows(getItem('a1'))[0], 12.5)"), 12, '12,5 m = 100 kg: 1,5 €/kg × 8');
  });
});

describe('Il costo in uso è quello del lotto di riordino', () => {
  it('senza lotto, il primo scaglione', () => {
    const a = app();
    a.eval("applyPriceRow(getItem('a1'), priceRows(getItem('a1'))[0])");
    approx(a.eval("getItem('a1').purchasePrice"), 14 * 0.855);
  });
  it('con un lotto da 50, lo scaglione da 50', () => {
    const a = app(null, { lotSize: 50 });
    a.eval("applyPriceRow(getItem('a1'), priceRows(getItem('a1'))[0])");
    approx(a.eval("getItem('a1').purchasePrice"), 12.6 * 0.9);
  });
  it('uno scaglione nuovo sulla quotazione in uso muove il costo', () => {
    const a = app(null, { lotSize: 300, priceList: [Object.assign(QUOT(), { breaks: [] })] });
    a.eval("window.__priceItemId = 'a1'; priceTierAdd('p1'); priceTierSet('p1', 0, 'fromQty', '100'); priceTierSet('p1', 0, 'price', '10')");
    approx(a.eval("getItem('a1').purchasePrice"), 10);
  });
  it('una soglia non oltre la quantità minima, o doppia, non entra', () => {
    const a = app(null, { priceList: [Object.assign(QUOT(), { minQty: 10 })] });
    a.eval("window.__priceItemId = 'a1'; priceTierAdd('p1')");
    const i = a.eval("priceRows(getItem('a1'))[0].breaks.length - 1");
    a.eval(`priceTierSet('p1', ${i}, 'fromQty', '5')`);
    a.eval(`priceTierSet('p1', ${i}, 'fromQty', '50')`);
    assert.equal(a.eval(`priceRows(getItem('a1'))[0].breaks[${i}].fromQty`), '', '5 e 50 (doppia) non entrano');
    a.eval(`priceTierSet('p1', ${i}, 'fromQty', '100')`);
    assert.deepEqual(J(a, "priceRows(getItem('a1'))[0].breaks.map(b => b.fromQty)"), [50, 100, 200], 'e si mettono in ordine');
  });
  it('i fornitori si confrontano alla stessa quantità di riferimento', () => {
    const a = app(null, { lotSize: 200, priceList: [QUOT(), { id: 'p2', supplierId: 's2', price: 11, date: '2026-01-01' }] });
    assert.equal(a.eval("bestPriceRow(getItem('a1')).id"), 'p1', '11,80 −10 = 10,62 batte 11');
  });
});

describe('Sui documenti', () => {
  const prezzi = (a) => J(a, "getOrder('o1').lines.map(l => [l.listPrice, l.discount, l.price])");
  it('una riga nata per 60 pz prende lo scaglione da 50', () => {
    const a = app();
    const l = J(a, "docLineFromItem(getItem('a1'), 's1', '2026-06-01', 60)");
    assert.deepEqual([l.qty, l.listPrice, l.discount, l.price], [60, 12.6, '10', 11.34]);
  });
  it('una riga intatta passa da sola allo scaglione nuovo quando cambia la quantità', () => {
    const a = app(ordine([riga('l1', 10, { listPrice: 14, discount: '10+5', price: 11.97 })]));
    a.eval("ordSetLine('o1', 'l1', 'qty', '60')");
    assert.deepEqual(prezzi(a), [[12.6, '10', 11.34]]);
    a.eval("ordSetLine('o1', 'l1', 'qty', '5')");
    assert.deepEqual(prezzi(a), [[14, '10+5', 11.97]], 'e torna indietro');
  });
  it('una riga scritta a mano non cambia, e avvisa con lo scaglione giusto', () => {
    const a = app(ordine([riga('l1', 10, { price: 12 })]));
    a.eval("ordSetLine('o1', 'l1', 'qty', '60')");
    assert.deepEqual(prezzi(a), [['', '', 12]]);
    const w = a.eval("ordLineListinoWarn(getOrder('o1'), getOrder('o1').lines[0])");
    assert.match(w, /12,60/);
    assert.match(w, /ordApplicaListinoRiga/);
    a.eval("ordApplicaListinoRiga('o1', 'l1')");
    assert.deepEqual(prezzi(a), [[12.6, '10', 11.34]]);
  });
  it('due consegne da 30 fanno 60: lo scaglione si conta sulla somma', () => {
    const a = app(ordine([riga('l1', 30, { listPrice: 14, discount: '10+5', price: 11.97 }), riga('l2', 20, { listPrice: 14, discount: '10+5', price: 11.97 })]));
    a.eval("ordSetLine('o1', 'l2', 'qty', '30')");
    assert.deepEqual(prezzi(a), [[12.6, '10', 11.34], [12.6, '10', 11.34]]);
    a.eval("docDelLine('order', 'o1', 'l2')");
    assert.deepEqual(prezzi(a), [[14, '10+5', 11.97]], 'tolta una consegna, si torna sotto la soglia');
  });
  it('la riga dice lo scaglione raggiunto e quanto costa il prossimo', () => {
    const a = app(ordine([riga('l1', 60, { listPrice: 12.6, discount: '10', price: 11.34 })]));
    const w = a.eval("ordLineListinoWarn(getOrder('o1'), getOrder('o1').lines[0])");
    assert.match(w, /scaglione da 50 pz/);
    assert.match(w, /da 200 pz costa € 10,62/);
  });
  it('cambiando fornitore la riga prende lo scaglione della sua quantità', () => {
    const a = app(Object.assign(ordine([riga('l1', 60, { price: 9 })]), {}), null);
    a.eval("db.orders[0].supplierId = 's2'; ordSetSupplier('o1', 's1')");
    assert.deepEqual(prezzi(a), [[12.6, '10', 11.34]]);
  });
});

describe('Nel fabbisogno', () => {
  it('il documento prende lo scaglione della quantità da ordinare', () => {
    const a = app();
    const l = J(a, "planDocLine({ item: getItem('a1'), qty: 60, qtyOrder: 60, priceDoc: rowUnitCost(getItem('a1'), priceRows(getItem('a1'))[0], 60), docLordo: rowUnitGross(getItem('a1'), priceRows(getItem('a1'))[0], 60), docSconto: rowUnitDiscount(getItem('a1'), priceRows(getItem('a1'))[0], 60), due: '' }, true)");
    assert.deepEqual([l.listPrice, l.discount, l.price], [12.6, '10', 11.34]);
  });
  it('lo scaglione dopo a un passo si propone: 45 pz, da 50 costa meno', () => {
    const a = app();
    a.eval("Store.insert('plans', { id: 'pl1', number: 'FAB-1', active: true, lines: [{ id: 'l1', itemId: 'a1', qty: 45 }] })");
    const r = J(a, "(r => ({ qtyOrder: r.qtyOrder, priceDoc: r.priceDoc, prossimo: r.prossimoScaglione }))(mrpBuyRows(getPlan('pl1'), false).find(r => r.item.id === 'a1'))");
    assert.equal(r.qtyOrder, 45);
    approx(r.priceDoc, 11.97);
    assert.equal(r.prossimo.qty, 50);
    approx(r.prossimo.price, 11.34);
  });
});

describe('Archivio', () => {
  it('gli scaglioni vanno e tornano come jsonb, e un archivio di prima li ha vuoti', () => {
    const a = app(null, { priceList: [{ id: 'p1', supplierId: 's1', price: 3, date: '2026-01-01' }] });
    assert.deepEqual(J(a, "priceRows(getItem('a1'))[0].breaks"), []);
    const r = J(a, "righeCloud({ item_prices: [{ id: '00000000-0000-4000-8000-000000000001', itemId: '00000000-0000-4000-8000-000000000002', price: 1, breaks: [{ fromQty: 50, price: 0.9, discount: '' }] }] }, { uuid: false }).item_prices[0]");
    assert.deepEqual(r.breaks, [{ fromQty: 50, price: 0.9, discount: '' }]);
  });
});
