// La linea temporale dei centri nel Carico centri (capacita.js, dalla 0.152.0):
// per ogni centro le fasi che lo impegnano, con attrezzaggio, lavoro e
// attraversamento previsti a capacità finita, il reale (timbrato o dichiarato)
// prima di oggi e il pianificato dell'ODP.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

// Un centro da 8 ore al giorno, lavorativo tutti i giorni; oggi è il 28/10.
// A: 12 pezzi da 1 h, avviata il 26 (niente attrezzaggio da fare); B: 8 pezzi
// da 1 h, non avviata, con l'attrezzaggio e la coda che il test sceglie.
function app(modules, o) {
  const x = o || {};
  const a = loadApp({ silent: true });
  const fase = (id, extra) => Object.assign({ id, seq: 10, opIndex: 0, workCenterId: 'w1', wcName: 'Tornio', costMode: 'orario', hours: 1, rate: 50, cost: 0 }, extra);
  const db = makeDb({
    items: [acq('v1', 5), { id: 'p1', code: 'P1', name: 'Parte', type: 'parte', uom: 'pz', sourcing: 'make', active: true, cycle: [] }],
    workCenters: [{ id: 'w1', name: 'Tornio', hourlyRate: 40, hoursPerDay: 8, active: true }],
    prodOrders: [
      { id: 'A', number: 'ODP-A', itemId: 'p1', code: 'P1', qty: 12, status: 'corso', dueDate: x.dueA || '2026-11-02', active: true,
        phases: [fase('fa', { setupHours: 2, plannedStart: '2026-10-24', plannedEnd: '2026-10-27' })] },
      { id: 'B', number: 'ODP-B', itemId: 'p1', code: 'P1', qty: 8, status: 'lanciato', dueDate: '2026-11-30', active: true,
        phases: [fase('fb', { setupHours: x.setupB || 0, queueDays: x.codaB || 0 })] },
    ],
    prodDecls: [{ id: 'd1', odpId: 'A', phaseId: 'fa', kind: 'avvio', date: '2026-10-26T07:00:00.000Z', qty: 0, scrap: 0 }],
    movements: [], timeLogs: x.timeLogs || [], maintPlans: [], maintEvents: [],
    users: [{ id: 'u1', name: 'Op', email: 'o@x.it', role: 'admin', active: true }],
    settings: { modules: Object.assign({}, modules), calendar: { workDays: [0, 1, 2, 3, 4, 5, 6], holidays: [], closures: [], easter: false } },
  });
  a.setDb(db); a.asRole('admin');
  a.eval("currentUser = db.users[0]; oggiISO = () => '2026-10-28'; if (typeof calInvalidate === 'function') calInvalidate()");
  return a;
}
const log = (giorno, da, a) => ({ id: 'l' + giorno + da, odpId: 'A', phaseId: 'fa', workCenterId: 'w1', userId: 'u1',
  startedAt: `${giorno}T${da}:00:00.000Z`, endedAt: `${giorno}T${a}:00:00.000Z`, active: true });

describe('Linea temporale dei centri — i giorni della capacità finita', () => {
  it('ogni fase sa quante ore prende in ciascun giorno', () => {
    const s = app({ capacita: true }).eval("(() => { const r = capSchedula(); return { a: r.fasi.get('fa').giorni, b: r.fasi.get('fb').giorni }; })()");
    assert.deepEqual(JSON.parse(JSON.stringify(s.a)), [{ d: '2026-10-28', ore: 8 }, { d: '2026-10-29', ore: 4 }]);
    assert.deepEqual(JSON.parse(JSON.stringify(s.b)), [{ d: '2026-10-29', ore: 4 }, { d: '2026-10-30', ore: 4 }]);
  });
  it('una fase non avviata porta il suo attrezzaggio, una avviata no', () => {
    const s = app({ capacita: true }, { setupB: 2 }).eval("(() => { const r = capSchedula(); return [r.fasi.get('fa').setup, r.fasi.get('fb').setup]; })()");
    assert.deepEqual(Array.from(s), [0, 2]);
  });
  it('la coda davanti al centro si ricorda da quando a quando', () => {
    const x = app({ capacita: true }, { codaB: 2 }).eval("capSchedula().fasi.get('fb')");
    // Arriva oggi, aspetta due giorni e trova il centro libero il 30.
    assert.equal(x.arrivo, '2026-10-28');
    assert.equal(x.codaFino, '2026-10-30');
    assert.equal(x.start, '2026-10-30');
  });
});

describe('Linea temporale dei centri — il disegno', () => {
  it('un riquadro per centro, con le fasi, la linea di oggi e la legenda', () => {
    const h = app({ capacita: true }).eval('capLineaHtml()');
    assert.ok(h.includes('class="cap-centro"'));
    assert.ok(h.includes('Tornio'));
    assert.ok(h.includes('ODP-A · 10') && h.includes('ODP-B · 10'));
    assert.ok(h.includes('class="cap-oggi"'));
    assert.ok(h.includes('Attraversamento'));
    assert.ok(h.includes("homeApri('odp','A')"), 'un clic sulla fase apre l’ordine');
  });
  it('attrezzaggio e lavoro previsti sono pezzi distinti della barra', () => {
    const h = app({ capacita: true }, { setupB: 2 }).eval('capLineaHtml()');
    assert.ok(h.includes('class="cap-att"'));
    assert.ok(h.includes('class="cap-lav"'));
  });
  it('la coda e l’attesa del centro si vedono come attraversamento', () => {
    const h = app({ capacita: true }, { codaB: 2 }).eval('capLineaHtml()');
    assert.ok(h.includes('class="cap-coda"'));
  });
  it('il pianificato dell’ODP è una riga sotto la barra', () => {
    assert.ok(app({ capacita: true }).eval('capLineaHtml()').includes('class="cap-pian"'));
  });
  it('il reale timbrato: i giorni delle timbrature, con l’attrezzaggio previsto all’inizio', () => {
    const a = app({ capacita: true, officina: true }, { timeLogs: [log('2026-10-27', '08', '12'), log('2026-10-26', '08', '09')] });
    const h = a.eval('capLineaHtml()');
    assert.ok(h.includes('class="cap-reale"'));
    // 2 h di attrezzaggio: tutta l'ora del 26 e la prima del 27.
    assert.ok(h.includes('26/10/2026: 1 h 00&#39; timbrate (attrezzaggio previsto 1 h 00&#39;)'));
    assert.ok(h.includes('27/10/2026: 4 h 00&#39; timbrate (attrezzaggio previsto 1 h 00&#39;)'));
  });
  it('senza timbrature il reale va dall’avvio a oggi, ancora con l’attrezzaggio previsto', () => {
    const h = app({ capacita: true }).eval('capLineaHtml()');
    assert.ok(h.includes('cap-reale cap-reale-dich'));
    assert.ok(h.includes('Avviata il 26/10/2026, in corso — attrezzaggio previsto 2 h 00&#39;'));
  });
  it('il rombo della consegna è rosso se l’ordine è in ritardo', () => {
    const h = app({ capacita: true }, { dueA: '2026-10-28' }).eval('capLineaHtml()');
    assert.ok(h.includes('cap-serve cap-serve-rit'));
    assert.ok(h.includes('1 ordine in ritardo'));
  });
  it('le fasi che non si toccano stanno sulla stessa corsia', () => {
    const n = app({ capacita: true }).eval(`(() => {
      const v = [{ i0: 0, i1: 3 }, { i0: 5, i1: 8 }, { i0: 2, i1: 6 }];
      return [capLineaCorsie(v), v.map(x => x.corsia).join(',')];
    })()`);
    assert.equal(n[0], 2);
    assert.equal(n[1], '0,1,0');
  });
  it('nella coda la linea sta sopra, la tabella resta chiusa sotto', () => {
    const h = app({ capacita: true }).eval('capCodaHtml()');
    assert.ok(h.indexOf('cap-linea') < h.indexOf('<details class="cap-tabelle">'));
    assert.ok(h.includes('Le fasi in tabella'));
  });
  it('col modulo spento non c’è', () => {
    assert.equal(app({}).eval('capLineaHtml()'), '');
  });
  it('al telefono si apre con oggi vicino al bordo sinistro', () => {
    const a = app({ capacita: true });
    const x = a.eval(`(() => {
      const el = { dataset: { oggi: '336' }, scrollWidth: 2000, clientWidth: 350, scrollLeft: 0 };
      capLineaScorri({ querySelectorAll: () => [el] });
      return el.scrollLeft;
    })()`);
    assert.equal(x, 336 - 4 * 24);
  });
});
