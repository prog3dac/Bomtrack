// Costruttori di database sintetici. Volutamente minimi: ogni test dichiara
// solo ciò che serve al ramo che verifica, così i numeri attesi restano
// calcolabili a mente e un fallimento indica un punto preciso.

// schemaVersion: 2 è obbligatorio — senza, migrateDB() lancerebbe migrateV2()
// e riscriverebbe tutti gli id in UUID, mandando a vuoto i riferimenti scritti
// a mano qui sotto. I flag *Seeded evitano il seed delle famiglie predefinite.
function makeDb(over) {
  const o = over || {};
  const base = {
    schemaVersion: 2,
    suppliers: [], rfqs: [], orders: [], workOrders: [], users: [], families: [],
    attachments: [], attachmentDocs: [], productions: [],
    prodOrders: [], prodDecls: [],
    workCenters: o.workCenters || [],
    items: o.items || [],
    settings: Object.assign({
      overheadPct: 0, marginPct: 0, currency: '€', codeDigits: 3,
      partSourcingDefault: 'buy',
      uoms: [], uomDefault: 'pz', concepts: [],
      mpFamiliesSeeded: true, partFamiliesSeeded: true,
    }, o.settings || {}),
  };
  Object.keys(o).forEach(k => { if (k !== 'settings') base[k] = o[k]; });
  return base;
}

function mat(id, unitCost) {
  return { id, code: id.toUpperCase(), name: 'Materia ' + id, type: 'materiale', uom: 'kg', unitCost, active: true };
}
function acq(id, purchasePrice) {
  return { id, code: id.toUpperCase(), name: 'Commerciale ' + id, type: 'acquistato', uom: 'pz', purchasePrice, active: true };
}
// Di default prodotta in casa: è il caso che esercita il rollup del ciclo.
// Le prove sull'acquisto passano `sourcing: 'buy'` esplicitamente.
function parte(id, o) {
  return Object.assign({ id, code: id.toUpperCase(), name: 'Parte ' + id, type: 'parte', uom: 'pz',
    unitCost: 0, cycle: [], sourcing: 'make', active: true }, o || {});
}
function asm(id, type, o) {
  return Object.assign({ id, code: id.toUpperCase(), name: 'Assieme ' + id, type, uom: 'pz', components: [], operations: [], active: true }, o || {});
}
function comp(itemId, qty, scrapPct) { return { itemId, qty, scrapPct: scrapPct || 0 }; }
function wc(id, hourlyRate) { return { id, name: 'CDL ' + id, hourlyRate, active: true }; }

// ── Un database che tocca tutte le tabelle, con id veri ──
const U = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const T0 = '2026-03-01T08:00:00.000Z';
const st = o => Object.assign({ createdAt: T0, updatedAt: T0 }, o);
function dbCloudCompleto() {
  const [s1, s2, wc1, fam, sub, job, m1, c1, p1, g1, mac, pr1, pr2, rfq, rl1, rl2, ord, ol1, plan, pll,
    odp, ph1, ph2, mt1, odl, wl1, dec, mv1, mv2, rc1, prd, rev, adoc, att, rem, trash, cust, wcs, usr, cn] =
    Array.from({ length: 40 }, (_, i) => U(i + 1));
  return makeDb({
    users: [st({ id: usr, name: 'Anna', username: 'anna', email: 'a@x.it', role: 'admin', color: '#3A7BE8', active: true, passwordHash: 'h', passwordSalt: 's' })],
    suppliers: [st({ id: s1, name: 'SKF', referente: '', email: '', phone: '', vat: '', street: '', streetNumber: '', zip: '', city: '', province: '', country: '', defaultTransport: '', defaultPayment: '', active: true }),
      st({ id: s2, name: 'Beta lavorazioni', active: true })],
    customers: [st({ id: cust, name: 'Rossi', referente: '', email: '', phone: '', vat: '', notes: '', active: true })],
    workCenters: [st({ id: wc1, name: 'Tornitura', hourlyRate: 40, capacityHours: 38, active: true,
      suppliers: [st({ id: wcs, supplierId: s2, rate: 55, note: '' })] })],
    families: [st({ id: fam, name: 'Acciaio', kind: 'materiale', sigla: 'ACC', subs: [st({ id: sub, name: 'Barre', sigla: 'BAR' })] })],
    jobs: [st({ id: job, number: 'COM-2026-001', customer: 'Rossi', title: 'Linea', customerRef: '', status: 'aperta', date: '2026-03-01', dueDate: '2026-06-30', notes: '', active: true })],
    items: [
      st({ id: m1, code: 'MAT-ACC-BAR-001', name: 'Barra', type: 'materiale', uom: 'kg', unitCost: 4.5, familyId: fam, subFamilyId: sub, notes: '', active: true,
        activePriceId: pr1, priceListSeeded: true, altUom: 'm', altFactor: 2.5, conceptId: 'cn-albero',
        priceList: [st({ id: pr1, supplierId: s1, price: 4.5, minQty: '', leadDays: 10, code: 'B1', desc: 'Barra', date: '2026-02-01', rfqId: rfq, lineId: rl1, note: '', priceUom: 'kg' }),
          st({ id: pr2, supplierId: null, price: 4.8, minQty: 100, leadDays: '', code: '', desc: '', date: '2026-01-01', rfqId: null, note: '' })] }),
      st({ id: c1, code: 'CMM-001', name: 'Cuscinetto', type: 'acquistato', uom: 'pz', purchasePrice: 12, supplierId: s1, familyId: '', subFamilyId: '', notes: '', active: true, favorite: true, priceList: [] }),
      st({ id: p1, code: 'PRT-001', name: 'Albero', type: 'parte', uom: 'pz', unitCost: 0, sourcing: 'make', active: true, lotSize: 10, lotMode: 'min', safetyStock: 5, priceList: [],
        cycle: [{ kind: 'item', itemId: m1, qty: 1.2, costOverride: null },
          { kind: 'op', workCenterId: wc1, supplierId: null, costMode: 'orario', cost: 0, hours: 0.5, days: 0, rate: 40, note: 'tornitura' },
          { kind: 'op', workCenterId: wc1, supplierId: s2, costMode: 'fisso', cost: 3, hours: 0, days: 4, rate: 0, note: 'tempra' }] }),
      st({ id: g1, code: 'GRP-001', name: 'Gruppo', type: 'gruppo', uom: 'pz', active: true, machineItemId: mac, groupItemId: '',
        components: [{ itemId: p1, qty: 2, scrapPct: 0 }, { itemId: c1, qty: 4, scrapPct: 2 }], operations: [{ workCenterId: wc1, hours: 1, note: 'montaggio' }] }),
      st({ id: mac, code: 'NT-1', name: 'Macchina', type: 'macchina', uom: 'pz', active: true, rev: 'B',
        components: [{ itemId: g1, qty: 1, scrapPct: 0 }], operations: [] }),
    ],
    plans: [st({ id: plan, number: 'FAB-2026-001', title: 'Lotto', date: '2026-03-01', dueDate: '2026-05-01', notes: '', jobId: job, active: true,
      lines: [st({ id: pll, itemId: mac, qty: 2, dueDate: '' })] })],
    rfqs: [st({ id: rfq, number: 'RDO-2026-001', title: '', date: '2026-02-01', status: 'ricevuta', supplierId: s1, transport: '', payment: '', planId: plan, jobId: job, notes: '', notesInternal: '', active: true,
      lines: [st({ id: rl1, itemId: m1, code: 'MAT-ACC-BAR-001', description: 'Barra', uom: 'kg', qty: 100, price: 4.5, deliveryDate: '', note: '', phaseKey: null, phaseKeys: null }),
        st({ id: rl2, itemId: null, code: 'PRT-001', description: 'Tempra', uom: 'pz', qty: 10, price: '', deliveryDate: '2026-04-01', note: '', phaseKey: p1 + '#1#' + wc1, phaseKeys: p1 + '#1#' + wc1 })] })],
    orders: [st({ id: ord, number: 'ODA-2026-001', title: '', date: '2026-02-05', status: 'parziale', supplierId: s1, transport: '', payment: '', rfqId: rfq, planId: plan, jobId: job, supplierConfirmation: 'OC-1', notes: '', notesInternal: '', active: true,
      lines: [st({ id: ol1, itemId: m1, code: 'MAT-ACC-BAR-001', description: 'Barra', uom: 'kg', qty: 100, price: 4.5, deliveryDate: '2026-03-01', confirmedDate: '2026-03-03', received: 40, note: '', phaseKey: null, phaseKeys: null })] })],
    prodOrders: [st({ id: odp, number: 'ODP-2026-001', itemId: p1, code: 'PRT-001', name: 'Albero', uom: 'pz', qty: 10, date: '2026-03-02', dueDate: '2026-04-15', status: 'corso', title: '', notes: '', notesInternal: '', planId: plan, jobId: job, active: true,
      phases: [st({ id: ph1, seq: 10, opIndex: 0, phaseKey: p1 + '#0#' + wc1, workCenterId: wc1, wcName: 'Tornitura', supplierId: null, supplierName: '', runFrom: 0, runTo: 0, passata: 0, costMode: 'orario', hours: 0.5, days: 0, rate: 40, cost: 0, note: '' }),
        st({ id: ph2, seq: 20, opIndex: 1, phaseKey: p1 + '#1#' + wc1, workCenterId: wc1, wcName: 'Tornitura', supplierId: s2, supplierName: 'Beta lavorazioni', runFrom: 1, runTo: 1, passata: 1, costMode: 'fisso', hours: 0, days: 4, rate: 0, cost: 3, note: '' })],
      materials: [st({ id: mt1, itemId: m1, code: 'MAT-ACC-BAR-001', name: 'Barra', uom: 'kg', perPezzo: 1.2, qty: 12 })] })],
    workOrders: [st({ id: odl, number: 'ODL-2026-001', title: '', date: '2026-03-05', status: 'inviato', supplierId: s2, transport: '', payment: '', rfqId: null, planId: plan, jobId: job, odpId: odp, supplierConfirmation: '', notes: '', notesInternal: '', active: true,
      lines: [st({ id: wl1, itemId: null, code: 'PRT-001', description: 'Tempra', uom: 'pz', qty: 10, price: 3, deliveryDate: '2026-03-12', confirmedDate: '', received: 0, note: '', phaseKey: p1 + '#1#' + wc1, phaseKeys: p1 + '#1#' + wc1, odpId: odp, odpPhaseId: ph2 })] })],
    prodDecls: [st({ id: dec, odpId: odp, phaseId: ph1, kind: 'avvio', date: '2026-03-02T09:00:00.000Z', qty: 0, scrap: 0, note: '', motivo: '' })],
    movements: [st({ id: mv1, itemId: m1, kind: 'scarico', qty: -12, date: '2026-03-02T09:00:00.000Z', note: '', supplierId: null, fromSupplierId: null, orderId: odp, lineId: ph1, declId: dec }),
      st({ id: mv2, itemId: p1, kind: 'clStep', qty: 10, date: '2026-03-05T09:00:00.000Z', note: '', supplierId: s2, fromSupplierId: null, orderId: odl, lineId: wl1, declId: null })],
    receipts: [st({ id: rc1, coll: 'orders', orderId: ord, lineId: ol1, qty: 40, kind: 'ricevimento', date: '2026-03-03', note: '' })],
    productions: [st({ id: prd, planId: plan, itemId: mac, qty: 1, date: '2026-03-10T15:00:00.000Z', note: '' })],
    revisions: [st({ id: rev, itemId: mac, rev: 'A', date: '2026-02-20T10:00:00.000Z', motivo: 'prima emissione', snapshot: { components: [{ itemId: g1, qty: 1 }], cost: 123.4 } })],
    attachmentDocs: [st({ id: adoc, path: 'cataloghi/skf.pdf', description: 'Catalogo SKF' })],
    attachments: [st({ id: att, itemId: c1, docId: adoc, page: 12 })],
    reminders: [st({ id: rem, date: '2026-03-20', title: 'Sollecitare SKF', notes: '', gravita: 'media', done: false, jobId: job, active: true })],
    trash: [{ id: trash, coll: 'suppliers', deletedAt: T0, deletedBy: usr, record: { id: U(99), name: 'Vecchio' } }],
  });
}

module.exports = { makeDb, mat, acq, parte, asm, comp, wc, dbCloudCompleto, U, T0 };
