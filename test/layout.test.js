// Impaginazione e intestazione — i difetti trovati nella 0.83.1 e corretti
// nella 0.83.2, scritti perché non tornino.
//
// Due livelli, come per Postgres. Il primo gira sempre: l'algoritmo che adatta
// l'intestazione, su un DOM simulato, e le regole CSS che avevano causato i
// difetti. Il secondo gira se c'è Playwright (in CI c'è): l'app vera in
// Chromium a sette larghezze, via test/layout-browser.js.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

// ── Un'intestazione finta, che «misura» secondo i livelli applicati ──
// Ogni livello libera una quantità di spazio fissa: è il modello più semplice
// che basta a verificare l'ordine e l'arresto dell'algoritmo.
function intestazione(a, larghezza, servono) {
  a.eval(`(() => {
    const classi = new Set();
    const cl = { add: c => classi.add(c), remove: (...cs) => cs.forEach(c => classi.delete(c)), contains: c => classi.has(c), toggle: (c, v) => { if (v === undefined) v = !classi.has(c); v ? classi.add(c) : classi.delete(c); return v; } };
    const libera = { 'h-l1': ${servono.l1}, 'h-l2': ${servono.l2}, 'h-l3': ${servono.l3} };
    const serve = () => ${servono.tutto} - [...classi].reduce((s, c) => s + (libera[c] || 0), 0);
    globalThis.__w = ${larghezza};
    const h = { classList: cl, style: {}, get clientWidth() { return __w; }, get scrollWidth() { return __w; }, get className() { return [...classi].join(' '); } };
    const nav = { _nav: true, get clientWidth() { return __w - 400; }, get scrollWidth() { return Math.max(0, serve() - 400); } };
    const finti = { 'app-header': h, 'main-nav': nav, 'nav-menu-btn': { setAttribute() {} }, 'extra-menu-btn': { setAttribute() {} } };
    const prima = document.getElementById;
    document.getElementById = id => finti[id] || prima.call(document, id);
    globalThis.getComputedStyle = el => ({ display: el && el._nav && classi.has('h-l4') ? 'none' : 'flex' });
    globalThis.__h = h;
  })()`);
}
const livello = a => a.eval('__h.className');

describe('L\'intestazione cede spazio per gradi, e solo quanto serve', () => {
  const casi = { tutto: 1800, l1: 150, l2: 250, l3: 300 };
  it('se tutto ci sta, nessun livello', () => {
    const a = loadApp({ silent: true }); intestazione(a, 1900, casi);
    a.eval('adattaHeader()');
    assert.equal(livello(a), '');
  });
  it('prima il ruolo e la data, poi i comandi sotto ⋯ — le etichette restano', () => {
    const a = loadApp({ silent: true }); intestazione(a, 1440, casi);
    a.eval('adattaHeader()');
    assert.equal(livello(a), 'h-l1 h-l2', 'a 1440 px le sezioni si leggono ancora per nome');
  });
  it('poi le etichette, e per ultimo il menu ☰', () => {
    const a = loadApp({ silent: true }); intestazione(a, 1200, casi);
    a.eval('adattaHeader()');
    assert.equal(livello(a), 'h-l1 h-l2 h-l3');
    const b = loadApp({ silent: true }); intestazione(b, 600, casi);
    b.eval('adattaHeader()');
    assert.equal(livello(b), 'h-l1 h-l2 h-l3 h-l4');
  });
  it('allargando la finestra si torna indietro', () => {
    const a = loadApp({ silent: true }); intestazione(a, 600, casi);
    a.eval('adattaHeader()');
    a.eval('__w = 1900; adattaHeader()');
    assert.equal(livello(a), '');
  });
  it('un menu aperto resta aperto solo se il suo pulsante c\'è ancora', () => {
    const a = loadApp({ silent: true }); intestazione(a, 600, casi);
    a.eval('adattaHeader(); headerMenu("nav")');
    assert.match(livello(a), /menu-nav/);
    a.eval('__w = 1900; adattaHeader()');
    assert.doesNotMatch(livello(a), /menu-nav/);
  });
  it('aprirne uno chiude l\'altro', () => {
    const a = loadApp({ silent: true }); intestazione(a, 600, casi);
    a.eval('adattaHeader(); headerMenu("nav"); headerMenu("extra")');
    assert.match(livello(a), /menu-extra/);
    assert.doesNotMatch(livello(a), /menu-nav/);
  });
});

describe('Le regole che avevano causato i difetti non tornano', () => {
  it('la barra delle sezioni non è centrata con justify-content: la parte in eccesso finiva oltre il bordo', () => {
    const nav = CSS.match(/\n\.nav\{[^}]*\}/)[0];
    assert.doesNotMatch(nav, /justify-content:center/);
  });
  it('niente soglie fisse per le etichette delle sezioni', () => {
    assert.doesNotMatch(CSS, /@media\(max-width:\d+px\)\{\.nav-label\{display:none/);
  });
  it('i pulsanti dei menu sono nascosti con l\'id davanti, o .btn-icon li rimette in riga', () => {
    assert.match(CSS, /#app-header \.header-menu-btn\{display:none\}/);
  });
  it('sotto i 1100 px la colonna dell\'elenco è minmax(0,1fr), non 1fr', () => {
    assert.match(CSS, /\.wl\{grid-template-columns:minmax\(0,1fr\)\}/);
  });
  it('un codice articolo non va a capo sul trattino', () => {
    assert.match(CSS, /\.code-link\{[^}]*white-space:nowrap/);
  });
});

// ── Il browser vero ──
let playwright = null;
try { require.resolve('playwright'); playwright = true; } catch (e) { playwright = false; }
describe('Nell\'app vera, a sette larghezze', () => {
  if (!playwright) { it('saltato: Playwright non disponibile (in CI c\'è)', () => {}); return; }
  const { execFileSync } = require('node:child_process');
  const out = execFileSync(process.execPath, [path.join(__dirname, 'layout-browser.js')], { encoding: 'utf8', env: process.env, maxBuffer: 16 * 1024 * 1024, timeout: 300000 });
  const esito = JSON.parse(out);
  if (esito.errore) { it('il browser è partito', () => assert.fail(esito.errore)); return; }
  const viste = esito.filter(x => x.vista);
  const menu = esito.filter(x => !x.vista);

  it('nessuna pagina scorre di lato', () => {
    const male = viste.filter(x => x.hscroll > 0).map(x => `${x.larghezza}/${x.vista}: ${x.hscroll}px`);
    assert.deepEqual(male, []);
  });
  it('ogni sezione si raggiunge: in riga e per intero, o nel menu ☰', () => {
    const male = viste.filter(x => x.sezioniFuori.length).map(x => `${x.larghezza}: ${x.sezioniFuori.join(', ')}`);
    assert.deepEqual([...new Set(male)], []);
  });
  it('il pulsante ☰ compare solo quando le sezioni sono nel menu', () => {
    viste.forEach(x => assert.equal(x.menuBtn, x.inMenu, `${x.larghezza}/${x.vista}`));
  });
  it('il menu ☰ mostra tutte le sezioni e si chiude con Esc', () => {
    const conMenu = menu.filter(m => m.menu);
    assert.ok(conMenu.length, 'almeno il telefono deve usare il menu');
    conMenu.forEach(m => {
      assert.ok(m.menu.aperto);
      assert.equal(m.menu.voci, m.menu.totale, `${m.larghezza}: ${m.menu.voci} voci su ${m.menu.totale}`);
      assert.ok(m.menu.chiusoConEsc);
    });
  });
  it('al telefono nessun comando sotto i 32 px', () => {
    const male = viste.filter(x => x.piccoli.length).map(x => `${x.vista}: ${x.piccoli.join(', ')}`);
    assert.deepEqual(male, []);
  });
  it('nessun errore JavaScript', () => {
    assert.deepEqual(menu.flatMap(m => m.errori), []);
  });
});

describe('Telefono: menu «Esporta» e schede lunghe dentro lo schermo (dalla 0.105.6)', () => {
  it('le schede su schermo stretto usano l\'altezza dinamica, con vh come riserva', () => {
    const regola = CSS.match(/@media\(max-width:640px\)\{\s*\.panel,\.panel-wide\{[^}]*\}/)[0];
    assert.match(regola, /max-height:calc\(100vh - 16px\);max-height:calc\(100dvh - 16px\)/);
  });
  it('il menu a tendina non è più largo dello schermo e sa ancorarsi a sinistra', () => {
    assert.match(CSS, /\.dd-menu\{max-width:calc\(100vw - 16px\)\}/);
    assert.match(CSS, /\.dd-menu\.dd-sx\{right:auto;left:0\}/);
  });
  it('un menu che uscirebbe a sinistra si gira; uno che ci sta resta a destra', () => {
    const a = loadApp({ silent: true });
    const prova = sinistra => a.eval(`(() => {
      const classi = new Set();
      const m = { classList: { add: c => classi.add(c), remove: c => classi.delete(c) },
        getBoundingClientRect: () => ({ left: classi.has('dd-sx') ? 10 : ${sinistra} }) };
      tendinaPosiziona({ querySelector: () => m });
      return classi.has('dd-sx');
    })()`);
    assert.equal(prova(-50), true);
    assert.equal(prova(120), false);
  });
});
