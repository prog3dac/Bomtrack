// Ordinare le anagrafiche cliccando sull'intestazione (0.128.0).
//
// Di serie per codice, in ordine naturale (PRT-2 prima di PRT-10); un clic su
// un'intestazione ordina per quella colonna, il secondo inverte. I vuoti stanno
// in fondo nei due versi, e l'export esce nello stesso ordine dello schermo.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

function app() {
  const a = loadApp({ silent: true });
  a.setDb(makeDb({
    suppliers: [{ id: 's1', name: 'SKF', active: true }, { id: 's2', name: 'Bosch', active: true }],
    items: [
      Object.assign(acq('a10', 3), { code: 'CMM-10', name: 'vite', supplierId: 's1', lotSize: 5 }),
      Object.assign(acq('a2', 12), { code: 'CMM-2', name: 'Dado', supplierId: '' }),
      Object.assign(acq('a1', 7), { code: 'cmm-1', name: 'Rondella', supplierId: 's2', lotSize: 20 }),
    ],
  }));
  a.asRole('admin');
  return a;
}
const ids = a => Array.from(a.eval('catalogFilteredRows("buy").map(i => i.id)'));

describe('Anagrafiche: ordine per colonna', () => {
  it('di serie per codice, in ordine naturale e senza badare alle maiuscole', () => {
    assert.deepEqual(ids(app()), ['a1', 'a2', 'a10']);
  });
  it('un clic ordina per la colonna, il secondo inverte', () => {
    const a = app();
    a.eval(`catalogSortBy('buy', 'name')`);
    assert.deepEqual(ids(a), ['a2', 'a1', 'a10']);
    a.eval(`catalogSortBy('buy', 'name')`);
    assert.deepEqual(ids(a), ['a10', 'a1', 'a2']);
  });
  it('i numeri si confrontano come numeri', () => {
    const a = app();
    a.eval(`catalogSortBy('buy', 'cost')`);
    assert.deepEqual(ids(a), ['a10', 'a1', 'a2']);
  });
  it('i vuoti restano in fondo in tutti e due i versi', () => {
    const a = app();
    a.eval(`catalogSortBy('buy', 'lot')`);
    assert.deepEqual(ids(a), ['a10', 'a1', 'a2']);
    a.eval(`catalogSortBy('buy', 'lot')`);
    assert.deepEqual(ids(a), ['a1', 'a10', 'a2']);
  });
  it('l\'export esce nello stesso ordine', () => {
    const a = app();
    a.eval(`catalogSortBy('buy', 'name')`);
    const righe = JSON.parse(a.eval('JSON.stringify(catalogExportSpec("buy").sezioni[0].righe)'));
    assert.deepEqual(righe.map(r => r[0]), ['CMM-2', 'cmm-1', 'CMM-10']);
  });
  it('la scelta resta nel browser, per vista', () => {
    const a = app();
    a.eval(`catalogSortBy('buy', 'name')`);
    assert.deepEqual(JSON.parse(a.eval(`localStorage.getItem('bomtrack_sort')`)), { buy: { key: 'name', dir: 1 } });
    assert.deepEqual(JSON.parse(a.eval('JSON.stringify(catalogSortOf("design"))')), { key: 'code', dir: 1 });
  });
  it('una preferenza rovinata torna al codice', () => {
    const a = app();
    a.eval(`catalogSort = { buy: { key: 'nonEsiste', dir: 1 } }`);
    assert.deepEqual(ids(a), ['a1', 'a2', 'a10']);
  });
  it('l\'intestazione è un pulsante con aria-sort', () => {
    const a = app();
    a.eval(`activeView = 'buy'; catalogSortBy('buy', 'name')`);
    const h = a.html('buy-table');
    assert.match(h, /aria-sort="ascending"><button type="button" class="th-sort on" onclick="catalogSortBy\('buy','name'\)"/);
    assert.match(h, /class="col-code" aria-sort="none"/);
  });
});
