// Il pulsante «Apri la distinta» sulle righe di gruppi e sottogruppi
// dell'albero di Gestione DB (0.134.0).
const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq, asm, comp } = require('./fixtures.js');

function app() {
  const a = loadApp({ silent: true });
  a.setDb(makeDb({ items: [
    asm('mac', 'macchina', { components: [comp('g1', 1), comp('c1', 1)] }),
    asm('g1', 'gruppo', { components: [comp('s1', 1)] }),
    asm('s1', 'sottogruppo', { components: [comp('c1', 2)] }),
    acq('c1', 5),
  ] }));
  a.asRole('admin');
  return a;
}
const bottoni = h => (h.match(/onclick="openBomFor\('[^']+'\)"/g) || []);

describe('Gestione DB: apri la distinta di un gruppo dalla sua riga', () => {
  it('c\'è sulle righe di gruppo, non su commerciali e radice', () => {
    const a = app();
    a.eval('currentBomId = "mac"; bomExpanded = new Set(); renderBom();');
    const h = a.html('bom-tree');
    assert.deepEqual(bottoni(h), [`onclick="openBomFor('g1')"`]);
    assert.match(h, /title="Apri la distinta di G1"/);
  });

  it('c\'è anche sui sottogruppi annidati, ed è l\'ultima azione a destra', () => {
    const a = app();
    a.eval('currentBomId = "mac"; expandAllBom(true);');
    const h = a.html('bom-tree');
    assert.deepEqual(bottoni(h), [`onclick="openBomFor('g1')"`, `onclick="openBomFor('s1')"`]);
    const riga = h.split('class="bom-row-actions"').find(r => r.includes("openBomFor('g1')")).split('class="bom-node')[0];
    assert.ok(riga.indexOf('openBomFor') > riga.indexOf('delComponent(0)'), 'dopo Elimina');
    assert.match(riga, /openBomFor\('g1'\)"><span[^]*<\/button>\s*<\/span>/, 'e niente dopo');
  });

  it('il clic apre quella distinta', () => {
    const a = app();
    a.eval('currentBomId = "mac"; renderBom(); openBomFor("g1");');
    assert.equal(a.eval('currentBomId'), 'g1');
  });
});
