// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-home.js
// ═══════════════════════════════════════════════════════════
// Riepilogo: cosa richiede attenzione, adesso.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
//
// ── Perché ──
// Si atterrava sulla distinta base, cioè su uno strumento: l'app diceva «ecco
// gli attrezzi», non «ecco cosa c'è da fare». Eppure i segnali li aveva già
// tutti — ordini confermati in ritardo, materiale da ordinare entro pochi
// giorni, articoli senza prezzo, quotazioni migliori a listino — sparsi in
// cinque viste diverse, ognuno visibile solo a chi andava a cercarlo.
//
// Qui non si calcola niente di nuovo: si mette in fila quello che le altre
// viste già sanno, e ogni riga porta dove si risolve. Un riepilogo che chiede
// di essere letto e basta non serve a nessuno.

// Ogni voce: { n, testo, vista, gravita, voci }. `n === 0` non si mostra — un
// elenco pieno di zeri rassicuranti nasconde le due righe che contano.
//
// `voci` è **chi** ha fatto scattare l'avviso: i codici, i numeri di documento.
// Senza, «7 articoli sotto la scorta minima» costringe ad aprire il magazzino e
// rifare a mano il filtro per sapere quali — cioè a rifare il lavoro che
// l'avviso ha già fatto. Ogni voce porta dove si risolve: la commessa alla
// commessa, la riga di fabbisogno al piano che la genera, l'articolo alla sua
// scheda. Le voci senza un posto dove andare (i codici duplicati, che si
// sbrogliano in Gestione) restano testo.
function homeSegnali() {
  const out = [];
  const agg = (voci, uno, molti, vista, gravita) => {
    if (!voci.length) return;
    out.push({ n: voci.length, testo: voci.length === 1 ? uno : molti, vista, gravita: gravita || 'info', voci });
  };
  const voce = (testo, titolo, azione) => ({ testo: testo || '(senza codice)', titolo: titolo || '', azione: azione || '' });

  // Commesse consegnate in ritardo, la più vecchia per prima.
  const commesseTardi = (db.jobs || []).filter(jobLate)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  agg(commesseTardi.map(j => voce(j.number,
    [j.customer, j.title].filter(Boolean).join(' · ') + ' — consegna ' + fmtDateIt(j.dueDate),
    `homeApri('job','${j.id}')`)),
  'commessa oltre la data di consegna', 'commesse oltre la data di consegna', 'jobs', 'alta');

  // Commesse già avviate a cui manca del materiale da ordinare. La conferma che
  // compare mettendo in produzione la vede una persona sola, una volta: se dopo
  // l'avvio un ordine slitta o un piano cresce, quella commessa resta scoperta e
  // nessuno lo scopre più. Questo è l'unico posto che rilegge il presente.
  //
  // Gravità alta come la consegna sforata, e per la stessa ragione: il lavoro è
  // partito e la data al cliente è già stata data. Solo 'manca' — i tardivi si
  // vedono già come «ordini confermati oltre la data richiesta», e le commesse
  // senza piani ('ignoto') non si segnalano: lavorare fuori dal fabbisogno è una
  // scelta legittima, e trasformarla in un avviso perpetuo renderebbe questo
  // elenco inutile proprio a chi lavora così.
  const scoperte = (db.jobs || []).filter(j => j.status === 'produzione')
    .map(j => ({ j, cov: jobCoverage(j.id) }))
    .filter(x => x.cov.stato === 'manca')
    .sort((a, b) => String(a.j.dueDate || '9999').localeCompare(String(b.j.dueDate || '9999')));
  agg(scoperte.map(x => voce(x.j.number,
    [x.j.customer, x.j.title].filter(Boolean).join(' · ')
      + ` — ${x.cov.daOrdinare.length} da ordinare: ${x.cov.daOrdinare.slice(0, 3).map(r => r.code).join(', ')}`
      + (x.j.dueDate ? `, consegna ${fmtDateIt(x.j.dueDate)}` : ''),
    `homeApri('job','${x.j.id}')`)),
  'commessa in produzione con materiale da ordinare', 'commesse in produzione con materiale da ordinare', 'jobs', 'alta');

  // Fabbisogno: righe da ordinare subito o già oltre. Sempre al netto di
  // giacenza e impegni — è il numero azionabile («cosa manca davvero da
  // ordinare») e non dipende dal toggle lordo/netto della vista Fabbisogno:
  // due utenti sulla stessa base dati leggono lo stesso conteggio.
  //
  // Le righe si ricavano da commitIndex(), che ha già esploso tutti i piani
  // aperti una volta (i chiusi non sono più lavoro da fare): riesploderli qui
  // con mrpBuyRows raddoppiava il costo della schermata di atterraggio.
  const ritardo = [], urgente = [];
  commitIndex().forEach((commits, itemId) => {
    const it = getItem(itemId); if (!it) return;
    commits.forEach(c => {
      const r = mrpBuyRow({ item: it, qty: c.lordo, due: c.due }, true, c.planId);
      if (r.qtyOrder <= 0) return;
      if (r.urgenza !== 'ritardo' && r.urgenza !== 'urgente') return;
      // La riga è di un articolo **dentro un piano**: il codice dice cosa
      // manca, il piano dice per cosa. Il click porta al piano, che è dove si
      // genera la richiesta o l'ordine.
      const v = voce(it.code, `${it.name} — piano ${c.number}${c.due ? ', serve per ' + fmtDateIt(c.due) : ''}`
        + `${r.orderBy ? ', da ordinare entro ' + fmtDateIt(r.orderBy) : ''} · ${fmtQty(r.qtyOrder)} ${itemUom(it)}`,
      `homeApri('plan','${c.planId}')`);
      v.ordine = r.orderBy || '';
      (r.urgenza === 'ritardo' ? ritardo : urgente).push(v);
    });
  });
  const perData = (a, b) => String(a.ordine).localeCompare(String(b.ordine));
  agg(ritardo.sort(perData), 'riga di fabbisogno da ordinare, già oltre la data',
    'righe di fabbisogno da ordinare, già oltre la data', 'mrp', 'alta');
  agg(urgente.sort(perData), 'riga di fabbisogno da ordinare entro pochi giorni',
    'righe di fabbisogno da ordinare entro pochi giorni', 'mrp', 'media');

  // Ordini confermati più tardi di quanto chiesto — d'acquisto e di lavoro
  // insieme: la domanda è una sola — cosa
  // arriva tardi — e separarli in due avvisi avrebbe costretto a leggerne due
  // per farsi la stessa idea. Il tipo si vede dal numero (ODA/ODL) e il click
  // porta ciascuno nel suo elenco.
  const tardi = d => d.status !== 'annullato' && d.status !== 'evaso' && orderWorstDelay(d) != null;
  const ordTardi = [].concat((db.orders || []).filter(tardi).map(o => ({ o, tipo: 'order' })),
    (db.workOrders || []).filter(tardi).map(o => ({ o, tipo: 'odl' })))
    .sort((a, b) => orderWorstDelay(b.o) - orderWorstDelay(a.o));
  agg(ordTardi.map(({ o, tipo }) => {
    const g = orderWorstDelay(o);
    const chi = supplierName(o.supplierId) || (tipo === 'odl' ? 'senza terzista' : 'senza fornitore');
    return voce(o.number, `${chi} — confermato con ${g} ${g === 1 ? 'giorno' : 'giorni'} di ritardo`,
      `homeApri('${tipo}','${o.id}')`);
  }), 'ordine confermato oltre la data richiesta', 'ordini confermati oltre la data richiesta', 'orders', 'media');

  // Richieste partite e mai richiuse
  const rfqAperte = (db.rfqs || []).filter(r => r.status === 'inviata')
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  agg(rfqAperte.map(r => voce(r.number,
    `${supplierName(r.supplierId) || 'senza fornitore'}${r.date ? ' — inviata il ' + fmtDateIt(r.date) : ''}`,
    `homeApri('rfq','${r.id}')`)),
  'richiesta inviata in attesa di risposta', 'richieste inviate in attesa di risposta', 'rfq', 'info');

  // Articoli sotto la scorta minima. Portano al Magazzino, non all'anagrafica:
  // è la vista dove quel numero si vede e da dove si rettifica.
  const sottoScorta = (db.items || []).filter(it => hasStock(it) && safetyStockOf(it) > 0 && onHandOf(it.id) < safetyStockOf(it));
  agg(sottoScorta.map(it => voce(it.code,
    `${it.name} — esistente ${fmtQty(onHandOf(it.id))} ${itemUom(it)}, scorta minima ${fmtQty(safetyStockOf(it))}`,
    `itemInfoModal('${it.id}')`)),
  'articolo sotto la scorta minima', 'articoli sotto la scorta minima', 'stock', 'media');

  // Articoli che si comprano e non hanno un prezzo: in un ordine varrebbero zero
  const senzaPrezzo = (db.items || []).filter(it => hasPriceList(it) && costField(it) && !(Number(it[costField(it)]) > 0));
  agg(senzaPrezzo.map(it => voce(it.code, `${it.name} — ${typeLabel(it.type)}`, `itemInfoModal('${it.id}')`)),
    'articolo d\'acquisto senza prezzo', 'articoli d\'acquisto senza prezzo', 'buy', 'media');

  // Fasi a costo orario rimaste senza ore. Fino alla 0.64.2 una normalizzazione
  // cancellava le ore di ogni fase oraria a ogni caricamento; il recupero le
  // ricostruisce dividendo il costo per la tariffa del centro, ma dove il centro
  // manca o ha tariffa zero non c'è niente da cui ricostruirle. Quelle fasi
  // valgono zero, e vanno **nominate**: sono un costo sparito, e un costo sparito
  // non si scopre guardando il totale, che resta un numero plausibile.
  const senzaOre = [];
  (db.items || []).forEach(it => {
    // La fase si numera fra le sole lavorazioni, non nell'array intero: è il
    // numero che l'utente legge nella vista Cicli, e nominarne un altro
    // manderebbe a cercare la riga sbagliata.
    let k = 0;
    (it.cycle || []).forEach(r => {
      if (r.kind !== 'op') return;
      const n = cyclePhaseNumber(k++);
      if (r.costMode !== 'orario' || Number(r.hours) > 0) return;
      const wc = getWorkCenter(r.workCenterId);
      senzaOre.push(voce(it.code, `${it.name} — fase ${n} su ${wc ? wc.name : '(centro mancante)'}: ore a zero, la lavorazione non costa nulla`,
        `homeApri('cycle','${it.id}')`));
    });
  });
  agg(senzaOre, 'fase a costo orario senza ore', 'fasi a costo orario senza ore', 'cycles', 'media');

  // Codici duplicati: il controllo dati della Gestione, portato in evidenza.
  // Qui la voce è il codice ripetuto, non un articolo: aprirne uno dei due non
  // direbbe quale dei due è quello sbagliato. Si sbroglia in Gestione.
  const dup = duplicateCodeGroups();
  agg(dup.map(g => voce(g.code, `${g.items.length} articoli con questo codice: ${g.items.map(i => i.name || '(senza nome)').join(', ')}`, '')),
    'codice articolo duplicato', 'codici articolo duplicati', isAdmin() ? 'manage' : 'buy', 'media');

  // La sicurezza dell'archivio: l'unica copia sta in questo browser. Solo per
  // chi può esportare — a un lettore direbbe di fare una cosa che non può fare.
  // Qui il numero non conta voci ma giorni (o percentuale): `apri` porta dritto
  // alla scheda Backup invece che all'ultima scheda aperta della Gestione.
  if (isAdmin()) {
    const b = statoBackup();
    if (b.giorni >= BACKUP_AVVISO_GG) out.push({ n: b.giorni,
      testo: b.mai ? 'giorni senza un backup: non ne è mai stato esportato uno da questo browser' : 'giorni dall\'ultimo backup',
      vista: 'manage', apri: "homeApri('backup')", gravita: b.giorni >= BACKUP_ALLARME_GG ? 'alta' : 'media',
      voci: [voce('Esporta ora', 'Scarica il backup JSON dell\'intero archivio', 'exportBackup();renderHome()')] });
    // Il backup automatico fermo: senza questo avviso lo si scoprirebbe solo
    // fra sette giorni, dal promemoria qui sopra. «Riprendi» è il clic che il
    // browser vuole per ridare il permesso sulla cartella.
    const ba = backupAutoAttivo() ? backupAutoEsito() : { stato: null };
    if (ba.stato === 'pausa' || ba.stato === 'errore') out.push({ n: 1,
      testo: ba.stato === 'pausa' ? 'backup automatico in pausa: il browser chiede di riconfermare la cartella' : 'backup automatico non riuscito',
      vista: 'manage', apri: "homeApri('backup')", gravita: 'media',
      voci: [voce('Riprendi', ba.stato === 'pausa' ? 'Riconferma il permesso e salva il backup di oggi nella cartella ' + backupAutoNome() : 'Riprova a salvare nella cartella ' + backupAutoNome() + (ba.errore ? ' (' + ba.errore + ')' : ''), 'backupAutoOra()')] });
    const pct = dbSpazioPct();
    if (pct >= 70) out.push({ n: pct, testo: '% dello spazio del browser occupato dall\'archivio',
      vista: 'manage', apri: "homeApri('backup')", gravita: pct >= 90 ? 'alta' : 'media',
      voci: [voce(fmtMB(dbSpazio().usatoMB) + ' su ' + fmtMB(dbSpazio().limiteMB), 'Oltre il limite i salvataggi falliscono: esporta un backup e alleggerisci l\'archivio', '')] });
  }

  return out;
}
// Aprire ciò che l'avviso nomina. Stessa strada della ricerca globale: prima la
// vista, poi il documento — l'ordine inverso disegnerebbe la vista giusta e poi
// la rimpiazzerebbe con quella di partenza.
function homeApri(tipo, id) {
  if (tipo === 'job') { setView('jobs'); openJobEdit(id); }
  else if (tipo === 'plan') { setView('mrp'); openPlanEdit(id); }
  else if (tipo === 'rfq') { setView('rfq'); openRfqEdit(id); }
  else if (tipo === 'order') { setView('orders'); openOrderEdit(id); }
  else if (tipo === 'odl') { setView('odl'); openOdlEdit(id); }
  else if (tipo === 'odp') { setView('odp'); openOdpEdit(id); }
  else if (tipo === 'cycle') { setView('cycles'); openCycleFor(id); }
  else if (tipo === 'backup') { setView('manage'); setMgmtTab('backup'); }
}
// Quante voci si scrivono per esteso. Oltre, l'elenco smetterebbe di essere un
// dettaglio e diventerebbe la vista che si apre cliccando la riga.
const HOME_VOCI_MAX = 8;
function homeVociHtml(s) {
  const mostrate = s.voci.slice(0, HOME_VOCI_MAX);
  const resto = s.voci.length - mostrate.length;
  const chip = v => v.azione
    ? `<button class="home-chip" onclick="${v.azione}" title="${esc(v.titolo)}">${esc(v.testo)}</button>`
    : `<span class="home-chip muta" title="${esc(v.titolo)}">${esc(v.testo)}</span>`;
  return `<div class="home-voci">${mostrate.map(chip).join('')}${resto > 0
    ? `<span class="home-voci-resto">+${resto} ${resto === 1 ? 'altro' : 'altri'} in ${esc(viewLabel(s.vista))}</span>` : ''}</div>`;
}

// Quanto si risparmierebbe scegliendo ovunque la quotazione più bassa già a
// listino. Non si applica niente da solo — è un'informazione, come nel
// fabbisogno.
function homeRisparmio() {
  let tot = 0, quanti = 0;
  (db.items || []).forEach(it => {
    if (!hasPriceList(it)) return;
    const campo = costField(it); if (!campo) return;
    const inUso = Number(it[campo]) || 0;
    const best = bestPriceRow(it);
    const migliore = best ? (rowUnitCost(it, best) || 0) : 0;
    if (inUso > 0 && migliore > 0 && migliore < inUso) { tot += inUso - migliore; quanti++; }
  });
  return { tot, quanti };
}

// ─── Calendario ───
// I segnali sopra dicono *quanto*; il calendario dice *quando*. Le date c'erano
// già tutte — consegna della commessa, data entro cui ordinare, consegna
// confermata dal fornitore — ma ognuna nella sua vista: nessuno le vedeva in
// fila, e due scadenze sullo stesso martedì si scoprivano il martedì.
//
// Anche qui non si calcola niente di nuovo: le righe di fabbisogno sono le
// stesse di homeSegnali() (al netto, da commitIndex()), i ritardi d'ordine sono
// quelli di ordLineDelay(). L'unico dato nuovo sono i promemoria, per le
// scadenze che non stanno in nessun documento.

const CAL_GRAV_ORD = { alta: 0, media: 1, info: 2 };
// Scaduto → alta, entro la finestra d'avviso del fabbisogno → media. Una sola
// soglia per tutta l'app: «tra pochi giorni» non deve voler dire sette giorni
// nel fabbisogno e dieci nel calendario.
function calGravitaData(data, oggi) {
  if (data < oggi) return 'alta';
  return data <= addDays(oggi, URGENCY_WARN_DAYS) ? 'media' : 'info';
}
function calPeggiore(a, b) { return CAL_GRAV_ORD[a] <= CAL_GRAV_ORD[b] ? a : b; }

// Tutte le scadenze aperte: [{ data, icona, testo, dettaglio, gravita, azione, etichetta, tipo }].
// Più righe della stessa fonte nello stesso giorno diventano **una** voce: un
// piano da quaranta articoli riempirebbe la cella e coprirebbe il resto.
function homeEventi() {
  const oggi = oggiISO();
  const out = [];
  const gruppi = new Map();
  const raggruppa = (chiave, base, gravita) => {
    let g = gruppi.get(chiave);
    if (!g) { g = Object.assign({ n: 0, gravita }, base); gruppi.set(chiave, g); out.push(g); }
    g.n++;
    g.gravita = calPeggiore(g.gravita, gravita);
    return g;
  };

  // Commesse: la data a monte di tutto
  (db.jobs || []).forEach(j => {
    if (!j.dueDate || j.status === 'chiusa' || j.status === 'annullata' || j.active === false) return;
    out.push({ tipo: 'commessa', data: j.dueDate, icona: 'clipboard',
      testo: `Consegna commessa ${j.number || ''}`.trim(),
      dettaglio: [j.customer, j.title].filter(Boolean).join(' — '),
      gravita: jobLate(j) ? 'alta' : calGravitaData(j.dueDate, oggi),
      azione: `homeApri('job','${j.id}')` });
  });

  // Fabbisogno: entro quando ordinare, piano per piano
  const piani = new Map((db.plans || []).map(p => [p.id, p]));
  commitIndex().forEach((commits, itemId) => {
    const it = getItem(itemId); if (!it) return;
    commits.forEach(c => {
      const r = mrpBuyRow({ item: it, qty: c.lordo, due: c.due }, true, c.planId);
      if (r.qtyOrder <= 0 || !r.orderBy) return;
      const grav = r.urgenza === 'ritardo' ? 'alta' : (r.urgenza === 'urgente' ? 'media' : 'info');
      const g = raggruppa('mrp|' + c.planId + '|' + r.orderBy, { tipo: 'fabbisogno', data: r.orderBy, icona: 'cart',
        numero: c.number || '', azione: `homeApri('plan','${c.planId}')` }, grav);
      g.testo = g.n === 1 ? `Ordinare ${it.code || it.name || 'un articolo'}` : `Ordinare ${g.n} articoli`;
      g.dettaglio = [g.numero, (piani.get(c.planId) || {}).title].filter(Boolean).join(' — ');
    });
  });

  // Programma dei piani (0.89.0): quando mandare al terzista e quando lanciare
  // in produzione. Le stesse voci dell'agenda del piano, solo quelle ancora da
  // emettere: i rientri attesi stanno già qui sotto, con gli ordini di lavoro.
  (db.plans || []).forEach(p => {
    if (p.active === false || typeof planAgenda !== 'function') return;
    planAgenda(p).forEach(e => {
      if ((e.tipo !== 'invia' && e.tipo !== 'lancio') || e.stato === 'fatto') return;
      const grav = e.stato === 'ritardo' ? 'alta' : calGravitaData(e.data, oggi);
      const g = raggruppa('prog|' + e.tipo + '|' + p.id + '|' + e.data, { tipo: 'programma', data: e.data,
        icona: e.tipo === 'invia' ? 'truck' : 'factory', numero: p.number || '', azione: `homeApri('plan','${p.id}')` }, grav);
      const cosa = e.tipo === 'invia' ? 'Inviare al terzista' : 'Lanciare in produzione';
      g.testo = g.n === 1 ? `${cosa} ${e.codice || e.nome || ''}`.trim() : `${cosa} ${g.n} parti`;
      g.dettaglio = [g.numero, e.tipo === 'invia' ? e.dove : p.title].filter(Boolean).join(' — ');
    });
  });

  // Piani: quando deve essere pronto
  (db.plans || []).forEach(p => {
    if (p.active === false || !p.dueDate) return;
    out.push({ tipo: 'piano', data: p.dueDate, icona: 'list',
      testo: `Piano ${p.number || ''} da completare`.replace(/\s+/g, ' '),
      dettaglio: p.title || '', gravita: p.dueDate < oggi ? 'media' : 'info',
      azione: `homeApri('plan','${p.id}')` });
  });

  // Ordini d'acquisto e di lavoro: le consegne ancora da ricevere, alla data
  // confermata se c'è. Insieme, come nei segnali: la domanda è una — cosa arriva.
  // Quali righe aspettano ancora merce lo dice righeDaRicevere() (views-dash.js),
  // la stessa regola delle consegne scadute del cruscotto.
  righeDaRicevere().forEach(({ o, tipo, l, data }) => {
    const forn = (db.suppliers || []).find(s => s.id === o.supplierId);
    let grav = data < oggi ? 'alta' : calGravitaData(data, oggi);
    if (grav === 'info' && (ordLineDelay(l) || 0) > 0) grav = 'media';
    const g = raggruppa(tipo + '|' + o.id + '|' + data, { tipo: 'ordine', data, icona: tipo === 'odl' ? 'wrench' : 'truck',
      azione: `homeApri('${tipo}','${o.id}')`,
      dettaglio: [forn && forn.name, o.title].filter(Boolean).join(' — ') }, grav);
    g.testo = `${tipo === 'odl' ? 'Rientro ODL' : 'Consegna ordine'} ${o.number || ''}`.trim() + (g.n > 1 ? ` (${g.n} righe)` : '');
    if ((ordLineDelay(l) || 0) > 0) g.ritardo = true;
  });

  // Ordini di produzione lanciati o in corso: quando il prodotto deve essere finito
  (db.prodOrders || []).forEach(o => {
    if (o.active === false || !o.dueDate || !ODP_APERTI.includes(o.status)) return;
    const due = String(o.dueDate).slice(0, 10);
    const it = getItem(o.itemId);
    out.push({ tipo: 'produzione', data: due, icona: 'factory',
      testo: `Fine produzione ${o.number || ''}`.trim(),
      dettaglio: [it && (it.code || it.name), o.title].filter(Boolean).join(' — '),
      gravita: calGravitaData(due, oggi), azione: `homeApri('odp','${o.id}')` });
  });

  // Fasi programmate degli ordini di produzione lanciati o in corso (0.98.0):
  // il giorno in cui ciascuna fase deve partire, finché non è avviata. Le fasi
  // di una tratta dal terzista partono insieme, e lo stesso giorno di uno
  // stesso ordine è una voce sola. Una data passata senza avvio è scaduta.
  (db.prodOrders || []).forEach(o => {
    if (o.active === false || !ODP_APERTI.includes(o.status)) return;
    const it = getItem(o.itemId);
    const perGiorno = new Map();
    (o.phases || []).forEach(f => {
      const d = String(f.plannedStart || '').slice(0, 10);
      if (!d || opAvviata(o, f) || opChiusa(o, f)) return;
      if (!perGiorno.has(d)) perGiorno.set(d, []);
      perGiorno.get(d).push(f);
    });
    perGiorno.forEach((fasi, d) => {
      const nos = fasi.map(f => f.seq);
      const dove = Array.from(new Set(fasi.map(f => f.supplierId ? (f.supplierName || supplierName(f.supplierId) || 'terzista') : (f.wcName || '')))).filter(Boolean).join(', ');
      out.push({ tipo: 'fase', data: d, icona: fasi.some(f => f.supplierId) ? 'truck' : 'factory',
        testo: `Avviare ${nos.length === 1 ? 'fase ' + nos[0] : 'fasi ' + nos.join(', ')} di ${o.number || 'ODP'}`,
        dettaglio: [it && (it.code || it.name), dove].filter(Boolean).join(' — '),
        gravita: calGravitaData(d, oggi), azione: `homeApri('odp','${o.id}')` });
    });
  });

  // Richieste inviate: la consegna chiesta, per sapere quando sollecitare
  (db.rfqs || []).forEach(q => {
    if (q.active === false || q.status !== 'inviata') return;
    (q.lines || []).forEach(l => {
      if (!l.deliveryDate) return;
      const g = raggruppa('rfq|' + q.id + '|' + l.deliveryDate, { tipo: 'richiesta', data: l.deliveryDate, icona: 'mail',
        azione: `homeApri('rfq','${q.id}')`, dettaglio: q.title || '' }, 'info');
      g.testo = `Consegna chiesta in ${q.number || 'richiesta'}, senza risposta`;
    });
  });

  // Promemoria scritti a mano
  (db.reminders || []).forEach(r => {
    if (r.active === false || r.done || !r.date) return;
    const job = r.jobId ? (db.jobs || []).find(j => j.id === r.jobId) : null;
    out.push({ tipo: 'promemoria', data: r.date, icona: 'pin', id: r.id,
      testo: r.title || 'Promemoria',
      dettaglio: [job && job.number, r.notes].filter(Boolean).join(' — '),
      gravita: r.date < oggi ? 'alta' : (CAL_GRAV_ORD[r.gravita] != null ? r.gravita : 'info'),
      azione: `reminderModal('${r.id}')` });
  });

  out.forEach(e => { delete e.numero; delete e.n; });
  return out.sort((a, b) => a.data.localeCompare(b.data) || CAL_GRAV_ORD[a.gravita] - CAL_GRAV_ORD[b.gravita]);
}

// ─── Filtri per tipo ───
// Con fabbisogno, programma, consegne, fasi e promemoria nello stesso mese la
// griglia si riempie: i filtri lasciano guardare una cosa alla volta. Valgono
// per tutto il calendario (scadute, griglia, giorno, prossimi 14 giorni) e
// solo per chi guarda: si ricordano in questo browser, non nel database.
const CAL_FILTRI = [
  { id: 'commesse', label: 'Commesse', tipi: ['commessa'] },
  { id: 'piani', label: 'Piani e programma', tipi: ['piano', 'programma'] },
  { id: 'ordinare', label: 'Da ordinare', tipi: ['fabbisogno'] },
  { id: 'consegne', label: 'Consegne e rientri', tipi: ['ordine'] },
  { id: 'richieste', label: 'Richieste', tipi: ['richiesta'] },
  { id: 'fasi', label: 'Avvio fasi ODP', tipi: ['fase'] },
  { id: 'produzione', label: 'Fine produzione', tipi: ['produzione'] },
  { id: 'promemoria', label: 'Promemoria', tipi: ['promemoria'] },
];
const CAL_FILTRI_KEY = 'bomtrack_cal_nascosti';
let homeCalNascosti = null;   // Set degli id di CAL_FILTRI spenti; null = da leggere
function calNascosti() {
  if (homeCalNascosti) return homeCalNascosti;
  homeCalNascosti = new Set();
  try {
    const v = JSON.parse(localStorage.getItem(CAL_FILTRI_KEY) || '[]');
    if (Array.isArray(v)) v.forEach(id => { if (CAL_FILTRI.some(f => f.id === id)) homeCalNascosti.add(id); });
  } catch (e) { /* preferenza illeggibile: si vede tutto */ }
  return homeCalNascosti;
}
function calFiltroSalva() {
  try { localStorage.setItem(CAL_FILTRI_KEY, JSON.stringify(Array.from(calNascosti()))); } catch (e) { /* niente da rompere */ }
}
function calFiltroDi(tipo) { return CAL_FILTRI.find(f => f.tipi.includes(tipo)) || null; }
function calVisibile(e) { const f = calFiltroDi(e.tipo); return !f || !calNascosti().has(f.id); }
function homeCalFiltro(id) {
  const n = calNascosti();
  if (n.has(id)) n.delete(id); else n.add(id);
  calFiltroSalva(); homeCalRidisegna();
}
function homeCalTutti() { calNascosti().clear(); calFiltroSalva(); homeCalRidisegna(); }
function calFiltriHtml(eventi) {
  const n = calNascosti();
  const conta = new Map();
  eventi.forEach(e => { const f = calFiltroDi(e.tipo); if (f) conta.set(f.id, (conta.get(f.id) || 0) + 1); });
  const chips = CAL_FILTRI.map(f => {
    const on = !n.has(f.id);
    return `<button type="button" class="cal-filtro${on ? ' on' : ''}" aria-pressed="${on}" onclick="homeCalFiltro('${f.id}')" title="${on ? 'Nascondi' : 'Mostra'} ${esc(f.label.toLowerCase())}">${esc(f.label)} <span class="cal-filtro-n">${conta.get(f.id) || 0}</span></button>`;
  }).join('');
  return `<div class="cal-filtri" role="group" aria-label="Tipi di scadenza mostrati">${chips}
    ${n.size ? `<button type="button" class="btn-ghost cal-filtro-tutti" onclick="homeCalTutti()">Mostra tutto</button>` : ''}</div>`;
}

// Stato della vista: mese mostrato e giorno scelto. Comodità di navigazione,
// come jobView o mrpView — non finisce nel database.
let homeCalMese = '';     // 'YYYY-MM'
let homeCalGiorno = '';   // 'YYYY-MM-DD'
function calMeseDi(iso) { return String(iso || '').slice(0, 7); }
function calSpostaMese(mese, delta) {
  const [y, m] = mese.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
function calNomeMese(mese) {
  return new Date(mese + '-01T00:00:00Z').toLocaleDateString('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
// «Mercoledì 23 settembre»: maiuscola solo in testa, i mesi in italiano no.
function calNomeGiorno(iso) {
  const t = new Date(iso + 'T00:00:00Z').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
// Le celle della griglia: da lunedì della prima settimana a domenica
// dell'ultima. Date in UTC per la stessa ragione di addDays(): sono giorni, non
// istanti, e il fuso non deve spostarli.
function calGiorniGriglia(mese) {
  const primo = mese + '-01';
  const lun = (new Date(primo + 'T00:00:00Z').getUTCDay() + 6) % 7;
  const giorni = new Date(Date.UTC(+mese.slice(0, 4), +mese.slice(5, 7), 0)).getUTCDate();
  const celle = Math.ceil((lun + giorni) / 7) * 7;
  const inizio = addDays(primo, -lun);
  return Array.from({ length: celle }, (_, i) => addDays(inizio, i));
}
function homeCalMove(delta) { homeCalMese = calSpostaMese(homeCalMese || calMeseDi(oggiISO()), delta); homeCalRidisegna(); }
function homeCalToday() { homeCalGiorno = oggiISO(); homeCalMese = calMeseDi(homeCalGiorno); homeCalRidisegna(); }
function homeCalPick(iso) { homeCalGiorno = iso; homeCalMese = calMeseDi(iso); homeCalRidisegna(); }
// Un clic sul calendario cambia solo quale fetta delle scadenze si guarda: le
// scadenze sono quelle calcolate dall'ultimo renderHome, e ricalcolarle (con
// il fabbisogno di ogni piano aperto) a ogni giorno cliccato bloccava la
// pagina per un secondo sugli archivi grandi. Si ridisegna il riquadro, basta.
let _homeEventi = null;
function homeCalRidisegna() {
  const host = document.getElementById('home-cal');
  if (!host || !_homeEventi) { renderHome(); return; }
  host.innerHTML = renderHomeCalendar(_homeEventi);
}

const CAL_GRAV_COL = { alta: 'var(--red)', media: 'var(--orange)', info: 'var(--accent)' };
function calRiga(e, conData) {
  return `<div class="mgmt-item cal-ev" ${clickAttrs(e.azione, `${e.testo}${conData ? ' — ' + fmtDateIt(e.data) : ''}`)}>
      <span class="cal-dot" style="background:${CAL_GRAV_COL[e.gravita]}"></span>
      ${conData ? `<span class="mgmt-item-meta" style="width:78px">${esc(fmtDateIt(e.data))}</span>` : ''}
      ${ico(e.icona, 'tinted', '')}
      <span style="flex:1;min-width:140px"><strong>${esc(e.testo)}</strong>${e.ritardo ? ' <span class="mrp-warn">confermata in ritardo</span>' : ''}
        ${e.dettaglio ? `<span class="empty-text" style="padding:0;display:block;text-align:left">${esc(e.dettaglio)}</span>` : ''}</span>
    </div>`;
}
function calElenco(eventi, conData, vuoto) {
  return eventi.length ? `<div style="display:flex;flex-direction:column;gap:6px">${eventi.map(e => calRiga(e, conData)).join('')}</div>`
    : `<div class="empty-text" style="text-align:left">${esc(vuoto)}</div>`;
}

function renderHomeCalendar(tutti) {
  const oggi = oggiISO();
  const eventi = tutti.filter(calVisibile);
  const nascosti = tutti.length - eventi.length;
  if (!homeCalMese) homeCalMese = calMeseDi(oggi);
  if (!homeCalGiorno) homeCalGiorno = oggi;
  const perGiorno = new Map();
  eventi.forEach(e => { if (!perGiorno.has(e.data)) perGiorno.set(e.data, []); perGiorno.get(e.data).push(e); });

  const intest = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map(g => `<div class="cal-head">${g}</div>`).join('');
  const celle = calGiorniGriglia(homeCalMese).map(d => {
    const ev = perGiorno.get(d) || [];
    const cls = ['cal-cell', calMeseDi(d) !== homeCalMese ? 'cal-out' : '', d === oggi ? 'cal-today' : '', d === homeCalGiorno ? 'cal-sel' : ''].filter(Boolean).join(' ');
    const punti = ev.slice(0, 3).map(e => `<span class="cal-dot" style="background:${CAL_GRAV_COL[e.gravita]}"></span>`).join('');
    const etichetta = `${calNomeGiorno(d)}${ev.length ? ', ' + ev.length + (ev.length === 1 ? ' scadenza' : ' scadenze') : ''}`;
    return `<button type="button" class="${cls}" onclick="homeCalPick('${d}')" aria-label="${esc(etichetta)}"${d === homeCalGiorno ? ' aria-pressed="true"' : ''}>
        <span class="cal-num">${+d.slice(8)}</span>
        <span class="cal-dots">${punti}${ev.length > 3 ? `<span class="cal-more">+${ev.length - 3}</span>` : ''}</span></button>`;
  }).join('');

  // Lo scaduto sta fuori dalla griglia e non dipende dal mese: sfogliando
  // avanti non deve sparire proprio quello che è già in ritardo.
  const scaduti = eventi.filter(e => e.data < oggi);
  const MAX_SCADUTI = 10;
  const delGiorno = perGiorno.get(homeCalGiorno) || [];
  const prossimi = eventi.filter(e => e.data >= oggi && e.data <= addDays(oggi, 14));
  const puoi = canWrite('agenda');

  return `<div class="mrp-section">
      <div class="cycle-section-head" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <h3 style="flex:1">${ico('clock', 'tinted pill', '')} Calendario scadenze</h3>
        ${puoi ? `<button class="btn-outline" onclick="reminderModal(null, '${homeCalGiorno}')">+ Promemoria</button>` : ''}
      </div>
      ${calFiltriHtml(tutti)}
      ${nascosti ? `<div class="empty-text" style="text-align:left;padding:0 0 6px">${nascosti} ${nascosti === 1 ? 'scadenza nascosta' : 'scadenze nascoste'} dai filtri.</div>` : ''}
      ${scaduti.length ? `<div class="cal-block cal-late">
        <h4>${ico('warning', '', '')} Scadute e non risolte (${scaduti.length})</h4>
        ${calElenco(scaduti.slice(0, MAX_SCADUTI), true, '')}
        ${scaduti.length > MAX_SCADUTI ? `<div class="empty-text" style="text-align:left">…e altre ${scaduti.length - MAX_SCADUTI}: le trovi nelle viste qui sopra.</div>` : ''}
      </div>` : ''}
      <div class="cal-wide">
        <div class="cal-toolbar">
          <button class="btn-outline" onclick="homeCalMove(-1)" title="Mese precedente" aria-label="Mese precedente">‹</button>
          <strong class="cal-title">${esc(calNomeMese(homeCalMese))}</strong>
          <button class="btn-outline" onclick="homeCalMove(1)" title="Mese successivo" aria-label="Mese successivo">›</button>
          <button class="btn-outline" onclick="homeCalToday()">Oggi</button>
          <span class="cal-legend"><span class="cal-dot" style="background:var(--red)"></span>scaduto
            <span class="cal-dot" style="background:var(--orange)"></span>entro ${URGENCY_WARN_DAYS} giorni
            <span class="cal-dot" style="background:var(--accent)"></span>in programma</span>
        </div>
        <div class="cal-grid">${intest}${celle}</div>
        <div class="cal-block">
          <h4>${esc(calNomeGiorno(homeCalGiorno))}</h4>
          ${calElenco(delGiorno, false, 'Nessuna scadenza in questo giorno.')}
        </div>
      </div>
      <div class="cal-narrow cal-block">
        <h4>Prossimi 14 giorni</h4>
        ${calElenco(prossimi, true, 'Nessuna scadenza nelle prossime due settimane.')}
      </div>
    </div>`;
}

// ─── Promemoria ───
function reminderModal(id, dataProposta) {
  const r = id ? Store.getById('reminders', id) : null;
  if (id && !r) return;
  const puoi = canWrite('agenda');
  if (!r && !roleGuard('agenda')) return;
  const dis = puoi ? '' : ' disabled';
  const commesse = (db.jobs || []).filter(j => j.active !== false && ((r && r.jobId === j.id) || (j.status !== 'chiusa' && j.status !== 'annullata')));
  const grav = (r && r.gravita) || 'info';
  openModal(`<h3>${ico('pin', 'tinted pill', '')} ${r ? 'Promemoria' : 'Nuovo promemoria'}</h3>
    <div class="modal-field"><label>Cosa</label><input id="rem-title" value="${esc(r ? r.title || '' : '')}" placeholder="es. Sollecitare conferma ordine"${dis}></div>
    <div class="modal-grid">
      <div class="modal-field"><label>Data</label><input type="date" id="rem-date" value="${esc(r ? r.date || '' : (dataProposta || oggiISO()))}"${dis}></div>
      <div class="modal-field"><label>Importanza</label><select id="rem-grav"${dis}>
        ${[['info', 'Normale'], ['media', 'Da tenere d\'occhio'], ['alta', 'Critica']].map(([v, t]) => `<option value="${v}"${grav === v ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Commessa (facoltativa)</label><select id="rem-job"${dis}>
        <option value="">—</option>
        ${commesse.map(j => `<option value="${j.id}"${r && r.jobId === j.id ? ' selected' : ''}>${esc([j.number, j.customer].filter(Boolean).join(' — '))}</option>`).join('')}</select></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Note</label><textarea id="rem-notes" rows="3"${dis}>${esc(r ? r.notes || '' : '')}</textarea></div>
    </div>
    ${r ? stampLine(r) : ''}
    <div class="modal-actions">
      ${r && puoi ? `<button class="btn-ghost btn-danger" onclick="reminderDelete('${r.id}')">${ico('trash', '', '')} Elimina</button>` : ''}
      <button class="btn-ghost" onclick="closeModal()">${puoi ? 'Annulla' : 'Chiudi'}</button>
      ${r && puoi ? `<button class="btn-outline" onclick="reminderDone('${r.id}')">✓ Fatto</button>` : ''}
      ${puoi ? `<button class="add-btn-sm" onclick="reminderSave(${r ? `'${r.id}'` : 'null'})">Salva</button>` : ''}
    </div>`);
}
function reminderSave(id) {
  if (!roleGuard('agenda')) return;
  const title = val('rem-title'), date = val('rem-date');
  if (!title) { showToast('Scrivi di cosa si tratta', 'error'); return; }
  if (!date) { showToast('Serve una data', 'error'); return; }
  const gravita = CAL_GRAV_ORD[val('rem-grav')] != null ? val('rem-grav') : 'info';
  const dati = { title, date, gravita, jobId: val('rem-job') || '', notes: val('rem-notes') };
  if (id) Store.update('reminders', id, dati);
  else Store.insert('reminders', Object.assign({ done: false, active: true }, dati));
  closeModal();
  homeCalGiorno = date; homeCalMese = calMeseDi(date);
  renderHome();
  showToast(id ? 'Promemoria aggiornato' : 'Promemoria aggiunto');
}
// «Fatto» non cancella: il promemoria esce dal calendario ma resta nel
// database, e con lui chi l'ha chiuso e quando.
function reminderDone(id) {
  if (!roleGuard('agenda')) return;
  if (!Store.update('reminders', id, { done: true, doneAt: new Date().toISOString() })) return;
  closeModal();
  renderHome();
  showToast('Promemoria segnato come fatto');
}
function reminderDelete(id) {
  if (!roleGuard('agenda')) return;
  const r = Store.getById('reminders', id); if (!r) return;
  askConfirm(`Eliminare il promemoria «${r.title || ''}»?`, () => {
    closeModal();   // la scheda del promemoria, sotto la conferma
    removeConUndo('reminders', id, 'Promemoria eliminato', () => renderHome());
  }, { ok: 'Elimina' });
}

function renderHome() {
  const host = document.getElementById('view-home'); if (!host) return;
  invalidateCaches();
  const segnali = homeSegnali();
  const ris = homeRisparmio();
  const nome = (currentUser && currentUser.name || '').split(' ')[0];

  const GRAVITA = { alta: 'var(--red)', media: 'var(--orange, #d90)', info: 'var(--text-dim)' };
  // La riga di intestazione resta cliccabile e porta alla vista; le voci stanno
  // **fuori** da quel bersaglio, ognuna con il proprio, perché un pulsante
  // dentro un pulsante non si sa più cosa apre — né col mouse né da tastiera.
  const righe = segnali.map(s => `<div class="home-sig">
      <div class="mgmt-item" ${clickAttrs(s.apri || `setView('${s.vista}')`, `${s.n} ${s.testo} — vai a ${viewLabel(s.vista)}`)} style="cursor:pointer">
        <span style="font-family:var(--mono);font-weight:700;width:60px;text-align:right;color:${GRAVITA[s.gravita]}">${s.n}</span>
        <span style="flex:1">${esc(s.testo)}</span>
        <span class="empty-text" style="padding:0">${esc(viewLabel(s.vista))} →</span>
      </div>
      ${homeVociHtml(s)}
    </div>`).join('');

  const kpiRiga = [
    kpi('Articoli', String((db.items || []).length), ''),
    kpi('Distinte', String((db.items || []).filter(i => isAssembly(i.type)).length), 'purple', { azione: "setView('bom')", titolo: 'Apri le distinte' }),
    kpi('Commesse aperte', String((db.jobs || []).filter(j => j.status === 'aperta' || j.status === 'produzione').length), 'accent', { azione: "setView('jobs')", titolo: 'Apri le commesse' }),
    kpi('Ordini da evadere', String((db.orders || []).filter(o => o.status === 'inviato' || o.status === 'confermato' || o.status === 'parziale').length), 'orange', { azione: 'homeOrdiniDaEvadere()', titolo: 'Apri gli ordini a fornitore da evadere' }),
  ].join('');

  host.innerHTML = `<div class="manage-wrap">
    <div class="bom-toolbar">
      <h2 class="section-title">${ico('home', 'tinted pill', '')} Riepilogo${nome ? ' — ciao ' + esc(nome) : ''}</h2>
    </div>
    <div class="cost-summary">${kpiRiga}</div>

    <div class="mrp-section">
      <div class="cycle-section-head"><h3>${ico('warning', 'tinted pill', '')} Richiede attenzione</h3></div>
      ${righe ? `<div style="display:flex;flex-direction:column;gap:6px">${righe}</div>`
        : '<div class="empty-text">Niente in sospeso: nessuna data scaduta, nessun articolo senza prezzo, nessun codice duplicato.</div>'}
    </div>

    <div id="home-cal" style="display:contents">${renderHomeCalendar(_homeEventi = homeEventi())}</div>

    ${ris.tot > 0 ? `<div class="cloud-section" style="margin-top:16px">
      <div style="flex:1">
        <strong>↓ Risparmio possibile</strong>
        <p>Su <strong>${ris.quanti}</strong> ${ris.quanti === 1 ? 'articolo' : 'articoli'} il listino contiene una quotazione più bassa di quella in uso: <strong>${fmtN(ris.tot)}</strong> per unità, sommati. Non si applica niente da solo — il prezzo in uso si cambia dal listino dell'articolo, una scelta per volta.</p>
        <div style="margin-top:8px"><button class="btn-outline" onclick="setView('buy')">Vai alle anagrafiche</button></div>
      </div></div>` : ''}

    <div class="mrp-section">
      <div class="cycle-section-head"><h3>${ico('refresh', 'tinted pill', '')} Riprendi</h3></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-outline" onclick="setView('bom')">${ico('tree', 'tinted', '')} Distinta base</button>
        <button class="btn-outline" onclick="setView('stock')">${ico('package', 'tinted', '')} Magazzino</button>
        <button class="btn-outline" onclick="setView('mrp')">${ico('list', 'tinted', '')} Fabbisogno</button>
        <button class="btn-outline" onclick="setView('orders')">${ico('receipt', 'tinted', '')} Ordini</button>
        <button class="btn-outline" onclick="globalSearchModal()">${ico('search', 'tinted', '')} Cerca ovunque (Ctrl+K)</button>
      </div>
    </div></div>`;
}

// La card «Ordini da evadere» porta all'elenco ordini già filtrato su quegli
// stati (inviato, confermato, parziale): lo stesso numero che si è cliccato.
function homeOrdiniDaEvadere() {
  docFilters.order = Object.assign(docFiltersVuoti(), { status: DOC_STATUS_EVADERE });
  setView('orders');
}
