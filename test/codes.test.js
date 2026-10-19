// Il codice articolo come identificativo.
//
// Fino alla 0.22.0 non lo controllava nessuno, ma tutto ciò che cerca un
// articolo per codice — l'import massivo per primo — dà per scontato che sia
// unico e risolve sul primo trovato, in silenzio. In cloud diventerà un vincolo
// del database: questi test fissano il comportamento che il vincolo dovrà
// trovare già rispettato.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, parte, asm, comp } = require('./fixtures.js');

function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || makeDb());
  a.asRole('admin');
  return a;
}
function conCodice(id, code, o) {
  return Object.assign(mat(id, 1), { code }, o || {});
}

describe('Indice per codice', () => {
  it('trova ignorando maiuscole e spazi ai bordi', () => {
    const a = app(makeDb({ items: [conCodice('m1', 'MAT-001')] }));
    assert.equal(a.eval('getItemByCode("mat-001")').id, 'm1');
    assert.equal(a.eval('getItemByCode("  MAT-001  ")').id, 'm1');
  });

  it('codice vuoto o sconosciuto: undefined, non il primo che capita', () => {
    const a = app(makeDb({ items: [conCodice('m1', 'MAT-001')] }));
    assert.equal(a.eval('getItemByCode("")'), undefined);
    assert.equal(a.eval('getItemByCode("   ")'), undefined);
    assert.equal(a.eval('getItemByCode("ZZZ")'), undefined);
    assert.equal(a.eval('getItemByCode(null)'), undefined);
  });

  it('con codici duplicati vince il primo, come faceva la scansione', () => {
    const a = app(makeDb({ items: [conCodice('m1', 'DUP'), conCodice('m2', 'dup')] }));
    assert.equal(a.eval('getItemByCode("DUP")').id, 'm1',
      'cambiare questo comportamento sposterebbe di articolo import già fatti');
  });

  it('gli articoli senza codice non entrano nell\'indice', () => {
    const a = app(makeDb({ items: [conCodice('m1', ''), conCodice('m2', null)] }));
    assert.equal(a.eval('codeIndex().size'), 0);
  });

  it('si ricostruisce dopo una modifica salvata', () => {
    const a = app(makeDb({ items: [conCodice('m1', 'VECCHIO')] }));
    a.eval('getItemByCode("VECCHIO")');            // costruisce l'indice
    a.eval('db.items[0].code = "NUOVO"; saveDB();');
    assert.equal(a.eval('getItemByCode("NUOVO")').id, 'm1');
    assert.equal(a.eval('getItemByCode("VECCHIO")'), undefined);
  });

  it('vede un articolo aggiunto direttamente a db.items', () => {
    const a = app(makeDb({ items: [conCodice('m1', 'A')] }));
    a.eval('getItemByCode("A")');
    a.eval(`db.items.push(${JSON.stringify(conCodice('m2', 'B'))})`);
    assert.equal(a.eval('getItemByCode("B")').id, 'm2', 'la lunghezza è cambiata: l\'indice si rifà da sé');
  });

  it('codeIndexAdd registra senza ricostruire tutto', () => {
    const a = app(makeDb({ items: [conCodice('m1', 'A')] }));
    a.eval('getItemByCode("A")');
    a.eval(`const nuovo = ${JSON.stringify(conCodice('m2', 'B'))}; db.items.push(nuovo); codeIndexAdd(nuovo);`);
    assert.equal(a.eval('getItemByCode("B")').id, 'm2');
    assert.equal(a.eval('getItemByCode("A")').id, 'm1', 'e non perde quelli già dentro');
  });
});

describe('duplicateCodeGroups — il report di Gestione', () => {
  it('database pulito: nessun gruppo', () => {
    const a = app(makeDb({ items: [conCodice('m1', 'A'), conCodice('m2', 'B')] }));
    assert.deepEqual(a.eval('JSON.stringify(duplicateCodeGroups().map(g => g.code))'), '[]');
  });

  it('raggruppa i duplicati ignorando le maiuscole', () => {
    const a = app(makeDb({ items: [conCodice('m1', 'DUP'), conCodice('m2', 'dup'), conCodice('m3', 'ALTRO')] }));
    const g = JSON.parse(a.eval('JSON.stringify(duplicateCodeGroups().map(x => ({ code: x.code, n: x.items.length })))'));
    assert.equal(g.length, 1);
    assert.equal(g[0].n, 2);
  });

  it('un codice ripetuto tre volte è un gruppo solo', () => {
    const a = app(makeDb({ items: [conCodice('m1', 'X'), conCodice('m2', 'X'), conCodice('m3', 'X')] }));
    const g = JSON.parse(a.eval('JSON.stringify(duplicateCodeGroups().map(x => x.items.length))'));
    assert.deepEqual(g, [3]);
  });

  it('gli articoli senza codice non sono duplicati fra loro', () => {
    const a = app(makeDb({ items: [conCodice('m1', ''), conCodice('m2', ''), conCodice('m3', null)] }));
    assert.equal(a.eval('duplicateCodeGroups().length'), 0,
      'il codice vuoto significa "non ancora assegnato", non "lo stesso codice"');
  });
});

describe('validateItemCode — non si introducono nuovi duplicati', () => {
  const conDue = () => makeDb({ items: [conCodice('m1', 'MAT-001'), conCodice('m2', 'MAT-002')] });

  it('un codice libero passa', () => {
    const a = app(conDue());
    assert.equal(a.eval('validateItemCode("MAT-999", null, null)'), null);
  });

  it('un codice già in uso viene rifiutato, e dice da chi', () => {
    const a = app(conDue());
    const err = a.eval('validateItemCode("MAT-001", null, null)');
    assert.ok(err);
    assert.match(err, /MAT-001/);
    assert.match(err, /Materia m1/, 'sapere quale articolo lo occupa evita la caccia al codice');
  });

  it('il confronto ignora maiuscole e spazi', () => {
    const a = app(conDue());
    assert.ok(a.eval('validateItemCode("  mat-001 ", null, null)'));
  });

  it('codice vuoto: ammesso, ci pensa readItemForm a metterci l\'id', () => {
    const a = app(conDue());
    assert.equal(a.eval('validateItemCode("", null, null)'), null);
    assert.equal(a.eval('validateItemCode("   ", null, null)'), null);
  });

  it('modificando un articolo, il suo stesso codice non è un duplicato', () => {
    const a = app(conDue());
    assert.equal(a.eval('validateItemCode("MAT-001", "m1", "MAT-001")'), null);
  });

  it('prendere il codice di un ALTRO articolo resta vietato', () => {
    const a = app(conDue());
    assert.ok(a.eval('validateItemCode("MAT-002", "m1", "MAT-001")'));
  });

  // La regola che rende la validazione vivibile su dati già sporchi.
  it('su un articolo già duplicato si può ancora salvare, se il codice non cambia', () => {
    const a = app(makeDb({ items: [conCodice('m1', 'DUP'), conCodice('m2', 'DUP')] }));
    assert.equal(a.eval('validateItemCode("DUP", "m2", "DUP")'), null,
      'chi sta solo correggendo il nome non deve restare bloccato dal duplicato di ieri');
  });
});

describe('Salvataggio della scheda articolo', () => {
  function apriNuovo(a, tipo, code, nome) {
    a.el('it-type').value = tipo;
    a.el('it-code').value = code;
    a.el('it-name').value = nome;
    a.el('it-uom').value = 'pz';
    a.eval('window.__dupSourceId = null');
  }

  it('un codice duplicato non crea l\'articolo', () => {
    const a = app(makeDb({ items: [conCodice('m1', 'MAT-001')] }));
    apriNuovo(a, 'materiale', 'MAT-001', 'Doppione');
    a.eval('saveNewItem()');
    assert.equal(a.snapshot().items.length, 1, 'l\'articolo non deve nascere');
  });

  it('un codice libero crea l\'articolo', () => {
    const a = app(makeDb({ items: [conCodice('m1', 'MAT-001')] }));
    apriNuovo(a, 'materiale', 'MAT-050', 'Nuovo');
    a.eval('saveNewItem()');
    const items = a.snapshot().items;
    assert.equal(items.length, 2);
    assert.equal(items[1].code, 'MAT-050');
  });

  it('rinominare il codice su un codice occupato non passa', () => {
    const a = app(makeDb({ items: [conCodice('m1', 'MAT-001'), conCodice('m2', 'MAT-002')] }));
    a.el('it-code').value = 'MAT-001';
    a.el('it-name').value = 'Materia m2';
    a.el('it-uom').value = 'kg';
    a.eval('saveItemEdit("m2")');
    assert.equal(a.snapshot().items.find(x => x.id === 'm2').code, 'MAT-002', 'il codice deve restare quello di prima');
  });
});

// isItemUsedAnywhere è più largo di usedBy/parentIndex (solo distinte/cicli):
// deve vedere anche un movimento di magazzino o una riga di documento, che non
// rendono l'articolo "genitore" di niente ma lo usano comunque.
describe('isItemUsedAnywhere — riferimenti oltre distinte e cicli', () => {
  it('falso per un articolo isolato', () => {
    const a = app(makeDb({ items: [mat('m1', 1)] }));
    assert.equal(a.eval('isItemUsedAnywhere("m1")'), false);
  });
  it('vero se compare in una distinta (come usedBy)', () => {
    const a = app(makeDb({ items: [asm('a1', 'gruppo', { components: [comp('m1', 2)] }), mat('m1', 1)] }));
    assert.equal(a.eval('isItemUsedAnywhere("m1")'), true);
  });
  it('vero se compare in un movimento di magazzino, anche senza distinta', () => {
    const a = app(makeDb({ items: [mat('m1', 1)], movements: [{ id: 'mv1', itemId: 'm1', qty: 5 }] }));
    assert.equal(a.eval('isItemUsedAnywhere("m1")'), true);
  });
  it('vero se compare in una riga di RFQ, anche senza distinta', () => {
    const a = app(makeDb({ items: [mat('m1', 1)], rfqs: [{ id: 'r1', lines: [{ id: 'l1', itemId: 'm1' }] }] }));
    assert.equal(a.eval('isItemUsedAnywhere("m1")'), true);
  });
});

describe('Campi bloccati su un articolo già usato', () => {
  // Usato solo in un movimento: usedBy (distinte/cicli) non lo vedrebbe, ma
  // isItemUsedAnywhere sì — è il caso che il vecchio controllo si perdeva.
  function dbUsato() {
    return makeDb({ items: [conCodice('m1', 'MAT-001')], movements: [{ id: 'mv1', itemId: 'm1', qty: 5 }] });
  }
  function editaTutto(a) {
    a.el('it-code').value = 'MAT-999';
    a.el('it-name').value = 'Nome nuovo';
    a.el('it-family').value = 'FAM-X';
    a.el('it-uom').value = 'kg';
  }

  it('progettazione: codice e nome restano quelli di prima', () => {
    const a = app(dbUsato());
    a.asRole('progettazione');
    editaTutto(a);
    a.eval('saveItemEdit("m1")');
    const it = a.snapshot().items.find(x => x.id === 'm1');
    assert.equal(it.code, 'MAT-001');
    assert.equal(it.name, 'Materia m1');
    assert.notEqual(it.familyId, 'FAM-X', 'anche la famiglia è un campo strutturale, bloccato');
  });

  it('admin: il codice resta bloccato, il nome invece si aggiorna', () => {
    const a = app(dbUsato());
    a.asRole('admin');
    editaTutto(a);
    a.eval('saveItemEdit("m1")');
    const it = a.snapshot().items.find(x => x.id === 'm1');
    assert.equal(it.code, 'MAT-001', 'il codice resta bloccato anche per l\'amministratore');
    assert.equal(it.name, 'Nome nuovo', 'il nome è l\'eccezione riservata all\'amministratore');
  });

  it('un articolo non ancora usato resta modificabile su tutto', () => {
    const a = app(makeDb({ items: [conCodice('m1', 'MAT-001')] }));
    a.asRole('progettazione');
    editaTutto(a);
    a.eval('saveItemEdit("m1")');
    const it = a.snapshot().items.find(x => x.id === 'm1');
    assert.equal(it.code, 'MAT-999');
    assert.equal(it.name, 'Nome nuovo');
  });
});

describe('Eliminazione bloccata su un articolo già usato', () => {
  it('un uso fuori da distinte/cicli (es. un movimento) blocca comunque l\'eliminazione', () => {
    const a = app(makeDb({ items: [mat('m1', 1)], movements: [{ id: 'mv1', itemId: 'm1', qty: 5 }] }));
    a.asRole('admin');
    a.eval('delItem("m1")');
    assert.equal(a.snapshot().items.length, 1, 'nessuna eccezione, nemmeno per l\'amministratore');
  });
  it('un articolo non usato si elimina normalmente', () => {
    const a = app(makeDb({ items: [mat('m1', 1)] }));
    a.asRole('admin');
    a.eval('delItem("m1"); confirmYes();');
    assert.equal(a.snapshot().items.length, 0);
  });
});

// L'obsoleto non è più solo un'etichetta: un articolo così marcato non si
// deve più proporre come NUOVO componente di distinta.
describe('Obsoleto esclude dal picker dei nuovi componenti', () => {
  it('pickerCandidates non propone un articolo obsoleto', () => {
    const a = app(makeDb({ items: [
      asm('a1', 'gruppo', {}),
      Object.assign(mat('m1', 1), { obsolete: true }),
      mat('m2', 1),
    ] }));
    const ids = JSON.parse(a.eval('JSON.stringify(pickerCandidates("gruppo", "a1").map(i => i.id))'));
    assert.deepEqual(ids, ['m2'], 'm1 è obsoleto e non compare più fra i candidati');
  });
});

describe('createsCycle — copre anche la distinta parte', () => {
  it('un articolo dentro se stesso è sempre un ciclo', () => {
    const a = app(makeDb({ items: [asm('g1', 'gruppo')] }));
    assert.equal(a.eval('createsCycle("g1", "g1")'), true);
  });

  it('anello fra assiemi: riconosciuto', () => {
    const a = app(makeDb({ items: [asm('g1', 'sottogruppo', { components: [comp('g2', 1)] }), asm('g2', 'sottogruppo')] }));
    assert.equal(a.eval('createsCycle("g2", "g1")'), true);
    assert.equal(a.eval('createsCycle("g1", "g2")'), false, 'g2 è già figlio: rimetterlo non è un anello');
  });

  // Il buco chiuso in questa versione: la discesa si fermava sulle parti.
  it('anello che passa per la distinta parte: riconosciuto', () => {
    const a = app(makeDb({ items: [
      asm('g1', 'gruppo', { components: [comp('p1', 1)] }),
      parte('p1', { cycle: [{ kind: 'item', itemId: 'c1', qty: 1 }] }),
      acq('c1', 5),
    ] }));
    assert.equal(a.eval('createsCycle("c1", "g1")'), true,
      'g1 → p1 → c1: mettere g1 dentro c1 chiuderebbe l\'anello attraverso il ciclo della parte');
  });

  it('le lavorazioni del ciclo non sono contenimento', () => {
    const a = app(makeDb({ items: [
      parte('p1', { cycle: [{ kind: 'op', workCenterId: 'w1', cost: 10 }] }),
      asm('g1', 'gruppo'),
    ] }));
    assert.equal(a.eval('createsCycle("g1", "p1")'), false, 'una fase di lavorazione non contiene articoli');
  });

  it('un articolo condiviso da due rami non viene scambiato per un anello', () => {
    const a = app(makeDb({ items: [
      asm('g1', 'gruppo', { components: [comp('s1', 1), comp('s2', 1)] }),
      asm('s1', 'sottogruppo', { components: [comp('m1', 1)] }),
      asm('s2', 'sottogruppo', { components: [comp('m1', 1)] }),
      mat('m1', 2),
    ] }));
    assert.equal(a.eval('createsCycle("s1", "m1")'), false);
  });

  it('non entra in ricorsione su dati già ciclici', () => {
    const a = app(makeDb({ items: [
      asm('g1', 'sottogruppo', { components: [comp('g2', 1)] }),
      asm('g2', 'sottogruppo', { components: [comp('g1', 1)] }),
      mat('m1', 1),
    ] }));
    assert.doesNotThrow(() => a.eval('createsCycle("m1", "g1")'),
      'un anello già in archivio non deve far esplodere il controllo che serve a toglierlo');
  });
});

describe('pickCycleItem — le guardie stanno accanto alla scrittura', () => {
  const conParte = () => makeDb({ items: [parte('p1', { cycle: [] }), acq('c1', 5), asm('g1', 'gruppo')] });

  it('un commerciale entra nella distinta parte', () => {
    const a = app(conParte());
    a.eval('currentCycleItemId = "p1"; pickCycleItem("c1")');
    assert.equal(a.snapshot().items.find(x => x.id === 'p1').cycle.length, 1);
  });

  it('un assieme no, nemmeno chiamando la funzione a mano', () => {
    const a = app(conParte());
    a.eval('currentCycleItemId = "p1"; pickCycleItem("g1")');
    assert.equal(a.snapshot().items.find(x => x.id === 'p1').cycle.length, 0);
  });

  it('un articolo inesistente non aggiunge una riga vuota', () => {
    const a = app(conParte());
    a.eval('currentCycleItemId = "p1"; pickCycleItem("sparito")');
    assert.equal(a.snapshot().items.find(x => x.id === 'p1').cycle.length, 0);
  });

  it('il ruolo lettore non scrive', () => {
    const a = app(conParte());
    a.asRole('lettore');
    a.eval('currentCycleItemId = "p1"; pickCycleItem("c1")');
    assert.equal(a.snapshot().items.find(x => x.id === 'p1').cycle.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════
//  Sottogruppi e parti abitano lo stesso prefisso
// ═══════════════════════════════════════════════════════════
// MAC-GRP-### è uno spazio solo, percorso in due direzioni: i sottogruppi
// scendono da 999, le parti salgono da 1. Il calcolo del prossimo numero
// guardava solo i pari tipo, quindi quando i due blocchi si incontravano l'app
// proponeva un codice già preso — e poi lo rifiutava da sé con «codice già in
// uso», sempre lo stesso, a ogni tentativo. Un vicolo cieco.
function conGruppoAffollato(incrN) {
  const items = [
    { id: 'mac', code: 'TRN', name: 'Tornio', type: 'macchina', uom: 'pz', sigla: 'TRN',
      incrDigitsN: incrN, components: [], operations: [] },
    { id: 'grp', code: 'TRN-BAS', name: 'Basamento', type: 'gruppo', uom: 'pz', sigla: 'BAS',
      machineItemId: 'mac', components: [], operations: [] },
  ];
  const pad = n => String(n).padStart(incrN, '0');
  // Le parti hanno preso 1..4, i sottogruppi 9..5 scendendo: lo spazio da 9 è pieno.
  [1, 2, 3, 4].forEach(n => items.push({ id: 'p' + n, code: 'TRN-BAS-' + pad(n), name: 'Parte ' + n,
    type: 'parte', uom: 'pz', machineItemId: 'mac', groupItemId: 'grp', cycle: [] }));
  [9, 8, 7, 6, 5].forEach(n => items.push({ id: 's' + n, code: 'TRN-BAS-' + pad(n), name: 'Sotto ' + n,
    type: 'sottogruppo', uom: 'pz', machineItemId: 'mac', groupItemId: 'grp', components: [], operations: [] }));
  return makeDb({ items });
}
const bozza = tipo => 'genItemCode({ id: "nuovo", type: ' + JSON.stringify(tipo)
  + ', uom: "pz", machineItemId: "mac", groupItemId: "grp" })';

describe('Numerazione condivisa fra sottogruppi e parti', () => {
  it('la parte successiva salta i numeri presi dai sottogruppi', () => {
    const a = app(conGruppoAffollato(3));
    const code = a.eval(bozza('parte'));
    assert.equal(code, 'TRN-BAS-010', 'da 5 a 9 sono dei sottogruppi: si riparte da 10');
    assert.equal(a.eval('!!getItemByCode(' + JSON.stringify(code) + ')'), false, 'e il codice è libero davvero');
  });

  it('il sottogruppo successivo salta i numeri presi dalle parti', () => {
    const a = app(conGruppoAffollato(3));
    const code = a.eval(bozza('sottogruppo'));
    assert.equal(code, 'TRN-BAS-000', 'da 4 a 1 sono delle parti: sotto c-è solo lo zero');
    assert.equal(a.eval('!!getItemByCode(' + JSON.stringify(code) + ')'), false);
  });

  it('il codice proposto passa la validazione che l-app stessa applica', () => {
    ['parte', 'sottogruppo'].forEach(tipo => {
      const a = app(conGruppoAffollato(3));
      const code = a.eval(bozza(tipo));
      assert.equal(a.eval('validateItemCode(' + JSON.stringify(code) + ', "nuovo")'), null,
        tipo + ': proporre un codice che poi si rifiuta è un vicolo cieco');
    });
  });

  it('con lo spazio esaurito si dice, invece di proporre un doppione', () => {
    // incrN = 1: nove numeri in tutto, 0-9, e li abbiamo occupati tutti.
    const a = app(conGruppoAffollato(1));
    a.eval('db.items.push({ id: "s0", code: "TRN-BAS-0", name: "Sotto 0", type: "sottogruppo", uom: "pz", machineItemId: "mac", groupItemId: "grp", components: [], operations: [] }); invalidateCaches();');
    assert.equal(a.eval(bozza('parte')), '', 'niente codice è meglio di un codice già di un altro');
    assert.equal(a.eval(bozza('sottogruppo')), '');
  });

  it('in un gruppo vuoto le due numerazioni partono dai loro estremi', () => {
    const a = app(makeDb({ items: [
      { id: 'mac', code: 'TRN', name: 'Tornio', type: 'macchina', uom: 'pz', sigla: 'TRN', components: [], operations: [] },
      { id: 'grp', code: 'TRN-BAS', name: 'Basamento', type: 'gruppo', uom: 'pz', sigla: 'BAS', machineItemId: 'mac', components: [], operations: [] },
    ] }));
    assert.equal(a.eval(bozza('parte')), 'TRN-BAS-001');
    assert.equal(a.eval(bozza('sottogruppo')), 'TRN-BAS-999');
  });
});

// ═══════════════════════════════════════════════════════════
//  L'indice dei progressivi
// ═══════════════════════════════════════════════════════════
// nextCodeForPrefix() compilava una regex e la provava su OGNI articolo, a ogni
// chiamata: durante un import è una chiamata per riga nuova, e su qualche
// migliaio di righe contro qualche migliaio di articoli il costo è quadratico.
// Ora la passata è una e vale per tutti i prefissi. Questi casi fissano il
// comportamento **identico** a quello di prima, che è la parte che conta.
describe('Progressivi per prefisso', () => {
  const conCodici = codici => app(makeDb({
    items: codici.map((c, i) => ({ id: 'i' + i, code: c, name: 'x', type: 'acquistato', uom: 'pz' })),
  }));
  const next = (a, pfx) => a.eval('nextCodeForPrefix(' + JSON.stringify(pfx) + ')');

  it('riparte dal massimo, non dall-ultimo inserito', () => {
    const a = conCodici(['CMM-MEC-CUS-001', 'CMM-MEC-CUS-007', 'CMM-MEC-CUS-003']);
    assert.equal(next(a, 'CMM-MEC-CUS-'), 'CMM-MEC-CUS-008');
  });

  it('un altro prefisso non entra nel conto', () => {
    const a = conCodici(['CMM-MEC-CUS-001', 'CMM-MEC-ALT-999']);
    assert.equal(next(a, 'CMM-MEC-CUS-'), 'CMM-MEC-CUS-002');
  });

  it('il prefisso è quello per intero, non un suo inizio', () => {
    const a = conCodici(['MAT-001', 'MAT-ACC-050']);
    assert.equal(next(a, 'MAT-'), 'MAT-002', 'MAT-ACC-050 sta sotto MAT-ACC-, non sotto MAT-');
  });

  it('un codice che non finisce con cifre non conta', () => {
    const a = conCodici(['CMM-MEC-12A', 'CMM-MEC-9']);
    assert.equal(next(a, 'CMM-MEC-'), 'CMM-MEC-010');
  });

  // Fino alla 0.105.5 le maiuscole contavano, e la prova lo fissava: ma il
  // controllo dei doppioni le ignora, e il codice proposto veniva poi rifiutato
  // come già usato. Ora il conto le ignora come i doppioni.
  it('le maiuscole non contano, come nel controllo dei doppioni', () => {
    const a = conCodici(['PRT-X-0001', 'prt-x-0002']);
    assert.equal(next(a, 'PRT-X-'), 'PRT-X-003');
  });

  it('senza nessun codice si parte da uno', () => {
    assert.equal(next(conCodici([]), 'CMM-'), 'CMM-001');
  });

  it('un articolo aggiunto dentro il ciclo entra subito nel conto', () => {
    // È il caso dell-import: le righe si creano una dopo l-altra e il codice
    // della seconda deve vedere quello della prima, senza passare da un salvataggio.
    const a = conCodici(['CMM-MEC-CUS-001']);
    assert.equal(next(a, 'CMM-MEC-CUS-'), 'CMM-MEC-CUS-002');
    a.eval('db.items.push({ id: "nuovo", code: "CMM-MEC-CUS-002", name: "y", type: "acquistato", uom: "pz" })');
    assert.equal(next(a, 'CMM-MEC-CUS-'), 'CMM-MEC-CUS-003', 'un indice fermo darebbe di nuovo 002');
  });
});

// genItemCode è logica di dominio: durante un import viene chiamata una volta
// per riga, e sparava un toast per ognuna. Ora dice perché non ce l-ha fatta, e
// chi ha davanti una persona lo mostra.
describe('Il codice non generato dice perché, senza gridarlo', () => {
  it('la numerazione esaurita si legge in codeGenError', () => {
    const a = app(makeDb({ items: [
      { id: 'mac', code: 'TRN', name: 'Tornio', type: 'macchina', uom: 'pz', sigla: 'TRN', incrDigitsN: 1, components: [], operations: [] },
      { id: 'grp', code: 'TRN-BAS', name: 'Base', type: 'gruppo', uom: 'pz', sigla: 'BAS', machineItemId: 'mac', components: [], operations: [] },
    ].concat([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({
      id: 'p' + n, code: 'TRN-BAS-' + n, name: 'P' + n, type: 'parte', uom: 'pz',
      machineItemId: 'mac', groupItemId: 'grp', cycle: [],
    }))) }));
    const code = a.eval('genItemCode({ id: "x", type: "parte", uom: "pz", machineItemId: "mac", groupItemId: "grp" })');
    assert.equal(code, '');
    assert.match(a.eval('codeGenError'), /esaurita/);
  });

  it('e si azzera al tentativo successivo, che riesce', () => {
    const a = app(makeDb({ items: [
      { id: 'mac', code: 'TRN', name: 'Tornio', type: 'macchina', uom: 'pz', sigla: 'TRN', components: [], operations: [] },
      { id: 'grp', code: 'TRN-BAS', name: 'Base', type: 'gruppo', uom: 'pz', sigla: 'BAS', machineItemId: 'mac', components: [], operations: [] },
    ] }));
    assert.equal(a.eval('genItemCode({ id: "x", type: "parte", uom: "pz", machineItemId: "mac", groupItemId: "grp" })'), 'TRN-BAS-001');
    assert.equal(a.eval('codeGenError'), '', 'un errore vecchio non deve sopravvivere a un successo');
  });
});

// Le due anagrafiche condividevano lo STESSO array di colonne, non una copia.
describe('Le colonne di Acquisti e Progetto sono separate davvero', () => {
  it('non sono lo stesso array', () => {
    const a = app(makeDb());
    assert.equal(a.eval('COLUMNS.design === COLUMNS.buy'), false,
      'un alias si rompe alla prima colonna aggiunta a una sola delle due');
  });
  it('Progetto ha le stesse colonne di Acquisti, più concetto e approvvigionamento', () => {
    const a = app(makeDb());
    const buy = JSON.parse(a.eval('JSON.stringify(COLUMNS.buy)'));
    const design = JSON.parse(a.eval('JSON.stringify(COLUMNS.design)'));
    assert.deepEqual(design.slice(0, buy.length), buy,
      'le colonne di base restano identiche: solo Progetto ospita anche le parti');
    assert.deepEqual(design.slice(buy.length).map(c => c.key), ['concept', 'sourcing'],
      'concetto e approvvigionamento esistono solo per le parti, e le parti stanno solo in Progetto');
  });
});

// 0.105.5: due gruppi con la stessa sigla numerano le parti nello stesso
// TRN-BAS-###, e il secondo ripartiva da 001.
describe('Due gruppi con la stessa sigla', () => {
  it('le parti e i sottogruppi del secondo continuano la numerazione comune', () => {
    const a = app(makeDb({ items: [
      { id: 'mac', code: 'TRN-S00', name: 'Tornio', type: 'macchina', uom: 'pz', sigla: 'TRN', components: [], operations: [] },
      { id: 'g1', code: 'TRN-BAS-S00', name: 'Base', type: 'gruppo', uom: 'pz', sigla: 'BAS', machineItemId: 'mac', components: [], operations: [] },
      { id: 'g2', code: 'TRN-BAS-S01', name: 'Base bis', type: 'gruppo', uom: 'pz', sigla: 'BAS', machineItemId: 'mac', components: [], operations: [] },
      { id: 'p1', code: 'TRN-BAS-001', name: 'P1', type: 'parte', uom: 'pz', machineItemId: 'mac', groupItemId: 'g1', cycle: [] },
      { id: 's1', code: 'TRN-BAS-999', name: 'S1', type: 'sottogruppo', uom: 'pz', machineItemId: 'mac', groupItemId: 'g1', components: [], operations: [] },
    ] }));
    assert.equal(a.eval('genItemCode({ id: "x", type: "parte", uom: "pz", machineItemId: "mac", groupItemId: "g2" })'), 'TRN-BAS-002');
    assert.equal(a.eval('genItemCode({ id: "y", type: "sottogruppo", uom: "pz", machineItemId: "mac", groupItemId: "g2" })'), 'TRN-BAS-998');
  });
});
