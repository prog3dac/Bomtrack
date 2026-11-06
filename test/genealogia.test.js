// Storia documenti (0.146.0): da cosa è nato un documento e che cosa ha generato.
//
// Le domande:
//  - ogni documento ha un padre solo, il più vicino che esiste ancora;
//  - la famiglia scende dalla radice, la linea è antenati + lui + discendenti;
//  - il grafo mette ogni generazione in una colonna e due nodi non si
//    sovrappongono mai;
//  - le modifiche tecniche «riguardano» i documenti aperti al rilascio;
//  - un clic su un nodo lo mette al centro; la ricerca trova ogni tipo;
//  - sul telefono lo stesso albero diventa un elenco rientrato.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat } = require('./fixtures.js');

function app() {
  const a = loadApp({ silent: true });
  a.asRole('admin');
  a.setDb(makeDb({
    suppliers: [{ id: 'skf', name: 'SKF Italia', active: true }, { id: 'zin', name: 'Zincatura Bassi', active: true }],
    items: [mat('m1', 10), mat('m2', 4), { id: 'asm', code: 'ASM-100', name: 'Telaio', type: 'gruppo', uom: 'pz', active: true }],
    movements: [],
    jobs: [{ id: 'j1', number: 'COM-2026-014', title: 'Linea LX-3', customer: 'Meccanica Rossi', status: 'aperta', date: '2026-09-22' }],
    plans: [{ id: 'p1', number: 'FAB-2026-031', title: 'Fabbisogno LX-3', jobId: 'j1', date: '2026-10-01', lines: [], active: true }],
    rfqs: [{ id: 'r1', number: 'RFQ-2026-044', title: 'Profilati', supplierId: 'skf', planId: 'p1', jobId: 'j1', status: 'chiusa', date: '2026-10-06', lines: [] }],
    orders: [
      { id: 'o1', number: 'ODA-2026-210', title: 'Profilati', supplierId: 'skf', rfqId: 'r1', planId: 'p1', jobId: 'j1', status: 'parziale', date: '2026-10-13',
        lines: [{ id: 'ol1', itemId: 'm1', code: 'M1', qty: 40 }, { id: 'ol2', itemId: 'm2', code: 'M2', qty: 60 }] },
      // Una richiesta eliminata: il padre è il piano, il più vicino che c'è ancora.
      { id: 'o2', number: 'ODA-2026-211', title: 'Viteria', supplierId: 'skf', rfqId: 'sparita', planId: 'p1', status: 'bozza', date: '2026-10-14', lines: [] },
    ],
    prodOrders: [{ id: 'odp1', number: 'ODP-2026-120', itemId: 'asm', code: 'ASM-100', name: 'Telaio', qty: 2, uom: 'pz', planId: 'p1', jobId: 'j1', status: 'corso', date: '2026-10-08', phases: [], materials: [] }],
    // Senza odpId in testata: il legame è sulla riga.
    workOrders: [{ id: 'w1', number: 'ODL-2026-055', title: 'Zincatura', supplierId: 'zin', planId: 'p1', status: 'evaso', date: '2026-10-20',
      lines: [{ id: 'wl1', odpId: 'odp1', qty: 2 }] }],
    inspections: [
      { id: 'c1', number: 'COL-2026-088', source: 'oda', orderId: 'o1', lineId: 'ol2', itemId: 'm2', qty: 60, uom: 'kg', status: 'chiuso', esito: 'respinto', date: '2026-10-27', active: true },
      { id: 'c2', number: 'COL-2026-089', source: 'odl', orderId: 'w1', itemId: 'asm', qty: 2, uom: 'pz', status: 'chiuso', esito: 'accettato', date: '2026-11-03', active: true },
    ],
    nonconformities: [
      { id: 'n1', number: 'NC-2026-012', source: 'fornitore', inspectionId: 'c1', orderId: 'o1', description: 'Quote fuori tolleranza', decision: 'reso', status: 'aperta', date: '2026-10-28', active: true },
      // Dagli scarti di un ODP: nessun collaudo.
      { id: 'n2', number: 'NC-2026-013', source: 'produzione', orderId: 'odp1', productionOrderId: 'odp1', description: 'Scarti', decision: 'rottamazione', status: 'aperta', date: '2026-10-29', active: true },
    ],
    revisions: [
      { id: 'mt1', itemId: 'asm', rev: 'C', ecoNumber: 'MT-2026-007', motivo: 'Foro Ø14', date: '2026-10-29', ecoImpact: [{ k: 'odp', id: 'odp1', number: 'ODP-2026-120' }, { k: 'order', id: 'o1', number: 'ODA-2026-210' }] },
      // Una revisione senza numero MT non è un documento.
      { id: 'rv0', itemId: 'asm', rev: 'B', date: '2026-01-01' },
    ],
    receipts: [
      { id: 'rc1', coll: 'orders', orderId: 'o1', lineId: 'ol1', qty: 40, kind: 'ricevimento', date: '2026-10-23' },
      { id: 'rc2', coll: 'orders', orderId: 'o1', lineId: 'ol2', qty: 60, kind: 'ricevimento', date: '2026-10-27' },
    ],
    settings: { overheadPct: 0, marginPct: 0, currency: '€', modules: { qualita: true } },
  }));
  return a;
}
const J = (a, expr) => JSON.parse(a.eval(`JSON.stringify(${expr})`));
const padre = (a, k, id) => J(a, `(function () { const p = storiaPadre(${JSON.stringify(k)}, storiaGet(${JSON.stringify(k)}, ${JSON.stringify(id)})); return p ? p.k + ':' + p.id : null; })()`);

describe('Il padre di ogni documento', () => {
  it('è il più vicino: l\'ordine viene dall\'offerta, non dal piano o dalla commessa', () => {
    const a = app();
    assert.equal(padre(a, 'order', 'o1'), 'rfq:r1');
    assert.equal(padre(a, 'rfq', 'r1'), 'plan:p1');
    assert.equal(padre(a, 'plan', 'p1'), 'job:j1');
    assert.equal(padre(a, 'odp', 'odp1'), 'plan:p1');
    assert.equal(padre(a, 'job', 'j1'), null);
  });
  it('un documento che non c\'è più si salta: si passa al successivo', () => {
    assert.equal(padre(app(), 'order', 'o2'), 'plan:p1');
  });
  it('l\'ODL trova l\'ODP anche quando il legame è solo sulla riga', () => {
    assert.equal(padre(app(), 'odl', 'w1'), 'odp:odp1');
  });
  it('il collaudo è figlio dell\'ordine che l\'ha aperto, la NC del suo collaudo o dell\'ODP degli scarti', () => {
    const a = app();
    assert.equal(padre(a, 'insp', 'c1'), 'order:o1');
    assert.equal(padre(a, 'insp', 'c2'), 'odl:w1');
    assert.equal(padre(a, 'nc', 'n1'), 'insp:c1');
    assert.equal(padre(a, 'nc', 'n2'), 'odp:odp1');
  });
});

describe('Famiglia e linea', () => {
  it('la famiglia scende dalla radice, la linea tiene antenati e discendenti', () => {
    const a = app();
    const g = J(a, `(function () { const g = storiaGrafo('order:o1', 'famiglia'); return { radice: g.radice, nodi: g.nodi, linea: [...g.linea], mt: g.mt }; })()`);
    assert.equal(g.radice, 'job:j1');
    assert.equal(g.nodi.length, 11);
    assert.deepEqual(g.linea.sort(), ['insp:c1', 'job:j1', 'nc:n1', 'order:o1', 'plan:p1', 'rfq:r1']);
    assert.deepEqual(g.mt, ['rev:mt1']);
    const l = J(a, `storiaGrafo('order:o1', 'linea').nodi`);
    assert.deepEqual(l.sort(), ['insp:c1', 'job:j1', 'nc:n1', 'order:o1', 'plan:p1', 'rfq:r1']);
  });
  it('oltre il limite la famiglia diventa la sola linea, e lo dice', () => {
    const a = app();
    a.eval(`for (let i = 0; i < 90; i++) db.orders.push({ id: 'x' + i, number: 'ODA-X' + i, planId: 'p1', status: 'bozza', date: '2026-10-10', lines: [] })`);
    const g = J(a, `(function () { const g = storiaGrafo('nc:n1', 'famiglia'); return { troppi: g.troppi, modo: g.modo, n: g.nodi.length }; })()`);
    assert.deepEqual(g, { troppi: true, modo: 'linea', n: 6 });
  });
  it('una modifica tecnica al centro mostra i documenti che riguarda', () => {
    const g = J(app(), `storiaGrafo('rev:mt1', 'famiglia').nodi`);
    assert.deepEqual(g, ['rev:mt1', 'odp:odp1', 'order:o1']);
  });
});

describe('Il grafo', () => {
  it('una colonna per generazione, e nessun nodo sopra un altro', () => {
    const a = app();
    const L = J(a, `(function () { const L = storiaLayout(storiaGrafo('order:o1', 'famiglia')); return [...L.pos.entries()]; })()`);
    const pos = new Map(L);
    assert.equal(pos.get('job:j1').col, 0);
    assert.equal(pos.get('plan:p1').col, 1);
    assert.equal(pos.get('order:o1').col, 3);
    assert.equal(pos.get('nc:n1').col, 5);
    const posti = L.map(([, p]) => p.col + '/' + p.row);
    assert.equal(new Set(posti).size, posti.length);
  });
  it('disegna i numeri, mette in evidenza il documento scelto e la sua linea', () => {
    const a = app();
    a.eval(`storiaApri('order', 'o1')`);
    assert.equal(a.eval('activeView'), 'storia');
    const h = a.html('view-storia');
    ['COM-2026-014', 'FAB-2026-031', 'RFQ-2026-044', 'ODA-2026-210', 'COL-2026-088', 'NC-2026-012', 'MT-2026-007', 'ODL-2026-055'].forEach(n => assert.match(h, new RegExp(n)));
    assert.match(h, /storia-nodo is-focus[^>]*>[\s\S]*?ODA-2026-210/);
    assert.match(h, /storia-arco accesa/);
    assert.match(h, /storia-arco tratto/);
    // Il riquadro sotto: da dove viene, i figli, i ricevimenti.
    assert.match(h, /Nato da[\s\S]*RFQ-2026-044/);
    assert.match(h, /Ricevimenti[\s\S]*M2/);
  });
  it('un clic su un nodo lo mette al centro', () => {
    const a = app();
    a.eval(`storiaApri('order', 'o1')`);
    a.eval(`storiaCentra('nc:n1')`);
    assert.deepEqual(J(a, 'storiaFocus'), { k: 'nc', id: 'n1' });
    assert.match(a.html('view-storia'), /storia-nodo is-focus[^>]*>[\s\S]*?NC-2026-012/);
  });
  it('«Solo la linea» toglie i rami che non c\'entrano', () => {
    const a = app();
    a.eval(`storiaApri('order', 'o1')`);
    a.eval(`storiaSetModo('linea')`);
    assert.doesNotMatch(a.html('view-storia'), /ODL-2026-055/);
    a.eval(`storiaSetModo('famiglia')`);
    assert.match(a.html('view-storia'), /ODL-2026-055/);
  });
  it('sul telefono diventa un elenco rientrato', () => {
    const a = app();
    a.eval('innerWidth = 390');
    a.eval(`storiaApri('order', 'o1')`);
    const h = a.html('view-storia');
    assert.match(h, /storia-elenco/);
    assert.doesNotMatch(h, /storia-tela/);
    assert.match(h, /storia-riga is-focus/);
  });
  it('senza documento scelto spiega cosa fare', () => {
    const a = app();
    a.eval(`setView('storia')`);
    assert.match(a.html('view-storia'), /Scegli un documento/);
  });
});

describe('La ricerca', () => {
  it('trova ogni tipo, per numero, oggetto o fornitore', () => {
    const a = app();
    const num = q => J(a, `storiaCerca(${JSON.stringify(q)}).map(h => h.numero)`);
    assert.deepEqual(num('NC-2026-012'), ['NC-2026-012']);
    assert.deepEqual(num('MT-2026'), ['MT-2026-007']);
    assert.ok(num('zincatura bassi').includes('ODL-2026-055'));
    assert.ok(num('meccanica rossi').includes('COM-2026-014'));
    assert.deepEqual(num(''), []);
  });
  it('scrivere ridisegna solo i risultati, e un risultato apre la storia', () => {
    const a = app();
    a.eval(`setView('storia')`);
    a.eval(`storiaCercaInput('COL-2026-089')`);
    assert.match(a.html('storia-ris'), /COL-2026-089/);
    a.eval(`storiaApri('insp', 'c2')`);
    assert.match(a.html('view-storia'), /storia-nodo is-focus[^>]*>[\s\S]*?COL-2026-089/);
  });
});

describe('Il pulsante Storia', () => {
  it('c\'è sui documenti, e porta alla storia di quel documento', () => {
    const a = app();
    assert.match(a.eval(`storiaBtn('odp', 'odp1')`), /storiaApri\(&quot;odp&quot;,&quot;odp1&quot;\)/);
    a.eval(`setView('odp'); openOdpEdit('odp1')`);
    assert.match(a.html('view-odp'), /storiaApri/);
    a.eval(`setView('jobs'); openJobEdit('j1')`);
    assert.match(a.html('view-jobs'), /storiaApri/);
  });
  it('apre il documento nella sua vista', () => {
    const a = app();
    a.eval(`storiaApriDocumento('nc', 'n1')`);
    assert.equal(a.eval('activeView'), 'nc');
    a.eval(`storiaApriDocumento('order', 'o1')`);
    assert.equal(a.eval('activeView'), 'orders');
  });
});
