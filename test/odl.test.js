// Ordini di lavoro (ODL): le lavorazioni affidate a un terzista sono un
// documento a sé, separato dagli ordini d'acquisto (ODA).
//
// Il punto di questi casi non e' che l'ODL funzioni — riusa la macchina dei
// documenti, gia' provata altrove — ma che le due cose restino **separate**:
// numerazione, elenco, e soprattutto quali righe possono finire in quale
// documento. La separazione e' facile da scrivere e facile da perdere, e la si
// perde in silenzio.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, parte, asm, comp, wc } = require('./fixtures.js');

function conDb(over) {
  const app = loadApp({ silent: true });
  app.asRole('admin');
  app.setDb(makeDb(Object.assign({
    suppliers: [
      { id: 'alfa', name: 'Alfa', defaultTransport: 'EXW', defaultPayment: 'Bonifico 30gg', active: true },
      { id: 'beta', name: 'Beta', active: true },
    ],
    workCenters: [wc('zin', 30)],
    items: [
      Object.assign(mat('tondo', 5), { uom: 'kg', supplierId: 'alfa',
        priceList: [{ id: 'q1', supplierId: 'alfa', price: 5, date: '2026-01-01' }], activePriceId: 'q1' }),
      parte('perno', { sourcing: 'make', uom: 'pz', cycle: [
        { kind: 'item', itemId: 'tondo', qty: 2 },
        { kind: 'op', workCenterId: 'zin', supplierId: 'beta', costMode: 'fisso', cost: 3, hours: 0.1, note: '' },
      ] }),
      asm('grp', 'gruppo', { components: [comp('perno', 3)] }),
    ],
    plans: [{ id: 'pl1', number: 'FAB-2026-001', title: 'Lotto', date: '2026-07-01', notes: '',
      lines: [{ id: 'l1', itemId: 'grp', qty: 2, dueDate: '2026-09-30' }], active: true, jobId: null }],
  }, over || {})));
  return app;
}
const snap = app => app.snapshot();

describe('ODL: una collezione sua', () => {
  it('e dichiarato nel registro dello schema, con la sua tabella figlia', () => {
    const app = conDb();
    const sch = JSON.parse(app.eval('JSON.stringify(Store.schema().workOrders)'));
    assert.equal(sch.table, 'work_orders');
    assert.equal(sch.children.lines.table, 'work_order_lines');
    assert.equal(sch.children.lines.merge, 'row', 'due persone che aggiungono una riga non sono in conflitto');
  });

  it('il giro verso la forma normalizzata e ritorno non perde niente', () => {
    const app = conDb();
    app.eval(`db.workOrders.push({ id: 'w1', number: 'ODL-2026-001', title: 'x', date: '2026-07-01',
      status: 'bozza', supplierId: 'beta', transport: '', payment: '', rfqId: null, planId: 'pl1',
      jobId: null, supplierConfirmation: '', notes: '', notesInternal: '', active: true,
      lines: [{ id: 'wl1', itemId: null, phaseKey: 'perno#0#zin', code: 'PERNO', description: 'Zincatura',
        uom: 'pz', qty: 6, price: 3, received: 0, deliveryDate: '2026-09-30', note: '' }] });`);
    const giro = JSON.parse(app.eval('JSON.stringify(nestDB(flattenDB(db)).workOrders)'));
    assert.deepEqual(giro, JSON.parse(app.eval('JSON.stringify(db.workOrders)')));
  });

  it('un database senza la collezione se la ritrova vuota al caricamento', () => {
    const app = loadApp({ silent: true });
    app.seedStorage({ schemaVersion: 2, items: [],
      settings: { currency: '€', uoms: [], concepts: [], mpFamiliesSeeded: true, partFamiliesSeeded: true } });
    app.ref('Store').load();
    assert.deepEqual(snap(app).workOrders, []);
  });

  it('le righe di un ODL non hanno mai un articolo, e la migrazione lo impone', () => {
    // E' la garanzia contro il doppio conteggio di magazzino: qui vale
    // all'ingresso, non solo per disciplina di chi scrive le righe.
    const app = loadApp({ silent: true });
    app.seedStorage({ schemaVersion: 2, items: [],
      workOrders: [{ id: 'w1', number: 'ODL-1', status: 'bozza', active: true,
        lines: [{ id: 'l', itemId: 'perno', phaseKey: 'perno#0#zin', qty: 1 }] }],
      settings: { currency: '€', uoms: [], concepts: [], mpFamiliesSeeded: true, partFamiliesSeeded: true } });
    app.ref('Store').load();
    assert.equal(snap(app).workOrders[0].lines[0].itemId, null);
  });
});

describe('ODL: numerazione e elenco separati', () => {
  it('la numerazione e sua: ODL-<anno>-NNN, indipendente dagli ODA', () => {
    const app = conDb();
    app.eval('newOrder(); newOrder(); newOdl();');
    const d = snap(app);
    assert.match(d.orders[0].number, /^ODA-\d{4}-001$/);
    assert.match(d.orders[1].number, /^ODA-\d{4}-002$/);
    assert.match(d.workOrders[0].number, /^ODL-\d{4}-001$/,
      'un ODL non deve continuare la serie degli ODA');
  });

  it('gli ODL non compaiono nell elenco degli ODA', () => {
    const app = conDb();
    app.eval('newOdl();');
    assert.equal(snap(app).orders.length, 0);
    assert.equal(snap(app).workOrders.length, 1);
  });

  it('la ricerca globale li distingue con la loro sigla', () => {
    const app = conDb();
    app.eval('newOrder(); newOdl();');
    const h = JSON.parse(app.eval("JSON.stringify(globalSearchHits('OD').map(x => x.tag))"));
    assert.ok(h.includes('ODA'));
    assert.ok(h.includes('ODL'));
  });

  it('la vista sta nel gruppo Documenti e non scrive fuori dal suo ruolo', () => {
    const app = conDb();
    assert.equal(app.eval("VIEW_AREA.odl"), 'docs');
    app.eval("setView('odl')");
    assert.ok(app.html('view-odl').includes('Ordini di lavoro'));
  });
});

describe('ODL: cosa puo contenere', () => {
  it('un ODL generato dal piano contiene solo lavorazioni', () => {
    const app = conDb();
    app.eval(`(() => {
      const p = getPlan('pl1');
      const g = mrpGroupBySupplier(planDocRows(p, 'odl')).find(x => x.supplierId === 'beta');
      planNewOdl(p, 'beta', g.rows); saveDB();
    })()`);
    const o = snap(app).workOrders[0];
    assert.equal(o.lines.length, 1);
    assert.equal(o.lines[0].phaseKey, 'perno#0#zin');
    assert.equal(o.lines[0].itemId, null);
    assert.equal(o.lines[0].code, 'PERNO');
    approx(o.lines[0].price, 3);
    assert.equal(o.planId, 'pl1', 'il legame col piano resta, come per gli ODA');
  });

  it('un ODA generato dallo stesso piano non contiene lavorazioni', () => {
    const app = conDb();
    app.eval(`(() => {
      const p = getPlan('pl1');
      const g = mrpGroupBySupplier(planDocRows(p, 'order')).find(x => x.supplierId === 'alfa');
      planNewOrder(p, 'alfa', g.rows); saveDB();
    })()`);
    const o = snap(app).orders[0];
    assert.ok(o.lines.every(l => !l.phaseKey), 'una lavorazione e finita in un ordine d acquisto');
    assert.equal(o.lines[0].code, 'TONDO');
  });

  it('il terzista non compare fra i gruppi di un ordine d acquisto', () => {
    const app = conDb();
    const sup = JSON.parse(app.eval(`JSON.stringify(mrpGroupBySupplier(planDocRows(getPlan('pl1'), 'order')).map(g => g.supplierId))`));
    assert.deepEqual(sup, ['alfa'], 'Beta fa solo lavorazioni: non ha niente da vendere qui');
  });
});

describe('ODL: dalla richiesta di offerta ai due ordini', () => {
  // Una richiesta puo' contenere insieme materiale e lavorazioni dello stesso
  // fornitore: chiedere quanto costa il pezzo e quanto costa lavorarlo e' una
  // domanda sola. Gli ordini invece sono due, e qui la richiesta si divide.
  const conRichiesta = (righe) => {
    const app = conDb();
    app.eval(`db.rfqs.push({ id: 'r1', number: 'RFQ-2026-001', title: 'Mista', date: '2026-07-01',
      status: 'inviata', supplierId: 'beta', transport: '', payment: '', planId: null, jobId: null,
      notes: '', notesInternal: '', active: true, lines: ${JSON.stringify(righe)} });`);
    return app;
  };
  const merce = { id: 'a', itemId: 'tondo', phaseKey: null, code: 'TONDO', description: 'Tondo', uom: 'kg', qty: 10, price: 5, deliveryDate: '', note: '' };
  const fase = { id: 'b', itemId: null, phaseKey: 'perno#0#zin', code: 'PERNO', description: 'Zincatura', uom: 'pz', qty: 6, price: 3, deliveryDate: '', note: '' };

  it('una richiesta mista produce un ODA e un ODL, senza perdere righe', () => {
    const app = conRichiesta([merce, fase]);
    app.eval("orderFromRfq('r1')");
    const d = snap(app);
    assert.equal(d.orders.length, 1);
    assert.equal(d.workOrders.length, 1);
    assert.deepEqual(d.orders[0].lines.map(l => l.code), ['TONDO']);
    assert.deepEqual(d.workOrders[0].lines.map(l => l.code), ['PERNO']);
    assert.equal(d.workOrders[0].lines[0].phaseKey, 'perno#0#zin');
    assert.equal(d.workOrders[0].lines[0].itemId, null);
  });

  it('i due documenti citano la richiesta e portano le sue condizioni', () => {
    const app = conRichiesta([merce, fase]);
    app.eval("orderFromRfq('r1')");
    const d = snap(app);
    assert.equal(d.orders[0].rfqId, 'r1');
    assert.equal(d.workOrders[0].rfqId, 'r1');
    assert.equal(d.workOrders[0].supplierId, 'beta');
    assert.notEqual(d.orders[0].id, d.workOrders[0].id);
  });

  it('una richiesta di sole lavorazioni non genera nessun ordine d acquisto', () => {
    const app = conRichiesta([fase]);
    app.eval("orderFromRfq('r1')");
    assert.equal(snap(app).orders.length, 0);
    assert.equal(snap(app).workOrders.length, 1);
  });

  it('una richiesta di sola merce si comporta come sempre', () => {
    const app = conRichiesta([merce]);
    app.eval("orderFromRfq('r1')");
    assert.equal(snap(app).orders.length, 1);
    assert.equal(snap(app).workOrders.length, 0);
  });

  it('la richiesta si chiude una volta sola, anche generando due documenti', () => {
    const app = conRichiesta([merce, fase]);
    app.eval("orderFromRfq('r1')");
    assert.equal(snap(app).rfqs[0].status, 'chiusa');
  });
});

describe('ODL: il magazzino e le commesse', () => {
  const conOdl = (received) => {
    const app = conDb();
    app.eval(`db.workOrders.push({ id: 'w1', number: 'ODL-2026-001', title: '', date: '2026-07-01',
      status: 'confermato', supplierId: 'beta', transport: '', payment: '', rfqId: null, planId: 'pl1',
      jobId: null, supplierConfirmation: '', notes: '', notesInternal: '', active: true,
      lines: [{ id: 'wl1', itemId: null, phaseKey: 'perno#0#zin', code: 'PERNO', description: 'Zincatura',
        uom: 'pz', qty: 6, price: 3, received: ${received}, deliveryDate: '2026-09-30', note: '' }] });
      invalidateCaches();`);
    return app;
  };

  it('un ODL non carica il magazzino, nemmeno tutto rientrato', () => {
    const app = conOdl(6);
    approx(app.eval("onHandOf('perno')"), 0);
    approx(app.eval("incomingOf('perno')"), 0);
  });

  it('ma il rientro porta comunque l ODL a evaso', () => {
    const app = conOdl(6);
    assert.equal(app.eval(`(() => { const o = db.workOrders[0]; ordAutoStatus(o); return o.status; })()`), 'evaso');
  });

  it('i movimenti di conto lavoro trovano l ODL come documento', () => {
    const app = conOdl(0);
    app.eval("addMovement('tondo','clOut',-12,'',{supplierId:'beta',orderId:'w1',lineId:'wl1'}); invalidateCaches();");
    const r = JSON.parse(app.eval('JSON.stringify(atSupplierRows().map(x => ({ sup: x.supplierName, ordini: x.ordini })))'));
    assert.deepEqual(r, [{ sup: 'Beta', ordini: ['ODL-2026-001'] }]);
  });

  it('la commessa vede i suoi ordini di lavoro e li conta nell impegnato', () => {
    const app = conOdl(0);
    app.eval(`db.jobs = db.jobs || []; db.jobs.push({ id: 'j1', number: 'COM-2026-001', customer: 'Rossi', title: '', status: 'aperta',
      date: '2026-07-01', dueDate: '', notes: '', active: true });
      getPlan('pl1').jobId = 'j1';`);
    const d = JSON.parse(app.eval("JSON.stringify({ n: jobDocs('j1').workOrders.length, t: jobTotals('j1') })"));
    assert.equal(d.n, 1);
    approx(d.t.ordinato, 18, '6 pezzi x 3 euro');
    assert.equal(d.t.ordini, 1);
  });

  it('una commessa che regge un ODL non si elimina', () => {
    const app = conOdl(0);
    app.eval(`db.jobs = db.jobs || []; db.jobs.push({ id: 'j1', number: 'COM-2026-001', customer: 'Rossi', title: '', status: 'aperta',
      date: '2026-07-01', dueDate: '', notes: '', active: true });
      db.workOrders[0].jobId = 'j1'; getPlan('pl1').jobId = null;`);
    app.eval("delJob('j1')");
    assert.equal(snap(app).jobs.length, 1, 'la commessa e stata eliminata lasciando un ODL orfano');
  });
});

describe('ODL: elenco ed export', () => {
  it('l export dell elenco legge gli ODL, non le richieste', () => {
    const app = conDb();
    app.eval('newOdl(); newRfq();');
    const spec = JSON.parse(app.eval('JSON.stringify(odlListExportSpec())'));
    assert.equal(spec.titolo, 'Ordini di lavoro');
    assert.equal(spec.slug, 'ordini_di_lavoro');
    assert.equal(spec.sezioni[0].righe.length, 1, 'una richiesta si e infilata fra gli ordini di lavoro');
    assert.match(spec.sezioni[0].righe[0][0], /^ODL-/);
  });

  it('le colonne parlano di lavorazioni, non di merce', () => {
    const spec = JSON.parse(conDb().eval('JSON.stringify(odlListExportSpec())'));
    const h = spec.sezioni[0].colonne.map(c => c.h);
    assert.ok(h.includes('Terzista'));
    assert.ok(h.includes('Lavorazioni'));
    assert.ok(h.includes('Rientrati'));
  });

  it('chiudere un ODL torna al suo elenco, non a quello degli ODA', () => {
    const app = conDb();
    app.eval("newOrder(); newOdl(); odlBackToList();");
    assert.equal(app.eval('odlView'), 'list');
    assert.equal(app.eval('currentOdlId'), null);
    assert.equal(app.eval('orderView'), 'edit', "l'ordine d'acquisto aperto non e stato toccato");
  });

  it('i filtri dell elenco sono suoi e non toccano quelli degli ODA', () => {
    const app = conDb();
    app.eval("docFilters.odl.status = 'evaso';");
    assert.equal(app.eval("docFilters.order.status"), '');
  });
});

// ══════════════════════════════════════════════════════════════
//  Un ordine di lavoro scritto a mano, partendo dal ciclo
// ══════════════════════════════════════════════════════════════
// Commissionare una lavorazione fuori piano e' il caso normale: un pezzo
// urgente, un ripasso, una prova. Prima l'unico modo era la riga manuale —
// testo libero, senza `phaseKey` e quindi senza tariffa dal ciclo e senza i
// comandi del conto lavoro. La prova che conta e' che la riga scritta a mano
// sia **identica** a quella generata dal fabbisogno.
describe('ODL a mano: la lavorazione viene dal ciclo', () => {
  const conOdlVuoto = app => app.eval(`(() => {
    const o = { id: 'wm', number: 'ODL-2026-050', title: '', date: '2026-07-01', status: 'bozza',
      supplierId: 'beta', transport: '', payment: '', rfqId: null, planId: null, jobId: null,
      supplierConfirmation: '', notes: '', notesInternal: '', active: true, lines: [] };
    db.workOrders.push(o); currentOdlId = 'wm'; odlView = 'edit'; invalidateCaches(); return o.id;
  })()`);
  const righeDa = (app, scelte, pezzi, due) => JSON.parse(app.eval(
    `JSON.stringify(odlPhaseLines(${JSON.stringify(scelte)}, () => ${pezzi}, ${JSON.stringify(due || '')}))`));

  it('si scelgono solo gli articoli che una lavorazione ce l hanno', () => {
    const app = conDb();
    conOdlVuoto(app);
    app.eval("odlAddPhaseModal('wm')");
    const h = app.eval('panelTop().innerHTML');
    assert.match(h, /PERNO/, 'il perno ha un ciclo');
    assert.ok(!/value="tondo"/.test(h), 'una materia prima non ha fasi da commissionare');
  });

  it('la riga scritta a mano ha la stessa forma di quella generata dal piano', () => {
    const app = conDb();
    conOdlVuoto(app);
    const aMano = righeDa(app, ['perno#0'], 6, '2026-09-30')[0];
    const daPiano = JSON.parse(app.eval(`(() => {
      const p = getPlan('pl1');
      const g = planDocGroups(planDocRows(p, 'odl'), 'odl')[0];
      return JSON.stringify(planOdlLine(g.rows[0]));
    })()`));
    const senzaId = x => { const y = Object.assign({}, x); delete y.id; return y; };
    assert.deepEqual(senzaId(aMano), senzaId(daPiano),
      'una riga a mano che si comportasse diversamente sarebbe una seconda specie di riga');
  });

  it('itemId resta nullo: la garanzia contro il doppio conteggio vale anche qui', () => {
    const app = conDb();
    conOdlVuoto(app);
    assert.equal(righeDa(app, ['perno#0'], 4)[0].itemId, null);
  });

  it('i comandi del conto lavoro compaiono sulla riga scritta a mano', () => {
    const app = conDb();
    conOdlVuoto(app);
    app.eval(`getOdl('wm').lines = odlPhaseLines(['perno#0'], () => 4, ''); invalidateCaches();`);
    app.eval("setView('odl')");
    const h = app.html('view-odl');
    // In bozza la lavorazione non parte: lo dice, invece del comando.
    assert.match(h, /segnalo come inviato/);
    app.eval(`getOdl('wm').status = 'inviato'; renderOdl();`);
    assert.match(app.html('view-odl'), /plandoc-link[^>]*>avvia</);
  });

  it('le fasi interne e quelle di un altro terzista si vedono, marcate', () => {
    const app = conDb();
    app.eval(`getItem('perno').cycle.push({ kind: 'op', workCenterId: 'zin', supplierId: '',
      costMode: 'orario', cost: null, hours: 0.4, rate: 30, days: 0, note: '' }); invalidateCaches();`);
    conOdlVuoto(app);
    app.eval("odlPhasePickModal('wm', ['perno'])");
    const h = app.eval('panelTop().innerHTML');
    assert.match(h, /interna/, 'mandare fuori una fase interna e un caso vero, e si segnala');
    assert.equal((h.match(/class="odl-fase"/g) || []).length, 2, 'due tratte, tutte e due scegliibili');
  });

  it('l ordine scritto a mano non e legato a nessun piano', () => {
    const app = conDb();
    conOdlVuoto(app);
    app.eval(`getOdl('wm').lines = odlPhaseLines(['perno#0'], () => 4, ''); saveDB(); invalidateCaches();`);
    assert.equal(app.snapshot().workOrders[0].planId, null);
    const chiavi = JSON.parse(app.eval("JSON.stringify(Array.from(planDocumentedKeys('pl1').keys()))"));
    assert.deepEqual(chiavi, [], 'il fabbisogno non lo conta: il legame lo da la generazione, non questa scheda');
  });

  it('zero pezzi non produce una riga', () => {
    const app = conDb();
    conOdlVuoto(app);
    assert.deepEqual(righeDa(app, ['perno#0'], 0), []);
  });
});
