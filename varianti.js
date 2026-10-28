// ═══════════════════════════════════════════════════════════
//  BOMTRACK — varianti.js (modulo Varianti, dalla 0.119.0)
// ═══════════════════════════════════════════════════════════
// Una macchina **modello** dichiara le sue opzioni (lunghezza 3/4/5 m, motore
// standard o maggiorato…), e le righe della sua distinta — o di un gruppo che
// ci sta dentro — possono valere solo per certe scelte (`cond`, «L=3|4 & M=B»)
// o avere una quantità che dipende da una scelta (`qtyExpr`, «L*2+0,5»).
//
// ── Il modello non si produce: si configura ──
// Il configuratore prende una combinazione di scelte e genera la **macchina
// concreta**: un articolo vero, con la sua distinta, che si pianifica, si
// costifica e si revisiona come qualunque altra macchina. Niente scelte
// portate in giro sui piani, niente esplosioni «con parametri»: a valle del
// configuratore il resto dell'app non sa nemmeno che le varianti esistono.
//
// Dentro la distinta generata:
//   - un gruppo che non ha righe condizionate (né sotto di sé) è **lo stesso**
//     articolo del modello, non una copia: si progetta una volta sola;
//   - un gruppo le cui righe cambiano con le scelte diventa un **gruppo
//     derivato**, con codice `<codice del gruppo>-V01`. Se un'altra
//     configurazione ha già prodotto le stesse righe, si riusa quello;
//   - la macchina con la stessa combinazione di scelte, se c'è già, si riusa.
//
// ── Il modello cambia ──
// Ogni generato ricorda l'impronta (`configHash`) del modello com'era. Quando
// il modello cambia la scheda lo dice, e «Rigenera» riscrive la distinta della
// macchina concreta dalle scelte che aveva. Il passato resta nelle revisioni.
//
// Con il modulo spento le righe condizionate contano come righe normali e le
// opzioni restano scritte senza che nessuno le legga.

function varAttivo() { return typeof moduloAttivo === 'function' && moduloAttivo('varianti'); }
let _varToccati = null;
function invalidateVarianti() { _varToccati = null; }

// ═══════════════════════════════════════════════════════════
//  OPZIONI, CONDIZIONI E FORMULE
// ═══════════════════════════════════════════════════════════
// Le opzioni valide del modello: un codice, un nome, almeno una scelta.
// Le scelte senza valore (una riga appena aggiunta e non ancora scritta) non
// contano.
function varOpzioni(it) {
  if (!it || !Array.isArray(it.options)) return [];
  return it.options.filter(o => o && o.code && Array.isArray(o.choices))
    .map(o => Object.assign({}, o, { choices: o.choices.filter(c => c && varValore(c.value)) }))
    .filter(o => o.choices.length);
}
function varCodice(c) { return String(c == null ? '' : c).trim().toUpperCase(); }
function varValore(v) { return String(v == null ? '' : v).trim(); }
// È un modello: una macchina con opzioni, che non è a sua volta generata.
function varModello(it) {
  return varAttivo() && !!it && it.type === 'macchina' && !it.configuredFromId && varOpzioni(it).length > 0;
}
function varRigaVariante(c) { return !!c && !!(c.cond || c.qtyExpr); }
// La parte comune di un assieme: le righe che non dipendono dalle scelte, né
// per esserci né per la quantità. È la distinta che costo e fabbisogno usano
// per un modello, che così com'è non si produce.
function varRigheComuni(it) {
  const righe = (it && it.components) || [];
  return varAttivo() ? righe.filter(c => !varRigaVariante(c)) : righe;
}
// L'assieme ha righe che cambiano con le scelte, qui o più sotto.
function varToccato(id) {
  if (!varAttivo()) return false;
  if (!_varToccati) _varToccati = new Map();
  const visita = (x, sopra) => {
    if (_varToccati.has(x)) return _varToccati.get(x);
    const it = getItem(x);
    if (!it || !isAssembly(it.type) || sopra.has(x)) return false;
    sopra.add(x);
    const si = (it.components || []).some(c => varRigaVariante(c) || visita(c.itemId, sopra));
    sopra.delete(x);
    _varToccati.set(x, si);
    return si;
  };
  return visita(id, new Set());
}
// Non si mette in un piano così com'è: prima si sceglie.
function varRichiedeScelte(it) {
  return varAttivo() && !!it && isAssembly(it.type) && (varModello(it) || varToccato(it.id));
}

// «L=3|4 & M!=B» → [{ code: 'L', neg: false, valori: ['3', '4'] }, …].
// Lancia con un messaggio leggibile se non si capisce.
function varCondParse(testo) {
  const t = String(testo || '').trim();
  if (!t) return [];
  return t.split('&').map(pezzo => {
    const m = pezzo.trim().match(/^([A-Za-z][A-Za-z0-9_]*)\s*(!=|=)\s*(.+)$/);
    if (!m) throw new Error(`«${pezzo.trim()}» non si capisce: scrivi per esempio L=3 oppure M!=B`);
    const valori = m[3].split('|').map(varValore).filter(Boolean);
    if (!valori.length) throw new Error(`«${pezzo.trim()}»: manca il valore`);
    return { code: varCodice(m[1]), neg: m[2] === '!=', valori };
  });
}
function varCondVale(clausole, scelte) {
  return clausole.every(c => {
    if (!(c.code in scelte)) throw new Error(`l'opzione ${c.code} non esiste nel modello`);
    const v = varValore(scelte[c.code]).toLowerCase();
    const dentro = c.valori.some(x => x.toLowerCase() === v);
    return c.neg ? !dentro : dentro;
  });
}
// Una formula di quantità: numeri, + − × ÷, parentesi e i codici delle opzioni
// con valore numerico. Un parser piccolo e senza eval, perché il testo lo
// scrive chiunque abbia accesso alla distinta.
function varFormulaCodici(expr) {
  return (String(expr || '').match(/[A-Za-z][A-Za-z0-9_]*/g) || []).map(varCodice);
}
function varQtyValuta(expr, scelte) {
  const s = String(expr || '').replace(/,/g, '.');
  let i = 0;
  const spazi = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const errore = msg => { throw new Error(`formula «${expr}»: ${msg}`); };
  const primario = () => {
    spazi();
    if (s[i] === '(') { i++; const v = somma(); spazi(); if (s[i] !== ')') errore('manca una parentesi chiusa'); i++; return v; }
    if (s[i] === '-') { i++; return -primario(); }
    const num = s.slice(i).match(/^\d+(\.\d+)?|^\.\d+/);
    if (num) { i += num[0].length; return parseFloat(num[0]); }
    const id = s.slice(i).match(/^[A-Za-z][A-Za-z0-9_]*/);
    if (id) {
      i += id[0].length;
      const k = varCodice(id[0]);
      if (!(k in scelte)) errore(`l'opzione ${k} non esiste nel modello`);
      const v = parseFloat(varValore(scelte[k]).replace(',', '.'));
      if (!Number.isFinite(v)) errore(`l'opzione ${k} vale «${scelte[k]}», che non è un numero`);
      return v;
    }
    errore(i < s.length ? `non capisco «${s.slice(i)}»` : 'è incompleta');
  };
  const prodotto = () => {
    let v = primario();
    for (;;) {
      spazi();
      if (s[i] === '*') { i++; v *= primario(); }
      else if (s[i] === '/') { i++; const d = primario(); if (!d) errore('divisione per zero'); v /= d; }
      else return v;
    }
  };
  const somma = () => {
    let v = prodotto();
    for (;;) {
      spazi();
      if (s[i] === '+') { i++; v += prodotto(); }
      else if (s[i] === '-') { i++; v -= prodotto(); }
      else return v;
    }
  };
  const v = somma();
  spazi();
  if (i < s.length) errore(`non capisco «${s.slice(i)}»`);
  return Math.round(v * 1e6) / 1e6;
}
// Controllo della sola sintassi, per la scheda della riga: chi scrive la
// condizione in un gruppo non sa ancora dentro quale modello finirà.
function varControllaRiga(cond, qtyExpr) {
  try { varCondParse(cond); } catch (e) { return 'Condizione: ' + e.message; }
  if (qtyExpr) {
    const prova = {};
    varFormulaCodici(qtyExpr).forEach(k => { prova[k] = '1'; });
    try { varQtyValuta(qtyExpr, prova); } catch (e) { return 'Quantità: ' + e.message.replace(/divisione per zero/, 'controlla i divisori'); }
  }
  return null;
}

// Le scelte lette dal modello: { L: '3', M: 'B' }, codici in maiuscolo, ogni
// opzione con un valore fra i suoi. Restituisce { scelte, errori }.
function varNormalizzaScelte(t, scelte) {
  const out = {}, errori = [];
  const date = {};
  Object.keys(scelte || {}).forEach(k => { date[varCodice(k)] = varValore(scelte[k]); });
  varOpzioni(t).forEach(o => {
    const k = varCodice(o.code);
    const v = date[k];
    const c = o.choices.find(x => varValore(x.value).toLowerCase() === String(v || '').toLowerCase());
    if (!c) errori.push(v ? `${o.name || k}: «${v}» non è fra le scelte` : `${o.name || k}: scegli un valore`);
    else out[k] = varValore(c.value);
  });
  return { scelte: out, errori };
}
function varChiaveScelte(scelte) {
  return Object.keys(scelte).sort().map(k => `${k}=${scelte[k]}`).join(';');
}
function varEtichetteScelte(t, scelte, soloCodici) {
  return varOpzioni(t).filter(o => !soloCodici || soloCodici.has(varCodice(o.code))).map(o => {
    const v = scelte[varCodice(o.code)];
    const c = o.choices.find(x => varValore(x.value) === v);
    return c ? (c.label || `${o.name || o.code} ${c.value}`) : '';
  }).filter(Boolean).join(', ');
}

// ═══════════════════════════════════════════════════════════
//  IMPRONTE: cosa ha generato cosa, e se è cambiato
// ═══════════════════════════════════════════════════════════
function varHash(testo) {
  let h = 5381;
  for (let i = 0; i < testo.length; i++) h = ((h << 5) + h + testo.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}
// L'impronta della definizione di un assieme: quello che il generato copia.
function varFirma(it) {
  return varHash(JSON.stringify({
    o: varOpzioni(it).map(o => [varCodice(o.code), o.choices.map(c => varValore(c.value))]),
    c: (it.components || []).map(c => [c.itemId, Number(c.qty) || 0, Number(c.scrapPct) || 0, c.cond || '', c.qtyExpr || '']),
    p: (it.operations || []).map(o => [o.workCenterId, Number(o.hours) || 0, o.note || '']),
  }));
}
// Il modello e tutti gli assiemi che cambiano con le scelte, sotto di lui.
function varFirmaAlbero(id) {
  const parti = [], visti = new Set();
  const visita = x => {
    if (visti.has(x)) return;
    visti.add(x);
    const it = getItem(x);
    if (!it) return;
    parti.push(x + ':' + varFirma(it));
    (it.components || []).forEach(c => { if (varToccato(c.itemId)) visita(c.itemId); });
  };
  visita(id);
  return varHash(parti.join('|'));
}
// I codici delle opzioni che un assieme legge, qui o più sotto: servono a dire
// nel nome di un gruppo derivato le sole scelte che lo riguardano.
function varCodiciUsati(id) {
  const out = new Set(), visti = new Set();
  const visita = x => {
    if (visti.has(x)) return;
    visti.add(x);
    const it = getItem(x);
    if (!it || !isAssembly(it.type)) return;
    (it.components || []).forEach(c => {
      try { varCondParse(c.cond).forEach(k => out.add(k.code)); } catch (e) { /* la segnala la generazione */ }
      varFormulaCodici(c.qtyExpr).forEach(k => out.add(k));
      visita(c.itemId);
    });
  };
  visita(id);
  return out;
}

// ═══════════════════════════════════════════════════════════
//  RISOLUZIONE: dalle scelte alle righe
// ═══════════════════════════════════════════════════════════
// Le righe di un assieme per una combinazione di scelte. `figlio(c)` dice che
// cosa diventa il componente: un id per la generazione, un costo per il
// calcolo dell'intervallo. Gli errori finiscono in `errori`, riga per riga.
function varRigheScelte(it, scelte, errori) {
  const out = [];
  (it.components || []).forEach((c, i) => {
    const dove = `${it.code}, riga ${i + 1}`;
    try {
      if (c.cond && !varCondVale(varCondParse(c.cond), scelte)) return;
      const qty = c.qtyExpr ? varQtyValuta(c.qtyExpr, scelte) : (Number(c.qty) || 0);
      if (qty < 0) throw new Error(`la quantità viene ${qty}`);
      if (!(qty > 0)) return;
      out.push({ itemId: c.itemId, qty, scrapPct: Number(c.scrapPct) || 0 });
    } catch (e) { if (errori) errori.push(`${dove}: ${e.message}`); }
  });
  return out;
}
function varRisolvi(id, scelte, ctx) {
  const it = getItem(id);
  if (!it || !isAssembly(it.type) || !varToccato(id)) return id;
  if (ctx.memo.has(id)) return ctx.memo.get(id);
  const righe = varRigheScelte(it, scelte, ctx.errori).map(r => Object.assign(r, { itemId: varRisolvi(r.itemId, scelte, ctx) }));
  const chiave = varFirma(it) + '|' + JSON.stringify(righe.map(r => [r.itemId, r.qty, r.scrapPct]));
  const gia = (db.items || []).concat(ctx.nuovi).find(x => x.configuredFromId === id && x.configKey === chiave);
  if (gia) { ctx.memo.set(id, gia.id); if (!ctx.riusati.includes(gia)) ctx.riusati.push(gia); return gia.id; }
  const usati = varCodiciUsati(id);
  const etichetta = varEtichetteScelte(ctx.modello, scelte, usati);
  const n = varCopia(it, righe, ctx, etichetta);
  n.configKey = chiave;
  ctx.memo.set(id, n.id);
  return n.id;
}
// Il nuovo assieme derivato: la definizione dell'originale con le righe
// risolte. Quello che riguarda l'acquisto o la codifica (listini, sigle,
// alternativi) non si copia: il derivato è un assieme fatto in casa, e il suo
// codice segue lo schema `-V01` del configuratore, non la sigla.
function varCopia(it, righe, ctx, etichetta) {
  const n = { id: gid(), type: it.type, uom: it.uom, notes: it.notes || '', active: true,
    name: etichetta ? `${it.name} — ${etichetta}` : it.name,
    components: righe,
    operations: (it.operations || []).map(o => Object.assign({}, o)),
    configuredFromId: it.id };
  ['machineItemId', 'groupItemId', 'familyId', 'subFamilyId', 'overheadPctOverride', 'marginPctOverride', 'assemblyDays']
    .forEach(k => { if (it[k] != null && it[k] !== '') n[k] = it[k]; });
  n.code = varCodiceNuovo(it, ctx);
  ctx.nuovi.push(n);
  return n;
}
// Il primo `<codice>-Vnn` che nessuno ha: né in archivio, né fra quelli che
// questa generazione sta creando, né fra quelli che un collega ha impegnato.
function varCodiceNuovo(base, ctx) {
  const presi = new Set((db.items || []).concat(ctx ? ctx.nuovi : []).map(x => itemCodeKey(x.code)));
  const altrui = typeof _codiciAltrui !== 'undefined' ? _codiciAltrui : new Set();
  for (let n = 1; ; n++) {
    const c = `${base.code}-V${String(n).padStart(2, '0')}`;
    const k = itemCodeKey(c);
    if (!presi.has(k) && !altrui.has(k)) return c;
  }
}

// Prepara la generazione senza scrivere niente: { errori, esistente, macchina,
// nuovi, riusati }. Con `macchina` data (Rigenera) le righe si riscrivono su
// quella invece di crearne una nuova.
function varPrepara(modelloId, scelteDate, macchina) {
  const t = getItem(modelloId);
  const out = { errori: [], esistente: null, macchina: null, nuovi: [], riusati: [], scelte: null };
  if (!varModello(t)) { out.errori.push('Non è un modello configurabile'); return out; }
  const norm = varNormalizzaScelte(t, scelteDate);
  if (norm.errori.length) { out.errori = norm.errori; return out; }
  out.scelte = norm.scelte;
  const chiave = 'scelte:' + varChiaveScelte(norm.scelte);
  if (!macchina) {
    out.esistente = (db.items || []).find(x => x.configuredFromId === t.id && x.configKey === chiave) || null;
    if (out.esistente) return out;
  }
  const ctx = { modello: t, memo: new Map(), nuovi: [], riusati: [], errori: out.errori };
  const righe = varRigheScelte(t, norm.scelte, ctx.errori).map(r => Object.assign(r, { itemId: varRisolvi(r.itemId, norm.scelte, ctx) }));
  if (!righe.length && !ctx.errori.length) ctx.errori.push('Con queste scelte la distinta resta vuota');
  if (ctx.errori.length) return out;
  const dati = { components: righe, operations: (t.operations || []).map(o => Object.assign({}, o)),
    configHash: varFirmaAlbero(t.id) };
  if (macchina) out.macchina = Object.assign({}, macchina, dati);
  else {
    out.macchina = Object.assign({ id: gid(), type: 'macchina', uom: t.uom, notes: t.notes || '', active: true,
      name: `${t.name} — ${varEtichetteScelte(t, norm.scelte)}`,
      configuredFromId: t.id, configChoices: norm.scelte, configKey: chiave }, dati);
    ['overheadPctOverride', 'marginPctOverride', 'assemblyDays', 'familyId', 'subFamilyId']
      .forEach(k => { if (t[k] != null && t[k] !== '') out.macchina[k] = t[k]; });
    out.macchina.code = varCodiceNuovo(t, ctx);
    ctx.nuovi.push(out.macchina);
  }
  out.nuovi = ctx.nuovi;
  out.riusati = ctx.riusati;
  return out;
}
// Con l'archivio condiviso i codici nuovi si impegnano tutti insieme sul
// server prima di salvare. Se un collega ne ha preso uno, la generazione si
// rifà da capo: `_codiciAltrui` lo conosce, e varCodiceNuovo lo salta.
function varConCodici(prepara, fare) {
  let prep = prepara();
  if (prep.errori.length || prep.esistente) return fare(prep);
  if (typeof cloudCondiviso !== 'function' || !cloudCondiviso()) return fare(prep);
  if (!cloudCreazioneInizia()) return null;
  return (async () => {
    for (let tentativi = 0; tentativi < 8; tentativi++) {
      const lista = prep.nuovi.filter(n => n.code).map(n => ({ codice: n.code, item: n.id }));
      let presi;
      try { presi = await cloudImpegnaCodici(lista); }
      catch (e) { cloudErroreRiserva(e, 'i codici della macchina configurata'); return null; }
      if (!presi.length) return fare(prep);
      const altrui = new Set(presi.map(itemCodeKey));
      cloudLiberaCodici(lista.map(x => x.codice).filter(c => !altrui.has(itemCodeKey(c))));
      prep = prepara();
      if (prep.errori.length) return fare(prep);
    }
    showToast('I codici li stanno prendendo dei colleghi: riprova fra un momento', 'error');
    return null;
  })().finally(cloudCreazioneFinita);
}
function varInserisci(nuovi) {
  nuovi.forEach(n => { if (!getItem(n.id)) { stampNew(n); db.items.push(n); } });
}
// Genera (o ritrova) la macchina concreta. `fatto({ item, riusata, nuovi })`
// riceve il risultato; senza archivio condiviso succede subito.
function varGenera(modelloId, scelte, fatto) {
  if (!roleGuard('bom')) return null;
  return varConCodici(() => varPrepara(modelloId, scelte), prep => {
    if (prep.errori.length) { showToast(prep.errori[0] + (prep.errori.length > 1 ? ` (e altri ${prep.errori.length - 1})` : ''), 'error'); return null; }
    if (prep.esistente) { const r = { item: prep.esistente, riusata: true, nuovi: [] }; if (fatto) fatto(r); return r; }
    varInserisci(prep.nuovi);
    saveDB();
    const r = { item: getItem(prep.macchina.id), riusata: false, nuovi: prep.nuovi };
    if (fatto) fatto(r);
    return r;
  });
}
// Il modello è cambiato dopo la generazione.
function varModelloAggiornato(it) {
  if (!varAttivo() || !it || it.type !== 'macchina' || !it.configuredFromId) return false;
  const t = getItem(it.configuredFromId);
  return !!t && varModello(t) && it.configHash !== varFirmaAlbero(t.id);
}
// Rigenera la distinta della macchina concreta dalle scelte che aveva, sul
// modello di adesso. La macchina resta la stessa (codice, piani, movimenti):
// cambia la distinta, come quando la si modifica a mano.
function varRigenera(id, fatto) {
  if (!roleGuard('bom')) return null;
  const m = getItem(id);
  if (!m || !m.configuredFromId) return null;
  return varConCodici(() => varPrepara(m.configuredFromId, m.configChoices || {}, m), prep => {
    if (prep.errori.length) { showToast(prep.errori[0], 'error'); return null; }
    varInserisci(prep.nuovi);
    m.components = prep.macchina.components;
    m.operations = prep.macchina.operations;
    m.configHash = prep.macchina.configHash;
    touch(m);
    saveDB();
    const r = { item: m, nuovi: prep.nuovi };
    if (fatto) fatto(r);
    return r;
  });
}

// ═══════════════════════════════════════════════════════════
//  COSTO DEL MODELLO: da quanto a quanto
// ═══════════════════════════════════════════════════════════
// Il costo di una combinazione, senza creare niente: le righe risolte passano
// da assiemeCost (costing.js) come quelle di un assieme vero.
function varCostoScelte(id, scelte, visti) {
  const it = getItem(id);
  if (!it) return Object.assign({}, ZERO_COST);
  if (!isAssembly(it.type) || !varToccato(id)) return costOf(id);
  const sopra = visti || new Set();
  if (sopra.has(id)) return Object.assign({}, ZERO_COST, { cycle: true });
  const next = new Set(sopra); next.add(id);
  return assiemeCost(it, varRigheScelte(it, scelte, null), c => varCostoScelte(c.itemId, scelte, next));
}
// Tutte le combinazioni, se sono poche abbastanza da contarle (`limite`).
function varCombinazioni(t, limite) {
  const opz = varOpzioni(t);
  const tot = opz.reduce((n, o) => n * o.choices.length, 1);
  if (!opz.length || tot > (limite || 256)) return null;
  let out = [{}];
  opz.forEach(o => {
    const k = varCodice(o.code);
    out = out.flatMap(s => o.choices.map(c => Object.assign({}, s, { [k]: varValore(c.value) })));
  });
  return out;
}
function varIntervalloCosto(t) {
  const comb = varCombinazioni(t);
  if (!comb) return null;
  const tot = comb.map(s => varCostoScelte(t.id, s).total);
  return { min: Math.min(...tot), max: Math.max(...tot), n: comb.length };
}

// ═══════════════════════════════════════════════════════════
//  DISTINTA: i segni sulle righe e l'intestazione
// ═══════════════════════════════════════════════════════════
function varTagRiga(c) {
  if (!varAttivo() || !varRigaVariante(c)) return '';
  const seg = [];
  if (c.cond) seg.push(`<span class="price-best" title="La riga vale solo con queste scelte del modello">se ${esc(c.cond)}</span>`);
  if (c.qtyExpr) seg.push(`<span class="price-best" title="La quantità si calcola dalle scelte del modello">q.tà = ${esc(c.qtyExpr)}</span>`);
  return ' ' + seg.join(' ');
}
// La striscia sopra l'albero: modello, assieme con righe variabili, o
// macchina generata.
function varBannerBom(it) {
  if (!varAttivo() || !it) return '';
  const scrivibile = canWrite('bom');
  const riga = (testo, bottoni) => `<div class="empty-text" style="text-align:left;padding:8px 12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">${testo}${bottoni ? `<span style="display:flex;gap:6px">${bottoni}</span>` : ''}</div>`;
  if (varModello(it)) {
    const r = varIntervalloCosto(it);
    const n = varGenerateDa(it.id).length;
    return riga(`${ico('tree', 'tinted', '')} <span><strong>Modello configurabile</strong>: ${varOpzioni(it).map(o => esc(o.name || o.code)).join(', ')}. ${r ? `Costo da ${fmtN(r.min)} a ${fmtN(r.max)} su ${r.n} combinazioni.` : 'Troppe combinazioni per calcolare l\'intervallo di costo.'} I costi qui sotto sono della parte comune. ${n ? `${n} ${n === 1 ? 'macchina generata' : 'macchine generate'}.` : ''}</span>`,
      `<button class="btn-outline" onclick="varOpzioniModal('${it.id}')">Opzioni</button>${scrivibile ? `<button class="add-btn-sm" onclick="varConfiguraModal('${it.id}')">Configura</button>` : ''}`);
  }
  if (it.configuredFromId && getItem(it.configuredFromId)) {
    const t = getItem(it.configuredFromId);
    const scelte = it.configChoices ? ` con ${esc(varEtichetteScelte(t, it.configChoices) || varChiaveScelte(it.configChoices))}` : '';
    const vecchia = varModelloAggiornato(it);
    return riga(`${ico('tree', 'tinted', '')} <span>Generato da ${codeLink(t.id, t.code)}${scelte}.${vecchia ? ` <span class="mrp-warn">${ico('warning', 'tinted', '')} Il modello è cambiato dopo la generazione.</span>` : ''}</span>`,
      vecchia && scrivibile ? `<button class="add-btn-sm" onclick="varRigeneraUI('${it.id}')">Rigenera</button>` : '');
  }
  // Una macchina qualunque: da qui si comincia, aggiungendo la prima opzione.
  if (it.type === 'macchina' && !it.configuredFromId)
    return riga(`${ico('tree', 'tinted', '')} <span>${(it.options || []).length ? 'Le opzioni di questa macchina non hanno ancora scelte: finché non ne hanno, non è un modello.' : 'Questa macchina non ha opzioni. Aggiungendone una (lunghezza, motore…) diventa un modello da configurare.'}</span>`,
      `<button class="${scrivibile ? 'add-btn-sm' : 'btn-outline'}" onclick="varOpzioniModal('${it.id}')">${scrivibile ? 'Aggiungi opzioni' : 'Opzioni'}</button>`);
  if (varToccato(it.id)) return riga(`${ico('tree', 'tinted', '')} <span>Ha righe che valgono solo con certe scelte: si usa dentro un modello configurabile, e il configuratore ne fa la copia giusta per ogni combinazione.</span>`);
  return '';
}
function varGenerateDa(id) { return (db.items || []).filter(x => x.configuredFromId === id); }

// ═══════════════════════════════════════════════════════════
//  OPZIONI DEL MODELLO
// ═══════════════════════════════════════════════════════════
onPanelClose('varopzioni', () => { window.__varModelloId = null; });
function varOpzioniModal(id) {
  const it = getItem(id); if (!it || it.type !== 'macchina') return;
  window.__varModelloId = id;
  openModal(`<h3>${ico('tree', 'tinted pill', '')} Opzioni del modello — ${esc(it.code)}</h3>
    <p style="color:var(--text-dim);margin-bottom:14px">${esc(it.name)}</p>
    <div id="varopz-body">${varOpzioniBody(id)}</div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Chiudi</button></div>`, true, 'varopzioni');
}
function varOpzioniRefresh() {
  const host = document.getElementById('varopz-body');
  if (host && window.__varModelloId) host.innerHTML = varOpzioniBody(window.__varModelloId);
  if (activeView === 'bom') renderBom();
  renderInspector();
}
// Ogni opzione è un riquadro: codice e nome in testa, sotto le sue scelte,
// una per riga con il valore (quello che le righe di distinta citano) e
// l'etichetta (quello che si legge nel configuratore e nel nome della macchina).
function varOpzioniBody(id) {
  const it = getItem(id); if (!it) return '';
  const scrivibile = canWrite('bom') && !it.configuredFromId;
  const opz = Array.isArray(it.options) ? it.options : [];
  const ro = (v, mono) => `<span${mono ? ' style="font-family:var(--mono)"' : ''}>${esc(v || '')}</span>`;
  const blocco = (o, i) => {
    const scelte = Array.isArray(o.choices) ? o.choices : [];
    return `<div style="border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:12px">
      <div class="modal-grid" style="align-items:end">
        <div class="modal-field"><label>Codice</label>${scrivibile ? `<input value="${esc(o.code || '')}" style="font-family:var(--mono)" onchange="varOpzioneSet('${id}', ${i}, 'code', this.value)">` : ro(o.code, true)}</div>
        <div class="modal-field"><label>Opzione</label>${scrivibile ? `<input value="${esc(o.name || '')}" placeholder="es. Lunghezza" onchange="varOpzioneSet('${id}', ${i}, 'name', this.value)">` : ro(o.name)}</div>
      </div>
      <div class="table-wrap"><table class="price-table"><thead><tr><th scope="col">Valore</th><th scope="col">Etichetta</th><th scope="col"></th></tr></thead><tbody>
        ${scelte.map((c, j) => scrivibile ? `<tr>
          <td><input value="${esc(c.value || '')}" placeholder="es. 3" style="width:110px;font-family:var(--mono)" onchange="varSceltaSet('${id}', ${i}, ${j}, 'value', this.value)"></td>
          <td><input value="${esc(c.label || '')}" placeholder="es. 3 metri" style="width:100%" onchange="varSceltaSet('${id}', ${i}, ${j}, 'label', this.value)"></td>
          <td><button class="mini-btn" title="Togli la scelta" onclick="varSceltaTogli('${id}', ${i}, ${j})">${ico('trash', 'tinted', 'Togli')}</button></td></tr>`
          : `<tr><td>${ro(c.value, true)}</td><td>${ro(c.label)}</td><td></td></tr>`).join('')
          || '<tr><td colspan="3" class="empty-text">Nessuna scelta.</td></tr>'}
      </tbody></table></div>
      ${scrivibile ? `<div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn-outline" onclick="varSceltaAggiungi('${id}', ${i})">+ Aggiungi una scelta</button>
        <button class="btn-ghost" onclick="varOpzioneTogli('${id}', ${i})">${ico('trash', 'tinted', '')} Togli l'opzione</button></div>` : ''}
    </div>`;
  };
  return `${opz.length ? opz.map(blocco).join('') : '<p class="empty-text" style="text-align:left;padding:0 0 8px">Nessuna opzione: la macchina non è un modello.</p>'}
    ${scrivibile ? `<div><button class="add-btn-sm" onclick="varOpzioneAggiungi('${id}')">+ Aggiungi un'opzione</button></div>` : ''}
    <p class="empty-text" style="text-align:left;padding:12px 0 0">Il codice dell'opzione (es. <code>L</code>) e il valore della scelta (es. <code>3</code>) sono quelli che le righe di distinta citano: «vale solo se» <code>L=3|4</code>, oppure la quantità <code>L*2</code>. L'etichetta è quella che si legge. Una macchina con almeno un'opzione con delle scelte è un modello: non si mette in un piano, si configura.</p>`;
}
function varOpzioniMuta(id, fn) {
  if (!roleGuard('bom')) return;
  const it = getItem(id); if (!it || it.configuredFromId) return;
  if (!Array.isArray(it.options)) it.options = [];
  if (fn(it) === false) { varOpzioniRefresh(); return; }
  if (!it.options.length) delete it.options;
  touch(it);
  saveDB();
  varOpzioniRefresh();
}
function varOpzioneAggiungi(id) {
  varOpzioniMuta(id, it => {
    const usati = new Set(it.options.map(o => varCodice(o.code)));
    let k = 'A';
    for (let n = 0; usati.has(k); n++) k = String.fromCharCode(65 + (n + 1) % 26) + (n >= 25 ? Math.floor(n / 25) : '');
    it.options.push({ code: k, name: '', choices: [] });
  });
}
function varOpzioneTogli(id, i) { varOpzioniMuta(id, it => { it.options.splice(i, 1); }); }
function varOpzioneSet(id, i, campo, valore) {
  varOpzioniMuta(id, it => {
    const o = it.options[i]; if (!o) return false;
    if (campo === 'code') {
      const k = varCodice(valore);
      if (!/^[A-Z][A-Z0-9_]*$/.test(k)) { showToast('Il codice dell\'opzione comincia con una lettera e ha solo lettere, cifre e _', 'error'); return false; }
      if (it.options.some((x, j) => j !== i && varCodice(x.code) === k)) { showToast(`C'è già un'opzione ${k}`, 'error'); return false; }
      o.code = k;
    } else if (campo === 'name') o.name = String(valore || '').trim();
  });
}
function varSceltaAggiungi(id, i) {
  varOpzioniMuta(id, it => {
    const o = it.options[i]; if (!o) return false;
    if (!Array.isArray(o.choices)) o.choices = [];
    o.choices.push({ value: '', label: '' });
  });
}
function varSceltaTogli(id, i, j) {
  varOpzioniMuta(id, it => { const o = it.options[i]; if (!o || !o.choices || !o.choices[j]) return false; o.choices.splice(j, 1); });
}
function varSceltaSet(id, i, j, campo, valore) {
  varOpzioniMuta(id, it => {
    const o = it.options[i]; const c = o && o.choices && o.choices[j];
    if (!c) return false;
    const v = varValore(valore);
    if (campo === 'value') {
      if (/[|&=!]/.test(v)) { showToast('Il valore non può contenere | & = !: sono i segni delle condizioni', 'error'); return false; }
      if (v && o.choices.some((x, k) => k !== j && varValore(x.value).toLowerCase() === v.toLowerCase())) { showToast(`C'è già la scelta ${v}`, 'error'); return false; }
      c.value = v;
    } else c.label = v;
  });
}

// ═══════════════════════════════════════════════════════════
//  IL CONFIGURATORE
// ═══════════════════════════════════════════════════════════
onPanelClose('varconf', () => { window.__varConfId = null; });
function varConfiguraModal(id) {
  const t = getItem(id);
  if (!varModello(t)) { showToast('Non è un modello configurabile', 'error'); return; }
  window.__varConfId = id;
  const campi = varOpzioni(t).map(o => `<div class="modal-field"><label>${esc(o.name || o.code)} <span class="empty-text" style="padding:0">(${esc(varCodice(o.code))})</span></label>
    <select class="var-scelta" data-code="${esc(varCodice(o.code))}" onchange="varConfiguraAnteprima()">${o.choices.map(c => `<option value="${esc(c.value)}">${esc(c.label ? `${c.label} (${c.value})` : c.value)}</option>`).join('')}</select></div>`).join('');
  openModal(`<h3>${ico('tree', 'tinted pill', '')} Configura — ${esc(t.code)}</h3>
    <p style="color:var(--text-dim);margin-bottom:14px">${esc(t.name)}</p>
    <div class="modal-grid">${campi}</div>
    <div id="varconf-prev" style="margin-top:12px"></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" id="varconf-ok" onclick="varConfiguraGenera()">Genera la macchina</button></div>`, true, 'varconf');
  varConfiguraAnteprima();
}
function varScelteDalForm() {
  const s = {};
  document.querySelectorAll('.var-scelta').forEach(el => { s[el.getAttribute('data-code')] = el.value; });
  return s;
}
function varConfiguraAnteprima() {
  const host = document.getElementById('varconf-prev');
  if (!host || !window.__varConfId) return;
  const t = getItem(window.__varConfId);
  const scelte = varScelteDalForm();
  const prep = varPrepara(t.id, scelte);
  const ok = document.getElementById('varconf-ok');
  if (prep.errori.length) {
    host.innerHTML = `<div class="mrp-warn">${prep.errori.map(e => `<div>${ico('warning', 'tinted', '')} ${esc(e)}</div>`).join('')}</div>`;
    if (ok) ok.disabled = true;
    return;
  }
  if (ok) { ok.disabled = false; ok.textContent = prep.esistente ? 'Apri la macchina' : 'Genera la macchina'; }
  const costo = varCostoScelte(t.id, prep.scelte).total;
  if (prep.esistente) {
    host.innerHTML = `<p>Questa combinazione esiste già: <strong>${esc(prep.esistente.code)}</strong> ${esc(prep.esistente.name)}.${varModelloAggiornato(prep.esistente) ? ` <span class="mrp-warn">Il modello è cambiato dopo la generazione: aprendola puoi rigenerarla.</span>` : ''}</p>`;
    return;
  }
  const derivati = prep.nuovi.filter(n => n.id !== prep.macchina.id);
  host.innerHTML = `<p style="margin:0 0 6px">Costo previsto: <strong>${fmtN(costo)}</strong></p>
    <div class="table-wrap"><table class="price-table"><thead><tr><th scope="col"></th><th scope="col">Codice</th><th scope="col">Articolo</th></tr></thead><tbody>
      <tr><td>Nuova</td><td style="font-family:var(--mono)">${esc(prep.macchina.code)}</td><td>${esc(prep.macchina.name)}</td></tr>
      ${derivati.map(n => `<tr><td>Nuovo</td><td style="font-family:var(--mono)">${esc(n.code)}</td><td>${esc(n.name)}</td></tr>`).join('')}
      ${prep.riusati.map(n => `<tr><td>Riusato</td><td style="font-family:var(--mono)">${esc(n.code)}</td><td>${esc(n.name)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="empty-text" style="text-align:left;padding:8px 0 0">I gruppi senza righe variabili restano quelli del modello. I gruppi che cambiano con le scelte diventano gruppi derivati, e si riusano quando un'altra configurazione ha già prodotto le stesse righe.</p>`;
}
function varConfiguraGenera() {
  if (!window.__varConfId) return;
  varGenera(window.__varConfId, varScelteDalForm(), r => {
    closeModal();
    savedToast(r.riusata ? `La macchina ${r.item.code} c'era già` : `Generata ${r.item.code}${r.nuovi.length > 1 ? ` con ${r.nuovi.length - 1} ${r.nuovi.length === 2 ? 'gruppo derivato' : 'gruppi derivati'}` : ''}`);
    currentBomId = r.item.id; bomExpanded = new Set();
    if (activeView === 'bom') renderBom(); else setView('bom');
  });
}
function varRigeneraUI(id) {
  const m = getItem(id); if (!m) return;
  askConfirm(`Riscrivere la distinta di ${m.code} dal modello di adesso, con le stesse scelte? La macchina resta la stessa: cambia la sua distinta, come quando la si modifica a mano. Se serve tenere traccia di quella di prima, rilascia prima una revisione.`, () => {
    varRigenera(id, r => {
      savedToast(`Distinta di ${m.code} rigenerata${r.nuovi.length ? ` (${r.nuovi.length} ${r.nuovi.length === 1 ? 'gruppo derivato nuovo' : 'gruppi derivati nuovi'})` : ''}`);
      if (activeView === 'bom') renderBom();
      renderInspector();
    });
  });
}

// ═══════════════════════════════════════════════════════════
//  PANNELLO LATERALE E RIEPILOGO
// ═══════════════════════════════════════════════════════════
function varBody(id) {
  const it = getItem(id); if (!it) return '';
  const scrivibile = canWrite('bom');
  if (it.configuredFromId) {
    const t = getItem(it.configuredFromId);
    return `<p style="margin:0 0 6px"><strong>Generata da</strong> ${t ? `${codeLink(t.id, t.code)} ${esc(t.name)}` : '(modello eliminato)'}</p>
      ${t && it.configChoices ? `<p style="margin:0 0 6px">${esc(varEtichetteScelte(t, it.configChoices) || varChiaveScelte(it.configChoices))}</p>` : ''}
      ${varModelloAggiornato(it) ? `<p class="mrp-warn">${ico('warning', 'tinted', '')} Il modello è cambiato dopo la generazione.</p>${scrivibile ? `<div class="insp-cmds"><button class="insp-cmd" onclick="varRigeneraUI('${it.id}')">${ico('refresh', 'tinted', '')} Rigenera la distinta</button></div>` : ''}` : ''}`;
  }
  const opz = varOpzioni(it);
  const gen = varGenerateDa(id).filter(x => x.type === 'macchina');
  return `${opz.length ? `<p style="margin:0 0 4px"><strong>Opzioni</strong></p>${opz.map(o => `<div class="insp-multi-row"><span style="font-family:var(--mono)">${esc(varCodice(o.code))}</span> <span>${esc(o.name || '')}: ${esc(o.choices.map(c => c.label || c.value).join(', '))}</span></div>`).join('')}`
      : '<p class="empty-text" style="text-align:left;padding:0 0 8px">Nessuna opzione. Aggiungendone una, la macchina diventa un modello da configurare.</p>'}
    ${gen.length ? `<p style="margin:10px 0 4px"><strong>Macchine generate</strong></p>${gen.map(x => `<div class="insp-multi-row">${codeLink(x.id, x.code)} <span>${esc(x.name)}</span>${varModelloAggiornato(x) ? ` <span class="mrp-warn" title="Il modello è cambiato dopo la generazione">${ico('warning', 'tinted', '')}</span>` : ''}</div>`).join('')}` : ''}
    <div class="insp-cmds">
      <button class="insp-cmd" onclick="varOpzioniModal('${it.id}')">${ico('edit', 'tinted', '')} ${scrivibile ? 'Modifica opzioni' : 'Opzioni'}</button>
      ${scrivibile && varModello(it) ? `<button class="insp-cmd" onclick="varConfiguraModal('${it.id}')">${ico('tree', 'tinted', '')} Configura</button>` : ''}
    </div>`;
}
// Per il Riepilogo: le macchine generate da un modello che è cambiato dopo.
function varGenerateDaAggiornare() {
  if (!varAttivo()) return [];
  return (db.items || []).filter(varModelloAggiornato);
}
