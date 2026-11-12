// Taratura degli strumenti di misura (0.153.0): il registro, le tarature, il
// blocco del collaudo con uno strumento scaduto e l'analisi d'impatto.
//
// Le domande:
//  - lo stato si calcola dalla scadenza, mai scritto: valido, in scadenza,
//    scaduto, da tarare, indicativo;
//  - una taratura conforme sposta la scadenza di tanti mesi quanti dice
//    l'intervallo; una non conforme mette lo strumento fuori servizio;
//  - trovato fuori, lo strumento apre una NC con le misure prese dall'ultima
//    taratura buona, e la NC non si chiude finché non si decide su ognuna;
//  - il collaudo con uno strumento scaduto non si chiude (o si chiude con
//    l'avviso, se Gestione dice così);
//  - scelto lo strumento in una riga, le altre dello stesso tipo lo prendono;
//  - l'intervallo lo cambia l'amministratore; l'officina registra le tarature;
//  - il QR «str» porta allo strumento; spento il modulo, niente di tutto questo.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

const J = (a, expr) => JSON.parse(a.eval(`JSON.stringify(${expr})`));
const S = v => JSON.stringify(v);

function app(opz) {
  const o = opz || {};
  const a = loadApp({ silent: true });
  const oggi = a.eval('oggiISO()');
  const piu = g => a.eval(`struPiuGiorni(${S(oggi)}, ${g})`);
  const strumento = (id, code, extra) => Object.assign({ id, code, name: 'Calibro 150', typeId: 'tt-calibro', brand: '', model: '',
    serial: '', rangeText: '0-150', resolution: 0.01, ema: 0.03, uom: 'mm', location: '', holder: '', owner: 'nostro',
    control: 'esterna', intervalMonths: 12, labId: null, status: 'attivo', lastCal: piu(-200), nextDue: piu(165),
    sentOn: '', notes: '', active: true }, extra || {});
  const riga = (id, extra) => Object.assign({ id, name: 'Diametro ' + id, kind: 'misura', nominal: 30, tolMin: -0.1, tolMax: 0.1,
    uom: 'mm', tool: 'Calibro a corsoio', toolTypeId: 'tt-calibro', value: '', verdict: '' }, extra || {});
  a.setDb(makeDb({
    suppliers: [{ id: 'lab', name: 'Lab Metrologia', active: true }],
    items: [Object.assign(acq('c1', 5), { uom: 'pz', qc: 'si' })],
    settings: Object.assign({ overheadPct: 0, marginPct: 0, currency: '€',
      modules: { qualita: o.qualita !== false, tarature: o.spento ? false : true } }, o.settings || {}),
    instruments: o.strumenti || [
      strumento('s1', 'STR-0001'),
      strumento('s2', 'STR-0002', { nextDue: piu(-3) }),
      strumento('s3', 'STR-0003', { nextDue: piu(10) }),
      strumento('s4', 'STR-0004', { nextDue: '', lastCal: '' }),
      strumento('s5', 'STR-0005', { control: 'nessuna', nextDue: '' }),
      strumento('m1', 'STR-0006', { name: 'Micrometro', typeId: 'tt-micrometro' }),
    ],
    calibrations: o.tarature || [],
    inspections: [{ id: 'i1', number: 'COL-2026-001', source: 'oda', orderId: null, lineId: null, itemId: 'c1', qty: 10, uom: 'pz',
      supplierId: null, date: oggi, ddt: '', supplierLot: '', cert: '', status: 'aperto', esito: '', qtyOk: 0, qtyKo: 0,
      destino: 'magazzino', note: '', closedAt: null, active: true,
      checks: [riga('k1'), riga('k2'), riga('k3', { toolTypeId: 'tt-micrometro', tool: 'Micrometro' }),
        riga('k4', { kind: 'ok', tool: '', toolTypeId: '', nominal: '', tolMin: '', tolMax: '' })] }],
    nonconformities: [],
  }));
  a.asRole(o.ruolo || 'admin');
  return { a, oggi, piu };
}

describe('Lo stato dello strumento', () => {
  it('si calcola dalla scadenza e dal preavviso', () => {
    const { a } = app();
    const st = id => a.eval(`struStato(struGet(${S(id)}))`);
    assert.equal(st('s1'), 'valido');
    assert.equal(st('s2'), 'scaduto');
    assert.equal(st('s3'), 'in_scadenza', 'dieci giorni, dentro i 30 di preavviso');
    assert.equal(st('s4'), 'da_tarare');
    assert.equal(st('s5'), 'indicativo');
    assert.equal(a.eval('struUsabile(struGet("s3"))'), true, 'in scadenza si usa ancora');
    assert.equal(a.eval('struUsabile(struGet("s2"))'), false);
    assert.deepEqual(J(a, 'struScaduti().map(s => s.id).sort()'), ['s2', 's4']);
    assert.deepEqual(J(a, 'struInScadenza().map(s => s.id)'), ['s3']);
  });
  it('il preavviso si cambia in Gestione', () => {
    const { a } = app({ settings: { qcToolWarnDays: 5 } });
    assert.equal(a.eval('struStato(struGet("s3"))'), 'valido');
  });
  it('un mese in più resta nel mese: 31 gennaio + 1 è il 28 febbraio', () => {
    const { a } = app();
    assert.equal(a.eval('struPiuMesi("2026-01-31", 1)'), '2026-02-28');
    assert.equal(a.eval('struPiuMesi("2026-11-11", 12)'), '2027-11-11');
    assert.equal(a.eval('struPiuMesi("2026-11-30", 3)'), '2027-02-28');
  });
  it('fuori servizio e in taratura non si usano', () => {
    const { a } = app();
    assert.equal(a.eval('struMandaInTaratura("s1")'), true);
    assert.equal(a.eval('struStato(struGet("s1"))'), 'in_taratura');
    assert.equal(a.eval('struUsabile(struGet("s1"))'), false);
  });
});

describe('Registrare una taratura', () => {
  it('conforme: la prossima scadenza è dopo l\'intervallo, e torna in uso', () => {
    const { a, oggi } = app();
    a.eval('struMandaInTaratura("s2")');
    const cal = J(a, `tarRegistra("s2", { date: ${S(oggi)}, kind: 'esterna', supplierId: 'lab', certNo: 'LAT 123',
      points: [{ nominal: 25, found: 25.01 }, { nominal: 100, found: 99.98 }] })`);
    assert.equal(cal.errMax, 0.02);
    assert.equal(cal.asFound, 'conforme', 'entro l\'EMA di 0,03');
    const s = J(a, 'struGet("s2")');
    assert.equal(s.status, 'attivo');
    assert.equal(s.lastCal, oggi);
    assert.equal(s.nextDue, a.eval(`struPiuMesi(${S(oggi)}, 12)`));
    assert.equal(a.eval('struStato(struGet("s2"))'), 'valido');
    assert.equal(J(a, 'ncTutte()').length, 0, 'conforme, nessuna NC');
  });
  it('non si registra nel futuro, né senza sapere com\'era', () => {
    const { a, piu } = app({ strumenti: [{ id: 's1', code: 'STR-0001', name: 'Calibro', typeId: 'tt-calibro', ema: null,
      control: 'esterna', intervalMonths: 12, status: 'attivo', nextDue: '', lastCal: '', active: true }] });
    assert.equal(a.eval(`tarRegistra("s1", { date: ${S(piu(2))}, asFound: 'conforme' })`), null);
    assert.equal(a.eval(`tarRegistra("s1", { date: ${S(piu(0))} })`), null, 'senza EMA l\'esito va detto');
    assert.equal(J(a, 'tarTutte()').length, 0);
  });
  it('non conforme e non regolato: fuori servizio, senza scadenza nuova', () => {
    const { a, oggi } = app();
    a.eval(`tarRegistra("s1", { date: ${S(oggi)}, points: [{ nominal: 50, found: 50.08 }] })`);
    const s = J(a, 'struGet("s1")');
    assert.equal(s.status, 'fuori_servizio');
    assert.equal(a.eval('struRimettiInUso("s1")'), false, 'l\'ultima taratura lo ha lasciato non conforme');
  });
  it('trovato fuori ma regolato: torna in uso, e la NC si apre lo stesso', () => {
    const { a, oggi } = app();
    a.eval(`tarRegistra("s1", { date: ${S(oggi)}, points: [{ nominal: 50, found: 50.08 }], adjusted: true, asLeft: 'conforme' })`);
    assert.equal(J(a, 'struGet("s1")').status, 'attivo');
    const nc = J(a, 'db.nonconformities');
    assert.equal(nc.length, 1);
    assert.equal(nc[0].source, 'strumento');
    assert.equal(nc[0].instrumentId, 's1');
    assert.equal(nc[0].cause, 'Strumento di misura fuori tolleranza');
    assert.equal(J(a, 'tarTutte()[0]').ncId, nc[0].id, 'la taratura sa la sua NC');
    assert.equal(a.eval('ncOrigineNumero(db.nonconformities[0])'), 'STR-0001');
  });
  it('l\'officina registra, ma l\'intervallo lo cambia l\'amministratore', () => {
    const { a, oggi } = app({ ruolo: 'officina' });
    assert.ok(a.eval(`tarRegistra("s2", { date: ${S(oggi)}, asFound: 'conforme' })`));
    assert.equal(a.eval('struSet("s1", "intervalMonths", 6)'), false);
    assert.equal(a.eval('struSet("s1", "location", "Armadio 2")'), true);
    a.asRole('admin');
    assert.equal(a.eval('struSet("s1", "intervalMonths", 6)'), true);
    assert.equal(J(a, 'struGet("s1")').intervalMonths, 6);
  });
  it('il lettore non registra niente', () => {
    const { a, oggi } = app({ ruolo: 'lettore' });
    assert.equal(a.eval(`tarRegistra("s2", { date: ${S(oggi)}, asFound: 'conforme' })`), null);
    assert.equal(a.eval('struCrea({ name: "Calibro" })'), null);
  });
  it('dopo una taratura le date non si correggono più a mano', () => {
    const { a, oggi, piu } = app();
    assert.equal(a.eval(`struSet("s4", "lastCal", ${S(piu(-10))})`), true);
    assert.equal(J(a, 'struGet("s4")').nextDue, a.eval(`struPiuMesi(${S(piu(-10))}, 12)`), 'la prossima viene da sola');
    a.eval(`tarRegistra("s4", { date: ${S(oggi)}, asFound: 'conforme' })`);
    assert.equal(a.eval(`struSet("s4", "nextDue", ${S(piu(900))})`), false);
  });
  it('i codici si propongono in fila e non si ripetono', () => {
    const { a } = app();
    assert.equal(J(a, 'struCrea({ typeId: "tt-micrometro" })').code, 'STR-0007');
    assert.equal(a.eval('struCrea({ code: "STR-0001", name: "Doppio" })'), null);
  });
});

describe('Lo strumento nel collaudo', () => {
  it('scelto in una riga, le altre dello stesso tipo ancora senza lo prendono', () => {
    const { a, oggi } = app();
    assert.equal(a.eval('qcSetStrumento("i1", "k1", "s1")'), true);
    const c = J(a, 'qcGet("i1").checks');
    assert.equal(c[0].instrumentId, 's1');
    assert.equal(c[0].instrumentCode, 'STR-0001');
    assert.equal(c[0].instrumentAt, oggi);
    assert.equal(c[1].instrumentId, 's1', 'stesso tipo');
    assert.equal(c[2].instrumentId || null, null, 'il micrometro resta da scegliere');
    assert.equal(c[3].instrumentId || null, null);
  });
  it('fra le scelte ci sono solo gli strumenti usabili del tipo chiesto', () => {
    const { a } = app();
    assert.deepEqual(J(a, 'struScelte("tt-calibro").map(s => s.id)'), ['s1', 's3']);
    assert.deepEqual(J(a, 'struScelte("tt-micrometro").map(s => s.id)'), ['m1']);
  });
  it('una misura senza lo strumento chiesto blocca l\'esito', () => {
    const { a } = app();
    a.eval('db.inspections[0].checks[0].value = "30.02"');
    assert.match(a.eval('struControllaCollaudo(qcGet("i1"))'), /Scegli lo strumento usato per «Diametro k1»/);
    assert.equal(a.eval('qcRegistraEsito("i1", { esito: "accettato" })'), false);
    assert.equal(J(a, 'qcGet("i1")').status, 'aperto');
  });
  it('uno strumento scaduto blocca l\'esito; uno valido lo lascia passare', () => {
    const { a } = app();
    a.eval('qcSetStrumento("i1", "k1", "s2")');
    a.eval('db.inspections[0].checks[0].value = "30.02"');
    assert.match(a.eval('struControllaCollaudo(qcGet("i1"))'), /STR-0002 usato per «Diametro k1» è scaduto/);
    assert.equal(a.eval('qcRegistraEsito("i1", { esito: "accettato" })'), false);
    a.eval('qcSetStrumento("i1", "k1", "s1")');
    assert.equal(a.eval('struControllaCollaudo(qcGet("i1"))'), '');
    assert.equal(a.eval('qcRegistraEsito("i1", { esito: "accettato" })'), true);
  });
  it('con la regola «avviso» l\'esito si registra lo stesso', () => {
    const { a } = app({ settings: { qcToolRule: 'avviso' } });
    a.eval('qcSetStrumento("i1", "k1", "s2")');
    a.eval('db.inspections[0].checks[0].value = "30.02"');
    assert.equal(a.eval('qcRegistraEsito("i1", { esito: "accettato" })'), true);
  });
  it('le righe non misurate non chiedono strumenti', () => {
    const { a } = app();
    assert.equal(a.eval('struControllaCollaudo(qcGet("i1"))'), '');
  });
  it('il rapporto scrive il codice e la scadenza di quel giorno', () => {
    const { a } = app();
    a.eval('qcSetStrumento("i1", "k1", "s1")');
    const due = J(a, 'struGet("s1")').nextDue;
    assert.equal(a.eval('qcStrumentoTesto(qcGet("i1").checks[0])'), `STR-0001 (scad. ${a.eval(`fmtDateIt(${S(due)})`)})`);
    assert.equal(a.eval('qcStrumentoTesto(qcGet("i1").checks[3])'), '');
  });
  it('il piano trova il tipo anche dal testo libero', () => {
    const { a } = app();
    assert.equal(a.eval('qcCarTipoId({ tool: "micrometro" })'), 'tt-micrometro');
    assert.equal(a.eval('qcCarTipoId({ tool: "Righello" })'), '');
  });
  it('spento il modulo, il collaudo non chiede strumenti', () => {
    const { a } = app({ spento: true });
    a.eval('db.inspections[0].checks[0].value = "30.02"');
    assert.equal(a.eval('struControllaCollaudo(qcGet("i1"))'), '');
    assert.equal(a.eval('moduloAttivo("tarature")'), false);
  });
  it('senza la Qualità il modulo non si accende', () => {
    const { a } = app({ qualita: false });
    assert.equal(a.eval('moduloAttivo("tarature")'), false);
  });
});

describe('L\'impatto di uno strumento trovato fuori', () => {
  // Due misure con s1: una lontana dal limite (30,00 su ±0,1: margine 0,1),
  // una vicina (30,09: margine 0,01). Errore trovato 0,05.
  function conMisure() {
    const r = app();
    const { a } = r;
    a.eval('qcSetStrumento("i1", "k1", "s1")');
    a.eval('db.inspections[0].checks[0].value = "30.00"; db.inspections[0].checks[1].value = "30.09"');
    a.eval(`tarRegistra("s1", { date: ${S(r.oggi)}, points: [{ nominal: 50, found: 50.05 }], adjusted: true, asLeft: 'conforme' })`);
    return r;
  }
  it('la misura col margine largo è valida, quella al limite da rivedere', () => {
    const { a } = conMisure();
    const imp = J(a, 'db.nonconformities[0].impact');
    assert.equal(imp.length, 2);
    const per = Object.fromEntries(imp.map(r => [r.checkId, r]));
    assert.equal(per.k1.esito, 'valida');
    assert.equal(per.k1.decision, 'nessun_impatto');
    assert.equal(per.k2.esito, 'rivedere');
    assert.equal(per.k2.decision, '');
    assert.equal(J(a, 'db.nonconformities[0]').gravita, 'maggiore');
  });
  it('la NC non si chiude finché ogni misura non ha la sua decisione', () => {
    const { a } = conMisure();
    const id = a.eval('db.nonconformities[0].id');
    a.eval(`Store.update('nonconformities', ${S(id)}, { decision: 'rilavorazione' })`);
    assert.equal(a.eval(`ncChiudi(${S(id)})`), false);
    const riga = J(a, 'db.nonconformities[0].impact').find(r => r.checkId === 'k2');
    assert.equal(a.eval(`struImpattoSet(${S(id)}, ${S(riga.id)}, 'ricontrollare')`), true);
    assert.equal(a.eval(`struImpattoAperto(ncGet(${S(id)}))`), 0);
    assert.equal(a.eval(`ncChiudi(${S(id)})`), true);
    assert.equal(J(a, `ncGet(${S(id)})`).status, 'chiusa');
  });
  it('le misure prima dell\'ultima taratura buona non contano', () => {
    const { a, oggi, piu } = app({ tarature: [] });
    a.eval('qcSetStrumento("i1", "k1", "s1")');
    a.eval(`db.inspections[0].checks[0].value = "30.09"; db.inspections[0].checks[0].instrumentAt = ${S(piu(-30))}`);
    a.eval(`db.calibrations.push({ id: 't0', instrumentId: 's1', date: ${S(piu(-10))}, kind: 'esterna', asFound: 'conforme',
      adjusted: false, asLeft: 'conforme', nextDue: ${S(piu(355))}, points: [], errMax: 0.01, active: true })`);
    assert.equal(J(a, `struImpatto("s1", ${S(oggi)}, { id: 'nuova', errMax: 0.05 })`).length, 0);
  });
});

describe('QR, avvisi e calendario', () => {
  it('il QR «str» porta allo strumento, per codice', () => {
    const { a } = app();
    const r = J(a, 'qrResolve("str", "str-0003")');
    assert.equal(r.tipo, 'str');
    assert.equal(r.rec.id, 's3');
    assert.equal(a.eval('qrResolve("", "STR-0003")'), null, 'senza il tipo un codice nudo non è uno strumento');
  });
  it('la home avvisa dei da tarare e di quelli in scadenza', () => {
    const { a } = app();
    const av = J(a, 'struAvvisi()');
    assert.deepEqual(av.scaduti.map(x => x.s.id).sort(), ['s2', 's4']);
    assert.match(av.scaduti.find(x => x.s.id === 's4').testo, /mai tarato/);
    assert.deepEqual(av.vicini.map(x => x.s.id), ['s3']);
    const ev = J(a, `struEventiCalendario(${S(a.eval('oggiISO()'))})`);
    assert.deepEqual(ev.map(e => e.testo).sort(), ['Taratura STR-0001', 'Taratura STR-0002', 'Taratura STR-0003', 'Taratura STR-0006']);
    assert.equal(ev.find(e => e.testo === 'Taratura STR-0002').gravita, 'alta');
  });
});

// Dalla 0.156.1: la finestra della taratura. La scadenza proposta seguiva oggi
// anche per una taratura di mesi fa, e l'esito scelto a mano tornava subito a
// quello calcolato dai punti.
describe('La finestra della taratura', () => {
  // I campi come li lascia la finestra appena aperta, nel DOM finto.
  const apri = a => {
    a.eval('tarModal("s1")');
    const campi = { 'tar-date': a.eval('oggiISO()'), 'tar-err': '', 'tar-found': '', 'tar-adj': '', 'tar-left': 'conforme',
      'tar-next': a.eval('struPiuMesi(oggiISO(), 12)'), 'tar-kind': 'esterna', 'tar-sup': '', 'tar-cert': '', 'tar-cost': '0', 'tar-note': '' };
    Object.entries(campi).forEach(([id, v]) => { const e = a.el(id); e.value = v; e.dataset = {}; e.readOnly = false; });
  };
  it('la prossima taratura si conta dalla data della taratura, non da oggi', () => {
    const { a } = app();
    apri(a);
    a.el('tar-date').value = '2026-09-01';
    a.eval('tarModalAggiorna("s1")');
    assert.equal(a.el('tar-next').value, '2027-09-01');
    a.el('tar-found').value = 'conforme';
    const cal = J(a, 'tarModalSalva("s1")');
    assert.equal(cal.nextDue, '2027-09-01');
    assert.equal(J(a, 'struGet("s1")').nextDue, '2027-09-01');
  });
  it('una scadenza scritta a mano resta, anche se poi cambia la data', () => {
    const { a } = app();
    apri(a);
    a.el('tar-next').value = '2027-03-31';
    a.el('tar-next').dataset.mano = '1';
    a.el('tar-date').value = '2026-09-01';
    a.eval('tarModalAggiorna("s1")');
    assert.equal(a.el('tar-next').value, '2027-03-31');
  });
  it('l\'esito scelto a mano non torna a quello proposto dai punti', () => {
    const { a } = app();
    apri(a);
    // EMA 0,03 ed errore 0,01: l'app propone «conforme».
    a.el('tar-err').value = '0,01';
    a.eval('tarModalAggiorna("s1")');
    assert.equal(a.el('tar-found').value, 'conforme');
    a.el('tar-found').value = 'non_conforme';
    a.el('tar-found').dataset.mano = '1';
    a.eval('tarModalAggiorna("s1")');
    assert.equal(a.el('tar-found').value, 'non_conforme');
    a.el('tar-adj').value = 'si';
    a.eval('tarModalAggiorna("s1")');
    assert.equal(a.el('tar-found').value, 'non_conforme', 'anche dopo un altro cambio nella finestra');
  });
});
