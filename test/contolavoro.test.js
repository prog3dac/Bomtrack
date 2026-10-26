// Materiale presso i terzisti: due tipi di movimento, un prospetto calcolato.
//
// Il caso che conta e' il giro completo — materiale che esce, pezzi che
// rientrano — e la prova che nessuna quantita' viene contata due volte. La
// garanzia e' strutturale, non aritmetica: le righe d'ordine con un articolo
// caricano via `received`, quelle senza caricano via movimento, e una riga non
// puo' essere di entrambi i tipi. Qui si verifica che regga davvero.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, wc } = require('./fixtures.js');

function conDb(over) {
  const app = loadApp({ silent: true });
  app.asRole('admin');
  app.setDb(makeDb(Object.assign({
    suppliers: [
      { id: 'alfa', name: 'Alfa', active: true },
      { id: 'beta', name: 'Beta', active: true },
    ],
    workCenters: [wc('zin', 30)],
    items: [
      Object.assign(mat('tondo', 5), { uom: 'kg' }),
      Object.assign(acq('bullone', 1), { uom: 'pz' }),
      parte('perno', { sourcing: 'make', uom: 'pz', cycle: [
        { kind: 'item', itemId: 'tondo', qty: 2 },
        { kind: 'op', workCenterId: 'zin', supplierId: 'beta', costMode: 'fisso', cost: 3, hours: 0.1, note: '' },
      ] }),
    ],
  }, over || {})));
  return app;
}
const mv = (app, itemId, kind, qty, extra) =>
  app.eval(`addMovement(${JSON.stringify(itemId)}, ${JSON.stringify(kind)}, ${qty}, '', ${JSON.stringify(extra || {})}) && invalidateCaches()`);
const prospetto = app => JSON.parse(app.eval(`JSON.stringify(atSupplierRows()
  .map(r => ({ sup: r.supplierName, code: r.item && r.item.code, out: r.out, in: r.in, saldo: r.saldo, ordini: r.ordini })))`));

describe('Conto lavoro: i due movimenti', () => {
  it('i tipi esistono e si riconoscono', () => {
    const app = conDb();
    assert.ok(JSON.parse(app.eval('JSON.stringify(Object.keys(MOVEMENT_KINDS))')).includes('clOut'));
    assert.ok(JSON.parse(app.eval('JSON.stringify(Object.keys(MOVEMENT_KINDS))')).includes('clIn'));
    assert.equal(app.eval("isContoLavoroKind('clOut')"), true);
    assert.equal(app.eval("isContoLavoroKind('scarico')"), false);
  });

  it('addMovement scrive fornitore, ordine e riga', () => {
    const app = conDb();
    mv(app, 'tondo', 'clOut', -20, { supplierId: 'beta', orderId: 'o1', lineId: 'l1' });
    const m = app.snapshot().movements[0];
    assert.equal(m.supplierId, 'beta');
    assert.equal(m.orderId, 'o1');
    assert.equal(m.lineId, 'l1');
  });

  it('senza extra i tre campi restano nulli, non assenti', () => {
    const app = conDb();
    mv(app, 'tondo', 'rettifica', 5);
    const m = app.snapshot().movements[0];
    assert.equal(m.supplierId, null);
    assert.equal(m.orderId, null);
    assert.equal(m.lineId, null);
  });

  it('un movimento vecchio prende i campi nulli, e due giri non lo cambiano', () => {
    const app = loadApp({ silent: true });
    app.seedStorage({ schemaVersion: 2, items: [], workCenters: [], suppliers: [],
      movements: [{ id: 'm1', itemId: 'x', kind: 'carico', qty: 3, date: '2026-01-01', note: '' }],
      settings: { currency: '€', uoms: [], concepts: [], mpFamiliesSeeded: true, partFamiliesSeeded: true } });
    app.ref('Store').load();
    const primo = JSON.stringify(app.snapshot().movements[0]);
    assert.equal(app.snapshot().movements[0].supplierId, null);
    app.ref('Store').load();
    assert.equal(JSON.stringify(app.snapshot().movements[0]), primo);
  });

  it('l uscita e negativa e la giacenza cala', () => {
    const app = conDb();
    mv(app, 'tondo', 'carico', 20);
    mv(app, 'tondo', 'clOut', -20, { supplierId: 'beta' });
    approx(app.eval("onHandOf('tondo')"), 0, 'il tondo e dal terzista, allo scaffale non c e piu');
  });
});

describe('Conto lavoro: il prospetto presso terzi', () => {
  it('somma per fornitore e per articolo', () => {
    const app = conDb();
    mv(app, 'tondo', 'clOut', -20, { supplierId: 'beta' });
    mv(app, 'tondo', 'clOut', -5, { supplierId: 'alfa' });
    const p = prospetto(app);
    assert.equal(p.length, 2, 'due terzisti, due righe');
    assert.equal(p.find(x => x.sup === 'Beta').saldo, 20);
    assert.equal(p.find(x => x.sup === 'Alfa').saldo, 5);
  });

  it('un conto chiuso sparisce dal prospetto', () => {
    const app = conDb();
    mv(app, 'tondo', 'clOut', -20, { supplierId: 'beta' });
    mv(app, 'tondo', 'clIn', 20, { supplierId: 'beta' });
    assert.deepEqual(prospetto(app), []);
  });

  it('atSupplierOf somma i terzisti di un articolo', () => {
    const app = conDb();
    mv(app, 'tondo', 'clOut', -20, { supplierId: 'beta' });
    mv(app, 'tondo', 'clOut', -5, { supplierId: 'alfa' });
    approx(app.eval("atSupplierOf('tondo')"), 25);
  });

  it('il filtro di magazzino «presso terzi» pesca quell articolo', () => {
    const app = conDb();
    mv(app, 'tondo', 'clOut', -20, { supplierId: 'beta' });
    const st = JSON.parse(app.eval("JSON.stringify({ a: stockState(getItem('tondo')).atSupplier, b: stockState(getItem('bullone')).atSupplier })"));
    assert.equal(st.a, 20);
    assert.equal(st.b, 0);
    assert.equal(app.eval("STOCK_STATE_FILTERS.terzi(stockState(getItem('tondo')))"), true);
    assert.equal(app.eval("STOCK_STATE_FILTERS.terzi(stockState(getItem('bullone')))"), false);
  });

  it('eliminare l uscita rimette il materiale a magazzino e chiude il conto', () => {
    const app = conDb();
    mv(app, 'tondo', 'carico', 20);
    mv(app, 'tondo', 'clOut', -20, { supplierId: 'beta' });
    app.eval(`Store.remove('movements', db.movements.find(m => m.kind === 'clOut').id); invalidateCaches();`);
    approx(app.eval("onHandOf('tondo')"), 20);
    assert.deepEqual(prospetto(app), []);
  });

  it('l export riporta le stesse righe del prospetto', () => {
    const app = conDb();
    mv(app, 'tondo', 'clOut', -20, { supplierId: 'beta' });
    const spec = JSON.parse(app.eval('JSON.stringify(contoLavoroExportSpec())'));
    assert.equal(spec.sezioni[0].righe.length, 1);
    assert.deepEqual(spec.sezioni[0].righe[0].slice(0, 7), ['Beta', 'TONDO', 'Materia tondo', 'kg', 20, 0, 20]);
  });
});

describe('Conto lavoro: il giro completo, e nessun doppio conteggio', () => {
  // 10 perni: 2 kg di tondo per pezzo, poi zincatura presso Beta.
  it('il materiale esce, i pezzi rientrano, i saldi tornano', () => {
    const app = conDb();
    // 2. ordine del tondo ad Alfa, 3. arriva
    app.eval(`db.orders.push({ id: 'oda1', number: 'ODA-1', status: 'confermato', supplierId: 'alfa',
      active: true, lines: [{ id: 'a1', itemId: 'tondo', code: 'TONDO', description: 'Tondo',
        uom: 'kg', qty: 20, price: 5, received: 20, deliveryDate: '' }] });
      invalidateCaches();`);
    approx(app.eval("onHandOf('tondo')"), 20, 'il ricevimento carica il tondo');

    // 4. ordine della zincatura a Beta: riga SENZA articolo
    app.eval(`db.orders.push({ id: 'oda2', number: 'ODA-2', status: 'confermato', supplierId: 'beta',
      active: true, lines: [{ id: 'z1', itemId: null, phaseKey: 'perno#0#zin', code: 'PERNO',
        description: 'Zincatura — fase 10 su PERNO', uom: 'pz', qty: 10, price: 3, received: 0, deliveryDate: '' }] });
      invalidateCaches();`);
    approx(app.eval("onHandOf('perno')"), 0, "l'ordine di zincatura non deve caricare niente");
    approx(app.eval("incomingOf('perno')"), 0, 'ne mettere il perno in arrivo');

    // 5. si spedisce il tondo a Beta
    mv(app, 'tondo', 'clOut', -20, { supplierId: 'beta', orderId: 'oda2', lineId: 'z1' });
    approx(app.eval("onHandOf('tondo')"), 0);
    assert.equal(prospetto(app)[0].saldo, 20, 'venti chili stanno da Beta');

    // 6a. si registra il ricevimento sulla riga di conto lavoro
    app.eval(`db.orders.find(o => o.id === 'oda2').lines[0].received = 10; invalidateCaches();`);
    approx(app.eval("onHandOf('perno')"), 0, 'il ricevimento della fase NON carica il magazzino');

    // 6b. il rientro vero: dieci perni
    mv(app, 'perno', 'clIn', 10, { supplierId: 'beta', orderId: 'oda2', lineId: 'z1' });

    approx(app.eval("onHandOf('perno')"), 10, 'dieci perni finiti, non venti');
    approx(app.eval("onHandOf('tondo')"), 0);
    approx(app.eval("incomingOf('perno')"), 0);
  });

  it('la riga di conto lavoro porta comunque l ordine a evaso', () => {
    // Il ricevuto su quella riga serve a questo, ed e il motivo per cui esiste.
    const app = conDb();
    app.eval(`db.orders.push({ id: 'oda2', number: 'ODA-2', status: 'confermato', supplierId: 'beta',
      active: true, lines: [{ id: 'z1', itemId: null, phaseKey: 'perno#0#zin', code: 'PERNO',
        description: 'Zincatura', uom: 'pz', qty: 10, price: 3, received: 10, deliveryDate: '' }] });`);
    // ordAutoStatus muta l'ordine e non ritorna niente: si legge lo stato dopo.
    assert.equal(app.eval(`(() => { const o = db.orders.find(x => x.id === 'oda2'); ordAutoStatus(o); return o.status; })()`), 'evaso');
  });

  it('un itemId sulla riga di conto lavoro farebbe contare i pezzi due volte', () => {
    // La prova per assurdo del vincolo: e' il motivo per cui planPhaseDocLine
    // scrive itemId null e non il codice della parte.
    const app = conDb();
    app.eval(`db.orders.push({ id: 'oda2', number: 'ODA-2', status: 'confermato', supplierId: 'beta',
      active: true, lines: [{ id: 'z1', itemId: 'perno', phaseKey: 'perno#0#zin', code: 'PERNO',
        description: 'Zincatura', uom: 'pz', qty: 10, price: 3, received: 10, deliveryDate: '' }] });
      invalidateCaches();`);
    mv(app, 'perno', 'clIn', 10, { supplierId: 'beta', orderId: 'oda2', lineId: 'z1' });
    approx(app.eval("onHandOf('perno')"), 20,
      'con un itemId le due strade si sommano: venti perni da dieci lavorati');
  });
});

describe('Conto lavoro: il materiale esce una volta sola', () => {
  // Lo scenario che ha fatto vedere il difetto: due fasi allo stesso terzista
  // per 4 pezzi. Con un comando per riga uscivano 8 materiali e rientravano 8
  // pezzi. Il materiale del ciclo esce una volta, all'inizio; i pezzi rientrano
  // una volta, alla fine.
  const conDueFasi = () => {
    const app = conDb();
    app.eval(`getItem('perno').cycle = [
      { kind: 'item', itemId: 'tondo', qty: 2, costOverride: null },
      { kind: 'op', workCenterId: 'zin', supplierId: 'beta', costMode: 'fisso', cost: 25, hours: 0, days: 3, note: '' },
      { kind: 'op', workCenterId: 'zin', supplierId: 'beta', costMode: 'fisso', cost: 25, hours: 0, days: 2, note: '' },
    ];
    db.workOrders.push({ id: 'w1', number: 'ODL-2026-001', title: '', date: '2026-07-01',
      status: 'confermato', supplierId: 'beta', transport: '', payment: '', rfqId: null, planId: null,
      jobId: null, supplierConfirmation: '', notes: '', notesInternal: '', active: true,
      lines: [
        { id: 'L1', itemId: null, phaseKey: 'perno#0#zin', code: 'PERNO', description: 'Taglio laser',
          uom: 'pz', qty: 4, price: 25, received: 0, deliveryDate: '', note: '' },
        { id: 'L2', itemId: null, phaseKey: 'perno#1#zin', code: 'PERNO', description: 'Tornitura',
          uom: 'pz', qty: 4, price: 25, received: 0, deliveryDate: '', note: '' },
      ] });
    invalidateCaches();`);
    return app;
  };
  const ruolo = (app, lineId) => JSON.parse(app.eval(`(() => {
    const o = db.workOrders[0]; const l = o.lines.find(x => x.id === ${JSON.stringify(lineId)});
    const r = clLineRole(o, l);
    return JSON.stringify({ out: r.out, dentro: r.in });
  })()`));

  it('lo spedisci sta sulla prima fase, il rientro sull ultima', () => {
    const app = conDueFasi();
    assert.deepEqual(ruolo(app, 'L1'), { out: true, dentro: false });
    assert.deepEqual(ruolo(app, 'L2'), { out: false, dentro: true });
  });

  it('conta l ordine delle fasi del ciclo, non quello delle righe nel documento', () => {
    const app = conDueFasi();
    app.eval('db.workOrders[0].lines.reverse();');
    assert.deepEqual(ruolo(app, 'L1'), { out: true, dentro: false }, 'la fase 10 resta la prima');
  });

  it('a video i comandi compaiono una volta sola, e le righe in mezzo lo dicono', () => {
    const app = conDueFasi();
    app.eval(`getItem('perno').cycle.push({ kind: 'op', workCenterId: 'zin', supplierId: 'beta',
      costMode: 'fisso', cost: 5, hours: 0, days: 1, note: '' });
      db.workOrders[0].lines.push({ id: 'L3', itemId: null, phaseKey: 'perno#2#zin', code: 'PERNO',
        description: 'Lucidatura', uom: 'pz', qty: 4, price: 5, received: 0, deliveryDate: '', note: '' });
      currentOdlId = 'w1'; odlView = 'edit';`);
    app.eval("setView('odl')");
    const h = app.html('view-odl');
    assert.equal((h.match(/plandoc-link[^>]*>avvia</g) || []).length, 1, 'un solo comando di avvio');
    assert.equal((h.match(/plandoc-link[^>]*>dichiara</g) || []).length, 0, 'prima dell avvio non si dichiara');
    assert.match(h, /si avvia alla fase 10, si dichiara alla fase 30/,
      'la fase in mezzo deve dire dove sono i comandi, non restare muta');
    app.eval("odlAvvia('w1', 'L1', { materiali: [] }); renderOdl();");
    const dopo = app.html('view-odl');
    assert.equal((dopo.match(/plandoc-link[^>]*>avvia</g) || []).length, 0, 'avviata una volta, non si riavvia');
    assert.equal((dopo.match(/plandoc-link[^>]*>dichiara</g) || []).length, 1, 'un solo comando di rientro, sull ultima fase');
  });

  it('due parti nello stesso ODL hanno ciascuna i propri ancoraggi', () => {
    const app = conDueFasi();
    app.eval(`db.items.push({ id: 'boccola', code: 'BOC', name: 'Boccola', type: 'parte', uom: 'pz',
      sourcing: 'make', active: true, cycle: [{ kind: 'op', workCenterId: 'zin', supplierId: 'beta',
        costMode: 'fisso', cost: 9, hours: 0, days: 1, note: '' }] });
      db.workOrders[0].lines.push({ id: 'B1', itemId: null, phaseKey: 'boccola#0#zin', code: 'BOC',
        description: 'Zincatura boccola', uom: 'pz', qty: 2, price: 9, received: 0, deliveryDate: '', note: '' });
      invalidateCaches();`);
    assert.deepEqual(ruolo(app, 'B1'), { out: true, dentro: true },
      'una parte con una fase sola esce e rientra sulla stessa riga');
    assert.deepEqual(ruolo(app, 'L1'), { out: true, dentro: false }, 'il perno non ne risente');
  });
});

describe('Conto lavoro: il materiale e quello del ciclo', () => {
  const materiali = (app, itemId, pezzi) => JSON.parse(app.eval(
    `JSON.stringify(clMaterialsOf(getItem(${JSON.stringify(itemId)}), ${pezzi})
      .map(x => ({ code: x.item.code, perPezzo: x.perPezzo, qty: x.qty })))`));

  it('viene dalle righe di distinta parte, moltiplicate per i pezzi', () => {
    // Non e' una scelta libera fra tutti gli articoli: e' scritto nel ciclo, ed
    // e' lo stesso materiale che il fabbisogno ha gia' fatto comprare.
    assert.deepEqual(materiali(conDb(), 'perno', 4), [{ code: 'TONDO', perPezzo: 2, qty: 8 }]);
  });

  it('le righe di lavorazione non sono materiale', () => {
    assert.equal(materiali(conDb(), 'perno', 4).length, 1);
  });

  it('un ciclo senza materiale non ha niente da spedire', () => {
    const app = conDb();
    app.eval("getItem('perno').cycle = getItem('perno').cycle.filter(r => r.kind === 'op'); invalidateCaches();");
    assert.deepEqual(materiali(app, 'perno', 4), []);
  });

  it('un articolo che non si tiene a magazzino resta fuori', () => {
    const app = conDb();
    app.eval(`db.items.push({ id: 'srv', code: 'SRV', name: 'Servizio', type: 'macchina', uom: 'pz', active: true });
      getItem('perno').cycle.push({ kind: 'item', itemId: 'srv', qty: 1, costOverride: null }); invalidateCaches();`);
    assert.deepEqual(materiali(app, 'perno', 4).map(x => x.code), ['TONDO']);
  });
});

// Dalla 0.115.0 sull'ordine di lavoro questi gesti sono avvia e dichiara
// (test/odl-avanzamento.test.js): le schede di prima restano per le righe di
// conto lavoro rimaste negli ordini d'acquisto, e i casi qui sotto le provano lì.
describe('Conto lavoro: il giro con due fasi, in numeri', () => {
  const conOdlDueFasi = (app) => app.eval(`db.orders.push({ id: 'w1', number: 'ODL-2026-001',
    status: 'confermato', supplierId: 'beta', active: true, planId: null, jobId: null,
    lines: [
      { id: 'L1', itemId: null, phaseKey: 'perno#0#zin', code: 'PERNO', description: 'Fase 10', uom: 'pz', qty: 4, price: 25, received: 0 },
      { id: 'L2', itemId: null, phaseKey: 'perno#1#zin', code: 'PERNO', description: 'Fase 20', uom: 'pz', qty: 4, price: 25, received: 0 },
    ] });
    getItem('perno').cycle.push({ kind: 'op', workCenterId: 'zin', supplierId: 'beta',
      costMode: 'fisso', cost: 25, hours: 0, days: 2, note: '' });
    invalidateCaches();`);

  it('escono 8 kg di tondo e rientrano 4 perni, non 8 e 8', () => {
    const app = conDb();
    conOdlDueFasi(app);
    app.eval("addMovement('tondo', 'carico', 20, 'giacenza iniziale'); invalidateCaches();");
    app.eval("clFromOdlModal('w1','L1','out')");
    app.el('cl-q-0').value = '8';
    app.eval("saveClFromOdl('w1','L1','out')");
    app.eval("clFromOdlModal('w1','L2','in')");
    app.el('cl-q-0').value = '4';
    app.eval("saveClFromOdl('w1','L2','in')");

    approx(app.eval("onHandOf('tondo')"), 12, '20 meno gli 8 spediti, non meno 16');
    approx(app.eval("onHandOf('perno')"), 4, 'quattro perni tornati, non otto');
    const p = JSON.parse(app.eval('JSON.stringify(atSupplierRows().map(x => ({ code: x.item.code, saldo: x.saldo })))'));
    assert.deepEqual(p, [{ code: 'TONDO', saldo: 8 }], 'dal terzista restano gli 8 kg di tondo');
  });

  it('la scheda di uscita propone da se la quantita del ciclo', () => {
    const app = conDb();
    conOdlDueFasi(app);
    app.eval("clFromOdlModal('w1','L1','out')");
    // Il DOM finto non costruisce elementi dall'HTML: si legge il markup, che e'
    // quello che il browser riceverebbe.
    assert.match(app.eval('panelRoot().children[0].innerHTML'), /id="cl-q-0"[^>]*value="8"/);
  });

  it('una quantita lasciata a zero non registra niente', () => {
    const app = conDb();
    conOdlDueFasi(app);
    app.eval("clFromOdlModal('w1','L1','out')");
    app.el('cl-q-0').value = '0';
    app.eval("saveClFromOdl('w1','L1','out')");
    assert.equal((app.snapshot().movements || []).length, 0);
  });
});

// ══════════════════════════════════════════════════════════════
//  Tratte del ciclo, e i due soli punti in cui il magazzino si muove
// ══════════════════════════════════════════════════════════════
// Il caso vero, quello che ha fatto vedere il difetto: una parte con fasi
// 10 interna, 20 Beta, 30 interna, 40 Beta. Sono **due** ordini di lavoro da
// Beta, e ciascuno e' prima e ultima riga di se' stesso: con gli ancoraggi
// letti dal documento il materiale usciva due volte e il pezzo finito si
// caricava due volte. Gli estremi che contano sono quelli del **ciclo**.
function conDueTratte(over) {
  const app = conDb(over);
  app.eval(`db.workCenters.push({ id: 'tor', name: 'Tornitura', hourlyRate: 40, capacityHours: 0, active: true });
    getItem('perno').cycle = [
      { kind: 'item', itemId: 'tondo', qty: 2, costOverride: null },
      { kind: 'op', workCenterId: 'tor', supplierId: '', costMode: 'orario', cost: null, hours: 0.5, rate: 40, days: 0, note: '' },
      { kind: 'op', workCenterId: 'zin', supplierId: 'beta', costMode: 'fisso', cost: 3, hours: 0, rate: 0, days: 3, note: '' },
      { kind: 'op', workCenterId: 'tor', supplierId: '', costMode: 'orario', cost: null, hours: 0.2, rate: 40, days: 0, note: '' },
      { kind: 'op', workCenterId: 'zin', supplierId: 'beta', costMode: 'fisso', cost: 2, hours: 0, rate: 0, days: 2, note: '' },
    ];
    const riga = (id, key, desc) => ({ id, itemId: null, phaseKey: key, phaseKeys: key, code: 'PERNO',
      description: desc, uom: 'pz', qty: 4, price: 3, received: 0, deliveryDate: '', note: '' });
    db.orders.push({ id: 'w1', number: 'ODL-2026-001', title: '', date: '2026-07-01', status: 'confermato',
      supplierId: 'beta', transport: '', payment: '', rfqId: null, planId: null, jobId: null,
      supplierConfirmation: '', notes: '', notesInternal: '', active: true,
      lines: [riga('L1', 'perno#1#zin', 'Zincatura')] });
    db.orders.push({ id: 'w2', number: 'ODL-2026-002', title: '', date: '2026-07-10', status: 'confermato',
      supplierId: 'beta', transport: '', payment: '', rfqId: null, planId: null, jobId: null,
      supplierConfirmation: '', notes: '', notesInternal: '', active: true,
      lines: [riga('L2', 'perno#3#zin', 'Zincatura finale')] });
    invalidateCaches();`);
  return app;
}
// Registra un gesto passando dalla scheda vera: e' l'unico modo di verificare
// anche quale movimento la scheda decide di scrivere.
const gesto = (app, docId, lineId, verso, qta) => {
  app.eval(`clFromOdlModal('${docId}','${lineId}','${verso}')`);
  (qta || []).forEach((q, i) => { const el = app.el('cl-q-' + i); if (el) el.value = String(q); });
  app.eval(`saveClFromOdl('${docId}','${lineId}','${verso}')`);
  app.eval('invalidateCaches()');
};

describe('Conto lavoro: le tratte del ciclo', () => {
  const tratte = app => JSON.parse(app.eval(`JSON.stringify(clCycleRuns(getItem('perno'))
    .map(t => ({ from: t.from, to: t.to, sup: t.supplierId, est: t.esterna, passata: t.passata })))`));

  it('una fase interna in mezzo spezza le tratte dello stesso terzista', () => {
    assert.deepEqual(tratte(conDueTratte()), [
      { from: 0, to: 0, sup: '', est: false, passata: 0 },
      { from: 1, to: 1, sup: 'beta', est: true, passata: 0 },
      { from: 2, to: 2, sup: '', est: false, passata: 0 },
      { from: 3, to: 3, sup: 'beta', est: true, passata: 1 },
    ]);
  });

  it('le fasi consecutive dello stesso terzista fanno una tratta sola', () => {
    const app = conDueTratte();
    app.eval(`getItem('perno').cycle.splice(3, 1); invalidateCaches();`);   // via la fase interna in mezzo
    const t = tratte(app);
    assert.equal(t.length, 2, 'interna + una tratta esterna sola');
    assert.deepEqual(t[1], { from: 1, to: 2, sup: 'beta', est: true, passata: 0 },
      'le fasi 20 e 30 sono una commessa sola, non due');
  });

  it('un ciclo tutto interno non ha tratte esterne', () => {
    const app = conDueTratte();
    app.eval(`getItem('perno').cycle.forEach(r => { if (r.kind === 'op') r.supplierId = ''; }); invalidateCaches();`);
    assert.equal(app.eval("clExternalRuns(getItem('perno')).length"), 0);
    assert.equal(app.eval("clFirstExternalRun(getItem('perno')) === null"), true);
  });

  it('la passata conta solo lo stesso terzista, non tutte le tratte', () => {
    const app = conDueTratte();
    app.eval(`db.suppliers.push({ id: 'gamma', name: 'Gamma', active: true });
      getItem('perno').cycle[4].supplierId = 'gamma'; invalidateCaches();`);
    const est = tratte(app).filter(t => t.est);
    assert.deepEqual(est.map(t => [t.sup, t.passata]), [['beta', 0], ['gamma', 0]],
      'due terzisti diversi sono due prime passate');
  });
});

describe('Conto lavoro: il magazzino si muove ai due estremi del ciclo', () => {
  const ruolo = (app, docId, lineId) => JSON.parse(app.eval(`(() => {
    const o = clDocById(${JSON.stringify(docId)});
    const l = o.lines.find(x => x.id === ${JSON.stringify(lineId)});
    const r = clLineRole(o, l);
    return JSON.stringify({ out: r.out, dentro: r.in, outKind: r.outKind, inKind: r.inKind });
  })()`));

  it('la prima tratta scarica, la seconda no: in mezzo e un passaggio', () => {
    const app = conDueTratte();
    assert.deepEqual(ruolo(app, 'w1', 'L1'), { out: true, dentro: true, outKind: 'clOut', inKind: 'clStep' },
      'esce il materiale, ma il rientro non carica: il ciclo non e finito');
    assert.deepEqual(ruolo(app, 'w2', 'L2'), { out: true, dentro: true, outKind: 'clStep', inKind: 'clIn' },
      'riparte il pezzo, e il rientro dell ultima fase carica');
  });

  it('il materiale esce una volta e il pezzo si carica una volta', () => {
    const app = conDueTratte();
    app.eval("addMovement('tondo', 'carico', 20, 'giacenza iniziale'); invalidateCaches();");
    gesto(app, 'w1', 'L1', 'out', [8]);    // esce il tondo del ciclo
    gesto(app, 'w1', 'L1', 'in', [4]);     // tornano i perni, ma non a magazzino
    gesto(app, 'w2', 'L2', 'out', [4]);    // ripartono
    gesto(app, 'w2', 'L2', 'in', [4]);     // e adesso entrano

    approx(app.eval("onHandOf('tondo')"), 12, '20 meno gli 8 spediti, e una volta sola');
    approx(app.eval("onHandOf('perno')"), 4, 'quattro perni, non otto: il rientro di mezzo non carica');
  });

  it('i due gesti di mezzo sono passaggi, e non toccano la giacenza', () => {
    const app = conDueTratte();
    gesto(app, 'w1', 'L1', 'in', [4]);
    const m = app.snapshot().movements.filter(x => x.kind === 'clStep');
    assert.equal(m.length, 1);
    assert.equal(m[0].fromSupplierId, 'beta', 'viene dal terzista');
    assert.equal(m[0].supplierId, null, 'e torna da noi');
    approx(app.eval("onHandOf('perno')"), 0, 'un passaggio non e un carico');
  });

  it('fra le due tratte i pezzi non sono a magazzino ne da nessuno', () => {
    const app = conDueTratte();
    gesto(app, 'w1', 'L1', 'in', [4]);
    approx(app.eval("inWorkOf('perno')"), 4, 'sono in casa, fra due fasi');
    approx(app.eval("atSupplierOf('perno')"), 0, 'non sono presso un terzista');
    approx(app.eval("onHandOf('perno')"), 0, 'e non sono a magazzino');
    const p = prospetto(app).find(r => r.code === 'PERNO');
    assert.equal(p.sup, 'in casa, fra due fasi', 'il luogo ha un nome, o la riga non si sa leggere');
  });

  it('ripartendo, il saldo lascia il WIP e torna al terzista', () => {
    const app = conDueTratte();
    gesto(app, 'w1', 'L1', 'in', [4]);
    gesto(app, 'w2', 'L2', 'out', [4]);
    approx(app.eval("inWorkOf('perno')"), 0, 'non sono piu in casa');
    approx(app.eval("atSupplierOf('perno')"), 4, 'sono da Beta');
  });

  it('il filtro del magazzino trova anche quelli in lavorazione', () => {
    const app = conDueTratte();
    gesto(app, 'w1', 'L1', 'in', [4]);
    const passa = app.eval(`STOCK_STATE_FILTERS.terzi(stockState(getItem('perno')))`);
    assert.equal(passa, true, 'sono in giro: la domanda che li cerca e la stessa');
  });

  it('un ordine di lavoro vecchio, una riga per fase, conserva i suoi ancoraggi', () => {
    // Nessuna migrazione: le due fasi consecutive di una stessa tratta restano
    // in due righe, e i comandi stanno dove stavano.
    const app = conDb();
    app.eval(`getItem('perno').cycle = [
      { kind: 'item', itemId: 'tondo', qty: 2, costOverride: null },
      { kind: 'op', workCenterId: 'zin', supplierId: 'beta', costMode: 'fisso', cost: 3, hours: 0, rate: 0, days: 1, note: '' },
      { kind: 'op', workCenterId: 'zin', supplierId: 'beta', costMode: 'fisso', cost: 2, hours: 0, rate: 0, days: 1, note: '' },
    ];
    db.orders.push({ id: 'w9', number: 'ODL-2026-009', status: 'confermato', supplierId: 'beta',
      active: true, planId: null, jobId: null, lines: [
        { id: 'A', itemId: null, phaseKey: 'perno#0#zin', code: 'PERNO', description: 'f10', uom: 'pz', qty: 4, price: 3, received: 0 },
        { id: 'B', itemId: null, phaseKey: 'perno#1#zin', code: 'PERNO', description: 'f20', uom: 'pz', qty: 4, price: 2, received: 0 },
      ] });
    invalidateCaches();`);
    const r = id => JSON.parse(app.eval(`(() => { const o = clDocById('w9');
      const x = clLineRole(o, o.lines.find(y => y.id === '${id}'));
      return JSON.stringify({ out: x.out, dentro: x.in, outKind: x.outKind, inKind: x.inKind }); })()`));
    assert.deepEqual(r('A'), { out: true, dentro: false, outKind: 'clOut', inKind: 'clIn' });
    assert.deepEqual(r('B'), { out: false, dentro: true, outKind: 'clOut', inKind: 'clIn' });
  });
});

// L'app permette di mettere in un ordine di lavoro anche una fase che il
// ciclo fa in casa (odlPhasePickModal, "il ciclo la fa in casa: mettendola
// qui la si manda fuori questa volta") — un caso vero, non un errore da
// impedire. Prima di questo giro quella fase non coincideva mai con la prima
// o l'ultima tratta esterna del ciclo (non essendo affatto una tratta
// esterna), e restava sempre un passaggio: il pezzo usciva "sulla carta" ma
// il magazzino non si muoveva né alla spedizione né al rientro.
describe('Conto lavoro: mandare fuori apposta una fase che il ciclo fa in casa', () => {
  function conFaseInterna(over) {
    const app = conDb(over);
    app.eval(`getItem('perno').cycle = [
      { kind: 'item', itemId: 'tondo', qty: 2, costOverride: null },
      { kind: 'op', workCenterId: 'zin', supplierId: '', costMode: 'fisso', cost: 3, hours: 0.1, days: 0, note: '' },
    ];
    db.orders.push({ id: 'w3', number: 'ODL-2026-003', title: '', date: '2026-07-01', status: 'confermato',
      supplierId: 'beta', transport: '', payment: '', rfqId: null, planId: null, jobId: null,
      supplierConfirmation: '', notes: '', notesInternal: '', active: true,
      lines: [{ id: 'L3', itemId: null, phaseKey: 'perno#0#zin', phaseKeys: 'perno#0#zin', code: 'PERNO',
        description: 'Zincatura una tantum', uom: 'pz', qty: 4, price: 3, received: 0, deliveryDate: '', note: '' }] });
    invalidateCaches();`);
    return app;
  }
  const ruolo = (app, docId, lineId) => JSON.parse(app.eval(`(() => {
    const o = clDocById(${JSON.stringify(docId)});
    const l = o.lines.find(x => x.id === ${JSON.stringify(lineId)});
    const r = clLineRole(o, l);
    return JSON.stringify({ out: r.out, dentro: r.in, outKind: r.outKind, inKind: r.inKind });
  })()`));

  it('la fase interna mandata fuori muove il magazzino ai suoi due estremi', () => {
    const app = conFaseInterna();
    assert.deepEqual(ruolo(app, 'w3', 'L3'), { out: true, dentro: true, outKind: 'clOut', inKind: 'clIn' },
      'non è più un passaggio: il pezzo esce davvero e torna davvero');
  });

  it('spedizione e rientro caricano e scaricano come per una fase davvero esterna', () => {
    const app = conFaseInterna();
    app.eval("addMovement('tondo', 'carico', 20, 'giacenza iniziale'); invalidateCaches();");
    gesto(app, 'w3', 'L3', 'out', [8]);
    approx(app.eval("onHandOf('tondo')"), 12, 'il materiale del ciclo è uscito');
    gesto(app, 'w3', 'L3', 'in', [4]);
    approx(app.eval("onHandOf('perno')"), 4, 'i pezzi lavorati sono rientrati a magazzino');
  });

  it('una tratta genuinamente esterna del ciclo non cambia comportamento', () => {
    // Il caso ordinario, di sempre: una sola fase esterna nel ciclo è sia la
    // prima che l'ultima tratta, quindi carica e scarica già da prima di
    // questo fix — qui si conferma che non è cambiato.
    const app = conDb();
    app.eval(`db.orders.push({ id: 'w4', number: 'ODL-2026-004', status: 'confermato', supplierId: 'beta',
      active: true, planId: null, jobId: null,
      lines: [{ id: 'L4', itemId: null, phaseKey: 'perno#0#zin', code: 'PERNO', description: 'Zincatura',
        uom: 'pz', qty: 4, price: 3, received: 0 }] });
      invalidateCaches();`);
    assert.deepEqual(ruolo(app, 'w4', 'L4'), { out: true, dentro: true, outKind: 'clOut', inKind: 'clIn' });
  });

  it('la fase interna in mezzo a due tratte esterne resta un passaggio se nessuno la manda fuori apposta', () => {
    // Nessuna riga di documento la cita: clLineRole su di lei non si calcola
    // affatto, e le due tratte esterne del ciclo restano quelle di sempre.
    const app = conDueTratte();
    assert.deepEqual(ruolo(app, 'w1', 'L1'), { out: true, dentro: true, outKind: 'clOut', inKind: 'clStep' });
    assert.deepEqual(ruolo(app, 'w2', 'L2'), { out: true, dentro: true, outKind: 'clStep', inKind: 'clIn' });
  });
});

describe('Conto lavoro: una volta sola, per davvero', () => {
  // Il valore si legge dal disegno della scheda, non dall'elemento: il DOM
  // finto non ricostruisce gli elementi dall'innerHTML, e `cl-q-0` si porta
  // dietro il valore che gli aveva messo la scheda precedente.
  const proposta = app => {
    const h = app.eval('panelTop().innerHTML');
    const m = /id="cl-q-0"[^>]*value="([^"]*)"/.exec(h);
    return m ? m[1] : null;
  };

  it('la seconda apertura propone il residuo, non la quantita piena', () => {
    const app = conDueTratte();
    app.eval("addMovement('tondo', 'carico', 20, ''); invalidateCaches();");
    gesto(app, 'w1', 'L1', 'out', [8]);
    app.eval("clFromOdlModal('w1','L1','out')");
    assert.equal(proposta(app), '0', 'e gia uscito tutto: il residuo e zero');
  });

  it('e lo dice, invece di riproporre il modulo come se niente fosse', () => {
    const app = conDueTratte();
    app.eval("addMovement('tondo', 'carico', 20, ''); invalidateCaches();");
    gesto(app, 'w1', 'L1', 'out', [8]);
    app.eval("clFromOdlModal('w1','L1','out')");
    assert.match(app.eval('panelTop().innerHTML'), /già stato registrato tutto/);
  });

  it('una spedizione parziale lascia il resto, e la seconda volta lo propone', () => {
    const app = conDueTratte();
    app.eval("addMovement('tondo', 'carico', 20, ''); invalidateCaches();");
    gesto(app, 'w1', 'L1', 'out', [5]);
    app.eval("clFromOdlModal('w1','L1','out')");
    assert.equal(proposta(app), '3', '8 previsti meno 5 spediti');
  });

  it('superare il residuo si puo: dopo uno scarto capita', () => {
    const app = conDueTratte();
    app.eval("addMovement('tondo', 'carico', 20, ''); invalidateCaches();");
    gesto(app, 'w1', 'L1', 'out', [8]);
    gesto(app, 'w1', 'L1', 'out', [2]);
    approx(app.eval("onHandOf('tondo')"), 10, 'la rispedizione si registra, e non si perde');
  });

  it('il conto guarda la riga e il verso, non tutti i movimenti dell ordine', () => {
    const app = conDueTratte();
    app.eval("addMovement('tondo', 'carico', 20, ''); invalidateCaches();");
    gesto(app, 'w1', 'L1', 'out', [8]);
    const g = JSON.parse(app.eval(`(() => { const o = clDocById('w1');
      const l = o.lines[0];
      return JSON.stringify({ usciti: Array.from(clRegistrato(o, l, 'out').values()),
        rientrati: Array.from(clRegistrato(o, l, 'in').values()) }); })()`));
    assert.deepEqual(g, { usciti: [8], rientrati: [] });
  });
});
