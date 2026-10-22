# Analisi tecnica — luglio 2026

Controllo generale del codice fatto insieme al lavoro della 0.21.0. Diviso in
**risolto in questa versione** e **aperto**, con il motivo per cui una cosa è
stata rimandata. Ogni voce porta file e riga: se il codice si sposta, il
riferimento va aggiornato o la voce va chiusa.

> **Nota di lettura (0.76.0).** Questo documento è nato col lavoro della 0.21.0
> e le sue sezioni «Risolto» arrivano fino alla 0.43.0. Fra la 0.44.0 e la
> 0.75.0 l'app è cresciuta parecchio (conto lavoro, ODL, carico centri, barra
> filtri, manuale) senza che il documento la seguisse: le voci di quel tratto
> **non sono qui**, stanno in `CHANGELOG.md`. La sezione «Aperto» è invece
> aggiornata alla 0.76.0, ed è la parte che conta — è la mappa di ciò che resta
> da fare.

> **Nota di lettura (0.35.0).** Le voci che nominano `importItems` descrivono
> lavoro fatto quando l'import articoli era un foglio unico in
> `import-export.js`. Quella funzione non esiste più: dalla 0.35.0 l'import e
> l'export degli articoli stanno in `import-catalog.js`, divisi nei due file
> Acquisti e Progetto. Le conclusioni restano valide e valgono per
> `importCatalogSheets` — indice dei codici compreso, che è ancora
> `codeIndex()`/`codeIndexAdd()`.

---

## Risolto nella 0.21.0

### 1. `usedBy()` scansionava tutto il catalogo, due volte per riga
`views-bom.js` — la funzione filtrava `db.items` a ogni chiamata, ed era invocata
ricorsivamente da `ancestorTotals()` **e una seconda volta dentro il `.filter()`
di `impactedTops()`**. Su un catalogo grande la finestra "Dove è usato" e ogni
ricalcolo della simulazione costavano O(articoli × antenati).

Sostituita da `parentIndex()` in `core.js`: un indice figlio → padri costruito
una volta per giro di disegno e azzerato da `invalidateCaches()`, come già
`itemIndex()`. Misurato con `node test/bench.js`: risalita su 700 articoli da
**8200 ms a 120 ms, 68 volte più veloce**.

Effetto collaterale voluto: l'indice considera figlio ogni riga di ciclo con
`kind !== 'op'`, mentre prima serviva `kind === 'item'` esatto. È la regola che
usa il motore di costo (`costing.js:62`), quindi ora le due strade concordano;
`usageQty()` è stata allineata.

### 2. `db.suppliers.find` e `db.workCenters.find` dentro i cicli di disegno
Dodici punti per i fornitori, sei per i centri di lavoro, alcuni nel rollup
(`costing.js:87`) e nel disegno di ogni riga di elenco. Aggiunti `supplierIndex()`
/ `getSupplier()` e `workCenterIndex()` / `getWorkCenter()` in `core.js`, con lo
stesso ciclo di vita degli altri indici. Restano volutamente lineari due casi:
la migrazione in `store.js` (gira prima che gli indici abbiano senso) e la
ricerca per nome in `import-export.js:83`.

### 3. Un fornitore si poteva cancellare lasciando riferimenti orfani
`delSupplier()` (`views-manage.js`) controllava solo `db.items.supplierId`. Un
fornitore citato unicamente in `priceList[].supplierId`, in una lavorazione
esterna di ciclo o in un documento spariva, e lo storico prezzi puntava nel
vuoto. Ora `supplierUses()` guarda tutti e cinque i posti e dice quali.

### 4. Gli export PDF/Excel morivano in silenzio senza rete
`const { jsPDF } = window.jspdf;` senza guardia in quattro punti. L'app è fatta
per aprirsi con un doppio click su `file://` e girare offline: senza CDN quella
riga lanciava un `TypeError` che nessuno intercettava, e all'utente sembrava che
il pulsante non funzionasse. Aggiunti `requirePdf()` e `requireXlsx()` in
`core.js`, con un messaggio che dice cosa è successo. Aggiunto anche
`reader.onerror` in `readSheet()`, che prima taceva.

### 5. `mrpDescend`: antenati in un array
`ancestors.includes()` era una ricerca lineare a ogni livello di discesa. Ora è
un `Set`. Piccolo, ma la funzione ha appena guadagnato un ramo in più (le parti
acquistate) ed è il punto più caldo del fabbisogno.

### 6. Documentazione disallineata
`docs/cloud-schema.md` non mappava `items[].priceList`, `rfqs` né `orders`;
`README.md` citava `app.js`, che non esiste più dallo split nei `views-*.js`.

---

## Risolto nella 0.22.0

Prima tappa del percorso verso il database condiviso: si chiudono le voci che
servono ad **accorgersi** dei guasti e a **non toccare il codice al buio**. Le
voci che riguardano l'integrità dei dati (unicità dei codici, numerazione dei
documenti, cicli lato server) restano aperte e vanno chiuse *prima* che i dati
diventino condivisi, non dopo.

### 7. C2 — nessuna gestione degli errori fuori da `store.js`
Era la voce indicata come «il primo intervento da fare fra quelli aperti: costa
poco e rende visibile tutto il resto», ed è stata fatta per prima proprio per
quello. `window.onerror` e `unhandledrejection` in `core.js`, che riusano lo
stampo già collaudato di `showPersistErrorModal()`: toast breve, finestra
esplicativa **una volta sola** (un render che fallisce in ciclo renderebbe l'app
inutilizzabile), e un registro circolare degli ultimi `ERROR_LOG_MAX` errori con
data, vista aperta e revisione, scaricabile da *Gestione → Backup*.

Nessun tentativo di recupero, deliberatamente: un errore dentro un `render*`
lascia comunque uno stato incerto, e fingere che sia tutto a posto è peggio che
dirlo. L'avviso dice due cose e basta — quello a schermo può essere incompleto,
i dati salvati non sono stati toccati — e offre il ricaricamento.

### 8. C3 — i due file senza un solo test
`import-export.js` e `auth.js` erano scoperti al 100%. Aggiunti
`test/import.test.js` e `test/auth.test.js`: **80 nuovi controlli**, la suite
passa da 340 a 424. Coperte tutte le funzioni elencate come scoperte tranne
`renameUom` e `addUser` (`views-manage.js`, ancora aperto) e `rfqAutoStatus`/
`ordAutoStatus` (vedi C3 residuo).

Il valore non è il numero: `importItems`/`importBom` sono il punto in cui un
foglio sbagliato riscrive mezzo catalogo, e ora è fissato per iscritto che
l'upsert è idempotente, che una riga sbagliata non ferma quelle buone, e che un
padre citato solo in righe *errate* **non perde la distinta che aveva** —
l'azzeramento avviene alla prima riga valida, non alla prima riga.

I test hanno subito trovato un difetto reale: il template Articoli scaricabile
propone la dicitura *Componente commerciale*, che `resolveType()` non accettava.
Chi compilava il template partendo dall'esempio si vedeva rifiutare le proprie
righe. Aggiunti quel sinonimo e il plurale *Materie prime*.

Aggiunta anche una GitHub Action che esegue `node test/run.js` a ogni push: la
suite esisteva già, ma girava solo quando qualcuno si ricordava di lanciarla.

### 9. A1 (metà) — nessun SRI sui CDN
`index.html` carica le tre librerie con `integrity` e `crossorigin`: un CDN
compromesso non può più iniettare codice. Cambiando versione va rigenerato anche
l'hash — se non corrisponde la libreria non si carica, e `requirePdf()`/
`requireXlsx()` lo dicono all'utente invece di tacere.

**Resta aperta l'altra metà**: l'aggiornamento di `xlsx@0.18.5`, che è la parte
con le CVE. Vedi A1 sotto.

### 10. A3 — la sessione non scadeva mai
Il `ts` scritto da `doLogin()` ora viene letto da `sessionExpired()`.
Configurabile in *Gestione → Impostazioni* (`settings.sessionDays`, 30 giorni di
serie, **0 = non scade**, com'era prima). Una data illeggibile conta come
scaduta: meglio richiedere la password che tenere aperta una sessione di cui non
si sa più l'età.

### 11. A5 — `unescape()` deprecato
Sostituito da `TextEncoder` in `sha256Hex()`. Gli hash restano **bit per bit
identici** — `unescape(encodeURIComponent(s))` produceva già i byte UTF-8 — e i
test che confrontano l'implementazione a mano con `node:crypto` lo verificano ad
ogni giro: nessuno deve rifare la password. In più `TextEncoder` non lancia sui
surrogati spaiati, dove `encodeURIComponent` lanciava.

Effetto collaterale: `TextEncoder` è un globale della piattaforma assente nei
contesti `node:vm`, quindi è stato aggiunto al sandbox di `test/harness.js`.
La suite ha intercettato la modifica al primo giro — che è esattamente il
motivo per cui quei test esistono.

---

## Risolto nella 0.23.0

Seconda tappa: **integrità dei dati**. Sono le voci che oggi passano inosservate
e che in cloud diventano vincoli del database — vincoli che fanno fallire
salvataggi funzionanti, su dati che nel frattempo si sono sporcati. L'ordine
seguito è quello obbligato: prima il validatore locale, poi lo strumento per
ripulire ciò che c'è già, e solo dopo (in fase cloud) il vincolo SQL.

### 12. A6 — nessun controllo di unicità su `items.code`
`validateItemCode()` (`views-catalog.js`) in `saveNewItem` e `saveItemEdit`, più
il report dei duplicati esistenti in *Gestione › Backup* (`renderDuplicateCodes`,
`import-export.js`).

La regola che rende la validazione vivibile su dati già sporchi: si impedisce di
**introdurre** un duplicato, non si blocca chi sta correggendo altro su un
articolo che era già duplicato prima. Un validatore che blocca ogni salvataggio
su dati storici viene aggirato, non rispettato.

Il report **non rinomina niente in automatico**, deliberatamente: il codice
articolo sta su disegni e ordini già emessi, e sceglierlo al posto dell'utente
sarebbe peggio del problema. Elenca i gruppi e apre le schede.

Coperto anche il caso indiretto: `genItemCode()` guarda solo i codici che
seguono il proprio schema, quindi poteva generarne uno già occupato da un codice
inserito a mano fuori pattern. Ora l'import rileva la collisione, ripiega
sull'id e lo segnala.

### 13. B1 — `importItems`/`importBom` quadratici
Aggiunti `codeIndex()` / `getItemByCode()` / `codeIndexAdd()` in `core.js`, con
lo stesso ciclo di vita degli altri indici (azzerati da `invalidateCaches()`).

Il dettaglio che conta e che l'analisi non aveva previsto: la ricostruzione
automatica dell'indice scatta al cambio di lunghezza di `db.items`, e l'import
**aggiunge una riga per volta**. Con la sola auto-ricostruzione ogni riga avrebbe
rifatto l'indice da capo e il costo sarebbe rimasto quadratico. Da qui
`codeIndexAdd()`: registrazione incrementale dell'articolo appena creato.
Chi dimentica di chiamarla non rompe niente — la ricostruzione successiva rimette
tutto a posto, semplicemente costa.

`test/import.test.js` ha una rete sui tempi (400 righe su 400 articoli) che
fallisce se l'indice smette di funzionare.

### 14. A4 — `Store.importSnapshot()` validava solo `Array.isArray(data.items)`
`validateSnapshot()` in `store.js` verifica la forma di tutte le collezioni
radice, il tipo di `settings` e la versione dello schema. Un file prodotto da una
revisione **più recente** viene fermato invece di essere degradato in silenzio:
le migrazioni sanno salire, non scendere.

`importBackup()` mostra ora il **contenuto del file prima di sovrascrivere**
(`snapshotCounts()`), accanto a quello che c'è adesso, e distingue due errori che
prima erano lo stesso toast «File non valido»: JSON illeggibile e JSON valido ma
non nostro.

### 15. A8 — cicli non verificati sulle righe di ciclo delle parti
`createsCycle()` (`views-bom.js`) percorre ora entrambe le strade con cui un
articolo ne contiene un altro: i `components` degli assiemi e le righe di
distinta nel `cycle` di una parte (`kind !== 'op'`). È la stessa regola di
`parentIndex()` e del motore di costo: le tre discese ricorsive ora concordano
davvero, invece di concordare per caso.

Aggiunte a `pickCycleItem()` (`views-catalog.js`) le due guardie che aveva la
distinta base e che lì mancavano del tutto: tipo ammesso e ciclicità. Nessuna
delle due può scattare oggi — `CYCLE_CHILD_TYPES` ammette le sole foglie — e
sono lì proprio per questo: la regola deve stare accanto alla scrittura che la
rispetta, non nel filtro di un elenco.

**Resta aperto il lato server** (trigger ricorsivo su `item_components`): in
cloud due client possono creare congiuntamente un anello che nessuno dei due
vede, e nessun controllo JS può accorgersene. Vedi A8 sotto.

---

## Risolto fra la 0.37.0 e la 0.43.0

Controllo generale ripetuto sull'intero codice (agosto 2026). Le voci qui sotto
non erano tutte in questo documento: metà sono difetti trovati in quel giro.

### 16. Venti mutatori della Gestione senza `roleGuard` *(0.37.0)*
`views-manage.js`: termini di trasporto e pagamento, dati azienda, fornitori,
famiglie e sottofamiglie, centri di lavoro e unità di misura scrivevano senza
chiedere il permesso, mentre le funzioni sugli utenti nello stesso file lo
chiedevano. La protezione era la sola navigazione: un pannello lasciato aperto
mentre il ruolo cambiava scriveva lo stesso. Aggiunta anche a `releaseRevision`
(`views-rev.js`), che è globale e contava sui chiamanti.

La regola dichiarata in `core.js` — «le guardie stanno nei mutatori, non nella
UI» — vale solo se non ha eccezioni: un'eccezione la trasforma in una
convenzione, e le convenzioni si dimenticano.

### 17. La home leggeva il toggle lordo/netto di un'altra vista *(0.37.0)*
`renderHome` passava `mrpNet` a `mrpBuyRows`. Il conteggio delle righe da
ordinare cambiava a seconda di come qualcuno aveva lasciato la vista
Fabbisogno, e due persone sulla stessa base dati leggevano numeri diversi senza
avere modo di accorgersene. Ora è sempre il **netto**, che è il numero
azionabile. `views-mrp.js` documentava già che `netMode` è un parametro e non
una lettura del toggle: la home era l'unico punto che lo violava.

### 18. `costContributors` risolveva gli articoli per codice *(0.37.0)*
`views-report.js` usava `getItemByCode(r.code)` avendo `r.itemId` sulla riga.
I codici duplicati esistono per scelta (§12), e `codeIndex()` risolve sempre sul
primo: una foglia omonima di un assieme veniva scartata come «assieme» e la sua
spesa spariva dal conto, oppure due articoli distinti si fondevano in una voce
sola. Ora si risolve e si aggrega per id. Corretti nello stesso giro due casi
che nessuno aveva notato: le righe di lavorazione comparivano tra i contributi
(la finestra dichiara che stanno nelle barre di incidenza) e una parte prodotta
in casa contava sia per sé sia per le righe del proprio ciclo.

### 19. `itemInfoRows` aveva il contratto di escaping rovesciato *(0.37.0)*
Era l'unico helper del repo in cui l'escaping toccava al chiamante: funzionava
per disciplina, e una voce aggiunta senza pensarci sarebbe diventata
un'iniezione HTML silenziosa. Ora escapa dentro e i valori che sono davvero
HTML lo dichiarano (`rawHtml`). Stessa correzione sul banner di sblocco
documenti, che riceveva il gestore del click come **stringa di JavaScript**.

### 20. Quattro lavori quadratici sui percorsi più caldi *(0.38.0)*
Nessuno cambiava un numero; tutti costavano.
- `renderHome` riesplodeva tutte le distinte di tutti i piani aperti, che
  `commitIndex()` aveva già esploso per calcolare gli impegni. È la schermata di
  ogni accesso.
- La simulazione di costo chiamava `withTempCost` **dentro** la `.map` sulle
  cime impattate: 2N azzeramenti delle cache globali e 2N rollup da zero, a ogni
  carattere digitato. Ora una volta sola attorno all'intera mappa.
- Lo storico revisioni ricalcolava `revSnapshot()` — tre copie profonde e un
  rollup — per ogni revisione in elenco, ottenendo N volte la stessa fotografia.
- La scheda articolo riesplodeva ogni piano a ogni apertura, ed è il gesto più
  frequente dell'app: ora c'è `planUseIndex()`, con lo stesso ciclo di vita
  degli altri indici. Copre anche i piani chiusi, perché la domanda della scheda
  è storica e `commitIndex()` risponde a un'altra domanda.

### 21. Quattro toppe diverse allo stesso problema *(0.39.0)*
Ogni gesto riscrive l'HTML della vista intera, e questo butta via scroll, campo
a fuoco e punto di digitazione. Quattro viste se n'erano accorte separatamente e
si erano scritte quattro rimedi diversi. Ora c'è `renderInto(contenitore, fn)`
in `core.js`, e il caso del menu a tendina a fuoco ha una risposta esplicita:
**non si ridisegna affatto**, perché un elenco che si rimescola mentre lo si sta
aprendo non è ripristinabile.

### 23. A1 — SheetJS aggiornato, e le librerie portate dentro il repo *(0.43.0)*
*(L'altra metà — l'SRI sui CDN — era chiusa nella 0.22.0, §9.)*

`xlsx@0.18.5` aveva due vulnerabilità corrette a monte (prototype pollution,
0.19.3; ReDoS, 0.20.2) su quello che è **input non fidato**: un file Excel
arriva da un fornitore o da una mail. La voce era rimandata perché SheetJS dopo
la 0.18 non pubblica più su cdnjs, quindi non era un cambio di numero e basta.

Risolto vendorizzando: `vendor/xlsx.full.min.js` alla **0.20.3**, presa dal CDN
ufficiale e committata. Nello stesso giro sono entrati anche i due file jsPDF —
stessa versione di prima, verificata **bit per bit** confrontandone l'impronta
SHA-512 con l'attributo `integrity` che stava in `index.html`.

Il secondo motivo, che vale quanto il primo: l'app dichiara di aprirsi con un
doppio click e di funzionare offline, e con le librerie su un CDN era vero solo
dopo il primo caricamento con la rete. Su una postazione d'officina scollegata i
pulsanti di export erano muti. Ora non c'è più un terzo dominio da cui dipendere.

Aggiunto `test/vendor-xlsx.test.js`, che copre il buco che *tutti* gli altri
test sull'import lasciavano aperto per scelta: il **binario**. Il giro completo
— esporta, scrive un `.xlsx` vero, lo rilegge con le stesse due chiamate di
`readWorkbook()`, reimporta — gira dentro la suite, quindi il prossimo
aggiornamento della libreria si fa sapendo subito se qualcosa si è mosso.
Restano da provare a mano i file prodotti da Excel stesso: quelli nessun test
può fabbricarli.

### 22. C1 — la duplicazione RFQ/ODA, per la parte che conta *(0.41.0)*
*(Prerequisito chiuso nella 0.40.0: `test/docs-state.test.js`, 29 controlli su
stati, ricevimenti, blocchi e numerazione — vedi C3.)*

Le due dozzine di coppie speculari sono diventate **un registro dei due tipi di
documento** (`DOC_KINDS`) più una funzione sola per ogni regola: guardie,
blocchi, sblocco, modifica di campi e righe, aggiunta manuale e da catalogo,
salvataggio, eliminazione, uscita dall'editor. I nomi storici (`rfqSetLine`,
`ordSetLine`…) restano come adattatori di una riga: sono citati in centinaia di
`onclick` nei template, e rinominarli avrebbe aggiunto rischio senza aggiungere
niente. Ne restano 37, tutti di una riga.

**Il volume del file non è cambiato** (1063 → 1072 righe di codice): il registro
e la sua documentazione costano quanto le copie tolte. Il guadagno non era
quello — è che ogni regola ha un punto solo, e che le differenze fra i due
documenti sono ora dichiarate in un elenco invece di essere sparse in venti
funzioni, dove per trovarle bisognava confrontarle a mano.

**Resta duplicata la presentazione**: `renderRfqEdit`/`renderOrderEdit` e i
quattro export PDF/Excel (~300 righe). Deliberatamente: **non hanno un test**,
e il motivo per cui C1 era rimandato era esattamente questo. Estratta però
`docPartyLines()`, l'intestazione richiedente/fornitore che i quattro export
ripetevano identica. Il prossimo passo, se si vuole chiudere anche quello, è un
test sull'export prima del refactor — non dopo.

---

## Risolto nella 0.76.0

Giro di controllo generale: si legge tutto il codice e si chiude ciò che salta
fuori. Le voci qui sotto **non erano in questo documento** — sono difetti nuovi,
trovati leggendo, e vale la pena notare dove si annidavano: non nella logica di
dominio, che è la parte più guardata e più testata, ma ai bordi — la
concorrenza fra schede, l'arrotondamento fra due rappresentazioni della stessa
cifra, i margini di un foglio PDF, il nome di un file.

### 24. Due schede si cancellavano il lavoro a vicenda
`Store.commit()` riscrive l'intera chiave con la propria fotografia in memoria, e
non esisteva **nessun** listener `storage` né controllo di versione. La seconda
scheda che salvava cancellava tutto ciò che la prima aveva fatto nel frattempo,
senza errore e senza avviso — `dbUnsaved` restava `false`, perché la `setItem`
riusciva. Su un gestionale aperto in due finestre era perdita dati certa e
invisibile, ed è il difetto più grave trovato in questo giro.

Ora un contatore di revisione vive in una chiave sua (`bomtrack_v1_rev`), letta
prima di ogni scrittura: costa la lettura di un numero, non la rilettura di
qualche megabyte di JSON. Al conflitto il salvataggio si ferma e lo dice.
**Deliberatamente non si fonde niente**: fondere due fotografie richiede di
sapere, riga per riga, quale versione vale, e quella risposta non ce l'ha
nessuno qui — ci si limita a smettere di sovrascrivere di nascosto, che è il
difetto. `Store.forzaProssimaScrittura()` è la via d'uscita esplicita, e vale
una volta sola. Coperto da `test/concorrenza.test.js`, che fa condividere un
`localStorage` a due istanze dell'app — cioè il rapporto vero fra due schede.

### 25. Il totale dei documenti non tornava con la somma delle righe
La colonna Importo arrotondava ogni riga ai centesimi (`fmtN`), il piede sommava
i prodotti a piena precisione e arrotondava alla fine. Con i prezzi a quattro
decimali che il listino ammette (`step="0.0001"`), tre righe da 1×1,005
stampavano 3,03 in colonna e 3,02 sotto. Su un documento che parte verso un
fornitore è un errore che si vede. `importoRiga()` in `core.js` arrotonda dove
l'importo nasce, e `totaleRighe()` somma ciò che il fornitore legge; i sette
punti che calcolavano `qty * price` a mano — inclusi i due Excel, che scrivevano
il valore grezzo **in cella** — passano tutti di lì.

### 26. Note e condizioni sparivano in fondo ai PDF
`splitTextToSize` e `addPage` non comparivano **in tutto il repo**. Il testo di
coda era scritto a `y` crescente: una nota lunga usciva dal margine destro, e su
un ordine con molte righe le condizioni finivano oltre il bordo del foglio. In
entrambi i casi senza un errore. `docCoda()` manda a capo, cambia pagina quando
serve, e spezza anche un blocco più alto di una pagina intera — quest'ultimo
caso l'ha trovato il test appena scritto, non l'ispezione.

### 27. Un fornitore con i nostri pezzi si poteva cancellare
Stessa classe della §3, dal lato nato dopo: `supplierUses()` copriva sette posti
ma non `db.movements`, benché `REFS` dichiari `movements.supplierId` e
`fromSupplierId`. Non era un caso di confine — la scheda del movimento
**pretende** il terzista — e il prospetto «presso terzi» restava a raggruppare
sotto «senza fornitore» materiale di proprietà fermo da qualcuno.

### 28. Altro, in breve
- **Nomi dei file di export** mai sanificati in dieci punti: «AB/123-01» è un
  codice normale in officina, e il browser davanti a un nome invalido tronca o
  rinomina senza dirlo. Un solo `nomeFileSicuro()` in `core.js`.
- **Il pannello «Aggiungi componenti»** si azzerava a ogni ridisegno, contro
  quanto promette il commento che lo governa: bastava espandere un nodo
  dell'albero per perdere le quantità messe su dieci articoli.
- **`auth.js`** aveva gli unici tre accessi a `localStorage` senza `try/catch`,
  e stavano sulla schermata d'accesso: in navigazione privata l'app non partiva
  affatto, cioè proprio nello scenario che `showLoadErrorModal` racconta.
- **Nessun `beforeunload`**, benché `isUnsaved()` e i tre flag `*Dirty`
  esistessero già e l'avviso dicesse testualmente «chiudendo questa scheda
  andrebbero persi».
- **`renameUom`/`uomUsage`** ignoravano `altUom` e `priceUom`, cioè la doppia
  unità di misura. Non corrompeva i calcoli (i due campi si guardano fra loro,
  non l'elenco) ma faceva dichiarare «non usata» l'unità che converte i prezzi.
- **Selezione multipla O(n²)** nell'Ispettore, su un percorso che gira a ogni
  carattere digitato nel filtro: tre `Set`.
- **`aria-modal`** dichiarava inerte una pagina che per scelta non lo è, e due
  schede aperte si dichiaravano entrambe «l'unica». Tolto l'attributo, tenuto
  `role="dialog"`: la pagina viva dietro è il disegno, non un difetto.
- I messaggi di `requirePdf`/`requireXlsx` parlavano ancora di **connessione a
  internet**, superata dalla vendorizzazione della 0.43.0 (§23); i caratteri di
  Google restavano l'unica dipendenza di rete, e **bloccante**, sul percorso di
  avvio.

### Una correzione annullata
«1.500» letto come 1,5 in import sembrava un difetto, e non lo è:
`test/import.test.js` documenta la lettura decimale come scelta deliberata — con
un separatore solo non si indovina, e «0.750» sono settantacinque centesimi. Il
test ha fermato la modifica. Vale la pena registrarlo: è il caso in cui la
documentazione del progetto ha avuto ragione contro chi lo stava controllando.

---

## Aggiunto nella 0.77.0, e cosa comporta

Tre funzionalità nuove. Si registrano qui perché ciascuna lascia qualcosa da
tenere d'occhio, e perché due di esse toccano il contratto del futuro backend.

**Avanzamento di produzione** (`produzione.js`, collezione `productions`). Una
dichiarazione per volta invece di un saldo riscritto — la stessa scelta dei
movimenti di magazzino, e per la stessa ragione. Da tenere d'occhio: la
collezione **cresce e non viene mai potata**. Su un uso intenso è la seconda per
numero di righe dopo i movimenti, e va contata nella stima di
`docs/sostenibilita-free-tier.md`, che non la conosce.

**Allegati** (`allegati.js`, collezione `attachments` + IndexedDB). È il primo
posto in cui l'app tiene dati **fuori** da `Store`, ed è una deroga consapevole:
in `localStorage` i file non ci stanno, e metterceli avrebbe fatto smettere di
salvare tutto il resto. Le conseguenze aperte sono due, entrambe dichiarate
all'utente ma non ancora risolte:
  - il **backup JSON non è più completo**. Porta l'elenco degli allegati e non i
    file, quindi un ripristino su un altro PC è una copia parziale. La strada
    giusta il giorno del cloud la indica già
    `docs/sostenibilita-free-tier.md` nella sezione «il giorno in cui arrivano i
    disegni»: Supabase Storage, che è fuori dal budget del database;
  - i **file orfani** non si raccolgono da soli. C'è il pulsante in Gestione, ma
    è un gesto manuale, e nessuno lo farà finché lo spazio non finisce.

**PWA** (`sw.js`, `manifest.webmanifest`). Il rischio vero non è il service
worker in sé ma il **disallineamento**: uno script aggiunto a `index.html` e
dimenticato in `sw.js` funziona online e sparisce offline, e una `VERSIONE` non
aggiornata fa servire per sempre la cache vecchia a chi ha già aperto l'app.
Sono i due difetti che si manifestano esattamente dove nessuno guarda, ed è per
questo che `test/pwa.test.js` li controlla invece di fidarsi.

---

## Risolto nella 0.79.0

Lavoro sugli **ordini di produzione**. Tre voci, e la prima non era stata
censita da nessuno perché non si vedeva: era un'assenza, non un difetto.

### 30. Una parte a ciclo tutto interno non muoveva mai il magazzino
Gli ancoraggi del conto lavoro (`clLineRole`, `views-stock.js`) sono gli estremi
delle **tratte esterne** del ciclo. Una parte senza fasi esterne non ne ha
nessuno: il suo materiale non usciva mai e il pezzo finito non entrava mai, se
non con un carico scritto a mano. Non c'era nemmeno un documento da cui farlo.

Chiuso con l'ordine di produzione, che porta gli ancoraggi sugli estremi del
**ciclo** invece che su quelli delle tratte esterne, e quindi vale identico per
un ciclo interno, esterno o misto.

### 31. `clStep` nominava i pezzi col codice della parte
Il passaggio di lavorazione registra un movimento sul **codice della parte**
prima che la parte esista: la parte lo diventa al rientro dell'ultima fase. Il
movimento non tocca la giacenza — `movimentoToccaMagazzino` lo esclude — ma
entra nel saldo per coppia (luogo, articolo), e faceva comparire nel prospetto
*presso terzi* una quantità di un codice che quel terzista non aveva mai avuto.

Negli ordini di produzione fra le fasi **non si scrive niente**, e il luogo lo
dà la fase corrente. `clStep` resta per gli ordini di lavoro esistenti, che non
cambiano comportamento: è la ragione per cui `work_orders.odp_id` esiste ed è
nullo su tutto ciò che c'era.

### 32. Il pulsante «Sblocca per modifica» di un ODL non sbloccava niente
`docLockBanner` (`views-docs.js:26`) sceglieva il gestore con
`docKind === 'order' ? 'ordUnlock' : 'rfqUnlock'`, e l'ODL — terzo tipo,
aggiunto dopo — ricadeva su `rfqUnlock`. Quella funzione su un id di ordine di
lavoro non trova niente e **torna in silenzio**: il pulsante c'era, si premeva,
e non succedeva nulla. Sostituito con una mappa, che un tipo nuovo non può far
ricadere sul ramo sbagliato senza accorgersene.

È il difetto tipico della catena di ternari cresciuta con un caso alla volta, e
vale la pena cercarne altri con la stessa forma prima che qualcuno li trovi
usando l'app.

---

## Risolto nella 0.80.1

Controllo fatto con un solo criterio: **cosa si rompe il giorno in cui arriva
Supabase**. Le voci qui sotto sono quelle che si potevano chiudere in locale,
con un test, prima di scrivere una riga di codice di rete — tutte in
`store.js`, coperte da `test/righe-figlie.test.js` (18 controlli, 13 dei quali
falliscono sul codice della 0.80.0). Le altre trovate nello stesso giro sono
in fondo alla sezione «Aperto», sotto **D**.

### 33. Il merge «per riga» non aveva le date delle righe
`SCHEMA` dichiarava `merge: 'row'` per righe di documento, quotazioni, fasi
degli ODP, ma le righe non avevano un `updatedAt` proprio: `docSetLine`
toccava il documento, non la riga. In cloud due colleghi su due righe diverse
dello stesso ordine si sarebbero cancellati a vicenda — l'adapter sapeva che
l'ordine era cambiato, non quale riga.

Non si è chiesto ai mutatori di ricordarsene: era l'invariante affidata alla
disciplina, ed era già rotta (§34). `stampChildRows()` confronta un'impronta
del contenuto di ogni riga con quella del passaggio precedente, a ogni
`commit()` e `pendingChanges()`, e data quella che è cambiata. Le righe
storiche prendono la data del padre al caricamento. Costo: ~85 ms su 42.000
righe (9 MB, oltre la quota di `localStorage`).

### 34. `renameUom` cambiava le righe dei documenti senza segnalarlo
Le righe di RFQ, ODA e ODL passavano al nuovo codice senza `touch()`, e dopo
la rinomina `pendingChanges()` contava **zero** documenti da mandare. Chiuso
da §33, senza toccare la funzione: è il motivo per cui la soluzione sta nello
Store.

### 35. Le righe figlie cancellate non si contavano
Un invio di soli upsert non esprime una cancellazione, e il conto delle
modifiche lo sapeva per i record radice ma non per le righe: una riga tolta da
un ordine risultava solo «ordine cambiato». Ora `pendingChanges()` porta
`removeChildren: { lines: [id…] }`, e la fotografia di `takeChanges()` ricorda
anche gli id delle righe.

### 36. A9 — `workCenters[].suppliers` in `SCHEMA` e `REFS`
Era «una riga di `SCHEMA`, e dopo sarebbe una migrazione». Ora è una tabella
figlia `work_center_suppliers` con merge per riga, `REFS` ne riscrive il
fornitore, e le righe senza id lo ricevono al caricamento.

### 37. Id «fm1», «fp2» su archivi già v2
I seed una-tantum delle famiglie materie prime e parti copiavano il database
demo con i suoi id. Su un archivio ancora v1 `migrateV2()` li trasformava in
UUID subito dopo; su uno già v2 restavano — **43** id non UUID, su cui il
primo invio a colonne `uuid` sarebbe fallito. Il seed ora nasce con UUID, e
`riparaIdSeminati()` ripara chi li ha già, riconoscendoli da id **e** nome
della famiglia demo e riscrivendo gli articoli che le citano.

### 38. I riferimenti agli utenti non erano rimappabili
Con Supabase Auth l'id di un profilo cambia, e con lui ogni `createdBy`,
`updatedBy`, `deletedBy` del database — che `REFS` non elencava. La
riscrittura di `migrateV2()` è diventata `remapIds(maps)`, che accetta anche il
tipo `'user'` e lo applica ai campi di `AUDIT_REFS` su ogni record e riga
figlia. È lo strumento della migrazione utenti; oggi nessuno la chiama.

---

## Risolto nella 0.81.0

### 39. D1 — i ricevimenti sono eventi
Il ricevuto di una riga d'ordine era un numero riscritto a ogni arrivo, e la
giacenza ne è la somma: in cloud due ricevimenti concorrenti sulla stessa riga
si sarebbero sovrascritti e un carico sarebbe sparito dal magazzino, senza
errore. Era l'ultimo saldo scrivibile rimasto in un modello che per la
giacenza, il conto lavoro e l'avanzamento aveva già scelto gli eventi.

Nuova collezione `receipts` (`order_receipts`): ogni ricevimento è un evento
con la **differenza** rispetto a prima, e `received` resta sulla riga come
lettura ricavata (`riallineaRicevuti()` a ogni caricamento). L'interfaccia non
cambia: si digita il totale, `registraRicevuto()` scrive il delta. I lettori di
`received` — giacenza, stato dell'ordine, fabbisogno, export — non sono stati
toccati. Il campo è dichiarato `derived` in `SCHEMA` e `flattenDB()` lo toglie
con `stripDerived`, perché inviarlo farebbe vincere di nuovo l'ultimo arrivato.

Scelte da conoscere:
- il primo caricamento trasforma ogni ricevuto esistente in un evento
  `apertura`, una volta sola (la riconosce dall'assenza della collezione);
- le righe di ODL nate da un ordine di produzione restano fuori: i loro pezzi
  rientrati li dichiara l'ODP, che è già fatto di eventi;
- gli eventi di un documento nel cestino restano, per il ripristino; quelli di
  righe che non esistono più si potano al caricamento;
- correggere all'ingiù è un evento negativo: la storia resta leggibile.

Coperto da `test/ricevimenti.test.js` (14 controlli), compreso lo scenario che
motivava la voce: due ricevimenti concorrenti, 3 + 2, danno 5.

Da tenere d'occhio: la collezione **cresce** come i movimenti — un evento per
ogni modifica del campo, più uno d'apertura per riga ricevuta. Va contata nella
stima di `sostenibilita-free-tier.md` insieme a `production_declarations`.

---

## Risolto nella 0.81.1

### 40. D2 — dalla riga locale alla riga del database
`flattenDB()` produceva i nomi del codice (`unitCost`, un `parentId`
generico), flag locali (`priceListSeeded`) e `''` dove una colonna `numeric`,
`date` o `uuid` vuole NULL: il primo invio sarebbe stato rifiutato per intero.
Prima di scrivere la traduzione si è misurato invece di indovinare: la suite
intera è stata fatta girare registrando, a ogni salvataggio, nome e tipo di
ogni campo di ogni tabella. L'inventario ha trovato quello che a mano non si
vedeva — riferimenti uuid a `''` negli articoli (`familyId`, `groupItemId`…)
e nei promemoria, `''` e `null` mescolati nei riferimenti delle righe di
ciclo, `desc` come nome di colonna (parola riservata in SQL).

`cloud-map.js` ha ora `righeCloud()` / `righeLocali()` e i due percorsi
completi `dbVersoCloud()` / `dbDaCloud()`. La regola è una (camelCase →
snake_case, `''` → NULL nelle colonne tipizzate) e le eccezioni sono un
registro (`CLOUD_TABLES`, `CLOUD_TYPES`). Prima di inviare si controlla
tutto, e si dice tutto insieme. I riferimenti vuoti del ciclo sono
normalizzati a `null` in `migrateDB()`. `flattenDB()` non è stato toccato: resta
l'inverso esatto del documento locale.

Coperto da `test/cloud-colonne.test.js` (16 controlli), incluso il giro
completo righe locali → SQL → righe locali.

---

## Risolto nella 0.82.0

Lo schema SQL esiste, ed è provato su un Postgres vero: `supabase/schema.sql`,
verificato da `test/schema-sql.test.js` (18 controlli; i 12 che richiedono il
database girano in CI con un servizio Postgres, e in locale con `BOMTRACK_PG`).

### 41. D3 — chiavi circolari: differite, e un invio solo
Tutte le chiavi esterne sono `deferrable initially deferred` e si scrive solo
attraverso `push_changes()`: l'ordine degli inserimenti non conta più, i
vincoli si controllano insieme alla fine. Il test spinge in un invio solo un
database che tocca tutte le 33 tabelle — `active_price_id` circolare
compreso — e lo rilegge identico con `pull_changes()` e `dbDaCloud()`.
Le regole delle chiavi seguono le protezioni che l'app ha già: `no action` dove
l'app impedisce di eliminare un record citato, `set null` sui riferimenti di
sola tracciabilità, nessuna chiave sui polimorfi. In `docs/cloud-schema.md`
c'è la tabella.

### 42. D4 — atomicità senza RPC per operazione
La voce chiedeva `declare_progress`, `launch_odp`. Leggendo il codice la
risposta è più semplice: ogni operazione composta è già **un `commit()`**, e
quindi un lotto di `takeChanges()`. Se il lotto è una transazione, l'operazione
lo è. Il test lo prova sul caso che motivava la voce: una dichiarazione con un
movimento che non può entrare — e la dichiarazione non resta. La regola che ne
discende per l'adapter: **un lotto non si spezza mai**.

### 43. L'eliminazione multipla lasciava riferimenti orfani
`bulkDelete` controllava solo le distinte, mentre `delItem` controlla anche
documenti, cicli, piani e magazzino (`isItemUsedAnywhere`). Un articolo già
ordinato o movimentato spariva con l'eliminazione in blocco, lasciando righe e
movimenti che puntavano al nulla — e con le chiavi esterne l'invio intero
sarebbe stato rifiutato. Trovato scrivendo le regole delle chiavi: ogni
`no action` presuppone una protezione nell'app, e questa mancava.

### 44. Due modifiche nello stesso millisecondo erano una sola
`touch()` scriveva l'ora corrente: due scritture nello stesso millisecondo
davano lo stesso `updatedAt`, e per la sincronizzazione — che riconosce una
modifica dal cambio di data — la seconda non esisteva. Un test di
`sync.test.js` falliva una volta su otto, e il riepilogo della suite lo
nascondeva sotto la riga «0 fallito» di un giro precedente. Ora `istanteDopo()`
garantisce che la data salga sempre, anche su un record datato nel futuro da
un orologio avanti: chi modifica una versione deve vincere su di essa.

### Trovato e corretto nello stesso giro
`date` sui **movimenti, dichiarazioni, avanzamenti e revisioni** è un istante
(`nowISO()`), non un giorno: la mappatura della 0.81.1 l'avrebbe rifiutato come
«data non AAAA-MM-GG». Lì il tipo è `timestamptz` (`CLOUD_TABLES[…].types`). E i
timestamp tornano da Postgres in un'altra forma («+00:00», microsecondi):
`righeLocali()` li riporta a quella di `toISOString()`, perché l'app li confronta
come stringhe.

---

## Risolto nella 0.83.0

### 45. D6 — i permessi nel database
La policy provvisoria («chiunque sia autenticato scrive tutto») è sostituita
dalla matrice dell'app: `role_areas` (che è `ROLE_WRITE`) e `table_areas`, da
cui `schema.sql` genera le policy di ogni tabella. La seconda **non è stata
dedotta dalla documentazione** — che copriva metà delle tabelle — ma misurata:
la suite intera è stata fatta girare registrando, a ogni salvataggio, le aree
lasciate passare da `roleGuard` e le collezioni cambiate. Ne sono usciti casi
che a leggerla non si vedevano: i movimenti scritti anche da `docs` (le
dichiarazioni di produzione), le richieste d'offerta anche da `catalog`
(registrare i prezzi di un'offerta nel listino), le commesse anche da `manage`
(rinominare un cliente).

Scrivendola è emerso un difetto di `push_changes()` che con la policy
provvisoria non si poteva vedere: sotto RLS una `DELETE` non permessa non dà
errore, tocca zero righe. La riga restava e la lapide veniva scritta — al pull
gli altri client l'avrebbero cancellata. Ora i permessi si controllano per
tabella, su tutto il lotto, prima di toccare qualcosa.

Coperto da 12 controlli nuovi in `test/schema-sql.test.js`, che girano come
utenti veri (ruolo `authenticated` e il loro id): fatti dal superutente, che
ignora RLS, non avrebbero provato niente. Con la policy provvisoria rimessa al
suo posto ne falliscono sette.

---

## Risolto nella 0.83.1 — tutto deve funzionare in locale

Lo spostamento su Supabase **non è previsto per ora**. Con questo criterio si è
riletto il lavoro delle versioni 0.80.1–0.83.0, fatto per prepararlo, chiedendo
una cosa sola: l'app locale funziona almeno come prima? Su due punti no.

### 46. La preparazione al cloud costava in locale, e non dava niente
Misurato su un archivio realistico (400 ordini da 8 righe, 1.500 articoli con
listino), salvato da una versione precedente e riaperto:

| | archivio dopo il primo salvataggio | salvataggio medio |
|---|---|---|
| 0.80.0 | 1,29 → 1,43 MB | 10,5 ms |
| 0.83.0 | 1,29 → 2,01 MB | 28,6 ms |
| 0.83.1 | 1,29 → 1,43 MB | 7,8 ms |

Due fonti, entrambe utili solo a chi scrive in due sullo stesso database: la
timbratura delle righe figlie (§33), che al primo caricamento datava ogni riga
esistente e a ogni salvataggio rifaceva le impronte, e i ricevimenti come eventi
(§39), ~290 byte per evento. In un `localStorage` da ~5 MB è spazio che manca
proprio quando serve. Ora stanno dietro `Store.modoCondiviso`, **spento di
serie**: in locale l'app si comporta come la 0.80, e lo spegnimento non perde
niente — accendendolo, le righe prendono la data del documento e ogni ricevuto
diventa un evento d'apertura. I test del modo condiviso lo accendono; tre test
nuovi verificano che spento non scriva niente.

### 47. Un ricevuto poteva azzerarsi in silenzio al caricamento
`riallineaRicevuti()` (§39) riscriveva il ricevuto di ogni riga con la somma dei
suoi eventi. Se un percorso qualunque scriveva il campo senza passare da
`registraRicevuto()` — oggi nessuno, domani chissà — il numero che l'utente
aveva visto tornava alla somma al caricamento successivo, senza un avviso; in
un archivio con la collezione già presente ma senza eventi, a **zero**.
Trovato misurando §46. La regola ora è che in locale **il numero visto non
cambia mai da solo**: una differenza diventa un evento di allineamento. Solo una
riga *senza* il campo — come arriva da un backend, dove non viaggia — lo
ricava dagli eventi.

### 48. D9 — la data dei documenti nuovi era il giorno UTC
Richieste, ordini, ODL, piani e ODP nascevano con `nowISO().slice(0, 10)`: in
Italia, fra mezzanotte e l'una (le due d'estate), con la data di ieri. E il
numero del documento prende l'anno **locale**: alle 00:30 di Capodanno nasceva
una «RFQ-2027-001» datata 31/12/2026. Ora `oggiISO()`, che esisteva già. I
calcoli di `views-mrp.js` (`addDays`, le settimane ISO) restano in UTC, ed è
giusto: lì sono UTC da capo a fondo. Il test simula le 00:30 a Roma, con e senza
ora legale, e fallisce sulla versione precedente.

### 49. B1 — fornitori e famiglie per nome, con un indice
`findOrCreateSupplier` e `findOrCreateFamily` cercavano per nome scorrendo
l'elenco a ogni riga d'import. Ora un indice con le regole di `codeIndex()`
(vince il primo; chi crea un record lo aggiunge a mano), azzerato da
`invalidateCaches()` a ogni salvataggio — senza, un fornitore rinominato in
Gestione fra due import sarebbe stato cercato col nome vecchio, e duplicato.
5.000 righe su 500 fornitori: sotto il secondo, con una rete nei test.

---

## Risolto nella 0.83.2 — grafica e impaginazione

L'app è stata aperta in Chromium con dati realistici (nomi lunghi, documenti
con dodici righe) a 1440, 1280, 820 e 390 px, nei due temi: 15 viste e 6
editor, 168 schermate, ciascuna misurata — scorrimento laterale, elementi fuori
schermo, testo tagliato, corpo sotto 11 px, contrasto WCAG, bersagli sotto i 32
px al telefono — e poi guardata. Il contrasto era già a posto ovunque.

### 50. La barra delle sezioni nascondeva sezioni intere
`.nav` era centrata con `justify-content:center` **e** scorrevole: quando non ci
stava, la parte in eccesso finiva oltre il bordo sinistro, dove nessuno
scorrimento arriva. E le etichette si spegnevano con una media query a 1330 px,
mentre ci stavano solo da ~1700: a 1366–1440 px Riepilogo e Gestione erano
invisibili, a 820 restava un'icona e mezza, a 390 la barra era larga zero.
Ora la centratura la fanno i margini automatici, e i gradi di degradazione
(`h-l1`…`h-l4`) li sceglie `adattaHeader()` **misurando**, perché lo spazio
dipende dal nome nella pill e dalle sezioni del ruolo, che una soglia fissa non
conosce. Due menu a tendina nuovi: ⋯ per i comandi di contorno, ☰ per le
sezioni.

### 51. Al telefono ogni pagina scorreva di lato
Due cause: l'intestazione (risolta da §50) e `.wl{grid-template-columns:1fr}`
sotto i 1100 px — una colonna `1fr` non scende sotto la larghezza minima del
contenuto, e la barra del documento la allargava di 160–300 px. Ora
`minmax(0,1fr)`, come già la versione a due colonne.

### 52. Il resto, in breve
- Codici articolo che andavano a capo sul trattino: `.code-link` è `nowrap`.
- Importi all'italiana (`numIt()` in `core.js`, scritto a mano: non deve
  dipendere dai dati di lingua del browser). Le quantità restano col punto:
  `fmtQty` finisce anche nei campi numerici e in testi che rientrano in Excel, e
  cambiarla in 120 punti non valeva il rischio — vedi C5.
- Bersagli da almeno 34 px su schermi stretti o a sfioramento; etichette di
  stato e tipo da 9–10 a 10,5 px (maiuscole: a quel corpo si leggono come 12).
- Export neutri (il formato lo dice l'icona); riga dei comandi della lista;
  barra del piano in due righe, con il perché sui «Genera…» spenti — un
  pulsante `disabled` non mostra il suggerimento, lo porta l'involucro; schede
  più staccate dalla pagina; pannello laterale chiuso di serie sotto i 1400 px.

Coperto da `test/layout.test.js`, che in CI apre l'app vera a sette larghezze.

---

## Risolto fra la 0.95.0 e la 0.96.0

> Come per il tratto 0.44–0.75, le versioni fra la 0.84.0 e la 0.94.0 non hanno
> voci qui: stanno in `CHANGELOG.md`. Questo giro riparte dalla lista di
> migliorie di ottobre 2026.

### 53. Il cruscotto cresceva col prodotto di articoli e ODP *(0.96.0)*

`dashModello()` impiegava **32 s** su un archivio dieci volte quello d'esempio
(1.370 articoli, 330 ODP, 8,7 MB). Il profilo diceva due cose, nello stesso
punto: `prodWipRows()` si ricalcolava da capo per ogni articolo (lo chiedono
`atSupplierOf` e `inWorkOf`), e ogni riga chiamava `opRegistrato`, che scorreva
**tutti** i movimenti per trovare quelli di un ordine.

Ora `opMovimentiDi()` indicizza i movimenti per ordine, `prodWipRows()` tiene il
risultato, e `_prodWipDi()` lo raccoglie per articolo; `invalidateProd()` butta
tutti e tre, con lo stesso ciclo di vita di `_opDeclIdx`. Il cruscotto passa a
**0,12 s**. Sullo stesso archivio un salvataggio costa 54 ms, `homeSegnali` 230,
`homeEventi` 340, senza un punto caldo dominante.

Il rischio di una cache è la lettura vecchia dentro un gesto. Qui non c'è:
`addMovement` passa da `Store.insert`, che salva e invalida prima che
`odpAutoStatus` rilegga. `test/odp.test.js` lo controlla gesto per gesto, senza
mai chiamare `invalidateCaches()` a mano.

### 54. D10 — un ruolo per l'officina *(0.96.0)*

La voce era aperta come «decisione di come lavora l'azienda»; la decisione è
stata presa. `officina: ['shop', 'agenda']` in `ROLE_WRITE`, con un'area nuova
`shop`. I gesti di reparto (ricevere, avviare e dichiarare le fasi, registrare
la produzione, rettificare le giacenze) passano da `roleGuardShop(oppure)`, che
accetta `shop` **oppure** l'area che li guardava prima: nessun ruolo esistente
perde un gesto, e `test/officina.test.js` lo prova per acquisti e
progettazione. Lo schema SQL ha le righe in `role_areas` e `table_areas`, e
`test/schema-sql.test.js` confronta ancora la matrice JS con quella SQL — ora
contando le righe invece di scriverne il numero.

### 55. Backup automatico e storico *(0.95.0)*

Due vuoti che non erano difetti di codice ma di esercizio: l'unica copia
dell'archivio stava nel browser, e di un record si sapeva chi l'aveva toccato
per ultimo, non cosa avesse cambiato. Il backup scrive un file al giorno in una
cartella scelta (stesso permesso della cartella dell'archivio) e ne tiene 14;
lo storico confronta a ogni `commit()` il contenuto delle collezioni con la
fotografia precedente. Il costo misurato: da 13 a 22 ms per salvataggio su 2,7
MB, che resta dentro il budget di un gesto.

---

## Risolto nella 0.107.0

### 56. C3 residuo — la stampa e le anagrafiche minori avevano zero test

`printSubtitle()` e `printView()` (`shell.js`) ora hanno i loro casi in
`test/nav.test.js`: il documento aperto nel sottotitolo, un documento sparito,
l'escaping, l'intestazione riempita prima di `window.print()`. Trasporto e
pagamento, dati azienda, concetti e centri di lavoro di `views-manage.js` sono
in `test/anagrafiche-minori.test.js`.

### 57. C5 — le quantità a schermo col punto decimale

Tutte le viste e i PDF passano da `fmtQtyIt()`, anche `fmtUom()`: «1,5 kg».
`fmtQty()` resta col punto per i campi numerici, e `test/uom-labels.test.js`
fallisce se uno script dell'app torna a usarlo.

### 58. La versione nell'app era rimasta indietro

La 0.106.1 è uscita con `APP_VERSION` e la cache del service worker ancora a
0.106.0: chi l'aveva già aperta non riceveva la correzione finché il browser non
buttava la cache da sé. `test/pwa.test.js` controlla ora che la versione in cima
al `CHANGELOG.md` sia quella di `APP_VERSION`.

## Aperto

> **Lettura per la situazione attuale (0.107.0).** L'archivio condiviso su
> Supabase esiste dalla 0.103.0. Le voci contrassegnate *[solo con backend]*
> valgono quando un PC è collegato a un archivio condiviso; senza, sono coperte
> come prima (un utente solo, e due schede protette dal contatore di revisione,
> §24). Le altre valgono sempre.

### A. Sicurezza

**A2 — `hashPassword` è uno SHA-256 a singolo giro** *[solo con backend]* (`store.js`), senza KDF
né iterazioni, e il backup JSON esporta gli hash. Il limite è documentato
onestamente (`store.js:161-166`, `README.md`) e l'app è locale e monoutente. Non
ha senso risolverlo in locale: si chiude passando a Supabase Auth, dove
`passwordHash`/`passwordSalt` vanno **cancellati** in migrazione.

**A10 — gli allegati sono fuori da `Store`, e il backup lo dice ma non lo
risolve.** *[il rimedio vero è col backend; in locale il backup lo dichiara]* Vedi la sezione 0.77.0 qui sopra. Non è un difetto da correggere in
locale — è una conseguenza inevitabile del tenere dei file su un browser — ma è
il primo punto in cui «esporta un backup JSON» non basta più a mettersi al
sicuro, e va chiuso insieme al backend, non dopo.

**A6 residuo — il vincolo `unique` su `items.code` va scritto in SQL.** *[solo con backend]* Il lato
applicativo è chiuso (§12), ma finché il vincolo non è nel database due client
possono ancora assegnare lo stesso codice in concorrenza: nessuno dei due vede
l'altro. Prerequisito: la bonifica dei duplicati storici, che ora ha lo
strumento per essere fatta.

*(A7 — numerazione documenti — chiusa nella 0.105.6: con l'archivio condiviso i
numeri li riserva il server, e un indice unico rifiuta i doppioni.)*

**A8 residuo — i cicli in distinta restano impediti solo lato client.** *[solo con backend: in locale il client è uno, e basta]* Il lato
applicativo è chiuso e ora copre anche la distinta parte (§15), ma `createsCycle()`
protegge dentro **un solo** client. In cloud due utenti possono creare
congiuntamente un anello che nessuno dei due vede, e `costOf` ricorre **per
tutti**: è l'unico vincolo la cui violazione rende l'app inutilizzabile a tutto
il team. Serve un trigger ricorsivo su `item_components`, e non è opzionale.

*(A9 — `workCenters[].suppliers` fuori da `SCHEMA` — chiusa nella 0.80.1, §36.)*

### B. Prestazioni

*(B1 residuo — fornitori e famiglie lineari nell'import — chiuso nella 0.83.1, §49.)*

**B2 — `mrpDescend` non memoizza.** Su una distinta con sottoassiemi molto
condivisi lo stesso ramo si riesplode per ogni percorso. Meno grave di quanto
sembri: le quantità dipendono dal percorso, quindi la memoizzazione va fatta sul
*profilo* del sottoalbero, non sul risultato — non è un `Map` e basta.

### C. Manutenibilità

**C1 residuo — resta duplicata la *presentazione* dei documenti** *(la logica è
chiusa nella 0.41.0, vedi §22)*: `renderRfqEdit`/`renderOrderEdit` e i quattro
export PDF/Excel, circa 300 righe. **Il prerequisito non c'è più**: dalla 0.76.0
`test/export-docs.test.js` verifica i sette export sui dati che producono — righe,
totali, piede, nome del file, condizioni in coda — sostituendo jsPDF e SheetJS con
due finti che annotano ciò che l'app passa loro. Il refactor si può fare, e ora
ha una rete sotto. *(Nella stessa versione `docCoda()` ha già unificato le tre
code identiche di richiesta, ordine e ODL.)*

*(C3 residuo e C5 — test della stampa e delle anagrafiche minori, quantità con
la virgola — chiusi nella 0.107.0, §56–57.)*

**C4 — file lunghi con scope globale piatto:** `views-docs.js` ~1990 righe,
`views-catalog.js` ~1970, `views-mrp.js` ~1880, `core.js` ~1430, `store.js` ~1240,
`views-manage.js` ~940. Senza moduli, ogni nome è globale e una collisione non dà
errore: vince l'ultimo caricato.

*Aggiornamento 0.76.0.* La **lunghezza** resta, e resta un problema di sola
lettura del codice: si chiude coi moduli, cioè rinunciando all'apertura da
`file://`. La **collisione** invece — che è il modo in cui quel problema fa danno
davvero — è stata misurata e presidiata: i nomi globali dichiarati dai 26 script
sono **1291** e le collisioni **zero**, e `test/scripts.test.js` ora fallisce se
qualcuno ne introduce una, nominandola. Il prezzo che questa voce dava per
obbligato non c'era: per non farsi male non serviva rinunciare a niente, serviva
contare.

### D. Verso il database condiviso *(censite nella 0.80.1 — tutte [solo con backend])*

Trovate nello stesso giro di §33–38, e non chiudibili in locale: vanno
nell'adapter o nello schema SQL.

*(D1 — il ricevuto come contatore sovrascritto — chiusa nella 0.81.0, §39.)*

*(D2 — nomi e tipi delle colonne — chiusa nella 0.81.1, §40.)*

*(D3 e D4 — chiavi circolari e scritture atomiche — chiuse nella 0.82.0, §41–42.)*

*(D9 — la data dei documenti nuovi in UTC — chiusa nella 0.83.1, §48: valeva anche in locale.)*

*(D5 — `localStorage` non reggeva lo specchio locale — chiusa: l'archivio sta in
IndexedDB, vedi `CHANGELOG.md`.)*

*(D6 — la matrice dei permessi nel database — chiusa nella 0.83.0, §45.)*

*(D7 — il cestino si potava sul client — chiusa nella 0.106.0: con l'archivio
condiviso `migrateDB()` non pota più, lo fa `pulizia_archivio()` sul server con
la sua ora, lasciando le lapidi. Non con `pg_cron`, che andrebbe attivato a mano
nel progetto: la chiede l'app dopo un giro riuscito, e il server la esegue al
più ogni 20 ore. La stessa funzione toglie le lapidi oltre i 90 giorni, e
`pull_changes()` fa riscaricare tutto a chi chiede da prima di quel taglio.)*

*(D8 — avvio e primo amministratore — chiusa fra la 0.103.0 e la 0.105.3: il
primo profilo creato su Supabase diventa amministratore (`profilo_crea`), gli
altri nascono sospesi, gli inviti partono da `bomtrack-utenti`; la procedura è
nel manuale, cap. 31.)*

*(D10 — un ruolo per l'officina — chiusa nella 0.96.0, §54.)*

---

## Note in positivo

- Il fatto che questo giro di controllo abbia prodotto **quattro** difetti alti
  su diciassettemila righe, e nessuno di essi nella logica di dominio, dice
  qualcosa: costificazione, esplosione di distinta, fabbisogno netto e conto
  lavoro — la parte difficile e quella più testata — hanno retto la rilettura.
  Quello che ha ceduto stava ai bordi: due schede aperte, un arrotondamento fra
  due rappresentazioni della stessa cifra, il margine di un foglio, il nome di
  un file. Sono i posti dove nessuno guarda perché non sembrano il problema.
- `Store.commit()` è un punto di scrittura unico e ben documentato, con gestione
  esplicita di quota esaurita, storage non disponibile e dati non serializzabili,
  e un hook `onPersistError` che tiene `store.js` libero da codice d'interfaccia.
- Il ragionamento sulla cachabilità di `costOf` (`costing.js:19-30`) non è banale
  ed è corretto: i risultati con `cycle: true` dipendono dal percorso di discesa e
  non finiscono mai in cache; quelli cachati sono congelati.
- L'escaping HTML con `esc()` è applicato in modo sistematico su tutti gli
  assegnamenti a `innerHTML`.
- `test/harness.js` risolve in modo pulito il problema di testare classic script
  globali senza jsdom e senza una sola dipendenza.
