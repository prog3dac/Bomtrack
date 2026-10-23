// Export Excel e PDF del fabbisogno: devono portare quello che la scheda del
// piano mostra. Prima della 0.112.0 mancavano la testata (consegna, commessa,
// note), le righe a piano con la data fattibile, le date d'ordine, le note
// delle righe d'acquisto, l'avanzamento delle parti, le parti dal magazzino e
// gli assiemi da montare: chi riceveva il foglio doveva tornare all'app.
//
// Come export-docs.test.js: jsPDF e SheetJS sono due finti che annotano quello
// che ricevono, e si verifica quello.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm, comp, wc } = require('./fixtures.js');

const FINTI = `
  scaricati.length = 0;
  jspdf = { jsPDF: function (opts) {
    const self = this;
    self.opts = opts || null;
    self.tabelle = []; self.testi = [];
    self.lastAutoTable = { finalY: 40 };
    self.setFontSize = function () { return self; };
    self.setTextColor = function () { return self; };
    self.text = function (t) { self.testi.push(Array.isArray(t) ? t.join('') : String(t)); };
    self.autoTable = function (cfg) { self.tabelle.push(cfg); };
    self.save = function (nome) { scaricati.push({ tipo: 'pdf', nome: nome, doc: self }); };
  } };
  XLSX = { utils: {
      aoa_to_sheet: function (data) { return { _data: data }; },
      book_new: function () { return { fogli: [] }; },
      book_append_sheet: function (wb, ws, nome) { wb.fogli.push({ nome: nome, ws: ws }); },
    },
    writeFile: function (wb, nome) { scaricati.push({ tipo: 'xlsx', nome: nome, wb: wb }); },
  };
`;

function app() {
  const a = loadApp({ silent: true });
  a.eval(FINTI);
  a.setDb(makeDb({
    suppliers: [{ id: 's1', name: 'SKF Italia', active: true }, { id: 'beta', name: 'Beta', active: true }],
    jobs: [{ id: 'j1', number: 'COM-2026-004', customer: 'Rossi', status: 'aperta' }],
    workCenters: [wc('tor', 40), wc('zin', 30)],
    items: [
      acq('vite', 2),
      Object.assign(mat('tondo', 5), { uom: 'kg' }),
      parte('perno', { cycle: [
        { kind: 'item', itemId: 'tondo', qty: 2 },
        { kind: 'op', workCenterId: 'tor', supplierId: '', costMode: 'orario', hours: 0.5, rate: 40, note: '' },
        { kind: 'op', workCenterId: 'zin', supplierId: 'beta', costMode: 'fisso', cost: 3, hours: 0.1, note: '' },
      ] }),
      asm('grp', 'gruppo', { components: [comp('perno', 3), comp('vite', 4)] }),
    ],
    plans: [{ id: 'pl1', number: 'FAB-2026-001', title: 'Lotto ottobre', date: '2026-07-01',
      dueDate: '2026-10-02', jobId: 'j1', notes: 'Urgente per fiera',
      lines: [{ id: 'l1', itemId: 'grp', qty: 2, dueDate: '2026-10-02' }], active: true }],
  }));
  a.asRole('admin');
  return a;
}
const scaricato = a => JSON.parse(a.eval('JSON.stringify(scaricati[0])'));
const foglio = (x, nome) => (x.wb.fogli.find(f => f.nome === nome) || {}).ws._data;
const col = (righe, nome) => righe[0].indexOf(nome);

describe('Fabbisogno — export Excel', () => {
  it('ha un foglio Piano con testata, righe a piano e riepilogo', () => {
    const a = app();
    a.eval("exportMrpExcel('pl1')");
    const x = scaricato(a);
    assert.equal(x.nome, 'Fabbisogno_FAB-2026-001.xlsx');
    assert.deepEqual(x.wb.fogli.map(f => f.nome).slice(0, 4), ['Piano', 'Acquisti', 'Conto lavoro', 'Produzione']);
    const p = foglio(x, 'Piano');
    const val = k => (p.find(r => r[0] === k) || [])[1];
    assert.equal(val('Titolo'), 'Lotto ottobre');
    assert.equal(val('Commessa'), 'COM-2026-004 — Rossi');
    assert.equal(val('Note'), 'Urgente per fiera');
    assert.ok(val('Consegna richiesta'));
    const testa = p.findIndex(r => r[1] === 'Da produrre');
    assert.deepEqual(p[testa], ['Codice', 'Da produrre', 'U.M.', 'Quantità', 'Serve per', 'Fattibile', 'Margine']);
    assert.equal(p[testa + 1][0], 'GRP');
    assert.equal(p[testa + 1][3], 2);
    assert.ok(p[testa + 1][4], 'la data in cui serve');
    assert.equal(val('Articoli da comprare'), 2);
  });

  it('gli acquisti portano date d\'ordine e note', () => {
    const a = app();
    a.eval("exportMrpExcel('pl1')");
    const acq = foglio(scaricato(a), 'Acquisti');
    ['Serve per', 'Ordinare entro', 'Giorni consegna', 'Note'].forEach(c => assert.ok(col(acq, c) >= 0, c));
    const vite = acq.find(r => r[0] === 'VITE');
    assert.equal(vite[col(acq, 'Quantità')], 8);
    assert.ok(vite[col(acq, 'Serve per')]);
    const tot = acq[acq.length - 1];
    assert.equal(tot[1], 'TOTALE');
    assert.equal(tot[col(acq, 'Importo (€)')], 8 * 2 + 12 * 5);
  });

  it('nel netto ci sono anche scorta minima e libero', () => {
    const a = app();
    a.eval('mrpNet = true; exportMrpExcel(\'pl1\')');
    const acq = foglio(scaricato(a), 'Acquisti');
    ['Lordo', 'Esistente', 'Scorta minima', 'Impegnato', 'Libero', 'In arrivo', 'Da comprare'].forEach(c => assert.ok(col(acq, c) >= 0, c));
  });

  it('la produzione porta data, fatti e restano, e il conto lavoro il totale', () => {
    const a = app();
    a.eval("exportMrpExcel('pl1')");
    const x = scaricato(a);
    const pr = foglio(x, 'Produzione');
    const perno = pr.find(r => r[0] === 'PERNO');
    assert.equal(perno[col(pr, 'Quantità')], 6);
    assert.equal(perno[col(pr, 'Fatti')], 0);
    assert.equal(perno[col(pr, 'Restano')], 6);
    assert.ok(perno[col(pr, 'Serve per')]);
    const cl = foglio(x, 'Conto lavoro');
    assert.equal(cl[1][4], 'Beta');
    assert.equal(cl[cl.length - 1][1], 'TOTALE');
    assert.equal(cl[cl.length - 1][col(cl, 'Importo (€)')], 18);
  });

  it('gli assiemi da montare hanno il loro foglio', () => {
    const a = app();
    a.eval("exportMrpExcel('pl1')");
    const m = foglio(scaricato(a), 'Da montare');
    assert.ok(m, 'foglio Da montare');
    assert.equal(m[1][0], 'GRP');
    assert.equal(m[1][col(m, 'Restano')], 2);
  });
});

describe('Fabbisogno — export PDF', () => {
  it('testata completa e una tabella per ogni sezione della scheda', () => {
    const a = app();
    a.eval("exportMrpPDF('pl1')");
    const x = scaricato(a);
    assert.equal(x.nome, 'Fabbisogno_FAB-2026-001.pdf');
    assert.deepEqual(x.doc.opts, { orientation: 'landscape' });
    const testi = x.doc.testi.join('\n');
    assert.match(testi, /Commessa: COM-2026-004/);
    assert.match(testi, /Consegna: /);
    assert.match(testi, /Note: Urgente per fiera/);
    const titoli = x.doc.tabelle.map(t => t.head[0][1]);
    assert.deepEqual(titoli, ['Da produrre', 'Da acquistare', 'Da far lavorare fuori', 'Da fabbricare', 'Da montare']);
    const [piano, buy, , make] = x.doc.tabelle;
    assert.deepEqual(piano.head[0].slice(4), ['Serve per', 'Fattibile', 'Margine']);
    assert.ok(buy.head[0].includes('Ordinare entro') && buy.head[0].includes('Note'));
    assert.ok(make.head[0].includes('Fatti') && make.head[0].includes('Restano'));
  });
});
