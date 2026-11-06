// tools/versione.js: il numero di versione al merge (dalla 0.141.0).
//
// Su un repository finto, in una cartella temporanea: main e un ramo partono
// dalla 0.1.0, prendono tutti e due la 0.2.0, e il ramo arriva secondo.
// Lo script deve fondere main, dare al ramo la 0.3.0 dappertutto — anche nei
// commenti «dalla 0.2.0» che il ramo aveva scritto — e fermarsi davanti a un
// conflitto vero invece di risolverlo a caso.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { describe, it } = require('./tap.js');

const ROOT = path.join(__dirname, '..');
let gitOk = true, pyOk = true;
try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch (e) { gitOk = false; }
try { execFileSync('python3', ['--version'], { stdio: 'ignore' }); } catch (e) { pyOk = false; }

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bomtrack-versione-'));
  const origine = path.join(dir, 'origine.git'), w = path.join(dir, 'w');
  const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origine]);
  execFileSync('git', ['clone', '-q', origine, w], { stdio: 'ignore' });
  g(w, 'config', 'user.email', 'prova@example.com'); g(w, 'config', 'user.name', 'Prova');
  g(w, 'checkout', '-q', '-b', 'main');
  const scrivi = (f, s) => { fs.mkdirSync(path.dirname(path.join(w, f)), { recursive: true }); fs.writeFileSync(path.join(w, f), s); };
  const leggi = f => fs.readFileSync(path.join(w, f), 'utf8');
  fs.mkdirSync(path.join(w, 'tools'));
  fs.copyFileSync(path.join(ROOT, 'tools', 'versione.js'), path.join(w, 'tools', 'versione.js'));
  fs.copyFileSync(path.join(ROOT, 'genera-manuale.py'), path.join(w, 'genera-manuale.py'));
  const versione = (v, voce, data) => {
    const log = fs.existsSync(path.join(w, 'CHANGELOG.md')) ? leggi('CHANGELOG.md') : '# Changelog\n\nLe revisioni.\n\n';
    const [testa, ...resto] = log.split(/(?=^### )/m);
    scrivi('CHANGELOG.md', testa + `### ${v} — ${data || '2026-01-01'}\n\n${voce}\n\n` + resto.join(''));
    scrivi('core.js', `// app\nconst APP_VERSION = '${v}';\nfunction a() { return 1; }\n`);
    scrivi('sw.js', `const VERSIONE = '${v}';\n`);
    const m = fs.existsSync(path.join(w, 'MANUALE.md')) ? leggi('MANUALE.md') : '# Manuale\n\n**Versione dell\'app documentata: 0.0.0**\n\n## 1. Inizio\n\nTesto.\n';
    scrivi('MANUALE.md', m.replace(/\*\*Versione dell'app documentata: [^*]+\*\*/, `**Versione dell'app documentata: ${v}**`));
    execFileSync('python3', ['genera-manuale.py', 'MANUALE.md', 'manuale.html'], { cwd: w, stdio: 'ignore' });
  };
  versione('0.1.0', 'Primo.');
  scrivi('altro.js', 'const x = 1;\n');
  g(w, 'add', '-A'); g(w, 'commit', '-q', '-m', 'inizio'); g(w, 'push', '-q', 'origin', 'main');
  const lancia = (...a) => spawnSync(process.execPath, [path.join(w, 'tools', 'versione.js'), ...a], { cwd: w, encoding: 'utf8' });
  return { dir, w, g: (...a) => g(w, ...a), scrivi, leggi, versione, lancia, chiudi: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

describe('Il numero di versione si decide al merge', () => {
  if (!gitOk || !pyOk) { it('saltato: servono git e python3', () => {}); return; }

  it('il ramo che arriva secondo prende il numero dopo, dappertutto', () => {
    const r = repo();
    try {
      // Il ramo: la sua 0.2.0, con un file nuovo e un capitolo che la citano.
      r.g('checkout', '-q', '-b', 'lavoro');
      r.scrivi('nuovo.js', '// Il pulsante nuovo (dalla 0.2.0).\nfunction b() { return 2; }\n');
      r.scrivi('MANUALE.md', r.leggi('MANUALE.md') + '\n## 2. Il pulsante (dalla 0.2.0)\n\nPremilo.\n');
      r.versione('0.2.0', 'Il pulsante nuovo.');
      r.g('add', '-A'); r.g('commit', '-q', '-m', 'pulsante');
      // Intanto main ha preso la 0.2.0 per un altro lavoro.
      r.g('checkout', '-q', 'main');
      r.scrivi('altro.js', 'const x = 2;   // dalla 0.2.0\n');
      r.versione('0.2.0', 'La correzione di un altro.');
      r.g('add', '-A'); r.g('commit', '-q', '-m', 'altro'); r.g('push', '-q', 'origin', 'main');
      r.g('checkout', '-q', 'lavoro');

      const es = r.lancia('minor');
      assert.equal(es.status, 0, es.stderr);
      assert.match(es.stdout, /0\.2\.0 → 0\.3\.0/);
      const log = r.leggi('CHANGELOG.md');
      assert.deepEqual([...log.matchAll(/^### (0\.\d+\.\d+)/gm)].map(m => m[1]), ['0.3.0', '0.2.0', '0.1.0']);
      assert.match(log, /### 0\.3\.0[^\n]*\n\nIl pulsante nuovo\./);
      assert.match(log, /### 0\.2\.0[^\n]*\n\nLa correzione di un altro\./, 'la voce di main resta com\'è');
      assert.match(r.leggi('core.js'), /APP_VERSION = '0\.3\.0'/);
      assert.match(r.leggi('sw.js'), /VERSIONE = '0\.3\.0'/);
      assert.match(r.leggi('MANUALE.md'), /documentata: 0\.3\.0/);
      assert.match(r.leggi('MANUALE.md'), /## 2\. Il pulsante \(dalla 0\.3\.0\)/);
      assert.match(r.leggi('manuale.html'), /v0\.3\.0/);
      assert.match(r.leggi('nuovo.js'), /dalla 0\.3\.0/, 'il commento scritto dal ramo segue il numero');
      assert.match(r.leggi('altro.js'), /dalla 0\.2\.0/, 'quello di main no: la 0.2.0 è sua');
      assert.equal(r.g('status', '--porcelain'), '', 'tutto nel commit');
      assert.match(r.g('log', '-1', '--format=%s'), /Merge main: la voce del ramo diventa 0\.3\.0/);
      // Rilanciato, non cambia niente.
      const ancora = r.lancia('minor');
      assert.equal(ancora.status, 0, ancora.stderr);
      assert.match(ancora.stdout, /resta 0\.3\.0/);
    } finally { r.chiudi(); }
  });

  it('una sola correzione sale di patch', () => {
    const r = repo();
    try {
      r.g('checkout', '-q', '-b', 'fix');
      r.versione('0.1.1', 'Una correzione.');
      r.g('add', '-A'); r.g('commit', '-q', '-m', 'fix');
      const es = r.lancia('patch');
      assert.equal(es.status, 0, es.stderr);
      assert.match(r.leggi('core.js'), /APP_VERSION = '0\.1\.1'/);
    } finally { r.chiudi(); }
  });

  it('davanti a un conflitto vero si ferma e lo nomina', () => {
    const r = repo();
    try {
      r.g('checkout', '-q', '-b', 'lavoro');
      r.scrivi('altro.js', 'const x = 3;\n');
      r.versione('0.2.0', 'Il mio.');
      r.g('add', '-A'); r.g('commit', '-q', '-m', 'mio');
      r.g('checkout', '-q', 'main');
      r.scrivi('altro.js', 'const x = 4;\n');
      r.versione('0.2.0', 'Il suo.');
      r.g('add', '-A'); r.g('commit', '-q', '-m', 'suo'); r.g('push', '-q', 'origin', 'main');
      r.g('checkout', '-q', 'lavoro');
      const es = r.lancia('minor');
      assert.notEqual(es.status, 0);
      assert.match(es.stderr, /conflitti da risolvere a mano: altro\.js/);
      // Risolto a mano, si rilancia e finisce.
      r.scrivi('altro.js', 'const x = 34;\n'); r.g('add', 'altro.js');
      const dopo = r.lancia('minor');
      assert.equal(dopo.status, 0, dopo.stderr);
      assert.match(r.leggi('core.js'), /APP_VERSION = '0\.3\.0'/);
      assert.equal(r.leggi('altro.js'), 'const x = 34;\n');
    } finally { r.chiudi(); }
  });

  it('senza una voce sua nel CHANGELOG non fa niente, e dice perché', () => {
    const r = repo();
    try {
      r.g('checkout', '-q', '-b', 'vuoto');
      r.scrivi('altro.js', 'const x = 9;\n'); r.g('add', '-A'); r.g('commit', '-q', '-m', 'x');
      const es = r.lancia('minor');
      assert.notEqual(es.status, 0);
      assert.match(es.stderr, /non ha una voce sua/);
    } finally { r.chiudi(); }
  });
});
