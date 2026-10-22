// Conto lavoro: le fasi di lavorazione affidate a un terzista entrano nel
// fabbisogno e diventano righe di documento.
//
// Il punto delicato non e' l'esplosione — quella e' aritmetica — ma l'identita'
// della fase. Una riga di ciclo non ha un id proprio: la sua chiave si
// costruisce, e da come si costruisce dipende se il fabbisogno riconosce una
// fase gia' ordinata o la ripropone. Meta' di questi casi provano proprio
// quello.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm, comp, wc } = require('./fixtures.js');

// Perno prodotto in casa: una materia prima, una fase interna (tornitura) e una
// in conto lavoro (zincatura presso Beta). Il gruppo ne monta due.
function conDb(over) {
  const app = loadApp({ silent: true });
  app.asRole('admin');
  app.setDb(makeDb(Object.assign({
    suppliers: [
      { id: 's1', name: 'Alfa', active: true },
      { id: 's2', name: 'Beta', active: true },
    ],
    workCenters: [wc('tor', 40), wc('zin', 30)],
    items: [
      Object.assign(mat('tondo', 5), { supplierId: 's1', uom: 'kg',
        priceList: [{ id: 'q1', supplierId: 's1', price: 5, date: '2026-01-01' }], activePriceId: 'q1' }),
      parte('perno', { sourcing: 'make', uom: 'pz', cycle: [
        { kind: 'item', itemId: 'tondo', qty: 2 },
        { kind: 'op', workCenterId: 'tor', supplierId: '', costMode: 'orario', hours: 0.5, rate: 40, note: '' },
        { kind: 'op', workCenterId: 'zin', supplierId: 's2', costMode: 'fisso', cost: 3, hours: 0.1, note: '' },
      ] }),
      asm('grp', 'gruppo', { components: [comp('perno', 3)] }),
    ],
    plans: [{ id: 'pl1', number: 'FAB-2026-001', title: 'Lotto', date: '2026-07-01', notes: '',
      lines: [{ id: 'l1', itemId: 'grp', qty: 2, dueDate: '2026-09-30' }], active: true }],
  }, over || {})));
  return app;
}
const fasi = app => JSON.parse(app.eval(`JSON.stringify(mrpExplode(getPlan('pl1').lines).phases
  .map(e => ({ code: e.item.code, phaseKey: e.phaseKey, phaseNo: e.phaseNo, wc: e.workCenterId, sup: e.supplierId, qty: e.qty, due: e.due })))`));
const righe = app => JSON.parse(app.eval("JSON.stringify(mrpPhaseRows(getPlan('pl1')))"));

describe('Conto lavoro: esplosione', () => {
  it('la fase esterna entra nel fabbisogno con i pezzi della parte', () => {
    const f = fasi(conDb());
    assert.equal(f.length, 1);
    assert.equal(f[0].code, 'PERNO');
    assert.equal(f[0].sup, 's2');
    assert.equal(f[0].qty, 6, '2 gruppi x 3 perni');
  });

  it('la fase interna resta fuori: non si compra, si fa', () => {
    assert.equal(fasi(conDb()).filter(x => x.wc === 'tor').length, 0);
  });

  it('la data scende dalla riga di piano come per il materiale', () => {
    assert.equal(fasi(conDb())[0].due, '2026-09-30');
  });

  it('il numero di fase conta fra le sole lavorazioni', () => {
    // La zincatura e' la seconda lavorazione ma la terza riga del ciclo: la
    // fase e' la 20, non la 30.
    assert.equal(fasi(conDb())[0].phaseNo, 20);
  });

  it('una parte acquistata da fornitore non genera fasi: quelle le fa lui', () => {
    const app = conDb();
    app.eval("getItem('perno').sourcing = 'buy'; invalidateCaches();");
    assert.equal(fasi(app).length, 0);
  });

  it('una parte senza fasi esterne non genera niente', () => {
    const app = conDb();
    app.eval("getItem('perno').cycle[2].supplierId = ''; invalidateCaches();");
    assert.equal(fasi(app).length, 0);
  });

  it('lo stesso perno da due rami somma sulla stessa chiave', () => {
    const app = conDb();
    app.eval(`db.items.push({ id: 'grp2', code: 'GRP2', name: 'Gruppo 2', type: 'gruppo', uom: 'pz',
      components: [{ itemId: 'perno', qty: 5, scrapPct: 0 }], operations: [] });
      getPlan('pl1').lines.push({ id: 'l2', itemId: 'grp2', qty: 1, dueDate: '2026-08-01' });
      invalidateCaches();`);
    const f = fasi(app);
    assert.equal(f.length, 1, 'due rami, una sola riga di fase');
    assert.equal(f[0].qty, 11, '6 dal primo ramo + 5 dal secondo');
    assert.equal(f[0].due, '2026-08-01', 'vince la data piu vicina, come per il materiale');
  });

  it('due fasi sullo stesso centro restano due righe', () => {
    // Sommarle perderebbe l'ordine del ciclo, che e' cio' che il terzista legge.
    const app = conDb();
    app.eval(`getItem('perno').cycle.push({ kind: 'op', workCenterId: 'zin', supplierId: 's2',
      costMode: 'fisso', cost: 1, hours: 0, note: '' }); invalidateCaches();`);
    const f = fasi(app);
    assert.equal(f.length, 2);
    assert.notEqual(f[0].phaseKey, f[1].phaseKey);
  });

  it('un anello tronca il ramo e le sue fasi non compaiono', () => {
    const app = conDb();
    app.eval("getItem('perno').cycle[0].itemId = 'grp'; invalidateCaches();");
    const out = JSON.parse(app.eval("JSON.stringify({ c: mrpExplode(getPlan('pl1').lines).cycle })"));
    assert.equal(out.c, true);
  });
});

describe('Conto lavoro: la chiave della fase', () => {
  it('aggiungere materiale alla distinta parte non sposta la chiave', () => {
    // E' la modifica piu' frequente, e con un indice assoluto sposterebbe la
    // chiave di ogni fase che segue: il documento gia' generato smetterebbe di
    // corrispondere.
    const app = conDb();
    const prima = fasi(app)[0].phaseKey;
    app.eval(`getItem('perno').cycle.unshift({ kind: 'item', itemId: 'tondo', qty: 1, costOverride: null });
      invalidateCaches();`);
    assert.equal(fasi(app)[0].phaseKey, prima);
  });

  it('la chiave nomina parte, posizione fra le fasi e centro', () => {
    assert.equal(fasi(conDb())[0].phaseKey, 'perno#1#zin');
  });

  it('riordinare le fasi la sposta, ed e il limite dichiarato', () => {
    const app = conDb();
    const prima = fasi(app)[0].phaseKey;
    app.eval("moveKindRow; const c = getItem('perno').cycle; getItem('perno').cycle = moveKindRow(c, 'op', 1, -1); invalidateCaches();");
    assert.notEqual(fasi(app)[0].phaseKey, prima,
      'se la chiave non si spostasse, non ci sarebbe niente da dichiarare');
  });
});

describe('Conto lavoro: la riga di fabbisogno', () => {
  it('a costo fisso il prezzo e il costo della fase, per pezzo', () => {
    const r = righe(conDb())[0];
    approx(r.price, 3);
    approx(r.amount, 18, '3 x 6 pezzi');
  });

  it('a costo orario il prezzo e ore per pezzo per tariffa', () => {
    const app = conDb();
    app.eval(`Object.assign(getItem('perno').cycle[2], { costMode: 'orario', hours: 0.25, rate: 32 });
      invalidateCaches();`);
    const r = righe(app)[0];
    approx(r.price, 8);
    approx(r.amount, 48);
    approx(r.hours, 1.5, 'ore totali = 0,25 x 6 pezzi');
  });

  it('la tariffa e quella congelata sulla riga, non quella odierna del centro', () => {
    // wcRateFor propone la tariffa quando la fase si scrive; ripescarla adesso
    // cambierebbe da se' il prezzo di una fase gia' decisa.
    const app = conDb();
    app.eval(`Object.assign(getItem('perno').cycle[2], { costMode: 'orario', hours: 1, rate: 25 });
      getWorkCenter('zin').hourlyRate = 999; invalidateCaches();`);
    approx(righe(app)[0].price, 25);
  });

  it('una fase senza tariffa si segnala invece di valere zero in silenzio', () => {
    const app = conDb();
    app.eval("getItem('perno').cycle[2].cost = 0; invalidateCaches();");
    assert.equal(righe(app)[0].noPrice, true);
  });

  it('non ha giacenza, ne netto, ne lotto: non e merce a scaffale', () => {
    const r = righe(conDb())[0];
    ['onHand', 'incoming', 'committed', 'net', 'safety', 'lotSize', 'minQty'].forEach(k => {
      assert.equal(r[k], undefined, `la riga di una fase non deve avere ${k}`);
    });
  });

  it('il fabbisogno netto non cambia la quantita di una fase', () => {
    const app = conDb();
    const lordo = righe(app)[0].qtyOrder;
    app.eval('mrpNet = true;');
    assert.equal(righe(app)[0].qtyOrder, lordo);
  });

  it('senza giorni dichiarati la data d ordine e quella in cui serve', () => {
    const r = righe(conDb())[0];
    assert.equal(r.leadDays, 0);
    assert.equal(r.orderBy, r.due);
  });
});

describe('Conto lavoro: il tempo si misura in giorni', () => {
  // Una fase esterna non occupa una macchina nostra: il pezzo esce e torna, e
  // il tempo che conta e' l'attraversamento. Da li' si ricava entro quando
  // mandare l'ordine di lavoro.
  const conGiorni = (gg) => {
    const app = conDb();
    app.eval(`getItem('perno').cycle[2].days = ${gg}; invalidateCaches();`);
    return app;
  };

  it('i giorni diventano il tempo di consegna della fase', () => {
    const r = righe(conGiorni(5))[0];
    assert.equal(r.leadDays, 5);
    assert.equal(r.days, 5);
  });

  it('l ordine di lavoro va mandato con quell anticipo', () => {
    // Serve pronto mercoledì 30 settembre, il terzista ci mette 5 giorni
    // lavorativi (0.110.0): entro mercoledì 23.
    assert.equal(righe(conGiorni(5))[0].orderBy, '2026-09-23');
  });

  it('l anticipo attraversa il cambio di mese senza sbagliare', () => {
    const app = conDb();
    app.eval("getPlan('pl1').lines[0].dueDate = '2026-10-02'; getItem('perno').cycle[2].days = 7; invalidateCaches();");
    assert.equal(righe(app)[0].orderBy, '2026-09-23', 'sette giorni lavorativi prima di venerdì 2 ottobre');
  });

  it('senza data in cui serve non si inventa una data d ordine', () => {
    const app = conGiorni(5);
    app.eval("getPlan('pl1').lines[0].dueDate = ''; invalidateCaches();");
    const r = righe(app)[0];
    assert.equal(r.due, '');
    assert.equal(r.orderBy, '');
  });

  it('un valore negativo non anticipa al contrario', () => {
    assert.equal(righe(conGiorni(-3))[0].orderBy, '2026-09-30');
  });

  it('i giorni non toccano il costo', () => {
    // Un attraversamento piu' lungo non fa costare di piu' la lavorazione: e' un
    // tempo, non un prezzo.
    const app = conDb();
    const prima = app.eval("costOf('perno').total");
    app.eval("getItem('perno').cycle[2].days = 30; invalidateCaches();");
    approx(app.eval("costOf('perno').total"), prima);
  });

  it('le fasi interne non hanno giorni: il loro tempo sono le ore', () => {
    const app = conDb();
    const interna = JSON.parse(app.eval("JSON.stringify(getItem('perno').cycle[1])"));
    assert.equal(interna.days, undefined, 'una fase interna non deve nascere con dei giorni');
    assert.equal(interna.hours, 0.5);
  });
});

describe('Conto lavoro: dal fabbisogno al documento', () => {
  const FABBRICA = { rfq: 'planNewRfq', order: 'planNewOrder', odl: 'planNewOdl' };
  const genera = (app, kind) => JSON.parse(app.eval(`(() => {
    const p = getPlan('pl1');
    const g = mrpGroupBySupplier(planDocRows(p, ${JSON.stringify(kind)})).find(x => x.supplierId === 's2');
    const d = ${FABBRICA[kind]}(p, 's2', g.rows);
    saveDB();
    return JSON.stringify(d);
  })()`));

  it('la fase finisce nel gruppo del suo terzista', () => {
    const g = JSON.parse(conDb().eval(`JSON.stringify(mrpGroupBySupplier(planDocRows(getPlan('pl1'), 'rfq'))
      .map(x => ({ sup: x.supplierId, n: x.rows.length })))`));
    assert.deepEqual(g.find(x => x.sup === 's2'), { sup: 's2', n: 1 });
  });

  it('un ordine d acquisto non contiene lavorazioni, e viceversa', () => {
    // La separazione fra ODA e ODL vive qui: e' il filtro per tipo che decide
    // quali righe possono arrivare al documento.
    const app = conDb();
    const chiavi = k => JSON.parse(app.eval(`JSON.stringify(planDocRows(getPlan('pl1'), ${JSON.stringify(k)}).map(planRowKey))`));
    assert.deepEqual(chiavi('order'), ['tondo'], 'solo merce');
    assert.deepEqual(chiavi('odl'), ['perno#1#zin'], 'solo lavorazioni');
    assert.deepEqual(chiavi('rfq').sort(), ['perno#1#zin', 'tondo'], 'la richiesta le tiene insieme');
  });

  it('la riga di un ordine di lavoro ha itemId nullo e la chiave della fase', () => {
    const o = genera(conDb(), 'odl');
    assert.equal(o.lines.length, 1);
    assert.equal(o.lines[0].itemId, null, 'un itemId qui farebbe contare i pezzi due volte');
    assert.equal(o.lines[0].phaseKey, 'perno#1#zin');
  });

  it('porta il codice della parte, che e cio che il terzista riceve', () => {
    const o = genera(conDb(), 'odl');
    assert.equal(o.lines[0].code, 'PERNO');
    assert.match(o.lines[0].description, /fase 20/);
    assert.equal(o.lines[0].qty, 6);
    approx(o.lines[0].price, 3);
  });

  it('la richiesta di offerta nasce senza prezzo, come per il materiale', () => {
    const r = genera(conDb(), 'rfq');
    assert.equal(r.lines[0].price, '');
  });

  it('a costo orario la nota di riga porta ore e tariffa', () => {
    const app = conDb();
    app.eval(`Object.assign(getItem('perno').cycle[2], { costMode: 'orario', hours: 0.25, rate: 32 });
      invalidateCaches();`);
    assert.equal(genera(app, 'odl').lines[0].note, '0,25 h/pz × € 32,00/h');
  });

  it('l ordine di lavoro nasce con la sua numerazione', () => {
    assert.match(genera(conDb(), 'odl').number, /^ODL-\d{4}-001$/);
  });

  it('una fase gia in un ordine di lavoro non si ripropone', () => {
    const app = conDb();
    genera(app, 'odl');
    const gia = JSON.parse(app.eval(`JSON.stringify(Array.from(planDocumentedKeys('pl1').keys()))`));
    assert.ok(gia.includes('perno#1#zin'), 'la fase non risulta documentata');
    assert.equal(app.eval("planDocsAvailable(getPlan('pl1'), 'odl')"), 0, 'non resta nessuna fase');
    assert.equal(app.eval("planDocsAvailable(getPlan('pl1'), 'order')"), 1,
      'e il tondo resta da ordinare ad Alfa: un ODL non consuma le righe di un ODA');
  });

  it('una richiesta non blocca l ordine: e il flusso normale', () => {
    const app = conDb();
    genera(app, 'rfq');
    const gia = JSON.parse(app.eval(`JSON.stringify(Array.from(planDocumentedKeys('pl1').entries())
      .map(([k, v]) => [k, v.map(x => x.kind)]))`));
    assert.deepEqual(gia.find(x => x[0] === 'perno#1#zin')[1], ['rfq']);
  });

  it('una riga davvero manuale non blocca niente', () => {
    const app = conDb();
    app.eval(`db.rfqs.push({ id: 'r9', number: 'RFQ-1', planId: 'pl1', supplierId: 's2', active: true,
      lines: [{ id: 'x', itemId: null, phaseKey: null, code: 'A MANO', description: 'servizio', qty: 1 }] });`);
    const gia = JSON.parse(app.eval(`JSON.stringify(Array.from(planDocumentedKeys('pl1').keys()))`));
    assert.equal(gia.length, 0);
  });
});

describe('Conto lavoro: il magazzino non se ne accorge', () => {
  it('una riga di conto lavoro ricevuta non carica nessun articolo', () => {
    // E' la garanzia strutturale contro il doppio conteggio: la riga non ha
    // articolo, quindi stockIndex non la vede. Il rientro dei pezzi lo
    // racconta un movimento.
    const app = conDb();
    app.eval(`db.orders.push({ id: 'o9', number: 'ODA-9', status: 'confermato', planId: 'pl1',
      supplierId: 's2', active: true,
      lines: [{ id: 'x', itemId: null, phaseKey: 'perno#1#zin', code: 'PERNO', description: 'Zincatura',
        uom: 'pz', qty: 6, price: 3, received: 6, deliveryDate: '' }] });
      invalidateCaches();`);
    approx(app.eval("onHandOf('perno')"), 0);
    approx(app.eval("incomingOf('perno')"), 0);
  });
});

// ══════════════════════════════════════════════════════════════
//  Tratte: le fasi consecutive dello stesso terzista sono una riga
// ══════════════════════════════════════════════════════════════
// Un ordine di lavoro non si commissiona fase per fase. Due fasi consecutive
// dallo stesso terzista sono una lavorazione sola — il pezzo gli arriva, gli
// resta sul banco e riparte una volta — e due fasi **non** consecutive sono due
// documenti, perche' fra le due il pezzo torna da noi.
//
// Il ciclo dei casi qui sotto: 10 tornitura interna, 20 Beta, 30 tornitura
// interna, 40 Beta. Le due fasi di Beta non sono consecutive.
function conDuePassate(over) {
  const app = conDb(over);
  app.eval(`getItem('perno').cycle = [
    { kind: 'item', itemId: 'tondo', qty: 2, costOverride: null },
    { kind: 'op', workCenterId: 'tor', supplierId: '', costMode: 'orario', cost: null, hours: 0.5, rate: 40, days: 0, note: '' },
    { kind: 'op', workCenterId: 'zin', supplierId: 's2', costMode: 'fisso', cost: 3, hours: 0, rate: 0, days: 3, note: '' },
    { kind: 'op', workCenterId: 'tor', supplierId: '', costMode: 'orario', cost: null, hours: 0.2, rate: 40, days: 0, note: '' },
    { kind: 'op', workCenterId: 'zin', supplierId: 's2', costMode: 'fisso', cost: 2, hours: 0, rate: 0, days: 2, note: '' },
  ]; invalidateCaches();`);
  return app;
}
const tratte = app => JSON.parse(app.eval(`JSON.stringify(mrpPhaseRuns(mrpPhaseRows(getPlan('pl1')))
  .map(r => ({ key: r.phaseKey, keys: r.phaseKeys, nos: r.phaseNos, wc: r.wcName, sup: r.supplierId,
    passata: r.passata, qty: r.qty, price: r.price, giorni: r.leadDays, ordinare: r.orderBy })))`));

describe('Tratte: dalle fasi alle lavorazioni da commissionare', () => {
  it('due fasi consecutive dello stesso terzista fanno una riga sola', () => {
    const app = conDuePassate();
    app.eval("getItem('perno').cycle.splice(3, 1); invalidateCaches();");   // via la fase interna in mezzo
    const t = tratte(app);
    assert.equal(t.length, 1, 'una tratta, non due righe da spuntare');
    assert.deepEqual(t[0].nos, [20, 30]);
    assert.deepEqual(t[0].keys, ['perno#1#zin', 'perno#2#zin'], 'la riga copre tutte e due le fasi');
    assert.equal(t[0].key, 'perno#1#zin', "l'identita' e la prima fase");
  });

  it('il prezzo di una tratta e la somma delle sue fasi', () => {
    const app = conDuePassate();
    app.eval("getItem('perno').cycle.splice(3, 1); invalidateCaches();");
    approx(tratte(app)[0].price, 5, '3 + 2 per pezzo');
  });

  it('i giorni si sommano: il pezzo resta fuori per tutta la tratta', () => {
    const app = conDuePassate();
    app.eval("getItem('perno').cycle.splice(3, 1); invalidateCaches();");
    const t = tratte(app)[0];
    assert.equal(t.giorni, 5, '3 + 2 giorni di attraversamento');
    assert.equal(t.ordinare, '2026-09-23', 'serve il 30, va mandato cinque giorni lavorativi prima');
  });

  it('una fase interna in mezzo spezza la tratta in due', () => {
    const t = tratte(conDuePassate());
    assert.equal(t.length, 2, 'fra le due il pezzo torna da noi');
    assert.deepEqual(t.map(x => x.nos), [[20], [40]]);
    assert.deepEqual(t.map(x => x.passata), [0, 1], 'la seconda volta dallo stesso terzista');
  });

  it('due terzisti diversi sono due prime passate, non una seconda', () => {
    const app = conDuePassate();
    app.eval(`db.suppliers.push({ id: 's3', name: 'Gamma', active: true });
      getItem('perno').cycle[4].supplierId = 's3'; invalidateCaches();`);
    assert.deepEqual(tratte(app).map(x => [x.sup, x.passata]), [['s2', 0], ['s3', 0]]);
  });

  it('la tabella del fabbisogno resta per fase: e un analisi, non un documento', () => {
    assert.equal(righe(conDuePassate()).length, 2, 'due fasi, due righe da leggere');
  });
});

describe('Tratte: un ordine di lavoro per terzista e passata', () => {
  const gruppi = (app, kind) => JSON.parse(app.eval(`JSON.stringify(planDocGroups(planDocRows(getPlan('pl1'), ${JSON.stringify(kind)}), ${JSON.stringify(kind)})
    .map(g => ({ key: g.key, name: g.name, n: g.rows.length })))`));

  it('le due passate dello stesso terzista sono due documenti', () => {
    const g = gruppi(conDuePassate(), 'odl');
    assert.equal(g.length, 2, 'un ordine che le contenesse entrambe non si potrebbe eseguire');
    assert.deepEqual(g.map(x => x.key), ['s2#0', 's2#1']);
  });

  it('la seconda passata si chiama per nome, o i due gruppi non si distinguono', () => {
    assert.deepEqual(gruppi(conDuePassate(), 'odl').map(x => x.name), ['Beta', 'Beta — seconda passata']);
  });

  it('la richiesta di offerta le tiene insieme: chiedere non e commissionare', () => {
    const g = gruppi(conDuePassate(), 'rfq').filter(x => x.key === 's2');
    assert.equal(g.length, 1);
    assert.equal(g[0].n, 2, 'un preventivo solo, con dentro tutte e due le lavorazioni');
  });

  it('parti diverse alla stessa passata restano nello stesso ordine', () => {
    const app = conDuePassate();
    app.eval(`db.items.push({ id: 'boccola', code: 'BOC', name: 'Boccola', type: 'parte', uom: 'pz',
      sourcing: 'make', active: true, cycle: [
        { kind: 'op', workCenterId: 'zin', supplierId: 's2', costMode: 'fisso', cost: 9, hours: 0, rate: 0, days: 1, note: '' }] });
      getItem('grp').components.push({ id: 'c2', itemId: 'boccola', qty: 1, scrapPct: 0 });
      invalidateCaches();`);
    const g = gruppi(app, 'odl');
    assert.equal(g.find(x => x.key === 's2#0').n, 2, 'stesso terzista, stesso viaggio, stessa bolla');
  });
});

describe('Tratte: la riga di documento le porta tutte', () => {
  const generaOdl = (app, key) => app.eval(`(() => {
    const p = getPlan('pl1');
    const g = planDocGroups(planDocRows(p, 'odl'), 'odl').find(x => x.key === ${JSON.stringify(key)});
    return planNewOdl(p, g.supplierId, g.rows).id;
  })()`);

  it('la descrizione nomina le fasi coperte, non solo la prima', () => {
    const app = conDuePassate();
    app.eval("getItem('perno').cycle.splice(3, 1); invalidateCaches();");
    generaOdl(app, 's2#0');
    const l = app.snapshot().workOrders[0].lines[0];
    assert.match(l.description, /fasi 20-30/);
    assert.equal(l.phaseKeys, 'perno#1#zin,perno#2#zin');
    assert.equal(l.phaseKey, 'perno#1#zin');
  });

  it('la nota porta il dettaglio di ogni fase, che sulla riga non ci sta', () => {
    const app = conDuePassate();
    app.eval("getItem('perno').cycle.splice(3, 1); invalidateCaches();");
    generaOdl(app, 's2#0');
    const l = app.snapshot().workOrders[0].lines[0];
    assert.match(l.note, /fase 20/);
    assert.match(l.note, /fase 30/);
  });

  it('una fase sola scrive la stessa cosa nelle due colonne', () => {
    const app = conDuePassate();
    generaOdl(app, 's2#0');
    const l = app.snapshot().workOrders[0].lines[0];
    assert.equal(l.phaseKeys, l.phaseKey);
    assert.match(l.description, /fase 20/);
  });

  it('la fase in mezzo alla tratta risulta documentata, e non si ripropone', () => {
    const app = conDuePassate();
    app.eval("getItem('perno').cycle.splice(3, 1); invalidateCaches();");
    generaOdl(app, 's2#0');
    app.eval('saveDB(); invalidateCaches();');
    const chiavi = JSON.parse(app.eval("JSON.stringify(Array.from(planDocumentedKeys('pl1').keys()))"));
    assert.ok(chiavi.includes('perno#2#zin'), 'la 30 e dentro quella riga: riproporla sarebbe un ordine doppio');
    assert.equal(app.eval("planDocsAvailable(getPlan('pl1'), 'odl')"), 0);
  });

  it('generata la prima passata, la seconda resta da fare', () => {
    const app = conDuePassate();
    generaOdl(app, 's2#0');
    app.eval('saveDB(); invalidateCaches();');
    assert.equal(app.eval("planDocsAvailable(getPlan('pl1'), 'odl')"), 1, 'la fase 40 e un altro documento');
  });
});
