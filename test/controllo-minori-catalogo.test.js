// Controllo generale, i punti minori su catalogo, distinta, numerazione,
// salvataggio e PWA (dalla 0.105.6). Un difetto per prova, riprodotto prima di
// correggerlo.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, asm, comp } = require('./fixtures.js');

const ROOT = path.join(__dirname, '..');

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || makeDb({ items: [mat('m1', 10)] }));
  a.asRole('admin');
  a.eval('globalThis.__avvisi = []; { const vero = showToast; showToast = (m, t, az) => { __avvisi.push(m); return vero(m, t, az); }; } askConfirm = (m, si) => si();');
  return a;
}
const avvisi = a => a.ctx.__avvisi.splice(0);

describe('Un articolo che resta solo in una revisione congelata', () => {
  const conRevisione = () => app(makeDb({
    items: [mat('m1', 10), asm('g1', 'gruppo', { rev: 'B', components: [] })],
    revisions: [{ id: 'r1', itemId: 'g1', rev: 'A', date: '2026-01-01', motivo: '',
      snapshot: { code: 'G1', name: 'Gruppo', type: 'gruppo', components: [comp('m1', 2)], operations: [], cycle: [] } }],
  }));

  it('conta come usato: la Rev A deve poter dire che cosa conteneva', () => {
    const a = conRevisione();
    assert.equal(a.eval('isItemUsedAnywhere("m1")'), true);
  });

  it('e così una riga di ciclo congelata, ma non una lavorazione', () => {
    const a = app(makeDb({
      items: [mat('m1', 10), mat('m2', 5)],
      revisions: [{ id: 'r1', itemId: 'x', rev: 'A', date: '2026-01-01', motivo: '',
        snapshot: { components: [], operations: [], cycle: [{ kind: 'item', itemId: 'm1', qty: 1 }, { kind: 'op', itemId: 'm2' }] } }],
    }));
    assert.equal(a.eval('isItemUsedAnywhere("m1")'), true);
    assert.equal(a.eval('isItemUsedAnywhere("m2")'), false);
  });

  it('l\'eliminazione si ferma, l\'articolo resta', () => {
    const a = conRevisione();
    a.eval('delItem("m1")');
    assert.ok(a.eval('!!getItem("m1")'));
    assert.match(avvisi(a).join(' | '), /non può essere eliminato/);
  });
});

// M -> G -> S1 -> S2 -> S1: il giro non passa dalla radice. In archivio
// condiviso nasce da due modifiche contemporanee, ciascuna lecita da sola.
const conGiro = () => makeDb({ items: [
  asm('m', 'macchina', { components: [comp('g', 1)] }),
  asm('g', 'gruppo', { components: [comp('s1', 1)] }),
  asm('s1', 'gruppo', { name: 'Sotto uno', components: [comp('s2', 1)] }),
  asm('s2', 'gruppo', { name: 'Sotto due', components: [comp('s1', 1)] }),
] });

describe('«Espandi tutto» con un giro chiuso sotto la radice', () => {
  it('si ferma al giro invece di riempire lo stack', () => {
    const a = app(conGiro());
    a.eval('currentBomId = "m"; renderBom = () => {};');
    assert.doesNotThrow(() => a.eval('expandAllBom(true)'));
    const aperti = a.eval('Array.from(bomExpanded)');
    assert.ok(aperti.length >= 3 && aperti.length < 10, 'espansi: ' + aperti.length);
  });
});

describe('Un anello di distinta arrivato dalla sincronizzazione', () => {
  // Ogni PC ha messo una sola delle due righe: l'anello nasce all'arrivo.
  const arriva = a => a.eval(`Store.applicaRemoto(d => {
    d.items.find(i => i.id === 's2').components.push({ itemId: 's1', qty: 1, scrapPct: 0 });
    return 1;
  })`);
  const senzaGiro = () => {
    const d = conGiro();
    d.items.find(i => i.id === 's2').components = [];
    return d;
  };

  it('trova il giro, coi soli articoli che lo fanno', () => {
    const a = app(conGiro());
    const anelli = JSON.parse(a.eval('JSON.stringify(anelliDistinta())'));
    assert.equal(anelli.length, 1);
    assert.deepEqual(anelli[0].slice().sort(), ['s1', 's2']);
  });

  it('alla ricezione compare un avviso che resta, coi codici e il link alla distinta', () => {
    const a = app(senzaGiro());
    assert.equal(a.html('avvisi-fissi'), '');
    arriva(a);
    const h = a.html('avvisi-fissi');
    assert.match(h, /Distinta ad anello/);
    assert.match(h, /S1 → S2 → S1|S2 → S1 → S2/);
    assert.match(h, /apriAnelloDistinta\(/);
    assert.doesNotMatch(h, /\bM\b →/, 'la macchina sopra il giro non ne fa parte');
  });

  it('tolta la riga, al ridisegno della distinta l\'avviso se ne va', () => {
    const a = app(senzaGiro());
    arriva(a);
    a.eval('getItem("s2").components = []; currentBomId = "m"; try { renderBom(); } catch (e) {}');
    assert.equal(a.html('avvisi-fissi'), '');
  });

  it('una distinta senza anelli non ne trova', () => {
    const a = app(senzaGiro());
    assert.equal(a.eval('anelliDistinta().length'), 0);
  });
});

describe('Il codice automatico e i codici scritti in minuscolo o con gli spazi', () => {
  const con = codice => app(makeDb({ items: [Object.assign(mat('m1', 1), { code: codice })] }));

  it('«mat-acc-002» conta: il prossimo MAT-ACC- è il 003', () => {
    assert.equal(con('mat-acc-002').eval('nextCodeForPrefix("MAT-ACC-")'), 'MAT-ACC-003');
  });

  it('e così « MAT-ACC-004 » con lo spazio davanti', () => {
    assert.equal(con(' MAT-ACC-004 ').eval('nextCodeForPrefix("MAT-ACC-")'), 'MAT-ACC-005');
  });

  it('il codice proposto non è mai uno già usato', () => {
    // Il caso dell'Excel importato: MAT-ACC-001 scritto bene, il 002 in minuscolo.
    const a = app(makeDb({ items: [Object.assign(mat('m1', 1), { code: 'MAT-ACC-001' }),
      Object.assign(mat('m2', 1), { code: 'mat-acc-002' })] }));
    const proposto = a.eval('nextCodeForPrefix("MAT-ACC-")');
    assert.equal(a.eval(`!!getItemByCode(${JSON.stringify(proposto)})`), false);
  });
});

describe('Archivio illeggibile e copia di soccorso che non ci sta', () => {
  // Un archivio grande e troncato: lo spazio basta per lui, non per una seconda copia.
  const troncato = '{"items":[' + '{"id":"x","code":"AAA","name":"' + 'x'.repeat(200000) + '"';
  const carica = () => {
    const a = loadApp({ silent: true, quotaBytes: 300000 });
    a.seedStorage(troncato);
    a.eval('globalThis.__modali = []; openModal = h => { __modali.push(h); };');
    a.ref('Store').load();
    a.asRole('admin');
    return a;
  };

  it('l\'esito dice che la copia non è riuscita, e l\'avviso non parla di una copia precedente', () => {
    const a = carica();
    assert.equal(a.storage.getItem('bomtrack_v1_illeggibile'), null, 'la copia non c\'è davvero');
    assert.equal(a.eval('dbLoadError.rescueFailed'), true);
    a.eval('showLoadErrorModal(dbLoadError)');
    const h = a.eval('__modali.join("")');
    assert.doesNotMatch(h, /era già stata messa da parte/);
    assert.match(h, /Non è stato possibile metterne da parte una copia/);
    assert.match(h, /scaricaIlleggibile\(\)/);
  });

  it('il primo salvataggio non scrive i dati d\'esempio sopra l\'originale', () => {
    const a = carica();
    assert.equal(a.eval('Store.commit()'), false);
    assert.equal(a.storage.getItem('bomtrack_v1'), troncato);
    assert.equal(a.eval('Store.isUnsaved()'), true);
  });

  it('scaricato il file, i salvataggi ripartono', () => {
    const a = carica();
    a.eval('scaricaIlleggibile()');
    assert.equal(a.scaricati().slice(-1)[0].contenuto, troncato);
    assert.equal(a.eval('Store.commit()'), true);
  });

  it('con la copia riuscita resta tutto come prima', () => {
    const a = loadApp({ silent: true });
    a.seedStorage('{"items":[');
    a.ref('Store').load();
    assert.equal(a.eval('dbLoadError.rescued'), true);
    assert.equal(a.eval('dbLoadError.rescueFailed'), false);
    assert.equal(a.eval('Store.commit()'), true);
  });
});

describe('Allegati caricati nel database con l\'archivio condiviso', () => {
  const conAllegato = () => {
    const a = app(makeDb({ items: [mat('m1', 1)],
      users: [{ id: 'u-off', name: 'Officina', email: 'o@x.it', role: 'admin', active: true }],
      attachments: [{ id: 'al1', itemId: 'm1', name: 'foto.jpg', size: 10, createdBy: 'u-off', createdAt: '2026-10-01T08:00:00Z' }] }));
    a.eval('cloudAttivo = () => true;');
    return a;
  };

  it('il pulsante dice che il file resta su questo PC', () => {
    const h = conAllegato().eval('allegatiBody("m1")');
    assert.match(h, /Carica file solo su questo PC/);
    assert.match(h, /i colleghi vedranno l'allegato nell'elenco ma non potranno aprirlo/);
  });

  it('senza archivio condiviso resta com\'era', () => {
    const a = app(makeDb({ items: [mat('m1', 1)] }));
    assert.match(a.eval('allegatiBody("m1")'), /Carica file nel database/);
  });

  it('il collega che lo apre sa che sta su un altro PC, e di chi', async () => {
    const a = conAllegato();
    a.eval('allegatoScarica("al1")');
    for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
    const m = avvisi(a).join(' | ');
    assert.match(m, /caricato su un altro PC \(da Officina\)/);
    assert.doesNotMatch(m, /backup JSON/);
  });
});

describe('L\'app installata sul telefono', () => {
  it('non è bloccata in orizzontale: le etichette QR si inquadrano col telefono in piedi', () => {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
    assert.ok(m.orientation === undefined || m.orientation === 'any', 'orientation: ' + m.orientation);
  });
});

describe('Controllo dati: i numeri dei documenti', () => {
  const anno = new Date().getFullYear();
  const oda = (id, n) => ({ id, number: `ODA-${anno}-${String(n).padStart(3, '0')}`, status: 'bozza', date: `${anno}-03-01`, supplierId: null, active: true, lines: [] });
  const conOrdini = ordini => app(makeDb({ items: [], orders: ordini,
    jobs: [{ id: 'c1', number: `COM-${anno - 1}-001`, status: 'aperta', active: true }, { id: 'c3', number: `COM-${anno - 1}-003`, status: 'aperta', active: true }] }));

  it('trova il numero doppio e il buco, nella serie e nell\'anno giusti', () => {
    const a = conOrdini([oda('o1', 1), oda('o2', 8), oda('o3', 8)]);
    const r = JSON.parse(a.eval(`JSON.stringify(controlloSerieDocumenti([${anno}, ${anno - 1}]))`));
    const ordini = r.find(s => s.sigla === 'ODA');
    assert.deepEqual(ordini.doppi.map(d => d.numero), [`ODA-${anno}-008`]);
    assert.deepEqual(ordini.doppi[0].docs.map(d => d.id), ['o2', 'o3']);
    assert.deepEqual(ordini.buchi, [2, 3, 4, 5, 6, 7]);
    const commesse = r.find(s => s.sigla === 'COM');
    assert.equal(commesse.prefisso, `COM-${anno - 1}-`);
    assert.deepEqual(commesse.buchi, [2]);
  });

  it('il riquadro li mostra, coi pulsanti per aprire i documenti', () => {
    const a = conOrdini([oda('o1', 1), oda('o2', 1)]);
    const h = a.eval('renderBackup(); renderSerieDocumenti()');
    assert.match(h, new RegExp(`ODA-${anno}-001`));
    assert.match(h, /apriDocumentoDiSerie\('ODA', &quot;o2&quot;\)/);
    assert.match(h, new RegExp(`COM-${anno - 1}-[\\s\\S]*Manca 1 numero sotto il 003`));
  });

  it('serie in ordine: nessun avviso', () => {
    const a = app(makeDb({ items: [], orders: [oda('o1', 1), oda('o2', 2)] }));
    assert.equal(a.eval(`controlloSerieDocumenti([${anno}]).length`), 0);
    assert.match(a.eval('renderSerieDocumenti()'), /Nessun numero doppio/);
  });
});
