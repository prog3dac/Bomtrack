// Un Postgres per i test, senza dipendenze: si parla con `psql`.
//
// Attivo solo se la variabile BOMTRACK_PG contiene i parametri di connessione
// (es. "host=localhost port=5432 user=postgres"); altrimenti `disponibile()`
// è falso e i test che ne hanno bisogno si dichiarano saltati. In CI il
// servizio c'è (.github/workflows/test.yml); in locale basta un Postgres
// qualsiasi con un utente che possa creare database.

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const CONN = process.env.BOMTRACK_PG || '';
const ROOT = path.join(__dirname, '..');

function disponibile() {
  if (!CONN) return false;
  try { execFileSync('psql', ['--version'], { stdio: 'ignore' }); return true; }
  catch (e) { return false; }
}

// Esegue `sql` sul database `db` e restituisce l'output senza allineamento.
// Gli errori di Postgres arrivano come eccezione con il messaggio del server.
function esegui(db, sql) {
  try {
    return execFileSync('psql', [CONN + ' dbname=' + db, '-v', 'ON_ERROR_STOP=1', '-q', '-At', '-f', '-'],
      { input: 'set client_min_messages = warning;\n' + sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 }).trim();
  } catch (e) {
    const msg = String(e.stderr || e.message).split('\n').filter(r => /ERROR|DETAIL|CONTEXT/.test(r)).join('\n');
    const err = new Error(msg || String(e.message));
    err.sqlState = msg;
    throw err;
  }
}
const letterale = json => {
  const s = JSON.stringify(json);
  let tag = 'j';
  while (s.includes('$' + tag + '$')) tag += 'j';
  return `$${tag}$${s}$${tag}$::jsonb`;
};

// Un database nuovo, con lo stub di Supabase e lo schema caricati.
let progressivo = 0;
function nuovoDatabase() {
  const nome = `bomtrack_test_${process.pid}_${++progressivo}`;
  esegui('postgres', `drop database if exists ${nome}; create database ${nome};`);
  esegui(nome, require('node:fs').readFileSync(path.join(__dirname, 'supabase-stub.sql'), 'utf8'));
  esegui(nome, require('node:fs').readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8'));
  return {
    nome,
    sql: q => esegui(nome, q),
    push: payload => JSON.parse(esegui(nome, `select public.push_changes(${letterale(payload)});`)),
    // Le stesse chiamate come un utente dell'app: ruolo `authenticated` e il suo
    // id dove auth.uid() lo legge. Il superutente ignora RLS, e un test di
    // permessi fatto da lui non proverebbe niente.
    come: uid => {
      const pre = `set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false) \\g /dev/null\n`;
      return {
        sql: q => esegui(nome, pre + q),
        push: payload => JSON.parse(esegui(nome, pre + `select public.push_changes(${letterale(payload)});`)),
        pull: since => JSON.parse(esegui(nome, pre + `select public.pull_changes(${since ? `'${since}'::timestamptz` : 'null'});`)),
      };
    },
    pull: since => JSON.parse(esegui(nome, `select public.pull_changes(${since ? `'${since}'::timestamptz` : 'null'});`)),
    // Utenti di Supabase Auth **senza** il profilo che il trigger affianca loro:
    // nei test i profili li porta l'invio, come nella migrazione vera, dove
    // l'app li manda con una data più recente di quella del trigger.
    utenti: ids => ids.length && esegui(nome, `insert into auth.users (id) select unnest(array[${ids.map(i => `'${i}'::uuid`).join(',')}]) on conflict do nothing;
      set session_replication_role = replica;  -- senza trigger: il primo è l'ultimo amministratore, e non si eliminerebbe
      delete from public.profiles where id = any(array[${ids.map(i => `'${i}'::uuid`).join(',')}]);
      set session_replication_role = origin;`),
    // Un utente come lo crea un invito: la riga in auth.users, e il trigger fa il resto.
    invita: (id, email, chi) => esegui(nome, `insert into auth.users (id, email, raw_user_meta_data) values ('${id}', '${email}', ${chi ? `'${JSON.stringify({ name: chi })}'::jsonb` : 'null'});`),
    chiudi: () => { try { esegui('postgres', `drop database if exists ${nome};`); } catch (e) { /* resta: si vede */ } },
  };
}

module.exports = { disponibile, nuovoDatabase };
