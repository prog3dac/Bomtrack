// Articoli ⇄ Excel, nei due file Acquisti e Progetto.
//
// Come per gli altri import, si verifica la logica su righe già lette (l'array
// di oggetti che readWorkbook consegna, chiavi = intestazioni del foglio): il
// binario xlsx è di SheetJS e non è nostro.
//
// Quello che è nostro, e che qui si fissa: che l'export porti via tutto e si
// possa reimportare ottenendo lo stesso stato, che il prezzo diventi una
// quotazione a listino invece di un valore scritto sull'articolo, che i fogli
// del file Progetto si applichino in un ordine che permette a un gruppo di
// puntare a una macchina definita nello stesso file, e che 🔍 Verifica non
// scriva davvero niente — né in memoria né su disco.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || makeDb());
  a.asRole('admin');
  return a;
}
const approx = (a, b, m) => assert.ok(Math.abs(a - b) < 0.0001, m || `${a} ≠ ${b}`);
// Un foglio come lo consegna SheetJS: intestazioni in riga 1, celle vuote a ''
function aoaToRows(aoa) {
  const head = aoa[0] || [];
  return aoa.slice(1).map(r => {
    const o = {};
    head.forEach((k, i) => { o[k] = r[i] === undefined || r[i] === null ? '' : r[i]; });
    return o;
  });
}
function sheets(a, scope) { return JSON.parse(a.eval(`JSON.stringify(catalogSheets(${JSON.stringify(scope)}))`)); }
function sheetByName(a, scope, name) { return sheets(a, scope).find(s => s.name === name); }
function rowsOf(a, scope, name) { return aoaToRows(sheetByName(a, scope, name).aoa); }
// L'intero file esportato, pronto per essere reimportato
function workbook(a, scope) {
  const out = {};
  sheets(a, scope).forEach(s => { out[s.name] = aoaToRows(s.aoa); });
  return out;
}
function importa(a, byName, scope, opts) {
  return JSON.parse(a.eval(`JSON.stringify(importCatalogSheets(${JSON.stringify(byName)}, ${JSON.stringify(scope)}, ${JSON.stringify(opts || {})}))`));
}
function quota(o) {
  return Object.assign({ id: 'q1', supplierId: null, price: 0, minQty: '', leadDays: '',
    code: '', desc: '', date: '2026-01-10', rfqId: null, note: '' }, o);
}
const UOMS = [{ code: 'pz', name: 'Pezzi' }, { code: 'kg', name: 'Chili' }, { code: 'm', name: 'Metri' }];

// Catalogo lato acquisti: un commerciale con una quotazione in uso, una materia
// prima a doppia unità con due quotazioni.
function dbAcquisti() {
  return makeDb({
    suppliers: [{ id: 's1', name: 'SKF', active: true }, { id: 's2', name: 'Rossi Acciai', active: true }],
    families: [{ id: 'f1', name: 'Meccanico', kind: 'acquistato', sigla: 'MEC', subs: [{ id: 'sf1', name: 'Cuscinetti', sigla: 'CUS' }] },
      { id: 'f2', name: 'Acciaio', kind: 'materiale', sigla: 'ACC', subs: [{ id: 'sf2', name: 'Barre', sigla: 'BAR' }] }],
    items: [
      { id: 'c1', code: 'CMM-MEC-CUS-001', name: 'Cuscinetto SKF 6204', type: 'acquistato', uom: 'pz',
        familyId: 'f1', subFamilyId: 'sf1', purchasePrice: 12.5, supplierId: 's1', favorite: true,
        safetyStock: 20, lotSize: null, notes: 'tenerne sempre a scorta', active: true, priceListSeeded: true,
        priceList: [quota({ id: 'q1', supplierId: 's1', price: 12.5, minQty: 10, leadDays: 15, code: 'SKF-6204' })],
        activePriceId: 'q1' },
      { id: 'm1', code: 'MAT-ACC-BAR-001', name: 'Barra tonda Ø30', type: 'materiale', uom: 'm',
        altUom: 'kg', altFactor: 5.55, familyId: 'f2', subFamilyId: 'sf2', unitCost: 11.1, supplierId: 's2',
        active: true, priceListSeeded: true,
        priceList: [quota({ id: 'q2', supplierId: 's2', price: 2, priceUom: 'kg', date: '2026-02-01' }),
          quota({ id: 'q3', supplierId: 's1', price: 2.2, priceUom: 'kg', date: '2026-01-05' })],
        activePriceId: 'q2' },
    ],
    settings: { uoms: UOMS, uomDefault: 'pz' },
  });
}
// Catalogo lato progetto: macchina → gruppo → sottogruppo e parte
function dbProgetto() {
  return makeDb({
    items: [
      { id: 'mac', code: 'TRN-S00', name: 'Tornio NT-200', type: 'macchina', uom: 'pz', sigla: 'TRN',
        gCodeLen: 3, gCodeType: 'alpha', incrDigitsS: 2, incrDigitsN: 3, components: [], operations: [], active: true },
      { id: 'grp', code: 'TRN-BAS-S00', name: 'Basamento', type: 'gruppo', uom: 'pz', sigla: 'BAS',
        machineItemId: 'mac', components: [], operations: [], active: true },
      { id: 'sgr', code: 'TRN-BAS-999', name: 'Carter', type: 'sottogruppo', uom: 'pz',
        machineItemId: 'mac', groupItemId: 'grp', components: [], operations: [], active: true },
      { id: 'prt', code: 'TRN-BAS-001', name: 'ALBERO motore 20x100', type: 'parte', uom: 'pz',
        conceptId: 'k1', nameFree: 'motore 20x100', sourcing: 'make', machineItemId: 'mac', groupItemId: 'grp',
        cycle: [], priceList: [], priceListSeeded: true, safetyStock: null, active: true },
    ],
    settings: { uoms: UOMS, uomDefault: 'pz', concepts: [{ id: 'k1', name: 'ALBERO' }] },
  });
}
// La postazione nuova: vuota, ma i concetti ci sono (l'import non li crea)
function dbVuotoProgetto() {
  return makeDb({ settings: { uoms: UOMS, uomDefault: 'pz', concepts: [{ id: 'k9', name: 'ALBERO' }] } });
}

describe('Export articoli — due file, un foglio per tipo', () => {
  const a = app(dbAcquisti());
  const p = app(dbProgetto());

  it('il file Acquisti ha i fogli dei suoi due tipi, più il listino', () => {
    assert.deepEqual(sheets(a, 'buy').map(s => s.name), ['Commerciali', 'Materie prime', 'Listino']);
  });
  it('il file Progetto applica i fogli in ordine: macchine, gruppi, sottogruppi, parti', () => {
    // L'ordine è il contratto: un gruppo può puntare a una macchina dello stesso file
    assert.deepEqual(sheets(p, 'design').map(s => s.name),
      ['Macchine', 'Gruppi', 'Sottogruppi', 'Parti', 'Listino']);
  });
  it('ogni foglio ha solo le colonne del suo tipo', () => {
    const mac = sheetByName(p, 'design', 'Macchine').aoa[0];
    assert.ok(mac.includes('Sigla') && mac.includes('Tipo sigla gruppo'));
    assert.ok(!mac.includes('Prezzo'), 'una macchina non ha listino');
    assert.ok(!mac.includes('Macrofamiglia'), 'una macchina non ha famiglia');
    const com = sheetByName(a, 'buy', 'Commerciali').aoa[0];
    assert.ok(!com.includes('Sigla') && !com.includes('Codice macchina'));
    assert.ok(!sheetByName(p, 'design', 'Parti').aoa[0].includes('Preferito'), 'le parti non si mettono tra i preferiti');
  });
  it('gli obbligatori sono marcati con * e restano riconoscibili alla lettura', () => {
    assert.ok(sheetByName(a, 'buy', 'Commerciali').aoa[0].includes('Descrizione *'));
    assert.equal(a.eval('pick({"Nome *":"X"}, "Nome")'), 'X');
    assert.equal(a.eval('cell({"UM *":"kg"}, "UM")'), 'kg');
  });
  it('la quotazione unica e in uso viaggia sulla riga dell\'articolo', () => {
    const r = rowsOf(a, 'buy', 'Commerciali')[0];
    assert.equal(r['Codice'], 'CMM-MEC-CUS-001');
    assert.equal(r['Fornitore'], 'SKF');
    assert.equal(r['Prezzo'], 12.5);
    assert.equal(typeof r['Prezzo'], 'number', 'un prezzo formattato non si può reimportare');
    assert.equal(r['Q.tà min'], 10);
    assert.equal(r['Data prezzo'], '2026-01-10');
  });
  it('con più quotazioni la riga articolo resta vuota e parla il foglio Listino', () => {
    const r = rowsOf(a, 'buy', 'Materie prime')[0];
    assert.equal(r['Prezzo'], '', 'due quotazioni non stanno in una riga sola');
    const l = rowsOf(a, 'buy', 'Listino');
    assert.equal(l.length, 2);
    assert.deepEqual(l.map(x => x['Codice articolo *']), ['MAT-ACC-BAR-001', 'MAT-ACC-BAR-001']);
    assert.deepEqual(l.map(x => x['In uso']), ['Sì', '']);
  });
  it('le parti escono con concetto e descrizione separati, e il nome è di sola lettura', () => {
    const r = rowsOf(p, 'design', 'Parti')[0];
    assert.equal(r['Concetto *'], 'ALBERO');
    assert.equal(r['Descrizione *'], 'motore 20x100');
    assert.equal(r['Descrizione composta (calcolato)'], 'ALBERO motore 20x100');
    assert.equal(r['Approvvigionamento'], 'Produzione interna');
  });
  it('un campo non impostato resta vuoto, non diventa zero', () => {
    const r = rowsOf(a, 'buy', 'Commerciali')[0];
    assert.equal(r['Scorta minima'], 20);
    assert.equal(r['Lotto riordino'], '', 'un lotto non impostato scritto 0 diventerebbe un lotto da zero pezzi');
  });
});

describe('Foglio Liste — i valori ammessi, da leggere', () => {
  it('Acquisti: unità, fornitori attivi e le coppie famiglia/sottofamiglia appaiate', () => {
    const a = app(dbAcquisti());
    const liste = aoaToRows(JSON.parse(a.eval('JSON.stringify(catListeAoa("buy"))')).length
      ? JSON.parse(a.eval('JSON.stringify(catListeAoa("buy"))')) : [[]]);
    const col = (n) => liste.map(r => r[n]).filter(v => v !== '');
    assert.deepEqual(col('UM'), ['pz', 'kg', 'm']);
    assert.deepEqual(col('Fornitori'), ['SKF', 'Rossi Acciai']);
    assert.deepEqual(col('Macrofamiglia commerciali'), ['Meccanico']);
    assert.deepEqual(col('Sottofamiglia commerciali'), ['Cuscinetti']);
  });
  it('Progetto: macchine e gruppi col codice in una colonna sua, concetti e approvvigionamento', () => {
    const p = app(dbProgetto());
    const liste = aoaToRows(JSON.parse(p.eval('JSON.stringify(catListeAoa("design"))')));
    const col = (n) => liste.map(r => r[n]).filter(v => v !== '');
    assert.deepEqual(col('Codice macchina'), ['TRN-S00']);
    assert.deepEqual(col('Codice gruppo'), ['TRN-BAS-S00']);
    assert.deepEqual(col('Concetti'), ['ALBERO']);
    assert.deepEqual(col('Approvvigionamento'), ['Produzione interna', 'Acquisto da fornitore']);
  });
  it('i fornitori sospesi non finiscono in elenco', () => {
    const d = dbAcquisti();
    d.suppliers[1].active = false;
    const a = app(d);
    const liste = aoaToRows(JSON.parse(a.eval('JSON.stringify(catListeAoa("buy"))')));
    assert.deepEqual(liste.map(r => r['Fornitori']).filter(Boolean), ['SKF']);
  });
});

describe('Round-trip Acquisti — il file esportato ricostruisce il catalogo', () => {
  const sorgente = app(dbAcquisti());
  const file = workbook(sorgente, 'buy');
  const nuova = app(makeDb({ settings: { uoms: UOMS, uomDefault: 'pz' } }));
  const rep = importa(nuova, file, 'buy');
  const dopo = nuova.snapshot();

  it('non segnala errori su un file che ha prodotto lui stesso', () => {
    assert.deepEqual(rep.errors, []);
    assert.deepEqual(rep.warnings, []);
  });
  it('rimette anagrafica, famiglie, scorte e flag', () => {
    const c = dopo.items.find(i => i.code === 'CMM-MEC-CUS-001');
    assert.equal(c.type, 'acquistato');
    assert.equal(c.name, 'Cuscinetto SKF 6204');
    assert.equal(c.uom, 'pz');
    assert.equal(c.favorite, true);
    assert.equal(c.safetyStock, 20);
    assert.equal(c.lotSize, null, 'un campo non impostato non deve tornare 0');
    assert.equal(c.notes, 'tenerne sempre a scorta');
    const fam = dopo.families.find(f => f.name === 'Meccanico');
    assert.equal(fam.kind, 'acquistato');
    assert.equal(c.familyId, fam.id);
    assert.equal(c.subFamilyId, fam.subs[0].id);
  });
  it('il prezzo torna come quotazione a listino, non come valore sull\'articolo', () => {
    const c = dopo.items.find(i => i.code === 'CMM-MEC-CUS-001');
    assert.equal(c.priceList.length, 1);
    assert.equal(c.activePriceId, c.priceList[0].id);
    assert.equal(c.priceList[0].price, 12.5);
    assert.equal(c.priceList[0].minQty, 10);
    assert.equal(c.priceList[0].date, '2026-01-10');
    assert.equal(c.priceList[0].code, 'SKF-6204');
    assert.equal(c.purchasePrice, 12.5, 'applyPriceRow deve aver portato il prezzo nel campo di costo');
    assert.equal(c.supplierId, dopo.suppliers.find(s => s.name === 'SKF').id);
  });
  it('la doppia unità sopravvive, e il costo resta convertito nell\'unità di gestione', () => {
    const m = dopo.items.find(i => i.code === 'MAT-ACC-BAR-001');
    assert.equal(m.altUom, 'kg');
    approx(m.altFactor, 5.55);
    assert.equal(m.priceList.length, 2, 'le due quotazioni tornano dal foglio Listino');
    const attiva = m.priceList.find(r => r.id === m.activePriceId);
    assert.equal(attiva.price, 2);
    assert.equal(attiva.priceUom, 'kg');
    approx(m.unitCost, 11.1, '2 €/kg su 5,55 kg/m fanno 11,10 €/m');
  });
  it('reimportare lo stesso file non duplica articoli né quotazioni', () => {
    const rep2 = importa(nuova, file, 'buy');
    const d2 = nuova.snapshot();
    assert.equal(d2.items.length, 2);
    assert.equal(d2.items.find(i => i.code === 'MAT-ACC-BAR-001').priceList.length, 2);
    assert.equal(d2.suppliers.length, 2);
    assert.equal(d2.families.length, 2);
    assert.equal(rep2.sheets.reduce((n, s) => n + s.created, 0), 0);
  });
  it('esportando di nuovo si riottiene lo stesso file', () => {
    const rifatto = workbook(nuova, 'buy');
    const senzaDate = o => JSON.stringify(o);
    assert.equal(senzaDate(rifatto['Commerciali']), senzaDate(file['Commerciali']));
    assert.equal(senzaDate(rifatto['Listino']), senzaDate(file['Listino']));
  });
});

describe('Round-trip Progetto — macchine, gruppi e appartenenze', () => {
  const sorgente = app(dbProgetto());
  const file = workbook(sorgente, 'design');
  const nuova = app(dbVuotoProgetto());
  const rep = importa(nuova, file, 'design');
  const dopo = nuova.snapshot();
  const perCodice = c => dopo.items.find(i => i.code === c);

  it('non segnala errori su un file che ha prodotto lui stesso', () => {
    assert.deepEqual(rep.errors, []);
  });
  it('lo schema di codifica della macchina sopravvive', () => {
    const m = perCodice('TRN-S00');
    assert.equal(m.sigla, 'TRN');
    assert.equal(m.gCodeLen, 3);
    assert.equal(m.gCodeType, 'alpha');
    assert.equal(m.incrDigitsS, 2);
    assert.equal(m.incrDigitsN, 3);
  });
  it('gruppo, sottogruppo e parte ritrovano la loro macchina e il loro gruppo', () => {
    const m = perCodice('TRN-S00'), g = perCodice('TRN-BAS-S00');
    assert.equal(g.machineItemId, m.id);
    assert.equal(g.sigla, 'BAS');
    assert.equal(perCodice('TRN-BAS-999').groupItemId, g.id);
    assert.equal(perCodice('TRN-BAS-001').machineItemId, m.id);
    assert.equal(perCodice('TRN-BAS-001').groupItemId, g.id);
  });
  it('la parte ricompone il nome da concetto e descrizione', () => {
    const p = perCodice('TRN-BAS-001');
    assert.equal(p.nameFree, 'motore 20x100');
    assert.equal(p.name, 'ALBERO motore 20x100');
    assert.equal(p.conceptId, 'k9', 'il concetto si risolve per nome sul database di destinazione');
    assert.equal(p.sourcing, 'make');
  });
  it('la colonna "Nome composto" è ignorata anche se la si modifica a mano', () => {
    const n2 = app(dbVuotoProgetto());
    const f2 = JSON.parse(JSON.stringify(file));
    f2['Parti'][0]['Nome composto (calcolato)'] = 'QUALCOSA di sbagliato';
    importa(n2, f2, 'design');
    assert.equal(n2.snapshot().items.find(i => i.type === 'parte').name, 'ALBERO motore 20x100');
  });
  it('reimportare non duplica', () => {
    importa(nuova, file, 'design');
    assert.equal(nuova.snapshot().items.length, 4);
  });
});

describe('L\'ordine dei fogli è il contratto', () => {
  it('un gruppo si aggancia a una macchina definita nello stesso file', () => {
    const a = app(dbVuotoProgetto());
    const rep = importa(a, {
      'Macchine': [{ Codice: 'FRE-S00', Sigla: 'FRE', Nome: 'Fresa', UM: 'pz' }],
      'Gruppi': [{ Codice: '', 'Codice macchina': 'FRE-S00', Sigla: 'TAV', Nome: 'Tavola', UM: 'pz' }],
    }, 'design');
    assert.deepEqual(rep.errors, []);
    const d = a.snapshot();
    const g = d.items.find(i => i.type === 'gruppo');
    assert.equal(g.machineItemId, d.items.find(i => i.type === 'macchina').id);
    assert.equal(g.code, 'FRE-TAV-S00', 'il codice si genera dallo schema della macchina appena creata');
  });
  it('una parte si aggancia al gruppo creato due fogli prima', () => {
    const a = app(dbVuotoProgetto());
    const rep = importa(a, {
      'Macchine': [{ Codice: '', Sigla: 'FRE', Nome: 'Fresa', UM: 'pz' }],
      'Gruppi': [{ Codice: '', 'Codice macchina': 'FRE-S00', Sigla: 'TAV', Nome: 'Tavola', UM: 'pz' }],
      'Parti': [{ Codice: '', 'Codice macchina': 'FRE-S00', 'Codice gruppo': 'FRE-TAV-S00',
        'Concetto *': 'ALBERO', 'Descrizione *': 'traino', 'UM *': 'pz' }],
    }, 'design');
    assert.deepEqual(rep.errors, []);
    assert.equal(a.snapshot().items.find(i => i.type === 'parte').code, 'FRE-TAV-001');
  });
  it('la macchina inesistente è un errore che dice foglio e riga, e non crea niente', () => {
    const a = app(dbVuotoProgetto());
    const rep = importa(a, { 'Gruppi': [{ 'Codice macchina': 'ZZZ-S00', Sigla: 'TAV', Nome: 'Tavola' }] }, 'design');
    assert.equal(a.snapshot().items.length, 0);
    assert.match(rep.errors[0], /^Gruppi, riga 2: macchina "ZZZ-S00" non trovata/);
  });
  it('il gruppo di un\'altra macchina viene rifiutato', () => {
    const a = app(dbProgetto());
    const rep = importa(a, {
      'Macchine': [{ Codice: 'FRE-S00', Sigla: 'FRE', Nome: 'Fresa', UM: 'pz' }],
      'Sottogruppi': [{ 'Codice macchina': 'FRE-S00', 'Codice gruppo': 'TRN-BAS-S00', Nome: 'Carter 2', UM: 'pz' }],
    }, 'design');
    assert.match(rep.errors[0], /non appartiene alla macchina indicata/);
  });
});

describe('Codifica: le regole della scheda articolo valgono anche da un foglio', () => {
  it('la sigla di un gruppo deve rispettare lo schema della sua macchina', () => {
    const a = app(dbProgetto());
    const rep = importa(a, { 'Gruppi': [{ 'Codice macchina': 'TRN-S00', Sigla: 'AB', Nome: 'Corta', UM: 'pz' }] }, 'design');
    assert.equal(a.snapshot().items.length, 4, 'non deve essere stato creato niente');
    assert.match(rep.errors[0], /esattamente 3 caratteri/);
  });
  it('la sigla gruppo già usata su quella macchina viene rifiutata', () => {
    const a = app(dbProgetto());
    const rep = importa(a, { 'Gruppi': [{ 'Codice macchina': 'TRN-S00', Sigla: 'BAS', Nome: 'Altro', UM: 'pz' }] }, 'design');
    assert.match(rep.errors[0], /già usata su questa macchina/);
  });
  it('la sigla macchina duplicata viene rifiutata', () => {
    const a = app(dbProgetto());
    const rep = importa(a, { 'Macchine': [{ Sigla: 'TRN', Nome: 'Altro tornio', UM: 'pz' }] }, 'design');
    assert.match(rep.errors[0], /già in uso/);
  });
  it('senza sigla e senza codice il gruppo non nasce con un codice inventato', () => {
    const a = app(dbProgetto());
    const rep = importa(a, { 'Gruppi': [{ 'Codice macchina': 'TRN-S00', Nome: 'Senza sigla', UM: 'pz' }] }, 'design');
    assert.equal(a.snapshot().items.length, 4);
    assert.match(rep.errors[0], /non generabile/);
  });
  it('cambiare lo schema di una macchina esistente avvisa invece di tacere', () => {
    const a = app(dbProgetto());
    const rep = importa(a, { 'Macchine': [{ Codice: 'TRN-S00', Sigla: 'TRN', Nome: 'Tornio NT-200', UM: 'pz', 'N° car. sigla gruppo': 4 }] }, 'design');
    assert.deepEqual(rep.errors, []);
    assert.match(rep.warnings[0], /schema di codifica cambiato/);
    assert.equal(a.snapshot().items.find(i => i.type === 'macchina').gCodeLen, 4);
  });
  it('due righe con lo stesso codice a meno di maiuscole si segnalano, non si sovrascrivono in silenzio', () => {
    const a = app(makeDb({ settings: { uoms: UOMS, uomDefault: 'pz' } }));
    const rep = importa(a, { 'Commerciali': [
      { Codice: 'ab-1', Nome: 'Primo', UM: 'pz' },
      { Codice: 'AB-1', Nome: 'Secondo', UM: 'pz' },
    ] }, 'buy');
    assert.equal(a.snapshot().items.length, 1);
    assert.equal(a.snapshot().items[0].name, 'Primo');
    assert.match(rep.errors[0], /già usato alla riga 2/);
  });
  it('il tipo di un articolo esistente non si cambia da un foglio', () => {
    const a = app(dbProgetto());
    const rep = importa(a, { 'Commerciali': [{ Codice: 'TRN-S00', Nome: 'Ex macchina', UM: 'pz' }] }, 'buy');
    assert.equal(a.snapshot().items.find(i => i.code === 'TRN-S00').type, 'macchina');
    assert.match(rep.errors[0], /è già di Macchina/);
  });
});

describe('Prezzi: la riga crea una quotazione, e la quotazione decide il costo', () => {
  function conCommerciale() {
    return app(makeDb({
      suppliers: [{ id: 's1', name: 'SKF', active: true }],
      settings: { uoms: UOMS, uomDefault: 'pz' },
    }));
  }
  it('prezzo e fornitore diventano una quotazione in uso, non un valore scritto a mano', () => {
    const a = conCommerciale();
    importa(a, { 'Commerciali': [{ Codice: 'C1', Nome: 'Cuscinetto', UM: 'pz', Fornitore: 'SKF', Prezzo: '12,50' }] }, 'buy');
    const it = a.snapshot().items[0];
    assert.equal(it.priceList.length, 1);
    assert.equal(it.activePriceId, it.priceList[0].id);
    approx(it.priceList[0].price, 12.5, 'la virgola decimale è quella che si scrive davvero');
    approx(it.purchasePrice, 12.5);
    assert.equal(it.supplierId, 's1');
  });
  it('il prezzo si converte con la doppia unità, come nel listino', () => {
    const a = conCommerciale();
    importa(a, { 'Materie prime': [{ Codice: 'B1', Nome: 'Barra', UM: 'm', 'UM acquisto': 'kg',
      Fattore: '5,55', Fornitore: 'Rossi', Prezzo: 2, 'UM prezzo': 'kg' }] }, 'buy');
    const it = a.snapshot().items[0];
    assert.equal(it.priceList[0].priceUom, 'kg');
    approx(it.unitCost, 11.1);
  });
  it('una UM prezzo che non è l\'unità d\'acquisto viene ignorata, e detto', () => {
    const a = conCommerciale();
    const rep = importa(a, { 'Materie prime': [{ Codice: 'B1', Nome: 'Barra', UM: 'm', Fornitore: 'SKF', Prezzo: 2, 'UM prezzo': 'kg' }] }, 'buy');
    assert.equal(a.snapshot().items[0].priceList[0].priceUom, undefined);
    assert.match(rep.warnings[0], /non è l'unità di acquisto/);
  });
  it('inline e foglio Listino con la stessa chiave sono la stessa quotazione', () => {
    const a = conCommerciale();
    importa(a, {
      'Commerciali': [{ Codice: 'C1', Nome: 'Cuscinetto', UM: 'pz', Fornitore: 'SKF', Prezzo: 12.5, 'Data prezzo': '2026-03-01' }],
      'Listino': [{ 'Codice articolo *': 'C1', Fornitore: 'SKF', 'Prezzo *': 13, 'Data *': '2026-03-01' }],
    }, 'buy');
    const it = a.snapshot().items[0];
    assert.equal(it.priceList.length, 1, 'stessa data e stesso fornitore: è la stessa quotazione, aggiornata');
    assert.equal(it.priceList[0].price, 13);
  });
  it('"In uso" nel foglio Listino vince sulla quotazione della riga articolo', () => {
    const a = conCommerciale();
    importa(a, {
      'Commerciali': [{ Codice: 'C1', Nome: 'Cuscinetto', UM: 'pz', Fornitore: 'SKF', Prezzo: 12.5, 'Data prezzo': '2026-03-01' }],
      'Listino': [{ 'Codice articolo *': 'C1', Fornitore: 'Rossi', 'Prezzo *': 9, 'Data *': '2026-04-01', 'In uso': 'Sì' }],
    }, 'buy');
    const it = a.snapshot().items[0];
    assert.equal(it.priceList.length, 2);
    approx(it.purchasePrice, 9);
    assert.equal(it.priceList.find(r => r.id === it.activePriceId).price, 9);
  });
  it('una quotazione del foglio Listino su un articolo inesistente si segnala', () => {
    const a = conCommerciale();
    const rep = importa(a, { 'Listino': [{ 'Codice articolo *': 'ZZZ', Fornitore: 'SKF', 'Prezzo *': 3, 'Data *': '2026-01-01' }] }, 'buy');
    assert.match(rep.errors[0], /^Listino, riga 2: articolo "ZZZ" non trovato/);
  });
  it('su una parte a produzione interna il prezzo entra a listino ma non diventa costo, e lo dice', () => {
    const a = app(dbProgetto());
    a.eval('getItem("prt").cycle = [{ kind: "op", workCenterId: "", supplierId: "", cost: 40, note: "" }];');
    const rep = importa(a, { 'Parti': [{ Codice: 'TRN-BAS-001', 'Concetto *': 'ALBERO', 'Descrizione *': 'motore 20x100',
      'UM *': 'pz', Fornitore: 'Terzista', Prezzo: 30 }] }, 'design');
    const p = a.snapshot().items.find(i => i.type === 'parte');
    assert.equal(p.priceList.length, 1);
    assert.equal(p.unitCost, undefined, 'il costo di una parte prodotta in casa viene dal ciclo');
    assert.match(rep.warnings.join(' '), /non diventa costo/);
  });
  it('l\'import non elimina mai una quotazione che nel foglio non c\'è', () => {
    const a = app(dbAcquisti());
    importa(a, { 'Commerciali': [{ Codice: 'CMM-MEC-CUS-001', Nome: 'Cuscinetto SKF 6204', UM: 'pz' }] }, 'buy');
    assert.equal(a.snapshot().items.find(i => i.id === 'c1').priceList.length, 1);
  });
  it('le date arrivano anche come seriale Excel', () => {
    const a = conCommerciale();
    // 46032 = 10 gennaio 2026 nell'epoca di Excel (giorno 1 = 1° gennaio 1900)
    importa(a, { 'Commerciali': [{ Codice: 'C1', Nome: 'X', UM: 'pz', Prezzo: 5, 'Data prezzo': 46032 }] }, 'buy');
    assert.equal(a.snapshot().items[0].priceList[0].date, '2026-01-10');
  });
  it('i separatori delle migliaia non trasformano 1.234,56 in 1,234', () => {
    const a = conCommerciale();
    importa(a, { 'Commerciali': [{ Codice: 'C1', Nome: 'X', UM: 'pz', Prezzo: '1.234,56' }] }, 'buy');
    approx(a.snapshot().items[0].priceList[0].price, 1234.56);
  });
});

describe('Vocabolari: cosa si crea al volo e cosa no', () => {
  it('fornitori e famiglie mancanti si creano, e si contano', () => {
    const a = app(makeDb({ settings: { uoms: UOMS, uomDefault: 'pz' } }));
    const rep = importa(a, { 'Commerciali': [{ Codice: 'C1', Nome: 'X', UM: 'pz',
      Fornitore: 'Nuovo Fornitore', Prezzo: 3, Macrofamiglia: 'Idraulico', Sottofamiglia: 'Raccordi' }] }, 'buy');
    assert.equal(rep.createdSuppliers, 1);
    assert.equal(rep.createdFamilies, 1);
    assert.equal(rep.createdSubFamilies, 1);
    assert.equal(a.snapshot().families[0].kind, 'acquistato');
  });
  it('un concetto non in elenco è un errore: finirebbe dentro il nome della parte per sempre', () => {
    const a = app(dbVuotoProgetto());
    const rep = importa(a, { 'Parti': [{ 'Concetto *': 'PIASTRA', 'Descrizione *': 'x', 'UM *': 'pz' }] }, 'design');
    assert.equal(a.snapshot().items.length, 0);
    assert.equal(a.snapshot().settings.concepts.length, 1, 'nessun concetto creato');
    assert.match(rep.errors[0], /non in elenco — vedi foglio Liste/);
  });
  it('il concetto si risolve ignorando le maiuscole', () => {
    const a = app(dbVuotoProgetto());
    const rep = importa(a, { 'Parti': [{ 'Concetto *': 'albero', 'Descrizione *': 'x', 'UM *': 'pz',
      Macrofamiglia: 'Carpenteria' }] }, 'design');
    assert.deepEqual(rep.errors, []);
    assert.equal(a.snapshot().items[0].name, 'ALBERO x');
  });
  it('un\'unità di misura nuova entra in elenco ma viene segnalata: è quasi sempre un refuso', () => {
    const a = app(makeDb({ settings: { uoms: UOMS, uomDefault: 'pz' } }));
    const rep = importa(a, { 'Commerciali': [{ Codice: 'C1', Nome: 'X', UM: 'kgg' }] }, 'buy');
    assert.deepEqual(rep.createdUoms, ['kgg']);
    assert.ok(a.snapshot().settings.uoms.some(u => u.code === 'kgg'));
  });
  it('un approvvigionamento sconosciuto non diventa un approvvigionamento a caso', () => {
    const a = app(dbProgetto());
    const rep = importa(a, { 'Parti': [{ Codice: 'TRN-BAS-001', 'Concetto *': 'ALBERO',
      'Descrizione *': 'motore 20x100', 'UM *': 'pz', Approvvigionamento: 'in appalto' }] }, 'design');
    assert.equal(a.snapshot().items.find(i => i.type === 'parte').sourcing, 'make');
    assert.match(rep.errors[0], /approvvigionamento "in appalto" sconosciuto/);
  });
});

describe('Colonne assenti e colonne vuote non sono la stessa cosa', () => {
  it('una colonna che non c\'è lascia il campo com\'era', () => {
    const a = app(dbAcquisti());
    importa(a, { 'Commerciali': [{ Codice: 'CMM-MEC-CUS-001', Nome: 'Cuscinetto SKF 6204' }] }, 'buy');
    const c = a.snapshot().items.find(i => i.id === 'c1');
    assert.equal(c.notes, 'tenerne sempre a scorta');
    assert.equal(c.safetyStock, 20);
    assert.equal(c.uom, 'pz');
  });
  it('una colonna presente e vuota svuota il campo', () => {
    const a = app(dbAcquisti());
    importa(a, { 'Commerciali': [{ Codice: 'CMM-MEC-CUS-001', Nome: 'Cuscinetto SKF 6204', Note: '', 'Scorta minima': '' }] }, 'buy');
    const c = a.snapshot().items.find(i => i.id === 'c1');
    assert.equal(c.notes, '');
    assert.equal(c.safetyStock, null, 'svuotare una scorta vuol dire "non impostata", non zero');
  });
  it('il nome non si può svuotare', () => {
    const a = app(dbAcquisti());
    const rep = importa(a, { 'Commerciali': [{ Codice: 'CMM-MEC-CUS-001', Nome: '' }] }, 'buy');
    assert.equal(a.snapshot().items.find(i => i.id === 'c1').name, 'Cuscinetto SKF 6204');
    assert.match(rep.errors[0], /non può restare vuot[oa]/);
  });
});

describe('🔍 Verifica senza importare', () => {
  function fogli() {
    return { 'Commerciali': [{ Codice: '', Nome: 'Nuovo articolo', UM: 'pz', Fornitore: 'SKF', Prezzo: 4,
      Macrofamiglia: 'Meccanico', Sottofamiglia: 'Cuscinetti' }] };
  }
  it('produce lo stesso report dell\'import vero', () => {
    const a = app(dbAcquisti());
    const prova = importa(a, fogli(), 'buy', { dryRun: true });
    const vero = importa(a, fogli(), 'buy');
    assert.equal(prova.sheets[0].created, vero.sheets[0].created);
    assert.deepEqual(prova.errors, vero.errors);
  });
  it('non lascia traccia: il database è identico byte per byte', () => {
    const a = app(dbAcquisti());
    const prima = a.eval('JSON.stringify(db)');
    const rep = importa(a, fogli(), 'buy', { dryRun: true });
    assert.equal(rep.sheets[0].created, 1, 'la prova deve comunque dire cosa succederebbe');
    assert.equal(a.eval('JSON.stringify(db)'), prima);
  });
  it('non scrive su localStorage', () => {
    const a = app(dbAcquisti());
    const prima = a.storage.getItem(a.eval('DB_KEY'));
    importa(a, fogli(), 'buy', { dryRun: true });
    assert.equal(a.storage.getItem(a.eval('DB_KEY')), prima);
  });
  it('dopo la prova gli indici non puntano più agli oggetti annullati', () => {
    const a = app(dbAcquisti());
    importa(a, { 'Commerciali': [{ Codice: 'NUOVO-1', Nome: 'X', UM: 'pz' }] }, 'buy', { dryRun: true });
    assert.equal(a.eval('getItemByCode("NUOVO-1")'), undefined);
    assert.equal(a.eval('getItem("c1").name'), 'Cuscinetto SKF 6204');
    assert.equal(a.eval('getItem("c1") === db.items.find(i => i.id === "c1")'), true,
      'un indice che tiene l\'oggetto del giro annullato è peggio di nessun indice');
    assert.equal(a.eval('getSupplier("s1").name'), 'SKF');
  });
  it('non dichiara sincronizzato niente', () => {
    const a = app(dbAcquisti());
    a.eval('Store.markSynced()');
    importa(a, fogli(), 'buy', { dryRun: true });
    assert.deepEqual(JSON.parse(a.eval('JSON.stringify(Store.pendingChanges())')), {});
  });
  it('l\'anteprima elenca i codici che verrebbero creati', () => {
    const a = app(dbAcquisti());
    const rep = importa(a, fogli(), 'buy', { dryRun: true });
    assert.equal(rep.preview.length, 1);
    assert.match(rep.preview[0], /^CMM-MEC-CUS-002 — Nuovo articolo$/);
  });
});

describe('File sbagliato, file vecchio', () => {
  it('il file Progetto caricato dal pulsante Acquisti dice quale file è', () => {
    const a = app(dbProgetto());
    const rep = importa(a, workbook(app(dbProgetto()), 'design'), 'buy');
    assert.deepEqual(rep.foreign, ['Macchine', 'Gruppi', 'Sottogruppi', 'Parti']);
    assert.equal(rep.legacy, false, 'non deve nemmeno provare a leggerlo come file vecchio');
    assert.equal(a.snapshot().items.length, 4);
  });
  it('il foglio unico con colonna Tipo si legge in compatibilità', () => {
    const a = app(makeDb({ settings: { uoms: UOMS, uomDefault: 'pz' } }));
    const rep = importa(a, { 'Articoli': [
      { Tipo: 'Componente commerciale', Codice: 'C1', Nome: 'Cuscinetto', UM: 'pz', Fornitore: 'SKF', PrezzoAcquisto: 12.5 },
      { Tipo: 'Materia prima', Codice: 'M1', Nome: 'Lamiera', UM: 'kg', CostoUnitario: 1.2 },
    ] }, 'buy');
    assert.equal(rep.legacy, true);
    assert.deepEqual(rep.errors, []);
    const d = a.snapshot();
    assert.equal(d.items.length, 2);
    // Anche i file vecchi ereditano la regola nuova: il prezzo passa dal listino
    const c = d.items.find(i => i.code === 'C1');
    assert.equal(c.priceList.length, 1);
    approx(c.purchasePrice, 12.5);
    approx(d.items.find(i => i.code === 'M1').unitCost, 1.2);
  });
  it('le righe dell\'altro mestiere si saltano con un avviso, non con 500 righe rosse', () => {
    const a = app(makeDb({ settings: { uoms: UOMS, uomDefault: 'pz', concepts: [] } }));
    const rep = importa(a, { 'Articoli': [
      { Tipo: 'Commerciale', Codice: 'C1', Nome: 'Cuscinetto', UM: 'pz' },
      { Tipo: 'Macchina', Codice: 'MAC-1', Nome: 'Tornio', UM: 'pz' },
    ] }, 'buy');
    assert.deepEqual(rep.errors, []);
    assert.match(rep.warnings[0], /appartengono al file Progetto/);
    assert.equal(a.snapshot().items.length, 1);
  });
  it('una riga incollata nel foglio sbagliato viene rifiutata', () => {
    const a = app(makeDb({ settings: { uoms: UOMS, uomDefault: 'pz' } }));
    const rep = importa(a, { 'Commerciali': [{ Tipo: 'Materia prima', Codice: 'M1', Nome: 'Lamiera', UM: 'kg' }] }, 'buy');
    assert.equal(a.snapshot().items.length, 0);
    assert.match(rep.errors[0], /ma questo è il foglio Commerciali/);
  });
  it('i fogli assenti si dichiarano invece di essere trattati come vuoti', () => {
    const a = app(dbAcquisti());
    const rep = importa(a, { 'Commerciali': [] }, 'buy');
    assert.deepEqual(rep.missing, ['Materie prime', 'Listino']);
    assert.equal(a.snapshot().items.length, 2);
  });
  it('i messaggi d\'errore sono escapati: in un foglio ci può stare qualunque cosa', () => {
    const a = app(dbVuotoProgetto());
    const rep = importa(a, { 'Gruppi': [{ 'Codice macchina': '<img src=x>', Sigla: 'ABC', Nome: 'X' }] }, 'design');
    assert.ok(rep.errors[0].includes('&lt;img'), rep.errors[0]);
  });
});

describe('L\'import articoli non tocca le distinte', () => {
  it('componenti, lavorazioni e ciclo restano quelli che erano', () => {
    const a = app(dbProgetto());
    a.eval(`getItem('grp').components = [{ itemId: 'prt', qty: 2, scrapPct: 0 }];
            getItem('grp').operations = [{ workCenterId: 'w1', hours: 3 }];
            getItem('prt').cycle = [{ kind: 'op', workCenterId: 'w1', supplierId: '', cost: 12, note: '' }];`);
    importa(a, workbook(a, 'design'), 'design');
    const d = a.snapshot();
    assert.deepEqual(d.items.find(i => i.id === 'grp').components, [{ itemId: 'prt', qty: 2, scrapPct: 0 }]);
    assert.equal(d.items.find(i => i.id === 'grp').operations.length, 1);
    assert.equal(d.items.find(i => i.id === 'prt').cycle.length, 1);
  });
});

// 0.105.5: una riga con un errore restava applicata a metà, e l'import
// scavalcava il blocco degli articoli già usati.
describe('Import su articoli che ci sono già', () => {
  const foglioDi = (wb, code) => Object.keys(wb).find(n => (wb[n] || []).some(r => Object.values(r).includes(code)));
  it('una riga con un errore non cambia niente dell\'articolo', () => {
    const a = app(dbAcquisti());
    const wb = workbook(a, 'buy');
    const nome = foglioDi(wb, 'CMM-MEC-CUS-001');
    const r = wb[nome].find(x => Object.values(x).includes('CMM-MEC-CUS-001'));
    r['Descrizione *'] = 'Nome nuovo'; r['Macrofamiglia'] = 'Famiglia nuova'; r['Scorta minima'] = 'tante';
    const rep = importa(a, { [nome]: [r] }, 'buy');
    assert.ok(rep.errors.some(e => /Scorta minima/.test(e)), JSON.stringify(rep.errors));
    const c1 = JSON.parse(a.eval('JSON.stringify(getItem("c1"))'));
    assert.equal(c1.name, 'Cuscinetto SKF 6204');
    assert.equal(c1.familyId, 'f1');
    assert.equal(a.eval('db.families.length'), 2, 'nessuna famiglia creata per una riga scartata');
  });

  it('un articolo già usato tiene codice, famiglia e unità, e lo si dice', () => {
    const a = app(dbAcquisti());
    a.eval("addMovement('c1', 'carico', 5, '')");
    const wb = workbook(a, 'buy');
    const nome = foglioDi(wb, 'CMM-MEC-CUS-001');
    const r = wb[nome].find(x => Object.values(x).includes('CMM-MEC-CUS-001'));
    r['Codice'] = 'cmm-mec-cus-001'; r['Macrofamiglia'] = 'Meccanica vecchia'; r['UM *'] = 'kg'; r['Note'] = 'nota nuova';
    const rep = importa(a, { [nome]: [r] }, 'buy');
    const c1 = JSON.parse(a.eval('JSON.stringify(getItem("c1"))'));
    assert.equal(c1.code, 'CMM-MEC-CUS-001');
    assert.equal(c1.familyId, 'f1');
    assert.equal(c1.uom, 'pz');
    assert.equal(c1.notes, 'nota nuova', 'il resto si aggiorna');
    assert.equal(a.eval('db.families.length'), 2);
    assert.ok(rep.warnings.some(w => /già usato: .*famiglia.*unità di misura/.test(w)), JSON.stringify(rep.warnings));
  });
});
