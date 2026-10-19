// Revisioni della distinta base.
//
// La proprietà che vale tutta la funzionalità è una: **una revisione rilasciata
// non cambia più**. Se cambia, lo storico non serve a niente — anzi è peggio del
// niente, perché racconta una cosa falsa con l'aria di essere autorevole.
// Il resto (numerazione, confronto, costo del giorno) è comodità.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm, comp, wc } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || base());
  a.asRole('admin');
  return a;
}
function base() {
  return makeDb({
    workCenters: [wc('w1', 40)],
    items: [
      asm('g1', 'gruppo', { components: [comp('m1', 2), comp('c1', 4)] }),
      mat('m1', 10),
      acq('c1', 5),
      mat('m2', 3),
    ],
  });
}
function rilascia(a, itemId, motivo) {
  return JSON.parse(a.eval(`JSON.stringify(releaseRevision(${JSON.stringify(itemId)}, ${JSON.stringify(motivo || '')}))`));
}

describe('Numerazione delle revisioni', () => {
  it('un articolo senza il campo vale A, senza migrare niente', () => {
    const a = app();
    assert.equal(a.eval('itemRev(getItem("g1"))'), 'A');
  });

  it('A → B → C', () => {
    const a = app();
    assert.equal(a.eval('nextRev("A")'), 'B');
    assert.equal(a.eval('nextRev("B")'), 'C');
  });

  it('dopo la Z si continua invece di fermarsi', () => {
    const a = app();
    assert.equal(a.eval('nextRev("Z")'), 'AA');
    assert.equal(a.eval('nextRev("AA")'), 'AB');
    assert.equal(a.eval('nextRev("AZ")'), 'BA');
    assert.equal(a.eval('nextRev("ZZ")'), 'AAA');
  });

  it('solo ciò che ha una distinta ha revisioni', () => {
    const a = app();
    assert.equal(a.eval('hasRevisions(getItem("g1"))'), true, 'assiemi');
    assert.equal(a.eval('hasRevisions(getItem("m1"))'), false, 'una materia prima ha un prezzo, non una distinta');
    assert.equal(a.eval('hasRevisions(getItem("c1"))'), false);
    assert.equal(a.eval('hasRevisions(null)'), false);
  });

  it('anche una parte: il suo ciclo definisce il costo quanto una distinta', () => {
    const a = app(makeDb({ items: [parte('p1', { cycle: [] })] }));
    assert.equal(a.eval('hasRevisions(getItem("p1"))'), true);
  });
});

describe('Rilascio', () => {
  it('congela la distinta e apre la successiva', () => {
    const a = app();
    const rec = rilascia(a, 'g1', 'Approvata per produzione');
    assert.equal(rec.rev, 'A');
    assert.equal(rec.motivo, 'Approvata per produzione');
    assert.equal(a.eval('itemRev(getItem("g1"))'), 'B', 'da qui in poi si lavora sulla B');
    assert.equal(a.snapshot().revisions.length, 1);
  });

  it('la fotografia contiene la distinta, non un riferimento ad essa', () => {
    const a = app();
    rilascia(a, 'g1');
    const s = a.snapshot().revisions[0].snapshot;
    assert.equal(s.components.length, 2);
    assert.equal(s.code, 'G1');
    assert.deepEqual(s.components.map(c => c.itemId), ['m1', 'c1']);
  });

  // Il test che giustifica l'intera funzionalità.
  it('modificare la distinta domani NON cambia la revisione di ieri', () => {
    const a = app();
    rilascia(a, 'g1', 'prima');
    a.eval('const it = getItem("g1"); it.components.push({ itemId: "m2", qty: 7, scrapPct: 0 }); it.components[0].qty = 99; touch(it); saveDB();');
    const s = a.snapshot().revisions[0].snapshot;
    assert.equal(s.components.length, 2, 'la revisione non deve vedere il componente aggiunto dopo');
    assert.equal(s.components[0].qty, 2, 'né la quantità cambiata dopo');
  });

  it('registra il costo del giorno del rilascio', () => {
    const a = app();
    rilascia(a, 'g1');
    const costo = a.snapshot().revisions[0].snapshot.cost;
    approx(costo.total, 2 * 10 + 4 * 5, 'costo alla data del rilascio');
    approx(costo.material, 20);
    approx(costo.purchased, 20);
  });

  it('cambiare un prezzo dopo non tocca il costo registrato', () => {
    const a = app();
    rilascia(a, 'g1');
    a.eval('const m = getItem("m1"); m.unitCost = 1000; touch(m); saveDB();');
    approx(a.snapshot().revisions[0].snapshot.cost.total, 40,
      'la revisione dice quanto costava allora: è il motivo per cui la si guarda');
  });

  it('rilasci successivi si accumulano in ordine', () => {
    const a = app();
    rilascia(a, 'g1', 'prima');
    a.eval('const it = getItem("g1"); it.components[0].qty = 5; touch(it); saveDB();');
    rilascia(a, 'g1', 'seconda');
    const revs = JSON.parse(a.eval('JSON.stringify(revisionsOf("g1").map(r => r.rev))'));
    assert.deepEqual(revs, ['B', 'A'], 'lo storico si legge dalla più recente');
    assert.equal(a.eval('itemRev(getItem("g1"))'), 'C');
  });

  it('le revisioni di un articolo non si mescolano con quelle di un altro', () => {
    const a = app(makeDb({ items: [asm('g1', 'gruppo', { components: [] }), asm('g2', 'gruppo', { components: [] })] }));
    rilascia(a, 'g1'); rilascia(a, 'g2'); rilascia(a, 'g1');
    assert.equal(a.eval('revisionsOf("g1").length'), 2);
    assert.equal(a.eval('revisionsOf("g2").length'), 1);
  });

  it('su un articolo senza distinta non si rilascia niente', () => {
    const a = app();
    assert.equal(rilascia(a, 'm1'), null);
    assert.equal((a.snapshot().revisions || []).length, 0);
  });

  it('su un articolo inesistente non lancia', () => {
    const a = app();
    assert.doesNotThrow(() => rilascia(a, 'non-esiste'));
  });

  it('il rilascio viene salvato, non resta in memoria', () => {
    const a = app();
    rilascia(a, 'g1', 'motivo');
    a.ref('Store').load();
    assert.equal(a.snapshot().revisions.length, 1);
    assert.equal(a.eval('itemRev(getItem("g1"))'), 'B');
  });

  it('porta l\'autore, come ogni altro record', () => {
    const a = app();
    a.eval('Store.setActor("u-anna")');
    rilascia(a, 'g1');
    assert.equal(a.snapshot().revisions[0].createdBy, 'u-anna',
      'fra un anno serve sapere chi ha rilasciato, non solo quando');
  });

  it('il ruolo lettore non rilascia', () => {
    const a = app();
    a.asRole('lettore');
    a.eval('currentBomId = "g1"; releaseRevisionConfirm("g1");');
    assert.equal((a.snapshot().revisions || []).length, 0);
  });
});

describe('Confronto fra revisioni', () => {
  function conRevisione(a) { rilascia(a, 'g1', 'base'); return a; }
  function diffConAttuale(a) {
    return JSON.parse(a.eval('JSON.stringify(revDiff(revisionsOf("g1")[0].snapshot, revSnapshot(getItem("g1"))))'));
  }

  it('senza modifiche non trova differenze', () => {
    const a = conRevisione(app());
    const d = diffConAttuale(a);
    assert.equal(d.aggiunte.length, 0);
    assert.equal(d.rimosse.length, 0);
    assert.equal(d.cambiate.length, 0);
    assert.equal(d.invariate, 2);
    assert.equal(a.eval(`revDiffVuoto(revDiff(revisionsOf("g1")[0].snapshot, revSnapshot(getItem("g1"))))`), true);
  });

  it('un componente aggiunto compare fra le aggiunte', () => {
    const a = conRevisione(app());
    a.eval('const it = getItem("g1"); it.components.push({ itemId: "m2", qty: 3, scrapPct: 0 }); touch(it); saveDB();');
    const d = diffConAttuale(a);
    assert.equal(d.aggiunte.length, 1);
    assert.match(d.aggiunte[0].etichetta, /M2/);
    assert.equal(d.aggiunte[0].qty, 3);
    assert.equal(d.rimosse.length, 0);
  });

  it('un componente tolto compare fra le rimosse', () => {
    const a = conRevisione(app());
    a.eval('const it = getItem("g1"); it.components.splice(1, 1); touch(it); saveDB();');
    const d = diffConAttuale(a);
    assert.equal(d.rimosse.length, 1);
    assert.match(d.rimosse[0].etichetta, /C1/);
  });

  it('una quantità cambiata porta con sé il valore di prima', () => {
    const a = conRevisione(app());
    a.eval('const it = getItem("g1"); it.components[0].qty = 9; touch(it); saveDB();');
    const d = diffConAttuale(a);
    assert.equal(d.cambiate.length, 1);
    assert.equal(d.cambiate[0].qtyPrima, 2);
    assert.equal(d.cambiate[0].qty, 9);
  });

  it('anche lo scarto è una modifica: cambia il fabbisogno', () => {
    const a = conRevisione(app());
    a.eval('const it = getItem("g1"); it.components[0].scrapPct = 10; touch(it); saveDB();');
    const d = diffConAttuale(a);
    assert.equal(d.cambiate.length, 1);
    assert.equal(d.cambiate[0].scrapPrima, 0);
    assert.equal(d.cambiate[0].scrapPct, 10);
  });

  it('lo stesso componente ripetuto si somma: è la domanda che si fa davvero', () => {
    const a = app(makeDb({ items: [
      asm('g1', 'gruppo', { components: [comp('m1', 2), comp('m1', 3)] }), mat('m1', 10),
    ] }));
    rilascia(a, 'g1');
    a.eval('const it = getItem("g1"); it.components = [{ itemId: "m1", qty: 5, scrapPct: 0 }]; touch(it); saveDB();');
    const d = diffConAttuale(a);
    assert.equal(d.cambiate.length, 0, '2+3 e 5 sono la stessa cosa: di quel materiale ne servono cinque');
    assert.equal(d.invariate, 1);
  });

  it('le lavorazioni entrano nel confronto', () => {
    const a = app(makeDb({
      workCenters: [wc('w1', 40)],
      items: [asm('g1', 'gruppo', { components: [], operations: [{ workCenterId: 'w1', hours: 2 }] })],
    }));
    rilascia(a, 'g1');
    a.eval('const it = getItem("g1"); it.operations[0].hours = 5; touch(it); saveDB();');
    const d = diffConAttuale(a);
    assert.equal(d.cambiate.length, 1);
    assert.equal(d.cambiate[0].qtyPrima, 2);
    assert.equal(d.cambiate[0].tipo, 'Lavorazione');
  });

  it('il ciclo di una parte si confronta come una distinta', () => {
    const a = app(makeDb({ items: [
      parte('p1', { cycle: [{ kind: 'item', itemId: 'm1', qty: 1 }] }), mat('m1', 10), mat('m2', 4),
    ] }));
    rilascia(a, 'p1');
    a.eval('const it = getItem("p1"); it.cycle.push({ kind: "item", itemId: "m2", qty: 2 }); touch(it); saveDB();');
    const d = JSON.parse(a.eval('JSON.stringify(revDiff(revisionsOf("p1")[0].snapshot, revSnapshot(getItem("p1"))))'));
    assert.equal(d.aggiunte.length, 1);
    assert.equal(d.aggiunte[0].tipo, 'Distinta parte');
  });

  // 0.105.5: costo, tempi e terzista di una fase, il costo forzato e
  // l'approvvigionamento cambiavano senza che il confronto lo dicesse.
  it('anche costo e tempi di una fase, il costo forzato e l\'approvvigionamento sono modifiche', () => {
    const a = app(makeDb({ workCenters: [wc('w1', 40)], suppliers: [{ id: 's1', name: 'Beta', active: true }], items: [
      parte('p1', { sourcing: 'make', cycle: [{ kind: 'item', itemId: 'm1', qty: 1 },
        { kind: 'op', workCenterId: 'w1', supplierId: null, costMode: 'fisso', cost: 3, hours: 1, days: 0, note: '' },
        { kind: 'op', workCenterId: 'w1', supplierId: null, costMode: 'fisso', cost: 2, hours: 1, days: 0, note: '' }] }), mat('m1', 10),
    ] }));
    rilascia(a, 'p1');
    a.eval(`const it = getItem("p1"); it.cycle[1].cost = 4; it.cycle[2].supplierId = 's1'; it.cycle[0].costOverride = 12;
      it.sourcing = 'buy'; touch(it); saveDB();`);
    const d = JSON.parse(a.eval('JSON.stringify(revDiff(revisionsOf("p1")[0].snapshot, revSnapshot(getItem("p1"))))'));
    const testo = d.cambiate.map(x => x.etichetta + ': ' + (x.altro || []).join(', ')).join(' | ');
    assert.equal(d.cambiate.length, 4, testo);
    assert.match(testo, /costo 3 → 4/);
    assert.match(testo, /terzista interna → Beta/);
    assert.match(testo, /costo forzato — → 12/);
    assert.match(testo, /Approvvigionamento: Produzione interna → Acquisto da fornitore/);
  });

  it('un componente tolto dalla distinta E dal catalogo resta leggibile', () => {
    const a = conRevisione(app());
    a.eval('const it = getItem("g1"); it.components.splice(1, 1); touch(it); saveDB(); Store.remove("items", "c1");');
    const d = diffConAttuale(a);
    assert.equal(d.rimosse.length, 1);
    assert.match(d.rimosse[0].etichetta, /eliminato/,
      'la revisione resta leggibile anche quando il catalogo è cambiato sotto');
  });

  it('un articolo sparito dal catalogo ma ancora in distinta non fa saltare il confronto', () => {
    const a = conRevisione(app());
    a.eval('Store.remove("items", "c1");');
    let d;
    assert.doesNotThrow(() => { d = diffConAttuale(a); });
    assert.equal(d.aggiunte.length + d.rimosse.length + d.cambiate.length, 0,
      'la distinta non è cambiata: è cambiato il catalogo sotto di essa');
  });
});

describe('Le revisioni nel giro verso il database condiviso', () => {
  it('sono una collezione come le altre e sopravvivono al giro completo', () => {
    const a = app();
    rilascia(a, 'g1', 'motivo');
    const prima = a.snapshot().revisions;
    const dopo = JSON.parse(a.eval('JSON.stringify(nestDB(flattenDB(db)).revisions)'));
    assert.deepEqual(dopo, prima, 'la fotografia deve tornare indietro identica, snapshot compreso');
  });

  it('la fotografia resta un blocco unico, non si esplode in tabelle', () => {
    const a = app();
    rilascia(a, 'g1');
    const t = JSON.parse(a.eval('JSON.stringify(flattenDB(db))'));
    assert.equal(t.item_revisions.length, 1);
    assert.ok(t.item_revisions[0].snapshot, 'normalizzarla vorrebbe dire darle la forma dei dati vivi, cioè invitare a modificarla');
  });

  it('un rilascio compare fra le modifiche da inviare', () => {
    const a = app();
    a.eval('Store.markSynced()');
    rilascia(a, 'g1');
    const p = JSON.parse(a.eval('JSON.stringify(Store.pendingChanges())'));
    assert.equal(p.revisions.upsert.length, 1);
    assert.deepEqual(p.items.upsert, ['g1'], 'anche l\'articolo cambia: la sua revisione in lavorazione è avanzata');
  });

  it('un backup con revisioni si reimporta', () => {
    const a = app();
    rilascia(a, 'g1', 'motivo');
    const json = a.ref('Store').exportSnapshot();
    const altra = loadApp({ silent: true });
    altra.ref('Store').importSnapshot(json);
    assert.equal(altra.snapshot().revisions.length, 1);
  });

  it('un backup vecchio senza revisioni si apre lo stesso', () => {
    const a = app();
    a.ref('Store').importSnapshot({ items: [{ id: 'x', code: 'X', name: 'X', type: 'materiale' }] });
    assert.deepEqual(a.snapshot().revisions, [], 'la collezione si ricostruisce vuota');
  });
});

// ─── Due revisioni a confronto ───
// Fino alla 0.84 lo storico confrontava ogni revisione solo con la distinta
// attuale, mentre il manuale prometteva due revisioni affiancate.
describe('Due revisioni a confronto, non solo con l\'attuale', () => {
  const pannello = (a, key) => Array.from(a.el('modal-root').children).find(p => p.dataset.panelKey === key).innerHTML;
  function treRevisioni() {
    const a = app();
    const rA = rilascia(a, 'g1', 'prima');
    a.eval('getItem("g1").components.push({ itemId: "m2", qty: 1, scrapPct: 0 }); Store.commit();');
    const rB = rilascia(a, 'g1', 'seconda');
    a.eval('getItem("g1").components[0].qty = 5; Store.commit();');
    return { a, rA, rB };
  }

  it('A con B: si vede l\'aggiunta fatta fra le due, non la modifica fatta dopo', () => {
    const { a, rA, rB } = treRevisioni();
    a.eval(`revCompareModal(${JSON.stringify(rA.id)}, ${JSON.stringify(rB.id)})`);
    const h = pannello(a, 'confronto');
    assert.match(h, /Rev\. A → Rev\. B/);
    assert.match(h, /Aggiunte \(1\)/);
    assert.match(h, /M2/);
    assert.doesNotMatch(h, /Cambiate/, 'la quantità di M1 è cambiata dopo la B');
  });

  it('l\'ordine della scelta non conta: si legge sempre dalla più vecchia', () => {
    const { a, rA, rB } = treRevisioni();
    a.eval(`revCompareModal(${JSON.stringify(rB.id)}, ${JSON.stringify(rA.id)})`);
    const h = pannello(a, 'confronto');
    assert.match(h, /Rev\. A → Rev\. B/);
    assert.match(h, /Aggiunte \(1\)/);
    assert.doesNotMatch(h, /Rimosse/);
  });

  it('senza l\'altra metà resta il confronto con l\'attuale, e il selettore propone le altre', () => {
    const { a, rA } = treRevisioni();
    a.eval(`revCompareModal(${JSON.stringify(rA.id)})`);
    const h = pannello(a, 'confronto');
    assert.match(h, /Rev\. A → attuale \(C\)/);
    assert.match(h, /Cambiate \(1\)/);
    assert.match(h, /<select id="rev-contro"/);
    assert.match(h, /la Rev\. B del/);
  });

  it('i costi delle due tessere sono quelli congelati di ciascuna', () => {
    const { a, rA, rB } = treRevisioni();
    a.eval(`revCompareModal(${JSON.stringify(rA.id)}, ${JSON.stringify(rB.id)})`);
    const h = pannello(a, 'confronto');
    approx(rA.snapshot.cost.total, 40);
    approx(rB.snapshot.cost.total, 43);
    assert.match(h, /Costo alla Rev\. A/);
    assert.match(h, /Costo alla Rev\. B/);
    assert.match(h, /\+€ 3,00|\+ ?€ ?3,00/);
  });
});

// ─── Confronto fra due distinte qualsiasi ───
describe('Confronto fra due distinte, su tutti i livelli', () => {
  function varianti() {
    return makeDb({
      workCenters: [wc('w1', 40)],
      items: [
        // A: due sottogruppi che usano entrambi C1 — il totale è la somma dei rami.
        asm('a', 'macchina', { components: [comp('s1', 1), comp('s2', 2)] }),
        asm('s1', 'sottogruppo', { components: [comp('c1', 3), comp('m1', 1)] }),
        asm('s2', 'sottogruppo', { components: [comp('c1', 1)] }),
        // B: stesso S1, niente S2, una parte fatta in casa in più.
        asm('b', 'macchina', { components: [comp('s1', 1), comp('p1', 2, 10)] }),
        parte('p1', { cycle: [{ itemId: 'm2', qty: 0.5 }] }),
        mat('m1', 10), acq('c1', 5), mat('m2', 3),
      ],
    });
  }
  const conf = (a, x, y) => JSON.parse(a.eval(`JSON.stringify(confrontaDistinte("${x}", "${y}").righe.map(r => ({ code: r.item.code, sez: r.sezione, qa: r.qa, qb: r.qb, delta: r.delta, stato: r.stato, valore: r.valore })))`));
  const riga = (rr, code) => rr.find(r => r.code === code);

  it('lo stesso componente in due rami è sommato: è la quantità che si compra', () => {
    const a = app(varianti());
    const c1 = riga(conf(a, 'a', 'b'), 'C1');
    assert.equal(c1.qa, 3 + 2 * 1);
    assert.equal(c1.qb, 3);
    assert.equal(c1.stato, 'cambiato');
    approx(c1.valore, -2 * 5, 'meno due commerciali da 5');
  });

  it('quello che c\'è solo da una parte è aggiunto o tolto, scarti compresi', () => {
    const a = app(varianti());
    const rr = conf(a, 'a', 'b');
    const p1 = riga(rr, 'P1');
    assert.equal(p1.sez, 'make');
    assert.equal(p1.stato, 'aggiunto');
    approx(p1.qb, 2.2, 'scarto del 10% come nel fabbisogno');
    assert.equal(p1.valore, null, 'una parte fabbricata vale i suoi materiali, già contati sotto');
    const m2 = riga(rr, 'M2');
    approx(m2.qb, 1.1);
    assert.equal(m2.stato, 'aggiunto');
    assert.equal(riga(rr, 'M1').stato, 'uguale');
  });

  it('una distinta con sé stessa non ha differenze', () => {
    const a = app(varianti());
    a.eval('getItem("b").components.push({ itemId: "a", qty: 1, scrapPct: 0 })');
    assert.ok(conf(a, 'a', 'a').every(r => r.stato === 'uguale'));
  });

  it('la scheda mostra i costi, solo le differenze di serie, e si esporta', () => {
    const a = app(varianti());
    a.eval('bomCompareModal("a", "b")');
    const h = Array.from(a.el('modal-root').children).find(p => p.dataset.panelKey === 'confronto-db').innerHTML;
    assert.match(h, /Costo A/);
    assert.match(h, /Da acquistare/);
    assert.match(h, /Da fabbricare/);
    assert.doesNotMatch(h, />M1</, 'uguale, quindi nascosto');
    const spec = JSON.parse(a.eval('JSON.stringify(bomCompareExportSpec())'));
    assert.equal(spec.sezioni.length, 2);
    assert.deepEqual(spec.sezioni[0].righe.map(r => r[0]).sort(), ['C1', 'M2']);
    assert.equal(spec.sezioni[0].colonne.at(-1).h, 'Δ valore');
  });

  it('il pulsante sta nella barra delle distinte, non in quella dei cicli', () => {
    const a = app(varianti());
    a.eval('renderRevBar("modal-root", "a")');
    assert.match(a.html('modal-root'), /bomCompareModal\('a'\)/);
    a.eval('renderRevBar("modal-root", "p1")');
    assert.doesNotMatch(a.html('modal-root'), /bomCompareModal/);
  });
});
