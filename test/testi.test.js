// I testi a schermo dicono quello che l'app fa (0.109.1).
//
// Una nota sbagliata è peggio di nessuna nota: chi la legge si fida. Qui si
// fermano le frasi che, dopo un cambio di comportamento, erano rimaste a dire
// il contrario — e si controlla, dove si può, il comportamento accanto.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, mat, parte, wc } = require('./fixtures.js');

function app(dbObj) {
  const a = loadApp({ silent: true });
  a.setDb(dbObj || makeDb({ items: [mat('m1', 10)] }));
  a.asRole('admin');
  return a;
}
const sorgente = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('Testi coerenti con il comportamento', () => {
  it('dichiarare una parte fatta dice che la mette a magazzino, e la mette', () => {
    const a = app(makeDb({
      workCenters: [wc('w1', 50)],
      items: [mat('M1', 10), parte('P1', { cycle: [{ id: 'c0', kind: 'item', itemId: 'M1', qty: 1 }] })],
      plans: [{ id: 'pl1', number: 'FAB-2026-001', date: '2026-08-01', active: true,
        lines: [{ id: 'l1', itemId: 'P1', qty: 5, dueDate: '2026-12-01' }] }],
    }));
    a.eval(`window.__prodPlanId = 'pl1'; window.__prodItemId = 'P1'; window.__prodRichiesti = 5;`);
    const testo = a.eval('produzioneBody()');
    assert.ok(!testo.includes('non muove il magazzino'), 'la nota di prima diceva il contrario');
    assert.ok(testo.includes('mette la parte a magazzino'));
    assert.ok(a.eval("produzioneDichiara('pl1', 'P1', 2, '')"));
    assert.equal(a.eval("onHandOf('P1')"), 2, 'e la parte entra davvero');
  });

  it("gli ordini generati dal fabbisogno non promettono il prezzo della costificazione", () => {
    const a = app();
    const odaHint = a.eval("planDocsHint('order')");
    assert.ok(!odaHint.includes('prezzo in uso nella costificazione'));
    assert.ok(odaHint.includes('listino di quel fornitore'));
  });

  it('il listino di una parte si apre, e il rifiuto nomina anche le parti', () => {
    const a = app(makeDb({ items: [parte('P1')] }));
    assert.equal(a.eval("hasPriceList(getItem('P1'))"), true);
    assert.ok(sorgente('views-catalog.js').includes("'Il listino vale solo per commerciali, materie prime e parti'"));
  });

  it('ordini di lavoro e di produzione vuoti non dicono che nascono solo dal fabbisogno', () => {
    const docs = sorgente('views-docs.js'), prod = sorgente('views-prod.js');
    assert.ok(!docs.includes("'Nessun ordine di lavoro. Si generano dal Fabbisogno, dalle fasi affidate a un terzista.'"));
    assert.ok(!prod.includes("'Nessun ordine di produzione. Si generano dal Fabbisogno, dalle parti da fabbricare.'"));
    assert.ok(!docs.includes('generata dal fabbisogno. Non è un articolo'));
  });

  it('le lavorazioni da far fare fuori vanno negli ordini di lavoro, non negli ordini d\'acquisto', () => {
    assert.ok(!sorgente('views-mrp.js').includes("Entrano nelle richieste e negli ordini come le righe d'acquisto"));
  });

  it('il risparmio del fabbisogno parla di altri fornitori, come la regola della 0.109.0', () => {
    const mrp = sorgente('views-mrp.js');
    assert.ok(!mrp.includes('Scegliendo ovunque la quotazione più bassa a listino'));
    assert.ok(mrp.includes('a un altro fornitore che a listino quota meno'));
  });

  it('il cestino distingue il PC da solo dall\'archivio condiviso', () => {
    const ie = sorgente('import-export.js');
    assert.ok(ie.includes("le toglie il server, al più una volta al giorno"));
  });

  it('backup, import e allegati dicono quello che succede', () => {
    const a = app();
    const backup = a.eval('renderBackup()');
    assert.ok(!backup.includes('esporta prima un backup JSON'), 'la copia prima di azzerare la fa l\'app');
    assert.ok(backup.includes('salva da sola una copia di tutto'));
    assert.ok(a.eval('renderImport()').includes('Fornitori, Clienti,'), 'il foglio Clienti c\'è');
    assert.ok(!sorgente('allegati.js').includes('Allegati → Archivio'), 'quella voce non esiste');
  });

  it('il README non dice più che non c\'è nessun server', () => {
    const readme = sorgente('README.md');
    assert.ok(!readme.includes('nessun server, nessun Supabase'));
    assert.ok(!readme.includes('Dichiarare pezzi fatti **non muove il magazzino**'));
    assert.ok(!readme.includes('le ore stanno nella settimana in cui **il pezzo serve pronto**'));
  });
});
