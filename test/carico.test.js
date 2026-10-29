// Carico dei centri di lavoro: le ore che i piani chiedono, per settimana,
// contro la capacita' dichiarata sul centro.
//
// Due cose vanno tenute ferme sopra a tutte. La prima e' l'aritmetica delle
// settimane ISO, che una implementazione ingenua sbaglia una volta l'anno e in
// silenzio. La seconda e' la promessa su cui regge la deroga al «niente
// time-phasing»: il carico **non tocca il netting**. C'e' un caso apposta.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, parte, asm, comp, wc } = require('./fixtures.js');

// Perno con due fasi interne (tornitura 0,5 h, fresatura 0,25 h) e una esterna.
// Il gruppo ne monta tre e ha una sua operazione di montaggio.
//
// Dalla 0.88.0 le ore stanno nella settimana in cui la fase **comincia**, a
// ritroso dalla consegna (montaggio un giorno, fresatura uno, tornitura uno):
// la consegna è un venerdì perché tutta la catena resti nella W40, e i casi di
// questo file continuino a parlare di secchielli e non di programmazione — per
// quella c'è test/schedulazione.test.js.
function conDb(over) {
  const app = loadApp({ silent: true });
  app.asRole('admin');
  app.setDb(makeDb(Object.assign({
    suppliers: [{ id: 'beta', name: 'Beta', active: true }],
    workCenters: [
      Object.assign(wc('tor', 40), { capacityHours: 40 }),
      Object.assign(wc('fre', 45), { capacityHours: 0 }),
      Object.assign(wc('mon', 30), { capacityHours: 40 }),
      Object.assign(wc('zin', 30), { capacityHours: 40 }),
    ],
    items: [
      Object.assign(mat('tondo', 5), { uom: 'kg' }),
      parte('perno', { sourcing: 'make', uom: 'pz', cycle: [
        { kind: 'item', itemId: 'tondo', qty: 2 },
        { kind: 'op', workCenterId: 'tor', supplierId: '', costMode: 'orario', hours: 0.5, rate: 40, note: '' },
        { kind: 'op', workCenterId: 'fre', supplierId: '', costMode: 'fisso', cost: 9, hours: 0.25, note: '' },
        { kind: 'op', workCenterId: 'zin', supplierId: 'beta', costMode: 'fisso', cost: 3, hours: 0.1, note: '' },
      ] }),
      asm('grp', 'gruppo', { components: [comp('perno', 3)], operations: [{ workCenterId: 'mon', hours: 2, note: '' }] }),
    ],
    plans: [{ id: 'pl1', number: 'FAB-2026-001', title: 'Lotto', date: '2026-07-01', notes: '',
      lines: [{ id: 'l1', itemId: 'grp', qty: 2, dueDate: '2026-10-02' }], active: true }],
  }, over || {})));
  return app;
}
// La tavola in oggetti del realm di Node: le Map non sopravvivono a JSON.
const tavola = (app, expr) => JSON.parse(app.eval(`(() => {
  const t = ${expr};
  return JSON.stringify({ settimane: t.settimane, righe: t.righe.map(r => ({
    wc: r.workCenterId, name: r.name, capacity: r.capacity, totale: r.totale,
    celle: Array.from(r.celle.entries()).map(([wk, c]) => [wk, { hours: c.hours, sat: c.sat, over: c.over, voci: c.voci.length }]),
  })) });
})()`));
const cella = (t, wcId, wk) => {
  const r = t.righe.find(x => x.wc === wcId);
  const c = r && r.celle.find(([k]) => k === wk);
  return c ? c[1] : null;
};

describe('Settimane ISO', () => {
  const w = (app, iso) => app.eval(`settimanaISO(${JSON.stringify(iso)})`);

  it('il 1 gennaio di un anno che comincia di venerdi sta nella W53 precedente', () => {
    // 2021-01-01 era un venerdi: per la regola del giovedi appartiene al 2020.
    assert.equal(w(conDb(), '2021-01-01'), '2020-W53');
  });

  it('il 31 dicembre puo stare nella prima settimana dell anno dopo', () => {
    // 2019-12-31 era un martedi, e il primo giovedi di quella settimana e' il
    // 2 gennaio 2020: settimana 1 del 2020.
    assert.equal(w(conDb(), '2019-12-31'), '2020-W01');
  });

  it('una data qualunque cade nella sua settimana', () => {
    assert.equal(w(conDb(), '2026-09-30'), '2026-W40');
  });

  it('data vuota: nessuna settimana, non quella corrente', () => {
    assert.equal(w(conDb(), ''), '');
    assert.equal(w(conDb(), 'non una data'), '');
  });

  it('il lunedi si calcola in UTC, senza slittare al giorno prima', () => {
    const app = conDb();
    assert.equal(app.eval("inizioSettimana('2026-09-30')"), '2026-09-28');
    assert.equal(app.eval("lunediDiSettimana('2026-W40')"), '2026-09-28');
    // Un lunedi resta se stesso: e' il caso in cui uno slittamento di fuso si
    // vedrebbe subito, perche' cambierebbe settimana.
    assert.equal(app.eval("inizioSettimana('2026-09-28')"), '2026-09-28');
  });

  it('l etichetta di colonna dice anche di che giorni si parla', () => {
    assert.equal(conDb().eval("settimanaLabel('2026-W40')"), 'W40 · 28/09');
    assert.equal(conDb().eval("settimanaLabel('')"), 'Senza data');
  });
});

describe('Carico: da dove vengono le ore', () => {
  it('le fasi interne caricano il loro centro, ore per pezzo per pezzi', () => {
    const t = tavola(conDb(), "mrpLoad(getPlan('pl1'))");
    approx(cella(t, 'tor', '2026-W40').hours, 3, '0,5 h x 6 perni');
    approx(cella(t, 'fre', '2026-W40').hours, 1.5, '0,25 h x 6 perni');
  });

  it('le operazioni di un assieme caricano con la quantita dell assieme', () => {
    const t = tavola(conDb(), "mrpLoad(getPlan('pl1'))");
    approx(cella(t, 'mon', '2026-W40').hours, 4, '2 h x 2 gruppi');
  });

  it('le fasi in conto lavoro non caricano nessun centro interno', () => {
    const t = tavola(conDb(), "mrpLoad(getPlan('pl1'))");
    assert.equal(t.righe.find(r => r.wc === 'zin'), undefined,
      'la zincatura e da un terzista: sta nel fabbisogno, non nel carico');
  });

  it('una parte acquistata non carica: quelle ore le fa il fornitore', () => {
    const app = conDb();
    app.eval("getItem('perno').sourcing = 'buy'; invalidateCaches();");
    const t = tavola(app, "mrpLoad(getPlan('pl1'))");
    assert.equal(t.righe.find(r => r.wc === 'tor'), undefined);
    approx(cella(t, 'mon', '2026-W40').hours, 4, 'il montaggio del gruppo resta');
  });

  it('una fase a zero ore non crea una riga vuota', () => {
    const app = conDb();
    app.eval("getItem('perno').cycle[1].hours = 0; invalidateCaches();");
    const t = tavola(app, "mrpLoad(getPlan('pl1'))");
    assert.equal(t.righe.find(r => r.wc === 'tor'), undefined);
  });

  it('due fasi sullo stesso centro nella stessa settimana si sommano', () => {
    const app = conDb();
    app.eval("getItem('perno').cycle[2].workCenterId = 'tor'; invalidateCaches();");
    const t = tavola(app, "mrpLoad(getPlan('pl1'))");
    approx(cella(t, 'tor', '2026-W40').hours, 4.5, '3 + 1,5');
    assert.equal(cella(t, 'tor', '2026-W40').voci, 2, 'il dettaglio resta a due voci');
  });

  it('gli scarti di distinta entrano nel moltiplicatore', () => {
    const app = conDb();
    app.eval("getItem('grp').components[0].scrapPct = 10; invalidateCaches();");
    const t = tavola(app, "mrpLoad(getPlan('pl1'))");
    approx(cella(t, 'tor', '2026-W40').hours, 3.3, '0,5 h x 6,6 perni');
  });
});

describe('Carico: i secchielli settimanali', () => {
  it('righe di piano con date diverse finiscono in settimane diverse', () => {
    const app = conDb();
    app.eval("getPlan('pl1').lines.push({ id: 'l2', itemId: 'grp', qty: 1, dueDate: '2026-08-07' });");
    const t = tavola(app, "mrpLoad(getPlan('pl1'))");
    assert.deepEqual(t.settimane, ['2026-W32', '2026-W40']);
    approx(cella(t, 'mon', '2026-W32').hours, 2);
    approx(cella(t, 'mon', '2026-W40').hours, 4);
  });

  it('una riga senza data finisce in un secchiello dichiarato, in testa', () => {
    const app = conDb();
    app.eval("getPlan('pl1').lines[0].dueDate = '';");
    const t = tavola(app, "mrpLoad(getPlan('pl1'))");
    assert.deepEqual(t.settimane, ['']);
    approx(cella(t, 'mon', '').hours, 4, 'le ore ci sono: non avere una data non le cancella');
  });

  it('il modo predefinito somma tutti i piani aperti', () => {
    const app = conDb();
    app.eval(`db.plans.push({ id: 'pl2', number: 'FAB-2026-002', title: '', date: '2026-07-01',
      notes: '', lines: [{ id: 'l9', itemId: 'grp', qty: 1, dueDate: '2026-10-02' }], active: true });`);
    approx(cella(tavola(app, 'mrpLoadAll()'), 'mon', '2026-W40').hours, 6, '4 + 2');
  });

  it('un piano chiuso non carica piu niente', () => {
    const app = conDb();
    app.eval("getPlan('pl1').active = false;");
    assert.deepEqual(tavola(app, 'mrpLoadAll()').righe, []);
  });
});

describe('Carico: capacita e sovraccarico', () => {
  it('capacita non dichiarata: nessuna saturazione, nessun sovraccarico', () => {
    // Zero significa «non dichiarata», non «nessuna capacita»: senza questa
    // distinzione ogni centro esistente sarebbe sfondato dal primo giorno.
    const c = cella(tavola(conDb(), "mrpLoad(getPlan('pl1'))"), 'fre', '2026-W40');
    assert.equal(c.sat, null);
    assert.equal(c.over, 0);
  });

  it('sotto capacita: saturazione calcolata, sovraccarico zero', () => {
    const c = cella(tavola(conDb(), "mrpLoad(getPlan('pl1'))"), 'mon', '2026-W40');
    approx(c.sat, 0.1, '4 h su 40');
    assert.equal(c.over, 0);
  });

  // Le ore al giorno sono dichiarate: ricavate da 3 h a settimana sarebbero
  // 0,6 al giorno, e il montaggio durerebbe sette giorni scivolando nella W39.
  it('sopra capacita: sovraccarico in ore e saturazione oltre il 100%', () => {
    const app = conDb();
    app.eval("getWorkCenter('mon').capacityHours = 3; getWorkCenter('mon').hoursPerDay = 8; invalidateCaches();");
    const c = cella(tavola(app, "mrpLoad(getPlan('pl1'))"), 'mon', '2026-W40');
    approx(c.over, 1, '4 h chieste su 3 di capacita');
    approx(c.sat, 4 / 3);
  });

  it('il riepilogo nomina settimana e centri sfondati', () => {
    const app = conDb();
    app.eval("getWorkCenter('mon').capacityHours = 3; getWorkCenter('mon').hoursPerDay = 8; invalidateCaches();");
    const ov = JSON.parse(app.eval(`JSON.stringify(mrpLoadOverload(mrpLoad(getPlan('pl1')))
      .map(o => ({ week: o.week, centri: o.centri.map(c => c.name) })))`));
    assert.deepEqual(ov, [{ week: '2026-W40', centri: ['CDL mon'] }]);
  });
});

describe('Carico: il patto con il fabbisogno materiale', () => {
  it('il carico non tocca il netting: gli stessi numeri, prima e dopo', () => {
    // E' la promessa su cui regge la deroga al «niente time-phasing»: il carico
    // e' un prospetto derivato, e se domani lo si cancellasse il resto dell'app
    // non se ne accorgerebbe. Qui si verifica che leggerlo non muova nulla.
    const app = conDb();
    const prima = app.eval(`JSON.stringify(mrpBuyRows(getPlan('pl1'), true)
      .map(r => ({ c: r.item.code, q: r.qtyOrder, n: r.net, a: r.amount })))`);
    app.eval("mrpLoad(getPlan('pl1')); mrpLoadAll();");
    const dopo = app.eval(`JSON.stringify(mrpBuyRows(getPlan('pl1'), true)
      .map(r => ({ c: r.item.code, q: r.qtyOrder, n: r.net, a: r.amount })))`);
    assert.equal(dopo, prima);
  });

  it('nessun documento nasce dal carico', () => {
    // planDocRows e' cio' che puo' diventare una riga di documento: acquisti e
    // fasi esterne. Le ore interne non ci sono, e non devono esserci.
    const app = conDb();
    const chiavi = JSON.parse(app.eval(`JSON.stringify(planDocRows(getPlan('pl1')).map(planRowKey))`));
    assert.ok(!chiavi.some(k => String(k).includes('tor')), 'una fase interna e finita fra le righe di documento');
  });
});

describe('Carico: export in forma lunga', () => {
  it('una riga per coppia centro/settimana, con lunedi e saturazione', () => {
    const app = conDb();
    const spec = JSON.parse(app.eval('JSON.stringify(loadExportSpec())'));
    const righe = spec.sezioni[0].righe;
    assert.equal(righe.length, 3, 'tre centri interni caricati, una settimana');
    const mon = righe.find(r => r[0] === 'CDL mon');
    assert.deepEqual(mon, ['CDL mon', '2026-W40', '2026-09-28', 4, 40, 10, 0]);
  });

  it('un centro senza capacita esce con le celle vuote, non con uno zero finto', () => {
    const app = conDb();
    const righe = JSON.parse(app.eval('JSON.stringify(loadExportSpec().sezioni[0].righe)'));
    const fre = righe.find(r => r[0] === 'CDL fre');
    assert.equal(fre[4], '', 'capacita');
    assert.equal(fre[5], '', 'saturazione');
  });
});

// ══════════════════════════════════════════════════════════════
//  I codici che quelle ore le producono, e il grafico
// ══════════════════════════════════════════════════════════════
// «7 ore alla tornitura in W40» non si puo' verificare: senza sapere su quanti
// pezzi e con quali fasi, e' un numero da credere sulla parola. Questi casi
// provano che il numero si scomponga, e che il grafico dica **la stessa cosa**
// della tavola — un disegno che raccontasse un'altra storia sarebbe peggio di
// nessun disegno.
describe('Carico: i codici da produrre', () => {
  const codici = (app, centro) => JSON.parse(app.eval(
    `JSON.stringify(mrpLoadItems(mrpLoadEntries(db.plans.filter(p => p.active !== false)), ${JSON.stringify(centro || '')})
      .map(r => ({ code: r.code, week: r.week, qty: r.qty, hours: +r.hours.toFixed(3),
        fasi: r.fasi.map(f => ({ no: f.faseNo, wc: f.wcName, hUnit: f.hoursUnit, qty: f.qty, h: +f.hours.toFixed(3) })) })))`));

  it('un codice porta i suoi pezzi e le sue fasi, non solo le ore', () => {
    const perno = codici(conDb()).find(x => x.code === 'PERNO');
    assert.equal(perno.week, '2026-W40');
    assert.equal(perno.qty, 6, '2 gruppi x 3 perni');
    assert.deepEqual(perno.fasi.map(f => [f.no, f.wc, f.hUnit]),
      [[10, 'CDL tor', 0.5], [20, 'CDL fre', 0.25]]);
  });

  it('i pezzi non si sommano fra le fasi: ogni fase lavora gli stessi', () => {
    const perno = codici(conDb()).find(x => x.code === 'PERNO');
    assert.equal(perno.qty, 6, 'sei pezzi, non dodici');
    approx(perno.hours, 4.5, 'le ore invece si sommano: (0,5 + 0,25) x 6');
  });

  it('le fasi si leggono in ordine di ciclo', () => {
    assert.deepEqual(codici(conDb()).find(x => x.code === 'PERNO').fasi.map(f => f.no), [10, 20]);
  });

  it('le fasi in conto lavoro non compaiono: quelle ore le fa il terzista', () => {
    assert.ok(!codici(conDb()).find(x => x.code === 'PERNO').fasi.some(f => f.wc === 'CDL zin'));
  });

  it('un assieme entra con le fasi del suo ciclo, numerate come quelle di una parte', () => {
    const grp = codici(conDb()).find(x => x.code === 'GRP');
    assert.equal(grp.qty, 2);
    approx(grp.hours, 4, '2 h di montaggio per due gruppi');
    assert.deepEqual(grp.fasi.map(f => f.no), [10], 'dalla 0.124.0 il montaggio è la fase 10 del ciclo dell assieme');
  });

  it('il filtro per centro restringe i codici alle sue fasi', () => {
    const soloFre = codici(conDb(), 'fre');
    assert.deepEqual(soloFre.map(x => x.code), ['PERNO'], 'il gruppo non passa dalla fresatura');
    assert.deepEqual(soloFre[0].fasi.map(f => f.wc), ['CDL fre']);
    approx(soloFre[0].hours, 1.5, 'solo le ore di quel centro');
  });

  it('due piani sullo stesso codice e settimana sommano i pezzi', () => {
    const app = conDb();
    app.eval(`db.plans.push({ id: 'pl2', number: 'FAB-2026-002', title: '', date: '2026-07-02', notes: '',
      lines: [{ id: 'l2', itemId: 'grp', qty: 1, dueDate: '2026-10-02' }], active: true, jobId: null });
      invalidateCaches();`);
    assert.equal(codici(app).find(x => x.code === 'PERNO').qty, 9, '6 dal primo piano, 3 dal secondo');
  });

  it('i totali dei codici tornano con quelli della tavola', () => {
    const app = conDb();
    const daCodici = codici(app).reduce((s, r) => s + r.hours, 0);
    const daTavola = Number(app.eval('mrpLoadTable(mrpLoadEntries(db.plans)).righe.reduce((s, r) => s + r.totale, 0)'));
    approx(daCodici, daTavola, 'le due letture guardano le stesse ore');
  });
});

describe('Carico: il grafico dice la stessa cosa della tavola', () => {
  const disegno = (over) => {
    const app = conDb();
    if (over) app.eval(over + '; invalidateCaches();');
    app.eval("setView('load')");
    return app.html('view-load');
  };

  it('una barra per ogni settimana con carico, e nessuna per le altre', () => {
    // Tre centri interni caricati, una settimana sola: tre barre.
    assert.equal((disegno().match(/<rect /g) || []).length, 3);
  });

  it('la barra porta il suo numero: il disegno non sostituisce la cifra', () => {
    assert.match(disegno(), /<title>W40 · 28\/09: 3 h su 40 h \(8%\)<\/title>/);
  });

  it('sotto l 85% il colore resta neutro, come la cella', () => {
    assert.match(disegno(), /<rect [^>]*fill="var\(--accent\)"/);
  });

  it('sopra il 100% la barra e rossa', () => {
    const h = disegno("getWorkCenter('tor').capacityHours = 1; getWorkCenter('tor').hoursPerDay = 8");
    assert.match(h, /<rect [^>]*fill="var\(--red\)"/);
  });

  it('la linea della capacita c e quando la capacita c e', () => {
    const h = disegno();
    assert.match(h, /stroke-dasharray/);
    assert.match(h, /capacità 40 h/);
  });

  it('senza capacita dichiarata niente linea e nessun colore d allarme', () => {
    // La fresatura ha capacita' 0 nel fixture: e' l'unico blocco senza linea.
    const h = disegno("db.workCenters.forEach(w => { w.capacityHours = 0; })");
    assert.ok(!/stroke-dasharray/.test(h), 'non c e niente con cui confrontare le ore');
    assert.ok(!/fill="var\(--red\)"/.test(h) && !/fill="var\(--orange\)"/.test(h));
    assert.match(h, /capacità non dichiarata/);
  });

  it('ogni blocco si presenta a chi il disegno non lo vede', () => {
    assert.match(disegno(), /role="img" aria-label="CDL tor, 1 settimana, nessun sovraccarico"/);
  });

  it('l etichetta dice dove sfonda, non solo che sfonda', () => {
    assert.match(disegno("getWorkCenter('tor').capacityHours = 1; getWorkCenter('tor').hoursPerDay = 8"),
      /aria-label="CDL tor, 1 settimana, sovraccarico in W40"/);
  });
});

describe('Carico: resta un prospetto in sola lettura', () => {
  // La promessa scritta in cima a views-mrp.js, adesso che il carico ha una
  // vista in piu': cancellandolo domani, il resto dell app non se ne
  // accorgerebbe.
  it('il netto non cambia dopo aver guardato il carico e filtrato un centro', () => {
    const app = conDb();
    const conti = () => app.eval("JSON.stringify(mrpBuyRows(getPlan('pl1'), true).map(r => [r.item.code, r.qty, r.qtyOrder, r.net]))");
    const prima = conti();
    app.eval("setView('load'); loadSetCentro('tor'); loadCellModal('tor', '2026-W40'); loadSetCentro('');");
    assert.equal(conti(), prima);
  });

  it('l export ha due sezioni: il carico e i codici che lo producono', () => {
    const app = conDb();
    app.eval("setView('load')");
    const s = JSON.parse(app.eval('JSON.stringify(loadExportSpec().sezioni.map(x => ({ nome: x.nome, n: x.righe.length })))'));
    assert.deepEqual(s.map(x => x.nome), ['Ore per centro e settimana', 'Codici da produrre']);
    assert.equal(s[1].n, 3, 'due fasi del perno piu il montaggio del gruppo');
  });

  it('il filtro per centro entra anche nell intestazione dell export', () => {
    const app = conDb();
    app.eval("setView('load'); loadSetCentro('tor');");
    const f = JSON.parse(app.eval('JSON.stringify(loadExportSpec().filtri)'));
    assert.deepEqual(f[1], ['Centro', 'CDL tor']);
  });
});

// La tavola dentro la scheda di un piano dice «solo questo piano» (è scritto
// sopra la tavola stessa): il dettaglio di una cella deve rispondere con lo
// stesso conto, non con la somma di tutti i piani aperti.
describe('Carico dentro la scheda di un piano: gli stessi numeri della tavola', () => {
  function pannelloCarico(app) {
    return Array.from(app.el('modal-root').children).find(p => p.dataset.panelKey === 'carico');
  }
  function dbDuePiani() {
    return conDb({ plans: [
      { id: 'pl1', number: 'FAB-2026-001', title: 'Lotto', date: '2026-07-01', notes: '',
        lines: [{ id: 'l1', itemId: 'grp', qty: 2, dueDate: '2026-10-02' }], active: true },
      { id: 'pl2', number: 'FAB-2026-002', title: 'Lotto due', date: '2026-07-01', notes: '',
        lines: [{ id: 'l1', itemId: 'grp', qty: 10, dueDate: '2026-10-02' }], active: true },
    ] });
  }

  it('la tavola del piano genera un click legato a quel piano soltanto', () => {
    const app = dbDuePiani();
    const html = app.eval("loadTableHtml(mrpLoad(getPlan('pl1')), 'pl1')");
    assert.match(html, /loadCellModal\('tor','2026-W40','pl1'\)/);
  });

  it('il dettaglio aperto dalla scheda del piano conta solo quel piano, non la somma di tutti', () => {
    const app = dbDuePiani();
    // pl1 monta 2 gruppi (2h ciascuno = 4h su "mon"), pl2 ne monta 10 (20h): 24h in tutto.
    app.eval("loadCellModal('mon', '2026-W40', 'pl1')");
    const soloUno = pannelloCarico(app).innerHTML;
    assert.match(soloUno, /4(,0+)?\s*h\b/, 'il piano pl1 da solo pesa 4 ore su "mon"');
    assert.doesNotMatch(soloUno, /24(,0+)?\s*h\b/, 'non deve comparire la somma dei due piani');
  });

  it('senza planId il dettaglio somma tutti i piani aperti, come nella vista Carico centri', () => {
    const app = dbDuePiani();
    app.eval("loadCellModal('mon', '2026-W40')");
    assert.match(pannelloCarico(app).innerHTML, /24(,0+)?\s*h\b/);
  });

  it('un piano non più esistente non apre nessun dettaglio', () => {
    const app = dbDuePiani();
    app.eval("loadCellModal('mon', '2026-W40', 'non-esiste')");
    assert.equal(pannelloCarico(app), undefined);
  });

  it('il nome del centro, dentro la scheda del piano, non è un link al filtro globale', () => {
    const app = dbDuePiani();
    const html = app.eval("loadTableHtml(mrpLoad(getPlan('pl1')), 'pl1')");
    assert.ok(!html.includes("loadSetCentro('mon')"), 'da qui non deve muovere un filtro di un-altra vista');
  });

  it('nella vista Carico centri il nome resta un link, come prima', () => {
    const app = dbDuePiani();
    const html = app.eval("loadTableHtml(mrpLoadTable(loadEntries()))");
    assert.ok(html.includes("loadSetCentro('mon')"));
  });
});
