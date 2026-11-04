// Modulo Qualità — collaudo della merce in entrata (0.140.0).
//
// Le domande a cui questi test rispondono:
//  - la merce che aspetta un esito resta nell'esistente ma **non** nel libero;
//  - un esito accettato la libera, un respinto la rimanda indietro per la
//    stessa strada da cui è arrivata (il ricevuto di un ordine, il conto
//    lavoro di un ODL) e il fabbisogno torna ad aspettarla;
//  - spento il modulo, l'app è esattamente quella di prima.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq } = require('./fixtures.js');

function base(opz) {
  const o = opz || {};
  const art = Object.assign(acq('c1', 5), { uom: 'pz', supplierId: 's1' });
  if (o.qc !== false) art.qc = 'si';
  if (o.cert) art.qcCert = o.cert;
  return makeDb({
    suppliers: [{ id: 's1', name: 'SKF', active: true }, { id: 's2', name: 'Beta', active: true }],
    items: [art, Object.assign(mat('m1', 10), { uom: 'kg' })],
    settings: { overheadPct: 0, marginPct: 0, currency: '€', modules: { qualita: o.spento ? false : true } },
    orders: [{ id: 'o1', number: 'ODA-2026-001', title: '', date: '2026-02-01', status: 'confermato',
      supplierId: 's1', notes: '', notesInternal: '', supplierConfirmation: 'X', active: true,
      lines: [{ id: 'l1', itemId: 'c1', code: 'CMM-001', description: 'Cuscinetto', uom: 'pz',
        qty: 100, price: 5, deliveryDate: '', received: 0, note: '' }] }],
  });
}
function app(db, role) {
  const a = loadApp({ silent: true });
  a.setDb(db || base());
  a.asRole(role || 'admin');
  return a;
}
// Riceve `q` pezzi sulla riga dell'ordine, come chi scrive nella colonna.
function ricevi(a, q) { a.eval(`ordSetLine('o1','l1','received', ${JSON.stringify(String(q))})`); }
const num = (a, expr) => Number(a.eval(expr));

describe('Il collaudo nasce dal ricevimento', () => {
  it('un articolo da controllare apre un collaudo per quello che è arrivato', () => {
    const a = app();
    ricevi(a, 40);
    const c = JSON.parse(a.eval('JSON.stringify(qcTutti())'));
    assert.equal(c.length, 1);
    assert.equal(c[0].qty, 40);
    assert.equal(c[0].status, 'aperto');
    assert.equal(c[0].itemId, 'c1');
    assert.equal(c[0].source, 'oda');
    assert.match(c[0].number, /^COL-\d{4}-\d{3}$/);
  });

  it('un articolo senza controllo non ne apre nessuno', () => {
    const a = app(base({ qc: false }));
    ricevi(a, 40);
    assert.equal(num(a, 'qcTutti().length'), 0);
  });

  it('col modulo spento non succede niente, nemmeno sugli articoli segnati', () => {
    const a = app(base({ spento: true }));
    ricevi(a, 40);
    assert.equal(num(a, 'qcTutti().length'), 0);
    assert.equal(num(a, 'inQCOf("c1")'), 0);
  });

  it('la famiglia decide per i suoi articoli, e l\'articolo può scostarsene', () => {
    const db = base({ qc: false });
    db.families = [{ id: 'f1', name: 'Cuscinetti', kind: 'acquistato', sigla: 'CUS', qc: 'si',
      subs: [{ id: 'f1s1', name: 'A sfere', sigla: 'SFE' }, { id: 'f1s2', name: 'Volventi', sigla: 'VOL', qc: 'no' }] }];
    db.items[0].familyId = 'f1';
    const a = app(db);
    assert.equal(a.eval('qcRichiesto(getItem("c1"))'), true, 'eredita dalla famiglia');
    a.eval('getItem("c1").subFamilyId = "f1s2"');
    assert.equal(a.eval('qcRichiesto(getItem("c1"))'), false, 'la sottofamiglia dice no');
    a.eval('getItem("c1").subFamilyId = "f1s1"');
    assert.equal(a.eval('qcRichiesto(getItem("c1"))'), true, 'la sottofamiglia tace: vale la famiglia');
    a.eval('getItem("c1").qc = "no"');
    assert.equal(a.eval('qcRichiesto(getItem("c1"))'), false, 'l\'articolo vince su tutto');
  });

  it('un ricevuto corretto in giù non apre un secondo collaudo', () => {
    const a = app();
    ricevi(a, 40);
    ricevi(a, 30);
    assert.equal(num(a, 'qcTutti().length'), 1);
  });

  it('un secondo arrivo apre il suo collaudo: sono due lotti diversi', () => {
    const a = app();
    ricevi(a, 40);
    ricevi(a, 70);
    const c = JSON.parse(a.eval('JSON.stringify(qcTutti())'));
    assert.deepEqual(c.map(x => x.qty), [40, 30]);
  });
});

describe('La merce in collaudo è a scaffale ma non è libera', () => {
  it('l\'esistente la conta, il libero no', () => {
    const a = app();
    ricevi(a, 40);
    assert.equal(num(a, 'onHandOf("c1")'), 40, 'pagata e sullo scaffale: è esistente');
    assert.equal(num(a, 'inQCOf("c1")'), 40);
    // Libero = quello di cui si può disporre: dei 40 arrivati nessuno, restano
    // i 60 che il fornitore deve ancora consegnare.
    assert.equal(num(a, 'freeStockOf("c1", null)'), 60);
  });

  it('accettata, diventa libera', () => {
    const a = app();
    ricevi(a, 40);
    const id = a.eval('qcTutti()[0].id');
    assert.equal(a.eval(`qcRegistraEsito(${JSON.stringify(id)}, { esito: 'accettato' })`), true);
    assert.equal(num(a, 'onHandOf("c1")'), 40);
    assert.equal(num(a, 'inQCOf("c1")'), 0);
    assert.equal(num(a, 'freeStockOf("c1", null)'), 100, '40 a scaffale + 60 in arrivo');
  });

  it('la quantità è nell\'unità del fornitore, la trattenuta in quella di gestione', () => {
    // Il fornitore quota in kg, il magazzino conta in metri: 8 kg al metro.
    const db = base();
    Object.assign(db.items[0], { uom: 'm', altUom: 'kg', altFactor: 8 });
    db.orders[0].lines[0].uom = 'kg';
    const a = app(db);
    ricevi(a, 80);
    assert.equal(num(a, 'onHandOf("c1")'), 10, '80 kg sono 10 m');
    assert.equal(num(a, 'inQCOf("c1")'), 10, 'la trattenuta parla la stessa lingua');
    assert.equal(num(a, 'freeStockOf("c1", null)'), 2.5, 'solo i 20 kg ancora da consegnare');
  });

  it('il modulo spento dopo non lascia trattenute in giro', () => {
    const a = app();
    ricevi(a, 40);
    a.eval('db.settings.modules.qualita = false; invalidateStock()');
    assert.equal(num(a, 'inQCOf("c1")'), 0);
    assert.equal(num(a, 'freeStockOf("c1", null)'), 100);
  });
});

describe('Il respinto torna indietro per la strada da cui è venuto', () => {
  it('su un ordine fornitore scende il ricevuto, e la riga torna ad avere un residuo', () => {
    const a = app();
    ricevi(a, 40);
    const id = a.eval('qcTutti()[0].id');
    assert.equal(a.eval(`qcRegistraEsito(${JSON.stringify(id)}, { esito: 'respinto', qtyKo: 40 })`), true);
    assert.equal(num(a, 'getOrder("o1").lines[0].received'), 0);
    assert.equal(num(a, 'onHandOf("c1")'), 0, 'la merce non c\'è più');
    assert.equal(num(a, 'inQCOf("c1")'), 0);
    assert.equal(num(a, 'stockOf("c1").incoming'), 100, 'il fornitore la deve ancora consegnare');
  });

  it('respinta solo una parte, il resto resta ed è libero', () => {
    const a = app();
    ricevi(a, 40);
    const id = a.eval('qcTutti()[0].id');
    a.eval(`qcRegistraEsito(${JSON.stringify(id)}, { esito: 'respinto', qtyKo: 10 })`);
    assert.equal(num(a, 'getOrder("o1").lines[0].received'), 30);
    assert.equal(num(a, 'onHandOf("c1")'), 30);
    assert.equal(num(a, 'inQCOf("c1")'), 0);
    assert.equal(num(a, 'freeStockOf("c1", null)'), 100, '30 a scaffale + 70 ancora da consegnare');
    const c = JSON.parse(a.eval('JSON.stringify(qcTutti()[0])'));
    assert.equal(c.qtyOk, 30);
    assert.equal(c.qtyKo, 10);
    assert.equal(c.esito, 'respinto');
  });

  it('tenuta e rottamata, esce come consumo e non torna al fornitore', () => {
    const a = app();
    ricevi(a, 40);
    const id = a.eval('qcTutti()[0].id');
    a.eval(`qcRegistraEsito(${JSON.stringify(id)}, { esito: 'respinto', qtyKo: 40, destino: 'scarto' })`);
    assert.equal(num(a, 'getOrder("o1").lines[0].received'), 40, 'il fornitore ha consegnato: il ricevuto resta');
    assert.equal(num(a, 'onHandOf("c1")'), 0, 'ma a scaffale non c\'è più niente');
    assert.equal(num(a, 'db.movements.filter(m => m.kind === "scarico").length'), 1);
  });

  it('in deroga entra, e resta scritto che è passata con riserva', () => {
    const a = app();
    ricevi(a, 40);
    const id = a.eval('qcTutti()[0].id');
    a.eval(`qcRegistraEsito(${JSON.stringify(id)}, { esito: 'deroga', note: 'montata sul banco di prova' })`);
    const c = JSON.parse(a.eval('JSON.stringify(qcTutti()[0])'));
    assert.equal(c.esito, 'deroga');
    assert.equal(c.qtyOk, 40);
    assert.equal(num(a, 'inQCOf("c1")'), 0);
  });
});

describe('Gli esiti che non stanno in piedi si rifiutano', () => {
  it('un accettato con dei pezzi respinti non si registra', () => {
    const a = app();
    ricevi(a, 40);
    const id = a.eval('qcTutti()[0].id');
    assert.equal(a.eval(`qcRegistraEsito(${JSON.stringify(id)}, { esito: 'accettato', qtyKo: 5 })`), false);
    assert.equal(a.eval('qcTutti()[0].status'), 'aperto');
  });

  it('un respinto senza pezzi respinti non si registra', () => {
    const a = app();
    ricevi(a, 40);
    const id = a.eval('qcTutti()[0].id');
    assert.equal(a.eval(`qcRegistraEsito(${JSON.stringify(id)}, { esito: 'respinto', qtyKo: 0 })`), false);
  });

  it('un collaudo già chiuso non si riapre', () => {
    const a = app();
    ricevi(a, 40);
    const id = a.eval('qcTutti()[0].id');
    a.eval(`qcRegistraEsito(${JSON.stringify(id)}, { esito: 'accettato' })`);
    assert.equal(a.eval(`qcRegistraEsito(${JSON.stringify(id)}, { esito: 'respinto', qtyKo: 10 })`), false);
    assert.equal(num(a, 'getOrder("o1").lines[0].received'), 40, 'la merce non si è mossa una seconda volta');
  });
});

describe('Chi può registrare un esito', () => {
  ['admin', 'acquisti', 'officina'].forEach(ruolo => {
    it(`${ruolo}: sì`, () => {
      const a = app(base(), 'admin');
      ricevi(a, 40);
      const id = a.eval('qcTutti()[0].id');
      a.asRole(ruolo);
      assert.equal(a.eval(`qcRegistraEsito(${JSON.stringify(id)}, { esito: 'accettato' })`), true);
    });
  });
  ['progettazione', 'lettore'].forEach(ruolo => {
    it(`${ruolo}: no`, () => {
      const a = app(base(), 'admin');
      ricevi(a, 40);
      const id = a.eval('qcTutti()[0].id');
      a.asRole(ruolo);
      assert.equal(a.eval(`qcRegistraEsito(${JSON.stringify(id)}, { esito: 'accettato' })`), false);
      assert.equal(a.eval('qcTutti()[0].status'), 'aperto');
    });
  });
});

describe('L\'arrivo che sparisce', () => {
  it('eliminato l\'ordine, il collaudo si chiude e non trattiene più niente', () => {
    const a = app();
    ricevi(a, 40);
    a.eval('_confirmFn = null; delOrder("o1"); if (_confirmFn) confirmYes()');
    assert.equal(a.eval('qcTutti()[0].status'), 'chiuso');
    assert.equal(num(a, 'inQCOf("c1")'), 0);
  });
});

describe('La vista', () => {
  it('l\'elenco mostra i collaudi da fare e la scheda dice cosa succederà', () => {
    const a = app();
    ricevi(a, 40);
    a.eval('setView("collaudi")');
    const h = a.html('view-collaudi');
    assert.match(h, /COL-\d{4}-\d{3}/);
    assert.match(h, /Da collaudare/);
    const id = a.eval('qcTutti()[0].id');
    a.eval(`qcApri(${JSON.stringify(id)})`);
    const s = a.html('view-collaudi');
    assert.match(s, /diventano merce libera/);
    assert.match(s, /Commerciale c1/);
  });

  it('la voce di menu compare solo col modulo acceso', () => {
    const acceso = app();
    assert.ok(acceso.eval('JSON.stringify(navVoci(NAV.find(g => g.id === "quality")).map(v => v.id))').includes('collaudi'));
    const spento = app(base({ spento: true }));
    assert.ok(!spento.eval('JSON.stringify(navVoci(NAV.find(g => g.id === "quality")).map(v => v.id))').includes('collaudi'));
  });
});
