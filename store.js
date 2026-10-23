// ═══════════════════════════════════════════════════════════
//  BOMTRACK — STORE (dati, migrazioni, persistenza)
//  Caricato prima degli script dell'app. Nessun codice di rete: l'adapter
//  attuale è localStorage; il contratto per un futuro adapter
//  cloud (Supabase/Cloudflare D1) è documentato in
//  docs/cloud-schema.md.
// ═══════════════════════════════════════════════════════════

const DB_KEY = 'bomtrack_v1';       // non rinominare: la versione vive dentro il blob
// Dove finisce un blob che non si riesce più a leggere. Un JSON troncato —
// scrittura interrotta, spazio finito a metà, chiavetta sfilata — è quasi tutto
// ancora lì, e un recupero a mano ne salva la maggior parte. Fino alla 0.59 si
// ripartiva dai dati demo e li si salvava sopra: l'unica copia rimasta spariva
// prima che qualcuno potesse guardarla.
const DB_KEY_RESCUE = 'bomtrack_v1_illeggibile';
// Il contatore di revisione dell'archivio. Sta in una chiave **sua**, minuscola,
// e non dentro il blob: si legge prima di ogni salvataggio, e rileggere e
// analizzare qualche megabyte di JSON a ogni scrittura costerebbe molto più del
// salvataggio stesso.
const DB_KEY_REV = 'bomtrack_v1_rev';
const SCHEMA_VERSION = 2;           // v1 = id interi legacy (implicita), v2 = uuid + timestamp
const TRASH_DAYS = 30;              // per quanto un'eliminazione resta recuperabile

const defaultDB = {
  suppliers: [
    { id: 's1', name: 'Bonfiglioli', referente: '', email: '', active: true },
    { id: 's2', name: 'SKF', referente: '', email: '', active: true },
    { id: 's3', name: 'Würth', referente: '', email: '', active: true },
  ],
  // Clienti: l'anagrafica a monte delle commesse. Nessun seed — un cliente
  // inventato in un database vuoto è un cliente che qualcuno prima o poi
  // fattura.
  customers: [],
  rfqs: [],
  orders: [],       // ordini d'acquisto (ODA): merce
  workOrders: [],   // ordini di lavoro (ODL): lavorazioni affidate a un terzista
  plans: [],        // piani di produzione (fabbisogno materiali)
  prodOrders: [],   // ordini di produzione (ODP): la successione delle fasi di una parte
  prodDecls: [],    // dichiarazioni di avanzamento: eventi, non stato (vedi SCHEMA)
  // `suppliers` (opzionale, assente sui centri esistenti finché non se ne
  // registra uno): fornitori conto lavoro abituali per quel centro, ciascuno
  // con la propria tariffa — { id, supplierId, rate, note }. Vedi wcRateFor
  // in costing.js e wcSupplierOptions in views-catalog.js.
  workCenters: [
    { id: 'w1', name: 'Taglio laser', hourlyRate: 45, active: true },
    { id: 'w2', name: 'Saldatura', hourlyRate: 38, active: true },
    { id: 'w3', name: 'Tornitura', hourlyRate: 42, active: true },
    { id: 'w4', name: 'Montaggio', hourlyRate: 30, active: true },
  ],
  families: [
    { id: 'f1', name: 'Meccanico', subs: [
      { id: 'f1s1', name: 'Riduttori' }, { id: 'f1s2', name: 'Cuscinetti' }, { id: 'f1s3', name: 'Viteria' },
      { id: 'f1s4', name: 'Cinghie e pulegge' }, { id: 'f1s5', name: 'Guide lineari' } ] },
    { id: 'f2', name: 'Pneumatico', subs: [
      { id: 'f2s1', name: 'Cilindri' }, { id: 'f2s2', name: 'Valvole' }, { id: 'f2s3', name: 'Raccordi' }, { id: 'f2s4', name: 'Gruppi FRL' } ] },
    { id: 'f3', name: 'Oleodinamico', subs: [
      { id: 'f3s1', name: 'Pompe' }, { id: 'f3s2', name: 'Cilindri' }, { id: 'f3s3', name: 'Valvole' }, { id: 'f3s4', name: 'Tubi e raccordi' } ] },
    { id: 'f4', name: 'Elettrico', subs: [
      { id: 'f4s1', name: 'Motori' }, { id: 'f4s2', name: 'Cavi' }, { id: 'f4s3', name: 'Interruttori' }, { id: 'f4s4', name: 'Quadri' } ] },
    { id: 'f5', name: 'Elettronico', subs: [
      { id: 'f5s1', name: 'Sensori' }, { id: 'f5s2', name: 'PLC' }, { id: 'f5s3', name: 'Schede' }, { id: 'f5s4', name: 'Encoder' } ] },
    // Famiglie materie prime
    { id: 'fm1', name: 'Acciaio', kind: 'materiale', subs: [
      { id: 'fm1s1', name: 'Lamiere' }, { id: 'fm1s2', name: 'Profilati' }, { id: 'fm1s3', name: 'Tubi' }, { id: 'fm1s4', name: 'Barre' }, { id: 'fm1s5', name: 'Tondi' } ] },
    { id: 'fm2', name: 'Alluminio', kind: 'materiale', subs: [
      { id: 'fm2s1', name: 'Lamiere' }, { id: 'fm2s2', name: 'Profilati' }, { id: 'fm2s3', name: 'Barre' }, { id: 'fm2s4', name: 'Tubi' } ] },
    { id: 'fm3', name: 'Acciaio inox', kind: 'materiale', subs: [
      { id: 'fm3s1', name: 'Lamiere' }, { id: 'fm3s2', name: 'Tubi' }, { id: 'fm3s3', name: 'Barre' }, { id: 'fm3s4', name: 'Profilati' } ] },
    { id: 'fm4', name: 'Ottone e rame', kind: 'materiale', subs: [
      { id: 'fm4s1', name: 'Barre' }, { id: 'fm4s2', name: 'Tubi' }, { id: 'fm4s3', name: 'Lamiere' } ] },
    { id: 'fm5', name: 'Ghisa', kind: 'materiale', subs: [
      { id: 'fm5s1', name: 'Barre' }, { id: 'fm5s2', name: 'Getti' } ] },
    { id: 'fm6', name: 'Materie plastiche', kind: 'materiale', subs: [
      { id: 'fm6s1', name: 'Nylon (PA)' }, { id: 'fm6s2', name: 'POM (Delrin)' }, { id: 'fm6s3', name: 'PTFE' }, { id: 'fm6s4', name: 'PVC' }, { id: 'fm6s5', name: 'Plexiglass (PMMA)' } ] },
    { id: 'fm7', name: 'Gomma e guarnizioni', kind: 'materiale', subs: [
      { id: 'fm7s1', name: 'Lastre' }, { id: 'fm7s2', name: 'O-ring' }, { id: 'fm7s3', name: 'Profili' } ] },
    // Famiglie parti (lavorati interni)
    { id: 'fp1', name: 'Lavorazioni meccaniche', kind: 'parte', subs: [
      { id: 'fp1s1', name: 'Tornitura' }, { id: 'fp1s2', name: 'Fresatura' }, { id: 'fp1s3', name: 'Taglio laser' }, { id: 'fp1s4', name: 'Piegatura' }, { id: 'fp1s5', name: 'Saldatura' } ] },
    { id: 'fp2', name: 'Carpenteria', kind: 'parte', subs: [
      { id: 'fp2s1', name: 'Telai' }, { id: 'fp2s2', name: 'Fiancate' }, { id: 'fp2s3', name: 'Staffe' } ] },
  ],
  items: [
    // Materie prime
    { id: 'm1', code: 'MAT-001', name: 'Lamiera acciaio S235', type: 'materiale', uom: 'kg', unitCost: 1.20, notes: '', active: true },
    { id: 'm2', code: 'MAT-002', name: 'Profilato alluminio', type: 'materiale', uom: 'kg', unitCost: 4.50, notes: '', active: true },
    // Commerciali
    { id: 'a1', code: 'CMM-001', name: 'Motoriduttore 1.5 kW', type: 'acquistato', uom: 'pz', supplierId: 's1', purchasePrice: 320, familyId: 'f1', subFamilyId: 'f1s1', notes: '', active: true },
    { id: 'a2', code: 'CMM-002', name: 'Cuscinetto SKF 6204', type: 'acquistato', uom: 'pz', supplierId: 's2', purchasePrice: 12.5, familyId: 'f1', subFamilyId: 'f1s2', notes: '', active: true },
    { id: 'a3', code: 'CMM-003', name: 'Kit viteria M8', type: 'acquistato', uom: 'pz', supplierId: 's3', purchasePrice: 8, familyId: 'f1', subFamilyId: 'f1s3', notes: '', active: true },
    // Parti (foglie a costo diretto)
    { id: 'pt1', code: 'PRT-001', name: 'Fiancata lavorata', type: 'parte', uom: 'pz', unitCost: 45, familyId: 'fp2', subFamilyId: 'fp2s2', notes: '', active: true },
    { id: 'pt2', code: 'PRT-002', name: 'Albero tornito', type: 'parte', uom: 'pz', unitCost: 60, familyId: 'fp1', subFamilyId: 'fp1s1', notes: '', active: true },
    // Sottogruppo
    {
      id: 'sg1', code: 'SGR-001', name: 'Gruppo motore', type: 'sottogruppo', uom: 'pz',
      notes: '', active: true,
      components: [
        { itemId: 'a1', qty: 1, scrapPct: 0 },
        { itemId: 'a2', qty: 2, scrapPct: 0 },
      ],
      operations: [
        { workCenterId: 'w4', hours: 1, note: 'Montaggio motore' },
      ],
    },
    // Gruppi
    {
      id: 'g1', code: 'GRP-001', name: 'Gruppo telaio', type: 'gruppo', uom: 'pz',
      notes: '', active: true,
      components: [
        { itemId: 'pt1', qty: 2, scrapPct: 0 },
        { itemId: 'm1', qty: 25, scrapPct: 5 },
        { itemId: 'a3', qty: 1, scrapPct: 0 },
      ],
      operations: [
        { workCenterId: 'w1', hours: 1.5, note: 'Taglio lamiere' },
        { workCenterId: 'w2', hours: 2, note: 'Saldatura struttura' },
      ],
    },
    {
      id: 'g2', code: 'GRP-002', name: 'Gruppo trasmissione', type: 'gruppo', uom: 'pz',
      notes: '', active: true,
      components: [
        { itemId: 'sg1', qty: 1, scrapPct: 0 },
        { itemId: 'pt2', qty: 1, scrapPct: 0 },
        { itemId: 'm2', qty: 8, scrapPct: 3 },
      ],
      operations: [
        { workCenterId: 'w4', hours: 1.5, note: 'Montaggio trasmissione' },
      ],
    },
    // Macchina (top-level)
    {
      id: 'mac1', code: 'NT-100', name: 'Nastro Trasportatore NT-100', type: 'macchina', uom: 'pz',
      notes: 'Macchina esempio', active: true,
      components: [
        { itemId: 'g1', qty: 1, scrapPct: 0 },
        { itemId: 'g2', qty: 1, scrapPct: 0 },
      ],
      operations: [
        { workCenterId: 'w4', hours: 3, note: 'Montaggio finale' },
      ],
    },
  ],
  settings: { overheadPct: 12, marginPct: 20, currency: '€', codeDigits: 3, codePrefixAcquistato: 'CMM', codePrefixMateriale: 'MAT', codePrefixParte: 'PRT' },
};

// Unità di misura predefinite (codice = quello stampato sui documenti)
const DEFAULT_UOMS = [
  { code: 'pz', name: 'Pezzi' },
  { code: 'n', name: 'Numero' },
  { code: 'set', name: 'Set / kit' },
  { code: 'conf', name: 'Confezione' },
  { code: 'kg', name: 'Chilogrammi' },
  { code: 'g', name: 'Grammi' },
  { code: 't', name: 'Tonnellate' },
  { code: 'm', name: 'Metri' },
  { code: 'mm', name: 'Millimetri' },
  { code: 'm2', name: 'Metri quadri' },
  { code: 'm3', name: 'Metri cubi' },
  { code: 'l', name: 'Litri' },
  { code: 'h', name: 'Ore' },
];

// Concetti predefiniti: la parte "standardizzata" del nome di una parte
// (l'oggetto), completata poi da una descrizione libera. Gestiti come le U.M.
// in Gestione → Concetti. Id fissi: il seed è una-tantum e idempotente.
const DEFAULT_CONCEPTS = [
  { id: 'cn-albero', name: 'ALBERO' },
  { id: 'cn-flangia', name: 'FLANGIA' },
  { id: 'cn-staffa', name: 'STAFFA' },
  { id: 'cn-piastra', name: 'PIASTRA' },
  { id: 'cn-distanziale', name: 'DISTANZIALE' },
  { id: 'cn-perno', name: 'PERNO' },
  { id: 'cn-boccola', name: 'BOCCOLA' },
  { id: 'cn-coperchio', name: 'COPERCHIO' },
  { id: 'cn-supporto', name: 'SUPPORTO' },
  { id: 'cn-ghiera', name: 'GHIERA' },
];

let db;

// ── Utenti: password e hashing ──────────────────────────────
// SHA-256 in JS puro invece di crypto.subtle: quello è asincrono e vive solo in
// secure context, mentre l'app si apre anche con doppio click su file:// (stesso
// motivo del fallback di newId()).
// ATTENZIONE: con i dati in localStorage questo non è sicurezza — chi apre i
// DevTools legge tutto. È un separatore di ruoli tra colleghi, in attesa che
// l'autenticazione vera passi a Supabase Auth (vedi docs/cloud-schema.md).
function sha256Hex(str) {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  // UTF-8 → byte. Era `unescape(encodeURIComponent(...))`: stesso risultato, ma
  // unescape è deprecato ed encodeURIComponent lancia sui surrogati spaiati.
  // TextEncoder produce esattamente gli stessi byte, quindi gli hash già in
  // archivio restano validi e nessuno deve rifare la password.
  const bytes = Array.from(new TextEncoder().encode(String(str)));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push((bitLen / 2 ** (8 * i)) & 0xff);

  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  const w = new Uint32Array(64);
  for (let pos = 0; pos < bytes.length; pos += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = (bytes[pos + 4 * i] << 24) | (bytes[pos + 4 * i + 1] << 16) | (bytes[pos + 4 * i + 2] << 8) | bytes[pos + 4 * i + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((v, i) => { H[i] = (H[i] + v) >>> 0; });
  }
  return H.map(x => x.toString(16).padStart(8, '0')).join('');
}
function newSalt() { return newId().replace(/-/g, ''); }
function hashPassword(password, salt) { return sha256Hex(salt + ':' + password); }

// Ruoli: chi può scrivere cosa è deciso in core.js, qui resta solo l'elenco valido
const USER_ROLES = ['admin', 'acquisti', 'progettazione', 'officina', 'lettore'];

// ── ID e timestamp ──────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function newId() {
  const c = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  // Fallback per contesti senza randomUUID (browser datati su file://). La
  // guardia stava su `crypto` e su randomUUID insieme, ma poi il fallback
  // usava `crypto` scoperto: proprio dove l'oggetto può mancare del tutto —
  // che è il contesto per cui il fallback esiste — si prendeva un
  // ReferenceError invece del ripiego.
  if (c && c.getRandomValues) {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  // Ultimo ripiego, senza sorgente crittografica: gli id devono solo essere
  // distinti fra loro, non imprevedibili — non aprono niente e non firmano niente.
  const r = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${r()}${r()}-${r()}-4${r().slice(1)}-${((8 + Math.floor(Math.random() * 4)).toString(16)) + r().slice(1)}-${r()}${r()}${r()}`;
}
function gid() { return newId(); }
// Un id che nasce da una chiave, uguale su ogni PC: due colleghi che fanno lo
// stesso gesto prima di essersi visti scrivono lo stesso record, non due.
// Forma di un uuid v4, perché le colonne sul server sono di quel tipo.
function idDaChiave(chiave) {
  const testo = String(chiave);
  let h = '';
  [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b].forEach(seme => {
    let x = seme >>> 0;
    for (let i = 0; i < testo.length; i++) { x ^= testo.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; }
    h += x.toString(16).padStart(8, '0');
  });
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${'89ab'[parseInt(h[16], 16) & 3]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
// Lo stesso, ma se quell'id è già stato usato qui (il gesto rifatto dopo averlo
// annullato) se ne prende uno nuovo: due record con lo stesso id non devono
// esistere, nemmeno uno vivo e uno nel cestino.
function idDaChiaveLibero(chiave, coll) {
  const id = idDaChiave(chiave);
  const usato = (db[coll] || []).some(r => r.id === id) || (db.trash || []).some(t => t.record && t.record.id === id);
  return usato ? gid() : id;
}
function nowISO() { return new Date().toISOString(); }
// Autore delle modifiche: impostato al login (Store.setActor), finisce in
// createdBy/updatedBy di ogni record → created_by/updated_by in cloud.
let actorId = null;
let lastTrashId = null;   // ultima voce di cestino creata (per l'annulla immediato)
let rifiuto = '';          // perché l'ultimo ripristino non è andato (vedi restore)
// Il campo che numera ogni collezione: un documento ha il suo numero, una
// modifica tecnica il suo MT, un articolo il codice (che non guarda maiuscole
// e spazi, come itemCodeKey).
const NUMERO_DI = { rfqs: 'number', orders: 'number', workOrders: 'number', prodOrders: 'number',
  plans: 'number', jobs: 'number', revisions: 'ecoNumber', items: 'code' };
function numeroGiaDato(coll, rec) {
  const campo = NUMERO_DI[coll];
  const chiave = v => String(v == null ? '' : v).trim().toLowerCase();
  const mio = rec && chiave(rec[campo]);
  if (!campo || !mio) return '';
  const altro = (db[coll] || []).find(r => r.id !== rec.id && chiave(r[campo]) === mio);
  if (!altro) return '';
  return coll === 'items'
    ? `Il codice ${rec[campo]} è stato dato a un altro articolo dopo l'eliminazione: ripristinarlo darebbe due articoli con lo stesso codice. Resta nel cestino.`
    : `Il numero ${rec[campo]} è stato dato a un altro documento dopo l'eliminazione: ripristinarlo darebbe due documenti con lo stesso numero. Resta nel cestino.`;
}
// L'istante di una modifica: adesso, ma sempre **dopo** quello che il record
// aveva. Due scritture nello stesso millisecondo producevano la stessa data, e
// per la sincronizzazione — che riconosce una modifica dal cambio di
// `updatedAt` e decide chi vince confrontandolo — la seconda non esisteva.
// Succedeva davvero: un test di rinomina falliva una volta su otto.
function istanteDopo(prec) {
  const ora = Date.now();
  const p = prec ? Date.parse(prec) : NaN;
  return new Date(Number.isFinite(p) && p >= ora ? p + 1 : ora).toISOString();
}
function stampNew(rec) {
  const t = istanteDopo(rec.updatedAt);
  if (!rec.createdAt) rec.createdAt = t;
  rec.updatedAt = t;
  if (actorId) { if (!rec.createdBy) rec.createdBy = actorId; rec.updatedBy = actorId; }
  return rec;
}
function touch(rec) {
  if (!rec) return rec;
  rec.updatedAt = istanteDopo(rec.updatedAt);
  if (actorId) rec.updatedBy = actorId;
  return rec;
}

// ── Registro dello schema ───────────────────────────────────
// Le nove collezioni radice, i loro array annidati e come ciascuno va trattato
// quando i dati saranno condivisi. Finora questi nomi erano cablati in sei
// punti diversi (migrazioni, validazione, azzeramento, backup…) e ogni aggiunta
// ne dimenticava qualcuno: qui stanno una volta sola e chi deve percorrere il
// database li legge da qui.
//
// `merge` è la decisione che conta, e non può essere la stessa per tutti:
//
//   'row'     — righe con identità propria, dove l'aggiunta concorrente è lo
//               scenario normale, non un conflitto. Due colleghi che
//               registrano una quotazione sullo stesso articolo hanno due id
//               diversi: sopravvivono entrambe, nessuno perde niente.
//
//   'replace' — l'array *è* la definizione dell'oggetto. Metà distinta di uno e
//               metà dell'altro è una distinta che nessuno dei due ha
//               progettato, e un ciclo di lavorazione mezzo e mezzo è un costo
//               sbagliato che nessuno verifica. Qui l'ultimo che salva
//               sostituisce l'insieme intero e l'altro viene avvisato.
//               Queste righe, per giunta, non hanno un id proprio: l'identità
//               per fare il merge riga per riga non esisterebbe nemmeno.
//
// `table` è il nome che la collezione avrà nel database condiviso
// (docs/cloud-schema.md). Serve all'adapter, non serve all'app.
const SCHEMA = {
  items: {
    table: 'items',
    children: {
      components: { table: 'item_components', rowId: null, merge: 'replace' },
      operations: { table: 'item_operations', rowId: null, merge: 'replace' },
      cycle: { table: 'item_cycle_rows', rowId: null, merge: 'replace' },
      priceList: { table: 'item_prices', rowId: 'id', merge: 'row' },
    },
  },
  // Le revisioni rilasciate sono fotografie congelate: `snapshot` resta un
  // oggetto unico e non si esplode in tabelle figlie. Non è pigrizia — una
  // revisione non va mai fusa con niente, e normalizzarla significherebbe darle
  // la stessa forma dei dati vivi, cioè invitare qualcuno a modificarla.
  revisions: { table: 'item_revisions' },
  // Movimenti di magazzino: rettifiche, consumi e conto lavoro. I **carichi da
  // ordine non stanno qui** — quelli li racconta già `received` sulla riga
  // d'ordine, e scriverli in due posti significherebbe tenerli d'accordo a mano.
  //
  // L'eccezione apparente sono i due movimenti di conto lavoro, che portano un
  // `orderId`: la regola regge lo stesso, perché la riga d'ordine che li
  // giustifica **non ha un articolo** e quindi non carica niente da sé. Lì il
  // movimento non duplica il ricevimento: è l'unica scrittura che muove il
  // magazzino, e l'ordine dice solo da dove viene.
  movements: { table: 'stock_movements' },
  // Ricevimenti delle righe d'ordine e di ordine di lavoro: **eventi**, come i
  // movimenti. Fino alla 0.80 il ricevuto era un numero scritto sulla riga e
  // riscritto a ogni ricevimento: in cloud due magazzinieri che registrano un
  // arrivo sulla stessa riga si sarebbero sovrascritti, e un carico sarebbe
  // sparito dalla giacenza senza un avviso. Due eventi invece si sommano.
  // `received` resta sulla riga come **lettura**, ricavata da qui
  // (riallineaRicevuti), e non si invia: vedi `derived`.
  receipts: { table: 'order_receipts' },
  // Allegati: **solo i dati**. I byte dei file stanno in IndexedDB (allegati.js)
  // e non passano né da qui né dal backup JSON — un disegno pesa più di tutto il
  // database, e localStorage non li reggerebbe. Il record dice che il file
  // esiste, come si chiama e a chi appartiene: ripristinando un backup su un
  // altro PC l'elenco c'è e i file no, il che è preferibile a non sapere
  // nemmeno che cosa manca.
  attachments: { table: 'attachments' },
  // I documenti dell'archivio esterno: non i byte e nemmeno l'elenco di ciò che
  // l'app custodisce, ma **dove sta un PDF dentro la cartella d'archivio** —
  // quella che ogni PC configura per sé (archivio.js). Qui il backup JSON è
  // completo davvero: un percorso relativo è un dato, e ripristinandolo su un
  // altro PC il collegamento continua a valere purché quella macchina abbia la
  // sua copia dell'archivio.
  //
  // È una collezione a sé e non un campo su `attachments` perché **lo stesso
  // documento vale per più codici**: il catalogo di un commerciale sta appeso a
  // tutti gli articoli di quella serie. Con un record per articolo lo stesso
  // percorso sarebbe scritto quaranta volte, e il giorno in cui quel file viene
  // rinominato ci sarebbero quaranta righe da correggere a mano, sperando di
  // trovarle tutte. Così se ne corregge una.
  attachmentDocs: { table: 'attachment_docs' },
  // I documenti emessi (documenti.js): la copia PDF di una richiesta, di un
  // ordine o di un ordine di lavoro così come è partita, scritta nella stessa
  // cartella d'archivio. Come per `attachmentDocs` qui sta solo **dove** si
  // trova il file, più ciò che serve a ritrovarlo e a fidarsene: a quale
  // documento appartiene (`kind` + `refId`), la revisione (`seq`), l'impronta
  // (`sha256`) e l'invio (`sentAt`, `sentVia`, `sentTo`). Un record per file,
  // mai riscritto: una copia emessa è una prova, e una prova non si corregge.
  generatedDocs: { table: 'generated_docs' },
  // Avanzamento di produzione: una dichiarazione per volta, mai un saldo
  // riscritto. Stessa scelta dei movimenti di magazzino — la giacenza non è un
  // campo — e per la stessa ragione: un totale che si ricostruisce si può
  // spiegare, e correggere senza riscrivere il passato.
  productions: { table: 'productions' },
  suppliers: { table: 'suppliers' },
  // Clienti: anagrafica autonoma, come i fornitori. La commessa ne cita il
  // nome, non l'id — vedi il commento su `jobs`.
  customers: { table: 'customers' },
  // I fornitori di conto lavoro abituali di un centro, ciascuno con la propria
  // tariffa. Fino alla 0.80 non erano dichiarati qui: flattenDB() li lasciava
  // come array dentro la riga del centro, e la rimappatura v1→v2 non ne
  // riscriveva il `supplierId`. Hanno un id proprio, quindi merge per riga.
  workCenters: { table: 'work_centers', children: { suppliers: { table: 'work_center_suppliers', rowId: 'id', merge: 'row' } } },
  families: { table: 'families', children: { subs: { table: 'sub_families', rowId: 'id', merge: 'row' } } },
  rfqs: { table: 'rfqs', children: { lines: { table: 'rfq_lines', rowId: 'id', merge: 'row' } } },
  // `derived`: campi della riga che si leggono e non si scrivono — li ricava lo
  // Store da altre collezioni, e mandarli al backend farebbe vincere la copia
  // di chi ha inviato per ultimo sulla somma degli eventi. flattenDB() li
  // toglie con `stripDerived`.
  orders: { table: 'orders', children: { lines: { table: 'order_lines', rowId: 'id', merge: 'row', derived: ['received'] } } },
  // Ordini di lavoro: la stessa forma degli ordini d'acquisto, e una collezione
  // a sé. Le due cose che si comprano da un fornitore — merce e lavorazioni —
  // hanno numerazione, elenco e stampa distinti perché sono due documenti
  // diversi nella realtà: uno chiede della roba, l'altro manda dei pezzi a
  // lavorare. Tenerli in una tabella sola costringeva ogni conto a filtrare per
  // un campo, ed è il tipo di distinzione che prima o poi qualcuno dimentica.
  workOrders: { table: 'work_orders', children: { lines: { table: 'work_order_lines', rowId: 'id', merge: 'row', derived: ['received'] } } },
  plans: { table: 'production_plans', children: { lines: { table: 'production_plan_lines', rowId: 'id', merge: 'row' } } },
  // ─── Ordini di produzione (ODP) ───
  // Il documento che segue una parte lungo il suo ciclo: le fasi congelate in
  // successione, e il magazzino mosso ai **due estremi veri del ciclo** — esce
  // il materiale alla prima fase, entra il pezzo finito alla chiusura
  // dell'ultima. Fra le fasi non si scrive niente: un movimento nomina una
  // quantità di un **codice**, e in mezzo i pezzi non sono più il materiale e
  // non sono ancora la parte. Dove stanno lo dice l'ODP, non la giacenza.
  //
  // Le fasi hanno un `id` proprio e non un indice: è la differenza con
  // `item_cycle_rows`, dove l'array *è* la definizione e la posizione è
  // l'identità. Qui la fase porta un avanzamento, e un'identità posizionale si
  // sposterebbe sotto i piedi al primo riordino del ciclo.
  prodOrders: { table: 'production_orders', children: {
    phases: { table: 'production_order_phases', rowId: 'id', merge: 'row' },
    materials: { table: 'production_order_materials', rowId: 'id', merge: 'row' },
  } },
  // Le dichiarazioni di avanzamento sono **eventi**, e stanno piatte come i
  // movimenti: l'avanzamento di una fase si calcola da qui, esattamente come
  // l'esistente si calcola da ricevimenti e movimenti. Nessun campo di saldo
  // sulla fase, quindi niente che possa divergere.
  prodDecls: { table: 'production_declarations' },
  // Commesse: il cliente e la data a monte di tutto. Un piano ne cita una, e da
  // lì la citazione scende su richieste e ordini — è la catena che risponde a
  // «cosa abbiamo ordinato per la commessa 240?».
  jobs: { table: 'jobs' },
  // Promemoria del calendario nel Riepilogo: le scadenze che non stanno in
  // nessun documento («sollecitare SKF», «collaudo in officina»). Tutte le altre
  // date il calendario le legge dove sono già, senza copiarle qui.
  reminders: { table: 'reminders' },
  // Il cestino non è dominio: è la rete sotto le eliminazioni. In cloud è una
  // tabella come le altre, con il record conservato in jsonb.
  trash: { table: 'trash' },
  // Gli hash delle password non migrano: le password vere le possiede l'auth
  // del backend. `secret` è l'elenco dei campi che l'adapter deve togliere.
  users: { table: 'profiles', secret: ['passwordHash', 'passwordSalt'] },
};
// ── Riferimenti fra collezioni ──────────────────────────────
// Quali campi puntano a che cosa. Serve alla migrazione v2, che riscrive gli id
// legacy in UUID e deve poterli seguire **tutti**: fino alla 0.59 ne rimappava
// quattro su tredici, e chi apriva l'app con dati v1 si ritrovava ordini senza
// fornitore, righe senza articolo e movimenti di magazzino orfani — già
// salvati, perché la migrazione salva. Elencarli qui, accanto a SCHEMA, è la
// stessa scelta che ha fatto nascere SCHEMA: un posto solo, così una collezione
// aggiunta domani non viene dimenticata come lo sono state queste.
//
// La destinazione ('item', 'supplier', …) non è decorazione. Gli id legacy
// erano prefissati per tipo — s1, w1, f1, f1s1 — ma gli articoli portavano
// numeri nudi, e una mappa unica poteva scambiare l'articolo 3 per il
// fornitore 3. Una mappa per tipo non può sbagliarsi.
//
// Il cestino resta fuori: conserva il record intero com'era, e riscriverne i
// riferimenti significherebbe rimettere le mani dentro una fotografia. Un
// record v1 ripristinato dal cestino esce con gli id di allora — è un caso che
// non si dà (il cestino è nato dopo la v2) e che comunque va risolto guardando,
// non indovinando.
//
// **Due riferimenti che questa mappa non copre**, scritti qui perché non si
// scoprano il giorno in cui servisse una v3:
//   - `plans.jobId`, `rfqs/orders.planId|jobId` e `productions.planId` non ci
//     sono. Oggi è innocuo — commesse, piani e avanzamento sono nati dopo la v2,
//     e nessun blob v1 li contiene.
//   - `rfq_lines/order_lines.phaseKey` **contiene un itemId dentro una stringa**
//     (`itemId#indice#workCenterId`). Una rimappatura non saprebbe seguirlo lì
//     dentro: dovrebbe riscrivere la chiave, non sostituire un campo.
const REFS = {
  items: {
    fields: { supplierId: 'supplier', familyId: 'family', subFamilyId: 'subFamily',
      machineItemId: 'item', groupItemId: 'item' },
    children: {
      components: { itemId: 'item' },
      operations: { workCenterId: 'workCenter' },
      cycle: { itemId: 'item', workCenterId: 'workCenter', supplierId: 'supplier' },
      priceList: { supplierId: 'supplier' },
    },
  },
  revisions: { fields: { itemId: 'item' } },
  workCenters: { children: { suppliers: { supplierId: 'supplier' } } },
  // `orderId` e `lineId` restano fuori: REFS non ha una destinazione 'order',
  // e gli ordini non sono mai stati rimappati. Va scritto, non lasciato muto.
  movements: { fields: { itemId: 'item', supplierId: 'supplier', fromSupplierId: 'supplier' } },
  // `docId` resta fuori, come `orderId` sulle righe di movimento e per la stessa
  // ragione: REFS è la mappa degli id **legacy** da riscrivere nella migrazione
  // v2, e non ha (né avrebbe senso che avesse) una destinazione
  // 'attachmentDoc' — i documenti d'archivio nascono nella 0.78.0, con id UUID
  // dal primo giorno, e nessun database antico ne contiene.
  attachments: { fields: { itemId: 'item' } },
  productions: { fields: { itemId: 'item' } },
  rfqs: { fields: { supplierId: 'supplier' }, children: { lines: { itemId: 'item' } } },
  orders: { fields: { supplierId: 'supplier' }, children: { lines: { itemId: 'item' } } },
  // Le righe di un ODL non hanno un articolo: portano una `phaseKey`, che un
  // itemId ce l'ha dentro ma dentro una stringa — vedi la nota qui sopra.
  workOrders: { fields: { supplierId: 'supplier' }, children: { lines: {} } },
  plans: { children: { lines: { itemId: 'item' } } },
  prodOrders: {
    fields: { itemId: 'item' },
    children: {
      phases: { workCenterId: 'workCenter', supplierId: 'supplier' },
      materials: { itemId: 'item' },
    },
  },
  // `odpId` e `phaseId` restano fuori, come `orderId`/`lineId` sui movimenti:
  // REFS non ha una destinazione 'prodOrder', e le dichiarazioni non sono mai
  // state rimappate. Va scritto, non lasciato muto.
  prodDecls: { fields: {} },
};
// I campi di audit puntano agli utenti, e stanno su **ogni** record e su ogni
// riga figlia con identità propria: per questo non si ripetono in REFS
// collezione per collezione. Servono il giorno della migrazione all'auth del
// backend, dove l'id di un profilo è quello che assegna l'auth e non quello
// scritto qui: tutti i `createdBy` del database vanno riscritti insieme, o
// restano orfani. `remapIds({ user: { vecchio: nuovo } })` lo fa.
const AUDIT_REFS = { createdBy: 'user', updatedBy: 'user', deletedBy: 'user' };
const COLLECTIONS = Object.keys(SCHEMA);
function childrenOf(coll) { return (SCHEMA[coll] && SCHEMA[coll].children) || {}; }

function siglaFromName(name) {
  return String(name || '').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3) || 'XXX';
}
// La prima sigla libera vicina a quella proposta. Serve agli import, dove le
// famiglie si creano da sole e non c'è nessuno a cui chiedere: un file di 500
// articoli non deve fallire per tre lettere in comune — ma chi importa deve
// leggere nel report che è successo, o se ne accorgerebbe dai codici.
//
// Si allunga prima sul nome («Meccanica» → MEC, MECC, MECCA), che resta
// leggibile, e solo dopo si numera. Il tetto è 6 caratteri, quanto il campo
// sigla accetta in Gestione.
const SIGLA_MAX = 6;
function siglaLibera(name, base, prese) {
  const libera = x => x && !prese.has(x);
  const proposta = String(base || '').trim().toUpperCase().slice(0, SIGLA_MAX);
  if (libera(proposta)) return proposta;
  const pulito = String(name || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
  for (let n = 4; n <= SIGLA_MAX; n++) {
    if (pulito.length < n) break;
    if (libera(pulito.slice(0, n))) return pulito.slice(0, n);
  }
  const radice = (proposta || siglaFromName(name));
  for (let n = 2; n < 1000; n++) {
    const suff = String(n);
    const cand = radice.slice(0, SIGLA_MAX - suff.length) + suff;
    if (libera(cand)) return cand;
  }
  return proposta || 'XXX';
}
function isAssembly(t) { return t === 'macchina' || t === 'gruppo' || t === 'sottogruppo'; }

// ── Caricamento e migrazioni ────────────────────────────────
// L'esito dell'ultimo caricamento, per chi deve dirlo all'utente. `null` = tutto
// bene. La segnalazione sta in core.js dietro l'hook onLoadError, come per i
// salvataggi falliti: store.js resta senza codice di interfaccia.
let dbLoadError = null;
// L'archivio illeggibile così com'era, per poterlo scaricare come file, e se
// la copia di soccorso non è riuscita (dalla 0.105.6): in quel caso commit()
// si rifiuta di scrivere, perché scriverebbe sopra l'unica copia.
let _grezzoIlleggibile = null, _senzaCopia = false;
function loadDB() {
  dbLoadError = null;
  _grezzoIlleggibile = null; _senzaCopia = false;
  _childFp = null;   // un database nuovo: il prossimo passaggio fa da riferimento
  let grezzo = null;
  try { grezzo = adapter.read(); }
  catch (e) { dbLoadError = { kind: 'read', err: e }; console.error('Archivio locale non leggibile:', e); }
  // La revisione di partenza: da qui in poi le scritture di questa scheda si
  // misurano su questa. Va letta anche quando il blob non c'è (archivio vuoto).
  try { revVista = adapter.leggiRev ? adapter.leggiRev() : 0; } catch (e) { revVista = 0; }
  if (grezzo) {
    try { db = JSON.parse(grezzo); migrateDB(); markSynced(); storicoFotografa(); return; }
    catch (e) {
      console.error('Dati salvati illeggibili:', e);
      // Tre esiti, non due (dalla 0.105.6): copia fatta adesso, copia già
      // presente da un caricamento precedente, copia **non riuscita**. Prima
      // gli ultimi due erano lo stesso `false`, e quando la copia non ci stava
      // — succede proprio con gli archivi grandi, contro i 5 MB di
      // localStorage — l'avviso diceva che ne esisteva già una. Non era vero,
      // e il primo salvataggio scriveva i dati d'esempio sopra l'unico originale.
      let salvato = false, fallito = false;
      try { salvato = !!(adapter.rescue && adapter.rescue(grezzo)); }
      catch (e2) { fallito = true; console.error('Copia di soccorso non riuscita:', e2); }
      _grezzoIlleggibile = grezzo;
      // Senza copia l'originale sta solo al suo posto: niente salvataggi finché
      // chi usa l'app non se l'è scaricato (Store.scaricatoIlleggibile).
      _senzaCopia = fallito;
      dbLoadError = { kind: 'parse', err: e, bytes: grezzo.length, rescued: salvato, rescueFailed: fallito };
    }
  }
  db = JSON.parse(JSON.stringify(defaultDB));
  migrateDB();
  // Con un archivio illeggibile alle spalle NON si salva: sovrascrivere adesso
  // vorrebbe dire cancellare i dati veri prima che l'utente sappia che ci sono
  // ancora. Il primo salvataggio lo farà lui, dopo aver letto l'avviso.
  if (!dbLoadError) saveDB();
  markSynced();
  storicoFotografa();
  if (dbLoadError && typeof onLoadError === 'function') onLoadError(dbLoadError);
}
// Il calendario di fabbrica di serie: lunedì–venerdì e le festività nazionali
// italiane, ricorrenti. Pasqua e Pasquetta si calcolano (`easter`, vedi
// calendario.js); santo patrono, ferie d'agosto e ponti stanno in `closures`,
// intervalli con una data intera, perché cambiano ogni anno. I giorni dei
// fornitori (`supplierDays`) sono lavorativi di serie dalla 0.110.0; un
// archivio di prima, senza il campo, vale lo stesso.
const CAL_FESTIVI_IT = ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'];
function calDefault() {
  return { workDays: [1, 2, 3, 4, 5], holidays: CAL_FESTIVI_IT.slice(), easter: true, closures: [], supplierDays: 'lavorativi' };
}
// Le copie lasciate da quella semina ripetuta (fino alla 0.105.1): stessa
// quotazione a mano, identica in tutto tranne l'id. Resta quella in uso, se è
// fra le copie, altrimenti la prima. Le quotazioni da una richiesta d'offerta
// non c'entrano: quelle non sono mai state seminate.
function togliQuotazioniDoppie(it) {
  const viste = new Map();
  const via = new Set();
  const chiave = r => JSON.stringify([r.supplierId || null, Number(r.price) || 0, r.priceUom || '',
    r.minQty == null ? '' : String(r.minQty), r.leadDays == null ? '' : String(r.leadDays),
    r.code || '', r.desc || '', r.date || '', r.note || '']);
  it.priceList.forEach(r => {
    if (r.rfqId) return;
    const k = chiave(r);
    const prima = viste.get(k);
    if (!prima) { viste.set(k, r); return; }
    if (r.id === it.activePriceId) { via.add(prima.id); viste.set(k, r); }
    else via.add(r.id);
  });
  if (via.size) it.priceList = it.priceList.filter(r => !via.has(r.id));
}
function migrateDB() {
  // Normalizzazioni legacy (idempotenti, sempre eseguite)
  if (!db.suppliers) db.suppliers = [];
  if (!db.customers) db.customers = [];
  // Allegati: collezione nata nella 0.77.0. Un database salvato prima non ce
  // l'ha, e ogni lettura dovrebbe ricordarsi di difendersi — qui si ricorda una
  // volta sola, come per tutte le altre.
  if (!db.attachments) db.attachments = [];
  // Documenti d'archivio: collezione nata nella 0.78.0. Stessa ragione della
  // riga qui sopra — una collezione dichiarata esiste sempre, così nessuna
  // lettura deve ricordarsi di difendersi.
  if (!db.attachmentDocs) db.attachmentDocs = [];
  // Documenti emessi: collezione nata nella 0.112.0, stessa ragione.
  if (!db.generatedDocs) db.generatedDocs = [];
  if (!db.productions) db.productions = [];
  if (!db.rfqs) db.rfqs = [];
  if (!db.orders) db.orders = [];
  if (!db.plans) db.plans = [];
  if (!db.workCenters) db.workCenters = [];
  if (!db.families) db.families = JSON.parse(JSON.stringify(defaultDB.families));
  // Utenti: 1:1 con la futura tabella `profiles`. Nessun seed e nessuna
  // credenziale predefinita: senza utenti l'app apre il setup del primo admin.
  if (!db.users) db.users = [];
  db.users.forEach(u => {
    if (u.username == null) u.username = '';
    if (u.email == null) u.email = '';
    if (!USER_ROLES.includes(u.role)) u.role = 'lettore';
    if (!u.color) u.color = '#3A7BE8';
    if (u.active == null) u.active = true;
    if (u.passwordHash == null) { u.passwordHash = ''; u.passwordSalt = ''; }
  });
  if (!db.items) db.items = [];
  if (!db.revisions) db.revisions = [];   // storico delle distinte rilasciate
  // Capacità del centro, in ore a settimana. **Zero significa «non dichiarata»**,
  // non «nessuna capacità»: senza questa distinzione ogni centro esistente
  // risulterebbe sovraccarico al primo caricamento, e il prospetto del carico
  // nascerebbe già da ignorare.
  (db.workCenters || []).forEach(w => {
    if (w.capacityHours == null) w.capacityHours = 0;
    // Tempi del centro per la programmazione a ritroso: ore lavorate in un
    // giorno (zero = ricavate dalla capacità settimanale, o 8), giorni di coda
    // prima di ogni fase e ore di attrezzaggio per lotto. Zero su tutti i
    // centri esistenti: senza dati la durata di una fase sono le sue ore.
    if (w.hoursPerDay == null) w.hoursPerDay = 0;
    if (w.queueDays == null) w.queueDays = 0;
    if (w.setupHours == null) w.setupHours = 0;
    // Le righe fornitore sono dichiarate in SCHEMA con identità propria: una
    // senza id non si potrebbe nominare né fondere riga per riga.
    if (Array.isArray(w.suppliers)) w.suppliers.forEach(r => { if (r && !r.id) r.id = newId(); });
  });
  if (!db.workOrders) db.workOrders = [];   // ordini di lavoro (conto lavoro)
  if (!db.movements) db.movements = [];   // rettifiche, consumi e conto lavoro
  // Contorno del conto lavoro: da chi sta la merce e quale ordine la giustifica.
  // Nullo su tutti i movimenti precedenti, e la colonna deve esserci comunque —
  // righe con e senza la stessa colonna sono l'incoerenza che queste
  // normalizzazioni esistono per evitare.
  db.movements.forEach(m => {
    if (m.supplierId === undefined) m.supplierId = null;
    // Sui passaggi di lavorazione (clStep) `supplierId` è **dove va** e questo è
    // **da dove viene**: nullo da una parte o dall'altra significa «da noi».
    if (m.fromSupplierId === undefined) m.fromSupplierId = null;
    if (m.orderId === undefined) m.orderId = null;
    if (m.lineId === undefined) m.lineId = null;
    // Quale dichiarazione di produzione ha generato questo movimento. Serve a
    // poterlo togliere **esattamente** quando quella dichiarazione viene
    // annullata: senza, si dovrebbe indovinare quale dei movimenti della fase
    // apparteneva a quale dichiarazione.
    if (m.declId === undefined) m.declId = null;
  });
  if (!db.jobs) db.jobs = [];             // commesse cliente
  if (!db.reminders) db.reminders = [];   // promemoria del calendario
  // Cestino: le eliminazioni recenti, recuperabili. Si svuota da solo passata
  // la finestra di ripristino, altrimenti crescerebbe finché lo spazio del
  // browser non finisce — e a quel punto il rimedio sarebbe peggio del male.
  // Con l'archivio condiviso lo svuota il server, con la sua ora (dalla
  // 0.106.0): qui ogni PC potava con il proprio orologio e mandava la
  // cancellazione a tutti.
  if (!Array.isArray(db.trash)) db.trash = [];
  else if (!modoCondiviso) {
    const limite = new Date(Date.now() - TRASH_DAYS * 86400000).toISOString();
    db.trash = db.trash.filter(t => t && t.deletedAt && t.deletedAt >= limite);
  }
  if (!db.settings) db.settings = { overheadPct: 0, marginPct: 0, currency: '€' };
  if (db.settings.codeDigits == null) db.settings.codeDigits = 3;
  if (!db.settings.codePrefixAcquistato) db.settings.codePrefixAcquistato = 'CMM';
  if (!db.settings.codePrefixMateriale) db.settings.codePrefixMateriale = 'MAT';
  if (!db.settings.codePrefixParte) db.settings.codePrefixParte = 'PRT';
  // Voci precompilabili per trasporto/pagamento nelle richieste di offerta (+ predefinita)
  if (!db.settings.transportOptions) db.settings.transportOptions = ['Porto franco', 'Porto assegnato', 'EXW', 'FCA', 'DAP', 'CIF'];
  if (!db.settings.paymentOptions) db.settings.paymentOptions = ['Bonifico anticipato', 'Bonifico 30gg', 'Bonifico 60gg', 'RiBa 30gg', 'RiBa 60gg'];
  if (db.settings.transportDefault == null) db.settings.transportDefault = '';
  if (db.settings.paymentDefault == null) db.settings.paymentDefault = '';
  // Approvvigionamento proposto alle nuove parti: 'make' | 'buy'
  if (!db.settings.partSourcingDefault) db.settings.partSourcingDefault = 'buy';
  // Durata della sessione salvata, in giorni (0 = non scade mai). Il `ts` era
  // già scritto al login e non lo leggeva nessuno: una postazione condivisa
  // restava aperta sull'utente di chi l'aveva usata mesi prima.
  if (db.settings.sessionDays == null) db.settings.sessionDays = 30;
  // Calendario di fabbrica (calendario.js) e margine fra un livello di
  // distinta e il suo padre, in giorni lavorativi, per la programmazione a
  // ritroso del fabbisogno.
  if (!db.settings.calendar || !Array.isArray(db.settings.calendar.workDays)) db.settings.calendar = calDefault();
  if (db.settings.scheduleBufferDays == null) db.settings.scheduleBufferDays = 0;
  delete db.settings.partCostModeDefault;   // sostituito da partSourcingDefault
  // Unità di misura gestite: seed una-tantum con le predefinite + quelle già
  // presenti nei dati (finora l'U.M. era testo libero, non va persa).
  if (!Array.isArray(db.settings.uoms)) {
    db.settings.uoms = DEFAULT_UOMS.map(u => ({ ...u }));
    const known = new Set(db.settings.uoms.map(u => u.code));
    const seen = [];
    (db.items || []).forEach(i => seen.push(i.uom));
    (db.rfqs || []).forEach(r => (r.lines || []).forEach(l => seen.push(l.uom)));
    (db.orders || []).forEach(o => (o.lines || []).forEach(l => seen.push(l.uom)));
    seen.forEach(c => {
      const code = String(c || '').trim();
      if (code && !known.has(code)) { known.add(code); db.settings.uoms.push({ code, name: '' }); }
    });
  }
  if (db.settings.uomDefault == null) db.settings.uomDefault = 'pz';
  // Concetti gestiti: seed una-tantum con i predefiniti. Idempotente e non
  // ripristina quelli cancellati (stesso criterio delle U.M.).
  if (!Array.isArray(db.settings.concepts)) {
    db.settings.concepts = DEFAULT_CONCEPTS.map(c => ({ ...c }));
  }
  // I concetti sono sempre in maiuscolo: normalizza anche quelli già salvati
  db.settings.concepts.forEach(c => { c.name = String(c.name || '').toUpperCase(); });
  // Dati dell'azienda utilizzatrice (richiedente), stampati sui documenti RFQ
  if (!db.settings.company) db.settings.company = { name: '', referente: '', email: '', phone: '', vat: '', street: '', streetNumber: '', zip: '', city: '', province: '', country: '' };
  // Indirizzo strutturato (via, civico, CAP, città, provincia, stato); migra il vecchio campo unico
  const ensureAddr = o => {
    if (!o) return;
    if (o.street == null) o.street = o.address || '';
    if (o.streetNumber == null) o.streetNumber = '';
    if (o.zip == null) o.zip = '';
    if (o.city == null) o.city = '';
    if (o.province == null) o.province = '';
    if (o.country == null) o.country = '';
    delete o.address;
  };
  ensureAddr(db.settings.company);
  // Fornitori: campi anagrafici estesi usati nei documenti di richiesta offerta
  (db.suppliers || []).forEach(s => {
    if (s.phone == null) s.phone = '';
    if (s.vat == null) s.vat = '';
    if (s.defaultTransport == null) s.defaultTransport = '';
    if (s.defaultPayment == null) s.defaultPayment = '';
    // Giorni di trasporto verso e dal terzista, andata più ritorno: si sommano
    // all'attraversamento di ogni tratta di conto lavoro affidata a lui.
    if (s.transitDays == null) s.transitDays = 0;
    ensureAddr(s);
  });
  // Clienti: stessa anagrafica dei fornitori, senza le condizioni predefinite
  // (le condizioni le detta chi vende, e qui si compra).
  (db.customers || []).forEach(c => {
    if (c.referente == null) c.referente = '';
    if (c.email == null) c.email = '';
    if (c.phone == null) c.phone = '';
    if (c.vat == null) c.vat = '';
    if (c.notes == null) c.notes = '';
    if (c.active == null) c.active = true;
    ensureAddr(c);
  });
  // RFQ: modello a fornitore singolo + campi riga (prezzo unitario e data consegna)
  (db.rfqs || []).forEach(r => {
    if (r.supplierId == null) r.supplierId = (r.supplierIds && r.supplierIds[0]) || null;
    if (r.transport == null) r.transport = '';
    if (r.payment == null) r.payment = '';
    if (r.notesInternal == null) r.notesInternal = '';
    if (r.planId == null) r.planId = null;   // richiesta nata da un piano di fabbisogno
    if (r.jobId == null) r.jobId = null;    // e la commessa da cui quel piano discende
    (r.lines || []).forEach(l => {
      if (l.price == null) {
        const o = r.offers && r.supplierId && r.offers[r.supplierId];
        l.price = (o && o.lines && o.lines[l.id] != null) ? o.lines[l.id] : '';
      }
      if (l.deliveryDate == null) l.deliveryDate = '';
      if (l.note == null) l.note = '';
      // Riga di conto lavoro: la fase del ciclo da cui viene. Nulla su tutte le
      // altre, e la colonna deve esserci comunque — vedi il commento qui sotto
      // sugli ordini: righe con e senza la stessa colonna sono l'incoerenza che
      // queste normalizzazioni esistono per evitare.
      if (l.phaseKey == null) l.phaseKey = null;
      if (l.phaseKeys == null) l.phaseKeys = l.phaseKey || null;
    });
    delete r.supplierIds; delete r.offers; delete r.awards;
  });
  // Ordini a fornitore e ordini di lavoro: stessa forma, stessa normalizzazione.
  // Sono due collezioni e non una perché sono due documenti diversi — merce e
  // lavorazioni — ma i campi che li reggono sono gli stessi, e scriverli due
  // volte significherebbe che la seconda copia prima o poi resta indietro.
  // Ricevimenti come eventi. Prima della normalizzazione qui sotto, che
  // metterebbe a zero un `received` assente: assente vuol dire «ricavalo dagli
  // eventi», zero vuol dire zero. Il primo caricamento dopo la 0.81 trova i
  // ricevuti scritti sulle righe e nessun evento, e li trasforma in un saldo
  // d'apertura per riga: il numero resta quello di prima.
  // Solo in modo condiviso: in locale il ricevuto è il numero sulla riga.
  // Una collezione dichiarata esiste sempre, anche vuota.
  const primoGiroRicevimenti = !Array.isArray(db.receipts) || !db.receipts.length;
  if (!Array.isArray(db.receipts)) db.receipts = [];
  if (modoCondiviso) riallineaRicevuti(primoGiroRicevimenti);
  [].concat(db.orders || [], db.workOrders || []).forEach(o => {
    if (o.transport == null) o.transport = '';
    if (o.payment == null) o.payment = '';
    delete o.requestedDelivery;   // rimosso: ridondante con la data di consegna per riga, che sola aveva effetto
    if (o.rfqId == null) o.rfqId = null;
    if (o.planId == null) o.planId = null;   // ordine nato da un piano di fabbisogno
    if (o.jobId == null) o.jobId = null;
    // Senza questa normalizzazione i documenti creati prima delle commesse non
    // hanno il campo affatto, e flattenDB() produce righe con e senza quella
    // colonna: è l'incoerenza che tutte le righe qui sopra esistono per evitare.
    if (o.supplierConfirmation == null) o.supplierConfirmation = '';
    if (o.notesInternal == null) o.notesInternal = '';
    (o.lines || []).forEach(l => {
      if (l.price == null) l.price = '';
      if (l.deliveryDate == null) l.deliveryDate = '';
      if (l.received == null) l.received = 0;
      if (l.note == null) l.note = '';
      if (l.phaseKey == null) l.phaseKey = null;   // riga di conto lavoro
      // Le fasi **consecutive** dello stesso terzista stanno in una riga sola, e
      // `phaseKey` ne nomina solo la prima: senza l'elenco completo le altre
      // risulterebbero ancora da documentare e il fabbisogno le riproporrebbe.
      // Sulle righe scritte prima che le tratte esistessero la riga copre una
      // fase sola, e le due colonne dicono la stessa cosa.
      if (l.phaseKeys == null) l.phaseKeys = l.phaseKey || null;
    });
  });
  // Un ODL nasce sempre da una fase di ciclo, quindi le sue righe non hanno mai
  // un articolo: il vincolo va reso vero anche sui dati, non solo sperato.
  // È la stessa garanzia contro il doppio conteggio di magazzino descritta in
  // docs/cloud-schema.md, applicata all'ingresso invece che all'uscita.
  (db.workOrders || []).forEach(o => (o.lines || []).forEach(l => { l.itemId = null; }));
  // ─── Il legame con l'ordine di produzione ───
  // Nullo su tutto ciò che esiste già, ed è esattamente questo che lascia gli
  // ordini di lavoro emessi prima comportarsi **come prima**: ogni condizione
  // nuova è un `if (l.odpId)`, e su di loro non scatta mai.
  (db.workOrders || []).forEach(o => {
    if (o.odpId === undefined) o.odpId = null;
    (o.lines || []).forEach(l => {
      if (l.odpId === undefined) l.odpId = null;
      if (l.odpPhaseId === undefined) l.odpPhaseId = null;
    });
  });
  // Piani di produzione. L'unico stato è aperto/chiuso, e decide se il piano
  // impegna materiale a magazzino. I piani salvati prima che l'impegno
  // esistesse nascono **aperti**: sono i piani in corso di chi aggiorna, e
  // dichiararli chiusi lascerebbe promettere due volte la stessa merce.
  (db.plans || []).forEach(p => {
    if (p.active == null) p.active = true;
    if (p.title == null) p.title = '';
    if (p.notes == null) p.notes = '';
    if (!Array.isArray(p.lines)) p.lines = [];
    p.lines.forEach(l => { if (l.qty == null) l.qty = 0; });
  });
  // ─── Ordini di produzione e dichiarazioni ───
  if (!db.prodOrders) db.prodOrders = [];
  if (!db.prodDecls) db.prodDecls = [];
  db.prodOrders.forEach(o => {
    ['title', 'notes', 'notesInternal', 'code', 'name', 'uom', 'date', 'dueDate'].forEach(k => { if (o[k] == null) o[k] = ''; });
    if (o.itemId === undefined) o.itemId = null;
    if (o.planId === undefined) o.planId = null;
    if (o.jobId === undefined) o.jobId = null;
    if (o.qty == null) o.qty = 0;
    if (!o.status) o.status = 'bozza';
    if (o.active == null) o.active = true;
    if (!Array.isArray(o.phases)) o.phases = [];
    if (!Array.isArray(o.materials)) o.materials = [];
    // Una fase senza id sarebbe una fase che le dichiarazioni non sanno
    // nominare: l'identità è l'id, non la posizione, ed è il punto per cui
    // riordinare il ciclo non sposta più niente su un ordine già lanciato.
    o.phases.forEach(f => {
      if (!f.id) f.id = newId();
      if (f.supplierId === undefined) f.supplierId = null;
      if (f.phaseKey === undefined) f.phaseKey = null;
      ['seq', 'opIndex', 'runFrom', 'runTo', 'passata', 'hours', 'days', 'rate', 'cost'].forEach(k => { if (f[k] == null) f[k] = 0; });
      if (!f.costMode) f.costMode = 'fisso';
      if (f.note == null) f.note = '';
      // Inizio e fine pianificati della fase (0.90.0): vuoti sugli ordini di
      // prima, che continuano a ragionare sulla data dell'ordine.
      if (f.plannedStart == null) f.plannedStart = '';
      if (f.plannedEnd == null) f.plannedEnd = '';
    });
    o.materials.forEach(m => {
      if (!m.id) m.id = newId();
      if (m.qty == null) m.qty = 0;
      if (m.perPezzo == null) m.perPezzo = 0;
    });
  });
  db.prodDecls.forEach(d => {
    if (!d.kind) d.kind = 'avanzamento';
    if (d.qty == null) d.qty = 0;
    if (d.scrap == null) d.scrap = 0;
    if (d.note == null) d.note = '';
    if (d.motivo == null) d.motivo = '';
  });
  // Seed una-tantum delle famiglie materie prime predefinite mancanti (non ripristina quelle cancellate)
  if (!db.settings.mpFamiliesSeeded) {
    const existingIds = new Set((db.families || []).map(f => f.id));
    defaultDB.families.filter(f => f.kind === 'materiale' && !existingIds.has(f.id))
      .forEach(f => db.families.push(famigliaSeminata(f)));
    db.settings.mpFamiliesSeeded = true;
  }
  // Seed una-tantum delle famiglie parti predefinite mancanti (non ripristina quelle cancellate)
  if (!db.settings.partFamiliesSeeded) {
    const existingIds = new Set((db.families || []).map(f => f.id));
    defaultDB.families.filter(f => f.kind === 'parte' && !existingIds.has(f.id))
      .forEach(f => db.families.push(famigliaSeminata(f)));
    db.settings.partFamiliesSeeded = true;
  }
  // Famiglie: tipizzazione (materie prime vs commerciali) + sigla per codifica automatica.
  // Va DOPO i seed: le famiglie appena seminate non hanno sigla e la codifica per
  // famiglia (MAT-ACC-LAM-001) la richiede subito, non al ricaricamento successivo.
  // Le sigle dedotte qui possono uscire duplicate («Meccanico» e «Meccanica»
  // danno entrambe MEC) e restano tali di proposito: da questa versione l'app
  // impedisce di introdurne di nuove, ma non riscrive quelle che c'erano —
  // cambierebbe di nascosto il prefisso dei codici futuri di una famiglia.
  // Chi è duplicato lo si vede segnalato in Gestione (duplicateSiglaGroups).
  (db.families || []).forEach(f => {
    if (!f.kind) f.kind = 'acquistato'; // le famiglie storiche erano tutte commerciali
    if (!f.sigla) f.sigla = siglaFromName(f.name);
    (f.subs || []).forEach(s => { if (!s.sigla) s.sigla = siglaFromName(s.name); });
  });
  db.items.forEach(it => {
    // Migrazione vecchio tipo 'prodotto' + flag isMachine ai nuovi tipi
    if (it.type === 'prodotto') {
      it.type = it.isMachine ? 'macchina' : 'gruppo';
      delete it.isMachine;
    }
    if (isAssembly(it.type)) {
      if (!it.components) it.components = [];
      if (!it.operations) it.operations = [];
      // Giorni di montaggio dichiarati. Zero = si ricavano dalle ore delle
      // lavorazioni dell'assieme, sul calendario dei centri.
      if (it.assemblyDays == null) it.assemblyDays = 0;
    }
    if (it.type === 'parte' && !it.cycle) it.cycle = [];
    // Listino fornitori: lo stesso articolo può essere quotato da più fornitori,
    // e le quotazioni si accumulano nel tempo. I campi singoli dell'articolo
    // (supplierId, purchasePrice/unitCost, supplierCode, supplierDesc) restano
    // il "prezzo in uso", cioè quello che entra nella costificazione: il listino
    // è la memoria da cui lo si sceglie, non un secondo calcolo parallelo.
    // Anche le parti hanno listino: molte si comprano già lavorate da terzi, e il
    // prezzo del fornitore va conservato con la stessa memoria dei commerciali.
    if (it.type === 'acquistato' || it.type === 'materiale' || it.type === 'parte') {
      if (!Array.isArray(it.priceList)) it.priceList = [];
      // Chi ha già un fornitore parte con quella quotazione in elenco, marcata
      // come in uso. Il flag rende il seed una-tantum: se poi si svuota il
      // listino, non ricompare al caricamento successivo.
      if (!it.priceListSeeded) {
        // Anche un prezzo senza fornitore diventa una quotazione "a mano": ora
        // che i prezzi si toccano solo dal listino, altrimenti resterebbe un
        // valore nella costificazione che nessuna schermata può più correggere.
        //
        // Nell'archivio condiviso mai: il flag resta su questo PC (non ha una
        // colonna), e un articolo che arriva dal server ne è senza. La semina
        // ripartiva su ogni PC, a ogni download e a ogni ricarica dopo una
        // modifica altrui, e il listino si riempiva di copie della stessa
        // quotazione. Un archivio arriva sul server già seminato.
        const prezzo = it.type === 'acquistato' ? it.purchasePrice : it.unitCost;
        if (!modoCondiviso && (it.supplierId || Number(prezzo) > 0)) {
          const riga = stampNew({
            id: newId(), supplierId: it.supplierId || null, price: Number(prezzo) || 0,
            minQty: '', leadDays: '', code: it.supplierCode || '', desc: it.supplierDesc || '',
            date: (it.updatedAt || nowISO()).slice(0, 10), rfqId: null, note: '',
          });
          it.priceList.push(riga);
          it.activePriceId = riga.id;
        }
        it.priceListSeeded = true;
      }
      if (modoCondiviso) togliQuotazioniDoppie(it);
    }
    // Approvvigionamento della parte: si produce in casa o si compra. Ha preso il
    // posto del vecchio modo di calcolo (costMode), che rispondeva alla stessa
    // domanda per metà — da dove viene il costo — lasciando all'utente il compito
    // di tenere i due interruttori d'accordo. La conversione conserva il
    // comportamento precedente, costo e fabbisogno insieme:
    //   'unit' → il costo era il campo manuale e la distinta non si esplodeva:
    //            è esattamente una parte comprata.
    //   'cycle'/'sum' → il costo veniva dal ciclo e la distinta si esplodeva:
    //            produzione interna. Per 'sum' si perde la quota manuale che si
    //            sommava al ciclo, ed è una scelta: il ciclo è il costo del farla.
    if (it.type === 'parte') {
      if (it.costMode != null) {
        it.sourcing = it.costMode === 'unit' ? 'buy' : 'make';
        delete it.costMode;
      } else if (it.sourcing == null) {
        // Parte mai passata dal modo di calcolo: col ciclo la si fa, senza la si compra
        it.sourcing = (it.cycle || []).length ? 'make' : 'buy';
      }
    }
    // Righe lavorazione del ciclo. Le ore sono un attributo di **tempo**, presenti
    // su ogni riga qualunque sia il modo di costo: a costo fisso non concorrono al
    // costo — il prezzo concordato col terzista è quello, non ore × tariffa — ma
    // dicono quanto la fase occupa il centro, ed è da lì che nasce il carico.
    (it.cycle || []).forEach(row => {
      // Riferimenti vuoti: `''` e `null` dicevano la stessa cosa — «nessuno» —
      // e convivevano. In una colonna uuid `''` non entra, e al ritorno dal
      // server diventerebbe null: si sceglie null una volta, qui.
      ['itemId', 'workCenterId', 'supplierId'].forEach(k => { if (row[k] === '') row[k] = null; });
      if (row.kind !== 'op') return;
      const wc = db.workCenters.find(w => w.id === row.workCenterId);
      const tariffa = wc ? (Number(wc.hourlyRate) || 0) : 0;
      if (row.costMode == null) {
        // Riga precedente al modo di costo: da ore × tariffa a costo fisso,
        // conservando il valore già calcolato. `hours` non si cancella più.
        row.costMode = 'fisso';
        if (row.cost == null) {
          row.cost = (row.costOverride != null && row.costOverride !== '')
            ? (Number(row.costOverride) || 0)
            : (Number(row.hours) || 0) * tariffa;
        }
        delete row.costOverride;
      } else if (row.costMode === 'orario' && row.hours == null && row.cost != null) {
        // Riparazione. Fino alla 0.64.2 questa normalizzazione cancellava `hours`
        // da ogni riga senza `cost`, cioè da **tutte** quelle a costo orario — che
        // il costo non ce l'hanno per definizione. La fase valeva zero al primo
        // riavvio, e in silenzio. Le ore si ricostruiscono dividendo per la stessa
        // tariffa con cui erano state moltiplicate: quella del **centro**, non
        // `row.rate`, perché era il centro che il difetto usava. Dividere per altro
        // sbaglierebbe proprio dove il fornitore ha una tariffa propria.
        row.hours = tariffa > 0 ? +(Number(row.cost) / tariffa).toFixed(4) : 0;
      }
      // Dove il centro manca o ha tariffa zero le ore non sono ricostruibili e
      // restano zero: non si inventano. Quelle righe le nomina il riepilogo.
      if (row.hours == null) row.hours = 0;
      if (row.rate == null) row.rate = 0;
      if (row.note == null) row.note = '';
      // Giorni di attraversamento di una fase in **conto lavoro**. Il tempo di
      // una lavorazione esterna non è occupazione di una macchina nostra: il
      // pezzo esce e torna, e quello che serve sapere è quando torna. Zero su
      // tutte le fasi precedenti, e su quelle interne resta zero per sempre —
      // lì il tempo sono le ore.
      if (row.days == null) row.days = 0;
    });
  });
  // Migrazioni versionate
  if ((db.schemaVersion || 1) < 2) { migrateV2(); db.schemaVersion = 2; }
  riparaIdSeminati();
}
// ── Ricevuto: somma di eventi, non un numero riscritto ──
// Valgono per le righe di ordini d'acquisto e di lavoro **che non vengono da
// un ordine di produzione**: su quelle i pezzi rientrati li dichiara l'ODP
// (opSyncOdlReceived), che è già fatto di eventi.
const RICEVIMENTO_COLLS = ['orders', 'workOrders'];
function ricevutoDaEventi(l) { return !!l && !l.odpId; }
function arrotondaQta(x) { return Math.round((Number(x) || 0) * 1e6) / 1e6; }
// Tiene d'accordo il ricevuto scritto sulla riga e la somma dei suoi eventi.
// La regola, in locale, è che **il numero che l'utente vede non cambia mai da
// solo**:
//  - una riga senza `received` lo ricava dagli eventi: è il caso di una lettura
//    da un backend, dove il campo — derivato — non viaggia;
//  - una riga con un numero diverso dalla somma riceve un evento che pareggia
//    la differenza (`apertura` al primo giro, `allineamento` dopo). Succede se
//    qualche percorso scrive il campo senza passare da registraRicevuto():
//    fino alla 0.83 qui si riscriveva il numero con la somma, e quel percorso
//    avrebbe azzerato in silenzio un ricevuto che l'utente aveva visto.
// Pota gli eventi di righe che non esistono più — tranne quelli di un
// documento nel cestino, che ripristinato deve ritrovarli.
function riallineaRicevuti(apertura) {
  if (!Array.isArray(db.receipts)) db.receipts = [];
  const righe = new Map();
  RICEVIMENTO_COLLS.forEach(c => (db[c] || []).forEach(o => (o && o.lines || []).forEach(l => {
    if (l && l.id != null && ricevutoDaEventi(l)) righe.set(l.id, { o, l, c });
  })));
  const nelCestino = new Set((db.trash || [])
    .filter(t => t && RICEVIMENTO_COLLS.includes(t.coll) && t.record).map(t => t.record.id));
  const somme = new Map();
  db.receipts = db.receipts.filter(r => {
    if (!r) return false;
    const dove = righe.get(r.lineId);
    if (dove && dove.o.id === r.orderId) {
      somme.set(r.lineId, (somme.get(r.lineId) || 0) + (Number(r.qty) || 0));
      return true;
    }
    return nelCestino.has(r.orderId);
  });
  const oggi = typeof oggiISO === 'function' ? oggiISO() : nowISO().slice(0, 10);
  righe.forEach(({ o, l, c }, id) => {
    const somma = arrotondaQta(somme.get(id) || 0);
    if (l.received == null) { l.received = somma; return; }
    const visto = arrotondaQta(l.received);
    const diff = arrotondaQta(visto - somma);
    l.received = visto;
    if (!diff) return;
    db.receipts.push(stampNew({ id: newId(), coll: c, orderId: o.id, lineId: id, qty: diff,
      kind: apertura ? 'apertura' : 'allineamento',
      date: apertura ? String(o.date || o.updatedAt || oggi).slice(0, 10) : oggi, note: '' }));
  });
}
// L'unico modo di cambiare il ricevuto di una riga: si dice il **nuovo
// totale**, come lo scrive chi è davanti alla merce, e qui diventa un evento
// con la differenza. La riga si aggiorna subito, per chi la sta guardando.
function registraRicevuto(coll, doc, l, totale) {
  const nuovo = arrotondaQta(totale);
  const delta = arrotondaQta(nuovo - (Number(l.received) || 0));
  l.received = nuovo;
  // In locale basta il numero: l'evento serve solo dove si scrive in due.
  if (!modoCondiviso || !delta || !doc || l.id == null || !ricevutoDaEventi(l)) return null;
  if (!Array.isArray(db.receipts)) db.receipts = [];
  const oggi = typeof oggiISO === 'function' ? oggiISO() : nowISO().slice(0, 10);
  const ev = stampNew({ id: newId(), coll, orderId: doc.id, lineId: l.id, qty: delta, kind: 'ricevimento', date: oggi, note: '' });
  db.receipts.push(ev);
  return ev;
}
// ── Famiglie predefinite: id veri anche quando arrivano dopo la v2 ──
// I seed una-tantum delle famiglie materie prime e parti copiavano il
// database demo **con i suoi id** ('fm1', 'fm1s1', 'fp2'…). Su un archivio
// ancora v1 non era un problema — subito dopo migrateV2() li trasforma in
// UUID — ma su un archivio già v2 la migrazione non gira più, e quegli id
// restavano tali e quali: in un database con chiavi `uuid` il primo invio di
// quelle righe sarebbe fallito. Da qui in poi su un archivio v2 il seed nasce
// con id veri.
function famigliaSeminata(f) {
  const copia = JSON.parse(JSON.stringify(f));
  if ((db.schemaVersion || 1) < 2) return copia;   // ci penserà migrateV2()
  copia.id = newId();
  (copia.subs || []).forEach(s => { s.id = newId(); });
  return copia;
}
// E per gli archivi che quegli id li hanno già: si riconoscono dall'id **e**
// dal nome della famiglia demo da cui vengono, così un 'fm1' scritto da altri
// (un test, un import a mano) non viene toccato. Idempotente: dopo il primo
// giro non resta niente da riparare, e il costo è una passata sulle famiglie.
function riparaIdSeminati() {
  if ((db.schemaVersion || 1) < 2) return;
  const demo = new Map();
  defaultDB.families.filter(f => f.kind === 'materiale' || f.kind === 'parte').forEach(f => demo.set(f.id, f));
  const maps = { family: {}, subFamily: {} };
  let n = 0;
  (db.families || []).forEach(f => {
    const d = demo.get(f.id);
    if (!d || f.name !== d.name) return;
    maps.family[f.id] = newId(); n++;
    const subDemo = new Set((d.subs || []).map(s => s.id));
    (f.subs || []).forEach(s => { if (subDemo.has(s.id) && !UUID_RE.test(String(s.id))) { maps.subFamily[s.id] = newId(); n++; } });
  });
  if (n) remapIds(maps);
  return n;
}
// ── Riscrittura degli id e di tutti i riferimenti ───────────
// `maps` è { tipo: { vecchioId: nuovoId } }, con i tipi di REFS ('item',
// 'supplier', 'workCenter', 'family', 'subFamily') più 'user'. Riscrive le
// chiavi primarie delle collezioni che ne sono l'origine e ogni campo che le
// cita: quelli di REFS, e i campi di audit di ogni record e riga figlia.
// Il contenuto del cestino resta com'era (vedi il commento su REFS); la voce
// di cestino in sé — chi ha eliminato — invece si riscrive.
const ID_ORIGINE = { supplier: 'suppliers', workCenter: 'workCenters', item: 'items', user: 'users' };
function remapIds(maps) {
  const m = maps || {};
  const re = (tipo, id) => (id != null && m[tipo] && m[tipo][id] != null) ? m[tipo][id] : id;
  Object.keys(ID_ORIGINE).forEach(tipo => {
    if (m[tipo]) (db[ID_ORIGINE[tipo]] || []).forEach(r => { if (r) r.id = re(tipo, r.id); });
  });
  if (m.family || m.subFamily) {
    (db.families || []).forEach(f => {
      f.id = re('family', f.id);
      (f.subs || []).forEach(s => { s.id = re('subFamily', s.id); });
    });
  }
  const riscrivi = (rec, campi) => {
    if (!rec) return;
    Object.keys(campi).forEach(k => { if (rec[k] != null) rec[k] = re(campi[k], rec[k]); });
  };
  Object.keys(REFS).forEach(coll => {
    const def = REFS[coll];
    (db[coll] || []).forEach(rec => {
      if (def.fields) riscrivi(rec, def.fields);
      Object.keys(def.children || {}).forEach(figlio => {
        (rec && rec[figlio] || []).forEach(r => riscrivi(r, def.children[figlio]));
      });
    });
  });
  if (m.user) {
    COLLECTIONS.forEach(coll => {
      const figli = childrenOf(coll);
      (db[coll] || []).forEach(rec => {
        riscrivi(rec, AUDIT_REFS);
        Object.keys(figli).forEach(k => (rec && rec[k] || []).forEach(r => riscrivi(r, AUDIT_REFS)));
      });
    });
  }
}
// v2: id legacy (interi/sigle) → UUID su tutte le entità e i riferimenti,
// timestamp createdAt/updatedAt, rimozione contatore nextId.
function migrateV2() {
  // Una mappa per tipo, non una sola: vedi il commento su REFS.
  const maps = { item: {}, supplier: {}, workCenter: {}, family: {}, subFamily: {} };
  const mapId = (tipo, rec) => {
    if (rec.id != null && !UUID_RE.test(String(rec.id))) maps[tipo][rec.id] = newId();
  };
  db.suppliers.forEach(r => mapId('supplier', r));
  db.workCenters.forEach(r => mapId('workCenter', r));
  db.families.forEach(f => { mapId('family', f); (f.subs || []).forEach(s => mapId('subFamily', s)); });
  db.items.forEach(r => mapId('item', r));

  // Chiavi e riferimenti, tutti, letti da REFS: aggiungerne uno è una riga là
  // sopra, non una riga qui e il ricordo di doverla scrivere.
  remapIds(maps);

  const t = nowISO();
  const stampAll = rec => { if (!rec.createdAt) rec.createdAt = t; if (!rec.updatedAt) rec.updatedAt = t; };
  db.suppliers.forEach(stampAll);
  db.workCenters.forEach(stampAll);
  db.families.forEach(f => { stampAll(f); (f.subs || []).forEach(stampAll); });
  db.items.forEach(stampAll);

  delete db.nextId;
}

// ── Validazione di un backup prima di aprirlo ───────────────
// `importSnapshot` guardava solo `Array.isArray(data.items)`: un file troncato a
// metà — download interrotto, chiavetta estratta, JSON di tutt'altro programma —
// passava la guardia, sostituiva l'intero database e mandava `migrateDB()` a
// lavorare su strutture che nessuno aveva verificato. L'errore usciva molto
// dopo, in una vista a caso, quando i dati veri erano già stati sovrascritti.
//
// Qui si controlla la forma, non il contenuto: le collezioni sono elenchi, le
// impostazioni sono un oggetto, la versione dello schema è una che sappiamo
// leggere. Il resto lo normalizza migrateDB(), che è fatto per dati vecchi ma
// non per dati assurdi.
function validateSnapshot(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'il file non contiene un database Bomtrack';
  // Gli articoli sono l'unica collezione obbligatoria: un backup senza `items`
  // non è un database Bomtrack, mentre le altre possono mancare nei file vecchi
  // (migrateDB le ricostruisce vuote).
  if (!Array.isArray(data.items)) return 'manca l\'elenco degli articoli: il file non è un backup di Bomtrack, o è troncato';
  for (const c of COLLECTIONS) {
    if (data[c] != null && !Array.isArray(data[c])) return `"${c}" doveva essere un elenco: il file è danneggiato`;
  }
  if (data.settings != null && (typeof data.settings !== 'object' || Array.isArray(data.settings))) {
    return 'le impostazioni sono danneggiate';
  }
  const v = data.schemaVersion;
  if (v != null && (typeof v !== 'number' || !isFinite(v) || v < 1)) return 'versione dello schema non leggibile';
  // Un file più recente dell'app va fermato: le migrazioni sanno salire, non
  // scendere, e aprirlo lo degraderebbe in silenzio.
  if (typeof v === 'number' && v > SCHEMA_VERSION) {
    return `il file viene da una revisione più recente dell'app (schema v${v}, questa legge fino alla v${SCHEMA_VERSION}): aggiorna Bomtrack prima di importarlo`;
  }
  return null;
}
// Cosa c'è dentro, per dirlo prima di sovrascrivere.
function snapshotCounts(data) {
  const out = {};
  COLLECTIONS.forEach(c => { out[c] = Array.isArray(data && data[c]) ? data[c].length : 0; });
  return out;
}

// ── Cosa è cambiato dall'ultimo allineamento ────────────────
// Oggi il salvataggio riscrive tutto il database e la domanda non si pone. Con
// un backend condiviso si pone eccome: mandare l'intero database a ogni
// modifica significa che l'ultimo che salva cancella il lavoro di tutti gli
// altri, in silenzio.
//
// Il conto si fa confrontando lo stato attuale con una fotografia degli id e dei
// loro `updatedAt`, presa all'ultimo allineamento. Costa una passata sui record,
// contro la serializzazione dell'intero database che il salvataggio già fa: in
// proporzione, nulla.
//
// Perché `updatedAt` e non un confronto del contenuto: è lo stesso criterio con
// cui il backend deciderà chi vince (last-write-wins su `updated_at`). Un record
// il cui `updatedAt` non è cambiato non è una modifica — per definizione del
// protocollo, non per approssimazione.
//
// Ne discende un'invariante che vale la pena scrivere: **chi modifica un record
// senza chiamare `touch()` è invisibile alla sincronizzazione.** Vale già oggi
// per i campi di audit, quindi non è una regola nuova; da qui in poi, però, non
// costa più solo una data sbagliata.
//
// Le impostazioni fanno eccezione: sono un oggetto solo, senza `updatedAt`, e le
// viste ci scrivono dentro direttamente. Lì si confronta il contenuto, che è
// piccolo.
let _baseIds = null;        // Map collezione → Map(id → updatedAt)
let _baseChildren = null;   // Map 'collezione|array' → Map(id riga → id padre)
let _baseSettings = '';
function safeStringify(v) { try { return JSON.stringify(v); } catch (e) { return ''; } }
// ── Firma di un record ai fini della sincronizzazione ───────
// Il suo `updatedAt`, più quello delle righe figlie che hanno un'identità
// propria.
//
// I figli contano perché senza di loro il conto è cieco a metà delle modifiche:
// rinominare una sottofamiglia tocca la sottofamiglia, non la famiglia, e fino
// alla 0.59 `pendingChanges()` restituiva `{}` — quella rinomina non sarebbe
// mai partita. Si poteva chiedere a ogni chiamante di toccare anche il padre,
// ma è un'invariante affidata alla disciplina di quaranta punti di codice, ed
// era già rotta in due; qui non c'è niente da ricordarsi.
//
// I figli 'replace' (componenti, operazioni, ciclo) restano fuori di proposito:
// non hanno id né `updatedAt` propri, e *sono* la definizione del padre — chi
// li tocca tocca il padre, che è la stessa ragione per cui in cloud si
// riscrivono in blocco.
function recSignature(coll, r) {
  let s = r.updatedAt || '';
  const figli = childrenOf(coll);
  Object.keys(figli).forEach(k => {
    const rowId = figli[k].rowId;
    if (!rowId) return;
    (r[k] || []).forEach(x => {
      if (x && x[rowId] != null) s += '|' + x[rowId] + ':' + (x.updatedAt || '');
    });
  });
  return s;
}
// ── Righe figlie: la data la mette lo Store, non chi scrive ──
// Le righe con identità propria (righe di documento, quotazioni, sottofamiglie,
// fasi e materiali di un ODP, fornitori di un centro) si fondono **per riga**,
// e per decidere quale versione di una riga vale serve la sua data. Fino alla
// 0.80 quella data la scrivevano solo alcuni dei punti che creano una riga, e
// nessuno di quelli che la modificano: chi cambiava una quantità in un ordine
// toccava l'ordine, e in cloud due colleghi su due righe diverse dello stesso
// ordine si sarebbero cancellati a vicenda. `renameUom` cambiava le righe dei
// documenti senza toccare niente, e la rinomina non risultava da mandare.
//
// Chiedere a ogni mutatore di ricordarsene è l'invariante affidata alla
// disciplina che era già rotta. Qui si confronta il contenuto: un'impronta per
// riga, presa all'ultimo passaggio; se cambia, la riga si data adesso. Le righe
// nuove nascono con `stampNew()`.
//
// Il primo passaggio dopo un caricamento fa da riferimento e non data niente
// come modificato. Le righe storiche senza data prendono quella del padre —
// non l'adesso, che le farebbe vincere a torto su una modifica vera altrui.
let _childFp = null;        // Map 'collezione|array' → Map(id riga → impronta del contenuto)
// ─── Modo condiviso: spento di serie ───
// Due contabilità servono solo a un backend condiviso, e in locale costano:
//  - date e cancellazioni riga per riga delle tabelle figlie (stampChildRows):
//    la prima volta datavano ogni riga esistente (+40% di archivio, misurato,
//    in un localStorage da ~5 MB) e a ogni salvataggio rifacevano le impronte
//    (tempo di salvataggio quasi triplicato);
//  - i ricevimenti come eventi (registraRicevuto): un evento per ogni modifica
//    del ricevuto, ~290 byte l'uno (+45% di archivio su 2.000 righe ricevute).
// Il loro scopo è far convivere due persone che scrivono insieme, e in locale
// quella situazione non esiste. Accenderle dopo non perde niente: le righe
// senza data prendono quella del padre, e ogni ricevuto scritto sulle righe
// diventa un evento d'apertura. Le accende un adattatore cloud, con
// `Store.modoCondiviso = true` **prima** di Store.load().
let modoCondiviso = false;
// L'impronta è la riga serializzata così com'è, date comprese: si riprende
// dopo averla datata, quindi la data nuova non conta come modifica al giro
// successivo. Una copia senza i campi di data costava quattro volte tanto, e su
// decine di migliaia di righe quanto il salvataggio stesso.
function childFingerprint(x) {
  try { return JSON.stringify(x); } catch (e) { return ''; }
}
function stampChildRows() {
  if (!db || !modoCondiviso) return;
  const riferimento = !_childFp;
  const prossime = new Map();
  COLLECTIONS.forEach(c => {
    const figli = childrenOf(c);
    Object.keys(figli).forEach(k => {
      const rowId = figli[k].rowId;
      if (!rowId) return;
      const gruppo = c + '|' + k;
      const prima = riferimento ? null : (_childFp.get(gruppo) || new Map());
      const dopo = new Map();
      prossime.set(gruppo, dopo);
      (db[c] || []).forEach(r => {
        if (!r || !Array.isArray(r[k])) return;
        r[k].forEach(x => {
          if (!x || x[rowId] == null) return;
          let impronta = childFingerprint(x);
          if (riferimento) {
            if (!x.updatedAt && r.updatedAt) {
              x.updatedAt = r.updatedAt;
              if (!x.createdAt) x.createdAt = r.createdAt || r.updatedAt;
              impronta = childFingerprint(x);
            }
          } else {
            const era = prima.get(x[rowId]);
            if (era === undefined) { if (!x.updatedAt) { stampNew(x); impronta = childFingerprint(x); } }
            else if (era !== impronta) { touch(x); impronta = childFingerprint(x); }
          }
          dopo.set(x[rowId], impronta);
        });
      });
    });
  });
  _childFp = prossime;
}
// Gli id delle righe figlie con identità propria, e il padre di ciascuna:
// servono a dire quali righe sono **sparite**. L'assenza di una riga non è
// un'informazione che un invio di soli upsert possa esprimere — è la stessa
// ragione dei tombstone sui record radice, un livello più giù.
function snapshotChildIds() {
  if (!modoCondiviso) return null;
  const m = new Map();
  COLLECTIONS.forEach(c => {
    const figli = childrenOf(c);
    Object.keys(figli).forEach(k => {
      const rowId = figli[k].rowId;
      if (!rowId) return;
      const ids = new Map();
      (db[c] || []).forEach(r => {
        if (!r || r.id == null) return;
        (Array.isArray(r[k]) ? r[k] : []).forEach(x => { if (x && x[rowId] != null) ids.set(x[rowId], r.id); });
      });
      m.set(c + '|' + k, ids);
    });
  });
  return m;
}
function snapshotSignatures() {
  const m = new Map();
  COLLECTIONS.forEach(c => {
    const inner = new Map();
    (db[c] || []).forEach(r => { if (r && r.id != null) inner.set(r.id, recSignature(c, r)); });
    m.set(c, inner);
  });
  return m;
}
// Il conto delle modifiche e la fotografia che lo azzera si prendono **insieme**:
// è l'unico modo perché «questo è quello che mando» e «questo è quello che
// smetto di considerare da mandare» siano la stessa cosa. Fra la richiesta e la
// risposta c'è la rete, e in quel tempo chi lavora continua a scrivere: una
// fotografia scattata al ritorno inghiottirebbe quelle modifiche marcandole
// come già inviate. Sparirebbero senza che nessuno se ne accorga.
//
//   const { changes, mark } = Store.takeChanges();
//   await invia(changes);
//   Store.markSynced(mark);
function takeChanges() {
  const changes = pendingChanges();   // data anche le righe figlie: va prima della fotografia
  return {
    changes,
    mark: { ids: snapshotSignatures(), children: snapshotChildIds(), settings: safeStringify(db.settings) },
  };
}
// Dopo ogni arrivo dal server si cercano gli anelli di distinta (dalla 0.105.6):
// è l'unico punto in cui ne può nascere uno che createsCycle() non ha visto —
// vedi anelliDistinta() in views-bom.js, caricato dopo, da cui il riferimento
// differito. Un errore qui non deve mai far fallire una ricezione già salvata.
function controllaAnelliDopoArrivo() {
  if (typeof controllaAnelliDistinta !== 'function') return;
  try { controllaAnelliDistinta(); } catch (e) { console.warn('Controllo anelli di distinta non riuscito:', e); }
}
// Senza argomento rifotografa l'adesso: è il caso del caricamento, dove la
// fotografia *è* lo stato appena letto. Con l'argomento vale la fotografia
// presa da takeChanges() prima dell'invio.
function markSynced(mark) {
  if (mark && mark.ids) { _baseIds = mark.ids; _baseChildren = mark.children || null; _baseSettings = mark.settings; return; }
  stampChildRows();
  _baseIds = snapshotSignatures();
  _baseChildren = snapshotChildIds();
  _baseSettings = safeStringify(db.settings);
}
// Dopo un ripristino di backup, un azzeramento o un reset la fotografia non
// vale più niente: il database in memoria non discende da quello che il backend
// ha visto, e un confronto per `updatedAt` direbbe «niente da mandare» proprio
// mentre è cambiato tutto. Si dichiara di non sapere — `pendingChanges()`
// tornerà `null` — e il riallineamento tocca all'adapter, che è l'unico a poter
// confrontare le due parti.
function markUnknown() { _baseIds = null; _baseChildren = null; _baseSettings = null; _childFp = null; _storicoBase = null; }
// { items: { upsert: [id…], remove: [id…], removeChildren: { priceList: [id…] } }, …, settings: true }
// Le collezioni senza modifiche non compaiono, e `removeChildren` compare solo
// se qualche riga figlia è sparita da un padre che **esiste ancora** — quelle
// di un padre eliminato le porta via la cancellazione del padre. `null` =
// nessuna fotografia ancora presa (database mai caricato).
function pendingChanges() {
  if (!_baseIds) return null;
  stampChildRows();
  const out = {};
  COLLECTIONS.forEach(c => {
    const prima = _baseIds.get(c) || new Map();
    const upsert = [], remove = [], visti = new Set();
    (db[c] || []).forEach(r => {
      if (!r || r.id == null) return;
      visti.add(r.id);
      const era = prima.get(r.id);
      if (era === undefined || era !== recSignature(c, r)) upsert.push(r.id);
    });
    prima.forEach((_, id) => { if (!visti.has(id)) remove.push(id); });
    if (upsert.length || remove.length) out[c] = { upsert, remove };
    if (!_baseChildren) return;
    const padriTolti = new Set(remove);
    const figli = childrenOf(c);
    Object.keys(figli).forEach(k => {
      if (!figli[k].rowId) return;
      const primaFigli = _baseChildren.get(c + '|' + k);
      if (!primaFigli) return;
      const ora = new Set();
      (db[c] || []).forEach(r => (r && Array.isArray(r[k]) ? r[k] : []).forEach(x => { if (x && x[figli[k].rowId] != null) ora.add(x[figli[k].rowId]); }));
      const tolti = [];
      primaFigli.forEach((padre, id) => { if (!ora.has(id) && !padriTolti.has(padre)) tolti.push(id); });
      if (!tolti.length) return;
      if (!out[c]) out[c] = { upsert: [], remove: [] };
      if (!out[c].removeChildren) out[c].removeChildren = {};
      out[c].removeChildren[k] = tolti;
    });
  });
  if (safeStringify(db.settings) !== _baseSettings) out.settings = true;
  return out;
}
function hasPendingChanges() {
  const p = pendingChanges();
  return !!p && Object.keys(p).length > 0;
}

// ── Adapter di persistenza ──────────────────────────────────
// Dove finiscono i byte. Oggi localStorage; domani un backend condiviso, che si
// aggancia sostituendo questo oggetto invece di rincorrere i saveDB() sparsi
// nelle viste. Il contratto è volutamente minimo — leggi una stringa, scrivine
// una, dimmi quanto occupa — perché è tutto ciò che `Store` usa davvero.
//
// Gli errori NON si gestiscono qui: l'adapter lascia passare l'eccezione e
// `Store.commit()` la classifica (quota, storage non disponibile, dati non
// serializzabili). Così la classificazione resta in un punto solo, qualunque
// sia la destinazione dei dati.
const LocalAdapter = {
  name: 'local',
  read() { return localStorage.getItem(DB_KEY); },
  write(payload) { localStorage.setItem(DB_KEY, payload); },
  size() { try { return (localStorage.getItem(DB_KEY) || '').length; } catch (e) { return 0; } },
  // Mette da parte un blob illeggibile perché resti recuperabile a mano. Una
  // copia sola: se il caricamento fallisce una seconda volta, la prima copia è
  // quella buona — la seconda sarebbe già il database demo salvato sopra.
  // Restituisce false se una copia c'era già; se la scrittura non riesce
  // l'eccezione passa, e loadDB() la distingue da «c'era già».
  rescue(payload) {
    if (localStorage.getItem(DB_KEY_RESCUE) != null) return false;
    localStorage.setItem(DB_KEY_RESCUE, payload);
    return true;
  },
  rescued() { return localStorage.getItem(DB_KEY_RESCUE); },
  leggiRev() { const v = localStorage.getItem(DB_KEY_REV); return v == null ? 0 : (+v || 0); },
  scriviRev(n) { localStorage.setItem(DB_KEY_REV, String(n)); },
};
let adapter = LocalAdapter;

// ── IndexedDB: l'archivio senza il tetto dei 5 MB ──────────
// localStorage tiene circa 5 MB per sito, e un archivio con qualche anno di
// ordini e movimenti ci arriva. IndexedDB ha per limite lo spazio del disco.
//
// L'app però ragiona in modo sincrono — `Store.commit()` risponde subito, e
// ottanta punti ci contano — mentre IndexedDB risponde solo con richiamate.
// Il ponte è una copia in memoria: all'avvio `preload()` legge l'archivio
// (l'unico momento in cui si aspetta), poi `read()` restituisce la copia e
// `write()` la aggiorna subito e accoda la scrittura vera. Le scritture partono
// nell'ordine in cui arrivano, ciascuna con la sua transazione: IndexedDB le
// esegue in quell'ordine, e una scheda che legge dopo trova l'ultima.
//
// Il contatore di revisione resta in localStorage: sono pochi byte, e l'evento
// `storage` con cui le altre schede si accorgono di una scrittura esiste solo
// lì. Accanto all'archivio si salva anche la revisione a cui è stato scritto:
// se una scheda con una versione vecchia dell'app scrive ancora in localStorage
// dopo il trasloco, la sua revisione è più alta e al caricamento vince lei.
const IDB_NOME = 'bomtrack_archivio';
// Messo dopo il trasloco: da lì in poi l'archivio vero sta in IndexedDB, e
// localStorage vuoto non vuol dire «archivio nuovo».
const DB_KEY_IN_IDB = 'bomtrack_v1_in_indexeddb';
const IDB_STORE = 'archivio';
// Le chiavi che stanno in IndexedDB accanto all'archivio. `cloudBase`: la
// fotografia dell'ultimo invio all'archivio condiviso, che in localStorage
// oltre qualche decina di migliaia di record non ci stava più (dalla 0.105.5).
const IDB_EXTRA = ['cloudBase'];
function creaIdbAdapter(fabbrica) {
  let conn = null, copia = null, copiaRescue = null, inVolo = 0, segnato = false, attesaRescue = null;
  const extra = {};   // altre chiavi accanto all'archivio (la fotografia del cloud), lette all'avvio
  const attesa = req => new Promise((ok, ko) => { req.onsuccess = () => ok(req.result); req.onerror = () => ko(req.error); });
  const completa = tx => new Promise((ok, ko) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => ko(tx.error);
    tx.onabort = () => ko(tx.error || new Error('transazione annullata'));
  });
  const apri = () => new Promise((ok, ko) => {
    const req = fabbrica.open(IDB_NOME, 1);
    req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains(IDB_STORE)) d.createObjectStore(IDB_STORE); };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ko(req.error);
    req.onblocked = () => ko(new Error('archivio bloccato da un\'altra scheda'));
  });
  const leggi = chiave => attesa(conn.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(chiave));
  const scriviTutto = coppie => {
    const tx = conn.transaction(IDB_STORE, 'readwrite');
    const st = tx.objectStore(IDB_STORE);
    coppie.forEach(([k, v]) => st.put(v, k));
    return completa(tx);
  };
  const lsRev = () => LocalAdapter.leggiRev();
  return {
    name: 'indexeddb',
    async preload() {
      conn = await apri();
      copia = (await leggi('db')) || null;
      copiaRescue = (await leggi('illeggibile')) || null;
      for (const k of IDB_EXTRA) extra[k] = (await leggi('x:' + k)) || null;
      const revIdb = Number(await leggi('rev')) || 0;
      // Il trasloco da localStorage: la prima volta, o quando una scheda con
      // l'app vecchia ha scritto lì dopo l'ultimo salvataggio qui.
      let vecchio = null;
      try { vecchio = localStorage.getItem(DB_KEY); } catch (e) { /* localStorage non leggibile: si resta con quel che c'è */ }
      if (vecchio && (copia == null || lsRev() > revIdb)) {
        await scriviTutto([['db', vecchio], ['rev', lsRev()]]);
        // Si rilegge prima di cancellare l'originale: se la copia non torna
        // identica, l'originale resta dov'è.
        if ((await leggi('db')) !== vecchio) throw new Error('verifica del trasloco fallita');
        copia = vecchio;
        try { localStorage.removeItem(DB_KEY); } catch (e) { /* resta una copia in più, non un danno */ }
      }
      try { if (copia != null) localStorage.setItem(DB_KEY_IN_IDB, '1'); } catch (e) { /* senza il segno resta solo la rete qui sotto in meno */ }
      return this;
    },
    read() { return copia; },
    write(payload) {
      copia = payload;
      inVolo++;
      // La revisione che commit() sta per scrivere, presa nello stesso istante.
      const rev = lsRev() + 1;
      // Dopo la copia di soccorso, se ce n'è una in corso: se quella non
      // arriva su disco, nemmeno questa deve arrivarci (dalla 0.105.6).
      const scrivi = () => scriviTutto([['db', payload], ['rev', rev]]);
      (attesaRescue ? attesaRescue.then(scrivi) : scrivi())
        .then(() => {
          inVolo--;
          if (!segnato) { try { localStorage.setItem(DB_KEY_IN_IDB, '1'); segnato = true; } catch (e) { /* si riprova alla prossima */ } }
          scritturaRiuscita();
        },
              e => { inVolo--; commitFailed(e && e.copiaSoccorso ? 'rescue' : isQuotaError(e) ? 'quota' : 'storage', e, payload.length); });
    },
    size() { return copia ? copia.length : 0; },
    // La copia qui si scrive dopo: rescue() risponde subito, ma ogni write()
    // successiva aspetta che la copia sia su disco, e se la copia fallisce
    // fallisce anche lei — l'originale resta al suo posto, e l'avviso del
    // salvataggio dice perché. Prima l'errore finiva solo in console, e il
    // primo salvataggio scriveva i dati d'esempio sopra l'unico originale.
    rescue(payload) {
      if (copiaRescue != null) return false;
      copiaRescue = payload;
      attesaRescue = scriviTutto([['illeggibile', payload]]).catch(e => {
        console.error('Copia di soccorso non salvata:', e);
        copiaRescue = null;
        throw Object.assign(new Error('copia di soccorso non salvata'), { copiaSoccorso: true, causa: e });
      });
      // Nessuno la aspetta se non arriva una scrittura: il rifiuto non va perso.
      attesaRescue.catch(() => {});
      return true;
    },
    rescued() { return copiaRescue; },
    // L'originale è stato scaricato come file: le scritture non aspettano più la copia.
    liberaRescue() { attesaRescue = null; },
    // Dalla 0.105.5. Restituisce false se la chiave non è fra quelle previste.
    scriviExtra(k, v) {
      if (!IDB_EXTRA.includes(k)) return false;
      extra[k] = v;
      scriviTutto([['x:' + k, v]]).catch(e => console.error('Salvataggio di ' + k + ' fallito:', e));
      return true;
    },
    leggiExtra: k => extra[k],
    leggiRev: () => LocalAdapter.leggiRev(),
    scriviRev: n => LocalAdapter.scriviRev(n),
    // La scrittura parte subito ma finisce dopo: commit() non deve dichiarare
    // salvato quello che non lo è ancora (vedi scritturaRiuscita).
    asincrono: true,
    inVolo: () => inVolo,
  };
}
// Sceglie dove sta l'archivio, prima del caricamento: IndexedDB se il browser
// ce l'ha e si apre, altrimenti localStorage come sempre. Non fallisce mai:
// il peggio che succede è restare dove si era.
//
// Con un'eccezione, ed è quella che conta: se l'archivio era già stato
// traslocato, localStorage è vuoto, e ripiegarci vorrebbe dire partire dai
// dati di esempio e salvarli — con una revisione più alta, che al prossimo
// avvio riuscito vincerebbe sull'archivio vero. Allora si resta fermi: lettura
// fallita (l'app lo dice e non salva), scritture rifiutate.
const ArchivioIrraggiungibile = {
  name: 'irraggiungibile',
  read() { throw new Error('L\'archivio sta in IndexedDB, che il browser non ha aperto'); },
  write() { throw new Error('L\'archivio sta in IndexedDB, che il browser non ha aperto'); },
  size() { return 0; },
  leggiRev: () => LocalAdapter.leggiRev(),
  scriviRev: n => LocalAdapter.scriviRev(n),
};
function archivioGiaTraslocato() { try { return localStorage.getItem(DB_KEY_IN_IDB) === '1'; } catch (e) { return false; } }
async function preparaArchivio(fabbrica) {
  const f = fabbrica !== undefined ? fabbrica : (typeof indexedDB !== 'undefined' ? indexedDB : null);
  try {
    if (!f) throw new Error('IndexedDB assente');
    adapter = await creaIdbAdapter(f).preload();
  } catch (e) {
    adapter = archivioGiaTraslocato() ? ArchivioIrraggiungibile : LocalAdapter;
    console.warn('IndexedDB non disponibile, archivio ' + (adapter === LocalAdapter ? 'in localStorage' : 'non raggiungibile') + ':', e);
  }
  return adapter;
}

// ── Esito dei salvataggi ────────────────────────────────────
// Quando localStorage rifiuta la scrittura, l'app continua a funzionare
// mostrando i dati aggiornati: la memoria diverge dal persistito e alla
// chiusura del browser sparisce tutto. Va detto, e va detto in modo che non si
// possa non vederlo — non con un toast che sparisce in due secondi e mezzo.
let dbUnsaved = false;
// ─── Due schede sulla stessa app ───
// `commit()` riscrive **tutta** la chiave con la fotografia che questa scheda ha
// in memoria. Con due finestre aperte — cosa normalissima su un gestionale — la
// seconda che salva cancellava tutto il lavoro fatto nella prima da quando era
// stata aperta. Senza un errore, senza un avviso: la setItem riesce, quindi
// nemmeno il badge «modifiche non salvate» si accendeva. Era perdita di dati
// certa e invisibile.
//
// Il rimedio è deliberatamente minimo: **non si fonde niente**. Fondere due
// fotografie di un gestionale richiede di sapere quale delle due versioni di
// ogni riga vale, e quella risposta non ce l'ha nessuno qui. Ci si limita ad
// accorgersene e a smettere di sovrascrivere di nascosto — che è il difetto.
//
// `revVista` è la revisione che questa scheda ha letto per ultima. Se
// nell'archivio ce n'è una più alta, qualcun altro ha scritto nel frattempo.
let revVista = 0;
// Alzato da Store.forzaProssimaScrittura(): vale per un solo salvataggio, ed è
// il modo in cui l'utente dice «lo so, tieni la mia versione».
let forzaScrittura = false;
function isQuotaError(e) {
  return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
              || e.code === 22 || e.code === 1014);
}
// kind: 'quota' (spazio esaurito) | 'storage' (salvataggio non disponibile,
// es. navigazione privata) | 'serialize' (dati non serializzabili).
// La segnalazione all'utente sta in core.js, dietro l'hook onPersistError:
// store.js resta senza codice di interfaccia.
// Una scrittura è arrivata a destinazione: se prima una era fallita, adesso
// memoria e archivio coincidono di nuovo. Con un adapter sincrono lo si sa
// subito; con IndexedDB quando la transazione si chiude.
function scritturaRiuscita() {
  if (!dbUnsaved) return;
  if (adapter.inVolo && adapter.inVolo() > 0) return;   // ne manca ancora una
  dbUnsaved = false;
  if (typeof onPersistRecovered === 'function') onPersistRecovered();
}
function commitFailed(kind, err, bytes) {
  dbUnsaved = true;
  console.error('Salvataggio locale fallito (' + kind + '):', err);
  if (typeof onPersistError === 'function') onPersistError(kind, { bytes, err });
  else if (typeof showToast === 'function') showToast('Errore salvataggio', 'error');
  return false;
}

// ── Storico delle modifiche ─────────────────────────────────
// Ogni record dice chi l'ha toccato per ultimo (`updatedBy`), non che cosa è
// cambiato: un prezzo sbagliato o una quantità corretta male non si potevano
// ricostruire. Qui, a ogni salvataggio, si confronta ogni record con com'era
// al salvataggio precedente e le differenze finiscono in `db.storico`, una
// voce per record toccato: chi, quando, quali campi, da cosa a cosa.
//
// Perché nel salvataggio e non in chi modifica: i punti che scrivono sono
// ottanta e passano tutti da qui (`Store.commit`), e un registro che dipende dal
// ricordarsi di chiamarlo è un registro con dei buchi. Il confronto è sul JSON
// del record, non su `updatedAt`: una modifica che non timbra la data si vede
// lo stesso, e un `touch()` che non cambia niente non fa rumore.
//
// Cosa NON entra: le collezioni che sono già un registro (movimenti,
// ricevimenti, dichiarazioni di produzione, revisioni, cestino). E un
// salvataggio che tocca più di STORICO_BLOCCO record di una collezione — un
// import da Excel, una generazione di ordini da un piano — diventa **una**
// voce riassuntiva: cinquemila voci da un import cancellerebbero tutto il
// resto dal registro, che tiene le ultime STORICO_MAX.
//
// Sta dentro il database, quindi viaggia col backup. Non è una collezione di
// SCHEMA: il database condiviso, il giorno che ci sarà, avrà il suo.
const STORICO_MAX = 5000;
const STORICO_BLOCCO = 50;
const STORICO_ESCLUSE = new Set(['movements', 'receipts', 'prodDecls', 'revisions', 'trash']);
const STORICO_TECNICI = new Set(['createdAt', 'createdBy', 'updatedAt', 'updatedBy']);
const STORICO_NASCOSTI = new Set(['passwordHash', 'passwordSalt']);
// I flag «*Seeded» dicono solo che una semina una-tantum è già stata fatta
// (famiglie predefinite, prima quotazione del listino): non sono un dato di
// chi lavora. Il server per giunta non li conserva, e ogni download li
// faceva comparire nel registro come «true → (vuoto)».
const storicoInterno = k => /Seeded$/.test(k);
const STORICO_LUNG = 80;
let _storicoBase = null;   // Map collezione → Map id → JSON; 'settings' → JSON
function storicoFotografa() {
  if (!db) { _storicoBase = null; return; }
  const m = new Map();
  COLLECTIONS.forEach(c => {
    if (STORICO_ESCLUSE.has(c)) return;
    const inner = new Map();
    (db[c] || []).forEach(r => { if (r && r.id != null) inner.set(r.id, safeStringify(r)); });
    m.set(c, inner);
  });
  m.set('settings', safeStringify(db.settings));
  _storicoBase = m;
}
// Il nome con cui una persona riconosce il record, preso al momento.
function storicoEtichetta(r) {
  if (!r) return '';
  return String(r.code || r.number || r.name || r.title || r.username || r.email || r.id || '').slice(0, STORICO_LUNG);
}
function _storicoValore(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'object') return Array.isArray(v) ? v.length + (v.length === 1 ? ' riga' : ' righe') : '(modificato)';
  const t = String(v);
  return t.length > STORICO_LUNG ? t.slice(0, STORICO_LUNG - 1) + '…' : t;
}
// Una quotazione del listino come la riconosce chi legge: fornitore, prezzo,
// data. `activePriceId` è l'id della riga del listino in uso, e nel registro
// un id non dice niente; la riga per giunta può sparire dal listino, quindi
// l'etichetta si fissa al momento della modifica.
function storicoQuotazione(it, id) {
  if (!id) return '';
  const r = ((it && it.priceList) || []).find(x => x && x.id === id);
  if (!r) return '';
  const s = r.supplierId ? (db.suppliers || []).find(x => x && x.id === r.supplierId) : null;
  const prezzo = (Number(r.price) || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const cur = (db.settings && db.settings.currency) || '€';
  const data = r.date ? new Date(r.date).toLocaleDateString('it-IT') : '';
  return [s ? s.name : (r.supplierId ? 'fornitore rimosso' : 'senza fornitore'),
    prezzo + ' ' + cur + (r.priceUom ? '/' + r.priceUom : ''), data].filter(Boolean).join(' · ').slice(0, STORICO_LUNG);
}
// Le righe di un elenco annidato con un id proprio (righe dei documenti,
// listino): quante aggiunte, tolte e cambiate. Senza id si dice solo che è
// cambiato.
function _storicoRighe(prima, dopo) {
  const id = x => (x && x.id != null ? x.id : null);
  if (!prima.every(x => id(x) != null) || !dopo.every(x => id(x) != null)) return '';
  const a = new Map(prima.map(x => [id(x), safeStringify(x)]));
  let piu = 0, cambiate = 0;
  const visti = new Set();
  dopo.forEach(x => {
    visti.add(id(x));
    if (!a.has(id(x))) piu++;
    else if (a.get(id(x)) !== safeStringify(x)) cambiate++;
  });
  const meno = prima.filter(x => !visti.has(id(x))).length;
  return [piu ? '+' + piu : '', meno ? '−' + meno : '', cambiate ? cambiate + (cambiate === 1 ? ' cambiata' : ' cambiate') : ''].filter(Boolean).join(', ');
}
// [{ k: campo, a: prima, b: dopo, r?: dettaglio delle righe }]
function storicoDiff(prima, dopo) {
  const out = [];
  const chiavi = new Set(Object.keys(prima || {}).concat(Object.keys(dopo || {})));
  chiavi.forEach(k => {
    if (STORICO_TECNICI.has(k) || storicoInterno(k)) return;
    const a = prima ? prima[k] : undefined, b = dopo ? dopo[k] : undefined;
    if (safeStringify(a) === safeStringify(b)) return;
    if ((a == null || a === '') && (b == null || b === '')) return;
    if (STORICO_NASCOSTI.has(k)) { out.push({ k, a: '', b: '(modificata)' }); return; }
    const voce = { k, a: _storicoValore(a), b: _storicoValore(b) };
    if (Array.isArray(a) && Array.isArray(b)) { const r = _storicoRighe(a, b); if (r) voce.r = r; }
    out.push(voce);
  });
  return out;
}
// Vero mentre si salvano le modifiche arrivate dall'archivio condiviso: nel
// registro l'autore è chi le ha fatte (updatedBy del record), non chi le
// riceve. Le metterebbe tutte a nome di chi ha la finestra aperta.
let _storicoDaRemoto = false;
function storicoRegistra() {
  if (!db) return;
  if (!_storicoBase) { storicoFotografa(); return; }
  const t = nowISO(), u = _storicoDaRemoto ? null : (actorId || null);
  const nuove = [];
  const dopo = new Map();
  COLLECTIONS.forEach(c => {
    if (STORICO_ESCLUSE.has(c)) return;
    const prima = _storicoBase.get(c) || new Map();
    const ora = new Map();
    dopo.set(c, ora);
    const voci = [];
    (db[c] || []).forEach(r => {
      if (!r || r.id == null) return;
      const j = safeStringify(r);
      ora.set(r.id, j);
      const pj = prima.get(r.id);
      if (pj === undefined) voci.push({ op: 'n', r });
      else if (pj !== j) voci.push({ op: 'm', r, p: pj });
    });
    prima.forEach((pj, id) => { if (!ora.has(id)) voci.push({ op: 'x', p: pj }); });
    if (!voci.length) return;
    if (voci.length > STORICO_BLOCCO) {
      const n = op => voci.filter(v => v.op === op).length;
      nuove.push({ t, u, c, op: 'b', n: [n('n') && n('n') + ' nuovi', n('m') && n('m') + ' modificati', n('x') && n('x') + ' eliminati'].filter(Boolean).join(', ') });
      return;
    }
    voci.forEach(v => {
      let vecchio = null;
      try { vecchio = v.p ? JSON.parse(v.p) : null; } catch (e) { vecchio = null; }
      const rec = v.r || vecchio || {};
      const e = { t, u: _storicoDaRemoto ? (rec.updatedBy || null) : u, c, id: rec.id, op: v.op, n: storicoEtichetta(rec) };
      if (v.op === 'm') {
        e.d = storicoDiff(vecchio, v.r);
        if (c === 'items') e.d.forEach(x => {
          if (x.k !== 'activePriceId') return;
          x.a = storicoQuotazione(vecchio, vecchio && vecchio.activePriceId) || x.a;
          x.b = storicoQuotazione(v.r, v.r.activePriceId) || x.b;
        });
        if (!e.d.length) return;   // solo date e autore: nessuna modifica vera
      }
      nuove.push(e);
    });
  });
  const set = safeStringify(db.settings);
  if (set !== _storicoBase.get('settings')) {
    let vecchie = {};
    try { vecchie = JSON.parse(_storicoBase.get('settings') || '{}') || {}; } catch (e) { vecchie = {}; }
    const d = storicoDiff(vecchie, db.settings || {});
    if (d.length) nuove.push({ t, u, c: 'settings', id: null, op: 'm', n: 'Impostazioni', d });
  }
  dopo.set('settings', set);
  _storicoBase = dopo;
  if (!nuove.length) return;
  if (!Array.isArray(db.storico)) db.storico = [];
  Array.prototype.push.apply(db.storico, nuove);
  if (db.storico.length > STORICO_MAX) db.storico.splice(0, db.storico.length - STORICO_MAX);
}
// Le voci di un record, dalla più recente.
function storicoDi(coll, id) {
  return (Array.isArray(db && db.storico) ? db.storico : []).filter(e => e.c === coll && e.id === id).reverse();
}

// ── Store: API repository (contratto per il futuro adapter cloud) ──
const Store = {
  load() { loadDB(); },
  commit() {
    // Unico punto di scrittura: ci passano tutti i saveDB() delle viste, insert/
    // update/remove, load, reset, clearAll e importSnapshot. Invalidare qui
    // copre ogni mutazione. Prima del salvataggio, non dopo: se setItem fallisce
    // la cache resta comunque allineata a ciò che c'è in memoria.
    if (typeof invalidateCaches === 'function') invalidateCaches();
    // Le righe figlie modificate prendono la loro data prima di essere scritte.
    stampChildRows();
    // Cosa è cambiato dall'ultimo salvataggio, nel registro: prima di
    // serializzare, così il registro viaggia nello stesso salvataggio.
    storicoRegistra();
    let payload;
    try { payload = JSON.stringify(db); }
    catch (e) { return commitFailed('serialize', e, 0); }
    // Archivio illeggibile e nessuna copia messa da parte: scrivere adesso
    // cancellerebbe l'unico originale (dalla 0.105.6). Si sblocca scaricandolo.
    if (_senzaCopia) return commitFailed('rescue', new Error('archivio illeggibile senza copia di soccorso'), payload.length);
    // Ha scritto qualcun altro da quando questa scheda ha letto? Se sì ci si
    // ferma: scrivere adesso cancellerebbe il suo lavoro, ed è esattamente il
    // guasto che questa guardia esiste per impedire. Si controlla **prima** di
    // scrivere e la lettura è di un numero, non dell'archivio.
    //
    // `forzaScrittura` è la via d'uscita, per chi ha visto l'avviso e decide
    // consapevolmente che la versione buona è la propria.
    let revAttuale = revVista;
    try { if (adapter.leggiRev) revAttuale = adapter.leggiRev(); }
    catch (e) { revAttuale = revVista; }   // archivio non leggibile: ci pensa la write qui sotto
    if (revAttuale !== revVista && !forzaScrittura) {
      dbUnsaved = true;
      if (typeof onExternalChange === 'function') onExternalChange();
      else if (typeof showToast === 'function') showToast("Dati modificati in un'altra scheda: ricarica prima di salvare", 'error');
      return false;
    }
    forzaScrittura = false;
    try {
      adapter.write(payload);
      // La revisione sale **dopo** una scrittura riuscita: se la write fallisce
      // il numero non deve muoversi, altrimenti le altre schede vedrebbero un
      // conflitto che non c'è stato.
      revVista = revAttuale + 1;
      try { if (adapter.scriviRev) adapter.scriviRev(revVista); } catch (e) { /* il blob è salvo: il contatore si riallinea al prossimo caricamento */ }
      if (!adapter.asincrono) scritturaRiuscita();
      if (typeof Store.dopoCommit === 'function') { try { Store.dopoCommit(); } catch (e) { console.error(e); } }
      return true;
    } catch (e) {
      return commitFailed(isQuotaError(e) ? 'quota' : 'storage', e, payload.length);
    }
  },
  // Vero finché una modifica è rimasta solo in memoria. Chiudere la scheda in
  // questo stato perde tutto il lavoro fatto dal primo errore in poi.
  isUnsaved() { return dbUnsaved; },
  // L'archivio illeggibile dell'ultimo caricamento, così com'era (o null).
  grezzoIlleggibile() { return _grezzoIlleggibile; },
  // Chi lo ha scaricato come file ne ha una copia: i salvataggi ripartono.
  scaricatoIlleggibile() { _senzaCopia = false; if (adapter.liberaRescue) adapter.liberaRescue(); },
  senzaCopia() { return _senzaCopia; },
  // Un'altra scheda ha scritto l'archivio dopo che questa l'ha letto.
  superata() {
    try { return !!(adapter && adapter.leggiRev) && adapter.leggiRev() !== revVista; }
    catch (e) { return false; }
  },
  // Scritture partite e non ancora arrivate (solo IndexedDB). Chiudere la
  // scheda adesso perderebbe l'ultima.
  scrittureInVolo() { return adapter.inVolo ? adapter.inVolo() : 0; },
  // Dove sta l'archivio: 'local' o 'indexeddb'.
  get archivio() { return adapter.name; },
  preparaArchivio(fabbrica) { return preparaArchivio(fabbrica); },
  // La contabilità che serve solo a un backend condiviso: vedi modoCondiviso.
  // La accende chi sincronizza; in locale resta spenta.
  get modoCondiviso() { return modoCondiviso; },
  set modoCondiviso(v) { modoCondiviso = !!v; _childFp = null; },
  // Il prossimo commit() scrive anche se un'altra scheda ha modificato
  // l'archivio: lo chiama chi ha letto l'avviso e ha scelto di tenere la
  // propria versione. Vale una volta sola, di proposito — una scelta fatta su
  // un conflitto non si estende a quelli che verranno.
  forzaProssimaScrittura() { forzaScrittura = true; },
  // La revisione dell'archivio vista da questa scheda, per i test e per la
  // diagnostica. Non serve alle viste.
  revisione() { return revVista; },
  // Dimensione del database persistito, per far vedere il limite arrivare.
  sizeInfo() {
    let bytes = 0;
    try { bytes = adapter.size(); } catch (e) { /* storage non leggibile */ }
    return { bytes, mb: bytes / 1024 / 1024 };
  },
  // ── Seam per il futuro adapter cloud ──
  // Sostituire questo oggetto è l'unico punto da cui passa la destinazione dei
  // dati: nessuna vista sa dove finiscono, e nessuna deve saperlo.
  get adapter() { return adapter; },
  set adapter(a) { adapter = a || LocalAdapter; },
  // Cosa non è ancora stato mandato al backend, e riallineamento dopo un invio
  // riuscito. In locale nessuno li chiama: il salvataggio riscrive tutto.
  pendingChanges() { return pendingChanges(); },
  hasPendingChanges() { return hasPendingChanges(); },
  // Da preferire a pendingChanges() quando si sta per inviare: prende il conto
  // e la fotografia nello stesso istante. Vedi il commento su takeChanges().
  takeChanges() { return takeChanges(); },
  markSynced(mark) { markSynced(mark); },
  schema() { return SCHEMA; },
  reset() {
    db = JSON.parse(JSON.stringify(defaultDB));
    migrateDB();
    markUnknown();
    this.commit();
  },
  // Svuota il database: nessun dato di esempio, nessuna anagrafica, nessuna
  // impostazione. migrateDB() ricostruisce lo scheletro e semina famiglie e
  // U.M. predefinite: qui si torna a svuotarle e si alzano i flag di seed,
  // altrimenti il seed una-tantum ripopolerebbe subito il db appena azzerato.
  // L'autore delle modifiche (createdBy/updatedBy). null = nessuna sessione.
  setActor(id) { actorId = id || null; },
  getActor() { return actorId; },
  // keepUser: l'utente che sta azzerando, ricreato come admin — chi svuota il
  // database non deve restare chiuso fuori dalla propria app.
  clearAll(keepUser) {
    db = { settings: {}, schemaVersion: SCHEMA_VERSION };
    COLLECTIONS.forEach(c => { db[c] = []; });
    if (keepUser) {
      db.users.push(stampNew(Object.assign({}, keepUser, { role: 'admin', active: true })));
    }
    migrateDB();
    db.families = [];
    db.settings.uoms = [];
    db.settings.uomDefault = '';
    db.settings.concepts = [];
    db.settings.mpFamiliesSeeded = true;
    db.settings.partFamiliesSeeded = true;
    markUnknown();
    this.commit();
  },
  getAll(coll) { return db[coll] || []; },
  getById(coll, id) { return (db[coll] || []).find(r => r.id === id); },
  // insert/remove salvano subito, uno alla volta: sono il gesto singolo
  // dell'utente ("crea fornitore", "elimina piano"). Chi inserisce in blocco —
  // l'import massivo, la generazione dei documenti da un piano — continua a
  // scrivere su `db` e a salvare una volta sola alla fine: passare di qui
  // significherebbe un salvataggio per riga, e su cinquemila righe è un'altra
  // cosa. Quelle mutazioni non restano scoperte: pendingChanges() le vede
  // comunque, perché confronta lo stato, non le chiamate.
  insert(coll, rec) {
    if (rec.id == null) rec.id = newId();
    stampNew(rec);
    if (!Array.isArray(db[coll])) db[coll] = [];
    db[coll].push(rec);
    this.commit();
    return rec;
  },
  update(coll, id, patch) {
    const rec = this.getById(coll, id);
    if (!rec) return null;
    Object.assign(rec, patch);
    touch(rec);
    this.commit();
    return rec;
  },
  // Eliminare non butta: sposta nel cestino. La riga esce dalla collezione — e
  // quindi da indici, elenchi e conti, che restano ignari — ma il record intero
  // resta da parte per TRASH_DAYS giorni.
  //
  // È volutamente un'altra collezione e non un flag `deleted` sul record: un
  // flag obbligherebbe *ogni* lettura del database a ricordarsi di escluderlo, e
  // chi se ne dimenticasse farebbe ricomparire un articolo cancellato in una
  // distinta. Qui non c'è niente da ricordarsi.
  remove(coll, id) {
    const arr = db[coll] || [];
    const i = arr.findIndex(r => r.id === id);
    if (i < 0) return false;
    const rec = arr[i];
    arr.splice(i, 1);
    if (!Array.isArray(db.trash)) db.trash = [];
    lastTrashId = newId();
    db.trash.push({ id: lastTrashId, coll, deletedAt: nowISO(), deletedBy: actorId || null, record: rec });
    this.commit();
    return true;
  },
  // La voce di cestino appena creata, per l'«Annulla» del toast. Serve un
  // riferimento esplicito: cercare «l'ultima per data» non basta, due
  // eliminazioni nello stesso millisecondo hanno la stessa data.
  lastRemoved() { return lastTrashId; },
  rifiutoRipristino() { return rifiuto; },
  // Rimette il record dov'era. Best effort: se nel frattempo qualcosa che
  // citava è sparito, torna comunque — meglio un riferimento da sistemare che
  // un dato perso.
  //
  // Tranne quando il suo numero o il suo codice è già di un altro: si elimina
  // solo l'ultimo della serie, e il suo numero torna subito in uso. Rimetterlo
  // darebbe due ODA-2026-002, e niente nel database lo impedisce. Allora resta
  // nel cestino e `rifiutoRipristino()` dice perché.
  restore(trashId) {
    rifiuto = '';
    const i = (db.trash || []).findIndex(t => t.id === trashId);
    if (i < 0) return null;
    const t = db.trash[i];
    if (!Array.isArray(db[t.coll])) db[t.coll] = [];
    const doppio = numeroGiaDato(t.coll, t.record);
    if (doppio) { rifiuto = doppio; return null; }
    // Se un record con lo stesso id è tornato nel frattempo (import, ripristino
    // doppio), non si duplica: vince quello vivo.
    //
    // Il touch non è cosmesi: in cloud l'eliminazione lascia un tombstone, e un
    // record che rientra con l'updatedAt che aveva *prima* di essere eliminato è
    // più vecchio del tombstone — il pull successivo lo ricancellerebbe. Il
    // ripristino è un fatto nuovo e va datato come tale.
    if (!db[t.coll].some(r => r.id === t.record.id)) db[t.coll].push(touch(t.record));
    // E non basta, se l'orologio di questo PC è indietro: la data nuova può
    // essere ancora prima della lapide. L'archivio condiviso allora dice al
    // server che è un ripristino (cloud.js, dalla 0.105.4).
    if (typeof onRipristino === 'function') onRipristino(t.coll, t.record.id);
    db.trash.splice(i, 1);
    this.commit();
    return t;
  },
  purge(trashId) {
    const i = (db.trash || []).findIndex(t => t.id === trashId);
    if (i < 0) return false;
    db.trash.splice(i, 1);
    this.commit();
    return true;
  },
  emptyTrash() { db.trash = []; this.commit(); },
  trashList() { return (db.trash || []).slice().sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt))); },
  getSettings() { return db.settings; },
  setSettings(patch) { Object.assign(db.settings, patch); this.commit(); },
  exportSnapshot() { return JSON.stringify(db, null, 2); },
  // ── Per l'archivio condiviso (cloud.js, dalla 0.103.0) ──
  // La fotografia dell'ultimo invio riuscito, in una forma che si salva: senza,
  // chiudere la finestra con una modifica non ancora partita la perderebbe —
  // al riavvio il caricamento rifotografa l'adesso e la modifica non risulta
  // più da mandare. `null` = nessuna fotografia.
  // Altre chiavi accanto all'archivio, dove c'è IndexedDB (dalla 0.105.5):
  // `salvaExtra` torna false se qui non c'è, e chi chiama resta dov'era.
  salvaExtra(k, v) { return !!(adapter && adapter.scriviExtra && adapter.scriviExtra(k, v)); },
  leggiExtra(k) { return adapter && adapter.leggiExtra ? adapter.leggiExtra(k) : undefined; },
  baseSalvabile() {
    if (!_baseIds) return null;
    const ids = {}, children = {};
    _baseIds.forEach((m, c) => { ids[c] = Object.fromEntries(m); });
    if (_baseChildren) _baseChildren.forEach((m, k) => { children[k] = Object.fromEntries(m); });
    return { ids, children: _baseChildren ? children : null, settings: _baseSettings };
  },
  // L'inverso. Una fotografia vuota ({}) dice «il server non ha visto niente
  // di questo archivio»: tutto risulta da mandare, e niente da cancellare.
  ripristinaBase(b) {
    const o = b || {};
    const ids = new Map();
    COLLECTIONS.forEach(c => { ids.set(c, new Map(Object.entries((o.ids || {})[c] || {}))); });
    const children = new Map();
    Object.keys(o.children || {}).forEach(k => { children.set(k, new Map(Object.entries(o.children[k]))); });
    _baseIds = ids; _baseChildren = children; _baseSettings = o.settings == null ? '' : o.settings;
  },
  // Le modifiche che arrivano dal server: si applicano a `db` e si salvano in
  // locale, ma **non** sono modifiche di questo PC e non vanno rimandate.
  // Due cose da evitare: che stampChildRows() le scambi per righe modificate e
  // le dati con l'adesso (vincerebbero a torto al prossimo invio), e che il
  // conto delle modifiche le veda. Si chiama solo senza modifiche in sospeso:
  // la fotografia finale le dà tutte per inviate.
  applicaRemoto(fn) {
    // `fn` dice quante cose sono cambiate: con zero non c'è niente da salvare,
    // e un salvataggio a vuoto farebbe credere alle altre schede di essere
    // rimaste indietro.
    if (fn(db) === 0) return true;
    // I ricevuti delle righe arrivate si ricalcolano dagli eventi: il campo è
    // derivato, e dal server torna senza.
    if (modoCondiviso) riallineaRicevuti(false);
    _childFp = null;
    _storicoDaRemoto = true;
    let ok;
    try { ok = this.commit(); } finally { _storicoDaRemoto = false; }
    markSynced();
    controllaAnelliDopoArrivo();
    return ok;
  },
  // Un archivio intero che arriva dal server sostituisce quello locale (il
  // primo collegamento di un PC). Come un ripristino, ma la fotografia è
  // quella giusta: quello che c'è adesso è esattamente ciò che il server ha.
  sostituisciDaRemoto(nuovo) {
    const prima = db;
    db = nuovo;
    try { migrateDB(); }
    catch (e) { db = prima; throw e; }
    _childFp = null;
    _storicoBase = null;   // il registro riparte da qui: non è «tutto nuovo, a nome mio»
    const ok = this.commit();
    markSynced();
    controllaAnelliDopoArrivo();
    return ok;
  },
  // Chi vuole sapere che un salvataggio è andato a buon fine: l'archivio
  // condiviso ci aggancia l'invio. Una funzione sola, di proposito.
  dopoCommit: null,
  // Il record era già nella fotografia dell'ultimo invio? Un padre nuovo
  // manda tutte le sue righe; uno già noto solo quelle cambiate.
  inBase(coll, id) { return !!(_baseIds && _baseIds.get(coll) && _baseIds.get(coll).has(id)); },
  // La versione da cui è partita la modifica: l'updatedAt del record nella
  // fotografia (la firma lo porta in testa). Il server la confronta con la
  // sua, per non lasciar passare una modifica fatta su una copia vecchia.
  baseUpdatedAt(coll, id) {
    const m = _baseIds && _baseIds.get(coll);
    const firma = m && m.get(id);
    return firma ? String(firma).split('|')[0] || null : null;
  },
  // Le righe figlie del record com'erano nella fotografia (dalla 0.105.6):
  // id della riga → il suo updatedAt ('' se non l'aveva). La firma le porta
  // dopo la data del padre, «|id:data» (recSignature). `null` se il record
  // nella fotografia non c'è. Gli id delle righe non hanno «:».
  baseFigli(coll, id) {
    const m = _baseIds && _baseIds.get(coll);
    const firma = m && m.get(id);
    if (firma == null) return null;
    const out = new Map();
    String(firma).split('|').slice(1).forEach(p => {
      const i = p.indexOf(':');
      if (i > 0) out.set(p.slice(0, i), p.slice(i + 1));
    });
    return out;
  },
  // Toglie dalla fotografia un record o una riga figlia: la sua cancellazione
  // non risulta più da mandare. Serve quando il server la rifiuta (un collega
  // lo usa ancora) e il record deve tornare dal server.
  dimenticaInBase(coll, id, figlio) {
    if (figlio) { const m = _baseChildren && _baseChildren.get(coll + '|' + figlio); if (m) m.delete(id); return; }
    const m = _baseIds && _baseIds.get(coll);
    if (m) m.delete(id);
    // E le sue righe: senza padre nella fotografia risulterebbero tolte una
    // per una, e il server le cancellerebbe al record che resta.
    if (_baseChildren) _baseChildren.forEach((righe, k) => {
      if (k.split('|')[0] !== coll) return;
      righe.forEach((padre, r) => { if (padre === id) righe.delete(r); });
    });
  },
  // ── Una coda d'invio che il server rifiuta (dalla 0.105.6) ──
  // Le impostazioni come erano all'ultimo invio o all'ultima ricezione: la
  // base per fondere quelle di due amministratori. `null` se non si sa.
  baseImpostazioni() {
    if (!_baseSettings) return null;
    try { const o = JSON.parse(_baseSettings); return o && typeof o === 'object' ? o : null; } catch (e) { return null; }
  },
  // Il padre di una riga figlia nella fotografia: le righe tolte non ci sono
  // più in `db`, e solo lì si sa di chi erano.
  padreInBase(coll, figlio, id) {
    const m = _baseChildren && _baseChildren.get(coll + '|' + figlio);
    return m ? m.get(id) : undefined;
  },
  // Dalla fotografia `mark` di takeChanges() prende solo i record scelti
  // ({ coll: [id] }, e `settings: true`): un invio a pezzi segna come partito
  // solo il pezzo che il server ha preso. Gli altri restano da mandare.
  assorbi(mark, scelti) {
    if (!mark || !mark.ids || !_baseIds) return;
    Object.keys(scelti || {}).forEach(c => {
      if (c === 'settings') { if (scelti.settings) _baseSettings = mark.settings; return; }
      const ids = new Set(scelti[c] || []);
      if (!ids.size) return;
      const da = mark.ids.get(c) || new Map();
      if (!_baseIds.has(c)) _baseIds.set(c, new Map());
      const a = _baseIds.get(c);
      ids.forEach(id => { if (da.has(id)) a.set(id, da.get(id)); else a.delete(id); });
      if (!_baseChildren || !mark.children) return;
      mark.children.forEach((righe, k) => {
        if (k.split('|')[0] !== c) return;
        if (!_baseChildren.has(k)) _baseChildren.set(k, new Map());
        const b = _baseChildren.get(k);
        b.forEach((padre, r) => { if (ids.has(padre)) b.delete(r); });
        righe.forEach((padre, r) => { if (ids.has(padre)) b.set(r, padre); });
      });
    });
  },
  // Rimette i record scelti allo stato del server, per quanto questo PC ne sa:
  //  - un record nuovo, che il server non ha mai preso, se ne va;
  //  - uno modificato smette di risultare da mandare e perde le righe figlie
  //    aggiunte qui; il resto lo riporta la ricezione da capo che segue;
  //  - uno eliminato qui esce dalla fotografia, così la ricezione lo rimette,
  //    e lascia il cestino, dove sarebbe doppio.
  // Senza cestino e senza registro di nomi: non è un'eliminazione di chi
  // lavora, è una modifica che non è mai entrata.
  scartaModifiche(coll, ids) {
    if (!db || !_baseIds || !Array.isArray(db[coll])) return 0;
    stampChildRows();
    const base = _baseIds.get(coll) || new Map();
    const figli = childrenOf(coll);
    let n = 0;
    new Set(ids || []).forEach(id => {
      const i = db[coll].findIndex(r => r && r.id === id);
      if (i >= 0 && !base.has(id)) { db[coll].splice(i, 1); n++; return; }
      if (i >= 0) {
        const rec = db[coll][i];
        Object.keys(figli).forEach(k => {
          const rowId = figli[k].rowId;
          if (!rowId || !_baseChildren) return;
          const m = _baseChildren.get(coll + '|' + k) || new Map();
          if (Array.isArray(rec[k])) rec[k] = rec[k].filter(x => !x || x[rowId] == null || m.get(x[rowId]) === id);
          const ora = new Set((rec[k] || []).map(x => x && x[rowId]));
          m.forEach((padre, r) => { if (padre === id && !ora.has(r)) m.delete(r); });
        });
        base.set(id, recSignature(coll, rec));
        n++;
        return;
      }
      if (base.has(id)) {
        Store.dimenticaInBase(coll, id);
        if (Array.isArray(db.trash)) db.trash = db.trash.filter(t => !(t && t.coll === coll && t.record && t.record.id === id));
        n++;
      }
    });
    _baseIds.set(coll, base);
    // Le impronte delle righe e il registro ripartono da qui: niente date nuove
    // sulle righe, niente «eliminato» a nome di chi lavora.
    _childFp = null;
    storicoFotografa();
    this.commit();
    return n;
  },
  // Le impostazioni tornano com'erano all'ultimo invio riuscito.
  scartaImpostazioni() {
    const b = this.baseImpostazioni();
    if (!b || !db) return false;
    db.settings = b;
    storicoFotografa();
    this.commit();
    return true;
  },
  importSnapshot(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    const err = validateSnapshot(data);
    if (err) throw new Error(err);
    // Prima si migra, poi si sostituisce (dalla 0.105.3): un backup che passa
    // la validazione ma fa fallire la migrazione restava in memoria come
    // archivio, mentre l'app diceva «import non riuscito», e il primo
    // salvataggio qualsiasi lo scriveva sopra quello vero.
    const prima = db;
    db = data;
    try { migrateDB(); }
    catch (e) { db = prima; throw new Error('backup non importabile (' + (e && e.message || e) + ')'); }
    dbLoadError = null;   // da qui in memoria c'è un archivio vero (vedi backupAutoEsegui)
    markUnknown();
    this.commit();
  },
};

// Shim: i punti di mutazione esistenti nelle viste chiamano saveDB()
// Ritorna l'esito: false se i byte non sono arrivati nell'archivio. Chi
// annuncia «salvato» dovrebbe guardarlo — o usare savedToast(), che lo fa.
function saveDB() { return Store.commit(); }
