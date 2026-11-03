// ═══════════════════════════════════════════════════════════
//  BOMTRACK — organizzazioni.js (più organizzazioni sullo stesso PC, dalla 0.136.0)
// ═══════════════════════════════════════════════════════════
// Ogni organizzazione è un progetto Supabase a sé, con i suoi utenti, il suo
// schema e la sua funzione degli utenti. Sul PC ha **tutto suo**: l'archivio
// in IndexedDB, gli allegati, la coda delle modifiche, la fotografia
// dell'ultimo invio, la sessione, l'email ricordata, le date dei backup.
// Niente di un'organizzazione deve poter finire in un'altra: è il requisito
// che regge tutto il resto.
//
// ── Come si separa ──
// Una funzione sola, chiaveOrg(k): ogni nome che riguarda i dati passa di lì
// e prende il suffisso `@<id>` dell'organizzazione attiva. La prima
// organizzazione (id '') usa i nomi di sempre: chi aveva già Bomtrack trova i
// suoi dati dove li aveva lasciati, senza traslochi. Restano senza suffisso
// solo le comodità personali di chi guarda lo schermo (tema, densità,
// colonne, filtri, ordinamenti, pannelli), che non contengono dati.
// test/organizzazioni.test.js controlla che ogni chiave nuova scelga da che
// parte stare.
//
// ── Quando si decide ──
// Una volta, al caricamento della pagina, prima di store.js: tutte le chiavi
// sono costanti calcolate da qui. Cambiare organizzazione vuol dire salvare la
// scelta e **ricaricare la pagina**: lo stato in memoria (l'archivio, l'utente,
// il giro della sincronizzazione, la coda) muore con la pagina, e niente si
// porta dietro nell'organizzazione nuova.
//
// La scelta vale per la scheda (sessionStorage): due schede possono lavorare
// su due organizzazioni senza che una sposti l'altra a metà lavoro. L'ultima
// scelta resta anche in localStorage, ed è quella con cui si apre una scheda
// nuova.

const ORG_ELENCO_KEY = 'bomtrack_organizzazioni';   // [{ id, nome }] — comune a tutte
const ORG_ATTIVA_KEY = 'bomtrack_org_attiva';       // l'ultima scelta — comune a tutte
// Il nome base della configurazione del collegamento (cloud.js). Sta qui
// perché l'elenco deve leggere l'indirizzo di ogni organizzazione, anche di
// quelle non attive.
const ORG_CLOUD_KEY_BASE = 'bomtrack_cloud';
const ORG_ID_RE = /^[a-z0-9]{6,16}$/;

function _orgLeggi(area, k) { try { return area ? area.getItem(k) : null; } catch (e) { return null; } }
function _orgScrivi(area, k, v) {
  try { if (!area) return false; if (v == null) area.removeItem(k); else area.setItem(k, v); return true; }
  catch (e) { return false; }
}
function _orgLocale() { return typeof localStorage !== 'undefined' ? localStorage : null; }
function _orgScheda() { try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch (e) { return null; } }

// L'elenco, sempre con la prima organizzazione in testa (anche se nessuno
// l'ha mai nominata). Le voci malformate si ignorano.
function orgElenco() {
  let v = null;
  try { v = JSON.parse(_orgLeggi(_orgLocale(), ORG_ELENCO_KEY) || 'null'); } catch (e) { v = null; }
  const voci = Array.isArray(v) ? v.filter(o => o && typeof o === 'object') : [];
  const prima = voci.find(o => o.id === '');
  const out = [{ id: '', nome: prima && typeof prima.nome === 'string' ? prima.nome : '' }];
  const visti = new Set(['']);
  voci.forEach(o => {
    if (typeof o.id !== 'string' || !ORG_ID_RE.test(o.id) || visti.has(o.id)) return;
    visti.add(o.id);
    out.push({ id: o.id, nome: typeof o.nome === 'string' ? o.nome : '' });
  });
  return out;
}
function _orgSalvaElenco(voci) {
  return _orgScrivi(_orgLocale(), ORG_ELENCO_KEY, JSON.stringify(voci.map(o => ({ id: o.id, nome: o.nome || '' }))));
}
function orgEsiste(id) { return orgElenco().some(o => o.id === id); }

// Quale organizzazione apre questa pagina: quella della scheda, altrimenti
// l'ultima scelta, altrimenti la prima. Un id che non è più nell'elenco
// (tolto da un'altra scheda) riporta alla prima.
function _orgScegliAllAvvio() {
  const valida = id => typeof id === 'string' && (id === '' || (ORG_ID_RE.test(id) && orgEsiste(id)));
  const s = _orgLeggi(_orgScheda(), ORG_ATTIVA_KEY);
  if (s != null && valida(s)) return s;
  const l = _orgLeggi(_orgLocale(), ORG_ATTIVA_KEY);
  if (l != null && valida(l)) return l;
  return '';
}
const ORG_ATTIVA = _orgScegliAllAvvio();
function orgAttiva() { return ORG_ATTIVA; }

// Il nome di una chiave o di un database per un'organizzazione (di serie
// quella attiva). La prima tiene i nomi di sempre.
function chiaveOrg(k, id) {
  const o = id === undefined ? ORG_ATTIVA : id;
  return o ? k + '@' + o : k;
}

// La configurazione del collegamento di un'organizzazione qualsiasi, senza
// passare da cloud.js (che conosce solo quella attiva).
function orgConfig(id) {
  let c = null;
  try { c = JSON.parse(_orgLeggi(_orgLocale(), chiaveOrg(ORG_CLOUD_KEY_BASE, id)) || 'null'); } catch (e) { c = null; }
  return c && c.url && c.chiave ? c : null;
}
function orgHost(id) {
  const c = orgConfig(id);
  if (!c) return '';
  try { return new URL(c.url).host; } catch (e) { return String(c.url); }
}
// Il nome da mostrare: quello dato, altrimenti l'indirizzo del progetto,
// altrimenti «Questo PC» (la prima organizzazione senza archivio condiviso).
function orgNome(id) {
  const o = orgElenco().find(x => x.id === (id === undefined ? ORG_ATTIVA : id));
  if (o && o.nome) return o.nome;
  return orgHost(id === undefined ? ORG_ATTIVA : id) || 'Questo PC';
}
function orgPiuDiUna() { return orgElenco().length > 1; }
// L'organizzazione collegata a questo indirizzo, se c'è.
function orgPerUrl(url) {
  const norm = u => { try { return new URL(/^https?:\/\//i.test(String(u)) ? String(u) : 'https://' + u).origin; } catch (e) { return ''; } };
  const u = norm(url);
  if (!u) return null;
  const o = orgElenco().find(x => { const c = orgConfig(x.id); return c && norm(c.url) === u; });
  return o ? o.id : null;
}

function _orgNuovoId() {
  const alfabeto = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id;
  do {
    const b = new Uint8Array(10);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
    else for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
    id = Array.from(b, x => alfabeto[x % alfabeto.length]).join('');
  } while (orgEsiste(id));
  return id;
}
// Una voce nuova, con il suo collegamento. Parte senza archivio: il primo
// accesso lo scarica dal suo progetto, e non c'è niente di locale che possa
// essere caricato al posto suo.
function orgAggiungi(nome, url, chiave) {
  const id = _orgNuovoId();
  const voci = orgElenco();
  voci.push({ id, nome: String(nome || '').trim() });
  if (!_orgSalvaElenco(voci)) throw new Error('Spazio del browser non disponibile: organizzazione non aggiunta');
  _orgScrivi(_orgLocale(), chiaveOrg(ORG_CLOUD_KEY_BASE, id), JSON.stringify({ url, chiave, allineato: false, since: null }));
  return id;
}
function orgRinomina(id, nome) {
  const voci = orgElenco();
  const o = voci.find(x => x.id === id);
  if (!o) return false;
  o.nome = String(nome || '').trim().slice(0, 60);
  return _orgSalvaElenco(voci);
}
// Le chiavi di localStorage di un'organizzazione: quelle con il suo suffisso.
// La prima non si toglie, quindi non serve saperle elencare.
function orgChiaviLocali(id) {
  const ls = _orgLocale(), out = [];
  if (!ls || !id) return out;
  try {
    const n = typeof ls.length === 'number' ? ls.length : 0;
    for (let i = 0; i < n; i++) { const k = ls.key(i); if (k && k.startsWith('bomtrack') && k.endsWith('@' + id)) out.push(k); }
    // Il localStorage finto delle prove non ha key(): legge la sua mappa.
    if (!n && ls._map) ls._map.forEach((v, k) => { if (k.startsWith('bomtrack') && k.endsWith('@' + id)) out.push(k); });
  } catch (e) { /* niente da elencare */ }
  return out;
}
// Toglie un'organizzazione dal PC: la voce e, con `datiAncora` falso, anche
// tutto quello che ha qui (archivio, allegati, sessione, coda). Mai quella
// attiva — la pagina la sta usando — e mai la prima, che tiene i nomi di
// sempre.
function orgTogli(id, datiAncora) {
  if (!id || id === ORG_ATTIVA) return false;
  _orgSalvaElenco(orgElenco().filter(o => o.id !== id));
  if (datiAncora) return true;
  orgChiaviLocali(id).forEach(k => _orgScrivi(_orgLocale(), k, null));
  if (typeof indexedDB !== 'undefined' && indexedDB && typeof indexedDB.deleteDatabase === 'function') {
    ['bomtrack_archivio', 'bomtrack_allegati'].forEach(n => { try { indexedDB.deleteDatabase(chiaveOrg(n, id)); } catch (e) { /* resta, senza voce che lo apra */ } });
  }
  if (_orgLeggi(_orgLocale(), ORG_ATTIVA_KEY) === id) _orgScrivi(_orgLocale(), ORG_ATTIVA_KEY, null);
  return true;
}
// La scelta, senza ricaricare: chi la chiama ricarica quando ha finito.
function orgScegli(id) {
  if (id !== '' && !orgEsiste(id)) return false;
  _orgScrivi(_orgScheda(), ORG_ATTIVA_KEY, id);
  _orgScrivi(_orgLocale(), ORG_ATTIVA_KEY, id);
  return true;
}
// Cambia organizzazione: salva la scelta e ricarica, con l'indirizzo pulito.
function orgPassaA(id) {
  if (!orgScegli(id)) return false;
  if (typeof location !== 'undefined' && typeof location.reload === 'function') {
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* resta com'è */ }
    location.reload();
  }
  return true;
}
// Che la scheda ricordi l'organizzazione con cui si è aperta: anche se
// un'altra scheda sceglie altro, un ricaricamento di questa resta qui.
_orgScrivi(_orgScheda(), ORG_ATTIVA_KEY, ORG_ATTIVA);
