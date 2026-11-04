// La scheda articolo a sottoschede (dalla 0.139.0): Anagrafica, Acquisto,
// Magazzino e Tecnico, e i campi nuovi peso lordo, codice a barre e
// riferimento disegno.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm, comp } = require('./fixtures.js');

const js = (a, expr) => JSON.parse(a.eval(`JSON.stringify(${expr})`));
function app() {
  const a = loadApp({ silent: true });
  a.setDb(makeDb({
    items: [mat('lam', 2), acq('vite', 1), acq('dado', 1),
      parte('p', { components: [comp('lam', 3)], cycle: [] }),
      asm('grp', 'gruppo', { components: [comp('p', 2), comp('vite', 4)] })],
  }));
  a.asRole('admin');
  return a;
}
// Il blocco di una sottoscheda nel modello della scheda.
function pane(html, k) {
  const m = html.match(new RegExp(`<section class="it-pane" id="it-tab-${k}"[\\s\\S]*?</section>`));
  return m ? m[0] : '';
}

describe('Sottoschede della scheda articolo', () => {
  it('ogni tipo ha le sue: un assieme non si compra e non sta a scaffale', () => {
    const a = app();
    assert.deepEqual(js(a, "itemTabsFor('acquistato')"), ['ana', 'acq', 'mag', 'tec']);
    assert.deepEqual(js(a, "itemTabsFor('materiale')"), ['ana', 'acq', 'mag', 'tec']);
    assert.deepEqual(js(a, "itemTabsFor('parte')"), ['ana', 'acq', 'mag', 'tec']);
    ['macchina', 'gruppo', 'sottogruppo'].forEach(t => assert.deepEqual(js(a, `itemTabsFor('${t}')`), ['ana', 'tec'], t));
  });

  it('con il Magazzino spento la sottoscheda Magazzino non c\'è', () => {
    const a = app();
    a.eval("db.settings.modules = Object.assign({}, db.settings.modules, { magazzino: false })");
    assert.equal(js(a, "giacenzeVisibili()"), false);
    assert.deepEqual(js(a, "itemTabsFor('acquistato')"), ['ana', 'acq', 'tec']);
  });

  it('ogni campo sta nella sottoscheda del suo argomento', () => {
    const a = app();
    const h = a.eval("itemModalBody(getItem('vite'), 'buy')");
    const ana = pane(h, 'ana'), acqP = pane(h, 'acq'), mag = pane(h, 'mag'), tec = pane(h, 'tec');
    ['it-type', 'it-code', 'it-name', 'it-uom', 'it-family', 'it-favorite', 'it-obsolete', 'it-notes'].forEach(id => assert.match(ana, new RegExp(`id="${id}"`), id));
    ['fld-pricing', 'it-altuom', 'it-altfactor'].forEach(id => assert.match(acqP, new RegExp(`id="${id}"`), id));
    ['it-safety', 'it-lot', 'it-lotmode', 'it-loc', 'it-barcode'].forEach(id => assert.match(mag, new RegExp(`id="${id}"`), id));
    ['it-weight', 'it-grossweight', 'it-volume', 'it-len', 'it-wid', 'it-hei', 'it-mfr', 'it-mfrcode', 'it-sourcing', 'fld-cycle', 'it-drawing'].forEach(id => assert.match(tec, new RegExp(`id="${id}"`), id));
    // Un id compare una volta sola: due copie dello stesso campo si leggerebbero a caso.
    const ids = [...h.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(ids.filter((x, i) => ids.indexOf(x) !== i), []);
  });

  it('la scheda si apre su Anagrafica, e «Parti da» sta sopra le sottoschede', () => {
    const a = app();
    const h = a.eval("itemModalBody(null, 'buy')");
    assert.ok(h.indexOf('id="src-search"') < h.indexOf('class="it-tabs"'), 'il duplicato riempie tutte le sottoschede');
    assert.match(h, /id="it-tab-ana" role="tabpanel" aria-labelledby="it-tabbtn-ana">/, 'Anagrafica visibile');
    assert.match(h, /id="it-tab-tec" role="tabpanel" aria-labelledby="it-tabbtn-tec" style="display:none">/);
    assert.match(h, /role="tablist"/);
  });

  it('cambiare sottoscheda mostra solo quella, e una che il tipo non ha riporta ad Anagrafica', () => {
    const a = app();
    a.eval("editItemModal('vite')");
    a.el('it-type').value = 'acquistato';
    a.eval("itemTab('mag')");
    assert.equal(a.el('it-tab-mag').style.display, '');
    assert.equal(a.el('it-tab-ana').style.display, 'none');
    assert.equal(a.el('it-tabbtn-mag').className, 'it-tabbtn on');
    a.el('it-type').value = 'gruppo';
    a.eval("itemTab('mag')");
    assert.equal(a.eval('itemTabCorrente'), 'ana');
    assert.equal(a.el('it-tabbtn-mag').style.display, 'none', 'il pulsante sparisce');
    assert.equal(a.el('it-tabbtn-acq').style.display, 'none');
  });

  it('riaprire la scheda riparte da Anagrafica', () => {
    const a = app();
    a.eval("editItemModal('vite')");
    a.el('it-type').value = 'acquistato';
    a.eval("itemTab('tec')");
    a.eval("closeModal(); editItemModal('dado')");
    assert.equal(a.eval('itemTabCorrente'), 'ana');
  });

  it('le frecce passano da una sottoscheda alla successiva, e girano', () => {
    const a = app();
    a.eval("editItemModal('grp')");
    a.el('it-type').value = 'gruppo';
    a.eval("itemTab('ana'); itemTabKey({ key: 'ArrowDown', preventDefault() {} })");
    assert.equal(a.eval('itemTabCorrente'), 'tec');
    a.eval("itemTabKey({ key: 'ArrowDown', preventDefault() {} })");
    assert.equal(a.eval('itemTabCorrente'), 'ana');
    a.eval("itemTabKey({ key: 'x', preventDefault() {} })");
    assert.equal(a.eval('itemTabCorrente'), 'ana');
  });

  it('un errore al salvataggio porta alla sottoscheda del campo', () => {
    const a = app();
    a.eval("editItemModal('vite')");
    a.el('it-type').value = 'acquistato';
    a.eval("itemTab('tec')");
    a.el('it-name').value = '';
    a.eval("saveItemEdit('vite')");
    assert.equal(a.eval('itemTabCorrente'), 'ana', 'la descrizione vuota sta in Anagrafica');
  });
});

describe('Campi nuovi: peso lordo, codice a barre, riferimento disegno', () => {
  it('si salvano, e ciascuno solo sui tipi a cui serve', () => {
    const a = app();
    a.eval("editItemModal('vite')");
    a.el('it-grossweight').value = '0,02'; a.el('it-barcode').value = ' 8012345678901 '; a.el('it-drawing').value = 'DIS-1';
    a.eval("readItemTechFields(getItem('vite'))");
    const v = js(a, "getItem('vite')");
    assert.equal(v.grossWeightKg, 0.02);
    assert.equal(v.barcode, '8012345678901');
    assert.equal(v.drawingRef, undefined, 'un commerciale non ha un disegno nostro');
    a.eval("editItemModal('grp')");
    a.el('it-drawing').value = 'DIS-0412 rev. B'; a.el('it-barcode').value = '123';
    a.eval("readItemTechFields(getItem('grp'))");
    const g = js(a, "getItem('grp')");
    assert.equal(g.drawingRef, 'DIS-0412 rev. B');
    assert.equal(g.barcode, undefined, 'un assieme non sta a scaffale');
  });

  it('lo stesso codice a barre non va su due articoli', () => {
    const a = app();
    a.eval("getItem('dado').barcode = '999'");
    a.eval("editItemModal('vite')");
    a.el('it-type').value = 'acquistato';
    a.el('it-name').value = 'Vite'; a.el('it-code').value = getCode(a, 'vite');
    a.el('it-barcode').value = '999';
    assert.match(a.eval("barcodeErr('vite', 'acquistato')"), /già usato da/);
    a.eval("itemTab('ana'); saveItemEdit('vite')");
    assert.equal(a.eval("getItem('vite').barcode"), undefined, 'non salvato');
    assert.equal(a.eval('itemTabCorrente'), 'mag', 'porta al campo, in Magazzino');
    a.el('it-barcode').value = '';
    assert.equal(a.eval("barcodeErr('vite', 'acquistato')"), null);
  });

  it('duplicando un articolo il codice a barre non si copia', () => {
    const a = app();
    a.eval("Object.assign(getItem('vite'), { barcode: '555', grossWeightKg: 0.5 })");
    a.eval("newItemModal('buy')");
    a.el('it-barcode').value = ''; a.el('it-grossweight').value = '';
    a.eval("applyItemSource('vite')");
    assert.equal(a.el('it-barcode').value, '');
    assert.equal(String(a.el('it-grossweight').value), '0.5');
  });

  it('la scheda in sola lettura, lo storico e il file Excel li conoscono', () => {
    const a = app();
    a.eval("Object.assign(getItem('p'), { grossWeightKg: 4.2, drawingRef: 'DIS-7', barcode: '8000' })");
    const h = a.eval("itemInfoTecnici(getItem('p'))");
    assert.match(h, /4,2 kg/); assert.match(h, /DIS-7/); assert.match(h, /8000/);
    assert.equal(a.eval("STORICO_CAMPI.barcode"), 'Codice a barre');
    const parte = js(a, "CAT_COLS_PARTE.map(c => c[0])");
    ['Peso lordo kg', 'Riferimento disegno', 'Codice a barre'].forEach(c => assert.ok(parte.includes(c), c));
    assert.ok(js(a, "CAT_COLS_MACCHINA.map(c => c[0])").includes('Riferimento disegno'));
    assert.ok(!js(a, "CAT_COLS_MACCHINA.map(c => c[0])").includes('Codice a barre'));
    assert.ok(js(a, "CAT_COLS_BUY.map(c => c[0])").includes('Codice a barre'));
    assert.ok(!js(a, "CAT_COLS_BUY.map(c => c[0])").includes('Riferimento disegno'));
  });
});

function getCode(a, id) { return a.eval(`getItem('${id}').code`); }
