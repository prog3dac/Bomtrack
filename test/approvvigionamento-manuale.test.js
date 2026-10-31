// Approvvigionare a mano un articolo in una forma diversa da quella scritta in
// anagrafica (dalla 0.133.0).
//
// La scheda articolo decide gli automatismi — costo, esplosione, fabbisogno —
// e quella decisione resta. Ma a mano un articolo con un ciclo si deve poter
// fabbricare anche se in anagrafica si compra, e comprare anche se si fabbrica:
// ODP, ODL e ODA fanno tutto quello che fanno di solito — fasi, prelievo,
// versamento, rientro, ricevimento — e il carico dei centri vede le ore degli
// ordini che nessun piano conta.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, parte, asm, comp, wc } = require('./fixtures.js');

// Il perno: 10 tornitura in casa (0,5 h/pz, 2 h di attrezzaggio), 20 zincatura da Beta.
const ciclo = [
  { kind: 'item', itemId: 'tondo', qty: 2 },
  { kind: 'op', workCenterId: 'tor', supplierId: '', costMode: 'orario', hours: 0.5, setupHours: 2, rate: 40, days: 1, note: '' },
  { kind: 'op', workCenterId: 'zin', supplierId: 'beta', costMode: 'fisso', cost: 3, hours: 0, days: 2, note: '' },
];
function conDb(sourcing, plans) {
  const app = loadApp({ silent: true });
  app.asRole('admin');
  app.setDb(makeDb({
    suppliers: [{ id: 'beta', name: 'Beta', active: true }],
    workCenters: [Object.assign(wc('tor', 40), { capacityHours: 40 }), wc('zin', 30)],
    items: [
      Object.assign(mat('tondo', 5), { uom: 'kg' }),
      parte('perno', { sourcing, unitCost: 12, supplierId: 'beta', cycle: ciclo }),
      asm('grp', 'gruppo', { components: [comp('perno', 1)] }),
    ],
    plans: plans || [],
  }));
  app.eval("addMovement('tondo', 'carico', 100, 'giacenza iniziale'); invalidateCaches();");
  return app;
}
// Un ODP dalla stessa fabbrica dell'interfaccia.
function nuovoOdp(app, qty, extra) {
  return app.eval(`(function () {
    const o = odpNew(getItem('perno'), ${qty}, '2026-11-27', ${JSON.stringify(extra || {})});
    db.prodOrders.push(o); invalidateCaches();
    return o.id;
  })()`);
}
const onHand = (app, id) => Number(app.eval(`(invalidateCaches(), onHandOf(${JSON.stringify(id)}))`));
const fase = (app, odpId, k) => app.eval(`getOdp(${JSON.stringify(odpId)}).phases[${k}].id`);
const oreCentro = (app, expr, wcId) => Number(app.eval(`(invalidateCaches(),
  (${expr}).righe.filter(r => r.workCenterId === ${JSON.stringify(wcId)}).reduce((s, r) => s + r.totale, 0))`));

describe('Parte acquistata in anagrafica, fabbricata con ODP e ODL', () => {
  it('l\'ordine nasce con le fasi del ciclo e il materiale della distinta', () => {
    const app = conDb('buy');
    const id = nuovoOdp(app, 10);
    const o = JSON.parse(app.eval(`JSON.stringify(getOdp(${JSON.stringify(id)}))`));
    assert.equal(o.phases.length, 2);
    assert.deepEqual(o.materials.map(m => [m.itemId, m.qty]), [['tondo', 20]]);
    assert.equal(app.eval(`opLancia(${JSON.stringify(id)})`), true);
  });
  it('fa uscire il materiale, passa dal terzista e versa la parte a magazzino', () => {
    const app = conDb('buy');
    const id = nuovoOdp(app, 10);
    app.eval(`opLancia(${JSON.stringify(id)})`);
    assert.equal(app.eval(`opAvvia(${JSON.stringify(id)}, ${JSON.stringify(fase(app, id, 0))})`), true);
    approx(onHand(app, 'tondo'), 80);
    assert.equal(app.eval(`opDichiara(${JSON.stringify(id)}, ${JSON.stringify(fase(app, id, 0))}, { qty: 10 })`), true);
    const odl = JSON.parse(app.eval(`JSON.stringify(opGeneraOdl(${JSON.stringify(id)}, ${JSON.stringify(fase(app, id, 1))}))`));
    assert.ok(odl && odl.lines.length === 1, 'la fase esterna diventa un ordine di lavoro');
    assert.equal(odl.supplierId, 'beta');
    app.eval(`opAvvia(${JSON.stringify(id)}, ${JSON.stringify(fase(app, id, 1))})`);
    assert.equal(app.eval(`opDichiaraTratta(${JSON.stringify(id)}, ${JSON.stringify(fase(app, id, 1))}, { qty: 10 })`), true);
    approx(onHand(app, 'perno'), 10, 'la parte entra al rientro dell\'ultima fase');
    assert.equal(app.eval(`getOdp(${JSON.stringify(id)}).status`), 'completato');
  });
  it('il carico dei centri vede le ore dell\'ordine, che il fabbisogno non esplode', () => {
    const app = conDb('buy', [{ id: 'pl1', number: 'FAB-2026-001', title: '', date: '2026-11-01', notes: '',
      lines: [{ id: 'l1', itemId: 'grp', qty: 10, dueDate: '2026-12-15' }], active: true }]);
    approx(oreCentro(app, 'mrpLoadAll()', 'tor'), 0, 'il piano compra il perno: nessuna ora');
    const id = nuovoOdp(app, 10);
    approx(oreCentro(app, 'mrpLoadAll()', 'tor'), 10 * 0.5 + 2, 'pezzi × ore più attrezzaggio');
    approx(oreCentro(app, 'mrpLoadTable(loadEntries())', 'tor'), 7);
    // Dopo l'avvio l'attrezzaggio è speso; dichiarati 4 pezzi, ne restano 6.
    app.eval(`opLancia(${JSON.stringify(id)}); opAvvia(${JSON.stringify(id)}, ${JSON.stringify(fase(app, id, 0))});
      opDichiara(${JSON.stringify(id)}, ${JSON.stringify(fase(app, id, 0))}, { qty: 4 })`);
    approx(oreCentro(app, 'mrpLoadAll()', 'tor'), 6 * 0.5);
    // Il dettaglio di una cella dice l'ordine al posto del piano.
    const voce = JSON.parse(app.eval('JSON.stringify(odpLoadEntries("tutti")[0].voci[0])'));
    assert.equal(voce.odpId, id);
    assert.match(voce.planNumber, /^ODP-/);
  });
  it('un ordine annullato o completato non carica più', () => {
    const app = conDb('buy');
    const id = nuovoOdp(app, 10);
    app.eval(`getOdp(${JSON.stringify(id)}).status = 'annullato'`);
    approx(oreCentro(app, 'mrpLoadAll()', 'tor'), 0);
  });
  it('la scheda di creazione dice che il fabbisogno continua a comprarla', () => {
    const app = conDb('buy');
    assert.match(app.eval("odpNotaAcquistata(getItem('perno'))"), /si <strong>acquista<\/strong>/);
    const prodotta = conDb('make');
    assert.equal(prodotta.eval("odpNotaAcquistata(getItem('perno'))"), '');
  });
});

describe('Parte prodotta in anagrafica, comprata con un ODA', () => {
  it('la riga si aggiunge, è in arrivo, e il ricevuto entra a magazzino', () => {
    const app = conDb('make');
    app.eval(`(function () {
      const l = docLineFromItem(getItem('perno'), 'beta'); l.qty = 5; l.received = 0;
      db.orders.push({ id: 'o1', number: 'ODA-2026-001', title: '', date: '2026-11-01', status: 'inviato',
        supplierId: 'beta', lines: [l], active: true, planId: null, jobId: null });
      invalidateCaches();
    })()`);
    approx(Number(app.eval("(invalidateCaches(), incomingOf('perno'))")), 5);
    app.eval("(function(){ const o = getOrder('o1'); registraRicevuto('orders', o, o.lines[0], 5); })()");
    approx(onHand(app, 'perno'), 5);
  });
});

describe('Un ODP del piano non conta due volte nel carico', () => {
  it('le sue ore sono quelle del piano, non si sommano', () => {
    const app = conDb('make', [{ id: 'pl1', number: 'FAB-2026-001', title: '', date: '2026-11-01', notes: '',
      lines: [{ id: 'l1', itemId: 'perno', qty: 10, dueDate: '2026-12-15' }], active: true }]);
    const prima = oreCentro(app, 'mrpLoadAll()', 'tor');
    assert.ok(prima > 0);
    nuovoOdp(app, 10, { planId: 'pl1' });
    approx(oreCentro(app, 'mrpLoadAll()', 'tor'), prima);
  });
});
