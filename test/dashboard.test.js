// Il cruscotto: quanto vale il magazzino, cosa è fermo, cosa manca, chi è in
// ritardo. Non calcola niente di nuovo — e questi test lo tengono fermo:
// ogni cifra deve coincidere con quella della vista da cui viene.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq } = require('./fixtures.js');

const OGGI = '2026-10-12';
function app(over) {
  const a = loadApp({ silent: true });
  a.setDb(makeDb(Object.assign({
    suppliers: [{ id: 's1', name: 'SKF', active: true }, { id: 's2', name: 'Beta', active: true }],
    families: [{ id: 'f1', name: 'Cuscinetti', kind: 'acquistato', subs: [] }],
    items: [
      Object.assign(acq('c1', 5), { familyId: 'f1', safetyStock: 20 }),
      acq('c2', 2),
      mat('m1', 10),
      mat('m2', 1),
    ],
    movements: [
      { id: 'mv1', itemId: 'c1', kind: 'carico', qty: 10, date: '2026-10-01T08:00:00.000Z', note: '' },
      { id: 'mv2', itemId: 'm1', kind: 'carico', qty: 3, date: '2025-01-10T08:00:00.000Z', note: '' },
    ],
    orders: [
      { id: 'o1', number: 'ODA-2026-001', date: '2026-03-01', status: 'parziale', supplierId: 's1', active: true, lines: [
        { id: 'l1', itemId: 'c2', code: 'C2', qty: 10, price: 2, received: 4, deliveryDate: '2026-09-01', confirmedDate: '2026-09-20' },
        { id: 'l2', itemId: 'c1', code: 'C1', qty: 5, price: 5, received: 0, deliveryDate: '2026-12-01' }] },
      { id: 'o2', number: 'ODA-2026-002', date: '2026-04-01', status: 'confermato', supplierId: 's2', active: true, lines: [
        { id: 'l3', itemId: 'm2', code: 'M2', qty: 8, price: 1, received: 0, deliveryDate: '2026-10-10' }] },
      { id: 'o3', number: 'ODA-2026-003', date: '2026-04-01', status: 'bozza', supplierId: 's2', active: true, lines: [
        { id: 'l4', itemId: 'm2', code: 'M2', qty: 8, price: 1, received: 0, deliveryDate: '2020-01-01' }] },
    ],
  }, over || {})));
  a.asRole('lettore');
  return a;
}
const modello = (a, mesi) => JSON.parse(a.eval(`JSON.stringify((m => Object.assign({}, m, {
  fermi: m.fermi.map(f => ({ code: f.it.code, valore: f.valore, ultima: f.ultima })),
  sotto: m.sotto.map(s => ({ code: s.it.code, manca: s.manca, incoming: s.incoming })),
}))(dashModello(${JSON.stringify(OGGI)}, ${mesi || 6})))`));

describe('Il valore di magazzino', () => {
  it('è quello della tessera del magazzino, e si ripartisce per tipo e famiglia', () => {
    const a = app();
    const m = modello(a);
    // c1: 10 × 5 · c2: 4 × 2 · m1: 3 × 10
    approx(m.totale, 50 + 8 + 30);
    approx(a.eval('(db.items.filter(hasStock).reduce((s, i) => s + valoreGiacenza(i), 0))'), m.totale);
    assert.deepEqual(m.perTipo.map(t => [t.nome, t.valore]), [['Commerciale', 58], ['Materia prima', 30]]);
    assert.deepEqual(m.perFamiglia.map(f => [f.nome, f.valore]), [['Cuscinetti', 50], ['Senza famiglia', 38]]);
  });
});

describe('Gli articoli fermi', () => {
  it('fermo = con giacenza e niente movimenti dal limite; l\'ordine ricevuto conta con la sua data', () => {
    const a = app();
    const m = modello(a, 6);
    assert.deepEqual(m.fermi.map(f => f.code), ['M1', 'C2'], 'dal più costoso');
    assert.equal(m.fermi.find(f => f.code === 'C2').ultima, '2026-03-01', 'data dell\'ordine da cui è arrivato');
    approx(m.valoreFermo, 38);
  });

  it('con un limite più lungo il ricevuto di marzo non è più fermo', () => {
    const a = app();
    assert.deepEqual(modello(a, 12).fermi.map(f => f.code), ['M1']);
  });

  it('una giacenza a zero non è ferma: non c\'è niente immobilizzato', () => {
    const a = app();
    assert.equal(modello(a).fermi.some(f => f.code === 'M2'), false);
  });
});

describe('Sotto scorta e consegne scadute', () => {
  it('sotto scorta: quanto manca e quanto è già in arrivo', () => {
    const a = app();
    assert.deepEqual(modello(a).sotto, [{ code: 'C1', manca: 10, incoming: 5 }]);
  });

  it('le consegne scadute: data confermata se c\'è, solo il residuo, niente bozze', () => {
    const a = app();
    const s = modello(a).scaduti;
    assert.deepEqual(s.map(e => [e.nome, e.righe, e.valore, e.ritardoMax]), [['SKF', 1, 12, 22], ['Beta', 1, 8, 2]]);
    assert.deepEqual(s[0].docs.map(d => d.numero), ['ODA-2026-001']);
  });

  it('il calendario del Riepilogo legge le stesse righe', () => {
    const a = app();
    const n = a.eval('righeDaRicevere().length');
    assert.equal(n, 3, 'l1, l2, l3 — non la bozza');
  });
});

describe('La vista', () => {
  it('si disegna, anche per chi legge soltanto, e si esporta', () => {
    const a = app();
    a.eval('setView("dash")');
    const h = a.html('view-dash');
    assert.match(h, /Cruscotto/);
    assert.match(h, /Articoli fermi \(2\)/);
    assert.match(h, /ODA-2026-001/);
    const spec = JSON.parse(a.eval('JSON.stringify(dashExportSpec())'));
    assert.deepEqual(spec.sezioni.map(s => s.nome), ['Valore per famiglia', 'Articoli fermi', 'Sotto scorta', 'Consegne scadute']);
  });

  it('su un archivio vuoto non si rompe', () => {
    const a = app({ items: [], orders: [], movements: [] });
    a.eval('setView("dash")');
    assert.match(a.html('view-dash'), /Niente a magazzino/);
  });

  it('sta nel gruppo Riepilogo', () => {
    const a = app();
    assert.deepEqual(JSON.parse(a.eval('JSON.stringify(NAV[0].views.map(v => v.id))')), ['home', 'dash']);
  });
});

describe('Tessera del magazzino e cruscotto dicono lo stesso valore (dalla 0.105.6)', () => {
  it('una giacenza negativa non abbassa il valore, né sulla tessera né sul cruscotto', () => {
    // M1 +100 a 10 €, M2 −20 a 10 € (consumato prima di registrare l'arrivo).
    const a = app({
      items: [mat('m1', 10), mat('m2', 10)], orders: [],
      movements: [
        { id: 'a', itemId: 'm1', kind: 'carico', qty: 100, date: '2026-10-01T08:00:00.000Z', note: '' },
        { id: 'b', itemId: 'm2', kind: 'scarico', qty: -20, date: '2026-10-01T08:00:00.000Z', note: '' }],
    });
    approx(modello(a).totale, 1000);
    approx(a.eval('(db.items.filter(hasStock).reduce((s, i) => s + valoreGiacenza(i), 0))'), 1000);
  });
  it('un articolo disattivato non conta in nessuna delle due', () => {
    const a = app({
      items: [mat('m1', 10), Object.assign(mat('m2', 10), { active: false })], orders: [],
      movements: [
        { id: 'a', itemId: 'm1', kind: 'carico', qty: 1, date: '2026-10-01T08:00:00.000Z', note: '' },
        { id: 'b', itemId: 'm2', kind: 'carico', qty: 1, date: '2026-10-01T08:00:00.000Z', note: '' }],
    });
    approx(modello(a).totale, 10);
    approx(a.eval('(db.items.filter(hasStock).reduce((s, i) => s + valoreGiacenza(i), 0))'), 10);
  });
});
