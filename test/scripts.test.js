// L'ordine dei <script>.
//
// L'app non ha moduli: è una sequenza di classic script in uno scope solo, e
// `init()` sta in fondo all'ultimo di essi. Chi ne aggiunge uno dopo rompe
// l'avvio — le funzioni del file nuovo non esistono ancora quando la prima
// vista si disegna — e su `file://` il browser non lo dice nemmeno: l'errore
// arriva come «Script error.», senza riga né stack, perché lo script viene da
// un'origine opaca. È già successo, e la suite non se n'era accorta perché
// l'harness non chiama `init()`.
//
// Questi due controlli costano niente e rendono impossibile ripeterlo.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// Solo gli script dell'app: le librerie di export stanno in vendor/ e vengono
// prima di tutto, nel <head>.
function scriptDiIndex() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)]
    .map(m => m[1])
    .filter(src => !src.startsWith('vendor/'));
}
function srcDellHarness() {
  const js = fs.readFileSync(path.join(__dirname, 'harness.js'), 'utf8');
  const m = js.match(/const SRC = \[([\s\S]*?)\];/);
  return m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

describe('Ordine di caricamento', () => {
  it('l\'avvio resta nell\'ultimo script: dopo di lui non ci va nessuno', () => {
    const scripts = scriptDiIndex();
    assert.equal(scripts[scripts.length - 1], 'import-export.js',
      'init() è in fondo a import-export.js: uno script caricato dopo non esiste ancora quando l\'app disegna la prima vista');
  });

  it('la suite carica gli stessi file nello stesso ordine della pagina', () => {
    assert.deepEqual(srcDellHarness(), scriptDiIndex(),
      'se le due sequenze divergono la suite prova un\'app diversa da quella che gira nel browser');
  });

  it('ogni script dichiarato esiste davvero', () => {
    scriptDiIndex().forEach(src => {
      assert.ok(fs.existsSync(path.join(ROOT, src)), `manca il file ${src}`);
    });
  });
});

// ═══════════════════════════════════════════════════════════
//  Lo scope globale piatto
// ═══════════════════════════════════════════════════════════
// L'app non ha moduli: i 26 script condividono un unico scope, e due file che
// dichiarano lo stesso nome non danno nessun errore — vince l'ultimo caricato,
// silenziosamente, e la funzione che il primo file credeva di chiamare è un'altra.
//
// È il rischio che `docs/analisi-tecnica.md` registra come C4, e la sua
// conclusione è che si chiude solo passando ai moduli, cioè rinunciando ad
// aprire l'app con un doppio click su file://. Vero per il problema generale —
// ma la **collisione**, che è il modo in cui quel rischio fa danno, si può
// impedire senza rinunciare a niente: basta contarla.
//
// Al momento in cui questo controllo è stato scritto i nomi globali erano 1291
// e le collisioni zero. Serve a tenerle zero.
describe('Nomi globali', () => {
  // Le dichiarazioni di primo livello: `function x()` e `let/const/var x` a
  // inizio riga. Non è un analizzatore sintattico e non deve esserlo — le
  // dichiarazioni annidate sono rientrate, e quindi non finiscono qui.
  // Un elenco e non un insieme: anche lo stesso file può dichiarare un nome
  // due volte, e il danno è lo stesso (fino alla 0.125.0 views-mrp.js aveva due
  // `planDocsCount`, e il contatore delle righe scelte nel piano restava vuoto).
  function globaliDi(file) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const nomi = [];
    for (const m of src.matchAll(/^(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm)) nomi.push(m[1]);
    for (const m of src.matchAll(/^(?:let|const|var)\s+([A-Za-z0-9_$]+)/gm)) nomi.push(m[1]);
    return nomi;
  }

  it('nessun nome è dichiarato da due script diversi', () => {
    const visto = new Map();
    const collisioni = [];
    scriptDiIndex().forEach(file => {
      globaliDi(file).forEach(nome => {
        if (visto.has(nome)) collisioni.push(`${nome}: ${visto.get(nome)} e ${file}`);
        else visto.set(nome, file);
      });
    });
    assert.deepEqual(collisioni, [],
      'due dichiarazioni dello stesso nome nello stesso scope: vince quella caricata dopo, e non lo dice nessuno');
  });
});

// ═══════════════════════════════════════════════════════════
//  I nomi delle collezioni, a chi legge
// ═══════════════════════════════════════════════════════════
// Il cestino e lo storico dicono di che cosa si tratta con TRASH_LABELS e
// STORICO_COLL. Una collezione aggiunta a SCHEMA e dimenticata lì si leggeva
// col suo nome interno: «maintPlans», «timeLogs».
describe('Nomi delle collezioni', () => {
  const { loadApp } = require('./harness.js');
  const app = loadApp({ silent: true });
  const senza = mappa => JSON.parse(app.eval(`JSON.stringify(Object.keys(SCHEMA).filter(k => k !== 'trash' && !${mappa}[k]))`));

  it('ogni collezione ha il suo nome nel cestino', () => {
    assert.deepEqual(senza('TRASH_LABELS'), []);
  });

  it('ogni collezione ha il suo nome nello storico', () => {
    assert.deepEqual(senza('STORICO_COLL'), []);
  });
});
