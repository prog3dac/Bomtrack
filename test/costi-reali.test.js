// Modulo Costi reali (dalla 0.122.0): il costo medio d'acquisto si calcola
// dai ricevimenti degli ordini e, se scelto, valorizza il magazzino.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

function app(o) {
  const x = o || {};
  const a = loadApp({ silent: true });
  const tubo = Object.assign(acq('t1', 10), { uom: 'm', altUom: 'kg', altFactor: 8 });   // 8 kg al metro
  const db = makeDb({
    items: [acq('v1', 5), tubo],
    orders: [
      { id: 'o1', number: 'ODA1', status: 'evaso', lines: [{ id: 'l1', itemId: 'v1', qty: 10, received: 10, price: 4 }] },
      { id: 'o2', number: 'ODA2', status: 'parziale', lines: [{ id: 'l2', itemId: 'v1', qty: 30, received: 30, price: 6 },
        { id: 'l3', itemId: 't1', qty: 160, received: 120, price: 2, uom: 'kg' }] },
      { id: 'o3', number: 'ODA3', status: 'annullato', lines: [{ id: 'l4', itemId: 'v1', qty: 100, received: 100, price: 99 }] },
    ],
    settings: { modules: x.modules || { costiReali: true }, valoreMagazzino: x.valore || 'medio' },
  });
  a.setDb(db); a.asRole('admin');
  return a;
}

describe('Costo medio d\'acquisto', () => {
  it('media ponderata sulle quantità ricevute, ordini annullati esclusi', () => {
    // (10×4 + 30×6) / 40 = 5,5
    assert.equal(app().eval("costoMedioOf('v1')"), 5.5);
  });
  it('il prezzo è nell\'unità del fornitore, la quantità in quella di gestione', () => {
    // 120 kg × 2 € = 240 € per 15 m → 16 €/m
    assert.equal(app().eval("costoMedioOf('t1')"), 16);
  });
  it('un articolo mai ricevuto non ha costo medio', () => {
    const a = app();
    a.eval("db.orders = []; invalidateStock()");
    assert.equal(a.eval("costoMedioOf('v1')"), null);
  });
});

describe('Valore del magazzino', () => {
  it('a costo medio con il modulo acceso e la scelta fatta', () => {
    assert.equal(app().eval("valoreGiacenza(getItem('v1'))"), app().eval("onHandOf('v1')") * 5.5);
  });
  it('a listino se la scelta è listino', () => {
    assert.equal(app({ valore: 'listino' }).eval("valoreGiacenza(getItem('v1'))"), app().eval("onHandOf('v1')") * 5);
  });
  it('a listino con il modulo spento, o con la Pianificazione spenta', () => {
    assert.equal(app({ modules: {} }).eval("valoreGiacenza(getItem('v1'))"), app().eval("onHandOf('v1')") * 5);
    assert.equal(app({ modules: { costiReali: true, pianificazione: false } }).eval("valoreGiacenza(getItem('v1'))"), app().eval("onHandOf('v1')") * 5);
  });
  it('la scheda articolo mostra il costo medio solo col modulo acceso', () => {
    assert.match(app().eval("itemInfoMagazzino(getItem('v1'))"), /Costo medio/);
    assert.ok(!/Costo medio/.test(app({ modules: {} }).eval("itemInfoMagazzino(getItem('v1'))")));
  });
});

// ── Consuntivo di commessa ──
// Commessa J1, piano P1 con 2 pezzi della parte p1 (materiale v1 ×3 + una
// fase interna da 10 € a pezzo). Un ODA da 20 v1 a 6 € per la commessa,
// un ODP che ne ha prelevati 6 e lavorato 2 pezzi, un ODL da 50 € ricevuto.
function appCommessa(modules) {
  const a = loadApp({ silent: true });
  const p1 = { id: 'p1', code: 'P1', name: 'Parte', type: 'parte', uom: 'pz', sourcing: 'make', active: true,
    cycle: [{ kind: 'mat', itemId: 'v1', qty: 3 }, { kind: 'op', workCenterId: 'w1', costMode: 'fisso', cost: 10 }] };
  const db = makeDb({
    items: [acq('v1', 5), p1],
    workCenters: [{ id: 'w1', name: 'Tornio', hourlyRate: 40, active: true }],
    jobs: [{ id: 'J1', number: 'COM1', status: 'aperta', active: true }],
    plans: [{ id: 'P1', number: 'FAB1', jobId: 'J1', lines: [{ id: 'pl1', itemId: 'p1', qty: 2 }], active: true }],
    orders: [{ id: 'o1', number: 'ODA1', status: 'evaso', planId: 'P1', lines: [{ id: 'l1', itemId: 'v1', qty: 20, received: 20, price: 6 }] }],
    workOrders: [{ id: 'w1o', number: 'ODL1', status: 'evaso', jobId: 'J1', supplierId: null, lines: [{ id: 'wl1', qty: 2, received: 2, price: 25 }] }],
    prodOrders: [{ id: 'odp1', number: 'ODP1', planId: 'P1', itemId: 'p1', qty: 2, status: 'lanciato', active: true,
      phases: [{ id: 'f1', seq: 10, opIndex: 0, workCenterId: 'w1', wcName: 'Tornio', costMode: 'fisso', cost: 10 }] }],
    prodDecls: [{ id: 'd1', odpId: 'odp1', phaseId: 'f1', kind: 'avanzamento', qty: 2, scrap: 0 }],
    movements: [{ id: 'm1', itemId: 'v1', kind: 'scarico', qty: -6, orderId: 'odp1', date: '2026-10-01' }],
    settings: { modules: modules || { costiReali: true } },
  });
  a.setDb(db); a.asRole('admin');
  return a;
}
const voce = (c, id) => c.voci.find(v => v.id === id);

describe('Consuntivo di commessa', () => {
  it('il preventivo viene dai piani della commessa, provvisorio finché non si congela', () => {
    const c = appCommessa().eval("jobConsuntivo('J1')");
    assert.equal(c.congelato, false);
    assert.equal(voce(c, 'materiali').prev, 2 * 3 * 5);
    assert.equal(voce(c, 'lavorazioni').prev, 2 * 10);
  });
  it('il materiale prelevato non si conta anche come ricevuto', () => {
    const c = appCommessa().eval("jobConsuntivo('J1')");
    // 6 prelevati a listino (5 €): l'ODA da 120 € non si somma
    assert.equal(voce(c, 'materiali').reale, 30);
  });
  it('lavorazioni: fasi interne lavorate più ODL ricevuti', () => {
    const c = appCommessa().eval("jobConsuntivo('J1')");
    assert.equal(voce(c, 'lavorazioni').reale, 2 * 10 + 2 * 25);
  });
  it('senza prelievi conta il ricevuto degli ODA', () => {
    const a = appCommessa();
    a.eval("db.movements = []; invalidateStock()");
    assert.equal(voce(a.eval("jobConsuntivo('J1')"), 'materiali').reale, 120);
  });
  it('andando in produzione il preventivo si congela, e non segue più il listino', () => {
    const a = appCommessa();
    a.eval("jobApplyField('J1', 'status', 'produzione')");
    assert.ok(a.eval("!!getJob('J1').costSnapshot"));
    a.eval("getItem('v1').purchasePrice = 50; invalidateCaches()");
    const c = a.eval("jobConsuntivo('J1')");
    assert.equal(c.congelato, true);
    assert.equal(voce(c, 'materiali').prev, 30);
  });
  it('col modulo spento non si congela e la scheda non mostra il consuntivo', () => {
    const a = appCommessa({});
    a.eval("jobApplyField('J1', 'status', 'produzione')");
    assert.equal(a.eval("getJob('J1').costSnapshot"), undefined);
    assert.ok(!/Consuntivo/.test(a.eval("renderJobEdit('J1')")));
    assert.match(appCommessa().eval("renderJobEdit('J1')"), /Consuntivo/);
  });
});
