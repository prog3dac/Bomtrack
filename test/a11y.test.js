// Raggiungibile anche senza mouse.
//
// L'app è piena di righe e simboli cliccabili che il browser non considera
// pulsanti: un `<div onclick>` non entra nel giro del tabulatore e Invio non lo
// attiva, quindi chi non usa il mouse — per abitudine o perché non può — resta
// fuori da quella funzione senza che niente glielo dica. `codeLink` rispettava
// il patto giusto da sempre; questi test lo estendono a tutti gli altri.
//
// Il DOM finto della suite non ha `querySelectorAll`, quindi `a11yFields()` —
// che lavora sul documento vivo — qui si verifica solo per la sua guardia. Il
// resto è HTML, e l'HTML si legge.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, asm, comp } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || makeDb({ items: [mat('m1', 10)] }));
  a.asRole('admin');
  return a;
}

describe('clickAttrs: il patto di un elemento cliccabile', () => {
  it('si dichiara pulsante ed entra nel giro del tabulatore', () => {
    const a = app();
    const h = a.eval(`clickAttrs("setView('mrp')")`);
    assert.match(h, /role="button"/);
    assert.match(h, /tabindex="0"/);
  });

  it('la stessa azione risponde al click, a Invio e alla barra spaziatrice', () => {
    const a = app();
    const h = a.eval(`clickAttrs("setView('mrp')")`);
    assert.match(h, /onclick="setView\('mrp'\)"/);
    assert.match(h, /onkeydown=.*Enter/);
    assert.match(h, /onkeydown=.*' '/);
    assert.match(h, /preventDefault/, 'senza, la barra spaziatrice fa scorrere la pagina');
  });

  it('l\'etichetta dice cosa fa, ed è escapata', () => {
    const a = app();
    const h = a.eval(`clickAttrs("apri()", 'Apri "ODA-1" & co.')`);
    assert.match(h, /aria-label="Apri &quot;ODA-1&quot; &amp; co\."/);
  });

  it('senza etichetta non si inventa un aria-label vuoto', () => {
    const a = app();
    assert.ok(!/aria-label/.test(a.eval(`clickAttrs("apri()")`)));
  });
});

describe('Le righe cliccabili delle viste rispettano il patto', () => {
  it('il riepilogo: ogni segnale è attivabile da tastiera', () => {
    const a = app(makeDb({ items: [mat('m1', 0)] }));   // articolo senza prezzo: un segnale c'è
    a.eval('renderHome()');
    const h = a.html('view-home');
    assert.match(h, /role="button"/);
    assert.match(h, /onkeydown=/);
    assert.match(h, /aria-label="[^"]*senza prezzo[^"]*"/, 'l\'etichetta dice il numero e dove porta');
  });

  it('l\'elenco commesse: si apre una commessa senza mouse', () => {
    const a = app(makeDb({ items: [], jobs: [{ id: 'j1', number: 'COM-1', customer: 'Rossi', status: 'aperta', active: true }] }));
    a.eval('renderJobs()');
    const h = a.html('view-jobs');
    assert.match(h, /role="button"/);
    assert.match(h, /aria-label="Apri la commessa COM-1"/);
  });

  it('l\'albero della distinta: espandere un nodo è un gesto da tastiera', () => {
    const a = app(makeDb({ items: [
      asm('mac', 'macchina', { components: [comp('g1', 1)] }),
      asm('g1', 'gruppo', { components: [comp('c1', 2)] }),
      acq('c1', 5),
    ] }));
    a.eval('currentBomId = "mac"; renderBom();');
    const h = a.html('bom-tree');
    assert.match(h, /class="bom-toggle" role="button"/);
    assert.match(h, /aria-expanded="false"/, 'e dice se il ramo è aperto o chiuso');
    assert.match(h, /aria-label="Espandi G1"/);
  });
});

describe('a11yFields non è mai un ostacolo', () => {
  it('un contenitore senza DOM interrogabile la lascia passare in silenzio', () => {
    // Vale per il DOM finto della suite e per qualunque render che la chiami
    // prima che l'elemento esista: non deve poter rompere un disegno.
    const a = app();
    assert.doesNotThrow(() => a.eval('a11yFields(null)'));
    assert.doesNotThrow(() => a.eval('a11yFields({})'));
  });

  it('le viste la attraversano senza lanciare', () => {
    const a = app(makeDb({ items: [mat('m1', 10)] }));
    assert.doesNotThrow(() => a.eval('renderHome(); renderJobs(); renderRfq(); renderOrders(); renderMrp();'));
  });
});

// ═══════════════════════════════════════════════════════════
//  Quello che l'app dice a chi non guarda lo schermo
// ═══════════════════════════════════════════════════════════
const fs = require('node:fs');
const path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const CSS_A11Y = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

// Ogni messaggio dell'app passa dal toast, errori di validazione compresi. Senza
// una live region tutta quella validazione non esiste per chi usa un lettore di
// schermo: il salvataggio «non fa niente» e non viene detto perché.
describe('Il toast è una live region', () => {
  it('l-elemento la dichiara nel markup', () => {
    const div = HTML.match(/<div id="toast"[^>]*>/)[0];
    assert.match(div, /aria-live=/);
    assert.match(div, /role="status"/);
  });

  it('un errore interrompe, una conferma aspetta il proprio turno', () => {
    const a = loadApp({ silent: true });
    a.eval('showToast("Salvato")');
    assert.equal(a.el('toast').getAttribute('aria-live'), 'polite');
    assert.equal(a.el('toast').getAttribute('role'), 'status');
    a.eval('showToast("Nome richiesto", "error")');
    assert.equal(a.el('toast').getAttribute('aria-live'), 'assertive');
    assert.equal(a.el('toast').getAttribute('role'), 'alert');
  });
});

// È la sola schermata che ogni utente attraversa per forza, e a11yFields() non
// ci passa mai: ripara i campi cercando .modal-field, e qui la classe è un'altra.
describe('La schermata di accesso ha etichette vere', () => {
  ['login-name', 'login-email', 'login-password'].forEach(id => {
    it('il campo ' + id + ' ha la sua label', () => {
      assert.match(HTML, new RegExp('<label[^>]*for="' + id + '"'), 'nessuna label per ' + id);
    });
  });
  it('l-errore di credenziali viene annunciato', () => {
    const div = HTML.match(/<div id="login-error"[^>]*>/)[0];
    assert.match(div, /role="alert"/);
  });
  it('.sr-only esiste e non nasconde ai lettori di schermo', () => {
    assert.match(CSS_A11Y, /\.sr-only\{[^}]*position:absolute/);
    assert.doesNotMatch(CSS_A11Y.match(/\.sr-only\{[^}]*\}/)[0], /display:none/,
      'display:none toglierebbe l-etichetta anche a chi ne ha bisogno');
  });
});

// Su tabelle da 12-16 colonne, senza scope un lettore di schermo non associa la
// cella alla sua intestazione: la navigazione per celle diventa una sequenza di
// numeri senza etichetta.
describe('Le intestazioni di tabella dichiarano di essere colonne', () => {
  const FILES = ['views-catalog.js', 'views-docs.js', 'views-item.js', 'views-mrp.js',
    'views-report.js', 'views-stock.js', 'alternativi.js', 'varianti.js'];
  it('nessun <th> resta senza scope', () => {
    const nudi = [];
    FILES.forEach(f => {
      const s = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      s.split(/\r?\n/).forEach((riga, i) => {
        // `<th` seguito da spazio, `>` o `$` (l'intestazione a due righe dei
        // documenti costruisce gli attributi con un template).
        const m = riga.match(/<th(?![a-z])(?! scope=)/);
        if (m) nudi.push(f + ':' + (i + 1));
      });
    });
    assert.deepEqual(nudi, []);
  });
});

// Le due griglie principali erano le uniche a emettere una <table> nuda: su
// schermo stretto trascinavano in scroll orizzontale l'intera pagina.
describe('Le tabelle larghe scorrono dentro sé stesse', () => {
  it('ogni tabella larga che l-app disegna sta dentro .table-wrap', () => {
    // Si guarda quello che esce, non il sorgente: da quando la griglia è una
    // sola (itemGrid), cercare il markup dentro i file delle viste proverebbe
    // dove sta scritto invece di cosa fa.
    const a = loadApp({ silent: true });
    a.asRole('admin');
    a.setDb(makeDb({ items: [Object.assign(mat('m1', 10), { code: 'M1' })] }));
    a.eval('renderCatalog("buy")');
    a.eval('renderStock()');
    [['Anagrafica', 'buy-table'], ['Magazzino', 'stk-table']].forEach(([nome, id]) => {
      const h = a.html(id);
      assert.match(h, /<table/, nome + ': nessuna tabella disegnata');
      assert.doesNotMatch(h.replace(/<div class="table-wrap"><table/g, ''), /<table/,
        nome + ': una tabella fuori da .table-wrap sfonda il viewport su schermo stretto');
    });
  });
  it('e .table-wrap scorre davvero in orizzontale', () => {
    assert.match(CSS_A11Y, /\.table-wrap\{[^}]*overflow-x:auto/);
  });
});

// Sotto i 1330px la media query nasconde .nav-label, e display:none toglie quel
// testo anche all'albero di accessibilità: il pulsante resterebbe senza nome.
describe('La navigazione conserva il nome quando perde il testo', () => {
  it('ogni pulsante di gruppo porta il proprio aria-label', () => {
    const a = loadApp({ silent: true });
    a.asRole('admin');
    a.setDb(makeDb());
    a.eval('activeView = "bom"; renderNav();');
    const html = a.html('main-nav');
    const bottoni = html.match(/<button class="nav-btn[^>]*>/g) || [];
    assert.ok(bottoni.length > 1, 'la barra disegna i suoi gruppi');
    bottoni.forEach(b => assert.match(b, /aria-label="/, b));
  });
  it('la seconda riga dice quale vista è quella aperta', () => {
    const a = loadApp({ silent: true });
    a.asRole('admin');
    a.setDb(makeDb());
    a.eval('activeView = "buy"; renderNav();');
    const html = a.html('sub-nav');
    if (!html) return;   // gruppo con una voce sola: la riga non si disegna
    assert.match(html, /aria-current="page"/);
  });
});

// Su tablet la maniglia era inerte, e il pannello restava largo quanto nasce
// rubando spazio all'elenco per sempre.
describe('Il pannello laterale si ridimensiona anche col dito', () => {
  const INSP = fs.readFileSync(path.join(__dirname, '..', 'inspector.js'), 'utf8');
  it('gli ascoltatori sono pointer, non mouse', () => {
    ['pointerdown', 'pointermove', 'pointerup'].forEach(e => assert.match(INSP, new RegExp("'" + e + "'"), e));
    assert.doesNotMatch(INSP, /addEventListener\('mouse(down|move|up)'/, 'i mouse* lasciavano fuori il dito');
  });
  it('e la maniglia non fa scorrere la pagina mentre si trascina', () => {
    assert.match(CSS_A11Y, /\.insp-resizer\{[^}]*touch-action:none/);
  });
});
