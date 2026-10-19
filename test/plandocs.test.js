// Dal fabbisogno ai documenti: richieste di offerta e ordini generati da un piano.
// Il punto delicato è la differenza fra i due: una richiesta CHIEDE il prezzo e
// quindi nasce senza, un ordine LO PORTA. Se le due strade si confondessero, si
// manderebbe al fornitore un'offerta col prezzo già scritto dentro.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm, comp } = require('./fixtures.js');

// Piano: 2 macchine, ciascuna con una vite (fornitore Alfa) e un tondo (Beta),
// più una parte comprata da Alfa. Un commerciale senza fornitore né prezzo fa
// da caso limite: deve arrivare al documento come riga "da assegnare".
function conPiano(over) {
  const app = loadApp({ silent: true });
  app.asRole('admin');
  app.setDb(makeDb(Object.assign({
    suppliers: [
      { id: 's1', name: 'Alfa', defaultTransport: 'EXW', defaultPayment: 'Bonifico 30gg', active: true },
      { id: 's2', name: 'Beta', active: true },
    ],
    // Il listino è esplicito, come in un database vero: migrateDB() semina una
    // quotazione su ogni articolo che ha un fornitore o un prezzo, quindi la
    // forma «fornitore sull'articolo ma listino vuoto» non esiste sul campo. E
    // il listino è ciò da cui i documenti prendono il prezzo: un fixture senza
    // proverebbe una strada che nessun utente percorre.
    items: [
      Object.assign(acq('vite', 2), { supplierId: 's1', uom: 'pz',
        priceList: [{ id: 'q-vite', supplierId: 's1', price: 2, date: '2026-01-01' }], activePriceId: 'q-vite' }),
      Object.assign(mat('tondo', 5), { supplierId: 's2', uom: 'kg',
        priceList: [{ id: 'q-tondo', supplierId: 's2', price: 5, date: '2026-01-01' }], activePriceId: 'q-tondo' }),
      Object.assign(acq('orfano', 0), { uom: 'pz' }),
      parte('flangia', { sourcing: 'buy', unitCost: 30, supplierId: 's1',
        priceList: [{ id: 'q-fla', supplierId: 's1', price: 30, date: '2026-01-01' }], activePriceId: 'q-fla' }),
      asm('mac', 'macchina', { components: [comp('vite', 4), comp('tondo', 2), comp('orfano', 1), comp('flangia', 1)] }),
    ],
    plans: [{ id: 'pl1', number: 'FAB-2026-001', title: 'Lotto luglio', date: '2026-07-01', notes: '', lines: [{ id: 'l1', itemId: 'mac', qty: 2 }], active: true }],
    settings: { transportDefault: 'Porto franco', paymentDefault: 'RiBa 60gg' },
  }, over || {})));
  return app;
}
// Righe d'acquisto del piano, raggruppate, in oggetti del realm di Node
function gruppi(app) {
  return JSON.parse(app.eval(`JSON.stringify(mrpGroupBySupplier(mrpBuyRows(getPlan("pl1")))
    .map(g => ({ supplierId: g.supplierId, name: g.name, codes: g.rows.map(r => r.item.code), total: g.total })))`));
}
// Genera un documento per il fornitore indicato con tutte le sue righe
function genera(app, kind, supplierId) {
  return JSON.parse(app.eval(`(() => {
    const p = getPlan('pl1');
    const g = mrpGroupBySupplier(mrpBuyRows(p)).find(x => x.supplierId === ${JSON.stringify(supplierId)});
    const d = ${kind === 'rfq' ? 'planNewRfq' : 'planNewOrder'}(p, ${JSON.stringify(supplierId)}, g.rows);
    return JSON.stringify(d);
  })()`));
}

describe('il piano si raggruppa per fornitore, pronto per i documenti', () => {
  it('un gruppo per fornitore, e chi non ce l\'ha finisce in coda', () => {
    const g = gruppi(conPiano());
    assert.deepEqual(g.map(x => x.name), ['Alfa', 'Beta', 'Da assegnare']);
    assert.deepEqual(g[2].codes, ['ORFANO']);
  });

  it('la parte acquistata sta col suo fornitore, non fra le cose da fabbricare', () => {
    const g = gruppi(conPiano());
    assert.deepEqual(g[0].codes.sort(), ['FLANGIA', 'VITE']);
  });

  it('i totali seguono le quantità esplose', () => {
    const g = gruppi(conPiano());
    approx(g[0].total, 2 * 4 * 2 + 2 * 1 * 30, 'viti + flange');
    approx(g[1].total, 2 * 2 * 5);
  });
});

describe('planNewRfq — la richiesta chiede il prezzo', () => {
  it('nasce in bozza, intestata al fornitore e legata al piano', () => {
    const r = genera(conPiano(), 'rfq', 's1');
    assert.equal(r.status, 'bozza');
    assert.equal(r.supplierId, 's1');
    assert.equal(r.planId, 'pl1');
    assert.equal(r.rfqId, undefined, 'una richiesta non nasce da una richiesta');
    assert.match(r.number, /^RFQ-\d{4}-001$/);
  });

  it('le righe non portano prezzo: è quello che si sta chiedendo', () => {
    const r = genera(conPiano(), 'rfq', 's1');
    r.lines.forEach(l => assert.equal(l.price, '', l.code + ' non deve avere prezzo'));
  });

  it('codice, descrizione, U.M. e quantità arrivano dal fabbisogno', () => {
    const r = genera(conPiano(), 'rfq', 's1');
    const vite = r.lines.find(l => l.code === 'VITE');
    assert.equal(vite.itemId, 'vite');
    assert.equal(vite.description, 'Commerciale vite');
    assert.equal(vite.uom, 'pz');
    approx(vite.qty, 8);
  });

  it('trasporto e pagamento dal fornitore, con ripiego sui default d\'azienda', () => {
    const app = conPiano();
    const conAlfa = genera(app, 'rfq', 's1');
    assert.equal(conAlfa.transport, 'EXW');
    assert.equal(conAlfa.payment, 'Bonifico 30gg');
    const conBeta = genera(app, 'rfq', 's2');
    assert.equal(conBeta.transport, 'Porto franco', 'Beta non ha condizioni proprie');
    assert.equal(conBeta.payment, 'RiBa 60gg');
  });

  it('il gruppo senza fornitore produce un documento da intestare', () => {
    const r = genera(conPiano(), 'rfq', '');
    assert.equal(r.supplierId, null);
    assert.deepEqual(r.lines.map(l => l.code), ['ORFANO']);
  });
});

describe('planNewOrder — l\'ordine porta il prezzo', () => {
  it('le righe portano il listino del fornitore a cui l\'ordine è intestato', () => {
    const o = genera(conPiano(), 'order', 's1');
    approx(o.lines.find(l => l.code === 'VITE').price, 2);
    approx(o.lines.find(l => l.code === 'FLANGIA').price, 30, 'anche una parte acquistata');
  });
  // La forma «prezzo e fornitore sui campi dell'articolo, listino vuoto» è quella
  // dei database precedenti al listino. migrateDB() la converte in una quotazione,
  // ed è da lì che il documento prende il prezzo: senza questo passaggio un
  // database vecchio genererebbe ordini a prezzo vuoto.
  it('anche partendo da un database vecchio, migrato all\'avvio', () => {
    const app = loadApp({ silent: true });
    app.seedStorage(makeDb({
      suppliers: [{ id: 's1', name: 'Alfa', active: true }],
      items: [Object.assign(acq('vite', 2), { supplierId: 's1' }),
        asm('mac', 'macchina', { components: [comp('vite', 4)] })],
      plans: [{ id: 'pl1', number: 'FAB-1', lines: [{ id: 'l1', itemId: 'mac', qty: 2 }], active: true }],
    }));
    app.eval('Store.load(); invalidateCaches();');
    app.asRole('admin');
    const o = JSON.parse(app.eval(`(() => {
      const p = getPlan('pl1');
      const g = mrpGroupBySupplier(mrpBuyRows(p)).find(x => x.supplierId === 's1');
      return JSON.stringify(planNewOrder(p, 's1', g.rows));
    })()`));
    approx(o.lines[0].price, 2);
    approx(o.lines[0].qty, 8);
  });

  it('una riga senza prezzo resta vuota invece di valere zero', () => {
    const o = genera(conPiano(), 'order', '');
    assert.equal(o.lines[0].price, '', 'meglio un campo da compilare che uno zero credibile');
  });

  it('nasce in bozza, coi ricevimenti a zero e il legame al piano', () => {
    const o = genera(conPiano(), 'order', 's1');
    assert.equal(o.status, 'bozza');
    assert.equal(o.planId, 'pl1');
    assert.equal(o.rfqId, null, 'non viene da una richiesta');
    o.lines.forEach(l => assert.equal(l.received, 0));
    assert.match(o.number, /^ODA-\d{4}-001$/);
  });

  it('due ordini di seguito hanno numeri diversi', () => {
    const app = conPiano();
    const a = genera(app, 'order', 's1');
    const b = genera(app, 'order', 's2');
    assert.notEqual(a.number, b.number);
  });
});

describe('i documenti restano legati al piano che li ha generati', () => {
  it('planDocs elenca richieste e ordini nati dal piano', () => {
    const app = conPiano();
    genera(app, 'rfq', 's1');
    genera(app, 'order', 's2');
    const d = JSON.parse(app.eval(`(() => { const d = planDocs('pl1');
      return JSON.stringify({ rfqs: d.rfqs.map(x => x.number), orders: d.orders.map(x => x.number) }); })()`));
    assert.equal(d.rfqs.length, 1);
    assert.equal(d.orders.length, 1);
  });

  it('i documenti di altri piani non vengono raccolti', () => {
    const app = conPiano();
    genera(app, 'rfq', 's1');
    assert.equal(app.eval('planDocs("altro").rfqs.length'), 0);
  });

  it('l\'ordine generato da una richiesta eredita il piano di origine', () => {
    const app = conPiano();
    const r = genera(app, 'rfq', 's1');
    app.eval(`orderFromRfq(${JSON.stringify(r.id)})`);
    assert.equal(app.snapshot().orders[0].planId, 'pl1', 'la catena piano → richiesta → ordine non si spezza');
  });

  it('un ordine creato a mano non risulta legato ad alcun piano', () => {
    const app = conPiano();
    app.eval('newOrder()');
    assert.equal(app.eval('db.orders[0].planId'), null);
  });
});

describe('permessi', () => {
  it('chi non scrive documenti non apre la modale né genera nulla', () => {
    const app = conPiano();
    app.asRole('progettazione');   // scrive il catalogo, non i documenti
    app.eval('planDocsModal("pl1")');
    app.eval('planCreateDocs()');
    assert.equal(app.eval('db.rfqs.length + db.orders.length'), 0);
  });
});

// ─── Non si ordina due volte la stessa cosa dallo stesso fabbisogno ───
// L'errore facile: si genera l'ordine per il primo fornitore, si torna indietro
// per il secondo, e le righe di prima sono ancora lì spuntate. Il doppio ordine
// si scopre alla consegna.
describe('Righe già finite in un documento del piano', () => {
  const usati = (app, kind) => JSON.parse(app.eval(`JSON.stringify((() => {
    const m = planDocumentedKeys('pl1'); const out = {};
    m.forEach((v, k) => { const f = v.filter(x => x.kind === ${JSON.stringify(kind)}); if (f.length) out[k] = f.map(x => x.number); });
    return out; })())`));

  it('appena creato il piano non risulta usato niente', () => {
    const app = conPiano();
    assert.deepEqual(usati(app, 'order'), {});
    assert.deepEqual(usati(app, 'rfq'), {});
  });

  it('generato un ordine, i suoi articoli risultano usati', () => {
    const app = conPiano();
    const o = genera(app, 'order', 's1');
    const u = usati(app, 'order');
    assert.deepEqual(Object.keys(u).sort(), ['flangia', 'vite']);
    assert.deepEqual(u.vite, [o.number]);
    assert.deepEqual(usati(app, 'rfq'), {}, 'un ordine non consuma anche la strada delle richieste');
  });

  // Il punto di merito: chiedere un'offerta e poi ordinare è il flusso normale.
  it('una richiesta NON impedisce l\'ordine degli stessi articoli', () => {
    const app = conPiano();
    genera(app, 'rfq', 's1');
    assert.deepEqual(usati(app, 'order'), {},
      'bloccare qui renderebbe impossibile proprio il percorso che l\'app incoraggia');
    assert.ok(usati(app, 'rfq').vite, 'ma una seconda richiesta per lo stesso articolo sì');
  });

  it('le righe degli altri fornitori restano libere', () => {
    const app = conPiano();
    genera(app, 'order', 's1');
    const u = usati(app, 'order');
    assert.ok(!u.tondo, 'il tondo è di Beta: il suo ordine si deve ancora fare');
    assert.ok(!u.orfano);
  });

  it('un ordine annullato libera le sue righe: quell\'ordine non esiste più', () => {
    const app = conPiano();
    genera(app, 'order', 's1');
    app.eval(`db.orders[0].status = 'annullato'; saveDB();`);
    assert.deepEqual(usati(app, 'order'), {});
  });

  it('un ordine eliminato libera le sue righe, senza doverlo dire a nessuno', () => {
    const app = conPiano();
    genera(app, 'order', 's1');
    app.eval(`Store.remove('orders', db.orders[0].id);`);
    assert.deepEqual(usati(app, 'order'), {},
      'il conto si legge dai documenti: non c\'è nessun contrassegno da ripulire');
  });

  it('i documenti di un ALTRO piano non contano', () => {
    const app = conPiano();
    genera(app, 'order', 's1');
    app.eval(`db.orders[0].planId = 'pl-altro'; saveDB();`);
    assert.deepEqual(usati(app, 'order'), {});
  });

  it('le righe manuali di un documento non bloccano niente', () => {
    const app = conPiano();
    genera(app, 'order', 's1');
    app.eval(`db.orders[0].lines.push({ id: 'man', itemId: null, code: 'LIBERA', qty: 1 }); saveDB();`);
    const u = usati(app, 'order');
    assert.equal(Object.keys(u).length, 2, 'una riga senza articolo non viene dal fabbisogno');
  });

  it('la generazione rifiuta un articolo già ordinato, anche forzando la selezione', () => {
    const app = conPiano();
    genera(app, 'order', 's1');
    const prima = app.eval('db.orders.length');
    // Si simula la spunta che l'interfaccia disabilita: la guardia deve stare
    // anche accanto alla scrittura, non solo nella modale.
    app.eval(`window.__planDocsId = 'pl1'; window.__planDocsKind = 'order';
      planDocsSelection = () => new Map([['s1', ['vite', 'flangia']]]);
      planCreateDocs();`);
    assert.equal(app.eval('db.orders.length'), prima, 'nessun ordine doppio');
  });

  it('ma le righe ancora libere passano, anche insieme a una bloccata', () => {
    const app = conPiano();
    genera(app, 'order', 's1');
    app.eval(`window.__planDocsId = 'pl1'; window.__planDocsKind = 'order';
      planDocsSelection = () => new Map([['s2', ['tondo']], ['s1', ['vite']]]);
      planCreateDocs();`);
    const ordini = app.snapshot().orders;
    assert.equal(ordini.length, 2);
    assert.deepEqual(ordini[1].lines.map(l => l.code), ['TONDO'],
      'il fornitore libero riceve il suo ordine, quello già servito no');
  });

  it('i due pulsanti contano ciascuno il proprio lavoro rimasto', () => {
    const app = conPiano();
    const n = k => app.eval(`planDocsAvailable(getPlan('pl1'), ${JSON.stringify(k)})`);
    assert.equal(n('order'), 4, 'quattro righe d\'acquisto nel piano');
    assert.equal(n('rfq'), 4);
    genera(app, 'order', 's1');
    assert.equal(n('order'), 2, 'vite e flangia sono andate');
    assert.equal(n('rfq'), 4, 'la strada delle richieste è intatta');
  });

  it('il pulsante si spegne quando non resta niente per quel tipo', () => {
    const app = conPiano();
    ['s1', 's2', ''].forEach(s => genera(app, 'order', s));
    assert.equal(app.eval(`planDocsAvailable(getPlan('pl1'), 'order')`), 0);
    app.eval('currentPlanId = "pl1"; mrpView = "edit"; renderMrp();');
    const html = app.html('view-mrp');
    assert.ok(/Genera ordini<\/button>|Genera ordini"/.test(html) || html.includes('disabled'), 'il pulsante ordini resta ma disabilitato');
    assert.ok(html.includes('Genera richieste (4)'), 'quello delle richieste conta ancora quattro righe');
  });

  it('il tipo lo decide il pulsante, non un menu dentro la scheda', () => {
    const app = conPiano();
    app.eval(`planDocsModal('pl1', 'order');
      planDocsSelection = () => new Map([['s2', ['tondo']]]);
      planCreateDocs();`);
    assert.equal(app.eval('db.orders.length'), 1);
    assert.equal(app.eval('db.rfqs.length'), 0);
  });

  it('un tipo non valido non genera un documento a caso: vale la richiesta', () => {
    const app = conPiano();
    app.eval(`planDocsModal('pl1', 'inventato');
      planDocsSelection = () => new Map([['s2', ['tondo']]]);
      planCreateDocs();`);
    assert.equal(app.eval('db.rfqs.length'), 1, 'la richiesta è il documento che non impegna a niente');
    assert.equal(app.eval('db.orders.length'), 0);
  });

  it('nella lista del fabbisogno la riga dice dove è già finita', () => {
    const app = conPiano();
    const o = genera(app, 'order', 's1');
    app.eval('currentPlanId = "pl1"; mrpView = "edit"; renderMrp();');
    const html = app.html('view-mrp');
    assert.ok(html.includes(o.number), 'la domanda «l\'ho già ordinato?» va risposta dove si guarda per primo');
  });
});

describe('Le schede del piano', () => {
  const pannello = (h, id) => {
    const m = h.match(new RegExp(`<div role="tabpanel" id="plan-panel-${id}"[^>]*>`));
    assert.ok(m, 'manca la scheda ' + id);
    return m[0];
  };

  it('ogni sezione ha la sua scheda, con il conteggio dove ha senso', () => {
    const app = conPiano();
    app.eval('planTab = "buy"');
    const h = app.eval("renderPlanEdit('pl1')");
    ['buy', 'cl', 'make', 'agenda', 'gantt', 'load', 'docs'].forEach(t => pannello(h, t));
    assert.match(h, /id="plan-tab-buy"[^>]*aria-selected="true"[^>]*>Da acquistare <span class="plan-tab-n">4<\/span>/);
    assert.match(h, /id="plan-tab-docs"[^>]*>Documenti <span class="plan-tab-n">0<\/span>/);
  });

  it('si vede solo la scheda scelta, ma tutte stanno nella pagina', () => {
    const app = conPiano();
    app.eval('planTab = "buy"');
    const h = app.eval("renderPlanEdit('pl1')");
    assert.ok(!/hidden/.test(pannello(h, 'buy')));
    assert.ok(/hidden/.test(pannello(h, 'gantt')));
    assert.match(h, /Gantt/, 'le schede nascoste restano disegnate: la stampa le mostra');
  });

  it('la scheda scelta resta scelta per gli altri piani', () => {
    const app = conPiano();
    app.eval('planSetTab("agenda")');
    const h = app.eval("renderPlanEdit('pl1')");
    assert.ok(!/hidden/.test(pannello(h, 'agenda')));
    assert.ok(/hidden/.test(pannello(h, 'buy')));
    app.eval('planTab = "boh"');
    assert.ok(!/hidden/.test(pannello(app.eval("renderPlanEdit('pl1')"), 'buy')), 'una scheda sconosciuta torna alla prima');
  });

  it('i pulsanti «Genera» stanno nella scheda delle righe su cui agiscono', () => {
    const app = conPiano();
    const h = app.eval("renderPlanEdit('pl1')");
    const dentro = id => h.slice(h.indexOf(`id="plan-panel-${id}"`), h.indexOf('</div>', h.indexOf(`id="plan-panel-${id}"`) + 400));
    assert.match(dentro('buy'), /Genera ordini/);
    assert.match(dentro('make'), /Genera ordini di produzione/);
    assert.match(dentro('cl'), /Genera ordini di lavoro/);
  });
});

describe('Le bozze d ordine degli altri (0.105.6)', () => {
  const bozza = (planId) => ({ orders: [{ id: 'b1', number: 'ODA-2026-009', status: 'bozza', supplierId: 's1', planId: planId || null, active: true,
    lines: [{ id: 'bl1', itemId: 'vite', code: 'VITE', uom: 'pz', qty: 8, price: 2, received: 0 }] }] });
  const modale = app => app.eval(`(invalidateCaches(), planDocsBody(planDocGroups(planDocRows(getPlan('pl1'), 'order').filter(r => r.qtyOrder > 0), 'order'), 'pl1', 'order'))`);
  it('una bozza del riordino si vede sulla riga, e nella scheda la riga nasce non spuntata', () => {
    const app = conPiano(bozza());
    const r = JSON.parse(app.eval(`JSON.stringify(mrpBuyRows(getPlan('pl1'), true).find(r => r.item.id === 'vite').bozze)`));
    assert.deepEqual(r.map(b => b.number), ['ODA-2026-009']);
    const html = modale(app);
    assert.match(html, /in bozza ODA-2026-009/);
    assert.match(app.eval(`mrpBuyLineHtml(mrpBuyRows(getPlan('pl1'), true).find(r => r.item.id === 'vite'))`), /in bozza ODA-2026-009/, 'e nella tabella del piano');
    assert.match(html, /value="vite"\s+onchange/, 'la vite non è spuntata');
    assert.match(html, /value="tondo"\s+checked/, 'le altre sì');
  });
  it('una bozza di questo stesso piano non è «di un altro»', () => {
    const app = conPiano(bozza('pl1'));
    assert.equal(app.eval(`mrpBuyRows(getPlan('pl1'), true).find(r => r.item.id === 'vite').bozze.length`), 0);
  });
});
