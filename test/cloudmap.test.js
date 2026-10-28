// Traduzione annidato ↔ normalizzato.
//
// La proprietà che conta è una sola e va verificata su tutto: `nestDB(flattenDB(x))`
// deve ridare `x`, campo per campo. È il pezzo con più probabilità di bug
// silenziosi — un array che si riordina, un campo che appare o sparisce — e
// l'unico difetto che non si nota subito è proprio quello che rovina i dati:
// nessuno si accorge che i componenti di una distinta hanno cambiato ordine
// finché non guarda un disegno accanto alla lista.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm, comp, wc } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  if (db) a.setDb(db);
  return a;
}
// Il giro completo, fatto dentro il contesto vm e riportato indietro come JSON:
// evita ogni confronto fra oggetti di realm diversi.
function giro(a, extra) {
  return JSON.parse(a.eval(`JSON.stringify(nestDB(flattenDB(db)${extra ? ', ' + JSON.stringify(extra) : ''}))`));
}
// Le collezioni radice, lette dal registro dello schema invece che riscritte
// qui: aggiungerne una in futuro deve far girare i test su di essa da subito.
function collezioni(a) { return Object.keys(JSON.parse(a.eval('JSON.stringify(SCHEMA)'))); }

// Un database che tocca tutte le forme: annidamenti con id proprio (listino,
// righe documento, sottofamiglie) e senza (componenti, lavorazioni, ciclo).
function dbCompleto() {
  return makeDb({
    workCenters: [wc('w1', 40)],
    suppliers: [{ id: 's1', name: 'SKF', referente: '', email: '', active: true, createdAt: '2026-01-01T00:00:00.000Z' }],
    families: [{ id: 'f1', name: 'Acciaio', kind: 'materiale', sigla: 'ACC',
      subs: [{ id: 'sf1', name: 'Lamiere', sigla: 'LAM' }, { id: 'sf2', name: 'Barre', sigla: 'BAR' }] }],
    items: [
      asm('mac', 'macchina', { components: [comp('g1', 1), comp('p1', 2, 5)], operations: [{ workCenterId: 'w1', hours: 3, note: 'montaggio' }] }),
      asm('g1', 'gruppo', { components: [comp('m1', 4), comp('c1', 2)] }),
      parte('p1', { cycle: [
        { kind: 'item', itemId: 'm1', qty: 2, costOverride: null },
        { kind: 'op', workCenterId: 'w1', supplierId: 's1', cost: 12, note: 'tornitura' },
        { kind: 'item', itemId: 'c1', qty: 1, costOverride: 3 },
      ] }),
      Object.assign(mat('m1', 5), { priceList: [
        { id: 'pr1', supplierId: 's1', price: 5, minQty: 10, leadDays: 7, date: '2026-01-02' },
        { id: 'pr2', supplierId: null, price: 4.8, minQty: 0, leadDays: 0, date: '2026-02-01' },
      ], activePriceId: 'pr1' }),
      acq('c1', 3),
    ],
    rfqs: [{ id: 'r1', number: 'RFQ-2026-001', status: 'bozza', supplierId: 's1', active: true,
      lines: [{ id: 'rl1', itemId: 'm1', code: 'M1', qty: 10, price: '' }, { id: 'rl2', itemId: null, code: 'X', qty: 1, price: 3 }] }],
    orders: [{ id: 'o1', number: 'ODA-2026-001', status: 'bozza', supplierId: 's1', active: true,
      lines: [{ id: 'ol1', itemId: 'c1', code: 'C1', qty: 5, price: 3, received: 2 }] }],
    plans: [{ id: 'pl1', number: 'FAB-2026-001', title: 'Lotto', active: true,
      lines: [{ id: 'pll1', itemId: 'mac', qty: 2 }] }],
    users: [{ id: 'u1', name: 'Anna', email: 'a@x.it', role: 'admin', active: true,
      passwordHash: 'abc', passwordSalt: 'def' }],
  });
}

describe('flattenDB / nestDB — il giro completo non perde niente', () => {
  it('database completo: identico campo per campo', () => {
    const a = app(dbCompleto());
    const prima = a.snapshot();
    const dopo = giro(a);
    // Una collezione che la fixture non ha torna come elenco vuoto: è la stessa
    // normalizzazione che fa migrateDB() al caricamento.
    collezioni(a).forEach(coll => {
      assert.deepEqual(dopo[coll], prima[coll] || [], 'collezione ' + coll);
    });
  });

  it('database vuoto: collezioni vuote, non undefined', () => {
    const a = app(makeDb({ items: [] }));
    const dopo = giro(a);
    assert.deepEqual(dopo.items, []);
    assert.deepEqual(dopo.rfqs, []);
    assert.deepEqual(dopo.plans, []);
  });

  it('i dati di esempio dell\'app fanno il giro senza perdite', () => {
    // Non una fixture scritta per l'occasione: il database che l'app crea da
    // sola al primo avvio, migrazioni comprese.
    const a = app();
    a.ref('Store').reset();
    const prima = a.snapshot();
    const dopo = giro(a);
    assert.deepEqual(dopo.items, prima.items);
    assert.deepEqual(dopo.families, prima.families, 'le sottofamiglie sono l\'annidamento più profondo');
    assert.deepEqual(dopo.suppliers, prima.suppliers);
  });
});

describe('L\'ordine degli array', () => {
  it('i componenti tornano nello stesso ordine, non in quello del server', () => {
    const a = app(makeDb({ items: [
      asm('g1', 'gruppo', { components: [comp('c', 1), comp('b', 2), comp('a', 3)] }),
      acq('a', 1), acq('b', 1), acq('c', 1),
    ] }));
    const dopo = giro(a);
    assert.deepEqual(dopo.items.find(i => i.id === 'g1').components.map(c => c.itemId), ['c', 'b', 'a'],
      'un ordine alfabetico qui vorrebbe dire distinte rimescolate a ogni lettura');
  });

  it('le righe di un ordine restano nell\'ordine in cui sono state scritte', () => {
    const a = app(makeDb({ items: [], orders: [{ id: 'o1', number: 'ODA-1', active: true,
      lines: [{ id: 'l3', code: 'Z' }, { id: 'l1', code: 'A' }, { id: 'l2', code: 'M' }] }] }));
    assert.deepEqual(giro(a).orders[0].lines.map(l => l.code), ['Z', 'A', 'M'],
      'su un PDF spedito a un fornitore l\'ordine delle righe si vede');
  });

  it('le fasi di un ciclo di lavorazione conservano la sequenza', () => {
    const a = app(makeDb({ items: [parte('p1', { cycle: [
      { kind: 'op', workCenterId: 'w1', cost: 1, note: 'prima' },
      { kind: 'item', itemId: 'm1', qty: 1 },
      { kind: 'op', workCenterId: 'w1', cost: 2, note: 'poi' },
    ] })] }));
    const c = giro(a).items[0].cycle;
    assert.deepEqual(c.map(r => r.note || r.kind), ['prima', 'item', 'poi'],
      'il ciclo è una sequenza di fasi: rimescolarlo cambia il processo');
  });

  it('righe senza posizione restano in ordine di arrivo, in coda', () => {
    const a = app(makeDb({ items: [] }));
    const tabelle = { items: [{ id: 'b' }, { id: 'a', pos: 0 }, { id: 'c' }] };
    const out = JSON.parse(a.eval(`JSON.stringify(nestDB(${JSON.stringify(tabelle)}))`));
    assert.deepEqual(out.items.map(i => i.id), ['a', 'b', 'c'],
      'meglio un ordine arbitrario ma ripetibile che uno diverso a ogni lettura');
  });
});

describe('Forma normalizzata', () => {
  it('gli array annidati diventano tabelle proprie', () => {
    const a = app(dbCompleto());
    const t = JSON.parse(a.eval('JSON.stringify(flattenDB(db))'));
    assert.equal(t.items.length, 5);
    assert.equal(t.item_components.length, 4, '2 sulla macchina + 2 sul gruppo');
    assert.equal(t.item_operations.length, 1);
    assert.equal(t.item_cycle_rows.length, 3);
    assert.equal(t.item_prices.length, 2);
    assert.equal(t.rfq_lines.length, 2);
    assert.equal(t.order_lines.length, 1);
    assert.equal(t.sub_families.length, 2);
  });

  it('nella riga padre non resta traccia degli array figli', () => {
    const a = app(dbCompleto());
    const t = JSON.parse(a.eval('JSON.stringify(flattenDB(db))'));
    const macchina = t.items.find(i => i.id === 'mac');
    assert.equal(macchina.components, undefined);
    assert.equal(macchina.operations, undefined);
    assert.equal(t.items.find(i => i.id === 'm1').priceList, undefined);
  });

  it('ogni riga figlia porta il padre e la posizione', () => {
    const a = app(dbCompleto());
    const t = JSON.parse(a.eval('JSON.stringify(flattenDB(db))'));
    t.item_components.forEach(r => {
      assert.ok(r.parentId, 'senza padre la riga non sa a quale distinta appartiene');
      assert.ok(Number.isFinite(r.pos));
    });
  });

  it('le righe con un id proprio lo conservano: è l\'identità del merge', () => {
    const a = app(dbCompleto());
    const t = JSON.parse(a.eval('JSON.stringify(flattenDB(db))'));
    assert.deepEqual(t.item_prices.map(r => r.id).sort(), ['pr1', 'pr2'],
      'due colleghi che aggiungono una quotazione non devono sovrascriversi');
    assert.deepEqual(t.rfq_lines.map(r => r.id).sort(), ['rl1', 'rl2']);
  });

  it('le righe senza id ne ricevono uno deterministico', () => {
    const a = app(dbCompleto());
    const uno = JSON.parse(a.eval('JSON.stringify(flattenDB(db).item_components.map(r => r.id))'));
    const due = JSON.parse(a.eval('JSON.stringify(flattenDB(db).item_components.map(r => r.id))'));
    assert.deepEqual(uno, due, 'stesso dato, stessa chiave: altrimenti ogni invio sembrerebbe una modifica');
    assert.equal(new Set(uno).size, uno.length, 'e le chiavi non collidono fra loro');
  });

  it('l\'id costruito non rientra nel documento locale', () => {
    const a = app(dbCompleto());
    const dopo = giro(a);
    dopo.items.filter(i => i.components).forEach(i => {
      i.components.forEach(c => assert.equal(c.id, undefined,
        'un campo in più farebbe risultare modificato ogni articolo, a ogni lettura'));
    });
  });

  it('gli hash delle password si possono togliere prima dell\'invio', () => {
    const a = app(dbCompleto());
    const t = JSON.parse(a.eval('JSON.stringify(flattenDB(db, { stripSecrets: true }))'));
    const u = t.profiles[0];
    assert.equal(u.passwordHash, undefined);
    assert.equal(u.passwordSalt, undefined);
    assert.equal(u.name, 'Anna', 'il resto del profilo resta');
  });

  it('senza l\'opzione non si toglie niente: la scelta è di chi invia', () => {
    const a = app(dbCompleto());
    const t = JSON.parse(a.eval('JSON.stringify(flattenDB(db))'));
    assert.equal(t.profiles[0].passwordHash, 'abc');
  });

  it('un articolo senza distinta non se ne ritrova una vuota', () => {
    const a = app(makeDb({ items: [acq('c1', 3)] }));
    const dopo = giro(a);
    assert.equal(dopo.items[0].components, undefined,
      'un array inventato lo farebbe risultare modificato a ogni lettura');
  });

  it('un array vuoto resta vuoto, non sparisce', () => {
    const a = app(makeDb({ items: [asm('g1', 'gruppo', { components: [], operations: [] })] }));
    const dopo = giro(a);
    assert.deepEqual(dopo.items[0].components, [], 'una distinta svuotata a mano non è una distinta mai avuta');
  });
});

describe('tablesForChanges', () => {
  it('una collezione porta con sé le tabelle dei suoi figli', () => {
    const a = app(makeDb({ items: [] }));
    const t = JSON.parse(a.eval('JSON.stringify(tablesForChanges({ items: { upsert: ["x"], remove: [] } }))'));
    assert.deepEqual(t.sort(), ['item_alternatives', 'item_components', 'item_cycle_rows', 'item_operations', 'item_prices', 'items'].sort());
  });

  it('collezioni sconosciute e insiemi vuoti non fanno danni', () => {
    const a = app(makeDb({ items: [] }));
    assert.deepEqual(JSON.parse(a.eval('JSON.stringify(tablesForChanges({ inventata: {} }))')), []);
    assert.deepEqual(JSON.parse(a.eval('JSON.stringify(tablesForChanges(null))')), []);
  });
});
