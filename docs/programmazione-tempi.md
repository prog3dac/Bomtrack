# Programmazione dei tempi — analisi e piano (ottobre 2026)

Il problema: da un fabbisogno con consegna *X* bisogna sapere **in che ordine e entro quando**
comprare, mandare al terzista, aspettare il rientro e lavorare in casa. Questo documento dice
cosa mancava, il metodo scelto, cosa è già fatto e cosa resta. Si aggiorna con le versioni.

## 1. Com'era (fino alla 0.87.0)

- `mrpDescend` (`views-mrp.js`) passava ai figli **la stessa data** del padre: il tondo di un
  perno di un gruppo «serviva» il giorno di consegna del gruppo.
- Gli unici anticipi erano due, e contati entrambi dalla consegna del prodotto:
  - acquisti: `orderBy = due − leadDays` del listino;
  - conto lavoro: `orderBy = due − days` di ogni fase (poi sommati per tratta), senza sapere
    che dopo quella fase ce n'erano altre da fare.
- Le fasi interne avevano solo **ore/pz** (per il carico), nessuna durata; gli assiemi nessun
  tempo di montaggio; nessun calendario (sabati, festivi, ferie); nessun trasporto verso il
  terzista.
- Il Carico centri metteva le ore nella settimana in cui **il pezzo serve pronto**.

Effetto: date d'ordine ottimiste di tutto il tempo di fabbricazione, ordini di lavoro che
chiedevano al terzista la data di consegna al cliente, e un piano senza una sequenza leggibile.

## 2. Il metodo: programmazione a ritroso a capacità infinita

È il *lead-time offsetting* di un MRP classico, fatto sull'albero esploso invece che per
livello, perché lo stesso articolo può stare in rami con date diverse.

```
consegna riga piano (due)
 └ assieme: fine montaggio = due; inizio = due − gg montaggio            [lavorativi]
    ├ componenti: servono per = inizio montaggio − margine
    └ parte prodotta (ciclo 10 int, 20-30 est. Beta, 40 int):
        fine 40 = serve per la parte; inizio 40 = fine − durata(40)       [lavorativi]
        rientro 20-30 = inizio 40; invio = rientro − Σ giorni − trasporto [calendario → lavorativo prec.]
        fine 10 = invio; inizio 10 = fine − durata(10)                    [= lancio ODP]
        materiali del ciclo: servono per = inizio della prima fase
    └ acquisto: ordinare entro = serve per − giorni del listino           [calendario → lavorativo prec.]
```

Regole:
- **Date-mattino**: la data è il mattino in cui il pezzo è pronto. Una fase di un giorno che
  finisce lunedì comincia venerdì. Niente buchi né sovrapposizioni fra fasi.
- **Durata fase interna** = ⌈(attrezzaggio centro + ore/pz × pezzi) ÷ ore al giorno⌉ + coda.
  Ore al giorno: dichiarate sul centro, o capacità settimanale ÷ giorni lavorativi, o 8.
- **Tratta esterna** (fasi consecutive dello stesso terzista, `clCycleRuns`): Σ giorni di
  attraversamento + trasporto del terzista, una volta per tratta.
- **Montaggio**: giorni dichiarati sull'assieme, o le ore delle sue lavorazioni in fila.
- **Più rami**: si tiene la data più vicina (`primaData`), per `due` e per `start`.
- **Capacità infinita**: le date non guardano il carico; il Carico centri mostra il
  sovraccarico nella settimana d'inizio della fase. Risolverlo (capacità finita, livellamento)
  è un altro strumento e non è promesso.
- **Le quantità non cambiano**: netting, impegni, lotti restano quelli di prima.

## 3. Tappe

### 0.88.0 — fatto
- `calendario.js`: giorni lavorativi, festivi ricorrenti, Pasquetta, chiusure; `addWorkDays`,
  `prevWorkDay`, `nextWorkDay`, `workDaysBetween`. Impostazioni in *Gestione → Impostazioni*.
- Campi: centro `hoursPerDay`, `setupHours`, `queueDays`; fornitore `transitDays`; assieme
  `assemblyDays`; impostazione `scheduleBufferDays`. Schema SQL, mappa cloud, fogli Excel.
- Motore: `schedPart`, `schedAssembly`, `internalOpDays`, `runLeadDays`, `runSendDate` in
  `views-mrp.js`; `mrpDescend` passa ai figli l'inizio del padre. Righe d'acquisto, di conto
  lavoro e da fabbricare con `due`/`start`/`orderBy` coerenti; documenti con le date giuste;
  carico per settimana d'inizio fase.
- Scostamenti dal piano iniziale, voluti: l'attrezzaggio sta sul **centro** e non sulla fase
  (una colonna in più nella griglia del ciclo costava più di quanto rende); una fase interna
  **non** ha un override in giorni — il campo `days` delle fasi interne resta a zero perché
  passare una fase da esterna a interna lascerebbe lì i giorni del terzista come se fossero
  stati scritti apposta.

### 0.89.0 — data fattibile e agenda — fatto
- **Passo in avanti** da oggi sullo stesso albero (`schedForward`): ogni nodo finisce al più
  presto quando i suoi figli sono pronti; un acquisto coperto da giacenza è pronto oggi, uno in
  arrivo alla data dell'ODA. La radice dà la **data fattibile**; il ramo che la determina è il
  **percorso critico**. Per riga di piano: richiesta / fattibile / margine in giorni lavorativi.
- **Agenda del piano** («Programma»): eventi in ordine di data — ordina, invia, rientro, lancio,
  inizio fase, montaggio, consegna — con lo stato letto dai documenti generati
  (`planDocumentedKeys`); export Excel/PDF.
- **Riepilogo**: gli stessi eventi nel calendario (`views-home.js`), accanto a quelli d'ordine.
- Come è fatto: `schedOps` (il cuore di `schedPart`, riusabile sulle fasi congelate),
  `schedTree`/`schedFlat` (l'albero di una riga di piano, con le date degli aggregati),
  `schedDisponibilita`/`schedForward`/`schedCritico`/`planFeasibility` (il passo in avanti),
  `planAgenda` (l'agenda, dagli stessi aggregati delle tabelle), `buyLeadDays` (estratto da
  `mrpBuyRow`). `mrpExplode` restituisce anche `asm` e `intOps`, solo date.

### 0.90.0 — Gantt e date congelate — fatto
- **Gantt** SVG nella scheda piano, una riga per nodo, barre per tipo, linee oggi/consegna,
  percorso critico evidenziato (stessa tecnica di `loadChartOne`).
- **ODP**: al lancio ogni fase riceve `plannedStart`/`plannedEnd` da `schedPart` sulla consegna
  dell'ODP; ripianificazione solo con un comando esplicito.
- **ODL da ODP** (`opRunDocRow`): invio e rientro della tratta dalle date congelate, non più la
  consegna dell'ODP.
- Come è fatto: `planGanttHtml` (views-mrp.js, sull'albero di `planFeasibility`);
  `odpSchedule`/`odpPianifica`/`odpReplanAsk` (views-prod.js, `schedOps` sulle fasi congelate);
  `plannedStart`/`plannedEnd` sulle fasi, con migrazione, tipi cloud e colonne SQL. La
  ripianificazione non scrive nello storico delle dichiarazioni: non è un fatto di produzione.

### 0.111.0 — le date degli ordini già emessi — fatto
- **Passo in avanti**: un arrivo in un giorno di chiusura si riceve il primo giorno lavorativo
  dopo; una riga d'ordine scaduta e non ricevuta è pronta il prossimo giorno lavorativo, non oggi.
  `schedDisponibilita` espone `disp.info` (arrivo atteso, ordini scaduti) e `schedForward` lo
  copia sui nodi d'acquisto (`attesa`, `scaduti`), letti dal percorso critico e dal Gantt.
- **Gantt**: linea della data fattibile e rombo dell'arrivo atteso, rosso se tardi o scaduto.
- **Fabbisogno**: `mrpArrivoTardi` (lo stesso conto di `jobCoverage` con `incomingEntro`) dà
  `arrivoTardi` e `scaduti` alla riga d'acquisto. **Agenda**: voce `arrivo` dagli ordini del piano.
- Le date a ritroso e quelle congelate su ODP e ODL **non** guardano gli ordini, come prima.

## 4. Cosa resta fuori, di proposito

- **Capacità finita** e livellamento: le date non guardano il carico. Il Carico centri mostra il
  sovraccarico nella settimana d'inizio fase; spostare le fasi per risolverlo è un altro strumento.
- **Netto delle parti prodotte**: il fabbisogno non toglie dal magazzino le parti a produzione
  interna, e quindi neanche la data fattibile.
- **Avanzamento per fase nel piano**: un ODP già avviato non accorcia la data fattibile del piano
  da cui è nato.

## 5. Come si verifica

`test/calendario.test.js` e `test/schedulazione.test.js`: il caso di riferimento sopra con le
date scritte a mano, e i casi limite (patrono in mezzo, capodanno, due rami, dati mancanti,
fuso a est di Greenwich).
