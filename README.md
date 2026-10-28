# Bomtrack — Distinte Base & Costificazione

App per creare e gestire **distinte base (BOM) multi-livello** di macchine meccaniche, ottenere la **costificazione automatica** e gestire il ciclo acquisti (**richieste di offerta** e **ordini a fornitore**).

Costruita con lo stesso stile di TimeTrack: vanilla JavaScript + HTML + CSS, nessun build, tema dark. **Database nel browser** (IndexedDB, `localStorage` se manca), che basta da solo; dalla 0.103.0 si può collegare un **archivio condiviso su Supabase**, e allora i dati del browser diventano la copia locale di quello (manuale, cap. 31).

➡️ **[MANUALE D'USO](MANUALE.md)** — il manuale operativo completo: cosa fa ogni schermata, come si compilano i campi, e il **flusso di lavoro** dalla commessa del cliente alla merce a magazzino. Dentro l'app si apre con il pulsante 📖 nell'intestazione (`manuale.html`, offline come tutto il resto); `genera-manuale.py` lo rigenera da `MANUALE.md`, che resta l'unica fonte. Questo README è invece la documentazione funzionale, orientata al perché delle scelte.

## Avvio

Aprire `index.html` in un browser (doppio click, oppure usare l'estensione "Live Server" di VS Code). Al primo avvio l'app chiede di creare l'**amministratore** (nome, email, password) e carica dei dati di esempio (macchina "Nastro Trasportatore NT-100"). Agli avvii successivi si entra con email e password; "Ricordami" conserva l'email e la sessione resta aperta fino a **Esci**.

**Non serve la rete**, mai: le librerie di export stanno in `vendor/` dentro la cartella dell'app. Copiando la cartella su un altro PC funziona tutto, PDF ed Excel compresi. I caratteri sono l'unica cosa che arriva da fuori, e sono un abbellimento: si caricano **senza bloccare** il disegno della pagina, e se non arrivano l'app usa quelli di sistema senza accorgersene. (Fino alla 0.76.0 erano un `<link>` normale, e su un PC senza rete l'avvio aspettava il timeout del DNS a finestra bianca.)

La revisione in esecuzione è mostrata accanto al logo, in alto a sinistra (es. `v0.6.0`), e corrisponde alla voce in cima al [changelog](#changelog).

## Funzionalità

La barra dei comandi ha **sette gruppi**, ordinati per processo (dalla 0.91.0); le voci del gruppo aperto compaiono su una seconda riga, e ogni gruppo ricorda l'ultima voce usata.

| Gruppo | Voci |
|---|---|
| 🏠 **Riepilogo** | Riepilogo · Cruscotto |
| 🌳 **Tecnico** | Articoli di progetto · Articoli d'acquisto · Gestione DB · Visualizza DB · Cicli di lavorazione |
| 📋 **Pianificazione** | Commesse · Fabbisogno · Carico centri · Avanzamento |
| 🛒 **Acquisti** | Richieste offerta · Ordini fornitore · Listino fornitori |
| 🏭 **Produzione** | Ordini di produzione · Ordini di lavoro |
| 📦 **Magazzino** | — |
| ⚙ **Gestione** | — (solo amministratori) |

Fino alla 0.90 i gruppi seguivano il tipo di dato (Anagrafica, Cicli di lavorazione, Distinta base, Documenti), e «Documenti» teneva insieme pianificazione, acquisti e produzione. Le voci qui sotto citano ancora, in qualche caso, il gruppo di allora.

- **🌳 Distinta base → Gestione DB** — albero multi-livello espandibile della macchina selezionata, con **numerazione di posizione** (1, 1.1, 1.1.1, 1.2, 2…), costo unitario e di riga per ogni componente, lavorazioni interne e card di riepilogo costi. Aggiunta/modifica/eliminazione di componenti e lavorazioni. I sottogruppi possono contenere altri sottogruppi, senza limite di profondità. Una **barra filtri** (testo, livello, macchina di appartenenza) restringe l'elenco delle distinte; la distinta aperta resta sempre raggiungibile anche quando il filtro la escluderebbe.
- **📇 Anagrafica → Acquisti** — anagrafica di ciò che si compra: **materie prime** (costo unitario per U.M., es. €/kg) e **componenti commerciali**, con flag **preferito ★** (e filtro dedicato) e flag **obsoleto ⛔**. Fornitore e prezzo non si scrivono qui: la scheda li mostra in sola lettura e rimanda al **listino fornitori**.
- **📇 Anagrafica → Progetto** — anagrafica di ciò che si costruisce: **macchina**, **gruppo**, **sottogruppo** (assiemi, con propria distinta e lavorazioni) e **parte** (foglia con distinta parte e ciclo di lavorazione, con flag **obsoleto ⛔**). Ogni parte dichiara il proprio **approvvigionamento**: prodotta in casa oppure acquistata da un fornitore. Oltre a testo, tipo, famiglia e sottofamiglia, la barra filtri ha anche **macchina** e **gruppo**: scegliendo una macchina restano solo lei, i suoi gruppi, sottogruppi e parti; scegliendo un gruppo si restringe a quello.
- **📦 Magazzino** — lo stato delle giacenze di tutto ciò che si tiene a scaffale, in una lista sola: **commerciali, materie prime e parti insieme**, perché il magazzino non conosce la divisione fra acquisti e progetto (gli assiemi restano fuori: si producono, non si stoccano). Per ogni articolo **esistente, in arrivo, impegnato, libero, scorta minima e lotto**, con il ⚠ su chi è sotto scorta. Stessi filtri dell'anagrafica (testo, tipo, famiglia, sottofamiglia, macchina, gruppo) più il filtro per **stato**: sotto la scorta minima, giacenza a zero, con giacenza, libero negativo — macchina e gruppo restringono alle sole **parti** che li portano: commerciali e materie prime non sono mai legati a una macchina. Dalla riga si registra una **rettifica** o si apre lo **storico dei movimenti**. Tre tipi di movimento seguono il **conto lavoro**: l'*uscita a conto lavoro* toglie dal magazzino il materiale spedito a un terzista — allo scaffale non c'è più —, il *rientro* rimette dentro il pezzo finito, e il **passaggio di lavorazione** sposta un pezzo da un terzista al successivo **senza toccare la giacenza**: è un movimento di *luogo*, non di quantità. Il filtro **presso terzi o in lavorazione** e il pulsante omonimo mostrano cosa sta fuori e da chi, per fornitore e per ordine, con export Excel e PDF: anche questo è **calcolato**, non un saldo scritto da qualche parte — e da **due sorgenti** che restano distinte: i movimenti degli ordini di lavoro, e la **fase corrente** degli ordini di produzione, che fra una fase e l'altra di movimenti non ne scrivono. Fra due tratte i pezzi compaiono sotto **«in casa, fra due fasi»**, che è un luogo a sé: esistono, non sono a scaffale e non sono da nessuno. Un settimo tipo, il **versamento di produzione**, carica il pezzo finito all'ultima fase di un ordine di produzione; come il passaggio, non si sceglie a mano dalla rettifica. I numeri sono gli stessi del fabbisogno: nessun campo scrivibile, l'esistente resta *ricevuto sugli ordini + movimenti*.
- **🔧 Cicli di lavorazione** — vista dedicata alle parti: in alto la scelta della parte con i filtri per famiglia, sottofamiglia e testo; sotto la **distinta parte** (materie prime e commerciali necessari) e il **ciclo di lavorazione** (fasi 10, 20, 30… riordinabili con ↑ ↓). In testa una riga dice da dove viene il costo di quella parte, secondo il suo approvvigionamento. Ogni modifica si salva subito.
- **⚙ Carico dei centri di lavoro** (*Pianificazione → Carico centri*) — le ore che i piani chiedono a ciascun centro, **settimana per settimana**, contro una **capacità** dichiarata sul centro in ore/settimana. Tavola centro × settimana con la saturazione in percentuale, il sovraccarico in rosso e il riepilogo delle settimane sfondate con i centri nominati; da ogni cella si apre il dettaglio di **chi** ha portato quelle ore — parte, fase, piano. Somma tutti i **piani aperti**, perché il centro è condiviso e un piano solo non dice se regge; si può restringere a un piano solo, e la stessa tavola sta in fondo alla scheda di ogni piano. Sopra la tavola un **grafico a barre** per centro — una barra per settimana, la capacità come linea, gli stessi colori della tavola — che serve a dire *dove guardare*: ogni barra porta comunque il suo numero, e la tavola resta la lettura esatta. Sotto, **i codici da produrre**: codice, pezzi, settimana e le fasi interne con ore/pezzo e ore totali, ordinati per settimana e per ore decrescenti — la domanda è «cosa lancio per primo». Cliccando il nome di un centro le due letture si restringono a quello. Export Excel e PDF in forma lunga, con **due sezioni**: il carico per centro/settimana e i codici per codice/fase/settimana, pronte da pivotare.
  I **pezzi** di un codice non si sommano fra le sue fasi — ogni fase lavora gli stessi pezzi — mentre le **ore** sì.
  Due cose vanno dette perché il prospetto non prometta più di quel che dà. La capacità è **infinita**: il sovraccarico si vede, non si sposta. Dalla 0.88.0 le ore stanno nella settimana in cui **la fase comincia**, programmata a ritroso dalla consegna sul calendario di fabbrica (prima stavano in quella in cui il pezzo serve pronto): le date dicono quando ogni fase deve partire perché la consegna regga, non spostano niente per far posto. Le fasi in **conto lavoro** non caricano nessun centro interno: quelle si comprano, e stanno nel fabbisogno. Un centro **senza capacità dichiarata** mostra le ore e non il sovraccarico: zero significa «non dichiarata», non «nessuna capacità».
- **🌳 Distinta base → Visualizza DB** — costificazione: incidenza delle voci di costo e distinta esplosa; **export PDF ed Excel**.
- **📨 Documenti → Fabbisogno materiali** — piani di produzione salvati (3 × macchina A, 2 × macchina B): le distinte si esplodono e si sommano in una **lista d'acquisto consolidata**, raggruppabile per fornitore, più l'elenco delle **parti da fabbricare** e quello delle **lavorazioni da far fare fuori**. Da qui si **generano richieste di offerta e ordini**, un documento per fornitore, scegliendo quali righe includere. Il **fabbisogno netto** toglie quello che è già a magazzino, quello già ordinato e quello **impegnato dagli altri piani aperti**, così due piani non si dichiarano coperti con la stessa merce; un piano che non serve più si **chiude** (🔓) e la sua quota torna libera. Export Excel e PDF.
- **🔧 Conto lavoro → 🛠 Ordini di lavoro (ODL)** — una fase del ciclo con un **fornitore** è una lavorazione affidata a un terzista, ed è denaro che esce come qualunque acquisto: entra nel fabbisogno accanto al materiale, in una sezione sua, e da lì si genera un **ordine di lavoro** — un documento a parte, con numerazione **ODL-anno-NNN**, elenco proprio e stampa propria. Gli **ordini d'acquisto (ODA)** restano quello che erano: comprano merce, e non contengono lavorazioni. Uno per terzista **e per passata**: le fasi affidate a Beta in un ODL solo, anche di parti diverse, ma un pezzo che torna da Beta una **seconda** volta — fasi 20 e 40 con la 30 in mezzo altrove — finisce in un secondo ODL, perché fra le due il pezzo torna da noi e chiedergliele insieme sarebbe un ordine che non si può eseguire di seguito. La **richiesta d'offerta** invece le tiene insieme: chiedere non è commissionare.
  Una riga è una **tratta**: le fasi *consecutive* dello stesso terzista stanno insieme — «fasi 20-30» — perché sono una lavorazione da commissionare e non due, col prezzo e i giorni sommati e il dettaglio di ciascuna nella nota. La riga porta il **codice della parte** (è il pezzo che il terzista riceve e rispedisce), i **pezzi** come quantità e la tariffa del ciclo come prezzo; a costo orario la nota dice *ore/pezzo × tariffa*.
  Un ODL si può anche **scrivere a mano**, senza passare da un piano: *+ Lavorazione da ciclo* fa scegliere la parte fra quelle che un ciclo ce l'hanno, poi la tratta e i pezzi. Si vedono tutte le fasi — anche quelle di un altro terzista e quelle interne, marcate — perché mandare fuori una lavorazione che di solito si fa in casa è un caso vero. La riga che ne esce è identica a quella generata dal fabbisogno; l'ordine però **non è legato a nessun piano**, e lì la fase continuerà a risultare da ordinare. Le fasi **senza** fornitore sono interne e restano fuori: non si comprano, si vedono nel Carico centri.
  Una **richiesta di offerta** invece può contenere insieme materiale e lavorazioni dello stesso fornitore — chiedere quanto costa il pezzo e quanto costa lavorarlo è una domanda sola. Convertendola, la richiesta **si divide** nei due ordini.
  Il **fabbisogno netto non si applica** alle lavorazioni, ed è dichiarato in pagina: una fase non sta a scaffale. Dalla 0.74 i pezzi già lavorati l'app li sa — glieli dicono gli **ordini di produzione** — ma nettare una fase richiede di decidere cosa fare di quelle coperte da ordini di *altri* piani, che è la stessa discussione dell'impegnato sul materiale: finché non è fatta, la quantità resta lorda. Nell'ODL il *rientrato* significa **pezzi tornati**: porta l'ordine a evaso, non carica il magazzino — quello lo fanno i movimenti di conto lavoro.
  Il magazzino si muove in **due punti soli**, e sono i due estremi del *ciclo*, non quelli del documento: alla prima tratta esterna esce il **materiale del ciclo** e scarica, all'ultima entra il **pezzo finito** e carica. Ogni altro estremo è un **passaggio**: il pezzo cambia posto e la giacenza non si muove. Senza questa distinzione una parte lavorata due volte dallo stesso terzista farebbe uscire il materiale due volte e caricare il pezzo due volte. La scheda propone il **residuo** — quanto resta da spedire o da far rientrare — e a residuo zero lo dice, invece di riproporre il modulo come se niente fosse.
  Il **materiale esce una volta sola**, alla prima fase di ogni parte, ed è quello scritto nel suo **ciclo di lavorazione** (le stesse righe che il fabbisogno ha già fatto comprare), con le quantità proposte in automatico: *q.tà del ciclo × pezzi dell'ordine*. I **pezzi rientrano una volta**, all'ultima fase. Le fasi in mezzo non muovono il magazzino e lo dicono, invece di offrire un comando che farebbe uscire la stessa merce due volte: due fasi dallo stesso terzista sono **due lavorazioni sullo stesso pezzo**, non due pezzi.
- **🏭 Documenti → Ordini di produzione (ODP)** — il documento che segue una parte lungo il suo **ciclo**: uno per parte da fabbricare, numerazione **ODP-anno-NNN**, generato dal fabbisogno (dalla sezione *Da fabbricare*) oppure scritto a mano. Dentro, le fasi del ciclo **congelate in successione**: una fase non si avvia finché la precedente non è chiusa, e il rifiuto **nomina la fase che blocca con i suoi numeri** — «la fase 10 non è chiusa: 6 di 10». *Forza avvio* resta possibile e pretende un motivo, che finisce nello storico: una forzatura non è un permesso speso e dimenticato.
  Su ogni fase si dichiarano **pezzi buoni e scarti**, e **solo i buoni proseguono**: uno scarto alla prima fase restringe tutte quelle che seguono, e a magazzino entra la resa vera, non la quantità lanciata.
  Il magazzino si muove in **due punti soli**, e sono i due estremi del ciclo — vale identico per un ciclo **tutto interno**, **tutto esterno** o **misto**: all'avvio della prima fase escono i **codici del ciclo** (*Consumo di produzione* se la fase è interna, *Uscita a conto lavoro* se è esterna), sull'ultima entra il **codice della parte** per i pezzi buoni (*Versamento di produzione* se interna, *Rientro da conto lavoro* se esterna). **Fra le fasi non si scrive niente**, ed è la regola che tiene in piedi il resto: un movimento nomina una quantità di un *codice*, e in mezzo i pezzi non sono più il materiale e non sono ancora la parte — la parte lo diventano al rientro dell'ultima fase. Dove stanno lo dice la **fase corrente** dell'ordine, che è il posto in cui quella domanda ha davvero una risposta; il prospetto *presso terzi* legge anche da lì, e lo dichiara.
  Dalla fase esterna si **genera l'ordine di lavoro** al terzista, con la tariffa del ciclo e i pezzi che ci sono davvero. Su quella riga i comandi di conto lavoro diventano un **rimando** all'ordine di produzione: il magazzino ha un padrone solo, e due strade per lo stesso gesto sono due registrazioni. I *pezzi rientrati* dell'ODL li scrive la dichiarazione sull'ordine di produzione.
  Il piano continua a generare **ordini di lavoro diretti** per le fasi non coperte da un ordine di produzione; dove un ODP esiste, la fase risulta «coperta da ODP-…» e l'ordine si genera da lì. Un ordine di lavoro **senza** ODP si comporta esattamente come prima.
- **📋 Commesse e copertura materiale** — la commessa è il cliente e la data a monte del lavoro, e ci si agganciano piani di fabbisogno, richieste e ordini. La sua scheda dice se il **materiale c’è**: cosa è ancora **da ordinare**, cosa sta in un documento **non ancora inviato**, cosa **arriva dopo la data in cui serve**. Mettendola **In produzione** l’app chiede conferma nominando i codici mancanti e la data di consegna — avvisa, non blocca. I piani della stessa commessa si sommano prima di guardare il magazzino: due piani non si contendono la stessa merce. Se non ci sono piani aperti lo dice, invece di dichiarare tutto coperto.
- **📇 Clienti** (*Gestione → Clienti*) — l'anagrafica a monte delle commesse: nome, referente, email, telefono, P.IVA, indirizzo e note. I nomi si **propongono nel campo Cliente della commessa**, così due commesse dello stesso cliente non si chiamano più «Rossi Srl» e «Rossi S.r.l.». Il nome è unico, **rinominarlo allinea le commesse** che lo citavano, e un cliente citato da una commessa non si elimina.
- **💶 Listino fornitori** — l'unico posto dove nasce un prezzo d'acquisto. Più quotazioni per articolo (fornitore, codice e descrizione presso il fornitore, prezzo, q.tà minima, giorni di consegna, data), alimentate anche dai prezzi tornati con le richieste di offerta. Vale per commerciali, materie prime **e parti**. Il prezzo che entra nella costificazione si sceglie esplicitamente dal listino.
- **🔗 Dove è usato** — da ogni articolo si risale a chi lo contiene e alle macchine impattate, con **simulazione del costo**: si prova un prezzo diverso e si vede subito l'effetto sul costo delle macchine, senza salvare nulla.
- **📨 Richieste di offerta (RFQ)** — una richiesta per fornitore, righe da catalogo o manuali, documento bilingue IT/EN in PDF ed Excel, compilazione dei prezzi al ritorno dell'offerta e **confronto offerte** tra più richieste.
- **🧾 Ordini a fornitore (ODA)** — generabili da una richiesta, da un piano di fabbisogno o da zero, con prezzi, importi, consegne e **registrazione dei ricevimenti** (ricevuto/residuo per riga).
- **Righe di documento a due piani** — nelle righe di richieste e ordini le colonne sono coppie, una sopra l’altra: codice/descrizione, quantità/U.M., prezzo unitario/importo, data richiesta/data confermata, ricevuto/residuo, modifica/elimina. Dodici colonne stavano su uno schermo solo a costo di scorrere in orizzontale, e il codice usciva di vista; così le due metà si leggono insieme. Una riga di documento resta un solo rigo di tabella.
- Gli elenchi di richieste e ordini si filtrano per **stato**, **fornitore** e **testo** (numero, oggetto, fornitore, note e righe del documento).
- **Filtro per periodo** in tutti e quattro gli elenchi — richieste, ordini, commesse e piani: un intervallo *dal … al …* sulla data del documento (per le commesse, la data di apertura), aperto anche da un lato solo. Entra nel conteggio e finisce scritto negli export dell'elenco.
- **🔎 Scheda articolo di sola lettura** — un click su un **codice**, in qualunque tabella, apre la scheda completa: anagrafica, listino, costo, magazzino (esistente, impegnato, libero), composizione, dove è usato, documenti e piani in cui compare, revisioni. Non modifica niente, e per questo si può aprire in mezzo a qualunque lavoro; dentro la scheda i codici sono a loro volta cliccabili, con il tasto ← Indietro.
- **🏭 Avanzamento di produzione** — nella tabella *Da fabbricare* di un piano ogni parte porta due colonne, **fatti** e **restano**, e un pulsante che apre la scheda dell'avanzamento: si dichiara quanti pezzi sono stati fatti, con una nota, e resta lo storico di chi ha dichiarato cosa e quando. Non è un campo che si sovrascrive ma una **dichiarazione per volta**, sommata quando serve — la stessa scelta che l'app fa per la giacenza, che non è un campo ma la somma dei movimenti: un totale che si ricostruisce si può spiegare, e si corregge con una dichiarazione negativa senza riscrivere il passato. La conseguenza che conta è sulle **lavorazioni da mandare fuori**: una parte dichiarata finita ha già attraversato tutte le sue fasi, quindi sparisce da lì invece di finire in un ordine di lavoro che pagherebbe una seconda volta lo stesso lavoro. Una parte ferma *a metà ciclo* conta ancora per intero — si dichiara la parte finita, non la fase superata — quindi il conto è prudente per scelta. Dalla 0.105.5 dichiarare pezzi fatti **mette la parte a magazzino**, con un versamento legato alla dichiarazione (eliminarla lo toglie), e non annulla gli acquisti del piano: il materiale per una parte si compra prima di farla.

- **📎 Allegati: i PDF stanno in una cartella, non nel database** — disegni, schede tecniche e cataloghi appesi a un articolo, dal pulsante 📁 sulla riga di catalogo o dal **pannello laterale** (Ctrl+I), che ne mostra il numero; accanto, un pulsante **apri documento** che lo apre in una scheda nuova (con più documenti apre l'elenco, invece di indovinare). L'archivio **fisico** resta fuori dall'app: una cartella locale, oppure quella di un servizio sincronizzato — OneDrive, Dropbox — già presente su tutti i PC. Bomtrack ne memorizza il **percorso relativo**, che è un dato come gli altri: entra nel backup JSON e ripristinato altrove continua a valere, purché quel PC abbia la sua copia dell'archivio. Chi aggiorna un disegno lo aggiorna nella cartella, col programma vero, e l'app punta già alla versione nuova.
  Quale cartella lo decide **ogni PC**, e non sta nel database: scriverlo lì dentro imporrebbe a tutti la lettera di unità del primo che l'ha configurata. Si sceglie una volta con la finestra di sistema — un browser non apre un percorso scritto a mano, e non lo farà mai — dalla scheda Allegati o da *Gestione → Backup*. Funziona su **Chrome ed Edge** e solo se l'app è aperta dal suo indirizzo: con un doppio click su `index.html` non c'è nessuna origine sotto cui ricordare un permesso, e lì la scheda lo dice in chiaro invece di mostrare un pulsante inerte.
  Un **documento vale per più codici** — il catalogo di un commerciale sta appeso a tutti gli articoli di quella serie — quindi è censito una volta sola e i codici ci si *collegano*: rinominarlo o spostarlo si corregge in un punto («Ricollega»), e i codici che lo citavano seguono. La **descrizione** appartiene al documento (i nomi dei file dei fornitori non dicono niente, e riscriverla la corregge per tutti), la **pagina** al singolo collegamento. Scollegare da un codice non è eliminare il documento, e un documento citato non si elimina.
  Gli esiti dell'apertura sono **tre**, perché sono tre rimedi diversi: *NESSUN DOCUMENTO SALVATO*, *archivio non impostato su questo PC* (col pulsante che lo imposta lì per lì) e *DOCUMENTO NON TROVATO*, col nome cercato e la cartella dove l'ha cercato. In *Gestione → Backup* una **verifica** scorre la cartella e nomina i documenti spariti, una volta per documento e non una per collegamento: il difetto di questo disegno è il collegamento che si rompe in silenzio, e questo è il rimedio. Gli allegati **caricati dentro l'app** prima della 0.78.0 restano e funzionano, in una sezione loro: di quelli il backup JSON porta l'elenco e non i byte, e vanno riscaricati prima di trasferirsi.

- **📲 Installabile, e offline per davvero** — Bomtrack si può installare come applicazione, con un'icona sua, e una volta aperta funziona senza rete, manuale compreso. Il service worker mette in cache **il programma, mai i dati**. Aperta con un doppio click su `file://` non cambia nulla: lì i service worker non esistono, l'app se ne accorge e tace — ed è la ragione per cui le librerie di export stanno in `vendor/` e non nella cache.

- **📗📄 Export degli elenchi** — Magazzino, le due anagrafiche, Cicli, Commesse, Richieste, Ordini e piani di Fabbisogno hanno i pulsanti **Esporta Excel** ed **Esporta PDF**. Si esporta **quello che si vede**: filtri attivi applicati, stesse colonne, e la paginazione a schermo non taglia niente. I filtri finiscono scritti nel file — un foglio **Estrazione** nell'Excel, una riga sotto il titolo nel PDF — così a distanza di tempo si sa ancora cosa contiene. Il PDF porta la testata azienda e il numero di pagina su ogni pagina; l'Excel l'autofiltro sull'intestazione, i numeri come numeri e **le date come date** — quindi si ordinano e si filtrano per periodo dentro Excel, non come testo.
- **Colonne dell’elenco a scelta** — in Acquisti, Progetto e Magazzino un pulsante **Colonne** apre l’elenco delle colonne disponibili: quelle che non servono si tolgono, e restano tolte anche domani. Codice e nome non si nascondono, che sono l’identità della riga. Ogni elenco tiene la sua scelta — le due anagrafiche condividono le colonne di base ma si guardano per motivi diversi, e solo Progetto ospita anche concetto e approvvigionamento, che riguardano solo le parti — e ciò che sparisce dalla tabella resta nel pannello laterale. Oltre alle colonne mostrate di serie, lo stesso pannello ne offre altre — sottofamiglia, fornitore, doppia unità d’acquisto, scorta minima, lotto, note, autore delle modifiche, e per Progetto anche concetto e approvvigionamento — nascoste finché non le si accende: chi non apre mai il pannello continua a vedere l’elenco di sempre. Lo stesso pannello porta anche l’interruttore **Dividi l’elenco per famiglia**: acceso di serie come oggi (le righe restano sezionate per macrofamiglia, o per tipo negli assiemi), spegnendolo l’elenco torna a una tabella sola. L’export Excel e PDF resta completo: esporta l’elenco, non la vista.
- **Barra Filtri a scomparsa, con ambito condiviso** — in Acquisti, Progetto, Magazzino, Cicli di lavorazione e Gestione DB la barra filtri sta dove è sempre stata ma parte **chiusa**: mostra solo il pulsante **Filtri**, le pasticche di ciò che sta restringendo l’elenco in quel momento e, quando c’è qualcosa da togliere, **Rimuovi filtri**. Aprirla o chiuderla è un’unica scelta per tutta l’app: chi la apre in una vista se la ritrova aperta anche nelle altre. Famiglia, sottofamiglia, macchina e gruppo — dove la vista li ha — sono anche **condivisi**: sceglierli in Progetto li propone già impostati passando a Magazzino o a Gestione DB, così si può lavorare su un solo set di codici (una macchina, una famiglia) muovendosi fra le viste senza riselezionarlo ogni volta. Una famiglia che in un’altra vista non esiste (materie prime/commerciali contro parti sono ambiti diversi, come nei filtri di sempre) semplicemente non si applica lì. **Rimuovi filtri** azzera sia i campi di quella vista sia l’ambito condiviso: la restrizione sparisce per davvero, non ricompare cambiando pagina. Fuori da questo meccanismo restano il *Carico centri* (filtra per piano e centro di lavoro, un altro genere di domanda) e i filtri delle viste documento (Commesse, Fabbisogno, Richieste, Ordini), che restano quelli di sempre nella colonna a destra.
- **Pannello laterale (Ctrl+I)** — una colonna a destra, ridimensionabile trascinandone il bordo, che mostra i comandi eseguibili sulla riga scelta nell’elenco e le schede da consultare (scheda articolo, listino, dove è usato), più un riepilogo con costo, giacenza e impieghi. Vale per **Acquisti, Progetto e Magazzino**. Con il pannello aperto la colonna dei pulsanti sparisce dall’elenco — i suoi comandi sono nel pannello, scritti per esteso invece che a icone — e chiudendolo torna dov’era. Le frecce ↑ ↓ scorrono le righe, Invio apre la scheda completa, Esc deseleziona. **Ctrl+click** aggiunge una riga alla scelta e **Maiusc+click** (o Maiusc+freccia) prende tutto quello che sta in mezzo: con più righe scelte il pannello passa alle **azioni di massa** — segna obsoleti, preferiti, esporta la selezione in Excel o PDF, elimina — e mostra l’elenco di ciò su cui sta per agire. Larghezza e apertura restano fra una sessione e l’altra.
- **Elenco a destra, documento al centro** — **Commesse, Fabbisogno, Richieste di offerta e Ordini** hanno la stessa forma: l’elenco sta in una colonna a destra e **resta visibile mentre si lavora un documento**, che occupa il centro. Si passa da un documento all’altro con un click, senza tornare indietro e ritrovare la riga; la riga aperta resta marcata, i documenti chiusi o annullati si vedono spenti. I filtri stanno con l’elenco, impilati nella sua colonna. I comandi che agiscono sul documento (crea ordine, duplica, elimina, chiudi/riapri) sono nella sua testata, scritti per esteso. Le modifiche in sospeso si salvano da sole quando si apre un altro documento, com’è sempre stato uscendo verso l’elenco. In stampa esce il documento, non l’elenco.
- **🏠 Riepilogo — «Richiede attenzione»** — all’avvio, cosa c’è da fare adesso: commesse oltre la consegna, righe di fabbisogno da ordinare, ordini confermati in ritardo, richieste senza risposta, articoli sotto scorta o senza prezzo, codici duplicati. Ogni avviso **nomina i codici e i numeri che lo riguardano** (fino a otto, poi «+N altri»), con il perché nel suggerimento, e ogni voce porta dove si risolve: la commessa alla sua commessa, la riga di fabbisogno al piano che la genera, l’articolo alla sua scheda.
- **🌗 Tema chiaro o scuro** — il pulsante nell'intestazione gira su tre stati: *come il sistema* (quello di partenza), *chiaro*, *scuro*. La scelta resta su questo browser e non viene condivisa con i colleghi: è una preferenza personale, non un dato aziendale. In stampa la carta resta bianca in tutti e tre i casi.
- **🔎 Ricerca globale (Ctrl+K)** — un campo solo per articoli, richieste, ordini e piani: si scrive un codice o un numero e si salta dove serve, senza passare dalla vista giusta e dai suoi filtri.
- **🖨 Stampa della vista aperta (Ctrl+P)** — distinta, costificazione, fabbisogno, richiesta o ordine escono su carta ripuliti di navigazione, filtri e pulsanti, con intestazione, data e autore.
- **Autore delle modifiche** — in fondo a schede articolo, richieste, ordini e piani si legge chi ha creato il record e chi l'ha aggiornato per ultimo, con data e ora.
- **Schede mobili** — le finestre di dialogo non bloccano più la pagina: si spostano trascinandole per il titolo, si ridimensionano dall'angolo e si chiudono con ✕ o Esc. Dietro si continua a navigare, e listino, *Dove è usato* e un form possono restare aperti insieme.
- Le anagrafiche mostrano **200 articoli per volta** (*Mostra altri* / *Mostra tutti* in fondo all'elenco): i cataloghi grandi restano scorrevoli.
- **🔒 Note interne** su richieste e ordini: restano nell'app, non compaiono mai su PDF ed Excel. Passano dalla richiesta all'ordine generato e sono modificabili in qualunque stato del documento.
- **⚙ Gestione** — dati azienda, fornitori, **clienti**, condizioni di offerta (trasporto/pagamento), famiglie articolo, **concetti** (nomenclatura delle parti), centri di lavoro (tariffe €/h), **unità di misura**, impostazioni globali (spese generali %, margine %, valuta, approvvigionamento parte), **import massivo da Excel** e backup JSON (esporta/importa/ripristina/**azzera tutto**).
- **Sospendere invece di eliminare** — fornitori, clienti e centri di lavoro si possono **sospendere** (⏸): restano negli archivi e nei documenti che li citano, ma spariscono dai menu a tendina e dai suggerimenti. È la risposta a chi non si può cancellare — un fornitore citato da ordini di tre anni fa — ma non deve nemmeno continuare a comparire ovunque. Il riquadro accanto al nome dice sempre se una voce è attiva o sospesa, e lo stato viaggia nell'export e nell'import Excel.

### Utenti e ruoli

Ogni persona ha un utente (*Gestione → 👥 Utenti*, riservata agli amministratori) con nome, email, ruolo, colore e stato attivo/sospeso. I ruoli limitano la **scrittura**: tutti vedono tutto.

| Ruolo | Articoli | Distinte | Richieste e ordini | Ricevimenti, avanzamento, giacenze | Gestione |
|---|:--:|:--:|:--:|:--:|:--:|
| Amministratore | ✔ | ✔ | ✔ | ✔ | ✔ |
| Ufficio acquisti | — | — | ✔ | ✔ | — |
| Progettazione | ✔ | ✔ | — | solo giacenze | — |
| Officina e magazzino | — | — | — | ✔ | — |
| Lettore | — | — | — | — | — |

Nelle sezioni non scrivibili compare un banner di sola lettura e i pulsanti di creazione ed eliminazione spariscono; ogni tentativo di modifica viene comunque fermato con un messaggio. La voce *Gestione* — e con essa il backup — è visibile ai soli amministratori. Deve restare **almeno un amministratore attivo**: l'app impedisce di declassare, sospendere o eliminare l'ultimo, e di agire su se stessi.

> ⚠️ **Senza archivio condiviso questa non è sicurezza.** Finché i dati stanno solo nel browser, chiunque apra gli strumenti di sviluppo può leggere il database, cambiarsi ruolo o saltare l'accesso: le password sono conservate come hash SHA-256 con salt, ma il controllo resta tutto lato client. Serve a separare le responsabilità tra colleghi che si fidano e a preparare il terreno. La protezione vera c'è con l'**archivio condiviso** (dalla 0.103.0): accesso con Supabase Auth e permessi dei ruoli applicati dal server con RLS (vedi [docs/cloud-schema.md](docs/cloud-schema.md) e il manuale, cap. 31).
>
> Di conseguenza: il **backup JSON contiene gli utenti** con i loro hash — trattalo come un file riservato.

Ogni record salva `createdBy`/`updatedBy` con l'utente che l'ha creato e modificato per ultimo: i campi non sono ancora mostrati nell'interfaccia, esistono per arrivare pronti al cloud.

### Unità di misura

L'elenco delle U.M. selezionabili si gestisce in *Gestione → 📏 Unità di misura* (codice + descrizione, con una **predefinita** ★ proposta per le nuove righe). Le U.M. sono usate ovunque tramite menu a tendina: anagrafica articolo, testata macchina, righe di richieste e ordini.

Rinominare un codice propaga la modifica a tutti gli articoli e documenti che lo usano; un'U.M. in uso non può essere eliminata (il pannello mostra il numero di utilizzi). Le U.M. incontrate nell'import da Excel vengono registrate automaticamente in elenco.

### Concetti (nome delle parti)

Il nome di una **parte** non è testo libero: si compone di un **concetto** (l'oggetto — es. `ALBERO`, `FLANGIA`, `STAFFA`, sempre in **maiuscolo**) scelto dall'elenco gestito in *Gestione → 🏷 Concetti*, seguito da una **descrizione libera**. Così `ALBERO` + `motore 20×100` diventa il nome `ALBERO motore 20×100`. Il concetto è **obbligatorio** in creazione e modifica di una parte; gli altri tipi di articolo mantengono il campo Descrizione libero.

Il nome composto resta salvato nel campo nome dell'articolo ed è quello mostrato ovunque (cataloghi, distinte, costificazione, PDF/Excel). Un concetto **in uso non può essere rinominato né eliminato** (il pannello mostra il conteggio delle parti che lo usano), così i nomi già composti non cambiano da soli. Le parti importate o create prima della funzione conservano il nome esistente come descrizione libera, completabile scegliendo il concetto in modifica.

### Stati dei documenti e blocco modifiche

Richieste e ordini hanno uno **stato** che l'app aggiorna da sé quando può dedurlo da un fatto oggettivo, e che protegge il documento dalle modifiche accidentali una volta uscito verso il fornitore.

| Documento | Stato | Cosa resta modificabile |
|---|---|---|
| RFQ | Bozza | tutto |
| RFQ | Inviata / Offerta ricevuta | prezzo unitario e data consegna |
| RFQ | Chiusa | nulla (sola lettura) |
| ODA | Bozza | tutto |
| ODA | Inviato / Confermato / Parziale / Evaso | colonna Ricevuto |
| ODA | Annullato | nulla (sola lettura) |

In **ogni** stato restano sempre modificabili le note del documento, le note interne, le note di riga e lo stato stesso. Quando serve correggere il resto, il pulsante **🔓 Sblocca per modifica** riapre il documento: lo sblocco vale finché resti dentro e si richiude tornando all'elenco.

Le transizioni automatiche:

- **Bozza → Inviata/Inviato** — alla generazione del PDF o dell'Excel, previa conferma (rifiutando, il file si scarica e lo stato non cambia: le bozze di controllo non sporcano l'archivio).
- **Inviata → Offerta ricevuta** — quando tutte le righe hanno un prezzo; torna indietro se un prezzo viene svuotato.
- **RFQ → Chiusa** — quando da quella richiesta si genera un ordine (solo se era già inviata).
- **Inviato → Confermato** — quando si compila il n° di conferma d'ordine del fornitore.
- **→ Parziale / Evaso** — derivati dai ricevimenti; azzerando i ricevimenti l'ordine torna a Confermato o Inviato. Anche modificare una quantità ricalcola la soglia.

Bozza e Annullato non vengono mai toccati dagli automatismi.

### Codifica automatica degli articoli

Due schemi convivono, scelti in base al tipo di articolo:

- **Codifica gerarchica** (macchina › gruppo › sottogruppo/parte). Ogni macchina ha una **sigla** (es. `TRN`) e definisce il proprio schema: numero e tipo di caratteri della sigla gruppo, cifre del progressivo `S##` e cifre della numerazione `###`. I codici si generano così:

  ```
  Macchina:     TRN-S00        progressivo a salire da 0
  Gruppo:       TRN-BAS-S00    progressivo a salire da 0
  Sottogruppo:  TRN-BAS-999    a SCENDERE da 999
  Parte:        TRN-BAS-001    a SALIRE da 001
  ```

  Nella modale articolo si sceglie la macchina (e il gruppo) di appartenenza e il codice viene proposto automaticamente; sottogruppi e parti sono numerati indipendentemente pur condividendo il prefisso. Le sigle sono validate contro lo schema della macchina e devono essere univoche.

- **Codifica per famiglia** — materie prime e commerciali (`MAT-ACC-LAM-001`, `CMM-MEC-CUS-001`), con prefissi e numero di cifre configurabili in *Gestione → Impostazioni*. Vale anche per le **parti non legate a una macchina**.
- La **sigla** di una macrofamiglia è unica dentro il suo ambito (commerciali / materie prime / parti) e quella di una sottofamiglia dentro la sua macrofamiglia: è il segmento del codice che identifica la famiglia, e ripetuto lo renderebbe ambiguo. Fuori di lì la stessa sigla si può riusare — il prefisso `CMM`/`MAT`/`PRT` e il segmento precedente distinguono già i codici. Le sigle ripetute rimaste da prima della regola sono segnalate in *Gestione → famiglie*, senza essere corrette d'ufficio; negli import la sigla si scosta da sola alla prima libera e il report lo dichiara.

Il codice proposto resta modificabile a mano: appena lo si edita, l'app smette di rigenerarlo.

### Import ed export Excel (Gestione → ⬆ Import)

Quattro sezioni. In tutte l'**export è anche il template** — si esporta, si modifica, si ricarica — e ogni file porta con sé un foglio **Istruzioni**.

- **🛒 Articoli — Acquisti**: fogli `Commerciali`, `Materie prime`, `Listino`.
- **🏗 Articoli — Progetto**: fogli `Macchine`, `Gruppi`, `Sottogruppi`, `Parti`, `Listino`. **Il tipo è il foglio**: niente colonna `Tipo` da sbagliare, e ogni foglio ha solo le colonne che valgono per quel tipo. I fogli si applicano **in ordine**, così un gruppo può puntare a una macchina definita nello stesso file: si caricano sigle, appartenenze e schema di codifica gerarchica. **La distinta base non è in questi file.**
- Il **Codice** è la chiave: se esiste l'articolo viene **aggiornato**, se è vuoto viene **generato**. Fornitori e famiglie mancanti si creano al volo; i **concetti no** (finiscono dentro il nome della parte, e un refuso resterebbe per sempre). Fornitore e prezzo creano una **quotazione nel listino** dell'articolo e diventano il prezzo in uso: anche da Excel, un prezzo nasce dove nascono tutti gli altri.
- **🔍 Verifica** fa l'import per intero, mostra il report e poi **annulla tutto**: gli errori si leggono prima di scrivere, e dal report si procede con «Importa davvero».
- Ogni file ha un foglio **Liste** con tutti i valori ammessi (unità, fornitori, coppie famiglia/sottofamiglia, macchine e gruppi con i loro codici, concetti). Non sono menu a tendina — la libreria Excel dell'app non sa scriverli — ma sono elenchi pronti per `Dati → Convalida → Elenco`, e sono il posto a cui rimandano i messaggi d'errore.
- **🌳 Distinte** — carica un foglio padre-figlio (`CodicePadre, CodiceFiglio, Qta, Scarto%`). Gli articoli devono già esistere (importali prima). Per ogni padre i componenti vengono **sostituiti** (reimport idempotente); relazioni non ammesse o cicliche vengono segnalate e saltate.
- **⚙ Impostazioni di Gestione** — tutto ciò che si configura in Gestione, un foglio per scheda: `Azienda, Utenti, Fornitori, Clienti, Condizioni offerta, Famiglie commerciali, Famiglie materie prime, Famiglie parti, Concetti, Centri di lavoro, Unità di misura, Impostazioni`. Le **password non sono nel file**.
- L'import è sempre **additivo**: aggiorna ciò che riconosce, crea ciò che manca, **non cancella niente**. Un foglio assente viene saltato, una colonna assente lascia il campo com'è, una colonna presente ma vuota lo svuota. Il **report di esito** conta creati / aggiornati / invariati **per foglio**, e separa gli avvisi dagli errori, ciascuno con foglio e numero di riga.

## Modello di costo

Per ogni prodotto il costo è calcolato ricorsivamente (rollup):

```
costo = Σ (componenti × q.tà × (1 + scarto%))    // materiale + commerciali + costo sotto-assiemi
      + Σ (lavorazioni: ore × tariffa €/h)        // manodopera
costo totale = costo + spese generali (overhead %)
prezzo vendita = costo totale × (1 + margine %)
```

Le percentuali di spese generali e margine sono globali (Impostazioni) e sovrascrivibili per singola macchina dalla *Modifica testata*; sono ammesse tra 0 e 1000%. I riferimenti ciclici sono rilevati e impediti sia nella distinta sia nel ciclo di lavorazione delle parti: un articolo coinvolto in un anello viene segnalato invece di restituire un costo troncato.

### Parti: una domanda sola, la facciamo o la compriamo?

Gli articoli di tipo **parte** fanno eccezione: possono avere una **distinta parte** (materie prime e commerciali) e un **ciclo di lavorazione**, gestiti nella vista *🔧 Cicli di lavorazione*. Da dove venga il loro costo lo decide un campo solo, l'**approvvigionamento**, nella scheda articolo:

| Approvvigionamento | Costo della parte | Nel fabbisogno |
|---|---|---|
| 🏭 Produzione interna | la somma delle righe di distinta parte e ciclo | si scende nella distinta e si compra quel che serve per farla |
| 🛒 Acquisto da fornitore | il prezzo scelto nel **listino fornitori** | è una foglia d'acquisto come un commerciale: la distinta non si esplode |

Ogni fase del ciclo porta **il tempo e il costo, che sono due cose diverse** — e il tempo si misura diversamente a seconda di chi fa il lavoro: una fase **interna** occupa una macchina e si conta in **ore**, quelle che alimentano il *Carico centri*; una fase in **conto lavoro** non occupa niente di nostro, il pezzo esce e torna, e si conta in **giorni di attraversamento** — da cui l'app ricava **entro quando mandare l'ordine di lavoro** al terzista.

Il **costo** è una domanda a parte: può essere **fisso** (il prezzo concordato) oppure **orario** (ore × tariffa, proposta dal fornitore o dal centro). Su una fase interna le ore ci sono sempre, anche a costo fisso, dove non entrano nel costo ma dicono quanto quella fase occupa il centro: un prezzo concordato è quello e non va ricalcolato, ma la macchina la impegna lo stesso. Su una fase in conto lavoro a costo orario le ore compaiono accanto alla tariffa, perché lì sono **le ore che il terzista fattura** — cioè un prezzo, non il nostro tempo.

Una parte in produzione interna ma **senza righe di ciclo** non ha niente da calcolare: vale anche lì il prezzo a listino.

Costo e fabbisogno partono così dalla stessa risposta e non possono contraddirsi. La distinta e il ciclo di una parte acquistata **restano salvati** e consultabili — servono a sapere quanto costerebbe farla in casa — semplicemente non concorrono al costo.

Il **fabbisogno materiali** scende nelle distinte con queste stesse regole (scarto compreso): quantità e importi della lista d'acquisto tornano con la costificazione della stessa macchina. L'ordine delle fasi è documentale: riordinarle non cambia il costo.

Le parti nuove nascono **da acquisto** — è il caso più frequente, la parte la lavora un terzista — e chi la produce in casa lo dichiara; il valore proposto si cambia in *Gestione → Impostazioni*. Le parti **già a catalogo non si toccano**: cambiare l'impostazione vale per le prossime.

### Da dove arriva un prezzo d'acquisto

Fornitore, prezzo, codice e descrizione presso il fornitore **nascono solo nel listino**. La scheda articolo li mostra in sola lettura, con un pulsante che apre il listino; creando un articolo che si compra, il listino si apre da solo. Un prezzo senza fornitore resta possibile — è una quotazione con il fornitore vuoto, marcata *a mano*.

Il motivo è lo storico: finché lo stesso dato si poteva scrivere in due posti, un prezzo corretto nella scheda spariva senza lasciare traccia, e alla domanda «quando e da chi l'abbiamo pagato così?» non c'era risposta. Vale per commerciali, materie prime e parti; su una parte prodotta in casa, scegliere una quotazione chiede prima di segnarla come acquistata, invece di spostare il costo di nascosto.

## File

- `index.html` — struttura, navigazione, barre filtri delle due anagrafiche, caricamento degli script.
- `vendor/` — le librerie di export (SheetJS per Excel, jsPDF per i PDF), tenute nel repo invece che su un CDN. Versioni, origine e come si aggiornano: `vendor/LEGGIMI.md`.
- `theme.js` — tema chiaro/scuro/automatico: scrive `data-theme` sull'elemento radice, che è tutto ciò che `style.css` legge. La preferenza sta nel browser di chi lavora, non nel database.
- `store.js` — layer dati: schema, migrazioni versionate, `Store` (API repository) su IndexedDB o localStorage, hashing delle password, autore delle modifiche e storico di cosa cambia a ogni salvataggio.
- Il codice dell'app, diviso in **classic script caricati in sequenza** da `index.html` (nessun modulo, nessun build: la pagina si apre anche con un doppio click). Lo scope globale è condiviso, quindi restano un solo insieme di funzioni e un solo stato:

| File | Contenuto |
|---|---|
| `worklist.js` | il telaio comune delle viste a documento (commesse, fabbisogno, richieste, ordini): elenco a destra, documento al centro. Solo disegno, nessuno stato |
| `columns.js` | scelta delle colonne di ciascun elenco: registro delle colonne, regola CSS che le nasconde, scheda per sceglierle |
| `inspector.js` | il pannello laterale: cosa si seleziona in ogni vista, quali comandi e quali schede mostrare, ridimensionamento e memoria delle preferenze |
| `icons.js` | il set di icone dell’app: i 50 tracciati, lo sprite, la tinta e il nome di ciascuna (il suggerimento che compare col mouse) e `ico()`. Caricato per primo, serve già al primo disegno della barra. È l’unico posto dove sta un disegno |
| `core.js` | stato dell'app, utility, ruoli, pannelli e conferme. `APP_VERSION` in cima è la revisione mostrata nell'header |
| `auth.js` | accesso, sessione, primo amministratore |
| `costing.js` | motore di costificazione (rollup ricorsivo, modi di calcolo delle parti) |
| `calendario.js` | calendario di fabbrica: giorni lavorativi, festivi (Pasquetta calcolata), chiusure; conti a ritroso e in avanti per la programmazione del fabbisogno; i giorni dei fornitori (lavorativi di serie, o di calendario) |
| `shell.js` | ricerca globale, stampa, navigazione tra le viste |
| `views-bom.js` | distinte base e *Dove è usato* |
| `views-rev.js` | revisioni della distinta: rilascio, storico e confronto |
| `views-stock.js` | giacenze, movimenti di magazzino, impegni dei piani aperti, calcolo del fabbisogno netto e vista **Magazzino** |
| `views-jobs.js` | commesse cliente e tracciabilità commessa → fabbisogno → richiesta → ordine |
| `views-home.js` | riepilogo: cosa richiede attenzione, con il collegamento a dove si risolve |
| `views-dash.js` | cruscotto: valore di magazzino, articoli fermi, sotto scorta, consegne scadute per fornitore |
| `views-catalog.js` | anagrafiche, listino fornitori, scheda articolo, cicli di lavorazione |
| `views-report.js` | costificazione e report |
| `views-mrp.js` | fabbisogno materiali, programmazione a ritroso delle date (montaggi, fasi, tratte di conto lavoro, acquisti) e carico dei centri |
| `alternativi.js` | modulo **Alternativi**: equivalenti e sostitutivi degli articoli, le decisioni «usa l'alternativo» di un piano e il loro effetto su esplosione, montaggio, ordini di produzione e conto lavoro |
| `varianti.js` | modulo **Varianti**: opzioni della macchina modello, righe di distinta condizionate e a formula, il configuratore che genera la macchina concreta e i gruppi derivati, Rigenera quando il modello cambia |
| `produzione.js` | avanzamento di produzione: le dichiarazioni di pezzi fatti dentro un piano, e il netto che ne discende sulle lavorazioni |
| `allegati.js` | allegati degli articoli: i documenti d'archivio e i loro collegamenti ai codici; i byte dei vecchi file in IndexedDB |
| `archivio.js` | la cartella dei PDF: scelta, permesso, lettura, copia e verifica. Impostazione **locale**, un PC alla volta |
| `documenti.js` | le copie PDF dei documenti emessi (RFQ, ODA, ODL) nella cartella d'archivio, con revisioni e verifica |
| `export-lists.js` | export PDF ed Excel degli elenchi: una specifica per vista, due traduttori |
| `views-item.js` | scheda articolo di sola lettura e codice cliccabile; come si legge lo storico delle modifiche |
| `views-docs.js` | richieste di offerta e ordini |
| `views-prod.js` | ordini di produzione: congelamento del ciclo, successione delle fasi, avanzamento e i due movimenti di magazzino |
| `views-avanzamento.js` | Pianificazione → Avanzamento: il Gantt del piano con quanto è stato fatto, letto da ordini, ODL e ODP; in sola lettura |
| `views-manage.js` | gestione (utenti, anagrafiche di servizio, impostazioni) |
| `cloud-map.js` | traduzione fra la forma annidata locale e quella normalizzata del database condiviso. Funzioni pure, **nessun codice di rete** |
| `cloud.js` | l'archivio condiviso su Supabase: collegamento, accesso, invio e ricezione delle modifiche, numeri e codici dal server |
| `import-catalog.js` | articoli ⇄ Excel nei due file Acquisti e Progetto: colonne per tipo, foglio Liste, verifica senza importare |
| `import-export.js` | import distinte da Excel, impostazioni di Gestione ⇄ Excel, backup JSON, cestino e avvio dell'app |
- `style.css` — tema dark.
- `icons-preview.html` — galleria delle icone: ogni disegno accanto all’emoji che ha sostituito, alle varie misure e nelle tre varianti di colore. Serve a giudicarle quando se ne aggiunge una; **non serve all’app**, che non la carica.
- `CHANGELOG.md` — lo storico completo delle versioni.
- `docs/cloud-schema.md` — contratto del backend condiviso (mappatura tabelle, adapter).
- `supabase/schema.sql` — lo schema del database condiviso: tabelle, vincoli, e le funzioni `push_changes`/`pull_changes` da cui passa la sincronizzazione. Si esegue nell'editor SQL di Supabase.
- `docs/sostenibilita-free-tier.md` — quanto occuperebbero quelle tabelle e quando il piano gratuito Supabase smette di bastare: stime per scenario, modello di calcolo riutilizzabile, e i vincoli che stringono prima dello spazio.
- `docs/analisi-tecnica.md` — controllo generale del codice: cosa è stato risolto, cosa resta aperto e perché.
- `test/` — suite di verifica del motore di costo, delle migrazioni, del salvataggio, dell'import Excel e dell'accesso. **Non serve all'app**: `index.html` non la carica, e copiando la cartella su un altro PC si può anche omettere.
- `sw.js`, `manifest.webmanifest`, `icona.svg` — l'app installabile e funzionante offline. Il service worker mette in cache **il programma, mai i dati**; su `file://` non viene nemmeno registrato, e lì non cambia niente.
- `.github/workflows/test.yml` — esegue la suite a ogni push. Come `test/`, non serve all'app.

### Test

```
node test/run.js      # suite completa
node test/bench.js    # benchmark del motore di costificazione
```

Richiede solo **Node 18 o superiore** — nessun `npm install`, nessuna dipendenza: la suite usa i moduli core e carica i sorgenti dell'app in un contesto isolato, nella stessa sequenza di `index.html`.

I test di `supabase/schema.sql` su un database vero girano se c'è un Postgres raggiungibile con `psql` (in CI c'è):

```
BOMTRACK_PG="host=localhost port=5432 user=postgres" node test/run.js
```

Senza la variabile si dichiarano saltati; quelli che confrontano lo schema con il codice girano comunque.

Allo stesso modo `test/layout.test.js` apre l'app vera in Chromium a sette larghezze se trova [Playwright](https://playwright.dev) (`npm install -g playwright && npx playwright install chromium`, poi `NODE_PATH="$(npm root -g)" node test/run.js`); senza, verifica solo l'algoritmo dell'intestazione e le regole CSS.

## Changelog

Le revisioni seguono il versionamento semantico `0.MINOR.PATCH`: **MINOR** per nuove funzionalità, **PATCH** per correzioni. La versione in cima è quella in `APP_VERSION` (`core.js`) e mostrata nell'header dell'app.

Lo storico completo delle versioni è in [CHANGELOG.md](CHANGELOG.md).

## Note

Senza archivio condiviso i dati risiedono nel browser. Per trasferirli su un altro PC usare **Gestione → Backup → Esporta/Importa JSON**. Dalla 0.95.0 il **backup automatico** (stessa scheda) salva da solo una copia al giorno in una cartella scelta, tenendo gli ultimi 14 giorni: meglio quella di OneDrive, Dropbox o un disco di rete (Chrome o Edge, da `https` o `localhost`).

**Una scheda per volta.** L'archivio è uno solo e ogni salvataggio lo riscrive per intero: due finestre di Bomtrack aperte insieme lavorano sulla stessa cartella senza vedersi. Dalla 0.76.0 non è più un problema silenzioso — l'archivio porta un contatore di revisione, e la scheda che sta per salvare sopra il lavoro di un'altra si ferma e lo dice, offrendo di ricaricare o di tenere la propria versione, con l'export del backup a portata di mano. Quello che l'app **non** fa è fondere le due versioni: per farlo servirebbe sapere, riga per riga, quale delle due vale. Se si lavora abitualmente in due finestre, conviene tenerne aperta una sola per le modifiche.

Il layer dati è nato **predisposto al cloud** (schema v2): ID UUID, timestamp `createdAt`/`updatedAt` su ogni record, versioning dello schema con migrazioni idempotenti (i backup vecchi si auto-migrano all'import). Dalla 0.103.0 la sincronizzazione condivisa per un piccolo team via Supabase c'è (`cloud.js`, `supabase/schema.sql`, manuale cap. 31) e si aggancia al solo `Store` di `store.js`; il disegno è in `docs/cloud-schema.md` e il conto di quanto costerebbe in `docs/sostenibilita-free-tier.md` (in breve: il piano gratuito regge con margine, ma è l'egress a finire prima del disco). Il frontend è statico e pubblicabile così com'è su GitHub Pages / Cloudflare Pages. La contabilità che serve solo alla sincronizzazione (`Store.modoCondiviso`) si accende con l'archivio condiviso: in locale non costa né spazio né tempo.
