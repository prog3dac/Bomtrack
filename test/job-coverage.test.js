// La copertura materiale di una commessa.
//
// La domanda è una sola — «se avvio questa commessa, il materiale c'è?» — ma le
// risposte sbagliate possibili sono quattro, e ognuna costa in modo diverso:
//   · dire «manca» a chi ha già ordinato → l'avviso si impara a ignorare;
//   · dire «coperto» per merce che arriva dopo → si scopre in officina;
//   · dire «coperto» quando non si sa niente → è una bugia comoda;
//   · far litigare due piani della stessa commessa per la stessa merce → si
//     ordina due volte, o non si ordina affatto.
// Questi test tengono ferme quelle quattro distinzioni, e il patto che l'avviso
// avvisa senza mai decidere al posto di chi lavora.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

const SERVE = '2025-06-01';       // quando serve il materiale (data del piano)
const CONSEGNA = '2025-06-30';    // quando la commessa va consegnata al cliente

// Una commessa con un piano che chiede 10 pz di C1. Ogni prova cambia solo ciò
// che le serve: il magazzino, gli ordini, i piani.
function app(over) {
  const a = loadApp({ silent: true });
  a.setDb(makeDb(Object.assign({
    items: [acq('c1', 5)],
    suppliers: [{ id: 's1', name: 'Rossi', active: true }],
    jobs: [{ id: 'j1', number: 'COM-2025-001', customer: 'Alfa', title: 'Linea 1',
      status: 'aperta', dueDate: CONSEGNA, active: true }],
    plans: [{ id: 'pl1', number: 'PRD-2025-001', jobId: 'j1', dueDate: SERVE,
      lines: [{ id: 'l1', itemId: 'c1', qty: 10 }], active: true }],
    rfqs: [], orders: [], movements: [],
  }, over || {})));
  a.asRole('admin');
  return a;
}
function cov(a) { return JSON.parse(a.eval('JSON.stringify(jobCoverage("j1"))')); }
// Un ordine che porta 10 pz di C1, nello stato e con le date che servono.
function ordine(over) {
  return [Object.assign({ id: 'o1', number: 'ODA-2025-001', status: 'inviato', supplierId: 's1',
    active: true, lines: [Object.assign({ id: 'x', itemId: 'c1', code: 'C1', uom: 'pz', qty: 10, received: 0 },
      (over || {}).riga || {})] }, (over || {}).ordine || {})];
}
function carico(qty) { return [{ id: 'm1', itemId: 'c1', qty, kind: 'carico', date: '2025-01-01' }]; }
// I pannelli aperti: la conferma è un pannello come gli altri.
function pannelli(a) { return a.el('modal-root').children; }
function testoConferma(a) {
  const p = pannelli(a).find(c => c.dataset.panelKey === 'confirm');
  return p ? p.innerHTML : '';
}

describe('Cosa conta come mancante', () => {
  it('senza giacenza e senza ordini: da ordinare', () => {
    const c = cov(app());
    assert.equal(c.stato, 'manca');
    assert.deepEqual(c.daOrdinare.map(r => r.code), ['C1']);
    assert.equal(c.daOrdinare[0].qtyOrder, 10, 'la quantità è il netto, non il lordo');
  });

  it('giacenza sufficiente: coperto', () => {
    const c = cov(app({ movements: carico(10) }));
    assert.equal(c.stato, 'ok');
    assert.equal(c.righe[0].livello, 'ok');
  });

  it('ordinato e in arrivo prima che serva: coperto', () => {
    const c = cov(app({ orders: ordine({ riga: { deliveryDate: '2025-05-20' } }) }));
    assert.equal(c.stato, 'ok');
  });

  it('ordinato ma confermato dopo: arriva tardi, e non c\'è niente da ricomprare', () => {
    const c = cov(app({ orders: ordine({ riga: { deliveryDate: '2025-05-20', confirmedDate: '2025-09-01' } }) }));
    assert.equal(c.stato, 'attenzione');
    assert.deepEqual(c.tardive.map(r => r.code), ['C1']);
    assert.equal(c.tardive[0].eta, '2025-09-01', 'vale la data che il fornitore ha confermato');
    assert.deepEqual(c.daOrdinare, [], 'la merce è già pagata: si sollecita, non si ricompra');
  });

  it('una riga d\'ordine senza date non è un ritardo: è un\'incognita', () => {
    const c = cov(app({ orders: ordine() }));
    assert.equal(c.stato, 'ok', 'contarla tardiva farebbe rumore su ogni base dati senza date');
  });

  it('il documento c\'è ma non è partito: non si dice «ordina»', () => {
    const c = cov(app({ orders: ordine({ ordine: { status: 'bozza', planId: 'pl1' } }) }));
    assert.equal(c.stato, 'attenzione');
    assert.deepEqual(c.documentate.map(r => r.code), ['C1']);
    assert.equal(c.documentate[0].docs[0].number, 'ODA-2025-001', 'la voce dice quale documento');
    assert.deepEqual(c.daOrdinare, [], 'a chi l\'ordine l\'ha scritto manca di premere Invia');
  });

  it('una bozza però non è merce in arrivo: la riga resta scoperta', () => {
    const c = cov(app({ orders: ordine({ ordine: { status: 'bozza', planId: 'pl1' } }) }));
    assert.equal(c.documentate[0].qtyOrder, 10, 'il netto non cala per un documento non inviato');
  });

  it('un ordine annullato torna a essere lavoro da fare', () => {
    const c = cov(app({ orders: ordine({ ordine: { status: 'annullato', planId: 'pl1' } }) }));
    assert.equal(c.stato, 'manca');
    assert.deepEqual(c.daOrdinare.map(r => r.code), ['C1']);
  });

  // Dalla 0.105.6: un ordine già inviato per una parte non è «un documento che
  // aspetta l'invio» per il resto. Quello che manca va ancora ordinato.
  it('ordinato in parte e già inviato: il resto è da ordinare', () => {
    const c = cov(app({ orders: ordine({ ordine: { planId: 'pl1' }, riga: { qty: 4 } }) }));
    assert.equal(c.stato, 'manca');
    assert.deepEqual(c.daOrdinare.map(r => r.code), ['C1']);
    assert.equal(c.daOrdinare[0].qtyOrder, 6);
    assert.deepEqual(c.documentate, []);
  });

  it('una bozza che copre solo una parte non basta', () => {
    const c = cov(app({ orders: ordine({ ordine: { status: 'bozza', planId: 'pl1' }, riga: { qty: 4 } }) }));
    assert.equal(c.stato, 'manca');
    assert.deepEqual(c.daOrdinare.map(r => r.code), ['C1']);
  });

  it('una richiesta d\'offerta aperta conta come documento, una chiusa no', () => {
    const rfq = status => [{ id: 'r1', number: 'RDO-2025-001', status, planId: 'pl1', active: true,
      lines: [{ id: 'y', itemId: 'c1', code: 'C1', uom: 'pz', qty: 10 }] }];
    assert.deepEqual(cov(app({ rfqs: rfq('inviata') })).documentate.map(r => r.code), ['C1']);
    assert.deepEqual(cov(app({ rfqs: rfq('chiusa') })).daOrdinare.map(r => r.code), ['C1']);
  });
});

describe('La commessa è una domanda sola, non N piani', () => {
  const duePiani = {
    plans: [
      { id: 'pl1', number: 'PRD-1', jobId: 'j1', dueDate: SERVE, lines: [{ id: 'a', itemId: 'c1', qty: 100 }], active: true },
      { id: 'pl2', number: 'PRD-2', jobId: 'j1', dueDate: SERVE, lines: [{ id: 'b', itemId: 'c1', qty: 100 }], active: true },
    ],
    movements: carico(100),
  };

  it('due piani della stessa commessa si sommano invece di farsi concorrenza', () => {
    const c = cov(app(duePiani));
    assert.equal(c.righe.length, 1, 'lo stesso articolo è una riga sola: la commessa lo chiede una volta');
    assert.equal(c.righe[0].qty, 200, 'il fabbisogno è la somma dei due piani');
    assert.equal(c.righe[0].qtyOrder, 100, '200 servono, 100 ci sono: ne mancano 100');
  });

  // L'altra commessa è concorrenza se consegna prima: chi consegna prima prende
  // prima (commitsOn), e chi viene dopo non le toglie niente.
  const dueCommesse = altra => ({
    jobs: [{ id: 'j1', number: 'COM-1', status: 'aperta', dueDate: CONSEGNA, active: true },
      { id: 'j2', number: 'COM-2', status: 'aperta', active: true }],
    plans: [{ id: 'pl1', number: 'PRD-1', jobId: 'j1', dueDate: SERVE, lines: [{ id: 'a', itemId: 'c1', qty: 100 }], active: true },
      Object.assign({ id: 'pl2', number: 'PRD-2', jobId: 'j2', lines: [{ id: 'b', itemId: 'c1', qty: 100 }], active: true }, altra)],
    movements: carico(100),
  });

  it('un piano di un\'ALTRA commessa che consegna prima resta concorrenza', () => {
    const c = cov(app(dueCommesse({ dueDate: '2025-05-01' })));
    assert.equal(c.righe[0].qty, 100, 'il fabbisogno è solo il suo');
    assert.equal(c.righe[0].qtyOrder, 100, 'ma la merce se la sta prendendo l\'altra commessa');
  });

  it('un piano di un\'ALTRA commessa che consegna dopo non le toglie la merce', () => {
    const c = cov(app(dueCommesse({})));
    assert.equal(c.righe[0].qtyOrder, 0, 'i 100 in casa sono della commessa che consegna prima');
  });

  it('la riga nomina il piano da cui viene: è lì che si genera il documento', () => {
    const c = cov(app());
    assert.equal(c.daOrdinare[0].planId, 'pl1');
    assert.equal(c.daOrdinare[0].planNumber, 'PRD-2025-001');
  });
});

describe('Non sapere non è stare bene', () => {
  it('nessun piano collegato: ignoto, non coperto', () => {
    const c = cov(app({ plans: [] }));
    assert.equal(c.stato, 'ignoto');
    assert.deepEqual(c.righe, []);
    assert.equal(c.piani, 0);
  });

  it('solo piani chiusi: ignoto, e si vede che erano chiusi', () => {
    const c = cov(app({ plans: [{ id: 'pl1', number: 'PRD-1', jobId: 'j1',
      lines: [{ id: 'l1', itemId: 'c1', qty: 10 }], active: false }] }));
    assert.equal(c.stato, 'ignoto', 'un piano chiuso non è lavoro da fare, come per commitIndex');
    assert.equal(c.piani, 1);
    assert.equal(c.pianiAperti, 0, 'il testo può distinguere «nessun piano» da «nessun piano aperto»');
  });

  it('a schermo non compare mai la parola «coperto» quando non si sa', () => {
    const a = app({ plans: [] });
    a.eval('renderJobs(); openJobEdit("j1");');
    const h = a.html('view-jobs');
    assert.match(h, /non è calcolabile/);
    assert.doesNotMatch(h, /coperto/, 'una spunta verde qui sarebbe una bugia comoda');
  });
});

describe('Mettere in produzione avvisa, e non decide al posto di nessuno', () => {
  it('con materiale mancante chiede prima di scrivere', () => {
    const a = app();
    a.eval('renderJobs(); openJobEdit("j1"); jobSetField("j1","status","produzione");');
    assert.equal(a.eval('getJob("j1").status'), 'aperta', 'niente si scrive finché non si risponde');
    assert.equal(pannelli(a).length, 1);
    a.eval('confirmYes()');
    assert.equal(a.eval('getJob("j1").status'), 'produzione', 'chi conferma deve poter andare avanti');
  });

  it('annullando non si scrive niente', () => {
    const a = app();
    a.eval('renderJobs(); openJobEdit("j1"); jobSetField("j1","status","produzione"); confirmNo();');
    assert.equal(a.eval('getJob("j1").status'), 'aperta');
  });

  it('con il materiale coperto non chiede niente', () => {
    const a = app({ movements: carico(10) });
    a.eval('renderJobs(); openJobEdit("j1"); jobSetField("j1","status","produzione");');
    assert.equal(pannelli(a).length, 0, 'una domanda inutile è una domanda che insegna a rispondere a caso');
    assert.equal(a.eval('getJob("j1").status'), 'produzione');
  });

  it('l\'avviso non torna a ogni ritocco degli altri campi', () => {
    const a = app();
    a.eval('renderJobs(); openJobEdit("j1"); jobSetField("j1","notes","urgente");');
    assert.equal(pannelli(a).length, 0);
    assert.equal(a.eval('getJob("j1").notes'), 'urgente');
  });

  it('e nemmeno riselezionando uno stato che è già quello', () => {
    const a = app({ jobs: [{ id: 'j1', number: 'COM-1', status: 'produzione', dueDate: CONSEGNA, active: true }] });
    a.eval('renderJobs(); openJobEdit("j1"); jobSetField("j1","status","produzione");');
    assert.equal(pannelli(a).length, 0);
  });

  it('anche una commessa senza piani viene fermata: non si sa, e va detto', () => {
    const a = app({ plans: [] });
    a.eval('renderJobs(); openJobEdit("j1"); jobSetField("j1","status","produzione");');
    assert.equal(pannelli(a).length, 1);
    assert.match(testoConferma(a), /non ha piani di fabbisogno aperti/);
  });

  it('la domanda nomina i codici e la data di consegna', () => {
    const a = app();
    a.eval('renderJobs(); openJobEdit("j1"); jobSetField("j1","status","produzione");');
    const t = testoConferma(a);
    assert.match(t, /C1/, 'chi decide deve sapere cosa manca, non solo quanti sono');
    assert.match(t, /30\/06\/2025/, 'e contro quale data sta decidendo');
    assert.match(t, /Metti in produzione lo stesso/, 'la via d\'uscita resta aperta');
  });

  it('uscire dalla produzione non chiede niente', () => {
    const a = app({ jobs: [{ id: 'j1', number: 'COM-1', status: 'produzione', dueDate: CONSEGNA, active: true }] });
    a.eval('renderJobs(); openJobEdit("j1"); jobSetField("j1","status","chiusa");');
    assert.equal(pannelli(a).length, 0);
    assert.equal(a.eval('getJob("j1").status'), 'chiusa');
  });
});

describe('Il disegno della copertura', () => {
  it('la scheda commessa nomina i codici e porta al piano', () => {
    const a = app();
    a.eval('renderJobs(); openJobEdit("j1");');
    const h = a.html('view-jobs');
    assert.match(h, /Copertura materiale/);
    assert.match(h, /home-chip/, 'stesse pastiglie del riepilogo: un solo linguaggio');
    assert.match(h, /apriPianoDaCommessa\('pl1'\)/);
    assert.match(h, /da ordinare/);
  });

  it('coperto lo dice, senza far cercare', () => {
    const a = app({ movements: carico(10) });
    a.eval('renderJobs(); openJobEdit("j1");');
    const h = a.html('view-jobs');
    assert.match(h, /coprono il fabbisogno/);
    assert.doesNotMatch(h, /home-chip/, 'niente da elencare quando non manca niente');
  });

  it('oltre otto codici si dice quanti ne restano', () => {
    const items = [], lines = [];
    for (let i = 1; i <= 12; i++) { items.push(acq('c' + i, 5)); lines.push({ id: 'l' + i, itemId: 'c' + i, qty: 1 }); }
    const a = app({ items, plans: [{ id: 'pl1', number: 'PRD-1', jobId: 'j1', dueDate: SERVE, lines, active: true }] });
    assert.equal(cov(a).daOrdinare.length, 12);
    a.eval('renderJobs(); openJobEdit("j1");');
    const h = a.html('view-jobs');
    assert.equal((h.match(/home-chip/g) || []).length, 8);
    assert.match(h, /\+4 altri/);
  });
});
