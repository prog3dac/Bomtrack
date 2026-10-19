// Blocco UX: conferme in scheda, ricerca globale, autore delle modifiche.
// La conferma è il punto delicato: prima era bloccante e il codice dopo la
// domanda non partiva mai senza un "sì". Ora è una callback — se qualcuno la
// dimentica, la cancellazione avviene senza chiedere. Questi test verificano
// proprio quello: senza conferma non deve succedere niente.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm, comp } = require('./fixtures.js');

function conDb(dbObj, role) {
  const app = loadApp({ silent: true });
  app.setDb(dbObj);
  app.asRole(role || 'admin');
  return app;
}

describe('askConfirm — la domanda è una scheda, non un blocco', () => {
  it('il seguito parte solo alla conferma', () => {
    const app = loadApp({ silent: true });
    app.eval('window.__fatto = 0');
    app.eval('askConfirm("Sicuro?", () => { window.__fatto++; })');
    assert.equal(app.eval('window.__fatto'), 0, 'non deve agire prima della risposta');
    app.eval('confirmYes()');
    assert.equal(app.eval('window.__fatto'), 1);
  });

  it('annullando non succede nulla, nemmeno dopo', () => {
    const app = loadApp({ silent: true });
    app.eval('window.__fatto = 0');
    app.eval('askConfirm("Sicuro?", () => { window.__fatto++; })');
    app.eval('confirmNo()');
    app.eval('confirmYes()');   // un secondo sì non deve resuscitare l'azione annullata
    assert.equal(app.eval('window.__fatto'), 0);
  });

  it('due domande di fila: vale l\'ultima', () => {
    const app = loadApp({ silent: true });
    app.eval('window.__chi = ""');
    app.eval('askConfirm("A", () => { window.__chi = "A"; })');
    app.eval('askConfirm("B", () => { window.__chi = "B"; })');
    app.eval('confirmYes()');
    assert.equal(app.eval('window.__chi'), 'B');
  });

  it('la scheda di conferma ha una chiave sua: non chiude i form aperti', () => {
    const app = loadApp({ silent: true });
    app.eval('openModal("<h3>form</h3>", false)');
    app.eval('askConfirm("Sicuro?", () => {})');
    assert.equal(app.eval('document.getElementById("modal-root").children.length'), 2);
  });
});

describe('Cancellazioni: niente sparisce senza un sì', () => {
  function dbPieno() {
    return makeDb({
      plans: [{ id: 'pl1', number: 'FAB-2026-001', title: 'Lotto', date: '2026-07-01', lines: [] }],
      items: [mat('m', 1), asm('mac', 'macchina', { components: [] })],
    });
  }
  it('un articolo resta finché non si conferma', () => {
    const app = conDb(dbPieno());
    app.eval('delItem("m")');
    assert.equal(app.snapshot().items.length, 2, 'la domanda non deve già cancellare');
    app.eval('confirmYes()');
    assert.deepEqual(app.snapshot().items.map(i => i.id), ['mac']);
  });

  it('un piano resta se si annulla', () => {
    const app = conDb(dbPieno());
    app.eval('delPlan("pl1")');
    app.eval('confirmNo()');
    assert.equal(app.snapshot().plans.length, 1);
  });

  it('il componente di una distinta si toglie solo dopo il sì', () => {
    const app = conDb(makeDb({ items: [
      acq('v', 1), asm('mac', 'macchina', { components: [comp('v', 2)] }),
    ] }));
    app.eval('currentBomId = "mac"');
    app.eval('delComponent(0)');
    assert.equal(app.snapshot().items.find(i => i.id === 'mac').components.length, 1);
    app.eval('confirmYes()');
    assert.equal(app.snapshot().items.find(i => i.id === 'mac').components.length, 0);
  });

  it('il ruolo lettore non arriva nemmeno alla domanda', () => {
    const app = conDb(dbPieno(), 'lettore');
    app.eval('delItem("m")');
    app.eval('confirmYes()');
    assert.equal(app.snapshot().items.length, 2);
  });
});

describe('Ricerca globale', () => {
  function dbRicerca() {
    return makeDb({
      suppliers: [{ id: 's1', name: 'Alfa', active: true }],
      plans: [{ id: 'pl1', number: 'FAB-2026-001', title: 'Lotto settembre', lines: [] }],
      rfqs: [{ id: 'r1', number: 'RFQ-2026-004', title: 'Cuscinetti', supplierId: 's1', lines: [] }],
      orders: [{ id: 'o1', number: 'ODA-2026-002', title: 'Viteria', supplierId: null, lines: [] }],
      items: [
        Object.assign(acq('cus', 2), { code: 'CMM-100', name: 'Cuscinetto 6204' }),
        Object.assign(mat('lam', 3), { code: 'MAT-200', name: 'Lamiera S235' }),
        Object.assign(asm('mac', 'macchina'), { code: 'MAC-001', name: 'Trancia' }),
      ],
    });
  }
  const cerca = (app, q) => JSON.parse(app.eval(`JSON.stringify(globalSearchHits(${JSON.stringify(q)}).map(h => h.kind + ':' + h.code))`));

  it('trova articoli per codice e per nome', () => {
    const app = conDb(dbRicerca());
    assert.deepEqual(cerca(app, 'CMM-100'), ['item:CMM-100']);
    assert.deepEqual(cerca(app, 'lamiera'), ['item:MAT-200']);
  });

  it('trova richieste, ordini e piani per numero e titolo', () => {
    const app = conDb(dbRicerca());
    assert.deepEqual(cerca(app, 'RFQ-2026-004'), ['rfq:RFQ-2026-004']);
    assert.deepEqual(cerca(app, 'viteria'), ['order:ODA-2026-002']);
    assert.deepEqual(cerca(app, 'settembre'), ['plan:FAB-2026-001']);
  });

  it('una parola comune pesca in tutti i tipi insieme', () => {
    const app = conDb(dbRicerca());
    const r = cerca(app, 'cusc');
    assert.deepEqual(r.sort(), ['item:CMM-100', 'rfq:RFQ-2026-004']);
  });

  it('chi sta scrivendo un codice lo trova per primo', () => {
    const app = conDb(makeDb({ items: [
      Object.assign(acq('a', 1), { code: 'ZZZ-999', name: 'Vite MAT-2 speciale' }),
      Object.assign(mat('b', 1), { code: 'MAT-200', name: 'Lamiera' }),
    ] }));
    assert.deepEqual(cerca(app, 'mat-2'), ['item:MAT-200', 'item:ZZZ-999']);
  });

  it('ricerca vuota: nessun risultato, nessun errore', () => {
    const app = conDb(dbRicerca());
    assert.deepEqual(cerca(app, ''), []);
    assert.deepEqual(cerca(app, '   '), []);
  });

  it('l\'elenco è tagliato: non si disegnano mille righe', () => {
    const items = [];
    for (let i = 0; i < 60; i++) items.push(Object.assign(acq('x' + i, 1), { code: 'CMM-' + i, name: 'Pezzo' }));
    const app = conDb(makeDb({ items }));
    assert.equal(cerca(app, 'cmm').length, 25);
  });

  it('un database vuoto non fa esplodere la ricerca', () => {
    const app = conDb(makeDb({ items: [] }));
    assert.deepEqual(cerca(app, 'qualsiasi'), []);
  });
});

describe('Autore e data delle modifiche', () => {
  const dbUtenti = () => makeDb({
    users: [{ id: 'u1', name: 'Andrea', email: 'a@a.it', role: 'admin', active: true }],
    items: [Object.assign(mat('m', 1), {
      createdAt: '2026-07-01T09:30:00.000Z', createdBy: 'u1',
      updatedAt: '2026-07-20T15:45:00.000Z', updatedBy: 'u9',
    })],
  });

  it('risolve il nome dell\'utente, anche quando non c\'è più', () => {
    const app = conDb(dbUtenti());
    assert.equal(app.eval('actorName("u1")'), 'Andrea');
    assert.equal(app.eval('actorName("u9")'), 'utente rimosso');
    assert.equal(app.eval('actorName(null)'), '');
  });

  it('la riga mostra creazione e aggiornamento', () => {
    const app = conDb(dbUtenti());
    const h = app.eval('stampLine(getItem("m"))');
    assert.ok(h.includes('Andrea'), 'manca l\'autore');
    assert.ok(h.includes('utente rimosso'), 'manca chi ha aggiornato');
    assert.ok(h.includes('01/07/2026') && h.includes('20/07/2026'));
  });

  it('senza aggiornamenti non ripete la stessa data due volte', () => {
    const app = conDb(makeDb({ items: [Object.assign(mat('m', 1), {
      createdAt: '2026-07-01T09:30:00.000Z', updatedAt: '2026-07-01T09:30:00.000Z' })] }));
    const h = app.eval('stampLine(getItem("m"))');
    assert.ok(h.includes('Creato'));
    assert.ok(!h.includes('aggiornato'));
  });

  it('record senza timestamp: nessuna riga da mostrare', () => {
    const app = conDb(makeDb({ items: [mat('m', 1)] }));
    assert.equal(app.eval('stampLine(getItem("m"))'), '');
    assert.equal(app.eval('stampLine(null)'), '');
  });
});

describe('Stampa', () => {
  it('il sottotitolo segue la vista aperta', () => {
    const app = conDb(makeDb({
      plans: [{ id: 'pl1', number: 'FAB-2026-001', title: 'Lotto', lines: [] }],
      items: [Object.assign(asm('mac', 'macchina'), { code: 'MAC-001', name: 'Trancia' }),
        Object.assign(parte('p'), { code: 'PRT-1', name: 'Flangia' })],
    }));
    app.eval('activeView = "bom"; currentBomId = "mac"');
    assert.equal(app.eval('printSubtitle()'), 'MAC-001 — Trancia');
    app.eval('activeView = "cycles"; currentCycleItemId = "p"');
    assert.equal(app.eval('printSubtitle()'), 'PRT-1 — Flangia');
    app.eval('activeView = "mrp"; currentPlanId = "pl1"');
    assert.equal(app.eval('printSubtitle()'), 'FAB-2026-001 Lotto');
    app.eval('activeView = "buy"');
    assert.equal(app.eval('printSubtitle()'), '');
  });

  it('senza nulla di aperto non lancia', () => {
    const app = conDb(makeDb({ items: [] }));
    app.eval('activeView = "bom"; currentBomId = null');
    assert.equal(app.eval('printSubtitle()'), '');
    app.eval('printHeadFill()');   // non deve lanciare
  });
});

describe('Errori non previsti: il registro', () => {
  it('conserva messaggio, vista e revisione dell\'app', () => {
    const app = conDb(makeDb({ items: [] }));
    app.eval('activeView = "mrp"');
    app.eval('logAppError("errore", "qualcosa è esploso", new Error("boom"))');
    const log = app.eval('JSON.stringify(appErrorLog())');
    const r = JSON.parse(log)[0];
    assert.equal(r.msg, 'qualcosa è esploso');
    assert.equal(r.view, 'mrp', 'sapere dove è successo è metà della segnalazione');
    assert.equal(r.version, app.eval('APP_VERSION'));
    assert.ok(r.ts, 'senza data non si ricostruisce la sequenza');
  });

  it('tiene gli ultimi N e butta i più vecchi', () => {
    const app = conDb(makeDb({ items: [] }));
    const max = app.eval('ERROR_LOG_MAX');
    app.eval(`for (let i = 0; i < ${max + 5}; i++) logAppError('errore', 'e' + i, null);`);
    const log = JSON.parse(app.eval('JSON.stringify(appErrorLog())'));
    assert.equal(log.length, max, 'un render che fallisce in ciclo non deve mangiarsi la memoria');
    assert.equal(log[0].msg, 'e5', 'restano i più recenti');
  });

  it('il registro esposto è una copia: chi lo legge non lo altera', () => {
    const app = conDb(makeDb({ items: [] }));
    app.eval('logAppError("errore", "uno", null)');
    app.eval('appErrorLog().push({ msg: "intruso" })');
    assert.equal(app.eval('appErrorLog().length'), 1);
  });

  it('onAppError non lancia mai a sua volta', () => {
    const app = conDb(makeDb({ items: [] }));
    assert.doesNotThrow(() => app.eval('onAppError("errore", "x", new Error("y"))'));
    assert.doesNotThrow(() => app.eval('onAppError("promessa", "", null)'),
      'un handler di errori che lancia lascerebbe l\'app muta proprio quando serve');
    assert.equal(app.eval('appErrorLog().length'), 2);
  });
});

describe('Ricerca globale: commesse, fornitori, clienti e Invio subito (dalla 0.105.6)', () => {
  const dbParti = () => makeDb({
    suppliers: [{ id: 's1', name: 'SKF Italia', active: true }, { id: 's2', name: 'Beta lavorazioni', active: true }],
    customers: [{ id: 'c1', name: 'Rossi Macchine', active: true }],
    jobs: [{ id: 'j1', number: 'COM-2026-007', customer: 'Rossi Macchine', title: 'Linea di taglio', status: 'aperta', active: true }],
    rfqs: [{ id: 'r1', number: 'RDO-2026-001', title: '', supplierId: 's1', lines: [] }],
    orders: [{ id: 'o1', number: 'ODA-2026-001', title: '', supplierId: 's1', lines: [] }],
    workOrders: [{ id: 'w1', number: 'ODL-2026-001', title: '', supplierId: 's2', lines: [] }],
    items: [],
  });
  const cerca = (app, q) => JSON.parse(app.eval(`JSON.stringify(globalSearchHits(${JSON.stringify(q)}).map(h => h.kind + ':' + h.code))`));

  it('trova le commesse per numero, titolo e cliente', () => {
    const app = conDb(dbParti());
    assert.deepEqual(cerca(app, 'COM-2026-007'), ['job:COM-2026-007']);
    assert.deepEqual(cerca(app, 'taglio'), ['job:COM-2026-007']);
    assert.deepEqual(cerca(app, 'rossi'), ['job:COM-2026-007']);
  });

  it('il nome del fornitore trova le sue richieste, i suoi ordini e i suoi ODL', () => {
    const app = conDb(dbParti());
    assert.deepEqual(cerca(app, 'skf').sort(), ['order:ODA-2026-001', 'rfq:RDO-2026-001']);
    assert.deepEqual(cerca(app, 'beta'), ['odl:ODL-2026-001']);
  });

  it('chi cerca un numero lo trova prima di chi ha solo il nome del fornitore in comune', () => {
    const app = conDb(makeDb({
      suppliers: [{ id: 's1', name: 'ODA-2026 Forniture', active: true }],
      orders: [{ id: 'o1', number: 'ODA-2026-009', title: '', supplierId: null, lines: [] },
        { id: 'o2', number: 'ODA-2025-001', title: '', supplierId: 's1', lines: [] }],
      items: [],
    }));
    assert.deepEqual(cerca(app, 'oda-2026'), ['order:ODA-2026-009', 'order:ODA-2025-001']);
  });

  it('una commessa si apre nel suo editor', () => {
    const app = conDb(dbParti());
    app.eval('gsHits = globalSearchHits("COM-2026-007"); globalSearchOpen(0)');
    assert.equal(app.eval('activeView'), 'jobs');
    assert.equal(app.eval('currentJobId'), 'j1');
  });

  it('Invio subito dopo l\'ultimo tasto apre il risultato di quel che è scritto, non del ritaglio di prima', () => {
    // Un lettore di codici a barre scrive il codice e preme Invio in pochi
    // millisecondi: la ricerca ritardata non ha ancora rifatto l'elenco.
    const app = conDb(makeDb({
      orders: [{ id: 'o2', number: 'ODA-2026-012', title: '', status: 'bozza', supplierId: null, lines: [] },
        { id: 'o3', number: 'ODA-2026-0123', title: '', status: 'bozza', supplierId: null, lines: [] }],
      items: [],
    }));
    app.eval('globalSearchModal()');
    app.el('gs-input').value = 'ODA-2026-012';
    app.eval('renderGlobalSearch()');
    app.el('gs-input').value = 'ODA-2026-0123';   // l'ultimo tasto: il ridisegno è ancora in attesa
    app.eval('globalSearchKey({ key: "Enter", preventDefault() {} })');
    assert.equal(app.eval('currentOrderId'), 'o3');
  });
});
