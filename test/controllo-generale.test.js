// Il controllo generale della 0.105.3: un difetto per prova, ciascuno trovato
// leggendo l'app da capo e riprodotto prima di correggerlo. Quelli del fabbisogno
// stanno in stock.test.js e job-coverage.test.js, quelli dell'archivio condiviso
// in cloud.test.js e schema-sql.test.js: qui il resto.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp, makeStorage } = require('./harness.js');
const { makeDb, mat, parte, wc } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || makeDb({ items: [mat('m1', 10)] }));
  a.asRole('admin');
  // Gli avvisi si contano, ma passano anche al toast vero: l'«Annulla» lo
  // esegue toastAzione().
  a.eval('globalThis.__avvisi = []; { const vero = showToast; showToast = (m, t, az) => { __avvisi.push(m); return vero(m, t, az); }; } askConfirm = (m, si) => si();');
  return a;
}
const avvisi = a => a.ctx.__avvisi.splice(0);

describe('Un tipo che l\'app non conosce non diventa codice', () => {
  it('l\'etichetta si legge come testo, e la classe resta una delle sue', () => {
    const a = app();
    assert.equal(a.eval('typeLabel("<img src=x onerror=alert(1)>")'), '&lt;img src=x onerror=alert(1)&gt;');
    assert.equal(a.eval('typeKey("\\" onmouseover=\\"x")'), 'x', 'un tipo sconosciuto non entra in un attributo');
    assert.equal(a.eval('typeKey("materiale")'), 'materiale');
  });
});

describe('Le righe di un ordine di lavoro', () => {
  const conOdl = () => app(makeDb({
    items: [mat('m1', 10)],
    workOrders: [{ id: 'w1', number: 'ODL-2026-001', status: 'bozza', date: '2026-10-01', supplierId: null, active: true,
      lines: [{ id: 'wl1', itemId: 'm1', code: 'M1', description: 'Barra', uom: 'kg', qty: 5, price: 2, note: '' }] }],
  }));

  it('il «Salva» della riga modificata chiama l\'ordine di lavoro, non una funzione che non c\'è', () => {
    const a = conOdl();
    a.eval('globalThis.__m = ""; openModal = h => { __m = h; };');
    a.eval('docEditLineModal("odl", "w1", "wl1")');
    const h = a.eval('__m');
    assert.match(h, /onclick="odlSaveLineEdit\('w1','wl1'\)"/);
    assert.equal(a.eval('typeof odlSaveLineEdit'), 'function');
  });

  it('e così l\'«Aggiungi» della riga a mano', () => {
    const a = conOdl();
    a.eval('globalThis.__m = ""; openModal = h => { __m = h; };');
    a.eval('docAddManualLineModal("odl", "w1")');
    assert.match(a.eval('__m'), /onclick="odlAddManualLine\('w1'\)"/);
  });
});

describe('Lasciare un documento in sospeso', () => {
  it('cambiare sezione lo salva, e non resta «da salvare» fuori dal suo editor', () => {
    const a = app(makeDb({ items: [mat('m1', 10)],
      rfqs: [{ id: 'r1', number: 'RFQ-2026-001', status: 'bozza', date: '2026-10-01', supplierId: null, active: true, lines: [] }] }));
    a.eval('currentRfqId = "r1"; rfqView = "edit"; setView("rfq"); getRfq("r1").notes = "a metà"; docKind("rfq").dirty(true);');
    a.eval('setView("catalog")');
    assert.equal(a.eval('docKind("rfq").dirty()'), false, 'nell\'archivio condiviso un documento «sporco» ferma la ricezione');
    assert.equal(a.snapshot().rfqs[0].notes, 'a metà', 'e la modifica è salvata');
  });
});

describe('Un backup che non si riesce a migrare', () => {
  it('lascia l\'archivio di prima, non uno a metà', () => {
    const a = app();
    const prima = a.eval('db.items.length');
    // Supera la validazione, ma la migrazione non ci passa sopra.
    const rotto = JSON.stringify({ schemaVersion: 2, items: [null], settings: { currency: '€', uoms: [], concepts: [] } });
    assert.throws(() => a.eval(`Store.importSnapshot(${JSON.stringify(rotto)})`), /backup non importabile|Cannot|null/);
    assert.equal(a.eval('db.items.length'), prima, 'in memoria resta l\'archivio vero');
    assert.equal(a.eval('!!getItem("m1")'), true);
  });
});

describe('Una creazione alla volta', () => {
  it('mentre il server dà un numero, una seconda creazione aspetta', () => {
    const a = app();
    assert.equal(a.eval('cloudCreazioneInizia()'), true);
    assert.equal(a.eval('cloudCreazioneInizia()'), false, 'un doppio clic chiederebbe due numeri e creerebbe due documenti');
    assert.match(avvisi(a).join(), /numero al server/);
    a.eval('cloudCreazioneFinita()');
    assert.equal(a.eval('cloudCreazioneInizia()'), true, 'finita la prima, si riparte');
  });
});

describe('Il cestino non rimette un numero già ridato', () => {
  const ordine = (id, number) => ({ id, number, status: 'bozza', date: '2026-10-01', supplierId: null, active: true, lines: [] });

  it('un ordine eliminato, il cui numero è passato a un altro, resta nel cestino', () => {
    const a = app(makeDb({ items: [mat('m1', 10)], orders: [ordine('o1', 'ODA-2026-001'), ordine('o2', 'ODA-2026-002')] }));
    a.eval('Store.remove("orders", "o2")');
    const voce = a.eval('Store.lastRemoved()');
    a.eval('Store.insert("orders", ' + JSON.stringify(ordine('o3', 'ODA-2026-002')) + ')');
    assert.equal(a.eval(`Store.restore(${JSON.stringify(voce)})`), null);
    assert.match(a.eval('Store.rifiutoRipristino()'), /ODA-2026-002/);
    assert.equal(a.snapshot().orders.filter(o => o.number === 'ODA-2026-002').length, 1, 'due ODA-2026-002 non devono esistere');
    assert.equal(a.snapshot().trash.length, 1, 'e la voce resta nel cestino');
  });

  it('dal cestino di Gestione il motivo si legge', () => {
    const a = app(makeDb({ items: [mat('m1', 10)], orders: [ordine('o2', 'ODA-2026-002')] }));
    a.eval('Store.remove("orders", "o2")');
    const voce = a.eval('Store.lastRemoved()');
    a.eval('Store.insert("orders", ' + JSON.stringify(ordine('o3', 'ODA-2026-002')) + '); renderManage = () => {};');
    avvisi(a);
    a.eval(`restoreFromTrash(${JSON.stringify(voce)})`);
    assert.match(avvisi(a).join(), /ODA-2026-002.*Resta nel cestino/);
  });

  it('lo stesso per il codice di un articolo, senza guardare maiuscole e spazi', () => {
    const a = app(makeDb({ items: [Object.assign(mat('m1', 10), { code: 'MAT-ACC-002' })] }));
    a.eval('removeConUndo("items", "m1", "eliminato", null)');
    a.eval('Store.insert("items", Object.assign(JSON.parse(JSON.stringify(db.trash[0].record)), { id: "m9", code: " mat-acc-002" }))');
    avvisi(a);
    a.eval('toastAzione()');
    assert.equal(a.eval('!!getItem("m1")'), false);
    assert.match(avvisi(a).join(), /codice MAT-ACC-002/);
  });

  it('senza conflitti il ripristino va come sempre', () => {
    const a = app(makeDb({ items: [mat('m1', 10)], orders: [ordine('o2', 'ODA-2026-002')] }));
    a.eval('Store.remove("orders", "o2")');
    assert.ok(a.eval(`Store.restore(${JSON.stringify(a.eval('Store.lastRemoved()'))})`));
    assert.equal(a.snapshot().orders.length, 1);
  });
});

describe('Eliminare un ordine di produzione', () => {
  function conOdp(extra) {
    const a = app(makeDb(Object.assign({
      workCenters: [wc('tor', 40)],
      items: [mat('tondo', 2), parte('perno', { uom: 'pz', cycle: [
        { kind: 'item', itemId: 'tondo', qty: 2 },
        { kind: 'op', workCenterId: 'tor', supplierId: null, costMode: 'fisso', cost: 3, hours: 0.5, days: 0, note: '' }] })],
      plans: [],
    }, extra || {})));
    a.eval(`(function () {
      const part = getItem('perno');
      const o = { id: 'odp1', number: 'ODP-2026-001', itemId: part.id, code: part.code, name: part.name, uom: itemUom(part), qty: 5,
        date: '2026-07-01', dueDate: '2026-09-30', status: 'bozza', title: '', notes: '', notesInternal: '', planId: null, jobId: null,
        phases: opFreezePhases(part), materials: opFreezeMaterials(part, 5), active: true };
      db.prodOrders.push(o); invalidateCaches(); opLancia(o.id);
      addMovement('tondo', 'carico', 100, '');
      opAvvia(o.id, o.phases[0].id, {});
    })()`);
    return a;
  }
  const conti = a => JSON.parse(a.eval(`JSON.stringify({ decl: (db.prodDecls || []).filter(d => d.odpId === 'odp1').length,
    mov: (db.movements || []).filter(m => m.orderId === 'odp1').length, tondo: (invalidateCaches(), onHandOf('tondo')) })`));

  it('l\'«Annulla» rimette anche le dichiarazioni e i movimenti, non solo la testata', () => {
    const a = conOdp();
    const prima = conti(a);
    assert.ok(prima.decl > 0 && prima.mov > 0, 'l\'avvio ha dichiarato e prelevato');
    a.eval('renderOdp = () => {}; delOdp("odp1")');
    assert.equal(a.eval('!!getOdp("odp1")'), false);
    assert.equal(conti(a).tondo, 100, 'eliminandolo la merce torna com\'era');
    a.eval('toastAzione()');
    assert.equal(a.eval('!!getOdp("odp1")'), true);
    assert.deepEqual(conti(a), prima, 'fasi e magazzino tornano come prima dell\'eliminazione');
  });

  it('non si elimina se un ordine di lavoro aperto ne riceve una fase', () => {
    const a = conOdp({ workOrders: [{ id: 'w1', number: 'ODL-2026-001', status: 'inviato', date: '2026-10-01', supplierId: null, active: true,
      lines: [{ id: 'wl1', odpId: 'odp1', odpPhaseId: 'x', qty: 5 }] }] });
    avvisi(a);
    a.eval('delOdp("odp1")');
    assert.equal(a.eval('!!getOdp("odp1")'), true, 'senza l\'ODP quella riga non si riceverebbe più da nessuna parte');
    assert.match(avvisi(a).join(), /ODL-2026-001/);
  });
});

describe('Due colleghi avviano la stessa fase', () => {
  const dbOdp = () => makeDb({
    workCenters: [wc('tor', 40)],
    items: [mat('tondo', 2), parte('perno', { uom: 'pz', cycle: [
      { kind: 'item', itemId: 'tondo', qty: 2 },
      { kind: 'op', workCenterId: 'tor', supplierId: null, costMode: 'fisso', cost: 3, hours: 0.5, days: 0, note: '' }] })],
    prodOrders: [{ id: 'odp1', number: 'ODP-2026-001', itemId: 'perno', code: 'PRT', name: 'Perno', uom: 'pz', qty: 5,
      date: '2026-07-01', dueDate: '2026-09-30', status: 'lanciato', title: '', notes: '', notesInternal: '', planId: null, jobId: null,
      phases: [{ id: 'f10', seq: 10, workCenterId: 'tor', wcName: 'Tornio', supplierId: null, runFrom: 10 }],
      materials: [{ itemId: 'tondo', qty: 10 }], active: true }],
  });
  const avvio = a => JSON.parse(a.eval(`(opAvvia('odp1', 'f10', {}), JSON.stringify({
    decl: db.prodDecls.filter(d => d.kind === 'avvio').map(d => d.id),
    mov: db.movements.filter(m => m.orderId === 'odp1').map(m => m.id) }))`));

  it('su due PC l\'avvio e il prelievo nascono con gli stessi id: il server ne tiene uno', () => {
    const anna = avvio(app(dbOdp())), bruno = avvio(app(dbOdp()));
    assert.equal(anna.decl.length, 1);
    assert.equal(anna.mov.length, 1, 'l\'avvio della prima fase preleva il materiale');
    assert.deepEqual(bruno, anna, 'con id diversi il materiale usciva due volte');
  });

  it('un avvio annullato e rifatto prende id nuovi, senza doppioni', () => {
    const a = app(dbOdp());
    const primo = avvio(a);
    a.eval(`opAnnullaDichiarazione(${JSON.stringify(primo.decl[0])})`);
    const secondo = avvio(a);
    assert.equal(secondo.decl.length, 1);
    assert.notEqual(secondo.decl[0], primo.decl[0], 'quell\'id sta nel cestino');
    const ids = secondo.mov;
    assert.equal(new Set(ids).size, ids.length, 'due movimenti con lo stesso id non devono esistere');
  });
});

describe('Una richiesta al server che non torna più', () => {
  it('dopo il limite vale come rete assente, invece di fermare giro e numeri', async () => {
    const storage = makeStorage();
    storage.setItem('bomtrack_cloud', JSON.stringify({ url: 'http://x', chiave: 'k', allineato: true }));
    const a = loadApp({ silent: true, storage });
    a.ctx.AbortController = AbortController;
    a.ctx.setTimeout = fn => { fn(); return 1; };   // il limite scade subito
    a.ctx.fetch = (u, o) => new Promise((res, rej) => {
      if (o.signal && o.signal.aborted) return rej(new Error('abort'));
      if (o.signal) o.signal.addEventListener('abort', () => rej(new Error('abort')));
    });
    await assert.rejects(a.eval(`cloudHttp('/rest/v1/rpc/prova', {})`), /non raggiungibile/);
  });
});

// 0.105.4: l'invio completo cercava ogni record per id scorrendo la sua
// collezione. Con 35.000 righe erano secondi a browser fermo (quadratico).
describe('Un invio completo all\'archivio condiviso', () => {
  it('si prepara in tempo lineare', () => {
    const a = app(makeDb({}));
    a.eval(`db.movements = db.movements || []; for (let i = 0; i < 30000; i++) db.movements.push({ id: '10000000-0000-4000-8000-' + String(i).padStart(12, '0'),
      itemId: null, kind: 'carico', qty: 1, date: '2026-01-01T00:00:00.000Z', note: '', updatedAt: '2026-01-01T00:00:00.000Z' });`);
    a.eval('Store.ripristinaBase({})');
    const t = Date.now();
    const n = a.eval('cloudPayload(Store.takeChanges().changes, null, true).payload.upsert.stock_movements.length');
    assert.equal(n, 30000);
    assert.ok(Date.now() - t < 3000, `${Date.now() - t} ms`);
  });
});
