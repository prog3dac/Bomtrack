// Revisioni approvate: chi usa che cosa.
//
// Le proprietà che contano:
//   1. con le revisioni approvate attive, piani e ODP usano la revisione
//      approvata valida il giorno in cui il pezzo serve, mai la bozza;
//   2. le validità non si sovrappongono e non lasciano buchi: la precedente
//      finisce il giorno prima della successiva, l'ultima non finisce;
//   3. senza una revisione valida il codice non scende nel fabbisogno e non
//      genera ordini di produzione, e lo si dice;
//   4. approva solo l'Amministratore; gli altri chiedono, e la bozza in
//      approvazione non si modifica;
//   5. il passaggio dal modello di prima si fa da solo al primo accesso: un
//      archivio con mille distinte e nessuna revisione non si sveglia con i
//      piani vuoti;
//   6. la revisione del codice (00, 01…) è dei codici da progetto: si
//      registra dalla loro scheda, vale da una data, ed è quella stampata sui
//      documenti.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, asm, comp } = require('./fixtures.js');

function base(settings) {
  return makeDb({
    workCenters: [{ id: 'w1', name: 'Tornio', hourlyRate: 40, active: true }],
    items: [
      asm('g1', 'gruppo', { components: [comp('m1', 2), comp('c1', 4)] }),
      mat('m1', 10), acq('c1', 5), acq('c2', 7),
      { id: 'p1', code: 'P1', name: 'Perno', type: 'parte', uom: 'pz', unitCost: 0, sourcing: 'make', active: true,
        components: [comp('m1', 1)], cycle: [{ kind: 'op', workCenterId: 'w1', costMode: 'orario', hours: 1, note: '' }] },
    ],
    revisions: [],
    settings: settings || {},
  });
}
function app(settings, ruolo) {
  const a = loadApp({ silent: true });
  a.setDb(base(settings));
  a.asRole(ruolo || 'admin');
  return a;
}
const ev = (a, code) => JSON.parse(a.eval(`JSON.stringify(${code})`));
const oggi = a => a.eval('oggiISO()');
const giorni = (a, n) => a.eval(`addDays(oggiISO(), ${n})`);
const fabbisogno = (a, itemId, due) => ev(a, `mrpExplode([{ itemId: '${itemId}', qty: 1, dueDate: '${due}' }]).buy.map(e => e.item.code + ':' + e.qty)`).sort();

describe('Numerazione: v0, v1, v2', () => {
  it('la lettera salvata si legge come numero', () => {
    const a = app();
    assert.equal(a.eval('revLabel("A")'), 'v0');
    assert.equal(a.eval('revLabel("B")'), 'v1');
    assert.equal(a.eval('revLabel("Z")'), 'v25');
    assert.equal(a.eval('revLabel("AA")'), 'v26');
    assert.equal(a.eval('revLabel(itemRev(getItem("g1")))'), 'v0', 'un articolo nuovo nasce alla v0');
  });
});

describe('Validità senza sovrapposizioni e senza buchi', () => {
  it('la precedente finisce il giorno prima della successiva, l\'ultima non finisce', () => {
    const a = app({ revApprovate: true });
    const dopo = giorni(a, 10);
    a.eval(`releaseRevision('g1', 'prima', { dal: oggiISO() })`);
    a.eval(`getItem('g1').components.push({ itemId: 'c2', qty: 1, scrapPct: 0 })`);
    a.eval(`releaseRevision('g1', 'seconda', { dal: '${dopo}' })`);
    const p = ev(a, `revPeriodi('g1').map(x => [revLabel(x.r.rev), x.dal, x.al])`);
    assert.deepEqual(p, [['v0', oggi(a), giorni(a, 9)], ['v1', dopo, '']]);
    assert.equal(a.eval(`revLabel(revValidaAl('g1').rev)`), 'v0', 'oggi vale la prima');
    assert.equal(a.eval(`revLabel(revValidaAl('g1', '${dopo}').rev)`), 'v1', 'dal giorno scelto vale la seconda');
    assert.equal(a.eval(`revLabel(revProssima('g1').rev)`), 'v1');
  });

  it('la data da cui vale non torna indietro e non sta nel passato', () => {
    const a = app({ revApprovate: true });
    a.eval(`releaseRevision('g1', 'prima', { dal: '${giorni(a, 10)}' })`);
    assert.match(a.eval(`revDalErrore('g1', '${giorni(a, -1)}')`), /passato/);
    assert.match(a.eval(`revDalErrore('g1', '${giorni(a, 5)}')`), /non può cominciare prima/);
    assert.equal(a.eval(`revDalErrore('g1', '${giorni(a, 10)}')`), '');
    assert.equal(a.eval(`releaseRevision('g1', 'indietro', { dal: '${giorni(a, 3)}' })`), null, 'il rilascio la rifiuta');
  });

  it('due approvazioni con lo stesso «dal»: la prima non entra mai in vigore', () => {
    const a = app({ revApprovate: true });
    a.eval(`releaseRevision('g1', 'prima', { dal: oggiISO() })`);
    a.eval(`releaseRevision('g1', 'corretta', { dal: oggiISO() })`);
    const p = ev(a, `revPeriodi('g1').map(x => x.mai)`);
    assert.deepEqual(p, [true, false]);
    assert.equal(a.eval(`revValidaAl('g1').motivo`), 'corretta');
  });
});

describe('Prima dell\'attivazione non cambia niente', () => {
  it('il fabbisogno esplode la bozza, come sempre', () => {
    const a = app();
    assert.deepEqual(fabbisogno(a, 'g1', giorni(a, 30)), ['C1:4', 'M1:2']);
    assert.equal(a.eval(`itemOperativo(getItem('g1')) === getItem('g1')`), true);
  });

  it('chi ha il ruolo per le distinte rilascia da solo, come prima', () => {
    const a = app({}, 'progettazione');
    assert.ok(ev(a, `releaseRevision('g1', 'x')`));
  });
});

describe('Con le revisioni approvate attive, piani e ODP usano solo quelle', () => {
  it('il fabbisogno usa la revisione valida, non la bozza', () => {
    const a = app({ revApprovate: true });
    a.eval(`releaseRevision('g1', 'prima', { dal: oggiISO() })`);
    a.eval(`getItem('g1').components[1].qty = 9`);   // la bozza cambia
    assert.deepEqual(fabbisogno(a, 'g1', giorni(a, 30)), ['C1:4', 'M1:2'], 'la bozza non la usa nessuno');
  });

  it('una revisione che entra in vigore più avanti vale per i pezzi che servono da quel giorno', () => {
    const a = app({ revApprovate: true });
    const dopo = giorni(a, 20);
    a.eval(`releaseRevision('g1', 'prima', { dal: oggiISO() })`);
    a.eval(`getItem('g1').components[1].qty = 9`);
    a.eval(`releaseRevision('g1', 'seconda', { dal: '${dopo}' })`);
    assert.deepEqual(fabbisogno(a, 'g1', giorni(a, 10)), ['C1:4', 'M1:2']);
    assert.deepEqual(fabbisogno(a, 'g1', giorni(a, 30)), ['C1:9', 'M1:2']);
  });

  it('senza una revisione valida il codice non scende, e il piano lo dice', () => {
    const a = app({ revApprovate: true });
    const due = giorni(a, 30);
    const e = ev(a, `(x => ({ buy: x.buy.length, senza: x.senzaRev.map(s => s.item.code) }))(mrpExplode([{ itemId: 'g1', qty: 1, dueDate: '${due}' }]))`);
    assert.deepEqual(e, { buy: 0, senza: ['G1'] });
    assert.match(a.eval(`mrpSenzaRevHtml(mrpExplode([{ itemId: 'g1', qty: 1, dueDate: '${due}' }]))`), /G1/);
  });

  it('un commerciale e una parte comprata non hanno bisogno di revisioni', () => {
    const a = app({ revApprovate: true });
    a.eval(`getItem('p1').sourcing = 'buy'`);
    assert.equal(a.eval(`revServe(getItem('p1'))`), false);
    assert.deepEqual(fabbisogno(a, 'c1', giorni(a, 5)), ['C1:1']);
  });

  it('l\'ODP prende fasi e materiale dalla revisione valida, e se la ricorda', () => {
    const a = app({ revApprovate: true });
    a.eval(`releaseRevision('p1', 'prima', { dal: oggiISO() })`);
    a.eval(`getItem('p1').cycle[0].hours = 7`);
    const o = ev(a, `odpNew(getItem('p1'), 2, '${giorni(a, 5)}')`);
    assert.equal(o.phases[0].hours, 1, 'le ore della revisione approvata, non quelle della bozza');
    assert.equal(o.rev, 'A');
    assert.equal(o.codeRev, '00');
  });

  it('senza una revisione valida l\'ODP non nasce', () => {
    const a = app({ revApprovate: true });
    assert.equal(a.eval(`odpNew(getItem('p1'), 2, '${giorni(a, 5)}')`), null);
  });
});

describe('Chi approva', () => {
  it('Progettazione chiede, la bozza si blocca, l\'Amministratore approva', () => {
    const a = app({ revApprovate: true }, 'progettazione');
    assert.equal(a.eval(`releaseRevision('g1', 'diretta', { dal: oggiISO() })`), null, 'non approva da sola');
    assert.equal(a.eval(`revRichiedi('g1', { tipo: 'correttiva', motivo: 'quote', dal: oggiISO() })`), true);
    assert.equal(a.eval(`revBozzaLibera('g1')`), false, 'in approvazione la bozza non si tocca');
    a.asRole('admin');
    const rec = ev(a, `releaseRevision('g1', getItem('g1').revRequest.motivo, { tipo: getItem('g1').revRequest.tipo, dal: getItem('g1').revRequest.dal, richiestaDa: getItem('g1').revRequest.by })`);
    assert.equal(rec.requestedBy, 'u-test');
    assert.equal(rec.ecoKind, 'correttiva');
    assert.equal(a.eval(`getItem('g1').revRequest`), null);
    assert.equal(a.eval(`revBozzaLibera('g1')`), true);
  });

  it('respinta, la bozza torna libera con la nota', () => {
    const a = app({ revApprovate: true }, 'progettazione');
    a.eval(`revRichiedi('g1', { motivo: 'x', dal: oggiISO() })`);
    assert.equal(a.eval(`revRespingi('g1', 'no')`), false, 'respinge solo l\'Amministratore');
    a.asRole('admin');
    assert.equal(a.eval(`revRespingi('g1', 'manca la sbavatura')`), true);
    assert.equal(a.eval(`getItem('g1').revRejected.note`), 'manca la sbavatura');
    assert.equal(a.eval(`revBozzaLibera('g1')`), true);
  });

  it('le richieste in attesa arrivano nella Home dell\'Amministratore', () => {
    const a = app({ revApprovate: true }, 'progettazione');
    a.eval(`revRichiedi('g1', { motivo: 'x', dal: oggiISO() })`);
    a.asRole('admin');
    assert.deepEqual(ev(a, `revDaApprovare().map(i => i.code)`), ['G1']);
    assert.ok(ev(a, `homeSegnali().some(s => /revisione da approvare/.test(s.testo))`));
  });
});

describe('Passaggio alle revisioni approvate', () => {
  it('al primo accesso approva chi non è mai stato rilasciato o è cambiato, senza numero MT', () => {
    const a = app();
    a.eval(`releaseRevision('p1', 'già rilasciata')`);           // bozza uguale all'ultima
    assert.equal(a.eval('revAvvio()'), 1, 'solo g1, mai rilasciato');
    assert.equal(a.eval('revApprovateAttive()'), true);
    const r = ev(a, `revValidaAl('g1')`);
    assert.equal(r.motivo, 'Approvazione iniziale');
    assert.equal(r.ecoNumber, '');
    assert.equal(r.validFrom, oggi(a));
    assert.ok(a.eval(`revValidaAl('p1')`), 'p1 usa l\'ultima rilasciata');
    assert.equal(a.eval('revAvvio()'), 0, 'una volta sola');
  });

  it('lo fa chi modifica le distinte; con l\'archivio condiviso solo l\'Amministratore', () => {
    assert.equal(app({}, 'officina').eval('revAvvio()'), -1);
    assert.ok(app({}, 'progettazione').eval('revAvvio()') > 0, 'in locale basta Progettazione');
    const a = app({}, 'progettazione');
    a.eval('Store.modoCondiviso = true');
    assert.equal(a.eval('revAvvio()'), -1);
    assert.equal(a.eval('revApprovateAttive()'), false);
  });

  it('non c\'è più un pulsante per attivarle', () => {
    const a = app();
    a.eval(`document.body.insertAdjacentHTML('beforeend', '<div id="bom-rev-bar"></div>'); renderRevBar('bom-rev-bar', 'g1')`);
    assert.ok(!/Attiva le revisioni/.test(a.html('bom-rev-bar')));
    assert.ok(!/codeRevModal/.test(a.html('bom-rev-bar')), 'la revisione del codice sta nella scheda del codice');
  });
});

describe('Revisione del codice', () => {
  it('parte da 00, sale, vale da una data e la stampano i documenti', () => {
    const a = app({ revApprovate: true });
    assert.equal(a.eval(`itemCodeRev(getItem('p1'))`), '00');
    const dopo = giorni(a, 15);
    a.eval(`registraCodeRev('p1', { dal: '${dopo}', drawingRef: 'DIS-1', note: 'foro' })`);
    assert.equal(a.eval(`itemCodeRev(getItem('p1'))`), '00', 'fino al giorno scelto vale la 00');
    assert.equal(a.eval(`itemCodeRev(getItem('p1'), '${dopo}')`), '01');
    assert.equal(a.eval(`getItem('p1').drawingRef`), 'DIS-1');
    const riga = ev(a, `lineExtraDoc({ itemId: 'p1', deliveryDate: '${dopo}' })`);
    assert.deepEqual(riga, ['Dis. / Drw. DIS-1 rev. 01']);
  });

  it('non torna indietro', () => {
    const a = app({ revApprovate: true });
    a.eval(`registraCodeRev('p1', { rev: '03' })`);
    assert.equal(a.eval(`registraCodeRev('p1', { rev: '02' })`), null);
    assert.equal(a.eval(`itemCodeRevUltima(getItem('p1'))`), '03');
  });

  it('è solo dei codici da progetto: un commerciale non ce l\'ha', () => {
    const a = app({ revApprovate: true });
    assert.equal(a.eval(`registraCodeRev('c1', {})`), null);
    assert.equal(a.eval(`(getItem('c1').codeRevs || []).length`), 0);
    a.eval(`getItem('c1').drawingRef = 'CAT-7'`);
    assert.deepEqual(ev(a, `lineExtraDoc({ itemId: 'c1' })`), ['Dis. / Drw. CAT-7'], 'il disegno sì, la revisione no');
  });

  it('si vede e si registra dalla scheda del codice', () => {
    const a = app();
    a.eval(`registraCodeRev('p1', { rev: '02', dal: '2026-01-01' })`);
    const campo = a.eval(`codeRevCampoHtml(getItem('p1'))`);
    assert.match(campo, /rev\. 02<\/strong> dal 01\/01\/2026/);
    assert.match(campo, /codeRevModal\('p1'\)/);
    assert.match(a.eval(`itemTechFieldsHtml(getItem('p1'))`), /id="it-coderev"/);
    assert.ok(!/it-coderev/.test(a.eval(`itemTechFieldsHtml(getItem('c1'))`)), 'un commerciale no');
  });

  it('dopo una revisione del codice nuova, distinta e ciclo validi vanno riallineati', () => {
    const a = app({ revApprovate: true });
    a.eval(`releaseRevision('g1', 'prima', { dal: oggiISO() })`);
    assert.equal(a.eval(`revDaAllineare(getItem('g1'))`), null);
    a.eval(`registraCodeRev('g1', {})`);
    assert.equal(a.eval(`revDaAllineare(getItem('g1')).cr`), '01');
    a.eval(`codeRevConfermaAllineata('g1')`);
    assert.equal(a.eval(`revDaAllineare(getItem('g1'))`), null, 'confermata: vale anche per la 01');
    a.eval(`getItem('g1').components[1].qty = 5`);
    const r = ev(a, `releaseRevision('g1', 'per la 01', { dal: '${giorni(a, 1)}' })`);
    assert.equal(r.codeRev, '01', 'la nuova dichiara per quale revisione del codice è fatta');
  });
});
