// Avvia e dichiara sulla riga dell'ordine di lavoro (dalla 0.116.0).
//
// Gli stessi due gesti dell'ordine di produzione, qualunque sia l'origine della
// riga. Tre cose vanno provate, e sono quelle che a occhio non si vedono.
//
// La prima: **un solo padrone per tratta**. Se a monte c'è un ODP — perché la
// riga viene da lui, o perché il piano che ha generato la riga ne ha lanciato
// uno — avvia e dichiara scrivono sulle sue fasi, e l'ODL non può far uscire il
// materiale una seconda volta. Prima l'ODL del fabbisogno poteva farlo.
//
// La seconda: senza ODP la riga ha eventi suoi, e i movimenti sono quelli di
// sempre ai due estremi del ciclo — escono i materiali all'avvio della prima
// tratta, entra il codice parte al rientro dell'ultima, in mezzo passaggi.
//
// La terza: i dati di prima continuano a contare senza migrazione, e una riga
// partita da sola prima del lancio dell'ODP passa all'ODP senza rifare niente.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, parte, wc } = require('./fixtures.js');

const fase = (wcId, supplierId) => ({ kind: 'op', workCenterId: wcId, supplierId: supplierId || '',
  costMode: 'fisso', cost: 3, hours: 0, rate: 0, days: 1, note: '' });

function conDb() {
  const app = loadApp({ silent: true });
  app.asRole('admin');
  app.setDb(makeDb({
    suppliers: [{ id: 'beta', name: 'Beta', active: true }],
    workCenters: [wc('tor', 40), wc('zin', 30), wc('fre', 35)],
    items: [
      Object.assign(mat('tondo', 5), { uom: 'kg' }),
      // Una tratta sola dal terzista: esce e rientra sulla stessa riga.
      parte('perno', { uom: 'pz', cycle: [{ kind: 'item', itemId: 'tondo', qty: 2 }, fase('zin', 'beta')] }),
      // 10 interna, 20 Beta, 30 interna, 40 Beta: due tratte, due ordini.
      parte('boccola', { uom: 'pz', cycle: [{ kind: 'item', itemId: 'tondo', qty: 2 },
        fase('tor'), fase('zin', 'beta'), fase('tor'), fase('zin', 'beta')] }),
      // 10 e 20 da Beta, una dopo l'altra: una tratta di due fasi.
      parte('albero', { uom: 'pz', cycle: [{ kind: 'item', itemId: 'tondo', qty: 2 },
        fase('zin', 'beta'), fase('fre', 'beta')] }),
    ],
    plans: [{ id: 'pl1', number: 'FAB-2026-001', title: 'Lotto', date: '2026-07-01', notes: '',
      lines: [], active: true, jobId: null }],
  }));
  app.eval("addMovement('tondo', 'carico', 100, 'giacenza iniziale'); invalidateCaches();");
  return app;
}
// Un ordine di lavoro con le tratte scelte (`perno#0` = parte#prima fase).
function odl(app, id, scelte, pezzi, over) {
  app.eval(`db.workOrders.push(Object.assign({ id: ${JSON.stringify(id)}, number: 'ODL-2026-0' + (db.workOrders.length + 1),
    title: '', date: '2026-07-01', status: 'inviato', supplierId: 'beta', transport: '', payment: '',
    rfqId: null, planId: null, jobId: null, supplierConfirmation: '', notes: '', notesInternal: '', active: true,
    lines: odlPhaseLines(${JSON.stringify(scelte)}, () => ${pezzi}, '') }, ${JSON.stringify(over || {})}));
    invalidateCaches();`);
  return app.eval(`getOdl(${JSON.stringify(id)}).lines[0].id`);
}
const riga = (app, docId) => JSON.parse(app.eval(`JSON.stringify(getOdl(${JSON.stringify(docId)}).lines[0])`));
const avvia = (app, docId, lineId, opz) => app.eval(`odlAvvia(${JSON.stringify(docId)}, ${JSON.stringify(lineId)}, ${JSON.stringify(opz || {})})`);
const dichiara = (app, docId, lineId, dati) => app.eval(`odlDichiara(${JSON.stringify(docId)}, ${JSON.stringify(lineId)}, ${JSON.stringify(dati)})`);
const onHand = (app, itemId) => Number(app.eval(`(invalidateCaches(), onHandOf(${JSON.stringify(itemId)}))`));
const movimenti = app => JSON.parse(app.eval(`JSON.stringify((db.movements || []).filter(m => m.kind !== 'carico')
  .map(m => ({ item: m.itemId, kind: m.kind, qty: m.qty, sup: m.supplierId, da: m.fromSupplierId, decl: !!m.declId })))`));
const avanzamento = (app, docId) => app.eval(`(function(){ const o = getOdl(${JSON.stringify(docId)}); return odlAvanzamentoRiga(o, o.lines[0]); })()`);
const azioni = (app, docId) => app.eval(`(function(){ const o = getOdl(${JSON.stringify(docId)}); return odlLineActions(o, o.lines[0]); })()`);

// Un ordine di produzione dal piano pl1, lanciato o in bozza.
function odp(app, partId, qty, lancia) {
  return app.eval(`(function () {
    const part = getItem(${JSON.stringify(partId)});
    const o = { id: 'odp-' + part.id, number: 'ODP-2026-001', itemId: part.id,
      code: part.code, name: part.name, uom: itemUom(part), qty: ${qty},
      date: '2026-07-01', dueDate: '2026-09-30', status: 'bozza', title: '',
      notes: '', notesInternal: '', planId: 'pl1', jobId: null,
      phases: opFreezePhases(part), materials: opFreezeMaterials(part, ${qty}), active: true };
    db.prodOrders.push(o); invalidateCaches();
    if (${!!lancia}) opLancia(o.id);
    return o.id;
  })()`);
}

describe('ODL senza ODP: avvia e dichiara sulla riga', () => {
  it('avviare fa uscire il materiale del ciclo verso il terzista, una volta', () => {
    const app = conDb();
    const l = odl(app, 'w1', ['perno#0'], 4);
    assert.equal(avvia(app, 'w1', l), true);
    approx(onHand(app, 'tondo'), 92, '2 kg a pezzo per 4 pezzi');
    assert.deepEqual(movimenti(app), [{ item: 'tondo', kind: 'clOut', qty: -8, sup: 'beta', da: null, decl: true }]);
    assert.equal(avanzamento(app, 'w1'), 'lavorazione');
    assert.equal(avvia(app, 'w1', l), false, 'una riga avviata non si riavvia');
    approx(onHand(app, 'tondo'), 92, 'e il materiale non esce di nuovo');
  });

  it('dichiarare carica i buoni, conta gli scarti come tornati e porta l\'ordine a evaso', () => {
    const app = conDb();
    const l = odl(app, 'w1', ['perno#0'], 4);
    avvia(app, 'w1', l);
    assert.equal(dichiara(app, 'w1', l, { qty: 2 }), true);
    assert.equal(riga(app, 'w1').received, 2);
    assert.equal(app.eval("getOdl('w1').status"), 'parziale');
    assert.equal(dichiara(app, 'w1', l, { qty: 1, scrap: 1 }), true);
    approx(onHand(app, 'perno'), 3, 'entrano i buoni, non gli scarti');
    assert.equal(riga(app, 'w1').received, 4, '3 buoni e 1 scarto: il terzista non ha più niente');
    assert.equal(app.eval("getOdl('w1').status"), 'evaso');
    assert.equal(avanzamento(app, 'w1'), 'fatto');
  });

  it('non si dichiara prima di avviare, e non si avvia in bozza', () => {
    const app = conDb();
    const l = odl(app, 'w1', ['perno#0'], 4, { status: 'bozza' });
    assert.equal(dichiara(app, 'w1', l, { qty: 4 }), false);
    assert.equal(avvia(app, 'w1', l), false, 'in bozza l\'ordine non è arrivato al terzista');
    assert.match(azioni(app, 'w1'), /segnalo come inviato/);
    assert.deepEqual(movimenti(app), []);
  });

  it('due tratte: il materiale esce alla prima, il codice si carica alla seconda, in mezzo passaggi', () => {
    const app = conDb();
    const l1 = odl(app, 'w1', ['boccola#1'], 4);
    const l2 = odl(app, 'w2', ['boccola#3'], 4);
    avvia(app, 'w1', l1);
    dichiara(app, 'w1', l1, { qty: 4 });
    approx(onHand(app, 'boccola'), 0, 'il rientro di mezzo non carica');
    approx(Number(app.eval("inWorkOf('boccola')")), 4, 'sono in casa, fra due fasi');
    avvia(app, 'w2', l2);
    approx(Number(app.eval("atSupplierOf('boccola')")), 4, 'ripartiti verso Beta');
    dichiara(app, 'w2', l2, { qty: 4 });
    approx(onHand(app, 'tondo'), 92, 'il materiale esce una volta sola');
    approx(onHand(app, 'boccola'), 4, 'e il pezzo si carica una volta sola');
    assert.deepEqual(movimenti(app).map(m => m.kind), ['clOut', 'clStep', 'clStep', 'clIn']);
  });

  it('una riga scritta a mano, senza ciclo, si avvia e si dichiara senza magazzino', () => {
    const app = conDb();
    app.eval(`db.workOrders.push({ id: 'wm', number: 'ODL-2026-009', status: 'confermato', supplierId: 'beta',
      active: true, planId: null, jobId: null, lines: [{ id: 'm1', itemId: null, phaseKey: null, code: 'X',
      description: 'Sabbiatura a corpo', uom: 'pz', qty: 5, price: 2, received: 0 }] }); invalidateCaches();`);
    assert.match(azioni(app, 'wm'), /odlAvviaModal/);
    assert.equal(avvia(app, 'wm', 'm1'), true);
    assert.equal(dichiara(app, 'wm', 'm1', { qty: 5 }), true);
    assert.equal(riga(app, 'wm').received, 5);
    assert.deepEqual(movimenti(app), []);
  });

  it('annullare toglie i movimenti dell\'evento, e l\'avvio solo dopo i rientri', () => {
    const app = conDb();
    const l = odl(app, 'w1', ['perno#0'], 4);
    avvia(app, 'w1', l);
    dichiara(app, 'w1', l, { qty: 3 });
    const ev = JSON.parse(app.eval(`JSON.stringify(odlEventiRiga(getOdl('w1'), getOdl('w1').lines[0]).map(d => ({ id: d.id, kind: d.kind })))`));
    assert.deepEqual(ev.map(e => e.kind), ['avvio', 'avanzamento']);
    assert.equal(app.eval(`odlAnnullaEvento(${JSON.stringify(ev[0].id)})`), false, 'prima i rientri');
    assert.equal(app.eval(`odlAnnullaEvento(${JSON.stringify(ev[1].id)})`), true);
    approx(onHand(app, 'perno'), 0);
    assert.equal(riga(app, 'w1').received, 0);
    assert.equal(app.eval(`odlAnnullaEvento(${JSON.stringify(ev[0].id)})`), true);
    approx(onHand(app, 'tondo'), 100, 'il materiale torna a scaffale');
    assert.equal(avanzamento(app, 'w1'), '');
  });

  it('una riga avviata non si elimina, e l\'ordine nemmeno', () => {
    const app = conDb();
    const l = odl(app, 'w1', ['perno#0'], 4);
    avvia(app, 'w1', l);
    app.eval(`odlDelLine('w1', ${JSON.stringify(l)})`);
    assert.equal(app.eval("getOdl('w1').lines.length"), 1);
  });

  it('«dichiara tutto rientrato» dichiara il residuo delle righe avviate, e solo quelle', () => {
    const app = conDb();
    const l = odl(app, 'w1', ['perno#0', 'albero#0'], 4);
    avvia(app, 'w1', l);
    assert.equal(app.eval("odlMarkAllReceived('w1')"), true);
    const r = JSON.parse(app.eval("JSON.stringify(getOdl('w1').lines.map(x => x.received))"));
    assert.deepEqual(r, [4, 0], 'la riga non avviata resta da avviare');
    approx(onHand(app, 'perno'), 4, 'e il rientro ha caricato il magazzino');
  });

  it('dal telefono si ricevono solo le righe avviate, e il rientro muove il magazzino', () => {
    const app = conDb();
    const l = odl(app, 'w1', ['perno#0', 'albero#0'], 4);
    avvia(app, 'w1', l);
    const ids = JSON.parse(app.eval("JSON.stringify(qrRigheDaRicevere('odl', getOdl('w1')).map(x => x.id))"));
    assert.deepEqual(ids, [l]);
    app.eval(`qrRiceviRighe('odl', 'w1', { ${JSON.stringify(l)}: 3 })`);
    approx(onHand(app, 'perno'), 3);
    assert.equal(riga(app, 'w1').received, 3);
  });

  it('i movimenti registrati con i comandi di prima contano come un avvio', () => {
    const app = conDb();
    const l = odl(app, 'w1', ['perno#0'], 4);
    app.eval(`addMovement('tondo', 'clOut', -8, '', { orderId: 'w1', lineId: ${JSON.stringify(l)}, supplierId: 'beta' }); invalidateCaches();`);
    assert.equal(app.eval("odlRigaAvviata(getOdl('w1'), getOdl('w1').lines[0])"), true);
    assert.equal(avvia(app, 'w1', l), false, 'il materiale non esce una seconda volta');
    assert.equal(dichiara(app, 'w1', l, { qty: 4 }), true);
  });

  it('le schede di prima non scrivono più sull\'ordine di lavoro', () => {
    const app = conDb();
    const l = odl(app, 'w1', ['perno#0'], 4);
    app.eval(`saveClFromOdl('w1', ${JSON.stringify(l)}, 'out')`);
    assert.deepEqual(movimenti(app), []);
  });
});

describe('ODL da un ODP: avvia e dichiara sono le sue fasi', () => {
  const conOdp = () => {
    const app = conDb();
    odp(app, 'albero', 10, true);
    app.eval(`(function(){ const o = getOdp('odp-albero'); opGeneraOdl(o.id, o.phases[0].id); invalidateCaches(); })()`);
    app.eval("db.workOrders[0].status = 'inviato'; invalidateCaches();");
    return app;
  };
  const wId = app => app.eval('db.workOrders[0].id');

  it('i comandi aprono le schede dell\'ODP, e il mutatore della riga rifiuta', () => {
    const app = conOdp();
    const w = wId(app);
    const h = azioni(app, w);
    assert.match(h, /odlAvviaModal/);
    assert.match(h, /ODP-2026-001 › fase 10-20/);
    assert.equal(avvia(app, w, app.eval('db.workOrders[0].lines[0].id')), false);
    app.eval(`odlAvviaModal(${JSON.stringify(w)}, db.workOrders[0].lines[0].id)`);
    assert.match(app.eval('panelTop().innerHTML'), /Avvia la fase 10/);
  });

  it('una dichiarazione dalla riga fa avanzare tutta la tratta, e scrive i rientrati', () => {
    const app = conOdp();
    app.eval("(function(){ const o = getOdp('odp-albero'); opAvvia(o.id, o.phases[0].id); })()");
    approx(onHand(app, 'tondo'), 80, 'esce il materiale dell\'ODP, una volta');
    const ok = app.eval("(function(){ const o = getOdp('odp-albero'); return opDichiaraTratta(o.id, o.phases[0].id, { qty: 7, scrap: 1 }); })()");
    assert.equal(ok, true);
    const f = JSON.parse(app.eval(`(function(){ const o = getOdp('odp-albero');
      return JSON.stringify(o.phases.map(x => ({ fatti: opFatti(o, x), scarti: opScarti(o, x), st: opStatoFase(o, x) }))); })()`));
    assert.deepEqual(f, [{ fatti: 8, scarti: 0, st: 'corso' }, { fatti: 7, scarti: 1, st: 'corso' }],
      'la 20 non è chiusa finché la 10 aspetta ancora 2 pezzi');
    assert.equal(Number(app.eval('db.workOrders[0].lines[0].received')), 8, 'buoni e scarti tornati');
    assert.equal(avanzamento(app, wId(app)), 'lavorazione');
    app.eval("(function(){ const o = getOdp('odp-albero'); opDichiaraTratta(o.id, o.phases[0].id, { qty: 2 }); })()");
    approx(onHand(app, 'albero'), 9, 'i buoni a fine ciclo entrano a magazzino');
    assert.equal(app.eval("getOdp('odp-albero').status"), 'completato');
    assert.equal(avanzamento(app, wId(app)), 'fatto');
    assert.equal(app.eval('db.workOrders[0].status'), 'evaso');
  });
});

describe('ODL dal fabbisogno, con un ODP dello stesso piano', () => {
  // La riga del piano: le chiavi delle fasi dell'albero, nessun odpId.
  const odlDalPiano = app => {
    app.eval(`(function(){ const part = getItem('albero');
      const chiavi = opFreezePhases(part).map(f => f.phaseKey);
      db.workOrders.push({ id: 'wp', number: 'ODL-2026-020', title: '', date: '2026-07-01', status: 'inviato',
        supplierId: 'beta', transport: '', payment: '', rfqId: null, planId: 'pl1', jobId: null,
        supplierConfirmation: '', notes: '', notesInternal: '', active: true,
        lines: [{ id: 'lp', itemId: null, phaseKey: chiavi[0], phaseKeys: chiavi.join(','), code: part.code,
          description: 'Zincatura e fresatura', uom: 'pz', qty: 10, price: 6, received: 0, deliveryDate: '', note: '' }] });
      invalidateCaches(); })()`);
  };

  it('con l\'ODP lanciato il materiale non esce due volte', () => {
    const app = conDb();
    odp(app, 'albero', 10, true);
    odlDalPiano(app);
    assert.equal(avvia(app, 'wp', 'lp'), false, 'il padrone è l\'ODP');
    assert.match(azioni(app, 'wp'), /ODP-2026-001/);
    app.eval("saveClFromOdl('wp', 'lp', 'out')");
    approx(onHand(app, 'tondo'), 100, 'nemmeno dalla scheda di prima');
    app.eval("(function(){ const o = getOdp('odp-albero'); opAvvia(o.id, o.phases[0].id); })()");
    approx(onHand(app, 'tondo'), 80);
    app.eval("(function(){ const o = getOdp('odp-albero'); opDichiaraTratta(o.id, o.phases[0].id, { qty: 10 }); })()");
    assert.equal(Number(app.eval("getOdl('wp').lines[0].received")), 10, 'i rientrati li scrive l\'ODP');
  });

  it('una riga partita prima del lancio passa all\'ODP, senza rifare niente', () => {
    const app = conDb();
    odlDalPiano(app);
    assert.equal(avvia(app, 'wp', 'lp'), true, 'senza ODP il padrone è la riga');
    dichiara(app, 'wp', 'lp', { qty: 4 });
    approx(onHand(app, 'tondo'), 80);
    odp(app, 'albero', 10, false);
    assert.equal(avvia(app, 'wp', 'lp'), false, 'già avviata');
    assert.equal(dichiara(app, 'wp', 'lp', { qty: 2 }), true, 'con l\'ODP in bozza la riga resta sua');
    app.eval("opLancia('odp-albero')");
    const st = JSON.parse(app.eval(`(function(){ const o = getOdp('odp-albero');
      return JSON.stringify({ status: o.status, fasi: o.phases.map(x => ({ avviata: opAvviata(o, x), fatti: opFatti(o, x) })),
        resto: opMaterialeResiduo(o).map(m => m.residuo), suoi: (db.prodDecls || []).filter(d => d.odlId).length }); })()`));
    assert.equal(st.status, 'corso');
    assert.deepEqual(st.fasi, [{ avviata: true, fatti: 6 }, { avviata: true, fatti: 6 }]);
    assert.deepEqual(st.resto, [0], 'il materiale è già uscito: l\'ODP non lo ripropone');
    assert.equal(st.suoi, 0, 'gli eventi sono passati all\'ODP');
    approx(onHand(app, 'tondo'), 80, 'e non è uscito di nuovo');
    approx(onHand(app, 'albero'), 6);
    assert.equal(Number(app.eval("getOdl('wp').lines[0].received")), 6);
    const n = Number(app.eval('db.prodDecls.length'));
    assert.equal(app.eval("opRilevaOdl(getOdp('odp-albero'))"), false, 'presa una volta, non si riprende');
    assert.equal(Number(app.eval('db.prodDecls.length')), n);
    app.eval("(function(){ const o = getOdp('odp-albero'); opDichiaraTratta(o.id, o.phases[0].id, { qty: 4 }); })()");
    approx(onHand(app, 'albero'), 10);
    assert.equal(app.eval("getOdp('odp-albero').status"), 'completato');
  });
});

describe('ODL: il Gantt dell\'avanzamento e il database', () => {
  it('una fase esterna senza ODP è in lavorazione appena la riga è avviata', () => {
    const app = conDb();
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'views-avanzamento.js'), 'utf8');
    assert.match(src, /const ini = iniziato \|\| odlAvviato;/);
    const l = odl(app, 'w1', ['perno#0'], 4);
    assert.equal(avanzamento(app, 'w1'), '');
    avvia(app, 'w1', l);
    assert.equal(avanzamento(app, 'w1'), 'lavorazione');
  });

  it('avvii e rientri della riga hanno le loro colonne nel database condiviso', () => {
    const sql = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
    assert.match(sql, /alter table public\.production_declarations add column if not exists odl_id uuid;/);
    assert.match(sql, /alter table public\.production_declarations add column if not exists odl_line_id uuid;/);
    const app = conDb();
    assert.equal(app.eval("cloudType('production_declarations', 'odlId')"), 'uuid');
    assert.equal(app.eval("cloudType('production_declarations', 'odlLineId')"), 'uuid');
    assert.equal(app.eval("camelToSnake('odlLineId')"), 'odl_line_id');
  });
});
