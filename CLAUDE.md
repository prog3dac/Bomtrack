# Bomtrack — regole per chi modifica il codice

Bomtrack è una web app senza build: classic script caricati in sequenza da
`index.html`, uno scope globale solo, nessuna dipendenza npm. Si apre anche con
un doppio clic (`file://`). L'archivio condiviso è su Supabase
(`supabase/schema.sql`). Testi, commenti e messaggi sono in italiano.

## Prima di aprire o aggiornare una PR

1. `node test/run.js` deve finire con `0 fallito/i`. Con un Postgres locale
   (`BOMTRACK_PG="host=localhost port=5432 user=postgres"`) girano anche i test
   dello schema; con Playwright (`NODE_PATH="$(npm root -g)"`) quelli nel
   browser. In CI girano tutti.
2. Scrivi la voce in cima a `CHANGELOG.md` (`### 0.x.y — data`, con un numero
   qualsiasi), e aggiorna `MANUALE.md` se cambia qualcosa per chi usa l'app.
3. **Il numero di versione si decide per ultimo**, con
   `node tools/versione.js minor` (funzioni nuove) o `patch` (solo correzioni).
   Lo script fonde `origin/main`, dà alla voce il numero dopo quello di main e
   lo scrive in `APP_VERSION` (`core.js`), `sw.js`, `MANUALE.md`,
   `manuale.html` e nei commenti «dalla 0.x.y» che il ramo ha aggiunto. Va
   rilanciato ogni volta che main va avanti prima del merge. Non rinumerare a
   mano.
4. `manuale.html` non si scrive a mano: `python3 genera-manuale.py`.

## Cose che la suite controlla, e perché

- **Uno script nuovo** va in `index.html`, in `test/harness.js` (stesso ordine)
  e nell'elenco `FILE` di `sw.js`. Prima di `import-export.js`, che è l'ultimo.
- **Nessun nome globale ripetuto** fra gli script: vincerebbe l'ultimo, in
  silenzio.
- **Ogni funzione la chiama qualcuno** (app, pagina o test). Un pezzo lasciato a
  metà o un avanzo di un lavoro rifatto si collega o si toglie.
- **Nessuno script oltre le 3.000 righe**: si divide per argomento in un file
  caricato subito dopo.
- **Gli id non contengono** apici, `<`, `>`, spazi, `&` o barre rovesciate:
  finiscono negli `onclick` senza passare da `esc()`. Il testo libero passa
  sempre da `esc()`.

## Lo schema del database

- `supabase/schema.sql` si riesegue per intero nel SQL Editor di Supabase: ogni
  istruzione deve poter girare due volte (`if not exists`, `create or replace`,
  `drop … if exists`).
- Il blocco in fondo toglie `execute` a `anon` su ogni funzione: una funzione
  nuova è chiusa da sola. Una funzione `security definer` controlla comunque il
  ruolo di chi chiama (`ruolo_attivo()`, `puo_scrivere_tabella()`).
- Ogni chiave esterna prende un indice dal ciclo apposito; i trigger fissano
  `set search_path = public`.
- Se l'app ha bisogno di qualcosa che lo schema prima non aveva (una colonna,
  una funzione), alza insieme `schema_versione` in `archivio_stato()` e
  `CLOUD_SCHEMA_VERSIONE` in `cloud.js`, e dillo nel CHANGELOG: l'archivio
  condiviso va aggiornato rieseguendo il file.

## Documenti

- `docs/analisi-tecnica.md` è la mappa di ciò che resta aperto: chi chiude una
  voce la sposta fra le risolte, chi trova un problema che non risolve lo
  aggiunge.
