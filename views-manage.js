// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-manage.js
// ═══════════════════════════════════════════════════════════
// Vista Gestione: utenti, dati azienda, fornitori, clienti, famiglie, centri di lavoro,
// concetti, unità di misura e le pagine delle impostazioni.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  VISTA: GESTIONE
// ═══════════════════════════════════════════════════════════
// Dalla 0.126.0 le schede stanno in una colonna a sinistra, raccolte per
// argomento: in riga erano quattordici pulsanti dello stesso peso, che andavano
// a capo su tre righe e non dicevano quale stava con quale. E «Impostazioni»,
// che teneva insieme costi, codici, sessione, aree, calendario ed etichette QR,
// si è divisa nelle sue pagine: ognuna salva solo quello che mostra.
const MGMT_TABS = [
  { id: 'company', gruppo: 'Azienda', label: ico('building', 'tinted', '') + ' Dati azienda' },
  { id: 'users', gruppo: 'Azienda', label: ico('users', 'tinted', '') + ' Utenti e accesso' },
  { id: 'suppliers', gruppo: 'Anagrafiche', label: ico('factory', 'tinted', '') + ' Fornitori' },
  { id: 'customers', gruppo: 'Anagrafiche', label: ico('contacts', 'tinted', '') + ' Clienti' },
  { id: 'terms', gruppo: 'Anagrafiche', label: ico('truck', 'tinted', '') + ' Condizioni offerta' },
  { id: 'fam-acquistato', gruppo: 'Classificazione articoli', label: ico('cart', 'tinted', '') + ' Famiglie commerciali' },
  { id: 'fam-materiale', gruppo: 'Classificazione articoli', label: ico('package', 'tinted', '') + ' Famiglie materie prime' },
  { id: 'fam-parte', gruppo: 'Classificazione articoli', label: ico('wrench', 'tinted', '') + ' Famiglie parti' },
  { id: 'concepts', gruppo: 'Classificazione articoli', label: ico('tag', 'tinted', '') + ' Concetti' },
  { id: 'uoms', gruppo: 'Classificazione articoli', label: ico('ruler', 'tinted', '') + ' Unità di misura' },
  { id: 'calendario', gruppo: 'Pianificazione e produzione', label: ico('clock', 'tinted', '') + ' Calendario di fabbrica' },
  { id: 'workcenters', gruppo: 'Pianificazione e produzione', label: ico('wrench', 'tinted', '') + ' Centri di lavoro', area: 'produzione' },
  { id: 'moduli', gruppo: 'Configurazione', label: ico('settings', 'tinted', '') + ' Aree e moduli' },
  { id: 'costi', gruppo: 'Configurazione', label: ico('euro', 'tinted', '') + ' Costi e margini' },
  { id: 'codifica', gruppo: 'Configurazione', label: ico('tag', 'tinted', '') + ' Codifica articoli' },
  { id: 'qr', gruppo: 'Configurazione', label: ico('qr', 'tinted', '') + ' Etichette QR' },
  { id: 'import', gruppo: 'Dati', label: ico('upload', 'tinted', '') + ' Import' },
  { id: 'backup', gruppo: 'Dati', label: ico('save', 'tinted', '') + ' Backup' },
];
// Le vecchie schede che non ci sono più: chi chiama setMgmtTab('settings')
// (un link, un'abitudine del codice) arriva dove ora stanno aree e moduli.
const MGMT_ALIAS = { settings: 'moduli' };
function renderManage() {
  if (MGMT_ALIAS[mgmtTab]) mgmtTab = MGMT_ALIAS[mgmtTab];
  // Una scheda di un'area o di un modulo spenti sparisce, e chi ci stava torna ad aree e moduli.
  const schede = MGMT_TABS.filter(t => (!t.area || areaAttiva(t.area)) && (!t.modulo || moduloAttivo(t.modulo)));
  if (!schede.some(t => t.id === mgmtTab)) mgmtTab = 'moduli';
  const gruppi = [];
  schede.forEach(t => {
    const g = gruppi[gruppi.length - 1];
    if (g && g.nome === t.gruppo) g.schede.push(t); else gruppi.push({ nome: t.gruppo, schede: [t] });
  });
  document.getElementById('mgmt-tabs').innerHTML = gruppi.map(g =>
    `<div class="mgmt-group"><div class="mgmt-group-title">${esc(g.nome)}</div>${g.schede.map(t =>
      `<button class="mgmt-tab ${mgmtTab === t.id ? 'active' : ''}" onclick="setMgmtTab('${t.id}')" aria-current="${mgmtTab === t.id ? 'page' : 'false'}">${t.label}</button>`).join('')}</div>`).join('');
  const c = document.getElementById('mgmt-content');
  if (mgmtTab === 'users') c.innerHTML = renderUsers() + renderAccessSettings();
  else if (mgmtTab === 'company') c.innerHTML = renderCompany();
  else if (mgmtTab === 'terms') c.innerHTML = renderTerms();
  else if (mgmtTab === 'suppliers') c.innerHTML = renderSuppliers();
  else if (mgmtTab === 'customers') c.innerHTML = renderCustomers();
  else if (mgmtTab === 'fam-acquistato') c.innerHTML = renderFamilies('acquistato');
  else if (mgmtTab === 'fam-materiale') c.innerHTML = renderFamilies('materiale');
  else if (mgmtTab === 'fam-parte') c.innerHTML = renderFamilies('parte');
  else if (mgmtTab === 'workcenters') c.innerHTML = renderWorkCenters();
  else if (mgmtTab === 'concepts') c.innerHTML = renderConcepts();
  else if (mgmtTab === 'uoms') c.innerHTML = renderUoms();
  else if (mgmtTab === 'calendario') c.innerHTML = renderSettingsPage(renderCalendarSettings());
  else if (mgmtTab === 'moduli') c.innerHTML = renderSettingsPage(renderModuliSettings());
  else if (mgmtTab === 'costi') c.innerHTML = renderSettingsPage(renderCostSettings());
  else if (mgmtTab === 'codifica') c.innerHTML = renderSettingsPage(renderCodeSettings());
  else if (mgmtTab === 'qr') c.innerHTML = renderSettingsPage(renderQrSettings());
  else if (mgmtTab === 'import') c.innerHTML = renderImport();
  else if (mgmtTab === 'backup') c.innerHTML = renderBackup();
  a11yFields(c);
  mgmtTabInVista();
}
// La scheda aperta si vede sempre: al telefono la colonna diventa una riga che
// scorre di lato, e la scheda scelta poteva restare oltre il bordo.
function mgmtTabInVista() {
  const nav = document.getElementById('mgmt-tabs');
  const att = nav && nav.querySelector && nav.querySelector('.mgmt-tab.active');
  if (!att || typeof att.getBoundingClientRect !== 'function' || typeof nav.getBoundingClientRect !== 'function') return;
  const n = nav.getBoundingClientRect(), a = att.getBoundingClientRect();
  if (a.left < n.left || a.right > n.right) nav.scrollLeft += a.left - n.left - 16;
  if (a.top < n.top || a.bottom > n.bottom) nav.scrollTop += a.top - n.top - 16;
}
function setMgmtTab(t) { mgmtTab = t; renderManage(); }

// ─── Utenti (solo amministratori) ───
// Le invarianti (ultimo admin, azioni su se stessi) vivono nei mutatori, non
// nella UI: in cloud diventeranno vincoli e policy lato Supabase.
function roleOptions(sel) {
  return Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
}
function renderUsers() {
  // Con l'archivio condiviso gli utenti nascono da un invito di Supabase, e
  // le password le tiene Supabase: qui si assegnano ruolo e stato.
  const cloud = cloudInUso();
  const list = userList().map(u => {
    const me = currentUser && u.id === currentUser.id;
    const susp = u.active === false;
    return `<div class="mgmt-item" style="border-left:3px solid ${safeColor(u.color)}">
      <span class="mgmt-item-name">${esc(u.name)}${me ? ' <span class="mgmt-item-meta">(tu)</span>' : ''}</span>
      <span class="mgmt-item-meta">${esc(u.email || '—')}${u.username ? ' · @' + esc(u.username) : ''}</span>
      <span class="doc-badge">${esc(roleLabel(u.role))}</span>
      <span class="doc-badge ${susp ? 'st-sospeso' : 'st-attivo'}">${susp ? 'Sospeso' : 'Attivo'}</span>
      <div class="mgmt-item-actions">
        <button class="mini-btn" onclick="editUserModal('${u.id}')" title="Modifica">${ico('edit', 'tinted', 'Modifica')}</button>
        ${cloud
          ? `<button class="mini-btn" onclick="cloudLinkPassword('${u.id}')" title="Link per reimpostare la password">${ico('key', 'tinted', 'Link per reimpostare la password')}</button>`
          : `<button class="mini-btn" onclick="resetUserPasswordModal('${u.id}')" title="Imposta password">${ico('key', 'tinted', 'Imposta password')}</button>`}
        <button class="mini-btn" onclick="toggleUserActive('${u.id}')" title="${susp ? 'Riattiva' : 'Sospendi'}">${susp ? ico('check', 'tinted', 'Riattiva') : ico('pause', 'tinted', 'Sospendi')}</button>
        ${cloud ? '' : `<button class="mini-btn danger" onclick="delUser('${u.id}')" title="Elimina">${ico('trash', 'tinted', 'Elimina')}</button>`}
      </div></div>`;
  }).join('') || '<div class="empty-text">Nessun utente.</div>';
  // Con l'archivio condiviso il collega si crea qui e riceve un link, che gli
  // giri tu: l'utente lo crea la funzione bomtrack-utenti sul server.
  const nuovo = cloud
    ? `<div class="mgmt-form">
      <input id="nu-name" placeholder="Nome e cognome">
      <input id="nu-email" placeholder="Email (sarà il suo accesso)">
      <select id="nu-role">${roleOptions('progettazione')}</select>
      <button class="add-btn-sm" id="nu-crea" onclick="cloudNuovoUtente()">+ Crea e genera link</button></div>
      <p class="empty-text" style="text-align:left;padding:6px 0 0">${ico('mail', 'tinted', '')} Il collega nasce già con il suo ruolo; il link d'invito lo giri tu (WhatsApp, Teams, email) e scade in circa un giorno. Aprendolo sceglie la password. La chiave ${ico('key', 'tinted', '')} genera un link per reimpostarla. Per togliere un collega, sospendilo.</p>`
    : '';
  if (cloud) return `<div class="mgmt-panel"><div class="mgmt-list">${list}</div>${nuovo}
    <p class="empty-text" style="text-align:left;padding:6px 0 0">${ruoliHtml()}</p></div>`;
  return `<div class="mgmt-panel"><div class="mgmt-list">${list}</div>
    <div class="mgmt-form">
      <input id="nu-name" placeholder="Nome e cognome">
      <input id="nu-email" placeholder="Email">
      <input id="nu-username" placeholder="Username (opzionale)">
      <select id="nu-role">${roleOptions('progettazione')}</select>
      <input type="color" id="nu-color" value="#3A7BE8" title="Colore" style="padding:2px;width:44px">
      <input type="password" id="nu-password" placeholder="Password iniziale">
      <button class="add-btn-sm" onclick="addUser()">+ Aggiungi</button></div>
    <p class="empty-text" style="text-align:left;padding:6px 0 0">${ruoliHtml()}<br>
      ${ico('warning', 'tinted', '')} Con i dati nel browser questi ruoli separano le responsabilità, non proteggono i dati: la protezione vera arriva con l'archivio condiviso (Gestione → Backup).</p></div>`;
}
function ruoliHtml() {
  return `<strong>Amministratore</strong>: tutto, compresi utenti, impostazioni e backup ·
      <strong>Ufficio acquisti</strong>: richieste e ordini ·
      <strong>Progettazione</strong>: articoli e distinte ·
      <strong>Lettore</strong>: sola lettura.`;
}
// ─── Utenti con l'archivio condiviso (dalla 0.105.0) ───
async function cloudNuovoUtente() {
  if (!roleGuard('manage')) return;
  const nome = val('nu-name'), email = val('nu-email').toLowerCase(), ruolo = val('nu-role') || 'lettore';
  if (!nome) { showToast('Nome richiesto', 'error'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Email non valida', 'error'); return; }
  if (findUserByEmail(email)) { showToast('Email già usata da un altro utente', 'error'); return; }
  const btn = document.getElementById('nu-crea');
  if (btn) { btn.disabled = true; btn.textContent = 'Creazione…'; }
  try {
    const r = await cloudUtenti({ azione: 'invita', email, nome, ruolo });
    cloudLinkModal(`Utente ${nome} creato`, r.link,
      `Manda questo link a ${esc(nome)}: aprendolo sceglie la password ed entra come <strong>${esc(roleLabel(ruolo))}</strong>.`);
    ['nu-name', 'nu-email'].forEach(k => { const el = document.getElementById(k); if (el) el.value = ''; });
    cloudProgramma(0);   // il profilo nuovo arriva al prossimo giro
  } catch (e) {
    showToast(cloudMsgErrore(e), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '+ Crea e genera link'; }
  }
}
async function cloudLinkPassword(id) {
  if (!roleGuard('manage')) return;
  const u = getUser(id); if (!u) return;
  askConfirm(`Generare un link per reimpostare la password di ${u.name}?\nChi lo apre sceglie una password nuova ed entra come ${u.name}: giralo solo a lui.`, async () => {
    try {
      const r = await cloudUtenti({ azione: 'reimposta', id });
      cloudLinkModal(`Link per ${u.name}`, r.link, `Manda questo link a ${esc(u.name)}: aprendolo sceglie una password nuova.`);
    } catch (e) { showToast(cloudMsgErrore(e), 'error'); }
  }, { title: 'Reimposta password', ok: 'Genera link', safe: true });
}
function cloudLinkModal(titolo, link, spiega) {
  openModal(`<h3>${ico('key', 'tinted pill', '')} ${esc(titolo)}</h3>
    <p>${spiega} Scade in circa un giorno, e vale una volta sola.</p>
    <div style="display:flex;gap:6px"><input id="cl-utente-link" readonly value="${esc(link)}" style="flex:1" onclick="this.select()">
      <button class="add-btn-sm" onclick="cloudCopiaLinkUtente()">Copia</button></div>
    <div class="modal-actions"><button class="add-btn-sm" onclick="closeModal()">Fatto</button></div>`);
}
function cloudCopiaLinkUtente() {
  const el = document.getElementById('cl-utente-link'); if (!el) return;
  const fatto = () => showToast('Link copiato');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(el.value).then(fatto, () => { el.select(); document.execCommand('copy'); fatto(); });
  else { el.select(); document.execCommand('copy'); fatto(); }
}
function addUser() {
  if (!roleGuard('manage')) return;
  if (cloudInUso()) return cloudNuovoUtente();
  const name = val('nu-name'), email = val('nu-email');
  const pwd = document.getElementById('nu-password').value;
  if (!name) { showToast('Nome richiesto', 'error'); return; }
  if (!email) { showToast('Email richiesta', 'error'); return; }
  if (findUserByEmail(email)) { showToast('Email già usata da un altro utente', 'error'); return; }
  if (pwd.length < 4) { showToast('La password deve avere almeno 4 caratteri', 'error'); return; }
  const u = { id: gid(), name, username: val('nu-username'), email, role: val('nu-role') || 'lettore',
    color: safeColor(val('nu-color')), active: true };
  setUserPassword(u, pwd);
  Store.insert('users', u);
  renderManage(); savedToast('Utente creato');
}
function editUserModal(id) {
  if (!roleGuard('manage')) return;
  const u = getUser(id); if (!u) return;
  openModal(`<h3>${ico('edit', 'tinted pill', '')} Modifica utente</h3>
    <div class="modal-field"><label>Nome e cognome</label><input id="eu-name" value="${esc(u.name)}"></div>
    <div class="modal-grid">
      <div class="modal-field"><label>Email</label><input id="eu-email" value="${esc(u.email || '')}"></div>
      <div class="modal-field"><label>Username</label><input id="eu-username" value="${esc(u.username || '')}"></div>
      <div class="modal-field"><label>Ruolo</label><select id="eu-role">${roleOptions(u.role)}</select></div>
      <div class="modal-field"><label>Colore</label><input type="color" id="eu-color" value="${safeColor(u.color)}"></div>
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveUserEdit('${id}')">Salva</button></div>`);
}
function saveUserEdit(id) {
  if (!roleGuard('manage')) return;
  const u = getUser(id); if (!u) return;
  const name = val('eu-name'), email = val('eu-email'), role = val('eu-role');
  if (!name) { showToast('Nome richiesto', 'error'); return; }
  if (!email) { showToast('Email richiesta', 'error'); return; }
  const dup = findUserByEmail(email);
  if (dup && dup.id !== id) { showToast('Email già usata da un altro utente', 'error'); return; }
  // Restare senza amministratori attivi chiuderebbe fuori tutti dalla Gestione
  if (u.role === 'admin' && role !== 'admin' && !activeAdmins(id).length) {
    showToast('Deve restare almeno un amministratore attivo', 'error'); return;
  }
  Object.assign(u, { name, email, username: val('eu-username'), role, color: safeColor(val('eu-color')) });
  touch(u); saveDB(); closeModal();
  if (currentUser && currentUser.id === id) { currentUser = u; renderUserPill(); renderNav(); }
  renderManage(); savedToast('Utente aggiornato');
}
function resetUserPasswordModal(id) {
  if (!roleGuard('manage')) return;
  const u = getUser(id); if (!u) return;
  openModal(`<h3>${ico('key', 'tinted pill', '')} Password di ${esc(u.name)}</h3>
    <div class="modal-field"><label>Nuova password</label><input type="password" id="ru-pwd"></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveUserPassword('${id}')">Imposta</button></div>`);
}
function saveUserPassword(id) {
  if (!roleGuard('manage')) return;
  if (cloudInUso()) return;
  const u = getUser(id); if (!u) return;
  const pwd = document.getElementById('ru-pwd').value;
  if (pwd.length < 4) { showToast('La password deve avere almeno 4 caratteri', 'error'); return; }
  setUserPassword(u, pwd);
  touch(u); saveDB(); closeModal(); savedToast('Password impostata');
}
function toggleUserActive(id) {
  if (!roleGuard('manage')) return;
  const u = getUser(id); if (!u) return;
  if (currentUser && id === currentUser.id) { showToast('Non puoi sospendere te stesso', 'error'); return; }
  if (u.active !== false && u.role === 'admin' && !activeAdmins(id).length) {
    showToast('Deve restare almeno un amministratore attivo', 'error'); return;
  }
  u.active = u.active === false;
  touch(u); saveDB(); renderManage();
  showToast(u.active ? u.name + ' riattivato' : u.name + ' sospeso');
}
function delUser(id) {
  if (!roleGuard('manage')) return;
  if (cloudInUso()) { showToast('Con l\'archivio condiviso un utente si sospende, non si elimina', 'error'); return; }
  const u = getUser(id); if (!u) return;
  if (currentUser && id === currentUser.id) { showToast('Non puoi eliminare te stesso', 'error'); return; }
  if (u.role === 'admin' && !activeAdmins(id).length) { showToast('Deve restare almeno un amministratore attivo', 'error'); return; }
  askConfirm(`Eliminare l'utente "${u.name}"? I record che ha creato restano, con il riferimento all'autore.`, () => {
    removeConUndo('users', id, `Utente "${u.name}" eliminato`, renderManage);
  });
}

function renderTerms() {
  const s = db.settings;
  const sect = (kind, title, def) => {
    const arr = s[kind + 'Options'] || [];
    const list = arr.map((o, i) => `<div class="mgmt-item">
      <span class="mgmt-item-name">${esc(o)}${o === def ? ' <span class="terms-default">predefinito</span>' : ''}</span>
      <div class="mgmt-item-actions">
        <button class="mini-btn" onclick="termsSetDefault('${kind}',${i})" title="Imposta/rimuovi predefinito">${o === def ? '★' : '☆'}</button>
        <button class="mini-btn danger" onclick="termsDel('${kind}',${i})" title="Elimina">${ico('trash', 'tinted', 'Elimina')}</button>
      </div></div>`).join('') || '<div class="empty-text">Nessuna voce.</div>';
    return `<h3 class="settings-group-title">${title}</h3>
      <div class="mgmt-list">${list}</div>
      <div class="mgmt-form"><input id="terms-${kind}-new" placeholder="Nuova voce"><button class="add-btn-sm" onclick="termsAdd('${kind}')">+ Aggiungi</button></div>`;
  };
  return `<div class="mgmt-panel">
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Gestisci le voci selezionabili per Trasporto e Pagamento in richieste di offerta, ordini e ordini di lavoro. La voce con ★ precompila i documenti nuovi, se il fornitore non ha un suo predefinito.</p>
    ${sect('transport', ico('truck', 'tinted', '') + ' Tipi di trasporto / resa', s.transportDefault)}
    ${sect('payment', ico('card', 'tinted', '') + ' Tipi di pagamento', s.paymentDefault)}</div>`;
}
function termsAdd(kind) {
  if (!roleGuard('manage')) return;
  const v = val('terms-' + kind + '-new'); if (!v) { showToast('Valore richiesto', 'error'); return; }
  const key = kind + 'Options';
  db.settings[key] = db.settings[key] || [];
  if (db.settings[key].includes(v)) { showToast('Voce già presente', 'error'); return; }
  db.settings[key].push(v);
  saveDB(); renderManage(); savedToast('Aggiunto');
}
function termsDel(kind, i) {
  if (!roleGuard('manage')) return;
  const key = kind + 'Options', arr = db.settings[key] || [];
  const v = arr[i]; if (v == null) return;
  db.settings[key] = arr.filter((_, idx) => idx !== i);
  if (db.settings[kind + 'Default'] === v) db.settings[kind + 'Default'] = '';
  saveDB(); renderManage(); savedToast('Eliminato');
}
function termsSetDefault(kind, i) {
  if (!roleGuard('manage')) return;
  const arr = db.settings[kind + 'Options'] || [];
  const v = arr[i]; if (v == null) return;
  db.settings[kind + 'Default'] = (db.settings[kind + 'Default'] === v) ? '' : v;
  saveDB(); renderManage();
}

function renderCompany() {
  const co = db.settings.company || {};
  return `<div class="mgmt-panel">
    <h3 class="settings-group-title">${ico('building', 'tinted', '')} Dati azienda (richiedente)</h3>
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Questi dati identificano la tua azienda e vengono stampati come intestazione su richieste di offerta, ordini, ordini di lavoro e sugli export PDF.</p>
    <div class="modal-grid">
      <div class="modal-field"><label>Ragione sociale</label><input id="co-name" value="${esc(co.name || '')}"></div>
      <div class="modal-field"><label>Referente</label><input id="co-ref" value="${esc(co.referente || '')}"></div>
      <div class="modal-field"><label>Email</label><input id="co-email" value="${esc(co.email || '')}"></div>
      <div class="modal-field"><label>Telefono</label><input id="co-phone" value="${esc(co.phone || '')}"></div>
      <div class="modal-field"><label>P.IVA / C.F.</label><input id="co-vat" value="${esc(co.vat || '')}"></div>
      ${addressFieldsHtml('co', co)}
    </div>
    <button class="add-btn-sm" onclick="saveCompany()">Salva dati azienda</button></div>`;
}
function saveCompany() {
  if (!roleGuard('manage')) return;
  db.settings.company = Object.assign({
    name: val('co-name'), referente: val('co-ref'), email: val('co-email'),
    phone: val('co-phone'), vat: val('co-vat'),
  }, readAddressFields('co'));
  saveDB(); renderManage(); savedToast('Dati azienda salvati');
}

// ─── Sospendere una voce di anagrafica ───
// `active` era migrato, documentato nello schema cloud, esportato in Excel e
// **letto** in mezza app — i fornitori attivi nel menu dell'import, i clienti
// attivi nei suggerimenti della commessa, i centri attivi nella scelta della
// lavorazione — ma nessun comando lo poteva mettere a false: solo gli utenti
// avevano il pulsante. Era una promessa che l'app non manteneva.
//
// Sospendere non è eliminare, ed è la ragione per cui serve: un fornitore con
// cui non si lavora più non si può cancellare (lo citano ordini e quotazioni di
// anni), ma non deve nemmeno continuare a comparire in ogni menu.
function toggleActive(coll, id, nome) {
  if (!roleGuard('manage')) return;
  const r = (db[coll] || []).find(x => x.id === id); if (!r) return;
  r.active = r.active === false;
  touch(r); saveDB(); renderManage();
  savedToast(`${nome} ${r.active ? 'riattivato' : 'sospeso'}`);
}
// Il pulsante e la pastiglia, uguali per le tre anagrafiche.
function activeBadge(r) {
  const susp = r.active === false;
  return `<span class="doc-badge ${susp ? 'st-sospeso' : 'st-attivo'}">${susp ? 'Sospeso' : 'Attivo'}</span>`;
}
function activeBtn(coll, r, nome) {
  const susp = r.active === false;
  const testo = susp ? 'Riattiva' : 'Sospendi: resta negli archivi, sparisce dai menu';
  return `<button class="mini-btn" onclick="toggleActive('${coll}',${jsAttr(r.id)},${jsAttr(nome)})" title="${esc(testo)}">${susp ? ico('check', 'tinted', 'Riattiva') : ico('pause', 'tinted', 'Sospendi')}</button>`;
}
function renderSuppliers() {
  const list = db.suppliers.map(s => {
    const loc = [s.city, s.province ? '(' + s.province + ')' : ''].filter(Boolean).join(' ');
    return `<div class="mgmt-item">
    <span class="mgmt-item-name">${esc(s.name)}</span>
    <span class="mgmt-item-meta">${esc(s.referente || '')} ${s.email ? '· ' + esc(s.email) : ''} ${s.phone ? '· ' + esc(s.phone) : ''} ${loc ? '· ' + esc(loc) : ''}</span>
    ${activeBadge(s)}
    <div class="mgmt-item-actions">
      ${activeBtn('suppliers', s, 'Fornitore')}
      <button class="mini-btn" onclick="editSupplierModal('${s.id}')" title="Modifica fornitore">${ico('edit', 'tinted', 'Modifica fornitore')}</button>
      <button class="mini-btn danger" onclick="delSupplier('${s.id}')" title="Elimina fornitore">${ico('trash', 'tinted', 'Elimina fornitore')}</button></div></div>`;
  }).join('') || '<div class="empty-text">Nessun fornitore.</div>';
  return `<div class="mgmt-panel"><div class="mgmt-list">${list}</div>
    <div class="mgmt-form">
      <input id="sup-name" placeholder="Nome fornitore">
      <input id="sup-ref" placeholder="Referente">
      <input id="sup-email" placeholder="Email">
      <input id="sup-phone" placeholder="Telefono">
      <button class="add-btn-sm" onclick="addSupplier()">+ Aggiungi</button></div>
    <p class="empty-text" style="text-align:left;padding:6px 0 0">Indirizzo completo e P.IVA si inseriscono con ${ico('edit', 'tinted', '')} Modifica.</p></div>`;
}
function addSupplier() {
  if (!roleGuard('manage')) return;
  const n = val('sup-name'); if (!n) { showToast('Nome richiesto', 'error'); return; }
  Store.insert('suppliers', { id: gid(), name: n, referente: val('sup-ref'), email: val('sup-email'),
    phone: val('sup-phone'), vat: '', street: '', streetNumber: '', zip: '', city: '', province: '', country: '',
    defaultTransport: '', defaultPayment: '', active: true });
  renderManage(); savedToast('Fornitore aggiunto');
}
function addressFieldsHtml(pfx, o) {
  o = o || {};
  return `<div class="modal-field" style="grid-column:1/-1"><label>Via / indirizzo</label><input id="${pfx}-street" value="${esc(o.street || '')}"></div>
    <div class="modal-field"><label>Numero civico</label><input id="${pfx}-num" value="${esc(o.streetNumber || '')}"></div>
    <div class="modal-field"><label>CAP</label><input id="${pfx}-zip" value="${esc(o.zip || '')}"></div>
    <div class="modal-field"><label>Città</label><input id="${pfx}-city" value="${esc(o.city || '')}"></div>
    <div class="modal-field"><label>Provincia</label><input id="${pfx}-prov" value="${esc(o.province || '')}" maxlength="4" placeholder="es. MO"></div>
    <div class="modal-field"><label>Stato</label><input id="${pfx}-country" value="${esc(o.country || '')}" placeholder="es. Italia"></div>`;
}
function readAddressFields(pfx) {
  return { street: val(pfx + '-street'), streetNumber: val(pfx + '-num'), zip: val(pfx + '-zip'),
    city: val(pfx + '-city'), province: val(pfx + '-prov').toUpperCase(), country: val(pfx + '-country') };
}
function editSupplierModal(id) {
  if (!roleGuard('manage')) return;
  const s = db.suppliers.find(x => x.id === id); if (!s) return;
  openModal(`<h3>${ico('edit', 'tinted pill', '')} Modifica fornitore</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Nome</label><input id="es-name" value="${esc(s.name)}"></div>
      <div class="modal-field"><label>Referente</label><input id="es-ref" value="${esc(s.referente || '')}"></div>
      <div class="modal-field"><label>Email</label><input id="es-email" value="${esc(s.email || '')}"></div>
      <div class="modal-field"><label>Telefono</label><input id="es-phone" value="${esc(s.phone || '')}"></div>
      <div class="modal-field"><label>P.IVA / C.F.</label><input id="es-vat" value="${esc(s.vat || '')}"></div>
      <div class="modal-field"><label>Pagamento predefinito</label>
        <input id="es-dpayment" list="sup-payment-opts" value="${esc(s.defaultPayment || '')}" placeholder="es. Bonifico 30gg">
        <datalist id="sup-payment-opts">${(db.settings.paymentOptions || []).map(o => `<option value="${esc(o)}"></option>`).join('')}</datalist></div>
      <div class="modal-field"><label>Trasporto predefinito</label>
        <input id="es-dtransport" list="sup-transport-opts" value="${esc(s.defaultTransport || '')}" placeholder="es. Porto franco">
        <datalist id="sup-transport-opts">${(db.settings.transportOptions || []).map(o => `<option value="${esc(o)}"></option>`).join('')}</datalist></div>
      ${addressFieldsHtml('es', s)}
      <div class="modal-field"><label>Trasporto conto lavoro (gg)</label><input id="es-transit" type="number" min="0" max="99" step="1" value="${Number(s.transitDays) || 0}"
        title="Giorni di trasporto verso e dal terzista, andata più ritorno: si sommano all'attraversamento di ogni tratta di conto lavoro affidata a questo fornitore"></div>
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveSupplier('${id}')">Salva</button></div>`, true);
}
function saveSupplier(id) {
  if (!roleGuard('manage')) return;
  const s = db.suppliers.find(x => x.id === id); if (!s) return;
  const nome = requireVal('es-name', 'Nome richiesto'); if (!nome) return;
  s.name = nome; s.referente = val('es-ref'); s.email = val('es-email');
  s.phone = val('es-phone'); s.vat = val('es-vat');
  s.defaultPayment = val('es-dpayment'); s.defaultTransport = val('es-dtransport');
  if (isNeg('es-transit')) { showToast('I giorni di trasporto non possono essere negativi', 'error'); return; }
  s.transitDays = Math.round(numVal('es-transit', 0, 99));
  Object.assign(s, readAddressFields('es'));
  touch(s);
  saveDB(); closeModal(); renderManage(); savedToast('Aggiornato');
}
// Dove compare un fornitore: articoli, quotazioni a listino, documenti,
// lavorazioni esterne di ciclo e movimenti di magazzino. Controllare i soli
// articoli lasciava riferimenti orfani — uno storico prezzi che punta a un
// fornitore che non esiste più.
function supplierUses(id) {
  const usi = [];
  const n = (a) => a.length;
  const articoli = (db.items || []).filter(i => i.supplierId === id);
  if (n(articoli)) usi.push(articoli.length + (articoli.length === 1 ? ' articolo' : ' articoli'));
  const quotati = (db.items || []).filter(i => (i.priceList || []).some(r => r.supplierId === id));
  if (n(quotati)) usi.push(quotati.length + (quotati.length === 1 ? ' listino' : ' listini'));
  const cicli = (db.items || []).filter(i => (i.cycle || []).some(r => r.kind === 'op' && r.supplierId === id));
  if (n(cicli)) usi.push(cicli.length + (cicli.length === 1 ? ' ciclo' : ' cicli'));
  const rfqs = (db.rfqs || []).filter(r => r.supplierId === id);
  if (n(rfqs)) usi.push(rfqs.length + (rfqs.length === 1 ? ' richiesta' : ' richieste'));
  const ordini = (db.orders || []).filter(o => o.supplierId === id);
  if (n(ordini)) usi.push(ordini.length + (ordini.length === 1 ? ' ordine' : ' ordini'));
  const odl = (db.workOrders || []).filter(o => o.supplierId === id);
  if (n(odl)) usi.push(odl.length + (odl.length === 1 ? ' ordine di lavoro' : ' ordini di lavoro'));
  const contoLavoro = (db.workCenters || []).filter(w => (w.suppliers || []).some(s => s.supplierId === id));
  if (n(contoLavoro)) usi.push(contoLavoro.length + (contoLavoro.length === 1 ? ' centro di lavoro (conto lavoro)' : ' centri di lavoro (conto lavoro)'));
  // I movimenti di conto lavoro. Non è un caso di confine: la scheda del
  // movimento **pretende** il terzista (`views-stock.js`, «senza, non si sa da
  // chi sta la merce»), quindi il riferimento c'è sempre. Cancellando il
  // fornitore, il prospetto «presso terzi» raggruppava sotto «senza fornitore»
  // materiale che è nostro e sta fisicamente da qualcuno: la domanda a cui quel
  // prospetto serve a rispondere — da chi stanno i pezzi — restava senza
  // risposta, e senza più niente da cui ricostruirla.
  const movimenti = (db.movements || []).filter(m => m.supplierId === id || m.fromSupplierId === id);
  if (n(movimenti)) usi.push(movimenti.length + (movimenti.length === 1 ? ' movimento di magazzino' : ' movimenti di magazzino'));
  return usi;
}
function delSupplier(id) {
  if (!roleGuard('manage')) return;
  const usi = supplierUses(id);
  if (usi.length) { showToast('Fornitore usato in: ' + usi.join(', '), 'error'); return; }
  askConfirm('Eliminare il fornitore?', () => {
    removeConUndo('suppliers', id, 'Fornitore eliminato', renderManage);
  });
}

// ─── Clienti ───
// L'anagrafica a monte delle commesse. Il campo Cliente della commessa resta
// testo — cambiare quel campo in un id vorrebbe dire riscrivere elenco,
// ricerca ed export delle commesse, e le commesse già scritte a mano
// resterebbero senza cliente — ma da qui si precompila, così due commesse
// dello stesso cliente non si chiamano più «Rossi Srl» e «Rossi S.r.l.».
function renderCustomers() {
  const list = (db.customers || []).map(c => {
    const loc = [c.city, c.province ? '(' + c.province + ')' : ''].filter(Boolean).join(' ');
    return `<div class="mgmt-item">
    <span class="mgmt-item-name">${esc(c.name)}</span>
    <span class="mgmt-item-meta">${esc(c.referente || '')} ${c.email ? '· ' + esc(c.email) : ''} ${c.phone ? '· ' + esc(c.phone) : ''} ${loc ? '· ' + esc(loc) : ''}</span>
    ${activeBadge(c)}
    <div class="mgmt-item-actions">
      ${activeBtn('customers', c, 'Cliente')}
      <button class="mini-btn" onclick="editCustomerModal('${c.id}')" title="Modifica cliente">${ico('edit', 'tinted', 'Modifica cliente')}</button>
      <button class="mini-btn danger" onclick="delCustomer('${c.id}')" title="Elimina cliente">${ico('trash', 'tinted', 'Elimina cliente')}</button></div></div>`;
  }).join('') || '<div class="empty-text">Nessun cliente.</div>';
  return `<div class="mgmt-panel"><div class="mgmt-list">${list}</div>
    <div class="mgmt-form">
      <input id="cli-name" placeholder="Nome cliente">
      <input id="cli-ref" placeholder="Referente">
      <input id="cli-email" placeholder="Email">
      <input id="cli-phone" placeholder="Telefono">
      <button class="add-btn-sm" onclick="addCustomer()">+ Aggiungi</button></div>
    <p class="empty-text" style="text-align:left;padding:6px 0 0">Indirizzo completo, P.IVA e note si inseriscono con ${ico('edit', 'tinted', '')} Modifica. I nomi di qui si propongono nel campo <strong>Cliente</strong> della commessa.</p></div>`;
}
// Il nome è la chiave con cui la commessa cita il cliente: due clienti omonimi
// renderebbero il riferimento ambiguo proprio dove serve a qualcosa.
function customerNameTaken(name, exceptId) {
  const n = String(name || '').trim().toLowerCase();
  return (db.customers || []).some(c => c.id !== exceptId && (c.name || '').trim().toLowerCase() === n);
}
function addCustomer() {
  if (!roleGuard('manage')) return;
  const n = val('cli-name'); if (!n) { showToast('Nome richiesto', 'error'); return; }
  if (customerNameTaken(n)) { showToast('Cliente già in anagrafica', 'error'); return; }
  Store.insert('customers', { id: gid(), name: n, referente: val('cli-ref'), email: val('cli-email'),
    phone: val('cli-phone'), vat: '', street: '', streetNumber: '', zip: '', city: '', province: '', country: '',
    notes: '', active: true });
  renderManage(); savedToast('Cliente aggiunto');
}
function editCustomerModal(id) {
  if (!roleGuard('manage')) return;
  const c = (db.customers || []).find(x => x.id === id); if (!c) return;
  openModal(`<h3>${ico('edit', 'tinted pill', '')} Modifica cliente</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Nome</label><input id="ec-name" value="${esc(c.name)}"></div>
      <div class="modal-field"><label>Referente</label><input id="ec-ref" value="${esc(c.referente || '')}"></div>
      <div class="modal-field"><label>Email</label><input id="ec-email" value="${esc(c.email || '')}"></div>
      <div class="modal-field"><label>Telefono</label><input id="ec-phone" value="${esc(c.phone || '')}"></div>
      <div class="modal-field"><label>P.IVA / C.F.</label><input id="ec-vat" value="${esc(c.vat || '')}"></div>
      ${addressFieldsHtml('ec', c)}
      <div class="modal-field" style="grid-column:1/-1"><label>Note</label><input id="ec-notes" value="${esc(c.notes || '')}"></div>
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveCustomer('${id}')">Salva</button></div>`, true);
}
function saveCustomer(id) {
  if (!roleGuard('manage')) return;
  const c = (db.customers || []).find(x => x.id === id); if (!c) return;
  const nome = val('ec-name');
  if (!nome) { showToast('Nome richiesto', 'error'); return; }
  if (customerNameTaken(nome, id)) { showToast('Cliente già in anagrafica', 'error'); return; }
  // Le commesse citano il cliente per nome: rinominarlo qui e non lì le
  // lascerebbe appese a un nome che in anagrafica non esiste più.
  const vecchio = c.name;
  c.name = nome; c.referente = val('ec-ref'); c.email = val('ec-email');
  c.phone = val('ec-phone'); c.vat = val('ec-vat'); c.notes = val('ec-notes');
  Object.assign(c, readAddressFields('ec'));
  touch(c);
  const rinominate = renameJobCustomer(vecchio, nome);
  saveDB(); closeModal(); renderManage();
  showToast(rinominate ? `Aggiornato · ${rinominate} ${rinominate === 1 ? 'commessa allineata' : 'commesse allineate'}` : 'Aggiornato');
}
// Propaga il nuovo nome alle commesse che portavano il vecchio.
function renameJobCustomer(vecchio, nuovo) {
  const da = String(vecchio || '').trim().toLowerCase();
  if (!da || da === String(nuovo || '').trim().toLowerCase()) return 0;
  let n = 0;
  (db.jobs || []).forEach(j => {
    if ((j.customer || '').trim().toLowerCase() === da) { j.customer = nuovo; touch(j); n++; }
  });
  return n;
}
// Dove compare un cliente: nelle commesse, per nome.
function customerJobs(id) {
  const c = (db.customers || []).find(x => x.id === id);
  if (!c) return [];
  const n = (c.name || '').trim().toLowerCase();
  if (!n) return [];
  return (db.jobs || []).filter(j => (j.customer || '').trim().toLowerCase() === n);
}
function delCustomer(id) {
  if (!roleGuard('manage')) return;
  const usate = customerJobs(id);
  if (usate.length) {
    showToast('Cliente usato in ' + usate.length + (usate.length === 1 ? ' commessa' : ' commesse'), 'error');
    return;
  }
  askConfirm('Eliminare il cliente?', () => {
    removeConUndo('customers', id, 'Cliente eliminato', renderManage);
  });
}

// ─── Famiglie / sottofamiglie ───
// Le sigle ripetute si segnano in rosso dove stanno, non solo in un elenco a
// parte: l'elenco dice che il problema esiste, il rosso dice quale riga toccare.
function siglaHtml(sigla, ripetute, size) {
  const dup = ripetute && ripetute.has(siglaKey(sigla));
  const col = dup ? 'var(--red)' : 'var(--text-dim)';
  return `<span style="font-family:var(--mono);color:${col};font-size:${size}"${dup ? ' title="Sigla ripetuta: dal codice non si risale più a quale delle due viene un articolo"' : ''}>[${esc(sigla)}]${dup ? ' ⚠' : ''}</span>`;
}
function familyPanelHtml(f, gruppi, dupFam) {
  const dupSub = new Set(gruppi.filter(g => g.familyId === f.id).map(g => g.sigla));
  const subs = (f.subs || []).map(s => `<div class="mgmt-item" style="padding:6px 12px">
      <span class="mgmt-item-name" style="font-size:13px;font-weight:500">${esc(s.name)} ${siglaHtml(s.sigla || siglaFromName(s.name), dupSub, '11px')}</span>
      <div class="mgmt-item-actions">
        <button class="mini-btn" onclick="editSubFamilyModal('${f.id}','${s.id}')" title="Modifica sottofamiglia">${ico('edit', 'tinted', 'Modifica sottofamiglia')}</button>
        <button class="mini-btn danger" onclick="delSubFamily('${f.id}','${s.id}')" title="Elimina sottofamiglia">${ico('trash', 'tinted', 'Elimina sottofamiglia')}</button></div></div>`).join('')
    || '<div class="empty-text" style="padding:6px 0">Nessuna sottofamiglia.</div>';
  return `<div class="mgmt-panel" style="margin-bottom:12px">
      <div class="mgmt-item" style="background:transparent;border:none;padding:0 0 10px">
        <span class="mgmt-item-name" style="font-size:15px;color:var(--accent)">${ico('folder', 'tinted', '')} ${esc(f.name)} ${siglaHtml(f.sigla || siglaFromName(f.name), dupFam, '12px')}</span>
        <div class="mgmt-item-actions">
          <button class="mini-btn" onclick="editFamilyModal('${f.id}')" title="Modifica macrofamiglia">${ico('edit', 'tinted', 'Modifica macrofamiglia')}</button>
          <button class="mini-btn danger" onclick="delFamily('${f.id}')" title="Elimina macrofamiglia">${ico('trash', 'tinted', 'Elimina macrofamiglia')}</button></div></div>
      <div class="mgmt-list" style="margin-bottom:10px">${subs}</div>
      <div class="mgmt-form">
        <input id="sub-name-${f.id}" placeholder="Nuova sottofamiglia">
        <input id="sub-sigla-${f.id}" placeholder="Sigla" maxlength="6" style="max-width:90px">
        <button class="add-btn-sm" onclick="addSubFamily('${f.id}')">+ Sottofamiglia</button></div>
    </div>`;
}
function renderFamilies(kind) {
  kind = kind || 'acquistato';
  const hint = kind === 'materiale' ? 'Nuova macrofamiglia (es. Acciaio)'
    : kind === 'parte' ? 'Nuova macrofamiglia (es. Lavorazioni meccaniche)'
    : 'Nuova macrofamiglia (es. Idraulico)';
  const gruppi = duplicateSiglaGroups(kind);
  const dupFam = new Set(gruppi.filter(g => g.dove === 'macrofamiglie').map(g => g.sigla));
  const blocks = (db.families || []).filter(f => (f.kind || 'acquistato') === kind)
    .map(f => familyPanelHtml(f, gruppi, dupFam)).join('')
    || '<div class="empty-text">Nessuna macrofamiglia.</div>';
  return `<div>${siglaWarnHtml(gruppi)}${blocks}
    <div class="mgmt-panel"><div class="mgmt-form">
      <input id="fam-name-${kind}" placeholder="${hint}">
      <input id="fam-sigla-${kind}" placeholder="Sigla" maxlength="6" style="max-width:90px">
      <button class="add-btn-sm" onclick="addFamily('${kind}')">+ Aggiungi macrofamiglia</button></div></div></div>`;
}
// Le sigle già ripetute quando la regola è entrata in vigore. Non si correggono
// d'ufficio: cambiare una sigla cambia il prefisso dei codici futuri di quella
// famiglia, e a decidere quale delle due tenere è una persona. Stessa scelta,
// e stesso tono, del controllo sui codici articolo duplicati in Gestione › Backup.
function siglaWarnHtml(gruppi) {
  if (!gruppi.length) return '';
  const righe = gruppi.map(g => `<div class="mgmt-item">
      <span class="mgmt-item-name"><span style="font-family:var(--mono);font-weight:700;color:var(--red)">${esc(g.sigla)}</span>
        — ${g.dove === 'macrofamiglie' ? 'macrofamiglie' : 'sottofamiglie di ' + esc(g.dove)}: ${g.nomi.map(esc).join(', ')}</span>
    </div>`).join('');
  return `<div class="mgmt-panel" style="margin-bottom:12px;border-color:var(--red)">
    <strong>${ico('warning', 'tinted', '')} Sigle ripetute (${gruppi.length})</strong>
    <p class="empty-text" style="text-align:left;padding:6px 0">La sigla compone il codice articolo — <span style="font-family:var(--mono)">CMM-MEC-CUS-007</span> — e ripetuta lo rende ambiguo: da quel codice non si risale più a quale delle due famiglie viene l'articolo. Da questa versione non se ne possono creare di nuove; queste erano già in archivio e vanno sciolte a mano, decidendo quale cambiare. I codici già assegnati non cambiano.</p>
    <div class="mgmt-list">${righe}</div></div>`;
}
function addFamily(kind) {
  if (!roleGuard('manage')) return;
  kind = kind || 'acquistato';
  const n = val('fam-name-' + kind); if (!n) { showToast('Nome richiesto', 'error'); return; }
  const sg = val('fam-sigla-' + kind);
  const sigla = sg ? sg.toUpperCase() : siglaFromName(n);
  const err = validateFamilySigla(sigla, kind, null, !sg);
  if (err) { showToast(err, 'error'); return; }
  Store.insert('families', { id: gid(), name: n, kind, sigla, subs: [] });
  renderManage(); savedToast('Macrofamiglia aggiunta');
}
function editFamilyModal(id) {
  if (!roleGuard('manage')) return;
  const f = getFamily(id); if (!f) return;
  openModal(`<h3>${ico('edit', 'tinted pill', '')} Modifica macrofamiglia</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Nome</label><input id="ef-name" value="${esc(f.name)}"></div>
      <div class="modal-field"><label>Sigla (per codifica)</label><input id="ef-sigla" value="${esc(f.sigla || siglaFromName(f.name))}" maxlength="6"></div>
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveFamily('${id}')">Salva</button></div>`);
}
function saveFamily(id) {
  if (!roleGuard('manage')) return;
  const f = getFamily(id); if (!f) return;
  // Il vecchio `val(...) || f.name` faceva sopravvivere il nome di prima e poi
  // annunciava «Aggiornata»: chi aveva svuotato il campo credeva di aver
  // rinominato, e non era successo niente.
  const nome = requireVal('ef-name', 'Nome richiesto'); if (!nome) return;
  const sg = val('ef-sigla');
  const sigla = sg ? sg.toUpperCase() : siglaFromName(nome);
  const err = validateFamilySigla(sigla, f.kind, f.id, !sg);
  if (err) { showToast(err, 'error'); return; }
  f.name = nome; f.sigla = sigla;
  touch(f);
  saveDB(); closeModal(); renderManage(); savedToast('Aggiornata');
}
function delFamily(id) {
  if (!roleGuard('manage')) return;
  const used = db.items.filter(i => i.familyId === id);
  if (used.length) { showToast('Famiglia usata da ' + used.length + ' articoli', 'error'); return; }
  askConfirm('Eliminare la macrofamiglia e le sue sottofamiglie?', () => {
    removeConUndo('families', id, 'Macrofamiglia eliminata', renderManage);
  });
}
function addSubFamily(familyId) {
  if (!roleGuard('manage')) return;
  const f = getFamily(familyId); if (!f) return;
  const n = val('sub-name-' + familyId); if (!n) { showToast('Nome richiesto', 'error'); return; }
  if (!f.subs) f.subs = [];
  const sg = val('sub-sigla-' + familyId);
  const sigla = sg ? sg.toUpperCase() : siglaFromName(n);
  const err = validateSubFamilySigla(sigla, familyId, null, !sg);
  if (err) { showToast(err, 'error'); return; }
  f.subs.push(stampNew({ id: gid(), name: n, sigla }));
  touch(f);
  saveDB(); renderManage(); savedToast('Sottofamiglia aggiunta');
}
function editSubFamilyModal(familyId, subId) {
  if (!roleGuard('manage')) return;
  const f = getFamily(familyId); const s = f && (f.subs || []).find(x => x.id === subId); if (!s) return;
  openModal(`<h3>${ico('edit', 'tinted pill', '')} Modifica sottofamiglia</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Nome (in ${esc(f.name)})</label><input id="esf-name" value="${esc(s.name)}"></div>
      <div class="modal-field"><label>Sigla (per codifica)</label><input id="esf-sigla" value="${esc(s.sigla || siglaFromName(s.name))}" maxlength="6"></div>
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveSubFamily('${familyId}','${subId}')">Salva</button></div>`);
}
function saveSubFamily(familyId, subId) {
  if (!roleGuard('manage')) return;
  const f = getFamily(familyId); const s = f && (f.subs || []).find(x => x.id === subId); if (!s) return;
  const nome = requireVal('esf-name', 'Nome richiesto'); if (!nome) return;
  const sg = val('esf-sigla');
  const sigla = sg ? sg.toUpperCase() : siglaFromName(nome);
  const err = validateSubFamilySigla(sigla, familyId, subId, !sg);
  if (err) { showToast(err, 'error'); return; }
  s.name = nome; s.sigla = sigla;
  touch(s);
  saveDB(); closeModal(); renderManage(); savedToast('Aggiornata');
}
function delSubFamily(familyId, subId) {
  if (!roleGuard('manage')) return;
  const used = db.items.filter(i => i.subFamilyId === subId);
  if (used.length) { showToast('Sottofamiglia usata da ' + used.length + ' articoli', 'error'); return; }
  askConfirm('Eliminare la sottofamiglia?', () => {
    const f = getFamily(familyId); if (!f) return;
    f.subs = (f.subs || []).filter(x => x.id !== subId);
    saveDB(); renderManage(); savedToast('Eliminata');
  });
}

function renderWorkCenters() {
  const list = db.workCenters.map(w => `<div class="mgmt-item">
    <span class="mgmt-item-name">${esc(w.name)}</span>
    <span class="mgmt-item-meta">${fmtN(w.hourlyRate)}/h${Number(w.capacityHours) > 0 ? ' · ' + fmtQtyIt(w.capacityHours) + ' h/sett' : ''}${Number(w.hoursPerDay) > 0 ? ' · ' + fmtQtyIt(w.hoursPerDay) + ' h/gg per operatore' : ''}${Number(w.queueDays) > 0 ? ' · coda ' + fmtQtyIt(w.queueDays) + ' gg' : ''}${(w.suppliers || []).length ? ' · ' + (w.suppliers || []).length + ((w.suppliers || []).length === 1 ? ' fornitore conto lavoro' : ' fornitori conto lavoro') : ''}</span>
    ${activeBadge(w)}
    <div class="mgmt-item-actions">
      ${activeBtn('workCenters', w, 'Centro di lavoro')}
      <button class="mini-btn" onclick="editWcModal('${w.id}')" title="Modifica centro di lavoro">${ico('edit', 'tinted', 'Modifica centro di lavoro')}</button>
      <button class="mini-btn danger" onclick="delWc('${w.id}')" title="Elimina centro di lavoro">${ico('trash', 'tinted', 'Elimina centro di lavoro')}</button></div></div>`).join('') || '<div class="empty-text">Nessun centro di lavoro.</div>';
  return `<div class="mgmt-panel"><div class="mgmt-list">${list}</div>
    <div class="mgmt-form">
      <input id="wc-name" placeholder="Nome (es. Tornitura)">
      <input id="wc-rate" type="number" min="0" step="0.5" placeholder="Tariffa ${esc(cur())}/h" title="Tariffa oraria del centro di lavoro, in ${esc(cur())} per ora">
      <input id="wc-cap" type="number" min="0" step="1" placeholder="Capacità h/sett" title="Ore totali disponibili a settimana, tutti gli operatori insieme. Lasciandolo a zero il carico si vede lo stesso, ma nessun sovraccarico viene segnalato">
      <button class="add-btn-sm" onclick="addWc()">+ Aggiungi</button></div></div>`;
}
function addWc() {
  if (!roleGuard('manage')) return;
  const n = val('wc-name'); if (!n) { showToast('Nome richiesto', 'error'); return; }
  if (isNeg('wc-rate')) { showToast('La tariffa non può essere negativa', 'error'); return; }
  if (isNeg('wc-cap')) { showToast('La capacità non può essere negativa', 'error'); return; }
  Store.insert('workCenters', { id: gid(), name: n, hourlyRate: numVal('wc-rate', 0),
    capacityHours: numVal('wc-cap', 0), active: true });
  renderManage(); savedToast('Centro di lavoro aggiunto');
}
function editWcModal(id) {
  if (!roleGuard('manage')) return;
  const w = db.workCenters.find(x => x.id === id); if (!w) return;
  window.__wcEditId = id;
  openModal(`<h3>${ico('edit', 'tinted pill', '')} Modifica centro di lavoro</h3>
    <div class="modal-field"><label>Nome</label><input id="ew-name" value="${esc(w.name)}"></div>
    <div class="modal-field"><label>Tariffa (${cur()}/h)</label><input id="ew-rate" type="number" min="0" step="0.5" value="${w.hourlyRate}"></div>
    <div class="modal-field"><label>Capacità (h/settimana, tutti gli operatori)</label>
      <input id="ew-cap" type="number" min="0" step="1" value="${Number(w.capacityHours) || 0}">
      <p class="empty-text" style="text-align:left;padding:4px 0 0">Le ore <strong>totali</strong> che il centro dà in una settimana, tutti gli operatori insieme: tre montatori per 40 ore sono 120. Le usa il <strong>Carico centri</strong>, e la capacità finita ne ricava le ore di un giorno. <strong>Zero significa «non dichiarata»</strong>, non «nessuna capacità»: il carico si vede lo stesso, ma nessun sovraccarico viene segnalato — altrimenti ogni centro risulterebbe sfondato dal primo giorno.</p></div>
    <div class="settings-group-title">${ico('clock', 'tinted', '')} Tempi per la programmazione</div>
    <div class="modal-grid">
      <div class="modal-field"><label>Ore al giorno di un operatore</label><input id="ew-hpd" type="number" min="0" max="24" step="0.5" value="${Number(w.hoursPerDay) || 0}"></div>
      <div class="modal-field"><label>Attrezzaggio per lotto (h)</label><input id="ew-setup" type="number" min="0" step="0.25" value="${Number(w.setupHours) || 0}"></div>
      <div class="modal-field"><label>Giorni di coda</label><input id="ew-queue" type="number" min="0" max="99" step="1" value="${Number(w.queueDays) || 0}"></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:4px 0 0">Da qui il fabbisogno ricava quanti <strong>giorni lavorativi</strong> dura una fase interna: (attrezzaggio + ore/pz × pezzi) ÷ (ore al giorno di un operatore × operatori della fase), arrotondato al giorno, più i giorni di coda (il tempo in cui il pezzo aspetta il suo turno). Gli operatori si scrivono sulla fase, nel ciclo. La capacità qui non entra: è la coda a capacità finita a dividere le ore del centro fra le fasi. <strong>Ore al giorno a zero</strong> = 8.</p>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveWc('${id}')">Salva</button></div>
    <div class="settings-group-title">${ico('factory', 'tinted', '')} Fornitori conto lavoro</div>
    <p style="color:var(--text-dim);margin-bottom:10px">Chi esegue questa lavorazione all'esterno, con la propria tariffa — proposta (e modificabile) quando si sceglie il fornitore in un ciclo.</p>
    <div id="wc-sup-body">${wcSuppliersBody(id)}</div>`, true, 'wc-edit');
}
onPanelClose('wc-edit', () => { window.__wcEditId = null; });
function saveWc(id) {
  if (!roleGuard('manage')) return;
  const w = db.workCenters.find(x => x.id === id); if (!w) return;
  const nome = requireVal('ew-name', 'Nome richiesto'); if (!nome) return;
  if (isNeg('ew-rate')) { showToast('La tariffa non può essere negativa', 'error'); return; }
  if (isNeg('ew-cap')) { showToast('La capacità non può essere negativa', 'error'); return; }
  if (isNeg('ew-hpd') || isNeg('ew-setup') || isNeg('ew-queue')) { showToast('I tempi non possono essere negativi', 'error'); return; }
  w.name = nome; w.hourlyRate = numVal('ew-rate', 0); w.capacityHours = numVal('ew-cap', 0);
  w.hoursPerDay = numVal('ew-hpd', 0, 24); w.setupHours = numVal('ew-setup', 0);
  w.queueDays = Math.round(numVal('ew-queue', 0, 99));
  touch(w);
  saveDB(); renderManage(); savedToast('Aggiornato');
}
function delWc(id) {
  if (!roleGuard('manage')) return;
  const usedAssiemi = db.items.filter(i => (i.operations || []).some(o => o.workCenterId === id));
  const usedCicli = db.items.filter(i => (i.cycle || []).some(r => r.kind === 'op' && r.workCenterId === id));
  const used = usedAssiemi.length + usedCicli.length;
  if (used) { showToast('Usato in ' + used + ' distinte', 'error'); return; }
  askConfirm('Eliminare il centro di lavoro?', () => {
    removeConUndo('workCenters', id, 'Centro di lavoro eliminato', renderManage);
  });
}
// ─── Fornitori conto lavoro di un centro di lavoro ───
// Stesso schema del listino prezzi articoli (views-catalog.js): un elenco di
// righe fornitore-tariffa sull'entità che le possiede, senza il concetto di
// "quotazione in uso" che lì serve e qui no — la scelta di quale fornitore
// usare si fa riga per riga nel ciclo, non qui.
function wcSuppliersBody(wcId) {
  const w = db.workCenters.find(x => x.id === wcId); if (!w) return '';
  const righe = (w.suppliers || []).map(s => `<tr>
    <td><select class="sel-cerca" onchange="wcSupplierSetField('${wcId}','${s.id}','supplierId',this.value)">${supplierOptions(s.supplierId || '')}</select></td>
    <td><input type="number" class="num" min="0" step="0.5" value="${s.rate || 0}" onchange="wcSupplierSetField('${wcId}','${s.id}','rate',this.value)"></td>
    <td><input type="text" value="${esc(s.note || '')}" placeholder="opzionale" onchange="wcSupplierSetField('${wcId}','${s.id}','note',this.value)"></td>
    <td class="pl-act"><button class="mini-btn danger" title="Rimuovi" onclick="wcSupplierDelRow('${wcId}','${s.id}')">${ico('trash', 'tinted', 'Rimuovi')}</button></td>
  </tr>`).join('');
  const vuoto = `<tr><td colspan="4" class="empty-text">Nessun fornitore conto lavoro registrato.</td></tr>`;
  // price-table: stessa classe del listino prezzi articoli, non solo lo stesso
  // schema — senza, select e input restavano alla loro larghezza nativa
  // (diversa riga per riga, secondo il testo scelto) invece di riempire la
  // colonna: è la disallineatura che si vedeva a schermo.
  return `<div class="table-wrap"><table class="price-table">
      <thead><tr><th scope="col">Fornitore</th><th scope="col">Tariffa (${esc(cur())}/h)</th><th scope="col">Nota</th><th scope="col"></th></tr></thead>
      <tbody>${righe || vuoto}</tbody></table></div>
    <div style="margin-top:10px"><button class="add-btn-sm" onclick="wcSupplierAddRow('${wcId}')">+ Aggiungi fornitore</button></div>`;
}
function wcSuppliersRefresh() {
  const host = document.getElementById('wc-sup-body');
  if (host && window.__wcEditId) host.innerHTML = wcSuppliersBody(window.__wcEditId);
}
function wcSupplierAddRow(wcId) {
  if (!roleGuard('manage')) return;
  const w = db.workCenters.find(x => x.id === wcId); if (!w) return;
  if (!Array.isArray(w.suppliers)) w.suppliers = [];
  w.suppliers.push({ id: gid(), supplierId: null, rate: 0, note: '' });
  touch(w); saveDB(); wcSuppliersRefresh(); renderManage();
}
function wcSupplierSetField(wcId, rowId, field, value) {
  if (!roleGuard('manage')) { wcSuppliersRefresh(); return; }
  const w = db.workCenters.find(x => x.id === wcId); if (!w) return;
  const row = (w.suppliers || []).find(x => x.id === rowId); if (!row) return;
  if (field === 'rate') row.rate = clampNum(parseFloat(value), 0);
  else if (field === 'supplierId') row.supplierId = value || null;
  else row.note = value;
  touch(w); saveDB(); wcSuppliersRefresh(); renderManage();
}
function wcSupplierDelRow(wcId, rowId) {
  if (!roleGuard('manage')) return;
  const w = db.workCenters.find(x => x.id === wcId); if (!w) return;
  w.suppliers = (w.suppliers || []).filter(x => x.id !== rowId);
  touch(w); saveDB(); wcSuppliersRefresh(); renderManage();
}

// ─── Unità di misura ───
// Quante volte un codice U.M. è usato in anagrafica articoli e nei documenti.
// ─── Concetti (parte "standardizzata" del nome delle Parti) ───
function conceptUsage(id) {
  return (db.items || []).filter(i => i.type === 'parte' && i.conceptId === id).length;
}
function renderConcepts() {
  const list = conceptList().map((c, i) => {
    const used = conceptUsage(c.id);
    return `<div class="mgmt-item">
      <span class="mgmt-item-name">${esc(c.name)}</span>
      <span class="mgmt-item-meta">${used ? 'usato ' + used + '×' : 'non usato'}</span>
      <div class="mgmt-item-actions">
        <button class="mini-btn" onclick="editConceptModal(${i})" title="Modifica concetto">${ico('edit', 'tinted', 'Modifica concetto')}</button>
        <button class="mini-btn danger" onclick="delConcept(${i})" title="Elimina concetto">${ico('trash', 'tinted', 'Elimina concetto')}</button>
      </div></div>`;
  }).join('') || '<div class="empty-text">Nessun concetto.</div>';
  return `<div class="mgmt-panel">
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Elenco dei <strong>concetti</strong> (sempre in <strong>MAIUSCOLO</strong>): la parte predeterminata del nome di una <strong>Parte</strong> (l'oggetto), completata da una descrizione libera — es. concetto <em>ALBERO</em> + <em>motore 20×100</em> → <em>ALBERO motore 20×100</em>. Un concetto in uso non può essere rinominato né eliminato.</p>
    <div class="mgmt-list">${list}</div>
    <div class="mgmt-form">
      <input id="concept-name" placeholder="Concetto (es. ALBERO)" style="text-transform:uppercase" oninput="this.value=this.value.toUpperCase()">
      <button class="add-btn-sm" onclick="addConcept()">+ Aggiungi</button></div></div>`;
}
function addConcept() {
  if (!roleGuard('manage')) return;
  const name = val('concept-name').trim().toUpperCase(); if (!name) { showToast('Nome richiesto', 'error'); return; }
  if (conceptList().some(c => c.name === name)) { showToast('Concetto già presente', 'error'); return; }
  db.settings.concepts.push({ id: gid(), name });
  saveDB(); renderManage(); savedToast('Concetto aggiunto');
}
function editConceptModal(i) {
  if (!roleGuard('manage')) return;
  const c = conceptList()[i]; if (!c) return;
  openModal(`<h3>${ico('edit', 'tinted pill', '')} Modifica concetto</h3>
    <div class="modal-field"><label>Concetto</label><input id="ecpt-name" value="${esc(c.name)}" style="text-transform:uppercase" oninput="this.value=this.value.toUpperCase()"></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveConcept(${i})">Salva</button></div>`);
}
function saveConcept(i) {
  if (!roleGuard('manage')) return;
  const c = conceptList()[i]; if (!c) return;
  const name = val('ecpt-name').trim().toUpperCase(); if (!name) { showToast('Nome richiesto', 'error'); return; }
  if (name !== c.name) {
    // Un concetto in uso è congelato: i nomi delle parti già composte non devono cambiare da soli
    if (conceptUsage(c.id)) { showToast('Concetto in uso: rinomina non consentita', 'error'); return; }
    if (conceptList().some((x, j) => j !== i && x.name === name)) { showToast('Concetto già presente', 'error'); return; }
  }
  c.name = name;
  saveDB(); closeModal(); renderManage(); savedToast('Aggiornato');
}
function delConcept(i) {
  if (!roleGuard('manage')) return;
  const c = conceptList()[i]; if (!c) return;
  const used = conceptUsage(c.id);
  if (used) { showToast(`Usato in ${used} parti`, 'error'); return; }
  askConfirm(`Eliminare il concetto "${c.name}"?`, () => {
    db.settings.concepts = conceptList().filter((_, j) => j !== i);
    saveDB(); renderManage(); savedToast('Eliminato');
  });
}

// Quante volte una U.M. è in uso. Conta anche la **seconda** unità degli
// articoli e quella delle righe di listino: una barra si gestisce in metri e si
// compra a chilo, e il chilo vive in altUom/priceUom, non in uom.
//
// Contarle non è pignoleria: su questo numero delUom decide se lasciar
// cancellare. Senza, l'unità che converte i prezzi di mezzo magazzino risultava
// «non usata» e spariva dall'elenco con un click, mentre gli articoli
// continuavano a portarsela scritta dentro.
function uomUsage(code) {
  let n = 0;
  (db.items || []).forEach(i => {
    if (i.uom === code) n++;
    if (i.altUom === code) n++;
    (i.priceList || []).forEach(r => { if (r.priceUom === code) n++; });
  });
  (db.rfqs || []).forEach(r => (r.lines || []).forEach(l => { if (l.uom === code) n++; }));
  (db.orders || []).forEach(o => (o.lines || []).forEach(l => { if (l.uom === code) n++; }));
  (db.workOrders || []).forEach(o => (o.lines || []).forEach(l => { if (l.uom === code) n++; }));
  return n;
}
function renderUoms() {
  const def = defaultUom();
  const list = uomList().map((u, i) => {
    const used = uomUsage(u.code);
    return `<div class="mgmt-item">
      <span class="mgmt-item-name" style="font-family:var(--mono)">${esc(u.code)}${u.code === def ? ' <span class="terms-default">predefinita</span>' : ''}</span>
      <span class="mgmt-item-meta">${esc(u.name || '—')}${used ? ' · usata ' + used + '×' : ''}</span>
      <div class="mgmt-item-actions">
        <button class="mini-btn" onclick="uomSetDefault(${i})" title="Imposta come predefinita">${u.code === def ? '★' : '☆'}</button>
        <button class="mini-btn" onclick="editUomModal(${i})" title="Modifica unità di misura">${ico('edit', 'tinted', 'Modifica unità di misura')}</button>
        <button class="mini-btn danger" onclick="delUom(${i})" title="Elimina unità di misura">${ico('trash', 'tinted', 'Elimina unità di misura')}</button>
      </div></div>`;
  }).join('') || '<div class="empty-text">Nessuna unità di misura.</div>';
  return `<div class="mgmt-panel">
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Elenco delle unità di misura selezionabili in anagrafica articoli e nelle righe di richieste di offerta e ordini. La voce con ★ è quella proposta per le nuove righe. Rinominando un codice l'aggiornamento si propaga a tutti gli articoli e documenti che lo usano.</p>
    <div class="mgmt-list">${list}</div>
    <div class="mgmt-form">
      <input id="uom-code" placeholder="Codice (es. kg)" maxlength="10">
      <input id="uom-name" placeholder="Descrizione (es. Chilogrammi)">
      <button class="add-btn-sm" onclick="addUom()">+ Aggiungi</button></div></div>`;
}
function addUom() {
  if (!roleGuard('manage')) return;
  const code = val('uom-code'); if (!code) { showToast('Codice richiesto', 'error'); return; }
  // Confronto senza distinguere maiuscole: «kg» e «KG» convivevano come due
  // unità distinte, uomUsage() le contava separate e renameUom() ne propagava
  // una sola, lasciando le altre righe appese al codice vecchio.
  if (uomList().some(u => (u.code || '').toLowerCase() === code.toLowerCase())) { showToast('Unità di misura già presente', 'error'); return; }
  db.settings.uoms.push({ code, name: val('uom-name') });
  saveDB(); renderManage(); savedToast('Unità di misura aggiunta');
}
function editUomModal(i) {
  if (!roleGuard('manage')) return;
  const u = uomList()[i]; if (!u) return;
  openModal(`<h3>${ico('edit', 'tinted pill', '')} Modifica unità di misura</h3>
    <div class="modal-field"><label>Codice</label><input id="euom-code" maxlength="10" value="${esc(u.code)}"></div>
    <div class="modal-field"><label>Descrizione</label><input id="euom-name" value="${esc(u.name || '')}"></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveUom(${i})">Salva</button></div>`);
}
function saveUom(i) {
  if (!roleGuard('manage')) return;
  const u = uomList()[i]; if (!u) return;
  const code = val('euom-code'); if (!code) { showToast('Codice richiesto', 'error'); return; }
  if (code !== u.code && uomList().some((x, j) => j !== i && x.code === code)) { showToast('Codice già in uso', 'error'); return; }
  if (code !== u.code) renameUom(u.code, code);
  u.code = code; u.name = val('euom-name');
  saveDB(); closeModal(); renderManage(); savedToast('Aggiornato');
}
// Propaga il nuovo codice ovunque sia referenziato (l'U.M. è salvata per valore)
// Rinominare propaga ovunque quel codice sia scritto — seconda unità e righe di
// listino comprese. Lasciandole indietro, l'articolo restava con un codice U.M.
// che nell'elenco non esisteva più: le conversioni continuavano a tornare
// (altUom e priceUom si guardano fra loro, non l'elenco), ma l'anagrafica e
// l'elenco raccontavano due cose diverse, e la differenza non si vedeva da
// nessuna parte finché qualcuno non apriva quel singolo articolo.
function renameUom(oldCode, newCode) {
  (db.items || []).forEach(it => {
    let tocca = false;
    if (it.uom === oldCode) { it.uom = newCode; tocca = true; }
    if (it.altUom === oldCode) { it.altUom = newCode; tocca = true; }
    (it.priceList || []).forEach(r => { if (r.priceUom === oldCode) { r.priceUom = newCode; tocca = true; } });
    if (tocca) touch(it);
  });
  (db.rfqs || []).forEach(r => (r.lines || []).forEach(l => { if (l.uom === oldCode) l.uom = newCode; }));
  (db.orders || []).forEach(o => (o.lines || []).forEach(l => { if (l.uom === oldCode) l.uom = newCode; }));
  (db.workOrders || []).forEach(o => (o.lines || []).forEach(l => { if (l.uom === oldCode) l.uom = newCode; }));
  if (db.settings.uomDefault === oldCode) db.settings.uomDefault = newCode;
}
function delUom(i) {
  if (!roleGuard('manage')) return;
  const u = uomList()[i]; if (!u) return;
  const used = uomUsage(u.code);
  if (used) { showToast(`Usata in ${used} tra articoli e righe documento`, 'error'); return; }
  askConfirm(`Eliminare l'unità di misura "${u.code}"?`, () => {
    db.settings.uoms = uomList().filter((_, j) => j !== i);
    if (db.settings.uomDefault === u.code) db.settings.uomDefault = '';
    saveDB(); renderManage(); savedToast('Eliminata');
  });
}
function uomSetDefault(i) {
  if (!roleGuard('manage')) return;
  const u = uomList()[i]; if (!u) return;
  db.settings.uomDefault = u.code;
  saveDB(); renderManage();
}

// ─── Le pagine delle impostazioni ───
// Ogni pagina mostra un argomento solo e ha il suo «Salva»: saveSettings
// legge i campi che trova a video, e quelli delle altre pagine restano com'erano.
function renderSettingsPage(corpo) {
  return `<div class="mgmt-panel">${corpo}
    <button class="add-btn-sm" onclick="saveSettings()">Salva impostazioni</button></div>`;
}
function renderCostSettings() {
  const s = db.settings;
  return `<h3 class="settings-group-title">${ico('euro', 'tinted', '')} Costi e margini</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Spese generali / overhead (%)</label><input type="number" id="set-ov" min="0" max="1000" step="0.1" value="${s.overheadPct}"></div>
      <div class="modal-field"><label>Margine / markup (%)</label><input type="number" id="set-mg" min="0" max="1000" step="0.1" value="${s.marginPct}"></div>
      <div class="modal-field"><label>Simbolo valuta</label><input id="set-cur" value="${esc(s.currency)}" maxlength="3"></div>
      ${moduloAttivo('costiReali') ? `<div class="modal-field"><label>Valore del magazzino</label>
      <select id="set-valore-mag"><option value="listino" ${s.valoreMagazzino !== 'medio' ? 'selected' : ''}>A listino (costo unitario in uso)</option>
      <option value="medio" ${s.valoreMagazzino === 'medio' ? 'selected' : ''}>A costo medio d'acquisto</option></select></div>` : ''}
    </div>
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Le percentuali sono i valori di default applicati a tutti i prodotti. Si possono sovrascrivere per singola macchina dalla "Modifica testata".${moduloAttivo('costiReali') ? '<br>Il <strong>valore del magazzino</strong> (modulo Costi reali) decide come si valorizzano giacenze, Cruscotto e differenze d\'inventario.' : ''}</p>`;
}
function renderCodeSettings() {
  const s = db.settings;
  return `<h3 class="settings-group-title">${ico('tag', 'tinted', '')} Codifica automatica articoli</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Cifre parte incrementale codice</label><input type="number" id="set-digits" min="1" max="10" step="1" value="${codeDigits()}"></div>
      <div class="modal-field"><label>Prefisso codice — Commerciali</label><input id="set-pfx-acq" maxlength="10" value="${esc(s.codePrefixAcquistato || 'CMM')}" placeholder="CMM"></div>
      <div class="modal-field"><label>Prefisso codice — Materie prime</label><input id="set-pfx-mat" maxlength="10" value="${esc(s.codePrefixMateriale || 'MAT')}" placeholder="MAT"></div>
      <div class="modal-field"><label>Prefisso codice — Parti</label><input id="set-pfx-prt" maxlength="10" value="${esc(s.codePrefixParte || 'PRT')}" placeholder="PRT"></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Le cifre della parte incrementale determinano lo zero-padding del progressivo (es. 3 → <span style="font-family:var(--mono)">${esc(s.codePrefixMateriale || 'MAT')}-ACC-LAM-001</span>). Il prefisso codice è la sigla iniziale usata nei codici automatici per commerciali, materie prime e parti.<br>Macchine, gruppi, sottogruppi e le parti legate a una macchina usano invece la <strong>codifica gerarchica</strong> (es. <span style="font-family:var(--mono)">TRN-BAS-001</span>), il cui schema si configura sulla singola macchina.</p>

    <h3 class="settings-group-title">${ico('wrench', 'tinted', '')} Nuove parti</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Approvvigionamento parte (default)</label><select id="set-partsourcing">${partSourcingOptions(defaultPartSourcing())}</select></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">L'approvvigionamento è quello proposto alle <strong>nuove</strong> parti, e da esso dipende anche da dove viene il costo: dal ciclo se prodotta in casa, dal listino se acquistata. Su ciascuna parte resta modificabile nella sua scheda; quelle già a catalogo non si toccano.</p>`;
}
// La durata della sessione sta con gli utenti: è una regola d'accesso, non un
// parametro di calcolo.
function renderAccessSettings() {
  return renderSettingsPage(`<h3 class="settings-group-title">${ico('lock', 'tinted', '')} Accesso</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Durata della sessione salvata (giorni)</label><input type="number" id="set-session" min="0" max="365" step="1" value="${sessionMaxDays()}"></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Passati questi giorni dall'ultimo accesso, "Ricordami su questo PC" smette di valere e va reinserita la password. <strong>0 = la sessione non scade mai</strong> (com'era fino alla 0.21.0): comodo su un PC personale, meno su una postazione condivisa in officina.</p>`);
}
// ─── Moduli ───
// Un interruttore per modulo (MODULI in core.js). Spegnere non cancella niente:
// lo dice la nota, perché è la prima cosa che chi spegne si chiede.
function renderModuliSettings() {
  const m = (db.settings && db.settings.modules) || {};
  // Le aree (core.js): accese finché non c'è scritto false. Un'area che ne
  // richiede un'altra si spegne da sola quando si toglie quella.
  const aree = Object.keys(AREE).map(k => {
    const a = AREE[k], richiesta = a.richiede ? AREE[a.richiede] : null;
    const bloccata = !!a.richiede && m[a.richiede] === false;
    return `<label style="display:flex;gap:8px;align-items:flex-start;margin:4px 0 8px">
      <input type="checkbox" class="set-area" value="${k}" ${m[k] !== false && !bloccata ? 'checked' : ''} ${bloccata ? 'disabled' : ''} ${a.richiede ? `data-richiede="${a.richiede}"` : ''} onchange="areeSettingsSync()" style="margin-top:3px">
      <span><strong>${esc(a.nome)}</strong>${richiesta ? ` <span class="empty-text" style="padding:0">(richiede ${esc(richiesta.nome)})</span>` : ''}<br><span class="empty-text" style="padding:0">${esc(a.descr)}</span></span></label>`;
  }).join('');
  return `<h3 class="settings-group-title">${ico('settings', 'tinted', '')} Aree</h3>
    <p class="empty-text" style="text-align:left;padding:0 0 8px">La base (anagrafiche, distinta base, acquisti e listini) c'è sempre. Le aree si aggiungono.</p>
    ${aree}
    <h3 class="settings-group-title">${ico('settings', 'tinted', '')} Moduli</h3>
    ${Object.keys(MODULI).map(k => `<label style="display:flex;gap:8px;align-items:flex-start;margin:4px 0 8px">
      <input type="checkbox" class="set-modulo" value="${k}" ${moduloAttivo(k) ? 'checked' : ''} style="margin-top:3px">
      <span><strong>${esc(MODULI[k].nome)}</strong><br><span class="empty-text" style="padding:0">${esc(MODULI[k].descr)}</span></span></label>`).join('')}
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Un modulo spento sparisce da schede, colonne e pulsanti, e il fabbisogno non ne tiene conto. <strong>I dati già scritti restano</strong>: riaccendendolo tornano com'erano. Con l'archivio condiviso la scelta vale per tutti i colleghi.${moduloAttivo('costiReali') ? ' Il valore del magazzino a costo medio si sceglie in <em>Costi e margini</em>.' : ''}</p>`;
}
function readModuliSettings() {
  const prima = (db.settings && db.settings.modules) || {};
  const out = Object.assign({}, prima);
  Array.from(document.querySelectorAll('.set-modulo') || []).forEach(x => { if (MODULI[x.value]) out[x.value] = !!x.checked; });
  Array.from(document.querySelectorAll('.set-area') || []).forEach(x => { if (AREE[x.value]) out[x.value] = !!x.checked; });
  return out;
}
// Un'area che ne richiede una spenta non si può accendere: la casella si
// spegne e si blocca, così si vede subito perché.
function areeSettingsSync() {
  const caselle = Array.from(document.querySelectorAll('.set-area') || []);
  caselle.forEach(x => {
    const r = x.getAttribute && x.getAttribute('data-richiede');
    if (!r) return;
    const dep = caselle.find(y => y.value === r);
    const ok = !dep || dep.checked;
    if (!ok) x.checked = false;
    x.disabled = !ok;
  });
}
// ─── Calendario di fabbrica ───
// I giorni in cui si lavora, per la programmazione a ritroso del fabbisogno
// (calendario.js). I festivi ricorrenti si scrivono come GG/MM; le chiusure —
// ferie, ponti, santo patrono — come intervalli con la data intera, una per
// riga: «2026-08-10 2026-08-21 Ferie estive».
const CAL_GIORNI = [[1, 'Lun'], [2, 'Mar'], [3, 'Mer'], [4, 'Gio'], [5, 'Ven'], [6, 'Sab'], [0, 'Dom']];
function renderCalendarSettings() {
  const c = calSettings();
  const lav = new Set((c.workDays || []).map(Number));
  const festivi = (c.holidays || []).map(h => { const [m, g] = String(h).split('-'); return g + '/' + m; }).join(', ');
  const chiusure = (c.closures || []).map(x => [x.from, x.to && x.to !== x.from ? x.to : '', x.note || ''].filter(Boolean).join(' ')).join('\n');
  return `<h3 class="settings-group-title">${ico('clock', 'tinted', '')} Calendario di fabbrica</h3>
    <div class="modal-field"><label>Giorni lavorativi</label><div style="display:flex;gap:12px;flex-wrap:wrap">
      ${CAL_GIORNI.map(([n, nome]) => `<label style="display:flex;gap:4px;align-items:center"><input type="checkbox" class="set-cal-day" value="${n}" ${lav.has(n) ? 'checked' : ''}> ${nome}</label>`).join('')}
    </div></div>
    <div class="modal-grid">
      <div class="modal-field"><label>Festivi ricorrenti (GG/MM)</label><input id="set-cal-hol" value="${esc(festivi)}" placeholder="01/01, 25/04, 01/05…"></div>
      <div class="modal-field"><label>Margine fra livelli di distinta (gg)</label><input type="number" id="set-sched-buf" min="0" max="99" step="1" value="${Number(db.settings.scheduleBufferDays) || 0}"></div>
    </div>
    <div class="modal-field"><label>Giorni di consegna di fornitori e terzisti</label><select id="set-cal-sup">
      <option value="lavorativi"${c.supplierDays !== 'calendario' ? ' selected' : ''}>Lavorativi (come il calendario di fabbrica)</option>
      <option value="calendario"${c.supplierDays === 'calendario' ? ' selected' : ''}>Di calendario (sabati, domeniche e festivi compresi)</option>
    </select></div>
    <label style="display:flex;gap:6px;align-items:center;margin:4px 0 8px"><input type="checkbox" id="set-cal-easter" ${c.easter !== false ? 'checked' : ''}> Pasquetta (calcolata ogni anno)</label>
    <div class="modal-field"><label>Chiusure (una per riga: dal [al] [nota], date AAAA-MM-GG)</label>
      <textarea id="set-cal-clo" rows="3" placeholder="2026-08-10 2026-08-21 Ferie estive">${esc(chiusure)}</textarea></div>
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Il fabbisogno programma <strong>a ritroso</strong> dalla consegna: le fasi interne e i montaggi si contano in giorni <strong>lavorativi</strong> di questo calendario. I giorni dei fornitori (consegna a listino, attraversamento e trasporto del terzista, ritardi confermati) seguono la scelta qui sopra: di serie lavorativi, o di calendario se i tuoi fornitori li dichiarano così. In ogni caso la data d'ordine o d'invio cade in un giorno lavorativo (se no si anticipa) e un arrivo previsto in un giorno di chiusura si sposta al primo lavorativo dopo. La soglia «da ordinare» del fabbisogno e del Riepilogo è di 5 giorni lavorativi. Il <strong>margine</strong> anticipa ancora di qualche giorno la data in cui un componente deve essere pronto rispetto all'inizio del lavoro sul padre.</p>`;
}
// Legge il calendario dal modulo. Le righe che non si capiscono si scartano e
// si dicono: un festivo scritto male e taciuto è un giorno di lavoro in più
// che nessuno ha deciso.
function readCalendarSettings() {
  const giorni = Array.from(document.querySelectorAll('.set-cal-day') || []).filter(x => x.checked).map(x => Number(x.value));
  const scartati = [];
  const holidays = [];
  String(val('set-cal-hol') || '').split(/[,;\s]+/).filter(Boolean).forEach(t => {
    const m = /^(\d{1,2})[\/.-](\d{1,2})$/.exec(t);
    const g = m ? Number(m[1]) : 0, mm = m ? Number(m[2]) : 0;
    if (!m || g < 1 || g > 31 || mm < 1 || mm > 12) { scartati.push(t); return; }
    holidays.push(String(mm).padStart(2, '0') + '-' + String(g).padStart(2, '0'));
  });
  const closures = [];
  const testo = (document.getElementById('set-cal-clo') || {}).value || '';
  String(testo).split('\n').map(r => r.trim()).filter(Boolean).forEach(r => {
    const m = /^(\d{4}-\d{2}-\d{2})(?:\s+(\d{4}-\d{2}-\d{2}))?\s*(.*)$/.exec(r);
    if (!m) { scartati.push(r); return; }
    const from = m[1], to = m[2] && m[2] >= m[1] ? m[2] : m[1];
    closures.push({ from, to, note: m[3] || '' });
  });
  const easterEl = document.getElementById('set-cal-easter');
  const supplierDays = val('set-cal-sup') === 'calendario' ? 'calendario' : 'lavorativi';
  return { cal: { workDays: giorni, holidays: Array.from(new Set(holidays)).sort(), easter: easterEl ? !!easterEl.checked : true, closures, supplierDays }, scartati };
}
function saveSettings() {
  if (!roleGuard('manage')) return;
  // Le etichette QR si controllano per prime: un indirizzo sbagliato non salva
  // niente, invece di salvare il resto e lasciare quello vecchio senza dirlo.
  const erroreQr = readQrSettings();
  if (erroreQr) { showToast(erroreQr, 'error'); return; }
  // Si legge solo quello che la pagina mostra (0.126.0): un campo che non è a
  // video tornerebbe vuoto, e azzererebbe il margine salvando il calendario.
  const c = id => !!document.getElementById(id);
  // Percentuali riportate dentro 0-1000 in silenzio, come già fa codeDigits qui sotto.
  if (c('set-ov')) {
    db.settings.overheadPct = numVal('set-ov', 0, 1000);
    db.settings.marginPct = numVal('set-mg', 0, 1000);
    db.settings.currency = val('set-cur') || '€';
  }
  if (c('set-partsourcing')) {
    const pso = val('set-partsourcing');
    db.settings.partSourcingDefault = PART_SOURCING[pso] ? pso : 'buy';
  }
  if (c('set-digits')) {
    const d = parseInt(val('set-digits'), 10);
    db.settings.codeDigits = (d >= 1 && d <= 10) ? d : 3;
    db.settings.codePrefixAcquistato = (val('set-pfx-acq') || 'CMM').toUpperCase();
    db.settings.codePrefixMateriale = (val('set-pfx-mat') || 'MAT').toUpperCase();
    db.settings.codePrefixParte = (val('set-pfx-prt') || 'PRT').toUpperCase();
  }
  if (c('set-session')) db.settings.sessionDays = numVal('set-session', 0, 365);
  if (document.querySelector && (document.querySelector('.set-modulo') || document.querySelector('.set-area'))) db.settings.modules = readModuliSettings();
  if (document.getElementById('set-valore-mag') && val('set-valore-mag')) db.settings.valoreMagazzino = val('set-valore-mag') === 'medio' ? 'medio' : 'listino';
  // Il calendario si sostituisce intero: calendario.js riconosce il cambio
  // dalla firma, e un oggetto nuovo non lascia dietro di sé pezzi del vecchio.
  let scartati = [];
  if (document.getElementById('set-cal-hol')) {
    const letto = readCalendarSettings();
    if (!letto.cal.workDays.length) { showToast('Serve almeno un giorno lavorativo', 'error'); return; }
    db.settings.calendar = letto.cal;
    db.settings.scheduleBufferDays = Math.round(numVal('set-sched-buf', 0, 99));
    if (typeof calInvalidate === 'function') calInvalidate();
    scartati = letto.scartati;
  }
  saveDB(); renderManage();
  // Un'area accesa o spenta cambia la barra dei comandi.
  if (typeof renderNav === 'function') renderNav();
  // Il resto è salvato; quello che non si è capito si dice dopo, o il toast
  // del salvataggio lo coprirebbe.
  if (scartati.length) showToast('Salvate, ma nel calendario non ho capito: ' + scartati.join(', '), 'error');
  else savedToast('Impostazioni salvate');
}
