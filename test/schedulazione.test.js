// Programmazione a ritroso del fabbisogno (views-mrp.js, dalla 0.88.0).
//
// Da «il gruppo serve venerdì 16 ottobre» a quando comincia ciascuna cosa:
// montaggio, fasi interne, tratte dal terzista, materiale da ordinare. Le date
// attese sono scritte a mano e si rifanno a mente col calendario di ottobre
// 2026 davanti: è il punto di questi casi.
//
// Il caso di riferimento:
//   gruppo A, 2 pezzi, serve ven 16/10; montaggio 2 gg → comincia mer 14/10
//   perno P, 4 per gruppo = 8 pezzi, serve mer 14/10:
//     fase 40 fresatura interna, 2 h/pz × 8 = 16 h a 8 h/gg = 2 gg → lun 12 – mer 14
//     fasi 20-30 zincatura da Beta, 3 + 1 gg + 2 di trasporto = 6 gg di calendario
//            → rientro lun 12, invio mar 6
//     fase 10 tornitura interna, 1 h/pz × 8 = 8 h = 1 gg → lun 5 – mar 6
//   tondo, materiale del ciclo di P: serve lun 5/10; listino a 10 gg → ordinare ven 25/9
// (giorni dei fornitori di calendario: vedi conDb)

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, parte, asm, comp, wc } = require('./fixtures.js');

function conDb(over, settings) {
  const app = loadApp({ silent: true });
  app.asRole('admin');
  app.setDb(makeDb(Object.assign({
    suppliers: [{ id: 'beta', name: 'Beta', active: true, transitDays: 2 }],
    workCenters: [
      Object.assign(wc('tor', 40), { hoursPerDay: 8 }),
      Object.assign(wc('zin', 30), {}),
      Object.assign(wc('fre', 45), { hoursPerDay: 8 }),
    ],
    items: [
      Object.assign(mat('tondo', 5), { supplierId: 'beta', activePriceId: 'q1',
        priceList: [{ id: 'q1', supplierId: 'beta', price: 5, leadDays: 10, date: '2026-01-01' }] }),
      parte('perno', { cycle: [
        { kind: 'item', itemId: 'tondo', qty: 2 },
        { kind: 'op', workCenterId: 'tor', supplierId: '', costMode: 'fisso', cost: 1, hours: 1, days: 0, note: '' },
        { kind: 'op', workCenterId: 'zin', supplierId: 'beta', costMode: 'fisso', cost: 2, hours: 0, days: 3, note: '' },
        { kind: 'op', workCenterId: 'zin', supplierId: 'beta', costMode: 'fisso', cost: 1, hours: 0, days: 1, note: '' },
        { kind: 'op', workCenterId: 'fre', supplierId: '', costMode: 'fisso', cost: 1, hours: 2, days: 0, note: '' },
      ] }),
      asm('grp', 'gruppo', { components: [comp('perno', 4)], assemblyDays: 2 }),
    ],
    plans: [{ id: 'pl1', number: 'FAB-2026-001', title: '', date: '2026-09-01', notes: '', active: true,
      lines: [{ id: 'l1', itemId: 'grp', qty: 2, dueDate: '2026-10-16' }] }],
  }, over || {}), ) );
  // Il caso di riferimento conta i giorni dei fornitori di calendario, come li
  // contava l'app fino alla 0.109: le date sono scritte a mano su quella
  // regola. I giorni lavorativi (di serie dalla 0.110.0) hanno i loro casi in
  // giorni-fornitori.test.js.
  app.eval("db.settings.calendar = Object.assign(calDefault(), { supplierDays: 'calendario' }); invalidateCaches();");
  if (settings) app.eval(`Object.assign(db.settings, ${JSON.stringify(settings)}); invalidateCaches();`);
  return app;
}
const ev = (app, code) => JSON.parse(app.eval(`JSON.stringify(${code})`));
const esplodi = app => ev(app, `(() => { const e = mrpExplode(getPlan('pl1').lines); return {
  buy: e.buy.map(x => ({ code: x.item.code, qty: x.qty, due: x.due })),
  make: e.make.map(x => ({ code: x.item.code, qty: x.qty, due: x.due, start: x.start })),
  phases: e.phases.map(x => ({ opIndex: x.opIndex, due: x.due, start: x.start })),
  load: e.load.map(x => ({ wc: x.workCenterId, week: x.week, hours: x.hours })) }; })()`);

describe('Programmazione: la catena a ritroso', () => {
  it('il montaggio anticipa la data in cui servono i componenti', () => {
    const m = esplodi(conDb()).make.find(x => x.code === 'PERNO');
    assert.equal(m.due, '2026-10-14', 'due giorni lavorativi prima di venerdì 16');
    assert.equal(m.qty, 8);
  });

  it('le fasi del ciclo si mettono in fila, dall ultima alla prima', () => {
    const e = esplodi(conDb());
    const m = e.make.find(x => x.code === 'PERNO');
    assert.equal(m.start, '2026-10-05', 'la tornitura comincia lunedì 5');
    const f = e.phases.sort((a, b) => a.opIndex - b.opIndex);
    assert.deepEqual(f.map(x => [x.opIndex, x.start, x.due]), [
      [1, '2026-10-06', '2026-10-12'],
      [2, '2026-10-06', '2026-10-12'],
    ], 'la tratta 20-30 parte martedì 6 e rientra lunedì 12, quando comincia la fresatura');
  });

  // 0.105.5: la stessa parte in due rami si fabbrica in un lotto solo, e i
  // tempi sono quelli del lotto. Prima ciascun ramo si programmava sui suoi pezzi.
  it('una parte comune a due righe si programma sul lotto intero', () => {
    const due = conDb({ plans: [{ id: 'pl1', number: 'FAB-2026-001', title: '', date: '2026-09-01', notes: '', active: true,
      lines: [{ id: 'l1', itemId: 'grp', qty: 1, dueDate: '2026-10-16' }, { id: 'l2', itemId: 'grp', qty: 1, dueDate: '2026-10-16' }] }] });
    const m = esplodi(due).make.find(x => x.code === 'PERNO');
    assert.equal(m.qty, 8);
    assert.equal(m.start, '2026-10-05', 'come una riga sola da 2 gruppi');
    const alberi = ev(due, `planFeasibility(getPlan('pl1')).map(f => f.tree.children[0].start)`);
    assert.deepEqual(alberi, ['2026-10-05', '2026-10-05'], 'l\'albero dice la stessa data della riga aggregata');
  });

  it('il materiale del ciclo serve quando parte la prima fase', () => {
    const t = esplodi(conDb()).buy.find(x => x.code === 'TONDO');
    assert.equal(t.due, '2026-10-05');
    assert.equal(t.qty, 16);
  });

  it('la data d ordine toglie i giorni del fornitore, di calendario', () => {
    const r = ev(conDb(), "mrpBuyRows(getPlan('pl1'), false).map(r => ({ due: r.due, orderBy: r.orderBy, leadDays: r.leadDays }))")[0];
    assert.deepEqual(r, { due: '2026-10-05', orderBy: '2026-09-25', leadDays: 10 });
  });

  it('una data d ordine che cade di sabato si anticipa al venerdì', () => {
    const app = conDb();
    app.eval("getItem('tondo').priceList[0].leadDays = 9; invalidateCaches();");
    const r = ev(app, "mrpBuyRows(getPlan('pl1'), false)[0].orderBy");
    assert.equal(r, '2026-09-25', 'lunedì 5 meno 9 giorni è sabato 26');
  });

  it('la riga di conto lavoro dice invio e rientro della tratta, trasporto compreso', () => {
    const r = ev(conDb(), `mrpPhaseRuns(mrpPhaseRows(getPlan('pl1'))).map(r => ({ due: r.due, orderBy: r.orderBy, leadDays: r.leadDays, fasi: r.phaseNos }))`);
    assert.deepEqual(r, [{ due: '2026-10-12', orderBy: '2026-10-06', leadDays: 6, fasi: [20, 30] }]);
  });

  it('il documento al terzista chiede il rientro, non la consegna del gruppo', () => {
    const l = ev(conDb(), "planPhaseDocLine(mrpPhaseRuns(mrpPhaseRows(getPlan('pl1')))[0], true).deliveryDate");
    assert.equal(l, '2026-10-12');
  });

  it('la parte da fabbricare va lanciata all inizio della prima fase', () => {
    const r = ev(conDb(), "mrpMakeRows(getPlan('pl1')).map(r => ({ due: r.due, orderBy: r.orderBy }))")[0];
    assert.deepEqual(r, { due: '2026-10-14', orderBy: '2026-10-05' });
  });

  it('il carico va nella settimana in cui la fase comincia', () => {
    const l = esplodi(conDb()).load.map(x => [x.wc, x.week, x.hours]).sort();
    assert.deepEqual(l, [['fre', '2026-W42', 16], ['tor', '2026-W41', 8]]);
  });
});

describe('Programmazione: i tempi', () => {
  it('le ore al giorno si ricavano dalla capacità settimanale', () => {
    // 20 h a settimana su 5 giorni = 4 h al giorno: 16 h di fresatura sono 4 giorni.
    const app = conDb();
    app.eval("Object.assign(getWorkCenter('fre'), { hoursPerDay: 0, capacityHours: 20 }); invalidateCaches();");
    const m = esplodi(app).phases[0];
    assert.equal(m.due, '2026-10-08', 'la fresatura comincia giovedì 8');
  });

  it('attrezzaggio e coda allungano la fase interna', () => {
    // tornitura: 4 h di attrezzaggio + 8 h = 12 h → 2 gg, più 1 di coda = 3 gg prima di martedì 6.
    const app = conDb();
    app.eval("Object.assign(getWorkCenter('tor'), { setupHours: 4, queueDays: 1 }); invalidateCaches();");
    assert.equal(esplodi(app).make[0].start, '2026-10-01');
  });

  it('i giorni di montaggio, se non dichiarati, vengono dalle lavorazioni dell assieme', () => {
    // 6 h × 2 gruppi = 12 h a 8 h/gg = 2 giorni: lo stesso risultato dei due dichiarati.
    const app = conDb();
    app.eval(`Object.assign(getItem('grp'), { assemblyDays: 0, operations: [{ workCenterId: 'tor', hours: 6, note: '' }] });
      invalidateCaches();`);
    assert.equal(esplodi(app).make[0].due, '2026-10-14');
  });

  it('il margine fra livelli anticipa ancora i componenti', () => {
    const e = esplodi(conDb(null, { scheduleBufferDays: 1 }));
    assert.equal(e.make[0].due, '2026-10-13');
    assert.equal(e.make[0].start, '2026-10-01');
    assert.equal(e.buy[0].due, '2026-09-30');
  });

  it('il calendario conta: un festivo in mezzo sposta tutto di un giorno', () => {
    const app = conDb(null, { calendar: { workDays: [1, 2, 3, 4, 5], holidays: [], easter: true,
      closures: [{ from: '2026-10-13', to: '2026-10-13', note: 'Patrono' }] } });
    const m = esplodi(app).make[0];
    assert.equal(m.due, '2026-10-14', 'il montaggio 14-15 non tocca il patrono');
    assert.equal(esplodi(app).phases[0].due, '2026-10-09', 'la fresatura salta martedì 13: comincia venerdì 9');
  });
});

describe('Programmazione: più domande e dati mancanti', () => {
  it('la stessa parte in due rami tiene le date più vicine', () => {
    // In più un perno sciolto per venerdì 9. Il lotto è uno, da 9 pezzi
    // (0.105.5), e i tempi sono i suoi: fresatura 18 h → 3 gg (mar 6), rientro
    // mar 6 − 6 gg = mer 30, tornitura 9 h → 2 gg → lun 28.
    const app = conDb();
    app.eval("getPlan('pl1').lines.push({ id: 'l2', itemId: 'perno', qty: 1, dueDate: '2026-10-09' }); invalidateCaches();");
    const e = esplodi(app);
    assert.deepEqual(e.make.map(x => [x.qty, x.due, x.start]), [[9, '2026-10-09', '2026-09-28']]);
    assert.deepEqual(e.phases.map(x => [x.start, x.due]), [['2026-09-30', '2026-10-06'], ['2026-09-30', '2026-10-06']]);
    assert.equal(e.buy[0].due, '2026-09-28');
  });

  it('senza tempi dichiarati le date restano quelle della consegna, come prima', () => {
    const app = conDb();
    app.eval(`getItem('perno').cycle.forEach(r => { if (r.kind === 'op') { r.hours = 0; r.days = 0; } });
      getItem('grp').assemblyDays = 0; getSupplier('beta').transitDays = 0; invalidateCaches();`);
    const e = esplodi(app);
    assert.equal(e.make[0].due, '2026-10-16');
    assert.equal(e.make[0].start, '2026-10-16');
    assert.equal(e.buy[0].due, '2026-10-16');
    assert.deepEqual(e.phases.map(x => [x.start, x.due]), [['2026-10-16', '2026-10-16'], ['2026-10-16', '2026-10-16']]);
  });

  it('una riga senza data non inventa date', () => {
    const app = conDb();
    app.eval("getPlan('pl1').lines[0].dueDate = ''; invalidateCaches();");
    const e = esplodi(app);
    assert.equal(e.make[0].due, '');
    assert.equal(e.make[0].start, '');
    assert.equal(e.buy[0].due, '');
  });

  it('un ordine di lavoro scritto a mano ricava l invio dal rientro, trasporto compreso', () => {
    const r = ev(conDb(), "(() => { const r = clRunRow(getItem('perno'), { from: 1, to: 2 }, 8, '2026-10-12'); return { orderBy: r.orderBy, leadDays: r.leadDays }; })()");
    assert.deepEqual(r, { orderBy: '2026-10-06', leadDays: 6 });
  });
});

describe('Programmazione: i tempi nelle impostazioni Excel', () => {
  const foglio = (app, nome) => ev(app, `settingsSheets().find(s => s.name === ${JSON.stringify(nome)}).aoa`);

  it('i centri di lavoro escono con ore al giorno, attrezzaggio e coda', () => {
    const app = conDb();
    app.eval("Object.assign(getWorkCenter('tor'), { setupHours: 1.5, queueDays: 2 });");
    const aoa = foglio(app, 'Centri di lavoro');
    assert.deepEqual(aoa[0].slice(-3), ['Ore/giorno', 'Attrezzaggio h', 'Coda gg']);
    assert.deepEqual(aoa.find(r => r[0] === 'CDL tor').slice(-3), [8, 1.5, 2]);
  });

  it('reimportati, i tempi tornano; una colonna assente li lascia com erano', () => {
    const app = conDb();
    app.eval(`importSettingsSheets({ 'Centri di lavoro': [
      { 'Nome': 'CDL tor', 'Ore/giorno': 7.5, 'Coda gg': 1 },
      { 'Nome': 'CDL fre', 'Tariffa oraria': 45 } ] })`);
    assert.deepEqual(ev(app, "[getWorkCenter('tor').hoursPerDay, getWorkCenter('tor').queueDays, getWorkCenter('fre').hoursPerDay]"), [7.5, 1, 8]);
  });

  it('un tempo negativo non entra e si dice', () => {
    const app = conDb();
    const rep = ev(app, `importSettingsSheets({ 'Centri di lavoro': [{ 'Nome': 'CDL tor', 'Ore/giorno': -1 }] })`);
    assert.ok(JSON.stringify(rep).includes('ore al giorno non valida'));
    assert.equal(ev(app, "getWorkCenter('tor').hoursPerDay"), 8);
  });

  it('il trasporto del terzista esce e rientra col foglio Fornitori', () => {
    const app = conDb();
    const aoa = foglio(app, 'Fornitori');
    assert.equal(aoa[0][aoa[0].length - 1], 'Trasporto CL gg');
    assert.equal(aoa[1][aoa[1].length - 1], 2);
    app.eval(`importSettingsSheets({ 'Fornitori': [{ 'Nome': 'Beta', 'Trasporto CL gg': 4 }] })`);
    assert.equal(ev(app, "getSupplier('beta').transitDays"), 4);
  });
});

describe('Programmazione: le schede', () => {
  it('le impostazioni mostrano il calendario di fabbrica', () => {
    const html = conDb().eval('renderSettings()');
    assert.match(html, /Calendario di fabbrica/);
    assert.match(html, /value="25\/12, 26\/12|26\/12/);
    assert.match(html, /id="set-sched-buf"/);
  });

  it('la migrazione dà a tutti il calendario di serie e i tempi a zero', () => {
    const app = conDb();
    app.eval('delete db.settings.calendar; db.workCenters.forEach(w => { delete w.queueDays; }); migrateDB();');
    const r = ev(app, '[db.settings.calendar.workDays, db.settings.scheduleBufferDays, getWorkCenter(\'tor\').queueDays, getItem(\'grp\').assemblyDays]');
    assert.deepEqual(r, [[1, 2, 3, 4, 5], 0, 0, 2]);
  });
});

// ─── 0.89.0: l'albero, la data fattibile, l'agenda ───
// «Oggi» si ferma con oggiISO(): è la sola lettura dell'orologio che il
// programma fa.
const oggi = (app, iso) => { app.eval(`oggiISO = () => ${JSON.stringify(iso)}; invalidateCaches();`); return app; };
const fattibile = app => ev(app, `planFeasibility(getPlan('pl1')).map(f => ({ fattibile: f.fattibile, margine: f.margine,
  critico: f.critico.map(n => n.item.code) }))`)[0];

describe('Programma: l albero di una riga di piano', () => {
  it('dice le stesse date degli aggregati del fabbisogno', () => {
    const t = ev(conDb(), `(() => { const t = schedTree('grp', 2, '2026-10-16');
      return schedFlat(t).map(x => [x.livello, x.node.item.code, x.node.kind, x.node.start, x.node.end]); })()`);
    assert.deepEqual(t, [
      [0, 'GRP', 'asm', '2026-10-14', '2026-10-16'],
      [1, 'PERNO', 'make', '2026-10-05', '2026-10-14'],
      [2, 'TONDO', 'buy', '2026-09-25', '2026-10-05'],
    ]);
  });

  it('le tappe della parte sono in ordine di esecuzione, con la tratta unita', () => {
    const st = ev(conDb(), `schedTree('perno', 8, '2026-10-14').steps.map(s => [s.from, s.to, s.esterna, s.start, s.end, s.days])`);
    assert.deepEqual(st, [
      [0, 0, false, '2026-10-05', '2026-10-06', 1],
      [1, 2, true, '2026-10-06', '2026-10-12', 6],
      [3, 3, false, '2026-10-12', '2026-10-14', 2],
    ]);
  });
});

describe('Programma: la data fattibile', () => {
  it('cominciando per tempo c è margine, e la catena è quella del tondo', () => {
    // Lun 21/9: tondo arriva gio 1/10, tornitura 1→2, zincatura 2→8,
    // fresatura 8→12, montaggio 12→14. Richiesto ven 16: due giorni di margine.
    assert.deepEqual(fattibile(oggi(conDb(), '2026-09-21')),
      { fattibile: '2026-10-14', margine: 2, critico: ['GRP', 'PERNO', 'TONDO'] });
  });

  it('cominciando tardi la consegna non regge, e il margine lo dice in giorni lavorativi', () => {
    // Gio 1/10: il tondo arriva domenica 11, si lavora da lunedì 12 → pronto ven 23.
    assert.deepEqual(fattibile(oggi(conDb(), '2026-10-01')),
      { fattibile: '2026-10-23', margine: -5, critico: ['GRP', 'PERNO', 'TONDO'] });
  });

  it('il materiale a magazzino è pronto oggi, e il percorso si ferma alla parte', () => {
    const app = oggi(conDb(), '2026-09-21');
    app.eval("addMovement('tondo', 'rettifica', 16, 'inventario'); invalidateCaches();");
    assert.deepEqual(fattibile(app), { fattibile: '2026-10-02', margine: 10, critico: ['GRP', 'PERNO'] });
  });

  it('il materiale già ordinato è pronto alla data confermata', () => {
    const app = oggi(conDb(), '2026-09-21');
    app.eval(`db.orders.push({ id: 'o1', number: 'ODA-2026-001', status: 'inviato', supplierId: 'beta', active: true,
      lines: [{ id: 'ol1', itemId: 'tondo', qty: 16, received: 0, deliveryDate: '2026-09-25', confirmedDate: '2026-09-28' }] });
      invalidateCaches();`);
    // Lun 28: tornitura 28→29, zincatura 29/9→5/10, fresatura 5→7, montaggio 7→9.
    assert.equal(fattibile(app).fattibile, '2026-10-09');
  });

  // Dalla 0.105.6 gli arrivi sono quelli del netto: nell'unità di gestione, e
  // anche senza data.
  it("una riga d'ordine nell'altra unità si converte prima di coprire", () => {
    const app = oggi(conDb(), '2026-09-21');
    app.eval(`Object.assign(getItem('tondo'), { altUom: 'm', altFactor: 2.5 });
      db.orders.push({ id: 'o1', number: 'ODA-2026-001', status: 'inviato', supplierId: 'beta', active: true,
      lines: [{ id: 'ol1', itemId: 'tondo', qty: 16, uom: 'm', received: 0, confirmedDate: '2026-09-28' }] });
      invalidateCaches();`);
    // 16 m sono 6,4 kg su 16: il resto va comprato col tempo del fornitore.
    assert.equal(fattibile(app).fattibile, '2026-10-14');
  });

  it('il materiale ordinato senza data non si ricompra: vale come in tempo', () => {
    const app = oggi(conDb(), '2026-09-21');
    app.eval(`db.orders.push({ id: 'o1', number: 'ODA-2026-001', status: 'inviato', supplierId: 'beta', active: true,
      lines: [{ id: 'ol1', itemId: 'tondo', qty: 16, received: 0 }] }); invalidateCaches();`);
    assert.equal(fattibile(app).fattibile, '2026-10-02');
  });

  it('la tabella del piano mostra fattibile e margine, e il percorso critico si apre', () => {
    const app = oggi(conDb(), '2026-10-01');
    app.eval("currentPlanId = 'pl1';");
    const h = app.eval("renderPlanEdit('pl1')");
    assert.match(h, /planCriticoModal\('pl1','l1'\)/);
    assert.match(h, /-5 gg/);
    app.eval("planCriticoModal('pl1', 'l1')");
  });
});

describe('Programma: l agenda del piano', () => {
  const agenda = app => ev(app, "planAgenda(getPlan('pl1')).map(e => [e.data, e.tipo, e.codice, e.stato])");

  it('mette in fila ordini, lanci, invii, rientri, fasi, montaggio e consegna', () => {
    assert.deepEqual(agenda(oggi(conDb(), '2026-09-21')), [
      ['2026-09-25', 'ordina', 'TONDO', 'da fare'],
      ['2026-10-05', 'lancio', 'PERNO', 'da fare'],
      ['2026-10-05', 'lavora', 'PERNO', 'previsto'],
      ['2026-10-06', 'invia', 'PERNO', 'da fare'],
      ['2026-10-12', 'rientro', 'PERNO', 'previsto'],
      ['2026-10-12', 'lavora', 'PERNO', 'previsto'],
      ['2026-10-14', 'montaggio', 'GRP', 'previsto'],
      ['2026-10-16', 'consegna', 'GRP', 'previsto'],
    ]);
  });

  it('un ordine emesso dal piano segna l acquisto come fatto', () => {
    const app = oggi(conDb(), '2026-09-21');
    app.eval(`db.orders.push({ id: 'o1', number: 'ODA-2026-001', status: 'bozza', supplierId: 'beta', planId: 'pl1', active: true,
      lines: [{ id: 'ol1', itemId: 'tondo', qty: 16, received: 0, deliveryDate: '2026-10-05' }] }); invalidateCaches();`);
    assert.deepEqual(agenda(app)[0], ['2026-09-25', 'ordina', 'TONDO', 'fatto']);
  });

  it('una data passata senza documento è in ritardo', () => {
    assert.deepEqual(agenda(oggi(conDb(), '2026-10-01'))[0], ['2026-09-25', 'ordina', 'TONDO', 'ritardo']);
  });

  it('si esporta in forma lunga e si disegna nella scheda del piano', () => {
    const app = oggi(conDb(), '2026-09-21');
    app.eval("currentPlanId = 'pl1';");
    const spec = ev(app, 'planAgendaExportSpec()');
    assert.equal(spec.sezioni[0].righe.length, 8);
    assert.equal(spec.sezioni[0].righe[0][1], 'Ordinare');
    assert.match(app.eval("renderPlanEdit('pl1')"), /Programma/);
  });

  it('il Riepilogo riporta invio e lancio ancora da fare', () => {
    const app = oggi(conDb(), '2026-09-21');
    const e = ev(app, "homeEventi().filter(x => x.tipo === 'programma').map(x => [x.data, x.testo])");
    assert.deepEqual(e.sort(), [['2026-10-05', 'Lanciare in produzione PERNO'], ['2026-10-06', 'Inviare al terzista PERNO']]);
  });
});

// ─── 0.90.0: il Gantt e le date congelate sugli ordini di produzione ───
describe('Programma: il Gantt del piano', () => {
  it('disegna una riga per nodo, con il percorso critico e le date nel suggerimento', () => {
    const app = oggi(conDb(), '2026-10-01');
    app.eval("currentPlanId = 'pl1';");
    const h = app.eval("planGanttHtml(getPlan('pl1'), planFeasibility(getPlan('pl1')))");
    assert.match(h, /role="img" aria-label="Gantt di GRP: 3 righe/);
    assert.match(h, /<title>PERNO — fasi 20-30 CDL zin da Beta: dal 06\/10\/2026 al 12\/10\/2026<\/title>/);
    assert.match(h, /<title>TONDO — acquisto da Beta \(10 gg\): ordinare entro 25\/09\/2026, serve il 05\/10\/2026<\/title>/);
    assert.equal((h.match(/class="gantt-lbl gantt-crit"/g) || []).length, 3, 'gruppo, perno e tondo sono critici');
  });

  it('una distinta enorme si disegna fino al tetto, e lo dice', () => {
    const app = oggi(conDb(), '2026-09-21');
    app.eval("getItem('grp').components = Array.from({ length: 70 }, () => ({ itemId: 'tondo', qty: 1, scrapPct: 0 })); invalidateCaches();");
    const h = app.eval("planGanttHtml(getPlan('pl1'), planFeasibility(getPlan('pl1')))");
    assert.match(h, /Disegnate le prime 60 righe su 71/);
  });

  it('senza date di consegna non disegna niente e lo dice', () => {
    const app = conDb();
    app.eval("getPlan('pl1').lines[0].dueDate = '';");
    assert.match(app.eval("planGanttHtml(getPlan('pl1'), planFeasibility(getPlan('pl1')))"), /Nessuna riga di piano con una data/);
  });
});

describe('Programma: le date delle fasi di un ordine di produzione', () => {
  const nuovo = (app, due) => app.eval(`(() => { const o = odpNew(getItem('perno'), 8, ${JSON.stringify(due)}); db.prodOrders.push(o); return o.id; })()`);
  const date = (app, id) => ev(app, `getOdp(${JSON.stringify(id)}).phases.map(f => [f.seq, f.plannedStart, f.plannedEnd])`);

  it('al momento della creazione ogni fase ha inizio e fine pianificati', () => {
    const app = conDb();
    const id = nuovo(app, '2026-10-14');
    assert.deepEqual(date(app, id), [
      [10, '2026-10-05', '2026-10-06'],
      [20, '2026-10-06', '2026-10-12'],
      [30, '2026-10-06', '2026-10-12'],
      [40, '2026-10-12', '2026-10-14'],
    ]);
  });

  it('in bozza le date seguono la data dell ordine', () => {
    const app = conDb();
    const id = nuovo(app, '2026-10-14');
    app.eval(`odpSetField(${JSON.stringify(id)}, 'dueDate', '2026-10-21')`);
    assert.deepEqual(date(app, id)[0], [10, '2026-10-12', '2026-10-13']);
    assert.deepEqual(date(app, id)[3], [40, '2026-10-19', '2026-10-21']);
  });

  it('l ordine di lavoro nato dall ordine chiede il rientro della tratta, non la fine dell ordine', () => {
    const app = conDb();
    const id = nuovo(app, '2026-10-14');
    const r = ev(app, `(() => { const o = getOdp(${JSON.stringify(id)}); const r = opRunDocRow(o, o.phases[1]); return [r.due, r.orderBy]; })()`);
    assert.deepEqual(r, ['2026-10-12', '2026-10-06']);
  });

  it('un ordine di prima, senza date, ragiona ancora sulla data dell ordine', () => {
    const app = conDb();
    const id = nuovo(app, '2026-10-14');
    app.eval(`getOdp(${JSON.stringify(id)}).phases.forEach(f => { f.plannedStart = ''; f.plannedEnd = ''; })`);
    const r = ev(app, `(() => { const o = getOdp(${JSON.stringify(id)}); return opRunDocRow(o, o.phases[1]).due; })()`);
    assert.equal(r, '2026-10-14');
  });

  it('ripianificare ricalcola le fasi aperte', () => {
    const app = conDb();
    const id = nuovo(app, '2026-10-14');
    app.eval(`(() => { const o = getOdp(${JSON.stringify(id)}); o.dueDate = '2026-10-21'; odpPianifica(o, true); })()`);
    assert.deepEqual(date(app, id)[3], [40, '2026-10-19', '2026-10-21']);
  });

  it('la tabella delle fasi mostra le date, e il ritardo di una fase non chiusa', () => {
    const app = oggi(conDb(), '2026-10-13');
    const id = nuovo(app, '2026-10-14');
    const h = app.eval(`odpPhaseRows(getOdp(${JSON.stringify(id)}))`);
    assert.match(h, /05\/10 → 06\/10/);
    assert.match(h, /Doveva finire il 06\/10\/2026/);
  });
});

// 0.110.0: i giorni dei fornitori sono lavorativi di serie. Lo stesso caso di
// riferimento, con la settimana di cinque giorni anche per Beta:
//   fresatura lun 12 – mer 14, come prima (è interna);
//   zincatura 6 gg lavorativi prima di lun 12 → invio ven 2/10;
//   tornitura 1 gg → comincia gio 1/10;
//   tondo: serve gio 1/10, listino a 10 gg lavorativi → ordinare gio 17/9.
describe('Programmazione: i giorni dei fornitori lavorativi', () => {
  const lavorativi = () => conDb(null, { calendar: { workDays: [1, 2, 3, 4, 5], holidays: [], easter: true,
    closures: [], supplierDays: 'lavorativi' } });

  it('la tratta dal terzista salta sabati e domeniche', () => {
    const r = ev(lavorativi(), `mrpPhaseRuns(mrpPhaseRows(getPlan('pl1'))).map(r => ({ due: r.due, orderBy: r.orderBy, leadDays: r.leadDays }))`);
    assert.deepEqual(r, [{ due: '2026-10-12', orderBy: '2026-10-02', leadDays: 6 }]);
  });

  it('la parte si lancia prima, e il materiale si ordina prima', () => {
    const app = lavorativi();
    assert.deepEqual(ev(app, "mrpMakeRows(getPlan('pl1')).map(r => ({ due: r.due, orderBy: r.orderBy }))")[0],
      { due: '2026-10-14', orderBy: '2026-10-01' });
    assert.deepEqual(ev(app, "mrpBuyRows(getPlan('pl1'), false).map(r => ({ due: r.due, orderBy: r.orderBy }))")[0],
      { due: '2026-10-01', orderBy: '2026-09-17' }, 'dieci giorni lavorativi prima di giovedì 1');
  });

  it('un archivio senza la scelta conta lavorativi', () => {
    const app = conDb(null, { calendar: { workDays: [1, 2, 3, 4, 5], holidays: [], easter: true, closures: [] } });
    assert.equal(ev(app, "mrpBuyRows(getPlan('pl1'), false)[0].orderBy"), '2026-09-17');
  });

  it('in avanti un acquisto arriva dopo i suoi giorni lavorativi', () => {
    const app = lavorativi();
    app.eval("schedOggi = () => '2026-09-25'");
    const fine = ev(app, "(() => { const t = schedTree('tondo', 16, '2026-10-01'); return schedForward(t, schedDisponibilita('pl1', getPlan('pl1').lines)); })()");
    assert.equal(fine, '2026-10-09', 'ordinato venerdì 25, dieci giorni lavorativi: venerdì 9');
  });

  it('di calendario, un arrivo di sabato si riceve il lunedì', () => {
    const app = conDb();
    app.eval("getItem('tondo').priceList[0].leadDays = 8; invalidateCaches(); schedOggi = () => '2026-09-25'");
    const fine = ev(app, "(() => { const t = schedTree('tondo', 16, '2026-10-01'); return schedForward(t, schedDisponibilita('pl1', getPlan('pl1').lines)); })()");
    assert.equal(fine, '2026-10-05', 'venerdì 25 più 8 giorni è sabato 3: il magazzino riceve lunedì 5');
  });

  it('le impostazioni offrono la scelta, e la leggono', () => {
    const app = conDb();
    const html = app.eval('renderSettings()');
    assert.match(html, /id="set-cal-sup"/);
    assert.match(html, /<option value="calendario" selected>/);
    const letto = ev(app, `(() => {
      document.querySelectorAll = () => [1, 2, 3, 4, 5].map(n => ({ checked: true, value: String(n) }));
      document.getElementById('set-cal-hol').value = '';
      document.getElementById('set-cal-sup').value = 'lavorativi';
      return readCalendarSettings().cal.supplierDays; })()`);
    assert.equal(letto, 'lavorativi');
  });
});
