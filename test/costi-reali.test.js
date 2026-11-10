// Modulo Costi reali (dalla 0.122.0): il costo medio d'acquisto si calcola
// dai ricevimenti degli ordini e, se scelto, valorizza il magazzino.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

function app(o) {
  const x = o || {};
  const a = loadApp({ silent: true });
  const tubo = Object.assign(acq('t1', 10), { uom: 'm', altUom: 'kg', altFactor: 8 });   // 8 kg al metro
  const db = makeDb({
    items: [acq('v1', 5), tubo],
    orders: [
      { id: 'o1', number: 'ODA1', status: 'evaso', lines: [{ id: 'l1', itemId: 'v1', qty: 10, received: 10, price: 4 }] },
      { id: 'o2', number: 'ODA2', status: 'parziale', lines: [{ id: 'l2', itemId: 'v1', qty: 30, received: 30, price: 6 },
        { id: 'l3', itemId: 't1', qty: 160, received: 120, price: 2, uom: 'kg' }] },
      { id: 'o3', number: 'ODA3', status: 'annullato', lines: [{ id: 'l4', itemId: 'v1', qty: 100, received: 100, price: 99 }] },
    ],
    settings: { modules: x.modules || { costiReali: true }, valoreMagazzino: x.valore || 'medio' },
  });
  a.setDb(db); a.asRole('admin');
  return a;
}

describe('Costo medio d\'acquisto', () => {
  it('media ponderata sulle quantità ricevute, ordini annullati esclusi', () => {
    // (10×4 + 30×6) / 40 = 5,5
    assert.equal(app().eval("costoMedioOf('v1')"), 5.5);
  });
  it('il prezzo è nell\'unità del fornitore, la quantità in quella di gestione', () => {
    // 120 kg × 2 € = 240 € per 15 m → 16 €/m
    assert.equal(app().eval("costoMedioOf('t1')"), 16);
  });
  it('un articolo mai ricevuto non ha costo medio', () => {
    const a = app();
    a.eval("db.orders = []; invalidateStock()");
    assert.equal(a.eval("costoMedioOf('v1')"), null);
  });
});

describe('Valore del magazzino', () => {
  it('a costo medio con il modulo acceso e la scelta fatta', () => {
    assert.equal(app().eval("valoreGiacenza(getItem('v1'))"), app().eval("onHandOf('v1')") * 5.5);
  });
  it('a listino se la scelta è listino', () => {
    assert.equal(app({ valore: 'listino' }).eval("valoreGiacenza(getItem('v1'))"), app().eval("onHandOf('v1')") * 5);
  });
  it('a listino con il modulo spento, o con la Pianificazione spenta', () => {
    assert.equal(app({ modules: {} }).eval("valoreGiacenza(getItem('v1'))"), app().eval("onHandOf('v1')") * 5);
    assert.equal(app({ modules: { costiReali: true, pianificazione: false } }).eval("valoreGiacenza(getItem('v1'))"), app().eval("onHandOf('v1')") * 5);
  });
  it('la scheda articolo mostra il costo medio solo col modulo acceso', () => {
    assert.match(app().eval("itemInfoMagazzino(getItem('v1'))"), /Costo medio/);
    assert.ok(!/Costo medio/.test(app({ modules: {} }).eval("itemInfoMagazzino(getItem('v1'))")));
  });
});

// ── Consuntivo di commessa ──
// Commessa J1, piano P1 con 2 pezzi della parte p1 (materiale v1 ×3 + una
// fase interna da 10 € a pezzo). Un ODA da 20 v1 a 6 € per la commessa,
// un ODP che ne ha prelevati 6 e lavorato 2 pezzi, un ODL da 50 € ricevuto.
function appCommessa(modules) {
  const a = loadApp({ silent: true });
  const p1 = { id: 'p1', code: 'P1', name: 'Parte', type: 'parte', uom: 'pz', sourcing: 'make', active: true,
    cycle: [{ kind: 'mat', itemId: 'v1', qty: 3 }, { kind: 'op', workCenterId: 'w1', costMode: 'fisso', cost: 10 }] };
  const db = makeDb({
    items: [acq('v1', 5), p1],
    workCenters: [{ id: 'w1', name: 'Tornio', hourlyRate: 40, active: true }],
    jobs: [{ id: 'J1', number: 'COM1', status: 'aperta', active: true }],
    plans: [{ id: 'P1', number: 'FAB1', jobId: 'J1', lines: [{ id: 'pl1', itemId: 'p1', qty: 2 }], active: true }],
    orders: [{ id: 'o1', number: 'ODA1', status: 'evaso', planId: 'P1', lines: [{ id: 'l1', itemId: 'v1', qty: 20, received: 20, price: 6 }] }],
    workOrders: [{ id: 'w1o', number: 'ODL1', status: 'evaso', jobId: 'J1', supplierId: null, lines: [{ id: 'wl1', qty: 2, received: 2, price: 25 }] }],
    prodOrders: [{ id: 'odp1', number: 'ODP1', planId: 'P1', itemId: 'p1', qty: 2, status: 'lanciato', active: true,
      phases: [{ id: 'f1', seq: 10, opIndex: 0, workCenterId: 'w1', wcName: 'Tornio', costMode: 'fisso', cost: 10 }] }],
    prodDecls: [{ id: 'd1', odpId: 'odp1', phaseId: 'f1', kind: 'avanzamento', qty: 2, scrap: 0 }],
    movements: [{ id: 'm1', itemId: 'v1', kind: 'scarico', qty: -6, orderId: 'odp1', date: '2026-10-01' }],
    settings: { modules: modules || { costiReali: true } },
  });
  a.setDb(db); a.asRole('admin');
  return a;
}
const voce = (c, id) => c.voci.find(v => v.id === id);

describe('Consuntivo di commessa', () => {
  it('il preventivo viene dai piani della commessa, provvisorio finché non si congela', () => {
    const c = appCommessa().eval("jobConsuntivo('J1')");
    assert.equal(c.congelato, false);
    assert.equal(voce(c, 'materiali').prev, 2 * 3 * 5);
    assert.equal(voce(c, 'lavorazioni').prev, 2 * 10);
  });
  it('il materiale prelevato non si conta anche come ricevuto', () => {
    const c = appCommessa().eval("jobConsuntivo('J1')");
    // 6 prelevati al prezzo pagato sull'ODA della commessa (6 €, dalla
    // 0.150.0; prima il listino): l'ODA da 120 € non si somma
    assert.equal(voce(c, 'materiali').reale, 36);
  });
  it('senza un ODA della commessa il prelievo vale il magazzino', () => {
    const a = appCommessa();
    a.eval("db.orders = []");
    assert.equal(voce(a.eval("jobConsuntivo('J1')"), 'materiali').reale, 30);
  });
  it('lavorazioni: fasi interne lavorate più ODL ricevuti', () => {
    const c = appCommessa().eval("jobConsuntivo('J1')");
    assert.equal(voce(c, 'lavorazioni').reale, 2 * 10 + 2 * 25);
  });
  it('senza prelievi conta il ricevuto degli ODA', () => {
    const a = appCommessa();
    a.eval("db.movements = []; invalidateStock()");
    assert.equal(voce(a.eval("jobConsuntivo('J1')"), 'materiali').reale, 120);
  });
  it('andando in produzione il preventivo si congela, e non segue più il listino', () => {
    const a = appCommessa();
    a.eval("jobApplyField('J1', 'status', 'produzione')");
    assert.ok(a.eval("!!getJob('J1').costSnapshot"));
    a.eval("getItem('v1').purchasePrice = 50; invalidateCaches()");
    const c = a.eval("jobConsuntivo('J1')");
    assert.equal(c.congelato, true);
    assert.equal(voce(c, 'materiali').prev, 30);
  });
  it('col modulo spento non si congela e la scheda non mostra il consuntivo', () => {
    const a = appCommessa({});
    a.eval("jobApplyField('J1', 'status', 'produzione')");
    assert.equal(a.eval("getJob('J1').costSnapshot"), undefined);
    assert.ok(!/Consuntivo/.test(a.eval("renderJobEdit('J1')")));
    assert.match(appCommessa().eval("renderJobEdit('J1')"), /Consuntivo/);
  });
});

describe('Consuntivo con le ore timbrate', () => {
  const timbra = a => a.eval(`db.timeLogs = [{ id: 't1', odpId: 'odp1', phaseId: 'f1', workCenterId: 'w1', userId: 'u', startedAt: '2026-10-01T08:00:00.000Z', endedAt: '2026-10-01T09:30:00.000Z', active: true }]`);
  it('con il modulo Officina le ore timbrate di una fase oraria prendono il posto di quelle del ciclo', () => {
    const a = appCommessa({ costiReali: true, officina: true });
    a.eval("Object.assign(getOdp('odp1').phases[0], { costMode: 'orario', hours: 0.5, rate: 0 })");
    timbra(a);
    // 1,5 h × 40 €/h (senza tariffa sulla fase vale quella del centro) + ODL 50
    assert.equal(voce(a.eval("jobConsuntivo('J1')"), 'lavorazioni').reale, 1.5 * 40 + 50);
  });
  it('una fase a costo fisso resta a pezzo anche timbrata, come nel preventivo (dalla 0.150.0)', () => {
    const a = appCommessa({ costiReali: true, officina: true });
    timbra(a);
    assert.equal(voce(a.eval("jobConsuntivo('J1')"), 'lavorazioni').reale, 2 * 10 + 50);
  });
  it('i tempi mettono le ore timbrate accanto a quelle del ciclo', () => {
    const a = appCommessa({ costiReali: true, officina: true });
    a.eval("getOdp('odp1').phases[0].hours = 0.5");
    timbra(a);
    const c = a.eval("jobConsuntivo('J1')");
    const t = c.centri.find(x => x.wcId === 'w1');
    assert.equal(t.standard, 1);      // 2 pezzi × 0,5 h, fase non avviata: niente attrezzaggio
    assert.equal(t.timbrate, 1.5);
    assert.match(a.eval("consuntivoHtml('J1')"), /Tempi per centro/);
    assert.match(a.eval("consTempiOdpHtml(getOdp('odp1'))"), /Tempi/);
    assert.equal(appCommessa().eval("consTempiOdpHtml(getOdp('odp1'))"), '');
  });
});

// Una parte fatta da un ODP della commessa e poi montata: il suo costo è già
// nel materiale prelevato dall'ODP e nelle sue fasi, e il prelievo per il
// montaggio non lo deve contare un'altra volta (dalla 0.150.0).
describe('Consuntivo con le parti fatte in casa e montate', () => {
  function appMontaggio() {
    const a = appCommessa();
    a.eval(`db.items.push({ id: 'A', code: 'A', name: 'Assieme', type: 'assieme', uom: 'pz', active: true, components: [{ itemId: 'p1', qty: 1 }] });
      db.plans[0].lines = [{ id: 'pl1', itemId: 'A', qty: 2 }];
      db.orders = []; db.workOrders = [];
      db.productions = [{ id: 'pr1', planId: 'P1', itemId: 'A', qty: 2 }];
      db.movements.push({ id: 'm2', itemId: 'p1', kind: 'versamento', qty: 2, orderId: 'odp1', date: '2026-10-02' },
        { id: 'm3', itemId: 'p1', kind: 'scarico', qty: -2, orderId: 'pr1', date: '2026-10-03' });
      invalidateCaches(); invalidateStock()`);
    return a;
  }
  it('la parte versata dall\'ODP e poi prelevata non si conta due volte', () => {
    const c = appMontaggio().eval("jobConsuntivo('J1')");
    assert.equal(voce(c, 'materiali').reale, 2 * 3 * 5);
    assert.equal(voce(c, 'lavorazioni').reale, 2 * 10);
    assert.equal(voce(c, 'totale').reale, voce(c, 'totale').prev);
  });
  it('quello prelevato oltre il versato viene dalla scorta e si conta', () => {
    const a = appMontaggio();
    a.eval("db.movements.find(m => m.id === 'm3').qty = -3; invalidateStock()");
    // un pezzo in più dalla scorta, al costo della parte: 3 × 5 + 10 = 25
    assert.equal(voce(a.eval("jobConsuntivo('J1')"), 'materiali').reale, 2 * 3 * 5 + 25);
  });
});

// Dalla 0.150.0 il preventivo porta articoli, ore e piani, e il confronto
// dice cosa non torna invece di nasconderlo.
describe('Consuntivo: il confronto per articolo, i piani e i documenti fuori', () => {
  it('per articolo lo scostamento si divide in effetto quantità ed effetto prezzo', () => {
    const c = appCommessa().eval("jobConsuntivo('J1')");
    const v1 = c.articoli.find(x => x.id === 'v1');
    // previsti 2 × 3 = 6 a 5 €, usati 6 a 6 €
    assert.equal(v1.qP, 6); assert.equal(v1.qR, 6);
    assert.equal(v1.effQ, 0); assert.equal(v1.effP, 6);
    assert.equal(v1.effQ + v1.effP, v1.diff);
  });
  it('la fotografia porta articoli, ore e piani', () => {
    const a = appCommessa();
    a.eval("jobApplyField('J1', 'status', 'produzione')");
    const s = a.eval("getJob('J1').costSnapshot");
    assert.deepEqual(Array.from(s.piani), ['P1']);
    assert.equal(s.articoli.find(x => x.id === 'v1').qty, 6);
    assert.ok('w1' in s.ore);
  });
  it('un piano aggiunto dopo il congelamento si segnala', () => {
    const a = appCommessa();
    a.eval("jobApplyField('J1', 'status', 'produzione')");
    a.eval("db.plans.push({ id: 'P2', number: 'FAB2', jobId: 'J1', lines: [], active: true })");
    const c = a.eval("jobConsuntivo('J1')");
    assert.deepEqual(Array.from(c.pianiDopo.map(p => p.number)), ['FAB2']);
    assert.match(a.eval("consuntivoHtml('J1')"), /FAB2 è stato aggiunto dopo il congelamento/);
  });
  it('un documento che cita la commessa senza venire da un suo piano è fuori preventivo', () => {
    // l'ODL1 ha la commessa ma non il piano
    const c = appCommessa().eval("jobConsuntivo('J1')");
    assert.equal(c.fuori, 50);
    assert.ok(c.dettaglio.find(d => /ODL1/.test(d.testo)).fuori);
  });
  it('una riga di conto lavoro rimasta in un ODA è una lavorazione', () => {
    const a = appCommessa();
    a.eval("db.orders.push({ id: 'o2', number: 'ODA2', status: 'evaso', planId: 'P1', lines: [{ id: 'l2', itemId: null, phaseKey: 'p1#0#w1', description: 'Tornitura', qty: 2, received: 2, price: 15 }] })");
    const c = a.eval("jobConsuntivo('J1')");
    assert.equal(voce(c, 'lavorazioni').reale, 2 * 10 + 50 + 30);
    assert.equal(voce(c, 'materiali').reale, 36);
  });
  it('una fotografia di prima non ha il dettaglio, e la scheda lo dice', () => {
    const a = appCommessa();
    a.eval("getJob('J1').costSnapshot = { date: '2026-03-01', materiali: 30, lavorazioni: 20, generali: 0, totale: 50, righe: 1 }");
    const c = a.eval("jobConsuntivo('J1')");
    assert.equal(c.completo, false);
    assert.equal(c.articoli.length, 0);
    assert.match(a.eval("consuntivoHtml('J1')"), /congelato prima che portasse articoli e ore/);
  });
  it('le spese generali dicono la quota con cui si assorbono', () => {
    const a = appCommessa();
    // le spese generali si caricano sugli assiemi: qui vengono da una fotografia
    a.eval("getJob('J1').costSnapshot = { date: '2026-03-01', materiali: 30, lavorazioni: 20, generali: 5, totale: 55, righe: 1 }");
    assert.match(a.eval("consuntivoHtml('J1')"), /assorbite al 10/);
  });
  it('la tabella dei pezzi conta lanciati, buoni e scarti', () => {
    const a = appCommessa();
    a.eval("db.prodDecls[0].scrap = 1; db.prodDecls[0].qty = 1; invalidateProd()");
    const p = a.eval("jobConsuntivo('J1')").pezzi[0];
    assert.equal(p.lanciati, 2); assert.equal(p.scarti, 1);
  });
});

describe('Consuntivo di un piano senza commessa', () => {
  function appPiano() {
    const a = appCommessa();
    a.eval("db.plans[0].jobId = null; db.workOrders = []; db.prodOrders[0].status = 'bozza'");
    return a;
  }
  it('ha la sua scheda nel piano; con la commessa no', () => {
    const a = appPiano();
    assert.match(a.eval("consuntivoPianoHtml('P1')"), /Consuntivo/);
    assert.equal(voce(a.eval("pianoConsuntivo('P1')"), 'materiali').prev, 30);
    assert.equal(voce(a.eval("pianoConsuntivo('P1')"), 'materiali').reale, 36);
  });
  it('si congela al lancio del primo ordine di produzione', () => {
    const a = appPiano();
    assert.equal(a.eval("getPlan('P1').costSnapshot"), undefined);
    a.eval("opLancia('odp1')");
    assert.ok(a.eval("!!getPlan('P1').costSnapshot"));
    assert.equal(a.eval("pianoConsuntivo('P1').congelato"), true);
  });
  it('un piano con commessa al lancio non si congela: decide la commessa', () => {
    const a = appCommessa();
    a.eval("db.prodOrders[0].status = 'bozza'; opLancia('odp1')");
    assert.equal(a.eval("getPlan('P1').costSnapshot"), undefined);
  });
  it('«Aggiorna preventivo» rifà la fotografia del piano', () => {
    const a = appPiano();
    a.eval("consAggiornaPreventivo('piano', 'P1')");
    assert.equal(a.eval("getPlan('P1').costSnapshot.materiali"), 30);
  });
});
