// Impaginazione nell'app vera, in Chromium. Non è un file di test: lo lancia
// test/layout.test.js in un processo a parte (la suite è sincrona, il browser
// no) e ne legge il risultato in JSON dallo standard output.
//
// Per ogni larghezza: la pagina non deve scorrere di lato, ogni sezione deve
// essere raggiungibile (in riga e per intero, o nel menu ☰), e al telefono
// nessun comando deve stare sotto i 32 px.
const path = require('node:path');
const { chromium } = require('playwright');
const APP = path.join(__dirname, '..', 'index.html');

const SEED = () => {
  Store.reset();
  const u = { id: newId(), name: 'Anna Bianchi', username: 'anna', email: 'a@x.it', role: 'admin', color: '#3A7BE8', active: true };
  setUserPassword(u, 'x'); stampNew(u); db.users.push(u);
  const sup = ['Bonfiglioli Riduttori S.p.A.', 'Officine Meccaniche Lombarde di Precisione S.r.l.']
    .map(n => stampNew({ id: newId(), name: n, active: true }));
  db.suppliers.push(...sup);
  const linee = db.items.slice(0, 6).map((x, j) => ({ id: newId(), itemId: x.id, code: x.code, description: x.name + ' — descrizione lunga per mettere alla prova la riga', uom: 'pz', qty: 10 + j, price: 1234.5678, deliveryDate: '', received: 0, note: '' }));
  const doc = (n, extra) => stampNew(Object.assign({ id: newId(), number: n, title: 'Fornitura ricambi linea di assemblaggio nastri trasportatori', date: '2026-10-01', status: 'inviato', supplierId: sup[1].id, transport: '', payment: '', notes: '', notesInternal: '', supplierConfirmation: '', active: true, rfqId: null, planId: null, jobId: null, lines: linee.map(l => Object.assign({}, l, { id: newId() })) }, extra));
  db.rfqs.push(doc('RFQ-2026-001', { status: 'inviata' }));
  db.orders.push(doc('ODA-2026-001'));
  db.jobs.push(stampNew({ id: newId(), number: 'COM-2026-001', customer: 'Costruzioni Meccaniche Rossi & Figli S.n.c.', title: 'Linea di imballaggio automatica', customerRef: 'Ord. 4512/AB', status: 'aperta', date: '2026-09-01', dueDate: '2026-12-15', notes: '', active: true }));
  // Un piano su due assiemi: la scheda porta Programma, fattibile e carico.
  db.plans.push(stampNew({ id: newId(), number: 'FAB-2026-001', title: 'Lotto di prova', date: '2026-10-01', dueDate: '2026-12-15',
    notes: '', active: true, jobId: null, lines: db.items.filter(i => isAssembly(i.type)).slice(0, 2)
      .map(x => ({ id: newId(), itemId: x.id, qty: 2, dueDate: '2026-12-15' })) }));
  saveDB();
  return u.id;
};
const VISTE = [
  ['home', "setView('home')"], ['dash', "setView('dash')"], ['buy', "setView('buy')"], ['rfq', "setView('rfq')"],
  ['orders-edit', "setView('orders'); openOrderEdit(db.orders[0].id)"],
  ['jobs-edit', "setView('jobs'); openJobEdit(db.jobs[0].id)"],
  ['plan-edit', "setView('mrp'); openPlanEdit(db.plans[0].id)"],
  ['avz', "setView('avz')"],
  ['storia', "storiaApri('order', db.orders[0].id)"],
  ['bom-confronto', "setView('bom'); const as = db.items.filter(i => isAssembly(i.type)); _bomConfronto.soloDiff = false; bomCompareModal(as[0].id, as[1].id)"],
];
const LARGHEZZE = [1920, 1440, 1366, 1280, 1024, 820, 390];

(async () => {
  const browser = await chromium.launch();
  const esito = [];
  for (const w of LARGHEZZE) {
    const page = await browser.newPage({ viewport: { width: w, height: 800 } });
    const errori = [];
    page.on('pageerror', e => errori.push(e.message));
    await page.goto('file://' + APP);
    await page.waitForFunction(() => typeof Store !== 'undefined' && Store.archivio !== undefined && typeof db !== 'undefined' && db);
    const uid = await page.evaluate(SEED);
    // Con l'archivio in IndexedDB il salvataggio finisce dopo: si ricarica
    // solo quando è arrivato.
    await page.waitForFunction(() => Store.scrittureInVolo() === 0);
    await page.evaluate(id => localStorage.setItem('bomtrack_session', JSON.stringify({ userId: id, ts: new Date().toISOString() })), uid);
    await page.reload(); await page.waitForTimeout(300);
    for (const [nome, js] of VISTE) {
      await page.evaluate(x => { try { closeModal && closeModal(); } catch (e) {} eval(x); }, js);
      await page.waitForTimeout(80);
      const r = await page.evaluate(() => {
        const h = document.getElementById('app-header'), nav = document.getElementById('main-nav');
        const nr = nav.getBoundingClientRect();
        const inMenu = h.classList.contains('h-l4');
        const vis = el => getComputedStyle(el).display !== 'none';
        const btns = [...nav.querySelectorAll('.nav-btn')];
        return {
          hscroll: document.scrollingElement.scrollWidth - innerWidth,
          livello: h.className,
          menuBtn: vis(document.getElementById('nav-menu-btn')),
          inMenu,
          sezioniFuori: inMenu ? [] : btns.filter(b => { const r = b.getBoundingClientRect(); return r.left < nr.left - 1 || r.right > nr.right + 1; }).map(b => b.getAttribute('aria-label')),
          piccoli: innerWidth < 500 ? [...document.querySelectorAll('button, select, input:not([type=checkbox]):not([type=radio]):not([type=hidden])')]
            .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && (r.height < 32 || r.width < 32); })
            .map(e => (e.className || e.tagName) + ' ' + Math.round(e.getBoundingClientRect().width) + '×' + Math.round(e.getBoundingClientRect().height)).slice(0, 5) : [],
        };
      });
      esito.push(Object.assign({ larghezza: w, vista: nome }, r));
    }
    // Il menu ☰, dove c'è, deve mostrare tutte le sezioni e chiudersi con Esc.
    const menu = await page.evaluate(() => {
      const h = document.getElementById('app-header');
      if (!h.classList.contains('h-l4')) return null;
      document.getElementById('nav-menu-btn').click();
      const voci = [...document.querySelectorAll('#main-nav .nav-btn')].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.bottom <= innerHeight; }).length;
      const totale = document.querySelectorAll('#main-nav .nav-btn').length;
      return { aperto: h.classList.contains('menu-nav'), voci, totale };
    });
    if (menu) { await page.keyboard.press('Escape'); menu.chiusoConEsc = !(await page.evaluate(() => document.getElementById('app-header').classList.contains('menu-nav'))); }
    // Sotto i 1100 px l'elenco sta sopra la scheda: aperto un documento, la
    // pagina deve portarlo in vista (dalla 0.157.2).
    const inVista = w > 1100 ? null : await page.evaluate(() => {
      try { closeModal(); } catch (e) {}
      setView('orders'); docBackToList('order'); window.scrollTo(0, 0);
      openOrderEdit(db.orders[0].id);
      const pag = document.querySelector('[id^="view-"].active .doc-page');
      const top = pag ? pag.getBoundingClientRect().top : -1;
      return { top: Math.round(top), alto: innerHeight };
    });
    esito.push({ larghezza: w, menu, errori, inVista });
    await page.close();
  }
  await browser.close();
  process.stdout.write(JSON.stringify(esito));
})().catch(e => { process.stdout.write(JSON.stringify({ errore: String(e && e.stack || e) })); process.exit(0); });
