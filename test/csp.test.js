// La Content-Security-Policy (dalla 0.141.0). Il primo livello gira sempre e
// legge index.html; il secondo apre l'app vera in Chromium, con un doppio clic
// e da un indirizzo web (test/csp-browser.js), se c'è Playwright.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('./tap.js');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const csp = (/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(HTML) || [])[1] || '';
const regola = nome => (csp.split(';').map(s => s.trim()).find(s => s.startsWith(nome + ' ')) || '').split(/\s+/).slice(1);

describe('La politica dei contenuti, in index.html', () => {
  it('c\'è, ed è la prima cosa dopo il charset', () => {
    assert.ok(csp, 'manca la meta Content-Security-Policy');
    assert.ok(HTML.indexOf('Content-Security-Policy') < HTML.indexOf('<link'), 'deve valere prima di ogni risorsa');
  });
  it('gli script vengono solo dall\'app: niente CDN, niente eval', () => {
    assert.deepEqual(regola('script-src').filter(s => !["'self'", 'file:', "'unsafe-inline'"].includes(s)), []);
    assert.ok(!csp.includes("'unsafe-eval'"));
  });
  it('niente plugin, niente <base>, niente moduli che spediscono altrove', () => {
    assert.deepEqual(regola('object-src'), ["'none'"]);
    assert.deepEqual(regola('base-uri'), ["'none'"]);
    assert.deepEqual(regola('form-action'), ["'none'"]);
  });
  it('ogni script della pagina è dell\'app o di vendor/', () => {
    const src = [...HTML.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]);
    assert.ok(src.length);
    assert.deepEqual(src.filter(s => /^(https?:)?\/\//.test(s)), []);
  });
});

let playwright = null;
try { require.resolve('playwright'); playwright = true; } catch (e) { playwright = false; }
describe('Nell\'app vera, con la politica attiva', () => {
  if (!playwright) { it('saltato: Playwright non disponibile (in CI c\'è)', () => {}); return; }
  const { execFileSync } = require('node:child_process');
  const out = execFileSync(process.execPath, [path.join(__dirname, 'csp-browser.js')], { encoding: 'utf8', env: process.env, maxBuffer: 16 * 1024 * 1024, timeout: 300000 });
  const esito = JSON.parse(out);
  const rotto = esito.find(x => x.errore);
  if (rotto) { it('il browser è partito', () => assert.fail(rotto.errore)); return; }
  esito.forEach(x => {
    it(`${x.modo === 'file' ? 'con un doppio clic' : 'da un indirizzo web'}: ogni vista, un Excel e un PDF, senza violazioni né errori`, () => {
      assert.ok(x.viste > 10, `viste visitate: ${x.viste}`);
      assert.deepEqual(x.problemi, []);
      assert.equal(x.scaricati.length, 2, 'scaricati: ' + x.scaricati.join(', '));
    });
  });
});
