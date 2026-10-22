// L'unità di misura accanto al numero, ovunque il numero si mostri.
//
// Non è una questione di eleganza. «15» in una lista d'acquisto sono quindici
// pezzi o quindici metri? «3,20» è al pezzo o al chilo? Chi ha scritto la riga
// lo sa; chi la legge tre settimane dopo — o il fornitore che riceve il PDF —
// no, e sbaglia in silenzio. Questi test tengono ferma la regola: dove il
// numero non ha una colonna U.M. accanto, l'unità sta nel numero o nella sua
// etichetta.
//
// Il caso che ha fatto nascere il file: il confronto offerte scriveva «100 pz»
// su ogni riga, letteralmente, anche per una barra quotata al chilo.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, asm, comp } = require('./fixtures.js');

function base() {
  return makeDb({
    suppliers: [{ id: 's1', name: 'Rossi Acciai', active: true }, { id: 's2', name: 'Bianchi', active: true }],
    workCenters: [{ id: 'w1', name: 'Tornio', hourlyRate: 50, active: true }],
    items: [
      asm('mac', 'macchina', { components: [comp('bar', 4)] }),
      Object.assign(mat('bar', 10), {
        code: 'BAR', uom: 'kg', safetyStock: 5, lotSize: 10, supplierId: 's1',
        priceList: [{ id: 'p1', supplierId: 's1', price: 10, minQty: 20, leadDays: 21, date: '2026-01-05' }],
        activePriceId: 'p1',
      }),
    ],
  });
}
function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || base());
  a.asRole('admin');
  return a;
}

describe('I tre modi di attaccare un\'unità a un numero', () => {
  const a = app();
  const ev = expr => a.eval(expr);

  it('fmtUom mette la quantità con la sua unità', () => {
    assert.equal(ev('fmtUom(15, "m")'), '15 m');
    // Con la virgola, come gli importi (dalla 0.107.0).
    assert.equal(ev('fmtUom(1.5, "kg")'), '1,5 kg');
    assert.equal(ev('fmtUom(0.125, "m")'), '0,125 m');
  });
  // fmtQty resta col punto per i campi numerici; quello che si legge passa da
  // fmtQtyIt. Una vista che torna a fmtQty mostrerebbe di nuovo «1.5».
  it('nessuna vista mostra le quantità col punto', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const script = [...html.matchAll(/<script src="([^"]+\.js)"/g)].map(m => m[1]).filter(f => !f.startsWith('vendor/'));
    assert.ok(script.length > 10, 'gli script di index.html');
    script.forEach(f => {
      const righe = fs.readFileSync(path.join(root, f), 'utf8').split('\n');
      righe.forEach((r, i) => {
        if (/\bfunction fmtQty(It)?\(/.test(r)) return;
        assert.ok(!/\bfmtQty\(/.test(r), `${f}:${i + 1} usa fmtQty: per il testo serve fmtQtyIt`);
      });
    });
  });
  it('fmtPer mette il costo *per* unità, valuta compresa', () => {
    assert.equal(ev('fmtPer(3.2, "kg")'), '€ 3,20/kg');
  });
  it('labelUom mette l\'unità fra parentesi nell\'etichetta', () => {
    assert.equal(ev('labelUom("Scorta minima", "kg")'), 'Scorta minima (kg)');
  });
  // Un articolo senza U.M. deve restare un numero nudo: "15 " con lo spazio in
  // fondo, o "Scorta minima ()", sono peggio del problema che risolvono.
  it('senza unità non si aggiunge niente — né spazi né parentesi vuote', () => {
    assert.equal(ev('fmtUom(15, "")'), '15');
    assert.equal(ev('fmtPer(3.2, "")'), '€ 3,20');
    assert.equal(ev('labelUom("Scorta minima", "")'), 'Scorta minima');
    assert.equal(ev('fmtUom(15, null)'), '15');
  });
  it('itemUom non lancia su un articolo sparito', () => {
    assert.equal(ev('itemUom(getItem("non-esiste"))'), '');
    assert.equal(ev('itemUom(getItem("bar"))'), 'kg');
  });
  // fmtQty viveva in due file, con due implementazioni identiche per caso.
  // Adesso è una sola: questo test è la sveglia se qualcuno ne rimette una.
  it('fmtQty toglie gli zeri inutili e resta uno solo', () => {
    assert.equal(ev('fmtQty(100)'), '100');
    assert.equal(ev('fmtQty(1.5)'), '1.5');
    assert.equal(ev('fmtQty(1.2345)'), '1.234');
  });
});

describe('La scheda articolo dice sempre di cosa parla', () => {
  const html = () => {
    const a = app();
    return a.ctx.itemInfoHtml(a.ctx.getItem('bar'));
  };
  it('le giacenze portano l\'unità dell\'articolo', () => {
    const h = html();
    assert.match(h, /Esistente<\/span><span class="info-val">[^<]*<span[^>]*>0 kg</);
    assert.match(h, /5 kg/);   // scorta minima
    assert.match(h, /10 kg/);  // lotto di riordino
  });
  it('i costi unitari portano il denominatore', () => {
    assert.match(html(), /€ 10,00\/kg/);
  });
  it('la quantità minima del listino è nell\'unità della quotazione', () => {
    assert.match(html(), /20 kg/);
  });
});

describe('Il confronto offerte non inventa i pezzi', () => {
  // La riga è quotata al chilo: scrivere "100 pz" è un'informazione falsa, non
  // un'approssimazione.
  function conRfq() {
    const db = base();
    db.rfqs = [
      { id: 'r1', number: 'RDO-1', supplierId: 's1', status: 'ricevuta', date: '2026-01-01',
        lines: [{ id: 'l1', itemId: 'bar', code: 'BAR', description: 'Barra', uom: 'kg', qty: 100, price: 2, deliveryDate: '' }] },
      { id: 'r2', number: 'RDO-2', supplierId: 's2', status: 'ricevuta', date: '2026-01-01',
        lines: [{ id: 'l2', itemId: 'bar', code: 'BAR', description: 'Barra', uom: 'kg', qty: 100, price: 3, deliveryDate: '' }] },
    ];
    return db;
  }
  it('la quantità e il prezzo di riga sono nell\'unità della riga', () => {
    const a = app(conRfq());
    a.eval('rfqCompareSel = ["r1","r2"]');
    const h = a.ctx.renderRfqCompare();
    assert.match(h, /100 kg/);
    assert.match(h, /€ 2,00\/kg/);
    assert.doesNotMatch(h, /\bpz\b/);
  });
});

describe('Gli importi si leggono all\'italiana', () => {
  const { loadApp } = require('./harness.js');
  const a = loadApp({ silent: true });
  a.eval('db = { settings: { currency: "€" } }');
  const ev = x => a.eval(x);
  it('migliaia col punto, decimali con la virgola', () => {
    assert.equal(ev('fmtN(1125.5)'), '€ 1.125,50');
    assert.equal(ev('fmtN(1234567.891)'), '€ 1.234.567,89');
    assert.equal(ev('fmtN(0)'), '€ 0,00');
  });
  it('i negativi tengono il segno, e il meno zero non esiste', () => {
    assert.equal(ev('fmtN(-1500)'), '€ -1.500,00');
    assert.equal(ev('fmtN(-0.001)'), '€ 0,00');
  });
  it('non dipende dalla lingua del browser: nessun toLocaleString', () => {
    assert.doesNotMatch(String(a.eval('numIt.toString()')), /toLocaleString/);
  });
});
