// Il ponte binario: un file .xlsx vero, scritto e riletto dalla libreria vera.
//
// Tutti gli altri test sull'import lavorano su righe **già lette** — l'array di
// oggetti che `readWorkbook` consegna — perché il binario è di SheetJS e non è
// nostro. È la scelta giusta, ma lascia scoperto proprio il punto in cui si
// cambia libreria: se una nuova versione scrivesse o rileggesse le celle in
// modo diverso, nessuno se ne accorgerebbe fino al primo file sbagliato in mano
// a un fornitore.
//
// Qui si chiude quel buco. La libreria è nel repo (`vendor/`, vedi il LEGGIMI)
// e si carica anche in Node, quindi il giro si può fare per intero: esportare
// come fa l'app, scrivere il file, rileggerlo **con le stesse chiamate di
// `readWorkbook`**, reimportarlo, e ritrovare l'articolo com'era.

const assert = require('node:assert/strict');
const path = require('node:path');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb } = require('./fixtures.js');

const XLSX = require(path.join(__dirname, '..', 'vendor', 'xlsx.full.min.js'));

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || makeDb());
  a.asRole('admin');
  return a;
}
// Scrive un vero .xlsx in memoria dai fogli che l'app esporta.
function scrivi(sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(sh => {
    const ws = XLSX.utils.aoa_to_sheet(sh.aoa);
    if (sh.cols) ws['!cols'] = sh.cols;
    XLSX.utils.book_append_sheet(wb, ws, sh.name);
  });
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
// Le stesse due chiamate di readWorkbook(), su un buffer invece che su un File.
function rileggi(buf) {
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const out = {};
  wb.SheetNames.forEach(n => { out[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' }); });
  return out;
}

describe('La libreria Excel nel repo', () => {
  it('è la 0.20 o più recente: le due CVE della 0.18.5 sono a monte', () => {
    const [maj, min] = String(XLSX.version).split('.').map(Number);
    assert.ok(maj > 0 || min >= 20, `versione trovata: ${XLSX.version}`);
  });

  it('ha tutte le funzioni che l\'app le chiede', () => {
    ['read', 'write', 'writeFile'].forEach(f => assert.equal(typeof XLSX[f], 'function', f));
    ['aoa_to_sheet', 'sheet_to_json', 'json_to_sheet', 'book_new', 'book_append_sheet', 'encode_range']
      .forEach(f => assert.equal(typeof XLSX.utils[f], 'function', 'utils.' + f));
  });
});

describe('Giro completo su un file .xlsx vero', () => {
  // Un articolo con dentro tutto ciò che si rompe passando per un file:
  // accenti, virgolette, un trattino lungo, un decimale e una data.
  const dbCon = () => makeDb({
    suppliers: [{ id: 's1', name: 'SKF Italia', active: true }],
    settings: { uoms: [{ code: 'kg', name: 'Chilogrammi' }, { code: 'pz', name: 'Pezzi' }], uomDefault: 'pz' },
    items: [{
      id: 'm1', code: 'ACC-S235-20', name: 'Piatto «S235» 20×100 — laminato a caldo',
      type: 'materiale', uom: 'kg', unitCost: 3.25, active: true,
      notes: 'Tolleranza h9; cert. 3.1',
      priceList: [{ id: 'p1', supplierId: 's1', price: 3.25, minQty: 50, leadDays: 21,
        code: 'SKF/AC-20', desc: 'Piatto acciaio', date: '2026-01-15', rfqId: null, note: '' }],
      activePriceId: 'p1', supplierId: 's1',
    }],
  });

  it('esportare, scrivere il file, rileggerlo e reimportarlo non cambia niente', () => {
    const a = app(dbCon());
    const sheets = JSON.parse(a.eval('JSON.stringify(catalogSheets("buy"))'));
    const riletto = rileggi(scrivi(sheets));

    // Il file rileggibile ha i fogli che l'app si aspetta di trovare.
    assert.ok(Object.keys(riletto).length, 'nessun foglio riletto');
    const rep = JSON.parse(a.eval(
      `JSON.stringify(importCatalogSheets(${JSON.stringify(riletto)}, "buy", {}))`));
    assert.equal(rep.errors.length, 0, 'errori: ' + JSON.stringify(rep.errors));

    const it = JSON.parse(a.eval('JSON.stringify(getItemByCode("ACC-S235-20"))'));
    assert.equal(it.name, 'Piatto «S235» 20×100 — laminato a caldo', 'accenti e simboli sopravvivono al binario');
    assert.equal(it.uom, 'kg');
    assert.equal(it.notes, 'Tolleranza h9; cert. 3.1');
    assert.equal(a.eval('db.items.length'), 1, 'reimportare lo stesso file non duplica l\'articolo');
  });

  it('i numeri restano numeri, non testo che somiglia a un numero', () => {
    const a = app(dbCon());
    const sheets = JSON.parse(a.eval('JSON.stringify(catalogSheets("buy"))'));
    const riletto = rileggi(scrivi(sheets));
    const foglio = Object.values(riletto).find(righe => righe.some(r => r['Codice'] === 'ACC-S235-20'));
    const riga = foglio.find(r => r['Codice'] === 'ACC-S235-20');
    const prezzo = Object.keys(riga).find(k => /prezzo/i.test(k));
    assert.equal(typeof riga[prezzo], 'number',
      'se tornasse stringa, un foglio con la virgola decimale entrerebbe a zero');
  });

  it('una cella vuota resta vuota e non diventa la stringa "undefined"', () => {
    const buf = scrivi([{ name: 'Prova', aoa: [['Codice', 'Nota'], ['X-1', '']] }]);
    const righe = rileggi(buf).Prova;
    assert.equal(righe[0]['Nota'], '', 'defval: "" è ciò su cui contano tutti i lettori di riga');
  });
});

// ═══════════════════════════════════════════════════════════
//  La codifica di un .csv
// ═══════════════════════════════════════════════════════════
// Un .xlsx porta la codifica dentro di sé; un .csv no. SheetJS ne indovina due
// su tre — la CP1252 di Excel italiano e l'UTF-8 con BOM — e sbaglia la terza,
// l'UTF-8 nudo, che legge come CP1252: «Perché» diventa «PerchÃ©». Qui si prova
// la scelta delle opzioni **e** il risultato che quella scelta produce passando
// dalla libreria vera.
describe('CSV — la codifica che il file non dichiara', () => {
  const TESTO = 'Codice;Descrizione\nA1;Perché 123';
  const utf8 = Buffer.from(TESTO, 'utf8');
  const bom = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), utf8]);
  const cp1252 = Buffer.from(TESTO, 'latin1');

  // Le stesse due chiamate di leggiFile(), su un buffer invece che su un File.
  function come(nome, buf) {
    const a = app();
    const bytes = new Uint8Array(buf);
    const opt = JSON.parse(a.eval('JSON.stringify(opzioniLettura({ name: '
      + JSON.stringify(nome) + ' }, new Uint8Array(' + JSON.stringify(Array.from(bytes)) + ')))'));
    const wb = XLSX.read(bytes, opt);
    const righe = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    return { opt, desc: righe[0] && righe[0].Descrizione };
  }

  it('UTF-8 senza BOM si riconosce dai byte e si legge giusto', () => {
    const r = come('articoli.csv', utf8);
    assert.equal(r.opt.codepage, 65001);
    assert.equal(r.desc, 'Perché 123', 'senza, entrava a catalogo come PerchÃ©');
  });

  it('UTF-8 con BOM si lascia decidere alla libreria', () => {
    const r = come('articoli.csv', bom);
    assert.equal(r.opt.codepage, undefined, 'il BOM lo dice già');
    assert.equal(r.desc, 'Perché 123');
  });

  it('CP1252, che è il salvataggio di serie di Excel italiano', () => {
    const r = come('articoli.csv', cp1252);
    assert.equal(r.opt.codepage, undefined);
    assert.equal(r.desc, 'Perché 123');
  });

  it('un file di soli caratteri ASCII non ha niente da decidere', () => {
    const r = come('articoli.csv', Buffer.from('Codice;Descrizione\nA1;Bullone', 'utf8'));
    assert.equal(r.opt.codepage, undefined);
    assert.equal(r.desc, 'Bullone');
  });

  it('un .xlsx non passa da questa domanda: la codifica ce l-ha dentro', () => {
    const a = app();
    const opt = JSON.parse(a.eval('JSON.stringify(opzioniLettura({ name: "articoli.xlsx" }, new Uint8Array([1,2,3])))'));
    assert.deepEqual(opt, { type: 'array' });
  });

  it('il separatore lo indovina la libreria, qualunque sia', () => {
    [';', ',', '\t'].forEach(sep => {
      const buf = Buffer.from('Codice' + sep + 'Descrizione\nA1' + sep + 'Bullone', 'utf8');
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
      const righe = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      assert.equal(righe[0].Descrizione, 'Bullone', 'separatore ' + JSON.stringify(sep));
    });
  });
});

// ═══════════════════════════════════════════════════════════
//  I file che l'app scrive per farli ricompilare
// ═══════════════════════════════════════════════════════════
// Template distinte ed export impostazioni finiscono su disco, e per questo non
// erano provati da nessuno. Ma la parte che scriviamo noi è il **contenuto**, e
// quella si può leggere: si intercetta la scrittura invece di produrre un file.
//
// Conta perché un template è un contratto con chi lo compila: se le sue colonne
// non sono quelle che l'import poi rilegge, chi lo usa scopre lo scarto a file
// caricato, riga per riga.
function conXlsx(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || makeDb());
  a.asRole('admin');
  a.ctx.XLSX = XLSX;   // la libreria vera dentro il contesto dell'app
  return a;
}
// Esegue una funzione che scrive un file e restituisce il workbook che avrebbe scritto.
function workbookDi(a, chiamata) {
  const wb = a.eval(`(() => {
    let visto = null;
    const vero = XLSX.writeFile, veroTendine = scriviXlsxConTendine;
    // Dalla 0.117.0 i file da ricompilare escono con le tendine, da qui.
    XLSX.writeFile = (w) => { visto = w; };
    scriviXlsxConTendine = (w) => { visto = w; };
    try { ${chiamata}; } finally { XLSX.writeFile = vero; scriviXlsxConTendine = veroTendine; }
    return visto;
  })()`);
  return {
    fogli: wb.SheetNames,
    aoa: nome => XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: '' }),
    righe: nome => XLSX.utils.sheet_to_json(wb.Sheets[nome], { defval: '' }),
  };
}

describe('Template distinte', () => {
  it('ha i due fogli, dati e istruzioni', () => {
    const w = workbookDi(conXlsx(), 'downloadBomTemplate()');
    assert.deepEqual(w.fogli, ['Distinte', 'Istruzioni']);
  });

  it('le sue colonne sono quelle che importBom rilegge', () => {
    const a = conXlsx();
    const w = workbookDi(a, 'downloadBomTemplate()');
    const head = w.aoa('Distinte')[0];
    assert.deepEqual(head, ['CodicePadre', 'CodiceFiglio', 'Qta', 'Scarto%']);
    // La verifica vera: pick() deve trovare ognuna di queste intestazioni.
    const riga = {};
    head.forEach((h, i) => { riga[h] = ['A', 'B', 2, 5][i]; });
    const letto = JSON.parse(a.eval('JSON.stringify({'
      + ' padre: pick(' + JSON.stringify(riga) + ", 'CodicePadre', 'Padre', 'Parent'),"
      + ' figlio: pick(' + JSON.stringify(riga) + ", 'CodiceFiglio', 'Figlio', 'Child', 'Componente'),"
      + ' qta: numOr(pick(' + JSON.stringify(riga) + ", 'Qta', 'Quantità', 'Qty', 'Quantita'), 1),"
      + ' scarto: numOr(pick(' + JSON.stringify(riga) + ", 'Scarto%', 'Scarto', 'ScrapPct'), 0) })"));
    assert.deepEqual(letto, { padre: 'A', figlio: 'B', qta: 2, scarto: 5 },
      'un template che l-import non sa rileggere è un contratto rotto');
  });

  it('le righe d-esempio sono complete e coi numeri come numeri', () => {
    const w = workbookDi(conXlsx(), 'downloadBomTemplate()');
    const righe = w.aoa('Distinte').slice(1);
    assert.ok(righe.length >= 1);
    righe.forEach(r => {
      assert.equal(r.length, 4);
      assert.equal(typeof r[2], 'number', 'la quantità è un numero, non testo che gli somiglia');
      assert.equal(typeof r[3], 'number');
    });
  });

  it('le istruzioni dicono la regola che sorprende', () => {
    const w = workbookDi(conXlsx(), 'downloadBomTemplate()');
    const testo = JSON.stringify(w.aoa('Istruzioni'));
    assert.match(testo, /SOSTITUITI/, 'importare sostituisce i componenti del padre: va detto nel file');
    assert.match(testo, /cicliche/);
  });
});

describe('Export impostazioni — il file vero', () => {
  it('scrive un foglio per scheda, più le istruzioni', () => {
    const w = workbookDi(conXlsx(), 'exportSettingsXlsx()');
    ['Fornitori', 'Clienti', 'Utenti', 'Centri di lavoro', 'Istruzioni']
      .forEach(n => assert.ok(w.fogli.includes(n), 'foglio mancante: ' + n));
  });

  it('nessuna password finisce nel file', () => {
    const a = conXlsx(makeDb({ users: [{ id: 'u1', name: 'Test', email: 't@t.it', role: 'admin',
      active: true, passwordHash: 'SEGRETO-HASH', passwordSalt: 'SEGRETO-SALT' }] }));
    const w = workbookDi(a, 'exportSettingsXlsx()');
    const tutto = JSON.stringify(w.fogli.map(n => w.aoa(n)));
    assert.doesNotMatch(tutto, /SEGRETO/, 'il file gira per posta: le credenziali no');
  });

  it('il giro completo: quello che esce si può far rientrare', () => {
    const a = conXlsx(makeDb({
      suppliers: [{ id: 's1', name: 'Rossi', referente: 'Anna', active: true, province: 'MO' }],
      customers: [{ id: 'c1', name: 'Bianchi', phone: '051', active: false }],
      workCenters: [{ id: 'w1', name: 'Tornitura', hourlyRate: 42.5, active: false }],
    }));
    const w = workbookDi(a, 'exportSettingsXlsx()');
    const perNome = {};
    w.fogli.forEach(n => { perNome[n] = w.righe(n); });

    // Si riparte da un database vuoto e si reimporta il file appena scritto.
    const b = conXlsx(makeDb({ suppliers: [], customers: [], workCenters: [] }));
    b.eval('importSettingsSheets(' + JSON.stringify(perNome) + ')');
    const db = b.snapshot();
    assert.equal(db.suppliers.length, 1);
    assert.equal(db.suppliers[0].referente, 'Anna');
    assert.equal(db.suppliers[0].province, 'MO');
    assert.equal(db.customers[0].name, 'Bianchi');
    assert.equal(db.customers[0].phone, '051');
    assert.equal(db.customers[0].active, false, 'lo stato sospeso sopravvive al giro');
    assert.equal(db.workCenters[0].hourlyRate, 42.5);
    assert.equal(db.workCenters[0].active, false, 'e anche quello dei centri di lavoro');
  });

  it('il ruolo lettore non esporta: nel file ci sono gli utenti', () => {
    const a = conXlsx();
    a.asRole('lettore');
    const scritto = a.eval(`(() => {
      let visto = null;
      const vero = XLSX.writeFile;
      XLSX.writeFile = (w) => { visto = w; };
      try { exportSettingsXlsx(); } finally { XLSX.writeFile = vero; }
      return visto === null;
    })()`);
    assert.equal(scritto, true, 'nessun file scritto');
  });
});
