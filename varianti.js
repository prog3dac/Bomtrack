// ═══════════════════════════════════════════════════════════
//  BOMTRACK — varianti.js (modulo Varianti, dalla 0.119.0)
// ═══════════════════════════════════════════════════════════
// Una macchina **modello** dichiara le sue opzioni (lunghezza 3/4/5 m, motore
// standard o maggiorato…), e le righe della **sua** distinta — i gruppi del
// primo livello — possono valere solo per certe scelte (`cond`, «L=3|4 & M=B»)
// o avere una quantità che dipende da una scelta (`qtyExpr`, «L*2»).
//
// ── Fino ai gruppi del primo livello, non oltre (dalla 0.120.0) ──
// Le scelte decidono **quali gruppi entrano nella macchina, e quanti**. Ogni
// gruppo resta un articolo normale e fisso: il telaio da 3 m e quello da 4 m
// sono due gruppi, e il modello li sceglie con «L=3» e «L=4». Niente copie di
// gruppi, niente regole dentro i gruppi: la variante si legge per intero nella
// distinta del modello, e la si gestisce da una pagina sola (Tecnico → Varianti).
// Fino alla 0.119 le regole scendevano a ogni livello e generavano gruppi
// derivati: troppe cose in giro per quello che serve davvero.
//
// ── Il modello non si produce: si configura ──
// Il configuratore prende una combinazione di scelte e genera la **macchina
// concreta** `<modello>-V01`: un articolo vero, con la sua distinta, che si
// pianifica, si costifica e si revisiona come qualunque altra macchina. La
// stessa combinazione, se c'è già, si riusa.
//
// ── Il modello cambia ──
// Ogni macchina generata ricorda l'impronta (`configHash`) del modello com'era.
// Quando il modello cambia la pagina Varianti lo dice, e «Rigenera» riscrive la
// distinta della macchina dalle scelte che aveva.
//
// Con il modulo spento le righe condizionate contano come righe normali e le
// opzioni restano scritte senza che nessuno le legga.

function varAttivo() { return typeof moduloAttivo === 'function' && moduloAttivo('varianti'); }
function invalidateVarianti() { /* niente in cache: le letture sono dirette */ }

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
// Una macchina della pagina Varianti: ha delle opzioni, anche ancora da
// completare, e non è a sua volta generata.
function varInPagina(it) {
  return !!it && it.type === 'macchina' && !it.configuredFromId && Array.isArray(it.options) && it.options.length > 0;
}
// È un modello: ha almeno un'opzione con delle scelte.
function varModello(it) {
  return varAttivo() && varInPagina(it) && varOpzioni(it).length > 0;
}
function varModelli() { return (db.items || []).filter(varInPagina).sort((a, b) => String(a.code).localeCompare(String(b.code))); }
function varRigaVariante(c) { return !!c && !!(c.cond || c.qtyExpr); }
// La parte comune del modello: le righe che non dipendono dalle scelte, né per
// esserci né per la quantità. È la distinta che costo e fabbisogno usano per
// un modello, che così com'è non si produce. Su ogni altro assieme le
// condizioni non valgono (vedi varRegoleFuoriPosto) e le righe contano tutte.
function varRigheComuni(it) {
  const righe = (it && it.components) || [];
  return varModello(it) ? righe.filter(c => !varRigaVariante(c)) : righe;
}
// Non si mette in un piano così com'è: prima si sceglie.
function varRichiedeScelte(it) { return varModello(it); }
// Condizioni scritte dove non valgono: dentro un gruppo, o su una macchina che
// non è un modello. Succedeva con la 0.119, che le ammetteva a ogni livello; la
// pagina Varianti le elenca per toglierle, e intanto contano come righe normali.
function varRegoleFuoriPosto() {
  if (!varAttivo()) return [];
  return (db.items || []).filter(it => isAssembly(it.type) && !varModello(it)
    && (it.components || []).some(varRigaVariante));
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
// Le opzioni che la formula cita. Le chiavi di una tabella per scelta
// (`M(S=2; B=3)`) sono valori di M, non opzioni: non si contano.
function varFormulaCodici(expr) {
  const senzaTabelle = String(expr || '').replace(/\(([^()]*=[^()]*)\)/g, '()');
  return (senzaTabelle.match(/[A-Za-z][A-Za-z0-9_]*/g) || []).map(varCodice);
}
// Le tabelle per scelta della formula: [{ code, valori: ['S', 'B'] }].
function varFormulaTabelle(expr) {
  const out = [];
  String(expr || '').replace(/([A-Za-z][A-Za-z0-9_]*)\s*\(([^()]*=[^()]*)\)/g, (m, code, corpo) => {
    out.push({ code: varCodice(code), valori: (corpo.match(/[^=,;()\s]+(?=\s*=)/g) || []).map(varValore) });
    return m;
  });
  return out;
}
function varQtyValuta(expr, scelte) {
  const s = String(expr || '');
  let i = 0;
  const spazi = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const errore = msg => { throw new Error(`formula «${expr}»: ${msg}`); };
  // Un numero, con il punto o con la virgola. In una tabella `3=1,4=2` la
  // virgola separa: se dopo il numero viene un «=», la parte dopo la virgola
  // è la chiave seguente.
  const numero = () => {
    const m = s.slice(i).match(/^\d+(?:[.,]\d+)?|^[.,]\d+/);
    if (!m) return null;
    let t = m[0];
    if (t.includes(',') && /^\s*=/.test(s.slice(i + t.length)) && /^\d/.test(t)) t = t.split(',')[0];
    i += t.length;
    return parseFloat(t.replace(',', '.'));
  };
  // `M(S=2; B=3)`: la quantità per scelta. Una scelta che non c'è vale 0.
  const tabella = k => {
    i++;
    const scelta = varValore(scelte[k]).toLowerCase();
    let trovato = null;
    for (;;) {
      spazi();
      const chiave = s.slice(i).match(/^[^=,;()\s]+/);
      if (!chiave) errore(`nella tabella di ${k} manca una scelta`);
      i += chiave[0].length; spazi();
      if (s[i] !== '=') errore(`nella tabella di ${k}, dopo «${chiave[0]}» ci vuole «=»`);
      i++; spazi();
      const neg = s[i] === '-'; if (neg) i++;
      const v = numero();
      if (v == null) errore(`nella tabella di ${k}, «${chiave[0]}=» vuole un numero`);
      if (trovato == null && chiave[0].toLowerCase() === scelta) trovato = neg ? -v : v;
      spazi();
      if (s[i] === ';' || s[i] === ',') { i++; continue; }
      if (s[i] === ')') { i++; return trovato == null ? 0 : trovato; }
      errore(`manca la parentesi chiusa della tabella di ${k}`);
    }
  };
  const primario = () => {
    spazi();
    if (s[i] === '(') { i++; const v = somma(); spazi(); if (s[i] !== ')') errore('manca una parentesi chiusa'); i++; return v; }
    if (s[i] === '-') { i++; return -primario(); }
    const num = numero();
    if (num != null) return num;
    const id = s.slice(i).match(/^[A-Za-z][A-Za-z0-9_]*/);
    if (id) {
      i += id[0].length;
      const k = varCodice(id[0]);
      if (!(k in scelte)) errore(`l'opzione ${k} non esiste nel modello`);
      spazi();
      if (s[i] === '(') return tabella(k);
      const v = parseFloat(varValore(scelte[k]).replace(',', '.'));
      if (!Number.isFinite(v)) errore(`l'opzione ${k} vale «${scelte[k]}», che non è un numero: usa una tabella, per esempio ${k}(${scelte[k]}=2)`);
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

// ═══════════════════════════════════════════════════════════
//  RISOLUZIONE E GENERAZIONE
// ═══════════════════════════════════════════════════════════
// Le righe del modello per una combinazione di scelte. Gli errori finiscono
// in `errori`, riga per riga.
function varRigheScelte(it, scelte, errori) {
  const out = [];
  (it.components || []).forEach((c, i) => {
    const comp = getItem(c.itemId);
    const dove = `riga ${i + 1}${comp ? ` (${comp.code})` : ''}`;
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
// Il primo `<codice>-Vnn` che nessuno ha: né in archivio, né fra quelli che un
// collega ha impegnato sul server.
function varCodiceNuovo(base) {
  const presi = new Set((db.items || []).map(x => itemCodeKey(x.code)));
  const altrui = typeof _codiciAltrui !== 'undefined' ? _codiciAltrui : new Set();
  for (let n = 1; ; n++) {
    const c = `${base.code}-V${String(n).padStart(2, '0')}`;
    const k = itemCodeKey(c);
    if (!presi.has(k) && !altrui.has(k)) return c;
  }
}
// Prepara la generazione senza scrivere niente: { errori, esistente, macchina,
// scelte }. Con `macchina` data (Rigenera) le righe si riscrivono su quella.
function varPrepara(modelloId, scelteDate, macchina) {
  const t = getItem(modelloId);
  const out = { errori: [], esistente: null, macchina: null, scelte: null };
  if (!varModello(t)) { out.errori.push('Non è un modello configurabile'); return out; }
  const norm = varNormalizzaScelte(t, scelteDate);
  if (norm.errori.length) { out.errori = norm.errori; return out; }
  out.scelte = norm.scelte;
  const chiave = 'scelte:' + varChiaveScelte(norm.scelte);
  if (!macchina) {
    out.esistente = (db.items || []).find(x => x.configuredFromId === t.id && x.configKey === chiave) || null;
    if (out.esistente) return out;
  }
  const righe = varRigheScelte(t, norm.scelte, out.errori);
  if (!righe.length && !out.errori.length) out.errori.push('Con queste scelte la distinta resta vuota');
  if (out.errori.length) return out;
  const dati = { components: righe, operations: (t.operations || []).map(o => Object.assign({}, o)), configHash: varFirma(t) };
  if (macchina) out.macchina = Object.assign({}, macchina, dati);
  else {
    out.macchina = Object.assign({ id: gid(), type: 'macchina', uom: t.uom, notes: t.notes || '', active: true,
      name: `${t.name} — ${varEtichetteScelte(t, norm.scelte)}`,
      configuredFromId: t.id, configChoices: norm.scelte, configKey: chiave }, dati);
    ['overheadPctOverride', 'marginPctOverride', 'assemblyDays']
      .forEach(k => { if (t[k] != null && t[k] !== '') out.macchina[k] = t[k]; });
    varCopiaCodifica(t, out.macchina);
    out.macchina.code = varCodiceNuovo(t);
  }
  return out;
}
// Con l'archivio condiviso il codice nuovo si impegna sul server prima di
// salvare. Se un collega l'ha appena preso, si rifà: `_codiciAltrui` lo
// conosce, e varCodiceNuovo lo salta.
function varConCodice(prepara, fare) {
  let prep = prepara();
  if (prep.errori.length || prep.esistente || !prep.macchina || getItem(prep.macchina.id)) return fare(prep);
  if (typeof cloudCondiviso !== 'function' || !cloudCondiviso()) return fare(prep);
  if (!cloudCreazioneInizia()) return null;
  return (async () => {
    for (let tentativi = 0; tentativi < 8; tentativi++) {
      let presi;
      try { presi = await cloudImpegnaCodici([{ codice: prep.macchina.code, item: prep.macchina.id }]); }
      catch (e) { cloudErroreRiserva(e, 'il codice della macchina configurata'); return null; }
      if (!presi.length) return fare(prep);
      prep = prepara();
      if (prep.errori.length) return fare(prep);
    }
    showToast('Il codice lo stanno prendendo dei colleghi: riprova fra un momento', 'error');
    return null;
  })().finally(cloudCreazioneFinita);
}
// Genera (o ritrova) la macchina concreta. `fatto({ item, riusata })` riceve
// il risultato; senza archivio condiviso succede subito.
function varGenera(modelloId, scelte, fatto) {
  if (!roleGuard('bom')) return null;
  return varConCodice(() => varPrepara(modelloId, scelte), prep => {
    if (prep.errori.length) { showToast(prep.errori[0] + (prep.errori.length > 1 ? ` (e altri ${prep.errori.length - 1})` : ''), 'error'); return null; }
    if (prep.esistente) { const r = { item: prep.esistente, riusata: true }; if (fatto) fatto(r); return r; }
    stampNew(prep.macchina);
    db.items.push(prep.macchina);
    saveDB();
    const r = { item: getItem(prep.macchina.id), riusata: false };
    if (fatto) fatto(r);
    return r;
  });
}
// Il modello è cambiato dopo la generazione.
function varModelloAggiornato(it) {
  if (!varAttivo() || !it || it.type !== 'macchina' || !it.configuredFromId) return false;
  const t = getItem(it.configuredFromId);
  return !!t && varModello(t) && it.configHash !== varFirma(t);
}
// Rigenera la distinta della macchina concreta dalle scelte che aveva, sul
// modello di adesso. La macchina resta la stessa (codice, piani, movimenti):
// cambia la distinta, come quando la si modifica a mano.
function varRigenera(id) {
  if (!roleGuard('bom')) return null;
  const m = getItem(id);
  if (!m || !m.configuredFromId) return null;
  const prep = varPrepara(m.configuredFromId, m.configChoices || {}, m);
  if (prep.errori.length) { showToast(`${m.code}: ${prep.errori[0]}`, 'error'); return null; }
  m.components = prep.macchina.components;
  m.operations = prep.macchina.operations;
  m.configHash = prep.macchina.configHash;
  varCopiaCodifica(getItem(m.configuredFromId), m);
  touch(m);
  saveDB();
  return m;
}
// La codifica che la variante eredita dal modello, tutta: famiglia, sigla
// macchina e schema dei codici dei figli. Non si scrive sulla variante (la
// sua scheda la blocca): si copia qui, alla generazione, a Rigenera e quando
// si salva il modello.
const VAR_CODIFICA = ['familyId', 'subFamilyId', 'sigla', 'gCodeLen', 'gCodeType', 'incrDigitsS', 'incrDigitsN'];
function varCopiaCodifica(t, m) {
  if (!t || !m) return false;
  let cambiata = false;
  VAR_CODIFICA.forEach(k => {
    const v = t[k] != null && t[k] !== '' ? t[k] : undefined;
    if (m[k] === v) return;
    if (v === undefined) delete m[k]; else m[k] = v;
    cambiata = true;
  });
  return cambiata;
}
// Le varianti date che non hanno la codifica del loro modello la prendono, e
// si salva una volta sola. Serve per quelle generate prima della 0.120.3, e
// per quelle arrivate da un collega mentre il modello cambiava.
function varAllineaCodifica(varianti) {
  let n = 0;
  (varianti || []).forEach(m => {
    const t = m && m.configuredFromId && getItem(m.configuredFromId);
    if (t && varCopiaCodifica(t, m)) { touch(m); n++; }
  });
  if (n && canWrite('bom')) saveDB();
  return n;
}
// Dopo il salvataggio del modello: le sue varianti lo seguono.
function varEreditaCodifica(t) {
  if (!t || t.configuredFromId) return;
  varGenerateDa(t.id).forEach(m => { if (varCopiaCodifica(t, m)) touch(m); });
}
function varGenerateDa(id) { return (db.items || []).filter(x => x.configuredFromId === id); }
// Per il Riepilogo: le macchine generate da un modello che è cambiato dopo.
function varGenerateDaAggiornare() {
  if (!varAttivo()) return [];
  return (db.items || []).filter(varModelloAggiornato);
}

// ═══════════════════════════════════════════════════════════
//  COSTO DEL MODELLO: da quanto a quanto
// ═══════════════════════════════════════════════════════════
// Il costo di una combinazione, senza creare niente: le righe risolte passano
// da assiemeCost (costing.js) come quelle di un assieme vero.
function varCostoScelte(id, scelte) {
  const it = getItem(id);
  if (!it) return Object.assign({}, ZERO_COST);
  if (!varModello(it)) return costOf(id);
  return assiemeCost(it, varRigheScelte(it, scelte, null), c => costOf(c.itemId, new Set([id])));
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
//  NELLE ALTRE VISTE: solo segni, nessun comando
// ═══════════════════════════════════════════════════════════
// Il segno accanto a una riga di distinta del modello.
function varTagRiga(c, parent) {
  if (!varAttivo() || !varRigaVariante(c) || (parent && !varModello(parent))) return '';
  const seg = [];
  if (c.cond) seg.push(`<span class="price-best" title="La riga vale solo con queste scelte del modello">se ${esc(c.cond)}</span>`);
  if (c.qtyExpr) seg.push(`<span class="price-best" title="La quantità si calcola dalle scelte del modello">q.tà = ${esc(c.qtyExpr)}</span>`);
  return ' ' + seg.join(' ');
}
// Una riga sola sopra la distinta: dice che cos'è e porta alla pagina.
function varRigaBom(it) {
  if (!varAttivo() || !it || it.type !== 'macchina') return '';
  const vai = id => `<a href="#" onclick="varApri('${id}');return false">Varianti</a>`;
  let testo = '';
  if (varInPagina(it)) testo = `<strong>Modello configurabile</strong>: i costi qui sotto sono della parte comune. Opzioni, regole e configurazione stanno in ${vai(it.id)}.`;
  else if (it.configuredFromId && getItem(it.configuredFromId)) {
    const t = getItem(it.configuredFromId);
    testo = `Generata da ${esc(t.code)}${it.configChoices ? ` con ${esc(varEtichetteScelte(t, it.configChoices) || varChiaveScelte(it.configChoices))}` : ''}.${varModelloAggiornato(it) ? ` <span class="mrp-warn">${ico('warning', 'tinted', '')} Il modello è cambiato dopo la generazione.</span>` : ''} Si gestisce in ${vai(t.id)}.`;
  } else return '';
  return `<div class="empty-text" style="text-align:left;padding:8px 12px">${ico('tree', 'tinted', '')} ${testo}</div>`;
}
function varApri(id) { if (id) currentVarId = id; setView('varianti'); }

// ═══════════════════════════════════════════════════════════
//  LA PAGINA: Tecnico → Varianti
// ═══════════════════════════════════════════════════════════
let currentVarId = null;
function varCorrente() {
  const m = varModelli();
  if (!m.some(x => x.id === currentVarId)) currentVarId = m.length ? m[0].id : null;
  return getItem(currentVarId);
}
function renderVarianti() {
  invalidateCaches();
  const host = document.getElementById('var-body');
  const sel = document.getElementById('var-select');
  if (!host) return;
  if (!varAttivo()) {
    if (sel) sel.innerHTML = '';
    host.innerHTML = `<div class="empty-text">Il modulo Varianti è spento. Si accende in <strong>Gestione → Impostazioni → Moduli</strong>.</div>`;
    return;
  }
  const modelli = varModelli();
  const t = varCorrente();
  if (t) varAllineaCodifica(varGenerateDa(t.id));
  if (sel) sel.innerHTML = modelli.length
    ? modelli.map(m => `<option value="${m.id}" ${m.id === currentVarId ? 'selected' : ''}>${esc(m.code + ' — ' + m.name)}</option>`).join('')
    : '<option value="">— nessun modello —</option>';
  const fuori = varRegoleFuoriPosto();
  const avvisoFuori = fuori.length ? `<div class="cycle-section">
      <div class="cycle-section-head"><h3>${ico('warning', 'tinted pill', '')} Condizioni fuori posto <span class="cycle-dim">${fuori.length}</span></h3></div>
      <p class="empty-text" style="text-align:left;padding:0 0 8px">Le condizioni valgono solo sulle righe di una macchina modello. Su questi assiemi non contano, e le righe valgono sempre: toglile per non confonderti.</p>
      <div class="cycle-box"><table class="price-table"><tbody>${fuori.map(x => `<tr><td style="font-family:var(--mono)">${codeLink(x.id, x.code)}</td><td>${esc(x.name)}</td>
        <td>${(x.components || []).filter(varRigaVariante).length} righe</td>
        <td>${canWrite('bom') ? `<button class="btn-outline" onclick="varTogliCondizioni('${x.id}')">Togli le condizioni</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
    </div>` : '';
  if (!t) {
    host.innerHTML = `<div class="empty-text">Nessun modello. Un modello è una macchina con delle opzioni: crealo con <strong>+ Nuovo modello</strong> scegliendo una macchina già in archivio.</div>${avvisoFuori}`;
    return;
  }
  host.innerHTML = `${varSezioneOpzioni(t)}${varSezioneRegole(t)}${varSezioneConfigura(t)}${varSezioneGenerate(t)}${avvisoFuori}`;
  varConfiguraAnteprima();
}
function onVarSelect() { currentVarId = val('var-select'); renderVarianti(); }
const varScrivibile = t => canWrite('bom') && !!t && !t.configuredFromId;
const varSezione = (icona, titolo, conta, corpo, azione) => `<div class="cycle-section">
    <div class="cycle-section-head"><h3>${ico(icona, 'tinted pill', '')} ${titolo}${conta != null ? ` <span class="cycle-dim">${conta}</span>` : ''}</h3>${azione || ''}</div>
    ${corpo}</div>`;

// ── 1. Opzioni ──
function varSezioneOpzioni(t) {
  const scrivibile = varScrivibile(t);
  const opz = t.options || [];
  const blocco = (o, i) => {
    const scelte = Array.isArray(o.choices) ? o.choices : [];
    return `<div class="cycle-box" style="padding:10px">
      <div class="var-opz-head" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
        ${scrivibile ? `<input value="${esc(o.code || '')}" title="Codice dell'opzione: è quello che le regole citano" style="width:70px;font-family:var(--mono)" onchange="varOpzioneSet('${t.id}', ${i}, 'code', this.value)">
        <input value="${esc(o.name || '')}" placeholder="Nome, es. Lunghezza" style="flex:1;min-width:160px" onchange="varOpzioneSet('${t.id}', ${i}, 'name', this.value)">
        <button class="mini-btn" title="Togli l'opzione" onclick="varOpzioneTogli('${t.id}', ${i})">${ico('trash', 'tinted', 'Togli l\'opzione')}</button>`
        : `<strong style="font-family:var(--mono)">${esc(o.code || '')}</strong> ${esc(o.name || '')}`}
      </div>
      <table class="price-table"><thead><tr><th scope="col">Valore</th><th scope="col">Etichetta</th><th scope="col"></th></tr></thead><tbody>
        ${scelte.map((c, j) => scrivibile ? `<tr>
          <td><input value="${esc(c.value || '')}" placeholder="es. 3" style="width:110px;font-family:var(--mono)" onchange="varSceltaSet('${t.id}', ${i}, ${j}, 'value', this.value)"></td>
          <td><input value="${esc(c.label || '')}" placeholder="es. 3 metri" style="width:100%" onchange="varSceltaSet('${t.id}', ${i}, ${j}, 'label', this.value)"></td>
          <td><button class="mini-btn" title="Togli la scelta" onclick="varSceltaTogli('${t.id}', ${i}, ${j})">${ico('trash', 'tinted', 'Togli la scelta')}</button></td></tr>`
          : `<tr><td style="font-family:var(--mono)">${esc(c.value || '')}</td><td>${esc(c.label || '')}</td><td></td></tr>`).join('')
          || '<tr><td colspan="3" class="empty-text">Nessuna scelta.</td></tr>'}
      </tbody></table>
      ${scrivibile ? `<button class="btn-outline" style="margin-top:8px" onclick="varSceltaAggiungi('${t.id}', ${i})">+ Scelta</button>` : ''}
    </div>`;
  };
  // Richiusa, la sezione dice in una riga le opzioni e le loro scelte: le
  // opzioni si scrivono una volta, e dopo occupano solo spazio.
  const chiusa = varOpzioniChiuse.has(t.id);
  const titolo = `<button type="button" class="var-toggle" aria-expanded="${!chiusa}" onclick="varOpzioniApriChiudi('${t.id}')">${ico(chiusa ? 'chevronRight' : 'chevronDown', 'tinted', '')} Opzioni</button>`;
  const corpo = chiusa
    ? `<p class="empty-text" style="text-align:left;padding:0">${varOpzioni(t).map(o => `<strong style="font-family:var(--mono)">${esc(varCodice(o.code))}</strong> ${esc(o.name || '')}: ${esc(o.choices.map(c => c.label || c.value).join(', '))}`).join(' · ') || 'Nessuna opzione con delle scelte.'}</p>`
    : (opz.length ? `<div class="var-opz-grid">${opz.map(blocco).join('')}</div>` : '<p class="empty-text" style="text-align:left">Nessuna opzione.</p>');
  return varSezione('list', titolo, opz.length, corpo,
    varScrivibile(t) && !chiusa ? `<button class="add-btn-sm" onclick="varOpzioneAggiungi('${t.id}')">+ Opzione</button>` : '');
}
// I modelli con la sezione Opzioni richiusa. Dura quanto la sessione: è
// comodità di lettura, non un dato da salvare.
const varOpzioniChiuse = new Set();
function varOpzioniApriChiudi(id) {
  if (varOpzioniChiuse.has(id)) varOpzioniChiuse.delete(id); else varOpzioniChiuse.add(id);
  renderVarianti();
}

// ── 2. Regole ──
// Le righe della distinta del modello, con la condizione e la formula
// scrivibili qui. Le righe si aggiungono e si tolgono in Gestione DB: qui si
// decide solo quando valgono.
function varSezioneRegole(t) {
  const scrivibile = varScrivibile(t);
  const righe = t.components || [];
  const tab = righe.length ? `<table class="price-table"><thead><tr><th scope="col">#</th><th scope="col">Codice</th><th scope="col">Gruppo</th>
      <th scope="col" style="text-align:right">Q.tà</th><th scope="col">Vale solo se</th><th scope="col">Quantità da formula</th></tr></thead><tbody>
    ${righe.map((c, i) => {
      const g = getItem(c.itemId);
      return `<tr><td>${i + 1}</td><td style="font-family:var(--mono)">${g ? codeLink(g.id, g.code) : '—'}</td><td>${g ? esc(g.name) : '(articolo mancante)'}</td>
        <td style="text-align:right;font-family:var(--mono)">${c.qtyExpr ? '—' : esc(String(Number(c.qty) || 0))}</td>
        <td>${scrivibile ? `<input value="${esc(c.cond || '')}" placeholder="sempre" style="width:100%;font-family:var(--mono)" onchange="varRegolaSet('${t.id}', ${i}, 'cond', this.value)">` : esc(c.cond || 'sempre')}</td>
        <td>${scrivibile ? `<input value="${esc(c.qtyExpr || '')}" placeholder="—" style="width:100%;font-family:var(--mono)" onchange="varRegolaSet('${t.id}', ${i}, 'qtyExpr', this.value)">` : esc(c.qtyExpr || '')}</td></tr>`;
    }).join('')}</tbody></table>`
    : '<p class="empty-text" style="text-align:left;padding:8px">La distinta del modello è vuota.</p>';
  return varSezione('tree', 'Regole', righe.filter(varRigaVariante).length + ' di ' + righe.length,
    `<div class="cycle-box">${tab}</div>
    <p class="empty-text" style="text-align:left;padding:8px 0 0">Una riga con i campi vuoti vale sempre. Per aggiungere o togliere gruppi apri il modello in <a href="#" onclick="currentBomId='${t.id}';bomExpanded=new Set();setView('bom');return false">Gestione DB</a>.</p>`,
    `<button class="btn-outline" style="margin-left:auto" onclick="varEsempiModal()">${ico('file', 'tinted', '')} Esempi</button>`);
}
// Esempi pratici delle due colonne, su un nastro con tre opzioni. Statici: si
// leggono meglio di quelli costruiti sulle opzioni del modello, che possono
// essere ancora a metà.
const VAR_ESEMPI_COND = [
  ['L=3', 'solo sul nastro da 3 m'],
  ['L=4|5', 'sul 4 m oppure sul 5 m'],
  ['M!=S', 'con qualunque motore tranne lo standard'],
  ['L=5 & M=B', 'solo sul 5 m con il motore maggiorato'],
  ['L=4|5 & P=SI', 'su 4 o 5 m, e solo con la protezione'],
  ['(vuoto)', 'sempre'],
];
const VAR_ESEMPI_QTY = [
  ['L', 'un modulo per metro', '3 · 4 · 5'],
  ['L+1', 'un supporto in più dei metri', '4 · 5 · 6'],
  ['L*2', 'due gambe per metro', '6 · 8 · 10'],
  ['L*0,5+1', 'i decimali con la virgola', '2,5 · 3 · 3,5'],
  ['M(S=2; B=3)', 'cuscinetti: 2 col motore standard, 3 col maggiorato', 'S → 2 · B → 3'],
  ['M(B=1)', 'un rinforzo solo col maggiorato: le scelte non scritte valgono 0', 'S → 0 · B → 1'],
  ['L(3=1; 4=2; 5=2)', 'quantità per scelta anche su un\'opzione numerica', '1 · 2 · 2'],
  ['L*M(S=1; B=2)', 'si combinano: per metro, e doppi col maggiorato', 'L=4, B → 8'],
];
function varEsempiModal() {
  const righe = (rr, n) => rr.map(r => `<tr><td style="font-family:var(--mono);white-space:nowrap;font-variant-ligatures:none">${esc(r[0])}</td>${r.slice(1, n).map((x, j) => `<td${j === 1 ? ' style="white-space:nowrap"' : ''}>${esc(x)}</td>`).join('')}</tr>`).join('');
  openModal(`<h3>${ico('file', 'tinted pill', '')} Esempi di regole</h3>
    <p class="empty-text" style="text-align:left;padding:0 0 10px">Un nastro con tre opzioni: <strong>L</strong> lunghezza (3, 4, 5), <strong>M</strong> motore (S standard, B maggiorato), <strong>P</strong> protezione (SI, NO).</p>
    <h4 style="margin:6px 0">Vale solo se: il gruppo entra o no</h4>
    <div class="table-wrap"><table class="price-table"><thead><tr><th scope="col">Scrivi</th><th scope="col">Il gruppo entra</th></tr></thead><tbody>${righe(VAR_ESEMPI_COND, 2)}</tbody></table></div>
    <p class="empty-text" style="text-align:left;padding:6px 0 10px"><code>|</code> vuol dire «oppure», <code>&amp;</code> «e», <code>!=</code> «diverso da».</p>
    <h4 style="margin:6px 0">Quantità da formula: quanti gruppi entrano</h4>
    <div class="table-wrap"><table class="price-table"><thead><tr><th scope="col">Scrivi</th><th scope="col">Cosa vuol dire</th><th scope="col">Risultato</th></tr></thead><tbody>${righe(VAR_ESEMPI_QTY, 3)}</tbody></table></div>
    <p class="empty-text" style="text-align:left;padding:6px 0 10px">Numeri, <code>+ - * /</code> e parentesi. Un'opzione a lettere si usa solo con la tabella <code>M(S=2; B=3)</code>. Se il risultato è 0 il gruppo non entra; se è negativo la generazione si ferma e dice quale riga. I due campi si combinano: <em>Vale solo se</em> <code>P=SI</code> con formula <code>L</code> mette un pannello per metro, solo con la protezione.</p>
    <div class="modal-actions"><button class="add-btn-sm" onclick="closeModal()">Chiudi</button></div>`, true);
}
function varRegolaSet(id, i, campo, valore) {
  if (!roleGuard('bom')) return;
  const t = getItem(id); const c = t && t.components && t.components[i];
  if (!c) return;
  const v = String(valore || '').trim();
  const err = campo === 'cond' ? varControllaRiga(v, '') : varControllaRiga('', v);
  if (err) { showToast(err, 'error'); renderVarianti(); return; }
  // Un codice che il modello non ha: si dice subito, invece che al Genera.
  const codici = new Set((t.options || []).map(o => varCodice(o.code)));
  const citati = campo === 'cond' ? varCondParse(v).map(x => x.code) : varFormulaCodici(v);
  const ignoti = citati.filter(k => !codici.has(k));
  if (ignoti.length) { showToast(`Il modello non ha l'opzione ${ignoti[0]}`, 'error'); renderVarianti(); return; }
  if (campo === 'qtyExpr') {
    for (const tab of varFormulaTabelle(v)) {
      const o = varOpzioni(t).find(x => varCodice(x.code) === tab.code);
      const ok = new Set((o ? o.choices : []).map(c => varValore(c.value).toLowerCase()));
      const fuori = tab.valori.find(x => !ok.has(x.toLowerCase()));
      if (fuori) { showToast(`${tab.code} non ha la scelta «${fuori}»`, 'error'); renderVarianti(); return; }
    }
  }
  if (v) c[campo] = v; else delete c[campo];
  touch(t);
  saveDB();
  renderVarianti();
}
function varTogliCondizioni(id) {
  if (!roleGuard('bom')) return;
  const it = getItem(id); if (!it) return;
  askConfirm(`Togliere condizioni e formule dalle righe di ${it.code}? Le righe restano, e valgono sempre.`, () => {
    (it.components || []).forEach(c => { delete c.cond; delete c.qtyExpr; });
    touch(it);
    saveDB();
    renderVarianti();
    savedToast('Condizioni tolte');
  });
}

// ── 3. Configura ──
function varSezioneConfigura(t) {
  if (!varModello(t)) return varSezione('eye', 'Configura', null, '<p class="empty-text" style="text-align:left">Per configurare serve almeno un\'opzione con delle scelte.</p>');
  const r = varIntervalloCosto(t);
  const campi = varOpzioni(t).map(o => `<div class="modal-field"><label>${esc(o.name || o.code)} <span class="empty-text" style="padding:0">(${esc(varCodice(o.code))})</span></label>
    <select class="var-scelta" data-code="${esc(varCodice(o.code))}" onchange="varConfiguraAnteprima()">${o.choices.map(c => `<option value="${esc(c.value)}">${esc(c.label ? `${c.label} (${c.value})` : c.value)}</option>`).join('')}</select></div>`).join('');
  return varSezione('eye', 'Configura', null, `
    <p class="empty-text" style="text-align:left;padding:0 0 8px">${r ? `Costo da <strong>${fmtN(r.min)}</strong> a <strong>${fmtN(r.max)}</strong> su ${r.n} combinazioni.` : 'Troppe combinazioni per calcolare l\'intervallo di costo.'}</p>
    <div class="modal-grid">${campi}</div>
    <div id="varconf-prev" style="margin-top:10px"></div>
    ${canWrite('bom') ? `<div style="margin-top:10px"><button class="add-btn-sm" id="varconf-ok" onclick="varConfiguraGenera()">Genera la macchina</button></div>` : ''}`);
}
function varScelteDalForm() {
  const s = {};
  document.querySelectorAll('.var-scelta').forEach(el => { s[el.getAttribute('data-code')] = el.value; });
  return s;
}
function varConfiguraAnteprima() {
  const host = document.getElementById('varconf-prev');
  const t = getItem(currentVarId);
  if (!host || !varModello(t)) return;
  const prep = varPrepara(t.id, varScelteDalForm());
  const ok = document.getElementById('varconf-ok');
  if (prep.errori.length) {
    host.innerHTML = `<div class="mrp-warn">${prep.errori.map(e => `<div>${ico('warning', 'tinted', '')} ${esc(e)}</div>`).join('')}</div>`;
    if (ok) ok.disabled = true;
    return;
  }
  if (ok) { ok.disabled = false; ok.textContent = prep.esistente ? 'Apri la macchina' : 'Genera la macchina'; }
  if (prep.esistente) {
    host.innerHTML = `<p>Questa combinazione esiste già: <strong>${esc(prep.esistente.code)}</strong> ${esc(prep.esistente.name)}.</p>`;
    return;
  }
  const m = prep.macchina;
  host.innerHTML = `<p style="margin:0 0 6px">Nascerà <strong style="font-family:var(--mono)">${esc(m.code)}</strong> ${esc(m.name)} · costo <strong>${fmtN(varCostoScelte(t.id, prep.scelte).total)}</strong></p>
    <div class="table-wrap"><table class="price-table"><thead><tr><th scope="col">Codice</th><th scope="col">Gruppo</th><th scope="col" style="text-align:right">Q.tà</th></tr></thead><tbody>
    ${m.components.map(c => { const g = getItem(c.itemId); return `<tr><td style="font-family:var(--mono)">${esc(g ? g.code : '?')}</td><td>${esc(g ? g.name : '')}</td><td style="text-align:right;font-family:var(--mono)">${esc(String(c.qty))}</td></tr>`; }).join('')}
    </tbody></table></div>`;
}
function varConfiguraGenera() {
  const t = getItem(currentVarId);
  if (!t) return;
  varGenera(t.id, varScelteDalForm(), r => {
    savedToast(r.riusata ? `La macchina ${r.item.code} c'era già` : `Generata ${r.item.code}`);
    if (r.riusata) { currentBomId = r.item.id; bomExpanded = new Set(); setView('bom'); }
    else renderVarianti();
  });
}

// ── 4. Varianti generate ──
function varSezioneGenerate(t) {
  const gen = varGenerateDa(t.id).filter(x => x.type === 'macchina').sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const vecchie = gen.filter(varModelloAggiornato);
  const scrivibile = canWrite('bom');
  const tab = gen.length ? `<table class="price-table"><thead><tr><th scope="col">Codice</th><th scope="col">Scelte</th><th scope="col" style="text-align:right">Costo</th><th scope="col">Stato</th><th scope="col"></th></tr></thead><tbody>
    ${gen.map(x => {
      const vecchia = varModelloAggiornato(x);
      return `<tr><td style="font-family:var(--mono)">${codeLink(x.id, x.code)}</td>
        <td>${esc(x.configChoices ? (varEtichetteScelte(t, x.configChoices) || varChiaveScelte(x.configChoices)) : '')}</td>
        <td style="text-align:right;font-family:var(--mono)">${fmtN(costOf(x.id).total)}</td>
        <td>${vecchia ? `<span class="mrp-warn">${ico('warning', 'tinted', '')} modello cambiato</span>` : '<span class="price-best">aggiornata</span>'}</td>
        <td style="white-space:nowrap"><button class="mini-btn" title="Apri la distinta" onclick="currentBomId='${x.id}';bomExpanded=new Set();setView('bom')">${ico('eye', 'tinted', 'Apri la distinta')}</button>
          ${vecchia && scrivibile ? `<button class="btn-outline" onclick="varRigeneraUI(['${x.id}'])">Rigenera</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table>`
    : '<p class="empty-text" style="text-align:left;padding:8px">Nessuna macchina generata da questo modello.</p>';
  return varSezione('package', 'Varianti generate', gen.length, `<div class="cycle-box">${tab}</div>`,
    vecchie.length > 1 && scrivibile ? `<button class="add-btn-sm" onclick="varRigeneraTutte('${t.id}')">Rigenera tutte (${vecchie.length})</button>` : '');
}
function varRigeneraTutte(id) { varRigeneraUI(varGenerateDa(id).filter(varModelloAggiornato).map(x => x.id)); }
function varRigeneraUI(ids) {
  const macchine = (ids || []).map(getItem).filter(Boolean);
  if (!macchine.length) return;
  const chi = macchine.length === 1 ? macchine[0].code : `${macchine.length} macchine`;
  askConfirm(`Riscrivere la distinta di ${chi} dal modello di adesso, con le stesse scelte? Il codice resta lo stesso, quindi piani e movimenti non cambiano. Se ti serve tenere traccia della distinta di prima, rilascia prima una revisione.`, () => {
    const fatte = macchine.filter(m => varRigenera(m.id));
    if (fatte.length) savedToast(fatte.length === 1 ? `Distinta di ${fatte[0].code} rigenerata` : `${fatte.length} distinte rigenerate`);
    renderVarianti();
  });
}

// ── Nuovo modello ──
// Una macchina diventa modello quando le si dà la prima opzione. Si sceglie
// fra quelle che non sono già modelli né generate.
function varNuovoModelloModal() {
  if (!roleGuard('bom')) return;
  const libere = (db.items || []).filter(i => i.type === 'macchina' && !i.configuredFromId && !varInPagina(i))
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
  if (!libere.length) { showToast('Nessuna macchina da trasformare in modello: creane una in Articoli di progetto', 'error'); return; }
  openModal(`<h3>${ico('tree', 'tinted pill', '')} Nuovo modello</h3>
    <p class="empty-text" style="text-align:left;padding:0 0 10px">Scegli la macchina che fa da modello. La sua distinta resta com'è: dopo aggiungi le opzioni e scrivi le regole sulle sue righe.</p>
    <div class="modal-field"><label>Macchina</label><select id="var-nuovo" class="sel-cerca">${libere.map(m => `<option value="${m.id}">${esc(m.code + ' — ' + m.name)}</option>`).join('')}</select></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="varNuovoModello(val('var-nuovo'))">Crea il modello</button></div>`);
}
function varNuovoModello(id) {
  if (!roleGuard('bom')) return;
  const it = getItem(id);
  if (!it || it.type !== 'macchina' || it.configuredFromId || varInPagina(it)) return;
  it.options = [{ code: 'A', name: '', choices: [] }];
  touch(it);
  saveDB();
  closeModal();
  currentVarId = id;
  renderVarianti();
  savedToast(`${it.code} è un modello: aggiungi le scelte della prima opzione`);
}

// ── Modifica delle opzioni ──
function varOpzioniMuta(id, fn) {
  if (!roleGuard('bom')) return;
  const it = getItem(id); if (!it || it.configuredFromId) return;
  if (!Array.isArray(it.options)) it.options = [];
  if (fn(it) === false) { renderVarianti(); return; }
  if (!it.options.length) delete it.options;
  touch(it);
  saveDB();
  renderVarianti();
}
function varOpzioneAggiungi(id) {
  varOpzioniMuta(id, it => {
    const usati = new Set(it.options.map(o => varCodice(o.code)));
    let k = 'A';
    for (let n = 0; usati.has(k); n++) k = String.fromCharCode(65 + (n + 1) % 26) + (n >= 25 ? Math.floor(n / 25) : '');
    it.options.push({ code: k, name: '', choices: [] });
  });
}
function varOpzioneTogli(id, i) {
  const it = getItem(id); if (!it || !it.options || !it.options[i]) return;
  const ultima = it.options.length === 1;
  const fai = () => varOpzioniMuta(id, x => { x.options.splice(i, 1); });
  if (ultima) askConfirm(`È l'ultima opzione: togliendola ${it.code} smette di essere un modello e sparisce da questa pagina. Le regole scritte sulle sue righe restano, ma non valgono più.`, fai);
  else fai();
}
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
      if (/[|&=!]/.test(v)) { showToast('Il valore non può contenere | & = !: sono i segni delle regole', 'error'); return false; }
      if (v && o.choices.some((x, k) => k !== j && varValore(x.value).toLowerCase() === v.toLowerCase())) { showToast(`C'è già la scelta ${v}`, 'error'); return false; }
      c.value = v;
    } else c.label = v;
  });
}
