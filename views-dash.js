// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-dash.js
// ═══════════════════════════════════════════════════════════
// Il cruscotto: quanto vale il magazzino, cosa è fermo, cosa manca, chi è in
// ritardo. Classic script, scope globale condiviso con gli altri.
//
// Il Riepilogo dice cosa c'è da fare adesso; il cruscotto dice come stanno le
// cose. Non calcola niente di nuovo: giacenze, costi, scorte e consegne sono
// gli stessi delle loro viste, letti qui tutti insieme. Sola lettura.

// Mesi senza movimenti oltre i quali un articolo a magazzino si dice fermo.
const DASH_FERMI_SCELTE = [3, 6, 12];
let dashFermiMesi = 6;

// Il valore di una giacenza: la stessa formula della tessera del magazzino,
// scritta una volta sola perché le due cifre non possano divergere.
// Un esistente negativo vale zero, non meno (dalla 0.105.6): è un errore di
// registrazione, non un debito, e sottraeva dal totale merce che sullo
// scaffale c'è. Il cruscotto contava già solo le giacenze positive.
function valoreGiacenza(it) { return Math.max(0, stockOf(it.id).onHand) * itemUnitCost(it); }

// Le righe d'ordine (ODA e ODL) ancora da ricevere, con la data attesa:
// la confermata se c'è, altrimenti la richiesta. Le stesse del calendario del
// Riepilogo — una bozza non è uscita, un ordine evaso o annullato non aspetta più.
function righeDaRicevere() {
  const out = [];
  [].concat((db.orders || []).map(o => ({ o, tipo: 'order' })), (db.workOrders || []).map(o => ({ o, tipo: 'odl' }))).forEach(({ o, tipo }) => {
    if (o.active === false || o.status === 'bozza' || o.status === 'annullato' || o.status === 'evaso') return;
    (o.lines || []).forEach(l => {
      const data = l.confirmedDate || l.deliveryDate;
      const residuo = (Number(l.qty) || 0) - (Number(l.received) || 0);
      if (!data || residuo <= 0) return;
      out.push({ o, tipo, l, data, residuo });
    });
  });
  return out;
}

// L'ultima volta che un articolo si è mosso: l'ultimo movimento, o la data
// dell'ultimo ordine da cui è arrivato qualcosa. I ricevimenti non hanno una
// data propria (il ricevuto è un numero sulla riga): la data dell'ordine è
// la migliore approssimazione che c'è, e la pagina lo dice.
function ultimiMovimenti() {
  const m = new Map();
  const segna = (id, d) => { d = String(d || '').slice(0, 10); if (id && d && (!m.has(id) || d > m.get(id))) m.set(id, d); };
  (db.movements || []).forEach(x => segna(x.itemId, x.date));
  [].concat(db.orders || [], db.workOrders || []).forEach(o => {
    if (o.active === false) return;
    (o.lines || []).forEach(l => { if ((Number(l.received) || 0) > 0) segna(l.itemId, o.date); });
  });
  return m;
}

// Il modello del cruscotto, separato dal disegno: è quello che si prova.
function dashModello(oggi, mesi) {
  oggi = oggi || oggiISO();
  mesi = mesi || dashFermiMesi;
  const limite = (() => {
    const d = new Date(oggi + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() - mesi);
    return d.toISOString().slice(0, 10);
  })();
  const articoli = (db.items || []).filter(it => hasStock(it) && it.active !== false);
  const ultimi = ultimiMovimenti();

  let totale = 0;
  const perTipo = new Map(), perFamiglia = new Map();
  const somma = (map, chiave, nome, v) => {
    const e = map.get(chiave) || { nome, valore: 0, articoli: 0 };
    e.valore += v; e.articoli++; map.set(chiave, e);
  };
  const fermi = [], sotto = [];
  articoli.forEach(it => {
    const st = stockState(it);
    const v = st.onHand * itemUnitCost(it);
    if (st.onHand > 0) {
      totale += v;
      somma(perTipo, it.type, typeLabel(it.type), v);
      somma(perFamiglia, it.familyId || '', familyName(it.familyId) || 'Senza famiglia', v);
      const ultima = ultimi.get(it.id) || '';
      if (!ultima || ultima < limite) fermi.push({ it, onHand: st.onHand, valore: v, ultima });
    }
    if (st.sotto) sotto.push({ it, onHand: st.onHand, safety: st.safety, manca: st.safety - st.onHand, incoming: st.incoming });
  });
  const perValore = (a, b) => b.valore - a.valore;

  // Consegne scadute, raccolte per fornitore.
  const fornitori = new Map();
  righeDaRicevere().filter(r => r.data < oggi).forEach(r => {
    const k = r.o.supplierId || '';
    const e = fornitori.get(k) || { supplierId: k, nome: supplierName(k) || '(senza fornitore)', righe: 0, valore: 0, ritardoMax: 0, docs: new Map() };
    e.righe++;
    e.valore += r.residuo * (Number(r.l.price) || 0);
    e.ritardoMax = Math.max(e.ritardoMax, giorniTra(r.data, oggi) || 0);
    e.docs.set(r.o.id, { id: r.o.id, tipo: r.tipo, numero: r.o.number || '' });
    fornitori.set(k, e);
  });
  const scaduti = Array.from(fornitori.values()).map(e => Object.assign(e, { docs: Array.from(e.docs.values()) }))
    .sort((a, b) => b.ritardoMax - a.ritardoMax || b.valore - a.valore);

  return {
    oggi, mesi, limite, totale,
    perTipo: Array.from(perTipo.values()).sort(perValore),
    perFamiglia: Array.from(perFamiglia.values()).sort(perValore),
    fermi: fermi.sort(perValore),
    valoreFermo: fermi.reduce((s, f) => s + f.valore, 0),
    sotto: sotto.sort((a, b) => String(a.it.code).localeCompare(String(b.it.code))),
    scaduti,
    righeScadute: scaduti.reduce((s, e) => s + e.righe, 0),
  };
}

function renderDash() {
  invalidateCaches();
  const host = document.getElementById('view-dash');
  if (!host) return;
  const m = dashModello();
  const pct = v => m.totale ? (v / m.totale * 100).toFixed(1).replace('.', ',') + '%' : '';
  const codice = it => `<span class="code-link" ${clickAttrs(`itemInfoModal('${it.id}', event)`, 'Scheda di ' + (it.code || it.name))}>${esc(it.code || '(senza codice)')}</span>`;
  const vuoto = t => `<div class="empty-text">${t}</div>`;
  const tabella = (testa, righe) => `<div class="table-wrap"><table class="dash-table"><thead><tr>${testa}</tr></thead><tbody>${righe}</tbody></table></div>`;

  const ripartizione = (titolo, voci) => `<div class="dash-card"><h4 class="settings-group-title">${titolo}</h4>
    ${voci.length ? voci.map(v => `<div class="breakdown-row">
      <div class="breakdown-name">${esc(v.nome)}</div>
      <div class="breakdown-bar"><div class="breakdown-fill" style="width:${m.totale ? Math.max(0, v.valore) / m.totale * 100 : 0}%;background:var(--purple)"></div></div>
      <div class="breakdown-stats"><span>${fmtN(v.valore)}</span><span style="color:var(--text-dim)">${pct(v.valore)}</span></div>
    </div>`).join('') : vuoto('Niente a magazzino.')}</div>`;

  const scelta = DASH_FERMI_SCELTE.map(n =>
    `<button class="mgmt-tab ${n === m.mesi ? 'active' : ''}" onclick="dashFermiMesi=${n};renderDash()">${n} mesi</button>`).join('');
  const fermi = m.fermi.length ? tabella(
    '<th>Codice</th><th>Descrizione</th><th class="num">Esistente</th><th class="num">Valore</th><th>Ultimo movimento</th>',
    m.fermi.map(f => `<tr><td>${codice(f.it)}</td><td>${esc(f.it.name)}</td>
      <td class="num">${fmtQtyIt(f.onHand)}${uomSuffix(itemUom(f.it))}</td><td class="num">${fmtN(f.valore)}</td>
      <td>${f.ultima ? fmtDateIt(f.ultima) : '<span class="empty-text" style="padding:0">mai</span>'}</td></tr>`).join(''))
    : vuoto(`Nessun articolo fermo da più di ${m.mesi} mesi.`);

  const sotto = m.sotto.length ? tabella(
    '<th>Codice</th><th>Descrizione</th><th class="num">Esistente</th><th class="num">Scorta min.</th><th class="num">Manca</th><th class="num">In arrivo</th>',
    m.sotto.map(s => `<tr><td>${codice(s.it)}</td><td>${esc(s.it.name)}</td>
      <td class="num">${fmtQtyIt(s.onHand)}</td><td class="num">${fmtQtyIt(s.safety)}</td>
      <td class="num" style="color:var(--red)">${fmtQtyIt(s.manca)}</td>
      <td class="num">${s.incoming > 0 ? fmtQtyIt(s.incoming) + (s.incoming >= s.manca ? ' ✓' : '') : '—'}</td></tr>`).join(''))
    : vuoto('Nessun articolo sotto la scorta minima.');

  const scaduti = m.scaduti.length ? tabella(
    '<th>Fornitore</th><th class="num">Righe</th><th class="num">Valore da ricevere</th><th class="num">Ritardo massimo</th><th>Documenti</th>',
    m.scaduti.map(e => `<tr><td>${esc(e.nome)}</td><td class="num">${e.righe}</td><td class="num">${fmtN(e.valore)}</td>
      <td class="num" style="color:${e.ritardoMax > 14 ? 'var(--red)' : 'var(--orange)'}">${e.ritardoMax} gg</td>
      <td><div class="home-voci" style="padding:0">${e.docs.map(d => `<button class="home-chip" onclick="homeApri('${d.tipo}','${d.id}')">${esc(d.numero || '(senza numero)')}</button>`).join('')}</div></td></tr>`).join(''))
    : vuoto('Nessuna consegna scaduta.');

  host.innerHTML = `<div class="bom-toolbar" style="justify-content:space-between">
      <h2 class="section-title" style="margin:0">${ico('chart', 'tinted pill', '')} Cruscotto</h2>
      ${listExportButtons('dashExportSpec')}
    </div>
    <div class="cost-summary">
      ${kpi(`Valore giacenza (${esc(cur())})`, fmtN(m.totale), 'purple', { azione: "dashVaiStock('')", titolo: 'Apri il Magazzino' })}
      ${kpi(`Fermo da ${m.mesi} mesi`, fmtN(m.valoreFermo), m.valoreFermo > 0 ? 'orange' : '', { azione: "dashScorri('dash-fermi')", titolo: 'Vai agli articoli fermi' })}
      ${kpi('Sotto scorta minima', String(m.sotto.length), m.sotto.length ? 'red' : '', { azione: "dashVaiStock('sotto')", titolo: 'Apri il Magazzino filtrato sugli articoli sotto scorta' })}
      ${kpi('Consegne scadute', String(m.righeScadute), m.righeScadute ? 'red' : '', { azione: "dashScorri('dash-scaduti')", titolo: 'Vai alle consegne scadute' })}
    </div>
    <div class="dash-grid">
      ${ripartizione('Valore per tipo', m.perTipo)}
      ${ripartizione('Valore per famiglia', m.perFamiglia)}
    </div>
    <div class="dash-card" id="dash-fermi"><div class="dash-head"><h4 class="settings-group-title">Articoli fermi (${m.fermi.length})</h4><div class="mgmt-tabs">${scelta}</div></div>
      <p class="dash-nota">Con giacenza e nessun movimento da ${m.mesi} mesi, dal più costoso. I ricevimenti non hanno una data propria: vale la data dell'ordine.</p>
      ${fermi}</div>
    <div class="dash-card"><h4 class="settings-group-title">Sotto scorta minima (${m.sotto.length})</h4>
      <p class="dash-nota">✓ quando quello che è in arrivo basta a tornare alla scorta.</p>${sotto}</div>
    <div class="dash-card" id="dash-scaduti"><h4 class="settings-group-title">Consegne scadute per fornitore (${m.righeScadute})</h4>
      <p class="dash-nota">Righe di ordini e ordini di lavoro non ancora ricevute, oltre la data confermata (o richiesta, se non confermata).</p>${scaduti}</div>`;
}

// Le card in testa (dalla 0.101.0): portano alla tabella che spiega il numero,
// qui sotto o nel Magazzino già filtrato.
function dashScorri(id) {
  const el = typeof document !== 'undefined' && document.getElementById(id);
  if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function dashVaiStock(stato) {
  setView('stock');
  const sel = document.getElementById(STOCK_PFX + '-state');
  if (sel && sel.value !== (stato || '')) { sel.value = stato || ''; stockFilterChange(); }
}

function dashExportSpec() {
  const m = dashModello();
  const art = it => [it.code || '', it.name || '', itemUom(it)];
  return {
    titolo: 'Cruscotto', slug: 'cruscotto',
    filtri: [['Data', fmtDateIt(m.oggi)], ['Articoli fermi', `nessun movimento da ${m.mesi} mesi`], ['Valore giacenza', m.totale]],
    sezioni: [
      { nome: 'Valore per famiglia', colonne: [{ h: 'Famiglia', w: 30 }, { h: 'Articoli', w: 10, num: true }, { h: 'Valore', w: 14, num: true }],
        righe: m.perFamiglia.map(v => [v.nome, v.articoli, v.valore]), totali: ['Totale', '', m.totale] },
      { nome: 'Articoli fermi', colonne: [{ h: 'Codice', w: 18 }, { h: 'Descrizione', w: 40 }, { h: 'UM', w: 6 }, { h: 'Esistente', w: 12, num: true }, { h: 'Valore', w: 14, num: true }, { h: 'Ultimo movimento', w: 14, data: true }],
        righe: m.fermi.map(f => art(f.it).concat([f.onHand, f.valore, f.ultima])) },
      { nome: 'Sotto scorta', colonne: [{ h: 'Codice', w: 18 }, { h: 'Descrizione', w: 40 }, { h: 'UM', w: 6 }, { h: 'Esistente', w: 12, num: true }, { h: 'Scorta min.', w: 12, num: true }, { h: 'Manca', w: 12, num: true }, { h: 'In arrivo', w: 12, num: true }],
        righe: m.sotto.map(s => art(s.it).concat([s.onHand, s.safety, s.manca, s.incoming])) },
      { nome: 'Consegne scadute', colonne: [{ h: 'Fornitore', w: 34 }, { h: 'Righe', w: 8, num: true }, { h: 'Valore da ricevere', w: 16, num: true }, { h: 'Ritardo massimo (gg)', w: 14, num: true }, { h: 'Documenti', w: 40 }],
        righe: m.scaduti.map(e => [e.nome, e.righe, e.valore, e.ritardoMax, e.docs.map(d => d.numero).join(', ')]) },
    ],
  };
}
