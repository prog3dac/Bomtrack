// Il backup dell'archivio condiviso (dalla 0.107.0): supabase/backup.sh e
// supabase/ripristino.sh, che si lanciano dal proprio PC, e il workflow
// notturno che tiene sveglio Supabase senza portare dati su GitHub (0.111.1).
//
// Un backup che non si è mai ripristinato è una speranza, non un backup. Dove
// c'è un Postgres (BOMTRACK_PG) si fa il giro intero: un archivio completo
// esce cifrato, rientra in un progetto nuovo e torna identico, tabella per
// tabella, con autori e versioni come erano. Senza Postgres girano solo i
// controlli sul workflow.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { dbCloudCompleto } = require('./fixtures.js');
const pg = require('./pg.js');

const ROOT = path.join(__dirname, '..');
const leggi = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('Supabase sveglio: il workflow', () => {
  const wf = leggi('.github/workflows/supabase-veglia.yml');

  it('gira ogni giorno, e si può lanciare a mano', () => {
    assert.match(wf, /schedule:\s*\n\s*- cron: '\d+ \d+ \* \* \*'/);
    assert.match(wf, /workflow_dispatch:/);
  });

  it('su GitHub resta solo il codice: nessun dato esce dal workflow', () => {
    // Il repo è pubblico: un artifact lo scarica chiunque abbia un account
    // GitHub. Dalla 0.111.1 l'archivio e gli utenti non ci passano, nemmeno
    // cifrati, e il workflow non ha più la password del database.
    const codice = wf.split('\n').filter(r => !/^\s*#/.test(r)).join('\n');   // senza i commenti
    assert.doesNotMatch(codice, /upload-artifact/);
    assert.doesNotMatch(codice, /backup\.sh|pg_dump/);
    assert.doesNotMatch(codice, /SUPABASE_DB_URL|BACKUP_PASSPHRASE/);
  });

  it('senza segreti impostati non fallisce: lo dice e salta', () => {
    assert.match(wf, /SUPABASE_URL: \$\{\{ secrets\.SUPABASE_URL \}\}/);
    assert.match(wf, /SUPABASE_KEY: \$\{\{ secrets\.SUPABASE_KEY \}\}/);
    assert.match(wf, /::notice::/);
  });
});

describe('Backup dal PC: gli script', () => {
  it('gli script sono eseguibili e falliscono al primo errore', () => {
    ['supabase/backup.sh', 'supabase/ripristino.sh'].forEach(f => {
      assert.match(leggi(f), /^#!\/usr\/bin\/env bash\n/, f);
      assert.match(leggi(f), /set -euo pipefail/, f);
      const modo = execFileSync('git', ['ls-files', '-s', f], { cwd: ROOT, encoding: 'utf8' });
      assert.match(modo, /^100755 /, f + ' va registrato come eseguibile');
    });
  });
});

describe('Backup dal PC: il giro intero su Postgres', () => {
  const strumenti = ['pg_dump', 'gpg', 'gzip'].every(c => {
    try { execFileSync(c, ['--version'], { stdio: 'ignore' }); return true; } catch (e) { return false; }
  });
  if (!pg.disponibile() || !strumenti) {
    it('saltato: servono BOMTRACK_PG (vedi test/pg.js), pg_dump e gpg', () => {});
    return;
  }
  const CONN = process.env.BOMTRACK_PG;
  const FRASE = 'una frase lunga e segreta';
  const a = loadApp({ silent: true });
  a.setDb(dbCloudCompleto());
  const righe = JSON.parse(a.eval('JSON.stringify(dbVersoCloud(db))'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bomtrack-backup-'));
  const file = path.join(tmp, 'archivio.sql.gz.gpg');

  const lancia = (script, db, frase, arg) => execFileSync('bash', [path.join(ROOT, 'supabase', script), arg], {
    env: Object.assign({}, process.env, { SUPABASE_DB_URL: CONN + ' dbname=' + db, BACKUP_PASSPHRASE: frase }),
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Ogni tabella di public e gli utenti di Auth, riga per riga, in un ordine fisso.
  const fotografia = d => {
    const tabelle = d.sql(`select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' order by 1`).split('\n');
    const out = {};
    tabelle.concat(['auth.users']).forEach(t => {
      out[t] = d.sql(`select coalesce(json_agg(r order by to_jsonb(r)::text), '[]') from ${t.includes('.') ? t : 'public.' + t} r`);
    });
    return out;
  };

  let origine, prima;
  it('un archivio intero esce cifrato', () => {
    origine = pg.nuovoDatabase();
    origine.utenti(righe.profiles.map(r => r.id));
    assert.deepEqual(origine.push({ upsert: righe, settings: { data: { currency: '€' } } }).rejected, []);
    prima = fotografia(origine);
    lancia('backup.sh', origine.nome, FRASE, file);
    const contenuto = fs.readFileSync(file);
    assert.ok(contenuto.length > 0);
    // Né il codice di un articolo né il nome di una tabella si leggono nel file.
    [righe.items[0].code, 'insert into', 'public.items'].forEach(s => assert.ok(!contenuto.includes(s), s + ' in chiaro'));
  });

  it('rientra identico in un progetto nuovo', () => {
    const nuovo = pg.nuovoDatabase();
    try {
      lancia('ripristino.sh', nuovo.nome, FRASE, file);
      const dopo = fotografia(nuovo);
      assert.deepEqual(Object.keys(dopo), Object.keys(prima));
      Object.keys(prima).forEach(t => assert.equal(dopo[t], prima[t], t));
      assert.equal(JSON.parse(dopo.items).length, righe.items.length);
    } finally { nuovo.chiudi(); }
  });

  it('con la frase sbagliata non entra niente', () => {
    const nuovo = pg.nuovoDatabase();
    try {
      assert.throws(() => lancia('ripristino.sh', nuovo.nome, 'un\'altra frase', file));
      assert.equal(nuovo.sql('select count(*) from public.items'), '0');
    } finally { nuovo.chiudi(); }
  });

  it('a ripristino fatto, pulizia', () => {
    if (origine) origine.chiudi();
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
