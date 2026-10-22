// Calendario di fabbrica (calendario.js): quali giorni si lavora.
//
// È il mattone della programmazione a ritroso, e sbaglia in silenzio: un
// festivo dimenticato è un giorno di lavoro che nessuno ha deciso, una data che
// scivola di un giorno a est di Greenwich è un ordine mandato in ritardo. I
// casi qui sotto sono quelli che un'implementazione ingenua sbaglia.

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb } = require('./fixtures.js');

function conCal(cal) {
  const app = loadApp({ silent: true });
  app.setDb(makeDb(cal ? { settings: { calendar: cal } } : {}));
  return app;
}
const ev = (app, code) => app.eval(code);

describe('Calendario: i giorni', () => {
  it('di serie si lavora dal lunedì al venerdì', () => {
    const app = conCal();
    assert.equal(ev(app, "isWorkDay('2026-09-30')"), true, 'mercoledì');
    assert.equal(ev(app, "isWorkDay('2026-10-03')"), false, 'sabato');
    assert.equal(ev(app, "isWorkDay('2026-10-04')"), false, 'domenica');
  });

  it('i festivi nazionali sono chiusi, anche infrasettimanali', () => {
    const app = conCal();
    assert.equal(ev(app, "isWorkDay('2026-12-08')"), false, 'Immacolata, martedì');
    assert.equal(ev(app, "isWorkDay('2026-06-02')"), false, 'Festa della Repubblica');
    assert.equal(ev(app, "isWorkDay('2026-04-25')"), false);
  });

  it('Pasqua si calcola, e Pasquetta è chiusa', () => {
    const app = conCal();
    assert.equal(ev(app, 'pasqua(2024)'), '2024-03-31');
    assert.equal(ev(app, 'pasqua(2025)'), '2025-04-20');
    assert.equal(ev(app, 'pasqua(2026)'), '2026-04-05');
    assert.equal(ev(app, "isWorkDay('2026-04-06')"), false, 'Pasquetta 2026');
    assert.equal(ev(app, "isWorkDay('2025-04-21')"), false, 'Pasquetta 2025');
  });

  it('Pasquetta si può spegnere', () => {
    const app = conCal({ workDays: [1, 2, 3, 4, 5], holidays: [], easter: false, closures: [] });
    assert.equal(ev(app, "isWorkDay('2026-04-06')"), true);
  });

  it('le chiusure valgono dal primo all ultimo giorno compresi', () => {
    const app = conCal({ workDays: [1, 2, 3, 4, 5], holidays: [], easter: true,
      closures: [{ from: '2026-08-10', to: '2026-08-21', note: 'Ferie' }] });
    assert.equal(ev(app, "isWorkDay('2026-08-07')"), true);
    assert.equal(ev(app, "isWorkDay('2026-08-10')"), false);
    assert.equal(ev(app, "isWorkDay('2026-08-21')"), false);
    assert.equal(ev(app, "isWorkDay('2026-08-24')"), true);
  });

  it('un calendario senza giorni lavorativi lavora sempre, invece di bloccarsi', () => {
    const app = conCal({ workDays: [], holidays: [], easter: false, closures: [] });
    assert.equal(ev(app, "isWorkDay('2026-10-04')"), true);
    assert.equal(ev(app, "addWorkDays('2026-10-04', -2)"), '2026-10-02');
  });

  it('una data non valida non è un giorno di lavoro e non produce date', () => {
    const app = conCal();
    assert.equal(ev(app, "isWorkDay('')"), false);
    assert.equal(ev(app, "addWorkDays('', -3)"), '');
    assert.equal(ev(app, "prevWorkDay('non una data')"), '');
  });
});

describe('Calendario: contare a ritroso e in avanti', () => {
  it('un giorno lavorativo prima di lunedì è venerdì', () => {
    assert.equal(ev(conCal(), "addWorkDays('2026-10-05', -1)"), '2026-10-02');
  });

  it('a ritroso si salta Pasquetta', () => {
    assert.equal(ev(conCal(), "addWorkDays('2026-04-07', -1)"), '2026-04-03');
  });

  it('a ritroso si attraversa il capodanno', () => {
    // Lunedì 4 gennaio 2027: venerdì 1 è festa, sabato e domenica chiusi.
    assert.equal(ev(conCal(), "addWorkDays('2027-01-04', -1)"), '2026-12-31');
  });

  it('a ritroso si scavalcano le ferie', () => {
    const app = conCal({ workDays: [1, 2, 3, 4, 5], holidays: [], easter: true,
      closures: [{ from: '2026-08-10', to: '2026-08-21', note: '' }] });
    assert.equal(ev(app, "addWorkDays('2026-08-24', -1)"), '2026-08-07');
  });

  it('zero giorni non spostano la data, nemmeno da un festivo', () => {
    assert.equal(ev(conCal(), "addWorkDays('2026-08-15', 0)"), '2026-08-15');
  });

  it('in avanti si salta il fine settimana', () => {
    assert.equal(ev(conCal(), "addWorkDays('2026-10-02', 1)"), '2026-10-05');
  });

  it('il lavorativo precedente e quello successivo a un festivo', () => {
    const app = conCal();
    assert.equal(ev(app, "prevWorkDay('2026-08-15')"), '2026-08-14');
    assert.equal(ev(app, "nextWorkDay('2026-08-15')"), '2026-08-17');
    assert.equal(ev(app, "prevWorkDay('2026-09-30')"), '2026-09-30', 'un giorno di lavoro resta sé stesso');
  });

  it('i giorni lavorativi fra due date, con il segno', () => {
    const app = conCal();
    assert.equal(ev(app, "workDaysBetween('2026-09-28', '2026-10-05')"), 5);
    assert.equal(ev(app, "workDaysBetween('2026-10-05', '2026-09-28')"), -5);
    assert.equal(ev(app, "workDaysBetween('2026-10-05', '2026-10-05')"), 0);
  });

  it('cambiare il calendario cambia i conti, senza ricaricare', () => {
    const app = conCal();
    assert.equal(ev(app, "isWorkDay('2026-10-03')"), false);
    app.eval('db.settings.calendar = { workDays: [1, 2, 3, 4, 5, 6], holidays: [], easter: true, closures: [] };');
    assert.equal(ev(app, "isWorkDay('2026-10-03')"), true, 'il sabato ora si lavora');
    assert.equal(ev(app, 'workDaysPerWeek()'), 6);
  });
});

describe('Calendario: i giorni dei fornitori', () => {
  const CAL = { workDays: [1, 2, 3, 4, 5], holidays: ['12-08'], easter: true, closures: [] };
  it('di serie sono lavorativi: prima, dopo e fra due date', () => {
    const app = conCal(CAL);
    assert.equal(ev(app, 'calFornitoriLavorativi()'), true);
    assert.equal(ev(app, "supplierDaysBefore('2026-10-12', 5)"), '2026-10-05', 'cinque giorni di lavoro prima di lunedì 12');
    assert.equal(ev(app, "supplierDaysAfter('2026-10-02', 5)"), '2026-10-09', 'da venerdì 2, cinque giorni di lavoro');
    assert.equal(ev(app, "supplierDaysBetween('2026-10-02', '2026-10-09')"), 5);
    assert.equal(ev(app, "supplierDaysBetween('2026-10-09', '2026-10-02')"), -5);
    assert.equal(ev(app, "supplierDaysAfter('2026-12-04', 3)"), '2026-12-10', 'salta il weekend e l\'Immacolata');
  });
  it('di calendario si contano pieni, ma gli estremi cadono in giorni aperti', () => {
    const app = conCal(Object.assign({}, CAL, { supplierDays: 'calendario' }));
    assert.equal(ev(app, 'calFornitoriLavorativi()'), false);
    assert.equal(ev(app, "supplierDaysBefore('2026-10-12', 2)"), '2026-10-09', 'sabato 10 si anticipa a venerdì');
    assert.equal(ev(app, "supplierDaysAfter('2026-10-02', 1)"), '2026-10-05', 'sabato 3 si riceve lunedì');
    assert.equal(ev(app, "supplierDaysBetween('2026-10-02', '2026-10-09')"), 7);
  });
  it('zero giorni non spostano niente, e una data illeggibile resta vuota', () => {
    const app = conCal(CAL);
    assert.equal(ev(app, "supplierDaysAfter('2026-10-03', 0)"), '2026-10-03');
    assert.equal(ev(app, "supplierDaysBefore('2026-10-03', 0)"), '2026-10-02', 'un ordine non parte di sabato');
    assert.equal(ev(app, "supplierDaysBefore('', 3)"), '');
    assert.equal(ev(app, "supplierDaysBetween('', '2026-10-03')"), null);
  });
  it('il ritardo si dice nell\'unità in cui è contato', () => {
    const app = conCal(CAL);
    assert.equal(ev(app, 'supplierDaysText(1)'), '1 giorno lavorativo');
    assert.equal(ev(app, 'supplierDaysText(4)'), '4 giorni lavorativi');
    app.eval("db.settings.calendar = Object.assign({}, db.settings.calendar, { supplierDays: 'calendario' });");
    assert.equal(ev(app, 'supplierDaysText(4)'), '4 giorni');
  });
});

describe('Calendario: il fuso orario', () => {
  it('a est di Greenwich le date non scivolano al giorno prima', () => {
    // Un processo a parte, perché il fuso si legge all'avvio.
    const script = `
      const { loadApp } = require(${JSON.stringify(path.join(__dirname, 'harness.js'))});
      const { makeDb } = require(${JSON.stringify(path.join(__dirname, 'fixtures.js'))});
      const app = loadApp({ silent: true }); app.setDb(makeDb({}));
      process.stdout.write([app.eval("addWorkDays('2026-10-05', -1)"), app.eval("prevWorkDay('2026-08-15')"),
        String(app.eval("isWorkDay('2026-10-05')"))].join(','));`;
    const out = execFileSync(process.execPath, ['-e', script], { env: Object.assign({}, process.env, { TZ: 'Asia/Tokyo' }) }).toString();
    assert.equal(out, '2026-10-02,2026-08-14,true');
  });
});
