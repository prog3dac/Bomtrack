// Accesso, sessione e primo amministratore.
// `auth.js` non aveva un solo test, ed è il file che decide chi entra e con
// quale ruolo: da currentUser dipendono tutte le guardie di scrittura.
//
// Non si verifica la sicurezza — non c'è, ed è dichiarato: con i dati in
// localStorage chi apre i DevTools legge tutto. Si verifica che le regole che
// l'app dichiara siano quelle che applica davvero, perché quando l'accesso
// passerà a Supabase Auth queste sono le prove che dicono se il comportamento
// è cambiato.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb } = require('./fixtures.js');

// App con il DOM finto già pronto: renderLogin/doLogin/logout lo attraversano.
function app(db) {
  const a = loadApp({ silent: true });
  a.setDb(db || makeDb({ users: [] }));
  return a;
}
// Crea un utente con password vera (l'hash passa da hashPassword, non è finto).
// `password` è un parametro dell'helper, non un campo del record: nel database
// finisce solo ciò che ci mette setUserPassword.
function conUtente(a, o) {
  const opt = o || {};
  const u = Object.assign({ id: 'u1', name: 'Anna Rossi', email: 'anna@ditta.it', role: 'admin', active: true }, opt);
  delete u.password;
  a.eval(`db.users.push(stampNew(${JSON.stringify(u)}));
          setUserPassword(db.users[db.users.length - 1], ${JSON.stringify(opt.password || 'segreta')});`);
  return u;
}
// Compila i campi del form di accesso e preme il pulsante.
function accedi(a, email, password, ricorda) {
  a.el('login-email').value = email;
  a.el('login-password').value = password;
  a.el('login-remember').checked = !!ricorda;
  a.eval('submitLogin()');
}
function erroreLogin(a) { const e = a.el('login-error'); return e.style.display === 'block' ? e.textContent : ''; }

describe('Password: hash, salt e verifica', () => {
  it('la password in chiaro non viene mai scritta nel record', () => {
    const a = app(); conUtente(a, { password: 'ciao1234' });
    const u = a.snapshot().users[0];
    assert.equal(u.password, undefined);
    assert.ok(u.passwordHash && u.passwordSalt);
    assert.ok(!JSON.stringify(u).includes('ciao1234'));
  });

  it('due utenti con la stessa password hanno hash diversi', () => {
    const a = app();
    conUtente(a, { id: 'u1', email: 'a@x.it', password: 'uguale' });
    conUtente(a, { id: 'u2', email: 'b@x.it', password: 'uguale' });
    const [x, y] = a.snapshot().users;
    assert.notEqual(x.passwordSalt, y.passwordSalt, 'il salt è per utente');
    assert.notEqual(x.passwordHash, y.passwordHash, 'senza salt diversi due hash uguali rivelerebbero password uguali');
  });

  it('verifyPassword accetta quella giusta e rifiuta tutto il resto', () => {
    const a = app(); conUtente(a, { password: 'segreta' });
    assert.equal(a.eval('verifyPassword(db.users[0], "segreta")'), true);
    assert.equal(a.eval('verifyPassword(db.users[0], "Segreta")'), false, 'maiuscole comprese');
    assert.equal(a.eval('verifyPassword(db.users[0], "")'), false);
    assert.equal(a.eval('verifyPassword(db.users[0], "segreta ")'), false);
  });

  it('un utente senza hash non entra con nessuna password', () => {
    const a = app();
    a.eval('db.users.push(stampNew({ id: "u9", name: "Vuoto", email: "v@x.it", role: "lettore", active: true }));');
    assert.equal(a.eval('verifyPassword(db.users[0], "")'), false);
    assert.equal(a.eval('verifyPassword(db.users[0], "qualsiasi")'), false);
    assert.equal(a.eval('verifyPassword(null, "x")'), false, 'nemmeno un utente inesistente');
  });

  it('cambiare password rigenera anche il salt', () => {
    const a = app(); conUtente(a, { password: 'vecchia' });
    const prima = a.snapshot().users[0];
    a.eval('setUserPassword(db.users[0], "nuova")');
    const dopo = a.snapshot().users[0];
    assert.notEqual(dopo.passwordSalt, prima.passwordSalt);
    assert.equal(a.eval('verifyPassword(db.users[0], "nuova")'), true);
    assert.equal(a.eval('verifyPassword(db.users[0], "vecchia")'), false);
  });
});

describe('Primo avvio: nessuna credenziale predefinita nel codice', () => {
  it('senza utenti l\'app chiede di creare l\'amministratore', () => {
    const a = app();
    assert.equal(a.eval('needsSetup()'), true);
  });

  it('il primo utente creato è amministratore e resta collegato', () => {
    const a = app();
    a.el('login-name').value = 'Anna Rossi';
    a.el('login-email').value = 'anna@ditta.it';
    a.el('login-password').value = 'segreta';
    a.eval('submitLogin()');   // in setup submitLogin devia su createFirstAdmin
    const s = a.snapshot();
    assert.equal(s.users.length, 1);
    assert.equal(s.users[0].role, 'admin');
    assert.equal(a.eval('currentUser && currentUser.email'), 'anna@ditta.it');
    assert.equal(a.eval('needsSetup()'), false);
  });

  it('il nuovo amministratore diventa l\'autore delle modifiche', () => {
    const a = app();
    a.el('login-name').value = 'Anna';
    a.el('login-email').value = 'anna@ditta.it';
    a.el('login-password').value = 'segreta';
    a.eval('submitLogin()');
    assert.equal(a.eval('Store.getActor()'), a.snapshot().users[0].id,
      'senza actor i campi createdBy/updatedBy resterebbero vuoti');
  });

  it('nome, email o password troppo corta: nessun utente creato', () => {
    const casi = [
      { name: '', email: 'a@x.it', pass: 'segreta', atteso: /nome/i },
      { name: 'Anna', email: '', pass: 'segreta', atteso: /email/i },
      { name: 'Anna', email: 'a@x.it', pass: '123', atteso: /4 caratteri/i },
    ];
    casi.forEach(c => {
      const a = app();
      a.el('login-name').value = c.name;
      a.el('login-email').value = c.email;
      a.el('login-password').value = c.pass;
      a.eval('submitLogin()');
      assert.match(erroreLogin(a), c.atteso);
      assert.equal(a.snapshot().users.length, 0);
      assert.equal(a.eval('currentUser'), null);
    });
  });

  it('il primo accesso viene salvato: non serve rifarlo al riavvio', () => {
    const a = app();
    a.el('login-name').value = 'Anna';
    a.el('login-email').value = 'anna@ditta.it';
    a.el('login-password').value = 'segreta';
    a.eval('submitLogin()');
    assert.ok(a.storage.getItem('bomtrack_session'), 'la sessione va persistita');
  });
});

describe('Accesso', () => {
  it('credenziali giuste: si entra', () => {
    const a = app(); conUtente(a);
    accedi(a, 'anna@ditta.it', 'segreta');
    assert.equal(a.eval('currentUser && currentUser.id'), 'u1');
    assert.equal(erroreLogin(a), '');
  });

  it('l\'email non è sensibile alle maiuscole né agli spazi', () => {
    const a = app(); conUtente(a);
    accedi(a, '  ANNA@Ditta.IT  ', 'segreta');
    assert.equal(a.eval('currentUser && currentUser.id'), 'u1');
  });

  it('password sbagliata e utente inesistente danno lo STESSO messaggio', () => {
    const a1 = app(); conUtente(a1);
    accedi(a1, 'anna@ditta.it', 'sbagliata');
    const a2 = app(); conUtente(a2);
    accedi(a2, 'nessuno@ditta.it', 'segreta');
    assert.equal(erroreLogin(a1), erroreLogin(a2),
      'un messaggio diverso rivelerebbe quali email esistono in azienda');
    assert.equal(a1.eval('currentUser'), null);
    assert.equal(a2.eval('currentUser'), null);
  });

  it('dopo un tentativo fallito il campo password viene svuotato', () => {
    const a = app(); conUtente(a);
    accedi(a, 'anna@ditta.it', 'sbagliata');
    assert.equal(a.el('login-password').value, '');
  });

  it('account sospeso: non entra, e lo dice', () => {
    const a = app(); conUtente(a, { active: false });
    accedi(a, 'anna@ditta.it', 'segreta');
    assert.match(erroreLogin(a), /sospeso/i);
    assert.equal(a.eval('currentUser'), null);
  });

  it('campi vuoti: si viene fermati prima di cercare l\'utente', () => {
    const a = app(); conUtente(a);
    accedi(a, '', 'segreta');
    assert.match(erroreLogin(a), /email/i);
    accedi(a, 'anna@ditta.it', '');
    assert.match(erroreLogin(a), /password/i);
    assert.equal(a.eval('currentUser'), null);
  });

  it('"Ricordami" salva l\'email, ma mai la password', () => {
    const a = app(); conUtente(a);
    accedi(a, 'anna@ditta.it', 'segreta', true);
    assert.equal(a.storage.getItem('bomtrack_saved_email'), 'anna@ditta.it');
    assert.ok(!JSON.stringify(a.storage._map ? [...a.storage._map.values()] : []).includes('segreta'));
  });

  it('senza "Ricordami" l\'email salvata in precedenza viene tolta', () => {
    const a = app(); conUtente(a);
    a.storage.setItem('bomtrack_saved_email', 'anna@ditta.it');
    accedi(a, 'anna@ditta.it', 'segreta', false);
    assert.equal(a.storage.getItem('bomtrack_saved_email'), null);
  });
});

describe('Un PC scollegato dall\'archivio condiviso', () => {
  // Gli utenti arrivano da Supabase senza password: quelle le teneva Supabase.
  const scollegato = () => app(makeDb({ users: [
    { id: 'u1', name: 'Anna', email: 'anna@ditta.it', role: 'admin', active: true, passwordHash: '', passwordSalt: '' },
    { id: 'u2', name: 'Bruno', email: 'bruno@ditta.it', role: 'acquisti', active: true, passwordHash: '', passwordSalt: '' }] }));

  it('l\'amministratore entra, e la password che scrive diventa quella del PC', () => {
    const a = scollegato();
    accedi(a, 'anna@ditta.it', 'nuova-pw');
    assert.equal(a.eval('currentUser && currentUser.id'), 'u1');
    a.eval('logout()');
    accedi(a, 'anna@ditta.it', 'altra');
    assert.equal(a.eval('currentUser'), null, 'da lì in poi vale solo quella');
    accedi(a, 'anna@ditta.it', 'nuova-pw');
    assert.equal(a.eval('currentUser && currentUser.id'), 'u1');
  });

  it('chi non è amministratore no: aspetta che l\'amministratore gli dia una password', () => {
    const a = scollegato();
    accedi(a, 'bruno@ditta.it', 'qualsiasi');
    assert.equal(a.eval('currentUser'), null);
  });

  // 0.105.4: chi ha scollegato è scritto, e la strada è solo sua.
  it('la prima password è solo dell\'amministratore che ha scollegato', () => {
    const a = app(makeDb({ users: [
      { id: 'u1', name: 'Anna', email: 'anna@ditta.it', role: 'admin', active: true, passwordHash: '', passwordSalt: '' },
      { id: 'u3', name: 'Carlo', email: 'carlo@ditta.it', role: 'admin', active: true, passwordHash: '', passwordSalt: '' }] }));
    a.storage.setItem('bomtrack_scollegato_da', JSON.stringify({ id: 'u3' }));
    accedi(a, 'anna@ditta.it', 'nuova-pw');
    assert.equal(a.eval('currentUser'), null, 'un altro amministratore no');
    accedi(a, 'carlo@ditta.it', 'nuova-pw');
    assert.equal(a.eval('currentUser && currentUser.id'), 'u3');
  });

  it('se qualcuno ha già una password, la strada è chiusa', () => {
    const a = app(); conUtente(a, { id: 'u9', email: 'zeta@ditta.it' });
    a.eval(`db.users.push(stampNew({ id: 'u1', name: 'Anna', email: 'anna@ditta.it', role: 'admin', active: true, passwordHash: '', passwordSalt: '' }))`);
    accedi(a, 'anna@ditta.it', 'nuova-pw');
    assert.equal(a.eval('currentUser'), null);
  });
});

describe('Sessione salvata', () => {
  function conSessione(a, ts, userId) {
    a.storage.setItem('bomtrack_session', JSON.stringify({ userId: userId || 'u1', ts }));
  }

  it('si rientra senza reinserire la password', () => {
    const a = app(); conUtente(a);
    conSessione(a, new Date().toISOString());
    assert.equal(a.eval('restoreSession()'), true);
    assert.equal(a.eval('currentUser && currentUser.id'), 'u1');
  });

  it('utente cancellato dal database: la sessione non vale più', () => {
    const a = app(); conUtente(a);
    conSessione(a, new Date().toISOString(), 'sparito');
    assert.equal(a.eval('restoreSession()'), false);
    assert.equal(a.storage.getItem('bomtrack_session'), null, 'la sessione morta va rimossa, non lasciata lì');
  });

  it('utente sospeso nel frattempo: non rientra', () => {
    const a = app(); conUtente(a, { active: false });
    conSessione(a, new Date().toISOString());
    assert.equal(a.eval('restoreSession()'), false);
  });

  it('sessione più vecchia della durata configurata: scaduta', () => {
    const a = app(); conUtente(a);
    a.eval('db.settings.sessionDays = 30');
    conSessione(a, new Date(Date.now() - 31 * 86400000).toISOString());
    assert.equal(a.eval('restoreSession()'), false, 'il ts scritto al login ora viene davvero letto');
    assert.equal(a.storage.getItem('bomtrack_session'), null);
  });

  it('entro la durata configurata: ancora valida', () => {
    const a = app(); conUtente(a);
    a.eval('db.settings.sessionDays = 30');
    conSessione(a, new Date(Date.now() - 29 * 86400000).toISOString());
    assert.equal(a.eval('restoreSession()'), true);
  });

  it('sessionDays = 0: non scade mai (comportamento fino alla 0.21.0)', () => {
    const a = app(); conUtente(a);
    a.eval('db.settings.sessionDays = 0');
    conSessione(a, new Date(Date.now() - 3650 * 86400000).toISOString());
    assert.equal(a.eval('restoreSession()'), true);
  });

  it('data illeggibile o assente: si considera scaduta', () => {
    const a = app(); conUtente(a);
    a.eval('db.settings.sessionDays = 30');
    conSessione(a, 'non-una-data');
    assert.equal(a.eval('restoreSession()'), false);
    conSessione(a, undefined);
    assert.equal(a.eval('restoreSession()'), false, 'meglio richiedere la password che fidarsi di un\'età sconosciuta');
  });

  it('JSON corrotto in localStorage non lancia', () => {
    const a = app(); conUtente(a);
    a.storage.setItem('bomtrack_session', '{rotto');
    assert.doesNotThrow(() => a.eval('restoreSession()'));
    assert.equal(a.eval('restoreSession()'), false);
  });

  it('nessuna sessione salvata: si va alla schermata di accesso', () => {
    const a = app(); conUtente(a);
    assert.equal(a.eval('restoreSession()'), false);
  });
});

describe('Uscita', () => {
  it('logout dimentica utente, autore e sessione', () => {
    const a = app(); conUtente(a);
    accedi(a, 'anna@ditta.it', 'segreta');
    a.eval('logout()');
    assert.equal(a.eval('currentUser'), null);
    assert.equal(a.eval('Store.getActor()'), null, 'altrimenti le modifiche successive resterebbero firmate da chi è uscito');
    assert.equal(a.storage.getItem('bomtrack_session'), null);
  });

  it('l\'email ricordata sopravvive all\'uscita: è una comodità, non una sessione', () => {
    const a = app(); conUtente(a);
    accedi(a, 'anna@ditta.it', 'segreta', true);
    a.eval('logout()');
    assert.equal(a.storage.getItem('bomtrack_saved_email'), 'anna@ditta.it');
  });
});

describe('Cambio della propria password', () => {
  function pronto(pass) {
    const a = app(); conUtente(a, { password: pass || 'vecchia' });
    accedi(a, 'anna@ditta.it', pass || 'vecchia');
    return a;
  }
  function compila(a, vecchia, nuova, ripeti) {
    a.el('cp-old').value = vecchia; a.el('cp-new').value = nuova; a.el('cp-new2').value = ripeti;
    a.eval('saveOwnPassword()');
  }

  it('con la password attuale giusta, la nuova vale subito', () => {
    const a = pronto();
    compila(a, 'vecchia', 'nuovissima', 'nuovissima');
    assert.equal(a.eval('verifyPassword(db.users[0], "nuovissima")'), true);
    assert.equal(a.eval('verifyPassword(db.users[0], "vecchia")'), false);
  });

  it('password attuale sbagliata: non cambia nulla', () => {
    const a = pronto();
    compila(a, 'sbagliata', 'nuovissima', 'nuovissima');
    assert.equal(a.eval('verifyPassword(db.users[0], "vecchia")'), true);
  });

  it('le due nuove password devono coincidere', () => {
    const a = pronto();
    compila(a, 'vecchia', 'nuovissima', 'diversa');
    assert.equal(a.eval('verifyPassword(db.users[0], "vecchia")'), true);
  });

  it('la nuova password deve avere almeno 4 caratteri', () => {
    const a = pronto();
    compila(a, 'vecchia', '123', '123');
    assert.equal(a.eval('verifyPassword(db.users[0], "vecchia")'), true);
  });

  it('il cambio viene salvato, non resta solo in memoria', () => {
    const a = pronto();
    compila(a, 'vecchia', 'nuovissima', 'nuovissima');
    a.ref('Store').load();
    assert.equal(a.eval('verifyPassword(db.users[0], "nuovissima")'), true);
  });
});

describe('Ruoli: chi può scrivere cosa', () => {
  it('la matrice dei permessi è quella dichiarata', () => {
    const a = app();
    const puo = (ruolo, area) => { a.asRole(ruolo); return a.eval(`canWrite(${JSON.stringify(area)})`); };
    assert.equal(puo('admin', 'manage'), true);
    assert.equal(puo('acquisti', 'docs'), true);
    assert.equal(puo('acquisti', 'catalog'), false);
    assert.equal(puo('progettazione', 'bom'), true);
    assert.equal(puo('progettazione', 'docs'), false);
    ['catalog', 'bom', 'docs', 'manage'].forEach(x => assert.equal(puo('lettore', x), false, 'lettore su ' + x));
  });

  it('senza sessione non si scrive nulla', () => {
    const a = app();
    a.eval('currentUser = null');
    ['catalog', 'bom', 'docs', 'manage'].forEach(x => assert.equal(a.eval(`canWrite(${JSON.stringify(x)})`), false));
  });

  it('un ruolo sconosciuto non eredita permessi', () => {
    const a = app(); a.asRole('direttore');
    ['catalog', 'bom', 'docs', 'manage'].forEach(x => assert.equal(a.eval(`canWrite(${JSON.stringify(x)})`), false));
    assert.equal(a.eval('isAdmin()'), false);
  });

  it('activeAdmins conta solo gli amministratori attivi', () => {
    const a = app();
    a.eval(`db.users = [
      { id: 'a1', role: 'admin', active: true },
      { id: 'a2', role: 'admin', active: false },
      { id: 'p1', role: 'progettazione', active: true }];`);
    assert.equal(a.eval('activeAdmins().length'), 1);
    assert.equal(a.eval('activeAdmins("a1").length'), 0,
      'escludendo l\'unico admin attivo non ne resta nessuno: è la guardia che impedisce di chiudersi fuori');
  });
});
