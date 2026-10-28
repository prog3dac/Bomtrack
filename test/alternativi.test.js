// Modulo Alternativi (dalla 0.118.0): equivalenti, sostitutivi e le decisioni
// «usa l'alternativo» prese su un piano.
//
// Quello che qui si fissa:
//   - a modulo spento non cambia niente, nemmeno con i dati scritti;
//   - il fabbisogno non sostituisce mai da solo: propone, e sposta solo quanto
//     chi pianifica ha deciso, mai più di quanto serve;
//   - una volta decisa, l'alternativa è un articolo come gli altri: impegni,
//     montaggio e ordini di produzione la leggono dall'esplosione;
//   - le decisioni sono record salvati, e un calcolo non ci scrive dentro.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm, comp, wc } = require('./fixtures.js');

const fase = wcId => ({ kind: 'op', workCenterId: wcId, supplierId: null, costMode: 'fisso', cost: 3, hours: 0.5, days: 0, note: '' });
const piano = (id, qty, extra) => Object.assign({ id, number: 'FAB-' + id, title: id, date: '2026-07-01', active: true,
  lines: [{ id: 'l-' + id, itemId: 'grp', qty, dueDate: '2026-12-30' }] }, extra || {});

// Un gruppo con 4 cuscinetti SKF e una parte fatta da 2 kg di tondo. Il FAG è
// l'equivalente dichiarato dell'SKF; il tondo C40 quello del tondo.
function app(opz) {
  const o = opz || {};
  const a = loadApp({ silent: true });
  a.asRole('admin');
  a.setDb(makeDb({
    settings: { overheadPct: 0, marginPct: 0, currency: '€', modules: { alternativi: o.spento ? false : true } },
    workCenters: [wc('tor', 40)],
    items: [
      Object.assign(acq('skf', 10), { alternatives: [{ itemId: 'fag', note: 'stesse quote' }, { itemId: 'metri', note: '' }] }),
      acq('fag', 11), acq('ina', 12),
      Object.assign(acq('metri', 1), { uom: 'm' }),
      Object.assign(mat('tondo', 5), { uom: 'kg', alternatives: [{ itemId: 'c40', note: '' }] }),
      Object.assign(mat('c40', 6), { uom: 'kg' }),
      parte('p', { cycle: [{ kind: 'item', itemId: 'tondo', qty: 2 }, fase('tor')] }),
      asm('grp', 'gruppo', { components: [comp('skf', 4), comp('p', 1)] }),
    ],
    plans: o.piani || [piano('pl1', 10)],
  }));
  return a;
}
const ev = (a, js) => JSON.parse(a.eval(`(invalidateCaches(), JSON.stringify(${js}))`));
const acquisti = (a, planId) => ev(a, `Object.fromEntries(mrpExplodePlan(getPlan('${planId}')).buy.map(e => [e.item.id, e.qty]))`);

describe('Gli alternativi dell\'articolo', () => {
  it('valgono solo quelli che si contano con la stessa unità', () => {
    const a = app();
    assert.deepEqual(ev(a, "altDi(getItem('skf')).map(x => x.item.id)"), ['fag'], 'i metri non sostituiscono dei pezzi');
  });
  it('si aggiungono, si ordinano e si tolgono dalla scheda', () => {
    const a = app();
    a.eval("altAggiungi('skf', 'ina')");
    assert.deepEqual(ev(a, "getItem('skf').alternatives.map(r => r.itemId)"), ['fag', 'metri', 'ina']);
    a.eval("altSposta('skf', 2, -1); altSposta('skf', 1, -1)");
    assert.deepEqual(ev(a, "getItem('skf').alternatives.map(r => r.itemId)"), ['ina', 'fag', 'metri']);
    a.eval("altTogli('skf', 2)");
    assert.deepEqual(ev(a, "altDi(getItem('skf')).map(x => x.item.id)"), ['ina', 'fag']);
  });
  it('un articolo con un\'unità diversa non si aggiunge', () => {
    const a = app();
    a.eval("altAggiungi('fag', 'metri')");
    assert.equal(ev(a, "getItem('fag').alternatives || null"), null);
  });
  it('una parte fatta in casa non ha alternativi: ha un ciclo', () => {
    const a = app();
    assert.equal(ev(a, "altAmmesso(getItem('p'))"), false);
    assert.equal(ev(a, "altAmmesso(getItem('tondo'))"), true);
  });
  it('il sostitutivo vale solo su un articolo fuori produzione', () => {
    const a = app();
    a.eval("getItem('skf').replacedById = 'ina'");
    assert.equal(ev(a, "sostitutivoDi(getItem('skf'))"), null, 'non obsoleto: niente sostitutivo');
    a.eval("getItem('skf').obsolete = true");
    assert.equal(ev(a, "sostitutivoDi(getItem('skf')).id"), 'ina');
    assert.equal(ev(a, "altCandidati(getItem('skf'))[0].item.id"), 'ina', 'il sostitutivo viene prima degli alternativi');
  });
  it('dove è usato come alternativo si sa, e non si elimina in silenzio', () => {
    const a = app();
    assert.deepEqual(ev(a, "altUsatoDa('fag').map(i => i.id)"), ['skf']);
    assert.equal(ev(a, "isItemUsedAnywhere('fag')"), true);
  });
});

describe('Il fabbisogno propone, non decide', () => {
  it('senza decisioni l\'esplosione è quella di sempre', () => {
    const a = app();
    assert.deepEqual(acquisti(a, 'pl1'), { skf: 40, tondo: 20 });
  });
  it('con il principale scoperto e l\'alternativo a scaffale, la riga lo propone', () => {
    const a = app();
    a.eval("addMovement('fag', 'carico', 15, '')");
    const r = ev(a, "mrpBuyRows(getPlan('pl1'), true).find(r => r.item.id === 'skf').alternative.map(x => [x.item.id, x.libero])");
    assert.deepEqual(r, [['fag', 15]]);
  });
  it('con il principale coperto non propone niente', () => {
    const a = app();
    a.eval("addMovement('skf', 'carico', 40, ''); addMovement('fag', 'carico', 15, '')");
    assert.deepEqual(ev(a, "mrpBuyRows(getPlan('pl1'), true).find(r => r.item.id === 'skf').alternative"), []);
  });
  it('un obsoleto con sostitutivo lo propone sempre, anche senza giacenza', () => {
    const a = app();
    a.eval("Object.assign(getItem('skf'), { obsolete: true, replacedById: 'ina' })");
    const r = ev(a, "mrpBuyRows(getPlan('pl1'), true).find(r => r.item.id === 'skf').alternative.map(x => [x.item.id, x.sostitutivo])");
    assert.deepEqual(r, [['ina', true]]);
  });
  it('a modulo spento non propone niente e le decisioni scritte non contano', () => {
    const a = app({ spento: true, piani: [piano('pl1', 10, { substitutions: [{ id: 's1', itemId: 'skf', altItemId: 'fag', qty: 15 }] })] });
    a.eval("addMovement('fag', 'carico', 15, '')");
    assert.deepEqual(acquisti(a, 'pl1'), { skf: 40, tondo: 20 });
    assert.deepEqual(ev(a, "mrpBuyRows(getPlan('pl1'), true).find(r => r.item.id === 'skf').alternative"), []);
  });
});

describe('La decisione sul piano', () => {
  it('sposta la quantità decisa dal principale all\'alternativo', () => {
    const a = app();
    a.eval("sostituzioneAggiungi('pl1', 'skf', 'fag', 15)");
    assert.deepEqual(acquisti(a, 'pl1'), { skf: 25, fag: 15, tondo: 20 });
  });
  it('mai più di quanto serve', () => {
    const a = app();
    a.eval("sostituzioneAggiungi('pl1', 'skf', 'fag', 100)");
    assert.deepEqual(acquisti(a, 'pl1'), { fag: 40, tondo: 20 });
    const st = ev(a, "sostituzioniStato('pl1').map(s => s.applicata)");
    assert.deepEqual(st, [40], 'lo stato dice quanto ha spostato davvero');
  });
  it('la seconda volta sulla stessa coppia corregge, non raddoppia', () => {
    const a = app();
    a.eval("sostituzioneAggiungi('pl1', 'skf', 'fag', 15); sostituzioneAggiungi('pl1', 'skf', 'fag', 10)");
    assert.equal(ev(a, "getPlan('pl1').substitutions.length"), 1);
    assert.deepEqual(acquisti(a, 'pl1'), { skf: 30, fag: 10, tondo: 20 });
  });
  it('annullarla rimette tutto sul principale', () => {
    const a = app();
    const id = ev(a, "sostituzioneAggiungi('pl1', 'skf', 'fag', 15).id");
    a.eval(`sostituzioneTogli('pl1', '${id}')`);
    assert.deepEqual(acquisti(a, 'pl1'), { skf: 40, tondo: 20 });
  });
  it('vale anche per un materiale dentro il ciclo di una parte', () => {
    const a = app();
    a.eval("sostituzioneAggiungi('pl1', 'tondo', 'c40', 8)");
    assert.deepEqual(acquisti(a, 'pl1'), { skf: 40, tondo: 12, c40: 8 });
  });
  it('un articolo con un\'altra unità non si accetta', () => {
    const a = app();
    assert.equal(ev(a, "sostituzioneAggiungi('pl1', 'skf', 'metri', 5)"), null);
    assert.equal(ev(a, "(getPlan('pl1').substitutions || []).length"), 0);
  });
  it('l\'impegno passa all\'alternativo: un altro piano non lo conta più come libero', () => {
    const a = app({ piani: [piano('pl1', 10), piano('pl2', 5)] });
    a.eval("addMovement('fag', 'carico', 15, '')");
    a.eval("sostituzioneAggiungi('pl1', 'skf', 'fag', 15)");
    assert.equal(ev(a, "committedOf('fag', 'pl2')"), 15);
    assert.equal(ev(a, "committedOf('skf', 'pl2')"), 25);
  });
  it('il calcolo non scrive niente sulle decisioni salvate', () => {
    const a = app();
    a.eval("sostituzioneAggiungi('pl1', 'skf', 'fag', 15)");
    const prima = ev(a, "Object.keys(getPlan('pl1').substitutions[0]).sort()");
    ev(a, "(mrpBuyRows(getPlan('pl1'), true), sostituzioniStato('pl1'), 0)");
    assert.deepEqual(ev(a, "Object.keys(getPlan('pl1').substitutions[0]).sort()"), prima);
  });
  it('dopo la decisione non offre di nuovo i pezzi già presi', () => {
    const a = app();
    a.eval("addMovement('fag', 'carico', 15, '')");
    a.eval("sostituzioneAggiungi('pl1', 'skf', 'fag', 15)");
    assert.deepEqual(ev(a, "mrpBuyRows(getPlan('pl1'), true).find(r => r.item.id === 'skf').alternative"), []);
  });
  it('la riga dell\'alternativo dice al posto di chi sta', () => {
    const a = app();
    a.eval("sostituzioneAggiungi('pl1', 'skf', 'fag', 15)");
    const r = ev(a, "mrpBuyRows(getPlan('pl1'), false).filter(r => ['skf', 'fag'].includes(r.item.id)).map(r => [r.item.id, r.sostituito, r.sostituisce])");
    assert.deepEqual(r, [['fag', 0, [{ itemId: 'skf', qty: 15 }]], ['skf', 15, []]]);
  });
});

describe('Esce dal magazzino l\'articolo usato davvero', () => {
  it('il montaggio scarica l\'alternativo per la quota decisa', () => {
    const a = app();
    a.eval("addMovement('skf', 'carico', 100, ''); addMovement('fag', 'carico', 100, '')");
    a.eval("sostituzioneAggiungi('pl1', 'skf', 'fag', 6)");
    a.eval("montaggioDichiara('pl1', 'grp', 2)");
    assert.deepEqual(ev(a, "[onHandOf('skf'), onHandOf('fag')]"), [100 - 2, 100 - 6], '8 cuscinetti: 6 FAG decisi, 2 SKF');
  });
  it('quello che il piano ha già prelevato dell\'alternativo non si ripreleva', () => {
    const a = app();
    a.eval("addMovement('skf', 'carico', 100, ''); addMovement('fag', 'carico', 100, '')");
    a.eval("sostituzioneAggiungi('pl1', 'skf', 'fag', 6)");
    a.eval("montaggioDichiara('pl1', 'grp', 1)");
    a.eval("montaggioDichiara('pl1', 'grp', 1)");
    assert.deepEqual(ev(a, "[onHandOf('skf'), onHandOf('fag')]"), [100 - 2, 100 - 6]);
  });
  it('l\'ordine di produzione del piano congela il materiale alternativo', () => {
    const a = app();
    a.eval("sostituzioneAggiungi('pl1', 'tondo', 'c40', 8)");
    const m = ev(a, "opFreezeMaterials(getItem('p'), 10, 'pl1').map(r => [r.itemId, r.qty, r.perPezzo])");
    assert.deepEqual(m, [['c40', 8, 0.8], ['tondo', 12, 1.2]]);
  });
  it('fuori da un piano il materiale è quello del ciclo', () => {
    const a = app();
    a.eval("sostituzioneAggiungi('pl1', 'tondo', 'c40', 8)");
    assert.deepEqual(ev(a, "opFreezeMaterials(getItem('p'), 10).map(r => r.itemId)"), ['tondo']);
  });
});

describe('Il Riepilogo e la distinta', () => {
  it('segnala le distinte che usano un obsoleto con sostitutivo', () => {
    const a = app();
    assert.deepEqual(ev(a, 'distinteConObsoleti()'), []);
    a.eval("Object.assign(getItem('skf'), { obsolete: true, replacedById: 'ina' })");
    assert.deepEqual(ev(a, "distinteConObsoleti().map(x => [x.asm.id, x.item.id, x.sost.id])"), [['grp', 'skf', 'ina']]);
  });
  it('il segno in distinta c\'è solo a modulo acceso', () => {
    assert.match(ev(app(), "altMarker(getItem('skf'))"), /⇄ 1/);
    assert.equal(ev(app({ spento: true }), "altMarker(getItem('skf'))"), '');
  });
  it('la scheda del pannello laterale compare solo a modulo acceso', () => {
    const conta = a => ev(a, "inspSchedeArticolo(getItem('skf')).map(s => s.id)").includes('alternativi');
    assert.equal(conta(app()), true);
    assert.equal(conta(app({ spento: true })), false);
  });
});

describe('Il modulo si accende e si spegne', () => {
  it('un modulo nuovo nasce spento', () => {
    const a = loadApp({ silent: true });
    a.setDb(makeDb());
    assert.equal(ev(a, "moduloAttivo('alternativi')"), false);
    assert.equal(ev(a, "moduloAttivo('inesistente')"), false);
  });
  it('spegnerlo non cancella niente', () => {
    const a = app();
    a.eval("sostituzioneAggiungi('pl1', 'skf', 'fag', 15)");
    a.eval("db.settings.modules.alternativi = false; saveDB()");
    assert.deepEqual(acquisti(a, 'pl1'), { skf: 40, tondo: 20 });
    assert.equal(ev(a, "getPlan('pl1').substitutions.length"), 1);
    assert.equal(ev(a, "getItem('skf').alternatives.length"), 2);
    a.eval("db.settings.modules.alternativi = true; saveDB()");
    assert.deepEqual(acquisti(a, 'pl1'), { skf: 25, fag: 15, tondo: 20 });
  });
});
