// ═══════════════════════════════════════════════════════════
//  AVANZAMENTO: il Gantt del piano, con quello che è successo davvero
// ═══════════════════════════════════════════════════════════
// Il Gantt del piano (views-mrp.js) dice **entro quando** deve succedere ogni
// cosa perché la consegna regga. Non dice se è successa: per saperlo si
// aprivano a uno a uno l'ordine, l'ordine di lavoro, l'ordine di produzione.
// Questa vista mette le due cose sulla stessa riga: la barra del programma,
// identica a quella del Gantt, e sopra quanto è stato fatto davvero, letto dai
// documenti che il piano ha generato.
//
// Non scrive niente e non aggiunge campi. Il programma viene da
// planFeasibility()/schedFlat(), gli stessi del Gantt, e l'avanzamento dai dati
// che ci sono già:
//   acquisto        → ricevuto sulle righe degli ordini del piano
//   fase interna    → pezzi dichiarati sulle fasi dell'ODP
//   tratta esterna  → pezzi dichiarati sull'ODP, o rientrati sull'ODL
//   montaggio       → l'ODP dell'assieme, se c'è
// Una riga del disegno per tappa: una parte con tre tappe sono tre righe,
// perché ciascuna ha il suo documento e il suo stato, sotto una riga di testa
// col codice della parte (dalla 0.113.0).

const AVZ_MAX_RIGHE = 120;
// Gli stati (dalla 0.113.0) hanno parole diverse per ogni tipo di riga, ma un
// colore solo per il punto a cui sono: giallo all'inizio, viola a metà, blu
// quando ci si sta lavorando, verde alla fine. Il ritardo non è uno stato: è un'altra domanda — «sta rispettando
// il programma?» — e si dice accanto, in rosso, con i giorni.
//   montaggio       programmato · in corso · fatto
//   acquisto        da ordinare · ordinato · arrivato · da magazzino
//   fase            da programmare · programmato · in lavorazione · fatto
//   codice con ciclo da fare · in lavorazione · in attesa · fatto
// `chip` è l'etichetta nei conteggi in testa, dove due «programmato» di colore
// diverso si confonderebbero.
const AVZ_STATI = {
  'da ordinare': { label: 'da ordinare', fase: 'inizio' },
  'da programmare': { label: 'da programmare', fase: 'inizio' },
  'da fare': { label: 'da fare', fase: 'inizio' },
  'asm-programmato': { label: 'programmato', chip: 'programmato (montaggio)', fase: 'inizio' },
  ordinato: { label: 'ordinato', fase: 'mezzo' },
  programmato: { label: 'programmato', chip: 'programmato (fase)', fase: 'mezzo' },
  lavorazione: { label: 'in lavorazione', fase: 'mezzo', colore: 'lavoro' },
  attesa: { label: 'in attesa', fase: 'mezzo' },
  corso: { label: 'in corso', fase: 'mezzo', colore: 'lavoro' },
  arrivato: { label: 'arrivato', fase: 'fine' },
  fatto: { label: 'fatto', fase: 'fine' },
  coperto: { label: 'da magazzino', fase: 'fine' },
};
const AVZ_COLORE = { inizio: 'var(--yellow)', mezzo: 'var(--purple)', lavoro: 'var(--accent)', fine: 'var(--green)' };
const avzColore = stato => { const s = AVZ_STATI[stato] || AVZ_STATI['da fare']; return AVZ_COLORE[s.colore || s.fase]; };
const avzFinito = stato => (AVZ_STATI[stato] || {}).fase === 'fine';
let avzPiano = '';
let avzRiga = '';
function avzSetPiano(id) { avzPiano = id || ''; avzRiga = ''; renderAvanzamento(); }
function avzSetRiga(id) { avzRiga = id || ''; renderAvanzamento(); }
function avzApriPiano(id) { currentPlanId = id; mrpView = 'edit'; setView('mrp'); }

// I piani che hanno qualcosa da mostrare: aperti, con almeno una riga datata.
function avzPiani() {
  return (db.plans || []).filter(p => p.active !== false && (p.lines || []).some(l => l.dueDate));
}

// ─── Il modello ───
// Separato dal disegno: è quello che si prova. Ritorna null se il piano non
// c'è o non ha una riga con data.
function avzModello(planId, lineId) {
  const plan = getPlan(planId);
  if (!plan) return null;
  const feas = planFeasibility(plan).filter(f => f.tree && f.richiesta);
  if (!feas.length) return null;
  const f = feas.find(x => x.lineId === lineId) || feas[0];
  const oggi = oggiISO();
  const critici = new Set(f.critico);

  // I documenti del piano, una volta sola. Un documento annullato non è un
  // documento: la sua riga torna da fare, come nel fabbisogno.
  const vivo = d => d.active !== false && d.status !== 'annullato';
  const docs = planDocs(plan.id);
  const ordini = docs.orders.filter(vivo);
  const richieste = docs.rfqs.filter(r => r.active !== false);
  const odl = docs.workOrders.filter(vivo);
  const odp = docs.prodOrders.filter(vivo);
  // Cosa il piano deve ancora documentare, al netto di giacenza e arrivi: un
  // acquisto senza ordine che non va comprato è coperto, non in ritardo.
  const exp = mrpExplodePlan(plan);
  const daComprare = new Set(exp.buy.map(e => mrpBuyRow(e, true, plan.id)).filter(r => r.qtyOrder > 0).map(r => r.item.id));
  const daFabbricare = new Set(exp.make.map(e => mrpMakeRow(e, plan.id)).filter(r => r.qtyOrder > 0).map(r => r.item.id));

  // Le righe in ordine di lettura. Una parte da fabbricare mette **prima** il
  // materiale del suo ciclo e poi le sue tappe (dalla 0.111.0): è la sequenza
  // vera — il tondo arriva, poi si tornisce — e nell'ordine dell'albero
  // (padre, poi figli) il materiale finiva sotto l'ultima fase. Un assieme
  // resta in testa ai suoi componenti, come nel Gantt del piano.
  // Una parte con ciclo ha una riga di testa e sotto le sue fasi (dalla
  // 0.113.0): il codice si legge una volta, le fasi una per riga.
  const righe = [];
  const visita = (n, livello) => {
    const base = { node: n, item: n.item, livello, critico: critici.has(n) };
    if (n.kind === 'buy') righe.push(Object.assign(base, avzAcquisto(n, ordini, richieste, daComprare, oggi)));
    else if (n.kind === 'asm') {
      righe.push(Object.assign(base, avzMontaggio(n, odp, oggi, plan.id)));
      n.children.forEach(c => visita(c, livello + 1));
    } else {
      n.children.forEach(c => visita(c, livello + 1));
      const suoi = odp.filter(o => o.itemId === n.item.id);
      if (!n.steps.length) { righe.push(Object.assign(base, avzSenzaTappe(n, suoi, daFabbricare, oggi))); return; }
      const fasi = n.steps.map(st => Object.assign({}, base, { livello: livello + 1, fase: true },
        avzTappa(n, st, suoi, odl, daFabbricare, oggi)));
      righe.push(Object.assign(base, avzCiclo(n, fasi, suoi, oggi)), ...fasi);
    }
  };
  visita(f.tree, 0);

  const conteggi = {};
  Object.keys(AVZ_STATI).forEach(k => { conteggi[k] = 0; });
  // La testa di un ciclo riassume le sue fasi: nei conteggi peserebbe due volte.
  const contate = righe.filter(r => r.tipo !== 'ciclo');
  contate.forEach(r => { conteggi[r.stato] = (conteggi[r.stato] || 0) + 1; });
  return {
    plan, feas, f, oggi, righe, conteggi,
    inRitardo: contate.filter(r => r.ritardo > 0).length,
    // Quello che pesa sulla consegna: i ritardi sul percorso critico.
    criticiInRitardo: contate.filter(r => r.critico && r.ritardo > 0),
  };
}

// Di quanti giorni una riga non ancora finita è in ritardo sul programma.
// Oltre la fine (o con un arrivo atteso che cade dopo) conta da lì; se non è
// cominciata e la data d'inizio è passata, conta da quella. 0 = in tempo.
function avzRitardo(finito, iniziato, start, end, attesa, oggi) {
  if (finito) return 0;
  const oltre = [oggi, attesa].filter(Boolean).reduce((a, d) => d > a ? d : a, '');
  if (end && oltre > end) return ganttGiorni(end, oltre);
  if (!iniziato && start && oggi > start) return ganttGiorni(start, oggi);
  return 0;
}
// I pezzi che mancano a una tappa chiusa con meno pezzi del richiesto.
const avzMeno = (fatto, totale, qty) => Math.max(0, Math.min(totale, Number(qty) || totale) - fatto);

function avzAcquisto(n, ordini, richieste, daComprare, oggi) {
  const docs = [];
  let qty = 0, ricevuto = 0, attesa = '', emesso = false;
  ordini.forEach(o => (o.lines || []).forEach(l => {
    if (l.itemId !== n.item.id) return;
    const q = Number(l.qty) || 0, r = Number(l.received) || 0;
    qty += q; ricevuto += r;
    if (o.status !== 'bozza') emesso = true;
    const data = l.confirmedDate || l.deliveryDate || '';
    if (r < q && data && data > attesa) attesa = data;
    docs.push({ kind: 'order', id: o.id, number: o.number,
      testo: `${ORDER_STATUS[o.status] || o.status} · ${fmtQtyIt(r)}/${fmtQtyIt(q)}${r < q && data ? ' · arrivo ' + fmtDateIt(data) : ''}` });
  }));
  if (!docs.length) {
    richieste.forEach(rq => {
      if ((rq.lines || []).some(l => l.itemId === n.item.id)) docs.push({ kind: 'rfq', id: rq.id, number: rq.number, testo: 'richiesta d\'offerta' });
    });
  }
  const label = schedNodeLabel(n);
  const base = { tipo: 'buy', label, start: n.start, end: n.end, attesa, docs, meno: 0 };
  if (!qty) {
    const coperto = !daComprare.has(n.item.id);
    return Object.assign(base, { fatto: 0, totale: 0, pct: coperto ? 1 : 0, stato: coperto ? 'coperto' : 'da ordinare',
      ritardo: coperto ? 0 : avzRitardo(false, false, n.start, n.end, '', oggi),
      nota: coperto ? 'Esistente e in arrivo bastano: non serve un ordine' : (docs.length ? 'Richiesta d\'offerta, nessun ordine' : 'Nessun ordine emesso') });
  }
  // Un ordine ancora in bozza non è partito: l'acquisto resta da ordinare.
  const stato = ricevuto >= qty - 0.000001 ? 'arrivato' : emesso ? 'ordinato' : 'da ordinare';
  return Object.assign(base, { fatto: ricevuto, totale: qty, pct: Math.min(1, ricevuto / qty), stato,
    ritardo: avzRitardo(stato === 'arrivato', emesso, n.start, n.end, attesa, oggi), nota: '' });
}

// Le fasi dell'ODP che cadono in una tappa del programma. Le fasi senza
// `opIndex` (ordini di prima della 0.90) si leggono per posizione.
function avzFasiDi(o, st) {
  return (o.phases || []).filter((ph, i) => {
    const k = ph.opIndex != null ? ph.opIndex : i;
    return k >= st.from && k <= st.to;
  });
}
// Il numero della fase e quello che vi si fa: il centro di lavoro (o i centri,
// se la tratta dal terzista ne raggruppa più d'uno) e chi la fa.
function avzFaseNumero(st) {
  return st.from === st.to ? `fase ${cyclePhaseNumber(st.from)}` : `fasi ${cyclePhaseNumber(st.from)}-${cyclePhaseNumber(st.to)}`;
}
function avzFaseLavoro(n, st) {
  const ops = ((n.item && n.item.cycle) || []).filter(r => r.kind === 'op').slice(st.from, st.to + 1);
  const centri = [...new Set(ops.map(r => (getWorkCenter(r.workCenterId) || {}).name).filter(Boolean))];
  const chi = st.esterna ? (supplierName(st.supplierId) || 'terzista') : 'interna';
  return `${centri.join(', ') || 'lavorazione'} · ${chi}`;
}
function avzTappa(n, st, suoi, odl, daFabbricare, oggi) {
  const label = avzFaseLavoro(n, st);
  const tipo = st.esterna ? 'est' : 'int';
  const docs = [];
  let totale = 0, fatto = 0, iniziato = false, emesso = false, tutteChiuse = true, conFasi = 0;
  suoi.forEach(o => {
    const fasi = avzFasiDi(o, st);
    if (!fasi.length) return;
    conFasi++;
    const ultima = fasi[fasi.length - 1];
    const q = Number(o.qty) || 0;
    const fattiQui = opFatti(o, ultima);
    totale += q; fatto += fattiQui;
    if (o.status !== 'bozza') emesso = true;
    if (fasi.some(ph => opAvviata(o, ph) || opProcessati(o, ph) > 0)) iniziato = true;
    if (!fasi.every(ph => opChiusa(o, ph))) tutteChiuse = false;
    const corrente = opFaseCorrente(o);
    const qui = corrente && fasi.some(ph => ph.id === corrente.id);
    docs.push({ kind: 'odp', id: o.id, number: o.number,
      testo: `${fasi.length === 1 ? 'fase ' + ultima.seq : 'fasi ' + fasi[0].seq + '-' + ultima.seq} · ${fmtQtyIt(fattiQui)}/${fmtQtyIt(q)}${qui ? ' · ferma qui' : ''}` });
  });
  // Gli ordini di lavoro della tratta: quelli del piano, o generati dai suoi
  // ODP (che portano anch'essi il piano). La riga nomina le sue fasi per chiave.
  // Un ODL inviato vuol dire che i pezzi sono dal terzista: è in lavorazione.
  let odlQty = 0, odlRientro = 0, attesa = '', fuori = false;
  if (st.esterna) {
    odl.forEach(o => (o.lines || []).forEach(l => {
      const chiavi = clPhaseKeys(l).filter(k => {
        const p = String(k).split('#');
        const idx = parseInt(p[1], 10);
        return p[0] === n.item.id && idx >= st.from && idx <= st.to;
      });
      if (!chiavi.length) return;
      const q = Number(l.qty) || 0, r = Number(l.received) || 0;
      odlQty += q; odlRientro += r;
      if (o.status !== 'bozza') emesso = true;
      const data = l.confirmedDate || l.deliveryDate || '';
      if (r < q && data && data > attesa) attesa = data;
      const presso = o.status !== 'bozza' && o.status !== 'evaso' && r < q;
      if (presso || r > 0) fuori = true;
      docs.push({ kind: 'odl', id: o.id, number: o.number,
        testo: `${ORDER_STATUS[o.status] || o.status}${presso ? ' · presso ' + (supplierName(o.supplierId) || 'terzista') : ''} · rientrati ${fmtQtyIt(r)}/${fmtQtyIt(q)}${r < q && data ? ' · rientro ' + fmtDateIt(data) : ''}` });
    }));
  }
  const base = { tipo, label, numero: avzFaseNumero(st), start: st.start, end: st.end, attesa, docs, meno: 0, nota: '' };
  const conclusa = (stato, ini) => avzRitardo(stato === 'fatto', ini, st.start, st.end, attesa, oggi);
  if (conFasi) {
    const chiusa = tutteChiuse || (totale > 0 && fatto >= totale - 0.000001);
    const ini = iniziato || fuori;
    const stato = chiusa ? 'fatto' : ini ? 'lavorazione' : emesso ? 'programmato' : 'da programmare';
    return Object.assign(base, { fatto, totale, stato, ritardo: conclusa(stato, ini),
      meno: chiusa ? avzMeno(fatto, totale, n.qty) : 0,
      pct: stato === 'fatto' ? 1 : (totale ? Math.min(1, fatto / totale) : 0) });
  }
  if (odlQty) {
    const stato = odlRientro >= odlQty - 0.000001 ? 'fatto' : fuori ? 'lavorazione' : emesso ? 'programmato' : 'da programmare';
    return Object.assign(base, { fatto: odlRientro, totale: odlQty, pct: Math.min(1, odlRientro / odlQty), stato, ritardo: conclusa(stato, fuori) });
  }
  const coperto = !daFabbricare.has(n.item.id);
  return Object.assign(base, { fatto: 0, totale: 0, pct: coperto ? 1 : 0, stato: coperto ? 'coperto' : 'da programmare',
    ritardo: coperto ? 0 : conclusa('', false),
    nota: coperto ? 'Niente da fabbricare per questo piano' : 'Nessun ordine di produzione' });
}
// La riga di testa di una parte con ciclo: riassume le sue fasi. «In attesa»
// quando una fase è finita e la successiva non è ancora partita: i pezzi
// aspettano fra una lavorazione e l'altra.
function avzCiclo(n, fasi, suoi, oggi) {
  const stati = fasi.map(r => r.stato);
  let stato;
  if (stati.every(s => s === 'coperto')) stato = 'coperto';
  else if (stati.every(avzFinito)) stato = 'fatto';
  else if (stati.includes('lavorazione')) stato = 'lavorazione';
  else if (stati.some(avzFinito)) stato = 'attesa';
  else stato = 'da fare';
  const docs = suoi.map(o => ({ kind: 'odp', id: o.id, number: o.number,
    testo: `${ODP_STATUS[o.status] || o.status} · ${fmtQtyIt(opVersato(o))}/${fmtQtyIt(Number(o.qty) || 0)}` }));
  const ops = ((n.item && n.item.cycle) || []).filter(r => r.kind === 'op').length;
  return { tipo: 'ciclo', label: `ciclo di ${ops} ${ops === 1 ? 'fase' : 'fasi'}`, start: n.start, end: n.end, attesa: '',
    fatto: stati.filter(avzFinito).length, totale: fasi.length, pct: stati.filter(avzFinito).length / fasi.length, stato,
    ritardo: Math.max(0, ...fasi.map(r => r.ritardo || 0)), meno: Math.max(0, ...fasi.map(r => r.meno || 0)), docs,
    nota: suoi.length ? '' : (stato === 'coperto' ? 'Niente da fabbricare per questo piano' : 'Nessun ordine di produzione') };
}
// Una parte senza ciclo: una riga sola, con il suo ODP se c'è. Si legge come
// una fase.
function avzSenzaTappe(n, suoi, daFabbricare, oggi) {
  return avzDaOdp(n, suoi, 'int', 'fabbricazione', daFabbricare.has(n.item.id), oggi);
}
// Il montaggio: si segue solo se l'assieme ha un ordine di produzione. Senza,
// non c'è niente che lo registri, e la riga lo dice invece di inventarlo.
// Dalla 0.100.0 il montaggio si dichiara anche senza ODP (produzione.js): i
// pezzi montati dichiarati sul piano dicono a che punto è.
function avzMontaggio(n, odp, oggi, planId) {
  const suoi = odp.filter(o => o.itemId === n.item.id);
  if (suoi.length) return avzDaOdp(n, suoi, 'asm', schedNodeLabel(n), true, oggi);
  const montati = planId ? Math.min(prodottiDi(planId, n.item.id), n.qty) : 0;
  const base = { tipo: 'asm', label: schedNodeLabel(n), start: n.start, end: n.end, attesa: '', docs: [], meno: 0 };
  if (montati > 0) {
    const stato = montati >= n.qty - 0.000001 ? 'fatto' : 'corso';
    return Object.assign(base, { fatto: montati, totale: n.qty, pct: n.qty ? Math.min(1, montati / n.qty) : 0, stato,
      ritardo: avzRitardo(stato === 'fatto', true, n.start, n.end, '', oggi), nota: `Montati ${fmtQtyIt(montati)} di ${fmtQtyIt(n.qty)}` });
  }
  return Object.assign(base, { fatto: 0, totale: 0, pct: 0, stato: 'asm-programmato',
    ritardo: avzRitardo(false, false, n.start, n.end, '', oggi),
    nota: n.end && oggi > n.end ? 'Data passata: nessun montaggio dichiarato' : 'Nessun montaggio dichiarato: si dichiara nel piano, scheda «Da montare»' });
}
function avzDaOdp(n, suoi, tipo, label, serve, oggi) {
  const docs = [];
  const asm = tipo === 'asm';
  // Un ODP lanciato ma non avviato è programmato: il documento c'è, il
  // lavoro no.
  let totale = 0, fatto = 0, iniziato = false, emesso = false, finito = suoi.length > 0;
  suoi.forEach(o => {
    const q = Number(o.qty) || 0;
    const v = opVersato(o);
    totale += q; fatto += v;
    if (o.status !== 'bozza') emesso = true;
    if (o.status === 'corso' || v > 0) iniziato = true;
    if (!['completato', 'chiuso'].includes(o.status)) finito = false;
    docs.push({ kind: 'odp', id: o.id, number: o.number,
      testo: `${ODP_STATUS[o.status] || o.status} · ${fmtQtyIt(v)}/${fmtQtyIt(q)}` });
  });
  const base = { tipo, label, start: n.start, end: n.end, attesa: '', docs, meno: 0 };
  if (!suoi.length) {
    const stato = !serve ? 'coperto' : asm ? 'asm-programmato' : 'da programmare';
    return Object.assign(base, { fatto: 0, totale: 0, pct: stato === 'coperto' ? 1 : 0, stato,
      ritardo: stato === 'coperto' ? 0 : avzRitardo(false, false, n.start, n.end, '', oggi),
      nota: stato === 'coperto' ? 'Niente da fabbricare per questo piano' : 'Nessun ordine di produzione' });
  }
  const chiuso = finito || (totale > 0 && fatto >= totale - 0.000001);
  const stato = chiuso ? 'fatto' : iniziato ? (asm ? 'corso' : 'lavorazione') : asm ? 'asm-programmato' : emesso ? 'programmato' : 'da programmare';
  return Object.assign(base, { fatto, totale, stato, meno: chiuso ? avzMeno(fatto, totale, n.qty) : 0,
    ritardo: avzRitardo(chiuso, iniziato, n.start, n.end, '', oggi),
    pct: stato === 'fatto' ? 1 : (totale ? Math.min(1, fatto / totale) : 0), nota: '' });
}

// ─── Disegno ───
function avzApriDoc(kind, id) {
  if (kind === 'order') openOrderFromPlan(id);
  else if (kind === 'odl') openOdlFromPlan(id);
  else if (kind === 'odp') openOdpFromPlan(id);
  else if (kind === 'rfq') openRfqFromPlan(id);
}
const AVZ_DOC_ICONA = { order: 'receipt', odl: 'wrench', odp: 'factory', rfq: 'mail' };
// Lo stato, e accanto in rosso quello che non va: i giorni di ritardo sul
// programma e i pezzi che una tappa chiusa non ha dato.
function avzStatoHtml(r) {
  const s = AVZ_STATI[r.stato] || AVZ_STATI['da fare'];
  const pct = r.totale > 0 && !avzFinito(r.stato) && r.tipo !== 'ciclo' && r.pct > 0 ? ` ${Math.round(r.pct * 100)}%` : '';
  const rit = r.ritardo > 0 ? ` <span class="avz-rosso" title="${esc(r.ritardo + ' giorni oltre il programma')}">+${r.ritardo} gg</span>` : '';
  const meno = r.meno > 0 ? ` <span class="avz-rosso" title="Chiusa con meno pezzi del richiesto">-${esc(fmtQtyIt(r.meno))} pz</span>` : '';
  return `<span class="avz-stato" style="color:${avzColore(r.stato)}">${esc(s.label)}${pct}</span>${rit}${meno}`;
}
// L'asse è comune a tutte le righe: ogni riga è un piccolo SVG largo 1000
// unità, stirato sulla colonna. Le linee non si deformano grazie a
// vector-effect; il testo delle date sta nell'intestazione, in HTML.
function avzAsse(m) {
  const date = [m.oggi, m.f.richiesta, m.f.fattibile].filter(Boolean);
  m.righe.forEach(r => [r.start, r.end, r.attesa].forEach(d => { if (d) date.push(d); }));
  const da = date.reduce((a, d) => d < a ? d : a), al = date.reduce((a, d) => d > a ? d : a);
  const giorni = Math.max(1, ganttGiorni(da, al) + 1);
  return { da, al, giorni, x: d => Math.max(0, Math.min(1000, (ganttGiorni(da, d) / giorni) * 1000)) };
}
function avzBarraHtml(r, asse, m) {
  const x = asse.x;
  const linea = (d, colore) => d ? `<line x1="${x(d).toFixed(1)}" y1="0" x2="${x(d).toFixed(1)}" y2="28" stroke="${colore}" stroke-width="1.5" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>` : '';
  let prog = '', piano = '';
  if (r.start && r.end) {
    const x1 = x(r.start), x2 = Math.max(x(r.end), x1 + 3);
    const fase = (AVZ_STATI[r.stato] || AVZ_STATI['da fare']).fase;
    // Finché non c'è avanzamento da disegnare, il colore dello stato sta sul
    // bordo della barra del programma: giallo da cominciare, viola programmato.
    const vuota = fase === 'inizio' || (fase === 'mezzo' && !(r.pct > 0));
    const tratt = vuota ? ` stroke="${avzColore(r.stato)}" stroke-width="1.5" vector-effect="non-scaling-stroke"` : '';
    piano = `<rect x="${x1.toFixed(1)}" y="4" width="${(x2 - x1).toFixed(1)}" height="20" rx="3" fill="var(--text-dim)" fill-opacity="0.28"${tratt}/>`;
    let fine = x1;
    if (fase === 'fine') fine = x2;
    else if (!vuota) fine = x1 + Math.max(3, (x2 - x1) * r.pct);
    if (fine > x1) prog = `<rect x="${x1.toFixed(1)}" y="9" width="${(fine - x1).toFixed(1)}" height="10" rx="2" fill="${avzColore(r.stato)}"${r.stato === 'coperto' ? ' fill-opacity="0.5"' : ''}/>`;
    if (r.ritardo > 0) {
      // Il ritardo si vede per quanto è lungo: da dove l'avanzamento è
      // arrivato fino a oggi, o all'arrivo atteso se cade dopo.
      const oltre = [m.oggi, r.attesa].filter(Boolean).reduce((a, d) => d > a ? d : a, '');
      const a = Math.max(x(oltre), fine + 3);
      prog += `<rect x="${fine.toFixed(1)}" y="9" width="${(a - fine).toFixed(1)}" height="10" rx="2" fill="var(--red)"/>`;
    }
  }
  const titolo = `${r.item.code || ''} — ${r.fase ? r.numero + ' ' : ''}${r.label}: programma dal ${fmtDateIt(r.start) || '—'} al ${fmtDateIt(r.end) || '—'}${r.attesa ? ', atteso il ' + fmtDateIt(r.attesa) : ''}`;
  // Il riquadro che appare sostando sulla barra è nostro (avzTip), non il
  // <title> del browser: quello ha il carattere del sistema, piccolo, e non si
  // può ingrandire.
  const s = AVZ_STATI[r.stato] || AVZ_STATI['da fare'];
  const tip = [
    `${r.item.code || ''} — ${r.fase ? r.numero + ' · ' : ''}${r.label}`,
    `Programma: dal ${fmtDateIt(r.start) || '—'} al ${fmtDateIt(r.end) || '—'}`,
    r.attesa ? `Atteso il ${fmtDateIt(r.attesa)}` : '',
    `Stato: ${s.label}${r.totale > 0 && r.tipo !== 'ciclo' ? ` (${fmtQtyIt(r.fatto)}/${fmtQtyIt(r.totale)})` : ''}`,
    r.ritardo > 0 ? `In ritardo di ${r.ritardo} gg` : '',
    r.meno > 0 ? `Chiusa con ${fmtQtyIt(r.meno)} pz in meno` : '',
  ].filter(Boolean).join('\n');
  return `<svg class="avz-svg" viewBox="0 0 1000 28" preserveAspectRatio="none" role="img" aria-label="${esc(titolo)}" data-tip="${esc(tip)}">
    ${piano}${prog}${linea(m.oggi, 'var(--text)')}${linea(m.f.richiesta, 'var(--red)')}</svg>`;
}
function avzTestaAsseHtml(asse) {
  // Un lunedì ogni tante settimane: al massimo sette date, perché stiano.
  const passo = 7 * Math.max(1, Math.ceil(asse.giorni / 7 / 7));
  let tacche = '';
  for (let d = inizioSettimana(asse.da); d <= asse.al; d = addDays(d, passo)) {
    if (d < asse.da) continue;
    tacche += `<span style="left:${(asse.x(d) / 10).toFixed(2)}%">${esc(fmtDateIt(d).slice(0, 5))}</span>`;
  }
  return `<div class="avz-asse" aria-hidden="true">${tacche}</div>`;
}
function avzDocsHtml(r) {
  if (!r.docs.length) return `<span class="empty-text" style="padding:0">${esc(r.nota || '—')}</span>`;
  return r.docs.map(d => `<div><span class="plandoc-link plandoc-link-sm" ${clickAttrs(`avzApriDoc('${d.kind}','${d.id}')`, 'Apri ' + d.number)}>${ico(AVZ_DOC_ICONA[d.kind] || 'file', 'tinted', '')} ${esc(d.number)}</span>
    <span class="empty-text" style="padding:0">${esc(d.testo)}</span></div>`).join('');
}
// Il riquadro sulle barre: uno solo, sul body, seguito dal puntatore.
function avzTip(e) {
  let tip = document.getElementById('avz-tip');
  const svg = e.target && e.target.closest ? e.target.closest('.avz-svg') : null;
  if (!svg || e.type === 'pointerleave') { if (tip) tip.hidden = true; return; }
  if (!tip) { tip = document.createElement('div'); tip.id = 'avz-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
  tip.textContent = svg.getAttribute('data-tip') || '';
  tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const x = Math.min(e.clientX + 14, window.innerWidth - w - 8);
  const y = e.clientY + 18 + h > window.innerHeight ? e.clientY - h - 10 : e.clientY + 18;
  tip.style.left = Math.max(8, x) + 'px';
  tip.style.top = Math.max(8, y) + 'px';
}
function renderAvanzamento() {
  const host = document.getElementById('view-avz'); if (!host) return;
  invalidateCaches();
  const piani = avzPiani();
  if (avzPiano && !piani.some(p => p.id === avzPiano)) { avzPiano = ''; avzRiga = ''; }
  const pid = avzPiano || (piani[0] && piani[0].id) || '';
  const m = pid ? avzModello(pid, avzRiga) : null;
  const testa = `<div class="bom-toolbar">
      <div class="bom-toolbar-left"><h2 class="section-title">${ico('chart', 'tinted pill', '')} Avanzamento</h2></div>
      <div class="bom-toolbar-right">${m ? `<button class="btn-outline" onclick="avzApriPiano('${m.plan.id}')">${ico('clipboard', 'tinted', '')} Apri il piano</button>${listExportButtons('avzExportSpec')}` : ''}</div>
    </div>`;
  if (!piani.length || !m) {
    host.innerHTML = `<div class="manage-wrap">${testa}<div class="empty-text">Nessun piano aperto con una data di consegna: l'avanzamento si segue sui piani di fabbisogno.</div></div>`;
    return;
  }
  const asse = avzAsse(m);
  const righe = m.righe.slice(0, AVZ_MAX_RIGHE);
  const neg = m.f.margine != null && m.f.margine < 0;
  const chips = (m.inRitardo ? `<span class="avz-chip"><i style="background:var(--red)"></i>${m.inRitardo} in ritardo</span>` : '')
    + Object.keys(AVZ_STATI).filter(k => m.conteggi[k]).map(k =>
      `<span class="avz-chip"><i style="background:${avzColore(k)}"></i>${m.conteggi[k]} ${esc(AVZ_STATI[k].chip || AVZ_STATI[k].label)}</span>`).join('');
  const pesano = m.criticiInRitardo.length
    ? `<p class="mrp-warn" style="margin:0 0 8px">${ico('warning', 'tinted', '')} Sul percorso critico, quindi pesa sulla consegna: ${m.criticiInRitardo.map(r => esc((r.item.code || '') + ' ' + r.label)).join(' · ')}.</p>` : '';
  // Le fasi di una parte con ciclo stanno sotto il suo codice: nella prima
  // colonna il numero di fase, rientrato di un livello.
  // Il percorso critico si segna con un'icona, non col rosso: il rosso è del
  // ritardo (dalla 0.113.0).
  const corpo = righe.map(r => `<tr class="${[r.critico ? 'avz-crit' : '', r.fase ? 'avz-fase' : '', r.tipo === 'ciclo' ? 'avz-testa' : ''].filter(Boolean).join(' ')}">
      <td style="font-family:var(--mono);white-space:nowrap;padding-left:${8 + r.livello * 12}px">${r.fase ? esc(r.numero) : codeLink(r.item.id, r.item.code)}${r.critico ? ' ' + ico('clock', 'tinted avz-crit-ico', 'Sul percorso critico: se slitta, slitta la consegna') : ''}</td>
      <td>${esc(r.label)}</td>
      <td class="avz-bar">${avzBarraHtml(r, asse, m)}</td>
      <td class="avz-docs">${avzDocsHtml(r)}</td>
      <td style="white-space:nowrap">${avzStatoHtml(r)}</td></tr>`).join('');
  host.innerHTML = `<div class="manage-wrap">${testa}
    <div class="catalog-filters">
      <select id="avz-plan" onchange="avzSetPiano(this.value)" title="Quale piano seguire">
        ${piani.map(p => `<option value="${esc(p.id)}" ${p.id === m.plan.id ? 'selected' : ''}>${esc(p.number)}${p.title ? ' — ' + esc(p.title) : ''}</option>`).join('')}
      </select>
      ${m.feas.length > 1 ? `<select id="avz-line" onchange="avzSetRiga(this.value)" title="Quale riga di piano">
        ${m.feas.map(f => `<option value="${esc(f.lineId)}" ${f.lineId === m.f.lineId ? 'selected' : ''}>${esc(f.tree.item.code || '')} — ${esc(fmtDateIt(f.richiesta))}</option>`).join('')}</select>` : ''}
    </div>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">La barra grigia è il programma del Gantt: entro quando deve succedere ogni cosa. Sopra, quello che è successo davvero, letto dai documenti del piano: il ricevuto sugli ordini, i rientri sugli ordini di lavoro, i pezzi dichiarati sugli ordini di produzione. Giallo da cominciare, viola programmato o ordinato, blu in lavorazione, verde finito; in rosso il ritardo sul programma. La linea scura tratteggiata è oggi, quella rossa la consegna richiesta. L'orologio accanto al codice segna il percorso critico: se quella tappa slitta, slitta la consegna.</p>
    <p style="margin:0 0 8px"><strong>${esc(m.f.tree.item.code || '')}</strong> ${esc(m.f.tree.item.name || '')} · consegna richiesta <strong>${esc(fmtDateIt(m.f.richiesta))}</strong>, fattibile <strong>${esc(fmtDateIt(m.f.fattibile) || '—')}</strong>${m.f.margine == null ? '' : neg
      ? ` · <span class="mrp-warn">${-m.f.margine} gg lavorativi di ritardo</span>` : ` · ${m.f.margine} gg lavorativi di margine`}</p>
    <div class="avz-chips">${chips}</div>
    ${pesano}
    <div class="table-wrap" onpointermove="avzTip(event)" onpointerleave="avzTip(event)"><table class="avz-table">
      <thead><tr><th scope="col">Codice</th><th scope="col">Tappa</th><th scope="col" class="avz-bar">${avzTestaAsseHtml(asse)}<span class="sr-only">Programma e avanzamento</span></th><th scope="col">Documenti</th><th scope="col">Stato</th></tr></thead>
      <tbody>${corpo}</tbody></table></div>
    ${m.righe.length > righe.length ? `<p class="empty-text" style="text-align:left">${ico('warning', 'tinted', '')} Mostrate le prime ${righe.length} tappe su ${m.righe.length}. L'export le contiene tutte.</p>` : ''}</div>`;
}
function avzExportSpec() {
  const piani = avzPiani();
  const pid = avzPiano || (piani[0] && piani[0].id) || '';
  const m = pid ? avzModello(pid, avzRiga) : null;
  const righe = m ? m.righe : [];
  return {
    titolo: 'Avanzamento' + (m ? ' ' + m.plan.number + ' — ' + (m.f.tree.item.code || '') : ''),
    slug: 'avanzamento_' + (m ? m.plan.number : 'piano'),
    filtri: m ? [['Piano', m.plan.number + (m.plan.title ? ' — ' + m.plan.title : '')], ['Consegna richiesta', fmtDateIt(m.f.richiesta)]] : [],
    sezioni: [{
      nome: 'Avanzamento',
      colonne: [
        { h: 'Codice', w: 18 }, { h: 'Articolo', w: 28 }, { h: 'Tappa', w: 30 }, { h: 'Inizio', w: 12, data: true },
        { h: 'Fine', w: 12, data: true }, { h: 'Fatto', w: 10, num: true }, { h: 'Totale', w: 10, num: true },
        { h: 'Stato', w: 14 }, { h: 'Ritardo (gg)', w: 10, num: true }, { h: 'Pezzi mancanti', w: 10, num: true }, { h: 'Documenti', w: 40 },
      ],
      righe: righe.map(r => [r.item.code || '', r.item.name || '', r.fase ? r.numero + ' — ' + r.label : r.label, r.start || '', r.end || '',
        +(r.fatto || 0).toFixed(3), +(r.totale || 0).toFixed(3), (AVZ_STATI[r.stato] || {}).label || r.stato,
        r.ritardo || 0, +(r.meno || 0).toFixed(3),
        r.docs.length ? r.docs.map(d => d.number + ' (' + d.testo + ')').join('; ') : (r.nota || '')]),
      totali: null,
    }],
  };
}
