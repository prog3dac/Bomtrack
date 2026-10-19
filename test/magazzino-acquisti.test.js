// Magazzino, inventario, acquisti e QR: i punti minori del controllo generale
// (dalla 0.105.6).
//
// Le proprietà che contano:
//   1. il confronto delle offerte non premia un'offerta solo perché è
//      incompleta;
//   2. scelto il fornitore, il suo listino si propone e non si applica da sé;
//   3. dal QR dell'ordine si riceve anche una parte, riga per riga;
//   4. le differenze d'inventario valgono quanto vale la giacenza;
//   5. la rettifica singola non scrive giacenze negative per sbaglio, e non
//      appende un ordine di conto lavoro a un movimento che non lo è;
//   6. il Magazzino non rilegge tutti i movimenti per ogni riga;
//   7. gli articoli con esistente negativo si trovano, e non abbassano il
//      valore della giacenza;
//   8. l'inventario in corso è di chi l'ha cominciato, in quell'archivio.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq } = require('./fixtures.js');

const J = (a, expr) => JSON.parse(a.eval(`JSON.stringify(${expr})`));
const modale = a => a.eval("Array.from(panelRoot().children).map(e => e.innerHTML).join('')");

function app(over) {
  const a = loadApp({ silent: true });
  a.setDb(makeDb(Object.assign({
    suppliers: [{ id: 's1', name: 'Rossi', active: true }, { id: 's2', name: 'Bianchi', active: true }],
    items: [
      Object.assign(acq('a1', 5), { priceList: [{ id: 'pr1', supplierId: 's1', price: 7, date: '2026-01-01' }] }),
      Object.assign(acq('a2', 3), { priceList: [{ id: 'pr2', supplierId: 's1', price: 4, date: '2026-01-01' }] }),
      acq('a3', 2),
      mat('m1', 2),
    ],
    movements: [],
  }, over || {})));
  a.asRole('admin');
  return a;
}

describe('Confronto offerte: un\'offerta incompleta non è la più conveniente', () => {
  it('il totale più basso si cerca solo fra le offerte che quotano tutte le righe', () => {
    const a = app({
      rfqs: [
        { id: 'r1', number: 'RDO-1', supplierId: 's1', status: 'ricevuta', active: true, lines: [
          { id: 'x1', itemId: 'a1', qty: 10, price: 10 }, { id: 'x2', itemId: 'a2', qty: 10, price: 10 }, { id: 'x3', itemId: 'a3', qty: 10, price: 10 }] },
        { id: 'r2', number: 'RDO-2', supplierId: 's2', status: 'ricevuta', active: true, lines: [
          { id: 'y1', itemId: 'a1', qty: 10, price: 12 }, { id: 'y2', itemId: 'a2', qty: 10, price: '' }, { id: 'y3', itemId: 'a3', qty: 10, price: '' }] },
      ],
    });
    a.eval("rfqCompareSel = ['r1', 'r2']");
    const h = a.eval('renderRfqCompare()');
    const tot = h.slice(h.indexOf('rfq-cmp-total'));
    assert.match(tot, /<td class="rfq-min">[^<]*300,00<\/td>/, 'la completa è la più bassa fra le complete');
    assert.doesNotMatch(tot, /class="rfq-min">[^<]*120/, 'l\'incompleta non va in verde');
    assert.match(tot, /incompleta \(1\/3\)/);
  });
});

describe('Listino del fornitore: si propone dopo averlo scelto', () => {
  function conOrdine() {
    const a = app({
      orders: [{ id: 'o1', number: 'ODA-1', status: 'bozza', supplierId: null, active: true, date: '2026-10-01', lines: [
        { id: 'l1', itemId: 'a1', code: 'A1', uom: 'pz', qty: 2, price: '' },
        { id: 'l2', itemId: 'a2', code: 'A2', uom: 'pz', qty: 1, price: 9 },
        { id: 'l3', itemId: 'a3', code: 'A3', uom: 'pz', qty: 1, price: '' },
        { id: 'l4', itemId: null, code: 'MAN', uom: 'pz', qty: 1, price: '' }] }],
    });
    return a;
  }
  const prezzi = a => J(a, "getOrder('o1').lines.map(l => l.price)");
  it('scegliere il fornitore non cambia nessun prezzo, ma propone il suo listino', () => {
    const a = conOrdine();
    a.eval("ordSetSupplier('o1', 's1')");
    assert.deepEqual(prezzi(a), ['', 9, '', ''], 'nessun prezzo cambia da sé');
    assert.deepEqual(J(a, "docListinoProposta('order', 'o1')"), { vuote: ['l1'], diverse: ['l2'] });
    const h = modale(a);
    assert.match(h, /listino di Rossi/);
    assert.match(h, /docApplicaListino\('order','o1'/);
  });
  it('confermando si riempiono le righe senza prezzo; quelle con un prezzo solo se lo si chiede', () => {
    const a = conOrdine();
    a.eval("ordSetSupplier('o1', 's1')");
    assert.equal(a.eval("docApplicaListino('order', 'o1', false)"), 1);
    assert.deepEqual(prezzi(a), [7, 9, '', '']);
    assert.equal(a.eval("docApplicaListino('order', 'o1', true)"), 1);
    assert.deepEqual(prezzi(a), [7, 4, '', '']);
  });
  it('un fornitore senza quotazioni per quelle righe non propone niente', () => {
    const a = conOrdine();
    a.eval("ordSetSupplier('o1', 's2')");
    assert.deepEqual(J(a, "docListinoProposta('order', 'o1')"), { vuote: [], diverse: [] });
    assert.doesNotMatch(modale(a), /docApplicaListino/);
  });
});

describe('QR dell\'ordine: si riceve anche una parte', () => {
  function conOrdine() {
    return app({
      orders: [{ id: 'o1', number: 'ODA-7', status: 'inviato', supplierId: 's1', active: true, date: '2026-10-01', lines: [
        { id: 'l1', itemId: 'a1', code: 'A1', uom: 'pz', qty: 100, received: 0, price: 1 },
        { id: 'l2', itemId: 'a2', code: 'A2', uom: 'pz', qty: 10, received: 10, price: 1 },
        { id: 'l3', itemId: 'a3', code: 'A3', uom: 'pz', qty: 5, received: 1, price: 1 }] }],
    });
  }
  it('la scheda offre «Ricevi una parte» accanto a «Ricevi tutto»', () => {
    const a = conOrdine();
    const h = a.eval("qrSchedaHtml('order', getOrder('o1'))");
    assert.match(h, /Ricevi tutto/);
    assert.match(h, /qrRiceviModal\('order','o1'\)/);
  });
  it('la finestra elenca le righe aperte con il residuo già scritto', () => {
    const a = conOrdine();
    a.eval("qrRiceviModal('order', 'o1')");
    const h = modale(a);
    assert.match(h, /id="qr-ric-0"[^>]*value="100"/);
    assert.match(h, /id="qr-ric-1"[^>]*value="4"/);
    assert.doesNotMatch(h, /id="qr-ric-2"/, 'la riga già ricevuta non c\'è');
  });
  it('40 su 100: la riga va a 40, l\'ordine a parziale, e si salva subito', () => {
    const a = conOrdine();
    a.eval("qrRiceviModal('order', 'o1')");
    a.el('qr-ric-0').value = '40';
    a.el('qr-ric-1').value = '0';
    a.eval('globalThis.__salvati = 0; const c = Store.commit; Store.commit = function () { __salvati++; return c.apply(this, arguments); };');
    assert.equal(a.eval("qrRiceviConferma('order', 'o1')"), 1);
    assert.deepEqual(J(a, "getOrder('o1').lines.map(l => l.received)"), [40, 10, 1]);
    assert.equal(a.eval("getOrder('o1').status"), 'parziale');
    assert.equal(a.eval("(invalidateCaches(), onHandOf('a1'))"), 40);
    assert.ok(a.eval('__salvati') >= 1, 'il ricevimento dal telefono si salva');
    assert.equal(a.eval('orderDirty'), false);
  });
  it('una quantità negativa non si registra', () => {
    const a = conOrdine();
    a.eval("qrRiceviModal('order', 'o1')");
    a.el('qr-ric-0').value = '-5';
    a.el('qr-ric-1').value = '';
    assert.equal(a.eval("qrRiceviConferma('order', 'o1')"), false);
    assert.deepEqual(J(a, "getOrder('o1').lines.map(l => l.received)"), [0, 10, 1]);
  });
  it('chi non può ricevere non riceve', () => {
    const a = conOrdine();
    a.asRole('viewer');
    assert.equal(a.eval("qrRiceviRighe('order', 'o1', { l1: 5 })"), false);
    assert.equal(a.eval("getOrder('o1').lines[0].received"), 0);
  });
});

describe('Inventario: il valore delle differenze', () => {
  it('un commerciale vale il suo prezzo d\'acquisto, come nel valore di giacenza', () => {
    const a = app({ items: [Object.assign(acq('a1', 5), { location: 'A-1' })] });
    a.eval("addMovement('a1', 'carico', 10, '')");
    a.eval("inventarioAvvia({ ambito: 'tutto' }); invConta(8)");
    assert.equal(a.eval('invDifferenze()[0].valore'), -10);
  });
});

describe('Rettifica singola', () => {
  function apri(a) { a.eval("stockAdjustModal('a1')"); }
  it('una quantità contata negativa si rifiuta', () => {
    const a = app();
    a.eval("addMovement('a1', 'carico', 20, '')");
    apri(a);
    a.el('mv-kind').value = 'rettifica';
    a.el('mv-qty').value = '-5';
    a.eval("saveStockAdjust('a1')");
    assert.equal(a.eval("onHandOf('a1')"), 20);
    assert.equal(a.eval('db.movements.length'), 1);
  });
  it('cambiando tipo il campo si svuota; tornando alla rettifica riprende l\'esistente', () => {
    const a = app();
    a.eval("addMovement('a1', 'carico', 20, '')");
    apri(a);
    a.el('mv-qty').value = '20';
    a.el('mv-kind').value = 'carico';
    a.eval("stockAdjustKindChange('a1')");
    assert.equal(a.el('mv-qty').value, '');
    a.el('mv-kind').value = 'rettifica';
    a.eval("stockAdjustKindChange('a1')");
    assert.equal(String(a.el('mv-qty').value), '20');
  });
  it('l\'ordine di conto lavoro scelto prima non resta attaccato a un consumo', () => {
    const a = app({ workOrders: [{ id: 'w1', number: 'ODL-1', status: 'inviato', planId: 'p1', active: true, lines: [] }] });
    a.eval("addMovement('a1', 'carico', 20, '')");
    apri(a);
    a.el('mv-kind').value = 'scarico';
    a.el('mv-ord').value = 'w1';
    a.el('mv-qty').value = '5';
    a.eval("saveStockAdjust('a1')");
    const m = J(a, 'db.movements[db.movements.length - 1]');
    assert.equal(m.kind, 'scarico');
    assert.equal(m.qty, -5);
    assert.equal(m.orderId, null);
  });
});

describe('Magazzino: il conto dei movimenti', () => {
  it('sta nell\'indice della giacenza, e la tabella non rilegge i movimenti riga per riga', () => {
    const a = app();
    a.eval("addMovement('a1', 'carico', 5, ''); addMovement('a1', 'scarico', -1, ''); addMovement('m1', 'carico', 2, '')");
    a.eval('invalidateCaches()');
    assert.equal(a.eval("stockOf('a1').nMov"), 2);
    assert.equal(a.eval("stockOf('a3').nMov"), 0);
    a.eval('globalThis.__mov = 0; const f = movementsOf; movementsOf = function () { __mov++; return f.apply(this, arguments); };');
    a.eval('stockLimit = STOCK_PAGE; renderStock()');
    assert.equal(a.eval('__mov'), 0);
    assert.match(a.html('stk-table'), /Movimenti \(2\)/);
  });
});

describe('Magazzino: esistente negativo', () => {
  function conNegativo() {
    const a = app();
    a.eval("addMovement('a1', 'carico', 10, ''); addMovement('a2', 'scarico', -4, '')");
    a.eval('invalidateCaches()');
    return a;
  }
  it('c\'è un filtro che li elenca, e la card che li conta', () => {
    const a = conNegativo();
    ['search', 'type', 'family', 'subfamily', 'loc'].forEach(k => { a.el('stk-' + k).value = ''; });
    a.el('stk-state').value = 'sottozero';
    assert.deepEqual(J(a, 'stockFilteredRows().map(i => i.code)'), ['A2']);
    a.eval('stockLimit = STOCK_PAGE; renderStock()');
    assert.match(a.html('stk-kpi'), /Esistente negativo/);
    assert.equal(J(a, 'STOCK_STATE_LABELS').sottozero, 'Esistente negativo');
  });
  it('il valore della giacenza conta solo quello che c\'è', () => {
    const a = conNegativo();
    assert.equal(a.eval("valoreGiacenza(getItem('a2'))"), 0);
    assert.equal(a.eval("valoreGiacenza(getItem('a1'))"), 50);
  });
});

describe('Inventario in corso: di chi e dove', () => {
  it('un altro utente sullo stesso browser non vede la bozza del collega', () => {
    const a = app({ items: [Object.assign(acq('a1', 5), { location: 'A-1' })] });
    a.eval("inventarioAvvia({ ambito: 'tutto' }); invConta(3); _inv = null");
    assert.ok(a.eval('invCarica()'), 'chi l\'ha cominciato la ritrova');
    a.eval("currentUser = Object.assign({}, currentUser, { id: 'u-altro', name: 'Bruno' })");
    assert.equal(a.eval('invCarica()'), null);
    a.eval("currentUser = Object.assign({}, currentUser, { id: 'u-test', name: 'Test' })");
    assert.equal(a.eval('invCarica().conteggi.a1'), 3);
  });
  it('un archivio condiviso ha la sua bozza, separata da quella locale', () => {
    const a = app({ items: [Object.assign(acq('a1', 5), { location: 'A-1' })] });
    a.eval("inventarioAvvia({ ambito: 'tutto' }); invConta(3); _inv = null");
    a.eval("localStorage.setItem('bomtrack_cloud', JSON.stringify({ url: 'https://x.supabase.co', chiave: 'k' }))");
    assert.equal(a.eval('invCarica()'), null);
    a.eval("localStorage.removeItem('bomtrack_cloud')");
    assert.ok(a.eval('invCarica()'));
  });
  it('la bozza scritta da una versione precedente si ritrova una volta', () => {
    const a = app({ items: [Object.assign(acq('a1', 5), { location: 'A-1' })] });
    a.eval(`localStorage.setItem('bomtrack_inventario', JSON.stringify({ titolo: 'Vecchio', ids: ['a1'], conteggi: { a1: 2 }, pos: 0 }))`);
    assert.equal(a.eval('invCarica().titolo'), 'Vecchio');
    assert.equal(a.eval("localStorage.getItem('bomtrack_inventario')"), null);
  });
});
