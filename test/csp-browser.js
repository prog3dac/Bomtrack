// La Content-Security-Policy di index.html nell'app vera (dalla 0.141.0).
// Lanciato da test/csp.test.js quando c'è Playwright.
//
// L'app si apre in due modi, e la politica deve reggerli tutti e due: con un
// doppio clic (file://, dove `'self'` non basta e serve `file:`) e da un
// indirizzo web. In ciascuno si passa da ogni vista e si fanno un Excel e un
// PDF, che caricano le librerie di vendor/: ogni violazione e ogni errore della
// pagina finiscono nell'esito.
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');

const TIPI = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
function servi() {
  return new Promise(ok => {
    const srv = http.createServer((req, res) => {
      const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TIPI[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => ok(srv));
  });
}

const SEED = () => {
  Store.reset();
  const u = { id: newId(), name: 'Anna Bianchi', username: 'anna', email: 'a@x.it', role: 'admin', color: '#3A7BE8', active: true };
  setUserPassword(u, 'x'); stampNew(u); db.users.push(u);
  saveDB();
  return u.id;
};

(async () => {
  const esito = [];
  let browser, srv;
  try {
    browser = await chromium.launch();
    srv = await servi();
    const modi = [['file', 'file://' + path.join(ROOT, 'index.html')], ['http', `http://127.0.0.1:${srv.address().port}/index.html`]];
    for (const [modo, url] of modi) {
      const ctx = await browser.newContext({ acceptDownloads: true });
      const page = await ctx.newPage();
      const problemi = [];
      page.on('pageerror', e => problemi.push('errore: ' + e.message));
      page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) problemi.push('console: ' + m.text()); });
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', e => {
          (window.__csp = window.__csp || []).push(`${e.violatedDirective} ${e.blockedURI || '(in linea)'}`);
        });
      });
      await page.goto(url);
      await page.waitForFunction(() => typeof Store !== 'undefined' && Store.archivio !== undefined && typeof db !== 'undefined' && db);
      const uid = await page.evaluate(SEED);
      await page.waitForFunction(() => Store.scrittureInVolo() === 0);
      await page.evaluate(id => localStorage.setItem('bomtrack_session', JSON.stringify({ userId: id, ts: new Date().toISOString() })), uid);
      await page.reload();
      await page.waitForFunction(() => typeof NAV !== 'undefined' && typeof setView === 'function');
      const viste = await page.evaluate(() => navGroups().flatMap(g => navVoci(g).map(v => v.id)));
      for (const v of viste) {
        await page.evaluate(x => { try { closeModal(); } catch (e) { /* niente aperto */ } setView(x); }, v);
        await page.waitForTimeout(40);
      }
      // Un Excel e un PDF: caricano SheetJS e jsPDF, e scaricano da un blob.
      const scaricati = [];
      page.on('download', d => scaricati.push(d.suggestedFilename()));
      await page.evaluate(() => { setView('design'); exportListXlsx(catalogExportSpec('design')); });
      await page.waitForTimeout(400);
      await page.evaluate(() => exportListPdf(catalogExportSpec('design')));
      await page.waitForTimeout(800);
      const violazioni = await page.evaluate(() => window.__csp || []);
      esito.push({ modo, viste: viste.length, scaricati, problemi: problemi.concat(violazioni.map(x => 'csp: ' + x)) });
      await ctx.close();
    }
  } catch (e) {
    esito.push({ errore: String(e && e.stack || e) });
  } finally {
    if (browser) await browser.close();
    if (srv) srv.close();
  }
  process.stdout.write(JSON.stringify(esito));
})();
