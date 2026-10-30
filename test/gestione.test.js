// La navigazione di Gestione e le pagine delle impostazioni (0.126.0).
//
// Le schede stanno in una colonna, raccolte per argomento; «Impostazioni», che
// mescolava costi, codici, sessione, aree, calendario ed etichette QR, si è
// divisa in pagine che salvano solo quello che mostrano. Il rischio da fissare
// è il secondo: salvare una pagina non deve azzerare i campi delle altre, che
// non sono a video.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb } = require('./fixtures.js');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

function app(modules) {
  const a = loadApp({ silent: true });
  const db = makeDb();
  db.settings = Object.assign({}, db.settings, { modules: modules || {} });
  a.setDb(db);
  a.asRole('admin');
  return a;
}
const pagina = (a, id) => { a.eval(`setMgmtTab('${id}')`); return a.html('mgmt-content'); };

describe('Gestione: la colonna delle schede', () => {
  it('ogni scheda ha il suo gruppo, e un gruppo non si spezza', () => {
    const a = app();
    const gruppi = Array.from(a.eval('MGMT_TABS.map(t => t.gruppo)'));
    assert.ok(gruppi.every(Boolean), 'una scheda senza gruppo');
    const visti = [];
    gruppi.forEach((g, i) => {
      if (i && gruppi[i - 1] === g) return;
      assert.ok(!visti.includes(g), `il gruppo ${g} compare due volte`);
      visti.push(g);
    });
  });
  it('i gruppi hanno il titolo e la scheda aperta è segnata', () => {
    const a = app();
    a.eval("setView('manage'); setMgmtTab('costi')");
    const nav = a.html('mgmt-tabs');
    ['Azienda', 'Anagrafiche', 'Classificazione articoli', 'Pianificazione e produzione', 'Configurazione', 'Dati']
      .forEach(g => assert.match(nav, new RegExp(`mgmt-group-title">${g}<`)));
    assert.match(nav, /class="mgmt-tab active" onclick="setMgmtTab\('costi'\)" aria-current="page"/);
  });
  it('la vecchia scheda Impostazioni porta ad Aree e moduli', () => {
    const a = app();
    a.eval("mgmtTab = 'settings'; setView('manage')");
    assert.equal(a.eval('mgmtTab'), 'moduli');
    assert.match(a.html('mgmt-content'), /class="set-area"/);
  });
});

describe('Gestione: le impostazioni divise per argomento', () => {
  it('ogni pagina mostra solo il suo argomento', () => {
    const a = app();
    const costi = pagina(a, 'costi'), cod = pagina(a, 'codifica'), cal = pagina(a, 'calendario');
    const mod = pagina(a, 'moduli'), qr = pagina(a, 'qr'), ut = pagina(a, 'users');
    assert.match(costi, /id="set-ov"/); assert.doesNotMatch(costi, /set-digits|set-cal-hol|set-session/);
    assert.match(cod, /id="set-digits"/); assert.match(cod, /id="set-partsourcing"/); assert.doesNotMatch(cod, /set-ov/);
    assert.match(cal, /id="set-cal-hol"/); assert.doesNotMatch(cal, /set-ov|set-qr-base/);
    assert.match(mod, /class="set-modulo"/); assert.doesNotMatch(mod, /set-cal-hol|set-ov/);
    assert.match(qr, /id="set-qr-base"/);
    assert.match(ut, /id="set-session"/, 'la durata della sessione sta con gli utenti');
    [costi, cod, cal, mod, qr].forEach(h => assert.match(h, /onclick="saveSettings\(\)"/));
  });
  it('il valore del magazzino sta con i costi, e solo con Costi reali acceso', () => {
    assert.match(pagina(app({ costiReali: true }), 'costi'), /id="set-valore-mag"/);
    assert.doesNotMatch(pagina(app({ costiReali: true }), 'moduli'), /id="set-valore-mag"/);
    assert.doesNotMatch(pagina(app({ costiReali: false }), 'costi'), /id="set-valore-mag"/);
  });
  it('salvare una pagina non tocca i campi delle altre', () => {
    const a = app();
    a.eval(`db.settings.overheadPct = 12; db.settings.marginPct = 30; db.settings.codeDigits = 4;
      db.settings.codePrefixParte = 'PZ'; db.settings.sessionDays = 9; db.settings.currency = '$'`);
    // A video solo i campi dei costi: gli altri non esistono.
    a.eval(`(() => {
      const campi = { 'set-ov': '15', 'set-mg': '25', 'set-cur': '€' };
      const prima = document.getElementById.bind(document);
      document.getElementById = id => campi[id] !== undefined ? { id, value: campi[id] } : /^set-/.test(id) ? null : prima(id);
      document.querySelector = () => null;
      saveSettings();
    })()`);
    const s = JSON.parse(a.eval('JSON.stringify(db.settings)'));
    assert.equal(s.overheadPct, 15);
    assert.equal(s.marginPct, 25);
    assert.equal(s.currency, '€');
    assert.equal(s.codeDigits, 4, 'la codifica non è a video: resta com\'era');
    assert.equal(s.codePrefixParte, 'PZ');
    assert.equal(s.sessionDays, 9);
  });
  it('e la pagina della codifica non azzera i margini', () => {
    const a = app();
    a.eval('db.settings.overheadPct = 12; db.settings.marginPct = 30');
    a.eval(`(() => {
      const campi = { 'set-digits': '5', 'set-pfx-acq': 'acq', 'set-pfx-mat': '', 'set-pfx-prt': 'prt', 'set-partsourcing': 'make' };
      const prima = document.getElementById.bind(document);
      document.getElementById = id => campi[id] !== undefined ? { id, value: campi[id] } : /^set-/.test(id) ? null : prima(id);
      document.querySelector = () => null;
      saveSettings();
    })()`);
    const s = JSON.parse(a.eval('JSON.stringify(db.settings)'));
    assert.equal(s.overheadPct, 12);
    assert.equal(s.marginPct, 30);
    assert.equal(s.codeDigits, 5);
    assert.equal(s.codePrefixAcquistato, 'ACQ');
    assert.equal(s.codePrefixMateriale, 'MAT');
    assert.equal(s.partSourcingDefault, 'make');
  });
});

describe('La seconda barra resta ferma in alto', () => {
  it('la barra delle voci è sticky sotto la testata', () => {
    const r = /\.subnav\{([^}]*)\}/.exec(CSS);
    assert.ok(r, 'regola .subnav');
    assert.match(r[1], /position:sticky/);
    assert.match(r[1], /top:56px/);
  });
  it('sta sotto i pannelli di destra, che ci mettono i loro comandi', () => {
    const z = sel => Number((new RegExp(sel.replace(/[#.]/g, '\\$&') + '\\{[^}]*z-index:(\\d+)').exec(CSS) || [])[1]);
    const sub = z('.subnav');
    assert.ok(sub > 0, 'la barra ha uno z-index');
    assert.ok(sub < z('#inspector'), 'il pannello laterale copre la barra, non il contrario');
    assert.ok(sub < z('#bom-panel'), 'il pannello della distinta copre la barra, non il contrario');
  });
  it('chi resta fermo sotto di lei ne conta l\'altezza', () => {
    assert.match(CSS, /\.mgmt-tabs\{[^}]*position:sticky;top:calc\(70px \+ var\(--subnav-h,0px\)\)/);
    assert.match(CSS, /\.wl-side\{[^}]*top:calc\(70px \+ var\(--subnav-h,0px\)\)/);
  });
  it('l\'altezza si misura e finisce in --subnav-h', () => {
    const a = app();
    const v = a.eval(`(() => {
      const props = {};
      document.documentElement.style = { setProperty: (k, x) => { props[k] = x; } };
      document.getElementById('sub-nav').offsetHeight = 39;
      misuraSubnav();
      return props['--subnav-h'];
    })()`);
    assert.equal(v, '39px');
  });
});
