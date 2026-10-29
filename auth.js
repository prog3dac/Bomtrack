// ═══════════════════════════════════════════════════════════
//  BOMTRACK — auth.js
// ═══════════════════════════════════════════════════════════
// Accesso, sessione e primo amministratore.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  ACCESSO, SESSIONE E UTENTI
// ═══════════════════════════════════════════════════════════
// Struttura e nomi ricalcano timetrack-supabase (submitLogin/initSession/
// doLogin/logout): quando i dati passeranno a Supabase basterà sostituire il
// corpo di verifyCredentials() con supa.auth.signInWithPassword() e il caricamento
// utenti con la tabella `profiles`. Tutto il resto — ruoli, guardie, UI — resta.
const SESSION_KEY = 'bomtrack_session';
const SAVED_EMAIL_KEY = 'bomtrack_saved_email';

// L'email ricordata su questo PC. Difesa da try/catch come ogni altro accesso
// all'archivio locale dell'app (theme.js, columns.js, filters.js, inspector.js,
// localPref in core.js): erano rimasti scoperti proprio i tre della schermata
// d'accesso — cioè l'unica che ogni utente attraversa per forza.
//
// In navigazione privata, con i dati dei siti bloccati, o su file:// con lo
// storage negato, la lettura lancia: renderLogin() moriva sulla prima riga e
// la schermata d'accesso non si disegnava affatto. L'app diventava inutilizzabile
// esattamente nello scenario che showPersistErrorModal() esiste per raccontare.
function emailRicordata() {
  try { return localStorage.getItem(SAVED_EMAIL_KEY); } catch (e) { return null; }
}
function ricordaEmail(email) {
  try {
    if (email) localStorage.setItem(SAVED_EMAIL_KEY, email);
    else localStorage.removeItem(SAVED_EMAIL_KEY);
  } catch (e) { /* niente archivio: si riparte dal campo vuoto al prossimo avvio */ }
}
// La sessione salvata. Stessa ragione: `restoreSession` gira dentro `init()`,
// e una `removeItem` che lancia lì impedisce all'app di avviarsi del tutto.
function sessioneSalvata() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
}
function dimenticaSessione() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* non c'era niente da dimenticare */ }
}

function userList() { return db.users || []; }
function getUser(id) { return userList().find(u => u.id === id); }
function findUserByEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return userList().find(u => (u.email || '').toLowerCase() === e);
}
function activeAdmins(exceptId) { return userList().filter(u => u.role === 'admin' && u.active !== false && u.id !== exceptId); }
function setUserPassword(u, password) {
  u.passwordSalt = newSalt();
  u.passwordHash = hashPassword(password, u.passwordSalt);
}
function verifyPassword(u, password) {
  return !!u && !!u.passwordHash && hashPassword(password, u.passwordSalt) === u.passwordHash;
}

function _loginError(msg) {
  const el = document.getElementById('login-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
// Primo avvio: senza utenti si crea il primo amministratore, invece di
// spedire l'app con credenziali predefinite scritte nel codice.
// Con l'archivio condiviso il primo amministratore nasce su Supabase, non qui.
function needsSetup() { return !cloudInUso() && userList().length === 0; }
function cloudInUso() { return typeof cloudAttivo === 'function' && cloudAttivo(); }
function renderLogin() {
  const setup = needsSetup();
  document.getElementById('login-setup-fields').style.display = setup ? '' : 'none';
  // Il profilo decide quali aree partono accese (core.js, PROFILI_AREE).
  const prof = document.getElementById('login-setup-profile');
  if (prof) prof.style.display = setup ? '' : 'none';
  const sel = document.getElementById('login-profile');
  if (sel && setup) { sel.innerHTML = Object.keys(PROFILI_AREE).map(k =>
    `<option value="${k}">${esc(PROFILI_AREE[k].nome)}</option>`).join(''); loginProfiloDescr(); }
  document.getElementById('login-remember-row').style.display = setup ? 'none' : '';
  document.getElementById('login-sub').textContent = setup
    ? 'Primo avvio — crea l\'amministratore' : 'Distinte base & Costificazione';
  document.getElementById('login-submit').textContent = setup ? 'Crea amministratore' : 'Accedi';
  const err = document.getElementById('login-error'); if (err) err.style.display = 'none';
  // La riga sotto il modulo dice dove stanno i dati, e da lì si collega o si
  // controlla l'archivio condiviso.
  const nota = document.getElementById('login-note');
  if (nota) nota.innerHTML = cloudInUso()
    ? `${ico('cloud', 'tinted', '')} Archivio condiviso: accedi con l'email e la password di Supabase. <a href="#" onclick="cloudPasswordDimenticata();return false">Password dimenticata?</a> · <a href="#" onclick="cloudPannello();return false">Collegamento</a>`
    : `I dati risiedono in questo browser: l'accesso separa i ruoli tra colleghi, non protegge i dati. <a href="#" onclick="cloudPannello();return false">Collega un archivio condiviso…</a>`;
  const saved = !setup && emailRicordata();
  if (saved) {
    setVal('login-email', saved);
    const cb = document.getElementById('login-remember'); if (cb) cb.checked = true;
    setTimeout(() => document.getElementById('login-password') && document.getElementById('login-password').focus(), 50);
  } else {
    setTimeout(() => {
      const first = document.getElementById(setup ? 'login-name' : 'login-email');
      if (first) first.focus();
    }, 50);
  }
}
function loginProfiloDescr() {
  const p = PROFILI_AREE[val('login-profile')], el = document.getElementById('login-profile-descr');
  if (p && el) el.textContent = p.descr + '. Le aree si cambiano poi da Gestione → Aree e moduli.';
}
function submitLogin() {
  if (cloudInUso()) return submitLoginCloud();
  if (needsSetup()) return createFirstAdmin();
  const email = val('login-email');
  const password = document.getElementById('login-password').value;
  if (!email) return _loginError('Inserisci la tua email');
  if (!password) return _loginError('Inserisci la password');
  const u = findUserByEmail(email);
  // Un PC scollegato dall'archivio condiviso tiene gli utenti di Supabase, ma
  // senza password locali: quelle le aveva Supabase. Senza questa strada
  // nessuno potrebbe più entrare, nemmeno per ricollegarlo. Vale solo finché
  // **nessuno** ha una password qui, e solo per un amministratore attivo: la
  // prima password scritta diventa la sua. Dalla 0.105.4 è solo di chi ha
  // scollegato (cloudPrimaPasswordPer).
  if (u && u.role === 'admin' && u.active !== false && !userList().some(x => x.passwordHash)
      && (typeof cloudPrimaPasswordPer !== 'function' || cloudPrimaPasswordPer(u))) {
    if (password.length < 4) return _loginError('Scegli una password di almeno 4 caratteri: diventa la tua password su questo PC');
    setUserPassword(u, password);
    Store.update('users', u.id, { passwordHash: u.passwordHash, passwordSalt: u.passwordSalt });
    ricordaEmail(document.getElementById('login-remember').checked ? (u.email || '') : '');
    setVal('login-password', '');
    doLogin(u, true);
    showToast('Password di questo PC impostata: d\'ora in poi entri con questa');
    return;
  }
  // Un solo messaggio per utente inesistente e password errata: non si rivela
  // quali email esistono.
  if (!u || !verifyPassword(u, password)) {
    _loginError('Email o password errati');
    setVal('login-password', '');
    return;
  }
  if (u.active === false) return _loginError('Account sospeso. Contatta un amministratore.');
  ricordaEmail(document.getElementById('login-remember').checked ? (u.email || '') : '');
  setVal('login-password', '');
  doLogin(u, true);
}
// Con l'archivio condiviso le credenziali le controlla Supabase Auth.
let _loginInCorso = false;
async function submitLoginCloud() {
  if (_loginInCorso) return;
  const email = val('login-email');
  const password = document.getElementById('login-password').value;
  if (!email) return _loginError('Inserisci la tua email');
  if (!password) return _loginError('Inserisci la password');
  const btn = document.getElementById('login-submit');
  _loginInCorso = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Accesso…'; }
  try {
    await cloudAccediConPassword(email, password);
    ricordaEmail(document.getElementById('login-remember').checked ? email : '');
    setVal('login-password', '');
    await cloudLoginCompleta();
  } catch (e) {
    _loginError(e && e.cloud === 'rete' ? 'Server non raggiungibile: controlla la connessione'
      : /invalid login credentials/i.test(e && e.message) ? 'Email o password errati' : cloudMsgErrore(e));
    setVal('login-password', '');
  } finally {
    _loginInCorso = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Accedi'; }
  }
}
async function cloudPasswordDimenticata() {
  const email = val('login-email');
  if (!email) return _loginError('Scrivi la tua email, poi premi di nuovo «Password dimenticata?»');
  try { await cloudRecuperaPassword(email); showToast('Se l\'email è registrata, arriva un messaggio con il link per la nuova password'); }
  catch (e) { _loginError(cloudMsgErrore(e)); }
}
function createFirstAdmin() {
  const name = val('login-name'), email = val('login-email');
  const password = document.getElementById('login-password').value;
  if (!name) return _loginError('Inserisci il tuo nome');
  if (!email) return _loginError('Inserisci la tua email');
  if (password.length < 4) return _loginError('La password deve avere almeno 4 caratteri');
  const u = { id: gid(), name, username: '', email, role: 'admin', color: '#3A7BE8', active: true };
  setUserPassword(u, password);
  Store.insert('users', u);
  const profilo = val('login-profile');
  if (PROFILI_AREE[profilo]) { applicaProfiloAree(profilo); saveDB(); if (typeof renderNav === 'function') renderNav(); }
  setVal('login-password', '');
  doLogin(u, true);
  showToast('Amministratore creato: benvenuto in Bomtrack');
}
function doLogin(user, persist) {
  currentUser = user;
  Store.setActor(user.id);
  if (persist) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, ts: nowISO() })); } catch (e) { /* sessione non persistita */ }
  }
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-header').style.display = 'flex';
  document.getElementById('app-main').style.display = 'block';
  renderUserPill();
  startClock();
  // L'indirizzo comanda: chi apre un link a una vista precisa, o ricarica la
  // pagina, ci ritrova. Altrimenti si atterra sul riepilogo.
  // Un QR inquadrato prima di entrare (`#/q/…`, qr.js) si legge adesso, perché
  // setView riscrive l'indirizzo; la sua scheda si apre sopra il riepilogo.
  const q = qrDaHash();
  setView(viewIniziale());
  if (q) qrApri(q);
}
// Durata della sessione salvata. 0 = non scade (comportamento fino alla 0.21.0).
function sessionMaxDays() {
  const d = db.settings && db.settings.sessionDays;
  return Number.isFinite(+d) && +d >= 0 ? +d : 30;
}
// Vero quando il `ts` scritto al login è più vecchio della durata configurata.
// Una data illeggibile conta come scaduta: meglio richiedere la password che
// tenere aperta una sessione di cui non si sa più l'età.
function sessionExpired(s) {
  const giorni = sessionMaxDays();
  if (!giorni) return false;
  const t = s && s.ts ? Date.parse(s.ts) : NaN;
  if (!isFinite(t)) return true;
  return (Date.now() - t) > giorni * 86400000;
}
// Sessione salvata: si riapre l'app senza credenziali, purché l'utente esista
// ancora, non sia stato sospeso nel frattempo e la sessione non sia scaduta.
function restoreSession() {
  if (cloudInUso()) return cloudRipristinaSessione();
  const s = sessioneSalvata();
  const u = s && s.userId ? getUser(s.userId) : null;
  if (!u || u.active === false || sessionExpired(s)) { dimenticaSessione(); return false; }
  // Si rientra e si **rinnova**: la scadenza è per inattività, non per età
  // assoluta. Senza il rinnovo, chi usa l'app tutti i giorni veniva comunque
  // buttato fuori al trentesimo giorno dal primo accesso — e la ragione per cui
  // la scadenza esiste è la postazione condivisa lasciata aperta, che è
  // esattamente la postazione dove nessuno entra da settimane.
  doLogin(u, true);
  return true;
}
// `daCloud`: l'uscita la sta già facendo cloud.js (sessione scaduta, accesso
// sospeso), che ha fermato il giro e chiuso la sessione per conto suo.
function logout(daCloud) {
  if (cloudInUso() && daCloud !== true) { cloudFerma(); cloudEsci(); }
  dimenticaSessione();
  currentUser = null;
  Store.setActor(null);
  stopClock();
  document.getElementById('app-header').style.display = 'none';
  document.getElementById('app-main').style.display = 'none';
  // Il pannello sta fuori da #app-main: se non lo si spegne qui resta appeso
  // sopra la schermata di accesso.
  document.body.classList.remove('insp-on', 'insp-rail');
  document.getElementById('sub-nav').innerHTML = '';   // la seconda riga se ne va con l'intestazione
  document.getElementById('login-screen').style.display = 'flex';
  setVal('login-password', '');
  renderLogin();
}
function renderUserPill() {
  const pill = document.getElementById('user-pill');
  if (!pill || !currentUser) return;
  pill.style.borderColor = safeColor(currentUser.color);
  pill.title = `${currentUser.name} · ${roleLabel(currentUser.role)}`;
  pill.innerHTML = `<span class="user-dot" style="background:${safeColor(currentUser.color)}"></span>${esc(currentUser.name.split(' ')[0])}
    <span class="user-role">${esc(roleLabel(currentUser.role))}</span>`;
  if (typeof adattaHeader === 'function') adattaHeader();   // un nome lungo cambia lo spazio che resta
}
// Orologio dell'header: data per esteso e ora, allineato al minuto
let clockTimer = null;
function renderClock() {
  const el = document.getElementById('header-clock');
  if (!el) return;
  const now = new Date();
  let d = now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  d = d.charAt(0).toUpperCase() + d.slice(1);   // "mercoledì 22 luglio 2026" → maiuscola iniziale
  const t = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  el.innerHTML = `<span class="clock-date">${esc(d)}</span><span class="clock-time">${t}</span>`;
}
// L'orologio mostra ore e minuti: si risveglia al cambio di minuto, non ogni
// secondo. Il primo colpo si allinea al minuto pieno, poi si va di 60 in 60.
function startClock() {
  renderClock();
  if (clockTimer) return;
  const alProssimoMinuto = 60000 - (Date.now() % 60000);
  clockTimer = setTimeout(function tic() {
    renderClock();
    clockTimer = setTimeout(tic, 60000);
  }, alProssimoMinuto);
}
function stopClock() { if (clockTimer) { clearTimeout(clockTimer); clockTimer = null; } }
function safeColor(c) { return /^#[0-9A-Fa-f]{6}$/.test(String(c || '')) ? c : '#3A7BE8'; }

// Cambio password del proprio account
function changePassword() {
  if (!currentUser) return;
  if (cloudInUso()) {
    openModal(`<h3>${ico('key', 'tinted pill', '')} Cambia password</h3>
      <p>È la password del tuo accesso all'archivio condiviso, su ogni PC.</p>
      <div class="modal-field"><label>Nuova password</label><input type="password" id="cp-new" autocomplete="new-password"></div>
      <div class="modal-field"><label>Ripeti nuova password</label><input type="password" id="cp-new2" autocomplete="new-password"></div>
      <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
        <button class="add-btn-sm" onclick="saveOwnPasswordCloud()">Salva</button></div>`);
    return;
  }
  openModal(`<h3>${ico('key', 'tinted pill', '')} Cambia password</h3>
    <div class="modal-field"><label>Password attuale</label><input type="password" id="cp-old"></div>
    <div class="modal-field"><label>Nuova password</label><input type="password" id="cp-new"></div>
    <div class="modal-field"><label>Ripeti nuova password</label><input type="password" id="cp-new2"></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveOwnPassword()">Salva</button></div>`);
}
function saveOwnPassword() {
  const u = getUser(currentUser.id); if (!u) return;
  if (!verifyPassword(u, document.getElementById('cp-old').value)) { showToast('Password attuale errata', 'error'); return; }
  const n1 = document.getElementById('cp-new').value, n2 = document.getElementById('cp-new2').value;
  if (n1.length < 4) { showToast('La nuova password deve avere almeno 4 caratteri', 'error'); return; }
  if (n1 !== n2) { showToast('Le due password non coincidono', 'error'); return; }
  setUserPassword(u, n1);
  // Store.update fa touch e commit in un colpo, ed è la porta che l'adapter
  // cloud intercetterà: createFirstAdmin usa già Store.insert, e due strade
  // per la stessa collezione nello stesso file sono una di troppo.
  Store.update('users', u.id, { passwordHash: u.passwordHash, passwordSalt: u.passwordSalt });
  closeModal(); savedToast('Password aggiornata');
}
async function saveOwnPasswordCloud() {
  const n1 = document.getElementById('cp-new').value, n2 = document.getElementById('cp-new2').value;
  if (n1.length < 8) { showToast('La nuova password deve avere almeno 8 caratteri', 'error'); return; }
  if (n1 !== n2) { showToast('Le due password non coincidono', 'error'); return; }
  try { await cloudAggiornaPassword(n1); closeModal(); showToast('Password aggiornata'); }
  catch (e) { showToast(cloudMsgErrore(e), 'error'); }
}
