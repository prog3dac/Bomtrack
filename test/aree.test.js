// Le aree attivabili (dalla 0.121.0): la base — anagrafiche, distinta base,
// acquisti e listini — c'è sempre; Magazzino, Pianificazione e Produzione
// interna si accendono e spengono da Gestione → Impostazioni. Il rischio è
// doppio: una vista spenta che resta raggiungibile da qualche porta laterale
// (menu, Riepilogo, calendario, link vecchio), e una vista accesa che esplode
// perché ne cercava una spenta.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, asm, comp, parte, dbCloudCompleto } = require('./fixtures.js');

function app(modules, role) {
  const a = loadApp({ silent: true });
  const db = makeDb({ items: [mat('m1', 10), asm('A1', 'gruppo', { components: [comp('m1', 2)] })] });
  db.settings = Object.assign({}, db.settings, { modules: modules || {} });
  a.setDb(db);
  a.asRole(role || 'admin');
  return a;
}
const viste = a => Array.from(a.eval('navGroups().flatMap(g => navVoci(g).map(v => v.id))'));

describe('Aree: chi è acceso', () => {
  it('un archivio senza impostazioni ha tutte le aree accese', () => {
    const a = app();
    ['magazzino', 'pianificazione', 'produzione'].forEach(k => assert.equal(a.eval(`areaAttiva('${k}')`), true, k));
  });
  it('solo un false esplicito spegne', () => {
    const a = app({ magazzino: false, pianificazione: undefined });
    assert.equal(a.eval("areaAttiva('magazzino')"), false);
    assert.equal(a.eval("areaAttiva('pianificazione')"), true);
  });
  it('la Produzione interna si spegne con la Pianificazione', () => {
    const a = app({ pianificazione: false, produzione: true });
    assert.equal(a.eval("areaAttiva('produzione')"), false);
  });
  it('le viste della base non appartengono a nessuna area', () => {
    const a = app({ magazzino: false, pianificazione: false, produzione: false });
    ['home', 'design', 'buy', 'bom', 'report', 'rfq', 'orders', 'pricelist', 'manage'].forEach(v =>
      assert.equal(a.eval(`vistaAttiva('${v}')`), true, v));
  });
});

describe('Aree: il menu', () => {
  it('con tutto acceso il menu ha ogni vista', () => {
    const v = viste(app());
    ['stock', 'jobs', 'mrp', 'cycles', 'load', 'avz', 'odp', 'odl'].forEach(x => assert.ok(v.includes(x), x));
  });
  it('un\'area spenta toglie le sue viste e i gruppi rimasti vuoti', () => {
    const a = app({ magazzino: false, produzione: false });
    const v = viste(a);
    ['stock', 'cycles', 'load', 'avz', 'odp', 'odl'].forEach(x => assert.ok(!v.includes(x), x));
    ['jobs', 'mrp', 'bom', 'orders'].forEach(x => assert.ok(v.includes(x), x));
    const gruppi = Array.from(a.eval('navGroups().map(g => g.id)'));
    assert.ok(!gruppi.includes('prod'), 'il gruppo Produzione resta senza voci');
  });
  it('setView su una vista spenta torna al Riepilogo', () => {
    const a = app({ magazzino: false });
    a.eval("setView('stock')");
    assert.equal(a.eval('activeView'), 'home');
    a.eval("setView('orders')");
    assert.equal(a.eval('activeView'), 'orders');
  });
});

describe('Aree: le impostazioni', () => {
  it('le caselle delle aree seguono lo stato, e quella che dipende si blocca', () => {
    const a = app({ pianificazione: false });
    const h = a.eval('renderModuliSettings()');
    assert.match(h, /class="set-area" value="magazzino" checked/);
    assert.match(h, /class="set-area" value="pianificazione"  /);
    assert.match(h, /value="produzione"\s+disabled/);
  });
});

describe('Aree: Riepilogo e calendario', () => {
  it('i segnali di un\'area spenta non compaiono', () => {
    const a = app({ pianificazione: false });
    const v = Array.from(a.eval('homeSegnali().map(s => s.vista)'));
    ['jobs', 'mrp', 'cycles', 'odp', 'odl', 'load', 'avz'].forEach(x => assert.ok(!v.includes(x), x));
  });
  it('i filtri del calendario perdono i tipi spenti', () => {
    const a = app({ pianificazione: false });
    const h = a.eval('calFiltriHtml([])');
    assert.ok(!/Commesse|Avvio fasi|Fine produzione|Da ordinare/.test(h));
    assert.match(h, /Consegne e rientri/);
  });
  it('homeApri verso un\'area spenta non apre l\'editor', () => {
    const a = app({ produzione: false });
    a.eval("var aperto = false; openOdpEdit = () => { aperto = true; }; homeApri('odp', 'x')");
    assert.equal(a.eval('aperto'), false);
    assert.equal(a.eval('activeView'), 'home');
  });
});

// Ogni combinazione che un'azienda può scegliere, con un archivio che tocca
// tutte le tabelle: ogni vista rimasta accesa si disegna senza errori, e
// ogni documento si apre.
const COMBINAZIONI = {
  'tutto acceso': {},
  'tutto acceso con i moduli': { alternativi: true, varianti: true, costiReali: true, officina: true, capacita: true },
  'costruttore': { produzione: false },
  'senza magazzino': { magazzino: false },
  'solo la base': { magazzino: false, pianificazione: false, produzione: false },
};
function appCompleta(modules) {
  const a = loadApp({ silent: true });
  const db = dbCloudCompleto();
  db.settings = Object.assign({}, db.settings, { modules });
  a.setDb(db);
  a.asRole('admin');
  return a;
}
describe('Aree: ogni vista accesa si disegna', () => {
  Object.entries(COMBINAZIONI).forEach(([nome, modules]) => {
    it(nome, () => {
      const a = appCompleta(modules);
      viste(a).forEach(v => {
        a.eval(`setView('${v}')`);
        assert.equal(a.eval('activeView'), v, `${nome}: la vista ${v} non si apre`);
      });
      a.eval("Object.keys(MGMT_TABS).forEach((_, i) => { mgmtTab = MGMT_TABS[i].id; setView('manage'); })");
      // I documenti delle viste accese si aprono; quelli delle spente no, senza esplodere.
      a.eval(`(db.plans || []).forEach(p => { setView('mrp'); openPlanEdit(p.id); });
        (db.orders || []).forEach(o => { setView('orders'); openOrderEdit(o.id); });
        (db.prodOrders || []).forEach(o => { setView('odp'); openOdpEdit(o.id); });
        (db.jobs || []).forEach(j => { setView('jobs'); openJobEdit(j.id); });
        (db.items || []).forEach(it => itemInfoModal(it.id));
        (db.items || []).filter(it => it.type === 'parte').forEach(it => homeApri('cycle', it.id));`);
    });
  });
});

describe('Aree: Magazzino spento', () => {
  it('scheda articolo, ispettore e QR non parlano di giacenze', () => {
    const a = app({ magazzino: false });
    assert.equal(a.eval("itemInfoMagazzino(getItem('m1'))"), '');
    assert.equal(a.eval("stockPanelHtml(getItem('m1'))"), '');
    assert.ok(!/Giacenza/.test(a.eval("inspectorSommario(getItem('m1'))")));
    assert.ok(!/Rettifica giacenza|Esistente/.test(a.eval("qrSchedaHtml('art', getItem('m1'))")));
  });
  it('il fabbisogno resta netto sulle giacenze registrate', () => {
    const a = app({ magazzino: false });
    a.eval("addMovement('m1', 'rettifica', 5, 'prova')");
    assert.equal(a.eval("onHandOf('m1')"), 5, 'i movimenti si registrano anche col Magazzino spento');
  });
  it('il cruscotto è dell\'area', () => {
    assert.equal(app({ magazzino: false }).eval("vistaAttiva('dash')"), false);
  });
});

describe('Aree: Produzione interna spenta', () => {
  const conParte = modules => {
    const a = loadApp({ silent: true });
    const db = makeDb({ items: [mat('m1', 10), parte('p1', { cycle: [{ kind: 'mat', itemId: 'm1', qty: 1 }], purchasePrice: 7 })] });
    db.settings = Object.assign({}, db.settings, { modules });
    a.setDb(db); a.asRole('admin');
    return a;
  };
  it('ogni parte si compra, ma il campo scritto non cambia', () => {
    const a = conParte({ produzione: false });
    assert.equal(a.eval("partSourcing(getItem('p1'))"), 'buy');
    assert.equal(a.eval("partSourcingScritto(getItem('p1'))"), 'make');
    assert.equal(conParte({}).eval("partSourcing(getItem('p1'))"), 'make');
  });
  it('i Centri di lavoro escono dalla Gestione', () => {
    const a = conParte({ produzione: false });
    a.eval("mgmtTab = 'workcenters'; renderManage()");
    assert.equal(a.eval('mgmtTab'), 'settings');
    assert.ok(!/Centri di lavoro/.test(a.html('mgmt-tabs')));
  });
});

describe('Aree: il profilo del primo avvio', () => {
  it('Costruttore spegne solo la Produzione interna', () => {
    const a = app();
    a.eval("applicaProfiloAree('costruttore')");
    assert.deepEqual(['magazzino', 'pianificazione', 'produzione'].map(k => a.eval(`areaAttiva('${k}')`)), [true, true, false]);
  });
  it('Solo la base spegne tutte le aree e lascia i moduli', () => {
    const a = app({ varianti: true });
    a.eval("applicaProfiloAree('base')");
    assert.equal(a.eval("areaAttiva('magazzino') || areaAttiva('pianificazione')"), false);
    assert.equal(a.eval('db.settings.modules.varianti'), true);
  });
});
