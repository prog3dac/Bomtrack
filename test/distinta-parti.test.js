// La distinta delle parti (dalla 0.125.0): il materiale che serve per fare una
// parte sta nella sua distinta, come i componenti di un assieme, e nel ciclo
// restano le sole fasi. Distinta = cosa serve, ciclo = come si fa, per parti,
// gruppi e macchine.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm, comp, wc } = require('./fixtures.js');

// Una parte con la distinta di prima (righe materiale nel ciclo, una con il
// costo forzato) e due fasi interne; un gruppo che ne monta due.
function vecchio() {
  return makeDb({
    workCenters: [Object.assign(wc('tor', 40), { hoursPerDay: 8 })],
    items: [
      mat('lam', 2), acq('vite', 1),
      parte('p', { familyId: 'fp', cycle: [
        { kind: 'item', itemId: 'lam', qty: 3, costOverride: null },
        { kind: 'op', workCenterId: 'tor', supplierId: null, costMode: 'fisso', cost: 10, hours: 1, days: 0, note: '' },
        { kind: 'item', itemId: 'vite', qty: 4, costOverride: 9 },
        { kind: 'op', workCenterId: 'tor', supplierId: null, costMode: 'fisso', cost: 20, hours: 1, days: 0, note: '' },
      ] }),
      asm('mac', 'macchina', { components: [comp('grp', 1)] }),
      asm('grp', 'gruppo', { machineItemId: 'mac', components: [comp('p', 2)] }),
    ],
    families: [{ id: 'fp', name: 'Lamiere', kind: 'parte', sigla: 'LAM', subs: [] }],
    plans: [{ id: 'pl', number: 'FAB-1', title: '', date: '2026-10-01', notes: '', active: true,
      lines: [{ id: 'l1', itemId: 'grp', qty: 1, dueDate: '2026-11-20' }] }],
  });
}
function app(dbObj) {
  const a = loadApp({ silent: true });
  a.setDb(dbObj || vecchio());
  a.asRole('admin');
  return a;
}
const js = (a, expr) => JSON.parse(a.eval(`JSON.stringify(${expr})`));
const COSTO = 3 * 2 + 9 + 10 + 20;   // lamiera, viti a costo forzato, due fasi

describe('Distinta delle parti: migrazione', () => {
  it('le righe materiale del ciclo passano alla distinta, nell\'ordine, senza cambiare il costo', () => {
    const a = app();
    approx(a.eval("costOf('p').total"), COSTO);
    a.eval('migrateDB(); invalidateCaches()');
    const p = js(a, "getItem('p')");
    assert.deepEqual(p.components, [
      { itemId: 'lam', qty: 3, scrapPct: 0, costOverride: null },
      { itemId: 'vite', qty: 4, scrapPct: 0, costOverride: 9 },
    ]);
    assert.deepEqual(p.cycle.map(r => r.kind + ':' + r.cost), ['op:10', 'op:20']);
    approx(a.eval("costOf('p').total"), COSTO);
  });

  it('si ripete senza danni', () => {
    const a = app();
    a.eval('migrateDB(); migrateDB();');
    assert.equal(js(a, "getItem('p').components").length, 2);
  });

  it('una parte con solo materiale resta prodotta in casa', () => {
    const a = app(makeDb({ items: [mat('lam', 2), parte('q', { sourcing: undefined, cycle: [{ kind: 'item', itemId: 'lam', qty: 1 }] })] }));
    a.eval('delete getItem("q").sourcing; migrateDB()');
    assert.equal(a.eval("getItem('q').sourcing"), 'make');
  });
});

describe('Distinta delle parti: costo, fabbisogno, ordine di produzione', () => {
  it('lo scarto entra nel costo e nella quantità da comprare', () => {
    const a = app();
    a.eval("migrateDB(); getItem('p').components[0].scrapPct = 10; invalidateCaches()");
    approx(a.eval("costOf('p').total"), 3 * 2 * 1.1 + 9 + 10 + 20);
    const buy = js(a, "mrpExplodePlan(getPlan('pl')).buy.map(x => [x.item.id, +x.qty.toFixed(4)])");
    // 2 parti × 3,3 kg di lamiera, 2 × 4 viti
    assert.deepEqual(buy.sort(), [['lam', 6.6], ['vite', 8]]);
  });

  it('l\'ordine di produzione della parte preleva la sua distinta', () => {
    const a = app();
    a.eval("migrateDB(); (() => { const o = odpNew(getItem('p'), 2, '2026-11-20'); db.prodOrders.push(o); window.__o = o.id; })()");
    assert.deepEqual(js(a, 'getOdp(window.__o).materials.map(m => [m.itemId, m.qty])'), [['lam', 6], ['vite', 8]]);
    assert.deepEqual(js(a, 'getOdp(window.__o).phases.map(f => f.seq)'), [10, 20]);
  });

  it('dove è usato: la materia prima risale alla parte, al gruppo e alla macchina', () => {
    const a = app();
    a.eval('migrateDB(); invalidateCaches()');
    assert.deepEqual(js(a, "usedBy('lam').map(i => i.id)"), ['p']);
    assert.deepEqual(js(a, "impactedTops('lam').map(r => [r.item.id, r.qty])"), [['mac', 6]]);
  });

  it('una materia prima già nella distinta di una parte non può contenere la parte (anello)', () => {
    const a = app();
    a.eval('migrateDB()');
    assert.equal(a.eval("createsCycle('p', 'lam')"), false);
    assert.equal(a.eval("isAllowedChild('parte', 'grp')"), false);
    assert.equal(a.eval("isAllowedChild('parte', 'lam')"), true);
  });
});

describe('Distinta delle parti: viste', () => {
  it('la Distinta base apre anche una parte, con il suo ciclo in sola lettura', () => {
    const a = app();
    a.eval("currentBomId = 'p'; setView('bom')");
    const h = a.html('bom-tree');
    assert.match(h, /LAM/);
    assert.match(h, /Ciclo di lavorazione/);
    assert.match(h, /openCycleFor\('p'\)/);
    assert.match(a.html('bom-select'), /<optgroup label="Parti">/);
  });

  it('nell\'albero di un gruppo la parte si espande in distinta e fasi', () => {
    const a = app();
    a.eval("currentBomId = 'grp'; setView('bom'); expandAllBom(true)");
    const h = a.html('bom-tree');
    assert.match(h, /LAM/);
    assert.match(h, /Ciclo \(Parte p\)/);
  });

  it('i Cicli non scrivono più il materiale: rimandano alla distinta', () => {
    const a = app();
    a.eval("openCycleFor('p')");
    const h = a.html('cyc-body');
    assert.doesNotMatch(h, /addCycleItemRow|cyc-qty-/);
    assert.match(h, /openBomFor\('p'\)/);
    a.eval("openBomFor('p')");
    assert.equal(a.eval('currentBomId'), 'p');
  });

  it('l\'import delle distinte accetta una parte come padre', () => {
    const a = app();
    a.eval("importBom([{ CodicePadre: 'P', CodiceFiglio: 'VITE', Qta: 6 }])");
    assert.deepEqual(js(a, "getItem('p').components.map(c => c.itemId + ':' + c.qty)"), ['vite:6']);
    assert.deepEqual(js(a, "getItem('p').cycle.map(r => r.kind)"), ['op', 'op'], 'le fasi restano');
  });
});

describe('Filtri di Distinte base e Cicli', () => {
  it('le stesse sei voci: testo, tipo, famiglia, sottofamiglia, macchina, gruppo', () => {
    const a = app();
    ['bom', 'cyc'].forEach(pfx => {
      const ids = () => js(a, `distinteFiltrate('${pfx}').map(i => i.id).sort()`);
      assert.deepEqual(ids(), ['grp', 'mac', 'p'], pfx + ': anche le parti');
      a.el(pfx + '-type').value = 'parte';
      assert.deepEqual(ids(), ['p']);
      a.el(pfx + '-type').value = '';
      a.el(pfx + '-family').value = 'fp';
      assert.deepEqual(ids(), ['p'], 'la famiglia è delle parti');
      a.el(pfx + '-family').value = '';
      a.el(pfx + '-machine').value = 'mac';
      assert.deepEqual(ids(), ['grp', 'mac']);
      a.el(pfx + '-machine').value = '';
      a.el(pfx + '-group').value = 'grp';
      assert.deepEqual(ids(), ['grp']);
      a.el(pfx + '-group').value = '';
      a.el(pfx + '-search').value = 'parte';
      assert.deepEqual(ids(), ['p']);
      a.el(pfx + '-search').value = '';
    });
  });

  it('le famiglie in elenco sono quelle delle parti', () => {
    const a = app();
    a.eval("updateBomMachineFilter(); updateCycleFamilyFilters()");
    assert.match(a.html('bom-family'), /Lamiere/);
    assert.match(a.html('cyc-family'), /Lamiere/);
    assert.match(a.html('bom-machine'), /MAC/);
    assert.match(a.html('cyc-group'), /GRP/);
  });
});
