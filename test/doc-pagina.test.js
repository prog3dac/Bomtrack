// La pagina di un documento (dalla 0.153.0): numero in alto al centro, comandi
// in una barra a sinistra che resta ferma, testata con i campi a misura.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

function app() {
  const a = loadApp({ silent: true });
  a.setDb(makeDb({
    items: [acq('c1', 12)],
    suppliers: [{ id: 's1', name: 'Rossi', active: true }],
    jobs: [{ id: 'j1', number: 'COM-1', customer: 'Bianchi', title: 'Linea', status: 'aperta', date: '2025-01-01', active: true }],
    plans: [{ id: 'p1', number: 'FAB-1', title: 'Lotto', date: '2025-01-01', lines: [], active: true, jobId: 'j1' }],
    rfqs: [{ id: 'r1', number: 'RFQ-1', title: 't', status: 'bozza', date: '2025-01-01', supplierId: 's1', active: true, lines: [] }],
    orders: [{ id: 'o1', number: 'ODA-1', title: 't', status: 'confermato', date: '2025-01-01', supplierId: 's1', jobId: 'j1', active: true,
      lines: [{ id: 'l1', itemId: 'c1', code: 'c1', description: 'x', uom: 'pz', qty: 3, price: 2, received: 0 }] }],
  }));
  a.asRole('admin');
  return a;
}
const rail = h => { const i = h.indexOf('class="doc-rail"'); return i < 0 ? '' : h.slice(i, h.indexOf('</aside>', i)); };
const testa = h => { const i = h.indexOf('class="doc-head"'); return h.slice(i, h.indexOf('</div>', i)); };

describe('La pagina di un documento', () => {
  it('il numero sta in alto, da solo; i comandi nella barra a sinistra', () => {
    const a = app();
    a.eval('renderOrders(); openOrderEdit("o1")');
    const h = a.html('view-orders');
    assert.match(testa(h), /ODA-1/);
    assert.ok(!/<button/.test(testa(h)), 'in alto nessun pulsante');
    const r = rail(h);
    assert.match(r, /id="order-save-btn"/, 'Salva');
    assert.match(r, /ordMarkAllReceived\('o1'\)/, 'il passo successivo');
    assert.match(r, /exportOrderPDF\('o1'\)/, 'Genera PDF');
    assert.match(r, /exportOrderExcel\('o1'\)/, 'Genera Excel');
    assert.match(r, /homeApri\('job','j1'\)/, 'i collegati');
    assert.match(r, /class="doc-step now"/, 'gli stati');
    assert.match(r, /Sblocca per modifica/, 'la protezione');
  });

  it('PDF ed Excel restano spenti finché l\'ordine non è salvato', () => {
    const a = app();
    a.eval('renderOrders(); openOrderEdit("o1"); orderDirty = true; renderOrders()');
    assert.match(rail(a.html('view-orders')), /class="export-btn-pdf order-export-btn"[^>]*disabled/);
  });

  it('richiesta, ordine di lavoro, commessa e piano hanno la stessa barra', () => {
    const a = app();
    a.eval('renderRfq(); openRfqEdit("r1")');
    assert.match(rail(a.html('view-rfq')), /id="rfq-save-btn"/);
    a.eval('renderJobs(); openJobEdit("j1")');
    assert.match(rail(a.html('view-jobs')), /jobSetField\('j1','status','produzione'\)/);
    const p = a.eval("renderPlanEdit('p1')");
    assert.match(rail(p), /planToggleActive\('p1'\)/);
    assert.match(rail(p), /exportMrpExcel\('p1'\)/);
    assert.ok(!/class="doc-step/.test(rail(p)), 'il piano non ha passi');
  });

  it('la commessa mostra i documenti in tessere cliccabili, col conteggio', () => {
    const a = app();
    a.eval('renderJobs(); openJobEdit("j1")');
    const h = a.html('view-jobs');
    assert.match(h, /class="doc-tessera" role="button" tabindex="0" onclick="apriOrdineDaCommessa\('o1'\)"/);
    assert.match(h, /class="doc-tessera" role="button" tabindex="0" onclick="apriPianoDaCommessa\('p1'\)"/);
    assert.match(h, /Ordini a fornitore <span class="conta-pill">1<\/span>/);
    assert.ok(!/Apri →/.test(h), 'niente più pulsante per riga');
  });

  it('i campi della testata sono larghi quanto il contenuto', () => {
    const a = app();
    a.eval('renderOrders(); openOrderEdit("o1")');
    const h = a.html('view-orders');
    assert.match(h, /class="modal-field campo-s"><label>Data ordine<\/label><input type="date"/);
    assert.match(h, /class="modal-field campo-s"><label>Stato<\/label>/);
    assert.match(CSS, /\.testa > \.campo-s\{flex:0 0 150px\}/);
  });

  it('una nota vuota occupa una riga, una lunga si vede intera fino a sei', () => {
    const a = app();
    assert.equal(a.eval("righeNota('')"), 1);
    assert.equal(a.eval("righeNota('a\\nb\\nc')"), 3);
    assert.equal(a.eval("righeNota('1\\n2\\n3\\n4\\n5\\n6\\n7\\n8')"), 6);
  });

  it('la barra resta ferma sul computer e diventa una fascia in basso sotto i 1100 px', () => {
    assert.match(CSS, /\.doc-rail\{grid-area:rail;position:sticky/);
    assert.match(CSS, /@media\(max-width:1100px\)\{[\s\S]*?\.doc-rail-azioni:has\(button\)\{position:fixed;left:0;right:0;bottom:0/);
    assert.match(CSS, /@media print\{\.doc-page\{display:block\}\.doc-rail\{display:none!important\}/);
  });
});
