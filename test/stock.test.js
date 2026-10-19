// Giacenze e fabbisogno netto.
//
// La domanda a cui questi test rispondono non è «il conto torna» ma «da dove
// viene il numero». L'esistente è calcolato, non scritto: se qualcuno un giorno
// aggiunge un campo `onHand` scrivibile, questi test devono diventare rossi.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm, comp } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || base());
  a.asRole('admin');
  return a;
}
function base() {
  return makeDb({
    suppliers: [{ id: 's1', name: 'SKF', active: true }],
    items: [
      asm('mac', 'macchina', { components: [comp('g1', 1)] }),
      asm('g1', 'gruppo', { components: [comp('m1', 4), comp('c1', 2)] }),
      Object.assign(mat('m1', 10), { uom: 'kg' }),
      Object.assign(acq('c1', 5), { supplierId: 's1' }),
    ],
  });
}
// Un ordine con una riga sull'articolo indicato.
function ordine(a, o) {
  const rec = Object.assign({ id: 'o-' + Math.random().toString(36).slice(2, 8), number: 'ODA-1',
    status: 'inviato', supplierId: 's1', active: true, date: '2026-08-01' }, o);
  a.eval(`db.orders.push(${JSON.stringify(rec)}); saveDB();`);
  return rec;
}
function riga(itemId, qty, received) { return { id: 'l-' + itemId + '-' + qty, itemId, code: '', qty, price: 1, received: received || 0 }; }

describe('netRequirement — il conto, senza dati intorno', () => {
  // Gli argomenti si serializzano: passarli grezzi manderebbe nel contesto vm
  // identificatori invece di valori.
  const n = (a) => (...args) =>
    a.eval(`netRequirement(${args.map(v => (typeof v === 'number' && !isFinite(v)) ? 'NaN' : JSON.stringify(v === undefined ? null : v)).join(', ')})`);

  it('senza niente a magazzino il netto è il lordo', () => {
    assert.equal(n(app())(40, 0, 0, 0, 0), 40);
  });
  it('l\'esistente si sottrae', () => {
    assert.equal(n(app())(40, 25, 0, 0, 0), 15);
  });
  it('l\'ordinato in arrivo si sottrae anche lui', () => {
    assert.equal(n(app())(40, 25, 10, 0, 0), 5, 'ricomprare ciò che è già in viaggio è il difetto da togliere');
  });
  it('la scorta minima si somma: è quello che si vuole lasciare a magazzino', () => {
    assert.equal(n(app())(40, 25, 0, 10, 0), 25);
  });
  it('quando basta, il netto è zero e non diventa negativo', () => {
    assert.equal(n(app())(40, 100, 0, 0, 0), 0);
    assert.equal(n(app())(0, 100, 0, 0, 0), 0);
  });
  it('il lotto arrotonda per eccesso: mezzo lotto non lo vende nessuno', () => {
    assert.equal(n(app())(40, 25, 0, 0, 10), 20, '15 mancanti → 2 lotti da 10');
    assert.equal(n(app())(40, 30, 0, 0, 10), 10);
  });
  it('un mancante esattamente pari a un multiplo non fa scattare un lotto in più', () => {
    assert.equal(n(app())(40, 20, 0, 0, 10), 20, 'i float non devono produrre 30 per un 20 arrivato da 19.9999999');
  });
  it('lotto zero o assente: nessun arrotondamento', () => {
    approx(n(app())(40, 25.5, 0, 0, 0), 14.5);
  });
  it('valori sporchi non producono NaN', () => {
    assert.equal(n(app())('x', null, undefined, NaN, 'y'), 0);
  });
  it('l\'impegnato si somma al fabbisogno: è merce che c\'è ma non è mia', () => {
    assert.equal(n(app())(40, 100, 0, 0, 0, 80), 20,
      'ce ne sono 100 ma 80 sono promessi: liberi ne restano 20, quindi ne mancano 20');
  });
  it('un impegno che non arriva a togliere tutto lascia il netto a zero', () => {
    assert.equal(n(app())(40, 100, 0, 0, 0, 30), 0);
  });
  it('l\'impegnato arrotonda al lotto come tutto il resto', () => {
    assert.equal(n(app())(40, 100, 0, 0, 10, 85), 30, '25 mancanti → 3 lotti da 10');
  });
  it('senza impegnato il conto è identico a prima', () => {
    assert.equal(n(app())(40, 25, 0, 0, 0, undefined), 15, 'il parametro nuovo non deve cambiare i vecchi risultati');
    assert.equal(n(app())(40, 25, 0, 0, 0, 'sporco'), 15);
  });
  it('senza indicare la modalità, il lotto arrotonda a multiplo come sempre', () => {
    assert.equal(n(app())(40, 25, 0, 0, 10, undefined, undefined), 20, 'il default non deve cambiare i dati esistenti');
    assert.equal(n(app())(40, 25, 0, 0, 10, undefined, 'sporco'), 20);
  });
  it('lotto minimo: sotto soglia si compra la soglia', () => {
    assert.equal(n(app())(3, 0, 0, 0, 10, undefined, 'min'), 10, '3 mancanti, minimo 10 → si compra 10');
  });
  it('lotto minimo: sopra soglia si compra esattamente quanto manca, senza arrotondare a passi', () => {
    assert.equal(n(app())(40, 27, 0, 0, 10, undefined, 'min'), 13, '13 mancanti, oltre il minimo di 10 → si compra 13, non 20');
  });
  it('lotto minimo: un mancante esattamente pari alla soglia non arrotonda oltre', () => {
    assert.equal(n(app())(40, 30, 0, 0, 10, undefined, 'min'), 10);
  });
});

describe('L\'esistente è calcolato, non scritto', () => {
  it('un database senza movimenti né ordini ha giacenza zero', () => {
    const a = app();
    assert.equal(a.eval('onHandOf("m1")'), 0);
    assert.equal(a.eval('incomingOf("m1")'), 0);
  });

  it('il ricevuto su un ordine carica il magazzino', () => {
    const a = app();
    ordine(a, { status: 'parziale', lines: [riga('m1', 100, 60)] });
    assert.equal(a.eval('onHandOf("m1")'), 60);
    assert.equal(a.eval('incomingOf("m1")'), 40, 'il resto è ancora in arrivo');
  });

  it('correggere il ricevimento corregge la giacenza, senza doverlo fare due volte', () => {
    const a = app();
    const o = ordine(a, { status: 'parziale', lines: [riga('m1', 100, 60)] });
    a.eval(`const o = getOrder(${JSON.stringify(o.id)}); o.lines[0].received = 80; saveDB();`);
    assert.equal(a.eval('onHandOf("m1")'), 80);
    assert.equal(a.eval('incomingOf("m1")'), 20);
  });

  it('una bozza non è in arrivo: non è ancora uscita di qui', () => {
    const a = app();
    ordine(a, { status: 'bozza', lines: [riga('m1', 50, 0)] });
    assert.equal(a.eval('incomingOf("m1")'), 0,
      'contarla farebbe rimandare acquisti che nessuno ha ordinato');
  });

  it('un ordine annullato non porta niente', () => {
    const a = app();
    ordine(a, { status: 'annullato', lines: [riga('m1', 50, 0)] });
    assert.equal(a.eval('incomingOf("m1")'), 0);
  });

  it('un ordine evaso non è più in arrivo, ma il ricevuto resta a magazzino', () => {
    const a = app();
    ordine(a, { status: 'evaso', lines: [riga('m1', 50, 50)] });
    assert.equal(a.eval('incomingOf("m1")'), 0);
    assert.equal(a.eval('onHandOf("m1")'), 50);
  });

  it('le righe manuali senza articolo non muovono nessuna giacenza', () => {
    const a = app();
    ordine(a, { status: 'inviato', lines: [{ id: 'x', itemId: null, code: 'LIBERA', qty: 10, received: 5 }] });
    assert.equal(a.eval('onHandOf("m1")'), 0);
  });

  it('più ordini si sommano', () => {
    const a = app();
    ordine(a, { status: 'evaso', lines: [riga('m1', 30, 30)] });
    ordine(a, { status: 'parziale', lines: [riga('m1', 20, 5)] });
    assert.equal(a.eval('onHandOf("m1")'), 35);
    assert.equal(a.eval('incomingOf("m1")'), 15);
  });
});

describe('Movimenti', () => {
  it('un carico somma, un consumo sottrae', () => {
    const a = app();
    a.eval('addMovement("m1", "carico", 100, "inventario iniziale")');
    a.eval('addMovement("m1", "scarico", -30, "commessa 240")');
    assert.equal(a.eval('onHandOf("m1")'), 70);
  });

  it('movimenti e ricevimenti si sommano fra loro', () => {
    const a = app();
    ordine(a, { status: 'evaso', lines: [riga('m1', 40, 40)] });
    a.eval('addMovement("m1", "scarico", -15, "produzione")');
    assert.equal(a.eval('onHandOf("m1")'), 25);
  });

  it('un movimento da zero non si registra', () => {
    const a = app();
    assert.equal(a.eval('addMovement("m1", "carico", 0, "")'), null);
    assert.equal((a.snapshot().movements || []).length, 0);
  });

  it('non si movimenta ciò che non si tiene a magazzino', () => {
    const a = app();
    assert.equal(a.eval('addMovement("mac", "carico", 5, "")'), null,
      'un assieme si produce: la sua giacenza sarebbe quella dei componenti contata due volte');
    assert.equal(a.eval('addMovement("non-esiste", "carico", 5, "")'), null);
  });

  it('la rettifica registra la differenza, non il valore contato', () => {
    const a = app();
    ordine(a, { status: 'evaso', lines: [riga('m1', 40, 40)] });
    a.eval('window.__x = null');
    a.el('mv-kind').value = 'rettifica';
    a.el('mv-qty').value = '35';
    a.el('mv-note').value = 'inventario';
    a.eval('saveStockAdjust("m1")');
    const mv = a.snapshot().movements;
    assert.equal(mv.length, 1);
    assert.equal(mv[0].qty, -5, 'lo storico deve dire cosa è cambiato, non cosa c\'era');
    assert.equal(a.eval('onHandOf("m1")'), 35);
  });

  it('una rettifica che non cambia niente non lascia un movimento vuoto', () => {
    const a = app();
    ordine(a, { status: 'evaso', lines: [riga('m1', 40, 40)] });
    a.el('mv-kind').value = 'rettifica';
    a.el('mv-qty').value = '40';
    a.eval('saveStockAdjust("m1")');
    assert.equal((a.snapshot().movements || []).length, 0);
  });

  it('eliminare un movimento riporta indietro la giacenza', () => {
    const a = app();
    const m = JSON.parse(a.eval('JSON.stringify(addMovement("m1", "carico", 100, ""))'));
    assert.equal(a.eval('onHandOf("m1")'), 100);
    a.eval(`Store.remove("movements", ${JSON.stringify(m.id)})`);
    assert.equal(a.eval('onHandOf("m1")'), 0);
  });

  it('il ruolo lettore non movimenta', () => {
    const a = app();
    a.asRole('lettore');
    a.el('mv-kind').value = 'carico';
    a.el('mv-qty').value = '50';
    a.eval('saveStockAdjust("m1")');
    assert.equal((a.snapshot().movements || []).length, 0);
  });
});

describe('L\'indice delle giacenze si aggiorna', () => {
  it('un movimento salvato cambia subito il risultato', () => {
    const a = app();
    assert.equal(a.eval('onHandOf("m1")'), 0);      // costruisce l'indice
    a.eval('addMovement("m1", "carico", 42, "")');
    assert.equal(a.eval('onHandOf("m1")'), 42, 'senza invalidazione l\'indice resterebbe a zero');
  });

  it('anche una modifica diretta a un ordine, dopo il salvataggio', () => {
    const a = app();
    const o = ordine(a, { status: 'parziale', lines: [riga('m1', 100, 10)] });
    assert.equal(a.eval('onHandOf("m1")'), 10);
    a.eval(`const o = getOrder(${JSON.stringify(o.id)}); o.lines[0].received = 90; saveDB();`);
    assert.equal(a.eval('onHandOf("m1")'), 90);
  });
});

describe('Fabbisogno netto nella lista d\'acquisto', () => {
  function conPiano(a) {
    a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-1', active: true, lines: [{ id: 'l1', itemId: 'mac', qty: 10 }] });`);
    return a;
  }
  function righe(a, net) {
    return JSON.parse(a.eval(`JSON.stringify(mrpBuyRows(getPlan("pl1"), ${net ? 'true' : 'false'}).map(r => ({ code: r.item.code, qty: r.qty, net: r.net, qtyOrder: r.qtyOrder, onHand: r.onHand, incoming: r.incoming, coperto: r.coperto, amount: r.amount })))`));
  }

  it('senza magazzino, netto e lordo coincidono', () => {
    const a = conPiano(app());
    const r = righe(a, true).find(x => x.code === 'M1');
    assert.equal(r.qty, 40);        // 10 macchine × 1 gruppo × 4
    assert.equal(r.net, 40);
  });

  it('l\'esistente riduce quanto si compra, ma non il lordo', () => {
    const a = conPiano(app());
    a.eval('addMovement("m1", "carico", 25, "")');
    const r = righe(a, true).find(x => x.code === 'M1');
    assert.equal(r.qty, 40, 'il lordo non cambia mai: è una proprietà del prodotto');
    assert.equal(r.onHand, 25);
    assert.equal(r.qtyOrder, 15);
  });

  it('col netto spento si compra il lordo, come prima', () => {
    const a = conPiano(app());
    a.eval('addMovement("m1", "carico", 25, "")');
    const r = righe(a, false).find(x => x.code === 'M1');
    assert.equal(r.qtyOrder, 40);
    assert.equal(r.net, 15, 'il netto resta calcolato: serve a mostrarlo, non ad applicarlo');
  });

  it('una riga coperta si segnala e vale zero', () => {
    const a = conPiano(app());
    a.eval('addMovement("m1", "carico", 500, "")');
    const r = righe(a, true).find(x => x.code === 'M1');
    assert.equal(r.qtyOrder, 0);
    assert.equal(r.coperto, true);
    assert.equal(r.amount, 0, 'una riga coperta non deve pesare sul totale d\'acquisto');
  });

  it('la scorta minima fa comprare più del mancante', () => {
    const a = conPiano(app());
    a.eval('addMovement("m1", "carico", 40, ""); const it = getItem("m1"); it.safetyStock = 12; touch(it); saveDB();');
    const r = righe(a, true).find(x => x.code === 'M1');
    assert.equal(r.qtyOrder, 12, 'il piano è coperto, ma la scorta va ricostituita');
  });

  it('il lotto di riordino arrotonda la riga', () => {
    const a = conPiano(app());
    a.eval('addMovement("m1", "carico", 25, ""); const it = getItem("m1"); it.lotSize = 10; touch(it); saveDB();');
    const r = righe(a, true).find(x => x.code === 'M1');
    assert.equal(r.qtyOrder, 20, '15 mancanti, si comprano 2 lotti da 10');
  });

  it('l\'importo segue la quantità che si compra davvero', () => {
    const a = conPiano(app());
    a.eval('addMovement("m1", "carico", 25, "")');
    const r = righe(a, true).find(x => x.code === 'M1');
    approx(r.amount, 15 * 10, 'altrimenti il totale del piano direbbe una spesa che nessuno farà');
  });

  it('il minimo del fornitore si confronta con la quantità netta', () => {
    const a = conPiano(app());
    a.eval(`const it = getItem("c1"); it.priceList = [{ id: 'p1', supplierId: 's1', price: 5, minQty: 15 }]; it.activePriceId = 'p1'; touch(it); saveDB();`);
    a.eval('addMovement("c1", "carico", 12, "")');
    const r = JSON.parse(a.eval('JSON.stringify(mrpBuyRows(getPlan("pl1"), true).map(x => ({ code: x.item.code, qtyOrder: x.qtyOrder, underMin: x.underMin })))'))
      .find(x => x.code === 'C1');
    assert.equal(r.qtyOrder, 8);        // 20 lordi − 12
    assert.equal(r.underMin, true, 'sotto il minimo si è per quello che si ordina, non per quello che serve');
  });
});

// Il difetto che questo blocco tiene chiuso: due piani aperti sugli stessi
// articoli si dichiaravano **coperti entrambi** dalla stessa merce. Nessuno dei
// due sbagliava un conto — semplicemente nessuno dei due sapeva dell'altro, e
// l'errore si scopriva quando il secondo andava in produzione.
describe('Impegnato: la giacenza vista da un piano è quella che resta libera', () => {
  function piano(a, id, qtaMacchine, extra) {
    a.eval(`Store.insert('plans', ${JSON.stringify(Object.assign({
      id, number: 'FAB-' + id, title: '', active: true,
      lines: [{ id: 'l-' + id, itemId: 'mac', qty: qtaMacchine }],
    }, extra || {}))});`);
    return a;
  }
  // 1 macchina = 4 × M1 e 2 × C1.
  function rigaAcq(a, planId, code) {
    return JSON.parse(a.eval(`JSON.stringify(mrpBuyRows(getPlan(${JSON.stringify(planId)}), true)
      .map(r => ({ code: r.item.code, qty: r.qty, onHand: r.onHand, committed: r.committed, libero: r.libero,
                   qtyOrder: r.qtyOrder, coperto: r.coperto, impegni: r.impegni }))
      .find(x => x.code === ${JSON.stringify(code)}))`));
  }

  it('un piano solo non impegna niente contro sé stesso', () => {
    const a = piano(app(), 'pl1', 10);
    a.eval('addMovement("m1", "carico", 25, "")');
    const r = rigaAcq(a, 'pl1', 'M1');
    assert.equal(r.committed, 0, 'sottrargli il proprio fabbisogno gli farebbe comprare tutto due volte');
    assert.equal(r.qtyOrder, 15);
  });

  it('due piani non si dichiarano coperti entrambi con la stessa merce', () => {
    const a = piano(piano(app(), 'pl1', 10), 'pl2', 10);
    a.eval('addMovement("m1", "carico", 100, "")');   // 100 in casa, 40 + 40 richiesti
    const r2 = rigaAcq(a, 'pl2', 'M1');
    assert.equal(r2.onHand, 100);
    assert.equal(r2.committed, 40, 'quaranta sono già promessi al piano che viene prima');
    assert.equal(r2.libero, 60);
    assert.equal(r2.qtyOrder, 0, 'sessanta liberi bastano per quaranta: questo piano è coperto davvero');
  });

  it('il piano che viene prima non conta l\'impegno di quelli dopo', () => {
    const a = piano(piano(app(), 'pl1', 10), 'pl2', 10);
    a.eval('addMovement("m1", "carico", 50, "")');
    const r1 = rigaAcq(a, 'pl1', 'M1');
    assert.equal(r1.committed, 0, 'senza date la fila la decide il numero: FAB-pl1 prima di FAB-pl2');
    assert.equal(r1.qtyOrder, 0, 'i 50 bastano ai suoi 40');
    assert.equal(rigaAcq(a, 'pl2', 'M1').qtyOrder, 30, 'al secondo restano 10: compra solo i suoi 30');
  });

  it('a magazzino vuoto ogni piano compra la sua parte, non anche quella degli altri', () => {
    const a = piano(piano(app(), 'pl1', 10), 'pl2', 5);   // 40 e 20 di M1, niente in casa
    assert.equal(rigaAcq(a, 'pl1', 'M1').qtyOrder, 40);
    assert.equal(rigaAcq(a, 'pl2', 'M1').qtyOrder, 20,
      'fino alla 0.105.2 ciascuno ne comprava 60, e generare gli ordini da entrambi ne ordinava 120');
  });

  it('quando la merce non basta a quelli davanti, la loro parte scoperta non la compra chi viene dopo', () => {
    const a = piano(piano(app(), 'pl1', 10), 'pl2', 10);
    a.eval('addMovement("m1", "carico", 10, "")');    // 10 in casa, 40 + 40 richiesti
    const q1 = rigaAcq(a, 'pl1', 'M1').qtyOrder, q2 = rigaAcq(a, 'pl2', 'M1').qtyOrder;
    assert.equal(q1, 30);
    assert.equal(q2, 40);
    assert.equal(q1 + q2, 70, 'mancano 80 − 10: i due piani insieme comprano esattamente quelli');
  });

  it('la fila la decide la consegna: il piano che consegna prima prende prima', () => {
    const a = piano(piano(app(), 'pl1', 10, { dueDate: '2026-12-01' }), 'pl2', 10, { dueDate: '2026-11-01' });
    a.eval('addMovement("m1", "carico", 50, "")');
    const r2 = rigaAcq(a, 'pl2', 'M1'), r1 = rigaAcq(a, 'pl1', 'M1');
    assert.equal(r2.committed, 0, 'pl2 consegna a novembre: è il primo della fila');
    assert.equal(r2.qtyOrder, 0);
    assert.equal(r1.committed, 40);
    assert.equal(r1.qtyOrder, 30);
  });

  it('il buco della scorta minima lo compra un piano solo', () => {
    const a = piano(piano(app(), 'pl1', 10), 'pl2', 10);
    a.eval('db.items.find(i => i.id === "m1").safetyStock = 20; saveDB();');
    const q1 = rigaAcq(a, 'pl1', 'M1').qtyOrder, q2 = rigaAcq(a, 'pl2', 'M1').qtyOrder;
    assert.equal(q1, 60, 'il primo della fila: i suoi 40 e i 20 della scorta');
    assert.equal(q2, 40, 'il secondo solo i suoi: ricaricargli la scorta la comprerebbe due volte');
  });

  it('un piano chiuso guarda dopo tutti gli aperti', () => {
    const a = piano(piano(app(), 'pl1', 10, { active: false }), 'pl2', 10);
    assert.equal(rigaAcq(a, 'pl1', 'M1').committed, 40, 'non è in fila: tutto quello che promettono gli aperti gli è davanti');
  });

  it('quando la merce non basta per due, il secondo piano compra invece di credersi coperto', () => {
    const a = piano(piano(app(), 'pl1', 10), 'pl2', 10);
    a.eval('addMovement("m1", "carico", 50, "")');    // 50 in casa, 40 + 40 richiesti
    const r = rigaAcq(a, 'pl2', 'M1');
    assert.equal(r.committed, 40);
    assert.equal(r.libero, 10);
    assert.equal(r.coperto, false, 'prima della correzione qui si leggeva "coperto" e la merce era di un altro');
    assert.equal(r.qtyOrder, 30, '40 servono, 10 liberi: se ne comprano 30');
  });

  it('il lordo non cambia mai, nemmeno con l\'impegnato', () => {
    const a = piano(piano(app(), 'pl1', 10), 'pl2', 10);
    a.eval('addMovement("m1", "carico", 50, "")');
    assert.equal(rigaAcq(a, 'pl2', 'M1').qty, 40, 'il lordo è una proprietà del prodotto, non dello stato del magazzino');
  });

  it('chiudere un piano libera il materiale che impegnava', () => {
    const a = piano(piano(app(), 'pl1', 10), 'pl2', 10);
    a.eval('addMovement("m1", "carico", 50, "")');
    assert.equal(rigaAcq(a, 'pl2', 'M1').qtyOrder, 30);
    a.eval('planToggleActive("pl1")');
    const r = rigaAcq(a, 'pl2', 'M1');
    assert.equal(r.committed, 0);
    assert.equal(r.qtyOrder, 0, 'i 50 sono di nuovo tutti disponibili');
    assert.equal(a.eval('getPlan("pl1").active'), false);
  });

  it('riaprire un piano rimette l\'impegno', () => {
    const a = piano(piano(app(), 'pl1', 10, { active: false }), 'pl2', 10);
    assert.equal(rigaAcq(a, 'pl2', 'M1').committed, 0);
    a.eval('planToggleActive("pl1")');
    assert.equal(rigaAcq(a, 'pl2', 'M1').committed, 40);
  });

  it('un piano nato prima dell\'impegno si apre aperto, non chiuso', () => {
    const a = loadApp({ silent: true });
    a.seedStorage(Object.assign(base(), {
      plans: [{ id: 'vecchio', number: 'FAB-0', lines: [{ id: 'l', itemId: 'mac', qty: 1 }] }],
    }));
    a.ref('Store').load();
    assert.equal(a.snapshot().plans[0].active, true,
      'dichiararlo chiuso lascerebbe promettere due volte la merce dei piani in corso');
  });

  it('l\'impegno dice chi se l\'è preso, non solo quanto', () => {
    const a = piano(piano(app(), 'pl1', 10, { title: 'Lotto settembre' }), 'pl2', 10);
    const r = rigaAcq(a, 'pl2', 'M1');
    assert.equal(r.impegni.length, 1);
    assert.equal(r.impegni[0].number, 'FAB-pl1');
    assert.equal(r.impegni[0].title, 'Lotto settembre');
    assert.equal(r.impegni[0].qty, 40, 'un numero che toglie merce senza dire chi se l\'è presa non si può contestare');
  });

  it('più piani si sommano fra loro, quelli davanti', () => {
    const a = piano(piano(piano(app(), 'pl1', 1), 'pl2', 2), 'pl3', 3);
    assert.equal(rigaAcq(a, 'pl1', 'M1').committed, 0, 'il primo della fila non ha nessuno davanti');
    assert.equal(rigaAcq(a, 'pl2', 'M1').committed, 4, '1 macchina × 4');
    assert.equal(rigaAcq(a, 'pl3', 'M1').committed, 12, '(1 + 2) macchine × 4');
  });

  it('l\'impegno è calcolato: cambiare l\'altro piano cambia subito il numero', () => {
    const a = piano(piano(app(), 'pl1', 10), 'pl2', 10);
    assert.equal(rigaAcq(a, 'pl2', 'M1').committed, 40);   // costruisce l'indice
    a.eval('planSetLineQty("pl1", "l-pl1", 5)');
    assert.equal(rigaAcq(a, 'pl2', 'M1').committed, 20,
      'senza invalidazione l\'indice resterebbe fermo, e sarebbe un campo scrivibile travestito da calcolo');
  });

  it('un piano vuoto non impegna niente', () => {
    const a = piano(piano(app(), 'pl1', 10), 'pl2', 10);
    a.eval('db.plans.find(p => p.id === "pl1").lines = []; saveDB();');
    assert.equal(rigaAcq(a, 'pl2', 'M1').committed, 0);
  });

  it('il libero può andare sotto zero, e lo si vede', () => {
    const a = piano(piano(app(), 'pl1', 10), 'pl2', 10);
    a.eval('addMovement("m1", "carico", 10, "")');
    assert.equal(rigaAcq(a, 'pl2', 'M1').libero, -30,
      'i piani aperti hanno promesso più merce di quanta ne esista: nasconderlo non la fa comparire');
    assert.equal(a.eval('freeStockOf("m1", null)'), -70, 'senza escludere nessun piano: 10 − 80');
  });

  it('anche l\'in arrivo entra nel libero', () => {
    const a = piano(piano(app(), 'pl1', 10), 'pl2', 10);
    ordine(a, { status: 'inviato', lines: [riga('m1', 60, 0)] });
    const r = rigaAcq(a, 'pl2', 'M1');
    assert.equal(r.libero, 20, '0 esistenti + 60 in arrivo − 40 impegnati');
    assert.equal(r.qtyOrder, 20);
  });

  it('col netto spento si compra il lordo, l\'impegnato resta solo un\'informazione', () => {
    const a = piano(piano(app(), 'pl1', 10), 'pl2', 10);
    a.eval('addMovement("m1", "carico", 100, "")');
    const r = JSON.parse(a.eval(`JSON.stringify(mrpBuyRows(getPlan("pl2"), false).map(x => ({ code: x.item.code, committed: x.committed, qtyOrder: x.qtyOrder })).find(x => x.code === "M1"))`));
    assert.equal(r.qtyOrder, 40);
    assert.equal(r.committed, 40, 'il numero si calcola comunque: serve a mostrarlo, non ad applicarlo');
  });

  it('i documenti generati portano la quantità che tiene conto dell\'impegno', () => {
    const a = piano(piano(app(), 'pl1', 10), 'pl2', 10);
    a.eval('addMovement("m1", "carico", 50, ""); mrpNet = true;');
    const linea = JSON.parse(a.eval(`JSON.stringify(planDocLine(mrpBuyRows(getPlan("pl2"), true).find(r => r.item.code === "M1"), 10))`));
    assert.equal(linea.qty, 30, 'ordinare 0 perché "c\'è già" quando la merce è di un altro piano è il difetto da chiudere');
  });

  it('il ruolo lettore non apre né chiude i piani', () => {
    const a = piano(app(), 'pl1', 10);
    a.asRole('lettore');
    a.eval('planToggleActive("pl1")');
    assert.equal(a.eval('getPlan("pl1").active'), true);
  });
});

describe('Documenti generati dal fabbisogno netto', () => {
  function conPiano(a) {
    a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-1', active: true, lines: [{ id: 'l1', itemId: 'mac', qty: 10 }] });`);
    return a;
  }

  it('l\'ordine porta la quantità netta, non quella lorda', () => {
    const a = conPiano(app());
    a.eval('addMovement("m1", "carico", 25, ""); mrpNet = true;');
    const righe = JSON.parse(a.eval('JSON.stringify(mrpBuyRows(getPlan("pl1"), true).filter(r => r.item.code === "M1"))'));
    const linea = JSON.parse(a.eval(`JSON.stringify(planDocLine(mrpBuyRows(getPlan("pl1"), true).find(r => r.item.code === "M1"), 10))`));
    assert.equal(righe[0].qtyOrder, 15);
    assert.equal(linea.qty, 15, 'mandare al fornitore un numero diverso da quello mostrato sarebbe il modo più rapido di perdere fiducia');
  });

  it('col netto spento torna la quantità lorda', () => {
    const a = conPiano(app());
    a.eval('addMovement("m1", "carico", 25, ""); mrpNet = false;');
    const linea = JSON.parse(a.eval(`JSON.stringify(planDocLine(mrpBuyRows(getPlan("pl1"), false).find(r => r.item.code === "M1"), 10))`));
    assert.equal(linea.qty, 40);
  });
});

// La vista Magazzino non calcola niente di suo: mette in tabella stockIndex e
// commitIndex. Quello che questi test proteggono è il **taglio** — chi entra
// nell'elenco e chi no, e che il filtro «sotto scorta» dica la stessa cosa del
// dall’icona di avviso sulla riga. Un filtro che seleziona righe diverse da quelle segnalate è
// peggio di nessun filtro: fa credere di aver guardato.
describe('Vista Magazzino', () => {
  function conParte() {
    const d = base();
    d.items.push(parte('p1'), Object.assign(mat('m2', 3), { safetyStock: 50 }));
    return d;
  }
  // Disegna con i filtri indicati e restituisce l'HTML della tabella.
  function disegna(a, filtri) {
    ['search', 'type', 'family', 'subfamily', 'state'].forEach(k => {
      a.el('stk-' + k).value = (filtri || {})[k] || '';
    });
    a.eval('stockLimit = STOCK_PAGE; renderStock()');
    return a.html('stk-table');
  }
  // I codici presenti in tabella, letti dalle celle monospaziate del codice.
  const codici = html => (html.match(/>([A-Z]\d)</g) || []).map(s => s.slice(1, -1)).sort();

  it('elenca solo ciò che si tiene a magazzino', () => {
    const a = app(conParte());
    const c = codici(disegna(a));
    assert.deepEqual(c, ['C1', 'M1', 'M2', 'P1']);
    assert.ok(!c.includes('MAC') && !c.includes('G1'),
      'un assieme si produce: la sua giacenza sarebbe quella dei componenti contata due volte');
  });

  it('commerciali, materie prime e parti stanno nella stessa lista', () => {
    const a = app(conParte());
    const html = disegna(a);
    assert.ok(html.includes('tt-acquistato') && html.includes('tt-materiale') && html.includes('tt-parte'),
      'il magazzino non conosce la divisione fra acquisti e progetto');
  });

  it('il filtro per tipo restringe ai soli articoli di quel tipo', () => {
    const a = app(conParte());
    assert.deepEqual(codici(disegna(a, { type: 'parte' })), ['P1']);
  });

  it('la ricerca guarda codice e nome', () => {
    const a = app(conParte());
    assert.deepEqual(codici(disegna(a, { search: 'm2' })), ['M2']);
    assert.deepEqual(codici(disegna(a, { search: 'commerciale' })), ['C1']);
  });

  it('«sotto la scorta minima» isola le stesse righe che portano l\x27avviso', () => {
    const a = app(conParte());
    const tutto = disegna(a);
    assert.equal((tutto.match(/#ic-warning/g) || []).length, 1, 'solo M2 ha una scorta minima non raggiunta');
    assert.deepEqual(codici(disegna(a, { state: 'sotto' })), ['M2']);
  });

  it('una scorta ricostituita esce dal filtro', () => {
    const a = app(conParte());
    a.eval('addMovement("m2", "carico", 50, "")');
    assert.deepEqual(codici(disegna(a, { state: 'sotto' })), [],
      'la scorta minima è raggiunta: non c\'è più niente da segnalare');
    assert.ok(disegna(a, {}).indexOf('#ic-warning') === -1);
  });

  it('«giacenza a zero» e «con giacenza» dividono l\'elenco in due', () => {
    const a = app(conParte());
    a.eval('addMovement("m1", "carico", 7, "")');
    assert.deepEqual(codici(disegna(a, { state: 'con' })), ['M1']);
    assert.deepEqual(codici(disegna(a, { state: 'zero' })), ['C1', 'M2', 'P1']);
  });

  it('«libero negativo» trova ciò che i piani aperti hanno promesso due volte', () => {
    const a = app(conParte());
    a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-1', active: true, lines: [{ id: 'l1', itemId: 'mac', qty: 10 }] });`);
    a.eval('addMovement("m1", "carico", 10, "")');   // 10 in casa, 40 promessi
    const c = codici(disegna(a, { state: 'negativo' }));
    assert.ok(c.includes('M1'), 'esistente 10, impegnato 40: liberi −30');
    assert.ok(!c.includes('M2'), 'chi non è impegnato da nessuno non è negativo');
  });

  it('la riga porta esistente, in arrivo, impegnato e libero', () => {
    const a = app(conParte());
    a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-1', active: true, lines: [{ id: 'l1', itemId: 'mac', qty: 10 }] });`);
    a.eval('addMovement("m1", "carico", 100, "")');
    ordine(a, { status: 'inviato', lines: [riga('m1', 60, 0)] });
    const r = JSON.parse(a.eval('JSON.stringify(stockState(getItem("m1")))'));
    assert.equal(r.onHand, 100);
    assert.equal(r.incoming, 60);
    assert.equal(r.committed, 40);
    assert.equal(r.libero, 120, '100 + 60 − 40');
    const html = disegna(a);
    ['100', '60', '40', '120'].forEach(n =>
      assert.ok(html.includes('>' + n + '<'), `la riga deve mostrare ${n}`));
  });

  it('i conteggi in testa parlano di tutto il magazzino, non del filtro attivo', () => {
    const a = app(conParte());
    disegna(a, { type: 'parte' });
    const kpi = a.html('stk-kpi');
    assert.ok(kpi.includes('>4<'), 'gli articoli a magazzino restano quattro anche filtrando le sole parti');
    assert.ok(kpi.includes('>1<'), 'e uno solo è sotto la scorta minima');
  });

  it('il conteggio dei sotto scorta è lo stesso del Riepilogo', () => {
    const a = app(conParte());
    disegna(a);
    const segnale = JSON.parse(a.eval('JSON.stringify(homeSegnali().find(s => s.testo.includes("scorta minima")))'));
    assert.equal(segnale.n, 1);
    assert.equal(segnale.vista, 'stock', 'il segnale deve portare dove quel numero si vede e si corregge');
    assert.ok(a.html('stk-kpi').includes('>1<'), 'due conteggi diversi della stessa cosa sarebbero due verità');
  });

  it('senza articoli a magazzino lo dice, invece di mostrare una tabella vuota', () => {
    const a = app(makeDb({ items: [asm('mac', 'macchina', {})] }));
    assert.ok(disegna(a).includes('Nessun articolo a magazzino'));
  });

  it('con dei filtri che non trovano niente il messaggio è un altro', () => {
    const a = app(conParte());
    assert.ok(disegna(a, { search: 'zzz' }).includes('Nessun articolo con questi filtri'));
  });

  it('una rettifica fatta dal Magazzino aggiorna la vista senza cambiare pagina', () => {
    const a = app(conParte());
    a.eval('activeView = "stock"');
    disegna(a);
    a.el('mv-kind').value = 'carico';
    a.el('mv-qty').value = '12';
    a.eval('saveStockAdjust("m1")');
    assert.equal(a.eval('onHandOf("m1")'), 12);
    assert.ok(a.html('stk-table').includes('>12<'), 'renderCatalogs deve conoscere anche il Magazzino');
    assert.equal(a.eval('activeView'), 'stock');
  });

  it('la vista è sotto l\'area del catalogo: chi non la scrive non la movimenta', () => {
    const a = app(conParte());
    assert.equal(a.eval('VIEW_AREA.stock'), 'catalog');
    a.asRole('lettore');
    a.el('mv-kind').value = 'carico';
    a.el('mv-qty').value = '50';
    a.eval('saveStockAdjust("m1")');
    assert.equal((a.snapshot().movements || []).length, 0);
  });
});

describe('Quando arriva, non solo che arriva', () => {
  // L'in arrivo da solo non basta a nessuno che debba promettere una data: dire
  // «c'è, arriva» a chi consegna il 30 giugno, quando il fornitore ha confermato
  // per settembre, è la stessa cosa che non dirgli niente.
  it('la merce attesa porta con sé la data confermata dal fornitore', () => {
    const a = app();
    ordine(a, { lines: [Object.assign(riga('c1', 10), { deliveryDate: '2026-08-20', confirmedDate: '2026-09-15' })] });
    const arr = JSON.parse(a.eval('JSON.stringify(incomingEntro("c1", "2026-08-31"))'));
    assert.equal(arr.inTempo, 0);
    assert.equal(arr.tardivi.length, 1);
    assert.equal(arr.tardivi[0].eta, '2026-09-15', 'vale la confermata, non quella che avevamo chiesto');
    assert.equal(arr.tardivi[0].qty, 10);
  });

  it('senza conferma vale la data che abbiamo chiesto', () => {
    const a = app();
    ordine(a, { lines: [Object.assign(riga('c1', 10), { deliveryDate: '2026-08-20' })] });
    assert.equal(a.eval('incomingEntro("c1", "2026-08-31").inTempo'), 10);
  });

  it('un arrivo senza data non è un ritardo: è un\'incognita, e si conta in tempo', () => {
    const a = app();
    ordine(a, { lines: [riga('c1', 10)] });
    const arr = JSON.parse(a.eval('JSON.stringify(incomingEntro("c1", "2026-08-31"))'));
    assert.equal(arr.inTempo, 10, 'contarlo tardivo farebbe rumore su ogni base dati senza date');
    assert.deepEqual(arr.tardivi, []);
  });

  it('due ordini sullo stesso articolo si dividono fra in tempo e tardivi', () => {
    const a = app();
    ordine(a, { number: 'ODA-1', lines: [Object.assign(riga('c1', 4), { deliveryDate: '2026-08-01' })] });
    ordine(a, { number: 'ODA-2', lines: [Object.assign(riga('c1', 6), { deliveryDate: '2026-12-01' })] });
    const arr = JSON.parse(a.eval('JSON.stringify(incomingEntro("c1", "2026-08-31"))'));
    assert.equal(arr.inTempo, 4);
    assert.deepEqual(arr.tardivi.map(x => x.number), ['ODA-2']);
    assert.equal(a.eval('incomingOf("c1")'), 10, 'la somma resta quella di sempre');
  });

  it('il ricevuto non è più atteso: sparisce dagli arrivi', () => {
    const a = app();
    ordine(a, { lines: [Object.assign(riga('c1', 10, 10), { deliveryDate: '2026-12-01' })] });
    assert.deepEqual(JSON.parse(a.eval('JSON.stringify(incomingEntro("c1", "2026-08-31").tardivi)')), []);
  });

  it('senza data di riferimento tutto è in tempo', () => {
    const a = app();
    ordine(a, { lines: [Object.assign(riga('c1', 10), { deliveryDate: '2030-01-01' })] });
    assert.equal(a.eval('incomingEntro("c1", "").inTempo'), 10, 'senza una data da rispettare non si è in ritardo');
  });
});

describe('Chi impegna, e chi si guarda da fuori', () => {
  function conDuePiani() {
    const a = app();
    a.eval(`db.plans = [
      { id: 'pl1', number: 'PRD-1', lines: [{ id: 'a', itemId: 'c1', qty: 30 }], active: true },
      { id: 'pl2', number: 'PRD-2', lines: [{ id: 'b', itemId: 'c1', qty: 20 }], active: true }]; saveDB();`);
    return a;
  }

  it('un piano non fa concorrenza a sé stesso', () => {
    const a = conDuePiani();
    assert.equal(a.eval('committedOf("c1", "pl2")'), 30, 'resta solo quello che chiede l\'altro, che viene prima');
    assert.equal(a.eval('committedOf("c1", "pl1")'), 0, 'e chi viene dopo non toglie niente a chi viene prima');
    assert.equal(a.eval('committedOf("c1", null)'), 50);
  });

  it('e nemmeno un insieme di piani: due fogli della stessa domanda', () => {
    const a = conDuePiani();
    // È il caso della commessa: guarda dai suoi piani, tutti insieme.
    assert.equal(a.eval('commitsOn("c1", new Set(["pl1","pl2"])).length'), 0);
    assert.equal(a.eval('commitsOn("c1", ["pl2"]).length'), 1, 'anche una lista, non solo un Set');
  });
});

describe('Le giacenze nel giro verso il database condiviso', () => {
  it('i movimenti sono una collezione come le altre', () => {
    const a = app();
    a.eval('addMovement("m1", "carico", 10, "nota")');
    const prima = a.snapshot().movements;
    const dopo = JSON.parse(a.eval('JSON.stringify(nestDB(flattenDB(db)).movements)'));
    assert.deepEqual(dopo, prima);
  });

  it('un backup vecchio senza movimenti si apre lo stesso', () => {
    const a = app();
    a.ref('Store').importSnapshot({ items: [{ id: 'x', code: 'X', name: 'X', type: 'materiale' }] });
    assert.deepEqual(a.snapshot().movements, []);
  });
});
