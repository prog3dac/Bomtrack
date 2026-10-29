// Export PDF ed Excel degli elenchi.
//
// Quello che si verifica è la **specifica**: l'oggetto che ogni vista produce
// per descrivere il proprio elenco. È la parte pura, ed è quella dove stanno
// gli errori che contano — una riga esportata che a schermo era filtrata via,
// una colonna in più nelle intestazioni che sposta tutti i dati di uno, un
// numero scritto come testo che in Excel non si somma.
//
// Scrivere il file no: `XLSX.writeFile` e `doc.save()` non girano in un
// contesto vm, e `window.jspdf` non esiste proprio. La stessa scelta di
// catalog-xlsx.test.js, che chiama catalogSheets() e non tocca il binario.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm, comp, wc } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || base());
  a.asRole('admin');
  return a;
}
// Un archivio con un po' di tutto: due famiglie, i tre tipi a magazzino, un
// assieme, una commessa, un piano, una richiesta e un ordine.
function base() {
  return makeDb({
    suppliers: [{ id: 's1', name: 'SKF', active: true }, { id: 's2', name: 'Bosch', active: true }],
    families: [{ id: 'f1', name: 'Cuscinetti', kind: 'acquistato', subs: [{ id: 'sf1', name: 'A sfere' }] }],
    workCenters: [wc('w1', 60)],
    items: [
      asm('mac', 'macchina', { components: [comp('c1', 2)] }),
      Object.assign(mat('m1', 10), { uom: 'kg', safetyStock: 50 }),
      Object.assign(acq('c1', 5), { supplierId: 's1', familyId: 'f1', subFamilyId: 'sf1', favorite: true }),
      parte('p1', { cycle: [{ kind: 'item', itemId: 'm1', qty: 3 }, { kind: 'op', workCenterId: 'w1', cost: 25, supplierId: 's2' }] }),
    ],
    jobs: [{ id: 'j1', number: 'COM-2026-001', customer: 'Rossi', title: 'Linea A', status: 'aperta', dueDate: '2026-12-01', active: true }],
    plans: [{ id: 'pl1', number: 'FAB-2026-001', title: 'Lotto 1', date: '2026-08-01', jobId: 'j1', active: true, lines: [{ id: 'l1', itemId: 'mac', qty: 2 }] }],
    rfqs: [{ id: 'r1', number: 'RFQ-2026-001', title: 'Cuscinetti', status: 'inviata', supplierId: 's1', date: '2026-08-01', lines: [{ id: 'x', itemId: 'c1', qty: 10 }], active: true }],
    orders: [{ id: 'o1', number: 'ODA-2026-001', title: 'Cuscinetti', status: 'parziale', supplierId: 's1', date: '2026-08-02', lines: [{ id: 'y', itemId: 'c1', qty: 10, price: 5, received: 4 }], active: true }],
  });
}
const spec = (a, expr) => JSON.parse(a.eval(`JSON.stringify(${expr})`));
// Tutte le specifiche dell'app, per i controlli che valgono per ognuna.
const TUTTE = ['stockExportSpec()', 'catalogExportSpec("buy")', 'catalogExportSpec("design")',
  'cycleExportSpec()', 'jobsExportSpec()', 'planListExportSpec()',
  'rfqListExportSpec()', 'orderListExportSpec()'];
// Imposta i campi filtro di una vista (elementi finti persistenti dell'harness).
function filtra(a, pfx, valori) {
  Object.keys(valori).forEach(k => { a.el(pfx + '-' + k).value = valori[k]; });
}

describe('La forma della specifica vale per tutte le viste', () => {
  it('ogni riga ha tante celle quante intestazioni', () => {
    const a = app();
    TUTTE.forEach(e => {
      spec(a, e).sezioni.forEach(s => {
        s.righe.forEach((r, i) => assert.equal(r.length, s.colonne.length,
          `${e} · ${s.nome} · riga ${i}: ${r.length} celle per ${s.colonne.length} colonne`));
        if (s.totali) assert.equal(s.totali.length, s.colonne.length, `${e} · ${s.nome}: riga totali disallineata`);
      });
    });
  });

  it('ogni specifica ha titolo, slug e almeno una sezione', () => {
    const a = app();
    TUTTE.forEach(e => {
      const sp = spec(a, e);
      assert.ok(sp.titolo, e + ': senza titolo');
      assert.ok(/^[A-Za-z0-9_-]+$/.test(sp.slug), `${e}: slug "${sp.slug}" non va bene in un nome di file`);
      assert.ok(sp.sezioni.length >= 1, e + ': nessuna sezione');
    });
  });

  it('il titolo non contiene emoji: i font del PDF non le hanno', () => {
    const a = app();
    TUTTE.forEach(e => assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(spec(a, e).titolo),
      `${e}: un'emoji nel titolo esce come un quadratino sul PDF`));
  });

  it('le colonne marcate num portano numeri, non testo che gli somiglia', () => {
    const a = app();
    TUTTE.forEach(e => {
      spec(a, e).sezioni.forEach(s => {
        s.colonne.forEach((c, k) => {
          if (!c.num) return;
          s.righe.forEach(r => assert.equal(typeof r[k], 'number',
            `${e} · ${s.nome} · ${c.h}: "${r[k]}" è ${typeof r[k]}, in Excel non si sommerebbe`));
        });
      });
    });
  });

  it('la valuta sta in intestazione, mai dentro una cella', () => {
    const a = app();
    TUTTE.forEach(e => {
      spec(a, e).sezioni.forEach(s => s.righe.forEach(r => r.forEach(v =>
        assert.ok(typeof v !== 'string' || v.indexOf('€') === -1,
          `${e} · ${s.nome}: "${v}" porta la valuta nella cella e rompe le formule`))));
    });
  });
});

describe('Magazzino', () => {
  it('esporta le stesse righe che la tabella mostra', () => {
    const a = app();
    a.eval('renderStock()');
    const righe = spec(a, 'stockExportSpec()').sezioni[0].righe.map(r => r[0]).sort();
    assert.deepEqual(righe, ['C1', 'M1', 'P1'], 'i tipi a magazzino, senza gli assiemi');
    assert.equal(a.eval('stockFilteredRows().length'), 3);
  });

  it('il filtro «sotto scorta» restringe anche l\'export', () => {
    const a = app();
    filtra(a, 'stk', { state: 'sotto' });
    const sp = spec(a, 'stockExportSpec()');
    assert.deepEqual(sp.sezioni[0].righe.map(r => r[0]), ['M1']);
    assert.ok(sp.filtri.some(f => f[0] === 'Stato' && f[1] === 'Sotto la scorta minima'),
      'nel file deve finire l\'etichetta leggibile, non il valore interno');
  });

  it('porta esistente, in arrivo, impegnato e libero', () => {
    const a = app();
    a.eval('addMovement("m1", "carico", 100, "")');
    filtra(a, 'stk', { search: 'm1' });
    const r = spec(a, 'stockExportSpec()').sezioni[0].righe[0];
    assert.equal(r[6], 100, 'esistente (dopo l\'ubicazione, dalla 0.101.0)');
    assert.equal(r[10], 50, 'scorta minima');
  });

  it('la paginazione a schermo non taglia l\'export', () => {
    const items = [];
    for (let i = 0; i < 250; i++) items.push(Object.assign(mat('x' + i, 1), { code: 'X' + String(i).padStart(3, '0') }));
    const a = app(makeDb({ items }));
    a.eval('renderStock()');   // ne disegna 200
    assert.equal(spec(a, 'stockExportSpec()').sezioni[0].righe.length, 250,
      'esportare 200 righe di 250 senza dirlo farebbe prendere una decisione su dati monchi');
  });
});

// Un piccolo albero macchina › gruppo › sottogruppo/parte, per i filtri
// Macchina e Gruppo di Progetto e Magazzino.
function conMacchine() {
  return makeDb({
    items: [
      asm('mac1', 'macchina'),
      asm('mac2', 'macchina'),
      asm('grp1', 'gruppo', { machineItemId: 'mac1' }),
      asm('grp2', 'gruppo', { machineItemId: 'mac2' }),
      asm('sg1', 'sottogruppo', { machineItemId: 'mac1', groupItemId: 'grp1' }),
      parte('p1', { machineItemId: 'mac1', groupItemId: 'grp1' }),
      parte('p2', { machineItemId: 'mac2', groupItemId: 'grp2' }),
      acq('c1', 5),
      mat('m1', 10),
    ],
  });
}

// Gli array restano nel contesto vm dell'harness: un confronto diretto con un
// array del contesto di test fallisce per realm diversi, non per contenuto
// diverso. Si passa da JSON, come fa `spec()` più sopra.
const idsOf = (a, expr) => JSON.parse(a.eval(`JSON.stringify((${expr}).map(i => i.id).sort())`));

describe('Filtri Macchina e Gruppo', () => {
  it('in Progetto, la macchina porta con sé gruppo, sottogruppo e parte', () => {
    const a = app(conMacchine());
    filtra(a, 'des', { machine: 'mac1' });
    assert.deepEqual(idsOf(a, 'catalogFilteredRows("design")'), ['grp1', 'mac1', 'p1', 'sg1']);
  });

  it('il gruppo restringe ulteriormente, senza la macchina stessa', () => {
    const a = app(conMacchine());
    filtra(a, 'des', { group: 'grp1' });
    assert.deepEqual(idsOf(a, 'catalogFilteredRows("design")'), ['grp1', 'p1', 'sg1']);
  });

  it('Acquisti non ha questi filtri: leggerli dà sempre riga vuota, mai un errore', () => {
    const a = app(conMacchine());
    filtra(a, 'des', { machine: 'mac1' });   // elementi di Progetto, non di Acquisti
    assert.deepEqual(idsOf(a, 'catalogFilteredRows("buy")'), ['c1', 'm1']);
  });

  it('in Magazzino la macchina esclude commerciali e materie prime: solo le parti la portano', () => {
    const a = app(conMacchine());
    filtra(a, 'stk', { machine: 'mac1' });
    assert.deepEqual(idsOf(a, 'stockFilteredRows()'), ['p1']);
  });

  it('l\'export scrive "codice — nome" nel filtro, non l\'id', () => {
    const a = app(conMacchine());
    filtra(a, 'des', { machine: 'mac1' });
    const sp = spec(a, 'catalogExportSpec("design")');
    assert.ok(sp.filtri.some(f => f[0] === 'Macchina' && f[1] === 'MAC1 — Assieme mac1'));
  });
});

describe('Anagrafiche', () => {
  it('Acquisti esporta ciò che si compra, Progetto ciò che si costruisce', () => {
    const a = app();
    assert.deepEqual(spec(a, 'catalogExportSpec("buy")').sezioni[0].righe.map(r => r[0]).sort(), ['C1', 'M1']);
    assert.deepEqual(spec(a, 'catalogExportSpec("design")').sezioni[0].righe.map(r => r[0]).sort(), ['MAC', 'P1']);
  });

  it('rispetta il filtro per tipo e la ricerca', () => {
    const a = app();
    filtra(a, 'buy', { type: 'materiale' });
    assert.deepEqual(spec(a, 'catalogExportSpec("buy")').sezioni[0].righe.map(r => r[0]), ['M1']);
    filtra(a, 'buy', { type: '', search: 'c1' });
    assert.deepEqual(spec(a, 'catalogExportSpec("buy")').sezioni[0].righe.map(r => r[0]), ['C1']);
  });

  it('rispetta anche il filtro dei preferiti, che non è un campo ma un interruttore', () => {
    const a = app();
    a.eval('favOnly = true');
    const sp = spec(a, 'catalogExportSpec("buy")');
    assert.deepEqual(sp.sezioni[0].righe.map(r => r[0]), ['C1']);
    assert.ok(sp.filtri.some(f => f[0] === 'Preferiti' && f[1]));
  });

  it('non è il template d\'import: colonne dell\'elenco, non tutte', () => {
    const a = app();
    const head = spec(a, 'catalogExportSpec("buy")').sezioni[0].colonne.map(c => c.h);
    assert.deepEqual(head.slice(0, 5), ['Codice', 'Descrizione', 'Tipo', 'Famiglia', 'U.M.']);
    assert.ok(head[5].indexOf('Costo unitario') === 0 && head[5].indexOf('€') > 0);
    assert.equal(head.length, 7);
  });
});

describe('Cicli di lavorazione', () => {
  it('due sezioni: la distinta della parte e le fasi', () => {
    const a = app();
    a.eval('currentCycleItemId = "p1"');
    const sp = spec(a, 'cycleExportSpec()');
    assert.deepEqual(sp.sezioni.map(s => s.nome), ['Distinta', 'Ciclo di lavorazione']);
    assert.equal(sp.sezioni[0].righe.length, 1);
    assert.equal(sp.sezioni[1].righe.length, 1);
    assert.equal(sp.sezioni[1].righe[0][0], 10, 'le fasi si numerano 10, 20, 30…');
    assert.equal(sp.sezioni[1].righe[0][1], 'CDL w1');
  });

  it('ogni sezione porta il suo totale', () => {
    const a = app();
    a.eval('currentCycleItemId = "p1"');
    const sp = spec(a, 'cycleExportSpec()');
    assert.equal(sp.sezioni[0].totali[sp.sezioni[0].colonne.length - 1], 30, '3 kg × 10');
    assert.equal(sp.sezioni[1].totali[sp.sezioni[1].colonne.length - 1], 25);
  });

  it('senza righe non inventa una riga di totali', () => {
    const a = app(makeDb({ items: [parte('p9')] }));
    a.eval('currentCycleItemId = "p9"');
    spec(a, 'cycleExportSpec()').sezioni.forEach(s => assert.equal(s.totali, null));
  });

  it('il codice della parte entra nel nome del file, ripulito', () => {
    const a = app(makeDb({ items: [parte('p9', { code: 'PRT/01 A' })] }));
    a.eval('currentCycleItemId = "p9"');
    assert.equal(spec(a, 'cycleExportSpec()').slug, 'ciclo_PRT-01-A');
  });
});

describe('Elenchi di documenti', () => {
  it('le commesse portano stato, cliente, piani e ordinato', () => {
    const a = app();
    const r = spec(a, 'jobsExportSpec()').sezioni[0].righe[0];
    assert.equal(r[0], 'COM-2026-001');
    assert.equal(r[2], 'Rossi');
    assert.equal(r[6], 1, 'un piano collegato');
  });

  it('i piani dicono se sono aperti o chiusi', () => {
    const a = app();
    assert.equal(spec(a, 'planListExportSpec()').sezioni[0].righe[0][2], 'aperto');
    a.eval('planToggleActive("pl1")');
    assert.equal(spec(a, 'planListExportSpec()').sezioni[0].righe[0][2], 'chiuso');
  });

  it('l\'ordine porta anche totale, ordinato e ricevuto; la richiesta no', () => {
    const a = app();
    const ord = spec(a, 'orderListExportSpec()').sezioni[0];
    assert.equal(ord.colonne.length, 9);
    assert.deepEqual(ord.righe[0].slice(6), [50, 10, 4]);
    assert.equal(spec(a, 'rfqListExportSpec()').sezioni[0].colonne.length, 6,
      'su una richiesta i prezzi sono la domanda, non un dato');
  });

  it('gli elenchi documenti rispettano i filtri di stato e fornitore', () => {
    const a = app();
    a.eval('docFilters.order.status = "bozza"');
    assert.equal(spec(a, 'orderListExportSpec()').sezioni[0].righe.length, 0);
    a.eval('docFilters.order.status = "parziale"; docFilters.order.supplierId = "s2"');
    assert.equal(spec(a, 'orderListExportSpec()').sezioni[0].righe.length, 0, 'fornitore sbagliato');
    a.eval('docFilters.order.supplierId = "s1"');
    const sp = spec(a, 'orderListExportSpec()');
    assert.equal(sp.sezioni[0].righe.length, 1);
    assert.ok(sp.filtri.some(f => f[0] === 'Fornitore' && f[1] === 'SKF'));
    assert.ok(sp.filtri.some(f => f[0] === 'Stato' && f[1] === 'Parziale'));
  });
});

describe('Il contorno del file', () => {
  it('senza filtri lo dice, invece di lasciare la riga vuota', () => {
    const a = app();
    assert.equal(a.eval('listFiltersText(stockExportSpec())'), 'nessun filtro');
  });

  it('con più filtri li elenca per esteso', () => {
    const a = app();
    filtra(a, 'stk', { state: 'sotto', type: 'materiale' });
    assert.equal(a.eval('listFiltersText(stockExportSpec())'),
      'Tipo: Materia prima · Stato: Sotto la scorta minima');
  });

  it('il nome del file porta lo slug e la data', () => {
    const a = app();
    const nome = a.eval('listExportName(stockExportSpec(), "xlsx")');
    assert.ok(/^bomtrack_magazzino_\d{4}-\d{2}-\d{2}\.xlsx$/.test(nome), nome);
  });

  it('un codice con barre, due punti o spazi non rompe il nome del file (0.101.1)', () => {
    const a = app();
    const nome = a.eval('listExportName({ slug: "confronto_TUBO Ø40/2_A:B" }, "pdf")');
    assert.ok(/^bomtrack_confronto_TUBO-Ø40-2_A-B_\d{4}-\d{2}-\d{2}\.pdf$/.test(nome), nome);
  });

  it('l\'ordine di produzione si chiama come ODA e ODL: numero e codice (0.101.1)', () => {
    const a = app();
    const nome = a.eval(`listExportName(odpDocSpec({ id: 'x', number: 'ODP-2026-004', code: 'PRT-001', name: 'Fiancata',
      qty: 2, uom: 'pz', status: 'bozza', phases: [], materials: [] }), 'pdf')`);
    assert.equal(nome, 'ODP-2026-004_PRT-001.pdf');
  });

  it('il foglio Estrazione registra azienda, filtri e righe', () => {
    const a = app();
    a.eval('db.settings.company = { name: "Meccanica Rossi" }; saveDB();');
    filtra(a, 'stk', { state: 'sotto' });
    const aoa = JSON.parse(a.eval('JSON.stringify(listInfoAoa(stockExportSpec()))'));
    const trova = k => (aoa.find(r => r[0] === k) || [])[1];
    assert.equal(trova('Azienda'), 'Meccanica Rossi');
    assert.equal(trova('Filtri attivi'), 'Stato: Sotto la scorta minima');
    assert.equal(trova('Righe esportate'), 1);
    assert.equal(trova('Utente'), 'Test');
  });

  it('conta le righe di tutte le sezioni, non solo della prima', () => {
    const a = app();
    a.eval('currentCycleItemId = "p1"');
    assert.equal(a.eval('listRows(cycleExportSpec())'), 2);
  });

  it('un elenco vuoto non produce un file', () => {
    const a = app();
    filtra(a, 'stk', { search: 'zzz-non-esiste' });
    assert.equal(a.eval('exportListXlsx(stockExportSpec())'), false,
      'un file con la sola intestazione fa credere che i dati siano spariti');
    assert.equal(a.eval('exportListPdf(stockExportSpec())'), false);
  });

  it('i nomi dei fogli stanno nei limiti di Excel', () => {
    const a = app();
    TUTTE.forEach(e => spec(a, e).sezioni.forEach(s => {
      const n = a.eval(`sheetName(${JSON.stringify(s.nome)})`);
      assert.ok(n.length <= 31 && !/[:\\/?*[\]]/.test(n), `${e}: nome foglio "${n}" non valido`);
    }));
  });

  it('esportare è una lettura: anche il ruolo lettore ci arriva', () => {
    const a = app();
    a.asRole('lettore');
    const sp = spec(a, 'stockExportSpec()');
    assert.ok(sp.sezioni[0].righe.length > 0, 'nessun roleGuard sugli export di elenco');
  });
});

// jsPDF non gira in un contesto vm, ma quello che va verificato non è la
// libreria: è come la si chiama. Un doppio finto la registra, e permette di
// cogliere l'errore che a occhio non si vede — la testata scritta due volte
// sopra sé stessa quando su una pagina finiscono due sezioni.
function fintoPdf(a, pagine) {
  a.eval(`window.__pdf = { pagine: 1, extra: ${pagine > 1 ? 'true' : 'false'}, testi: [], tabelle: [], salvato: '', totali: 0, orientamento: '' };
    window.jspdf = { jsPDF: function (opts) {
      const st = window.__pdf;
      st.orientamento = (opts && opts.orientation) || 'portrait';
      this.setFontSize = function () {}; this.setTextColor = function () {};
      this.text = function (t) { st.testi.push(String(t)); };
      this.lastAutoTable = { finalY: 100 };
      this.internal = { pageSize: { getWidth: function () { return 297; }, getHeight: function () { return 210; } },
        getNumberOfPages: function () { return st.pagine; } };
      this.autoTable = function (cfg) {
        st.tabelle.push({ colonne: cfg.head[0].length, righe: cfg.body.length, piede: !!cfg.foot, top: cfg.margin.top });
        if (cfg.didDrawPage) cfg.didDrawPage();
        if (st.extra) { st.pagine++; if (cfg.didDrawPage) cfg.didDrawPage(); }
        this.lastAutoTable = { finalY: 100 };
      };
      this.putTotalPages = function () { st.totali++; };
      this.save = function (n) { st.salvato = n; };
    } };`);
  return () => JSON.parse(a.eval('JSON.stringify(window.__pdf)'));
}

describe('Il PDF', () => {
  it('scrive la testata una volta per pagina, anche con due sezioni sulla stessa', () => {
    const a = app();
    a.eval('currentCycleItemId = "p1"');
    const stato = fintoPdf(a, 1);
    assert.equal(a.eval('exportListPdf(cycleExportSpec())'), true);
    const st = stato();
    assert.equal(st.tabelle.length, 2, 'una tabella per sezione');
    const titolo = spec(a, 'cycleExportSpec()').titolo;
    assert.equal(st.testi.filter(t => t === titolo).length, 1,
      'due sezioni sulla stessa pagina non devono scrivere il titolo due volte');
    assert.equal(st.testi.filter(t => t.indexOf('pag. ') === 0).length, 1);
  });

  it('su più pagine la testata torna, e ogni pagina ha il suo numero', () => {
    const a = app();
    const stato = fintoPdf(a, 2);
    a.eval('exportListPdf(stockExportSpec())');
    const st = stato();
    const titolo = spec(a, 'stockExportSpec()').titolo;
    assert.equal(st.testi.filter(t => t === titolo).length, 2, 'la pagina 2 da sola deve dire di che estrazione fa parte');
    assert.ok(st.testi.includes('pag. 1 di {total_pages}'));
    assert.ok(st.testi.includes('pag. 2 di {total_pages}'));
    assert.equal(st.totali, 1, 'il totale delle pagine si sostituisce alla fine');
  });

  it('la tabella comincia sotto la testata, su ogni pagina', () => {
    const a = app();
    a.eval('db.settings.company = { name: "Meccanica Rossi", street: "Via Roma", city: "Modena" }; saveDB();');
    const stato = fintoPdf(a, 1);
    a.eval('exportListPdf(stockExportSpec())');
    const atteso = a.eval('pdfListLayout(stockExportSpec()).top');
    assert.equal(stato().tabelle[0].top, atteso);
    assert.ok(atteso > 30, 'con tre righe di intestazione azienda la tabella non può partire da 14');
  });

  it('molte colonne: foglio orizzontale', () => {
    const a = app();
    const stato = fintoPdf(a, 1);
    a.eval('exportListPdf(stockExportSpec())');       // 11 colonne
    assert.equal(stato().orientamento, 'landscape');
    const b = app();
    const statoB = fintoPdf(b, 1);
    b.eval('exportListPdf(planListExportSpec())');    // 6 colonne
    assert.equal(statoB().orientamento, 'portrait');
  });

  it('il file salvato porta il nome della lista e la data', () => {
    const a = app();
    const stato = fintoPdf(a, 1);
    a.eval('exportListPdf(jobsExportSpec())');
    assert.ok(/^bomtrack_commesse_\d{4}-\d{2}-\d{2}\.pdf$/.test(stato().salvato), stato().salvato);
  });

  it('senza libreria non lancia: avvisa e si ferma', () => {
    const a = app();
    a.eval('window.jspdf = undefined');
    assert.equal(a.eval('exportListPdf(stockExportSpec())'), false);
  });
});

// Stessa idea per Excel: SheetJS vero gira già in vendor-xlsx.test.js su un
// file binario. Qui interessa come lo si chiama — quali fogli, e soprattutto
// dove finisce l'autofiltro, che è il dettaglio che si sbaglia in silenzio.
function fintoXlsx(a) {
  a.eval(`window.__xlsx = { fogli: [], scritto: '' };
    window.XLSX = {
      utils: {
        aoa_to_sheet: function (aoa) { return { aoa: aoa }; },
        book_new: function () { return { fogli: [] }; },
        book_append_sheet: function (wb, ws, nome) { ws.nome = nome; wb.fogli.push(ws); window.__xlsx.fogli.push(ws); },
        encode_range: function (r) { return r.s.r + ',' + r.s.c + ':' + r.e.r + ',' + r.e.c; },
      },
      writeFile: function (wb, nome) { window.__xlsx.scritto = nome; },
    };`);
  return () => JSON.parse(a.eval('JSON.stringify(window.__xlsx)'));
}

describe('L\'Excel', () => {
  it('un foglio per sezione, più il foglio Estrazione', () => {
    const a = app();
    a.eval('currentCycleItemId = "p1"');
    const stato = fintoXlsx(a);
    assert.equal(a.eval('exportListXlsx(cycleExportSpec())'), true);
    assert.deepEqual(stato().fogli.map(f => f.nome), ['Distinta', 'Ciclo di lavorazione', 'Estrazione']);
  });

  it('le intestazioni stanno in riga 1, senza preamboli sopra', () => {
    const a = app();
    const stato = fintoXlsx(a);
    a.eval('exportListXlsx(stockExportSpec())');
    assert.equal(stato().fogli[0].aoa[0][0], 'Codice',
      'righe di contesto sopra l\'intestazione romperebbero autofiltro e riletture');
  });

  it('l\'autofiltro copre i dati e lascia fuori la riga dei totali', () => {
    const a = app();
    a.eval('currentCycleItemId = "p1"');
    const stato = fintoXlsx(a);
    a.eval('exportListXlsx(cycleExportSpec())');
    const distinta = stato().fogli[0];
    assert.equal(distinta.aoa.length, 3, 'intestazione + 1 riga + totali');
    assert.equal(distinta['!autofilter'].ref, '0,0:1,6',
      'con i totali dentro, un ordinamento se li porterebbe in mezzo ai dati');
  });

  it('senza totali l\'autofiltro arriva fino all\'ultima riga', () => {
    const a = app();
    const stato = fintoXlsx(a);
    a.eval('exportListXlsx(stockExportSpec())');   // 3 articoli, 12 colonne
    assert.equal(stato().fogli[0]['!autofilter'].ref, '0,0:3,11');
  });

  it('le larghezze di colonna arrivano al foglio', () => {
    const a = app();
    const stato = fintoXlsx(a);
    a.eval('exportListXlsx(stockExportSpec())');
    const cols = stato().fogli[0]['!cols'];
    assert.equal(cols.length, 12);
    assert.equal(cols[0].wch, 18);
  });

  it('senza libreria non lancia: avvisa e si ferma', () => {
    const a = app();
    a.eval('window.XLSX = undefined');
    assert.equal(a.eval('exportListXlsx(stockExportSpec())'), false);
  });
});

describe('L\'export segue la scelta delle colonne (dalla 0.105.6)', () => {
  const intestazioni = (a, e) => spec(a, e).sezioni[0].colonne.map(c => c.h);
  it('di serie le colonne sono quelle di sempre', () => {
    const a = app();
    assert.deepEqual(intestazioni(a, 'catalogExportSpec("buy")').slice(0, 5), ['Codice', 'Descrizione', 'Tipo', 'Famiglia', 'U.M.']);
    assert.ok(!intestazioni(a, 'catalogExportSpec("buy")').includes('Fornitore'));
  });
  it('accesa «Fornitore», il file la porta, col nome del fornitore', () => {
    const a = app();
    a.eval('colToggle("buy", "supplier")');
    const sp = spec(a, 'catalogExportSpec("buy")');
    const k = sp.sezioni[0].colonne.findIndex(c => c.h === 'Fornitore');
    assert.ok(k >= 0, 'la colonna accesa a schermo deve arrivare nel file');
    const c1 = sp.sezioni[0].righe.find(r => r[0] === 'C1');
    assert.equal(c1[k], 'SKF');
  });
  it('spenta una colonna, il file non la porta; codice e descrizione restano sempre', () => {
    const a = app();
    a.eval('colToggle("buy", "family"); colToggle("buy", "cost")');
    const h = intestazioni(a, 'catalogExportSpec("buy")');
    assert.ok(!h.includes('Famiglia'));
    assert.ok(!h.some(x => /Costo/.test(x)));
    assert.deepEqual(h.slice(0, 2), ['Codice', 'Descrizione']);
  });
  it('anche il magazzino: «Presso terzi» acceso arriva, «Ubicazione» spenta no', () => {
    const a = app();
    a.eval('colToggle("stock", "atsupplier"); colToggle("stock", "location")');
    const sp = spec(a, 'stockExportSpec()');
    const h = sp.sezioni[0].colonne.map(c => c.h);
    assert.ok(h.includes('Presso terzi'));
    assert.ok(!h.includes('Ubicazione'));
    sp.sezioni[0].righe.forEach(r => assert.equal(r.length, h.length));
  });
  it('tutte le colonne accese: ogni riga ha tante celle quante intestazioni, e i numeri sono numeri', () => {
    const a = app();
    ['buy', 'design', 'stock'].forEach(v => a.eval(`COLUMNS[${JSON.stringify(v)}].filter(c => c.defaultHidden).forEach(c => colToggle(${JSON.stringify(v)}, c.key))`));
    ['catalogExportSpec("buy")', 'catalogExportSpec("design")', 'stockExportSpec()'].forEach(e => {
      const s = spec(a, e).sezioni[0];
      s.righe.forEach(r => {
        assert.equal(r.length, s.colonne.length, e);
        s.colonne.forEach((c, k) => { if (c.num) assert.equal(typeof r[k], 'number', e + ' · ' + c.h); });
      });
    });
  });
});

describe('Excel: un testo che comincia come una formula resta testo (dalla 0.105.6)', () => {
  it('=, +, @ e i trattini davanti a una parola si neutralizzano; numeri e trattini soli no', () => {
    const a = app();
    const t = v => a.eval(`xlsxTesto(${JSON.stringify(v)})`);
    assert.equal(t('=HYPERLINK("http://x","clic")'), '\'=HYPERLINK("http://x","clic")');
    assert.equal(t('+39 02 123'), '\'+39 02 123');
    assert.equal(t('@SOMMA(A1)'), '\'@SOMMA(A1)');
    assert.equal(t('-cmd|calc'), '\'-cmd|calc');
    assert.equal(t('\t=1+1'), '\'\t=1+1');
    assert.equal(t('-'), '-');
    assert.equal(t('-3,5'), '-3,5');
    assert.equal(t('Cuscinetto = 6204'), 'Cuscinetto = 6204');
    assert.equal(a.eval('xlsxTesto(-3)'), -3);
  });
});
