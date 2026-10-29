// Barra dei comandi a due livelli: i gruppi del processo (dalla 0.91.0), le
// voci del gruppo aperto su una seconda riga. Il rischio non è il disegno ma la corrispondenza: una vista
// che non sta in nessun gruppo diventa irraggiungibile dalla barra e nessuno se
// ne accorge finché non serve. Il primo test è lì per quello.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb } = require('./fixtures.js');

function app(role) {
  const a = loadApp({ silent: true });
  a.setDb(makeDb({ items: [] }));
  a.asRole(role || 'admin');
  return a;
}
const nav = a => JSON.parse(a.eval('JSON.stringify(NAV)'));

describe('Integrità della barra', () => {
  it('ogni vista dell\'app sta in esattamente un gruppo', () => {
    const a = app();
    const viste = Object.keys(JSON.parse(a.eval('JSON.stringify(VIEW_AREA)')));
    viste.forEach(v => {
      const dentro = nav(a).filter(g => g.views.some(w => w.id === v));
      assert.equal(dentro.length, 1, `la vista "${v}" sta in ${dentro.length} gruppi`);
    });
  });

  it('e nessun gruppo elenca viste che non esistono', () => {
    const a = app();
    const viste = Object.keys(JSON.parse(a.eval('JSON.stringify(VIEW_AREA)')));
    nav(a).forEach(g => g.views.forEach(w =>
      assert.ok(viste.includes(w.id), `il gruppo "${g.id}" elenca la vista sconosciuta "${w.id}"`)));
  });

  it('i gruppi sono quelli richiesti, nell\'ordine', () => {
    assert.deepEqual(nav(app()).map(g => g.label),
      ['Riepilogo', 'Tecnico', 'Pianificazione', 'Acquisti', 'Produzione', 'Magazzino', 'Gestione']);
  });

  it('ogni gruppo tiene le viste del suo processo', () => {
    const g = Object.fromEntries(nav(app()).map(x => [x.id, x.views.map(v => v.id)]));
    assert.deepEqual(g.tech, ['design', 'buy', 'bom', 'report', 'cycles', 'varianti']);
    assert.deepEqual(g.plan, ['jobs', 'mrp', 'load', 'avz']);
    assert.deepEqual(g.buying, ['rfq', 'orders', 'pricelist']);
    assert.deepEqual(g.prod, ['odp', 'odl', 'reparto', 'manutenzione']);
  });
});

describe('navGroups — cosa vede chi', () => {
  it('l\'amministratore vede tutti i gruppi', () => {
    assert.equal(app('admin').eval('navGroups().length'), 7);
  });

  it('gli altri ruoli non vedono Gestione', () => {
    ['acquisti', 'progettazione', 'lettore'].forEach(r => {
      const ids = Array.from(app(r).eval('navGroups().map(g => g.id)'));
      assert.ok(!ids.includes('manage'), `il ruolo ${r} non deve vedere Gestione`);
      assert.equal(ids.length, 6);
    });
  });
});

describe('groupOfView e viewLabel', () => {
  it('ogni vista risale al suo gruppo', () => {
    const a = app();
    assert.equal(a.eval('groupOfView("design").label'), 'Tecnico');
    assert.equal(a.eval('groupOfView("report").label'), 'Tecnico');
    assert.equal(a.eval('groupOfView("orders").label'), 'Acquisti');
    assert.equal(a.eval('groupOfView("load").label'), 'Pianificazione');
    assert.equal(a.eval('groupOfView("odl").label'), 'Produzione');
    assert.equal(a.eval('groupOfView("sconosciuta")'), null);
  });

  it('le voci hanno i nomi nuovi', () => {
    const a = app();
    assert.equal(a.eval('viewLabel("bom")'), 'Gestione DB');
    assert.equal(a.eval('viewLabel("report")'), 'Visualizza DB');
    assert.equal(a.eval('viewLabel("mrp")'), 'Fabbisogno');
    assert.equal(a.eval('viewLabel("sconosciuta")'), '');
  });
});

describe('Memoria del gruppo', () => {
  it('tornando su un gruppo si riapre l\'ultima voce usata', () => {
    const a = app();
    a.eval('setView("cycles")');       // Tecnico → Cicli
    a.eval('setView("orders")');       // Acquisti → Ordini fornitore
    a.eval('openNavGroup("tech")');
    assert.equal(a.eval('activeView'), 'cycles');
    a.eval('openNavGroup("buying")');
    assert.equal(a.eval('activeView'), 'orders');
  });

  it('un gruppo mai visitato apre la sua prima voce', () => {
    const a = app();
    a.eval('openNavGroup("tech")');
    assert.equal(a.eval('activeView'), 'design');
    a.eval('openNavGroup("plan")');
    assert.equal(a.eval('activeView'), 'jobs',
      'le voci del gruppo seguono la catena: commessa → fabbisogno → carico');
    a.eval('openNavGroup("buying")');
    assert.equal(a.eval('activeView'), 'rfq', 'prima si chiede, poi si ordina');
  });

  it('un gruppo inesistente non fa nulla', () => {
    const a = app();
    a.eval('setView("bom")');
    a.eval('openNavGroup("boh")');
    assert.equal(a.eval('activeView'), 'bom');
  });

  it('la memoria segue anche i salti fatti da fuori la barra', () => {
    const a = app();
    a.eval('setView("rfq")');          // come farebbe la ricerca globale
    a.eval('openNavGroup("tech")');
    a.eval('openNavGroup("buying")');
    assert.equal(a.eval('activeView'), 'rfq');
  });
});

describe('Disegno della barra', () => {
  it('la seconda riga elenca le voci del gruppo aperto', () => {
    const a = app();
    a.eval('setView("report")');
    const sub = a.html('sub-nav');
    assert.ok(sub.includes('Gestione DB') && sub.includes('Visualizza DB'));
    assert.ok(sub.includes('subnav-btn active') && sub.includes('>Visualizza DB<'));
    // il gruppo acceso in barra è quello che contiene la vista
    assert.ok(a.html('main-nav').includes('Tecnico'));
  });

  it('con una voce sola la seconda riga resta vuota', () => {
    // Magazzino e Gestione sono i gruppi a voce singola.
    const a = app();
    a.eval('setView("stock")');
    assert.equal(a.html('sub-nav'), '');
    a.eval('setView("manage")');
    assert.equal(a.html('sub-nav'), '');
  });
});

describe('Stampa', () => {
  it('l\'intestazione dice gruppo e voce', () => {
    const a = app();
    a.eval('setView("report")');
    a.eval('printHeadFill()');
    assert.ok(a.html('print-head').includes('Tecnico › Visualizza DB'));
  });

  it('sui gruppi a voce singola basta il nome del gruppo', () => {
    const a = app();
    a.eval('setView("stock")');
    a.eval('printHeadFill()');
    const h = a.html('print-head');
    assert.ok(h.includes('Magazzino'));
    assert.ok(!h.includes('›'));
  });

  it('sui gruppi a piu voci il nome della voce si aggiunge', () => {
    const a = app();
    a.eval('setView("load")');
    a.eval('printHeadFill()');
    assert.ok(a.html('print-head').includes('Pianificazione › Carico centri'));
  });
});

// Il sottotitolo del foglio stampato: quale documento si sta stampando
// (C3 residuo, dalla 0.107.0). Senza, tre fogli di tre ordini diversi escono
// con la stessa intestazione.
describe('Stampa: il documento aperto nel sottotitolo', () => {
  function conDocumenti() {
    const a = loadApp({ silent: true });
    a.setDb(makeDb({
      items: [{ id: 'm1', code: 'MAC-01', name: 'Macchina', type: 'assembly', active: true, components: [] }],
      orders: [{ id: 'o1', number: 'ODA-2026-007', title: 'Viti', date: '2026-02-05', status: 'bozza', active: true, lines: [] }],
      rfqs: [{ id: 'r1', number: 'RDO-2026-003', title: 'Profilati', date: '2026-02-01', status: 'bozza', active: true, lines: [] }],
    }));
    a.asRole('admin');
    return a;
  }
  const sotto = a => a.eval('printSubtitle()');

  it('l\'ordine aperto dà numero e titolo', () => {
    const a = conDocumenti();
    a.eval('setView("orders"); currentOrderId = "o1"');
    assert.equal(sotto(a), 'ODA-2026-007 Viti');
  });
  it('la richiesta d\'offerta aperta, lo stesso', () => {
    const a = conDocumenti();
    a.eval('setView("rfq"); currentRfqId = "r1"');
    assert.equal(sotto(a), 'RDO-2026-003 Profilati');
  });
  it('la distinta aperta dà codice e nome dell\'articolo', () => {
    const a = conDocumenti();
    a.eval('setView("bom"); currentBomId = "m1"');
    assert.equal(sotto(a), 'MAC-01 — Macchina');
  });
  it('un documento sparito non rompe la stampa', () => {
    const a = conDocumenti();
    a.eval('setView("orders"); currentOrderId = "non-esiste"');
    assert.equal(sotto(a), '');
    a.eval('printHeadFill()');
    assert.ok(!/print-sub"> · /.test(a.html('print-head')), 'nessun separatore davanti alla data');
  });
  it('nome dell\'azienda e titoli passano da esc()', () => {
    const a = conDocumenti();
    a.eval('db.settings.company = { name: "Rossi <&> figli" }; db.orders[0].title = "<b>x</b>"');
    a.eval('setView("orders"); currentOrderId = "o1"; printHeadFill()');
    const h = a.html('print-head');
    assert.ok(h.includes('Rossi &lt;&amp;&gt; figli'), h);
    assert.ok(!h.includes('<b>'), h);
  });
  it('printView riempie l\'intestazione prima di aprire la stampa', () => {
    const a = conDocumenti();
    a.eval('setView("orders"); currentOrderId = "o1"');
    a.eval('globalThis.__alla_stampa = null; window.print = () => { globalThis.__alla_stampa = document.getElementById("print-head").innerHTML; }');
    a.eval('printView()');
    assert.ok(String(a.eval('__alla_stampa')).includes('ODA-2026-007 Viti'));
  });
});
