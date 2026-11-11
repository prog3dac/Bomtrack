// I menu a tendina delle testate (0.94.0): «Esporta ▾» e «⋯».
// Spostare un pulsante in un menu non deve cambiare cosa fa: gli `onclick`
// sono gli stessi di prima. E Elimina non deve più stare in vista, accanto a
// Salva, dove un clic di troppo costa un documento.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

function app() {
  const a = loadApp({ silent: true });
  a.setDb(makeDb({
    items: [acq('c1', 12)],
    suppliers: [{ id: 's1', name: 'Rossi', active: true }],
    jobs: [{ id: 'j1', number: 'COM-1', customer: 'Bianchi', title: 'Linea', status: 'aperta', date: '2025-01-01', active: true }],
    plans: [{ id: 'p1', number: 'FAB-1', title: 'Lotto', date: '2025-01-01', lines: [], active: true }],
    rfqs: [{ id: 'r1', number: 'RFQ-1', title: 't', status: 'bozza', date: '2025-01-01', supplierId: 's1', active: true, lines: [] }],
    orders: [{ id: 'o1', number: 'ODA-1', title: 't', status: 'bozza', date: '2025-01-01', supplierId: 's1', active: true, lines: [] }],
  }));
  a.asRole('admin');
  return a;
}
// I comandi del documento: dalla 0.152.0 stanno nella barra a sinistra.
const testata = h => { const i = h.indexOf('class="doc-rail"'); assert.ok(i >= 0, 'la barra dei comandi c\'è'); return h.slice(i, h.indexOf('</aside>', i)); };
const fuoriDaiMenu = h => h.replace(/<details class="dd[\s\S]*?<\/details>/g, '');

describe('tendina', () => {
  it('scrive le voci con i loro comandi, e salta quelle nulle', () => {
    const h = app().eval(`tendina('X', [{ label: 'Uno', onclick: 'f()' }, null, { label: 'Due', onclick: 'g()', danger: true }])`);
    assert.match(h, /<details class="dd">/);
    assert.match(h, /onclick="f\(\)"[^>]*>Uno</);
    assert.match(h, /class="dd-item danger"[\s\S]*onclick="g\(\)"/);
  });

  it('senza voci non disegna niente', () => {
    assert.equal(app().eval(`tendina('X', [null])`), '');
  });

  it('«Esporta» porta gli stessi comandi della coppia di pulsanti di prima', () => {
    const h = app().eval(`listExportButtons('jobsExportSpec')`);
    assert.match(h, /onclick="exportListXlsx\(jobsExportSpec\(\)\)"/);
    assert.match(h, /onclick="exportListPdf\(jobsExportSpec\(\)\)"/);
  });

  it('il menu «⋯» ha un nome anche senza testo', () => {
    assert.match(app().eval(`menuAltro([{ label: 'Elimina', onclick: 'x()' }])`), /aria-label="Altri comandi"/);
  });
});

describe('Le testate', () => {
  it('nel piano Duplica ed Elimina stanno nel menu, Esporta in un pulsante solo', () => {
    const h = app().eval("renderPlanEdit('p1')");
    const t = testata(h);
    assert.match(t, /duplicatePlan\('p1'\)/);
    assert.match(t, /delPlan\('p1'\)/);
    assert.ok(!/delPlan|duplicatePlan|exportMrpExcel/.test(fuoriDaiMenu(t)), 'nessuno dei tre resta in vista');
  });

  it('richiesta, ordine e commessa: Elimina non è più accanto a Salva', () => {
    const a = app();
    a.eval('renderRfq(); openRfqEdit("r1")');
    assert.ok(!/delRfq\('r1'\)/.test(fuoriDaiMenu(testata(a.html('view-rfq')))));
    assert.match(a.html('view-rfq'), /delRfq\('r1'\)/);
    a.eval('renderOrders(); openOrderEdit("o1")');
    assert.ok(!/delOrder\('o1'\)/.test(fuoriDaiMenu(testata(a.html('view-orders')))));
    a.eval('renderJobs(); openJobEdit("j1")');
    assert.ok(!/delJob\('j1'\)/.test(fuoriDaiMenu(testata(a.html('view-jobs')))));
    assert.match(a.html('view-jobs'), /delJob\('j1'\)/);
  });
});
