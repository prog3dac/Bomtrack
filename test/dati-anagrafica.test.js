// Dati tecnici dell'articolo, contatti di fornitori e clienti, fase di consumo
// delle righe di distinta (dalla 0.138.0).

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm, comp, wc } = require('./fixtures.js');

const js = (a, expr) => JSON.parse(a.eval(`JSON.stringify(${expr})`));
function app(dbObj) {
  const a = loadApp({ silent: true });
  a.setDb(dbObj || makeDb({
    workCenters: [wc('tor', 40), wc('ver', 30)],
    suppliers: [{ id: 's1', name: 'SKF', referente: 'Anna', active: true }],
    customers: [{ id: 'c1', name: 'Rossi', active: true }],
    items: [mat('lam', 2), acq('vite', 1), acq('vern', 5),
      parte('p', { components: [comp('lam', 3)], cycle: [] }),
      asm('grp', 'gruppo', { components: [comp('p', 2), comp('vite', 4)] })],
  }));
  a.asRole('admin');
  return a;
}

describe('Dati tecnici: peso, volume, dimensioni', () => {
  it('il volume vuoto è il prodotto delle dimensioni, e lo dice', () => {
    const a = app();
    assert.equal(js(a, "itemVolume({ lengthM: 2, widthM: 0.5, heightM: 0.1 })").value, 0.1);
    assert.equal(js(a, "itemVolume({ lengthM: 2, widthM: 0.5, heightM: 0.1 })").calcolato, true);
    assert.deepEqual(js(a, "itemVolume({ lengthM: 2, volumeM3: 0.3 })"), { value: 0.3, calcolato: false });
    assert.equal(js(a, "itemVolume({ lengthM: 2 })"), null, 'con una dimensione sola non si calcola');
  });

  it('il peso di un assieme senza peso è la somma della distinta', () => {
    const a = app();
    a.eval("getItem('p').weightKg = 1.5; getItem('vite').weightKg = 0.01");
    const w = js(a, "itemWeight(getItem('grp'))");
    approx(w.value, 2 * 1.5 + 4 * 0.01);
    assert.equal(w.calcolato, true);
    assert.equal(w.completo, true);
  });

  it('una materia prima a kg pesa la sua quantità; una riga senza peso fa la somma per difetto', () => {
    const a = app();
    approx(js(a, "itemWeight(getItem('p'))").value, 3, 'tre kg di lamiera');
    const w = js(a, "itemWeight(getItem('grp'))");
    approx(w.value, 6);
    assert.equal(w.completo, false, 'le viti non hanno un peso');
  });

  it('la scheda di modifica li salva, e vuoto vuol dire non scritto', () => {
    const a = app();
    a.eval("editItemModal('vite')");
    a.el('it-len').value = '0,02'; a.el('it-weight').value = '0.012';
    a.el('it-mfr').value = 'Würth'; a.el('it-mfrcode').value = 'W-123';
    a.el('it-material').value = 'non per un commerciale';
    a.eval("readItemTechFields(getItem('vite'))");
    const v = js(a, "getItem('vite')");
    assert.equal(v.lengthM, 0.02);
    assert.equal(v.weightKg, 0.012);
    assert.equal(v.manufacturer, 'Würth');
    assert.equal(v.manufacturerCode, 'W-123');
    assert.equal(v.material, undefined, 'il materiale è delle parti');
    assert.equal('volumeM3' in v, false);
  });

  it('materiale, finitura e trattamento sono delle parti', () => {
    const a = app();
    a.eval("editItemModal('p')");
    a.el('it-material').value = 'S235JR'; a.el('it-finish').value = 'sabbiata'; a.el('it-treatment').value = 'zincatura';
    a.el('it-mfr').value = 'non per una parte';
    a.eval("readItemTechFields(getItem('p'))");
    const p = js(a, "getItem('p')");
    assert.deepEqual([p.material, p.finish, p.treatment, p.manufacturer], ['S235JR', 'sabbiata', 'zincatura', undefined]);
  });

  it('la scheda in sola lettura li mostra', () => {
    const a = app();
    a.eval("Object.assign(getItem('p'), { lengthM: 1.2, widthM: 0.8, heightM: 0.5, material: 'S235JR' })");
    const h = a.eval("itemInfoTecnici(getItem('p'))");
    assert.match(h, /1,2 × 0,8 × 0,5 m/);
    assert.match(h, /0,48 m³ \(dalle dimensioni\)/);
    assert.match(h, /S235JR/);
    assert.match(h, /3 kg \(dalla distinta\)/);
  });

  it('il file degli articoli li esporta e li rilegge', () => {
    const a = app();
    a.eval("Object.assign(getItem('vite'), { weightKg: 0.01, manufacturer: 'Würth', manufacturerCode: 'W-1' })");
    const head = js(a, "CAT_COLS_BUY.map(c => c[0])");
    ['Produttore', 'Codice produttore', 'Lunghezza m', 'Peso kg', 'Volume m3'].forEach(h => assert.ok(head.includes(h), h));
    assert.ok(js(a, "CAT_COLS_PARTE.map(c => c[0])").includes('Trattamento'));
    assert.ok(js(a, "CAT_COLS_GRUPPO.map(c => c[0])").includes('Peso kg'));
    const peso = js(a, "CAT_COLS_BUY.find(c => c[0] === 'Peso kg')[1](getItem('vite'))");
    assert.equal(peso, 0.01);
  });
});

describe('Contatti di fornitori e clienti', () => {
  it('se ne aggiungono quanti servono, e le righe vuote cadono', () => {
    const a = app();
    a.eval("editSupplierModal('s1')");
    a.eval("contattoAggiungi('es'); contattoAggiungi('es'); contattoAggiungi('es')");
    a.el('es-ct-0-name').value = 'Marta'; a.el('es-ct-0-role').value = 'Acquisti'; a.el('es-ct-0-email').value = 'm@skf.it';
    a.el('es-ct-1-name').value = 'Paolo'; a.el('es-ct-1-phone').value = '059 123';
    a.el('es-name').value = 'SKF'; a.el('es-ref').value = 'Anna';
    a.eval("saveSupplier('s1')");
    const c = js(a, "db.suppliers[0].contacts.map(c => [c.name, c.role, c.email, c.phone])");
    assert.deepEqual(c, [['Marta', 'Acquisti', 'm@skf.it', ''], ['Paolo', '', '', '059 123']]);
    assert.equal(a.eval("db.suppliers[0].referente"), 'Anna', 'il referente resta');
    assert.match(a.eval('renderSuppliers()'), /\+2 contatti/);
  });

  it('togliere una riga non perde ciò che è scritto nelle altre', () => {
    const a = app();
    a.eval("editCustomerModal('c1'); contattoAggiungi('ec'); contattoAggiungi('ec')");
    a.el('ec-ct-0-name').value = 'Uno'; a.el('ec-ct-1-name').value = 'Due';
    a.eval("contattoTogli('ec', 0)");
    assert.deepEqual(js(a, "_contattiBozza.ec.map(c => c.name)"), ['Due']);
    // Il DOM finto non rilegge l'innerHTML: si verifica ciò che la scheda ridisegna.
    const h = a.html('ec-contacts');
    assert.match(h, /id="ec-ct-0-name" value="Due"/);
    assert.doesNotMatch(h, /Uno/);
  });

  it('senza contatti il campo non c\'è', () => {
    const a = app();
    a.eval("db.suppliers[0].contacts = [{ id: 'x', name: 'Vecchio' }]; editSupplierModal('s1'); contattoTogli('es', 0)");
    a.el('es-name').value = 'SKF';
    a.eval("saveSupplier('s1')");
    assert.equal(a.eval("'contacts' in db.suppliers[0]"), false);
  });

  it('il foglio Contatti si esporta e si reimporta, sostituendo quelli dell\'anagrafica', () => {
    const a = app();
    a.eval("db.suppliers[0].contacts = [{ id: 'k1', name: 'Marta', role: 'Acquisti', email: 'm@skf.it', phone: '' }]");
    const foglio = js(a, "settingsSheets().find(s => s.key === 'contacts').aoa");
    assert.deepEqual(foglio, [['Anagrafica', 'Nome', 'Contatto', 'Ruolo', 'Email', 'Telefono'], ['Fornitore', 'SKF', 'Marta', 'Acquisti', 'm@skf.it', '']]);
    const rep = js(a, `importSettingsSheets({ Contatti: [
      { Anagrafica: 'Fornitore', Nome: 'skf', Contatto: 'Marta', Ruolo: 'Qualità', Email: 'm@skf.it', Telefono: '' },
      { Anagrafica: 'Cliente', Nome: 'Rossi', Contatto: 'Gino', Ruolo: '', Email: '', Telefono: '333' },
      { Anagrafica: 'Cliente', Nome: 'Nessuno', Contatto: 'X', Ruolo: '', Email: '', Telefono: '' } ] })`);
    assert.equal(rep.errors.length, 1, 'il cliente che non c\'è si segnala');
    assert.deepEqual(js(a, "db.suppliers[0].contacts.map(c => [c.id, c.role])"), [['k1', 'Qualità']], 'stesso nome ed email: stesso id');
    assert.deepEqual(js(a, "db.customers[0].contacts.map(c => c.phone)"), ['333']);
  });
});

describe('Fase di consumo', () => {
  // Una parte con tre fasi da un giorno l'una (8 h su un centro da 8 h al
  // giorno): la vernice si usa alla terza, la lamiera alla prima.
  function conFasi() {
    const op = (w, h) => ({ kind: 'op', workCenterId: w, supplierId: null, costMode: 'fisso', cost: 1, hours: h, days: 0, note: '' });
    const a = app(makeDb({
      workCenters: [Object.assign(wc('tor', 40), { hoursPerDay: 8 }), Object.assign(wc('ver', 30), { hoursPerDay: 8 })],
      items: [mat('lam', 2), acq('vern', 5),
        parte('p', { components: [comp('lam', 3), Object.assign(comp('vern', 1), { opIndex: 2 })],
          cycle: [op('tor', 8), op('tor', 8), op('ver', 8)] })],
      plans: [{ id: 'pl', number: 'FAB-1', title: '', date: '2026-10-01', notes: '', active: true,
        lines: [{ id: 'l1', itemId: 'p', qty: 1, dueDate: '2026-11-20' }] }],
    }));
    return a;
  }

  it('si legge con prudenza: assente, o oltre l\'ultima fase, è la prima', () => {
    const a = conFasi();
    assert.equal(a.eval("faseConsumo({ opIndex: 2 }, getItem('p'))"), 2);
    assert.equal(a.eval("faseConsumo({}, getItem('p'))"), 0);
    assert.equal(a.eval("faseConsumo({ opIndex: 7 }, getItem('p'))"), 0);
    assert.equal(a.eval("faseConsumo({ opIndex: 2 }, getItem('lam'))"), 0, 'senza ciclo non c\'è fase');
  });

  it('il fabbisogno fa arrivare la riga per l\'inizio della sua fase, non della prima', () => {
    const a = conFasi();
    const buy = js(a, "Object.fromEntries(mrpExplodePlan(getPlan('pl')).buy.map(x => [x.item.id, x.due]))");
    const prog = js(a, "schedPart(getItem('p'), 1, '2026-11-20')");
    assert.equal(buy.lam, prog.start);
    assert.equal(buy.vern, prog.fasi[2].start);
    assert.ok(buy.vern > buy.lam, 'la vernice serve dopo la lamiera');
  });

  it('l\'albero del programma dice la stessa data', () => {
    const a = conFasi();
    const t = js(a, "schedTree('p', 1, '2026-11-20').children.map(n => [n.item.id, n.end])");
    const buy = js(a, "Object.fromEntries(mrpExplodePlan(getPlan('pl')).buy.map(x => [x.item.id, x.due]))");
    t.forEach(([id, end]) => assert.equal(end, buy[id], id));
  });

  it('la distinta la scrive dalla modifica del componente, e la mostra', () => {
    const a = conFasi();
    a.eval("currentBomId = 'p'; editComponentModal(0)");
    assert.match(a.eval("Array.from(panelRoot().children).map(e => e.innerHTML).join('')"), /id="cmp-phase"/);
    a.el('cmp-item').value = 'lam'; a.el('cmp-qty').value = '3'; a.el('cmp-scrap').value = '0'; a.el('cmp-phase').value = '1';
    a.eval('saveComponentEdit(0)');
    assert.equal(a.eval("getItem('p').components[0].opIndex"), 1);
    assert.match(a.eval("bomFaseTag(getItem('p').components[0], getItem('p'))"), /fase 20/);
    a.el('cmp-phase').value = '0';
    a.eval("editComponentModal(0)");
    a.el('cmp-item').value = 'lam'; a.el('cmp-qty').value = '3'; a.el('cmp-scrap').value = '0'; a.el('cmp-phase').value = '0';
    a.eval('saveComponentEdit(0)');
    assert.equal(a.eval("'opIndex' in getItem('p').components[0]"), false, 'la prima fase non si scrive');
  });

  it('l\'ordine di produzione la congela sul materiale e la mostra', () => {
    const a = conFasi();
    a.eval("(() => { const o = odpNew(getItem('p'), 2, '2026-11-20'); db.prodOrders.push(o); window.__o = o.id; })()");
    assert.deepEqual(js(a, 'getOdp(window.__o).materials.map(m => [m.itemId, m.opIndex])'), [['lam', 0], ['vern', 2]]);
    const h = a.eval('odpMaterialBlock(getOdp(window.__o))');
    assert.match(h, /Si usa/);
    assert.match(h, /fase 30/);
  });

  it('l\'import delle distinte legge la colonna Fase', () => {
    const a = conFasi();
    const rep = js(a, "importBom([{ CodicePadre: 'P', CodiceFiglio: 'LAM', Qta: 3 }, { CodicePadre: 'P', CodiceFiglio: 'VERN', Qta: 1, Fase: 30 }, { CodicePadre: 'P', CodiceFiglio: 'VERN', Qta: 1, Fase: 90 }])");
    assert.deepEqual(js(a, "getItem('p').components.map(c => c.opIndex === undefined ? null : c.opIndex)"), [null, 2, null]);
    assert.equal(rep.errors.length, 1, 'la fase 90 non c\'è: si dice');
  });
});
