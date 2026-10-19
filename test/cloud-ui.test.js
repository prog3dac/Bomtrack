// L'archivio condiviso dall'interfaccia, nel Chromium vero: collegare il PC
// dalla schermata d'accesso, entrare con Supabase, caricare; un collega che
// arriva dal link, trova l'accesso sospeso, viene attivato e scarica. La
// pagina la guida test/cloud-browser.js; qui si decide se è giusto.
// Servono Playwright e un Postgres (BOMTRACK_PG): in CI ci sono entrambi.
const assert = require('node:assert/strict');
const path = require('node:path');
const { describe, it } = require('./tap.js');
const pg = require('./pg.js');

let playwright = null;
try { require.resolve('playwright'); playwright = true; } catch (e) { playwright = false; }
describe('Archivio condiviso: nel browser vero', () => {
  if (!playwright) { it('saltato: Playwright non disponibile (in CI c\'è)', () => {}); return; }
  if (!pg.disponibile()) { it('saltato: BOMTRACK_PG non impostata (vedi test/pg.js)', () => {}); return; }
  const { execFileSync } = require('node:child_process');
  const r = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'cloud-browser.js')], { encoding: 'utf8', env: process.env, timeout: 180000 }));
  if (r.errore) { it('il browser è partito', () => assert.fail(r.errore)); return; }
  it('dalla schermata d\'accesso si collega il PC, e la schermata lo dice', () => {
    assert.match(r.notaLocale, /Collega un archivio condiviso/);
    assert.match(r.notaCloud, /email e la password di Supabase/);
  });
  it('il primo amministratore carica il suo archivio, ed entra con l\'id di Supabase', () => {
    assert.equal(r.primoA, 'Carica questo archivio');
    assert.equal(r.serverArticoli, r.localeArticoli);
    assert.ok(r.serverArticoli > 0);
    assert.equal(r.utenteA.ruolo, 'admin');
  });
  it('il link di collegamento porta indirizzo e chiave, e poi sparisce dall\'indirizzo', () => {
    assert.match(r.link, /\?supabase=.*&chiave=/);
    assert.equal(r.indirizzoPulito, true);
  });
  it('un collega invitato resta fuori finché l\'amministratore non lo attiva', () => {
    assert.match(r.sospesoB, /non è ancora attivo/);
    assert.ok(r.utentiA.includes('Bruno'));
  });
  it('attivato, scarica l\'archivio condiviso con il suo ruolo; al telefono senza scorrere di lato', () => {
    assert.equal(r.primoB, 'Scarica l\'archivio condiviso');
    assert.equal(r.localeB, r.localeArticoli);
    assert.equal(r.ruoloB, 'acquisti');
    assert.equal(r.scrollOrizzontaleB, false);
  });
  it('una modifica dell\'uno arriva all\'altro', () => {
    assert.equal(r.serverNome, 'Rinominato da Anna');
    assert.equal(r.nomeB, 'Rinominato da Anna');
    assert.equal(r.statoB, 'ok');
  });
  it('uscendo la sessione di Supabase se ne va', () => {
    assert.deepEqual(r.dopoUscita, { sessione: false, login: 'flex' });
  });
  it('nessun errore nella pagina', () => assert.deepEqual(r.errori, []));
});
