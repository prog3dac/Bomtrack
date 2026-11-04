#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════
//  BOMTRACK — tools/versione.js (dalla 0.141.0)
// ═══════════════════════════════════════════════════════════
// Il numero di versione si decide all'ultimo passo prima del merge, non
// quando il lavoro comincia.
//
// Due lavori in parallelo partivano dalla stessa versione e prendevano lo
// stesso numero: chi arrivava secondo doveva fondere main a mano e rinumerare
// CHANGELOG, APP_VERSION, sw.js, il manuale e ogni commento «dalla 0.x.y» che
// aveva scritto. Sette merge, fino alla 0.140.0, sono serviti solo a questo, e
// uno è rimasto fermo in conflitto. Questo script lo fa da solo:
//
//   node tools/versione.js minor     (funzioni nuove)
//   node tools/versione.js patch     (solo correzioni)
//
// Sul ramo di lavoro, con la voce del CHANGELOG già scritta in cima (con
// qualsiasi numero: verrà corretto):
//  1. scarica main e lo fonde nel ramo;
//  2. i conflitti che riguardano solo il numero di versione li risolve lui
//     (CHANGELOG.md, core.js, sw.js, MANUALE.md); manuale.html lo rigenera;
//  3. dà alla voce del ramo il numero successivo a quello in cima a main;
//  4. lo scrive in APP_VERSION, in sw.js, nel manuale, e nelle righe che il
//     ramo ha aggiunto e che citavano il numero vecchio («dalla 0.136.0»);
//  5. fa il commit del merge.
// Un conflitto vero, nel codice, lo lascia a chi lavora: lo elenca e si ferma.
// Risolto quello (e fatto `git add`), si rilancia lo stesso comando.
//
// Senza dipendenze: Node e git. `--senza-fetch` usa l'origin/main che c'è.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const VER = /0\.\d+\.\d+/g;
const FILE_VERSIONE = ['CHANGELOG.md', 'core.js', 'sw.js', 'MANUALE.md', 'manuale.html'];

function git(args, opt = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', opt.silenzio ? 'ignore' : 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}
function gitOk(args) { try { git(args, { silenzio: true }); return true; } catch (e) { return false; } }
const leggi = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const scrivi = (f, s) => fs.writeFileSync(path.join(ROOT, f), s);
function esci(msg) { console.error('versione: ' + msg); process.exit(1); }

// ── Il CHANGELOG: le voci sono i blocchi «### 0.x.y — data» ──
function voci(testo) {
  const righe = testo.split('\n');
  const out = [];
  let testa = [], cur = null;
  for (const r of righe) {
    const m = /^### (0\.\d+\.\d+)\b/.exec(r);
    if (m) { cur = { versione: m[1], righe: [r] }; out.push(cur); continue; }
    if (cur) cur.righe.push(r); else testa.push(r);
  }
  return { testa, voci: out };
}
function sale(v, tipo) {
  const [a, b, c] = v.split('.').map(Number);
  return tipo === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
}
const confronta = (x, y) => { const a = x.split('.').map(Number), b = y.split('.').map(Number); return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]; };

// Un conflitto in cui le due parti differiscono solo per i numeri di
// versione si risolve con quella di main. Restituisce il testo e quanti
// conflitti veri restano.
function risolviSoloVersioni(testo) {
  let veri = 0;
  const fuori = testo.replace(/^<<<<<<< [^\n]*\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>> [^\n]*\n/gm, (tutto, nostro, loro) => {
    if (nostro.replace(VER, 'V') === loro.replace(VER, 'V')) return loro;
    veri++;
    return tutto;
  });
  return { testo: fuori, veri };
}

function main() {
  const tipo = process.argv[2];
  if (!['minor', 'patch'].includes(tipo)) esci('uso: node tools/versione.js minor|patch [--senza-fetch]');
  const ramo = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  if (ramo === 'main' || ramo === 'HEAD') esci('va lanciato sul ramo di lavoro, non su ' + ramo);
  const inCorso = fs.existsSync(path.join(ROOT, '.git', 'MERGE_HEAD'));
  if (!inCorso && git(['status', '--porcelain', '--untracked-files=no']).trim()) esci('ci sono modifiche non salvate: fai prima un commit');
  if (!inCorso && !process.argv.includes('--senza-fetch')) git(['fetch', '-q', 'origin', 'main']);

  // Prima del merge: che cosa porta il ramo.
  const base = git(['merge-base', 'HEAD', 'origin/main']).trim();
  const logMain = voci(git(['show', 'origin/main:CHANGELOG.md']));
  const logRamo = voci(git(['show', 'HEAD:CHANGELOG.md']));
  // Le voci del ramo sono quelle che il punto di partenza non aveva, e che main
  // non ha già (un rilancio dopo un merge riuscito le trova in main).
  const chiave = v => v.righe.slice(1).join('\n').trim();
  const prima = new Set(voci(git(['show', base + ':CHANGELOG.md'])).voci.map(chiave));
  const inMain = new Set(logMain.voci.map(chiave));
  const nostre = logRamo.voci.filter(v => !prima.has(chiave(v)) && !inMain.has(chiave(v)));
  if (!nostre.length) esci('il ramo non ha una voce sua in cima al CHANGELOG: scrivila (### 0.x.y — data, poi il testo) e rilancia');
  if (nostre.length > 1) esci(`il ramo ha ${nostre.length} voci nel CHANGELOG (${nostre.map(v => v.versione).join(', ')}): uniscile in una e rilancia`);
  const voce = nostre[0];
  const vecchia = voce.versione;
  const cimaMain = logMain.voci[0].versione;
  const nuova = sale(cimaMain, tipo);

  // Le righe che il ramo ha aggiunto e che citano il suo numero.
  const aggiunte = new Map();   // file → Set di righe aggiunte che contengono il numero vecchio
  const diff = git(['diff', '--unified=0', base, 'HEAD']);
  let file = null;
  for (const r of diff.split('\n')) {
    const f = /^\+\+\+ b\/(.+)$/.exec(r);
    if (f) { file = f[1]; continue; }
    if (file && r.startsWith('+') && !r.startsWith('+++') && r.includes(vecchia) && !FILE_VERSIONE.includes(file)) {
      if (!aggiunte.has(file)) aggiunte.set(file, new Set());
      aggiunte.get(file).add(r.slice(1));
    }
  }

  // Il merge.
  if (!inCorso && !gitOk(['merge-base', '--is-ancestor', 'origin/main', 'HEAD'])) {
    gitOk(['merge', '--no-commit', '--no-ff', 'origin/main']);
  }
  const conflitti = git(['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean);
  const veri = [];
  for (const f of conflitti) {
    if (f === 'CHANGELOG.md' || f === 'manuale.html') continue;   // si riscrivono da capo, sotto
    const r = risolviSoloVersioni(leggi(f));
    if (r.veri) { veri.push(`${f} (${r.veri})`); continue; }
    scrivi(f, r.testo);
  }
  if (veri.length) {
    esci('conflitti da risolvere a mano: ' + veri.join(', ') + '.\nRisolvili, fai git add, poi rilancia: node tools/versione.js ' + tipo);
  }

  // Il CHANGELOG: quello di main, con la voce del ramo in cima e il numero nuovo.
  const titolo = voce.righe[0].replace(vecchia, nuova).replace(/— \d{4}-\d{2}-\d{2}/, '— ' + new Date().toISOString().slice(0, 10));
  const corpo = [titolo].concat(voce.righe.slice(1)).join('\n').replace(/\n+$/, '') + '\n';
  const testa = logMain.testa.join('\n').replace(/\n+$/, '') + '\n\n';
  scrivi('CHANGELOG.md', testa + corpo + '\n' + logMain.voci.map(v => v.righe.join('\n')).join('\n'));

  // Il numero nei posti che lo ripetono.
  const metti = (f, re, sost) => { const s = leggi(f); if (!re.test(s)) esci(`${f}: non trovo dove sta la versione`); scrivi(f, s.replace(re, sost)); };
  metti('core.js', /const APP_VERSION = '0\.\d+\.\d+';/, `const APP_VERSION = '${nuova}';`);
  metti('sw.js', /const VERSIONE = '0\.\d+\.\d+';/, `const VERSIONE = '${nuova}';`);
  metti('MANUALE.md', /\*\*Versione dell'app documentata: 0\.\d+\.\d+\*\*/, `**Versione dell'app documentata: ${nuova}**`);
  // «dalla 0.136.0» nelle righe scritte dal ramo.
  let ritocchi = 0;
  if (vecchia !== nuova) {
    for (const [f, righe] of aggiunte) {
      if (!fs.existsSync(path.join(ROOT, f))) continue;
      const s = leggi(f).split('\n').map(r => (righe.has(r) ? (ritocchi++, r.split(vecchia).join(nuova)) : r)).join('\n');
      scrivi(f, s);
    }
    // Il manuale: le righe della sua voce aggiunte dal ramo.
    const m = leggi('MANUALE.md');
    const aggManuale = new Set(git(['diff', '--unified=0', base, 'HEAD', '--', 'MANUALE.md']).split('\n')
      .filter(r => r.startsWith('+') && !r.startsWith('+++') && r.includes(vecchia)).map(r => r.slice(1)));
    scrivi('MANUALE.md', m.split('\n').map(r => (aggManuale.has(r) ? (ritocchi++, r.split(vecchia).join(nuova)) : r)).join('\n'));
  }
  if (fs.existsSync(path.join(ROOT, 'genera-manuale.py'))) {
    execFileSync('python3', ['genera-manuale.py', 'MANUALE.md', 'manuale.html'], { cwd: ROOT, stdio: 'ignore' });
  }

  git(['add', '-A']);
  const resta = git(['diff', '--cached', '--name-only', '--diff-filter=U']).trim();
  if (resta) esci('restano file in conflitto: ' + resta);
  const fusione = fs.existsSync(path.join(ROOT, '.git', 'MERGE_HEAD'));
  if (fusione || git(['status', '--porcelain', '--untracked-files=no']).trim()) {
    const msg = fusione ? `Merge main: la voce del ramo diventa ${nuova}` : `Versione ${nuova}`;
    git(['commit', '-q', '-m', msg]);
  }
  console.log(`versione: ${vecchia === nuova ? 'resta' : vecchia + ' →'} ${nuova}` +
    (confronta(vecchia, cimaMain) <= 0 ? ` (main è alla ${cimaMain})` : '') +
    (ritocchi ? `, ${ritocchi} righe del ramo aggiornate` : ''));
}

main();
