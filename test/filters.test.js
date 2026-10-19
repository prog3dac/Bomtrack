// Barra Filtri a scomparsa e scope condiviso fra le viste.
//
// I campi non si ricreano mai — sarebbe una regressione seria, il campo di
// ricerca perderebbe il focus a ogni ridisegno — quindi qui non si verifica
// il disegno (non ce n'è: apertura/chiusura sono una classe CSS), si verifica
// che lo stato giusto arrivi negli elementi giusti, nell'ordine giusto
// rispetto al render di ogni vista.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || makeDb({ items: [mat('m1', 10)] }));
  a.asRole('admin');
  // Stato di filters.js azzerato: nei test non parte da `document` (il
  // documento finto si installa dopo il caricamento dei file, quindi il
  // guardia in fondo a filters.js non ha girato).
  a.eval('filtOpen = false; filtScope = { familyId: "", subFamilyId: "", machineId: "", groupId: "" };');
  return a;
}
// Un piccolo albero macchina › gruppo, per la propagazione machine/group.
function conMacchina() {
  return makeDb({
    items: [
      asm('mac1', 'macchina'),
      asm('grp1', 'gruppo', { machineItemId: 'mac1' }),
      parte('p1', { machineItemId: 'mac1', groupItemId: 'grp1' }),
      acq('c1', 5),
      mat('m1', 10),
    ],
  });
}
// Famiglie di ambiti diversi: una di materie prime/commerciali, una di parti.
function conFamiglie() {
  return makeDb({
    families: [
      { id: 'fa', name: 'Cuscinetti', kind: 'acquistato', subs: [] },
      { id: 'fp', name: 'Alberi', kind: 'parte', subs: [] },
    ],
    items: [acq('c1', 5), parte('p1', { familyId: 'fp' })],
  });
}

// Gli array del contesto vm dell'harness non sono reference-equal a quelli di
// Node: si confrontano da JSON, come fa `spec()` in export-lists.test.js.
const asJson = (a, expr) => JSON.parse(a.eval(`JSON.stringify(${expr})`));

describe('Il registro copre le viste giuste', () => {
  it('le 5 viste con articoli, e nessun\'altra', () => {
    const a = app();
    assert.deepEqual(asJson(a, 'Object.keys(FILT_PANELS).sort()'),
      ['bom', 'buy', 'cycles', 'design', 'stock']);
  });
  it('Carico centri e le viste documento non ci sono', () => {
    const a = app();
    ['load', 'jobs', 'mrp', 'rfq', 'orders', 'odl', 'report', 'home', 'manage'].forEach(v =>
      assert.equal(a.eval(`filtPanelFor('${v}')`), null, `"${v}" non dovrebbe avere un pannello filtri`));
  });
  it('solo Progetto e Magazzino hanno tutte e 4 le dimensioni condivise', () => {
    const a = app();
    assert.deepEqual(asJson(a, 'FILT_PANELS.design.dims.slice().sort()'), ['family', 'group', 'machine', 'subfamily']);
    assert.deepEqual(asJson(a, 'FILT_PANELS.stock.dims.slice().sort()'), ['family', 'group', 'machine', 'subfamily']);
    assert.deepEqual(asJson(a, 'FILT_PANELS.buy.dims.slice().sort()'), ['family', 'subfamily']);
    assert.deepEqual(asJson(a, 'FILT_PANELS.cycles.dims.slice().sort()'), ['family', 'subfamily']);
    assert.deepEqual(asJson(a, 'FILT_PANELS.bom.dims'), ['machine']);
  });
});

describe('Persistenza', () => {
  it('apertura e scope sopravvivono a un ricaricamento', () => {
    const a = app();
    a.eval('filtOpen = true; filtScope.machineId = "mac1"; filtPrefsSave();');
    // Stesso storage, sessione nuova: come riaprire il browser.
    const b = loadApp({ silent: true, storage: a.storage });
    b.eval('filtPrefsLoad()');
    assert.equal(b.eval('filtOpen'), true);
    assert.equal(b.eval('filtScope.machineId'), 'mac1');
  });

  it('storage che rifiuta la scrittura non lancia', () => {
    const a = app();
    a.storage.setItem = () => { throw new Error('quota esaurita (finta)'); };
    assert.doesNotThrow(() => a.eval('filtPrefsSave()'));
  });

  it('JSON corrotto non lancia e si riparte chiusi', () => {
    const a = app();
    a.storage.setItem(a.eval('FILT_KEY'), '{rotto');
    assert.doesNotThrow(() => a.eval('filtPrefsLoad()'));
    assert.equal(a.eval('filtOpen'), false);
  });
});

describe('Lo scope condiviso segue la navigazione', () => {
  it('macchina e gruppo si propagano da una vista all\'altra', () => {
    const a = app(conMacchina());
    a.el('des-machine').value = 'mac1';
    a.eval("filtScopeChange('design', 'machine')");
    a.eval("setView('stock')");
    assert.equal(a.el('stk-machine').value, 'mac1', 'filtScopeApply scrive lo scope prima del render');
    a.eval("setView('bom')");
    assert.equal(a.el('bom-machine').value, 'mac1', 'anche Gestione DB, che ha solo la macchina');
  });

  it('Acquisti non ha macchina/gruppo: la propagazione è un no-op, non un errore', () => {
    const a = app(conMacchina());
    a.el('des-machine').value = 'mac1';
    a.eval("filtScopeChange('design', 'machine')");
    assert.doesNotThrow(() => a.eval("setView('buy')"));
  });

  it('una dimensione non supportata dalla vista di partenza non si registra', () => {
    const a = app(conMacchina());
    // Acquisti non ha 'machine' fra le sue dims: filtScopeChange deve ignorarlo.
    a.eval("filtScopeChange('buy', 'machine')");
    assert.equal(a.eval('filtScope.machineId'), '');
  });
});

// Un <select> come quello del browser: prende solo un valore che ha fra le sue
// <option>, e rifacendo le opzioni tiene quella marcata «selected».
function selectVero(a, id) {
  const el = a.el(id);
  let v = '', html = '';
  const ha = x => x === '' || html.includes('value="' + x + '"');
  Object.defineProperty(el, 'value', { configurable: true, get: () => v, set: x => { v = ha(String(x)) ? String(x) : ''; } });
  Object.defineProperty(el, 'innerHTML', { configurable: true, get: () => html, set: x => {
    html = String(x);
    const m = html.match(/value="([^"]*)"[^>]*selected/);
    v = m ? m[1] : '';
  } });
}

describe('Sottofamiglia e gruppo condivisi entrano subito', () => {
  it('in Magazzino la sottofamiglia e il gruppo scelti altrove sono già applicati', () => {
    const a = app(makeDb({
      families: [{ id: 'fa', name: 'Meccanico', kind: 'acquistato', subs: [{ id: 's1', name: 'Viti' }] }],
      items: [
        asm('mac1', 'macchina'),
        asm('grp1', 'gruppo', { machineItemId: 'mac1' }),
        Object.assign(acq('c1', 5), { familyId: 'fa', subFamilyId: 's1' }),
      ],
    }));
    ['stk-family', 'stk-subfamily', 'stk-machine', 'stk-group'].forEach(id => selectVero(a, id));
    a.eval('filtScope = { familyId: "fa", subFamilyId: "s1", machineId: "mac1", groupId: "grp1" };');
    a.eval("setView('stock')");
    assert.equal(a.el('stk-family').value, 'fa');
    assert.equal(a.el('stk-subfamily').value, 's1', 'senza aspettare il prossimo ridisegno');
    assert.equal(a.el('stk-machine').value, 'mac1');
    assert.equal(a.el('stk-group').value, 'grp1');
  });
});

// Nel browser vero, una famiglia di un ambito diverso (parti vs. acquisti)
// scritta da filtScopeApply viene invalidata da syncFamilyFilters, che
// ricostruisce le <option> e sceglie quella "selected" — esattamente come già
// succede oggi con qualunque valore rimasto da una scelta precedente. L'elemento
// finto di questo harness non simula la selezione via HTML (non fa il parsing
// delle <option>, "selected" compreso): `.value` resta quello scritto a mano
// finché qualcuno non lo tocca di nuovo esplicitamente. Il caso è verificato a
// mano nel browser (vedi piano), non qui: sarebbe un test che passa per un
// motivo diverso da quello vero.

describe('Rimuovi filtri', () => {
  it('azzera i campi locali e condivisi della vista, e lo scope per le altre', () => {
    const a = app(conMacchina());
    a.el('des-search').value = 'alb';
    a.el('des-type').value = 'parte';
    a.el('des-machine').value = 'mac1';
    a.eval("filtScopeChange('design', 'machine')");
    a.eval("filtClearAll('design')");
    assert.equal(a.el('des-search').value, '');
    assert.equal(a.el('des-type').value, '');
    assert.equal(a.el('des-machine').value, '');
    assert.equal(a.eval('filtScope.machineId'), '', 'lo scope condiviso è azzerato, non solo il campo locale');
    a.eval("setView('stock')");
    assert.equal(a.el('stk-machine').value, '', 'la restrizione non ricompare cambiando vista');
  });

  it('azzera anche "solo preferiti" in Acquisti', () => {
    const a = app();
    a.eval("toggleFavFilter()");
    assert.equal(a.eval('favOnly'), true);
    a.eval("filtClearAll('buy')");
    assert.equal(a.eval('favOnly'), false);
  });
});

describe('Le pasticche riflettono il DOM vivo, non lo scope', () => {
  it('leggono il campo, non filtScope: cambiando il campo a mano la pasticca segue', () => {
    const a = app(conFamiglie());
    a.el('des-family').value = 'fp';
    a.eval("filtScopeChange('design', 'family')");
    assert.ok(asJson(a, 'filtActiveChips("design")').length, 'campo valorizzato: una pasticca c\'è');
    a.el('des-family').value = '';   // un valore invalidato da syncFamilyFilters arriverebbe così
    assert.deepEqual(asJson(a, 'filtActiveChips("design")'), [],
      'filtScope.familyId vale ancora "fp", ma il campo è vuoto: la pasticca deve seguire il campo, non lo scope');
  });

  it('un testo di ricerca e un tipo scelto compaiono come pasticche', () => {
    const a = app();
    a.el('buy-search').value = 'vite';
    a.el('buy-type').innerHTML = '<option value="">x</option><option value="materiale" selected>Materia prima</option>';
    a.el('buy-type').value = 'materiale';
    a.el('buy-type').selectedIndex = 1;
    const chips = a.eval('filtActiveChips("buy")');
    assert.ok(chips.includes('Testo: vite'));
  });
});

describe('Apertura diretta di una parte (openCycleFor)', () => {
  it('svuota anche lo scope condiviso famiglia/sottofamiglia, non solo i campi locali', () => {
    const a = app(conFamiglie());
    a.el('cyc-family').value = 'fp';
    a.eval("filtScopeChange('cycles', 'family')");
    a.eval("openCycleFor('p1')");
    assert.equal(a.eval('filtScope.familyId'), '',
      'altrimenti setView riscriverebbe subito cyc-family, e la parte scelta potrebbe restare filtrata fuori');
  });
});

describe('Montaggio nelle viste', () => {
  it('renderCatalog, renderStock, renderCycles e renderBom non lanciano', () => {
    const a = app(conMacchina());
    assert.doesNotThrow(() => {
      a.eval("renderCatalog('buy')");
      a.eval("renderCatalog('design')");
      a.eval("renderStock()");
      a.eval("renderCycles()");
      a.eval("renderBom()");
    });
  });
});
