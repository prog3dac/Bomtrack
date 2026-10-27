// I menu a tendina nei file Excel da importare (0.117.0).
//
// SheetJS community non scrive le convalide dati: le infila l'app riaprendo lo
// zip. Qui si scrive il file vero, con la libreria vera, e si guarda dentro:
// che ogni colonna a valori ammessi abbia la sua tendina, che punti al foglio
// nascosto giusto, e che il file resti un file che l'import rilegge uguale.

const assert = require('node:assert/strict');
const path = require('node:path');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb } = require('./fixtures.js');

const XLSX = require(path.join(__dirname, '..', 'vendor', 'xlsx.full.min.js'));

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db);
  a.asRole('admin');
  a.ctx.XLSX = XLSX;
  return a;
}
const UOMS = [{ code: 'pz', name: 'Pezzi' }, { code: 'kg', name: 'Chili' }];
function dbCompleto() {
  return makeDb({
    suppliers: [{ id: 's1', name: 'SKF', active: true }, { id: 's2', name: 'Vecchio', active: false }],
    families: [
      { id: 'f1', name: 'Meccanico', kind: 'acquistato', sigla: 'MEC', subs: [{ id: 'a', name: 'Cuscinetti', sigla: 'CUS' }, { id: 'b', name: 'Viti', sigla: 'VIT' }] },
      { id: 'f3', name: 'Elettrico', kind: 'acquistato', sigla: 'ELE', subs: [{ id: 'c', name: 'Cavi', sigla: 'CAV' }] },
      { id: 'f2', name: 'Acciaio', kind: 'materiale', sigla: 'ACC', subs: [] },
      { id: 'f4', name: 'Lamiere', kind: 'parte', sigla: 'LAM', subs: [{ id: 'd', name: 'Piegate', sigla: 'PIE' }] },
    ],
    items: [
      { id: 'c1', code: 'CMM-MEC-CUS-001', name: 'Cuscinetto', type: 'acquistato', uom: 'pz', familyId: 'f1', subFamilyId: 'a', active: true, priceList: [], priceListSeeded: true },
      { id: 'mac', code: 'TRN-S00', name: 'Tornio', type: 'macchina', uom: 'pz', sigla: 'TRN', gCodeLen: 3, gCodeType: 'alpha', incrDigitsS: 2, incrDigitsN: 3, components: [], operations: [], active: true },
      { id: 'grp', code: 'TRN-BAS-S00', name: 'Basamento', type: 'gruppo', uom: 'pz', sigla: 'BAS', machineItemId: 'mac', components: [], operations: [], active: true },
    ],
    settings: { uoms: UOMS, uomDefault: 'pz', concepts: [{ id: 'k1', name: 'ALBERO' }, { id: 'k2', name: 'PERNO' }] },
  });
}
// Il file scritto, riaperto come zip: per ogni foglio il suo XML.
function apri(bytes) {
  const zip = XLSX.CFB.read(Uint8Array.from(bytes), { type: 'array' });
  const wb = XLSX.read(Uint8Array.from(bytes), { type: 'array', bookSheets: true });
  const xml = {};
  wb.SheetNames.forEach((n, i) => {
    const p = zip.FullPaths.findIndex(x => x.endsWith(`xl/worksheets/sheet${i + 1}.xml`));
    xml[n] = new TextDecoder().decode(zip.FileIndex[p].content);
  });
  return { xml, wb: XLSX.read(Uint8Array.from(bytes), { type: 'array' }) };
}
// Le convalide di un foglio: { 'F2:F1000': { formula, stile } }
function convalide(xml) {
  const out = {};
  const re = /<dataValidation [^>]*errorStyle="(\w+)"[^>]*sqref="([^"]+)"><formula1>([^<]*)<\/formula1>/g;
  let m;
  while ((m = re.exec(xml))) out[m[2].split(':')[0]] = { stile: m[1], formula: m[3].replace(/&quot;/g, '"').replace(/&amp;/g, '&') };
  return out;
}
const file = (a, scope) => apri(a.eval(`Array.from(xlsxConTendine(catalogWorkbook(${JSON.stringify(scope)}), catTendine(${JSON.stringify(scope)})))`));
const colonna = (wb, foglio, titolo) => {
  const righe = XLSX.utils.sheet_to_json(wb.Sheets[foglio], { defval: '' });
  return righe.map(r => r[titolo]).filter(v => v !== '');
};

describe('xlsxColonna', () => {
  it('conta come Excel', () => {
    const a = app(makeDb());
    assert.deepEqual(JSON.parse(a.eval('JSON.stringify([0, 25, 26, 51, 52, 701, 702].map(xlsxColonna))')),
      ['A', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA']);
  });
});

describe('File Acquisti — le tendine', () => {
  const a = app(dbCompleto());
  const { xml, wb } = file(a, 'buy');
  const dv = convalide(xml['Commerciali']);

  it('i valori stanno in un foglio Tendine nascosto', () => {
    assert.ok(wb.SheetNames.includes('Tendine'));
    const i = wb.SheetNames.indexOf('Tendine');
    assert.equal(wb.Workbook.Sheets[i].Hidden, 1);
    assert.ok(!wb.Workbook.Sheets.some((s, j) => j !== i && s.Hidden), 'gli altri fogli restano in vista');
    assert.deepEqual(colonna(wb, 'Tendine', 'Fornitori'), ['SKF'], 'i fornitori sospesi non si propongono');
    assert.deepEqual(colonna(wb, 'Tendine', 'Macrofamiglie acquistato'), ['Meccanico [MEC]', 'Elettrico [ELE]'],
      'una volta sola, con la sigla del codice');
  });
  it('UM, famiglie, fornitore e Sì/No hanno la loro tendina', () => {
    // Codice, Descrizione, UM, UM acquisto, Fattore, Macro, Sotto, Fornitore, …
    assert.match(dv.C2.formula, /^Tendine!\$A\$2:\$A\$3$/);
    assert.ok(dv.D2, 'UM acquisto');
    assert.ok(dv.F2 && dv.G2 && dv.H2, 'macro, sotto, fornitore');
    const head = XLSX.utils.sheet_to_json(wb.Sheets['Commerciali'], { header: 1 })[0];
    const L = h => String.fromCharCode(65 + head.indexOf(h)) + '2';
    assert.ok(dv[L('Preferito')] && dv[L('Obsoleto')]);
    assert.equal(dv[L('Preferito')].stile, 'stop', 'Sì/No non ammette altro');
    assert.equal(dv[L('Fornitore')].stile, 'warning', 'un fornitore nuovo l\'import lo crea');
    assert.ok(!dv.A2 && !dv.B2, 'Codice e Descrizione si scrivono liberi');
  });
  it('la sottofamiglia propone solo quelle della macrofamiglia della riga', () => {
    assert.match(dv.G2.formula, /^OFFSET\(Tendine!\$\w+\$1,MATCH\(\$F2,Tendine!\$(\w+)\$2:\$\1\$4,0\),0,COUNTIF\(Tendine!\$\1\$2:\$\1\$4,\$F2\),1\)$/);
    // Le coppie restano raggruppate per macrofamiglia: è ciò su cui conta OFFSET
    assert.deepEqual(colonna(wb, 'Tendine', 'Sottofamiglie acquistato (chiave)'), ['Meccanico [MEC]', 'Meccanico [MEC]', 'Elettrico [ELE]']);
    assert.deepEqual(colonna(wb, 'Tendine', 'Sottofamiglie acquistato'), ['Cuscinetti [CUS]', 'Viti [VIT]', 'Cavi [CAV]']);
  });
  it('le materie prime hanno le loro famiglie, non quelle dei commerciali', () => {
    const m = convalide(xml['Materie prime']);
    assert.match(m.F2.formula, /^Tendine!/);
    assert.notEqual(m.F2.formula, dv.F2.formula);
    assert.ok(!m.G2, 'una macrofamiglia senza sottofamiglie non ha una lista da proporre');
  });
  it('non c\'è più il foglio Listino', () => {
    assert.ok(!wb.SheetNames.includes('Listino'));
  });
  it('Liste e Istruzioni restano senza tendine, e il blocco sta prima di ignoredErrors', () => {
    assert.ok(!/dataValidations/.test(xml['Liste']));
    assert.ok(xml['Liste']);
    assert.ok(!/dataValidations/.test(xml['Istruzioni']));
    const x = xml['Commerciali'];
    assert.ok(x.indexOf('<dataValidations') > x.indexOf('</sheetData>'));
    if (x.includes('<ignoredErrors')) assert.ok(x.indexOf('<dataValidations') < x.indexOf('<ignoredErrors'));
  });
  it('il file si reimporta senza errori: il foglio Tendine non disturba', () => {
    const byName = {};
    wb.SheetNames.forEach(n => { byName[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' }); });
    const b = app(makeDb({ settings: { uoms: UOMS, uomDefault: 'pz' } }));
    const rep = JSON.parse(b.eval(`JSON.stringify(importCatalogSheets(${JSON.stringify(byName)}, 'buy', { dryRun: true }))`));
    assert.deepEqual(rep.errors, []);
    assert.equal(rep.legacy, false);
  });
});

describe('File Progetto — le tendine', () => {
  const a = app(dbCompleto());
  const { xml, wb } = file(a, 'design');
  const parti = convalide(xml['Parti']);
  const head = XLSX.utils.sheet_to_json(wb.Sheets['Parti'], { header: 1 })[0];
  const L = h => String.fromCharCode(65 + head.indexOf(h)) + '2';

  it('concetto bloccante: l\'import non crea concetti', () => {
    assert.equal(parti[L('Concetto *')].stile, 'stop');
    assert.deepEqual(colonna(wb, 'Tendine', 'Concetti'), ['ALBERO', 'PERNO']);
  });
  it('macchina e gruppo puntano ai codici dei fogli dello stesso file', () => {
    assert.match(parti[L('Codice macchina')].formula, /^Macchine!\$A\$2:\$A\$\d+$/);
    assert.match(parti[L('Codice gruppo')].formula, /^Gruppi!\$A\$2:\$A\$\d+$/);
    assert.match(convalide(xml['Gruppi']).B2.formula, /^Macchine!\$A\$2/);
  });
  it('approvvigionamento, famiglie delle parti e tipo sigla gruppo', () => {
    assert.ok(parti[L('Approvvigionamento')]);
    assert.ok(parti[L('Macrofamiglia')] && parti[L('Sottofamiglia')]);
    const m = convalide(xml['Macchine']);
    const hm = XLSX.utils.sheet_to_json(wb.Sheets['Macchine'], { header: 1 })[0];
    assert.ok(m[String.fromCharCode(65 + hm.indexOf('Tipo sigla gruppo')) + '2']);
    assert.deepEqual(colonna(wb, 'Tendine', 'Tipo sigla gruppo'), ['Alfabetico', 'Numerico', 'Alfanumerico']);
  });
});

describe('xlsxInserisciConvalide', () => {
  const a = app(makeDb());
  it('rispetta l\'ordine degli elementi del foglio', () => {
    const x = a.eval(`xlsxInserisciConvalide('<worksheet><sheetData/><autoFilter ref="A1:B2"/><pageMargins left="1"/></worksheet>', ['<dataValidation/>'])`);
    assert.equal(x, '<worksheet><sheetData/><autoFilter ref="A1:B2"/><dataValidations count="1"><dataValidation/></dataValidations><pageMargins left="1"/></worksheet>');
  });
  it('senza elementi dopo, in coda al foglio', () => {
    const x = a.eval(`xlsxInserisciConvalide('<worksheet><sheetData/></worksheet>', ['<x/>'])`);
    assert.equal(x, '<worksheet><sheetData/><dataValidations count="1"><x/></dataValidations></worksheet>');
  });
  it('un elenco vuoto non scrive una tendina vuota', () => {
    const b = app(makeDb({ settings: { uoms: [], concepts: [] } }));
    const { xml } = file(b, 'buy');
    const dv = convalide(xml['Commerciali']);
    assert.ok(!dv.C2, 'nessuna UM: niente tendina sull\'UM');
  });
});

describe('Impostazioni — le tendine', () => {
  it('Attivo, Ruolo, Tipo e Predefinita', () => {
    const a = app(dbCompleto());
    const bytes = a.eval(`(() => { const wb = XLSX.utils.book_new();
      settingsSheets().forEach(sh => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sh.aoa), sh.name));
      return Array.from(xlsxConTendine(wb, settingsTendine())); })()`);
    const { xml } = apri(bytes);
    const u = convalide(xml['Utenti']);
    assert.ok(u.D2 && u.F2, 'Ruolo e Attivo');
    assert.ok(Object.keys(convalide(xml['Fornitori'])).length === 1);
    assert.ok(Object.keys(convalide(xml['Condizioni offerta'])).length === 2);
  });
});
