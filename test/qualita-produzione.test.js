// Qualità in produzione (0.144.0): il collaudo a fine ciclo degli ODP e le
// non conformità degli scarti.
//
// Le domande:
//  - la dichiarazione dell'ultima fase apre un collaudo e i pezzi aspettano
//    l'esito fermi, come la merce di un fornitore;
//  - un respinto non torna a nessuno: si rilavora (fermo finché non torna al
//    collaudo) o si rottama, e la NC è della fase che ha generato il difetto;
//  - uno scarto dichiarato chiede la causale e apre la sua NC, una per fase e
//    causale finché è aperta;
//  - annullare la dichiarazione toglie il collaudo aperto e lo scarto dalla NC;
//  - spento il modulo, niente di tutto questo.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, parte, wc } = require('./fixtures.js');

const fase = (wcId, supplierId) => ({ kind: 'op', workCenterId: wcId, supplierId: supplierId || null,
  costMode: 'fisso', cost: 3, hours: 0.5, days: supplierId ? 3 : 0, note: '' });

function app(opz) {
  const o = opz || {};
  const a = loadApp({ silent: true });
  a.asRole(o.ruolo || 'admin');
  const p = parte('p1', { cycle: [fase('tor'), o.esterna ? fase('zin', 'beta') : fase('fre')] });
  if (o.qc !== false) p.qc = 'si';
  a.setDb(makeDb({
    suppliers: [{ id: 'beta', name: 'Beta', active: true }],
    workCenters: [wc('tor', 40), wc('fre', 45), wc('zin', 30)],
    items: [p],
    movements: [],
    settings: { overheadPct: 0, marginPct: 0, currency: '€', modules: { qualita: o.spento ? false : true } },
  }));
  a.eval(`(function () {
    const part = getItem('p1');
    db.prodOrders.push({ id: 'odp1', number: 'ODP-2026-001', itemId: 'p1', code: 'P1', name: part.name, uom: 'pz', qty: 10,
      date: oggiISO(), dueDate: addDays(oggiISO(), 30), status: 'bozza', title: '', notes: '', notesInternal: '',
      planId: null, jobId: null, phases: opFreezePhases(part), materials: [], active: true });
    invalidateCaches(); opLancia('odp1');
  })()`);
  return a;
}
const J = (a, expr) => JSON.parse(a.eval(`JSON.stringify(${expr})`));
const num = (a, expr) => Number(a.eval(expr));
const faseId = (a, i) => a.eval(`getOdp('odp1').phases[${i}].id`);
function avvia(a, i) { assert.equal(a.eval(`opAvvia('odp1', ${JSON.stringify(faseId(a, i))})`), true); }
function dichiara(a, i, dati) { return a.eval(`opDichiara('odp1', ${JSON.stringify(faseId(a, i))}, ${JSON.stringify(dati)})`); }
// Le due fasi fatte, con `buoni` pezzi versati alla fine.
function finisci(a, buoni) {
  avvia(a, 0);
  assert.equal(dichiara(a, 0, { qty: 10 }), true);
  avvia(a, 1);
  assert.equal(dichiara(a, 1, { qty: buoni }), true);
}

describe('Il collaudo a fine ciclo', () => {
  it('la dichiarazione dell\'ultima fase apre un collaudo, e i pezzi aspettano fermi', () => {
    const a = app();
    finisci(a, 10);
    const c = J(a, 'qcTutti()');
    assert.equal(c.length, 1);
    assert.equal(c[0].source, 'odp');
    assert.equal(c[0].orderId, 'odp1');
    assert.equal(c[0].qty, 10);
    assert.equal(c[0].respPhase, faseId(a, 1), 'fino a prova contraria, l\'ultima fase');
    assert.equal(num(a, 'onHandOf("p1")'), 10);
    assert.equal(num(a, 'inQCOf("p1")'), 10);
    assert.equal(a.eval('qcOrdineNumero(qcTutti()[0])'), 'ODP-2026-001');
  });

  it('le fasi prima dell\'ultima non aprono niente', () => {
    const a = app();
    avvia(a, 0);
    dichiara(a, 0, { qty: 10 });
    assert.equal(num(a, 'qcTutti().length'), 0);
  });

  it('accettato, i pezzi diventano liberi', () => {
    const a = app();
    finisci(a, 10);
    assert.equal(a.eval(`qcRegistraEsito(qcTutti()[0].id, { esito: 'accettato' })`), true);
    assert.equal(num(a, 'inQCOf("p1")'), 0);
    assert.equal(num(a, 'ncTutte().length'), 0);
  });

  it('un articolo senza controllo, o il modulo spento, non aprono niente', () => {
    const a = app({ qc: false });
    finisci(a, 10);
    assert.equal(num(a, 'qcTutti().length'), 0);
    const b = app({ spento: true });
    finisci(b, 10);
    assert.equal(num(b, 'qcTutti().length'), 0);
  });

  it('la scheda e la frase dicono da dove vengono e cosa succederà', () => {
    const a = app();
    finisci(a, 10);
    const html = a.eval('qcSchedaHtml(qcTutti()[0])');
    assert.match(html, /Ordine di produzione/);
    assert.match(html, /Fase che ha generato il difetto/);
    assert.doesNotMatch(html, /DDT del fornitore/);
    assert.match(html, /Da rilavorare/);
    assert.doesNotMatch(html, /a credito/);
    const x = a.eval('JSON.stringify(qcTutti()[0])');
    assert.match(a.eval(`qcConseguenzaTesto(${x}, 'respinto', 3, 'rilavorazione')`), /fermi/);
    assert.match(a.eval(`qcConseguenzaTesto(${x}, 'respinto', 3, 'scarto')`), /scarto/);
  });
});

describe('Il respinto di un ODP', () => {
  it('da rilavorare restano fermi, e la NC è di produzione sulla fase scelta', () => {
    const a = app();
    finisci(a, 10);
    const f0 = faseId(a, 0);
    assert.equal(a.eval(`qcRegistraEsito(qcTutti()[0].id, { esito: 'respinto', qtyKo: 4, destino: 'rilavorazione', respPhase: ${JSON.stringify(f0)} })`), true);
    const c = J(a, 'qcTutti()[0]');
    assert.equal(c.qtyHeld, 4);
    assert.equal(c.respPhase, f0);
    assert.equal(num(a, 'onHandOf("p1")'), 10, 'la merce non si è mossa');
    assert.equal(num(a, 'inQCOf("p1")'), 4, 'ma i 4 da rilavorare sono fermi');
    const nc = J(a, 'ncTutte()[0]');
    assert.equal(nc.source, 'produzione');
    assert.equal(nc.decision, 'rilavorazione');
    assert.equal(nc.productionOrderId, 'odp1');
    assert.equal(nc.respPhase, f0);
    assert.equal(nc.supplierId, null);
    assert.equal(a.eval('ncOrigineNumero(ncTutte()[0])'), c.number);
  });

  it('rilavorati tornano al collaudo con un collaudo nuovo', () => {
    const a = app();
    finisci(a, 10);
    a.eval(`qcRegistraEsito(qcTutti()[0].id, { esito: 'respinto', qtyKo: 4, destino: 'rilavorazione' })`);
    assert.ok(a.eval('qcRilavoratiAlCollaudo(qcTutti()[0].id)'));
    assert.equal(num(a, 'qcTutti()[0].qtyHeld'), 0);
    assert.equal(num(a, 'qcAperti().length'), 1);
    assert.equal(num(a, 'qcAperti()[0].qty'), 4);
    assert.equal(num(a, 'inQCOf("p1")'), 4, 'fermi lo stesso, ora dal collaudo nuovo');
  });

  it('rottamato esce come scarto', () => {
    const a = app();
    finisci(a, 10);
    a.eval(`qcRegistraEsito(qcTutti()[0].id, { esito: 'respinto', qtyKo: 4, destino: 'scarto' })`);
    assert.equal(num(a, 'onHandOf("p1")'), 6);
    assert.equal(num(a, 'inQCOf("p1")'), 0);
    assert.equal(a.eval('ncTutte()[0].decision'), 'rottamazione');
  });

  it('la destinazione dei fornitori non vale per un ODP', () => {
    const a = app();
    finisci(a, 10);
    assert.equal(a.eval(`qcRegistraEsito(qcTutti()[0].id, { esito: 'respinto', qtyKo: 4, destino: 'sostituzione' })`), false);
    assert.equal(a.eval('qcTutti()[0].status'), 'aperto');
  });

  it('una fase del terzista: la NC va verso di lui e conta nella sua valutazione', () => {
    const a = app({ esterna: true });
    finisci(a, 10);
    assert.equal(a.eval(`qcRegistraEsito(qcTutti()[0].id, { esito: 'respinto', qtyKo: 2, destino: 'scarto' })`), true);
    const nc = J(a, 'ncTutte()[0]');
    assert.equal(nc.source, 'fornitore');
    assert.equal(nc.supplierId, 'beta');
    assert.equal(J(a, 'qcValutaFornitore("beta")').respinti, 1);
  });

  it('dalla NC la fase si corregge, e con lei origine e fornitore', () => {
    const a = app({ esterna: true });
    finisci(a, 10);
    a.eval(`qcRegistraEsito(qcTutti()[0].id, { esito: 'respinto', qtyKo: 2, destino: 'rilavorazione' })`);
    const id = a.eval('ncTutte()[0].id');
    assert.equal(a.eval(`ncSetFaseResponsabile(${JSON.stringify(id)}, ${JSON.stringify(faseId(a, 0))})`), true);
    let nc = J(a, 'ncTutte()[0]');
    assert.equal(nc.source, 'produzione');
    assert.equal(nc.supplierId, null);
    a.eval(`ncSetFaseResponsabile(${JSON.stringify(id)}, 'materiale')`);
    nc = J(a, 'ncTutte()[0]');
    assert.equal(nc.source, 'interna');
    assert.match(a.eval(`ncProduzioneHtml(ncTutte()[0], true)`), /Rilavorati: di nuovo al collaudo/);
  });

  it('«Rottamato, chiudi» rottama i pezzi fermi e chiude la NC', () => {
    const a = app();
    finisci(a, 10);
    a.eval(`qcRegistraEsito(qcTutti()[0].id, { esito: 'respinto', qtyKo: 4, destino: 'rilavorazione' })`);
    const id = a.eval('ncTutte()[0].id');
    a.eval(`ncSet(${JSON.stringify(id)}, 'decision', 'rottamazione')`);
    assert.match(a.eval('ncSchedaHtml(ncTutte()[0], true)'), /Rottamato, chiudi/);
    assert.equal(a.eval(`ncRottamaChiudi(${JSON.stringify(id)})`), true);
    assert.equal(a.eval('ncTutte()[0].status'), 'chiusa');
    assert.equal(num(a, 'onHandOf("p1")'), 6);
    assert.equal(num(a, 'inQCOf("p1")'), 0);
  });
});

describe('Gli scarti con la causale', () => {
  it('senza causale uno scarto non si registra', () => {
    const a = app();
    avvia(a, 0);
    assert.equal(dichiara(a, 0, { qty: 8, scrap: 2 }), false);
    assert.equal(num(a, 'db.prodDecls.filter(d => d.kind === "avanzamento").length'), 0);
  });

  it('con la causale apre una NC minore, da rottamare, sulla fase', () => {
    const a = app();
    avvia(a, 0);
    assert.equal(dichiara(a, 0, { qty: 8, scrap: 2, motivo: 'Usura o rottura utensile' }), true);
    const nc = J(a, 'ncTutte()');
    assert.equal(nc.length, 1);
    assert.equal(nc[0].qty, 2);
    assert.equal(nc[0].cause, 'Usura o rottura utensile');
    assert.equal(nc[0].gravita, 'minore');
    assert.equal(nc[0].decision, 'rottamazione');
    assert.equal(nc[0].source, 'produzione');
    assert.equal(nc[0].respPhase, faseId(a, 0));
    assert.equal(a.eval('db.prodDecls.find(d => d.kind === "avanzamento").motivo'), 'Usura o rottura utensile');
    assert.equal(a.eval('ncOrigineNumero(ncTutte()[0])'), 'ODP-2026-001');
  });

  it('stessa fase e stessa causale si sommano; un\'altra causale apre un\'altra NC', () => {
    const a = app();
    avvia(a, 0);
    dichiara(a, 0, { qty: 3, scrap: 1, motivo: 'Errore di attrezzaggio' });
    dichiara(a, 0, { qty: 3, scrap: 1, motivo: 'Errore di attrezzaggio' });
    assert.equal(num(a, 'ncTutte().length'), 1);
    assert.equal(num(a, 'ncTutte()[0].qty'), 2);
    dichiara(a, 0, { qty: 1, scrap: 1, motivo: 'Errore di programma' });
    assert.equal(num(a, 'ncTutte().length'), 2);
  });

  it('annullare la dichiarazione toglie lo scarto, e la NC se resta vuota', () => {
    const a = app();
    avvia(a, 0);
    dichiara(a, 0, { qty: 3, scrap: 1, motivo: 'Errore di attrezzaggio' });
    dichiara(a, 0, { qty: 3, scrap: 2, motivo: 'Errore di attrezzaggio' });
    const ids = J(a, 'db.prodDecls.filter(d => d.kind === "avanzamento").map(d => d.id)');
    assert.equal(a.eval(`opAnnullaDichiarazione(${JSON.stringify(ids[1])})`), true);
    assert.equal(num(a, 'ncTutte()[0].qty'), 1);
    assert.equal(a.eval(`opAnnullaDichiarazione(${JSON.stringify(ids[0])})`), true);
    assert.equal(num(a, 'ncTutte().length'), 0);
  });

  it('lo scarto di una fase del terzista apre la NC verso di lui', () => {
    const a = app({ esterna: true });
    avvia(a, 0);
    dichiara(a, 0, { qty: 10 });
    avvia(a, 1);
    assert.equal(dichiara(a, 1, { qty: 9, scrap: 1, motivo: 'Errore di lavorazione' }), true);
    const nc = J(a, 'ncTutte()');
    assert.equal(nc.length, 1, 'il collaudo dei 9 è aperto: nessuna NC sua ancora');
    assert.equal(nc[0].source, 'fornitore');
    assert.equal(nc[0].supplierId, 'beta');
  });

  it('la finestra di dichiarazione chiede la causale; col modulo spento no', () => {
    const a = app();
    assert.match(a.eval('qcScartoCampoHtml("op-d-motivo")'), /Usura o rottura utensile/);
    const b = app({ spento: true });
    assert.equal(b.eval('qcScartoCampoHtml("op-d-motivo")'), '');
    avvia(b, 0);
    assert.equal(dichiara(b, 0, { qty: 8, scrap: 2 }), true, 'spento, lo scarto resta un numero');
    assert.equal(num(b, 'ncTutte().length'), 0);
  });
});

describe('Annullare il versamento', () => {
  it('un collaudo aperto se ne va con la dichiarazione', () => {
    const a = app();
    finisci(a, 10);
    const d = a.eval('qcTutti()[0].declId');
    assert.equal(a.eval(`opAnnullaDichiarazione(${JSON.stringify(d)})`), true);
    assert.equal(num(a, 'qcTutti().length'), 0);
    assert.equal(num(a, 'inQCOf("p1")'), 0);
  });

  it('un collaudo chiuso no: la merce si è già mossa', () => {
    const a = app();
    finisci(a, 10);
    const d = a.eval('qcTutti()[0].declId');
    a.eval(`qcRegistraEsito(qcTutti()[0].id, { esito: 'accettato' })`);
    assert.equal(a.eval(`opAnnullaDichiarazione(${JSON.stringify(d)})`), false);
    assert.equal(num(a, 'qcTutti().length'), 1);
  });
});
