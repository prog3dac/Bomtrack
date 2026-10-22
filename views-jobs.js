// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-jobs.js
// ═══════════════════════════════════════════════════════════
// Commesse: il cliente e la data a monte del lavoro.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
//
// ── Perché ──
// L'app sapeva già collegare fabbisogno → richiesta → ordine: la catena
// esisteva, ma partiva da un piano di produzione, che è un foglio di lavoro
// interno. Mancava l'anello a monte, cioè **per chi** e **per quando** si sta
// facendo tutto questo. Senza, alla domanda «cosa abbiamo ordinato per la
// commessa 240?» si risponde aprendo gli ordini a uno a uno.
//
// La commessa non aggiunge calcoli: aggiunge un nome e una data in cima alla
// catena, e la possibilità di percorrerla al contrario.

const JOB_STATUS = {
  aperta: 'Aperta',
  produzione: 'In produzione',
  chiusa: 'Chiusa',
  annullata: 'Annullata',
};
function jobList() { return db.jobs || []; }
function getJob(id) { return jobList().find(j => j.id === id); }
function jobLabel(j) { return j ? (j.number + (j.customer ? ' — ' + j.customer : '')) : ''; }
// Progressivo per anno, come richieste, ordini e piani: COM-<anno>-NNN
function nextJobNumber() { return numeroProgressivo('COM'); }
function jobOptions(selectedId) {
  // Le commesse chiuse restano selezionabili solo se già scelte: non si
  // aggancia lavoro nuovo a una commessa finita, ma i piani vecchi non devono
  // perdere il proprio riferimento.
  const aperte = jobList().filter(j => j.status !== 'chiusa' && j.status !== 'annullata' || j.id === selectedId);
  return `<option value="">— nessuna —</option>` + aperte
    .map(j => `<option value="${j.id}" ${j.id === selectedId ? 'selected' : ''}>${esc(jobLabel(j))}</option>`).join('');
}

// ─── Tracciabilità: cosa pende da una commessa ───
function jobPlans(jobId) { return (db.plans || []).filter(p => p.jobId === jobId); }
function jobDocs(jobId) {
  const planIds = new Set(jobPlans(jobId).map(p => p.id));
  // Un documento appartiene alla commessa se la cita, oppure se viene da un
  // piano che la cita: la seconda strada copre i documenti generati prima che
  // la commessa fosse assegnata al piano.
  const suo = d => d.jobId === jobId || (d.planId && planIds.has(d.planId));
  return { rfqs: (db.rfqs || []).filter(suo), orders: (db.orders || []).filter(suo),
    workOrders: (db.workOrders || []).filter(suo) };
}
// Quanto è stato ordinato per una commessa, e quanto è già arrivato.
// Quanto è impegnato con i fornitori per una commessa: merce **e** lavorazioni.
// Sono due documenti diversi ma un impegno solo — chi guarda una commessa vuole
// sapere quanto costa, non da quale elenco viene la cifra.
function jobTotals(jobId) {
  const { orders, workOrders } = jobDocs(jobId);
  let ordinato = 0, ricevuto = 0, righe = 0;
  [].concat(orders, workOrders).forEach(o => {
    if (o.status === 'annullato') return;
    (o.lines || []).forEach(l => {
      const q = Number(l.qty) || 0, p = Number(l.price) || 0, r = Number(l.received) || 0;
      ordinato += q * p; ricevuto += r * p; righe++;
    });
  });
  return { ordinato, ricevuto, righe, ordini: orders.length + workOrders.length };
}
// Ritardo: la commessa ha una data e quella data è passata senza chiusura.
function jobLate(j) {
  return !!j && !!j.dueDate && j.status !== 'chiusa' && j.status !== 'annullata' && j.dueDate < oggiISO();
}

// ─── Copertura materiale ───
// La domanda che nessuno faceva all'app: «se avvio questa commessa, il materiale
// c'è?». I pezzi per rispondere c'erano tutti — il fabbisogno esploso, la
// giacenza, l'impegnato, gli ordini in arrivo — ma vivevano una riga alla volta
// dentro il piano, e nessuno li sommava a livello di commessa. Si scopriva in
// officina, quando il lead time era già perso e la data al cliente già data.
//
// ── La commessa è UNA domanda, non N piani ──
// Le righe di tutti i suoi piani aperti si esplodono e si sommano per articolo.
// Guardare i piani uno a uno darebbe la risposta sbagliata: due piani della
// stessa commessa che chiedono 100 pz con 100 a magazzino si vedrebbero
// scoperti a vicenda, perché ognuno conterebbe l'altro come concorrenza. Da qui
// il `Set` passato a `mrpBuyRow`: la concorrenza sono gli **altri**, non noi.
//
// ── Quattro livelli, perché sono quattro telefonate diverse ──
//   'ordinare'    → non è ordinato: si compra. È l'unico che costa un lead time.
//   'documentato' → c'è già una richiesta o un ordine in bozza. Il netto non lo
//                   vede (una bozza non è merce in arrivo, ed è giusto così), ma
//                   dire «ordina» a chi il documento l'ha scritto è falso: gli
//                   manca di premere Invia.
//   'tardi'       → il netto è zero solo grazie a merce che arriva DOPO la data
//                   in cui serve. Non c'è niente da comprare: c'è un fornitore da
//                   sollecitare, o una data da spostare. Confonderlo con
//                   'ordinare' farebbe ricomprare merce già pagata.
//   'ok'          → coperto dall'esistente o da arrivi in tempo.
// Un semaforo rosso solo li appiattirebbe, e un avviso che dice «manca» anche a
// chi ha già ordinato si impara a chiudere senza leggerlo.
//
// Funzione pura: nessun DOM, nessuna lettura del toggle della vista Fabbisogno
// (`netMode` è forzato a true, come in homeSegnali) — o due utenti sulla stessa
// base dati leggerebbero due risposte diverse.
// «Documentato» vuol dire che il documento per quello che manca c'è e non è
// ancora partito: un ordine o un ordine di lavoro in bozza, o una richiesta
// d'offerta ancora aperta. Prima bastava un riferimento qualsiasi, e un ordine
// già inviato per 40 pezzi su 100 faceva dire «manca solo l'invio» ai 60 che
// nessuno aveva ancora ordinato (dalla 0.105.6). I documenti inviati sono già
// nel netto come merce in arrivo: qui contano solo quelli che il netto non vede,
// e solo se le loro quantità coprono quello che resta da ordinare.
function jobBozzeCoprono(item, refs, daOrdinare) {
  const doc = ref => ref.kind === 'rfq' ? (db.rfqs || []).find(d => d.id === ref.id)
    : ref.kind === 'order' ? (db.orders || []).find(d => d.id === ref.id)
      : ref.kind === 'odl' ? (db.workOrders || []).find(d => d.id === ref.id) : null;
  const ferma = ref => {
    const d = doc(ref); if (!d) return false;
    return ref.kind === 'rfq' ? d.status !== 'chiusa' : d.status === 'bozza';
  };
  const coperto = (refs || []).filter(ferma)
    .reduce((s, ref) => s + fromAltUom(item, ref.qty, ref.uom || itemUom(item)), 0);
  return coperto > 0 && coperto >= daOrdinare - 0.000001;
}
function jobCoverage(jobId) {
  const j = getJob(jobId);
  const tutti = jobPlans(jobId);
  // Un piano chiuso non impegna materiale e non è lavoro da fare: è la stessa
  // regola di commitIndex(). Includerlo qui ed escluderlo là darebbe due verità.
  const piani = tutti.filter(p => p.active !== false && (p.lines || []).length);
  const base = { piani: tutti.length, pianiAperti: piani.length, entro: (j && j.dueDate) || '',
    cycle: false, righe: [], daOrdinare: [], documentate: [], tardive: [] };
  // Nessun piano aperto: NON è «tutto ok», è «non lo so». La commessa non ha
  // ancora detto cosa va prodotto, e una spunta verde qui sarebbe una bugia
  // comoda — proprio a chi sta per avviare il lavoro.
  if (!piani.length) return Object.assign(base, { stato: 'ignoto' });

  const miei = new Set(piani.map(p => p.id));
  // Dove ogni riga del piano è già finita: richiesta o ordine, bozze comprese.
  const docs = new Map();
  // planDocumentedKeys indicizza anche le fasi di conto lavoro, con la loro
  // chiave. Qui si cerca sempre per id articolo: quelle voci restano nella
  // mappa e non le trova nessuno — innocue. La copertura di commessa guarda il
  // materiale, e includere le lavorazioni cambierebbe il semaforo: è una
  // decisione a sé, non un effetto collaterale di questa.
  piani.forEach(p => planDocumentedKeys(p.id).forEach((refs, id) => docs.set(id, (docs.get(id) || []).concat(refs))));

  // Un'esplosione per piano, poi la somma per articolo: si tiene la data più
  // vicina (come mrpAdd) e si ricorda da quale piano viene, che è dove si va a
  // generare il documento. Una riga senza data eredita quella del piano e poi
  // quella della commessa: è la data che il cliente ha in mano, e senza di essa
  // «in tempo» non significa niente.
  const per = new Map();
  piani.forEach(p => {
    const righeP = (p.lines || []).map(l => ({ itemId: l.itemId, qty: l.qty,
      dueDate: l.dueDate || p.dueDate || base.entro }));
    const exp = mrpExplode(righeP, mrpOpzPiano(p.id));
    if (exp.cycle) base.cycle = true;
    exp.buy.forEach(e => {
      const cur = per.get(e.item.id);
      if (cur) { cur.qty += e.qty; cur.due = primaData(cur.due, e.due); }
      else per.set(e.item.id, { item: e.item, qty: e.qty, due: e.due, plan: p });
    });
  });

  base.righe = Array.from(per.values()).map(e => {
    const r = mrpBuyRow({ item: e.item, qty: e.qty, due: e.due }, true, miei);
    const serve = e.due || base.entro || '';
    const refs = docs.get(e.item.id) || [];
    // Lo stesso conto del netto, con il solo in arrivo che arriva in tempo: non
    // si riscrive la regola di lotto, scorta e impegni — le si cambia un
    // ingrediente. Se così il netto risale sopra zero, la merce c'è ma tardi.
    const arr = incomingEntro(e.item.id, serve);
    const netEntro = netRequirement(Math.max(0, e.qty - r.prelevato), r.onHand, arr.inTempo, r.safety, r.lotSize, r.committed, r.lotMode);
    let livello = 'ok';
    if (r.qtyOrder > 0) livello = jobBozzeCoprono(e.item, refs, r.qtyOrder) ? 'documentato' : 'ordinare';
    else if (netEntro > 0) livello = 'tardi';
    return { itemId: e.item.id, code: e.item.code || '', name: e.item.name || '', uom: r.uom,
      qty: e.qty, qtyOrder: r.qtyOrder, livello, due: serve, orderBy: r.orderBy, urgenza: r.urgenza,
      eta: arr.tardivi.length ? arr.tardivi[0].eta : '', docs: refs,
      planId: e.plan.id, planNumber: e.plan.number || '',
      noSupplier: r.noSupplier, noPrice: r.noPrice };
  });
  const conLivello = liv => base.righe.filter(r => r.livello === liv);
  base.daOrdinare = conLivello('ordinare');
  base.documentate = conLivello('documentato');
  base.tardive = conLivello('tardi');
  // Con un anello nelle distinte l'esplosione è troncata: la copertura sarebbe
  // ottimista, e dichiararla «ok» sarebbe una promessa che non si può mantenere.
  base.stato = base.daOrdinare.length ? 'manca'
    : (base.documentate.length || base.tardive.length || base.cycle) ? 'attenzione' : 'ok';
  return base;
}
// Il KPI: la cifra grande è il numero di articoli, e l'etichetta dice che cosa
// sono. Scrivere «da ordinare» dentro il valore rimpicciolirebbe la cifra, che è
// il dato vero.
function jobCoverageKpi(cov) {
  if (cov.stato === 'ignoto') return kpi('Materiale', '—', '');
  if (cov.stato === 'ok') return kpi('Materiale', 'coperto', 'green');
  if (cov.stato === 'manca') return kpi('Materiale da ordinare', String(cov.daOrdinare.length), 'red');
  return kpi('Materiale da seguire', String(cov.documentate.length + cov.tardive.length), 'orange');
}
// Il disegno riusa le pastiglie del riepilogo (homeVociHtml): sono già il modo
// in cui l'app dice «ecco chi», e un secondo dialetto per la stessa frase sarebbe
// un peggioramento. Dipendenza in avanti su views-home.js, che si carica dopo:
// a runtime c'è sempre, perché questa funzione la chiama solo un disegno.
function jobCoverageHtml(cov) {
  if (cov.stato === 'ignoto') return '';
  const gruppo = (righe, testo, voce) => righe.length ? `<div class="home-sig">
      <div class="mgmt-item">
        <span style="font-family:var(--mono);font-weight:700;width:60px;text-align:right">${righe.length}</span>
        <span style="flex:1">${esc(testo)}</span>
      </div>
      ${homeVociHtml({ vista: 'mrp', voci: righe.map(voce) })}
    </div>` : '';
  const dove = r => r.planId ? `apriPianoDaCommessa('${r.planId}')` : '';
  const avviso = cov.cycle
    ? `<div class="empty-text" style="text-align:left;color:var(--red)">${ico('warning', 'tinted', '')} Le distinte contengono un anello: l'esplosione è troncata e la copertura è incompleta.</div>`
    : '';
  if (cov.stato === 'ok') {
    return avviso + `<div class="empty-text" style="text-align:left">${ico('check', 'tinted', '')} Esistente e merce in arrivo coprono il fabbisogno ${cov.pianiAperti === 1 ? 'del piano aperto' : 'dei ' + cov.pianiAperti + ' piani aperti'}.</div>`;
  }
  return avviso
    + gruppo(cov.daOrdinare, 'da ordinare: non sono in nessun documento', r => ({
      testo: r.code,
      titolo: `${r.name} — ${fmtQtyIt(r.qtyOrder)} ${r.uom} da ordinare, piano ${r.planNumber}`
        + (r.due ? `, serve per ${fmtDateIt(r.due)}` : '')
        + (r.orderBy ? `, da ordinare entro ${fmtDateIt(r.orderBy)}` : ''),
      azione: dove(r),
    }))
    + gruppo(cov.documentate, 'in una richiesta aperta o in un ordine non ancora inviato', r => ({
      testo: r.code,
      titolo: `${r.name} — ${r.docs.map(d => d.number).join(', ')}: il documento c'è, manca l'ordine inviato`,
      azione: dove(r),
    }))
    + gruppo(cov.tardive, 'in arrivo dopo la data in cui servono', r => ({
      testo: r.code,
      titolo: `${r.name} — arrivo previsto ${fmtDateIt(r.eta)}${r.due ? `, serve per ${fmtDateIt(r.due)}` : ''}`,
      azione: dove(r),
    }));
}
// La domanda che si fa prima di avviare il lavoro. Testo semplice: askConfirm()
// lo manda a capo da sé. Pura e testabile come il resto.
const JOB_COV_NOMI_MAX = 5;
function jobCoverageDomanda(j, cov) {
  const consegna = j && j.dueDate ? `\nLa consegna al cliente è il ${fmtDateIt(j.dueDate)}.` : '';
  if (cov.stato === 'ignoto') {
    return `La commessa ${j.number} non ha piani di fabbisogno aperti: non si può sapere se il materiale c'è.`
      + `\nMetterla in produzione significa avviare il lavoro senza aver detto cosa va prodotto.` + consegna;
  }
  const nomi = righe => {
    const primi = righe.slice(0, JOB_COV_NOMI_MAX).map(r => `${r.code} (${fmtQtyIt(r.qtyOrder || r.qty)} ${r.uom})`);
    const resto = righe.length - primi.length;
    return primi.join(', ') + (resto > 0 ? ` e altri ${resto}` : '');
  };
  const parti = [];
  if (cov.daOrdinare.length) {
    parti.push(`${cov.daOrdinare.length === 1 ? 'Un articolo non è ancora ordinato' : cov.daOrdinare.length + ' articoli non sono ancora ordinati'}: ${nomi(cov.daOrdinare)}.`);
  }
  if (cov.documentate.length) {
    parti.push(`${cov.documentate.length === 1 ? 'Un articolo è' : cov.documentate.length + ' articoli sono'} in una richiesta aperta o in un ordine non ancora inviato: ${nomi(cov.documentate)}.`);
  }
  if (cov.tardive.length) {
    parti.push(`${cov.tardive.length === 1 ? 'Un articolo arriva' : cov.tardive.length + ' articoli arrivano'} dopo la data in cui ${cov.tardive.length === 1 ? 'serve' : 'servono'}: `
      + cov.tardive.slice(0, JOB_COV_NOMI_MAX).map(r => `${r.code} il ${fmtDateIt(r.eta)}`).join(', ') + '.');
  }
  if (cov.cycle) parti.push('Le distinte contengono un anello: la copertura è incompleta.');
  return parti.join('\n') + consegna;
}

// ─── Vista ───
let jobView = 'list';       // 'list' | 'edit'
let currentJobId = null;

function renderJobs() {
  const host = document.getElementById('view-jobs'); if (!host) return;
  invalidateCaches();
  if (jobView === 'edit' && !getJob(currentJobId)) { jobView = 'list'; currentJobId = null; }
  host.innerHTML = worklistHtml({
    titolo: 'Commesse', icona: 'clipboard', listaId: 'job-list',
    comandi: `<button class="add-btn-sm" onclick="newJob()">+ Nuova commessa</button>
      ${listExportButtons('jobsExportSpec')}`,
    filtri: `<input type="text" class="search" id="job-search" value="${esc(val('job-search'))}" placeholder="Numero, cliente o descrizione..." oninput="jobSearchInput()">
      ${dateRangeFilter('job-date', val('job-date-from'), val('job-date-to'), 'jobFilterChange()', 'apertura commessa')}
      <span class="doc-filter-count" id="job-count">${jobCountText()}</span>`,
    righe: jobListRows(),
    doc: jobView === 'edit' ? renderJobEdit(currentJobId) : '',
    vuoto: {
      titolo: 'Nessuna commessa aperta qui',
      testo: 'Scegli una commessa dall\'elenco a destra: al centro compaiono il cliente, la data di consegna e tutto quello che le pende dietro — piani di fabbisogno, richieste di offerta e ordini.',
      comandi: '<button class="add-btn-sm" onclick="newJob()">+ Nuova commessa</button>',
    },
  });
  a11yFields(host);
}
// La digitazione ridisegna solo l'elenco: la barra dei filtri resta com'è,
// altrimenti il campo di ricerca perderebbe il focus a ogni lettera.
function jobSearchInput() {
  debounced('jobs', () => {
    renderInto('job-list', jobListRows);
    const c = document.getElementById('job-count');
    if (c) c.textContent = jobCountText();
  });
}
// Le date si scelgono dal calendario: un gesto già concluso, niente da
// aspettare. Come per la digitazione si ridisegna solo l'elenco, o la barra
// perderebbe il campo appena toccato.
function jobFilterChange() {
  renderInto('job-list', jobListRows);
  const c = document.getElementById('job-count');
  if (c) c.textContent = jobCountText();
}
function jobCountText() {
  return worklistCount(jobFilteredList().length, jobList().length, 'commessa', 'commesse');
}
// Le commesse che l'elenco mostra. Fuori dal disegno perché le serve anche
// l'export: filtrare due volte è il modo di far divergere schermo e file.
function jobFilteredList() {
  const q = (val('job-search') || '').toLowerCase();
  const da = val('job-date-from'), a = val('job-date-to');
  const tutte = jobList().slice().sort((a2, b) => String(b.number || '').localeCompare(String(a2.number || '')));
  return tutte.filter(j => {
    // Il periodo guarda l'apertura della commessa, non la consegna: è la data
    // che risponde a «cosa abbiamo preso in carico a settembre».
    if (!inDateRange(j.date, da, a)) return false;
    if (!q) return true;
    return (j.number + ' ' + (j.customer || '') + ' ' + (j.title || '')).toLowerCase().includes(q);
  });
}
// ─── Export dell'elenco ───
function jobsExportSpec() {
  return {
    titolo: 'Commesse',
    slug: 'commesse',
    filtri: [['Ricerca', val('job-search')], ['Data apertura', dateRangeText(val('job-date-from'), val('job-date-to'))]],
    sezioni: [{
      nome: 'Commesse',
      colonne: [
        { h: 'Numero', w: 18 }, { h: 'Stato', w: 14 }, { h: 'Cliente', w: 28 }, { h: 'Descrizione', w: 34 },
        { h: 'Consegna', w: 12, data: true }, { h: 'In ritardo', w: 10 }, { h: 'Piani', w: 8, num: true },
        { h: 'Ordini', w: 8, num: true }, { h: `Ordinato (${cur()})`, w: 16, num: true },
      ],
      righe: jobFilteredList().map(j => {
        const t = jobTotals(j.id);
        return [j.number || '', JOB_STATUS[j.status] || j.status || '', j.customer || '', j.title || '',
          j.dueDate || '', jobLate(j) ? 'sì' : '', jobPlans(j.id).length, t.ordini, +t.ordinato.toFixed(2)];
      }),
    }],
  };
}
function jobListRows() {
  const righe = jobFilteredList();
  return righe.map(j => {
    const t = jobTotals(j.id);
    const piani = jobPlans(j.id).length;
    const tardi = jobLate(j);
    const meta = [
      j.dueDate ? (tardi ? ico('warning', 'tinted', 'Consegna in ritardo') + ' ' : '') + esc(fmtDateIt(j.dueDate)) : '',
      piani + (piani === 1 ? ' piano' : ' piani'),
      t.ordini + (t.ordini === 1 ? ' ordine' : ' ordini'),
      t.ordinato ? fmtN(t.ordinato) : '',
    ].filter(Boolean).join(' · ');
    return worklistRow({
      numero: j.number,
      badge: statusBadge(JOB_STATUS, j.status),
      titolo: [j.customer, j.title].filter(Boolean).join(' · '),
      meta,
      sel: jobView === 'edit' && currentJobId === j.id,
      spenta: j.status === 'chiusa' || j.status === 'annullata',
      azione: `openJobEdit('${j.id}')`,
      etichetta: `Apri la commessa ${j.number}`,
    });
  }).join('') || `<div class="empty-text">${jobList().length ? 'Nessuna commessa con questa ricerca.' : 'Nessuna commessa. Creane una con "+ Nuova commessa".'}</div>`;
}
function renderJobEdit(id) {
  const j = getJob(id); if (!j) return '';
  const piani = jobPlans(id);
  const { rfqs, orders, workOrders } = jobDocs(id);
  const t = jobTotals(id);
  const cov = jobCoverage(id);
  const elenco = (titolo, righe, vuoto) => `<div class="mrp-section">
    <div class="cycle-section-head"><h3>${titolo}</h3></div>
    ${righe || `<div class="empty-text">${vuoto}</div>`}</div>`;
  const rigaPiano = p => `<div class="mgmt-item">
      <span style="font-family:var(--mono);width:150px">${esc(p.number)}</span>
      <span style="flex:1">${esc(p.title || '')}</span>
      <span class="empty-text" style="padding:0">${p.dueDate ? esc(fmtDateIt(p.dueDate)) : ''}</span>
      <button class="btn-ghost" onclick="apriPianoDaCommessa('${p.id}')">Apri →</button></div>`;
  const rigaDoc = (d, tipo) => `<div class="mgmt-item">
      <span style="font-family:var(--mono);width:150px">${esc(d.number)}</span>
      <span class="doc-badge">${esc((tipo === 'rfq' ? RFQ_STATUS : ORDER_STATUS)[d.status] || d.status)}</span>
      <span style="flex:1">${esc(supplierName(d.supplierId) || '—')}</span>
      <button class="btn-ghost" onclick="${{ rfq: `apriRfqDaCommessa('${d.id}')`, order: `apriOrdineDaCommessa('${d.id}')`, odl: `apriOdlDaCommessa('${d.id}')` }[tipo]}">Apri →</button></div>`;
  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      <div class="bom-toolbar-left">
        ${worklistCloseBtn('jobBackToList()', 'la commessa')}
        <h2 class="section-title" style="margin:0">${ico('clipboard', 'tinted pill', 'Commessa')} ${esc(j.number)}</h2>
      </div>
      <div class="bom-toolbar-right">
        ${menuAltro([{ label: 'Elimina la commessa', icon: 'trash', onclick: `delJob('${id}')`, danger: true }])}
      </div>
    </div>
    ${docStepperHtml('job', j)}
    <div class="modal-grid">
      <div class="modal-field"><label>Cliente</label>
        <input list="job-customer-opts" value="${esc(j.customer || '')}" onchange="jobSetField('${id}','customer',this.value)">
        ${customerDatalist('job-customer-opts')}</div>
      <div class="modal-field"><label>Descrizione</label>
        <input value="${esc(j.title || '')}" onchange="jobSetField('${id}','title',this.value)"></div>
      <div class="modal-field"><label>Riferimento cliente</label>
        <input value="${esc(j.customerRef || '')}" placeholder="ordine cliente, offerta…" onchange="jobSetField('${id}','customerRef',this.value)"></div>
      <div class="modal-field"><label>Stato</label>
        <select onchange="jobSetField('${id}','status',this.value)">
          ${Object.keys(JOB_STATUS).map(k => `<option value="${k}" ${j.status === k ? 'selected' : ''}>${esc(JOB_STATUS[k])}</option>`).join('')}
        </select></div>
      <div class="modal-field"><label>Data apertura</label>
        <input type="date" value="${esc(j.date || '')}" onchange="jobSetField('${id}','date',this.value)"></div>
      <div class="modal-field"><label>Consegna al cliente</label>
        <input type="date" value="${esc(j.dueDate || '')}" onchange="jobSetField('${id}','dueDate',this.value)"></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Note</label>
        <input value="${esc(j.notes || '')}" onchange="jobSetField('${id}','notes',this.value)"></div>
    </div>
    ${jobLate(j) ? `<div class="empty-text" style="text-align:left;color:var(--red)">${ico('warning', 'tinted', '')} La consegna al cliente era il ${esc(fmtDateIt(j.dueDate))} e la commessa è ancora ${esc((JOB_STATUS[j.status] || '').toLowerCase())}.</div>` : ''}
    ${stampLine(j)}

    <div class="cost-summary">
      ${kpi('Ordinato', fmtN(t.ordinato), 'accent')}
      ${kpi('Già ricevuto', fmtN(t.ricevuto), 'green')}
      ${kpi('Ancora atteso', fmtN(t.ordinato - t.ricevuto), t.ordinato - t.ricevuto > 0 ? 'orange' : '')}
      ${kpi('Piani di fabbisogno', String(piani.length), 'purple')}
      ${jobCoverageKpi(cov)}
    </div>

    ${elenco(ico('package', 'tinted', '') + ' Copertura materiale', jobCoverageHtml(cov),
      'Nessun piano di fabbisogno aperto: la copertura del materiale non è calcolabile.')}
    ${elenco(ico('list', 'tinted', '') + ' Fabbisogni', piani.map(rigaPiano).join(''), 'Nessun piano collegato. Si aggancia dalla testata di un piano, nel campo Commessa.')}
    ${elenco(ico('mail', 'tinted', '') + ' Richieste di offerta', rfqs.map(d => rigaDoc(d, 'rfq')).join(''), 'Nessuna richiesta.')}
    ${elenco(ico('receipt', 'tinted', '') + ' Ordini a fornitore', orders.map(d => rigaDoc(d, 'order')).join(''), 'Nessun ordine.')}
    ${elenco(ico('wrench', 'tinted', '') + ' Ordini di lavoro', workOrders.map(d => rigaDoc(d, 'odl')).join(''), 'Nessuna lavorazione affidata a terzi per questa commessa.')}
    </div>`;
}

// ─── Navigazione fra le viste ───
// Aprire il piano o il documento citato dalla commessa: la catena si percorre
// nei due versi, non solo a scendere.
function apriPianoDaCommessa(planId) { currentPlanId = planId; mrpView = 'edit'; setView('mrp'); }
function apriRfqDaCommessa(id) { docLeave('rfq'); currentRfqId = id; rfqView = 'edit'; setView('rfq'); }
function apriOrdineDaCommessa(id) { docLeave('order'); currentOrderId = id; orderView = 'edit'; setView('orders'); }
function apriOdlDaCommessa(id) { docLeave('odl'); currentOdlId = id; odlView = 'edit'; setView('odl'); }

// ─── Mutatori ───
function newJob() {
  if (!roleGuard('docs')) return;
  return conNumeri({ COM: 1 }, () => {
    const j = Store.insert('jobs', { id: gid(), number: nextJobNumber(), customer: '', title: '',
      customerRef: '', status: 'aperta', date: oggiISO(), dueDate: '', notes: '', active: true });
    currentJobId = j.id; jobView = 'edit'; renderJobs();
  });
}
function openJobEdit(id) { currentJobId = id; jobView = 'edit'; renderJobs(); }
function jobBackToList() { jobView = 'list'; currentJobId = null; renderJobs(); }
function jobSetField(id, field, value) {
  if (!roleGuard('docs')) { renderJobs(); return; }
  const j = getJob(id); if (!j) return;
  // La domanda sul materiale si fa SOLO entrando in produzione, e solo se non ci
  // si è già: mettere in produzione è il momento in cui il lavoro parte davvero
  // e il lead time smette di essere recuperabile. Un avviso che tornasse a ogni
  // ritocco di una nota si imparerebbe a chiudere senza leggerlo, e quel giorno
  // non avviserebbe più di niente.
  if (field !== 'status' || value !== 'produzione' || j.status === 'produzione') {
    jobApplyField(id, field, value);
    return;
  }
  const cov = jobCoverage(id);
  if (cov.stato === 'ok') { jobApplyField(id, field, value); return; }
  askConfirm(jobCoverageDomanda(j, cov), () => jobApplyField(id, field, value), {
    title: 'Mettere in produzione?',
    ok: 'Metti in produzione lo stesso',
    cancel: 'Non ancora',
    // Non è un'azione distruttiva: l'app avvisa e lascia decidere, il pulsante
    // non deve essere rosso. Chi ha un'urgenza vera deve poter andare avanti
    // senza barare sui dati — dati falsi, poi, restano.
    safe: true,
  });
  // Il <select> mostra già «In produzione» mentre il dato dice ancora «Aperta»:
  // si ridisegna, così se si annulla la tendina torna al vero. La scheda di
  // conferma vive in #modal-root e non viene toccata da questo disegno.
  renderJobs();
}
// La scrittura vera e propria, separata dalla guardia qui sopra: è anche ciò che
// esegue la conferma quando arriva il sì.
function jobApplyField(id, field, value) {
  const j = getJob(id); if (!j) return;
  j[field] = campoTesto(value);
  touch(j); saveDB();
  // Lo stato e le date cambiano l'intestazione, l'avviso di ritardo e la
  // copertura: si ridisegna. Gli altri campi no, per non far saltare il cursore.
  if (field === 'status' || field === 'dueDate') renderJobs();
}
function delJob(id) {
  if (!roleGuard('docs')) return;
  const j = getJob(id); if (!j) return;
  if (!guardiaDocumentoUltimo(j, jobList(), 'Annullala invece di eliminarla.')) return;
  const piani = jobPlans(id);
  const { rfqs, orders, workOrders } = jobDocs(id);
  // Non si cancella una commessa che regge del lavoro: si lascerebbero piani e
  // documenti che citano un numero inesistente.
  if (piani.length || rfqs.length || orders.length || workOrders.length) {
    const usi = [];
    if (piani.length) usi.push(piani.length + (piani.length === 1 ? ' piano' : ' piani'));
    if (rfqs.length) usi.push(rfqs.length + (rfqs.length === 1 ? ' richiesta' : ' richieste'));
    if (orders.length) usi.push(orders.length + (orders.length === 1 ? ' ordine' : ' ordini'));
    if (workOrders.length) usi.push(workOrders.length + (workOrders.length === 1 ? ' ordine di lavoro' : ' ordini di lavoro'));
    showToast('Commessa collegata a ' + usi.join(', ') + ': scollegali prima, oppure chiudila.', 'error');
    return;
  }
  askConfirm(`Eliminare la commessa ${j.number}?`, () => eliminaSeAncoraUltimo(() => {
    const x = getJob(id);
    return !!x && guardiaDocumentoUltimo(x, jobList(), 'Annullala invece di eliminarla.');
  }, () => {
    if (currentJobId === id) { currentJobId = null; jobView = 'list'; }
    removeConUndo('jobs', id, `Commessa ${j.number} eliminata`, renderJobs);
  }));
}
