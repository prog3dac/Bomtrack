// Modulo Qualità, 0.142.0: i codici del piano, le tolleranze ISO 286, l'esito
// a mano delle misure, il messaggio se fallisce e i QR dei documenti.
//
// Le domande:
//  - le tabelle ISO 286 danno gli scostamenti della norma (valori letti dalle
//    tabelle di ISO 286-2, fascia per fascia);
//  - un codice sta in un piano solo, e i piani vecchi diventano elenchi;
//  - una misura senza limiti non passa da sola: l'esito si sceglie;
//  - i QR di collaudo, NC e piano portano alla scheda giusta.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

function base(opz) {
  const o = opz || {};
  const art = (id, fam) => Object.assign(acq(id, 5), { uom: 'pz', supplierId: 's1', familyId: fam || 'f1' });
  const items = [art('c1'), art('c2'), art('c3', 'f2')];
  if (o.qc) items[0].qc = o.qc;
  return makeDb({
    suppliers: [{ id: 's1', name: 'SKF', active: true }],
    families: [{ id: 'f1', name: 'Cuscinetti', kind: 'acquistato', sigla: 'CUS', subs: [], qc: o.famQc || '' },
      { id: 'f2', name: 'Viti', kind: 'acquistato', sigla: 'VIT', subs: [] }],
    items,
    settings: { overheadPct: 0, marginPct: 0, currency: '€', modules: { qualita: true } },
    qualityPlans: o.piani || [],
    inspections: o.collaudi || [],
    nonconformities: o.nc || [],
    orders: [{ id: 'o1', number: 'ODA-2026-001', title: '', date: '2026-02-01', status: 'confermato',
      supplierId: 's1', notes: '', notesInternal: '', supplierConfirmation: 'X', active: true,
      lines: [{ id: 'l1', itemId: 'c1', code: 'c1', description: 'Cuscinetto', uom: 'pz',
        qty: 1000, price: 5, deliveryDate: '', confirmedDate: '', received: 0, note: '' }] }],
  });
}
const piano = extra => Object.assign({ id: 'p1', name: 'Cuscinetti', itemIds: ['c1'], cert: '',
  sampling: 'tutto', sampleQty: 5, samplePct: 10, aql: 1, skipAfter: 0, skipEvery: 0,
  characteristics: [], notes: '', failMessage: '', active: true, createdAt: '2026-01-01T00:00:00Z' }, extra || {});
function app(db, role) {
  const a = loadApp({ silent: true });
  a.setDb(db || base({ piani: [piano()] }));
  a.asRole(role || 'admin');
  return a;
}
const J = (a, expr) => JSON.parse(a.eval(`JSON.stringify(${expr})`));

describe('Tolleranze ISO 286', () => {
  // [nominale, classe, scostamento superiore, inferiore] in µm, dalle tabelle
  // di ISO 286-2: una riga per fascia e lettera, alberi e fori.
  const casi = [
    [25, 'f7', -20, -41], [25, 'g6', -7, -20], [25, 'h7', 0, -21], [25, 'js6', 6.5, -6.5],
    [25, 'k6', 15, 2], [25, 'm6', 21, 8], [25, 'n6', 28, 15], [25, 'p6', 35, 22],
    [25, 'G7', 28, 7], [25, 'H7', 21, 0], [25, 'K7', 6, -15], [25, 'M7', 0, -21], [25, 'N7', -7, -28], [25, 'F8', 53, 20],
    [5, 'f7', -10, -22], [8, 'f7', -13, -28], [14, 'f7', -16, -34], [40, 'f7', -25, -50], [65, 'f7', -30, -60],
    [100, 'f7', -36, -71], [150, 'f7', -43, -83], [200, 'f7', -50, -96], [280, 'f7', -56, -108], [350, 'f7', -62, -119],
    [5, 'k6', 9, 1], [8, 'k6', 10, 1], [14, 'k6', 12, 1], [40, 'k6', 18, 2], [65, 'k6', 21, 2], [100, 'k6', 25, 3],
    [150, 'k6', 28, 3], [200, 'k6', 33, 4], [280, 'k6', 36, 4], [350, 'k6', 40, 4],
    [5, 'p6', 20, 12], [8, 'p6', 24, 15], [14, 'p6', 29, 18], [40, 'p6', 42, 26], [65, 'p6', 51, 32], [280, 'p6', 88, 56], [350, 'p6', 98, 62],
    [5, 'K7', 3, -9], [8, 'K7', 5, -10], [14, 'K7', 6, -12], [40, 'K7', 7, -18], [65, 'K7', 9, -21], [100, 'K7', 10, -25],
    [150, 'K7', 12, -28], [200, 'K7', 13, -33], [280, 'K7', 16, -36], [350, 'K7', 17, -40],
    [5, 'N7', -4, -16], [8, 'N7', -4, -19], [14, 'N7', -5, -23], [40, 'N7', -8, -33], [65, 'N7', -9, -39], [150, 'N7', -12, -52], [350, 'N7', -16, -73],
    [8, 'M8', 1, -21], [8, 'js7', 7.5, -7.5], [8, 'n6', 19, 10],
  ];
  it('gli scostamenti sono quelli delle tabelle, fascia per fascia', () => {
    const a = app();
    casi.forEach(([n, c, sup, inf]) => {
      assert.deepEqual(J(a, `iso286Scostamenti(${n}, ${JSON.stringify(c)})`), { inf, sup }, `${c} a ${n} mm`);
    });
  });
  it('il limite di fascia è compreso: 30 mm sta con 18–30, 30,01 con 30–50', () => {
    const a = app();
    assert.deepEqual(J(a, 'iso286Scostamenti(30, "H7")'), { inf: 0, sup: 21 });
    assert.deepEqual(J(a, 'iso286Scostamenti(30.01, "H7")'), { inf: 0, sup: 25 });
  });
  it('fuori tabella si dice: classe sconosciuta, grado fuori forbice, oltre 500 mm', () => {
    const a = app();
    assert.equal(a.eval('iso286Scostamenti(20, "s6")'), null);
    assert.equal(a.eval('iso286Scostamenti(20, "h4")'), null);
    assert.equal(a.eval('iso286Scostamenti(600, "h7")'), null);
    assert.equal(a.eval('iso286Scostamenti(0, "h7")'), null);
    assert.deepEqual(J(a, 'iso286Leggi(" JS 7 ")'), { foro: true, lettera: 'js', grado: 7, classe: 'JS7' });
  });
  it('in millimetri, come li vuole la caratteristica', () => {
    const a = app();
    assert.deepEqual(J(a, 'iso286Tolleranze(20, "h7")'), { tolMin: -0.021, tolMax: 0 });
    assert.deepEqual(J(a, 'iso286Tolleranze(20, "G8")'), { tolMin: 0.007, tolMax: 0.04 });
  });
});

describe('Le caratteristiche del piano', () => {
  const conCar = c => base({ piani: [piano({ characteristics: [Object.assign({ id: 'k1', name: 'Diametro', kind: 'misura', nominal: '', tolMin: '', tolMax: '', isoClass: '', uom: 'mm', tool: '' }, c || {})] })] });
  const car = a => J(a, 'qcPianoGet("p1").characteristics[0]');
  it('la classe ISO scrive gli scostamenti, e il nominale li ricalcola', () => {
    const a = app(conCar({ nominal: 20 }));
    assert.equal(a.eval('qcCarSet("p1","k1","isoClass","h7")'), true);
    assert.deepEqual([car(a).isoClass, car(a).tolMin, car(a).tolMax], ['h7', -0.021, 0]);
    a.eval('qcCarSet("p1","k1","nominal","40")');
    assert.deepEqual([car(a).tolMin, car(a).tolMax], [-0.025, 0]);
    assert.equal(a.eval('qcTolleranzaTesto(qcPianoGet("p1").characteristics[0])'), '40 h7 (39,975 – 40) mm');
  });
  it('un valore che non si legge non butta via quello di prima', () => {
    const a = app(conCar({ nominal: 20, tolMin: -0.05, tolMax: 0.05 }));
    assert.equal(a.eval('qcCarSet("p1","k1","tolMax","abc")'), false);
    assert.equal(car(a).tolMax, 0.05);
    assert.equal(a.eval('qcCarSet("p1","k1","isoClass","x9")'), false);
    assert.equal(car(a).isoClass, '');
  });
  it('si leggono i numeri come sul disegno: Ø, unità, segno, virgola', () => {
    const a = app();
    assert.equal(a.eval('qcLeggiNumero("Ø20 mm")'), 20);
    assert.equal(a.eval('qcLeggiNumero("+0,05")'), 0.05);
    assert.equal(a.eval('qcLeggiNumero("−0,02")'), -0.02);
    assert.equal(a.eval('qcLeggiNumero("")'), '');
    assert.equal(a.eval('qcLeggiNumero("20+")'), null);
  });
  it('la scheda è su due righe, con min e max calcolati, e il messaggio se fallisce', () => {
    const a = app(conCar({ nominal: 20, tolMin: -0.021, tolMax: 0, isoClass: 'h7' }));
    const h = a.eval('pqSchedaHtml(qcPianoGet("p1"), true)');
    assert.match(h, /qc-car-riga1/);
    assert.match(h, /qc-car-riga2/);
    assert.match(h, /19,979 – 20/);
    assert.match(h, /Messaggio se il controllo fallisce/);
    assert.match(h, /Codici del piano/);
    assert.doesNotMatch(h, /Vale per/);
    assert.doesNotMatch(h, /Solo per il fornitore/);
  });
});

describe('I codici del piano', () => {
  it('il riquadro dei codici nasce chiuso, e si apre e si chiude', () => {
    const a = app();
    const h = () => a.eval('pqCodiciHtml(qcPianoGet("p1"), true)');
    assert.match(h(), /aria-expanded="false"/);
    assert.doesNotMatch(h(), /<table/);
    assert.ok(h().includes(a.eval('getItem("c1").code')));
    a.eval('pqCodiciApriChiudi("p1")');
    assert.match(h(), /aria-expanded="true"/);
    assert.match(h(), /<table/);
    a.eval('pqCodiciApriChiudi("p1")');
    assert.doesNotMatch(h(), /<table/);
  });
  it('un codice sta in un piano solo: chi lo ha già lo tiene', () => {
    const a = app(base({ piani: [piano(), piano({ id: 'p2', name: 'Altro', itemIds: [] })] }));
    const r = J(a, 'qcPianoCodiciSet("p2", ["c1", "c2"])');
    assert.deepEqual(r.codici, ['c2']);
    assert.equal(r.scartati.length, 1);
    assert.equal(r.scartati[0].piano.id, 'p1');
    assert.equal(a.eval('qcPianoPer(getItem("c2")).id'), 'p2');
  });
  it('un piano nuovo o duplicato non prende codici già presi', () => {
    const a = app();
    assert.deepEqual(J(a, 'qcPianoNuovo({ itemIds: ["c1", "c2"] }).itemIds'), ['c2']);
    assert.deepEqual(J(a, 'qcPianoDuplica("p1").itemIds'), []);
  });
  it('la finestra mostra i codici presi altrove con la spunta spenta', () => {
    const a = app(base({ piani: [piano(), piano({ id: 'p2', name: 'Altro', itemIds: [] })] }));
    a.eval('qcCodiciModal("p2")');
    const h = a.eval('panelTop().innerHTML');
    assert.match(h, /nel piano Cuscinetti/);
    assert.match(h, /value="c1"[^>]*disabled/);
  });
  it('i piani d\'articolo e di famiglia diventano elenchi, l\'articolo prima', () => {
    const a = app(base({ piani: [
      { id: 'pf', name: 'Famiglia', familyId: 'f1', itemId: null, supplierId: 's1', sampling: 'tutto', characteristics: [], active: true, createdAt: '2026-01-01' },
      { id: 'pa', name: 'Articolo', itemId: 'c1', familyId: null, supplierId: null, sampling: 'tutto', characteristics: [], active: true, createdAt: '2026-01-02' },
    ] }));
    assert.equal(a.eval('qcPianoPer(getItem("c1")).id'), 'pa', 'prima della conversione vince l\'articolo');
    const r = J(a, 'qcPianiConverti()');
    assert.deepEqual(r, { piani: 2, fuori: 1 });
    assert.deepEqual(J(a, 'qcPianoGet("pa").itemIds'), ['c1']);
    assert.deepEqual(J(a, 'qcPianoGet("pf").itemIds'), ['c2']);
    assert.equal(a.eval('qcPianoGet("pf").supplierId'), null);
    assert.equal(a.eval('qcPianiConverti()'), null, 'una volta sola');
  });
  it('chi legge soltanto non converte, ma vede lo stesso i codici', () => {
    const a = app(base({ piani: [{ id: 'pf', name: 'Famiglia', familyId: 'f1', sampling: 'tutto', characteristics: [], active: true }] }), 'lettore');
    assert.equal(a.eval('qcPianiConverti()'), null);
    assert.deepEqual(J(a, 'qcPianoCodici(qcPianoGet("pf"))').sort(), ['c1', 'c2']);
  });
  it('il Riepilogo ricorda gli articoli da collaudare senza piano', () => {
    const a = app(base({ famQc: 'si', piani: [piano()] }));
    assert.deepEqual(J(a, 'qcSenzaPiano().map(x => x.id)'), ['c2']);
  });
});

describe('Il Riepilogo e le non conformità', () => {
  it('le NC aperte e le azioni della settimana, senza ripetere le scadute', () => {
    const a = app();
    const g = a.eval('oggiISO()');
    const fra = n => a.eval(`ncScadenzaDa("${g}", ${n})`);
    const nc = (id, number, due, actions) => ({ id, number, status: 'aperta', source: 'interna', itemId: 'c1', dueDate: due, actions: actions || [], active: true });
    a.eval(`db.nonconformities = ${JSON.stringify([
      nc('n1', 'NC-2026-001', fra(20), [{ id: 'a1', text: 'Rivedere il disegno', who: 'Marco', due: fra(3), done: false },
        { id: 'a2', text: 'Fatta', who: 'Luca', due: fra(2), done: true }, { id: 'a3', text: 'Più avanti', who: 'Sara', due: fra(12), done: false }]),
      nc('n2', 'NC-2026-002', fra(-1)),
      Object.assign(nc('n3', 'NC-2026-003', fra(5)), { status: 'chiusa' }),
    ])}`);
    const s = J(a, 'homeSegnali()');
    const per = t => s.find(x => x.testo.startsWith(t));
    assert.deepEqual(per('non conformità aperta').voci.map(v => v.testo), ['NC-2026-001']);
    assert.deepEqual(per('non conformità scaduta').voci.map(v => v.testo), ['NC-2026-002']);
    const az = per('azione di NC');
    assert.equal(az.voci.length, 1);
    assert.match(az.voci[0].titolo, /^Marco — Rivedere il disegno — entro /);
    assert.equal(az.gravita, 'media');
  });
});

describe('L\'esito delle misure', () => {
  const misura = c => Object.assign({ id: 'k1', kind: 'misura', nominal: '', tolMin: '', tolMax: '', value: '' }, c);
  it('senza limiti una misura non passa da sola: l\'esito si sceglie', () => {
    const a = app();
    assert.equal(a.eval(`qcCheckEsito(${JSON.stringify(misura({ value: '20.01' }))})`), '');
    assert.equal(a.eval(`qcCheckEsito(${JSON.stringify(misura({ value: '20.01', verdict: 'ok' }))})`), 'ok');
    assert.equal(a.eval(`qcCheckEsito(${JSON.stringify(misura({ verdict: 'ko' }))})`), 'ko', 'anche senza valore scritto');
    assert.equal(a.eval(`qcEsitoSuggerito({ checks: [${JSON.stringify(misura({ value: '20' }))}] })`), '', 'finché manca la scelta non si propone niente');
  });
  it('con i limiti decide il calcolo, e la scelta a mano lo corregge segnandolo', () => {
    const a = app();
    const fuori = misura({ nominal: 20, tolMin: 0, tolMax: 0.021, value: '20.03' });
    assert.equal(a.eval(`qcCheckEsito(${JSON.stringify(fuori)})`), 'ko');
    const forzata = Object.assign({}, fuori, { verdict: 'ok' });
    assert.equal(a.eval(`qcCheckEsito(${JSON.stringify(forzata)})`), 'ok');
    assert.equal(a.eval(`qcCheckForzato(${JSON.stringify(forzata)})`), true);
    assert.equal(a.eval(`qcCheckForzato(${JSON.stringify(Object.assign({}, fuori, { verdict: 'ko' }))})`), false);
  });
  it('il messaggio del piano compare quando il collaudo dice di respingere', () => {
    const a = app(base({ piani: [piano({ failMessage: 'Separare il lotto', characteristics: [{ id: 'k1', name: 'Diametro', kind: 'misura', nominal: 20, tolMin: -0.05, tolMax: 0.05, uom: 'mm' }] })] }));
    a.eval('ordSetLine("o1","l1","received","100")');
    const x = J(a, 'qcTutti()[0]');
    assert.equal(a.eval(`qcCollaudoFuori(qcGet(${JSON.stringify(x.id)}))`), false);
    a.eval(`qcSetCheck(${JSON.stringify(x.id)}, "k1", "20.2")`);
    assert.equal(a.eval(`qcCollaudoFuori(qcGet(${JSON.stringify(x.id)}))`), true);
    assert.match(a.eval(`qcControlloHtml(qcGet(${JSON.stringify(x.id)}), "pz", true)`), /qc-fail-msg[^>]*>[\s\S]*Separare il lotto/);
    a.eval(`qcSetVerdetto(${JSON.stringify(x.id)}, "k1", "ok")`);
    assert.equal(a.eval(`qcCollaudoFuori(qcGet(${JSON.stringify(x.id)}))`), false, 'corretto a mano, il messaggio sparisce');
  });
});

describe('I QR della qualità', () => {
  const col = (id, stato, quando) => ({ id, number: 'COL-2026-001', source: 'oda', orderId: 'o1', lineId: 'l1', itemId: 'c1', qty: 10, uom: 'pz',
    supplierId: 's1', date: '2026-03-01', status: stato, esito: stato === 'chiuso' ? 'accettato' : '', active: true, createdAt: quando });
  it('il numero porta al collaudo aperto prima, al più recente poi', () => {
    const a = app(base({ collaudi: [col('x1', 'chiuso', '2026-03-02'), col('x2', 'aperto', '2026-03-01'), col('x3', 'chiuso', '2026-03-03')] }));
    assert.equal(a.eval('qrResolve("col", "COL-2026-001").rec.id'), 'x2');
    assert.deepEqual(J(a, 'qrParse("https://app/#/q/col/COL-2026-001")'), { tipo: 'col', codice: 'COL-2026-001' });
  });
  it('NC per numero, piano per id, e la scheda rapida di ognuno', () => {
    const a = app(base({ piani: [piano()], nc: [{ id: 'n1', number: 'NC-2026-001', source: 'fornitore', itemId: 'c1', supplierId: 's1', status: 'aperta',
      actions: [{ id: 'a1', text: 'Chiedere 8D', who: 'Acquisti', due: '2026-04-01', done: false }], active: true }] }));
    assert.equal(a.eval('qrResolve("nc", "nc-2026-001").rec.id'), 'n1');
    assert.equal(a.eval('qrResolve("pc", "p1").rec.id'), 'p1');
    assert.equal(a.eval('qrResolve("", "p1")'), null, 'un id nudo non apre un piano');
    assert.match(a.eval('qrSchedaHtml("nc", ncGet("n1"))'), /Chiedere 8D/);
    assert.match(a.eval('qrSchedaHtml("pc", qcPianoGet("p1"))'), /Nessun collaudo aperto/);
  });
  it('il cartellino dice lo stato e porta il QR del collaudo', () => {
    const a = app(base({ collaudi: [col('x2', 'aperto', '2026-03-01')] }));
    const t = J(a, 'qrEtichettaTesti("col", qcGet("x2"))');
    assert.equal(t.codice, 'IN COLLAUDO · COL-2026-001');
    assert.match(a.eval('qrSchedaHtml("col", qcGet("x2"))'), /Collauda/);
    assert.equal(a.eval('qrCodiceDi("col", qcGet("x2"))'), 'COL-2026-001');
  });
});
