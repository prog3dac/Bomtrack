// Il codice articolo scritto a mano (dalla 0.115.0).
//
// Il codice nasce dalle scelte della scheda e di regola resta quello. Fino
// alla 0.114.0 bastava digitare nel campo perché l'app smettesse di generarlo,
// senza lasciare traccia: un codice cambiato per sbaglio non si distingueva
// più da un'eccezione voluta, come RTT-S00 per una macchina di sigla MAX.
// Ora serve la spunta «Manuale», con una conferma, e l'articolo lo ricorda.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || makeDb());
  a.asRole('admin');
  return a;
}
const macchina = (id, sigla, code, o) => Object.assign({ id, code, name: 'Macchina ' + id, type: 'macchina', uom: 'pz',
  sigla, components: [], operations: [], active: true }, o || {});
const gruppo = (id, mac, sigla, code) => ({ id, code, name: 'Gruppo ' + id, type: 'gruppo', uom: 'pz',
  machineItemId: mac, sigla, components: [], operations: [], active: true });
const ev = (a, code) => JSON.parse(a.eval(`JSON.stringify(${code})`));

describe('Codice fuori codifica', () => {
  it('la macchina RTT-S00 di sigla MAX non segue la codifica; MAX-S00 sì', () => {
    const a = app(makeDb({ items: [macchina('k1', 'MAX', 'RTT-S00'), macchina('k2', 'TRN', 'TRN-S03')] }));
    assert.equal(a.eval('codiceFuoriSchema(getItem("k1"))'), true);
    assert.equal(a.eval('codiceFuoriSchema(getItem("k2"))'), false);
    assert.equal(a.eval('codiceAtteso(getItem("k1"))'), 'MAX-S');
  });

  it('i figli nascono dalla sigla, non dal codice manuale del padre', () => {
    const a = app(makeDb({ items: [macchina('k1', 'MAX', 'RTT-S00', { codeManual: true })] }));
    assert.equal(a.eval('genItemCode({ type: "gruppo", machineItemId: "k1", sigla: "BAS" })'), 'MAX-BAS-S00');
    assert.equal(a.eval('codiceFuoriSchema({ type: "gruppo", machineItemId: "k1", sigla: "BAS", code: "MAX-BAS-S00" })'), false);
  });

  it('per famiglia: prefisso e numero, maiuscole indifferenti', () => {
    const a = app(makeDb({
      families: [{ id: 'f1', name: 'Acciaio', kind: 'materiale', sigla: 'ACC', subs: [] }],
      items: [Object.assign(mat('m1', 1), { familyId: 'f1', code: 'mat-acc-007' }),
        Object.assign(mat('m2', 1), { familyId: 'f1', code: 'MAT-ACC-7B' }),
        Object.assign(mat('m3', 1), { familyId: 'f1', code: 'ACCIAIO-1' })],
    }));
    assert.equal(a.eval('codiceFuoriSchema(getItem("m1"))'), false);
    assert.equal(a.eval('codiceFuoriSchema(getItem("m2"))'), true);
    assert.equal(a.eval('codiceFuoriSchema(getItem("m3"))'), true);
  });

  it('senza le scelte che lo compongono non c\'è codifica da rispettare', () => {
    const a = app(makeDb({ items: [macchina('k1', '', 'QUALSIASI'), gruppo('g1', '', 'BAS', 'LIBERO')] }));
    assert.equal(a.eval('codiceFuoriSchema(getItem("k1"))'), false);
    assert.equal(a.eval('codiceFuoriSchema(getItem("g1"))'), false);
  });

  it('l\'elenco di Gestione tralascia i codici dichiarati manuali', () => {
    const a = app(makeDb({ items: [macchina('k1', 'MAX', 'RTT-S00'), macchina('k2', 'BRT', 'XYZ-S00', { codeManual: true })] }));
    assert.deepEqual(ev(a, 'codiciFuoriSchema().map(i => i.id)'), ['k1']);
  });

  it('«È voluto» lo segna manuale, con chi e quando', () => {
    const a = app(makeDb({ items: [macchina('k1', 'MAX', 'RTT-S00')] }));
    a.eval('confermaCodiceManuale("k1")');
    assert.equal(a.eval('getItem("k1").codeManual'), undefined, 'prima della risposta non cambia niente');
    a.eval('confirmYes()');
    const it = ev(a, 'getItem("k1")');
    assert.equal(it.codeManual, true);
    assert.ok(it.codeManualAt);
    assert.equal(it.code, 'RTT-S00');
    assert.deepEqual(ev(a, 'codiciFuoriSchema().map(i => i.id)'), []);
  });
});

describe('La spunta «Manuale» nella scheda', () => {
  function apriNuova(a) {
    a.eval('itemCodeAuto = true');
    a.el('it-type').value = 'macchina';
    a.el('it-sigla-mac').value = 'MAX';
    a.el('it-name').value = 'Rettificatrice';
    a.el('it-uom').value = 'pz';
    a.el('it-code-manual').checked = false;
    a.eval('window.__dupSourceId = null; window.__editingItemId = null');
    a.eval('refreshItemCode()');
  }

  it('il codice si compone da solo finché non si spunta', () => {
    const a = app();
    apriNuova(a);
    assert.equal(a.el('it-code').value, 'MAX-S00');
  });

  it('il clic chiede conferma e non cambia niente finché non si risponde Sì', () => {
    const a = app();
    apriNuova(a);
    const cb = a.el('it-code-manual');
    cb.checked = true;                                  // come lo lascia il clic
    assert.equal(a.eval('codeManualClick(document.getElementById("it-code-manual"))'), false,
      'false annulla il clic: la spunta cambia solo con la risposta');
    assert.equal(a.eval('itemCodeAuto'), true);
    a.eval('confirmNo()');
    assert.equal(a.eval('itemCodeAuto'), true, 'con No resta automatico');
    cb.checked = true;
    a.eval('codeManualClick(document.getElementById("it-code-manual"))');
    a.eval('confirmYes()');
    assert.equal(a.eval('itemCodeAuto'), false);
    assert.equal(cb.checked, true);
    assert.equal(a.el('it-code').readOnly, false);
  });

  it('il codice manuale si salva con chi, quando e il motivo', () => {
    const a = app();
    apriNuova(a);
    a.eval('setCodeManual(true)');
    a.el('it-code').value = 'RTT-S00';
    a.el('it-code-note').value = 'sigla commerciale';
    a.eval('saveNewItem()');
    const it = ev(a, 'db.items.find(i => i.code === "RTT-S00")');
    assert.ok(it, 'l\'articolo nasce con il codice scritto');
    assert.equal(it.codeManual, true);
    assert.equal(it.codeNote, 'sigla commerciale');
    assert.ok(it.codeManualAt);
  });

  it('senza spunta l\'articolo nasce automatico, senza motivo', () => {
    const a = app();
    apriNuova(a);
    a.el('it-code-note').value = 'non dovrebbe restare';
    a.eval('saveNewItem()');
    const it = ev(a, 'db.items.find(i => i.code === "MAX-S00")');
    assert.equal(it.codeManual, false);
    assert.equal(it.codeNote, undefined);
  });

  it('spuntato e lasciato vuoto non si salva', () => {
    const a = app();
    apriNuova(a);
    a.eval('setCodeManual(true)');
    a.el('it-code').value = '';
    a.eval('saveNewItem()');
    assert.equal(a.snapshot().items.length, 0);
  });

  it('togliendo la spunta in modifica torna il codice automatico', () => {
    const a = app(makeDb({ items: [macchina('k1', 'MAX', 'RTT-S00', { codeManual: true, codeManualAt: '2026-01-01T00:00:00.000Z', codeNote: 'x' })] }));
    a.eval('window.__editingItemId = "k1"; itemCodeAuto = false');
    a.el('it-type').value = 'macchina';
    a.el('it-sigla-mac').value = 'MAX';
    a.el('it-name').value = 'Macchina k1';
    a.el('it-uom').value = 'pz';
    a.el('it-code').value = 'RTT-S00';
    a.eval('setCodeManual(false)');
    assert.equal(a.el('it-code').value, 'MAX-S00');
    a.eval('saveItemEdit("k1")');
    const it = ev(a, 'getItem("k1")');
    assert.equal(it.code, 'MAX-S00');
    assert.equal(it.codeManual, false);
    assert.equal(it.codeManualAt, undefined);
    assert.equal(it.codeNote, undefined);
  });

  it('in modifica un codice ancora coerente non si rinumera', () => {
    const a = app(makeDb({ items: [macchina('k1', 'MAX', 'MAX-S04'), macchina('k2', 'MAX', 'MAX-S07')] }));
    a.eval('window.__editingItemId = "k1"; itemCodeAuto = true');
    a.el('it-type').value = 'macchina';
    a.el('it-sigla-mac').value = 'MAX';
    a.eval('refreshItemCode()');
    assert.equal(a.el('it-code').value, 'MAX-S04', 'rigenerare darebbe MAX-S08, non il suo');
  });
});

describe('Anteprima dei codici figli', () => {
  const righe = (a, d, c) => ev(a, `anteprimaCodiciFigli(${JSON.stringify(d)}, ${JSON.stringify(c)})`);

  it('macchina: lo schema dei figli con sigla e cifre scelte', () => {
    const a = app();
    const r = righe(a, { type: 'macchina', sigla: 'TRN', gCodeLen: 3, gCodeType: 'alpha', incrDigitsS: 2, incrDigitsN: 3 }, 'TRN-S00');
    assert.deepEqual(r.righe.map(x => x.codice), ['TRN-S00', 'TRN-AAA-S00', 'TRN-AAA-001', 'TRN-AAA-999']);
    assert.deepEqual(r.avvisi, []);
    const n = righe(a, { type: 'macchina', sigla: 'TRN', gCodeLen: 2, gCodeType: 'num', incrDigitsS: 3, incrDigitsN: 4 }, '');
    assert.deepEqual(n.righe.map(x => x.codice), ['TRN-S000', 'TRN-00-S000', 'TRN-00-0001', 'TRN-00-9999']);
  });

  it('macchina con codice manuale: avvisa che i figli seguono la sigla', () => {
    const a = app();
    const r = righe(a, { type: 'macchina', sigla: 'MAX' }, 'RTT-S00');
    assert.equal(r.righe[1].codice, 'MAX-AAA-S00');
    assert.match(r.avvisi[0], /seguono la sigla MAX/);
  });

  it('gruppo: i primi codici liberi, contando i figli che ci sono già', () => {
    const a = app(makeDb({ items: [macchina('k1', 'TRN', 'TRN-S00'), gruppo('g1', 'k1', 'BAS', 'TRN-BAS-S00'),
      { id: 'p1', code: 'TRN-BAS-001', name: 'P', type: 'parte', uom: 'pz', machineItemId: 'k1', groupItemId: 'g1', cycle: [], active: true }] }));
    const nuovo = righe(a, { type: 'gruppo', machineItemId: 'k1', sigla: 'BAS' }, 'TRN-BAS-S01');
    assert.deepEqual(nuovo.righe.map(x => x.codice), ['TRN-BAS-S01', 'TRN-BAS-002', 'TRN-BAS-999'],
      'stessa sigla, stesso prefisso: la prima parte libera è la 002');
    const altro = righe(a, { type: 'gruppo', machineItemId: 'k1', sigla: 'TEL' }, 'TRN-TEL-S00');
    assert.equal(altro.righe[1].codice, 'TRN-TEL-001');
  });

  it('gruppo: sigla cambiata con figli già creati, e macchina dal codice manuale', () => {
    const a = app(makeDb({ items: [macchina('k1', 'MAX', 'RTT-S00', { codeManual: true }), gruppo('g1', 'k1', 'BAS', 'MAX-BAS-S00'),
      { id: 'p1', code: 'MAX-BAS-001', name: 'P', type: 'parte', uom: 'pz', machineItemId: 'k1', groupItemId: 'g1', cycle: [], active: true }] }));
    const r = righe(a, { id: 'g1', type: 'gruppo', machineItemId: 'k1', sigla: 'TEL' }, 'MAX-TEL-S00');
    assert.ok(r.avvisi.some(t => /RTT-S00 \(manuale\)/.test(t)));
    assert.ok(r.avvisi.some(t => /1 codici figli già creati restano/.test(t)));
  });

  it('senza le scelte necessarie dice cosa manca, e per gli altri tipi non c\'è', () => {
    const a = app(makeDb({ items: [macchina('k1', '', 'K1')] }));
    assert.match(righe(a, { type: 'macchina', sigla: '' }, '').avvisi[0], /sigla macchina/);
    assert.match(righe(a, { type: 'gruppo', machineItemId: '', sigla: 'BAS' }, '').avvisi[0], /Scegli la macchina/);
    assert.match(righe(a, { type: 'gruppo', machineItemId: 'k1', sigla: 'BAS' }, '').avvisi[0], /non ha sigla/);
    assert.equal(a.eval('anteprimaCodiciFigli({ type: "parte" }, "")'), null);
  });
});
