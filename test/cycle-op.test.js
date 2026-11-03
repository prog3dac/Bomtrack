// Righe di lavorazione del ciclo: le ore come attributo di tempo.
//
// Fino alla 0.64.2 la normalizzazione di `migrateDB` cancellava `hours` da ogni
// riga `op` priva di `cost` — cioè da **tutte** quelle a costo orario, che il
// costo non ce l'hanno per definizione. La fase valeva zero al primo riavvio, e
// in silenzio. Questi casi tengono ferme le due cose che ne sono uscite: che le
// ore sopravvivono, e che a costo fisso non entrano nel costo.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');

// Il giro vero: si semina l'archivio e si carica, così si passa davvero dalle
// migrazioni invece di iniettare un db già a posto.
function caricato(blob) {
  const app = loadApp({ silent: true });
  app.seedStorage(blob);
  app.ref('Store').load();
  return app;
}
function conCiclo(cycle, hourlyRate) {
  return {
    schemaVersion: 2,
    workCenters: [{ id: 'w1', name: 'Tornitura', hourlyRate: hourlyRate === undefined ? 50 : hourlyRate, active: true }],
    items: [{ id: 'p', code: 'P1', name: 'Perno', type: 'parte', uom: 'pz', sourcing: 'make', cycle }],
    settings: { overheadPct: 0, marginPct: 0, currency: '€', partSourcingDefault: 'buy',
      uoms: [], uomDefault: 'pz', concepts: [], mpFamiliesSeeded: true, partFamiliesSeeded: true },
  };
}
const riga = app => app.snapshot().items[0].cycle[0];

describe('Ciclo: le ore sopravvivono al ricaricamento', () => {
  it('una fase a costo orario conserva ore, tariffa e costo (regressione 0.64.2)', () => {
    const app = caricato(conCiclo([{ kind: 'op', workCenterId: 'w1', supplierId: '',
      costMode: 'orario', hours: 2, rate: 60, note: '' }]));
    const r = riga(app);
    assert.equal(r.hours, 2, 'le ore sono state cancellate dalla normalizzazione');
    assert.equal(r.rate, 60);
    assert.equal(r.cost, undefined, 'a costo orario non si scrive un costo fisso');
    approx(app.ref('costOf')('p').total, 120);
  });

  it('due caricamenti di fila danno lo stesso risultato', () => {
    const blob = conCiclo([{ kind: 'op', workCenterId: 'w1', costMode: 'orario', hours: 2, rate: 60 }]);
    const primo = riga(caricato(blob));
    const app = caricato(blob);
    app.ref('Store').load();
    assert.deepEqual(riga(app), primo);
  });
});

describe('Ciclo: recupero delle righe già danneggiate', () => {
  it('senza ore ma con un costo, le ore si ricostruiscono dalla tariffa del centro', () => {
    // È la forma in cui il difetto lasciava le righe: costMode orario, cost
    // scritto d'ufficio come ore × tariffa del CENTRO, hours sparite.
    const app = caricato(conCiclo([{ kind: 'op', workCenterId: 'w1', costMode: 'orario', cost: 100, rate: 60 }], 50));
    assert.equal(riga(app).hours, 2, '100 € scritti a 50 €/h erano due ore');
  });

  it('il recupero divide per la tariffa del centro, non per quella del fornitore', () => {
    // Il difetto moltiplicava per wc.hourlyRate ignorando row.rate: dividere per
    // row.rate sbaglierebbe proprio dove il fornitore ha una tariffa propria.
    const app = caricato(conCiclo([{ kind: 'op', workCenterId: 'w1', costMode: 'orario', cost: 100, rate: 80 }], 50));
    assert.equal(riga(app).hours, 2);
  });

  it('senza centro di lavoro le ore non si inventano', () => {
    const app = caricato(conCiclo([{ kind: 'op', workCenterId: 'mancante', costMode: 'orario', cost: 100 }]));
    assert.equal(riga(app).hours, 0);
  });

  it('con un centro a tariffa zero le ore non si inventano', () => {
    const app = caricato(conCiclo([{ kind: 'op', workCenterId: 'w1', costMode: 'orario', cost: 100 }], 0));
    assert.equal(riga(app).hours, 0);
  });

  it('il recupero è idempotente: il secondo giro non lo rifà', () => {
    const blob = conCiclo([{ kind: 'op', workCenterId: 'w1', costMode: 'orario', cost: 100 }], 50);
    const app = caricato(blob);
    assert.equal(riga(app).hours, 2);
    app.ref('Store').load();
    assert.equal(riga(app).hours, 2, 'un secondo giro ha ricalcolato su un dato già a posto');
  });
});

describe('Ciclo: righe precedenti al modo di costo', () => {
  it('prendono il modo fisso e conservano le ore', () => {
    const app = caricato(conCiclo([{ kind: 'op', workCenterId: 'w1', hours: 3 }]));
    const r = riga(app);
    assert.equal(r.costMode, 'fisso');
    assert.equal(r.cost, 150, 'il costo già calcolato si conserva');
    assert.equal(r.hours, 3, 'le ore sono un tempo, non un residuo del calcolo');
  });

  it('un override già presente vince sul calcolo a ore e poi sparisce', () => {
    const app = caricato(conCiclo([{ kind: 'op', workCenterId: 'w1', hours: 3, costOverride: 30 }]));
    const r = riga(app);
    assert.equal(r.cost, 30);
    assert.equal(r.costOverride, undefined);
  });
});

describe('Ciclo: le ore di una fase fissa non entrano nel costo', () => {
  it('il costo resta quello concordato, non ore × tariffa', () => {
    // Il punto della separazione: un prezzo concordato col terzista è quello.
    // Farlo diventare ore × tariffa cambierebbe il costo da sé.
    const app = caricato(conCiclo([{ kind: 'op', workCenterId: 'w1', costMode: 'fisso', cost: 12, hours: 4 }]));
    const r = riga(app);
    assert.equal(r.hours, 4);
    approx(app.ref('cycleRowCost')(r), 12);
    approx(app.ref('costOf')('p').total, 12);
  });

  it('cambiare le ore non cambia il costo di una fase fissa', () => {
    const app = caricato(conCiclo([{ kind: 'op', workCenterId: 'w1', costMode: 'fisso', cost: 12, hours: 4 }]));
    const prima = app.ref('costOf')('p').total;
    app.eval('db.items[0].cycle[0].hours = 40; invalidateCaches();');
    approx(app.ref('costOf')('p').total, prima);
  });
});

describe('Ciclo: una fase nuova nasce con le ore', () => {
  it('anche a costo fisso, perche il centro lo occupa comunque', () => {
    const app = caricato(conCiclo([]));
    app.asRole('admin');
    app.eval('currentCycleItemId = "p"');
    app.el('cyc-wc').value = 'w1';
    app.el('cyc-opmode').value = 'fisso';
    app.el('cyc-opmin').value = '90';
    app.el('cyc-opcost').value = '20';
    app.eval('pickCycleOp()');
    const r = riga(app);
    assert.equal(r.costMode, 'fisso');
    assert.equal(r.cost, 20);
    assert.equal(r.hours, 1.5, 'una fase fissa nata senza ore rende incalcolabile il carico del centro');
  });

  it('a costo orario porta ore e tariffa', () => {
    const app = caricato(conCiclo([]));
    app.asRole('admin');
    app.eval('currentCycleItemId = "p"');
    app.el('cyc-wc').value = 'w1';
    app.el('cyc-opmode').value = 'orario';
    app.el('cyc-opmin').value = '120';
    app.el('cyc-oprate').value = '60';
    app.eval('pickCycleOp()');
    const r = riga(app);
    assert.equal(r.hours, 2);
    assert.equal(r.rate, 60);
    assert.equal(r.cost, undefined);
  });
});

describe('Ciclo: il riepilogo nomina le fasi che non si sono potute recuperare', () => {
  const segnale = app => app.eval('JSON.stringify(homeSegnali().find(s => s.vista === "cycles") || null)');

  it('una fase oraria con ore a zero finisce fra gli avvisi, con la sua fase e il suo centro', () => {
    const app = caricato(conCiclo([{ kind: 'op', workCenterId: 'mancante', costMode: 'orario', cost: 100 }]));
    const s = JSON.parse(segnale(app));
    assert.ok(s, 'nessun avviso per una fase che non costa nulla');
    assert.equal(s.n, 1);
    assert.equal(s.voci[0].testo, 'P1');
    assert.match(s.voci[0].titolo, /fase 10/);
    assert.match(s.voci[0].titolo, /centro mancante/);
  });

  it('la fase si numera fra le sole lavorazioni, non nell array intero', () => {
    const app = caricato(conCiclo([
      { kind: 'op', workCenterId: 'w1', costMode: 'fisso', cost: 5, hours: 1 },
      { kind: 'op', workCenterId: 'w1', costMode: 'orario', hours: 0, rate: 0 },
    ]));
    const s = JSON.parse(segnale(app));
    assert.match(s.voci[0].titolo, /fase 20/, 'la seconda lavorazione e la fase 20');
  });

  it('una fase recuperata non produce nessun avviso', () => {
    const app = caricato(conCiclo([{ kind: 'op', workCenterId: 'w1', costMode: 'orario', cost: 100 }], 50));
    assert.equal(JSON.parse(segnale(app)), null);
  });

  it('una fase a costo fisso senza ore non e un avviso: il suo costo esiste', () => {
    const app = caricato(conCiclo([{ kind: 'op', workCenterId: 'w1', costMode: 'fisso', cost: 12 }]));
    assert.equal(JSON.parse(segnale(app)), null);
  });
});

describe('Ciclo: ore e giorni sono due tempi diversi', () => {
  it('una fase esterna nasce con i giorni di attraversamento', () => {
    const app = caricato(conCiclo([]));
    app.asRole('admin');
    app.eval('currentCycleItemId = "p"');
    app.el('cyc-wc').value = 'w1';
    app.el('cyc-opsup').value = 'beta';
    app.el('cyc-opmode').value = 'fisso';
    app.el('cyc-opdays').value = '5';
    app.el('cyc-opcost').value = '12';
    app.eval('pickCycleOp()');
    const r = riga(app);
    assert.equal(r.supplierId, 'beta');
    assert.equal(r.days, 5);
    assert.equal(r.cost, 12);
  });

  it('modificare una fase esterna scrive i giorni e non azzera le ore fatturate', () => {
    const app = caricato(conCiclo([{ kind: 'op', workCenterId: 'w1', supplierId: 'beta',
      costMode: 'orario', hours: 2, rate: 30, days: 3, note: '' }]));
    app.asRole('admin');
    app.eval('currentCycleItemId = "p"');
    app.el('cyc-sup-0').value = 'beta';
    app.el('cyc-opdays-0').value = '7';
    app.el('cyc-ophours-0').value = '2';
    app.el('cyc-oprate-0').value = '30';
    app.eval('updateCycleRow(0)');
    const r = riga(app);
    assert.equal(r.days, 7);
    assert.equal(r.hours, 2, 'a costo orario le ore sono la base del prezzo e restano');
  });

  it('su una fase interna i giorni restano zero: il tempo sono le ore', () => {
    const app = caricato(conCiclo([{ kind: 'op', workCenterId: 'w1', supplierId: '',
      costMode: 'fisso', cost: 5, hours: 1.5, note: '' }]));
    app.asRole('admin');
    app.eval('currentCycleItemId = "p"');
    app.el('cyc-sup-0').value = '';
    app.el('cyc-opmin-0').value = '180';
    app.eval('updateCycleRow(0)');
    const r = riga(app);
    assert.equal(r.hours, 3);
    assert.equal(r.days, 0);
  });

  it('i giorni sopravvivono al ricaricamento, e due giri non li cambiano', () => {
    const blob = conCiclo([{ kind: 'op', workCenterId: 'w1', supplierId: 'beta',
      costMode: 'fisso', cost: 3, hours: 0, days: 4, note: '' }]);
    const app = caricato(blob);
    assert.equal(riga(app).days, 4);
    app.ref('Store').load();
    assert.equal(riga(app).days, 4);
  });

  it('una fase precedente ai giorni ne prende zero, non un valore inventato', () => {
    const app = caricato(conCiclo([{ kind: 'op', workCenterId: 'w1', supplierId: 'beta',
      costMode: 'fisso', cost: 3, hours: 0, note: '' }]));
    assert.equal(riga(app).days, 0);
  });

  // Cambiare il fornitore nella stessa chiamata che salva ore/giorni: al
  // momento del cambio il campo a video è ancora quello di prima (la riga si
  // ridisegna un istante dopo), e la lettura deve seguire quello che si vede,
  // non il nuovo stato appena scritto — altrimenti si legge un campo assente
  // e si azzera in silenzio quello vero.
  it('passando da interna a conto lavoro le ore già scritte non si perdono', () => {
    const app = caricato(conCiclo([{ kind: 'op', workCenterId: 'w1', supplierId: '',
      costMode: 'fisso', cost: 10, hours: 3, days: 0, note: '' }]));
    app.asRole('admin');
    app.eval('currentCycleItemId = "p"');
    // Il campo "Ore" era quello a video (fase interna): il valore c'è ancora,
    // anche se la riga non si è ancora ridisegnata dopo il cambio.
    app.el('cyc-opmin-0').value = '180';
    app.el('cyc-sup-0').value = 'beta';
    app.el('cyc-cost-in-0').value = '10';
    app.eval('onCycleRowSupplierChange(0)');
    const r = riga(app);
    assert.equal(r.supplierId, 'beta');
    assert.equal(r.hours, 3, 'le ore scritte per la fase interna non devono sparire');
  });

  it('passando da conto lavoro a interna i giorni già scritti non si perdono', () => {
    const app = caricato(conCiclo([{ kind: 'op', workCenterId: 'w1', supplierId: 'beta',
      costMode: 'fisso', cost: 10, hours: 0, days: 6, note: '' }]));
    app.asRole('admin');
    app.eval('currentCycleItemId = "p"');
    app.el('cyc-opdays-0').value = '6';
    app.el('cyc-sup-0').value = '';
    app.el('cyc-cost-in-0').value = '10';
    app.eval('onCycleRowSupplierChange(0)');
    const r = riga(app);
    assert.equal(r.supplierId, '');
    assert.equal(r.days, 6, 'i giorni scritti per la fase esterna non devono sparire');
  });

  it('una fase esterna a costo fisso non nasce con un\'ora mai scritta da nessuno', () => {
    const app = caricato(conCiclo([]));
    app.asRole('admin');
    app.eval('currentCycleItemId = "p"');
    app.el('cyc-wc').value = 'w1';
    app.el('cyc-opsup').value = 'beta';
    app.el('cyc-opmode').value = 'fisso';
    app.el('cyc-opdays').value = '4';
    app.el('cyc-opcost').value = '15';
    // "Ore" resta al valore proposto di serie (1): a costo fisso su un
    // centro esterno il campo non è nemmeno a video.
    app.eval('pickCycleOp()');
    const r = riga(app);
    assert.equal(r.hours, 0, 'il campo Ore era nascosto: non deve entrare comunque');
    assert.equal(r.days, 4);
  });
});
