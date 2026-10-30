// Modulo Varianti (dalla 0.119.0, pagina sua dalla 0.120.0): la macchina
// modello con le sue opzioni, le righe che valgono solo per certe scelte e il
// configuratore che genera la macchina concreta.
//
// Quello che qui si fissa:
//   - condizioni e formule si leggono senza eval, e un errore si nomina;
//   - le regole stanno solo sulle righe del modello, cioè sui gruppi del primo
//     livello: dentro un gruppo non valgono, e la pagina offre di toglierle;
//   - il modello non si pianifica, e il suo costo è quello della parte comune;
//   - la macchina generata è un articolo come gli altri e usa i gruppi del
//     modello così come sono, senza copie;
//   - quando il modello cambia lo si dice, e Rigenera riallinea;
//   - tutto si gestisce dalla pagina Tecnico → Varianti;
//   - a modulo spento non cambia niente.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, asm, comp } = require('./fixtures.js');

const riga = (itemId, qty, extra) => Object.assign(comp(itemId, qty), extra || {});

// Il nastro: lunghezza 3/4/5 m e motore standard o maggiorato. I gruppi sono
// tutti fissi; il modello sceglie quali e quanti.
//   mod  — il modulo da un metro (2 m di profilo, 2 viti): ce ne sono L;
//   trss — la trasmissione col motore standard, trsb con quello maggiorato;
//   fis  — il gruppo fisso, che c'è sempre;
//   prt  — la protezione, solo sul nastro da 5 m.
function app(opz) {
  const o = opz || {};
  const a = loadApp({ silent: true });
  a.asRole('admin');
  a.setDb(makeDb({
    settings: { overheadPct: 0, marginPct: 0, currency: '€', modules: { varianti: o.spento ? false : true } },
    items: [
      acq('mots', 300), acq('motb', 450), acq('cus', 10), acq('vite', 1), acq('pro', 50),
      Object.assign(mat('prof', 10), { uom: 'm' }),
      asm('mod', 'gruppo', { components: [comp('prof', 2), comp('vite', 2)] }),
      asm('trss', 'gruppo', { components: [comp('mots', 1), comp('cus', 2)] }),
      asm('trsb', 'gruppo', { components: [comp('motb', 1), comp('cus', 2)] }),
      asm('fis', 'gruppo', { components: [comp('vite', 10)] }),
      asm('prt', 'gruppo', { components: [comp('pro', 1)] }),
      asm('mac', 'macchina', {
        options: [
          { code: 'L', name: 'Lunghezza', choices: [{ value: '3', label: '3 m' }, { value: '4', label: '4 m' }, { value: '5', label: '5 m' }] },
          { code: 'M', name: 'Motore', choices: [{ value: 'S', label: 'standard' }, { value: 'B', label: 'maggiorato' }] },
        ],
        components: [riga('mod', 3, { qtyExpr: 'L' }), riga('trss', 1, { cond: 'M=S' }), riga('trsb', 1, { cond: 'M=B' }),
          comp('fis', 1), riga('prt', 1, { cond: 'L=5' })],
      }),
      asm('mac2', 'macchina', { components: [comp('fis', 1)] }),
    ],
    plans: [{ id: 'pl1', number: 'FAB-1', title: 'p', date: '2026-07-01', active: true, lines: [] }],
  }));
  return a;
}
const ev = (a, js) => JSON.parse(a.eval(`(invalidateCaches(), JSON.stringify(${js}))`));
const genera = (a, scelte) => ev(a, `(() => { const r = varGenera('mac', ${JSON.stringify(scelte)}); return r && { id: r.item.id, code: r.item.code, riusata: r.riusata }; })()`);
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
  it('una tabella dà la quantità per scelta, anche per le opzioni a lettere', () => {
    const a = app();
    assert.equal(ev(a, "varQtyValuta('M(S=2; B=3)', { M: 'B' })"), 3);
    assert.equal(ev(a, "varQtyValuta('M(S=2, B=3)', { M: 's' })"), 2);
    assert.equal(ev(a, "varQtyValuta('M(S=2)', { M: 'B' })"), 0, 'una scelta che non c\'è vale 0');
    assert.equal(ev(a, "varQtyValuta('L(3=1,4=2,5=2,5)', { L: '5' })"), 2.5, 'la virgola separa se dopo viene una chiave');
    assert.equal(ev(a, "varQtyValuta('L*M(S=1; B=2)+1', { L: '4', M: 'B' })"), 9);
    assert.deepEqual(ev(a, "varFormulaCodici('L*M(S=1; B=2)')"), ['L', 'M']);
    assert.deepEqual(ev(a, "varFormulaTabelle('L(3=1,4=2) + M(S=1; B=2)')"), [{ code: 'L', valori: ['3', '4'] }, { code: 'M', valori: ['S', 'B'] }]);
    const err = js => ev(a, `(() => { try { ${js}; return null; } catch (e) { return e.message; } })()`);
    assert.match(err("varQtyValuta('M*2', { M: 'B' })"), /usa una tabella, per esempio M\(B=2\)/);
    assert.match(err("varQtyValuta('M(S 2)', { M: 'B' })"), /ci vuole «=»/);
    assert.match(err("varQtyValuta('M(S=2', { M: 'B' })"), /parentesi chiusa/);
    assert.equal(ev(a, "varControllaRiga('', 'M(S=2; B=3)')"), null);
  });
  it('dalla pagina una tabella con una scelta che il modello non ha si rifiuta', () => {
    const a = app();
    a.eval("varRegolaSet('mac', 1, 'qtyExpr', 'M(S=2; X=3)')");
    assert.equal(ev(a, "getItem('mac').components[1].qtyExpr || null"), null);
    a.eval("varRegolaSet('mac', 1, 'qtyExpr', 'M(s=2; B=3)')");
    assert.equal(ev(a, "getItem('mac').components[1].qtyExpr"), 'M(s=2; B=3)');
    assert.equal(ev(a, "varCostoScelte('mac', { L: '3', M: 'S' }).total"), 66 + 640 + 10);
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
    assert.equal(ev(app(), "varModello(getItem('mac2'))"), false);
    assert.equal(ev(app(), "varModello(getItem('fis'))"), false);
    assert.equal(ev(app({ spento: true }), "varModello(getItem('mac'))"), false);
  });
  it('il suo costo è quello della parte comune; l\'intervallo dice da quanto a quanto', () => {
    const a = app();
    // Comune: solo il gruppo fisso, 10 viti. I moduli a formula non contano
    // finché non si sceglie.
    assert.equal(ev(a, "costOf('mac').total"), 10);
    // Minimo: 3 m standard = 3×22 + 320 + 10. Massimo: 5 m maggiorato con la
    // protezione = 5×22 + 470 + 10 + 50.
    assert.deepEqual(ev(a, "varIntervalloCosto(getItem('mac'))"), { min: 396, max: 640, n: 6 });
  });
  it('non si mette in un piano: si configura', () => {
    const a = app();
    a.eval("planAddLines('pl1', ['mac', 'fis'])");
    assert.deepEqual(ev(a, "getPlan('pl1').lines.map(l => l.itemId)"), ['fis']);
  });
});

describe('Il configuratore', () => {
  it('genera la macchina con i gruppi del modello, senza copiarli', () => {
    const a = app();
    const n = ev(a, 'db.items.length');
    const r = genera(a, { L: '4', M: 'B' });
    assert.equal(r.code, 'MAC-V01');
    assert.equal(r.riusata, false);
    assert.equal(ev(a, 'db.items.length'), n + 1, 'nasce solo la macchina');
    assert.deepEqual(righe(a, r.id), [['MOD', 4], ['TRSB', 1], ['FIS', 1]], 'la protezione non c\'è');
    const m = ev(a, `getItem('${r.id}')`);
    assert.equal(m.configuredFromId, 'mac');
    assert.deepEqual(m.configChoices, { L: '4', M: 'B' });
    assert.match(m.name, /4 m, maggiorato/);
  });
  it('la stessa combinazione non si genera due volte', () => {
    const a = app();
    const r1 = genera(a, { L: '4', M: 'B' });
    const n = ev(a, 'db.items.length');
    const r2 = genera(a, { l: '4', M: 'b' });
    assert.equal(r2.id, r1.id);
    assert.equal(r2.riusata, true);
    assert.equal(ev(a, 'db.items.length'), n);
    assert.equal(genera(a, { L: '4', M: 'S' }).code, 'MAC-V02');
  });
  it('la macchina generata costa quanto il configuratore aveva detto, ed è un articolo normale', () => {
    const a = app();
    const r = genera(a, { L: '5', M: 'B' });
    assert.equal(ev(a, `costOf('${r.id}').total`), 640);
    assert.equal(ev(a, `costOf('${r.id}').total`), ev(a, "varCostoScelte('mac', { L: '5', M: 'B' }).total"));
    assert.equal(ev(a, `varRichiedeScelte(getItem('${r.id}'))`), false);
    a.eval(`planAddLines('pl1', ['${r.id}'])`);
    const buy = ev(a, "Object.fromEntries(mrpExplodePlan(getPlan('pl1')).buy.map(e => [e.item.id, e.qty]))");
    assert.deepEqual(buy, { prof: 10, vite: 20, motb: 1, cus: 2, pro: 1 });
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
    a.eval("getItem('mac').components.push({ itemId: 'prt', qty: 1, scrapPct: 0, cond: 'X=1' })");
    const e = ev(a, "varPrepara('mac', { L: '4', M: 'S' }).errori");
    assert.equal(e.length, 1);
    assert.match(e[0], /^riga 6 \(PRT\): l'opzione X non esiste/);
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

describe('Le regole stanno sul primo livello', () => {
  it('dentro un gruppo una condizione non vale: la riga conta sempre', () => {
    const a = app();
    a.eval("getItem('trsb').components[0].cond = 'M=S'; saveDB()");
    assert.equal(ev(a, "costOf('trsb').total"), 470);
    const r = genera(a, { L: '3', M: 'B' });
    assert.equal(ev(a, `costOf('${r.id}').total`), 66 + 470 + 10);
    assert.equal(ev(a, "varTagRiga(getItem('trsb').components[0], getItem('trsb'))"), '', 'e la distinta del gruppo non la mostra');
  });
  it('la pagina le elenca e le toglie', () => {
    const a = app();
    a.eval("getItem('trsb').components[0].cond = 'M=S'; getItem('mac2').components[0].qtyExpr = 'L'; saveDB()");
    assert.deepEqual(ev(a, 'varRegoleFuoriPosto().map(x => x.code).sort()'), ['MAC2', 'TRSB']);
    a.eval("varTogliCondizioni('trsb'); confirmYes()");
    assert.deepEqual(ev(a, 'varRegoleFuoriPosto().map(x => x.code)'), ['MAC2']);
    assert.equal(ev(a, "getItem('trsb').components[0].cond || null"), null);
    a.eval("setView('varianti')");
    assert.match(a.html('var-body'), /Condizioni fuori posto/);
  });
  it('una regola si scrive dalla pagina, e un\'opzione che non c\'è si rifiuta', () => {
    const a = app();
    a.eval("varRegolaSet('mac', 3, 'cond', 'M=S|B')");
    assert.equal(ev(a, "getItem('mac').components[3].cond"), 'M=S|B');
    a.eval("varRegolaSet('mac', 3, 'cond', 'X=1')");
    assert.equal(ev(a, "getItem('mac').components[3].cond"), 'M=S|B');
    a.eval("varRegolaSet('mac', 3, 'cond', 'M=')");
    assert.equal(ev(a, "getItem('mac').components[3].cond"), 'M=S|B', 'neanche una sintassi sbagliata');
    a.eval("varRegolaSet('mac', 3, 'qtyExpr', 'L*2')");
    assert.equal(ev(a, "getItem('mac').components[3].qtyExpr"), 'L*2');
    a.eval("varRegolaSet('mac', 3, 'cond', '')");
    assert.equal(ev(a, "'cond' in getItem('mac').components[3]"), false, 'vuota vuol dire sempre');
  });
});

describe('Il modello cambia', () => {
  it('la macchina generata lo sa, e Rigenera riscrive la sua distinta', () => {
    const a = app();
    const r = genera(a, { L: '4', M: 'B' });
    assert.equal(ev(a, `varModelloAggiornato(getItem('${r.id}'))`), false);
    a.eval("getItem('mac').components[3].qty = 2; saveDB()");
    assert.equal(ev(a, `varModelloAggiornato(getItem('${r.id}'))`), true);
    assert.deepEqual(ev(a, 'varGenerateDaAggiornare().map(x => x.code)'), ['MAC-V01']);
    a.eval(`varRigeneraUI(['${r.id}']); confirmYes()`);
    assert.equal(ev(a, `getItem('${r.id}').code`), 'MAC-V01', 'la macchina resta la stessa');
    assert.deepEqual(righe(a, r.id), [['MOD', 4], ['TRSB', 1], ['FIS', 2]]);
    assert.equal(ev(a, `varModelloAggiornato(getItem('${r.id}'))`), false);
  });
  it('Rigenera tutte prende più macchine insieme', () => {
    const a = app();
    const r1 = genera(a, { L: '3', M: 'S' }), r2 = genera(a, { L: '5', M: 'B' });
    a.eval("getItem('mac').components[0].qtyExpr = 'L+1'; saveDB()");
    a.eval("varRigeneraTutte('mac'); confirmYes()");
    assert.deepEqual(righe(a, r1.id)[0], ['MOD', 4]);
    assert.deepEqual(righe(a, r2.id)[0], ['MOD', 6]);
    assert.deepEqual(ev(a, 'varGenerateDaAggiornare()'), []);
  });
  it('un gruppo che cambia dentro non chiede di rigenerare: è lo stesso articolo', () => {
    const a = app();
    const r = genera(a, { L: '4', M: 'B' });
    a.eval("getItem('fis').components[0].qty = 12; saveDB()");
    assert.equal(ev(a, `varModelloAggiornato(getItem('${r.id}'))`), false);
    assert.equal(ev(a, `costOf('${r.id}').total`), ev(a, "varCostoScelte('mac', { L: '4', M: 'B' }).total"));
  });
});

describe('La pagina Varianti', () => {
  it('sta sotto Tecnico, e solo a modulo acceso', () => {
    const a = app();
    a.eval("setView('varianti')");
    assert.match(a.html('sub-nav'), />Varianti</);
    assert.match(a.html('var-body'), /Opzioni.*Regole.*Configura.*Varianti generate/s);
    const b = app({ spento: true });
    b.eval("setView('bom')");
    assert.doesNotMatch(b.html('sub-nav'), />Varianti</);
  });
  it('un modello nuovo nasce da una macchina che c\'è già', () => {
    const a = app();
    a.eval("varNuovoModello('mac2')");
    assert.deepEqual(ev(a, "getItem('mac2').options"), [{ code: 'A', name: '', choices: [] }]);
    assert.equal(ev(a, 'currentVarId'), 'mac2');
    assert.equal(ev(a, "varModello(getItem('mac2'))"), false, 'finché non ha scelte non si configura');
    assert.deepEqual(ev(a, 'varModelli().map(x => x.id)'), ['mac', 'mac2'], 'ma è già nella pagina');
  });
  it('le opzioni si scrivono dalla pagina', () => {
    const a = app();
    a.eval("varOpzioneAggiungi('mac')");
    a.eval("varOpzioneSet('mac', 2, 'code', 'p'); varOpzioneSet('mac', 2, 'name', 'Protezione')");
    a.eval("varSceltaAggiungi('mac', 2); varSceltaSet('mac', 2, 0, 'value', 'S'); varSceltaSet('mac', 2, 0, 'label', 'sì')");
    a.eval("varSceltaAggiungi('mac', 2); varSceltaSet('mac', 2, 1, 'value', 's')");
    assert.equal(ev(a, "getItem('mac').options[2].choices[1].value"), '', 'un valore già usato non si accetta');
    a.eval("varSceltaSet('mac', 2, 1, 'value', 'N'); varSceltaSet('mac', 2, 1, 'label', 'no'); varSceltaAggiungi('mac', 2)");
    assert.deepEqual(ev(a, "getItem('mac').options[2]"), { code: 'P', name: 'Protezione', choices: [{ value: 'S', label: 'sì' }, { value: 'N', label: 'no' }, { value: '', label: '' }] });
    assert.equal(ev(a, "varOpzioni(getItem('mac'))[2].choices.length"), 2, 'la scelta ancora vuota non conta');
    a.eval("varSceltaTogli('mac', 2, 2)");
    assert.equal(ev(a, "getItem('mac').options[2].choices.length"), 2);
    a.eval("varOpzioneSet('mac', 2, 'code', 'L')");
    assert.equal(ev(a, "getItem('mac').options[2].code"), 'P', 'un codice già usato non si accetta');
  });
  it('fuori dalla pagina restano solo segni, nessun comando', () => {
    const a = app();
    assert.match(ev(a, "varRigaBom(getItem('mac'))"), /Modello configurabile.*varApri\('mac'\)/s);
    assert.match(ev(a, "varTagRiga(getItem('mac').components[4], getItem('mac'))"), /se L=5/);
    const r = genera(a, { L: '3', M: 'S' });
    assert.match(ev(a, `varRigaBom(getItem('${r.id}'))`), /Generata da MAC con 3 m, standard/);
    assert.equal(ev(a, "varRigaBom(getItem('mac2'))"), '');
    const ins = ev(a, "inspSchedeArticolo(getItem('mac')).map(s => s.id).concat(inspAzioniArticolo(getItem('mac')).map(c => c.label || c.testo || ''))");
    assert.equal(ins.includes('varianti'), false);
    assert.equal(ins.some(x => /Configura|Rigenera/.test(x)), false);
  });
});

// 0.129.0: un modello e le macchine generate si riconoscono negli elenchi,
// nei selettori e nella scheda, non solo nella pagina Varianti.
describe('Modelli e varianti si riconoscono', () => {
  it('l\'elenco degli articoli segna il modello e la variante, con un rimando alla pagina', () => {
    const a = app();
    const r = genera(a, { L: '3', M: 'S' });
    assert.match(ev(a, "catalogRow(getItem('mac'), 'design')"), /var-mark-link[^>]*varApri\('mac'\)[^>]*>modello</);
    assert.match(ev(a, `catalogRow(getItem('${r.id}'), 'design')`), /varApri\('mac'\)[^>]*>variante di MAC</);
    assert.doesNotMatch(ev(a, "catalogRow(getItem('mac2'), 'design')"), /var-mark/, 'una macchina normale non ha segni');
    assert.doesNotMatch(ev(a, "catalogRow(getItem('fis'), 'design')"), /var-mark/);
  });
  it('nei selettori il segno c\'è ma non porta altrove, e nei menu è testo', () => {
    const a = app();
    assert.match(ev(a, "itemBadges(getItem('mac'))"), />modello</);
    assert.doesNotMatch(ev(a, "itemBadges(getItem('mac'))"), /onclick/);
    assert.equal(ev(a, "itemBadgesTxt(getItem('mac'))"), '[modello] ');
    const r = genera(a, { L: '4', M: 'B' });
    assert.equal(ev(a, `itemBadgesTxt(getItem('${r.id}'))`), '[variante di MAC] ');
  });
  it('la scheda dice che cos\'è e da dove si gestisce', () => {
    const a = app();
    const r = genera(a, { L: '3', M: 'S' });
    assert.match(ev(a, "itemInfoHtml(getItem('mac'))"), /Varianti.*Modello.*non si produce.*1 macchina generata/s);
    assert.match(ev(a, `itemInfoHtml(getItem('${r.id}'))`), /Generata dal modello.*MAC.*con 3 m, standard/s);
    assert.doesNotMatch(ev(a, "itemInfoHtml(getItem('mac2'))"), /info-key">Varianti/);
  });
  it('tolte tutte le opzioni il segno sparisce, e a modulo spento non c\'è', () => {
    const a = app();
    a.eval("varOpzioneTogli('mac', 1); varOpzioneTogli('mac', 0); confirmYes();");
    assert.equal(ev(a, "varMarca(getItem('mac'))"), '');
    const b = app({ spento: true });
    assert.equal(ev(b, "varMarca(getItem('mac')) + itemBadgesTxt(getItem('mac'))"), '');
  });
});

describe('A modulo spento', () => {
  it('le righe condizionate contano come righe normali e niente è un modello', () => {
    const a = app({ spento: true });
    // Tutto sommato: 3 moduli (la quantità scritta), le due trasmissioni, il
    // gruppo fisso, la protezione.
    assert.equal(ev(a, "costOf('mac').total"), 66 + 320 + 470 + 10 + 50);
    assert.equal(ev(a, "varRichiedeScelte(getItem('mac'))"), false);
    assert.equal(ev(a, "varRigaBom(getItem('mac'))"), '');
    assert.equal(ev(a, "varTagRiga(getItem('mac').components[4], getItem('mac'))"), '');
    assert.deepEqual(ev(a, 'varRegoleFuoriPosto()'), []);
    a.eval("planAddLines('pl1', ['mac'])");
    assert.deepEqual(ev(a, "getPlan('pl1').lines.map(l => l.itemId)"), ['mac']);
  });
});

describe('La codifica è quella del modello', () => {
  it('la variante eredita famiglia, sigla e schema, e li segue quando il modello cambia', () => {
    const a = app();
    a.eval("Object.assign(getItem('mac'), { familyId: 'f1', subFamilyId: 's1', sigla: 'NST', gCodeLen: 3, gCodeType: 'alpha', incrDigitsS: 2, incrDigitsN: 3 })");
    const r = genera(a, { L: '3', M: 'S' });
    const campi = "(({ familyId, subFamilyId, sigla, gCodeLen, gCodeType, incrDigitsS, incrDigitsN }) => ({ familyId, subFamilyId, sigla, gCodeLen, gCodeType, incrDigitsS, incrDigitsN }))";
    assert.deepEqual(ev(a, `${campi}(getItem('${r.id}'))`), ev(a, `${campi}(getItem('mac'))`));
    a.eval("getItem('mac').sigla = 'NSX'; delete getItem('mac').subFamilyId; varEreditaCodifica(getItem('mac'))");
    assert.equal(ev(a, `getItem('${r.id}').sigla`), 'NSX');
    assert.equal(ev(a, `'subFamilyId' in getItem('${r.id}')`), false);
  });
  it('una variante nata senza codifica la prende aprendo la scheda o la pagina', () => {
    const a = app();
    const r = genera(a, { L: '3', M: 'S' });
    a.eval("getItem('mac').sigla = 'NST'");
    a.eval(`editItemModal('${r.id}')`);
    assert.equal(ev(a, `getItem('${r.id}').sigla`), 'NST');
    a.eval("getItem('mac').sigla = 'NSX'; setView('varianti')");
    assert.equal(ev(a, `getItem('${r.id}').sigla`), 'NSX');
  });
  it('nella scheda è bloccata, e non conta come un\'altra macchina con la stessa sigla', () => {
    const a = app();
    a.eval("getItem('mac').sigla = 'NST'");
    const r = genera(a, { L: '3', M: 'S' });
    const lock = ev(a, `itemLockState(getItem('${r.id}'))`);
    assert.equal(lock.structLocked, true);
    assert.equal(lock.ereditata, true);
    assert.match(ev(a, `itemLockNote(itemLockState(getItem('${r.id}')))`), /Variante generata da un modello/);
    assert.deepEqual(ev(a, 'machineItems().map(m => m.id)'), ['mac', 'mac2']);
  });
});

describe('Gli esempi', () => {
  it('la sezione Regole li apre in una finestra, con le formule che il parser accetta', () => {
    const a = app();
    a.eval("setView('varianti')");
    assert.match(a.html('var-body'), /varEsempiModal\(\)/);
    a.eval('globalThis.__m = ""; openModal = h => { __m = h; }; varEsempiModal()');
    assert.match(a.eval('__m'), /M\(S=2; B=3\)/);
    // Ogni esempio deve funzionare davvero: un esempio sbagliato insegna l'errore.
    const scelte = { L: '4', M: 'B', P: 'SI' };
    ev(a, 'VAR_ESEMPI_QTY.map(r => r[0])').forEach(f => assert.equal(typeof ev(a, `varQtyValuta(${JSON.stringify(f)}, ${JSON.stringify(scelte)})`), 'number', f));
    ev(a, 'VAR_ESEMPI_COND.map(r => r[0])').filter(c => c !== '(vuoto)').forEach(c => assert.doesNotThrow(() => ev(a, `varCondParse(${JSON.stringify(c)})`), c));
  });
});

describe('La sezione Opzioni', () => {
  it('si richiude e dice le opzioni in una riga, e si riapre', () => {
    const a = app();
    a.eval("setView('varianti')");
    assert.match(a.html('var-body'), /var-opz-grid/);
    a.eval("varOpzioniApriChiudi('mac')");
    const h = a.html('var-body');
    assert.doesNotMatch(h, /var-opz-grid/);
    assert.match(h, /aria-expanded="false"/);
    assert.match(h, /Lunghezza: 3 m, 4 m, 5 m/);
    assert.doesNotMatch(h, /\+ Opzione/);
    a.eval("varOpzioniApriChiudi('mac')");
    assert.match(a.html('var-body'), /var-opz-grid/);
  });
});
