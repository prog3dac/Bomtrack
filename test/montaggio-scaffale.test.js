// I quattro buchi di magazzino chiusi nella 0.100.0:
//   1. il montaggio di un assieme scarica i suoi componenti;
//   2. le parti già pronte a scaffale riducono il fabbisogno;
//   3. un ODP annullato restituisce il materiale non lavorato;
//   4. un prelievo che porta l'esistente sotto zero si dice.
//
// Ognuno era un numero che si allontanava dal vero senza che nessuno lo
// vedesse: commerciali che crescevano per sempre, tondo ricomprato per parti
// già fatte, materiale sparito da un ordine annullato, giacenze negative.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm, comp, wc } = require('./fixtures.js');

const fase = (wcId, s) => ({ kind: 'op', workCenterId: wcId, supplierId: s || null, costMode: 'fisso', cost: 3, hours: 0.5, days: 0, note: '' });
const piano = (id, qty, due, extra) => Object.assign({ id, number: 'FAB-' + id, title: id, date: '2026-07-01', active: true,
  lines: [{ id: 'l-' + id, itemId: 'grp', qty, dueDate: due || '2026-12-30' }] }, extra || {});

// Un gruppo: 1 parte (2 kg di tondo, una fase), 4 viti, e un sottogruppo da 2 viti.
function app(piani) {
  const a = loadApp({ silent: true });
  a.asRole('admin');
  a.setDb(makeDb({
    suppliers: [{ id: 'beta', name: 'Beta', active: true }], workCenters: [wc('tor', 40)],
    items: [Object.assign(mat('tondo', 5), { uom: 'kg' }), acq('vite', 0.1),
      parte('p', { cycle: [{ kind: 'item', itemId: 'tondo', qty: 2 }, fase('tor')] }),
      parte('pb', { cycle: [{ kind: 'item', itemId: 'tondo', qty: 1 }, fase('tor', 'beta')] }),
      asm('sg', 'sottogruppo', { components: [comp('vite', 2)] }),
      asm('grp', 'gruppo', { components: [comp('p', 1), comp('vite', 4), comp('sg', 1)] })],
    plans: piani || [piano('pl1', 10)],
  }));
  return a;
}
const ev = (a, js) => JSON.parse(a.eval(`(invalidateCaches(), JSON.stringify(${js}))`));
const esplosione = (a, planId) => ev(a, `(() => { const e = mrpExplodePlan(getPlan('${planId}'));
  const m = l => Object.fromEntries(l.map(x => [x.item.id, x.qty]));
  return { buy: m(e.buy), make: m(e.make), stock: m(e.stock) }; })()`);

describe('1. Il montaggio scarica i componenti', () => {
  it('escono i componenti diretti a magazzino, non quelli del sottoassieme', () => {
    const a = app();
    a.eval("addMovement('vite', 'carico', 200, ''); addMovement('p', 'carico', 20, '')");
    a.eval("montaggioDichiara('pl1', 'grp', 3)");
    const c = ev(a, "({ vite: onHandOf('vite'), p: onHandOf('p') })");
    assert.equal(c.vite, 200 - 12, '4 viti per 3 gruppi; le 2 del sottogruppo si scaricano col suo montaggio');
    assert.equal(c.p, 20 - 3);
  });
  it('lo scarico è del piano: l\'impegno sui componenti scende come col prelievo di un ODP', () => {
    const a = app();
    a.eval("addMovement('vite', 'carico', 200, '')");
    const prima = ev(a, "committedOf('vite', null)");
    assert.equal(prima, 60, '10 gruppi × (4 + 2) viti');
    a.eval("montaggioDichiara('pl1', 'grp', 3)");
    assert.equal(ev(a, "committedOf('vite', null)"), 60 - 12);
    assert.equal(ev(a, "freeStockOf('vite', null)"), 200 - 60, 'il libero non cambia: uscito e impegno scendono insieme');
  });
  it('le quantità dei componenti si correggono riga per riga', () => {
    const a = app();
    a.eval("addMovement('vite', 'carico', 50, '')");
    a.eval("montaggioDichiara('pl1', 'grp', 2, [{ itemId: 'vite', qty: 9 }])");
    assert.equal(ev(a, "onHandOf('vite')"), 41);
  });
  it('eliminare il montaggio restituisce i componenti', () => {
    const a = app();
    a.eval("addMovement('vite', 'carico', 50, '')");
    const id = a.eval("montaggioDichiara('pl1', 'grp', 2).id");
    a.eval('askConfirm = (m, si) => si()');
    a.eval(`produzioneElimina('${id}')`);
    assert.equal(ev(a, "onHandOf('vite')"), 50);
    assert.equal(ev(a, "prodottiDi('pl1', 'grp')"), 0);
  });
  it('il montaggio dichiarato conta come fatto nel piano', () => {
    const a = app();
    a.eval("montaggioDichiara('pl1', 'grp', 4)");
    assert.equal(ev(a, "daFare('pl1', 'grp', 10)"), 6);
  });
  it('zero pezzi non si dichiarano, e chi legge soltanto non dichiara', () => {
    const a = app();
    assert.equal(a.eval("montaggioDichiara('pl1', 'grp', 0)"), null);
    a.asRole('viewer');
    assert.equal(a.eval("montaggioDichiara('pl1', 'grp', 1)"), null);
    assert.equal(ev(a, '(db.productions || []).length'), 0);
  });
});

describe('2. Le parti pronte riducono il fabbisogno', () => {
  it('senza parti a scaffale l\'esplosione è quella di sempre', () => {
    assert.deepEqual(esplosione(app(), 'pl1'), { buy: { tondo: 20, vite: 60 }, make: { p: 10 }, stock: {} });
  });
  it('le parti a scaffale si prendono: si fabbrica e si compra solo il resto', () => {
    const a = app();
    a.eval("addMovement('p', 'carico', 4, '')");
    assert.deepEqual(esplosione(a, 'pl1'), { buy: { tondo: 12, vite: 60 }, make: { p: 6 }, stock: { p: 4 } });
  });
  it('le parti prese sono impegnate dal piano, e la scorta minima non si tocca', () => {
    const a = app();
    a.eval("getItem('p').safetyStock = 1; addMovement('p', 'carico', 4, '')");
    assert.deepEqual(esplosione(a, 'pl1').stock, { p: 3 });
    assert.equal(ev(a, "committedOf('p', null)"), 3);
  });
  it('lo scaffale si spartisce: prende prima il piano con la consegna più vicina', () => {
    const a = app([piano('tardi', 5, '2026-12-30'), piano('presto', 5, '2026-10-30')]);
    a.eval("addMovement('p', 'carico', 7, '')");
    assert.deepEqual(esplosione(a, 'presto').stock, { p: 5 });
    assert.deepEqual(esplosione(a, 'tardi').stock, { p: 2 });
    assert.deepEqual(esplosione(a, 'tardi').make, { p: 3 });
  });
  it('un piano chiuso non prende niente', () => {
    const a = app([piano('pl1', 5), piano('chiuso', 5, '2026-08-01', { active: false })]);
    a.eval("addMovement('p', 'carico', 5, '')");
    assert.deepEqual(esplosione(a, 'pl1').stock, { p: 5 });
  });
  it('le parti fabbricate da un ODP del piano restano sue, anche se un altro piano è più urgente', () => {
    const a = app([piano('mio', 5, '2026-12-30'), piano('urgente', 5, '2026-09-30')]);
    a.eval(`(() => { const o = odpNew(getItem('p'), 5, '2026-12-01', { planId: 'mio' });
      db.prodOrders.push(o); invalidateCaches(); opLancia(o.id);
      opAvvia(o.id, o.phases[0].id, {}); opDichiara(o.id, o.phases[0].id, { qty: 5 }); })()`);
    assert.equal(ev(a, "onHandOf('p')"), 5);
    assert.deepEqual(esplosione(a, 'urgente').stock, {}, 'quelle 5 sono il da fabbricare già fatto del piano «mio»');
  });
  it('quello che il piano ha già consumato dallo scaffale resta preso: non si rifabbrica', () => {
    const a = app();
    a.eval("addMovement('p', 'carico', 4, ''); addMovement('vite', 'carico', 100, '')");
    a.eval("montaggioDichiara('pl1', 'grp', 4)");
    assert.equal(ev(a, "onHandOf('p')"), 0);
    assert.deepEqual(esplosione(a, 'pl1').make, { p: 6 }, 'le 4 parti montate restano coperte');
    assert.equal(ev(a, "committedOf('p', null)"), 0, 'consumate: non sono più promesse a nessuno');
  });
  it('la costificazione e le anteprime restano lorde', () => {
    const a = app();
    a.eval("addMovement('p', 'carico', 10, '')");
    assert.deepEqual(ev(a, "mrpExplode(getPlan('pl1').lines).make.map(x => x.qty)"), [10]);
  });
});

describe('3. Un ODP annullato restituisce il materiale', () => {
  function odp(a, part, qty) {
    return a.eval(`(() => { const o = odpNew(getItem('${part}'), ${qty}, '2026-12-01', { planId: 'pl1' });
      db.prodOrders.push(o); invalidateCaches(); opLancia(o.id); opAvvia(o.id, o.phases[0].id, {}); return o.id; })()`);
  }
  it('propone il materiale dei pezzi non ancora lavorati dalla prima fase', () => {
    const a = app();
    a.eval("addMovement('tondo', 'carico', 100, '')");
    const id = odp(a, 'p', 10);
    a.eval(`opDichiara('${id}', getOdp('${id}').phases[0].id, { qty: 3, scrap: 1 })`);
    const r = ev(a, `opResoProposto(getOdp('${id}'))`);
    assert.equal(r.length, 1);
    assert.equal(r[0].uscito, 20);
    assert.equal(r[0].proposto, 12, '6 pezzi su 10 non lavorati × 2 kg');
  });
  it('annullando, il materiale torna con un reso e l\'esistente risale', () => {
    const a = app();
    a.eval("addMovement('tondo', 'carico', 100, '')");
    const id = odp(a, 'p', 10);
    assert.equal(ev(a, "onHandOf('tondo')"), 80);
    assert.equal(a.eval(`opAnnullaConReso('${id}', [{ itemId: 'tondo', qty: 20 }])`), 1);
    const c = ev(a, `({ esistente: onHandOf('tondo'), stato: getOdp('${id}').status,
      tipo: db.movements.filter(m => m.orderId === '${id}').map(m => m.kind) })`);
    assert.equal(c.esistente, 100);
    assert.equal(c.stato, 'annullato');
    assert.deepEqual(c.tipo, ['scarico', 'reso']);
    assert.deepEqual(ev(a, `opResoProposto(getOdp('${id}'))`), [], 'niente da restituire due volte');
  });
  it('dal terzista torna con un rientro, e il prospetto presso terzi si azzera', () => {
    const a = app();
    a.eval("addMovement('tondo', 'carico', 100, '')");
    const id = odp(a, 'pb', 10);
    assert.equal(ev(a, "atSupplierOf('tondo')"), 10);
    a.eval(`opAnnullaConReso('${id}', [{ itemId: 'tondo', qty: 10 }])`);
    assert.equal(ev(a, "atSupplierOf('tondo')"), 0);
    assert.equal(ev(a, "onHandOf('tondo')"), 100);
  });
  it('il reso non è fra i movimenti che si scrivono a mano', () => {
    assert.equal(ev(app(), "MOVEMENT_MANUAL_KINDS.includes('reso')"), false);
  });
});

describe('4. Un prelievo sotto zero si dice', () => {
  it('nomina l\'articolo, quanto esce e quanto c\'è', () => {
    const a = app();
    a.eval("addMovement('tondo', 'carico', 20, '')");
    const r = ev(a, "avvisoSottoZero([{ itemId: 'tondo', qty: 30 }, { itemId: 'vite', qty: 0 }])");
    assert.equal(r.length, 1);
    assert.match(r[0], /TONDO: ne escono 30, a magazzino ce ne sono 20/);
  });
  it('somma le righe dello stesso articolo, e tace quando basta', () => {
    const a = app();
    a.eval("addMovement('tondo', 'carico', 20, '')");
    assert.equal(ev(a, "avvisoSottoZero([{ itemId: 'tondo', qty: 15 }, { itemId: 'tondo', qty: 6 }]).length"), 1);
    assert.equal(ev(a, "avvisoSottoZero([{ itemId: 'tondo', qty: 20 }]).length"), 0);
  });
  it('non blocca: il prelievo di un ODP si registra lo stesso', () => {
    const a = app();
    a.eval("addMovement('tondo', 'carico', 5, '')");
    a.eval(`(() => { const o = odpNew(getItem('p'), 10, '2026-12-01', { planId: 'pl1' });
      db.prodOrders.push(o); invalidateCaches(); opLancia(o.id); opAvvia(o.id, o.phases[0].id, {}); })()`);
    assert.equal(ev(a, "onHandOf('tondo')"), -15);
  });
});

// 0.105.5: la parte dichiarata fatta sul piano non entrava a magazzino, e il
// montaggio la scaricava lo stesso.
describe('Parti dichiarate sul piano, poi montate', () => {
  it('la giacenza della parte non va sotto zero', () => {
    const a = app();
    a.eval("produzioneDichiara('pl1', 'p', 10)");
    assert.equal(ev(a, "onHandOf('p')"), 10);
    a.eval("addMovement('vite', 'carico', 200, ''); montaggioDichiara('pl1', 'grp', 10)");
    assert.equal(ev(a, "onHandOf('p')"), 0);
    assert.equal(esplosione(a, 'pl1').make.p || 0, 10, 'la parte resta del piano, fatta: non la si ricompra né la si prende due volte');
  });
});
