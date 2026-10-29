// Migrazioni e normalizzazioni (store.js: loadDB / migrateDB / migrateV2).
// Girano a ogni caricamento su ogni PC dove l'app è stata copiata: se sbagliano,
// sbagliano su dati reali già esistenti.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Database in formato v1: id interi, nessuno schemaVersion, contatore nextId.
function legacyDb() {
  return {
    nextId: 99,
    suppliers: [{ id: 5, name: 'Fornitore Alfa', address: 'Via Roma 1' }],
    workCenters: [{ id: 1, name: 'Tornitura', hourlyRate: 50 }],
    families: [{ id: 7, name: 'Meccanico', subs: [{ id: 8, name: 'Cuscinetti' }] }],
    items: [
      { id: 10, code: 'M', name: 'Lamiera', type: 'materiale', uom: 'kg', unitCost: 10 },
      { id: 11, code: 'A', name: 'Cuscinetto', type: 'acquistato', uom: 'pz', purchasePrice: 20, supplierId: 5, familyId: 7, subFamilyId: 8 },
      { id: 12, code: 'G', name: 'Gruppo', type: 'gruppo', uom: 'pz',
        components: [{ itemId: 10, qty: 2 }, { itemId: 11, qty: 1 }],
        operations: [{ workCenterId: 1, hours: 1 }] },
    ],
    settings: { overheadPct: 0, marginPct: 0, currency: '€' },
  };
}

function caricato(blob) {
  const app = loadApp({ silent: true });
  app.seedStorage(blob);
  app.ref('Store').load();
  return app;
}

describe('migrateV2 — id legacy → UUID', () => {
  it('tutte le chiavi primarie diventano UUID e nextId sparisce', () => {
    const app = caricato(legacyDb());
    const db = app.snapshot();
    assert.equal(db.schemaVersion, 2);
    assert.equal(db.nextId, undefined);
    [].concat(db.suppliers, db.workCenters, db.items).forEach(r => {
      assert.match(String(r.id), UUID_RE, 'id non migrato: ' + r.id);
    });
    db.families.forEach(f => {
      assert.match(String(f.id), UUID_RE);
      (f.subs || []).forEach(s => assert.match(String(s.id), UUID_RE));
    });
  });

  it('tutti i riferimenti seguono le nuove chiavi', () => {
    const db = caricato(legacyDb()).snapshot();
    const byCode = c => db.items.find(i => i.code === c);
    const m = byCode('M'), a = byCode('A'), g = byCode('G');

    assert.equal(a.supplierId, db.suppliers[0].id, 'fornitore');
    const fam = db.families.find(f => f.name === 'Meccanico');
    assert.equal(a.familyId, fam.id, 'famiglia');
    assert.equal(a.subFamilyId, fam.subs[0].id, 'sottofamiglia');
    assert.equal(g.components[0].itemId, m.id, 'componente 1');
    assert.equal(g.components[1].itemId, a.id, 'componente 2');
    // Dalla 0.124.0 le lavorazioni dell'assieme sono fasi del suo ciclo.
    assert.equal(g.operations.length, 0, 'lavorazioni passate al ciclo');
    assert.equal(g.cycle[0].workCenterId, db.workCenters[0].id, 'centro di lavoro');
  });

  it('il costo calcolato non cambia attraversando la migrazione', () => {
    const prima = loadApp({ silent: true });
    prima.setDb(Object.assign(legacyDb(), { schemaVersion: 2 }));   // stesso db, senza migrare gli id
    const atteso = prima.ref('costOf')(12);

    const dopo = caricato(legacyDb());
    const g = dopo.snapshot().items.find(i => i.code === 'G');
    const ottenuto = dopo.ref('costOf')(g.id);

    approx(ottenuto.total, atteso.total, 'totale');
    approx(ottenuto.total, 90, 'valore atteso a mano (20 materiale + 20 commerciale + 50 manodopera)');
    approx(ottenuto.material, atteso.material, 'materiale');
    approx(ottenuto.labor, atteso.labor, 'manodopera');
  });

  it('un db già in v2 non viene rimaneggiato', () => {
    const app = caricato(Object.assign(legacyDb(), { schemaVersion: 2 }));
    const g = app.snapshot().items.find(i => i.code === 'G');
    assert.equal(g.id, 12, 'gli id restano quelli salvati');
  });
});

describe('migrateDB — idempotenza e normalizzazioni', () => {
  it('eseguirla due volte non cambia nulla', () => {
    const app = caricato(legacyDb());
    const uno = JSON.stringify(app.snapshot());
    app.ref('migrateDB')();
    assert.equal(JSON.stringify(app.snapshot()), uno);
  });

  it('le famiglie seminate hanno subito kind e sigla (servono alla codifica)', () => {
    const db = caricato({ schemaVersion: 2, families: [{ id: 'f1', name: 'Meccanico' }] }).snapshot();
    db.families.forEach(f => {
      assert.ok(f.kind, 'famiglia senza kind: ' + f.name);
      assert.ok(f.sigla, 'famiglia senza sigla: ' + f.name);
      (f.subs || []).forEach(s => assert.ok(s.sigla, 'sottofamiglia senza sigla: ' + s.name));
    });
    assert.ok(db.families.some(f => f.kind === 'materiale'), 'seed materie prime mancante');
    assert.ok(db.families.some(f => f.kind === 'parte'), 'seed parti mancante');
  });

  it('db vuoto: tutte le collezioni esistono', () => {
    const db = caricato({}).snapshot();
    ['suppliers', 'rfqs', 'orders', 'workCenters', 'families', 'users', 'items'].forEach(k => {
      assert.ok(Array.isArray(db[k]), 'manca ' + k);
    });
    assert.ok(db.settings && typeof db.settings === 'object');
  });

  it('ruolo utente sconosciuto → lettore', () => {
    const db = caricato({ schemaVersion: 2, users: [{ id: 'u1', name: 'X', role: 'capo' }] }).snapshot();
    assert.equal(db.users[0].role, 'lettore');
    assert.equal(db.users[0].active, true);
    assert.equal(db.users[0].passwordHash, '');
  });

  it('vecchio tipo "prodotto" → macchina o gruppo', () => {
    const db = caricato({ schemaVersion: 2, items: [
      { id: 'p1', type: 'prodotto', isMachine: true },
      { id: 'p2', type: 'prodotto' },
    ] }).snapshot();
    assert.equal(db.items[0].type, 'macchina');
    assert.equal(db.items[0].isMachine, undefined);
    assert.equal(db.items[1].type, 'gruppo');
  });

  it('indirizzo in campo unico → indirizzo strutturato', () => {
    const db = caricato(legacyDb()).snapshot();
    const s = db.suppliers[0];
    assert.equal(s.street, 'Via Roma 1');
    assert.equal(s.address, undefined);
    assert.equal(s.zip, '');
  });

  it('U.M. incontrate nei dati entrano nell\'elenco gestito', () => {
    const db = caricato({ schemaVersion: 2, items: [{ id: 'x', type: 'materiale', uom: 'daN' }] }).snapshot();
    assert.ok(db.settings.uoms.some(u => u.code === 'daN'), 'daN non registrata');
  });

  // Il modo di calcolo del costo è stato assorbito dall'approvvigionamento: era
  // la stessa domanda posta a metà. La conversione deve conservare insieme il
  // costo e il comportamento nel fabbisogno, altrimenti i numeri si muovono.
  it('il vecchio modo di calcolo diventa approvvigionamento, e il campo sparisce', () => {
    const db = caricato({ schemaVersion: 2, items: [
      { id: 'p1', type: 'parte', costMode: 'unit', unitCost: 10, cycle: [{ kind: 'op', cost: 5 }] },
      { id: 'p2', type: 'parte', costMode: 'cycle', unitCost: 10, cycle: [{ kind: 'op', cost: 5 }] },
      { id: 'p3', type: 'parte', costMode: 'sum', unitCost: 10, cycle: [{ kind: 'op', cost: 5 }] },
    ] }).snapshot();
    assert.equal(db.items[0].sourcing, 'buy', '"unit": costava il campo manuale e non esplodeva — è un acquisto');
    assert.equal(db.items[1].sourcing, 'make', '"cycle": il costo veniva dal ciclo');
    assert.equal(db.items[2].sourcing, 'make', '"sum": si perde la quota manuale, il ciclo è il costo del farla');
    db.items.forEach(i => assert.equal(i.costMode, undefined, 'il campo non deve sopravvivere'));
  });

  it('i costi convertiti restano quelli di prima, dove la conversione è esatta', () => {
    const app = caricato({ schemaVersion: 2, items: [
      { id: 'p1', type: 'parte', costMode: 'unit', unitCost: 10, cycle: [{ kind: 'op', cost: 5 }] },
      { id: 'p2', type: 'parte', costMode: 'cycle', unitCost: 10, cycle: [{ kind: 'op', cost: 5 }] },
    ] });
    assert.equal(app.eval('costOf("p1").total'), 10, 'come il vecchio "unit"');
    assert.equal(app.eval('costOf("p2").total'), 5, 'come il vecchio "cycle"');
  });

  it('una parte senza modo di calcolo si deduce dal ciclo', () => {
    const db = caricato({ schemaVersion: 2, items: [
      { id: 'p1', type: 'parte', unitCost: 10 },
      { id: 'p2', type: 'parte', unitCost: 10, cycle: [{ kind: 'op', cost: 5 }] },
    ] }).snapshot();
    assert.equal(db.items[0].sourcing, 'buy', 'senza ciclo non c\'è niente da fabbricare');
    assert.equal(db.items[1].sourcing, 'make', 'col ciclo la si fa in casa');
  });

  it('il default delle impostazioni non ricade sulle parti già a catalogo', () => {
    const app = caricato({ schemaVersion: 2,
      items: [{ id: 'p', type: 'parte', cycle: [{ kind: 'op', cost: 5 }] }],
      settings: { partSourcingDefault: 'buy' } });
    assert.equal(app.snapshot().items[0].sourcing, 'make');
  });
});

describe('migrateDB — righe di lavorazione del ciclo (ore → costo fisso)', () => {
  it('ore x tariffa diventano un costo fisso e il valore non cambia', () => {
    const app = caricato({
      schemaVersion: 2,
      workCenters: [{ id: 'w1', name: 'Tornitura', hourlyRate: 50 }],
      items: [{ id: 'p', type: 'parte', cycle: [{ kind: 'op', workCenterId: 'w1', hours: 2 }] }],
    });
    const row = app.snapshot().items[0].cycle[0];
    assert.equal(row.cost, 100);
    assert.equal(row.costMode, 'fisso');
    // Le ore restano: sono il tempo che la fase occupa sul centro, e quel tempo
    // esiste anche quando il costo e' un valore fisso. Fino alla 0.64.2 questa
    // stessa riga pretendeva che sparissero, ed era il difetto che cancellava
    // le ore di tutte le fasi a costo orario.
    assert.equal(row.hours, 2);
    approx(app.ref('costOf')('p').total, 100);
  });

  it('un override già presente vince sul calcolo a ore', () => {
    const app = caricato({
      schemaVersion: 2,
      workCenters: [{ id: 'w1', name: 'Tornitura', hourlyRate: 50 }],
      items: [{ id: 'p', type: 'parte', cycle: [{ kind: 'op', workCenterId: 'w1', hours: 2, costOverride: 30 }] }],
    });
    const row = app.snapshot().items[0].cycle[0];
    assert.equal(row.cost, 30);
    assert.equal(row.costOverride, undefined);
  });

  it('una riga già convertita non viene ricalcolata', () => {
    const app = caricato({
      schemaVersion: 2,
      workCenters: [{ id: 'w1', name: 'Tornitura', hourlyRate: 50 }],
      items: [{ id: 'p', type: 'parte', cycle: [{ kind: 'op', workCenterId: 'w1', cost: 7 }] }],
    });
    assert.equal(app.snapshot().items[0].cycle[0].cost, 7);
  });
});

describe('loadDB — primo avvio e dati corrotti', () => {
  it('senza database salvato semina i dati di esempio e li persiste', () => {
    const app = loadApp({ silent: true });
    assert.equal(app.storage.getItem('bomtrack_v1'), null);
    app.ref('Store').load();
    assert.ok(app.storage.getItem('bomtrack_v1'), 'il seed non è stato scritto');
    const db = app.snapshot();
    assert.ok(db.items.some(i => i.type === 'macchina'), 'manca la macchina di esempio');
    assert.equal(db.users.length, 0, 'nessun utente predefinito: il setup lo chiede all\'avvio');
  });

  it('JSON corrotto: fallback sui dati di esempio, nessuna eccezione', () => {
    const app = loadApp({ silent: true });
    app.seedStorage('{ questo non e json');
    assert.doesNotThrow(() => app.ref('Store').load());
    assert.ok(app.snapshot().items.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════
//  I riferimenti che la migrazione dimenticava
// ═══════════════════════════════════════════════════════════
// Fino alla 0.59 migrateV2() rimappava quattro classi di riferimento su tredici.
// Chi apriva l'app con dati v1 trovava ordini senza fornitore, righe senza
// articolo, movimenti di magazzino orfani — e la migrazione aveva già salvato.
// Qui c'è un database v1 con **tutte** le classi dichiarate in REFS: se una
// resta all'id legacy, il test la nomina.
function legacyCompleto() {
  return {
    nextId: 99,
    suppliers: [{ id: 5, name: 'Alfa' }, { id: 6, name: 'Beta' }],
    workCenters: [{ id: 1, name: 'Tornitura', hourlyRate: 50 }],
    families: [{ id: 7, name: 'Meccanico', subs: [{ id: 8, name: 'Cuscinetti' }] }],
    items: [
      { id: 10, code: 'MAC', name: 'Macchina', type: 'macchina', uom: 'pz', sigla: 'MAC' },
      { id: 11, code: 'GRP', name: 'Gruppo', type: 'gruppo', uom: 'pz', machineItemId: 10 },
      { id: 12, code: 'PRT', name: 'Parte', type: 'parte', uom: 'pz',
        machineItemId: 10, groupItemId: 11,
        cycle: [{ kind: 'mat', itemId: 13 }, { kind: 'op', workCenterId: 1, cost: 5 }] },
      { id: 13, code: 'ACQ', name: 'Cuscinetto', type: 'acquistato', uom: 'pz', purchasePrice: 20,
        supplierId: 5, familyId: 7, subFamilyId: 8,
        priceList: [{ id: 'q1', supplierId: 6, price: 19, date: '2026-01-01' }] },
    ],
    revisions: [{ id: 'r1', itemId: 11, rev: 'A', snapshot: {} }],
    movements: [{ id: 'mv1', itemId: 13, kind: 'rettifica', qty: 3, date: '2026-01-01' }],
    rfqs: [{ id: 'rq1', number: 'RDO-1', supplierId: 5, status: 'bozza',
      lines: [{ id: 'rl1', itemId: 13, qty: 1 }] }],
    orders: [{ id: 'od1', number: 'ODA-1', supplierId: 6, status: 'bozza',
      lines: [{ id: 'ol1', itemId: 13, qty: 1 }] }],
    plans: [{ id: 'pl1', number: 'PIA-1', lines: [{ id: 'pln1', itemId: 10, qty: 1 }] }],
    settings: { overheadPct: 0, marginPct: 0, currency: '€' },
  };
}

describe('migrateV2 — nessun riferimento resta indietro', () => {
  it('ogni campo dichiarato in REFS punta a un record che esiste', () => {
    const app = caricato(legacyCompleto());
    const db = app.snapshot();
    const insiemi = {
      item: new Set(db.items.map(r => r.id)),
      supplier: new Set(db.suppliers.map(r => r.id)),
      workCenter: new Set(db.workCenters.map(r => r.id)),
      family: new Set(db.families.map(f => f.id)),
      subFamily: new Set(db.families.reduce((a, f) => a.concat((f.subs || []).map(s => s.id)), [])),
    };
    const refs = JSON.parse(app.eval('JSON.stringify(REFS)'));
    const mancanti = [];
    const controlla = (dove, rec, campi) => {
      Object.keys(campi).forEach(k => {
        if (rec[k] == null) return;
        if (!insiemi[campi[k]].has(rec[k])) mancanti.push(dove + '.' + k + ' = ' + JSON.stringify(rec[k]));
      });
    };
    Object.keys(refs).forEach(coll => {
      const def = refs[coll];
      (db[coll] || []).forEach((rec, i) => {
        if (def.fields) controlla(coll + '[' + i + ']', rec, def.fields);
        Object.keys(def.children || {}).forEach(figlio => {
          (rec[figlio] || []).forEach((r, j) => controlla(coll + '[' + i + '].' + figlio + '[' + j + ']', r, def.children[figlio]));
        });
      });
    });
    assert.deepEqual(mancanti, [], 'riferimenti rimasti a un id che non esiste più');
  });

  it('nessun id numerico legacy sopravvive da nessuna parte', () => {
    const db = caricato(legacyCompleto()).snapshot();
    const interi = [];
    const cerca = (v, dove) => {
      if (Array.isArray(v)) { v.forEach((x, i) => cerca(x, dove + '[' + i + ']')); return; }
      if (!v || typeof v !== 'object') return;
      Object.keys(v).forEach(k => {
        if (/Id$/.test(k) && typeof v[k] === 'number') interi.push(dove + '.' + k + ' = ' + v[k]);
        cerca(v[k], dove + '.' + k);
      });
    };
    Object.keys(db).forEach(k => cerca(db[k], k));
    assert.deepEqual(interi, [], 'campi *Id ancora interi dopo la migrazione');
  });

  it('la quotazione cita il proprio fornitore, non quello dell\'articolo', () => {
    const db = caricato(legacyCompleto()).snapshot();
    const acq = db.items.find(i => i.code === 'ACQ');
    const alfa = db.suppliers.find(s => s.name === 'Alfa');
    const beta = db.suppliers.find(s => s.name === 'Beta');
    assert.equal(acq.supplierId, alfa.id, 'il fornitore in uso');
    assert.equal(acq.priceList[0].supplierId, beta.id, 'e la quotazione resta di chi era');
  });

  it('macchina e gruppo di una parte seguono le nuove chiavi', () => {
    const db = caricato(legacyCompleto()).snapshot();
    const byCode = c => db.items.find(i => i.code === c);
    assert.equal(byCode('PRT').machineItemId, byCode('MAC').id);
    assert.equal(byCode('PRT').groupItemId, byCode('GRP').id);
    assert.equal(byCode('GRP').machineItemId, byCode('MAC').id);
  });
});

// Il seed del listino gira dentro migrateDB, cioè **prima** delle migrazioni
// versionate: scriveva 's1' nella riga di listino e nessuno la rimappava più.
// Ogni installazione nuova nasceva con tre quotazioni intestate a un fornitore
// inesistente, che in Gestione comparivano come «senza fornitore».
describe('Primo avvio su un archivio vuoto', () => {
  it('nessuna quotazione del seed resta senza il suo fornitore', () => {
    const app = loadApp({ silent: true });
    app.ref('Store').load();
    const db = app.snapshot();
    const sup = new Set(db.suppliers.map(s => s.id));
    const orfane = db.items.reduce((a, i) => a.concat((i.priceList || [])
      .filter(r => r.supplierId && !sup.has(r.supplierId))
      .map(r => i.code + ' → ' + r.supplierId)), []);
    assert.deepEqual(orfane, []);
  });
});

// Un blob illeggibile è quasi tutto ancora lì, e un recupero a mano ne salva la
// maggior parte. Ripartire dai dati demo *e salvarli sopra* cancellava l'unica
// copia rimasta prima che qualcuno potesse guardarla.
describe('Archivio locale illeggibile', () => {
  const troncato = '{"items":[{"id":"x","code":"AAA"';
  const conTroncato = () => {
    const app = loadApp({ silent: true });
    app.seedStorage(troncato);
    app.ref('Store').load();
    return app;
  };
  it('il blob originale non viene sovrascritto', () => {
    assert.equal(conTroncato().storage.getItem('bomtrack_v1'), troncato);
  });
  it('e ne resta una copia messa da parte', () => {
    assert.equal(conTroncato().storage.getItem('bomtrack_v1_illeggibile'), troncato);
  });
  it('il fatto viene registrato, non solo scritto in console', () => {
    const app = conTroncato();
    assert.equal(app.eval('dbLoadError && dbLoadError.kind'), 'parse');
    assert.equal(app.eval('dbLoadError.rescued'), true);
  });
  it('la seconda copia non calpesta la prima', () => {
    const app = conTroncato();
    app.seedStorage('{"altro":');
    app.ref('Store').load();
    assert.equal(app.storage.getItem('bomtrack_v1_illeggibile'), troncato, 'vale la prima, che è quella buona');
  });
  it('un archivio sano continua a caricarsi e a salvarsi', () => {
    const app = loadApp({ silent: true });
    app.ref('Store').load();
    assert.equal(app.eval('dbLoadError'), null);
    assert.ok(app.storage.getItem('bomtrack_v1'), 'il primo avvio salva il database iniziale');
  });
});
