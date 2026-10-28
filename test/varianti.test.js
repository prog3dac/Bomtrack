// Modulo Varianti (dalla 0.119.0): la macchina modello con le sue opzioni, le
// righe che valgono solo per certe scelte e il configuratore che genera la
// macchina concreta.
//
// Quello che qui si fissa:
//   - condizioni e formule si leggono senza eval, e un errore si nomina;
//   - il modello non si pianifica, e il suo costo è quello della parte comune;
//   - la macchina generata è un articolo come gli altri: piano e costo la
//     leggono senza sapere che è nata da un modello;
//   - un gruppo che non cambia con le scelte è lo stesso del modello, uno che
//     cambia diventa un derivato, e i derivati uguali si riusano;
//   - quando il modello cambia lo si dice, e Rigenera riallinea;
//   - a modulo spento non cambia niente.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, asm, comp } = require('./fixtures.js');

const riga = (itemId, qty, extra) => Object.assign(comp(itemId, qty), extra || {});

// Il nastro: lunghezza 3/4/5 m e motore standard o maggiorato.
//   tel  — il telaio: il profilo è lungo 2×L metri, le viti sono sempre 4;
//   trs  — la trasmissione: un motore o l'altro, e due cuscinetti;
//   fis  — il gruppo fisso, che non cambia mai;
//   pro  — la protezione, solo sul nastro da 5 m.
function app(opz) {
  const o = opz || {};
  const a = loadApp({ silent: true });
  a.asRole('admin');
  a.setDb(makeDb({
    settings: { overheadPct: 0, marginPct: 0, currency: '€', modules: { varianti: o.spento ? false : true } },
    items: [
      acq('mots', 300), acq('motb', 450), acq('cus', 10), acq('vite', 1), acq('pro', 50),
      Object.assign(mat('prof', 10), { uom: 'm' }),
      asm('tel', 'gruppo', { components: [riga('prof', 3, { qtyExpr: 'L*2' }), comp('vite', 4)] }),
      asm('trs', 'gruppo', { components: [riga('mots', 1, { cond: 'M=S' }), riga('motb', 1, { cond: 'M=B' }), comp('cus', 2)] }),
      asm('fis', 'gruppo', { components: [comp('vite', 10)] }),
      asm('mac', 'macchina', {
        options: [
          { code: 'L', name: 'Lunghezza', choices: [{ value: '3', label: '3 m' }, { value: '4', label: '4 m' }, { value: '5', label: '5 m' }] },
          { code: 'M', name: 'Motore', choices: [{ value: 'S', label: 'standard' }, { value: 'B', label: 'maggiorato' }] },
        ],
        components: [comp('tel', 1), comp('trs', 1), comp('fis', 1), riga('pro', 1, { cond: 'L=5' })],
      }),
    ],
    plans: [{ id: 'pl1', number: 'FAB-1', title: 'p', date: '2026-07-01', active: true, lines: [] }],
  }));
  return a;
}
const ev = (a, js) => JSON.parse(a.eval(`(invalidateCaches(), JSON.stringify(${js}))`));
const genera = (a, scelte) => ev(a, `(() => { const r = varGenera('mac', ${JSON.stringify(scelte)}); return r && { id: r.item.id, code: r.item.code, riusata: r.riusata, nuovi: r.nuovi.map(n => n.code) }; })()`);
const righe = (a, id) => ev(a, `getItem(${JSON.stringify(id)}).components.map(c => [getItem(c.itemId).code, c.qty])`);

describe('Condizioni e formule', () => {
  it('una condizione si legge per clausole, con le alternative e la negazione', () => {
    const a = app();
    assert.deepEqual(ev(a, "varCondParse('L=3|4 & m!=B')"), [{ code: 'L', neg: false, valori: ['3', '4'] }, { code: 'M', neg: true, valori: ['B'] }]);
    assert.equal(ev(a, "varCondVale(varCondParse('L=3|4 & M!=B'), { L: '4', M: 'S' })"), true);
    assert.equal(ev(a, "varCondVale(varCondParse('L=3|4 & M!=B'), { L: '4', M: 'B' })"), false);
    assert.equal(ev(a, "varCondVale(varCondParse('L=5'), { L: '4', M: 'B' })"), false);
  });
  it('la formula fa i conti con le scelte numeriche, virgola compresa', () => {
    const a = app();
    assert.equal(ev(a, "varQtyValuta('L*2+0,5', { L: '3' })"), 6.5);
    assert.equal(ev(a, "varQtyValuta('(L + 1) / 2', { L: '5' })"), 3);
    assert.equal(ev(a, "varQtyValuta('-L+10', { L: '4' })"), 6);
  });
  it('un errore si dice con parole, non con un\'eccezione di JavaScript', () => {
    const a = app();
    const err = js => ev(a, `(() => { try { ${js}; return null; } catch (e) { return e.message; } })()`);
    assert.match(err("varQtyValuta('L*', { L: '3' })"), /incompleta/);
    assert.match(err("varQtyValuta('X*2', { L: '3' })"), /opzione X non esiste/);
    assert.match(err("varQtyValuta('M*2', { M: 'B' })"), /non è un numero/);
    assert.match(err("varQtyValuta('alert(1)', { L: '3' })"), /opzione ALERT non esiste/);
    assert.match(err("varCondParse('L')"), /non si capisce/);
  });
  it('la scheda della riga controlla la sintassi prima di salvare', () => {
    const a = app();
    assert.equal(ev(a, "varControllaRiga('L=3|4', 'L*2')"), null);
    assert.match(ev(a, "varControllaRiga('L 3', '')"), /^Condizione/);
    assert.match(ev(a, "varControllaRiga('', '2*(L')"), /^Quantità.*parentesi/);
  });
});

describe('Il modello', () => {
  it('è una macchina con opzioni, e solo a modulo acceso', () => {
    assert.equal(ev(app(), "varModello(getItem('mac'))"), true);
    assert.equal(ev(app(), "varModello(getItem('fis'))"), false);
    assert.equal(ev(app({ spento: true }), "varModello(getItem('mac'))"), false);
  });
  it('si sa quali gruppi cambiano con le scelte', () => {
    const a = app();
    assert.deepEqual(['tel', 'trs', 'fis', 'mac'].map(id => ev(a, `varToccato('${id}')`)), [true, true, false, true]);
  });
  it('il suo costo è quello della parte comune; l\'intervallo dice da quanto a quanto', () => {
    const a = app();
    // Comune: 4 viti + 2 cuscinetti + 10 viti = 4 + 20 + 10. Il profilo a
    // formula non conta finché non si sceglie.
    assert.equal(ev(a, "costOf('mac').total"), 34);
    // Minimo: 3 m standard = 34 + 60 di profilo + 300. Massimo: 5 m maggiorato
    // con la protezione = 34 + 100 + 450 + 50.
    assert.deepEqual(ev(a, "varIntervalloCosto(getItem('mac'))"), { min: 394, max: 634, n: 6 });
  });
  it('non si mette in un piano: si configura', () => {
    const a = app();
    a.eval("planAddLines('pl1', ['mac', 'fis'])");
    assert.deepEqual(ev(a, "getPlan('pl1').lines.map(l => l.itemId)"), ['fis']);
    a.eval("planAddLines('pl1', ['tel'])");
    assert.deepEqual(ev(a, "getPlan('pl1').lines.map(l => l.itemId)"), ['fis'], 'anche un gruppo con righe variabili');
  });
});

describe('Il configuratore', () => {
  it('genera la macchina, i gruppi derivati dove cambia qualcosa e riusa il resto', () => {
    const a = app();
    const r = genera(a, { L: '4', M: 'B' });
    assert.equal(r.code, 'MAC-V01');
    assert.equal(r.riusata, false);
    assert.deepEqual(r.nuovi.sort(), ['MAC-V01', 'TEL-V01', 'TRS-V01']);
    assert.deepEqual(righe(a, r.id), [['TEL-V01', 1], ['TRS-V01', 1], ['FIS', 1]], 'il gruppo fisso è quello del modello, la protezione non c\'è');
    const tel = ev(a, "getItemByCode('TEL-V01').id");
    assert.deepEqual(righe(a, tel), [['PROF', 8], ['VITE', 4]]);
    assert.deepEqual(righe(a, ev(a, "getItemByCode('TRS-V01').id")), [['MOTB', 1], ['CUS', 2]]);
    const m = ev(a, `getItem('${r.id}')`);
    assert.equal(m.configuredFromId, 'mac');
    assert.deepEqual(m.configChoices, { L: '4', M: 'B' });
    assert.match(m.name, /4 m, maggiorato/);
    assert.equal(ev(a, `getItem('${tel}').name`), 'Assieme tel — 4 m', 'il nome del derivato dice solo le scelte che lo riguardano');
  });
  it('la stessa combinazione non si genera due volte', () => {
    const a = app();
    const r1 = genera(a, { L: '4', M: 'B' });
    const n = ev(a, 'db.items.length');
    const r2 = genera(a, { l: '4', M: 'b' });
    assert.equal(r2.id, r1.id);
    assert.equal(r2.riusata, true);
    assert.equal(ev(a, 'db.items.length'), n);
  });
  it('un gruppo derivato uguale a uno già fatto si riusa', () => {
    const a = app();
    genera(a, { L: '4', M: 'B' });
    const r = genera(a, { L: '4', M: 'S' });
    assert.equal(r.code, 'MAC-V02');
    assert.deepEqual(r.nuovi.sort(), ['MAC-V02', 'TRS-V02'], 'il telaio da 4 m c\'era già');
    assert.deepEqual(righe(a, r.id), [['TEL-V01', 1], ['TRS-V02', 1], ['FIS', 1]]);
  });
  it('la macchina generata costa quanto il configuratore aveva detto, ed è un articolo normale', () => {
    const a = app();
    const r = genera(a, { L: '5', M: 'B' });
    assert.equal(ev(a, `costOf('${r.id}').total`), 634);
    assert.equal(ev(a, `costOf('${r.id}').total`), ev(a, "varCostoScelte('mac', { L: '5', M: 'B' }).total"));
    assert.equal(ev(a, `varRichiedeScelte(getItem('${r.id}'))`), false);
    a.eval(`planAddLines('pl1', ['${r.id}'])`);
    const buy = ev(a, "Object.fromEntries(mrpExplodePlan(getPlan('pl1')).buy.map(e => [e.item.id, e.qty]))");
    assert.deepEqual(buy, { prof: 10, vite: 14, motb: 1, cus: 2, pro: 1 });
  });
  it('una scelta che manca o non esiste ferma la generazione', () => {
    const a = app();
    const n = ev(a, 'db.items.length');
    assert.match(ev(a, "varPrepara('mac', { L: '4' }).errori[0]"), /Motore: scegli/);
    assert.match(ev(a, "varPrepara('mac', { L: '7', M: 'S' }).errori[0]"), /«7» non è fra le scelte/);
    assert.equal(genera(a, { L: '7', M: 'S' }), null);
    assert.equal(ev(a, 'db.items.length'), n);
  });
  it('una riga che cita un\'opzione che il modello non ha si nomina', () => {
    const a = app();
    a.eval("getItem('fis').components.push({ itemId: 'pro', qty: 1, scrapPct: 0, cond: 'X=1' })");
    const e = ev(a, "varPrepara('mac', { L: '4', M: 'S' }).errori");
    assert.equal(e.length, 1);
    assert.match(e[0], /^FIS, riga 2: l'opzione X non esiste/);
  });
  it('il codice dei generati segue lo schema -V e non risulta fuori schema', () => {
    const a = app();
    const prima = ev(a, 'codiciFuoriSchema().map(i => i.code)');
    genera(a, { L: '3', M: 'S' });
    assert.deepEqual(ev(a, 'codiciFuoriSchema().map(i => i.code)'), prima);
  });
  it('un codice preso da un collega si salta', () => {
    const a = app();
    a.eval("_codiciAltrui.add('mac-v01')");
    assert.equal(genera(a, { L: '3', M: 'S' }).code, 'MAC-V02');
  });
  it('il riferimento al modello è dichiarato in REFS', () => {
    assert.equal(ev(app(), 'REFS.items.fields.configuredFromId'), 'item');
  });
});

describe('Il modello cambia', () => {
  it('la macchina generata lo sa, e Rigenera riscrive la sua distinta', () => {
    const a = app();
    const r = genera(a, { L: '4', M: 'B' });
    assert.equal(ev(a, `varModelloAggiornato(getItem('${r.id}'))`), false);
    a.eval("getItem('tel').components[1].qty = 6; saveDB()");
    assert.equal(ev(a, `varModelloAggiornato(getItem('${r.id}'))`), true);
    assert.deepEqual(ev(a, 'varGenerateDaAggiornare().map(x => x.code)'), ['MAC-V01']);
    a.eval(`varRigenera('${r.id}')`);
    assert.equal(ev(a, `getItem('${r.id}').code`), 'MAC-V01', 'la macchina resta la stessa');
    assert.deepEqual(righe(a, r.id), [['TEL-V02', 1], ['TRS-V01', 1], ['FIS', 1]], 'nuovo telaio, la trasmissione non è cambiata');
    assert.deepEqual(righe(a, ev(a, "getItemByCode('TEL-V02').id")), [['PROF', 8], ['VITE', 6]]);
    assert.equal(ev(a, `varModelloAggiornato(getItem('${r.id}'))`), false);
  });
  it('un gruppo fisso che cambia non chiede di rigenerare: è lo stesso articolo', () => {
    const a = app();
    const r = genera(a, { L: '4', M: 'B' });
    a.eval("getItem('fis').components[0].qty = 12; saveDB()");
    assert.equal(ev(a, `varModelloAggiornato(getItem('${r.id}'))`), false);
    assert.equal(ev(a, `costOf('${r.id}').total`), ev(a, "varCostoScelte('mac', { L: '4', M: 'B' }).total"));
  });
});

describe('Le schermate', () => {
  it('la distinta del modello dice che è un modello e l\'intervallo di costo', () => {
    const a = app();
    assert.match(ev(a, "varBannerBom(getItem('mac'))"), /Modello configurabile.*da € 394,00 a € 634,00 su 6 combinazioni/s);
    assert.match(ev(a, "varTagRiga(getItem('mac').components[3])"), /se L=5/);
  });
  it('il pannello laterale ha la scheda Varianti sulle macchine, a modulo acceso', () => {
    const conta = a => ev(a, "inspSchedeArticolo(getItem('mac')).map(s => s.id)").includes('varianti');
    assert.equal(conta(app()), true);
    assert.equal(conta(app({ spento: true })), false);
  });
  it('le opzioni si scrivono dalla scheda del modello', () => {
    const a = app();
    a.eval("varOpzioneAggiungi('mac')");
    a.eval("varOpzioneSet('mac', 2, 'code', 'p'); varOpzioneSet('mac', 2, 'name', 'Protezione'); varOpzioneSet('mac', 2, 'choices', 'S = sì; N = no; S')");
    assert.deepEqual(ev(a, "getItem('mac').options[2]"), { code: 'P', name: 'Protezione', choices: [{ value: 'S', label: 'sì' }, { value: 'N', label: 'no' }] });
    a.eval("varOpzioneSet('mac', 2, 'code', 'L')");
    assert.equal(ev(a, "getItem('mac').options[2].code"), 'P', 'un codice già usato non si accetta');
  });
});

describe('A modulo spento', () => {
  it('le righe condizionate contano come righe normali e niente è un modello', () => {
    const a = app({ spento: true });
    // Tutto sommato: 3 m di profilo (la quantità scritta), 4 viti, i due
    // motori, 2 cuscinetti, 10 viti, la protezione.
    assert.equal(ev(a, "costOf('mac').total"), 30 + 4 + 300 + 450 + 20 + 10 + 50);
    assert.equal(ev(a, "varRichiedeScelte(getItem('mac'))"), false);
    assert.equal(ev(a, "varBannerBom(getItem('mac'))"), '');
    assert.equal(ev(a, "varTagRiga(getItem('mac').components[3])"), '');
    a.eval("planAddLines('pl1', ['mac'])");
    assert.deepEqual(ev(a, "getPlan('pl1').lines.map(l => l.itemId)"), ['mac']);
  });
});
