// Interfaccia: indirizzo, cestino, spiegazione del costo, riepilogo.
//
// Sono quattro cose che non cambiano un numero: cambiano quanto costa a una
// persona capire cosa sta guardando e rimediare a uno sbaglio. Si verificano
// come le altre — soprattutto il cestino, che è l'unico punto in cui l'app
// promette di poter tornare indietro.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, asm, comp, wc } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || makeDb({ items: [mat('m1', 10)] }));
  a.asRole('admin');
  return a;
}

describe('L\'indirizzo comanda la navigazione', () => {
  function conHash(h) {
    const a = loadApp({ silent: true });
    a.setDb(makeDb({ items: [] }));
    a.asRole('admin');
    a.eval(`location = { hash: ${JSON.stringify(h)} };`);
    return a;
  }

  it('una vista valida nell\'indirizzo viene riaperta', () => {
    assert.equal(conHash('#mrp').eval('viewIniziale()'), 'mrp');
    assert.equal(conHash('#/orders').eval('viewIniziale()'), 'orders', 'anche con la barra');
  });
  it('senza indirizzo si atterra sul riepilogo', () => {
    assert.equal(conHash('').eval('viewIniziale()'), 'home');
  });
  it('un indirizzo inventato non apre una vista che non esiste', () => {
    assert.equal(conHash('#inesistente').eval('viewIniziale()'), 'home');
    assert.equal(conHash('#manage-segreto').eval('viewIniziale()'), 'home');
  });
  it('cambiare vista scrive l\'indirizzo', () => {
    const a = conHash('');
    a.eval('setView("bom")');
    assert.equal(a.eval('location.hash'), 'bom');
  });
  it('l\'indirizzo già allineato non fa ripartire la navigazione', () => {
    // È così che si chiude il giro infinito: entrambe le direzioni si fermano
    // quando non c'è niente da cambiare, senza tenere stato.
    const a = conHash('');
    a.eval('setView("bom"); window.__giri = 0; const vero = setView; setView = v => { window.__giri++; vero(v); }; onHashChange();');
    assert.equal(a.eval('window.__giri'), 0, 'l\'hash dice già "bom" e la vista aperta è "bom"');
  });

  it('il tasto Indietro del browser riapre la vista precedente', () => {
    const a = conHash('');
    a.eval('setView("bom"); setView("mrp");');
    assert.equal(a.eval('activeView'), 'mrp');
    a.eval('location.hash = "bom"; onHashChange();');   // ciò che fa il browser tornando indietro
    assert.equal(a.eval('activeView'), 'bom');
  });
  it('fuori sessione l\'indirizzo non apre niente', () => {
    const a = conHash('#mrp');
    a.eval('currentUser = null; activeView = "home"; onHashChange();');
    assert.equal(a.eval('activeView'), 'home', 'altrimenti un link salterebbe l\'accesso');
  });
});

describe('Cestino: eliminare non è perdere', () => {
  const conDati = () => makeDb({
    suppliers: [{ id: 's1', name: 'SKF', active: true }],
    items: [mat('m1', 10), acq('c1', 5)],
  });

  it('l\'eliminato esce dalla collezione ma resta nel cestino', () => {
    const a = app(conDati());
    a.eval('Store.remove("items", "m1")');
    assert.equal(a.eval('db.items.length'), 1, 'sparisce da elenchi, indici e conti');
    const t = a.snapshot().trash;
    assert.equal(t.length, 1);
    assert.equal(t[0].coll, 'items');
    assert.equal(t[0].record.id, 'm1', 'il record intero, non un riferimento');
  });

  it('non è un flag sul record: chi legge db.items non deve ricordarsi niente', () => {
    const a = app(conDati());
    a.eval('Store.remove("items", "m1")');
    assert.equal(a.eval('!!getItem("m1")'), false);
    assert.equal(a.eval('!!getItemByCode("M1")'), false);
    assert.equal(a.eval('duplicateCodeGroups().length'), 0);
  });

  // «Com'era» vale per il contenuto, non per la data di modifica: il ripristino
  // è un fatto nuovo e va datato come tale. In cloud l'eliminazione lascia un
  // tombstone, e un record che rientra con l'updatedAt di prima è più vecchio
  // del tombstone — il pull successivo lo ricancellerebbe.
  it('ripristinare lo rimette dov\'era, com\'era', () => {
    const a = app(conDati());
    const prima = a.snapshot().items.find(i => i.id === 'm1');
    a.eval('Store.remove("items", "m1")');
    a.eval(`Store.restore(${JSON.stringify(a.eval('db.trash[0].id'))})`);
    const dopo = a.snapshot().items.find(i => i.id === 'm1');
    const senzaData = o => { const c = Object.assign({}, o); delete c.updatedAt; delete c.updatedBy; return c; };
    assert.deepEqual(senzaData(dopo), senzaData(prima), 'il contenuto torna identico');
    assert.ok(String(dopo.updatedAt) > String(prima.updatedAt || ''), 'ma il ripristino ridata il record');
    assert.equal(a.snapshot().trash.length, 0);
  });

  it('ripristinare due volte non duplica', () => {
    const a = app(conDati());
    a.eval('Store.remove("items", "m1")');
    const tid = a.eval('db.trash[0].id');
    a.eval(`Store.restore(${JSON.stringify(tid)}); Store.restore(${JSON.stringify(tid)});`);
    assert.equal(a.snapshot().items.filter(i => i.id === 'm1').length, 1);
  });

  it('un id di cestino inesistente non lancia', () => {
    const a = app(conDati());
    assert.doesNotThrow(() => a.eval('Store.restore("non-esiste")'));
    assert.equal(a.eval('Store.restore("non-esiste")'), null);
    assert.equal(a.eval('Store.purge("non-esiste")'), false);
  });

  it('l\'eliminazione definitiva toglie dal cestino e basta', () => {
    const a = app(conDati());
    a.eval('Store.remove("items", "m1")');
    a.eval(`Store.purge(${JSON.stringify(a.eval('db.trash[0].id'))})`);
    assert.equal(a.snapshot().trash.length, 0);
    assert.equal(a.eval('!!getItem("m1")'), false, 'e non lo fa tornare');
  });

  it('il cestino sopravvive al ricaricamento', () => {
    const a = app(conDati());
    a.eval('Store.remove("items", "m1")');
    a.ref('Store').load();
    assert.equal(a.snapshot().trash.length, 1);
  });

  it('le eliminazioni vecchie si svuotano da sole al caricamento', () => {
    const a = app(conDati());
    const giorni = a.eval('TRASH_DAYS');
    a.eval(`db.trash = [
      { id: 't1', coll: 'items', deletedAt: new Date(Date.now() - ${giorni + 1} * 86400000).toISOString(), record: { id: 'x' } },
      { id: 't2', coll: 'items', deletedAt: new Date().toISOString(), record: { id: 'y' } }];
      Store.commit(); Store.load();`);
    const t = a.snapshot().trash;
    assert.equal(t.length, 1, 'il cestino non deve diventare il posto dove il database cresce di nascosto');
    assert.equal(t[0].id, 't2');
  });

  it('lastRemoved indica proprio l\'ultima, anche nello stesso millisecondo', () => {
    const a = app(conDati());
    a.eval('Store.remove("items", "m1")');
    const primo = a.eval('Store.lastRemoved()');
    a.eval('Store.remove("items", "c1")');
    const secondo = a.eval('Store.lastRemoved()');
    assert.notEqual(primo, secondo);
    a.eval(`Store.restore(${JSON.stringify(secondo)})`);
    assert.equal(a.eval('!!getItem("c1")'), true);
    assert.equal(a.eval('!!getItem("m1")'), false, 'si ripristina quello giusto, non l\'ultimo per data');
  });

  it('svuotare il cestino lo azzera', () => {
    const a = app(conDati());
    a.eval('Store.remove("items", "m1"); Store.remove("items", "c1"); Store.emptyTrash();');
    assert.equal(a.snapshot().trash.length, 0);
  });

  it('un backup vecchio senza cestino si apre lo stesso', () => {
    const a = app();
    a.ref('Store').importSnapshot({ items: [{ id: 'x', code: 'X', name: 'X', type: 'materiale' }] });
    assert.deepEqual(a.snapshot().trash, []);
  });
});

describe('L\'annulla del toast', () => {
  it('rimette a posto l\'ultima eliminazione', () => {
    const a = app(makeDb({ items: [mat('m1', 10)] }));
    a.eval('removeConUndo("items", "m1", "eliminato", null)');
    assert.equal(a.eval('!!getItem("m1")'), false);
    a.eval('toastAzione()');
    assert.equal(a.eval('!!getItem("m1")'), true);
  });

  it('senza eliminazione non c\'è azione da eseguire', () => {
    const a = app();
    a.eval('showToast("solo un avviso")');
    assert.doesNotThrow(() => a.eval('toastAzione()'));
  });

  it('l\'azione si consuma una volta sola', () => {
    const a = app(makeDb({ items: [mat('m1', 10)] }));
    a.eval('removeConUndo("items", "m1", "eliminato", null)');
    a.eval('toastAzione()');
    a.eval('Store.remove("items", "m1")');   // eliminato di nuovo, ma il toast è già stato usato
    a.eval('toastAzione()');
    assert.equal(a.eval('!!getItem("m1")'), false, 'un secondo click non deve ripescare a caso dal cestino');
  });

  it('un\'eliminazione che non trova nulla non offre l\'annulla', () => {
    const a = app();
    assert.equal(a.eval('removeConUndo("items", "non-esiste", "x", null)'), false);
  });
});

describe('Da dove viene questo costo', () => {
  const dbCosto = () => makeDb({
    workCenters: [wc('w1', 40)],
    items: [
      asm('mac', 'macchina', { components: [comp('g1', 1), comp('caro', 2)] }),
      asm('g1', 'gruppo', { components: [comp('m1', 4), comp('c1', 1)] }),
      Object.assign(mat('m1', 5), { code: 'M1' }),
      Object.assign(acq('c1', 3), { code: 'C1' }),
      Object.assign(acq('caro', 100), { code: 'CARO' }),
    ],
  });
  const contributi = a => JSON.parse(a.eval('JSON.stringify(costContributors("mac").map(x => ({ code: x.code, qty: x.qty, line: x.line })))'));

  it('mette in cima chi pesa di più', () => {
    const a = app(dbCosto());
    const c = contributi(a);
    assert.equal(c[0].code, 'CARO', '2 × 100 = 200, contro 4 × 5 = 20');
    approx(c[0].line, 200);
  });

  it('gli assiemi non compaiono: conterebbero due volte la stessa spesa', () => {
    const a = app(dbCosto());
    assert.ok(!contributi(a).some(x => x.code === 'G1'));
  });

  it('la somma dei contributi è il costo totale, senza spese generali', () => {
    const a = app(dbCosto());
    const somma = contributi(a).reduce((s, x) => s + x.line, 0);
    approx(somma, a.eval('costOf("mac").total'), 'se non torna, o si conta due volte o si perde qualcosa');
  });

  it('lo stesso articolo in due rami si somma una volta sola', () => {
    const a = app(makeDb({ items: [
      asm('mac', 'macchina', { components: [comp('g1', 1), comp('g2', 1)] }),
      asm('g1', 'gruppo', { components: [comp('m1', 2)] }),
      asm('g2', 'gruppo', { components: [comp('m1', 3)] }),
      Object.assign(mat('m1', 10), { code: 'M1' }),
    ] }));
    const c = JSON.parse(a.eval('JSON.stringify(costContributors("mac").map(x => ({ code: x.code, qty: x.qty, line: x.line })))'));
    assert.equal(c.length, 1);
    assert.equal(c[0].qty, 5, '2 + 3, non due righe da cercare a mano');
    approx(c[0].line, 50);
  });

  // Il costo riga di una foglia è per un padre solo: sotto un gruppo usato due
  // volte va moltiplicato per due, o la classifica indica il colpevole sbagliato.
  it('un sottoassieme usato più volte moltiplica i suoi componenti', () => {
    const a = app(makeDb({ items: [
      asm('mac', 'macchina', { components: [comp('g1', 2)] }),
      asm('g1', 'gruppo', { components: [comp('m1', 3)] }),
      Object.assign(mat('m1', 10), { code: 'M1' }),
    ] }));
    const c = contributi(a);
    assert.equal(c[0].qty, 6, '2 gruppi × 3 pezzi');
    approx(c[0].line, 60);
    approx(c[0].line, a.eval('costOf("mac").total'), 'M1 è tutto il costo della macchina');
  });

  it('le voci a costo zero non ingombrano l\'elenco', () => {
    const a = app(makeDb({ items: [
      asm('mac', 'macchina', { components: [comp('m1', 1), comp('gratis', 5)] }),
      Object.assign(mat('m1', 10), { code: 'M1' }),
      Object.assign(mat('gratis', 0), { code: 'GRATIS' }),
    ] }));
    assert.ok(!contributi(a).some(x => x.code === 'GRATIS'));
  });

  it('una distinta vuota non lancia', () => {
    const a = app(makeDb({ items: [asm('mac', 'macchina', { components: [] })] }));
    assert.deepEqual(contributi(a), []);
    assert.doesNotThrow(() => a.eval('costWhyModal("mac")'));
  });
});

describe('Riepilogo', () => {
  const segnali = a => JSON.parse(a.eval('JSON.stringify(homeSegnali())'));

  it('un database pulito non segnala niente', () => {
    const a = app(makeDb({ items: [Object.assign(mat('m1', 10), { code: 'M1' })] }));
    assert.deepEqual(segnali(a), []);
  });

  it('un articolo d\'acquisto senza prezzo viene segnalato', () => {
    const a = app(makeDb({ items: [Object.assign(mat('m1', 0), { code: 'M1' })] }));
    const s = segnali(a);
    assert.equal(s.length, 1);
    assert.match(s[0].testo, /senza prezzo/);
    assert.equal(s[0].vista, 'buy', 'ogni riga deve portare dove si risolve');
  });

  it('una commessa scaduta è la segnalazione più grave', () => {
    const a = app(makeDb({ items: [], jobs: [{ id: 'j1', number: 'COM-1', status: 'aperta', dueDate: '2020-01-01', active: true }] }));
    const s = segnali(a);
    assert.equal(s[0].gravita, 'alta');
    assert.equal(s[0].vista, 'jobs');
  });

  it('i codici duplicati arrivano fin qui', () => {
    const a = app(makeDb({ items: [
      Object.assign(mat('m1', 10), { code: 'DUP' }),
      Object.assign(mat('m2', 10), { code: 'dup' })] }));
    assert.ok(segnali(a).some(x => /duplicat/.test(x.testo)));
  });

  it('un articolo sotto la scorta minima viene segnalato', () => {
    const a = app(makeDb({ items: [Object.assign(mat('m1', 10), { code: 'M1', safetyStock: 50 })] }));
    assert.ok(segnali(a).some(x => /scorta minima/.test(x.testo)));
  });

  it('il risparmio possibile è quello vero, coi prezzi convertiti', () => {
    const a = app(makeDb({ items: [Object.assign(mat('bar', 16), {
      code: 'BAR', uom: 'm', altUom: 'kg', altFactor: 8,
      priceList: [
        { id: 'a', price: 2, priceUom: 'kg', date: '2026-01-01' },
        { id: 'b', price: 5, priceUom: 'm', date: '2026-01-01' }],
      activePriceId: 'a', unitCost: 16,
    })] }));
    const r = JSON.parse(a.eval('JSON.stringify(homeRisparmio())'));
    assert.equal(r.quanti, 1);
    approx(r.voci[0].saving, 11, '16 €/m in uso contro 5 €/m disponibili');
  });

  // Dalla 0.109.0: l'avviso nomina articolo e fornitori, e porta al listino.
  const fornitori = [{ id: 's1', name: 'Rossi', active: true }, { id: 's2', name: 'Bianchi', active: true }];
  const conListino = (id, inUso, prezzi, over) => Object.assign(acq(id, inUso), {
    priceList: prezzi.map((p, i) => ({ id: id + '-' + i, supplierId: p[0], price: p[1], date: '2026-0' + (i + 1) + '-01' })),
    activePriceId: id + '-0' }, over || {});

  it('il risparmio dice quale articolo, da chi e a quanto, e apre il listino', () => {
    const a = app(makeDb({ suppliers: fornitori, items: [conListino('v1', 10, [['s1', 10], ['s2', 8]])] }));
    const r = JSON.parse(a.eval('JSON.stringify(homeRisparmio())'));
    assert.equal(r.voci[0].code, 'V1');
    assert.equal(r.voci[0].fornitoreInUso, 'Rossi');
    assert.equal(r.voci[0].fornitoreMigliore, 'Bianchi');
    approx(r.voci[0].saving, 2, '10 → 8');
    approx(r.voci[0].pct, 20, '2 su 10');
    a.eval('renderHome()');
    const h = a.html('view-home');
    assert.match(h, /Prezzi da rivedere a listino/);
    assert.match(h, /V1/);
    assert.match(h, /Rossi/);
    assert.match(h, /Bianchi/);
    assert.match(h, /priceListModal\('v1'\)/);
    assert.doesNotMatch(h, /sommati/, 'niente più somma di prezzi unitari di articoli diversi');
  });

  it('prima il risparmio più grande in proporzione; obsoleti e prezzi a mano', () => {
    const a = app(makeDb({ suppliers: fornitori, items: [
      conListino('a1', 300, [['s1', 300], ['s2', 297]]),           // −1%
      conListino('a2', 4, [['s1', 4], ['s2', 2]]),                 // −50%
      conListino('a3', 10, [['s1', 10], ['s2', 5]], { obsolete: true }),
      conListino('a4', 9, [['s1', 7]], { activePriceId: null }),   // scritto a mano
    ] }));
    const r = JSON.parse(a.eval('JSON.stringify(homeRisparmio())'));
    assert.deepEqual(r.voci.map(v => v.code), ['A2', 'A4', 'A1']);
    assert.equal(r.voci.find(v => v.code === 'A4').aMano, true);
  });

  it('nessun avviso se la quotazione in uso è già la più bassa', () => {
    const a = app(makeDb({ suppliers: fornitori, items: [conListino('b1', 10, [['s1', 8], ['s2', 9]])] }));
    // Il prezzo dell'articolo è rimasto a 10, ma la riga in uso è già la migliore.
    assert.equal(JSON.parse(a.eval('JSON.stringify(homeRisparmio())')).quanti, 0);
    a.eval('renderHome()');
    assert.doesNotMatch(a.html('view-home'), /Prezzi da rivedere/);
  });

  it('si disegna senza lanciare, anche su un database vuoto', () => {
    const a = app(makeDb({ items: [] }));
    a.eval('renderHome()');
    assert.ok(a.html('view-home').includes('Riepilogo'));
    assert.ok(a.html('view-home').includes('Niente in sospeso'));
  });
});

describe('Un codificatore solo per i dati dentro un onclick (dalla 0.105.6)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  // Quello che fa il browser: decodifica l'attributo, poi esegue il JavaScript.
  const decodifica = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const CATTIVI = ["L'albero", 'a"b', 'x\\y', "');alert(1);('", '"><img src=x onerror=alert(1)>', 'riga\nnuova', 'a&amp;b', ' ', '${1}'];

  it('jsAttr dà un letterale che, decodificato ed eseguito, ridà la stringa intatta', () => {
    const a = loadApp({ silent: true });
    CATTIVI.forEach(v => {
      const attr = a.eval(`jsAttr(${JSON.stringify(v)})`);
      assert.ok(!/["<>]/.test(attr), 'niente che chiuda l\'attributo o apra un tag: ' + attr);
      // eslint-disable-next-line no-eval
      assert.equal((0, eval)(decodifica(attr)), v);
    });
  });

  it('jsAttr regge un attributo fra apici singoli quanto fra virgolette', () => {
    const a = loadApp({ silent: true });
    assert.ok(!/'/.test(a.eval(`jsAttr("L'albero")`)));
  });

  it('il collegamento al documento toccato da una modifica tecnica non si rompe su dati strani', () => {
    const a = loadApp({ silent: true });
    a.setDb(require('./fixtures.js').makeDb({ plans: [{ id: "p'1", number: 'FAB-1', lines: [] }] }));
    a.asRole('admin');
    const html = a.eval(`ecoImpattoHtml([{ k: 'plan', id: "p'1", number: 'FAB-1', perche: 'x' }], true)`);
    const m = html.match(/onclick="([^"]*)"/);
    assert.ok(m, html);
    assert.match(decodifica(m[1]), /ecoApri\("plan","p'1"\)/);
  });

  it('nei sorgenti non restano codificatori fatti a mano negli attributi', () => {
    const ROOT = path.join(__dirname, '..');
    const file = fs.readdirSync(ROOT).filter(f => f.endsWith('.js') && f !== 'sw.js');
    const trovati = [];
    file.forEach(f => {
      const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
      t.split('\n').forEach((r, i) => {
        if (/esc\(JSON\.stringify\(/.test(r) && /on(click|change|input|keydown)=/.test(r)) trovati.push(`${f}:${i + 1}`);
        if (/\bjsAttrStr\(/.test(r)) trovati.push(`${f}:${i + 1}`);
      });
    });
    assert.deepEqual(trovati, [], 'si usa jsAttr() di core.js');
  });
});
