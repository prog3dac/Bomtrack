// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-prod.js
// ═══════════════════════════════════════════════════════════
// Gli **ordini di produzione (ODP)**: il documento che segue una parte lungo il
// suo ciclo di lavorazione.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
//
// ── Il buco che riempie ──
// Fino alla 0.73 l'app sapeva cosa serve (fabbisogno), cosa comprare (ODA),
// cosa far lavorare fuori (ODL) e cosa c'è a scaffale (magazzino). Non sapeva
// **a che punto è un pezzo**, e il manuale lo dichiarava come limite. Da lì
// discendevano tre cose che non tornavano:
//   1. una parte a ciclo **tutto interno** non aveva nessun documento: nessuno
//      la lanciava, il suo materiale non usciva mai dal magazzino e il pezzo
//      finito non entrava mai se non con un carico scritto a mano;
//   2. il magazzino si muoveva **solo** passando da un ODL, perché gli
//      ancoraggi erano gli estremi delle *tratte esterne*;
//   3. il fabbisogno non poteva nettare le lavorazioni, e lo diceva in pagina.
//
// ── La regola, in due righe ──
// **Il registro di magazzino racconta l'uscita e l'entrata dal magazzino;
// l'ordine di produzione racconta il viaggio.** Sono due libri diversi e non
// devono raccontarsi a vicenda.
//
// Ne discende la cosa che più distingue questo documento dal conto lavoro come
// era scritto prima: **fra le fasi non si registra niente**. Un movimento
// nomina una quantità di un **codice**, e fra la prima e l'ultima fase i pezzi
// non sono più il materiale e non sono ancora la parte — la parte lo diventano
// alla chiusura dell'ultima fase. Scrivere un movimento col codice parte prima
// di allora inventa una giacenza che non esiste.
//
// ── Le fasi hanno un id, non un indice ──
// È la differenza con `item_cycle_rows`, dove l'array *è* la definizione e la
// posizione è l'identità. Qui la fase porta un avanzamento: un'identità
// posizionale si sposterebbe sotto i piedi al primo riordino del ciclo, e
// l'avanzamento finirebbe sulla fase sbagliata. Congelando le fasi con un id
// proprio, riordinare il ciclo **non sposta niente** su un ordine già lanciato.
// `phaseKey` resta sulla fase, ma solo come **ponte verso il fabbisogno**, dove
// continua a valere con i limiti già dichiarati (vedi planDocumentedKeys).
//
// ── L'avanzamento è un registro, non un campo ──
// Come l'esistente si calcola da ricevimenti e movimenti, l'avanzamento si
// calcola dalle **dichiarazioni** (`db.prodDecls`). Nessun saldo scritto da
// qualche parte, quindi niente che possa divergere — è la stessa scelta che
// tiene in piedi il magazzino, applicata a un secondo numero.

// ═══════════════════════════════════════════════════════════
//  STATI
// ═══════════════════════════════════════════════════════════
// `'contract'` copre testata, quantità, fasi e materiale: congelati dopo il
// lancio. `'reception'` copre le dichiarazioni e i movimenti, che è proprio ciò
// che deve restare aperto dopo. Si riusano i livelli di blocco dei documenti
// (LOCK_KINDS, modeAllows, applyDocLock) senza entrare in DOC_KINDS: quel
// registro è tarato su «documento verso un fornitore» — intestatario, prezzo,
// ricevuto — e un ordine di produzione non è quello.
const ODP_STATUS = { bozza: 'Bozza', lanciato: 'Lanciato', corso: 'In corso',
  completato: 'Completato', chiuso: 'Chiuso', annullato: 'Annullato' };
const ODP_LOCK = { bozza: 'full', lanciato: 'reception', corso: 'reception',
  completato: 'reception', chiuso: 'none', annullato: 'none' };
// Gli stati in cui l'ordine è **vivo**: ha già preso il materiale e non ha
// ancora finito. Sono quelli che il prospetto del lavoro in corso guarda.
const ODP_APERTI = ['lanciato', 'corso'];

function getOdp(id) { return (db.prodOrders || []).find(o => o.id === id); }
// L'ordine monta un assieme (dalla 0.124.0) invece di fabbricare una parte.
function odpDiAssieme(o) { const it = o && getItem(o.itemId); return !!it && isAssembly(it.type); }
function odpMode(o) { return (o && odpUnlockedId === o.id) ? 'full' : ((o && ODP_LOCK[o.status]) || 'full'); }

// ═══════════════════════════════════════════════════════════
//  CONGELAMENTO: dal ciclo vivo alle fasi dell'ordine
// ═══════════════════════════════════════════════════════════
// Si congela **tutto quello che serve a leggere l'ordine senza il ciclo**: i
// nomi del centro e del terzista compresi. Un centro cancellato o un fornitore
// sospeso non devono rendere illeggibile un ordine in corso — è la stessa
// ragione per cui una riga di documento porta `code` e `description` invece di
// ripescarli dall'articolo.
function opFreezePhases(part) {
  const runs = clCycleRuns(part);
  const out = [];
  cicloFasi(part).forEach((r, k) => {
    const t = runs.find(x => k >= x.from && k <= x.to) || { from: k, to: k, passata: 0 };
    const wc = getWorkCenter(r.workCenterId);
    // La macchina (modulo Macchine utensili) si congela come il centro: con il
    // nome, e con la tariffa di oggi, perché è lei che costa.
    const mac = !r.supplierId && r.machineId ? getMachine(r.machineId) : null;
    out.push({
      id: newId(),
      seq: cyclePhaseNumber(k),
      opIndex: k,
      phaseKey: mrpPhaseKey(part.id, k, r.workCenterId),
      workCenterId: r.workCenterId || null,
      wcName: wc ? wc.name : '(centro mancante)',
      machineId: mac ? mac.id : null,
      machineName: mac ? machineLabel(mac) : '',
      machineRate: mac ? Number(mac.hourlyRate) || 0 : 0,
      supplierId: r.supplierId || null,
      supplierName: r.supplierId ? (supplierName(r.supplierId) || '') : '',
      runFrom: t.from, runTo: t.to, passata: t.passata || 0,
      costMode: r.costMode === 'orario' ? 'orario' : 'fisso',
      hours: Number(r.hours) || 0,
      operators: faseOperatori(r),
      days: Number(r.days) || 0,
      rate: Number(r.rate) || 0,
      cost: Number(r.cost) || 0,
      note: r.note || '',
    });
  });
  return out;
}
// Il materiale che l'ordine consuma: la distinta della parte per i pezzi
// lanciati. Congelarlo significa che una modifica alla distinta non riscrive
// retroattivamente quanto è già uscito dal magazzino.
// Con `planId` valgono le sostituzioni decise sul piano (alternativi.js): la
// quota di materiale passata all'alternativo si congela come alternativo.
// Di un assieme (dalla 0.124.0) sono i componenti diretti che stanno a
// magazzino, gli stessi che preleverebbe un montaggio dichiarato
// (montaggioComponenti, che le sostituzioni del piano le applica già): i
// sottoassiemi si montano ciascuno col suo ordine.
function opFreezeMaterials(part, qty, planId) {
  if (part && isAssembly(part.type)) {
    return montaggioComponenti(part, Number(qty) || 0, planId).stock.map(x => ({ id: newId(), itemId: x.item.id,
      code: x.item.code || '', name: x.item.name || '', uom: itemUom(x.item), perPezzo: x.perPezzo, qty: x.qty }));
  }
  let righe = clMaterialsOf(part, Number(qty) || 0).map(x => ({ itemId: x.item.id, perPezzo: x.perPezzo, qty: x.qty }));
  if (planId && typeof sostituzioniPrelievo === 'function') {
    const orig = new Map(righe.map(r => [r.itemId, r]));
    righe = sostituzioniPrelievo(planId, righe).map(r => {
      const o = orig.get(r.sostituisce || r.itemId);
      return Object.assign({}, r, { perPezzo: o && o.qty > 0 ? o.perPezzo * r.qty / o.qty : r.perPezzo });
    });
  }
  return righe.map(r => {
    const it = getItem(r.itemId);
    return { id: newId(), itemId: r.itemId, code: (it && it.code) || '', name: (it && it.name) || '',
      uom: itemUom(it), perPezzo: r.perPezzo, qty: r.qty };
  }).filter(r => r.code || r.name);
}

// ═══════════════════════════════════════════════════════════
//  LE DICHIARAZIONI, E LE QUANTITÀ CHE SE NE RICAVANO
// ═══════════════════════════════════════════════════════════
// Indice memoizzato `odpId#phaseId` → dichiarazioni in ordine di data. Stesso
// ciclo di vita degli altri indici: azzerato da invalidateCaches().
let _opDeclIdx = null;
let _opOdlIdx = null;
function invalidateProd() { _opDeclIdx = null; _opOdlIdx = null; _opOdlPianoIdx = null; _opMovIdx = null; _wipRows = null; _wipPer = null; _scortaParti = null; _bozzeIdx = null; }
function opDeclIndex() {
  if (_opDeclIdx) return _opDeclIdx;
  const map = new Map();
  (db.prodDecls || []).forEach((d, i) => {
    const k = String(d.odpId) + '#' + String(d.phaseId);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push({ d, i });
  });
  map.forEach(arr => arr.sort((a, b) => String(a.d.date || '').localeCompare(String(b.d.date || '')) || a.i - b.i));
  map.forEach((arr, k) => map.set(k, arr.map(x => x.d)));
  _opDeclIdx = map;
  return map;
}
function opDecls(odpId, phaseId) { return opDeclIndex().get(String(odpId) + '#' + String(phaseId)) || []; }
function opDeclsOf(odp) { return (db.prodDecls || []).filter(d => d.odpId === odp.id); }

function opPhaseAt(odp, i) { return (odp.phases || [])[i] || null; }
function opPhaseIndex(odp, fase) { return (odp.phases || []).findIndex(f => f.id === (fase && fase.id)); }
function opPrima(odp) { return opPhaseAt(odp, 0); }
function opUltima(odp) { const ph = odp.phases || []; return ph[ph.length - 1] || null; }
function opPrecedente(odp, fase) { const i = opPhaseIndex(odp, fase); return i > 0 ? opPhaseAt(odp, i - 1) : null; }
function opEPrima(odp, fase) { const p = opPrima(odp); return !!p && !!fase && p.id === fase.id; }
function opEUltima(odp, fase) { const u = opUltima(odp); return !!u && !!fase && u.id === fase.id; }

function opFatti(odp, fase) {
  return opDecls(odp.id, fase.id).reduce((s, d) => s + (d.kind === 'avanzamento' ? (Number(d.qty) || 0) : 0), 0);
}
function opScarti(odp, fase) {
  return opDecls(odp.id, fase.id).reduce((s, d) => s + (d.kind === 'avanzamento' ? (Number(d.scrap) || 0) : 0), 0);
}
function opProcessati(odp, fase) { return opFatti(odp, fase) + opScarti(odp, fase); }
// I pezzi che **entrano** in una fase sono i pezzi **buoni** usciti dalla
// precedente, non quelli lanciati: uno scarto alla 10 restringe la 20 e tutte
// le successive, e la quantità che finisce a magazzino può essere minore di
// quella lanciata. È un fatto, e va visto invece che nascosto.
function opDaFare(odp, fase) {
  const prec = opPrecedente(odp, fase);
  return prec ? opFatti(odp, prec) : (Number(odp.qty) || 0);
}
// I pezzi che una fase **riceverà**: i lanciati, meno gli scarti delle fasi
// prima; una fase prima già chiusa dà quelli che ha dato. È la quantità da
// commissionare a un terzista prima che le fasi precedenti abbiano finito
// (dalla 0.105.5: l'ordine di lavoro nasceva coi pezzi arrivati fin lì, anche zero).
function opAttesiFase(odp, fase) {
  let n = Number(odp.qty) || 0;
  const i = opPhaseIndex(odp, fase);
  for (let k = 0; k < i; k++) {
    const p = opPhaseAt(odp, k);
    n = opChiusa(odp, p) ? opFatti(odp, p) : Math.max(opFatti(odp, p), n - opScarti(odp, p));
  }
  return Math.max(n, opDaFare(odp, fase));
}
function opResidua(odp, fase) { return Math.max(0, opDaFare(odp, fase) - opProcessati(odp, fase)); }

function opAvviata(odp, fase) { return opDecls(odp.id, fase.id).some(d => d.kind === 'avvio'); }
function opForzata(odp, fase) { return opDecls(odp.id, fase.id).some(d => d.kind === 'forzatura'); }
// Chiusa per dichiarazione esplicita, oppure perché i pezzi dichiarati coprono
// quelli entrati. L'epsilon è lo stesso dei residui del conto lavoro: le
// quantità sono numeri in virgola mobile, e un confronto secco lascerebbe fasi
// «quasi chiuse» che bloccano la successiva per un miliardesimo.
//
// Una fase in cui non entra **nessun** pezzo buono è chiusa anche lei, se la
// precedente è chiusa (dalla 0.105.6): quando la 10 finisce tutta in scarti, o
// viene chiusa in difetto con zero buoni, alla 20 non arriverà mai niente.
// Prima restava «avviabile» con zero da fare e senza un comando per chiuderla,
// e l'ordine restava «in corso» — col suo materiale nel lavoro in corso — finché
// qualcuno non avviava e chiudeva a mano ogni fase vuota. La prima fase non
// cade qui: senza precedente, zero da fare è un ordine a zero, non un esito.
//
// Coperta dai pezzi non basta se la precedente è ancora aperta (dalla 0.116.0):
// le fasi di una stessa tratta dal terzista lavorano insieme, e 6 pezzi su 10
// tornati dalla 20 coprono i 6 usciti finora dalla 10, non la fase. Gli altri 4
// arriveranno, e la fase li deve ancora aspettare.
function opChiusa(odp, fase) {
  if (opDecls(odp.id, fase.id).some(d => d.kind === 'chiusura')) return true;
  const prec = opPrecedente(odp, fase);
  const daFare = opDaFare(odp, fase);
  if (!(daFare > 0.000001)) return !!prec && opChiusa(odp, prec);
  if (prec && !opChiusa(odp, prec)) return false;
  return opProcessati(odp, fase) >= daFare - 0.000001;
}
// Due fasi della stessa tratta: consecutive, dallo stesso terzista. Il pezzo
// non torna da noi fra l'una e l'altra.
function opStessaTratta(a, b) {
  return !!a && !!b && !!a.supplierId && a.supplierId === b.supplierId && a.runFrom === b.runFrom;
}
function opTutteChiuse(odp) { return (odp.phases || []).length > 0 && odp.phases.every(f => opChiusa(odp, f)); }
// La fase su cui il lavoro è fermo adesso: la prima non chiusa. Quando non ce
// n'è, l'ordine ha finito. È anche **il luogo dei pezzi**: la risposta alla
// domanda «dove sono?» non è un saldo di magazzino, è questa.
function opFaseCorrente(odp) { return (odp.phases || []).find(f => !opChiusa(odp, f)) || null; }

function opStatoFase(odp, fase) {
  if (opChiusa(odp, fase)) return 'chiusa';
  if (opAvviata(odp, fase)) return 'corso';
  return opAvviabile(odp, fase).ok ? 'avviabile' : 'attesa';
}
const ODP_FASE_LABELS = { attesa: 'In attesa', avviabile: 'Avviabile', corso: 'In corso', chiusa: 'Chiusa' };
// Una tratta dal terzista sull'ordine di produzione (dalla 0.113.0): partita
// con l'**avvio** della sua prima fase, che è quando il materiale esce; fatta
// quando l'ultima è **dichiarata** e chiusa, cioè i pezzi sono tornati.
//   '' · 'lavorazione' · 'fatto'
function odpAvanzamentoTratta(odp, fase) {
  const fasi = opRunFasi(odp, fase);
  if (!fasi.length) return '';
  if (fasi.every(f => opChiusa(odp, f))) return 'fatto';
  return fasi.some(f => opAvviata(odp, f)) ? 'lavorazione' : '';
}

// ═══════════════════════════════════════════════════════════
//  LA SUCCESSIONE
// ═══════════════════════════════════════════════════════════
// Il motivo del blocco si scrive **una volta sola**: lo usano sia il rifiuto
// del mutatore sia la conferma della forzatura. Due stringhe scritte a mano
// divergerebbero al primo ritocco, e chi legge la conferma non saprebbe più se
// sta forzando quello che l'app gli ha appena rifiutato.
function opMotivoBlocco(odp, fase) {
  const prec = opPrecedente(odp, fase);
  if (!prec) return '';
  return `la fase ${prec.seq} ${prec.wcName} non è chiusa: ${fmtQtyIt(opProcessati(odp, prec))} di ${fmtQtyIt(opDaFare(odp, prec))}`;
}
// → { ok: true } oppure { ok: false, motivo, fase: la fase che blocca }
function opAvviabile(odp, fase) {
  if (!odp || !fase) return { ok: false, motivo: 'fase non trovata' };
  if (odp.status === 'bozza') return { ok: false, motivo: "l'ordine è ancora in bozza: va lanciato" };
  if (odp.status === 'annullato' || odp.status === 'chiuso') return { ok: false, motivo: `l'ordine è ${(ODP_STATUS[odp.status] || '').toLowerCase()}` };
  if (opChiusa(odp, fase)) return { ok: false, motivo: 'la fase è già chiusa' };
  const prec = opPrecedente(odp, fase);
  // Dentro una tratta dal terzista la fase dopo parte appena è partita quella
  // prima (dalla 0.116.0): i pezzi passano dall'una all'altra presso di lui, e
  // i primi tornano finiti prima che arrivino gli ultimi.
  if (prec && !opChiusa(odp, prec) && !(opStessaTratta(prec, fase) && opAvviata(odp, prec))) {
    return { ok: false, motivo: opMotivoBlocco(odp, fase), fase: prec };
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════
//  STATO DELLA TESTATA, DEDOTTO
// ═══════════════════════════════════════════════════════════
// Come ordAutoStatus, non tocca mai `bozza` e `annullato`: quelli restano
// decisioni di chi scrive, e dedurli significherebbe riaprire da soli un ordine
// che qualcuno ha annullato.
function odpAutoStatus(odp) {
  if (!odp || odp.status === 'bozza' || odp.status === 'annullato' || odp.status === 'chiuso') return;
  if (opTutteChiuse(odp)) { odp.status = 'completato'; return; }
  const mosso = (odp.phases || []).some(f => opAvviata(odp, f) || opProcessati(odp, f) > 0);
  odp.status = mosso ? 'corso' : 'lanciato';
}

// ═══════════════════════════════════════════════════════════
//  IL MAGAZZINO: due movimenti soli, e il viaggio in mezzo
// ═══════════════════════════════════════════════════════════
//   avvio della PRIMA fase   → escono i **codici del ciclo**
//       fase interna  → `scarico`  (Consumo di produzione)
//       fase esterna  → `clOut`    (Uscita a conto lavoro, intestata al terzista)
//   fra le fasi              → **niente**: il luogo lo dice opFaseCorrente()
//   sull'ULTIMA fase         → entra il **codice parte**, per i pezzi buoni
//       fase interna  → `versamento` (Versamento di produzione)
//       fase esterna  → `clIn`       (Rientro da conto lavoro)
//
// Il carico avviene **a ogni dichiarazione** sull'ultima fase, non solo alla
// chiusura: dichiarare 40 pezzi buoni su 100 significa che quei 40 sono pronti,
// e tenerli fuori dal magazzino fino all'ultimo li renderebbe invisibili a chi
// li deve prendere. Alla chiusura la somma dei carichi è la resa della fase, che
// è esattamente ciò che la regola promette.
function opKindUscita(odp) { const f = opPrima(odp); return f && f.supplierId ? 'clOut' : 'scarico'; }
function opKindEntrata(odp) { const f = opUltima(odp); return f && f.supplierId ? 'clIn' : 'versamento'; }

// ─── Quanto è già stato registrato su questa fase, in questo verso ───
// Stessa forma di clRegistrato: il conto si legge dai movimenti, che l'ordine e
// la fase li portano già, senza nessun campo nuovo da tenere allineato.
// I movimenti per ordine, una volta per giro: opRegistrato si chiama per ogni
// ordine aperto, e prodWipRows per ogni articolo del magazzino — scorrere tutti
// i movimenti ogni volta faceva crescere il cruscotto col prodotto delle due
// cose (32 secondi su un archivio di 1.400 articoli e 330 ODP).
let _opMovIdx = null;
function opMovimentiDi(odpId) {
  if (!_opMovIdx) {
    _opMovIdx = new Map();
    (db.movements || []).forEach(x => {
      if (!x.orderId) return;
      let l = _opMovIdx.get(x.orderId);
      if (!l) { l = []; _opMovIdx.set(x.orderId, l); }
      l.push(x);
    });
  }
  return _opMovIdx.get(odpId) || [];
}
function opRegistrato(odp, fase, verso) {
  const m = new Map();
  const uscita = verso === 'out';
  opMovimentiDi(odp.id).forEach(x => {
    if (x.orderId !== odp.id || x.lineId !== (fase && fase.id) || !x.itemId) return;
    const suo = uscita ? (x.kind === 'clOut' || x.kind === 'scarico') : (x.kind === 'clIn' || x.kind === 'versamento');
    if (!suo) return;
    m.set(x.itemId, (m.get(x.itemId) || 0) + Math.abs(Number(x.qty) || 0));
  });
  return m;
}
// Il materiale ancora da prelevare: il congelato meno quello già uscito.
function opMaterialeResiduo(odp) {
  const gia = opRegistrato(odp, opPrima(odp), 'out');
  return (odp.materials || []).map(m => Object.assign({}, m,
    { gia: gia.get(m.itemId) || 0, residuo: Math.max(0, (Number(m.qty) || 0) - (gia.get(m.itemId) || 0)) }));
}
function opMaterialePrelevato(odp) { return opRegistrato(odp, opPrima(odp), 'out').size > 0; }
// Un assieme non ha giacenza (hasStock), e il suo versamento non scrive
// movimenti: i pezzi fatti sono i buoni dichiarati sull'ultima fase.
function opVersato(odp) {
  let n = 0;
  if (odpDiAssieme(odp)) {
    const f = opUltima(odp);
    return f ? opDecls(odp.id, f.id).filter(d => d.kind === 'avanzamento').reduce((s, d) => s + (Number(d.qty) || 0), 0) : 0;
  }
  opMovimentiDi(odp.id).forEach(x => {
    if (x.orderId !== odp.id || x.itemId !== odp.itemId) return;
    if (x.kind === 'clIn' || x.kind === 'versamento') n += Number(x.qty) || 0;
  });
  return n;
}

// ─── Dove sono i pezzi, se fra le fasi non si scrive niente ───
// Il lavoro in corso non è un saldo di magazzino: è una lettura degli ordini
// aperti. Per ciascuno, il materiale uscito e non ancora richiuso sta **dove
// dice la fase corrente** — presso il suo terzista, o in casa fra due fasi.
//
// Il **codice parte non compare mai** qui: finché l'ultima fase non ha versato,
// la parte non esiste, e nominarla significherebbe mostrare una giacenza che
// non c'è. È la ragione per cui questo prospetto esiste al posto di un
// movimento fra le fasi.
// Calcolato una volta per giro (invalidateProd): lo chiedono atSupplierOf e
// inWorkOf per ogni articolo. Chi lo legge non lo modifica.
let _wipRows = null, _wipPer = null;
function prodWipRows() {
  if (_wipRows) return _wipRows;
  const out = [];
  (db.prodOrders || []).forEach(o => {
    if (o.active === false || !ODP_APERTI.includes(o.status)) return;
    const fase = opFaseCorrente(o); if (!fase) return;
    const gia = opRegistrato(o, opPrima(o), 'out');
    (o.materials || []).forEach(m => {
      const uscito = gia.get(m.itemId) || 0;
      if (!(uscito > 0)) return;
      const it = getItem(m.itemId); if (!it) return;
      out.push({ luogo: fase.supplierId || CL_WIP, item: it, qty: uscito, odp: o, fase });
    });
  });
  _wipRows = out;
  return out;
}
// Per articolo: { fuori, casa, perLuogo }.
function _prodWipDi(itemId) {
  if (!_wipPer) {
    _wipPer = new Map();
    prodWipRows().forEach(r => {
      let e = _wipPer.get(r.item.id);
      if (!e) { e = { fuori: 0, casa: 0, perLuogo: new Map() }; _wipPer.set(r.item.id, e); }
      if (r.luogo === CL_WIP) e.casa += r.qty; else e.fuori += r.qty;
      e.perLuogo.set(r.luogo, (e.perLuogo.get(r.luogo) || 0) + r.qty);
    });
  }
  return _wipPer.get(itemId) || { fuori: 0, casa: 0, perLuogo: new Map() };
}
function prodWipAt(luogo, itemId) { return _prodWipDi(itemId).perLuogo.get(luogo) || 0; }
function prodWipOf(itemId) { return _prodWipDi(itemId).fuori; }
function prodWipInCasa(itemId) { return _prodWipDi(itemId).casa; }
// I movimenti di un ordine di produzione escono dal conto per coppia
// (luogo, articolo) di clIndex(): là un `clOut` senza un `clIn` dello stesso
// codice resterebbe per sempre presso il terzista, e su una trasformazione —
// grezzo fuori, parte dentro — il conto per codice non tornerebbe mai. La
// risposta per gli ordini di produzione c'è intera, e viene da prodWipRows().
function opMovimentoDiOdp(m) {
  return !!(m && m.orderId && (db.prodOrders || []).some(o => o.id === m.orderId));
}

// ═══════════════════════════════════════════════════════════
//  I MUTATORI
// ═══════════════════════════════════════════════════════════
// Il blocco vive **qui**, non nell'interfaccia: la vista si limita a non
// disegnare un comando che non si può dare, ma chi arrivasse comunque al
// mutatore — da un altro punto, da un vecchio `onclick`, dalla console — trova
// la stessa guardia. È la regola di docGuard, applicata a un documento che non
// sta in DOC_KINDS.
let odpUnlockedId = null;
function opGuard(id, lockKind) {
  if (!(lockKind === 'reception' ? roleGuardShop('docs') : roleGuard('docs'))) return false;
  const o = getOdp(id); if (!o) return false;
  if (modeAllows(odpMode(o), lockKind)) return true;
  showToast(`Ordine di produzione ${(ODP_STATUS[o.status] || o.status || '').toLowerCase()}: usa «Sblocca per modifica»`, 'error');
  return false;
}
function opDecl(odp, fase, kind, extra) {
  return Store.insert('prodDecls', Object.assign({
    id: gid(), odpId: odp.id, phaseId: fase ? fase.id : null, odlId: null, odlLineId: null, kind,
    date: nowISO(), qty: 0, scrap: 0, note: '', motivo: '',
  }, extra || {}));
}

// ─── Lancio: da qui in poi fasi e materiale non si toccano più ───
function opLancia(id) {
  if (!opGuard(id, 'contract')) return false;
  const o = getOdp(id); if (!o) return false;
  if (!(o.phases || []).length) { showToast('Questo ordine non ha fasi: il ciclo della parte è vuoto', 'error'); return false; }
  if (!(Number(o.qty) > 0)) { showToast('Quantità a zero: non c\'è niente da produrre', 'error'); return false; }
  o.status = 'lanciato';
  opRilevaOdl(o);
  odpAutoStatus(o); touch(o); saveDB();
  return true;
}

// ─── Avvio di una fase ───
// `opz.forza` salta il blocco della successione, e non è gratis: pretende un
// motivo, e lo scrive nello storico come dichiarazione a sé. Una forzatura non
// è un permesso speso e dimenticato — resta scritta accanto alla fase.
// `opz.materiali` sono le quantità da prelevare, e valgono **solo sulla prima
// fase**: è lì che il materiale esce, una volta sola.
function opAvvia(id, faseId, opz) {
  if (!opGuard(id, 'reception')) return false;
  const o = getOdp(id); if (!o) return false;
  const fase = (o.phases || []).find(f => f.id === faseId); if (!fase) return false;
  const opzioni = opz || {};
  // Un ordine di lavoro del piano partito da solo, prima di questo ordine, ha
  // già fatto uscire il materiale: si prende in carico prima di guardare.
  if (opRilevaOdl(o)) { odpAutoStatus(o); touch(o); saveDB(); }
  const ok = opAvviabile(o, fase);
  if (!ok.ok) {
    if (!opzioni.forza || !ok.fase) { showToast(`Non si può avviare la fase ${fase.seq}: ${ok.motivo}`, 'error'); return false; }
    const motivo = String(opzioni.motivo || '').trim();
    if (!motivo) { showToast('Per forzare l\'avvio serve il motivo', 'error'); return false; }
    opDecl(o, fase, 'forzatura', { motivo, note: ok.motivo });
  }
  if (opAvviata(o, fase)) { showToast(`La fase ${fase.seq} è già avviata`, 'error'); return false; }
  // L'avvio e i suoi prelievi hanno id che nascono dall'ordine e dalla fase
  // (dalla 0.105.3): nell'archivio condiviso due colleghi che avviano la stessa
  // fase prima di essersi visti scrivono lo stesso avvio e lo stesso prelievo,
  // invece di far uscire il materiale due volte.
  const avvio = opDecl(o, fase, 'avvio', { id: idDaChiaveLibero(`avvio|${o.id}|${fase.id}`, 'prodDecls'),
    note: String(opzioni.note || '').trim() });
  // Il materiale esce **all'avvio della prima fase**, e solo lì: è il primo dei
  // due estremi del ciclo. Le fasi successive non muovono il magazzino, e non
  // per pigrizia — fra le fasi i pezzi non hanno un codice che li nomini.
  // I prelievi portano il `declId` dell'avvio (dalla 0.105.6): così annullare un
  // avvio sbagliato rimette a scaffale proprio il materiale che ha fatto uscire.
  if (opEPrima(o, fase)) opPrelevaMateriale(o, opzioni.materiali, opzioni.note, `avvio|${avvio.id}`, avvio.id);
  odpAutoStatus(o); touch(o); saveDB();
  return true;
}
// `righe` è [{ itemId, qty }]; senza, si preleva il residuo congelato.
// `chiave`, quando c'è, fa nascere gli id dei movimenti da lei (vedi opAvvia).
// `declId`, quando c'è, è la dichiarazione che ha fatto uscire il materiale.
function opPrelevaMateriale(o, righe, note, chiave, declId) {
  const kind = opKindUscita(o);
  const fase = opPrima(o);
  const lista = righe && righe.length ? righe
    : opMaterialeResiduo(o).map(m => ({ itemId: m.itemId, qty: m.residuo }));
  let n = 0;
  lista.forEach((r, i) => {
    const q = Number(r.qty) || 0;
    if (!(q > 0)) return;                   // una riga a zero non è un movimento
    const extra = { orderId: o.id, lineId: fase ? fase.id : null, declId: declId || null };
    if (chiave) extra.id = idDaChiaveLibero(`${chiave}|${i}|${r.itemId}`, 'movements');
    if (kind === 'clOut') extra.supplierId = fase.supplierId;
    if (addMovement(r.itemId, kind, -q, note || `Materiale per ${o.number}`, extra)) n++;
  });
  return n;
}

// ─── Il resto del materiale (dalla 0.105.4) ───
// All'avvio della prima fase si può prelevare meno del previsto (lo scaffale
// non bastava, il resto arriva dopo). Il residuo restava lì senza un comando
// per farlo uscire: solo un movimento a mano, scollegato dall'ordine.
// `righe` [{ itemId, qty }]; senza, tutto il residuo.
function opPrelevaResto(id, righe, note) {
  if (!opGuard(id, 'reception')) return false;
  const o = getOdp(id); if (!o) return false;
  const prima = opPrima(o);
  if (!prima || !opAvviata(o, prima)) { showToast('La prima fase non è avviata: il materiale esce con il suo avvio', 'error'); return false; }
  const lista = (righe || opMaterialeResiduo(o).map(m => ({ itemId: m.itemId, qty: m.residuo })))
    .filter(r => (Number(r.qty) || 0) > 0);
  if (!lista.length) { showToast('Non c\'è materiale da prelevare', 'error'); return false; }
  const n = opPrelevaMateriale(o, lista, note);
  touch(o); saveDB();
  return n;
}
function opPuoPrelevareResto(o) {
  const prima = opPrima(o);
  return !!prima && ['lanciato', 'corso', 'completato'].includes(o.status) && opAvviata(o, prima)
    && opMaterialeResiduo(o).some(m => m.residuo > 0.000001);
}

// ─── Dichiarazione di avanzamento ───
// Pezzi buoni e scarti. Sull'**ultima** fase i pezzi buoni entrano a magazzino
// col codice della parte: è l'altro estremo del ciclo, ed è il solo momento in
// cui quel codice ha diritto di esistere come giacenza.
function opDichiara(id, faseId, dati) {
  if (!opGuard(id, 'reception')) return false;
  const o = getOdp(id); if (!o) return false;
  const fase = (o.phases || []).find(f => f.id === faseId); if (!fase) return false;
  if (!opAvviata(o, fase)) { showToast(`La fase ${fase.seq} non è stata avviata`, 'error'); return false; }
  const d = dati || {};
  const qty = Math.max(0, Number(d.qty) || 0);
  const scrap = Math.max(0, Number(d.scrap) || 0);
  if (!(qty > 0) && !(scrap > 0)) { showToast('Niente da dichiarare: pezzi e scarti sono a zero', 'error'); return false; }
  const decl = opDecl(o, fase, 'avanzamento', { qty, scrap, note: String(d.note || '').trim() });
  if (opEUltima(o, fase) && qty > 0) {
    const extra = { orderId: o.id, lineId: fase.id, declId: decl.id };
    const kind = opKindEntrata(o);
    if (kind === 'clIn') extra.supplierId = fase.supplierId;
    addMovement(o.itemId, kind, qty, String(d.note || '').trim() || `Versamento da ${o.number}`, extra);
  }
  // Il rientro dichiarato qui è lo stesso fatto che l'ordine di lavoro chiama
  // «rientrati»: scriverlo in due posti a mano significherebbe tenerli
  // d'accordo a mano. Il padrone è questo, l'ODL lo rispecchia.
  opSyncOdlReceived(o, fase);
  odpAutoStatus(o); touch(o); saveDB();
  return true;
}
// Chiusura in difetto: i pezzi che mancano **non proseguono**, e va detto.
function opChiudiFase(id, faseId, note) {
  if (!opGuard(id, 'reception')) return false;
  const o = getOdp(id); if (!o) return false;
  const fase = (o.phases || []).find(f => f.id === faseId); if (!fase) return false;
  if (opChiusa(o, fase)) return false;
  opDecl(o, fase, 'chiusura', { note: String(note || '').trim() });
  odpAutoStatus(o); touch(o); saveDB();
  return true;
}
// Riapribile solo se nessuna fase successiva è partita: riaprire sotto una fase
// già avviata cambierebbe i pezzi entrati in quella, a lavoro già cominciato.
function opRiapriFase(id, faseId) {
  if (!opGuard(id, 'reception')) return false;
  const o = getOdp(id); if (!o) return false;
  const i = (o.phases || []).findIndex(f => f.id === faseId);
  if (i < 0) return false;
  const seguente = opPhaseAt(o, i + 1);
  if (seguente && opAvviata(o, seguente)) {
    showToast(`La fase ${seguente.seq} è già avviata: va riaperta prima quella`, 'error');
    return false;
  }
  const chiusure = opDecls(o.id, faseId).filter(d => d.kind === 'chiusura');
  if (!chiusure.length && opChiusa(o, o.phases[i])) {
    showToast(opDaFare(o, o.phases[i]) > 0.000001
      ? 'La fase è chiusa perché i pezzi la coprono: per riaprirla annulla una dichiarazione'
      : 'La fase è chiusa perché non le arriva nessun pezzo buono: va riaperta una fase prima', 'error');
    return false;
  }
  chiusure.forEach(d => Store.remove('prodDecls', d.id));
  odpAutoStatus(o); touch(o); saveDB();
  return true;
}
// Annullare una dichiarazione toglie **i suoi** movimenti, non quelli della
// fase: è per questo che ogni movimento porta il `declId` di chi l'ha generato.
//
// Le stesse regole di opRiapriFase (dalla 0.105.6): una dichiarazione si
// annulla solo se la fase dopo non è partita. Togliere un avanzamento della 10
// a 20 già lavorata lasciava la 20 con zero da fare e dieci fatti, mai chiusa,
// e l'ordine di nuovo «in corso» coi pezzi ormai a magazzino.
// Un **avvio** si annulla finché la sua fase non ha dichiarazioni: è il rimedio
// a una fase avviata per sbaglio, e sulla prima fase rimette a scaffale il
// materiale uscito con lui (il resto prelevato dopo resta uscito).
function opDichiarazioneAnnullabile(o, d) {
  if (!o || !d || (d.kind !== 'avanzamento' && d.kind !== 'avvio')) return { ok: false, motivo: 'questa dichiarazione non si annulla' };
  const fase = (o.phases || []).find(f => f.id === d.phaseId);
  if (!fase) return { ok: true };
  const seguente = opPhaseAt(o, opPhaseIndex(o, fase) + 1);
  if (seguente && opAvviata(o, seguente)) return { ok: false, motivo: `la fase ${seguente.seq} è già avviata: annulla prima le sue dichiarazioni` };
  if (d.kind === 'avvio' && opDecls(o.id, fase.id).some(x => x.kind === 'avanzamento' || x.kind === 'chiusura')) {
    return { ok: false, motivo: `la fase ${fase.seq} ha già delle dichiarazioni: annulla prima quelle` };
  }
  return { ok: true };
}
function opAnnullaDichiarazione(declId) {
  if (!roleGuardShop('docs')) return false;
  const d = (db.prodDecls || []).find(x => x.id === declId); if (!d) return false;
  if (!opGuard(d.odpId, 'reception')) return false;
  const o = getOdp(d.odpId);
  const ok = opDichiarazioneAnnullabile(o, d);
  if (o && !ok.ok) { showToast(`Non si può annullare: ${ok.motivo}`, 'error'); return false; }
  (db.movements || []).filter(m => m.declId === declId).forEach(m => Store.remove('movements', m.id));
  Store.remove('prodDecls', declId);
  if (o) { const fase = (o.phases || []).find(f => f.id === d.phaseId); if (fase) opSyncOdlReceived(o, fase); odpAutoStatus(o); touch(o); }
  saveDB();
  return true;
}

// ═══════════════════════════════════════════════════════════
//  IL LEGAME CON L'ORDINE DI LAVORO
// ═══════════════════════════════════════════════════════════
// L'ordine di produzione dice **cosa va fatto e in che ordine**; l'ordine di
// lavoro è il documento che commissiona una di quelle fasi a un terzista. Il
// legame non è un campo sulla fase — sarebbe un secondo posto da tenere
// allineato — ma un indice sulle righe degli ODL, che quel legame lo portano
// già: `odpId` e `odpPhaseId`.
function opOdlIndex() {
  if (_opOdlIdx) return _opOdlIdx;
  const map = new Map();
  // Un ordine di lavoro annullato non commissiona più niente: la tratta si
  // può commissionare di nuovo, e i rientri non si scrivono su di lui.
  (db.workOrders || []).forEach(o => o.status !== 'annullato' && (o.lines || []).forEach(l => {
    if (l.odpPhaseId) map.set(l.odpPhaseId, { odl: o, line: l });
  }));
  _opOdlIdx = map;
  return map;
}
function opOdlDi(fase) { return fase ? (opOdlIndex().get(fase.id) || null) : null; }
// ── L'ordine di lavoro generato dal fabbisogno (dalla 0.105.8) ──
// Dal piano gli ordini di lavoro si generano anche **prima** dell'ordine di
// produzione: la riga porta allora le `phaseKeys` della tratta e il `planId`
// della testata, non `odpPhaseId`. L'ordine di produzione nato dopo dallo
// stesso piano non la vedeva, e offriva «genera ordine di lavoro» sulla stessa
// tratta: un secondo ordine allo stesso terzista per gli stessi pezzi.
// Una riga così copre la tratta del **primo** ordine di produzione del piano
// che ha quella fase (non annullato): un ODP rilanciato dopo, per i pezzi che
// mancano, resta libero di commissionare i suoi.
//
// Dalla 0.116.0 il legame non serve più solo a dire «già commissionata»: una
// volta lanciato l'ordine di produzione, è lui il padrone di quella tratta. Sulla
// riga dell'ordine di lavoro avvia e dichiara chiamano le sue fasi, e i pezzi
// rientrati li scrive lui (opSyncOdlReceived) — prima ciascuno dei due poteva
// far uscire lo stesso materiale.
let _opOdlPianoIdx = null;
function opOdlPianoCostruisci() {
  if (_opOdlPianoIdx && _opOdlPianoIdx.db === db) return _opOdlPianoIdx;
  const map = new Map();
  const perRiga = new Map();
  const odpPerChiave = new Map();
  (db.prodOrders || []).filter(o => o.planId && o.status !== 'annullato')
    .slice().sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
      || String(a.number || '').localeCompare(String(b.number || ''), 'it', { numeric: true }))
    .forEach(o => (o.phases || []).forEach(f => {
      const k = o.planId + '|' + f.phaseKey;
      if (f.phaseKey && !odpPerChiave.has(k)) odpPerChiave.set(k, o.id);
    }));
  (db.workOrders || []).forEach(w => w.status !== 'annullato' && w.planId && (w.lines || []).forEach(l => {
    if (l.odpPhaseId) return;
    const chiavi = String(l.phaseKeys || l.phaseKey || '').split(',').filter(Boolean);
    chiavi.forEach(c => {
      const k = w.planId + '|' + c;
      const odpId = odpPerChiave.get(k);
      if (odpId && !map.has(odpId + '|' + c)) {
        map.set(odpId + '|' + c, { odl: w, line: l, dalPiano: true });
        if (!perRiga.has(l.id)) perRiga.set(l.id, odpId);
      }
    });
  }));
  _opOdlPianoIdx = { db, map, perRiga };
  return _opOdlPianoIdx;
}
function opOdlPianoIndex() { return opOdlPianoCostruisci().map; }
function opOdlDalPiano(odp, fase) {
  return (odp && fase && fase.phaseKey) ? (opOdlPianoIndex().get(odp.id + '|' + fase.phaseKey) || null) : null;
}
// ── Il verso opposto: dalla riga dell'ordine di lavoro alle fasi dell'ODP ──
// → { odp, fasi, dalPiano } oppure null. `fasi` sono le fasi della tratta che la
// riga commissiona, in ordine di ciclo: avviare la riga è avviare la prima,
// dichiararla è far avanzare tutte.
function opLegameRigaOdl(odl, l) {
  if (!odl || !l) return null;
  if (l.odpId) {
    const odp = getOdp(l.odpId);
    const f = odp && (odp.phases || []).find(x => x.id === l.odpPhaseId);
    return f ? { odp, fasi: opRunFasi(odp, f), dalPiano: false } : null;
  }
  if (!odl.planId || odl.status === 'annullato') return null;
  const odpId = opOdlPianoCostruisci().perRiga.get(l.id);
  const odp = odpId ? getOdp(odpId) : null;
  if (!odp) return null;
  const fasi = (odp.phases || []).filter(f => {
    const legame = opOdlDalPiano(odp, f);
    return !!legame && legame.line === l;
  });
  return fasi.length ? { odp, fasi, dalPiano: true } : null;
}
// Tutte le fasi della **tratta** cui la fase appartiene: è la tratta che diventa
// una riga di ordine di lavoro, non la singola fase. Fasi consecutive dello
// stesso terzista sono una lavorazione da commissionare, non due.
function opRunFasi(odp, fase) {
  return (odp.phases || []).filter(f => f.supplierId === fase.supplierId && f.runFrom === fase.runFrom);
}
function opApreTratta(odp, fase) {
  const fasi = opRunFasi(odp, fase);
  return !!fasi.length && fasi[0].id === fase.id;
}
// Una fase esterna che apre la sua tratta e non è ancora commissionata.
function opGenerabile(odp, fase) {
  return !!fase.supplierId && opApreTratta(odp, fase)
    && !opRunFasi(odp, fase).some(f => opOdlDi(f) || opOdlDalPiano(odp, f));
}
// `received` sulla riga di ordine di lavoro significa **pezzi tornati**, e da
// quando esiste l'ordine di produzione quel fatto lo dichiara lui. Il campo
// resta quello di sempre, con gli stessi lettori — orderReception,
// ordAutoStatus, l'elenco, gli export: cambia solo chi lo scrive.
//
// Tornati sono i buoni dell'ultima fase **più gli scarti** di tutta la tratta
// (dalla 0.116.0): 8 buoni e 2 scarti su 10 sono 10 pezzi che il terzista non
// ha più, e l'ordine di lavoro è evaso, non parziale per sempre.
// La riga generata dal piano (`dalPiano`) non ha `odpId`: il suo ricevuto è
// una somma di eventi, e si cambia passando di lì (registraRicevuto).
function opSyncOdlReceived(odp, fase) {
  // Il legame sta sulla prima fase della tratta (`odpPhaseId`), ma i pezzi
  // tornano dall'ultima: si cerca su tutta la tratta.
  const legame = opRunFasi(odp, fase).map(f => opOdlDi(f) || opOdlDalPiano(odp, f)).find(Boolean); if (!legame) return;
  const leg = opLegameRigaOdl(legame.odl, legame.line);
  const tutte = leg ? leg.fasi : opRunFasi(odp, fase);
  // La riga copre la tratta intera: i pezzi tornati sono quelli usciti
  // dall'**ultima** fase della tratta, non la somma delle fasi — sono
  // lavorazioni sullo stesso pezzo, non pezzi diversi.
  const ultima = tutte[tutte.length - 1] || fase;
  const scarti = tutte.reduce((t, f) => t + opScarti(odp, f), 0);
  const n = Math.min(opFatti(odp, ultima) + scarti, Number(legame.line.qty) || 0);
  if (legame.line.received === n) return;
  if (legame.dalPiano) registraRicevuto('workOrders', legame.odl, legame.line, n);
  else legame.line.received = n;
  if (typeof ordAutoStatus === 'function') ordAutoStatus(legame.odl);
  touch(legame.odl);
}
// ── La presa in carico (dalla 0.116.0) ──
// Un ordine di lavoro del piano può partire **prima** che nasca, o che si
// lanci, l'ordine di produzione dello stesso piano: il materiale è uscito con
// l'avvio della riga, e magari qualche pezzo è già tornato. Quando l'ODP entra
// in gioco, quegli eventi diventano suoi — non si riscrivono, si spostano: la
// stessa dichiarazione e gli stessi movimenti, intestati alle sue fasi. Così il
// materiale non esce una seconda volta e l'avanzamento non riparte da zero.
// Torna true se ha preso in carico qualcosa.
function opRilevaOdl(o) {
  if (!o || o.status === 'bozza' || o.status === 'annullato' || typeof odlEventiRiga !== 'function') return false;
  let fatto = false;
  const viste = new Set();
  (o.phases || []).forEach(f => {
    const legame = opOdlDalPiano(o, f);
    if (!legame || viste.has(legame.line.id)) return;
    viste.add(legame.line.id);
    const { odl, line } = legame;
    const leg = opLegameRigaOdl(odl, line);
    if (!leg || leg.odp !== o || !leg.fasi.length || !odlHaEventiPropri(odl, line)) return;
    const eventi = odlEventiRiga(odl, line, { conVecchi: true });
    const fasi = leg.fasi, prima = fasi[0], ultima = fasi[fasi.length - 1];
    eventi.forEach(e => {
      if (e.kind === 'avvio') {
        if (opAvviata(o, prima)) return;
        const prec = opPrecedente(o, prima);
        if (prec && !opChiusa(o, prec) && !(opStessaTratta(prec, prima) && opAvviata(o, prec))) {
          opDecl(o, prima, 'forzatura', { motivo: `Avviata dall'ordine di lavoro ${odl.number || ''} prima del lancio`, note: opMotivoBlocco(o, prima) });
        }
        const avvio = e.vecchio ? opDecl(o, prima, 'avvio', { note: e.note || '' })
          : Store.update('prodDecls', e.id, { odpId: o.id, phaseId: prima.id, odlId: null, odlLineId: null });
        // Il materiale del ciclo conta come prelevato dalla **prima fase**
        // dell'ordine, che è dove opMaterialeResiduo lo cerca.
        const primaOdp = opPrima(o);
        (db.movements || []).filter(m => m.orderId === odl.id && m.lineId === line.id
          && (e.vecchio ? !m.declId : m.declId === e.id) && (m.kind === 'clOut' || (m.kind === 'clStep' && !m.fromSupplierId)))
          .forEach(m => Store.update('movements', m.id, { orderId: o.id, lineId: m.kind === 'clOut' ? primaOdp.id : prima.id, declId: avvio.id }));
        fasi.slice(1).forEach(x => { if (!opAvviata(o, x)) opDecl(o, x, 'avvio', { note: `Tratta avviata dall'ordine di lavoro ${odl.number || ''}` }); });
      } else {
        const qty = Number(e.qty) || 0, scrap = Number(e.scrap) || 0;
        fasi.slice(0, -1).forEach(x => opDecl(o, x, 'avanzamento', { qty: qty + scrap, note: e.note || '' }));
        const decl = e.vecchio ? opDecl(o, ultima, 'avanzamento', { qty, scrap, note: e.note || '' })
          : Store.update('prodDecls', e.id, { odpId: o.id, phaseId: ultima.id, odlId: null, odlLineId: null });
        (db.movements || []).filter(m => m.orderId === odl.id && m.lineId === line.id
          && (e.vecchio ? !m.declId : m.declId === e.id) && (m.kind === 'clIn' || (m.kind === 'clStep' && m.fromSupplierId)))
          .forEach(m => Store.update('movements', m.id, { orderId: o.id, lineId: ultima.id, declId: decl.id }));
      }
    });
    opSyncOdlReceived(o, ultima);
    fatto = true;
  });
  return fatto;
}

// ═══════════════════════════════════════════════════════════
//  VISTA: ORDINI DI PRODUZIONE
// ═══════════════════════════════════════════════════════════
// Stesso telaio delle altre viste a documento — l'elenco a destra, il documento
// al centro — perché è la stessa domanda: si sceglie un ordine e lo si lavora.
const odpFilters = { q: '', status: '', from: '', to: '' };
function odpFilterActive() { return !!(odpFilters.q || odpFilters.status || odpFilters.from || odpFilters.to); }
function odpFilterApply(list) {
  const q = odpFilters.q.trim().toLowerCase();
  return list.filter(o => {
    if (odpFilters.status && o.status !== odpFilters.status) return false;
    if (!inDateRange(o.date, odpFilters.from, odpFilters.to)) return false;
    if (!q) return true;
    return [o.number, o.title, o.code, o.name].some(x => String(x || '').toLowerCase().includes(q));
  });
}
function odpFilterChange() {
  odpFilters.q = val('odp-f-q'); odpFilters.status = val('odp-f-status');
  odpFilters.from = val('odp-f-from'); odpFilters.to = val('odp-f-to');
  renderOdp();
}
function odpFilterInput() { debounced('odpf', odpFilterChange); }
function odpFilterReset() { odpFilters.q = ''; odpFilters.status = ''; odpFilters.from = ''; odpFilters.to = ''; renderOdp(); }

function renderOdp() {
  const host = document.getElementById('view-odp'); if (!host) return;
  if (odpView === 'edit' && !getOdp(currentOdpId)) { odpView = 'list'; currentOdpId = null; }
  const o = odpView === 'edit' ? getOdp(currentOdpId) : null;
  const tutti = db.prodOrders || [];
  host.innerHTML = worklistHtml({
    titolo: 'Ordini di produzione', icona: 'factory', listaId: 'odp-list',
    comandi: `<button class="add-btn-sm" onclick="newOdpModal()">+ Nuovo ordine di produzione</button>
      ${listExportButtons('odpListExportSpec')}`,
    filtri: `<input type="text" class="search" id="odp-f-q" value="${esc(odpFilters.q)}" placeholder="Cerca numero, oggetto o parte..." oninput="odpFilterInput()">
      <select id="odp-f-status" onchange="odpFilterChange()">
        <option value="">Tutti gli stati</option>
        ${Object.entries(ODP_STATUS).map(([k, v]) => `<option value="${k}" ${odpFilters.status === k ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
      ${dateRangeFilter('odp-f', odpFilters.from, odpFilters.to, 'odpFilterChange()', 'ordine')}
      <span class="doc-filter-count">${worklistCount(odpFilterApply(tutti).length, tutti.length, 'ordine', 'ordini')}</span>
      ${odpFilterActive() ? '<button class="btn-outline" onclick="odpFilterReset()">✕ Azzera filtri</button>' : ''}`,
    righe: odpListRows(),
    doc: o ? renderOdpEdit(currentOdpId) : '',
    vuoto: {
      titolo: 'Nessun ordine di produzione aperto qui',
      testo: 'Scegli un ordine dall\'elenco a destra. Gli ordini di produzione nascono dal <strong>Fabbisogno</strong>, dalle parti da fabbricare, oppure si scrivono a mano: al centro compaiono le fasi del ciclo in successione, con l\'avanzamento e i due punti in cui il magazzino si muove.',
      comandi: '<button class="add-btn-sm" onclick="newOdpModal()">+ Nuovo ordine di produzione</button>',
    },
  });
  if (o) applyDocLock(odpMode(o), host);
  a11yFields(host);
}
function odpListRows() {
  const tutti = db.prodOrders || [];
  const list = odpFilterApply(tutti.slice().sort((a, b) => (b.number || '').localeCompare(a.number || '')));
  return list.map(o => {
    const fasi = (o.phases || []).length;
    const chiuse = (o.phases || []).filter(f => opChiusa(o, f)).length;
    const corrente = opFaseCorrente(o);
    return worklistRow({
      numero: o.number,
      badge: statusBadge(ODP_STATUS, o.status),
      titolo: `${o.code || ''} ${o.name || ''}`.trim() || o.title || '',
      meta: `${fmtQtyIt(o.qty)} ${esc(o.uom || 'pz')} · fasi ${chiuse}/${fasi}${corrente ? ' · ' + esc('alla ' + corrente.seq + ' ' + corrente.wcName) : ''}${o.dueDate ? ' · ' + esc(fmtDateIt(o.dueDate)) : ''}`,
      sel: odpView === 'edit' && currentOdpId === o.id,
      spenta: o.status === 'annullato' || o.status === 'chiuso',
      azione: `openOdpEdit('${o.id}')`,
      etichetta: `Apri l'ordine di produzione ${o.number}`,
    });
  }).join('') || `<div class="empty-text">${tutti.length ? 'Nessun ordine di produzione con questi filtri.' : 'Nessun ordine di produzione. Si generano dal Fabbisogno, dalle parti da fabbricare, oppure si scrivono a mano con «+ Nuovo ordine di produzione».'}</div>`;
}
function openOdpEdit(id) { if (!vistaAttiva('odp')) return; currentOdpId = id; odpView = 'edit'; odpUnlockedId = null; renderOdp(); }
function odpBackToList() { odpView = 'list'; currentOdpId = null; odpUnlockedId = null; renderOdp(); }
function odpUnlock(id) {
  const o = getOdp(id); if (!o) return;
  askConfirm(`L'ordine di produzione ${o.number} risulta ${(ODP_STATUS[o.status] || '').toLowerCase()}.\nSbloccarlo per modificarlo?`, () => {
    odpUnlockedId = id; renderOdp(); showToast('Ordine di produzione sbloccato');
  }, { title: 'Sblocca per modifica', ok: 'Sblocca', safe: true });
}
function odpSetField(id, field, value) {
  if (!opGuard(id, field === 'status' ? 'ops' : 'contract')) { renderOdp(); return; }
  const o = getOdp(id); if (!o) return;
  if (field === 'qty') {
    // Cambiare i pezzi dopo il lancio vorrebbe dire riscrivere il materiale già
    // uscito: si fa in bozza, dove il materiale non è ancora congelato per
    // nessuno. Ricongelarlo qui tiene le due cose d'accordo senza chiederlo.
    o.qty = Math.max(0, Number(value) || 0);
    const part = getItem(o.itemId);
    if (part && o.status === 'bozza') o.materials = opFreezeMaterials(part, o.qty, o.planId);
    if (o.status === 'bozza') odpPianifica(o);
  } else {
    o[field] = campoTesto(value) || (field === 'jobId' ? null : '');
    if (field === 'dueDate' && o.status === 'bozza') odpPianifica(o);
  }
  touch(o); saveDB(); renderOdp();
}
// La tendina dello stato non scrive il campo: passa dal comando (dalla
// 0.105.4). «Annullato» scritto a mano non chiedeva del materiale da rendere,
// «Lanciato» saltava i controlli del lancio, e «Bozza» su un ordine già
// avviato riapriva fasi e materiale sotto movimenti già registrati.
function odpCambiaStato(id, value) {
  const o = getOdp(id); if (!o) return;
  renderOdp();   // la tendina torna allo stato vero: lo cambia il comando, se passa
  if (!value || value === o.status) return;
  if (value === 'annullato') { odpAnnulla(id); return; }
  if (value === 'chiuso') { odpChiudi(id); return; }
  if (o.status === 'bozza') {
    if (value === 'lanciato') odpLancia(id);
    else showToast('Un ordine in bozza prima si lancia: «In corso» e «Completato» li dà l\'avanzamento delle fasi', 'error');
    return;
  }
  if (!opGuard(id, 'ops')) return;
  const dichiarato = opDeclsOf(o).length > 0;
  if (value === 'bozza') {
    if (dichiarato) { showToast('Su questo ordine ci sono già dichiarazioni: in bozza non torna. Si annulla, o si annullano prima le dichiarazioni', 'error'); return; }
    o.status = 'bozza'; touch(o); saveDB(); renderOdp(); showToast('Stato: Bozza');
    return;
  }
  // Lanciato, in corso, completato: li dà l'avanzamento. Da chiuso o annullato
  // si riapre, e lo stato è quello che le fasi dicono.
  o.status = 'lanciato'; odpAutoStatus(o); touch(o); saveDB(); renderOdp();
  if (o.status === value) showToast('Stato: ' + ODP_STATUS[value]);
  else showToast(`Stato: ${ODP_STATUS[o.status]}. Lo dà l'avanzamento delle fasi`, 'error');
}
function delOdp(id) {
  const o = getOdp(id); if (!o || !roleGuard('docs')) return;
  if (!guardiaDocumentoUltimo(o, db.prodOrders, 'Annullalo invece di eliminarlo.')) return;
  // Un ordine di lavoro nato da una sua fase si riceve solo dall'ODP: senza
  // l'ODP quella riga non si potrebbe più ricevere da nessuna parte.
  const odl = (db.workOrders || []).find(w => w.status !== 'annullato' && (w.lines || []).some(l => l.odpId === id));
  if (odl) { showToast(`L'ordine di lavoro ${odl.number || ''} ha righe di questo ordine di produzione: annullalo o eliminalo prima.`, 'error'); return; }
  const mov = (db.movements || []).filter(m => m.orderId === id).length;
  const avviso = mov ? `\n\n⚠ Ha ${mov} ${mov === 1 ? 'movimento' : 'movimenti'} di magazzino: eliminandolo la merce torna com'era prima.` : '';
  askConfirm(`Eliminare l'ordine di produzione ${o.number}?${avviso}`, () => eliminaSeAncoraUltimo(() => {
    const x = getOdp(id);
    return !!x && guardiaDocumentoUltimo(x, db.prodOrders, 'Annullalo invece di eliminarlo.');
  }, () => {
    // Dichiarazioni e movimenti se ne vanno con lui, e con lui tornano: un
    // «Annulla» che rimettesse solo la testata darebbe un ODP completato con le
    // fasi a zero e il magazzino senza i suoi movimenti.
    const voci = [];
    (db.prodDecls || []).filter(d => d.odpId === id).forEach(d => { if (Store.remove('prodDecls', d.id)) voci.push(Store.lastRemoved()); });
    (db.movements || []).filter(m => m.orderId === id).forEach(m => { if (Store.remove('movements', m.id)) voci.push(Store.lastRemoved()); });
    odpView = 'list'; currentOdpId = null;
    if (!Store.remove('prodOrders', id)) { renderOdp(); return; }
    const testa = Store.lastRemoved();
    renderOdp();
    toastEliminato(`Ordine di produzione ${o.number} eliminato`, () => {
      if (!Store.restore(testa)) { showToast(Store.rifiutoRipristino() || 'Non c\'è più niente da ripristinare', 'error'); return; }
      voci.forEach(v => Store.restore(v));
      renderOdp();
      showToast('Ripristinato');
    });
  }), { title: 'Elimina ordine di produzione', ok: 'Elimina' });
}

// ─── La scheda ───
// La tabella delle fasi è il cuore del documento: si legge dall'alto in basso
// come si esegue il ciclo, e i comandi compaiono **solo dove sono leciti**. Una
// fase bloccata non mostra un pulsante spento — dice *perché e da chi*, che è
// la stessa scelta già fatta per le righe di conto lavoro in mezzo a una
// tratta: l'assenza di un comando, da sola, somiglia a un difetto.
function renderOdpEdit(id) {
  const o = getOdp(id); if (!o) return '';
  const mode = odpMode(o);
  const part = getItem(o.itemId);
  const fasi = o.phases || [];
  const chiuse = fasi.filter(f => opChiusa(o, f)).length;
  const ultima = opUltima(o);
  const buoni = ultima ? opFatti(o, ultima) : 0;
  const scarti = fasi.reduce((s, f) => s + opScarti(o, f), 0);
  const esterno = fasi.reduce((s, f) => s + (f.supplierId ? (f.costMode === 'orario' ? f.hours * f.rate : f.cost) * (Number(o.qty) || 0) : 0), 0);
  const lockBanner = docLockBanner(mode, 'Ordine di produzione ' + (ODP_STATUS[o.status] || o.status).toLowerCase(), 'odp', id);
  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      <div class="bom-toolbar-left">
        ${worklistCloseBtn('odpBackToList()', "l'ordine di produzione")}
        <h2 class="section-title" style="font-family:var(--mono)">${esc(o.number)}</h2>
        ${statusBadge(ODP_STATUS, o.status)}
        ${ODP_APERTI.includes(o.status) || o.status === 'completato'
    ? `<button class="btn-outline" onclick="odpChiudi('${id}')" title="Chiude l'ordine: non si dichiara più niente">${ico('lock', 'tinted', '')} Chiudi</button>` : ''}
      </div>
      <div class="bom-toolbar-right">
        ${menuEsporta(`exportOdpExcel('${id}')`, `exportOdpPDF('${id}')`)}
        ${menuAltro([
          o.status !== 'annullato' ? { label: "Annulla l'ordine", icon: 'close', onclick: `odpAnnulla('${id}')` } : null,
          { label: "Elimina l'ordine di produzione", icon: 'trash', onclick: `delOdp('${id}')`, danger: true },
        ])}
      </div>
    </div>
    ${docStepperHtml('odp', o)}${docLinksHtml('odp', o)}
    ${lockBanner}
    <div class="modal-grid">
      <div class="modal-field"><label>${part && isAssembly(part.type) ? esc(typeLabel(part.type)) : 'Parte'}</label>
        <div class="odp-part">${part ? codeLink(part.id, part.code) : esc(o.code || '')} ${esc(o.name || '')}</div></div>
      <div class="modal-field"><label>Pezzi da produrre</label>
        <input type="number" class="num lock-contract" min="0" step="any" value="${esc(String(o.qty || 0))}" onchange="odpSetField('${id}','qty',this.value)"></div>
      <div class="modal-field"><label>Data</label>
        <input type="date" class="lock-contract" value="${esc((o.date || '').slice(0, 10))}" onchange="odpSetField('${id}','date',this.value)"></div>
      <div class="modal-field"><label>Serve per</label>
        <input type="date" class="lock-contract" value="${esc((o.dueDate || '').slice(0, 10))}" onchange="odpSetField('${id}','dueDate',this.value)"></div>
      <div class="modal-field"><label>Commessa</label>
        <select class="lock-contract" onchange="odpSetField('${id}','jobId',this.value)">${jobOptions(o.jobId || '')}</select></div>
      <div class="modal-field"><label>Stato</label>
        <select onchange="odpCambiaStato('${id}',this.value)">
          ${Object.entries(ODP_STATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Note</label>
        <input class="lock-contract" value="${esc(o.notes || '')}" onchange="odpSetField('${id}','notes',this.value)"></div>
      <div class="modal-field" style="grid-column:1/-1"><label>${ico('lock', 'tinted', '')} Note interne (non stampate)</label>
        <input class="notes-internal" value="${esc(o.notesInternal || '')}" onchange="odpSetField('${id}','notesInternal',this.value)"></div>
    </div>
    ${stampLine(o)}
    <div class="cost-summary">
      ${kpi('Pezzi lanciati', fmtQtyIt(o.qty), 'accent')}
      ${kpi('Buoni all\'ultima fase', fmtQtyIt(buoni), 'green')}
      ${kpi('Scarti', fmtQtyIt(scarti), scarti > 0 ? 'orange' : '')}
      ${kpi('Fasi chiuse', `${chiuse}/${fasi.length}`, 'purple')}
      ${esterno > 0 ? kpi('Lavorazioni esterne', fmtN(esterno), '') : ''}
    </div>
    ${typeof capOdpHtml === 'function' ? capOdpHtml(o) : ''}
    ${o.status === 'bozza' ? `<div class="rfq-warn">${ico('warning', 'tinted', '')} L'ordine è in <strong>bozza</strong>: quantità, date e fasi si possono ancora cambiare, e non si dichiara niente. <strong>Lancia</strong> per aprire la produzione — da lì fasi e materiale si congelano.</div>` : ''}
    <div class="mrp-section">
      <div class="cycle-section-head"><h3>${ico('wrench', 'tinted pill', '')} Le fasi, in successione</h3>
        ${o.status !== 'bozza' && o.dueDate ? `<button class="btn-outline" onclick="odpReplanAsk('${id}')" title="Ricalcola inizio e fine pianificati delle fasi non chiuse, a ritroso dalla data in cui l'ordine serve">${ico('refresh', 'tinted', '')} Ripianifica</button>` : ''}</div>
      <p class="empty-text" style="text-align:left;padding:0 0 8px">Una fase non si avvia finché la precedente non è chiusa, e <strong>solo i pezzi buoni proseguono</strong>: uno scarto alla prima fase restringe tutte quelle che seguono. Il magazzino si muove in <strong>due punti soli</strong> — escono i codici del ciclo all'avvio della prima fase, entra il codice della parte sull'ultima. In mezzo non si scrive niente: i pezzi non sono più il materiale e non sono ancora la parte, e <em>dove sono</em> lo dice questa tabella.</p>
      <div class="table-wrap"><table>
        <thead><tr>
          <th scope="col" style="width:60px">Fase</th>
          <th scope="col">Lavorazione</th>
          <th scope="col">Dove</th>
          <th scope="col" style="width:150px" title="Inizio e fine pianificati, a ritroso dalla data in cui l'ordine serve. Dopo il lancio stanno ferme: si ricalcolano con Ripianifica">Pianificata</th>
          <th scope="col" style="width:90px" title="I pezzi che entrano in questa fase: i buoni usciti dalla precedente">Da fare</th>
          <th scope="col" style="width:90px">Fatti</th>
          <th scope="col" style="width:90px">Scarti</th>
          <th scope="col" style="width:110px">Stato</th>
          <th scope="col">Comandi</th></tr></thead>
        <tbody>${odpPhaseRows(o)}</tbody></table></div>
    </div>
    ${odpMaterialBlock(o)}
    ${odpDeclBlock(o)}
    ${odpMovBlock(o)}
  </div>`;
}
function odpPhaseRows(o) {
  const id = o.id;
  return (o.phases || []).map(f => {
    const st = opStatoFase(o, f);
    const legame = opOdlDi(f) || opOdlDalPiano(o, f);
    const forzata = opForzata(o, f);
    return `<tr class="odp-fase odp-fase-${st}">
      <td><span class="cycle-phase">${esc(String(f.seq))}</span></td>
      <td>${esc(f.wcName)}${odpMachineCell(o, f)}${f.note ? ` <span class="empty-text" style="padding:0">${esc(f.note)}</span>` : ''}</td>
      <td>${f.supplierId
    ? `${ico('factory', 'tinted', '')} ${esc(f.supplierName || supplierName(f.supplierId) || '—')}`
    : '<span class="empty-text" style="padding:0">Interna</span>'}</td>
      <td style="white-space:nowrap">${odpPlannedCell(f, st)}</td>
      <td class="num">${fmtQtyIt(opDaFare(o, f))}</td>
      <td class="num">${fmtQtyIt(opFatti(o, f))}</td>
      <td class="num">${opScarti(o, f) > 0 ? `<span class="mrp-warn">${fmtQtyIt(opScarti(o, f))}</span>` : '—'}</td>
      <td>${statusBadge(ODP_FASE_LABELS, st)}${forzata ? ` <span class="mrp-warn" title="Avviata forzando la successione: il motivo è nello storico">${ico('warning', 'tinted', '')} forzata</span>` : ''}</td>
      <td>${odpPhaseActions(o, f, st, legame)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" class="empty-text">Questo ordine non ha fasi: il ciclo della parte è vuoto.</td></tr>';
}
function odpPlannedCell(f, st) {
  if (!f.plannedStart && !f.plannedEnd) return '<span class="empty-text" style="padding:0">—</span>';
  const tardi = st !== 'chiusa' && f.plannedEnd && f.plannedEnd < oggiISO();
  const da = fmtDateIt(f.plannedStart).slice(0, 5), a = fmtDateIt(f.plannedEnd).slice(0, 5);
  return `${tardi ? `<span class="mrp-warn" title="Doveva finire il ${esc(fmtDateIt(f.plannedEnd))}">${ico('warning', 'tinted', '')} ` : '<span>'}${esc(da === a ? a : da + ' → ' + a)}</span>`;
}
function odpPhaseActions(o, f, st, legame) {
  const id = o.id;
  const cmd = [];
  const link = (azione, testo, titolo) => `<span class="plandoc-link plandoc-link-sm" ${clickAttrs(azione, titolo)}>${esc(testo)}</span>`;
  if (st === 'avviabile') {
    cmd.push(link(`opAvviaModal('${id}','${f.id}')`, 'avvia',
      opEPrima(o, f) ? 'Avvia la fase e preleva il materiale del ciclo: esce dal magazzino'
        : 'Avvia la fase. Il magazzino non si muove: i pezzi sono già fuori dallo scaffale'));
  } else if (st === 'attesa') {
    const blocco = opAvviabile(o, f);
    // Dire cosa manca vale più di un pulsante spento: chi guarda vuole sapere
    // dove andare, non scoprire che qui non si può fare niente.
    cmd.push(`<span class="empty-text" style="padding:0" title="La successione delle fasi non si scavalca per sbaglio">${esc(blocco.motivo || 'non avviabile')}</span>`);
    if (blocco.fase) cmd.push(link(`opForzaModal('${id}','${f.id}')`, 'forza avvio', 'Avvia comunque, dichiarando il motivo: resta scritto nello storico'));
  } else if (st === 'corso') {
    cmd.push(link(`opDichiaraModal('${id}','${f.id}')`, 'dichiara',
      opEUltima(o, f) ? (odpDiAssieme(o) ? 'Dichiara gli assiemi montati e gli scarti: è la fine del montaggio' : 'Dichiara i pezzi buoni e gli scarti: i buoni entrano a magazzino col codice della parte')
        : 'Dichiara i pezzi buoni e gli scarti di questa fase'));
    cmd.push(link(`opChiudiModal('${id}','${f.id}')`, 'chiudi', 'Chiudi la fase anche se i pezzi non la coprono'));
  } else if (st === 'chiusa') {
    cmd.push(link(`opRiapriFaseAsk('${id}','${f.id}')`, 'riapri', 'Riapre la fase, se nessuna successiva è partita'));
  }
  if (legame) {
    cmd.push(`<span class="plandoc-link plandoc-link-sm" ${clickAttrs(`openOdlFromOdp('${legame.odl.id}')`, "Apri l'ordine di lavoro che commissiona questa fase")}>${esc(legame.odl.number)}</span>`);
  } else if (opGenerabile(o, f) && o.status !== 'bozza' && canWrite('docs')) {
    cmd.push(link(`opGeneraOdlAsk('${id}','${f.id}')`, 'genera ordine di lavoro',
      'Commissiona questa tratta al terzista: ne nasce un ordine di lavoro con la tariffa del ciclo'));
  }
  return `<div class="line-cl-actions">${cmd.join('')}</div>`;
}

function odpMaterialBlock(o) {
  const righe = opMaterialeResiduo(o);
  if (!righe.length) {
    return `<div class="mrp-section"><div class="cycle-section-head"><h3>${ico('package', 'tinted pill', '')} Materiale del ciclo</h3></div>
      <p class="empty-text" style="text-align:left">${odpDiAssieme(o) ? "Questo assieme non ha componenti diretti a magazzino: i suoi sottoassiemi si montano ciascuno col proprio ordine." : "Il ciclo di questa parte non ha materiale a magazzino: lo mette chi la lavora."} Non c'è niente da prelevare, e infatti non c'è niente da scaricare.</p></div>`;
  }
  const prima = opPrima(o);
  const resto = opPuoPrelevareResto(o) && canWriteShop('docs')
    ? `<button class="add-btn-sm" onclick="opPrelevaRestoModal('${esc(o.id)}')" title="Fa uscire il materiale non prelevato all'avvio">Preleva il resto</button>` : '';
  return `<div class="mrp-section">
    <div class="cycle-section-head"><h3>${ico('package', 'tinted pill', '')} Materiale del ciclo</h3>${resto}</div>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Esce <strong>una volta sola</strong>, all'avvio della fase ${prima ? esc(String(prima.seq)) : ''}${prima && prima.supplierId ? ` — e va da ${esc(prima.supplierName || '')}` : ''}. Le quantità vengono dal ciclo moltiplicate per i pezzi dell'ordine.</p>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Codice</th><th scope="col">Articolo</th><th scope="col" style="width:100px">Per pezzo</th>
        <th scope="col" style="width:100px">Previsto</th><th scope="col" style="width:100px">Uscito</th><th scope="col" style="width:100px">Residuo</th></tr></thead>
      <tbody>${righe.map(m => `<tr>
        <td>${codeLink(m.itemId, m.code)}</td><td>${esc(m.name)}</td>
        <td class="num">${fmtQtyIt(m.perPezzo)} ${esc(m.uom)}</td>
        <td class="num">${fmtQtyIt(m.qty)}</td>
        <td class="num">${fmtQtyIt(m.gia)}</td>
        <td class="num">${m.residuo > 0 ? fmtQtyIt(m.residuo) : '<span class="price-best">✓</span>'}</td></tr>`).join('')}</tbody>
    </table></div></div>`;
}
// Data e ora leggibili: una dichiarazione di produzione si distingue da
// un'altra per l'ora, non per il giorno.
function odpQuando(iso) { return String(iso || '').slice(0, 16).replace('T', ' '); }
function odpDeclBlock(o) {
  const decls = opDeclsOf(o).slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  if (!decls.length) return '';
  const nomeFase = pid => { const f = (o.phases || []).find(x => x.id === pid); return f ? `fase ${f.seq} ${f.wcName}` : '—'; };
  const etichetta = { avvio: 'Avvio', avanzamento: 'Avanzamento', forzatura: 'Forzatura', chiusura: 'Chiusura' };
  return `<div class="mrp-section">
    <div class="cycle-section-head"><h3>${ico('clock', 'tinted pill', '')} Storico delle dichiarazioni</h3></div>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col" style="width:150px">Quando</th><th scope="col">Fase</th><th scope="col" style="width:110px">Cosa</th>
        <th scope="col" style="width:80px">Pezzi</th><th scope="col" style="width:80px">Scarti</th><th scope="col">Nota</th>
        <th scope="col" style="width:60px"></th></tr></thead>
      <tbody>${decls.map(d => `<tr class="${d.kind === 'forzatura' ? 'odp-forzata' : ''}">
        <td>${esc(odpQuando(d.date))}</td>
        <td>${esc(nomeFase(d.phaseId))}</td>
        <td>${d.kind === 'forzatura' ? `<span class="mrp-warn">${ico('warning', 'tinted', '')} Forzatura</span>` : esc(etichetta[d.kind] || d.kind)}</td>
        <td class="num">${d.qty ? fmtQtyIt(d.qty) : '—'}</td>
        <td class="num">${d.scrap ? fmtQtyIt(d.scrap) : '—'}</td>
        <td>${d.kind === 'forzatura' ? `<strong>${esc(d.motivo || '')}</strong>${d.note ? ` <span class="empty-text" style="padding:0">(${esc(d.note)})</span>` : ''}` : esc(d.note || '')}</td>
        <td>${(d.kind === 'avanzamento' || d.kind === 'avvio') && opDichiarazioneAnnullabile(o, d).ok
    ? `<button class="mini-btn danger lock-reception" onclick="opAnnullaDichiarazioneAsk('${d.id}')" title="${d.kind === 'avvio'
      ? "Annulla l'avvio della fase e rimette a magazzino il materiale uscito con lui" : 'Annulla questa dichiarazione e i movimenti che ha generato'}">${ico('trash', 'tinted', 'Annulla')}</button>`
    : ''}</td></tr>`).join('')}</tbody>
    </table></div></div>`;
}
// I movimenti che questo ordine ha generato, tutti insieme: è la prova visibile
// che «una volta sola» ha retto, e il posto dove si vede che fra le fasi non si
// è scritto niente.
function odpMovBlock(o) {
  const mov = (db.movements || []).filter(m => m.orderId === o.id)
    .slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  if (!mov.length) return '';
  return `<div class="mrp-section">
    <div class="cycle-section-head"><h3>${ico('package', 'tinted pill', '')} Movimenti di magazzino generati</h3></div>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col" style="width:150px">Quando</th><th scope="col">Codice</th><th scope="col">Tipo</th>
        <th scope="col" style="width:100px">Quantità</th><th scope="col">Dove</th><th scope="col">Nota</th></tr></thead>
      <tbody>${mov.map(m => {
    const it = getItem(m.itemId);
    return `<tr>
        <td>${esc(odpQuando(m.date))}</td>
        <td>${it ? codeLink(it.id, it.code) : ''}</td>
        <td>${esc(MOVEMENT_KINDS[m.kind] || m.kind)}</td>
        <td class="num">${fmtQtyIt(m.qty)}</td>
        <td>${m.supplierId ? esc(supplierName(m.supplierId) || '') : '<span class="empty-text" style="padding:0">in casa</span>'}</td>
        <td>${esc(m.note || '')}</td></tr>`;
  }).join('')}</tbody>
    </table></div></div>`;
}

// ─── I comandi della testata ───
function odpLancia(id) { if (opLancia(id)) { renderOdp(); showToast('Ordine di produzione lanciato'); } else renderOdp(); }
function odpChiudi(id) {
  const o = getOdp(id); if (!o || !opGuard(id, 'ops')) return;
  askConfirm(`Chiudere l'ordine ${o.number}?\nNon si dichiarerà più niente su queste fasi.`, () => {
    o.status = 'chiuso'; touch(o); saveDB(); renderOdp(); showToast('Ordine chiuso');
  }, { title: 'Chiudi ordine di produzione', ok: 'Chiudi', safe: true });
}
function odpAnnulla(id) {
  const o = getOdp(id); if (!o || !opGuard(id, 'ops')) return;
  // Con materiale uscito si chiede quanto ne torna: senza, il materiale
  // spariva dal prospetto «in lavorazione» e andava ricaricato a mano.
  if (opResoProposto(o).length) { odpAnnullaModal(id); return; }
  askConfirm(`Annullare l'ordine ${o.number}?\nI movimenti già registrati restano: annullare non è cancellare.`, () => {
    o.status = 'annullato'; touch(o); saveDB(); renderOdp(); showToast('Ordine annullato');
  }, { title: 'Annulla ordine di produzione', ok: 'Annulla ordine' });
}
// ─── Il materiale che torna da un ordine annullato (dalla 0.100.0) ───
// Quello uscito all'avvio della prima fase, nella parte che **non è stata
// lavorata**: se la prima fase ha già lavorato 30 pezzi su 100, il materiale di
// quei 30 è diventato truciolo o semilavorato e non torna come materiale. La
// proposta è proporzionale ai pezzi non ancora passati dalla prima fase, e si
// corregge riga per riga: chi ha il materiale in mano sa quanto ne è rimasto.
//
// Da un terzista torna con un **rientro** (`clIn`, intestato a lui): così il
// prospetto «presso terzi» si azzera. Da casa con un **reso** di produzione.
function opResoProposto(o) {
  const prima = opPrima(o);
  if (!prima) return [];
  const uscito = opRegistrato(o, prima, 'out');
  if (!uscito.size) return [];
  // Già restituito con un reso precedente (un annullo riaperto e rifatto).
  const reso = new Map();
  opMovimentiDi(o.id).forEach(x => {
    if (x.orderId === o.id && x.lineId === prima.id && (x.kind === 'reso' || x.kind === 'clIn') && x.itemId !== o.itemId) {
      reso.set(x.itemId, (reso.get(x.itemId) || 0) + Math.abs(Number(x.qty) || 0));
    }
  });
  const pezzi = Number(o.qty) || 0;
  const quota = pezzi > 0 ? Math.max(0, 1 - opProcessati(o, prima) / pezzi) : 0;
  const out = [];
  uscito.forEach((q, itemId) => {
    const resto = Math.max(0, q - (reso.get(itemId) || 0));
    if (!(resto > 0.000001)) return;
    const it = getItem(itemId);
    out.push({ itemId, code: it ? it.code : '', name: it ? it.name : '', uom: it ? itemUom(it) : '',
      uscito: resto, proposto: +(resto * quota).toFixed(4) });
  });
  return out;
}
function odpAnnullaModal(id) {
  const o = getOdp(id); if (!o) return;
  const righe = opResoProposto(o);
  const prima = opPrima(o);
  window.__opReso = righe.map(r => r.itemId);
  const daTerzista = prima && prima.supplierId;
  openModal(`<h3>${ico('blocked', 'tinted pill', '')} Annulla ${esc(o.number)}</h3>
    <p>Dall'avvio della prima fase è uscito del materiale. Quanto ne torna ${daTerzista ? `da <strong>${esc(prima.supplierName || supplierName(prima.supplierId) || '')}</strong>` : 'a magazzino'}?</p>
    <div style="display:flex;flex-direction:column;gap:6px">${righe.map((r, i) => `<div class="mgmt-item">
      <span style="width:130px;font-family:var(--mono)">${esc(r.code)}</span>
      <span style="flex:1">${esc(r.name)} <span class="empty-text" style="padding:0">uscito ${fmtQtyIt(r.uscito)} ${esc(r.uom)}</span></span>
      <input class="num" type="number" id="op-r-${i}" min="0" step="any" value="${esc(String(r.proposto))}" style="width:110px" aria-label="Quantità di ${esc(r.code)} che torna">
      <span class="empty-text" style="padding:0;width:40px">${esc(r.uom)}</span>
    </div>`).join('')}</div>
    <p class="empty-text" style="text-align:left;padding:8px 0">La proposta è il materiale dei pezzi che la prima fase <strong>non ha ancora lavorato</strong> (${fmtQtyIt(opResidua(o, prima))} su ${fmtQtyIt(o.qty)}): quello dei pezzi già lavorati non è più materiale. ${daTerzista ? 'Torna con un <strong>rientro da conto lavoro</strong>, che azzera il prospetto presso il terzista.' : 'Torna con un <strong>reso da produzione</strong>.'} Lascia zero per non restituire niente.</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Non annullare</button>
      <button class="add-btn-sm" onclick="odpAnnullaSave('${esc(id)}')">Annulla l'ordine</button>
    </div>`, false, 'form');
}
// `righe` [{ itemId, qty }]: quanto torna, in positivo.
function opAnnullaConReso(id, righe, note) {
  if (!opGuard(id, 'ops')) return false;
  const o = getOdp(id); if (!o) return false;
  const prima = opPrima(o);
  const daTerzista = prima && prima.supplierId;
  let n = 0;
  (righe || []).forEach(r => {
    const q = Number(r.qty) || 0;
    if (!(q > 0) || !prima) return;
    const extra = { orderId: o.id, lineId: prima.id };
    if (daTerzista) extra.supplierId = prima.supplierId;
    if (addMovement(r.itemId, daTerzista ? 'clIn' : 'reso', q, note || `Reso da ${o.number} annullato`, extra)) n++;
  });
  o.status = 'annullato'; touch(o); saveDB();
  return n;
}
function odpAnnullaSave(id) {
  const righe = (window.__opReso || []).map((itemId, i) => ({ itemId, qty: Math.max(0, rawNum('op-r-' + i)) }));
  const n = opAnnullaConReso(id, righe);
  if (n === false) return;
  closeModal(); renderOdp();
  showToast(n ? `Ordine annullato, ${n === 1 ? '1 materiale tornato' : n + ' materiali tornati'} a magazzino` : 'Ordine annullato');
}

// ═══════════════════════════════════════════════════════════
//  LE SCHEDE DI AVANZAMENTO
// ═══════════════════════════════════════════════════════════
// Stessa grammatica delle schede del conto lavoro: si dice cosa si sta per
// registrare, si propone il **residuo**, e si spiega in chiaro se il gesto tocca
// il magazzino oppure no. Un comando che sembra un carico e non carica è il modo
// più rapido di far perdere fiducia in una giacenza.
// Le schede di avvio e di dichiarazione si aprono anche dalla riga di un ordine
// di lavoro (dalla 0.116.0): finito il gesto si ridisegna la vista da cui si è
// partiti, non sempre quella degli ordini di produzione.
function opRidisegna() {
  if (typeof activeView !== 'undefined' && activeView === 'reparto' && typeof renderReparto === 'function') renderReparto();
  else if (typeof activeView !== 'undefined' && activeView === 'odl' && typeof renderOdl === 'function') renderOdl();
  else renderOdp();
}
function opFaseDi(id, faseId) {
  const o = getOdp(id); if (!o) return null;
  const f = (o.phases || []).find(x => x.id === faseId);
  return f ? { o, f } : null;
}
function opTestaModal(o, f, titolo) {
  return `<h3>${ico('factory', 'tinted pill', '')} ${esc(titolo)}</h3>
    <p>${esc(o.number)} · <strong>${esc((o.code || '') + ' ' + (o.name || ''))}</strong> — fase ${esc(String(f.seq))} ${esc(f.wcName)}${f.supplierId ? ' · ' + esc(f.supplierName || '') : ''}</p>`;
}
function opAvviaModal(id, faseId) {
  const x = opFaseDi(id, faseId); if (!x) return;
  const { o, f } = x;
  if (!roleGuardShop('docs')) return;
  // Prima di proporre il materiale: se un ordine di lavoro del piano l'ha già
  // fatto uscire, la proposta deve saperlo.
  if (opRilevaOdl(o)) { odpAutoStatus(o); touch(o); saveDB(); }
  if (opAvviata(o, f)) { showToast(`La fase ${f.seq} è già avviata`, 'error'); opRidisegna(); return; }
  const prima = opEPrima(o, f);
  const righe = prima ? opMaterialeResiduo(o).filter(m => m.residuo > 0.000001) : [];
  window.__opAvviaMat = righe.map(m => m.itemId);
  const spiega = prima
    ? (f.supplierId
      ? 'Il materiale <strong>esce dal magazzino</strong> e va dal terzista: allo scaffale non c\'è più, e il prospetto <em>presso terzi</em> dice da chi sta. Esce <strong>una volta sola</strong>, qui.'
      : 'Il materiale <strong>esce dal magazzino</strong> come consumo di produzione. Esce <strong>una volta sola</strong>, qui.')
    : 'Questa fase <strong>non muove il magazzino</strong>: i pezzi sono già fuori dallo scaffale da quando è partita la prima fase, e non sono ancora la parte finita. Dove stanno lo dice questa tabella, non una giacenza.';
  const corpo = righe.map((m, i) => `<div class="mgmt-item">
      <span style="width:110px;font-family:var(--mono)">${esc(m.code)}</span>
      <span style="flex:1">${esc(m.name)} <span class="empty-text" style="padding:0">${fmtQtyIt(m.perPezzo)} ${esc(m.uom)}/pz${giacenzeVisibili() ? ` · a magazzino ${fmtQtyIt(onHandOf(m.itemId))}` : ''}</span>${m.gia ? ` <span class="rfq-clavoro-tag">già ${fmtQtyIt(m.gia)}</span>` : ''}</span>
      <input class="num" type="number" id="op-q-${i}" min="0" step="any" value="${esc(String(+m.residuo.toFixed(4)))}" style="width:110px" oninput="opAvviaAvviso()">
      <span class="empty-text" style="padding:0;width:40px">${esc(m.uom)}</span>
    </div>`).join('');
  openModal(`${opTestaModal(o, f, 'Avvia la fase ' + f.seq)}
    ${prima && !righe.length && (o.materials || []).length ? `<div class="rfq-warn">${ico('warning', 'tinted', '')} Il materiale di questo ordine è <strong>già uscito tutto</strong>.</div>` : ''}
    ${corpo ? `<h4 class="settings-group-title">Materiale che esce, dal ciclo della parte</h4>
      <div style="display:flex;flex-direction:column;gap:6px">${corpo}</div>
      <div id="op-avviso">${avvisoSottoZeroHtml(righe.map(m => ({ itemId: m.itemId, qty: m.residuo })))}</div>` : ''}
    <p class="empty-text" style="text-align:left;padding:8px 0">${spiega}</p>
    <div class="modal-field"><label>Nota</label><input id="op-note" placeholder="es. lotto 12 / bolla 412" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="opAvviaSave('${esc(id)}','${esc(faseId)}')">Avvia</button>
    </div>`, !!corpo, 'form');
}
function opAvviaRighe() { return (window.__opAvviaMat || []).map((itemId, i) => ({ itemId, qty: rawNum('op-q-' + i) })); }
function opAvviaAvviso() { const el = document.getElementById('op-avviso'); if (el) el.innerHTML = avvisoSottoZeroHtml(opAvviaRighe()); }
function opAvviaSave(id, faseId) {
  const materiali = opAvviaRighe();
  const sotto = avvisoSottoZero(materiali);
  if (!opAvvia(id, faseId, { materiali, note: val('op-note') })) return;
  // Avviata dal terminale di reparto: la timbratura parte adesso (officina.js).
  if (typeof repartoDopoAvvio === 'function') repartoDopoAvvio(id, faseId);
  closeModal(); opRidisegna();
  if (sotto.length) showToast('Fase avviata, ma l\'esistente va sotto zero: ' + sotto.join('; '), 'error');
  else showToast('Fase avviata');
}
function opPrelevaRestoModal(id) {
  const o = getOdp(id); if (!o || !roleGuardShop('docs')) return;
  const prima = opPrima(o); if (!prima) return;
  const righe = opMaterialeResiduo(o).filter(m => m.residuo > 0.000001);
  window.__opRestoMat = righe.map(m => m.itemId);
  openModal(`${opTestaModal(o, prima, 'Preleva il resto del materiale')}
    <div style="display:flex;flex-direction:column;gap:6px">${righe.map((m, i) => `<div class="mgmt-item">
      <span style="width:110px;font-family:var(--mono)">${esc(m.code)}</span>
      <span style="flex:1">${esc(m.name)} <span class="empty-text" style="padding:0">già uscito ${fmtQtyIt(m.gia)} ${esc(m.uom)}${giacenzeVisibili() ? ` · a magazzino ${fmtQtyIt(onHandOf(m.itemId))}` : ''}</span></span>
      <input class="num" type="number" id="op-pr-${i}" min="0" step="any" value="${esc(String(+m.residuo.toFixed(4)))}" style="width:110px" aria-label="Quantità di ${esc(m.code)} che esce">
      <span class="empty-text" style="padding:0;width:40px">${esc(m.uom)}</span>
    </div>`).join('')}</div>
    <p class="empty-text" style="text-align:left;padding:8px 0">Esce come all'avvio: ${prima.supplierId ? `verso <strong>${esc(prima.supplierName || supplierName(prima.supplierId) || '')}</strong>, con un'uscita a conto lavoro` : 'come consumo di produzione'}.</p>
    <div class="modal-field"><label>Nota</label><input id="op-pr-note" placeholder="es. lotto 13 / bolla 418" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="opPrelevaRestoSave('${esc(id)}')">Preleva</button>
    </div>`, true, 'form');
}
function opPrelevaRestoSave(id) {
  const righe = (window.__opRestoMat || []).map((itemId, i) => ({ itemId, qty: Math.max(0, rawNum('op-pr-' + i)) }));
  const n = opPrelevaResto(id, righe, val('op-pr-note'));
  if (n === false) return;
  closeModal(); renderOdp();
  showToast(n === 1 ? '1 materiale prelevato' : n + ' materiali prelevati');
}
function opDichiaraModal(id, faseId) {
  const x = opFaseDi(id, faseId); if (!x) return;
  const { o, f } = x;
  if (!roleGuardShop('docs')) return;
  const residua = opResidua(o, f);
  const ultima = opEUltima(o, f);
  openModal(`${opTestaModal(o, f, 'Dichiara l\'avanzamento')}
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Entrati in questa fase: <strong>${fmtQtyIt(opDaFare(o, f))}</strong> · già lavorati: <strong>${fmtQtyIt(opProcessati(o, f))}</strong> · restano <strong>${fmtQtyIt(residua)}</strong>.</p>
    <div class="modal-grid">
      <div class="modal-field"><label>Pezzi buoni</label>
        <input class="num" type="number" id="op-d-qty" min="0" step="any" value="${esc(String(+residua.toFixed(4)))}"></div>
      <div class="modal-field"><label>Scarti</label>
        <input class="num" type="number" id="op-d-scrap" min="0" step="any" value="0"></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:8px 0">${ultima
    ? (odpDiAssieme(o) ? `È l'<strong>ultima fase</strong>: i buoni sono gli assiemi <strong>${esc(o.code || '')}</strong> montati, e contano come fatti nel piano. Un assieme non ha giacenza: il magazzino non si muove.`
      : `È l'<strong>ultima fase</strong>: i pezzi buoni <strong>entrano a magazzino</strong> col codice <strong>${esc(o.code || '')}</strong>, ed è l'unico punto in cui quel codice si carica.`)
    : 'Questa fase <strong>non muove il magazzino</strong>. Gli scarti non proseguono: la fase successiva lavorerà i soli pezzi buoni.'}</p>
    <div class="modal-field"><label>Nota</label><input id="op-d-note" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="opDichiaraSave('${esc(id)}','${esc(faseId)}')">Registra</button>
    </div>`, false, 'form');
}
function opDichiaraSave(id, faseId) {
  if (!opDichiara(id, faseId, { qty: rawNum('op-d-qty'), scrap: rawNum('op-d-scrap'), note: val('op-d-note') })) return;
  closeModal(); opRidisegna(); showToast('Avanzamento registrato');
}
// ─── La tratta dal terzista, dichiarata in un colpo (dalla 0.116.0) ───
// Dalla riga dell'ordine di lavoro si dice quel che è tornato dal terzista, non
// fase per fase: lui le fasi le fa una dopo l'altra sullo stesso pezzo. I pezzi
// tornati sono passati da tutte, quindi le fasi prima dell'ultima li dichiarano
// buoni tutti (scarti compresi, che si sono rivelati dopo); l'ultima dice quanti
// sono buoni e quanti scarti. Le fasi della tratta non ancora avviate partono
// qui: dentro una tratta la successiva parte appena è partita la precedente.
function opDichiaraTratta(id, faseId, dati) {
  const x = opFaseDi(id, faseId); if (!x) return false;
  const { o, f } = x;
  const fasi = opRunFasi(o, f);
  if (fasi.length < 2) return opDichiara(id, faseId, dati);
  if (!opGuard(id, 'reception')) return false;
  if (!opAvviata(o, fasi[0])) { showToast(`La fase ${fasi[0].seq} non è stata avviata`, 'error'); return false; }
  const d = dati || {};
  const qty = Math.max(0, Number(d.qty) || 0);
  const scrap = Math.max(0, Number(d.scrap) || 0);
  if (!(qty > 0) && !(scrap > 0)) { showToast('Niente da dichiarare: pezzi e scarti sono a zero', 'error'); return false; }
  for (const g of fasi.slice(1)) if (!opAvviata(o, g) && !opAvvia(id, g.id)) return false;
  const ultima = fasi[fasi.length - 1];
  for (const g of fasi) {
    const fine = g.id === ultima.id;
    if (!opDichiara(id, g.id, { qty: fine ? qty : qty + scrap, scrap: fine ? scrap : 0, note: d.note })) return false;
  }
  return true;
}
// Quanto è entrato nella tratta e quanto ne è tornato: i buoni dell'ultima fase
// più gli scarti di tutte.
function opContoTratta(o, f) {
  const fasi = opRunFasi(o, f);
  const ultima = fasi[fasi.length - 1] || f;
  const entrati = opDaFare(o, fasi[0] || f);
  const tornati = opFatti(o, ultima) + fasi.reduce((t, g) => t + opScarti(o, g), 0);
  return { fasi, ultima, entrati, tornati, resta: Math.max(0, entrati - tornati) };
}
function opDichiaraTrattaModal(id, faseId) {
  const x = opFaseDi(id, faseId); if (!x) return;
  const { o, f } = x;
  const c = opContoTratta(o, f);
  if (c.fasi.length < 2) { opDichiaraModal(id, faseId); return; }
  if (!roleGuardShop('docs')) return;
  const ultimaDelCiclo = opEUltima(o, c.ultima);
  const nomi = c.fasi.map(g => g.seq).join('-');
  openModal(`${opTestaModal(o, f, 'Dichiara il rientro dal terzista')}
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Fasi <strong>${esc(nomi)}</strong>, una tratta sola presso lo stesso terzista. Entrati: <strong>${fmtQtyIt(c.entrati)}</strong> · già tornati: <strong>${fmtQtyIt(c.tornati)}</strong> · restano <strong>${fmtQtyIt(c.resta)}</strong>.</p>
    <div class="modal-grid">
      <div class="modal-field"><label>Pezzi buoni</label>
        <input class="num" type="number" id="op-d-qty" min="0" step="any" value="${esc(String(+c.resta.toFixed(4)))}"></div>
      <div class="modal-field"><label>Scarti</label>
        <input class="num" type="number" id="op-d-scrap" min="0" step="any" value="0"></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:8px 0">I pezzi tornati sono passati da tutte le fasi della tratta: si dichiarano su ciascuna, e gli scarti sull'ultima. ${ultimaDelCiclo
    ? (odpDiAssieme(o) ? `È la <strong>fine del montaggio</strong>: i buoni sono gli assiemi <strong>${esc(o.code || '')}</strong> montati.`
      : `È la <strong>fine del ciclo</strong>: i pezzi buoni <strong>entrano a magazzino</strong> col codice <strong>${esc(o.code || '')}</strong>.`)
    : 'Il magazzino <strong>non si muove</strong>: il codice della parte si carica alla fine del ciclo.'}</p>
    <div class="modal-field"><label>Nota</label><input id="op-d-note" placeholder="es. bolla 412" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="opDichiaraTrattaSave('${esc(id)}','${esc(faseId)}')">Registra</button>
    </div>`, false, 'form');
}
function opDichiaraTrattaSave(id, faseId) {
  if (!opDichiaraTratta(id, faseId, { qty: rawNum('op-d-qty'), scrap: rawNum('op-d-scrap'), note: val('op-d-note') })) { opRidisegna(); return; }
  closeModal(); opRidisegna(); showToast('Rientro registrato');
}
// La forzatura chiede il motivo, e il testo del blocco è **lo stesso** che il
// mutatore userebbe per rifiutare: due frasi scritte a mano divergerebbero, e
// chi forza non saprebbe più se sta scavalcando quello che l'app gli ha detto.
function opForzaModal(id, faseId) {
  const x = opFaseDi(id, faseId); if (!x) return;
  const { o, f } = x;
  if (!roleGuardShop('docs')) return;
  const blocco = opAvviabile(o, f);
  openModal(`${opTestaModal(o, f, 'Forza l\'avvio della fase ' + f.seq)}
    <div class="rfq-warn">${ico('warning', 'tinted', '')} ${esc(blocco.motivo || '')}. Avviando comunque, i pezzi di questa fase partono da un conto che non torna.</div>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">La forzatura resta scritta nello storico dell'ordine, col motivo: non è un permesso speso e dimenticato.</p>
    <div class="modal-field"><label>Motivo (obbligatorio)</label>
      <input id="op-forza-motivo" placeholder="es. pezzi campione da consegnare prima" autocomplete="off"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="opForzaSave('${esc(id)}','${esc(faseId)}')">Forza l'avvio</button>
    </div>`, false, 'form');
}
function opForzaSave(id, faseId) {
  const motivo = requireVal('op-forza-motivo', 'Per forzare l\'avvio serve il motivo');
  if (!motivo) return;
  if (!opAvvia(id, faseId, { forza: true, motivo })) return;
  closeModal(); opRidisegna(); showToast('Fase avviata forzando la successione');
}
function opChiudiModal(id, faseId) {
  const x = opFaseDi(id, faseId); if (!x) return;
  const { o, f } = x;
  const mancano = opResidua(o, f);
  askConfirm(`Chiudere la fase ${f.seq} ${f.wcName}?` + (mancano > 0.000001
    ? `\n\nMancano ${fmtQtyIt(mancano)} pezzi: non proseguiranno alla fase successiva.` : ''), () => {
    if (!opChiudiFase(id, faseId)) return;
    opRidisegna(); showToast('Fase chiusa');
  }, { title: 'Chiudi la fase', ok: 'Chiudi', safe: mancano <= 0.000001 });
}
function opRiapriFaseAsk(id, faseId) {
  const x = opFaseDi(id, faseId); if (!x) return;
  askConfirm(`Riaprire la fase ${x.f.seq} ${x.f.wcName}?`, () => {
    if (!opRiapriFase(id, faseId)) { renderOdp(); return; }
    renderOdp(); showToast('Fase riaperta');
  }, { title: 'Riapri la fase', ok: 'Riapri', safe: true });
}
function opAnnullaDichiarazioneAsk(declId) {
  const d = (db.prodDecls || []).find(x => x.id === declId); if (!d) return;
  const domanda = d.kind === 'avvio'
    ? 'Annullare l\'avvio di questa fase?\nIl materiale uscito con lui torna a magazzino, e la fase torna da avviare.'
    : `Annullare questa dichiarazione di ${fmtQtyIt(d.qty)} pezzi?\nI movimenti di magazzino che ha generato vengono tolti con lei.`;
  askConfirm(domanda, () => {
    if (!opAnnullaDichiarazione(declId)) return;
    opRidisegna(); showToast('Dichiarazione annullata');
  }, { title: 'Annulla la dichiarazione', ok: 'Annulla' });
}

// ═══════════════════════════════════════════════════════════
//  UN ORDINE SCRITTO A MANO
// ═══════════════════════════════════════════════════════════
// Gli ordini di produzione nascono dal fabbisogno, ma lanciare un pezzo fuori
// piano è il caso normale: un urgente, un ricambio, una prova. Si sceglie la
// parte fra quelle che un **ciclo** ce l'hanno — le altre aprirebbero un ordine
// senza nessuna successione da seguire.
function nextOdpNumber() { return numeroProgressivo('ODP'); }
// La fabbrica unica: dal fabbisogno e dalla mano passano di qui entrambe, così
// un ordine scritto a mano non è una seconda specie di ordine.
function odpNew(part, qty, dueDate, extra) {
  const n = Math.max(0, Number(qty) || 0);
  const planId = (extra && extra.planId) || null;
  return odpPianifica(stampNew(Object.assign({
    id: gid(), number: nextOdpNumber(), itemId: part.id,
    code: part.code || '', name: part.name || '', uom: itemUom(part),
    qty: n, date: oggiISO(), dueDate: dueDate || '',
    status: 'bozza', title: '', notes: '', notesInternal: '',
    planId: null, jobId: null,
    phases: opFreezePhases(part), materials: opFreezeMaterials(part, n, planId),
    active: true,
  }, extra || {})));
}
// ─── Le date delle fasi ───
// Ogni fase porta inizio e fine **pianificati**, calcolati a ritroso dalla data
// in cui l'ordine serve con la stessa aritmetica del fabbisogno (schedOps in
// views-mrp.js), ma sulle fasi **congelate**: è l'ordine ad aver promesso quel
// ciclo, non il ciclo di oggi. In bozza seguono pezzi e data; dopo il lancio
// stanno ferme — una fase che slitta deve vedersi — e si ricalcolano solo con
// **Ripianifica**, che lascia com'erano quelle già chiuse.
function odpSchedule(o) {
  const ops = o.phases || [];
  const viste = new Set();
  const tratte = [];
  ops.forEach((f, k) => {
    const from = f.runFrom != null ? Number(f.runFrom) : k;
    const chiave = from + '|' + (f.supplierId || '');
    if (viste.has(chiave)) return;
    viste.add(chiave);
    tratte.push({ from, to: f.runTo != null ? Number(f.runTo) : k, supplierId: f.supplierId || '', esterna: !!f.supplierId });
  });
  // Le tratte congelate parlano di opIndex, schedOps di posizioni: sulle fasi
  // di un ordine coincidono, perché si congelano tutte e in ordine. Se non
  // coincidessero (un ordine scritto a mano, dati vecchi) si ripiega su una
  // tratta per fase, che è il comportamento di prima delle tratte.
  const coerenti = ops.every((f, k) => Number(f.opIndex) === k) && tratte.every(t => t.from <= t.to && t.to < ops.length);
  const usa = coerenti ? tratte : ops.map((f, k) => ({ from: k, to: k, supplierId: f.supplierId || '', esterna: !!f.supplierId }));
  return schedOps(ops, usa, Number(o.qty) || 0, String(o.dueDate || '').slice(0, 10));
}
function odpPianifica(o, soloAperte) {
  if (!o || !(o.phases || []).length || typeof schedOps !== 'function') return o;
  const prog = odpSchedule(o);
  o.phases.forEach((f, k) => {
    if (soloAperte && opChiusa(o, f)) return;
    const d = prog.fasi[k] || {};
    f.plannedStart = d.start || '';
    f.plannedEnd = d.end || '';
  });
  return o;
}
function odpReplanAsk(id) {
  if (!opGuard(id, 'ops')) return;
  const o = getOdp(id); if (!o) return;
  askConfirm(`Ricalcolare le date pianificate delle fasi non ancora chiuse di ${o.number}, a ritroso dal ${fmtDateIt(o.dueDate) || '—'}?`, () => {
    odpPianifica(o, true);
    touch(o); saveDB(); renderOdp(); savedToast('Fasi ripianificate');
  }, { title: 'Ripianifica', ok: 'Ripianifica' });
}
function newOdpModal() {
  if (!roleGuard('docs')) return;
  catalogPickerModal(ids => odpNewFromPick(ids), {
    titolo: '+ Nuovo ordine di produzione',
    // Un ciclo senza fasi non ha una successione da seguire, e un ordine su una
    // parte così sarebbe una scheda vuota: si scopre dopo averla scelta, ed è
    // il modo peggiore.
    filtro: i => (i.type === 'parte' || isAssembly(i.type)) && cicloFasi(i).length > 0,
    vuoto: 'Nessuna parte e nessun assieme ha un ciclo di lavorazione. Le fasi si scrivono in <em>Cicli di lavorazione</em>.',
  });
}
function odpNewFromPick(ids) {
  const part = getItem((ids || [])[0]); if (!part) return;
  closeModal();
  openModal(`<h3>${ico('factory', 'tinted pill', '')} Nuovo ordine di produzione</h3>
    <p>${esc((part.code || '') + ' ' + (part.name || ''))}</p>
    <div class="modal-grid">
      <div class="modal-field"><label>Pezzi da produrre</label>
        <input class="num" type="number" id="odp-new-qty" min="0" step="any" value="1"></div>
      <div class="modal-field"><label>Serve per</label><input type="date" id="odp-new-due"></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:8px 0">Nasce in <strong>bozza</strong>: fasi e materiale si congelano al lancio, e da lì in poi non si toccano più. Un ordine scritto a mano <strong>non è legato a nessun piano</strong>, e nel fabbisogno quella parte continuerà a risultare da fabbricare.</p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="odpNewSave('${esc(part.id)}')">Crea</button>
    </div>`, false, 'form');
}
function odpNewSave(partId) {
  const part = getItem(partId); if (!part || !roleGuard('docs')) return;
  const qty = rawNum('odp-new-qty');
  if (!(qty > 0)) { showToast('Serve una quantità maggiore di zero', 'error'); return; }
  const due = val('odp-new-due');
  return conNumeri({ ODP: 1 }, () => {
    const o = odpNew(part, qty, due);
    db.prodOrders.push(o); saveDB();
    closeModal(); currentOdpId = o.id; odpView = 'edit'; renderOdp();
    showToast(`Ordine di produzione ${o.number} creato`);
  });
}
function openOdlFromOdp(odlId) { setView('odl'); openOdlEdit(odlId); }
function openOdpFromOdl(odpId) { setView('odp'); openOdpEdit(odpId); }

// ═══════════════════════════════════════════════════════════
//  EXPORT
// ═══════════════════════════════════════════════════════════
function odpListExportSpec() {
  const tutti = (db.prodOrders || []).slice().sort((a, b) => (b.number || '').localeCompare(a.number || ''));
  const list = odpFilterApply(tutti);
  return {
    titolo: 'Ordini di produzione', slug: 'ordini_di_produzione',
    filtri: [['Ricerca', odpFilters.q], ['Stato', ODP_STATUS[odpFilters.status] || ''],
      ['Data', dateRangeText(odpFilters.from, odpFilters.to)]],
    sezioni: [{
      nome: 'Ordine di produzione',
      colonne: [{ h: 'Numero', w: 18 }, { h: 'Codice', w: 18 }, { h: 'Parte', w: 32 },
        { h: 'Stato', w: 14 }, { h: 'Pezzi', w: 10, num: true }, { h: 'U.M.', w: 8 },
        { h: 'Serve per', w: 12, data: true }, { h: 'Fasi', w: 8, num: true },
        { h: 'Chiuse', w: 8, num: true }, { h: 'Versati', w: 10, num: true }],
      righe: list.map(o => [o.number || '', o.code || '', o.name || '',
        ODP_STATUS[o.status] || o.status || '', Number(o.qty) || 0, o.uom || '',
        o.dueDate || '', (o.phases || []).length,
        (o.phases || []).filter(f => opChiusa(o, f)).length, opVersato(o)]),
    }],
  };
}
// Il documento dell'ordine: è **il foglio che va in officina**, e per questo
// porta le fasi con i loro tempi e lo spazio per leggere l'avanzamento, non i
// prezzi — quelli riguardano l'ordine di lavoro, non chi lavora il pezzo.
function odpDocSpec(o) {
  const fasi = (o.phases || []).map(f => [String(f.seq), f.wcName,
    f.supplierId ? (f.supplierName || supplierName(f.supplierId) || '') : 'Interna',
    f.supplierId ? (f.days ? f.days + ' gg' : '') : (f.hours ? fmtQtyIt(f.hours) + ' h/pz' : ''),
    opDaFare(o, f), opFatti(o, f), opScarti(o, f),
    ODP_FASE_LABELS[opStatoFase(o, f)] || '']);
  const mat = opMaterialeResiduo(o).map(m => [m.code, m.name, m.uom, m.qty, m.gia, m.residuo]);
  const sezioni = [{
    nome: 'Fasi',
    colonne: [{ h: 'Fase', w: 8 }, { h: 'Lavorazione', w: 28 }, { h: 'Dove', w: 22 }, { h: 'Tempo', w: 12 },
      { h: 'Da fare', w: 10, num: true }, { h: 'Fatti', w: 10, num: true },
      { h: 'Scarti', w: 10, num: true }, { h: 'Stato', w: 14 }],
    righe: fasi,
  }];
  if (mat.length) {
    sezioni.push({
      nome: 'Materiale del ciclo',
      colonne: [{ h: 'Codice', w: 18 }, { h: 'Articolo', w: 34 }, { h: 'U.M.', w: 8 },
        { h: 'Previsto', w: 12, num: true }, { h: 'Uscito', w: 12, num: true }, { h: 'Residuo', w: 12, num: true }],
      righe: mat,
    });
  }
  return {
    titolo: `Ordine di produzione ${o.number}`,
    // Solo il PDF lo disegna (pdfListHead); l'Excel non ha dove metterlo.
    qr: o.number ? qrLink('odp', o.number) : '',
    slug: 'odp_' + String(o.number || '').replace(/[^\w-]/g, '_'),
    // Come ODA e ODL: «ODP-2026-001_PRT-001.pdf» (dalla 0.101.1).
    nomeFile: [o.number || 'ODP', o.code || ''].filter(Boolean).join('_'),
    filtri: [['Parte', `${o.code || ''} ${o.name || ''}`.trim()],
      ['Pezzi', `${fmtQtyIt(o.qty)} ${o.uom || ''}`],
      ['Serve per', o.dueDate ? fmtDateIt(o.dueDate) : ''],
      ['Stato', ODP_STATUS[o.status] || o.status || '']],
    sezioni,
  };
}
function exportOdpPDF(id) { const o = getOdp(id); if (o) exportListPdf(odpDocSpec(o)); }
function exportOdpExcel(id) { const o = getOdp(id); if (o) exportListXlsx(odpDocSpec(o)); }

// ═══════════════════════════════════════════════════════════
//  DALL'ORDINE DI PRODUZIONE ALL'ORDINE DI LAVORO
// ═══════════════════════════════════════════════════════════
// La riga che ne esce passa dalla **stessa fabbrica** del fabbisogno e
// dell'ODL scritto a mano — `mrpPhaseRow` per ogni fase, `planPhaseDocLine` per
// la riga — perché una riga generata da qui che si comportasse diversamente
// sarebbe una terza specie di riga da ricordarsi.
//
// L'unione delle fasi in **tratta** però non passa da `mrpPhaseRuns`: quella
// legge il ciclo **vivo**, e qui l'autorità è la tratta **congelata**. Se il
// ciclo è cambiato dopo il lancio, l'ordine di lavoro deve chiedere al terzista
// quello che l'ordine di produzione gli ha promesso.
function opRunDocRow(o, fase) {
  const part = getItem(o.itemId); if (!part) return null;
  const qty = opAttesiFase(o, fase);
  const fasi = opRunFasi(o, fase).map(f => mrpPhaseRow({
    item: part, row: f, opIndex: f.opIndex, phaseKey: f.phaseKey, phaseNo: f.seq,
    workCenterId: f.workCenterId || '', supplierId: f.supplierId || '',
    qty, due: o.dueDate || '',
  }));
  if (!fasi.length) return null;
  const prima = fasi[0];
  const somma = campo => fasi.reduce((s, x) => s + (Number(x[campo]) || 0), 0);
  const prezzo = somma('price');
  const giorni = somma('leadDays');
  const congelate = opRunFasi(o, fase);
  const tratta = { invio: (congelate[0] || {}).plannedStart || '', rientro: (congelate[congelate.length - 1] || {}).plannedEnd || '' };
  return Object.assign({}, prima, {
    phaseKey: prima.phaseKey,
    phaseKeys: fasi.map(x => x.phaseKey),
    phaseNos: fasi.map(x => x.phaseNo),
    fasi,
    wcName: Array.from(new Set(fasi.map(x => x.wcName))).join(' + '),
    // Con le date pianificate (0.90.0) la riga chiede al terzista il **rientro
    // della tratta**, e va emessa entro il suo invio; un ordine di prima, senza
    // date, ragiona ancora sulla data dell'ordine.
    due: tratta.rientro || o.dueDate || '', leadDays: giorni, days: giorni,
    orderBy: tratta.invio || (o.dueDate ? runSendDate(o.dueDate, giorni) : ''),
    hours: somma('hours'), hoursUnit: somma('hoursUnit'),
    price: prezzo, amount: prezzo * qty, noPrice: !(prezzo > 0),
    qty, qtyOrder: qty,
  });
}
// La testata: stesse condizioni di un ordine generato dal piano, e la catena
// commessa → piano → ordine di produzione → ordine di lavoro che non si spezza.
function opDocHead(o, supplierId) {
  const sup = supplierId ? getSupplier(supplierId) : null;
  return {
    title: `${o.number} — ${(o.code || '')}`.trim(),
    date: oggiISO(), status: 'bozza', supplierId: supplierId || null,
    transport: (sup && sup.defaultTransport) || db.settings.transportDefault || '',
    payment: (sup && sup.defaultPayment) || db.settings.paymentDefault || '',
    rfqId: null, planId: o.planId || null, jobId: o.jobId || null,
    odpId: o.id, supplierConfirmation: '', notes: '', notesInternal: '', active: true,
  };
}
// Un ordine di lavoro è un documento con un prezzo e un fornitore: lo scrive chi
// scrive gli ordini, non l'officina (dalla 0.105.6). La guardia della ricezione
// da sola accettava l'area `shop`.
function opGeneraOdl(id, faseId) {
  if (!roleGuard('docs') || !opGuard(id, 'reception')) return null;
  const x = opFaseDi(id, faseId); if (!x) return null;
  const { o, f } = x;
  if (!f.supplierId) { showToast('Questa fase è interna: non c\'è nessun terzista a cui commissionarla', 'error'); return null; }
  if (!opGenerabile(o, f)) {
    const gia = opRunFasi(o, f).map(x => opOdlDi(x) || opOdlDalPiano(o, x)).find(Boolean);
    showToast(`Questa tratta è già in un ordine di lavoro${gia ? ' (' + gia.odl.number + ')' : ''}`, 'error');
    return null;
  }
  const r = opRunDocRow(o, f); if (!r) return null;
  const linea = Object.assign(planOdlLine(r), { odpId: o.id, odpPhaseId: f.id });
  const odl = stampNew(Object.assign({ id: gid(), number: nextOdlNumber() }, opDocHead(o, f.supplierId), { lines: [linea] }));
  db.workOrders.push(odl);
  saveDB(); invalidateProd();
  return odl;
}
function opGeneraOdlAsk(id, faseId) {
  const x = opFaseDi(id, faseId); if (!x) return;
  const { o, f } = x;
  const fasi = opRunFasi(o, f);
  const quali = fasi.length === 1 ? `la fase ${f.seq}` : `le fasi ${fasi[0].seq}-${fasi[fasi.length - 1].seq}`;
  askConfirm(`Commissionare ${quali} a ${f.supplierName || supplierName(f.supplierId) || 'questo terzista'}?\n${fmtQtyIt(opAttesiFase(o, f))} pezzi di ${o.code || ''}.`, () => conNumeri({ ODL: 1 }, () => {
    const odl = opGeneraOdl(id, faseId); if (!odl) { renderOdp(); return; }
    renderOdp();
    showToast(`Ordine di lavoro ${odl.number} creato`, 'success');
  }), { title: 'Genera ordine di lavoro', ok: 'Genera', safe: true });
}
// Il rimando che l'ordine di lavoro disegna al posto dei suoi comandi di conto
// lavoro. Il magazzino ha **un padrone solo** per le parti coperte da un ordine
// di produzione, e offrire due strade per lo stesso gesto significa vederlo
// registrato due volte.
function opRimandoHtml(l) {
  const o = getOdp(l.odpId);
  if (!o) return '';
  const f = (o.phases || []).find(x => x.id === l.odpPhaseId);
  return `<div class="line-cl-actions">${ico('factory', 'tinted', '')}
    <span class="plandoc-link plandoc-link-sm" ${clickAttrs(`openOdpFromOdl('${o.id}')`,
    'Apri l\'ordine di produzione: il materiale e i pezzi si registrano da lì, una volta sola')}>${esc(o.number)}${f ? ' › fase ' + esc(String(f.seq)) : ''}</span>
    <span class="empty-text" style="padding:0">· i movimenti di questa lavorazione si registrano sull'ordine di produzione</span></div>`;
}
