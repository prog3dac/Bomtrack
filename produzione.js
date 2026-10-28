// ═══════════════════════════════════════════════════════════
//  BOMTRACK — produzione.js
// ═══════════════════════════════════════════════════════════
// Avanzamento di produzione: dichiarare quanti pezzi di una parte sono stati
// fatti, dentro un piano di fabbisogno.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
//
// ── Perché è una dichiarazione e non un campo ──
// La tentazione è mettere un `done` sulla riga di piano e aggiornarlo. Sarebbe
// un numero che si sovrascrive: si perde **quando** si è prodotto e chi l'ha
// detto, e due persone che dichiarano lo stesso giorno si cancellano a vicenda.
// Una dichiarazione per volta, sommata quando serve, è la stessa scelta che
// l'app fa già per il magazzino — dove la giacenza *non è un campo* ma la somma
// dei movimenti — e per la stessa ragione: un saldo ricostruibile è un saldo che
// si può spiegare, e uno storico che si può correggere senza riscrivere il
// passato.
//
// ── Che cosa sblocca ──
// Il `MANUALE.md` dichiara «nessun avanzamento di produzione» come prima
// mancanza, e `views-mrp.js` ne nomina la conseguenza esatta: sulle lavorazioni
// «il fabbisogno netto non si applica… sapere quanti pezzi sono già stati
// lavorati richiederebbe un avanzamento di produzione che l'app non ha».
// Adesso ce l'ha, e quel netto si può fare.
//
// ── Che cosa NON è ──
// Non è una schedulazione: non dice *quando* si produrrà, e il carico dei centri
// resta a capacità infinita com'era. Non muove il magazzino: dichiarare un pezzo
// fatto non lo carica a scaffale — il magazzino si muove dai suoi movimenti, e
// mescolare le due cose vorrebbe dire due verità sulla stessa giacenza.
// È una sola domanda, con una sola risposta: **di questo piano, di questa
// parte, quanti ne sono stati fatti.**

// ─── Le dichiarazioni ───
function produzioniDi(planId) {
  return (db.productions || []).filter(p => p.planId === planId);
}
// Quanti pezzi di una parte risultano fatti dentro un piano. È la somma, e la
// somma può essere corretta aggiungendo una dichiarazione negativa — come una
// rettifica di magazzino, e per la stessa ragione: cancellare una riga sbagliata
// è un'altra cosa dal dire che se ne erano contati troppi.
//
// Dalla 0.105.5 contano anche i pezzi buoni che gli ordini di produzione del
// piano hanno versato: prima il piano non li vedeva, e una parte con un ODP
// chiuso corto (scarti, una chiusura anticipata) sembrava fatta lo stesso.
function prodottiDi(planId, itemId) {
  return (db.productions || [])
    .filter(p => p.planId === planId && p.itemId === itemId)
    .reduce((s, p) => s + (Number(p.qty) || 0), 0)
    + odpDelPiano(planId, itemId).reduce((s, o) => s + opVersato(o), 0);
}
// Gli ordini di produzione vivi di un piano per una parte.
function odpDelPiano(planId, itemId) {
  if (!planId || typeof opVersato !== 'function') return [];
  return (db.prodOrders || []).filter(o => o.planId === planId && o.itemId === itemId && o.status !== 'annullato');
}
// Un ODP ancora aperto promette i pezzi lanciati, meno gli scarti già
// dichiarati e meno quelli già versati (che sono fra i fatti). Uno completato
// o chiuso non promette più niente: quello che ha dato è quello che ha versato.
function odpAttesi(o) {
  if (['completato', 'chiuso'].includes(o.status)) return 0;
  const scarti = (o.phases || []).reduce((s, f) => s + opScarti(o, f), 0);
  return Math.max(0, (Number(o.qty) || 0) - scarti - opVersato(o));
}
function attesiDi(planId, itemId) { return odpDelPiano(planId, itemId).reduce((s, o) => s + odpAttesi(o), 0); }
// Quanto resta da fare. Mai negativo: se se ne sono dichiarati più del previsto
// il residuo è zero, non un numero che invita a produrre all'indietro. Il
// sovrappiù resta visibile nella colonna «fatti», dove è un'informazione.
function daFare(planId, itemId, richiesti) {
  return Math.max(0, (Number(richiesti) || 0) - prodottiDi(planId, itemId));
}
// Quanto resta da lanciare: il da fare, meno quello che gli ODP aperti stanno
// ancora producendo.
function daLanciare(planId, itemId, richiesti) {
  return Math.max(0, daFare(planId, itemId, richiesti) - attesiDi(planId, itemId));
}

// ─── La scorta minima delle parti fabbricate (dalla 0.105.6) ───
// La scheda di una parte chiede scorta minima e lotto, ma il fabbisogno li
// ignorava: l'ordine di produzione nasceva per i pezzi del piano e basta, e il
// riordino salta le parti fatte in casa. La scorta serviva solo a togliere
// pezzi allo scaffale comune, e nessuno proponeva di rifarla.
//
// La regola è quella degli acquisti (netRequirement): il buco della scorta lo
// copre **il primo della fila**, cioè il piano aperto più urgente che fabbrica
// la parte. Il buco si misura a lavoro finito, come farebbe il netto: esistente,
// più quello che gli ODP aperti stanno ancora facendo, più quello che i piani
// devono ancora lanciare, meno quello che i piani devono ancora consumare.
// Gli altri piani non se lo ricaricano, e una volta lanciato l'ODP che lo copre
// i suoi pezzi attesi chiudono il buco: non si propone due volte.
//
// → articolo → { planId: il piano che lo copre, gap: i pezzi che mancano alla scorta }
let _scortaParti = null;
function scortaPartiIndex() {
  if (_scortaParti) return _scortaParti;
  const idx = new Map();
  _scortaParti = idx;
  if (typeof mrpExplodePlan !== 'function' || typeof pianiInOrdine !== 'function') return idx;
  // Nessuna parte con una scorta: niente da esplodere (è il caso più comune).
  if (!(db.items || []).some(it => it.type === 'parte' && safetyStockOf(it) > 0)) return idx;
  const per = new Map();
  const voce = id => { let e = per.get(id); if (!e) { e = { primo: null, lancio: 0, consumo: 0 }; per.set(id, e); } return e; };
  pianiInOrdine().piani.forEach(p => {
    const exp = mrpExplodePlan(p);
    const serve = new Map();
    const conta = (it, q) => { if (safetyStockOf(it) > 0) serve.set(it.id, (serve.get(it.id) || 0) + (Number(q) || 0)); };
    exp.make.forEach(e => {
      conta(e.item, e.qty);
      if (!(safetyStockOf(e.item) > 0)) return;
      const v = voce(e.item.id);
      if (!v.primo) v.primo = p.id;
      v.lancio += daLanciare(p.id, e.item.id, e.qty);
    });
    exp.stock.forEach(e => conta(e.item, e.qty));
    serve.forEach((q, id) => { voce(id).consumo += Math.max(0, q - prelevatoPer(id, p.id)); });
  });
  if (!per.size) return idx;
  const attesi = new Map();
  (db.prodOrders || []).forEach(o => {
    if (o.status === 'annullato' || !per.has(o.itemId)) return;
    attesi.set(o.itemId, (attesi.get(o.itemId) || 0) + odpAttesi(o));
  });
  per.forEach((v, id) => {
    if (!v.primo) return;
    const fine = onHandOf(id) + (attesi.get(id) || 0) + v.lancio - v.consumo;
    const gap = safetyStockOf(getItem(id)) - fine;
    if (gap > 0.000001) idx.set(id, { planId: v.primo, gap });
  });
  return idx;
}
// I pezzi in più che **questo** piano lancia per riportare la parte alla scorta.
function scortaDaLanciare(planId, itemId) {
  const s = planId ? scortaPartiIndex().get(itemId) : null;
  return s && s.planId === planId ? s.gap : 0;
}

// ─── Dichiarare ───
function produzioneDichiara(planId, itemId, qty, note) {
  if (!roleGuardShop('docs')) return null;
  const p = getPlan(planId), it = getItem(itemId);
  if (!p || !it) return null;
  const q = Number(qty) || 0;
  if (!q) { showToast('Scrivi quanti pezzi sono stati fatti', 'error'); return null; }
  const rec = Store.insert('productions', {
    planId, itemId, qty: q,
    date: nowISO(),
    note: String(note || '').trim(),
  });
  // Dalla 0.105.5 una parte fatta entra a magazzino, come quella versata da un
  // ODP: il montaggio la scarica (0.100.0), e senza il carico la giacenza
  // andava sotto zero a ogni assieme. Una correzione negativa la toglie.
  if (rec && hasStock(it) && !isAssembly(it.type)) {
    addMovement(itemId, 'versamento', q, `Produzione ${it.code || ''} — ${p.number || ''}`.trim(), { orderId: rec.id });
  }
  return rec;
}
function produzioneElimina(id) {
  if (!roleGuardShop('docs')) return;
  const rec = (db.productions || []).find(p => p.id === id);
  if (!rec) return;
  const mov = (db.movements || []).filter(m => m.orderId === id);
  const montaggio = mov.some(m => m.kind === 'scarico');
  askConfirm(montaggio
    ? `Eliminare questo montaggio? I ${mov.length === 1 ? 'componente scaricato torna' : mov.length + ' componenti scaricati tornano'} a magazzino.`
    : mov.length ? 'Eliminare questa dichiarazione di produzione? I pezzi che aveva caricato escono dal magazzino.'
      : 'Eliminare questa dichiarazione di produzione?', () => {
    // I movimenti del montaggio se ne vanno con lui: sono la sua conseguenza,
    // e lasciarli scaricherebbe componenti per un montaggio che non c'è più.
    mov.forEach(m => Store.remove('movements', m.id));
    Store.remove('productions', id);
    savedToast(montaggio ? 'Montaggio eliminato, componenti restituiti' : 'Dichiarazione eliminata');
    if (window.__montPlanId) montaggioRefresh();
    else if (window.__prodPlanId) produzioneRefresh();
    else renderMrp();
  });
}

// ═══════════════════════════════════════════════════════════
//  IL MONTAGGIO SCARICA I COMPONENTI (dalla 0.100.0)
// ═══════════════════════════════════════════════════════════
// Commerciali e parti entravano a magazzino — dai ricevimenti, dai versamenti
// degli ODP — ma nessun gesto li faceva uscire quando l'assieme veniva montato:
// senza uno scarico scritto a mano la loro giacenza cresceva per sempre, e con
// lei la sicurezza che «ce ne sono».
//
// Il montaggio si dichiara come la produzione di una parte, **dentro un
// piano** e con la stessa tabella (`productions`, l'assieme come articolo), e
// in più scarica i **componenti diretti** dell'assieme che si tengono a
// magazzino. I movimenti portano l'id della dichiarazione come documento:
// `prelevatiIndex` li attribuisce al piano — così l'impegno scende come scende
// col prelievo di un ODP — ed eliminare la dichiarazione li toglie con sé.
//
// I **sottoassiemi** non si tengono a magazzino e hanno un montaggio loro: si
// dichiarano a parte, ciascuno con i suoi componenti. Scendere nei loro figli
// da qui scaricherebbe due volte chi li dichiara entrambi.
// Con `planId` valgono le sostituzioni decise sul piano (alternativi.js): la
// quota passata all'alternativo esce come alternativo.
function montaggioComponenti(asm, pezzi, planId) {
  const n = Number(pezzi) || 0;
  let stock = [];
  const sotto = [];
  ((asm && asm.components) || []).forEach(c => {
    const it = getItem(c.itemId); if (!it) return;
    const perPezzo = (Number(c.qty) || 0) * (1 + (Number(c.scrapPct) || 0) / 100);
    if (hasStock(it)) {
      const gia = stock.find(x => x.item.id === it.id);
      if (gia) { gia.perPezzo += perPezzo; gia.qty = gia.perPezzo * n; }
      else stock.push({ item: it, perPezzo, qty: perPezzo * n });
    } else if (isAssembly(it.type)) sotto.push({ item: it, perPezzo, qty: perPezzo * n });
  });
  if (planId && typeof sostituzioniPrelievo === 'function' && sostituzioniPiano(planId).length) {
    const orig = new Map(stock.map(x => [x.item.id, x]));
    stock = sostituzioniPrelievo(planId, stock.map(x => ({ itemId: x.item.id, qty: x.qty })))
      .map(r => {
        const o = orig.get(r.sostituisce || r.itemId);
        const quota = o && o.qty > 0 ? r.qty / o.qty : 0;
        return { item: getItem(r.itemId), perPezzo: o ? o.perPezzo * quota : 0, qty: r.qty, sostituisce: r.sostituisce || null };
      }).filter(x => x.item);
  }
  return { stock, sotto };
}
function montaggioMovimenti(prodId) { return (db.movements || []).filter(m => m.orderId === prodId && m.kind === 'scarico'); }
// `righe` è [{ itemId, qty }] in positivo, quanto esce; senza, i componenti
// pieni per i pezzi dichiarati.
function montaggioDichiara(planId, asmId, qty, righe, note) {
  if (!roleGuardShop('docs')) return null;
  const p = getPlan(planId), asm = getItem(asmId);
  if (!p || !asm || !isAssembly(asm.type)) return null;
  const q = Number(qty) || 0;
  if (!(q > 0)) { showToast('Scrivi quanti ne sono stati montati', 'error'); return null; }
  const lista = righe || montaggioComponenti(asm, q, planId).stock.map(x => ({ itemId: x.item.id, qty: x.qty }));
  const rec = Store.insert('productions', { planId, itemId: asmId, qty: q, date: nowISO(), note: String(note || '').trim() });
  if (!rec) return null;
  const testo = `Montaggio ${asm.code || ''} — ${p.number || ''}`.trim();
  lista.forEach(r => {
    const x = Number(r.qty) || 0;
    if (x > 0) addMovement(r.itemId, 'scarico', -x, note ? testo + ' · ' + note : testo, { orderId: rec.id });
  });
  return rec;
}

onPanelClose('montaggio', () => { window.__montPlanId = null; window.__montAsmId = null; });
function montaggioModal(planId, asmId, richiesti) {
  const p = getPlan(planId), asm = getItem(asmId);
  if (!p || !asm) return;
  window.__montPlanId = planId;
  window.__montAsmId = asmId;
  window.__montRichiesti = Number(richiesti) || 0;
  openModal(`<h3>${ico('wrench', 'tinted pill', '')} Montaggio — ${esc(asm.code)}</h3>
    <p style="color:var(--text-dim);margin-bottom:14px">${esc(asm.name)} · piano <strong>${esc(p.number)}</strong></p>
    <div id="montaggio-body">${montaggioBody()}</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'montaggio');
}
function montaggioRefresh() {
  const host = document.getElementById('montaggio-body');
  if (host) host.innerHTML = montaggioBody();
}
function montaggioBody() {
  const planId = window.__montPlanId, asm = getItem(window.__montAsmId);
  if (!asm) return '';
  const richiesti = Number(window.__montRichiesti) || 0;
  const fatti = prodottiDi(planId, asm.id);
  const resta = daFare(planId, asm.id, richiesti);
  const u = itemUom(asm) || 'pz';
  const puoScrivere = canWriteShop('docs');
  const comp = montaggioComponenti(asm, resta, planId);
  window.__montRighe = comp.stock.map(x => ({ itemId: x.item.id, perPezzo: x.perPezzo }));
  const storico = (db.productions || [])
    .filter(x => x.planId === planId && x.itemId === asm.id)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .map(x => {
      const mov = montaggioMovimenti(x.id);
      return `<div class="mgmt-item">
      <span class="mgmt-item-name" style="font-family:var(--mono)">${fmtQtyIt(x.qty)} ${esc(u)}</span>
      <span class="mgmt-item-meta">${esc(fmtDateIt(x.date))}${x.createdBy ? ' · ' + esc(actorName(x.createdBy)) : ''}${x.note ? ' · ' + esc(x.note) : ''} · ${mov.length} ${mov.length === 1 ? 'componente scaricato' : 'componenti scaricati'}
        ${puoScrivere ? `<button class="mini-btn danger" title="Elimina il montaggio e restituisci i componenti" onclick="produzioneElimina('${x.id}')">${ico('trash', 'tinted', 'Elimina')}</button>` : ''}</span>
    </div>`;
    }).join('');
  const righe = comp.stock.map((x, i) => {
    const esistente = onHandOf(x.item.id);
    return `<div class="mgmt-item">
      <span style="width:130px;font-family:var(--mono)">${esc(x.item.code)}</span>
      <span style="flex:1">${esc(x.item.name)}${x.sostituisce ? ` <span class="price-best" title="Alternativo deciso sul piano">⇄ al posto di ${esc((getItem(x.sostituisce) || {}).code || '')}</span>` : ''} <span class="empty-text" style="padding:0">${fmtQtyIt(x.perPezzo)} ${esc(itemUom(x.item))}/${esc(u)} · a magazzino ${fmtUom(esistente, itemUom(x.item))}</span></span>
      <input class="num" type="number" id="mont-q-${i}" min="0" step="any" value="${esc(String(+x.qty.toFixed(4)))}" style="width:110px" oninput="montaggioAvviso()" aria-label="Quantità di ${esc(x.item.code)}">
      <span class="empty-text" style="padding:0;width:40px">${esc(itemUom(x.item))}</span>
    </div>`;
  }).join('');
  const modulo = puoScrivere ? `
    <div class="modal-grid" style="margin-top:12px">
      <div class="modal-field"><label>Montati (${esc(u)})</label>
        <input type="number" id="mont-qty" min="0" step="any" value="${resta || ''}" placeholder="0" oninput="montaggioRicalcola()"></div>
      <div class="modal-field"><label>Nota (facoltativa)</label>
        <input type="text" id="mont-note" placeholder="Es. matricola 0412"></div>
    </div>
    ${righe ? `<h4 class="settings-group-title">Componenti che escono dal magazzino</h4>
      <div style="display:flex;flex-direction:column;gap:6px">${righe}</div>` : '<p class="empty-text" style="text-align:left">Nessun componente diretto a magazzino: dichiarare il montaggio non scarica niente.</p>'}
    <div id="mont-avviso">${montaggioAvvisoHtml()}</div>
    ${comp.sotto.length ? `<p class="empty-text" style="text-align:left;padding:8px 0 0">I sottoassiemi (${comp.sotto.map(x => esc(x.item.code)).join(', ')}) si dichiarano a parte, ciascuno con i suoi componenti.</p>` : ''}
    <div style="margin-top:8px"><button class="add-btn-sm" onclick="montaggioSalva()">Dichiara montaggio</button></div>` : '';
  return `${kpi('Richiesti dal piano', fmtQtyIt(richiesti) + ' ' + u, '')}
    ${kpi('Montati', fmtQtyIt(fatti) + ' ' + u, fatti >= richiesti && richiesti > 0 ? 'green' : '')}
    ${kpi('Restano', fmtQtyIt(resta) + ' ' + u, resta > 0 ? 'orange' : 'green')}
    ${storico ? `<h4 class="settings-group-title">${ico('clock', 'tinted', '')} Montaggi dichiarati</h4><div class="mgmt-list">${storico}</div>` : ''}
    ${modulo}
    <p class="empty-text" style="text-align:left;padding:10px 0 0">Il montaggio <strong>scarica i componenti</strong> come consumo di produzione per questo piano: l'esistente scende, e scende anche l'impegno del piano su di loro. Le quantità si possono correggere riga per riga. Eliminare un montaggio li restituisce.</p>`;
}
// Cambiando i pezzi, le quantità dei componenti seguono: è il caso normale, e
// riscriverle a mano una per una sarebbe lavoro inutile.
function montaggioRicalcola() {
  const n = rawNum('mont-qty');
  (window.__montRighe || []).forEach((r, i) => {
    const el = document.getElementById('mont-q-' + i);
    if (el) el.value = String(+((r.perPezzo * (n > 0 ? n : 0)).toFixed(4)));
  });
  montaggioAvviso();
}
function montaggioRigheLette() {
  return (window.__montRighe || []).map((r, i) => ({ itemId: r.itemId, qty: Math.max(0, rawNum('mont-q-' + i)) }));
}
function montaggioAvvisoHtml() { return avvisoSottoZeroHtml(montaggioRigheLette()); }
function montaggioAvviso() { const el = document.getElementById('mont-avviso'); if (el) el.innerHTML = montaggioAvvisoHtml(); }
function montaggioSalva() {
  const q = rawNum('mont-qty');
  const righe = montaggioRigheLette();
  const sotto = avvisoSottoZero(righe);
  const fatto = montaggioDichiara(window.__montPlanId, window.__montAsmId, q, righe, val('mont-note'));
  if (!fatto) return;
  if (sotto.length) showToast('Montaggio registrato, ma va sotto zero: ' + sotto.join('; '), 'error');
  else savedToast('Montaggio registrato');
  montaggioRefresh();
}

// ─── La scheda ───
// Chiave propria, come il listino e gli allegati: si affianca al piano aperto
// invece di chiuderlo.
onPanelClose('produzione', () => { window.__prodPlanId = null; window.__prodItemId = null; });
function produzioneModal(planId, itemId, richiesti) {
  const p = getPlan(planId), it = getItem(itemId);
  if (!p || !it) return;
  window.__prodPlanId = planId;
  window.__prodItemId = itemId;
  window.__prodRichiesti = Number(richiesti) || 0;
  openModal(`<h3>${ico('factory', 'tinted pill', '')} Avanzamento — ${esc(it.code)}</h3>
    <p style="color:var(--text-dim);margin-bottom:14px">${esc(it.name)} · piano <strong>${esc(p.number)}</strong></p>
    <div id="produzione-body">${produzioneBody()}</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'produzione');
}
function produzioneRefresh() {
  const host = document.getElementById('produzione-body');
  if (host) host.innerHTML = produzioneBody();
}
function produzioneBody() {
  const planId = window.__prodPlanId, itemId = window.__prodItemId;
  const it = getItem(itemId); if (!it) return '';
  const richiesti = Number(window.__prodRichiesti) || 0;
  const fatti = prodottiDi(planId, itemId);
  const resta = daFare(planId, itemId, richiesti);
  const u = itemUom(it);
  const puoScrivere = canWriteShop('docs');   // l'officina dichiara anche le parti (dalla 0.105.6), come il montaggio
  const storico = (db.productions || [])
    .filter(p => p.planId === planId && p.itemId === itemId)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .map(p => `<div class="mgmt-item">
      <span class="mgmt-item-name" style="font-family:var(--mono)">${p.qty > 0 ? '+' : ''}${fmtQtyIt(p.qty)} ${esc(u)}</span>
      <span class="mgmt-item-meta">${esc(fmtDateIt(p.date))}${p.createdBy ? ' · ' + esc(actorName(p.createdBy)) : ''}${p.note ? ' · ' + esc(p.note) : ''}
        ${puoScrivere ? `<button class="mini-btn danger" title="Elimina la dichiarazione" onclick="produzioneElimina('${p.id}')">${ico('trash', 'tinted', 'Elimina')}</button>` : ''}</span>
    </div>`).join('')
    // I pezzi versati dagli ODP del piano sono fra i fatti (0.105.5): si dice da dove vengono.
    + odpDelPiano(planId, itemId).filter(o => opVersato(o) > 0).map(o => `<div class="mgmt-item">
      <span class="mgmt-item-name" style="font-family:var(--mono)">+${fmtQtyIt(opVersato(o))} ${esc(u)}</span>
      <span class="mgmt-item-meta">versati dall'ordine di produzione ${esc(o.number || '')}</span>
    </div>`).join('');
  // Il modulo propone il residuo: il gesto più frequente è «finito», e
  // riscrivere un numero che l'app conosce già è lavoro inutile.
  const modulo = puoScrivere
    ? `<div class="modal-grid" style="margin-top:12px">
        <div class="modal-field"><label>Pezzi fatti (${esc(u)})</label>
          <input type="number" id="prod-qty" step="any" value="${resta || ''}" placeholder="0"></div>
        <div class="modal-field"><label>Nota (facoltativa)</label>
          <input type="text" id="prod-note" placeholder="Es. primo lotto, collaudo ok"></div>
      </div>
      <div style="margin-top:8px"><button class="add-btn-sm" onclick="produzioneSalva()">Dichiara</button></div>
      <p class="empty-text" style="text-align:left;padding:8px 0 0">Un numero <strong>negativo</strong> corregge un conteggio sbagliato, come una rettifica di magazzino: lo storico resta, e si vede che cosa è stato corretto.</p>`
    : '';
  return `${kpi('Richiesti dal piano', fmtQtyIt(richiesti) + ' ' + u, '')}
    ${kpi('Fatti', fmtQtyIt(fatti) + ' ' + u, fatti >= richiesti && richiesti > 0 ? 'green' : '')}
    ${kpi('Restano', fmtQtyIt(resta) + ' ' + u, resta > 0 ? 'orange' : 'green')}
    ${storico ? `<h4 class="settings-group-title">${ico('clock', 'tinted', '')} Dichiarazioni</h4><div class="mgmt-list">${storico}</div>` : ''}
    ${modulo}
    <p class="empty-text" style="text-align:left;padding:10px 0 0">Dichiarare pezzi fatti <strong>mette la parte a magazzino</strong>, con un versamento legato alla dichiarazione: eliminarla toglie anche il versamento. Serve anche a sapere quanto resta da fare — e a non rimandare a lavorare fuori pezzi che sono già stati lavorati. Le righe d'acquisto del piano non cambiano: il materiale si compra prima di fare la parte.</p>`;
}
function produzioneSalva() {
  const q = numVal('prod-qty', -1000000, 1000000);
  const fatto = produzioneDichiara(window.__prodPlanId, window.__prodItemId, q, val('prod-note'));
  if (!fatto) return;
  savedToast('Avanzamento registrato');
  produzioneRefresh();
}

// ─── Il riepilogo di un piano ───
// Quante parti sono finite, e quante no. Serve al titolo del piano: la domanda
// «a che punto siamo» non deve richiedere di scorrere una tabella.
function pianoAvanzamento(planId, make) {
  const righe = make || [];
  if (!righe.length) return null;
  let finite = 0, pezziRichiesti = 0, pezziFatti = 0;
  righe.forEach(e => {
    const f = prodottiDi(planId, e.item.id);
    pezziRichiesti += e.qty;
    pezziFatti += Math.min(f, e.qty);   // il sovrappiù non fa avanzare oltre il 100%
    if (f >= e.qty) finite++;
  });
  return {
    parti: righe.length, finite,
    pezziRichiesti, pezziFatti,
    quota: pezziRichiesti > 0 ? pezziFatti / pezziRichiesti : 0,
  };
}
