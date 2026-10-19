// Guardie di ruolo e correttezza dei conteggi (0.37.0).
//
// Tre regole fissate per iscritto:
// 1. i mutatori della Gestione rifiutano chi non può scrivere `manage` — la
//    guardia sta nel mutatore, non nella vista che lo nasconde;
// 2. il riepilogo della home non dipende dal toggle lordo/netto lasciato
//    acceso nella vista Fabbisogno: conta sempre il netto;
// 3. «da dove viene il costo» risolve gli articoli per id, non per codice —
//    i codici duplicati esistono e non devono fondere né nascondere voci.

const assert = require('node:assert/strict');
const { describe, it, approx } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, acq, asm, comp } = require('./fixtures.js');

function app(db, role) {
  const a = loadApp({ silent: true });
  a.setDb(db || makeDb({ items: [] }));
  a.asRole(role || 'admin');
  return a;
}

describe('Le guardie stanno nei mutatori della Gestione', () => {
  const dbTerms = () => makeDb({
    suppliers: [{ id: 's1', name: 'SKF', active: true }],
    settings: { transportOptions: ['Porto franco'], transportDefault: '', uoms: [{ code: 'kg', name: '' }, { code: 'pz', name: '' }], uomDefault: 'pz' },
  });

  it('un lettore non imposta il trasporto predefinito', () => {
    const a = app(dbTerms(), 'lettore');
    a.eval('termsSetDefault("transport", 0)');
    assert.equal(a.eval('db.settings.transportDefault'), '');
  });

  it('un lettore non cancella una voce dei termini', () => {
    const a = app(dbTerms(), 'lettore');
    a.eval('termsDel("transport", 0)');
    assert.equal(a.eval('db.settings.transportOptions.length'), 1);
  });

  it('un lettore non cambia l\'unità di misura predefinita', () => {
    const a = app(dbTerms(), 'lettore');
    a.eval('uomSetDefault(0)');
    assert.equal(a.eval('db.settings.uomDefault'), 'pz');
  });

  it('acquisti e progettazione sono fuori dalla Gestione quanto il lettore', () => {
    // La matrice ROLE_WRITE riserva `manage` al solo admin: la guardia deve
    // rispettarla per tutti, non solo per il caso ovvio.
    ['acquisti', 'progettazione'].forEach(ruolo => {
      const a = app(dbTerms(), ruolo);
      a.eval('termsSetDefault("transport", 0)');
      assert.equal(a.eval('db.settings.transportDefault'), '', ruolo);
    });
  });

  it('l\'amministratore passa: la guardia blocca il ruolo, non la funzione', () => {
    const a = app(dbTerms(), 'admin');
    a.eval('termsSetDefault("transport", 0)');
    assert.equal(a.eval('db.settings.transportDefault'), 'Porto franco');
    a.eval('uomSetDefault(0)');
    assert.equal(a.eval('db.settings.uomDefault'), 'kg');
  });
});

describe('releaseRevision è guardata dentro, non solo dai chiamanti', () => {
  const dbRev = () => makeDb({
    items: [asm('g1', 'gruppo', { components: [comp('m1', 2)] }), mat('m1', 10)],
  });

  it('un lettore non rilascia: nessun record, articolo intatto', () => {
    const a = app(dbRev(), 'lettore');
    const rec = a.eval('releaseRevision("g1", "tentativo")');
    assert.equal(rec, null);
    assert.equal(a.eval('(db.revisions || []).length'), 0);
  });

  it('la progettazione rilascia: le distinte sono area sua', () => {
    const a = app(dbRev(), 'progettazione');
    const rev = JSON.parse(a.eval('JSON.stringify(releaseRevision("g1", "ok"))'));
    assert.equal(rev.rev, 'A');
    assert.equal(a.eval('db.revisions.length'), 1);
  });
});

describe('La home conta il fabbisogno netto, qualunque cosa dica il toggle', () => {
  // Un piano in ritardo su un articolo che il magazzino copre per intero:
  // al lordo segnalerebbe, al netto no. La home deve dire la stessa cosa
  // con il toggle della vista Fabbisogno in entrambe le posizioni.
  const dbPiano = () => makeDb({
    suppliers: [{ id: 's1', name: 'SKF', active: true }],
    items: [Object.assign(acq('c1', 5), {
      priceList: [{ id: 'p1', supplierId: 's1', price: 5, leadDays: 5, date: '2026-01-01' }],
      activePriceId: 'p1', supplierId: 's1',
    })],
    plans: [{ id: 'pl1', number: 'FAB-1', active: true, lines: [{ id: 'l1', itemId: 'c1', qty: 10, dueDate: '2020-01-01' }] }],
    movements: [{ id: 'mv1', itemId: 'c1', kind: 'rettifica', qty: 1000, date: '2026-01-01' }],
  });
  const segnali = a => JSON.parse(a.eval('JSON.stringify(homeSegnali())'));

  it('magazzino che copre tutto: nessun segnale, con il toggle in entrambi i versi', () => {
    const a = app(dbPiano());
    a.eval('mrpNet = false');
    const lordo = segnali(a).filter(s => /fabbisogno/.test(s.testo));
    a.eval('mrpNet = true');
    const netto = segnali(a).filter(s => /fabbisogno/.test(s.testo));
    assert.deepEqual(lordo, netto, 'due utenti sulla stessa base dati devono leggere lo stesso numero');
    assert.equal(netto.length, 0, 'coperto dal magazzino: non c\'è niente da ordinare');
  });

  it('senza copertura il ritardo si segnala, sempre', () => {
    const scoperto = dbPiano(); scoperto.movements = [];
    const a = app(scoperto);
    a.eval('mrpNet = false');
    assert.ok(segnali(a).some(s => /oltre la data/.test(s.testo)));
  });
});

describe('Le ottimizzazioni non cambiano i numeri (0.38.0)', () => {
  it('withTempCost su più cime in un colpo solo dà gli stessi costi di una chiamata per cima', () => {
    const a = app(makeDb({
      items: [
        asm('mac1', 'macchina', { components: [comp('m1', 2)] }),
        asm('mac2', 'macchina', { components: [comp('m1', 5)] }),
        mat('m1', 10),
      ],
    }));
    const unoPerVolta = JSON.parse(a.eval(`JSON.stringify([
      withTempCost(getItem('m1'), 99, () => costOf('mac1').total),
      withTempCost(getItem('m1'), 99, () => costOf('mac2').total),
    ])`));
    const inBlocco = JSON.parse(a.eval(`JSON.stringify(
      withTempCost(getItem('m1'), 99, () => ['mac1', 'mac2'].map(id => costOf(id).total))
    )`));
    assert.deepEqual(inBlocco, unoPerVolta);
    approx(a.eval('costOf("mac1").total'), 20, 'fuori dalla simulazione il costo vero torna');
  });

  it('la scheda articolo elenca anche i piani chiusi in cui l\'articolo compare esploso', () => {
    // planUseIndex() ha sostituito la riesplosione per apertura: la semantica
    // storica («per cosa serviva?») deve restare, piani chiusi compresi —
    // commitIndex() li scarta, questo indice no.
    const a = app(makeDb({
      items: [asm('mac', 'macchina', { components: [comp('c1', 2)] }), acq('c1', 5)],
      plans: [{ id: 'pl1', number: 'FAB-9', active: false, lines: [{ id: 'l1', itemId: 'mac', qty: 1 }] }],
    }));
    const html = a.eval('itemInfoDocumenti(getItem("c1"))');
    assert.match(html, /FAB-9/);
    assert.match(html, /piano chiuso/);
  });
});

describe('I contributi di costo si contano per id, non per codice', () => {
  it('una foglia col codice di un assieme non sparisce dal conto', () => {
    // Prima si risolveva con getItemByCode: il codice DUP trovava l'assieme,
    // la foglia veniva scartata come «assieme» e la spesa spariva dal conto.
    const a = app(makeDb({ items: [
      Object.assign(asm('mac', 'macchina', { components: [comp('x', 2)] }), { code: 'DUP' }),
      Object.assign(mat('x', 10), { code: 'DUP' }),
    ] }));
    const c = JSON.parse(a.eval('JSON.stringify(costContributors("mac"))'));
    assert.equal(c.length, 1);
    assert.equal(c[0].id, 'x');
    approx(c[0].line, 20);
  });

  it('due articoli distinti con lo stesso codice restano due voci', () => {
    const a = app(makeDb({ items: [
      asm('mac', 'macchina', { components: [comp('x1', 1), comp('x2', 1)] }),
      Object.assign(mat('x1', 3), { code: 'EQ' }),
      Object.assign(mat('x2', 7), { code: 'EQ' }),
    ] }));
    const c = JSON.parse(a.eval('JSON.stringify(costContributors("mac").map(x => x.line).sort((p, q) => p - q))'));
    assert.deepEqual(c, [3, 7], 'per codice si fonderebbero in una voce da 10');
  });
});

// ── La spazzata dei ruoli su tutti i comandi dell'interfaccia (dalla 0.105.6) ──
// Le guardie si aggiungono una funzione alla volta, e i buchi trovati finora
// erano tutti comandi raggiungibili da un onclick che nessun test chiamava con
// un ruolo ristretto. Qui non si elencano a mano: si leggono dai sorgenti tutte
// le chiamate scritte negli attributi on* (onclick, onchange, oninput…), con la
// forma dei loro argomenti — una costante resta quella, un '${…}' diventa a
// turno ciascun id della base dati completa, `event` un evento finto — e si
// chiama ognuna per ogni ruolo, confermando la domanda se il comando la fa.
// Poi si guarda quali tabelle dell'archivio condiviso sono cambiate, e si
// confrontano con quelle che il server lascia scrivere a quel ruolo
// (role_areas e table_areas di supabase/schema.sql): un comando nuovo senza
// guardia fallisce qui, prima che un lettore cambi un dato o che il server
// respinga il lotto di un collega.
//
// Il limite è dichiarato: i moduli si salvano con i campi vuoti del DOM finto,
// quindi un salvataggio che controlla i dati prima del ruolo qui non scrive
// comunque. La guardia va messa prima della validazione, come nel resto dell'app.
const fs = require('node:fs');
const path = require('node:path');
const { dbCloudCompleto } = require('./fixtures.js');

const ROOT = path.join(__dirname, '..');
const SORGENTI = fs.readFileSync(path.join(__dirname, 'harness.js'), 'utf8')
  .match(/const SRC = \[([^\]]*)\]/)[1].match(/'[^']+'/g).map(s => s.slice(1, -1)).concat(['index.html']);

// Gli argomenti di una chiamata, al primo livello di annidamento, a partire
// dalla parentesi aperta. Le interpolazioni ${…} restano intere.
function argomentiChiamata(t, i) {
  const out = []; let prof = 0, cur = '', q = null;
  for (; i < t.length; i++) {
    const ch = t[i];
    if (q) { cur += ch; if (ch === q && t[i - 1] !== '\\') q = null; continue; }
    if (ch === "'" || ch === '`') { q = ch; cur += ch; continue; }
    if (ch === '$' && t[i + 1] === '{') {
      let d = 0;
      for (; i < t.length; i++) { cur += t[i]; if (t[i] === '{') d++; else if (t[i] === '}' && --d === 0) break; }
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') prof++;
    if (ch === ')' || ch === ']' || ch === '}') {
      if (prof === 0) { if (cur.trim()) out.push(cur.trim()); return out; }
      prof--;
    }
    if (ch === ',' && prof === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  return null;
}
function formeDeiComandi() {
  const forme = new Map();
  const RE = /\bon(?:click|change|input|keydown|keyup|submit|blur)="((?:[^"$]|\$\{(?:[^{}]|\{[^{}]*\})*\})*)"/g;
  SORGENTI.forEach(f => {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    let m;
    while ((m = RE.exec(t))) {
      const C = /([A-Za-z_$][\w$]*)\s*\(/g; let c;
      while ((c = C.exec(m[1]))) {
        const a = argomentiChiamata(m[1], c.index + c[0].length);
        if (!a) continue;
        const forma = a.map(x => (/^'[A-Za-z_]\w*'$/.test(x) || /^-?\d+(\.\d+)?$/.test(x) ? x
          : /^'\$\{[^']*\}'$/.test(x) || /^\$\{/.test(x) ? 'ID'
            : x === 'event' ? 'EV' : /^this\./.test(x) ? 'VAL' : '?'));
        forme.set(c[1] + '(' + forma.join(',') + ')', { fn: c[1], forma });
      }
    }
  });
  return [...forme.values()];
}
// Le tabelle che il server lascia scrivere a un ruolo, lette dallo schema.
function tabelleScrivibili(ruolo) {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
  const ra = sql.match(/insert into public\.role_areas \(role, area\) values([\s\S]*?);/)[1];
  const aree = new Set([...ra.matchAll(/\('(\w+)', '(\w+)'\)/g)].filter(m => m[1] === ruolo).map(m => m[2]));
  const ta = sql.match(/insert into public\.table_areas \(tab, area\)([\s\S]*?)\) v\(t, a\);/)[1];
  return new Set([...ta.matchAll(/\('(\w+)', '(\w+)'\)/g)].filter(m => aree.has(m[2])).map(m => m[1]));
}
// Chiama ogni comando con ogni combinazione di argomenti e restituisce, per
// comando, le tabelle che ha cambiato.
function spazzata(ruolo) {
  const base = dbCloudCompleto();
  const a = app(base, ruolo);
  const baseJson = a.eval('JSON.stringify(db)');
  const tabelle = () => JSON.parse(a.eval('JSON.stringify(Object.assign(flattenDB(db), { settings: [db.settings] }))'));
  const prima = tabelle();
  const ids = [], coppie = [];
  (function raccogli(o, padre) {
    if (Array.isArray(o)) { o.forEach(x => raccogli(x, padre)); return; }
    if (!o || typeof o !== 'object') return;
    let p = padre;
    if (typeof o.id === 'string') { ids.push(o.id); if (padre) coppie.push([padre, o.id]); p = o.id; }
    Object.values(o).forEach(x => raccogli(x, p));
  })(base);
  const evento = () => a.eval(`({ key: 'Enter', target: { value: '1', checked: true, files: [] }, preventDefault() {}, stopPropagation() {} })`);
  const combinazioni = forma => {
    const n = forma.filter(x => x === 'ID').length;
    const righe = n === 0 ? [[]] : n === 1 ? ids.map(i => [i]).concat([[0]])
      : coppie.concat(ids.map(i => [i, i]), [[0, 0]]).map(p => Array.from({ length: n }, (_, j) => (p[j] !== undefined ? p[j] : p[0])));
    return righe.map(r => {
      let j = 0;
      return forma.map(x => (x === 'ID' ? r[j++] : x === 'EV' ? evento() : x === 'VAL' ? '1' : x === '?' ? undefined
        : /^'/.test(x) ? x.slice(1, -1) : Number(x)));
    });
  };
  const cambiate = {};
  formeDeiComandi().filter(x => typeof a.ctx[x.fn] === 'function').forEach(x => {
    combinazioni(x.forma).forEach(args => {
      try {
        a.eval('_confirmFn = null');
        const r = a.ctx[x.fn](...args);
        if (r && typeof r.catch === 'function') r.catch(() => {});
        a.eval('if (_confirmFn) confirmYes()');
      } catch (e) { /* un comando chiamato fuori dal suo contesto può lanciare: conta solo cosa ha scritto */ }
      if (a.eval('JSON.stringify(db)') === baseJson) return;
      const dopo = tabelle();
      Object.keys(dopo).filter(t => JSON.stringify(dopo[t]) !== JSON.stringify(prima[t]))
        .forEach(t => { (cambiate[x.fn] = cambiate[x.fn] || new Set()).add(t); });
      a.setDb(base); a.asRole(ruolo);
    });
  });
  return cambiate;
}

describe('Spazzata dei ruoli: ogni comando dell\'interfaccia rispetta le aree del server', () => {
  it('la spazzata morde: l\'amministratore cambia dati con decine di comandi', () => {
    // Senza questa prova un estrattore rotto darebbe «nessuna violazione» a vuoto.
    const c = spazzata('admin');
    assert.ok(Object.keys(c).length >= 30, 'comandi che scrivono: ' + Object.keys(c).length);
  });
  it('il lettore non cambia niente, con nessun comando', () => {
    const c = spazzata('lettore');
    assert.deepEqual(Object.keys(c).map(k => k + ' → ' + [...c[k]].join(', ')), []);
  });
  ['officina', 'acquisti', 'progettazione'].forEach(ruolo => {
    it(`${ruolo}: solo le tabelle che il server gli lascia scrivere`, () => {
      const ok = tabelleScrivibili(ruolo);
      const c = spazzata(ruolo);
      const fuori = Object.keys(c).map(k => [k, [...c[k]].filter(t => !ok.has(t))]).filter(([, t]) => t.length)
        .map(([k, t]) => k + ' → ' + t.join(', '));
      assert.deepEqual(fuori, []);
    });
  });
});
