// Scheda articolo di sola lettura, e il codice cliccabile che la apre.
//
// Il controllo che conta più di tutti è che la scheda **non scriva niente**:
// è la proprietà da cui discende tutto il resto — la si può aprire in mezzo a
// qualunque lavoro proprio perché non ha uno stato da salvare. Se un giorno
// qualcuno ci mette dentro un campo o un pulsante che modifica, questi test
// devono diventare rossi prima che il pulsante arrivi a qualcuno.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm, comp } = require('./fixtures.js');

function base() {
  return makeDb({
    suppliers: [{ id: 's1', name: 'SKF', active: true }, { id: 's2', name: 'Bosch', active: true }],
    workCenters: [{ id: 'w1', name: 'Tornio', hourlyRate: 50, active: true }],
    items: [
      asm('mac', 'macchina', { components: [comp('g1', 1), comp('pt', 2)] }),
      asm('g1', 'gruppo', { components: [comp('m1', 4), comp('c1', 2)] }),
      parte('pt', { cycle: [{ id: 'cr1', kind: 'item', itemId: 'm1', qty: 3 },
        { id: 'cr2', kind: 'op', workCenterId: 'w1', cost: 12 }] }),
      Object.assign(mat('m1', 10), {
        uom: 'kg', notes: 'barra trafilata', safetyStock: 5, lotSize: 10, supplierId: 's1',
        priceList: [{ id: 'p1', supplierId: 's1', price: 10, minQty: 20, leadDays: 21, date: '2026-01-05', code: 'SKF-1', desc: 'barra' },
          { id: 'p2', supplierId: 's2', price: 7, date: '2026-02-01' }],
        activePriceId: 'p1',
      }),
      Object.assign(acq('c1', 5), { supplierId: 's1' }),
    ],
  });
}
function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || base());
  a.asRole('admin');
  return a;
}
// Il pannello aperto: i test leggono l'HTML da lì, come farebbe un occhio.
function scheda(a) {
  const root = a.eval('document.getElementById("modal-root")');
  const p = root.children.find(c => c.dataset.panelKey === 'iteminfo');
  return p ? p.innerHTML : '';
}
function apri(a, id) { a.eval(`itemInfoModal(${JSON.stringify(id)})`); return scheda(a); }

describe('La scheda articolo non modifica niente', () => {
  const TUTTI = ['mac', 'g1', 'pt', 'm1', 'c1'];

  it('non contiene nessun campo di inserimento, su nessun tipo di articolo', () => {
    const a = app();
    TUTTI.forEach(id => {
      const h = apri(a, id);
      assert.ok(!/<input|<select|<textarea/.test(h),
        `${id}: un campo modificabile qui dentro toglie alla scheda l'unica ragione per cui la si apre senza pensarci`);
    });
  });

  it('gli unici pulsanti sono chiudi, indietro e i codici da aprire', () => {
    const a = app();
    TUTTI.forEach(id => {
      const azioni = [...apri(a, id).matchAll(/onclick="([^"]+)"/g)].map(m => m[1]);
      const estranee = azioni.filter(x => !/^itemInfo|^closePanel/.test(x));
      assert.deepEqual(estranee, [], `${id}: azioni non di sola lettura`);
    });
  });

  it('aprirla e navigarci dentro non tocca il database', () => {
    const a = app();
    const prima = JSON.stringify(a.snapshot());
    TUTTI.forEach(id => apri(a, id));
    a.eval('itemInfoBack(); itemInfoBack(); itemInfoClose();');
    assert.equal(JSON.stringify(a.snapshot()), prima, 'una scheda di consultazione non lascia tracce');
  });

  it('anche il ruolo lettore la apre: non c\'è niente da proteggere', () => {
    const a = app();
    a.asRole('lettore');
    assert.match(apri(a, 'm1'), /M1/);
  });

  it('un articolo che non esiste più non apre una scheda vuota', () => {
    const a = app();
    a.eval('itemInfoModal("sparito")');
    assert.equal(scheda(a), '');
  });
});

describe('Cosa dice la scheda', () => {
  it('anagrafica, costo e listino di una materia prima', () => {
    const h = apri(app(), 'm1');
    assert.match(h, /M1 — Materia m1/);
    assert.match(h, /Materia prima/);
    assert.match(h, /barra trafilata/, 'le note sono informazione, e questa scheda esiste per mostrarla');
    assert.match(h, /Costo in uso/);
    assert.match(h, /SKF-1/, 'il codice presso il fornitore');
    assert.match(h, /Bosch/, 'anche le quotazioni non in uso: il listino si legge tutto');
    assert.match(h, /21 gg/);
    assert.match(h, /✓ in uso/);
  });

  it('segnala la quotazione più bassa senza applicarla', () => {
    const h = apri(app(), 'm1');
    assert.match(h, /Miglior quotazione/, 'la Bosch quota 7 contro i 10 in uso');
    assert.match(h, /il prezzo non cambia da sé/,
      'l\'app non ha mai cambiato un prezzo da sola, e la scheda non deve far credere il contrario');
  });

  it('la composizione di un assieme, con costo di riga', () => {
    const h = apri(app(), 'g1');
    assert.match(h, /Composizione \(2 componenti\)/);
    assert.match(h, /M1/);
    assert.match(h, /C1/);
  });

  it('la distinta parte e il ciclo di una parte prodotta in casa', () => {
    const h = apri(app(), 'pt');
    assert.match(h, /Distinta e ciclo/);
    assert.match(h, /Tornio/);
  });

  it('una parte comprata avvisa che il costo non viene dal ciclo', () => {
    const a = app();
    a.eval('const it = getItem("pt"); it.sourcing = "buy"; touch(it); saveDB();');
    const h = apri(a, 'pt');
    assert.match(h, /Questa parte si <strong>acquista<\/strong>/,
      'leggere il ciclo e il costo senza questa riga significa crederli in contraddizione');
  });

  it('dove è usato, risalendo fino alla macchina', () => {
    const h = apri(app(), 'm1');
    assert.match(h, /Impieghi diretti/);
    assert.match(h, /Macchine impattate/);
    assert.match(h, /MAC/);
  });

  it('un articolo non usato da nessuna parte lo dice', () => {
    const a = app();
    a.eval(`Store.insert('items', { id: 'orfano', code: 'ORF', name: 'Orfano', type: 'acquistato', uom: 'pz', purchasePrice: 1, active: true });`);
    assert.match(apri(a, 'orfano'), /Non è usato da nessuna parte/);
  });

  it('magazzino: esistente, impegnato e libero', () => {
    const a = app();
    a.eval('addMovement("m1", "carico", 100, "")');
    a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-1', active: true, lines: [{ id: 'l', itemId: 'mac', qty: 10 }] });`);
    const h = apri(a, 'm1');
    assert.match(h, /Esistente/);
    assert.match(h, /Impegnato/);
    assert.match(h, /Libero/);
    assert.match(h, /FAB-1/, 'chi impegna si dice per nome');
  });

  it('gli assiemi non hanno magazzino e la sezione non compare', () => {
    assert.ok(!/📦 Magazzino/.test(apri(app(), 'mac')),
      'un assieme si produce: una giacenza sarebbe quella dei componenti contata due volte');
  });

  it('i documenti e i piani in cui l\'articolo compare', () => {
    const a = app();
    a.eval(`Store.insert('orders', { id: 'o1', number: 'ODA-9', status: 'inviato', supplierId: 's1',
      lines: [{ id: 'ol', itemId: 'm1', code: 'M1', description: 'barra', qty: 100, received: 30, uom: 'kg', price: 10 }] });`);
    a.eval(`Store.insert('rfqs', { id: 'r1', number: 'RDO-9', status: 'inviata', supplierId: 's2',
      lines: [{ id: 'rl', itemId: 'm1', code: 'M1', description: 'barra', qty: 50, price: '' }] });`);
    a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-9', active: true, lines: [{ id: 'l', itemId: 'mac', qty: 1 }] });`);
    const h = apri(a, 'm1');
    assert.match(h, /ODA-9/);
    assert.match(h, /RDO-9/);
    assert.match(h, /FAB-9/);
  });

  it('le revisioni rilasciate, con il costo congelato', () => {
    const a = app();
    a.eval('releaseRevision("mac", "prima emissione")');
    const h = apri(a, 'mac');
    assert.match(h, /prima emissione/);
    assert.match(h, /costo congelato/);
    assert.match(h, /In lavorazione: <strong>B<\/strong>/);
  });
});

describe('Navigazione fra le schede', () => {
  it('cliccare un codice dentro la scheda sostituisce il contenuto, non apre una seconda finestra', () => {
    const a = app();
    apri(a, 'mac');
    a.eval('itemInfoModal("m1")');
    const root = a.eval('document.getElementById("modal-root")');
    assert.equal(root.children.filter(c => c.dataset.panelKey === 'iteminfo').length, 1);
    assert.match(scheda(a), /M1 — Materia m1/);
  });

  it('l\'indietro riporta da dove si veniva', () => {
    const a = app();
    apri(a, 'mac');
    a.eval('itemInfoModal("g1")');
    a.eval('itemInfoModal("m1")');
    assert.match(scheda(a), /← Indietro/);
    a.eval('itemInfoBack()');
    assert.match(scheda(a), /G1 —/);
    a.eval('itemInfoBack()');
    assert.match(scheda(a), /MAC —/);
    assert.ok(!/← Indietro/.test(scheda(a)), 'in fondo alla strada il pulsante sparisce');
  });

  it('riaprire lo stesso articolo non impila un passo indietro inutile', () => {
    const a = app();
    apri(a, 'm1');
    a.eval('itemInfoModal("m1")');
    assert.ok(!/← Indietro/.test(scheda(a)));
  });

  it('chiudere dimentica la strada percorsa', () => {
    const a = app();
    apri(a, 'mac');
    a.eval('itemInfoModal("m1"); itemInfoClose();');
    assert.ok(!/← Indietro/.test(apri(a, 'c1')),
      'un "indietro" che riporta a un articolo di mezz\'ora fa sorprende invece di aiutare');
  });
});

describe('Il codice cliccabile', () => {
  it('un codice a catalogo diventa un punto d\'ingresso alla scheda', () => {
    const h = app().eval('codeLink("m1", "M1")');
    assert.match(h, /class="code-link/);
    assert.match(h, /itemInfoModal\('m1', event\)/);
    assert.match(h, />M1</);
  });

  it('il click non fa scattare anche il gesto della riga che lo contiene', () => {
    const h = app().eval('codeLink("m1", "M1")');
    assert.match(h, /itemInfoModal/);
    assert.ok(/onkeydown=/.test(h), 'raggiungibile anche da tastiera');
  });

  it('un codice senza articolo resta testo: non c\'è niente da aprire', () => {
    const a = app();
    assert.equal(a.eval('codeLink(null, "LIBERA")'), 'LIBERA',
      'le righe manuali dei documenti hanno un codice che non è a catalogo');
    assert.equal(a.eval('codeLink("cancellato", "VECCHIO")'), 'VECCHIO');
  });

  it('il testo viene escapato: un codice arriva anche da un foglio importato', () => {
    const a = app();
    assert.ok(!/<b>/.test(a.eval('codeLink("m1", "<b>x</b>")')));
    assert.ok(!/<b>/.test(a.eval('codeLink(null, "<b>x</b>")')));
  });

  it('i codici sono cliccabili nelle tabelle da cui si guarda per primo', () => {
    const a = app();
    a.eval(`Store.insert('plans', { id: 'pl1', number: 'FAB-1', active: true, lines: [{ id: 'l', itemId: 'mac', qty: 2 }] });`);
    const conta = h => (String(h).match(/class="code-link/g) || []).length;
    // Fabbisogno: righe di piano, da acquistare, da fabbricare
    a.eval('mrpNet = false; currentPlanId = "pl1"; mrpView = "edit"; renderMrp();');
    assert.ok(conta(a.eval('document.getElementById("view-mrp").innerHTML')) >= 4, 'fabbisogno');
    // Costificazione: distinta esplosa
    a.eval('reportBomId = "mac"; renderReport();');
    assert.ok(conta(a.eval('document.getElementById("report-content").innerHTML')) >= 4, 'costificazione');
    // Distinta base
    a.eval('currentBomId = "mac"; bomExpanded = new Set(["mac", "g1"]); renderBom();');
    assert.ok(conta(a.eval('document.getElementById("bom-tree").innerHTML')) >= 3, 'distinta');
    // Anagrafica
    assert.equal(conta(a.eval('catalogRow(getItem("m1"))')), 1, 'catalogo');
    // Riga di ciclo
    assert.equal(conta(a.eval('cycleRowLabel({ kind: "item", itemId: "m1", qty: 1 })')), 1, 'ciclo');
  });

  it('nei documenti il codice apre l\'articolo solo se la riga viene dal catalogo', () => {
    const a = app();
    a.eval(`Store.insert('orders', { id: 'o1', number: 'ODA-1', status: 'bozza', supplierId: 's1', lines: [
      { id: 'l1', itemId: 'm1', code: 'M1', description: 'barra', qty: 10, price: 10, uom: 'kg' },
      { id: 'l2', itemId: null, code: 'LIBERA', description: 'riga a mano', qty: 1, price: 5, uom: 'pz' }] });`);
    a.eval('orderView = "edit"; currentOrderId = "o1"; renderOrders();');
    const h = a.eval('document.getElementById("view-orders").innerHTML');
    assert.equal((h.match(/class="code-link/g) || []).length, 1, 'una riga manuale non punta a nessun articolo');
    assert.match(h, /LIBERA/, 'ma il suo codice si legge lo stesso');
  });
});
