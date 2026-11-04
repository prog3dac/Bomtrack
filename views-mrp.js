// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-mrp.js
// ═══════════════════════════════════════════════════════════
// Vista Fabbisogno materiali: piani di produzione, esplosione delle distinte,
// lista d'acquisto consolidata ed export. I documenti che nascono dal piano
// stanno in views-mrp-documenti.js (dalla 0.141.0).
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  VISTA: FABBISOGNO MATERIALI (piani di produzione)
// ═══════════════════════════════════════════════════════════
// Dato un piano (3 × macchina A, 2 × macchina B) si esplodono le distinte e si
// somma per articolo: la lista di ciò che serve comprare, con lo stesso conto
// che fa la costificazione. Le regole di discesa sono quelle di computeCost —
// se le due strade divergono su una distinta, una delle due sta mentendo.

// ─── Motore (logica pura, nessun DOM) ───
// → { buy: [{ item, qty, due }], make: [{ item, qty, due }],
//     phases: [{ item, row, opIndex, phaseKey, phaseNo, workCenterId, supplierId, qty, due }],
//     cycle: bool }
//
// `phases` sono le **fasi di conto lavoro**: le righe di lavorazione di una parte
// prodotta in casa che portano un fornitore. Sono denaro che esce, esattamente
// come un commerciale da comprare, e fino alla 0.65.0 non le vedeva nessuno —
// la discesa le scartava con un commento che diceva il vero a metà («le
// lavorazioni non si comprano a magazzino»: quelle esterne si comprano eccome,
// solo non finiscono a scaffale). Le fasi **interne** restano fuori di qui: non
// si comprano, si fanno, e la domanda che pongono è la capacità.
//
// La data scende insieme alla quantità, **scalata dei tempi di chi sta in
// mezzo** (dalla 0.88.0): se una macchina serve per il 30 settembre e il suo
// montaggio dura tre giorni, i componenti servono per il 25; se una parte ha
// la tornitura dopo la zincatura dal terzista, la zincatura deve rientrare
// prima che la tornitura cominci, e il materiale della parte serve il giorno in
// cui parte la prima fase. Vedi «Programmazione a ritroso» qui sotto. Quando lo
// stesso articolo arriva da più rami con date diverse si tiene **la più
// vicina**: è la scelta conservativa — ordinare per la data più stretta copre
// anche le altre.
//
// Sul **materiale** volutamente NON si fa time-phasing: niente periodi, niente
// fabbisogni separati per settimana. Sarebbe un altro strumento, e prometterlo a
// metà è peggio che non averlo. Qui la data serve a due cose concrete: sapere
// entro quando ordinare, e scriverla sul documento al fornitore.
//
// Dalla 0.68.0 il **carico dei centri** è per settimana, e la distinzione regge
// per tre motivi che vale la pena scrivere invece di lasciare intuire.
//   1. Non tocca il netting. `netRequirement`, `stockFor`, `commitIndex` e
//      `mrpBuyRow` restano identici: il carico è un prospetto derivato in sola
//      lettura, da cui non nasce nessun documento e nessuna quantità. Se domani
//      lo si cancellasse, il resto dell'app non se ne accorgerebbe — ed è una
//      promessa con un test dedicato, non un'intenzione.
//   2. La domanda è diversa. Sul materiale il periodo servirebbe a decidere
//      *quando ordinare*, e a quello risponde già `orderBy` senza secchielli.
//      Sulla capacità il periodo **è** la domanda: la capacità è una portata
//      (ore a settimana), non uno stock, e «quante ore chiedo alla tornitura a
//      settembre» non ha risposta senza un periodo.
//   3. Non si promette nulla che non si dia: capacità **infinita**, dichiarata.
//      Il prospetto mostra il sovraccarico, non lo sposta.
// `opz.scaffale` (dalla 0.100.0) è la quota di parti già pronte a magazzino che
// questo piano può usare, nella forma di `mrpScaffale()`: una parte presa da lì
// non si fabbrica, e sotto di lei non si scende — niente materiale da
// comprare, niente fasi da commissionare per pezzi che esistono già. Senza
// opzione l'esplosione è lorda, com'è sempre stata: la usano la costificazione
// e le anteprime, dove la giacenza non c'entra.
function mrpExplode(lines, opz) {
  // Gli accumulatori viaggiano in un oggetto solo: `mrpDescend` ne aveva già
  // sette di parametri posizionali, e l'ottavo sarebbe stato quello che si
  // sbaglia a passare.
  const acc = { buy: new Map(), make: new Map(), phases: new Map(), load: new Map(),
    asm: new Map(), intOps: new Map(), stock: new Map(), cycle: false, setupVisti: new Set(),
    scaffale: (opz && opz.scaffale) || null, lotti: mrpLotti(lines) };
  (lines || []).forEach(l => mrpDescend(l.itemId, Number(l.qty) || 0, new Set(), acc, l.dueDate || ''));
  // Le decisioni «usa l'alternativo» del piano (alternativi.js), dopo la
  // discesa: spostano quantità fra articoli d'acquisto già accumulati.
  if (opz && opz.sostituzioni && opz.sostituzioni.length) mrpApplicaSostituzioni(acc.buy, opz.sostituzioni);
  const perCodice = m => Array.from(m.values()).sort((a, b) => String(a.item.code).localeCompare(String(b.item.code)));
  // Le fasi si ordinano per parte e poi per posizione nel ciclo: l'ordine delle
  // fasi è quello in cui si eseguono, ed è ciò che il terzista legge.
  const perFase = m => Array.from(m.values()).sort((a, b) =>
    String(a.item.code).localeCompare(String(b.item.code)) || a.opIndex - b.opIndex);
  // `asm` e `intOps` (assiemi da montare, fasi interne) portano solo date: li
  // legge l'agenda del piano, nessun conto di quantità passa da lì.
  // `stock` sono le parti prese dal magazzino invece che fabbricate.
  return { buy: perCodice(acc.buy), make: perCodice(acc.make), phases: perFase(acc.phases),
    load: Array.from(acc.load.values()), asm: perCodice(acc.asm), intOps: perFase(acc.intOps),
    stock: perCodice(acc.stock), cycle: acc.cycle };
}
// Le date sono stringhe ISO `YYYY-MM-DD`: si confrontano bene così come sono, e
// una vuota non deve mai vincere su una valorizzata.
function primaData(a, b) {
  if (!a) return b || '';
  if (!b) return a;
  return a < b ? a : b;
}
// `start` è la data in cui il lavoro su quell'articolo comincia: il lancio di
// una parte, l'inizio del montaggio di un assieme. Su un acquisto coincide con
// la data in cui serve — l'anticipo d'ordine lo aggiunge mrpBuyRow, che sa
// quale listino si userà.
function mrpAdd(map, it, qty, due, start) {
  const e = map.get(it.id);
  if (e) { e.qty += qty; e.due = primaData(e.due, due); e.start = primaData(e.start, start || due); }
  else map.set(it.id, { item: it, qty, due: due || '', start: start || due || '' });
}
// L'identità di una fase, e il suo limite dichiarato.
// L'indice conta **fra le sole lavorazioni**, non nell'array `cycle` intero:
// aggiungere una materia prima alla distinta parte è la modifica più frequente,
// e con l'indice assoluto sposterebbe la chiave di tutte le fasi che seguono.
// Riordinare le fasi la sposta lo stesso, ed è accettato: vedi il commento su
// planDocumentedKeys per cosa succede allora, e perché è il modo giusto di
// sbagliare.
function mrpPhaseKey(itemId, opIndex, workCenterId) {
  return String(itemId) + '#' + opIndex + '#' + String(workCenterId || '');
}
// Su una fase di conto lavoro `due` è il **rientro** della sua tratta e `start`
// l'**invio** al terzista: le due date della programmazione a ritroso.
function mrpAddPhase(map, it, row, opIndex, qty, due, start) {
  const k = mrpPhaseKey(it.id, opIndex, row.workCenterId);
  const e = map.get(k);
  if (e) { e.qty += qty; e.due = primaData(e.due, due); e.start = primaData(e.start, start); return; }
  map.set(k, { item: it, row, opIndex, phaseKey: k, phaseNo: cyclePhaseNumber(opIndex),
    workCenterId: row.workCenterId || '', supplierId: row.supplierId || '', qty, due: due || '', start: start || '' });
}
// Il lotto di una parte o di un assieme che compare in più rami della
// distinta: si fabbrica (e si monta) tutto insieme, in un ODP solo, e i tempi
// vanno calcolati sul lotto intero. Calcolati sul ramo, una parte comune a due
// gruppi risultava da lanciare più tardi di quanto serve (dalla 0.105.5).
// Lordo, senza lo scaffale: chi compare in un ramo solo usa la sua quantità.
function mrpLotti(lines) {
  const tot = new Map(), rami = new Map();
  const giu = (itemId, qty, ancestors) => {
    const it = getItem(itemId);
    if (!it || !(qty > 0) || ancestors.has(itemId)) return;
    if (it.type === 'materiale' || it.type === 'acquistato') return;
    if (it.type === 'parte' && partSourcing(it) === 'buy') return;
    tot.set(itemId, (tot.get(itemId) || 0) + qty);
    rami.set(itemId, (rami.get(itemId) || 0) + 1);
    const next = new Set(ancestors); next.add(itemId);
    (it.type === 'parte' ? distintaRighe(it) : varRigheComuni(it)).forEach(c => giu(c.itemId, qty * (Number(c.qty) || 0) * (1 + (Number(c.scrapPct) || 0) / 100), next));
  };
  (lines || []).forEach(l => giu(l.itemId, Number(l.qty) || 0, new Set()));
  const lotti = new Map();
  rami.forEach((n, id) => { if (n > 1) lotti.set(id, tot.get(id)); });
  return lotti;
}
function mrpLotto(acc, it, qty) { return Math.max(qty, (acc.lotti && acc.lotti.get(it.id)) || 0); }
function mrpDescend(itemId, qty, ancestors, acc, due) {
  const it = getItem(itemId);
  if (!it || !(qty > 0)) return;
  // Anello: si segnala e si smette di scendere, come fa flattenBom
  if (ancestors.has(itemId)) { acc.cycle = true; return; }
  if (it.type === 'materiale' || it.type === 'acquistato') { mrpAdd(acc.buy, it, qty, due); return; }
  const next = new Set(ancestors); next.add(itemId);
  if (it.type === 'parte') {
    // Parte comprata già lavorata da terzi: è una foglia d'acquisto come un
    // commerciale. Il ciclo resta salvato, ma non si scende — quel materiale
    // e quelle lavorazioni li mette il fornitore, non noi.
    if (partSourcing(it) === 'buy') { mrpAdd(acc.buy, it, qty, due); return; }
    // Pezzi già pronti a scaffale: si prendono prima di fabbricarne. Quello che
    // resta si fabbrica, e solo per quello si scende nel ciclo.
    const presi = acc.scaffale ? acc.scaffale.prendi(it.id, qty) : 0;
    if (presi > 0) {
      mrpAdd(acc.stock, it, presi, due);
      qty -= presi;
      if (!(qty > 0.000001)) return;
    }
    // Il ciclo si programma a ritroso dalla data in cui la parte serve: ogni
    // fase ha il suo inizio e la sua fine, e il materiale serve all'inizio
    // della prima. Le ore di una fase interna stanno nella settimana in cui la
    // fase **comincia**, non in quella in cui il pezzo serve.
    const prog = schedPart(it, mrpLotto(acc, it, qty), due);
    mrpAdd(acc.make, it, qty, due, prog.start);
    // Dalla 0.125.0 il materiale sta nella distinta della parte, e come quella
    // degli assiemi ha lo scarto: entra nella quantità come nel costo.
    const perFigli = schedChildDue(prog.start);
    cicloFasi(it).forEach((r, k) => {
      const f = prog.fasi[k] || { start: due, end: due };
      // Con un fornitore la fase si compra; senza, si fa in casa — e allora
      // non è un acquisto, è un'ora di macchina da qualche parte.
      if (r.supplierId) mrpAddPhase(acc.phases, it, r, k, qty, f.end, f.start);
      else {
        mrpAddLoad(acc.load, r.workCenterId, f.start, Number(r.hours) || 0, qty, it, cyclePhaseNumber(k), mrpLoadSetup(acc, it, r, k));
        mrpAddPhase(acc.intOps, it, r, k, qty, f.end, f.start);
      }
    });
    // Ogni riga serve all'inizio della sua fase di consumo (dalla 0.138.0):
    // la vernice della quarta fase non deve arrivare per la prima.
    distintaRighe(it).forEach(c =>
      mrpDescend(c.itemId, qty * (Number(c.qty) || 0) * (1 + (Number(c.scrapPct) || 0) / 100), next, acc, schedRigaDue(c, it, prog, perFigli)));
    return;
  }
  // assieme: il montaggio finisce quando l'assieme serve e comincia prima dei
  // suoi giorni; i componenti servono all'inizio del montaggio.
  const prog = schedAssembly(it, mrpLotto(acc, it, qty), due);
  mrpAdd(acc.asm, it, qty, due, prog.start);
  // Le fasi del suo ciclo (dalla 0.124.0) fanno quello che fanno le fasi di
  // una parte: le interne caricano i centri nella settimana in cui
  // cominciano, quelle con un terzista sono conto lavoro da commissionare.
  // Vanno raccolte qui e non a posteriori: le quantità esplose degli assiemi
  // non le conserva nessuno.
  cicloFasi(it).forEach((r, k) => {
    const f = prog.fasi[k] || { start: prog.start, end: due };
    if (r.supplierId) mrpAddPhase(acc.phases, it, r, k, qty, f.end, f.start);
    else {
      mrpAddLoad(acc.load, r.workCenterId, f.start, Number(r.hours) || 0, qty, it, cyclePhaseNumber(k), mrpLoadSetup(acc, it, r, k));
      mrpAddPhase(acc.intOps, it, r, k, qty, f.end, f.start);
    }
  });
  const perFigli = schedChildDue(prog.start);
  // la quantità di riga porta con sé lo scarto, come nel rollup. Di un
  // modello da configurare (varianti.js) conta la parte comune, come nel costo.
  varRigheComuni(it).forEach(c => {
    const f = (Number(c.qty) || 0) * (1 + (Number(c.scrapPct) || 0) / 100);
    mrpDescend(c.itemId, qty * f, next, acc, schedRigaDue(c, it, prog, perFigli));
  });
}

// ─── Programmazione a ritroso ───
// Da «serve pronto il giorno X» a «quando comincia ciascuna cosa». Capacità
// **infinita**, come il carico dei centri: si calcola quando le cose devono
// succedere perché la consegna regga, non se il reparto ce la fa — quello lo
// dice il Carico centri, che ora mette le ore nella settimana giusta.
//
// Le date sono «il mattino in cui il pezzo è pronto»: una fase di un giorno che
// deve finire lunedì comincia venerdì, e la fase prima deve finire venerdì.
// Nessun buco e nessuna sovrapposizione fra una fase e l'altra.
//
// I tempi vengono da tre posti, e senza dati valgono zero — una fase senza ore
// e senza giorni non sposta niente, come prima:
//   - fase **interna**: (attrezzaggio + ore/pz × pezzi) / (ore al giorno di un
//     operatore × operatori della fase), arrotondato al giorno intero, più i
//     giorni di coda del centro;
//     in giorni **lavorativi** (calendario.js);
//   - tratta **di conto lavoro** (fasi consecutive dello stesso terzista): la
//     somma dei giorni di attraversamento più il trasporto del terzista, in
//     giorni **dei fornitori** (calendario.js: lavorativi di serie dalla
//     0.110.0, di calendario se così impostato), con l'invio sempre in un
//     giorno lavorativo;
//   - **montaggio** di un assieme: i giorni dichiarati sull'assieme o, senza,
//     le ore delle sue lavorazioni come fasi interne in sequenza.
// Dalla 0.124.0 i due numeri del centro dicono due cose diverse:
//   - **ore al giorno** (`hoursPerDay`): quanto lavora in un giorno **un
//     operatore**; zero = otto;
//   - **capacità** (`capacityHours`): le ore **totali** che il centro dà in una
//     settimana, tutti gli operatori insieme. Le legge il Carico centri, e la
//     capacità finita ne ricava il tetto di un giorno.
// Prima le ore al giorno a zero si ricavavano dalla capacità, che però è del
// centro intero: con due montatori una fase sembrava durare la metà.
const SCHED_ORE_GIORNO = 8;
function wcHoursPerDay(wc) {
  const h = wc ? Number(wc.hoursPerDay) || 0 : 0;
  return h > 0 ? h : SCHED_ORE_GIORNO;
}
// Le ore che il centro intero dà in un giorno lavorativo: la capacità
// settimanale sui giorni lavorativi del calendario, o senza capacità
// dichiarata un operatore solo.
function wcOreGiornoCentro(wc) {
  const cap = wc ? Number(wc.capacityHours) || 0 : 0;
  const gg = typeof workDaysPerWeek === 'function' ? workDaysPerWeek() : 5;
  return cap > 0 && gg > 0 ? cap / gg : wcHoursPerDay(wc);
}
// Quanti operatori lavorano insieme su una fase (dalla 0.124.0): uno, se non
// è detto.
function faseOperatori(r) { return Math.max(1, Math.round(Number(r && r.operators) || 0) || 1); }
// Le ore che una fase può fare in un giorno: un operatore per gli operatori
// della fase. La capacità del centro qui non entra: la programmazione a
// ritroso è a capacità infinita, e il tetto del centro lo mette la coda a
// capacità finita (capacita.js), dove le fasi se lo dividono.
function faseOreGiorno(wc, operatori) {
  return wcHoursPerDay(wc) * faseOperatori({ operators: operatori });
}
// Attrezzaggio, coda e trasporto stanno sulla **fase** (dalla 0.131.0): una
// tornitura e una foratura sullo stesso centro non si piazzano nello stesso
// tempo, e lo stesso terzista può dover andare a prendere un pezzo più lontano
// di un altro. Centro e fornitore tengono il valore che si **propone** alla
// fase nuova. Una fase senza il campo — una revisione di prima, un dato
// arrivato per un'altra strada — vale quello del centro o del fornitore, come
// prima.
function faseValore(r, campo, ripiego) {
  const v = r ? r[campo] : null;
  return v != null && v !== '' && Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : ripiego();
}
function faseAttrezzaggio(r) {
  return faseValore(r, 'setupHours', () => wcAttrezzaggio(getWorkCenter(r && r.workCenterId)));
}
function faseCoda(r) {
  return Math.round(faseValore(r, 'queueDays', () => wcCoda(getWorkCenter(r && r.workCenterId))));
}
function faseTrasporto(r) {
  return Math.round(faseValore(r, 'transitDays', () => supplierTransitDays(r && r.supplierId)));
}
// I valori proposti dal centro alle sue fasi nuove.
function wcAttrezzaggio(wc) { return wc ? Math.max(0, Number(wc.setupHours) || 0) : 0; }
function wcCoda(wc) { return wc ? Math.max(0, Math.round(Number(wc.queueDays) || 0)) : 0; }
// Giorni lavorativi di una fase interna per `pezzi` pezzi: le ore-uomo
// (attrezzaggio + ore/pz × pezzi) divise per le ore che la fase fa in un
// giorno, più la sua coda. 80 ore con due operatori a 8 ore sono 5 giorni.
// `r` è una fase di ciclo o di ODP: centro, ore, operatori, attrezzaggio, coda.
function internalOpDays(r, pezzi) {
  const ore = faseAttrezzaggio(r) + (Number(r && r.hours) || 0) * (Number(pezzi) || 0);
  // Il millesimo toglie l'errore del float: 16 ore a 8 al giorno sono due
  // giorni, non tre.
  const giorno = faseOreGiorno(getWorkCenter(r && r.workCenterId), r && r.operators);
  return (ore > 0 ? Math.ceil(ore / giorno - 1e-9) : 0) + faseCoda(r);
}
// Il trasporto da e verso un terzista, andata più ritorno: il valore del
// fornitore, che si propone alle sue fasi di conto lavoro.
function supplierTransitDays(supplierId) {
  const s = supplierId ? getSupplier(supplierId) : null;
  return s ? Math.max(0, Number(s.transitDays) || 0) : 0;
}
// Giorni-fornitore di una tratta: attraversamento delle sue fasi più il
// trasporto, una volta sola — il pezzo va e torna una volta per tratta, e il
// trasporto è quello scritto sulla **prima** fase della tratta.
function runLeadDays(fasi) {
  if (!fasi || !fasi.length) return 0;
  return fasi.reduce((s, r) => s + Math.max(0, Number(r && r.days) || 0), 0) + faseTrasporto(fasi[0]);
}
// L'invio di una tratta (o l'ordine di un acquisto) che deve rientrare il
// giorno `rientro`: `giorni` giorni-fornitore prima (calendario.js).
function runSendDate(rientro, giorni) {
  if (!rientro) return '';
  if (typeof supplierDaysBefore === 'function') return supplierDaysBefore(rientro, giorni) || addDays(rientro, -(Number(giorni) || 0));
  return addDays(rientro, -(Number(giorni) || 0));
}
// L'arrivo di quello che parte (o si ordina) il giorno `da`: il verso opposto
// di runSendDate, con la stessa aritmetica.
function supplierArrival(da, giorni) {
  if (!da) return '';
  if (typeof supplierDaysAfter === 'function') return supplierDaysAfter(da, giorni) || addDays(da, Number(giorni) || 0);
  return addDays(da, Number(giorni) || 0);
}
// Indietro di `n` giorni lavorativi (calendario.js); senza calendario caricato
// si ricade sui giorni di calendario, che è il comportamento di prima.
function schedBack(iso, n) {
  if (!iso || !(n > 0)) return iso || '';
  return typeof addWorkDays === 'function' ? addWorkDays(iso, -n) : addDays(iso, -n);
}
// La data in cui un componente serve, dato l'inizio del lavoro sul padre: il
// margine fra livelli, se dichiarato, la anticipa ancora.
function schedChildDue(start) {
  const m = Math.max(0, Math.round(Number(((typeof db !== 'undefined' && db && db.settings) || {}).scheduleBufferDays) || 0));
  return schedBack(start, m);
}
// La data in cui serve una riga di distinta: all'inizio della sua fase di
// consumo (faseConsumo, dalla 0.138.0), col margine fra livelli. Una riga
// senza fase, o un padre senza fasi, serve all'inizio del lavoro: `primo`.
function schedRigaDue(riga, padre, prog, primo) {
  const k = faseConsumo(riga, padre);
  const f = k > 0 && prog && prog.fasi ? prog.fasi[k] : null;
  return f && f.start ? schedChildDue(f.start) : primo;
}
// Il programma del ciclo di una parte: per ogni fase (per indice fra le sole
// lavorazioni, come mrpPhaseKey) l'inizio e la fine, e l'inizio della prima.
// A ritroso dall'ultima: la fine di una fase è l'inizio di quella che segue.
function schedPart(it, qty, due) {
  const ops = cicloFasi(it);
  const tratte = typeof clCycleRuns === 'function' ? clCycleRuns(it)
    : ops.map((r, k) => ({ from: k, to: k, supplierId: r.supplierId || '', esterna: !!r.supplierId }));
  return schedOps(ops, tratte, qty, due);
}
// Il cuore di schedPart, separato dal ciclo vivo: lo usa anche l'ordine di
// produzione sulle sue fasi **congelate** (views-prod.js), che hanno gli stessi
// campi di una riga di ciclo — centro, terzista, ore, giorni — e le tratte già
// scritte (runFrom/runTo). Una sola aritmetica per le due strade.
//
// `steps` sono le tappe in ordine di esecuzione: una per fase interna, una per
// tratta esterna. Servono all'albero del programma (Gantt, data fattibile),
// che le ripercorre in avanti con le stesse durate.
function schedOps(ops, tratte, qty, due) {
  const fasi = new Array(ops.length);
  const steps = [];
  if (!due) {
    ops.forEach((r, k) => { fasi[k] = { start: '', end: '', days: 0, esterna: !!r.supplierId }; });
  }
  let fine = due || '';
  for (let t = tratte.length - 1; t >= 0; t--) {
    const run = tratte[t];
    if (run.esterna) {
      const gg = runLeadDays(ops.slice(run.from, run.to + 1));
      const invio = due ? runSendDate(fine, gg) : '';
      if (due) for (let k = run.from; k <= run.to; k++) fasi[k] = { start: invio, end: fine, days: gg, esterna: true, run };
      steps.unshift({ esterna: true, from: run.from, to: run.to, supplierId: run.supplierId,
        workCenterId: ops[run.from].workCenterId || '', start: invio, end: fine, days: gg });
      fine = invio;
      continue;
    }
    for (let k = run.to; k >= run.from; k--) {
      const gg = internalOpDays(ops[k], qty);
      const inizio = due ? schedBack(fine, gg) : '';
      if (due) fasi[k] = { start: inizio, end: fine, days: gg, esterna: false, run };
      steps.unshift({ esterna: false, from: k, to: k, supplierId: '', workCenterId: ops[k].workCenterId || '',
        start: inizio, end: fine, days: gg });
      fine = inizio;
    }
  }
  return { start: fine, end: due || '', fasi, steps };
}
// Il montaggio di un assieme: le fasi del suo ciclo in fila — le interne per le ore sul centro, le tratte dal terzista per i loro
// giorni più il trasporto, come in schedOps.
function assemblyDaysOf(it, qty) {
  const ops = cicloFasi(it);
  return clCycleRuns(it).reduce((s, t) => s + (t.esterna
    ? runLeadDays(ops.slice(t.from, t.to + 1))
    : ops.slice(t.from, t.to + 1).reduce((a, r) => a + internalOpDays(r, qty), 0)), 0);
}
// Le fasi si programmano a ritroso come quelle di una parte (schedPart), e il
// montaggio comincia con la prima; senza fasi l'assieme si monta il giorno
// della consegna. I vecchi giorni di montaggio dichiarati (assemblyDays) non
// contano più: restano nei dati solo per le versioni precedenti.
function schedAssembly(it, qty, due) {
  const gg = due ? assemblyDaysOf(it, qty) : 0;
  if (!cicloFasi(it).length) return { start: schedBack(due, 0), end: due || '', days: 0, fasi: [], steps: [] };
  const prog = schedPart(it, qty, due);
  return { start: due ? prog.start : '', end: due || '', days: gg, fasi: prog.fasi, steps: prog.steps };
}

// ─── L'albero del programma ───
// Gli aggregati di mrpExplode dicono *cosa* comprare e *entro quando*, ma
// sommano: lo stesso perno in due rami è una riga sola. Il percorso critico e il
// Gantt vogliono invece l'albero di **una** riga di piano, nodo per nodo, con le
// date di ciascuno. Le regole di discesa sono quelle di mrpDescend — scarti,
// parti comprate, ciclo, margine fra livelli — e le date vengono dalle stesse
// funzioni: un nodo che dicesse una data diversa dalla riga aggregata sarebbe
// un secondo programma. Un test lo tiene fermo.
//   nodo = { item, kind: 'asm'|'make'|'buy', qty, start, end, days, lead, steps, children }
// `start`/`end` sono le date **a ritroso**: per un acquisto ordine e arrivo,
// per una parte lancio e pronto, per un assieme inizio e fine montaggio.
// `lotti`: quelli di mrpLotti() sul piano intero, come nell'esplosione.
function schedTree(itemId, qty, due, ancestors, lotti) {
  const it = getItem(itemId);
  if (!it || !(qty > 0)) return null;
  const visti = ancestors || new Set();
  if (visti.has(itemId)) return null;
  const compra = it.type === 'materiale' || it.type === 'acquistato'
    || (it.type === 'parte' && partSourcing(it) === 'buy');
  if (compra) {
    const lead = buyLeadDays(it);
    return { item: it, kind: 'buy', qty, start: due ? runSendDate(due, lead) : '', end: due || '',
      days: lead, lead, supplierId: buySupplierId(it), steps: [], children: [] };
  }
  const next = new Set(visti); next.add(itemId);
  if (it.type === 'parte') {
    const prog = schedPart(it, mrpLotto({ lotti }, it, qty), due);
    const figli = [];
    const perFigli = schedChildDue(prog.start);
    distintaRighe(it).forEach(c => {
      const n = schedTree(c.itemId, qty * (Number(c.qty) || 0) * (1 + (Number(c.scrapPct) || 0) / 100), schedRigaDue(c, it, prog, perFigli), next, lotti);
      if (n) figli.push(n);
    });
    return { item: it, kind: 'make', qty, start: prog.start, end: due || '', days: 0,
      steps: prog.steps, children: figli };
  }
  const prog = schedAssembly(it, mrpLotto({ lotti }, it, qty), due);
  const perFigli = schedChildDue(prog.start);
  const figli = [];
  varRigheComuni(it).forEach(c => {
    const f = (Number(c.qty) || 0) * (1 + (Number(c.scrapPct) || 0) / 100);
    const n = schedTree(c.itemId, qty * f, schedRigaDue(c, it, prog, perFigli), next, lotti);
    if (n) figli.push(n);
  });
  return { item: it, kind: 'asm', qty, start: prog.start, end: due || '', days: prog.days,
    steps: [], children: figli };
}
// I nodi dell'albero in ordine di disegno (padre, poi figli), con il livello.
function schedFlat(node, livello, out) {
  const acc = out || [];
  if (!node) return acc;
  acc.push({ node, livello: livello || 0 });
  node.children.forEach(c => schedFlat(c, (livello || 0) + 1, acc));
  return acc;
}

// ─── La data fattibile: lo stesso albero, in avanti da oggi ───
// A ritroso si risponde a «entro quando deve succedere ogni cosa»; in avanti a
// «se comincio oggi, quando sono pronto davvero». Le durate sono le stesse
// (le `steps` dell'albero, i giorni di listino, il montaggio), cambia il verso.
//
// Una foglia d'acquisto è pronta:
//   - **oggi**, se la giacenza libera (esistente meno quanto impegnano gli altri
//     piani aperti) basta per tutto il piano;
//   - all'**arrivo** della riga d'ordine che la copre, se basta con l'in arrivo
//     (la data confermata, se c'è, altrimenti quella chiesta);
//   - fra i **giorni del listino** a partire da oggi, se va ancora comprata —
//     e mai prima dell'ultimo arrivo già atteso.
// La scorta minima non trattiene niente: è un margine, e in un ritardo si usa.
//
// La data di una riga d'ordine si legge come la data di un listino (dalla
// 0.111.0): un arrivo in un giorno di chiusura si riceve il primo giorno
// lavorativo dopo, e un arrivo **scaduto** — la data è passata e la merce non
// è stata ricevuta — non vale «pronto oggi»: se stamattina non c'è, il primo
// mattino in cui può esserci è il prossimo giorno lavorativo. Prima un ordine
// in ritardo di tre settimane dava la data fattibile più ottimista possibile.
// Gli ordini scaduti usati per coprire si ricordano (`disp.info`): il percorso
// critico e il Gantt li dicono.
//
// Limiti, detti: le parti prodotte non si guardano a magazzino (come nel
// fabbisogno, dove non hanno netto), un ordine di produzione già avviato
// accorcia il conto solo per il materiale che ha prelevato, e la capacità
// resta infinita.
function schedDisponibilita(planId, lines) {
  const oggi = schedOggi();
  const scade = oggiISO();
  const domani = addWorkDays(oggi, 1);
  const lordo = new Map();
  mrpExplode(lines, mrpOpzPiano(planId)).buy.forEach(e => lordo.set(e.item.id, e.qty));
  // Gli arrivi vengono dall'indice del magazzino (dalla 0.105.6), lo stesso del
  // netto: quantità già nell'unità di gestione — una riga d'ordine in metri su
  // un articolo a kg contava i metri come kg — e anche le righe senza data, che
  // valgono come arrivate in tempo, come in incomingEntro. Prima si perdevano, e
  // merce già ordinata risultava ancora da comprare col tempo del fornitore.
  const arrivi = new Map();
  const arriviDi = id => {
    if (!arrivi.has(id)) arrivi.set(id, (stockOf(id).arrivi || []).map(a => {
      const eta = a.eta ? String(a.eta).slice(0, 10) : '';
      const scaduto = !!eta && eta < scade;
      const giorno = eta && !scaduto ? (nextWorkDay(eta) || eta) : '';
      const data = !eta ? oggi : scaduto ? domani : (giorno > oggi ? giorno : oggi);
      return { data, eta, scaduto, number: a.number || '', qty: Number(a.qty) || 0 };
    }));
    return arrivi.get(id);
  };
  const memo = new Map();
  const calcola = it => {
    if (memo.has(it.id)) return memo.get(it.id);
    // Il già prelevato dai documenti del piano non è più a magazzino e non va
    // più cercato: vedi commitIndex.
    const serve = Math.max(0, (lordo.get(it.id) || 0) - prelevatoPer(it.id, planId || null));
    const s = stockOf(it.id);
    const impegnato = commitsOn(it.id, planId || null).reduce((t, c) => t + c.qty, 0);
    let libero = s.onHand - impegnato;
    const out = { pronto: oggi, attesa: '', scaduti: [] };
    if (libero < serve) {
      const righe = arriviDi(it.id).slice().sort((a, b) => a.data.localeCompare(b.data));
      let coperto = false;
      for (const r of righe) {
        libero += r.qty;
        if (r.data > out.pronto) out.pronto = r.data;
        if (r.eta && r.data > out.attesa) out.attesa = r.data;
        if (r.scaduto) out.scaduti.push({ number: r.number, eta: r.eta });
        if (libero >= serve) { coperto = true; break; }
      }
      if (!coperto) {
        const comprato = supplierArrival(oggi, buyLeadDays(it));
        if (comprato > out.pronto) out.pronto = comprato;
      }
    }
    memo.set(it.id, out);
    return out;
  };
  const disp = it => calcola(it).pronto;
  disp.info = calcola;
  return disp;
}
// Oggi, per il programma: il primo giorno in cui si può fare qualcosa. Sta in
// una funzione sola perché i test la fermano a una data.
function schedOggi() { return nextWorkDay(oggiISO()) || oggiISO(); }
// Il passo in avanti su un nodo: riempie `fStart`/`fEnd` (e quelli delle
// tappe), e `crit`, il figlio che ha deciso quando il nodo può cominciare.
function schedForward(node, disp) {
  const oggi = schedOggi();
  if (node.kind === 'buy') {
    node.fEnd = disp(node.item);
    node.fStart = oggi;
    node.crit = null;
    // Quando arriva quello che è già ordinato, e quali ordini sono scaduti:
    // il percorso critico e il Gantt lo dicono accanto alla data.
    const inf = disp.info ? disp.info(node.item) : null;
    node.attesa = inf ? inf.attesa : '';
    node.scaduti = inf ? inf.scaduti : [];
    return node.fEnd;
  }
  let pronto = oggi, crit = null;
  node.children.forEach(c => {
    const e = schedForward(c, disp);
    if (e > pronto) { pronto = e; crit = c; }
  });
  const margine = Math.max(0, Math.round(Number(((db && db.settings) || {}).scheduleBufferDays) || 0));
  if (crit && margine) pronto = addWorkDays(pronto, margine);
  node.crit = crit;
  if (node.kind === 'asm') {
    node.fStart = node.days > 0 ? nextWorkDay(pronto) : pronto;
    node.fEnd = node.days > 0 ? addWorkDays(node.fStart, node.days) : pronto;
    return node.fEnd;
  }
  node.fStart = pronto;
  node.steps.forEach(st => {
    if (st.esterna) {
      st.fStart = nextWorkDay(pronto);
      st.fEnd = st.days > 0 ? supplierArrival(st.fStart, st.days) : st.fStart;
    } else {
      st.fStart = st.days > 0 ? nextWorkDay(pronto) : pronto;
      st.fEnd = st.days > 0 ? addWorkDays(st.fStart, st.days) : pronto;
    }
    pronto = st.fEnd;
  });
  node.fEnd = pronto;
  return pronto;
}
// Il percorso critico: dalla radice, di figlio decisivo in figlio decisivo.
function schedCritico(node) {
  const out = [];
  for (let n = node; n; n = n.crit) out.push(n);
  return out;
}
// Per ogni riga di piano: richiesta, fattibile, margine in giorni lavorativi
// (negativo = la consegna richiesta non si regge), l'albero e il percorso.
function planFeasibility(plan) {
  const disp = schedDisponibilita(plan.id, plan.lines);
  const lotti = mrpLotti(plan.lines);
  return (plan.lines || []).map(l => {
    const tree = schedTree(l.itemId, Number(l.qty) || 0, l.dueDate || '', null, lotti);
    if (!tree) return { lineId: l.id, richiesta: l.dueDate || '', fattibile: '', margine: null, tree: null, critico: [] };
    const fattibile = schedForward(tree, disp);
    const margine = l.dueDate && fattibile ? workDaysBetween(fattibile, l.dueDate) : null;
    return { lineId: l.id, richiesta: l.dueDate || '', fattibile, margine, tree, critico: schedCritico(tree) };
  });
}
// Che cosa fa un nodo, a parole: serve al percorso critico e al Gantt.
function schedNodeLabel(n) {
  if (n.kind === 'buy') return 'acquisto' + (n.supplierId ? ' da ' + (supplierName(n.supplierId) || '') : '') + (n.lead ? ` (${n.lead} gg)` : '');
  if (n.kind === 'asm') return 'montaggio' + (n.days ? ` (${n.days} gg)` : '');
  const est = n.steps.filter(x => x.esterna).length;
  return `fabbricazione, ${n.steps.length} ${n.steps.length === 1 ? 'tappa' : 'tappe'}` + (est ? `, ${est} dal terzista` : '');
}
function schedStepLabel(n, st) {
  const nos = st.from === st.to ? `fase ${cyclePhaseNumber(st.from)}` : `fasi ${cyclePhaseNumber(st.from)}-${cyclePhaseNumber(st.to)}`;
  const wc = getWorkCenter(st.workCenterId);
  return `${nos} ${wc ? wc.name : ''}` + (st.esterna ? ` da ${supplierName(st.supplierId) || 'terzista'}` : '');
}
// Un'ora di lavoro dentro il suo secchiello: centro di lavoro × settimana.
// Il dettaglio (chi ha portato quelle ore) si accumula accanto al totale, e non
// è un vezzo: vale qui la regola già scritta per gli impegni di magazzino — un
// numero che non dice da dove viene non si può contestare, e quindi neanche
// credere.
// Le voci portano anche i **pezzi** e le ore per pezzo, non solo il totale:
// «62 ore» senza sapere su quanti pezzi non si può verificare, e un numero che
// non si può verificare non si può nemmeno contestare.
// L'attrezzaggio della fase (dalla 0.131.0) entra una volta per lotto: `setup`
// sono le sue ore, zero se la fase le ha già portate in un altro ramo.
function mrpAddLoad(map, workCenterId, due, oreUnit, pezzi, it, faseNo, setup) {
  const att = Math.max(0, Number(setup) || 0);
  const ore = (Number(oreUnit) || 0) * (Number(pezzi) || 0) + att;
  if (!workCenterId || !(ore > 0)) return;
  // Una riga senza data non ha settimana, e non se ne inventa una: finisce in un
  // secchiello dichiarato, come un arrivo senza data non è un ritardo.
  const wk = settimanaISO(due);
  const k = workCenterId + '|' + wk;
  let e = map.get(k);
  if (!e) { e = { workCenterId, week: wk, hours: 0, voci: [] }; map.set(k, e); }
  e.hours += ore;
  e.voci.push({ itemId: it.id, code: it.code || '', name: it.name || '', faseNo,
    hoursUnit: Number(oreUnit) || 0, qty: Number(pezzi) || 0, setup: att, hours: ore });
}
// Le ore di attrezzaggio che la fase porta al carico: una volta sola per
// lotto, anche se la parte compare in più rami della distinta.
function mrpLoadSetup(acc, it, r, k) {
  const key = mrpPhaseKey(it.id, k, r.workCenterId);
  if (acc.setupVisti.has(key)) return 0;
  acc.setupVisti.add(key);
  return faseAttrezzaggio(r);
}
// ─── Date: da quando serve a entro quando ordinare ───
// `leadDays` stava a listino da versioni e non entrava in nessun conto: c'era
// scritto che il fornitore consegna in 21 giorni e nessuno se ne faceva niente.
// Adesso è il ponte fra «serve per il 30 settembre» e «va ordinato entro il 9».
// Sotto una settimana di lavoro di margine si avvisa: cinque giorni
// **lavorativi** (dalla 0.110.0; prima erano sette di calendario, che il
// venerdì voleva dire tre giorni di lavoro e a Natale anche meno).
const URGENCY_WARN_DAYS = 5;
// L'ultimo giorno dentro la finestra d'avviso, a partire da `oggi`.
function urgencyLimit(oggi) {
  return typeof addWorkDays === 'function' ? addWorkDays(oggi, URGENCY_WARN_DAYS) : addDays(oggi, URGENCY_WARN_DAYS);
}
// I conti si fanno in UTC, non nell'ora locale. Con `T00:00:00` la data nasce a
// mezzanotte locale e `toISOString()` la riporta in UTC: a est di Greenwich
// torna indietro di un giorno, e ogni data d'ordine risultava anticipata di
// ventiquattr'ore — uno sbaglio che nessuno avrebbe notato guardando lo schermo.
// Qui non esistono orari: sono date, e le date non hanno fuso.
function addDays(iso, giorni) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d)) return '';
  d.setUTCDate(d.getUTCDate() + (Number(giorni) || 0));
  return d.toISOString().slice(0, 10);
}
// ─── Settimane ISO ───
// Il secchiello del carico dei centri. Stessa disciplina UTC di addDays, e per
// lo stesso motivo: costruire la data a mezzanotte locale la sposta di un
// giorno a est di Greenwich, e una data che scivola al lunedì precedente
// cambia settimana — cioè sposta le ore in un'altra colonna del prospetto.
//
// La regola ISO-8601 è quella del giovedì: la settimana 1 di un anno è quella
// che contiene il primo giovedì. Ne segue che i primi giorni di gennaio possono
// appartenere alla settimana 52 o 53 dell'anno prima, ed è il caso limite che
// una implementazione ingenua sbaglia in silenzio una volta l'anno.
// Funzione pura di una stringa: si ricorda il risultato, perché un piano grande
// chiede migliaia di volte la settimana delle stesse poche date.
const _settimaneNote = new Map();
function settimanaISO(iso) {
  if (!iso) return '';
  const k = String(iso);
  let v = _settimaneNote.get(k);
  if (v === undefined) {
    v = settimanaISOCalcola(k);
    if (_settimaneNote.size > 5000) _settimaneNote.clear();
    _settimaneNote.set(k, v);
  }
  return v;
}
function settimanaISOCalcola(iso) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  if (isNaN(d)) return '';
  // Ci si sposta al giovedì della stessa settimana: da lì l'anno è per
  // definizione quello a cui la settimana appartiene.
  const giorno = (d.getUTCDay() + 6) % 7;            // 0 = lunedì
  d.setUTCDate(d.getUTCDate() - giorno + 3);
  const anno = d.getUTCFullYear();
  const primoGiovedi = new Date(Date.UTC(anno, 0, 4));
  primoGiovedi.setUTCDate(primoGiovedi.getUTCDate() - ((primoGiovedi.getUTCDay() + 6) % 7) + 3);
  const n = 1 + Math.round((d - primoGiovedi) / 604800000);
  return anno + '-W' + String(n).padStart(2, '0');
}
// Il lunedì della settimana di una data. Serve all'intestazione di colonna:
// «2026-W37» da solo non dice a nessuno di che giorni si parla.
function inizioSettimana(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  if (isNaN(d)) return '';
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
// oggiISO() e fmtDateIt() sono in core.js, accanto a fmtStamp.
// Giorni di consegna dichiarati da una quotazione. Senza quotazione, o senza il
// dato, vale zero: nessun anticipo, non un anticipo inventato.
function leadDaysOfRow(row) {
  const g = row ? Number(row.leadDays) : NaN;
  return isFinite(g) && g > 0 ? g : 0;
}
// Urgenza di una riga d'acquisto: 'ritardo' | 'urgente' | 'ok' | '' (senza data).
// Si guarda la data entro cui ordinare, non quella in cui serve: è l'unica su
// cui si può ancora fare qualcosa.
function urgenzaOrdine(orderBy) {
  if (!orderBy) return '';
  const oggi = oggiISO();
  if (orderBy < oggi) return 'ritardo';
  return orderBy <= urgencyLimit(oggi) ? 'urgente' : 'ok';
}
const URGENZA_LABEL = {
  ritardo: { txt: ico('warning', 'tinted', '') + ' in ritardo', cls: 'mrp-warn', desc: 'La data entro cui ordinare è già passata' },
  urgente: { txt: ico('clock', 'tinted', '') + ' da ordinare', cls: 'mrp-warn', desc: 'Meno di ' + URGENCY_WARN_DAYS + ' giorni lavorativi di margine' },
  ok: { txt: '', cls: '', desc: '' },
};

// Da chi si compra un articolo e con quale listino: il fornitore della
// quotazione in uso, la quotazione più recente di quel fornitore (vedi il
// commento in mrpBuyRow). Stanno fuori perché li chiede anche l'albero del
// programma, che deve sapere quanti giorni aspettare senza costruire una riga
// d'acquisto intera.
function buySupplierId(it) {
  const attiva = activePriceRow(it);
  return (attiva && attiva.supplierId) || it.supplierId || '';
}
function buyDocRow(it) { return supplierPriceRow(it, buySupplierId(it)) || activePriceRow(it); }
function buyLeadDays(it) { return leadDaysOfRow(buyDocRow(it)); }
// Riga d'acquisto completa: il prezzo è quello IN USO nella costificazione, la
// quotazione migliore si segnala soltanto — nessun prezzo cambia da sé.
// `netMode` è un parametro, non una lettura del toggle: la riga resta logica
// pura e la vista decide quale delle due domande sta facendo.
//   qty      = fabbisogno lordo, quanto serve. Non cambia mai: è la proprietà
//              del prodotto, e serve per l'analisi di costo.
//   net      = quanto manca comprare, tolto l'esistente e l'in arrivo, e tolto
//              quello che i piani aperti più urgenti hanno già promesso.
//   qtyOrder = quella con cui si fanno i conti e nascono i documenti.
//
// `planId` dice **da quale piano si sta guardando**: serve a non contare come
// concorrenza il fabbisogno del piano stesso. Passarlo è obbligatorio nei fatti
// — ometterlo fa risultare ogni riga impegnata contro sé stessa e raddoppia gli
// acquisti — e infatti nessuna vista chiama questa funzione direttamente.
// La quantità che va su un documento. Scarti e coefficienti frazionari danno
// 10,5 pezzi o 0,30000000000000004 kg: un ordine per mezza vite non si
// riceve mai per intero, e il residuo restava «in arrivo» per sempre. Le
// unità che si contano (pezzi, numero, set, confezioni) si arrotondano
// all'intero in su; le altre a sei decimali (dalla 0.105.5).
const UOM_INTERE = ['pz', 'n', 'nr', 'set', 'conf', 'kit'];
function uomIntera(code) { return UOM_INTERE.includes(String(code || '').trim().toLowerCase()); }
function quantitaDaOrdinare(q, uom) {
  const n = Number(q) || 0;
  if (!(n > 0)) return n;
  return uomIntera(uom) ? Math.ceil(n - 1e-9) : Math.round(n * 1e6) / 1e6;
}
function mrpBuyRow(entry, netMode, planId) {
  const it = entry.item;
  const attiva = activePriceRow(it);
  const price = Number(it[costField(it)]) || 0;
  // Il confronto è fra costi nell'unità di gestione, non fra prezzi grezzi:
  // vedi bestPriceRow(). Un €/kg accanto a un €/m non è un confronto. Dalla
  // 0.109.0 è lo stesso del Riepilogo (priceCompare): solo quotazioni valide e
  // solo con **altri** fornitori, contro il listino di oggi del fornitore in uso.
  const cmp = priceCompare(it);
  const bestPrice = cmp && cmp.best ? cmp.migliore : null;
  const impegni = commitsOn(it.id, planId || null);
  // Quello che i documenti del piano hanno già prelevato è uscito
  // dall'esistente: resta da coprire solo il resto del lordo, o il piano
  // ricomprerebbe ciò che ha appena usato (vedi commitIndex).
  const prelevato = prelevatoPer(it.id, planId || null);
  const st = stockFor(it, Math.max(0, entry.qty - prelevato), impegni.reduce((s, c) => s + c.qty, 0));
  const qtyOrder = quantitaDaOrdinare(netMode ? st.net : entry.qty, itemUom(it));

  // ─── Da chi si compra, e a quale listino ───
  // Il fornitore lo decide la quotazione **in uso**: è la scelta che qualcuno ha
  // fatto, ed è la stessa da cui viene il costo. Il listino che finirà sul
  // documento è invece la quotazione **più recente di quel fornitore** — quello
  // che ci fa oggi, non quello che gli abbiamo scelto mesi fa. Nel caso normale
  // sono la stessa riga; quando divergono, il documento deve dire il vero e la
  // divergenza va mostrata (`listinoDiverso`), non appianata di nascosto.
  const supplierId = buySupplierId(it);
  const doc = buyDocRow(it);
  const quotato = doc && doc.price !== '' && doc.price != null;

  // Il documento nasce sempre nell'unità di gestione dell'articolo — è quella
  // con cui si ordina e si riceve davvero, non quella in cui il fornitore
  // valorizza il listino. Il prezzo di riga è quindi il costo **convertito**
  // (docInGestione), mai il prezzo grezzo della quotazione.
  const docInGestione = quotato ? (rowUnitCost(it, doc) || 0) : null;
  const priceDoc = docInGestione != null ? docInGestione : 0;
  // Il minimo del fornitore è dichiarato nella SUA unità di quotazione: va
  // convertito nell'unità di gestione prima di confrontarlo con la quantità
  // ordinata, altrimenti l'allarme scatterebbe sul numero sbagliato.
  const minQtyGrezzo = doc && doc.minQty !== '' && doc.minQty != null ? (Number(doc.minQty) || 0) : 0;
  const minQty = minQtyGrezzo > 0 ? fromAltUom(it, minQtyGrezzo, priceUomOf(it, doc)) : 0;

  // Data in cui serve, giorni di consegna di quel listino, data entro cui ordinare.
  const due = entry.due || '';
  // Giorni del fornitore, lavorativi o di calendario come impostato; la data
  // d'ordine cade su un giorno in cui l'ufficio è aperto (vedi calendario.js).
  const leadDays = leadDaysOfRow(doc);
  const orderBy = due ? runSendDate(due, leadDays) : '';
  const tardi = mrpArrivoTardi(it, due, Math.max(0, entry.qty - prelevato), st);
  return {
    item: it, qty: entry.qty, uom: itemUom(it),
    due, leadDays, orderBy, urgenza: urgenzaOrdine(orderBy),
    priceDoc, amountDoc: priceDoc * qtyOrder,
    onHand: st.onHand, incoming: st.incoming, safety: st.safety, lotSize: st.lotSize, lotMode: st.lotMode,
    // Impegnato dai piani aperti **più urgenti**, e il dettaglio di chi lo impegna:
    // un numero che toglie merce senza dire chi se l'è presa è un numero che non
    // si può contestare, e quindi neanche credere.
    committed: st.committed, impegni, libero: st.libero, prelevato,
    net: st.net, coperto: !!netMode && st.coperto, qtyOrder,
    supplierId,
    price, amount: price * qtyOrder,
    bestPrice, saving: cmp && cmp.saving > 0 ? cmp.saving * qtyOrder : 0,
    // Il minimo del fornitore è già stato convertito nell'unità di gestione
    // qui sopra: il confronto è alla pari con la quantità ordinata.
    minQty, underMin: minQty > 0 && qtyOrder > 0 && qtyOrder < minQty,
    // Righe che manderebbero un ordine a zero o senza intestatario: si segnalano
    // qui, prima di generare il documento, non dopo averlo mandato al fornitore.
    noSupplier: !supplierId,
    noPrice: !(price > 0),
    // Il documento partirebbe senza prezzo perché **quel fornitore** non ha
    // quotato questo articolo, pur essendocene uno in costificazione.
    noDocPrice: !quotato,
    // Il listino applicabile dice un prezzo diverso da quello con cui è stato
    // costificato: il documento seguirà il listino.
    listinoDiverso: docInGestione != null && Math.abs(docInGestione - price) > 0.00005,
    docInGestione,
    // Le bozze d'ordine di **altri** (riordino, un altro piano, scritte a mano)
    // con questo articolo: non sono in arrivo, e il netto non le vede.
    bozze: bozzeAltrui(it.id, planId),
    // Ordinato, ma arriva dopo il giorno in cui serve (dalla 0.111.0): la data
    // in cui l'in arrivo basta davvero, o vuota. E gli ordini scaduti.
    arrivoTardi: tardi.data, scaduti: tardi.scaduti,
    // Modulo Alternativi: quanto di questo articolo è passato a un altro in
    // questo piano, al posto di chi sta, e gli equivalenti da proporre.
    planId: planId || null,
    sostituito: entry.sostituito || 0, sostituisce: entry.sostituisce || [],
    alternative: typeof altProposte === 'function' ? altProposte(it, planId, st.net) : [],
  };
}
// «Coperto» guardava solo le quantità: un ordine che arriva il 5/11 copriva un
// fabbisogno del 30/10 come se fosse già a scaffale, e la riga spariva dal
// netto senza un avviso (la copertura di commessa lo diceva già). Stesso conto
// del netto con il solo in arrivo **in tempo** (incomingEntro, come
// jobCoverage): se così il netto cresce, la merce c'è ma tardi, e la data è
// quella in cui gli arrivi tardivi bastano. Scaduti: righe d'ordine aperte con
// la data già passata, che il programma aspetta al prossimo giorno lavorativo.
function mrpArrivoTardi(it, due, lordo, st) {
  const oggi = oggiISO();
  const scaduti = (stockOf(it.id).arrivi || []).filter(a => a.eta && String(a.eta).slice(0, 10) < oggi)
    .map(a => ({ number: a.number || '', eta: String(a.eta).slice(0, 10) }));
  const out = { data: '', scaduti };
  if (!due || !(lordo > 0)) return out;
  const arr = incomingEntro(it.id, due);
  if (!arr.tardivi.length) return out;
  const netto = inc => netRequirement(lordo, st.onHand, inc, st.safety, st.lotSize, st.committed, st.lotMode);
  if (!(netto(arr.inTempo) > st.net)) return out;
  let inc = arr.inTempo;
  for (const a of arr.tardivi) {
    inc += a.qty;
    out.data = String(a.eta).slice(0, 10);
    if (!(netto(inc) > st.net)) break;
  }
  return out;
}
// ─── Le bozze d'ordine degli altri (dalla 0.105.6) ───
// Una bozza non è merce in arrivo — non è partita — e il netto giustamente non
// la conta. Ma il piano non la vedeva nemmeno: una bozza del riordino sotto
// scorta e gli ordini del piano partivano entrambi, e la stessa merce si
// comprava due volte. Si dicono accanto alla riga, e nella scheda di
// generazione degli ordini la riga nasce non spuntata, come fa il riordino.
// `piani` è un id, un Set o niente, come per mrpBuyRow.
let _bozzeIdx = null;
function bozzeAltrui(itemId, piani) {
  if (!_bozzeIdx) {
    _bozzeIdx = new Map();
    (db.orders || []).forEach(o => {
      if (o.status !== 'bozza' || o.active === false) return;
      (o.lines || []).forEach(l => {
        if (!l.itemId) return;
        const it = getItem(l.itemId);
        const lista = _bozzeIdx.get(l.itemId) || [];
        lista.push({ id: o.id, number: o.number || '', planId: o.planId || null,
          qty: it ? fromAltUom(it, l.qty, l.uom) : (Number(l.qty) || 0) });
        _bozzeIdx.set(l.itemId, lista);
      });
    });
  }
  const miei = piani instanceof Set ? piani : new Set(piani ? [piani] : []);
  return (_bozzeIdx.get(itemId) || []).filter(b => !b.planId || !miei.has(b.planId));
}
// ─── Carico dei centri di lavoro ───
// Le ore che i piani chiedono a ciascun centro, settimana per settimana, contro
// la capacità dichiarata sul centro. Capacità infinita: si mostra il
// sovraccarico e non lo si risolve — vedi i tre motivi in cima al file.
//
// Il modo predefinito somma **tutti i piani aperti**, non uno solo, perché è la
// domanda vera: il centro è condiviso, e «la tornitura regge?» non ha risposta
// guardando un piano per volta. È la stessa regola di `commitIndex` per il
// materiale impegnato.
function mrpLoadEntries(plans) {
  const map = new Map();
  (plans || []).forEach(p => {
    const exp = mrpExplodePlan(p);
    // Le parti già fatte non caricano più i centri (0.105.5): le loro ore si
    // tolgono in proporzione ai pezzi che restano. Dalla 0.124.0 anche gli
    // assiemi, i cui montati sono le dichiarazioni e i loro ODP (prodottiDi).
    const lordo = new Map(exp.make.concat(exp.asm).map(m => [m.item.id, m.qty]));
    const quota = new Map();
    const resto = itemId => {
      if (!quota.has(itemId)) {
        const q = lordo.get(itemId);
        quota.set(itemId, q > 0 && typeof daFare === 'function' ? daFare(p.id, itemId, q) / q : 1);
      }
      return quota.get(itemId);
    };
    exp.load.forEach(e => {
      const voci = e.voci.map(v => {
        const f = resto(v.itemId);
        // L'attrezzaggio non si divide: con dei pezzi già fatti la fase è già
        // stata attrezzata, e resta da fare solo il tempo dei pezzi.
        return f === 1 ? v : Object.assign({}, v, { qty: v.qty * f, setup: 0, hours: (v.hours - (v.setup || 0)) * f });
      }).filter(v => v.hours > 0);
      if (!voci.length) return;
      const k = e.workCenterId + '|' + e.week;
      let t = map.get(k);
      if (!t) { t = { workCenterId: e.workCenterId, week: e.week, hours: 0, voci: [] }; map.set(k, t); }
      voci.forEach(v => { t.hours += v.hours; t.voci.push(Object.assign({ planId: p.id, planNumber: p.number || '' }, v)); });
    });
  });
  return Array.from(map.values());
}
// ─── Le ore degli ODP che nessun piano conta ───
// Il carico nasce dall'esplosione dei piani, e un ordine di produzione legato
// al suo piano ci sta già dentro: le sue ore sono quelle del «da fare» del
// piano. Restavano fuori gli ordini che il piano non vede — scritti a mano,
// legati a un piano chiuso, o su una parte che in anagrafica si **compra** e
// che questa volta si fa in casa (il fabbisogno non ne esplode il ciclo). Le
// loro fasi interne occupano i centri come le altre, e Capacità finita e
// Reparto già le mettono in fila: il carico non poteva non vederle.
//
// Le ore sono quelle che restano, come in capacita.js: i pezzi attesi dalla
// fase meno i lavorati, più l'attrezzaggio se la fase non è partita. Stanno
// nella settimana d'inizio pianificata della fase, o della consegna.
// `piano`: 'tutti' per la vista globale (ogni ODP fuori dai piani aperti), o
// l'id di un piano (solo i suoi ODP che la sua esplosione non copre).
const ODP_CARICANO = ['bozza', 'lanciato', 'corso'];
function odpCopertoDalPiano(o, p) {
  if (!p) return false;
  const exp = mrpExplodePlan(p);
  return exp.make.concat(exp.asm).some(e => e.item.id === o.itemId);
}
function odpLoadEntries(piano, plans) {
  const aperti = new Map((plans || (db.plans || []).filter(p => p.active !== false)).map(p => [p.id, p]));
  const map = new Map();
  (db.prodOrders || []).forEach(o => {
    if (o.active === false || !ODP_CARICANO.includes(o.status)) return;
    const suo = o.planId ? aperti.get(o.planId) : null;
    if (piano === 'tutti') { if (suo && odpCopertoDalPiano(o, suo)) return; }
    else if (!piano || o.planId !== piano || !suo || odpCopertoDalPiano(o, suo)) return;
    const it = getItem(o.itemId) || { id: o.itemId, code: o.code || '', name: o.name || '' };
    const sue = new Map();
    (o.phases || []).forEach(f => {
      if (f.supplierId || !f.workCenterId || opChiusa(o, f)) return;
      const resta = Math.max(0, opAttesiFase(o, f) - opProcessati(o, f));
      if (!(resta > 0.000001)) return;
      const setup = opAvviata(o, f) ? 0 : faseAttrezzaggio(f);
      mrpAddLoad(sue, f.workCenterId, String(f.plannedStart || o.dueDate || '').slice(0, 10), Number(f.hours) || 0, resta, it, f.seq, setup);
    });
    // Nel dettaglio di una cella, al posto del piano si legge l'ordine.
    sue.forEach(e => e.voci.forEach(v => Object.assign(v, { planId: o.planId || null, planNumber: o.number || '', odpId: o.id })));
    mrpLoadMetti(map, Array.from(sue.values()));
  });
  return Array.from(map.values());
}
function mrpLoadMetti(map, entries) {
  entries.forEach(e => {
    const k = e.workCenterId + '|' + e.week;
    let t = map.get(k);
    if (!t) { t = { workCenterId: e.workCenterId, week: e.week, hours: 0, voci: [] }; map.set(k, t); }
    t.hours += e.hours; t.voci.push(...e.voci);
  });
}
// Le due liste nella stessa forma: si fondono per centro e settimana.
function mrpLoadUnisci(a, b) {
  const map = new Map();
  mrpLoadMetti(map, a); mrpLoadMetti(map, b);
  return Array.from(map.values());
}
function mrpLoad(plan) { return mrpLoadTable(mrpLoadEntries([plan])); }
function mrpLoadAll() {
  const piani = (db.plans || []).filter(p => p.active !== false);
  return mrpLoadTable(mrpLoadUnisci(mrpLoadEntries(piani), odpLoadEntries('tutti', piani)));
}
// Dalla lista piatta alla tavola centro × settimana, pronta da disegnare.
// La colonna «senza data» sta in testa: quelle ore esistono e non hanno una
// settimana, e ometterle farebbe tornare un totale sbagliato.
function mrpLoadTable(entries) {
  const settimane = Array.from(new Set(entries.map(e => e.week))).sort();
  const conData = settimane.filter(Boolean);
  const senzaData = settimane.includes('');
  const perCentro = new Map();
  entries.forEach(e => {
    if (!perCentro.has(e.workCenterId)) perCentro.set(e.workCenterId, new Map());
    perCentro.get(e.workCenterId).set(e.week, e);
  });
  const righe = Array.from(perCentro.entries()).map(([wcId, celle]) => {
    const wc = getWorkCenter(wcId);
    const cap = wc ? (Number(wc.capacityHours) || 0) : 0;
    return {
      workCenterId: wcId, name: wc ? wc.name : '(centro mancante)', capacity: cap,
      totale: Array.from(celle.values()).reduce((s, e) => s + e.hours, 0),
      celle: new Map(Array.from(celle.entries()).map(([wk, e]) => [wk, {
        week: wk, hours: e.hours, voci: e.voci,
        // Senza capacità dichiarata non si calcola nessuna saturazione: un
        // centro a zero non è sfondato, è **non dichiarato**.
        sat: cap > 0 ? e.hours / cap : null,
        over: cap > 0 && e.hours > cap ? e.hours - cap : 0,
      }])),
    };
  }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { settimane: (senzaData ? [''] : []).concat(conData), righe };
}
// Le settimane in sovraccarico, con i centri nominati. È il riassunto che si
// legge per primo: la tavola dice tutto, questo dice cosa guardare.
function mrpLoadOverload(tab) {
  const out = [];
  tab.settimane.forEach(wk => {
    const centri = tab.righe.filter(r => { const c = r.celle.get(wk); return c && c.over > 0; });
    if (centri.length) out.push({ week: wk, centri: centri.map(r => ({ name: r.name, over: r.celle.get(wk).over })) });
  });
  return out;
}
// Il lunedì di una settimana ISO scritta come «2026-W37». Il 4 gennaio cade per
// definizione nella settimana 1: da lì si conta.
function lunediDiSettimana(wk) {
  const m = /^(\d{4})-W(\d{2})$/.exec(String(wk || ''));
  if (!m) return '';
  const lun1 = inizioSettimana(m[1] + '-01-04');
  return addDays(lun1, (Number(m[2]) - 1) * 7);
}
// Etichetta di colonna: «W37 · 07/09». Il codice ISO da solo non dice a nessuno
// di che giorni si parla, e una colonna che non si sa collocare non si legge.
function settimanaLabel(wk) {
  if (!wk) return 'Senza data';
  const lun = lunediDiSettimana(wk);
  return 'W' + wk.slice(6) + (lun ? ' · ' + fmtDateIt(lun).slice(0, 5) : '');
}

// ─── Vista: Carico centri ───
// Prospetto derivato, in sola lettura: da qui non nasce nessun documento e
// nessuna quantità cambia. Vale il patto scritto in cima al file.
//
// Tre letture, in quest'ordine: il **grafico** dice dove guardare, la **tavola**
// dice quanto, i **codici** dicono perché. Il grafico non è la fonte — ogni
// barra porta il suo numero e la tavola sotto resta la lettura esatta — perché
// un disegno che sostituisse i numeri li renderebbe incontestabili, ed è la
// stessa ragione per cui una cella si può aprire.
let loadSoloPiano = '';   // '' = tutti i piani aperti
let loadSoloCentro = '';  // '' = tutti i centri

// I piani che entrano nel conto, e le loro ore già raccolte. Passano da qui
// tutte e quattro le funzioni che disegnano o esportano: ricalcolarle ognuna a
// modo suo era il modo di farle divergere.
function loadPiani() {
  const piano = loadSoloPiano ? getPlan(loadSoloPiano) : null;
  return piano ? [piano] : (db.plans || []).filter(p => p.active !== false);
}
function loadEntries() {
  const piani = loadPiani();
  return mrpLoadUnisci(mrpLoadEntries(piani), odpLoadEntries(loadSoloPiano || 'tutti', loadSoloPiano ? null : piani));
}

function renderLoad() {
  const host = document.getElementById('view-load'); if (!host) return;
  invalidateCaches();
  if (loadSoloPiano && !getPlan(loadSoloPiano)) loadSoloPiano = '';
  const entries = loadEntries();
  const tab = mrpLoadTable(entries);
  if (loadSoloCentro && !tab.righe.some(r => r.workCenterId === loadSoloCentro)) loadSoloCentro = '';
  const aperti = (db.plans || []).filter(p => p.active !== false);
  const senzaCap = tab.righe.filter(r => !(r.capacity > 0)).length;
  host.innerHTML = `<div class="manage-wrap">
    <div class="bom-toolbar">
      <div class="bom-toolbar-left">
        <h2 class="section-title">${ico('wrench', 'tinted pill', '')} Carico centri di lavoro</h2>
      </div>
      <div class="bom-toolbar-right">${listExportButtons('loadExportSpec')}</div>
    </div>
    <div class="catalog-filters">
      <select id="load-plan" onchange="loadSetPlan(this.value)" title="Quali piani entrano nel conto">
        <option value="">Tutti i piani aperti (${aperti.length})</option>
        ${aperti.map(p => `<option value="${esc(p.id)}" ${p.id === loadSoloPiano ? 'selected' : ''}>${esc(p.number)}${p.title ? ' — ' + esc(p.title) : ''}</option>`).join('')}
      </select>
      <select id="load-wc" onchange="loadSetCentro(this.value)" title="Restringe i codici da produrre a un centro">
        <option value="">Tutti i centri</option>
        ${tab.righe.map(r => `<option value="${esc(r.workCenterId)}" ${r.workCenterId === loadSoloCentro ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
      </select>
    </div>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Le ore che i piani chiedono a ciascun centro, settimana per settimana — più quelle degli ordini di produzione che nessun piano conta, come quelli scritti a mano — contro la capacità dichiarata in <em>Gestione → Centri di lavoro</em>. Le ore stanno nella settimana in cui <strong>la fase comincia</strong>, programmata a ritroso dalla consegna sul calendario di fabbrica (montaggi, fasi interne e tratte di conto lavoro in sequenza). La capacità è <strong>infinita</strong>: le date dicono quando ciascuna fase deve partire perché la consegna regga, il sovraccarico si vede ma non si sposta.</p>
    ${senzaCap ? `<p class="empty-text" style="text-align:left;padding:0 0 8px">${ico('warning', 'tinted', '')} ${senzaCap} ${senzaCap === 1 ? 'centro non ha' : 'centri non hanno'} una capacità dichiarata: le ore si vedono, il sovraccarico no. Si imposta in <em>Gestione → Centri di lavoro</em>.</p>` : ''}
    ${loadOverloadHtml(tab)}
    ${loadChartHtml(tab)}
    ${loadTableHtml(tab)}
    ${typeof capCodaHtml === 'function' ? capCodaHtml() : ''}
    ${loadItemsHtml(entries)}</div>`;
}
function loadSetPlan(id) { loadSoloPiano = id || ''; renderLoad(); }
function loadSetCentro(id) { loadSoloCentro = id || ''; renderLoad(); }
function loadOverloadHtml(tab) {
  const ov = mrpLoadOverload(tab);
  if (!ov.length) return '';
  const voci = ov.map(o => `${esc(settimanaLabel(o.week))} — ${esc(o.centri.map(c => c.name + ' +' + fmtQtyIt(+c.over.toFixed(1)) + ' h').join(', '))}`).join(' · ');
  return `<div class="rfq-warn">${ico('warning', 'tinted', '')} <strong>Sovraccarico</strong> in ${ov.length} ${ov.length === 1 ? 'settimana' : 'settimane'}: ${voci}</div>`;
}
// ─── Il grafico della saturazione ───
// Un blocco per centro, una barra per settimana, la capacità come linea. SVG
// scritto a mano: le tre librerie in vendor/ ci sono perché un PDF e un foglio
// Excel non si scrivono a mano, un grafico a barre sì — e una libreria in più
// sarebbe un file in più da riverificare a ogni aggiornamento.
//
// I colori sono **gli stessi della tavola**: neutro fino all'85%, arancio fino
// al 100%, rosso sopra. Un centro senza capacità dichiarata disegna le barre e
// nient'altro: non c'è niente con cui confrontarle, e colorarle a caso avrebbe
// dato un allarme che nessuno ha dichiarato.
function loadBarColor(sat) {
  if (sat == null) return 'var(--accent)';
  return sat > 1 ? 'var(--red)' : (sat >= 0.85 ? 'var(--orange)' : 'var(--accent)');
}
function loadChartHtml(tab) {
  if (!tab.righe.length) return '';
  return `<div class="load-charts">${tab.righe.map(r => loadChartOne(r, tab.settimane)).join('')}</div>`;
}
function loadChartOne(r, settimane) {
  const celle = settimane.map(wk => ({ wk, c: r.celle.get(wk) })).filter(x => x.c);
  if (!celle.length) return '';
  const cap = r.capacity;
  // Un margine sopra il massimo, o la barra più alta tocca il bordo e non si
  // vede più di quanto sfonda.
  const max = Math.max(cap > 0 ? cap : 0, ...celle.map(x => x.c.hours)) * 1.15 || 1;
  const bw = 26, gap = 16, alt = 92, top = 10, base = top + alt;
  const larghezza = celle.length * (bw + gap) + gap;
  const y = v => base - (v / max) * alt;
  const sfondate = celle.filter(x => x.c.over > 0).map(x => settimanaLabel(x.wk).split(' · ')[0]);
  const barre = celle.map((x, i) => {
    const bx = gap + i * (bw + gap);
    const by = y(x.c.hours);
    const tit = `${settimanaLabel(x.wk)}: ${fmtQtyIt(+x.c.hours.toFixed(2))} h`
      + (x.c.sat == null ? ' — capacità non dichiarata' : ` su ${fmtQtyIt(cap)} h (${Math.round(x.c.sat * 100)}%)`);
    return `<rect x="${bx}" y="${by.toFixed(1)}" width="${bw}" height="${(base - by).toFixed(1)}" rx="3"
        fill="${loadBarColor(x.c.sat)}"><title>${esc(tit)}</title></rect>
      <text x="${bx + bw / 2}" y="${base + 14}" text-anchor="middle" class="load-chart-lbl">${esc(settimanaLabel(x.wk).split(' · ')[0])}</text>`;
  }).join('');
  const linea = cap > 0
    ? `<line x1="0" y1="${y(cap).toFixed(1)}" x2="${larghezza}" y2="${y(cap).toFixed(1)}" stroke="var(--text-dim)" stroke-dasharray="4 3" stroke-width="1"/>
       <text x="2" y="${(y(cap) - 4).toFixed(1)}" class="load-chart-lbl">capacità ${fmtQtyIt(cap)} h</text>`
    : '';
  const descrizione = `${r.name}, ${celle.length} ${celle.length === 1 ? 'settimana' : 'settimane'}, `
    + (cap > 0 ? (sfondate.length ? 'sovraccarico in ' + sfondate.join(', ') : 'nessun sovraccarico')
      : 'capacità non dichiarata');
  return `<figure class="load-chart">
    <figcaption>${esc(r.name)} <span class="empty-text" style="padding:0">${cap > 0 ? fmtQtyIt(cap) + ' h/sett' : 'capacità non dichiarata'}</span></figcaption>
    <svg viewBox="0 0 ${larghezza} ${base + 20}" preserveAspectRatio="xMinYMid meet" role="img" aria-label="${esc(descrizione)}">
      <line x1="0" y1="${base}" x2="${larghezza}" y2="${base}" stroke="var(--hairline)" stroke-width="1"/>
      ${linea}${barre}
    </svg>
  </figure>`;
}
// `planId`: assente per la vista Carico centri (i click restano nel giro dei
// filtri globali già scritti sopra); valorizzato per la tavola dentro la
// scheda di un piano — lì i numeri sono quelli **di quel piano soltanto**, e
// il dettaglio di una cella deve rispondere con lo stesso conto, non con la
// somma di tutti i piani aperti (che è un numero diverso, ed è quello
// dichiarato dal testo appena sopra la tavola). Il nome del centro perde
// anche il link: «solo questo centro» è un filtro della vista Carico centri,
// e da qui cambierebbe un filtro altrove senza che nulla si muova a video.
function loadTableHtml(tab, planId) {
  if (!tab.righe.length) return '<div class="empty-text">Nessuna ora di lavorazione nei piani considerati. Le fasi in conto lavoro non caricano i centri interni: stanno nel fabbisogno, sotto «Da far lavorare fuori».</div>';
  const head = `<thead><tr><th scope="col">Centro</th><th scope="col" style="text-align:right">Capacità</th>
    ${tab.settimane.map(wk => `<th scope="col" style="text-align:right">${esc(settimanaLabel(wk))}</th>`).join('')}
    <th scope="col" style="text-align:right">Totale</th></tr></thead>`;
  const corpo = tab.righe.map(r => {
    const celle = tab.settimane.map(wk => {
      const c = r.celle.get(wk);
      if (!c) return '<td></td>';
      // Neutra fino all'85%, arancio fino al 100%, rossa sopra. Senza capacità
      // dichiarata nessun colore: non c'è niente con cui confrontare le ore.
      const col = c.sat == null ? '' : (c.sat > 1 ? 'var(--red)' : (c.sat >= 0.85 ? 'var(--orange)' : ''));
      const tit = c.sat == null ? 'Capacità non dichiarata' : `Saturazione ${Math.round(c.sat * 100)}%`;
      const apri = clickAttrs(`loadCellModal('${r.workCenterId}','${wk}'${planId ? `,'${planId}'` : ''})`, 'Dettaglio del carico');
      return `<td style="font-family:var(--mono);text-align:right${col ? ';color:' + col : ''}" title="${esc(tit)}">
        <span class="plandoc-link plandoc-link-sm" ${apri}>${fmtQtyIt(+c.hours.toFixed(2))}</span>${c.sat != null ? `<div class="empty-text" style="padding:0;font-size:11px">${Math.round(c.sat * 100)}%</div>` : ''}</td>`;
    }).join('');
    const cap = r.capacity > 0 ? fmtQtyIt(r.capacity) + ' h'
      : '<span class="empty-text" style="padding:0" title="Capacità non dichiarata: il carico si vede, il sovraccarico no">—</span>';
    const nome = planId ? esc(r.name)
      : `<span class="plandoc-link plandoc-link-sm" ${clickAttrs(`loadSetCentro('${r.workCenterId}')`, 'Mostra solo i codici di questo centro')}>${esc(r.name)}</span>`;
    return `<tr><td>${nome}</td>
      <td style="font-family:var(--mono);text-align:right">${cap}</td>
      ${celle}
      <td style="font-family:var(--mono);text-align:right"><strong>${fmtQtyIt(+r.totale.toFixed(2))}</strong></td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table>${head}<tbody>${corpo}</tbody></table></div>`;
}
// ─── I codici che quelle ore le producono ───
// La tavola sopra dice quanto pesa un centro; questa dice cosa produce quel
// peso. Ordinata per settimana e poi per ore decrescenti, perché la domanda che
// ci si fa guardandola è «cosa lancio per primo».
function loadItemsHtml(entries) {
  const righe = mrpLoadItems(entries, loadSoloCentro);
  const wcNome = loadSoloCentro ? ((getWorkCenter(loadSoloCentro) || {}).name || '') : '';
  const testa = `<h3 class="rfq-subhead">Codici da produrre${loadSoloCentro ? ` — ${esc(wcNome)}
    <span class="rfq-head-actions"><button class="btn-outline" onclick="loadSetCentro('')">Tutti i centri</button></span>` : ''}</h3>`;
  if (!righe.length) return `${testa}<div class="empty-text">Nessun codice da produrre nei piani considerati.</div>`;
  const corpo = righe.map(r => `<tr>
    <td>${esc(settimanaLabel(r.week))}</td>
    <td style="font-family:var(--mono)">${codeLink(r.itemId, r.code)}</td>
    <td>${esc(r.name)}</td>
    <td style="font-family:var(--mono);text-align:right">${fmtQtyIt(+r.qty.toFixed(3))}</td>
    <td>${r.fasi.map(f => `<span class="cycle-phase">${esc(String(f.faseNo || '—'))}</span> ${esc(f.wcName)} <span class="empty-text" style="padding:0">${fmtMin(f.hoursUnit)}/pz · ${fmtQtyIt(+f.hours.toFixed(2))} h</span>`).join('<br>')}</td>
    <td style="font-family:var(--mono);text-align:right"><strong>${fmtQtyIt(+r.hours.toFixed(2))}</strong></td></tr>`).join('');
  const tot = righe.reduce((s, r) => s + r.hours, 0);
  return `${testa}
    <p class="empty-text" style="text-align:left;padding:0 0 8px">I <strong>pezzi</strong> non si sommano fra le fasi di uno stesso codice: ogni fase lavora gli stessi pezzi. Le <strong>ore</strong> sì.</p>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Settimana</th><th scope="col">Codice</th><th scope="col">Descrizione</th>
        <th scope="col" style="text-align:right">Pezzi</th><th scope="col">Fasi interne</th>
        <th scope="col" style="text-align:right">Ore</th></tr></thead>
      <tbody>${corpo}</tbody>
      <tfoot><tr><td colspan="5">Totale ore</td>
        <td style="font-family:var(--mono);text-align:right">${fmtQtyIt(+tot.toFixed(2))}</td></tr></tfoot>
    </table></div>`;
}
// Il dettaglio di una cella non è un vezzo: vale la stessa regola già scritta
// per gli impegni di magazzino — un numero che non dice da dove viene non si può
// contestare, e quindi neanche credere.
function loadCellModal(wcId, week, planId) {
  // Con un piano indicato il conto è quello del piano soltanto, coerente con
  // la tavola da cui si è aperta la cella (vedi loadTableHtml). Un piano
  // sparito nel frattempo non apre nulla, invece di ricadere sul conto
  // globale e mostrare un dettaglio che non risponde più alla cella cliccata.
  const plan = planId ? getPlan(planId) : null;
  if (planId && !plan) return;
  const tab = mrpLoadTable(planId ? mrpLoadEntries([plan]) : loadEntries());
  const riga = tab.righe.find(r => r.workCenterId === wcId);
  const cella = riga && riga.celle.get(week);
  if (!cella) return;
  const voci = cella.voci.slice().sort((a, b) => b.hours - a.hours);
  const capTxt = riga.capacity > 0
    ? ` su ${fmtQtyIt(riga.capacity)} h di capacità (${Math.round(cella.sat * 100)}%)`
    : ' — capacità non dichiarata';
  openModal(`<h3>${ico('wrench', 'tinted pill', '')} ${esc(riga.name)} — ${esc(settimanaLabel(week))}</h3>
    <p><strong>${fmtQtyIt(+cella.hours.toFixed(2))} h</strong>${capTxt}.</p>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${voci.map(v => `<div class="mgmt-item">
        <span style="width:110px;font-family:var(--mono)">${codeLink(v.itemId, v.code)}</span>
        <span style="flex:1">${esc(v.name)}${v.faseNo ? ` <span class="cycle-phase">fase ${esc(String(v.faseNo))}</span>` : ''}</span>
        <span class="empty-text" style="padding:0;width:120px">${esc(v.planNumber || '')}</span>
        <span class="empty-text" style="padding:0;width:150px;text-align:right">${fmtQtyIt(v.qty)} pz × ${fmtMin(v.hoursUnit)}${v.setup > 0 ? ` + ${fmtMin(v.setup)} att.` : ''}</span>
        <span style="font-family:var(--mono);width:80px;text-align:right">${fmtQtyIt(+v.hours.toFixed(2))} h</span>
      </div>`).join('')}
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'carico');
}
// Export in **forma lunga**: una riga per coppia centro/settimana. Un foglio con
// trenta colonne di settimane è illeggibile; in forma lunga si pivota in Excel
// in dieci secondi, e si ordina e si filtra per data — che è la promessa già
// scritta sugli export degli elenchi.
//
// Due sezioni, come in pagina: il carico e i codici che lo producono. La seconda
// ha una riga per codice, fase e settimana, che è la forma in cui si somma per
// reparto o per articolo senza rifare i conti a mano.
function loadExportSpec() {
  const piano = loadSoloPiano ? getPlan(loadSoloPiano) : null;
  const entries = loadEntries();
  const tab = mrpLoadTable(entries);
  const righe = [];
  tab.righe.forEach(r => tab.settimane.forEach(wk => {
    const c = r.celle.get(wk);
    if (!c) return;
    righe.push([r.name, wk || '(senza data)', lunediDiSettimana(wk) || '',
      +c.hours.toFixed(2), r.capacity > 0 ? r.capacity : '',
      c.sat == null ? '' : +(c.sat * 100).toFixed(1), +c.over.toFixed(2)]);
  }));
  const codici = [];
  mrpLoadItems(entries, loadSoloCentro).forEach(r => r.fasi.forEach(f => {
    codici.push([r.week || '(senza data)', lunediDiSettimana(r.week) || '', r.code, r.name,
      f.faseNo || '', f.wcName, +f.qty.toFixed(3), minDaOre(f.hoursUnit), +f.hours.toFixed(2)]);
  }));
  return {
    titolo: 'Carico dei centri di lavoro',
    slug: 'carico_centri',
    filtri: [['Piani', piano ? piano.number + (piano.title ? ' — ' + piano.title : '') : 'Tutti i piani aperti'],
      ['Centro', loadSoloCentro ? ((getWorkCenter(loadSoloCentro) || {}).name || '') : 'Tutti']],
    sezioni: [{
      nome: 'Ore per centro e settimana',
      colonne: [
        { h: 'Centro', w: 26 }, { h: 'Settimana', w: 14 }, { h: 'Lunedì', w: 14, data: true },
        { h: 'Ore', w: 10, num: true }, { h: 'Capacità (h/sett)', w: 18, num: true },
        { h: 'Saturazione %', w: 16, num: true }, { h: 'Sovraccarico (h)', w: 18, num: true },
      ],
      righe,
      totali: null,
    }, {
      nome: 'Codici da produrre',
      colonne: [
        { h: 'Settimana', w: 14 }, { h: 'Lunedì', w: 14, data: true },
        { h: 'Codice', w: 18 }, { h: 'Descrizione', w: 32 },
        { h: 'Fase', w: 8, num: true }, { h: 'Centro', w: 22 },
        { h: 'Pezzi', w: 12, num: true }, { h: 'Tempo fase (min/pz)', w: 18, num: true }, { h: 'Ore', w: 12, num: true },
      ],
      righe: codici,
      totali: null,
    }],
  };
}

// ─── I codici che quelle ore le producono ───
// La tavola del carico risponde a «quanto pesa un centro». Questa risponde a
// «cosa produce quel peso», e sono due domande diverse: mescolarle in una
// tabella sola avrebbe prodotto qualcosa che non risponde bene a nessuna delle
// due. Stanno una sotto l'altra, e lo stesso filtro le tiene in sincrono.
//
// I **pezzi** di un codice non si sommano fra le sue fasi: ogni fase lavora gli
// stessi pezzi, e sommarle direbbe che ne servono il doppio. Si sommano invece
// fra i piani, ed è per questo che il conto passa dalle fasi — il massimo fra
// le quantità di fase è la quantità del codice.
function mrpLoadItems(entries, soloCentro) {
  const perItem = new Map();
  (entries || []).forEach(e => {
    if (soloCentro && e.workCenterId !== soloCentro) return;
    const wc = getWorkCenter(e.workCenterId);
    const wcName = wc ? wc.name : '(centro mancante)';
    e.voci.forEach(v => {
      const k = v.itemId + '|' + e.week;
      let t = perItem.get(k);
      if (!t) {
        t = { itemId: v.itemId, code: v.code, name: v.name, week: e.week, qty: 0, hours: 0, fasi: new Map() };
        perItem.set(k, t);
      }
      const fk = e.workCenterId + '|' + (v.faseNo || '');
      let f = t.fasi.get(fk);
      if (!f) { f = { workCenterId: e.workCenterId, wcName, faseNo: v.faseNo || '', hoursUnit: v.hoursUnit || 0, qty: 0, hours: 0 }; t.fasi.set(fk, f); }
      f.qty += v.qty || 0;
      f.hours += v.hours || 0;
      t.hours += v.hours || 0;
    });
  });
  return Array.from(perItem.values()).map(t => {
    const fasi = Array.from(t.fasi.values())
      .sort((a, b) => (Number(a.faseNo) || 0) - (Number(b.faseNo) || 0) || a.wcName.localeCompare(b.wcName));
    return Object.assign(t, { fasi, qty: fasi.reduce((m, f) => Math.max(m, f.qty), 0) });
  }).sort((a, b) => String(a.week).localeCompare(String(b.week)) || b.hours - a.hours);
}

// ─── Riga di fabbisogno di una fase di conto lavoro ───
// Molto più povera di una riga d'acquisto, e non per pigrizia: **una lavorazione
// non si mette a scaffale**. Non ha giacenza, non ha in arrivo, non ha impegni,
// non ha scorta minima né lotto — e quindi non ha un netto. `qtyOrder` vale
// sempre `qty`, anche a fabbisogno netto acceso.
//
// Fino alla 0.73 il motivo era che l'app non aveva un avanzamento di
// produzione. Dalla 0.74 ce l'ha — gli **ordini di produzione** sanno quanti
// pezzi ogni fase ha lavorato — e il motivo va riscritto invece che lasciato a
// mentire: nettare una fase richiede di decidere cosa fare di quelle coperte da
// ordini di **altri** piani, che è la stessa discussione dell'impegnato sul
// materiale. Va fatta intera, e non è stata fatta: finché non lo è, la
// lavorazione resta lorda e la pagina lo dichiara.
//
// Il prezzo è **per pezzo**, in entrambi i modi di costo: è la forma con cui
// finisce sulla riga di documento, dove la quantità sono i pezzi.
function mrpPhaseRow(entry) {
  const r = entry.row;
  const wc = getWorkCenter(entry.workCenterId);
  const orario = r.costMode === 'orario';
  const hoursUnit = Number(r.hours) || 0;
  const rate = Number(r.rate) || 0;
  // La tariffa è quella **congelata sulla riga** quando la fase è stata scritta,
  // non wcRateFor(): quella è una proposta iniziale, e ripescarla adesso
  // cambierebbe da sé il prezzo di una fase che qualcuno aveva deciso.
  const price = orario ? hoursUnit * rate : (Number(r.cost) || 0);
  // `due` è il rientro richiesto della tratta, `start` l'invio che la
  // programmazione a ritroso ha già calcolato (mrpDescend). Una riga costruita
  // fuori dal fabbisogno — un ordine di lavoro scritto a mano, uno nato da un
  // ODP — non ha `start`, e l'invio si ricava dai giorni della fase.
  const due = entry.due || '';
  const leadDays = Math.max(0, Number(r.days) || 0);
  const orderBy = entry.start || (due ? runSendDate(due, leadDays) : '');
  return {
    phaseKey: entry.phaseKey, item: entry.item, row: r, opIndex: entry.opIndex, phaseNo: entry.phaseNo,
    workCenterId: entry.workCenterId, wcName: wc ? wc.name : '(centro mancante)',
    supplierId: entry.supplierId,
    // Marcatore, non un tipo: la modale e gli export disegnano le due righe
    // nella stessa tabella e devono poterle distinguere senza indovinare da
    // quali campi mancano.
    isPhase: true,
    qty: entry.qty, qtyOrder: quantitaDaOrdinare(entry.qty, itemUom(entry.item)), uom: itemUom(entry.item),
    // I **giorni di attraversamento** della fase sono il suo tempo di consegna:
    // se il pezzo serve pronto il 30 e il terzista ci mette cinque giorni,
    // l'ordine di lavoro deve uscire entro il 25. È la stessa aritmetica dei
    // giorni di consegna a listino per il materiale, e la stessa risposta quando
    // il dato manca: nessun anticipo, non un anticipo inventato.
    due, start: entry.start || '', leadDays, orderBy, urgenza: urgenzaOrdine(orderBy),
    days: leadDays,
    costMode: orario ? 'orario' : 'fisso', hoursUnit, hours: hoursUnit * entry.qty, rate,
    price, amount: price * entry.qty,
    noPrice: !(price > 0),
  };
}
// Le fasi di un piano, **al netto di ciò che è già stato prodotto**.
//
// Fino alla 0.77.0 questo netto non esisteva, e la vista lo dichiarava:
// «sapere quanti pezzi sono già stati lavorati richiederebbe un avanzamento di
// produzione che l'app non ha». Ora l'avanzamento c'è (produzione.js) e la
// domanda ha una risposta: i pezzi dichiarati fatti hanno attraversato **tutte**
// le fasi del ciclo — sono parti finite — quindi non vanno rimandati a lavorare
// fuori, e non vanno né pagati né messi in carico ai centri una seconda volta.
//
// Il limite di questa lettura va detto perché non sorprenda: un pezzo **a metà
// ciclo** non è rappresentato. Si dichiara la parte finita, non la fase
// superata, quindi un lotto fermo fra la terza e la quarta fase conta ancora
// come tutto da fare. È la lettura prudente — si rischia di riordinare una
// lavorazione già avviata, mai di dimenticarne una da fare — ed è l'unica
// possibile finché la dichiarazione è per parte. Seguire il pezzo fase per fase
// è un'altra funzione, e va decisa a parte.
//
// Senza nessuna dichiarazione il netto è la quantità intera: i piani di prima
// si comportano esattamente come prima, per costruzione.
// Le fasi di un piano al netto del prodotto, dalle voci già esplose.
//
// Sta separata da mrpPhaseRows perché il netto serve in **due** punti che
// partono dalla stessa esplosione: la tabella che si legge e l'indice da cui si
// pescano le righe quando si genera il documento. Applicarlo in uno solo dei
// due — che è l'errore fatto la prima volta — significa mostrare «6 pezzi da
// far lavorare» e poi scrivere 10 sull'ordine di lavoro che parte al terzista.
function mrpPhaseRowsNette(planId, phases) {
  return phases.map(e => {
    const resta = typeof daFare === 'function' ? daFare(planId, e.item.id, e.qty) : e.qty;
    return mrpPhaseRow(resta === e.qty ? e : Object.assign({}, e, { qty: resta }));
  }).filter(r => r.qty > 0);
}
function mrpPhaseRows(plan) {
  return mrpPhaseRowsNette(plan.id, mrpExplodePlan(plan).phases);
}
// ─── Dalle fasi alle tratte ───
// Un ordine di lavoro non si commissiona fase per fase: le fasi **consecutive**
// dello stesso terzista sono una lavorazione sola — il pezzo arriva da lui, gli
// resta sul banco e riparte una volta. Spuntarne una e non l'altra produrrebbe
// un ordine che non sta in piedi, e mandarne due farebbe fare due viaggi allo
// stesso pezzo.
//
// La tabella del fabbisogno resta **per fase**: è un'analisi, e le fasi una per
// una sono ciò che serve leggere lì. L'unione avviene qui, sulla strada del
// documento.
//
// Il prezzo di una tratta è la **somma** dei prezzi per pezzo delle sue fasi, i
// giorni sono la somma dei giorni (il pezzo resta fuori per tutta la tratta) e
// la data in cui serve è la più vicina fra quelle delle fasi.
function mrpPhaseRuns(rows) {
  const map = new Map();
  rows.forEach(r => {
    const t = clRunAt(r.item, r.opIndex);
    // Parte senza ciclo leggibile: la fase fa tratta da sé, ed è il
    // comportamento di prima delle tratte.
    const from = t ? t.from : r.opIndex;
    const k = r.item.id + '#' + from;
    if (!map.has(k)) map.set(k, { from, passata: t ? t.passata : 0, fasi: [] });
    map.get(k).fasi.push(r);
  });
  return Array.from(map.values()).map(g => {
    const fasi = g.fasi.slice().sort((a, b) => a.opIndex - b.opIndex);
    const prima = fasi[0];
    const somma = f => fasi.reduce((s, x) => s + (Number(x[f]) || 0), 0);
    const due = fasi.reduce((d, x) => primaData(d, x.due), '');
    // I giorni della tratta comprendono il trasporto del terzista, una volta.
    const leadDays = runLeadDays(fasi.map(x => ({ days: x.leadDays, supplierId: x.supplierId, transitDays: x.row ? x.row.transitDays : null })));
    const programmato = fasi.reduce((d, x) => primaData(d, x.start), '');
    const orderBy = programmato || (due ? runSendDate(due, leadDays) : '');
    const price = somma('price');
    return Object.assign({}, prima, {
      // L'identità della tratta è la **prima** fase: è quella che gli ancoraggi
      // del conto lavoro leggono per sapere dove il magazzino si muove.
      phaseKey: prima.phaseKey,
      phaseKeys: fasi.map(x => x.phaseKey),
      phaseNos: fasi.map(x => x.phaseNo),
      fasi, passata: g.passata,
      wcName: Array.from(new Set(fasi.map(x => x.wcName))).join(' + '),
      due, start: orderBy, leadDays, orderBy, urgenza: urgenzaOrdine(orderBy), days: leadDays,
      hours: somma('hours'), hoursUnit: somma('hoursUnit'),
      price, amount: price * prima.qty, noPrice: !(price > 0),
    });
  }).sort((a, b) => String(a.item.code).localeCompare(String(b.item.code)) || a.opIndex - b.opIndex);
}
// ─── Una tratta senza passare dal fabbisogno ───
// Serve a chi scrive un ordine di lavoro a mano: dalla parte e dalla tratta si
// ricava la stessa riga che avrebbe prodotto un piano. Passa dalle stesse due
// funzioni — `mrpPhaseRow` per ogni fase, `mrpPhaseRuns` per unirle — perché una
// riga scritta a mano che si comportasse diversamente da una generata sarebbe
// una seconda specie di riga da ricordarsi.
function clRunRow(part, run, qty, due) {
  const fasi = [];
  let opIndex = 0;
  ((part && part.cycle) || []).forEach(r => {
    if (r.kind !== 'op') return;
    const k = opIndex++;
    if (k < run.from || k > run.to) return;
    fasi.push(mrpPhaseRow({
      item: part, row: r, opIndex: k, phaseKey: mrpPhaseKey(part.id, k, r.workCenterId),
      phaseNo: cyclePhaseNumber(k), workCenterId: r.workCenterId || '',
      supplierId: r.supplierId || '', qty: Number(qty) || 0, due: due || '',
    }));
  });
  return mrpPhaseRuns(fasi)[0] || null;
}
// L'etichetta di una tratta: «fase 20» quando è una, «fasi 20-30» quando sono
// più d'una. Il terzista legge i numeri di fase del nostro ciclo, ed è l'unico
// modo che ha di dire a quale lavorazione si riferisce una sua bolla.
function mrpRunFasiLabel(r) {
  const nos = r.phaseNos || [r.phaseNo];
  return nos.length === 1 ? `fase ${nos[0]}` : `fasi ${nos[0]}-${nos[nos.length - 1]}`;
}

// ─── Le parti da fabbricare, come righe di documento ───
// Gemella povera di mrpBuyRow: una parte che si produce non ha listino, non ha
// fornitore e non ha un netto — il fabbisogno netto guarda il magazzino, e
// lanciare un ordine di produzione è una decisione di produzione, non di
// acquisto. Porta il marcatore `isMake` per la stessa ragione di `isPhase`: la
// modale disegna le tre specie di riga nella stessa tabella e deve poterle
// distinguere senza indovinare da quali campi mancano.
function mrpMakeRow(entry, planId) {
  const it = entry.item;
  // Le **fasi** sono quelle del ciclo; le **tratte esterne** sono quelle che
  // diventeranno ordini di lavoro. Sono due conti diversi e vanno detti
  // entrambi: «tre fasi, una in conto lavoro» dice cosa ci si aspetta di dover
  // commissionare, e «tre fasi» da solo no.
  const nFasi = cicloFasi(it).length;
  const tratte = clCycleRuns(it);
  // Quanti lanciarne: il **residuo**, non il lordo. I pezzi già dichiarati fatti
  // in «Da fabbricare» sono gli stessi che il netto delle lavorazioni toglie già
  // agli ordini di lavoro, e lanciarne un ordine di produzione per l'intero
  // significherebbe rifare un lavoro che qualcuno ha appena dichiarato di aver
  // fatto. Il lordo resta in `qty`, accanto, come sulle righe d'acquisto.
  // Dalla 0.105.5 anche al netto di quello che gli ODP aperti stanno facendo.
  const resta = (planId && typeof daLanciare === 'function') ? daLanciare(planId, it.id, entry.qty) : entry.qty;
  // Scorta minima e lotto, come sugli acquisti (dalla 0.105.6): il piano più
  // urgente che fabbrica la parte lancia anche i pezzi che riportano lo
  // scaffale alla scorta (scortaPartiIndex), e la quantità si arrotonda al
  // lotto di riordino della parte — a multipli, o con la soglia minima. È la
  // stessa netRequirement delle righe d'acquisto, con l'esistente già tolto.
  const scorta = (planId && typeof scortaDaLanciare === 'function') ? scortaDaLanciare(planId, it.id) : 0;
  const daLanciareQui = quantitaDaOrdinare(resta + scorta, itemUom(it));
  const qtyOrder = quantitaDaOrdinare(netRequirement(daLanciareQui, 0, 0, 0, lotSizeOf(it), 0, lotModeOf(it)), itemUom(it));
  return {
    item: it, isMake: true, isAsm: isAssembly(it.type), makeKey: 'make#' + it.id,
    qty: entry.qty, qtyOrder, uom: itemUom(it),
    scorta, lotSize: lotSizeOf(it), lotMode: lotModeOf(it), arrotondato: qtyOrder > daLanciareQui + 0.000001,
    // Entro quando lanciarla: l'inizio della prima fase del ciclo, che la
    // programmazione a ritroso ha calcolato. Senza ciclo coincide con la data
    // in cui serve, come prima.
    due: entry.due || '', start: entry.start || entry.due || '',
    orderBy: entry.start || entry.due || '', urgenza: urgenzaOrdine(entry.start || entry.due || ''),
    // L'importo è quello dei pezzi che si lanciano, non del lordo (dalla 0.105.6).
    supplierId: '', price: costOf(it.id).total, amount: costOf(it.id).total * qtyOrder,
    nFasi, nEsterne: tratte.filter(t => t.esterna).length,
    senzaCiclo: !nFasi,
    noPrice: !(costOf(it.id).total > 0),
  };
}
function mrpMakeRows(plan) { return mrpDaProdurre(mrpExplodePlan(plan)).map(e => mrpMakeRow(e, plan.id)); }
// Quello che si lancia con un ordine di produzione: le parti da fabbricare, e
// dalla 0.124.0 gli assiemi che hanno un ciclo — il loro ODP porta le fasi di
// montaggio e preleva i componenti. Senza Produzione interna nessuno dei due.
function mrpDaProdurre(exp) {
  if (typeof areaAttiva === 'function' && !areaAttiva('produzione')) return exp.make;
  return exp.make.concat(exp.asm.filter(e => asmHaCiclo(e.item)));
}
function mrpBuyRows(plan, netMode) { return mrpExplodePlan(plan).buy.map(e => mrpBuyRow(e, netMode, plan.id)); }
// `.map(mrpBuyRow)` passerebbe l'indice dell'array come secondo argomento, e
// dalla seconda riga in poi il netto si accenderebbe da solo. Le viste passano
// sempre da qui.
function mrpRowsOf(entries, planId) { return entries.map(e => mrpBuyRow(e, mrpNet, planId)); }
// Raggruppamento per fornitore; chi non ne ha finisce in coda, sotto "Da assegnare"
function mrpGroupBySupplier(rows) {
  const map = new Map();
  rows.forEach(r => {
    const k = r.supplierId || '';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  });
  return Array.from(map.entries())
    .map(([supplierId, rs]) => ({
      key: supplierId,
      supplierId, name: supplierId ? (supplierName(supplierId) || '—') : 'Da assegnare',
      rows: rs, total: rs.reduce((s, r) => s + r.amount, 0),
    }))
    .sort((a, b) => (a.supplierId ? 0 : 1) - (b.supplierId ? 0 : 1) || a.name.localeCompare(b.name));
}
// ─── Un ordine di lavoro per terzista **e passata** ───
// Le fasi 20 e 40 dallo stesso terzista, con la 30 in mezzo altrove, non stanno
// nello stesso documento: fra le due il pezzo torna da noi, e chiedergliele
// insieme significherebbe consegnargli un ordine che non può eseguire di
// seguito. La `passata` di una tratta dice quante volte quel terzista ha già
// avuto il pezzo prima, ed è esattamente il criterio che li separa.
//
// Parti **diverse** alla stessa passata restano insieme: è lo stesso terzista,
// lo stesso viaggio, la stessa bolla.
function mrpGroupOdl(rows) {
  const map = new Map();
  rows.forEach(r => {
    const k = (r.supplierId || '') + '#' + (r.passata || 0);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  });
  return Array.from(map.entries())
    .map(([key, rs]) => {
      const supplierId = key.split('#')[0];
      const passata = Number(key.split('#')[1]) || 0;
      const nome = supplierId ? (supplierName(supplierId) || '—') : 'Da assegnare';
      return {
        key, supplierId, passata,
        // Due gruppi con lo stesso nome non si distinguerebbero, e chi genera
        // non saprebbe quale sta spuntando.
        name: passata ? nome + ' — ' + ordinalePassata(passata) : nome,
        rows: rs, total: rs.reduce((s, r) => s + r.amount, 0),
      };
    })
    .sort((a, b) => (a.supplierId ? 0 : 1) - (b.supplierId ? 0 : 1)
      || a.name.localeCompare(b.name) || a.passata - b.passata);
}
function ordinalePassata(n) {
  return ['prima', 'seconda', 'terza', 'quarta', 'quinta'][n] ? ['prima', 'seconda', 'terza', 'quarta', 'quinta'][n] + ' passata' : (n + 1) + 'ª passata';
}
// I due raggruppamenti hanno la stessa forma, e chi genera i documenti non deve
// sapere quale sta usando.
function planDocGroups(rows, kind) {
  // Un ordine di produzione è **di una parte sola** e non si intesta a nessuno:
  // qui non c'è un fornitore per cui raggruppare, e le righe stanno insieme
  // sotto un titolo che dice cosa sono.
  if (kind === 'odp') return rows.length ? [{ key: '', supplierId: '', name: 'Parti da fabbricare', rows, total: rows.reduce((s, r) => s + (r.amount || 0), 0) }] : [];
  return kind === 'odl' ? mrpGroupOdl(rows) : mrpGroupBySupplier(rows);
}

// ─── Piani: CRUD ───
function getPlan(id) { return (db.plans || []).find(p => p.id === id); }
// Progressivo per anno: FAB-<anno>-NNN
function nextPlanNumber() { return numeroProgressivo('FAB'); }
function newPlan() {
  if (!roleGuard('docs')) return;
  return conNumeri({ FAB: 1 }, () => {
    const p = Store.insert('plans', { id: gid(), number: nextPlanNumber(), title: '', date: oggiISO(),
      notes: '', lines: [], active: true });
    currentPlanId = p.id; mrpView = 'edit'; renderMrp();
  });
}
function duplicatePlan(id) {
  if (!roleGuard('docs')) return;
  const src = getPlan(id); if (!src) return;
  return conNumeri({ FAB: 1 }, () => {
    const p = Store.insert('plans', { id: gid(), number: nextPlanNumber(), title: (src.title || src.number) + ' (copia)',
      date: oggiISO(), notes: src.notes || '',
      lines: (src.lines || []).map(l => ({ id: gid(), itemId: l.itemId, qty: l.qty })), active: true });
    currentPlanId = p.id; mrpView = 'edit'; renderMrp();
    showToast('Piano ' + p.number + ' creato dalla copia');
  });
}
function delPlan(id) {
  if (!roleGuard('docs')) return;
  const p = getPlan(id); if (!p) return;
  if (!guardiaDocumentoUltimo(p, db.plans, 'Chiudilo invece di eliminarlo.')) return;
  askConfirm(`Eliminare il piano ${p.number}?`, () => eliminaSeAncoraUltimo(() => {
    const x = getPlan(id);
    return !!x && guardiaDocumentoUltimo(x, db.plans, 'Chiudilo invece di eliminarlo.');
  }, () => {
    if (currentPlanId === id) { currentPlanId = null; mrpView = 'list'; }
    removeConUndo('plans', id, `Piano ${p.number} eliminato`, renderMrp);
  }));
}
function openPlanEdit(id) { if (!vistaAttiva('mrp')) return; currentPlanId = id; mrpView = 'edit'; renderMrp(); }
// Aperto / chiuso. È l'unico stato che un piano ha, ed esiste per una ragione
// sola: un piano aperto **impegna** materiale a magazzino, uno chiuso no.
// Senza questo interruttore ogni piano mai creato continuerebbe a promettere
// merce per sempre, e dopo qualche mese nessun articolo risulterebbe più
// disponibile. Chiudere non cancella e non blocca niente: il piano resta
// leggibile, esportabile, e si riapre con lo stesso pulsante.
function planToggleActive(id) {
  if (!roleGuard('docs')) return;
  const p = getPlan(id); if (!p) return;
  p.active = p.active === false;
  touch(p); saveDB(); renderMrp();
  showToast(`Piano ${p.number} ${p.active ? 'riaperto: torna a impegnare materiale' : 'chiuso: il materiale che impegnava torna libero'}`);
}
function planBackToList() { mrpView = 'list'; currentPlanId = null; renderMrp(); }
function planSearchInput() {
  // Solo l'elenco: ridisegnare la colonna intera farebbe perdere il focus al
  // campo di ricerca a ogni lettera.
  debounced('mrp', () => {
    renderInto('plan-list', planListRows);
    const c = document.getElementById('plan-count');
    if (c) c.textContent = planCountText();
  });
}
function planSetField(id, field, value) {
  if (!roleGuard('docs')) { renderMrp(); return; }
  const p = getPlan(id); if (!p) return;
  p[field] = campoTesto(value);
  touch(p); saveDB();
}
function planAddModal(id) {
  if (!roleGuard('docs')) return;
  catalogPickerModal(ids => planAddLines(id, ids));
}
function planAddLines(id, ids) {
  if (!roleGuard('docs')) return;
  const p = getPlan(id); if (!p) return;
  // Un modello configurabile (varianti.js) non si produce così com'è: prima
  // si sceglie, e si pianifica la macchina che il configuratore genera.
  const modelli = ids.map(getItem).filter(it => it && varRichiedeScelte(it));
  if (modelli.length) {
    showToast(`${modelli.map(x => x.code).join(', ')}: ${modelli.length === 1 ? 'è un modello' : 'sono modelli'} da configurare. Genera la macchina dalle sue scelte e metti in piano quella.`, 'error');
    ids = ids.filter(x => !modelli.some(m => m.id === x));
    if (!ids.length) return;
  }
  ids.forEach(itemId => {
    const it = getItem(itemId); if (!it) return;
    // Stesso articolo due volte: si somma sulla riga esistente invece di duplicarla
    const gia = p.lines.find(l => l.itemId === itemId);
    if (gia) gia.qty = (Number(gia.qty) || 0) + 1;
    // La data di testata del piano fa da proposta: quasi sempre le righe di un
    // piano servono per la stessa consegna, e riscriverla una per una è lavoro
    // inutile. Resta modificabile riga per riga.
    else p.lines.push({ id: gid(), itemId, qty: 1, dueDate: p.dueDate || '' });
  });
  touch(p); saveDB(); closeModal(); renderMrp();
  showToast(ids.length + (ids.length === 1 ? ' articolo aggiunto' : ' articoli aggiunti'));
}
function planSetLineQty(id, lineId, value) {
  if (!roleGuard('docs')) { renderMrp(); return; }
  const p = getPlan(id); if (!p) return;
  const l = p.lines.find(x => x.id === lineId); if (!l) return;
  l.qty = clampNum(parseFloat(value), 0);
  touch(p); saveDB(); renderMrp();
}
// Data in cui la riga deve essere pronta. Da qui scendono, lungo la distinta,
// le date d'ordine di tutto ciò che ci va dentro.
function planSetLineDue(id, lineId, value) {
  if (!roleGuard('docs')) { renderMrp(); return; }
  const p = getPlan(id); if (!p) return;
  const l = p.lines.find(x => x.id === lineId); if (!l) return;
  l.dueDate = value || '';
  touch(p); saveDB(); renderMrp();
}
function planDelLine(id, lineId) {
  if (!roleGuard('docs')) return;
  const p = getPlan(id); if (!p) return;
  p.lines = p.lines.filter(x => x.id !== lineId);
  touch(p); saveDB(); renderMrp();
}
function toggleMrpGroup() { mrpGrouped = !mrpGrouped; renderMrp(); }
function toggleMrpNet() { mrpNet = !mrpNet; renderMrp(); }
