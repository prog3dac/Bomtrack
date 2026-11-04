// Backup, ripristino, azzeramento, cestino.
//
// È il blocco che tocca **tutto il database in una volta**, ed era interamente
// scoperto: `validateSnapshot` — la guardia scritta apposta per il file
// troncato — non era nominata da un solo test, e nemmeno `resetDB`,
// `wipeAll`, `reconcileSession` o le tre operazioni del cestino.
//
// Sono anche i gesti che nessuno rifà per provare: azzerare il database per
// vedere se funziona significa azzerarlo davvero. Qui costano niente.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || makeDb({ items: [mat('m1', 10), acq('c1', 5)] }));
  a.asRole('admin');
  return a;
}
// Un database di partenza riconoscibile, per distinguerlo dai dati di esempio.
function conDati() {
  return makeDb({
    suppliers: [{ id: 's1', name: 'Rossi', active: true }],
    items: [Object.assign(mat('m1', 10), { code: 'MIO-001' })],
    users: [{ id: 'u-test', name: 'Test', email: 't@t.it', role: 'admin', active: true }],
  });
}

// ═══════════════════════════════════════════════════════════
//  validateSnapshot — la guardia prima di sovrascrivere
// ═══════════════════════════════════════════════════════════
// Prima esisteva solo `Array.isArray(data.items)`: un file troncato a metà
// passava, sostituiva l'intero database e mandava migrateDB() a lavorare su
// strutture che nessuno aveva verificato. L'errore usciva molto dopo, in una
// vista a caso, quando i dati veri erano già stati sovrascritti.
describe('validateSnapshot', () => {
  const v = (a, data) => a.eval('validateSnapshot(' + JSON.stringify(data) + ')');

  it('un backup buono passa', () => {
    const a = app();
    assert.equal(v(a, { items: [], suppliers: [], settings: {}, schemaVersion: 2 }), null);
  });

  it('basta l-elenco degli articoli: le altre collezioni possono mancare', () => {
    const a = app();
    assert.equal(v(a, { items: [] }), null, 'i file vecchi non hanno tutte le collezioni, e migrateDB le ricostruisce');
  });

  it('quello che non è un oggetto non è un database', () => {
    const a = app();
    ['', 'testo', 42].forEach(x => assert.match(String(v(a, x)), /non contiene un database/));
    assert.match(String(a.eval('validateSnapshot(null)')), /non contiene un database/);
    assert.match(String(a.eval('validateSnapshot([1,2,3])')), /non contiene un database/,
      'un array è un oggetto, ma non è questo oggetto');
  });

  it('senza articoli si ferma, e dice che può essere troncato', () => {
    const a = app();
    assert.match(String(v(a, { suppliers: [] })), /troncato/);
    assert.match(String(v(a, { items: 'non un elenco' })), /troncato/);
  });

  it('una collezione che non è un elenco è un file danneggiato, e si dice quale', () => {
    const a = app();
    assert.match(String(v(a, { items: [], orders: { non: 'un elenco' } })), /"orders"/);
    assert.match(String(v(a, { items: [], customers: 42 })), /"customers"/);
  });

  it('le impostazioni devono essere un oggetto', () => {
    const a = app();
    assert.match(String(v(a, { items: [], settings: [] })), /impostazioni/);
    assert.match(String(v(a, { items: [], settings: 'no' })), /impostazioni/);
    assert.equal(v(a, { items: [], settings: null }), null, 'assenti va bene: le ricostruisce migrateDB');
  });

  it('una versione di schema illeggibile si ferma', () => {
    const a = app();
    ['due', 0, -1].forEach(x => assert.match(String(v(a, { items: [], schemaVersion: x })), /versione/));
  });

  it('un file più recente dell-app si ferma e spiega perché', () => {
    const a = app();
    const msg = String(v(a, { items: [], schemaVersion: 99 }));
    assert.match(msg, /più recente/);
    assert.match(msg, /aggiorna/i, 'le migrazioni sanno salire, non scendere');
  });

  // 0.141.0: gli id finiscono negli onclick senza passare da esc().
  it('un id con apici o tag dentro si ferma, e si dice dove', () => {
    const a = app();
    const msg = String(v(a, { items: [{ id: "x');alert(1);('", code: 'A', name: 'A' }] }));
    assert.match(msg, /caratteri non ammessi/);
    assert.match(msg, /items\[0\]\.id/);
    assert.match(String(v(a, { items: [], orders: [{ id: 'o1', lines: [{ id: 'l1', itemId: '<img src=x>' }] }] })), /orders\[0\]\.lines\[0\]\.itemId/);
    assert.match(String(v(a, { items: [], plans: [{ id: 'p1', lineIds: ['ok', 'no"pe'] }] })), /plans\[0\]\.lineIds/);
    assert.equal(v(a, { items: [{ id: 'fm1', code: 'A', name: 'Nome con \'apice\' e <tag>' }, { id: '0b4c6c1e-6d2a-4e43-9e0c-2a1d6f0c9b11' }] }), null,
      'gli id di sempre passano, e il testo libero non si guarda');
  });

  it('Store.importSnapshot rifiuta quello che validateSnapshot rifiuta', () => {
    const a = app(conDati());
    assert.throws(() => a.eval('Store.importSnapshot(JSON.stringify({ suppliers: [] }))'), /troncato/);
    assert.equal(a.eval('db.items.length'), 1, 'e i dati di prima sono ancora tutti lì');
    assert.equal(a.eval('db.items[0].code'), 'MIO-001');
  });
});

// ═══════════════════════════════════════════════════════════
//  Il giro completo del backup
// ═══════════════════════════════════════════════════════════
describe('Esporta e reimporta', () => {
  it('un database esportato e reimportato è lo stesso database', () => {
    const a = app(conDati());
    const json = a.eval('Store.exportSnapshot()');
    a.eval('Store.clearAll(null)');
    assert.equal(a.eval('db.items.length'), 0, 'svuotato davvero');
    a.eval('Store.importSnapshot(' + JSON.stringify(json) + ')');
    assert.equal(a.eval('db.items.length'), 1);
    assert.equal(a.eval('db.items[0].code'), 'MIO-001');
    assert.equal(a.eval('db.suppliers[0].name'), 'Rossi');
  });

  it('il backup è leggibile come JSON e contiene le collezioni', () => {
    const a = app(conDati());
    const dati = JSON.parse(a.eval('Store.exportSnapshot()'));
    assert.ok(Array.isArray(dati.items));
    assert.ok(Array.isArray(dati.suppliers));
    assert.equal(dati.schemaVersion, 2, 'la versione viaggia dentro il file, non nel nome');
  });

  it('reimportare passa dalle migrazioni: un backup v1 sale a v2', () => {
    const a = app(conDati());
    a.eval('Store.importSnapshot(JSON.stringify({ items: [{ id: 7, code: "V1", name: "Vecchio", type: "materiale", uom: "kg", unitCost: 3 }], settings: {} }))');
    assert.equal(a.eval('db.schemaVersion'), 2);
    assert.match(String(a.eval('db.items[0].id')), /^[0-9a-f-]{36}$/, 'gli id interi diventano UUID');
  });
});

// ═══════════════════════════════════════════════════════════
//  Azzerare e ripristinare i dati di esempio
// ═══════════════════════════════════════════════════════════
describe('Store.reset — i dati di esempio', () => {
  it('sostituisce tutto con il database iniziale', () => {
    const a = app(conDati());
    a.eval('Store.reset()');
    assert.equal(a.eval('db.items.some(i => i.code === "MIO-001")'), false);
    assert.ok(a.eval('db.items.length') > 1, 'e i dati di esempio ci sono');
    assert.ok(a.eval('db.families.length') > 0);
  });
  it('passa dalle migrazioni, quindi non lascia riferimenti rotti', () => {
    const a = app(conDati());
    a.eval('Store.reset()');
    const db = a.snapshot();
    const sup = new Set(db.suppliers.map(s => s.id));
    const orfane = db.items.reduce((n, i) => n + (i.priceList || [])
      .filter(r => r.supplierId && !sup.has(r.supplierId)).length, 0);
    assert.equal(orfane, 0);
  });
});

describe('Store.clearAll — azzerare davvero', () => {
  it('svuota ogni collezione', () => {
    const a = app(conDati());
    a.eval('Store.clearAll(null)');
    const db = a.snapshot();
    JSON.parse(a.eval('JSON.stringify(COLLECTIONS)')).forEach(c => {
      assert.deepEqual(db[c], [], 'collezione non svuotata: ' + c);
    });
  });

  it('non lascia tornare i seed una-tantum', () => {
    const a = app(conDati());
    a.eval('Store.clearAll(null)');
    assert.deepEqual(a.snapshot().families, [], 'le famiglie predefinite ripopolerebbero un database appena svuotato');
    assert.deepEqual(a.snapshot().settings.uoms, []);
  });

  it('chi azzera resta dentro come amministratore', () => {
    const a = app(conDati());
    a.eval('Store.clearAll({ id: "u-test", name: "Test", email: "t@t.it", role: "lettore", active: false })');
    const u = a.snapshot().users;
    assert.equal(u.length, 1);
    assert.equal(u[0].role, 'admin', 'chi svuota il database non deve restare chiuso fuori');
    assert.equal(u[0].active, true);
  });

  it('wipeAllConfirm pretende la parola esatta', () => {
    const a = app(conDati());
    a.eval('wipeAll()');
    a.el('wipe-word').value = 'azzero';
    a.eval('wipeAllConfirm()');
    assert.equal(a.eval('db.items.length'), 1, 'una parola sbagliata non azzera niente');
    a.el('wipe-word').value = 'azzera';
    a.eval('wipeAllConfirm()');
    assert.equal(a.eval('db.items.length'), 0, 'e le minuscole vanno bene: si confronta in maiuscolo');
  });

  it('il ruolo lettore non azzera', () => {
    const a = app(conDati());
    a.asRole('lettore');
    a.eval('try { wipeAllConfirm(); } catch (e) {}');
    assert.equal(a.eval('db.items.length'), 1);
  });
});

// ═══════════════════════════════════════════════════════════
//  La sessione dopo che il database è cambiato sotto i piedi
// ═══════════════════════════════════════════════════════════
describe('reconcileSession', () => {
  it('se il proprio utente c-è ancora, si continua con quello nuovo', () => {
    const a = app(conDati());
    a.eval('currentUser = { id: "u-test", name: "Nome vecchio", role: "admin", active: true }');
    assert.equal(a.eval('reconcileSession()'), true);
    assert.equal(a.eval('currentUser.name'), 'Test', 'vince il record del database, non la copia in sessione');
  });

  it('un database senza utenti riaccoglie chi sta lavorando, come admin', () => {
    const a = app(makeDb({ users: [] }));
    a.eval('currentUser = { id: "u-x", name: "Solo", email: "s@s.it", role: "lettore", active: true }');
    assert.equal(a.eval('reconcileSession()'), true);
    assert.equal(a.eval('db.users.length'), 1);
    assert.equal(a.eval('db.users[0].role'), 'admin', 'altrimenti il database sarebbe senza amministratori');
  });

  it('un database con altri utenti chiede di rientrare', () => {
    const a = app(makeDb({ users: [{ id: 'altro', name: 'Altro', email: 'a@a.it', role: 'admin', active: true }] }));
    a.eval('currentUser = { id: "u-x", name: "Io", role: "admin", active: true }');
    assert.equal(a.eval('reconcileSession()'), false);
    assert.equal(a.eval('currentUser'), null, 'la sessione di prima non vale su dati di qualcun altro');
  });

  it('fuori sessione non c-è niente da riconciliare', () => {
    const a = app(conDati());
    a.eval('currentUser = null');
    assert.equal(a.eval('reconcileSession()'), true);
  });
});

// ═══════════════════════════════════════════════════════════
//  Il cestino, dai comandi della Gestione
// ═══════════════════════════════════════════════════════════
describe('Cestino — i comandi', () => {
  const conCestino = () => {
    const a = app(conDati());
    a.eval('Store.remove("items", "m1")');
    return a;
  };

  it('ripristinare rimette la voce al suo posto e lo dice', () => {
    const a = conCestino();
    a.eval('restoreFromTrash(db.trash[0].id)');
    assert.equal(a.eval('db.items.length'), 1);
    assert.equal(a.eval('db.trash.length'), 0);
  });

  it('un id di cestino inesistente non fa danni', () => {
    const a = conCestino();
    a.eval('restoreFromTrash("non-esiste")');
    assert.equal(a.eval('db.trash.length'), 1, 'il cestino resta com-era');
    assert.equal(a.eval('db.items.length'), 0);
  });

  it('eliminare definitivamente toglie dal cestino senza rimettere niente', () => {
    const a = conCestino();
    a.eval('purgeFromTrash(db.trash[0].id)');
    a.eval('confirmYes()');
    assert.equal(a.eval('db.trash.length'), 0);
    assert.equal(a.eval('db.items.length'), 0, 'purgare non è ripristinare');
  });

  it('svuotare il cestino li toglie tutti', () => {
    const a = conCestino();
    a.eval('Store.remove("suppliers", "s1")');
    assert.equal(a.eval('db.trash.length'), 2);
    a.eval('emptyTrashConfirm()');
    a.eval('confirmYes()');
    assert.equal(a.eval('db.trash.length'), 0);
  });

  it('annullare la conferma non svuota niente', () => {
    const a = conCestino();
    a.eval('emptyTrashConfirm()');
    a.eval('confirmNo()');
    assert.equal(a.eval('db.trash.length'), 1);
  });

  it('il ruolo lettore non tocca il cestino', () => {
    const a = conCestino();
    a.asRole('lettore');
    a.eval('restoreFromTrash(db.trash[0].id)');
    assert.equal(a.eval('db.trash.length'), 1);
  });

  it('la voce si descrive con quello che ha: numero, codice o nome', () => {
    const a = app(conDati());
    assert.equal(a.eval('trashDescr({ record: { number: "ODA-1", code: "X", name: "Y" } })'), 'ODA-1');
    assert.equal(a.eval('trashDescr({ record: { code: "X", name: "Y" } })'), 'X');
    assert.equal(a.eval('trashDescr({ record: { title: "Solo titolo" } })'), 'Solo titolo');
    assert.equal(a.eval('trashDescr({ record: {} })'), '(senza nome)');
    assert.equal(a.eval('trashDescr({})'), '(senza nome)', 'una voce senza record non deve lanciare');
  });
});

// ═══════════════════════════════════════════════════════════
//  Diagnostica
// ═══════════════════════════════════════════════════════════
describe('Controllo dati — i codici duplicati', () => {
  it('senza duplicati lo dice, e senza allarmare', () => {
    const a = app(conDati());
    const h = a.eval('renderDuplicateCodes()');
    assert.match(h, /Nessun codice articolo duplicato/);
    assert.doesNotMatch(h, /var\(--red\)/, 'niente rosso dove non c-è un problema');
  });

  it('con duplicati li elenca, con quanti articoli e un modo per aprirli', () => {
    const a = app(makeDb({ items: [
      Object.assign(mat('m1', 1), { code: 'DUP-1', name: 'Primo' }),
      Object.assign(mat('m2', 1), { code: 'dup-1', name: 'Secondo' }),
      Object.assign(acq('c1', 1), { code: 'ALTRO' }),
    ] }));
    const h = a.eval('renderDuplicateCodes()');
    assert.match(h, /1 codici duplicati/);
    assert.match(h, /2 articoli condividono/);
    assert.match(h, /editItemModal\('m1'\)/, 'ogni articolo va raggiunto da qui');
    assert.match(h, /editItemModal\('m2'\)/);
    assert.doesNotMatch(h, /ALTRO/, 'chi non è duplicato non c-entra');
  });

  it('non li corregge da solo: quei codici stanno su disegni già emessi', () => {
    const a = app(makeDb({ items: [
      Object.assign(mat('m1', 1), { code: 'DUP-1' }),
      Object.assign(mat('m2', 1), { code: 'DUP-1' }),
    ] }));
    a.eval('renderDuplicateCodes()');
    assert.equal(a.eval('db.items[0].code'), 'DUP-1');
    assert.equal(a.eval('db.items[1].code'), 'DUP-1');
  });
});

describe('Spazio occupato', () => {
  it('dice i MB, con due decimali', () => {
    const a = app(conDati());
    a.eval('Store.commit()');
    assert.match(a.eval('dbSizeLine()'), /\d+\.\d{2} MB/);
  });
  it('sotto la soglia non allarma', () => {
    const a = app(conDati());
    a.eval('Store.commit()');
    const h = a.eval('dbSizeLine()');
    assert.doesNotMatch(h, /vicino al limite/);
    assert.match(h, /circa 5 MB/);
  });
  it('vicino alla soglia lo dice, in rosso, e suggerisce cosa fare', () => {
    const a = app(conDati());
    // Store.sizeInfo() legge l'adapter: qui gli si fa dire che siamo a 4,5 MB.
    a.eval('Store.adapter = Object.assign({}, Store.adapter, { size: () => 4.5 * 1024 * 1024 })');
    const h = a.eval('dbSizeLine()');
    assert.match(h, /vicino al limite/);
    assert.match(h, /var\(--red\)/);
    assert.match(h, /backup/, 'un avviso senza una via d-uscita è solo un allarme');
  });
});

// ═══════════════════════════════════════════════════════════
//  Il backup come lo vive chi lo usa: un file
// ═══════════════════════════════════════════════════════════
// Fin qui si è provato `Store.importSnapshot`, cioè il motore. Qui si prova la
// porta: il file che entra da un <input type=file>, con i tre modi in cui può
// andare storta — illeggibile, JSON valido ma di un altro programma, backup
// buono — che per chi importa sono tre problemi diversi e vanno detti diversi.
describe('Ripristinare un backup da file', () => {
  const conDatiVeri = () => {
    const a = app(conDati());
    a.eval('Store.commit()');
    return a;
  };
  const carica = (a, testo, errore) => {
    a.eval('window.__ev = null');
    a.ctx.__ev = a.fileEvent('backup.json', testo, errore);
    a.eval('importBackup(window.__ev)');
  };

  it('un file troncato lo dice, e non tocca niente', () => {
    const a = conDatiVeri();
    carica(a, '{"items":[{"id":"x"');
    assert.equal(a.eval('db.items.length'), 1, 'i dati di prima sono ancora tutti lì');
    assert.equal(a.eval('db.items[0].code'), 'MIO-001');
  });

  it('un JSON valido che non è un backup Bomtrack viene fermato', () => {
    const a = conDatiVeri();
    carica(a, '{"clienti":[],"fatture":[]}');
    assert.equal(a.eval('db.items[0].code'), 'MIO-001', 'nessuna sostituzione');
  });

  it('un backup buono chiede conferma prima di sovrascrivere', () => {
    const a = conDatiVeri();
    carica(a, JSON.stringify({ items: [{ id: 'z', code: 'ALTRO-1', name: 'Altro', type: 'materiale', uom: 'kg' }], settings: {}, schemaVersion: 2 }));
    assert.equal(a.eval('db.items[0].code'), 'MIO-001', 'finché non si conferma non cambia niente');
    assert.equal(a.eval('!!panelTop()'), true, 'la domanda è una scheda');
  });

  it('confermando, il backup prende il posto dei dati', () => {
    const a = conDatiVeri();
    carica(a, JSON.stringify({ items: [{ id: 'z', code: 'ALTRO-1', name: 'Altro', type: 'materiale', uom: 'kg' }], settings: {}, schemaVersion: 2 }));
    a.eval('confirmYes()');
    assert.equal(a.eval('db.items.length'), 1);
    assert.equal(a.eval('db.items[0].code'), 'ALTRO-1');
  });

  it('annullando, resta tutto com-era', () => {
    const a = conDatiVeri();
    carica(a, JSON.stringify({ items: [], settings: {}, schemaVersion: 2 }));
    a.eval('confirmNo()');
    assert.equal(a.eval('db.items[0].code'), 'MIO-001');
  });

  it('la domanda dice cosa entra e cosa esce, in numeri', () => {
    const a = conDatiVeri();
    carica(a, JSON.stringify({ items: [{ id: 'z', code: 'A', name: 'A', type: 'materiale', uom: 'kg' },
      { id: 'y', code: 'B', name: 'B', type: 'materiale', uom: 'kg' }], suppliers: [], settings: {}, schemaVersion: 2 }));
    const testo = a.html('modal-root') || a.eval('panelTop().innerHTML');
    assert.match(testo, /2 articoli/, 'dai numeri si riconosce al volo un backup sbagliato');
    assert.match(testo, /1 articoli/, 'e si vede cosa si sta per perdere');
  });

  it('un backup da una revisione più recente si rifiuta', () => {
    const a = conDatiVeri();
    carica(a, JSON.stringify({ items: [], schemaVersion: 99 }));
    a.eval('try { confirmYes(); } catch (e) {}');
    assert.equal(a.eval('db.items[0].code'), 'MIO-001', 'le migrazioni sanno salire, non scendere');
  });

  it('il ruolo lettore non ripristina niente', () => {
    const a = conDatiVeri();
    a.asRole('lettore');
    carica(a, JSON.stringify({ items: [], settings: {}, schemaVersion: 2 }));
    a.eval('try { confirmYes(); } catch (e) {}');
    assert.equal(a.eval('db.items[0].code'), 'MIO-001');
  });
});

describe('Esportare un backup', () => {
  it('consegna un file con dentro il database', () => {
    const a = app(conDati());
    a.eval('exportBackup()');
    const usciti = a.scaricati();
    assert.equal(usciti.length, 1, 'un file, e uno solo');
    const dati = JSON.parse(usciti[0].contenuto);
    assert.equal(dati.items[0].code, 'MIO-001');
    assert.equal(dati.schemaVersion, 2);
  });

  it('quello che esce rientra: il giro si chiude', () => {
    const a = app(conDati());
    a.eval('exportBackup()');
    const json = a.scaricati()[0].contenuto;
    a.eval('Store.clearAll(null)');
    a.eval('Store.importSnapshot(' + JSON.stringify(json) + ')');
    assert.equal(a.eval('db.items[0].code'), 'MIO-001');
  });

  it('il ruolo lettore non esporta: dentro ci sono gli utenti e i loro hash', () => {
    const a = app(conDati());
    a.asRole('lettore');
    a.eval('exportBackup()');
    assert.equal(a.scaricati().length, 0);
  });
});
