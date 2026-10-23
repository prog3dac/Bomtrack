# Bomtrack — Sostenibilità del piano gratuito Supabase

Compagno di [cloud-schema.md](cloud-schema.md): quello dice **come** i dati diventano tabelle,
questo dice **quanto occupano** e **quando il piano gratuito smette di bastare**.

Stato (0.107.0): l'archivio condiviso esiste dalla 0.103.0, ma le cifre qui sotto sono ancora le
stime fatte sullo schema prima che ci fosse, non misure su un database vivo — il modello di calcolo è in fondo, riproducibile, così che il giorno in cui il
backend c'è si possa confrontare la previsione con la realtà invece di rifarla da capo.

> I limiti del piano gratuito cambiano senza preavviso. Quelli qui sotto valgono a **settembre 2026**
> e vanno riletti sul listino prima di prendere una decisione, non copiati da questo file.

## I limiti, e quale conta davvero

| Risorsa | Piano gratuito | Rilevanza per Bomtrack |
|---|---|---|
| Spazio database | **500 MB** | Il vincolo di cui si parla sempre. Non è il primo che si incontra. |
| Egress (banda) | **5 GB/mese** | **Il vincolo vero**, se la sincronizzazione è fatta male. |
| Storage file | 1 GB | Oggi irrilevante: gli allegati stanno in una cartella fuori dall'app e il database ne porta solo il percorso. Vedi «Il giorno in cui arrivano i disegni». |
| Realtime | 200 connessioni, 2M messaggi/mese | Abbondante per una squadra piccola. |
| Utenti attivi | 50.000/mese | Fuori scala rispetto al problema. |
| Progetti gratuiti | 2 | Basta per produzione + collaudo, e non un terzo. |
| Sospensione | dopo **7 giorni** di inattività | Rischio operativo reale. Vedi sotto. |
| Backup automatici | **nessuno** | Rischio operativo reale. Vedi sotto. |

### Il budget non è 500 MB

Un progetto Supabase appena creato occupa già **~50–70 MB**: cataloghi di sistema, estensioni,
gli schemi `auth`, `storage`, `realtime`. Sono spesi prima della prima riga di Bomtrack.

Il budget effettivo per i dati dell'app è quindi **~430 MB**. E il limite non è un avviso: superato
lo spazio, il progetto passa in **sola lettura** — cioè l'app smette di salvare, che è esattamente
il difetto che `Store.commit()` classifica oggi come `kind: 'quota'` su localStorage. Il fallimento
è già gestito; è la capienza che va prevista.

## Occupazione stimata

Tre scenari, calcolati tabella per tabella sul modello in fondo (heap Postgres + indici).

| Scenario | Dati + indici | Con bloat/WAL (+35%) | + baseline progetto | % di 500 MB |
|---|---|---|---|---|
| **A** — officina piccola, 3 anni | 47 MB | 63 MB | **~123 MB** | **25%** |
| **B** — uso intenso, 5 anni | 414 MB | 559 MB | **~619 MB** | **124% — sfonda** |
| **C** — grande, 5+ anni | 1.954 MB | 2.638 MB | **~2,7 GB** | 540% |

**Scenario A** — 5.000 articoli, 20k componenti di distinta, 12k quotazioni, 15k righe d'ordine,
30k movimenti di magazzino (~40 al giorno), 2.500 revisioni, 600 commesse.

**Scenario B** — 20.000 articoli, 100k componenti, 80k quotazioni, 140k righe d'ordine,
400k movimenti (~300 al giorno), 30.000 revisioni.

**Scenario C** — 60.000 articoli, 600k righe d'ordine, 2 milioni di movimenti.

### Il punto di rottura

**Circa 7× lo scenario A**: grosso modo **35.000 articoli, 250k righe di documento, 200k movimenti,
20k revisioni**. Per il carico che l'app serve oggi il piano gratuito regge con margine ampio e per
anni. Ci si arriva **col tempo, non con i dati**: è la distinzione che decide tutto il resto di
questo documento.

### Costo per riga

Byte per riga, dati **più** indici. Serve per rifare il conto su numeri diversi senza rileggere il
modello.

| Tabella | B/riga | Tabella | B/riga |
|---|---:|---|---:|
| `orders` | 856 | `order_lines` | 428 |
| `rfqs` | 764 | `rfq_lines` | 420 |
| `items` | 696 | `item_cycle_rows` | 376 |
| `item_prices` | 528 | `item_operations` | 316 |
| `jobs` | 512 | `stock_movements` | 308 |
| `production_plans` | 452 | `item_components` | 284 |

Da notare, perché è controintuitivo: una riga di `item_components` porta **~60 byte di dato utile**
(tre uuid e due numeri) e ne costa 284. Il resto è intestazione di riga, allineamento, colonne di
audit e indici. In una tabella figlia stretta **l'impalcatura pesa più del contenuto**, ed è il
motivo per cui contare le righe a mente sottostima sempre.

## Cosa cresce davvero

Due tabelle decidono l'esito. Nessuna delle due cresce col catalogo: **crescono col tempo**.

**1. `stock_movements`** — 117 MB nello scenario B, 587 MB in C. Append-only di fatto, ~300 righe al
giorno in un magazzino attivo. È l'unica tabella che da sola può chiudere il progetto, e lo farebbe
senza che il catalogo sia cresciuto di un articolo.

**2. `item_revisions.snapshot` (jsonb)** — 83 MB nello scenario B. Qui la stima è **volutamente
pessimistica**: sopra i ~2 KB per riga scatta TOAST con compressione, e su JSON a chiavi ripetute
rende 3–4×, quindi realisticamente ~30 MB. Sotto quella soglia (snapshot piccoli, scenario A) non
comprime niente e la revisione paga tutto. È una soglia, non una proporzione: **una revisione
piccola costa più di quanto sembri, una grande meno**.

## Perché limare lo schema non serve

Vale la pena dirlo con un numero, perché è l'ottimizzazione che viene in mente per prima ed è quella
sbagliata.

Variante «lean» sulle tre tabelle a sostituzione d'insieme (`item_components`, `item_operations`,
`item_cycle_rows`): togliere le colonne di audit — che lì sono comunque prive di senso, visto che
l'insieme viene rimpiazzato intero a ogni salvataggio e `created_by` per riga non risponde a nessuna
domanda — e sostituire l'id sintetico `itemId#array#pos` con `PRIMARY KEY (item_id, pos)`,
risparmiando anche l'indice unico da 44 byte.

Risparmio: **~37% su quelle righe**, cioè **19 MB su 414** nello scenario B. Il **4,6%**.

Va fatto lo stesso, perché è igiene e perché quell'id costruito non è un'identità (lo dice già
`cloud-schema.md`: non è stabile nel tempo e non pretende di esserlo, quindi non merita un indice
unico). Ma non è una strategia di capienza, e presentarlo come tale farebbe rimandare quella vera.

**La strategia è la retention.** Un rollup annuale dei movimenti — una riga di saldo d'apertura per
articolo, poi cancellazione delle righe più vecchie di N anni — tiene `stock_movements` **piatta**
invece che monotòna. Ed è compatibile con la regola che quel documento fissa («la giacenza non è una
colonna»): non si introduce un campo aggiornato a parte, cambia solo **cosa si somma**. Il saldo
d'apertura è un movimento come gli altri, e l'esistente resta `Σ received + Σ qty`.

## Il vincolo che stringe prima dello spazio

**L'egress.** Un pull completo dello scenario A è ~46 MB di JSON — PostgREST ripete i nomi di
colonna a ogni riga e scrive gli uuid come 36 caratteri invece di 16 byte — che compressi sul filo
diventano ~5 MB.

| Comportamento | Consumo/mese (5 utenti) | Su 5 GB |
|---|---|---|
| Pull completo 1×/giorno | ~550 MB | 11% — bene |
| Pull completo a ogni ricarica di scheda (5/giorno) | ~2,75 GB | 55% — stretto |
| Polling **completo** ogni 25 s | decine di GB **al giorno** | impossibile |
| Polling **incrementale** (`updated_at > ultimo`) ogni 25 s | ~0,95 GB | 19% — sostenibile |

Il punto 3 del percorso in `cloud-schema.md` (polling ogni 20–30 s) è sostenibile **solo
incrementale**. Non è una raffinatezza da rimandare: è la differenza fra funzionare e non
funzionare, e va scritta lì il primo giorno.

Un'osservazione che conviene non confondere: a quel punto **Realtime consuma meno, non di più**.
Cinque utenti stanno larghi nelle 200 connessioni e nei 2M messaggi/mese, e un websocket aperto non
paga intestazioni HTTP 5.760 volte al giorno. L'argomento contro Realtime in `cloud-schema.md` è di
**complessità** — riconnessione, rinnovo del token, ordinamento degli eventi — ed è valido. Ma non è
un argomento di consumo, e tenerli separati evita di difendere la scelta giusta con la ragione
sbagliata.

## I due rischi che non riguardano lo spazio

**Sospensione dopo 7 giorni di inattività.** Un'officina italiana chiude due settimane ad agosto. Al
rientro il progetto è sospeso e va ripristinato a mano dalla dashboard, con l'app che nel frattempo
non risponde. Serve un ping schedulato — una GitHub Action giornaliera su un endpoint REST è
sufficiente. Va predisposto **prima**, non scoperto il 25 agosto. *Fatto nella 0.107.0:*
`.github/workflows/supabase-veglia.yml`, attivo quando si impostano i segreti (manuale, cap. 31).

**Nessun backup automatico.** Il piano gratuito non ne ha: se il progetto si perde, si perde.
L'export JSON esistente è già la risposta — `Store.importSnapshot()` valida il file e migra i
formati vecchi, ed è coperto da `test/backup.test.js` — ma va **schedulato fuori da Supabase**,
altrimenti l'unica copia dei dati sta nello stesso posto che si sta cercando di proteggere.
*Fatto nella 0.107.0:* `supabase/backup.sh` fa una copia cifrata del database, e si rimette con
`supabase/ripristino.sh`. Dalla 0.111.1 si lancia dal proprio PC: il workflow notturno non la salva
più fra gli artifact di GitHub, perché su un repo pubblico ci deve stare solo il codice.

## Il giorno in cui arrivano i disegni

Dalla 0.78.0 gli allegati ci sono, ma i file stanno in una cartella fuori dall'app e il database ne
porta solo il percorso. È il motivo per cui il limite di 1 GB di storage non compare in nessun conto
qui sopra.

Se un giorno una richiesta d'offerta portasse con sé il disegno, il calcolo cambia di colpo e va
rifatto: **1 GB sono ~1.000 PDF da 1 MB**, cioè poche centinaia di articoli con un disegno e due
revisioni. È la funzione che, più di ogni crescita del catalogo, sposta Bomtrack fuori dal piano
gratuito — e conviene saperlo prima di prometterla, non dopo.

## Verdetto

Per il carico reale di Bomtrack il piano gratuito è **sostenibile con margine ampio**: 25% dello
spazio a tre anni nello scenario realistico.

Non è lo spazio a decidere. Decidono, in quest'ordine:

1. il **pull incrementale**, senza il quale l'egress finisce prima del disco;
2. la **retention dei movimenti**, che è l'unica cosa che rende la crescita piatta invece che
   monotòna;
3. i **backup fuori sede** e il **ping anti-sospensione**, che non costano niente e mancano entrambi
   di serie (dalla 0.107.0 il ping lo fa il workflow `supabase-veglia`, una volta impostati i
   segreti; la copia intera del database si fa dal PC con `supabase/backup.sh`).

Se il progetto arriverà vicino al limite, ci arriverà **per il tempo trascorso, non per i dati**. E
il rimedio a quel punto è archiviare, non normalizzare meglio.

---

## Il modello di calcolo

Salvabile come script e rieseguibile con `node` (nessuna dipendenza). Non fa parte della suite: è
uno strumento di stima, e i suoi numeri sono quelli delle tabelle qui sopra.

Le assunzioni, dichiarate perché siano contestabili:

- **heap**: 28 byte di intestazione (23 di header di riga + 4 di puntatore di elemento, arrotondati)
  più le colonne, il tutto allineato a 8;
- **indice btree su uuid**: ~44 byte/riga (tupla 8 + chiave 16 + tid 8, con riempimento pagina al 90%);
- `uuid` 16, `timestamptz` 8, `numeric` ~10, `int` 4, `bool` 1, testo = lunghezza media + 1;
- **audit** = `created_by` + `updated_by` + `created_at` + `updated_at` = 48 byte per riga;
- **+35%** finale per bloat delle pagine, WAL e cataloghi — è un fattore prudenziale, non una misura.

```js
const IDX = 44, HDR = 28;
const U = 16, TS = 8, NUM = 10, INT = 4, BOOL = 1;
const txt = n => n + 1;              // varlena short header
const AUDIT = U * 2 + TS * 2;

// byte delle colonne, numero di indici → byte per riga
function row(cols, idx) { return Math.ceil((HDR + cols) / 8) * 8 + idx * IDX; }

const T = {
  items:           row(U + txt(20)+txt(60)+txt(12)+txt(6)+txt(80) + BOOL*4 + NUM*4 + U*6 + txt(10) + AUDIT, 6),
  item_components: row(U + U + U + NUM*2 + INT + AUDIT, 3),
  item_operations: row(U + U + U + NUM + txt(40) + INT + AUDIT, 3),
  item_cycle_rows: row(U + U + txt(6) + U*3 + NUM*3 + INT + AUDIT, 4),
  item_prices:     row(U + U + U + NUM*3 + INT + txt(20)+txt(60)+txt(40) + TS + U + txt(40) + AUDIT, 4),
  rfqs:            row(U + txt(12)+txt(60) + TS + txt(10) + U*3 + txt(30)*2 + txt(120)*2 + BOOL + INT + AUDIT, 5),
  rfq_lines:       row(U + U + U + txt(20)+txt(60)+txt(6) + NUM*2 + TS + txt(40) + INT + AUDIT, 3),
  orders:          row(U + txt(12)+txt(60) + TS + txt(10) + U*4 + txt(30)*2 + txt(120)*2 + txt(30) + BOOL + INT + AUDIT, 6),
  order_lines:     row(U + U + U + txt(20)+txt(60)+txt(6) + NUM*3 + TS + txt(40) + INT + AUDIT, 3),
  production_plans:      row(U + txt(12)+txt(60) + TS + txt(120) + U + BOOL + INT + AUDIT, 3),
  production_plan_lines: row(U + U + U + NUM + INT + AUDIT, 3),
  jobs:            row(U + txt(12)+txt(60)+txt(60)+txt(40)+txt(10) + TS*2 + txt(120) + BOOL + INT + AUDIT, 2),
  stock_movements: row(U + U + txt(10) + NUM + TS + txt(60) + U + TS, 3),
  suppliers:       row(U + txt(60)*2 + txt(80)*4 + txt(30)*4 + BOOL + INT + AUDIT, 2),
  customers:       row(U + txt(60)*2 + txt(80)*4 + txt(30)*4 + txt(120) + BOOL + INT + AUDIT, 3),
  families:        row(U + txt(40)+txt(12)+txt(10) + INT + AUDIT, 2),
  sub_families:    row(U + U + txt(40)+txt(10) + INT + AUDIT, 3),
  work_centers:    row(U + txt(40) + NUM*2 + U + BOOL + txt(10) + INT + AUDIT, 3),
  profiles:        row(U + txt(40)*3 + txt(16) + BOOL + AUDIT, 3),
};

// `rows` = righe per tabella; `revJson` = byte medi dello snapshot jsonb di una revisione
function stima(nome, c) {
  let tot = 0;
  Object.keys(c.rows).forEach(t => { tot += (T[t] || 0) * c.rows[t]; });
  tot += (row(U + U + txt(8) + TS + txt(60) + U + TS, 3) + c.revJson) * c.revisions;
  tot += (row(U + txt(20) + TS + U, 2) + 900) * c.trash;   // cestino: 30 giorni
  const mb = tot / 1048576;
  console.log(nome, mb.toFixed(0) + ' MB',
    '→ con bloat ' + (mb * 1.35).toFixed(0) + ' MB',
    '→ col progetto ' + (mb * 1.35 + 60).toFixed(0) + ' MB');
  return tot;
}

stima('A — officina piccola, 3 anni', {
  rows: { items: 5000, item_components: 20000, item_operations: 6000, item_cycle_rows: 12000,
    item_prices: 12000, rfqs: 600, rfq_lines: 6000, orders: 1500, order_lines: 15000,
    production_plans: 200, production_plan_lines: 3000, jobs: 600, stock_movements: 30000,
    suppliers: 200, customers: 150, families: 40, sub_families: 300, work_centers: 30, profiles: 8 },
  revisions: 2500, revJson: 1800, trash: 300 });

stima('B — uso intenso, 5 anni', {
  rows: { items: 20000, item_components: 100000, item_operations: 30000, item_cycle_rows: 60000,
    item_prices: 80000, rfqs: 4000, rfq_lines: 50000, orders: 12000, order_lines: 140000,
    production_plans: 1500, production_plan_lines: 25000, jobs: 5000, stock_movements: 400000,
    suppliers: 600, customers: 500, families: 80, sub_families: 800, work_centers: 60, profiles: 15 },
  revisions: 30000, revJson: 2600, trash: 1500 });

stima('C — grande, 5+ anni', {
  rows: { items: 60000, item_components: 400000, item_operations: 120000, item_cycle_rows: 240000,
    item_prices: 400000, rfqs: 15000, rfq_lines: 200000, orders: 50000, order_lines: 600000,
    production_plans: 6000, production_plan_lines: 100000, jobs: 20000, stock_movements: 2000000,
    suppliers: 1000, customers: 1000, families: 120, sub_families: 1200, work_centers: 100, profiles: 25 },
  revisions: 150000, revJson: 3000, trash: 5000 });
```

Il giorno in cui il database esiste, il confronto vero si fa così — e se diverge dalle stime qui
sopra, sono le stime a essere sbagliate:

```sql
select relname,
       pg_size_pretty(pg_total_relation_size(c.oid)) as totale,
       pg_size_pretty(pg_relation_size(c.oid))       as dati,
       pg_size_pretty(pg_indexes_size(c.oid))        as indici,
       n_live_tup                                    as righe
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_stat_user_tables s on s.relid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc;
```
