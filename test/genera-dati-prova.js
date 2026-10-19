// Un archivio di prova corposo, da importare in Bomtrack (Gestione → Backup →
// Importa backup). Non fa parte della suite: si lancia a mano.
//
//   node test/genera-dati-prova.js [file.json]
//
// L'officina è inventata — «Officine Prova», nastri trasportatori e macchine
// speciali — ma i dati non sono scritti a mano: le anagrafiche e le distinte sì,
// tutto il resto lo produce **l'app stessa**, caricata nell'harness dei test. I
// piani generano richieste, ordini, ordini di produzione e di lavoro con le
// stesse funzioni dei pulsanti; i ricevimenti, i lanci, gli avvii e le
// dichiarazioni passano dalle stesse porte di chi le preme. Così i documenti
// stanno in piedi come quelli veri: numeri, legami, fasi congelate, movimenti.
//
// Il tempo scorre: l'orologio dell'app viene spostato da aprile a ottobre, e
// ogni documento porta la data in cui «è successo».
//
// Gli utenti hanno tutti la password `bomtrack`. L'amministratore ha l'email
// prog3dac@gmail.com: caricando l'archivio su Supabase, è l'utente che si
// ritrova (gli altri, con email inventate, restano fuori finché non vengono
// invitati con la stessa email).
//
// Il generatore è deterministico: stesso seme, stesso archivio.

const fs = require('node:fs');
const path = require('node:path');
const { loadApp } = require('./harness.js');

const OUT = process.argv[2] || path.join(__dirname, '..', 'bomtrack_dati_prova.json');

const app = loadApp({ silent: true });
app.setDb({
  schemaVersion: 2,
  suppliers: [], customers: [], rfqs: [], orders: [], workOrders: [], users: [], families: [], jobs: [], plans: [],
  attachments: [], attachmentDocs: [], productions: [], prodOrders: [], prodDecls: [], movements: [], receipts: [],
  reminders: [], revisions: [], trash: [], workCenters: [], items: [],
  settings: { overheadPct: 12, marginPct: 25, currency: '€', codeDigits: 3, partSourcingDefault: 'make',
    uoms: [], uomDefault: 'pz', concepts: [], mpFamiliesSeeded: true, partFamiliesSeeded: true },
});
app.eval('migrateDB()');
app.asRole('admin');

// Tutto il lavoro gira dentro l'app: le funzioni sono quelle vere. La
// funzione non viene mai chiamata in Node: se ne prende il testo.
/* global db, Store, gid, stampNew, touch, saveDB, setUserPassword, getWorkCenter, getItem, invalidateCaches, addMovement,
   planDocGroups, planDocRows, planRowKey, planCreateDocs, nextPlanNumber, registraRicevuto, ordAutoStatus, opLancia, opAvvia,
   opDichiara, opProcessati, odpNew, showToast, opGenerabile, opGeneraOdl, nowISO, costOf, window */
function lavoro() {
// Un errore che l'app mostrerebbe a chi preme il pulsante qui non lo vede
// nessuno: si raccoglie, e il generatore si ferma se ce n'è uno.
const errori = [];
const toastVero = showToast;
showToast = (msg, tipo) => { if (tipo === 'error') errori.push(msg); };
// ── Orologio spostabile ──
const DataVera = Date;
let __ora = DataVera.UTC(2026, 3, 1, 8, 0, 0);
globalThis.Date = class extends DataVera {
  constructor(...a) { if (a.length) super(...a); else super(__ora); }
  static now() { return __ora; }
};
const giorno = (aaaa_mm_gg, ora) => { __ora = DataVera.parse(aaaa_mm_gg + 'T' + (ora || '08:30') + ':00Z'); };
const avanti = ore => { __ora += ore * 3600000; };

// ── Caso deterministico ──
let seme = 20261015;
const rnd = () => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme / 2147483648; };
const tra = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const scegli = v => v[Math.floor(rnd() * v.length)];
const alcuni = (v, n) => { const c = v.slice(); const out = []; while (out.length < n && c.length) out.push(c.splice(Math.floor(rnd() * c.length), 1)[0]); return out; };
const r2 = x => Math.round(x * 100) / 100;
const pad = (n, k) => String(n).padStart(k || 3, '0');

const ins = (coll, rec) => Store.insert(coll, Object.assign({ id: gid(), active: true }, rec));

// ═══ Azienda e utenti ═══
db.settings.company = { name: 'Officine Prova S.r.l.', referente: 'Andrea', email: 'ufficio@officineprova.it',
  phone: '0522 123456', vat: 'IT01234567890', street: 'Via dell\'Industria', streetNumber: '12', zip: '42100',
  city: 'Reggio Emilia', province: 'RE', country: 'Italia' };
const utente = (name, email, role, color) => {
  const u = { id: gid(), name, username: '', email, role, color, active: true };
  setUserPassword(u, 'bomtrack');
  return Store.insert('users', u);
};
const admin = utente('Andrea', 'prog3dac@gmail.com', 'admin', '#3A7BE8');
utente('Giulia Ferrari', 'giulia.ferrari@officineprova.it', 'acquisti', '#E8833A');
utente('Marco Bianchi', 'marco.bianchi@officineprova.it', 'progettazione', '#3AB87B');
utente('Luca Rinaldi', 'luca.rinaldi@officineprova.it', 'officina', '#9B59B6');
utente('Sara Conti', 'sara.conti@officineprova.it', 'lettore', '#7F8C8D');
currentUser = admin; Store.setActor(admin.id);

// ═══ Fornitori e clienti ═══
const CITTA = [['Reggio Emilia', 'RE', '42100'], ['Modena', 'MO', '41100'], ['Parma', 'PR', '43100'], ['Bologna', 'BO', '40100'],
  ['Brescia', 'BS', '25100'], ['Bergamo', 'BG', '24100'], ['Milano', 'MI', '20100'], ['Vicenza', 'VI', '36100'],
  ['Verona', 'VR', '37100'], ['Torino', 'TO', '10100'], ['Padova', 'PD', '35100'], ['Mantova', 'MN', '46100']];
const VIE = ['Via Emilia', 'Via Roma', 'Via dell\'Artigianato', 'Via Galilei', 'Via Volta', 'Via dei Mestieri', 'Via Marconi', 'Via Fermi'];
const PAG = ['Bonifico 30gg d.f.f.m.', 'Bonifico 60gg d.f.f.m.', 'RiBa 90gg', 'Bonifico vista fattura', 'RiBa 60gg'];
const TRASP = ['Franco destino', 'Franco partenza', 'EXW', 'Corriere a carico fornitore', 'Ritiro nostro mezzo'];
const anagrafica = (name, i) => {
  const c = CITTA[i % CITTA.length];
  const slug = name.toLowerCase().replace(/[^a-z]+/g, '');
  return { name, referente: scegli(['Paolo', 'Elena', 'Stefano', 'Chiara', 'Davide', 'Laura', 'Fabio', 'Monica']) + ' ' + scegli(['Rossi', 'Gatti', 'Lodi', 'Benassi', 'Ferri', 'Pini', 'Montanari', 'Corradini']),
    email: 'ordini@' + slug.slice(0, 14) + '.it', phone: '0' + tra(30, 59) + ' ' + tra(100000, 999999), vat: 'IT' + pad(tra(1, 99999999), 8) + pad(tra(100, 999)),
    street: scegli(VIE), streetNumber: String(tra(1, 120)), zip: c[2], city: c[0], province: c[1], country: 'Italia' };
};
const FORN = {
  acciaio: 'Acciai Padani', acciaio2: 'Siderurgica Emiliana', alluminio: 'Alluminio Veneto', inox: 'Inox Service',
  plastiche: 'Tecnopolimeri', gomma: 'Gomme Tecniche Lodi', cuscinetti: 'Cuscinetti & Trasmissioni', skf: 'Ricambi Industriali Bergamo',
  motori: 'Elettromeccanica Bassa', riduttori: 'Riduttori Italia', pneumatica: 'Pneumatica Brescia', elettrico: 'Elettroforniture Nord',
  automazione: 'Automazione Torino', viteria: 'Viteria Bolognese', viteria2: 'Bulloneria Mantovana', catene: 'Catene e Pignoni',
  laser: 'Laser Cut Modena', tempra: 'Trattamenti Termici Parma', zincatura: 'Zincatura Padana', verniciatura: 'Verniciature Vicentine',
  rettifica: 'Rettifiche di Precisione', anodizzazione: 'Anodica Veneta', torneria: 'Torneria Automatica Rinaldi', carpenteria: 'Carpenteria Leggera Gatti',
};
const S = {};
Object.keys(FORN).forEach((k, i) => {
  S[k] = ins('suppliers', Object.assign(anagrafica(FORN[k], i), { defaultTransport: scegli(TRASP), defaultPayment: scegli(PAG), notes: '' })).id;
});
const CLIENTI = ['Logistica Adriatica', 'Caseificio Valle Verde', 'Pastificio Emiliano', 'Imballaggi Rapidi', 'Ceramiche del Secchia',
  'Mobilificio Padano', 'Conserve Riunite', 'Cartiera del Po', 'Vetreria Lombarda', 'Distribuzione Alimentare Nord', 'Tessiture Carpi', 'Mangimi Reggiani'];
const C = CLIENTI.map((n, i) => ins('customers', Object.assign(anagrafica(n, i + 3), { notes: '' })));

// ═══ Centri di lavoro ═══
const W = {};
[['laser', 'Taglio laser', 85, 38], ['piega', 'Piegatura', 55, 38], ['tornio', 'Tornitura CNC', 60, 76], ['fresa', 'Fresatura CNC', 65, 76],
 ['saldatura', 'Saldatura', 48, 76], ['montaggio', 'Montaggio', 42, 114], ['collaudo', 'Collaudo', 50, 38], ['verniciatura', 'Verniciatura', 45, 38],
 ['trattamenti', 'Trattamenti esterni', 0, 0]].forEach(([k, name, hourlyRate, capacityHours]) => {
  W[k] = ins('workCenters', { name, hourlyRate, capacityHours, suppliers: [] }).id;
});
const terzista = (wc, sup, rate) => { const w = getWorkCenter(W[wc]); w.suppliers.push(stampNew({ id: gid(), supplierId: S[sup], rate, note: '' })); touch(w); };
terzista('laser', 'laser', 95); terzista('tornio', 'torneria', 58); terzista('saldatura', 'carpenteria', 52);
terzista('verniciatura', 'verniciatura', 40); terzista('trattamenti', 'tempra', 0); terzista('trattamenti', 'zincatura', 0);
terzista('trattamenti', 'anodizzazione', 0); terzista('fresa', 'rettifica', 70);

// ═══ Famiglie ═══
const fam = (name, kind, sigla, subs) => Store.insert('families', { id: gid(), name, kind, sigla, subs: subs.map(([n, s]) => stampNew({ id: gid(), name: n, sigla: s })) });
const F = {
  mecc: fam('Meccanica', 'acquistato', 'MEC', [['Cuscinetti', 'CUS'], ['Trasmissione', 'TRA'], ['Guide lineari', 'GUI'], ['Ruote e rulli', 'RUO']]),
  motori: fam('Motorizzazioni', 'acquistato', 'MOT', [['Motori', 'MOT'], ['Riduttori', 'RID'], ['Motoriduttori', 'MRD']]),
  pneu: fam('Pneumatica', 'acquistato', 'PNE', [['Cilindri', 'CIL'], ['Valvole', 'VAL'], ['Raccordi', 'RAC']]),
  ele: fam('Elettrico', 'acquistato', 'ELE', [['Sensori', 'SEN'], ['PLC e moduli', 'PLC'], ['Quadri e cavi', 'QUA'], ['Sicurezza', 'SIC']]),
  vit: fam('Viteria e minuteria', 'acquistato', 'VIT', [['Viti', 'VIT'], ['Dadi e rondelle', 'DAD'], ['Spine e anelli', 'SPI']]),
  acc: fam('Acciaio', 'materiale', 'ACC', [['Lamiere', 'LAM'], ['Tubi', 'TUB'], ['Barre', 'BAR'], ['Profilati', 'PRO']]),
  all: fam('Alluminio', 'materiale', 'ALL', [['Lamiere', 'LAM'], ['Profilati', 'PRO'], ['Barre', 'BAR']]),
  inox: fam('Acciaio inox', 'materiale', 'INX', [['Lamiere', 'LAM'], ['Tubi', 'TUB'], ['Barre', 'BAR']]),
  plast: fam('Materie plastiche', 'materiale', 'PLA', [['Lastre', 'LAS'], ['Barre', 'BAR']]),
  lav: fam('Lavorati', 'parte', 'LAV', [['Torniti', 'TOR'], ['Fresati', 'FRE'], ['Lamiera', 'LAM']]),
  carp: fam('Carpenteria', 'parte', 'CAR', [['Telai', 'TEL'], ['Staffe', 'STA'], ['Carter', 'CRT']]),
};
const sub = (f, i) => f.subs[i].id;

// ═══ Articoli ═══
const ITEMS = { mat: [], acq: [], prt: [], sgr: [], grp: [], mac: [] };
const cnt = { MAT: 0, CMM: 0, PRT: 0, SGR: 0, GRP: 0 };
const codice = pre => pre + '-' + pad(++cnt[pre], 4);
const listino = (fornitori, prezzo, lead, uomPrezzo) => fornitori.map((s, i) => stampNew({
  id: gid(), supplierId: S[s], price: r2(prezzo * (1 + i * (0.04 + rnd() * 0.08))), minQty: i ? tra(1, 5) * 10 : '',
  leadDays: lead + i * tra(2, 6), code: (FORN[s].slice(0, 3).toUpperCase()) + '-' + tra(1000, 99999), desc: '',
  date: '2026-0' + tra(1, 3) + '-' + pad(tra(1, 28), 2), rfqId: null, note: '', priceUom: uomPrezzo || '' }));
const articolo = (rec, fornitori, lead) => {
  const pl = fornitori && fornitori.length ? listino(fornitori, rec.unitCost || rec.purchasePrice, lead || 10, rec.uom) : [];
  const it = ins('items', Object.assign({ notes: '', priceList: pl, priceListSeeded: true,
    activePriceId: pl.length ? pl[0].id : null, supplierId: pl.length ? pl[0].supplierId : null }, rec));
  return it;
};

// Materie prime
const SPESSORI = [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];
SPESSORI.forEach(s => ITEMS.mat.push(articolo({ code: codice('MAT'), name: 'Lamiera S235JR sp. ' + s + ' mm', type: 'materiale', uom: 'kg',
  unitCost: r2(1.05 + s * 0.01), familyId: F.acc.id, subFamilyId: sub(F.acc, 0), safetyStock: 200 }, ['acciaio', 'acciaio2'], 7)));
[[20, 2], [30, 2], [40, 3], [50, 3], [60, 4], [80, 4], [100, 5]].forEach(([l, s]) => ITEMS.mat.push(articolo({ code: codice('MAT'),
  name: 'Tubo quadro ' + l + 'x' + l + 'x' + s + ' S235', type: 'materiale', uom: 'm', unitCost: r2(l * s * 0.032), familyId: F.acc.id, subFamilyId: sub(F.acc, 1) }, ['acciaio2', 'acciaio'], 10)));
[16, 20, 25, 30, 35, 40, 50, 60, 70, 80, 100].forEach(d => ITEMS.mat.push(articolo({ code: codice('MAT'), name: 'Barra tonda C45 Ø' + d, type: 'materiale', uom: 'kg',
  unitCost: r2(1.6 + d * 0.002), familyId: F.acc.id, subFamilyId: sub(F.acc, 2), altUom: 'm', altFactor: r2(d * d * 0.00617) }, ['acciaio', 'acciaio2'], 8)));
['UPN 80', 'UPN 100', 'UPN 120', 'IPE 100', 'IPE 120', 'L 40x40x4', 'L 50x50x5', 'Piatto 40x8', 'Piatto 60x10'].forEach(p => ITEMS.mat.push(articolo({ code: codice('MAT'),
  name: 'Profilato ' + p + ' S275', type: 'materiale', uom: 'm', unitCost: r2(4 + rnd() * 18), familyId: F.acc.id, subFamilyId: sub(F.acc, 3) }, ['acciaio2'], 12)));
[1.5, 2, 3, 5, 8].forEach(s => ITEMS.mat.push(articolo({ code: codice('MAT'), name: 'Lamiera alluminio 5754 sp. ' + s, type: 'materiale', uom: 'kg',
  unitCost: r2(4.2 + s * 0.05), familyId: F.all.id, subFamilyId: sub(F.all, 0) }, ['alluminio'], 10)));
['30x30', '40x40', '45x45', '40x80', '45x90', '80x80'].forEach(p => ITEMS.mat.push(articolo({ code: codice('MAT'), name: 'Profilato strutturale alluminio ' + p, type: 'materiale', uom: 'm',
  unitCost: r2(6 + rnd() * 20), familyId: F.all.id, subFamilyId: sub(F.all, 1) }, ['alluminio'], 14)));
[20, 30, 40, 60].forEach(d => ITEMS.mat.push(articolo({ code: codice('MAT'), name: 'Barra alluminio 6082 Ø' + d, type: 'materiale', uom: 'kg',
  unitCost: r2(5.1 + d * 0.01), familyId: F.all.id, subFamilyId: sub(F.all, 2) }, ['alluminio'], 10)));
[1, 1.5, 2, 3].forEach(s => ITEMS.mat.push(articolo({ code: codice('MAT'), name: 'Lamiera inox AISI 304 sp. ' + s, type: 'materiale', uom: 'kg',
  unitCost: r2(4.6 + s * 0.1), familyId: F.inox.id, subFamilyId: sub(F.inox, 0) }, ['inox'], 12)));
['Ø42,4x2', 'Ø60,3x2', '40x40x2'].forEach(t => ITEMS.mat.push(articolo({ code: codice('MAT'), name: 'Tubo inox AISI 304 ' + t, type: 'materiale', uom: 'm',
  unitCost: r2(9 + rnd() * 10), familyId: F.inox.id, subFamilyId: sub(F.inox, 1) }, ['inox'], 12)));
[20, 30, 50].forEach(d => ITEMS.mat.push(articolo({ code: codice('MAT'), name: 'Barra inox AISI 316 Ø' + d, type: 'materiale', uom: 'kg',
  unitCost: r2(7.5 + d * 0.02), familyId: F.inox.id, subFamilyId: sub(F.inox, 2) }, ['inox'], 15)));
['PEHD 1000 sp. 10', 'PEHD 1000 sp. 20', 'POM-C sp. 15', 'Policarbonato sp. 5'].forEach(p => ITEMS.mat.push(articolo({ code: codice('MAT'), name: 'Lastra ' + p, type: 'materiale', uom: 'kg',
  unitCost: r2(6 + rnd() * 9), familyId: F.plast.id, subFamilyId: sub(F.plast, 0) }, ['plastiche'], 10)));
['PA6 Ø40', 'PA6 Ø60', 'POM-C Ø30', 'POM-C Ø50', 'PTFE Ø30'].forEach(p => ITEMS.mat.push(articolo({ code: codice('MAT'), name: 'Barra ' + p, type: 'materiale', uom: 'kg',
  unitCost: r2(7 + rnd() * 20), familyId: F.plast.id, subFamilyId: sub(F.plast, 1) }, ['plastiche'], 10)));

// Commerciali
const acq = (name, prezzo, f, si, fornitori, lead, extra) => {
  const it = articolo(Object.assign({ code: codice('CMM'), name, type: 'acquistato', uom: 'pz', purchasePrice: prezzo,
    familyId: F[f].id, subFamilyId: sub(F[f], si) }, extra || {}), fornitori, lead);
  ITEMS.acq.push(it); return it;
};
['6201', '6202', '6203', '6204', '6205', '6206', '6207', '6208', '6305', '6306'].forEach(c => {
  acq('Cuscinetto radiale ' + c + '-2RS', r2(4 + Number(c.slice(-1)) * 1.8), 'mecc', 0, ['cuscinetti', 'skf'], 5);
});
['UCP 204', 'UCP 205', 'UCP 206', 'UCF 205', 'UCF 206', 'UCFL 204'].forEach(c => acq('Supporto ' + c + ' con cuscinetto', r2(14 + rnd() * 16), 'mecc', 0, ['cuscinetti', 'skf'], 7));
['Pignone 1/2" z15', 'Pignone 1/2" z19', 'Pignone 5/8" z17', 'Corona 1/2" z38', 'Corona 5/8" z45'].forEach(c => acq(c, r2(9 + rnd() * 30), 'mecc', 1, ['catene', 'cuscinetti'], 10));
acq('Catena semplice 1/2" (m)', 11.4, 'mecc', 1, ['catene'], 7, { uom: 'm' });
acq('Catena semplice 5/8" (m)', 16.2, 'mecc', 1, ['catene'], 7, { uom: 'm' });
['Giunto elastico GE 19', 'Giunto elastico GE 24', 'Giunto elastico GE 28', 'Calettatore 25x50', 'Calettatore 30x55'].forEach(c => acq(c, r2(18 + rnd() * 40), 'mecc', 1, ['cuscinetti'], 12));
['Cinghia dentata HTD 8M-1200-30', 'Cinghia dentata HTD 8M-1600-30', 'Puleggia HTD 8M z32', 'Puleggia HTD 8M z48'].forEach(c => acq(c, r2(20 + rnd() * 50), 'mecc', 1, ['cuscinetti', 'catene'], 10));
['Guida lineare 20 L=1000', 'Guida lineare 25 L=1500', 'Pattino a ricircolo 20', 'Pattino a ricircolo 25', 'Vite a ricircolo 20x5 L=800'].forEach(c => acq(c, r2(45 + rnd() * 180), 'mecc', 2, ['skf'], 21));
['Rullo folle Ø50 L=600', 'Rullo folle Ø50 L=800', 'Rullo motorizzato Ø50 L=600', 'Ruota piroettante Ø100 con freno', 'Ruota fissa Ø100', 'Piedino livellatore M16'].forEach(c => acq(c, r2(8 + rnd() * 90), 'mecc', 3, ['cuscinetti', 'skf'], 14));
[[0.37, 4], [0.55, 4], [0.75, 4], [1.1, 4], [1.5, 4], [2.2, 4], [3, 4], [4, 4]].forEach(([kw, p]) => acq('Motore asincrono ' + kw + ' kW ' + p + ' poli B14', r2(110 + kw * 75), 'motori', 0, ['motori', 'elettrico'], 15));
['i=10', 'i=20', 'i=30', 'i=40', 'i=60'].forEach(i => acq('Riduttore a vite senza fine 63 ' + i, r2(160 + rnd() * 60), 'motori', 1, ['riduttori'], 20));
[0.37, 0.75, 1.5, 2.2].forEach(kw => acq('Motoriduttore coassiale ' + kw + ' kW', r2(320 + kw * 160), 'motori', 2, ['riduttori', 'motori'], 25));
[[32, 100], [32, 200], [40, 150], [50, 200], [63, 250], [80, 300]].forEach(([d, c]) => acq('Cilindro ISO 15552 Ø' + d + ' c.' + c, r2(55 + d * 1.1 + c * 0.1), 'pneu', 0, ['pneumatica'], 10));
['Elettrovalvola 5/2 1/4" 24V', 'Elettrovalvola 5/3 1/4" 24V', 'Isola valvole 8 posti', 'Gruppo FRL 1/2"', 'Regolatore di flusso 1/4"'].forEach(c => acq(c, r2(30 + rnd() * 250), 'pneu', 1, ['pneumatica'], 10));
['Raccordo diritto 8-1/4"', 'Raccordo a L 8-1/4"', 'Tubo PU 8x6 (m)', 'Silenziatore 1/4"'].forEach(c => acq(c, r2(0.8 + rnd() * 3), 'pneu', 2, ['pneumatica'], 5, c.includes('(m)') ? { uom: 'm' } : {}));
['Sensore induttivo M12 PNP', 'Sensore induttivo M18 PNP', 'Fotocellula a riflessione', 'Fotocellula a sbarramento', 'Encoder incrementale 1024 imp', 'Finecorsa a leva'].forEach(c => acq(c, r2(25 + rnd() * 90), 'ele', 0, ['elettrico', 'automazione'], 7));
['PLC CPU 1212C', 'Modulo 16 ingressi digitali', 'Modulo 16 uscite digitali', 'Pannello operatore 7"', 'Inverter 1.5 kW', 'Inverter 3 kW'].forEach(c => acq(c, r2(180 + rnd() * 700), 'ele', 1, ['automazione', 'elettrico'], 20));
['Quadro elettrico 600x400x200', 'Cavo FG16OR16 4G1,5 (m)', 'Canalina 40x60 (m)', 'Pulsantiera 3 posti', 'Lampada segnalazione LED'].forEach(c => acq(c, r2(3 + rnd() * 300), 'ele', 2, ['elettrico'], 10, c.includes('(m)') ? { uom: 'm' } : {}));
['Fungo di emergenza', 'Barriera fotoelettrica 600 mm', 'Interruttore di sicurezza a chiave', 'Modulo relè di sicurezza'].forEach(c => acq(c, r2(40 + rnd() * 600), 'ele', 3, ['automazione'], 15));
['M6x16', 'M6x25', 'M8x20', 'M8x30', 'M10x30', 'M10x40', 'M12x40', 'M12x60', 'M16x60'].forEach(c => acq('Vite TCEI ' + c + ' 8.8 zincata', r2(0.05 + rnd() * 0.5), 'vit', 0, ['viteria', 'viteria2'], 3));
['M6x20', 'M8x25', 'M10x30', 'M12x40'].forEach(c => acq('Vite TE ' + c + ' 8.8 zincata', r2(0.05 + rnd() * 0.4), 'vit', 0, ['viteria2', 'viteria'], 3));
['M6', 'M8', 'M10', 'M12', 'M16'].forEach(c => { acq('Dado autobloccante ' + c, r2(0.03 + rnd() * 0.2), 'vit', 1, ['viteria'], 3); acq('Rondella piana ' + c, r2(0.01 + rnd() * 0.08), 'vit', 1, ['viteria2'], 3); });
['Spina cilindrica 6x30', 'Spina elastica 5x30', 'Anello Seeger E20', 'Anello Seeger E25', 'Anello Seeger I47', 'Linguetta 8x7x30'].forEach(c => acq(c, r2(0.05 + rnd() * 0.6), 'vit', 2, ['viteria'], 5));

const mat = nome => ITEMS.mat.find(m => m.name.includes(nome));
const cmm = nome => ITEMS.acq.find(m => m.name.includes(nome));

// Parti prodotte: materiale + fasi, qualcuna con una fase esterna
const CONCETTI = ['cn-albero', 'cn-flangia', 'cn-staffa', 'cn-piastra', 'cn-distanziale', 'cn-perno', 'cn-boccola', 'cn-coperchio', 'cn-supporto', 'cn-ghiera'];
const opInt = (wc, ore, nota) => ({ kind: 'op', workCenterId: W[wc], supplierId: null, costMode: 'orario', cost: 0, hours: ore, days: 0, rate: getWorkCenter(W[wc]).hourlyRate, note: nota || '' });
const opEst = (wc, sup, costo, gg, nota) => ({ kind: 'op', workCenterId: W[wc], supplierId: S[sup], costMode: 'fisso', cost: costo, hours: 0, days: gg, rate: 0, note: nota || '' });
const parte = (name, f, si, ciclo, extra) => {
  const it = ins('items', Object.assign({ code: codice('PRT'), name, type: 'parte', uom: 'pz', unitCost: 0, sourcing: 'make',
    familyId: F[f].id, subFamilyId: sub(F[f], si), notes: '', priceList: [], priceListSeeded: true, cycle: ciclo }, extra || {}));
  ITEMS.prt.push(it); return it;
};
const TORNITI = [['Albero', 'cn-albero'], ['Perno', 'cn-perno'], ['Boccola', 'cn-boccola'], ['Distanziale', 'cn-distanziale'], ['Ghiera', 'cn-ghiera'], ['Flangia', 'cn-flangia']];
for (let i = 0; i < 70; i++) {
  const [nome, concetto] = scegli(TORNITI);
  const d = scegli([20, 25, 30, 35, 40, 50, 60, 80]);
  const barra = ITEMS.mat.filter(m => /Barra/.test(m.name) && Number((m.name.match(/Ø(\d+)/) || [])[1]) >= d)[0] || mat('Barra tonda C45 Ø100');
  const l = tra(40, 600);
  const ciclo = [{ kind: 'item', itemId: barra.id, qty: r2(d * d * 0.00617 * (l + 10) / 1000 * (barra.name.includes('alluminio') ? 0.35 : 1)), costOverride: null },
    opInt('tornio', r2(0.15 + l / 2000 + rnd() * 0.3), 'Tornitura')];
  if (rnd() < 0.35) ciclo.push(opInt('fresa', r2(0.1 + rnd() * 0.4), 'Fresatura sedi linguetta'));
  if (rnd() < 0.3) ciclo.push(opEst('trattamenti', 'tempra', r2(1.5 + rnd() * 4), tra(4, 8), 'Tempra a induzione'));
  if (rnd() < 0.2) ciclo.push(opEst('fresa', 'rettifica', r2(4 + rnd() * 10), tra(3, 6), 'Rettifica sedi cuscinetto'));
  if (rnd() < 0.15) ciclo.push(opEst('trattamenti', 'zincatura', r2(0.8 + rnd() * 2), tra(3, 5), 'Zincatura'));
  parte(nome + ' Ø' + d + ' L=' + l, 'lav', 0, ciclo, { conceptId: concetto,
    lotSize: scegli([0, 0, 10, 20, 50]), lotMode: 'min', safetyStock: scegli([0, 0, 0, 5, 10]) });
}
const LAMIERA = [['Staffa', 'cn-staffa', 'carp', 1], ['Piastra', 'cn-piastra', 'lav', 2], ['Supporto', 'cn-supporto', 'carp', 1], ['Coperchio', 'cn-coperchio', 'carp', 2], ['Carter di protezione', null, 'carp', 2], ['Fiancata', null, 'carp', 0]];
for (let i = 0; i < 80; i++) {
  const [nome, concetto, f, si] = scegli(LAMIERA);
  const lam = scegli(ITEMS.mat.filter(m => /Lamiera/.test(m.name)));
  const kg = r2(0.4 + rnd() * (nome === 'Fiancata' ? 40 : 8));
  const ciclo = [{ kind: 'item', itemId: lam.id, qty: kg, costOverride: null }];
  if (rnd() < 0.25) ciclo.push(opEst('laser', 'laser', r2(2 + kg * 0.9), tra(3, 6), 'Taglio laser esterno'));
  else ciclo.push(opInt('laser', r2(0.05 + kg * 0.01), 'Taglio laser'));
  if (rnd() < 0.7) ciclo.push(opInt('piega', r2(0.1 + rnd() * 0.4), 'Piegatura'));
  if (rnd() < 0.3) ciclo.push(opInt('saldatura', r2(0.2 + rnd() * 1), 'Saldatura'));
  if (lam.name.includes('alluminio') && rnd() < 0.5) ciclo.push(opEst('trattamenti', 'anodizzazione', r2(2 + kg * 1.5), tra(5, 8), 'Anodizzazione naturale'));
  else if (!lam.name.includes('inox') && rnd() < 0.5) ciclo.push(rnd() < 0.5 ? opInt('verniciatura', r2(0.2 + kg * 0.02), 'Verniciatura RAL 7035')
    : opEst('verniciatura', 'verniciatura', r2(3 + kg * 0.6), tra(4, 7), 'Verniciatura a polvere RAL 5010'));
  parte(nome + ' ' + lam.name.replace(/^Lamiera /, '').replace(/ sp\. /, ' s') + ' #' + (i + 1), f, si, ciclo, concetto ? { conceptId: concetto } : {});
}
for (let i = 0; i < 25; i++) {
  const tubo = scegli(ITEMS.mat.filter(m => /Tubo|Profilato/.test(m.name)));
  const m = r2(2 + rnd() * 10);
  const ciclo = [{ kind: 'item', itemId: tubo.id, qty: m, costOverride: null }, opInt('laser', r2(0.2 + rnd() * 0.5), 'Taglio tubi'),
    opInt('saldatura', r2(1.5 + rnd() * 6), 'Saldatura telaio')];
  if (rnd() < 0.5) ciclo.push(opEst('trattamenti', 'zincatura', r2(15 + m * 4), tra(5, 8), 'Zincatura a caldo'));
  else ciclo.push(opEst('verniciatura', 'verniciatura', r2(25 + m * 5), tra(4, 7), 'Verniciatura a polvere'));
  parte('Telaio saldato ' + tubo.name.replace(/^(Tubo quadro|Profilato) /, '') + ' T' + (i + 1), 'carp', 0, ciclo);
}
// Parti di plastica che si comprano lavorate (sourcing buy, con listino)
for (let i = 0; i < 20; i++) {
  const p = parte(scegli(['Pattino di strisciamento', 'Guida catena', 'Raschiatore', 'Tampone', 'Paracolpi']) + ' PEHD ' + tra(100, 900) + ' mm', 'lav', 1, [],
    { sourcing: 'buy', purchasePrice: r2(6 + rnd() * 40) });
  p.priceList = listino(['torneria', 'plastiche'], p.purchasePrice, 12); p.activePriceId = p.priceList[0].id; p.supplierId = p.priceList[0].supplierId; touch(p);
}

// ═══ Distinte: sottogruppi, gruppi, macchine ═══
const comp = (it, qty, scrapPct) => ({ itemId: it.id, qty, scrapPct: scrapPct || 0 });
const viti = () => alcuni(ITEMS.acq.filter(a => /Vite|Dado|Rondella/.test(a.name)), tra(2, 4)).map(v => comp(v, tra(4, 24)));
const assieme = (tipo, pre, name, components, ore, extra) => {
  const it = ins('items', Object.assign({ code: codice(pre), name, type: tipo, uom: 'pz', notes: '', components,
    operations: [{ workCenterId: W.montaggio, hours: ore, note: 'Montaggio' }].concat(rnd() < 0.3 ? [{ workCenterId: W.collaudo, hours: r2(ore * 0.3), note: 'Controllo' }] : []) }, extra || {}));
  ITEMS[pre === 'SGR' ? 'sgr' : 'grp'].push(it); return it;
};
const torniti = () => ITEMS.prt.filter(p => p.cycle.some(r => r.kind === 'op' && r.workCenterId === W.tornio));
const lamiere = () => ITEMS.prt.filter(p => /Staffa|Piastra|Supporto|Coperchio|Carter|Fiancata/.test(p.name));
const telai = () => ITEMS.prt.filter(p => /Telaio/.test(p.name));
const SGR_TIPI = [
  ['Gruppo rullo motorizzato', () => [comp(scegli(torniti()), 1), comp(cmm('Supporto UCP 205'), 2), comp(scegli(ITEMS.acq.filter(a => /Motoriduttore/.test(a.name))), 1), comp(scegli(ITEMS.acq.filter(a => /Giunto/.test(a.name))), 1)]],
  ['Gruppo rinvio', () => [comp(scegli(torniti()), 1), comp(scegli(ITEMS.acq.filter(a => /Supporto UC/.test(a.name))), 2), comp(scegli(ITEMS.acq.filter(a => /Pignone|Puleggia/.test(a.name))), 2)]],
  ['Gruppo tensionamento', () => [comp(scegli(lamiere()), 2), comp(scegli(torniti()), 2), comp(scegli(ITEMS.acq.filter(a => /Cuscinetto/.test(a.name))), 2)]],
  ['Gruppo spintore pneumatico', () => [comp(scegli(ITEMS.acq.filter(a => /Cilindro/.test(a.name))), 1), comp(cmm('Elettrovalvola 5/2'), 1), comp(scegli(lamiere()), 2), comp(cmm('Raccordo diritto'), 4), comp(cmm('Tubo PU'), 3)]],
  ['Gruppo traslazione lineare', () => [comp(scegli(ITEMS.acq.filter(a => /Guida lineare/.test(a.name))), 2), comp(scegli(ITEMS.acq.filter(a => /Pattino/.test(a.name))), 4), comp(scegli(lamiere()), 1), comp(cmm('Vite a ricircolo'), 1)]],
  ['Gruppo sensori', () => [comp(scegli(ITEMS.acq.filter(a => /Sensore|Fotocellula/.test(a.name))), tra(2, 6)), comp(scegli(lamiere()), tra(2, 6)), comp(cmm('Cavo FG16OR16'), tra(5, 20))]],
  ['Gruppo piedini', () => [comp(cmm('Piedino livellatore'), 4), comp(scegli(lamiere()), 4)]],
  ['Gruppo protezioni', () => [comp(scegli(ITEMS.prt.filter(p => /Carter/.test(p.name))), tra(2, 4)), comp(cmm('Interruttore di sicurezza'), 1)]],
];
for (let i = 0; i < 48; i++) {
  const [nome, f] = SGR_TIPI[i % SGR_TIPI.length];
  assieme('sottogruppo', 'SGR', nome + ' ' + String.fromCharCode(65 + Math.floor(i / SGR_TIPI.length)), f().concat(viti()), r2(0.5 + rnd() * 2.5));
}
const GRP_TIPI = ['Modulo nastro', 'Modulo curva 90°', 'Stazione di carico', 'Stazione di scarico', 'Modulo rulliera', 'Elevatore', 'Stazione di centraggio'];
for (let i = 0; i < 24; i++) {
  const sg = alcuni(ITEMS.sgr, tra(2, 4)).map(s => comp(s, tra(1, 2)));
  const c = [comp(scegli(telai()), 1)].concat(sg, alcuni(lamiere(), tra(1, 3)).map(p => comp(p, tra(1, 4))),
    rnd() < 0.5 ? [comp(scegli(ITEMS.acq.filter(a => /Rullo/.test(a.name))), tra(6, 20))] : [], viti());
  assieme('gruppo', 'GRP', GRP_TIPI[i % GRP_TIPI.length] + ' ' + (Math.floor(i / GRP_TIPI.length) + 1) + '00', c, r2(2 + rnd() * 8));
}
const quadro = ITEMS.grp.length;
const grpEle = assieme('gruppo', 'GRP', 'Quadro elettrico di comando', [comp(cmm('Quadro elettrico 600x400'), 1), comp(cmm('PLC CPU'), 1), comp(cmm('Modulo 16 ingressi'), 1),
  comp(cmm('Modulo 16 uscite'), 1), comp(cmm('Pannello operatore'), 1), comp(cmm('Inverter 1.5'), 2), comp(cmm('Modulo relè'), 1), comp(cmm('Cavo FG16OR16'), 60), comp(cmm('Canalina'), 8)], 12);
const MACCHINE = [['NT-200', 'Nastro trasportatore NT-200'], ['NT-400', 'Nastro trasportatore NT-400 per alimentare'], ['RL-150', 'Rulliera motorizzata RL-150'],
  ['CV-90', 'Curva motorizzata CV-90'], ['EL-300', 'Elevatore a tapparelle EL-300'], ['PAL-1', 'Pallettizzatore semplice PAL-1'],
  ['LNC-800', 'Linea di confezionamento LNC-800'], ['ST-50', 'Stazione di smistamento ST-50']];
MACCHINE.forEach(([code, name], i) => {
  const g = alcuni(ITEMS.grp.filter(x => x !== grpEle), tra(2, 5)).map(x => comp(x, tra(1, 3)));
  const it = ins('items', { code, name, type: 'macchina', uom: 'pz', notes: '', rev: 'A',
    components: g.concat([comp(grpEle, 1), comp(cmm('Fungo di emergenza'), tra(1, 3)), comp(cmm('Lampada segnalazione'), 1)],
      i % 2 ? [comp(cmm('Barriera fotoelettrica'), 2)] : []),
    operations: [{ workCenterId: W.montaggio, hours: tra(16, 60), note: 'Montaggio finale' }, { workCenterId: W.collaudo, hours: tra(4, 16), note: 'Collaudo funzionale' }] });
  ITEMS.mac.push(it);
});
// Le macchine dicono di sé: ogni gruppo sa per quale macchina è nato
ITEMS.grp.forEach(g => { const m = ITEMS.mac.find(x => x.components.some(c => c.itemId === g.id)); if (m) { g.machineItemId = m.id; touch(g); } });
saveDB(); invalidateCaches();

// ═══ Giacenze iniziali (inventario d'apertura) ═══
giorno('2026-04-01', '07:30');
ITEMS.acq.forEach(a => { if (rnd() < 0.6) addMovement(a.id, 'carico', a.uom === 'm' ? tra(10, 200) : a.purchasePrice < 1 ? tra(100, 2000) : a.purchasePrice > 100 ? tra(0, 3) : tra(2, 30), 'Inventario di apertura'); });
ITEMS.mat.forEach(m => { if (rnd() < 0.7) addMovement(m.id, 'carico', m.uom === 'kg' ? tra(50, 1500) : tra(6, 60), 'Inventario di apertura'); });
ITEMS.prt.forEach(p => { if (rnd() < 0.2) addMovement(p.id, 'carico', tra(2, 30), 'Inventario di apertura'); });
saveDB();

// ═══ Commesse, piani e tutto quello che ne viene ═══
const COMMESSE = [
  // data, cliente, macchine [codice, qty], stato del lavoro
  ['2026-04-03', 0, [['NT-200', 2], ['CV-90', 2]], 'chiusa'],
  ['2026-04-14', 1, [['NT-400', 3]], 'chiusa'],
  ['2026-04-28', 2, [['LNC-800', 1]], 'produzione'],
  ['2026-05-12', 3, [['PAL-1', 1], ['RL-150', 2]], 'produzione'],
  ['2026-05-26', 4, [['RL-150', 4]], 'produzione'],
  ['2026-06-09', 5, [['EL-300', 1], ['NT-200', 1]], 'produzione'],
  ['2026-06-23', 6, [['NT-400', 2], ['CV-90', 1]], 'produzione'],
  ['2026-07-08', 7, [['ST-50', 2]], 'produzione'],
  ['2026-07-21', 8, [['NT-200', 3]], 'aperta'],
  ['2026-09-01', 9, [['LNC-800', 1], ['EL-300', 1]], 'aperta'],
  ['2026-09-15', 10, [['RL-150', 6]], 'aperta'],
  ['2026-09-29', 11, [['PAL-1', 2]], 'aperta'],
  ['2026-10-06', 1, [['NT-400', 2]], 'aperta'],
  ['2026-10-12', 3, [['CV-90', 4]], 'aperta'],
];
const piu = (iso, gg) => { const d = new DataVera(DataVera.parse(iso + 'T12:00:00Z') + gg * 86400000); return d.toISOString().slice(0, 10); };
const OGGI = '2026-10-15';
const genera = (p, kind, filtro) => {
  window.__planDocsId = p.id; window.__planDocsKind = kind;
  const gruppi = planDocGroups(planDocRows(p, kind).filter(r => r.qtyOrder > 0), kind);
  const prima = { rfq: db.rfqs.length, order: db.orders.length, odl: db.workOrders.length, odp: db.prodOrders.length }[kind];
  planDocsSelection = () => { const m = new Map(); gruppi.forEach(g => { if (!filtro || filtro(g)) m.set(g.key != null ? g.key : (g.supplierId || ''), g.rows.map(planRowKey)); }); return m; };
  planCreateDocs();
  const coll = { rfq: db.rfqs, order: db.orders, odl: db.workOrders, odp: db.prodOrders }[kind];
  return coll.slice(prima);
};
const conferma = (o, data) => { o.status = 'confermato'; o.supplierConfirmation = 'OC ' + tra(1000, 9999) + ' del ' + data;
  (o.lines || []).forEach(l => { l.confirmedDate = piu(l.deliveryDate || data, tra(-2, 6)); }); touch(o); };
const riceviOrdine = (o, quota) => {
  (o.lines || []).forEach(l => { const q = Number(l.qty) || 0; registraRicevuto('orders', o, l, quota >= 1 ? q : Math.floor(q * quota * (0.5 + rnd() * 0.5))); });
  ordAutoStatus(o); touch(o);
};
// Un ODP fatto avanzare fase per fase: «fin» è la quota di fasi completate
const avanzaOdp = (o, fin, dataInizio) => {
  giorno(dataInizio, '07:00');
  if (!opLancia(o.id)) return;
  const fasi = o.phases || [];
  // Le fasi esterne si commissionano al lancio: un ordine di lavoro per tratta
  fasi.forEach(f => {
    if (!f.supplierId || !opGenerabile(o, f)) return;
    const odl = opGeneraOdl(o.id, f.id);
    if (odl) { odl.status = 'inviato'; if (rnd() < 0.7) { odl.status = 'confermato'; odl.supplierConfirmation = 'Conferma via email'; } touch(odl); }
  });
  const n = Math.round(fasi.length * fin);
  let d = dataInizio;
  for (let i = 0; i < fasi.length; i++) {
    const f = fasi[i];
    if (i > n) break;
    giorno(d, '07:' + pad(tra(10, 50), 2));
    if (!opAvvia(o.id, f.id, {})) break;
    if (i === n && fin < 1) break;            // avviata, ancora in lavorazione
    avanti(tra(2, 9));
    const pezzi = Number(o.qty) || 0;
    const scarti = rnd() < 0.15 ? 1 : 0;
    if (rnd() < 0.3 && pezzi > 3) {           // dichiarata in due volte
      opDichiara(o.id, f.id, { qty: Math.floor(pezzi / 2), scrap: 0 });
      avanti(tra(4, 20));
    }
    const gia = opProcessati(o, f);
    const resto = Math.max(0, pezzi - gia - scarti);
    if (resto + scarti > 0) opDichiara(o.id, f.id, { qty: resto, scrap: scarti, note: scarti ? 'Un pezzo fuori quota' : '' });
    d = piu(d, f.supplierId ? tra(3, 8) : tra(0, 2));
    if (d > OGGI) break;
  }
};

const JOBS = [];
const PIANI = [];
COMMESSE.forEach(([data, ci, righe, stato], k) => {
  giorno(data, '09:00');
  const cli = C[ci];
  const consegna = piu(data, tra(70, 110));
  const job = ins('jobs', { number: 'COM-2026-' + pad(k + 1), customer: cli.name, title: righe.map(([c, q]) => q + '× ' + c).join(', '),
    customerRef: 'Ordine cliente ' + tra(100, 999) + '/26', status: 'aperta', date: data, dueDate: consegna, notes: '' });
  JOBS.push(job);
  avanti(2);
  const p = ins('plans', { number: nextPlanNumber(), title: job.title + ' — ' + cli.name, date: data, dueDate: piu(consegna, -10), notes: '', jobId: job.id,
    lines: righe.map(([c, q]) => ({ id: gid(), itemId: ITEMS.mac.find(m => m.code === c).id, qty: q, dueDate: piu(consegna, -10) })) });
  PIANI.push({ p, job, data, stato });
});
saveDB(); invalidateCaches();

PIANI.forEach(({ p, job, data, stato }, k) => {
  const eta = (DataVera.parse(OGGI) - DataVera.parse(data)) / 86400000;  // giorni da quando è nato
  // Richieste d'offerta: solo sulle commesse più recenti, prima di ordinare
  giorno(piu(data, 1), '10:00');
  if (eta < 60) {
    const rfq = genera(p, 'rfq', g => g.supplierId && rnd() < 0.6);
    rfq.forEach(r => {
      if (eta > 10) { r.status = 'inviata'; touch(r); }
      if (eta > 25 && rnd() < 0.6) { r.status = 'ricevuta'; (r.lines || []).forEach(l => { const it = l.itemId && getItem(l.itemId); l.price = it ? r2((it.purchasePrice || it.unitCost || 10) * (0.9 + rnd() * 0.2)) : r2(5 + rnd() * 20); }); touch(r); }
    });
    if (eta < 12) { saveDB(); return; }       // ancora in fase d'offerta
  }
  // Ordini d'acquisto
  giorno(piu(data, eta < 60 ? 12 : 3), '11:00');
  const ordini = genera(p, 'order', g => !!g.supplierId);
  // Ordini di produzione per tutte le parti
  avanti(2);
  const odp = genera(p, 'odp');
  saveDB();

  // Il tempo passa: si inviano, si confermano, arriva la merce
  ordini.forEach(o => {
    if (eta < 25) { if (rnd() < 0.5) { o.status = 'inviato'; touch(o); } return; }
    o.status = 'inviato'; touch(o);
    giorno(piu(o.date, tra(1, 4)), '15:00'); conferma(o, piu(o.date, 2));
    const consegna = piu(o.date, tra(10, 30));
    if (consegna > OGGI) return;
    giorno(consegna, '10:30');
    riceviOrdine(o, eta > 90 ? 1 : (rnd() < 0.5 ? 1 : 0.6));
  });
  saveDB();

  // La produzione: più la commessa è vecchia, più è avanti
  odp.forEach((o, i) => {
    if (eta < 30) return;                     // ancora in bozza
    const fin = eta > 150 ? 1 : eta > 100 ? (rnd() < 0.8 ? 1 : 0.5) : eta > 60 ? scegli([0, 0.3, 0.6, 1]) : scegli([0, 0, 0.3]);
    avanzaOdp(o, fin, piu(data, 20 + (i % 10)));
  });
  saveDB();

  // Le macchine finite: produzioni registrate e commesse chiuse
  if (stato === 'chiusa') {
    giorno(piu(data, 150), '16:00');
    (p.lines || []).forEach(l => Store.insert('productions', { id: gid(), planId: p.id, itemId: l.itemId, qty: l.qty, date: nowISO(), note: 'Collaudata e spedita' }));
    job.status = 'chiusa'; touch(job);
    p.active = false; touch(p);
  } else if (stato === 'produzione') { job.status = 'produzione'; touch(job); }
  saveDB();
});

// Un paio di ordini di produzione scritti a mano, fuori dai piani (ricambi)
giorno('2026-10-02', '08:00');
alcuni(torniti(), 4).forEach(part => { const o = odpNew(part, tra(5, 20), piu('2026-10-02', 20), { title: 'Scorta ricambi' }); db.prodOrders.push(o); });
// Un ordine annullato, perché capita
const daAnnullare = db.orders.find(o => o.status === 'confermato');
if (daAnnullare) { daAnnullare.status = 'annullato'; daAnnullare.notes = 'Sostituito da un ordine a un altro fornitore'; touch(daAnnullare); }
saveDB();

// ═══ Promemoria ═══
giorno('2026-10-10', '09:00');
const PROMEMORIA = [['Sollecitare conferma d\'ordine', 'alta'], ['Verificare disegni con il cliente', 'media'], ['Prenotare il collaudo in sede cliente', 'media'],
  ['Chiedere offerta alternativa per i motoriduttori', 'bassa'], ['Controllare giacenza viteria', 'bassa'], ['Inviare documentazione CE', 'alta'],
  ['Riunione avanzamento commessa', 'media'], ['Rinnovare listino laser', 'bassa'], ['Programmare la manutenzione del tornio', 'media'],
  ['Spedire materiale al terzista', 'alta'], ['Fatturare acconto', 'media'], ['Verificare tempi di zincatura', 'bassa']];
PROMEMORIA.forEach(([title, gravita], i) => ins('reminders', { date: piu('2026-10-08', i * 2 - 6), title, notes: '', gravita, done: i < 4, jobId: JOBS[(i * 3) % JOBS.length].id }));

// ═══ Una revisione di distinta ═══
giorno('2026-06-15', '14:00');
const mac = ITEMS.mac[0];
Store.insert('revisions', { id: gid(), itemId: mac.id, rev: 'A', date: nowISO(), motivo: 'Prima emissione',
  snapshot: { components: mac.components.map(c => ({ itemId: c.itemId, qty: c.qty })), cost: r2(costOf(mac.id)) } });
mac.rev = 'B'; touch(mac);

giorno(OGGI, '12:00');
saveDB();
globalThis.Date = DataVera;
showToast = toastVero;
return JSON.stringify({ errori,
  articoli: db.items.length, materiali: ITEMS.mat.length, commerciali: ITEMS.acq.length, parti: ITEMS.prt.length,
  sottogruppi: ITEMS.sgr.length, gruppi: ITEMS.grp.length, macchine: ITEMS.mac.length,
  fornitori: db.suppliers.length, clienti: db.customers.length, centri: db.workCenters.length, commesse: db.jobs.length, piani: db.plans.length,
  richieste: db.rfqs.length, ordini: db.orders.length, odl: db.workOrders.length, odp: db.prodOrders.length,
  dichiarazioni: db.prodDecls.length, movimenti: db.movements.length, promemoria: db.reminders.length, utenti: db.users.length,
});
}
const risultato = app.eval('(' + lavoro.toString() + ')()');

const conti = JSON.parse(risultato);
if (conti.errori.length) { console.error('L\'app ha rifiutato dei passi:', conti.errori); process.exit(1); }
delete conti.errori;
const snap = app.eval('Store.exportSnapshot()');

// Prova del nove: il file rientra da un import come quello dell'app, e la
// validazione dell'app lo accetta.
const errore = app.eval(`validateSnapshot(${snap})`);
if (errore) { console.error('Backup non valido:', errore); process.exit(1); }
const prova = loadApp({ silent: true });
prova.asRole('admin');
prova.eval(`Store.importSnapshot(${snap})`);

fs.writeFileSync(OUT, snap);
console.log(conti);
console.log('Scritto', OUT, (snap.length / 1024 / 1024).toFixed(1) + ' MB');
