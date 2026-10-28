-- ═══════════════════════════════════════════════════════════
--  BOMTRACK — schema del database condiviso (Supabase / Postgres 15+)
-- ═══════════════════════════════════════════════════════════
-- Il contratto è docs/cloud-schema.md; i nomi e i tipi delle colonne sono
-- quelli che produce dbVersoCloud() in cloud-map.js. test/schema-sql.test.js
-- verifica che i due non si allontanino: ogni colonna che l'app invia esiste
-- qui, con un tipo compatibile, e ogni tabella del registro SCHEMA ha la sua.
-- Con un Postgres a disposizione (variabile BOMTRACK_PG) lo stesso test carica
-- questo file, ci spinge dentro un database intero e lo rilegge.
--
-- Tre decisioni reggono tutto il resto.
--
-- 1. **Le chiavi esterne sono differite** (`deferrable initially deferred`).
--    Il modello ha riferimenti circolari — `items.active_price_id` punta a
--    `item_prices`, che punta a `items`; una distinta cita articoli che
--    arrivano nello stesso invio — e con vincoli immediati l'ordine degli
--    inserimenti diventerebbe un problema da risolvere a ogni invio. Differite,
--    si controllano tutte insieme al commit: l'ordine non conta, l'integrità sì.
--
-- 2. **Si scrive solo attraverso push_changes()**, una funzione: una
--    transazione sola per tutto ciò che il client manda. Una dichiarazione di
--    produzione e i movimenti che genera, il lancio di un ODP con l'ODL e le
--    uscite di materiale, l'eliminazione di un ODP con le sue dichiarazioni: in
--    locale sono un commit(), qui sono un invio, e un invio entra intero o non
--    entra. Non servono RPC per operazione — `declare_progress`,
--    `launch_odp` — purché il client non spezzi mai un lotto di
--    Store.takeChanges(): è quel lotto l'unità atomica.
--
-- 3. **Che cosa può citare che cosa lo decide l'app.** Dove l'app impedisce di
--    eliminare un record citato (fornitori, articoli, famiglie, commesse,
--    documenti d'archivio: supplierUses, isItemUsedAnywhere…) la chiave è
--    `no action`, e una violazione è un difetto dell'app che il commit rifiuta.
--    Dove l'app elimina liberamente un documento citato da un altro per sola
--    tracciabilità (rfq_id, plan_id, odp_id…) la chiave è `set null`, come la
--    lettura locale «best effort». I riferimenti polimorfi (order_id dei
--    movimenti e dei ricevimenti: un ODA, un ODL o un ODP) non hanno chiave.

set client_min_messages = warning;   -- i «drop … if exists» di un secondo caricamento non sono notizie

-- ─── Registro delle tabelle sincronizzate ───────────────────
-- Lo specchio SQL di SCHEMA in store.js: quale tabella, figlia di chi, con che
-- politica di merge. push_changes() e pull_changes() accettano solo nomi che
-- stanno qui — sono nomi usati in SQL dinamico — e il test verifica che il
-- registro dica le stesse cose di SCHEMA.
create table if not exists public.sync_tables (
  tab text primary key,
  parent_tab text,
  parent_col text,
  merge text not null check (merge in ('root', 'row', 'replace'))
);

-- Lapidi: le cancellazioni, perché un invio di soli upsert non le sa esprimere
-- e ciò che uno cancella riapparirebbe al pull dell'altro. Una lapide cede solo
-- a un record con updated_at più recente (un ripristino dal cestino).
create table if not exists public.sync_tombstones (
  tab text not null,
  id text not null,
  deleted_at timestamptz not null default clock_timestamp(),
  deleted_by uuid,
  synced_at timestamptz not null default clock_timestamp(),
  primary key (tab, id)
);

-- Le impostazioni del team: un oggetto solo, senza updated_at proprio in
-- locale. Una riga, sovrascritta per intero.
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz,
  updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

-- ─── Anagrafiche ────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade deferrable initially deferred,
  name text, username text, email text,
  role text check (role in ('admin', 'acquisti', 'progettazione', 'officina', 'lettore')),
  color text, active boolean,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.suppliers (
  id uuid primary key,
  name text, referente text, email text, phone text, vat text,
  street text, street_number text, zip text, city text, province text, country text,
  default_transport text, default_payment text, transit_days numeric, notes text, active boolean,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.customers (
  id uuid primary key,
  name text, referente text, email text, phone text, vat text,
  street text, street_number text, zip text, city text, province text, country text,
  notes text, active boolean,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.work_centers (
  id uuid primary key,
  name text, hourly_rate numeric, capacity_hours numeric, hours_per_day numeric, queue_days numeric, setup_hours numeric,
  active boolean, child_sets text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.work_center_suppliers (
  id uuid primary key,
  work_center_id uuid not null references public.work_centers(id) on delete cascade deferrable initially deferred,
  supplier_id uuid references public.suppliers(id) deferrable initially deferred,
  rate numeric, note text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.families (
  id uuid primary key,
  name text, kind text, sigla text, child_sets text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.sub_families (
  id uuid primary key,
  family_id uuid not null references public.families(id) on delete cascade deferrable initially deferred,
  name text, sigla text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.jobs (
  id uuid primary key,
  number text, customer text, title text, customer_ref text, status text,
  date date, due_date date, notes text, active boolean,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

-- ─── Articoli ───────────────────────────────────────────────
create table if not exists public.items (
  id uuid primary key,
  code text, name text, type text, uom text, notes text,
  active boolean, favorite boolean, obsolete boolean,
  unit_cost numeric, purchase_price numeric,
  supplier_id uuid references public.suppliers(id) deferrable initially deferred,
  supplier_code text, supplier_desc text,
  active_price_id uuid,   -- chiave aggiunta sotto, dopo item_prices
  sourcing text,
  family_id uuid references public.families(id) deferrable initially deferred,
  sub_family_id uuid references public.sub_families(id) deferrable initially deferred,
  machine_item_id uuid references public.items(id) deferrable initially deferred,
  group_item_id uuid references public.items(id) deferrable initially deferred,
  sigla text, overhead_pct_override numeric, margin_pct_override numeric,
  alt_uom text, alt_factor numeric,
  concept_id text, name_free text, g_code_len int, g_code_type text, incr_digits_n int, incr_digits_s int,
  rev text, lot_size numeric, lot_mode text, safety_stock numeric, assembly_days numeric,
  location text,
  code_manual boolean, code_manual_by uuid, code_manual_at timestamptz, code_note text,
  replaced_by_id uuid references public.items(id) on delete set null deferrable initially deferred,
  configured_from_id uuid references public.items(id) on delete set null deferrable initially deferred,
  config_choices jsonb, config_key text, config_hash text,
  child_sets text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);
-- Colonne aggiunte dopo la prima stesura (0.88.0, programmazione a ritroso):
-- su un database già creato `create table if not exists` non le aggiunge.
alter table public.work_centers add column if not exists hours_per_day numeric;
alter table public.work_centers add column if not exists queue_days numeric;
alter table public.work_centers add column if not exists setup_hours numeric;
alter table public.suppliers add column if not exists transit_days numeric;
alter table public.items add column if not exists assembly_days numeric;
-- 0.101.0: l'ubicazione a scaffale dell'articolo.
alter table public.items add column if not exists location text;
-- 0.115.0: il codice scritto a mano, con chi l'ha deciso, quando e perché.
alter table public.items add column if not exists code_manual boolean;
alter table public.items add column if not exists code_manual_by uuid;
alter table public.items add column if not exists code_manual_at timestamptz;
alter table public.items add column if not exists code_note text;
-- 0.118.0: il sostitutivo di un articolo fuori produzione (modulo Alternativi).
alter table public.items add column if not exists replaced_by_id uuid references public.items(id) on delete set null deferrable initially deferred;
-- 0.119.0: da quale modello e con quali scelte è stato generato un articolo
-- (modulo Varianti). La condizione e la formula delle righe di distinta
-- stanno sotto, dopo item_components.
alter table public.items add column if not exists configured_from_id uuid references public.items(id) on delete set null deferrable initially deferred;
alter table public.items add column if not exists config_choices jsonb;
alter table public.items add column if not exists config_key text;
alter table public.items add column if not exists config_hash text;
-- A6: `unique (code)` va aggiunto dopo la bonifica dei duplicati storici
-- (Gestione › Backup › codici duplicati). Prima, rifiuterebbe dati veri.

-- Le tre tabelle «replace»: l'insieme è la definizione dell'articolo, le righe
-- non hanno identità propria e la chiave è costruita (testo). Si riscrivono
-- in blocco per padre, e non hanno date proprie: vale quella del padre.
create table if not exists public.item_components (
  id text primary key,
  item_id uuid not null references public.items(id) on delete cascade deferrable initially deferred,
  child_item_id uuid references public.items(id) deferrable initially deferred,
  qty numeric, scrap_pct numeric, cond text, qty_expr text, pos int,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.item_operations (
  id text primary key,
  item_id uuid not null references public.items(id) on delete cascade deferrable initially deferred,
  work_center_id uuid references public.work_centers(id) deferrable initially deferred,
  hours numeric, note text, pos int,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.item_cycle_rows (
  id text primary key,
  item_id uuid not null references public.items(id) on delete cascade deferrable initially deferred,
  kind text check (kind in ('item', 'op')),
  child_item_id uuid references public.items(id) deferrable initially deferred,
  qty numeric, cost_override numeric,
  work_center_id uuid references public.work_centers(id) deferrable initially deferred,
  supplier_id uuid references public.suppliers(id) deferrable initially deferred,
  cost_mode text, hours numeric, days numeric, rate numeric, cost numeric, note text, pos int,
  synced_at timestamptz not null default clock_timestamp()
);

-- 0.118.0: gli equivalenti di un articolo, in ordine di preferenza (modulo
-- Alternativi). Quarta tabella «replace», per la stessa ragione delle altre:
-- l'elenco è la definizione, e `item_id` è il padre — l'alternativo è
-- `alt_item_id`.
create table if not exists public.item_alternatives (
  id text primary key,
  item_id uuid not null references public.items(id) on delete cascade deferrable initially deferred,
  alt_item_id uuid references public.items(id) deferrable initially deferred,
  note text, pos int,
  synced_at timestamptz not null default clock_timestamp()
);

-- 0.119.0: le opzioni di una macchina modello (modulo Varianti). Quinta
-- tabella «replace». Le scelte di un'opzione sono un elenco breve che si legge
-- sempre tutto insieme: jsonb, non un'altra tabella.
create table if not exists public.item_options (
  id text primary key,
  item_id uuid not null references public.items(id) on delete cascade deferrable initially deferred,
  code text, name text, choices jsonb, pos int,
  synced_at timestamptz not null default clock_timestamp()
);
-- 0.119.0: la condizione («L=3|4») e la formula di quantità («L*2») di una
-- riga di distinta (modulo Varianti).
alter table public.item_components add column if not exists cond text;
alter table public.item_components add column if not exists qty_expr text;

-- ─── Documenti ──────────────────────────────────────────────
create table if not exists public.production_plans (
  id uuid primary key,
  number text, title text, date date, due_date date, notes text,
  job_id uuid references public.jobs(id) deferrable initially deferred,
  active boolean, child_sets text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.production_plan_lines (
  id uuid primary key,
  plan_id uuid not null references public.production_plans(id) on delete cascade deferrable initially deferred,
  item_id uuid references public.items(id) deferrable initially deferred,
  qty numeric, due_date date,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

-- 0.118.0: «per questo piano, di questo articolo usa quest'altro» (modulo
-- Alternativi). Una riga per decisione, con chi l'ha presa.
create table if not exists public.production_plan_substitutions (
  id uuid primary key,
  plan_id uuid not null references public.production_plans(id) on delete cascade deferrable initially deferred,
  item_id uuid references public.items(id) deferrable initially deferred,
  alt_item_id uuid references public.items(id) deferrable initially deferred,
  qty numeric, note text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.rfqs (
  id uuid primary key,
  number text, title text, date date, status text,
  supplier_id uuid references public.suppliers(id) deferrable initially deferred,
  transport text, payment text,
  plan_id uuid references public.production_plans(id) on delete set null deferrable initially deferred,
  job_id uuid references public.jobs(id) deferrable initially deferred,
  notes text, notes_internal text, active boolean, child_sets text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.rfq_lines (
  id uuid primary key,
  rfq_id uuid not null references public.rfqs(id) on delete cascade deferrable initially deferred,
  item_id uuid references public.items(id) deferrable initially deferred,
  phase_key text, phase_keys text,
  code text, description text, uom text, qty numeric, price numeric,
  delivery_date date, confirmed_date date, note text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.item_prices (
  id uuid primary key,
  item_id uuid not null references public.items(id) on delete cascade deferrable initially deferred,
  supplier_id uuid references public.suppliers(id) deferrable initially deferred,
  price numeric, min_qty numeric, lead_days numeric, price_uom text,
  code text, description text, date date,
  rfq_id uuid references public.rfqs(id) on delete set null deferrable initially deferred,
  line_id uuid, note text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);
-- La stessa offerta registrata due volte non crea due quotazioni (rfqRecordPrices).
create unique index if not exists item_prices_offerta on public.item_prices (item_id, rfq_id, line_id)
  where rfq_id is not null and line_id is not null;

do $$ begin
  alter table public.items add constraint items_active_price_fk foreign key (active_price_id)
    references public.item_prices(id) on delete set null deferrable initially deferred;
exception when duplicate_object then null; end $$;

create table if not exists public.orders (
  id uuid primary key,
  number text, title text, date date, status text,
  supplier_id uuid references public.suppliers(id) deferrable initially deferred,
  transport text, payment text,
  rfq_id uuid references public.rfqs(id) on delete set null deferrable initially deferred,
  plan_id uuid references public.production_plans(id) on delete set null deferrable initially deferred,
  job_id uuid references public.jobs(id) deferrable initially deferred,
  supplier_confirmation text, notes text, notes_internal text, active boolean, child_sets text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

-- Nessuna colonna `received`: è la somma di order_receipts (vista più sotto).
create table if not exists public.order_lines (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete cascade deferrable initially deferred,
  item_id uuid references public.items(id) deferrable initially deferred,
  phase_key text, phase_keys text,
  code text, description text, uom text, qty numeric, price numeric,
  delivery_date date, confirmed_date date, note text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp(),
  -- Riga di conto lavoro: mai un articolo, o il magazzino conterebbe due volte.
  constraint order_lines_cl_senza_articolo check (phase_key is null or item_id is null)
);

create table if not exists public.production_orders (
  id uuid primary key,
  number text,
  item_id uuid references public.items(id) deferrable initially deferred,
  code text, name text, uom text, qty numeric, date date, due_date date, status text,
  title text, notes text, notes_internal text,
  plan_id uuid references public.production_plans(id) on delete set null deferrable initially deferred,
  job_id uuid references public.jobs(id) on delete set null deferrable initially deferred,
  active boolean, child_sets text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.production_order_phases (
  id uuid primary key,
  production_order_id uuid not null references public.production_orders(id) on delete cascade deferrable initially deferred,
  seq int, op_index int, phase_key text,
  work_center_id uuid references public.work_centers(id) deferrable initially deferred,
  wc_name text,
  supplier_id uuid references public.suppliers(id) deferrable initially deferred,
  supplier_name text, run_from int, run_to int, passata int,
  cost_mode text, hours numeric, days numeric, rate numeric, cost numeric, note text,
  planned_start date, planned_end date,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);
-- 0.90.0: inizio e fine pianificati di ogni fase, per i database già creati.
alter table public.production_order_phases add column if not exists planned_start date;
alter table public.production_order_phases add column if not exists planned_end date;

create table if not exists public.production_order_materials (
  id uuid primary key,
  production_order_id uuid not null references public.production_orders(id) on delete cascade deferrable initially deferred,
  item_id uuid references public.items(id) deferrable initially deferred,
  code text, name text, uom text, per_pezzo numeric, qty numeric,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.work_orders (
  id uuid primary key,
  number text, title text, date date, status text,
  supplier_id uuid references public.suppliers(id) deferrable initially deferred,
  transport text, payment text,
  rfq_id uuid references public.rfqs(id) on delete set null deferrable initially deferred,
  plan_id uuid references public.production_plans(id) on delete set null deferrable initially deferred,
  job_id uuid references public.jobs(id) deferrable initially deferred,
  odp_id uuid references public.production_orders(id) on delete set null deferrable initially deferred,
  supplier_confirmation text, notes text, notes_internal text, active boolean, child_sets text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.work_order_lines (
  id uuid primary key,
  work_order_id uuid not null references public.work_orders(id) on delete cascade deferrable initially deferred,
  item_id uuid,
  phase_key text, phase_keys text,
  code text, description text, uom text, qty numeric, price numeric,
  delivery_date date, confirmed_date date, start_date date, note text,
  odp_id uuid references public.production_orders(id) on delete set null deferrable initially deferred,
  odp_phase_id uuid references public.production_order_phases(id) on delete set null deferrable initially deferred,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp(),
  -- Un ODL manda pezzi a lavorare, non compra merce: nessuna riga ha un articolo.
  constraint work_order_lines_mai_articolo check (item_id is null)
);
-- 0.113.0: l'inizio lavoro, cioè quando consegniamo il materiale al terzista,
-- per i database già creati.
alter table public.work_order_lines add column if not exists start_date date;

-- ─── Eventi ─────────────────────────────────────────────────
-- Righe piatte, che si aggiungono e non si correggono: la giacenza, il
-- ricevuto e l'avanzamento sono somme di queste, mai colonne scrivibili.
-- `date` qui è l'istante dell'evento, non un giorno di calendario.
create table if not exists public.production_declarations (
  id uuid primary key,
  odp_id uuid references public.production_orders(id) on delete cascade deferrable initially deferred,
  phase_id uuid references public.production_order_phases(id) on delete set null deferrable initially deferred,
  -- 0.116.0: avvii e rientri di una riga d'ordine di lavoro senza ODP. Nessuna
  -- chiave, come `order_id` sui movimenti: l'ODL si annulla, non si elimina.
  odl_id uuid, odl_line_id uuid,
  kind text, date timestamptz, qty numeric, scrap numeric, note text, motivo text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);
-- 0.116.0: per i database già creati.
alter table public.production_declarations add column if not exists odl_id uuid;
alter table public.production_declarations add column if not exists odl_line_id uuid;

create table if not exists public.stock_movements (
  id uuid primary key,
  item_id uuid references public.items(id) deferrable initially deferred,
  kind text, qty numeric, date timestamptz, note text,
  supplier_id uuid references public.suppliers(id) deferrable initially deferred,
  from_supplier_id uuid references public.suppliers(id) deferrable initially deferred,
  order_id uuid,   -- ODA, ODL o ODP: polimorfo, nessuna chiave
  line_id uuid,
  decl_id uuid references public.production_declarations(id) on delete set null deferrable initially deferred,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp(),
  -- Fra due terzisti il pezzo passa sempre da noi: un passaggio ha un estremo nullo.
  constraint stock_movements_clstep check (kind is distinct from 'clStep' or supplier_id is null or from_supplier_id is null)
);

create table if not exists public.order_receipts (
  id uuid primary key,
  coll text check (coll in ('orders', 'workOrders')),
  order_id uuid,   -- un ODA o un ODL, secondo `coll`: nessuna chiave
  line_id uuid,
  qty numeric, kind text, date date, note text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.productions (
  id uuid primary key,
  plan_id uuid references public.production_plans(id) on delete set null deferrable initially deferred,
  item_id uuid references public.items(id) deferrable initially deferred,
  qty numeric, date timestamptz, note text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.item_revisions (
  id uuid primary key,
  item_id uuid references public.items(id) deferrable initially deferred,
  rev text, date timestamptz, motivo text, snapshot jsonb,
  eco_number text, eco_kind text, eco_impact jsonb,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);
-- Modifiche tecniche (0.96.0): numero, tipo e documenti aperti al rilascio.
alter table public.item_revisions add column if not exists eco_number text;
alter table public.item_revisions add column if not exists eco_kind text;
alter table public.item_revisions add column if not exists eco_impact jsonb;

-- ─── Allegati, promemoria, cestino ──────────────────────────
create table if not exists public.attachment_docs (
  id uuid primary key,
  path text, description text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.attachments (
  id uuid primary key,
  item_id uuid references public.items(id) deferrable initially deferred,
  doc_id uuid references public.attachment_docs(id) deferrable initially deferred,
  page int, name text, mime text, size numeric,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

-- Documenti emessi (0.112.0): la copia PDF di richieste, ordini e ordini di
-- lavoro, scritta nella cartella d'archivio. Qui solo il percorso e ciò che
-- serve a ritrovarla: il file non passa mai dal server. `ref_id` punta a una
-- di tre tabelle secondo `kind`, per questo non ha una chiave esterna.
create table if not exists public.generated_docs (
  id uuid primary key,
  kind text, ref_id uuid, number text, seq int,
  path text, format text, size numeric, sha256 text,
  sent_at timestamptz, sent_via text, sent_to text,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.reminders (
  id uuid primary key,
  date date, title text, notes text, gravita text, done boolean, done_at timestamptz,
  job_id uuid references public.jobs(id) on delete set null deferrable initially deferred,
  active boolean,
  pos int, created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  synced_at timestamptz not null default clock_timestamp()
);

create table if not exists public.trash (
  id uuid primary key,
  coll text, deleted_at timestamptz, deleted_by uuid, record jsonb,
  pos int,
  synced_at timestamptz not null default clock_timestamp()
);

-- ─── Letture ricavate ───────────────────────────────────────
create or replace view public.order_line_received with (security_invoker = true) as
  select line_id, coll, sum(qty) as received from public.order_receipts group by line_id, coll;

-- ─── Registro ───────────────────────────────────────────────
insert into public.sync_tables (tab, parent_tab, parent_col, merge) values
  ('profiles', null, null, 'root'),
  ('suppliers', null, null, 'root'),
  ('customers', null, null, 'root'),
  ('work_centers', null, null, 'root'),
  ('work_center_suppliers', 'work_centers', 'work_center_id', 'row'),
  ('families', null, null, 'root'),
  ('sub_families', 'families', 'family_id', 'row'),
  ('jobs', null, null, 'root'),
  ('items', null, null, 'root'),
  ('item_components', 'items', 'item_id', 'replace'),
  ('item_operations', 'items', 'item_id', 'replace'),
  ('item_cycle_rows', 'items', 'item_id', 'replace'),
  ('item_prices', 'items', 'item_id', 'row'),
  ('item_alternatives', 'items', 'item_id', 'replace'),
  ('item_options', 'items', 'item_id', 'replace'),
  ('production_plans', null, null, 'root'),
  ('production_plan_lines', 'production_plans', 'plan_id', 'row'),
  ('production_plan_substitutions', 'production_plans', 'plan_id', 'row'),
  ('rfqs', null, null, 'root'),
  ('rfq_lines', 'rfqs', 'rfq_id', 'row'),
  ('orders', null, null, 'root'),
  ('order_lines', 'orders', 'order_id', 'row'),
  ('production_orders', null, null, 'root'),
  ('production_order_phases', 'production_orders', 'production_order_id', 'row'),
  ('production_order_materials', 'production_orders', 'production_order_id', 'row'),
  ('work_orders', null, null, 'root'),
  ('work_order_lines', 'work_orders', 'work_order_id', 'row'),
  ('production_declarations', null, null, 'root'),
  ('stock_movements', null, null, 'root'),
  ('order_receipts', null, null, 'root'),
  ('productions', null, null, 'root'),
  ('item_revisions', null, null, 'root'),
  ('attachment_docs', null, null, 'root'),
  ('attachments', null, null, 'root'),
  ('generated_docs', null, null, 'root'),
  ('reminders', null, null, 'root'),
  ('trash', null, null, 'root')
on conflict (tab) do update set parent_tab = excluded.parent_tab, parent_col = excluded.parent_col, merge = excluded.merge;

-- ─── synced_at: l'ora del server, per il pull ───────────────
-- updated_at è l'ora del client e fa da **versione** della riga; synced_at è
-- quella del server e decide che cosa un altro client non ha ancora visto.
-- Sono due domande diverse: un client con l'orologio indietro scrive un
-- updated_at vecchio, ma la sua riga va comunque mandata a chi fa pull dopo.
create or replace function public.sync_stamp() returns trigger language plpgsql as $$
declare
  quando timestamptz;
  nuovo jsonb;
  vecchio jsonb;
  chi uuid;
  campi jsonb := '{}'::jsonb;
  recente timestamptz := clock_timestamp() - interval '1 day';
begin
  new.synced_at := clock_timestamp();
  if current_user not in ('authenticated', 'anon') then return new; end if;
  nuovo := to_jsonb(new);
  -- Un updated_at nel futuro (dalla 0.105.3). Un PC con l'orologio avanti (una
  -- data del BIOS sbagliata, un updated_at scritto a mano dall'API) bloccava
  -- le modifiche dei colleghi a ogni cosa che toccava, quando a decidere era
  -- l'ordine delle date. Dall'app e dall'API si rifiuta; dal SQL Editor
  -- (utente postgres) no.
  quando := (nuovo->>'updated_at')::timestamptz;
  if quando > clock_timestamp() + interval '5 minutes' then
    raise exception 'L''orologio di questo PC è avanti rispetto al server: correggi data e ora del PC, poi le modifiche partono da sole';
  end if;
  -- Chi ha scritto lo dice il server (dalla 0.105.6). created_by, updated_by
  -- e il deleted_by del cestino arrivavano dal PC e si salvavano com'erano:
  -- dall'API si poteva far risultare autore di un prezzo chiunque. Ora:
  --  - una modifica (updated_at cambiato) è di chi la invia; chi ha creato la
  --    riga non cambia più;
  --  - una riga nuova di oggi (creata, modificata o eliminata nell'ultimo
  --    giorno) è di chi la invia. Le righe vecchie che arrivano nuove al
  --    server — il primo caricamento dell'archivio, un ripristino dal cestino
  --    — tengono gli autori che hanno: sono la storia, non un gesto di adesso.
  -- Un trigger solo per tutte le tabelle: i campi che una tabella non ha,
  -- jsonb_populate_record li ignora.
  chi := auth.uid();
  if chi is null then return new; end if;
  if tg_op = 'UPDATE' then vecchio := to_jsonb(old); end if;
  if nuovo ? 'created_by' then
    if tg_op = 'INSERT' then
      if coalesce((nuovo->>'created_at')::timestamptz, clock_timestamp()) > recente then
        campi := campi || jsonb_build_object('created_by', chi);
      end if;
    else
      campi := campi || jsonb_build_object('created_by', coalesce(vecchio->'created_by', nuovo->'created_by'));
    end if;
  end if;
  if nuovo ? 'updated_by' then
    if tg_op = 'INSERT' then
      if coalesce(quando, clock_timestamp()) > recente then
        campi := campi || jsonb_build_object('updated_by', chi);
      end if;
    elsif (nuovo->'updated_at') is distinct from (vecchio->'updated_at') then
      campi := campi || jsonb_build_object('updated_by', chi);
    else
      campi := campi || jsonb_build_object('updated_by', vecchio->'updated_by');
    end if;
  end if;
  if nuovo ? 'deleted_by' then
    if tg_op = 'INSERT' then
      if coalesce((nuovo->>'deleted_at')::timestamptz, clock_timestamp()) > recente then
        campi := campi || jsonb_build_object('deleted_by', chi);
      end if;
    else
      campi := campi || jsonb_build_object('deleted_by', coalesce(vecchio->'deleted_by', nuovo->'deleted_by'));
    end if;
  end if;
  if campi <> '{}'::jsonb then new := jsonb_populate_record(new, campi); end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array (select array_agg(tab) from public.sync_tables) || array['settings'] loop
    execute format('drop trigger if exists sync_stamp on public.%I', t);
    execute format('create trigger sync_stamp before insert or update on public.%I for each row execute function public.sync_stamp()', t);
  end loop;
end $$;

-- La colonna del numero di un documento numerato in serie (SIGLA-ANNO-N), o
-- null. Le stesse tabelle di numeri_serie_usati, più sotto.
create or replace function public.colonna_numero(tab text) returns text
language sql immutable set search_path = public as $$
  select case when tab = 'item_revisions' then 'eco_number'
              when tab in ('rfqs', 'orders', 'work_orders', 'production_orders', 'production_plans', 'jobs') then 'number' end
$$;

-- ─── Invio ──────────────────────────────────────────────────
-- payload = {
--   "upsert":   { tabella: [righe di dbVersoCloud] },
--   "remove":   { tabella: [id] },
--   "settings": { "data": {...}, "updated_at": "...", "updated_by": "..." },  -- facoltativo
--   "base":     { tabella: { id: updated_at } }                                -- facoltativo
-- }
-- Tutto in una transazione: se una riga viola un vincolo, non entra niente.
--
-- Regole:
--  - base: per le righe che il client ha modificato partendo da una versione
--    nota, l'updated_at di quella versione (radici dalla 0.103.2, righe figlie
--    dalla 0.105.6). Decide **solo** la versione (dalla 0.105.6): se sul
--    server la riga è ancora quella, la modifica passa, qualunque data porti;
--    se intanto è cambiata (un collega l'ha salvata dopo), la modifica è fatta
--    su una copia vecchia e viene respinta, per quanto recente sia la sua
--    data. Prima contava anche l'ordine delle date, cioè l'orologio del PC: un
--    PC con l'orologio indietro vedeva respinta ogni modifica a ciò che un
--    collega aveva toccato, anche partendo dalla copia giusta. Il confronto è
--    al millesimo: le date che il server scrive da sé (now()) hanno i
--    microsecondi, quelle che il browser rimanda no.
--  - senza base (una riga nuova, un ripristino, un client di prima della
--    0.103.2): last-write-wins su updated_at. Una riga più vecchia di quella
--    che c'è non passa, e torna in `rejected` — l'app deve dirlo all'utente.
--  - numeri dei documenti: un numero nuovo per quella riga, già di un altro
--    documento, ferma l'invio con 23505, e il DETAIL elenca le righe in JSON
--    ({tab, id, numero}): l'app le rinumera con numeri riservati e rimanda.
--  - replace: per ogni padre **accettato** in questo invio, l'insieme dei figli
--    si sostituisce con quello inviato, vuoto compreso. Il client manda sempre
--    l'insieme completo di ogni padre che invia (dbVersoCloud lo fa). Un padre
--    respinto si porta dietro i suoi figli.
--  - remove: cancella e lascia una lapide. La cancellazione vince su una
--    modifica concorrente (test/sync.test.js), ma cede a un updated_at più
--    recente della lapide: è il ripristino dal cestino.
--  - un campo che la tabella non ha ferma l'invio: jsonb_populate_recordset lo
--    ignorerebbe in silenzio, e un dato perso in silenzio è il peggiore.
create or replace function public.push_changes(payload jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  reg record;
  righe jsonb;
  agg text;
  datata boolean;
  sconosciuti text;
  applicati text[];
  dati text[];
  respinti jsonb := '[]'::jsonb;
  conteggio jsonb := '{}'::jsonb;
  accettati jsonb := '{}'::jsonb;   -- tabella → [id accettati], per i figli replace
  padri text[];
  ids text[];
  colnum text;
  doppi jsonb;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'push_changes: payload mancante';
  end if;
  -- Nomi di tabella: solo quelli del registro.
  select string_agg(k, ', ') into sconosciuti
    from (select jsonb_object_keys(coalesce(payload->'upsert', '{}')) k
          union select jsonb_object_keys(coalesce(payload->'remove', '{}'))) x
    where k not in (select tab from sync_tables);
  if sconosciuti is not null then
    raise exception 'push_changes: tabelle sconosciute: %', sconosciuti;
  end if;

  -- Permessi, prima di toccare qualunque cosa. RLS da sola non basta: una
  -- DELETE che la policy non permette non dà errore, tocca zero righe — e la
  -- lapide resterebbe, facendo cancellare la riga agli altri client al pull.
  -- Il controllo vale solo dove RLS si applica: la chiave di servizio (la
  -- migrazione, la creazione del primo amministratore) passa.
  select string_agg(k, ', ') into sconosciuti
    from (select jsonb_object_keys(coalesce(payload->'upsert', '{}')) k
          union select jsonb_object_keys(coalesce(payload->'remove', '{}'))
          union select 'settings' where payload ? 'settings') x
    where row_security_active(('public.' || k)::regclass) and not public.puo_scrivere_tabella(k);
  if sconosciuti is not null then
    raise exception 'push_changes: il ruolo % non scrive: %', coalesce(public.ruolo_attivo(), '(nessun profilo attivo)'), sconosciuti
      using errcode = '42501';
  end if;

  -- Ripristini espliciti (dalla 0.105.4): chi rimette un record dal cestino lo
  -- dice, e la lapide si toglie invece di gareggiare con la sua data. Con
  -- l'orologio del PC indietro il record ripristinato era «più vecchio» della
  -- cancellazione e il server lo respingeva. Vale solo per i record che lo
  -- stesso invio rimanda, e la policy delle lapidi lo limita a chi scrive la tabella.
  if jsonb_typeof(payload->'ripristina') = 'object' then
    for reg in select s.* from sync_tables s where payload->'ripristina' ? s.tab and payload->'upsert' ? s.tab loop
      if jsonb_typeof(payload->'ripristina'->reg.tab) <> 'array' then continue; end if;
      delete from sync_tombstones t
       where t.tab = reg.tab
         and t.id in (select jsonb_array_elements_text(payload->'ripristina'->reg.tab))
         and t.id in (select e->>'id' from jsonb_array_elements(payload->'upsert'->reg.tab) e);
    end loop;
  end if;

  -- Upsert: prima le radici, poi le figlie per riga, poi le sostituzioni.
  for reg in
    select s.* from sync_tables s
    where payload->'upsert' ? s.tab
    order by case s.merge when 'root' then 0 when 'row' then 1 else 2 end, s.tab
  loop
    righe := payload->'upsert'->reg.tab;
    if jsonb_typeof(righe) <> 'array' then
      raise exception 'push_changes: % non è un elenco', reg.tab;
    end if;

    select string_agg(distinct k, ', ') into sconosciuti
      from jsonb_array_elements(righe) e, jsonb_object_keys(e) k
      where k not in (select a.attname from pg_attribute a
                      where a.attrelid = ('public.' || reg.tab)::regclass and a.attnum > 0 and not a.attisdropped);
    if sconosciuti is not null then
      raise exception 'push_changes: %: colonne inesistenti: %', reg.tab, sconosciuti;
    end if;

    select string_agg(format('%I = excluded.%I', a.attname, a.attname), ', ' order by a.attnum),
           bool_or(a.attname = 'updated_at')
      into agg, datata
      from pg_attribute a
      where a.attrelid = ('public.' || reg.tab)::regclass and a.attnum > 0 and not a.attisdropped
        and a.attname not in ('id', 'synced_at');

    select coalesce(array_agg(e->>'id'), '{}') into dati from jsonb_array_elements(righe) e;

    -- Numeri dei documenti (dalla 0.105.6): l'indice unico c'è (più sotto), ma
    -- con RLS attiva il suo errore non dice quale riga, e l'app non saprebbe
    -- che cosa rinumerare. Qui sì: le righe che portano un numero nuovo per
    -- loro, già di un altro documento (o di un'altra riga dello stesso invio).
    -- Un numero che la riga ha già non conta: un doppione di prima
    -- dell'indice si modifica ancora.
    colnum := public.colonna_numero(reg.tab);
    if colnum is not null then
      execute format($q$
        select jsonb_agg(jsonb_build_object('tab', %1$L, 'id', s.id, 'numero', s.%2$I) order by s.id)
          from jsonb_populate_recordset(null::public.%1$I, $1) s
         where s.%2$I ~ '^[A-Z]{2,3}-[0-9]{4}-[0-9]+$'
           and not exists (select 1 from public.%1$I t where t.id = s.id and t.%2$I = s.%2$I)
           and (exists (select 1 from public.%1$I t
                         where t.%2$I = s.%2$I and t.%2$I ~ '^[A-Z]{2,3}-[0-9]{4}-[0-9]+$' and t.id <> s.id)
                or exists (select 1 from jsonb_populate_recordset(null::public.%1$I, $1) u
                            where u.%2$I = s.%2$I and u.id < s.id))
      $q$, reg.tab, colnum) into doppi using righe;
      if doppi is not null then
        raise exception 'duplicate key value violates unique constraint "%_numero_unico"', reg.tab
          using errcode = '23505', detail = doppi::text;
      end if;
    end if;

    if reg.merge = 'replace' then
      -- Solo i figli dei padri accettati in questo invio.
      select coalesce(array_agg(x), '{}') into padri
        from jsonb_array_elements_text(coalesce(accettati->reg.parent_tab, '[]')) x;
      execute format('delete from public.%I where %I::text = any($1)', reg.tab, reg.parent_col) using padri;
      execute format(
        'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1) r where r.%I::text = any($2)',
        reg.tab, reg.tab, reg.parent_col)
        using righe, padri;
      execute format(
        'select coalesce(array_agg(e->>''id''), ''{}'') from jsonb_array_elements($1) e where (e->>%L) = any($2)',
        reg.parent_col) into applicati using righe, padri;
    elsif not datata then
      -- Senza updated_at (il cestino) non c'è niente da confrontare: vince chi invia.
      execute format(
        'insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)
           on conflict (id) do update set %s',
        reg.tab, reg.tab, agg) using righe;
      applicati := dati;
    else
      execute format($q$
        insert into public.%1$I
        select s.* from jsonb_populate_recordset(null::public.%1$I, $1) s
        where not exists (select 1 from public.sync_tombstones t
                          where t.tab = %2$L and t.id = s.id::text
                            and (t.deleted_at >= coalesce(s.updated_at, '-infinity'::timestamptz)
                                 -- Con la versione di partenza è la modifica di
                                 -- una copia di prima della cancellazione, non un
                                 -- ripristino: la cancellazione vince. Tornava su
                                 -- senza le sue righe, che il delete aveva portato via.
                                 or ($2 is not null and $2 ? s.id::text)))
        on conflict (id) do update set %3$s
          where public.%1$I.updated_at is null
             or case when $2 is not null and $2 ? public.%1$I.id::text
                  -- Con la versione di partenza: è ancora quella? (O è la
                  -- stessa che arriva: un invio ripetuto dopo una risposta persa.)
                  then date_trunc('milliseconds', public.%1$I.updated_at)
                       = date_trunc('milliseconds', ($2->>public.%1$I.id::text)::timestamptz)
                    or public.%1$I.updated_at = excluded.updated_at
                  -- Senza: la data più recente.
                  else excluded.updated_at >= public.%1$I.updated_at
                end
      $q$, reg.tab, reg.tab, agg)
      using righe, payload->'base'->reg.tab;
      -- Chi è passato: le righe che ora portano l'updated_at inviato. Una
      -- respinta (più vecchia, o sotto una lapide) ne ha un altro, o non c'è.
      execute format(
        'select coalesce(array_agg(r.id::text), ''{}'') from jsonb_populate_recordset(null::public.%I, $1) r
           join public.%I t on t.id = r.id
          where t.updated_at is not distinct from r.updated_at',
        reg.tab, reg.tab) into applicati using righe;
      -- Un ripristino più recente della lapide la toglie.
      delete from sync_tombstones t where t.tab = reg.tab and t.id = any(applicati);
    end if;

    accettati := accettati || jsonb_build_object(reg.tab, to_jsonb(applicati));
    conteggio := conteggio || jsonb_build_object(reg.tab, coalesce(array_length(applicati, 1), 0));
    select coalesce(array_agg(d), '{}') into ids from unnest(dati) d where d is not null and not (d = any(applicati));
    select respinti || coalesce(jsonb_agg(jsonb_build_object('tab', reg.tab, 'id', d)), '[]')
      into respinti from unnest(ids) d;
    -- Chi è stato respinto deve ricevere la versione che ha vinto. Quella riga
    -- però non è cambiata in questo invio, e il suo synced_at può essere più
    -- vecchio dell'ultimo pull del mittente: senza questo ritocco il pull non
    -- gliela riporterebbe mai, e il suo archivio terrebbe la versione perdente.
    -- Lo stesso per una lapide che ha vinto.
    if array_length(ids, 1) > 0 then
      execute format('update public.%I set synced_at = clock_timestamp() where id::text = any($1)', reg.tab) using ids;
      update sync_tombstones t set synced_at = clock_timestamp() where t.tab = reg.tab and t.id = any(ids);
    end if;
  end loop;

  -- Cancellazioni, con la lapide.
  for reg in select s.* from sync_tables s where payload->'remove' ? s.tab loop
    select coalesce(array_agg(x), '{}') into ids from jsonb_array_elements_text(payload->'remove'->reg.tab) x;
    execute format('delete from public.%I where id::text = any($1)', reg.tab) using ids;
    insert into sync_tombstones (tab, id, deleted_by)
      select reg.tab, x, auth.uid() from unnest(ids) x
      on conflict (tab, id) do update set deleted_at = clock_timestamp(), deleted_by = excluded.deleted_by;
  end loop;

  -- Chi le ha cambiate lo dice il server (dalla 0.105.6); dal SQL Editor,
  -- senza utente, vale quello dichiarato.
  if payload ? 'settings' then
    insert into settings (id, data, updated_at, updated_by)
      values (1, coalesce(payload->'settings'->'data', '{}'),
              (payload->'settings'->>'updated_at')::timestamptz,
              coalesce(auth.uid(), (payload->'settings'->>'updated_by')::uuid))
      on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  end if;

  -- I vincoli differiti si controllano qui, dentro la funzione: un errore
  -- esce come eccezione di questa chiamata, e la transazione si annulla.
  set constraints all immediate;

  return jsonb_build_object('applied', conteggio, 'rejected', respinti);
end $$;

-- ─── Lettura ────────────────────────────────────────────────
-- Tutto ciò che è cambiato sul server dopo `since` (null = tutto), più le
-- lapidi. Le tabelle replace tornano per padre, intere: un padre cambiato
-- porta con sé l'insieme completo dei figli, così chi legge può sostituirlo.
-- `now` va conservato e ripassato come `since` al giro dopo, meno un margine:
-- una transazione lunga può scrivere un synced_at più vecchio di un pull già
-- fatto. Applicare due volte la stessa riga non costa niente.
-- L'istante da cui il pull successivo riparte (dalla 0.105.5). Non l'ora
-- esatta: una transazione cominciata prima e non ancora conclusa scrive righe
-- con un synced_at più vecchio, che il pull dopo non vedrebbe più. Allora
-- l'inizio della transazione aperta più vecchia, se c'è — ma non più indietro
-- di due minuti, perché una connessione rimasta appesa non faccia riscaricare
-- tutto a ogni giro. `security definer`: chi chiama non vede le transazioni
-- degli altri utenti. Il client toglie comunque un margine suo.
create or replace function public.pull_istante() returns timestamptz
language sql stable security definer set search_path = public as $$
  select least(clock_timestamp(), greatest(clock_timestamp() - interval '2 minutes',
    coalesce((select min(a.xact_start) from pg_stat_activity a
               where a.xact_start is not null and a.pid <> pg_backend_pid()
                 and a.datname = current_database() and a.backend_type = 'client backend'), 'infinity')))
$$;

-- ─── Pulizia del server (dalla 0.106.0) ─────────────────────
-- Una riga sola: quando è stata fatta l'ultima pulizia e fin dove arrivano le
-- lapidi rimaste. Nessuna policy: la toccano solo le funzioni qui sotto.
create table if not exists public.sync_stato (
  id int primary key default 1 check (id = 1),
  lapidi_dal timestamptz,
  pulito_il timestamptz
);
alter table public.sync_stato enable row level security;
insert into public.sync_stato (id) values (1) on conflict (id) do nothing;

create or replace function public.lapidi_dal() returns timestamptz
language sql stable security definer set search_path = public as $$
  select coalesce((select lapidi_dal from public.sync_stato where id = 1), '-infinity'::timestamptz)
$$;

create or replace function public.pull_changes(since timestamptz default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  reg record;
  tabelle jsonb := '{}'::jsonb;
  righe jsonb;
  lapidi jsonb;
  inizio timestamptz := public.pull_istante();
  dal timestamptz := coalesce(since, '-infinity'::timestamptz);
begin
  -- Le lapidi più vecchie le toglie pulizia_archivio() (dalla 0.106.0): chi
  -- chiede da prima di quel taglio non saprebbe più che cosa è stato
  -- cancellato, e si sente dire di riscaricare tutto.
  if since is not null and since < public.lapidi_dal() then
    return jsonb_build_object('now', inizio, 'completo', true);
  end if;
  for reg in select * from sync_tables loop
    if reg.merge = 'replace' then
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(c) - ''synced_at''), ''[]'') from public.%I c
          where c.%I in (select p.id from public.%I p where p.synced_at > $1)',
        reg.tab, reg.parent_col, reg.parent_tab) into righe using dal;
    else
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(t) - ''synced_at''), ''[]'') from public.%I t where t.synced_at > $1',
        reg.tab) into righe using dal;
    end if;
    tabelle := tabelle || jsonb_build_object(reg.tab, righe);
  end loop;
  select coalesce(jsonb_object_agg(tab, ids), '{}') into lapidi
    from (select tab, jsonb_agg(id) ids from sync_tombstones where synced_at > dal group by tab) x;
  return jsonb_build_object(
    'now', inizio,
    'tables', tabelle,
    'removed', lapidi,
    'settings', (select to_jsonb(s) - 'synced_at' - 'id' from settings s where s.synced_at > dal));
end $$;

-- ─── Lettura a pagine (dalla 0.105.4) ───────────────────────
-- Lo scaricamento completo (since nullo) in una risposta sola poteva superare
-- i limiti di tempo e di dimensione di Supabase su un archivio di qualche anno.
-- Qui una tabella alla volta, a pagine ordinate per chiave: `dopo` è l'ultima
-- chiave della pagina precedente (per le lapidi «tabella<TAB>id»). Si legge con
-- le stesse policy di pull_changes(). `settings` torna intera.
create or replace function public.pull_pagina(tab text, dopo text default null, quanti int default 1000)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  righe jsonb;
  tipo text;
  n int := least(greatest(coalesce(quanti, 1000), 1), 5000);
begin
  if tab = 'settings' then
    return jsonb_build_object('rows', coalesce((select jsonb_agg(to_jsonb(s) - 'synced_at' - 'id') from settings s), '[]'));
  end if;
  if tab = 'sync_tombstones' then
    select coalesce(jsonb_agg(jsonb_build_object('tab', x.tab, 'id', x.id) order by x.tab, x.id), '[]') into righe
      from (select t.tab, t.id from sync_tombstones t
             where dopo is null or (t.tab, t.id) > (split_part(dopo, E'\t', 1), split_part(dopo, E'\t', 2))
             order by t.tab, t.id limit n) x;
    return jsonb_build_object('rows', righe);
  end if;
  if not exists (select 1 from sync_tables s where s.tab = pull_pagina.tab) then
    raise exception 'pull_pagina: tabella sconosciuta: %', tab;
  end if;
  select format_type(a.atttypid, a.atttypmod) into tipo from pg_attribute a
   where a.attrelid = ('public.' || tab)::regclass and a.attname = 'id';
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t) - ''synced_at'' order by t.id), ''[]'')
       from (select * from public.%I where $1 is null or id > cast($1 as %s) order by id limit $2) t', tab, tipo)
    into righe using dopo, n;
  return jsonb_build_object('rows', righe);
end $$;

-- ─── Accesso: chi legge e chi scrive ────────────────────────
-- La stessa matrice dell'app (ROLE_WRITE e roleGuard in core.js), scritta dove
-- non si può aggirare: in locale chi apre i DevTools si assegna il ruolo che
-- vuole, qui no. test/schema-sql.test.js verifica che `role_areas` sia
-- ROLE_WRITE riga per riga.
--
-- Due registri, e le policy si generano da quelli:
--   role_areas   ruolo → aree che può scrivere (ROLE_WRITE)
--   table_areas  tabella → aree che la scrivono
-- `table_areas` non è stata dedotta dalla documentazione ma **misurata**: la
-- suite intera è stata fatta girare registrando, a ogni salvataggio, quali aree
-- roleGuard aveva lasciato passare e quali collezioni erano cambiate. Il verso
-- dell'errore conta: una policy più stretta dell'app rifiuta un invio che
-- l'app considera lecito, e con lui l'intero lotto. Per questo una tabella
-- scritta da più gesti accetta tutte le loro aree — i movimenti nascono sia in
-- magazzino (catalog) sia dalle dichiarazioni di produzione (docs).
--
-- Lettura: chiunque abbia un profilo **attivo**. Un utente sospeso non legge
-- più niente, anche se la sessione è ancora valida.
create table if not exists public.role_areas (
  role text not null, area text not null, primary key (role, area)
);
delete from public.role_areas;
insert into public.role_areas (role, area) values
  ('admin', 'catalog'), ('admin', 'bom'), ('admin', 'docs'), ('admin', 'manage'), ('admin', 'agenda'), ('admin', 'shop'),
  ('acquisti', 'docs'), ('acquisti', 'agenda'),
  ('progettazione', 'catalog'), ('progettazione', 'bom'), ('progettazione', 'agenda'),
  ('officina', 'shop'), ('officina', 'agenda');

create table if not exists public.table_areas (
  tab text not null, area text not null, primary key (tab, area)
);
delete from public.table_areas;
insert into public.table_areas (tab, area)
select t, a from (values
  ('profiles', 'manage'), ('suppliers', 'manage'), ('customers', 'manage'),
  ('work_centers', 'manage'), ('work_center_suppliers', 'manage'),
  ('families', 'manage'), ('sub_families', 'manage'), ('settings', 'manage'),
  ('items', 'catalog'), ('items', 'bom'), ('items', 'manage'),
  ('item_components', 'catalog'), ('item_components', 'bom'), ('item_components', 'manage'),
  ('item_operations', 'catalog'), ('item_operations', 'bom'), ('item_operations', 'manage'),
  ('item_cycle_rows', 'catalog'), ('item_cycle_rows', 'bom'), ('item_cycle_rows', 'manage'),
  ('item_prices', 'catalog'), ('item_prices', 'bom'), ('item_prices', 'manage'),
  ('item_alternatives', 'catalog'), ('item_alternatives', 'bom'), ('item_alternatives', 'manage'),
  ('item_options', 'catalog'), ('item_options', 'bom'), ('item_options', 'manage'),
  ('item_revisions', 'catalog'), ('item_revisions', 'bom'),
  ('attachments', 'catalog'), ('attachment_docs', 'catalog'),
  -- Le richieste d'offerta sono documenti (dalla 0.105.6 solo `docs`): la
  -- registrazione dei prezzi a listino, dall'area `catalog`, scrive articoli
  -- e quotazioni, non la richiesta. Prima la progettazione poteva cambiare
  -- dall'API anche una richiesta già spedita.
  ('rfqs', 'docs'), ('rfq_lines', 'docs'),
  ('orders', 'docs'), ('order_lines', 'docs'), ('order_receipts', 'docs'),
  ('work_orders', 'docs'), ('work_order_lines', 'docs'),
  ('production_plans', 'docs'), ('production_plan_lines', 'docs'), ('production_plan_substitutions', 'docs'),
  ('production_orders', 'docs'), ('production_order_phases', 'docs'), ('production_order_materials', 'docs'),
  ('production_declarations', 'docs'), ('productions', 'docs'),
  ('generated_docs', 'docs'),
  ('stock_movements', 'catalog'), ('stock_movements', 'docs'),
  -- L'officina (area `shop`): ricevimenti sugli ordini e sugli ODL, avanzamento
  -- degli ordini di produzione, giacenze. Un ricevimento riscrive anche il
  -- ricevuto della riga e lo stato del documento, per questo ci sono le testate.
  ('orders', 'shop'), ('order_lines', 'shop'), ('order_receipts', 'shop'),
  ('work_orders', 'shop'), ('work_order_lines', 'shop'),
  ('production_orders', 'shop'), ('production_order_phases', 'shop'), ('production_order_materials', 'shop'),
  ('production_declarations', 'shop'), ('productions', 'shop'), ('stock_movements', 'shop'),
  ('jobs', 'docs'), ('jobs', 'manage'),
  ('reminders', 'agenda'),
  -- Il cestino e le lapidi li scrive chiunque elimini qualcosa, in qualunque area.
  ('trash', 'catalog'), ('trash', 'bom'), ('trash', 'docs'), ('trash', 'manage'), ('trash', 'agenda'), ('trash', 'shop'),
  ('sync_tombstones', 'catalog'), ('sync_tombstones', 'bom'), ('sync_tombstones', 'docs'),
  ('sync_tombstones', 'manage'), ('sync_tombstones', 'agenda'), ('sync_tombstones', 'shop')
) v(t, a);

-- `security definer`: leggono `profiles` senza passare dalle sue policy, che a
-- loro volta le chiamano — altrimenti la lettura del ruolo ricorrerebbe su sé
-- stessa.
create or replace function public.ruolo_attivo() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active is not false
$$;
create or replace function public.puo_scrivere_tabella(t text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.table_areas ta join public.role_areas ra on ra.area = ta.area
                 where ta.tab = t and ra.role = public.ruolo_attivo())
$$;

-- La tabella di una collezione dell'app (SCHEMA in store.js): serve al
-- cestino, che conserva i record con il nome della collezione da cui vengono.
-- test/schema-sql.test.js la confronta con SCHEMA.
create or replace function public.tabella_di_coll(c text) returns text
language sql immutable set search_path = public as $$
  select t from (values
    ('items', 'items'), ('revisions', 'item_revisions'), ('movements', 'stock_movements'),
    ('receipts', 'order_receipts'), ('attachments', 'attachments'), ('attachmentDocs', 'attachment_docs'),
    ('generatedDocs', 'generated_docs'), ('productions', 'productions'), ('suppliers', 'suppliers'), ('customers', 'customers'),
    ('workCenters', 'work_centers'), ('families', 'families'), ('rfqs', 'rfqs'), ('orders', 'orders'),
    ('workOrders', 'work_orders'), ('plans', 'production_plans'), ('prodOrders', 'production_orders'),
    ('prodDecls', 'production_declarations'), ('jobs', 'jobs'), ('reminders', 'reminders'),
    ('trash', 'trash'), ('users', 'profiles')
  ) v(k, t) where k = c
$$;

-- Il proprio profilo si può aggiornare (nome, colore), ma non il proprio ruolo
-- né il proprio stato: quello resta della gestione utenti.
--
-- Vale per chi passa dall'app o dall'API (dalla 0.105.3): dal SQL Editor
-- l'amministratore del progetto deve poter rimettere a posto un profilo, e lì
-- auth.uid() è nullo. Anche l'**email** è della gestione utenti: il link per
-- reimpostare la password parte dall'utente di Supabase Auth, ma un'email del
-- profilo cambiata a mano farebbe credere all'app di parlare con un altro.
create or replace function public.profiles_guardia() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') and not public.puo_scrivere_tabella('profiles')
     and (new.role is distinct from old.role or new.active is distinct from old.active or new.id <> old.id
          or new.email is distinct from old.email) then
    raise exception 'solo la gestione utenti cambia ruolo, stato ed email di un profilo';
  end if;
  -- L'ultimo amministratore attivo non si declassa e non si sospende (dalla
  -- 0.105.0): l'app lo impedisce già, qui vale anche per chi passa dall'API.
  if old.role = 'admin' and old.active is not false
     and (new.role is distinct from 'admin' or new.active is false)
     and not exists (select 1 from public.profiles p
                      where p.id <> old.id and p.role = 'admin' and p.active is not false) then
    raise exception 'deve restare almeno un amministratore attivo';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guardia on public.profiles;
create trigger profiles_guardia before update on public.profiles for each row execute function public.profiles_guardia();
-- E non si elimina (dalla 0.105.4), da nessuna parte: né dall'API né
-- eliminando il suo utente nel pannello di Supabase, che porta via il profilo
-- con sé. Senza amministratori l'archivio non ha più chi gestisce gli utenti.
create or replace function public.profiles_ultimo_admin() returns trigger language plpgsql as $$
begin
  if old.role = 'admin' and old.active is not false
     and not exists (select 1 from public.profiles p
                      where p.id <> old.id and p.role = 'admin' and p.active is not false) then
    raise exception 'deve restare almeno un amministratore attivo';
  end if;
  return old;
end $$;
drop trigger if exists profiles_ultimo_admin on public.profiles;
create trigger profiles_ultimo_admin before delete on public.profiles for each row execute function public.profiles_ultimo_admin();

-- L'officina sui documenti (dalla 0.105.4). Le policy dicono quali tabelle un
-- ruolo scrive, non quali colonne: l'officina scrive gli ordini perché un
-- ricevimento ne cambia lo stato, e passando dall'API poteva cambiarne anche
-- fornitore, righe e prezzi, o eliminarli. Qui, per chi ha `shop` ma non
-- `docs`:
--  - una modifica tocca solo le colonne del primo argomento (lo stato), più
--    quelle di servizio; se ne cambia altre la riga si **respinge** (`null`):
--    push_changes la conta fra le respinte e il mittente riceve la versione
--    del server, invece di bloccare l'intero lotto con un errore;
--  - una riga nuova passa solo se viene da un ordine di produzione (`odp_id`,
--    secondo argomento): è l'ODL che l'officina genera dalla fase esterna;
--  - un'eliminazione si ferma con un errore: saltarla lascerebbe la lapide, e
--    gli altri PC cancellerebbero una riga che il server ha ancora.
-- Dal SQL Editor (auth.uid() nullo, current_user postgres) non vale.
create or replace function public.officina_guardia() returns trigger language plpgsql as $$
declare
  -- created_by: con ON CONFLICT la riga proposta passa prima dal trigger
  -- d'inserimento, che la attribuisce a chi invia; sync_stamp, dopo questo,
  -- rimette quello di prima.
  liberi text[] := array['updated_at', 'updated_by', 'created_by', 'synced_at', 'pos'] || string_to_array(coalesce(tg_argv[0], ''), ',');
  c text;
  esiste boolean;
begin
  if current_user not in ('authenticated', 'anon')
     or exists (select 1 from public.role_areas where role = public.ruolo_attivo() and area = 'docs') then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'il ruolo % non elimina %', coalesce(public.ruolo_attivo(), '(nessun profilo attivo)'), tg_table_name
      using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    -- Con ON CONFLICT il trigger d'inserimento scatta anche per una riga che
    -- c'è già: quella la giudica il trigger di modifica.
    execute format('select exists (select 1 from public.%I where id = $1)', tg_table_name) into esiste using new.id;
    if esiste then return new; end if;
    if tg_argv[1] = 'odp' and (to_jsonb(new)->>'odp_id') is not null then return new; end if;
    return null;
  end if;
  for c in select k from jsonb_object_keys(to_jsonb(new)) k loop
    if not (c = any(liberi)) and (to_jsonb(new)->c) is distinct from (to_jsonb(old)->c) then
      return null;
    end if;
  end loop;
  return new;
end $$;
do $$
declare r record;
begin
  for r in select * from (values
    ('orders', 'status', ''), ('order_lines', '', ''),
    ('work_orders', 'status', 'odp'), ('work_order_lines', '', 'odp'),
    ('production_orders', 'status', ''), ('production_order_phases', '', ''), ('production_order_materials', '', '')
  ) v(tab, campi, nuovi) loop
    execute format('drop trigger if exists officina_guardia on public.%I', r.tab);
    execute format('create trigger officina_guardia before insert or update or delete on public.%I
                    for each row execute function public.officina_guardia(%L, %L)', r.tab, r.campi, r.nuovi);
  end loop;
end $$;

-- RLS attiva ovunque: in Supabase una tabella senza RLS è leggibile da chiunque
-- abbia la chiave pubblica. Le funzioni sono `security invoker`: push_changes()
-- e pull_changes() rispettano queste policy senza bisogno di saperle.
do $$
declare t text;
begin
  foreach t in array (select array_agg(tab) from public.sync_tables) || array['settings', 'sync_tombstones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists provvisoria_autenticati on public.%I', t);
    execute format('drop policy if exists lettura on public.%I', t);
    execute format('drop policy if exists scrittura on public.%I', t);
    -- `(select …)`: Postgres calcola la funzione una volta per interrogazione
    -- invece che una per riga. Su un archivio grande la differenza è fra un
    -- download che sta nei limiti di tempo di Supabase e uno che non ci sta.
    execute format('create policy lettura on public.%I for select to authenticated using ((select public.ruolo_attivo()) is not null)', t);
    execute format('create policy scrittura on public.%I for all to authenticated using ((select public.puo_scrivere_tabella(%L))) with check ((select public.puo_scrivere_tabella(%L)))', t, t, t);
  end loop;
  -- Le lapidi, riga per riga (dalla 0.105.3): ne scrive una solo chi può
  -- scrivere la tabella a cui si riferisce. Con la regola generale l'officina
  -- poteva, dall'API, far sparire un articolo dagli archivi di tutti.
  drop policy if exists scrittura on public.sync_tombstones;
  create policy scrittura on public.sync_tombstones for all to authenticated
    using (public.puo_scrivere_tabella(tab))
    with check (public.puo_scrivere_tabella(tab) and deleted_at <= clock_timestamp() + interval '5 minutes');
  -- Il cestino, riga per riga (dalla 0.105.4): una voce la scrive solo chi può
  -- scrivere la tabella del record che contiene. Con la regola generale
  -- chiunque poteva, dall'API, mettere nel cestino un articolo inventato, e
  -- l'amministratore che lo ripristinava lo pubblicava a nome suo. Togliere
  -- una voce (svuotare il cestino) resta di chi scrive il cestino: si perde un
  -- annulla, non un dato. Una collezione sconosciuta segue la regola generale,
  -- per non fermare l'invio di un'app più nuova dello schema.
  drop policy if exists scrittura on public.trash;
  drop policy if exists inserimento on public.trash;
  drop policy if exists modifica on public.trash;
  drop policy if exists eliminazione on public.trash;
  create policy inserimento on public.trash for insert to authenticated
    with check (public.puo_scrivere_tabella(coalesce(public.tabella_di_coll(coll), 'trash')));
  create policy modifica on public.trash for update to authenticated
    using (public.puo_scrivere_tabella(coalesce(public.tabella_di_coll(coll), 'trash')))
    with check (public.puo_scrivere_tabella(coalesce(public.tabella_di_coll(coll), 'trash')));
  create policy eliminazione on public.trash for delete to authenticated
    using ((select public.puo_scrivere_tabella('trash')));
  -- Il proprio profilo si legge sempre, anche sospeso (dalla 0.105.3): è così
  -- che la sospensione arriva al PC che la subisce, con il pull, e l'app esce.
  -- Prima un sospeso non leggeva più niente, nemmeno quella, e restava dentro.
  drop policy if exists proprio_profilo on public.profiles;
  create policy proprio_profilo on public.profiles for select to authenticated using (id = (select auth.uid()));
  -- Il proprio profilo, in aggiunta: vedi profiles_guardia.
  drop policy if exists se_stesso on public.profiles;
  create policy se_stesso on public.profiles for update to authenticated
    using (id = auth.uid() and (select public.ruolo_attivo()) is not null) with check (id = auth.uid());
  -- I registri si leggono, non si scrivono.
  foreach t in array array['sync_tables', 'role_areas', 'table_areas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists provvisoria_autenticati on public.%I', t);
    execute format('drop policy if exists lettura on public.%I', t);
    execute format('create policy lettura on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;
grant execute on function public.push_changes(jsonb) to authenticated;
grant execute on function public.pull_changes(timestamptz) to authenticated;
grant execute on function public.pull_pagina(text, text, int) to authenticated;
grant execute on function public.pull_istante() to authenticated;

-- ─── Profili: nascono da Supabase Auth (dalla 0.103.0) ──────
-- Un collega entra in Bomtrack perché l'amministratore lo **invita** dal
-- pannello di Supabase (Authentication → Users → Invite user): l'invito crea
-- la riga in auth.users, e questo trigger le affianca il profilo. Nasce
-- **sospeso**, come lettore: finché un amministratore non lo attiva da
-- Gestione → Utenti non legge niente. Così anche una registrazione lasciata
-- aperta per sbaglio nel pannello di Supabase non apre l'archivio a nessuno.
--
-- L'unica eccezione è il primo: chi arriva quando non c'è ancora **nessun**
-- profilo diventa amministratore. È l'utente che si crea a mano nel pannello
-- prima di tutti gli altri, ed è lui a caricare l'archivio. Fino alla 0.105.3
-- bastava che mancasse un amministratore attivo: un archivio rimasto senza
-- (eliminato dal pannello) faceva amministratore il primo che si registrava.
create or replace function public.profilo_crea(uid uuid, mail text, nome text)
returns void language plpgsql security definer set search_path = public as $$
declare primo boolean;
begin
  primo := not exists (select 1 from public.profiles);
  insert into public.profiles (id, email, name, role, active, created_at, updated_at)
    values (uid, mail, coalesce(nullif(nome, ''), split_part(coalesce(mail, ''), '@', 1)),
            case when primo then 'admin' else 'lettore' end, primo, now(), now())
    on conflict (id) do nothing;
end $$;
revoke execute on function public.profilo_crea(uuid, text, text) from public, anon, authenticated;

create or replace function public.profilo_da_utente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.profilo_crea(new.id, new.email, new.raw_user_meta_data->>'name');
  return new;
end $$;
drop trigger if exists profilo_da_utente on auth.users;
create trigger profilo_da_utente after insert on auth.users
  for each row execute function public.profilo_da_utente();

-- Gli utenti creati prima di questo schema: stessa regola, nell'ordine in cui
-- sono nati. Rieseguire il file non tocca chi un profilo ce l'ha già.
select public.profilo_crea(a.id, a.email, a.raw_user_meta_data->>'name')
  from (select * from auth.users a
         where not exists (select 1 from public.profiles p where p.id = a.id)
         order by a.created_at nulls last, a.id) a;

-- ─── Chi sono e che cosa c'è (dalla 0.103.0) ────────────────
-- La prima domanda che l'app fa dopo l'accesso, prima di scaricare qualunque
-- cosa: il proprio profilo (anche sospeso: l'app deve poter dire «chiedi
-- all'amministratore di attivarti» invece di un generico errore) e se
-- l'archivio è ancora vuoto, cioè se tocca a questo PC caricarlo.
-- `security definer` perché un profilo sospeso non legge niente per policy;
-- restituisce solo la propria riga e un sì/no, nient'altro.
create or replace function public.archivio_stato() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'profilo', (select jsonb_build_object('id', p.id, 'email', p.email, 'name', p.name, 'role', p.role, 'active', p.active)
                  from public.profiles p where p.id = auth.uid()),
    'vuoto', not (exists (select 1 from public.items) or exists (select 1 from public.suppliers)
                  or exists (select 1 from public.orders) or exists (select 1 from public.rfqs)
                  or exists (select 1 from public.families)),
    'ora', public.pull_istante())
$$;
grant execute on function public.archivio_stato() to authenticated;

-- ─── Numeri e codici si prendono dal server (dalla 0.104.0) ──
-- Con l'archivio condiviso un PC senza collegamento consulta soltanto: chi
-- crea un documento o un articolo è per forza in linea, e il numero o il
-- codice lo chiede qui prima di usarlo. Così due colleghi che creano insieme
-- un ordine non si trovano mai lo stesso ODA-2026-014, e la serie non ha buchi.
--
-- `numeri_impegnati`: i numeri dati e non ancora visti nella tabella dei
-- documenti (il documento è in viaggio). Il prossimo numero è il più alto fra
-- documenti, impegni e quello che il PC ha in locale (`minimo`, i documenti
-- ancora in coda), più uno: eliminare l'ultimo documento libera il suo numero.
-- `numeri_liberi`: i numeri impegnati e poi restituiti perché il documento non
-- è nato, quando nel frattempo un collega ne aveva preso uno più alto. Il
-- prossimo che chiede li riprende per primi: è così che non restano buchi.
-- Un impegno mai chiuso (un PC spento a metà) scade dopo sette giorni.
drop function if exists public.riserva_numeri(text, int, int);
drop table if exists public.contatori;   -- la prima stesura della 0.104.0
create table if not exists public.numeri_impegnati (
  serie text not null, numero int not null, utente uuid, quando timestamptz not null default now(),
  primary key (serie, numero)
);
create table if not exists public.numeri_liberi (
  serie text not null, numero int not null, primary key (serie, numero)
);
-- `codici_impegnati`: i codici articolo appena presi, nell'ora in cui
-- l'articolo che li porta potrebbe non essere ancora arrivato in `items`.
-- Un codice è libero se nessun articolo lo porta e nessun altro utente l'ha
-- impegnato nell'ultima ora. Il confronto ignora maiuscole e spazi, come
-- itemCodeKey() nell'app.
create table if not exists public.codici_impegnati (
  chiave text primary key,
  codice text not null,
  utente uuid not null,
  quando timestamptz not null default now()
);
-- Nessuna policy: le tabelle si toccano solo dalle funzioni qui sotto.
alter table public.numeri_impegnati enable row level security;
alter table public.numeri_liberi enable row level security;
alter table public.codici_impegnati enable row level security;

-- La tabella e la colonna di una serie «SIGLA-ANNO-», controllando che chi
-- chiama possa scriverci (un lettore non prenota numeri). Ritorna i numeri già
-- usati dai documenti della serie.
create or replace function public.numeri_serie_usati(prefisso text) returns setof int
language plpgsql stable security definer set search_path = public as $$
declare tab text; col text := 'number';
begin
  tab := case split_part(prefisso, '-', 1)
    when 'RFQ' then 'rfqs' when 'ODA' then 'orders' when 'ODL' then 'work_orders'
    when 'ODP' then 'production_orders' when 'FAB' then 'production_plans' when 'COM' then 'jobs'
    when 'MT' then 'item_revisions' end;
  if tab = 'item_revisions' then col := 'eco_number'; end if;   -- le modifiche tecniche MT-…
  if tab is null or prefisso !~ '^[A-Z]{2,3}-[0-9]{4}-$' then
    raise exception 'serie non valida: %', prefisso;
  end if;
  if not public.puo_scrivere_tabella(tab) then
    raise exception 'il ruolo non scrive %', tab using errcode = '42501';
  end if;
  return query execute format('select substr(%I, %s)::int from public.%I where %I ~ %L',
    col, length(prefisso) + 1, tab, col, '^' || prefisso || '[0-9]{1,9}$');
end $$;
revoke execute on function public.numeri_serie_usati(text) from public, anon, authenticated;

-- Riserva `quanti` numeri della serie e li restituisce in ordine: prima quelli
-- restituiti da altri (i buchi), poi i successivi al più alto. Una richiesta
-- alla volta per serie (il lucchetto), così due colleghi non escono mai con lo
-- stesso numero.
create or replace function public.riserva_numeri(prefisso text, quanti int default 1, minimo int default 0)
returns int[] language plpgsql security definer set search_path = public as $$
declare usati int[]; alto int; presi int[] := '{}'; n int;
begin
  if quanti is null or quanti < 1 or quanti > 500 then raise exception 'quantità non valida: %', quanti; end if;
  -- Prima il lucchetto, poi i numeri usati (dalla 0.105.6). Letti prima, un
  -- documento arrivato mentre si aspettava il lucchetto non stava né fra gli
  -- usati né fra gli impegni (il suo invio li aveva chiusi), e il suo numero
  -- si dava di nuovo. L'invio che chiude un impegno prende lo stesso
  -- lucchetto (numeri_chiudi_impegno).
  perform pg_advisory_xact_lock(hashtext('bomtrack-numeri:' || prefisso));
  usati := array(select public.numeri_serie_usati(prefisso));
  -- Gli impegni chiusi (il documento è arrivato) o scaduti non contano più.
  delete from public.numeri_impegnati
   where serie = prefisso and (numero = any(usati) or quando < now() - interval '7 days');
  alto := greatest(coalesce((select max(x) from unnest(usati) x), 0),
                   coalesce((select max(numero) from public.numeri_impegnati where serie = prefisso), 0),
                   coalesce(minimo, 0));
  -- Un numero restituito ormai usato, o più alto di tutto il resto, non è un buco.
  delete from public.numeri_liberi
   where serie = prefisso and (numero = any(usati) or numero > alto
         or numero in (select numero from public.numeri_impegnati where serie = prefisso));
  for n in select numero from public.numeri_liberi where serie = prefisso order by numero limit quanti loop
    delete from public.numeri_liberi where serie = prefisso and numero = n;
    presi := presi || n;
  end loop;
  while coalesce(array_length(presi, 1), 0) < quanti loop
    alto := alto + 1;
    presi := presi || alto;
  end loop;
  insert into public.numeri_impegnati (serie, numero, utente, quando)
    select prefisso, x, auth.uid(), now() from unnest(presi) x;
  return presi;
end $$;
grant execute on function public.riserva_numeri(text, int, int) to authenticated;

-- Restituisce i numeri impegnati e non usati (il documento alla fine non è
-- nato): tornano disponibili, e il prossimo che chiede li riprende.
drop function if exists public.libera_numeri(text, int[]);
create or replace function public.libera_numeri(prefisso text, numeri int[])
returns int language plpgsql security definer set search_path = public as $$
declare usati int[]; n int;
begin
  perform pg_advisory_xact_lock(hashtext('bomtrack-numeri:' || prefisso));   -- prima, come in riserva_numeri
  usati := array(select public.numeri_serie_usati(prefisso));
  with tolti as (
    delete from public.numeri_impegnati
     where serie = prefisso and numero = any(coalesce(numeri, '{}')) and utente is not distinct from auth.uid()
    returning numero)
  insert into public.numeri_liberi (serie, numero)
    select prefisso, numero from tolti where not (numero = any(usati))
    on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.libera_numeri(text, int[]) to authenticated;

-- Il documento è arrivato: il suo numero non è più un impegno ma un fatto.
-- Senza chiuderlo qui, eliminare l'ultimo documento non libererebbe il suo
-- numero, perché l'impegno lo terrebbe occupato fino alla scadenza.
create or replace function public.numeri_chiudi_impegno() returns trigger
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  v := to_jsonb(new)->>(case when TG_TABLE_NAME = 'item_revisions' then 'eco_number' else 'number' end);
  if v ~ '^[A-Z]{2,3}-[0-9]{4}-[0-9]{1,9}$' then
    -- Il lucchetto della serie (dalla 0.105.6): una riserva che sta leggendo
    -- usati e impegni aspetta che questo invio si chiuda, e vede il documento.
    perform pg_advisory_xact_lock(hashtext('bomtrack-numeri:' || substring(v from '^([A-Z]{2,3}-[0-9]{4}-)')));
    delete from public.numeri_impegnati
     where serie = substring(v from '^([A-Z]{2,3}-[0-9]{4}-)') and numero = substring(v from '([0-9]+)$')::int;
  end if;
  return null;
end $$;
do $$
declare t text;
begin
  foreach t in array array['rfqs', 'orders', 'work_orders', 'production_orders', 'production_plans', 'jobs', 'item_revisions'] loop
    execute format('drop trigger if exists numeri_chiudi_impegno on public.%I', t);
    execute format('create trigger numeri_chiudi_impegno after insert or update on public.%I for each row execute function public.numeri_chiudi_impegno()', t);
  end loop;
end $$;

-- Un numero, un documento (dalla 0.105.6): la rete sotto tutte le strade per
-- cui un doppione poteva passare dal client (un ripristino dal cestino, una
-- rinumerazione, due invii contemporanei). Prima il server teneva tutti e
-- due, e il problema usciva su un ordine stampato. Solo i numeri della serie
-- (SIGLA-ANNO-N): un numero scritto a mano in un'altra forma non c'entra.
-- Un archivio che ha già dei doppioni non si blocca: l'indice di quella
-- tabella non si crea, lo si dice, e il controllo di push_changes vale
-- comunque per i numeri nuovi. Rieseguire il file dopo averli corretti lo crea.
-- Per i codici articolo vale la nota A6 sopra.
do $$
declare t text;
begin
  foreach t in array array['rfqs', 'orders', 'work_orders', 'production_orders', 'production_plans', 'jobs', 'item_revisions'] loop
    begin
      execute format('create unique index if not exists %I on public.%I (%I) where %I ~ %L',
        t || '_numero_unico', t, public.colonna_numero(t), public.colonna_numero(t), '^[A-Z]{2,3}-[0-9]{4}-[0-9]+$');
    exception when unique_violation then
      raise warning 'Bomtrack: in % ci sono numeri doppi, e l''indice unico % non si crea finché non si correggono',
        t, t || '_numero_unico';
    end;
  end loop;
end $$;

-- Impegna i codici articolo di `codici` ([{"codice": …, "item": id facoltativo}])
-- e restituisce quelli già presi: da un articolo diverso da `item`, o da un
-- altro utente nell'ultima ora. Gli altri restano impegnati a nome di chi chiama.
-- Per quale articolo (dalla 0.105.3): lo stesso utente che reimpegnava un
-- codice già suo passava sempre, anche per un articolo diverso. Due PC con lo
-- stesso accesso, o un doppio clic, davano lo stesso codice a due articoli.
alter table public.codici_impegnati add column if not exists item text;
create or replace function public.impegna_codici(codici jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare x jsonb; k text; preso boolean; presi jsonb := '[]'::jsonb;
begin
  if not public.puo_scrivere_tabella('items') then
    raise exception 'il ruolo non scrive items' using errcode = '42501';
  end if;
  delete from public.codici_impegnati where quando < now() - interval '1 hour';
  for x in select * from jsonb_array_elements(coalesce(codici, '[]'::jsonb)) loop
    k := lower(btrim(coalesce(x->>'codice', '')));
    continue when k = '';
    -- Un impegno per un articolo che sul server porta ormai un altro codice
    -- (dalla 0.112.2) non vale più: l'articolo è stato rinominato, e il codice
    -- vecchio restava bloccato per un'ora a tutti, anche a chi l'aveva lasciato.
    delete from public.codici_impegnati c
     where c.chiave = k and c.item is not null
       and exists (select 1 from public.items i
                    where i.id::text = c.item and lower(btrim(i.code)) <> k);
    preso := exists (select 1 from public.items i
                      where lower(btrim(i.code)) = k and (x->>'item' is null or i.id::text <> x->>'item'));
    if not preso then
      insert into public.codici_impegnati as c (chiave, codice, utente, quando, item)
        values (k, btrim(x->>'codice'), auth.uid(), now(), x->>'item')
        on conflict (chiave) do update set quando = now()
          where c.utente = excluded.utente and c.item is not distinct from excluded.item;
      preso := not found;
    end if;
    if preso then presi := presi || to_jsonb(x->>'codice'); end if;
  end loop;
  return presi;
end $$;
grant execute on function public.impegna_codici(jsonb) to authenticated;

-- Restituisce codici impegnati e non usati: un collega può prenderli subito,
-- invece di saltarli e lasciare un buco nella codifica.
drop function if exists public.libera_codici(jsonb);
create or replace function public.libera_codici(codici jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.codici_impegnati
   where utente = auth.uid()
     and chiave in (select lower(btrim(v)) from jsonb_array_elements_text(coalesce(codici, '[]'::jsonb)) v);
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.libera_codici(jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════════
--  Il tipo di un articolo è uno dei sei (dalla 0.105.3)
-- ═══════════════════════════════════════════════════════════
-- L'app lo stampa nelle schermate di tutti: un valore inventato, scritto
-- dall'API da un collega, arrivava nell'HTML degli altri. L'app ora lo rende
-- innocuo anche da sé; qui non entra più. `not valid`: le righe che ci sono
-- non si ricontrollano, quelle nuove sì.
alter table public.items drop constraint if exists items_tipo_noto;
alter table public.items add constraint items_tipo_noto
  check (type is null or type in ('macchina', 'gruppo', 'sottogruppo', 'parte', 'materiale', 'acquistato')) not valid;

-- ═══════════════════════════════════════════════════════════
--  Pulizia del cestino e delle lapidi (dalla 0.106.0)
-- ═══════════════════════════════════════════════════════════
-- Fino alla 0.105.9 il cestino lo potava ogni PC all'apertura, con il suo
-- orologio: un PC con la data avanti svuotava il cestino di tutti prima del
-- tempo, e un ruolo che non scrive il cestino si vedeva rifiutare l'invio a
-- ogni apertura. Ora lo fa il server, con la sua ora: le voci oltre i 30
-- giorni (TRASH_DAYS in store.js) se ne vanno lasciando una lapide, così
-- spariscono anche dai PC.
--
-- Le lapidi oltre i 90 giorni si tolgono: senza, crescerebbero per sempre.
-- Un PC rimasto fermo più a lungo non le ha ricevute, e pull_changes() gli
-- dice di riscaricare l'archivio intero invece di tenersi i record cancellati.
-- Conta anche synced_at, l'ora in cui la lapide è stata data ai PC: una
-- lapide ripassata di recente non si toglie, e il taglio resta sempre vecchio
-- di 90 giorni (un PC appena riscaricato non riscarica di nuovo).
--
-- La chiama l'app dopo un giro riuscito; il server la esegue al più una volta
-- ogni 20 ore, chiunque la chiami. Niente pg_cron: andrebbe attivato a mano nel
-- progetto, e un archivio che nessuno apre non ha niente che scada di urgente.
create or replace function public.pulizia_archivio() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  stato record;
  voci int := 0;
  lapidi int := 0;
  ultima timestamptz;
  ora timestamptz := clock_timestamp();
begin
  if public.ruolo_attivo() is null and auth.uid() is not null then
    raise exception 'pulizia_archivio: nessun profilo attivo';
  end if;
  select * into stato from public.sync_stato where id = 1 for update skip locked;
  if not found or (stato.pulito_il is not null and stato.pulito_il > ora - interval '20 hours') then
    return jsonb_build_object('fatta', false);
  end if;
  with via as (
    delete from public.trash where deleted_at < ora - interval '30 days' returning id
  )
  insert into public.sync_tombstones (tab, id, deleted_by)
    select 'trash', via.id::text, null from via
    on conflict (tab, id) do update set deleted_at = clock_timestamp(), synced_at = clock_timestamp();
  get diagnostics voci = row_count;
  with via as (
    delete from public.sync_tombstones
     where deleted_at < ora - interval '90 days' and synced_at < ora - interval '90 days'
     returning synced_at
  )
  select count(*), max(synced_at) into lapidi, ultima from via;
  update public.sync_stato
     set pulito_il = ora,
         lapidi_dal = case when ultima is null then lapidi_dal else greatest(coalesce(lapidi_dal, ultima), ultima) end
   where id = 1;
  return jsonb_build_object('fatta', true, 'cestino', voci, 'lapidi', lapidi);
end $$;
revoke execute on function public.pulizia_archivio() from public, anon;
grant execute on function public.pulizia_archivio() to authenticated;
