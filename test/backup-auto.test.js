// Il backup automatico in una cartella.
//
// Il promemoria diceva quando esportare, ma l'export restava un gesto a mano.
// Qui l'app scrive da sola. Le proprietà che contano, e che nel browser vero
// nessuno prova perché servirebbe aspettare quindici giorni o revocare un
// permesso:
//   1. il file del giorno è un backup vero, che Importa JSON riconosce;
//   2. si tengono gli ultimi BACKUP_AUTO_TENERE, e solo i nostri file si
//      toccano: il resto della cartella non è dell'app;
//   3. senza permesso non si chiede niente a freddo: il backup va «in pausa»,
//      il Riepilogo lo dice, e il clic su «Riprendi» lo fa ripartire;
//   4. un backup automatico conta come backup: il promemoria dei 7 giorni tace.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat } = require('./fixtures.js');

function app(role) {
  const a = loadApp({ silent: true });
  a.setDb(makeDb({ items: [mat('m1', 10)], jobs: [], plans: [], rfqs: [], orders: [] }));
  a.asRole(role || 'admin');
  return a;
}
const esegui = (a, chiedi, forza) => a.eval(`backupAutoEsegui(${!!chiedi}, ${!!forza})`).then(e => JSON.parse(JSON.stringify(e)));
const nomeOggi = a => `bomtrack_backup_${a.eval('oggiISO()')}.json`;
const segnali = a => JSON.parse(a.eval('JSON.stringify(homeSegnali())'));

describe('Backup automatico: cosa scrive', () => {
  it('spento finché non si sceglie una cartella, e allora non scrive niente', async () => {
    const a = app();
    a.cartellaBackup({}, { collega: false });
    assert.equal(a.eval('backupAutoAttivo()'), false);
    const e = await esegui(a);
    assert.equal(e.stato, null);
    assert.match(a.eval('backupAutoLine()'), /Attiva backup automatico/);
  });

  it('un browser che non sa collegare cartelle lo dice, invece di offrire un pulsante morto', () => {
    const a = app();
    assert.match(a.eval('backupAutoLine()'), /non disponibile in questo browser/);
    assert.doesNotMatch(a.eval('backupAutoLine()'), /<button/);
  });

  it('il file del giorno è un backup che Importa JSON riconosce', async () => {
    const a = app();
    const files = {};
    a.cartellaBackup(files);
    const e = await esegui(a);
    assert.equal(e.stato, 'ok');
    assert.equal(e.file, nomeOggi(a));
    const dati = JSON.parse(files[nomeOggi(a)]);
    assert.equal(a.eval(`validateSnapshot(${JSON.stringify(dati)})`), null, 'deve passare dalla stessa validazione dell\'import');
    assert.equal(dati.items[0].id, 'm1');
  });

  // 0.105.3: dopo un archivio illeggibile in memoria ci sono i dati d'esempio,
  // e il backup di stamattina veniva riscritto con quelli.
  it('con l\'archivio non letto non riscrive il backup di oggi', async () => {
    const a = app();
    const files = { [nomeOggi(a)]: 'il backup vero di stamattina' };
    a.cartellaBackup(files);
    a.eval('dbLoadError = { kind: "parse" }');
    const e = await esegui(a, false, true);
    assert.equal(e.stato, 'pausa');
    assert.equal(files[nomeOggi(a)], 'il backup vero di stamattina');
  });

  it('conta come backup: il promemoria dei sette giorni si azzera', async () => {
    const a = app();
    a.storage.setItem('bomtrack_ultimo_backup', a.eval('addDays(oggiISO(), -20)'));
    a.cartellaBackup({});
    await esegui(a);
    assert.equal(a.eval('ultimoBackup()'), a.eval('oggiISO()'));
    assert.equal(segnali(a).find(s => /backup/.test(s.testo)), undefined);
  });

  it('durante la giornata riscrive lo stesso file, e solo se qualcosa è cambiato', async () => {
    const a = app();
    const files = {};
    a.cartellaBackup(files);
    await esegui(a);
    files[nomeOggi(a)] = 'segno';
    await esegui(a);
    assert.equal(files[nomeOggi(a)], 'segno', 'niente di nuovo: non si riscrive');
    a.eval(`db.items[0].name = 'cambiato'; Store.commit();`);
    await esegui(a);
    assert.match(files[nomeOggi(a)], /cambiato/);
    assert.equal(Object.keys(files).length, 1, 'un file al giorno, non uno per salvataggio');
  });

  it('tiene gli ultimi quattordici e lascia stare i file non suoi', async () => {
    const a = app();
    const files = { 'note.txt': 'mie', 'bomtrack_backup_2020-01-01 copia.json': 'mia copia' };
    for (let i = 1; i <= 20; i++) files[`bomtrack_backup_2020-02-${String(i).padStart(2, '0')}.json`] = '{}';
    a.cartellaBackup(files);
    await esegui(a);
    const nostri = Object.keys(files).filter(n => /^bomtrack_backup_\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
    assert.equal(nostri.length, a.eval('BACKUP_AUTO_TENERE'));
    assert.equal(nostri[nostri.length - 1], nomeOggi(a), 'quello di oggi resta');
    assert.equal(nostri[0], 'bomtrack_backup_2020-02-08.json', 'vanno via i più vecchi');
    assert.equal(files['note.txt'], 'mie');
    assert.equal(files['bomtrack_backup_2020-01-01 copia.json'], 'mia copia');
  });
});

describe('Backup automatico: il permesso', () => {
  it('senza permesso non chiede niente da solo: va in pausa e non scrive', async () => {
    const a = app();
    const files = {};
    a.cartellaBackup(files, { permesso: 'prompt' });
    const e = await esegui(a, false);
    assert.equal(e.stato, 'pausa');
    assert.deepEqual(Object.keys(files), []);
    assert.match(a.eval('backupAutoLine()'), /in pausa/);
  });

  it('il Riepilogo lo dice, e «Riprendi» lo fa ripartire', async () => {
    const a = app();
    const files = {};
    a.cartellaBackup(files, { permesso: 'prompt' });
    await esegui(a, false);
    const sig = segnali(a).find(s => /backup automatico in pausa/.test(s.testo));
    assert.ok(sig, 'il segnale c\'è');
    assert.equal(sig.voci[0].azione, 'backupAutoOra()');
    const e = await a.eval('backupAutoOra()');
    assert.equal(e.stato, 'ok', 'sul clic il permesso si può chiedere');
    assert.ok(files[nomeOggi(a)]);
    assert.equal(segnali(a).find(s => /backup automatico/.test(s.testo)), undefined, 'ripreso, il segnale sparisce');
  });

  it('un lettore non vede il segnale e non può riprendere', async () => {
    const a = app('lettore');
    a.cartellaBackup({}, { permesso: 'prompt' });
    await esegui(a, false);
    assert.equal(segnali(a).find(s => /backup automatico/.test(s.testo)), undefined);
    assert.equal(await a.eval('backupAutoOra()'), null);
  });

  it('un permesso negato resta in pausa, senza eccezioni', async () => {
    const a = app();
    a.cartellaBackup({}, { permesso: 'denied' });
    const e = await esegui(a, true);
    assert.equal(e.stato, 'pausa');
  });
});

describe('Backup automatico: scegliere e disattivare', () => {
  it('scelta la cartella, il primo backup parte subito', async () => {
    const a = app();
    const files = {};
    a.cartellaBackup(files, { collega: false });
    assert.equal(a.eval('backupAutoAttivo()'), false);
    assert.equal(await a.eval('backupAutoScegli()'), true);
    assert.equal(a.eval('backupAutoNome()'), 'Backup');
    assert.ok(files[nomeOggi(a)]);
  });

  it('chiudere la finestra di sistema non attiva niente', async () => {
    const a = app();
    a.cartellaBackup({}, { collega: false, rifiuta: true });
    assert.equal(await a.eval('backupAutoScegli()'), false);
    assert.equal(a.eval('backupAutoAttivo()'), false);
  });

  it('disattivare dimentica la cartella ma non cancella i file', async () => {
    const a = app();
    const files = {};
    a.cartellaBackup(files);
    await esegui(a);
    await a.eval('backupAutoDisattiva()');
    assert.equal(a.eval('backupAutoAttivo()'), false);
    assert.ok(files[nomeOggi(a)]);
  });

  it('senza la cartella dei documenti il backup automatico vive lo stesso', async () => {
    const a = app();
    a.cartellaBackup({});
    assert.equal(a.eval('archivioNome()'), '');
    assert.equal((await esegui(a)).stato, 'ok');
  });
});
