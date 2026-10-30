# Bomtrack — Manuale d'uso

**Versione dell'app documentata: 0.132.0**

📖 **[Leggilo come pagina web](https://claude.ai/code/artifact/726a0963-2db0-4947-999b-d7b5beb91a0b)** — stesso testo, con indice laterale, filtro dei capitoli e tema chiaro/scuro. Comodo da tenere aperto di fianco all'app.

Questo è il manuale operativo di Bomtrack: cosa fa ogni schermata, come si compilano i campi,
quali comandi ci sono e — soprattutto — **in che ordine si lavora**, dalla commessa del cliente
fino alla merce che entra a magazzino.

Se è il primo giorno che usi Bomtrack, leggi nell'ordine il capitolo **1**, il **2** e poi tutto
il **4**: il capitolo 4 è il giro completo del lavoro, e gli altri capitoli sono il dettaglio di
ciascuna sua tappa.

---

## Indice

**Parte I — Iniziare**
1. [Che cos'è Bomtrack](#1-che-cosè-bomtrack)
2. [Avvio e primo accesso](#2-avvio-e-primo-accesso)
3. [L'interfaccia](#3-linterfaccia)

**Parte II — Il flusso di lavoro**

4. [Come si lavora con Bomtrack — il giro completo](#4-come-si-lavora-con-bomtrack--il-giro-completo)
5. [Riepilogo — «Richiede attenzione»](#5-riepilogo--richiede-attenzione)

**Parte III — Archivi**

6. [Tecnico → Articoli d'acquisto](#6-tecnico--articoli-dacquisto)
7. [Tecnico → Articoli di progetto](#7-tecnico--articoli-di-progetto)
8. [La scheda articolo, campo per campo](#8-la-scheda-articolo-campo-per-campo)
9. [I codici automatici](#9-i-codici-automatici)
10. [Listino fornitori](#10-listino-fornitori)
11. [Dove è usato e simulazione del costo](#11-dove-è-usato-e-simulazione-del-costo)
12. [Pannello laterale e selezione multipla](#12-pannello-laterale-e-selezione-multipla)

**Parte IV — Il prodotto**

13. [Tecnico → Gestione DB](#13-tecnico--gestione-db)
14. [Cicli di lavorazione](#14-cicli-di-lavorazione)
15. [Revisioni](#15-revisioni)
16. [Costificazione — Visualizza DB](#16-costificazione--visualizza-db)

**Parte V — Le operazioni**

17. [Magazzino](#17-magazzino)
18. [Commesse](#18-commesse)
19. [Fabbisogno materiali](#19-fabbisogno-materiali)
20. [Richieste di offerta (RFQ)](#20-richieste-di-offerta-rfq)
21. [Ordini a fornitore (ODA)](#21-ordini-a-fornitore-oda)
22. [Ordini di produzione (ODP)](#22-ordini-di-produzione-odp)
23. [Ordini di lavoro (ODL) e conto lavoro](#23-ordini-di-lavoro-odl-e-conto-lavoro)
24. [Carico dei centri di lavoro](#24-carico-dei-centri-di-lavoro)

**Parte VI — Amministrazione**

25. [Gestione](#25-gestione)
26. [Utenti e ruoli](#26-utenti-e-ruoli)
27. [Import ed export da Excel](#27-import-ed-export-da-excel)
28. [Export di elenchi e documenti](#28-export-di-elenchi-e-documenti)
29. [Stampa](#29-stampa)
30. [Backup e manutenzione](#30-backup-e-manutenzione)
31. [L'archivio condiviso (Supabase)](#31-larchivio-condiviso-supabase)

**Parte VII — Riferimenti**

32. [Scorciatoie da tastiera](#32-scorciatoie-da-tastiera)
33. [Stati dei documenti](#33-stati-dei-documenti)
34. [Glossario](#34-glossario)
35. [Domande frequenti](#35-domande-frequenti)
- [Appendice A — Come funziona sotto](#appendice-a--come-funziona-sotto)

---

# Parte I — Iniziare

## 1. Che cos'è Bomtrack

Bomtrack è l'applicazione con cui si tiene il **prodotto** e il **lavoro che ci gira intorno**
in un'officina meccanica:

- le **distinte base multi-livello** delle macchine — macchina, gruppi, sottogruppi, parti,
  senza limite di profondità;
- la **costificazione automatica** di ogni assieme, dalla vite alla macchina finita;
- il **magazzino** di quello che si tiene a scaffale;
- i **cicli di lavorazione** delle parti, con le fasi interne e quelle affidate fuori;
- il **fabbisogno materiali** che nasce dalle commesse dei clienti;
- il ciclo acquisti completo: **richieste di offerta**, **ordini a fornitore**,
  **ordini di lavoro** al terzista, ricevimenti e **conto lavoro**.

È pensata per chi progetta, chi compra e chi manda in produzione, e tiene queste tre viste sullo
stesso archivio: la parte che il progettista disegna è la stessa che l'ufficio acquisti ordina ed
è la stessa che il magazziniere trova sullo scaffale.

### Cosa Bomtrack non fa

Vale la pena dirlo subito, perché evita di cercare funzioni che non ci sono.

- **Non schedula a capacità finita.** Dalla 0.88.0 il fabbisogno **programma a ritroso**: dalla
  consegna risale montaggi, fasi interne e tratte dal terzista sul **calendario di fabbrica**, e
  dice quando ordinare, quando spedire, quando lanciare (→ [cap. 19](#19-fabbisogno-materiali)).
  La capacità resta però **infinita**: il *Carico centri* mostra il sovraccarico nella settimana
  in cui la fase comincia, ma non lo risolve spostando le date.
- **Non schedula.** L'avanzamento c'è, e da due strade che rispondono a due domande diverse.
  Nella tabella *Da fabbricare* di un piano si dichiara **quanti pezzi sono stati fatti** (dalla
  0.77.0): è una dichiarazione per **parte finita**, non per fase superata — un pezzo fermo a metà
  ciclo conta ancora come tutto da fare — e serve a non rimandare al terzista una lavorazione già
  fatta. Gli **ordini di produzione** (→ [cap. 22](#22-ordini-di-produzione-odp)) seguono invece una
  parte **fase per fase**: lì si dichiarano pezzi buoni e scarti, e il magazzino si muove ai due
  estremi del ciclo.
  Il *quando* lo dà la programmazione a ritroso del fabbisogno, a capacità infinita. E fuori da un ordine di produzione il magazzino resta com'era — si muove con i
  movimenti e con i ricevimenti, perché due strade per la stessa giacenza darebbero due verità.
- **Non è un gestionale amministrativo.** Niente fatture, niente contabilità, niente DDT.
- **Non archivia i documenti nel database.** Disegni e schede tecniche si allegano agli articoli
  (dalla 0.77.0), ma i file stanno **su questo computer**, fuori dall'archivio: il backup JSON ne
  porta l'elenco e non il contenuto. Prima di trasferirti su un altro PC vanno riscaricati a mano.
- **Da solo, ogni PC ha il suo archivio.** Due colleghi che lavorano su due PC lavorano su due
  copie diverse, e si allineano con un backup (→ [cap. 30](#30-backup-e-manutenzione)). Per
  lavorare tutti sullo stesso archivio si collega un progetto Supabase: è il
  [cap. 31](#31-larchivio-condiviso-supabase).
- **Senza archivio condiviso i ruoli non sono sicurezza.** Servono a separare le responsabilità
  tra colleghi, non a proteggere i dati (→ [cap. 26](#26-utenti-e-ruoli)). Con l'archivio
  condiviso li applica il server.

> ⚠️ **Senza archivio condiviso i dati risiedono in questo browser, su questo PC.** Non c'è un server. Svuotare i dati del
> sito, cambiare browser o cambiare PC significa non trovare più l'archivio. Fai backup regolari:
> *Gestione → Backup → Esporta JSON*, o meglio ancora attiva il **backup automatico** in una
> cartella (→ [cap. 30](#30-backup-e-manutenzione)). È l'unica cosa di questo manuale che, se la salti, ti costa
> davvero cara, e resta vera anche con l'archivio condiviso
> (→ [cap. 31](#31-larchivio-condiviso-supabase)).

---

## 2. Avvio e primo accesso

### Aprire l'app

Bomtrack è una cartella di file. Si apre facendo **doppio click su `index.html`**, oppure — se
lavori in VS Code — con l'estensione *Live Server*. Non c'è nulla da installare e nulla da
compilare.

**Non serve la rete, mai.** Le librerie che generano i PDF e gli Excel stanno dentro la cartella
dell'app: copiando la cartella su un altro PC funziona tutto, export compresi.

### Il primo avvio

La prima volta Bomtrack chiede di creare l'**amministratore**: nome e cognome, email e password.
Quello che si scrive lì è il primo utente, ed è l'unico che all'inizio può entrare in *Gestione*.

Nello stesso modulo si sceglie **come lavora l'azienda** (dalla 0.121.0), cioè quali aree partono
accese (→ [cap. 25](#25-gestione), *Aree*):

| Profilo | Aree accese |
|---|---|
| Con produzione interna | tutte: Magazzino, Pianificazione, Produzione interna |
| Costruttore senza produzione interna | Magazzino e Pianificazione: ogni parte si compra |
| Solo la base | nessuna: anagrafiche, distinte, acquisti e listini |

È solo il punto di partenza: le aree si cambiano quando si vuole da *Gestione → Aree e moduli*.

Insieme all'amministratore l'app carica dei **dati di esempio** — la macchina «Nastro Trasportatore
NT-100» con i suoi gruppi, le sue parti e qualche fornitore. Servono a guardarsi intorno senza
partire dal vuoto. Quando si comincia a lavorare sul serio si azzerano da
*Gestione → Backup → AZZERA TUTTO*.

### Gli avvii successivi

Si entra con **email e password**. La casella **Ricordami su questo PC** conserva l'email e tiene
la sessione aperta fino a **Esci**; quanto duri lo decide l'amministratore in
*Gestione → Utenti e accesso* (0 giorni = non scade mai).

### La versione

Il numero di versione si legge **accanto al logo, in alto a sinistra** (es. `v0.94.0`).
Corrisponde alla voce in cima al changelog: serve quando si segnala un problema.

**Quando arriva una versione nuova** (dalla 0.105.6). In officina un PC resta acceso per
settimane, con Bomtrack aperta, e la versione nuova arrivava solo al primo che ricaricava la
pagina. Ora una scheda aperta controlla da sé, una volta l'ora, se c'è una versione nuova, e
quando c'è lo dice con un avviso in basso che resta finché non lo si chiude: «**È disponibile una
versione nuova** di Bomtrack», con il pulsante **Ricarica**. L'app non ricarica niente da sola,
perché a metà di un ordine si perderebbe il lavoro: si ricarica quando si vuole, e se ci sono
modifiche non salvate **Ricarica** lo chiede prima.

**Sul telefono.** Bomtrack si può installare come un'app (dal menu del browser, *Installa app* o
*Aggiungi a schermata Home*). Installata, dalla 0.105.6 segue la rotazione del telefono come ogni
altra app, in verticale o in orizzontale: prima restava bloccata in orizzontale.

### Dove sta questo manuale

Il pulsante 📖 **Manuale d'uso** nell'intestazione lo apre in una scheda nuova, da qualunque
schermata. È il file `manuale.html`, che sta nella cartella dell'app accanto a `index.html`:
funziona **senza rete** come tutto il resto, e viaggia con la cartella quando la si copia su un
altro PC. Si apre nel tema scelto nell'app, e si stampa con `Ctrl+P`.

Nella cartella c'è anche `MANUALE.md`, lo stesso testo in formato Markdown: è la versione che si
legge in un editor o su GitHub.

### Portare l'app su un altro PC

1. Sul PC di partenza: *Gestione → Backup → **Esporta JSON***. Si scarica un file.
2. Copia l'intera cartella di Bomtrack sul PC di arrivo.
3. Apri `index.html`, crea l'amministratore, poi *Gestione → Backup → **Importa JSON***.

> ⚠️ **Importa JSON sovrascrive l'archivio corrente.** Se sul PC di arrivo c'era già del lavoro,
> dalla 0.105.6 l'app ne salva da sola una **copia di sicurezza** prima di sostituirlo
> (→ [cap. 30](#30-backup-e-manutenzione)); il backup che porti con te resta comunque la copia buona.

---

## 3. L'interfaccia

### L'intestazione

In alto, da sinistra a destra:

| Elemento | A cosa serve |
|---|---|
| **Logo e versione** | Identità dell'app e revisione in esecuzione |
| **Barra di navigazione** | I sette gruppi di funzioni (vedi sotto) |
| **Badge modifiche non salvate** | Compare quando un salvataggio non è riuscito, o quando un'altra scheda ha modificato l'archivio (→ [cap. 30](#30-backup-e-manutenzione)) |
| **Orologio** | Data e ora correnti |
| **Pillola utente** | Chi è connesso, con il suo colore |
| 🔎 **Cerca ovunque** | Ricerca globale — `Ctrl+K` |
| ▦ **Scansiona QR** | Apre la fotocamera e legge un'etichetta o il QR di un documento (→ [cap. 17](#17-magazzino), *Le etichette QR*) |
| 🖨 **Stampa questa vista** | Stampa pulita della schermata — `Ctrl+P` |
| 📖 **Manuale d'uso** | **Questo manuale.** Si apre in una scheda nuova, così resta consultabile mentre si lavora, senza perdere il documento aperto |
| 🌗 **Cambia tema** | Gira su tre stati: *come il sistema*, *chiaro*, *scuro* |
| ☰ **Vista compatta** | Righe di tabella più basse: si vedono quasi il doppio delle righe (→ *Il tema*, qui sotto) |
| 🔑 **Cambia password** | La propria password |
| **Esci** | Chiude la sessione |

**Su uno schermo più stretto** l'intestazione resta su una riga sola e fa spazio da sé, un passo
alla volta, solo quanto serve: prima spariscono il ruolo nella pillola e la data; poi scansiona, stampa,
manuale, tema, vista compatta, password ed esci passano sotto il pulsante **⋯** (*Altri comandi*); poi le sezioni
restano con la sola icona (il nome compare passandoci sopra); per ultimo, sul telefono, le sezioni
stesse si aprono dal pulsante **☰**. I due menu si chiudono con `Esc`, con un clic fuori o
scegliendo una voce.

### La navigazione a due livelli

La barra dei comandi ha **sette gruppi**, ordinati come il lavoro scorre: dall'ufficio tecnico
alla pianificazione, agli acquisti, all'officina, al magazzino. Cliccando un gruppo, le sue voci
compaiono su una seconda riga; il gruppo con una voce sola non mostra la seconda riga. Dalla 0.127.0
la seconda riga **resta ferma in alto** sotto la barra dei gruppi anche quando si scorre la pagina
(al telefono le voci che non ci stanno scorrono di lato). **Ogni gruppo
ricorda l'ultima voce usata**: tornando su *Acquisti* si riapre dove si era rimasti.

| Gruppo | Voci |
|---|---|
| 🏠 **Riepilogo** | Riepilogo · Cruscotto |
| 🌳 **Tecnico** | Articoli di progetto · Articoli d'acquisto · Gestione DB · Visualizza DB · Cicli di lavorazione |
| 📋 **Pianificazione** | Commesse · Fabbisogno · Carico centri · Avanzamento |
| 🛒 **Acquisti** | Richieste offerta · Ordini fornitore · Listino fornitori |
| 🏭 **Produzione** | Ordini di produzione · Ordini di lavoro |
| 📦 **Magazzino** | *(voce unica)* |
| ⚙️ **Gestione** | *(voce unica — solo amministratori)* |

Fino alla 0.90 i gruppi erano divisi per tipo di dato (*Anagrafica*, *Cicli di lavorazione*,
*Distinta base*, *Documenti*): le schermate sono le stesse, cambia solo il gruppo in cui stanno.

La vista aperta finisce **nell'indirizzo del browser** (`…index.html#mrp`). Ne segue che i tasti
*Indietro* e *Avanti* del browser funzionano, e che un indirizzo si può salvare tra i preferiti o
mandare a un collega che ha la stessa app.

### Esporta ▾ e ⋯

Dalla 0.94.0 i comandi di contorno non stanno più in fila nella testata. **Esporta ▾** apre un
menu con *Excel* e *PDF*: dove questo manuale dice «Esporta Excel» o «Esporta PDF», sono le due
voci di quel menu. Il pulsante **⋯** raccoglie i comandi del documento che non sono il lavoro di
tutti i giorni: *Duplica*, *Annulla*, *Crea ordine da questa richiesta* e **Elimina**, in rosso.
Elimina sta lì apposta: in vista, accanto a *Salva*, era a un clic di distanza da un errore. I
menu si chiudono con un clic fuori, con `Esc` o scegliendo una voce. Sul telefono il menu
**Esporta ▾** si apre sempre dentro lo schermo (dalla 0.105.6): prima, ancorato al bordo destro,
poteva uscire a sinistra e lasciare fuori mezze voci.

### A che punto è un documento

Richieste di offerta, ordini a fornitore, ordini di lavoro, ordini di produzione e commesse hanno
in testa (dalla 0.93.0) una **barra dei passi**: gli stati del documento in fila, con quelli
superati spuntati e quello attuale acceso.

| Documento | Passi |
|---|---|
| Richiesta di offerta | Bozza → Inviata → Offerta ricevuta → Chiusa |
| Ordine a fornitore, ordine di lavoro | Bozza → Inviato → Confermato → Parziale → Evaso |
| Ordine di produzione | Bozza → Lanciato → In corso → Completato → Chiuso |
| Commessa | Aperta → In produzione → Chiusa |

A destra c'è **il passo successivo**. Quando l'app sa farlo da sé è un pulsante: *Segna come
inviata/o*, *Crea ordine*, *Segna tutto ricevuto*, *Lancia*, *Chiudi l'ordine*, *Metti in
produzione*, *Chiudi la commessa*. Il pulsante fa esattamente quello che farebbe il menu
**Stato**, e salva subito. Quando invece il passo lo fa una persona (scrivere i prezzi
dell'offerta, il numero di conferma del fornitore, i pezzi sulle fasi), la barra dice cosa manca.
Un documento **annullato** è *fuori dal giro* e non propone niente. Il menu *Stato* resta dov'era.

Sotto la barra, la riga **Collegati** elenca i documenti legati, ciascuno cliccabile: la commessa
e il piano da cui viene, la richiesta da cui è nato un ordine, l'ordine di produzione di un ordine
di lavoro; e nell'altro verso gli ordini nati da una richiesta e gli ordini di lavoro nati da un
ordine di produzione.

### Le due forme di schermata

Bomtrack usa due impaginazioni, e riconoscerle aiuta a orientarsi.

**Elenco a tutta pagina** — Anagrafiche, Magazzino, Cicli, Distinta base, Carico centri.
Toolbar in alto, barra dei filtri sotto, elenco al centro. A destra si può aprire il
**pannello laterale** (`Ctrl+I`, → [cap. 12](#12-pannello-laterale-e-selezione-multipla)).

**Elenco a destra, documento al centro** — Commesse, Fabbisogno, Richieste, Ordini, Ordini di
lavoro. L'elenco sta in una colonna a destra e **resta visibile mentre si lavora un documento**,
che occupa il centro. Si passa da un documento all'altro con un click, senza tornare indietro e
ricercare la riga; la riga aperta resta marcata e i documenti chiusi o annullati si vedono spenti.
I filtri stanno impilati nella colonna dell'elenco, e i comandi che agiscono sul documento stanno
nella sua testata. **Le modifiche in sospeso si salvano da sole** quando si apre un altro
documento o si passa a un'altra sezione. In stampa esce il documento, non l'elenco.

### Le schede mobili

Le finestre di dialogo **non bloccano la pagina**: si spostano trascinandole per il titolo, si
ridimensionano dall'angolo in basso a destra e si chiudono con ✕ o con `Esc`. Dietro si continua a
navigare, e più schede possono restare aperte insieme — per esempio il listino di un articolo e
*Dove è usato* dello stesso, per confrontarli.

**Una scheda al posto di un'altra.** Le schede di modifica (un articolo, una riga, una rettifica)
sono una alla volta: aprendone una nuova mentre un'altra è aperta, l'app avverte che «le
**modifiche non salvate** andranno perse». Dalla 0.105.6 lo chiede **solo se la scheda aperta è
stata davvero cambiata**: una scheda aperta per guardare e mai toccata lascia il posto senza
domande. Così la domanda, quando arriva, vuol dire che c'è davvero qualcosa da perdere.

Sul telefono una scheda occupa tutta la pagina, e dalla 0.105.6 una scheda lunga finisce **sopra
la barra del browser**: i pulsanti in fondo (*Salva*, *Registra*) restano raggiungibili.

### Il tema

Il pulsante 🌗 nell'intestazione gira su tre stati: **come il sistema** (quello di partenza),
**chiaro**, **scuro**. La scelta resta su questo browser e non viene condivisa con i colleghi:
è una preferenza personale, non un dato aziendale. **In stampa la carta resta bianca** in tutti e
tre i casi.

**Vista compatta** (dalla 0.101.0). Il pulsante ☰ accanto al tema abbassa le righe di tutte le
tabelle e degli elenchi, e rimpicciolisce un poco il testo e le card in testa: in officina, o su un
portatile, si vedono quasi il doppio delle righe. Si spegne con lo stesso pulsante. Come il tema,
resta in questo browser.

**I fornitori si cercano scrivendo** (dalla 0.102.0). Ogni campo in cui si sceglie un fornitore o
un terzista — nei documenti (richiesta, ordine, ordine di lavoro), nel listino della scheda
articolo, nei cicli, nei centri di lavoro, nella rettifica di magazzino e nei filtri degli elenchi
— è un campo in cui si scrive: un clic apre la lista intera, e mentre si digita restano solo i
fornitori che corrispondono. Maiuscole e accenti non contano, e più parole valgono in qualunque
ordine: `rid bonf` trova *Bonfiglioli Riduttori*. Prima vengono quelli che **cominciano** con
quello che si è scritto. Si sceglie con un clic, o con le frecce e **Invio**; **Esc** chiude la
lista e lascia il fornitore di prima. Su un documento bloccato il campo è bloccato anche lui.

**Le card in testa si cliccano** (dalla 0.101.0). Nel Riepilogo, nel Cruscotto e nel Magazzino le
card con i numeri portano alla lista che li spiega, già filtrata: *Sotto scorta minima* mostra gli
articoli sotto scorta, *Ordini da evadere* apre gli ordini a fornitore inviati, confermati o
parziali, e così via. Nel Magazzino la card del filtro in uso resta evidenziata, e un secondo clic
toglie il filtro.

---

# Parte II — Il flusso di lavoro

## 4. Come si lavora con Bomtrack — il giro completo

Questo è il capitolo che dà senso a tutti gli altri. Bomtrack non è un insieme di schermate
indipendenti: è **una catena**, e ogni anello ha bisogno di quello prima.

### Lo schema

```
    ┌──────────────────────────────────────────────────────────────┐
 0. │  GESTIONE — gli archivi di base                              │
    │  U.M. · famiglie · concetti · fornitori · clienti            │
    │  centri di lavoro · impostazioni (costi, codifica)           │
    └────────────────────────────┬─────────────────────────────────┘
                                 │
    ┌────────────────────────────▼─────────────────────────────────┐
 1. │  ANAGRAFICA ACQUISTI          ANAGRAFICA PROGETTO            │
    │  commerciali, materie prime   macchine, gruppi, sottogruppi, │
    │  + LISTINO FORNITORI          parti                          │
    └──────────┬────────────────────────────┬──────────────────────┘
               │                            │
               ▼                            ▼
 2.   CICLI DI LAVORAZIONE          DISTINTA BASE (albero)
      le fasi                 ────▶  macchina › gruppi › parti › materiale
               │                            │
               └────────────┬───────────────┘
                            ▼
 3.                  COSTIFICAZIONE
                  «quanto costa la macchina»
                            │
    ────────────────────────┼────────────────────────────────────────
                            │
 4.   COMMESSA CLIENTE ─────▶ PIANO DI FABBISOGNO
      (chi, cosa, quando)     (quante macchine, per quando)
                                       │
                    ┌──────────────────┼───────────────────┐
                    ▼                  ▼                   ▼
 5.        DA ACQUISTARE      DA FAR LAVORARE      DA FABBRICARE
                    │            FUORI                     │
                    │                  │                   ▼
                    │                  │            CARICO CENTRI
                    │                  │            (ore interne)
         ┌──────────┴──────┐           │
         ▼                 ▼           ▼
 6.  RICHIESTA         ORDINE      ORDINE DI LAVORO
     OFFERTA (RFQ)     (ODA)       (ODL)
         │                 │           │
         │ prezzi          │ ricevi    │ conto lavoro
         ▼                 ▼           ▼
     LISTINO ──────▶  MAGAZZINO ◀──────┘
```

### 4.1 Prima di tutto: preparare gli archivi

*(→ [cap. 25](#25-gestione))*

Si comincia da **⚙️ Gestione**, e conviene farlo in quest'ordine, perché ogni voce serve a
compilare la successiva:

1. **Unità di misura** — pz, kg, m, h… Con una ★ predefinita, proposta alle nuove righe.
2. **Famiglie** — tre elenchi separati (commerciali, materie prime, parti), ciascuno con
   macrofamiglie e sottofamiglie. Le sigle delle famiglie entrano nei codici automatici.
3. **Concetti** — la nomenclatura delle parti: `ALBERO`, `FLANGIA`, `STAFFA`… Il nome di una
   parte non è testo libero, è **concetto + descrizione**.
4. **Fornitori** — con pagamento e trasporto predefiniti, che si riproporranno su ogni documento.
5. **Clienti** — l'anagrafica a monte delle commesse.
6. **Centri di lavoro** — nome, **tariffa €/h** e **capacità in ore/settimana**; sotto ciascuno,
   i **fornitori di conto lavoro** che sanno fare quella lavorazione, con la loro tariffa.
7. **Costi e margini** e **Codifica articoli** — spese generali %, margine %, valuta; i prefissi
   della codifica automatica e l'approvvigionamento predefinito delle parti.

> Saltare questo passo non blocca niente, ma costringe a tornare indietro: si scopre di non poter
> scegliere l'unità di misura mentre si crea il primo articolo, o di non avere il centro di
> lavoro mentre si scrive la prima fase di ciclo.

### 4.2 Costruire il prodotto

*(→ capitoli [6](#6-tecnico--articoli-dacquisto), [7](#7-tecnico--articoli-di-progetto),
[14](#14-cicli-di-lavorazione), [13](#13-tecnico--gestione-db))*

Si costruisce **dal basso verso l'alto**, perché il costo di un assieme è la somma di ciò che
contiene: finché le foglie non hanno un prezzo, il ramo non ha un costo.

**a) Quello che si compra** — 🌳 *Tecnico → Articoli d'acquisto*. Materie prime (barra d'acciaio a €/kg,
lamiera a €/kg) e componenti commerciali (cuscinetti, motori, viteria). Per ognuno, il prezzo si
inserisce **dal listino fornitori** (→ [cap. 10](#10-listino-fornitori)): è l'unico posto dove
nasce un prezzo d'acquisto, e il campo nella scheda articolo è di sola lettura apposta.

**b) Le parti** — 🌳 *Tecnico → Articoli di progetto*, tipo **Parte**. Ogni parte dichiara il suo
**approvvigionamento**:

- **Acquisto da fornitore** — la parte si compra già fatta. Il suo costo è il prezzo a listino, e
  nel fabbisogno è una foglia d'acquisto come un commerciale.
- **Produzione interna** — la parte si fa in casa. Il suo costo è la somma della sua **distinta**
  (il materiale) più il **ciclo di lavorazione** (le fasi), e nel fabbisogno l'app scende dentro e
  compra il materiale invece della parte.

**c) Distinta e ciclo** — per ogni parte a produzione interna, la **distinta** in *Gestione DB*
(cosa serve: 2,4 kg di quella barra) e il **ciclo** in *Cicli di lavorazione* (fasi 10, 20, 30…: tornitura al centro Torni,
2 ore; zincatura da Beta, 5 giorni). Una fase **senza fornitore** è interna e carica un centro;
una fase **con fornitore** è conto lavoro e diventerà un ordine di lavoro.

**d) Gli assiemi** — 🌳 *Tecnico → Gestione DB*. Si apre la macchina e le si appendono i gruppi,
ai gruppi i sottogruppi, ai sottogruppi le parti e i commerciali. Ogni riga ha una **quantità** e
una **percentuale di scarto**. Gli assiemi possono avere anche lavorazioni proprie (il montaggio).

### 4.3 Sapere quanto costa

*(→ [cap. 16](#16-costificazione--visualizza-db))*

🌳 *Tecnico → **Visualizza DB***: si sceglie la macchina e si legge il costo, diviso per voci
(materiale, commerciali, parti, lavorazioni, spese generali) con l'**incidenza** di ciascuna e il
**prezzo di vendita** che ne segue. Il pulsante **Da dove viene questo costo** apre l'elenco degli
articoli che pesano di più: è la risposta alla domanda «perché costa così tanto».

Da qui si esce con il PDF e l'Excel della distinta esplosa, che è quello che si manda a chi fa
il preventivo.

### 4.4 Dal cliente al fabbisogno

*(→ capitoli [18](#18-commesse) e [19](#19-fabbisogno-materiali))*

Fin qui si è descritto **il prodotto**. Da qui in poi si lavora su **un lavoro concreto**.

**a) La commessa** — 📋 *Pianificazione → Commesse → **+ Nuova commessa***. Cliente, descrizione,
riferimento del cliente, data di apertura e **consegna al cliente**. La commessa è il contenitore:
ci si agganciano i piani, le richieste e gli ordini, e la sua scheda dirà in ogni momento se il
materiale c'è.

**b) Il piano di fabbisogno** — 📋 *Pianificazione → Fabbisogno → **+ Nuovo piano***. Si mette il piano
sotto la sua commessa, si dichiara la **consegna richiesta**, e nella sezione **Da produrre** si
scrive cosa e quanto: *3 × Nastro NT-100*, *2 × Nastro NT-200*.

**c) L'esplosione** — l'app scende in tutte le distinte, moltiplica per le quantità, somma gli
articoli che ricorrono in più punti e produce quattro sezioni:

- **Da acquistare** — la lista d'acquisto consolidata;
- **Da far lavorare fuori** — le fasi di ciclo affidate a un terzista;
- **Da fabbricare** — le parti che si fanno in casa;
- **Carico dei centri** — le ore che le fasi interne chiedono ai centri.

**d) Il netto** — con la casella **Fabbisogno netto** attiva, l'app toglie da ogni riga quello che
è già a magazzino, quello già ordinato, e aggiunge quello che gli **altri piani aperti che
consegnano prima** hanno già impegnato:

```
netto = lordo + scorta minima + impegnato − esistente − in arrivo
```

arrotondato al **lotto di riordino** dell'articolo. Così due piani non si dichiarano coperti con
la stessa merce, e nessuno compra la parte degli altri: chi consegna prima prende prima, e ognuno
compra solo quello che manca a lui. **Il netto non si applica alle lavorazioni**: una fase non sta a
scaffale.

### 4.5 Comprare

*(→ capitoli [20](#20-richieste-di-offerta-rfq) e [21](#21-ordini-a-fornitore-oda))*

Dal piano, tre pulsanti: **Genera richieste**, **Genera ordini**, **Genera ordini di lavoro**.
Ognuno apre una finestra con le righe raggruppate per fornitore e le caselle per scegliere cosa
includere; ne esce **un documento per fornitore**.

**Il percorso lungo — quando il prezzo non c'è:**

1. **Genera richieste** → nascono le RFQ (`RFQ-2026-001`…), una per fornitore.
2. Si genera il **documento PDF** (bilingue italiano/inglese) e lo si manda. Alla generazione
   l'app propone di passare lo stato a *Inviata*.
3. Torna l'offerta: si scrivono i **prezzi** nelle righe. Quando ci sono tutti, lo stato passa da
   solo a *Offerta ricevuta*.
4. **Registra a listino** trasforma quei prezzi in **quotazioni** nel listino degli articoli: da
   quel momento la costificazione li conosce. Con più righe si sceglie quali registrare; la
   quotazione porta la data del giorno in cui la registri.
5. Con più richieste sullo stesso materiale, **Confronta offerte** le mette a fianco.
6. **Crea ordine** converte la richiesta in ordine. La richiesta passa a *Chiusa*.

**Il percorso corto — quando il prezzo c'è già:** dal piano, **Genera ordini** direttamente. Le righe prendono il prezzo che il listino **di quel fornitore** dà oggi; un articolo che il fornitore non ha a listino nasce senza prezzo, da scrivere nell'ordine.

**Poi, quando la merce arriva:** si apre l'ordine e si scrive quanto è arrivato nella colonna
**Ricevuto** (o si usa **✓ Segna tutto ricevuto**). Il ricevimento **carica il magazzino da solo**:
non serve registrare anche un movimento. Lo stato dell'ordine passa a *Parziale* o a *Evaso*.

> ⚠️ Ne segue una conseguenza da conoscere: **cancellare un ordine già ricevuto toglie la sua
> merce dal magazzino.** È coerente — quel carico esisteva perché esisteva quell'ordine — ma chi
> cancella un ordine vecchio deve saperlo.

### 4.6 Far lavorare fuori

*(→ [cap. 23](#23-ordini-di-lavoro-odl-e-conto-lavoro))*

Le fasi di ciclo affidate a un terzista sono denaro che esce come qualunque acquisto, e hanno il
loro documento: l'**ordine di lavoro** (`ODL-2026-001`).

1. Dal piano, **Genera ordini di lavoro**: un ODL per terzista **e per passata** (se un pezzo
   torna dallo stesso terzista una seconda volta, dopo essere passato altrove, sono due ODL —
   fra le due il pezzo torna da noi).
2. Ogni riga è una **tratta**: le fasi *consecutive* dello stesso terzista stanno insieme
   («fasi 20-30»), col prezzo e i giorni sommati.
3. **Si spedisce il materiale** — dalla riga dell'ODL, il comando di uscita a conto lavoro. Esce
   il materiale scritto nel ciclo della parte, con le quantità proposte in automatico
   (*q.tà del ciclo × pezzi dell'ordine*). Il magazzino **scarica**.
4. **Fra due terzisti** — se il pezzo passa da Beta a Gamma, si registra un **passaggio di
   lavorazione**: cambia il luogo, **la giacenza non si muove**.
5. **Rientrano i pezzi** — all'ultima fase, il rientro da conto lavoro **carica** il pezzo finito.

**Il magazzino si muove in due punti soli**, e sono i due estremi del *ciclo*, non quelli del
documento: esce il materiale alla prima fase esterna, entra il pezzo finito all'ultima. Ogni altro
estremo è un passaggio. Senza questa distinzione, una parte lavorata due volte dallo stesso
terzista farebbe uscire il materiale due volte e caricare il pezzo due volte.

Il campo **Rientrati** sull'ODL significa *pezzi tornati*: porta l'ordine a evaso, **non carica il
magazzino** — quello lo fanno i movimenti di conto lavoro.

In ogni momento, il pulsante **Presso terzi** in Magazzino dice cosa sta fuori e da chi.

### 4.7 Guardare la produzione interna

*(→ [cap. 24](#24-carico-dei-centri-di-lavoro))*

📋 *Pianificazione → **Carico centri***: le ore che i piani aperti chiedono a ciascun centro,
settimana per settimana, contro la capacità dichiarata. Il sovraccarico si vede in rosso, con le
settimane e i centri nominati. Sotto, **i codici da produrre** ordinati per settimana e per ore:
la risposta a «cosa lancio per primo».

### 4.8 Chiudere il giro

- Quando la commessa parte, la si mette **In produzione**: l'app chiede conferma nominando i
  codici ancora mancanti e la data di consegna. **Avvisa, non blocca.**
- Un piano che non serve più si **chiude**: la sua quota di merce impegnata torna libera per gli
  altri piani. Un piano chiuso non sparisce, smette solo di impegnare.
- La commessa finita si mette **Chiusa**.

### 4.9 Il ciclo quotidiano

Ogni mattina si apre il **🏠 Riepilogo**: commesse in ritardo, righe da ordinare che scadono,
ordini confermati oltre la data, richieste senza risposta, articoli sotto scorta o senza prezzo —
e, per l'amministratore, da quanti giorni non si fa un backup. Ogni voce è cliccabile e porta
esattamente dove si risolve.

Ogni tanto — a fine settimana, prima di una riunione — si guarda il **Cruscotto** (*Riepilogo →
Cruscotto*): quanto vale il magazzino, cosa è fermo a scaffale da mesi, quali fornitori sono in
ritardo (→ [cap. 5](#il-cruscotto)).

---

## 5. Riepilogo — «Richiede attenzione»

**A cosa serve.** È la pagina di atterraggio: cosa c'è da fare *adesso*.

**Come ci si arriva.** 🏠 *Riepilogo*. È la vista che si apre al primo accesso.

**Cosa si vede.** Un elenco di segnali ordinati per gravità — **alta**, **media**, **informativa**.
Ogni segnale **nomina i codici e i numeri che lo riguardano** (fino a otto, poi «+N altri in
*sezione*»), spiega il perché nel suggerimento, e ogni voce è cliccabile e porta dove si risolve.

| # | Segnale | Gravità | Dove porta |
|---|---|---|---|
| 1 | Commesse oltre la data di consegna | 🔴 alta | alla commessa |
| 2 | Commesse in produzione con materiale da ordinare | 🔴 alta | alla commessa |
| 3 | Righe di fabbisogno da ordinare, **già oltre la data** | 🔴 alta | al piano |
| 4 | Righe di fabbisogno da ordinare **entro 5 giorni lavorativi** | 🟠 media | al piano |
| 5 | Ordini confermati oltre la data richiesta (ODA e ODL) | 🟠 media | all'ordine |
| 6 | Richieste inviate in attesa di risposta | 🔵 info | alla richiesta |
| 7 | Articoli sotto la scorta minima | 🟠 media | alla scheda articolo |
| 8 | Articoli d'acquisto senza prezzo | 🟠 media | alla scheda articolo |
| 9 | Fasi a costo orario senza ore dichiarate | 🟠 media | al ciclo |
| 10 | Codici articolo duplicati | 🟠 media | a Gestione |
| 11 | Giorni dall'ultimo backup (da 7; 🔴 da 30) — *solo amministratori* | 🟠 media | a Gestione → Backup |
| 12 | Backup automatico in pausa o non riuscito — *solo amministratori, solo con il backup automatico attivo* | 🟠 media | **Riprendi** lo salva subito |
| 13 | Spazio del browser occupato (dal 70%; 🔴 dal 90%) — *solo amministratori*. Con l'archivio in IndexedDB conta lo spazio di tutto il sito, allegati compresi | 🟠 media | a Gestione → Backup |
| 14 | Distinte che usano un articolo fuori produzione con un sostitutivo — *solo con il modulo Alternativi acceso* (→ [cap. 19](#19-fabbisogno-materiali)) | 🟠 media | alla distinta o al ciclo |
| 15 | Macchine generate da un modello che è cambiato dopo la generazione — *solo con il modulo Varianti acceso* (→ [cap. 13](#13-tecnico--gestione-db)) | 🟠 media | alla distinta |

**Tre precisazioni** (dalla 0.105.6):

- **I più gravi in cima.** I segnali escono davvero nell'ordine *alta*, *media*, *informativa*:
  prima l'allarme rosso del backup o dello spazio del browser finiva in fondo, sotto le
  informazioni.
- **Il ritardo di un ordine** (segnale 5) si guarda solo sulle righe **ancora da ricevere**. Un
  ordine parziale non resta più in elenco per una riga confermata in ritardo ma già arrivata: conta
  il ritardo di quello che deve ancora arrivare.
- **Gli articoli obsoleti** non compaiono fra quelli sotto scorta minima o senza prezzo (segnali 7 e
  8): non li riordina nessuno, e una scorta minima rimasta scritta li teneva lì per sempre.

**Il backup che invecchia.** L'archivio esiste solo in questo browser: il segnale 11 conta i
giorni dall'ultimo *Esporta JSON* fatto **da questo browser**, e porta il pulsante **Esporta ora**.
Se non se n'è mai fatto uno, conta dal primo giorno in cui l'app l'ha tenuto d'occhio — una
installazione nuova non parte già in allarme. La data non sta nel database: un backup ripristinato
su un altro PC non porta con sé la data, perché lì il backup non è mai stato fatto. Un backup
automatico (→ [cap. 30](#30-backup-e-manutenzione)) conta come backup e azzera il conteggio.

**Il backup automatico fermo.** Il browser ricorda la cartella dei backup ma non sempre il
permesso di scriverci, e lo può richiedere solo su un tuo clic. Se all'avvio il permesso non c'è,
il segnale 12 lo dice: **Riprendi** riconferma il permesso e salva subito.

**Prezzi da rivedere a listino** (dalla 0.109.0). Sotto il calendario, il riquadro elenca gli
articoli d'acquisto il cui prezzo in uso va rivisto, per uno di due motivi:

- **un altro fornitore quota meno.** Il confronto è con il listino di oggi del fornitore in uso, e
  solo fra fornitori diversi: per ogni fornitore vale la quotazione più recente (→
  [cap. 10](#10-listino-fornitori)). Un fornitore che una volta costava meno non conta più;
- **il prezzo in uso è stato sostituito** da un listino più recente dello stesso fornitore, con un
  prezzo diverso: sotto il prezzo in uso compare *listino nuovo del …* e la colonna del risparmio
  dice *da aggiornare*.

Per ogni articolo il riquadro dice il prezzo in uso e da quale fornitore (o «prezzo scritto a
mano», se non viene da una riga del listino), l'altro fornitore più conveniente con prezzo e data,
e quanto si risparmia **per unità di misura**, anche in percentuale. In cima vanno i risparmi più
grandi in proporzione; oltre otto articoli, il pulsante in fondo porta agli *Articoli d'acquisto*.
Gli articoli obsoleti non compaiono. Non cambia niente da solo: **clicca la riga** per aprire il
listino dell'articolo e scegliere con *Usa* il prezzo da usare; chiuso il listino, il riquadro si
aggiorna. Nel *Fabbisogno* lo stesso confronto è pesato sulle quantità da ordinare (→
[cap. 19](#19-fabbisogno-materiali)).

**Da sapere.** Il Riepilogo è **derivato**: non c'è niente da compilare e niente da spuntare. Un
segnale sparisce quando sparisce la sua causa.

**Il calendario delle scadenze** mette in fila le date di tutti i documenti aperti: consegne delle
commesse, articoli da ordinare, consegne attese da fornitori e terzisti, fine produzione,
promemoria. Dalla 0.89.0 ci sono anche gli **invii al terzista** e i **lanci in produzione** dei
piani aperti, presi dal loro *Programma* (→ [cap. 19](#19-fabbisogno-materiali)). Dalla 0.113.0 un
invio al terzista resta in calendario **finché il materiale non parte**: un ODL emesso, anche
inviato, non basta. Sparisce con **Avvia** sulla riga dell'ODL o sulla fase dell'ordine di
produzione (→ [cap. 23](#23-ordini-di-lavoro-odl-e-conto-lavoro)).

Dalla 0.98.0 compare anche l'**avvio delle fasi** degli ordini di produzione lanciati o in corso:
alla data d'inizio programmata di ogni fase non ancora avviata, «Avviare fase 10 di ODP-…». Le fasi
di una stessa tratta dal terzista partono insieme e sono una voce sola. Una fase che doveva partire
e non è stata avviata finisce fra le **scadute**; appena la si avvia, la voce sparisce.

**I filtri.** Sopra il calendario una fila di pulsanti, uno per tipo di scadenza, ciascuno con il
suo numero: *Commesse* · *Piani e programma* · *Da ordinare* · *Consegne e rientri* · *Richieste* ·
*Avvio fasi ODP* · *Fine produzione* · *Promemoria*. Un clic nasconde quel tipo, un altro lo
rimostra; i filtri valgono per tutto il calendario (scadute, griglia, giorno scelto e prossimi 14
giorni), e una riga dice quante scadenze sono nascoste. **Mostra tutto** riaccende tutto. La scelta
resta in questo browser, per chi la fa: non cambia niente per i colleghi.

### Il cruscotto

**Come ci si arriva.** 🏠 *Riepilogo → Cruscotto* (dalla 0.86.0).

Il Riepilogo dice cosa c'è da fare adesso; il cruscotto dice **come stanno le cose**. Non calcola
niente di nuovo — le cifre sono quelle del magazzino, delle scorte e degli ordini — ma le mette
insieme in una pagina sola. È in sola lettura, per tutti i ruoli.

| Sezione | Cosa mostra |
|---|---|
| **Tessere** | Valore della giacenza, valore fermo, articoli sotto scorta, righe di consegna scadute |
| **Valore per tipo / per famiglia** | Esistente × costo unitario, come la tessera del *Magazzino*; solo le giacenze positive. Dalla 0.105.6 la tessera e il cruscotto contano esattamente le stesse quantità |
| **Articoli fermi** | Con giacenza e nessun movimento da 3, 6 o 12 mesi, dal più costoso: è il denaro immobilizzato a scaffale |
| **Sotto scorta minima** | Quanto manca alla scorta e quanto è già in arrivo; ✓ se l'arrivo basta |
| **Consegne scadute per fornitore** | Righe di ODA e ODL non ancora ricevute oltre la data confermata (o richiesta): quante, quanto valgono, il ritardo peggiore (in giorni lavorativi, «gg lav.», o di calendario: rosso oltre due settimane) e i documenti, cliccabili |

**Da sapere.** I ricevimenti d'ordine non hanno una data propria — il ricevuto è un numero sulla
riga — quindi per gli *articoli fermi* un ricevimento conta con la **data dell'ordine**. Tutto il
cruscotto si esporta in Excel o PDF, un foglio per sezione.

---

# Parte III — Gli archivi

I capitoli di questa parte e delle due successive seguono tutti la stessa griglia:
*A cosa serve* → *Come ci si arriva* → *Cosa si vede* → *Comandi* → *Filtri* → *Finestre* →
*Da sapere*.

## 6. Tecnico → Articoli d'acquisto

**A cosa serve.** L'archivio di **ciò che si compra**: componenti commerciali (cuscinetti, motori,
viteria) e materie prime (barre, lamiere, profilati). La schermata si intitola
**«Commerciali & Materie prime»**.

**Come ci si arriva.** 🌳 *Tecnico → Articoli d'acquisto*.

**Cosa si vede.** L'elenco degli articoli, **200 per volta** (in fondo, *Mostra altri* e
*Mostra tutti*: i cataloghi grandi restano scorrevoli).

**Comandi.** In alto a destra la coppia **Esporta Excel** / **Esporta PDF**.
Nella barra dei filtri, a destra: **Colonne** e **+ Nuovo articolo**.

**Filtri.**

| Filtro | Valori |
|---|---|
| Ricerca | «Cerca codice o nome…» |
| Tipo | Tutti i tipi · Componente commerciale · Materia prima |
| Famiglia | Tutte le famiglie · *(le macrofamiglie definite)* |
| Sottofamiglia | Tutte le sottofamiglie · *(quelle della famiglia scelta)* |
| ★ Solo preferiti | Interruttore: mostra solo gli articoli marcati preferiti |

**Colonne disponibili** (pulsante **Colonne**): Indicatori, **Codice**, **Descrizione**, Tipo, Famiglia,
U.M., Costo unitario, Dettaglio; e, spente finché qualcuno non le accende, Sottofamiglia, Fornitore,
UM acquisto, Fattore conversione, Scorta minima, Lotto, Note, Creato/aggiornato da. Codice e
descrizione non si nascondono: sono l'identità della riga.
La scelta resta anche domani, ed è **separata** da quella di *Progetto* — le due anagrafiche hanno
le stesse colonne ma si guardano per motivi diversi.

**Ordinare l'elenco** (dalla 0.128.0). Un clic sull'**intestazione** di una colonna ordina le righe
per quella colonna, dalla A alla Z o dal più piccolo al più grande; un secondo clic inverte il
verso. La freccia ▲/▼ accanto al titolo dice per quale colonna e in che verso è ordinato. Di serie
l'ordine è per **Codice**. L'ordine è *naturale*: i numeri dentro i codici contano come numeri
(*PRT-2* prima di *PRT-10*) e maiuscole e minuscole non fanno differenza. Le celle vuote (un
fornitore che manca, un lotto non indicato) vanno sempre in fondo. Con l'elenco diviso per famiglia
si ordina dentro ogni famiglia; le famiglie restano in ordine di nome. L'export esce nello stesso
ordine dello schermo. La scelta resta anche domani, separata per *Acquisti* e *Progetto*.

**Da sapere.**

- **★ Preferito** marca gli articoli che si usano spesso, e ha un filtro dedicato.
- **⛔ Obsoleto** marca quelli che non si devono più usare: restano negli archivi e nei documenti
  che li citano, ma si vedono spenti.
- **Fornitore e prezzo non si scrivono qui.** La scheda li mostra in sola lettura e rimanda al
  **listino fornitori** (→ [cap. 10](#10-listino-fornitori)).
- L'export **segue le colonne** (dalla 0.105.6): nel file ci sono le colonne accese con
  **Colonne**, nello stesso ordine dello schermo, e quelle spente restano fuori. **Codice** e
  **Descrizione** ci sono sempre; gli **Indicatori**, che a schermo sono icone, no. Le righe sono
  tutte quelle che passano i filtri: la paginazione a schermo non taglia niente.

---

## 7. Tecnico → Articoli di progetto

**A cosa serve.** L'archivio di **ciò che si costruisce**. La schermata si intitola
**«Macchine, Gruppi & Parti»**.

**Come ci si arriva.** 🌳 *Tecnico → Articoli di progetto*.

**I quattro tipi.**

| Tipo | Etichetta | Che cos'è | Ha una distinta? |
|---|---|---|---|
| **Macchina** | `MAC`, rossa | Il prodotto finito | Sì, l'albero completo |
| **Gruppo** | `GRP`, verde | Un assieme di primo livello | Sì |
| **Sottogruppo** | `SGR`, gialla | Un assieme dentro un gruppo; può contenerne altri, senza limite | Sì |
| **Parte (lavorato)** | `PRT`, viola | Il pezzo che si fa o si compra | Sì: **distinta (materiale) + ciclo** |

L'etichetta colorata accompagna il tipo ovunque compaia: elenchi, ricerche, distinta, scheda
articolo. Gruppo e sottogruppo hanno colori diversi apposta, per non confonderli a colpo d'occhio.

**Comandi.** **Esporta Excel** / **Esporta PDF**; nella barra filtri, **Colonne** e
**+ Nuovo articolo**.

**Filtri.** Ricerca, tipo (i quattro qui sopra), famiglia, sottofamiglia.

**Ordinare l'elenco.** Come negli *Articoli d'acquisto*: un clic sull'intestazione ordina per quella
colonna, un secondo clic inverte (→ [cap. 6](#6-tecnico--articoli-dacquisto)).

**Da sapere — l'approvvigionamento delle parti.** Ogni parte dichiara come si ottiene, e la scelta
cambia due cose insieme:

| Approvvigionamento | Il costo viene da… | Nel fabbisogno… |
|---|---|---|
| **Produzione interna** | distinta della parte + ciclo di lavorazione | l'app **scende dentro** e compra il materiale |
| **Acquisto da fornitore** | il prezzo scelto a listino | la parte è una **foglia d'acquisto**, la distinta non si esplode |

Le parti **nuove** nascono con l'impostazione predefinita (*Gestione → Codifica articoli →
Approvvigionamento parte*; di serie: *Acquisto da fornitore*). Cambiare quell'impostazione vale
**solo per le prossime**: le parti già a catalogo restano come sono, perché cambiare
retroattivamente riscriverebbe il fabbisogno di lavori già avviati.

Una parte a *Produzione interna* **senza righe di ciclo** vale il prezzo a listino: non si finge
un costo che non c'è.

---

## 8. La scheda articolo, campo per campo

**Come ci si arriva.** **+ Nuovo articolo** in una delle due anagrafiche, oppure il comando
*Modifica articolo* su una riga esistente.

### I campi

| Campo | Quando serve | Note |
|---|---|---|
| **Parti da** | solo in creazione | Ricerca live: si sceglie un articolo esistente e la scheda si precompila con i suoi dati. Facoltativo. |
| **Tipo** | sempre | **Bloccato in modifica**: un commerciale non diventa una parte. |
| **Codice** | sempre | Composto automaticamente e in sola lettura (→ [cap. 9](#9-i-codici-automatici)). Per scriverlo a mano si spunta **Manuale** e si conferma con **Sì**; il **motivo** è facoltativo. |
| **Descrizione** | tutti i tipi tranne le parti | Testo libero. |
| **Concetto** + **Descrizione** | **solo parti** | Il nome di una parte è composto: `ALBERO` + `motore 20×100` → `ALBERO motore 20×100`. Il concetto è **obbligatorio** e si sceglie dall'elenco di *Gestione → Concetti*. Sotto i due campi c'è l'anteprima del nome che ne esce. |
| **Unità di misura** | sempre | Dall'elenco di *Gestione → Unità di misura*. |
| **Approvvigionamento** | solo parti | *Produzione interna* / *Acquisto da fornitore* (→ [cap. 7](#7-tecnico--articoli-di-progetto)). |
| **Fornitore e prezzo d'acquisto** | — | **Riquadro in sola lettura.** Mostra la quotazione in uso; il pulsante accanto apre il **listino**. |
| **Macrofamiglia** / **Sottofamiglia** | consigliato | Servono ai filtri, ai raggruppamenti e ai codici automatici. |
| **Macchina di appartenenza** / **Gruppo** / **Sigla** | codifica gerarchica | Dicono dove sta l'articolo nella struttura di prodotto, e da lì nasce il suo codice. |
| **Distinta e ciclo** | solo parti | Non si compilano qui: la distinta in *Gestione DB*, il ciclo con il pulsante **Apri il ciclo**. |
| **★ Preferito** | facoltativo | Ha un filtro dedicato nelle anagrafiche. |
| **⛔ Obsoleto** | facoltativo | Non più utilizzabile; resta visibile, spento. |
| **U.M. d'acquisto (se diversa)** + **Fattore di conversione** | quando si compra in un'unità e si usa in un'altra | Si compra la barra a pezzi da 6 m e la si consuma a metri. |
| **Scorta minima** | magazzino | Sotto questa quantità l'articolo compare fra i segnali del Riepilogo, e il netto la ricostituisce. |
| **Lotto di riordino** | magazzino | La quantità a cui si arrotondano gli acquisti. |
| **Il lotto è** | magazzino | *un multiplo esatto* (si ordina 100, 200, 300) oppure *una quantità minima* (sotto 100 non si ordina, sopra si ordina il fabbisogno esatto). |
| **Note** | facoltativo | Testo libero interno. |

In modifica, la scheda mostra anche un **pannello giacenza** con la situazione a magazzino, e in
fondo la **riga autore**: chi ha creato il record e chi l'ha aggiornato per ultimo, con data e ora.

### Le finestre che si aprono da qui

| Finestra | Cosa fa |
|---|---|
| **Listino fornitori** | Le quotazioni dell'articolo (→ [cap. 10](#10-listino-fornitori)) |
| **Dove è usato** | Chi lo contiene, con simulazione del costo (→ [cap. 11](#11-dove-è-usato-e-simulazione-del-costo)) |
| **Scheda completa** | La scheda di sola lettura, tutto insieme |
| **Duplica** | Crea un nuovo articolo copiando questo |

### Allegati: i documenti dell'articolo

Disegni, schede tecniche e cataloghi in PDF si appendono a un articolo dal pulsante 📁
**Allegati** sulla riga di catalogo, o dal pannello laterale (Ctrl+I), che ne mostra il numero.
Accanto c'è il pulsante **apri documento**: apre il PDF in una scheda nuova, e se i documenti
sono più di uno apre l'elenco invece di indovinare quale serva.

**I PDF non stanno dentro Bomtrack.** Stanno in una **cartella d'archivio**, e l'app ne memorizza
soltanto il percorso. La cartella può essere sul PC oppure essere quella locale di un servizio
sincronizzato (OneDrive, Dropbox): in quel caso i documenti sono già su tutte le macchine, senza
che Bomtrack sincronizzi niente. Il vantaggio si vede in tre punti: il backup JSON porta davvero i
collegamenti, lo stesso catalogo non viene copiato per ogni codice che lo cita, e un disegno
aggiornato nella cartella è aggiornato anche in Bomtrack, senza riallegare niente.

**La cartella la sceglie ogni PC, una volta.** Non sta nel database di proposito: ogni macchina ha
il suo archivio, e scriverlo nel database imporrebbe a tutti la lettera di unità di chi l'ha
configurato per primo. Si sceglie con la finestra di sistema, dalla scheda Allegati o da
*Gestione → Backup*, e il browser se la ricorda. Può chiedere una conferma del permesso alla
prima apertura di giornata: è normale, e si concede con un click.

> ⚠️ **Serve Chrome o Edge**, e Bomtrack va aperta dal suo indirizzo. Aprendo `index.html`
> con un doppio click il browser non ha nessuna origine sotto cui ricordare un permesso, e
> l'archivio non è disponibile: la scheda lo dice in chiaro, e lì resta il vecchio caricamento
> del file dentro l'app.

**Un documento vale per più codici.** È il caso normale dei commerciali: lo stesso catalogo
appeso a tutti gli articoli di una serie. Il documento è censito una volta sola e i codici ci si
*collegano*, con queste conseguenze:

- la **descrizione** appartiene al documento — `SKF-CAT-RS4412-IT-rev3.pdf` non dice niente a
  nessuno, e la descrizione è ciò che si legge nella scheda; riscriverla da un codice la
  corregge per tutti;
- la **pagina** appartiene invece al singolo collegamento: un catalogo di trecento pagine si apre
  dove serve a *quel* codice;
- **scollegare** toglie il documento da un codice. Se altri codici lo citano, il file resta in
  archivio e resta allegato a loro; se era **l'ultimo codice**, il documento si cancella davvero,
  dall'elenco e **dalla cartella d'archivio** (dalla 0.112.0), e l'avviso lo dice prima. Senza
  cartella impostata su quel PC il PDF non si può cancellare: il documento resta in *Gestione →
  Backup*, senza codici, e da lì si elimina — eliminarlo cancella anche il file. Un documento citato
  da almeno un codice non si elimina;
- se il PDF viene **rinominato o spostato**, si corregge in un punto solo con **Ricollega**
  (*Gestione → Backup*), e tutti i codici che lo citavano seguono.

**Quando qualcosa non va, il messaggio dice quale delle tre cose è successa:**

| Messaggio | Cosa vuol dire | Che fare |
|---|---|---|
| **NESSUN DOCUMENTO SALVATO** | A quel codice non è ancora collegato niente | Collegare un documento |
| **Archivio allegati non impostato su questo PC** | Il documento c'è, ma questa macchina non sa dove cercarlo | Scegliere la cartella (il pulsante è lì) |
| **DOCUMENTO NON TROVATO** | Il file non è più in quella cartella: rinominato, spostato, o non ancora sincronizzato | Verificare l'archivio e **Ricollega**; se è il cloud, aspettare la sincronizzazione |

**Un PDF che sta fuori dall'archivio non si può collegare**: sul desktop di chi lo sceglie esiste,
sugli altri PC no. Il pannello lo dice e offre di **copiarlo nell'archivio**, senza mai
sovrascrivere un file che ha già quel nome.

**La verifica.** In *Gestione → Backup*, **Verifica archivio** scorre la cartella e nomina i
documenti che non ci sono più: una volta per documento, non una per collegamento. Serve perché
un collegamento rotto è l'unico difetto di questo modo di lavorare che non si annuncia da sé —
lo si scoprirebbe il giorno che qualcuno prova ad aprire il disegno.

**I documenti emessi** (dalla 0.112.0) stanno nella stessa cartella, sotto `Documenti Bomtrack`:
sono le copie PDF di richieste, ordini e ordini di lavoro inviati (→
[cap. 28](#28-export-di-elenchi-e-documenti)). Non compaiono fra i PDF da collegare a un codice, e
la verifica controlla anche loro.

**Gli allegati caricati dentro l'app** prima della versione 0.78.0 restano dove sono e continuano
a funzionare, in una sezione separata della scheda. Di quelli il backup JSON porta l'elenco e non
il contenuto: prima di trasferire i dati su un altro PC vanno riscaricati a mano.

**Con l'archivio condiviso** (dalla 0.105.6 lo si dice chiaro). L'archivio condiviso porta ai
colleghi l'**elenco** degli allegati, non i file. Un file caricato dentro l'app resta nel browser
di **questo PC**: per questo il pulsante si chiama **+ Carica file solo su questo PC** e, accanto,
un avviso in arancio dice che i colleghi vedranno l'allegato nell'elenco ma non potranno aprirlo.
Per condividere un disegno si usa la cartella d'archivio comune, da Chrome o Edge. E chi apre un
allegato che sul suo PC non c'è legge che **il file è stato caricato su un altro PC**, e da chi:
è a lui che va chiesto, o va messo nella cartella d'archivio.

---

## 9. I codici automatici

Bomtrack compone il codice di ogni nuovo articolo dalle scelte della scheda: famiglia, macchina,
gruppo, sigla. Di regola il codice resta quello.

### Il codice scritto a mano (dalla 0.115.0)

Il campo **Codice** si legge soltanto, e cambia da solo man mano che si compilano le scelte. Per
scriverlo a mano si spunta **Manuale** accanto al campo: l'app chiede *«Vuoi modificare
manualmente il codice?»* e il campo si apre solo con **Sì**. Con **No** non cambia niente: un
codice non si modifica più per un tasto premuto per sbaglio.

Quando la spunta è attiva compare il campo **Motivo del codice manuale**, facoltativo (es. «sigla
commerciale della macchina»). L'articolo ricorda la scelta, con chi l'ha fatta e quando. In
catalogo, accanto al codice, c'è l'etichetta **MANUALE** (il motivo si legge passandoci sopra), e la
scheda di sola lettura lo riporta per esteso.

Togliendo la spunta l'app chiede *«Ripristinare il codice automatico?»*: con **Sì** il codice torna
quello composto dalle scelte. Su un articolo già usato in una distinta, in un ciclo o in un
documento il codice è bloccato, spunta compresa, come prima.

I **codici figli nascono dalla sigla**, non dal codice del padre: una macchina di sigla `MAX` con
codice manuale `RTT-S00` ha i gruppi `MAX-…-S00`.

**I codici fuori codifica già in archivio.** In *Gestione → Backup → Controllo dati* l'elenco
*codici fuori codifica* mostra gli articoli il cui codice non è quello che le scelte comporrebbero
e che nessuno ha segnato come manuale: scritti a mano prima della 0.115.0, o arrivati da un import.
Per ciascuno **È voluto** lo segna come codice manuale; **Apri** porta alla scheda, dove, se
l'articolo non è ancora usato, **Usa il codice automatico** lo rimette in codifica.

Gli schemi sono due.

### Schema gerarchico — la struttura di prodotto

Si usa per macchine, gruppi, sottogruppi e parti che appartengono a una macchina. Ogni macchina ha
una **sigla** e definisce lo schema dei codici sotto di sé.

```
Macchina:      TRN-S00        progressivo a SALIRE da 0
Gruppo:        TRN-BAS-S00    progressivo a SALIRE da 0
Sottogruppo:   TRN-BAS-999    a SCENDERE da 999
Parte:         TRN-BAS-001    a SALIRE da 001
```

Sottogruppi e parti condividono lo stesso spazio di numerazione ma partono dai due estremi: i
sottogruppi scendono da 999, le parti salgono da 001. Così non si scontrano mai, e a colpo d'occhio
si distinguono.

Le **sigle sono univoche** nel loro ambito: due gruppi della stessa macchina non possono chiamarsi
entrambi `BAS`.

**Anteprima codici** (dalla 0.115.0). Nella scheda di una macchina o di un gruppo, sotto la
codifica, un riquadro mostra mentre si compila che codici avranno i figli:

- per una **macchina**, lo schema con la sigla e le cifre scelte: `TRN-S00`, gruppo `TRN-AAA-S00`
  (dove `AAA` sta per la sigla del gruppo, con il numero e il tipo di caratteri impostati), parte
  `TRN-AAA-001`, sottogruppo `TRN-AAA-999`;
- per un **gruppo**, i codici veri: la prima parte libera e il primo sottogruppo libero, contando
  quelli che ci sono già sotto la stessa sigla; in modifica anche quanti figli ha già.

Il riquadro avvisa quando il codice della macchina è manuale (i figli seguono la sigla, non il
codice) e quando si cambia la sigla di un padre che ha già dei figli: i loro codici restano com'erano,
solo i nuovi useranno la sigla nuova.

### Schema per famiglia — quello che si compra

Si usa per materie prime, commerciali, e per le parti non legate a una macchina.

```
MAT-ACC-LAM-001     materia prima · famiglia ACC(iaio) · sottofamiglia LAM(iere)
CMM-MEC-CUS-001     commerciale   · famiglia MEC(canica) · sottofamiglia CUS(cinetti)
PRT-…               parte non legata a una macchina
```

I **prefissi** e il **numero di cifre** si cambiano in *Gestione → Codifica
articoli*: di serie `CMM` per i commerciali, `MAT` per le materie prime, `PRT` per le
parti, con 3 cifre.

**Maiuscole e spazi non contano** (dalla 0.105.6). Per trovare il prossimo numero libero l'app
guarda anche i codici scritti in minuscolo o con uno spazio ai bordi, come fa il controllo dei
codici doppi. Prima un `mat-acc-002` arrivato da un Excel non contava per la serie `MAT-ACC-`:
l'app proponeva `MAT-ACC-002`, e il controllo dei doppioni lo rifiutava subito come già usato.

---

## 10. Listino fornitori

**A cosa serve.** È **l'unico posto dove nasce un prezzo d'acquisto**. Non si scrive un prezzo
nella scheda articolo: si registra una **quotazione** nel listino, e poi si sceglie quale delle
quotazioni è quella in uso.

**Come ci si arriva.** Il listino di un articolo si apre dal pulsante nel riquadro *Fornitore e
prezzo d'acquisto* della scheda articolo, dal pannello laterale (*Listino fornitori*), o dalla
scheda di sola lettura. **Tutte le quotazioni insieme** stanno in 🛒 *Acquisti → Listino
fornitori* (dalla 0.91.0).

**La vista d'insieme.** Una quotazione per riga, di tutti i commerciali, le materie prime e le
parti: articolo, fornitore, codice presso il fornitore, prezzo, quantità minima, giorni di
consegna, data e origine. ✓ segna il prezzo in uso nella costificazione, ↓ la quotazione valida più
bassa dell'articolo, *storico* le quotazioni sostituite da una più recente dello stesso fornitore.
Si filtra per **testo** (articolo, fornitore o codice fornitore), **fornitore**, **tipo** e per
*solo i prezzi in uso*, *senza lo storico* o *senza prezzo*; l'elenco filtrato si esporta in Excel e
PDF. Serve a rispondere a domande come «cosa mi quota questo fornitore?» o «quali prezzi sono
vecchi?». Un clic sulla riga apre il listino dell'articolo, che resta **l'unico posto dove una
quotazione si modifica** e si mette in uso.

**Cosa si vede.** Le quotazioni dell'articolo, una per riga:

| Campo | Significato |
|---|---|
| **Fornitore** | Chi la offre |
| **Codice presso il fornitore** | Come lo chiama lui: serve a scriverlo giusto sull'ordine |
| **Descrizione presso il fornitore** | Idem |
| **Prezzo** | L'importo |
| **U.M. del prezzo** | A che unità si riferisce |
| **Q.tà minima** | Sotto la quale il prezzo non vale |
| **Giorni di consegna** | Il lead time dichiarato, in giorni lavorativi (o di calendario, se così impostato nel calendario di fabbrica) |
| **Data** | Quando la quotazione è stata raccolta |

**Da sapere.**

- **Vale per tutto**: commerciali, materie prime **e parti** acquistate.
- **Le richieste di offerta alimentano il listino**: il pulsante **Registra a listino** di una RFQ
  trasforma i prezzi tornati in quotazioni, con il riferimento alla richiesta da cui vengono. Se
  dopo averli registrati correggi un prezzo sulla richiesta, il pulsante torna attivo e la
  quotazione si **aggiorna** (non se ne aggiunge un'altra); se è quella in uso, il costo la segue.
- **Il prezzo che entra nella costificazione si sceglie esplicitamente.** Quotazioni di fornitori
  diversi possono convivere; una sola è quella in uso. Il Riepilogo segnala gli articoli per cui un
  altro fornitore quota meno.
- **Un fornitore ha un solo prezzo valido: il più recente** (dalla 0.109.0). Quando lo stesso
  fornitore ha più quotazioni, vale quella con la data più recente; le precedenti finiscono nello
  **Storico**, in fondo al listino dell'articolo, chiuso. Lì restano in sola lettura (si possono
  solo eliminare), non entrano nei confronti (la ↓, il risparmio del Riepilogo e del Fabbisogno) e
  non si possono più mettere in uso. Una riga nuova ancora **senza prezzo** non sostituisce
  niente: conta solo quando ha un prezzo.
- **Il prezzo in uso sostituito.** Se l'articolo usa ancora una quotazione che è stata sostituita,
  il listino lo dice in un riquadro arancione con il prezzo nuovo e il pulsante **✓ Usa la
  nuova**; finché non lo si preme il costo non cambia. Lo stesso avviso compare nel Riepilogo e
  nella scheda di sola lettura dell'articolo.
- Un articolo senza nessuna quotazione compare fra i segnali «articoli d'acquisto senza prezzo».

---

## 11. Dove è usato e simulazione del costo

**A cosa serve.** Rispondere a due domande: «se cambio questo articolo, chi ne risente?» e
«se questo prezzo cambiasse, quanto costerebbe la macchina?».

**Come ci si arriva.** Dal pannello laterale (*Dove è usato e impatto costi*), dalla scheda
articolo, o dalla scheda di sola lettura.

**Cosa si vede.** L'elenco degli assiemi che contengono l'articolo, e sopra di quelli le
**macchine impattate**, con il costo attuale di ciascuna.

**La simulazione.** Il campo **Simula un costo diverso**: si scrive un prezzo e si vede subito
l'effetto sul costo delle macchine, riga per riga.

> **Non salva niente.** Chiudendo la finestra il costo simulato sparisce e l'articolo resta al suo
> prezzo. È esattamente il motivo per cui si può aprire in mezzo a qualunque lavoro.

---

## 12. Pannello laterale e selezione multipla

**A cosa serve.** Tenere sotto mano i comandi e le schede dell'articolo scelto nell'elenco, senza
aprire e chiudere finestre.

**Come ci si arriva.** `Ctrl+I` (⌘I), oppure il comando nell'intestazione dell'elenco.
Vale per **Acquisti, Progetto e Magazzino**.

**Cosa si vede.** Una colonna a destra, **ridimensionabile trascinandone il bordo**, con un
riepilogo dell'articolo scelto (costo, giacenza, impieghi) e sotto i comandi e le schede.

**I comandi — su un articolo (Acquisti, Progetto):**

- Modifica articolo · Duplica · Listino fornitori · **Ciclo di lavorazione** (solo parti) ·
  Dove è usato e impatto costi · Scheda completa · Elimina articolo.

**I comandi — su una giacenza (Magazzino):**

- Rettifica giacenza · Movimenti (N) · Dove è usato e impatto costi · Modifica articolo ·
  Scheda completa.

**Le schede:** **Scheda** (l'anagrafica) · **Listino** · **Dove è usato** · **Storico** (chi ha
cambiato cosa su questo articolo, e da quale valore a quale → [cap. 30](#30-backup-e-manutenzione)).

**La selezione multipla.**

| Gesto | Effetto |
|---|---|
| Click | Sceglie una riga |
| **Ctrl+click** | Aggiunge una riga alla scelta |
| **Maiusc+click** | Prende tutto quello che sta in mezzo |
| **↑ ↓** | Scorre le righe |
| **Maiusc+↑ ↓** | Estende la scelta |
| **Invio** | Apre la scheda completa |
| **Esc** | Deseleziona |

Con **più righe scelte** il pannello passa alle **azioni di massa**, e mostra l'elenco di ciò su
cui sta per agire:

- *Segna come non più utilizzabili* / *Rendi di nuovo utilizzabili*
- *Segna preferiti (N)* / *Togli dai preferiti*
- Esporta la selezione in **Excel** o **PDF**
- **Etichette QR della selezione** (→ [cap. 17](#17-magazzino), *Le etichette QR*)
- *Elimina N articoli*

**Da sapere.** Con il pannello aperto **la colonna dei pulsanti sparisce dall'elenco**: i suoi
comandi sono nel pannello, scritti per esteso invece che a icone. Chiudendolo torna dov'era.
Larghezza, apertura e scheda scelta restano fra una sessione e l'altra.

---

# Parte IV — Il prodotto

## 13. Tecnico → Gestione DB

**A cosa serve.** Costruire l'albero della macchina: cosa contiene, in che quantità, con quali
lavorazioni. La schermata si intitola **«Distinta Base & Costificazione»**. Dalla 0.125.0 si
apre anche la distinta di una **parte**: il materiale che serve per farla (→ *La distinta di una
parte*, sotto).

**Come ci si arriva.** 🌳 *Tecnico → Gestione DB*.

**Cosa si vede.**

- In alto la **barra revisioni**: il badge `Rev. X · N rilasciate`, **Nuova revisione**,
  **Storico revisioni** (→ [cap. 15](#15-revisioni)).
- Le **card di costo** unitario: Materiale · Commerciali · Parti · Lavorazioni · Spese generali ·
  **Costo totale** · **Prezzo vendita**.
- L'**albero** multi-livello, con la **numerazione di posizione**: `1`, `1.1`, `1.1.1`, `1.2`,
  `2`… Colonne: Articolo, Q.tà, U.M., Costo un., **Scarto %**, Costo riga, Azioni.

**Comandi.**

| Comando | Cosa fa |
|---|---|
| **Modifica testata** | Le proprietà della distinta (vedi sotto) |
| **Elimina** | Cancella la distinta |
| **+ Aggiungi componenti** | Apre il pannello laterale ridimensionabile per pescare dagli archivi. Un articolo già in distinta non fa una seconda riga: la quantità inserita si somma a quella che c'è (dalla 0.105.7) |
| **⊞ Espandi tutto** / **⊟ Comprimi tutto** | Apre e chiude tutti i rami |
| **⇄ Confronta con…** *(barra revisioni)* | Mette la distinta a fianco di un'altra qualsiasi, su tutti i livelli (→ [cap. 15](#confrontare-due-distinte-diverse)) |

**Il ciclo di montaggio.** Sotto l'albero la riga *Ciclo di montaggio* (di una parte: *Ciclo di
lavorazione*) elenca le fasi, con ore, operatori e costo, in sola lettura; **Apri ciclo** porta
ai *Cicli di lavorazione*, dove le fasi si scrivono (dalla 0.124.0, → [cap.
14](#il-ciclo-di-un-assieme-dalla-01240)).

**Filtri** (dalla 0.125.0 gli stessi dei *Cicli di lavorazione*). Ricerca «Cerca codice o nome
distinta…»; **tipo** (Macchine · Gruppi · Sottogruppi · Parti); **famiglia** e **sottofamiglia**
(delle parti: gli assiemi non ne hanno); **macchina** e **gruppo** di appartenenza; il menu della
distinta aperta, con le parti in un gruppo a sé; il contatore. Famiglia, sottofamiglia, macchina e
gruppo sono condivisi con le altre viste che li hanno.

### La distinta di una parte (dalla 0.125.0)

Il materiale e i commerciali che servono a fare il pezzo stanno nella distinta della parte, come i
componenti di un assieme: **distinta = cosa serve, ciclo = come si fa**, per parti, gruppi e
macchine. Si apre dal menu (gruppo *Parti*), dal pulsante **Distinta** nei *Cicli di
lavorazione*, o espandendo la parte nell'albero di un gruppo, dove si vedono la sua distinta e le
sue fasi.

- **+ Aggiungi componenti** propone solo **materie prime e commerciali**: una parte non contiene
  assiemi né altre parti.
- Ogni riga ha **quantità** e **scarto %** come quelle degli assiemi; lo scarto entra nel costo,
  nel fabbisogno e nel materiale dell'ordine di produzione.
- In più c'è il **costo riga forzato**: il costo della riga intera al posto di quello calcolato
  (vuoto = calcolato). Nell'albero la riga forzata ha un asterisco. Inserendo un articolo che è già
  in distinta la quantità si somma, ma non su una riga forzata: lì nasce una riga nuova.
- Una parte **acquistata** ha la distinta documentale: non entra né nel costo né nel fabbisogno, e
  la vista lo dice in testa.
- Fino alla 0.124 il materiale si scriveva nella sezione *Distinta parte* del ciclo. All'avvio
  l'app lo sposta nella distinta, nello stesso ordine e con lo stesso costo.

> **La distinta aperta resta sempre raggiungibile**, anche quando il filtro la escluderebbe: non
> sparisce sotto le mani mentre ci si lavora.

**La finestra «Modifica testata».**

| Campo | Note |
|---|---|
| Codice · U.M. · Descrizione | **Bloccati**: si modificano in 🌳 *Tecnico → Articoli di progetto* |
| **Spese generali % (override)** | Sostituisce la percentuale globale, solo per questa macchina. Non c'è per una parte: le spese generali si applicano agli assiemi |
| **Margine % (override)** | Idem |
| Note | Testo libero |

**Da sapere.**

- I sottogruppi possono contenere altri sottogruppi, **senza limite di profondità**.
- La **percentuale di scarto** di una riga aumenta la quantità che serve davvero: 10 pezzi con
  5% di scarto sono 10,5 pezzi di materiale.
- I **giorni di montaggio** (quelli che la programmazione a ritroso del fabbisogno toglie dalla
  data in cui l'assieme serve) vengono **sempre dalle fasi** del ciclo dell'assieme: ore ÷ (ore al
  giorno × operatori), più attrezzaggio e coda di ogni fase. Dalla 0.124.0 non si dichiarano più a mano.
- I **riferimenti ciclici** (A contiene B che contiene A) sono rilevati e impediti, sia nella
  distinta sia nel ciclo. Se ne resta uno, un **avviso rosso** nomina l'articolo coinvolto invece
  di far comparire un costo tronco che sembrerebbe buono. **⊞ Espandi tutto** si ferma
  sull'anello invece di bloccarsi, anche quando l'anello sta più in basso della radice (dalla
  0.105.6).
- **Un anello arrivato da un collega** (dalla 0.105.6). Con l'archivio condiviso un anello può
  nascere senza che nessuno lo veda: io metto S2 dentro S1, un collega nello stesso momento mette
  S1 dentro S2, e ciascuno dei due PC, controllando il proprio archivio, non trova niente di male.
  Per questo, dopo ogni ricezione dal server e alla riapertura dell'app, Bomtrack cerca gli anelli
  in tutte le distinte e, se ne trova, lo dice con un **avviso in basso che resta**: «**Distinta ad
  anello**», con i codici del giro (`S1 → S2 → S1`) e il pulsante **Apri distinta**. Costi e
  fabbisogni di quel ramo sono incompleti finché non si toglie una delle righe; tolta la riga,
  l'avviso sparisce da solo.

### Varianti e configuratore (modulo, dalla 0.119.0)

Il modulo si accende in *Gestione → Aree e moduli*. Serve quando la stessa macchina si
vende in più versioni: lunghezza 3, 4 o 5 m, motore standard o maggiorato. Invece di tenere a mano
una distinta per combinazione, se ne tiene una sola, il **modello**, e il configuratore genera la
macchina di ogni combinazione.

**Tutto in una pagina: *Tecnico → Varianti*** (dalla 0.120.0). La voce compare solo con il modulo
acceso. In alto si sceglie il modello; sotto ci sono quattro sezioni, nell'ordine in cui si
lavora: **Opzioni**, **Regole**, **Configura**, **Varianti generate**. Fuori da questa pagina non
ci sono comandi delle varianti: Gestione DB e Riepilogo mostrano solo dei segni, con un link qui.

**Come si riconoscono fuori dalla pagina** (dalla 0.129.0). Accanto al codice, negli elenchi degli
articoli, nei selettori e nel titolo della scheda, un modello porta l'etichetta **modello** e una
macchina generata **variante di** seguito dal codice del suo modello. Negli elenchi l'etichetta è un
link alla pagina Varianti; nei menu a tendina diventa `[modello]` o `[variante di …]` davanti al
codice. La scheda di sola lettura ha anche la riga **Varianti**: per un modello dice quante macchine
ne sono nate, per una generata da quale modello e con quali scelte, e se va rigenerata. Una macchina
a cui si tolgono tutte le opzioni perde l'etichetta. Con il modulo spento non compare niente.

**Fino ai gruppi del primo livello.** Le scelte decidono **quali gruppi entrano nella macchina, e
quanti**. Ogni gruppo resta un articolo normale e fisso: se il telaio da 3 m e quello da 4 m sono
diversi, sono due gruppi, e il modello prende l'uno con `L=3` e l'altro con `L=4`. Dentro i gruppi
non ci sono regole, e la macchina generata usa i gruppi del modello così come sono, senza copie.

**Nuovo modello.** Il pulsante **+ Nuovo modello** chiede una macchina già in archivio: la sua
distinta resta com'è, e la macchina diventa modello con la prima opzione. Per tornare indietro si
toglie l'ultima opzione.

**Opzioni.** Ogni opzione ha un **codice** breve (`L`, `M`), un nome e le sue **scelte**, ognuna
in due campi: il **valore** (`3`), che è quello che le regole citano, e l'**etichetta**
(`3 metri`), che si legge nel configuratore e nel nome della macchina generata. Le opzioni stanno due per riga; un clic sul titolo **Opzioni** richiude la sezione, che allora le riassume in una riga.

**Regole.** La tabella elenca le righe della distinta del modello, cioè i gruppi del primo
livello, con due campi per riga. Una riga con i campi vuoti vale sempre.

| Campo | Esempio | Cosa fa |
|---|---|---|
| **Vale solo se** | `M=B` · `L=4\|5` · `L=5 & M!=S` | La riga conta solo con queste scelte. `\|` vuol dire «oppure», `&` «e», `!=` «diverso da» |
| **Quantità da formula** | `L` · `L*2` · `L+1` · `M(S=2; B=3)` | Quanti gruppi entrano, calcolato dalla scelta. Si usano numeri, `+ - * /`, parentesi e i codici delle opzioni con valore numerico. Per un'opzione a lettere, o per quantità che non seguono un conto, c'è la **tabella per scelta**: `M(S=2; B=3)` vale 2 con S e 3 con B, e una scelta non scritta vale 0 |

Il pulsante **Esempi** della sezione apre una finestra con esempi pratici delle due colonne. Un codice di opzione che il modello non ha, o una regola scritta male, si rifiuta subito. I gruppi
si aggiungono e si tolgono in *Gestione DB*, come in ogni distinta: la pagina ha il link. In
distinta le righe con una regola si riconoscono dal segno `se M=B` o `q.tà = L` accanto al nome.

**Configura.** Si sceglie un valore per ogni opzione, e l'anteprima dice cosa nascerà: la
**macchina** con codice `<codice del modello>-V01`, `-V02`…, il nome del modello seguito dalle
scelte, il costo e i gruppi che conterrà. Sopra c'è l'intervallo di costo **da quanto a quanto**
su tutte le combinazioni, fino a 256. **Genera la macchina** la crea; se la combinazione esiste
già, il pulsante diventa **Apri la macchina**.

**Varianti generate.** Le macchine nate da questo modello, con le scelte, il costo e lo stato:
*aggiornata* oppure *modello cambiato*.

**Un'opzione aggiunta dopo** (dalla 0.130.0). Le macchine già generate non hanno una scelta per
la nuova opzione: nella loro riga compare un menu (*Protezione: scegli…*) e la scelta si dà
**macchina per macchina**. Finché manca, **Rigenera** resta spento e **Rigenera tutte** salta quella
macchina. Data la scelta, Rigenera riscrive la distinta con le scelte complete: codice, piani e
movimenti restano gli stessi, e la descrizione si aggiorna con la nuova scelta (se è ancora quella
data alla generazione; una descrizione scritta a mano resta). Una scelta che renderebbe la macchina
uguale a un'altra già generata si rifiuta. Se invece si **toglie** un'opzione dal modello, la
macchina perde quella scelta al Rigenera.

**La macchina generata è una macchina come le altre.** Si mette in un piano, si costifica, si
revisiona. In Gestione DB una riga sopra l'albero dice da quale modello è nata.

**La codifica è quella del modello.** La macchina generata eredita macrofamiglia, sottofamiglia,
sigla macchina e schema dei codici dei figli. Nella sua scheda codice e codifica sono bloccati: si
cambiano sul modello, e salvando il modello le varianti lo seguono. Una variante non conta come
un'altra macchina con la stessa sigla e non ha gruppi suoi: i gruppi stanno sul modello.

**Il modello non si mette in un piano.** Aggiungerlo a un piano viene rifiutato con un avviso; un
piano che ne contiene già uno lo segnala con *modello da configurare*. Il **costo** del modello
nelle card e in Gestione DB è quello della **parte comune**, cioè delle righe senza regole.

**Quando il modello cambia.** Ogni macchina generata ricorda com'era il modello quando è nata. Se
poi cambiano le opzioni o le righe del modello, la macchina risulta *modello cambiato*, il
Riepilogo la segnala (segnale 15) e nella pagina c'è **Rigenera**, o **Rigenera tutte** quando
sono più d'una. Rigenera riscrive la distinta della macchina con le stesse scelte, sul modello di
adesso: il codice resta lo stesso, così piani e movimenti non cambiano. Per tenere traccia della
distinta di prima, rilascia una revisione prima di rigenerare. Un gruppo che cambia dentro non
chiede di rigenerare: è lo stesso articolo, e la modifica arriva già.

**Condizioni fuori posto.** Con la 0.119 le regole si potevano scrivere anche dentro i gruppi.
Dalla 0.120 lì non valgono più e le righe contano sempre: la pagina elenca gli assiemi che ne
hanno ancora, con il pulsante **Togli le condizioni**.

> **A modulo spento** le regole contano come righe normali e le opzioni restano scritte, senza che
> nessuno le legga. Riaccendendo il modulo tutto torna com'era.

---

## 14. Cicli di lavorazione

**A cosa serve.** Dire come si fa una **parte**: quali fasi attraversa. Il materiale che consuma
sta nella sua **distinta** (dalla 0.125.0, → [cap. 13](#13-tecnico--gestione-db)). È da qui che
nascono le lavorazioni nel costo di una parte a produzione interna, il carico dei centri e gli
ordini di lavoro ai terzisti. Dalla 0.124.0 anche **macchine, gruppi e sottogruppi** hanno qui il loro
ciclo, con le sole fasi di montaggio (→ [Il ciclo di un assieme](#il-ciclo-di-un-assieme-dalla-01240)).

**Come ci si arriva.** 🌳 *Tecnico → Cicli di lavorazione*.

**Cosa si vede.**

- I filtri e il **menu di scelta della parte**;
- la **barra revisioni** della parte;
- le card: *Distinta* · *Lavorazioni* · *Costo unitario a mano* · **Costo parte**;
- una nota in testa che dice **da dove viene il costo** di quella parte, secondo il suo
  approvvigionamento, quante righe ha la sua distinta, e il pulsante **Distinta** che la apre;
- la sezione **Ciclo di lavorazione**.

**Filtri** (dalla 0.125.0 gli stessi di *Gestione DB*). Ricerca; **tipo** (Macchine · Gruppi ·
Sottogruppi · Parti); **famiglia** e **sottofamiglia** delle parti; **macchina** e **gruppo** di
appartenenza; il menu della parte. Le parti vengono prima degli assiemi.

**L'export** del ciclo porta ancora due fogli, *Distinta* e *Ciclo di lavorazione*: è il foglio
che si dà a chi fa il pezzo, e il materiale gli serve.

### Il ciclo di lavorazione

Le fasi, numerate **10, 20, 30…** e riordinabili con le frecce ↑ ↓ (la numerazione a decine lascia
posto per infilarne una in mezzo).

| Campo della fase | Note |
|---|---|
| **Centro di lavoro** | Dall'elenco di *Gestione → Centri di lavoro* |
| **Interna / Conto lavoro** | Se conto lavoro, si sceglie il **fornitore** |
| **Macchina** | Con il modulo Macchine utensili (dalla 0.126.0), per le fasi interne di un centro che ha macchine: a costo orario la sua tariffa si somma a quella del centro, sulle ore divise per gli operatori (→ [cap. 24](#24-carico-dei-centri-di-lavoro)) |
| **Costo** | *Fisso* oppure *Orario* |
| **Ore (h)** | Fase **interna**: le ore-uomo per pezzo, cioè le ore che il pezzo occupa il centro sommate su tutti quelli che ci lavorano. Entrano nel costo (a costo orario) e nel carico |
| **Operatori (op)** | Fase **interna** (dalla 0.124.0): quanti lavorano insieme sulla fase, di serie 1. I giorni sono ore ÷ (ore al giorno di un operatore × operatori), arrotondati, più la coda della fase: 80 h con 2 operatori a 8 h al giorno sono 5 giorni |
| **Attrezzaggio (att.)** | Fase **interna** (dalla 0.131.0): le ore di attrezzaggio della fase, contate **una volta per lotto**. Proposte dal centro quando si aggiunge la fase, si cambiano qui. Entrano nei giorni, nel Carico centri e, a costo orario, nel preventivo e nel consuntivo della commessa; non nel costo per pezzo, che non sa su quanti pezzi dividerle |
| **Coda (gg)** | Fase **interna** (dalla 0.131.0): i giorni che il pezzo aspetta davanti al centro prima della fase. Proposti dal centro |
| **Giorni (gg)** | Fase in **conto lavoro**: i giorni di attraversamento dal terzista |
| **Trasporto (trasp.)** | Fase in **conto lavoro** (dalla 0.131.0): i giorni di trasporto verso e dal terzista, andata più ritorno. Proposti dal fornitore, si cambiano qui. In una tratta di più fasi consecutive dello stesso terzista vale quello della **prima** fase: il pezzo va e torna una volta sola, e sulle altre il campo è spento |
| **Costo (€)** o **Tariffa (€/h)** | Secondo il modo scelto |
| Nota | Testo libero, finisce sull'ordine di lavoro |

Il ciclo **non calcola giorni** (dalla 0.131.0): non sa quanti pezzi si faranno. I giorni di ogni fase li calcolano il fabbisogno, gli ordini di produzione e la capacità finita, dove la quantità c'è.

**Da sapere — la differenza che conta di più.**

| | Fase **interna** (senza fornitore) | Fase in **conto lavoro** (con fornitore) |
|---|---|---|
| Si dichiara | **ore** | **giorni di attraversamento** |
| Nel costo | ore × tariffa del centro | il prezzo del terzista |
| Nel fabbisogno | non compare: non si compra | compare in *Da far lavorare fuori* |
| Nel Carico centri | **carica il centro** | non carica nessun centro |
| Genera | — | un **ordine di lavoro** |

Una fase interna a **costo fisso** dichiara comunque le ore, e quelle ore caricano il centro: il
prezzo è una cosa, l'occupazione della macchina è un'altra. Una fase in conto lavoro a **costo
orario** dichiara anche le ore, che lì sono le ore che il terzista fattura.

**Ogni modifica si salva subito.** Non c'è un pulsante Salva in questa vista.

---

### Il ciclo di un assieme (dalla 0.124.0)

Macchine, gruppi e sottogruppi compaiono nel menu dopo le parti. Il loro ciclo ha **solo fasi**:
i componenti stanno nella distinta (il pulsante **Distinta** ci porta), come il materiale di una
parte. Le fasi si scrivono come quelle di una parte: centro, interna o conto
lavoro, costo fisso o orario, ore o giorni, ordine con ↑↓. Le card dicono il costo delle fasi e
il costo dell'assieme.

I **giorni di montaggio** vengono dalle fasi, in fila: non c'è più un numero da dichiarare
(prima si scriveva nella distinta, e scavalcava le fasi; i valori salvati sono ignorati).

Da lì:

- **costo**: ogni fase entra nelle *Lavorazioni* dell'assieme come una riga di ciclo;
- **fabbisogno**: le fasi interne caricano i centri nella settimana in cui cominciano, numerate
  10, 20…; quelle dal terzista sono **conto lavoro** da commissionare, con il loro ordine di
  lavoro; il montaggio comincia con la prima fase, a meno che l'assieme abbia i *giorni di
  montaggio* dichiarati;
- **ordine di produzione**: un assieme con un ciclo si lancia con un ODP (→
  [cap. 22](#22-ordini-di-produzione-odp)), e da lì passano reparto, timbrature, capacità finita
  e consuntivo.

> **Da sapere passando alla 0.124.0.** Le vecchie *lavorazioni* degli assiemi (centro, ore, nota)
> diventano da sole fasi del ciclo, a costo orario con la tariffa del centro: il costo resta
> quello. Nell'archivio condiviso ogni PC le converte allo stesso modo finché l'assieme non viene
> salvato; conviene aggiornare l'app su tutti i PC, perché una versione vecchia non vede le fasi.
> Da qui la tariffa sta sulla fase: cambiare quella del centro non la cambia più da sola.

## 15. Revisioni

**A cosa serve.** Congelare com'era una distinta in un certo momento, e poterci tornare.

**Come ci si arriva.** Dalla barra revisioni, in cima a *Gestione DB* (per gli assiemi) e a
*Cicli di lavorazione* (per le parti).

**Come funziona.** Ogni assieme e ogni parte ha una **revisione in lavorazione**, identificata da
una lettera che parte da `A`. Ci si lavora liberamente.

**Rilascia revisione** (pulsante **Nuova revisione**) fa tre cose:

1. chiede il **motivo** del rilascio;
2. **congela** la distinta com'è adesso, con il costo di oggi;
3. passa alla lettera successiva, che diventa quella in lavorazione.

**Ogni rilascio è una modifica tecnica** (dalla 0.96.0). Nella finestra del rilascio, oltre al
motivo, si sceglie il **tipo**: *Correttiva*, *Migliorativa*, *Richiesta del cliente*, *Cambio di
fornitore o componente*, *Riduzione dei costi* (si può lasciare vuoto). La finestra mostra prima
di confermare **quali documenti aperti sono costruiti sulla versione che si lascia**: i piani
attivi e gli ODP aperti dell'articolo **e degli assiemi che lo contengono**, e le richieste, gli
ordini e gli ODL aperti dei componenti che la modifica aggiunge, toglie o cambia di quantità. Al
rilascio la revisione riceve un numero **MT-AAAA-NNN**, progressivo nell'anno, e quella lista resta
fotografata così com'era: serve a sapere cosa andava rivisto, anche dopo che i documenti si sono
chiusi.

**Modifiche tecniche**, nella barra revisioni, apre il **registro** di tutte le revisioni
rilasciate, di tutti gli articoli, dalla più recente: numero, articolo, revisione, tipo, motivo,
chi e quando, e i documenti che erano aperti. Le revisioni rilasciate prima della 0.96.0 compaiono
senza numero.

**Storico revisioni** mostra le revisioni rilasciate, con data, autore e motivo (e, dalla 0.96.0,
numero, tipo e documenti aperti). **⇄ Confronta**,
su ogni riga, mette quella revisione a fianco della distinta attuale; dal menu **Confronta la Rev. …
con** si sceglie invece un'altra revisione (dalla 0.85.0). Il confronto dice cosa è **aggiunto**,
cosa **rimosso** e cosa ha **cambiato quantità**, con il costo congelato di ciascuna delle due e la
differenza. Fra due revisioni si legge sempre dalla più vecchia alla più nuova, in qualunque
ordine le si scelga.

**Da sapere.**
- Se dall'ultimo rilascio non è cambiato niente, l'app lo dice invece di creare una revisione
  identica alla precedente.
- Il confronto fra revisioni guarda un livello: i componenti diretti. Un sottogruppo che ha
  cambiato la *sua* distinta lo dicono le revisioni del sottogruppo.
- **Un articolo che sta in una revisione rilasciata non si elimina** (dalla 0.105.6), anche se
  nella distinta di oggi non c'è più: la revisione è una fotografia, e deve continuare a dire che
  cosa c'era. Prima un componente tolto dalla Rev. B si poteva eliminare, e da quel momento la
  Rev. A — e il registro delle modifiche — diceva «(articolo eliminato)». Un articolo che non
  serve più si segna **obsoleto**.

### Confrontare due distinte diverse

**⇄ Confronta con…**, nella barra revisioni di *Gestione DB*, mette la distinta aperta a fianco di
**un'altra distinta qualsiasi**: la variante per un altro cliente, la macchina nuova nata da una
vecchia, i due gruppi che dovrebbero essere uguali.

Qui il confronto è **su tutti i livelli**, articolo per articolo, con le quantità **per una
macchina** — le stesse del fabbisogno: scarti compresi, e lo stesso componente usato in due rami
contato una volta sola con la somma. Due elenchi, come nel piano:

| Elenco | Cosa contiene | Δ valore |
|---|---|---|
| **Da acquistare** | commerciali, materie prime, parti comprate | sì: differenza di quantità × costo unitario |
| **Da fabbricare** | le parti fatte in casa | no: una parte vale i suoi materiali e le sue ore, già contati nell'elenco sopra |

Di serie si vedono **solo le differenze**; togliendo la spunta compaiono anche gli articoli uguali.
In alto il costo delle due distinte e la differenza. Il confronto si esporta in Excel o PDF, un
foglio per elenco.

---

## 16. Costificazione — Visualizza DB

**A cosa serve.** Leggere quanto costa una macchina e perché. La schermata si intitola
**«Costificazione & Report»**.

**Come ci si arriva.** 🌳 *Tecnico → Visualizza DB*.

**Comandi.** Il menu **Macchina / Prodotto** per scegliere cosa costificare; **Esporta Excel** e
**Esporta PDF**.

**Cosa si vede.**

1. Le **card di costo**: Materiale · Commerciali · Parti · Lavorazioni · Spese generali ·
   **Costo totale** · **Prezzo vendita**.
2. **Incidenza voci di costo** — barre proporzionali con importo e percentuale, e il pulsante
   **Da dove viene questo costo**, che apre l'elenco degli articoli che pesano di più, sommati per
   articolo.
3. **Distinta base esplosa** — Pos. · Codice · Articolo · Tipo · Q.tà · Costo un. · Costo riga.

### La formula

```
costo         = Σ (componenti × q.tà × (1 + scarto%))     ← materiale, commerciali, sotto-assiemi
              + Σ (lavorazioni: ore × tariffa €/h)        ← manodopera interna
              + Σ (lavorazioni in conto lavoro)           ← quello che si paga fuori

costo totale  = costo + spese generali (overhead %)

prezzo vendita = costo totale × (1 + margine %)
```

Le due percentuali stanno in *Gestione → Costi e margini* (di serie: **12%** di spese generali,
**20%** di margine), e si possono sovrascrivere per singola macchina da *Modifica testata*.
Sono ammessi valori da 0 a 1000%.

**Il costo si calcola per ricorsione**: il costo di un gruppo è la somma dei suoi figli, e il costo
di una parte è la somma della sua distinta più il suo ciclo. Non ci sono costi «congelati» da
aggiornare a mano: cambiando il prezzo di una vite, il costo della macchina cambia subito.

---

# Parte V — Le operazioni

## 17. Magazzino

**A cosa serve.** Lo stato delle giacenze di tutto ciò che si tiene a scaffale.

**Come ci si arriva.** 📦 *Magazzino*.

**Cosa si vede.** **Commerciali, materie prime e parti insieme, in una lista sola**: il magazzino
non conosce la divisione fra acquisti e progetto. Gli **assiemi restano fuori** — si producono,
non si stoccano.

In testa quattro **KPI**: *Articoli a magazzino* · *Sotto scorta minima* · *Con merce in arrivo* ·
**Valore giacenza (€)** (esistente × costo unitario). Il valore ripartito per tipo e per famiglia,
e gli articoli fermi da mesi, stanno nel **Cruscotto** (→ [cap. 5](#il-cruscotto)).

**Il valore conta solo le giacenze positive** (dalla 0.105.6). Un esistente sotto zero è un errore
di registrazione — un consumo scritto prima dell'arrivo — non un debito: vale zero, e non abbassa
più il valore di merce che sullo scaffale c'è. Così la tessera del Magazzino e il Cruscotto, che la
tessera apre, dicono lo stesso numero.

**Esistente negativo** (dalla 0.105.6). Quando qualche articolo ha l'esistente sotto zero compare
una quinta card, in rosso, con quanti sono: un clic li filtra. Non è una misura del magazzino ma un
promemoria: quegli articoli **vanno ricontati**, o manca un carico, un versamento o un ricevimento.

Le card **filtrano la tabella** (dalla 0.101.0): *Sotto scorta minima* e *Con merce in arrivo*
mettono il filtro di stato corrispondente, *Articoli a magazzino* lo toglie, *Valore giacenza* apre
il Cruscotto. La card del filtro in uso resta evidenziata; un secondo clic lo toglie.

**Le colonne, e come si calcolano.**

| Colonna | Significato | Da dove viene |
|---|---|---|
| **Ubicazione** | Dove sta a scaffale | dalla scheda articolo (dalla 0.101.0) |
| **Esistente** | Quello che c'è adesso a scaffale | ricevuto sugli ordini **+** movimenti |
| **In arrivo** | Ordinato e non ancora entrato | ordini aperti |
| **Impegnato** | Promesso ai piani aperti | fabbisogno dei piani aperti |
| **Libero** | Quello di cui si può davvero disporre | `esistente + in arrivo − impegnato` |
| **Scorta min.** | La soglia sotto cui si avvisa | dalla scheda articolo |
| **Lotto** | Il lotto di riordino | dalla scheda articolo |

> **Nessuno di questi campi è scrivibile.** Sono tutti calcolati. Per cambiare l'esistente si
> registra un **movimento**.

**Comandi.** **Riordina sotto scorta (N)** (compare solo se qualcosa va riordinato) ·
**Presso terzi (N)** (compare solo se c'è qualcosa fuori) · **Inventario** · **Etichette ▾**
(articoli o ubicazioni) · **Esporta Excel** · **Esporta PDF**. Nella barra filtri, **Colonne**.

### Riordino sotto scorta

**Riordina sotto scorta** (dalla 0.96.0) elenca gli articoli d'acquisto per cui
`scorta minima − esistente − in arrivo` è positivo, con la quantità da ordinare
arrotondata al **lotto di riordino**. Quello che è già ordinato e in viaggio è contato, quindi non si
ordina due volte. L'**impegnato** dei piani si vede in colonna ma non entra nel conto (dalla 0.98.1):
quello che i piani hanno promesso lo ordinano i piani, con il documento legato al piano. Gli articoli
**obsoleti** non si propongono; un articolo che sta già in un ordine **in bozza** lo dice con un'etichetta e parte senza spunta. Le
parti compaiono solo se si comprano (approvvigionamento *acquisto*): quelle che si fabbricano
passano dal fabbisogno.

Gli articoli sono raggruppati per **fornitore** (quello della quotazione in uso). Si tolgono le
spunte da quelli che non si vogliono e **Crea ordini in bozza** fa **un ordine fornitore in bozza
per fornitore**, con il prezzo del listino e la consegna a oggi più i giorni del fornitore. Da lì
l'ordine si rivede e si invia come ogni altro. Gli articoli senza fornitore restano in un gruppo a
parte: si sistemano dal listino. Serve il diritto su *Richieste e ordini*.

**Filtri.** Ricerca (anche per ubicazione), tipo (Componente commerciale · Materia prima · Parte),
famiglia, sottofamiglia, **ubicazione** (una, o *senza ubicazione*), e il filtro di **stato**:

- *Sotto la scorta minima*
- *Giacenza a zero*
- *Esistente negativo* (dalla 0.105.6) — l'esistente è sotto zero: è da ricontare
- *Con giacenza*
- *Con merce in arrivo* (dalla 0.101.0)
- *Libero negativo* — si è promesso più di quanto si abbia e si aspetti
- *Presso terzi o in lavorazione*

### I movimenti

**La finestra «Rettifica giacenza»** — dalla riga o dal pannello laterale. Campi: **Tipo
movimento**, **Quantità**, (per il conto lavoro) **Terzista** e **Ordine di conto lavoro**,
**Nota**, e il pulsante **Registra**. Ogni tipo porta il suo suggerimento contestuale.

Dalla 0.105.6 la finestra fa tre controlli in più. **Una quantità negativa si rifiuta**: il verso
lo dà il tipo (un consumo toglie, un carico aggiunge), e una rettifica d'inventario scrive quanti
pezzi si sono contati, che non possono essere meno di zero. **Cambiando tipo il campo Quantità si
svuota** (per la rettifica d'inventario riparte dall'esistente), perché il numero scritto per un
tipo vuol dire un'altra cosa per l'altro: prima, passando a *Carico manuale* con l'esistente
ancora scritto, si ricaricava tutta la giacenza. E l'**ordine di conto lavoro** si lega solo a un movimento di conto lavoro:
scelto prima e poi cambiato il tipo, non resta appeso a un carico o a un consumo.

**Gli otto tipi di movimento:**

| Tipo | Effetto sulla giacenza | Quando si usa |
|---|---|---|
| **Rettifica inventario** | si scrive la quantità **contata**, l'app registra la differenza | dopo l'inventario |
| **Carico manuale** | **+** somma | merce entrata senza un ordine |
| **Consumo di produzione** | **−** sottrae | materiale prelevato per produrre |
| **Uscita a conto lavoro** | **−** sottrae | materiale spedito a un terzista |
| **Rientro da conto lavoro** | **+** somma | il pezzo finito che torna |
| **Passaggio di lavorazione** | **nessuno** | il pezzo va da un terzista al successivo |
| **Versamento di produzione** | **+** somma | il pezzo finito all'ultima fase di un ordine di produzione |
| **Reso da produzione** | **+** somma | il materiale che torna a scaffale da un ordine di produzione annullato |

Gli ultimi tre **non si scelgono a mano** dalla rettifica: il passaggio si registra dalla riga di
un ODL, il versamento da un ordine di produzione (→ [cap. 22](#22-ordini-di-produzione-odp)), il reso
annullando un ordine di produzione. Un
versamento senza un ordine dietro sarebbe un carico che nessuno spiega — per quello c'è il *Carico
manuale*.

**Perché il passaggio non muove niente.** Un pezzo che torna da Beta per andare da Gamma **cambia
luogo a quantità invariata**. Contarlo come carico e poi come scarico farebbe comparire a scaffale
un semilavorato che a scaffale non c'è mai stato, e il codice prodotto si caricherebbe una volta
per ogni terzista che l'ha toccato. Il passaggio si registra solo dalla riga di un ODL, e porta
due fornitori: *dove va* e *da dove viene*.

**Se l'esistente va sotto zero** (dalla 0.100.0). Una rettifica, un'uscita a conto lavoro,
l'avvio di un ordine di produzione o un montaggio che fanno uscire più di quanto c'è a scaffale
**si registrano lo stesso** — il pezzo è uscito davvero, e il conto sbagliato è quello di prima —
ma la finestra lo dice prima di registrare (*«ne escono X, a magazzino ce ne sono Y»*) e, dopo, un
avviso ricorda che l'esistente è negativo. È il segno che manca un carico, un versamento o un
inventario.

**La finestra «Movimenti»** mostra lo storico dell'articolo, con la possibilità di eliminare una
riga sbagliata.

### Materiale presso terzi

Il pulsante **Presso terzi (N)** apre il prospetto di cosa sta fuori, **raggruppato per
fornitore**, con *Uscito* / *Rientrato* / **Ancora fuori** e il riferimento all'ordine.
Ha il suo export Excel e PDF.

In fondo c'è il blocco **«in casa, fra due fasi»**: i pezzi tornati da un terzista e non ancora
ripartiti per il successivo. È **un luogo a sé** — esistono, non sono a scaffale, e non sono da
nessuno.

> Anche questo prospetto è **calcolato**, non un saldo scritto da qualche parte — ma da **due
> sorgenti**, e le tiene separate. Gli ordini di lavoro lo alimentano con i loro **movimenti**; gli
> **ordini di produzione** no, perché fra una fase e l'altra di movimenti non ne scrivono: lì il
> luogo lo dà la **fase corrente** dell'ordine, e la riga porta il nome della fase accanto al
> codice (→ [cap. 22](#22-ordini-di-produzione-odp)).

### I ricevimenti

Attenzione a una cosa: **il magazzino si carica anche dai ricevimenti degli ordini**, senza
movimenti. Quando si scrive *ricevuto 50* su una riga d'ordine, quei 50 entrano nell'esistente.
È comodo — un ricevimento sbagliato si corregge in un posto solo — e ha una conseguenza:

> ⚠️ **Cancellare un ordine già ricevuto toglie la sua merce dal magazzino.** È coerente, ma chi
> cancella un ordine vecchio va avvisato.

### Le etichette QR

Ogni articolo può avere un'etichetta con un **codice QR** da attaccare allo scaffale o al
contenitore. Inquadrata con il telefono, apre Bomtrack sulla **scheda rapida** dell'articolo:
esistente, in arrivo, impegnato, libero, e i pulsanti **Rettifica giacenza**, **Scheda completa**
e **Movimenti**. È il modo di fare l'inventario davanti allo scaffale, senza cercare il codice.

**Stampare le etichette.**
- **Etichette ▾ → Articoli elencati** nella barra del Magazzino: gli articoli che l'elenco mostra
  adesso, con i suoi filtri.
- **Etichette ▾ → Ubicazioni degli articoli elencati**: un'etichetta per ogni ubicazione, da
  attaccare allo scaffale (→ *Le ubicazioni*, qui sotto).
- **Etichetta QR** nel riquadro *Magazzino* della scheda articolo: una sola.
- **Etichette QR della selezione** nel pannello laterale, quando si scelgono più articoli
  (→ [cap. 12](#12-pannello-laterale-e-selezione-multipla)).

Nella finestra si scelgono il **formato** (foglio A4 3×8 da 70×37 mm, foglio A4 2×7 da 99×38 mm,
rotolo 50×30 o 62×29 mm per le stampanti termiche), le **copie** di ogni articolo e quante
etichette del foglio sono **già usate**, così un foglio iniziato non si butta. Esce un PDF: va
stampato al **100%**, non «adatta alla pagina», o le etichette non cadono nelle caselle.

**Anche i documenti hanno il loro QR**, in alto a destra nel PDF dell'**ordine di produzione**,
dell'**ordine a fornitore** e dell'**ordine di lavoro**. Inquadrato, apre la scheda rapida del
documento:

| Documento | Cosa mostra | Cosa offre |
|---|---|---|
| **ODP** | la fase su cui è fermo, quanti pezzi ha fatto, o perché non può partire | **Avvia la fase** o **Dichiara avanzamento**, e *Apri l'ordine* |
| **ODA / ODL** | fornitore, stato, ogni riga con *ricevuto / ordinato* | **Ricevi tutto** (chiede conferma), **Ricevi una parte** e *Apri l'ordine* |

**Ricevi una parte** (dalla 0.105.6). Una consegna porta spesso 40 pezzi su 100, e dal telefono
prima c'era solo *Ricevi tutto*. Ora la finestra elenca le **righe ancora aperte**, una sotto
l'altra, con il campo già pieno del **residuo**: si corregge solo la riga che arriva diversa, si
svuota quella che non arriva, e la conferma registra e **salva subito**. Il numero da scrivere è
**quanto arriva adesso** — quello sulla bolla in mano — non il totale ricevuto. Le righe di un ODL
che vengono da un ordine di produzione restano fuori, come in *Ricevi tutto*: si dichiarano
sull'ODP.

I pulsanti aprono le **stesse finestre** dell'app, con le stesse regole: chi ha un ruolo in sola
lettura vede i numeri ma non i comandi.

**Scansiona.** Il pulsante con il QR nell'intestazione (al telefono, sotto **⋯**) apre la
fotocamera dentro l'app. Sotto c'è un campo di testo: accetta il codice scritto a mano
(`MAT-ACC-LAM-001`, `ODP-2026-012`) e il testo di una **pistola lettore USB**, che lo «digita» e
preme Invio.

**L'indirizzo dentro il QR.** Il telefono deve sapere dove aprire l'app. Bomtrack usa l'indirizzo
da cui è aperta, oppure quello scritto in *Gestione → Etichette QR*. Se l'app è
aperta **dal disco** (doppio click su `index.html`) un indirizzo non c'è: le etichette funzionano
lo stesso con **Scansiona**, ma non con la fotocamera del telefono, e la finestra lo dice prima di
stampare.

> Nel QR c'è il **codice** dell'articolo o il **numero** dell'ordine, non un identificativo
> interno: l'etichetta si legge anche a occhio e resta valida dopo un ripristino da backup.
> Rinominare il codice di un articolo, però, rende vecchie le sue etichette: vanno ristampate.

### Le ubicazioni

Dalla 0.101.0 ogni articolo a magazzino può dire **dove sta**: il campo **Ubicazione a scaffale**
nella scheda articolo, accanto a scorta minima e lotto. È un testo libero — `A-03-2`,
`CASSETTIERA 4` — e si scrive sempre maiuscolo, senza spazi doppi: `a-03` e `A-03` sono lo stesso
posto. Mentre si scrive, il campo propone le ubicazioni già usate. Un articolo ha **una**
ubicazione.

Non c'è un archivio delle ubicazioni da tenere: un'ubicazione esiste finché almeno un articolo la
porta. Si vede nella colonna **Ubicazione** del Magazzino, nell'export, nella scheda articolo e
sull'etichetta QR dell'articolo; il filtro *Ubicazione* mostra un posto solo, o gli articoli che
un posto non ce l'hanno ancora.

**Il QR dello scaffale.** *Etichette ▾ → Ubicazioni degli articoli elencati* stampa un'etichetta
per ogni ubicazione. Inquadrata, apre la scheda dell'ubicazione: gli articoli che ci stanno, con
l'esistente, ciascuno cliccabile, e il pulsante **Conta questa ubicazione** che avvia l'inventario
di quel posto.

> Con l'archivio condiviso, la colonna `location` va aggiunta al database: si rilancia
> `supabase/schema.sql`, che la aggiunge senza toccare il resto.

### L'inventario guidato

**Inventario** nella barra del Magazzino (dalla 0.101.0) serve a contare il magazzino senza
cercare un codice alla volta. Si sceglie **cosa contare**: gli articoli che il Magazzino elenca
adesso (con i suoi filtri), un'ubicazione, o tutto. Gli articoli vengono messi in fila
**nell'ordine delle ubicazioni** (A-2 prima di A-10), quelli senza ubicazione in fondo.

**Si conta.** Per l'articolo in fila si scrive quanti ce ne sono e si preme **Conta** (o Invio):
si passa al prossimo da contare. **Salta** lo lascia per dopo; un clic su una riga dell'elenco ci
torna. Un campo vuoto non è uno zero: se non ce n'è nessuno si scrive **0**. Per non farsi guidare
dal numero l'esistente non si vede, a meno di spuntare *Mostra l'esistente mentre conto*.

**Con i QR.** Il campo in alto accetta il codice scritto o la pistola USB; **Fotocamera** accende
il lettore e lo lascia acceso. Un'etichetta d'**articolo** porta a quell'articolo — se non era in
fila ci entra —; un'etichetta d'**ubicazione** porta al primo articolo ancora da contare in quel
posto.

**Il riepilogo.** **Riepilogo differenze** mostra ogni articolo contato con *esistente*,
*contato* e *differenza*, quanti hanno una differenza, quanti non sono stati contati e il valore
delle differenze. Dalla 0.105.6 quel valore usa lo **stesso costo del valore di giacenza**: prima
usava il costo scritto a mano nella scheda, quasi sempre vuoto per i commerciali, e dieci pezzi
mancanti valevano zero. Le righe con una differenza sono spuntate: si tolgono quelle da non registrare.
**Registra** scrive una **Rettifica inventario** per ogni riga spuntata, con la nota proposta
(*Inventario del …*). Gli articoli non contati restano come sono.

> **Contare non tocca il magazzino**: finché non si registra non cambia niente. Il conteggio resta
> in **questo browser**: si chiude con *Chiudi e continua dopo* e si riprende da **Inventario →
> Riprendi**, anche dopo aver chiuso l'app. Un altro dispositivo non lo vede.
>
> **L'inventario in corso è di chi l'ha cominciato** (dalla 0.105.6), e dell'archivio su cui l'ha
> cominciato, locale o condiviso. Su un tablet di magazzino usato da due persone ciascuno ritrova
> il suo conteggio, e nessuno registra a suo nome le rettifiche contate da un collega; passando
> dall'archivio locale a quello condiviso, il conteggio dell'altro archivio non si mescola.
>
> La differenza si calcola **quando si registra**: se fra il conteggio e la registrazione entra o
> esce qualcosa, finisce nella rettifica. Si registra a fine giro, non il giorno dopo.

---

## 18. Commesse

**A cosa serve.** La commessa è **il cliente e la data a monte del lavoro**. Ci si agganciano
piani di fabbisogno, richieste e ordini, e la sua scheda dice in ogni momento se il materiale c'è.

**Come ci si arriva.** 📋 *Pianificazione → Commesse*.

**Comandi dell'elenco.** **+ Nuova commessa** · **Esporta Excel** · **Esporta PDF**.

**Filtri.** Ricerca «Numero, cliente o descrizione…»; **filtro per periodo** sulla data di
apertura (*dal … al …*, aperto anche da un lato solo); il contatore.

**I campi della commessa.**

| Campo | Note |
|---|---|
| **Cliente** | Con i suggerimenti dall'anagrafica di *Gestione → Clienti*: due commesse dello stesso cliente non si chiamano più «Rossi Srl» e «Rossi S.r.l.» |
| **Descrizione** | Che lavoro è |
| **Riferimento cliente** | Il numero d'ordine del cliente |
| **Stato** | I quattro qui sotto |
| **Data apertura** | Quando è entrata |
| **Consegna al cliente** | La data che conta |
| **Note** | Testo libero |

**I quattro stati.**

| Stato | Significato |
|---|---|
| **Aperta** | Acquisita, non ancora avviata |
| **In produzione** | Si sta facendo |
| **Chiusa** | Consegnata |
| **Annullata** | Non si fa più |

Mettendola **In produzione**, l'app chiede conferma **nominando i codici mancanti e la data di
consegna**. Avvisa, non blocca: la decisione resta a chi la prende.

**Cosa si vede nella scheda.**

- I **KPI**: Ordinato · Già ricevuto · Ancora atteso · Piani di fabbisogno · l'indicatore di
  copertura.
- **Copertura materiale** — la sezione che risponde a «il materiale c'è?», divisa in tre:
  cosa è ancora **da ordinare**, cosa sta in un documento **non ancora inviato**, cosa
  **arriva dopo la data in cui serve**. *Documento non ancora inviato* (dalla 0.105.6) vuol dire
  un ordine o un ordine di lavoro **in bozza**, o una richiesta d'offerta **ancora aperta**, che
  copre quello che manca. Un ordine già inviato è merce in arrivo e sta già nel conto; se copriva
  40 pezzi su 100, gli altri 60 restano **da ordinare**. Prima bastava un documento qualsiasi
  sull'articolo, e quei 60 risultavano in attesa di un invio che non li riguardava.
- **Fabbisogni**, **Richieste di offerta**, **Ordini a fornitore**, **Ordini di lavoro** — le
  quattro liste di quello che pende sotto la commessa, ogni riga con **Apri →**.

**Da sapere.** I piani della stessa commessa **si sommano prima di guardare il magazzino**: due
piani della stessa commessa non si contendono la stessa merce. Se non ci sono piani aperti, la
scheda lo dice, invece di dichiarare tutto coperto.

### Consuntivo (modulo Costi reali, dalla 0.122.0)

Con il modulo **Costi reali** acceso (→ [cap. 25](#25-gestione), *Moduli*) la scheda della
commessa ha la sezione **Consuntivo**: quanto si pensava di spendere e quanto si è speso davvero,
voce per voce — *Materiali e acquisti*, *Lavorazioni*, *Spese generali*, *Totale* — con lo
scostamento in euro e in percentuale (rosso se si è speso di più).

- **Preventivo.** È il costo industriale delle righe dei piani della commessa, come in
  *Visualizza DB*. Finché la commessa è *Aperta* è **provvisorio** e segue i costi di oggi; quando
  passa a **In produzione** si **congela**, e da lì un listino che cambia non lo tocca più.
  **Aggiorna preventivo** lo rifà con i costi di oggi (prima di andare in produzione il pulsante
  si chiama **Congela preventivo**).
- **Reale — materiali.** Per ogni articolo conta quello che la commessa ha **consumato**: i
  prelievi degli ODP, le uscite a conto lavoro, i montaggi dichiarati, meno i resi, al valore del
  magazzino (listino o costo medio). Un articolo mai prelevato conta per quanto è **arrivato** sui
  suoi ODA. Mai tutte e due le cose: la merce comprata per la commessa entra a magazzino e poi ne
  esce, e contarla due volte raddoppierebbe il costo.
- **Reale — lavorazioni.** Le righe ricevute degli ODL al prezzo dell'ordine; i pezzi lavorati
  nelle fasi interne degli ODP per il costo di fase del ciclo (ore × tariffa, o costo fisso a
  pezzo); le operazioni di montaggio degli assiemi dichiarati montati.
- **Reale — spese generali.** Nella stessa proporzione che hanno nel preventivo.

Sotto la tabella, **Da dove viene il reale** elenca ogni importo con il documento da cui viene.
Il reale cresce con il lavoro: a metà commessa è più basso del preventivo per definizione, e la
riga sopra la tabella dice anche quanto è ordinato e non ancora arrivato.

---

## 19. Fabbisogno materiali

**A cosa serve.** Trasformare «tre macchine per il 15 marzo» in una lista d'acquisto, un elenco di
parti da fare e un elenco di lavorazioni da commissionare.

**Come ci si arriva.** 📋 *Pianificazione → Fabbisogno*.

**Comandi dell'elenco.** **+ Nuovo piano** · **Esporta Excel** · **Esporta PDF**.
I badge di riga dicono `aperto` o `chiuso`.

**Filtri.** Ricerca «Numero o titolo…»; periodo; contatore.

**La toolbar del piano.**

| A sinistra | A destra |
|---|---|
| chiudi · numero del piano · **Aperto — chiudi** / **Chiuso — riapri** | **Esporta ▾** (Excel, PDF) · **⋯** (Duplica, Elimina) |

I pulsanti **Genera…** non stanno più nella toolbar (dalla 0.92.0): ciascuno sta nella scheda
delle righe su cui agisce, vedi sotto.

**I campi di testata.** Titolo · Data · **Consegna richiesta** · **Commessa** · Note.

**Cosa esce dall'export** (dalla 0.112.0). L'Excel e il PDF portano quello che la scheda mostra:
la testata (titolo, data, consegna, commessa, note), le righe **Da produrre** con *Serve per*,
*Fattibile* e *Margine*, il riepilogo dei KPI, gli acquisti con *Serve per*, *Ordinare entro*,
i giorni di consegna e una colonna **Note** con le etichette della riga (coperto, sotto il minimo,
senza prezzo, impegnato, già in un documento…), il conto lavoro con il totale, le parti da
fabbricare con data di lancio, **Fatti** e **Restano**, le parti **dal magazzino** e gli assiemi
**da montare**. Nel netto l'Excel ha anche scorta minima e libero. Il PDF è in orizzontale.
Programma, Gantt e Carico restano nell'app.

### Le sezioni

In alto, sempre visibili, stanno le righe **Da produrre** e i **KPI**. Il resto è diviso in
**schede** (dalla 0.92.0), ciascuna con il numero delle sue righe:

| Scheda | Cosa contiene | Pulsanti |
|---|---|---|
| **Da acquistare (N)** | La lista consolidata del materiale | Genera richieste · Genera ordini |
| **Conto lavoro (N)** | Le fasi *Da far lavorare fuori* | Genera richieste · Genera ordini di lavoro |
| **Da fabbricare (N)** | Le parti a produzione interna, con l'avanzamento; sotto, quelle prese **dal magazzino** | Genera ordini di produzione |
| **Da montare (N)** | Gli assiemi del piano, con i montaggi dichiarati o l'ODP che li monta | **Dichiara montaggio** su ogni riga; **Genera ordini di produzione** per gli assiemi con un ciclo |
| **Programma** | L'agenda del piano in ordine di data | — |
| **Gantt** | Il programma disegnato, riga per riga | — |
| **Carico** | Le ore che questo piano chiede ai centri | — |
| **Documenti (N)** | Richieste, ordini, ODL e ODP nati dal piano | — |

La scheda scelta resta la stessa aprendo un altro piano, finché non si cambia. Fra le schede ci si
sposta anche con le frecce ← →. **In stampa** le schede escono tutte, una dopo l'altra.

**Da produrre** — quello che si chiede al piano. Pulsante **+ Aggiungi al piano**; colonne Codice,
Articolo, U.M., **Q.tà**, **Serve per** (la data), **Fattibile**, **Margine**, elimina. Fattibile e
margine sono spiegati sotto, in *La data fattibile*.

**I KPI** — Totale acquisti · Articoli da comprare · Fornitori coinvolti · Parti da fabbricare ·
Conto lavoro.

**Programma** — l'agenda del piano: tutto ciò che deve succedere, in ordine di data (sotto, *Il
programma*).

**Da acquistare** — la lista consolidata, con due interruttori:

- **☑ Fabbisogno netto** — toglie quello che c'è già (vedi sotto);
- **☑ Raggruppa per fornitore** — riordina la lista per chi la deve vendere.

Gli **indicatori di riga**:

| Indicatore | Significato |
|---|---|
| `↓ risparmio` | Un altro fornitore quota meno del listino di oggi del fornitore in uso; l'importo è sulla quantità da ordinare |
| `⚠ sotto il minimo` | La quantità è sotto la q.tà minima del fornitore |
| `⚠ senza prezzo` | L'articolo non ha nessuna quotazione |
| `↑ lotto` / `↑ minimo` | La quantità è stata alzata al lotto di riordino |
| `✓ coperto` | Non serve ordinare niente |
| `🕒 arriva il …` | Già ordinato, ma l'ordine arriva **dopo** il giorno in cui serve: la data è quella in cui l'in arrivo basta (dalla 0.111.0) |
| `⚠ ordine scaduto` | Un ordine di quell'articolo ha la data passata e la merce non è ancora stata ricevuta (dalla 0.111.0) |
| *(impegno)* | Quanta parte è impegnata dai piani più urgenti |
| *(bozze di altri)* | L'articolo sta già in un **ordine in bozza** che non è di questo piano (dalla 0.105.6) |

**Le bozze d'ordine degli altri** (dalla 0.105.6). Una bozza non è merce in arrivo — non è
partita — e il netto giustamente non la conta. Ma il piano prima non la vedeva nemmeno: una bozza
del riordino sotto scorta, di un altro piano o scritta a mano, e gli ordini generati dal piano
partivano entrambi, e la stessa merce si comprava due volte. Ora accanto alla riga d'acquisto
compaiono le bozze degli altri con quell'articolo, e in **Genera ordini** la riga nasce **non
spuntata**, come fa il riordino: chi la vuole comunque la spunta.

**Da far lavorare fuori** — le fasi di ciclo affidate a un terzista. Le quantità sono **al netto
dei pezzi dichiarati fatti** in *Da fabbricare*: una parte finita ha già attraversato tutte le sue
fasi, e mandarla fuori un'altra volta vorrebbe dire pagare due volte lo stesso lavoro. Una parte
ferma a metà ciclo conta invece ancora per intero — si dichiara la parte finita, non la fase
superata — quindi il conto è prudente: si rischia di riproporre una lavorazione già avviata, mai
di dimenticarne una da fare.

Una fase **coperta da un ordine di produzione** (→ [cap. 22](#22-ordini-di-produzione-odp)) è il
caso in cui la fase superata si sa davvero: quella esce da qui e porta il badge «coperta da
ODP-…», perché l'ordine di lavoro si genera da lì, quando la fase precedente è chiusa.

**Da fabbricare** — le parti a produzione interna che il piano richiede, con l'**avanzamento**:
quante ne sono state fatte e quante ne restano. Il pulsante 🏭 in fondo alla riga apre la scheda in
cui si dichiara: si scrive quanti pezzi sono stati fatti (il modulo propone il residuo, che è il
caso più frequente), si può aggiungere una nota, e resta lo storico di chi ha dichiarato cosa e
quando. Un numero **negativo** corregge un conteggio sbagliato, come una rettifica di magazzino:
lo storico non si riscrive, si aggiunge. Dalla 0.105.6 dichiara anche il ruolo **Officina e
magazzino**, come già per il montaggio: prima il pulsante e la scheda gli erano nascosti, e
l'avanzamento delle parti lo doveva scrivere l'ufficio.

**Lotto e scorta minima delle parti** (dalla 0.105.6). La quantità da fabbricare segue le stesse
regole degli acquisti. Si arrotonda al **lotto di riordino** della parte, a multipli o con la
soglia minima secondo il suo modo. E se lo scaffale della parte è sotto la **scorta minima**, il
piano aperto **più urgente** che la fabbrica (il primo della fila, come per il netto) lancia anche i
pezzi che la ripristinano, una volta sola: gli altri piani non se li ricaricano, e lanciato l'ODP
che li copre il buco è chiuso. Il buco si misura a lavoro finito: esistente, più quello che gli
ODP aperti stanno facendo e i piani devono ancora lanciare, meno quello che i piani devono ancora
consumare. La riga dice da dove vengono i pezzi in più, perché un 50 al posto di 8 non sembri un
errore. Prima la scorta e il lotto di una parte fatta in casa si scrivevano nella scheda ma il
fabbisogno li ignorava.

Dichiarare pezzi fatti **mette a magazzino** le parti che si tengono a scorta (dalla 0.105.5),
con un versamento legato alla dichiarazione: il montaggio, scaricandole, non manda la giacenza sotto
zero. Eliminare la dichiarazione toglie anche il versamento. Le righe d'acquisto del piano non si
annullano: il materiale per una parte si compra prima di farla.

Fra i **fatti** contano anche i pezzi buoni che gli **ordini di produzione** del piano hanno
versato, e i pezzi ancora attesi da un ODP aperto non si rilanciano: la colonna *da ordinare* è
quello che manca al netto di entrambi. Un ODP chiuso con meno pezzi lascia rilanciare i mancanti
(dalla 0.105.5).

**Carico dei centri** — la stessa tavola del [cap. 24](#24-carico-dei-centri-di-lavoro), ristretta
a questo piano.

In fondo, l'elenco dei **documenti generati** dal piano.

### Le date: la programmazione a ritroso

Dalla 0.88.0 la data di una riga di piano non scende più **invariata** lungo la distinta: si
toglie, livello per livello, il tempo di chi sta in mezzo. È la risposta a «se il gruppo deve
essere pronto il 16, quando devo ordinare il tondo, quando spedire i perni al terzista, quando
lanciarli in tornitura?».

```
consegna del gruppo (ven 16)
 └ montaggio 2 gg ................................ mer 14 → ven 16
    └ perno, serve mer 14
        fase 40 fresatura (interna) 16 h → 2 gg .. lun 12 → mer 14
        fasi 20-30 zincatura da Beta 3+1 gg
              + 2 gg di trasporto ................ invio ven 2 → rientro lun 12
        fase 10 tornitura (interna) 8 h → 1 gg ... gio 1 → ven 2      ← lancio dell'ODP
        tondo, materiale del ciclo: serve gio 1; listino a 10 gg → ordinare entro gio 17/9
```

**Le regole.**

| Che cosa | Quanto dura | In che giorni |
|---|---|---|
| **Montaggio** di un assieme | le fasi del suo ciclo in fila: le interne per le ore sul centro, quelle dal terzista per i giorni più il trasporto (dalla 0.124.0) | lavorativi |
| **Fase interna** | (attrezzaggio della fase + ore/pz × pezzi) ÷ (ore al giorno di un operatore × operatori), arrotondato al giorno, + giorni di coda della fase | lavorativi |
| **Tratta di conto lavoro** (fasi consecutive dello stesso terzista) | somma dei giorni di attraversamento + giorni di trasporto della prima fase della tratta | dei fornitori: lavorativi di serie, o di calendario (vedi sotto); l'invio cade sempre in un giorno lavorativo |
| **Acquisto** | giorni di consegna del listino | dei fornitori: lavorativi di serie, o di calendario (vedi sotto); la data d'ordine cade sempre in un giorno lavorativo |

**I giorni dei fornitori** (dalla 0.110.0). La settimana è di cinque giorni anche per fornitori e
terzisti: i giorni di consegna a listino, l'attraversamento e il trasporto del terzista e i ritardi
confermati sugli ordini si contano **di serie in giorni lavorativi** del calendario di fabbrica,
come li indica quasi ogni fornitore («10 gg lav.»). Se i tuoi fornitori dichiarano invece giorni di
calendario, in *Gestione → Calendario di fabbrica* scegli **Giorni di consegna di
fornitori e terzisti: Di calendario**: allora valgono pieni, sabati, domeniche e festivi compresi,
come fino alla 0.109. In tutti e due i casi la data d'ordine o d'invio cade in un giorno lavorativo
(se no si anticipa) e un arrivo previsto in un giorno di chiusura si riceve il primo giorno
lavorativo dopo. I dati salvati non cambiano: cambia solo come si contano.

- Le date sono «il mattino in cui il pezzo è pronto»: una fase di un giorno che deve finire
  lunedì comincia venerdì, e la fase prima deve finire venerdì. Nessun buco, nessuna
  sovrapposizione.
- Il **materiale del ciclo** di una parte serve all'inizio della **prima** fase: è lì che esce.
- Una fase **senza tempi** (zero ore, zero giorni) non sposta niente: senza dati le date restano
  quelle della consegna, come prima della 0.88.0.
- Lo stesso articolo chiesto da due rami con date diverse tiene **la data più vicina**.
- Un **margine fra livelli** (*Gestione → Calendario di fabbrica*) anticipa ancora
  di qualche giorno lavorativo la data in cui un componente deve essere pronto.

**Dove si vede.** In *Da acquistare* «Serve per» e «Ordinare entro» sono già scalati; in *Da far
lavorare fuori* «Serve per» è il **rientro** della tratta e «Ordinare entro» l'**invio**; in *Da
fabbricare* sotto «Serve per» compare la data di **lancio**. Le righe dei documenti generati
chiedono quelle date: l'ordine al fornitore del tondo chiede il 5, l'ordine di lavoro a Beta il
rientro del 12 — non più la consegna del gruppo.

**Capacità infinita.** Le date dicono quando ciascuna cosa deve succedere perché la consegna regga,
non se il reparto ce la fa: quello lo dice il *Carico centri*
(→ [cap. 24](#24-carico-dei-centri-di-lavoro)), che dalla 0.88.0 mette le ore nella settimana in
cui la fase **comincia**.

### La data fattibile

La programmazione a ritroso dice **entro quando** deve succedere ogni cosa perché la consegna
richiesta regga. La data fattibile risponde all'altra domanda: **se comincio oggi, quando sono
pronto davvero?** È lo stesso albero, percorso in avanti con le stesse durate:

- un materiale o un commerciale è pronto **oggi** se la giacenza libera (esistente meno quanto
  impegnano gli altri piani aperti) basta per tutto il piano; **all'arrivo** dell'ordine che lo
  copre, se basta con l'in arrivo (data confermata, o quella chiesta); altrimenti fra i **giorni
  del listino** a partire da oggi. Dalla 0.105.6 l'in arrivo è lo stesso del fabbisogno netto: le
  righe d'ordine scritte in un'altra unità si **convertono** nell'unità dell'articolo (16 m di
  barra non sono più 16 kg), e quelle **senza data** contano come arrivate in tempo. Prima si
  perdevano, e merce già ordinata risultava da comprare col tempo del fornitore. Dalla 0.111.0
  un arrivo in un giorno di chiusura si riceve il primo giorno lavorativo dopo, e un ordine
  **scaduto** (data passata, merce non ricevuta) non conta più come pronto oggi: il programma lo
  aspetta al **prossimo giorno lavorativo**, e il percorso critico dice quale ordine è scaduto;
- una parte comincia quando è pronto il suo materiale, poi le fasi in fila;
- un assieme comincia quando sono pronti tutti i componenti, più il montaggio.

Il **margine** è in giorni lavorativi fra la data fattibile e quella richiesta: positivo è tempo
in avanzo, **negativo** (in arancio, con ⚠) vuol dire che la consegna non si regge. Cliccando la data
fattibile si apre il **percorso critico**: la catena — gruppo, perno, tondo — che arriva per
ultima, con le date di ciascun passo. Per anticipare la consegna è uno di quei passi che va
accorciato.

**Limiti, detti.** Le parti prodotte non si guardano a magazzino (come nel resto del fabbisogno);
un ordine di produzione già avviato non accorcia il conto; la capacità è infinita; la scorta
minima non trattiene niente, perché in un ritardo si usa.

### Il programma

La sezione **Programma** mette in fila tutte le date del piano, giorno per giorno:

| Voce | Data | Quando è «fatto» |
|---|---|---|
| **Ordinare** | ordinare entro | c'è un ordine a fornitore emesso dal piano (una sola richiesta d'offerta lo segna «richiesto») |
| **Inviare al terzista** | invio della tratta, o l'**inizio lavoro** scritto sull'ODL | il materiale è partito: **in lavorazione** con *Avvia* sulla riga dell'ODL o sulla fase dell'ordine di produzione, **fatto** quando i pezzi sono rientrati (*Dichiara*). Con l'ODL emesso e il materiale ancora qui la voce resta da fare, con il numero accanto («ODL emesso»), e oltre la data è in ritardo (dalla 0.113.0) |
| **Lanciare in produzione** | inizio della prima fase | c'è un ordine di produzione |
| **Montaggio** | la sua data | i montaggi dichiarati nella scheda *Da montare* coprono la quantità |
| **Rientro dal terzista** | la sua data | «in lavorazione» mentre il pezzo è fuori, «fatto» quando è rientrato; altrimenti «previsto» |
| **Fase interna** · **Consegna** | la loro data | non hanno un documento: sono «previsti» |
| **Arrivo dal fornitore** | data confermata dell'ordine, o quella chiesta | è «previsto»; **in ritardo** se viene dopo il giorno in cui il materiale serve, o se è passata senza che la merce sia arrivata (dalla 0.111.0) |

Spostare la data di un ordine emesso dal piano non sposta le altre voci: sono il programma a
ritroso dalla consegna, cioè *entro quando* deve succedere ogni cosa. Sposta invece la voce
**Arrivo dal fornitore**, la **data fattibile** e il **margine**, e nel Gantt il rombo dell'arrivo.

Una voce oltre la sua data e non fatta è **in ritardo**. **☐ Solo da fare** lascia le voci ancora
da emettere. Esporta in Excel e PDF, una riga per voce.

### Il Gantt

Sotto il *Programma*, una riga di piano alla volta (si sceglie dal menu se sono più d'una): un
nodo dell'albero per riga — assiemi, parti, acquisti — con le barre del programma a ritroso.

| Colore | Barra |
|---|---|
| arancio | attesa del fornitore: da *ordinare entro* a *serve per* |
| blu | fase interna |
| viola | tratta in conto lavoro, dall'invio al rientro |
| verde | montaggio |

Il contorno **rosso** e il codice in rosso segnano il **percorso critico**; la linea rossa
tratteggiata è la consegna richiesta, quella blu oggi, quella **verde** la data fattibile
(**arancione** se viene dopo la consegna richiesta). Sulle righe d'acquisto già ordinate un
**rombo** segna l'arrivo atteso: **rosso** se arriva dopo il giorno in cui serve, o se l'ordine è
scaduto (dalla 0.111.0). Le barre non si muovono quando si sposta un ordine: si muovono il rombo,
la data fattibile e, se cambia, il percorso critico. Passando sopra una barra si leggono le date
esatte. Oltre 60 righe il disegno si ferma e lo dice: l'elenco completo è nel *Programma*.

Invii e lanci ancora da fare compaiono anche nel **calendario del Riepilogo**, accanto agli ordini
da emettere e ai rientri degli ordini di lavoro.

### L'avanzamento

**Come ci si arriva.** 📋 *Pianificazione → Avanzamento* (dalla 0.97.0).

**A cosa serve.** Il Gantt dice *entro quando* deve succedere ogni cosa; l'Avanzamento dice anche
*se è successa*, senza aprire i documenti a uno a uno. Si sceglie il piano e, se ne ha più d'una,
la riga da consegnare. Non si modifica niente da qui: è una lettura.

**Una riga per tappa**: un acquisto, ogni fase interna o tratta dal terzista di una parte, un
montaggio. Le righe seguono la sequenza del lavoro: il **materiale del ciclo** di una parte viene
**prima** delle sue fasi (dalla 0.111.0), un assieme sta in testa ai suoi componenti.

**Il codice con le sue fasi sotto** (dalla 0.114.0). Una parte con ciclo ha una riga di testa col
codice, la barra dall'inizio della prima fase alla fine dell'ultima e lo stato complessivo; sotto,
rientrati, prima il materiale del ciclo e poi le sue fasi: nella colonna *Codice* «fase 10», «fase 20»… (o «fasi 30-40» se una tratta
dal terzista ne raggruppa più d'una), nella colonna *Tappa* la lavorazione e chi la fa
(«Tornitura · interna», «Zincatura · Beta Srl»).

Su ogni riga:

- la **barra grigia** è il programma, la stessa del Gantt;
- sopra, una **barra colorata** dice quanto è stato fatto, col colore dello stato. Finché non c'è
  avanzamento, il colore sta sul **bordo** della barra grigia;
- in **rosso** il ritardo: la barra arriva fino a oggi, o all'arrivo atteso se cade dopo la data
  del programma;
- a destra i **documenti collegati**, con il loro stato, cliccabili per aprirli.

Sostando sulla barra si apre un riquadro con codice, tappa, date del programma, stato e ritardo.
Il **percorso critico** si riconosce dall'**orologio** accanto al codice: se quella tappa slitta,
slitta la consegna.

**Da dove viene l'avanzamento.** Dai documenti generati dal piano:

| Tappa | Si legge da | Fatto quando |
|---|---|---|
| Acquisto | righe degli ordini a fornitore | il ricevuto copre l'ordinato |
| Fase interna | fasi dell'ordine di produzione | la fase è chiusa |
| Tratta dal terzista | fasi dell'ODP, e rientrati dell'ordine di lavoro | la fase è chiusa, o tutto è rientrato |
| Montaggio | l'ordine di produzione dell'assieme, se c'è; se no i montaggi dichiarati nel piano | l'ordine è completato, o i montati coprono la quantità |

**Gli stati** (dalla 0.114.0) hanno parole diverse per ogni tipo di riga e un colore per il punto a
cui sono: **giallo** da cominciare, **viola** programmato o ordinato, **blu** in lavorazione,
**verde** finito.

| Riga | Giallo | Viola | Blu | Verde |
|---|---|---|---|---|
| Montaggio | programmato | | in corso | fatto |
| Acquisto | da ordinare | ordinato | | arrivato · da magazzino |
| Fase | da programmare | programmato | in lavorazione | fatto · da magazzino |
| Codice con ciclo | da fare | in attesa | in lavorazione | fatto |

- **Acquisto**: *da ordinare* finché non c'è un ordine inviato (una richiesta d'offerta o un ordine
  in bozza non bastano); *ordinato* con la percentuale ricevuta; *da magazzino* se esistente e in
  arrivo bastano e non serve un ordine.
- **Fase interna**: *da programmare* finché non c'è un ODP; *programmato* quando c'è l'ODP;
  *in lavorazione* quando la fase è *In corso* sull'ODP; *fatto* quando è dichiarata.
- **Fase dal terzista**: *da programmare* finché non c'è niente o c'è solo l'ODP; *programmato*
  quando c'è l'ordine di lavoro; *in lavorazione* quando la fase è *In corso* sull'ODP o, dalla
  0.116.0, quando la riga dell'ordine di lavoro è **avviata** (l'ordine inviato da solo non basta);
  *fatto* quando è dichiarata (o, senza ODP, quando tutto è rientrato).
- Una fase è *da magazzino* se per il piano non serve fabbricare la parte.
- **Codice con ciclo**: *da fare* fino all'avvio della prima fase; *in lavorazione* mentre una fase
  è avviata; *in attesa* fra la dichiarazione di una fase e l'avvio della successiva; *fatto*
  quando l'ultima fase è dichiarata e la parte è caricata a magazzino.
- **Montaggio**: *programmato* finché non c'è niente di dichiarato, sull'ODP dell'assieme o nel piano.

**Il ritardo non è uno stato**: accanto allo stato compare in rosso **+N gg**, i giorni oltre la
fine del programma (o, se la tappa non è cominciata, oltre la sua data d'inizio). Una tappa chiusa
con meno pezzi di quelli richiesti è *fatto*, con accanto in rosso **-N pz**: il piano li mostra da
rilanciare.

**In testa** la consegna richiesta, la data fattibile e il margine, i conteggi per stato e, se ci
sono, le tappe in ritardo **sul percorso critico**: quelle che spostano la consegna. **Apri il
piano** porta alla scheda del piano; **Esporta Excel / PDF** danno una riga per tappa (più la testa
di ogni codice con ciclo), con date, quantità, stato, giorni di ritardo, pezzi mancanti e documenti.

### Il fabbisogno netto

```
netto = lordo + scorta minima + impegnato − esistente − in arrivo
```

poi arrotondato al **lotto di riordino** dell'articolo, secondo il suo modo (*multiplo esatto* o
*quantità minima*). Nelle unità che si contano (pz, n, nr, set, conf, kit) la quantità da ordinare
si arrotonda per eccesso al pezzo intero; nelle altre resta con sei decimali (dalla 0.105.5).

Il termine **impegnato** è quello che fa la differenza: è la merce che **gli altri piani aperti
più urgenti** hanno già promesso a sé. Senza quel termine, due piani si dichiarerebbero coperti con
lo stesso pezzo, e uno dei due resterebbe a mani vuote.

**Chi consegna prima prende prima** (dalla 0.105.3). I piani aperti si mettono in fila come per le
parti a scaffale: la consegna più vicina, poi la data del piano, poi il numero. Ogni piano conta come
impegnato solo i piani che gli stanno davanti, e l'impegnato toglie soltanto merce che c'è: se i piani
davanti ne chiedono più di quanta ne esista, la loro parte scoperta la comprano loro. Così, a
magazzino vuoto, un piano da 100 e uno da 50 comprano 100 e 50, non 150 ciascuno. Il buco della
scorta minima lo compra il primo della fila. Prima della 0.105.3 contavano tutti gli altri piani, e
generare gli ordini da più piani prima di inviarli ordinava la stessa merce più volte.

**L'impegno scende con i prelievi** (dalla 0.98.1). Un piano impegna il suo fabbisogno **meno
quello che i suoi documenti hanno già prelevato**: quando un ordine di produzione o un ordine di
lavoro del piano fa uscire il materiale, l'esistente scende e l'impegno scende della stessa quantità.
La merce uscita non si conta due volte, e il piano non chiede di ricomprare quello che ha appena
usato. Un ordine **annullato** non riduce l'impegno: il materiale uscito manca, e il piano lo deve
ancora avere — a meno che, annullandolo, il materiale sia stato **reso** a magazzino (→
[cap. 22](#22-ordini-di-produzione-odp)): allora torna nell'esistente e il piano lo ritrova lì.

### Le parti a scaffale (dalla 0.100.0)

Una **parte** che si fabbrica e che c'è già a magazzino **non si rifà**. L'esplosione del piano,
scendendo nella distinta, prende prima quello che c'è a scaffale e fabbrica solo il resto: se ne
servono 10 e ce ne sono 4, il piano fa produrre 6 pezzi e compra il materiale per 6. Le parti prese
dal magazzino compaiono nella scheda **Da fabbricare**, sotto il titolo **Dal magazzino**, con la
quantità presa.

Quanto un piano può prendere lo decide l'ordine dei piani: **chi serve prima prende prima** (data
di consegna più vicina, poi data del piano, poi numero). Si parte dall'esistente meno la scorta
minima; i pezzi che un ordine di produzione di un piano aperto ha versato e quel piano non ha
ancora montato **restano suoi** e gli altri piani non li vedono. Le parti prese **si impegnano**
come i commerciali, e l'impegno scende quando il montaggio le scarica.

Vale per le parti, non per i commerciali (che passano dal fabbisogno netto, come prima) né per gli
assiemi (che non stanno a magazzino).

### Il montaggio (dalla 0.100.0)

Un assieme che ha un **ciclo** (dalla 0.124.0) si può montare anche con un **ordine di
produzione**: *Genera ordini di produzione* compare in testa alla scheda, e la riga di un assieme
con un ODP nel piano mostra il numero dell'ordine al posto di *Dichiara montaggio*. Da lì le fasi
si seguono come quelle di una parte, e i componenti escono all'avvio della prima. Dichiarare il
montaggio qui è bloccato, per non farli uscire due volte.

La scheda **Da montare** elenca gli assiemi del piano — macchine, gruppi, sottogruppi — con la
quantità, le date di montaggio, i componenti, quanti ne sono già stati **montati** e quanti
**restano**. **Dichiara montaggio** apre la finestra:

- in testa quanti ne servono, quanti montati e quanti restano, e lo storico delle dichiarazioni;
- si scrive **quanti assiemi** si sono montati: le righe dei **componenti diretti** (parti e
  commerciali, con lo scarto della distinta) si ricalcolano, ciascuna con quello che c'è a
  magazzino, e si possono correggere a mano;
- se qualcosa va sotto zero lo dice, ma registra lo stesso;
- **Registra** scrive un **consumo di produzione** per ogni componente, legato a quel montaggio.

Gli **assiemi dentro l'assieme** non si scaricano: non stanno a magazzino, si dichiarano a loro
volta sulla loro riga. Una dichiarazione si **elimina** dallo storico, e con lei i suoi scarichi.
Il montaggio dichiarato fa scendere l'impegno del piano come gli altri prelievi, e porta il
montaggio a *fatto* nel programma e nell'avanzamento.

> **Da sapere passando alla 0.100.0.** Prima il montaggio non scaricava niente: le parti versate e
> i commerciali ricevuti per gli assiemi già fatti sono ancora nell'esistente. Con le parti a
> scaffale il piano li considera disponibili e può proporre di fabbricarne meno. Conviene guardare
> la lista **Dal magazzino** dei piani aperti e, se l'esistente non è vero, fare una **rettifica
> inventario**.
>
> Il **Gantt** e la **data fattibile** restano calcolati sulla distinta intera, senza togliere
> quello che si prende a scaffale.

**Piano aperto e piano chiuso.** Finché un piano è **aperto**, impegna. Un piano che non serve più
si **chiude**, e la sua quota torna libera per gli altri. Un piano chiuso non sparisce: resta
consultabile, smette solo di impegnare. Si riapre quando serve.

### Alternativi e sostitutivi (modulo, dalla 0.118.0)

Si accende in *Gestione → Aree e moduli*. Spento, non si vede niente di quanto segue e il
fabbisogno lo ignora; i dati già scritti restano e riaccendendolo tornano com'erano.

**Due cose diverse.** Un **alternativo** è un articolo equivalente, da usare al posto del
principale quando il principale manca: il cuscinetto FAG al posto dell'SKF. Il **sostitutivo**
prende il posto di un articolo **fuori produzione**, per sempre.

**Dove si dichiarano.** Nel pannello laterale di un commerciale, di una materia prima o di una
parte comprata: scheda **Alternativi**, pulsante **Modifica alternativi**. Si aggiungono in ordine
di preferenza, con una nota (*stesse quote, gioco radiale diverso*). Valgono **in tutte le
distinte**: si dichiarano una volta sola. Un alternativo si conta **uno a uno** e con la **stessa
unità** del principale; un articolo in metri non sostituisce un articolo in pezzi. Il sostitutivo
si sceglie nella stessa finestra, e solo su un articolo segnato come non più utilizzabile. In
distinta, accanto alle righe che hanno equivalenti, compare il segno **⇄**.

**Il fabbisogno propone, tu decidi.** Nella lista d'acquisto di un piano, una riga che ha ancora
qualcosa da comprare e un alternativo con merce **libera** (esistente + in arrivo − impegnato dagli
altri piani) porta il pulsante **⇄ alternativo a scaffale**. Un obsoleto con sostitutivo porta
sempre **⇄ obsoleto: c'è …**, anche senza giacenza, perché il principale non si compra più. Il
pulsante apre la finestra **Usa un alternativo**: per ogni equivalente dice quanto è libero e
propone una quantità (quella che manca, fin dove l'alternativo basta); **Usa** la registra.

**Cosa cambia con la decisione.** Vale **per quel piano soltanto**. La quantità scelta passa dal
principale all'alternativo, e da lì in avanti l'alternativo è un articolo come gli altri: la lista
d'acquisto, il netto, gli impegni verso gli altri piani, le richieste e gli ordini generati, il
**montaggio** (che scarica l'alternativo per la quota decisa), gli **ordini di produzione** del
piano (che congelano il materiale alternativo) e il materiale mandato al terzista. Una sostituzione per più di quanto serve si ferma
a quanto serve. Le righe lo dicono: *⇄ 15 pz all'alternativo* sul principale, *⇄ al posto di …*
sull'alternativo. **Annulla**, nella stessa finestra, rimette tutto sul principale. Una decisione
che non sposta più niente resta scritta finché qualcuno non la toglie.

**Cosa non cambia.** La distinta, la costificazione e le revisioni restano sul principale: è
quello progettato.

**Il Riepilogo** segnala le distinte che usano ancora un articolo fuori produzione che ha un
sostitutivo (segnale 14 del [cap. 5](#5-riepilogo--richiede-attenzione)).

### Generare i documenti

I tre pulsanti **Genera richieste / ordini / ordini di lavoro** aprono la stessa finestra: le righe
**raggruppate per fornitore**, ciascuna con la sua casella di selezione e la quantità — dichiarata
come netta o lorda secondo l'interruttore attivo. Si spunta cosa includere e si conferma. Ne esce
**un documento per fornitore**.

La finestra di **Genera ordini di produzione** mostra l'importo di ogni parte: dalla 0.105.6 è il
**costo dei pezzi da lanciare** (prima diceva € 0,00 su ogni riga, perché una parte fatta in casa
non ha listino né fornitore).

---

## 20. Richieste di offerta (RFQ)

**A cosa serve.** Chiedere un prezzo. Numerazione **`RFQ-<anno>-NNN`**.

**Come ci si arriva.** 🛒 *Acquisti → Richieste offerta*.

**Comandi dell'elenco.** **+ Nuova richiesta** · **Confronta offerte** · **Esporta Excel** ·
**Esporta PDF**.

**Filtri.** Ricerca «Cerca numero, oggetto, fornitore o riga…» (cerca **anche dentro le righe** del
documento); **Tutti gli stati**; **Tutti i fornitori** (con la voce «senza fornitore»); **periodo**;
contatore; **✕ Azzera filtri**, che compare solo quando c'è un filtro attivo.

**La toolbar del documento.**

| A sinistra | A destra |
|---|---|
| chiudi · numero · badge di stato · **Salva** · **Elimina** | **Crea ordine** |

**I campi di testata.**

| Campo | Note |
|---|---|
| **Titolo / oggetto** | Di cosa si tratta |
| **Fornitore** | A chi si chiede |
| **Data** | Del documento |
| **Stato** | Bozza · Inviata · Offerta ricevuta · Chiusa |
| **Tipo di trasporto / resa** | Con i suggerimenti da *Gestione → Condizioni offerta*; si precompila con quello predefinito del fornitore |
| **Tipo di pagamento** | Idem |
| **Note per il fornitore** | Escono sul documento |
| 🔒 **Note interne** | **Non compaiono mai su PDF ed Excel.** Restano nell'app, passano alla richiesta convertita in ordine, e sono modificabili in qualunque stato |

**Le righe.** Pulsanti **+ Da catalogo** (con i filtri per tipo e famiglia) e **+ Riga manuale**
(Descrizione, Codice opzionale, U.M., Quantità, Nota — per quello che non è a catalogo).

La tabella è **a due piani**: le colonne sono coppie, una sopra l'altra —
Codice/Descrizione · Q.tà/U.M. · Prezzo unit./Importo · Data consegna · Modifica/Elimina.
Dodici colonne su una riga sola costringerebbero a scorrere in orizzontale, e il codice uscirebbe
di vista; così le due metà si leggono insieme. **Una riga di documento resta un solo rigo.**

**Il documento.** La barra **Documento di richiesta** ha **Genera documento PDF** e
**Genera documento Excel**. Sono **disabilitati finché ci sono modifiche non salvate**: non si
manda a un fornitore un documento diverso da quello che si ha in archivio. Il **PDF è bilingue
italiano/inglese**.

**I prezzi di ritorno.** Quando arriva l'offerta si scrivono i prezzi nelle righe. La barra
**Prezzi d'offerta** ha il pulsante **Registra a listino (N)**, che trasforma quei prezzi in
quotazioni negli articoli (→ [cap. 10](#10-listino-fornitori)). Se le righe sono più di una si apre
l'elenco dei prezzi da registrare, tutti spuntati: togli la spunta a quelli che non vuoi a listino.
Una riga lasciata fuori resta da registrare e la puoi aggiungere più tardi. La data della quotazione
è quella di registrazione, non quella della richiesta.

**Confronta offerte.** Sotto-vista che mette a fianco i prezzi di più richieste sullo stesso
materiale. Il totale più basso, in verde, si cerca **solo fra le offerte complete** (dalla
0.105.6): un fornitore che quota una riga su tre ha per forza il totale più basso, e prima finiva
in verde. Ora il suo totale dice **incompleta (1/3)** — quante righe ha quotato su quante.

**Da sapere.** Una richiesta può contenere **insieme materiale e lavorazioni** dello stesso
fornitore — chiedere quanto costa il pezzo e quanto costa lavorarlo è una domanda sola.
Convertendola, la richiesta **si divide** nei due ordini: l'ODA per la merce, l'ODL per le
lavorazioni.

---

## 21. Ordini a fornitore (ODA)

**A cosa serve.** Comprare merce. **Gli ODA non contengono lavorazioni**: quelle stanno negli ODL.

**Come ci si arriva.** 🛒 *Acquisti → Ordini fornitore*.

**Da dove nasce un ordine.** Da una **richiesta di offerta** (pulsante *Crea ordine*), da un
**piano di fabbisogno** (*Genera ordini*), oppure **da zero** con **+ Nuovo ordine**.

**Comandi dell'elenco.** **+ Nuovo ordine** · **Esporta Excel** · **Esporta PDF**.
Stessi filtri delle richieste.

**La toolbar del documento.** chiudi · numero · badge di stato · **Salva** · **Elimina**.

**I campi di testata.** Come la richiesta, più:

| Campo | Note |
|---|---|
| **N° conferma d'ordine fornitore** | Il numero che il fornitore restituisce. **Compilandolo, lo stato passa a *Confermato*.** |

**Le righe.** **+ Da catalogo** · **+ Riga manuale** · **✓ Segna tutto ricevuto**.
Tabella a due piani: # · Codice/Descrizione · Q.tà/U.M. · Prezzo unit./Importo ·
**Richiesta/Confermata** (le due date) · **Ricevuto/Residuo** · azioni.
In fondo il **Totale imponibile**.

**Il documento.** La barra **Documento d'ordine**: **Genera documento PDF** /
**Genera documento Excel**.

**Da sapere.**

- Se il fornitore conferma una data **oltre** quella richiesta, l'app lo dice **in rosso** sulla
  riga, con i giorni di ritardo (lavorativi, se così si contano i giorni dei fornitori).
- **Il ricevimento carica il magazzino.** Non serve registrare anche un movimento; anzi, farlo
  raddoppierebbe la merce.
- Lo stato passa da solo a **Parziale** e poi a **Evaso** man mano che si registrano i ricevimenti.
- **Il listino del fornitore si propone** (dalla 0.105.6). Scelto o cambiato il fornitore di un
  ordine — o il terzista di un ordine di lavoro — l'app guarda le sue quotazioni e, se ha a listino
  articoli dell'ordine, chiede «**Applicare il listino di …?**». Di serie il prezzo va solo alle
  righe **senza prezzo**; a quelle che ne hanno già uno diverso solo spuntandolo, perché quel numero
  può essere un prezzo concordato. Rifiutando, nessun prezzo cambia: è la regola di sempre, il
  prezzo non si sostituisce da sé. La richiesta d'offerta resta fuori: lì il prezzo è la risposta
  del fornitore, non un listino da applicare.
- **«Salva» a vuoto non tocca il documento** (dalla 0.105.6). Premuto su una richiesta, un ordine
  o un ordine di lavoro senza modifiche, lo segnava come modificato anche per chi non può scriverlo,
  e con l'archivio condiviso il server respingeva l'invio. Ora, se non è cambiato niente, non si
  scrive niente.

---

## 22. Ordini di produzione (ODP)

**A cosa serve.** Seguire una parte lungo il suo **ciclo di lavorazione**: quali fasi ha fatto,
quante ne restano, dove sono i pezzi adesso, e muovere il magazzino nei due soli punti in cui
va mosso. Numerazione **`ODP-<anno>-NNN`**.

È il documento che fino alla 0.73 mancava, e la sua assenza si sentiva soprattutto su una cosa:
una parte con il ciclo **tutto interno** non aveva nessun documento: nessuno la lanciava, il suo
materiale non usciva mai dal magazzino e il pezzo finito non entrava mai, se non con un *Carico
manuale* scritto a mano.

**Come ci si arriva.** 🏭 *Produzione → Ordini di produzione*.

### Da dove nasce

Due strade, e producono lo stesso documento:

- dal **fabbisogno**, col pulsante **Genera ordini di produzione**: dalla sezione *Da fabbricare*,
  **uno per parte**, e dalla 0.124.0 anche dalla sezione *Da montare*, uno per assieme con un ciclo;
- **a mano**, con *+ Nuovo ordine di produzione*: si sceglie la parte o l'assieme fra quelli che un
  ciclo ce l'hanno, i pezzi e la data.

**L'ODP di un assieme** (dalla 0.124.0) ha per fasi quelle del ciclo di montaggio e per materiale
i **componenti diretti a magazzino** della distinta, con lo scarto e le sostituzioni del piano,
come un montaggio dichiarato: i sottoassiemi non escono, si montano col loro ordine. Un assieme non
ha giacenza: sull'ultima fase i buoni dichiarati sono gli assiemi **montati**, contano come fatti
nel piano e nell'avanzamento, e il magazzino non si muove. Fasi interne in reparto, timbrature,
capacità finita, ordini di lavoro per le fasi dal terzista e consuntivo funzionano come per una
parte. Un ordine così **non è legato a nessun piano**, e nel fabbisogno
  quella parte continuerà a risultare da fabbricare.

### Bozza e lancio

Nasce in **bozza**: quantità, date e commessa si cambiano ancora. **Lancia** apre la produzione e
da lì **fasi e materiale si congelano**: il ciclo può cambiare domani, l'ordine resta quello che
è stato promesso.

**Lo stato si cambia con i comandi** (dalla 0.105.4), anche dalla tendina *Stato*: scegliere
*Annullato* è come **Annulla** (chiede del materiale da rendere), *Chiuso* come **Chiudi**,
*Lanciato* da una bozza come **Lancia**, con i suoi controlli. *In corso* e *Completato* li dà
l'avanzamento delle fasi; un ordine con delle dichiarazioni non torna in *Bozza*, e riaperto da
chiuso o annullato prende lo stato che dicono le sue fasi.

> Ogni fase congelata ha un **id proprio**, non una posizione. Riordinare le fasi del ciclo dopo
> il lancio **non sposta niente** su un ordine già aperto — che è il motivo per cui si congela.

### La tabella delle fasi

Si legge dall'alto in basso come si esegue il ciclo. Per ogni fase: numero, lavorazione, **dove**
(Interna, o il nome del terzista), **pianificata**, **da fare / fatti / scarti**, stato e comandi.

**Pianificata** (dalla 0.90.0) è l'inizio e la fine della fase, calcolati a ritroso dalla data
*Serve per* dell'ordine con le stesse regole del fabbisogno (→ [cap. 19](#19-fabbisogno-materiali)),
sulle fasi **congelate** dell'ordine. In **bozza** le date seguono pezzi e *Serve per*; dopo il
lancio stanno ferme — una fase che slitta deve vedersi: se non è chiusa e la fine è passata compare
⚠ — e si ricalcolano solo con **↻ Ripianifica**, che lascia com'erano le fasi già chiuse.

| Stato della fase | Significato |
|---|---|
| **In attesa** | La precedente non è chiusa. La riga dice *quale* e con quali numeri |
| **Avviabile** | È il suo turno |
| **In corso** | Avviata, si dichiara l'avanzamento |
| **Chiusa** | I pezzi dichiarati coprono quelli entrati |

**Comandi:** *avvia* · *dichiara* · *chiudi* · *riapri* · *forza avvio* · *genera ordine di lavoro*.
Compaiono **solo dove sono leciti**: una fase in attesa non mostra un pulsante spento, dice perché
e da chi.

### La successione, e come si scavalca

Una fase **non si avvia** finché la precedente non è chiusa, e il rifiuto la nomina:
«la fase 10 Tornitura non è chiusa: 6 di 10».

**Forza avvio** resta possibile — un pezzo campione da consegnare prima è un caso vero — e
pretende un **motivo**. La forzatura finisce nello storico dell'ordine con il suo motivo, e la
fase resta marcata: non è un permesso speso e dimenticato.

### Pezzi buoni e scarti

Su ogni fase si dichiarano **pezzi buoni** e **scarti**. La fase si chiude quando la somma dei due
copre i pezzi **entrati**.

> **Solo i pezzi buoni proseguono.** 100 lanciati, 95 buoni e 5 scarti alla fase 10 significa che
> alla 20 ne entrano **95**, e che a magazzino entrerà la **resa vera**, non la quantità lanciata.

Una dichiarazione sbagliata si **annulla** dallo storico, e con lei se ne vanno i movimenti di
magazzino che aveva generato — solo i suoi.

**Si annulla rispettando la successione** (dalla 0.105.6), con le stesse regole di *riapri*: una
dichiarazione si annulla solo se **la fase dopo non è ancora partita**. Se la 20 ha già lavorato
i pezzi della 10, si annullano prima le dichiarazioni della 20, poi quella della 10. Prima si
poteva togliere l'avanzamento della 10 a 20 già lavorata, e la 20 restava con zero da fare e dieci
fatti, mai chiusa, con l'ordine di nuovo *in corso*.

**Un avvio sbagliato si annulla** (dalla 0.105.6). Finché la fase non ha dichiarazioni, il suo
avvio ha nello storico il suo **Annulla**: è il rimedio a una fase avviata per sbaglio. Sulla
prima fase rimette a scaffale il materiale uscito **con quell'avvio**; quello prelevato dopo con
*Preleva il resto* resta uscito.

**Le fasi che non ricevono pezzi si chiudono da sole** (dalla 0.105.6). Se la 10 finisce tutta
in scarti, o si chiude con zero pezzi buoni, alla 20 non arriverà mai niente: chiusa la 10, le
fasi dopo si chiudono anche loro, e l'ordine si **completa** invece di restare *in corso* con il
materiale nel lavoro in corso. Prima restavano *avviabili* con zero da fare, e bisognava avviarle e
chiuderle a mano una per una.

### Il magazzino: due movimenti, e il silenzio in mezzo

Vale identico per un ciclo **tutto interno**, **tutto esterno** o **misto**.

| Momento | Se la fase è… | Movimento | Codice | Effetto |
|---|---|---|---|---|
| **Avvio della prima fase** | interna | Consumo di produzione | i **codici del ciclo** | **−** |
| **Avvio della prima fase** | esterna | Uscita a conto lavoro | i **codici del ciclo** | **−** |
| **Fra le fasi** | — | **nessuno** | — | nessuno |
| **Ultima fase** | interna | Versamento di produzione | il **codice della parte** | **+** |
| **Ultima fase** | esterna | Rientro da conto lavoro | il **codice della parte** | **+** |

**Perché in mezzo non si scrive niente.** Un movimento nomina una quantità di un **codice**. Fra la
prima e l'ultima fase i pezzi non sono più il materiale e non sono ancora la parte: la parte lo
diventano al rientro dell'ultima fase. Scrivere un movimento col codice della parte prima di allora
inventerebbe una giacenza che non esiste, e la farebbe comparire presso un terzista che quella
parte non l'ha mai avuta.

**Dove sono i pezzi, allora.** Lo dice la **fase corrente** dell'ordine — in casa, o presso il
terzista di quella fase — e il prospetto *Presso terzi* del Magazzino legge anche da lì, marcando
le righe con la fase. Sono due letture distinte e restano distinte: quella dei movimenti, per gli
ordini di lavoro, e quella degli ordini di produzione.

Il **materiale esce una volta sola**, all'avvio della prima fase, ed è quello scritto nel ciclo —
le stesse righe che il fabbisogno ha già fatto comprare. La scheda propone il **residuo**, e a
residuo zero lo dice.

**Preleva il resto** (dalla 0.105.4): se all'avvio è uscito meno del previsto — lo scaffale non
bastava, il resto arriva dopo — nel riquadro *Materiale del ciclo* compare **Preleva il resto**.
Propone il residuo, si corregge riga per riga, ed esce come all'avvio: consumo di produzione, o
uscita a conto lavoro verso il terzista della prima fase.

### Le lavorazioni esterne

Su una fase in conto lavoro compare **genera ordine di lavoro**: ne nasce un ODL per quel terzista,
con la tariffa del ciclo e **i pezzi che ci sono davvero** (i buoni usciti dalla fase precedente,
non quelli lanciati). La consegna chiesta sulla riga è il **rientro pianificato della tratta**, non
la fine dell'ordine (sugli ordini creati prima della 0.90.0, senza date di fase, resta la fine
dell'ordine). Le fasi **consecutive** dello stesso terzista fanno **una riga sola**: sono
una lavorazione da commissionare, non due.

**Una tratta già commissionata dal fabbisogno** (dalla 0.105.8). Se l'ordine di lavoro di quella
tratta è stato generato dal piano prima dell'ODP, l'ODP non offre più **genera ordine di lavoro**:
al suo posto mostra il numero di quell'ordine, che si apre con un clic. Vale per il primo ODP del
piano che ha quella fase; un ODP rilanciato dopo, per i pezzi mancanti, commissiona i suoi. Al
contrario, una tratta commissionata dall'ODP esce già dalla generazione degli ordini di lavoro del
piano. Dalla 0.116.0, una volta **lanciato** l'ODP, è lui il padrone anche di quella tratta: avvio e
rientri si registrano sulle sue fasi, da qualunque dei due documenti, e i **rientrati** dell'ordine
di lavoro li scrive lui. Se la riga del piano era già partita da sola prima del lancio, al lancio i
suoi avvii e rientri **passano all'ODP** così come sono: il materiale non esce una seconda volta e i
pezzi già tornati restano dichiarati.

**Chi genera l'ordine di lavoro** (dalla 0.105.6): chi scrive gli ordini, cioè l'*Ufficio
acquisti* e l'amministratore. Un ordine di lavoro è un documento con un prezzo e un fornitore, e
il ruolo *Officina e magazzino* non lo genera più da un ODP: avvia, dichiara e riceve, ma il
documento per il terzista lo emette l'ufficio.

> Su quella riga **avvia** e **dichiara** dell'ODL aprono le schede di questo ordine, accanto al
> rimando «ODP-… › fase 20-30». Il magazzino ha **un padrone solo**: il gesto è uno, in qualunque
> dei due documenti lo si faccia. Anche i **pezzi rientrati** dell'ODL li scrive la dichiarazione
> fatta qui: i buoni dell'ultima fase della tratta più gli scarti di tutta la tratta.

**Le fasi di una tratta dal terzista** (dalla 0.116.0). Dentro una tratta — fasi consecutive dallo
stesso terzista — la fase dopo si avvia appena è avviata quella prima, senza aspettare che sia
chiusa: i pezzi passano dall'una all'altra presso di lui, e i primi tornano finiti prima che
arrivino gli ultimi. Per lo stesso motivo una fase non è mai chiusa mentre la precedente aspetta
ancora dei pezzi. Dall'ordine di lavoro la tratta si **dichiara in un colpo**: si dice quanto è
tornato, buoni e scarti, e ogni fase della tratta avanza di conseguenza.

### Nel fabbisogno

- *Da fabbricare* dice ora **quando** la parte serve e **se è già stata lanciata**, col numero
  dell'ordine.
- *Da far lavorare fuori*: una fase coperta da un ordine di produzione porta **«coperta da
  ODP-…»** ed esce dalla generazione diretta di ordini di lavoro — l'ordine si genera da lì,
  quando la fase precedente è chiusa. Le fasi **non** coperte restano generabili dal piano come
  prima.

### Da sapere

- **Il fabbisogno netto non si applica** a un ordine di produzione: lanciare un pezzo è una
  decisione di produzione, non di acquisto.
- Un ordine di lavoro **senza** un ordine di produzione dietro ha **avvia** e **dichiara** suoi, con
  gli stessi movimenti (→ [cap. 23](#23-ordini-di-lavoro-odl-e-conto-lavoro)). Chi usa entrambe le
  strade sullo stesso codice vede due letture del *Presso terzi*, ed è per questo che il prospetto
  le tiene separate invece di fonderle.
- **Annullare non è eliminare**: un ordine annullato smette di coprire la parte nel fabbisogno, ma
  i movimenti già registrati restano. Eliminarlo invece toglie anche quelli, e la scheda lo avvisa.
- **Annullare con il reso** (dalla 0.100.0): se l'ordine aveva già fatto uscire il materiale,
  **Annulla** apre una finestra che propone di **rimetterlo a magazzino** — tutto quello uscito se
  nessun pezzo è stato lavorato, in proporzione ai pezzi non ancora lavorati della prima fase se
  qualcuno lo è. Le quantità si correggono; a zero non si rende niente. Il reso è un movimento
  **Reso da produzione** (o un **Rientro da conto lavoro** dal terzista, se la prima fase era
  esterna), legato all'ordine. I pezzi già lavorati restano fuori: sono scarto o semilavorato, e si
  sistemano con una rettifica.
- **All'avvio della prima fase** la finestra mostra, per ogni codice del ciclo, quanto c'è a
  magazzino, e avvisa se l'uscita lo porta sotto zero.

---

## 23. Ordini di lavoro (ODL) e conto lavoro

Questo è il capitolo più delicato, e conviene leggerlo per intero prima di registrare il primo
movimento di conto lavoro. Numerazione **`ODL-<anno>-NNN`**.

**A cosa serve.** Una fase del ciclo con un **fornitore** è una lavorazione affidata a un terzista,
ed è denaro che esce come qualunque acquisto. L'ODL è il suo documento: elenco proprio, numerazione
propria, stampa propria.

**Come ci si arriva.** 🏭 *Produzione → Ordini di lavoro*.

### Uno per terzista *e per passata*

Le fasi affidate a Beta finiscono in un ODL solo, anche se sono di parti diverse. Ma un pezzo che
torna da Beta una **seconda** volta — fasi 20 e 40, con la 30 in mezzo altrove — finisce in un
**secondo** ODL: fra le due il pezzo torna da noi, e chiedergliele insieme sarebbe un ordine che
non si può eseguire di seguito.

*(La **richiesta d'offerta** invece le tiene insieme: chiedere non è commissionare.)*

### La tratta

Una riga di ODL è una **tratta**: le fasi **consecutive** dello stesso terzista stanno insieme —
«fasi 20-30» — perché sono **una** lavorazione da commissionare e non due. Prezzo e giorni sono
sommati, e il dettaglio di ciascuna fase sta nella nota.

La riga porta il **codice della parte** (è il pezzo che il terzista riceve e rispedisce), i
**pezzi** come quantità, e la tariffa del ciclo come prezzo. A costo orario la nota dice
*ore/pezzo × tariffa*.

### I campi

**Testata**: Titolo/oggetto · **Terzista** · Data ordine · Stato · Trasporto · Pagamento ·
**N° conferma del terzista** · Note · 🔒 Note interne.

**Righe — «Lavorazioni»**: **+ Lavorazione da ciclo** · **+ Riga manuale** ·
**✓ Dichiara tutto rientrato** (il residuo di ogni riga avviata, come pezzi buoni).
Sotto ogni riga i suoi comandi, **avvia** e **dichiara**; sotto la tabella lo storico **Avvii e
rientri**, dove un gesto sbagliato si annulla.
Tabella a due piani: # · **Parte/Lavorazione** · **Pezzi/U.M.** · **Tariffa (€/pz)/Importo** ·
**Inizio lavoro/Stato** · **Richiesta/Confermata** · **Rientrati/Ancora fuori**.

### Emettere l'ODL non è inviare

*(dalla 0.113.0)* L'ODL si genera **prima** dell'invio, per avvisare il terzista che a quella data
prenderà in carico la lavorazione. Per questo ogni riga porta l'**Inizio lavoro**: il giorno in cui
gli consegniamo il materiale. Si compila da solo con la data d'invio della tratta (dal programma del
piano, o dall'inizio pianificato della fase sull'ordine di produzione), si può correggere ed esce
nel PDF e nell'Excel accanto alla data di consegna. Se c'è, il programma del piano usa quella.

Sotto la data, lo **stato** della lavorazione:

| Stato | Quando | Sull'ordine di produzione |
|---|---|---|
| **Da inviare** | la riga non è ancora avviata, anche con l'ODL inviato | fase non avviata |
| **In lavorazione** | **Avvia** sulla riga | **Avvia** sulla fase |
| **Rientrata** | i pezzi sono tutti tornati: dichiarati, buoni e scarti | **Dichiara**: la tratta è chiusa |

Lo stato *Inviato* del documento dice che il terzista ha ricevuto l'**ordine**, non il materiale.

**Scrivere un ODL a mano.** *+ Lavorazione da ciclo* fa scegliere la parte fra quelle che un ciclo
ce l'hanno, poi la tratta, poi i pezzi. Si vedono **tutte** le fasi — anche quelle di un altro
terzista e quelle interne, marcate — perché mandare fuori una lavorazione che di solito si fa in
casa è un caso vero. La riga che ne esce è identica a quella generata dal fabbisogno; l'ordine però
**non è legato a nessun piano**, e lì la fase continuerà a risultare da ordinare.

Le fasi **senza** fornitore sono interne e restano fuori dagli ODL: non si comprano, si vedono nel
Carico centri.

### Avvia e dichiara

*(dalla 0.116.0)* Sono gli stessi due gesti dell'ordine di produzione (→
[cap. 22](#22-ordini-di-produzione-odp)), e prendono il posto di *spedisci materiale*, *manda al
terzista*, *ritira dal terzista* e *registra rientro*.

- **Avvia** quando il materiale parte. Propone quel che esce — il materiale del ciclo all'inizio
  della prima tratta, i pezzi stessi sulle tratte dopo — al netto di quanto è già uscito. Una riga
  si avvia una volta sola; in **bozza** non si avvia, perché l'ordine non è ancora arrivato al
  terzista.
- **Dichiara** quando i pezzi tornano: **buoni** e **scarti**. Entrambi contano come
  **rientrati** e portano l'ordine a *Parziale* e poi a *Evaso*; solo i buoni, alla fine del ciclo,
  entrano a magazzino.

**Chi è il padrone della riga** — cioè dove si registra il gesto:

| La riga viene… | Avvia e dichiara scrivono… |
|---|---|
| da un **ordine di produzione** | sulle fasi dell'ODP: la scheda che si apre è la sua |
| dal **fabbisogno**, e il piano ha un ODP **lanciato** per quella parte | sulle fasi dell'ODP, come sopra |
| dal **fabbisogno**, senza ODP (o con l'ODP ancora in bozza) | sulla riga stessa |
| da **+ Lavorazione da ciclo** o **+ Riga manuale** | sulla riga stessa (la riga manuale non muove il magazzino) |

Sugli ordini di lavoro di prima, con una riga per fase, la tratta si avvia dalla riga della prima
fase e si dichiara da quella dell'ultima; le righe in mezzo lo dicono. I movimenti registrati con i
comandi di prima continuano a contare: una riga da cui era già uscito il materiale risulta avviata.

**Annullare.** Nello storico *Avvii e rientri* ogni evento ha il suo cestino: annullare un rientro
toglie i suoi movimenti e i suoi pezzi dai rientrati; un avvio si annulla quando la riga non ha
rientri, e il materiale uscito con lui torna a scaffale. Una riga avviata non si elimina, e
nemmeno l'ordine: si annulla prima l'evento.

**Dal telefono** (*Ricevi tutto*, *Ricevi una parte*) un ODL si riceve dichiarando: compaiono solo
le righe avviate, e il rientro muove il magazzino come dalla scrivania.

### Il magazzino si muove in due punti soli

E sono i **due estremi del ciclo**, non quelli del documento.

```
   MAGAZZINO                                                    MAGAZZINO
       │                                                            ▲
       │ ── SCARICO ──▶  Beta  ──passaggio──▶  Gamma  ── CARICO ────┘
       │  materiale del    fase 20            fase 30    pezzo finito
       │  ciclo                                          (in casa)
   (fase 10 interna)
```

| Momento | Movimento | Effetto |
|---|---|---|
| **Prima tratta esterna** | Uscita a conto lavoro | **−** esce il materiale del ciclo |
| **Ogni estremo in mezzo** | Passaggio di lavorazione | **nessuno**: cambia il luogo |
| **Ultima tratta** | Rientro da conto lavoro | **+** entra il pezzo finito |

**Perché.** Senza questa distinzione, una parte lavorata due volte dallo stesso terzista farebbe
uscire il materiale due volte e caricare il pezzo due volte. Due fasi dallo stesso terzista sono
**due lavorazioni sullo stesso pezzo**, non due pezzi.

**Il materiale esce una volta sola**, alla prima fase di ogni parte, ed è quello scritto nel suo
**ciclo di lavorazione** — le stesse righe che il fabbisogno ha già fatto comprare — con le
quantità proposte in automatico: *q.tà del ciclo × pezzi dell'ordine*.
**I pezzi rientrano una volta**, all'ultima fase. Le fasi in mezzo **non muovono il magazzino e lo
dicono**, invece di offrire un comando che farebbe uscire la stessa merce due volte.

Le schede propongono sempre il **residuo** — quanto resta da spedire o da far rientrare.

### Rientrati ≠ caricato

> Il campo **Rientrati** sull'ODL significa **pezzi tornati**, buoni e scarti: porta l'ordine a
> *Parziale* e poi a *Evaso*. Non si scrive a mano: lo scrive **Dichiara**, che nello stesso gesto
> carica il magazzino quando tocca. Sono due domande diverse — «l'ordine è finito?» e «il pezzo è a
> scaffale?» — e hanno due risposte diverse, ma un gesto solo.

---

## 24. Carico dei centri di lavoro

**A cosa serve.** Sapere quante ore i piani stanno chiedendo a ciascun centro, settimana per
settimana, e se il centro regge. La schermata si intitola **«Carico centri di lavoro»**.

**Come ci si arriva.** 📋 *Pianificazione → Carico centri*.
La stessa tavola, ristretta a un solo piano, sta anche in fondo alla scheda di ogni piano.

**È un prospetto derivato, in sola lettura.** Non c'è niente da compilare.

**Comandi.** **Esporta Excel** · **Esporta PDF**.

**Filtri.** **Tutti i piani aperti (N)** oppure un piano solo; **Tutti i centri** oppure un centro
solo. Cliccando il nome di un centro, le letture si restringono a quello.

**Cosa si vede.**

1. **L'avviso di sovraccarico** in testa, con le settimane sfondate e i centri nominati.
2. Il **grafico a barre** per centro — una barra per settimana, la capacità come linea:

   | Colore | Saturazione |
   |---|---|
   | neutro | sotto l'85% |
   | arancio | 85–100% |
   | rosso | oltre il 100% |

   Il grafico serve a dire **dove guardare**: ogni barra porta comunque il suo numero, e la tavola
   resta la lettura esatta.
3. La **tavola centro × settimana** con la saturazione in percentuale.
4. **I codici da produrre**: codice, pezzi, settimana, e le fasi interne con ore/pezzo e ore
   totali, ordinati per settimana e per ore decrescenti. È la risposta a «cosa lancio per primo».

**Il dettaglio di cella.** Cliccando una cella si apre **chi** ha portato quelle ore: parte, fase,
piano.

**Da sapere — quattro avvertimenti**, perché il prospetto non prometta più di quel che dà:

1. **La capacità è infinita.** Il sovraccarico **si vede, non si sposta**: le date vengono dalla
   programmazione a ritroso (→ [cap. 19](#19-fabbisogno-materiali)), che non guarda il carico.
2. **Le ore stanno nella settimana in cui la fase comincia**, programmata a ritroso dalla
   consegna sul calendario di fabbrica (dalla 0.88.0; prima stavano nella settimana in cui il
   pezzo serviva pronto).
3. **Le fasi in conto lavoro non caricano nessun centro interno**: quelle si comprano, e stanno nel
   fabbisogno.
4. **Capacità 0 = «non dichiarata»**, non «nessuna capacità». Un centro senza capacità mostra le
   ore e non il sovraccarico.

E una regola di lettura: **i pezzi di un codice non si sommano fra le sue fasi** — ogni fase lavora
gli stessi pezzi — **mentre le ore sì**.

### Coda a capacità finita (modulo Capacità finita, dalla 0.123.0)

Il carico qui sopra è a capacità **infinita**: dice quando ogni fase deve partire perché la
consegna regga, e il sovraccarico si vede ma non sposta niente. Con il modulo **Capacità finita**
acceso (→ [cap. 25](#25-gestione), *Moduli*) sotto la tabella compare la **Coda a capacità
finita**: il conto fatto in avanti, da oggi.

- Entrano le fasi **interne** non chiuse degli ODP **lanciati e in corso**, ordine per ordine
  **per data di consegna** (la più vicina prima).
- Ogni fase occupa il suo centro per le ore del ciclo sui pezzi ancora da fare (anche quelli
  che devono ancora arrivare dalla fase prima), più l'attrezzaggio della fase se non è partita, senza superare le ore che il centro intero dà in un giorno (la
  capacità settimanale divisa per i giorni lavorativi, o senza capacità le ore di un operatore) né
  quelle dei suoi operatori (ore al giorno di un operatore × operatori della fase), nei giorni lavorativi del
  calendario di fabbrica e **fuori dai fermi** registrati in manutenzione.
- Una fase comincia il giorno lavorativo dopo la fine della precedente, più i suoi giorni di coda
  se non è ancora partita. Una fase esterna non occupa centri: dura i suoi giorni dal terzista più
  il trasporto (una volta per tratta).

Per ogni centro la coda dice ordine, fase, ore, dal / al e la data in cui l'ordine serve; in
rosso le fasi di un ordine che finisce dopo. Nella scheda dell'ODP una riga sopra le fasi dice
la **data fattibile** a capacità finita, e nel Riepilogo c'è il segnale *ordini di produzione in
ritardo a capacità finita*.

**Propone, non comanda.** Le date pianificate degli ordini e del fabbisogno restano quelle a
ritroso: la coda è un avviso da guardare, non una data riscritta. Le fasi non si spostano a mano.

Con il modulo **Macchine utensili** una fase assegnata a una macchina fa la fila anche su di lei:
una macchina lavora al più le ore al giorno di un operatore del suo centro, in ore di macchina
(le ore-uomo della fase divise per i suoi operatori), e due fasi sulla stessa macchina se le
dividono. Il fermo di una macchina ferma lei sola, e al centro toglie la sua parte (tre macchine,
una ferma: due terzi delle ore).

---

### Macchine utensili (modulo, dalla 0.126.0)

Il **centro di lavoro** è il reparto (Tornitura), la **macchina** è la risorsa che ci sta dentro
(il tornio CNC, il tornio parallelo). Il modulo si accende in *Gestione → Aree e moduli* e
porta la scheda *Gestione → Macchine utensili* (→ [cap. 25](#25-gestione)).

**Il costo: operatore più macchina.** Con le macchine la tariffa del centro è quella della
**manodopera**, e la macchina aggiunge la sua sulle **ore di macchina**, cioè le ore-uomo della
fase divise per gli operatori (quanto dura la fase):

> costo fase oraria = ore-uomo × tariffa del centro + (ore-uomo ÷ operatori) × tariffa della macchina

80 ore-uomo con 2 operatori, centro a 30 €/h e tornio a 25 €/h: 80 × 30 + 40 × 25 = 3.400 €.
**Se la tariffa del centro comprendeva già la macchina, va abbassata**, o il costo la conta due
volte. A costo fisso e sulle fasi dal terzista la macchina non entra. Una fase senza macchina costa
come prima, e spegnendo il modulo la quota macchina sparisce da tutti i costi.

**Nel ciclo** (→ [cap. 14](#14-cicli-di-lavorazione)) ogni fase interna di un centro che ha
macchine mostra la tendina **Macchina** accanto al nome del centro; nel selettore della fase nuova,
se il centro ne ha una sola, si propone da sola. La tariffa si copia sulla fase come quella del
centro, così una revisione rilasciata non cambia; cambiandola in Gestione si aggiornano le fasi dei
cicli che usano la macchina. Passando sopra il costo della riga si legge il conto: operatore e
macchina.

**Nell'ordine di produzione** la fase congela macchina, nome e tariffa del momento del lancio.
Prima dell'avvio si può spostare su un'altra macchina dello stesso centro (quella libera), e la
tariffa si ricopia. Il **consuntivo** paga le ore timbrate all'operatore e, divise per gli
operatori, alla macchina.

**Nel reparto** il menu dei centri elenca sotto ciascuno le sue macchine: si filtra per macchina, e
la timbratura porta la macchina della fase.

**Manutenzione.** Piani e interventi si scrivono su un **centro** (tutto il reparto) o su una
**macchina**: un piano di macchina scade sulle ore lavorate da quella macchina, cioè le ore
timbrate sulle fasi assegnate a lei divise per gli operatori; il fermo di una macchina ferma lei
sola. Ogni macchina ha un **contatore**: le ore che aveva quando è stata registrata più quelle
lavorate da allora.

---

### Terminale di reparto (modulo Officina, dalla 0.123.0)

*Produzione → Reparto* è la schermata di chi lavora alla macchina, a pulsanti grandi per il
telefono. Si sceglie il **centro** nella barra a sinistra (sul telefono, la fila sopra le schede;
l'app lo ricorda su quel dispositivo). Ogni centro dice quante fasi ha da lavorare. Compaiono, in
quest'ordine:

- le fasi interne che si possono lavorare adesso, per data di consegna;
- le **fasi future**, in attesa che finisca la fase prima, per inizio previsto e senza pulsanti;
- le fasi **terminate** degli ordini ancora aperti.

In cima a ogni scheda una riga colorata dice la **situazione**: *Da avviare* (blu), *Avviata*
(giallo), *In ritardo* (rosso: secondo le date pianificate dell'ODP doveva già iniziare o finire),
*Terminata* (verde). Sotto ci sono l'**inizio previsto** e la fine della fase, e la data in cui il
pezzo serve. Il riquadro dei numeri dice i pezzi e il **tempo lavorato**, cioè la somma delle
timbrature di tutti, con le ore previste dal ciclo. In fondo una riga dice se la fase è **in
lavorazione** (da quanto e chi ci lavora) o **in pausa**. I tempi si aggiornano da soli ogni minuto.

**Stampa le schede** stampa le schede del centro scelto, due per riga; l'icona della stampante su
una scheda stampa solo quella. Sul foglio ogni scheda porta un **QR** con il numero dell'ODP e la
fase (`ODP-2026-014/20`): inquadrato con il telefono, o letto con *Scansiona*, apre la scheda di
quella fase con i suoi pulsanti, qualunque sia il centro scelto. Perché la fotocamera del telefono
sappia dove andare serve l'indirizzo dell'app in *Gestione › Etichette QR*, come per le altre
etichette.

- **Inizia** apre una **timbratura** a nome di chi è entrato. Se la fase non è ancora avviata,
  prima si apre la finestra di avvio di sempre (sulla prima fase esce il materiale), e la
  timbratura parte dopo.
- **Pausa** chiude la timbratura; **Riprendi** ne apre un'altra.
- **Fine e dichiara** chiude la timbratura e apre la dichiarazione dei pezzi buoni e degli scarti,
  la stessa dell'ODP.

Una persona ha **una sola** timbratura aperta: cominciare un'altra fase mette in pausa quella in
corso. Il **QR**
dell'ODP, con il modulo acceso, porta gli stessi pulsanti. Le ore timbrate entrano nel
**consuntivo** della commessa al posto delle ore del ciclo, e fanno scadere le manutenzioni «ogni
N ore».

### Manutenzione (modulo Officina, dalla 0.123.0)

*Produzione → Manutenzione* tiene i **piani** per centro (o per macchina, con il modulo Macchine
utensili): un intervento ricorrente (cambio olio,
taratura…) **ogni N giorni**, **ogni N ore lavorate**, o tutti e due — scade al primo dei due.
I giorni si contano dall'ultimo intervento registrato (o dalla nascita del piano), le ore sono
quelle **timbrate** su quel centro da allora. Un piano porta i **ricambi di serie**, scritti un
codice per riga con la quantità (`CMM-001 2`).

**Registra** un intervento: la data, i ricambi usati — che **escono dal magazzino** come consumo —
e il **fermo macchina** dal / al, anche futuro: la capacità finita non mette fasi su quel centro
in quei giorni. Un intervento fuori piano si registra dal menu sopra lo storico.

Le manutenzioni scadute sono un segnale del Riepilogo, e la prossima scadenza di ogni piano sta nel
calendario (filtro *Manutenzione*). I piani si creano e modificano da amministratore; gli
interventi li registra anche chi ha il ruolo *Officina e magazzino*.

---

# Parte VI — Amministrazione

## 25. Gestione

**Come ci si arriva.** ⚙️ *Gestione*. **La voce è visibile ai soli amministratori.**

Le schede stanno in una **colonna a sinistra**, raccolte per argomento (dalla 0.127.0; prima erano
una fila di pulsanti in alto). La colonna resta ferma mentre la pagina scorre; al telefono diventa
una riga che scorre di lato.

Gli elenchi delle schede (utenti, fornitori, clienti, condizioni offerta, famiglie e sottofamiglie,
concetti, unità di misura, centri di lavoro, macchine) sono in **ordine alfanumerico** (dalla
0.128.0): per nome, o per codice le unità di misura e le macchine (raccolte per centro di lavoro),
con i numeri contati come numeri, *M2* prima di *M10*, e senza badare a maiuscole e minuscole.
L'ordine è solo quello a video: una voce nuova va al suo posto nell'elenco.

| Gruppo | Schede |
|---|---|
| **Azienda** | Dati azienda · Utenti e accesso |
| **Anagrafiche** | Fornitori · Clienti · Condizioni offerta |
| **Classificazione articoli** | Famiglie commerciali · Famiglie materie prime · Famiglie parti · Concetti · Unità di misura |
| **Pianificazione e produzione** | Calendario di fabbrica · Centri di lavoro · Macchine utensili (con il modulo) |
| **Configurazione** | Aree e moduli · Costi e margini · Codifica articoli · Etichette QR |
| **Dati** | Import · Backup |

Fino alla 0.126 *Impostazioni* era una pagina sola con costi, codifica, sessione, aree e moduli,
calendario ed etichette QR. Ora ogni argomento ha la sua pagina, e il suo **Salva impostazioni**
salva solo i campi di quella pagina. Sono gli archivi e le regole che alimentano tutto il resto
dell'app.

### 👥 Utenti e accesso

Elenco con nome, email, ruolo e stato *Attivo / Sospeso*. Azioni per riga: **Modifica**,
**Imposta password**, **Sospendi / Riattiva**, **Elimina**.
Form del nuovo utente: Nome e cognome · Email · Username (facoltativo) · **Ruolo** · **Colore** ·
Password iniziale. → [cap. 26](#26-utenti-e-ruoli)

Sotto l'elenco, la **durata della sessione** (era in *Impostazioni → Accesso*):

| Campo | Di serie |
|---|---|
| Durata della sessione salvata (giorni) | 30 — **0 = non scade mai** |

La durata si conta dall'**ultimo uso**, e dalla 0.105.4 vale anche con l'archivio condiviso: chi
non apre l'app per più giorni di così rientra con la password.

### 🏢 Dati azienda

Ragione sociale · Referente · Email · Telefono · P.IVA/C.F. · indirizzo.
**Vengono stampati come intestazione su tutti i documenti** e su tutti gli export PDF.

### 🏭 Fornitori

Nome · Referente · Email · Telefono · P.IVA/C.F. · **Pagamento predefinito** ·
**Trasporto predefinito** · indirizzo · **Trasporto conto lavoro (gg)**.
I due predefiniti si riproporranno su ogni richiesta e ogni ordine a quel fornitore.
I giorni di trasporto, andata più ritorno, si **propongono** alle fasi di conto lavoro affidate a
quel terzista, che li possono cambiare; è il trasporto della fase a sommarsi all'attraversamento
(→ [cap. 19](#19-fabbisogno-materiali)). Cambiandolo, la scheda offre di aggiornare anche le fasi
di ciclo che hanno ancora il valore di prima; gli ordini già lanciati non cambiano.
Si possono **sospendere** (⏸).

### 📇 Clienti

Nome (**unico**) · Referente · Email · Telefono · P.IVA/C.F. · indirizzo · Note.
I nomi si **propongono nel campo Cliente della commessa**.
**Rinominare un cliente allinea le commesse** che lo citavano; un cliente citato da una commessa
**non si elimina**.

### 🚚 Condizioni offerta

Due elenchi: **Tipi di trasporto / resa** e **Tipi di pagamento**, ciascuno con una ★ predefinita.
Sono i valori proposti nei campi omonimi di richieste, ordini e ordini di lavoro; la ★ precompila i documenti nuovi quando il fornitore non ha un suo predefinito.

### 🛒 Famiglie commerciali · 📦 Famiglie materie prime · 🔧 Famiglie parti

Tre elenchi separati, ciascuno con **macrofamiglie** e le loro **sottofamiglie**, con **sigla**.
Le sigle entrano nei codici automatici (→ [cap. 9](#9-i-codici-automatici)).

### 🏷 Concetti

La nomenclatura delle parti: `ALBERO`, `FLANGIA`, `STAFFA`, `PIASTRA`, `DISTANZIALE`, `PERNO`,
`BOCCOLA`, `COPERCHIO`, `SUPPORTO`, `GHIERA`… **Sempre in maiuscolo.**

Un concetto **in uso non si rinomina né si elimina** (il pannello mostra quante parti lo usano),
così i nomi già composti non cambiano da soli.

### 🔧 Centri di lavoro

| Campo | Note |
|---|---|
| **Nome** | Torni, Fresatura, Saldatura… |
| **Tariffa (€/h)** | Entra nel costo delle fasi interne a costo orario |
| **Capacità (h/settimana, tutti gli operatori)** | Le ore **totali** del centro in una settimana: tre montatori per 40 ore sono 120. Il metro del Carico centri, e il tetto di un giorno della capacità finita. **0 = non dichiarata** |
| **Ore al giorno di un operatore** | Per la durata delle fasi interne: giorni = ore ÷ (queste ore × gli **operatori** della fase). **0 = 8**. Fino alla 0.123 a zero si ricavavano dalla capacità (dalla 0.124.0) |
| **Attrezzaggio proposto (h)** | Si propone alle fasi nuove su questo centro (dalla 0.131.0): l'attrezzaggio vero è quello della fase, nel ciclo |
| **Coda proposta (gg)** | Si propone alle fasi nuove su questo centro, in giorni lavorativi (dalla 0.131.0) |

Cambiando attrezzaggio o coda proposti, la scheda offre di aggiornare anche le fasi di ciclo che
hanno ancora il valore di prima: quelle scritte a mano diversamente restano come sono.

Sotto ogni centro, il sotto-elenco **Fornitori conto lavoro**: fornitore, tariffa, nota — chi sa
fare quella lavorazione fuori, e a quanto. Si possono sospendere. Con il modulo Macchine utensili
c'è anche l'elenco delle **macchine** del centro, e un centro con macchine non si elimina.

### ⚙️ Macchine utensili (modulo, dalla 0.126.0)

| Campo | Note |
|---|---|
| **Codice** · **Nome** | T01 · Tornio CNC |
| **Centro di lavoro** | Il reparto in cui sta. Una macchina usata nei cicli non cambia centro |
| **Tariffa (€/h di macchina)** | Si **somma** a quella del centro sulle ore di macchina (→ [cap. 24](#24-carico-dei-centri-di-lavoro)) |
| **Tipo** · **Costruttore** · **Modello** · **Matricola** · **Anno** | Anagrafica |
| **Ore di lavoro all'ingresso** | Il contatore parte da qui e somma le ore timbrate |

**Calcola la tariffa** propone un costo orario: (valore d'acquisto ÷ anni di ammortamento +
manutenzione all'anno) ÷ ore lavorate in un anno + kW × €/kWh. **Usa questa tariffa** riempie il
campo, che resta modificabile. Una macchina citata da cicli, ordini, manutenzioni o timbrature non
si elimina: si sospende (⏸).

### 📏 Unità di misura

Codice + descrizione, con una ★ **predefinita** proposta alle nuove righe.
Di serie: `pz, n, set, conf, kg, g, t, m, mm, m2, m3, l, h`.

**Rinominare un codice propaga** la modifica a tutti gli articoli e documenti che lo usano; una
U.M. **in uso non si elimina** (il pannello mostra il numero di utilizzi). Le U.M. incontrate
nell'import da Excel vengono registrate automaticamente.

### ⚙️ Aree e moduli

**Aree** (dalla 0.121.0)

La **base** c'è sempre: anagrafiche, distinta base con costificazione e revisioni, richieste
d'offerta, ordini a fornitore e listini, Riepilogo e Gestione. Il resto sta in tre aree che si
accendono e spengono qui:

| Area | Cosa porta | Spenta |
|---|---|---|
| **Magazzino** | la vista Magazzino e il Cruscotto: giacenze, movimenti, rettifiche, inventario, scorte minime, ubicazioni ed etichette QR di magazzino | le giacenze non si vedono da nessuna parte (scheda articolo, pannello laterale, QR, alternativi). I ricevimenti degli ordini si registrano comunque, e il fabbisogno continua a togliere quello che è già arrivato: riaccendendo, il magazzino è già al suo posto |
| **Pianificazione** | Commesse e Fabbisogno: i piani, la lista d'acquisto, gli ordini generati dal piano | gli ordini si fanno a mano o dalle richieste d'offerta. Si spegne anche la Produzione interna, che dai piani nasce |
| **Produzione interna** (richiede Pianificazione) | parti fatte in casa con distinta e ciclo, Cicli di lavorazione, Centri di lavoro, ODP, ODL e conto lavoro, Carico centri, Avanzamento | **ogni parte vale come comprata**: costa il suo prezzo di listino, nel fabbisogno va fra gli acquisti, e il piano non ha le schede *Da fabbricare*, *Conto lavoro* e *Carico*. Il campo *Approvvigionamento* scritto sulla parte non cambia: riaccendendo, ogni parte torna com'era |

Un'area spenta toglie le sue voci dalla barra (un gruppo rimasto vuoto sparisce), i suoi avvisi
dal Riepilogo, le sue scadenze e i suoi filtri dal calendario, i suoi documenti dalla ricerca e
dai *Collegati*. Un link vecchio a una sua vista riporta al Riepilogo con un avviso. I dati
**restano** tutti. Un archivio già in uso prima della 0.121.0 ha tutte le aree accese.

Il **fabbisogno resta netto** anche col Magazzino spento: le giacenze vengono dai ricevimenti degli
ordini, e ignorarle farebbe ricomprare quello che è già arrivato.

**Moduli** (dalla 0.118.0)

| Modulo | Di serie |
|---|---|
| Alternativi e sostitutivi (→ [cap. 19](#19-fabbisogno-materiali)) | spento |
| Varianti e configuratore (→ [cap. 13](#13-tecnico--gestione-db)) | spento |
| Costi reali (→ [cap. 18](#18-commesse)), nell'area Pianificazione | spento |
| Officina: terminale di reparto e manutenzione (→ [cap. 24](#24-carico-dei-centri-di-lavoro)), nell'area Produzione interna | spento |
| Capacità finita (→ [cap. 24](#24-carico-dei-centri-di-lavoro)), nell'area Produzione interna | spento |
| Macchine utensili (→ [cap. 24](#24-carico-dei-centri-di-lavoro)), nell'area Produzione interna | spento |

**Costi reali** (dalla 0.122.0) porta il **costo medio d'acquisto** e il **consuntivo di
commessa**. Il costo medio di un articolo è la media dei prezzi degli ODA pesata sulle quantità
ricevute (gli ordini annullati non contano), nell'unità di gestione; non si salva, si ricalcola
dagli ordini, e un articolo mai ricevuto vale il listino. Si vede nella scheda articolo, sezione
Magazzino. Con il modulo acceso compare in *Costi e margini* la scelta **Valore del magazzino**: *a listino*
(come prima) o *a costo medio*; vale per il Magazzino, il Cruscotto e le differenze d'inventario.
Il modulo vive nella Pianificazione: spegnendo l'area si spegne anche lui.

Un modulo spento sparisce da schede, colonne e pulsanti, e il fabbisogno non ne tiene conto. I dati
già scritti **restano**: riaccendendolo tornano com'erano. Con l'archivio condiviso la scelta vale
per tutti i colleghi.

### 💶 Costi e margini


| Campo | Di serie |
|---|---|
| Spese generali / overhead (%) | 12 |
| Margine / markup (%) | 20 |
| Simbolo valuta | € |
| Valore del magazzino (solo con il modulo Costi reali) | A listino |

### 🏷 Codifica articoli

**Codifica automatica articoli**

| Campo | Di serie |
|---|---|
| Cifre della parte incrementale | 3 |
| Prefisso Commerciali | `CMM` |
| Prefisso Materie prime | `MAT` |
| Prefisso Parti | `PRT` |

**Nuove parti**

| Campo | Di serie |
|---|---|
| Approvvigionamento parte (predefinito) | Acquisto da fornitore |

### 🕒 Calendario di fabbrica

| Campo | Di serie |
|---|---|
| Giorni lavorativi | lunedì–venerdì |
| Festivi ricorrenti (GG/MM) | 01/01, 06/01, 25/04, 01/05, 02/06, 15/08, 01/11, 08/12, 25/12, 26/12 |
| Pasquetta | sì, calcolata ogni anno |
| Chiusure | nessuna — una per riga: `2026-08-10 2026-08-21 Ferie estive` |
| Margine fra livelli di distinta (gg) | 0 |
| Giorni di consegna di fornitori e terzisti | lavorativi (dalla 0.110.0) |

Il calendario serve alla programmazione a ritroso del fabbisogno: fasi interne e montaggi si
contano in giorni lavorativi, e di serie anche i giorni dei fornitori (consegna a listino,
attraversamento e trasporto del terzista, ritardi confermati); scegliendo **Di calendario** questi
ultimi si contano pieni. Le date d'ordine e d'invio che cadono su un giorno chiuso si anticipano al
lavorativo precedente, gli arrivi si spostano al lavorativo dopo. La soglia «da ordinare» del
fabbisogno e del Riepilogo è di **5 giorni lavorativi**. Il santo patrono si scrive fra le chiusure.

### 🔳 Etichette QR

| Campo | Di serie |
|---|---|
| Indirizzo dell'app nei QR | vuoto: quello da cui l'app è aperta |
| Formato etichette | Foglio A4 · 3×8 (70×37 mm) |

L'indirizzo deve iniziare con `http://` o `https://` (→ [cap. 17](#17-magazzino), *Le etichette QR*).

### ⬆️ Import · 💾 Backup

→ [cap. 27](#27-import-ed-export-da-excel) e [cap. 30](#30-backup-e-manutenzione).

### Sospendere invece di eliminare

Fornitori, clienti e centri di lavoro si possono **sospendere** (⏸) invece di cancellarli:
restano negli archivi e nei documenti che li citano, ma **spariscono dai menu a tendina e dai
suggerimenti**. È la risposta a chi non si può cancellare — un fornitore citato da ordini di tre
anni fa — ma non deve nemmeno continuare a comparire ovunque.

Il riquadro accanto al nome dice sempre se una voce è attiva o sospesa, e lo stato viaggia
nell'export e nell'import Excel.

---

## 26. Utenti e ruoli

Ogni persona ha un utente, con nome, email, ruolo, colore e stato attivo/sospeso.

**I ruoli limitano la scrittura, non la lettura: tutti vedono tutto.**

| Ruolo | Articoli | Distinte | Richieste e ordini | Ricevimenti, avanzamento, giacenze | Gestione |
|---|:--:|:--:|:--:|:--:|:--:|
| **Amministratore** | ✔ | ✔ | ✔ | ✔ | ✔ |
| **Ufficio acquisti** | — | — | ✔ | ✔ | — |
| **Progettazione** | ✔ | ✔ | — | solo giacenze | — |
| **Officina e magazzino** | — | — | — | ✔ | — |
| **Lettore** | — | — | — | — | — |

**Officina e magazzino** (dalla 0.96.0) è il ruolo di chi sta in reparto: **riceve** la merce
degli ordini e degli ODL, **avvia e dichiara** le fasi degli ODP (e le annulla), registra la
**produzione** e **rettifica le giacenze** o manda materiale ai terzisti. Non crea né modifica
richieste, ordini, piani, articoli o distinte: prima per dichiarare l'avanzamento bisognava
dare il ruolo *Ufficio acquisti*, che scrive anche gli ordini. Magazzino, ordini fornitore, ODL e
ODP non gli compaiono in sola lettura: dalla 0.105.6 lì non vede più nemmeno il banner «il ruolo
non modifica…», che contraddiceva i ricevimenti e le giacenze che registra proprio in quelle
viste. Dalla stessa versione dichiara anche l'avanzamento delle **parti** dal piano
(→ [cap. 19](#19-fabbisogno-materiali)), mentre gli **ordini di lavoro** da un ODP li genera chi
scrive gli ordini (→ [cap. 22](#22-ordini-di-produzione-odp)).

Nelle sezioni non scrivibili compare un **banner di sola lettura** e i pulsanti di creazione ed
eliminazione spariscono; ogni tentativo di modifica viene comunque fermato con un messaggio. Con
l'archivio condiviso e **senza collegamento** (dalla 0.105.6) il banner e il messaggio dicono che
manca il collegamento, non che il ruolo non può: la causa è la rete, non il ruolo.

**Una prova per ogni comando** (dalla 0.105.6). Fra i test dell'app ce n'è uno che chiama ogni
comando dell'interfaccia con ogni ruolo e verifica che scriva solo le tabelle che il server gli
concede. È così che si è trovato il *Salva* a vuoto di richieste, ordini e ODL
(→ [cap. 21](#21-ordini-a-fornitore-oda)).
La voce **Gestione** — e con essa il backup — è visibile ai soli amministratori.

**Deve restare almeno un amministratore attivo.** L'app impedisce di declassare, sospendere o
eliminare l'ultimo, e impedisce di agire su se stessi.

**Le password** si conservano come **hash SHA-256 con salt**. L'amministratore non le legge: le
può solo reimpostare (*Imposta password*). Ciascuno cambia la propria dall'intestazione
(🔑 *Cambia password*).

**La riga autore.** In fondo a schede articolo, richieste, ordini e piani si legge **chi ha creato
il record e chi l'ha aggiornato per ultimo**, con data e ora.

> ⚠️ **Questa non è sicurezza.** Finché i dati stanno nel browser, chiunque apra gli strumenti di
> sviluppo può leggere l'archivio, cambiarsi ruolo o saltare l'accesso: il controllo è tutto sul
> PC dell'utente. Serve a **separare le responsabilità tra colleghi che si fidano**, non a
> proteggere i dati da chi non si fida.
>
> Di conseguenza: **il backup JSON contiene gli utenti con i loro hash.** Trattalo come un file
> riservato.
>
> I permessi diventano reali con l'archivio condiviso, perché lì vivono sul server e non su
> questo PC: la matrice qui sopra è quella che il server applica
> (→ [cap. 31](#31-larchivio-condiviso-supabase)). Lì un collega si crea da questa scheda con
> nome, email e ruolo, e riceve un link per scegliere la password; la chiave genera un link per
> reimpostarla.

---

## 27. Import ed export da Excel

**Come ci si arriva.** ⚙️ *Gestione → Import*.

Quattro blocchi. **In tutti, l'export è anche il template**: si esporta quello che c'è, si
modifica il file, lo si ricarica. Ogni file porta un foglio **Istruzioni** e un foglio **Liste**
con i valori ammessi.

**Menu a tendina** *(dalla 0.117.0)*. Nei file Articoli e Impostazioni le colonne che accettano
solo certi valori hanno un menu a tendina, preso dagli elenchi dell'app al momento dell'export:

- **Articoli**: UM e UM acquisto/prezzo, Macrofamiglia e Sottofamiglia (con la sigla), Fornitore, Concetto,
  Approvvigionamento, Tipo sigla gruppo, Preferito / Obsoleto (Sì/No). *Codice macchina*
  e *Codice gruppo* propongono i codici dei fogli `Macchine` e `Gruppi` dello stesso file, quindi
  anche una macchina appena aggiunta in fondo.
- **Sottofamiglia** propone solo quelle della *Macrofamiglia* scelta sulla stessa riga.
- **Impostazioni**: Attivo, Ruolo, Tipo delle condizioni offerta, Predefinita.
- Dove l'import **crea ciò che manca** (fornitori, famiglie, unità di misura) la tendina avvisa ma
  lascia scrivere un valore nuovo. Dove non lo crea (concetti, Sì/No, valori fissi) lo rifiuta.
- I valori stanno in un foglio nascosto **Tendine**: non va modificato, e l'import lo ignora. Per
  avere elenchi aggiornati basta esportare di nuovo.

### I quattro blocchi

**1. Articoli — Acquisti**
Fogli: `Commerciali` · `Materie prime`.
Pulsanti: *Esporta Acquisti* · *🔍 Verifica un file* · *Carica Acquisti*.

**2. Articoli — Progetto**
Fogli: `Macchine` · `Gruppi` · `Sottogruppi` · `Parti`. Nelle parti il **Concetto** è
obbligatorio, la **Descrizione** no: il nome della parte può essere il solo concetto.
**Il tipo è il foglio**: non c'è una colonna «tipo». I fogli si applicano in quest'ordine, così i
padri esistono prima dei figli.
**La distinta non è in questi file** — sta nel blocco 3.

**3. Import Distinte**
Un foglio padre-figlio, colonne: `CodicePadre` · `CodiceFiglio` · `Qta` · `Scarto%`.
Gli articoli **devono già esistere**. Per ogni padre i componenti vengono **sostituiti** — quindi
ricaricare lo stesso file due volte dà lo stesso risultato. Le relazioni cicliche sono segnalate e
saltate.
Pulsanti: *Scarica template Distinte* · *Carica file Distinte*.

**4. Impostazioni di Gestione**
Un foglio per scheda: `Azienda` · `Utenti` · `Fornitori` · `Clienti` · `Condizioni offerta` ·
`Famiglie commerciali` · `Famiglie materie prime` · `Famiglie parti` · `Concetti` ·
`Centri di lavoro` · `Unità di misura` · `Impostazioni`.
**Le password non sono nel file.** Con l'archivio condiviso il foglio `Utenti` aggiorna solo i
colleghi che esistono già: uno nuovo si invita da *Gestione → Utenti* (dalla 0.105.5).

### Le regole comuni

| Regola | Dettaglio |
|---|---|
| **Il Codice è la chiave** | Esiste → **aggiorna**. Non esiste → **crea**. Vuoto → **genera** il codice automatico |
| **Una riga con un errore non applica niente** | E su un articolo già usato codice, famiglia, codifica e U.M. restano com'erano, con un avviso (dalla 0.105.5) |
| **L'import è additivo** | Non cancella mai niente. Quello che non è nel file resta com'è |
| **Fornitori e famiglie mancanti si creano al volo** | I **concetti no**: quelli si aggiungono a mano, perché la nomenclatura non deve crescere per distrazione |
| **Fornitore + prezzo** | Sulla riga dell'articolo c'è **una quotazione sola, quella in uso**; all'import crea una **quotazione a listino**. Le altre quotazioni dell'articolo restano nell'app (dalla 0.117.0 il foglio `Listino` non c'è più, e in un file di prima viene ignorato con un avviso). Le regole sono nel riquadro qui sotto |
| **Famiglie con la sigla** | *Macrofamiglia* e *Sottofamiglia* si scrivono col nome e la sigla del codice fra quadre, `Meccanico [MEC]`. Una famiglia nuova prende la sigla scritta, se è libera. Il solo nome vale ancora (dalla 0.117.0) |
| **U.M. sconosciute** | Vengono registrate automaticamente nell'elenco |
| **CSV** | I `.csv` in UTF-8 nudo vengono riconosciuti da soli |

### Il prezzo sulla riga dell'articolo *(dalla 0.117.0)*

| Caso | Cosa succede |
|---|---|
| **Stesso fornitore, data più recente** | Entra come quotazione nuova |
| **Stesso fornitore, data più vecchia** dell'ultima a listino | **Non entra**, con un avviso |
| **Stesso fornitore, stessa data** | È la stessa quotazione: uguale, non succede niente (è il file esportato e ricaricato); diversa, **non viene sovrascritta** e lo si dice. Un prezzo nuovo vuole una data nuova |
| **Un altro fornitore** | Entra, qualunque sia la data |
| **In uso = Sì** | La quotazione della riga diventa quella in uso (prezzo, fornitore e costo dell'articolo). Se non è entrata, resta quella di prima, con un avviso |
| **In uso vuoto o No** | Si aggiunge al listino e basta. Eccezione: la **prima** quotazione di un articolo va comunque in uso |
| **Colonna In uso assente** (file di prima) | La riga va in uso, come allora |
| **Prezzo vuoto** | Nessuna quotazione: le altre colonne del prezzo non contano |
| **Prezzo non valido** (testo, negativo) | Errore, e la riga non entra per niente |
| **Fornitore vuoto** | Quotazione senza fornitore; se va in uso, l'articolo resta senza fornitore |
| **Fornitore nuovo** | Viene creato |
| **Colonna Fornitore assente** | Vale il fornitore della quotazione in uso |
| **Data prezzo vuota** | Oggi. Attenzione: la stessa riga senza data, ricaricata un altro giorno, fa una quotazione nuova |
| **UM prezzo** diversa da UM e da UM acquisto | Ignorata, con un avviso |
| **Parte a produzione interna** | La quotazione entra ma non diventa costo: il costo viene dal ciclo |
| **L'import non cancella** | Nessuna quotazione viene mai eliminata |

### 🔍 Verifica un file

**Esegue l'import per intero, mostra il report, e poi annulla tutto.** È il modo di sapere cosa
succederebbe senza che succeda. Da usare sempre, la prima volta che si carica un file nuovo.

Il **report** è per foglio, e dice quanti record sono stati *creati*, *aggiornati*, *invariati*,
con gli **avvisi** e gli **errori**, ciascuno con il foglio e il numero di riga.

---

## 28. Export di elenchi e documenti

Bomtrack ha due famiglie di export, e vale la pena distinguerle.

### Gli export di elenco

Hanno i pulsanti **Esporta Excel** ed **Esporta PDF**: Magazzino · Acquisti · Progetto · Cicli ·
Carico centri · Commesse · Richieste · Ordini · Ordini di lavoro · elenco Piani ·
Materiale presso terzi · **Cruscotto** · **Confronto distinte**.

**Si esporta quello che si vede**: i filtri attivi sono applicati, e la paginazione a schermo (i
200 articoli per volta) **non taglia niente**.

**Le colonne.** Negli elenchi che hanno il pulsante **Colonne** — Articoli d'acquisto, Articoli
di progetto e Magazzino — il file porta **le colonne accese**, nello stesso ordine dello schermo
(dalla 0.105.6): quelle accese apposta, come il fornitore, la scorta minima o le note, ci sono;
quelle spente restano fuori. **Codice** e **Descrizione** ci sono sempre, perché a schermo non si
spengono; gli **Indicatori** (★ preferito, ⛔ obsoleto), che a schermo sono icone, no. Prima questi
elenchi esportavano un insieme fisso di colonne, qualunque cosa si stesse guardando. Gli altri
elenchi, che la scelta delle colonne non ce l'hanno, esportano le loro colonne di sempre.

**I filtri finiscono scritti nel file** — un foglio **Estrazione** nell'Excel (Estrazione, Azienda,
Data, filtri attivi), una riga sotto il titolo nel PDF — così a distanza di tempo si sa ancora cosa
contiene quel file.

| Formato | Cosa porta |
|---|---|
| **PDF** | Testata azienda e numero di pagina su ogni pagina |
| **Excel** | **Autofiltro** sull'intestazione, i numeri come numeri e **le date come date** — quindi si ordinano e si filtrano per periodo dentro Excel, non come testo |

**Un testo che sembra una formula resta testo** (dalla 0.105.6). Nomi, descrizioni e note li scrive
chi vuole, e una cella che comincia con `=`, `+` o `@` alcuni fogli di calcolo la prendono per una
formula, a volte appena il file si apre: un `=HYPERLINK(…)` nascosto nel nome di un fornitore
partirebbe dal PC di chi riceve il file. Nell'Excel quei testi escono con un apice davanti, che li
lascia testo. Un trattino da solo e un numero negativo restano come sono.

Nome del file: `bomtrack_<sezione>_<data>.xlsx` o `.pdf`. Il nome si pulisce da solo dei
caratteri che Windows non accetta (`/ \ : * ? " < > |`) e gli spazi diventano trattini: un
confronto fra `TUBO Ø40/2` e un altro codice esce come `bomtrack_confronto_TUBO-Ø40-2_…`.

**I nomi dei file, tutti insieme** (dalla 0.101.1):

| Cosa | Nome del file |
|---|---|
| Elenchi, cruscotto, programma, avanzamento, ciclo, confronto | `bomtrack_<sezione>_<data>` |
| Richiesta d'offerta, ordine a fornitore, ordine di lavoro | `<numero>_<fornitore>`, es. `ODA-2026-003_Bonfiglioli Riduttori S.p.A.pdf` |
| Ordine di produzione | `<numero>_<codice parte>`, es. `ODP-2026-004_PRT-001.pdf` |
| Distinta costificata | `Distinta_<codice>` |
| Fabbisogno di un piano | `Fabbisogno_<numero piano>` |
| Etichette QR | `bomtrack_etichette_qr_<data>.pdf` |
| Anagrafiche da Gestione, impostazioni, backup | `bomtrack_acquisti_<data>`, `bomtrack_impostazioni_<data>`, `bomtrack_backup_<data>.json` |

I documenti che partono verso un fornitore portano il numero, non la data: è il numero che si cerca
nella posta. La data è sempre quella del PC, non quella di Greenwich.

> Il pannello laterale, con più righe selezionate, esporta **solo la selezione**.

### Gli export di documento

Sono i documenti veri e propri: la **richiesta di offerta** (PDF bilingue IT/EN), l'**ordine**,
l'**ordine di lavoro**, il **piano di fabbisogno**, la **distinta esplosa**. Hanno il pulsante
**Genera documento PDF** / **Genera documento Excel** nella loro barra dedicata.

Per richieste e ordini, quei pulsanti sono **disabilitati finché ci sono modifiche non salvate**, e
alla generazione l'app propone di far passare lo stato da *Bozza* a *Inviata* / *Inviato*.
Rifiutando, il file si scarica lo stesso e lo stato non cambia.

### Le copie in archivio (dalla 0.112.0)

**Il PDF che parte resta in archivio.** Quando richiesta, ordine o ordine di lavoro si segnano come
inviati, il PDF appena generato viene scritto anche nella **cartella d'archivio** degli allegati
(→ [cap. 8](#8-la-scheda-articolo-campo-per-campo)), in una sottocartella sua:

```
<cartella d'archivio>/
  Documenti Bomtrack/
    RFQ/2026/  RDO-2026-014_Rossi.pdf
    ODA/2026/  ODA-2026-105_Bianchi.pdf
               ODA-2026-105_Bianchi_r1.pdf
    ODL/2026/  ODL-2026-031_Zincatura Verdi.pdf
```

L'anno è quello del documento. Bomtrack ne memorizza il percorso, chi l'ha emesso, quando e
l'impronta del file: con l'archivio condiviso l'elenco arriva ai colleghi, e con la cartella
sincronizzata (OneDrive, Dropbox, rete) il file è già sui loro PC. I PDF non passano mai da Supabase.

**Nella scheda** del documento, sotto i pulsanti di generazione, c'è **Copie in archivio**: le copie
dalla più recente, ciascuna con il pulsante per aprirla.

**Una copia emessa non si sovrascrive mai.** È ciò che il fornitore ha ricevuto, e vale come tale:

- se il documento **cambia dopo l'invio** (sbloccato, corretto) e si rigenera il PDF, l'app
  propone di archiviarlo come **revisione** (`_r1`, `_r2`…); la copia di prima resta;
- **ristampare** un documento che non è cambiato non chiede niente;
- un documento inviato prima di questa versione, rigenerato, propone la sua prima copia;
- **Archivia il PDF** / **Archivia come nuova revisione**, nella scheda, archivia senza scaricare;
- se in cartella c'è già un file con quel nome, l'app ne sceglie uno libero (`… (2).pdf`) e
  registra quello.

**Il download resta sempre.** Senza cartella d'archivio su quel PC, con Firefox o Safari, o per chi
non può modificare i documenti, il PDF si scarica come prima e la scheda dice perché non è stato
archiviato. Le **bozze** non si archiviano: una stampa di controllo non è un documento emesso.
L'**Excel** resta un file di lavoro e non va in archivio.

**Eliminare il documento cancella anche le sue copie**, dalla cartella e dall'elenco: un documento
rifatto con lo stesso numero e lo stesso fornitore riprende così il nome pulito, senza un «(2)».
L'avviso di eliminazione lo dice prima, e **ripristinando il documento dal cestino le copie non
tornano**. Se il PDF non si può cancellare (cartella non impostata su quel PC, permesso negato),
resta elencato in *Gestione → Backup* fra le **copie di documenti eliminati**, da aprire o
cancellare da un PC che ha la cartella.

**La verifica** di *Gestione → Backup* controlla anche le copie emesse: dice quali **non si
trovano** più e quali sono **diverse** da quella emessa (sostituite o modificate fuori da Bomtrack).

> Conviene dare **sola lettura** sulla cartella `Documenti Bomtrack` a chi non emette documenti: è
> OneDrive (o il server) a impedire di cancellarli, non Bomtrack.

---

## 29. Stampa

`Ctrl+P`, o il pulsante 🖨 nell'intestazione. Anche il `Ctrl+P` del browser è agganciato: si
ottiene la stampa pulita, non la pagina grezza.

Esce **la vista aperta** — distinta, costificazione, fabbisogno, richiesta, ordine — ripulita di
navigazione, filtri e pulsanti, con intestazione, data e autore. Nelle viste a documento **esce il
documento, non l'elenco**.

**La carta resta bianca** anche con il tema scuro attivo.

---

## 30. Backup e manutenzione

**Come ci si arriva.** ⚙️ *Gestione → Backup*. **Solo amministratori.**

### Backup locale

| Comando | Cosa fa |
|---|---|
| *(in testa)* | La **dimensione** dell'archivio, la **data dell'ultimo backup** e se il browser tiene i dati come **persistenti** |
| **Esporta JSON** | Scarica l'intero archivio in un file |
| **Importa JSON** | Carica un file **sovrascrivendo i dati attuali** |
| **↺ Ripristina dati esempio** | Rimette la macchina dimostrativa |

**Una copia prima di sostituire l'archivio** (dalla 0.105.6). **Importa JSON**, **Ripristina dati
esempio** e **AZZERA TUTTO** buttano via l'archivio di adesso. Prima di farlo l'app ne salva da
sola una **copia di sicurezza**, con un nome che non si sovrascrive:
`bomtrack_prima_di_import_…`, `bomtrack_prima_di_ripristino_…`, `bomtrack_prima_di_azzera_…`,
seguiti da data e ora. Se il backup automatico è attivo la copia va nella sua cartella; altrimenti
si scarica come file. Se la cartella non si raggiunge (il permesso non c'è, il disco di rete non
risponde) l'app lo dice e chiede: **Scarica e prosegui**, oppure fermarsi lì. La copia è un backup
normale: si ripristina con **Importa JSON**. Non si fa quando l'archivio all'avvio era illeggibile
(→ *Dati non caricati*, [cap. 35](#35-domande-frequenti)): in memoria c'è solo il database di
esempio, e importare un backup è proprio il modo di uscirne.

> ⚠️ **Fai backup regolari.** I dati stanno in questo browser: non esiste una copia da nessun'altra
> parte. Un backup a fine giornata costa dieci secondi. Dopo 7 giorni senza, il Riepilogo lo
> ricorda (→ [cap. 5](#5-riepilogo--richiede-attenzione)).
>
> ⚠️ **Il backup contiene gli utenti con i loro hash di password.** È un file riservato.

### Backup automatico

**Esporta JSON** funziona solo se qualcuno se ne ricorda. Il backup automatico no: scelta una
cartella una volta, Bomtrack ci scrive da sola una copia dell'archivio.

| Quando | Cosa fa |
|---|---|
| **All'avvio**, ogni **mezz'ora** e quando passi a un'altra finestra | Salva il file del giorno, `bomtrack_backup_AAAA-MM-GG.json`, se qualcosa è cambiato dall'ultima volta |
| **Ogni giorno** | Un file nuovo; si tengono gli **ultimi 14** e i più vecchi si cancellano. Gli altri file della cartella non si toccano |

I comandi, nella scheda Backup: **Attiva backup automatico** (scegli la cartella e parte subito il
primo backup), **Salva ora**, **Cambia cartella**, **Disattiva** (la cartella si dimentica, i file
restano). Ogni file è un backup normale: si ripristina con **Importa JSON**.

> 💡 **Quale cartella.** Una che non stia solo su questo disco: quella locale di **OneDrive** o
> **Dropbox**, o un disco di rete. Così il backup sopravvive anche al PC.
>
> ⚠️ Come la cartella dell'archivio (→ [cap. 8](#8-la-scheda-articolo-campo-per-campo)), funziona su
> **Chrome ed Edge** con Bomtrack aperta da un indirizzo `https` o `localhost`, ed è
> un'impostazione **di questo PC**. Aperta con un doppio clic su `index.html`, la scheda dice che
> non è disponibile.
>
> ⚠️ **Permesso.** Il browser può chiedere di riconfermarlo a ogni riapertura. Bomtrack non lo
> chiede a freddo: il backup va **in pausa** e il Riepilogo mostra **Riprendi**. Installare l'app
> (icona nella barra degli indirizzi) di solito fa ricordare il permesso.

**Dati persistenti.** Quando il disco si riempie, un browser può cancellare da solo i dati dei
siti che considera sacrificabili. All'avvio Bomtrack chiede di essere tenuto come
**persistente**; la scheda Backup dice se il browser l'ha concesso. Chrome di solito lo concede a
un'app installata (icona nella barra degli indirizzi) o usata spesso; Firefox lo chiede a te. Non
sostituisce il backup: protegge dal browser, non da un disco che si guasta o da un PC che cambia.

I backup di versioni vecchie si **migrano da soli** all'import: un file esportato mesi fa si
ricarica senza conversioni.

Con l'archivio condiviso questo comando serve ancora: tiene una copia **fuori** dal servizio che
ospita i dati, che è l'unico backup che protegga davvero
(→ [cap. 31](#31-larchivio-condiviso-supabase)). L'**import**, invece, lì è bloccato.

### Cestino

Le eliminazioni restano recuperabili **30 giorni**. Per ogni riga: **↶ Ripristina** e
**Elimina definitivamente**; in fondo **Svuota il cestino**. Passata la finestra dei 30 giorni,
le voci spariscono da sole al caricamento successivo. Con l'archivio condiviso (dalla 0.106.0) le
toglie il server, con la sua ora, al più una volta al giorno: spariscono da tutti i PC insieme.

Cosa ci finisce: Articolo · Fornitore · Cliente · Centro di lavoro · Macrofamiglia · Richiesta ·
Ordine · Ordine di lavoro · Piano · Utente · Commessa · Movimento · Revisione.

### Storico delle modifiche

A ogni salvataggio Bomtrack annota che cosa è cambiato: **chi**, **quando**, **quale campo**, **da
quale valore a quale**. Vale per articoli, documenti (richieste, ordini, ODL, ODP, piani,
commesse), anagrafiche, utenti e impostazioni.

| Dove | Cosa mostra |
|---|---|
| Pannello laterale di un articolo, scheda **Storico** | Le modifiche di quell'articolo, dalla più recente |
| *Gestione → Backup → Storico delle modifiche* | Le ultime 200 modifiche di tutto l'archivio, con una ricerca per codice, numero, utente, campo o valore |

- Le **righe** di un documento o del listino si contano: «3 righe → 4 righe (+1, 1 cambiata)».
- I fornitori, i clienti, le famiglie e gli articoli citati si leggono **col nome di oggi**; un
  record che nel frattempo è stato eliminato si legge «(record eliminato)».
- Il **prezzo in uso** si legge come la quotazione del listino: «TORNITORE SRL · 102,00 € ·
  22/10/2026». Se quella riga è stata tolta dal listino: «quotazione non più a listino».
- Un import da Excel o una generazione di documenti che tocca **più di 50 record** di un tipo
  diventa **una voce sola** («120 nuovi, 3 modificati»).
- Non entrano i movimenti di magazzino, i ricevimenti, le dichiarazioni di produzione e le
  revisioni, che sono già un registro loro. Delle **password** si dice solo che sono cambiate.
- Si tengono le **ultime 5.000** modifiche. Lo storico sta nell'archivio, quindi **viaggia nel
  backup** e torna con un ripristino.

> 💡 Lo storico conta **dalla 0.95.0**: di quello che è successo prima non c'è traccia.

### Codici articolo duplicati

Un controllo dati che elenca i codici assegnati a più di un articolo — di solito il residuo di un
import fatto male. Lo stesso controllo alimenta un segnale del Riepilogo.

**Numeri dei documenti** (dalla 0.105.6). Accanto, lo stesso controllo per le **serie dei
documenti** — RFQ, ODA, ODL, ODP, piani (FAB), commesse (COM), modifiche tecniche (MT) — di
quest'anno e dell'anno scorso. Per ogni serie dice i **numeri doppi**, con un pulsante per aprire
ciascuno dei documenti che lo portano, e i **buchi**: i numeri che mancano sotto il più alto. Un
numero doppio nasce da un ripristino o da due PC che numeravano ciascuno per conto suo; un buco da
una prenotazione dell'archivio condiviso mai usata. Se è tutto in ordine lo dice. Come per i codici,
l'app **non rinumera niente da sola**: quel numero può essere già su un ordine spedito o su una
fattura. Si aprono i documenti, si decide quale tiene il numero e, se serve, si annota il buco per
chi controlla.

### Registro errori

Gli errori imprevisti incontrati **in questa sessione** (si azzera ricaricando la pagina), con
**Scarica registro errori**: è il file da allegare quando si segnala un problema.

### AZZERA TUTTO

Svuota completamente l'archivio, dati di esempio compresi. Chi azzera resta dentro come
amministratore. La finestra dice quanto si sta per cancellare e, per confermare, chiede di
**scrivere AZZERA**: un clic distratto non basta.

> ⚠️ **Non passa dal cestino.** Dalla 0.105.6, però, prima di azzerare l'app salva da sola una
> copia di tutto (vedi *Una copia prima di sostituire l'archivio*, qui sopra), e il messaggio
> finale dice dove: è da lì che si torna indietro, con **Importa JSON**. Il pulsante **Esporta
> backup ora** nella finestra resta, per chi vuole una copia anche altrove.

---

## 31. L'archivio condiviso (Supabase)

Dalla 0.103.0 Bomtrack può lavorare su un **archivio unico per tutti i colleghi**, ospitato da
[Supabase](https://supabase.com) (piano gratuito). Finché non lo colleghi, niente cambia: ogni PC
ha il suo archivio, come prima. Collegato, ogni PC tiene la sua copia e la allinea da solo con
quella condivisa.

### Cosa cambia

| | Senza archivio condiviso | Con l'archivio condiviso |
|---|---|---|
| **Dove stanno i dati** | Nel browser di questo PC | In un database unico; ogni PC ne tiene una copia |
| **I colleghi** | Ognuno la sua copia; ci si allinea passandosi il backup | Tutti sullo stesso archivio, ciascuno dal suo PC o telefono |
| **L'accesso** | Separa le responsabilità, non protegge i dati | Autenticazione vera: email e password di Supabase |
| **I ruoli** | Chi apre gli strumenti di sviluppo li aggira | Li applica il server: una scrittura non permessa viene rifiutata |
| **Le password** | Conservate qui come hash | Le tiene Supabase; Bomtrack non le vede |
| **Nuovo utente** | L'amministratore lo crea con una password iniziale | L'amministratore lo crea dall'app e gli gira un **link**: la password se la sceglie la persona |
| **Il backup** | L'unica copia che esiste | Resta, e serve ancora: fuori dal servizio |
| **Senza rete** | Non serve mai | Si consulta soltanto; si torna a lavorare appena il server risponde |
| **Numeri dei documenti e codici** | Li calcola il PC | Li dà il server: due colleghi non prendono mai lo stesso |

### Mettere in piedi il progetto (l'amministratore, una volta)

1. Su [supabase.com](https://supabase.com) crea un progetto gratuito, con la regione **Europa**.
2. Nel progetto apri **SQL Editor**, incolla tutto il file `supabase/schema.sql` e premi **Run**.
   Si può rieseguire quando vuoi: aggiunge quello che manca e non tocca i dati.
3. **Authentication → Users → Add user**: la tua email e una password, con *Auto Confirm User*.
   Sei il primo utente, quindi diventi **amministratore**.
4. **Authentication → Sign In / Providers**: spegni *Allow new users to sign up*. I colleghi
   arrivano solo su invito; anche chi riuscisse a registrarsi da solo nascerebbe **sospeso**, e non
   leggerebbe niente.
5. **Project Settings → API**: copia l'indirizzo del progetto (*Project URL*) e la chiave
   **pubblica** (*anon* o *publishable*). La chiave di servizio (*service_role*, *secret*) non va
   mai in Bomtrack.
6. Sul PC che ha i dati buoni apri Bomtrack: dalla schermata d'accesso **Collega un archivio
   condiviso…**, oppure da dentro *Gestione → Backup → Archivio condiviso*. Incolla indirizzo e
   chiave, premi **Prova** e poi **Collega questo PC**. L'app si ricarica.
7. Accedi con **l'email e la password di Supabase**. Si apre **Primo collegamento**: esporta un
   backup, poi **Carica questo archivio**.
8. Clicca il **simbolo della nuvola** nell'intestazione: c'è il **link di collegamento** per i
   colleghi. Mettilo anche in Supabase, in **Authentication → URL Configuration → Site URL**: è lì
   che riportano gli inviti e il recupero della password.

9. **Pubblica la funzione degli utenti**, per creare i colleghi dall'app: in Supabase **Edge
   Functions → Deploy a new function → Via Editor**, nome `bomtrack-utenti`, incolla tutto il file
   `supabase/functions/bomtrack-utenti/index.ts` e premi **Deploy**. Va ripubblicata quando una
   versione nuova la cambia (lo dice il changelog). Nello stesso pannello, in **Authentication →
   URL Configuration → Redirect URLs**, aggiungi l'indirizzo dell'app: è lì che riportano i link.
   Se l'app risponde «la funzione bomtrack-utenti non risponde», la funzione non c'è con quel nome
   esatto oppure si ferma all'avvio: guardala in **Edge Functions**, e nei suoi **Logs** c'è il
   motivo.

> **L'app va aperta da un indirizzo web** (`https://…`), non con un doppio clic sul file: un link
> d'invito non può tornare a un file sul disco di qualcuno.

**Gli utenti al primo caricamento.** Passano quelli che hanno su Supabase un utente con la
**stessa email**: se li inviti prima di caricare, arrivano già con il loro ruolo. Chi non ce l'ha
resta fuori (l'app dice chi), e si invita dopo. I record che ha creato restano, con il suo nome.
Le password non passano: ognuno usa quella di Supabase.

### Aggiungere un collega

1. In *Gestione → Utenti* scrivi nome, email e ruolo e premi **Crea e genera link**. Il collega
   nasce già **attivo**, con quel ruolo.
2. Si apre il **link d'invito**: copialo e mandalo tu al collega (WhatsApp, Teams, email). Nessuna
   email parte da sola. Il link vale una volta e scade in circa un giorno.
3. Il collega apre il link, sceglie la password e si ritrova in Bomtrack. Al primo accesso il suo
   PC **scarica l'archivio condiviso**: se ci aveva dei dati suoi, vengono sostituiti, e prima
   glielo si dice.

**Una password dimenticata**: la chiave accanto al collega genera un **link per reimpostarla**,
da girargli allo stesso modo. Chi apre quel link entra come lui, quindi va mandato solo a lui. Per
un altro amministratore la chiave non funziona: lui usa **Password dimenticata?** dalla schermata
d'accesso, così nessun amministratore può entrare al posto di un altro.

**Senza la funzione pubblicata** (passo 9 qui sopra) l'app lo dice, e il collega si invita
ancora dal pannello di Supabase: **Authentication → Users → Invite user**. In quel caso nasce
**lettore sospeso**, e in *Gestione → Utenti* gli dai il ruolo (✏) e lo riattivi (✓).

**L'ultimo amministratore attivo** non si declassa e non si sospende: lo impedisce l'app e lo
impedisce il server.

Il collega che usa un altro PC può anche aprire il **link di collegamento** che gli mandi tu:
l'app chiede se collegarsi a quel progetto, mostrandone l'indirizzo, e poi chiede l'accesso.

**Per togliere qualcuno lo si sospende**, non lo si elimina: chi è sospeso non legge più niente,
anche con la sessione aperta, e se è dentro l'app lo fa uscire al giro di sincronizzazione
successivo. La password la cambia ognuno dal proprio nome nell'intestazione
(**Cambia password**), o dalla schermata d'accesso con **Password dimenticata?**.

### Come si lavora

**L'app non diventa più lenta.** Si scrive sul proprio PC come prima, e l'invio parte da solo un
attimo dopo ogni salvataggio. Le modifiche dei colleghi arrivano **ogni 25 secondi**, quando si
torna sulla finestra e quando torna la rete. Non arrivano mai in mezzo a un lavoro: se una scheda
è aperta, se un documento ha modifiche non salvate o se il cursore è in un campo, l'aggiornamento
aspetta il giro dopo.

La **nuvola** nell'intestazione dice a che punto è; cliccandola si apre lo stato, con
**Sincronizza ora**.

| La nuvola | Vuol dire |
|---|---|
| verde, senza scritte | Tutto inviato e ricevuto |
| **Invio…** · **Da inviare** | Sta mandando, o ha qualcosa in coda |
| **Senza rete** | Il server non si raggiunge: **si consulta soltanto** (vedi sotto). Quello che era già in coda parte al ritorno, anche dopo aver chiuso la finestra |
| **Errore di sincronizzazione** | Il server ha rifiutato l'invio: il motivo è nello stato |
| **Accesso scaduto** | Va rifatto l'accesso; i dati del PC restano |

**Esci chiude solo questo PC** (dalla 0.105.6). Uscire dall'app chiude la sessione di questo PC e
basta: chi ha Bomtrack aperta anche sul telefono o su un altro PC resta dentro lì. E un errore
passeggero del servizio di accesso di Supabase non fa più uscire nessuno: la sessione si chiude
solo quando il server la rifiuta davvero.

**Ordini di lavoro in modifica** (dalla 0.105.6). Come per richieste e ordini, un ordine di lavoro
aperto con modifiche in corso ferma la ricezione: le modifiche dei colleghi aspettano il giro dopo,
invece di arrivare sotto le mani.

### Senza collegamento si consulta

Con l'archivio condiviso **si lavora solo collegati**. Quando il server non risponde (manca la
rete, il progetto è sospeso) l'app passa in **sola lettura**: si apre tutto, si cerca, si stampa e
si esporta, ma non si crea e non si modifica niente. Un banner in cima a ogni vista lo dice, e i
pulsanti per creare spariscono. L'app riprova da sola ogni pochi secondi, e appena il server
risponde si torna a lavorare senza fare niente. Anche all'avvio, per il tempo della prima
risposta, la vista resta in sola lettura.

Il motivo è nel paragrafo che segue: numeri e codici li assegna il server, e un PC al buio non
potrebbe chiederli. In più, una modifica fatta al buio arriverebbe ai colleghi chissà quando,
magari su un documento che nel frattempo hanno cambiato loro.

### Numeri e codici li dà il server

**I numeri dei documenti** (richieste, ordini, ordini di lavoro e di produzione, piani, commesse,
modifiche tecniche MT) non li calcola più il PC: quando premi **+ Nuovo ordine** l'app chiede al
server il prossimo numero della serie, il server lo segna come preso, e solo allora l'ordine
nasce. Due colleghi che creano un ordine nello stesso istante ricevono due numeri diversi, sempre.
Chi genera più documenti insieme (da un piano, dal riordino sotto scorta, da una richiesta divisa
in ordine d'acquisto e ordini di lavoro) prende tutti i numeri in una volta.

**La serie non ha buchi.** Un numero preso per un documento che alla fine non nasce torna subito
al server, e il prossimo che crea un documento lo riprende, anche se nel frattempo un collega è
andato avanti. La serie non riparte mai sotto il numero più alto che c'è già.

**Si elimina solo l'ultimo** documento della serie, e il suo numero torna al prossimo. Gli altri
non si eliminano: ordini, ordini di lavoro e di produzione e commesse si **annullano**, richieste
d'offerta e piani si **chiudono**, e il numero resta occupato. Lo stesso per gli articoli: si
elimina solo l'ultimo codice della sua serie (per i sottogruppi, che contano a scendere, il più
basso); gli altri si segnano **obsoleti**. Un codice senza numero in fondo non fa parte di una
serie e si elimina come sempre. La regola vale anche senza archivio condiviso.

**I codici degli articoli** si impegnano sul server al salvataggio. Se un collega ha appena preso
lo stesso codice, anche se il suo articolo non è ancora arrivato qui:

- un codice **automatico** si ricalcola da solo saltando il suo, e l'app dice quale è stato dato;
- un codice **scritto a mano** non si cambia di nascosto: l'app chiede di sceglierne un altro.

Un codice impegnato e poi non usato (un salvataggio che non va in porto, una riga d'import
scartata) torna libero subito, e un collega lo prende invece di saltarlo: nemmeno la codifica ha
buchi.

Anche l'**import del catalogo da Excel** impegna i codici degli articoli nuovi prima di scriverli.
Quelli automatici si ricalcolano allo stesso modo; una riga con un codice scritto nel foglio e
appena preso da un collega finisce fra gli errori dell'import.

### Chi vince quando due persone toccano la stessa cosa

| Cosa | Cosa succede |
|---|---|
| **Aggiunte a un elenco**: quotazioni di listino, righe di documento, movimenti, righe di piano, sottofamiglie | **Convivono.** Due colleghi che registrano due quotazioni sullo stesso articolo non sono in conflitto: restano entrambe |
| **Lo stesso record modificato da due persone** (un articolo, la sua distinta, la testata di un ordine) | Vince **chi salva per primo**. Il secondo stava lavorando su una copia che nel frattempo era cambiata: la sua modifica non entra, riceve un avviso e vede comparire quella del collega, su cui può rifare la sua. Senza questo controllo avrebbe cancellato in silenzio il lavoro dell'altro |
| **Distinta base, ciclo e lavorazioni di un articolo** | Seguono l'articolo: **si tiene intera** quella di chi ha salvato per primo. Metà distinta di uno e metà dell'altro sarebbe un prodotto che nessuno ha progettato |
| **Cancellazione contro modifica** | Vince la **cancellazione**: un articolo mezzo cancellato non esiste |
| **Cancellazione contro uso** (uno elimina un fornitore, l'altro intanto lo mette in un ordine) | Vince **chi usa**, come in locale, dove non si elimina ciò che è citato. Il fornitore torna, e chi l'aveva eliminato riceve un avviso |
| **Lo stesso numero di documento** | Non succede più: il numero lo dà il server (vedi sopra). Resta una rete di sicurezza per i documenti creati prima della 0.104.0 o con uno schema non aggiornato: il **più recente si rinumera** da solo, se è ancora una bozza nata da poco, altrimenti l'app avvisa |

> **La regola pratica**: mettersi d'accordo su chi tiene in mano una distinta. Non perché l'app si
> rompa (non si rompe, e avvisa), ma perché su una distinta il lavoro di due persone non si
> somma. Sulle righe di un listino o di un ordine sì, e lì si può lavorare insieme senza pensarci.

### Quello che il server non lascia fare

I ruoli sono quelli del [cap. 26](#26-utenti-e-ruoli), ma ora li applica il server.

**Un rifiuto per permesso non ferma più la coda** (dalla 0.105.6). Se un invio contiene modifiche
a una tabella che il tuo ruolo non scrive — di solito perché un amministratore ti ha appena
cambiato ruolo — si scartano **solo quelle**: tornano come sono sul server, e tutto il resto parte.
Il PC continua a ricevere le modifiche dei colleghi. Prima il server rifiutava l'invio intero, e
tutta la coda restava ferma dietro di lui.

**Scarta solo i rifiutati** (dalla 0.105.6). Quando il server rifiuta un invio per un altro motivo,
la nuvola diventa rossa e il messaggio indica la via d'uscita. Nello stato della nuvola (*Archivio
condiviso*), finché ci sono modifiche in attesa, il pulsante **Scarta solo i rifiutati** manda il
lotto **a pezzi**, nell'ordine in cui le cose si citano (prima i fornitori, poi gli ordini che li
nominano): i record che il server rifiuta tornano come sono sul server e vengono elencati, tutti
gli altri partono. Prima l'unica uscita era **Scarta e riscarica**, che c'è ancora ma butta
**tutte** le modifiche non inviate e riscarica l'archivio: va tenuto per ultimo, e l'app stessa,
chiedendo conferma, suggerisce di provare prima l'altro.

**L'ora del PC non decide più** (dalla 0.105.6). Se due persone modificano la stessa cosa, entra la
modifica fatta sulla versione più aggiornata; chi lavorava su una copia vecchia riceve quella che ha
vinto. Vale anche per le righe di distinte e documenti, che partono quando sono diverse dall'ultimo
invio, non quando sono più recenti: un PC con l'orologio sbagliato non perde più le sue modifiche.
Anche **chi ha scritto** (autore di una modifica, di un documento nuovo, di una voce del cestino)
lo stabilisce il server, dall'utente collegato.

**Un numero, un documento** (dalla 0.105.6). Il server rifiuta due documenti con lo stesso numero.
Se ne arriva uno con un numero già usato (per esempio ripristinato dal cestino), l'app gli dà
subito un numero nuovo riservato dal server, e lo dice. Se l'archivio conteneva già dei doppioni
quando si è rieseguito `schema.sql`, l'esecuzione lo segnala: si correggono (il controllo delle
serie in *Gestione → Backup* li elenca) e si riesegue il file.

Alcuni casi particolari:

- **Le impostazioni** (*Gestione → Aree e moduli*, *Costi e margini*, unità di misura, condizioni d'offerta…) le
  cambia solo l'amministratore. Una modifica fatta da un altro ruolo resta sul suo PC, e glielo
  si dice.
- **Due amministratori sulle impostazioni** (dalla 0.105.6). Le impostazioni partono intere, e
  prima un amministratore con la copia indietro riportava indietro, senza dirlo, quello che un
  collega aveva appena cambiato. Ora, prima di inviarle, l'app guarda quelle sul server: le voci
  cambiate da un collega **restano**, e si scrivono solo quelle cambiate su questo PC. Sulla stessa
  voce vince chi invia per ultimo.
- **Importare un backup JSON, rimettere i dati d'esempio e azzerare** sono bloccati: su un
  archivio condiviso toccherebbero tutti. Per farlo si scollega prima il PC.
- **L'officina sui documenti** (dalla 0.105.4): su ordini, ODL e ODP il server le lascia cambiare
  solo lo stato, e creare solo l'ODL che nasce da una fase esterna di un ODP. Una sua modifica che
  toccasse altro (fornitore, righe, prezzi) torna respinta, con la versione del server. Dalla
  0.105.6 l'app non le fa nemmeno generare l'ODL da un ODP: è un documento con prezzo e
  fornitore, e lo emette chi scrive gli ordini (→ [cap. 22](#22-ordini-di-produzione-odp)).
- **Il cestino**: una voce la scrive solo chi può scrivere il record che contiene; svuotarlo resta
  di tutti.
- **L'ultimo amministratore attivo** non si declassa, non si sospende e non si elimina, nemmeno
  eliminando il suo utente dal pannello di Supabase.

Un **ripristino dal cestino** si dichiara al server (dalla 0.105.4), che toglie la cancellazione
invece di confrontare le date: il record torna anche se l'orologio di questo PC è indietro.

**La pulizia la fa il server** (dalla 0.106.0). Le voci del cestino oltre i 30 giorni le toglie il
server con la sua ora, non più ogni PC con il proprio orologio: un PC con la data avanti svuotava
il cestino di tutti prima del tempo. Il server tiene anche il registro delle cancellazioni, che
serve a far sparire da ogni PC quello che un collega ha eliminato; oltre i **90 giorni** quel
registro si accorcia. Un PC rimasto spento più a lungo, alla riaccensione, **riscarica l'archivio
intero** e lo dice con un avviso: le sue modifiche in coda partono prima. Dopo l'aggiornamento
va **rieseguito `supabase/schema.sql`** (cap. 31, passo 2); finché non lo si fa tutto funziona
come prima, ma il cestino sul server non si svuota.

### Scollegare un PC

Dallo stato della nuvola, **Scollega questo PC**. Da dentro l'app lo fa solo un amministratore;
dalla schermata d'accesso (dalla 0.105.4) chiede **email e password di un amministratore**
dell'archivio condiviso, e quindi il collegamento al server. I dati restano nel browser, ma da quel momento
sono una copia locale: le modifiche non arrivano più ai colleghi, e quelle dei colleghi non
arrivano più qui.

Gli utenti restano, ma **senza password**: quelle le teneva Supabase. Al primo accesso dopo lo
scollegamento **l'amministratore che ha scollegato** entra con la sua email e una password a
scelta (almeno 4 caratteri), che diventa la sua password su questo PC. Gli altri utenti la ricevono poi da lui, in
*Gestione → Utenti*. Questa strada si chiude appena qualcuno ha una password locale.

### Il backup resta

1. **Il piano gratuito non ha backup automatici**: se il progetto si perde, si perde. L'export
   JSON (*Gestione → Backup*) o il backup automatico in una cartella restano la risposta di ogni
   giorno, e vanno tenuti **fuori** dal servizio che si sta proteggendo: sul PC, su un disco, in
   un'unità di rete dell'azienda. Mai su GitHub.
2. **Un progetto inattivo per sette giorni viene sospeso**, e va riacceso a mano dal pannello di
   Supabase. Un'officina che chiude due settimane ad agosto lo scopre al rientro, con la nuvola
   rossa. Basta riaccenderlo: i dati ci sono. Con il segnale notturno qui sotto non succede.

### Supabase sveglio ogni notte

Il repository di Bomtrack su GitHub ha un lavoro notturno (`supabase-veglia`) che **tocca
Supabase** una volta al giorno, così il progetto non si sospende. Chiede solo se il servizio
risponde: non legge dati e non salva niente. Su GitHub c'è soltanto il codice di Bomtrack, mai
l'archivio né gli utenti (dalla 0.111.1; prima lo stesso lavoro poteva salvare una copia cifrata
fra gli artifact). Si imposta una volta, dal repository su GitHub: **Settings → Secrets and
variables → Actions → New repository secret**.

| Segreto | Cosa metterci |
|---|---|
| `SUPABASE_URL` | L'indirizzo del progetto, lo stesso che hai incollato in Bomtrack |
| `SUPABASE_KEY` | La chiave **pubblica** (*anon* o *publishable*), la stessa di Bomtrack |

- **Solo questi due.** Se dalla 0.107.0 avevi aggiunto anche `SUPABASE_DB_URL` e
  `BACKUP_PASSPHRASE`, **eliminali** dalla stessa pagina: non servono più, e il primo porta la
  password del database.
- **Per provarlo subito**: su GitHub **Actions → supabase-veglia → Run workflow**.
- **Se Supabase non risponde** il lavoro finisce rosso e GitHub ti manda un'email: il progetto è
  forse sospeso, e si riprende dal pannello di Supabase.
- **GitHub spegne i lavori notturni** di un repository in cui non si pubblica niente da 60 giorni,
  e lo dice per email. Si riaccende da **Actions → supabase-veglia → Enable workflow**.
- Senza segreti il lavoro non fa niente e lo scrive, senza errori.

### Una copia intera del database, dal tuo PC

L'export JSON porta i dati di Bomtrack, non gli utenti di Supabase con le loro password. Per una
copia **intera** del database, utenti compresi, c'è `supabase/backup.sh`: si lancia da un PC con
PostgreSQL (`pg_dump`, `psql`) e GnuPG installati, e il file esce già cifrato. Tienilo dove tieni
gli altri backup, mai su GitHub: dentro ci sono anche gli hash delle password.

1. In Supabase, **Connect** → *Session pooler*: copia la riga che comincia con `postgresql://` e
   metti la password del database al posto di `[YOUR-PASSWORD]`.
2. Dalla cartella del repository:
   `SUPABASE_DB_URL='postgresql://…' BACKUP_PASSPHRASE='…' supabase/backup.sh bomtrack-AAAA-MM-GG.sql.gz.gpg`
3. **La frase non si recupera.** Senza, la copia è illeggibile per tutti, te compreso: scrivila da
   qualche parte fuori dal PC.

**Rimettere una copia in un progetto nuovo.** È un lavoro da fare con calma, dallo stesso tipo di
PC (o da chi ti ha aiutato a mettere in piedi Supabase):

1. Crea un progetto Supabase nuovo ed esegui `supabase/schema.sql` (passi 1 e 2 qui sopra), senza
   creare utenti.
2. Dalla cartella del repository:
   `SUPABASE_DB_URL='postgresql://…' BACKUP_PASSPHRASE='…' supabase/ripristino.sh bomtrack-AAAA-MM-GG.sql.gz.gpg`
   con il *Session pooler* del progetto **nuovo**. Entra tutto o niente.
3. Ricollega i PC al progetto nuovo (passo 6). Utenti, ruoli e password sono quelli di prima;
   la funzione `bomtrack-utenti` va ripubblicata (passo 9).

### Quanto regge il piano gratuito

| | |
|---|---|
| **Spazio utile** | ~430 MB dei 500 dichiarati (il resto lo occupa il servizio) |
| **Officina piccola, 3 anni** | ~25% dello spazio: sta larga |
| **Il primo limite che si incontra** | Non è lo spazio, è la **banda**. Per questo a ogni giro si scarica solo quello che è cambiato |
| **Scaricare o caricare tutto** | A pezzi (dalla 0.105.4): una tabella alla volta, mille righe per richiesta in arrivo e cinquecento in partenza, così nessuna richiesta supera i limiti di Supabase |
| **Cosa cresce davvero** | I **movimenti di magazzino** e le **revisioni** rilasciate. Il catalogo, per quanto grande, pesa poco |

> ✅ **Gli allegati non pesano su questo conto.** Dalla 0.78.0 i PDF stanno in una cartella fuori
> dall'app (→ [cap. 8](#8-la-scheda-articolo-campo-per-campo)), e il database ne porta solo il
> **percorso**. Ogni PC ha la sua copia della cartella.

---

# Parte VII — Riferimenti

## 32. Scorciatoie da tastiera

| Tasti | Effetto |
|---|---|
| **Ctrl+K** (⌘K) | **Ricerca globale** — articoli, richieste, ordini, ordini di lavoro, piani e, dalla 0.105.6, **commesse**. Si scrive un codice o un numero e si salta dove serve, senza passare dalla vista giusta e dai suoi filtri. Dalla 0.105.6 un documento si trova anche dal **nome del fornitore o del cliente** — chi telefona dice «sono della SKF», non il numero dell'ordine —; quei risultati vengono dopo quelli che corrispondono per numero |
| **Ctrl+I** (⌘I) | Apre e chiude il **pannello laterale** |
| **Ctrl+P** | **Stampa** della vista aperta |
| **Esc** | Chiude la finestra in cima; nell'elenco con pannello aperto, deseleziona |
| **↑ ↓** | Scorre le righe dell'elenco, o i risultati della ricerca globale |
| **Invio** | Apre la scheda completa dell'articolo scelto, o il risultato della ricerca. Nella ricerca globale, dalla 0.105.6, Invio premuto subito dopo l'ultimo tasto — o mandato da un lettore di codici — apre il risultato di **quello che è scritto**, non di quello che si era scritto un attimo prima |
| **Ctrl+click** | Aggiunge una riga alla selezione |
| **Maiusc+click** | Seleziona l'intervallo fra la riga corrente e quella cliccata |
| **Maiusc+↑ ↓** | Estende la selezione |

---

## 33. Stati dei documenti

### Gli stati

| Documento | Stati |
|---|---|
| **Richiesta di offerta** | Bozza · Inviata · Offerta ricevuta · Chiusa |
| **Ordine** (ODA) e **Ordine di lavoro** (ODL) | Bozza · Inviato · Confermato · Parziale · Evaso · Annullato |
| **Commessa** | Aperta · In produzione · Chiusa · Annullata |
| **Piano di fabbisogno** | Aperto · Chiuso |

### Cosa resta modificabile

| Documento | Stato | Modificabile |
|---|---|---|
| RFQ | **Bozza** | tutto |
| RFQ | **Inviata** · **Offerta ricevuta** | prezzo unitario e data di consegna |
| RFQ | **Chiusa** | nulla |
| ODA / ODL | **Bozza** | tutto |
| ODA / ODL | **Inviato** · **Confermato** · **Parziale** · **Evaso** | la colonna Ricevuto (Rientrati) |
| ODA / ODL | **Annullato** | nulla |

**In ogni stato** restano sempre modificabili: le note del documento, le 🔒 note interne, le note
di riga, e **lo stato stesso**.

**🔓 Sblocca per modifica** riapre un documento bloccato. Lo sblocco vale **finché si resta
dentro**: uscendo e rientrando, il documento torna bloccato.

### Le transizioni automatiche

| Da | A | Quando |
|---|---|---|
| Bozza | Inviata / Inviato | alla **generazione del PDF o dell'Excel** (previa conferma; rifiutando, il file si scarica e lo stato non cambia) |
| Inviata | Offerta ricevuta | quando **tutte** le righe hanno un prezzo *(torna indietro se un prezzo si svuota)* |
| *(RFQ)* | Chiusa | quando dalla richiesta **nasce un ordine** |
| Inviato | Confermato | quando si compila il **n° di conferma** del fornitore |
| Confermato | Parziale → Evaso | man mano che si registrano i **ricevimenti** (o i rientri) |

> **Bozza e Annullato non vengono mai toccati automaticamente.**

---

## 34. Glossario

| Termine | Significato |
|---|---|
| **BOM** | *Bill of Materials*, distinta base: l'elenco di cosa contiene un prodotto |
| **RFQ** / RDO | *Request For Quotation*, richiesta di offerta: si chiede un prezzo, non si compra |
| **ODA** | Ordine d'acquisto: si compra **merce** |
| **ODL** | Ordine di lavoro: si commissiona una **lavorazione** a un terzista |
| **Conto lavoro** | Mandare un pezzo fuori a lavorare e riaverlo indietro. La merce resta nostra |
| **Terzista** | Il fornitore che esegue una lavorazione in conto lavoro |
| **Tratta** | Le fasi **consecutive** dello stesso terzista, commissionate come una sola lavorazione |
| **Passata** | Un giro di uscita e rientro dallo stesso terzista. Due passate dallo stesso terzista = due ODL |
| **Fase** | Un passo del ciclo di lavorazione (10, 20, 30…) |
| **Ciclo di lavorazione** | La sequenza di fasi che trasforma il materiale in una parte |
| **Distinta di una parte** | Il materiale che una parte consuma: materie prime e commerciali, mai assiemi o altre parti. Dalla 0.125.0 sta in *Gestione DB* come quella degli assiemi |
| **Concetto** | L'oggetto nel nome di una parte: `ALBERO`, `FLANGIA`. Sempre maiuscolo, scelto da un elenco |
| **Sigla** | L'abbreviazione di una macchina o di un gruppo, che entra nei codici |
| **Approvvigionamento** | Come si ottiene una parte: *Produzione interna* o *Acquisto da fornitore* |
| **Quotazione** | Un prezzo offerto da un fornitore per un articolo. Più quotazioni per articolo; una sola è quella in uso |
| **Scarto %** | La quota di materiale che si perde: 10 pezzi con 5% di scarto consumano materiale per 10,5 |
| **Overhead / spese generali** | La percentuale che si aggiunge al costo per coprire i costi non diretti |
| **Margine / markup** | La percentuale che si aggiunge al costo totale per ottenere il prezzo di vendita |
| **Fabbisogno lordo** | Quanto serve, senza guardare cosa c'è |
| **Fabbisogno netto** | Quanto serve **comprare**: lordo + scorta minima + impegnato − esistente − in arrivo |
| **Esistente** | Quello che c'è adesso a scaffale |
| **In arrivo** | Ordinato e non ancora entrato |
| **Impegnato** | Promesso ai piani aperti |
| **Libero** | esistente + in arrivo − impegnato |
| **Scorta minima** | La soglia sotto cui si avvisa, e che il netto ricostituisce |
| **Lotto di riordino** | La quantità a cui si arrotondano gli acquisti (multiplo esatto o quantità minima) |
| **Saturazione** | La percentuale di capacità di un centro occupata in una settimana |
| **Capacità** | Le ore che un centro può fare in una settimana. **0 = non dichiarata** |
| **Macchina utensile** | La risorsa dentro un centro di lavoro (il tornio CNC nella Tornitura), con tariffa, manutenzione e fermi propri (modulo, dalla 0.126.0) |
| **Ore di macchina** | Le ore-uomo di una fase divise per i suoi operatori: quanto la macchina lavora |
| **Revisione** | Una fotografia congelata di una distinta, identificata da una lettera |
| **Cruscotto** | La pagina che dice come stanno le cose: valore di magazzino, articoli fermi, sotto scorta, consegne scadute (→ [cap. 5](#il-cruscotto)) |
| **Articolo fermo** | Un articolo con giacenza e nessun movimento da 3, 6 o 12 mesi: denaro immobilizzato a scaffale |
| **Valore giacenza** | Esistente × costo unitario, sommato su tutto il magazzino |
| **IndexedDB** | Il database interno del browser dove sta l'archivio dalla 0.87.0. Prima stava in `localStorage`, limitato a circa 5 MB |
| **Archivio condiviso** | Il database unico su cui lavorano tutti i colleghi, al posto di una copia per PC; ogni PC ne tiene una copia e la allinea da solo (→ [cap. 31](#31-larchivio-condiviso-supabase)) |
| **Supabase** | Il servizio scelto per ospitare l'archivio condiviso: database, autenticazione e permessi |
| **Permessi sul server** | I ruoli applicati dal database invece che dall'app. È la differenza fra separare le responsabilità e proteggere davvero i dati |

---

## 35. Domande frequenti

**Non trovo un fornitore (o un cliente, o un centro) nel menu a tendina.**
Probabilmente è **sospeso**. *Gestione →* la sua scheda *→ Riattiva*. Le voci sospese restano negli
archivi e nei documenti che le citano, ma spariscono dai menu.

**Non riesco a modificare una riga di un ordine.**
Dipende dallo **stato** (→ [cap. 33](#33-stati-dei-documenti)). Un ordine *Inviato* lascia
modificare solo la colonna Ricevuto. Se serve davvero, **🔓 Sblocca per modifica**.

**Il costo di una parte è zero.**
Tre possibilità: (a) è a *Acquisto da fornitore* e non ha nessuna quotazione a listino →
[cap. 10](#10-listino-fornitori); (b) è a *Produzione interna* e non ha né distinta né ciclo
→ [cap. 13](#13-tecnico--gestione-db) e [cap. 14](#14-cicli-di-lavorazione); (c) i suoi componenti non hanno prezzo.
Il Riepilogo elenca gli «articoli d'acquisto senza prezzo».

**Il costo della macchina non torna / compare un avviso rosso.**
C'è un **riferimento ciclico**: un assieme che, scendendo, contiene se stesso. L'avviso nomina
l'articolo coinvolto. Si corregge togliendo la riga che chiude l'anello.

**Un articolo non entra nel fabbisogno.**
Se è una **parte a *Acquisto da fornitore***, la sua distinta non viene esplosa: si compra la parte,
non il suo materiale. È il comportamento voluto. Per far comprare il materiale, la parte va messa a
*Produzione interna*.

**Ho registrato il ricevimento ma la giacenza non è cambiata (o è cambiata due volte).**
Il ricevimento di un **ODA carica il magazzino da solo**: non serve anche un movimento di carico.
Il campo **Rientrati** di un **ODL** invece **non carica**: lì il carico lo fa il movimento di
*rientro da conto lavoro* (→ [cap. 23](#23-ordini-di-lavoro-odl-e-conto-lavoro)).

**Ho mandato un pezzo da Beta a Gamma e la giacenza non si muove.**
È corretto: è un **passaggio di lavorazione**, un cambio di luogo a quantità invariata. Il pezzo
non è mai stato a scaffale.

**Il fabbisogno mi dice di comprare roba che ho già.**
Attiva la casella **Fabbisogno netto**. Senza, la lista è **lorda**: quanto serve, senza guardare
cosa c'è.

**Due piani mi chiedono lo stesso materiale.**
È il termine **impegnato** che li tiene separati: finché entrambi sono **aperti**, il piano che
consegna dopo vede la quota di quello che consegna prima come già promessa, e compra solo la sua
parte. Il piano che non serve più va **chiuso**: la sua quota torna libera.

**Il Carico centri dice che sono in sovraccarico. Cosa faccio?**
Bomtrack te lo dice, non lo risolve: **non c'è schedulazione**. La decisione — anticipare, mandare
fuori una fase, spostare una consegna — resta a chi la prende.

**Un centro non mostra mai il sovraccarico.**
Ha la **capacità a 0**, che significa «non dichiarata». *Gestione → Centri di lavoro*.

**Ho perso i dati.**
I dati stanno **in questo browser, su questo PC**. Controlla: stai usando lo stesso browser? Lo
stesso profilo? Sono stati puliti i dati del sito? Se hai un backup JSON, *Gestione → Backup →
Importa JSON*. Se hai eliminato qualcosa per errore negli ultimi **30 giorni**, guarda nel
**Cestino** prima di disperare.

**Ho due schede di Bomtrack aperte e una dice «Modificato in un'altra scheda».**
L'altra scheda ha salvato dopo che questa aveva caricato i dati. L'ultima modifica di questa scheda
**non è stata salvata**, di proposito: avrebbe cancellato il lavoro dell'altra. Le strade sono tre:
**Esporta backup** (prima di tutto, se hai dubbi), **Ricarica dall'archivio** (si perde quello che
questa scheda non ha salvato) o **Tieni questa versione** (si perde quello che l'altra ha fatto).
Il modo per non trovarsi lì è lavorare in una scheda sola.

**All'avvio compare «Dati non caricati».**
Il browser non ha lasciato leggere l'archivio. Se il testo dice che **l'archivio sta in
IndexedDB e il browser non l'ha aperto**, i dati non sono persi: chiudi le altre schede o finestre
con Bomtrack e ricarica. Finché l'avviso resta, l'app non salva niente. Se invece dice che i dati
salvati **non si riescono più a leggere**, i dati non sono stati cancellati, e l'avviso dice dove
sono (dalla 0.105.6 distingue tre casi):

- **messi da parte**: una copia di soccorso è stata salvata nel browser, così com'era, e resta
  recuperabile a mano;
- **una copia c'era già** da una volta precedente, e non è stata toccata;
- **non è stato possibile metterne da parte una copia**, perché lo spazio del browser non basta.
  Allora i dati esistono **solo al loro posto**: l'avviso lo dice in rosso, e il pulsante **Scarica
  i dati illeggibili** li salva come file. **Finché non lo fai l'app non salva nessuna modifica**,
  per non scriverci sopra. Prima l'avviso diceva che una copia esisteva, e il primo salvataggio
  cancellava l'originale.

In tutti e tre i casi quello che vedi è il database di esempio, non ancora salvato: scarica i dati
illeggibili (il pulsante c'è anche negli altri due casi, e il file è la copia più facile da portare a chi deve
recuperarla), poi reimporta l'ultimo backup JSON.

**Lo spazio del browser è quasi pieno.**
Dalla 0.87.0 l'archivio sta in IndexedDB e lo spazio è di solito di gigabyte: l'avviso compare
solo se il disco stesso è quasi pieno. Su un browser senza IndexedDB il limite resta di circa 5 MB:
esporta un backup, svuota il cestino e recupera lo spazio degli allegati (*Gestione → Backup*).

**Come lavoriamo in due sullo stesso archivio?**
Collegando un **archivio condiviso** su Supabase: ogni PC tiene la sua copia e la allinea da
solo, e i ruoli li applica il server. Come si mette in piedi, e chi vince quando due persone
toccano la stessa cosa, sta nel [cap. 31](#31-larchivio-condiviso-supabase). Senza, ogni PC ha
la sua copia, e ci si allinea passandosi il **backup JSON**.

**L'app non genera il PDF.**
I pulsanti **Genera documento** sono **disabilitati finché ci sono modifiche non salvate**: premi
**Salva** prima. Se invece non succede proprio niente, guarda *Gestione → Backup → Registro errori*.

---

# Appendice A — Come funziona sotto

Questa appendice serve a chi deve installare, spostare, salvare o sviluppare Bomtrack. Chi la usa
e basta può fermarsi al capitolo 33.

## A.1 Lo stack

Bomtrack è **vanilla JavaScript + HTML + CSS**. Nessun framework, nessun modulo ES, nessun
bundler, **nessun passo di build**, nessun `package.json`. Gli script sono caricati in sequenza da
`index.html` e condividono lo scope globale.

Le librerie di terze parti sono **incluse nella cartella**, in `vendor/`:

| Libreria | A cosa serve |
|---|---|
| `jspdf.umd.min.js` + `jspdf.plugin.autotable.min.js` | Generazione dei PDF |
| `xlsx.full.min.js` (SheetJS) | Lettura e scrittura degli Excel |

Sono lì apposta: l'app deve funzionare **completamente offline**, anche aperta da `file://`.
Le risorse di rete sono i font di Google Fonts, senza i quali l'app funziona lo stesso, e, solo
se lo si collega, l'**archivio condiviso** su Supabase (→ [cap. 31](#31-larchivio-condiviso-supabase)).
Senza, non c'è backend e non c'è database remoto.

## A.2 Dove risiedono i dati

L'archivio è un unico documento JSON. Dalla 0.87.0 sta in **IndexedDB**, il database del browser,
nel database **`bomtrack_archivio`**: lì il limite è lo spazio che il browser concede al sito
(di solito gigabyte), non i circa 5 MB di `localStorage` dove stava prima. Il primo avvio della
0.87 lo trasloca da solo: copia, rilegge la copia e solo se coincide libera `localStorage`. Se il
browser non ha IndexedDB, l'archivio resta in `localStorage` come prima.

| Dove | Chiave | Contenuto |
|---|---|---|
| IndexedDB | `db` | **L'archivio.** Tutto il lavoro sta qui |
| IndexedDB | `illeggibile` | Dove finisce un archivio che non si riesce più a leggere, invece di essere sovrascritto dai dati di esempio |
| localStorage | `bomtrack_v1_rev` | Il contatore delle scritture, con cui due schede aperte si accorgono l'una dell'altra |
| localStorage | `bomtrack_v1_in_indexeddb` | Il segno che l'archivio è traslocato: se un giorno IndexedDB non si apre, l'app non riparte dai dati di esempio |
| localStorage | `bomtrack_ultimo_backup` | La data dell'ultimo *Esporta JSON* da questo browser |

Senza IndexedDB le prime due stanno in `localStorage`, come `bomtrack_v1` e
`bomtrack_v1_illeggibile`. Le chiavi qui sotto sono invece sempre in `localStorage`:

| Chiave | Contenuto |
|---|---|
| `bomtrack_theme` | Il tema scelto |
| `bomtrack_session` | La sessione aperta |
| `bomtrack_columns` | Le colonne nascoste, per vista |
| `bomtrack_densita` | La vista compatta, se accesa |
| `bomtrack_inventario:<archivio>:<utente>` | L'inventario in corso, finché non si registra o si annulla: uno per archivio e per utente (dalla 0.105.6; prima la chiave era `bomtrack_inventario` e basta) |
| `bomtrack_archivio_nome` | Il nome della cartella d'archivio scelta su questo PC |
| `bomtrack_backup_cartella_nome` | Il nome della cartella del backup automatico scelta su questo PC |
| *(chiave email)* | L'email ricordata da «Ricordami su questo PC» |

Le ultime otto sono **preferenze personali di questa macchina**, non dati aziendali: non entrano
nel backup e non si condividono.

Con l'**archivio condiviso** se ne aggiungono altre, sempre di questo PC:

| Chiave | Contenuto |
|---|---|
| `bomtrack_cloud` | Indirizzo del progetto e chiave pubblica, se il PC ha finito il primo collegamento, e da che punto chiedere le novità |
| `bomtrack_cloud_sessione` | La sessione di Supabase Auth: si chiude uscendo dall'app |
| `bomtrack_cloud_base` | La fotografia dell'ultimo invio riuscito, da cui l'app sa che cosa resta da mandare anche dopo un riavvio |
| `bomtrack_cloud_nuovapassword` | Solo fra l'apertura di un invito e la scelta della password | Le due cartelle, archivio e backup, stanno fra queste di proposito: ogni PC ha la
sua, e importarla da un backup imporrebbe a tutti la lettera di unità del primo che l'ha scelta.

**Fuori dall'archivio** stanno due cose, entrambe fatte di file. In **IndexedDB**, in un database
a parte (`bomtrack_allegati`), i byte degli allegati caricati dentro l'app prima della 0.78.0. Nella **cartella d'archivio** i PDF dei
documenti (→ [cap. 8](#8-la-scheda-articolo-campo-per-campo)): quella cartella non appartiene a
Bomtrack, che ci guarda dentro e basta.

**Lo schema è versionato** (`SCHEMA_VERSION = 2`; la v1 usava id interi, la v2 usa UUID e
timestamp). Le migrazioni sono **idempotenti**: un backup vecchio si auto-migra all'import.

**Il cestino** trattiene le eliminazioni per **30 giorni** (`TRASH_DAYS`).

## A.3 Le collezioni

| Collezione | Contiene | Figli annidati |
|---|---|---|
| `items` | **Gli articoli** — tutti e sei i tipi | `components`, `operations`, `cycle`, `priceList` |
| `revisions` | Le revisioni congelate | — |
| `movements` | I movimenti di magazzino | — |
| `productions` | Le dichiarazioni di avanzamento di produzione | — |
| `attachmentDocs` | **I documenti d'archivio**: il percorso di un PDF dentro la cartella, e la sua descrizione. Uno per file, mai duplicato | — |
| `generatedDocs` | **I documenti emessi**: il percorso della copia PDF di una richiesta, di un ordine o di un ordine di lavoro, con revisione, impronta SHA-256 e invio. Uno per file, mai riscritto | — |
| `attachments` | **I legami** fra un articolo e un allegato: con `docId` è un documento d'archivio (e può portare la `page`), senza è un file custodito in IndexedDB | — |
| `suppliers` · `customers` | Fornitori e clienti | — |
| `workCenters` | I centri di lavoro | `suppliers` (fornitori conto lavoro) |
| `families` | Le famiglie articolo | `subs` (sottofamiglie) |
| `rfqs` · `orders` · `workOrders` | Richieste, ordini, ordini di lavoro | `lines` |
| `prodOrders` | Gli ordini di produzione | `phases`, `materials` |
| `prodDecls` | Le dichiarazioni di avanzamento: eventi, non stato | — |
| `plans` | I piani di fabbisogno | `lines` |
| `jobs` | Le commesse | — |
| `users` | Gli utenti (con `passwordHash` e `passwordSalt`) | — |
| `trash` | Il cestino | — |

Ogni record porta `id` (UUID), `createdAt` / `updatedAt`, `createdBy` / `updatedBy` e `active`.

**I sei tipi di articolo** stanno tutti in `items`, distinti dal campo `type`:
`macchina` · `gruppo` · `sottogruppo` · `parte` · `materiale` (materia prima) ·
`acquistato` (commerciale).

**La distinta** (`components[]`) di assiemi e parti: righe con `itemId`, `qty`, `scrapPct`, e
per una parte `costOverride` (il costo di riga forzato). **Le righe di ciclo** (`cycle[]`) sono
fasi, `kind: 'op'`, con `workCenterId`, `supplierId`, `costMode`, `hours`, `operators`, `days`,
`rate` o `cost`. Fino alla 0.124 il ciclo di una parte conteneva anche le righe materiale
(`kind: 'item'`): la migrazione le sposta nella distinta.

**I movimenti** portano `kind` (uno dei sette tipi), `qty` con segno, e per il conto lavoro
`supplierId` (dove va) e `fromSupplierId` (da dove viene).

## A.4 I file sorgente

| File | Contenuto |
|---|---|
| `index.html` | Struttura della pagina, navigazione, barre filtri statiche, caricamento script |
| `style.css` | Foglio di stile unico, tema chiaro/scuro, regole di stampa |
| `icons.js` | Le icone SVG |
| `theme.js` | Il tema |
| `store.js` | **Il layer dati**: schema, migrazioni, API, persistenza, hash password, cestino |
| `core.js` | Stato applicativo, utility, ruoli e permessi, `APP_VERSION`, scorciatoie |
| `auth.js` | Accesso, sessione, primo amministratore |
| `costing.js` | **Il motore di costificazione** (rollup ricorsivo) e i modi di approvvigionamento |
| `shell.js` | Ricerca globale, stampa, definizione della navigazione, routing |
| `worklist.js` | Il telaio delle viste a documento |
| `columns.js` · `inspector.js` | Scelta colonne · pannello laterale |
| `views-bom.js` · `views-rev.js` | Distinte e revisioni |
| `views-stock.js` | Magazzino, movimenti, conto lavoro |
| `views-catalog.js` | Anagrafiche, listino, scheda articolo, cicli |
| `views-report.js` · `views-item.js` · `views-home.js` · `views-dash.js` | Costificazione · scheda di sola lettura · Riepilogo · Cruscotto |
| `views-mrp.js` | Fabbisogno e Carico centri |
| `views-avanzamento.js` | Avanzamento: il Gantt del piano con lo stato dei documenti |
| `views-jobs.js` · `views-docs.js` | Commesse · RFQ, ODA, ODL |
| `views-prod.js` | Ordini di produzione: fasi congelate, avanzamento, movimenti |
| `views-manage.js` | Gestione |
| `produzione.js` | Avanzamento di produzione |
| `allegati.js` · `archivio.js` | Allegati e documenti degli articoli · la cartella d'archivio (scelta, permesso, lettura, copia, verifica) |
| `documenti.js` | Le copie dei documenti emessi nella cartella d'archivio: quando si archiviano, le revisioni, la sezione in scheda e la verifica |
| `export-lists.js` · `import-catalog.js` · `import-export.js` | Export elenchi · import articoli · import distinte, backup, avvio |
| `cloud-map.js` | Traduzione della forma dati verso un futuro backend. Funzioni pure, nessun codice di rete |
| `vendor/` | jsPDF, jsPDF-AutoTable, SheetJS |
| `docs/` | Analisi tecnica, schema cloud, sostenibilità |
| `test/` | La suite di test |

## A.5 I test

Non servono all'app, servono a chi la modifica. Richiedono **Node 18+** e nessuna installazione:

```
node test/run.js      # la suite completa
node test/bench.js    # benchmark del motore di costificazione
```

Due gruppi di test si attivano solo se trovano quello che serve, e altrimenti si dichiarano
**saltati**: quelli nel browser vero (impaginazione a sette larghezze, IndexedDB) vogliono
**Playwright** con Chromium; quelli dello schema del database condiviso vogliono un **Postgres**,
indicato dalla variabile `BOMTRACK_PG`. In CI, a ogni push, ci sono entrambi e gira tutto.

## A.6 I limiti architetturali

- **Senza archivio condiviso, un archivio per browser.** Niente sincronizzazione; ci si allinea
  con i backup JSON. Il registro delle modifiche resta di ogni PC anche con l'archivio condiviso.
- **Senza archivio condiviso, il controllo dei permessi è sul client.** Chi apre gli strumenti di
  sviluppo lo aggira. Con l'archivio condiviso lo fanno le policy RLS di Postgres.
- **La dimensione dell'archivio è limitata** da quanto il browser concede al sito: con IndexedDB
  (dalla 0.87.0) di solito gigabyte, senza qualche megabyte. *Gestione → Backup* mostra la
  dimensione corrente e lo spazio disponibile.

**L'archivio condiviso** (dalla 0.103.0, [cap. 31](#31-larchivio-condiviso-supabase)) poggia
su quattro pezzi: `supabase/schema.sql` (tabelle, le due funzioni `push_changes()` e
`pull_changes()`, i permessi per ruolo, i profili nati dagli inviti), `cloud-map.js` (la
traduzione fra il documento locale e le righe delle tabelle), il conto delle modifiche in
`store.js` (`takeChanges()`, `markSynced()`) e `cloud.js`, l'unico file con codice di rete:
l'accesso a Supabase Auth, l'invio e la ricezione, il primo collegamento. Non usa librerie:
bastano `fetch()` e quattro indirizzi. L'archivio locale resta quello che le viste leggono e
scrivono, in modo sincrono come prima, e diventa lo specchio di quello condiviso e la coda di
quello che non è ancora partito. Il contratto è in `docs/cloud-schema.md`.

**Le prove.** `test/supabase-finto.js` è un Supabase finto, con dietro un Postgres vero e lo
schema vero: `test/cloud.test.js` ci fa lavorare tre PC (caricamento, scaricamento, conflitti,
cancellazioni, permessi, rete che cade, token che scade) e `test/cloud-ui.test.js` rifà il giro
dall'interfaccia, in Chromium.

---

*Manuale di Bomtrack — aggiornato alla versione 0.94.0.*
*Le funzioni descritte qui corrispondono a quella revisione; il changelog dell'app elenca le
differenze rispetto alle versioni successive.*
