// Doppia unità di misura: si gestisce in metri, si compra a chilo.
//
// L'errore che questi test esistono per impedire è il peggiore che l'app possa
// fare: un costo sbagliato di un fattore, plausibile, che nessuno nota. Non
// produce un messaggio d'errore né una schermata rotta — produce un preventivo
// sbagliato e una fattura che non torna.
//
// Il caso di riferimento è sempre lo stesso: barra tonda gestita in **m**,
// fornitore che quota in **kg**, 8 kg per ogni metro.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, asm, comp } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || base());
  a.asRole('admin');
  return a;
}
// La barra: 1 m = 8 kg, quotata 2 €/kg → deve costare 16 €/m.
function barra(o) {
  return Object.assign(mat('bar', 0), {
    code: 'BAR', uom: 'm', altUom: 'kg', altFactor: 8,
    priceList: [{ id: 'pr1', supplierId: 's1', price: 2, minQty: '', date: '2026-01-01', priceUom: 'kg' }],
    activePriceId: 'pr1', unitCost: 16,
  }, o || {});
}
function base() {
  return makeDb({
    suppliers: [{ id: 's1', name: 'Rossi Acciai', active: true }],
    items: [
      asm('mac', 'macchina', { components: [comp('bar', 2)] }),
      barra(),
      Object.assign(acq('c1', 5), { supplierId: 's1' }),
    ],
  });
}

describe('Le conversioni, isolate', () => {
  const f = a => (uom) => a.eval(`uomFactor(getItem("bar"), ${JSON.stringify(uom)})`);

  it('l\'unità di gestione non converte niente', () => {
    assert.equal(f(app())('m'), 1);
  });
  it('l\'unità alternativa applica il fattore', () => {
    assert.equal(f(app())('kg'), 8);
  });
  it('un\'unità sconosciuta non inventa una conversione', () => {
    assert.equal(f(app())('pz'), 1, 'nel dubbio nessuna conversione, mai una a caso');
    assert.equal(f(app())(''), 1);
    assert.equal(f(app())(null), 1);
  });
  it('senza fattore l\'unità alternativa non vale', () => {
    const a = app(makeDb({ items: [Object.assign(mat('bar', 1), { uom: 'm', altUom: 'kg' })] }));
    assert.equal(a.eval('hasAltUom(getItem("bar"))'), false, 'un\'etichetta che non converte è solo confusione');
    assert.equal(a.eval('uomFactor(getItem("bar"), "kg")'), 1);
  });
  it('un fattore zero o negativo non vale', () => {
    const a = app(makeDb({ items: [Object.assign(mat('bar', 1), { uom: 'm', altUom: 'kg', altFactor: 0 })] }));
    assert.equal(a.eval('hasAltUom(getItem("bar"))'), false);
    const b = app(makeDb({ items: [Object.assign(mat('bar', 1), { uom: 'm', altUom: 'kg', altFactor: -3 })] }));
    assert.equal(b.eval('hasAltUom(getItem("bar"))'), false, 'un fattore negativo darebbe costi negativi');
  });
  it('un\'alternativa uguale a quella di gestione non è un\'alternativa', () => {
    const a = app(makeDb({ items: [Object.assign(mat('bar', 1), { uom: 'm', altUom: 'm', altFactor: 8 })] }));
    assert.equal(a.eval('hasAltUom(getItem("bar"))'), false);
  });

  it('andata e ritorno tornano al punto di partenza', () => {
    const a = app();
    approx(a.eval('fromAltUom(getItem("bar"), toAltUom(getItem("bar"), 15, "kg"), "kg")'), 15);
    assert.equal(a.eval('toAltUom(getItem("bar"), 15, "kg")'), 120, '15 m sono 120 kg');
    assert.equal(a.eval('fromAltUom(getItem("bar"), 120, "kg")'), 15, '120 kg sono 15 m');
  });

  it('un articolo senza doppia unità si comporta come sempre', () => {
    const a = app();
    assert.equal(a.eval('uomFactor(getItem("c1"), "kg")'), 1);
    assert.equal(a.eval('toAltUom(getItem("c1"), 7, "kg")'), 7);
  });
});

describe('Dal listino al costo: la porta unica', () => {
  it('una quotazione a chilo diventa un costo al metro', () => {
    const a = app();
    approx(a.eval('rowUnitCost(getItem("bar"), getItem("bar").priceList[0])'), 16, '2 €/kg × 8 kg/m');
  });

  it('applyPriceRow scrive il costo convertito, non il prezzo grezzo', () => {
    const a = app();
    a.eval('const it = getItem("bar"); it.unitCost = 0; applyPriceRow(it, it.priceList[0]); saveDB();');
    approx(a.snapshot().items.find(i => i.id === 'bar').unitCost, 16,
      'scrivere 2 vorrebbe dire dichiarare che un metro di barra costa 2 euro');
  });

  it('una quotazione nell\'unità di gestione resta com\'è', () => {
    const a = app();
    a.eval(`const it = getItem("bar"); it.priceList.push({ id: 'pr2', price: 17, priceUom: 'm', date: '2026-02-01' }); saveDB();`);
    approx(a.eval('rowUnitCost(getItem("bar"), getItem("bar").priceList[1])'), 17);
  });

  it('il motore di costo non sa niente di unità: riceve già tutto convertito', () => {
    const a = app();
    approx(a.eval('costOf("mac").total'), 32, '2 m di barra a 16 €/m');
    approx(a.eval('costOf("bar").total'), 16);
  });

  it('cambiare il prezzo della quotazione in uso ricalcola il costo convertito', () => {
    const a = app();
    a.eval('window.__priceItemId = "bar"; priceSetField("pr1", "price", "3");');
    approx(a.snapshot().items.find(i => i.id === 'bar').unitCost, 24, '3 €/kg × 8');
  });

  it('cambiare l\'unità della quotazione in uso ricalcola il costo', () => {
    const a = app();
    a.eval('window.__priceItemId = "bar"; priceSetField("pr1", "priceUom", "m");');
    approx(a.snapshot().items.find(i => i.id === 'bar').unitCost, 2,
      'ora quei 2 euro sono al metro: lasciare 16 sarebbe un numero giusto nell\'unità sbagliata');
  });

  it('un\'unità non valida sulla riga non converte niente', () => {
    const a = app();
    a.eval('window.__priceItemId = "bar"; priceSetField("pr1", "priceUom", "tonnellate");');
    approx(a.snapshot().items.find(i => i.id === 'bar').unitCost, 2, 'nessuna conversione inventata');
  });

  it('cambiare il fattore sull\'articolo ricalcola il costo in uso', () => {
    const a = app();
    a.eval('window.__editingItemId = "bar"');
    ['it-code', 'it-name', 'it-uom', 'it-altuom', 'it-altfactor'].forEach(id => a.el(id));
    a.el('it-code').value = 'BAR'; a.el('it-name').value = 'Barra'; a.el('it-uom').value = 'm';
    a.el('it-altuom').value = 'kg'; a.el('it-altfactor').value = '10';
    a.eval('readItemForm(getItem("bar")); saveDB();');
    approx(a.snapshot().items.find(i => i.id === 'bar').unitCost, 20,
      '2 €/kg × 10 kg/m: senza ricalcolo la costificazione resterebbe alla conversione di ieri');
  });

  it('togliere la doppia unità riporta il costo al prezzo grezzo', () => {
    const a = app();
    a.eval('window.__editingItemId = "bar"');
    a.el('it-code').value = 'BAR'; a.el('it-name').value = 'Barra'; a.el('it-uom').value = 'm';
    a.el('it-altuom').value = ''; a.el('it-altfactor').value = '';
    a.eval('readItemForm(getItem("bar")); saveDB();');
    const it = a.snapshot().items.find(i => i.id === 'bar');
    assert.equal(it.altUom, undefined);
    approx(it.unitCost, 2);
  });
});

describe('Il confronto fra quotazioni in unità diverse', () => {
  // Il bug a effetto opposto: senza conversione «2 €/kg» sembra più conveniente
  // di «5 €/m», e l'app consiglierebbe il fornitore più caro.
  it('la più conveniente è quella col costo minore, non col prezzo minore', () => {
    const a = app();
    a.eval(`const it = getItem("bar");
      it.priceList = [
        { id: 'kg', supplierId: 's1', price: 2, priceUom: 'kg', date: '2026-01-01' },
        { id: 'm',  supplierId: 's1', price: 5, priceUom: 'm',  date: '2026-01-01' }];
      it.activePriceId = 'kg'; saveDB();`);
    assert.equal(a.eval('bestPriceRow(getItem("bar")).id'), 'm',
      '2 €/kg sono 16 €/m: la quotazione a 5 €/m è meno della metà');
  });

  it('a parità di costo convertito vince la più recente', () => {
    const a = app();
    a.eval(`const it = getItem("bar");
      it.priceList = [
        { id: 'vecchia', price: 2, priceUom: 'kg', date: '2026-01-01' },
        { id: 'nuova',   price: 16, priceUom: 'm', date: '2026-06-01' }];
      saveDB();`);
    assert.equal(a.eval('bestPriceRow(getItem("bar")).id'), 'nuova');
  });

  it('nel fabbisogno il risparmio segnalato è quello vero', () => {
    const a = app();
    a.eval(`const it = getItem("bar");
      it.priceList = [
        { id: 'kg', supplierId: 's1', price: 2, priceUom: 'kg', date: '2026-01-01' },
        { id: 'm',  supplierId: 's2', price: 5, priceUom: 'm',  date: '2026-01-01' }];
      it.activePriceId = 'kg'; applyPriceRow(it, it.priceList[0]);
      Store.insert('plans', { id: 'pl1', number: 'FAB-1', active: true, lines: [{ id: 'l1', itemId: 'mac', qty: 1 }] });`);
    const r = JSON.parse(a.eval('JSON.stringify(mrpBuyRows(getPlan("pl1"), false).find(x => x.item.id === "bar"))'));
    approx(r.price, 16);
    approx(r.bestPrice, 5, 'il confronto è fra costi al metro');
    approx(r.saving, (16 - 5) * 2, 'due metri di barra');
  });
});

describe('Il fabbisogno resta in una lingua sola', () => {
  // Si ordina e si riceve sempre nell'unità di gestione dell'articolo: quella
  // del fornitore (a chilo, in questo caso) esiste solo per valorizzare il
  // prezzo, non per dire quanto sta scritto sulla riga del documento.
  function conPiano(a) {
    a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-1', active: true, lines: [{ id: 'l1', itemId: 'mac', qty: 10 }] });`);
    return a;
  }
  function riga(a, net) {
    return JSON.parse(a.eval(`JSON.stringify(mrpBuyRows(getPlan("pl1"), ${net ? 'true' : 'false'}).find(r => r.item.id === "bar"))`));
  }

  it('la quantità resta in metri: niente unità del documento diversa da quella di gestione', () => {
    const a = conPiano(app());
    const r = riga(a, false);
    assert.equal(r.qty, 20, '10 macchine × 2 m');
    assert.equal(r.qtyOrder, 20);
    assert.equal(r.uom, 'm');
  });

  it('il prezzo di riga è il costo convertito, non il prezzo grezzo del fornitore', () => {
    const a = conPiano(app());
    const r = riga(a, false);
    approx(r.amount, 20 * 16);
    approx(r.priceDoc, 16, '2 €/kg × 8 kg/m: sulla riga va il prezzo al metro, mai quello al chilo');
    approx(r.qtyOrder * r.priceDoc, r.amount, 'metri × €/m deve dare lo stesso della costificazione');
  });

  it('un articolo senza doppia unità non cambia comportamento', () => {
    const a = conPiano(app());
    a.eval('const it = getItem("mac"); it.components.push({ itemId: "c1", qty: 3, scrapPct: 0 }); touch(it); saveDB();');
    const r = JSON.parse(a.eval('JSON.stringify(mrpBuyRows(getPlan("pl1"), false).find(x => x.item.id === "c1"))'));
    assert.equal(r.uom, 'pz');
    approx(r.price, 5, 'il costo di costificazione resta quello, indipendente dal listino fornitore');
  });

  it('il minimo del fornitore si confronta convertito nell\'unità di gestione', () => {
    const a = conPiano(app());
    // Minimo 100 kg = 12,5 m: un fabbisogno di 20 m lo supera. Confrontando
    // (per errore) 20 direttamente con 100 l'allarme scatterebbe comunque, ma
    // per il motivo sbagliato — qui si verifica che il numero convertito sia
    // quello giusto (12,5), non il grezzo (100).
    a.eval(`const it = getItem("bar"); it.priceList[0].minQty = 100; saveDB();`);
    const r = riga(a, false);
    approx(r.minQty, 12.5, '100 kg ÷ 8 kg/m');
    assert.equal(r.underMin, false, '20 m superano il minimo di 12,5 m');
  });

  it('e scatta davvero quando la quantità è sotto il minimo convertito', () => {
    const a = conPiano(app());
    // 500 kg = 62,5 m: un fabbisogno di 20 m è sotto.
    a.eval(`const it = getItem("bar"); it.priceList[0].minQty = 500; saveDB();`);
    const r = riga(a, false);
    approx(r.minQty, 62.5);
    assert.equal(r.underMin, true);
  });
});

describe('I documenti nell\'unità dell\'articolo', () => {
  it('la riga d\'ordine nasce in metri, col prezzo già convertito al metro', () => {
    const a = app();
    a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-1', active: true, lines: [{ id: 'l1', itemId: 'mac', qty: 10 }] });`);
    const linea = JSON.parse(a.eval(`JSON.stringify((function(){
      const r = mrpBuyRows(getPlan("pl1"), false).find(x => x.item.id === "bar");
      return planDocLine(r, true);
    })())`));
    assert.equal(linea.uom, 'm');
    assert.equal(linea.qty, 20);
    approx(linea.price, 16, '2 €/kg × 8 kg/m');
    approx(linea.qty * linea.price, 320, 'il totale della riga resta quello giusto');
  });

  it('senza doppia unità la riga resta com\'era', () => {
    const a = app();
    a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-1', active: true, lines: [{ id: 'l1', itemId: 'mac', qty: 10 }] });
      const it = getItem("mac"); it.components.push({ itemId: 'c1', qty: 3, scrapPct: 0 }); touch(it); saveDB();`);
    const linea = JSON.parse(a.eval(`JSON.stringify((function(){
      const r = mrpBuyRows(getPlan("pl1"), false).find(x => x.item.id === "c1");
      return planDocLine(r, true);
    })())`));
    assert.equal(linea.uom, 'pz');
    assert.equal(linea.qty, 30);
  });
});

describe('I ricevimenti tornano a casa convertiti', () => {
  // È il punto in cui la doppia unità tocca il magazzino: il fornitore consegna
  // chili, il magazzino conta metri. Sbagliare qui vuol dire una giacenza
  // sbagliata di un fattore, e con lei il fabbisogno netto.
  function conOrdine(a, o) {
    a.eval(`db.orders.push(${JSON.stringify(Object.assign({ id: 'o1', number: 'ODA-1', status: 'parziale',
      supplierId: 's1', active: true, date: '2026-08-01' }, o))}); saveDB();`);
    return a;
  }

  it('160 kg ricevuti diventano 20 m a magazzino', () => {
    const a = conOrdine(app(), { lines: [{ id: 'l1', itemId: 'bar', uom: 'kg', qty: 240, price: 2, received: 160 }] });
    assert.equal(a.eval('onHandOf("bar")'), 20);
    assert.equal(a.eval('incomingOf("bar")'), 10, 'gli 80 kg mancanti sono 10 m');
  });

  it('una riga già in metri non si converte due volte', () => {
    const a = conOrdine(app(), { lines: [{ id: 'l1', itemId: 'bar', uom: 'm', qty: 30, price: 16, received: 20 }] });
    assert.equal(a.eval('onHandOf("bar")'), 20);
    assert.equal(a.eval('incomingOf("bar")'), 10);
  });

  it('è il caso normale ora: una riga generata oggi nasce già in metri, senza bisogno di conversione', () => {
    const a = app();
    a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-1', active: true, lines: [{ id: 'l1', itemId: 'mac', qty: 10 }] });`);
    const linea = JSON.parse(a.eval(`JSON.stringify((function(){
      const r = mrpBuyRows(getPlan("pl1"), false).find(x => x.item.id === "bar");
      return planDocLine(r, true);
    })())`));
    assert.equal(linea.uom, 'm', 'coerente col magazzino: nessuna conversione da fare in ricevimento');
  });

  it('una riga senza unità vale come unità di gestione', () => {
    const a = conOrdine(app(), { lines: [{ id: 'l1', itemId: 'bar', qty: 30, received: 20 }] });
    assert.equal(a.eval('onHandOf("bar")'), 20, 'i dati di prima della 0.27.0 non hanno l\'unità sulla riga');
  });

  it('i movimenti restano nell\'unità di gestione: non passano dal fornitore', () => {
    const a = app();
    a.eval('addMovement("bar", "carico", 5, "avanzo di lavorazione")');
    assert.equal(a.eval('onHandOf("bar")'), 5, '5 metri, non 5 chili');
  });

  it('il fabbisogno netto usa la giacenza convertita', () => {
    const a = conOrdine(app(), { lines: [{ id: 'l1', itemId: 'bar', uom: 'kg', qty: 160, price: 2, received: 160 }] });
    a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-1', active: true, lines: [{ id: 'l1', itemId: 'mac', qty: 10 }] });`);
    const r = JSON.parse(a.eval('JSON.stringify(mrpBuyRows(getPlan("pl1"), true).find(x => x.item.id === "bar"))'));
    assert.equal(r.qty, 20);
    assert.equal(r.onHand, 20);
    assert.equal(r.qtyOrder, 0, 'i 160 kg ricevuti coprono esattamente i 20 m del piano');
    assert.equal(r.coperto, true);
  });
});

describe('Import Excel', () => {
  // Righe del foglio "Materie prime" del file Acquisti (vedi catalog-xlsx.test.js)
  function importa(a, righe) {
    return JSON.parse(a.eval(`JSON.stringify(importCatalogSheets(${JSON.stringify({ 'Materie prime': righe })}, 'buy'))`));
  }
  it('le colonne UM acquisto e Fattore creano la doppia unità', () => {
    const a = app(makeDb({ items: [] }));
    importa(a, [{ Codice: 'B1', Nome: 'Barra', UM: 'm', 'UM acquisto': 'kg', Fattore: 8 }]);
    const it = a.snapshot().items[0];
    assert.equal(it.altUom, 'kg');
    assert.equal(it.altFactor, 8);
  });
  it('l\'unità d\'acquisto importata entra in elenco, come le altre', () => {
    const a = app(makeDb({ items: [] }));
    importa(a, [{ Codice: 'B1', Nome: 'Barra', UM: 'm', 'UM acquisto': 'kg', Fattore: 8 }]);
    assert.ok(a.snapshot().settings.uoms.some(u => u.code === 'kg'));
  });
  it('unità senza fattore, o fattore senza unità: nessuna conversione', () => {
    const a = app(makeDb({ items: [] }));
    importa(a, [
      { Codice: 'B1', Nome: 'Solo unità', UM: 'm', 'UM acquisto': 'kg' },
      { Codice: 'B2', Nome: 'Solo fattore', UM: 'm', Fattore: 8 },
    ]);
    a.snapshot().items.forEach(it => {
      assert.equal(it.altUom, undefined, it.name);
      assert.equal(it.altFactor, undefined, it.name);
    });
  });
  it('la virgola decimale funziona anche sul fattore', () => {
    const a = app(makeDb({ items: [] }));
    importa(a, [{ Codice: 'B1', Nome: 'Barra', UM: 'm', 'UM acquisto': 'kg', Fattore: '5,55' }]);
    approx(a.snapshot().items[0].altFactor, 5.55);
  });
});

describe('Compatibilità con i dati esistenti', () => {
  it('un articolo senza i campi nuovi costa esattamente come prima', () => {
    const a = app();
    approx(a.eval('costOf("c1").total'), 5);
    assert.equal(a.eval('hasAltUom(getItem("c1"))'), false);
  });
  it('il giro verso la forma normalizzata conserva i campi nuovi', () => {
    const a = app();
    const prima = a.snapshot().items;
    const dopo = JSON.parse(a.eval('JSON.stringify(nestDB(flattenDB(db)).items)'));
    assert.deepEqual(dopo, prima);
  });
});

// 0.105.5
describe('La scheda di un articolo', () => {
  it('l\'unità di un articolo già usato non cambia', () => {
    const a = app();
    a.eval('window.__editingItemId = "bar"');
    a.el('it-code').value = 'BAR'; a.el('it-name').value = 'Barra'; a.el('it-uom').value = 'kg';
    a.el('it-altuom').value = 'kg'; a.el('it-altfactor').value = '8';
    a.eval('readItemForm(getItem("bar")); saveDB();');
    assert.equal(a.snapshot().items.find(i => i.id === 'bar').uom, 'm', 'è in una distinta: giacenza e quantità sono in metri');
  });

  it('una parte che passa da «fabbrica» a «compra» prende il prezzo della quotazione in uso', () => {
    const { parte } = require('./fixtures.js');
    const a = app(makeDb({ suppliers: [{ id: 's1', name: 'Rossi', active: true }], items: [
      Object.assign(parte('p', { sourcing: 'make', cycle: [{ kind: 'op', workCenterId: '', supplierId: null, costMode: 'fisso', cost: 1, hours: 0, days: 0, note: '' }] }), { code: 'P', unitCost: 3,
        priceList: [{ id: 'q', supplierId: 's1', price: 7, minQty: '', date: '2026-01-01' }], activePriceId: 'q' })] }));
    a.eval('window.__editingItemId = "p"');
    ['it-code', 'it-concept', 'it-namefree', 'it-uom', 'it-sourcing'].forEach(id => a.el(id));
    a.el('it-code').value = 'P'; a.el('it-uom').value = 'pz'; a.el('it-sourcing').value = 'buy';
    a.eval('readItemForm(getItem("p")); saveDB(); invalidateCaches();');
    assert.equal(a.eval('costOf("p").total'), 7);
  });
});

describe('Un centro sospeso', () => {
  it('resta scelto sulla lavorazione che lo usa', () => {
    const a = app(makeDb({ workCenters: [{ id: 'w1', name: 'Tornio', hourlyRate: 40, active: true }, { id: 'w2', name: 'Fresa', hourlyRate: 50, active: false }] }));
    const html = a.eval("wcOptions('w2')");
    assert.match(html, /value="w2" selected>Fresa \(.*\) \(sospeso\)/);
    assert.doesNotMatch(a.eval("wcOptions('w1')"), /w2/, 'per una lavorazione nuova non si propone');
  });
});
