// Avanzamento di produzione: quanti pezzi di una parte sono stati fatti.
//
// È l'unica funzione nuova che **cambia numeri già a schermo** — le quantità
// delle lavorazioni da mandare fuori — quindi i due controlli che contano più
// di tutti sono agli estremi:
//
//   - senza nessuna dichiarazione, tutto si comporta **esattamente** come prima
//     (un piano vecchio non deve cambiare da sé);
//   - con le parti dichiarate finite, le loro lavorazioni non vengono
//     riproposte (che è l'intero motivo per cui la funzione esiste).

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, parte, wc } = require('./fixtures.js');

// Una parte con due fasi esterne dallo stesso terzista, dentro un piano da 10.
function base() {
  return makeDb({
    suppliers: [{ id: 's1', name: 'Terzista Verdi', active: true }],
    workCenters: [wc('w1', 50), wc('w2', 40)],
    items: [
      mat('M1', 10),
      parte('P1', { cycle: [
        { id: 'c0', kind: 'item', itemId: 'M1', qty: 2 },
        { id: 'c1', kind: 'op', workCenterId: 'w1', supplierId: 's1', costMode: 'fisso', cost: 5, days: 3 },
        { id: 'c2', kind: 'op', workCenterId: 'w2', supplierId: 's1', costMode: 'fisso', cost: 7, days: 2 },
      ] }),
    ],
    plans: [{ id: 'pl1', number: 'FAB-2026-001', date: '2026-08-01', active: true,
      lines: [{ id: 'l1', itemId: 'P1', qty: 10, dueDate: '2026-12-01' }] }],
  });
}
function app(dbObj) {
  const a = loadApp({ silent: true });
  a.setDb(dbObj || base());
  a.asRole('admin');
  return a;
}
const dichiara = (a, qty, note) =>
  a.eval(`produzioneDichiara('pl1', 'P1', ${qty}, ${JSON.stringify(note || '')})`);
// Le quantità delle fasi da mandare fuori, dopo il netto.
const qtaFasi = a => JSON.parse(a.eval('JSON.stringify(mrpPhaseRows(getPlan("pl1")).map(r => r.qty))'));

describe('Il conto dei pezzi fatti', () => {
  it('senza dichiarazioni non ne risulta fatto nessuno', () => {
    const a = app();
    assert.equal(a.eval('prodottiDi("pl1", "P1")'), 0);
    assert.equal(a.eval('daFare("pl1", "P1", 10)'), 10);
  });

  it('le dichiarazioni si sommano, non si sovrascrivono', () => {
    const a = app();
    dichiara(a, 4); dichiara(a, 3);
    assert.equal(a.eval('prodottiDi("pl1", "P1")'), 7, 'due lotti fanno sette pezzi, non tre');
    assert.equal(a.eval('daFare("pl1", "P1", 10)'), 3);
  });

  // Come una rettifica di magazzino: correggere non vuol dire riscrivere il
  // passato, e lo storico deve restare leggibile.
  it('una dichiarazione negativa corregge un conteggio sbagliato', () => {
    const a = app();
    dichiara(a, 10); dichiara(a, -2, 'due erano da scartare');
    assert.equal(a.eval('prodottiDi("pl1", "P1")'), 8);
    assert.equal(a.snapshot().productions.length, 2, 'restano due righe: la correzione si vede');
  });

  it('dichiararne più del previsto non produce un residuo negativo', () => {
    const a = app();
    dichiara(a, 14);
    assert.equal(a.eval('daFare("pl1", "P1", 10)'), 0, 'zero, non −4: non si produce all\'indietro');
    assert.equal(a.eval('prodottiDi("pl1", "P1")'), 14, 'ma il sovrappiù resta visibile');
  });

  it('ogni piano conta per sé: la stessa parte in due piani è due lavori', () => {
    const db = base();
    db.plans.push({ id: 'pl2', number: 'FAB-2026-002', date: '2026-09-01', active: true,
      lines: [{ id: 'l2', itemId: 'P1', qty: 5 }] });
    const a = app(db);
    dichiara(a, 10);
    assert.equal(a.eval('prodottiDi("pl2", "P1")'), 0,
      'quello che si è fatto per un piano non copre l\'altro');
  });

  it('una dichiarazione a zero non si registra', () => {
    const a = app();
    assert.equal(dichiara(a, 0), null);
    assert.equal(a.snapshot().productions.length, 0);
  });

  it('chi non può scrivere i documenti non dichiara', () => {
    const a = app();
    a.asRole('progettazione');
    assert.equal(dichiara(a, 5), null);
    assert.equal(a.snapshot().productions.length, 0);
  });

  // L'officina esiste per dichiarare l'avanzamento: il mutatore la accettava già,
  // ma il comando e il modulo erano nascosti (dalla 0.105.6 li vede).
  it("l'officina vede il comando e il modulo per dichiarare le parti", () => {
    const a = app();
    a.asRole('officina');
    const make = "mrpExplode(getPlan('pl1').lines).make";
    assert.ok(a.eval(`mrpMakeTable(${make}, 'pl1').includes('produzioneModal(')`), 'il pulsante Avanzamento c\'è');
    a.eval(`window.__prodPlanId = 'pl1'; window.__prodItemId = 'P1'; window.__prodRichiesti = 10;`);
    assert.ok(a.eval('produzioneBody().includes("produzioneSalva()")'), 'e il modulo pure');
    assert.ok(dichiara(a, 3));
    assert.ok(a.eval('produzioneBody().includes("produzioneElimina(")'), 'e può togliere quello che ha dichiarato');
    a.asRole('lettore');
    assert.ok(!a.eval(`mrpMakeTable(${make}, 'pl1').includes('produzioneModal(')`));
    assert.ok(!a.eval('produzioneBody().includes("produzioneSalva()")'));
  });
});

// ═══════════════════════════════════════════════════════════
//  L'effetto sulle lavorazioni da mandare fuori
// ═══════════════════════════════════════════════════════════
// È il motivo per cui la funzione esiste: `views-mrp.js` dichiarava
// «il fabbisogno netto non si applica [alle lavorazioni]… richiederebbe un
// avanzamento di produzione che l'app non ha».
describe('Il netto sulle lavorazioni', () => {
  it('senza dichiarazioni le fasi valgono la quantità intera', () => {
    const a = app();
    assert.deepEqual(qtaFasi(a), [10, 10],
      'un piano di prima si comporta esattamente come prima: è la garanzia che conta');
  });

  it('i pezzi finiti non si rimandano a lavorare fuori', () => {
    const a = app();
    dichiara(a, 4);
    assert.deepEqual(qtaFasi(a), [6, 6], 'restano sei pezzi da far lavorare, non dieci');
  });

  it('una parte finita sparisce dalle lavorazioni da commissionare', () => {
    const a = app();
    dichiara(a, 10);
    assert.deepEqual(qtaFasi(a), [],
      'nessuna riga: commissionarle sarebbe pagare due volte lo stesso lavoro');
  });

  it('il prezzo e le ore seguono la quantità netta', () => {
    const a = app();
    const prima = JSON.parse(a.eval('JSON.stringify(mrpPhaseRows(getPlan("pl1")).map(r => r.amount))'));
    assert.deepEqual(prima, [50, 70], '10 pezzi × 5 e × 7');
    dichiara(a, 6);
    const dopo = JSON.parse(a.eval('JSON.stringify(mrpPhaseRows(getPlan("pl1")).map(r => r.amount))'));
    assert.deepEqual(dopo, [20, 28], '4 pezzi rimasti × 5 e × 7');
  });

  // Il netto deve valere **anche sulla strada del documento**, non solo nella
  // tabella che si guarda. Le due partono dalla stessa esplosione ma passavano
  // da due strade diverse, e applicarlo a una sola — che è l'errore fatto la
  // prima volta — mostrava «6 pezzi da far lavorare» e scriveva 10 sull'ordine
  // di lavoro che parte al terzista. È il difetto peggiore possibile qui: non si
  // vede finché il terzista non rimanda la fattura.
  it('la quantità sul documento è la stessa che la scheda mostra', () => {
    const a = app();
    dichiara(a, 4);
    const schermo = JSON.parse(a.eval('JSON.stringify(mrpPhaseRows(getPlan("pl1")).map(r => r.qty))'));
    const documento = JSON.parse(a.eval(
      'JSON.stringify(Array.from(planRowIndex(getPlan("pl1")).values()).filter(r => r.isPhase).map(r => r.qty))'));
    // Le quantità, non la forma: sul documento le fasi consecutive dello stesso
    // terzista si fondono in **una tratta** — il pezzo gli arriva, gli resta sul
    // banco e riparte una volta sola — quindi due righe a schermo possono essere
    // una riga sola lì. A dover coincidere è il numero di pezzi.
    assert.deepEqual(schermo, [6, 6], 'a schermo restano sei pezzi per fase');
    assert.ok(documento.length > 0, 'la tratta deve esserci');
    assert.deepEqual(Array.from(new Set(documento)), [6],
      'ciò che si spunta e ciò che viene scritto devono essere lo stesso numero');
  });

  it("una parte finita non arriva nemmeno all'indice del documento", () => {
    const a = app();
    dichiara(a, 10);
    const documento = JSON.parse(a.eval(
      'JSON.stringify(Array.from(planRowIndex(getPlan("pl1")).values()).filter(r => r.isPhase).map(r => r.qty))'));
    assert.deepEqual(documento, [], 'non deve restare spuntabile per sbaglio');
  });

  // Il limite dichiarato, provato: si dichiara la parte finita, non la fase
  // superata. Va fissato in un test perché è una scelta, non una svista.
  it('il conto è prudente: una parte a metà ciclo conta ancora per intero', () => {
    const a = app();
    dichiara(a, 0.0001);   // praticamente nulla di finito
    const q = qtaFasi(a);
    assert.ok(q[0] > 9.99 && q[1] > 9.99,
      'finché la parte non è dichiarata finita, tutte le sue fasi restano da fare');
  });
});

// ═══════════════════════════════════════════════════════════
//  Quello che l'avanzamento NON deve toccare
// ═══════════════════════════════════════════════════════════
// Fino alla 0.105.4 la dichiarazione non muoveva il magazzino, ma il montaggio
// (0.100.0) scarica le parti: la giacenza andava sotto zero a ogni assieme.
describe('L\'avanzamento carica la parte a magazzino (0.105.5)', () => {
  it('i pezzi dichiarati fatti entrano come versamento della dichiarazione', () => {
    const a = app();
    dichiara(a, 10);
    const mov = a.snapshot().movements || [];
    assert.equal(mov.length, 1);
    assert.equal(mov[0].kind, 'versamento');
    assert.equal(mov[0].qty, 10);
    assert.equal(mov[0].orderId, a.snapshot().productions[0].id);
    assert.equal(a.eval('onHandOf("P1")'), 10);
  });

  it('una correzione negativa li toglie, ed eliminare la dichiarazione toglie il suo carico', () => {
    const a = app();
    dichiara(a, 10); dichiara(a, -2);
    assert.equal(a.eval('onHandOf("P1")'), 8);
    const id = a.snapshot().productions[0].id;
    a.eval(`produzioneElimina('${id}'); confirmYes();`);
    assert.equal(a.eval('(invalidateCaches(), onHandOf("P1"))'), -2);
  });

  it('i pezzi caricati restano del piano: non riducono il suo da fabbricare una seconda volta', () => {
    const a = app();
    dichiara(a, 4);
    const r = JSON.parse(a.eval('(invalidateCaches(), JSON.stringify(mrpMakeRows(getPlan("pl1")).map(r => [r.qty, r.qtyOrder])))'));
    assert.deepEqual(r, [[10, 6]]);
  });

  it('non tocca le righe d\'acquisto del piano', () => {
    const a = app();
    const prima = a.eval('JSON.stringify(mrpBuyRows(getPlan("pl1")).map(r => r.qtyOrder))');
    dichiara(a, 6);
    assert.equal(a.eval('JSON.stringify(mrpBuyRows(getPlan("pl1")).map(r => r.qtyOrder))'), prima,
      'il materiale per una parte si compra prima di farla: averla fatta non lo annulla');
  });
});

describe('Il riepilogo del piano', () => {
  it('dice quante parti sono finite e a che punto è il lavoro', () => {
    const a = app();
    dichiara(a, 5);
    const av = JSON.parse(a.eval('JSON.stringify(pianoAvanzamento("pl1", mrpExplode(getPlan("pl1").lines).make))'));
    assert.equal(av.parti, 1);
    assert.equal(av.finite, 0);
    assert.equal(av.quota, 0.5, 'metà dei pezzi');
  });

  it('una parte finita conta come finita', () => {
    const a = app();
    dichiara(a, 10);
    const av = JSON.parse(a.eval('JSON.stringify(pianoAvanzamento("pl1", mrpExplode(getPlan("pl1").lines).make))'));
    assert.equal(av.finite, 1);
    assert.equal(av.quota, 1);
  });

  it('il sovrappiù non fa passare il lavoro oltre il cento per cento', () => {
    const a = app();
    dichiara(a, 25);
    const av = JSON.parse(a.eval('JSON.stringify(pianoAvanzamento("pl1", mrpExplode(getPlan("pl1").lines).make))'));
    assert.equal(av.quota, 1, 'una barra di avanzamento al 250% non dice niente a nessuno');
  });
});

describe('La collezione', () => {
  it('è dichiarata nello schema e nei riferimenti', () => {
    const a = app();
    assert.equal(a.eval('Store.schema().productions.table'), 'productions');
    assert.equal(a.eval('REFS.productions.fields.itemId'), 'item');
  });

  it('le dichiarazioni finiscono nel backup', () => {
    const a = app();
    dichiara(a, 3, 'primo lotto');
    const snap = JSON.parse(a.eval('Store.exportSnapshot()'));
    assert.equal(snap.productions.length, 1);
    assert.equal(snap.productions[0].note, 'primo lotto');
  });

  it('portano l\'autore e la data, come ogni record', () => {
    const a = app();
    // Nell'app l'attore lo imposta doLogin(); qui si fa a mano, perché asRole()
    // monta l'utente ma non la sessione.
    a.eval('Store.setActor("u-test")');
    dichiara(a, 3);
    const rec = a.snapshot().productions[0];
    assert.ok(rec.date, 'senza data non si sa quando');
    assert.ok(rec.createdBy, 'senza autore non si sa chi');
  });
});
