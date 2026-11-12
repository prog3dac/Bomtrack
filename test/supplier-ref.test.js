// Codice e descrizione «presso il fornitore»: escono solo se il fornitore coincide.
//
// Non sono dati dell'articolo, sono dati **di quel fornitore**. Rossi lo chiama
// ROSSI-1, Bianchi lo chiama BIA-9, e la stessa riga d'ordine deve stampare
// l'uno o l'altro a seconda di a chi è intestato il documento. Sbagliarli non è
// un dettaglio estetico: è un codice d'ordine che il fornitore prende per buono
// e su cui spedisce il pezzo di qualcun altro.
//
// I due errori che questi test tengono chiusi:
//   1. cercarli nella sola quotazione **in uso** — su un ordine al secondo
//      fornitore la casella restava vuota pur avendo il dato a listino;
//   2. leggerli dalla copia sui campi dell'articolo, che dopo una correzione
//      nel listino restava al valore vecchio.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

// Una vite quotata da tre fornitori: Rossi (in uso) e Bianchi la chiamano
// ciascuno a modo suo, Verdi non le ha dato un codice.
function base() {
  return makeDb({
    suppliers: [{ id: 's1', name: 'Rossi', active: true }, { id: 's2', name: 'Bianchi', active: true },
      { id: 's3', name: 'Verdi', active: true }],
    items: [Object.assign(acq('a', 10), {
      code: 'A', supplierId: 's1', supplierCode: 'ROSSI-1', supplierDesc: 'Vite Rossi',
      activePriceId: 'q1',
      priceList: [
        { id: 'q1', supplierId: 's1', price: 10, code: 'ROSSI-1', desc: 'Vite Rossi', date: '2026-01-01' },
        { id: 'q2', supplierId: 's2', price: 12, code: 'BIA-9', desc: 'Vite Bianchi', date: '2026-02-01' },
        { id: 'q3', supplierId: 's3', price: 9, code: '', desc: '', date: '2026-03-01' },
      ],
    })],
  });
}
function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || base());
  a.asRole('admin');
  return a;
}
const RIGA = { id: 'l1', itemId: 'a', code: 'A', description: 'Vite', uom: 'pz', qty: 1, price: 10 };
// L'oggetto nasce nel contesto vm: si ricopia qui prima di confrontarlo, o
// deepEqual inciamperebbe sul prototipo invece che sui valori.
function rif(a, sid, l) {
  const r = a.ctx.lineSupInfo(sid, l || RIGA);
  return r ? { code: r.code, desc: r.desc } : r;
}

describe('Il riferimento esce solo per il fornitore del documento', () => {
  it('il fornitore in uso vede il proprio codice e la propria descrizione', () => {
    assert.deepEqual(rif(app(), 's1'), { code: 'ROSSI-1', desc: 'Vite Rossi' });
  });
  // Il caso che prima si perdeva: il dato c'era, a listino, e non usciva.
  it('un altro fornitore a listino vede i **suoi**, non quelli dell\'altro', () => {
    assert.deepEqual(rif(app(), 's2'), { code: 'BIA-9', desc: 'Vite Bianchi' });
  });
  it('un fornitore senza quotazione non eredita il riferimento di nessuno', () => {
    const a = app();
    a.eval('db.suppliers.push({ id: "s9", name: "Estraneo", active: true })');
    assert.equal(rif(a, 's9'), null);
  });
  it('una quotazione senza codice né descrizione non stampa niente', () => {
    assert.equal(rif(app(), 's3'), null);
  });
  it('un documento senza fornitore non stampa riferimenti', () => {
    assert.equal(rif(app(), null), null);
    assert.equal(rif(app(), ''), null);
  });
  it('una riga manuale non ha un articolo da cui leggerli', () => {
    assert.equal(rif(app(), 's1', { id: 'l2', itemId: null, description: 'A mano', qty: 1 }), null);
  });
  it('un articolo cancellato non fa lanciare la riga', () => {
    assert.equal(rif(app(), 's1', { id: 'l3', itemId: 'sparito', qty: 1 }), null);
  });
});

describe('Più quotazioni dallo stesso fornitore', () => {
  function conDue() {
    const db = base();
    db.items[0].priceList.push({ id: 'q2b', supplierId: 's2', price: 11, code: 'BIA-NEW', desc: 'Vite nuova', date: '2026-05-01' });
    return db;
  }
  it('vince la più recente: è l\'ultima volta che ci si è parlati', () => {
    assert.deepEqual(rif(app(conDue()), 's2'), { code: 'BIA-NEW', desc: 'Vite nuova' });
  });
  // La quotazione "in uso" riguarda la costificazione — quanto vale l'articolo
  // nei nostri conti — non che cosa ci fa oggi quel fornitore. Sul documento
  // vince comunque la sua più recente.
  it('vince la più recente anche se una sua vecchia è quella in uso', () => {
    const db = conDue();
    db.items[0].activePriceId = 'q2';   // la vecchia di Bianchi è quella in uso
    assert.deepEqual(rif(app(db), 's2'), { code: 'BIA-NEW', desc: 'Vite nuova' });
  });
});

describe('Correggere il listino corregge anche i documenti', () => {
  // Il refuso si corregge dove il dato nasce — nel listino — e da lì deve
  // arrivare ovunque, copia sull'articolo compresa.
  function correggi(campo, valore) {
    const a = app();
    a.eval('window.__priceItemId = "a"');
    a.eval(`priceSetField("q1", ${JSON.stringify(campo)}, ${JSON.stringify(valore)})`);
    return a;
  }
  it('il codice corretto sulla riga in uso esce subito sul documento', () => {
    assert.equal(correggi('code', 'ROSSI-2').ctx.lineSupInfo('s1', RIGA).code, 'ROSSI-2');
  });
  it('e la copia sui campi dell\'articolo non resta indietro', () => {
    assert.equal(correggi('code', 'ROSSI-2').ref('getItem')('a').supplierCode, 'ROSSI-2');
    assert.equal(correggi('desc', 'Vite zincata').ref('getItem')('a').supplierDesc, 'Vite zincata');
  });
  it('correggere una riga NON in uso non tocca la copia dell\'articolo', () => {
    const a = app();
    a.eval('window.__priceItemId = "a"');
    a.eval('priceSetField("q2", "code", "BIA-10")');
    assert.equal(a.ref('getItem')('a').supplierCode, 'ROSSI-1', 'la copia segue la sola quotazione in uso');
    assert.equal(a.ctx.lineSupInfo('s2', RIGA).code, 'BIA-10', 'ma il documento di Bianchi sì');
  });
});

describe('Sui documenti generati', () => {
  function conOrdine(supplierId) {
    const db = base();
    db.orders = [{ id: 'o1', number: 'ODA-1', supplierId, status: 'bozza', date: '2026-06-01',
      lines: [Object.assign({}, RIGA)], active: true }];
    return db;
  }
  const html = sid => {
    const a = app(conOrdine(sid));
    a.eval('currentOrderId = "o1"; orderView = "edit"');
    return a.ctx.renderOrderEdit('o1');
  };
  it('l\'ordine a Bianchi mostra il riferimento di Bianchi', () => {
    const h = html('s2');
    assert.match(h, /BIA-9/);
    assert.doesNotMatch(h, /ROSSI-1/);
  });
  it('l\'ordine a Rossi mostra quello di Rossi', () => {
    const h = html('s1');
    assert.match(h, /ROSSI-1/);
    assert.doesNotMatch(h, /BIA-9/);
  });
  it('l\'ordine senza fornitore non ne mostra nessuno', () => {
    const h = html(null);
    assert.doesNotMatch(h, /ROSSI-1|BIA-9/);
  });
});

// ═══════════════════════════════════════════════════════════
//  Il listino applicabile: prezzo e unità, non solo il codice
// ═══════════════════════════════════════════════════════════
// Verso un fornitore vale sempre e solo il suo listino, nella quotazione più
// recente. Se non ne ha, la riga nasce senza prezzo: il prezzo di un altro
// fornitore è un numero sbagliato dall'aria giusta, e si scopre alla fattura.
describe('Righe aggiunte da catalogo a un ordine', () => {
  // Barra gestita in m, comprata a kg da Bianchi: 8 kg per ogni metro.
  function mondo() {
    return makeDb({
      suppliers: [{ id: 's1', name: 'Rossi', active: true }, { id: 's2', name: 'Bianchi', active: true },
        { id: 's3', name: 'Verdi', active: true }],
      items: [Object.assign(acq('a', 10), { code: 'A', name: 'Barra', uom: 'm', altUom: 'kg', altFactor: 8,
        supplierId: 's1', activePriceId: 'q1',
        priceList: [
          { id: 'q1', supplierId: 's1', price: 10, code: 'ROSSI-1', date: '2026-01-01' },
          { id: 'q2', supplierId: 's2', price: 12, code: 'BIA-9', date: '2026-02-01' },
          { id: 'q3', supplierId: 's2', price: 14, priceUom: 'kg', code: 'BIA-9', date: '2026-05-01' },
        ] })],
    });
  }
  function riga(supplierId) {
    const db = mondo();
    db.orders = [{ id: 'o1', number: 'ODA-1', supplierId, status: 'bozza', date: '2026-06-01', lines: [], active: true }];
    const a = app(db);
    a.eval('currentOrderId = "o1"; orderView = "edit"');
    a.eval('ordAddCatalogLines("o1", ["a"])');
    const l = a.ref('getOrder')('o1').lines[0];
    return { a, price: l.price, uom: l.uom };
  }

  it('a Rossi il prezzo di Rossi, nella sua unità', () => {
    const r = riga('s1');
    assert.equal(r.price, 10);
    assert.equal(r.uom, 'm');
  });
  // Non la q2 da 12: la q3 è più recente, ed è al chilo — e il chilo si
  // converte. La riga vive sempre nell'unità di gestione: 14 €/kg su una barra
  // da 8 kg/m fanno 112 €/m. Si ordina e si riceve in metri, che è come la
  // barra si gestisce e si monta; quanto pesa lo dice il fattore di
  // conversione, non chi scrive l'ordine.
  it('a Bianchi la sua quotazione più recente, convertita in unità di gestione', () => {
    const r = riga('s2');
    assert.equal(r.price, 112, '14 €/kg × 8 kg/m');
    assert.equal(r.uom, 'm', 'anche se il fornitore quota a chilo, la riga è in metri');
  });
  it('a un fornitore senza listino non si applica niente', () => {
    const r = riga('s3');
    assert.equal(r.price, '', 'meglio una casella vuota del prezzo di un altro');
    assert.equal(r.uom, 'm', 'e l\'unità resta quella di gestione');
  });
  it('su un ordine ancora da intestare, nemmeno', () => {
    assert.equal(riga(null).price, '');
  });
});

describe('Il fornitore cambiato dopo si segnala in riga', () => {
  function ordineCambiato(da, a_) {
    const db = makeDb({
      suppliers: [{ id: 's1', name: 'Rossi', active: true }, { id: 's2', name: 'Bianchi', active: true },
        { id: 's3', name: 'Verdi', active: true }],
      items: [Object.assign(acq('a', 10), { code: 'A', name: 'Vite', uom: 'pz', supplierId: 's1', activePriceId: 'q1',
        priceList: [{ id: 'q1', supplierId: 's1', price: 10, date: '2026-01-01' },
          { id: 'q2', supplierId: 's2', price: 12, date: '2026-02-01' }] })],
      orders: [{ id: 'o1', number: 'ODA-1', supplierId: da, status: 'bozza', date: '2026-06-01', lines: [], active: true }],
    });
    const app_ = app(db);
    app_.eval('currentOrderId = "o1"; orderView = "edit"');
    app_.eval('ordAddCatalogLines("o1", ["a"])');
    app_.eval(`ordSetSupplier("o1", ${JSON.stringify(a_)})`);
    const o = app_.ref('getOrder')('o1');
    return app_.ctx.ordLineListinoWarn(o, o.lines[0]).replace(/<[^>]+>/g, '');
  }
  // Dalla 0.157.0 cambiare il fornitore riscrive i prezzi delle righe di
  // articolo: non resta niente da segnalare. Se qualcuno poi scrive a mano un
  // prezzo diverso dal listino, l'avviso c'è ancora.
  it('niente da segnalare se il fornitore non è cambiato', () => {
    assert.equal(ordineCambiato('s1', 's1'), '');
  });
  it('passando a un fornitore che quota diversamente, la riga prende il suo prezzo', () => {
    assert.equal(ordineCambiato('s1', 's2'), '');
  });
  it('passando a un fornitore che non lo ha a listino, la riga resta senza prezzo', () => {
    assert.equal(ordineCambiato('s1', 's3'), '', 'senza prezzo non c\'è niente da confrontare');
  });
});
