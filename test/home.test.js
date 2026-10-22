// Il riepilogo: «Richiede attenzione».
//
// Un avviso che dice solo quanti sono costringe ad aprire la vista e rifare a
// mano il filtro per sapere quali: cioè a rifare il lavoro che l'avviso ha già
// fatto. Questi test tengono ferme tre cose:
//   1. ogni avviso nomina **chi** l'ha fatto scattare — codici, numeri;
//   2. ogni voce porta dove si risolve, e quelle che non hanno un posto dove
//      andare non fingono di averlo;
//   3. il conteggio resta quello vero anche quando le voci scritte sono meno.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq, mat } = require('./fixtures.js');

function app(over) {
  const a = loadApp({ silent: true });
  a.setDb(makeDb(Object.assign({ jobs: [], plans: [], rfqs: [], orders: [] }, over || {})));
  a.asRole('admin');
  return a;
}
// I segnali per tipo, letti dal modello invece che dall'HTML: il disegno è una
// conseguenza, il patto sta qui.
function segnali(a) {
  return JSON.parse(a.eval('JSON.stringify(homeSegnali())'));
}
function perVista(a, vista) {
  return segnali(a).find(s => s.vista === vista);
}

describe('Ogni avviso dice chi lo ha fatto scattare', () => {
  it('la commessa in ritardo è nominata, con cliente e data nel suggerimento', () => {
    const a = app({ jobs: [
      { id: 'j1', number: 'COM-2025-001', customer: 'Alfa', title: 'Linea 1', status: 'aperta', dueDate: '2020-01-01', active: true },
      { id: 'j2', number: 'COM-2025-002', customer: 'Beta', status: 'aperta', dueDate: '2019-06-01', active: true },
    ] });
    const s = perVista(a, 'jobs');
    assert.equal(s.n, 2);
    // La più vecchia per prima: è quella che brucia di più.
    assert.deepEqual(s.voci.map(v => v.testo), ['COM-2025-002', 'COM-2025-001']);
    assert.match(s.voci[1].titolo, /Alfa/);
    assert.match(s.voci[1].titolo, /01\/01\/2020/);
    assert.equal(s.voci[0].azione, "homeApri('job','j2')");
  });

  it('la richiesta in attesa porta la sua richiesta, con il fornitore', () => {
    const a = app({
      suppliers: [{ id: 's1', name: 'Rossi', active: true }],
      rfqs: [{ id: 'r1', number: 'RFQ-2025-001', status: 'inviata', date: '2025-01-02', supplierId: 's1', lines: [], active: true }],
    });
    const s = perVista(a, 'rfq');
    assert.deepEqual(s.voci.map(v => v.testo), ['RFQ-2025-001']);
    assert.match(s.voci[0].titolo, /Rossi/);
    assert.equal(s.voci[0].azione, "homeApri('rfq','r1')");
  });

  it('l\'ordine confermato in ritardo dice di quanti giorni, e i peggiori vengono prima', () => {
    const a = app({
      suppliers: [{ id: 's1', name: 'Rossi', active: true }],
      orders: [
        { id: 'o1', number: 'ODA-1', status: 'confermato', supplierId: 's1', active: true,
          lines: [{ id: 'l1', qty: 1, deliveryDate: '2025-01-10', confirmedDate: '2025-01-13' }] },
        { id: 'o2', number: 'ODA-2', status: 'confermato', supplierId: 's1', active: true,
          lines: [{ id: 'l1', qty: 1, deliveryDate: '2025-01-10', confirmedDate: '2025-02-10' }] },
      ],
    });
    const s = perVista(a, 'orders');
    assert.deepEqual(s.voci.map(v => v.testo), ['ODA-2', 'ODA-1']);
    assert.match(s.voci[1].titolo, /1 giorno lavorativo di ritardo/, 'da venerdì 10 a lunedì 13 c\'è un giorno di lavoro');
  });

  it('l\'articolo sotto scorta dice quanto c\'è e quanto ne servirebbe', () => {
    const a = app({ items: [Object.assign(mat('m1', 3), { safetyStock: 10 })] });
    const s = perVista(a, 'stock');
    assert.deepEqual(s.voci.map(v => v.testo), ['M1']);
    assert.match(s.voci[0].titolo, /esistente 0 kg/);
    assert.match(s.voci[0].titolo, /scorta minima 10/);
    assert.equal(s.voci[0].azione, "itemInfoModal('m1')");
  });

  it('l\'articolo senza prezzo è nominato per codice', () => {
    const a = app({ items: [acq('c1', 0), acq('c2', 5)] });
    const s = perVista(a, 'buy');
    assert.deepEqual(s.voci.map(v => v.testo), ['C1'], 'chi un prezzo ce l\'ha non deve comparire');
  });

  it('la riga di fabbisogno nomina il codice e porta al piano che la genera', () => {
    const a = app({
      items: [acq('c1', 5)],
      plans: [{ id: 'pl1', number: 'PRD-2025-001', title: 'Lotto', date: '2025-01-01',
        lines: [{ id: 'l1', itemId: 'c1', qty: 5, dueDate: '2020-02-01' }], active: true }],
    });
    const s = perVista(a, 'mrp');
    assert.equal(s.n, 1);
    assert.deepEqual(s.voci.map(v => v.testo), ['C1'], 'il codice dice cosa manca');
    assert.match(s.voci[0].titolo, /piano PRD-2025-001/, 'il piano dice per cosa manca');
    assert.match(s.voci[0].titolo, /5 pz/, 'e quanto ne va ordinato');
    assert.equal(s.voci[0].azione, "homeApri('plan','pl1')",
      'si agisce nel piano: è lì che si genera la richiesta o l\'ordine');
  });

  it('la commessa già avviata a cui manca materiale si segnala, e dice quanti', () => {
    const a = app({
      items: [acq('c1', 5)],
      jobs: [{ id: 'j1', number: 'COM-2025-001', customer: 'Alfa', status: 'produzione', dueDate: '2025-12-31', active: true }],
      plans: [{ id: 'pl1', number: 'PRD-1', jobId: 'j1', dueDate: '2025-11-01',
        lines: [{ id: 'l1', itemId: 'c1', qty: 10 }], active: true }],
    });
    // Due segnali portano a 'jobs': si prende quello del materiale.
    const s = segnali(a).find(x => /materiale da ordinare/.test(x.testo));
    assert.ok(s, 'una commessa in produzione senza materiale deve comparire');
    assert.equal(s.gravita, 'alta', 'il lavoro è partito e la data al cliente è già data');
    assert.deepEqual(s.voci.map(v => v.testo), ['COM-2025-001']);
    assert.match(s.voci[0].titolo, /C1/, 'il titolo dice anche cosa manca');
    assert.equal(s.voci[0].azione, "homeApri('job','j1')");
  });

  it('la stessa commessa non ancora avviata non si segnala', () => {
    const a = app({
      items: [acq('c1', 5)],
      jobs: [{ id: 'j1', number: 'COM-2025-001', status: 'aperta', dueDate: '2025-12-31', active: true }],
      plans: [{ id: 'pl1', number: 'PRD-1', jobId: 'j1', dueDate: '2025-11-01',
        lines: [{ id: 'l1', itemId: 'c1', qty: 10 }], active: true }],
    });
    assert.equal(segnali(a).some(x => /materiale da ordinare/.test(x.testo)), false,
      'finché non parte, il materiale mancante è lavoro normale: lo dice già il fabbisogno');
  });

  it('il codice duplicato si nomina ma non si apre: si sbroglia in Gestione', () => {
    const a = app({ items: [
      Object.assign(acq('a1', 5), { code: 'DUP' }),
      Object.assign(acq('a2', 5), { code: 'DUP' }),
    ] });
    const s = perVista(a, 'manage');
    assert.deepEqual(s.voci.map(v => v.testo), ['DUP']);
    assert.equal(s.voci[0].azione, '', 'aprire uno dei due non direbbe quale dei due è sbagliato');
    assert.match(s.voci[0].titolo, /2 articoli con questo codice/);
  });
});

describe('Il disegno', () => {
  it('le voci compaiono a schermo, con il loro bersaglio', () => {
    const a = app({ jobs: [{ id: 'j1', number: 'COM-2025-001', customer: 'Alfa', status: 'aperta', dueDate: '2020-01-01', active: true }] });
    a.eval('renderHome()');
    const h = a.html('view-home');
    assert.match(h, /home-chip/);
    assert.match(h, /COM-2025-001/, 'il numero della commessa deve leggersi nel riepilogo');
    assert.match(h, /homeApri\('job','j1'\)/);
  });

  it('oltre otto voci si scrive quante ne restano, ma il conto resta quello vero', () => {
    const items = [];
    for (let i = 1; i <= 12; i++) items.push(acq('c' + i, 0));
    const a = app({ items });
    const s = perVista(a, 'buy');
    assert.equal(s.n, 12, 'il numero in testa è il totale, non quanti se ne scrivono');
    a.eval('renderHome()');
    const h = a.html('view-home');
    assert.equal((h.match(/home-chip/g) || []).length, 8, 'oltre otto l\'elenco smetterebbe di essere un dettaglio');
    assert.match(h, /\+4 altri in Articoli d(&#39;|')acquisto/);
  });

  it('senza niente in sospeso non si disegnano voci', () => {
    const a = app({ items: [acq('c1', 5)] });
    assert.deepEqual(segnali(a), []);
    a.eval('renderHome()');
    assert.doesNotMatch(a.html('view-home'), /home-chip/);
  });
});

describe('Riepilogo: ritardi, articoli obsoleti e ordine per gravità (dalla 0.105.6)', () => {
  it('un ordine parziale non resta in ritardo per una riga già arrivata', () => {
    const a = app({
      suppliers: [{ id: 's1', name: 'SKF', active: true }],
      orders: [{ id: 'o1', number: 'ODA-2026-001', status: 'parziale', supplierId: 's1', active: true, lines: [
        // Confermata 19 giorni dopo la richiesta, ma ricevuta per intero.
        { id: 'l1', itemId: null, code: 'A', qty: 10, received: 10, deliveryDate: '2026-03-01', confirmedDate: '2026-03-20' },
        // Ancora da ricevere, confermata in tempo.
        { id: 'l2', itemId: null, code: 'B', qty: 5, received: 0, deliveryDate: '2026-04-01', confirmedDate: '2026-04-01' }] }],
    });
    assert.equal(perVista(a, 'orders'), undefined);
  });
  it('la riga ancora aperta in ritardo continua a segnalare, con il suo ritardo', () => {
    const a = app({
      suppliers: [{ id: 's1', name: 'SKF', active: true }],
      orders: [{ id: 'o1', number: 'ODA-2026-001', status: 'parziale', supplierId: 's1', active: true, lines: [
        { id: 'l1', itemId: null, code: 'A', qty: 10, received: 10, deliveryDate: '2026-03-01', confirmedDate: '2026-03-20' },
        { id: 'l2', itemId: null, code: 'B', qty: 5, received: 2, deliveryDate: '2026-04-01', confirmedDate: '2026-04-04' }] }],
    });
    const s = perVista(a, 'orders');
    assert.equal(s.n, 1);
    assert.match(s.voci[0].titolo, /3 giorni lavorativi di ritardo/);
  });
  it('un articolo obsoleto non chiede attenzione per la scorta minima né per il prezzo', () => {
    const a = app({ items: [
      Object.assign(acq('vivo', 0), { safetyStock: 5 }),
      Object.assign(acq('vecchio', 0), { safetyStock: 5, obsolete: true }),
    ] });
    assert.deepEqual(perVista(a, 'stock').voci.map(v => v.testo), ['VIVO']);
    assert.deepEqual(perVista(a, 'buy').voci.map(v => v.testo), ['VIVO']);
  });
  it('gli avvisi sono ordinati per gravità: prima gli alti, poi i medi, poi le informazioni', () => {
    const a = app({
      suppliers: [{ id: 's1', name: 'SKF', active: true }],
      rfqs: [{ id: 'r1', number: 'RDO-2026-001', status: 'inviata', supplierId: 's1', date: '2026-01-01', lines: [] }],
      items: [Object.assign(acq('c', 0), { safetyStock: 5 })],
      jobs: [{ id: 'j1', number: 'COM-2025-001', customer: 'Alfa', status: 'aperta', dueDate: '2020-01-01', active: true }],
    });
    const g = segnali(a).map(s => s.gravita);
    const ORD = { alta: 0, media: 1, info: 2 };
    assert.deepEqual(g, g.slice().sort((x, y) => ORD[x] - ORD[y]));
    assert.equal(g[0], 'alta');
    assert.equal(g[g.length - 1], 'info');
  });
});
