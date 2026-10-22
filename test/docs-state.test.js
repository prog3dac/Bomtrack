// Documenti: stati, ricevimenti e blocchi.
//
// È il buco di copertura più costoso del repo (C3 in docs/analisi-tecnica.md):
// `views-docs.js` è il file più lungo e il più duplicato, e finché queste tre
// cose non erano fissate per iscritto la deduplica RFQ/ODA era un refactor
// senza rete. Qui si scrive **cosa deve continuare a succedere**, non come è
// scritto oggi: sono i test che devono sopravvivere alla riscrittura del file.
//
// Le tre regole:
// 1. lo stato di un documento è in parte **derivato** — «ricevuto tutto» e
//    «offerta tornata» sono fatti misurabili, non scelte da ricordarsi;
// 2. il **blocco** cambia con lo stato e protegge i dati contrattuali, mai le
//    note e mai i ricevimenti;
// 3. la **numerazione** è progressiva per anno e per tipo.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq, mat } = require('./fixtures.js');

function base(over) {
  return makeDb(Object.assign({
    suppliers: [{ id: 's1', name: 'SKF', active: true }, { id: 's2', name: 'Bianchi', active: true }],
    items: [Object.assign(acq('c1', 5), {
      priceList: [{ id: 'p1', supplierId: 's1', price: 5, date: '2026-01-01' }],
      activePriceId: 'p1', supplierId: 's1',
    })],
  }, over || {}));
}
function app(db, role) {
  const a = loadApp({ silent: true });
  a.setDb(db || base());
  a.asRole(role || 'admin');
  return a;
}
// Un ordine con una riga sola, nello stato richiesto.
function conOrdine(a, status, qty, received) {
  a.eval(`Store.insert('orders', { id: 'o1', number: 'ODA-2026-001', title: 'prova', date: '2026-02-01',
    status: ${JSON.stringify(status)}, supplierId: 's1', supplierConfirmation: '', notes: '', notesInternal: '',
    lines: [{ id: 'ol1', itemId: 'c1', code: 'C1', description: 'Commerciale c1', uom: 'pz',
      qty: ${qty}, price: 5, deliveryDate: '2026-03-01', received: ${received || 0}, note: '' }], active: true });`);
  return a;
}
function conRfq(a, status, prezzi) {
  const lines = prezzi.map((p, i) => `{ id: 'rl${i}', itemId: 'c1', code: 'C1', description: 'Commerciale c1',
    uom: 'pz', qty: 10, price: ${p === null ? "''" : p}, deliveryDate: '', note: '' }`).join(',');
  a.eval(`Store.insert('rfqs', { id: 'r1', number: 'RDO-2026-001', title: 'prova', date: '2026-02-01',
    status: ${JSON.stringify(status)}, supplierId: 's1', notes: '', notesInternal: '', lines: [${lines}], active: true });`);
  return a;
}
const ordine = a => JSON.parse(a.eval('JSON.stringify(getOrder("o1"))'));
const rfq = a => JSON.parse(a.eval('JSON.stringify(getRfq("r1"))'));

describe('Ordine: lo stato segue i ricevimenti, non la memoria di chi registra', () => {
  it('ricevuto in parte → Parziale', () => {
    const a = conOrdine(app(), 'inviato', 10, 0);
    a.eval('ordSetLine("o1", "ol1", "received", "4")');
    assert.equal(ordine(a).status, 'parziale');
  });

  it('ricevuto tutto → Evaso', () => {
    const a = conOrdine(app(), 'inviato', 10, 4);
    a.eval('ordSetLine("o1", "ol1", "received", "10")');
    assert.equal(ordine(a).status, 'evaso');
  });

  it('azzerando i ricevimenti si torna indietro, non si resta evasi', () => {
    const a = conOrdine(app(), 'evaso', 10, 10);
    a.eval('ordSetLine("o1", "ol1", "received", "0")');
    assert.equal(ordine(a).status, 'inviato', 'senza conferma del fornitore');
  });

  it('con la conferma del fornitore il ritorno indietro è a Confermato', () => {
    const a = conOrdine(app(), 'evaso', 10, 10);
    a.eval('getOrder("o1").supplierConfirmation = "CONF-99"');
    a.eval('ordSetLine("o1", "ol1", "received", "0")');
    assert.equal(ordine(a).status, 'confermato');
  });

  it('non si può ricevere più di quanto ordinato', () => {
    const a = conOrdine(app(), 'inviato', 10, 0);
    a.eval('ordSetLine("o1", "ol1", "received", "999")');
    const o = ordine(a);
    assert.equal(o.lines[0].received, 10, 'si tronca alla quantità ordinata');
    assert.equal(o.status, 'evaso');
  });

  it('la quantità di un ordine evaso è protetta: cambiarla richiede lo sblocco', () => {
    const a = conOrdine(app(), 'evaso', 10, 10);
    a.eval('ordSetLine("o1", "ol1", "qty", "20")');
    assert.equal(ordine(a).lines[0].qty, 10, 'è un dato contrattuale, l\'ordine è già uscito');
    assert.equal(ordine(a).status, 'evaso');
  });

  it('sbloccato, alzare la quantità riapre l\'ordine evaso', () => {
    const a = conOrdine(app(), 'evaso', 10, 10);
    a.eval('orderUnlockedId = "o1"');
    a.eval('ordSetLine("o1", "ol1", "qty", "20")');
    assert.equal(ordine(a).status, 'parziale', 'la soglia di evasione si è spostata');
  });

  it('«ricevi tutto» chiude l\'ordine in un gesto', () => {
    const a = conOrdine(app(), 'inviato', 7, 0);
    a.eval('ordMarkAllReceived("o1")');
    const o = ordine(a);
    assert.equal(o.lines[0].received, 7);
    assert.equal(o.status, 'evaso');
  });

  it('le righe di un ordine uscito non si cancellano senza sbloccarlo', () => {
    const a = conOrdine(app(), 'evaso', 10, 10);
    a.eval('ordDelLine("o1", "ol1")');
    assert.equal(ordine(a).lines.length, 1);
  });

  it('cancellare l\'ultima riga non lascia l\'ordine evaso a vuoto', () => {
    const a = conOrdine(app(), 'evaso', 10, 10);
    a.eval('orderUnlockedId = "o1"');
    a.eval('ordDelLine("o1", "ol1")');
    const o = ordine(a);
    assert.equal(o.lines.length, 0);
    assert.equal(o.status, 'inviato', 'senza righe non c\'è niente di ricevuto');
  });

  it('bozza e annullato restano decisioni di chi scrive: non si derivano', () => {
    ['bozza', 'annullato'].forEach(st => {
      const a = conOrdine(app(), st, 10, 10);
      a.eval('ordAutoStatus(getOrder("o1"))');
      assert.equal(ordine(a).status, st);
    });
  });

  it('il numero di conferma porta l\'ordine da Inviato a Confermato', () => {
    const a = conOrdine(app(), 'inviato', 10, 0);
    a.eval('ordSetField("o1", "supplierConfirmation", "CONF-1")');
    assert.equal(ordine(a).status, 'confermato');
  });
});

describe('Richiesta: l\'offerta tornata è un fatto, non una spunta', () => {
  it('tutte le righe con prezzo → Offerta ricevuta', () => {
    const a = conRfq(app(), 'inviata', [null, null]);
    a.eval('rfqSetLine("r1", "rl0", "price", "3")');
    assert.equal(rfq(a).status, 'inviata', 'una riga sola non basta');
    a.eval('rfqSetLine("r1", "rl1", "price", "4")');
    assert.equal(rfq(a).status, 'ricevuta');
  });

  it('togliere un prezzo riporta la richiesta a Inviata', () => {
    const a = conRfq(app(), 'ricevuta', [3, 4]);
    a.eval('rfqSetLine("r1", "rl0", "price", "")');
    assert.equal(rfq(a).status, 'inviata');
  });

  it('una bozza non diventa «ricevuta» solo perché ha i prezzi', () => {
    const a = conRfq(app(), 'bozza', [3, 4]);
    a.eval('rfqAutoStatus(getRfq("r1"))');
    assert.equal(rfq(a).status, 'bozza', 'non è mai uscita: non può essere tornata');
  });

  it('una richiesta senza righe non è un\'offerta ricevuta', () => {
    const a = conRfq(app(), 'inviata', []);
    a.eval('rfqAutoStatus(getRfq("r1"))');
    assert.equal(rfq(a).status, 'inviata');
  });
});

describe('Blocchi: cosa si può ancora toccare, e quando', () => {
  it('a richiesta inviata il contratto è chiuso ma il prezzo si compila', () => {
    const a = conRfq(app(), 'inviata', [null]);
    assert.equal(a.eval('rfqMode(getRfq("r1"))'), 'offer');
    a.eval('rfqSetLine("r1", "rl0", "qty", "999")');
    assert.equal(rfq(a).lines[0].qty, 10, 'la quantità è un dato contrattuale');
    a.eval('rfqSetLine("r1", "rl0", "price", "7")');
    assert.equal(rfq(a).lines[0].price, 7, 'il prezzo è la risposta che si aspettava');
  });

  it('a richiesta chiusa non si tocca più niente, tranne note e stato', () => {
    const a = conRfq(app(), 'chiusa', [3]);
    assert.equal(a.eval('rfqMode(getRfq("r1"))'), 'none');
    a.eval('rfqSetLine("r1", "rl0", "price", "99")');
    assert.equal(rfq(a).lines[0].price, 3);
    a.eval('rfqSetField("r1", "notes", "arrivata via mail")');
    assert.equal(rfq(a).notes, 'arrivata via mail', 'le note restano sempre aperte');
  });

  it('a ordine inviato il contratto è chiuso ma i ricevimenti no', () => {
    const a = conOrdine(app(), 'inviato', 10, 0);
    assert.equal(a.eval('ordMode(getOrder("o1"))'), 'reception');
    a.eval('ordSetLine("o1", "ol1", "price", "99")');
    assert.equal(ordine(a).lines[0].price, 5, 'il prezzo è concordato');
    a.eval('ordSetLine("o1", "ol1", "received", "3")');
    assert.equal(ordine(a).lines[0].received, 3);
  });

  it('la data confermata dal fornitore si registra a ordine già inviato', () => {
    // Arriva dopo l'invio per definizione: se fosse un dato contrattuale non
    // ci sarebbe modo di scriverla.
    const a = conOrdine(app(), 'confermato', 10, 0);
    a.eval('ordSetLine("o1", "ol1", "confirmedDate", "2026-03-20")');
    assert.equal(ordine(a).lines[0].confirmedDate, '2026-03-20');
    assert.equal(a.eval('orderWorstDelay(getOrder("o1"))'), 14, 'chiesto domenica 1° marzo, confermato venerdì 20: 14 giorni lavorativi');
  });

  it('un ordine annullato è sola lettura, ricevimenti compresi', () => {
    const a = conOrdine(app(), 'annullato', 10, 0);
    assert.equal(a.eval('ordMode(getOrder("o1"))'), 'none');
    a.eval('ordSetLine("o1", "ol1", "received", "5")');
    assert.equal(ordine(a).lines[0].received, 0);
  });

  it('lo sblocco vale per un documento solo, e si perde tornando all\'elenco', () => {
    const a = conOrdine(app(), 'evaso', 10, 10);
    a.eval('orderUnlockedId = "o1"');
    assert.equal(a.eval('ordMode(getOrder("o1"))'), 'full');
    a.eval('ordSetLine("o1", "ol1", "price", "9")');
    assert.equal(ordine(a).lines[0].price, 9, 'sbloccato: si corregge davvero');
    a.eval('orderBackToList()');
    assert.equal(a.eval('orderUnlockedId'), null);
    assert.equal(a.eval('ordMode(getOrder("o1"))'), 'reception', 'si richiude da sé');
  });

  it('un lettore non passa nemmeno su un documento in bozza', () => {
    const a = conOrdine(app(base(), 'lettore'), 'bozza', 10, 0);
    a.asRole('lettore');
    a.eval('ordSetLine("o1", "ol1", "qty", "99")');
    assert.equal(ordine(a).lines[0].qty, 10, 'il ruolo viene prima del blocco di stato');
  });
});

describe('Numerazione: progressiva per anno e per tipo', () => {
  it('il primo documento dell\'anno parte da 001', () => {
    const a = app();
    const anno = new Date().getFullYear();
    assert.equal(a.eval('nextOrderNumber()'), `ODA-${anno}-001`);
    assert.equal(a.eval('nextRfqNumber()'), `RFQ-${anno}-001`);
  });

  it('i numeri di altri anni non spostano il progressivo di quest\'anno', () => {
    const a = app();
    a.eval(`Store.insert('orders', { id: 'vecchio', number: 'ODA-2019-042', status: 'evaso', lines: [], active: true });`);
    assert.equal(a.eval('nextOrderNumber()'), `ODA-${new Date().getFullYear()}-001`);
  });

  it('il progressivo riprende dal massimo, non dal conteggio', () => {
    const a = app();
    const anno = new Date().getFullYear();
    a.eval(`Store.insert('orders', { id: 'o7', number: 'ODA-${anno}-007', status: 'evaso', lines: [], active: true });`);
    assert.equal(a.eval('nextOrderNumber()'), `ODA-${anno}-008`, 'i buchi lasciati dalle eliminazioni non si riusano');
  });
});

describe('Una regola sola per i due tipi di documento (0.41.0)', () => {
  // Dopo la deduplica le due strade passano dalle stesse funzioni: questi
  // controlli verificano che il parametro `kind` scelga davvero il
  // comportamento giusto, ed è ciò che impedisce alle due copie di tornare.
  it('il registro conosce entrambi i tipi, e un tipo inventato non lancia', () => {
    const a = app();
    assert.equal(a.eval('docKind("order").coll'), 'orders');
    assert.equal(a.eval('docKind("rfq").coll'), 'rfqs');
    assert.equal(a.eval('docKind("inesistente").coll'), 'rfqs', 'ripiega sul primo invece di rompersi');
  });

  it('il prezzo di riga esiste sull\'ordine e non sulla richiesta', () => {
    const a = app();
    assert.equal(a.eval('docKind("order").hasLinePrice'), true);
    assert.equal(a.eval('docKind("rfq").hasLinePrice'), false, 'la richiesta è la domanda, non la risposta');
  });

  it('lo stesso campo è governato da blocchi diversi nei due documenti', () => {
    const a = app();
    assert.equal(a.eval('docKind("rfq").lineLock("price")'), 'offer', 'sulla richiesta il prezzo torna col preventivo');
    assert.equal(a.eval('docKind("order").lineLock("price")'), 'contract', 'sull\'ordine è concordato');
    assert.equal(a.eval('docKind("order").lineLock("received")'), 'reception');
  });

  it('docGuard blocca lo stesso su entrambi, e il messaggio si accorda', () => {
    const a = conOrdine(conRfq(app(), 'chiusa', [3]), 'annullato', 10, 0);
    assert.equal(a.eval('docGuard("rfq", "r1", "contract")'), false);
    assert.equal(a.eval('docGuard("order", "o1", "contract")'), false);
    assert.equal(a.eval('docGuard("order", "inesistente", "contract")'), false, 'un id che non esiste non passa');
  });

  it('l\'intestazione del documento salta le righe vuote', () => {
    const a = app();
    a.eval(`db.settings.company = { name: 'Acme', street: 'Via Roma', streetNumber: '1',
      zip: '41100', city: 'Modena', province: 'MO', country: 'Italia', vat: '123', email: '', phone: '' }`);
    const righe = JSON.parse(a.eval('JSON.stringify(docPartyLines(db.settings.company))'));
    assert.deepEqual(righe, ['Acme', 'Via Roma 1', '41100 Modena (MO)', 'Italia', 'P.IVA 123']);
    assert.ok(!righe.some(r => !r), 'un recapito mancante non lascia una riga bianca nel blocco');
  });

  it('sul documento stampato la partita IVA è bilingue', () => {
    const a = app();
    const it = JSON.parse(a.eval('JSON.stringify(docPartyLines({ name: "Acme", vat: "123" }))'));
    const en = JSON.parse(a.eval('JSON.stringify(docPartyLines({ name: "Acme", vat: "123" }, true))'));
    assert.deepEqual(it, ['Acme', 'P.IVA 123']);
    assert.deepEqual(en, ['Acme', 'P.IVA / VAT 123'], 'i documenti vanno anche a fornitori esteri');
  });

  it('un fornitore non ancora scelto non produce righe', () => {
    const a = app();
    assert.deepEqual(JSON.parse(a.eval('JSON.stringify(docPartyLines(null))')), []);
  });
});

describe('Dalla richiesta all\'ordine', () => {
  it('l\'ordine eredita fornitore, condizioni e righe, e azzera i ricevimenti', () => {
    const a = conRfq(app(), 'ricevuta', [3]);
    a.eval('getRfq("r1").transport = "Porto franco"; getRfq("r1").payment = "Bonifico 30gg";');
    a.eval('orderFromRfq("r1")');
    const o = JSON.parse(a.eval('JSON.stringify(db.orders[0])'));
    assert.equal(o.supplierId, 's1');
    assert.equal(o.transport, 'Porto franco');
    assert.equal(o.payment, 'Bonifico 30gg');
    assert.equal(o.rfqId, 'r1', 'la tracciabilità richiesta → ordine resta');
    assert.equal(o.status, 'bozza', 'nasce da rileggere, non da spedire');
    assert.equal(o.lines.length, 1);
    assert.equal(o.lines[0].price, 3, 'il prezzo offerto diventa il prezzo d\'ordine');
    assert.equal(o.lines[0].received, 0);
    assert.notEqual(o.lines[0].id, 'rl0', 'le righe sono nuove: due documenti distinti');
  });

  it('generando l\'ordine la richiesta uscita si chiude da sé', () => {
    const a = conRfq(app(), 'ricevuta', [3]);
    a.eval('orderFromRfq("r1")');
    assert.equal(rfq(a).status, 'chiusa');
  });

  // 0.105.5: ogni clic su «Crea ordine» ne creava uno nuovo.
  it('un secondo ordine dalla stessa richiesta si chiede prima di crearlo', () => {
    const a = conRfq(app(), 'ricevuta', [3]);
    a.eval('orderFromRfq("r1")');
    a.eval('orderFromRfq("r1")');
    assert.equal(a.eval('db.orders.length'), 1, 'senza conferma non nasce');
    a.eval('confirmYes()');
    assert.equal(a.eval('db.orders.length'), 2, 'confermato sì');
  });

  it('un ordine creato mentre si aspettavano i numeri ferma il secondo', () => {
    const a = conRfq(app(), 'ricevuta', [3]);
    a.eval('globalThis.__attesa = []; conNumeri = (n, fn) => { __attesa.push(fn); };');
    a.eval('orderFromRfq("r1"); orderFromRfq("r1")');
    a.eval('__attesa.forEach(fn => fn())');
    assert.equal(a.eval('db.orders.length'), 1);
  });

  it('da una bozza si può generare un ordine di prova senza chiuderla', () => {
    const a = conRfq(app(), 'bozza', [3]);
    a.eval('orderFromRfq("r1")');
    assert.equal(rfq(a).status, 'bozza', 'non era uscita: non c\'è niente da chiudere');
  });
});

// ─── lineLotWarn: l'avviso di lotto su una riga di RFQ/Ordine ───
describe('lineLotWarn — la riga rispetta il lotto d\'acquisto?', () => {
  function dbLot() {
    return makeDb({
      items: [
        Object.assign(mat('barra', 120), { uom: 'mt', lotSize: 6 }),
        Object.assign(mat('viti', 1), { uom: 'pz', lotSize: 50, lotMode: 'min' }),
        Object.assign(mat('peso', 100), { uom: 'mt', lotSize: 6, altUom: 'kg', altFactor: 100 }),
      ],
    });
  }
  function warn(a, line) { return a.eval(`lineLotWarn(${JSON.stringify(line)})`); }
  function app() { const a = loadApp({ silent: true }); a.setDb(dbLot()); a.asRole('admin'); return a; }

  it('multiplo esatto (default): quantità non multipla del lotto avvisa', () => {
    const a = app();
    assert.match(warn(a, { itemId: 'barra', qty: 13, uom: 'mt' }), /lotto/);
  });
  it('multiplo esatto: quantità già multipla non avvisa', () => {
    const a = app();
    assert.equal(warn(a, { itemId: 'barra', qty: 12, uom: 'mt' }), '');
  });
  it('riga manuale (senza itemId): nessun avviso, non c\'è un articolo da cui prendere il lotto', () => {
    const a = app();
    assert.equal(warn(a, { itemId: null, qty: 13, uom: 'mt' }), '');
  });
  it('lotto minimo: sotto soglia avvisa', () => {
    const a = app();
    assert.match(warn(a, { itemId: 'viti', qty: 30, uom: 'pz' }), /minimo/);
  });
  it('lotto minimo: sopra soglia nessun vincolo di multiplo, nessun avviso', () => {
    const a = app();
    assert.equal(warn(a, { itemId: 'viti', qty: 55, uom: 'pz' }), '');
  });
  it('riga in unità alternativa: la quantità si converte in unità di gestione prima del controllo', () => {
    const a = app();
    // 1300 kg / (100 kg per mt) = 13 mt di gestione → non multiplo di 6
    assert.match(warn(a, { itemId: 'peso', qty: 1300, uom: 'kg' }), /lotto/);
    // 1200 kg = 12 mt → multiplo, nessun avviso
    assert.equal(warn(a, { itemId: 'peso', qty: 1200, uom: 'kg' }), '');
  });
});

// ─── docLineFromItem / ordLineListinoWarn: la riga parla sempre l'unità dell'articolo ───
describe('Una riga da catalogo nasce nell\'unità dell\'articolo, mai in quella del listino', () => {
  function dbBarra() {
    return makeDb({
      suppliers: [{ id: 's1', name: 'Rossi Acciai', active: true }],
      items: [Object.assign(mat('bar', 0), {
        code: 'BAR', uom: 'm', altUom: 'kg', altFactor: 8,
        priceList: [{ id: 'pr1', supplierId: 's1', price: 2, date: '2026-01-01', priceUom: 'kg' }],
        activePriceId: 'pr1', unitCost: 16,
      })],
    });
  }
  function app() { const a = loadApp({ silent: true }); a.setDb(dbBarra()); a.asRole('admin'); return a; }

  it('docLineFromItem: unità dell\'articolo, prezzo convertito — non il grezzo del listino', () => {
    const a = app();
    const l = JSON.parse(a.eval(`JSON.stringify(docLineFromItem(getItem("bar"), "s1"))`));
    assert.equal(l.uom, 'm', 'mai "kg": si ordina e si riceve in metri, come in distinta e a magazzino');
    assert.equal(l.price, 16, '2 €/kg × 8 kg/m, non 2');
  });

  it('senza quotazione di quel fornitore la riga nasce senza prezzo, ma sempre in unità dell\'articolo', () => {
    const a = app();
    const l = JSON.parse(a.eval(`JSON.stringify(docLineFromItem(getItem("bar"), "s-altro"))`));
    assert.equal(l.uom, 'm');
    assert.equal(l.price, '');
  });

  it('ordLineListinoWarn: nessun avviso quando il prezzo di riga è il costo convertito corretto', () => {
    const a = app();
    a.eval(`Store.insert('orders', { id: 'o1', number: 'ODA-1', status: 'bozza', supplierId: 's1',
      notes: '', notesInternal: '', active: true, date: '2026-02-01',
      lines: [{ id: 'ol1', itemId: 'bar', code: 'BAR', description: 'Barra', uom: 'm', qty: 5, price: 16, deliveryDate: '', note: '' }] });`);
    const warn = a.eval(`ordLineListinoWarn(getOrder("o1"), getOrder("o1").lines[0])`);
    assert.equal(warn, '');
  });

  it('ordLineListinoWarn: avvisa se il prezzo di riga non è quello convertito, non per differenza di unità', () => {
    const a = app();
    a.eval(`Store.insert('orders', { id: 'o1', number: 'ODA-1', status: 'bozza', supplierId: 's1',
      notes: '', notesInternal: '', active: true, date: '2026-02-01',
      lines: [{ id: 'ol1', itemId: 'bar', code: 'BAR', description: 'Barra', uom: 'm', qty: 5, price: 10, deliveryDate: '', note: '' }] });`);
    const warn = a.eval(`ordLineListinoWarn(getOrder("o1"), getOrder("o1").lines[0])`);
    assert.match(warn, /16/, 'il costo convertito (16/m), non il prezzo grezzo (2/kg), deve comparire nell\'avviso');
  });
});

// 0.105.5: lo stato automatico riscriveva quello scelto a mano a ogni modifica.
describe('Uno stato scelto a mano', () => {
  it('una nota o una data confermata non lo cambiano', () => {
    const a = conRfq(app(), 'ricevuta', [3]);
    a.eval('orderFromRfq("r1")');
    const id = a.eval('db.orders[0].id'), riga = a.eval('db.orders[0].lines[0].id');
    a.eval(`getOrder('${id}').status = 'evaso'`);   // chiuso corto, a mano
    a.eval(`docSetLine('order', '${id}', '${riga}', 'note', 'il resto non arriva')`);
    a.eval(`docSetLine('order', '${id}', '${riga}', 'confirmedDate', '2026-11-02')`);
    assert.equal(a.eval(`getOrder('${id}').status`), 'evaso');
  });
  it('«Confermato» resta anche senza il numero di conferma', () => {
    const a = conRfq(app(), 'ricevuta', [3]);
    a.eval('orderFromRfq("r1")');
    const id = a.eval('db.orders[0].id');
    a.eval(`getOrder('${id}').status = 'confermato'; ordAutoStatus(getOrder('${id}'))`);
    assert.equal(a.eval(`getOrder('${id}').status`), 'confermato');
  });
});
