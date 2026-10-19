// Ordini di produzione (ODP): la successione delle fasi, e il magazzino.
//
// Due cose vanno provate qui, e sono quelle che a occhio non si vedono.
//
// La prima è la **successione**: una fase non parte se la precedente non è
// chiusa, e quando l'app rifiuta deve dire *quale* fase la blocca — un rifiuto
// muto manda a cercare per mezz'ora.
//
// La seconda è la regola del magazzino, che si legge in tre casi e deve valere
// in tutti e tre con lo stesso codice: **escono i codici del ciclo alla prima
// fase, entra il codice parte all'ultima, e fra le fasi non si scrive niente**.
// Quel «niente» è la correzione che ha fatto nascere questo documento: fra la
// prima e l'ultima fase i pezzi non sono più il materiale e non sono ancora la
// parte, e un movimento col codice parte inventerebbe una giacenza che non c'è.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, parte, asm, comp, wc } = require('./fixtures.js');

// Tre cicli, uno per caso. Stessa parte a tre nomi, così i numeri attesi sono
// gli stessi e l'unica variabile è dove stanno le fasi.
const fase = (wcId, supplierId, o) => Object.assign(
  { kind: 'op', workCenterId: wcId, supplierId: supplierId || null, costMode: 'fisso', cost: 3, hours: 0.5, days: 0, note: '' }, o || {});

function conDb(over) {
  const app = loadApp({ silent: true });
  app.asRole('admin');
  app.setDb(makeDb(Object.assign({
    suppliers: [
      { id: 'beta', name: 'Beta', active: true },
      { id: 'gamma', name: 'Gamma', active: true },
    ],
    workCenters: [wc('tor', 40), wc('fre', 35), wc('zin', 30)],
    items: [
      Object.assign(mat('tondo', 5), { uom: 'kg' }),
      // Ciclo tutto interno: 10 tornitura, 20 fresatura
      parte('interna', { uom: 'pz', cycle: [
        { kind: 'item', itemId: 'tondo', qty: 2 },
        fase('tor'), fase('fre'),
      ] }),
      // Ciclo tutto esterno: 10 Beta, 20 Gamma
      parte('esterna', { uom: 'pz', cycle: [
        { kind: 'item', itemId: 'tondo', qty: 2 },
        fase('zin', 'beta'), fase('zin', 'gamma'),
      ] }),
      // Ciclo misto: 10 interna, 20 Beta, 30 interna
      parte('mista', { uom: 'pz', cycle: [
        { kind: 'item', itemId: 'tondo', qty: 2 },
        fase('tor'), fase('zin', 'beta'), fase('fre'),
      ] }),
      asm('grp', 'gruppo', { components: [comp('interna', 3)] }),
    ],
    plans: [{ id: 'pl1', number: 'FAB-2026-001', title: 'Lotto', date: '2026-07-01', notes: '',
      lines: [{ id: 'l1', itemId: 'grp', qty: 2, dueDate: '2026-09-30' }], active: true, jobId: null }],
  }, over || {})));
  return app;
}

// Un ordine lanciato per `partId`, `qty` pezzi. Ritorna il suo id.
function lancia(app, partId, qty) {
  return app.eval(`(function () {
    const part = getItem(${JSON.stringify(partId)});
    const o = { id: 'odp-' + part.id, number: 'ODP-2026-001', itemId: part.id,
      code: part.code, name: part.name, uom: itemUom(part), qty: ${qty},
      date: '2026-07-01', dueDate: '2026-09-30', status: 'bozza', title: '',
      notes: '', notesInternal: '', planId: 'pl1', jobId: null,
      phases: opFreezePhases(part), materials: opFreezeMaterials(part, ${qty}), active: true };
    db.prodOrders.push(o); invalidateCaches();
    opLancia(o.id);
    return o.id;
  })()`);
}
const fasi = (app, id) => JSON.parse(app.eval(`JSON.stringify((getOdp(${JSON.stringify(id)}).phases || [])
  .map(f => ({ id: f.id, seq: f.seq, sup: f.supplierId, wc: f.wcName })))`));
const stato = (app, id, i) => app.eval(`(function(){ const o = getOdp(${JSON.stringify(id)}); return opStatoFase(o, o.phases[${i}]); })()`);
const avvia = (app, id, i, opz) => app.eval(`(function(){ const o = getOdp(${JSON.stringify(id)});
  return opAvvia(o.id, o.phases[${i}].id, ${JSON.stringify(opz || {})}); })()`);
const dichiara = (app, id, i, dati) => app.eval(`(function(){ const o = getOdp(${JSON.stringify(id)});
  return opDichiara(o.id, o.phases[${i}].id, ${JSON.stringify(dati)}); })()`);
const movimenti = app => JSON.parse(app.eval(`JSON.stringify((db.movements || [])
  .map(m => ({ item: (getItem(m.itemId) || {}).code, kind: m.kind, qty: m.qty, sup: m.supplierId })))`));
const onHand = (app, itemId) => Number(app.eval(`(invalidateCaches(), onHandOf(${JSON.stringify(itemId)}))`));

describe('ODP: il modello', () => {
  it('è dichiarato nel registro dello schema, coi suoi due figli', () => {
    const app = conDb();
    const sch = JSON.parse(app.eval('JSON.stringify(Store.schema().prodOrders)'));
    assert.equal(sch.table, 'production_orders');
    assert.equal(sch.children.phases.table, 'production_order_phases');
    assert.equal(sch.children.phases.merge, 'row', 'due reparti che dichiarano su due fasi non sono in conflitto');
    assert.equal(sch.children.materials.table, 'production_order_materials');
    assert.equal(JSON.parse(app.eval('JSON.stringify(Store.schema().prodDecls)')).table, 'production_declarations');
  });

  it('il giro verso la forma normalizzata e ritorno non perde niente', () => {
    const app = conDb();
    lancia(app, 'mista', 10);
    app.eval(`(function(){ const o = getOdp('odp-mista'); opAvvia(o.id, o.phases[0].id, {}); })()`);
    const giro = JSON.parse(app.eval('JSON.stringify(nestDB(flattenDB(db)).prodOrders)'));
    assert.deepEqual(giro, JSON.parse(app.eval('JSON.stringify(db.prodOrders)')));
    assert.deepEqual(JSON.parse(app.eval('JSON.stringify(nestDB(flattenDB(db)).prodDecls)')),
      JSON.parse(app.eval('JSON.stringify(db.prodDecls)')));
  });

  it('un database senza le collezioni se le ritrova vuote al caricamento', () => {
    const app = loadApp({ silent: true });
    app.seedStorage({ schemaVersion: 2, items: [],
      settings: { currency: '€', uoms: [], concepts: [], mpFamiliesSeeded: true, partFamiliesSeeded: true } });
    app.ref('Store').load();
    assert.deepEqual(app.snapshot().prodOrders, []);
    assert.deepEqual(app.snapshot().prodDecls, []);
  });

  it('gli ordini di lavoro esistenti nascono senza legame, ed è ciò che li lascia come prima', () => {
    const app = loadApp({ silent: true });
    app.seedStorage({ schemaVersion: 2, items: [],
      workOrders: [{ id: 'w1', number: 'ODL-1', status: 'bozza', active: true,
        lines: [{ id: 'l', phaseKey: 'perno#0#zin', qty: 1 }] }],
      movements: [{ id: 'm1', itemId: 'x', kind: 'clOut', qty: -2 }],
      settings: { currency: '€', uoms: [], concepts: [], mpFamiliesSeeded: true, partFamiliesSeeded: true } });
    app.ref('Store').load();
    const s = app.snapshot();
    assert.equal(s.workOrders[0].odpId, null);
    assert.equal(s.workOrders[0].lines[0].odpId, null);
    assert.equal(s.workOrders[0].lines[0].odpPhaseId, null);
    assert.equal(s.movements[0].declId, null);
  });

  it('le fasi si congelano col numero del ciclo e con la natura di ciascuna', () => {
    const app = conDb();
    lancia(app, 'mista', 10);
    assert.deepEqual(fasi(app, 'odp-mista').map(f => [f.seq, f.sup]),
      [[10, null], [20, 'beta'], [30, null]]);
  });

  it('ogni fase ha un id proprio, e riordinare il ciclo dopo non sposta niente', () => {
    const app = conDb();
    lancia(app, 'mista', 10);
    const prima = fasi(app, 'odp-mista');
    assert.ok(prima.every(f => f.id), 'una fase senza id è una fase che le dichiarazioni non sanno nominare');
    // Il ciclo cambia sotto: si aggiunge una fase in testa e si sposta l'ultima.
    app.eval(`(function(){ const p = getItem('mista');
      p.cycle.splice(1, 0, { kind: 'op', workCenterId: 'tor', supplierId: null, costMode: 'fisso', cost: 1, hours: 1, days: 0, note: '' });
      invalidateCaches(); })()`);
    assert.deepEqual(fasi(app, 'odp-mista'), prima, "l'ordine lanciato non si muove col ciclo");
  });

  it('il materiale congelato è quello del ciclo per i pezzi lanciati', () => {
    const app = conDb();
    lancia(app, 'interna', 10);
    const m = JSON.parse(app.eval(`JSON.stringify(getOdp('odp-interna').materials.map(x => ({ code: x.code, per: x.perPezzo, qty: x.qty })))`));
    assert.deepEqual(m, [{ code: 'TONDO', per: 2, qty: 20 }]);
  });

  it('una quantità a zero non si lancia: non c\'è niente da produrre', () => {
    const app = conDb();
    lancia(app, 'interna', 0);
    assert.equal(app.eval(`getOdp('odp-interna').status`), 'bozza');
  });

  it('una parte senza fasi non si lancia: non c\'è nessuna successione da seguire', () => {
    const app = conDb();
    app.eval(`(function(){ getItem('interna').cycle = [{ kind: 'item', itemId: 'tondo', qty: 2 }]; invalidateCaches(); })()`);
    lancia(app, 'interna', 10);
    assert.equal(app.eval(`getOdp('odp-interna').status`), 'bozza');
  });
});

describe('ODP: la successione', () => {
  it('la seconda fase non parte se la prima non è chiusa, e il rifiuto la nomina', () => {
    const app = conDb();
    lancia(app, 'interna', 10);
    assert.equal(stato(app, 'odp-interna', 1), 'attesa');
    assert.equal(avvia(app, 'odp-interna', 1), false);
    const motivo = app.eval(`(function(){ const o = getOdp('odp-interna'); return opAvviabile(o, o.phases[1]).motivo; })()`);
    assert.match(motivo, /fase 10/, 'il blocco deve dire quale fase lo causa');
    assert.match(motivo, /0 di 10/, 'e con quali numeri');
  });

  it('chiusa la prima, si sblocca la seconda e solo quella', () => {
    const app = conDb();
    lancia(app, 'mista', 10);
    avvia(app, 'odp-mista', 0);
    dichiara(app, 'odp-mista', 0, { qty: 10, scrap: 0 });
    assert.equal(stato(app, 'odp-mista', 0), 'chiusa');
    assert.equal(stato(app, 'odp-mista', 1), 'avviabile');
    assert.equal(stato(app, 'odp-mista', 2), 'attesa');
  });

  it('un avanzamento parziale non chiude la fase', () => {
    const app = conDb();
    lancia(app, 'interna', 10);
    avvia(app, 'odp-interna', 0);
    dichiara(app, 'odp-interna', 0, { qty: 4, scrap: 0 });
    assert.equal(stato(app, 'odp-interna', 0), 'corso');
    dichiara(app, 'odp-interna', 0, { qty: 6, scrap: 0 });
    assert.equal(stato(app, 'odp-interna', 0), 'chiusa');
  });

  it('pezzi buoni più scarti chiudono la fase: sono i pezzi lavorati', () => {
    const app = conDb();
    lancia(app, 'interna', 10);
    avvia(app, 'odp-interna', 0);
    dichiara(app, 'odp-interna', 0, { qty: 8, scrap: 2 });
    assert.equal(stato(app, 'odp-interna', 0), 'chiusa');
  });

  it('solo i pezzi buoni proseguono: uno scarto restringe la fase seguente', () => {
    const app = conDb();
    lancia(app, 'interna', 10);
    avvia(app, 'odp-interna', 0);
    dichiara(app, 'odp-interna', 0, { qty: 8, scrap: 2 });
    const daFare = app.eval(`(function(){ const o = getOdp('odp-interna'); return opDaFare(o, o.phases[1]); })()`);
    assert.equal(Number(daFare), 8, 'alla fase 20 entrano gli otto buoni, non i dieci lanciati');
  });

  it('forzare senza motivo non passa; col motivo avvia e resta scritto', () => {
    const app = conDb();
    lancia(app, 'interna', 10);
    assert.equal(avvia(app, 'odp-interna', 1, { forza: true }), false);
    assert.equal(avvia(app, 'odp-interna', 1, { forza: true, motivo: 'pezzi campione urgenti' }), true);
    const d = JSON.parse(app.eval(`JSON.stringify(db.prodDecls.map(x => ({ kind: x.kind, motivo: x.motivo, note: x.note })))`));
    const forzatura = d.find(x => x.kind === 'forzatura');
    assert.ok(forzatura, 'la forzatura è un fatto del documento, e resta nello storico');
    assert.equal(forzatura.motivo, 'pezzi campione urgenti');
    assert.match(forzatura.note, /fase 10/, 'con dentro cosa si è scavalcato');
    assert.equal(app.eval(`(function(){ const o = getOdp('odp-interna'); return opForzata(o, o.phases[1]); })()`), true);
  });

  it('un ordine in bozza non avvia niente', () => {
    const app = conDb();
    lancia(app, 'interna', 10);
    app.eval(`(getOdp('odp-interna').status = 'bozza')`);
    assert.equal(avvia(app, 'odp-interna', 0), false);
  });

  it("lo stato della testata si deduce, e non torna mai indietro da sé su annullato", () => {
    const app = conDb();
    lancia(app, 'interna', 10);
    assert.equal(app.eval(`getOdp('odp-interna').status`), 'lanciato');
    avvia(app, 'odp-interna', 0);
    assert.equal(app.eval(`getOdp('odp-interna').status`), 'corso');
    dichiara(app, 'odp-interna', 0, { qty: 10 });
    avvia(app, 'odp-interna', 1);
    dichiara(app, 'odp-interna', 1, { qty: 10 });
    assert.equal(app.eval(`getOdp('odp-interna').status`), 'completato');
    app.eval(`(function(){ const o = getOdp('odp-interna'); o.status = 'annullato'; odpAutoStatus(o); })()`);
    assert.equal(app.eval(`getOdp('odp-interna').status`), 'annullato');
  });
});

describe('ODP: il magazzino, i tre cicli', () => {
  it('ciclo tutto interno: esce il materiale, entra la parte, e niente in mezzo', () => {
    const app = conDb();
    app.eval(`(addMovement('tondo', 'carico', 100, 'giacenza iniziale'), invalidateCaches())`);
    lancia(app, 'interna', 10);
    avvia(app, 'odp-interna', 0);
    assert.equal(onHand(app, 'tondo'), 80, 'venti chili di tondo usciti, una volta sola');
    dichiara(app, 'odp-interna', 0, { qty: 10 });
    avvia(app, 'odp-interna', 1);
    assert.equal(onHand(app, 'tondo'), 80, 'la seconda fase non ripreleva niente');
    dichiara(app, 'odp-interna', 1, { qty: 10 });
    assert.equal(onHand(app, 'interna'), 10, 'la parte entra a magazzino una volta sola');
    const kinds = movimenti(app).filter(m => m.kind !== 'carico').map(m => m.kind);
    assert.deepEqual(kinds, ['scarico', 'versamento']);
    assert.equal(kinds.filter(k => k === 'clStep').length, 0, 'un ciclo interno non passa da nessun terzista');
  });

  it('ciclo tutto esterno: il materiale va al primo, la parte torna dall\'ultimo, niente fra i due', () => {
    const app = conDb();
    app.eval(`(addMovement('tondo', 'carico', 100, ''), invalidateCaches())`);
    lancia(app, 'esterna', 10);
    avvia(app, 'odp-esterna', 0);
    dichiara(app, 'odp-esterna', 0, { qty: 10 });
    avvia(app, 'odp-esterna', 1);
    dichiara(app, 'odp-esterna', 1, { qty: 10 });
    const m = movimenti(app).filter(x => x.kind !== 'carico');
    assert.deepEqual(m, [
      { item: 'TONDO', kind: 'clOut', qty: -20, sup: 'beta' },
      { item: 'ESTERNA', kind: 'clIn', qty: 10, sup: 'gamma' },
    ], 'due movimenti soli: fra Beta e Gamma non si scrive niente');
    assert.equal(onHand(app, 'tondo'), 80);
    assert.equal(onHand(app, 'esterna'), 10);
  });

  it('ciclo misto: scarico all\'avvio, versamento alla fine, e in mezzo il silenzio', () => {
    const app = conDb();
    app.eval(`(addMovement('tondo', 'carico', 100, ''), invalidateCaches())`);
    lancia(app, 'mista', 10);
    [0, 1, 2].forEach(i => { avvia(app, 'odp-mista', i); dichiara(app, 'odp-mista', i, { qty: 10 }); });
    const m = movimenti(app).filter(x => x.kind !== 'carico');
    assert.deepEqual(m, [
      { item: 'TONDO', kind: 'scarico', qty: -20, sup: null },
      { item: 'MISTA', kind: 'versamento', qty: 10, sup: null },
    ]);
  });

  it('il codice parte non risulta mai presso un terzista prima del versamento', () => {
    const app = conDb();
    app.eval(`(addMovement('tondo', 'carico', 100, ''), invalidateCaches())`);
    lancia(app, 'esterna', 10);
    avvia(app, 'odp-esterna', 0);
    app.eval('invalidateCaches()');
    assert.equal(Number(app.eval(`atSupplierOf('esterna')`)), 0, 'la parte non esiste ancora: nominarla sarebbe una giacenza inventata');
    assert.equal(Number(app.eval(`atSupplierOf('tondo')`)), 20, 'il materiale invece è davvero da Beta');
  });

  it('il materiale segue la fase corrente: passa a Gamma senza nessun movimento', () => {
    const app = conDb();
    app.eval(`(addMovement('tondo', 'carico', 100, ''), invalidateCaches())`);
    lancia(app, 'esterna', 10);
    avvia(app, 'odp-esterna', 0);
    dichiara(app, 'odp-esterna', 0, { qty: 10 });
    avvia(app, 'odp-esterna', 1);
    app.eval('invalidateCaches()');
    const dove = JSON.parse(app.eval(`JSON.stringify(prodWipRows().map(r => ({ luogo: r.luogo, code: r.item.code, qty: r.qty })))`));
    assert.deepEqual(dove, [{ luogo: 'gamma', code: 'TONDO', qty: 20 }],
      'i movimenti non si sono mossi: il luogo lo dà la fase corrente');
    assert.equal(app.eval('db.movements.filter(m => m.kind === "clStep").length'), 0);
  });

  it('a ordine completato non resta niente fuori', () => {
    const app = conDb();
    app.eval(`(addMovement('tondo', 'carico', 100, ''), invalidateCaches())`);
    lancia(app, 'esterna', 10);
    [0, 1].forEach(i => { avvia(app, 'odp-esterna', i); dichiara(app, 'odp-esterna', i, { qty: 10 }); });
    app.eval('invalidateCaches()');
    assert.equal(app.eval('prodWipRows().length'), 0);
    assert.equal(Number(app.eval(`atSupplierOf('tondo')`)), 0);
  });

  // Righe WIP e movimenti per ordine stanno in cache (0.96.0): ogni gesto salva,
  // e il salvataggio le deve buttare, senza che nessuno chiami invalidateCaches.
  it('le cache del WIP seguono ogni gesto, senza invalidare a mano', () => {
    const app = conDb();
    app.eval(`addMovement('tondo', 'carico', 100, '')`);
    lancia(app, 'esterna', 10);
    assert.equal(Number(app.eval(`atSupplierOf('tondo')`)), 0);
    avvia(app, 'odp-esterna', 0);
    assert.equal(Number(app.eval(`atSupplierOf('tondo')`)), 20);
    assert.equal(Number(app.eval(`prodWipAt('beta', 'tondo')`)), 20);
    dichiara(app, 'odp-esterna', 0, { qty: 10 });
    avvia(app, 'odp-esterna', 1);
    assert.equal(Number(app.eval(`prodWipAt('beta', 'tondo')`)), 0);
    assert.equal(Number(app.eval(`prodWipAt('gamma', 'tondo')`)), 20);
    dichiara(app, 'odp-esterna', 1, { qty: 10 });
    assert.equal(app.eval(`opVersato(getOdp('odp-esterna'))`), 10);
    assert.equal(Number(app.eval(`atSupplierOf('tondo')`)), 0);
  });

  it('il materiale esce una volta sola: riavviare la prima fase non lo ripreleva', () => {
    const app = conDb();
    app.eval(`(addMovement('tondo', 'carico', 100, ''), invalidateCaches())`);
    lancia(app, 'interna', 10);
    avvia(app, 'odp-interna', 0);
    assert.equal(avvia(app, 'odp-interna', 0), false, 'una fase già avviata non si riavvia');
    assert.equal(onHand(app, 'tondo'), 80);
    const residuo = JSON.parse(app.eval(`JSON.stringify(opMaterialeResiduo(getOdp('odp-interna')).map(m => m.residuo))`));
    assert.deepEqual(residuo, [0], 'a residuo zero la scheda lo dice, invece di riproporre il modulo');
  });

  it('si versa la resa vera, non la quantità lanciata', () => {
    const app = conDb();
    app.eval(`(addMovement('tondo', 'carico', 100, ''), invalidateCaches())`);
    lancia(app, 'interna', 10);
    avvia(app, 'odp-interna', 0);
    dichiara(app, 'odp-interna', 0, { qty: 8, scrap: 2 });
    avvia(app, 'odp-interna', 1);
    dichiara(app, 'odp-interna', 1, { qty: 7, scrap: 1 });
    assert.equal(onHand(app, 'interna'), 7, 'sette buoni su dieci lanciati: il magazzino dice sette');
  });

  it('il versamento non si può registrare a mano dalla rettifica', () => {
    const app = conDb();
    const manuali = JSON.parse(app.eval('JSON.stringify(MOVEMENT_MANUAL_KINDS)'));
    assert.ok(!manuali.includes('versamento'), 'senza un ordine dietro, un versamento è un carico che nessuno spiega');
    assert.ok(!manuali.includes('clStep'));
    assert.ok(manuali.includes('carico') && manuali.includes('scarico'));
  });

  it('annullare una dichiarazione toglie i suoi movimenti, non quelli delle altre', () => {
    const app = conDb();
    app.eval(`(addMovement('tondo', 'carico', 100, ''), invalidateCaches())`);
    lancia(app, 'interna', 10);
    avvia(app, 'odp-interna', 0);
    dichiara(app, 'odp-interna', 0, { qty: 10 });
    avvia(app, 'odp-interna', 1);
    dichiara(app, 'odp-interna', 1, { qty: 6 });
    dichiara(app, 'odp-interna', 1, { qty: 4 });
    assert.equal(onHand(app, 'interna'), 10);
    const ultima = app.eval(`db.prodDecls.filter(d => d.kind === 'avanzamento' && d.qty === 4)[0].id`);
    app.eval(`opAnnullaDichiarazione(${JSON.stringify(ultima)})`);
    assert.equal(onHand(app, 'interna'), 6, 'se ne va solo il carico di quella dichiarazione');
    assert.equal(onHand(app, 'tondo'), 80, 'e il prelievo del materiale resta dov\'era');
  });
});

describe('ODP ↔ ordine di lavoro', () => {
  it('la riga generata passa dalla stessa fabbrica di quella del piano', () => {
    const app = conDb();
    lancia(app, 'esterna', 10);
    const l = JSON.parse(app.eval(`(function(){ const o = getOdp('odp-esterna');
      const w = opGeneraOdl(o.id, o.phases[0].id); return JSON.stringify(w.lines[0]); })()`));
    assert.equal(l.itemId, null, 'la garanzia contro il doppio conteggio vale anche qui');
    assert.equal(l.phaseKey, 'esterna#0#zin');
    assert.equal(l.code, 'ESTERNA', 'il codice è quello della parte: è il pezzo che il terzista riceve');
    assert.equal(l.qty, 10);
    assert.equal(l.price, 3);
    assert.equal(l.received, 0);
    assert.ok(l.odpId && l.odpPhaseId, 'e porta il legame con la fase che la giustifica');
  });

  it('due fasi consecutive dello stesso terzista fanno una riga sola', () => {
    const app = conDb();
    app.eval(`(function(){ getItem('esterna').cycle = [
      { kind: 'item', itemId: 'tondo', qty: 2 },
      { kind: 'op', workCenterId: 'zin', supplierId: 'beta', costMode: 'fisso', cost: 3, hours: 0, days: 2, note: '' },
      { kind: 'op', workCenterId: 'fre', supplierId: 'beta', costMode: 'fisso', cost: 4, hours: 0, days: 1, note: '' },
    ]; invalidateCaches(); })()`);
    lancia(app, 'esterna', 5);
    const w = JSON.parse(app.eval(`(function(){ const o = getOdp('odp-esterna');
      const x = opGeneraOdl(o.id, o.phases[0].id); return JSON.stringify({ n: x.lines.length, l: x.lines[0] }); })()`));
    assert.equal(w.n, 1, 'è una lavorazione da commissionare, non due');
    assert.equal(w.l.price, 7, 'prezzo sommato sulla tratta');
    assert.equal(w.l.phaseKeys.split(',').length, 2, 'e copre entrambe le fasi');
    assert.match(w.l.description, /fasi 10-20/);
  });

  it('la stessa tratta non si commissiona due volte', () => {
    const app = conDb();
    lancia(app, 'esterna', 10);
    app.eval(`(function(){ const o = getOdp('odp-esterna'); opGeneraOdl(o.id, o.phases[0].id); })()`);
    const secondo = app.eval(`(function(){ const o = getOdp('odp-esterna'); return !!opGeneraOdl(o.id, o.phases[0].id); })()`);
    assert.equal(secondo, false);
    assert.equal(app.eval('db.workOrders.length'), 1);
  });

  it('una fase interna non si commissiona a nessuno', () => {
    const app = conDb();
    lancia(app, 'interna', 10);
    assert.equal(app.eval(`(function(){ const o = getOdp('odp-interna'); return !!opGeneraOdl(o.id, o.phases[0].id); })()`), false);
  });

  it('sulla riga guidata dall\'ODP i comandi di conto lavoro diventano un rimando', () => {
    const app = conDb();
    lancia(app, 'esterna', 10);
    app.eval(`(function(){ const o = getOdp('odp-esterna'); opGeneraOdl(o.id, o.phases[0].id); invalidateCaches(); })()`);
    const html = app.eval(`(function(){ const w = db.workOrders[0]; return docClActions(w, w.lines[0]); })()`);
    assert.ok(!html.includes('clFromOdlModal'), 'due strade per lo stesso gesto sono due registrazioni');
    assert.match(html, /openOdpFromOdl/);
    assert.match(html, /ODP-2026-001/);
  });

  it('e la guardia sta anche nel mutatore, non solo nella UI', () => {
    const app = conDb();
    lancia(app, 'esterna', 10);
    app.eval(`(function(){ const o = getOdp('odp-esterna'); opGeneraOdl(o.id, o.phases[0].id); invalidateCaches(); })()`);
    const prima = app.eval('(db.movements || []).length');
    app.eval(`(function(){ const w = db.workOrders[0]; saveClFromOdl(w.id, w.lines[0].id, 'out'); })()`);
    assert.equal(app.eval('(db.movements || []).length'), prima, 'nessun movimento registrato da lì');
  });

  it('dichiarare sull\'ODP aggiorna i pezzi rientrati sull\'ordine di lavoro', () => {
    const app = conDb();
    lancia(app, 'esterna', 10);
    app.eval(`(function(){ const o = getOdp('odp-esterna'); opGeneraOdl(o.id, o.phases[0].id); invalidateCaches(); })()`);
    avvia(app, 'odp-esterna', 0);
    dichiara(app, 'odp-esterna', 0, { qty: 6 });
    assert.equal(Number(app.eval('db.workOrders[0].lines[0].received')), 6);
    dichiara(app, 'odp-esterna', 0, { qty: 4 });
    assert.equal(Number(app.eval('db.workOrders[0].lines[0].received')), 10);
  });

  it('un ordine di lavoro senza ODP si comporta esattamente come prima', () => {
    const app = conDb();
    app.eval(`(function(){ db.workOrders.push({ id: 'w1', number: 'ODL-2026-009', title: '', date: '2026-07-01',
      status: 'bozza', supplierId: 'beta', transport: '', payment: '', rfqId: null, planId: null, jobId: null,
      odpId: null, supplierConfirmation: '', notes: '', notesInternal: '', active: true,
      lines: [{ id: 'wl1', itemId: null, phaseKey: 'esterna#0#zin', phaseKeys: 'esterna#0#zin',
        code: 'ESTERNA', description: 'Zincatura', uom: 'pz', qty: 4, price: 3, received: 0,
        deliveryDate: '', note: '', odpId: null, odpPhaseId: null }] }); invalidateCaches(); })()`);
    const html = app.eval(`(function(){ const w = db.workOrders[0]; return docClActions(w, w.lines[0]); })()`);
    assert.match(html, /clFromOdlModal/, 'i suoi comandi restano dov\'erano');
  });
});

describe('ODP: il fabbisogno', () => {
  const app0 = () => {
    const app = conDb();
    return app;
  };

  it('le parti da fabbricare diventano righe di documento, con una chiave loro', () => {
    const app = app0();
    const righe = JSON.parse(app.eval(`JSON.stringify(planDocRows(getPlan('pl1'), 'odp')
      .map(r => ({ k: planRowKey(r), qty: r.qtyOrder, fasi: r.nFasi })))`));
    assert.deepEqual(righe, [{ k: 'make#interna', qty: 6, fasi: 2 }]);
  });

  it('la chiave di una parte da fabbricare non collide con quella d\'acquisto', () => {
    const app = app0();
    const acquisti = JSON.parse(app.eval(`JSON.stringify(planDocRows(getPlan('pl1'), 'order').map(planRowKey))`));
    assert.ok(!acquisti.includes('make#interna'));
    assert.ok(acquisti.includes('tondo'));
  });

  it('una parte che si produce in casa non si chiede in offerta a nessuno', () => {
    const app = app0();
    const chiavi = JSON.parse(app.eval(`JSON.stringify(planDocRows(getPlan('pl1'), 'rfq').map(planRowKey))`));
    assert.ok(!chiavi.some(k => String(k).startsWith('make#')));
  });

  it('generato l\'ordine, la parte risulta già lanciata e il pulsante scende', () => {
    const app = app0();
    assert.equal(Number(app.eval(`planDocsAvailable(getPlan('pl1'), 'odp')`)), 1);
    app.eval(`(function(){ const p = getPlan('pl1'); planNewOdp(p, planRowIndex(p).get('make#interna')); saveDB(); })()`);
    assert.equal(Number(app.eval(`planDocsAvailable(getPlan('pl1'), 'odp')`)), 0);
    const refs = JSON.parse(app.eval(`JSON.stringify(planDocumentedKeys('pl1').get('make#interna'))`));
    assert.equal(refs[0].kind, 'odp');
  });

  it('le fasi coperte da un ODP non si ordinano più dal piano, e le altre sì', () => {
    // Il piano ha una parte a ciclo interno e una a ciclo misto: si lancia solo
    // la seconda, e la lavorazione esterna dell'altra resta ordinabile da qui.
    const app = conDb({
      plans: [{ id: 'pl1', number: 'FAB-2026-001', title: 'Lotto', date: '2026-07-01', notes: '',
        lines: [{ id: 'l1', itemId: 'mista', qty: 4, dueDate: '2026-09-30' },
          { id: 'l2', itemId: 'esterna', qty: 2, dueDate: '2026-09-30' }], active: true, jobId: null }],
    });
    assert.equal(Number(app.eval(`planDocsAvailable(getPlan('pl1'), 'odl')`)), 3, 'una fase di mista, due di esterna');
    app.eval(`(function(){ const p = getPlan('pl1'); planNewOdp(p, planRowIndex(p).get('make#mista')); saveDB(); })()`);
    assert.equal(Number(app.eval(`planDocsAvailable(getPlan('pl1'), 'odl')`)), 2,
      'la fase coperta esce dalla generazione diretta; le altre restano, ed è la convivenza');
  });

  // Dalla 0.105.8. Gli ordini di lavoro generati dal piano prima dell'ODP
  // portano le chiavi di fase, non il legame con la fase dell'ordine: l'ODP
  // nato dopo li ignorava e offriva di commissionare di nuovo la stessa tratta.
  it('una tratta già commissionata dal piano non si rigenera dall\'ODP', () => {
    const app = conDb({
      plans: [{ id: 'pl1', number: 'FAB-2026-001', title: 'Lotto', date: '2026-07-01', notes: '',
        lines: [{ id: 'l1', itemId: 'mista', qty: 4, dueDate: '2026-09-30' }], active: true, jobId: null }],
    });
    const odl = app.eval(`(() => { const p = getPlan('pl1');
      const g = planDocGroups(planDocRows(p, 'odl'), 'odl')[0];
      const w = planNewOdl(p, g.supplierId, g.rows); saveDB(); return w.number; })()`);
    const r = JSON.parse(app.eval(`(() => { const p = getPlan('pl1');
      const o = planNewOdp(p, planRowIndex(p).get('make#mista')); o.status = 'lanciato'; saveDB(); invalidateCaches();
      const f = o.phases.find(x => x.supplierId);
      const prima = db.workOrders.length;
      const gen = opGenerabile(o, f);
      const x = opGeneraOdl(o.id, f.id);
      return JSON.stringify({ gen, creato: !!x, n: db.workOrders.length - prima, link: (opOdlDalPiano(o, f) || {}).odl ? opOdlDalPiano(o, f).odl.number : null }); })()`));
    assert.equal(r.gen, false, 'la tratta risulta già commissionata');
    assert.equal(r.creato, false);
    assert.equal(r.n, 0, 'nessun secondo ordine di lavoro');
    assert.equal(r.link, odl, 'e la fase rimanda all\'ordine nato dal piano');
  });

  it('un ODP rilanciato per i pezzi mancanti commissiona i suoi', () => {
    const app = conDb({
      plans: [{ id: 'pl1', number: 'FAB-2026-001', title: 'Lotto', date: '2026-07-01', notes: '',
        lines: [{ id: 'l1', itemId: 'mista', qty: 4, dueDate: '2026-09-30' }], active: true, jobId: null }],
    });
    const r = JSON.parse(app.eval(`(() => { const p = getPlan('pl1');
      const g = planDocGroups(planDocRows(p, 'odl'), 'odl')[0];
      planNewOdl(p, g.supplierId, g.rows);
      const o1 = planNewOdp(p, planRowIndex(p).get('make#mista')); o1.createdAt = '2026-07-01T08:00:00.000Z';
      const o2 = odpNew(getItem('mista'), 1, '2026-09-30', { planId: 'pl1' }); o2.createdAt = '2026-07-02T08:00:00.000Z';
      db.prodOrders.push(o2); o1.status = o2.status = 'lanciato'; saveDB(); invalidateCaches();
      const f1 = o1.phases.find(x => x.supplierId), f2 = o2.phases.find(x => x.supplierId);
      return JSON.stringify({ primo: opGenerabile(o1, f1), secondo: opGenerabile(o2, f2) }); })()`));
    assert.equal(r.primo, false);
    assert.equal(r.secondo, true);
  });

  it('il contrario resta vero: una tratta commissionata dall\'ODP non si ordina dal piano', () => {
    const app = conDb({
      plans: [{ id: 'pl1', number: 'FAB-2026-001', title: 'Lotto', date: '2026-07-01', notes: '',
        lines: [{ id: 'l1', itemId: 'mista', qty: 4, dueDate: '2026-09-30' }], active: true, jobId: null }],
    });
    app.eval(`(() => { const p = getPlan('pl1'); const o = planNewOdp(p, planRowIndex(p).get('make#mista'));
      o.status = 'lanciato'; saveDB(); invalidateCaches(); opGeneraOdl(o.id, o.phases.find(x => x.supplierId).id); invalidateCaches(); })()`);
    assert.equal(Number(app.eval(`planDocsAvailable(getPlan('pl1'), 'odl')`)), 0);
  });

  it('un ordine annullato smette di coprire, e la parte torna lanciabile', () => {
    const app = app0();
    app.eval(`(function(){ const p = getPlan('pl1'); const o = planNewOdp(p, planRowIndex(p).get('make#interna'));
      o.status = 'annullato'; saveDB(); })()`);
    assert.equal(Number(app.eval(`planDocsAvailable(getPlan('pl1'), 'odp')`)), 1);
  });

  it('si lancia il residuo, non il lordo: i pezzi già dichiarati fatti non si rifanno', () => {
    // I due avanzamenti convivono e rispondono a due domande diverse, ma su una
    // cosa devono essere d'accordo: un pezzo dichiarato fatto non si rilancia.
    // È lo stesso motivo per cui il netto toglie quelle fasi agli ordini di lavoro.
    const app = app0();
    app.eval(`(function(){ produzioneDichiara('pl1', 'interna', 2, 'lotto 1'); invalidateCaches(); })()`);
    const r = JSON.parse(app.eval(`(function(){ const p = getPlan('pl1');
      const x = planRowIndex(p).get('make#interna'); return JSON.stringify({ qty: x.qty, order: x.qtyOrder }); })()`));
    assert.equal(r.qty, 6, 'il lordo resta in colonna, come sulle righe d\'acquisto');
    assert.equal(r.order, 4, 'e se ne lanciano quattro, non sei');
    const o = JSON.parse(app.eval(`(function(){ const p = getPlan('pl1');
      const x = planNewOdp(p, planRowIndex(p).get('make#interna'));
      return JSON.stringify({ qty: x.qty, mat: x.materials.map(m => m.qty) }); })()`));
    assert.equal(o.qty, 4);
    assert.deepEqual(o.mat, [8], 'e il materiale congelato segue la quantità lanciata');
  });

  it('l\'ordine generato dal piano è identico a uno scritto a mano', () => {
    const app = app0();
    const dal = JSON.parse(app.eval(`(function(){ const p = getPlan('pl1');
      const o = planNewOdp(p, planRowIndex(p).get('make#interna'));
      return JSON.stringify({ qty: o.qty, fasi: o.phases.map(f => f.seq), mat: o.materials.map(m => m.qty), plan: o.planId }); })()`));
    const mano = JSON.parse(app.eval(`(function(){ const o = odpNew(getItem('interna'), 6, '2026-09-30');
      return JSON.stringify({ qty: o.qty, fasi: o.phases.map(f => f.seq), mat: o.materials.map(m => m.qty), plan: o.planId }); })()`));
    assert.deepEqual(dal.fasi, mano.fasi);
    assert.deepEqual(dal.mat, mano.mat);
    assert.equal(dal.qty, mano.qty);
    assert.equal(dal.plan, 'pl1');
    assert.equal(mano.plan, null, "scritto a mano non è legato a nessun piano, e nel piano la parte resta da fabbricare");
  });
});

// 0.105.4: la tendina dello stato passa dai comandi, e il materiale non
// prelevato all'avvio ha un comando suo.
describe('ODP: lo stato dai comandi, e il resto del materiale', () => {
  const st = (app, id) => app.eval(`getOdp(${JSON.stringify(id)}).status`);

  it('«Annullato» dalla tendina chiede del materiale da rendere, come il comando', () => {
    const app = conDb();
    app.eval(`(addMovement('tondo', 'carico', 100, ''), invalidateCaches())`);
    lancia(app, 'interna', 10);
    avvia(app, 'odp-interna', 0);
    app.eval('globalThis.__m = ""; { const vero = openModal; openModal = (h, ...r) => { __m = h; return vero(h, ...r); }; }');
    app.eval(`odpCambiaStato('odp-interna', 'annullato')`);
    assert.equal(st(app, 'odp-interna'), 'corso', 'non cambia finché non si conferma');
    assert.match(app.ctx.__m, /Quanto ne torna/);
  });

  it('«Bozza» e «Lanciato» non tornano indietro sopra le dichiarazioni', () => {
    const app = conDb();
    app.eval(`(addMovement('tondo', 'carico', 100, ''), invalidateCaches())`);
    lancia(app, 'interna', 10);
    avvia(app, 'odp-interna', 0);
    app.eval(`odpCambiaStato('odp-interna', 'bozza')`);
    assert.equal(st(app, 'odp-interna'), 'corso');
    app.eval(`odpCambiaStato('odp-interna', 'lanciato')`);
    assert.equal(st(app, 'odp-interna'), 'corso', 'lo stato lo dà l\'avanzamento');
  });

  it('dalla bozza si passa solo lanciando, con i controlli del lancio', () => {
    const app = conDb();
    lancia(app, 'interna', 10);
    app.eval(`odpCambiaStato('odp-interna', 'bozza')`);
    assert.equal(st(app, 'odp-interna'), 'bozza', 'senza dichiarazioni torna in bozza');
    app.eval(`getOdp('odp-interna').qty = 0`);
    app.eval(`odpCambiaStato('odp-interna', 'lanciato')`);
    assert.equal(st(app, 'odp-interna'), 'bozza', 'a zero pezzi non si lancia');
    app.eval(`getOdp('odp-interna').qty = 10; odpCambiaStato('odp-interna', 'corso')`);
    assert.equal(st(app, 'odp-interna'), 'bozza');
    app.eval(`odpCambiaStato('odp-interna', 'lanciato')`);
    assert.equal(st(app, 'odp-interna'), 'lanciato');
  });

  it('«Chiuso» conferma, e si riapre allo stato che dicono le fasi', () => {
    const app = conDb();
    app.eval('askConfirm = (m, si) => si();');
    lancia(app, 'interna', 10);
    avvia(app, 'odp-interna', 0);
    app.eval(`odpCambiaStato('odp-interna', 'chiuso')`);
    assert.equal(st(app, 'odp-interna'), 'chiuso');
    app.eval(`odpUnlockedId = 'odp-interna'; odpCambiaStato('odp-interna', 'completato')`);
    assert.equal(st(app, 'odp-interna'), 'corso');
  });

  it('«Preleva il resto» fa uscire quello che all\'avvio non era uscito', () => {
    const app = conDb();
    app.eval(`(addMovement('tondo', 'carico', 100, ''), invalidateCaches())`);
    lancia(app, 'esterna', 10);
    assert.equal(app.eval(`opPrelevaResto('odp-esterna')`), false, 'prima dell\'avvio no');
    avvia(app, 'odp-esterna', 0, { materiali: [{ itemId: 'tondo', qty: 12 }] });
    assert.equal(onHand(app, 'tondo'), 88);
    assert.equal(app.eval(`opPuoPrelevareResto(getOdp('odp-esterna'))`), true);
    assert.match(app.eval(`odpMaterialBlock(getOdp('odp-esterna'))`), /Preleva il resto/);
    assert.equal(app.eval(`opPrelevaResto('odp-esterna')`), 1);
    assert.equal(onHand(app, 'tondo'), 80, 'esce il residuo, otto chili');
    assert.deepEqual(movimenti(app).filter(m => m.kind === 'clOut').map(m => m.qty), [-12, -8], 'verso lo stesso terzista');
    assert.equal(movimenti(app).filter(m => m.kind === 'clOut').every(m => m.sup === 'beta'), true);
    assert.equal(app.eval(`opPuoPrelevareResto(getOdp('odp-esterna'))`), false, 'non resta niente');
    assert.equal(app.eval(`opPrelevaResto('odp-esterna')`), false);
  });
});

// ═══════════════════════════════════════════════════════════
//  Il piano vede quello che l'ODP ha fatto (0.105.5)
// ═══════════════════════════════════════════════════════════
describe('Il piano e i suoi ordini di produzione', () => {
  const riga = (app, id) => JSON.parse(app.eval(`(invalidateCaches(), JSON.stringify((() => {
    const r = mrpMakeRows(getPlan('pl1')).find(x => x.item.id === ${JSON.stringify(id)});
    return { qty: r.qty, ordina: r.qtyOrder, bloccata: planBloccata(planDocumentedKeys('pl1').get(r.makeKey), 'odp', r),
      fatti: prodottiDi('pl1', r.item.id) };
  })()))`));

  it('un ODP aperto copre la parte: niente da rilanciare', () => {
    const app = conDb();
    lancia(app, 'interna', 6);
    assert.deepEqual(riga(app, 'interna'), { qty: 6, ordina: 0, bloccata: true, fatti: 0 });
  });

  it('chiuso con meno pezzi buoni, il piano lo vede e propone quelli che mancano', () => {
    const app = conDb();
    lancia(app, 'interna', 6);
    avvia(app, 'odp-interna', 0);
    dichiara(app, 'odp-interna', 0, { qty: 4, scrap: 2 });
    avvia(app, 'odp-interna', 1);
    dichiara(app, 'odp-interna', 1, { qty: 4, scrap: 0 });
    assert.equal(app.eval(`getOdp('odp-interna').status`), 'completato');
    assert.deepEqual(riga(app, 'interna'), { qty: 6, ordina: 2, bloccata: false, fatti: 4 });
    assert.equal(app.eval(`(invalidateCaches(), planDocsAvailable(getPlan('pl1'), 'odp'))`), 1);
  });

  it('i pezzi di un altro, liberi a scaffale, non vanno a un piano che ha già il suo ODP', () => {
    const app = conDb();
    lancia(app, 'interna', 6);
    app.eval(`addMovement('interna', 'carico', 6, 'liberi')`);
    // Il piano 2 ha bisogno anche lui di 6 pezzi, e consegna dopo: senza la
    // correzione il piano 1, più urgente, si prendeva anche quelli liberi.
    app.eval(`db.plans.push({ id: 'pl2', number: 'FAB-2026-002', date: '2026-07-02', active: true,
      lines: [{ id: 'l2', itemId: 'grp', qty: 2, dueDate: '2026-10-30' }] }); invalidateCaches();`);
    const sc = JSON.parse(app.eval(`(invalidateCaches(), JSON.stringify(['pl1', 'pl2'].map(id => (scaffaleIndex().get(id).quota.get('interna') || 0))))`));
    assert.deepEqual(sc, [0, 6]);
  });
});

describe('Ordine di lavoro da un ODP (0.105.5)', () => {
  it('commissionato prima che i pezzi arrivino, chiede quelli che arriveranno', () => {
    const app = conDb();
    lancia(app, 'mista', 10);
    avvia(app, 'odp-mista', 0);
    dichiara(app, 'odp-mista', 0, { qty: 3, scrap: 1 });
    const l = JSON.parse(app.eval(`(function(){ const o = getOdp('odp-mista');
      return JSON.stringify(opGeneraOdl(o.id, o.phases[1].id).lines[0]); })()`));
    assert.equal(l.qty, 9, 'dieci lanciati, uno scartato alla fase prima');
  });

  it('uno annullato si può sostituire, e i rientri non vanno più su di lui', () => {
    const app = conDb();
    lancia(app, 'esterna', 6);
    const primo = app.eval(`(function(){ const o = getOdp('odp-esterna'); return opGeneraOdl(o.id, o.phases[0].id).id; })()`);
    app.eval(`db.workOrders.find(w => w.id === '${primo}').status = 'annullato'; invalidateCaches();`);
    const secondo = app.eval(`(function(){ const o = getOdp('odp-esterna'); const w = opGeneraOdl(o.id, o.phases[0].id); return w ? w.id : null; })()`);
    assert.ok(secondo && secondo !== primo);
  });
});

describe('ODP: annullare, chiudere da sole, chi commissiona (0.105.6)', () => {
  const statoOdp = app => app.eval(`getOdp('odp-interna').status`);
  const decl = (app, kind, i) => app.eval(`(function(){ const o = getOdp('odp-interna');
    const d = db.prodDecls.filter(x => x.odpId === o.id && x.phaseId === o.phases[${i}].id && x.kind === '${kind}')[0];
    return d ? d.id : null; })()`);
  const annulla = (app, id) => app.eval(`opAnnullaDichiarazione(${JSON.stringify(id)})`);
  const conTondo = () => { const app = conDb(); app.eval(`(addMovement('tondo', 'carico', 100, ''), invalidateCaches())`); return app; };

  it('un avanzamento della 10 non si annulla se la 20 è già partita', () => {
    const app = conTondo();
    lancia(app, 'interna', 10);
    avvia(app, 'odp-interna', 0);
    dichiara(app, 'odp-interna', 0, { qty: 10 });
    avvia(app, 'odp-interna', 1);
    dichiara(app, 'odp-interna', 1, { qty: 10 });
    assert.equal(statoOdp(app), 'completato');
    assert.equal(annulla(app, decl(app, 'avanzamento', 0)), false);
    assert.equal(statoOdp(app), 'completato', "l'ordine resta coerente coi pezzi a magazzino");
    assert.equal(onHand(app, 'interna'), 10);
    // Annullate prima le dichiarazioni della 20 (avanzamento e avvio), la 10 si annulla.
    assert.equal(annulla(app, decl(app, 'avanzamento', 1)), true);
    assert.equal(annulla(app, decl(app, 'avvio', 1)), true);
    assert.equal(annulla(app, decl(app, 'avanzamento', 0)), true);
  });

  it('un avvio sbagliato si annulla e rimette a scaffale il materiale', () => {
    const app = conTondo();
    lancia(app, 'interna', 10);
    avvia(app, 'odp-interna', 0);
    assert.equal(onHand(app, 'tondo'), 80);
    const avvio = decl(app, 'avvio', 0);
    assert.ok(app.eval(`db.movements.filter(m => m.orderId === 'odp-interna').every(m => m.declId === ${JSON.stringify(avvio)})`),
      "i prelievi portano l'avvio che li ha fatti");
    assert.ok(app.eval(`odpDeclBlock(getOdp('odp-interna')).includes('opAnnullaDichiarazioneAsk')`), "e l'avvio ha il suo comando");
    assert.equal(annulla(app, avvio), true);
    assert.equal(onHand(app, 'tondo'), 100);
    assert.equal(stato(app, 'odp-interna', 0), 'avviabile');
    assert.equal(statoOdp(app), 'lanciato');
    // Riavviata, il materiale esce di nuovo, una volta.
    assert.equal(avvia(app, 'odp-interna', 0), true);
    assert.equal(onHand(app, 'tondo'), 80);
  });

  it('un avvio con già delle dichiarazioni non si annulla', () => {
    const app = conTondo();
    lancia(app, 'interna', 10);
    avvia(app, 'odp-interna', 0);
    dichiara(app, 'odp-interna', 0, { qty: 4 });
    assert.equal(annulla(app, decl(app, 'avvio', 0)), false);
    assert.equal(onHand(app, 'tondo'), 80);
    assert.ok(!app.eval(`odpDeclBlock(getOdp('odp-interna')).includes("opAnnullaDichiarazioneAsk('${decl(app, 'avvio', 0)}')")`));
  });

  it('le fasi che non ricevono pezzi buoni si chiudono da sole', () => {
    const app = conTondo();
    lancia(app, 'interna', 3);
    avvia(app, 'odp-interna', 0);
    dichiara(app, 'odp-interna', 0, { qty: 0, scrap: 3 });
    assert.equal(stato(app, 'odp-interna', 1), 'chiusa');
    assert.equal(statoOdp(app), 'completato');
    assert.equal(app.eval(`(invalidateCaches(), prodWipInCasa('tondo'))`), 0, 'il materiale non resta nel lavoro in corso');
  });

  it('una fase vuota resta aperta finché la precedente non è chiusa', () => {
    const app = conTondo();
    lancia(app, 'interna', 3);
    avvia(app, 'odp-interna', 0);
    dichiara(app, 'odp-interna', 0, { qty: 0, scrap: 1 });
    assert.equal(stato(app, 'odp-interna', 1), 'attesa');
  });

  it("l'officina non commissiona fasi a un terzista, e non vede il comando", () => {
    const app = conDb();
    lancia(app, 'esterna', 10);
    app.asRole('officina');
    assert.equal(app.eval(`(function(){ const o = getOdp('odp-esterna'); return !!opGeneraOdl(o.id, o.phases[0].id); })()`), false);
    assert.equal(app.eval('db.workOrders.length'), 0);
    assert.ok(!app.eval(`odpPhaseRows(getOdp('odp-esterna')).includes('opGeneraOdlAsk')`));
    app.asRole('acquisti');
    assert.ok(app.eval(`odpPhaseRows(getOdp('odp-esterna')).includes('opGeneraOdlAsk')`));
  });
});

// ═══════════════════════════════════════════════════════════
//  Lotto, scorta minima e importo delle parti da lanciare (0.105.6)
// ═══════════════════════════════════════════════════════════
// Le quantità dei piani con parti a lotto o a scorta cambiano di proposito: la
// regola è quella degli acquisti (netRequirement), e i test la fissano qui.
describe('ODP dal piano: lotto, scorta minima, importo', () => {
  const ordina = (app, planId) => Number(app.eval(`(invalidateCaches(),
    mrpMakeRows(getPlan(${JSON.stringify(planId || 'pl1')})).find(x => x.item.id === 'interna').qtyOrder)`));
  const conParte = campi => {
    const app = conDb();
    app.eval(`Object.assign(getItem('interna'), ${JSON.stringify(campi || {})}); invalidateCaches();`);
    return app;
  };
  const lanciaDalPiano = (app, planId) => app.eval(`(function(){ const p = getPlan(${JSON.stringify(planId || 'pl1')});
    const o = planNewOdp(p, planRowIndex(p).get('make#interna')); saveDB(); invalidateCaches(); return o.qty; })()`);

  it('la scheda di generazione mostra il costo dei pezzi da lanciare, non zero', () => {
    const app = conDb();
    const costo = Number(app.eval(`costOf('interna').total`));
    assert.ok(costo > 0);
    const html = () => app.eval(`(invalidateCaches(), planDocsBody(planDocGroups(planDocRows(getPlan('pl1'), 'odp')
      .filter(r => r.qtyOrder > 0), 'odp'), 'pl1', 'odp'))`);
    assert.ok(html().includes(app.eval(`fmtN(${costo * 6})`)), 'sei pezzi al loro costo');
    // Dichiarati due pezzi fatti, l'importo è quello dei quattro che restano.
    app.eval(`produzioneDichiara('pl1', 'interna', 2, '')`);
    assert.equal(Number(app.eval(`(invalidateCaches(), mrpMakeRows(getPlan('pl1'))[0].amount)`)), costo * 4);
    assert.ok(html().includes(app.eval(`fmtN(${costo * 4})`)));
  });

  it('senza lotto e senza scorta la quantità resta quella del piano', () => {
    assert.equal(ordina(conParte()), 6);
  });

  it('la quantità si arrotonda al lotto di riordino della parte', () => {
    assert.equal(ordina(conParte({ lotSize: 50 })), 50, 'a multipli');
    assert.equal(ordina(conParte({ lotSize: 4 })), 8, 'sei pezzi sono due lotti da quattro');
    assert.equal(ordina(conParte({ lotSize: 10, lotMode: 'min' })), 10, 'sotto la soglia si lancia la soglia');
    assert.equal(ordina(conParte({ lotSize: 4, lotMode: 'min' })), 6, 'sopra la soglia si lancia quello che manca');
  });

  it('il piano più urgente riporta lo scaffale alla scorta minima, una volta sola', () => {
    const app = conParte({ safetyStock: 20 });
    app.eval(`db.plans.push({ id: 'pl2', number: 'FAB-2026-002', date: '2026-07-02', active: true,
      lines: [{ id: 'l2', itemId: 'grp', qty: 1, dueDate: '2026-12-30' }] }); invalidateCaches();`);
    assert.equal(ordina(app, 'pl1'), 26, 'sei per il piano, venti per la scorta');
    assert.equal(ordina(app, 'pl2'), 3, 'il secondo della fila non se la ricarica');
    assert.equal(lanciaDalPiano(app, 'pl1'), 26);
    assert.equal(ordina(app, 'pl1'), 0, "lanciato l'ODP, i suoi pezzi attesi chiudono il buco");
    assert.equal(ordina(app, 'pl2'), 3);
  });

  it('con la scorta e il lotto insieme si lancia il lotto che le copre', () => {
    const app = conParte({ safetyStock: 20, lotSize: 50 });
    assert.equal(ordina(app), 50);
    lanciaDalPiano(app);
    assert.equal(ordina(app), 0);
    // Finito l'ODP e versati i 50, il piano non ne propone altri: i 44 in più
    // sono a scaffale, sopra la scorta.
    app.eval(`(function(){ addMovement('tondo', 'carico', 200, '');
      const o = db.prodOrders[0]; opLancia(o.id);
      o.phases.forEach(f => { opAvvia(o.id, f.id, {}); opDichiara(o.id, f.id, { qty: 50 }); }); })()`);
    assert.equal(app.eval(`db.prodOrders[0].status`), 'completato');
    assert.equal(onHand(app, 'interna'), 50);
    assert.equal(ordina(app), 0);
  });

  it('uno scaffale già sopra la scorta non fa lanciare niente in più', () => {
    const app = conParte({ safetyStock: 20 });
    app.eval(`(addMovement('interna', 'carico', 22, ''), invalidateCaches())`);
    // 22 a scaffale, 20 di scorta: il piano ne prende 2 e ne fabbrica 4.
    assert.equal(ordina(app), 4);
  });

  it('la scheda dice da dove vengono i pezzi in più', () => {
    const app = conParte({ safetyStock: 20, lotSize: 50 });
    const html = app.eval(`(invalidateCaches(), planDocsBody(planDocGroups(planDocRows(getPlan('pl1'), 'odp')
      .filter(r => r.qtyOrder > 0), 'odp'), 'pl1', 'odp'))`);
    assert.match(html, /per la scorta minima/);
    assert.match(html, /lotto di 50/);
  });
});
