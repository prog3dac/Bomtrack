// Vista Cicli di lavorazione. Fino alla 0.124 distinta parte e fasi vivevano
// nello stesso array `it.cycle`, distinti solo dal campo `kind`; dalla 0.125.0
// il materiale sta nella distinta della parte (`components`). I dati qui sotto
// sono volutamente quelli di prima, non migrati: le fasi si modificano con
// l'indice assoluto nell'array, e riordinarle non deve spostare (né far
// sparire) le vecchie righe di distinta, né cambiare di un centesimo il costo.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, wc } = require('./fixtures.js');

function conDb(dbObj, role) {
  const app = loadApp({ silent: true });
  app.setDb(dbObj);
  app.asRole(role || 'admin');
  return app;
}
// Parte con distinta e lavorazioni alternate: se una funzione confonde
// l'indice di sezione con quello assoluto, qui si vede subito.
function dbMisto() {
  return makeDb({
    workCenters: [wc('w1', 0), wc('w2', 0), wc('w3', 0)],
    items: [
      mat('m', 2), acq('a', 5),
      parte('p', { cycle: [
        { kind: 'item', itemId: 'm', qty: 3 },          // 0 — distinta
        { kind: 'op', workCenterId: 'w1', cost: 10 },   // 1 — fase 10
        { kind: 'item', itemId: 'a', qty: 1 },          // 2 — distinta
        { kind: 'op', workCenterId: 'w2', cost: 20 },   // 3 — fase 20
        { kind: 'op', workCenterId: 'w3', cost: 30 },   // 4 — fase 30
      ] }),
    ],
  });
}
// Descrizione compatta dell'array, per confrontare l'ordine a colpo d'occhio
const forma = app => app.snapshot().items.find(i => i.id === 'p').cycle
  .map(r => r.kind === 'op' ? r.workCenterId : r.itemId).join(',');

describe('moveKindRow — riordino di un solo kind', () => {
  const righe = () => ([
    { kind: 'item', itemId: 'm' }, { kind: 'op', workCenterId: 'w1' },
    { kind: 'item', itemId: 'a' }, { kind: 'op', workCenterId: 'w2' },
  ]);
  // Array.from: quello che torna dal contesto vm è di un altro realm e
  // deepEqual lo rifiuterebbe pur avendo lo stesso contenuto.
  const mossa = (k, dir) => {
    const app = loadApp({ silent: true });
    return Array.from(app.eval(`moveKindRow(${JSON.stringify(righe())}, 'op', ${k}, ${dir})`))
      .map(r => r.kind === 'op' ? r.workCenterId : r.itemId);
  };

  it('scambia due lavorazioni saltando le righe di distinta in mezzo', () => {
    // w1 e w2 sono agli indici 1 e 3: si scambiano tra loro, m e a non si muovono
    assert.deepEqual(mossa(0, 1), ['m', 'w2', 'a', 'w1']);
  });

  it('lo spostamento verso l\'alto è il simmetrico', () => {
    assert.deepEqual(mossa(1, -1), ['m', 'w2', 'a', 'w1']);
  });

  it('le righe della distinta restano ai loro indici assoluti', () => {
    const out = mossa(0, 1);
    assert.equal(out[0], 'm');
    assert.equal(out[2], 'a');
  });

  it('sui bordi ritorna l\'array ricevuto, senza copie né scambi', () => {
    const app = loadApp({ silent: true });
    // Identità dell'oggetto: il chiamante la usa per capire che non c'è nulla da salvare
    assert.equal(app.eval(`(() => { const r = [{kind:'op'},{kind:'op'}]; return moveKindRow(r,'op',0,-1) === r; })()`), true);
    assert.equal(app.eval(`(() => { const r = [{kind:'op'},{kind:'op'}]; return moveKindRow(r,'op',1,1) === r; })()`), true);
    assert.equal(app.eval(`(() => { const r = [{kind:'item'}]; return moveKindRow(r,'op',0,1) === r; })()`), true);
  });

  it('array vuoto o indice fuori elenco: nessun errore', () => {
    const app = loadApp({ silent: true });
    assert.deepEqual(Array.from(app.eval(`moveKindRow([], 'op', 0, 1)`)), []);
    assert.deepEqual(app.eval(`moveKindRow([{kind:'op'}], 'op', 7, 1).length`), 1);
  });
});

describe('cyclePhaseNumber — numerazione delle fasi', () => {
  it('10, 20, 30 dall\'ordine dell\'elenco', () => {
    const app = loadApp({ silent: true });
    assert.deepEqual([0, 1, 2].map(k => app.eval(`cyclePhaseNumber(${k})`)), [10, 20, 30]);
  });
});

describe('moveCycleOp — riordino sulla parte aperta', () => {
  it('sposta la fase e salva, lasciando ferma la distinta', () => {
    const app = conDb(dbMisto());
    app.eval('currentCycleItemId = "p"');
    app.eval('moveCycleOp(0, 1)');   // prima lavorazione (w1) verso il basso
    assert.equal(forma(app), 'm,w2,a,w1,w3');
    // Salvato davvero: il blob persistito contiene il nuovo ordine
    assert.equal(JSON.parse(app.storage.getItem(app.ref('DB_KEY')))
      .items.find(i => i.id === 'p').cycle[1].workCenterId, 'w2');
  });

  it('il costo della parte non cambia dopo il riordino', () => {
    const app = conDb(dbMisto());
    app.eval('currentCycleItemId = "p"');
    const prima = app.eval('costOf("p").total');
    app.eval('moveCycleOp(1, 1)');
    approx(app.eval('costOf("p").total'), prima);
    approx(prima, 3 * 2 + 5 + 10 + 20 + 30);
  });

  it('in cima e in fondo non succede nulla', () => {
    const app = conDb(dbMisto());
    app.eval('currentCycleItemId = "p"');
    app.eval('moveCycleOp(0, -1)');
    app.eval('moveCycleOp(2, 1)');
    assert.equal(forma(app), 'm,w1,a,w2,w3');
  });

  it('il ruolo lettore non riordina', () => {
    const app = conDb(dbMisto(), 'lettore');
    app.eval('currentCycleItemId = "p"');
    app.eval('moveCycleOp(0, 1)');
    assert.equal(forma(app), 'm,w1,a,w2,w3');
  });
});

describe('Righe: aggiunta, modifica, eliminazione', () => {
  it('delCycleRow usa l\'indice assoluto', () => {
    const app = conDb(dbMisto());
    app.eval('currentCycleItemId = "p"');
    app.eval('delCycleRow(2)');   // la seconda riga di distinta, terza in assoluto
    assert.equal(forma(app), 'm,w1,w2,w3');
  });

  // Dalla 0.105.7 un articolo già in distinta non fa una seconda riga: se ne
  // aumenta la quantità, e il costo è lo stesso di prima. Dalla 0.125.0 il
  // materiale di una parte si aggiunge dalla Distinta, come per gli assiemi,
  // e la prima modifica sposta le vecchie righe dal ciclo alla distinta.
  const distinta = app => app.snapshot().items.find(i => i.id === 'p').components
    .map(c => c.itemId + ':' + c.qty + (c.costOverride != null ? '=' + c.costOverride : ''));
  it('un articolo già nella distinta della parte ne aumenta la quantità', () => {
    const app = conDb(dbMisto());
    app.eval('currentBomId = "p"; bomPanelQty = new Map([["a", 1]]); bomPanelInsertAll()');
    assert.deepEqual(distinta(app), ['m:3', 'a:2']);
    assert.equal(forma(app), 'w1,w2,w3', 'nel ciclo restano le fasi');
    approx(app.eval('costOf("p").total'), 3 * 2 + 5 + 10 + 20 + 30 + 5);
  });

  it('un articolo nuovo si accoda in fondo alla distinta della parte', () => {
    const app = conDb(dbMisto());
    app.eval('db.items.push({ id: "b", code: "B", name: "B", type: "acquistato", unitCost: 4, active: true })');
    app.eval('currentBomId = "p"; bomPanelQty = new Map([["b", 1]]); bomPanelInsertAll()');
    assert.deepEqual(distinta(app), ['m:3', 'a:1', 'b:1']);
  });

  // Il costo forzato vale per la riga intera: sommarci un pezzo lo regalerebbe.
  it('una riga a costo forzato non si somma: nasce una riga nuova', () => {
    const app = conDb(dbMisto());
    app.eval('getItem("p").cycle[2].costOverride = 9');
    app.eval('currentBomId = "p"; bomPanelQty = new Map([["a", 1]]); bomPanelInsertAll()');
    assert.deepEqual(distinta(app), ['m:3', 'a:1=9', 'a:1']);
  });

  it('nella distinta di una parte entrano solo materie prime e commerciali', () => {
    const { asm } = require('./fixtures.js');
    const app = conDb(dbMisto());
    app.eval(`db.items.push(${JSON.stringify(asm('g', 'gruppo'))}, ${JSON.stringify(parte('q'))})`);
    app.eval('currentBomId = "p"; bomPanelQty = new Map([["g", 1], ["q", 1]]); bomPanelInsertAll()');
    assert.deepEqual(distinta(app), ['m:3', 'a:1']);
  });

  it('Inserisci nella distinta base somma la quantità a un componente già presente', () => {
    const { asm } = require('./fixtures.js');
    const app = conDb(makeDb({ items: [mat('m', 2), acq('a', 5),
      asm('g', 'gruppo', { components: [{ itemId: 'a', qty: 2, scrapPct: 0 }] })] }));
    app.eval('currentBomId = "g"; bomPanelQty = new Map([["a", 3], ["m", 1]]); bomPanelInsertAll()');
    const comp = JSON.parse(app.eval('JSON.stringify(getItem("g").components)'));
    assert.deepEqual(comp.map(c => c.itemId + ':' + c.qty), ['a:5', 'm:1']);
  });

  it('pickCycleOp accoda la lavorazione in fondo al ciclo', () => {
    const app = conDb(dbMisto());
    app.eval('currentCycleItemId = "p"');
    app.el('cyc-wc').value = 'w1';
    app.el('cyc-opcost').value = '7';
    app.eval('pickCycleOp()');
    assert.equal(forma(app), 'm,w1,a,w2,w3,w1');
    approx(app.eval('costOf("p").total'), 3 * 2 + 5 + 10 + 20 + 30 + 7);
  });

  it('le note della fase: si scrivono aggiungendola e sulla riga, e il lancio dell\'ODP le porta', () => {
    const app = conDb(dbMisto());
    app.eval('currentCycleItemId = "p"');
    app.el('cyc-wc').value = 'w1';
    app.el('cyc-opnote').value = '  sbavare i fori  ';
    app.eval('pickCycleOp()');
    assert.equal(app.eval('getItem("p").cycle[5].note'), 'sbavare i fori');
    app.eval('renderCycles()');
    app.el('cyc-opnote-1').value = 'controllo al primo pezzo';
    app.eval('updateCycleNote(1)');
    assert.equal(app.eval('getItem("p").cycle[1].note'), 'controllo al primo pezzo');
    assert.equal(app.eval('getItem("p").cycle[1].cost'), 10, 'la nota non tocca il resto della fase');
    const fasi = JSON.parse(app.eval('JSON.stringify(opFreezePhases(getItem("p")).map(f => f.note))'));
    assert.deepEqual(fasi, ['controllo al primo pezzo', '', '', 'sbavare i fori']);
  });

  it('la quantità di una riga della distinta della parte si cambia dalla Distinta, e il costo segue', () => {
    const app = conDb(dbMisto());
    app.eval('currentBomId = "p"; editComponentModal(0)');
    app.el('cmp-item').value = 'm';
    app.el('cmp-qty').value = '10';
    app.el('cmp-scrap').value = '0';
    app.el('cmp-ovr').value = '';
    app.eval('saveComponentEdit(0)');
    approx(app.eval('costOf("p").total'), 10 * 2 + 5 + 10 + 20 + 30);
  });

  it('il costo di riga forzato: vuoto = calcolato, un valore vale per la riga intera', () => {
    const app = conDb(dbMisto());
    const salva = ovr => {
      app.eval('currentBomId = "p"; editComponentModal(0)');
      app.el('cmp-item').value = 'm'; app.el('cmp-qty').value = '3'; app.el('cmp-scrap').value = '0';
      app.el('cmp-ovr').value = ovr;
      app.eval('saveComponentEdit(0)');
    };
    salva('');
    assert.equal(app.snapshot().items.find(i => i.id === 'p').components[0].costOverride, null);
    salva('7');
    assert.equal(app.snapshot().items.find(i => i.id === 'p').components[0].costOverride, 7);
    approx(app.eval('costOf("p").total'), 7 + 5 + 10 + 20 + 30);
  });

  it('lo scarto della distinta di una parte entra nel costo', () => {
    const app = conDb(dbMisto());
    app.eval('parteDistintaViva(getItem("p")); getItem("p").components[0].scrapPct = 50; invalidateCaches()');
    approx(app.eval('costOf("p").total'), 3 * 2 * 1.5 + 5 + 10 + 20 + 30);
  });

  it('il ruolo lettore non elimina né modifica', () => {
    const app = conDb(dbMisto(), 'lettore');
    app.eval('currentCycleItemId = "p"');
    app.eval('delCycleRow(0)');
    app.el('cyc-qty-0').value = '99';
    app.eval('updateCycleRow(0)');
    assert.equal(forma(app), 'm,w1,a,w2,w3');
    approx(app.eval('costOf("p").total'), 3 * 2 + 5 + 10 + 20 + 30);
  });

  it('senza una parte selezionata i mutatori non lanciano', () => {
    const app = conDb(dbMisto());
    app.eval('currentCycleItemId = null');
    app.eval('delCycleRow(0); moveCycleOp(0, 1); updateCycleRow(0)');
    assert.equal(forma(app), 'm,w1,a,w2,w3');
  });
});

// La vista Cicli non ha più un selettore del modo di calcolo: da dove viene il
// costo lo decide l'approvvigionamento, che si sceglie nella scheda articolo.
describe('Cicli — il costo segue l\'approvvigionamento, senza un secondo interruttore', () => {
  it('prodotta in casa: il costo è quello del ciclo, il prezzo a listino non conta', () => {
    const app = conDb(dbMisto());
    app.eval('getItem("p").unitCost = 100; getItem("p").sourcing = "make"; invalidateCaches();');
    approx(app.eval('costOf("p").total'), 3 * 2 + 5 + 10 + 20 + 30);
  });

  it('acquistata: il costo è il prezzo a listino, il ciclo non conta', () => {
    const app = conDb(dbMisto());
    app.eval('getItem("p").unitCost = 100; getItem("p").sourcing = "buy"; invalidateCaches();');
    approx(app.eval('costOf("p").total'), 100);
  });

  it('la nota in cima alla vista dice da dove viene il costo', () => {
    const app = conDb(dbMisto());
    app.eval('currentCycleItemId = "p"; getItem("p").sourcing = "make"; renderCycles();');
    assert.ok(app.html('cyc-body').includes('prodotta in casa'), 'deve dirlo, e rimandare alla scheda');
    app.eval('getItem("p").sourcing = "buy"; renderCycles();');
    assert.ok(app.html('cyc-body').includes('Parte acquistata'));
  });
});

describe('Selezione della parte', () => {
  it('cycleFilteredParts applica famiglia, sottofamiglia e ricerca', () => {
    const app = conDb(makeDb({ items: [
      parte('p1', { code: 'PRT-1', familyId: 'f1', subFamilyId: 's1' }),
      parte('p2', { code: 'PRT-2', familyId: 'f1', subFamilyId: 's2' }),
      parte('p3', { code: 'ALT-3', familyId: 'f2' }),
    ] }));
    const ids = () => Array.from(app.eval('cycleFilteredParts().map(i => i.id)'));
    assert.deepEqual(ids().sort(), ['p1', 'p2', 'p3']);
    app.el('cyc-family').value = 'f1';
    assert.deepEqual(ids().sort(), ['p1', 'p2']);
    app.el('cyc-subfamily').value = 's2';
    assert.deepEqual(ids(), ['p2']);
    app.el('cyc-subfamily').value = '';
    app.el('cyc-family').value = '';
    app.el('cyc-search').value = 'alt';
    assert.deepEqual(ids(), ['p3']);
  });

  it('i menu dei filtri elencano solo le famiglie delle parti', () => {
    const app = conDb(makeDb({
      families: [
        { id: 'f1', name: 'Lamiere', kind: 'parte', subs: [{ id: 's1', name: 'Piegate' }] },
        { id: 'f9', name: 'Viteria', kind: 'acquistato', subs: [] },
      ],
      items: [parte('p1', { familyId: 'f1' })],
    }));
    app.eval('updateCycleFamilyFilters()');
    assert.ok(app.html('cyc-family').includes('Lamiere'));
    assert.ok(!app.html('cyc-family').includes('Viteria'), 'le famiglie dei commerciali non c\'entrano');
    // Le sottofamiglie compaiono solo con la famiglia scelta
    assert.ok(!app.html('cyc-subfamily').includes('Piegate'));
    app.el('cyc-family').value = 'f1';
    app.eval('updateCycleFamilyFilters()');
    assert.ok(app.html('cyc-subfamily').includes('Piegate'));
  });

  it('una selezione non più valida ricade sulla prima parte filtrata', () => {
    const app = conDb(makeDb({ items: [parte('p1'), parte('p2')] }));
    app.eval('currentCycleItemId = "sparita"');
    app.eval('ensureCurrentCycleItem(cycleFilteredParts())');
    assert.equal(app.eval('currentCycleItemId'), 'p1');
    app.eval('ensureCurrentCycleItem([])');
    assert.equal(app.eval('currentCycleItemId'), null);
  });

  it('openCycleFor azzera i filtri: la parte scelta deve comparire', () => {
    const app = conDb(makeDb({ items: [parte('p1', { familyId: 'f1' }), parte('p2')] }));
    app.el('cyc-family').value = 'f1';
    app.el('cyc-search').value = 'xyz';
    app.eval('openCycleFor("p2")');
    assert.equal(app.eval('currentCycleItemId'), 'p2');
    assert.equal(app.el('cyc-family').value, '');
    assert.equal(app.el('cyc-subfamily').value, '');
    assert.equal(app.el('cyc-search').value, '');
  });

  it('openCycleFor ignora ciò che non è una parte', () => {
    const app = conDb(makeDb({ items: [mat('m', 1), parte('p1')] }));
    app.eval('currentCycleItemId = "p1"');
    app.eval('openCycleFor("m")');
    assert.equal(app.eval('currentCycleItemId'), 'p1');
  });
});

describe('renderCycles — disegno delle due sezioni', () => {
  it('mostra distinta, ciclo e numeri di fase', () => {
    const app = conDb(dbMisto());
    app.eval('currentCycleItemId = "p"');
    app.eval('renderCycles()');
    const h = app.html('cyc-body');
    // Il materiale non si scrive più qui: c'è il rimando alla distinta della parte
    assert.ok(!h.includes('addCycleItemRow'), 'la distinta parte non si scrive più nei cicli');
    assert.ok(h.includes("openBomFor('p')"), 'manca il rimando alla distinta');
    assert.ok(h.includes('2 righe'), 'la nota dice quante righe ha la distinta');
    assert.ok(h.includes('Ciclo di lavorazione'), 'manca la sezione ciclo');
    assert.ok(h.includes('>10<') && h.includes('>20<') && h.includes('>30<'), 'mancano i numeri di fase');
    // Le frecce dei bordi sono spente
    assert.equal((h.match(/disabled/g) || []).length, 2);
    assert.ok(app.html('cyc-summary').includes('Costo parte'));
  });

  it('senza parti a catalogo spiega dove crearne una', () => {
    const app = conDb(makeDb({ items: [] }));
    app.eval('renderCycles()');
    assert.ok(app.html('cyc-body').includes('Articoli di progetto'));
  });

  it('cycleCountLabel riassume le due sezioni', () => {
    const app = conDb(dbMisto());
    assert.equal(app.eval('cycleCountLabel(getItem("p"))'), '2 articoli · 3 lavorazioni');
    assert.equal(app.eval('cycleCountLabel({ cycle: [] })'), 'Distinta e ciclo vuoti');
    assert.equal(app.eval('cycleCountLabel({ cycle: [{ kind: "item" }, { kind: "op" }] })'), '1 articolo · 1 lavorazione');
  });
});

describe('Duplicazione di una parte', () => {
  it('la copia porta con sé distinta e ciclo', () => {
    const app = conDb(dbMisto());
    app.el('it-type').value = 'parte';
    app.el('it-concept').value = 'c1';
    app.el('it-namefree').value = 'copia';
    app.el('it-code').value = 'PRT-COPIA';
    app.eval('window.__dupSourceId = "p"');
    app.eval('saveNewItem()');
    const nuova = app.snapshot().items.filter(i => i.type === 'parte' && i.id !== 'p')[0];
    assert.ok(nuova, 'la copia non è stata creata');
    assert.deepEqual(nuova.components.map(c => c.itemId + ':' + c.qty), ['m:3', 'a:1']);
    assert.deepEqual(nuova.cycle.map(r => r.workCenterId), ['w1', 'w2', 'w3']);
    // Copia vera: modificarla non tocca l'originale
    assert.notEqual(app.eval(`getItem(${JSON.stringify(nuova.id)}).cycle`), app.eval('getItem("p").cycle'));
  });

  it('una parte creata da zero nasce con distinta e ciclo vuoti', () => {
    const app = conDb(makeDb({ items: [] }));
    app.el('it-type').value = 'parte';
    app.el('it-concept').value = 'c1';
    app.el('it-namefree').value = 'nuova';
    app.el('it-code').value = 'PRT-1';
    app.eval('window.__dupSourceId = null');
    app.eval('saveNewItem()');
    const nuova = app.snapshot().items[0];
    assert.deepEqual(nuova.cycle, []);
    assert.deepEqual(nuova.components, []);
    assert.equal(nuova.sourcing, 'buy', 'una parte nuova si compra, salvo dirlo diversamente');
  });

  it('l\'approvvigionamento delle parti nuove segue le impostazioni', () => {
    const app = conDb(makeDb({ items: [], settings: { partSourcingDefault: 'make' } }));
    app.el('it-type').value = 'parte';
    app.el('it-concept').value = 'c1';
    app.el('it-namefree').value = 'nuova';
    app.el('it-code').value = 'PRT-2';
    app.eval('window.__dupSourceId = null');
    app.eval('saveNewItem()');
    assert.equal(app.snapshot().items[0].sourcing, 'make');
  });

  it('un default non valido nelle impostazioni ricade sull\'acquisto', () => {
    const app = conDb(makeDb({ items: [], settings: { partSourcingDefault: 'inventato' } }));
    assert.equal(app.eval('defaultPartSourcing()'), 'buy');
  });
});
