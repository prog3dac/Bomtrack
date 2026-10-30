// ═══════════════════════════════════════════════════════════
//  BOMTRACK — costing.js
// ═══════════════════════════════════════════════════════════
// Motore di costificazione: rollup ricorsivo, modi di calcolo delle parti,
// costo delle righe di ciclo, prezzo di vendita. Nessun DOM: è la parte che
// la suite di test verifica più a fondo.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  MOTORE DI COSTIFICAZIONE (rollup ricorsivo)
// ═══════════════════════════════════════════════════════════
// Ritorna i costi unitari (per 1 unità) suddivisi in categorie.
// material+purchased+labor+parts+overhead === total (= costo totale industriale).
const ZERO_COST = { material: 0, purchased: 0, labor: 0, parts: 0, overhead: 0, base: 0, total: 0, cycle: false };
function costOf(itemId, visited) {
  const it = getItem(itemId);
  if (!it) return { ...ZERO_COST };
  if (visited && visited.has(itemId)) return { ...ZERO_COST, cycle: true };
  // Un risultato senza anelli non dipende dal percorso di discesa: nessun
  // antenato è stato incontrato nel sottoalbero, quindi vale per qualunque
  // chiamante e si può riusare. Un risultato con cycle=true invece è troncato
  // proprio in funzione degli antenati: quello non va mai in cache.
  const hit = _costCache.get(itemId);
  if (hit) return hit;
  const res = computeCost(it, itemId, visited || new Set());
  // Congelato: i chiamanti ricevono lo stesso oggetto, una modifica accidentale
  // avvelenerebbe la cache invece di restare locale.
  if (!res.cycle) _costCache.set(itemId, Object.freeze(res));
  return res;
}
function computeCost(it, itemId, visited) {
  const zero = ZERO_COST;

  if (it.type === 'materiale') {
    const v = Number(it.unitCost) || 0;
    return { ...zero, material: v, base: v, total: v };
  }
  if (it.type === 'acquistato') {
    const v = Number(it.purchasePrice) || 0;
    return { ...zero, purchased: v, base: v, total: v };
  }
  if (it.type === 'parte') {
    // Da dove viene il costo lo dice l'approvvigionamento, e basta quello:
    // una parte comprata costa il prezzo del fornitore, una prodotta in casa
    // costa quello che serve per farla. Senza righe di ciclo non c'è niente da
    // calcolare, quindi anche lì resta il prezzo a listino.
    const prezzo = Number(it.unitCost) || 0;
    const righe = distintaRighe(it), fasi = cicloFasi(it);
    if (partSourcing(it) === 'buy' || !(righe.length || fasi.length)) {
      return { ...zero, parts: prezzo, base: prezzo, total: prezzo };
    }
    // Prodotta in casa: il costo è derivato e ogni riga confluisce nella propria
    // voce: materie prime → Materiale, commerciali → Commerciali, lavorazioni → Lavorazioni.
    // Dalla 0.125.0 il materiale viene dalla distinta della parte, le
    // lavorazioni dal ciclo.
    const next = new Set(visited); next.add(itemId);
    let material = 0, purchased = 0, labor = 0;
    const parts = 0;   // il prezzo a listino non concorre: qui la parte la facciamo noi
    // Accumulatore: raccoglie l'eventuale anello incontrato dalle righe del ciclo.
    // Senza, un troncamento da ricorsione passerebbe per un costo valido.
    const out = { cycle: false };
    fasi.forEach(row => { labor += cycleRowCost(row); });
    righe.forEach(row => {
      const rowCost = cycleRowCost(row, next, out);
      const ci = getItem(row.itemId);
      if (!ci) return;
      if (ci.type === 'materiale') material += rowCost;
      else if (ci.type === 'acquistato') purchased += rowCost;
      else labor += rowCost;   // tipo inatteso: non perdiamo il costo
    });
    const base = material + purchased + labor + parts;
    return { ...zero, material, purchased, labor, parts, base, total: base, cycle: out.cycle };
  }

  // assieme (macchina/gruppo/sottogruppo): somma figli + lavorazioni
  const next = new Set(visited); next.add(itemId);
  // Le righe condizionate di un modello configurabile (varianti.js) non
  // valgono finché non si sceglie: qui conta la parte comune.
  const righe = typeof varRigheComuni === 'function' ? varRigheComuni(it) : (it.components || []);
  return assiemeCost(it, righe, c => costOf(c.itemId, next));
}
// Il costo di un assieme date le sue righe e il costo di ciascun figlio. Una
// funzione a sé perché il configuratore (varianti.js) la usa con le righe
// risolte da una combinazione di scelte, senza creare articoli per saperlo.
function assiemeCost(it, righe, costoFiglio) {
  let material = 0, purchased = 0, labor = 0, parts = 0, childOverhead = 0, cycle = false;
  (righe || []).forEach(c => {
    const cc = costoFiglio(c);
    if (cc.cycle) cycle = true;
    const factor = (Number(c.qty) || 0) * (1 + (Number(c.scrapPct) || 0) / 100);
    material += cc.material * factor;
    purchased += cc.purchased * factor;
    labor += cc.labor * factor;
    parts += cc.parts * factor;
    childOverhead += cc.overhead * factor;
  });
  // Le fasi del ciclo dell'assieme (dalla 0.124.0), con lo stesso costo di
  // riga di una parte: fisso, o ore × tariffa; interne o in conto lavoro.
  cicloFasi(it).forEach(r => { labor += cycleRowCost(r); });
  const base = material + purchased + labor + parts;  // costo puro (figli a costo + manodopera)
  const ovPct = it.overheadPctOverride != null ? it.overheadPctOverride : (db.settings.overheadPct || 0);
  const ownOverhead = base * (Number(ovPct) || 0) / 100;
  const overhead = childOverhead + ownOverhead;
  const total = base + overhead;
  return { material, purchased, labor, parts, overhead, base, total, cycle };
}
// ─── Approvvigionamento di una parte (campo sourcing) ───
// Unica domanda da cui dipende tutto: la parte la facciamo o la compriamo?
// Da lì discendono sia il costo sia il fabbisogno, senza un secondo interruttore
// da tenere allineato a mano.
//   make → il costo lo determinano distinta della parte e ciclo; il fabbisogno scende
//          nella distinta e compra quello che serve per farla.
//   buy  → il costo è il prezzo scelto a listino; nel fabbisogno la parte è una
//          foglia d'acquisto come un commerciale, e la distinta non si esplode.
const PART_SOURCING = {
  make: 'Produzione interna',
  buy: 'Acquisto da fornitore',
};
// Proposto alle parti NUOVE (Gestione → Codifica articoli). Di serie è l'acquisto:
// nella maggior parte dei casi la parte la lavora un terzista, e chi la produce
// in casa è l'eccezione che si dichiara.
function defaultPartSourcing() {
  const d = db.settings && db.settings.partSourcingDefault;
  return PART_SOURCING[d] ? d : 'buy';
}
// Attenzione: qui il ripiego è 'make', non il default delle impostazioni. Una
// parte senza il campo è una parte di prima di questa funzione, e va lasciata
// com'era: cambiare l'impostazione deve valere per le prossime, non riscrivere
// il fabbisogno di quelle già a catalogo.
//
// Con la Produzione interna spenta (core.js, AREE) ogni parte si compra: costo
// di listino, niente ciclo, nel fabbisogno va negli acquisti. Il campo scritto
// sull'articolo non cambia — lo leggono partSourcingScritto(), la scheda e gli
// export, così riaccendendo l'area ogni parte torna com'era.
function partSourcingScritto(it) {
  return (it && PART_SOURCING[it.sourcing]) ? it.sourcing : 'make';
}
function partSourcing(it) {
  if (typeof areaAttiva === 'function' && !areaAttiva('produzione')) return 'buy';
  return partSourcingScritto(it);
}
function partSourcingOptions(sel) {
  return Object.entries(PART_SOURCING)
    .map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
}

// ─── Ciclo di lavorazione (articoli tipo "parte") ───
// `out` è un accumulatore opzionale: se il sottoalbero della riga contiene un
// anello, ci finisce dentro `out.cycle = true`. Serve a costOf per non spacciare
// per valido un costo troncato dalla ricorsione; i chiamanti dell'interfaccia
// possono ignorarlo.
// Costo calcolato di una riga articolo (q.tà × costo unitario, con lo scarto se la riga
// è di distinta), ignorando l'eventuale override.
function cycleRowComputed(row, visited, out) {
  if (!row || row.kind === 'op') return 0;
  const c = costOf(row.itemId, visited);
  if (out && c.cycle) out.cycle = true;
  return c.total * (Number(row.qty) || 0) * (1 + (Number(row.scrapPct) || 0) / 100);
}
// Costo effettivo della riga.
// Lavorazione: fisso di default (`cost`), oppure orario (`hours × rate`) se la
// riga lo dichiara — vedi wcRateFor per come si propone la tariffa.
// Articolo: override se valorizzato, altrimenti q.tà × costo unitario.
function cycleRowCost(row, visited, out) {
  if (!row) return 0;
  if (row.kind === 'op') {
    // A costo orario: la manodopera alla tariffa della fase, più la macchina
    // alla sua (modulo Macchine utensili, macchine.js) sulle ore di macchina.
    return row.costMode === 'orario'
      ? (Number(row.hours) || 0) * (Number(row.rate) || 0) + (typeof costoMacchinaFase === 'function' ? costoMacchinaFase(row) : 0)
      : (Number(row.cost) || 0);
  }
  // Con un override il costo non dipende più dal sottoalbero: niente da segnalare.
  if (row.costOverride != null && row.costOverride !== '') return Number(row.costOverride) || 0;
  return cycleRowComputed(row, visited, out);
}
// Il costo dell'attrezzaggio di una fase interna a costo orario (dalla
// 0.131.0): le sue ore alla tariffa della fase, più la macchina. Si paga una
// volta per lotto, quindi **non** sta nel costo per pezzo del ciclo — che non
// sa su quanti pezzi dividerlo — ma nel preventivo e nel consuntivo, dove il
// lotto c'è. A costo fisso il prezzo è quello scritto, attrezzaggio compreso.
function costoAttrezzaggio(r) {
  if (!r || r.supplierId || r.costMode !== 'orario') return 0;
  const ore = faseAttrezzaggio(r);
  if (!(ore > 0)) return 0;
  return ore * (Number(r.rate) || 0) + (typeof costoMacchinaOre === 'function' ? costoMacchinaOre(r, ore) : 0);
}
// Tariffa proposta per una riga a costo orario: quella del fornitore, se
// registrata sul centro di lavoro, altrimenti quella del centro di lavoro
// stesso. Solo una proposta iniziale — il campo resta modificabile a mano,
// come già l'override sulle righe articolo del ciclo.
function wcRateFor(wc, supplierId) {
  if (!wc) return 0;
  const s = supplierId && (wc.suppliers || []).find(x => x.supplierId === supplierId);
  return s ? (Number(s.rate) || 0) : (Number(wc.hourlyRate) || 0);
}

function sellingPrice(itemId) {
  const it = getItem(itemId);
  const c = costOf(itemId);
  const mgPct = it && it.marginPctOverride != null ? it.marginPctOverride : (db.settings.marginPct || 0);
  return c.total * (1 + (Number(mgPct) || 0) / 100);
}
