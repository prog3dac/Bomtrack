// Le correzioni dal controllo della 0.157.0 (dalla 0.157.2).
//
//   1. un documento inviato non cambia fornitore, nemmeno sbloccato;
//   2. al telefono il documento aperto si porta in vista (qui: non rompe senza schermo);
//   3. le celle Excel in formato percentuale tornano in punti;
//   4. gli scaglioni si vedono anche a modulo spento;
//   5. la maggiorazione del documento si chiama così;
//   6. nell'Excel il netto si chiama «Prezzo netto» e i totali stanno sotto gli importi;
//   7. il confronto delle offerte toglie lo sconto del fornitore e segnala le scadute;
//   8. cambiando terzista, un avviso dice che le lavorazioni tengono la tariffa.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

const J = (a, expr) => JSON.parse(a.eval(`JSON.stringify(${expr})`));
// Gli avvisi si raccolgono invece di mostrarli.
const spia = a => a.eval('globalThis.__avvisi = []; showToast = m => __avvisi.push(m);');
const avvisi = a => J(a, '__avvisi').join('\n');

function app(stato, moduli) {
  const a = loadApp({ silent: true });
  a.setDb(makeDb({
    suppliers: [{ id: 's1', name: 'Rossi', active: true, discount: '' }, { id: 's2', name: 'Bianchi', active: true, discount: '10' }],
    items: [acq('a1', 5), acq('a2', 3)],
    orders: [{ id: 'o1', number: 'ODA-1', status: stato || 'bozza', supplierId: 's1', active: true, date: '2026-10-01', discount: '', lines: [
      { id: 'l1', itemId: 'a1', code: 'A1', uom: 'pz', qty: 10, price: 14, received: stato === 'parziale' ? 10 : 0 },
      { id: 'l2', itemId: 'a2', code: 'A2', uom: 'pz', qty: 3, price: 2.5, received: 0 }] }],
    settings: { modules: moduli === undefined ? { listini: true } : moduli },
  }));
  a.asRole('admin');
  a.eval('migrateDB()');
  return a;
}

describe('Un documento inviato non cambia fornitore', () => {
  it('neanche sbloccato: prezzi e sconto restano', () => {
    const a = app('parziale');
    spia(a);
    a.eval("docKind('order').setUnlocked('o1'); ordSetSupplier('o1', 's2')");
    assert.equal(a.eval("getOrder('o1').supplierId"), 's1');
    assert.deepEqual(J(a, "getOrder('o1').lines.map(l => l.price)"), [14, 2.5]);
    assert.match(avvisi(a), /il fornitore non si cambia/);
  });
  it('la tendina del fornitore è chiusa anche dopo «Sblocca», e non riprende il blocco del contratto', () => {
    const a = app('inviato');
    a.eval("docKind('order').setUnlocked('o1'); renderOrders(); openOrderEdit('o1')");
    const html = a.html('view-orders');
    const sel = html.match(/<select class="([^"]*)sel-cerca"([^>]*)onchange="ordSetSupplier/);
    assert.ok(sel, 'la tendina del fornitore c\'è');
    assert.doesNotMatch(sel[1], /lock-contract/);
    assert.match(sel[2], /disabled/);
  });
  it('in bozza il cambio riscrive tutto come prima', () => {
    const a = app('bozza');
    a.eval("ordSetSupplier('o1', 's2')");
    assert.equal(a.eval("getOrder('o1').supplierId"), 's2');
    assert.equal(a.eval("getOrder('o1').discount"), '10');
  });
  it('rimettere lo stesso fornitore su un inviato non è un cambio', () => {
    const a = app('inviato');
    spia(a);
    a.eval("docKind('order').setUnlocked('o1'); ordSetSupplier('o1', 's1')");
    assert.doesNotMatch(avvisi(a), /non si cambia/);
  });
});

describe('Il documento aperto si porta in vista', () => {
  it('senza uno schermo vero non fa niente e non rompe l\'apertura', () => {
    const a = app();
    a.eval("renderOrders(); openOrderEdit('o1')");
    assert.equal(a.eval('orderView'), 'edit');
  });
});

describe('Le percentuali di Excel', () => {
  const a = app();
  it('una cella «10%» vale 10, le altre restano come sono', () => {
    const wb = J(a, `foglioPercentuali({ SheetNames: ['F'], Sheets: { F: { '!ref': 'A1:C2',
      A2: { t: 'n', v: 0.1, w: '10%' }, B2: { t: 'n', v: 0.145, w: '14,5 %' }, C2: { t: 'n', v: 0.1, w: '0.1' } } } })`);
    assert.equal(wb.Sheets.F.A2.v, 10);
    assert.equal(wb.Sheets.F.B2.v, 14.5);
    assert.equal(wb.Sheets.F.C2.v, 0.1);
  });
  it('un testo con il simbolo resta testo, e lo sconto lo legge già', () => {
    assert.equal(a.eval("scontoNorm('10%')"), '10');
  });
});

describe('Gli scaglioni a modulo spento', () => {
  it('una quotazione con scaglioni mostra la colonna degli sconti', () => {
    const a = app('bozza', {});
    a.eval("const it = getItem('a1'); it.priceList = [{ id: 'p1', supplierId: 's1', price: 10, minQty: '', date: '2026-01-01', discount: '', validTo: '', breaks: [{ fromQty: 50, price: 8, discount: '' }] }]");
    assert.equal(a.eval("priceListScontiVisibili(getItem('a1'))"), true);
    a.eval("getItem('a1').priceList[0].breaks = []");
    assert.equal(a.eval("priceListScontiVisibili(getItem('a1'))"), false);
  });
});

describe('La maggiorazione del documento', () => {
  const a = app();
  a.eval("ordSetField('o1', 'discount', '-3')");
  it('a schermo si chiama maggiorazione e si somma', () => {
    const foot = a.eval("docTotaliFootHtml(getOrder('o1'), 3, 2)");
    assert.match(foot, /Maggiorazione documento -3%/);
    assert.match(foot, /\+ /);
    assert.doesNotMatch(foot, /− .*-/);
  });
  it('su PDF ed Excel anche', () => {
    const voci = J(a, "docTotaliStampa(getOrder('o1'))");
    assert.equal(voci[1][0], 'Maggiorazione / Surcharge -3%');
    assert.ok(voci[1][1] > 0);
    assert.equal(voci[2][1], +(voci[0][1] + voci[1][1]).toFixed(2));
  });
});

describe('L\'Excel con gli sconti', () => {
  const a = app();
  a.eval("ordSetLine('o1', 'l1', 'discount', '10'); ordSetField('o1', 'discount', '5')");
  it('la terza colonna si chiama «Prezzo netto», con la sua unità', () => {
    assert.deepEqual(J(a, "docXlsPrezzoHead(getOrder('o1'), 'Prezzo unitario (€/U.M.)')"), ['Prezzo listino (€/U.M.)', 'Sconto %', 'Prezzo netto (€/U.M.)']);
    assert.deepEqual(J(a, "docXlsPrezzoHead(getOrder('o1'), 'Tariffa (€/pz)')"), ['Prezzo listino (€/pz)', 'Sconto %', 'Prezzo netto (€/pz)']);
  });
  it('i totali stanno sotto la colonna degli importi', () => {
    const piede = J(a, "docXlsFoot(getOrder('o1'), 8)");
    assert.equal(piede.length, 3);
    piede.forEach(r => { assert.equal(r.length, 9); assert.equal(typeof r[8], 'number'); assert.notEqual(r[7], ''); });
  });
});

describe('Il confronto delle offerte', () => {
  const a = loadApp({ silent: true });
  a.setDb(makeDb({
    suppliers: [{ id: 's1', name: 'Rossi', active: true, discount: '' }, { id: 's2', name: 'Bianchi', active: true, discount: '20' }],
    items: [acq('a1', 5)],
    rfqs: [
      { id: 'r1', number: 'RDO-1', status: 'ricevuta', supplierId: 's1', active: true, date: '2026-10-01', lines: [{ id: 'x1', itemId: 'a1', code: 'A1', uom: 'pz', qty: 10, price: 9 }] },
      { id: 'r2', number: 'RDO-2', status: 'ricevuta', supplierId: 's2', active: true, date: '2026-10-01', offerValidTo: '2020-01-31', lines: [{ id: 'x2', itemId: 'a1', code: 'A1', uom: 'pz', qty: 10, price: 10 }] }],
  }));
  a.asRole('admin'); a.eval('migrateDB()');
  a.eval("rfqCompareSel = ['r1', 'r2']");
  const html = a.eval('renderRfqCompare()') || a.html('view-rfq');
  it('10 € con lo sconto fornitore del 20% battono 9 €', () => {
    assert.match(html, /rfq-min[^>]*>[^<]*8,00/);
  });
  it('lo sconto del fornitore e l\'offerta scaduta si dicono sotto il nome', () => {
    assert.match(html, /sconto fornitore 20%/);
    assert.match(html, /scaduta il 31\/01\/2020/);
  });
});

describe('Cambiare terzista su un ordine di lavoro', () => {
  it('un avviso dice che le lavorazioni tengono la tariffa di prima', () => {
    const a = loadApp({ silent: true });
    a.setDb(makeDb({
      suppliers: [{ id: 's1', name: 'Rossi', active: true }, { id: 's2', name: 'Bianchi', active: true }],
      items: [acq('a1', 5)],
      workOrders: [{ id: 'w1', number: 'ODL-1', status: 'bozza', supplierId: 's1', active: true, date: '2026-10-01', lines: [
        { id: 'f1', itemId: null, phaseKey: 'k1', code: 'P1', uom: 'pz', qty: 5, price: 12, received: 0 }] }],
      settings: { modules: { listini: true } },
    }));
    a.asRole('admin'); a.eval('migrateDB()');
    spia(a);
    a.eval("odlSetSupplier('w1', 's2')");
    assert.equal(a.eval("getOdl('w1').lines[0].price"), 12);
    assert.match(avvisi(a), /Una lavorazione tiene la tariffa del fornitore di prima/);
  });
});
