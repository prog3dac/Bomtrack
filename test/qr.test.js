// I codici QR (qr.js, dalla 0.99.0).
//
// Il rischio vero non è il disegno — quello lo fa una libreria — ma la strada
// fra l'etichetta stampata e la scheda che si apre: un codice con un carattere
// strano che non torna indietro uguale, un indirizzo che il telefono apre ma
// l'app non capisce, un ordine cercato per id quando sull'etichetta c'è il
// numero. Per questo i test più importanti fanno il giro intero: dal codice
// all'immagine e, con jsQR, dall'immagine di nuovo al testo.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq } = require('./fixtures.js');

const VENDOR = f => fs.readFileSync(path.join(__dirname, '..', 'vendor', f), 'utf8');

function app(over, opz) {
  const a = loadApp({ silent: true });
  // La pagina carica la libreria nel <head>; l'harness carica solo l'app.
  if (!opz || opz.libreria !== false) a.eval(VENDOR('qrcode.js'));
  a.setDb(makeDb(Object.assign({
    items: [mat('m1', 2), acq('a1', 5), Object.assign(mat('m2', 1), { code: 'TUBO Ø40/2' })],
    orders: [{ id: 'o1', number: 'ODA-2026-007', status: 'inviato', supplierId: '', date: '2026-10-01', active: true,
      lines: [{ id: 'l1', itemId: 'a1', code: 'A1', description: 'Commerciale a1', uom: 'pz', qty: 4, received: 1 }] }],
    workOrders: [{ id: 'w1', number: 'ODL-2026-003', status: 'bozza', active: true, lines: [] }],
    prodOrders: [{ id: 'p1', number: 'ODP-2026-012', itemId: 'm1', code: 'M1', name: 'Materia m1', uom: 'pz', qty: 5, status: 'bozza', phases: [], materials: [], active: true }],
  }, over || {})));
  a.asRole('admin');
  return a;
}

// Il lettore vero: jsQR, sulla matrice resa come immagine RGBA.
const lettore = (() => {
  const ctx = vm.createContext({});
  vm.runInContext(VENDOR('jsQR.js'), ctx);
  return ctx.jsQR;
})();
function leggi(a, testo) {
  const m = JSON.parse(a.eval(`JSON.stringify(qrMatrice(${JSON.stringify(testo)}))`));
  const scala = 4, bordo = 4, lato = (m.length + bordo * 2) * scala;
  const px = new Uint8ClampedArray(lato * lato * 4).fill(255);
  m.forEach((riga, r) => riga.forEach((nero, c) => {
    if (!nero) return;
    for (let y = 0; y < scala; y++) for (let x = 0; x < scala; x++) {
      const i = (((r + bordo) * scala + y) * lato + (c + bordo) * scala + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 0;
    }
  }));
  const r = lettore(px, lato, lato);
  return r && r.data;
}

describe('QR — l\'indirizzo', () => {
  it('va e torna uguale, anche con spazi, barre e lettere accentate', () => {
    const a = app();
    a.eval('db.settings.qr = { baseUrl: "https://esempio.it/bt/index.html" }');
    const link = a.eval('qrLink("art", "TUBO Ø40/2")');
    assert.match(link, /^https:\/\/esempio\.it\/bt\/index\.html#\/q\/art\//);
    assert.deepEqual(JSON.parse(a.eval(`JSON.stringify(qrParse(${JSON.stringify(link)}))`)), { tipo: 'art', codice: 'TUBO Ø40/2' });
  });
  it('senza indirizzo (app aperta dal disco) porta solo la parte dopo il #, che Scansiona capisce', () => {
    const a = app();
    assert.equal(a.eval('qrLink("odp", "ODP-2026-012")'), '#/q/odp/ODP-2026-012');
  });
  it('un indirizzo scritto con un # dentro non raddoppia il frammento', () => {
    const a = app();
    a.eval('db.settings.qr = { baseUrl: "https://esempio.it/#stock" }');
    assert.equal(a.eval('qrLink("art", "M1")'), 'https://esempio.it/#/q/art/M1');
  });
  it('un codice nudo, come lo digita una pistola, si accetta senza tipo', () => {
    const a = app();
    assert.deepEqual(JSON.parse(a.eval('JSON.stringify(qrParse("  M1 "))')), { tipo: '', codice: 'M1' });
  });
  it('un indirizzo che non è dell\'app, o un tipo sconosciuto, non si scambia per un codice', () => {
    const a = app();
    assert.equal(a.eval('qrParse("https://www.google.com/")'), null);
    assert.equal(a.eval('qrParse("#/q/xyz/M1")'), null);
    assert.equal(a.eval('qrParse("")'), null);
  });
});

describe('QR — dal codice al record', () => {
  it('l\'articolo si trova per codice, senza badare a maiuscole e spazi', () => {
    const a = app();
    assert.equal(a.eval('qrResolve("art", " m1 ").rec.id'), 'm1');
  });
  it('se il codice non c\'è più si prova come id', () => {
    const a = app();
    assert.equal(a.eval('qrResolve("art", "a1").rec.id'), 'a1');
  });
  it('gli ordini si trovano per numero, ciascuno nel suo archivio', () => {
    const a = app();
    assert.equal(a.eval('qrResolve("oda", "ODA-2026-007").rec.id'), 'o1');
    assert.equal(a.eval('qrResolve("odl", "odl-2026-003").rec.id'), 'w1');
    assert.equal(a.eval('qrResolve("odp", "ODP-2026-012").rec.id'), 'p1');
    assert.equal(a.eval('qrResolve("oda", "ODP-2026-012")'), null, 'il tipo scritto nel QR delimita la ricerca');
  });
  it('senza tipo cerca dappertutto', () => {
    const a = app();
    assert.equal(a.eval('qrResolve("", "ODA-2026-007").tipo'), 'oda');
    assert.equal(a.eval('qrResolve("", "M1").tipo'), 'art');
    assert.equal(a.eval('qrResolve("", "NON-ESISTE")'), null);
  });
});

describe('QR — il disegno', () => {
  it('il QR disegnato si rilegge e restituisce lo stesso indirizzo', () => {
    const a = app();
    a.eval('db.settings.qr = { baseUrl: "https://esempio.it/bt/index.html" }');
    const link = a.eval('qrLink("art", "TUBO Ø40/2")');
    assert.equal(leggi(a, link), link);
  });
  it('anche con un codice accentato nudo (UTF-8, non Latin-1)', () => {
    const a = app();
    assert.equal(leggi(a, 'perno Ø12 — sè'), 'perno Ø12 — sè');
  });
  it('nel PDF diventa rettangoli vettoriali dentro il lato chiesto', () => {
    const a = app();
    const r = JSON.parse(a.eval(`(() => { const rect = [];
      const doc = { setFillColor() {}, rect(x, y, w, h) { rect.push([x, y, w, h]); } };
      const ok = qrPdfDraw(doc, "#/q/art/M1", 10, 20, 30);
      return JSON.stringify({ ok, n: rect.length, fuori: rect.filter(([x, y, w, h]) => x < 10 || y < 20 || x + w > 40.02 || y + h > 50.02).length });
    })()`));
    assert.equal(r.ok, true);
    assert.ok(r.n > 10);
    assert.equal(r.fuori, 0);
  });
  it('senza la libreria non disegna e non rompe il PDF che lo ospita', () => {
    const a = app(null, { libreria: false });
    assert.equal(a.eval('qrPdfDraw({ rect() { throw new Error("no") } }, "x", 0, 0, 10)'), false);
    assert.equal(a.eval('qrSvg("x")'), '');
  });
  it('l\'SVG per lo schermo è un\'immagine sola, con il fondo bianco', () => {
    const a = app();
    const svg = a.eval('qrSvg("#/q/art/M1", 120)');
    assert.match(svg, /^<svg[^>]*viewBox="0 0 \d+ \d+"/);
    assert.match(svg, /fill="#fff"/);
  });
  it('lo stesso testo non si ricalcola: il Reparto ne disegna uno per fase a ogni tocco', () => {
    const a = app();
    const prima = a.eval('qrSvg("#/q/fase/X1", 96)');
    a.eval('window.__giri = 0; const _orig = qrMatrice; qrMatrice = t => { window.__giri++; return _orig(t); }');
    assert.equal(a.eval('qrSvg("#/q/fase/X1", 96)'), prima);
    assert.equal(a.eval('window.__giri'), 0);
    a.eval('qrSvg("#/q/fase/X1", 120)');
    assert.equal(a.eval('window.__giri'), 1, 'un\'altra misura è un altro disegno');
  });
});

describe('QR — le etichette', () => {
  function fintoPdf(a) {
    a.eval(`window.__pdf = { pagine: 1, testi: [], rect: 0, salvato: '', formato: null };
      window.jspdf = { jsPDF: function (o) { const st = window.__pdf; st.formato = o.format;
        this.setFillColor = this.setTextColor = this.setFont = this.setFontSize = function () {};
        this.rect = function () { st.rect++; };
        this.text = function (t) { st.testi.push(String(t)); };
        this.splitTextToSize = function (t) { return [String(t)]; };
        this.addPage = function () { st.pagine++; };
        this.save = function (n) { st.salvato = n; };
      } };`);
    return () => JSON.parse(a.eval('JSON.stringify(window.__pdf)'));
  }
  it('le copie e le etichette già usate spostano le pagine', () => {
    const a = app();
    const st = fintoPdf(a);
    assert.equal(a.eval('qrEtichettePdf([{ tipo: "art", rec: getItem("m1"), copie: 20 }, { tipo: "art", rec: getItem("a1"), copie: 1 }], { formato: "a4-3x8", salta: 5 })'), true);
    const s = st();
    assert.equal(s.pagine, 2, '5 saltate + 21 etichette = 26, oltre le 24 di un foglio');
    assert.deepEqual(s.formato, [210, 297]);
    assert.ok(s.testi.includes('M1') && s.testi.includes('A1'));
    assert.match(s.salvato, /^bomtrack_etichette_qr_\d{4}-\d{2}-\d{2}\.pdf$/);
  });
  it('sul rotolo un\'etichetta per pagina, e "salta" non vale', () => {
    const a = app();
    const st = fintoPdf(a);
    a.eval('qrEtichettePdf([{ tipo: "art", rec: getItem("m1"), copie: 3 }], { formato: "rotolo-50x30", salta: 7 })');
    assert.equal(st().pagine, 3);
    assert.deepEqual(st().formato, [50, 30]);
  });
  it('niente da stampare non produce un PDF vuoto', () => {
    const a = app();
    const st = fintoPdf(a);
    assert.equal(a.eval('qrEtichettePdf([], {})'), false);
    assert.equal(st().salvato, '');
  });
});

describe('QR — arrivarci', () => {
  function conIndirizzo(a, hash) {
    a.eval(`location = { hash: ${JSON.stringify(hash)}, protocol: 'file:', origin: 'null', pathname: '/index.html' };
      history = { replaceState(s, t, u) { location.hash = u; } };`);
  }
  const aperta = a => a.eval(`(() => { const p = Array.from(document.getElementById('modal-root').children).find(x => x.dataset.panelKey === 'qr'); return p ? p.innerHTML : ''; })()`);
  it('un #/q/… arrivato a sessione aperta apre la scheda e l\'indirizzo torna alla vista', () => {
    const a = app();
    a.eval('activeView = "stock"');
    conIndirizzo(a, '#/q/oda/ODA-2026-007');
    a.eval('onHashChange()');
    assert.match(aperta(a), /ODA-2026-007/);
    assert.match(aperta(a), /1 \/ 4/, 'le righe dicono quanto è già arrivato');
    assert.equal(a.eval('location.hash'), '#stock');
    assert.equal(a.eval('activeView'), 'stock', 'la vista sotto non cambia');
  });
  it('un codice sconosciuto lo dice, invece di aprire una scheda vuota', () => {
    const a = app();
    conIndirizzo(a, '#/q/art/NON-ESISTE');
    a.eval('onHashChange()');
    assert.equal(aperta(a), '');
  });
  it('la scheda dell\'articolo offre la rettifica a chi può scrivere, non a chi legge', () => {
    const a = app();
    a.eval('qrApri({ tipo: "art", codice: "M1" })');
    assert.match(aperta(a), /stockAdjustModal\('m1'\)/);
    const b = app();
    b.asRole('viewer');
    b.eval('qrApri({ tipo: "art", codice: "M1" })');
    assert.doesNotMatch(aperta(b), /stockAdjustModal/);
    assert.match(aperta(b), /stockMovementsModal\('m1'\)/);
  });
  it('un ODP in bozza dice perché non si avvia, e non offre l\'avvio', () => {
    const a = app({ prodOrders: [{ id: 'p1', number: 'ODP-2026-012', itemId: 'm1', code: 'M1', name: 'x', uom: 'pz', qty: 5, status: 'bozza', active: true,
      materials: [], phases: [{ id: 'f1', seq: 10, wcName: 'Taglio', hours: 1 }] }] });
    a.eval('qrApri({ tipo: "odp", codice: "ODP-2026-012" })');
    assert.match(aperta(a), /va lanciato/);
    assert.doesNotMatch(aperta(a), /opAvviaModal/);
    assert.match(aperta(a), /openOdpFromPlan\('p1'\)/);
  });
});

describe('QR — impostazioni', () => {
  it('un indirizzo che non è http(s) si rifiuta e non salva niente', () => {
    const a = app();
    a.eval(`document.getElementById('set-qr-base').value = 'C:\\\\bomtrack\\\\index.html';
      document.getElementById('set-qr-formato').value = 'rotolo-50x30'`);
    assert.match(a.eval('readQrSettings()'), /http/);
    assert.equal(a.eval('db.settings.qr'), undefined);
  });
  it('un indirizzo valido e il formato si salvano; un formato sconosciuto torna al foglio A4', () => {
    const a = app();
    a.eval(`document.getElementById('set-qr-base').value = 'https://esempio.it/bt/';
      document.getElementById('set-qr-formato').value = 'boh'`);
    assert.equal(a.eval('readQrSettings()'), '');
    assert.deepEqual(JSON.parse(a.eval('JSON.stringify(db.settings.qr)')), { baseUrl: 'https://esempio.it/bt/', formato: 'a4-3x8' });
  });
});

// 0.134.0: il QR del link di collegamento all'archivio condiviso, nella
// scheda della nuvola. Il collega lo inquadra e l'app si apre già puntata al
// progetto: il link deve tornare intero, chiave compresa.
describe('QR — il link di collegamento', () => {
  const { makeStorage } = require('./harness.js');
  function appCollegata(href) {
    const storage = makeStorage();
    storage.setItem('bomtrack_cloud', JSON.stringify({ url: 'https://abcd.supabase.co', chiave: 'sb_publishable_Xy-12_ab', allineato: true }));
    const a = loadApp({ silent: true, storage });
    a.eval(VENDOR('qrcode.js'));
    const u = new URL(href);
    a.ctx.location = { href, origin: u.protocol === 'file:' ? 'null' : u.origin, pathname: u.pathname, protocol: u.protocol };
    return a;
  }
  it('il QR mostrato si rilegge e riporta il link intero, chiave compresa', () => {
    const a = appCollegata('https://esempio.it/bt/index.html#/home');
    const link = a.eval('cloudLinkCollegamento(cloudConfig())');
    assert.equal(link, 'https://esempio.it/bt/index.html?supabase=https%3A%2F%2Fabcd.supabase.co&chiave=sb_publishable_Xy-12_ab');
    const html = a.eval(`cloudQrLinkHtml(${JSON.stringify(link)})`);
    assert.match(html, /<svg class="qr-svg"/);
    assert.match(html, /cloudStampaQrLink\(\)/);
    assert.equal(leggi(a, link), link);
  });
  it('da file:// non mostra un QR che il telefono non saprebbe aprire', () => {
    const a = appCollegata('file:///C:/Bomtrack/index.html');
    const link = a.eval('cloudLinkCollegamento(cloudConfig())');
    const html = a.eval(`cloudQrLinkHtml(${JSON.stringify(link)})`);
    assert.doesNotMatch(html, /<svg/);
    assert.match(html, /indirizzo web/);
    a.eval('window.jspdf = { jsPDF: function () { throw new Error("non doveva partire"); } }');
    assert.equal(a.eval('cloudStampaQrLink()'), false);
  });
  it('il foglio A4 porta il QR, il progetto e il link per chi non ha la fotocamera', () => {
    const a = appCollegata('https://esempio.it/bt/index.html');
    a.eval(`window.__pdf = { testi: [], rect: 0, salvato: '', formato: null };
      window.jspdf = { jsPDF: function (o) { const st = window.__pdf; st.formato = o.format;
        this.setFillColor = this.setTextColor = this.setFont = this.setFontSize = function () {};
        this.rect = function () { st.rect++; };
        this.text = function (t) { st.testi.push(String(t)); };
        this.splitTextToSize = function (t) { return [String(t)]; };
        this.save = function (n) { st.salvato = n; };
      } };`);
    assert.equal(a.eval('cloudStampaQrLink()'), true);
    const s = JSON.parse(a.eval('JSON.stringify(window.__pdf)'));
    assert.equal(s.formato, 'a4');
    assert.ok(s.rect > 10, 'il QR è disegnato');
    assert.ok(s.testi.includes('Progetto: https://abcd.supabase.co'));
    assert.ok(s.testi.some(t => t.includes('chiave=sb_publishable_Xy-12_ab')));
    assert.match(s.salvato, /^bomtrack_qr_collegamento_\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});
