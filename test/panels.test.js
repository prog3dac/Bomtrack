// Pannelli: le schede non sono più modali, restano aperte sopra una pagina
// viva. Quello che deve reggere è la contabilità delle finestre: una sola per
// chiave (perché lo stato di una scheda vive in una variabile globale), chiavi
// diverse che convivono, e closeModal() che chiude quella davanti — è la
// chiamata che ogni salvataggio fa dopo aver scritto.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');

function conPannelli() {
  const app = loadApp({ silent: true });
  app.asRole('admin');
  return app;
}
function aperti(app) { return app.el('modal-root').children; }
function chiave(p) { return p.dataset.panelKey; }

describe('apertura e riuso', () => {
  it('una scheda apre un pannello', () => {
    const app = conPannelli();
    app.eval('openModal("<h3>Prova</h3>")');
    assert.equal(aperti(app).length, 1);
    assert.equal(chiave(aperti(app)[0]), 'form');
  });

  it('la stessa chiave riusa il pannello invece di duplicarlo', () => {
    const app = conPannelli();
    app.eval('openModal("<h3>A</h3>", true, "listino"); openModal("<h3>B</h3>", true, "listino");');
    assert.equal(aperti(app).length, 1, 'due listini affiancati leggerebbero lo stesso articolo');
    assert.ok(aperti(app)[0].innerHTML.includes('<h3>B</h3>'), 'il contenuto è quello nuovo');
  });

  it('chiavi diverse convivono: si consulta il listino con una distinta aperta', () => {
    const app = conPannelli();
    app.eval('openModal("<h3>Listino</h3>", true, "listino"); openModal("<h3>Dove è usato</h3>", true, "usage");');
    assert.deepEqual(Array.from(aperti(app)).map(chiave), ['listino', 'usage']);
  });

  it('ogni pannello porta la sua ✕', () => {
    const app = conPannelli();
    app.eval('openModal("<h3>Prova</h3>")');
    assert.ok(aperti(app)[0].innerHTML.includes('panel-x'));
  });
});

describe('chiusura', () => {
  it('closeModal chiude la scheda in primo piano, non le altre', () => {
    const app = conPannelli();
    app.eval('openModal("<h3>Listino</h3>", true, "listino"); openModal("<h3>Form</h3>");');
    app.eval('closeModal()');
    assert.deepEqual(Array.from(aperti(app)).map(chiave), ['listino'], 'resta quella dietro');
  });

  it('in primo piano è quella riportata davanti per ultima', () => {
    const app = conPannelli();
    app.eval('openModal("<h3>Listino</h3>", true, "listino"); openModal("<h3>Usage</h3>", true, "usage");');
    app.eval('panelRaise(panelRoot().children[0])');   // si clicca sul listino
    app.eval('closeModal()');
    assert.deepEqual(Array.from(aperti(app)).map(chiave), ['usage']);
  });

  it('closeModal senza pannelli aperti non esplode', () => {
    const app = conPannelli();
    app.eval('closeModal(); closeModal();');
    assert.equal(aperti(app).length, 0);
  });

  it('gli z-index non arrivano a coprire il toast', () => {
    const app = conPannelli();
    app.eval('openModal("<h3>A</h3>", true, "listino"); openModal("<h3>B</h3>", true, "usage");');
    app.eval('for (let i = 0; i < 900; i++) panelRaise(panelRoot().children[i % 2]);');
    const z = Array.from(aperti(app)).map(p => Number(p.style.zIndex));
    assert.ok(Math.max.apply(null, z) < 999, 'sopra 999 il toast sparirebbe dietro ai pannelli');
    assert.notEqual(z[0], z[1], 'l\'ordine tra i pannelli resta definito');
  });

  it('chiuse tutte, gli z-index ripartono da capo', () => {
    const app = conPannelli();
    app.eval('openModal("<h3>A</h3>"); closeModal();');
    app.eval('openModal("<h3>B</h3>")');
    assert.equal(Number(aperti(app)[0].style.zIndex), app.eval('PANEL_Z') + 1);
  });
});

describe('un form aperto non si perde per sbaglio', () => {
  it('aprirne un altro, con il primo modificato, chiede conferma', () => {
    const app = conPannelli();
    let chiesto = 0;
    app.ctx.confirm = () => { chiesto++; return false; };
    app.eval('openModal("<h3>Primo</h3>")');
    // Dalla 0.105.6 si chiede solo se il form è cambiato: un campo finto,
    // fissato com'era all'apertura e poi modificato.
    const campo = { type: 'text', value: 'a' };
    aperti(app)[0].querySelectorAll = sel => (sel === 'input, select, textarea' ? [campo] : []);
    app.ctx.panelFissaStato(aperti(app)[0]);
    campo.value = 'b';
    app.eval('openModal("<h3>Secondo</h3>")');
    assert.equal(chiesto, 1);
    assert.ok(aperti(app)[0].innerHTML.includes('Primo'), 'rifiutando, il form aperto resta intatto');
  });

  it('le schede di consultazione non chiedono nulla', () => {
    const app = conPannelli();
    let chiesto = 0;
    app.ctx.confirm = () => { chiesto++; return true; };
    app.eval('openModal("<h3>A</h3>", true, "listino"); openModal("<h3>B</h3>", true, "listino");');
    assert.equal(chiesto, 0);
  });
});

describe('la domanda arriva solo se il form è stato davvero cambiato (dalla 0.105.6)', () => {
  // Il DOM finto non ha campi: se ne mettono di finti nel pannello, come li
  // troverebbe querySelectorAll nel browser.
  function conCampi(app, valori) {
    const p = aperti(app)[0];
    const campi = valori.map(v => (typeof v === 'boolean' ? { type: 'checkbox', checked: v, value: 'on' } : { type: 'text', value: v }));
    p.querySelectorAll = sel => (sel === 'input, select, textarea' ? campi : []);
    // Quello che nel browser fa il giro di coda dopo l'apertura: i valori che
    // il chiamante ha scritto nei campi diventano lo stato di partenza.
    app.ctx.panelFissaStato(p);
    return campi;
  }
  it('un form aperto e non toccato si sostituisce senza chiedere', () => {
    const app = conPannelli();
    let chiesto = 0;
    app.ctx.confirm = () => { chiesto++; return false; };
    app.eval('openModal("<h3>Primo</h3>")');
    conCampi(app, ['Cuscinetto', 'pz', true]);
    app.eval('openModal("<h3>Secondo</h3>")');
    assert.equal(chiesto, 0, 'non c\'è niente da perdere: la domanda è solo rumore');
    assert.ok(aperti(app)[0].innerHTML.includes('Secondo'));
  });
  it('un campo cambiato fa chiedere, e rifiutando il form resta', () => {
    const app = conPannelli();
    let chiesto = 0;
    app.ctx.confirm = () => { chiesto++; return false; };
    app.eval('openModal("<h3>Primo</h3>")');
    const campi = conCampi(app, ['Cuscinetto', 'pz']);
    campi[0].value = 'Cuscinetto 6204';
    app.eval('openModal("<h3>Secondo</h3>")');
    assert.equal(chiesto, 1);
    assert.ok(aperti(app)[0].innerHTML.includes('Primo'));
  });
  it('anche una casella spuntata conta come modifica', () => {
    const app = conPannelli();
    let chiesto = 0;
    app.ctx.confirm = () => { chiesto++; return true; };
    app.eval('openModal("<h3>Primo</h3>")');
    const campi = conCampi(app, [false]);
    campi[0].checked = true;
    app.eval('openModal("<h3>Secondo</h3>")');
    assert.equal(chiesto, 1);
  });
  it('un valore riportato com\'era non è una modifica', () => {
    const app = conPannelli();
    let chiesto = 0;
    app.ctx.confirm = () => { chiesto++; return true; };
    app.eval('openModal("<h3>Primo</h3>")');
    const campi = conCampi(app, ['A']);
    campi[0].value = 'B'; campi[0].value = 'A';
    app.eval('openModal("<h3>Secondo</h3>")');
    assert.equal(chiesto, 0);
  });
});
