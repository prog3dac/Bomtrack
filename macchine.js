// ═══════════════════════════════════════════════════════════
//  BOMTRACK — macchine.js
// ═══════════════════════════════════════════════════════════
// Modulo Macchine utensili (dalla 0.126.0), nell'area Produzione interna.
// Classic script, scope globale condiviso.
//
// Il centro di lavoro è il reparto (Tornitura); la macchina è la risorsa che
// ci sta dentro (il tornio CNC, il tornio parallelo). Ogni macchina appartiene
// a un centro e porta:
//   - la propria **tariffa oraria**, che si **somma** a quella del centro: il
//     centro paga la manodopera, la macchina sé stessa. Le ore di una fase sono
//     ore-uomo (dalla 0.124.0): le ore macchina sono le ore-uomo divise per gli
//     operatori, cioè quanto dura la fase. 80 h-uomo con due operatori sono 40
//     h di macchina;
//   - la propria **manutenzione** (modulo Officina): piani che scadono sulle
//     ore lavorate da quella macchina, e fermi che fermano lei e non il reparto;
//   - il proprio posto nella **capacità finita**: una fase assegnata a una
//     macchina fa la fila su quella macchina.
//
// La tariffa si **copia** sulla fase del ciclo (`machineRate`), come quella del
// centro si copia in `rate`: una revisione rilasciata resta com'era anche se la
// tariffa cambia dopo. Cambiandola in Gestione si aggiornano le fasi dei cicli
// che usano la macchina (le revisioni no, gli ODP no: sono fotografie).
//
// Spento il modulo, la quota macchina non entra nei costi e i fermi di una
// macchina tornano a fermare il suo centro, come prima.

function machinesAll() { return db.machines || []; }
function machines() { return machinesAll().filter(m => m.active !== false); }
function getMachine(id) { return id ? machinesAll().find(m => m.id === id) || null : null; }
// Le macchine di un centro; `selId` resta in elenco anche se sospesa, perché
// una scelta già fatta non sparisca dal menu che la mostra.
function macchineDelCentro(wcId, selId) {
  return machinesAll().filter(m => m.workCenterId === wcId && (m.active !== false || m.id === selId));
}
function machineLabel(m) { return m ? [m.code, m.name].filter(Boolean).join(' ') : ''; }

// ─── Costo ───
// Le ore di macchina di una fase per un pezzo: le ore-uomo per gli operatori.
function faseOreMacchina(r) { return (Number(r && r.hours) || 0) / faseOperatori(r); }
// La quota macchina del costo di una fase per un pezzo. Solo per una fase
// interna a costo orario: a costo fisso il costo è quello scritto, e il
// terzista la sua macchina se la paga da sé.
function costoMacchinaFase(r) { return costoMacchinaOre(r, Number(r && r.hours) || 0); }
// La quota macchina per `oreUomo` ore-uomo della fase: quelle del ciclo per un
// pezzo, o quelle timbrate nel consuntivo.
function costoMacchinaOre(r, oreUomo) {
  if (!r || r.supplierId || !r.machineId || r.costMode !== 'orario' || !moduloAttivo('macchine')) return 0;
  return (Number(oreUomo) || 0) / faseOperatori(r) * (Number(r.machineRate) || 0);
}
// Da dove viene il costo di una fase oraria, per il tooltip della cella.
function costoFaseDettaglio(r) {
  if (!r || r.costMode !== 'orario') return '';
  const n = v => numIt(v, v % 1 ? 2 : 0);
  const op = (Number(r.hours) || 0) * (Number(r.rate) || 0);
  const righe = [`Operatore: ${n(Number(r.hours) || 0)} h × ${n(Number(r.rate) || 0)} = ${n(op)}`];
  const mac = costoMacchinaFase(r);
  if (mac > 0 || (r.machineId && moduloAttivo('macchine') && !r.supplierId)) {
    const m = getMachine(r.machineId);
    righe.push(`Macchina ${machineLabel(m) || '(mancante)'}: ${n(faseOreMacchina(r))} h × ${n(Number(r.machineRate) || 0)} = ${n(mac)}`);
  }
  return righe.join('\n');
}

// ─── Ore lavorate ───
// Le ore di macchina di una timbratura: le ore della persona divise per gli
// operatori della fase. Due operatori sullo stesso tornio timbrano 8 ore a
// testa, e il tornio ne ha lavorate 8, non 16.
function logOreMacchina(l) {
  const o = getOdp(l.odpId);
  const f = o && (o.phases || []).find(x => x.id === l.phaseId);
  return logOre(l) / faseOperatori(f);
}
function oreMacchinaDal(machineId, dal) {
  return timeLogs().filter(l => l.machineId === machineId && (!dal || String(l.startedAt).slice(0, 10) > dal))
    .reduce((s, l) => s + logOreMacchina(l), 0);
}
// Il contatore: le ore che la macchina aveva quando è entrata in BomTrack più
// quelle timbrate da allora.
function oreMacchinaTotali(m) { return m ? (Number(m.hoursStart) || 0) + oreMacchinaDal(m.id, '') : 0; }

// ─── Fermi ───
function fermiMacchina(machineId) {
  return maintEvents().filter(e => e.machineId === machineId && e.downFrom)
    .map(e => ({ from: String(e.downFrom).slice(0, 10), to: String(e.downTo || e.downFrom).slice(0, 10) }));
}
function macchinaFerma(machineId, iso) {
  if (!moduloAttivo('officina') || !moduloAttivo('macchine')) return false;
  return fermiMacchina(machineId).some(c => iso >= c.from && iso <= c.to);
}
// La parte del centro che lavora in un giorno: con tre macchine e una ferma,
// due terzi. Senza macchine (o senza il modulo) il centro è intero.
function quotaCentroAttiva(wcId, iso) {
  if (!moduloAttivo('macchine')) return 1;
  const tutte = macchineDelCentro(wcId).filter(m => m.active !== false);
  if (!tutte.length) return 1;
  return tutte.filter(m => !macchinaFerma(m.id, iso)).length / tutte.length;
}

// ─── Dove: centro, o centro e macchina ───
// Per i piani e gli interventi di manutenzione, e per i menu che li scelgono:
// una sola tendina con i centri e, sotto ciascuno, le sue macchine. Il valore
// è «wc:<id>» o «m:<id>».
function dovePlanLabel(rec) {
  const wc = getWorkCenter(rec.workCenterId);
  const m = moduloAttivo('macchine') ? getMachine(rec.machineId) : null;
  return [wc ? wc.name : '(centro mancante)', m ? machineLabel(m) : ''].filter(Boolean).join(' · ');
}
function doveOptions(sel, conVuota) {
  const centri = (db.workCenters || []).filter(w => w.active !== false || sel === 'wc:' + w.id
    || machinesAll().some(m => m.workCenterId === w.id && sel === 'm:' + m.id));
  const conMacchine = moduloAttivo('macchine');
  return (conVuota ? `<option value="">${esc(conVuota)}</option>` : '') + centri.map(w => {
    const ms = conMacchine ? macchineDelCentro(w.id, String(sel || '').slice(2)) : [];
    return `<option value="wc:${esc(w.id)}" ${sel === 'wc:' + w.id ? 'selected' : ''}>${esc(w.name)}${ms.length ? ' — tutto il centro' : ''}</option>`
      + ms.map(m => `<option value="m:${esc(m.id)}" ${sel === 'm:' + m.id ? 'selected' : ''}>&nbsp;&nbsp;↳ ${esc(machineLabel(m))}</option>`).join('');
  }).join('');
}
// «wc:…» / «m:…» → { workCenterId, machineId }. La macchina porta con sé il
// suo centro: una versione dell'app senza il modulo vede il piano sul centro.
function leggiDove(v) {
  const s = String(v || '');
  if (s.startsWith('m:')) { const m = getMachine(s.slice(2)); return { workCenterId: m ? m.workCenterId : null, machineId: m ? m.id : null }; }
  if (s.startsWith('wc:')) return { workCenterId: s.slice(3) || null, machineId: null };
  return { workCenterId: s || null, machineId: null };
}
function doveValore(rec) { return rec && rec.machineId && moduloAttivo('macchine') ? 'm:' + rec.machineId : (rec && rec.workCenterId ? 'wc:' + rec.workCenterId : ''); }

// La tendina della macchina di una fase: vuota se il centro non ne ha.
// `conTariffa`: nel selettore della fase nuova, dove c'è spazio; nella riga
// del ciclo la tariffa sta nel tooltip del costo.
function machineSelectOptions(wcId, sel, conTariffa) {
  const ms = macchineDelCentro(wcId, sel);
  if (!ms.length) return '';
  return `<option value="">Nessuna macchina</option>` + ms.map(m =>
    `<option value="${esc(m.id)}" ${m.id === sel ? 'selected' : ''}>${esc(machineLabel(m))}${conTariffa ? ` (${fmtN(m.hourlyRate)}/h)` : ''}${m.active === false ? ' — sospesa' : ''}</option>`).join('');
}

// ═══════════════════════════════════════════════════════════
//  GESTIONE → MACCHINE UTENSILI
// ═══════════════════════════════════════════════════════════
function renderMachines() {
  const list = machinesAll().slice().sort((a, b) => {
    const wa = getWorkCenter(a.workCenterId), wb = getWorkCenter(b.workCenterId);
    return String(wa ? wa.name : '').localeCompare(String(wb ? wb.name : '')) || machineLabel(a).localeCompare(machineLabel(b));
  }).map(m => {
    const wc = getWorkCenter(m.workCenterId);
    const ore = oreMacchinaTotali(m);
    return `<div class="mgmt-item">
    <span class="mgmt-item-name">${esc(machineLabel(m))}</span>
    <span class="mgmt-item-meta">${esc(wc ? wc.name : '(centro mancante)')} · ${fmtN(m.hourlyRate)}/h${m.kind ? ' · ' + esc(m.kind) : ''}${ore > 0 ? ' · ' + fmtQtyIt(Math.round(ore)) + ' h di lavoro' : ''}</span>
    ${activeBadge(m)}
    <div class="mgmt-item-actions">
      ${activeBtn('machines', m, 'Macchina')}
      <button class="mini-btn" onclick="editMachineModal('${m.id}')" title="Modifica macchina">${ico('edit', 'tinted', 'Modifica macchina')}</button>
      <button class="mini-btn danger" onclick="delMachine('${m.id}')" title="Elimina macchina">${ico('trash', 'tinted', 'Elimina macchina')}</button></div></div>`;
  }).join('') || '<div class="empty-text">Nessuna macchina. Ogni macchina sta in un centro di lavoro e porta la sua tariffa oraria, che si somma a quella del centro.</div>';
  const centri = (db.workCenters || []).filter(w => w.active !== false);
  return `<div class="mgmt-panel">
    <p class="empty-text" style="text-align:left;padding:0 0 8px">La tariffa della macchina si <strong>somma</strong> a quella del centro, che resta la tariffa della manodopera: costo di una fase oraria = ore-uomo × tariffa del centro + ore macchina × tariffa della macchina, dove le ore macchina sono le ore-uomo divise per gli operatori. Se la tariffa del centro comprende già la macchina, va abbassata.</p>
    <div class="mgmt-list">${list}</div>
    ${centri.length ? `<div class="mgmt-form">
      <input id="mac-code" placeholder="Codice (es. T01)" style="max-width:120px">
      <input id="mac-name" placeholder="Nome (es. Tornio CNC)">
      <select id="mac-wc" aria-label="Centro di lavoro">${centri.map(w => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}</select>
      <input id="mac-rate" type="number" min="0" step="0.5" placeholder="Tariffa ${esc(cur())}/h" title="Costo orario della macchina, in ${esc(cur())} per ora di macchina">
      <button class="add-btn-sm" onclick="addMachine()">+ Aggiungi</button></div>`
      : '<div class="empty-text">Serve prima un centro di lavoro.</div>'}</div>`;
}
function addMachine() {
  if (!roleGuard('manage')) return;
  const name = val('mac-name'); if (!name) { showToast('Nome richiesto', 'error'); return; }
  if (isNeg('mac-rate')) { showToast('La tariffa non può essere negativa', 'error'); return; }
  const wcId = val('mac-wc'); if (!getWorkCenter(wcId)) { showToast('Scegli il centro di lavoro', 'error'); return; }
  Store.insert('machines', { id: gid(), code: val('mac-code'), name, workCenterId: wcId, hourlyRate: numVal('mac-rate', 0),
    kind: '', brand: '', model: '', serial: '', year: null, hoursStart: 0, notes: '', active: true });
  renderManage(); savedToast('Macchina aggiunta');
}
// Il calcolo proposto della tariffa: ammortamento, energia e manutenzione
// all'anno, diviso le ore che la macchina lavora in un anno. Non si salva:
// riempie il campo, e la tariffa resta quella che si decide.
function machineRateCalc() {
  const valore = numVal('em-calc-val', 0), anni = numVal('em-calc-anni', 0);
  const kw = numVal('em-calc-kw', 0), euroKwh = numVal('em-calc-ekwh', 0);
  const manut = numVal('em-calc-man', 0), ore = numVal('em-calc-ore', 0);
  const el = document.getElementById('em-calc-out');
  if (!(ore > 0)) { if (el) el.textContent = 'Servono le ore lavorate in un anno.'; return null; }
  const t = ((anni > 0 ? valore / anni : 0) + manut) / ore + kw * euroKwh;
  if (el) el.textContent = `${fmtN(t)}/h`;
  return t;
}
function machineRateCalcApplica() {
  const t = machineRateCalc();
  if (t == null) return;
  const r = document.getElementById('em-rate'); if (r) r.value = String(+t.toFixed(2));
}
function editMachineModal(id) {
  if (!roleGuard('manage')) return;
  const m = getMachine(id); if (!m) return;
  const centri = (db.workCenters || []).filter(w => w.active !== false || w.id === m.workCenterId);
  const fasi = macchinaUsiCicli(id).length;
  openModal(`<h3>${ico('edit', 'tinted pill', '')} Modifica macchina</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Codice</label><input id="em-code" value="${esc(m.code || '')}"></div>
      <div class="modal-field"><label>Nome</label><input id="em-name" value="${esc(m.name || '')}"></div>
      <div class="modal-field"><label>Centro di lavoro</label><select id="em-wc">${centri.map(w => `<option value="${esc(w.id)}" ${w.id === m.workCenterId ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></div>
      <div class="modal-field"><label>Tariffa (${cur()}/h di macchina)</label><input id="em-rate" type="number" min="0" step="0.5" value="${Number(m.hourlyRate) || 0}"></div>
      <div class="modal-field"><label>Tipo</label><input id="em-kind" value="${esc(m.kind || '')}" placeholder="es. tornio CNC"></div>
      <div class="modal-field"><label>Costruttore</label><input id="em-brand" value="${esc(m.brand || '')}"></div>
      <div class="modal-field"><label>Modello</label><input id="em-model" value="${esc(m.model || '')}"></div>
      <div class="modal-field"><label>Matricola</label><input id="em-serial" value="${esc(m.serial || '')}"></div>
      <div class="modal-field"><label>Anno</label><input id="em-year" type="number" min="1900" max="2100" step="1" value="${m.year ? esc(String(m.year)) : ''}"></div>
      <div class="modal-field"><label>Ore di lavoro all'ingresso</label><input id="em-hstart" type="number" min="0" step="1" value="${Number(m.hoursStart) || 0}"
        title="Le ore che la macchina aveva già lavorato quando è stata registrata qui: il contatore parte da lì e somma le ore timbrate"></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Note</label><input id="em-notes" value="${esc(m.notes || '')}"></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:4px 0 0">Contatore: <strong>${fmtQtyIt(+oreMacchinaTotali(m).toFixed(1))} h</strong> (ore all'ingresso più ore timbrate, divise per gli operatori della fase).${fasi ? ` Usata in ${fasi} ${fasi === 1 ? 'fase di ciclo' : 'fasi di ciclo'}: cambiando la tariffa si aggiornano anche quelle; gli ordini di produzione già lanciati e le revisioni restano come sono.` : ''}</p>
    <details class="settings-group"><summary class="settings-group-title" style="cursor:pointer">${ico('euro', 'tinted', '')} Calcola la tariffa</summary>
      <div class="modal-grid">
        <div class="modal-field"><label>Valore d'acquisto (${cur()})</label><input id="em-calc-val" type="number" min="0" step="100" oninput="machineRateCalc()"></div>
        <div class="modal-field"><label>Anni di ammortamento</label><input id="em-calc-anni" type="number" min="0" step="1" oninput="machineRateCalc()"></div>
        <div class="modal-field"><label>Manutenzione all'anno (${cur()})</label><input id="em-calc-man" type="number" min="0" step="10" oninput="machineRateCalc()"></div>
        <div class="modal-field"><label>Ore lavorate in un anno</label><input id="em-calc-ore" type="number" min="0" step="10" oninput="machineRateCalc()"></div>
        <div class="modal-field"><label>Potenza media (kW)</label><input id="em-calc-kw" type="number" min="0" step="0.5" oninput="machineRateCalc()"></div>
        <div class="modal-field"><label>Energia (${cur()}/kWh)</label><input id="em-calc-ekwh" type="number" min="0" step="0.01" oninput="machineRateCalc()"></div>
      </div>
      <p class="empty-text" style="text-align:left;padding:4px 0">(valore ÷ anni + manutenzione) ÷ ore + kW × ${esc(cur())}/kWh = <strong id="em-calc-out">—</strong>
        <button class="btn-outline" onclick="machineRateCalcApplica()">Usa questa tariffa</button></p>
    </details>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveMachine('${id}')">Salva</button></div>`, true, 'form');
}
// Le fasi dei cicli (di parti e assiemi) che usano la macchina.
function macchinaUsiCicli(id) {
  const out = [];
  (db.items || []).forEach(it => (it.cycle || []).forEach(r => { if (r && r.kind === 'op' && r.machineId === id) out.push({ it, r }); }));
  return out;
}
function saveMachine(id) {
  if (!roleGuard('manage')) return;
  const m = getMachine(id); if (!m) return;
  const name = requireVal('em-name', 'Nome richiesto'); if (!name) return;
  if (isNeg('em-rate') || isNeg('em-hstart')) { showToast('Tariffa e ore non possono essere negative', 'error'); return; }
  const wcId = val('em-wc');
  if (!getWorkCenter(wcId)) { showToast('Scegli il centro di lavoro', 'error'); return; }
  const usi = macchinaUsiCicli(id);
  // Una macchina che cambia centro lascerebbe le fasi su un centro che non la
  // contiene: la fase direbbe «Tornitura» e la macchina starebbe in Fresatura.
  if (wcId !== m.workCenterId && usi.some(x => x.r.workCenterId !== wcId)) {
    showToast(`La macchina è usata in ${usi.length} ${usi.length === 1 ? 'fase' : 'fasi'} del centro attuale: toglila da lì prima di spostarla`, 'error');
    return;
  }
  const rate = numVal('em-rate', 0);
  const anno = Math.round(numVal('em-year', 0));
  Object.assign(m, { code: val('em-code'), name, workCenterId: wcId, hourlyRate: rate, kind: val('em-kind'), brand: val('em-brand'),
    model: val('em-model'), serial: val('em-serial'), year: anno > 0 ? anno : null, hoursStart: numVal('em-hstart', 0), notes: val('em-notes') });
  touch(m);
  // La tariffa copiata sulle fasi dei cicli segue la macchina.
  const toccati = new Set();
  usi.forEach(({ it, r }) => { if ((Number(r.machineRate) || 0) !== rate) { r.machineRate = rate; toccati.add(it); } });
  toccati.forEach(it => touch(it));
  saveDB(); closeModal(); renderManage();
  savedToast(toccati.size ? `Aggiornata, con la tariffa in ${toccati.size} ${toccati.size === 1 ? 'ciclo' : 'cicli'}` : 'Aggiornata');
}
function delMachine(id) {
  if (!roleGuard('manage')) return;
  const cicli = macchinaUsiCicli(id).length;
  const odp = (db.prodOrders || []).filter(o => (o.phases || []).some(f => f.machineId === id)).length;
  const piani = (db.maintPlans || []).filter(p => p.machineId === id).length;
  const ev = (db.maintEvents || []).filter(e => e.machineId === id).length;
  const log = (db.timeLogs || []).filter(l => l.machineId === id).length;
  const usi = [cicli && `${cicli} fasi di ciclo`, odp && `${odp} ordini di produzione`, piani && `${piani} piani di manutenzione`,
    ev && `${ev} interventi`, log && `${log} timbrature`].filter(Boolean);
  if (usi.length) { showToast('Usata in ' + usi.join(', ') + ': sospendila invece di eliminarla', 'error'); return; }
  askConfirm('Eliminare la macchina?', () => {
    removeConUndo('machines', id, 'Macchina eliminata', renderManage);
  });
}
// Nel modale del centro: le sue macchine, in sola lettura.
function wcMachinesBlock(wcId) {
  if (!moduloAttivo('macchine')) return '';
  const ms = macchineDelCentro(wcId);
  return `<div class="settings-group-title">${ico('settings', 'tinted', '')} Macchine</div>
    ${ms.length ? `<div class="table-wrap"><table class="dash-table"><thead><tr><th>Macchina</th><th class="num">Tariffa</th><th>Stato</th></tr></thead><tbody>
      ${ms.map(m => `<tr><td>${esc(machineLabel(m))}</td><td class="num">${fmtN(m.hourlyRate)}/h</td><td>${activeBadge(m)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="empty-text" style="text-align:left">Nessuna macchina in questo centro.</p>'}
    <p style="color:var(--text-dim);margin:6px 0 10px">Si aggiungono e si modificano in <em>Gestione → Macchine utensili</em>. La tariffa del centro, con le macchine, è quella della manodopera.</p>`;
}

// ═══════════════════════════════════════════════════════════
//  LA MACCHINA DI UNA FASE
// ═══════════════════════════════════════════════════════════
// Nel ciclo: la tendina sotto il nome del centro, solo per le fasi interne di
// un centro che ha macchine.
function cycleMachineCell(r, i) {
  if (!moduloAttivo('macchine') || r.supplierId) return '';
  const opts = machineSelectOptions(r.workCenterId, r.machineId || '');
  if (!opts) return '';
  return `<select class="cycle-mac" id="cyc-mac-${i}" title="La macchina del centro su cui si fa la fase: la sua tariffa si somma a quella del centro" onchange="onCycleRowMachineChange(${i})">${opts}</select>`;
}
function onCycleRowMachineChange(idx) {
  const it = currentCycleItem(); if (!it) return;
  if (!roleGuard('catalog')) { renderCycles(); return; }
  const row = (it.cycle || [])[idx]; if (!row || row.kind !== 'op') return;
  impostaMacchinaFase(row, val('cyc-mac-' + idx));
  touch(it); saveDB(); refreshCycleCosts(it);
}
function impostaMacchinaFase(row, machineId) {
  const m = getMachine(machineId);
  row.machineId = m ? m.id : null;
  row.machineRate = m ? Number(m.hourlyRate) || 0 : 0;
}
// Nel selettore della fase nuova: la tendina si riempie col centro scelto, e
// con una macchina sola nel centro si propone quella.
function cyclePickerMachineSync() {
  const box = document.getElementById('cyc-mac-box'), sel = document.getElementById('cyc-mac');
  if (!box || !sel) return;
  const esterna = !!val('cyc-opsup');
  const ms = moduloAttivo('macchine') && !esterna ? macchineDelCentro(val('cyc-wc')).filter(m => m.active !== false) : [];
  box.style.display = ms.length ? '' : 'none';
  sel.innerHTML = ms.length ? machineSelectOptions(val('cyc-wc'), ms.length === 1 ? ms[0].id : '', true) : '';
}

// Nell'ODP: prima dell'avvio la fase può passare a un'altra macchina dello
// stesso centro (quella libera). La tariffa si ricopia: è la macchina che
// lavora, ed è lei che costa.
function odpMachineCell(o, f) {
  if (!moduloAttivo('macchine') || f.supplierId) return '';
  const m = getMachine(f.machineId);
  const nome = m ? machineLabel(m) : (f.machineName || '');
  const cambia = canWrite('docs') && !opAvviata(o, f) && modeAllows(odpMode(o), 'ops') && macchineDelCentro(f.workCenterId, f.machineId).length > 0;
  if (cambia) {
    return ` <select class="cycle-mac" aria-label="Macchina della fase ${esc(String(f.seq))}" onchange="odpSetMachine('${o.id}','${f.id}',this.value)">${machineSelectOptions(f.workCenterId, f.machineId || '')}</select>`;
  }
  return nome ? ` <span class="empty-text" style="padding:0">· ${esc(nome)}</span>` : '';
}
function odpSetMachine(odpId, faseId, machineId) {
  if (!opGuard(odpId, 'ops')) { renderOdp(); return; }
  const o = getOdp(odpId); const f = o && (o.phases || []).find(x => x.id === faseId);
  if (!f || opAvviata(o, f)) { renderOdp(); return; }
  impostaMacchinaFase(f, machineId);
  const m = getMachine(f.machineId);
  f.machineName = m ? machineLabel(m) : '';
  touch(f); touch(o); saveDB(); renderOdp(); savedToast('Macchina della fase aggiornata');
}
