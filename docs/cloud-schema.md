# Bomtrack — Schema dati cloud (contratto dell'archivio condiviso)

Stato attuale (dalla 0.103.0): **l'adattatore esiste ed è `cloud.js`.** Senza collegamento i
dati vivono nel browser (IndexedDB, o `localStorage` dove manca) come unico documento JSON,
gestito da `store.js`, e l'app si comporta come sempre. Collegato un progetto Supabase, quel
documento diventa lo specchio di un database condiviso con **tabelle normalizzate**, e la coda
di ciò che non è ancora partito. Questo documento è il contratto fra i due.

**Come lavora `cloud.js`** (il «vero percorso» qui sotto, fatto):
- `Store.dopoCommit` programma un invio dopo ogni salvataggio riuscito; il lotto di
  `Store.takeChanges()` diventa **una** chiamata a `push_changes()`, mai spezzata
  (`cloudPayload()`: le radici con la loro `pos`, le figlie `row` di un padre già noto solo se
  cambiate dall'ultimo invio, le `replace` intere, le impostazioni solo con la gestione);
- `pull_changes(since)` ogni 25 s, al ritorno sulla finestra e della rete, applicato con
  `Store.applicaRemoto()` (`cloudApplica()`) solo senza modifiche in sospeso e senza schede o
  campi aperti; le righe che arrivano non tornano indietro e non si datano di nuovo;
- la fotografia dell'ultimo invio riuscito (`Store.baseSalvabile()` →
  `localStorage.bomtrack_cloud_base`) sopravvive alla chiusura della finestra, così la coda
  resta;
- Auth e RPC con `fetch()`, senza `supabase-js`; il rinnovo del token è uno alla volta;
- primo collegamento: `cloudCaricaArchivio()` (server vuoto, amministratore: utenti per
  email, `remapIds()`, invio a gruppi nell'ordine delle chiavi esterne) o
  `cloudScaricaArchivio()` (`Store.sostituisciDaRemoto()`).

Le prove stanno in `test/cloud.test.js` e `test/cloud-ui.test.js`, contro
`test/supabase-finto.js`: Auth e RPC finti, con dietro Postgres e `supabase/schema.sql` veri.

> **Spento finché non si collega (dalla 0.83.1).** La contabilità che serve solo a un backend —
> date e cancellazioni riga per riga delle tabelle figlie, ricevimenti come eventi — costava
> in locale spazio (+40% e +45% di archivio, misurati, in un localStorage da ~5 MB) e tempo
> di salvataggio, senza alcun vantaggio per chi lavora da solo. Sta dietro un interruttore,
> `Store.modoCondiviso`, **spento di serie**; lo accende `cloud.js` prima di
> `Store.load()` quando il PC è collegato, e accenderlo dopo non perde niente. Tutto ciò che questo documento descrive
> resta vero e testato con l'interruttore acceso; in locale l'app si comporta come prima.

## Predisposizioni già attive (schema v2, aggiornate alla 0.24.0)

Dalla 0.24.0 questo documento non è più solo un'intenzione: le parti qui sotto
esistono nel codice, sono verificate dalla suite e si possono leggere invece di
immaginarle.

- **Registro dello schema** — `SCHEMA` in `store.js`: le collezioni radice, i loro
  array annidati, quali righe hanno un id proprio e la politica di merge di
  ciascuna. Chi deve percorrere il database lo legge da qui. (Il numero non si
  scrive: era «nove» da quando erano nove, e sono cambiate quattro volte.)
- **Registro dei riferimenti** — `REFS` in `store.js`: quale campo punta a che
  cosa. Lo usa la migrazione v1→v2 per riscrivere gli id vecchi in UUID; finché
  i riferimenti erano cablati a mano ne rimappava quattro su tredici.
- **Traduzione annidato ↔ normalizzato** — `flattenDB()` / `nestDB()` in
  `cloud-map.js`, funzioni pure. Il giro completo è verificato campo per campo
  (`test/cloudmap.test.js`).
- **Conto delle modifiche** — `Store.takeChanges()` / `Store.markSynced(mark)`.
  Il conto e la fotografia che lo azzera si prendono **insieme**: fra la
  richiesta e la risposta c'è la rete, e chi lavora continua a scrivere.
  Fotografare al ritorno marcherebbe quelle scritture come già inviate.
  La firma del record comprende le righe figlie con identità propria
  (sottofamiglie, quotazioni, righe di documento): senza, una sottofamiglia
  rinominata risultava «niente da mandare».
- **Seam dell'adapter** — `Store.adapter`, con `LocalAdapter` (localStorage) come
  implementazione attuale.
- **Comportamento atteso sui conflitti** — `test/sync.test.js`: due client
  contro un server finto, sui tre scenari reali.


- **ID**: UUID v4 (`crypto.randomUUID`) su tutte le entità — nessun contatore locale, nessuna
  collisione tra utenti diversi.
- **Timestamp**: `createdAt` / `updatedAt` (ISO 8601) su ogni record, aggiornati ad ogni modifica →
  baseline per sync **last-write-wins** su `updatedAt`.
- **Soft delete**: la convenzione è il flag `active: false` (fornitori, centri, articoli);
  in cloud mappa su tombstone/`deleted_at`.
- **Versioning**: `db.schemaVersion` dentro il blob; le migrazioni in `migrateDB()` sono
  idempotenti e girano anche sull'import di backup vecchi (v1 → v2 automatico).

## Mappatura blob → tabelle

| Collezione locale | Tabella | Colonne principali |
|---|---|---|
| `users` | `profiles` | id uuid PK → `auth.users(id)`, name, username unique, email, role (`admin`\|`acquisti`\|`progettazione`\|`lettore`), color, active bool |
| `suppliers` | `suppliers` | id uuid PK, name, referente, email, phone, vat, street, street_number, zip, city, province, country, default_transport, default_payment, transit_days numeric (trasporto andata+ritorno verso il terzista), active bool, created_at, updated_at |
| `customers` | `customers` | id uuid PK, name **unique** (case-insensitive), referente, email, phone, vat, street, street_number, zip, city, province, country, notes, active bool, created_at, updated_at |
| `workCenters` | `work_centers` | id uuid PK, name, hourly_rate numeric, capacity_hours numeric (ore a settimana), hours_per_day numeric, queue_days numeric, setup_hours numeric (tempi per la programmazione a ritroso), active, created_at, updated_at |
| `workCenters[].suppliers` | `work_center_suppliers` | id uuid PK, work_center_id uuid FK, supplier_id uuid FK, rate numeric, note, created_at, updated_at — i fornitori di conto lavoro abituali del centro, con la tariffa propria (dalla 0.80.1 in `SCHEMA` e `REFS`) |
| `families` | `families` | id uuid PK, name, kind ('acquistato'\|'materiale'\|'parte'), sigla, created_at, updated_at |
| `families[].subs` | `sub_families` | id uuid PK, family_id uuid FK, name, sigla, created_at, updated_at |
| `items` | `items` | id uuid PK, code, name, type enum, uom, notes, active, favorite, obsolete, unit_cost, purchase_price, supplier_id FK, supplier_code, supplier_desc, active_price_id FK → `item_prices(id)`, sourcing ('make'\|'buy'), family_id FK, sub_family_id FK, machine_item_id FK, group_item_id FK, sigla, overhead_pct_override, margin_pct_override, assembly_days numeric (solo assiemi: giorni di montaggio), created_at, updated_at |
| `items[].components` | `item_components` | item_id uuid FK, child_item_id uuid FK, qty numeric, scrap_pct numeric |
| `items[].operations` | `item_operations` | item_id uuid FK, work_center_id uuid FK, hours numeric, note |
| `items[].cycle` | `item_cycle_rows` | item_id uuid FK, kind ('item'\|'op'), pos int. **Riga articolo** (`kind='item'`): child_item_id (l'articolo citato; `item_id` è il padre), qty, cost_override nullable. **Riga lavorazione** (`kind='op'`): work_center_id FK, supplier_id FK **nullable** (nullo = interna, valorizzato = conto lavoro esterno), cost_mode ('fisso'\|'orario'), hours numeric, days int, rate numeric, cost numeric, note |
| `items[].priceList` | `item_prices` | id uuid PK, item_id uuid FK, supplier_id FK **nullable** (quotazione inserita a mano), price numeric, min_qty numeric, lead_days int, code, description (in locale `desc`, che in SQL è una parola riservata), date, rfq_id FK nullable, line_id, note, created_at, updated_at |
| `rfqs` | `rfqs` | id uuid PK, number unique per anno, title, date, status ('bozza'\|'inviata'\|'ricevuta'\|'chiusa'), supplier_id FK, transport, payment, plan_id FK nullable, notes, notes_internal, active, created_at, updated_at |
| `rfqs[].lines` | `rfq_lines` | id uuid PK, rfq_id uuid FK, item_id FK **nullable** (riga manuale, o riga di conto lavoro), phase_key text **nullable**, phase_keys text **nullable** (tutte le fasi della tratta, separate da virgola), code, description, uom, qty, price nullable, delivery_date, note |
| `orders` | `orders` | id uuid PK, number unique per anno, title, date, status ('bozza'\|'inviato'\|'confermato'\|'parziale'\|'evaso'\|'annullato'), supplier_id FK, transport, payment, rfq_id FK nullable, plan_id FK nullable, supplier_confirmation, notes, notes_internal, active, created_at, updated_at |
| `orders[].lines` | `order_lines` | id uuid PK, order_id uuid FK, item_id FK **nullable**, phase_key text **nullable**, phase_keys text **nullable**, code, description, uom, qty, price nullable, delivery_date, note. **Nessuna colonna `received`**: è la somma di `order_receipts` (vista `order_line_received`) |
| `workOrders` | `work_orders` | id uuid PK, number unique per anno (**ODL-**), title, date, status (stesso vocabolario di `orders`), supplier_id FK (il **terzista**), transport, payment, rfq_id FK nullable, plan_id FK nullable, job_id FK nullable, supplier_confirmation, notes, notes_internal, odp_id uuid FK **nullable** (l'ordine di produzione che l'ha generato), active, created_at, updated_at |
| `workOrders[].lines` | `work_order_lines` | id uuid PK, work_order_id uuid FK, **item_id sempre NULL**, phase_key text (la **prima** fase della tratta), phase_keys text (tutte le fasi della tratta), code (della parte), description, uom, qty (pezzi), price (tariffa per pezzo) nullable, delivery_date, confirmed_date, start_date (inizio lavoro: quando consegniamo il materiale, dalla 0.113.0), note, odp_id uuid FK **nullable**, odp_phase_id uuid FK **nullable**. `received` come sopra: somma di `order_receipts`, o — sulle righe con `odp_id` — pezzi buoni dichiarati sull'ultima fase della tratta |
| `receipts` | `order_receipts` | id uuid PK, coll ('orders'\|'workOrders'), order_id uuid (FK all'una o all'altra tabella secondo `coll`, `on delete cascade`), line_id uuid FK, qty numeric **con segno** (differenza: una correzione all'ingiù è negativa), kind ('apertura'\|'ricevimento'), date, note, created_by, created_at — **append-only**, come `stock_movements` |
| `prodOrders` | `production_orders` | id uuid PK, number unique per anno (**ODP-**), item_id uuid FK (la **parte**), code, name, uom (congelati), qty numeric (pezzi lanciati), date, due_date, status ('bozza'\|'lanciato'\|'corso'\|'completato'\|'chiuso'\|'annullato'), title, notes, notes_internal, plan_id FK nullable, job_id FK nullable, active, created_at, updated_at |
| `prodOrders[].phases` | `production_order_phases` | id uuid PK **proprio**, production_order_id uuid FK, seq int (10, 20, 30…), op_index int (posizione d'origine nel ciclo), phase_key text (ponte verso il fabbisogno), work_center_id FK nullable, wc_name (congelato), supplier_id FK **nullable** (nullo = fase interna), supplier_name (congelato), run_from int, run_to int, passata int, cost_mode, hours, days, rate, cost, note, planned_start date, planned_end date (programmazione della fase, dalla 0.90.0) — **nessuna colonna di stato** |
| `prodOrders[].materials` | `production_order_materials` | id uuid PK, production_order_id uuid FK, item_id uuid FK, code, name, uom (congelati), per_pezzo numeric, qty numeric |
| `prodDecls` | `production_declarations` | id uuid PK, odp_id uuid FK, phase_id uuid FK, kind ('avvio'\|'avanzamento'\|'forzatura'\|'chiusura'), date, qty numeric, scrap numeric, note, motivo (solo su `forzatura`), created_by, created_at |
| `plans` | `production_plans` | id uuid PK, number unique per anno, title, date, notes, active, created_at, updated_at |
| `plans[].lines` | `production_plan_lines` | id uuid PK, plan_id uuid FK, item_id uuid FK, qty numeric |
| `revisions` | `item_revisions` | id uuid PK, item_id uuid FK, rev, date, motivo, **snapshot jsonb**, created_by, created_at |
| `trash` | `trash` | id uuid PK, coll, deleted_at, deleted_by uuid FK, **record jsonb** — le eliminazioni recuperabili, ripulite dopo `TRASH_DAYS` dal server (`pulizia_archivio()`, dalla 0.106.0) |
| `jobs` | `jobs` | id uuid PK, number unique per anno, customer, title, customer_ref, status ('aperta'\|'produzione'\|'chiusa'\|'annullata'), date, due_date, notes, active, created_at, updated_at |
| `reminders` | `reminders` | id uuid PK, date, title, notes, gravita ('alta'\|'media'\|'info'), done bool, job_id FK nullable, active, created_by, created_at, updated_at |
| `movements` | `stock_movements` | id uuid PK, item_id uuid FK, kind ('rettifica'\|'carico'\|'scarico'\|'clOut'\|'clIn'\|'clStep'\|'versamento'), qty numeric **con segno** (positiva e senza effetto sulla giacenza su `clStep`), date, note, supplier_id uuid FK **nullable** (su `clStep`: **dove va**, nullo = torna da noi), from_supplier_id uuid FK **nullable** (solo `clStep`: **da dove viene**, nullo = parte da noi), order_id uuid FK **nullable** (un ordine d'acquisto, di lavoro **o di produzione**), line_id **nullable** (su un ordine di produzione è l'id della **fase**), decl_id **nullable** (la dichiarazione che l'ha generato), created_by, created_at |
| `productions` | `productions` | id uuid PK, plan_id uuid FK, item_id uuid FK, qty numeric **con segno** (negativa = correzione di un conteggio, come una rettifica), date, note, created_by, created_at |
| `attachments` | `attachments` | id uuid PK, item_id uuid FK, name, mime, size bigint, created_by, created_at. **I byte non sono qui**: in locale stanno in IndexedDB, in cloud andrebbero in Supabase Storage con l'id per chiave — vedi «il giorno in cui arrivano i disegni» in sostenibilita-free-tier.md |
| `settings` | `settings` | una riga per team (o coppie chiave/valore). **Non è in `SCHEMA`**: è un oggetto solo, senza id né `updatedAt`, e `pendingChanges()` la segnala confrontando il contenuto (`settings: true`). `flattenDB()` non la esporta e `tablesForChanges()` non ne ricava nessuna tabella: l'adapter deve trattarla a parte, ed è il motivo per cui il flag è un booleano e non un elenco di id |

**Vincoli che il modello locale dà per scontati** e che in cloud vanno scritti:

- `items.active_price_id` punta a una riga di `item_prices` **dello stesso
  articolo**: è il "prezzo in uso" nella costificazione. Cancellando quella riga
  il campo va a `NULL` senza toccare `unit_cost`/`purchase_price` — il costo
  resta, si sgancia solo il riferimento (`priceDelRow()`).
- `jobs.customer` è **testo**, non una FK a `customers`: l'anagrafica clienti è
  arrivata dopo le commesse, e le commesse già scritte non hanno un cliente in
  anagrafica da citare. `customers.name` è quindi unico e il rename in Gestione
  propaga il nuovo nome alle commesse che portavano il vecchio
  (`renameJobCustomer()`); un cliente citato da una commessa non si elimina. Il
  giorno in cui `jobs` prendesse una `customer_id`, la migrazione è un join per
  nome — ed è la ragione per cui il nome è tenuto unico da ora.
- **`orders` e `work_orders` sono due tabelle e non una con un flag.** Un ordine
  d'acquisto compra della merce, un ordine di lavoro manda dei pezzi a lavorare:
  hanno numerazione, elenco e stampa distinti perché sono due documenti diversi
  nella realtà. Con una tabella sola ogni conto — il totale acquistato, il carico
  di magazzino, la copertura di commessa — avrebbe dovuto filtrare per un campo,
  ed è il tipo di distinzione che prima o poi si dimentica in uno dei posti. La
  **forma** è però la stessa, e le colonne vanno tenute allineate: in cloud
  conviene una vista `supplier_documents` che le unisca per le domande che
  riguardano entrambe (cosa arriva tardi, quanto è impegnato su una commessa).
- **`work_order_lines.item_id` è sempre `NULL`**, e non per convenzione: è la
  garanzia strutturale contro il doppio conteggio di magazzino. In cloud si
  scrive come `check (item_id is null)` sulla tabella intera, che è più forte del
  `check` condizionale su `order_lines`.
- Una **richiesta d'offerta** può contenere insieme merce e lavorazioni dello
  stesso fornitore — chiedere quanto costa il pezzo e quanto costa lavorarlo è
  una domanda sola — ed è per questo che `rfq_lines` conserva sia `item_id` sia
  `phase_key`. Alla conversione la richiesta **si divide**: le righe con una fase
  vanno in un `work_order`, le altre in un `order`.
- **Righe di conto lavoro** (`phase_key` valorizzata): sono le fasi di
  lavorazione affidate a un terzista, generate dal fabbisogno. Due vincoli, ed è
  meglio scriverli che riscoprirli.
  - `item_id` **deve** essere `NULL` su queste righe. Non è una comodità: è la
    garanzia strutturale contro il doppio conteggio di magazzino. L'esistente si
    calcola come `Σ received` delle righe **con** articolo più `Σ movimenti`; il
    rientro dei pezzi dal terzista è un movimento. Con un `item_id` le due strade
    si sommerebbero e i pezzi risulterebbero il doppio. In cloud vale la pena
    scriverlo come `check (phase_key is null or item_id is null)`.
  - Una riga copre una **tratta**: le fasi *consecutive* dello stesso terzista
    stanno in una riga sola, perché sono una lavorazione da commissionare e non
    due. `phase_key` nomina la **prima** — è l'identità della riga, quella che
    gli ancoraggi del conto lavoro leggono — e `phase_keys` le elenca **tutte**.
    Indicizzando solo la prima, le fasi in mezzo risulterebbero ancora da
    documentare e il fabbisogno le riproporrebbe in un ordine che le contiene
    già. Su una riga a fase singola le due colonne dicono la stessa cosa, e la
    ripetizione è voluta: chi legge non deve sapere quale delle due guardare.
  - Fasi dello stesso terzista **non** consecutive (20 e 40, con la 30 in mezzo
    altrove) vanno in **ordini di lavoro distinti**: fra le due il pezzo torna da
    noi, e chiedergliele insieme sarebbe un ordine che non si può eseguire di
    seguito. Il criterio è la *passata* — quante volte quel terzista ha già avuto
    il pezzo. Una **richiesta d'offerta** invece le tiene insieme: chiedere non è
    commissionare, e a un preventivo si risponde una volta.
  - `phase_key` è `itemId#indice#workCenterId`, **congelata alla generazione**
    come già lo sono `code` e `description`. L'indice conta fra le sole
    lavorazioni del ciclo, non nell'array intero. **Non è un riferimento
    integro**: riordinare le fasi la disallinea, e il fabbisogno ripropone quella
    fase. È un falso negativo scelto — e visibile, perché il documento resta
    nell'elenco di quelli generati dal piano. L'alternativa (ricalcolarla a ogni
    lettura) bloccherebbe la fase *sbagliata*, e quello non si vedrebbe.
    Contiene un `itemId` dentro una stringa, che nessuna rimappatura di id sa
    seguire: vedi la nota su `REFS` in `store.js`.
  - `received` su una di queste righe significa **pezzi rientrati dal terzista**:
    porta l'ordine a parziale o evaso, e non carica il magazzino.
- `work_centers.capacity_hours` = ore disponibili a settimana, e **zero
  significa «non dichiarata», non «nessuna capacità»**. Serve al prospetto del
  carico: un centro senza capacità mostra le ore e non il sovraccarico. Senza
  questa distinzione ogni centro esistente risulterebbe sfondato al primo
  caricamento, e il prospetto nascerebbe già da ignorare.
- **`workCenters[].suppliers` è una tabella figlia** (`work_center_suppliers`)
  dalla 0.80.1: dichiarata in `SCHEMA` con merge per riga e in `REFS` per il
  `supplierId`. Fino alla 0.80 `flattenDB()` la copiava come array dentro la
  riga del centro, e la rimappatura v1→v2 non ne riscriveva il fornitore. Il
  campo resta facoltativo: un centro senza fornitori non ha la chiave, e
  `child_sets` lo distingue dall'elenco vuoto.
- `item_prices` esiste solo per `type in ('acquistato','materiale','parte')`.
- `item_prices (rfq_id, line_id)` è la chiave anti-duplicato usata da
  `rfqRecordPrices()`: registrare due volte la stessa offerta non deve creare due
  quotazioni.
- `sourcing` ha senso solo su `type = 'parte'`; per gli altri tipi è `NULL`. Il
  valore proposto alle parti nuove sta in `settings.partSourcingDefault`
  (`'buy'` di serie): è un default di creazione, **non** un fallback di lettura —
  una parte senza il campo vale `'make'`, com'era prima che esistesse.
- Su una riga di lavorazione **il tempo cambia unità con la natura della fase**,
  e sono due colonne perché sono due grandezze:
  - `hours` — ore di **occupazione di un centro**. Ha senso su una fase
    **interna**, dove alimenta il carico dei centri; su una esterna esiste solo
    come base del costo a modo `'orario'` (le ore che il terzista fattura).
  - `days` — giorni di **attraversamento**, e ha senso solo su una fase in
    **conto lavoro**. Un terzista non occupa una nostra macchina: il pezzo esce e
    torna, e ciò che serve sapere è quando torna. Da `days` si ricava la data
    entro cui mandare l'ordine di lavoro (`due − days`), esattamente come
    `item_prices.lead_days` fa per il materiale.
  Sulle fasi interne `days` resta `0` e non va letto; sulle esterne a costo fisso
  `hours` resta `0` e non va letto. Tenerle in una colonna sola, con l'unità
  decisa da `supplier_id`, renderebbe la colonna non sommabile e non
  confrontabile — in un foglio di calcolo prima ancora che in SQL.
- Su una riga di lavorazione, **`hours` e `cost_mode` rispondono a due domande
  diverse** e vanno tenute separate: `hours` è il **tempo** che la fase occupa sul
  centro ed esiste sempre; `cost_mode` dice da dove viene il **costo** — `'orario'`
  lo calcola come `hours × rate`, `'fisso'` prende `cost` e le ore non ci entrano.
  Sembra ridondante e non lo è: un prezzo concordato con un terzista è quello, e
  farlo diventare `ore × tariffa` lo cambierebbe da sé; ma quella fase il centro
  lo occupa lo stesso, e senza le ore il carico non si può calcolare. Fino alla
  0.64.2 le ore esistevano solo in modo orario, e una normalizzazione le
  cancellava a ogni caricamento.
- Da `sourcing` dipende **anche il costo**, non solo il fabbisogno: `'make'` lo
  deriva da `item_cycle_rows`, `'buy'` usa `unit_cost` (che arriva da
  `item_prices`). Ha sostituito il campo `cost_mode` delle versioni fino alla
  0.20.0 (`'unit'` → `'buy'`, `'cycle'`/`'sum'` → `'make'`): se un adapter cloud
  legge blob storici, la conversione è in `migrateDB()`.
- `plan_id` è la tracciabilità fabbisogno → documento, e `orders.plan_id` si
  eredita dalla richiesta quando un ordine nasce da una RFQ generata da un piano.
- `job_id` è l'anello a monte: sta su `production_plans`, `rfqs` e `orders`, e si
  eredita a scendere. **Nullable ovunque**: la maggior parte del lavoro non nasce
  da una commessa, e obbligarla renderebbe la funzione un ostacolo invece di uno
  strumento. `on delete restrict`: una commessa che regge documenti non si
  cancella, lascerebbe riferimenti a un numero inesistente.
- Le date sono `date`, non `timestamptz`: sono giorni di calendario e non hanno
  fuso orario. In locale la lezione è già stata pagata — calcolarle passando per
  la mezzanotte locale le anticipava di un giorno a est di Greenwich.
- **Doppia unità di misura**: `items.alt_uom` + `items.alt_factor` (fisica
  dell'articolo, uguale per tutti i fornitori) e `item_prices.price_uom` (scelta
  del singolo fornitore). Il vincolo da scrivere: `alt_uom` e `alt_factor` sono
  entrambi valorizzati o entrambi `NULL`, e `alt_factor > 0` — separatamente non
  significano niente e produrrebbero conversioni inventate. `price_uom` può
  valere solo `items.uom` o `items.alt_uom`.
  Le righe di documento (`rfq_lines`, `order_lines`) portano già la propria
  `uom`: è nell'unità del fornitore, e la conversione verso la giacenza si fa
  leggendo quella. Nessuna colonna in più.
- **Il ricevuto non è una colonna** *(in modo condiviso; in locale resta il numero sulla
  riga, vedi «Predisposto, ma spento»)*. Dalla 0.81.0 ogni ricevimento è un evento
  in `order_receipts` con la **differenza** rispetto a prima — chi è davanti
  alla merce digita il nuovo totale, l'app scrive il delta — e il ricevuto di
  una riga ne è la somma. Fino alla 0.80 era un numero riscritto sulla riga:
  due ricevimenti concorrenti sulla stessa riga si sarebbero sovrascritti, e
  dato che la giacenza ne è la somma, un carico sarebbe sparito dal magazzino
  senza un avviso. Due eventi invece si sommano, e sono righe diverse: merge per
  riga, nessun conflitto. In locale `received` resta sulla riga come lettura
  (la ricalcola `riallineaRicevuti()` a ogni caricamento) ed è dichiarato
  `derived` in `SCHEMA`: l'adapter lo toglie con `flattenDB(db, { stripDerived: true })`.
  In cloud è una vista. Il primo caricamento di un archivio precedente
  trasforma il ricevuto di ogni riga in un evento `apertura`.
  Il tetto «non più dell'ordinato» resta un controllo dell'interfaccia: con due
  ricevimenti concorrenti la somma può superarlo, ed è giusto che si veda —
  è merce arrivata davvero.
- **La giacenza non è una colonna.** Non esiste `items.on_hand`, e non va aggiunta:
  l'esistente è `Σ order_receipts.qty` (delle righe con articolo) `+ Σ stock_movements.qty` **dei movimenti
  che toccano il magazzino**, cioè tutti tranne `clStep` (vedi sotto). Un campo
  aggiornato a parte diventerebbe una seconda verità che diverge dalla prima, ed
  è l'errore già corretto una volta con i prezzi. In cloud conviene una **vista**
  (`item_stock`) e, se i numeri crescono, una materialized view — mai una colonna
  scrivibile dal client.
- **Il magazzino si muove in due punti soli, e sono i due estremi del ciclo.**
  Non quelli del documento: una parte con fasi 10 interna, 20 Beta, 30 interna,
  40 Beta ha **due** ordini di lavoro da Beta, e ciascuno è prima e ultima riga
  di sé stesso. Con gli ancoraggi letti dal documento il materiale uscirebbe due
  volte e il pezzo finito si caricherebbe due volte.

  Dove esiste un **ordine di produzione** gli estremi sono i suoi, e la regola
  vale per un ciclo di qualunque forma — tutto interno, tutto esterno o misto:
  - all'**avvio della prima fase** escono i **codici del ciclo**: `scarico` se
    quella fase è interna, `clOut` (intestato al terzista) se è esterna;
  - sull'**ultima fase** entra il **codice della parte**, per i pezzi buoni
    dichiarati: `versamento` se la fase è interna, `clIn` se è esterna;
  - **fra le fasi non si scrive niente.**

  Quel «niente» è la parte che conta, ed è il motivo per cui `clStep` non serve
  a un ordine di produzione. Un movimento nomina una quantità di un **codice**,
  e fra la prima e l'ultima fase i pezzi non sono più il materiale e non sono
  ancora la parte: la parte lo diventano al rientro dell'ultima fase. Un
  movimento col codice parte prima di allora inventa una giacenza che non
  esiste, e la fa comparire nel prospetto *presso terzi* di chi non l'ha mai
  avuta. Dove stanno i pezzi lo dice la **fase corrente** dell'ordine, che è il
  posto in cui quella domanda ha davvero una risposta.

  Conseguenza sul prospetto: i movimenti di un ordine di produzione **escono**
  dal saldo per coppia (luogo, articolo). Lì un `clOut` di materiale a cui
  risponde un `clIn` del codice parte non si chiude mai, e il materiale
  resterebbe appeso al primo terzista anche dopo che i pezzi sono andati
  altrove. Per gli ordini di produzione il prospetto ha una **seconda sorgente**,
  letta dagli ordini aperti, e le due restano distinte invece di fondersi.

  Un ordine di lavoro **senza** un ordine di produzione dietro conserva gli
  ancoraggi di prima — prima e ultima tratta esterna, `clStep` in mezzo — e
  quindi i dati esistenti non si muovono. È la ragione per cui `work_orders`
  porta `odp_id`: ogni condizione nuova è un `if (odp_id)`, e su tutto ciò che
  c'era è nullo.

  Quale materiale esce lo dice il **ciclo della parte** (`item_cycle_rows` con
  `kind='item'`), moltiplicato per i pezzi: è lo stesso che il fabbisogno ha già
  fatto comprare. Su un ordine di produzione quelle righe sono **congelate** in
  `production_order_materials`, così una modifica al ciclo non riscrive
  retroattivamente quanto è già uscito. Non è un vincolo esprimibile in SQL: i
  movimenti restano righe libere, ed è l'interfaccia a doverlo imporre.
- **Le fasi di un ordine di produzione hanno un `id` proprio, e nessuno stato.**
  È la differenza con `item_cycle_rows`, dove l'array *è* la definizione e la
  posizione è l'identità: qui la fase porta un avanzamento, e un'identità
  posizionale si sposterebbe sotto i piedi al primo riordino del ciclo,
  mandando le dichiarazioni sulla fase sbagliata. `phase_key` resta sulla fase,
  ma solo come **ponte verso il fabbisogno**, dove continua a valere con i suoi
  limiti già dichiarati.
  L'avanzamento — pezzi fatti, scarti, avvii, forzature, chiusure — sta in
  `production_declarations`, piatta come `stock_movements` e per la stessa
  ragione: sono **eventi**, non stato. Nessuna colonna di saldo sulla fase,
  quindi niente che possa divergere. In cloud la lettura conviene come vista
  (`production_phase_progress`), mai come colonne scrivibili dal client.
  Solo i **pezzi buoni** proseguono: quanti ne entrano in una fase è quanti ne
  sono usciti buoni dalla precedente, e la quantità versata a magazzino può
  essere minore di quella lanciata.
- **`clStep` è un movimento di luogo, non di quantità.** È l'unica eccezione alla
  regola dell'esistente, e il codice la scrive in un predicato solo
  (`movimentoToccaMagazzino`) invece che in un `if` sparso in ogni punto che
  somma movimenti. Porta due estremi — `from_supplier_id` e `supplier_id`, uno
  dei quali nullo perché fra due terzisti il pezzo passa sempre **da noi** — e in
  cloud vale la pena scriverlo come un `check` che ne pretenda uno nullo quando
  `kind = 'clStep'`. Lo stato «in casa, fra due fasi» non è una colonna e non è
  la giacenza: sono pezzi che esistono, non sono a scaffale e non sono da nessun
  terzista, e il prospetto li mostra come un luogo a sé.
- **Un saldo negativo nel presso-terzi non è merce mancante**: è come si vede una
  trasformazione, quando esce del materiale e torna un pezzo con un altro codice.
  Il prospetto mostra i soli saldi **positivi**; sommare i negativi scalerebbe da
  un articolo quello che sta fuori come un altro.
  Il saldo si calcola **in ordine di data**, azzerando a ogni passo quel che
  andrebbe sotto zero — non come differenza fra due totali. La differenza si vede
  quando lo stesso terzista lavora un pezzo due volte: la prima volta i pezzi
  *escono* dal suo registro senza esserci mai entrati (da lui erano arrivati come
  materiale grezzo, e la trasformazione non la scrive nessuno), e quella partenza
  senza arrivo annullerebbe il ritorno vero della seconda tratta.
- **Il materiale presso i terzisti non è una colonna**, per la stessa ragione per
  cui non lo è la giacenza: è `Σ clOut − Σ clIn` per coppia (fornitore,
  articolo), calcolato dai soli movimenti. Nessun `items.at_supplier`, che
  diventerebbe una seconda verità da tenere allineata a mano.
  - `clOut` è **negativo**: il materiale che parte esce dal magazzino, perché
    allo scaffale non c'è più. Non contraddice la regola sopra — un movimento
    negativo è un addendo di quella somma, non un campo di saldo.
  - I due movimenti portano l'articolo **che si muove davvero**: `clOut` quello
    che esce, `clIn` quello che rientra. Quando coincidono (grezzo fuori,
    lavorato dentro) il conto va a zero; quando differiscono (materiale fuori,
    pezzi dentro) il consumo del materiale è implicito nella coppia. Nessuna
    logica speciale in nessuno dei due casi.
  - Il saldo è per **coppia (fornitore, articolo)** e non per articolo soltanto:
    con codici diversi in uscita e in entrata, un saldo unico per articolo non
    significherebbe niente.
  - Il conto di quanto è **già stato registrato** su una riga si legge da
    `order_id` + `line_id` + il verso del movimento: la scheda propone il
    residuo, e a residuo zero lo dice. Superarlo resta possibile — una
    rispedizione dopo uno scarto è legittima — perché vietarlo trasformerebbe un
    caso vero in un motivo per registrare fuori dall'app.
  - `order_id` su questi movimenti **non viola** la regola per cui i carichi da
    ordine non stanno qui: la riga d'ordine che li giustifica non ha un
    `item_id`, quindi non carica nulla da sé. Il movimento non duplica il
    ricevimento — è l'unica scrittura che muove il magazzino.
- `stock_movements` è concettualmente **append-only** come le revisioni, ma qui la
  cancellazione serve davvero (una rettifica sbagliata va tolta) e resta
  permessa. Il merge è **per riga**: due persone che registrano due movimenti
  diversi sullo stesso articolo non sono in conflitto.
- `item_revisions.snapshot` resta **jsonb**, non si normalizza in tabelle figlie:
  una revisione rilasciata è una fotografia immutabile e non va mai fusa con
  niente. Darle la forma dei dati vivi significherebbe invitare qualcuno a
  modificarla, e una revisione modificabile non è una revisione. È anche l'unica
  tabella che dovrebbe essere **append-only** in RLS: inserimento sì,
  aggiornamento e cancellazione no, nemmeno all'amministratore.

Ogni altra tabella porta anche `created_by` / `updated_by` uuid → `profiles(id)`: in locale sono già
scritti da `stampNew()`/`touch()` con l'utente della sessione (`Store.setActor`).

Nota: **le sottofamiglie restano annidate** in `families[].subs` nel modello locale (scelta
deliberata per non toccare la UI). L'adapter cloud le esplode in righe `sub_families` in push
e le riannida in pull.

## Colonne che la normalizzazione impone

Non sono nel modello locale e non servono all'app: esistono perché una tabella
non è un array. Le scrive `flattenDB()` e le toglie `nestDB()`.

| Colonna | Su quali tabelle | Perché |
|---|---|---|
| `pos int` | ogni tabella figlia, e le radice | Gli array JSON sono ordinati, le righe di una tabella no. Senza, l'ordine dei componenti di una distinta e delle righe di un ordine si rimescola a ogni pull. Su una richiesta d'offerta stampata si vede subito; in una distinta è peggio, perché non si vede. |
| `parent_id uuid` | ogni tabella figlia | La chiave che riporta la riga al suo documento. |
| `id` costruito | `item_components`, `item_operations`, `item_cycle_rows` | Quelle righe non hanno un id proprio: in locale la loro identità è la posizione. La chiave si costruisce deterministica (`itemId#array#pos`) — **non è un'identità stabile nel tempo**, e non pretende di esserlo: quelle tre tabelle si sincronizzano sostituendo l'insieme intero, proprio perché un'identità di riga lì non esiste. |
| `child_sets text` | ogni tabella radice con figli | Distingue un array figlio **vuoto** da uno **assente**, differenza che «nessuna riga» non sa esprimere. Non è una sottigliezza: un assieme con la distinta svuotata a mano ha `components: []`, un commerciale non ha `components` affatto. Se al pull l'assieme si ritrovasse senza il campo, `saveNewComponent()` lancerebbe al primo componente aggiunto. |

## Nomi e tipi: dalla riga locale alla riga del database

`flattenDB()` resta l'inverso esatto del documento locale, e parla la lingua
del codice. La traduzione verso SQL è un passo a sé, in `cloud-map.js`
(dalla 0.81.1):

```js
dbVersoCloud(db)            // flattenDB senza segreti né derivati, poi righeCloud()
dbDaCloud(tabelle, extra)   // righeLocali(), poi nestDB()
righeCloud(t, { uuid })     // { tabella: [righe camelCase] } → righe SQL; lancia con l'elenco dei problemi
righeLocali(t)              // l'inverso
```

- **Nomi**: camelCase → snake_case, sempre. Le eccezioni stanno in
  `CLOUD_TABLES`: la colonna padre di ogni tabella figlia (`item_id`,
  `rfq_id`, `production_order_id`…, al posto del `parentId` generico),
  `child_item_id` in `item_components` e `item_cycle_rows` (dove `item_id` è
  già il padre), `description` per `desc` in `item_prices`, e i campi che non
  hanno colonna (`priceListSeeded`). Un campo non dichiarato passa col nome
  convertito: se la colonna non esiste il server lo rifiuta ad alta voce, che
  è meglio di un elenco chiuso che lo butterebbe in silenzio.
- **Tipi**: `CLOUD_TYPES`, per nome di campo e uguale in tutte le tabelle
  (`qty`/`price` numeric, `date`/`dueDate` date, `active` bool, `snapshot`/`record`
  jsonb…); i campi `…Id` sono uuid tranne `conceptId` (i concetti vivono nelle
  impostazioni, con id leggibili). Le chiavi costruite delle righe senza
  identità (`item_components`, `item_operations`, `item_cycle_rows`) sono testo.
- **Vuoto**: `''` diventa NULL in ogni colonna che non è testo — un prezzo non
  quotato, una data non fissata, una famiglia non assegnata. Al ritorno NULL
  torna `''` sui campi dove il modello locale scrive `''` (`VUOTO_STRINGA`):
  senza, ogni record risulterebbe modificato al primo confronto.
- **Controllo prima dell'invio**: `righeCloud()` si ferma, con tabella, id e
  campo di ogni problema, su un numero illeggibile, una data non AAAA-MM-GG,
  un oggetto fuori da una colonna jsonb, un id non uuid. Un invio è
  tutto-o-niente: meglio saperlo qui, tutto insieme, che dalla prima risposta
  400.

Una conseguenza da conoscere: una colonna che il record locale non aveva
torna dal server come `null` esplicito. È innocuo per i lettori (che
guardano la verità del valore) e per la sincronizzazione (che guarda
`updated_at`), ma il documento non è identico byte per byte.

## Politica di merge, per tabella

La decisione centrale della sincronizzazione, e non può essere la stessa per
tutti. Sta nel registro (`SCHEMA` in `store.js`) ed è verificata in
`test/sync.test.js`.

**Merge per riga** — `item_prices`, `rfq_lines`, `order_lines`,
`work_order_lines`, `production_plan_lines`, `sub_families`,
`production_order_phases`, `production_order_materials`,
`work_center_suppliers`. Righe con identità propria, dove
l'aggiunta concorrente **è lo scenario normale, non un conflitto**: due colleghi
che registrano una quotazione sullo stesso articolo hanno due id diversi e
sopravvivono entrambe. Il conflitto vero è altrove, su `items.active_price_id`:
è un campo scalare del padre, lì vince l'ultimo che salva e **l'utente va
avvisato**, perché con il prezzo in uso cambia il costo di ogni distinta a monte.

**Ogni riga di queste tabelle porta il proprio `updated_at`**, ed è ciò che
rende il merge per riga possibile: senza, l'adapter sa che «l'ordine è
cambiato» ma non quale riga, rimanda tutte le righe nella propria versione e
cancella la modifica che un collega ha fatto su un'altra riga dello stesso
documento. Fino alla 0.80 la data l'avevano solo le righe create da alcuni
punti del codice, e nessuna riga modificata. Dalla 0.80.1 la scrive lo
**Store**, non le viste: `stampChildRows()` confronta un'impronta del
contenuto di ogni riga con quella del passaggio precedente (a ogni `commit()`
e a ogni `pendingChanges()`), e data la riga che è cambiata. Le righe
storiche senza data prendono quella del padre al caricamento — non l'adesso,
che le farebbe vincere a torto. Costo misurato: ~85 ms su 42.000 righe e
9 MB, cioè oltre la quota di `localStorage`; nella misura reale, la metà.

Le fasi di un ordine di produzione stanno qui e **non** fra le sostituzioni,
al contrario di `item_cycle_rows` da cui nascono: là l'array è la definizione e
le righe non hanno un id, qui ogni fase ha il suo e due reparti che dichiarano
l'avanzamento su due fasi diverse sono lo scenario normale, non un conflitto.
Le `production_declarations` sono append-only come `stock_movements`, e per la
stessa ragione.

**Sostituzione dell'insieme** — `item_components`, `item_operations`,
`item_cycle_rows`. L'array *è* la definizione dell'oggetto: metà distinta di uno
e metà dell'altro è un prodotto che nessuno ha progettato, e mezzo ciclo di
lavorazione è un costo sbagliato che nessuno verifica. L'ultimo che salva
sostituisce l'insieme intero per quel padre, e l'altro riceve un avviso. Dalla
0.82.0 lo fa `push_changes()` (vedi «Lo schema SQL» qui sotto): l'insieme si
sostituisce **solo se il padre passa** il confronto su `updated_at`, e un padre
respinto si porta dietro i suoi figli. È quel controllo a rendere la
sostituzione sicura invece che pericolosa — la `save_item` ipotizzata fino
alla 0.81 non serve più come funzione a sé.

**Il cestino non è un tombstone**, e i due non vanno confusi: `trash` serve
all'utente che si è pentito, il tombstone serve al protocollo per far sapere
all'altro client che una riga è sparita. Servono entrambi, e per motivi diversi.
Ripristinare dal cestino, lato sync, è un inserimento nuovo con lo stesso id —
il che richiede che il tombstone sia superabile da un `updated_at` più recente,
altrimenti il ripristino verrebbe cancellato di nuovo al pull successivo.
Dalla 0.60.0 `Store.restore()` fa `touch()` sul record che rientra, che è ciò
che rende vera quella condizione: prima tornava con la data che aveva **prima**
di essere eliminato, cioè più vecchia della propria lapide.

## Cancellazioni: servono i tombstone

Verificato in `test/sync.test.js`: un invio di soli upsert **non può esprimere
una cancellazione** — l'assenza di una riga non è un'informazione, e ciò che un
utente cancella riappare al pull successivo. È il difetto più insidioso della
migrazione, perché non somiglia a un errore: somiglia a un collega distratto che
ha rimesso dentro qualcosa.

Serve `deleted_at` su ogni tabella sincronizzata per riga — **figlie
comprese**. Una riga tolta da un ordine che resta non è la cancellazione di un
record radice, e fino alla 0.80 `pendingChanges()` la riportava solo come
«l'ordine è cambiato»: con il merge per riga, l'adapter non avrebbe saputo
distinguere «l'ho tolta» da «non ho mai visto quella che un collega ha
aggiunto». Dalla 0.80.1 il conto porta anche `removeChildren` (vedi
l'interfaccia qui sotto); le righe di un padre eliminato non ci compaiono, le
porta via la cancellazione del padre (`on delete cascade`). Va deciso anche cosa
vince fra cancellazione e modifica concorrente: oggi i test fissano
**cancellazione**, perché un articolo mezzo cancellato non esiste. Che sia la
scelta giusta è discutibile; che debba essere una scelta esplicita, e non l'esito
casuale di chi arriva per primo, no.

## Utenti e autenticazione

Il modello locale è già quello di destinazione: `db.users` è 1:1 con `profiles`, i ruoli sono
quelli che le policy dovranno riconoscere e l'app tiene un solo utente di sessione
(`currentUser`) da cui dipendono nav, guardie e campi di audit.

**Gli id degli utenti cambiano**: `profiles.id` è quello che assegna
`auth.users`, non l'UUID scritto in locale. Con l'utente cambiano tutti i
campi di audit del database (`createdBy`, `updatedBy`, `deletedBy`, su ogni
record e ogni riga figlia), che `REFS` non elenca collezione per collezione:
stanno in `AUDIT_REFS` (`store.js`), e `remapIds({ user: { vecchio: nuovo } })`
li riscrive tutti insieme. Il contenuto del cestino resta com'era.

**Cosa non migra**: `passwordHash` e `passwordSalt`. In locale sono SHA-256(salt + password)
calcolati in `store.js`; le password vere le possiede Supabase Auth (`auth.users`) e questi due
campi vanno **cancellati** al momento della migrazione. Vale la pena ribadirlo: finché i dati
stanno nel browser l'accesso non protegge nulla — chi apre i DevTools legge il blob e si assegna
il ruolo che vuole. È RLS a rendere reali i permessi.

Punti di innesto lato app (`core.js`, `views-*.js`), pensati per essere sostituiti uno a uno — il precedente
funzionante è `timetrack-supabase` (`migrations/schema.sql`, `supabase/functions/invite-user`):

| Oggi (locale) | Domani (Supabase) |
|---|---|
| `submitLogin()` → `verifyPassword()` | `supa.auth.signInWithPassword({ email, password })` |
| `restoreSession()` su `localStorage.bomtrack_session` | `supa.auth.getSession()` |
| `logout()` | `supa.auth.signOut()` |
| `saveOwnPassword()` | `supa.auth.updateUser({ password })` |
| `addUser()` (scrive hash in locale) | edge function di invito con `service_role` (mai nel browser) |
| `db.users` da `Store.load()` | `select * from profiles` |
| `canWrite(area)` / `roleGuard(area)` | restano **invariati**, raddoppiati da policy RLS per ruolo |

**Dalla 0.105.0** `addUser()` con l'archivio condiviso chiama la funzione
`supabase/functions/bomtrack-utenti` (`cloudUtenti` in `cloud.js`): `invita`
crea l'utente Auth con `generateLink({ type: 'invite' })` e restituisce il link,
`reimposta` genera quello di recupero. A differenza del precedente di timetrack,
il ruolo **non** viaggia nei metadati dell'utente Auth: il trigger
`profilo_da_utente` lo fa nascere lettore sospeso, e ruolo e stato li scrive la
funzione **con il token dell'amministratore**, sotto RLS e `profiles_guardia`.
Così una registrazione lasciata aperta non può chiedersi da sola un ruolo. La
funzione risponde solo a un amministratore attivo e non genera il link di
recupero di un altro amministratore. `profiles_guardia` impedisce anche di
declassare o sospendere l'ultimo amministratore attivo.

Schema delle policy: scritto in `supabase/schema.sql` dalla 0.83.0 — vedi
«Accesso» nella sezione sullo schema SQL. La matrice è quella di `ROLE_WRITE`
in `core.js`, applicata tabella per tabella.

## Interfaccia adapter

Dalla 0.24.0 il seam esiste: `Store.adapter` è sostituibile, e il contratto è
volutamente minimo — leggi una stringa, scrivine una, dimmi quanto occupa —
perché è tutto ciò che `Store` usa davvero.

```js
const LocalAdapter = { name, read(), write(payload), size() };
Store.adapter = unAltroAdapter;              // unico punto da cui passa la destinazione dei dati

Store.takeChanges()       // { changes, mark } — il conto E la fotografia, insieme
Store.markSynced(mark)    // riallinea a quella fotografia, non all'adesso
Store.pendingChanges()    // { items: { upsert: [id…], remove: [id…],
                          //           removeChildren: { priceList: [id…] } }, …, settings: true }
                          // removeChildren solo se una riga figlia è sparita da un padre che resta
                          // null = fotografia non valida: serve un riallineamento completo
Store.schema()            // il registro: collezioni, figli, politica di merge
```

Gli errori **non** si gestiscono nell'adapter: lascia passare l'eccezione e
`Store.commit()` la classifica (quota esaurita, salvataggio non disponibile,
dati non serializzabili). Così la classificazione resta in un punto solo,
qualunque sia la destinazione dei dati.

### Sul «Fase 1: il blob su una tabella»

Era la proposta di questo documento fino alla 0.23.0. **Come sincronizzazione è
un vicolo cieco, e va detto invece che scoperto a metà strada:** con un blob
unico il last-writer-wins non è sul record ma sull'**intero database**, e la
perdita è silenziosa — chi salva per secondo non ha modo di accorgersi di aver
cancellato tre ore di lavoro di un collega. In più il salvataggio parte a ogni
gesto banale (rinominare un articolo, cambiare una quantità): sarebbero decine
di caricamenti da megabyte per sessione, per un dato che il server non può
comunque interrogare.

Resta utile con un altro nome: **backup cloud versionato**. Tabella append-only
`(team_id, version, payload, created_by, created_at)`, invio esplicito con
controllo di versione, ripristino con conferma distruttiva riusando
`Store.importSnapshot()` — che già valida il file e migra i formati vecchi. Costa
poco, dà subito una cosa che oggi non c'è (uno storico fuori dal browser) e
valida tutta la plumbing di rete. Ma non va mai presentato come «adesso
lavoriamo in squadra».

### Il vero percorso

1. **Sola lettura**: schema SQL, RLS, `CloudAdapter.read()` → `nestDB()`. Valida
   la mappatura su dati veri senza poter rompere niente.
2. **Scritture**: `db` resta la cache autorevole per l'interfaccia e
   `Store.commit()` resta sincrono — zero `async` nelle viste, nessuno dei
   `saveDB()` cambia. localStorage non viene sostituito: viene **retrocesso a
   specchio locale e coda offline**. Il salvataggio accoda, un flusher con
   debounce drena: ogni lotto di `Store.takeChanges()` diventa **una**
   chiamata a `push_changes()`, mai spezzata. Più l'indicatore delle
   modifiche non inviate e l'avviso sulle righe respinte.
3. **Pull**: polling ogni 20-30 s, al ritorno sulla finestra e dopo ogni invio
   riuscito — prima di Realtime, che aggiunge riconnessione, rinnovo del token e
   ordinamento degli eventi per un vantaggio che in una squadra piccola non si
   percepisce. L'applicazione di un pull va rinviata finché c'è una scheda aperta
   con un form a metà.
4. **Autenticazione** (vedi sopra).

## Lo schema SQL

Dalla 0.82.0 lo schema è scritto: `supabase/schema.sql`, da eseguire nell'editor
SQL di Supabase (si può rieseguire: è idempotente). Contiene le tabelle, i
vincoli, il registro `sync_tables`, le lapidi e le due funzioni da cui passa
tutta la sincronizzazione. `test/schema-sql.test.js` lo tiene allineato al
codice — tabelle, padri, politiche di merge e tipo di ogni colonna — e, con un
Postgres a disposizione (`BOMTRACK_PG`, in CI c'è), lo carica e ci fa passare un
database che tocca tutte le tabelle.

**Chiavi esterne differite.** Tutte `deferrable initially deferred`: i
riferimenti circolari (`items.active_price_id` ↔ `item_prices`, distinte fra
articoli dello stesso invio) non impongono un ordine di inserimento, e i
vincoli si controllano insieme alla fine dell'invio. Che cosa può citare che
cosa lo decide l'app:

| Riferimento | Regola | Perché |
|---|---|---|
| fornitori, articoli, famiglie, centri, commesse, documenti d'archivio | `no action` | l'app impedisce di eliminarli finché sono citati (`supplierUses`, `isItemUsedAnywhere`, `delJob`…): una violazione è un difetto dell'app, e il commit la rifiuta |
| `rfq_id`, `plan_id`, `odp_id`, `odp_phase_id`, `decl_id`, `active_price_id`, `job_id` di ODP e promemoria | `set null` | tracciabilità: l'app elimina liberamente il documento citato, e la lettura locale è già «best effort» |
| righe figlie → padre | `cascade` | |
| `order_id`/`line_id` di movimenti e ricevimenti | nessuna chiave | polimorfi: un ODA, un ODL o un ODP |

**`push_changes(payload)`** — l'unica via di scrittura, e una transazione sola:

```json
{ "upsert": { "tabella": [righe di dbVersoCloud] },
  "remove": { "tabella": [id] },
  "settings": { "data": {}, "updated_at": "…", "updated_by": "…" },
  "base": { "items": { "<uuid>": "2026-10-16T07:00:00.000Z" } } }
```

- `base` (facoltativo, dalla 0.103.2 per le radici, dalla 0.105.6 anche per
  le figlie per riga): `{ tabella: { id: updated_at } }`, la versione da cui il
  client è partito per le righe che già conosceva. Con `base` decide solo la
  versione (dalla 0.105.6): se sul server la riga è ancora quella la modifica
  passa, qualunque data porti — l'orologio del PC non conta più; se è intanto
  cambiata, la modifica è fatta su una copia vecchia e viene respinta, per
  quanto recente sia la sua data. Confronto al millesimo;
- senza `base` (righe nuove, ripristini, client di prima della 0.103.2):
  last-write-wins su `updated_at`; chi perde torna in `rejected` e l'app lo
  deve dire;
- le figlie per riga partono se diverse dalla fotografia dell'ultimo invio
  (dalla 0.105.6; prima: se datate dopo l'ultimo invio, meno un margine);
- `created_by`, `updated_by`, `trash.deleted_by` e `settings.updated_by` li
  scrive il server con l'utente che invia (dalla 0.105.6); le righe vecchie che
  arrivano nuove (primo caricamento, ripristino) tengono i loro autori;
- numeri dei documenti unici (indice parziale `<tabella>_numero_unico` sui
  numeri `SIGLA-ANNO-N`, dalla 0.105.6): un numero nuovo già di un altro
  documento ferma l'invio con `23505` e il DETAIL elenca le righe in JSON
  (`[{tab, id, numero}]`); l'app le rinumera con `riserva_numeri` e rimanda
  (`cloudRiparaNumeri`);
- un riferimento che non regge (`23503`) l'app lo ripara e rimanda il lotto:
  vince chi usa — un record eliminato ma ancora citato torna, una
  cancellazione di un record citato si ritira (`cloudRiparaRiferimento`);
- figlie `replace`: per ogni padre accettato l'insieme si sostituisce con
  quello inviato, vuoto compreso — il client manda sempre l'insieme intero;
- `remove`: cancella e lascia una lapide in `sync_tombstones`; la lapide cede
  solo a un `updated_at` più recente (il ripristino dal cestino);
- una colonna o una tabella sconosciuta ferma l'invio: `jsonb_populate_recordset`
  la ignorerebbe in silenzio.

**Atomicità (D4).** Una dichiarazione di produzione e i movimenti che genera, il
lancio di un ODP con l'ODL e le uscite, l'eliminazione di un ODP con le sue
dichiarazioni: in locale sono un `commit()`, e finiscono nello stesso lotto di
`takeChanges()`. Il lotto è un invio, l'invio è una transazione: entra intero o
non entra. Per questo non servono RPC per operazione (`declare_progress`,
`launch_odp`): basta che l'adapter **non spezzi mai un lotto**.

**`pull_changes(since)`** — ciò che è cambiato sul server dopo `since`, più le
lapidi. Il confronto è su `synced_at`, l'ora del **server** scritta da un
trigger, non su `updated_at`, che è l'ora del client: un client con l'orologio
indietro scrive date vecchie, ma le sue righe vanno comunque a chi legge dopo.
Le figlie `replace` tornano per padre, intere. `now` va ripassato come `since`
al giro successivo **meno un margine**: una transazione lunga può scrivere un
`synced_at` più vecchio di un pull già fatto, e rileggere una riga non costa
niente.

**Numeri e codici (dalla 0.104.0).** Con l'archivio condiviso un PC senza
collegamento consulta soltanto (`cloudSolaLettura`, dentro `canWrite`), e chi
crea è sempre in linea. Per questo numeri e codici si chiedono al server prima
di usarli:

- `riserva_numeri(prefisso, quanti, minimo)` → `quanti` numeri della serie
  `«SIGLA-ANNO-»` (RFQ, ODA, ODL, ODP, FAB, COM, MT), in ordine: prima quelli
  in `numeri_liberi` (restituiti mentre un collega andava avanti), poi i
  successivi al più alto fra documenti, impegni aperti (`numeri_impegnati`) e
  `minimo` (il massimo dei documenti ancora in coda sul client). Un lucchetto
  per serie (`pg_advisory_xact_lock`) mette in fila le richieste. Un impegno si
  chiude quando il documento arriva (trigger `numeri_chiudi_impegno`) e scade
  dopo sette giorni. Serve il diritto di scrivere la tabella della serie. Lato
  client, `conNumeri({ ODA: 2 }, fare)` riserva, esegue `fare` (che consuma i
  numeri con le solite `next…Number()`) e restituisce con `libera_numeri`
  quelli non usati: la serie non ha buchi;
- `impegna_codici([{ codice, item }])` → i codici già presi: da un articolo
  diverso da `item`, o impegnati da un altro utente nell'ultima ora
  (`codici_impegnati`). Il confronto ignora maiuscole e spazi. Lato client
  `conCodiceImpegnato` e l'import del catalogo; i codici rifiutati finiscono
  in `_codiciAltrui`, che la generazione automatica salta fino al giro dopo.
  Quelli impegnati e non usati tornano con `libera_codici`. Un impegno per un
  articolo che sul server porta ormai un altro codice (rinominato) non vale più,
  e rinominando l'app restituisce il codice vecchio.

Le tabelle hanno RLS senza policy: le toccano solo le due funzioni
(`security definer`). La rinumerazione dopo il pull (`cloudNumeriDoppi`) resta
come rete di sicurezza.

**Accesso (dalla 0.83.0).** RLS attiva su ogni tabella, con la matrice
dell'app scritta dove non si può aggirare. Due registri, e le policy si
generano da quelli:

- `role_areas` — ruolo → aree che scrive: è `ROLE_WRITE` di `core.js`, e il test
  lo verifica riga per riga;
- `table_areas` — tabella → aree che la scrivono. **Misurata, non dedotta**: la
  suite è stata fatta girare registrando quali aree `roleGuard` lasciava
  passare a ogni salvataggio e quali collezioni cambiavano. Una tabella scritta
  da più gesti accetta tutte le loro aree (i movimenti: magazzino *e*
  dichiarazioni di produzione), perché una policy più stretta dell'app
  rifiuterebbe un invio che l'app considera lecito, e con lui l'intero lotto.

| Chi | Legge | Scrive |
|---|---|---|
| admin | tutto | tutto |
| acquisti | tutto | documenti, ricevimenti, ODP e dichiarazioni, movimenti, commesse, promemoria |
| progettazione | tutto | articoli e loro righe, revisioni, allegati, richieste d'offerta (dal listino), movimenti, promemoria |
| lettore | tutto | niente |
| profilo sospeso | niente | niente |

Più due regole: il proprio profilo si aggiorna (nome, colore) ma non il proprio
ruolo né il proprio stato (trigger `profiles_guardia`); cestino e lapidi li
scrive chiunque elimini qualcosa. `push_changes()` controlla i permessi di
**ogni** tabella del lotto prima di toccarne una, e si ferma dicendo quale: RLS
da sola non basta, perché una `DELETE` non permessa non dà errore — tocca zero
righe — e la lapide resterebbe, facendo cancellare la riga agli altri client.
La chiave di servizio (migrazione, primo amministratore) non ha RLS e passa.

## Deploy

Il frontend è statico (nessun build): pubblicabile così com'è su **GitHub Pages** o
**Cloudflare Pages** (branch `main`, root `/`). Il contesto HTTPS garantisce `crypto.randomUUID`.
