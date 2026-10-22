// ═══════════════════════════════════════════════════════════
//  BOMTRACK — cloud.js (archivio condiviso su Supabase, dalla 0.103.0)
// ═══════════════════════════════════════════════════════════
// Il pezzo che mancava al piano di docs/cloud-schema.md: lo schema, le due
// funzioni di sincronizzazione e i permessi stanno in supabase/schema.sql,
// la traduzione delle righe in cloud-map.js, il conto delle modifiche in
// store.js. Qui c'è la rete: l'accesso, l'invio, la ricezione.
//
// ── Come lavora ──
// L'archivio locale resta dov'è e resta quello che le viste leggono e
// scrivono, in modo sincrono come sempre: nessuna vista sa che esiste un
// server. Diventa lo **specchio** dell'archivio condiviso e la **coda** di
// quello che non è ancora partito.
//  - Ogni salvataggio riuscito programma un invio (Store.dopoCommit), con un
//    attimo di attesa per raccogliere i salvataggi ravvicinati in un lotto.
//    Un lotto di Store.takeChanges() è **una** chiamata a push_changes(), mai
//    spezzata: è una transazione, ed è ciò che tiene insieme una dichiarazione
//    di produzione e i movimenti che genera.
//  - Ogni 25 secondi, al ritorno sulla finestra e al ritorno della rete si
//    chiede al server che cosa è cambiato (pull_changes). Si applica solo
//    quando non c'è niente in sospeso e nessuno sta scrivendo in una scheda o
//    in un campo: un ridisegno in mezzo a un ordine a metà perderebbe il
//    lavoro. Si riprova al giro dopo.
//  - Senza collegamento si consulta soltanto (dalla 0.104.0): canWrite() dice
//    di no a tutti, e un banner lo spiega. Numeri dei documenti e codici degli
//    articoli li assegna il server prima di usarli (conNumeri,
//    conCodiceImpegnato), e un PC al buio non potrebbe chiederli. Le modifiche
//    rimaste in coda da prima aspettano, e la fotografia dell'ultimo invio
//    riuscito è salvata: anche chiudendo la finestra non si perdono, e partono
//    al ritorno della rete.
//
// ── Niente librerie ──
// supabase-js non serve: l'app usa quattro indirizzi di Auth e tre funzioni
// RPC, e fetch() basta. Una libreria in meno da tenere in vendor/, e niente
// che cambi sotto i piedi.
//
// ── Le chiavi ──
// L'indirizzo del progetto e la chiave **pubblica** (anon) stanno su ogni PC,
// in localStorage, inseriti dall'amministratore o arrivati con il link di
// collegamento. Non sono un segreto — Supabase le pensa per stare nel browser,
// e a proteggere i dati sono le policy — ma non stanno nel codice: il codice è
// lo stesso per tutti, il progetto no. La chiave di servizio non passa mai di qui.

const CLOUD_KEY = 'bomtrack_cloud';                 // { url, chiave, allineato, since }
const CLOUD_SESS_KEY = 'bomtrack_cloud_sessione';   // la sessione di Supabase Auth
const CLOUD_BASE_KEY = 'bomtrack_cloud_base';       // la fotografia dell'ultimo invio riuscito
const CLOUD_SCOLLEGATO_KEY = 'bomtrack_scollegato_da';   // { id } dell'amministratore che ha scollegato
const CLOUD_GIRO_MS = 25000;
const CLOUD_ATTESA_MS = 1500;
const CLOUD_RIPROVA_MS = 5000;   // senza collegamento: ogni quanto si riprova
const CLOUD_LIMITE_MS = 90000;   // una richiesta senza risposta dopo questo vale come rete assente
// Il pull riparte da un po' prima dell'ultimo: una transazione lunga può
// scrivere un synced_at più vecchio di un pull già fatto. Il server già
// risponde con l'inizio della transazione aperta più vecchia (pull_istante in
// schema.sql); il margine copre uno schema di prima e un invio che dura più
// del limite di Supabase per una richiesta (8 secondi). Fino alla 0.105.4 era
// 5 secondi: le righe scritte all'inizio di un invio più lungo sfuggivano.
const CLOUD_MARGINE_MS = 15000;
const CLOUD_PULIZIA_MS = 6 * 3600 * 1000;   // ogni quanto un PC ricorda al server di pulire

function cloudLeggi(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
function cloudScrivi(k, v) {
  try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); return true; }
  catch (e) { return false; }
}
let _cloudConfigTesto = null, _cloudConfigLetta = null;
function cloudConfig() {
  // Si rilegge solo se il testo è cambiato: canWrite() passa di qui spesso.
  let t = null;
  try { t = localStorage.getItem(CLOUD_KEY); } catch (e) { t = null; }
  if (t !== _cloudConfigTesto) { _cloudConfigTesto = t; _cloudConfigLetta = cloudLeggi(CLOUD_KEY); }
  const c = _cloudConfigLetta;
  return c && c.url && c.chiave ? Object.assign({}, c) : null;
}
function cloudAttivo() { return !!cloudConfig(); }
function cloudAggiornaConfig(campi) { const c = cloudConfig(); if (c) cloudScrivi(CLOUD_KEY, Object.assign(c, campi)); }
// Indirizzo pulito: niente barra finale, niente percorso dopo il dominio.
function cloudNormalizzaUrl(u) {
  let s = String(u || '').trim();
  if (s && !/^https?:\/\//i.test(s)) s = 'https://' + s;
  try { const x = new URL(s); return x.origin; } catch (e) { return ''; }
}

// Il modo condiviso si decide **prima** che l'archivio venga caricato
// (store.js, modoCondiviso): accende le date sulle righe figlie e i
// ricevimenti come eventi.
if (typeof Store !== 'undefined' && cloudAttivo()) Store.modoCondiviso = true;

// ═══════════════════════════════════════════════════════════
//  Rete
// ═══════════════════════════════════════════════════════════
// Un errore che sa dire che cosa è successo: `rete` (non si arriva al
// server), `accesso` (la sessione non vale più), `permesso` (il ruolo non
// scrive), `server` (il server ha rifiutato, con il suo messaggio).
function cloudErrore(tipo, messaggio, extra) {
  const e = new Error(messaggio);
  e.cloud = tipo;
  return Object.assign(e, extra || {});
}
async function cloudHttp(percorso, opz) {
  const c = cloudConfig();
  if (!c) throw cloudErrore('config', 'Archivio condiviso non configurato');
  const o = opz || {};
  const headers = { apikey: c.chiave, 'Content-Type': 'application/json' };
  if (o.token) headers.Authorization = 'Bearer ' + o.token;
  // Una richiesta che non torna più (una connessione rimasta a metà dopo uno
  // standby, il Wi-Fi che cambia) teneva fermo il giro e ogni «Nuovo documento»
  // in attesa del numero: il browser non mette limiti di tempo a fetch. Dopo
  // CLOUD_LIMITE_MS vale come rete assente (dalla 0.105.3).
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const scade = ctrl ? setTimeout(() => ctrl.abort(), CLOUD_LIMITE_MS) : null;
  let r;
  try {
    r = await fetch(c.url + percorso, { method: o.metodo || 'POST', headers, body: o.corpo === undefined ? undefined : JSON.stringify(o.corpo),
      signal: ctrl ? ctrl.signal : undefined });
  } catch (e) {
    clearTimeout(scade);
    // La funzione degli utenti che manca o che si ferma all'avvio risponde
    // senza le intestazioni CORS: il browser lo fa passare per un errore di
    // rete. Il database però c'è, e l'app non va messa in sola lettura.
    if (percorso.startsWith('/functions/')) throw cloudErrore('server', 'La funzione bomtrack-utenti non risponde: controlla in Supabase, Edge Functions, che sia pubblicata con questo nome esatto e guarda i suoi Logs');
    cloudCollegato(false);
    throw cloudErrore('rete', 'Server non raggiungibile');
  }
  cloudCollegato(true);   // ha risposto: anche un errore vuol dire che c'è
  let testo;
  try { testo = await r.text(); }
  catch (e) { cloudCollegato(false); throw cloudErrore('rete', 'Server non raggiungibile'); }
  finally { clearTimeout(scade); }
  let dati = null;
  try { dati = testo ? JSON.parse(testo) : null; } catch (e) { dati = testo; }
  if (!r.ok) {
    const msg = (dati && (dati.error_description || dati.msg || dati.message || dati.error)) || ('HTTP ' + r.status);
    // PGRST202: la funzione chiamata non c'è. Succede quando sul progetto è
    // stato eseguito uno schema.sql più vecchio dell'app.
    // La funzione degli utenti non pubblicata (Supabase risponde 404).
    if (r.status === 404 && percorso.startsWith('/functions/')) throw cloudErrore('server', 'La funzione bomtrack-utenti non è pubblicata sul progetto Supabase: vedi il manuale, «Pubblicare la funzione degli utenti»', { stato: 404 });
    if (dati && dati.code === 'PGRST202') throw cloudErrore('server', 'Lo schema del progetto Supabase non è aggiornato: riesegui supabase/schema.sql di questa versione nel SQL Editor', { stato: r.status, codice: 'PGRST202' });
    if (r.status === 401) throw cloudErrore('accesso', msg, { stato: r.status });
    if (r.status === 403 || (dati && dati.code === '42501')) throw cloudErrore('permesso', msg, { stato: r.status });
    throw cloudErrore('server', msg, { stato: r.status, codice: dati && dati.code, dettagli: dati && dati.details });
  }
  return dati;
}

// ── Sessione di Supabase Auth ──
function cloudSessione() { return cloudLeggi(CLOUD_SESS_KEY); }
function cloudSalvaSessione(s) {
  if (!s || !s.access_token) { cloudScrivi(CLOUD_SESS_KEY, null); return null; }
  const x = {
    access_token: s.access_token, refresh_token: s.refresh_token,
    expires_at: s.expires_at || (Math.floor(Date.now() / 1000) + (Number(s.expires_in) || 3600)),
    user: s.user ? { id: s.user.id, email: s.user.email } : null,
    // L'ultimo uso, per la durata della sessione (Gestione → Accesso): un
    // rinnovo avviene solo con l'app aperta, ed è uso anche quello.
    ts: nowISO(),
  };
  cloudScrivi(CLOUD_SESS_KEY, x);
  return x;
}
async function cloudAccediConPassword(email, password) {
  const s = await cloudHttp('/auth/v1/token?grant_type=password', { corpo: { email, password } });
  return cloudSalvaSessione(s);
}
// Un rinnovo alla volta: due chiamate che rinnovano insieme consumerebbero lo
// stesso refresh token, e la seconda verrebbe rifiutata.
let _cloudRinnovo = null;
function cloudRinnova() {
  if (_cloudRinnovo) return _cloudRinnovo;
  const s = cloudSessione();
  if (!s || !s.refresh_token) return Promise.reject(cloudErrore('accesso', 'Sessione assente'));
  _cloudRinnovo = cloudHttp('/auth/v1/token?grant_type=refresh_token', { corpo: { refresh_token: s.refresh_token } })
    .then(n => cloudSalvaSessione(Object.assign({ user: s.user }, n)))
    .catch(e => {
      // Rifiutato dal server: la sessione è finita davvero. Senza rete invece
      // resta, e si riprova al prossimo giro. Così anche quando Auth risponde
      // ma sta male (dalla 0.105.6): un 5xx durante un guasto di Supabase, un
      // 429 per troppe richieste. Prima valevano come rifiuto, e in un'ora ogni
      // PC tornava alla schermata d'accesso, senza nemmeno la copia locale da
      // consultare. Finita è solo una sessione che Auth rifiuta (400, 401, 403).
      if (cloudRinnovoPasseggero(e)) throw cloudErrore('server', 'Il servizio di accesso di Supabase non risponde come dovrebbe (' + (e.stato ? 'HTTP ' + e.stato : e.message) + '): si riprova al prossimo giro', { stato: e.stato });
      if (e.cloud !== 'rete') { cloudScrivi(CLOUD_SESS_KEY, null); throw cloudErrore('accesso', 'Sessione scaduta: accedi di nuovo'); }
      throw e;
    })
    .finally(() => { _cloudRinnovo = null; });
  return _cloudRinnovo;
}
function cloudRinnovoPasseggero(e) {
  const s = Number(e && e.stato);
  return s >= 500 || s === 429 || s === 408;
}
async function cloudToken() {
  let s = cloudSessione();
  if (!s) throw cloudErrore('accesso', 'Accesso richiesto');
  if (!s.expires_at || s.expires_at * 1000 - 60000 < Date.now()) s = await cloudRinnova();
  return s.access_token;
}
// Una chiamata come l'utente. Un 401 a token appena controllato vuol dire
// che il server lo considera scaduto: si rinnova una volta e si riprova.
async function cloudRpc(fn, argomenti) {
  const chiama = async () => cloudHttp('/rest/v1/rpc/' + fn, { token: await cloudToken(), corpo: argomenti || {} });
  try { return await chiama(); }
  catch (e) {
    if (e.cloud !== 'accesso' || !cloudSessione()) throw e;
    await cloudRinnova();
    return chiama();
  }
}
// La funzione degli utenti (supabase/functions/bomtrack-utenti): crea un
// collega o genera un link per reimpostargli la password. Come cloudRpc, un
// token rifiutato si rinnova una volta.
async function cloudUtenti(corpo) {
  const ritorno = typeof location !== 'undefined' && /^https?:/.test(location.protocol || '') ? location.origin + location.pathname : undefined;
  const chiama = async () => cloudHttp('/functions/v1/bomtrack-utenti', { token: await cloudToken(), corpo: Object.assign({ ritorno }, corpo) });
  let r;
  try { r = await chiama(); }
  catch (e) {
    if (e.cloud !== 'accesso' || !cloudSessione()) throw e;
    await cloudRinnova();
    r = await chiama();
  }
  // Una funzione con quel nome ma con un altro codice (il «Hello world» che
  // Supabase propone creandola) risponde 200 senza link.
  if (!r || typeof r.link !== 'string' || !r.link) throw cloudErrore('server', 'La funzione bomtrack-utenti risponde, ma non con il codice di Bomtrack: in Supabase, Edge Functions, aprila, sostituisci tutto il codice con il file supabase/functions/bomtrack-utenti/index.ts e premi Deploy');
  return r;
}
async function cloudAggiornaPassword(password) {
  return cloudHttp('/auth/v1/user', { metodo: 'PUT', token: await cloudToken(), corpo: { password } });
}
// Il link dell'email torna al «Site URL» del progetto: è lì che va messo il
// link di collegamento (cloudPannello). Un redirect_to esplicito dovrebbe
// stare anche nell'elenco degli indirizzi ammessi, e sarebbe un posto in più
// da tenere allineato.
async function cloudRecuperaPassword(email) {
  return cloudHttp('/auth/v1/recover', { corpo: { email } });
}
// Solo la sessione di questo PC (dalla 0.105.6): senza `scope`
// Supabase la intende «global» e revoca ogni sessione dello stesso utente.
// Un «Esci» su un terminale dell'officina, entro un'ora, rimandava alla
// schermata d'accesso l'altro terminale con lo stesso account.
async function cloudEsci() {
  const s = cloudSessione();
  cloudScrivi(CLOUD_SESS_KEY, null);
  if (s && s.access_token) { try { await cloudHttp('/auth/v1/logout?scope=local', { token: s.access_token }); } catch (e) { /* la sessione locale è già andata */ } }
}

// ═══════════════════════════════════════════════════════════
//  Invio
// ═══════════════════════════════════════════════════════════
// Il lotto di Store.takeChanges() nella forma di push_changes(). Funzione pura
// rispetto alla rete: si prova senza server.
//  - le radici portano `pos`, la loro posizione nella collezione **intera**
//    (dbVersoCloud la calcolerebbe sul solo lotto);
//  - le righe figlie «per riga» di un padre già noto al server viaggiano solo
//    se cambiate dall'ultimo invio: mandarle tutte farebbe risultare
//    respinte, come un conflitto, righe che un collega ha cambiato e che qui
//    nessuno ha toccato. Un padre nuovo le manda tutte. «Cambiate» vuol dire
//    diverse dalla fotografia dell'ultimo invio (dalla 0.105.6), e partono con
//    la loro versione di partenza, come le radici. Prima si guardava la data
//    contro l'ora dell'ultimo invio, meno un margine: una riga cambiata con
//    l'orologio del PC rimesso indietro aveva una data prima di quell'ora e
//    non partiva più. Il secondo argomento (la vecchia soglia) non si usa più;
//  - le figlie «sostituite» (distinta, ciclo, lavorazioni) viaggiano intere:
//    è la regola del server;
//  - le impostazioni le scrive solo chi ha la gestione: altrimenti il server
//    rifiuterebbe l'intero lotto. Restano su questo PC, e lo si dice.
function cloudPayload(changes, _soglia, puoImpostazioni) {
  const upsert = {}, remove = {}, base = {};
  let impostazioniTenute = false;
  const aggiungi = (dove, t, righe) => { if (righe.length) dove[t] = (dove[t] || []).concat(righe); };
  Object.keys(changes || {}).forEach(c => {
    if (c === 'settings') return;
    const def = SCHEMA[c]; if (!def) return;
    const ch = changes[c];
    const figli = def.children || {};
    // Per id con una mappa, non con una ricerca per ciascuno: su un invio
    // completo erano decine di secondi a browser fermo (dalla 0.105.5).
    const ids = ch.upsert || [];
    const perId = ids.length > 20 ? new Map((Store.getAll(c) || []).map(r => [r.id, r])) : null;
    const recs = ids.map(id => perId ? perId.get(id) : Store.getById(c, id)).filter(Boolean);
    if (recs.length) {
      const posizioni = new Map((Store.getAll(c) || []).map((r, i) => [r.id, i]));
      const righe = dbVersoCloud({ [c]: recs });
      // Un insieme «sostituito» rimasto vuoto parte vuoto (dalla 0.106.1): il
      // server rifà l'insieme solo delle tabelle che l'invio nomina, e senza
      // la tabella le righe di prima restavano lì. Tolta l'ultima riga di un
      // ciclo, il pull dopo la riportava indietro.
      Object.keys(figli).forEach(k => {
        if (figli[k].merge === 'replace' && recs.some(x => Array.isArray(x[k]))) upsert[figli[k].table] = upsert[figli[k].table] || [];
      });
      Object.keys(righe).forEach(t => {
        let r = righe[t];
        if (t === def.table) r.forEach(x => {
          x.pos = posizioni.get(x.id);
          // La versione da cui è partita la modifica: se sul server intanto è
          // cambiata, la modifica è fatta su una copia vecchia e va respinta.
          const b = _cloud.senzaBase.has(x.id) ? null : Store.baseUpdatedAt(c, x.id);
          if (b) (base[t] = base[t] || {})[x.id] = b;
        });
        else {
          const k = Object.keys(figli).find(a => figli[a].table === t);
          if (k && figli[k].merge === 'row') {
            const colPadre = (CLOUD_TABLES[t] && CLOUD_TABLES[t].parent) || 'parent_id';
            const prima = new Map();   // padre → le sue righe nella fotografia
            r = r.filter(x => {
              const padre = x[colPadre];
              // Un padre ripristinato sopra la sua lapide (senzaBase) sul server
              // non ha più righe: la cancellazione le ha portate via. Partono tutte.
              if (_cloud.senzaBase.has(padre) || !x.updated_at) return true;
              if (!prima.has(padre)) prima.set(padre, Store.baseFigli(c, padre));
              const righe = prima.get(padre);
              if (!righe) return true;   // padre nuovo
              const era = righe.get(String(x.id));
              if (era === x.updated_at) return false;
              if (era) (base[t] = base[t] || {})[x.id] = era;
              return true;
            });
          }
        }
        aggiungi(upsert, t, r);
      });
    }
    aggiungi(remove, def.table, ch.remove || []);
    Object.keys(ch.removeChildren || {}).forEach(k => { if (figli[k]) aggiungi(remove, figli[k].table, ch.removeChildren[k]); });
  });
  const payload = {};
  if (Object.keys(upsert).length) payload.upsert = upsert;
  if (Object.keys(remove).length) payload.remove = remove;
  if (Object.keys(base).length) payload.base = base;
  if (changes && changes.settings) {
    if (puoImpostazioni) {
      payload.settings = { data: Store.getSettings(), updated_at: nowISO(), updated_by: Store.getActor() };
    } else impostazioniTenute = true;
  }
  return { payload, impostazioniTenute };
}
// ── I ripristini dal cestino (dalla 0.105.4) ──
// Un record ripristinato riparte datato adesso, più recente della lapide che
// la sua cancellazione ha lasciato sul server. Ma «adesso» è l'orologio di
// questo PC: se è indietro, la data resta prima della lapide e il server lo
// respingeva — il record tornava nel cestino al giro dopo, senza dire niente.
// Allora il ripristino si dichiara: `payload.ripristina` elenca, per tabella,
// gli id che l'invio rimanda per ripristino, e il server ne toglie la lapide.
// Si tengono nella configurazione finché un invio riuscito non li ha portati.
function cloudSegnaRipristino(tab, id) {
  if (!tab || id == null || !cloudAttivo()) return;
  const r = Object.assign({}, cloudConfig().ripristinati || {});
  r[tab] = Array.from(new Set((r[tab] || []).concat(String(id))));
  cloudAggiornaConfig({ ripristinati: r });
}
// Il gancio di Store.restore.
function onRipristino(coll, id) { if (SCHEMA[coll]) cloudSegnaRipristino(SCHEMA[coll].table, id); }
// Quelli che questo invio rimanda davvero: un id senza la sua riga
// nell'upsert non toglie niente.
function cloudRipristiniDi(payload) {
  const r = (cloudConfig() || {}).ripristinati || {}, fuori = {};
  Object.keys(r).forEach(t => {
    const inviati = new Set(((payload.upsert || {})[t] || []).map(x => String(x.id)));
    const ids = (r[t] || []).filter(id => inviati.has(id));
    if (ids.length) fuori[t] = ids;
  });
  return fuori;
}
// Dopo un invio riuscito: via quelli partiti, e quelli il cui record non c'è
// più (eliminato di nuovo). Gli altri — ripristinati mentre l'invio era in
// viaggio — aspettano il prossimo.
function cloudTogliRipristini(inviati) {
  const c = cloudConfig(); if (!c || !c.ripristinati) return;
  const r = {};
  Object.keys(c.ripristinati).forEach(t => {
    const dove = cloudDove(t), via = new Set((inviati && inviati[t]) || []);
    const ids = (c.ripristinati[t] || []).filter(id => {
      if (via.has(id)) return false;
      if (!dove) return false;
      if (!dove.figlio) return !!Store.getById(dove.coll, id);
      return (Store.getAll(dove.coll) || []).some(rec => (rec[dove.figlio] || []).some(x => x && String(x[dove.rowId]) === id));
    });
    if (ids.length) r[t] = ids;
  });
  cloudAggiornaConfig({ ripristinati: Object.keys(r).length ? r : null });
}
function cloudPayloadVuoto(p) { return !p.upsert && !p.remove && !p.settings; }  // `base` da sola non è un invio

// ── La fotografia salvata ──
// In IndexedDB, accanto all'archivio, dove c'è (dalla 0.105.5): in
// localStorage oltre qualche decina di migliaia di record non ci stava, e a
// ogni riavvio si rimandava tutto.
function cloudSalvaBase() {
  const b = Store.baseSalvabile();
  if (Store.salvaExtra('cloudBase', b)) {
    cloudScrivi(CLOUD_BASE_KEY, null);
    _cloud.baseNonSalvata = false;
    return;
  }
  if (!cloudScrivi(CLOUD_BASE_KEY, b)) {
    // Senza spazio la fotografia non si salva: al prossimo avvio si manda
    // tutto (il server tiene la versione più recente di ogni riga), ma le
    // cancellazioni fatte offline andrebbero perse. Si dice.
    _cloud.baseNonSalvata = true;
  } else _cloud.baseNonSalvata = false;
}

// ═══════════════════════════════════════════════════════════
//  Ricezione
// ═══════════════════════════════════════════════════════════
// Le righe di pull_changes() dentro l'archivio locale. Funzione pura su `d`
// (il db), si prova senza server. Restituisce quante cose sono cambiate.
//
// Le radici arrivano intere e sostituiscono il record locale, tenendone gli
// array figli: quelli arrivano dalle loro tabelle. Le figlie «sostituite»
// arrivano sempre con il padre e sempre tutte: l'insieme si rifà. Quelle «per
// riga» arrivano solo se cambiate: si fondono per id, al loro posto.
// Le lapidi tolgono i record e le righe. Le impostazioni si sostituiscono.
function cloudApplica(d, risposta) {
  const loc = righeLocali((risposta && risposta.tables) || {});
  let n = 0;
  // Le righe di documento con un ricevimento nuovo o cambiato. Solo quelle
  // (dalla 0.105.6): il margine di ricezione ripesca ogni volta gli ultimi
  // eventi, uguali a quelli che ci sono, e il ricevuto si toglieva lo stesso.
  // Con niente di cambiato non si ricalcolava né si salvava, la riga restava
  // senza ricevuto, e al giro dopo risultava modificata qui: partiva datata
  // adesso, sopra a un'eventuale modifica di un collega.
  const lineeRicevute = new Set();
  Object.keys(SCHEMA).forEach(c => {
    const def = SCHEMA[c];
    const figli = def.children || {};
    if (!Array.isArray(d[c])) d[c] = [];
    const arr = d[c];
    const indice = new Map(arr.map((x, i) => [x && x.id, i]));
    const vecchi = new Map();   // i record come erano prima, per dire se qualcosa è cambiato davvero
    // I campi che il server non ha (segreti, solo locali) non dicono niente.
    const soloQui = [].concat(def.secret || [], (CLOUD_TABLES[def.table] || {}).drop || []);
    const senzaFigli = r => { const o = Object.assign({}, r); Object.keys(figli).concat(soloQui).forEach(k => delete o[k]); return o; };
    ordinaPerPos(loc[def.table] || []).forEach(riga => {
      const rec = Object.assign({}, riga);
      delete rec.pos; delete rec.childSets;
      const dichiarati = riga.childSets != null ? String(riga.childSets).split(',').filter(Boolean) : null;
      const i = indice.get(rec.id);
      const vecchio = i != null ? arr[i] : null;
      if (vecchio) vecchi.set(rec.id, Object.assign({}, vecchio));
      Object.keys(figli).forEach(k => {
        const presente = dichiarati ? dichiarati.includes(k) : !!(vecchio && Array.isArray(vecchio[k]));
        if (!presente) return;
        rec[k] = figli[k].merge === 'replace' ? [] : ((vecchio && Array.isArray(vecchio[k])) ? vecchio[k] : []);
      });
      // Uguale a quello che c'è: resta lui, con i suoi campi solo locali. Gli
      // insiemi «sostituiti» si rifanno comunque, e si contano sotto.
      if (vecchio && cloudUguali(senzaFigli(vecchio), senzaFigli(rec))) {
        Object.keys(figli).forEach(k => { if (figli[k].merge === 'replace' && Array.isArray(rec[k])) vecchio[k] = rec[k]; });
        return;
      }
      if (i != null) arr[i] = rec; else { indice.set(rec.id, arr.length); arr.push(rec); }
      if (def.table === 'order_receipts' && rec.lineId) lineeRicevute.add(rec.lineId);
      n++;
    });
    Object.keys(figli).forEach(k => {
      const cdef = figli[k];
      // Un insieme «sostituito» si rifà da capo: è cambiato se non è lo stesso di prima.
      // Di solito l'insieme arriva con il suo padre, che il giro qui sopra ha
      // già svuotato. Non sempre (dalla 0.105.6): pull_changes legge una tabella
      // alla volta, e un invio di un collega che si chiude fra la lettura degli
      // articoli e quella delle distinte porta le righe senza l'articolo. Si
      // aggiungevano a quelle che c'erano, e la distinta raddoppiava; salvata
      // così, il doppio partiva come distinta vera. L'insieme che arriva è
      // comunque intero: si rifà anche qui.
      const prima = new Map();
      if (cdef.merge === 'replace') (loc[cdef.table] || []).forEach(rr => {
        if (!indice.has(rr.parentId) || prima.has(rr.parentId)) return;
        if (vecchi.has(rr.parentId)) { prima.set(rr.parentId, vecchi.get(rr.parentId)); return; }
        const padre = arr[indice.get(rr.parentId)];
        if (!padre) return;
        prima.set(rr.parentId, { [k]: padre[k] });
        padre[k] = [];
      });
      ordinaPerPos(loc[cdef.table] || []).forEach(rr => {
        const i = indice.get(rr.parentId);
        const padre = i != null ? arr[i] : null;
        if (!padre) return;   // padre cancellato, o non ancora arrivato: lo porterà il suo giro
        const x = Object.assign({}, rr);
        delete x.parentId; delete x.pos;
        if (!cdef.rowId) delete x.id;
        if (!Array.isArray(padre[k])) padre[k] = [];
        if (cdef.merge === 'replace') padre[k].push(x);
        else {
          const j = padre[k].findIndex(y => y && y[cdef.rowId] === x[cdef.rowId]);
          // Uguale com'è (a parte i campi ricavati, che dal server tornano senza): resta quella che c'è.
          if (j >= 0) { if (!cloudUguali(padre[k][j], x, cdef.derived)) { padre[k][j] = x; n++; } }
          else { padre[k].splice(Math.min(Number.isFinite(rr.pos) ? rr.pos : Infinity, padre[k].length), 0, x); n++; }
        }
      });
      // Uguale a quello di prima: resta quello di prima. Non solo per contare:
      // la copia del server può differire in un '' o un null, e senza un
      // salvataggio che la fotografi risulterebbe una modifica da rimandare.
      prima.forEach((v, id) => {
        const padre = arr[indice.get(id)];
        if (v && Array.isArray(v[k]) && padre && cloudUguali(v[k], padre[k])) padre[k] = v[k];
        else n++;
      });
    });
  });
  // Il ricevuto di una riga è la somma dei suoi eventi: se ne arrivano di
  // nuovi, il numero che la riga porta in locale non vale più.
  if (lineeRicevute.size) {
    ['orders', 'workOrders'].forEach(c => (d[c] || []).forEach(o => (o && o.lines || []).forEach(l => {
      if (l && lineeRicevute.has(l.id)) delete l.received;
    })));
  }
  const tolti = (risposta && risposta.removed) || {};
  Object.keys(tolti).forEach(t => {
    const ids = new Set((tolti[t] || []).map(String));
    if (!ids.size) return;
    Object.keys(SCHEMA).forEach(c => {
      const def = SCHEMA[c];
      if (def.table === t) {
        const prima = (d[c] || []).length;
        d[c] = (d[c] || []).filter(r => !(r && ids.has(String(r.id))));
        n += prima - d[c].length;
      }
      const figli = def.children || {};
      Object.keys(figli).forEach(k => {
        if (figli[k].table !== t || !figli[k].rowId) return;
        (d[c] || []).forEach(r => {
          if (!r || !Array.isArray(r[k])) return;
          const prima = r[k].length;
          r[k] = r[k].filter(x => !(x && ids.has(String(x[figli[k].rowId]))));
          n += prima - r[k].length;
        });
      });
    });
  });
  if (risposta && risposta.settings && risposta.settings.data && typeof risposta.settings.data === 'object') {
    if (!cloudUguali(d.settings, risposta.settings.data)) { d.settings = risposta.settings.data; n++; }
  }
  return n;
}
// Lo stesso contenuto, a parte l'ordine delle chiavi (e un null o un '' valgono
// un campo che manca: il server li tratta allo stesso modo). `ignora`: campi
// del primo livello che non contano. Le righe ripescate dal
// margine di ricezione sono quasi sempre identiche a quelle che ci sono: un
// giro che non porta niente di nuovo non risalva l'archivio.
function cloudUguali(a, b, ignora) {
  if (a === b) return true;
  if (a == null || b == null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => cloudUguali(x, b[i]));
  const vale = (o, k) => o[k] != null && o[k] !== '' && !(ignora && ignora.includes(k));
  const ka = Object.keys(a).filter(k => vale(a, k)), kb = Object.keys(b).filter(k => vale(b, k));
  return ka.length === kb.length && ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && cloudUguali(a[k], b[k]));
}

// ═══════════════════════════════════════════════════════════
//  Il giro
// ═══════════════════════════════════════════════════════════
const _cloud = {
  inCorso: false, ancora: false, timer: null, intervallo: null,
  stato: 'spento',        // spento · ok · invio · attesa · offline · errore · accesso
  messaggio: '', ultimo: null, respinti: [], baseNonSalvata: false, impostazioniAvvisate: false,
  senzaBase: new Set(),   // record ripristinati: si rimandano senza versione di partenza
  doppiAvvisati: new Set(),
  collegato: false,       // l'ultima chiamata al server ha avuto risposta
  pausa: 0,               // > 0: niente giri (un import sta impegnando i suoi codici)
  numeri: Promise.resolve(),   // le prenotazioni di numeri, una alla volta
};
function cloudPronto() {
  const c = cloudConfig();
  return !!(c && c.allineato && cloudSessione() && typeof currentUser !== 'undefined' && currentUser);
}
// Si può ridisegnare la vista adesso? No se una scheda è aperta, se un
// documento ha modifiche non salvate, o se il cursore sta in un campo.
function cloudPuoApplicare() {
  if (typeof document === 'undefined') return true;
  if (typeof panelTop === 'function' && panelTop()) return false;
  if (typeof documentoInModifica === 'function' && documentoInModifica()) return false;
  const a = document.activeElement;
  if (a && a.closest && a.closest('#app-main') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;
  return true;
}
function cloudProgramma(ms) {
  if (!cloudPronto() || _cloud.applicando) return;
  clearTimeout(_cloud.timer);
  _cloud.timer = setTimeout(() => cloudGiro(), ms == null ? CLOUD_ATTESA_MS : ms);
}
async function cloudGiro() {
  if (!cloudPronto()) return false;
  if (_cloud.pausa) { cloudProgramma(1000); return false; }
  if (cloudSchedaSuperata()) {
    cloudSegna('errore', 'Bomtrack è aperto anche in un\'altra scheda: questa non si sincronizza più. Chiudila, o ricaricala');
    return false;
  }
  if (_cloud.inCorso) { _cloud.ancora = true; return false; }
  _cloud.inCorso = true;
  try {
    await cloudInvia();
    await cloudPulizia();
    if (!Store.hasPendingChanges()) await cloudRicevi();
    _cloud.ultimo = new Date();
    // I codici visti presi da un collega valgono un giro: se intanto li ha
    // restituiti tornano liberi, e se li tiene ancora il server lo ridice.
    _codiciAltrui.clear();
    cloudSegna(Store.hasPendingChanges() ? 'attesa' : 'ok');
    return true;
  } catch (e) {
    cloudGestisciErrore(e);
    return false;
  } finally {
    _cloud.inCorso = false;
    if (_cloud.ancora) { _cloud.ancora = false; cloudProgramma(0); }
  }
}
async function cloudInvia() {
  // Un lotto che il server rifiuta per un riferimento (un collega ha eliminato
  // qualcosa che qui si usa ancora, o qui si elimina qualcosa che un collega
  // usa) si ripara e si rimanda: altrimenti resterebbe in testa alla coda per
  // sempre, e niente — nemmeno il lavoro dopo — partirebbe più.
  for (let riparazioni = 0; ; riparazioni++) {
    try { return await cloudInviaLotto(); }
    catch (e) {
      if (riparazioni < 5 && e && e.codice === '23503' && await cloudRiparaRiferimento(e)) continue;
      if (riparazioni < 5 && e && e.codice === '23505' && await cloudRiparaNumeri(e)) continue;
      if (riparazioni < 5 && e && e.cloud === 'permesso' && cloudScartaNonPermessi(e)) continue;
      throw e;
    }
  }
}
// ── Un rifiuto per permesso (dalla 0.105.6) ──
// push_changes dice quali tabelle il ruolo non scrive («il ruolo acquisti non
// scrive: items»), e una policy quale tabella ha fermato la riga. Fino alla
// 0.105.5 il lotto restava in testa alla coda per sempre: ogni modifica
// legittima dopo restava ferma, e il PC smetteva anche di ricevere quelle dei
// colleghi (si riceve solo a coda vuota). Ora le modifiche a quelle tabelle si
// scartano — tornano come sul server, con una ricezione da capo — e il resto
// parte. Succede quando il ruolo è cambiato mentre questo PC lavorava, o quando
// una vista lascia passare un gesto che il ruolo non avrebbe.
function cloudTabelleNegate(e) {
  const msg = String((e && e.message) || '');
  const elenco = /non scrive:\s*(.+)$/.exec(msg);
  if (elenco) return elenco[1].split(',').map(s => s.trim()).filter(Boolean);
  const policy = /policy for table "([a-z_]+)"/.exec(msg);
  return policy ? [policy[1]] : [];
}
function cloudScartaNonPermessi(e) {
  const tabelle = cloudTabelleNegate(e);
  if (!tabelle.length) return false;
  const changes = Store.takeChanges().changes || {};
  const unita = cloudUnita(changes);
  const colls = new Set();
  let impostazioni = false;
  tabelle.forEach(t => {
    if (t === 'settings') { impostazioni = !!changes.settings; return; }
    const dove = cloudDove(t);
    if (dove) colls.add(dove.coll);
  });
  const via = unita.filter(u => colls.has(u.coll));
  if (!via.length && !impostazioni) return false;
  const nomi = cloudScartaUnita(via.concat(impostazioni ? [{ settings: true }] : []));
  showToast(`Il tuo ruolo non può modificare ${nomi.length === 1 ? '«' + nomi[0] + '»' : nomi.length + ' elementi'}: ${nomi.length === 1 ? 'la modifica è stata scartata e torna' : 'le modifiche sono state scartate e tornano'} come sul server. Il resto parte`, 'error');
  return true;
}
// ── Le unità di un lotto ──
// Un record con tutto quello che gli si fa in questo lotto: le sue righe, la
// sua eliminazione, le righe figlie tolte. È il pezzo più piccolo che si può
// mandare o scartare da solo. Le impostazioni sono un'unità a sé.
function cloudUnita(changes) {
  const per = new Map(), out = [];
  const prendi = (coll, id) => {
    const k = coll + '\u0000' + id;
    if (!per.has(k)) { const u = { coll, id, upsert: false, remove: false, figli: {} }; per.set(k, u); out.push(u); }
    return per.get(k);
  };
  Object.keys(changes || {}).forEach(c => {
    if (c === 'settings' || !SCHEMA[c]) return;
    const ch = changes[c];
    (ch.upsert || []).forEach(id => { prendi(c, id).upsert = true; });
    (ch.remove || []).forEach(id => { prendi(c, id).remove = true; });
    Object.keys(ch.removeChildren || {}).forEach(k => (ch.removeChildren[k] || []).forEach(r => {
      const padre = Store.padreInBase(c, k, r);
      if (padre == null) return;
      const u = prendi(c, padre);
      (u.figli[k] = u.figli[k] || []).push(r);
    }));
  });
  if (changes && changes.settings) out.push({ settings: true });
  return out;
}
// Le modifiche di alcune unità, nella forma di takeChanges().
function cloudChangesDi(unita) {
  const out = {};
  unita.forEach(u => {
    if (u.settings) { out.settings = true; return; }
    const o = out[u.coll] = out[u.coll] || { upsert: [], remove: [] };
    if (u.upsert) o.upsert.push(u.id);
    if (u.remove) o.remove.push(u.id);
    Object.keys(u.figli).forEach(k => {
      o.removeChildren = o.removeChildren || {};
      o.removeChildren[k] = (o.removeChildren[k] || []).concat(u.figli[k]);
    });
  });
  return out;
}
function cloudNomeUnita(u) {
  if (u.settings) return 'le impostazioni';
  const rec = Store.getById(u.coll, u.id) || ((db.trash || []).find(t => t && t.coll === u.coll && t.record && t.record.id === u.id) || {}).record;
  return cloudNomeDi(rec) || u.id;
}
// Scarta le unità (Store.scartaModifiche) e chiede una ricezione da capo, che
// rimette i record come sono sul server. Restituisce i nomi, presi prima.
function cloudScartaUnita(unita) {
  const nomi = unita.map(cloudNomeUnita);
  const perColl = {};
  unita.forEach(u => { if (!u.settings) (perColl[u.coll] = perColl[u.coll] || []).push(u.id); });
  Object.keys(perColl).forEach(c => Store.scartaModifiche(c, perColl[c]));
  if (unita.some(u => u.settings)) Store.scartaImpostazioni();
  if (Object.keys(perColl).length) cloudAggiornaConfig({ since: null });
  return nomi;
}

// ── «Scarta solo i rifiutati» (dalla 0.105.6) ──
// Quando il server rifiuta un lotto per un motivo che l'app non sa riparare,
// la sola uscita era «Scarta e riscarica»: via tutto il lavoro in attesa per
// un record solo. Qui il lotto parte a pezzi, nell'ordine delle dipendenze
// (prima i fornitori, poi gli ordini che li citano): un pezzo rifiutato si
// divide a metà finché non resta il record colpevole. Chi passa è inviato
// davvero (Store.assorbi lo toglie dalla coda); i rifiutati, dopo un secondo
// tentativo — un record può aver citato uno arrivato dopo di lui — si scartano
// e tornano come sul server. È un gesto esplicito di chi lavora: a pezzi una
// dichiarazione di produzione può partire senza i suoi movimenti, ma se uno
// dei due è rifiutato lo è anche l'altro, che lo cita.
async function cloudScartaRifiutati() {
  if (!cloudPronto()) return null;
  for (let i = 0; i < 40 && _cloud.inCorso; i++) await new Promise(r => setTimeout(r, 250));
  if (_cloud.inCorso) return null;
  _cloud.inCorso = true;
  let scartati = [];
  try {
    let preso = Store.takeChanges();
    if (!preso.changes) { Store.ripristinaBase({}); preso = Store.takeChanges(); }
    const { changes, mark } = preso;
    const ordine = t => { const i = CLOUD_ORDINE_CARICAMENTO.indexOf(t); return i < 0 ? CLOUD_ORDINE_CARICAMENTO.length : i; };
    const unita = cloudUnita(changes);
    const gruppi = new Map();
    unita.forEach(u => {
      const k = u.settings ? 'settings' : u.coll;
      if (!gruppi.has(k)) gruppi.set(k, []);
      gruppi.get(k).push(u);
    });
    const chiavi = Array.from(gruppi.keys()).sort((a, b) =>
      ordine(a === 'settings' ? 'zzz' : SCHEMA[a].table) - ordine(b === 'settings' ? 'zzz' : SCHEMA[b].table));
    const manda = async pezzo => {
      const { payload } = cloudPayload(cloudChangesDi(pezzo), null, canWriteRuolo('manage'));
      const ripristina = cloudRipristiniDi(payload);
      if (Object.keys(ripristina).length) payload.ripristina = ripristina;
      if (!cloudPayloadVuoto(payload)) {
        if (payload.settings) await cloudFondiImpostazioni(payload);
        cloudSegna('invio');
        const r = await cloudRpc('push_changes', { payload });
        if (r && Array.isArray(r.rejected) && r.rejected.length) cloudAvvisaRespinti(r.rejected);
      }
      cloudTogliRipristini(ripristina);
      const scelti = {};
      pezzo.forEach(u => {
        if (u.settings) scelti.settings = true;
        else { (scelti[u.coll] = scelti[u.coll] || []).push(u.id); _cloud.senzaBase.delete(u.id); }
      });
      Store.assorbi(mark, scelti);
    };
    const prova = async (pezzo, fuori) => {
      try { await manda(pezzo); }
      catch (e) {
        // Senza rete o senza sessione non si sa chi ha torto: ci si ferma.
        if (e && (e.cloud === 'rete' || e.cloud === 'accesso' || e.cloud === 'config')) throw e;
        if (pezzo.length === 1) { fuori.push(pezzo[0]); return; }
        const m = pezzo.length >> 1;
        await prova(pezzo.slice(0, m), fuori);
        await prova(pezzo.slice(m), fuori);
      }
    };
    const primi = [];
    for (const k of chiavi) await prova(gruppi.get(k), primi);
    for (const u of primi) await prova([u], scartati);
    if (scartati.length) {
      const nomi = cloudScartaUnita(scartati);
      showToast(`Il server non ha accettato ${nomi.length === 1 ? '«' + nomi[0] + '»' : nomi.length + ' elementi (' + nomi.slice(0, 5).join(', ') + (nomi.length > 5 ? '…' : '') + ')'}: ${nomi.length === 1 ? 'è tornato' : 'sono tornati'} come sul server. Il resto è partito`, 'error');
    }
    cloudSalvaBase();
  } catch (e) {
    cloudGestisciErrore(e);
    return null;
  } finally { _cloud.inCorso = false; }
  // Quello che lo scarto lascia da mandare (un cestino da svuotare), poi la
  // ricezione che rimette gli scartati.
  await cloudGiro();
  return { scartati: scartati.length };
}

// ── Le impostazioni di due amministratori (dalla 0.105.6) ──
// Le impostazioni partono intere, e il server le sovrascrive intere: un
// amministratore con la copia indietro (un pannello aperto, un campo col
// cursore dentro, e la ricezione aspetta) riportava indietro, senza dire
// niente, quello che un collega aveva appena cambiato. Prima di mandarle si
// guarda com'erano lassù: se un collega le ha cambiate dall'ultima volta, si
// manda la sua versione con sopra solo le voci cambiate qui. Sulla stessa
// voce vince chi manda per ultimo, come prima. Resta scoperto solo il tempo
// fra la lettura e l'invio; la ricezione dopo porta qui le voci del collega.
async function cloudFondiImpostazioni(payload) {
  const base = Store.baseImpostazioni();
  if (!base || !payload.settings) return;
  let r;
  try { r = await cloudRpc('pull_pagina', { tab: 'settings', dopo: null, quanti: 1 }); }
  catch (e) { if (e && e.codice === 'PGRST202') return; throw e; }   // uno schema di prima: come prima
  const lassu = r && Array.isArray(r.rows) && r.rows[0] && r.rows[0].data;
  if (!lassu || typeof lassu !== 'object' || cloudUguali(lassu, base)) return;
  const qui = payload.settings.data || {};
  const fuse = Object.assign({}, lassu);
  new Set(Object.keys(base).concat(Object.keys(qui))).forEach(k => {
    if (cloudUguali(qui[k], base[k])) return;
    if (qui[k] === undefined) delete fuse[k]; else fuse[k] = qui[k];
  });
  payload.settings = Object.assign({}, payload.settings, { data: fuse });
}
async function cloudInviaLotto() {
  let preso = Store.takeChanges();
  if (!preso.changes) {
    // Fotografia sconosciuta (un ripristino, un archivio sostituito): il
    // server non ha visto niente di questo stato, si manda tutto.
    Store.ripristinaBase({});
    preso = Store.takeChanges();
  }
  const { changes, mark } = preso;
  if (!Object.keys(changes || {}).length) return;
  const { payload, impostazioniTenute } = cloudPayload(changes, null, canWriteRuolo('manage'));
  if (impostazioniTenute && !_cloud.impostazioniAvvisate) {
    _cloud.impostazioniAvvisate = true;
    showToast("Le impostazioni condivise le cambia solo l'amministratore: questa modifica resta su questo PC", 'error');
  }
  const ripristina = cloudRipristiniDi(payload);
  if (Object.keys(ripristina).length) payload.ripristina = ripristina;
  if (!cloudPayloadVuoto(payload)) {
    if (payload.settings) await cloudFondiImpostazioni(payload);
    cloudSegna('invio');
    const r = await cloudRpc('push_changes', { payload });
    if (r && Array.isArray(r.rejected) && r.rejected.length) cloudAvvisaRespinti(r.rejected);
  }
  cloudTogliRipristini(ripristina);
  Store.markSynced(mark);
  _cloud.senzaBase.clear();
  cloudSalvaBase();
}
// Dove sta in locale una riga di una tabella del server: la collezione, e
// l'array figlio se non è una radice.
function cloudDove(tab) {
  for (const c of Object.keys(SCHEMA)) {
    if (SCHEMA[c].table === tab) return { coll: c };
    const figli = SCHEMA[c].children || {};
    for (const k of Object.keys(figli)) if (figli[k].table === tab) return { coll: c, figlio: k, rowId: figli[k].rowId };
  }
  return null;
}
function cloudNomeDi(rec) { return rec ? (rec.number || rec.code || rec.name || rec.title || '') : ''; }
// Quale riferimento non regge lo dice il messaggio di Postgres, ma non con
// quale id: con RLS attiva il DETAIL arriva senza valori («Key is not present
// in table "suppliers"»). Si sa la tabella, e basta. In entrambi i casi vince
// chi **usa**: è la regola dell'app, che non lascia eliminare ciò che è citato.
//  - «insert or update on table … / is not present in table "T"»: un collega
//    ha eliminato qualcosa di T che qui si usa ancora. Le lapidi del server
//    dicono che cosa: quelle che questo PC ha ancora si rimandano datate
//    adesso, più recenti della lapide, e il server le ripristina.
//  - «update or delete on table "T"»: qui si elimina qualcosa di T che un
//    collega usa. Le cancellazioni di T si ritirano, e i record tornano dal
//    server con una ricezione da capo.
// Restituisce true se ha riparato qualcosa e il lotto va rimandato.
// I riferimenti che il server, quando il citato se ne va, svuota invece di
// rifiutare (`on delete set null` in schema.sql): tabella.colonna.
const CLOUD_RIF_SVUOTABILI = new Set(['rfqs.plan_id', 'item_prices.rfq_id', 'orders.rfq_id', 'orders.plan_id',
  'production_orders.plan_id', 'production_orders.job_id', 'work_orders.rfq_id', 'work_orders.plan_id',
  'work_orders.odp_id', 'work_order_lines.odp_id', 'work_order_lines.odp_phase_id',
  'production_declarations.phase_id', 'stock_movements.decl_id', 'productions.plan_id', 'reminders.job_id']);
async function cloudRiparaRiferimento(e) {
  const msg = String(e.message || ''), det = String(e.dettagli || '');
  const mancante = /is not present in table "([a-z_]+)"/.exec(det);
  if (/^insert or update on table/.test(msg) && mancante) {
    const dove = cloudDove(mancante[1]);
    if (!dove) return false;
    const c = cloudConfig();
    const since = c.since ? new Date(Date.parse(c.since) - CLOUD_MARGINE_MS).toISOString() : null;
    const r = await cloudPullDa(since);
    const eliminati = ((r && r.removed && r.removed[mancante[1]]) || []).map(String);
    // Solo quelli che il lotto cita davvero: il vincolo ha il nome di serie di
    // Postgres, «<tabella>_<colonna>_fkey», e dice quale colonna guardare.
    const v = /on table "([a-z_]+)" violates foreign key constraint "([a-z0-9_]+)"/.exec(msg);
    let citati = null, col = '';
    if (v && v[2].startsWith(v[1] + '_') && v[2].endsWith('_fkey')) {
      col = v[2].slice(v[1].length + 1, -5);
      const { payload } = cloudPayload(Store.takeChanges().changes || {}, null, true);
      citati = new Set(((payload.upsert || {})[v[1]] || []).map(x => x[col]).filter(Boolean).map(String));
    }
    const tolti = new Set(eliminati.filter(id => !citati || citati.has(id)));
    const nomi = [];
    (Store.getAll(dove.coll) || []).forEach(rec => {
      if (!dove.figlio) {
        if (!tolti.has(String(rec.id))) return;
        touch(rec); _cloud.senzaBase.add(rec.id); cloudSegnaRipristino(mancante[1], rec.id); nomi.push(cloudNomeDi(rec));
        return;
      }
      (rec[dove.figlio] || []).forEach(riga => {
        if (!riga || !tolti.has(String(riga[dove.rowId]))) return;
        riga.updatedAt = nowISO(); touch(rec); _cloud.senzaBase.add(rec.id); cloudSegnaRipristino(mancante[1], riga[dove.rowId]); nomi.push(cloudNomeDi(rec));
      });
    });
    // Il citato manca anche qui: l'ha eliminato questo PC, e il pull che ne
    // avrebbe svuotato i riferimenti non si è ancora applicato (un pannello
    // aperto, un documento in modifica), oppure l'eliminazione parte in questo
    // stesso lotto. Il server quei riferimenti li svuota da sé: si fa lo stesso
    // qui, e il lotto riparte. Senza, ogni giro inciampava nello stesso vincolo
    // e la coda d'invio restava ferma per sempre. Che manchi anche al server lo
    // dice il vincolo stesso.
    if (!nomi.length && citati && CLOUD_RIF_SVUOTABILI.has(v[1] + '.' + col)) {
      const citante = cloudDove(v[1]);
      const campo = col.replace(/_([a-z])/g, (_, x) => x.toUpperCase());
      const qui = new Set((Store.getAll(dove.coll) || []).flatMap(rec => dove.figlio
        ? (rec[dove.figlio] || []).map(r => r && String(r[dove.rowId])) : [String(rec.id)]));
      const svuota = id => id != null && citati.has(String(id)) && !qui.has(String(id));
      let n = 0;
      if (citante) (Store.getAll(citante.coll) || []).forEach(rec => {
        if (!citante.figlio) {
          if (svuota(rec[campo])) { rec[campo] = null; touch(rec); n++; }
          return;
        }
        (rec[citante.figlio] || []).forEach(riga => {
          if (riga && svuota(riga[campo])) { riga[campo] = null; riga.updatedAt = nowISO(); touch(rec); n++; }
        });
      });
      if (!n) return false;
      saveDB();
      return true;
    }
    if (!nomi.length) return false;
    saveDB();
    showToast(`Un collega aveva eliminato ${nomi.length === 1 ? '«' + nomi[0] + '»' : nomi.length + ' elementi'}, ma qui è ancora usato: è stato ripristinato`, 'error');
    return true;
  }
  const eliminato = /^update or delete on table "([a-z_]+)"/.exec(msg);
  if (eliminato) {
    const dove = cloudDove(eliminato[1]);
    if (!dove) return false;
    const ch = (Store.takeChanges().changes || {})[dove.coll] || {};
    const ids = dove.figlio ? ((ch.removeChildren || {})[dove.figlio] || []) : (ch.remove || []);
    if (!ids.length) return false;
    ids.forEach(id => Store.dimenticaInBase(dove.coll, id, dove.figlio));
    cloudAggiornaConfig({ since: null });
    showToast(ids.length === 1
      ? 'Un elemento che hai eliminato è ancora usato da un collega: l\'eliminazione è stata annullata, e torna fra poco'
      : `${ids.length} elementi che hai eliminato sono ancora usati da un collega: le eliminazioni sono state annullate`, 'error');
    return true;
  }
  return false;
}
// L'istante dell'ultimo pull e la fotografia valgono solo insieme all'archivio
// che descrivono (dalla 0.105.3). Se l'archivio locale non si è salvato (spazio
// finito, un'altra scheda che ha scritto prima) e si salvassero comunque, al
// prossimo avvio quel che è arrivato risulterebbe «eliminato qui» e partirebbe
// come cancellazione verso il server: i record dei colleghi, spariti per tutti.
// Così invece il prossimo giro richiede le stesse cose.
function cloudSalvatoDavvero(ok) {
  if (ok !== false && !Store.isUnsaved()) return true;
  cloudSegna('errore', 'L\'archivio di questo PC non si è salvato: le modifiche dei colleghi arrivano di nuovo al prossimo giro');
  return false;
}
// Un'altra scheda ha scritto l'archivio dopo che questa l'ha letto: questa è
// rimasta indietro, e sincronizzare da qui scriverebbe l'istante del pull e la
// fotografia di un archivio che non è quello salvato.
function cloudSchedaSuperata() { return typeof Store.superata === 'function' && Store.superata(); }
async function cloudRicevi() {
  const c = cloudConfig();
  const since = c.since ? new Date(Date.parse(c.since) - CLOUD_MARGINE_MS).toISOString() : null;
  const r = await cloudPullDa(since);
  // Fra la domanda e la risposta qualcuno può aver cominciato a scrivere: si
  // applica al giro dopo, ripartendo dallo stesso punto.
  if (Store.hasPendingChanges() || !cloudPuoApplicare()) return 0;
  if (r && r.completo) { await cloudRiscaricaDaCapo(); return 1; }
  let n = 0;
  _cloud.applicando = true;
  let salvato;
  try { salvato = Store.applicaRemoto(d => (n = cloudApplica(d, r))); }
  finally { _cloud.applicando = false; }
  if (!cloudSalvatoDavvero(salvato)) return 0;
  cloudAggiornaConfig({ since: r.now });
  if (n || _cloud.baseNonSalvata) cloudSalvaBase();
  if (n) { cloudNumeriDoppi(db); cloudDopoArrivo(); }
  return n;
}
// ── Un PC rimasto fermo più delle lapidi (dalla 0.106.0) ──
// Il server toglie le lapidi oltre i 90 giorni (pulizia_archivio): chi chiede
// le novità da prima di quel taglio non saprebbe più che cosa è stato
// cancellato, e terrebbe per sempre record che i colleghi hanno eliminato.
// pull_changes() glielo dice, e l'archivio si riscarica intero. Si arriva qui
// solo a coda vuota: l'invio parte sempre prima della ricezione.
async function cloudRiscaricaDaCapo() {
  await cloudScaricaArchivio();
  cloudDopoArrivo();
  showToast('Questo PC non si collegava da molto: l\'archivio è stato riscaricato dal server');
}
// Il server pulisce cestino e lapidi con la sua ora (dalla 0.106.0), al più
// una volta ogni 20 ore: basta che un PC glielo ricordi ogni tanto. Si chiede
// prima di ricevere, così quello che toglie arriva già in questo giro. Uno
// schema non ancora rieseguito non ha la funzione, e non è un errore da mostrare.
async function cloudPulizia() {
  const ora = Date.now();
  if (_cloud.pulizia && ora - _cloud.pulizia < CLOUD_PULIZIA_MS) return;
  _cloud.pulizia = ora;
  try { await cloudRpc('pulizia_archivio', {}); } catch (e) { /* vedi sopra */ }
}

// ── Numeri doppi ──
// Due documenti con lo stesso numero arrivati comunque qui (un archivio che li
// aveva già prima dell'indice unico del server, dalla 0.105.6): il più recente
// si rinumera — lo fa il PC di chi l'ha creato, così non lo fanno in due — se
// è ancora una bozza nata da poco: un ordine già spedito al fornitore non
// cambia numero di nascosto, e quello lo si dice e basta. Il numero nuovo lo
// riserva il server (cloudRinumera): fino alla 0.105.5 era il massimo di
// questo PC più uno, mai riservato, che poteva essere quello appena dato a un
// collega per l'ordine che stava creando.
const CLOUD_NUMERATI = ['rfqs', 'orders', 'workOrders', 'prodOrders', 'plans', 'jobs'];
const CLOUD_NUOVO_MS = 24 * 3600 * 1000;
function cloudNumeriDoppi(d) {
  if (typeof currentUser === 'undefined' || !currentUser) return [];
  const daRinumerare = [], avvisi = [];
  CLOUD_NUMERATI.forEach(c => {
    const perNumero = new Map();
    (d[c] || []).forEach(x => { if (x && x.number) { if (!perNumero.has(x.number)) perNumero.set(x.number, []); perNumero.get(x.number).push(x); } });
    perNumero.forEach((docs, num) => {
      if (docs.length < 2) return;
      docs.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id)));
      docs.slice(1).forEach(x => {
        if (x.createdBy !== currentUser.id) return;
        const giovane = Date.now() - Date.parse(x.createdAt || 0) < CLOUD_NUOVO_MS;
        const bozza = !x.status || x.status === 'bozza' || (c === 'jobs' && x.status === 'aperta');
        if (giovane && bozza) daRinumerare.push({ coll: c, rec: x, campo: 'number' });
        else if (!_cloud.doppiAvvisati.has(x.id)) {
          _cloud.doppiAvvisati.add(x.id);
          avvisi.push(num);
        }
      });
    });
  });
  if (daRinumerare.length) {
    cloudRinumera(daRinumerare).then(cloudAvvisaRinumerati)
      .catch(e => { if (!(e && e.cloud === 'rete')) console.error('Archivio condiviso: rinumerazione non riuscita', e); });
  }
  if (avvisi.length) showToast('Lo stesso numero è su due documenti, uno tuo e uno di un collega: ' + avvisi.join(', ') + '. Controlla quale tenere', 'error');
  return daRinumerare.map(x => x.rec.number);
}
function cloudAvvisaRinumerati(cambiati) {
  if (!cambiati || !cambiati.length) return;
  showToast((cambiati.length === 1 ? 'Un collega aveva preso lo stesso numero: il tuo documento ora è ' : 'Numeri presi anche da un collega, rinumerati: ') + cambiati.join(', '), 'error');
}
// Dà ai documenti di `docs` ([{ coll, rec, campo }]) numeri nuovi riservati
// sul server, nella serie del numero che hanno. Una richiesta alla volta,
// in fila con quelle di conNumeri. Restituisce [«vecchio → nuovo»]. I numeri
// riservati restano impegnati finché il documento non arriva al server.
function cloudRinumera(docs) {
  const giro = _cloud.numeri.then(async () => {
    const perSerie = new Map();
    (docs || []).forEach(x => {
      const m = /^([A-Z]{2,3}-\d{4}-)\d+$/.exec(String((x && x.rec && x.rec[x.campo]) || ''));
      if (!m) return;
      if (!perSerie.has(m[1])) perSerie.set(m[1], []);
      perSerie.get(m[1]).push(x);
    });
    const cambiati = [];
    for (const [prefisso, lista] of perSerie) {
      // Come conNumeri: il server conosce i documenti arrivati, qui contano
      // quelli ancora in coda — tranne quelli da rinumerare.
      const sigla = prefisso.split('-')[0];
      const coll = SERIE_COLLEZIONE[sigla];
      const via = new Set(lista.map(x => x.rec.id));
      const minimo = SERIE_DOCUMENTI[sigla]
        ? serieMassimo(prefisso, SERIE_DOCUMENTI[sigla]().filter(d => !via.has(d.id) && !Store.baseUpdatedAt(coll, d.id))) : 0;
      const numeri = await cloudRpc('riserva_numeri', { prefisso, quanti: lista.length, minimo });
      if (!Array.isArray(numeri) || numeri.length !== lista.length) throw cloudErrore('server', 'risposta inattesa');
      lista.forEach((x, i) => {
        const prima = x.rec[x.campo];
        x.rec[x.campo] = prefisso + String(numeri[i]).padStart(3, '0');
        touch(x.rec);
        cambiati.push(prima + ' → ' + x.rec[x.campo]);
      });
    }
    if (cambiati.length) saveDB();
    return cambiati;
  });
  _cloud.numeri = giro.catch(() => {});
  return giro;
}
// ── Un numero già usato sul server (dalla 0.105.6) ──
// push_changes rifiuta un lotto che porta un documento con un numero già di
// un altro (23505, «…_numero_unico»), e nel DETAIL dice quali righe. Un
// doppione non nasce più qui per via dei numeri riservati, ma ci arriva: un
// documento ripristinato dal cestino il cui numero intanto è stato ridato, un
// invio fatto contemporaneamente a quello di un collega. Il documento di
// questo PC prende un numero riservato sul server, lo si dice, e il lotto
// riparte. Senza il DETAIL (l'indice unico preso in contropiede da due invii
// insieme) non si sa quale: si riprova al giro dopo, quando il controllo di
// push_changes lo dice.
const CLOUD_CAMPO_NUMERO = { item_revisions: 'ecoNumber' };
async function cloudRiparaNumeri(e) {
  if (!/_numero_unico"/.test(String(e.message || ''))) return false;
  let righe = null;
  try { righe = JSON.parse(e.dettagli || 'null'); } catch (x) { righe = null; }
  if (!Array.isArray(righe)) return false;
  const docs = [];
  righe.forEach(x => {
    const dove = x && cloudDove(x.tab);
    const rec = dove && !dove.figlio ? Store.getById(dove.coll, x.id) : null;
    if (rec) docs.push({ coll: dove.coll, rec, campo: CLOUD_CAMPO_NUMERO[x.tab] || 'number' });
  });
  if (!docs.length) return false;
  const cambiati = await cloudRinumera(docs);
  if (!cambiati.length) return false;
  cloudAvvisaRinumerati(cambiati);
  return true;
}
// Arrivato qualcosa: l'utente di sessione può essere cambiato (ruolo,
// sospensione) e la vista va ridisegnata.
function cloudDopoArrivo() {
  if (typeof currentUser === 'undefined' || !currentUser) return;
  const u = getUser(currentUser.id);
  if (!u || u.active === false) {
    showToast('Il tuo accesso è stato sospeso da un amministratore', 'error');
    cloudLogout();
    return;
  }
  currentUser = u;
  if (typeof renderUserPill === 'function') renderUserPill();
  // Si ridisegna la vista com'è: stessa riga scelta nel pannello laterale,
  // stesso punto della pagina. Chi sta guardando un elenco vede i numeri
  // cambiare, non la pagina che salta.
  if (typeof activeView !== 'undefined' && activeView && typeof setView === 'function') {
    const scelta = typeof inspSel !== 'undefined' ? inspSel : null;
    const y = typeof window !== 'undefined' ? window.scrollY : 0;
    setView(activeView);
    if (scelta && scelta.view === activeView && typeof inspectorSync === 'function') { inspSel = scelta; inspectorSync(); }
    if (y && typeof window.scrollTo === 'function') window.scrollTo(0, y);
  }
}
function cloudAvvisaRespinti(respinti) {
  _cloud.respinti = respinti;
  const n = respinti.length;
  showToast(n === 1
    ? 'Una modifica non è entrata: un collega aveva salvato una versione più recente, che ora vedi qui'
    : `${n} modifiche non sono entrate: un collega aveva salvato versioni più recenti, che ora vedi qui`, 'error');
}
function cloudGestisciErrore(e) {
  if (e && e.cloud === 'rete') {
    cloudSegna('offline', 'Senza collegamento: si consulta soltanto finché non torna');
    cloudProgramma(CLOUD_RIPROVA_MS);   // si riprova presto: intanto non si lavora
    return;
  }
  if (e && e.cloud === 'accesso') {
    cloudSegna('accesso', 'Sessione scaduta');
    showToast('Sessione dell\'archivio condiviso scaduta: accedi di nuovo', 'error');
    cloudLogout();
    return;
  }
  // Il server non lascia scrivere: il profilo è stato sospeso, o il ruolo
  // cambiato, mentre questo PC lavorava. Lo si chiede al server (dalla 0.105.3):
  // senza, il lotto restava in testa alla coda e il PC lavorava per sempre su
  // una copia ferma, con ogni salvataggio respinto.
  if (e && e.cloud === 'permesso') {
    cloudSegna('errore', ((e && e.message) || String(e)) + '. Se un amministratore ha cambiato il tuo ruolo, usa «Scarta solo i rifiutati» (Archivio condiviso)');
    cloudControllaProfilo();
    return;
  }
  console.error('Archivio condiviso:', e);
  // Un riferimento che l'app non è riuscita a riparare: il messaggio di
  // Postgres non dice niente a chi lo legge, la via d'uscita sì.
  // Dalla 0.105.6 l'uscita indicata scarta solo quello che il server rifiuta,
  // non tutto il lavoro in attesa.
  if (e && e.codice === '23503') { cloudSegna('errore', 'Una modifica cita un elemento che non c\'è più sul server. Se il problema resta, usa «Scarta solo i rifiutati» (Archivio condiviso)'); return; }
  if (e && e.codice === '23505' && /_numero_unico"/.test(e.message || '')) { cloudSegna('errore', 'Un documento ha un numero che sul server è già di un altro: si riprova al prossimo giro'); return; }
  const msg = (e && e.message) || String(e);
  cloudSegna('errore', Store.hasPendingChanges() ? msg + '. Se il problema resta, usa «Scarta solo i rifiutati» (Archivio condiviso)' : msg);
}

async function cloudControllaProfilo() {
  let p;
  try { const st = await cloudRpc('archivio_stato', {}); p = st && st.profilo; }
  catch (x) { return; }
  if (p && p.active !== false) return;
  showToast('Il tuo accesso è stato sospeso da un amministratore', 'error');
  cloudLogout();
}

// ═══════════════════════════════════════════════════════════
//  Senza collegamento si consulta (dalla 0.104.0)
// ═══════════════════════════════════════════════════════════
const CLOUD_SOLA_LETTURA_MSG = 'Senza collegamento all\'archivio condiviso si consulta soltanto: si torna a lavorare appena il server risponde';
// Il PC lavora sull'archivio condiviso (non su una copia sua).
function cloudCondiviso() { const c = cloudConfig(); return !!(c && c.allineato); }
// Sola lettura finché il server non ha risposto: anche all'avvio, per il
// tempo del primo giro.
// canWrite() la chiede a ogni riga disegnata: senza rileggere localStorage
// ogni volta, se la risposta è già «collegato».
function cloudSolaLettura() { return !_cloud.collegato && cloudCondiviso(); }
function cloudCollegato(si) {
  if (_cloud.collegato === si) return;
  _cloud.collegato = si;
  if (!cloudCondiviso()) return;
  // Si ridisegna la vista: banner, pulsanti e campi seguono canWrite(). Non
  // in mezzo a una scheda o a un campo: lì bastano le guardie dei gesti.
  if (typeof currentUser !== 'undefined' && currentUser && typeof activeView !== 'undefined' && activeView
      && typeof setView === 'function' && cloudPuoApplicare()) setView(activeView);
}
// Un errore nel chiedere un numero o un codice: senza rete è la sola lettura,
// altrimenti si dice che cosa ha risposto il server.
function cloudErroreRiserva(e, cosa) {
  if (e && e.cloud === 'rete') {
    cloudGestisciErrore(e);
    showToast(CLOUD_SOLA_LETTURA_MSG, 'error');
    return;
  }
  console.error('Archivio condiviso:', e);
  showToast(`Il server non ha dato ${cosa}: ${cloudMsgErrore(e)}`, 'error');
}

// ── I numeri dei documenti ──
// prefisso («ODA-2026-») → numeri riservati sul server e non ancora usati.
// numeroProgressivo() (core.js) li prende da qui.
const _numeriRiservati = {};
// Riserva sul server i numeri che servono, poi esegue `fare`, che li usa
// attraverso le solite next…Number(). `richiesta` è { sigla: quanti }, con le
// sigle di SERIE_DOCUMENTI. Senza archivio condiviso `fare` gira subito e in
// modo sincrono, come sempre; con l'archivio torna una promessa, e se il server
// non risponde il documento non nasce. I numeri riservati e non usati (un
// documento che alla fine non nasce) si restituiscono subito: il prossimo che
// chiede li riprende, e la serie non ha buchi.
function conNumeri(richiesta, fare) {
  const sigle = Object.keys(richiesta || {}).filter(s => richiesta[s] > 0);
  if (!cloudCondiviso() || !sigle.length) return fare();
  if (!cloudCreazioneInizia()) return null;
  const giro = _cloud.numeri.then(async () => {
    const prefissi = sigle.map(seriePrefisso);
    try {
      for (let i = 0; i < sigle.length; i++) {
        const quanti = richiesta[sigle[i]];
        // Il server conosce già i documenti arrivati: qui conta solo quelli
        // ancora in coda. Contarli tutti farebbe saltare il numero di un
        // documento che un collega ha appena eliminato e che qui c'è ancora.
        const coll = SERIE_COLLEZIONE[sigle[i]];
        const minimo = serieMassimo(prefissi[i], SERIE_DOCUMENTI[sigle[i]]().filter(d => !Store.baseUpdatedAt(coll, d.id)));
        const numeri = await cloudRpc('riserva_numeri', { prefisso: prefissi[i], quanti, minimo });
        if (!Array.isArray(numeri) || numeri.length !== quanti) throw cloudErrore('server', 'risposta inattesa');
        _numeriRiservati[prefissi[i]] = numeri.map(Number);
      }
    } catch (e) {
      await cloudRestituisciNumeri(prefissi);
      cloudErroreRiserva(e, 'il numero del documento');
      return null;
    }
    try { return fare(); }
    finally { await cloudRestituisciNumeri(prefissi); }
  }).finally(cloudCreazioneFinita);
  _cloud.numeri = giro.catch(() => {});
  return giro;
}
// Una creazione alla volta (dalla 0.105.3). In locale «Crea» fa tutto subito e
// chiude la finestra; con l'archivio condiviso aspetta il server, la finestra
// resta aperta, e un secondo clic passava le stesse verifiche del primo:
// due ordini con le stesse righe, una revisione rilasciata due volte.
function cloudCreazioneInizia() {
  if (_cloud.creando) { showToast('Un momento: sto chiedendo il numero al server', 'error'); return false; }
  _cloud.creando = true;
  return true;
}
function cloudCreazioneFinita() { _cloud.creando = false; }
// Quello che `fare` non ha usato torna al server. Senza rete restano impegnati
// fino alla scadenza: meglio un buco che un numero dato due volte.
async function cloudRestituisciNumeri(prefissi) {
  for (const p of prefissi) {
    const avanzati = _numeriRiservati[p] || [];
    delete _numeriRiservati[p];
    if (!avanzati.length) continue;
    try { await cloudRpc('libera_numeri', { prefisso: p, numeri: avanzati }); }
    catch (e) { console.error('Archivio condiviso: numeri non restituiti', p, avanzati, e); }
  }
}

// ── I codici degli articoli ──
// Le chiavi (itemCodeKey) dei codici che il server ha detto già presi: la
// generazione automatica le salta (codicePresoAltrove in core.js) anche prima
// che l'articolo del collega arrivi qui.
const _codiciAltrui = new Set();
// [{ codice, item }] → i codici rifiutati. Gli altri restano impegnati a nome
// di questo utente per un'ora, il tempo che il suo articolo arrivi al server.
async function cloudImpegnaCodici(lista) {
  const presi = await cloudRpc('impegna_codici', { codici: lista });
  (presi || []).forEach(c => _codiciAltrui.add(itemCodeKey(c)));
  return presi || [];
}
// Restituisce codici impegnati e poi non usati. Senza risposta scadono da soli
// dopo un'ora.
async function cloudLiberaCodici(codici) {
  if (!codici || !codici.length) return;
  try { await cloudRpc('libera_codici', { codici }); }
  catch (e) { console.error('Archivio condiviso: codici non restituiti', codici, e); }
}
// Impegna il codice di `it` prima di salvarlo, poi esegue `fare`. Se un collega
// l'ha appena preso: con `rigenera` (il codice era automatico) se ne calcola un
// altro e si riprova, e alla fine si dice quale è stato dato; senza, si
// chiede di sceglierne un altro. Sincrono senza archivio condiviso.
function conCodiceImpegnato(it, rigenera, fare) {
  if (!cloudCondiviso() || !it || !it.code) return fare();
  if (!cloudCreazioneInizia()) return null;
  return (async () => {
    const iniziale = it.code;
    for (let tentativi = 0; tentativi < 8; tentativi++) {
      let presi;
      try { presi = await cloudImpegnaCodici([{ codice: it.code, item: it.id || null }]); }
      catch (e) { cloudErroreRiserva(e, 'il codice dell\'articolo'); return null; }
      if (!presi.length) {
        let fatto;
        // Un salvataggio che non va in porto restituisce il codice: un collega
        // lo prende al posto di saltarlo.
        try { fatto = fare(); }
        catch (e) { cloudLiberaCodici([it.code]); throw e; }
        if (it.code !== iniziale) showToast(`Il codice ${iniziale} l'aveva appena preso un collega: l'articolo ha il codice ${it.code}`);
        return fatto;
      }
      const nuovo = rigenera ? rigenera() : '';
      if (!nuovo || itemCodeKey(nuovo) === itemCodeKey(it.code)) break;
      it.code = nuovo;
    }
    showToast(`Il codice ${it.code} l'ha appena preso un collega: scegline un altro`, 'error');
    return null;
  })().finally(cloudCreazioneFinita);
}

// ── L'indicatore nell'intestazione ──
const CLOUD_STATI = {
  ok: 'Sincronizzato', invio: 'Invio…', attesa: 'Da inviare', offline: 'Senza rete',
  errore: 'Errore di sincronizzazione', accesso: 'Accesso scaduto', spento: '',
};
function cloudSegna(stato, messaggio) {
  _cloud.stato = stato;
  _cloud.messaggio = messaggio || '';
  cloudDisegnaStato();
}
function cloudDisegnaStato() {
  if (typeof document === 'undefined') return;
  const el = document.getElementById('cloud-stato');
  if (!el) return;
  if (!cloudAttivo() || _cloud.stato === 'spento') { el.style.display = 'none'; return; }
  el.style.display = '';
  el.className = 'cloud-stato cs-' + _cloud.stato;
  const ora = _cloud.ultimo ? _cloud.ultimo.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '';
  const testo = CLOUD_STATI[_cloud.stato] || '';
  el.innerHTML = `${ico('cloud', 'tinted', '')}<span class="cs-testo">${esc(testo)}</span>`;
  el.title = [testo + (_cloud.stato === 'ok' && ora ? ' alle ' + ora : ''), _cloud.messaggio].filter(Boolean).join(' — ');
  el.setAttribute('aria-label', 'Archivio condiviso: ' + el.title);
}

// ── Avvio e arresto ──
// Dopo Store.load(): rimette la fotografia salvata, così le modifiche rimaste
// in coda alla chiusura risultano ancora da mandare.
function cloudAvvio() {
  const c = cloudConfig();
  if (!c) return;
  if (c.allineato) Store.ripristinaBase(Store.leggiExtra('cloudBase') || cloudLeggi(CLOUD_BASE_KEY) || {});
  Store.dopoCommit = () => cloudProgramma();
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function' && !_cloud.ascolta) {
    _cloud.ascolta = true;
    window.addEventListener('online', () => cloudProgramma(0));
    window.addEventListener('offline', () => { cloudCollegato(false); cloudSegna('offline', 'Senza collegamento: si consulta soltanto finché non torna'); });
    window.addEventListener('focus', () => cloudProgramma(0));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') cloudProgramma(0); });
  }
}
function cloudParti() {
  clearInterval(_cloud.intervallo);
  _cloud.intervallo = setInterval(() => cloudGiro(), CLOUD_GIRO_MS);
  cloudSegna(Store.hasPendingChanges() ? 'attesa' : 'ok');
  cloudProgramma(0);
}
function cloudFerma() {
  _cloud.collegato = false;
  clearInterval(_cloud.intervallo); _cloud.intervallo = null;
  clearTimeout(_cloud.timer); _cloud.timer = null;
  cloudSegna('spento');
}
// Uscita dall'app per una sessione finita: i dati locali restano, la coda
// anche — partirà al prossimo accesso.
function cloudLogout() {
  cloudFerma();
  cloudEsci();
  if (typeof logout === 'function') logout(true);
}

// ═══════════════════════════════════════════════════════════
//  Accesso
// ═══════════════════════════════════════════════════════════
// Dalla schermata d'accesso. Il primo collegamento di un PC (archivio non
// ancora allineato) passa dalla scelta fra caricare e scaricare.
async function cloudLogin(email, password) {
  await cloudAccediConPassword(email, password);
  return cloudDopoAccesso();
}
async function cloudDopoAccesso() {
  const st = await cloudRpc('archivio_stato', {});
  const p = st && st.profilo;
  if (!p) { await cloudEsci(); throw cloudErrore('server', 'Il tuo utente non ha un profilo: chiedi all\'amministratore di rieseguire lo schema'); }
  if (p.active === false) { await cloudEsci(); throw cloudErrore('permesso', 'Il tuo accesso non è ancora attivo: chiedi a un amministratore di attivarti in Gestione → Utenti'); }
  // La sessione arrivata da un invito non sa chi è: lo dice il profilo.
  const s = cloudSessione();
  if (s && !s.user) cloudSalvaSessione(Object.assign({}, s, { user: { id: p.id, email: p.email } }));
  const c = cloudConfig();
  if (!c.allineato) return { primo: true, stato: st };
  // Già allineato: si scarica quello che è cambiato e si entra.
  if (!getUser(p.id)) await cloudRiceviForzato();
  return { primo: false, stato: st };
}
// ── Lo scaricamento completo, a pagine (dalla 0.105.4) ──
// pull_changes() senza `since` rimanda l'intero archivio in una risposta: su
// un archivio di qualche anno supera i limiti di tempo e di dimensione di
// Supabase, e il PC nuovo non entrava più. Qui una tabella alla volta, a
// pagine (pull_pagina in schema.sql), con la stessa forma di risposta.
// L'istante si prende **prima** di leggere: quello che cambia nel frattempo
// ha un synced_at più recente e arriva di nuovo al giro dopo.
// Uno schema di prima della 0.105.4 non ha pull_pagina: si torna al pull intero.
let CLOUD_PAGINA = 1000;   // `let`: le prove lo abbassano
function cloudTabelleTutte() {
  const t = new Set();
  Object.keys(SCHEMA).forEach(c => {
    if (SCHEMA[c].table) t.add(SCHEMA[c].table);
    Object.values(SCHEMA[c].children || {}).forEach(f => { if (f.table) t.add(f.table); });
  });
  return Array.from(t);
}
async function cloudPagine(tab, chiave) {
  const tutte = [];
  let dopo = null;
  for (;;) {
    const r = await cloudRpc('pull_pagina', { tab, dopo, quanti: CLOUD_PAGINA });
    const pag = (r && r.rows) || [];
    pag.forEach(x => tutte.push(x));
    if (pag.length < CLOUD_PAGINA) return tutte;
    dopo = chiave(pag[pag.length - 1]);
  }
}
async function cloudPullTutto() {
  const st = await cloudRpc('archivio_stato', {});
  const tables = {}, removed = {};
  let settings = null;
  try {
    for (const tab of cloudTabelleTutte()) tables[tab] = await cloudPagine(tab, x => String(x.id));
    (await cloudPagine('sync_tombstones', x => x.tab + '\t' + x.id)).forEach(x => { (removed[x.tab] = removed[x.tab] || []).push(x.id); });
    settings = (await cloudPagine('settings', () => null))[0] || null;
  } catch (e) {
    if (e && e.codice === 'PGRST202') return cloudRpc('pull_changes', { since: null });
    throw e;
  }
  return { now: st.ora, tables, removed, settings };
}
// Il pull: da un istante, o tutto a pagine.
function cloudPullDa(since) { return since ? cloudRpc('pull_changes', { since }) : cloudPullTutto(); }

// ── Prima di un conto fatto sull'archivio locale (dalla 0.105.5) ──
// Una rettifica scrive «contato − esistente», e l'esistente è quello di questo
// PC: senza i movimenti dei colleghi non ancora ricevuti, che poi arrivano e
// si sommano alla rettifica, contati due volte. Qui si manda e si riceve
// subito, anche con la finestra dell'inventario aperta, e il conto si fa dopo.
// Senza archivio condiviso `fn` parte subito.
async function cloudAllineaOra() {
  if (!cloudPronto()) return true;
  for (let i = 0; i < 40 && _cloud.inCorso; i++) await new Promise(r => setTimeout(r, 250));
  if (_cloud.inCorso) return false;
  _cloud.inCorso = true;
  try {
    await cloudInvia();
    const c = cloudConfig();
    const since = c.since ? new Date(Date.parse(c.since) - CLOUD_MARGINE_MS).toISOString() : null;
    const r = await cloudPullDa(since);
    if (r && r.completo) { await cloudRiscaricaDaCapo(); return true; }
    let n = 0, salvato;
    _cloud.applicando = true;
    try { salvato = Store.applicaRemoto(d => (n = cloudApplica(d, r))); }
    finally { _cloud.applicando = false; }
    if (!cloudSalvatoDavvero(salvato)) return false;
    cloudAggiornaConfig({ since: r.now });
    cloudSalvaBase();
    if (n) cloudDopoArrivo();
    return true;
  } catch (e) {
    cloudGestisciErrore(e);
    return false;
  } finally { _cloud.inCorso = false; }
}
function conArchivioAggiornato(fn) {
  if (!cloudPronto()) return fn();
  return cloudAllineaOra().then(ok => {
    if (ok) return fn();
    showToast('Non riesco a ricevere le ultime modifiche dei colleghi: la giacenza di questo PC potrebbe essere vecchia. Riprova fra poco', 'error');
    return undefined;
  });
}

// Un pull applicato comunque (all'accesso nessuno sta scrivendo).
async function cloudRiceviForzato() {
  const c = cloudConfig();
  const since = c.since ? new Date(Date.parse(c.since) - CLOUD_MARGINE_MS).toISOString() : null;
  const r = await cloudPullDa(since);
  if (Store.hasPendingChanges()) await cloudInvia();
  if (r && r.completo) { await cloudRiscaricaDaCapo(); return; }
  if (!cloudSalvatoDavvero(Store.applicaRemoto(d => { cloudApplica(d, r); }))) return;
  cloudAggiornaConfig({ since: r.now });
  cloudSalvaBase();
}
// Entrare nell'app con il profilo del server.
function cloudEntra(id) {
  const u = getUser(id);
  if (!u) throw cloudErrore('server', 'Profilo non trovato nell\'archivio');
  if (u.active === false) throw cloudErrore('permesso', 'Il tuo accesso è sospeso');
  doLogin(u, false);
  cloudParti();
}

// ═══════════════════════════════════════════════════════════
//  Primo collegamento: caricare o scaricare
// ═══════════════════════════════════════════════════════════
// Carica l'archivio di questo PC nel server vuoto. Gli utenti locali
// diventano i profili di Supabase con la stessa email (invitati prima, o
// creati a mano): l'id cambia — è quello di Supabase Auth — e con lui ogni
// campo di audit (remapIds). Chi non ha un utente su Supabase resta fuori:
// i record che ha creato restano, con il suo vecchio riferimento.
async function cloudCaricaArchivio(stato) {
  const io = stato.profilo;
  if (io.role !== 'admin') throw cloudErrore('permesso', 'Il primo caricamento lo fa un amministratore');
  // Un caricamento interrotto a metà (la rete, una finestra chiusa) lascia il
  // server non più vuoto: chi lo aveva cominciato lo può riprendere. Gli
  // invii sono idempotenti, le righe già arrivate tornano uguali.
  const ripresa = !!(cloudConfig() || {}).caricamento;
  if (!stato.vuoto && !ripresa) throw cloudErrore('server', 'L\'archivio condiviso contiene già dei dati: scaricalo invece di caricare');
  cloudAggiornaConfig({ caricamento: true });
  const iniziale = await cloudPullDa(null);
  const profili = righeLocali({ profiles: (iniziale.tables && iniziale.tables.profiles) || [] }).profiles;
  const perEmail = new Map(profili.filter(p => p.email).map(p => [String(p.email).toLowerCase(), p]));
  const mappa = {}, fuori = [];
  const utenti = (Store.getAll('users') || []).slice();
  utenti.forEach(u => {
    const p = perEmail.get(String(u.email || '').toLowerCase());
    if (p) mappa[u.id] = p.id; else fuori.push(u);
  });
  const ioLocale = utenti.find(u => mappa[u.id] === io.id);
  Store.applicaRemoto(d => {
    remapIds({ user: mappa });
    d.users = (d.users || []).filter(u => Object.values(mappa).includes(u.id));
    // Chi carica entra comunque, da amministratore: se in locale non c'era
    // (o aveva un'altra email) lo si aggiunge dal suo profilo.
    if (!ioLocale) d.users.push(stampNew({ id: io.id, name: io.name || io.email, username: '', email: io.email, role: 'admin', color: '#3A7BE8', active: true }));
    else { const me = d.users.find(u => u.id === io.id); me.role = 'admin'; me.active = true; }
    // Più recenti del profilo che il trigger ha creato all'invito.
    d.users.forEach(u => { delete u.passwordHash; delete u.passwordSalt; touch(u); });
    // I colleghi già invitati che in questo archivio non ci sono: entrano così
    // come il server li ha (sospesi, finché non si dà loro un ruolo). Prima
    // restavano fuori anche dopo: il loro profilo è più vecchio del punto da
    // cui si riceve, e in Gestione → Utenti non comparivano finché non cambiava.
    const presi = new Set(d.users.map(u => u.id));
    profili.forEach(p => { if (!presi.has(p.id)) d.users.push(p); });
  });
  Store.ripristinaBase({});
  const { changes, mark } = Store.takeChanges();
  const { payload } = cloudPayload(changes, null, true);
  // A pezzi, nell'ordine delle dipendenze: un archivio di qualche anno pesa
  // megabyte, e un invio solo supera i limiti della richiesta (cloudLottiCaricamento).
  for (const p of cloudLottiCaricamento(payload, CLOUD_LOTTO_RIGHE)) await cloudRpc('push_changes', { payload: p });
  Store.markSynced(mark);
  const dopo = await cloudRpc('archivio_stato', {});
  cloudAggiornaConfig({ allineato: true, caricamento: false, since: dopo.ora });
  cloudSalvaBase();
  return { fuori };
}
// I lotti del primo caricamento (a pezzi dalla 0.105.4: prima erano tre
// gruppi di tabelle intere, e una tabella grande stava tutta in una richiesta).
// Ogni lotto cita solo righe già arrivate — i vincoli si controllano alla fine
// di ogni push_changes — quindi le tabelle vanno in ordine di dipendenza, e:
//  - gli articoli si citano fra loro (macchina, gruppo) e citano il loro
//    listino attivo, che arriva dopo di loro: passano una prima volta senza
//    quei riferimenti, e una seconda, intera, alla fine;
//  - le righe di distinta e di ciclo (`replace`) viaggiano con il loro
//    articolo, perché il server le sostituisce solo per i padri dello stesso invio;
//  - i listini citano le richieste d'offerta, che citano i piani.
let CLOUD_LOTTO_RIGHE = 500;   // `let`: le prove lo abbassano
const CLOUD_ORDINE_CARICAMENTO = ['profiles', 'suppliers', 'customers', 'families', 'sub_families', 'work_centers',
  'work_center_suppliers', 'jobs', 'items*', 'production_plans', 'production_plan_lines', 'rfqs', 'rfq_lines',
  'item_prices', 'items', 'orders', 'order_lines', 'production_orders', 'production_order_phases',
  'production_order_materials', 'work_orders', 'work_order_lines', 'production_declarations', 'stock_movements',
  'order_receipts', 'productions', 'item_revisions', 'attachment_docs', 'attachments', 'reminders', 'trash'];
const CLOUD_AUTORIFERIMENTI = { items: ['machine_item_id', 'group_item_id', 'active_price_id'] };
function cloudLottiCaricamento(payload, n) {
  const up = payload.upsert || {}, lotti = [], fatti = new Set();
  const figliSost = {};
  Object.keys(SCHEMA).forEach(c => Object.values(SCHEMA[c].children || {}).forEach(f => {
    if (f.merge === 'replace') (figliSost[SCHEMA[c].table] = figliSost[SCHEMA[c].table] || []).push(f.table);
  }));
  const sost = new Set([].concat(...Object.values(figliSost)));
  const aPezzi = (righe, fn) => { for (let i = 0; i < righe.length; i += n) lotti.push({ upsert: fn(righe.slice(i, i + n)) }); };
  CLOUD_ORDINE_CARICAMENTO.concat(Object.keys(up)).forEach(voce => {
    const prima = voce.endsWith('*'), t = prima ? voce.slice(0, -1) : voce;
    if (!up[t] || sost.has(t) || fatti.has(t)) return;
    if (prima) {
      const via = CLOUD_AUTORIFERIMENTI[t] || [];
      aPezzi(up[t], r => ({ [t]: r.map(x => { const y = Object.assign({}, x); via.forEach(k => { if (k in y) y[k] = null; }); return y; }) }));
      return;
    }
    fatti.add(t);
    const figli = (figliSost[t] || []).filter(f => up[f]);
    const perPadre = {};
    figli.forEach(f => {
      const col = (CLOUD_TABLES[f] && CLOUD_TABLES[f].parent) || 'parent_id';
      const m = perPadre[f] = new Map();
      up[f].forEach(x => { const k = String(x[col]); if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
    });
    aPezzi(up[t], r => {
      const p = { [t]: r };
      figli.forEach(f => {
        const rr = [];
        r.forEach(x => (perPadre[f].get(String(x.id)) || []).forEach(y => rr.push(y)));
        if (rr.length) p[f] = rr;
      });
      return p;
    });
  });
  if (payload.settings) lotti.push({ settings: payload.settings });
  return lotti;
}
// Sostituisce l'archivio di questo PC con quello condiviso.
async function cloudScaricaArchivio() {
  const r = await cloudPullTutto();
  const settings = (r.settings && r.settings.data) || {};
  const nuovo = dbDaCloud(r.tables || {}, { settings, schemaVersion: SCHEMA_VERSION });
  if (!cloudSalvatoDavvero(Store.sostituisciDaRemoto(nuovo))) throw cloudErrore('server', 'L\'archivio scaricato non si è salvato su questo PC: libera spazio e riprova');
  cloudAggiornaConfig({ allineato: true, since: r.now });
  cloudSalvaBase();
}

// ═══════════════════════════════════════════════════════════
//  Collegare e scollegare questo PC
// ═══════════════════════════════════════════════════════════
// Il link di collegamento porta indirizzo e chiave pubblica: chi lo apre si
// ritrova l'app già puntata al progetto. È anche l'indirizzo da mettere come
// «Site URL» in Supabase, così gli inviti e i recuperi password tornano qui.
function cloudLinkCollegamento(c) {
  if (!c || typeof location === 'undefined') return '';
  const base = location.origin && location.origin !== 'null' ? location.origin + location.pathname : location.href.split(/[?#]/)[0];
  return base + '?supabase=' + encodeURIComponent(c.url) + '&chiave=' + encodeURIComponent(c.chiave);
}
function cloudCollega(url, chiave) {
  const u = cloudNormalizzaUrl(url);
  if (!u) throw cloudErrore('config', 'Indirizzo del progetto non valido');
  if (!String(chiave || '').trim()) throw cloudErrore('config', 'Manca la chiave pubblica');
  cloudScrivi(CLOUD_KEY, { url: u, chiave: String(chiave).trim(), allineato: false, since: null });
  cloudScrivi(CLOUD_SCOLLEGATO_KEY, null);
  cloudScrivi(CLOUD_SESS_KEY, null);
  cloudScrivi(CLOUD_BASE_KEY, null);
  Store.salvaExtra('cloudBase', null);
}
async function cloudProva(url, chiave) {
  const u = cloudNormalizzaUrl(url);
  if (!u) throw cloudErrore('config', 'Indirizzo del progetto non valido');
  let r;
  try { r = await fetch(u + '/auth/v1/settings', { headers: { apikey: String(chiave || '').trim() } }); }
  catch (e) { throw cloudErrore('rete', 'Server non raggiungibile: controlla l\'indirizzo'); }
  if (r.status === 401 || r.status === 403) throw cloudErrore('config', 'Chiave rifiutata dal progetto');
  if (!r.ok) throw cloudErrore('server', 'Il progetto risponde con un errore (HTTP ' + r.status + ')');
  return true;
}
function cloudScollega() {
  cloudFerma();
  cloudEsci();
  cloudScrivi(CLOUD_KEY, null);
  cloudScrivi(CLOUD_BASE_KEY, null);
  Store.salvaExtra('cloudBase', null);
}

// ═══════════════════════════════════════════════════════════
//  Interfaccia
// ═══════════════════════════════════════════════════════════
function cloudMsgErrore(e) { return (e && e.message) || String(e); }

// Ripristinare un backup, rimettere i dati d'esempio, azzerare: in locale
// toccano un PC, con l'archivio condiviso toccherebbero tutti — l'archivio
// sostituito risulterebbe da mandare per intero. Si scollega prima.
function cloudBlocca(ev) {
  if (!cloudAttivo()) return false;
  if (ev && ev.target) ev.target.value = '';
  showToast('Con l\'archivio condiviso questa operazione toccherebbe tutti i colleghi: scollega prima questo PC (Gestione → Backup → Archivio condiviso)', 'error');
  return true;
}

// La scheda dell'archivio condiviso: dall'intestazione, da Gestione e dalla
// schermata d'accesso (per collegare un PC prima di entrare).
function cloudPannello() {
  const c = cloudConfig();
  const dentro = typeof currentUser !== 'undefined' && !!currentUser;
  const admin = dentro && canWriteRuolo('manage');
  if (!c) {
    if (dentro && !admin) { showToast('Il collegamento all\'archivio condiviso lo configura un amministratore', 'error'); return; }
    openModal(`<h3>${ico('cloud', 'tinted pill', '')} Collega l'archivio condiviso</h3>
      <p>Inserisci i dati del progetto Supabase: li trovi nel pannello di Supabase, in <strong>Project Settings → API</strong>. La chiave è quella <strong>pubblica</strong> (<em>anon</em> o <em>publishable</em>), mai quella di servizio.</p>
      <div class="modal-field"><label>Indirizzo del progetto</label><input id="cl-url" placeholder="https://xxxx.supabase.co" autocomplete="off"></div>
      <div class="modal-field"><label>Chiave pubblica</label><input id="cl-chiave" placeholder="eyJ… oppure sb_publishable_…" autocomplete="off"></div>
      <p class="cl-esito" id="cl-esito"></p>
      <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
        <button class="btn-outline" onclick="cloudPannelloProva()">Prova</button>
        <button class="add-btn-sm" onclick="cloudPannelloCollega()">Collega questo PC</button></div>`);
    return;
  }
  const s = cloudSessione();
  const da = Store.hasPendingChanges() ? 'Ci sono modifiche non ancora inviate.' : 'Niente in attesa di invio.';
  const link = cloudLinkCollegamento(c);
  openModal(`<h3>${ico('cloud', 'tinted pill', '')} Archivio condiviso</h3>
    <p><strong>Progetto</strong>: ${esc(c.url)}<br>
      <strong>Accesso</strong>: ${esc((s && s.user && s.user.email) || 'nessuno')}<br>
      <strong>Stato</strong>: ${esc(CLOUD_STATI[_cloud.stato] || 'non attivo')}${_cloud.ultimo ? ' · ultimo giro alle ' + esc(_cloud.ultimo.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })) : ''}<br>
      ${esc(da)}${_cloud.messaggio ? '<br><span class="cl-err">' + esc(_cloud.messaggio) + '</span>' : ''}
      ${_cloud.baseNonSalvata ? '<br><span class="cl-err">Spazio esaurito su questo PC: le cancellazioni fatte senza rete potrebbero non partire.</span>' : ''}</p>
    ${admin ? `<div class="modal-field"><label>Link di collegamento per i colleghi</label>
      <div style="display:flex;gap:6px"><input id="cl-link" readonly value="${esc(link)}" style="flex:1">
      <button class="btn-outline" onclick="cloudCopiaLink()">${ico('copy', 'tinted', '')} Copia</button></div></div>
      <p class="cl-nota">Mettilo anche in Supabase come <strong>Site URL</strong> (Authentication → URL Configuration): gli inviti e il recupero password riportano qui.</p>` : ''}
    <div class="modal-actions">
      ${dentro && Store.hasPendingChanges() ? `<button class="btn-outline" onclick="cloudPannelloScartaRifiutati()" title="Manda le modifiche in attesa a pezzi: quelle che il server rifiuta tornano come sul server, le altre partono">Scarta solo i rifiutati</button>` : ''}
      ${dentro ? `<button class="btn-outline" onclick="cloudPannelloRiscarica()">Scarta e riscarica</button>` : ''}
      ${!dentro || admin ? `<button class="btn-outline" style="color:var(--red);border-color:var(--red)" onclick="cloudPannelloScollega()">Scollega questo PC</button>` : ''}
      ${dentro ? `<button class="add-btn-sm" onclick="cloudPannelloSincronizza()">${ico('refresh', 'tinted', '')} Sincronizza ora</button>` : `<button class="add-btn-sm" onclick="closeModal()">Chiudi</button>`}
    </div>`);
}
function cloudEsito(msg, errore) {
  const el = document.getElementById('cl-esito');
  if (el) { el.textContent = msg; el.className = 'cl-esito' + (errore ? ' cl-err' : ' cl-ok'); }
}
async function cloudPannelloProva() {
  cloudEsito('Prova in corso…');
  try { await cloudProva(val('cl-url'), val('cl-chiave')); cloudEsito('Il progetto risponde: puoi collegare questo PC.'); }
  catch (e) { cloudEsito(cloudMsgErrore(e), true); }
}
async function cloudPannelloCollega() {
  try {
    await cloudProva(val('cl-url'), val('cl-chiave'));
    cloudCollega(val('cl-url'), val('cl-chiave'));
  } catch (e) { cloudEsito(cloudMsgErrore(e), true); return; }
  // Il modo condiviso si accende al caricamento dell'archivio: si riparte.
  location.reload();
}
function cloudCopiaLink() {
  const el = document.getElementById('cl-link'); if (!el) return;
  el.select();
  const fatto = () => showToast('Link copiato');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(el.value).then(fatto, () => { document.execCommand('copy'); fatto(); });
  else { document.execCommand('copy'); fatto(); }
}
async function cloudPannelloSincronizza() {
  closeModal();
  const ok = await cloudGiro();
  if (ok) showToast(Store.hasPendingChanges() ? 'Restano modifiche da inviare' : 'Archivio sincronizzato');
  else if (_cloud.stato === 'errore') showToast(_cloud.messaggio || 'Errore di sincronizzazione', 'error');
}
function cloudPannelloScartaRifiutati() {
  askConfirm('Mandare le modifiche in attesa a pezzi? Quelle che il server rifiuta vengono scartate e tornano come sono sul server; tutte le altre partono. Serve quando un invio resta bloccato.', async () => {
    const esito = await cloudScartaRifiutati();
    if (!esito) { if (_cloud.stato === 'errore' || _cloud.stato === 'offline') showToast(_cloud.messaggio || 'Errore di sincronizzazione', 'error'); return; }
    if (!esito.scartati) showToast(Store.hasPendingChanges() ? 'Restano modifiche da inviare' : 'Tutto inviato: il server non ha rifiutato niente');
  }, { title: 'Scarta solo i rifiutati', ok: 'Invia e scarta i rifiutati' });
}
function cloudPannelloRiscarica() {
  askConfirm('Riscaricare l\'archivio condiviso? Le modifiche di questo PC non ancora inviate vanno perse. Se il server rifiuta un invio, prova prima «Scarta solo i rifiutati», che tiene il resto.', async () => {
    try {
      cloudFerma();
      await cloudScaricaArchivio();
      cloudEntra(currentUser.id);
      showToast('Archivio riscaricato');
    } catch (e) { cloudGestisciErrore(e); showToast(cloudMsgErrore(e), 'error'); }
  });
}
// Da dentro lo fa solo un amministratore (dalla 0.105.3): un collega qualsiasi
// trasformava il PC in una copia locale, con le modifiche in coda orfane. Prima
// dell'accesso resta la via d'uscita di un PC che non arriva più al server.
// Scollegato, il PC torna locale con gli utenti di Supabase ma senza password:
// la prima password scritta diventa quella di un amministratore (submitLogin).
// Dalla 0.105.4 la strada è solo per l'amministratore che ha scollegato. Dalla
// schermata d'accesso, dove nessuno è dentro, si scollegava senza dire chi si
// era: chiunque passasse dal PC poteva scollegarlo ed entrare da amministratore.
// Ora lì servono le credenziali di un amministratore dell'archivio condiviso.
function cloudPannelloScollega() {
  const dentro = typeof currentUser !== 'undefined' && !!currentUser;
  if (dentro && !roleGuardRuolo('manage')) return;
  const msg = 'Scollegare questo PC dall\'archivio condiviso? I dati restano qui, ma da adesso sono una copia locale: le modifiche non arrivano più ai colleghi e quelle dei colleghi non arrivano qui.';
  if (dentro) {
    askConfirm(msg, () => {
      cloudScollega();
      cloudScrivi(CLOUD_SCOLLEGATO_KEY, { id: currentUser.id });
      location.reload();
    });
    return;
  }
  openModal(`<h3>${ico('cloud', 'tinted pill', '')} Scollega questo PC</h3>
    <p>${esc(msg)}</p>
    <p>Serve l'accesso di un <strong>amministratore</strong> dell'archivio condiviso: dopo, su questo PC entra solo lui, e la password che sceglie diventa quella del PC.</p>
    <div class="modal-field"><label>Email</label><input type="email" id="cl-sc-email" autocomplete="username"></div>
    <div class="modal-field"><label>Password</label><input type="password" id="cl-sc-pw" autocomplete="current-password"></div>
    <p class="cl-esito" id="cl-sc-esito"></p>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" style="background:var(--red)" onclick="cloudScollegaDaFuori()">Scollega</button></div>`);
}
async function cloudScollegaDaFuori() {
  const email = val('cl-sc-email'), pw = (document.getElementById('cl-sc-pw') || {}).value || '';
  const esito = t => { const e = document.getElementById('cl-sc-esito'); if (e) e.textContent = t; };
  if (!email || !pw) { esito('Scrivi email e password'); return false; }
  esito('Verifica…');
  try {
    await cloudAccediConPassword(email, pw);
    const st = await cloudRpc('archivio_stato', {});
    const p = st && st.profilo;
    if (!p || p.role !== 'admin' || p.active === false) {
      await cloudEsci();
      esito('Solo un amministratore attivo dell\'archivio condiviso scollega questo PC');
      return false;
    }
    cloudScollega();
    cloudScrivi(CLOUD_SCOLLEGATO_KEY, { id: p.id });
    location.reload();
    return true;
  } catch (e) {
    esito(e && e.cloud === 'rete'
      ? 'Il server non risponde: per scollegare serve verificare chi sei. Riprova quando c\'è la rete.'
      : cloudMsgErrore(e));
    return false;
  }
}
// La prima password del PC scollegato: di chi ha scollegato, se si sa. Un PC
// scollegato prima della 0.105.4 non lo sa, e resta come allora.
function cloudPrimaPasswordPer(u) {
  const chi = cloudLeggi(CLOUD_SCOLLEGATO_KEY);
  return !chi || !chi.id || (!!u && u.id === chi.id);
}

// ── Il primo collegamento, dopo l'accesso ──
function cloudConteggio(d) {
  return ['items', 'suppliers', 'orders', 'rfqs'].reduce((n, c) => n + ((d && d[c]) || []).length, 0);
}
function cloudPrimoCollegamento(stato) {
  const p = stato.profilo;
  const localeHa = cloudConteggio(db) > 0;
  // Un caricamento rimasto a metà si riprende: per questo PC il server è
  // ancora «da riempire».
  const st = Object.assign({}, stato, { vuoto: stato.vuoto || (p.role === 'admin' && !!(cloudConfig() || {}).caricamento) });
  if (st.vuoto && p.role !== 'admin') {
    return _loginError('L\'archivio condiviso è ancora vuoto: il primo caricamento lo fa un amministratore.');
  }
  const corpo = st.vuoto
    ? `<p>L'archivio condiviso è <strong>vuoto</strong>. Puoi caricarci l'archivio di questo PC: diventerà quello di tutti.</p>
       <p>Gli utenti passano se hanno su Supabase un utente con la <strong>stessa email</strong> (invitali prima, se vuoi che arrivino già con il loro ruolo). Chi non ce l'ha resta fuori, e si invita dopo da <strong>Gestione → Utenti</strong>. Le password non passano: ognuno usa quella di Supabase.</p>
       <p>Prima conviene esportare un backup.</p>`
    : `<p>L'archivio condiviso contiene già dei dati. Questo PC lo <strong>scarica</strong> e da adesso lavora su quello.</p>
       ${localeHa ? '<p><strong>I dati che ci sono adesso su questo PC vengono sostituiti.</strong> Se contengono lavoro che non è nell\'archivio condiviso, esporta prima un backup.</p>' : ''}`;
  openModal(`<h3>${ico('cloud', 'tinted pill', '')} Primo collegamento</h3>${corpo}
    <p class="cl-esito" id="cl-esito"></p>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="cloudPrimoAnnulla()">Annulla</button>
      ${localeHa && p.role === 'admin' ? `<button class="btn-outline" onclick="cloudPrimoBackup()">${ico('download', 'tinted', '')} Esporta backup</button>` : ''}
      <button class="add-btn-sm" id="cl-primo-ok" onclick="cloudPrimoProcedi(${st.vuoto ? 'true' : 'false'})">${st.vuoto ? 'Carica questo archivio' : 'Scarica l\'archivio condiviso'}</button>
    </div>`);
  _cloud.statoPrimo = st;
}
// Il backup prima di entrare: exportBackup() chiede un amministratore di
// sessione, e qui non c'è ancora nessuno. Lo si fa direttamente.
function cloudPrimoBackup() {
  const blob = new Blob([Store.exportSnapshot()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `bomtrack_backup_${oggiISO()}.json`;
  a.click(); URL.revokeObjectURL(a.href);
  showToast('Backup esportato');
}
function cloudPrimoAnnulla() { closeModal(); cloudEsci(); }
async function cloudPrimoProcedi(carica) {
  const st = _cloud.statoPrimo;
  const btn = document.getElementById('cl-primo-ok');
  if (btn) btn.disabled = true;
  cloudEsito(carica ? 'Caricamento in corso…' : 'Scaricamento in corso…');
  try {
    let fuori = [];
    if (carica) fuori = (await cloudCaricaArchivio(st)).fuori;
    else await cloudScaricaArchivio();
    closeModal();
    cloudEntra(st.profilo.id);
    if (fuori.length) showToast(`Caricato. Restano fuori ${fuori.length} utenti senza account Supabase: ${fuori.map(u => u.name).join(', ')}. Si invitano da Gestione → Utenti`, 'error');
    else showToast(carica ? 'Archivio caricato: da adesso è condiviso' : 'Archivio scaricato');
  } catch (e) {
    if (btn) btn.disabled = false;
    cloudEsito(cloudMsgErrore(e), true);
  }
}

// ── Inviti e recupero password ──
// Il link dell'email di Supabase torna all'app con la sessione nel frammento
// (#access_token=…&type=invite|recovery). La si prende, si pulisce
// l'indirizzo e si chiede la password nuova.
function cloudDaIndirizzo() {
  if (typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search || '');
  const h = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
  const out = {};
  if (q.get('supabase') && q.get('chiave')) out.config = { url: q.get('supabase'), chiave: q.get('chiave') };
  if (h.get('access_token')) out.sessione = {
    access_token: h.get('access_token'), refresh_token: h.get('refresh_token'),
    expires_at: Number(h.get('expires_at')) || null, expires_in: Number(h.get('expires_in')) || 3600, tipo: h.get('type') || '',
  };
  if (h.get('error_description')) out.errore = h.get('error_description');
  return (out.config || out.sessione || out.errore) ? out : null;
}
function cloudPulisciIndirizzo() {
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* resta com'è */ }
}
// Chiamata da init(), prima della sessione: true se ha preso in mano lei la
// schermata d'accesso.
function cloudAllAvvio() {
  const x = cloudDaIndirizzo();
  if (!x) return false;
  cloudPulisciIndirizzo();
  if (x.errore) { setTimeout(() => _loginError('Link non valido o scaduto: ' + x.errore), 60); }
  if (x.config) {
    const c = cloudConfig();
    const stesso = c && c.url === cloudNormalizzaUrl(x.config.url) && c.chiave === x.config.chiave;
    if (!stesso) {
      // Un link può puntare l'app a un server qualsiasi: si chiede prima, e si
      // mostra a quale. Chi lo conferma deve riconoscere il proprio progetto.
      const host = (() => { try { return new URL(cloudNormalizzaUrl(x.config.url)).host; } catch (e) { return x.config.url; } })();
      setTimeout(() => askConfirm(`Collegare questo PC all'archivio condiviso su ${host}?` +
        (cloudConteggio(db) ? ' I dati che ci sono ora su questo PC verranno sostituiti al primo accesso, se l\'archivio condiviso ne contiene già.' : ''), () => {
        try { cloudCollega(x.config.url, x.config.chiave); } catch (e) { showToast(cloudMsgErrore(e), 'error'); return; }
        if (x.sessione) cloudSalvaSessione(Object.assign({}, x.sessione, { user: null }));
        if (x.sessione) cloudScrivi('bomtrack_cloud_nuovapassword', x.sessione.tipo || 'invite');
        location.reload();
      }, { title: 'Archivio condiviso', ok: 'Collega', safe: true }), 60);
      return true;
    }
  }
  if (x.sessione && cloudAttivo()) {
    cloudSalvaSessione(x.sessione);
    setTimeout(() => cloudNuovaPassword(x.sessione.tipo), 60);
    return true;
  }
  return false;
}
// Dopo un invito o un recupero: si sceglie la password, poi si entra.
function cloudNuovaPassword(tipo) {
  cloudScrivi('bomtrack_cloud_nuovapassword', null);
  openModal(`<h3>${ico('key', 'tinted pill', '')} ${tipo === 'recovery' ? 'Nuova password' : 'Benvenuto: scegli la tua password'}</h3>
    <div class="modal-field"><label>Password</label><input type="password" id="cl-pw1" autocomplete="new-password"></div>
    <div class="modal-field"><label>Ripeti la password</label><input type="password" id="cl-pw2" autocomplete="new-password"></div>
    <p class="cl-esito" id="cl-esito"></p>
    <div class="modal-actions"><button class="add-btn-sm" onclick="cloudSalvaNuovaPassword()">Salva ed entra</button></div>`);
}
async function cloudSalvaNuovaPassword() {
  const a = document.getElementById('cl-pw1').value, b = document.getElementById('cl-pw2').value;
  if (a.length < 8) return cloudEsito('Almeno 8 caratteri', true);
  if (a !== b) return cloudEsito('Le due password non coincidono', true);
  try {
    await cloudAggiornaPassword(a);
    closeModal();
    await cloudLoginCompleta();
  } catch (e) { cloudEsito(cloudMsgErrore(e), true); }
}
// Dopo che la sessione c'è: o il primo collegamento, o si entra.
async function cloudLoginCompleta() {
  const esito = await cloudDopoAccesso();
  if (esito.primo) cloudPrimoCollegamento(esito.stato);
  else cloudEntra(esito.stato.profilo.id);
}
// Il ritorno con una sessione salvata: si entra dallo specchio locale anche
// senza rete, e il giro allinea appena può.
function cloudRipristinaSessione() {
  const c = cloudConfig(), s = cloudSessione();
  if (!c || !s) return false;
  const nuova = cloudLeggi('bomtrack_cloud_nuovapassword');
  if (nuova) { renderLogin(); setTimeout(() => cloudNuovaPassword(nuova), 60); return true; }
  if (!c.allineato || !s.user) { renderLogin(); setTimeout(() => cloudLoginCompleta().catch(e => _loginError(cloudMsgErrore(e))), 60); return true; }
  // La durata della sessione vale anche qui (dalla 0.105.4): prima la
  // postazione condivisa lasciata aperta restava aperta per sempre, perché la
  // sessione di Supabase si rinnova da sola. Si conta dall'ultimo uso, come in
  // locale; una sessione di prima della 0.105.4 non ha la data e parte da adesso.
  if (s.ts && typeof sessionExpired === 'function' && sessionExpired(s)) { cloudEsci(); return false; }
  const u = getUser(s.user.id);
  if (!u || u.active === false) return false;
  cloudScrivi(CLOUD_SESS_KEY, Object.assign({}, s, { ts: nowISO() }));
  doLogin(u, false);
  cloudParti();
  return true;
}
