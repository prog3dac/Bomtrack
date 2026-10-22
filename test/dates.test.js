// Date, lead time e commesse.
//
// `leadDays` stava a listino da versioni e non entrava in nessun conto: c'era
// scritto che il fornitore consegna in 21 giorni e nessuno se ne faceva niente.
// Questi test fissano il ponte fra «serve per il 30 settembre» e «va ordinato
// entro il 9», e la catena commessa → fabbisogno → richiesta → ordine.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, asm, comp } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || base());
  a.asRole('admin');
  return a;
}
function base() {
  return makeDb({
    suppliers: [{ id: 's1', name: 'SKF', active: true }],
    items: [
      asm('mac', 'macchina', { components: [comp('g1', 1)] }),
      asm('g1', 'gruppo', { components: [comp('m1', 4), comp('c1', 2)] }),
      Object.assign(mat('m1', 10), {
        priceList: [{ id: 'p1', supplierId: 's1', price: 10, leadDays: 21, date: '2026-01-01' }],
        activePriceId: 'p1', supplierId: 's1',
      }),
      Object.assign(acq('c1', 5), {
        priceList: [{ id: 'p2', supplierId: 's1', price: 5, leadDays: 5, date: '2026-01-01' }],
        activePriceId: 'p2', supplierId: 's1',
      }),
    ],
  });
}
function piano(a, righe) {
  a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-1', active: true, lines: ${JSON.stringify(righe)} });`);
  return a;
}
function righe(a) {
  return JSON.parse(a.eval('JSON.stringify(mrpBuyRows(getPlan("pl1"), false).map(r => ({ code: r.item.code, due: r.due, leadDays: r.leadDays, orderBy: r.orderBy, urgenza: r.urgenza })))'));
}

describe('Aritmetica delle date', () => {
  it('addDays somma e sottrae, anche a cavallo di mese', () => {
    const a = app();
    assert.equal(a.eval('addDays("2026-09-30", -21)'), '2026-09-09');
    assert.equal(a.eval('addDays("2026-01-05", -10)'), '2025-12-26');
    assert.equal(a.eval('addDays("2026-02-28", 1)'), '2026-03-01');
  });
  it('un anno bisestile non sposta i conti', () => {
    const a = app();
    assert.equal(a.eval('addDays("2028-02-28", 1)'), '2028-02-29');
  });
  it('una data vuota o illeggibile resta vuota, non diventa oggi', () => {
    const a = app();
    assert.equal(a.eval('addDays("", -5)'), '');
    assert.equal(a.eval('addDays("non-una-data", -5)'), '');
    assert.equal(a.eval('addDays(null, -5)'), '');
  });
  it('primaData tiene la più vicina, e una vuota non vince mai', () => {
    const a = app();
    assert.equal(a.eval('primaData("2026-09-30", "2026-08-01")'), '2026-08-01');
    assert.equal(a.eval('primaData("", "2026-08-01")'), '2026-08-01');
    assert.equal(a.eval('primaData("2026-08-01", "")'), '2026-08-01');
    assert.equal(a.eval('primaData("", "")'), '');
  });
});

describe('La data scende lungo la distinta', () => {
  it('i componenti ereditano la data della riga di piano', () => {
    const a = piano(app(), [{ id: 'l1', itemId: 'mac', qty: 10, dueDate: '2026-09-30' }]);
    righe(a).forEach(r => assert.equal(r.due, '2026-09-30', r.code));
  });

  it('senza data non si inventa niente', () => {
    const a = piano(app(), [{ id: 'l1', itemId: 'mac', qty: 10 }]);
    righe(a).forEach(r => {
      assert.equal(r.due, '');
      assert.equal(r.orderBy, '');
      assert.equal(r.urgenza, '', 'nessuna data, nessun semaforo: inventarne uno sarebbe peggio del vuoto');
    });
  });

  it('lo stesso articolo da due righe con date diverse prende la più vicina', () => {
    const a = piano(app(), [
      { id: 'l1', itemId: 'mac', qty: 5, dueDate: '2026-11-30' },
      { id: 'l2', itemId: 'g1', qty: 3, dueDate: '2026-08-15' },
    ]);
    const m1 = righe(a).find(r => r.code === 'M1');
    assert.equal(m1.due, '2026-08-15',
      'ordinare per la data più stretta copre anche l\'altra: il contrario no');
  });

  it('una riga con data e una senza: vince quella con la data', () => {
    const a = piano(app(), [
      { id: 'l1', itemId: 'mac', qty: 5, dueDate: '2026-11-30' },
      { id: 'l2', itemId: 'g1', qty: 3 },
    ]);
    assert.equal(righe(a).find(r => r.code === 'M1').due, '2026-11-30');
  });

  it('le quantità restano quelle di prima: la data non tocca i conti', () => {
    const a = piano(app(), [{ id: 'l1', itemId: 'mac', qty: 10, dueDate: '2026-09-30' }]);
    const r = JSON.parse(a.eval('JSON.stringify(mrpBuyRows(getPlan("pl1"), false).map(x => ({ c: x.item.code, q: x.qty })))'));
    assert.deepEqual(r.find(x => x.c === 'M1').q, 40);
    assert.deepEqual(r.find(x => x.c === 'C1').q, 20);
  });
});

describe('Lead time: entro quando ordinare', () => {
  // Dalla 0.110.0 i giorni dei fornitori sono lavorativi di serie: 21 giorni
  // di consegna sono quattro settimane di lavoro e un giorno, non tre settimane.
  it('la data d\'ordine è quella in cui serve meno i giorni di consegna, lavorativi', () => {
    const a = piano(app(), [{ id: 'l1', itemId: 'mac', qty: 1, dueDate: '2026-09-30' }]);
    const r = righe(a);
    assert.equal(r.find(x => x.code === 'M1').orderBy, '2026-09-01', '21 giorni lavorativi prima di mercoledì 30');
    assert.equal(r.find(x => x.code === 'C1').orderBy, '2026-09-23', '5 giorni lavorativi prima: mercoledì 23');
  });

  it('con i giorni dei fornitori di calendario si contano pieni', () => {
    const a = piano(app(), [{ id: 'l1', itemId: 'mac', qty: 1, dueDate: '2026-09-30' }]);
    a.eval("db.settings.calendar = Object.assign(calDefault(), { supplierDays: 'calendario' }); invalidateCaches();");
    const r = righe(a);
    assert.equal(r.find(x => x.code === 'M1').orderBy, '2026-09-09', '21 giorni prima');
    assert.equal(r.find(x => x.code === 'C1').orderBy, '2026-09-25', '5 giorni prima');
  });

  it('senza giorni di consegna la data d\'ordine coincide con quella in cui serve', () => {
    const a = piano(app(), [{ id: 'l1', itemId: 'mac', qty: 1, dueDate: '2026-09-30' }]);
    a.eval('const it = getItem("m1"); it.priceList[0].leadDays = ""; touch(it); saveDB();');
    const m1 = righe(a).find(x => x.code === 'M1');
    assert.equal(m1.leadDays, 0);
    assert.equal(m1.orderBy, '2026-09-30', 'nessun anticipo, non un anticipo inventato');
  });

  // I tempi di consegna sono termini del fornitore, come il prezzo: valgono
  // quelli della sua quotazione più recente. Se a febbraio ha detto 90 giorni,
  // pianificare sui 21 di gennaio è pianificare su termini scaduti — e la
  // commessa slitta senza che nessuno l'abbia visto arrivare.
  it('i giorni di consegna sono quelli dell\'ultima quotazione di quel fornitore', () => {
    const a = piano(app(), [{ id: 'l1', itemId: 'mac', qty: 1, dueDate: '2026-09-30' }]);
    a.eval(`const it = getItem("m1");
      it.priceList.push({ id: 'p9', supplierId: 's1', price: 1, leadDays: 90, date: '2026-02-01' });
      touch(it); saveDB();`);
    assert.equal(righe(a).find(x => x.code === 'M1').leadDays, 90,
      'l\'ultima parola di quel fornitore sui suoi tempi');
  });

  it('ma la quotazione di un ALTRO fornitore non detta i tempi', () => {
    const a = piano(app(), [{ id: 'l1', itemId: 'mac', qty: 1, dueDate: '2026-09-30' }]);
    a.eval(`db.suppliers.push({ id: 's9', name: 'Altro', active: true });
      const it = getItem("m1");
      it.priceList.push({ id: 'p9', supplierId: 's9', price: 1, leadDays: 90, date: '2026-06-01' });
      touch(it); saveDB();`);
    assert.equal(righe(a).find(x => x.code === 'M1').leadDays, 21,
      'si compra da SKF: sono i tempi di SKF che contano, per recente che sia l\'altra');
  });

  it('un valore sporco non produce una data assurda', () => {
    const a = piano(app(), [{ id: 'l1', itemId: 'mac', qty: 1, dueDate: '2026-09-30' }]);
    a.eval('const it = getItem("m1"); it.priceList[0].leadDays = -30; touch(it); saveDB();');
    const m1 = righe(a).find(x => x.code === 'M1');
    assert.equal(m1.leadDays, 0);
    assert.equal(m1.orderBy, '2026-09-30', 'un lead time negativo direbbe di ordinare dopo che serve');
  });
});

describe('Semaforo di urgenza', () => {
  const u = a => (orderBy) => a.eval(`urgenzaOrdine(${JSON.stringify(orderBy)})`);

  it('una data d\'ordine passata è un ritardo', () => {
    const a = app();
    assert.equal(u(a)('2020-01-01'), 'ritardo');
  });
  it('oggi non è ancora un ritardo, ma è urgente', () => {
    const a = app();
    assert.equal(u(a)(a.eval('oggiISO()')), 'urgente');
  });
  it('entro la soglia è urgente, oltre è tranquillo: la soglia è in giorni lavorativi', () => {
    const a = app();
    const soglia = a.eval('URGENCY_WARN_DAYS');
    assert.equal(soglia, 5, 'una settimana di lavoro');
    assert.equal(u(a)(a.eval(`addWorkDays(oggiISO(), ${soglia})`)), 'urgente');
    assert.equal(u(a)(a.eval(`addWorkDays(oggiISO(), ${soglia + 1})`)), 'ok');
  });
  it('senza data nessun semaforo', () => {
    const a = app();
    assert.equal(u(a)(''), '');
    assert.equal(u(a)(null), '');
  });
  it('l\'urgenza si misura sulla data d\'ordine, non su quella in cui serve', () => {
    // Serve fra 30 giorni, ma il fornitore ci mette 60: è già in ritardo oggi.
    const a = app();
    a.eval('const it = getItem("m1"); it.priceList[0].leadDays = 60; touch(it); saveDB();');
    piano(a, [{ id: 'l1', itemId: 'mac', qty: 1, dueDate: a.eval('addDays(oggiISO(), 30)') }]);
    const m1 = righe(a).find(x => x.code === 'M1');
    assert.equal(m1.urgenza, 'ritardo',
      'guardare la data in cui serve direbbe "manca un mese", ed è falso');
  });
});

describe('Le date arrivano sui documenti', () => {
  it('la riga d\'ordine nasce con la consegna richiesta', () => {
    const a = piano(app(), [{ id: 'l1', itemId: 'mac', qty: 1, dueDate: '2026-09-30' }]);
    const linea = JSON.parse(a.eval(`JSON.stringify((function(){
      const r = mrpBuyRows(getPlan("pl1"), false).find(x => x.item.code === "M1");
      return planDocLine(r, r.priceDoc);
    })())`));
    assert.equal(linea.deliveryDate, '2026-09-30',
      'era sempre vuota, e chi generava un ordine doveva riscriverla a mano su ogni riga');
  });

  it('senza data di piano la riga resta senza data, non con una a caso', () => {
    const a = piano(app(), [{ id: 'l1', itemId: 'mac', qty: 1 }]);
    const linea = JSON.parse(a.eval(`JSON.stringify((function(){
      const r = mrpBuyRows(getPlan("pl1"), false).find(x => x.item.code === "M1");
      return planDocLine(r, r.priceDoc);
    })())`));
    assert.equal(linea.deliveryDate, '');
  });

  it('la nuova riga di piano eredita la data di testata', () => {
    const a = app();
    a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-1', active: true, dueDate: '2026-10-15', lines: [] });
      planAddLines('pl1', ['mac']);`);
    assert.equal(a.snapshot().plans[0].lines[0].dueDate, '2026-10-15',
      'riscrivere la stessa data su ogni riga è lavoro inutile');
  });
});

describe('Data richiesta contro data confermata', () => {
  const conRiga = (a, l) => {
    a.eval(`db.orders.push({ id: 'o1', number: 'ODA-1', status: 'inviato', supplierId: 's1', active: true,
      lines: [${JSON.stringify(Object.assign({ id: 'l1', itemId: 'm1', qty: 10, price: 10 }, l))}] }); saveDB();`);
    return a;
  };
  it('il fornitore conferma più tardi: si conta il ritardo', () => {
    const a = conRiga(app(), { deliveryDate: '2026-09-30', confirmedDate: '2026-10-07' });
    assert.equal(a.eval('ordLineDelay(db.orders[0].lines[0])'), 5, 'una settimana dopo: cinque giorni lavorativi');
    assert.equal(a.eval('orderWorstDelay(db.orders[0])'), 5);
    assert.match(a.eval('ordLineDelayHtml(db.orders[0].lines[0])'), /\+5 giorni lavorativi sulla richiesta/);
  });
  it('con i giorni dei fornitori di calendario il ritardo si conta pieno', () => {
    const a = conRiga(app(), { deliveryDate: '2026-09-30', confirmedDate: '2026-10-07' });
    a.eval("db.settings.calendar = Object.assign(calDefault(), { supplierDays: 'calendario' }); invalidateCaches();");
    assert.equal(a.eval('ordLineDelay(db.orders[0].lines[0])'), 7);
    assert.match(a.eval('ordLineDelayHtml(db.orders[0].lines[0])'), /\+7 giorni sulla richiesta/);
  });
  it('conferma in anticipo: numero negativo, nessun allarme', () => {
    const a = conRiga(app(), { deliveryDate: '2026-09-30', confirmedDate: '2026-09-25' });
    assert.equal(a.eval('ordLineDelay(db.orders[0].lines[0])'), -3, 'da venerdì 25 a mercoledì 30: tre giorni lavorativi');
    assert.equal(a.eval('orderWorstDelay(db.orders[0])'), null, 'l\'anticipo non è un problema da segnalare in testata');
  });
  it('stessa data: nessuno scarto', () => {
    const a = conRiga(app(), { deliveryDate: '2026-09-30', confirmedDate: '2026-09-30' });
    assert.equal(a.eval('ordLineDelay(db.orders[0].lines[0])'), 0);
    assert.equal(a.eval('ordLineDelayHtml(db.orders[0].lines[0])'), '');
  });
  it('senza una delle due date non si confronta niente', () => {
    const a = conRiga(app(), { deliveryDate: '2026-09-30' });
    assert.equal(a.eval('ordLineDelay(db.orders[0].lines[0])'), null);
    assert.equal(a.eval('orderWorstDelay(db.orders[0])'), null);
  });
  it('in testata si mostra il ritardo peggiore, non il primo', () => {
    const a = app();
    a.eval(`db.orders.push({ id: 'o1', number: 'ODA-1', status: 'inviato', active: true, lines: [
      { id: 'a', deliveryDate: '2026-09-01', confirmedDate: '2026-09-03' },
      { id: 'b', deliveryDate: '2026-09-01', confirmedDate: '2026-09-20' },
      { id: 'c', deliveryDate: '2026-09-01', confirmedDate: '2026-09-02' }] }); saveDB();`);
    assert.equal(a.eval('orderWorstDelay(db.orders[0])'), 14, 'è il peggiore a decidere se la commessa slitta: da martedì 1 a domenica 20, quattordici giorni lavorativi');
  });
  it('la data confermata si scrive anche a ordine inviato', () => {
    const a = conRiga(app(), { deliveryDate: '2026-09-30' });
    a.eval(`ordSetLine('o1', 'l1', 'confirmedDate', '2026-10-07');`);
    assert.equal(a.snapshot().orders[0].lines[0].confirmedDate, '2026-10-07',
      'arriva dopo l\'invio: bloccarla col contratto vorrebbe dire non poterla mai scrivere');
  });
});

describe('Commesse', () => {
  function conCommessa(a) {
    a.eval(`Store.insert('jobs', { id: 'j1', number: 'COM-2026-001', customer: 'Fonderie Bianchi',
      title: 'Linea NT-200', status: 'aperta', date: '2026-08-01', dueDate: '2026-11-30', active: true });`);
    return a;
  }

  it('la numerazione segue il proprio anno', () => {
    const a = app();
    const n = a.eval('nextJobNumber()');
    assert.match(n, /^COM-\d{4}-001$/);
    conCommessa(a);
    assert.match(a.eval('nextJobNumber()'), /-002$/);
  });

  it('un piano dichiara la propria commessa', () => {
    const a = conCommessa(app());
    a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-1', jobId: 'j1', active: true, lines: [] });`);
    assert.equal(a.eval('jobPlans("j1").length'), 1);
  });

  it('la commessa scende dal piano al documento', () => {
    const a = conCommessa(app());
    a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-1', jobId: 'j1', active: true,
      lines: [{ id: 'l1', itemId: 'mac', qty: 1, dueDate: '2026-09-30' }] });
      planNewOrder(getPlan('pl1'), 's1', mrpBuyRows(getPlan('pl1'), false)); saveDB();`);
    assert.equal(a.snapshot().orders[0].jobId, 'j1');
    assert.equal(a.eval('jobDocs("j1").orders.length'), 1);
  });

  it('un documento che viene da un piano della commessa vi appartiene comunque', () => {
    // Copre i documenti generati prima che la commessa fosse assegnata al piano.
    const a = conCommessa(app());
    a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-1', jobId: 'j1', active: true, lines: [] });
      db.orders.push({ id: 'o1', number: 'ODA-1', planId: 'pl1', status: 'inviato', active: true, lines: [] }); saveDB();`);
    assert.equal(a.eval('jobDocs("j1").orders.length'), 1);
  });

  it('i totali contano solo gli ordini vivi', () => {
    const a = conCommessa(app());
    a.eval(`db.orders.push(
      { id: 'o1', number: 'ODA-1', jobId: 'j1', status: 'parziale', active: true, lines: [{ id: 'a', qty: 10, price: 5, received: 4 }] },
      { id: 'o2', number: 'ODA-2', jobId: 'j1', status: 'annullato', active: true, lines: [{ id: 'b', qty: 100, price: 5, received: 0 }] });
      saveDB();`);
    const t = JSON.parse(a.eval('JSON.stringify(jobTotals("j1"))'));
    assert.equal(t.ordinato, 50, 'l\'ordine annullato non è una spesa');
    assert.equal(t.ricevuto, 20);
  });

  it('una commessa scaduta e non chiusa è in ritardo', () => {
    const a = app();
    a.eval(`Store.insert('jobs', { id: 'j1', number: 'COM-1', status: 'aperta', dueDate: '2020-01-01', active: true });`);
    assert.equal(a.eval('jobLate(getJob("j1"))'), true);
    a.eval(`jobSetField('j1', 'status', 'chiusa');`);
    assert.equal(a.eval('jobLate(getJob("j1"))'), false, 'una commessa consegnata non è in ritardo');
  });

  it('senza data di consegna non c\'è ritardo', () => {
    const a = app();
    a.eval(`Store.insert('jobs', { id: 'j1', number: 'COM-1', status: 'aperta', active: true });`);
    assert.equal(a.eval('jobLate(getJob("j1"))'), false);
  });

  it('non si cancella una commessa che regge del lavoro', () => {
    const a = conCommessa(app());
    a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-1', jobId: 'j1', active: true, lines: [] });
      delJob('j1');`);
    assert.equal(a.eval('jobList().length'), 1,
      'lascerebbe piani che citano un numero inesistente');
  });

  it('una commessa libera si cancella, dopo la conferma', () => {
    const a = conCommessa(app());
    a.eval(`delJob('j1');`);
    assert.equal(a.eval('jobList().length'), 1, 'niente sparisce prima del sì');
    a.eval('confirmYes()');
    assert.equal(a.eval('jobList().length'), 0);
  });

  it('le commesse chiuse spariscono dal menu, ma non da chi le aveva già scelte', () => {
    const a = app();
    a.eval(`Store.insert('jobs', { id: 'j1', number: 'COM-1', status: 'chiusa', active: true });`);
    assert.ok(!a.eval('jobOptions("")').includes('COM-1'));
    assert.ok(a.eval('jobOptions("j1")').includes('COM-1'), 'un piano vecchio non deve perdere il proprio riferimento');
  });

  it('il ruolo lettore non crea commesse', () => {
    const a = app();
    a.asRole('lettore');
    a.eval('newJob()');
    assert.equal(a.eval('jobList().length'), 0);
  });
});

describe('Le commesse nel giro verso il database condiviso', () => {
  it('sono una collezione come le altre', () => {
    const a = app();
    a.eval(`Store.insert('jobs', { id: 'j1', number: 'COM-1', customer: 'X', status: 'aperta', active: true });`);
    const prima = a.snapshot().jobs;
    const dopo = JSON.parse(a.eval('JSON.stringify(nestDB(flattenDB(db)).jobs)'));
    assert.deepEqual(dopo, prima);
  });
  it('un backup vecchio senza commesse si apre lo stesso', () => {
    const a = app();
    a.ref('Store').importSnapshot({ items: [{ id: 'x', code: 'X', name: 'X', type: 'materiale' }] });
    assert.deepEqual(a.snapshot().jobs, []);
  });
});

// ─── D9: il giorno di un documento è quello del calendario sul muro ───
// Richieste, ordini, ODL, piani e ODP nascevano con `nowISO().slice(0, 10)`,
// cioè il giorno **UTC**: in Italia, fra mezzanotte e l'una (le due d'estate),
// era quello di ieri — mentre il numero del documento, che prende l'anno
// locale, era già dell'anno nuovo. «RFQ-2027-001» datata 31/12/2026.
describe('Il giorno di un documento nuovo è quello locale', () => {
  const { loadApp } = require('./harness.js');
  const { makeDb } = require('./fixtures.js');
  function allOra(isoUtc, tz) {
    const prima = process.env.TZ;
    process.env.TZ = tz;
    const a = loadApp({ silent: true });
    a.setDb(makeDb({}));
    a.asRole('admin');
    a.eval(`(() => { const V = Date; const fisso = V.parse(${JSON.stringify(isoUtc)});
      Date = class extends V { constructor(...x) { super(...(x.length ? x : [fisso])); } static now() { return fisso; } }; })()`);
    return { a, ripristina: () => { if (prima === undefined) delete process.env.TZ; else process.env.TZ = prima; } };
  }

  it('alle 00:30 di Capodanno a Roma la richiesta è del 1° gennaio, come il suo numero', () => {
    const { a, ripristina } = allOra('2026-12-31T23:30:00Z', 'Europe/Rome');
    try {
      a.eval('newRfq()');
      const r = JSON.parse(a.eval('JSON.stringify(db.rfqs[0])'));
      assert.equal(r.date, '2027-01-01');
      assert.match(r.number, /^RFQ-2027-/);
    } finally { ripristina(); }
  });

  it('vale per ordini, ordini di lavoro e piani', () => {
    const { a, ripristina } = allOra('2026-07-14T22:30:00Z', 'Europe/Rome');   // 00:30 del 15, ora legale
    try {
      a.eval('newPlan(); newOrder(); newOdl();');
      assert.equal(a.eval('db.plans[0].date'), '2026-07-15');
      assert.equal(a.eval('db.orders[0].date'), '2026-07-15');
      assert.equal(a.eval('db.workOrders[0].date'), '2026-07-15');
    } finally { ripristina(); }
  });
});
