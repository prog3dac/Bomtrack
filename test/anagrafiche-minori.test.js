// Le anagrafiche di servizio minori di Gestione: trasporto e pagamento, dati
// azienda, concetti delle parti, centri di lavoro (C3 residuo, dalla 0.107.0).
//
// Sono moduli brevi, ed erano gli ultimi senza un test: un campo letto con
// l'id sbagliato o un duplicato lasciato passare non si vede finché qualcuno
// non stampa una richiesta d'offerta con l'intestazione vuota.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb } = require('./fixtures.js');

function app(dbObj, role) {
  const a = loadApp({ silent: true });
  a.setDb(dbObj || makeDb({ items: [] }));
  a.asRole(role || 'admin');
  a.eval('setView("manage")');
  return a;
}
const scrivi = (a, campi) => Object.keys(campi).forEach(id => { a.el(id).value = campi[id]; });
const leggi = (a, expr) => JSON.parse(a.eval('JSON.stringify(' + expr + ')'));

describe('Trasporto e pagamento', () => {
  it('una voce nuova si aggiunge in fondo', () => {
    const a = app();
    scrivi(a, { 'terms-transport-new': 'Franco destino' });
    a.eval('termsAdd("transport")');
    assert.deepEqual(leggi(a, 'db.settings.transportOptions').slice(-1), ['Franco destino']);
  });
  it('vuota o già presente non si aggiunge', () => {
    const a = app();
    scrivi(a, { 'terms-payment-new': 'Bonifico 30 gg' });
    a.eval('termsAdd("payment")');
    const prima = leggi(a, 'db.settings.paymentOptions').length;
    a.eval('termsAdd("payment")');
    scrivi(a, { 'terms-payment-new': '' });
    a.eval('termsAdd("payment")');
    assert.equal(leggi(a, 'db.settings.paymentOptions').length, prima);
  });
  it('un lettore non aggiunge', () => {
    const a = app(null, 'lettore');
    scrivi(a, { 'terms-transport-new': 'Corriere' });
    a.eval('termsAdd("transport")');
    assert.ok(!leggi(a, 'db.settings.transportOptions || []').includes('Corriere'));
  });
  it('il pannello segna la voce predefinita', () => {
    const a = app();
    a.eval('db.settings.transportOptions = ["Porto franco", "Porto assegnato"]; db.settings.transportDefault = "Porto assegnato"');
    const h = a.eval('renderTerms()');
    assert.match(h, /Porto assegnato <span class="terms-default">predefinito<\/span>/);
    assert.ok(!/Porto franco <span class="terms-default">/.test(h));
  });
});

describe('Dati azienda', () => {
  it('si salvano tutti i campi, indirizzo compreso, e la provincia in maiuscolo', () => {
    const a = app();
    scrivi(a, {
      'co-name': 'Officine Rossi srl', 'co-ref': 'Mario', 'co-email': 'm@rossi.it', 'co-phone': '059 1',
      'co-vat': 'IT0123', 'co-street': 'Via Emilia', 'co-num': '12', 'co-zip': '41100', 'co-city': 'Modena',
      'co-prov': 'mo', 'co-country': 'Italia',
    });
    a.eval('saveCompany()');
    assert.deepEqual(leggi(a, 'db.settings.company'), {
      name: 'Officine Rossi srl', referente: 'Mario', email: 'm@rossi.it', phone: '059 1', vat: 'IT0123',
      street: 'Via Emilia', streetNumber: '12', zip: '41100', city: 'Modena', province: 'MO', country: 'Italia',
    });
  });
  it('il modulo li ripropone, passati da esc()', () => {
    const a = app();
    a.eval('db.settings.company = { name: "Rossi & \\"figli\\"", city: "<Modena>" }');
    const h = a.eval('renderCompany()');
    assert.ok(h.includes('value="Rossi &amp; &quot;figli&quot;"'), 'ragione sociale');
    assert.ok(h.includes('value="&lt;Modena&gt;"'), 'città');
  });
  it('un lettore non li cambia', () => {
    const a = app(null, 'lettore');
    scrivi(a, { 'co-name': 'Altro nome' });
    a.eval('saveCompany()');
    assert.notEqual(leggi(a, '(db.settings.company || {}).name || ""'), 'Altro nome');
  });
});

describe('Concetti delle parti', () => {
  const conParte = () => makeDb({
    items: [{ id: 'p1', code: 'P-1', name: 'ALBERO motore', type: 'parte', conceptId: 'c1', active: true }],
    settings: { concepts: [{ id: 'c1', name: 'ALBERO' }, { id: 'c2', name: 'FLANGIA' }] },
  });

  it('un concetto nuovo nasce in maiuscolo', () => {
    const a = app();
    scrivi(a, { 'concept-name': '  boccola ' });
    a.eval('addConcept()');
    assert.deepEqual(leggi(a, 'conceptList().map(c => c.name)'), ['BOCCOLA']);
  });
  it('lo stesso nome due volte no, nemmeno scritto in minuscolo', () => {
    const a = app(conParte());
    scrivi(a, { 'concept-name': 'albero' });
    a.eval('addConcept()');
    assert.equal(leggi(a, 'conceptList().length'), 2);
  });
  it('si conta dove è usato', () => {
    const a = app(conParte());
    assert.equal(leggi(a, 'conceptUsage("c1")'), 1);
    assert.equal(leggi(a, 'conceptUsage("c2")'), 0);
  });
  it('in uso non si rinomina, libero sì', () => {
    const a = app(conParte());
    a.eval('editConceptModal(0)'); scrivi(a, { 'ecpt-name': 'ALBERINO' }); a.eval('saveConcept(0)');
    a.eval('editConceptModal(1)'); scrivi(a, { 'ecpt-name': 'flangia piana' }); a.eval('saveConcept(1)');
    assert.deepEqual(leggi(a, 'conceptList().map(c => c.name)'), ['ALBERO', 'FLANGIA PIANA']);
  });
  it('rinominato come un altro, no', () => {
    const a = app(conParte());
    a.eval('editConceptModal(1)'); scrivi(a, { 'ecpt-name': 'albero' }); a.eval('saveConcept(1)');
    assert.deepEqual(leggi(a, 'conceptList().map(c => c.name)'), ['ALBERO', 'FLANGIA']);
  });
  it('in uso non si elimina; libero si elimina dopo la conferma', () => {
    const a = app(conParte());
    a.eval('delConcept(0)');
    assert.equal(leggi(a, 'conceptList().length'), 2, 'ALBERO è usato da una parte');
    a.eval('delConcept(1)');
    assert.equal(leggi(a, 'conceptList().length'), 2, 'prima della conferma resta');
    a.eval('confirmYes()');
    assert.deepEqual(leggi(a, 'conceptList().map(c => c.name)'), ['ALBERO']);
  });
});

describe('Centri di lavoro', () => {
  it('un centro nuovo nasce attivo con tariffa e capacità', () => {
    const a = app();
    scrivi(a, { 'wc-name': 'Fresa CNC', 'wc-rate': '48.5', 'wc-cap': '40' });
    a.eval('addWc()');
    const w = leggi(a, 'db.workCenters.find(w => w.name === "Fresa CNC")');
    assert.equal(w.hourlyRate, 48.5);
    assert.equal(w.capacityHours, 40);
    assert.equal(w.active, true);
  });
  it('senza nome, o con numeri negativi, non nasce', () => {
    const a = app();
    const prima = leggi(a, 'db.workCenters.length');
    scrivi(a, { 'wc-name': '', 'wc-rate': '10', 'wc-cap': '0' }); a.eval('addWc()');
    scrivi(a, { 'wc-name': 'Tornio', 'wc-rate': '-1', 'wc-cap': '0' }); a.eval('addWc()');
    scrivi(a, { 'wc-name': 'Tornio', 'wc-rate': '10', 'wc-cap': '-5' }); a.eval('addWc()');
    assert.equal(leggi(a, 'db.workCenters.length'), prima);
  });
});
