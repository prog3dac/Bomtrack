// I menu dei fornitori in cui si scrive (combo.js, dalla 0.102.0).
//
// La logica del filtro si prova qui, senza browser. Il comportamento vero —
// il menu nascosto, la lista che si apre, la tastiera, il blocco del
// documento — si prova in Chromium con test/combo-browser.js.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');

const J = (a, expr) => JSON.parse(a.eval(`JSON.stringify(${expr})`));
const VOCI = `[{ value: '', testo: 'Tutti i fornitori' }, { value: 'b', testo: 'Bonfiglioli Riduttori S.p.A.' },
  { value: 'c', testo: 'Città Viteria' }, { value: 'l', testo: 'Lombardini Motori' }, { value: 'o', testo: 'Officine Meccaniche Lombarde' }]`;

describe('Fornitori: il filtro mentre si scrive', () => {
  const a = loadApp({ silent: true });
  const filtra = t => J(a, `comboFiltra(${VOCI}, ${JSON.stringify(t)}).map(o => o.value)`);
  it('senza testo ci sono tutte le voci, nell\'ordine del menu', () => {
    assert.deepEqual(filtra(''), ['', 'b', 'c', 'l', 'o']);
  });
  it('maiuscole e accenti non contano', () => {
    assert.deepEqual(filtra('CITTA'), ['c']);
  });
  it('ogni parola scritta deve esserci, in qualunque ordine', () => {
    assert.deepEqual(filtra('rid bonf'), ['b']);
    assert.deepEqual(filtra('lomb mot'), ['l']);
  });
  it('prima chi comincia così, poi chi lo contiene', () => {
    assert.deepEqual(filtra('lomb'), ['l', 'o']);
    assert.deepEqual(filtra('l'), ['l', 'b', 'o']);
  });
  it('niente che corrisponde: lista vuota', () => {
    assert.deepEqual(filtra('zzz'), []);
  });
});

describe('Fornitori: quali campi si possono cercare', () => {
  it('i menu fornitore di documenti, listino, cicli, centri, filtri e magazzino sono marcati', () => {
    const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    const conta = (f, re) => (src(f).match(re) || []).length;
    // Dalla 0.107.0 la testata dei tre documenti è una sola (docTestaHtml).
    assert.equal(conta('views-docs.js', /<select[^>]*sel-cerca[^>]*onchange="\$\{o\.pfx\}SetSupplier/g), 1, 'la testata comune');
    assert.equal(conta('views-docs.js', /docTestaHtml\(\{ pfx: '(rfq|ord|odl)'/g), 3, 'richiesta, ordine, ordine di lavoro');
    assert.match(src('views-docs.js'), /id="\$\{kind\}f-sup" class="sel-cerca"/);
    assert.match(src('views-docs.js'), /id="pick-sup" class="sel-cerca"/);
    assert.match(src('views-catalog.js'), /class="sel-cerca" \$\{ro\} onchange="priceSetField/);
    assert.match(src('views-catalog.js'), /id="plv-sup" class="sel-cerca"/);
    assert.match(src('views-catalog.js'), /class="cycle-sup sel-cerca"/);
    assert.match(src('views-catalog.js'), /id="cyc-opsup" class="sel-cerca"/);
    assert.match(src('views-manage.js'), /class="sel-cerca" onchange="wcSupplierSetField/);
    assert.match(src('views-stock.js'), /id="mv-sup" class="sel-cerca"/);
  });
});

let playwright = null;
try { require.resolve('playwright'); playwright = true; } catch (e) { playwright = false; }
describe('Fornitori: nel browser vero', () => {
  if (!playwright) { it('saltato: Playwright non disponibile (in CI c\'è)', () => {}); return; }
  const { execFileSync } = require('node:child_process');
  const r = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'combo-browser.js')], { encoding: 'utf8', env: process.env, timeout: 120000 }));
  if (r.errore) { it('il browser è partito', () => assert.fail(r.errore)); return; }
  it('il menu resta nella pagina, nascosto, e il campo mostra il fornitore scelto', () => {
    assert.ok(r.campo.selNascosto);
    assert.ok(r.campo.testo.length > 0);
  });
  it('cliccando si apre la lista intera; scrivendo resta solo chi corrisponde', () => {
    assert.ok(r.tutte >= 5);
    assert.deepEqual(r.filtrate, ['Città Viteria']);
    assert.deepEqual(r.dueParole, ['Lombardini Motori']);
  });
  it('Invio sceglie, e la scelta arriva al documento come un clic sul menu', () => {
    assert.equal(r.scelto, 'Città Viteria');
  });
  it('Esc chiude la lista e rimette il fornitore scelto, senza cambiarlo', () => {
    assert.deepEqual(r.dopoEsc, { testo: 'Città Viteria', lista: 'none', fornitore: 'Città Viteria' });
  });
  it('quando nessuno corrisponde lo dice', () => {
    assert.match(r.nulla, /Nessun fornitore/);
  });
  it('su un documento bloccato il campo è bloccato come il menu', () => {
    assert.deepEqual(r.bloccato, { sel: true, campo: true });
  });
  it('nei filtri la voce vuota fa da segnaposto, e frecce e Invio scelgono', () => {
    assert.equal(r.segnaposto, 'Tutti i fornitori');
    assert.equal(r.conL[0], 'Lombardini Motori', 'chi comincia con la lettera viene prima');
    assert.equal(r.filtro.valore, r.conL[1]);
    assert.equal(r.filtro.sel, r.conL[1]);
  });
  it('nessun errore nella pagina', () => {
    assert.deepEqual(r.errori, []);
  });
});
