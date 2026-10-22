// Riordino sotto scorta.
//
// La proposta è il conto del fabbisogno con un lordo di zero e senza
// impegnato: scorta minima − esistente − in arrivo, arrotondato al lotto. Le
// proprietà che contano:
//   1. quello che è già in viaggio non si ordina due volte;
//   2. il lotto di riordino si rispetta;
//   3. un ordine in bozza per fornitore, col listino di quel fornitore;
//   4. le parti fatte in casa non si propongono: si rifanno con un piano;
//   5. chi non può scrivere ordini non ne crea;
//   6. l'impegnato dei piani non entra: lo ordinano i piani;
//   7. un articolo obsoleto non si propone.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq, parte } = require('./fixtures.js');

const quot = (id, sup, price, leadDays) => ({ id, supplierId: sup, price, leadDays: leadDays || 0, date: '2026-01-01' });
function app(role, extra) {
  const a = loadApp({ silent: true });
  const items = [
    Object.assign(acq('a1', 2), { safetyStock: 10, priceList: [quot('p1', 's1', 2, 5)], activePriceId: 'p1', supplierId: 's1' }),
    Object.assign(acq('a2', 3), { safetyStock: 4, lotSize: 25, priceList: [quot('p2', 's1', 3)], activePriceId: 'p2', supplierId: 's1' }),
    Object.assign(acq('a3', 1), { safetyStock: 5, priceList: [quot('p3', 's2', 1)], activePriceId: 'p3', supplierId: 's2' }),
    Object.assign(acq('a4', 1), { safetyStock: 0 }),
    Object.assign(acq('a5', 1), { safetyStock: 3 }),
    parte('pm', { safetyStock: 5, priceList: [quot('p6', 's1', 9)], activePriceId: 'p6', supplierId: 's1' }),
  ].concat((extra && extra.items) || []);
  a.setDb(makeDb(Object.assign({ suppliers: [{ id: 's1', name: 'SKF', active: true }, { id: 's2', name: 'FAG', active: true }],
    movements: [], items }, extra && extra.db)));
  a.asRole(role || 'admin');
  return a;
}
const proposte = a => JSON.parse(a.eval('JSON.stringify(riordinoProposte().map(p => ({ id: p.it.id, qty: p.qty, sup: p.supplierId })))'));

describe('Riordino: cosa si propone', () => {
  it('quanto manca per tornare alla scorta, col lotto', () => {
    const p = Object.fromEntries(proposte(app()).map(x => [x.id, x]));
    assert.equal(p.a1.qty, 10);
    assert.equal(p.a2.qty, 25, 'ne mancano 4, il lotto è 25');
    assert.equal(p.a3.qty, 5);
    assert.equal(p.a4, undefined, 'senza scorta minima non si propone niente');
    assert.equal(p.pm, undefined, 'una parte fatta in casa si rifà con un piano');
  });

  it('quello che c\'è e quello in arrivo si contano', () => {
    const a = app();
    a.eval("addMovement('a1', 'carico', 7, 'inventario')");
    a.eval("db.orders.push({ id: 'o1', number: 'ODA-1', status: 'inviato', supplierId: 's1', active: true, lines: [{ id: 'l1', itemId: 'a3', qty: 5, received: 0 }] }); invalidateCaches();");
    const p = Object.fromEntries(proposte(a).map(x => [x.id, x]));
    assert.equal(p.a1.qty, 3, '10 − 7 a magazzino');
    assert.equal(p.a3, undefined, 'l\'ordine in viaggio basta già');
  });

  it('un articolo senza fornitore si propone, ma resta fuori dagli ordini', () => {
    const a = app();
    const p = proposte(a).find(x => x.id === 'a5');
    assert.equal(p.sup, '');
    a.eval("riordinoGenera(['a5'])");
    assert.equal(a.eval('db.orders.length'), 0);
  });
});

describe('Riordino: gli ordini', () => {
  it('una bozza per fornitore, col prezzo e la consegna del suo listino', () => {
    const a = app();
    const creati = JSON.parse(a.eval("JSON.stringify(riordinoGenera(['a1', 'a2', 'a3']))"));
    assert.equal(creati.length, 2);
    const skf = creati.find(o => o.supplierId === 's1');
    assert.equal(skf.status, 'bozza');
    assert.deepEqual(skf.lines.map(l => [l.itemId, l.qty, l.price]), [['a1', 10, 2], ['a2', 25, 3]]);
    assert.equal(skf.lines[0].deliveryDate, a.eval('addWorkDays(oggiISO(), 5)'), 'cinque giorni lavorativi di listino');
    assert.match(skf.number, /^ODA-/);
    assert.equal(a.eval('db.orders.length'), 2, 'salvati');
  });

  it('solo gli articoli scelti', () => {
    const a = app();
    a.eval("riordinoGenera(['a3'])");
    assert.deepEqual(JSON.parse(a.eval('JSON.stringify(db.orders.map(o => o.supplierId))')), ['s2']);
  });

  it('un ordine in bozza non conta come in arrivo: la proposta resta finché non parte', () => {
    const a = app();
    a.eval("riordinoGenera(['a1'])");
    assert.ok(proposte(a).some(x => x.id === 'a1'), 'la bozza non è ancora un ordine al fornitore');
    assert.equal(a.eval("riordinoProposte().find(p => p.it.id === 'a1').inBozza"), a.eval('db.orders[0].number'), 'si dice che c\'è già una bozza');
  });

  it('chi non scrive ordini non ne crea', () => {
    const a = app('progettazione');
    assert.equal(a.eval("riordinoGenera(['a1']).length"), 0);
    assert.equal(a.eval('db.orders.length'), 0);
  });

  it('il pulsante del magazzino conta le proposte, e sparisce quando non ce ne sono', () => {
    assert.match(app().eval('riordinoButton()'), /Riordina sotto scorta \(4\)/);
    const b = app();
    b.eval("db.items.forEach(i => { i.safetyStock = 0; })");
    assert.equal(b.eval('riordinoButton()'), '');
  });
});

describe('Riordino: impegnato e obsoleti', () => {
  it('l\'impegnato dei piani non fa riordinare: quello lo ordinano i piani', () => {
    const a = app();
    a.eval("addMovement('a1', 'carico', 50, 'inventario')");
    a.eval(`db.plans = [{ id: 'pl1', number: 'FAB-1', title: '', date: '2026-07-01', active: true,
      lines: [{ id: 'r1', itemId: 'a1', qty: 45, dueDate: '2026-12-01' }] }]; invalidateCaches();`);
    assert.equal(a.eval("committedOf('a1', null)"), 45, 'il piano impegna');
    assert.equal(proposte(a).find(x => x.id === 'a1'), undefined,
      '50 a magazzino, scorta 10: non è sotto scorta, e il riordino non lo propone');
  });
  it('sotto scorta e impegnato: si riordina solo fino alla scorta', () => {
    const a = app();
    a.eval("addMovement('a1', 'carico', 4, 'inventario')");
    a.eval(`db.plans = [{ id: 'pl1', number: 'FAB-1', title: '', date: '2026-07-01', active: true,
      lines: [{ id: 'r1', itemId: 'a1', qty: 30, dueDate: '2026-12-01' }] }]; invalidateCaches();`);
    assert.equal(proposte(a).find(x => x.id === 'a1').qty, 6, '10 − 4: i 30 del piano non entrano');
  });
  it('un articolo obsoleto non si propone', () => {
    const a = app();
    a.eval("getItem('a1').obsolete = true; invalidateCaches();");
    assert.equal(proposte(a).find(x => x.id === 'a1'), undefined);
  });
});
