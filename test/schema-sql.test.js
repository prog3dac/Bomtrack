// Lo schema SQL (supabase/schema.sql) contro il codice — D3 e D4 in
// docs/analisi-tecnica.md.
//
// Due livelli. Il primo gira sempre: legge il file SQL e verifica che dica le
// stesse cose del codice — le tabelle di SCHEMA, i padri, le politiche di
// merge, ogni colonna che dbVersoCloud() produce, con lo stesso tipo. Il
// secondo gira dove c'è un Postgres (BOMTRACK_PG, vedi test/pg.js): carica lo
// schema, ci spinge dentro un database che tocca tutte le tabelle, lo rilegge
// e prova le regole che contano — chi vince, cosa si sostituisce, cosa si
// cancella, e che un invio entri intero o non entri.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, dbCloudCompleto, U, T0 } = require('./fixtures.js');
const pg = require('./pg.js');

const SQL = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');

// ── Lettura del file SQL ──
// Basta un parser minimo: le tabelle sono scritte tutte nella stessa forma.
function spezzaAlivello0(s) {
  const parti = [];
  let prof = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') prof++;
    if (ch === ')') prof--;
    if (ch === ',' && prof === 0) { parti.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parti.push(cur);
  return parti;
}
function tabelleSql() {
  const out = {};
  const re = /create table if not exists public\.(\w+) \(([\s\S]*?)\n\);/g;
  let m;
  while ((m = re.exec(SQL))) {
    const corpo = m[2].split('\n').map(r => r.replace(/--.*$/, '')).join('\n');
    const colonne = {};
    spezzaAlivello0(corpo).map(p => p.trim()).filter(Boolean).forEach(p => {
      if (/^(constraint|primary key|unique)\b/i.test(p)) return;
      const [nome, tipo] = p.split(/\s+/);
      colonne[nome] = tipo;
    });
    out[m[1]] = colonne;
  }
  return out;
}
function registroSql() {
  const blocco = SQL.match(/insert into public\.sync_tables[^;]*?values([\s\S]*?)on conflict/)[1];
  const out = {};
  const re = /\('(\w+)', (null|'(\w+)'), (null|'(\w+)'), '(\w+)'\)/g;
  let m;
  while ((m = re.exec(blocco))) out[m[1]] = { parent_tab: m[3] || null, parent_col: m[5] || null, merge: m[6] };
  return out;
}
const SQL_A_CLOUD = { boolean: 'bool', integer: 'int' };

// Un database che tocca tutte le tabelle, con id veri: test/fixtures.js.
const dbCompleto = dbCloudCompleto;

const app = db => { const a = loadApp({ silent: true }); a.setDb(db); return a; };
const ev = (a, code) => JSON.parse(a.eval(`JSON.stringify(${code})`));
// Nel modello locale null, assente e — sui campi «vuoti» — `''` dicono la
// stessa cosa, e al ritorno dal server non si distinguono più: il confronto
// li tratta come uguali.
function senzaVuoti(x) {
  if (Array.isArray(x)) return x.map(senzaVuoti);
  if (x && typeof x === 'object') {
    const o = {};
    Object.keys(x).forEach(k => { if (x[k] !== null && x[k] !== '') o[k] = senzaVuoti(x[k]); });
    return o;
  }
  return x;
}

describe('schema.sql dice le stesse cose del codice', () => {
  const a = app(dbCompleto());
  const sql = tabelleSql();
  const reg = registroSql();

  it('il registro sync_tables è SCHEMA: tabelle, padri, politiche di merge', () => {
    const atteso = ev(a, `(() => {
      const o = {};
      Object.values(SCHEMA).forEach(d => {
        o[d.table] = { parent_tab: null, parent_col: null, merge: 'root' };
        Object.values(d.children || {}).forEach(c => {
          o[c.table] = { parent_tab: d.table, parent_col: CLOUD_TABLES[c.table].parent, merge: c.merge };
        });
      });
      return o;
    })()`);
    assert.deepEqual(reg, atteso);
  });

  // 0.106.0: il cestino lo pulisce il server; la finestra è la stessa dell'app.
  it('la pulizia del server tiene il cestino quanto TRASH_DAYS', () => {
    const corpo = /function public\.pulizia_archivio[\s\S]*?\nend \$\$;/.exec(SQL)[0];
    assert.match(corpo, new RegExp(`from public\\.trash where deleted_at < ora - interval '${a.eval('TRASH_DAYS')} days'`));
  });

  it('ogni tabella del registro ha il suo create table', () => {
    Object.keys(reg).forEach(t => assert.ok(sql[t], `manca la tabella ${t}`));
  });

  it('ogni colonna ha il tipo che cloud-map le attribuisce, e viceversa', () => {
    const diversi = [];
    Object.keys(reg).forEach(t => Object.keys(sql[t]).forEach(col => {
      if (col === 'synced_at') return;
      const tipoSql = SQL_A_CLOUD[sql[t][col]] || sql[t][col];
      const campo = reg[t].parent_col === col ? 'parentId'
        : ev(a, `(() => { const r = (CLOUD_TABLES[${JSON.stringify(t)}] || {}).rename || {}; const k = Object.keys(r).find(x => r[x] === ${JSON.stringify(col)}); return k || snakeToCamel(${JSON.stringify(col)}); })()`);
      const tipoJs = campo === 'parentId' ? 'uuid' : a.eval(`cloudType(${JSON.stringify(t)}, ${JSON.stringify(campo)})`);
      if (tipoSql !== tipoJs) diversi.push(`${t}.${col}: SQL ${sql[t][col]}, cloud-map ${tipoJs}`);
    }));
    assert.deepEqual(diversi, []);
  });

  it('ogni colonna che l\'app invia esiste, in tutte le tabelle', () => {
    const t = ev(a, 'dbVersoCloud(db)');
    const mancano = [];
    Object.keys(t).forEach(tab => t[tab].forEach(r => Object.keys(r).forEach(col => {
      if (!sql[tab] || !(col in sql[tab])) mancano.push(`${tab}.${col}`);
    })));
    assert.deepEqual([...new Set(mancano)], []);
  });

  it('il database di prova tocca davvero tutte le tabelle', () => {
    const t = ev(a, 'dbVersoCloud(db)');
    const vuote = Object.keys(reg).filter(tab => !(t[tab] || []).length);
    assert.deepEqual(vuote, [], 'una tabella vuota qui è una tabella che il giro in Postgres non prova');
  });

  it('le chiavi esterne sono tutte differite', () => {
    const immediate = (SQL.match(/references [^\n,]*/g) || []).filter(r => !/deferrable initially deferred/.test(r));
    assert.deepEqual(immediate, []);
  });
});

describe('Postgres: invio e lettura', () => {
  if (!pg.disponibile()) {
    it('saltato: BOMTRACK_PG non impostata (vedi test/pg.js)', () => {});
    return;
  }
  const a = app(dbCompleto());
  const righe = ev(a, 'dbVersoCloud(db)');
  const utenti = righe.profiles.map(r => r.id);
  const pieno = d => { d.utenti(utenti); return d.push({ upsert: righe, settings: { data: { currency: '€' } } }); };
  const conDb = fn => () => { const d = pg.nuovoDatabase(); try { fn(d); } finally { d.chiudi(); } };

  it('un database intero entra in un invio, riferimenti circolari compresi', conDb(d => {
    const r = pieno(d);
    assert.deepEqual(r.rejected, []);
    Object.keys(righe).forEach(t => assert.equal(r.applied[t], righe[t].length, t));
  }));

  // 0.105.4: il primo caricamento va a pezzi. Ogni pezzo cita solo righe
  // già arrivate, articoli che si citano fra loro e righe di distinta compresi.
  it('il primo caricamento entra anche a pezzi di una riga sola', conDb(d => {
    d.utenti(utenti);
    const lotti = ev(a, `cloudLottiCaricamento({ upsert: dbVersoCloud(db), settings: { data: { currency: '€' } } }, 1)`);
    assert.ok(lotti.length > Object.keys(righe).length);
    lotti.forEach(l => assert.deepEqual(d.push(l).rejected, []));
    Object.keys(righe).forEach(t => assert.equal(d.sql(`select count(*) from ${t}`), String(righe[t].length), t));
    const g = righe.items.find(x => x.machine_item_id);
    assert.equal(d.sql(`select machine_item_id from items where id = '${g.id}'`), g.machine_item_id, 'il riferimento fra articoli torna');
  }));

  // 0.105.4: lo scaricamento completo a pagine porta le stesse righe del pull intero.
  it('la lettura a pagine porta le stesse righe del pull intero', conDb(d => {
    pieno(d);
    d.push({ remove: { reminders: [righe.reminders[0].id] } });
    const tutto = d.pull(null);
    const pagina = (tab, dopo) => JSON.parse(d.sql(`select public.pull_pagina('${tab}', ${dopo == null ? 'null' : `'${dopo}'`}, 2)`)).rows;
    const tutte = (tab, chiave) => { let r = [], p, dopo = null; do { p = pagina(tab, dopo); r = r.concat(p); if (p.length) dopo = chiave(p[p.length - 1]); } while (p.length === 2); return r; };
    const perId = x => [...x].sort((u, v) => String(u.id).localeCompare(String(v.id)));
    Object.keys(tutto.tables).forEach(t => assert.deepEqual(perId(tutte(t, x => x.id)), perId(tutto.tables[t]), t));
    assert.deepEqual(tutte('sync_tombstones', x => x.tab + '\t' + x.id), [{ tab: 'reminders', id: righe.reminders[0].id }]);
    assert.deepEqual(pagina('settings', null)[0].data, { currency: '€' });
    assert.throws(() => d.sql(`select public.pull_pagina('pg_authid', null, 2)`), /tabella sconosciuta/);
  }));

  it('e torna identico, passando da dbDaCloud', conDb(d => {
    pieno(d);
    const p = d.pull(null);
    a.eval(`globalThis.__tornato = dbDaCloud(${JSON.stringify(p.tables)})`);
    const tornato = senzaVuoti(ev(a, '__tornato'));
    const atteso = senzaVuoti(ev(a, 'nestDB(flattenDB(db, { stripSecrets: true, stripDerived: true }))'));
    atteso.items.forEach(i => { delete i.priceListSeeded; });
    Object.keys(atteso).forEach(c => assert.deepEqual(tornato[c], atteso[c], c));
    assert.deepEqual(p.settings.data, { currency: '€' });
  }));

  it('il ricevuto si legge dalla vista, somma dei ricevimenti', conDb(d => {
    pieno(d);
    assert.equal(d.sql(`select received from order_line_received where line_id = '${U(18)}'`), '40');
  }));

  it('vince chi ha scritto dopo: una versione più vecchia torna respinta', conDb(d => {
    pieno(d);
    const s = Object.assign({}, righe.suppliers[0], { name: 'Nuovo', updated_at: '2026-04-01T00:00:00.000Z' });
    assert.deepEqual(d.push({ upsert: { suppliers: [s] } }).rejected, []);
    const vecchio = Object.assign({}, s, { name: 'Vecchio', updated_at: '2026-03-15T00:00:00.000Z' });
    assert.deepEqual(d.push({ upsert: { suppliers: [vecchio] } }).rejected, [{ tab: 'suppliers', id: s.id }],
      'l\'app deve poterlo dire all\'utente: è il suo lavoro che non è passato');
    assert.equal(d.sql(`select name from suppliers where id = '${s.id}'`), 'Nuovo');
  }));

  // 0.105.6: con la versione di partenza decide la versione, non l'orologio
  // del PC. Un PC con l'orologio indietro scriveva una data più vecchia di
  // quella che il server aveva, e la sua modifica — fatta sulla copia giusta —
  // tornava respinta a ogni salvataggio. Vale anche per le righe figlie.
  it('con la versione di partenza giusta la modifica passa, anche con l\'orologio del PC indietro', conDb(d => {
    pieno(d);
    const s = righe.suppliers[0], ol = righe.order_lines[0];
    const indietro = '2020-01-01T00:00:00.000Z';
    const r = d.push({
      upsert: { suppliers: [Object.assign({}, s, { name: 'Da un PC indietro', updated_at: indietro })],
        order_lines: [Object.assign({}, ol, { note: 'riga da un PC indietro', updated_at: indietro })] },
      base: { suppliers: { [s.id]: s.updated_at }, order_lines: { [ol.id]: ol.updated_at } },
    });
    assert.deepEqual(r.rejected, []);
    assert.equal(d.sql(`select name from suppliers where id = '${s.id}'`), 'Da un PC indietro');
    assert.equal(d.sql(`select note from order_lines where id = '${ol.id}'`), 'riga da un PC indietro');
    // Una copia vecchia resta respinta, per quanto recente sia la sua data.
    const vecchia = d.push({
      upsert: { suppliers: [Object.assign({}, s, { name: 'Copia vecchia', updated_at: new Date().toISOString() })] },
      base: { suppliers: { [s.id]: s.updated_at } },
    });
    assert.deepEqual(vecchia.rejected, [{ tab: 'suppliers', id: s.id }]);
    assert.equal(d.sql(`select name from suppliers where id = '${s.id}'`), 'Da un PC indietro');
  }));

  // 0.105.6: i numeri dei documenti sono unici sul server. Un numero nuovo già
  // di un altro documento ferma l'invio, e il DETAIL dice quale riga.
  it('un numero di documento già usato da un altro non entra, e l\'errore dice quale', conDb(d => {
    pieno(d);
    const o = righe.orders[0];
    const doppio = Object.assign({}, o, { id: U(950), updated_at: new Date().toISOString() });
    let errore = null;
    try { d.push({ upsert: { orders: [doppio] } }); } catch (e) { errore = e; }
    assert.ok(errore, 'il doppione non deve entrare');
    assert.match(errore.message, /violates unique constraint "orders_numero_unico"/);
    const det = JSON.parse(/DETAIL:\s+(.*)/.exec(errore.message)[1]);
    assert.deepEqual(det, [{ tab: 'orders', id: U(950), numero: o.number }]);
    assert.equal(d.sql(`select count(*) from orders where number = '${o.number}'`), '1');
    // Anche passando di lato a push_changes c'è l'indice.
    assert.throws(() => d.sql(`insert into orders (id, number) values ('${U(951)}', '${o.number}')`), /orders_numero_unico/);
    // Il documento che il numero l'ha già si modifica come sempre.
    assert.deepEqual(d.push({ upsert: { orders: [Object.assign({}, o, { title: 'ritocco', updated_at: new Date().toISOString() })] } }).rejected, []);
  }));

  // Un archivio che ha già numeri doppi: lo schema si carica lo stesso, senza
  // l'indice su quella tabella, e i documenti doppi si modificano ancora.
  it('con doppioni già presenti lo schema si ricarica, e i doppioni si modificano ancora', conDb(d => {
    pieno(d);
    const o = righe.orders[0];
    d.sql(`drop index orders_numero_unico; insert into orders (id, number, updated_at) values ('${U(952)}', '${o.number}', '2026-03-01')`);
    d.sql(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8'));
    assert.equal(d.sql(`select count(*) from pg_indexes where indexname = 'orders_numero_unico'`), '0');
    assert.equal(d.sql(`select count(*) from pg_indexes where indexname = 'rfqs_numero_unico'`), '1');
    assert.deepEqual(d.push({ upsert: { orders: [Object.assign({}, o, { title: 'ancora', updated_at: new Date().toISOString() })] } }).rejected, []);
    assert.throws(() => d.push({ upsert: { orders: [Object.assign({}, o, { id: U(953), updated_at: new Date().toISOString() })] } }), /orders_numero_unico/);
  }));

  it('la distinta si sostituisce intera, e una vecchia non la tocca', conDb(d => {
    pieno(d);
    const g = righe.items.find(i => i.code === 'GRP-001');
    const comp = righe.item_components.filter(c => c.item_id === g.id);
    const nuovo = Object.assign({}, g, { updated_at: '2026-04-01T00:00:00.000Z' });
    d.push({ upsert: { items: [nuovo], item_components: [comp[0]] } });
    assert.equal(d.sql(`select count(*) from item_components where item_id = '${g.id}'`), '1');
    const vecchio = Object.assign({}, g, { updated_at: '2026-03-10T00:00:00.000Z' });
    const r = d.push({ upsert: { items: [vecchio], item_components: comp } });
    assert.ok(r.rejected.some(x => x.tab === 'items'));
    assert.equal(d.sql(`select count(*) from item_components where item_id = '${g.id}'`), '1',
      'un padre respinto si porta dietro i suoi figli');
  }));

  it('una cancellazione lascia la lapide, e la lapide cede solo a un ripristino', conDb(d => {
    pieno(d);
    const att = righe.attachments[0];
    const prima = d.pull(null).now;
    d.push({ remove: { attachments: [att.id] } });
    assert.deepEqual(d.pull(prima).removed, { attachments: [att.id] });
    assert.equal(d.push({ upsert: { attachments: [att] } }).rejected.length, 1, 'chi non sapeva della cancellazione non la annulla');
    const ripristino = Object.assign({}, att, { updated_at: new Date(Date.now() + 60000).toISOString() });
    assert.deepEqual(d.push({ upsert: { attachments: [ripristino] } }).rejected, []);
    assert.equal(d.sql(`select count(*) from sync_tombstones where id = '${att.id}'`), '0');
  }));

  // 0.105.3: con la versione di partenza è la modifica di una copia di prima
  // della cancellazione. Passava perché la sua data batteva la lapide, e il
  // padre tornava senza le righe che il delete aveva portato via.
  it('una modifica con la versione di partenza non passa sopra una lapide, per quanto recente', conDb(d => {
    pieno(d);
    const att = righe.attachments[0];
    d.push({ remove: { attachments: [att.id] } });
    const ritocco = Object.assign({}, att, { name: 'ritoccato', updated_at: new Date(Date.now() + 60000).toISOString() });
    const r = d.push({ upsert: { attachments: [ritocco] }, base: { attachments: { [att.id]: att.updated_at } } });
    assert.equal(r.rejected.length, 1, 'la cancellazione vince');
    assert.equal(d.sql(`select count(*) from attachments where id = '${att.id}'`), '0');
    assert.deepEqual(d.push({ upsert: { attachments: [ritocco] } }).rejected, [], 'un ripristino, senza versione di partenza, passa');
  }));

  // 0.105.4: un ripristino dichiarato toglie la lapide anche con una data più
  // vecchia (l'orologio del PC indietro). Solo per le righe che rimanda.
  it('un ripristino dichiarato passa sopra la lapide anche con una data vecchia', conDb(d => {
    pieno(d);
    const att = righe.attachments[0], altro = righe.reminders[0];
    d.push({ remove: { attachments: [att.id], reminders: [altro.id] } });
    const r = d.push({ upsert: { attachments: [att] }, ripristina: { attachments: [att.id], reminders: [altro.id] } });
    assert.deepEqual(r.rejected, []);
    assert.equal(d.sql(`select count(*) from attachments where id = '${att.id}'`), '1');
    assert.equal(d.sql(`select count(*) from sync_tombstones where id = '${altro.id}'`), '1', 'una riga che non viaggia resta cancellata');
  }));

  // 0.105.5: una riga scritta all'inizio di una transazione lunga ha un
  // synced_at più vecchio del pull fatto mentre era aperta. Il `now` di quel
  // pull ora non va oltre l'inizio della transazione, e il pull dopo la vede.
  it('una riga scritta da un invio ancora aperto arriva al pull successivo', conDb(d => {
    pieno(d);
    const { spawn } = require('node:child_process');
    const dorme = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    const rem = righe.reminders[0];
    spawn('psql', [process.env.BOMTRACK_PG + ' dbname=' + d.nome, '-q', '-c',
      `begin; update reminders set title = 'lento' where id = '${rem.id}'; select pg_sleep(2); commit;`], { stdio: 'ignore' });
    dorme(700);
    const durante = d.pull(null);
    assert.equal(durante.tables.reminders.find(r => r.id === rem.id).title === 'lento', false, 'mentre è aperta non si vede');
    for (let i = 0; i < 50 && d.sql(`select title from reminders where id = '${rem.id}'`) !== 'lento'; i++) dorme(200);
    const dopo = d.pull(durante.now);
    assert.ok((dopo.tables.reminders || []).some(r => r.id === rem.id && r.title === 'lento'), 'il pull dopo, dal suo istante, la porta');
  }));

  it('il pull da un istante porta solo ciò che è cambiato dopo', conDb(d => {
    pieno(d);
    const da = d.pull(null).now;
    const r = Object.assign({}, righe.reminders[0], { done: true, updated_at: '2026-04-01T00:00:00.000Z' });
    d.push({ upsert: { reminders: [r] } });
    const p = d.pull(da);
    const cambiate = Object.keys(p.tables).filter(t => p.tables[t].length);
    assert.deepEqual(cambiate, ['reminders']);
  }));

  it('D4 — un invio entra intero o non entra: dichiarazione e movimento insieme', conDb(d => {
    pieno(d);
    const decl = Object.assign({}, righe.production_declarations[0], { id: U(500), kind: 'avanzamento' });
    const mov = Object.assign({}, righe.stock_movements[0], { id: U(501), decl_id: U(500), item_id: U(777) });   // articolo inesistente
    assert.throws(() => d.push({ upsert: { production_declarations: [decl], stock_movements: [mov] } }), /foreign key/);
    assert.equal(d.sql(`select count(*) from production_declarations where id = '${U(500)}'`), '0',
      'senza il movimento la dichiarazione non deve restare: il magazzino non la vedrebbe');
  }));

  it('un fornitore citato non si cancella: lo dice il vincolo, al commit', conDb(d => {
    pieno(d);
    assert.throws(() => d.push({ remove: { suppliers: [U(1)] } }), /foreign key/);
    assert.equal(d.sql(`select count(*) from suppliers where id = '${U(1)}'`), '1');
  }));

  it('eliminare un documento citato per tracciabilità scollega, non blocca', conDb(d => {
    pieno(d);
    d.push({ remove: { rfqs: [U(14)] } });
    assert.equal(d.sql(`select coalesce(rfq_id::text, 'null') from orders where id = '${U(17)}'`), 'null');
  }));

  it('colonne e tabelle sconosciute fermano l\'invio, invece di sparire', conDb(d => {
    assert.throws(() => d.push({ upsert: { suppliers: [{ id: U(900), nome_sbagliato: 'x' }] } }), /colonne inesistenti: nome_sbagliato/);
    assert.throws(() => d.push({ upsert: { fornitori: [] } }), /tabelle sconosciute: fornitori/);
  }));

  it('i vincoli del modello: nessun articolo sulle righe di un ODL', conDb(d => {
    pieno(d);
    const w = Object.assign({}, righe.work_order_lines[0], { item_id: U(7), updated_at: '2026-04-01T00:00:00.000Z' });
    assert.throws(() => d.push({ upsert: { work_order_lines: [w] } }), /work_order_lines_mai_articolo/);
  }));
});

// ═══════════════════════════════════════════════════════════
//  D6 — chi legge e chi scrive
// ═══════════════════════════════════════════════════════════
function coppieSql(nome) {
  const blocco = SQL.match(new RegExp(`insert into public\\.${nome} \\([^)]*\\)[\\s\\S]*?;\\n`))[0];
  const out = [];
  const re = /\('(\w+)', '(\w+)'\)/g;
  let m;
  while ((m = re.exec(blocco))) out.push([m[1], m[2]]);
  return out;
}

describe('I permessi del database sono quelli dell\'app', () => {
  const a = app(makeDb({}));
  it('role_areas è ROLE_WRITE, riga per riga', () => {
    const atteso = ev(a, 'Object.keys(ROLE_WRITE).flatMap(r => ROLE_WRITE[r].map(x => [r, x]))').map(x => x.join(':')).sort();
    assert.deepEqual(coppieSql('role_areas').map(x => x.join(':')).sort(), atteso);
  });

  it('ogni tabella sincronizzata ha almeno un\'area che la scrive, e solo aree vere', () => {
    const aree = new Set(ev(a, 'Object.values(ROLE_WRITE).flat()'));
    const perTabella = {};
    coppieSql('table_areas').forEach(([t, x]) => {
      assert.ok(aree.has(x), `${t}: area sconosciuta ${x}`);
      (perTabella[t] = perTabella[t] || []).push(x);
    });
    Object.keys(registroSql()).concat(['settings', 'sync_tombstones'])
      .forEach(t => assert.ok(perTabella[t], `nessuno può scrivere ${t}`));
  });
});

describe('Postgres: permessi per ruolo (D6)', () => {
  if (!pg.disponibile()) {
    it('saltato: BOMTRACK_PG non impostata (vedi test/pg.js)', () => {});
    return;
  }
  const a = app(dbCompleto());
  const righe = ev(a, 'dbVersoCloud(db)');
  const ADMIN = righe.profiles[0].id;
  const ACQ = U(601), PROG = U(602), LETT = U(603), SOSP = U(604), OFF = U(605);
  const conDb = fn => async () => {
    const d = pg.nuovoDatabase();
    try {
      d.utenti([ADMIN, ACQ, PROG, LETT, SOSP, OFF]);
      d.push({ upsert: righe });   // da superutente: è il caricamento iniziale
      d.sql(`insert into profiles (id, name, role, active) values
        ('${ACQ}', 'Bruno', 'acquisti', true), ('${PROG}', 'Carla', 'progettazione', true),
        ('${LETT}', 'Dario', 'lettore', true), ('${SOSP}', 'Elena', 'acquisti', false),
        ('${OFF}', 'Franco', 'officina', true);`);
      await fn(d);
    } finally { d.chiudi(); }
  };
  const dopo = (r, campi) => Object.assign({}, r, campi, { updated_at: '2026-05-01T00:00:00.000Z' });
  const ordine = () => dopo(righe.orders[0], { title: 'modificato' });
  const articolo = () => dopo(righe.items[0], { name: 'modificato' });

  it('acquisti scrive gli ordini, non gli articoli', conDb(d => {
    assert.deepEqual(d.come(ACQ).push({ upsert: { orders: [ordine()] } }).rejected, []);
    assert.throws(() => d.come(ACQ).push({ upsert: { items: [articolo()] } }), /il ruolo acquisti non scrive: items/);
  }));

  it('progettazione scrive gli articoli, non gli ordini', conDb(d => {
    assert.deepEqual(d.come(PROG).push({ upsert: { items: [articolo()] } }).rejected, []);
    assert.throws(() => d.come(PROG).push({ upsert: { orders: [ordine()] } }), /il ruolo progettazione non scrive: orders/);
  }));

  it('un invio con anche una sola tabella vietata non entra per niente', conDb(d => {
    assert.throws(() => d.come(ACQ).push({ upsert: { orders: [ordine()], items: [articolo()] } }), /non scrive: items/);
    assert.equal(d.sql(`select title from orders where id = '${righe.orders[0].id}'`), '', 'nemmeno la parte permessa');
  }));

  it('acquisti registra ricevimenti e movimenti: nascono dal suo lavoro', conDb(d => {
    const rc = Object.assign({}, righe.order_receipts[0], { id: U(700), qty: 5 });
    const mv = Object.assign({}, righe.stock_movements[0], { id: U(701) });
    assert.deepEqual(d.come(ACQ).push({ upsert: { order_receipts: [rc], stock_movements: [mv] } }).rejected, []);
  }));

  it('l\'officina registra ricevimenti, movimenti e avanzamento, ma non scrive ordini nuovi né articoli', conDb(d => {
    const rc = Object.assign({}, righe.order_receipts[0], { id: U(710), qty: 5 });
    const mv = Object.assign({}, righe.stock_movements[0], { id: U(711) });
    assert.deepEqual(d.come(OFF).push({ upsert: { order_receipts: [rc], stock_movements: [mv] } }).rejected, []);
    assert.throws(() => d.come(OFF).push({ upsert: { items: [articolo()] } }), /il ruolo officina non scrive: items/);
    assert.throws(() => d.come(OFF).push({ upsert: { rfqs: [dopo(righe.rfqs[0], { title: 'x' })] } }), /il ruolo officina non scrive: rfqs/);
  }));

  // 0.105.4: le policy dicono quali tabelle, non quali colonne. Dall'API
  // l'officina cambiava fornitore e prezzi di un ordine, o lo eliminava.
  it('l\'officina sui documenti cambia lo stato e basta, anche dall\'API', conDb(d => {
    const o = righe.orders[0], ol = righe.order_lines[0], odp = righe.production_orders[0];
    assert.deepEqual(d.come(OFF).push({ upsert: { orders: [dopo(o, { status: 'evaso' })] } }).rejected, []);
    assert.equal(d.sql(`select status from orders where id = '${o.id}'`), 'evaso');
    const r = d.come(OFF).push({ upsert: { orders: [Object.assign(dopo(o, { status: 'evaso', supplier_id: null }), { updated_at: '2026-06-01T00:00:00.000Z' })],
      order_lines: [dopo(ol, { price: 0.01 })], production_orders: [dopo(odp, { qty: 999 })] } });
    assert.deepEqual(r.rejected.map(x => x.tab).sort(), ['order_lines', 'orders', 'production_orders']);
    assert.notEqual(d.sql(`select coalesce(supplier_id::text, '-') from orders where id = '${o.id}'`), '-');
    assert.notEqual(d.sql(`select price from order_lines where id = '${ol.id}'`), '0.01');
    assert.equal(d.come(OFF).push({ upsert: { orders: [dopo(o, { id: U(720), number: 'ODA-2026-720' })] } }).rejected.length, 1, 'un ordine nuovo no');
    assert.throws(() => d.come(OFF).push({ remove: { orders: [o.id] } }), /il ruolo officina non elimina orders/);
    assert.throws(() => d.come(OFF).push({ remove: { order_lines: [ol.id] } }), /non elimina order_lines/);
    assert.equal(d.sql('select count(*) from sync_tombstones'), '0');
    // L'ODL che nasce da una fase esterna dell'ordine di produzione sì.
    const w = righe.work_orders[0], wl = righe.work_order_lines[0];
    const odl = dopo(w, { id: U(721), number: 'ODL-2026-721' }), riga = dopo(wl, { id: U(722), work_order_id: U(721) });
    assert.deepEqual(d.come(OFF).push({ upsert: { work_orders: [odl], work_order_lines: [riga] } }).rejected, []);
    // Acquisti invece scrive tutto.
    assert.deepEqual(d.come(ACQ).push({ upsert: { order_lines: [dopo(ol, { price: 0.01 })] } }).rejected, []);
  }));

  // 0.105.4: una voce del cestino la scrive solo chi scrive il record che contiene.
  it('il cestino: una voce la scrive chi scrive il suo record, e la toglie chiunque elimini', conDb(d => {
    const voce = (id, coll) => ({ id, coll, deleted_at: '2026-05-01T00:00:00.000Z', deleted_by: OFF, record: { id: U(731), name: 'finto' } });
    assert.throws(() => d.come(OFF).push({ upsert: { trash: [voce(U(730), 'items')] } }), /row-level security/);
    assert.deepEqual(d.come(OFF).push({ upsert: { trash: [voce(U(732), 'prodDecls')] } }).rejected, []);
    assert.deepEqual(d.come(PROG).push({ upsert: { trash: [voce(U(730), 'items')] } }).rejected, []);
    d.come(OFF).push({ remove: { trash: [U(730)] } });
    assert.equal(d.sql(`select count(*) from trash where id = '${U(730)}'`), '0', 'svuotare il cestino resta di tutti');
  }));

  // 0.106.0: la pulizia la chiede chiunque abbia un profilo attivo, anche un
  // lettore; un profilo sospeso no.
  it('la pulizia del server: un lettore la chiede, un sospeso no', conDb(d => {
    assert.throws(() => d.come(SOSP).sql('select public.pulizia_archivio();'), /nessun profilo attivo/);
    assert.equal(JSON.parse(d.come(LETT).sql('select public.pulizia_archivio();')).fatta, true);
    assert.equal(d.come(LETT).sql('select count(*) from sync_stato;'), '0', 'lo stato non si legge direttamente');
  }));

  it('la tabella di ogni collezione è quella di SCHEMA', conDb(d => {
    const attese = ev(a, 'Object.fromEntries(Object.keys(SCHEMA).map(c => [c, SCHEMA[c].table]))');
    Object.keys(attese).forEach(c => assert.equal(d.sql(`select coalesce(public.tabella_di_coll('${c}'), '-')`), attese[c], c));
    assert.equal(d.sql(`select coalesce(public.tabella_di_coll('nessuna'), '-')`), '-');
  }));

  it('una cancellazione vietata si ferma, invece di lasciare una lapide senza cancellare', conDb(d => {
    assert.throws(() => d.come(ACQ).push({ remove: { attachments: [righe.attachments[0].id] } }), /non scrive: attachments/);
    assert.equal(d.sql('select count(*) from sync_tombstones'), '0');
    assert.equal(d.sql(`select count(*) from attachments`), '1');
  }));

  // 0.105.4: l'ultimo amministratore attivo non si elimina, nemmeno dal
  // pannello; e un archivio con dei profili non regala più l'amministrazione.
  it('l\'ultimo amministratore non si elimina, e il primo arrivato è amministratore solo su un archivio vuoto', conDb(d => {
    assert.throws(() => d.push({ remove: { profiles: [ADMIN] } }), /deve restare almeno un amministratore attivo/);
    assert.throws(() => d.sql(`delete from auth.users where id = '${ADMIN}'`), /deve restare almeno un amministratore attivo/);
    d.sql(`update profiles set role = 'admin' where id = '${ACQ}'`);
    d.push({ remove: { profiles: [ACQ] } });
    assert.equal(d.sql(`select count(*) from profiles where id = '${ACQ}'`), '0', 'con un altro amministratore si elimina');
    // Un archivio rimasto senza amministratori attivi (com'era possibile prima).
    d.sql(`set session_replication_role = replica; update profiles set active = false where id = '${ADMIN}'; set session_replication_role = origin;`);
    d.invita(U(740), 'nuovo@x.it', 'Nuovo');
    assert.equal(d.sql(`select role || ' ' || active from profiles where id = '${U(740)}'`), 'lettore false');
  }));

  it('il lettore legge tutto e non scrive niente', conDb(d => {
    assert.ok(d.come(LETT).pull(null).tables.items.length > 0);
    assert.throws(() => d.come(LETT).push({ upsert: { reminders: [dopo(righe.reminders[0], { done: true })] } }), /il ruolo lettore non scrive: reminders/);
  }));

  it('un utente sospeso non legge più niente, anche con la sessione aperta', conDb(d => {
    const p = d.come(SOSP).pull(null);
    assert.deepEqual(Object.keys(p.tables).filter(t => p.tables[t].length), ['profiles'],
      'solo il proprio profilo: è così che la sospensione arriva al suo PC');
    assert.deepEqual(p.tables.profiles.map(x => [x.id, x.active]), [[SOSP, false]]);
    assert.throws(() => d.come(SOSP).push({ upsert: { orders: [ordine()] } }), /nessun profilo attivo/);
  }));

  it('le impostazioni sono della gestione', conDb(d => {
    assert.throws(() => d.come(ACQ).push({ settings: { data: {} } }), /non scrive: settings/);
    d.come(ADMIN).push({ settings: { data: { currency: '$' } } });
    assert.equal(d.sql(`select data->>'currency' from settings`), '$');
  }));

  it('il proprio profilo si aggiorna, il proprio ruolo no', conDb(d => {
    d.come(ACQ).sql(`update profiles set color = '#123456' where id = '${ACQ}'`);
    assert.equal(d.sql(`select color from profiles where id = '${ACQ}'`), '#123456');
    assert.throws(() => d.come(ACQ).sql(`update profiles set role = 'admin' where id = '${ACQ}'`), /solo la gestione utenti/);
    assert.equal(d.sql(`select role from profiles where id = '${ACQ}'`), 'acquisti');
  }));

  // 0.105.3: con l'email dell'amministratore nel proprio profilo, il link per
  // reimpostare la password chiesto «per sé» portava al suo account.
  it('la propria email non si cambia dall\'API; il SQL Editor ripara un profilo', conDb(d => {
    assert.throws(() => d.come(LETT).sql(`update profiles set email = 'admin@x.it' where id = '${LETT}'`), /solo la gestione utenti/);
    d.sql(`update profiles set role = 'acquisti', email = 'nuova@x.it' where id = '${LETT}'`);
    assert.equal(d.sql(`select role || ' ' || email from profiles where id = '${LETT}'`), 'acquisti nuova@x.it');
  }));

  it('una lapide la scrive solo chi scrive la sua tabella', conDb(d => {
    assert.throws(() => d.come(OFF).sql(`insert into sync_tombstones (tab, id) values ('items', '${righe.items[0].id}')`), /row-level security/);
    assert.equal(d.sql('select count(*) from sync_tombstones'), '0');
  }));

  it('un updated_at nel futuro non entra: un PC con l\'orologio avanti non blocca i colleghi', conDb(d => {
    const futuro = Object.assign({}, righe.items[0], { name: 'dal futuro', updated_at: '2099-01-01T00:00:00.000Z' });
    assert.throws(() => d.come(PROG).push({ upsert: { items: [futuro] } }), /orologio di questo PC è avanti/);
    assert.throws(() => d.come(PROG).sql(`update items set updated_at = '2099-01-01' where id = '${righe.items[0].id}'`), /orologio/);
    assert.deepEqual(d.come(PROG).push({ upsert: { items: [articolo()] } }).rejected, []);
  }));

  // 0.105.6: le richieste d'offerta sono dei documenti. La progettazione le
  // poteva scrivere dall'API, anche quelle già spedite.
  it('progettazione non scrive le richieste d\'offerta', conDb(d => {
    assert.throws(() => d.come(PROG).push({ upsert: { rfqs: [dopo(righe.rfqs[0], { title: 'x' })] } }), /il ruolo progettazione non scrive: rfqs/);
    assert.throws(() => d.come(PROG).push({ upsert: { rfq_lines: [dopo(righe.rfq_lines[0], { price: 1 })] } }), /non scrive: rfq_lines/);
    assert.deepEqual(d.come(ACQ).push({ upsert: { rfqs: [dopo(righe.rfqs[0], { title: 'x' })] } }).rejected, []);
  }));

  // 0.105.6: chi ha scritto lo dice il server, non il PC. Un invio poteva
  // dichiarare autore chiunque, e lo storico lo mostrava.
  it('autore di una modifica, di un documento nuovo, di una voce del cestino e delle impostazioni: chi invia', conDb(d => {
    const o = righe.orders[0];
    const creatore = d.sql(`select coalesce(created_by::text, '-') from orders where id = '${o.id}'`);
    assert.deepEqual(d.come(ACQ).push({ upsert: { orders: [dopo(o, { title: 'di Bruno', updated_by: ADMIN, created_by: ADMIN })] } }).rejected, []);
    assert.equal(d.sql(`select updated_by from orders where id = '${o.id}'`), ACQ);
    assert.equal(d.sql(`select coalesce(created_by::text, '-') from orders where id = '${o.id}'`), creatore, 'chi l\'ha creato non cambia');
    // Un documento nato adesso: anche chi l'ha creato è chi invia.
    const ora = new Date().toISOString();
    const nuovo = Object.assign({}, o, { id: U(740), number: 'ODA-2026-740', created_at: ora, updated_at: ora, created_by: ADMIN, updated_by: ADMIN });
    assert.deepEqual(d.come(ACQ).push({ upsert: { orders: [nuovo] } }).rejected, []);
    assert.equal(d.sql(`select created_by || ' ' || updated_by from orders where id = '${U(740)}'`), ACQ + ' ' + ACQ);
    // L'officina che cambia lo stato di un ordine appena creato da un altro passa ancora.
    assert.deepEqual(d.come(OFF).push({ upsert: { orders: [Object.assign({}, nuovo, { status: 'evaso', updated_at: new Date().toISOString() })] } }).rejected, []);
    assert.equal(d.sql(`select created_by || ' ' || updated_by || ' ' || status from orders where id = '${U(740)}'`), ACQ + ' ' + OFF + ' evaso');
    // Il cestino e le impostazioni.
    const voce = { id: U(741), coll: 'orders', deleted_at: new Date().toISOString(), deleted_by: ADMIN, record: { id: U(742) } };
    d.come(ACQ).push({ upsert: { trash: [voce] } });
    assert.equal(d.sql(`select deleted_by from trash where id = '${U(741)}'`), ACQ);
    d.come(ADMIN).push({ settings: { data: { currency: '€' }, updated_at: new Date().toISOString(), updated_by: ACQ } });
    assert.equal(d.sql('select updated_by from settings'), ADMIN);
    // Il caricamento iniziale, di righe vecchie, tiene i loro autori.
    const storico = Object.assign({}, o, { id: U(743), number: 'ODA-2026-743', created_by: ADMIN, updated_by: ADMIN });
    d.come(ACQ).push({ upsert: { orders: [storico] } });
    assert.equal(d.sql(`select created_by || ' ' || updated_by from orders where id = '${U(743)}'`), ADMIN + ' ' + ADMIN);
  }));

  // 0.105.6: riserva_numeri leggeva i numeri usati prima di prendere il
  // lucchetto della serie, e l'invio che chiudeva un impegno non lo prendeva.
  // Un documento arrivato mentre la riserva aspettava il lucchetto non era né
  // fra gli usati (letti prima) né fra gli impegni (chiusi dopo): il suo
  // numero tornava libero, e lo prendeva un altro.
  it('un numero chiuso da un invio mentre la riserva aspetta non si dà due volte', conDb(d => {
    const { spawn } = require('node:child_process');
    const prefisso = 'ODA-' + new Date().getFullYear() + '-';
    const n = JSON.parse(d.come(ACQ).sql(`select to_jsonb(public.riserva_numeri('${prefisso}', 1, 0))`))[0];
    const conn = process.env.BOMTRACK_PG + ' dbname=' + d.nome;
    const come = uid => `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`;
    const lancia = sql => new Promise(ok => {
      let out = '';
      const p = spawn('psql', [conn, '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql]);
      p.stdout.on('data', x => { out += x; });
      p.stderr.on('data', x => { out += x; });
      p.on('close', () => ok(out.trim()));
    });
    const doc = Object.assign({}, righe.orders[0], { id: U(760), number: prefisso + String(n).padStart(3, '0'), updated_at: new Date().toISOString() });
    const lettera = `$j$${JSON.stringify({ upsert: { orders: [doc] } })}$j$::jsonb`;
    return Promise.all([
      // Un'altra riserva della stessa serie, lenta: tiene il lucchetto.
      lancia(`begin; select pg_advisory_xact_lock(hashtext('bomtrack-numeri:${prefisso}')); select pg_sleep(2); commit;`),
      // La riserva di Carla arriva e aspetta il lucchetto.
      lancia(`select pg_sleep(0.4); ${come(ADMIN)} select 'R' || (public.riserva_numeri('${prefisso}', 1, 0))[1];`),
      // Intanto arriva l'ordine di Bruno con il numero che aveva riservato.
      lancia(`select pg_sleep(0.9); ${come(ACQ)} select 'P' || public.push_changes(${lettera})::text;`),
    ]).then(([, carla]) => {
      const preso = Number((/R(\d+)/.exec(carla) || [])[1]);
      assert.ok(preso, carla);
      assert.notEqual(preso, n, 'lo stesso numero dato a due');
    });
  }));

  it('il tipo di un articolo è uno dei sei', conDb(d => {
    const strano = dopo(righe.items[0], { type: '<img src=x onerror=alert(1)>' });
    assert.throws(() => d.come(PROG).push({ upsert: { items: [strano] } }), /items_tipo_noto/);
  }));

  it('i registri si leggono e non si scrivono', conDb(d => {
    assert.equal(d.come(LETT).sql('select count(*) from role_areas'), String(ev(app(makeDb({})), 'Object.values(ROLE_WRITE).flat().length')));
    assert.throws(() => d.come(ADMIN).sql(`insert into role_areas values ('lettore', 'docs')`), /row-level security/);
  }));
});
