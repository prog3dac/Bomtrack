// Ubicazioni, inventario guidato, card che filtrano e vista compatta (0.101.0).
//
// Le proprietà che contano:
//   1. un'ubicazione è un testo sull'articolo, scritto sempre uguale, e il QR
//      dello scaffale apre gli articoli che ci stanno;
//   2. contare non tocca il magazzino: le rettifiche si scrivono solo
//      registrando, e scrivono contato − esistente di quel momento;
//   3. una card cliccata filtra la tabella con lo stesso conto che mostra.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, asm } = require('./fixtures.js');

function app() {
  const a = loadApp({ silent: true });
  a.setDb(makeDb({
    items: [
      Object.assign(mat('m1', 2), { location: 'A-10' }),
      Object.assign(mat('m2', 3), { location: 'A-2' }),
      Object.assign(acq('a1', 5), { location: 'A-2' }),
      acq('a2', 1),
      asm('mac', 'macchina', { components: [] }),
    ],
    movements: [],
  }));
  a.asRole('admin');
  return a;
}
const J = (a, expr) => JSON.parse(a.eval(`JSON.stringify(${expr})`));
const movimenti = a => J(a, "db.movements.map(m => ({ itemId: m.itemId, kind: m.kind, qty: m.qty, note: m.note }))");
function disegna(a, filtri) {
  ['search', 'type', 'family', 'subfamily', 'loc', 'state'].forEach(k => { a.el('stk-' + k).value = (filtri || {})[k] || ''; });
  a.eval('stockLimit = STOCK_PAGE; renderStock()');
  return a.html('stk-table');
}
const codici = html => (html.match(/>([A-Z]\d)</g) || []).map(s => s.slice(1, -1)).sort();

describe('Ubicazioni', () => {
  it('si scrivono maiuscole e senza spazi doppi', () => {
    const a = app();
    assert.equal(a.eval("ubicazioneNorm('  a-03   scaffale ')"), 'A-03 SCAFFALE');
    assert.equal(a.eval("ubicazioneNorm(null)"), '');
  });
  it('l\'elenco è in ordine di cammino: A-2 prima di A-10, e solo per chi sta a magazzino', () => {
    const a = app();
    a.eval("getItem('mac').location = 'Z-1'");
    assert.deepEqual(J(a, 'ubicazioniElenco()'), ['A-2', 'A-10']);
    assert.deepEqual(J(a, "articoliInUbicazione('a-2').map(i => i.code)"), ['A1', 'M2']);
  });
  it('la scheda articolo la salva normalizzata, e vuota la toglie', () => {
    const a = app();
    // Solo la lettura del form: nome e codice li verificano i test dell'anagrafica.
    a.el('it-loc').value = ' b-05 ';
    a.eval("readItemForm(getItem('a2'))");
    assert.equal(a.eval("getItem('a2').location"), 'B-05');
    a.el('it-loc').value = '';
    a.eval("readItemForm(getItem('a2'))");
    assert.equal(a.eval("'location' in getItem('a2')"), false);
    assert.match(a.eval("(function(){ editItemModal('m1'); return Array.from(panelRoot().children).map(e => e.innerHTML).join(''); })()"), /id="it-loc"[^>]*value="A-10"/);
  });
  it('il Magazzino filtra per ubicazione, anche «senza», e la ricerca la trova', () => {
    const a = app();
    assert.deepEqual(codici(disegna(a, { loc: 'A-2' })), ['A1', 'M2']);
    assert.deepEqual(codici(disegna(a, { loc: '@nessuna' })), ['A2']);
    assert.deepEqual(codici(disegna(a, { search: 'a-10' })), ['M1']);
    assert.match(disegna(a), /col-location/);
  });
  it('l\'export porta la colonna Ubicazione', () => {
    const a = app();
    disegna(a, { loc: 'A-10' });
    const sp = J(a, 'stockExportSpec()');
    assert.equal(sp.sezioni[0].colonne[5].h, 'Ubicazione');
    assert.equal(sp.sezioni[0].righe[0][5], 'A-10');
    assert.ok(sp.filtri.some(f => f[0] === 'Ubicazione' && f[1] === 'A-10'));
  });
});

describe('Ubicazioni — il QR dello scaffale', () => {
  it('l\'indirizzo #/q/ubi/… si legge e porta agli articoli di quel posto', () => {
    const a = app();
    const letto = J(a, "qrParse('https://x.it/#/q/ubi/A-2')");
    assert.deepEqual(letto, { tipo: 'ubi', codice: 'A-2' });
    const r = J(a, "qrResolve('ubi', 'a-2')");
    assert.equal(r.tipo, 'ubi');
    assert.deepEqual(r.rec.items.map(i => i.code), ['A1', 'M2']);
  });
  it('un codice nudo che è un articolo resta l\'articolo', () => {
    const a = app();
    a.eval("getItem('a2').location = 'M1'");
    assert.equal(a.eval("qrResolve('', 'M1').tipo"), 'art');
  });
  it('la scheda rapida dell\'ubicazione elenca gli articoli e propone il conteggio', () => {
    const a = app();
    const h = a.eval("qrSchedaHtml('ubi', ubicazioneRec('A-2'))");
    assert.match(h, /2 articoli/);
    assert.match(h, /Conta questa ubicazione/);
    assert.match(h, /inventarioAvviaDaQr\(\{ ambito: 'ubi', ubi: 'A-2' \}\)/);
  });
  it('un\'ubicazione con un apice non rompe il pulsante', () => {
    const a = app();
    a.eval("getItem('a2').location = \"L'ANGOLO\"");
    const h = a.eval("qrSchedaHtml('ubi', ubicazioneRec(\"L'ANGOLO\"))");
    assert.match(h, /ubi: 'L\\'ANGOLO'/);
  });
  it('le etichette delle ubicazioni: una per posto, dagli articoli elencati', () => {
    const a = app();
    disegna(a);
    a.eval('qrEtichetteUbicazioni()');
    assert.deepEqual(J(a, 'window.__qrEtichette'), { tipo: 'ubi', ids: ['A-2', 'A-10'] });
    assert.deepEqual(J(a, "qrEtichettaTesti('ubi', ubicazioneRec('A-2'))"), { codice: 'A-2', righe: ['Ubicazione', '2 articoli'] });
  });
  it('l\'etichetta dell\'articolo dice dove sta', () => {
    const a = app();
    assert.ok(J(a, "qrEtichettaTesti('art', getItem('m1')).righe").includes('Ubic. A-10'));
  });
});

describe('Inventario guidato: si conta', () => {
  it('la fila segue le ubicazioni; chi non ne ha va in fondo', () => {
    const a = app();
    assert.equal(a.eval("inventarioAvvia({ ambito: 'tutto' })"), true);
    assert.deepEqual(J(a, '_inv.ids.map(id => getItem(id).code)'), ['A1', 'M2', 'M1', 'A2']);
  });
  it('un\'ubicazione sola conta solo i suoi', () => {
    const a = app();
    a.eval("inventarioAvvia({ ambito: 'ubi', ubi: 'a-2' })");
    assert.deepEqual(J(a, '_inv.ids.map(id => getItem(id).code)'), ['A1', 'M2']);
    assert.equal(a.eval('_inv.titolo'), 'Ubicazione A-2');
  });
  it('contare passa al prossimo, e un campo vuoto non è uno zero', () => {
    const a = app();
    a.eval("inventarioAvvia({ ambito: 'tutto' })");
    assert.equal(a.eval("invConta('')"), false);
    assert.equal(a.eval('invContati()'), 0);
    assert.equal(a.eval("invConta('-1')"), false);
    assert.equal(a.eval("invConta('3,5')"), true);
    assert.equal(a.eval("_inv.conteggi['a1']"), 3.5);
    assert.equal(a.eval('_inv.pos'), 1);
    assert.equal(a.eval('invConta(0)'), true, 'zero è un conteggio');
    assert.equal(a.eval("_inv.conteggi['m2']"), 0);
  });
  it('contare non scrive niente a magazzino', () => {
    const a = app();
    a.eval("inventarioAvvia({ ambito: 'tutto' }); invConta(7); invConta(2)");
    assert.equal(movimenti(a).length, 0);
  });
  it('un articolo letto porta a lui, e se non è in fila ci entra', () => {
    const a = app();
    a.eval("inventarioAvvia({ ambito: 'ubi', ubi: 'A-2' })");
    assert.equal(a.eval("invLetto('#/q/art/M1')"), true);
    assert.equal(a.eval('getItem(_inv.ids[_inv.pos]).code'), 'M1');
    assert.equal(a.eval('_inv.ids.length'), 3);
    assert.equal(a.eval("invLetto('MAC')"), false, 'un assieme non si conta');
    assert.equal(a.eval("invLetto('NIENTE')"), false);
  });
  it('un\'ubicazione letta porta al primo da contare di quel posto', () => {
    const a = app();
    a.eval("inventarioAvvia({ ambito: 'tutto' }); invConta(1)");   // A1 contato
    a.eval("invLetto('#/q/ubi/A-2')");
    assert.equal(a.eval('getItem(_inv.ids[_inv.pos]).code'), 'M2');
  });
  it('la stessa etichetta letta dalla fotocamera più volte di fila conta una volta', () => {
    const a = app();
    a.eval("inventarioAvvia({ ambito: 'ubi', ubi: 'A-2' })");
    a.eval("invLettoDaCamera('#/q/art/A2')");
    a.eval("invLettoDaCamera('#/q/art/A2')");
    assert.equal(a.eval("_inv.ids.filter(id => id === 'a2').length"), 1);
  });
  it('il conteggio resta in questo browser e si riprende', () => {
    const a = app();
    a.eval("inventarioAvvia({ ambito: 'tutto' }); invConta(4)");
    a.eval('_inv = null');
    const b = J(a, 'invCarica()');
    assert.equal(b.conteggi.a1, 4);
    a.eval('inventarioRiprendi()');
    assert.equal(a.eval('invContati()'), 1);
  });
});

describe('Inventario guidato: il riepilogo e le rettifiche', () => {
  it('scrive contato − esistente come rettifica, solo dove c\'è differenza', () => {
    const a = app();
    a.eval("addMovement('a1', 'carico', 10, ''); addMovement('m2', 'carico', 4, '')");
    a.eval("inventarioAvvia({ ambito: 'ubi', ubi: 'A-2' }); invConta(8); invConta(4)");
    const d = J(a, 'invDifferenze().map(r => [r.it.code, r.esistente, r.contato, r.diff])');
    assert.deepEqual(d, [['A1', 10, 8, -2], ['M2', 4, 4, 0]]);
    assert.equal(a.eval("invRegistra(null, 'Inventario di prova')"), 1);
    const r = movimenti(a).filter(m => m.kind === 'rettifica');
    assert.deepEqual(r, [{ itemId: 'a1', kind: 'rettifica', qty: -2, note: 'Inventario di prova' }]);
    assert.equal(a.eval("onHandOf('a1')"), 8);
    assert.equal(a.eval('_inv'), null, 'registrato, l\'inventario si chiude');
    assert.equal(a.eval('invCarica()'), null);
  });
  it('la differenza si calcola al momento di registrare', () => {
    const a = app();
    a.eval("addMovement('a1', 'carico', 10, '')");
    a.eval("inventarioAvvia({ ambito: 'ubi', ubi: 'A-2' }); invConta(10)");
    a.eval("addMovement('a1', 'scarico', -3, '')");   // esce qualcosa prima di registrare
    a.eval('invRegistra()');
    assert.equal(a.eval("onHandOf('a1')"), 10);
  });
  // 0.105.5: un salvataggio dell'archivio per rettifica, 12 s su 300 righe.
  it('trecento rettifiche si salvano una volta sola', () => {
    const a = app();
    a.eval(`for (let i = 0; i < 300; i++) db.items.push(Object.assign({}, getItem('a1'), { id: 'x' + i, code: 'X' + i, location: 'A-2' }));
      invalidateCaches(); inventarioAvvia({ ambito: 'tutto' });
      _inv.conteggi = Object.fromEntries(db.items.map(it => [it.id, 3])); invSalva && invSalva();
      globalThis.__salvati = 0; const c = Store.commit; Store.commit = function () { __salvati++; return c.apply(this, arguments); };`);
    const n = a.eval('invRegistra()');
    assert.ok(n >= 300, String(n));
    assert.equal(a.eval('__salvati'), 1);
    assert.equal(a.eval("(invalidateCaches(), onHandOf('x7'))"), 3);
  });
  it('si registrano solo le righe scelte; i non contati restano come sono', () => {
    const a = app();
    a.eval("inventarioAvvia({ ambito: 'tutto' }); invConta(5); invConta(6)");
    assert.equal(a.eval("invRegistra(['m2'])"), 1);
    assert.deepEqual(movimenti(a).map(m => m.itemId), ['m2']);
  });
  it('il riepilogo mostra le differenze e i non contati', () => {
    const a = app();
    a.eval("inventarioAvvia({ ambito: 'tutto' }); invConta(5)");
    a.eval('invRiepilogoModal()');
    const h = a.eval('document.body.innerHTML || ""') + a.eval("Array.from(panelRoot().children).map(e => e.innerHTML).join('')");
    assert.match(h, /Registra 1 rettifica/);
    assert.match(h, /Non contati/);
  });
  it('senza il diritto sul magazzino non si comincia', () => {
    const a = app();
    a.asRole('viewer');
    assert.equal(a.eval("inventarioAvvia({ ambito: 'tutto' })"), false);
  });
});

describe('Card che filtrano', () => {
  it('le card del Magazzino sono pulsanti e filtrano la tabella', () => {
    const a = app();
    a.eval("getItem('m1').safetyStock = 5");
    disegna(a);
    assert.match(a.html('stk-kpi'), /role="button"/);
    a.eval("stockFiltraStato('sotto')");
    assert.equal(a.el('stk-state').value, 'sotto');
    assert.deepEqual(codici(a.html('stk-table')), ['M1']);
    assert.match(a.html('stk-kpi'), /kpi-on/);
    a.eval("stockFiltraStato('sotto')");
    assert.equal(a.el('stk-state').value, '', 'un secondo click toglie il filtro');
  });
  it('«Con merce in arrivo» filtra gli stessi articoli che conta', () => {
    const a = app();
    a.eval(`db.orders.push({ id: 'o1', number: 'ODA-1', status: 'inviato', supplierId: '', active: true, date: '2026-10-01',
      lines: [{ id: 'l1', itemId: 'a2', code: 'A2', qty: 3, price: 1, received: 0 }] }); invalidateCaches();`);
    disegna(a, { state: 'arrivo' });
    assert.deepEqual(codici(a.html('stk-table')), ['A2']);
  });
  it('dal Riepilogo, «Ordini da evadere» apre gli ordini su quegli stati', () => {
    const a = app();
    a.eval(`db.orders.push(
      { id: 'o1', number: 'ODA-1', status: 'inviato', active: true, lines: [] },
      { id: 'o2', number: 'ODA-2', status: 'bozza', active: true, lines: [] },
      { id: 'o3', number: 'ODA-3', status: 'parziale', active: true, lines: [] })`);
    a.eval('homeOrdiniDaEvadere()');
    assert.equal(a.eval('activeView'), 'orders');
    assert.deepEqual(J(a, "docFilterApply('order', db.orders).map(o => o.number)"), ['ODA-1', 'ODA-3']);
    assert.equal(J(a, "docListExportSpec('order').filtri").find(f => f[0] === 'Stato')[1], 'Da evadere (inviati, confermati, parziali)');
  });
  it('dal Cruscotto, «Sotto scorta minima» apre il Magazzino filtrato', () => {
    const a = app();
    a.eval("getItem('m1').safetyStock = 5");
    a.eval("dashVaiStock('sotto')");
    assert.equal(a.eval('activeView'), 'stock');
    assert.equal(a.el('stk-state').value, 'sotto');
  });
});

describe('Vista compatta', () => {
  it('si accende sull\'intera pagina e resta in questo browser', () => {
    const a = app();
    a.eval("densitaSet('compatta')");
    assert.equal(a.eval("document.documentElement.getAttribute('data-densita')"), 'compatta');
    assert.equal(a.eval("localStorage.getItem('bomtrack_densita')"), 'compatta');
    a.eval('densitaToggle()');
    assert.equal(a.eval("document.documentElement.getAttribute('data-densita')"), null);
    assert.equal(a.eval("localStorage.getItem('bomtrack_densita')"), 'comoda');
  });
});
