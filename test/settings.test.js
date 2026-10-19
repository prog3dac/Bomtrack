// Impostazioni di Gestione ⇄ Excel: un foglio per scheda.
//
// Come per l'import massivo, qui si verifica la logica su righe già lette —
// l'array di oggetti che `readWorkbook` consegna, chiavi = intestazioni del
// foglio. Il binario xlsx è di SheetJS e non è nostro.
//
// Quello che è nostro, e che qui si fissa: che l'esportazione contenga davvero
// tutte le schede (e nessuna password), che il file esportato si possa
// reimportare ottenendo lo stesso stato, che l'import non cancelli mai niente e
// che le due invarianti degli utenti (almeno un amministratore attivo, non ci si
// tocca da soli) valgano anche quando la modifica arriva da un foglio.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, wc } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || makeDb());
  a.asRole('admin');
  return a;
}
// Un foglio come lo consegna SheetJS: intestazioni in riga 1, celle vuote a ''
function aoaToRows(aoa) {
  const head = aoa[0] || [];
  return aoa.slice(1).map(r => {
    const o = {};
    head.forEach((k, i) => { o[k] = r[i] === undefined || r[i] === null ? '' : r[i]; });
    return o;
  });
}
function sheets(a) { return JSON.parse(a.eval('JSON.stringify(settingsSheets())')); }
function sheetByName(a, name) { return sheets(a).find(s => s.name === name); }
function rowsOf(a, name) { return aoaToRows(sheetByName(a, name).aoa); }
// L'intero file, pronto per essere reimportato
function workbook(a) {
  const out = {};
  sheets(a).forEach(s => { out[s.name] = aoaToRows(s.aoa); });
  return out;
}
function importa(a, byName) {
  return JSON.parse(a.eval('JSON.stringify(importSettingsSheets(' + JSON.stringify(byName) + '))'));
}

// Un database con qualcosa in ogni scheda: è lo scenario che l'export deve
// portare via per intero.
function dbPieno() {
  return makeDb({
    suppliers: [{ id: 's1', name: 'Rossi Acciai', referente: 'Mario', email: 'm@rossi.it', phone: '059',
      vat: 'IT01', street: 'Via Roma', streetNumber: '5', zip: '41100', city: 'Modena', province: 'MO',
      country: 'Italia', defaultPayment: 'Bonifico 30gg', defaultTransport: 'Porto franco', active: true }],
    workCenters: [wc('w1', 45)],
    families: [
      { id: 'f1', name: 'Acciaio', kind: 'materiale', sigla: 'ACC', subs: [{ id: 'sf1', name: 'Lamiere', sigla: 'LAM' }] },
      { id: 'f2', name: 'Idraulico', kind: 'acquistato', sigla: 'IDR', subs: [] },
    ],
    users: [{ id: 'u1', name: 'Andrea', email: 'a@a.it', username: 'andrea', role: 'admin', color: '#3A7BE8',
      active: true, passwordHash: 'HASH-SEGRETO', passwordSalt: 'SALE-SEGRETO' }],
    settings: {
      overheadPct: 12, marginPct: 20, currency: '$', codeDigits: 4,
      codePrefixAcquistato: 'CMM', codePrefixMateriale: 'MAT', codePrefixParte: 'PRT',
      sessionDays: 15, partSourcingDefault: 'make',
      company: { name: 'Officina Srl', referente: 'Luca', email: 'info@off.it', phone: '0591',
        vat: 'IT99', street: 'Via Emilia', streetNumber: '10', zip: '41012', city: 'Carpi', province: 'MO', country: 'Italia' },
      transportOptions: ['Porto franco', 'EXW'], transportDefault: 'EXW',
      paymentOptions: ['Bonifico 30gg'], paymentDefault: 'Bonifico 30gg',
      uoms: [{ code: 'pz', name: 'Pezzi' }, { code: 'kg', name: 'Chilogrammi' }], uomDefault: 'kg',
      concepts: [{ id: 'c1', name: 'ALBERO' }],
    },
  });
}

describe('Export impostazioni — un foglio per scheda di Gestione', () => {
  const a = app(dbPieno());
  const nomi = sheets(a).map(s => s.name);

  it('esporta tutte le schede di Gestione, nessuna esclusa', () => {
    assert.deepEqual(nomi, ['Azienda', 'Utenti', 'Fornitori', 'Clienti', 'Condizioni offerta',
      'Famiglie commerciali', 'Famiglie materie prime', 'Famiglie parti',
      'Concetti', 'Centri di lavoro', 'Unità di misura', 'Impostazioni']);
  });
  it('i dati azienda escono come coppie campo/valore', () => {
    const r = rowsOf(a, 'Azienda');
    assert.equal(r.find(x => x.Campo === 'Ragione sociale').Valore, 'Officina Srl');
    assert.equal(r.find(x => x.Campo === 'Città').Valore, 'Carpi');
  });
  it('le famiglie stanno in tre fogli, uno per ambito: l\'ambito è il foglio', () => {
    // Una riga per sottofamiglia; la macrofamiglia senza sottofamiglie resta,
    // altrimenti sparirebbe dal file e il round-trip la perderebbe.
    assert.deepEqual(rowsOf(a, 'Famiglie materie prime').map(x => [x.Macrofamiglia, x.Sottofamiglia]),
      [['Acciaio', 'Lamiere']]);
    assert.deepEqual(rowsOf(a, 'Famiglie commerciali').map(x => [x.Macrofamiglia, x.Sottofamiglia]),
      [['Idraulico', '']]);
    assert.deepEqual(rowsOf(a, 'Famiglie parti').map(x => x.Macrofamiglia), []);
    assert.ok(!sheetByName(a, 'Famiglie commerciali').aoa[0].includes('Ambito'),
      'con un foglio per ambito la colonna Ambito è una colonna da sbagliare in più');
  });
  it('la voce predefinita è marcata, nelle unità e nelle condizioni', () => {
    assert.equal(rowsOf(a, 'Unità di misura').find(x => x.Codice === 'kg').Predefinita, 'Sì');
    assert.equal(rowsOf(a, 'Unità di misura').find(x => x.Codice === 'pz').Predefinita, '');
    assert.equal(rowsOf(a, 'Condizioni offerta').find(x => x.Voce === 'EXW').Predefinita, 'Sì');
  });
  it('le password non escono dal database, in nessuna colonna', () => {
    const testo = JSON.stringify(sheetByName(a, 'Utenti'));
    assert.ok(!testo.includes('HASH-SEGRETO'), 'hash esportato');
    assert.ok(!testo.includes('SALE-SEGRETO'), 'salt esportato');
    assert.ok(!/password/i.test(testo), 'colonna password nel foglio');
  });
  it('i parametri escono con l\'etichetta che si legge in Impostazioni', () => {
    const r = rowsOf(a, 'Impostazioni');
    assert.equal(r.find(x => x.Parametro === 'Margine / markup (%)').Valore, 20);
    assert.equal(r.find(x => x.Parametro === 'Simbolo valuta').Valore, '$');
    assert.equal(r.find(x => x.Parametro === 'Approvvigionamento parte (default)').Valore, 'make');
  });
});

describe('Round-trip — il file esportato si ricarica su una postazione nuova', () => {
  const sorgente = app(dbPieno());
  const file = workbook(sorgente);
  const nuova = app();            // database vuoto: è la postazione appena installata
  const rep = importa(nuova, file);
  const dopo = nuova.snapshot();

  it('non segnala errori su un file che ha prodotto lui stesso', () => {
    assert.deepEqual(rep.errors, []);
    assert.deepEqual(rep.missing, []);
  });
  it('rimette dati azienda e parametri', () => {
    assert.equal(dopo.settings.company.name, 'Officina Srl');
    assert.equal(dopo.settings.company.province, 'MO');
    assert.equal(dopo.settings.marginPct, 20);
    assert.equal(dopo.settings.codeDigits, 4);
    assert.equal(dopo.settings.currency, '$');
    assert.equal(dopo.settings.partSourcingDefault, 'make');
    assert.equal(dopo.settings.sessionDays, 15);
  });
  it('rimette fornitori completi di indirizzo e condizioni', () => {
    assert.equal(dopo.suppliers.length, 1);
    const f = dopo.suppliers[0];
    assert.equal(f.name, 'Rossi Acciai');
    assert.equal(f.city, 'Modena');
    assert.equal(f.defaultPayment, 'Bonifico 30gg');
  });
  it('rimette famiglie con sigle, sottofamiglie e ambito', () => {
    const acc = dopo.families.find(f => f.name === 'Acciaio');
    assert.equal(acc.kind, 'materiale');
    assert.equal(acc.sigla, 'ACC');
    assert.deepEqual(acc.subs.map(s => [s.name, s.sigla]), [['Lamiere', 'LAM']]);
    assert.equal(dopo.families.find(f => f.name === 'Idraulico').kind, 'acquistato');
  });
  it('rimette concetti, centri di lavoro, unità e condizioni con i predefiniti', () => {
    assert.deepEqual(dopo.settings.concepts.map(c => c.name), ['ALBERO']);
    assert.deepEqual(dopo.workCenters.map(w => [w.name, w.hourlyRate]), [['CDL w1', 45]]);
    assert.equal(dopo.settings.uomDefault, 'kg');
    assert.equal(dopo.settings.transportDefault, 'EXW');
    assert.deepEqual(dopo.settings.paymentOptions, ['Bonifico 30gg']);
  });
  it('ricrea gli utenti, ma senza password: nessuno entra con un foglio', () => {
    const u = dopo.users.find(x => x.email === 'a@a.it');
    assert.equal(u.name, 'Andrea');
    assert.equal(u.role, 'admin');
    assert.equal(u.passwordHash, undefined);
    assert.equal(u.passwordSalt, undefined);
    assert.equal(nuova.eval('verifyPassword(getUser(' + JSON.stringify(u.id) + '), "")'), false);
  });
  it('reimportare lo stesso file una seconda volta non duplica niente', () => {
    const rep2 = importa(nuova, file);
    const dopo2 = nuova.snapshot();
    assert.equal(dopo2.suppliers.length, 1);
    assert.equal(dopo2.families.length, 2);
    assert.equal(dopo2.families.find(f => f.name === 'Acciaio').subs.length, 1);
    assert.equal(dopo2.users.length, 1);
    assert.equal(dopo2.settings.uoms.length, 2);
    assert.equal(rep2.sheets.reduce((n, s) => n + s.created, 0), 0);
  });
});

describe('Import additivo — aggiorna e crea, non cancella mai', () => {
  it('ciò che non è nel foglio resta dov\'è', () => {
    const a = app(dbPieno());
    importa(a, { Fornitori: [{ Nome: 'Bianchi Srl', 'Città': 'Bologna' }] });
    const d = a.snapshot();
    assert.equal(d.suppliers.length, 2, 'il fornitore esistente è sparito');
    assert.ok(d.suppliers.find(s => s.name === 'Rossi Acciai'));
    assert.equal(d.suppliers.find(s => s.name === 'Bianchi Srl').city, 'Bologna');
  });
  it('un foglio assente viene saltato e dichiarato, non trattato come vuoto', () => {
    const a = app(dbPieno());
    const rep = importa(a, { Concetti: [{ Concetto: 'flangia' }] });
    assert.deepEqual(rep.sheets.map(s => s.name), ['Concetti']);
    assert.ok(rep.missing.includes('Fornitori'));
    assert.equal(a.snapshot().suppliers.length, 1);
  });
  it('i concetti entrano sempre in maiuscolo, senza doppioni', () => {
    const a = app(dbPieno());
    importa(a, { Concetti: [{ Concetto: 'flangia' }, { Concetto: 'albero' }, { Concetto: 'FLANGIA' }] });
    assert.deepEqual(a.snapshot().settings.concepts.map(c => c.name), ['ALBERO', 'FLANGIA']);
  });
  it('una colonna assente lascia il campo com\'era, una vuota lo svuota', () => {
    const a = app(dbPieno());
    importa(a, { Fornitori: [{ Nome: 'Rossi Acciai', Telefono: '0592222' }] });
    assert.equal(a.snapshot().suppliers[0].city, 'Modena', 'colonna assente ha cancellato il campo');
    assert.equal(a.snapshot().suppliers[0].phone, '0592222');
    importa(a, { Fornitori: [{ Nome: 'Rossi Acciai', 'Città': '' }] });
    assert.equal(a.snapshot().suppliers[0].city, '', 'colonna vuota non ha svuotato il campo');
  });
  it('l\'unità di misura si aggiunge, e il codice diverso è un\'unità nuova (non una rinomina)', () => {
    const a = app(dbPieno());
    importa(a, { 'Unità di misura': [{ Codice: 'm', Descrizione: 'Metri', Predefinita: 'Sì' }] });
    const s = a.snapshot().settings;
    assert.deepEqual(s.uoms.map(u => u.code), ['pz', 'kg', 'm']);
    assert.equal(s.uomDefault, 'm');
  });
  it('il foglio riconosce il nome anche con accenti e maiuscole diverse', () => {
    const a = app(dbPieno());
    const rep = importa(a, { 'UNITA DI MISURA': [{ Codice: 'm', Descrizione: 'Metri' }] });
    assert.deepEqual(rep.sheets.map(s => s.name), ['Unità di misura']);
  });
  it('i fogli sconosciuti (Istruzioni compreso) si ignorano senza rumore', () => {
    const a = app(dbPieno());
    const rep = importa(a, { Istruzioni: [{ Foglio: 'Azienda' }], Concetti: [{ Concetto: 'PERNO' }] });
    assert.deepEqual(rep.errors, []);
    assert.deepEqual(rep.sheets.map(s => s.name), ['Concetti']);
  });
});

describe('Famiglie — il vecchio foglio unico con la colonna Ambito si legge ancora', () => {
  // È il formato dei file esportati fino alla 0.34.0: chi ne ha uno sul disco
  // deve poterlo ricaricare senza rifarlo a mano.
  it('l\'ambito arriva dalla colonna, scritto come etichetta o come chiave interna', () => {
    const a = app();
    const rep = importa(a, { Famiglie: [
      { Ambito: 'Materie prime', Macrofamiglia: 'Acciaio' },
      { Ambito: 'acquistato', Macrofamiglia: 'Idraulico' },
      { Ambito: 'Parti', Macrofamiglia: 'Carpenteria' },
    ] });
    assert.deepEqual(a.snapshot().families.map(f => f.kind), ['materiale', 'acquistato', 'parte']);
    assert.ok(rep.sheets.some(s => s.name === 'Famiglie (formato precedente)'), 'il report deve dirlo');
  });
  it('un ambito inventato non diventa un ambito a caso', () => {
    const a = app();
    const rep = importa(a, { Famiglie: [{ Ambito: 'bulloneria', Macrofamiglia: 'Viti' }] });
    assert.equal(a.snapshot().families.length, 0);
    assert.match(rep.errors[0], /ambito non valido/);
  });
  it('con il foglio unico i tre fogli nuovi non risultano mancanti', () => {
    const a = app();
    const rep = importa(a, { Famiglie: [{ Ambito: 'Parti', Macrofamiglia: 'Carpenteria' }] });
    assert.ok(!rep.missing.some(n => n.indexOf('Famiglie') === 0), rep.missing.join(', '));
  });
});

describe('Import impostazioni — le righe sbagliate si segnalano, non si indovinano', () => {
  it('ogni foglio famiglie porta il suo ambito, senza chiederlo alla riga', () => {
    const a = app();
    importa(a, {
      'Famiglie materie prime': [{ Macrofamiglia: 'Acciaio', 'Sigla macro': 'ACC' }],
      'Famiglie commerciali': [{ Macrofamiglia: 'Idraulico' }],
      'Famiglie parti': [{ Macrofamiglia: 'Carpenteria', Sottofamiglia: 'Fiancate' }],
    });
    const f = a.snapshot().families;
    // I fogli si applicano nell'ordine delle schede di Gestione: commerciali, materie prime, parti
    assert.deepEqual(f.map(x => [x.name, x.kind]),
      [['Idraulico', 'acquistato'], ['Acciaio', 'materiale'], ['Carpenteria', 'parte']]);
    assert.equal(f[1].sigla, 'ACC');
    assert.deepEqual(f[2].subs.map(s => s.name), ['Fiancate']);
  });
  it('una macrofamiglia mancante si segnala citando il foglio giusto', () => {
    const a = app();
    const rep = importa(a, { 'Famiglie parti': [{ Sottofamiglia: 'Fiancate' }] });
    assert.equal(a.snapshot().families.length, 0);
    assert.match(rep.errors[0], /^Famiglie parti, riga 2: macrofamiglia mancante/);
  });
  it('un parametro non numerico non azzera l\'impostazione', () => {
    const a = app(dbPieno());
    const rep = importa(a, { Impostazioni: [{ Parametro: 'Margine / markup (%)', Valore: 'venti' }] });
    assert.equal(a.snapshot().settings.marginPct, 20);
    assert.match(rep.errors[0], /non è un numero/);
  });
  it('le percentuali fuori scala rientrano in silenzio, come nella scheda Impostazioni', () => {
    const a = app(dbPieno());
    importa(a, { Impostazioni: [{ Parametro: 'Spese generali / overhead (%)', Valore: 5000 }] });
    assert.equal(a.snapshot().settings.overheadPct, 1000);
  });
  it('una tariffa negativa non entra', () => {
    const a = app();
    const rep = importa(a, { 'Centri di lavoro': [{ Nome: 'Tornitura', 'Tariffa oraria': -5 }] });
    assert.equal(a.snapshot().workCenters.length, 0);
    assert.match(rep.errors[0], /tariffa non valida/);
  });
  it('un campo azienda sconosciuto si segnala invece di finire nel database', () => {
    const a = app();
    const rep = importa(a, { Azienda: [{ Campo: 'Colore preferito', Valore: 'blu' }] });
    assert.match(rep.errors[0], /campo sconosciuto/);
    assert.equal(JSON.stringify(a.snapshot().settings.company || {}).includes('blu'), false);
  });
  it('gli errori sono escapati: un foglio può contenere qualunque cosa', () => {
    const a = app();
    const rep = importa(a, { Famiglie: [{ Ambito: '<img src=x>', Macrofamiglia: 'Viti' }] });
    assert.ok(rep.errors[0].includes('&lt;img'), rep.errors[0]);
  });
});

describe('Import utenti — un foglio non è un buon posto da cui chiudersi fuori', () => {
  function conMe(users) {
    // asRole() entra come 'u-test' / t@t.it: mettendolo in elenco il foglio
    // parla anche di chi lo sta importando.
    return app(makeDb({ users: [{ id: 'u-test', name: 'Test', email: 't@t.it', role: 'admin', active: true }].concat(users || []) }));
  }
  it('non ci si cambia ruolo da soli', () => {
    const a = conMe();
    const rep = importa(a, { Utenti: [{ Nome: 'Test', Email: 't@t.it', Ruolo: 'Lettore' }] });
    assert.equal(a.snapshot().users[0].role, 'admin');
    assert.match(rep.errors[0], /tuo account/);
  });
  it('non ci si sospende da soli', () => {
    const a = conMe();
    const rep = importa(a, { Utenti: [{ Nome: 'Test', Email: 't@t.it', Attivo: 'No' }] });
    assert.equal(a.snapshot().users[0].active, true);
    assert.match(rep.errors[0], /tuo account/);
  });
  it('nome e colore del proprio account si aggiornano lo stesso', () => {
    const a = conMe();
    const rep = importa(a, { Utenti: [{ Nome: 'Andrea C.', Email: 't@t.it', Colore: '#FF0000' }] });
    assert.deepEqual(rep.errors, []);
    assert.equal(a.snapshot().users[0].name, 'Andrea C.');
    assert.equal(a.snapshot().users[0].color, '#FF0000');
  });
  // 0.105.5: un utente creato in locale il server lo rifiuta, e la coda si ferma.
  it('con l\'archivio condiviso un utente nuovo non nasce da un foglio', () => {
    const a = conMe();
    a.eval('cloudAttivo = () => true;');
    const rep = importa(a, { Utenti: [{ Nome: 'Nuovo', Email: 'n@n.it', Ruolo: 'Lettore' }, { Nome: 'Andrea C.', Email: 't@t.it' }] });
    assert.equal(a.snapshot().users.length, 1);
    assert.equal(a.snapshot().users[0].name, 'Andrea C.', 'chi c\'è si aggiorna');
    assert.match(rep.errors[0], /Gestione → Utenti/);
  });
  it('l\'ultimo amministratore attivo non si declassa da un foglio', () => {
    const a = app(makeDb({ users: [{ id: 'u1', name: 'Capo', email: 'c@c.it', role: 'admin', active: true }] }));
    const rep = importa(a, { Utenti: [{ Nome: 'Capo', Email: 'c@c.it', Ruolo: 'Lettore' }] });
    assert.equal(a.snapshot().users[0].role, 'admin');
    assert.match(rep.errors[0], /almeno un amministratore attivo/);
  });
  it('con un altro amministratore attivo il declassamento passa', () => {
    const a = conMe([{ id: 'u1', name: 'Capo', email: 'c@c.it', role: 'admin', active: true }]);
    const rep = importa(a, { Utenti: [{ Nome: 'Capo', Email: 'c@c.it', Ruolo: 'Progettazione' }] });
    assert.deepEqual(rep.errors, []);
    assert.equal(a.snapshot().users.find(u => u.email === 'c@c.it').role, 'progettazione');
  });
  it('un utente nuovo nasce senza password e con ruolo Lettore se non dichiarato', () => {
    const a = conMe();
    importa(a, { Utenti: [{ Nome: 'Nuovo', Email: 'n@n.it' }] });
    const u = a.snapshot().users.find(x => x.email === 'n@n.it');
    assert.equal(u.role, 'lettore');
    assert.equal(u.passwordHash, undefined);
  });
  it('un ruolo sconosciuto non diventa un ruolo a caso', () => {
    const a = conMe();
    const rep = importa(a, { Utenti: [{ Nome: 'Nuovo', Email: 'n@n.it', Ruolo: 'capo supremo' }] });
    assert.equal(a.snapshot().users.length, 1);
    assert.match(rep.errors[0], /ruolo sconosciuto/);
  });
  it('una riga senza email non crea un utente irraggiungibile', () => {
    const a = conMe();
    const rep = importa(a, { Utenti: [{ Nome: 'Senza email' }] });
    assert.equal(a.snapshot().users.length, 1);
    assert.match(rep.errors[0], /email mancante/);
  });
});

describe('Report import impostazioni — i conteggi dicono cosa è successo', () => {
  it('separa creati, aggiornati e invariati per foglio', () => {
    const a = app(dbPieno());
    const rep = importa(a, { Fornitori: [
      { Nome: 'Rossi Acciai', Telefono: '999' },     // aggiornato
      { Nome: 'Rossi Acciai' },                       // invariato
      { Nome: 'Bianchi Srl' },                        // creato
    ] });
    const f = rep.sheets.find(s => s.name === 'Fornitori');
    assert.deepEqual([f.created, f.updated, f.skipped], [1, 1, 1]);
  });
  it('senza permessi di gestione l\'import non parte', () => {
    const a = app(dbPieno());
    a.asRole('lettore');
    a.eval('onImportSettings({ target: { files: [{}], value: "" } })');
    assert.equal(a.snapshot().suppliers.length, 1);
  });
});

// ═══════════════════════════════════════════════════════════
//  I singoli fogli, alle loro condizioni al contorno
// ═══════════════════════════════════════════════════════════
// Fin qui erano esercitati solo di rimbalzo, attraverso importSettingsSheets:
// i casi limite — la riga senza nome, la colonna assente, la provincia in
// minuscolo, il booleano che deve poter dire «no» — non avevano un test loro,
// e sono esattamente quelli che un foglio compilato a mano produce.
function rep() { return { sheets: [], missing: [], errors: [], warnings: [] }; }
function applica(a, fn, righe) {
  return JSON.parse(a.eval(
    '(() => { const rp = ' + JSON.stringify(rep()) + ';'
    + ' const out = ' + fn + '(' + JSON.stringify(righe) + ', rp);'
    + ' return JSON.stringify({ out, errors: rp.errors, warnings: rp.warnings }); })()'));
}

describe('Foglio Fornitori', () => {
  const conRossi = () => makeDb({ suppliers: [{ id: 's1', name: 'Rossi', active: true, province: 'MO' }] });

  it('una riga senza nome, ma con altro dentro, è un errore che dice la riga', () => {
    const a = app(conRossi());
    const r = applica(a, 'applySuppliersSheet', [{ Nome: '', Email: 'x@y.it' }]);
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /riga 2/, 'la riga 1 è l-intestazione');
  });

  it('una riga del tutto vuota si salta senza rumore', () => {
    const a = app(conRossi());
    const r = applica(a, 'applySuppliersSheet', [{ Nome: '', Email: '' }]);
    assert.deepEqual(r.errors, []);
    assert.equal(r.out.skipped, 1);
  });

  it('il nome è la chiave: si riconosce ignorando le maiuscole', () => {
    const a = app(conRossi());
    applica(a, 'applySuppliersSheet', [{ Nome: 'ROSSI', Referente: 'Anna' }]);
    assert.equal(a.eval('db.suppliers.length'), 1, 'non è un fornitore nuovo');
    assert.equal(a.eval('db.suppliers[0].referente'), 'Anna');
  });

  it('la provincia entra in maiuscolo comunque la si scriva', () => {
    const a = app(conRossi());
    applica(a, 'applySuppliersSheet', [{ Nome: 'Rossi', Provincia: 'bo' }]);
    assert.equal(a.eval('db.suppliers[0].province'), 'BO');
  });

  it('una colonna assente lascia il campo com-era', () => {
    const a = app(conRossi());
    applica(a, 'applySuppliersSheet', [{ Nome: 'Rossi', Referente: 'Anna' }]);
    assert.equal(a.eval('db.suppliers[0].province'), 'MO', 'la colonna Provincia non c-era nel foglio');
  });

  it('una cella vuota, invece, svuota il campo', () => {
    const a = app(conRossi());
    applica(a, 'applySuppliersSheet', [{ Nome: 'Rossi', Provincia: '' }]);
    assert.equal(a.eval('db.suppliers[0].province'), '', 'scritta vuota è un-istruzione, assente è un silenzio');
  });

  it('«Attivo» può anche spegnere, e riaccendere', () => {
    const a = app(conRossi());
    applica(a, 'applySuppliersSheet', [{ Nome: 'Rossi', Attivo: 'No' }]);
    assert.equal(a.eval('db.suppliers[0].active'), false);
    applica(a, 'applySuppliersSheet', [{ Nome: 'Rossi', Attivo: 'Sì' }]);
    assert.equal(a.eval('db.suppliers[0].active'), true);
  });

  it('una riga che non cambia niente si conta come saltata, non aggiornata', () => {
    const a = app(conRossi());
    const r = applica(a, 'applySuppliersSheet', [{ Nome: 'Rossi', Provincia: 'MO' }]);
    assert.equal(r.out.updated, 0);
    assert.equal(r.out.skipped, 1, 'i conteggi dicono quante righe hanno fatto qualcosa');
  });

  it('il nome non si rinomina da qui: è la chiave', () => {
    const a = app(conRossi());
    applica(a, 'applySuppliersSheet', [{ Nome: 'Rossi Srl' }]);
    assert.equal(a.eval('db.suppliers.length'), 2, 'un nome diverso è un fornitore nuovo, non una rinomina');
  });
});

describe('Foglio Clienti', () => {
  it('nasce con tutti i campi, non a metà', () => {
    const a = app(makeDb());
    applica(a, 'applyCustomersSheet', [{ Nome: 'Bianchi Spa', Email: 'b@b.it' }]);
    const c = a.snapshot().customers[0];
    ['referente', 'email', 'phone', 'vat', 'street', 'streetNumber', 'zip', 'city', 'province', 'country', 'notes']
      .forEach(k => assert.notEqual(c[k], undefined, 'campo mancante: ' + k));
    assert.equal(c.active, true);
    assert.equal(c.email, 'b@b.it');
  });

  it('la chiave è il nome, come per i fornitori', () => {
    const a = app(makeDb({ customers: [{ id: 'c1', name: 'Bianchi', active: true }] }));
    applica(a, 'applyCustomersSheet', [{ Nome: 'bianchi', Telefono: '051' }]);
    assert.equal(a.eval('db.customers.length'), 1);
    assert.equal(a.eval('db.customers[0].phone'), '051');
  });

  it('una riga senza nome è un errore che nomina il foglio', () => {
    const a = app(makeDb());
    const r = applica(a, 'applyCustomersSheet', [{ Nome: '', Note: 'qualcosa' }]);
    assert.match(r.errors[0], /^Clienti, riga 2/);
  });
});

describe('Foglio Centri di lavoro', () => {
  it('una tariffa non valida ferma la riga e lo dice', () => {
    const a = app(makeDb({ workCenters: [{ id: 'w1', name: 'Tornitura', hourlyRate: 40, active: true }] }));
    const r = applica(a, 'applyWorkCentersSheet', [{ Nome: 'Tornitura', 'Tariffa oraria': '-5' }]);
    assert.equal(r.errors.length, 1);
    assert.equal(a.eval('db.workCenters[0].hourlyRate'), 40, 'e la tariffa di prima resta');
  });

  it('la tariffa italiana con la virgola entra giusta', () => {
    const a = app(makeDb({ workCenters: [{ id: 'w1', name: 'Tornitura', hourlyRate: 40, active: true }] }));
    applica(a, 'applyWorkCentersSheet', [{ Nome: 'Tornitura', 'Tariffa oraria': '42,50' }]);
    assert.equal(a.eval('db.workCenters[0].hourlyRate'), 42.5);
  });

  it('«Attivo» si può spegnere anche qui', () => {
    const a = app(makeDb({ workCenters: [{ id: 'w1', name: 'Tornitura', hourlyRate: 40, active: true }] }));
    const r = applica(a, 'applyWorkCentersSheet', [{ Nome: 'Tornitura', Attivo: 'No' }]);
    assert.equal(a.eval('db.workCenters[0].active'), false);
    assert.equal(r.out.updated, 1, 'lo stato da solo è un aggiornamento');
  });

  it('un centro nuovo nasce sospeso se il foglio lo dice', () => {
    const a = app(makeDb({ workCenters: [] }));
    applica(a, 'applyWorkCentersSheet', [{ Nome: 'Fresatura', 'Tariffa oraria': 30, Attivo: 'No' }]);
    assert.equal(a.snapshot().workCenters[0].active, false);
  });
});

// ═══════════════════════════════════════════════════════════
//  Il giro completo delle impostazioni, foglio per foglio
// ═══════════════════════════════════════════════════════════
describe('Export impostazioni — cosa contiene il file', () => {
  it('ogni foglio dichiarato ha la sua intestazione e le sue colonne', () => {
    const a = app(makeDb());
    const fogli = JSON.parse(a.eval('JSON.stringify(settingsSheets())'));
    assert.ok(fogli.length >= 8, 'i fogli sono tutti quelli delle schede di Gestione');
    fogli.forEach(f => {
      assert.ok(f.name, 'foglio senza nome');
      assert.ok(Array.isArray(f.aoa) && f.aoa.length >= 1, f.name + ': nessuna intestazione');
      assert.ok(f.aoa[0].length > 0, f.name + ': intestazione vuota');
      if (f.cols) assert.equal(f.cols.length, f.aoa[0].length, f.name + ': larghezze e colonne non coincidono');
    });
  });

  it('il foglio Clienti c-è, con lo stato attivo', () => {
    const a = app(makeDb({ customers: [{ id: 'c1', name: 'Bianchi', active: false }] }));
    const fogli = JSON.parse(a.eval('JSON.stringify(settingsSheets())'));
    const cli = fogli.find(f => f.key === 'customers');
    assert.ok(cli, 'nessun foglio Clienti');
    assert.ok(cli.aoa[0].includes('Attivo'));
    assert.equal(cli.aoa[1][cli.aoa[0].indexOf('Attivo')], 'No');
  });

  it('i centri di lavoro esportano lo stato, come le altre anagrafiche', () => {
    const a = app(makeDb({ workCenters: [{ id: 'w1', name: 'Tornitura', hourlyRate: 40, active: false }] }));
    const fogli = JSON.parse(a.eval('JSON.stringify(settingsSheets())'));
    const w = fogli.find(f => f.key === 'workcenters');
    assert.ok(w.aoa[0].includes('Attivo'), 'senza, un centro sospeso rinasce attivo');
    assert.equal(w.aoa[1][w.aoa[0].indexOf('Attivo')], 'No');
  });

  it('ogni foglio esportato ha chi lo sa rileggere', () => {
    const a = app(makeDb());
    const chiavi = JSON.parse(a.eval('JSON.stringify(settingsSheets().map(s => s.key))'));
    const letti = JSON.parse(a.eval('JSON.stringify(SETTINGS_SHEET_DEFS.map(d => d.key))'));
    const orfani = chiavi.filter(k => !letti.includes(k) && k !== 'terms' && k !== 'uoms' && k !== 'concepts' && k !== 'company');
    assert.deepEqual(orfani, [], 'un foglio che nessuno rilegge è un giro che si interrompe');
  });

  it('le istruzioni nominano ogni scheda del file', () => {
    const a = app(makeDb());
    const info = a.eval('JSON.stringify(settingsInfoAoa())');
    ['Fornitori', 'Clienti', 'Utenti', 'Centri di lavoro'].forEach(n =>
      assert.match(info, new RegExp(n), 'le istruzioni non parlano di ' + n));
  });
});
