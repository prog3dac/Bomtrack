// Niente buchi nelle serie (0.104.1): si elimina solo l'ultimo documento di una
// serie e l'ultimo codice di una codifica; gli altri si annullano, si chiudono
// o si segnano obsoleti. L'ultimo eliminato restituisce il suo numero.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db);
  a.asRole('admin');
  a.eval('globalThis.__avvisi = []; showToast = m => __avvisi.push(m);');
  return a;
}
const avvisi = a => a.eval('__avvisi.splice(0).join(" | ")');
const ordine = (id, number) => ({ id, number, status: 'bozza', date: '2026-10-01', supplierId: null, lines: [], active: true });

describe('Documenti: si elimina solo l\'ultimo della serie', () => {
  it('un ordine in mezzo non si elimina, e si dice di annullarlo', () => {
    const a = app(makeDb({ items: [], orders: [ordine('o1', 'ODA-2026-001'), ordine('o2', 'ODA-2026-002')] }));
    a.eval(`delOrder('o1')`);
    assert.match(avvisi(a), /ODA-2026-001 non è l'ultimo.*Annullalo/);
    assert.equal(a.eval('db.orders.length'), 2);
  });

  it('l\'ultimo si elimina, e il suo numero torna al prossimo', () => {
    const a = app(makeDb({ items: [], orders: [ordine('o1', 'ODA-2026-001'), ordine('o2', 'ODA-2026-002')] }));
    a.eval(`delOrder('o2'); confirmYes();`);
    assert.equal(a.eval('db.orders.length'), 1);
    assert.equal(a.eval(`serieMassimo('ODA-2026-', db.orders) + 1`), 2);
  });

  it('le serie degli anni diversi non si toccano', () => {
    const a = app(makeDb({ items: [], orders: [ordine('o1', 'ODA-2025-009'), ordine('o2', 'ODA-2026-001')] }));
    a.eval(`delOrder('o1'); confirmYes();`);
    assert.equal(a.eval('db.orders.length'), 1, 'l\'ultimo del 2025 è l\'ultimo della sua serie');
  });

  it('vale per commesse, piani e ordini di produzione', () => {
    const a = app(makeDb({ items: [],
      jobs: [{ id: 'j1', number: 'COM-2026-001', status: 'aperta', active: true }, { id: 'j2', number: 'COM-2026-002', status: 'aperta', active: true }],
      plans: [{ id: 'p1', number: 'FAB-2026-001', lines: [], active: true }, { id: 'p2', number: 'FAB-2026-002', lines: [], active: true }],
      prodOrders: [{ id: 'd1', number: 'ODP-2026-001', status: 'bozza', phases: [], materials: [], active: true }, { id: 'd2', number: 'ODP-2026-002', status: 'bozza', phases: [], materials: [], active: true }],
    }));
    a.eval(`delJob('j1'); delPlan('p1'); delOdp('d1');`);
    const msg = avvisi(a);
    assert.match(msg, /COM-2026-001 non è l'ultimo.*Annullala/);
    assert.match(msg, /FAB-2026-001 non è l'ultimo.*Chiudilo/);
    assert.match(msg, /ODP-2026-001 non è l'ultimo.*Annullalo/);
    assert.equal(a.eval('db.jobs.length + db.plans.length + db.prodOrders.length'), 6);
  });
});

// 0.105.5: con l'archivio condiviso il successivo può essere di un collega e
// non ancora arrivato. Si riceve prima di eliminare, e si ricontrolla.
describe('Con l\'archivio condiviso «l\'ultimo» si controlla dopo aver ricevuto', () => {
  it('un ordine che un collega ha appena superato non si elimina', () => {
    const a = app(makeDb({ items: [], orders: [ordine('o1', 'ODA-2026-001')] }));
    a.eval(`conArchivioAggiornato = fn => { db.orders.push(${JSON.stringify(ordine('o2', 'ODA-2026-002'))}); return fn(); };`);
    a.eval(`delOrder('o1'); confirmYes();`);
    assert.match(avvisi(a), /ODA-2026-001 non è l'ultimo/);
    assert.equal(a.eval('db.orders.length'), 2);
  });
  it('lo stesso per un codice articolo', () => {
    const a = app(makeDb({ items: [Object.assign(mat('m1', 1), { code: 'MAT-ACC-001' })] }));
    a.eval(`conArchivioAggiornato = fn => { db.items.push(${JSON.stringify(Object.assign(mat('m2', 1), { code: 'MAT-ACC-002' }))}); return fn(); };`);
    a.eval(`delItem('m1'); confirmYes();`);
    assert.match(avvisi(a), /MAT-ACC-001 non è l'ultimo/);
    assert.equal(a.eval('db.items.length'), 2);
  });
});

describe('Articoli: si elimina solo l\'ultimo codice della serie', () => {
  const codice = (id, code, type) => Object.assign(mat(id, 1), { code }, type ? { type } : {});

  it('un codice in mezzo non si elimina, l\'ultimo sì', () => {
    const a = app(makeDb({ items: [codice('m1', 'MAT-ACC-001'), codice('m2', 'MAT-ACC-002')] }));
    a.eval(`delItem('m1')`);
    assert.match(avvisi(a), /MAT-ACC-001 non è l'ultimo.*obsoleto/);
    a.eval(`delItem('m2'); confirmYes();`);
    assert.equal(a.eval('db.items.map(i => i.code).join()'), 'MAT-ACC-001');
  });

  it('in blocco se ne vanno quelli in coda, contando quelli che se ne vanno insieme', () => {
    const a = app(makeDb({ items: ['001', '002', '003', '004'].map((n, i) => codice('m' + i, 'MAT-ACC-' + n)) }));
    a.eval(`activeView = 'buy'; bulkDelete(['m0', 'm2', 'm3']); confirmYes();`);
    assert.equal(a.eval('db.items.map(i => i.code).join()'), 'MAT-ACC-001,MAT-ACC-002',
      'il 003 e il 004 vanno insieme; l\'001 resterebbe un buco sotto il 002');
  });

  it('i sottogruppi contano a scendere: l\'ultimo è il più basso', () => {
    const a = app(makeDb({ items: [codice('s1', 'TRN-BAS-999', 'sottogruppo'), codice('s2', 'TRN-BAS-998', 'sottogruppo'), codice('p1', 'TRN-BAS-001', 'parte')] }));
    assert.equal(a.eval(`articoloUltimo(getItem('s1'))`), false);
    assert.equal(a.eval(`articoloUltimo(getItem('s2'))`), true);
    assert.equal(a.eval(`articoloUltimo(getItem('p1'))`), true, 'le parti salgono per conto loro');
  });

  // 0.105.5: VITE-M6X20 e VITE-M6X25 si bloccavano a vicenda.
  it('un codice scritto a mano che finisce con un numero non è in una serie', () => {
    const a = app(makeDb({ items: [codice('v1', 'VITE-TCEI-M6X20'), codice('v2', 'VITE-TCEI-M6X25'), codice('k1', 'SKF 6205'), codice('k2', 'SKF 6206')] }));
    assert.equal(a.eval(`articoloUltimo(getItem('v1')) && articoloUltimo(getItem('k1'))`), true);
  });

  it('un codice senza numero in fondo non è in una serie', () => {
    const a = app(makeDb({ items: [codice('m1', 'VITE-SPECIALE'), codice('m2', 'MAT-ACC-002')] }));
    assert.equal(a.eval(`articoloUltimo(getItem('m1'))`), true);
  });
});
