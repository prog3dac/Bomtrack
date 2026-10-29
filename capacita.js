// ═══════════════════════════════════════════════════════════
//  BOMTRACK — capacita.js
// ═══════════════════════════════════════════════════════════
// Modulo Capacità finita (dalla 0.123.0), nell'area Produzione interna.
// Classic script, scope globale condiviso.
//
// Il fabbisogno e gli ODP pianificano **a ritroso** dalla data in cui il pezzo
// serve, a capacità infinita: ogni fase ha il suo tempo, come se il centro
// fosse libero. Qui si fa il conto **in avanti**, da oggi: le fasi interne
// degli ODP lanciati e in corso si mettono in fila sul loro centro, per data
// di consegna, senza superare le ore che il centro lavora in un giorno, nei
// giorni lavorativi del calendario e fuori dai fermi di manutenzione. Ne esce
// la **data fattibile** di ogni ordine, accanto a quella richiesta.
//
// Propone e non comanda: le date pianificate restano quelle di prima, e un
// ritardo qui è un avviso da guardare, non una data riscritta.
//
// Le ore di una fase sono le ore del ciclo per i pezzi ancora da fare, più
// l'attrezzaggio se la fase non è partita; con il modulo Officina acceso, le
// ore già timbrate su una fase in corso non si tolgono — il ciclo dice quanto
// resta per pezzo, le timbrature quanto si è speso.
// Una fase esterna non occupa centri: dura i suoi giorni dal terzista, più il
// trasporto, e sposta in avanti la fase interna che la segue.

const CAP_ORIZZONTE = 730;   // due anni di giorni: oltre, la fila non si fa
let _capCache = null;
function invalidateCapacita() { _capCache = null; }

function capOreFase(o, f) {
  const wc = getWorkCenter(f.workCenterId);
  const resta = opResidua(o, f);
  const setup = opAvviata(o, f) ? 0 : (wc ? Number(wc.setupHours) || 0 : 0);
  return resta > 0.000001 ? setup + (Number(f.hours) || 0) * resta : 0;
}
function capOreGiorno(wc, iso) {
  if (!isWorkDay(iso)) return 0;
  if (typeof centroFermo === 'function' && centroFermo(wc.id, iso)) return 0;
  return wcHoursPerDay(wc);
}
// → { fasi: Map faseId → { start, end, ore }, ordini: Map odpId → { fattibile, ritardo } }
function capSchedula(oggi) {
  const g = oggi || oggiISO();
  if (_capCache && _capCache.oggi === g) return _capCache.r;
  const usato = new Map();   // wcId|giorno → ore già occupate
  const fasi = new Map(), ordini = new Map();
  const odp = (db.prodOrders || []).filter(o => ODP_APERTI.includes(o.status))
    .sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')) || String(a.number).localeCompare(String(b.number)));
  odp.forEach(o => {
    let pronto = nextWorkDay(g);   // il primo giorno in cui la fase successiva può cominciare
    let fine = '';
    (o.phases || []).forEach(f => {
      if (opChiusa(o, f)) return;
      if (f.supplierId) {
        const gg = Math.max(0, Number(f.days) || 0) + supplierTransitDays(f.supplierId);
        const end = gg > 0 ? addWorkDays(pronto, gg) : pronto;
        fasi.set(f.id, { start: pronto, end, ore: 0, esterna: true });
        fine = end; pronto = end;
        return;
      }
      const wc = getWorkCenter(f.workCenterId);
      let resta = capOreFase(o, f);
      if (!wc || !(resta > 0)) { fasi.set(f.id, { start: pronto, end: pronto, ore: 0 }); fine = pronto; return; }
      let d = pronto, start = '', end = pronto;
      for (let n = 0; resta > 1e-9 && n < CAP_ORIZZONTE; n++, d = calShift(d, 1)) {
        const cap = capOreGiorno(wc, d);
        if (!(cap > 0)) continue;
        const k = wc.id + '|' + d;
        const libero = cap - (usato.get(k) || 0);
        if (!(libero > 1e-9)) continue;
        const preso = Math.min(libero, resta);
        usato.set(k, (usato.get(k) || 0) + preso);
        resta -= preso;
        if (!start) start = d;
        end = d;
      }
      fasi.set(f.id, { start: start || pronto, end, ore: capOreFase(o, f), oltre: resta > 1e-9 });
      fine = end;
      // La fase dopo comincia il giorno lavorativo successivo.
      pronto = addWorkDays(end, 1);
    });
    const due = String(o.dueDate || '').slice(0, 10);
    ordini.set(o.id, { fattibile: fine, ritardo: !!(due && fine && fine > due) });
  });
  const r = { fasi, ordini, usato };
  _capCache = { oggi: g, r };
  return r;
}
function capOrdine(odpId) { return moduloAttivo('capacita') ? capSchedula().ordini.get(odpId) || null : null; }
function capFase(faseId) { return moduloAttivo('capacita') ? capSchedula().fasi.get(faseId) || null : null; }
function capInRitardo() {
  if (!moduloAttivo('capacita')) return [];
  const s = capSchedula();
  return (db.prodOrders || []).filter(o => { const x = s.ordini.get(o.id); return x && x.ritardo; });
}

// La riga sopra le fasi dell'ODP.
function capOdpHtml(o) {
  const x = capOrdine(o.id);
  if (!x || !x.fattibile) return '';
  const gg = x.ritardo ? workDaysBetween(String(o.dueDate).slice(0, 10), x.fattibile) : 0;
  return `<div class="${x.ritardo ? 'rfq-warn' : 'empty-text'}" style="text-align:left">${ico('clock', 'tinted', '')} A capacità finita l'ordine finisce il <strong>${esc(fmtDateIt(x.fattibile))}</strong>${x.ritardo ? `: ${gg} ${gg === 1 ? 'giorno lavorativo' : 'giorni lavorativi'} dopo la data richiesta` : ', in tempo'}. Le fasi in fila sui centri per data di consegna, nelle ore che ogni centro lavora.</div>`;
}
// La fila di un centro, per il Carico centri.
function capCodaHtml() {
  if (!moduloAttivo('capacita')) return '';
  const s = capSchedula();
  const perCentro = new Map();
  (db.prodOrders || []).filter(o => ODP_APERTI.includes(o.status)).forEach(o => (o.phases || []).forEach(f => {
    const x = s.fasi.get(f.id);
    if (!x || x.esterna || !(x.ore > 0)) return;
    const l = perCentro.get(f.workCenterId) || [];
    l.push({ o, f, x });
    perCentro.set(f.workCenterId, l);
  }));
  if (!perCentro.size) return `<div class="mrp-section"><div class="cycle-section-head"><h3>${ico('clock', 'tinted', '')} Coda a capacità finita</h3></div><div class="empty-text">Nessuna fase interna da fare sugli ordini lanciati.</div></div>`;
  const blocchi = Array.from(perCentro.entries()).map(([wcId, l]) => {
    const wc = getWorkCenter(wcId);
    l.sort((a, b) => a.x.start.localeCompare(b.x.start));
    return `<h4 class="settings-group-title">${esc(wc ? wc.name : '(centro mancante)')} · ${fmtQtyIt(+wcHoursPerDay(wc).toFixed(2))} h al giorno</h4>
      <div class="table-wrap"><table class="dash-table"><thead><tr><th>Ordine</th><th>Fase</th><th class="num">Ore</th><th>Dal</th><th>Al</th><th>Serve il</th></tr></thead><tbody>
      ${l.map(({ o, f, x }) => { const r = (s.ordini.get(o.id) || {}).ritardo; return `<tr><td><span class="code-link" ${clickAttrs(`homeApri('odp','${o.id}')`, 'Apri ' + (o.number || ''))}>${esc(o.number || '')}</span> ${esc(o.code || '')}</td>
        <td>${esc(String(f.seq))}</td><td class="num">${fmtQtyIt(+x.ore.toFixed(2))}</td><td>${esc(fmtDateIt(x.start))}</td>
        <td style="color:${r ? 'var(--red)' : 'inherit'}">${esc(fmtDateIt(x.end))}${x.oltre ? ' …' : ''}</td><td>${o.dueDate ? esc(fmtDateIt(o.dueDate)) : '—'}</td></tr>`; }).join('')}
      </tbody></table></div>`;
  }).join('');
  return `<div class="mrp-section"><div class="cycle-section-head"><h3>${ico('clock', 'tinted', '')} Coda a capacità finita</h3></div>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">Gli ordini di produzione lanciati e in corso, in fila sui centri per data di consegna, da oggi in avanti: nei giorni lavorativi, nelle ore al giorno di ogni centro, fuori dai fermi di manutenzione. In rosso le fasi di un ordine che finisce dopo la data richiesta. Le date pianificate degli ordini non cambiano.</p>
    ${blocchi}</div>`;
}
