// Tempo fase e attrezzaggio in minuti (dalla 0.137.0).
//
// Nel ciclo il tempo di una fase interna e il suo attrezzaggio si scrivono e
// si leggono in minuti; sotto restano in ore (`hours`, `setupHours`), così i
// dati già salvati non cambiano e nessun conto si sposta.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, parte, wc } = require('./fixtures.js');

const op = o => Object.assign({ kind: 'op', supplierId: '', costMode: 'orario', rate: 60, cost: 0, hours: 0.25, days: 0, note: '' }, o);
function app(cycle) {
  const a = loadApp({ silent: true });
  a.asRole('admin');
  a.setDb(makeDb({
    suppliers: [{ id: 'beta', name: 'Beta', active: true, transitDays: 0 }],
    workCenters: [Object.assign(wc('tor', 60), { hoursPerDay: 8, setupHours: 0.5, queueDays: 0 })],
    items: [parte('p', { cycle: cycle || [op({ workCenterId: 'tor', setupHours: 1.5 })] })],
  }));
  a.eval('invalidateCaches()');
  return a;
}
const ev = (a, code) => JSON.parse(a.eval(`JSON.stringify(${code})`));

describe('Minuti: conversione', () => {
  it('ore e minuti vanno e tornano', () => {
    const a = app();
    assert.deepEqual(ev(a, '[minDaOre(0.25), minDaOre(1.5), minDaOre(0), minDaOre(null), oreDaMin(90), oreDaMin(15)]'),
      [15, 90, 0, 0, 1.5, 0.25]);
    assert.equal(a.eval('fmtMin(0.125)'), '7,5 min');
  });
  it('un valore che non si scrive in minuti tondi resta com era se il campo non cambia', () => {
    const a = app([op({ workCenterId: 'tor', hours: 0.333, setupHours: 0.123 })]);
    // Il DOM del test non legge l'HTML: i campi si riempiono con quello che
    // l'editor mostra (19,98 e 7,38 min).
    a.eval("openCycleFor('p')");
    assert.match(a.html('cyc-body'), /value="19.98"[^>]*id="cyc-opmin-0"/);
    a.el('cyc-opmin-0').value = '19.98';
    a.el('cyc-opsetup-0').value = '7.38';
    a.eval('updateCycleRow(0)');
    assert.deepEqual(ev(a, "[getItem('p').cycle[0].hours, getItem('p').cycle[0].setupHours]"), [0.333, 0.123]);
  });
});

describe('Minuti: editor del ciclo', () => {
  it('la fase interna mostra tempo fase e attrezzaggio in minuti', () => {
    const a = app();
    a.eval("openCycleFor('p')");
    const h = a.html('cyc-body');
    assert.match(h, /Tempo\/pz \(min\)/);
    assert.match(h, /Attrezz. \(min\)/);
    assert.match(h, /value="15"[^>]*id="cyc-opmin-0"/);
    assert.match(h, /value="90"[^>]*id="cyc-opsetup-0"/);
  });
  it('i minuti scritti si salvano in ore, e il costo non cambia unità', () => {
    const a = app();
    a.eval("openCycleFor('p')");
    a.el('cyc-opmin-0').value = '30';
    a.el('cyc-opsetup-0').value = '45';
    a.el('cyc-oprate-0').value = '60';
    a.eval('updateCycleRow(0)');
    assert.deepEqual(ev(a, "[getItem('p').cycle[0].hours, getItem('p').cycle[0].setupHours]"), [0.5, 0.75]);
    // 30 min a 60 €/h = 30 €
    assert.equal(a.eval("cycleRowCost(getItem('p').cycle[0])"), 30);
  });
  it('una fase nuova interna nasce dai minuti, una esterna oraria dalle ore fatturate', () => {
    const a = app([]);
    a.eval('currentCycleItemId = "p"');
    a.el('cyc-wc').value = 'tor';
    a.el('cyc-opmode').value = 'fisso';
    a.el('cyc-opmin').value = '12';
    a.el('cyc-opsetup').value = '20';
    a.el('cyc-opcost').value = '3';
    a.eval('pickCycleOp()');
    const r = ev(a, "getItem('p').cycle[0]");
    assert.equal(r.hours, 0.2);
    assert.ok(Math.abs(r.setupHours - 1 / 3) < 1e-12);
    a.el('cyc-opsup').value = 'beta';
    a.el('cyc-opmode').value = 'orario';
    a.el('cyc-opmin').value = '999';
    a.el('cyc-ophours').value = '2';
    a.el('cyc-oprate').value = '30';
    a.eval('pickCycleOp()');
    assert.equal(ev(a, "getItem('p').cycle[1].hours"), 2, 'le ore fatturate dal terzista restano ore');
  });
});

describe('Minuti: centro di lavoro', () => {
  it('l attrezzaggio proposto si scrive in minuti e passa alle fasi nuove', () => {
    const a = app();
    a.eval("editWcModal('tor')");
    a.el('ew-name').value = 'CDL tor';
    a.el('ew-setup').value = '20';
    a.eval("saveWc('tor')");
    assert.ok(Math.abs(ev(a, "getWorkCenter('tor').setupHours") - 1 / 3) < 1e-12);
  });
  it('dall Excel: «Attrezzaggio min» in minuti, il vecchio «Attrezzaggio h» in ore', () => {
    const a = app();
    a.eval(`importSettingsSheets({ 'Centri di lavoro': [{ 'Nome': 'CDL tor', 'Attrezzaggio min': 45 }] })`);
    assert.equal(ev(a, "getWorkCenter('tor').setupHours"), 0.75);
    a.eval(`importSettingsSheets({ 'Centri di lavoro': [{ 'Nome': 'CDL tor', 'Attrezzaggio h': 2 }] })`);
    assert.equal(ev(a, "getWorkCenter('tor').setupHours"), 2);
  });
});

describe('Minuti: export e stampe', () => {
  it('il foglio del ciclo ha tempo fase e attrezzaggio in minuti', () => {
    const a = app();
    a.eval("openCycleFor('p')");
    const spec = ev(a, 'cycleExportSpec()');
    const s = spec.sezioni.find(x => x.nome === 'Ciclo di lavorazione');
    assert.deepEqual(s.colonne.slice(3, 6).map(c => c.h), ['Tempo fase (min/pz)', 'Attrezzaggio (min)', 'Ore fatturate (h/pz)']);
    assert.deepEqual(s.righe[0].slice(3, 6), [15, 90, '']);
  });
});
