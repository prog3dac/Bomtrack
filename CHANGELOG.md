# Changelog

Le revisioni seguono il versionamento semantico `0.MINOR.PATCH`: **MINOR** per nuove funzionalità, **PATCH** per correzioni. La versione in cima è quella in `APP_VERSION` (`core.js`) e mostrata nell'header dell'app.

### 0.117.0 — 2026-10-27

**Menu a tendina nei file Excel da importare.** Nei file Articoli (Acquisti e Progetto) e Impostazioni le colonne a valori ammessi hanno un menu a tendina vero, collegato agli elenchi dell'app: prima c'era solo il foglio Liste da cui copiare, o la convalida da impostare a mano. Nessun cambio a `supabase/schema.sql`.

- **Articoli**: UM, UM acquisto e UM prezzo, Macrofamiglia, Sottofamiglia, Fornitore, Concetto, Approvvigionamento, Tipo sigla gruppo, Preferito, Obsoleto e In uso. *Codice macchina* e *Codice gruppo* propongono i codici dei fogli Macchine e Gruppi dello stesso file.
- **Sottofamiglia dipendente**: propone solo le sottofamiglie della macrofamiglia scelta sulla riga.
- **Avvisa o blocca come l'import**: un fornitore, una famiglia o un'unità nuovi si possono scrivere (l'import li crea) con un avviso; un concetto o un Sì/No fuori elenco vengono rifiutati.
- **Impostazioni**: Attivo, Ruolo, Tipo delle condizioni offerta, Predefinita.
- I valori stanno nel foglio nascosto **Tendine**, che l'import ignora. Se le tendine non si riescono a scrivere, il file esce come prima.

**Manuale** — cap. 27 «Menu a tendina».

### 0.116.0 — 2026-10-27

**Avvia e dichiara anche sull'ordine di lavoro.** Sulla riga dell'ODL ci sono gli stessi due gesti dell'ordine di produzione, al posto di *spedisci materiale*, *manda al terzista*, *ritira dal terzista* e *registra rientro*, che scrivevano movimenti e basta: niente scarti, niente stato, e i pezzi rientrati da scrivere a mano una seconda volta. **Cambia `supabase/schema.sql`**: va rieseguito nel SQL Editor (aggiunge le colonne `odl_id` e `odl_line_id` a `production_declarations`, non tocca i dati).

- **Un solo padrone per tratta.** Se la riga viene da un ordine di produzione, o dal fabbisogno di un piano che ha un ODP lanciato per quella parte, avvia e dichiara aprono le schede dell'ODP e scrivono sulle sue fasi. Altrimenti la riga ha avvii e rientri suoi.
- **Corretto: il materiale poteva uscire due volte.** Un ODL generato dal fabbisogno teneva i suoi comandi anche quando il piano aveva lanciato un ODP per la stessa parte: avviando la fase sull'ODP e spedendo dall'ODL, il materiale usciva due volte. Ora sulla riga comanda l'ODP, e i rientrati li scrive lui.
- **Presa in carico.** Se la riga del piano era già partita da sola, al lancio dell'ODP i suoi avvii, rientri e movimenti passano all'ODP così come sono: il materiale non viene riproposto e i pezzi tornati restano dichiarati.
- **Dichiara**: pezzi buoni e scarti. Entrambi contano come rientrati e portano l'ODL a *Parziale* ed *Evaso*; i buoni a fine ciclo entrano a magazzino. Il campo *Rientrati* non si scrive più a mano.
- **Le fasi di una tratta dal terzista** partono insieme: la fase dopo si avvia appena è avviata quella prima, e non è chiusa finché la precedente aspetta pezzi. Dalla riga dell'ODL la tratta si dichiara in un colpo. Anche l'ODL generato dall'ODP ora vede i rientri dell'ultima fase della tratta, non solo della prima.
- **Storico «Avvii e rientri»** sotto le righe dell'ODL, con l'annullamento. Una riga avviata non si elimina, e nemmeno l'ordine.
- **In bozza non si avvia**: l'ordine non è ancora arrivato al terzista.
- **«Dichiara tutto rientrato»** (prima «Segna tutto rientrato») e la ricezione dal telefono dichiarano il residuo delle righe avviate: prima segnavano i rientrati senza caricare il magazzino.
- **Gantt dell'Avanzamento**: una fase dal terzista senza ODP è *in lavorazione* appena la riga dell'ODL è avviata.
- I movimenti registrati con i comandi di prima continuano a contare: una riga da cui era già uscito il materiale risulta avviata. Le schede di prima restano solo per le righe di conto lavoro rimaste negli ordini d'acquisto.

**Manuale** — cap. 22 (le fasi di una tratta, la presa in carico), cap. 23 «Avvia e dichiara», cap. 5 e 19.

### 0.115.1 — 2026-10-27

**Eliminare una macchina con i suoi gruppi dice perché non si può.** Una macchina senza movimenti, ordini né documenti, ma con dei gruppi codificati sotto di lei, si fermava con «Articolo già movimentato (magazzino, cicli, documenti o piani)»: il blocco era giusto, perché i codici dei gruppi nascono dalla sigla della macchina, ma il motivo no, e mandava a cercarlo in magazzino. Ora il messaggio nomina i gruppi (e, per un gruppo, i sottogruppi) da eliminare o spostare prima. Nessun cambio a `supabase/schema.sql`.

### 0.115.0 — 2026-10-27

**Il codice articolo si scrive a mano solo per scelta.** Il codice nasce dalle scelte della scheda e di regola resta quello; prima bastava digitare nel campo perché l'app smettesse di generarlo, senza traccia, e un codice cambiato per sbaglio non si distingueva più da un'eccezione voluta (come `RTT-S00` per una macchina di sigla `MAX`). **Cambia `supabase/schema.sql`**: va rieseguito nel SQL Editor (aggiunge a `items` le colonne `code_manual`, `code_manual_by`, `code_manual_at`, `code_note`, non tocca i dati).

- **Spunta «Manuale» accanto al codice**: il campo si legge soltanto; spuntando l'app chiede «Vuoi modificare manualmente il codice?» e lo apre solo con **Sì**. Togliendo la spunta chiede «Ripristinare il codice automatico?». Su un articolo già usato resta tutto bloccato, come prima.
- **L'eccezione resta scritta**: l'articolo ricorda chi l'ha decisa e quando, con un motivo facoltativo. Etichetta **MANUALE** accanto al codice in catalogo, e una riga nella scheda di sola lettura.
- **In modifica il codice segue le scelte**: cambiando famiglia, macchina o gruppo di un articolo non ancora usato, il codice automatico si ricompone; prima restava quello vecchio.
- **Codici fuori codifica**: in *Gestione → Backup → Controllo dati* l'elenco degli articoli il cui codice non segue la codifica e non è segnato manuale (scritti a mano prima di questa versione, o importati), con **È voluto** per confermarli e **Apri** per sistemarli.

- **Anteprima codici nella scheda di macchine e gruppi**: un riquadro sotto la codifica mostra, mentre si compila, i codici dei figli. Per la macchina lo schema con sigla e cifre scelte (`TRN-AAA-S00`, `TRN-AAA-001`, `TRN-AAA-999`); per il gruppo la prima parte e il primo sottogruppo liberi, e quanti figli ha già. Avvisa se il codice del padre è manuale (i figli seguono la sigla) e se cambiando la sigla i figli già creati restano col codice vecchio.

**Manuale** — cap. 8 il campo Codice, cap. 9 «Il codice scritto a mano» e «Anteprima codici».

### 0.114.0 — 2026-10-24

**Il Gantt dell'Avanzamento si legge meglio.** Nessun cambio a `supabase/schema.sql`.

- **Il codice con le fasi sotto**: una parte con ciclo ha una riga di testa (codice, barra di tutto il ciclo, stato complessivo) e sotto, rientrati, il materiale del ciclo e le sue fasi: «fase 10», «fase 20»… al posto del codice ripetuto. Nella colonna *Tappa* la lavorazione e chi la fa («Tornitura · interna», «Zincatura · Beta Srl»).
- **Stati con le parole di ogni riga**: montaggio *programmato / in corso / fatto*; acquisto *da ordinare / ordinato / arrivato / da magazzino*; fase *da programmare / programmato / in lavorazione / fatto* (programmata quando c'è l'ODP per una fase interna, l'ordine di lavoro per una dal terzista); codice con ciclo *da fare / in lavorazione / in attesa / fatto* (fatto quando l'ultima fase è dichiarata e la parte è a magazzino). I colori dicono il punto a cui si è: giallo da cominciare, viola programmato o ordinato, blu in lavorazione, verde finito.
- **Il ritardo a parte**: non è più uno stato, ma una nota rossa **+N gg** accanto, con la barra rossa fino a oggi o all'arrivo atteso. Una tappa chiusa con meno pezzi è *fatto* con la nota rossa **-N pz**.
- **Barre più alte** (28 px la riga, 20 il programma, 10 l'avanzamento) e la linea di oggi scura, per non confonderla col blu di «in lavorazione».
- **Il riquadro sulle barre** è più grande (14 px) e dice anche stato, quantità e ritardo; prima era il suggerimento del browser, che non si può ingrandire.
- **Percorso critico con l'orologio** accanto al codice, invece del codice in rosso: il rosso ora è solo del ritardo.
- **Export**: la riga di testa di ogni codice con ciclo, e due colonne nuove, *Ritardo (gg)* e *Pezzi mancanti*.

**Manuale** — cap. «L'avanzamento»: il codice con le fasi, i nuovi stati e i loro colori, il ritardo.
### 0.113.0 — 2026-10-23

**L'invio al terzista è fatto quando parte il materiale, non quando esce l'ordine di lavoro.** L'ODL si emette prima, per avvisare il terzista in tempo, ma il programma del piano segnava «fatto» l'invio appena esisteva un ODL, anche in bozza: la voce spariva dal calendario del Riepilogo e una scadenza mancata non avvisava più. **Cambia `supabase/schema.sql`**: va rieseguito nel SQL Editor (aggiunge la colonna `start_date` a `work_order_lines`, non tocca i dati).

- **Tre stati per la tratta**, nel *Programma* del piano e sulla riga dell'ODL: *da inviare* finché il materiale non parte (con l'ODL emesso la voce resta, con il suo numero, e oltre la data è in ritardo); *in lavorazione* con l'uscita registrata dalla riga dell'ODL o con **Avvia** sulla fase dell'ordine di produzione; *fatto* quando i pezzi sono rientrati, o con **Dichiara** che chiude la tratta.
- **Inizio lavoro sulla riga dell'ODL**: il giorno in cui consegniamo il materiale. Si compila da solo con la data d'invio della tratta (dal piano, dall'ordine di produzione, o a mano dal ciclo), si corregge, ed esce nel PDF e nell'Excel accanto alla consegna. Se c'è, il programma usa quella.
- **Riepilogo**: «Inviare al terzista» resta in calendario fino all'uscita del materiale; da lì si segue il rientro.

**Manuale** — cap. 5 calendario delle scadenze, cap. 19 «Il programma», cap. 23 «Emettere l'ODL non è inviare».

### 0.112.2 — 2026-10-23

**Un codice lasciato da un articolo rinominato si può riusare subito.** Con l'archivio condiviso, dare un codice a un articolo lo impegna sul server per un'ora, il tempo che l'articolo arrivi. Se nel frattempo l'articolo veniva rinominato, l'impegno sul codice vecchio restava: per un'ora nessuno poteva darlo a un altro articolo, nemmeno chi l'aveva appena lasciato, e l'app diceva «l'ha appena preso un collega» per un codice che non aveva più nessuno. **Cambia `supabase/schema.sql`**: va rieseguito nel SQL Editor (cambia solo la funzione `impegna_codici`, non tocca i dati).

- **Sul server**: un impegno fatto per un articolo che porta ormai un altro codice non vale più, e il codice si dà a chi lo chiede. Sistema anche gli impegni già rimasti appesi.
- **Nell'app**: rinominando un articolo il codice vecchio si restituisce subito, anche quando l'articolo non è ancora arrivato al server.

### 0.112.1 — 2026-10-23

**Lo storico delle modifiche si legge senza codici interni.** Cambiando il prezzo in uso di un articolo, lo storico mostrava «Prezzo in uso: 72eb3495-1803-…», cioè l'id della riga di listino, e accanto campi tecnici come «priceListSeeded: true → (vuoto)» o «unitCost». Nessun cambio a `supabase/schema.sql`.

- **Prezzo in uso**: si legge come fornitore, prezzo e data della quotazione («TORNITORE SRL · 102,00 € · 22/10/2026»). L'etichetta si fissa al salvataggio, così resta leggibile anche se la riga viene tolta dal listino; le voci già registrate si risolvono nel listino di adesso, o dicono «quotazione non più a listino».
- **Flag interni** (`priceListSeeded`, `mpFamiliesSeeded`, `partFamiliesSeeded`): non si annotano più, e nelle voci vecchie non si mostrano. Comparivano a ogni download dall'archivio condiviso, che non li conserva.
- **Nomi in italiano** per i campi che uscivano col nome dei dati: costo unitario, prezzo d'acquisto, sottofamiglia, scorta di sicurezza, lotto, approvvigionamento, conferma fornitore, indirizzo dei fornitori, impostazioni e altri.
- **Valori leggibili**: sì/no al posto di true/false, «produzione interna»/«acquisto», il tipo di lotto; sottofamiglia, concetto, macchina, gruppo, richiesta d'offerta, ordine di produzione e documento d'archivio col loro nome. Un riferimento a un record eliminato dice «(record eliminato)» invece dell'id.

**Manuale** — cap. «Storico delle modifiche»: come si legge il prezzo in uso.

### 0.112.0 — 2026-10-23

**I documenti emessi restano in archivio.** Il PDF di richieste d'offerta, ordini d'acquisto e ordini di lavoro si scaricava e da lì l'app lo perdeva di vista: ognuno lo teneva dove capitava, e nessun collega sapeva quale copia fosse partita. Ora, quando il documento si segna come inviato, il PDF viene scritto anche nella cartella d'archivio degli allegati, sotto `Documenti Bomtrack/<RFQ|ODA|ODL>/<anno>/`, e si ritrova dalla scheda del documento. I file non passano da Supabase: il database ne tiene il percorso, come per gli allegati. **Cambia `supabase/schema.sql`**: va rieseguito nel SQL Editor (aggiunge la tabella `generated_docs`, non tocca i dati).

**Quando si archivia**
- **«Segna come inviato»** dopo la generazione del PDF scrive la copia in archivio. Le bozze di controllo non si archiviano.
- **Documento cambiato dopo l'invio**: rigenerando il PDF l'app propone di archiviarlo come **revisione** (`_r1`, `_r2`…). Una ristampa del documento non cambiato non chiede niente.
- **Documento inviato prima di questa versione**: rigenerato, propone la sua prima copia.
- **Mai sovrascrivere**: una copia emessa non si rimpiazza, e un nome già presente in cartella resta di chi l'ha (si usa il primo libero, `… (2).pdf`).
- **Il download resta sempre.** Senza cartella su quel PC, con Firefox o Safari, o per chi non modifica i documenti, il PDF si scarica come prima e la scheda dice perché non è archiviato. L'Excel resta un file di lavoro.

**Nella scheda**
- **Copie in archivio**, sotto i pulsanti di generazione: le copie dalla più recente, con chi le ha emesse e il pulsante per aprirle; **Archivia il PDF** / **Archivia come nuova revisione** archivia senza scaricare.

**Documento eliminato**: le sue copie si cancellano con lui, file e record, così il documento rifatto con lo stesso numero e fornitore riprende il nome pulito. L'avviso di eliminazione lo dice; ripristinando dal cestino le copie non tornano. Un PDF che non si può cancellare (cartella non impostata su quel PC) resta in *Gestione → Backup* fra le «Copie di documenti eliminati», da aprire o cancellare.

**Allegati dei codici: il PDF si cancella con il documento.** Scollegare un allegato dall'**ultimo** codice che lo cita cancella anche il PDF dalla cartella d'archivio; se altri codici lo citano, il file resta (cancellarlo romperebbe il loro allegato), e l'avviso lo dice in entrambi i casi. Anche **Elimina** in *Gestione → Backup* cancella il file, non solo la voce dell'elenco. Senza cartella su quel PC il documento resta in Gestione, senza codici, da eliminare dopo.

**Verifica archivio** (*Gestione → Backup*) controlla anche le copie emesse: quelle che non si trovano più e quelle diverse dall'impronta SHA-256 registrata, cioè sostituite o modificate fuori da Bomtrack. I PDF di `Documenti Bomtrack` non compaiono fra quelli da collegare a un codice.

**Pronto per l'invio mail.** Ogni copia registra già quando è partita e come (`sent_at`, `sent_via`, `sent_to`): oggi `manuale`, domani la mail che parte dall'app allegherà esattamente il PDF archiviato.

**Export del fabbisogno completo.** L'Excel e il PDF di un piano portavano solo codice, quantità e prezzo: mancavano la testata (consegna, commessa, note), le righe a piano con la data fattibile e il margine, le date d'ordine, le note delle righe, l'avanzamento delle parti, le parti prese dal magazzino e gli assiemi da montare. Ora escono tutti: l'Excel ha in più i fogli *Piano*, *Dal magazzino* e *Da montare*, colonne *Serve per*, *Ordinare entro*, *Note* (e nel netto *Scorta minima* e *Libero*), i totali di conto lavoro e produzione; il PDF passa in orizzontale con le stesse sezioni della scheda. I dati si raccolgono in `mrpExportData`, con gli stessi conti della scheda. Verifica: `test/export-mrp.test.js`.

**Manuale** — cap. 28: «Le copie in archivio»; cap. 8: i documenti emessi nella cartella d'archivio; appendice: la collezione `generatedDocs` e `documenti.js`.

**Verifica**
- `test/documenti.test.js`: copia scritta al «segna come inviato» con percorso, revisione e impronta; nessuna copia su «resta in bozza»; ristampa senza domanda; revisione dopo una modifica senza toccare la prima; prima copia di un documento già inviato; «Archivia» senza download; nome già preso non sovrascritto; senza cartella, su browser senza cartelle e senza permessi il PDF resta un download; sezione in scheda; apertura; verifica di copie mancanti e alterate; cartella esclusa dagli allegati; migrazione della collezione; documento eliminato con avviso e copie cancellate, nome pulito al documento rifatto, copie non cancellabili elencate e cancellate da Gestione, PDF già sparito.
- `test/archivio.test.js`: il PDF si cancella scollegandolo dall'ultimo codice e con «Elimina»; resta se un altro codice lo cita o se la cartella non è impostata.
- `test/schema-sql.test.js` (anche in Postgres): la tabella `generated_docs` dice le stesse cose del codice e fa il giro completo.
- Suite completa verde.

### 0.111.1 — 2026-10-23

**Su GitHub solo il codice.** Il repository è pubblico, e il lavoro notturno `supabase-veglia` poteva salvare fra i suoi artifact una copia del database, utenti e hash delle password compresi: cifrata, ma scaricabile da chiunque avesse un account GitHub, e protetta soltanto dalla frase segreta. Ora l'archivio e gli utenti non passano più da GitHub. Nessun cambio a `supabase/schema.sql`.

- **Il lavoro notturno tiene solo sveglio Supabase**: chiede se il servizio risponde, non legge dati e non salva niente. Non usa più i segreti `SUPABASE_DB_URL` e `BACKUP_PASSPHRASE`, che vanno **eliminati** da *Settings → Secrets and variables → Actions*: il primo porta la password del database.
- **La copia intera del database** (`supabase/backup.sh`, utenti compresi) si fa dal proprio PC, e si tiene con gli altri backup. L'export JSON di *Gestione → Backup* resta la copia di ogni giorno.
- **`.gitignore`** esclude i file di backup (`bomtrack_backup_*.json`, `bomtrack_prima_di_*.json`, `*.sql.gz`, `*.gpg`), così non finiscono nel repository per sbaglio.

**Manuale** — cap. 31: «Supabase sveglio ogni notte» e «Una copia intera del database, dal tuo PC» al posto di «Supabase sveglio e una copia ogni notte».
### 0.111.0 — 2026-10-22

**Le date degli ordini già emessi si vedono nel programma.** Spostare la data di consegna di un ordine collegato a un fabbisogno cambiava la data fattibile e il margine, ma il Gantt, la lista d'acquisto e il Programma del piano non lo dicevano, e un ordine scaduto contava come materiale pronto oggi. Le date a ritroso (ordinare entro, invio, lancio) e gli ordini di produzione e di lavoro già emessi non cambiano, come prima. Nessun cambio a `supabase/schema.sql`.

**Data fattibile**
- **Ordine scaduto**: una riga d'ordine con la data passata e la merce non ricevuta non vale più «pronto oggi», ma il prossimo giorno lavorativo. Il percorso critico dice quale ordine è scaduto e quando era atteso.
- **Arrivo in un giorno di chiusura**: la data confermata (o chiesta) di un ordine che cade di sabato, domenica o in un festivo si riceve il primo giorno lavorativo dopo, come già gli arrivi calcolati dal listino.

**Gantt del piano**
- **Linea della data fattibile**, verde, arancione se viene dopo la consegna richiesta: entrava nella scala ma non si vedeva.
- **Rombo dell'arrivo atteso** sulle righe d'acquisto già ordinate: rosso se arriva dopo il giorno in cui il materiale serve, o se l'ordine è scaduto. Il suggerimento della barra lo dice a parole.

**Fabbisogno e Programma**
- **Da acquistare**: due indicatori nuovi. *Arriva il …* quando l'articolo è già ordinato ma l'ordine arriva dopo il giorno in cui serve: la riga risultava «coperta» senza altro avviso. *Ordine scaduto* quando un ordine di quell'articolo ha la data passata senza ricevimento. Lo stesso conto della copertura di commessa.
- **Programma**: nuova voce **Arrivo dal fornitore** per le righe ancora da ricevere degli ordini del piano, alla data confermata (o chiesta); in ritardo se viene dopo il giorno in cui il materiale serve o se è scaduta. Prima, emesso l'ordine, l'acquisto era «fatto» e dall'agenda non si capiva più quando arrivava.

**Avanzamento**
- **Il materiale del ciclo viene prima delle fasi** della sua parte: il tondo, poi la tornitura e la zincatura. Prima le righe seguivano l'albero (la parte, poi i suoi figli) e il materiale finiva sotto l'ultima fase. L'export segue lo stesso ordine.

**Manuale** — cap. 19: data fattibile, Programma, Gantt, Avanzamento e indicatori di *Da acquistare*.

**Verifica**
- `test/schedulazione.test.js`: ordine scaduto pronto il giorno lavorativo dopo, con la data fattibile e il percorso critico; arrivo di sabato ricevuto il lunedì; arrivo in tempo non segnalato; indicatore «arriva il» nel fabbisogno; voce d'arrivo nel Programma, in tempo, tardiva e scaduta; linea della data fattibile e rombo dell'arrivo nel Gantt.
- `test/avanzamento.test.js`: il materiale del ciclo prima delle fasi della parte.
- Suite completa verde.

### 0.110.0 — 2026-10-22

**La settimana è di cinque giorni anche per fornitori e terzisti.** Il calendario di fabbrica (lunedì–venerdì, festivi nazionali, Pasquetta, chiusure) valeva per le fasi interne e i montaggi, ma i giorni dei fornitori si contavano di calendario: un listino a «10 gg» faceva arrivare il materiale dieci giorni dopo, sabati e domeniche compresi, e le date d'ordine risultavano più tarde del dovuto. Nessun cambio a `supabase/schema.sql`; i dati salvati restano come sono, cambia come si contano.

**Giorni lavorativi**
- **Giorni di consegna a listino, attraversamento e trasporto del terzista** si contano di serie in giorni **lavorativi** del calendario di fabbrica: «ordinare entro», «invio» delle tratte di conto lavoro e il lancio delle parti si anticipano di conseguenza. Un archivio di prima, che non ha la scelta, vale lavorativi.
- **Nuova impostazione** in *Gestione → Impostazioni → Calendario di fabbrica*: **Giorni di consegna di fornitori e terzisti**, *Lavorativi* (di serie) o *Di calendario*, per chi ha fornitori che dichiarano giorni pieni. Con *Di calendario* i conti tornano quelli della 0.109.
- **Arrivi previsti in un giorno di chiusura** (programma in avanti e data fattibile del piano, consegna proposta dal riordino sotto scorta): si spostano al primo giorno lavorativo dopo, in tutti e due i modi. Le date d'ordine e d'invio restano sempre in un giorno lavorativo.
- **Ritardi confermati dai fornitori** (riga e testata di ordini e ordini di lavoro, Riepilogo) e **consegne scadute** del Cruscotto si contano nella stessa unità dei giorni dei fornitori, e lo dicono: «3 giorni lavorativi di ritardo», «gg lav.». Nel Cruscotto il ritardo diventa rosso oltre due settimane: 10 giorni lavorativi (14 di calendario).
- **Soglia «da ordinare»** del fabbisogno e degli avvisi del Riepilogo: 5 giorni **lavorativi** (era 7 di calendario, che il venerdì voleva dire tre giorni di lavoro).
- **Ordine di lavoro da un ordine di produzione senza date pianificate**: la data entro cui emetterlo usa la stessa regola delle tratte del fabbisogno; prima era la data dell'ordine meno i giorni, anche se cadeva di domenica.
- Il foglio istruzioni dell'import del catalogo dice in che giorni si scrive «GG consegna».

**Manuale** — cap. 19 (le regole e l'esempio della programmazione a ritroso, con i giorni dei fornitori), Riepilogo, listino, ordini, Cruscotto e Calendario di fabbrica aggiornati.

### 0.109.1 — 2026-10-22

**Note, avvisi e suggerimenti allineati a quello che l'app fa oggi.** Una rilettura di tutti i testi a schermo (messaggi, conferme, suggerimenti dei campi, testi delle pagine vuote, note sotto le tabelle), del README e del manuale, confrontati con il codice. Nessun comportamento cambia, solo le parole. Nessun cambio a `supabase/schema.sql`.

**Testi che dicevano il contrario di quello che succede**
- **Avanzamento di una parte nel piano.** La scheda diceva che dichiarare pezzi fatti «non muove il magazzino»: dalla 0.105.5 la parte entra a magazzino con un versamento, ed eliminando la dichiarazione esce. Ora lo dice. Lo stesso nel README.
- **Genera ordini dal fabbisogno.** La nota diceva che le righe nascono «col prezzo in uso nella costificazione»: prendono invece il prezzo che il listino di quel fornitore dà oggi, e un articolo che il fornitore non ha a listino nasce senza prezzo. Il manuale (cap. 4.5) ora lo dice.
- **Listino di una parte.** Aprendo il listino di un articolo che non ne ha, il messaggio diceva che il listino vale «solo per commerciali e materie prime»: vale anche per le parti.
- **Carico centri, nel README.** Diceva che le ore stanno nella settimana in cui il pezzo serve pronto e che non c'è calendario: dalla 0.88.0 stanno nella settimana in cui la fase comincia, programmata a ritroso sul calendario di fabbrica, come già dicevano l'app e il manuale.
- **README e archivio condiviso.** Diceva «nessun server, nessun Supabase» e che la protezione dei ruoli «arriverà»: l'archivio condiviso c'è dalla 0.103.0. Aggiornati anche la nota sulla sicurezza, la descrizione di `cloud-map.js` (con una riga per `cloud.js`, che mancava) e le note finali.

**Testi incompleti**
- **Ordini di lavoro e di produzione vuoti.** Dicevano che si generano solo dal Fabbisogno: un ordine di lavoro nasce anche da un ordine di produzione o si scrive a mano, un ordine di produzione si scrive anche a mano. Lo stesso per l'elenco vuoto degli ordini a fornitore, che si generano anche dal Fabbisogno e dal riordino del Magazzino.
- **Riga «conto lavoro» su un ordine.** Il suggerimento diceva «generata dal fabbisogno» e che il rientro si registra come movimento: la riga può venire anche da un ordine di produzione o essere scritta a mano, e in quel caso i pezzi li dichiara l'ordine di produzione.
- **Da far lavorare fuori.** Le fasi «entrano nelle richieste e negli ordini come le righe d'acquisto»: entrano nelle richieste d'offerta e negli **ordini di lavoro**, non negli ordini d'acquisto.
- **Gestione → Condizioni offerta e Dati azienda.** Parlavano solo delle richieste d'offerta: le condizioni si propongono anche su ordini e ordini di lavoro (la ★ vale se il fornitore non ha un suo predefinito), e i dati azienda si stampano su tutti i documenti. Il manuale (cap. 25) dice lo stesso.
- **Cestino.** Con l'archivio condiviso le voci scadute non spariscono «al caricamento successivo»: le toglie il server, al più una volta al giorno (0.106.0). Il testo ora distingue i due casi.
- **Scheda articolo.** «Distinta base → Gestione DB» diventa «Tecnico → Gestione DB», il nome del menu dalla 0.91.0.
- **Gestione → Backup.** «Azzera tutto» diceva di esportare prima un backup: dalla 0.105.6 la copia la salva l'app da sola, e il testo ora dice dove. Il backup locale dice che anche l'import salva prima una copia e, con l'archivio condiviso, che import, dati di esempio e azzeramento sono bloccati mentre l'export serve ancora.
- **Gestione → Import.** L'elenco dei fogli delle impostazioni non nominava **Clienti**, che il file contiene.
- **Allegati.** Con la cartella non impostata il messaggio rimandava ad «Allegati → Archivio», che non esiste: la cartella si sceglie dalla scheda Allegati o da Gestione → Backup.
- **Risparmio sotto «Da acquistare».** La riga in fondo alla lista d'acquisto del piano diceva «scegliendo ovunque la quotazione più bassa a listino»: dalla 0.109.0 il risparmio conta solo gli altri fornitori, contro il listino di oggi di quello in uso. Ora dice «passando, dove conviene, a un altro fornitore che a listino quota meno».
- **Primo collegamento all'archivio condiviso.** Gli utenti rimasti fuori si invitano da Gestione → Utenti (0.105.0): il testo e il messaggio finale ora lo dicono.

**Lasciati come sono**
- I testi di listino, storico delle quotazioni e risparmio (Riepilogo, fabbisogno, scheda articolo) e il colore delle etichette dei sottogruppi: li hanno riscritti la 0.109.0 e la 0.108.1.
- Le citazioni dei vecchi gruppi del menu nel README, già dichiarate come tali.

**Verifica**
- `test/testi.test.js` (nuovo): la scheda dell'avanzamento dice che la parte entra a magazzino e ce la mette; la nota di Genera ordini non promette il prezzo della costificazione; il listino di una parte si apre; i testi degli elenchi vuoti, del conto lavoro, del cestino, del backup, dell'import, degli allegati e del README non tornano alle frasi di prima.
- Suite completa verde.

### 0.109.0 — 2026-10-22

**Un fornitore ha un solo prezzo valido, il più recente. Il «Risparmio possibile» del Riepilogo diventa «Prezzi da rivedere a listino» e dice di quali articoli parla.**

**Listino**
- **Una quotazione valida per fornitore.** Fra le quotazioni dello stesso fornitore vale quella con la data più recente. Le precedenti vanno nello **Storico**, in fondo al listino dell'articolo: in sola lettura (si possono solo eliminare), fuori dai confronti, non più selezionabili come prezzo in uso. Una riga nuova ancora senza prezzo non sostituisce niente. Ordini e richieste usavano già la quotazione più recente del fornitore; ora la usa anche la costificazione nei confronti.
- **Prezzo in uso sostituito.** Se il prezzo in uso viene da una quotazione sostituita, il listino lo dice con il prezzo nuovo e il pulsante **✓ Usa la nuova**. Il costo non cambia da solo.
- La ↓ «quotazione più bassa» compare solo se ci sono almeno due quotazioni valide da confrontare. La vista *Listino fornitori* segna le quotazioni *storico*, ha il filtro *Senza lo storico* e la colonna *Storico* nell'export.

**Riepilogo**
- **Prima** l'avviso diceva solo «su N articoli il listino contiene una quotazione più bassa: X € per unità, sommati». Non nominava né gli articoli né i fornitori, e il totale sommava prezzi unitari di articoli diversi (un €/m più un €/pz): un numero che non era il risparmio di niente.
- **Ora** è una tabella: per ogni articolo il prezzo in uso e il suo fornitore (o «prezzo scritto a mano»), l'altro fornitore più conveniente con prezzo e data, il risparmio per unità di misura e in percentuale. Elenca anche i prezzi in uso sostituiti da un listino più recente dello stesso fornitore (*da aggiornare*). **Un clic sulla riga apre il listino dell'articolo**, e alla chiusura il riquadro si aggiorna.
- **Il confronto è giusto**: solo con fornitori diversi da quello in uso, contro il suo listino di oggi. Un fornitore solo non dà mai «risparmio». Gli articoli obsoleti non vengono più segnalati.

**Fabbisogno e scheda articolo**
- Il `↓ risparmio` del fabbisogno e la «Miglior quotazione» della scheda articolo seguono la stessa regola. Il suggerimento del `↓` non chiama più «per unità» un importo che è sulla quantità da ordinare. La scheda articolo segna le quotazioni *storico* e mostra il «Listino più recente» quando il prezzo in uso è stato sostituito.
- Nessun cambio a `supabase/schema.sql`.

**Verifica**
- `test/pricelist.test.js`: la quotazione vecchia dello stesso fornitore va nello storico e non è più la più bassa; il risparmio si confronta con un altro fornitore sul listino nuovo; un fornitore solo non dà risparmio; il prezzo in uso sostituito si segnala e il listino propone la nuova; la sostituita non si può mettere in uso; una riga senza prezzo non sostituisce quella quotata.
- `test/ui.test.js`: l'avviso nomina articolo e fornitori e apre il listino; ordine per risparmio percentuale; obsoleti esclusi; prezzo scritto a mano riconosciuto; niente più somma di prezzi unitari.
- `test/uom.test.js`: il confronto fra unità diverse ora usa due fornitori diversi, come vuole la regola.

### 0.108.1 — 2026-10-22

**Sottogruppi in giallo.** L'etichetta `SGR` dei sottogruppi era verde come quella `GRP` dei gruppi, e nelle liste i due tipi si confondevano. Ora i sottogruppi sono gialli, i gruppi restano verdi; il cambio vale ovunque compaia l'etichetta del tipo (elenchi, ricerche, distinta, scheda articolo, ispettore). Il giallo è un token nuovo, `--yellow`, in tutte e due le palette: acceso sul tema scuro (#E5CC4F, 10,7:1 sulla scheda), scurito su quello chiaro e in stampa (#7A6A00, 5,4:1 sul bianco), distinto dall'ambra dei materiali. Nessun cambio a `supabase/schema.sql`.

**Verifica**
- `test/theme.test.js`: `--yellow` è fra i colori che si leggono e regge la soglia di 4,5:1 sulla scheda, in tutti e due i temi.

### 0.108.0 — 2026-10-22

**Da una richiesta di offerta si sceglie quali prezzi registrare a listino, con la data di oggi.**

- **Scelta delle righe.** Con più prezzi da registrare, **Registra a listino** apre l'elenco delle righe, tutte spuntate, con il prezzo nuovo (e quello vecchio, se la quotazione c'è già e si aggiorna). Si registrano solo quelle lasciate spuntate; le altre restano da registrare. Con un prezzo solo si registra subito, come prima.
- **Data della quotazione.** Una quotazione nata da una richiesta prende la data del giorno in cui entra a listino, non più la data della richiesta: l'offerta arriva di solito dopo. Una quotazione già registrata che si aggiorna per un prezzo corretto tiene la sua data.
- Nessun cambio a `supabase/schema.sql`.

**Verifica**
- `test/pricelist.test.js`: la data è quella di registrazione; si registrano solo le righe scelte e le altre restano candidate; con una riga il pulsante registra subito, con più righe chiede prima.

### 0.107.0 — 2026-10-22

**Supabase sveglio e una copia ogni notte.** Il piano gratuito di Supabase sospende il progetto dopo 7 giorni senza uso (la chiusura di agosto basta) e non fa backup. Un nuovo lavoro notturno su GitHub, `supabase-veglia`, tocca il progetto una volta al giorno e ne salva una copia **cifrata** fra gli artifact del workflow, per 30 giorni. Si attiva impostando quattro segreti nel repository (manuale, cap. 31, «Supabase sveglio e una copia ogni notte»); senza, non fa niente e lo dice. La copia contiene i dati di Bomtrack e gli utenti di Supabase Auth, e si rimette in un progetto nuovo con `supabase/ripristino.sh`. Nessun cambio a `supabase/schema.sql`.

**Quantità con la virgola.** Le quantità a schermo, nei messaggi e nei PDF si scrivono all'italiana, come gli importi: «1,5 kg» invece di «1.5 kg». I campi in cui si scrive un numero e i fogli Excel non cambiano.

**Pulizia del codice**
- Richiesta d'offerta, ordine e ordine di lavoro condividono testata, barra dei documenti, testata del PDF e del foglio Excel: una correzione su uno vale per tutti e tre. PDF ed Excel escono identici a prima. A schermo cambia solo il suggerimento nei campi trasporto e pagamento, ora lo stesso sui tre documenti.
- `docs/analisi-tecnica.md` e `docs/sostenibilita-free-tier.md` non dicono più che il backend non esiste; chiuse C1, C3 e C5.

**Verifica**
- `test/backup-cloud.test.js`: contro un Postgres vero, un archivio completo esce cifrato (nessun codice leggibile nel file), rientra in un progetto nuovo identico tabella per tabella, autori e versioni compresi, e con la frase sbagliata non entra niente; il workflow carica solo il file cifrato e senza segreti non fallisce.
- `test/uom-labels.test.js`: «1,5 kg», e nessuna vista torna a usare la quantità col punto.
- `test/nav.test.js`: il foglio stampato dice quale documento è, e l'intestazione è pronta prima della stampa.
- `test/anagrafiche-minori.test.js`: trasporto e pagamento, dati azienda, concetti, centri di lavoro.
- `test/pwa.test.js`: la versione in cima a questo file è quella dell'app, della cache e del manuale.
- Suite completa verde, con Postgres.

### 0.106.1 — 2026-10-20

**Con l'archivio condiviso, l'ultima riga tolta da un ciclo tornava dopo pochi secondi.** Svuotando la distinta parte e il ciclo di una parte (l'ultimo materiale o l'ultima fase rimasti), al giro successivo la riga ricompariva. Le righe di ciclo e di distinta si riscrivono in blocco per articolo, ma il server rifà l'insieme solo delle tabelle che l'invio nomina: un insieme rimasto vuoto non produceva righe, la tabella non partiva, e sul server restavano quelle di prima, che il pull riportava indietro. Ora un insieme vuoto parte vuoto. Lo stesso valeva per distinta e lavorazioni di un gruppo o di una macchina svuotate del tutto. Nessun cambio a `supabase/schema.sql`.

**Verifica**
- `test/cloud.test.js`: un ciclo svuotato parte come insieme vuoto; contro il Supabase finto con Postgres vero, tolto l'ultimo materiale e poi l'ultima fase, il server ha il ciclo vuoto, il pull non lo riporta e il collega lo riceve vuoto.

### 0.106.0 — 2026-10-19

**Con l'archivio condiviso, cestino e lapidi li pulisce il server.** **Va rieseguito `supabase/schema.sql`** (manuale, cap. 31); finché non lo si fa l'app funziona come prima, ma il cestino sul server non si svuota. La funzione `bomtrack-utenti` non cambia.

- **Il cestino non si pota più su ogni PC.** Fino alla 0.105.9 ogni PC, all'apertura, toglieva le voci oltre i 30 giorni contando con il proprio orologio, e mandava la cancellazione a tutti: un PC con la data avanti svuotava il cestino dei colleghi prima del tempo, e un ruolo che non scrive il cestino si vedeva rifiutare quell'invio a ogni apertura. Ora lo fa `pulizia_archivio()` sul server, con la sua ora, al più una volta ogni 20 ore: la chiede l'app dopo un giro riuscito, e le voci tolte spariscono da tutti i PC nello stesso giro. Senza archivio condiviso non cambia niente.
- **Il registro delle cancellazioni non cresce per sempre.** Le lapidi oltre i 90 giorni si tolgono. Un PC rimasto spento più a lungo non le ha ricevute: alla riaccensione `pull_changes()` gli dice di riscaricare l'archivio intero, e l'app lo fa da sé (dopo aver mandato le modifiche in coda) con un avviso. Prima avrebbe tenuto per sempre i record eliminati dai colleghi.
- `docs/analisi-tecnica.md`: chiuse D5, D7 e D8, che risultavano ancora aperte.

**Verifica**
- `test/cloud.test.js`: contro il Supabase finto con Postgres vero, il PC non pota da sé e riaprirlo non manda cancellazioni, un giro chiede la pulizia e il server la fa una volta sola, la voce tolta sparisce dagli altri PC, le lapidi vecchie si tolgono, un PC fermo da prima del taglio riscarica tutto, uno aggiornato no.
- `test/schema-sql.test.js`: la finestra del server è `TRASH_DAYS`; la pulizia la chiede un lettore, non un profilo sospeso.

### 0.105.9 — 2026-10-19

**Librerie PDF aggiornate.** jsPDF passa dalla 2.5.1 alla 4.2.1 e il suo modulo delle tabelle (autotable) dalla 3.8.2 alla 5.0.8. La 2.5.1 aveva dodici vulnerabilità pubblicate, fra cui blocchi del browser con espressioni o immagini costruite apposta e iniezione di oggetti dentro il PDF; la 4.2.1 non ne ha di note. I PDF escono uguali a prima: richieste d'offerta, ordini, fabbisogno, distinta, elenchi ed etichette QR, generati con le librerie vecchie e nuove e confrontati pagina per pagina, differiscono solo per l'ora di stampa. Le impronte dei file nuovi sono in `vendor/LEGGIMI.md`. Nessun cambio a `supabase/schema.sql`.

**Verifica**
- Suite completa verde; confronto rasterizzato dei PDF in Chromium con jsPDF 2.5.1 e 4.2.1.

### 0.105.8 — 2026-10-19

**Ordini di lavoro doppi fra fabbisogno e ordine di produzione.** Un ordine di lavoro generato dal piano prima dell'ordine di produzione porta le fasi del piano, non il legame con la fase dell'ODP: l'ODP nato dopo non lo vedeva e offriva **genera ordine di lavoro** sulla stessa tratta, cioè un secondo ordine allo stesso terzista per gli stessi pezzi. Ora la tratta risulta già commissionata e la fase mostra il numero di quell'ordine. La regola: un ordine di lavoro del piano, non annullato, copre la tratta del **primo** ODP dello stesso piano che ha quella fase; un ODP rilanciato dopo per i pezzi mancanti resta libero di commissionare i suoi. Il senso opposto (ODL dall'ODP, poi dal piano) era già bloccato. Nessun cambio a `supabase/schema.sql`.

**Verifica**
- `test/odp.test.js`: la tratta commissionata dal piano non si rigenera dall'ODP, l'ODP rilanciato commissiona i suoi, il senso opposto resta bloccato.

### 0.105.7 — 2026-10-19

**Distinte: un articolo già presente non fa una seconda riga.** Aggiungendo a una distinta base, dal pannello *+ Aggiungi componenti*, un articolo che c'era già, nasceva una seconda riga dello stesso codice: due voci da tenere allineate a mano, e chi correggeva la quantità ne vedeva una sola. Ora la quantità inserita si somma a quella della riga esistente. Lo stesso nella distinta parte (*+ Articolo*), con un'eccezione: una riga con il costo forzato non si somma, perché quel costo vale per la riga intera e il pezzo in più resterebbe gratis. Nessun cambio a `supabase/schema.sql`.

**Verifica**
- `test/cycles.test.js`: la quantità sommata nella distinta base e nella distinta parte, l'articolo nuovo in fondo, la riga a costo forzato.

### 0.105.6 — 2026-10-19

**I miglioramenti e le segnalazioni minori del controllo generale.** **Con l'archivio condiviso va rieseguito `supabase/schema.sql`** (manuale, cap. 31): numeri unici, autori e versioni li decide ora il server. Se l'archivio contiene già due documenti con lo stesso numero, lo schema lo dice con un avviso e quell'indice si crea rieseguendolo dopo averli corretti (Gestione → Backup → controllo delle serie). La funzione `bomtrack-utenti` non cambia.

**Archivio condiviso**
- **Un rifiuto per permesso non ferma più la coda.** Se il server rifiuta una modifica perché il ruolo non scrive quella tabella, solo quelle modifiche si scartano e tornano come sul server; il resto parte e il PC continua a ricevere. Prima tutta la coda restava ferma.
- **«Scarta solo i rifiutati».** Quando il server rifiuta un invio, dal pannello Archivio condiviso il lotto parte a pezzi: i record rifiutati tornano come sul server e sono elencati, tutto il resto parte. Prima l'unica uscita era «Scarta e riscarica», che buttava tutto il lavoro in attesa.
- **Impostazioni di due amministratori.** Prima di inviare le impostazioni si guardano quelle sul server: le voci cambiate da un collega restano, si scrivono solo quelle cambiate su questo PC.
- **Distinte che non raddoppiano.** Le righe di una distinta arrivate prima del loro articolo rifanno la distinta invece di aggiungersi.
- **Ricevuto stabile.** Un ricevimento già noto, ricevuto di nuovo, non fa più ripartire la riga d'ordine come modificata.
- **Supabase in difficoltà non fa uscire.** Un errore temporaneo del servizio di accesso non chiude più la sessione.
- **«Esci» chiude solo questo PC.**
- **Ordini di lavoro in modifica protetti** dalla ricezione, come richieste e ordini.
- **Le modifiche di un PC con l'orologio sbagliato non si perdono più.** Una modifica fatta sulla versione giusta di un record passa, qualunque sia l'ora del PC: decide la versione, non la data. Le righe di distinte, ordini e altri documenti partono se diverse dall'ultimo invio, non se più recenti di un'ora.
- **Un numero, un documento, anche sul server.** L'archivio condiviso rifiuta due documenti con lo stesso numero, e l'app dà a quello appena arrivato un numero nuovo riservato sul server, dicendolo. La rinumerazione dei doppioni non usa più un numero che un collega poteva aver appena preso.
- **Due richieste di numero insieme non danno lo stesso numero.** Il server legge i numeri usati solo quando tocca a lui.
- **Chi ha scritto lo dice il server.** Autore di una modifica, di un documento nuovo, di una voce del cestino e delle impostazioni è l'utente collegato, non quello dichiarato dal PC.
- **Le richieste d'offerta le scrive chi ha i documenti.** La progettazione non le può più cambiare passando dall'API.

**Produzione e fabbisogno**
- **Annullare una dichiarazione rispetta la successione.** Un avanzamento non si annulla più se la fase dopo è già partita: si annullano prima le dichiarazioni della fase dopo.
- **Un avvio sbagliato si annulla.** Finché la fase non ha dichiarazioni, l'avvio ha il suo «Annulla»: sulla prima fase il materiale uscito con lui torna a magazzino.
- **Le fasi che non ricevono pezzi si chiudono da sole**, e l'ordine si completa invece di restare «in corso» con il materiale nel lavoro in corso.
- **L'officina dichiara l'avanzamento delle parti dal piano**, come già il montaggio. Non genera più ordini di lavoro ai terzisti da un ODP: sono documenti con prezzo e fornitore.
- **Lotto e scorta minima delle parti fabbricate.** L'ODP proposto dal piano si arrotonda al lotto di riordino della parte; se lo scaffale è sotto la scorta minima, il piano più urgente che fabbrica la parte lancia anche i pezzi che la ripristinano, una volta sola.
- **Importi nella scheda degli ordini di produzione**: mostravano € 0,00, ora il costo dei pezzi da lanciare.
- **Le bozze d'ordine di altri si vedono nel piano** accanto alla riga d'acquisto, e in «Genera ordini» la riga nasce non spuntata.
- **Data fattibile**: le righe d'ordine in un'altra unità si convertono, e quelle senza data contano come arrivate in tempo.
- **Copertura della commessa**: «documento non ancora inviato» vale solo per bozze e richieste aperte che coprono quello che manca.

**Magazzino, inventario e acquisti**
- **Il confronto delle offerte non premia le offerte incomplete.** Un fornitore che quota una riga su tre aveva il totale più basso e finiva in verde. Ora il più basso si cerca solo fra le offerte complete; le altre dicono «incompleta (1/3)».
- **Il listino del fornitore si propone.** Scelto o cambiato il fornitore di un ordine o di un ordine di lavoro, l'app chiede se applicare il suo listino: di serie alle righe senza prezzo, a quelle con un prezzo diverso solo se lo si chiede.
- **Dal QR si riceve anche una parte.** Accanto a «Ricevi tutto», «Ricevi una parte» elenca le righe aperte con il residuo già scritto.
- **Inventario: il valore delle differenze** usa lo stesso costo del valore di giacenza (prima il costo manuale, quasi sempre vuoto per i commerciali).
- **L'inventario in corso è di chi l'ha cominciato**, e dell'archivio (locale o condiviso) su cui è cominciato.
- **Rettifica giacenza**: una quantità negativa si rifiuta; cambiando tipo il campo si svuota; l'ordine di conto lavoro resta solo sui movimenti di conto lavoro.
- **Esistente negativo**: un filtro e una card nel Magazzino; le giacenze negative non abbassano più il valore del magazzino.
- **Magazzino più veloce**: il numero dei movimenti di ogni riga non scorre più tutto lo storico.

**Catalogo, numerazione e salvataggio**
- **Un articolo che resta in una revisione rilasciata non si elimina più.** Tolto dalla Rev B, un componente era eliminabile e la Rev A diceva «(articolo eliminato)».
- **«Espandi tutto» non si blocca più su un anello** di distinta sotto la radice.
- **Gli anelli di distinta arrivati da un collega si vedono**: dopo ogni ricezione un avviso che resta, coi codici del giro e il pulsante per aprire la distinta.
- **Il codice automatico conta anche i codici scritti in minuscolo o con gli spazi.** Un «mat-acc-002» importato faceva proporre MAT-ACC-002, subito rifiutato.
- **Controllo dati: numeri doppi e buchi nei documenti**, per ogni serie di quest'anno e dell'anno scorso.
- **Archivio illeggibile**: se la copia di soccorso non ci sta, l'avviso lo dice e l'app non salva finché non si scaricano i dati originali come file. Prima diceva che una copia esisteva, e il primo salvataggio la cancellava.
- **Allegati e archivio condiviso**: «Carica file» avverte che il file resta su questo PC; chi apre un allegato che non ha sa che sta sul PC di un collega, e di chi.
- **Una copia di sicurezza prima di Importa JSON, Ripristina dati esempio e Azzera tutto**, nella cartella del backup automatico con un nome che non si sovrascrive, oppure scaricata. Se non riesce, l'app chiede prima di proseguire.
- **Avviso di versione nuova**: le schede aperte mostrano «È disponibile una versione nuova — Ricarica».
- **L'app installata sul telefono non è più bloccata in orizzontale.**

**Interfaccia, ruoli ed export**
- **«Salva» a vuoto non tocca più il documento.** Su una richiesta, un ordine o un ODL senza modifiche lo segnava come modificato anche da chi non può scriverlo, e l'archivio condiviso respingeva il lotto. Una nuova prova chiama ogni comando dell'interfaccia con ogni ruolo e verifica che scriva solo le tabelle che il server gli concede.
- **L'officina non legge più «sola lettura» dove lavora** (Magazzino, Ordini, ODL, ODP). Senza collegamento il messaggio parla del collegamento, non del ruolo.
- **Ctrl+K trova le commesse, e i documenti dal nome del fornitore o del cliente.** Invio premuto subito dopo l'ultimo tasto apre il risultato di quel che è scritto.
- **Riepilogo**: un ordine parziale non resta in ritardo per una riga già arrivata; gli obsoleti non chiedono attenzione per scorta o prezzo; gli avvisi sono ordinati per gravità.
- **Un solo valore di giacenza**: tessera del Magazzino e Cruscotto contano le stesse quantità, positive e di articoli attivi.
- **Gli export seguono le colonne** accese con «Colonne», nello stesso ordine.
- **Excel più sicuro**: un testo che comincia come una formula resta testo.
- **Telefono**: il menu «Esporta» non esce più dallo schermo; le schede lunghe finiscono sopra la barra del browser.
- **«Modifiche non salvate» solo se c'è qualcosa da perdere.**

**Verifica**
- Nuovi: `test/cloud-coda.test.js`, `test/magazzino-acquisti.test.js`, `test/controllo-minori-catalogo.test.js`; prove nuove in `schema-sql`, `cloud`, `odp`, `produzione`, `job-coverage`, `schedulazione`, `plandocs`, `guards` (ogni comando dell'interfaccia con ogni ruolo, confrontato con le aree del server), `export-lists`, `home`, `dashboard`.

### 0.105.5 — 2026-10-19

**Le correzioni di media gravità del controllo generale.** **Con l'archivio condiviso va rieseguito `supabase/schema.sql`** (manuale, cap. 31): la ricezione usa la nuova funzione `pull_istante()`. La funzione `bomtrack-utenti` non cambia.

**Archivio condiviso**
- **Le scritture ancora in corso sul server** non si perdono più: la ricezione successiva riparte dall'inizio della transazione più vecchia ancora aperta, invece che dall'ora esatta. Prima una riga salvata da un collega a cavallo di una ricezione poteva non arrivare mai.
- **Rettifiche e inventario** si calcolano sulla giacenza aggiornata ai movimenti dei colleghi: prima si invia e si riceve, poi si fa il conto.
- **Un giro di sincronizzazione che non porta niente di nuovo** non risalva l'archivio: le righe e le impostazioni uguali restano quelle locali.
- **«L'ultimo della serie»** si ricontrolla dopo aver ricevuto, prima di eliminare: un collega può aver appena creato il successivo.
- **Il foglio Utenti** dell'import non crea colleghi che Supabase non conosce: si invitano da *Gestione → Utenti*.

**Produzione**
- **I pezzi versati dagli ODP** contano fra i fatti del piano, e quelli ancora attesi da un ODP aperto non si rilanciano. Un ODP chiuso con meno pezzi lascia rilanciare i mancanti.
- **Una parte dichiarata fatta sul piano entra a magazzino** con un versamento: il montaggio non la manda più sotto zero.
- **Lo scaffale comune** copre solo la parte non coperta dagli ODP del piano.
- **L'ordine di lavoro da un ODP** chiede alla fase i pezzi attesi, e uno annullato si può sostituire. Nell'Avanzamento una tappa finita con meno pezzi lo dice.

**Fabbisogno e acquisti**
- **Una parte o un assieme in più rami** si programma sul lotto intero, non ramo per ramo.
- **Pezzi interi sugli ordini** nelle unità che si contano (pz, n, set, conf…); sei decimali sulle altre.
- **Schermata, PDF e carico centri del piano** sono al netto dei pezzi già fatti; l'esplosione di un piano si calcola una volta fra un salvataggio e l'altro.
- **«Genera»** ricontrolla le righe dopo aver ottenuto i numeri; **un secondo ordine dalla stessa richiesta** si chiede prima di crearlo; **lo stato scelto a mano** su un ordine non si riscrive per una nota o una data.

**Catalogo e costi**
- **Import del catalogo**: una riga con un errore non applica niente; su un articolo già usato codice, famiglia, codifica e unità restano com'erano, con un avviso. Reimportare dopo aver rinominato una famiglia non ne crea una doppia.
- **L'unità di gestione** non cambia su un articolo già usato.
- **Da «fabbrica» a «compra»** la parte prende il prezzo della quotazione in uso.
- **Il costo forzato** di una riga di distinta parte si chiama *costo riga*; l'export dice il costo unitario vero.
- **Il confronto fra revisioni** vede costo, tempi e terzista delle fasi, il costo forzato e l'approvvigionamento.
- **Un centro di lavoro sospeso** resta scelto sulla lavorazione che lo usa.
- **«Da dove viene il costo»**: quantità e importi giusti anche sotto un sottoassieme usato più volte.

**Numerazione, magazzino, allegati, interfaccia**
- **Codici**: due gruppi con la stessa sigla condividono la serie; un codice scritto a mano non conta come ultimo della serie automatica.
- **Inventario**: tutte le rettifiche si scrivono con un solo salvataggio (prima uno per riga).
- **Copia di un PDF nell'archivio**: il nome libero si verifica sulla cartella vera, e un file comparso nel frattempo non si sovrascrive.
- **Filtri condivisi**: sottofamiglia e gruppo scelti in un'altra vista si applicano subito.
- **Riepilogo**: il calendario si sfoglia senza ricalcolare tutta la pagina.

### 0.105.4 — 2026-10-18

**Le correzioni prioritarie del controllo generale.** **Con l'archivio condiviso va rieseguito `supabase/schema.sql`** (manuale, cap. 31): metà di queste correzioni sta sul server. La funzione `bomtrack-utenti` non cambia.

**Archivio condiviso**
- **Ripristino dal cestino con l'orologio del PC indietro.** Il record ripristinato risultava più vecchio della cancellazione: il server lo respingeva, e al giro dopo spariva di nuovo, fuori anche dal cestino. Ora il ripristino si dichiara al server, che toglie la cancellazione invece di confrontare le date. Vale anche per i record che tornano perché qui sono ancora usati.
- **Archivi grandi.** Lo scaricamento completo (un PC nuovo, un collegamento da capo) arriva una tabella alla volta, a pagine di mille righe, e il primo caricamento parte a pezzi di cinquecento: prima un archivio di qualche anno poteva superare i limiti di tempo e di dimensione di Supabase. Con uno schema non ancora aggiornato lo scaricamento torna al modo di prima.
- **Colleghi invitati prima del primo caricamento** ma assenti dall'archivio del PC che carica: ora compaiono subito in *Gestione → Utenti*, sospesi finché non si dà loro un ruolo. Prima restavano invisibili a quel PC finché il loro profilo non cambiava.
- **La durata della sessione** (Gestione → Accesso) vale anche con l'archivio condiviso, contata dall'ultimo uso come in locale. Prima la sessione di Supabase si rinnovava da sola, e una postazione lasciata aperta restava aperta per sempre.

**Sicurezza**
- **L'officina, anche passando dall'API**, sugli ordini, sugli ordini di lavoro e sugli ODP cambia solo lo stato, e crea solo gli ordini di lavoro che nascono dalle fasi esterne di un ODP. Prima poteva cambiarne fornitore, righe e prezzi, o eliminarli: le regole del server dicevano quali tabelle, non quali colonne.
- **Il cestino condiviso**: una voce la scrive solo chi può scrivere il record che contiene. Prima chiunque poteva mettere nel cestino un articolo inventato, che l'amministratore ripristinando pubblicava a nome suo. Svuotare il cestino resta di tutti.
- **Amministratori**: l'ultimo amministratore attivo non si elimina, nemmeno eliminando il suo utente dal pannello di Supabase; e chi si registra diventa amministratore solo su un archivio senza nessun profilo. Prima bastava che mancasse un amministratore attivo.
- **«Scollega questo PC» dalla schermata d'accesso** chiede email e password di un amministratore dell'archivio condiviso, e dopo sul PC entra, con la prima password, solo l'amministratore che ha scollegato. Prima chiunque passasse dal PC poteva scollegarlo ed entrare da amministratore.

**Ordini di produzione**
- **La tendina dello stato passa dai comandi.** «Annullato» chiede del materiale da rendere come il comando *Annulla*, «Chiuso» chiede conferma, «Lanciato» dalla bozza fa i controlli del lancio. Su un ordine con delle dichiarazioni non si torna a «Bozza», e «Lanciato», «In corso» e «Completato» li dà l'avanzamento delle fasi: scritti a mano riaprivano fasi e materiale sotto movimenti già registrati.
- **«Preleva il resto»**: quando all'avvio della prima fase è uscito meno materiale del previsto, il residuo ora ha il suo comando, nel riquadro *Materiale del ciclo*. Esce come all'avvio, verso lo stesso terzista se la fase è esterna. Prima restava solo un movimento a mano, scollegato dall'ordine.

**Verifica**
- `test/schema-sql.test.js`: il ripristino dichiarato, l'officina sulle colonne, il caricamento a pezzi di una riga, la lettura a pagine, il cestino per collezione, l'ultimo amministratore. `test/cloud.test.js`: il ripristino con l'orologio indietro, caricamento e scaricamento a pezzi piccoli, lo schema senza lettura a pagine, lo scollegamento dalla schermata d'accesso, la sessione scaduta. `test/auth.test.js`: la prima password di chi ha scollegato. `test/odp.test.js`: lo stato dai comandi, il resto del materiale.

### 0.105.3 — 2026-10-17

**Controllo generale dell'app.** Una rilettura completa, area per area, con ogni difetto riprodotto prima di correggerlo. **Con l'archivio condiviso vanno rieseguiti `supabase/schema.sql` e ripubblicata la funzione `bomtrack-utenti`** (manuale, cap. 31): senza, le correzioni lato server non valgono.

**Fabbisogno**
- **Chi consegna prima prende prima.** L'impegnato di un piano contava la domanda di *tutti* gli altri piani aperti: a magazzino vuoto, un piano da 100 e uno da 50 mostravano 150 da comprare ciascuno, e generare gli ordini da entrambi prima di inviarli ne ordinava 300. Ora i piani si mettono in fila come già per le parti a scaffale (consegna, poi data, poi numero): ognuno conta come impegnato solo quelli davanti, l'impegnato toglie soltanto merce che c'è, e il buco della scorta minima lo compra il primo della fila. Due piani sulla stessa merce restano separati, ma insieme comprano esattamente quello che manca.

**Sicurezza**
- **Testo che diventava codice**: il tipo di un articolo arrivato da un import, i campi del selettore di catalogo nei documenti, la sigla nelle modifiche tecniche e il nome del foglio nel resoconto d'import passavano nella pagina senza essere neutralizzati. Ora sono testo.
- **Dall'archivio allegati si aprono solo PDF.** Un file HTML o SVG si apriva come pagina dell'app, con i suoi dati e la sessione.
- **Server**: nessuno cambia più la propria email dal profilo; una lapide (la cancellazione che va a tutti) la scrive solo chi può scrivere quella tabella; una modifica datata nel futuro (orologio del PC avanti) viene rifiutata con un messaggio chiaro; il tipo di articolo deve essere uno di quelli dell'app; il link per reimpostare la password usa l'email vera dell'utente e non quella del profilo.
- **Ruoli**: «Segna come inviato» dopo un PDF lo chiede solo a chi può cambiare lo stato; **Scollega questo PC**, da dentro l'app, solo a un amministratore; modificare una riga o sbloccare un documento controllano il ruolo.
- **Un collega sospeso esce** al giro di sincronizzazione successivo. Prima restava dentro, su una copia ferma, con ogni salvataggio respinto.

**Archivio condiviso**
- **Due schede aperte**: la vecchia si ferma e lo dice, invece di continuare a sincronizzare con dati superati.
- **Un salvataggio locale fallito** durante una ricezione non fa più avanzare il punto di sincronizzazione (al riavvio cancellava sul server i record appena arrivati).
- **Un documento eliminato qui e ancora citato** (una richiesta citata da un ordine) bloccava la coda d'invio per sempre se la ricezione non si era ancora applicata. Ora il riferimento si svuota come fa il server, e la coda riparte.
- **Un record eliminato da un collega** non torna più vuoto: una modifica fatta su una copia di prima della cancellazione non lo fa risorgere (vince la cancellazione), e quando torna perché qui è ancora usato porta con sé tutte le sue righe.
- **Due colleghi che avviano la stessa fase di un ODP** prima di essersi visti scrivono un solo avvio e un solo prelievo: il materiale non esce più due volte.
- **Una creazione alla volta** mentre il server assegna il numero: un doppio clic creava due documenti. I codici impegnati sono per articolo: due articoli nuovi non si contendono più lo stesso codice.
- **Una richiesta al server che non torna più** (una connessione rimasta a metà dopo uno standby, il Wi-Fi che cambia) dopo 90 secondi vale come rete assente. Prima fermava la sincronizzazione e ogni «Nuovo documento» in attesa del numero.
- Il service worker scarica i file aggiornati dalla rete e non dalla cache del browser; le policy del server si calcolano una volta per interrogazione (download più veloci sugli archivi grandi).

**Correzioni**
- **Righe degli ordini di lavoro**: «Salva» sulla riga modificata e «Aggiungi» sulla riga a mano non facevano niente.
- **Cambiare sezione con un documento in modifica** lo salva. Restava «da salvare» fuori dal suo editor e, con l'archivio condiviso, fermava la ricezione delle modifiche dei colleghi senza che niente lo dicesse.
- **QR**: «Ricevi tutto» salva davvero e dice «registrato» solo se il ricevimento è passato; il QR di un'ubicazione chiede conferma prima di buttare un inventario con dei conteggi.
- **Cestino e Annulla**: un documento o un articolo il cui numero (o codice) è stato ridato dopo l'eliminazione resta nel cestino e l'app spiega perché, invece di creare due ODA-2026-002. L'«Annulla» dopo aver eliminato un ODP rimette anche dichiarazioni e movimenti, e un ODP con un ordine di lavoro aperto sulle sue fasi non si elimina.
- **Storico dei movimenti**: quelli scritti da un ODP o da un montaggio non si eliminano più da lì, ma dal loro documento.
- **Import di un backup** che non si riesce a migrare: resta l'archivio di prima, invece di uno a metà.
- **Costi**: «Copia da» un articolo porta anche la seconda unità e il fattore; nell'import del catalogo un'unità di prezzo uguale a quella di gestione, o vuota, si toglie, e un cambio di conversione riapplica la quotazione in uso.
- **PDF**: quantità con la virgola e senza il rumore dei decimali (0,3 e non 0.30000000000000004); il prezzo unitario esce con i suoi decimali, fino a 4, e torna con l'importo. Lo stesso negli elenchi esportati in PDF.
- **Allegati**: un allegato eliminato e poi ripristinato dal cestino ha ancora il suo file (i byte si toglievano subito).
- **Backup automatico**: con l'archivio non letto, o in una scheda superata da un'altra, non riscrive più il backup del giorno con i dati d'esempio.
- **Inventario**: una registrazione rifiutata (ruolo, senza collegamento) non chiude più la finestra dicendo «nessuna differenza».
- **Sospendi / Riattiva** di fornitori, clienti e centri di lavoro in *Gestione* non faceva niente.

**Verifica**
- `test/controllo-generale.test.js` (nuovo): un difetto per prova. `test/allegati.test.js` e `test/backup-auto.test.js`: il file che resta, il backup che non si riscrive. `test/stock.test.js` e `test/job-coverage.test.js`: la fila dei piani, magazzino vuoto, scorta minima comprata una volta. `test/cloud.test.js`: la coda che riparte, il record che non torna vuoto, il collega sospeso che esce. `test/schema-sql.test.js`: email, lapidi, date nel futuro, tipo di articolo, modifica sopra una lapide, profilo del sospeso.

### 0.105.2 — 2026-10-16

**Correzioni**
- **Quotazioni doppie nel listino con l'archivio condiviso.** Al caricamento, un articolo comprato con un prezzo ma senza il segno «listino già creato» riceveva una quotazione a mano ricavata dal prezzo. Quel segno resta sul PC e non va sul server: ogni PC, a ogni download e a ogni ricarica dopo una modifica di un collega, aggiungeva un'altra copia della stessa quotazione. Con l'archivio condiviso la semina non si fa più, e le copie identiche già create si tolgono da sole alla prossima apertura, anche dal server. Resta quella in uso.
- **Due colleghi che registravano a listino la stessa richiesta d'offerta** prima di essersi sincronizzati bloccavano per sempre l'invio di chi arrivava secondo (il server rifiuta la stessa offerta due volte). Ora la quotazione ha lo stesso id su ogni PC, e le due registrazioni sono la stessa.
- **Un prezzo corretto sulla richiesta dopo averlo registrato** restava al valore vecchio nel listino, con il pulsante spento. Ora il pulsante torna attivo e la quotazione si aggiorna; se è quella in uso, il costo la segue.
- **La funzione `bomtrack-utenti` con il codice d'esempio di Supabase** dava una finestra con il link vuoto. Ora l'app dice che il codice della funzione va sostituito.

**Verifica**
- `test/cloud.test.js`: due PC registrano la stessa offerta; un articolo arrivato dal server non si semina e le copie spariscono anche dal server; la funzione con il codice d'esempio. `test/pricelist.test.js`: il prezzo corretto aggiorna la quotazione e il costo in uso, l'id stabile.

### 0.105.1 — 2026-10-16

**Correzioni**
- **«Server non raggiungibile» generando un link.** Quando la funzione `bomtrack-utenti` non è pubblicata, o si ferma all'avvio, Supabase risponde senza le intestazioni che il browser chiede, e l'app lo scambiava per la rete assente: diceva «server non raggiungibile» e passava in sola lettura. Ora dice che è la funzione a non rispondere e dove guardare (Edge Functions e i suoi Logs), e l'app resta collegata.

**Verifica**
- `test/cloud.test.js`: una funzione che non risponde dà il suo messaggio e non mette l'app in sola lettura.

### 0.105.0 — 2026-10-16

**I colleghi si creano dall'app.** Prima un collega si invitava dal pannello di Supabase, nasceva lettore sospeso e poi gli si davano ruolo e stato. Ora, in *Gestione → Utenti*, l'amministratore scrive nome, email e ruolo e riceve un link d'invito da girare. **Va pubblicata la funzione `supabase/functions/bomtrack-utenti`** (manuale, cap. 31, passo 9) e **va rieseguito `supabase/schema.sql`**.

**Nuovo**
- **Crea e genera link**: il collega nasce attivo, con il suo ruolo; aprendo il link sceglie la password. Nessuna email parte da sola.
- **Link per reimpostare la password** (la chiave accanto al collega). Non vale per un altro amministratore, che usa «Password dimenticata?»: nessuno può entrare al posto di un altro amministratore.
- La funzione `bomtrack-utenti` gira su Supabase con la chiave di servizio, che non arriva mai al browser, e risponde solo a un amministratore attivo. Il ruolo **non** passa dai metadati dell'utente (che chi si registra da solo può scrivere): il profilo nasce lettore sospeso dal trigger, e ruolo e stato li scrive l'amministratore con il suo accesso, sotto le stesse policy di ogni altra modifica.

**Sicurezza**
- **L'ultimo amministratore attivo** non si declassa e non si sospende nemmeno passando dall'API: prima lo impediva solo l'app.

**Verifica**
- `test/cloud.test.js`: creare un collega (ruolo, stato, nessun ruolo nei metadati, accesso col link), l'email già usata, il link di reimpostazione e il suo divieto per un altro amministratore, un non amministratore respinto, l'ultimo amministratore, la funzione non pubblicata. Il Supabase finto riproduce il contratto della funzione.

### 0.104.1 — 2026-10-16

**Numeri e codici senza buchi.** Nella 0.104.0 un numero riservato e non usato restava un buco nella serie. **Va rieseguito `supabase/schema.sql`.**
- Un numero preso per un documento che non nasce torna al server (`libera_numeri`), e il prossimo che chiede lo riprende per primo, anche se intanto un collega è andato avanti (`numeri_liberi`). Il contatore fisso è sostituito dagli impegni: il prossimo numero è il più alto fra documenti e impegni aperti, così eliminare l'ultimo documento libera il suo numero. Un impegno si chiude da sé quando il documento arriva sul server, e scade dopo sette giorni se il PC non lo manda mai.
- Il PC passa come minimo solo i documenti ancora in coda, non tutti quelli che ha: un documento che un collega ha appena eliminato non fa più saltare un numero.
- **Si elimina solo l'ultimo della serie**, anche senza archivio condiviso: un documento in mezzo si annulla (ordini, ODL, ODP, commesse) o si chiude (richieste, piani), un articolo in mezzo alla sua codifica si segna obsoleto. L'eliminazione in blocco toglie quelli in coda e dice quanti restano e perché.
- Un codice articolo impegnato e non usato torna libero (`libera_codici`): dopo un salvataggio che non va in porto e dopo un import, per i codici delle righe scartate. I codici visti presi da un collega si dimenticano a ogni giro, così uno restituito si riprende.

**Verifica**
- `test/serie-senza-buchi.test.js` (nuovo): l'ultimo documento e l'ultimo codice, i sottogruppi a scendere, l'eliminazione in blocco.
- `test/cloud.test.js`: il numero non usato che torna al collega, il buco riempito dal prossimo, il numero dell'ultimo documento eliminato, il codice restituito. Il Supabase finto risponde in JSON anche per le funzioni che tornano un intero o un elenco, come PostgREST.

### 0.104.0 — 2026-10-16

**Con l'archivio condiviso numeri e codici li dà il server.** Prima ogni PC calcolava il prossimo numero dal suo archivio, e due colleghi che creavano un ordine insieme prendevano lo stesso ODA; la 0.103.2 lo rinumerava dopo. Ora il numero si chiede al server e si segna come preso prima che il documento nasca. **Va rieseguito `supabase/schema.sql`.**

**Nuovo**
- **Senza collegamento si consulta soltanto.** Con l'archivio condiviso, quando il server non risponde (e all'avvio, fino alla prima risposta) l'app è in sola lettura: un banner lo dice, i comandi per creare spariscono, le guardie bloccano il resto. Si riprova ogni 5 secondi e si torna a lavorare da soli. Esportare e fare un backup restano possibili. Le modifiche già in coda partono al ritorno, come prima.
- **I numeri dei documenti dal server**: richieste, ordini, ordini di lavoro e di produzione, piani, commesse e modifiche tecniche MT. Un contatore per serie e per anno, che non scende mai sotto il numero più alto già presente (sul server o in coda su questo PC). Chi genera più documenti insieme (da un piano, dal riordino, da una richiesta divisa) prende tutti i numeri in una chiamata. (Corretto nella 0.104.1: un numero preso e non usato restava un buco.)
- **I codici articolo impegnati prima di salvare**, dalla scheda e dall'import Excel. Un codice preso da un collega da meno di un'ora, anche se il suo articolo non è ancora arrivato, non si dà: quello automatico si ricalcola saltandolo, quello scritto a mano va cambiato.
- Senza archivio condiviso non cambia niente: numeri e codici si calcolano sul PC, subito, come sempre.

**Schema**
- Tabelle `contatori` e `codici_impegnati` (RLS attiva, nessuna policy: si toccano solo dalle funzioni) e le funzioni `riserva_numeri(prefisso, quanti, minimo)` e `impegna_codici(codici)`, che controllano il diritto di scrivere la tabella dei documenti o degli articoli.

**Verifica**
- `test/cloud.test.js`: sola lettura senza server e all'avvio; due ordini creati insieme da due PC; numeri consecutivi per più documenti; un codice preso dal collega saltato o rifiutato; l'import che impegna i suoi codici; un lettore che non prenota. Il Supabase finto passa gli interi come interi, come PostgREST.

### 0.103.2 — 2026-10-16

**Correzioni all'archivio condiviso**, da un controllo dei casi in cui due colleghi lavorano sulla stessa cosa. Tre erano rotti, provati contro Postgres prima di correggerli.
- **Una modifica fatta su una copia vecchia cancellava in silenzio quella del collega.** Anna cambia il costo di un articolo; Bruno, che ha la scheda aperta da prima, salva una nota: la sua versione era più recente e vinceva intera, costo vecchio compreso, senza avvisi per nessuno. Ora ogni invio dice da quale versione è partito, e il server la respinge se intanto è cambiata: Bruno riceve l'avviso e la versione di Anna. Vale anche per distinta, ciclo e lavorazioni, che viaggiano con l'articolo. **Va rieseguito `supabase/schema.sql`**; finché non lo si fa vale il comportamento di prima.
- **Un riferimento a un record eliminato bloccava la coda per sempre.** Se un collega eliminava un fornitore mentre qui lo si metteva in un ordine (o il contrario), il server rifiutava l'invio, e con lui ogni modifica successiva: la nuvola restava rossa e non arrivava più niente. Ora l'app capisce quale tabella non regge, fa vincere chi usa (la regola che vale anche in locale: non si elimina ciò che è citato) e rimanda il lotto: il record eliminato torna, o la cancellazione si ritira.
- **Due documenti creati nello stesso momento prendevano lo stesso numero.** Ora, quando si incontrano, il più recente si rinumera sul PC di chi l'ha creato, se è ancora una bozza nata da poco; altrimenti l'app avvisa.

**Verifica**
- `test/cloud.test.js`: i tre casi, con due PC contro il Supabase finto. Il Supabase finto ora passa il codice e il dettaglio degli errori di Postgres come PostgREST.
- `test/cloud-browser.js`: aspetta il profilo del collega invece di contare i giri, che sotto carico tornavano subito.

### 0.103.1 — 2026-10-15

**Correzioni**
- **Un PC scollegato dall'archivio condiviso restava chiuso fuori**: gli utenti arrivati da Supabase non hanno password locali, e nessuno poteva più entrare, nemmeno per ricollegarlo. Ora, finché nessuno ha una password su quel PC, un amministratore entra con la sua email e la password che sceglie, che diventa la sua.
- **Uno schema Supabase più vecchio dell'app** (`PGRST202`, funzione non trovata) ora dice di rieseguire `supabase/schema.sql`, invece di mostrare l'errore di PostgREST.

**Verifica**
- `test/genera-dati-prova.js` (nuovo, fuori dalla suite): scrive un backup corposo da importare, un'officina inventata con 474 articoli e sette mesi di commesse, ordini, produzione e magazzino, generati dall'app stessa.

### 0.103.0 — 2026-10-15

**L'archivio condiviso su Supabase.** Ogni PC aveva il suo archivio, e due colleghi si allineavano passandosi il backup. Lo schema, le funzioni di sincronizzazione e i permessi erano pronti da tempo: mancava la parte dell'app che si collega.

**Nuovo**
- **Collegare un PC** a un progetto Supabase dalla schermata d'accesso o da *Gestione → Backup → Archivio condiviso*: indirizzo e chiave pubblica, con **Prova**. Restano in questo browser, non nel codice. Il **link di collegamento** (`?supabase=…&chiave=…`) porta un collega già puntato al progetto, dopo una conferma che mostra a quale.
- **Accesso con Supabase Auth**: email e password di Supabase, sessione che si rinnova da sola, **Password dimenticata?**, **Cambia password**. Gli inviti e i recuperi tornano all'app, che chiede la password nuova.
- **Primo collegamento**: l'amministratore **carica** l'archivio del suo PC nel progetto vuoto (gli utenti passano per email e prendono l'id di Supabase, con tutti i campi d'autore; chi non ha un utente resta fuori, e l'app dice chi); gli altri lo **scaricano**. Un caricamento interrotto si riprende.
- **Sincronizzazione** (`cloud.js`, nuovo, senza librerie): ogni salvataggio programma un invio, e un lotto di modifiche è una chiamata sola a `push_changes()`, cioè una transazione. Ogni 25 secondi, al ritorno sulla finestra e al ritorno della rete arrivano le modifiche dei colleghi, mai in mezzo a una scheda aperta o a un campo in scrittura. Senza rete si lavora; la coda resta anche chiudendo la finestra.
- La **nuvola** nell'intestazione dice lo stato (sincronizzato, da inviare, senza rete, errore, accesso scaduto) e apre il pannello: **Sincronizza ora**, **Scarta e riscarica**, **Scollega questo PC**, il link per i colleghi.
- **Conflitti**: chi aveva salvato una versione più vecchia riceve un avviso e vede quella che ha vinto. Il registro delle modifiche attribuisce quelle arrivate a chi le ha fatte.
- **Utenti**: con l'archivio condiviso si invitano da Supabase; nascono **sospesi**, e l'amministratore dà il ruolo e li attiva in *Gestione → Utenti*. Non si eliminano, si sospendono. Chi è sospeso non entra.
- Con l'archivio condiviso **import di un backup, dati d'esempio e azzeramento** sono bloccati: toccherebbero tutti.

**Database** (`supabase/schema.sql`, da rieseguire)
- Il **profilo nasce dall'utente di Supabase Auth** (trigger su `auth.users`): il primo è amministratore attivo, gli altri lettori sospesi. Chi esisteva già prende il profilo alla prima esecuzione.
- `archivio_stato()`: il proprio profilo, anche sospeso, e se l'archivio è ancora vuoto.
- `push_changes()`: una riga respinta perché più vecchia viene ridatata, così il pull la riporta a chi l'aveva persa. Prima il suo archivio avrebbe tenuto la versione perdente.

**Documentazione**
- MANUALE: il cap. 31 riscritto, da «progettato» a «come si mette in piedi e come si lavora»: il progetto, il primo caricamento, gli inviti, la nuvola, chi vince, quello che il server non lascia fare, il backup che resta. Riferimenti aggiornati nei cap. 1, 26, 30, nelle domande frequenti e nell'appendice (le chiavi `bomtrack_cloud*`).

**Verifica**
- `test/supabase-finto.js` (nuovo): un Supabase finto (Auth e RPC) con dietro Postgres e lo schema vero.
- `test/cloud.test.js` (nuovo, 23 casi): il lotto da inviare e la risposta da applicare, senza rete; poi tre PC contro il server: caricamento e scaricamento, modifiche nei due versi, quotazioni concorrenti, conflitto, cancellazione, ruolo che non scrive, impostazioni, rete che cade e riavvio, token scaduto, utente sospeso.
- `test/cloud-ui.test.js` e `test/cloud-browser.js` (nuovi): il giro dall'interfaccia in Chromium, al PC e al telefono.

### 0.102.0 — 2026-10-15

**I fornitori si cercano scrivendo.** Nei menu dei fornitori, che sono decine, si cercava scorrendo.

**Nuovo**
- Ogni campo fornitore o terzista diventa un campo in cui si scrive: la lista si apre al clic e si filtra mentre si digita (maiuscole e accenti non contano, più parole in qualunque ordine, prima chi comincia così). Frecce e Invio per scegliere, Esc per lasciare com'era. Vale per richiesta, ordine e ordine di lavoro, listino della scheda articolo, listino fornitori, righe e fasi dei cicli, fornitori dei centri di lavoro, rettifica di magazzino, filtri degli elenchi documenti e scelta da catalogo.
- `combo.js` (nuovo): un `select.sel-cerca` resta nella pagina, nascosto, con id, valore e `onchange`; il campo gli scrive il valore e gli manda `change`. Un MutationObserver trasforma i menu appena compaiono e tiene allineato il campo quando il menu cambia voci o si blocca (documento bloccato).

**Verifica**
- `test/combo.test.js` (nuovo, 14 casi): il filtro, i campi marcati, e in Chromium (`test/combo-browser.js`) lista intera e filtrata, Invio che arriva al documento, Esc, nessun risultato, documento bloccato, filtro dell'elenco con le frecce.

### 0.101.1 — 2026-10-15

**Nomi dei file esportati.** Un controllo dei nomi con cui l'app salva PDF ed Excel ha trovato due difetti e un'incoerenza.

**Corretto**
- **Caratteri non ammessi nel nome**: gli export degli elenchi non pulivano lo slug. Il confronto di due distinte mette nel nome i codici articolo, scritti dall'utente: un codice con `/` o `:` faceva fallire o troncare il salvataggio, e gli spazi spezzavano il nome. Ora `listExportName` passa da `nomeFileSicuro` e gli spazi diventano trattini.
- **Data delle etichette QR**: il file usava la data di Greenwich (`toISOString`), quindi fra mezzanotte e le due prendeva il giorno prima. Ora usa la data del PC come tutti gli altri export.
- **Ordine di produzione**: il PDF e l'Excel si chiamavano `bomtrack_odp_ODP-2026-004_2026-10-15`, a differenza di ODA e ODL che si chiamano col numero e il fornitore. Ora `ODP-2026-004_PRT-001` (numero e codice della parte).
- Le etichette QR prendono il prefisso `bomtrack_` come gli altri export.

**Documentazione**
- MANUALE: la tabella di tutti i nomi dei file; le chiavi `bomtrack_densita` e `bomtrack_inventario` (0.101.0) nell'elenco di quello che resta nel browser.

**Verifica**
- `test/export-lists.test.js`: codice con barra, due punti e spazi nel nome; nome dell'ODP. `test/qr.test.js`: nuovo nome delle etichette.

### 0.101.0 — 2026-10-15

**Inventario guidato, ubicazioni, card che filtrano, vista compatta.** Per contare il magazzino si cercava un codice alla volta, un QR nominava un articolo ma non un posto, le card in testa alle viste erano solo numeri, e le tabelle lunghe stavano in poche righe per schermo.

**Nuovo**
- **Ubicazioni**: campo *Ubicazione a scaffale* nella scheda articolo (maiuscolo, senza spazi doppi, con le ubicazioni già usate proposte). Colonna, filtro (anche *senza ubicazione*) e ricerca nel Magazzino, colonna nell'export, riga sull'etichetta QR dell'articolo. **QR dello scaffale** (`#/q/ubi/A-03`): *Etichette ▾ → Ubicazioni degli articoli elencati*, e una scheda rapida con gli articoli del posto e **Conta questa ubicazione**.
- **Inventario guidato** (*Magazzino → Inventario*, `inventario.js`): si sceglie cosa contare (articoli elencati, un'ubicazione, tutto), la fila segue le ubicazioni, si scrive il contato e si passa al prossimo. Il QR di un articolo o di uno scaffale (fotocamera, pistola o codice scritto) porta all'articolo o al posto giusto. Esistente nascosto se non si chiede di vederlo. Il conteggio resta nel browser e si riprende. Il **riepilogo** mostra le differenze e registra una *Rettifica inventario* per ogni riga spuntata, calcolata al momento di registrare.
- **Card cliccabili**: nel Magazzino *Sotto scorta minima* e *Con merce in arrivo* (nuovo stato del filtro) filtrano la tabella, la card attiva resta evidenziata e un secondo clic toglie il filtro; *Valore giacenza* apre il Cruscotto. Nel Riepilogo *Distinte*, *Commesse aperte* e *Ordini da evadere* (nuovo stato *Da evadere* nel filtro ordini). Nel Cruscotto *Sotto scorta* apre il Magazzino filtrato, *Fermo* e *Consegne scadute* scorrono alla loro tabella.
- **Vista compatta**: pulsante ☰ nell'intestazione (al telefono sotto ⋯). Righe di tabella ed elenchi più bassi, testo e card un poco più piccoli; resta in questo browser, come il tema.

**Da sapere**
- Con il cloud attivo va rilanciato `supabase/schema.sql`: aggiunge la colonna `items.location`.
- L'export del Magazzino ha una colonna in più (*Ubicazione*, dopo *U.M.*).

**Verifica**
- `test/inventario-ubicazioni.test.js` (nuovo, 29 casi): ubicazioni scritte uguali e in ordine di cammino, filtro e export, QR dello scaffale anche con apici nel nome, fila d'inventario, campo vuoto che non è zero, letture da QR, bozza ripresa, rettifiche calcolate al momento di registrare e solo sulle righe scelte, ruoli, card che filtrano, ordini da evadere, vista compatta. Aggiornati tre test dell'export del Magazzino per la colonna nuova.

### 0.100.0 — 2026-10-15

**Il magazzino segue il montaggio, le parti a scaffale e gli annulli.** Il montaggio di un assieme non scaricava i componenti, le parti già a scaffale si rifacevano, un ODP annullato lasciava fuori il materiale uscito e un prelievo oltre la giacenza passava in silenzio.

**Nuovo**
- **Dichiara montaggio**: nuova scheda **Da montare** nel piano, una riga per assieme con quantità, date, montati e restanti. La finestra propone i componenti diretti (con lo scarto della distinta) per i pezzi montati, mostra la giacenza, si corregge a mano e registra un *Consumo di produzione* per componente, legato alla dichiarazione (`db.productions`). Eliminare la dichiarazione toglie anche gli scarichi. Il montaggio dichiarato abbassa l'impegno del piano e porta la tappa a *fatto* in programma e avanzamento.
- **Parti a scaffale**: l'esplosione del piano prende prima le parti fabbricate che sono già a magazzino e fa produrre (e comprare materiale) solo per il resto. Le prende in ordine di urgenza dei piani aperti, dall'esistente meno la scorta minima, lasciando a ciascun piano i pezzi che i suoi ODP hanno versato e non sono ancora montati; le prese si impegnano. Si vedono nella scheda *Da fabbricare* sotto **Dal magazzino** (`scaffaleIndex`, `mrpExplodePlan` in `views-stock.js`).
- **Annullare un ODP rende il materiale**: se l'ordine aveva già prelevato, **Annulla** propone di rimettere a magazzino quello uscito, in proporzione ai pezzi della prima fase non ancora lavorati. Nuovo movimento **Reso da produzione** (o *Rientro da conto lavoro* se la prima fase era dal terzista), legato all'ordine.
- **Avviso sotto zero**: rettifica, uscita a conto lavoro, avvio della prima fase di un ODP e montaggio dicono prima di registrare se l'esistente va sotto zero, e lo ricordano dopo. Il movimento si registra comunque.

**Da sapere**
- Prima di questa versione il montaggio non scaricava niente: le parti e i commerciali degli assiemi già montati sono ancora nell'esistente, e ora i piani li considerano disponibili. Conviene controllare la lista *Dal magazzino* dei piani aperti e rettificare l'inventario dove serve. Sui dati di esempio FAB-2026-002 prende 10 codici da scaffale, versati da FAB-2026-001.
- Gantt e data fattibile restano sulla distinta intera. I sottoassiemi si dichiarano sulla loro riga: il montaggio di un assieme non scarica gli assiemi che contiene.

**Verifica**
- `test/montaggio-scaffale.test.js` (nuovo, 21 casi): scarico dei componenti con lo scarto, eliminazione, impegno, parti a scaffale con priorità e quote fra piani, scorta minima, reso proporzionale e dal terzista, avvisi sotto zero. `test/avanzamento.test.js`: montaggio dichiarato.

### 0.99.0 — 2026-10-15

**Codici QR su etichette e documenti.** Per trovare un articolo davanti allo scaffale, o un ordine con il foglio in mano, si cercava il codice a tastiera.

**Nuovo**
- **Etichette QR degli articoli**: **Etichette** nella barra del Magazzino (gli articoli elencati, con i filtri), **Etichetta QR** nel riquadro Magazzino della scheda articolo, **Etichette QR della selezione** nel pannello laterale. Formati foglio A4 3×8 (70×37) e 2×7 (99×38), rotolo 50×30 e 62×29; copie per articolo; etichette già usate sul foglio da saltare. PDF con i QR vettoriali.
- **QR in alto a destra** nei PDF dell'ordine di produzione, dell'ordine a fornitore e dell'ordine di lavoro.
- **Scheda rapida** aperta dal QR: per l'articolo giacenza, impegnato e libero con Rettifica, Scheda completa e Movimenti; per l'ODP la fase corrente con Avvia o Dichiara; per ODA e ODL le righe con il ricevuto e **Ricevi tutto** (con conferma). I pulsanti aprono le finestre che l'app ha già, con le stesse guardie di ruolo.
- **Scansiona** nell'intestazione (al telefono sotto ⋯): fotocamera dentro l'app (lettore del browser, o jsQR dove manca) e un campo che accetta il codice scritto o il testo di una pistola USB.
- **Gestione → Impostazioni → Etichette QR**: l'indirizzo dell'app da mettere nei QR (vuoto = quello da cui è aperta) e il formato predefinito.

**Da sapere**
- Il QR contiene il **codice** dell'articolo o il **numero** dell'ordine (`…#/q/art/MAT-ACC-LAM-001`), non l'id interno; se il codice non si trova si prova come id. Rinominare un codice rende vecchie le sue etichette.
- Con l'app aperta dal disco il QR non ha un indirizzo da dare al telefono: si legge solo con Scansiona, e la finestra delle etichette lo dice.
- Due librerie nuove in `vendor/`, invariate e con l'impronta in `vendor/LEGGIMI.md`: `qrcode.js` (qrcode-generator 1.4.4, MIT) e `jsQR.js` (jsQR 1.4.0, Apache-2.0).

**Verifica**
- `test/qr.test.js` (nuovo): indirizzo che va e torna uguale anche con caratteri speciali, ricerca per codice, numero e id, QR disegnato e riletto con jsQR, etichette (copie, foglio iniziato, rotolo), arrivo da `#/q/…` a sessione aperta, ruoli, impostazioni. `test/pwa.test.js`: le due librerie in cache.

### 0.98.1 — 2026-10-14

**Correzioni ai conti di magazzino.** Un controllo dei calcoli di giacenza, impegno e scorta ha trovato un doppio conteggio e tre comportamenti sbagliati.

**Corretto**
- **L'impegno scende quando il materiale esce.** Un piano impegnava sempre il suo fabbisogno lordo intero, anche dopo che un suo ODP o ODL aveva prelevato il materiale: l'esistente scendeva e l'impegno no, quindi la stessa merce si toglieva due volte. Il libero andava sotto zero, il piano chiedeva di ricomprare quello che aveva appena usato, gli altri piani si vedevano scoperti e la copertura della commessa diventava rossa. Ora l'impegno è il lordo meno il prelevato dai documenti del piano (`commitIndex`, `prelevatiIndex` in `views-stock.js`); il netto del piano stesso, il programma e la copertura della commessa tolgono il prelevato dal lordo. Sui dati di esempio, MAT-ACC-LAM-003 passa da 148 a 311 kg liberi.
- **Il riordino sotto scorta propone solo quello che è sotto scorta.** Il conto è `scorta minima − esistente − in arrivo`: l'impegnato dei piani non entra più, perché lo ordinano i piani. Prima comparivano articoli che sotto scorta non erano, e generando nello stesso giorno anche gli ordini del piano la merce si comprava due volte.
- **Il riordino non propone gli articoli obsoleti.**
- **Una rettifica con il campo quantità vuoto** non azzera più la giacenza: chiede la quantità.

**Verifica**
- `test/impegni-prelievo.test.js` (nuovo): prelievo totale e parziale, dettaglio dell'impegno, ODP annullato, ODP senza piano, piano chiuso. `test/riordino.test.js`: impegnato fuori dal conto, obsoleti. `test/officina.test.js`: rettifica con il campo vuoto.

### 0.98.0 — 2026-10-14

**Il calendario si filtra, e dice quando partono le fasi.** Un ordine di produzione lanciato aveva le fasi programmate con inizio e fine, ma il Riepilogo mostrava solo la sua data di fine; e con fabbisogno, consegne e promemoria nello stesso mese la griglia si leggeva a fatica.

**Nuovo**
- **Avvio delle fasi degli ODP** nel calendario del Riepilogo: alla data d'inizio programmata di ogni fase non ancora avviata di un ordine lanciato o in corso, «Avviare fase 10 di ODP-…», con la parte e il centro o il terzista. Le fasi di una tratta dal terzista sono una voce sola. Se la data è passata la voce è fra le scadute; avviata la fase, sparisce.
- **Filtri per tipo** sopra il calendario: Commesse, Piani e programma, Da ordinare, Consegne e rientri, Richieste, Avvio fasi ODP, Fine produzione, Promemoria, ognuno col suo numero. Valgono per scadute, griglia, giorno e prossimi 14 giorni; una riga dice quante scadenze sono nascoste e **Mostra tutto** le riaccende. La scelta si ricorda in questo browser.

**Verifica**
- `test/calendar.test.js`: le fasi (una voce per giorno, tratta unica, scaduta, avviata che sparisce, bozza e chiuso esclusi) e i filtri (ogni tipo coperto, scadute e giorno filtrati, conteggio dei nascosti, memoria, «Mostra tutto», preferenza illeggibile).

### 0.97.0 — 2026-10-14

**Il Gantt con quello che è successo davvero.** Il Gantt del piano dice entro quando deve succedere ogni cosa; per sapere se era successa si aprivano a uno a uno ordini, ordini di lavoro e ordini di produzione.

**Nuovo**
- **Pianificazione → Avanzamento**: per un piano e una sua riga, una riga per tappa (acquisto, fase interna, tratta dal terzista, montaggio) con la barra del programma del Gantt e sopra l'avanzamento reale, letto dai documenti del piano: ricevuto sugli ordini, pezzi dichiarati sulle fasi degli ODP, rientrati sugli ODL. Stati *fatto*, *in corso*, *in ritardo*, *da fare*, *da magazzino*, *previsto*; a fianco i documenti collegati con il loro stato, cliccabili. In testa consegna richiesta, fattibile, margine, conteggi e le tappe in ritardo sul percorso critico. Export Excel e PDF.

**Da sapere**
- È una vista in sola lettura e non aggiunge dati: Gantt, Programma e fabbisogno non cambiano.
- Un montaggio senza ordine di produzione resta *previsto*: non c'è niente che ne registri l'avanzamento, e la vista lo dice invece di indovinarlo.

**Verifica**
- `test/avanzamento.test.js`: date uguali al Gantt, gli stati degli acquisti (da fare, in corso, fatto, ritardo per data o per arrivo atteso, da magazzino, ordine annullato), le fasi dell'ODP e l'ODL della tratta, il montaggio senza documento, la vista che non scrive niente, export e apertura dei documenti. La vista entra anche nel controllo di impaginazione in Chromium a sette larghezze.

### 0.96.0 — 2026-10-14

**Il magazzino si riordina da sé, l'officina ha il suo ruolo, e una revisione è una modifica tecnica.** Il resto della lista di migliorie, tranne DDT, preventivi cliente e archivio condiviso.

**Nuovo**
- **Riordino sotto scorta** (*Magazzino → Riordina sotto scorta*): gli articoli d'acquisto sotto la scorta minima, con la quantità per tornarci (`scorta minima + impegnato − esistente − in arrivo`, arrotondata al lotto), raggruppati per fornitore. Un clic crea **un ordine in bozza per fornitore**, col prezzo del listino e la consegna dai giorni del fornitore. Quello che è già in viaggio è contato; quello che è già in una bozza lo dice e parte senza spunta. Le parti compaiono solo se si comprano.
- **Ruolo «Officina e magazzino»**: riceve la merce di ordini e ODL, avvia e dichiara le fasi degli ODP, registra la produzione, rettifica le giacenze e manda materiale ai terzisti; non scrive richieste, ordini, piani, articoli né distinte. Prima per dichiarare l'avanzamento serviva *Ufficio acquisti*. Nessun ruolo esistente perde niente.
- **Modifiche tecniche**: ogni revisione rilasciata riceve un numero **MT-AAAA-NNN** e, se si vuole, un tipo (correttiva, migliorativa, richiesta del cliente, cambio di fornitore o componente, riduzione dei costi). Prima di rilasciare si vedono i documenti aperti costruiti sulla versione che si lascia — piani e ODP dell'articolo e di chi lo contiene, richieste, ordini e ODL dei componenti toccati — e la lista resta fotografata nella revisione. **Modifiche tecniche**, nella barra revisioni, apre il registro di tutte.

**Più veloce**
- Il **Cruscotto** e il magazzino su archivi grandi: le righe di materiale in lavorazione si calcolavano una volta per articolo e i movimenti di ogni ODP si cercavano su tutti i movimenti. Su un archivio dieci volte quello d'esempio (1.370 articoli, 330 ODP) il cruscotto passa da **32 secondi a 0,1**. Riepilogo e salvataggio restano sotto i 350 ms.

**Da sapere**
- Lo schema SQL (`supabase/schema.sql`) ha il ruolo nuovo, l'area `shop` sulle tabelle di ricevimenti, produzione e movimenti, e tre colonne sulle revisioni (`eco_number`, `eco_kind`, `eco_impact`), aggiunte anche a un database esistente.
- Le revisioni rilasciate prima di questa versione restano senza numero: il registro le mostra lo stesso.

**Verifica**
- `test/riordino.test.js`, `test/officina.test.js`, `test/eco.test.js`; `test/schema-sql.test.js` controlla la matrice del ruolo nuovo anche su Postgres; `test/odp.test.js` controlla che le cache nuove seguano ogni gesto.

### 0.95.0 — 2026-10-14

**Il backup si fa da solo, e le modifiche lasciano traccia.** Il Riepilogo ricordava di esportare, ma l'export restava un gesto a mano, e l'unica copia dell'archivio stava in questo browser. E di ogni record si sapeva chi l'aveva toccato per ultimo, non che cosa aveva cambiato.

**Nuovo**
- **Backup automatico in una cartella** (*Gestione → Backup → Attiva backup automatico*): scelta una cartella una volta — meglio quella di OneDrive, Dropbox o un disco di rete — Bomtrack ci salva da sola il file del giorno, `bomtrack_backup_AAAA-MM-GG.json`, all'avvio, ogni mezz'ora se qualcosa è cambiato e quando si passa a un'altra finestra. Si tengono gli ultimi 14 giorni; gli altri file della cartella non si toccano. Ogni file si ripristina con *Importa JSON*.
- Un backup automatico **conta come backup**: il promemoria dei 7 giorni non scatta.
- **Riepilogo**: se il browser non ha ridato il permesso sulla cartella, il backup va *in pausa* e compare un avviso con **Riprendi**, che lo salva subito.
- **Storico delle modifiche**: a ogni salvataggio si annota chi ha cambiato cosa, e da quale valore a quale, su articoli, documenti, anagrafiche, utenti e impostazioni. Si legge nel pannello laterale dell'articolo (scheda **Storico**) e in *Gestione → Backup*, con una ricerca. Le righe dei documenti e del listino si contano (aggiunte, tolte, cambiate); un import o una generazione che tocca più di 50 record è una voce sola; si tengono le ultime 5.000 e viaggiano nel backup. Delle password si dice solo che sono cambiate.

**Da sapere**
- Lo storico conta da questa versione. Il confronto si fa sul contenuto dei record, non sulle date: costa qualche millisecondo per salvataggio (su un archivio di 2,7 MB da 13 a 22 ms).
- Come la cartella dell'archivio: Chrome o Edge, Bomtrack aperta da `https` o `localhost`, impostazione di questo PC. Aperta con un doppio clic su `index.html` la scheda dice che non è disponibile.

**Corretto**
- Un test del calendario falliva nei giorni in cui la data d'ordine cadeva di sabato, domenica o in un festivo: l'app la sposta giustamente al lavorativo prima, il test non lo sapeva. Ora la suite è verde qualunque giorno giri.

**Verifica**
- `test/storico.test.js`: campi e valori, niente rumore dalle sole date, modifiche senza `touch()`, righe contate, impostazioni, blocchi, tetto, password, backup e ricaricamento, scheda e ricerca.
- `test/backup-auto.test.js`: file valido per l'import, rotazione a 14 senza toccare i file altrui, riscrittura solo su modifica, pausa senza permesso e ripresa dal Riepilogo, scelta e disattivazione, ruoli.
### 0.94.0 — 2026-10-13

**Testate più pulite.** Le testate dei documenti arrivavano a sette pulsanti dello stesso peso, e il gesto principale non si distingueva dal resto.

**Nuovo**
- **Esporta ▾**: Excel e PDF in un menu solo, in tutti gli elenchi (anagrafiche, magazzino, cicli, distinte, documenti, cruscotto, carico, listino, confronto distinte) e nelle schede di piano e ordine di produzione.
- **⋯ Altri comandi** nei documenti: *Duplica* (piano), *Annulla* (ordine di produzione), *Crea ordine da questa richiesta* ed **Elimina**, che non sta più in vista accanto a *Salva*.
- I menu si chiudono con un clic fuori, con `Esc` o scegliendo una voce; in stampa non compaiono.

**Da sapere**
- I comandi sono gli stessi di prima, con gli stessi effetti: cambia solo dove stanno. Il grande pulsante «Genera documento» di richieste e ordini resta dov'era.

**Verifica**
- `test/tendine.test.js`: voci e comandi del menu, «Esporta» con gli stessi comandi di prima, nome del pulsante ⋯, Elimina e Duplica fuori dalla vista in piano, richiesta, ordine e commessa.

### 0.93.0 — 2026-10-13

**A che punto è, e da dove viene.** Il giro commessa → piano → richiesta → ordine → ricevimento era scritto nel manuale e in un menu «Stato»: il documento diceva in che stato era, non quale fosse il passo dopo, né a cosa fosse legato.

**Nuovo**
- **Barra dei passi** in testa a richieste, ordini, ordini di lavoro, ordini di produzione e commesse: gli stati in fila, quello attuale acceso, e il **passo successivo** come pulsante (*Segna come inviata*, *Crea ordine*, *Segna tutto ricevuto*, *Lancia*, *Metti in produzione*…) o, quando lo fa una persona, una riga che dice cosa manca. Il pulsante fa quello che fa il menu *Stato*, e salva subito.
- **Collegati**: commessa, piano, richiesta, ordine di produzione da cui viene il documento, e gli ordini che ne sono nati, ciascuno cliccabile. Sostituisce le righe «Generato dalla richiesta…» / «Dal fabbisogno…».

**Da sapere**
- Il menu *Stato* resta: la barra è una scorciatoia. «Metti in produzione» passa dalla stessa domanda sul materiale mancante del menu.
- Sull'ordine di produzione il pulsante *Lancia* si sposta dalla toolbar alla barra dei passi.

**Verifica**
- `test/docflow.test.js`: passo attuale, pulsante che cambia stato e salva, giro completato, annullato fuori dal giro, commessa, collegamenti nei due versi.

### 0.92.0 — 2026-10-13

**Il piano a schede.** La scheda di un piano di fabbisogno era lunga quasi tre schermate, con otto sezioni una sotto l'altra: per arrivare al conto lavoro si scorrevano ogni volta gli acquisti.

**Nuovo**
- Testata, righe **Da produrre** e KPI restano in alto; il resto sta in **schede** con il loro conteggio: *Da acquistare*, *Conto lavoro*, *Da fabbricare*, *Programma*, *Gantt*, *Carico*, *Documenti*.
- I pulsanti **Genera…** passano dalla toolbar alla scheda delle righe su cui agiscono: richieste e ordini in *Da acquistare*, richieste e ordini di lavoro in *Conto lavoro*, ordini di produzione in *Da fabbricare*.
- La scheda scelta resta aprendo un altro piano; frecce ← → per spostarsi fra le schede.

**Da sapere**
- In stampa le schede escono tutte, come prima. Conti, date e documenti non cambiano.

**Verifica**
- `test/plandocs.test.js`: schede e conteggi, scheda nascosta ma disegnata, memoria della scheda, pulsanti nella scheda giusta.

### 0.91.0 — 2026-10-13

**La barra segue il lavoro.** I gruppi erano divisi per tipo di dato, e «Documenti» teneva insieme commesse, piani, richieste, ordini, ODP e ODL: la pianificazione, l'ufficio acquisti e l'officina in un cassetto solo. Ora seguono il processo e chi lo fa.

**Nuovo**
- **Gruppi per processo**: Riepilogo · **Tecnico** (articoli di progetto e d'acquisto, Gestione DB, Visualizza DB, cicli) · **Pianificazione** (commesse, fabbisogno, carico centri) · **Acquisti** (richieste offerta, ordini fornitore, listino) · **Produzione** (ODP, ODL) · Magazzino · Gestione. Le schermate sono le stesse e gli indirizzi (`#mrp`, `#orders`…) non cambiano.
- **Listino fornitori** come vista sua, in *Acquisti*: tutte le quotazioni di commerciali, materie prime e parti in un elenco, con prezzo in uso ✓ e più basso ↓, filtri per testo, fornitore, tipo, solo in uso o senza prezzo, export Excel e PDF. Un clic sulla riga apre il listino dell'articolo, che resta l'unico posto dove una quotazione si modifica.
- Il **Carico centri** passa sotto *Pianificazione*: è una domanda di pianificazione, non di ciclo.

**Da sapere**
- Le voci «Acquisti» e «Progetto» delle anagrafiche si chiamano **Articoli d'acquisto** e **Articoli di progetto**, per non confondersi col gruppo *Acquisti*; «Ordini» diventa **Ordini fornitore**.
- Permessi e ruoli non cambiano: il listino si modifica con i diritti sull'anagrafica, come prima.

**Verifica**
- `test/nav.test.js`: gruppi, viste per gruppo, memoria del gruppo, stampa. `test/pricelist.test.js`: la vista d'insieme (ordine, filtri, export, gruppo).

### 0.90.0 — 2026-10-13

**Il programma si vede, e l'ordine di produzione lo ricorda.** Ultima tappa della programmazione dei tempi (`docs/programmazione-tempi.md`).

**Nuovo**
- **Gantt** nella scheda piano: una riga di piano alla volta, un nodo per riga — assiemi, parti con le loro fasi e tratte, acquisti — con le barre del programma a ritroso (attesa fornitore, fase interna, conto lavoro, montaggio), il percorso critico in rosso, le linee di oggi e della consegna richiesta, le date esatte nel suggerimento di ogni barra. Oltre 60 righe si ferma e lo dice.
- **Date pianificate sulle fasi degli ordini di produzione**: inizio e fine di ogni fase, a ritroso da *Serve per* con le stesse regole del fabbisogno, sulle fasi congelate. In bozza seguono pezzi e data; dopo il lancio stanno ferme, la fase oltre la sua fine si segnala, e **Ripianifica** ricalcola le fasi non chiuse.
- **Ordini di lavoro da un ordine di produzione**: la riga chiede al terzista il rientro pianificato della tratta, ed è da emettere entro il suo invio — non più la fine dell'ordine.

**Le cautele**
- Gli ordini di produzione creati prima non hanno date di fase: si comportano come prima finché non si ripianificano.
- Schema SQL: `planned_start`, `planned_end` su `production_order_phases`, con `alter table … add column if not exists`.

**Verifica**
- `test/schedulazione.test.js`: Gantt (righe, titoli, percorso critico, tetto, piano senza date) e date delle fasi (creazione, bozza che segue la data, ODL dalla tratta, ordini vecchi, ripianifica, fase in ritardo in tabella).

### 0.89.0 — 2026-10-13

**Quando sono pronto davvero, e cosa fare oggi.** La 0.88.0 diceva *entro quando* deve succedere ogni cosa perché la consegna regga. Ora il piano dice anche se ce la fa, e mette in fila il lavoro.

**Nuovo**
- **Data fattibile e margine** per ogni riga di *Da produrre*: lo stesso albero percorso in avanti da oggi, con le stesse durate. Il materiale è pronto oggi se la giacenza libera basta, all'arrivo dell'ordine che lo copre se basta con l'in arrivo, altrimenti fra i giorni del listino. Margine in giorni lavorativi; negativo = la consegna non regge.
- **Percorso critico**: cliccando la data fattibile, la catena che arriva per ultima, passo per passo con le sue date.
- **Programma** nella scheda piano: ordinare, inviare al terzista, lanciare, rientri, fasi interne, montaggi, consegne, in ordine di data, con lo stato letto dai documenti del piano (fatto, richiesto, da fare, in ritardo, previsto), filtro «solo da fare», export Excel e PDF.
- **Riepilogo**: invii e lanci ancora da fare entrano nel calendario delle scadenze.

**Sotto il cofano**
- `schedOps` separa l'aritmetica del ciclo dal ciclo vivo (servirà alle fasi congelate degli ODP); `schedTree` costruisce l'albero di una riga di piano con le **stesse** date degli aggregati, e un test lo tiene fermo.
- `buySupplierId`/`buyDocRow`/`buyLeadDays` escono da `mrpBuyRow`: fornitore e listino di un acquisto si leggono in un posto solo.

**Da sapere**
- Le parti prodotte non si guardano a magazzino, un ODP già avviato non accorcia il conto, la capacità resta infinita.

**Verifica**
- `test/schedulazione.test.js`: albero contro aggregati, tappe della parte, data fattibile con oggi fermato (per tempo, in ritardo, materiale a magazzino, materiale già ordinato), agenda completa, fatto e ritardo, export, Riepilogo. La scheda piano entra nei controlli d'impaginazione in Chromium.

### 0.88.0 — 2026-10-13

**Le date a ritroso.** Fino a ieri la data di una riga di piano scendeva **invariata** lungo la distinta: se il gruppo serviva il 16, il tondo, i perni e la zincatura dal terzista servivano tutti il 16. Gli unici anticipi erano i giorni del listino sul materiale e quelli di attraversamento su ogni singola fase esterna — ciascuno contato dalla consegna del prodotto, come se montaggio, tornitura e il viaggio dal terzista non esistessero. Ora il fabbisogno **programma a ritroso**: risale montaggi, fasi del ciclo e tratte di conto lavoro, in fila, sul calendario di fabbrica. Analisi e tappe successive in `docs/programmazione-tempi.md`.

**Nuovo**
- **Calendario di fabbrica** in *Gestione → Impostazioni*: giorni lavorativi (di serie lunedì–venerdì), festivi ricorrenti, Pasquetta calcolata, chiusure (ferie, ponti, patrono) e un **margine fra livelli** di distinta. `calendario.js`: `isWorkDay`, `addWorkDays`, `prevWorkDay`, `nextWorkDay`, `workDaysBetween`, `pasqua`.
- **I tempi** dove mancavano: sul centro di lavoro **ore al giorno**, **attrezzaggio per lotto** e **giorni di coda**; sul fornitore i **giorni di trasporto** del conto lavoro; sull'assieme i **giorni di montaggio** (in *Gestione DB*, accanto alle lavorazioni). Tutti a zero di serie, e anche nei fogli Excel delle impostazioni.
- **La catena.** Montaggio = giorni dichiarati o le ore delle sue lavorazioni; fase interna = (attrezzaggio + ore/pz × pezzi) ÷ ore al giorno, al giorno intero, più la coda, in giorni lavorativi; tratta di conto lavoro = attraversamento delle sue fasi più il trasporto, in giorni di calendario. Il materiale del ciclo serve all'inizio della prima fase; i componenti all'inizio del montaggio.
- **Nel piano**: «Serve per» e «Ordinare entro» degli acquisti sono scalati; in *Da far lavorare fuori* sono **rientro** e **invio** della tratta; in *Da fabbricare* compare la data di **lancio**. Le date d'ordine e d'invio che cadono su un giorno chiuso si anticipano al lavorativo precedente.
- **Nei documenti**: l'ordine al fornitore chiede la data in cui il materiale serve davvero, l'ordine di lavoro il rientro della tratta.
- **Carico centri**: le ore stanno nella settimana in cui la fase **comincia**, non in quella in cui il pezzo serve pronto.

**Le cautele**
- Senza tempi dichiarati una fase non sposta niente: le date restano quelle della consegna. Una fase interna con le sue ore invece sì — 8 ore al giorno di serie, o la capacità settimanale ÷ i giorni lavorativi.
- Capacità sempre **infinita**: le date dicono quando ciascuna cosa deve succedere, non se il reparto ce la fa. Il sovraccarico resta da leggere nel Carico centri.
- Netto, impegni e quantità non cambiano: si aggiungono date, non pezzi.
- Gli ordini di lavoro generati da un ordine di produzione chiedono ancora la consegna dell'ODP: le date congelate per fase arrivano con la 0.90.0.

**Verifica**
- `test/calendario.test.js` (festivi, Pasqua 2024–2026, chiusure, capodanno, fuso a est di Greenwich) e `test/schedulazione.test.js` (la catena completa con date scritte a mano, attrezzaggio e coda, montaggio dalle ore, margine, patrono in mezzo, due rami, dati mancanti, ODL a mano, Excel, migrazione). `test/carico.test.js` adeguato: le ore seguono la fase.
- Schema SQL: colonne nuove su `work_centers`, `suppliers`, `items`, con `alter table … add column if not exists` per i database già creati.

### 0.87.0 — 2026-10-12

**L'archivio senza il tetto dei 5 MB.** L'archivio passa da `localStorage` (circa 5 MB per sito, e un archivio con qualche anno di ordini e movimenti ci arriva) a **IndexedDB**, il database del browser, dove il limite è lo spazio che il browser concede al sito: di solito gigabyte.

**Cosa cambia per chi usa l'app**
- Niente da fare: al primo avvio l'archivio trasloca da solo. L'originale in `localStorage` si cancella solo dopo aver riletto la copia e verificato che coincide; se non coincide, l'archivio resta dov'era.
- La scheda Backup dice dove stanno i dati e quanto spazio concede il browser; il segnale dello spazio nel Riepilogo si regola su quello.
- Il backup resta indispensabile: IndexedDB sta nello stesso browser, sullo stesso disco.

**Le cautele**
- L'app continua a ragionare in modo sincrono: legge l'archivio una volta all'avvio, poi tiene una copia in memoria e scrive in coda, nell'ordine. Chiudere la scheda mentre una scrittura è in viaggio chiede conferma.
- Due schede aperte si accorgono ancora l'una dell'altra: il contatore delle scritture resta in `localStorage`.
- Una scheda rimasta aperta con la versione vecchia, che scrive ancora in `localStorage` dopo il trasloco, non perde il lavoro: al caricamento successivo vince la scrittura più recente.
- Se un giorno IndexedDB non si apre, l'app non riparte dai dati di esempio (salvandoli sopra l'archivio vero al giro dopo): lo dice e non salva finché l'archivio non torna raggiungibile.
- Una scrittura rifiutata si segnala come prima, e il badge «non salvato» si spegne solo quando una scrittura è davvero arrivata.
- Senza IndexedDB tutto resta in `localStorage`, come prima.

**Verifica**
- `test/idb.test.js`: trasloco, verifica fallita, installazione nuova, ordine delle scritture, scheda con l'app vecchia, IndexedDB irraggiungibile, archivio da 8 MB, quota esaurita e ripresa. In Chromium, con IndexedDB vero: archivio da 8 MB salvato e ritrovato, trasloco, due schede.
- Il runner esegue i file uno alla volta, aspettando i test asincroni di ciascuno.

### 0.86.0 — 2026-10-12

**Il cruscotto.** Una pagina nuova sotto *Riepilogo*: il Riepilogo dice cosa fare adesso, il cruscotto come stanno le cose.

**Nuovo**
- **Valore di magazzino**, totale e ripartito per tipo e per famiglia.
- **Articoli fermi** da 3, 6 o 12 mesi, dal più costoso, con il valore immobilizzato.
- **Sotto scorta minima**, con quanto manca e se quello in arrivo basta.
- **Consegne scadute per fornitore**: righe, valore da ricevere, ritardo peggiore, documenti cliccabili.
- Export Excel e PDF di tutto il cruscotto.

**Sotto il cofano**
- Le righe d'ordine ancora da ricevere hanno una funzione sola (`righeDaRicevere`), usata dal cruscotto e dal calendario del Riepilogo; il valore di una giacenza anche (`valoreGiacenza`), usata dal cruscotto e dalla tessera del magazzino.

**Verifica**
- `test/dashboard.test.js`; la vista entra nei controlli d'impaginazione in Chromium.

### 0.85.0 — 2026-10-12

**Confrontare distinte e revisioni.**

**Nuovo**
- **Due revisioni a confronto.** Lo storico confrontava ogni revisione solo con la distinta attuale, mentre il manuale prometteva due revisioni affiancate: ora dal confronto si sceglie l'altra metà — la distinta attuale o un'altra revisione — e si legge sempre dalla più vecchia alla più nuova, con il costo congelato di ciascuna.
- **⇄ Confronta con…** in *Gestione DB*: la distinta aperta contro un'altra qualsiasi, **su tutti i livelli**, con le quantità per una macchina calcolate come nel fabbisogno (scarti compresi, rami sommati). Due elenchi — da acquistare, con la differenza di valore, e da fabbricare — il costo delle due distinte, solo le differenze di serie, export Excel e PDF.

**Verifica**
- `test/revisions.test.js`: revisione con revisione in entrambi gli ordini, costi congelati, totali su più livelli con lo stesso componente in due rami, scarti, una distinta con sé stessa. L'impaginazione del confronto entra nei controlli in Chromium.

### 0.84.0 — 2026-10-12

**I dati al sicuro.** L'archivio esiste solo in questo browser, e il backup c'era — ma niente ricordava di farlo, e lo spazio si vedeva solo aprendo *Gestione → Backup*.

**Nuovo**
- **Il Riepilogo ricorda il backup**: dopo 7 giorni senza un *Esporta JSON* da questo browser avvisa, dopo 30 è un allarme, con **Esporta ora** a portata di clic. Solo per gli amministratori, che sono gli unici a poterlo fare. Un'installazione nuova non parte già in allarme: si conta dal primo giorno.
- **Il Riepilogo avvisa quando lo spazio si riempie**: dal 70% dei circa 5 MB del browser, allarme dal 90%. Prima lo si scopriva quando i salvataggi cominciavano a fallire.
- **Archiviazione persistente**: all'avvio l'app chiede al browser di non cancellare i suoi dati quando il disco è pieno, e la scheda Backup dice se l'ha ottenuto.
- La scheda Backup mostra la data dell'ultimo backup.

**Verifica**
- `test/sicurezza-dati.test.js`.
- Il runner dei test aspetta i test asincroni: prima li dava per buoni subito, e un'asserzione fallita dopo un `await` usciva fuori dal conteggio.

### 0.83.2 — 2026-10-12

**Grafica e impaginazione.** L'app è stata guardata in un browser vero a quattro larghezze (desktop, portatile, tablet, telefono) e nei due temi, 168 schermate misurate una per una. I colori erano già a posto — nessun testo sotto il contrasto richiesto, in nessuno dei due temi — ma l'intestazione e il telefono no.

**Corretto**
- **La barra delle sezioni nascondeva Riepilogo e Gestione** proprio sui portatili più comuni (1366–1440 px), e su tablet e telefono restavano una sezione e mezza, o nessuna. Ora l'intestazione fa spazio da sé, un passo alla volta e solo quanto serve: via il ruolo e la data, poi i comandi di contorno sotto **⋯**, poi i nomi delle sezioni (restano le icone), e sul telefono le sezioni sotto **☰**. A 1440 px le sezioni si leggono di nuovo per nome.
- **Al telefono ogni pagina scorreva di lato**, fino a 300 px negli ordini e nelle commesse: ora nessuna.
- **I codici articolo andavano a capo sul trattino** («CMM-» sopra, «100» sotto).
- **Gli importi si leggono all'italiana**: «€ 1.125,50» e non più «€1125.50», a schermo e nei PDF. Gli Excel restano numeri veri.

**Migliorato**
- Al telefono e sugli schermi a sfioramento nessun comando sotto i 34 px: linguette, pulsantini di riga, chiusura delle schede.
- Le etichette di stato e di tipo, prima a 9–10 px, sono un po' più grandi.
- I pulsanti **Esporta Excel / PDF** sono neutri, col formato detto dall'icona: il verde e il rosso pieni pesavano più del «+ Nuovo» accanto. Quelli che generano il documento di una richiesta o di un ordine restano grandi, col bordo nel colore del formato.
- «+ Nuovo ordine» non è più un blocco blu alto 62 px.
- Nel piano di fabbisogno i quattro «Genera…» stanno su una riga loro, e passandoci sopra quando sono spenti dicono perché.
- Con una scheda aperta la pagina dietro si attenua (torna piena portandoci sopra il mouse) e la scheda ha un'ombra più netta.
- Il pannello laterale dell'anagrafica si apre di serie solo da 1400 px in su.

**Verifica**
- `test/layout.test.js`: l'algoritmo dell'intestazione su un DOM simulato, le regole che avevano causato i difetti, e — se c'è Playwright, in CI c'è — l'app vera in Chromium a sette larghezze: nessuna pagina che scorre di lato, ogni sezione raggiungibile, nessun comando sotto i 32 px al telefono. Sulla 0.83.1 fallisce tutto.

### 0.83.1 — 2026-10-12

**Tutto per il locale.** Lo spostamento su un database condiviso non è previsto per ora, e il lavoro delle ultime versioni è stato riletto con un solo criterio: l'app locale funziona almeno come prima? Su due punti no, e sono corretti.

**Corretto**
- **La preparazione al cloud costava in locale.** Datare ogni riga dei documenti e registrare i ricevimenti come eventi serve solo a chi scrive in due sullo stesso database; in locale gonfiava l'archivio (da 1,43 a 2,01 MB su un archivio di prova, in un salvataggio del browser da ~5 MB) e triplicava il tempo di ogni salvataggio. Ora è spento di serie (`Store.modoCondiviso`): archivio e tempi tornano quelli della 0.80, e accenderlo un giorno non perderà niente.
- **Un ricevuto poteva azzerarsi da solo** al caricamento, se scritto senza passare dalla funzione dei ricevimenti. In locale il numero che hai visto non cambia mai più da solo.
- **La data dei documenti nuovi** — richieste, ordini, ODL, piani, ODP — fra mezzanotte e l'una (le due d'estate) era quella di ieri, mentre il numero era già dell'anno nuovo: alle 00:30 di Capodanno nasceva una «RFQ-2027-001» datata 31/12/2026.

**Migliorato**
- **Import**: fornitori e famiglie si cercano per nome con un indice invece di scorrere l'elenco a ogni riga. Un fornitore rinominato in Gestione fra due import si trova col nome nuovo.

**Verifica**
- Suite da 1907 a 1922 controlli senza database (1942 con Postgres). Ogni correzione ha un test che fallisce sulla versione precedente.

### 0.83.0 — 2026-10-12

**I permessi stanno nel database.** Finché i dati sono nel browser, chi apre gli strumenti di sviluppo si assegna il ruolo che vuole; con lo schema di questa versione, sul database condiviso non può più. Nessun cambiamento nell'app.

**Aggiunto**
- In `supabase/schema.sql` la matrice dei ruoli sostituisce la regola provvisoria: admin scrive tutto; acquisti documenti, ricevimenti, produzione, movimenti, commesse e promemoria; progettazione articoli, distinte, revisioni, allegati, movimenti e promemoria; il lettore legge e basta; un utente sospeso non legge più niente, anche con la sessione aperta.
- Chi scrive cosa è stato **misurato** facendo girare la suite e registrando i permessi controllati a ogni salvataggio, non dedotto dalla documentazione: una regola più stretta dell'app avrebbe fatto fallire invii leciti.
- Il proprio profilo si aggiorna, il proprio ruolo no.

**Corretto**
- `push_changes()` controlla i permessi di ogni tabella del lotto prima di toccarne una: una cancellazione non permessa non dava errore e lasciava la lapide senza cancellare la riga.
- CI: azioni `checkout` e `setup-node` alla v5 (la v4 girava su Node 20, in dismissione), suite su Node 22.

**Verifica**
- 12 nuovi controlli, eseguiti come utenti veri e non come superutente (suite da 1904 a 1907 senza database, da 1915 a 1927 con Postgres). Con la regola provvisoria rimessa al suo posto ne falliscono sette.

### 0.82.0 — 2026-10-12

**Lo schema del database condiviso esiste, ed è provato su un Postgres vero.** `supabase/schema.sql` si esegue nell'editor SQL di Supabase (anche più volte): tabelle, vincoli, registro delle tabelle sincronizzate, lapidi delle cancellazioni e le due funzioni da cui passa tutta la sincronizzazione.

**Aggiunto**
- `push_changes()`: un invio è **una transazione** — entra intero o non entra. Vince chi ha scritto dopo, e chi perde torna in un elenco da mostrare all'utente; distinte e cicli si sostituiscono interi solo se l'articolo passa; le cancellazioni lasciano una lapide che cede solo a un ripristino.
- `pull_changes()`: ciò che è cambiato dopo un istante del server, più le cancellazioni.
- Chiavi esterne tutte differite: i riferimenti circolari (prezzo in uso ↔ listino) non impongono un ordine. `no action` dove l'app protegge già il record citato, `set null` sui riferimenti di tracciabilità.
- `test/schema-sql.test.js`: lo schema verificato contro il codice (tabelle, padri, merge, tipo di ogni colonna) e, con un Postgres, il giro completo di un database che tocca tutte le 33 tabelle. La CI ora avvia un Postgres per farlo a ogni push.

**Corretto**
- **L'eliminazione multipla di articoli** controllava solo le distinte: un articolo già ordinato o movimentato spariva lasciando righe e movimenti orfani. Ora segue la stessa regola dell'eliminazione singola.
- **Due modifiche nello stesso millisecondo** davano la stessa data, e la seconda era invisibile alla sincronizzazione: la data di modifica ora sale sempre. Un test falliva per questo una volta su otto.
- La traduzione verso il database trattava come giorno di calendario la `date` di movimenti, dichiarazioni, avanzamenti e revisioni, che è un istante; e gli istanti riletti dal database tornano nella forma che l'app confronta.

**Verifica**
- Suite da 1893 a 1904 controlli senza database, 1915 con un Postgres (`BOMTRACK_PG`, vedi `test/pg.js`).

### 0.81.1 — 2026-10-12

**Le righe parlano SQL.** Preparazione al database condiviso, nessun cambiamento visibile nell'app. `flattenDB()` produceva i nomi del codice e `''` dove una colonna numerica, di data o uuid vuole NULL: il primo invio sarebbe stato rifiutato per intero.

**Aggiunto**
- `dbVersoCloud()` / `dbDaCloud()` in `cloud-map.js`: nomi delle colonne in snake_case, la colonna padre di ogni tabella figlia col suo nome (`item_id`, `order_id`…), `child_item_id` in distinta e ciclo, `description` al posto di `desc` (parola riservata), `''` → NULL nelle colonne tipizzate e ritorno esatto.
- Controllo prima dell'invio: numeri illeggibili, date storte, oggetti fuori posto e id non uuid si elencano tutti insieme, con tabella, riga e campo.

**Corretto**
- Nelle righe di ciclo i riferimenti vuoti erano a volte `''` e a volte `null`: ora sempre `null`.

**Verifica**
- 16 nuovi controlli in `test/cloud-colonne.test.js` (suite da 1877 a 1893).

### 0.81.0 — 2026-10-12

**I ricevimenti diventano eventi.** Il ricevuto di una riga d'ordine era un numero riscritto a ogni arrivo, e la giacenza ne è la somma: con il database condiviso, due persone che registrano un arrivo sulla stessa riga si sarebbero sovrascritte, e un carico sarebbe sparito dal magazzino senza un avviso. Ora ogni ricevimento è un evento con la differenza, e il ricevuto ne è la somma. Per chi usa l'app non cambia niente: si digita il totale ricevuto come prima.

**Modificato**
- Nuova collezione `receipts` (ricevimenti). La compila il campo «ricevuto» delle righe di ODA e ODL e il pulsante «ricevuto tutto»; una correzione all'ingiù è un evento negativo.
- Al primo avvio i ricevuti già registrati diventano un **saldo d'apertura** per riga: i numeri restano quelli di prima.
- Le righe di ODL nate da un ordine di produzione non cambiano: i pezzi rientrati li dichiara l'ODP.
- `flattenDB(db, { stripDerived: true })` toglie il ricevuto dalle righe da inviare: è una lettura, non un dato.

**Verifica**
- 14 nuovi controlli in `test/ricevimenti.test.js` (suite da 1863 a 1877), fra cui due ricevimenti concorrenti che si sommano invece di sovrascriversi.

### 0.80.1 — 2026-10-12

**Correzioni in vista del database condiviso.** Nessun cambiamento visibile nell'app: sono le cose che il giorno di Supabase avrebbero perso dati o fatto fallire il primo invio, chiuse adesso in locale e con un test. Dettaglio in `docs/analisi-tecnica.md` §33–38.

**Corretto**
- **Ogni riga figlia ha la propria data.** Righe di documento, quotazioni, sottofamiglie, fasi e materiali degli ODP, fornitori dei centri: la data di modifica la scrive lo Store confrontando il contenuto (`stampChildRows`), non più chi modifica — che se ne dimenticava. Senza, il merge per riga dichiarato nello schema non poteva funzionare: due colleghi su due righe dello stesso ordine si sarebbero cancellati a vicenda.
- **Rinominare un'unità di misura** cambiava le righe dei documenti senza che risultassero da mandare.
- **Le righe tolte si contano**: `Store.pendingChanges()` porta `removeChildren` per le righe sparite da un padre che resta.
- **I fornitori di conto lavoro di un centro** sono dichiarati nello schema (`work_center_suppliers`) e nei riferimenti: prima restavano un array dentro il centro e la migrazione v1 non ne riscriveva il fornitore.
- **Famiglie predefinite con id non UUID** («fm1», «fp2»…) su archivi già v2: il seed ora nasce con UUID e chi li aveva li ritrova riparati al caricamento, articoli compresi.
- **`remapIds()`** riscrive anche gli utenti e tutti i campi di audit: è lo strumento per il passaggio all'autenticazione del backend.

**Verifica**
- 18 nuovi controlli in `test/righe-figlie.test.js` (suite da 1845 a 1863), 13 dei quali falliscono sulla 0.80.0.

### 0.80.0 — 2026-09-23

**Il Riepilogo ha un calendario.** I segnali dicevano *quante* cose sono in ritardo, non *quando* scadono. Le date c'erano già tutte — consegna della commessa, data entro cui ordinare, consegna confermata dal fornitore — ma ognuna nella sua vista: due scadenze sullo stesso martedì si scoprivano il martedì.

**Aggiunto**
- 📅 **Calendario scadenze** nel Riepilogo: griglia del mese (da lunedì), pallini colorati per gravità — rosso scaduto, arancio entro 7 giorni (la stessa soglia del fabbisogno), blu in programma — e sotto l'agenda del giorno scelto. Ogni voce porta al documento dove si risolve.
- Le date arrivano da dove sono già: **commesse** (consegna al cliente), **fabbisogno** (data entro cui ordinare, al netto, raggruppata per piano e giorno), **piani** (quando devono essere pronti), **ordini d'acquisto e ODL** (consegna confermata, o richiesta, delle righe non ancora ricevute; segnalate quelle confermate in ritardo), **ordini di produzione** lanciati o in corso (data di fine), **richieste inviate** senza risposta. Ogni voce si apre con `homeApri()`, la stessa strada dei segnali.
- **Scadute e non risolte** sempre in cima, qualunque mese si stia sfogliando: sfogliare avanti non deve nascondere proprio quello che è già in ritardo.
- 📌 **Promemoria** scritti a mano, per le scadenze che non stanno in nessun documento: data, importanza, commessa facoltativa, note. «✓ Fatto» li toglie dal calendario senza cancellarli; eliminati vanno nel cestino. Nuova collezione `reminders` (creata vuota sui database esistenti).
- Su telefono la griglia lascia il posto all'elenco dei **prossimi 14 giorni**.

**Permessi**
- I promemoria li scrivono amministratori, acquisti e progettazione (nuova area `agenda`); il lettore li vede e basta.

**Verifica**
- 20 nuovi controlli in `test/calendar.test.js` (suite da 1825 a 1845): origine e gravità di ogni tipo di data, raggruppamento, griglia a cavallo di mese e d'anno, promemoria e ruoli.
### 0.79.0 — 2026-09-14

**Nasce l'ordine di produzione (ODP): la successione delle fasi, e il magazzino che si muove anche per chi lavora in casa.**

Bomtrack sapeva cosa serve (fabbisogno), cosa comprare (ODA), cosa far lavorare fuori (ODL) e cosa c'è a scaffale (magazzino). Non sapeva **a che punto è un pezzo**, e il manuale lo dichiarava come limite al primo capitolo. Da lì discendevano tre cose che non tornavano, e la prima è la più grossa: **una parte con il ciclo tutto interno non aveva nessun documento**. Nessuno la lanciava, il suo materiale non usciva mai dal magazzino, e il pezzo finito non entrava mai se non con un *Carico manuale* scritto a mano. Il magazzino si muoveva **solo** passando da un ordine di lavoro, perché gli ancoraggi erano gli estremi delle *tratte esterne*: un ciclo senza fasi esterne non li aveva, e un ciclo misto li aveva solo sul tratto che usciva.

L'ordine di produzione è il documento che mancava: uno per parte da fabbricare, numerazione **ODP-anno-NNN**, con le fasi del ciclo **congelate in successione**.

**La regola del magazzino, e la correzione che l'ha scritta**
Il registro di magazzino racconta l'uscita e l'entrata **dal magazzino**; l'ordine di produzione racconta **il viaggio**. Sono due libri diversi e non devono raccontarsi a vicenda.

Ne discende la cosa che più distingue questo documento dal conto lavoro come era scritto prima: **fra le fasi non si registra niente**. Un movimento nomina una quantità di un **codice**, e fra la prima e l'ultima fase i pezzi non sono più il materiale e non sono ancora la parte — la parte lo diventano al rientro dell'ultima fase. Scrivere un movimento col codice della parte prima di allora inventa una giacenza che non esiste, e la fa comparire presso un terzista che quella parte non l'ha mai avuta.

Restano quindi **due movimenti soli per ordine**, identici per un ciclo tutto interno, tutto esterno o misto:
- all'**avvio della prima fase** escono i **codici del ciclo** — *Consumo di produzione* se quella fase è interna, *Uscita a conto lavoro* se è esterna;
- sull'**ultima fase** entra il **codice della parte**, per i pezzi buoni dichiarati — *Versamento di produzione* se interna, *Rientro da conto lavoro* se esterna.

Dove stanno i pezzi in mezzo lo dice la **fase corrente** dell'ordine, che è il posto in cui quella domanda ha davvero una risposta. Il prospetto *Presso terzi* guadagna quella seconda sorgente e la **dichiara**, invece di fonderla con la prima: le righe di un ordine di produzione portano il nome della fase accanto al codice. I movimenti di un ordine di produzione escono dal saldo per coppia (luogo, articolo), e non è un dettaglio: lì un'uscita di materiale a cui risponde un rientro del codice parte non si chiude mai, e il materiale resterebbe appeso al primo terzista anche dopo che i pezzi sono andati altrove.

Un solo tipo di movimento nuovo: **versamento di produzione**. Non si riusa `carico`, che si chiama «Carico manuale» ed è merce entrata *senza* un ordine — la stessa ragione per cui il rientro da conto lavoro non è un carico manuale. Come il passaggio di lavorazione, non si sceglie a mano dalla rettifica: senza un ordine dietro sarebbe un carico che nessuno spiega.

**La successione, e come si scavalca**
Una fase non si avvia finché la precedente non è chiusa, e il rifiuto **la nomina con i suoi numeri**: «la fase 10 Tornitura non è chiusa: 6 di 10». Un rifiuto muto manda a cercare per mezz'ora.

**Forza avvio** resta possibile — un pezzo campione da consegnare prima è un caso vero — e pretende un **motivo**, che finisce nello storico come dichiarazione a sé. Una forzatura non è un permesso speso e dimenticato: resta scritta accanto alla fase. Il testo del blocco è **lo stesso** che il mutatore userebbe per rifiutare: due frasi scritte a mano divergerebbero, e chi forza non saprebbe più se sta scavalcando quello che l'app gli ha appena detto.

**Pezzi buoni e scarti, e solo i buoni proseguono**
Su ogni fase si dichiarano pezzi buoni e scarti; la fase si chiude quando coprono i pezzi **entrati**. Cento lanciati, 95 buoni e 5 scarti alla fase 10 significa che alla 20 ne entrano **95**, e che a magazzino entra la **resa vera**, non la quantità lanciata. È la lettura onesta, e dà la gestione degli scarti senza campi in più.

**Le fasi hanno un id, non un indice**
È la differenza con le righe di ciclo, dove l'array *è* la definizione e la posizione è l'identità. Qui la fase porta un avanzamento: un'identità posizionale si sposterebbe sotto i piedi al primo riordino del ciclo, e l'avanzamento finirebbe sulla fase sbagliata. Congelando le fasi con un id proprio, **riordinare il ciclo non sposta niente** su un ordine già lanciato — e c'è un caso che lo verifica. La `phaseKey` resta sulla fase, ma solo come ponte verso il fabbisogno, dove continua a valere con i limiti già dichiarati.

L'avanzamento è un **registro di dichiarazioni**, non un campo: si calcola, come l'esistente si calcola da ricevimenti e movimenti. Nessun saldo scritto da qualche parte, quindi niente che possa divergere. Annullare una dichiarazione toglie **i suoi** movimenti, non quelli della fase: è per questo che ogni movimento porta l'id di chi l'ha generato.

**Nel fabbisogno**
Quarto pulsante, **Genera ordini di produzione**, uno per parte. Le parti da fabbricare diventano righe di documento con una chiave loro (`make#<id>`): senza il prefisso collidevano con la stessa parte comprata, e un ordine di produzione avrebbe bloccato un ordine d'acquisto su un articolo che nei due casi è una cosa diversa. Il **netto non si applica**: lanciare un pezzo è una decisione di produzione, non di acquisto. Una parte che si produce in casa non entra più nemmeno nelle richieste d'offerta — non si chiede a nessuno.

**Da fabbricare** smette di essere l'unica sezione muta del piano: fin qui non diceva né quando la parte servisse né se fosse già stata lanciata. Ora porta la data e il riferimento all'ordine, come le altre due.

**La convivenza, e cosa non è stato tolto**
Un ordine di produzione copre la sua parte **e le sue fasi esterne**: quelle escono dalla generazione diretta di ordini di lavoro dal piano e mostrano «coperta da ODP-…», perché l'ordine di lavoro si genera da lì — dove la successione dice anche *quando*. Le fasi **non** coperte restano generabili dal piano come prima, e un ordine di lavoro senza ODP dietro si comporta esattamente come prima, movimenti compresi. Ai dati esistenti non succede niente: due collezioni vuote e quattro campi nulli in più, e ogni condizione nuova è un `if (odpId)`.

**Dall'ordine di produzione all'ordine di lavoro**
Dalla fase esterna si commissiona la tratta al terzista: la riga passa dalla **stessa fabbrica** del piano e dell'ODL scritto a mano, e un caso la confronta campo per campo. La quantità sono i pezzi che ci sono davvero — i buoni usciti dalla fase precedente, non quelli lanciati. L'unione delle fasi in tratta non legge il ciclo vivo ma quella **congelata**: se il ciclo è cambiato dopo il lancio, al terzista si chiede quello che l'ordine gli ha promesso.

Su quella riga i comandi di conto lavoro dell'ODL diventano un **rimando** all'ordine di produzione, e la guardia sta **anche nel mutatore**, non solo nell'interfaccia che non disegna i comandi. I *pezzi rientrati* li scrive la dichiarazione fatta sull'ordine: il campo resta quello di sempre, con gli stessi lettori — il conteggio, lo stato automatico, l'elenco, gli export — e cambia solo chi lo scrive.

**Corretto per strada**
Il pulsante «Sblocca per modifica» di un **ordine di lavoro** chiamava `rfqUnlock`, che su un id di ODL non trova niente e torna in silenzio: il pulsante c'era e non sbloccava nulla. Il gestore si sceglie ora da una mappa invece che da una catena di ternari con un ramo mancante.

**Una frase che aveva smesso di essere vera**
Il fabbisogno dichiarava di non poter nettare le lavorazioni perché «l'app non ha un avanzamento di produzione». Adesso ce l'ha, e la frase è stata **riscritta invece che lasciata a mentire**: nettare una fase richiede di decidere cosa fare di quelle coperte da ordini di *altri* piani, che è la stessa discussione dell'impegnato sul materiale. Va fatta intera, e non è stata fatta: finché non lo è, la lavorazione resta lorda e la pagina dice perché. Stessa sorte per il limite dichiarato al primo capitolo del manuale.

**Note**
- **43 casi nuovi** in `test/odp.test.js`, e i tre che portano il peso sono i tre cicli: *solo interne* (il materiale esce una volta, il pezzo entra una volta, nessun passaggio), *solo esterne* (due movimenti e **niente** fra Beta e Gamma — il caso che fissa la correzione), *misto*. Poi la successione col rifiuto che nomina la fase bloccante, lo scarto che restringe la fase seguente, la forzatura tracciata, il codice parte che non compare mai presso un terzista prima del versamento, il riordino del ciclo che non sposta un ordine lanciato, la riga di ODL identica a quella del piano, e la convivenza provata — lanciata una parte, la sua fase esce dal piano e le altre restano. La suite passa a **1825** casi.
- Nuovo file `views-prod.js` (aggiunto anche alla cache del service worker: uno script fuori da lì funziona online e sparisce offline). `README.md`, `MANUALE.md` (capitolo 22 nuovo, i successivi scalano di uno) e `docs/cloud-schema.md` aggiornati: la regola dei due estremi è riscritta nella sua forma generale, con la ragione per cui fra le fasi non si scrive niente.
- **Due avanzamenti, e perché restano due.** La 0.77.0 aveva già portato un avanzamento: nella tabella *Da fabbricare* si dichiara quanti pezzi di una parte sono stati fatti, e le lavorazioni già fatte non si rimandano al terzista. Risponde a una domanda diversa da questa — «quanti ne sono stati fatti» contro «a che punto è questo pezzo, fase per fase» — e dichiara di non muovere il magazzino, mentre l'ordine di produzione lo muove ai due estremi del ciclo. Convivono, e la tabella *Da fabbricare* li mostra insieme: i pezzi dichiarati fatti accanto all'ordine che li ha lanciati.
Su una cosa dovevano però mettersi d'accordo, ed è stata sistemata qui: **un ordine di produzione si lancia per il residuo, non per il lordo**. Con quattro pezzi già dichiarati fatti su dieci, l'ordine nasce da sei — lanciarne dieci significherebbe rifare un lavoro che qualcuno ha appena dichiarato di aver fatto, che è esattamente ciò che il netto delle lavorazioni esiste per evitare. Il lordo resta in colonna, come sulle righe d'acquisto.

**Non fatto, e detto per non farlo nascere per sbaglio**: nessuna schedulazione (niente date di avvio, niente capacità finita), nessun netto sulle lavorazioni, nessun codice per il semilavorato fra due fasi, e il carico centri continua a mettere le ore nella settimana in cui il pezzo serve.

### 0.78.0 — 2026-09-12

Gli allegati cambiano forma: i PDF escono dal database e vanno in una **cartella d'archivio**, di cui Bomtrack memorizza soltanto il percorso. La suite passa da 1749 a **1782** casi.

**L'archivio è una cartella, non il database**
Fino alla 0.77.0 un allegato veniva caricato *dentro* Bomtrack: i byte in IndexedDB, i dati nel database. Funzionava, e pagava tre prezzi che si vedevano tutti. Il backup JSON non se li portava dietro — era scritto in tre posti, ma restava una scheda vuota su ogni PC nuovo. Un catalogo che vale per quaranta codici veniva copiato quaranta volte. E il PDF dentro il browser smetteva di essere il PDF che il fornitore aggiorna: diventava una fotografia di com'era il giorno che qualcuno l'ha caricato.

Ora la scelta è opposta. L'archivio **fisico** resta fuori: una cartella sul PC, o la cartella locale di un servizio sincronizzato — OneDrive, Dropbox — che è già su tutte le macchine di chi usa Bomtrack. L'app ne memorizza il **percorso relativo**, che è un dato come gli altri: passa da `Store`, entra nel backup JSON, e ripristinato altrove continua a valere purché quel PC abbia la sua copia dell'archivio. Chi aggiorna un disegno lo aggiorna nella cartella, con il programma vero, e Bomtrack punta già alla versione nuova senza che nessuno riallegi niente.

**La cartella è un'impostazione di questo PC**
Non sta nel database, e di proposito: ogni macchina ha il suo archivio, e scriverlo nel database vorrebbe dire imporre a tutti la lettera di unità di chi l'ha configurato per primo. Si sceglie una volta, con la finestra di sistema — un browser non apre un percorso scritto a mano, e non lo farà mai: è la ragione per cui esiste — e il riferimento si conserva, quindi non lo si rifà a ogni avvio. Il pulsante sta nella scheda **Allegati** e in **Gestione › Backup**: è una configurazione che deve poter sistemare chiunque apra un documento, non solo chi ha accesso a Gestione.

Il prezzo è dichiarato dove serve: funziona su **Chrome ed Edge**, e solo se Bomtrack è aperta dal suo indirizzo. Aperta con un doppio click su `index.html` il browser non ha nessuna origine sotto cui ricordare un permesso, e l'archivio non è disponibile — lì la scheda lo dice in chiaro invece di mostrare un pulsante che non fa niente, e resta il vecchio caricamento nel database, perché togliere a qualcuno l'unico modo che ha di allegare non è una semplificazione.

**Un documento, tanti codici**
È il caso che ha deciso la forma dei dati, ed è quello vero dei commerciali: lo stesso catalogo appeso a tutti gli articoli di una serie. Il documento (`attachmentDocs`) è censito **una volta sola**, i codici ci si **collegano** — e da lì viene tutto il resto. Rinominare o spostare un PDF si corregge in un punto, con «Ricollega», e i quaranta codici seguono; aprendo un documento si vede da quanti codici è citato; scollegare da un codice non è eliminare il documento, e un documento citato non si elimina, come il cliente citato da una commessa. Con un record per articolo lo stesso percorso sarebbe stato scritto quaranta volte, e il giorno del rinomina ci sarebbero state quaranta righe da correggere a mano, sperando di trovarle tutte.

**Descrizione e pagina**
I nomi dei file dei fornitori non dicono niente: `SKF-CAT-RS4412-IT-rev3.pdf` non si riconosce in una scheda. Ogni documento ha quindi una **descrizione**, ed è quella che si legge; la descrizione appartiene al documento, quindi riscriverla da un codice la corregge per tutti. La **pagina** invece appartiene al singolo collegamento: un catalogo di trecento pagine si apre dove serve a *quel* codice, e il numero resta scritto anche in chiaro, perché un catalogo si consulta anche stampato.

**Apri documento, e i tre messaggi**
Un pulsante nuovo sulla riga di catalogo e nel pannello laterale (Ctrl+I) apre il documento del codice; con più documenti apre l'elenco, invece di indovinare. Gli esiti sono **tre**, non due, perché sono tre rimedi diversi: *NESSUN DOCUMENTO SALVATO* quando al codice non è ancora collegato niente; *archivio non impostato su questo PC*, con il pulsante che lo imposta lì per lì, quando è la macchina a non sapere dove guardare; *DOCUMENTO NON TROVATO*, col nome cercato e la cartella dove l'ha cercato, quando il file da lì è sparito.

**La verifica dell'archivio**
Il difetto di questo disegno è il collegamento che si rompe **in silenzio**: qualcuno rinomina un PDF e nessuno lo sa finché non prova ad aprirlo, magari mesi dopo, magari davanti a un fornitore. In *Gestione › Backup* un comando scorre la cartella e nomina i documenti che non ci sono più — una volta per documento, non una per collegamento — e da lì si ricollegano.

**Copia nell'archivio**
Un PDF scelto da fuori — sul desktop, in una mail scaricata — non si può collegare: su ogni altro PC quel percorso non esiste. Il pannello lo dice e offre di copiarlo dentro l'archivio, senza mai sovrascrivere un nome già preso: il file che c'è appartiene a qualcun altro, e il codice che lo cita non saprebbe mai di aver perso il suo.

**Note**
- **33 casi nuovi** in `test/archivio.test.js`. L'harness guadagna una **cartella d'archivio finta** — scorribile, leggibile, scrivibile, con il permesso — che permette di provare le cose che nel browser vero nessuno prova a mano: il file rinominato, il permesso negato, il PC non configurato.
- L'IndexedDB finto dell'harness aveva **una sola tabella per tutti i nomi**. Finché esisteva solo il deposito dei byte non si notava; con la tabella `config` accanto, il riferimento alla cartella sarebbe risultato un file senza padrone e «Recupera spazio allegati» l'avrebbe buttato via. Ora le tabelle sono separate davvero, e un test lo tiene fermo.
- Collezione nuova `attachmentDocs`, dichiarata in `SCHEMA` e seminata da `migrateDB`. Resta **fuori da `REFS`**, come `orderId` sulle righe di movimento e per la stessa ragione: REFS è la mappa degli id *legacy* da riscrivere, e questi nascono con id UUID dal primo giorno.
- Gli allegati caricati nel database prima di questa versione **restano e continuano a funzionare**: la sezione «File nel database» compare nella scheda solo se ce n'è almeno uno, così a chi parte da zero non si racconta una forma che non deve più usare.

### 0.77.0 — 2026-09-11

Tre funzionalità nuove, scelte fra le mancanze che il manuale dichiara da sé. La suite passa da 1696 a **1743** casi.

**Avanzamento di produzione**
Era la prima voce di «cosa Bomtrack non fa», e la sua assenza si vedeva in un punto preciso: sul fabbisogno, accanto alle lavorazioni da mandare fuori, c'era scritto che il netto non si poteva applicare perché «sapere quanti pezzi sono già stati lavorati richiederebbe un avanzamento di produzione che l'app non ha». Ora ce l'ha. Nella tabella **Da fabbricare** ogni parte ha due colonne nuove — *fatti* e *restano* — e un pulsante che apre la scheda dell'avanzamento: si dichiara quanti pezzi sono stati fatti, con una nota, e si vede lo storico di chi ha dichiarato cosa e quando.

Non è un campo che si sovrascrive ma una **dichiarazione per volta**, sommata quando serve: è la stessa scelta che l'app fa per il magazzino, dove la giacenza non è un campo ma la somma dei movimenti, e per la stessa ragione — un totale che si ricostruisce si può spiegare, e si corregge senza riscrivere il passato. Un numero negativo corregge un conteggio sbagliato, come una rettifica, e la correzione resta visibile.

**Le lavorazioni già fatte non si commissionano due volte**
È la conseguenza diretta, ed è il motivo per cui la funzione esiste: una parte dichiarata finita ha attraversato tutte le sue fasi, quindi sparisce da «da far lavorare fuori» invece di finire in un ordine di lavoro che pagherebbe una seconda volta lo stesso lavoro. Quantità, ore e importi delle fasi seguono il netto. Il limite è dichiarato in chiaro dove si legge: una parte ferma **a metà ciclo** conta ancora per intero, perché si dichiara la parte finita e non la fase superata — il conto è prudente per scelta, si rischia di riproporre una lavorazione già avviata e mai di dimenticarne una da fare. Senza nessuna dichiarazione tutto si comporta **esattamente** come prima: i piani già aperti non cambiano da soli.

Dichiarare pezzi fatti **non muove il magazzino** e non tocca le righe d'acquisto del piano: il materiale per una parte si compra prima di farla, e averla fatta non annulla quell'acquisto. Due strade per la stessa giacenza darebbero due verità, ed è la cosa che questa funzione evita con più cura.

**Allegati: disegni e schede tecniche sugli articoli**
Ogni articolo ha ora una scheda **Allegati**, dal pulsante sulla riga di catalogo accanto al listino — e dal **pannello laterale** (Ctrl+I) in Acquisti, Progetto e Magazzino, dove il comando porta il conteggio nell'etichetta come già fa «Movimenti». Il comando resta visibile anche a chi ha la vista in sola lettura: scaricare un disegno e modificare l'anagrafica sono due permessi diversi, e chi va in officina col foglio in mano non è detto che abbia il secondo. Da lì: si aggiungono disegni, PDF, foto e file CAD fino a 25 MB l'uno, si riscaricano con un click, e il numero di allegati si vede dall'elenco senza doverli aprire. La scheda articolo li elenca, in sola lettura come tutto il resto di quella scheda.

I **file** stanno in IndexedDB, i **dati** (nome, dimensione, a quale articolo, chi e quando) in `db.attachments` come ogni altra collezione. La divisione non è un dettaglio tecnico: un solo disegno pesa più di tutto il database, e metterlo in `localStorage` non l'avrebbe fatto crescere — l'avrebbe fatto **smettere di salvare**, insieme a tutto il resto del lavoro. Il prezzo va detto, ed è scritto in tre posti: **il backup JSON non contiene i file**, ne porta l'elenco. Ripristinandolo su un altro PC si vede che cosa manca invece di trovare una scheda vuota; prima di trasferirsi i file vanno riscaricati a mano. In Gestione › Backup un pulsante recupera lo spazio dei file rimasti senza più un articolo.

**L'app si installa e funziona senza rete**
`manifest.webmanifest` e `sw.js`: Bomtrack si può installare come applicazione, con un'icona sua, e una volta aperta funziona offline — manuale compreso, che è proprio quello che serve consultare quando la rete manca. Il service worker mette in cache il programma, mai i dati: quelli restano dove sono sempre stati. Aperta con un doppio click su `file://` non cambia niente: lì i service worker non esistono, l'app se ne accorge e tace, ed è la ragione per cui le librerie di export stanno in `vendor/` invece che nella cache.

**Note**
- **47 casi nuovi** in tre file: `test/produzione.test.js` (23), `test/allegati.test.js` (15) e `test/pwa.test.js` (11). L'harness guadagna un **IndexedDB finto**, che mancava: era l'ultimo pezzo di piattaforma non simulato.
- `test/pwa.test.js` guarda le tre cose che si rompono **in silenzio** e solo offline: uno script aggiunto alla pagina e dimenticato nel service worker, la versione della cache non aggiornata (i browser già visitati continuerebbero a servire quella vecchia, per sempre) e un file elencato che non esiste, che facendo fallire `addAll` lascerebbe l'app senza cache senza dirlo.
- Gli allegati sono nati nella scheda articolo e sono stati **spostati** in una scheda propria: `test/iteminfo.test.js` difende l'invariante «la scheda non modifica niente», ed è una proprietà che vale più di una scorciatoia. Gli editor per articolo stanno sulla riga di catalogo, dove ci sono già il listino e la distinta.
- Due collezioni nuove — `attachments` e `productions` — dichiarate in `SCHEMA` e in `REFS`, seminate da `migrateDB` e presenti nel backup.

### 0.76.0 — 2026-09-11

Giro di controllo generale sul codice. Nessuna funzionalità nuova: si chiudono difetti trovati leggendo, e si copre con i test la parte che ne era rimasta fuori. La suite passa da 1657 a **1696** casi.

**Due schede aperte non si cancellano più il lavoro a vicenda**
`Store.commit()` riscrive l'intero archivio con la fotografia che ha in memoria. Con due finestre di Bomtrack aperte — che su un gestionale è la normalità — la seconda che salvava cancellava tutto ciò che la prima aveva fatto nel frattempo: senza un errore, senza un avviso, senza nemmeno il badge «modifiche non salvate», perché la scrittura andava a buon fine. Era perdita di dati certa e invisibile. Ora l'archivio porta un contatore di revisione in una chiave sua, che si legge prima di ogni salvataggio: se qualcun altro ha scritto, il salvataggio si ferma e lo dice. Si può ricaricare (si perde quello che si stava facendo qui) o tenere la propria versione (si perde quello che ha fatto l'altra scheda), e la finestra dice per ciascuna che cosa costa, offrendo l'export di un backup prima di scegliere. **Non si fonde niente, di proposito**: per fondere due fotografie bisognerebbe sapere riga per riga quale delle due versioni vale, e quella risposta non ce l'ha né l'app né chi la usa. L'altra scheda che scrive si fa sentire subito, non al primo salvataggio: chi continua a lavorare su dati ormai vecchi accumula modifiche che poi non potrà più salvare senza cancellare quelle altrui.

**Il totale dei documenti torna con la somma delle righe**
La colonna Importo arrotondava ogni riga ai centesimi per stamparla, il piede sommava i prodotti a piena precisione e arrotondava solo alla fine. Con i prezzi a quattro decimali che il listino ammette, tre righe da 1×1,005 stampavano 1,01 + 1,01 + 1,01 in colonna e 3,02 sotto. È un PDF che parte verso un fornitore, e un totale che non torna tocca a qualcuno spiegarlo. Ora l'importo si arrotonda una volta sola, dove nasce (`importoRiga` in `core.js`), e il totale somma esattamente ciò che il fornitore legge — a schermo, in PDF e in Excel, dove la colonna si somma per davvero.

**Le condizioni non spariscono più in fondo ai PDF**
Trasporto, pagamento, conferma e note erano scritte a coordinata crescente, senza mai guardare dove finisse la pagina. Una nota lunga usciva dal margine destro e veniva tagliata; su un ordine con molte righe le condizioni venivano disegnate oltre il bordo, dove non c'è carta. In entrambi i casi il PDF si generava senza un errore, e la mancanza si scopriva solo andando a cercarla. Il testo ora va a capo sulla larghezza utile e passa a una pagina nuova quando serve, anche a metà di una nota più alta di un foglio intero.

**Un fornitore che ha i nostri pezzi non si cancella più**
`supplierUses()` controllava sette posti ma non i movimenti di magazzino, benché la scheda del movimento **pretenda** il terzista («senza, non si sa da chi sta la merce»). Cancellandolo, il prospetto «presso terzi» raggruppava sotto «senza fornitore» materiale che è nostro e sta fisicamente da qualcuno: la domanda a cui quel prospetto serve a rispondere restava senza risposta, e senza più niente da cui ricostruirla.

**I nomi dei file esportati non si rompono più**
In officina «AB/123-01» è un codice normale, e «Rossi & C. / Milano» una ragione sociale normale: finivano tali e quali nel nome di PDF ed Excel. Il browser, davanti a un nome invalido, non protesta — tronca, o salva con un altro nome, e il documento non si ritrova. Un solo `nomeFileSicuro()` in `core.js` ripulisce i dieci punti che esportano, lasciando intatti accenti e spazi, che in un nome di file vanno benissimo.

**Il pannello «Aggiungi componenti» non si svuota più da solo**
Le quantità dovevano restare impostate «finché non si inserisce, si cambia distinta o si chiude il pannello» — così dice il commento che le governa. In realtà si azzeravano a ogni ridisegno della vista: bastava espandere un nodo dell'albero per perdere le quantità messe su dieci articoli, il testo di ricerca e il punto in cui si stava scrivendo. Ora si azzerano solo quando la distinta cambia davvero.

**La schermata d'accesso parte anche dove il browser nega l'archivio**
Erano gli ultimi tre accessi a `localStorage` senza `try/catch`, e stavano sulla schermata che ogni utente attraversa per forza. In navigazione privata, con i dati dei siti bloccati, o su `file://` con lo storage negato, `renderLogin()` moriva sulla prima riga e la schermata non si disegnava affatto: l'app era inutilizzabile proprio nello scenario che l'avviso «dati non caricati» esiste per raccontare.

**Chiudere la scheda con del lavoro per aria adesso chiede**
Il salvataggio fallito e i documenti a metà compilazione (`rfqDirty`, `orderDirty`, `odlDirty`) erano già noti all'app, e nessuno li guardava all'uscita. Si chiede solo quando c'è qualcosa in sospeso: un avviso che compare sempre è un avviso che si impara a scacciare senza leggerlo.

**Rinominare un'unità di misura porta con sé la seconda**
Una barra si gestisce in metri e si compra a chilo: il chilo vive in `altUom` sull'articolo e in `priceUom` sulla riga di listino. La rinomina li lasciava indietro e il conteggio d'uso non li vedeva — al punto che l'unità che convertiva i prezzi di mezzo magazzino risultava «non usata» e si poteva cancellare con un click. Le conversioni continuavano a tornare (i due campi si guardano fra loro, non l'elenco), ma anagrafica ed elenco raccontavano due cose diverse.

**Selezione multipla: da quadratica a lineare**
Con «Mostra tutti» su qualche migliaio di righe e un Maiusc+click dal primo all'ultimo articolo, l'Ispettore faceva milioni di confronti a ogni ridisegno della griglia — cioè a ogni carattere digitato nel filtro. Tre `Set` al posto di altrettante ricerche lineari.

**Minori**
- I messaggi di `requirePdf`/`requireXlsx` nominano il file mancante invece della connessione a internet: dalla 0.43.0 le librerie stanno in `vendor/`, e quella frase mandava a cercare il guasto dalla parte sbagliata.
- I caratteri non bloccano più il primo disegno della pagina: erano un `<link>` normale, e su un PC di officina senza rete l'attesa diventava il timeout del DNS — finestra bianca per secondi, a ogni avvio. Se non arrivano, `style.css` ha già i ripieghi.
- Tolto `aria-modal` dalle schede: dichiarava inerte tutto il resto della pagina, che qui per scelta non lo è — le schede si lasciano aperte e la vista dietro resta viva. Due schede aperte insieme si dichiaravano entrambe «l'unica». Resta `role="dialog"`.
- Il filtro del picker catalogo cerca in codice e descrizione, non nel testo dell'intera riga: scrivere «parte» non filtrava più niente, «obsoleto» pescava articoli che non c'entravano.
- Il report d'import dice «righe saltate» invece di «righe vuote»: contava insieme le righe vuote, quelle senza tipo e quelle dell'altro ambito, e dichiarava «312 righe vuote» di un file pieno.
- `ico()` fa passare il `title` da `esc()`, unico punto del disegno fuori dalla convenzione; la dimensione del database nella conferma di azzeramento è arrotondata come altrove; tolta `inspectorRigaDi()`, rimasta senza chiamanti, che costruiva un selettore CSS per concatenazione.

**Note**
- **39 casi nuovi** in tre file: `test/concorrenza.test.js` (due schede sullo stesso archivio, con il `localStorage` condiviso fra due istanze), `test/export-docs.test.js` e `test/anagrafiche.test.js`.
- Gli export dei documenti avevano un test: **nessuno**, ed è la ragione per cui `docs/analisi-tecnica.md` teneva aperta la deduplica della presentazione (C1) — «un export si verifica sui dati che produce, non sul PDF: serve prima quello». Ora c'è: jsPDF e SheetJS sono sostituiti da due finti che annotano righe, piede e nome del file. Il primo a scriverlo ha subito trovato un limite della correzione sulle pagine, che senza non sarebbe venuto fuori.
- `test/scripts.test.js` guadagna un controllo sulle **collisioni di nomi globali**. I 26 script condividono un unico scope e due dichiarazioni dello stesso nome non danno errore: vince l'ultima caricata, in silenzio. Oggi i nomi sono 1291 e le collisioni zero; il controllo serve a tenerle zero, senza dover rinunciare all'apertura da `file://` che `C4` dava per prezzo obbligato.
- Una correzione è stata **annullata** dopo il test: leggere «1.500» come millecinquecento in import. `test/import.test.js` documenta la lettura decimale come scelta deliberata — con un separatore solo non si indovina, e `0.750` sono settantacinque centesimi — e la scelta regge.
- `docs/analisi-tecnica.md` riallineato: era fermo alla 0.43.0 con il codice alla 0.75.0.

### 0.75.0 — 2026-09-10

**Barra Filtri a scomparsa, con ambito condiviso fra le viste**
Acquisti, Progetto, Magazzino, Cicli di lavorazione e Gestione DB avevano ciascuno la propria barra filtri, sempre in vista — una ventina di controlli in tutto — e indipendente dalle altre: scegliere una famiglia in Acquisti non aveva alcun effetto su Magazzino. La barra resta esattamente dove è sempre stata, ma ora parte **chiusa**: mostra solo il pulsante **Filtri**, le pasticche di ciò che sta restringendo l'elenco in quel momento e, quando c'è qualcosa da togliere, **Rimuovi filtri**. Aprirla è una sola scelta per tutta l'app — chi la apre in una vista se la ritrova aperta anche nelle altre — perché per chi la usa è la stessa domanda ovunque: «cosa mi mostra questo elenco?».

**Famiglia, sottofamiglia, macchina e gruppo seguono la navigazione**
Dove una vista li ha già in barra, questi quattro campi diventano anche **condivisi**: sceglierli in Progetto li ritrova già impostati passando a Magazzino o a Gestione DB, così si può restringersi a una macchina o a una famiglia e lavorarci muovendosi fra le viste, senza riselezionarla ogni volta. Una famiglia che in un'altra vista non esiste — materie prime/commerciali e parti restano ambiti diversi, come già nei filtri di sempre — semplicemente non si applica lì, e la pasticca segue sempre il campo vero della vista aperta, mai la scelta condivisa: non mente su cosa sta filtrando davanti agli occhi. **Rimuovi filtri** azzera insieme i campi locali della vista e l'ambito condiviso, così la restrizione sparisce per davvero e non ricompare cambiando pagina. Restano fuori, di proposito: il *Carico centri* (filtra per piano e centro di lavoro, un altro genere di domanda) e i filtri delle viste documento — Commesse, Fabbisogno, Richieste, Ordini — che restano quelli di sempre, nella colonna a destra.

**I controlli non si ricreano mai**
Stesso `id`, stesso comportamento di sempre: aprire o chiudere la barra è solo una classe sul `<body>`, non un ridisegno — altrimenti scrivere nel campo di ricerca avrebbe perso il focus a ogni filtro applicato. Il campo condiviso, quando cambia, chiama in più una funzione che ricorda la scelta; l'unico punto delicato era l'ordine: lo scope condiviso va scritto **dopo** che la vista ha già rifatto le proprie `<option>` (famiglie, macchine), non prima — un `<select>` non accetta un valore che fra le sue opzioni correnti non c'è ancora, e prima di questo aggiustamento la propagazione falliva in silenzio alla prima vista mai visitata in quella sessione.

**Note**
- **15 casi nuovi** in `test/filters.test.js`, più gli aggiustamenti a `openCycleFor` (che già azzerava i filtri locali entrando direttamente su una parte: ora azzera anche l'ambito condiviso, altrimenti lo riscriverebbe subito dopo sugli stessi campi appena svuotati). La suite passa da 1632 a **1647** casi.
- Verificato anche nel browser vero, non solo nei test: l'elemento finto dell'harness non simula la selezione via `<option selected>`, quindi l'ordine sync-poi-scope si vede solo lì — la classe di bug che ha portato al punto precedente.
- `README.md` aggiornato con il nuovo paragrafo della barra Filtri.

### 0.74.0 — 2026-09-10

**La divisione per famiglia si può spegnere, e vive nel pannello Colonne**
Acquisti, Progetto e Magazzino spezzavano sempre l'elenco in una tabella per gruppo (macrofamiglia, o tipo per gli assiemi): non c'era modo di tornare a una lista sola. Il pannello **Colonne** porta ora anche l'interruttore **Dividi l'elenco per famiglia** — acceso di serie, come oggi — e spegnerlo ridisegna una tabella unica, con la stessa paginazione ("Mostra altri"/"Mostra tutti") di prima. La scelta è per vista come le colonne: si può tenere Acquisti diviso e Magazzino no.

**Il pannello Colonne offre tutti i campi che un elenco può ospitare**
Fino a ieri il registro delle colonne conteneva solo quelle già mostrate. Acquisti, Progetto e Magazzino guadagnano sottofamiglia, fornitore, doppia unità d'acquisto (UM acquisto/fattore), scorta minima, lotto, note e autore delle modifiche; Magazzino aggiunge anche modalità lotto, presso terzi e in lavorazione; Progetto aggiunge concetto e approvvigionamento, che riguardano solo le parti — e per questo Progetto smette di essere un clone delle colonne di Acquisti e diventa un registro suo. Tutte le colonne nuove nascono **nascoste**: chi non apre mai il pannello continua a vedere l'elenco di sempre, chi le accende le ritrova domani.

**Filtri Macchina e Gruppo in Progetto e Magazzino**
Accanto a famiglia e sottofamiglia, due nuove tendine restringono l'elenco a una sola macchina o a un solo gruppo — lo stesso filtro che la vista Gestione DB aveva già, ora anche dove si guardano gli articoli invece della distinta. Scegliendo una macchina restano lei, i suoi gruppi, sottogruppi e parti; scegliendo un gruppo ci si restringe a quello. In Magazzino il filtro vale solo per le parti — commerciali e materie prime non sono mai legati a una macchina, come già succede con la famiglia sugli assiemi. Il filtro applicato finisce anche nell'export, come gli altri.

**Note**
- **12 casi nuovi** fra `test/columns.test.js`, `test/codes.test.js` e `test/export-lists.test.js`: colonne nascoste di serie che si accendono e tornano a spegnersi, l'interruttore di divisione (di serie acceso, per vista, sopravvive al ridisegno), `itemGrid` che disegna una tabella sola a divisione spenta, Progetto che non è più un clone di Acquisti, e i filtri macchina/gruppo su tutto l'albero (macchina → gruppo → sottogruppo → parte) incluso il caso limite di Acquisti, che quei filtri non li ha. La suite passa da 1620 a **1632** casi.
- `README.md` aggiornato: il paragrafo delle colonne descrive l'interruttore e i campi nuovi, e Progetto/Magazzino descrivono i filtri macchina e gruppo.

### 0.73.0 — 2026-09-09

**Manuale d'uso**
Nasce `MANUALE.md`: il manuale operativo dell'app, scritto per chi la usa invece che per chi la sviluppa. Trentaquattro capitoli più un'appendice tecnica, con indice cliccabile.

Il README raccontava già quasi ogni funzione, ma la raccontava **per funzione e per motivo**: perché il passaggio di lavorazione non muove la giacenza, perché il netto non si applica alle lavorazioni. Chi arriva nuovo ha però un'altra domanda — *da dove comincio, e poi cosa faccio* — e a quella il README non rispondeva da nessuna parte. Il manuale è organizzato **per compito**, e il suo capitolo portante è il **flusso di lavoro**: lo schema del giro completo, dagli archivi di Gestione alla merce che entra a magazzino, e ogni tappa in prosa con il rimando al capitolo di dettaglio (preparare gli archivi → costruire il prodotto dal basso → costificare → commessa e piano → comprare → far lavorare fuori → chiudere il giro).

Ogni capitolo di schermata segue la stessa griglia — *a cosa serve, come ci si arriva, cosa si vede, comandi, filtri, finestre, da sapere* — così la risposta sta sempre nello stesso punto della pagina. I pulsanti sono chiamati **con il nome esatto che hanno a video**: un manuale che li chiama in un altro modo è peggio di nessun manuale.

Sono documentati per esteso i punti su cui si sbaglia davvero: i **sei tipi di movimento** con il loro effetto sulla giacenza, i **due soli punti in cui il conto lavoro muove il magazzino** (e perché gli estremi sono quelli del ciclo, non quelli del documento), la differenza fra *Rientrati* su un ODL e il carico vero, la tabella di **cosa resta modificabile in ciascuno stato** con le transizioni automatiche, e i quattro avvertimenti del Carico centri. Chiudono un **glossario** di trenta voci (tratta, passata, impegnato, libero, saturazione, concetto…) e una sezione di **domande frequenti** che parte dai sintomi — «il costo di una parte è zero», «non trovo un fornitore nel menu», «ho perso i dati».

L'**appendice tecnica** raccoglie quello che serve a chi installa, sposta o sviluppa: stack e assenza di build, le chiavi di `localStorage` con la distinzione fra archivio e preferenze personali, le collezioni del modello dati, la mappa dei file sorgente, i test e i limiti architetturali.

I limiti dichiarati stanno **nel primo capitolo**, non in fondo: nessuna schedulazione, nessun avanzamento di produzione, un archivio per browser, e i ruoli che separano le responsabilità senza essere sicurezza. Un manuale che li nasconde in appendice fa cercare per mezz'ora una funzione che non esiste.

**Il manuale dice già come si lavorerà con l'archivio condiviso**
Nuovo capitolo 30, «Quando l'archivio è condiviso (Supabase)», in fondo alla parte Amministrazione. Si apre dichiarando che **non è ancora attivo** — chi legge il resto del manuale non deve cercare funzioni che non troverà — e poi risponde alle domande che si fanno prima di passare, non dopo.

Il cuore del capitolo è **chi vince quando due persone toccano la stessa cosa**, perché in squadra è l'unica domanda che conta e la risposta non è la stessa dappertutto: due quotazioni sullo stesso articolo **convivono**, una distinta salvata da due persone no — l'ultimo sostituisce l'insieme, perché metà distinta di uno e metà dell'altro è un prodotto che nessuno ha progettato. Da lì la regola pratica: sulle righe di un listino o di un ordine si lavora insieme senza pensarci, su una distinta ci si mette d'accordo.

Poi le cose che vanno **decise prima e preparate adesso**: un solo archivio di verità (due archivi divergenti non si fondono, e uno dei due lavori va rifatto), le password che non migrano, i codici duplicati da ripulire finché sono un fastidio di uno solo, il backup fuori sede — che il piano gratuito non fa — e il ping contro la sospensione dopo sette giorni d'inattività, da predisporre prima di agosto e non il 25 agosto. Chiude con quanto regge il piano gratuito (il primo limite è la banda, non lo spazio) e con l'avviso che **gli allegati cambiano il conto di colpo**: 1 GB sono circa mille PDF da 1 MB.

Una sezione dice **cosa non cambia**, ed è quasi tutto: schermate, comandi, flusso di lavoro, codici, ruoli, cestino, export. È il motivo per cui il manuale non andrà riscritto.

Sei rimandi nei punti dove l'uso cambia davvero — i limiti dichiarati al capitolo 1, l'avviso sui dati nel browser, i ruoli che non sono sicurezza, il backup, le domande frequenti e l'appendice tecnica — più tre voci di glossario. La parte Riferimenti scala di uno.

**Il manuale sta dentro l'app**
Un pulsante 📖 nell'intestazione, accanto a Stampa, apre `manuale.html` in una scheda sua. Il manuale si consulta **mentre** si lavora — chi cerca come si registra un rientro da conto lavoro ha l'ordine di lavoro aperto davanti, e non deve perderlo per leggere come si fa.

`manuale.html` sta nella cartella accanto a `index.html` e **non chiede niente alla rete**: il markdown è già impaginato nel file, indice e ancore compresi, quindi la pagina resta leggibile e navigabile anche **senza JavaScript** — che aggiunge soltanto il filtro dei capitoli, l'evidenziazione di dove si è e il cassetto dell'indice sugli schermi stretti. Come tutto il resto dell'app viaggia con la cartella, quindi il manuale c'è anche sul PC in officina che la rete non ce l'ha. Usa i token di tema e i font di Bomtrack, e legge `bomtrack_theme`: chi ha scelto il chiaro nell'app apre il manuale in chiaro.

`genera-manuale.py` rigenera `manuale.html` da `MANUALE.md` con un comando solo (`python genera-manuale.py`), guscio della pagina incluso nello script. Il markdown resta **l'unica fonte**: due copie da aggiornare a mano avrebbero cominciato a divergere il giorno dopo. Nuova icona `book`, tracciata sulla stessa griglia 24×24 delle altre.

Il README rimanda al manuale in testa, e resta quello che era: la documentazione funzionale, orientata al perché delle scelte.

### 0.72.1 — 2026-09-08

Controllo mirato sul conto lavoro e sugli ordini di lavoro, dopo la segnalazione di una tabella disallineata in Gestione (già corretta a parte). Tre punti rimasti aperti da quel controllo, tutti chiusi qui.

**Corretto: una fase interna mandata fuori apposta non muoveva mai il magazzino**
L'app permette di mettere in un ordine di lavoro anche una fase che il ciclo fa in casa ("il ciclo la fa in casa: mettendola qui la si manda fuori questa volta") — un caso vero, non un errore da impedire. Ma quella fase non coincideva mai con la prima o l'ultima tratta **esterna del ciclo**, semplicemente perché non lo è: restava sempre un passaggio, e né la spedizione né il rientro toccavano mai la giacenza. Ora una fase così, non incatenata alle tratte esterne che il ciclo dichiara, esce e rientra ai suoi due estremi come qualunque lavorazione esterna — senza cambiare nulla per le tratte che il ciclo dichiara davvero esterne, singole o a più passate.

**Corretto: cambiare Interna/Conto lavoro su una fase di ciclo poteva azzerare ore o giorni**
Il tempo di una fase si misura in due unità diverse — ore su una interna, giorni di attraversamento su una in conto lavoro — e i due campi non stanno mai a video insieme. Cambiando il fornitore, la riga si ridisegna un istante dopo il salvataggio: il salvataggio guardava però il fornitore **appena scritto** invece di quello che il campo a video rifletteva ancora, leggeva quindi un input che non c'era e azzerava in silenzio ore o giorni già inseriti. Stesso meccanismo, un'ora mai digitata da nessuno finiva su una fase esterna a costo fisso appena creata, perché il campo Ore (nascosto, a costo fisso su un centro esterno) nasceva con un valore proposto di serie invece che a zero.

**Corretto: nella scheda di un piano, il dettaglio del carico centri mostrava un altro conto**
La tavola "Carico dei centri" dentro la scheda di un piano dichiara esplicitamente di contare solo quel piano — c'è la frase sopra la tavola che lo dice. Cliccando una cella, però, il dettaglio veniva ricalcolato sui filtri globali della vista Carico centri (di norma: tutti i piani aperti insieme), un numero diverso da quello appena letto in tabella; se il piano era chiuso, poteva anche non trovare nulla. Ora il dettaglio aperto da dentro un piano usa lo stesso conto della tavola che lo ha aperto; dalla vista Carico centri il comportamento resta quello di sempre. Anche il nome del centro, dentro la scheda di un piano, ha smesso di essere un link che cambiava un filtro di un'altra vista senza muovere nulla a video.

**Copertura di test**
21 casi nuovi fra `test/contolavoro.test.js`, `test/cycle-op.test.js` e `test/carico.test.js`: la fase interna mandata fuori scarica e carica come una vera esterna senza toccare le tratte genuinamente esterne (singole o a più passate); ore e giorni sopravvivono al cambio di fornitore in entrambe le direzioni, e una fase esterna a costo fisso non nasce più con un'ora fantasma; il dettaglio di una cella nella scheda di un piano risponde con lo stesso conto della tavola, un piano cancellato non apre nulla, e la vista Carico centri conserva link e somma su tutti i piani.

### 0.72.0 — 2026-09-08

**Un ordine di lavoro è una tratta, non una fase — e il magazzino si muove ai due estremi del ciclo, non a quelli del documento.**

**Corretto: il magazzino si muoveva alla fase sbagliata**
Gli ancoraggi del conto lavoro guardavano **le righe del documento**. Una parte con fasi 10 interna, 20 Beta, 30 interna, 40 Beta ha **due** ordini di lavoro da Beta, e ciascuno — essendo prima e ultima riga di sé stesso — offriva sia lo scarico sia il carico: il materiale usciva due volte e il pezzo finito si caricava due volte. Ora gli estremi che contano sono quelli del **ciclo**:
- alla **prima tratta esterna** esce il **materiale del ciclo**, e scarica;
- all'**ultima tratta esterna** entra il **pezzo finito**, e carica;
- a ogni altro estremo si sposta il **pezzo stesso**, e non carica né scarica.

**Un terzo tipo di movimento: il passaggio di lavorazione**
Il pezzo che torna da un terzista per andarne a un altro non entra e non esce dal magazzino: **cambia luogo a quantità invariata**. Il movimento `clStep` lo dice, e porta due estremi — da chi arriva, a chi va — uno dei quali nullo, perché fra due terzisti il pezzo passa sempre da noi. È l'**unica eccezione** alla regola dell'esistente, scritta in un predicato solo (`movimentoToccaMagazzino`) invece che in un `if` sparso in ogni punto che somma movimenti:

> esistente = Σ ricevuto + Σ movimenti **che toccano il magazzino**

Fra due tratte i pezzi compaiono nel prospetto sotto **«in casa, fra due fasi»**: esistono, non sono a scaffale e non sono da nessun terzista, e questo è l'unico posto che li conta. Il filtro di magazzino diventa *presso terzi o in lavorazione* — la domanda che lo apre è la stessa, «cosa ho in giro?».

**Una riga per tratta, e un documento per passata**
- Le fasi **consecutive** dello stesso terzista sono **una** lavorazione da commissionare, non due righe da spuntare: stanno in una riga sola — «fasi 20-30» — con prezzo e giorni sommati e il dettaglio di ciascuna nella nota. Spuntarne una e non l'altra produceva un ordine che non stava in piedi.
- Le fasi dello stesso terzista **non** consecutive vanno in **ordini di lavoro distinti**: fra le due il pezzo torna da noi, e chiedergliele insieme era un ordine che il terzista non poteva eseguire di seguito. Il criterio è la *passata*, e nella scheda di generazione il secondo gruppo si chiama per nome — «Beta — seconda passata» — o due gruppi identici non si distinguerebbero.
- La **richiesta d'offerta** invece le tiene insieme, ed è voluto: chiedere non è commissionare, e a un preventivo si risponde una volta. Alla conversione in ordine si separano.
- La riga di documento porta ora `phaseKeys`, l'elenco di **tutte** le fasi che copre. Indicizzando solo la prima, le fasi in mezzo risultavano ancora da documentare e il fabbisogno le riproponeva — in un ordine che le conteneva già.

**Una volta sola, per davvero**
Niente impediva di registrare due volte la stessa uscita. Il conto si legge dai movimenti, che l'ordine e la riga li portano già: la scheda propone il **residuo**, e a residuo zero lo dice invece di riproporre il modulo come se niente fosse. Superarlo resta possibile — una rispedizione dopo uno scarto è legittima — perché vietarlo avrebbe trasformato un caso vero in un motivo per registrare fuori dall'app.

**Un ordine di lavoro scritto a mano**
Fin qui un ODL nasceva solo da un piano: l'unico modo di riempirne uno vuoto era la riga manuale, testo libero senza tariffa dal ciclo e senza nessuno dei comandi del conto lavoro. Ora **+ Lavorazione da ciclo** fa scegliere la parte fra quelle che un ciclo ce l'hanno, poi la tratta e i pezzi. Si vedono **tutte** le fasi — anche quelle di un altro terzista e quelle interne, marcate in elenco — perché mandare fuori una lavorazione che di solito si fa in casa è un caso vero, e l'app lo segnala invece di impedirlo. La riga che ne esce passa dalla **stessa fabbrica** di quella generata dal fabbisogno, e un caso lo verifica campo per campo. L'ordine però non è legato a nessun piano, ed è detto in pagina: lì la fase continuerà a risultare da ordinare.

**Carico centri: i codici, e il grafico**
- Sotto la tavola, **i codici da produrre**: codice, pezzi, settimana e le fasi interne con ore per pezzo e ore totali, ordinati per settimana e per ore decrescenti — la domanda che ci si fa guardandoli è «cosa lancio per primo». «62 ore alla tornitura» senza sapere su quanti pezzi era un numero da credere sulla parola. I **pezzi** non si sommano fra le fasi di uno stesso codice (ogni fase lavora gli stessi pezzi); le **ore** sì.
- Sopra, un **grafico a barre** per centro: una barra per settimana, la capacità come linea tratteggiata, gli stessi colori della tavola — neutro fino all'85%, arancio fino al 100%, rosso sopra. Un centro senza capacità dichiarata disegna le barre e nient'altro. Il grafico serve a dire **dove guardare**, non sostituisce i numeri: ogni barra porta il suo, e la tavola resta la lettura esatta.
- SVG scritto a mano, nessuna libreria nuova: le tre in `vendor/` ci sono perché un PDF e un foglio Excel non si scrivono a mano, un grafico a barre sì — e una libreria in più sarebbe un file in più da riverificare a ogni aggiornamento. Ogni blocco porta un `aria-label` che riassume il centro, per chi il disegno non lo vede.
- Cliccando il nome di un centro le due letture si restringono a quello, e il filtro entra anche nell'intestazione dell'export. L'export ha ora **due sezioni**, in forma lunga.

**Un saldo che si legge in ordine di data**
Emerso provando il giro con **lo stesso** terzista due volte: il saldo del presso-terzi era la differenza fra due totali, e la prima volta che i perni tornavano da Beta *uscivano* dal suo registro senza esserci mai entrati — da lui erano arrivati come tondo, e la trasformazione non la scrive nessuno. Quella partenza senza arrivo annullava il ritorno vero della seconda tratta, e il prospetto diceva che da Beta non c'era niente mentre i pezzi erano là. Il saldo si calcola ora **in ordine di data**, azzerando a ogni passo quel che andrebbe sotto zero: è la stessa regola già scritta — un saldo negativo è una trasformazione, non un debito — applicata a ogni passaggio invece che al totale.

**Note**
- **57 casi nuovi**, e i due che portano il peso sono il giro completo delle quattro tratte (il materiale esce **una** volta, il pezzo si carica **una** volta, e i due gesti in mezzo non toccano la giacenza) e il confronto campo per campo fra una riga scritta a mano e una generata dal piano. Poi le tratte e le passate, il residuo che si azzera, l'ordine di lavoro vecchio a una riga per fase che **conserva gli ancoraggi di prima** senza nessuna migrazione, i codici da produrre, e il grafico verificato contro la tavola invece che contro sé stesso. La suite passa da 1550 a **1607** casi.
- `README.md` e `docs/cloud-schema.md` aggiornati: la regola dell'esistente è riscritta con la sua eccezione, non lasciata in contraddizione.

### 0.71.0 — 2026-09-07

**Corretto: il materiale usciva una volta per fase invece che una volta per pezzo.**
Un ordine di lavoro ha una riga per fase, e ogni riga offriva *spedisci materiale* e *registra rientro*. Ma le fasi di un ciclo sono lavorazioni sullo **stesso** pezzo: due fasi dallo stesso terzista per quattro pezzi facevano uscire otto materiali e rientrare otto pezzi. L'app non sbagliava un conto — invitava a registrarne uno sbagliato, e il magazzino ci credeva.

**Il materiale esce una volta, e non è una scelta libera**
- Lo *spedisci materiale* sta ora sulla **prima fase** di ogni parte presente nel documento, il *registra rientro* sull'**ultima**. L'ordine è quello delle fasi del ciclo, non quello delle righe nel documento.
- Le fasi in mezzo non restano mute: dicono **dove** sono i comandi — «materiale in uscita alla fase 10, rientro alla fase 30» — perché la loro assenza somiglierebbe a un difetto.
- Ogni parte del documento ha i **propri** ancoraggi: due parti diverse escono e rientrano ciascuna per conto suo, e una parte con una fase sola esce e rientra sulla stessa riga.
- Il materiale che esce **non si sceglie più da un elenco di tutti gli articoli**: viene dal **ciclo della parte**, con le quantità già calcolate — *q.tà del ciclo × pezzi dell'ordine* — e correggibili. È lo stesso materiale che il fabbisogno ha già fatto comprare, ed è il senso della frase «il materiale in uscita è quello contenuto nel ciclo di lavorazione». La scheda registra un movimento per riga, e una quantità lasciata a zero non ne registra nessuno.
- Un ciclo **senza** materiale a magazzino lo dice invece di offrire una scheda vuota: quel materiale lo mette il terzista, e non c'è niente da scaricare.

**Un saldo negativo non è merce mancante**
Emerso provando il giro completo: rientrando **perni** dopo aver spedito **tondo**, il prospetto *presso terzi* mostrava «PERNO −4» — un pezzo che dal terzista non c'era mai stato. Un saldo negativo su un codice è come si vede una **trasformazione**, non un debito: il prospetto ora mostra i soli saldi positivi, e il filtro di magazzino «presso terzi» somma solo quelli. Sommare i negativi scalava da un articolo quello che sta fuori come un altro.

**Note**
- **11 casi nuovi** in `test/contolavoro.test.js`, e il primo è lo scenario che ha fatto vedere il difetto: due fasi allo stesso terzista per 4 pezzi, dove ora **escono 8 kg di tondo e rientrano 4 perni**, non 8 e 8. Poi gli ancoraggi (compreso quello che verifica che conti l'ordine delle **fasi** e non quello delle righe), il disegno a video con i comandi che compaiono una volta sola e la fase in mezzo che lo spiega, due parti nello stesso ODL, il materiale ricavato dal ciclo con i suoi casi limite, e la quantità a zero che non registra niente. La suite passa da 1539 a **1550** casi.
- Le righe di conto lavoro rimaste in un ordine d'acquisto da prima della separazione fra ODA e ODL passano dalla stessa scheda: hanno la stessa forma, e la stessa regola.

### 0.70.1 — 2026-09-07

**Corretto**
- **I due comandi di conto lavoro sotto una riga di ordine di lavoro si accavallavano alla descrizione della riga sopra.** La causa non è di misura ma di natura: `plandoc-link` disegna un riquadro (bordo più 6px di padding verticale) su uno `<span>`, e **un elemento inline con padding verticale non allarga la riga di testo che lo contiene** — il riquadro deborda sopra e sotto, e finisce addosso ai vicini. Nell'elenco dei documenti generati da un piano non si vedeva, perché lì quei riquadri stanno in un contenitore flex, dove diventano blocchi da soli. Sotto una riga di documento non c'era nessun flex a salvarli.
- La classe dichiara ora `display:inline-block`, e i due comandi hanno una **riga propria** (`line-cl-actions`, disposta in flex) invece di stare dentro `line-note`, che è un blocco pensato per una nota di testo. Il punto di separazione fra i due passa dallo spazio, non più da un `·` in mezzo ai riquadri.

**Lo stesso difetto, altrove**
Il controllo scritto per impedire il ritorno ne ha trovate **altre sei** con la stessa forma, latenti: `picker-type`, `rfq-pick-type`, `doc-badge`, `home-chip` e le due etichette di riga `rfq-manual-tag` e `rfq-clavoro-tag`. Nessuna si vedeva rotta oggi — vivono quasi sempre dentro contenitori flex, dove il difetto non si manifesta — ma bastava usarne una in mezzo al testo per ritrovare lo stesso accavallamento. Corrette tutte allo stesso modo: dove la classe sta in un flex la dichiarazione non cambia niente, dove sta inline la salva.

**Note**
- **3 casi nuovi** in `test/theme.test.js`. Il controllo non prova il disegno — la suite non ha un motore di layout — ma il **contratto fra i due file**: le classi che disegnano un riquadro si ricavano da `style.css` (bordo più padding verticale non nullo), gli `<span>` che le portano si ricavano dalle viste, e ognuna deve dichiarare un `display` che il riquadro lo contenga. L'elenco non è scritto a mano: se domani nasce un'altra classe con la stessa forma, la trova questo controllo invece dello schermo. C'è anche il caso che verifica che il controllo **stia provando qualcosa** — se `plandoc-link` smettesse di essere un riquadro, l'altro passerebbe a vuoto.
- Verificato che il controllo riconosca il difetto rimettendolo per un attimo: togliendo `display:inline-block` da `plandoc-link` la suite fallisce nominando la classe. La suite passa da 1536 a **1539** casi.

### 0.70.0 — 2026-09-07

**Il tempo di una lavorazione esterna si misura in giorni, non in ore.** Una fase interna occupa una macchina, e le sue ore sono quelle che alimentano il *Carico centri*. Una fase in conto lavoro non occupa niente di nostro: il pezzo esce, sta dal terzista, e torna. Contarla in ore rispondeva alla domanda sbagliata — di quante ore ci metta il terzista non importa a nessuno, importa **quando ripresenta il pezzo**.

**Nel ciclo di lavorazione**
- La colonna delle ore diventa **Tempo**, e cambia unità con la natura della fase: **ore (h)** su una lavorazione interna, **giorni (gg)** su una in conto lavoro. Si passa dall'una all'altra scegliendo o togliendo il fornitore, e la riga si ridisegna: cambia proprio cosa quel campo misura, e lasciarlo com'era avrebbe fatto scrivere il numero nel posto sbagliato.
- Le ore di una fase esterna **a costo orario** non spariscono: si spostano accanto alla tariffa, nella cella del costo. Lì sono **le ore che il terzista fattura**, cioè un pezzo del prezzo, non il nostro tempo — ed è l'unico punto in cui ha senso vederle.
- Le due grandezze restano **due colonne** nell'export del ciclo, con i rispettivi totali: una colonna che cambia unità riga per riga non si può né sommare né filtrare in un foglio di calcolo.

**Nel fabbisogno, ed è il motivo per cui esistono**
- I giorni di attraversamento diventano il **tempo di consegna** della fase: se il pezzo serve pronto il 30 settembre e il terzista ci mette cinque giorni, **l'ordine di lavoro deve uscire entro il 25**. È la stessa aritmetica dei giorni di consegna a listino per il materiale, e la stessa risposta quando il dato manca — nessun anticipo, non un anticipo inventato.
- La sezione **Da far lavorare fuori** ha una colonna **Ordinare entro** accanto a *Serve per*, con i giorni sottratti in chiaro e il badge di urgenza che finalmente significa qualcosa: prima era sempre calcolato sulla data in cui serve, come se un conto lavoro si potesse mandare l'ultimo giorno.
- Giorni e data d'ordine entrano nel foglio **Conto lavoro** dell'export Excel e nel blocco del PDF.

**Note**
- **12 casi nuovi** fra `test/cycle-op.test.js` e `test/mrp-cl.test.js`: la fase esterna che nasce con i giorni, l'aggiornamento che non azzera le ore fatturate a costo orario, i giorni che restano zero su una fase interna, la sopravvivenza al ricaricamento a due giri, e l'anticipo — compreso quello che **attraversa il cambio di mese**, il valore negativo che non anticipa al contrario, e la data mancante che non ne fa inventare una. Più il caso che tiene ferma la separazione: **i giorni non toccano il costo**. La suite passa da 1524 a **1536** casi.
- Una fase creata prima di questa revisione prende `days: 0`: nessun anticipo, che è il comportamento che aveva. Chi vuole la data d'ordine giusta scrive i giorni sulle fasi che gli interessano, quando gli interessa.
- **Scelta da conoscere**: i giorni sostituiscono le ore come *tempo* di una fase esterna, ma non le sostituiscono come *costo* — a modo orario servono ancora, e restano. L'alternativa sarebbe stata vietare il costo orario sul conto lavoro, che avrebbe fatto perdere le tariffe già registrate sui centri.

### 0.69.0 — 2026-09-07

**Ordini d'acquisto e ordini di lavoro sono due documenti diversi, e adesso lo sono anche nell'app.** Dalla 0.66.0 le lavorazioni in conto lavoro finivano come righe dentro un ordine d'acquisto: funzionava, ma metteva nello stesso documento due cose che nella realtà non lo sono — uno **compra della merce**, l'altro **manda dei pezzi a lavorare**. Al telefono con un terzista, «l'ordine 47» non bastava più a dire di cosa si stesse parlando.

**Ordini di lavoro (ODL)**, voce nuova nel gruppo Documenti
- Numerazione **sua**: `ODL-<anno>-NNN`, indipendente dagli `ODA-<anno>-NNN`. Elenco suo, filtri suoi, stampa sua — PDF ed Excel bilingui, intestati *Committente / Terzista* invece di *Richiedente / Fornitore*.
- Colonne pensate per una lavorazione e non per della merce: **Parte**, **Lavorazione**, **Pezzi**, **Tariffa (€/pz)**, data richiesta e confermata, **Rientrati / Ancora fuori**.
- Niente «+ Da catalogo»: un articolo non è una lavorazione, e la voce non c'è perché non avrebbe senso premerla.
- Stati, blocchi per stato, salvataggio differito, sblocco per modifica, guardie di ruolo: **tutto riusato** dal registro dei documenti, dove ODA e RDO vivono già. Dove il comportamento coincide davvero, due copie divergono.
- I due comandi del conto lavoro — *spedisci materiale* e *registra rientro* — stanno sotto ogni riga dell'ODL, dove terzista e ordine sono già decisi.

**Dal fabbisogno: tre pulsanti, tre documenti**
- «Genera ordini» prende **solo la merce**, «Genera ordini di lavoro» **solo le lavorazioni**. Un ordine d'acquisto non può più contenere una fase, e un ordine di lavoro non può contenere un articolo: lo decide un filtro per tipo di documento, in un punto solo.
- Un ODL per **terzista**: tutte le fasi affidate allo stesso, anche di parti diverse, in un documento — è la forma con cui si spedisce e con cui il terzista lo legge.
- «Genera richieste» invece li tiene **insieme**, e non è un'incoerenza: chiedere a un fornitore quanto costa il materiale **e** quanto costa lavorarlo è una domanda sola, ed è la richiesta d'offerta a farla.

**La richiesta si divide, e non perde niente**
Convertendo una richiesta che contiene sia merce sia lavorazioni nascono **due documenti** — un ODA e un ODL, entrambi che citano la richiesta e ne portano le condizioni — e la richiesta si chiude una volta sola. Una richiesta di sola merce si comporta come sempre; una di sole lavorazioni genera il solo ODL. Una richiesta **vuota** continua a produrre un ordine d'acquisto vuoto, com'è sempre stato: l'ODA resta il ripiego.

**Dove la separazione si vede**
- **Magazzino**: nessuna differenza, ed è il punto. Le righe di un ODL non hanno un articolo — la migrazione lo impone a ogni caricamento, non lo lascia alla disciplina di chi scrive — quindi non caricano niente da sé. Il rientro dei pezzi resta un movimento, e il prospetto *presso terzi* riconosce l'ODL come documento di riferimento.
- **Commesse**: la scheda ha un elenco **Ordini di lavoro** accanto a quello degli ordini, e l'impegnato somma i due — la domanda «quanto costa questa commessa» è una sola, e leggerla in due cifre da mettere insieme a mano non aiuta nessuno. Una commessa che regge un ODL non si elimina.
- **Riepilogo**: gli ordini confermati in ritardo comprendono gli ODL, in un avviso solo. Il tipo si legge dal numero e il click porta ciascuno nel suo elenco.
- **Ricerca globale**: sigla `ODL` accanto a `ODA` e `RDO`.

**Note**
- **21 casi nuovi** in `test/odl.test.js`, e non provano che l'ODL funzioni — quello lo prova la macchina che riusa — ma che le due cose restino **separate**: la numerazione che non continua la serie degli ODA, quali righe possono finire in quale documento, la richiesta mista che si divide senza perdere righe, il giro verso la forma normalizzata e ritorno, e il vincolo `itemId` nullo imposto dalla migrazione. Con gli aggiornamenti a `test/mrp-cl.test.js` la suite passa da 1497 a **1520** casi.
- Le righe di conto lavoro finite in un ordine d'acquisto **prima** di questa revisione restano dove sono, si riconoscono ancora come tali e conservano i due comandi per muovere il materiale. Non c'è una migrazione che le sposti: spostarle vorrebbe dire spezzare documenti già numerati, e ne varrebbe la pena solo se ce ne fossero — questa separazione arriva tre revisioni dopo che il conto lavoro è nato.
- `docs/cloud-schema.md` descrive le due tabelle nuove e **perché sono due e non una con un flag**, con la nota che la forma va tenuta allineata e che in cloud conviene una vista che le unisca per le domande che riguardano entrambe.

### 0.68.0 — 2026-09-07

**Il carico dei centri di lavoro.** Ultima parte del lavoro sulle lavorazioni: dopo l'approvvigionamento del conto lavoro (0.66.0) e il materiale presso i terzisti (0.67.0), restava la domanda che riguarda quello che si fa in casa — *le ore che ho promesso, il reparto le regge?* Fino a ieri `cycle[].workCenterId` e `cycle[].hours` non li leggeva nessuno fuori dalla costificazione: le ore c'erano scritte e non servivano a niente.

**Carico centri**, voce nuova nel gruppo *Cicli di lavorazione*
- Tavola **centro × settimana**: le ore che i piani chiedono a ciascun centro, contro una **capacità** dichiarata sul centro in ore/settimana. Saturazione in percentuale, neutra fino all'85%, arancio fino al 100%, **rossa sopra**, più il riepilogo in testa delle settimane sfondate **con i centri nominati**.
- Da ogni cella si apre il **dettaglio di chi ha portato quelle ore** — parte, fase, piano, ore. Non è un vezzo: vale la regola già scritta per il materiale impegnato, un numero che non dice da dove viene non si può contestare, e quindi neanche credere.
- Somma tutti i **piani aperti**, perché il centro è condiviso e «la tornitura regge?» non ha risposta guardando un piano per volta — stessa regola con cui si calcola il materiale impegnato. Si può restringere a un piano solo, e la stessa tavola sta in fondo alla scheda di ogni piano.
- Le ore si raccolgono da due posti: le **fasi interne** del ciclo di una parte prodotta in casa, e le **lavorazioni degli assiemi**. Le fasi in **conto lavoro** non caricano nessun centro interno: quelle si comprano, e stanno nel fabbisogno sotto «Da far lavorare fuori». Una parte acquistata non carica niente: quelle ore le fa il fornitore.
- Export Excel e PDF **in forma lunga**, una riga per coppia centro/settimana: un foglio con trenta colonne di settimane è illeggibile, in forma lunga si pivota in Excel in dieci secondi e si filtra per data — che è la promessa già scritta sugli export degli elenchi.

**Capacità sul centro di lavoro**
- Campo nuovo in *Gestione → Centri di lavoro*, in ore a settimana, con la sua colonna nell'export/import Excel delle impostazioni.
- **Zero significa «non dichiarata», non «nessuna capacità»**: un centro senza capacità mostra le ore e non il sovraccarico. Senza questa distinzione ogni centro esistente sarebbe risultato sfondato al primo caricamento, e il prospetto sarebbe nato già da ignorare. La vista lo dice, contando quanti centri sono in quello stato.

**Due promesse, e perché sono credibili**
Il motore del fabbisogno dichiara da sempre, in un commento, che **il time-phasing non si fa**: un fabbisogno *materiale* spezzato per periodi prometterebbe un MRP che non c'è. Quel commento è stato **riscritto**, non lasciato a contraddire il codice, con i tre motivi per cui il carico è l'eccezione.

1. **Non tocca il netting.** Le funzioni del fabbisogno netto restano identiche: il carico è un prospetto derivato in sola lettura, da cui non nasce nessun documento e nessuna quantità. Se domani lo si cancellasse, il resto dell'app non se ne accorgerebbe — e c'è un caso di prova apposta, che confronta i numeri del netto prima e dopo averlo letto.
2. **La domanda è diversa.** Sul materiale il periodo servirebbe a decidere *quando ordinare*, e a quello risponde già la data d'ordine senza secchielli. Sulla capacità il periodo **è** la domanda: la capacità è una portata, non uno stock.
3. **Non si promette nulla che non si dia.** Capacità infinita, dichiarata in pagina: il sovraccarico si vede, non si sposta. Nessuna schedulazione, nessun calendario, nessuna data di avvio di una fase. E le ore stanno nella settimana in cui **il pezzo serve pronto**, non in quella in cui si lavora — anche questo scritto in pagina, perché una data che sembra un piano di lavoro senza esserlo è peggio di nessuna data.

**Note**
- **25 casi nuovi** in `test/carico.test.js`, e i primi sei sono sull'aritmetica delle settimane ISO — che una implementazione ingenua sbaglia una volta l'anno e in silenzio: il 1° gennaio di un anno che comincia di venerdì sta nella settimana 53 dell'anno prima, il 31 dicembre può stare nella prima dell'anno dopo, e il lunedì si calcola **in UTC** o a est di Greenwich scivola al giorno prima — cioè in un'altra colonna del prospetto. È la lezione già pagata una volta sulle date d'ordine, e le nuove funzioni nascono con la stessa disciplina. Poi la raccolta delle ore, gli scarti che entrano nel moltiplicatore, i secchielli (comprese le righe **senza data**, che finiscono in una colonna dichiarata invece di sparire), capacità e sovraccarico, l'export, e i due casi che fanno valere il patto del punto 1. La suite passa da 1471 a **1497** casi.
- Due casi di `test/nav.test.js` usavano i Cicli come esempio di gruppo a voce singola, che ora non lo è più. Il comportamento provato non cambia: cambia l'esempio, e se n'è aggiunto uno sul caso opposto.
- **Difetto trovato e non corretto**, scritto in `docs/cloud-schema.md` per non riscoprirlo: `workCenters[].suppliers` — i fornitori conto lavoro aggiunti nella 0.64.0 — non è dichiarato nel registro dello schema né in quello dei riferimenti. Finisce in una colonna-array invece che in una tabella normalizzata, e la rimappatura degli id non lo attraversa. Stessa famiglia di `plans.jobId`. Non fa parte di questo lavoro ed è una decisione a sé.

### 0.67.0 — 2026-09-07

**Il materiale che sta dai terzisti.** La revisione scorsa ha portato le lavorazioni esterne dentro gli ordini; restava fuori la merce che si manda al terzista perché possa farle. Finché non era tracciata, spariva due volte: non era più a scaffale e non era in nessun conto, quindi il magazzino diceva zero e nessuno sapeva che venti chili di tondo stavano da Beta.

**Due movimenti nuovi**
- **Uscita a conto lavoro** e **Rientro da conto lavoro**, con il terzista (obbligatorio) e l'ordine che li giustifica (facoltativo). Si registrano dal **Magazzino**, come le rettifiche, oppure — ed è il posto naturale — **dalla riga d'ordine di conto lavoro**, dove terzista e ordine sono già decisi e resta da dire solo cosa esce e quanto.
- **L'uscita è negativa**: il materiale che parte esce dal magazzino, perché allo scaffale non c'è più. È lo stesso gesto del consumo di produzione, e non contraddice la regola per cui *la giacenza non è una colonna*: un movimento negativo è un addendo di quella somma, non un saldo scritto da qualche parte.
- I due movimenti portano l'articolo **che si muove davvero**: quello che esce e quello che rientra. Quando coincidono — grezzo fuori, lavorato dentro — il conto va a zero da sé; quando differiscono — materiale fuori, pezzi finiti dentro — il consumo del materiale è implicito nella coppia. Nessuna logica speciale in nessuno dei due casi, ed è il motivo per cui questo modello è stato preferito a uno che chiudesse il conto con un rientro fittizio compensato da uno scarico: due scritture per la stessa cosa, che nessuno terrebbe allineate.

**Il prospetto «presso terzi»**
- Non una vista nuova: il Magazzino elenca già gli stessi articoli. C'è un **filtro di stato** *Presso terzi*, un pulsante in toolbar che compare **solo se c'è qualcosa fuori**, e una scheda di dettaglio **per fornitore e per ordine** — che il filtro non può dare, perché la riga del magazzino è per articolo.
- Il saldo è per **coppia (fornitore, articolo)**, non per articolo soltanto: con codici diversi in uscita e in entrata, un saldo unico non significherebbe niente.
- **Calcolato dai soli movimenti**, come la giacenza. Nessun campo `presso terzi` da tenere allineato, e quindi niente che possa divergere: è la stessa regola per cui non esiste `onHand`, applicata a un secondo numero.
- Export Excel e PDF in forma piatta, una riga per coppia: terzista, codice, articolo, uscito, rientrato, ancora fuori, ordini, ultimo movimento.
- Lo storico dei movimenti di un articolo mostra ora il **terzista e l'ordine** accanto alla nota.

**Nessun doppio conteggio, e perché**
La garanzia è **strutturale, non aritmetica**: le righe d'ordine con un articolo caricano il magazzino via *ricevuto*, quelle senza caricano via movimento, e **una riga non può essere di entrambi i tipi**. Per questo la riga di conto lavoro deve avere `itemId` nullo — se qualcuno ce ne mettesse uno *e* registrasse il rientro, i pezzi risulterebbero il doppio. Il giro completo (tondo ordinato, ricevuto, spedito a Beta, perni rientrati) è verificato passo per passo, e c'è anche il caso per assurdo che dimostra cosa succederebbe violando il vincolo.

**Note**
- **14 casi nuovi** in `test/contolavoro.test.js`: i due tipi, i campi del movimento con e senza contorno, il movimento vecchio che prende i campi nulli e resta stabile a due giri, l'uscita che fa calare la giacenza, il prospetto per fornitore, il conto che si chiude, il filtro di magazzino, l'eliminazione che rimette dentro il materiale, l'export, il **giro completo in sei passi** e la prova per assurdo del vincolo. La suite passa da 1457 a **1471** casi.
- Nel registro dello schema, il commento su `stock_movements` diceva che i carichi da ordine non stanno lì. Resta vero, ed è stato spiegato perché i due movimenti nuovi possono portare un `orderId` senza violarlo: la riga d'ordine che li giustifica non ha un articolo, quindi non carica niente da sé. Senza la nota, il prossimo lettore avrebbe pensato che la regola fosse saltata.
- `REFS` sa ora seguire `movements.supplierId`. `orderId` e `lineId` restano fuori, perché `REFS` non ha una destinazione per gli ordini e gli ordini non sono mai stati rimappati: scritto in un commento invece di lasciare il buco muto.

### 0.66.0 — 2026-09-07

**Le lavorazioni in conto lavoro entrano nell'approvvigionamento.** Fino a ieri il fabbisogno rispondeva bene a una domanda sola — cosa comprare — e per le parti prodotte in casa si fermava a metà: scendeva nel ciclo a prendere il materiale e **scartava le fasi**, con un commento che diceva il vero a metà («le lavorazioni non si comprano a magazzino»: quelle esterne si comprano eccome, solo non finiscono a scaffale). Il risultato era che una zincatura da mille euro affidata a un terzista non compariva in nessun documento, e la si ordinava a memoria.

**Da far lavorare fuori**
- Una fase del ciclo con un **fornitore** è una lavorazione in conto lavoro, e ora entra nel fabbisogno accanto al materiale, in una **sezione propria** della scheda del piano: fase, centro, parte, terzista, data in cui serve, pezzi, ore totali, prezzo per pezzo e importo. Le fasi **senza** fornitore sono interne e restano fuori: non si comprano, si fanno.
- La quantità sono i **pezzi della parte**, con i moltiplicatori di distinta già applicati. Il prezzo è **per pezzo**: la tariffa scritta nel ciclo se la fase è a costo fisso, *ore per pezzo × tariffa* se è a costo orario.
- La tariffa è quella **congelata sulla riga** quando la fase è stata scritta, non quella che il centro ha oggi: ripescarla adesso cambierebbe da sé il prezzo di una fase che qualcuno aveva già deciso.
- Nuovo riquadro **Conto lavoro** fra i totali del piano, foglio **Conto lavoro** nell'export Excel e blocco nel PDF.

**Dal fabbisogno al documento**
- Le fasi entrano nella scheda «Genera richieste / Genera ordini» **nel gruppo del loro terzista**, accanto al materiale dello stesso fornitore: un documento solo, perché il fornitore è uno e la consegna è una. Si riconoscono a colpo d'occhio dal numero di fase e dalla chiave inglese.
- La riga di documento porta il **codice della parte** — è il pezzo che il terzista riceve, lavora e rispedisce, ed è il codice che cercherà sulla sua bolla — la descrizione della lavorazione, i pezzi come quantità e, a costo orario, *ore/pezzo × tariffa* nella nota, che la stampa mostra sotto la descrizione.
- Nel documento la riga è marcata **conto lavoro**, non più «manuale»: chiamare manuale ciò che l'app ha generato faceva sembrare improvvisato il contrario di quello che è. Il *ricevuto* su quella riga significa **pezzi rientrati dal terzista**: porta l'ordine a parziale o evaso, e **non carica il magazzino** — lo dice il suggerimento della cella.
- **Il fabbisogno netto non si applica alle lavorazioni**, ed è scritto in pagina invece che lasciato scoprire. Nettarle richiederebbe di sapere quanti pezzi sono già stati lavorati, cioè un avanzamento di produzione che Bomtrack non ha: fingere di saperlo produrrebbe quantità che nessuno può spiegare.

**Come si riconosce una fase già ordinata**
Il problema vero di questa revisione, e vale la pena dire come è stato risolto e come può sbagliare.

- La riga di documento di una fase ha **`itemId` nullo**, e deve averlo: è la garanzia *strutturale* contro il doppio conteggio di magazzino. L'esistente si calcola come *ricevuto sulle righe con articolo + movimenti*; il rientro dei pezzi sarà un movimento. Con un `itemId` le due strade si sommerebbero e i pezzi risulterebbero il doppio.
- Non potendo cercarla per articolo, la riga porta una **chiave di fase** congelata alla generazione — come già lo sono il codice e la descrizione, che pure sono copie. L'indice dentro la chiave conta **fra le sole lavorazioni**, non nell'array del ciclo: aggiungere una materia prima alla distinta parte è la modifica più frequente, e con l'indice assoluto avrebbe spostato la chiave di ogni fase successiva.
- **Come può sbagliare**: chi riordina le fasi dopo aver generato il documento vede la fase **riproposta**. È un falso negativo, e si vede — il documento è lì nell'elenco di quelli generati dal piano. L'alternativa avrebbe bloccato la fase *sbagliata*, e quello non si sarebbe visto. Fra i due modi di sbagliare si è scelto quello visibile, ed è scritto accanto alla funzione.
- **Non si è dato un id proprio alle righe di ciclo**, che sarebbe la strada apparentemente pulita: costringerebbe a cambiare il registro dello schema, la traduzione verso il database condiviso, la firma dei record e la politica di merge di quelle righe — che è *sostituzione dell'insieme* proprio perché un'identità di riga lì non esiste. Costo alto per un beneficio che la chiave dà senza toccare nulla.

**Note**
- **28 casi nuovi** in `test/mrp-cl.test.js`: l'esplosione (quantità lungo i livelli, fase interna esclusa, parte acquistata che non genera fasi, diamante che somma sulla stessa chiave, data più vicina, due fasi sullo stesso centro che restano due, anello troncato), la chiave e i suoi due comportamenti — quello che regge e quello dichiarato —, la riga di fabbisogno con i suoi campi *assenti*, la generazione dei documenti e la prova che una riga di conto lavoro ricevuta **non tocca il magazzino**. La suite passa da 1429 a **1457** casi.
- `planDocumentedItems` si chiama ora `planDocumentedKeys` e indicizza per articolo **o** per fase. La copertura di commessa continua a cercare per articolo: le voci di fase restano nella mappa e non le trova nessuno, innocue. Estendere il semaforo della commessa alle lavorazioni è una decisione a sé, non un effetto collaterale di questa.
- Scritti in `store.js`, accanto a `REFS`, i **due riferimenti che la rimappatura degli id non copre**: `plans.jobId` (innocuo, le commesse sono nate dopo) e la chiave di fase, che contiene un id articolo *dentro una stringa* e che nessuna sostituzione di campo saprebbe seguire. Meglio scritti che riscoperti.

### 0.65.0 — 2026-09-07

Primo passo verso l'approvvigionamento e la programmazione delle lavorazioni: prima di poterle ordinare o schedulare, le ore di una fase devono **esistere**. Fino a ieri non sopravvivevano a un riavvio.

**Corretto**
- **Le fasi a costo orario perdevano le ore a ogni caricamento, e valevano zero.** Una normalizzazione di `migrateDB()` — scritta prima che il modo di costo esistesse, e mai aggiornata quando è arrivato — cancellava `hours` da ogni riga di lavorazione priva di `cost`, cioè da **tutte** quelle a costo orario, che il costo non ce l'hanno per definizione. Si inseriva una fase da 2 h × 60 €/h, si riapriva l'app, e quella fase costava **zero**. Il difetto era silenzioso due volte: la riga restava a video con la sua tariffa, e il costo della parte scendeva senza che niente lo dicesse. Il valore scritto al suo posto usava per giunta la tariffa del **centro** invece di quella del **fornitore**, quindi sbagliava anche per chi se ne fosse accorto.
- **Le righe già danneggiate si recuperano**, dividendo il costo per la stessa tariffa con cui era stato moltiplicato — quella del centro, non quella del fornitore, perché è quella che il difetto usava: dividere per l'altra sbaglierebbe proprio dove il terzista ha una tariffa propria. **Il recupero cambia i costi mostrati** a chi era danneggiato, da zero al valore vero. È l'effetto voluto, ma i numeri si muovono.
- Dove il centro **manca o ha tariffa zero** le ore non sono ricostruibili, e non si inventano: restano a zero e finiscono fra gli avvisi del **Riepilogo** — «fasi a costo orario senza ore», con il codice della parte, il numero della fase e il centro, e il click che porta al ciclo. Un costo sparito non si scopre guardando il totale, che resta un numero plausibile.

**Le ore si separano dal costo**

Su una riga di lavorazione le ore e il costo rispondono a due domande diverse, e da questa revisione sono due campi indipendenti.

- **Le ore ci sono sempre**, anche su una fase a costo fisso, e hanno una **colonna propria** nella tabella del ciclo. Erano dentro la cella del costo, e comparivano solo in modo orario.
- **A costo fisso le ore non entrano nel costo**, ed è deliberato: un prezzo concordato con un terzista è quello, e farlo diventare *ore × tariffa* lo cambierebbe da sé. Ma quella fase il centro lo occupa lo stesso, e senza le ore il **carico dei centri di lavoro** non si potrebbe calcolare su metà delle fasi. È il pezzo che mancava, ed è il motivo di questa revisione.
- Cambiare il modo di costo non tocca più le ore: il tempo di una fase non cambia perché è cambiato il modo in cui la si paga.
- Le ore entrano nell'**export del ciclo**, con il loro totale.

**Note**
- **26 casi nuovi** in `test/cycle-op.test.js`: la regressione del difetto (una fase oraria che sopravvive al ricaricamento), il recupero e i suoi due limiti dichiarati, l'idempotenza a due giri, le righe precedenti al modo di costo, la separazione fra ore e costo, la fase nuova che nasce con le ore, e gli avvisi del riepilogo — con la fase numerata **fra le sole lavorazioni** e non nell'array intero, che è il numero che si legge a video. La suite passa da 1412 a **1429** casi.
- Un caso di `test/migrate.test.js` **codificava il difetto**: pretendeva che le ore sparissero. Ora pretende il contrario, con il perché scritto accanto.
- `docs/cloud-schema.md` descriveva `item_cycle_rows` com'era prima del modo di costo: niente `cost_mode`, niente `hours`, niente `rate`. Riscritta, con la distinzione fra riga articolo e riga lavorazione e il vincolo che tiene separate le due domande.

### 0.64.3 — 2026-09-07

Nessuna modifica all'app: si aggiunge il documento che mancava accanto al contratto cloud.

**Documentazione**
- **`docs/sostenibilita-free-tier.md`** — `cloud-schema.md` dice *come* i dati diventano tabelle, e non diceva *quanto occupano*. Ora il conto c'è, tabella per tabella, su tre scenari, con il modello di calcolo in fondo perché sia contestabile invece che creduto.
- Il verdetto è che il piano gratuito regge con margine ampio — **25% dello spazio a tre anni** nello scenario realistico — ma i tre numeri che contano non sono quelli che ci si aspetta:
  - **il budget non è 500 MB ma ~430**: un progetto Supabase vuoto ne occupa già 50–70 di cataloghi ed estensioni, e oltre il limite il progetto passa in sola lettura, cioè l'app smette di salvare;
  - **a stringere per primo è l'egress, non il disco**: un pull completo è ~5 MB compressi, e il polling ogni 20–30 s previsto dal percorso è sostenibile **solo incrementale** — a lettura piena sarebbero decine di GB al giorno contro un tetto di 5 GB al mese;
  - **crescono col tempo, non col catalogo**: `stock_movements` e gli snapshot delle revisioni sono da soli i due terzi dell'occupazione, e nessuno dei due dipende da quanti articoli ci sono.
- Detto anche cosa **non** serve, perché è l'ottimizzazione che viene in mente per prima: togliere le colonne di audit dalle tre tabelle a sostituzione d'insieme e sostituire l'id sintetico con una chiave `(item_id, pos)` risparmia il 4,6%. Va fatto per igiene — quell'id non è un'identità e non merita un indice unico — ma la capienza la decide la **retention dei movimenti**, non lo schema.

**Note**
- Restano segnati due rischi del piano gratuito che non riguardano lo spazio e che oggi non hanno risposta: la **sospensione dopo 7 giorni di inattività** (un'officina chiude due settimane ad agosto) e l'**assenza di backup automatici**. Costano entrambi poco da prevenire e molto da scoprire tardi.
- Il modello di calcolo nel documento è eseguibile con `node` senza dipendenze, e i numeri delle tabelle sono i suoi. Il giorno in cui il database esisterà, la query per confrontare previsione e realtà è nell'ultima riga del file.

### 0.64.2 — 2026-09-06

**Corretto**
- **La data «Serve per» nelle righe del piano di fabbisogno era l'unico campo data disegnato dal browser invece che dall'app**: fondo bianco, spigoli vivi, fuori tema — e proprio accanto alla quantità della cella di fianco, che invece era a posto. Era l'unico `<input type="date">` senza una classe, dentro una cella nuda, e nessuna regola del foglio di stile lo raggiungeva. Ora usa `rfq-date-input`, la stessa classe che le righe di richieste e ordini adoperano per lo stesso campo.

**Note**
- Controllati **tutti e dodici i campi data dell'app**, uno per uno e nei loro cinque contesti — testata documento, righe di richiesta e ordine, listino fornitori, filtro per periodo, righe di piano — a schermo e nei due temi. Gli altri undici erano a posto: stanno dentro `.modal-field`, che veste i suoi campi, oppure portano già una classe che il foglio di stile conosce.
- **Un controllo nuovo impedisce che ricapiti** (`test/theme.test.js`): ogni campo data deve avere una classe che il foglio di stile disegna davvero — l'elenco si ricava da `style.css`, non è scritto a mano — oppure stare in un contenitore che li veste. Verificato che il controllo riconosca il difetto rimettendolo per un attimo: un campo aggiunto domani in una cella si dimentica la classe, non il colore, ed è lì che va fermato.
- Verificato anche che l'icona del calendario segua il tema in tutti e tre gli stati (scuro, chiaro, «come il sistema»): su fondo scuro quella di serie è nera e sparirebbe.

### 0.64.1 — 2026-09-06

**Corretto**
- **Gli spazi digitati per sbaglio nei campi di commesse, richieste, ordini e piani finivano nel dato.** I form passano da `val()`, che li toglie da sempre; i campi di questi quattro documenti scrivevano invece il valore grezzo dentro il proprio setter. Su una descrizione è cosmesi; sul **Cliente di una commessa** no, perché quel testo **è la chiave** verso l'anagrafica: « Rossi Srl » con gli spazi coincide con il cliente registrato solo perché ogni confronto, altrove, si ricorda di ripulirlo — e basta che uno se ne dimentichi. La pulizia avviene all'uscita dal campo, non mentre si scrive, quindi il cursore non ne risente.

**Note**
- **25 casi nuovi in `test/customers.test.js`** sul giro completo del campo Cliente: l'elenco che si propone in ordine alfabetico, il cliente sospeso che sparisce dai suggerimenti, il nome fuori anagrafica che si scrive lo stesso (suggerire non è vincolare), la rinomina che allinea le commesse anche quando erano state scritte con altre maiuscole, il cliente citato che non si elimina, la ricerca e l'export dell'elenco.
- Verificato anche **in un browser vero**, che è l'unica cosa che la suite non può fare: il `datalist` viene davvero associato al campo, il browser offre le quattro voci attive delle cinque registrate, e il nome di un cliente scritto come un tag resta un **valore di testo** — zero elementi `script` finiti nella pagina. La suite passa da 1381 a 1399.

### 0.64.0 — 2026-09-06

Coda del controllo generale: le cose rimaste aperte, chiuse. Niente di quello che c'è qui si vede usando l'app — è tutta manutenzione, e serve a far durare quello che c'è.

**Unificate le griglie di Anagrafica e Magazzino**
Le due viste disegnavano lo stesso oggetto — gruppi con un titolo che conta, le prime 200 righe, un piede che offre di vederne altre — in due copie parallele. Ogni correzione andava fatta due volte, e la seconda prima o poi si dimentica: il `.table-wrap` mancante della revisione scorsa mancava **a tutte e due**, ed è la prova. Ora la griglia è una sola (`itemGrid`), e quello che le due viste hanno davvero di diverso resta fuori e si passa: le colonne, il disegno della riga, il limite corrente, i comandi del piede e cosa dire quando non c'è niente da mostrare — perché anche lì il Magazzino distingue «non c'è nulla a magazzino» da «i tuoi filtri non pescano niente», e sono due situazioni diverse.

Prima di toccare le due viste più usate è stata scritta la rete: **18 casi in `test/grid.test.js`** che descrivono il comportamento condiviso — la paginazione, il titolo che nomina il totale anche quando taglia, il taglio che riempie i gruppi in ordine invece di prendere un po' da ognuno — verificati sul codice di prima e ancora verdi su quello di dopo. Restano, perché è quel comportamento a dover valere in entrambe.

**Corretto**
- **Le chiavi dell'archivio locale seguono una convenzione sola.** Due preferenze usavano il punto (`bomtrack.columns`, `bomtrack.inspector`) e quattro l'underscore, senza che niente distinguesse i due gruppi: nessuna pulizia o diagnostica poteva raccoglierle per prefisso. Le due vecchie si **travasano** alla prima lettura invece di essere buttate: le colonne nascoste a mano in Anagrafica sono una scelta di qualcuno, e ricomparire tutte senza spiegazione sarebbe stato peggio del disordine.
- **`jobId` non era normalizzato** su richieste e ordini mentre `planId` sì: sui documenti creati prima delle commesse il campo mancava del tutto, e la traduzione per il cloud avrebbe prodotto righe con e senza quella colonna — l'incoerenza che tutte le altre normalizzazioni esistono per evitare.
- `THEME_KEY` è ripetuto, cablato, nello script in testa a `index.html`, e rinominarlo da una parte sola non produce **nessun errore**: il tema smette solo di applicarsi in anticipo e torna il lampo scuro. Ora i due punti se lo dicono.

**Copertura di test**
Quindici funzioni avevano zero test, ed erano quelle che toccano più dati in una volta: **`test/backup.test.js`**, nuovo, ne copre il blocco intero con 47 casi.

- **`validateSnapshot`** — la guardia scritta apposta per il file troncato, e la sola che nessuno provava. Ora ha i suoi otto casi: il file di un altro programma, la collezione che non è un elenco (e dice quale), la versione di schema illeggibile, il backup che viene da una revisione più recente.
- **Backup da file, come lo vive chi lo usa**: il file illeggibile, il JSON valido ma non nostro e il backup buono sono tre problemi diversi e vanno detti diversi; la conferma che mostra in numeri cosa entra e cosa si perde; l'annullamento che non tocca niente.
- **Azzeramenti**: `Store.reset`, `Store.clearAll`, `wipeAllConfirm` che pretende la parola esatta, i seed una-tantum che non devono ripopolare un database appena svuotato, chi azzera che resta dentro come amministratore.
- **`reconcileSession`**, cioè cosa succede alla sessione quando il database cambia sotto i piedi: il proprio utente che c'è ancora, il database senza utenti che riaccoglie chi sta lavorando, quello con altri utenti che chiede di rientrare.
- **Cestino e diagnostica**: ripristino, eliminazione definitiva, svuotamento, l'annullamento della conferma, i codici duplicati che vengono elencati e **non** corretti d'ufficio, lo spazio occupato che avvisa prima di sbatterci contro.
- **I fogli delle impostazioni**, uno per uno invece che di rimbalzo: la riga senza nome, la colonna assente contro la cella vuota (che sono due istruzioni diverse), la provincia in minuscolo, il booleano che deve poter dire «no», la tariffa con la virgola italiana.
- **I template**: che le colonne del template distinte siano davvero quelle che l'import rilegge — un template che l'import non sa rileggere è un contratto rotto — e che nell'export delle impostazioni non finisca nessuna password.

**L'attrezzatura**
- Il DOM finto dell'harness ha ora **l'elemento radice** (dove `theme.js` scrive il tema) e **le API dei file**: `FileReader`, `Blob`, `URL.createObjectURL`. Erano l'ultimo pezzo di piattaforma che mancava, e senza restavano fuori dalla suite tutte le porte d'ingresso dell'app — l'import distinte, quello delle impostazioni, il ripristino di un backup — cioè proprio le funzioni che toccano più dati in una volta. La lettura è sincrona, a differenza del browser: un test che debba aspettare un evento è un test che a volte passa.
- Tolte le `const` dichiarate dentro `eval` in `test/families.test.js`: in un contesto `vm` restano nel global lessicale, e funzionavano solo perché ogni caso crea un'app nuova.

**Note**
- La suite passa da 1287 a **1381 casi**. Il file dei test del backup è più lungo del codice che prova, ed è giusto così: sono i gesti che nessuno rifà a mano per verificarli, perché azzerare il database per vedere se funziona significa azzerarlo davvero.
- Resta una cosa che **non è un difetto ma una decisione**: all'import, un articolo che non aveva nessuna quotazione e ne riceve una sola se la vede attivare d'ufficio. È un ripiego voluto e commentato; l'effetto collaterale è che «prezzo deliberatamente non applicato» non sopravvive a un giro export→import su un database vuoto. Va deciso, non corretto di nascosto.

### 0.63.0 — 2026-09-06

Ultima parte del controllo generale: coerenza, duplicazioni, codice morto, prestazioni, documentazione allineata al codice.

**Aggiunto**
- **Sospendere una voce di anagrafica** (⏸), per fornitori, clienti e centri di lavoro. Il campo `active` era migrato, documentato nello schema cloud, esportato in Excel e **letto** in mezza app — i fornitori attivi nel menu dell'import, i clienti attivi nei suggerimenti della commessa, i centri attivi nella scelta della lavorazione — ma nessun comando lo poteva mettere a «no»: solo gli utenti avevano il pulsante. Era una promessa che l'app non manteneva. Sospendere non è eliminare, ed è la ragione per cui serve: un fornitore citato da ordini di tre anni fa non si può cancellare, ma non deve nemmeno continuare a comparire in ogni menu.

**Corretto**
- **Le date negli export degli elenchi erano testo.** In Excel non si ordinavano né si filtravano per periodo — proprio negli elenchi dove la domanda è «cosa è passato a settembre». Ora una colonna può dichiararsi di tipo data: le righe portano la data ISO e ciascun traduttore la scrive a modo suo, l'Excel come cella di data in formato `gg/mm/aaaa`, il PDF come testo all'italiana.
- **Un .csv in UTF-8 senza BOM entrava storpiato**: «Perché» diventava «PerchÃ©», e l'articolo finiva a catalogo così. Le altre due codifiche — la CP1252 di Excel italiano e l'UTF-8 con BOM — erano già gestite dalla libreria; questa no, e adesso si riconosce dai byte. Verificato passando dalla libreria vera, non per ipotesi.
- **«Oggi» si calcolava in quattro modi diversi**, e tre erano in orario di Greenwich: fra mezzanotte e le due davano **ieri**. Su un nome di file è una seccatura; sulla data di una quotazione no, perché quella data **è l'identità della riga** — una quotazione datata ieri è una riga nuova al posto di un aggiornamento. Ora passano tutti da `oggiISO()`, che guarda il calendario di chi lavora.
- **Sei schede di modifica in Gestione si aprivano senza chiedere il ruolo**: il dato era comunque protetto, ma chi è in sola lettura compilava tutto e scopriva il rifiuto solo su Salva — mentre le altre due glielo dicevano subito.
- **Quattro schede diverse condividevano gli stessi id di campo**: `eu-` era insieme «utente» e «unità di misura», `ec-` insieme «cliente» e «concetto». Non collidevano solo perché tutte e quattro usano la chiave pannello di serie e se ne apre una per volta: il giorno in cui a una si desse una chiave propria, il salvataggio dell'utente avrebbe letto il campo dell'unità di misura.
- **Le colonne di Acquisti e Progetto erano lo stesso array**, non una copia: la separazione che il commento descriveva valeva per le colonne nascoste, non per la definizione — aggiungerne una a Progetto l'avrebbe aggiunta anche ad Acquisti, senza un errore da nessuna parte.
- Tolte le **emoji rimaste** dove l'icona esisteva già, compresa quella che stava nella stessa lista che l'icona la usa, due righe più su. `icons.js` spiega da tempo perché: non ereditano il colore, cambiano forma da un sistema all'altro, si siedono sulla linea di base in modo diverso.
- La classe `muted` non esiste nel foglio di stile: il messaggio d'errore dell'app si stampava a colore pieno invece che attenuato.

**Prestazioni**
- **La generazione dei codici articolo era quadratica.** Per ogni codice si compilava una espressione regolare e la si provava su **ogni** articolo in archivio; durante un import è una volta per riga. Misurato su 4000 articoli e 2000 codici: **3339 ms → 5 ms**. È lo stesso costo che l'indice dei codici toglie alla *ricerca* e che era rimasto intatto sulla *generazione*.
- **Famiglie, concetti e autori hanno ora un indice**, come già articoli, fornitori e centri di lavoro: `getFamily` la chiamano l'elenco del catalogo per ogni riga e la codifica per ogni codice generato. Con la stessa guardia di freschezza degli altri, perché gli import creano famiglie dentro il ciclo e chiedono il codice subito dopo.
- `genItemCode()` **non parla più all'interfaccia**: durante un import sparava un toast per riga esaurita. Dice perché non ce l'ha fatta, e chi ha davanti una persona lo mostra, chi legge un file lo scrive nel report.

**Pulizia**
- Unificate le funzioni gemelle: le due letture di un file Excel (differivano di tre righe e ripetevano identiche le due gestioni d'errore), i due contatori dei report, i quattro modi di dire «oggi».
- `addressOneLine()` non era chiamata da nessuna parte, test compresi: eliminata. `toAltUom()` e `tablesForChanges()` invece **restano**, e ora lo dicono: non sono dimenticanze, sono metà di un contratto e il seam del futuro adapter, con i loro test.
- Tolta la variabile CSS `--wl-w`, manopola di un ridimensionamento mai implementato: il valore vero era da sempre il suo ripiego.
- `flattenDB()` si appropria dei nomi `pos` e `childSets` per tradurre: ora se ne accorge invece di rompere in silenzio il giro completo che `test/cloudmap.test.js` verifica.
- L'unico `confirm()` nativo rimasto — dentro `openModal` — resta, e ora è scritto perché: `openModal` è sincrona e ottanta chiamanti ci scrivono dentro subito dopo, mentre `askConfirm` risponde con una richiamata. Sostituirlo vorrebbe dire rendere asincrona l'apertura di ogni scheda dell'app.

**Documentazione**
- `docs/cloud-schema.md` allineato al codice: il conteggio delle collezioni (fermo a «nove» da quattro collezioni fa, e ora non più scritto), il nuovo registro `REFS`, il contratto `takeChanges()`/`markSynced(mark)`, il `touch()` del ripristino dal cestino, `orders.requested_delivery` che il client cancella a ogni caricamento, e il fatto che `settings` non è in `SCHEMA` — quindi nessuna tabella la genera, e l'adapter deve trattarla a parte.

**Note**
- 25 casi nuovi fra `test/codes.test.js` e `test/vendor-xlsx.test.js`, compreso il confronto dell'indice dei progressivi con l'implementazione precedente, presa verbatim da git, su sette casi limite. La suite passa da 1270 a 1287.
- **Non fatto, e vale la pena saperlo**: la griglia dell'Anagrafica e quella del Magazzino restano due implementazioni parallele della stessa cosa — stessa struttura, stessa paginazione, già divergenti sulla firma di una funzione. Unificarle è un lavoro a sé, e farlo di sfuggita dentro un controllo generale avrebbe toccato le due viste più usate senza una rete di test all'altezza.

### 0.62.0 — 2026-09-06

Terza parte del controllo generale: quello che l'app diceva a chi non guarda lo schermo, e a chi lo guarda stretto.

**Corretto**
- **Tutta la validazione era muta.** Ogni messaggio dell'app passa dal toast — «Nome richiesto», «Codice già in uso», «La quantità non può essere negativa», e le decine di altri — ma il toast non era una *live region*: per un lettore di schermo quei messaggi non esistevano, e il salvataggio semplicemente «non faceva niente» senza che si potesse sapere perché. Ora l'elemento si annuncia, e distingue le due urgenze: un errore interrompe (`assertive`), una conferma aspetta il proprio turno (`polite`).
- **La schermata di accesso non aveva etichette.** I tre campi vivevano sul solo `placeholder`, e `a11yFields()` — che ripara le etichette delle schede — non ci passa mai, perché cerca `.modal-field` e l'accesso usa un'altra classe. È l'unica schermata che ogni utente attraversa per forza. Le etichette sono ora vere e riservate ai lettori di schermo (`.sr-only`): il disegno della scheda non cambia di un pixel. Anche l'errore di credenziali viene annunciato.
- **99 intestazioni di tabella non dichiaravano di essere colonne.** Su griglie da 12-16 colonne, senza `scope` un lettore di schermo non associa la cella alla sua intestazione: la navigazione per celle diventa una sequenza di numeri senza etichetta.
- **Anagrafica e Magazzino sfondavano il viewport.** Erano le due sole griglie a emettere una tabella nuda, senza il `.table-wrap` che documenti, fabbisogno, listino e scheda articolo usano da sempre: su schermo stretto trascinavano in scorrimento orizzontale **l'intera pagina**, intestazione e navigazione comprese. Ora scorre la tabella, dentro sé stessa.
- **I pulsanti di navigazione perdevano il nome sotto i 1330px.** Lì la media query nasconde l'etichetta, e `display:none` toglie quel testo anche all'albero di accessibilità: restava solo il `title` come ripiego. Ora ogni gruppo porta il proprio nome esplicito, e la seconda riga dichiara quale vista è quella aperta (`aria-current`).
- **Il pannello laterale non si ridimensionava col dito.** Gli ascoltatori erano `mouse*`: su tablet la maniglia era inerte e il pannello restava largo quanto nasce, rubando spazio all'elenco per sempre. Ora sono `pointer*` — sostituzione uno a uno — con `touch-action:none` sulla maniglia, altrimenti il dito farebbe scorrere la pagina invece di trascinare.

**Note**
- **Il DOM finto della suite ora ricorda gli attributi.** `setAttribute` era un no-op e `getAttribute` non esisteva: tutto ciò che l'app scrive in un attributo — i ruoli dei pannelli, le etichette che `a11yFields` ripara, l'urgenza del toast — si poteva provare solo per il fatto che non lanciava, non per quello che diceva. È una lacuna dell'attrezzatura, non di una funzione, e apre alla verifica un'intera classe di comportamenti.
- 14 casi nuovi in `test/a11y.test.js`, fra cui uno che rifiuta qualsiasi `<th>` senza `scope` in tutte le viste: la regola non si può più dimenticare aggiungendo una colonna. La suite passa da 1256 a 1270.

### 0.61.0 — 2026-09-06

Seconda parte del controllo generale: una regressione appena introdotta, e i punti in cui l'app accettava di salvare qualcosa che poi non sapeva più leggere.

**Corretto**
- **Nel tema scuro erano sparite le ombre** di schede, toast e pannello laterale. La riga che definiva i due token diceva `--shadow:var(--shadow)`: una variabile che cita sé stessa è invalida, e ogni regola che la usa viene scartata senza che il browser protesti. Introdotta con i temi della 0.58.0 e invisibile rileggendo il foglio, perché sembra una riga come le altre — ora un test rifiuta qualsiasi token che si autodefinisca, e verifica che le variabili usate senza valore di scorta esistano davvero.
- **«Salva» poteva svuotare un nome che «Aggiungi» pretendeva.** `saveSupplier` e `saveWc` accettavano il campo vuoto — un fornitore senza nome è una riga bianca in Gestione, e ogni richiesta e ordine intestati a lui stampano «senza fornitore» in PDF senza che niente lo segnali. `saveFamily` e `saveSubFamily` facevano di peggio: tenevano il nome di prima e annunciavano lo stesso «Aggiornata», così chi aveva svuotato il campo credeva di aver rinominato. I quattro passano ora da `requireVal()`, che è lo stesso controllo del ramo «aggiungi».
- **La modifica di un componente di distinta poteva salvarlo senza articolo.** Il controllo c'era su «aggiungi» e non su «modifica»: con il selettore lasciato vuoto la riga restava in distinta puntando al nulla, e il report la stampava vuota.
- **Sottogruppi e parti si contendevano gli stessi codici.** Dentro `MAC-GRP-###` i sottogruppi scendono da 999 e le parti salgono da 1, ma il calcolo del prossimo numero guardava solo i pari tipo: quando i due blocchi si incontravano l'app proponeva un codice **già in uso**, e poi lo rifiutava da sé con «codice già in uso» — sempre lo stesso, a ogni tentativo. Un vicolo cieco da cui si usciva solo scrivendo il codice a mano. Ora la numerazione salta i numeri dell'altro blocco, e quando lo spazio è davvero finito lo dice invece di proporre un doppione.
- **`kg` e `KG` convivevano come due unità di misura distinte**, contate separate e rinominate una per volta, lasciando le altre righe appese al codice vecchio.
- **La sessione scadeva dal primo accesso, non dall'ultimo.** Chi usa l'app tutti i giorni veniva comunque rimandato alla password al trentesimo giorno — mentre la ragione per cui la scadenza esiste è la postazione condivisa lasciata aperta, cioè quella dove nessuno entra da settimane. Ora rientrare rinnova.
- **Un avviso d'import poteva eseguire codice.** Il messaggio «sigla già in uso» interpolava il nome preso da una cella Excel senza passarlo da `esc()`, e i due report d'import lo stampano in `innerHTML`: bastava una macrofamiglia chiamata come un tag. Tutti gli altri avvisi del progetto escapavano già; questo era l'unico che se n'era dimenticato, ed è ora l'unica convenzione, scritta accanto a dove si stampa.
- **`esc()` non copriva l'apice singolo.** Nessun exploit vivo — gli attributi `onclick="fn('…')"` ricevono solo identificatori generati — ma il primo che ci passasse il nome di un articolo si sarebbe rotto su «L'albero», e su qualcosa di peggio avrebbe fatto altro.
- **Una vista senza il suo pannello lasciava l'app completamente vuota**: le viste erano già state spente, e l'eccezione fermava il resto. Ora non si cambia vista e l'errore viene registrato.
- **Lo stato delle schede non si spegneva alla chiusura.** Chiuso il listino, la variabile che ricorda su quale articolo si stava lavorando continuava a puntare lì, e un ridisegno arrivato da altrove scriveva sull'articolo sbagliato. Ogni scheda dichiara ora come si ripulisce (`onPanelClose`), accanto a dove quello stato viene creato.
- **`newId()` poteva lanciare proprio dove serviva il ripiego**: il fallback usava `crypto` fuori dalla guardia che stava verificandone l'esistenza — cioè nei contesti datati su `file://` per cui il fallback è stato scritto.
- **`resetViewState()` azzerava i filtri dei documenti con la forma precedente**, senza i due estremi del filtro per periodo: rimasti fuori il giorno stesso in cui sono nati. Ora si azzerano dalla funzione che li definisce.
- Ripulita `toggleItemFields()`, che dereferenziava dodici nodi senza guardia e due con: il giorno in cui un campo esce dal template, la scheda articolo smetteva di aprirsi del tutto.

**Note**
- `saveOwnPassword` passa ora da `Store.update` come tutto il resto: era rimasta l'unica scrittura sugli utenti che scavalcava la porta dello Store, cioè quella che l'adapter cloud intercetterà.
- 18 casi nuovi fra `test/theme.test.js`, `test/validate.test.js`, `test/codes.test.js` e `test/families.test.js`. La suite passa da 1238 a 1256.

### 0.60.0 — 2026-09-06

Controllo generale del codice. Questa revisione non aggiunge niente che si veda: chiude i punti in cui l'app **perdeva o falsava dati senza dirlo**. Sono difetti vecchi, trovati leggendo, e ognuno ha ora un test che impedisce che tornino.

**Corretto — dati**
- **La migrazione dai dati v1 rimappava quattro riferimenti su tredici.** Convertendo gli id vecchi in UUID seguiva fornitore, famiglia, sottofamiglia dell'articolo, componenti e lavorazioni; **lasciava indietro** le quotazioni a listino, macchina e gruppo di una parte, il fornitore di richieste e ordini, l'articolo delle loro righe, le righe dei piani, i movimenti di magazzino e le revisioni. Chi apriva l'app con un archivio v1 trovava ordini senza fornitore, righe senza articolo e movimenti orfani — con la migrazione già salvata. I riferimenti stanno adesso in un registro unico (`REFS`, accanto a `SCHEMA`), e le mappe di conversione sono **una per tipo**: gli id vecchi degli articoli erano numeri nudi, e una mappa sola poteva scambiare l'articolo 3 per il fornitore 3.
- **Ogni installazione nuova nasceva con tre quotazioni intestate a un fornitore inesistente.** Il seed del listino gira prima delle migrazioni e scriveva l'id vecchio del fornitore nella riga di listino, che nessuno rimappava più: in Gestione comparivano come «senza fornitore». Era una delle nove classi dimenticate, e si è chiusa con loro.
- **Un archivio locale illeggibile veniva sostituito dai dati di esempio e salvato sopra.** Un JSON interrotto — scrittura a metà, spazio finito, chiavetta sfilata — è quasi tutto ancora lì, e un recupero a mano ne salva la maggior parte: cancellarlo era l'unica cosa da non fare. Ora il blob resta dov'è, **una copia va da parte** (`bomtrack_v1_illeggibile`), non si salva niente sopra finché l'utente non lo decide, e una scheda spiega cos'è successo e che i dati non sono persi. Prima c'era solo una riga in console.
- **Un import distinte poteva svuotare una distinta e non rimetterla.** Il padre veniva azzerato alla prima riga valida e il controllo dei cicli arrivava dopo: un file la cui unica riga per quel padre creava un ciclo lasciava la distinta vuota, con un messaggio d'errore al posto dei componenti. Ora, se per un padre non entra nemmeno una riga, **la sua distinta torna quella di prima** e il report lo dichiara.
- **«1.234,56» entrava come 1,23.** `numOr` sostituiva la prima virgola e lasciava i punti — un prezzo plausibile, e falso — nelle quantità di distinta, nei parametri delle impostazioni e nelle tariffe orarie. Il parser giusto era già scritto per lo stesso difetto (`catNumOf`), e ora lo usano entrambi.
- **Le date a due cifre sbagliavano di 120 anni.** «31/01/26» non passava la regola italiana, cadeva nel ramo del seriale Excel dove `parseFloat` si ferma alla barra e legge 31, e diventava **30 gennaio 1900**; «2026-1-5» diventava 1905. E siccome la data è l'**identità** di una quotazione, nasceva un doppione datato 1900 che il confronto prezzi considerava vecchissimo. Ora si leggono anno a due cifre e mesi non impaginati, e il ramo del seriale si prende solo le celle che sono davvero un numero.

**Corretto — sincronizzazione** (nessun effetto oggi, che l'app è locale; sono le fondamenta su cui poggerà il database condiviso)
- **Il conto delle modifiche era cieco alle righe figlie.** Confrontava il solo timbro del record radice: rinominare una sottofamiglia tocca la sottofamiglia, non la famiglia, e quella rinomina risultava **«niente da mandare»**. Ora la firma di un record comprende i figli con identità propria — sottofamiglie, quotazioni, righe di documento — e non dipende più dalla disciplina di quaranta punti di chiamata.
- **Il conto e la fotografia che lo azzera si prendono ora insieme** (`Store.takeChanges()`). Fotografare al ritorno dalla rete marcava come già inviato tutto ciò che era stato scritto **durante** l'invio: modifiche perse in silenzio.
- **Ripristinare un backup, azzerare o svuotare il database non lascia più credere che sia tutto allineato**: la fotografia si dichiara non valida, e il riallineamento tocca a chi può confrontare le due parti.
- **Un ripristino dal cestino ridata il record.** Rientrando col timbro che aveva prima di essere eliminato sarebbe stato più vecchio della lapide, e il primo scarico dal server l'avrebbe ricancellato — che è esattamente ciò che `docs/cloud-schema.md` chiedeva di evitare.

**Corretto — quello che il file Excel si portava via**
- **Preferito e Obsoleto non si potevano più spegnere da file**: l'export scriveva la cella vuota per «no», e l'import legge la cella vuota come «non toccare». Ora il no è scritto.
- **La nota di una quotazione in linea non finiva in nessuna cella** (colonna «Note prezzo»): un articolo con una sola quotazione la perdeva al primo giro su una postazione nuova.
- **«Attivo» dei centri di lavoro non veniva esportato né riletto**, e il nome non si aggiornava mai: un centro sospeso rinasceva attivo, e le sue ore tornavano a costare.
- **Ricaricare lo stesso file senza la colonna «Fornitore» creava un doppione di quotazione** a ogni giro, contro la regola dichiarata nei template — «una colonna cancellata lascia il campo com'era».
- **Un refuso nel «Fattore» cancellava la doppia unità in silenzio**, e il costo d'acquisto cambiava senza traccia. Ora è un errore di riga, come già era venti righe più giù.

**Corretto — interfaccia**
- **Il toast verde «Salvato» non compare più quando il salvataggio non è avvenuto.** Con l'archivio pieno o in navigazione privata si vedeva la conferma verde e, sopra, la scheda rossa che diceva il contrario: due messaggi opposti sullo stesso gesto. Quaranta conferme passano ora da `savedToast()`, che tace se i byte non sono arrivati.

**Note**
- Le righe d'ordine restano **sempre nell'unità di gestione**, col prezzo convertito: una barra gestita a metri e quotata a chilo si ordina in metri a *(kg per metro) × (prezzo al chilo)*. Era già il comportamento dell'app da due revisioni, ma **un test era rimasto sulla regola opposta** e la suite era rossa da allora — cioè la verifica automatica non guardava più nessuno. È tornata verde, e `docUomFor()`, rimasta in giro con il commento della regola vecchia, è stata tolta: un lettore che avesse trovato quella prima avrebbe capito il sistema al rovescio.
- 34 casi nuovi fra `test/migrate.test.js`, `test/import.test.js` e `test/sync.test.js`. La suite passa da 1204 a 1238.
- Nota di metodo emersa dai test: i timbri hanno **risoluzione al millisecondo**, quindi due scritture nello stesso millesimo sono indistinguibili per il conto delle modifiche. Oggi non ha effetto — l'app è locale e salva tutto — ma è il limite del protocollo, e va saputo prima di appoggiarci il backend.

### 0.59.0 — 2026-09-06

**Aggiunto**
- **Anagrafica clienti** (*Gestione → 📇 Clienti*), accanto a quella dei fornitori e con gli stessi campi: nome, referente, email, telefono, P.IVA / C.F., indirizzo completo e note. Fino a ieri il cliente esisteva solo come **testo dentro la commessa**, riscritto a mano ogni volta: lo stesso cliente diventava «Rossi Srl», «Rossi S.r.l.» e «rossi», e nessun elenco lo rimetteva insieme.
- **I nomi dell'anagrafica si propongono nel campo Cliente della commessa.** È un suggerimento, non un vincolo: la commessa di un cliente che in anagrafica non c'è ancora si scrive lo stesso, e il cliente si registra dopo. I clienti sospesi non si propongono.
- **Il foglio Clienti entra nell'export e nell'import delle impostazioni di Gestione**, con le stesse regole degli altri: chiave il nome, additivo, non cancella niente.

**Note**
- **Il campo Cliente della commessa resta testo, e non è una scorciatoia.** Trasformarlo in un riferimento all'anagrafica vorrebbe dire riscrivere elenco, ricerca ed export delle commesse — e soprattutto **lasciare senza cliente le commesse già scritte**, che un cliente in anagrafica non ce l'hanno per definizione. Il legame resta quindi il nome, e da lì discendono le tre regole che lo tengono in piedi: il nome è **unico** (due omonimi renderebbero ambigua la citazione), **rinominare un cliente allinea le commesse** che portavano il vecchio nome — altrimenti resterebbero appese a un nome che in anagrafica non esiste più — e **un cliente citato da una commessa non si elimina**, come per i fornitori usati da un articolo. Il giorno in cui la commessa prendesse un riferimento vero, la migrazione sarà un abbinamento per nome: è la ragione per cui il nome si tiene unico da adesso.
- Il rename allinea confrontando i nomi **ignorando spazi e maiuscole**: una commessa scritta « bianchi » non deve restare indietro proprio perché qualcuno aveva battuto uno spazio di troppo.
- I clienti sono una collezione come le altre — cestino con ripristino, timbri di modifica, tabella `customers` nella mappa cloud: non un elenco a parte da ricordarsi di trattare a mano.
- 18 casi in `test/customers.test.js`.

### 0.58.1 — 2026-09-06

**Corretto**
- **Sette contrasti sotto la soglia di leggibilità, sei dei quali c'erano da sempre nel tema scuro.** I peggiori: il pulsante **Salva** quando ci sono modifiche non salvate (bianco su ambra, **2.2:1**) e il toast di conferma (bianco su verde, **2.8:1**). Più il blu d'accento sia come testo (4.24:1) sia come fondo dei pulsanti pieni (4.06:1), il rosso del badge «non salvato» (3.5:1) e il rosso Acrobat del pulsante PDF (4.0:1). La soglia è 4.5:1 — quella del testo normale, che vale anche per le scritte dei pulsanti: sono in grassetto ma a 12-13px, molto sotto i 18.66px da cui il testo conta come «grande».

**Note**
- **Un colore ha due mestieri, e non può farli con lo stesso valore.** Uno lo si **legge** — testo, bordi, icone — e deve staccare dal fondo della scheda; sull'altro ci si **scrive sopra** — i pulsanti pieni — e deve staccare dall'inchiostro. Sul tema scuro i due vincoli tirano in direzioni opposte: perché il blu si legga sulla scheda serve luminanza ≥ 0.225, perché regga il bianco serve ≤ 0.183. **La finestra è vuota: nessun blu può fare entrambe le cose**, e quello di prima stava esattamente nel mezzo, mancandole tutte e due di poco. Da qui `--accent` per il primo mestiere e `--accent-solid` per il secondo, e lo stesso per rosso e verde. Sul tema chiaro il fondo bianco allarga la finestra e i due valori coincidono, ma i nomi restano: il foglio di stile non deve sapere quale tema è in corso.
- **L'ambra fa eccezione e cambia inchiostro invece che tinta.** Scurirla fino a reggere il bianco la spegnerebbe proprio dove serve gridare — è il pulsante che dice «hai modifiche non salvate». Resta accesa e la scritta diventa scura: 8.1:1 invece di 2.2:1. Sul tema chiaro l'ambra è già scura e l'inchiostro torna bianco, e questo lo decide un token (`--on-orange`), non una regola in più.
- Gli spostamenti sono piccoli e la faccia dell'app non cambia: il blu d'accento va da `#3A7BE8` a `#4583E9`, il fondo dei pulsanti a `#2A70E6`. Il rosso Acrobat scende a `#E41C1C`, che resta il rosso di quel formato.
- **7 casi nuovi in `test/theme.test.js` che non provano codice, provano numeri** — ed è il motivo per cui servono. Un colore si sposta di due punti perché «si vedeva meglio» e la leggibilità se ne va senza che niente si rompa: nessuna schermata sbaglia, nessun test fallisce, semplicemente qualcuno in officina fatica a leggere. Ora la soglia è scritta, la palette si rilegge dal foglio di stile vero — non da una copia nel test, che si direbbe d'accordo con sé stessa — e un contrasto che scende fa fallire la suite nominando il colore.

### 0.58.0 — 2026-09-06

**Aggiunto**
- **Tema chiaro, oltre a quello scuro.** Il pulsante è nell'intestazione, accanto a stampa e ricerca, e gira su **tre** stati: *come il sistema*, *chiaro*, *scuro*. Il primo è quello di partenza ed è anche il più utile — il PC sa già se fuori è giorno, e in officina lo schermo si guarda alle sette del mattino e alle sette di sera. Chi sceglie esplicitamente vince sul sistema, e la scelta resta al riavvio.

**Note**
- **Il colore stava già tutto in dodici variabili**, usate ~340 volte: il tema non ha richiesto di riscrivere il foglio di stile, ma di scrivere una seconda palette e di sistemare **45 righe** che avevano ancora un colore fisso. La prova che l'impianto reggeva c'era da sempre in fondo al file — il blocco di stampa ridefinisce gli stessi token in chiaro, e non ha mai avuto bisogno di una regola in più.
- **Il chiaro non è lo scuro invertito.** Le tinte d'accento leggibili su fondo scuro su bianco non lo sono: l'arancio `#E8A33A` su bianco dà 1.9:1, illeggibile, e va portato all'ambra. Blu, rosso e verde sono anche testo, non solo bordi, e sono stati scuriti per la stessa ragione. Sulla carta bianca del tema chiaro ogni colore sta ora fra 5.3:1 e 17:1.
- **Le tinte tenui sono derivate, non riscritte**: i fondi degli avvisi, le pastiglie di tipo, le righe selezionate nascono da `color-mix` sui colori di base, quindi esistono una volta sola e seguono il tema da sé. Un `rgba()` fisso è invece un colore pensato per un fondo solo — ed era il motivo per cui quelle 45 righe non potevano cambiare tema.
- **Il tema si applica prima che la pagina si disegni**, con quattro righe in testa a `index.html`: `theme.js` sta in fondo al body, e aspettarlo significherebbe un lampo scuro in faccia a chi ha scelto il chiaro.
- **«Come il sistema» si esprime togliendo l'attributo**, non scrivendo `data-theme="auto"`: è l'assenza a restituire la decisione alla media query. È il punto su cui è facile sbagliare senza accorgersene — il tema resterebbe bloccato a metà — ed è quello che i test coprono per primo.
- **La preferenza vive nel browser di chi lavora, non nel database.** È una comodità personale, come la larghezza dell'ispettore: sincronizzarla imporrebbe il proprio tema ai colleghi. Per la stessa ragione il comando sta nell'intestazione e non in Gestione, che scrive solo l'amministratore: il tema lo sceglie chi guarda lo schermo, qualunque ruolo abbia.
- **Stampare col tema scuro attivo non annerisce la pagina.** Il blocco di stampa ora ripete il selettore con l'attributo: senza, `:root[data-theme=dark]` vinceva per specificità e usciva un foglio nero. La carta resta bianca in tutti e tre gli stati.
- Rosso Acrobat e verde Excel restano fissi: sono i colori dei due formati, non del tema, e cambiarli col fondo li renderebbe irriconoscibili proprio dove distinguono due pulsanti gemelli.
- 13 casi in `test/theme.test.js`. Il colore non si prova senza un motore di rendering; si prova il **contratto** fra i due pezzi — quale attributo `theme.js` scrive e quando lo toglie — che è esattamente ciò che non si vede rileggendo il CSS.

### 0.57.0 — 2026-09-06

**Aggiunto**
- **La sigla di una macrofamiglia non si può più ripetere nel suo ambito, e quella di una sottofamiglia dentro la sua macrofamiglia.** La sigla non è un'etichetta: compone il codice articolo — `CMM-MEC-CUS-007` — e ripetuta lo rende ambiguo, perché da quel codice non si risale più a quale delle due famiglie `MEC` venga il pezzo. Un codice costruito a segmenti che non identifica più la sua famiglia ha perso la ragione per cui è fatto così. Il controllo scatta in Gestione su tutti e quattro i punti in cui una sigla si scrive: nuova macrofamiglia, modifica, nuova sottofamiglia, modifica.
- **Le sigle già ripetute si vedono**, in un riquadro in testa alla scheda famiglie del loro ambito e in rosso accanto alla riga che le porta. L'elenco dice che il problema esiste, il rosso dice quale riga aprire.

**Note**
- **Il campo di gara è quello che il codice non ha già fissato da sé.** Per una macrofamiglia è il suo ambito, perché il prefisso `CMM`/`MAT`/`PRT` separa già i tre: `CMM-MEC` e `MAT-MEC` non si confondono, e vietare anche quello esaurirebbe presto le sigle di tre lettere per nulla. Per una sottofamiglia è la macrofamiglia che la contiene, perché il segmento precedente l'ha già scelta: `CMM-IDR-GUA` e `CMM-MEC-GUA` sono due codici distinti. La regola vieta esattamente ciò che crea ambiguità, e niente di più.
- **Le sigle duplicate già in archivio restano**, e non bloccano il lavoro: si impedisce di introdurne di nuove, non si punisce chi c'era già. Riscriverle d'ufficio cambierebbe di nascosto il prefisso dei codici futuri di una famiglia, e a decidere quale delle due cambiare è una persona. È la stessa scelta, e lo stesso riquadro, dei codici articolo duplicati in Gestione › Backup. I codici già assegnati non cambiano in nessun caso.
- **Chi lascia il campo sigla vuoto è soggetto alla stessa regola**, ma il messaggio lo dice: la sigla dedotta dal nome («Meccanismi» → `MEC`) altrimenti sembrerebbe arrivare dal nulla. Le sigle automatiche sono le prime tre lettere del nome, quindi le collisioni non sono un caso di scuola: «Meccanico» e «Meccanica» danno entrambe `MEC`.
- **Negli import la sigla si scosta da sola** — le famiglie lì si creano senza nessuno davanti, e un file di 500 articoli non deve fallire per tre lettere in comune. Si cerca la prima libera allungando prima sul nome, che resta leggibile (`MEC` → `MECC` → `MECCA`), e solo dopo numerando (`MEC2`); il tetto è 6 caratteri, quanto il campo accetta. Ogni scostamento finisce scritto nel report: l'import impostazioni ha ora una sezione avvisi in arancio, distinta dagli errori in rosso, perché quelle righe sono entrate — solo non esattamente come erano scritte.
- 29 casi nuovi in `test/families.test.js`, dove i due test che contano di più sono quelli che dicono *ammesso*: stessa sigla in un altro ambito, stessa sigla in un'altra macrofamiglia. Sono loro a distinguere questa regola da un'unicità globale, ed è su uno di loro che la prima stesura sbagliava.

### 0.56.0 — 2026-09-06

**Aggiunto**
- **Filtro per periodo in tutti e quattro gli elenchi**: richieste, ordini, commesse e piani di fabbisogno. Un intervallo *dal … al …*, che si può lasciare aperto da un lato solo (*dal 1 settembre* in poi, oppure *fino al 30 giugno*). Vale sulla data del documento — per le commesse è la **data di apertura**, quella che risponde a «cosa abbiamo preso in carico a settembre», non la consegna. Entra nel conteggio, nel pulsante **Azzera filtri** dove c'è, e nell'intestazione dell'export, che dichiara il periodo a parole — «dal 1/9/2026 al 30/9/2026» — perché un elenco stampato senza dire su cosa è filtrato è un elenco che qualcuno leggerà come completo.

**Cambiato**
- **Le testate dei documenti sono più compatte, e ora si somigliano davvero.** Gli otto campi di un ordine (titolo, fornitore, data, stato, resa, pagamento, conferma d'ordine, note) occupavano quasi uno schermo pieno per via di spazi vuoti che si sommavano fra loro, e le righe cominciavano sotto la piega. Ora la scheda entra in un colpo d'occhio. Lo stesso ritmo verticale vale per **richieste, ordini, commesse e piani di fabbisogno**: sono quattro volte lo stesso gesto — i dati di intestazione di un documento — e ora hanno la stessa forma, campi dentro una scheda riquadrata sotto la barra dei comandi. Prima commesse e piani li tenevano nudi sullo sfondo, e le quattro pagine si somigliavano solo a metà.

**Note**
- Il filtro è **uno solo per quattro elenchi** (`dateRangeFilter`, `inDateRange`, `dateRangeText` in `worklist.js`, dove sta già il telaio comune): quattro copie della stessa coppia di caselle divergerebbero al primo ritocco, e il filtro dello schermo e quello dell'export devono restare lo stesso codice — altrimenti il file e la schermata raccontano due storie diverse dello stesso periodo.
- Le date si confrontano come stringhe `AAAA-MM-GG`, che è già l'ordine del calendario: nessuna conversione, nessun fuso orario di mezzo. I documenti più vecchi che portavano l'istante completo invece del solo giorno vengono tagliati prima del confronto, e un documento senza data resta fuori quando un intervallo è impostato — non avendo data, non si può dire che ci cada dentro.
- Lo spazio recuperato non viene da campi più piccoli ma da margini contati due volte: `manage-wrap` distanzia già i blocchi col suo `gap`, e il gap dei flex **non** si fonde coi margini — ogni blocco che ne portava uno apriva una fascia in più. Stessa cosa dentro la scheda, dove `modal-field` (nato per le finestre modali, dove è lui a distanziare) si sommava al `gap` della griglia: 24px fra una riga e l'altra invece di 12. Le regole stanno in `style.css` sotto `manage-wrap`, `rfq-head` e `modal-grid`, e valgono per le quattro pagine insieme.
- Il riquadro su commessa e piano si ottiene dallo stile, non riscrivendo il markup: la regola guarda le griglie di campi **in pagina** (`.manage-wrap > .modal-grid`) e non tocca quelle dentro le finestre modali, dove la scheda è già la finestra e un riquadro dentro il riquadro non direbbe niente.

### 0.55.0 — 2026-09-05

**Aggiunto**
- **Mettere una commessa «In produzione» adesso controlla se il materiale c'è.** Prima non controllava niente: si scriveva lo stato e basta, e che mancassero dieci articoli lo si scopriva in officina — quando il lead time era già perso e la data al cliente era già stata data. Ora compare una domanda che nomina i codici mancanti e la data di consegna, con due vie: *Metti in produzione lo stesso* oppure *Non ancora*. **Non blocca**: l'app avvisa e lascia decidere, perché chi ha un'urgenza vera deve poter andare avanti senza barare sui dati — dati falsi, poi, restano.
- **Sezione «Copertura materiale» nella scheda della commessa**, sempre leggibile, più un KPI in cima. I codici sono le stesse pastiglie del riepilogo, e ognuna porta al piano che genera quella riga: è lì che si emette la richiesta o l'ordine.
- **In Riepilogo → «Richiede attenzione»**: le commesse **già in produzione** a cui manca materiale da ordinare, gravità alta come una consegna sforata. La conferma la vede una persona sola, una volta; se dopo l'avvio un ordine slitta o un piano cresce, il riepilogo è l'unico posto che rilegge il presente.
- Il magazzino sa ora anche **quando** arriva la merce ordinata, non solo che arriva: `incomingEntro(itemId, data)` divide ciò che arriva in tempo da ciò che arriva dopo. La data è quella confermata dal fornitore se l'ha data, altrimenti quella che gli abbiamo chiesto — la stessa coppia che legge `orderWorstDelay`.
- `test/job-coverage.test.js` (25 casi), più i casi su `incomingEntro` e `commitsOn` in `test/stock.test.js` e il nuovo segnale in `test/home.test.js`.

**Note**
- **Quattro livelli, perché sono quattro telefonate diverse.** *Da ordinare*: non è ordinato, si compra — l'unico che costa un lead time. *In un documento non ancora inviato*: la richiesta o l'ordine esistono già in bozza; dire «ordina» a chi il documento l'ha scritto è falso, gli manca di premere Invia (e una bozza, giustamente, non conta come merce in arrivo). *In arrivo dopo la data in cui serve*: non c'è niente da comprare, c'è un fornitore da sollecitare — confonderlo con «da ordinare» farebbe ricomprare merce già pagata. *Coperto*. Un semaforo rosso solo li appiattirebbe, e un avviso che dice «manca» anche a chi ha già ordinato si impara a chiudere senza leggerlo.
- **Una commessa senza piani di fabbisogno aperti non è «tutto ok»: è «non lo so»**, e la commessa lo dice così, sia nella scheda sia nella domanda. Una spunta verde lì sarebbe una bugia comoda, detta proprio a chi sta per avviare il lavoro.
- **La commessa è una domanda sola, non N piani.** Le righe di tutti i suoi piani aperti si sommano prima di guardare il magazzino: due piani della stessa commessa che chiedono 100 pz con 100 a scaffale non devono vedersi scoperti a vicenda. Da qui `commitsOn()` che accetta anche un insieme di piani da escludere — la concorrenza sono gli **altri**, non noi. I piani di altre commesse restano concorrenza, come prima.
- Nessun calcolo nuovo: si riusano `mrpExplode`, `mrpBuyRow` (con il netto forzato, come fa il riepilogo — il conteggio non deve dipendere dall'interruttore della vista Fabbisogno), `netRequirement` e `planDocumentedItems`. Nessun campo salvato, nessuna prenotazione: la copertura è calcolata, e cambia da sola quando arriva la merce.
- **Nessun flag «avviso già visto»**: la domanda si fa solo entrando in produzione, e solo se non ci si è già. Un ritocco a una nota non la fa ricomparire, e uscire dalla produzione non chiede niente. Un flag salvato congelerebbe una risposta data ieri e contraddirebbe la sezione Copertura.
- I piani **chiusi** restano fuori, come già per gli impegni: chiuderli è il modo di dire «questo lavoro non c'è più». Se le distinte contengono un anello, l'esplosione è troncata e la copertura non si dichiara mai «coperta»: sarebbe una promessa che non si può mantenere.

### 0.54.0 — 2026-09-05

**Cambiato**
- **Le righe di richieste e ordini stanno su due piani.** Una riga d'ordine aveva dodici colonne, e dodici colonne su uno schermo normale vogliono dire testo minuscolo o scorrimento orizzontale — e con lo scorrimento il codice, che è l'identità della riga, esce dallo schermo. Le colonne però non erano dodici cose diverse: erano **sei coppie**, e adesso stanno una sopra l'altra dentro la stessa cella.

  | | sopra | sotto |
  |---|---|---|
  | 1 | codice | descrizione |
  | 2 | quantità | unità di misura |
  | 3 | prezzo unitario | importo di riga |
  | 4 | data richiesta | data confermata |
  | 5 | ricevuto | residuo |
  | 6 | modifica riga / nota | togli la riga |

  Sopra sta il dato che si compila, sotto quello che lo spiega o ne consegue. Le richieste di offerta hanno le stesse coppie meno quelle che una richiesta non ha: niente ricevuto e niente data confermata.
- Il vantaggio non è solo lo spazio: **le due metà si leggono insieme**. «10 pz» e «120,00 €» stanno una sotto l'altra invece che a mezzo schermo di distanza, e il residuo sta sotto il ricevuto che lo produce.

**Aggiunto**
- La richiesta di offerta mostra ora l'**importo di riga** (quantità × prezzo offerto), che prima si vedeva solo nel confronto offerte.
- `test/doc-rows.test.js`: le colonne dichiarate in testata, le celle di ogni riga e i `colspan` del totale e della riga vuota devono raccontare la stessa tabella — sbagliarne uno solo storce l'intestazione rispetto ai dati. E ogni coppia deve stare nella sua cella, con il campo giusto sopra e il suo esito sotto.

**Note**
- Una riga di documento resta **un solo `<tr>`**: i due piani sono due righe dentro ogni cella, non due righe di tabella. Così l'ordinamento, il blocco dei campi e la selezione continuano a valere su una riga sola, e nessuno può separarne le metà.
- Il blocco dei documenti inviati vale come prima su entrambi i piani: quantità e prezzo restano contratto, ricevuto e data confermata restano ricevimento.
- La riga manuale continua a dichiararsi, e la nota di riga, il codice del fornitore e gli avvisi (lotto, non a listino) restano sotto la descrizione, dove stavano.

### 0.53.0 — 2026-09-05

**Aggiunto**
- **«Richiede attenzione» dice adesso chi lo ha fatto scattare.** Sotto ogni riga compaiono i codici e i numeri che la riguardano: le commesse in ritardo per numero, gli articoli sotto scorta o senza prezzo per codice, le richieste in attesa e gli ordini confermati tardi per numero di documento. Prima si leggeva «7 articoli sotto la scorta minima» e per sapere **quali** bisognava aprire il magazzino e rifare a mano il filtro — cioè rifare il lavoro che l'avviso aveva già fatto.
- **Ogni voce porta dove si risolve**, non alla vista in generale: la commessa alla sua commessa, la riga di fabbisogno al piano che la genera (è lì che si emette la richiesta o l'ordine), l'articolo alla sua scheda. La riga di intestazione continua a portare alla vista.
- Il **suggerimento di ogni voce dice perché è lì**: il cliente e la data della commessa, l'esistente contro la scorta minima, i giorni di ritardo confermati dal fornitore, il piano e la quantità da ordinare.
- Le voci sono **in ordine di urgenza**: la commessa più vecchia per prima, l'ordine con il ritardo peggiore per primo, le righe di fabbisogno per data entro cui ordinare.
- Oltre **otto voci** si scrive quante ne restano («+4 altri in Acquisti»): il conteggio in testa resta il totale vero, e l'elenco resta un dettaglio invece di diventare la vista.
- `test/home.test.js`: ogni avviso deve nominare chi lo ha fatto scattare, ogni voce deve portare dove si risolve, e il conteggio deve restare quello vero anche quando le voci scritte sono meno.

**Note**
- I **codici duplicati** si nominano ma non si aprono: aprire uno dei due non direbbe quale dei due è quello sbagliato, e si sbrogliano in Gestione. La pastiglia resta testo, con il bordo tratteggiato, e il suggerimento elenca gli articoli che se lo contendono.
- Le voci stanno **fuori** dal bersaglio della riga: un pulsante dentro un pulsante non si sa più cosa apre, né col mouse né da tastiera.
- Nessun conteggio è cambiato: gli avvisi sono gli stessi di prima, con la stessa provenienza. Cambia solo che adesso si spiegano.

### 0.52.1 — 2026-09-05

**Corretto**
- **La pagina si ricentra quando il pannello laterale si chiude.** Lo spazio del pannello veniva preso con un `margin-right` su `#app-main`, che però spegneva l'`auto` responsabile del centraggio: con il sinistro `auto` e il destro fisso, tutto lo spazio libero finiva a sinistra e il contenuto si schiacciava contro il pannello — su uno schermo largo, spostato di centinaia di pixel fuori asse. Restava storto anche a pannello chiuso, per via della striscia da 38px.
- Ora la scatola si allarga di quanto è largo il pannello e si imbottisce a destra di altrettanto: i margini restano `auto` e il contenuto si centra da sé **in ciò che si vede**, sia a pannello aperto sia a pannello chiuso. La larghezza utile del contenuto non cambia di un pixel rispetto a prima.

### 0.52.0 — 2026-09-05

**Cambiato**
- **Commesse, Fabbisogno, Richieste di offerta e Ordini hanno la stessa forma**: l'elenco vive in una colonna a destra e non se ne va mai, il documento scelto sta al centro. Prima erano quattro pagine-elenco a tutta larghezza, e aprire un documento faceva sparire l'elenco: per passare al successivo si tornava indietro, si ritrovava la riga, si riapriva. Confrontare due ordini o passare in rassegna dieci richieste voleva dire fare quel giro dieci volte.
- I **filtri stanno con l'elenco**, impilati nella sua colonna: sono il modo per restringerlo, non un'intestazione della pagina. Gli stessi di prima — testo, stato, fornitore per i documenti; testo per commesse e piani — con il conteggio sotto.
- La **riga aperta resta marcata** nell'elenco, e i documenti chiusi, annullati o non più attivi si vedono spenti invece di sparire.
- Il pulsante **← Elenco** è diventato **Chiudi**: l'elenco non è più un altrove in cui tornare.

**Aggiunto**
- I comandi che stavano nelle righe sono ora nella **testata del documento aperto**, scritti per esteso: *Crea ordine* ed *Elimina* sulla richiesta, *Elimina* sull'ordine, *Duplica* ed *Elimina* sul piano (che già aveva chiudi/riapri). In una colonna da 360px non ci stanno sei icone per riga, e un comando che agisce su un documento ha senso dove quel documento si vede.
- Con nessun documento scelto, al centro compare **cosa fa quella vista** e il pulsante per creare il primo documento, invece di una pagina bianca.
- `test/worklist.test.js`: le quattro viste devono disegnare lo stesso telaio, l'elenco deve restare visibile a documento aperto, la riga aperta deve essere una sola e i comandi spostati devono esistere ancora.

**Corretto**
- **Saltare da un documento all'altro non perde più le modifiche in sospeso.** Il salvataggio differito di richieste e ordini lo faceva l'uscita verso l'elenco; con l'elenco sempre presente quel passaggio non c'era più, e un click sulla riga accanto avrebbe buttato via quel che si era appena scritto. Ora ogni apertura chiude il documento precedente come faceva l'uscita: salva, e lascia decadere l'eventuale sblocco — che vale per un documento solo. Vale anche per i salti da un'altra vista (dalla commessa alla sua richiesta, dal piano ai documenti che ne sono nati).
- La ricerca di **Commesse** e **Fabbisogno** ridisegna solo l'elenco: prima rifaceva la vista intera e il campo perdeva il focus a ogni lettera.

**Note**
- Il telaio sta in `worklist.js`, ed è **solo un disegno**: prende dati e restituisce HTML, non tiene stato. Le viste che non lo chiamano non se ne accorgono.
- Nessuna funzione è stata tolta: stesse guardie di ruolo, stesso blocco dei documenti inviati (i filtri dell'elenco non hanno classi `lock-*` e restano manovrabili anche a documento protetto), stessi export.
- In stampa esce il documento, non lo strumento per sceglierlo: la colonna dell'elenco non finisce su carta. Sotto i 1100px le due colonne si impilano, con l'elenco sopra.

### 0.51.1 — 2026-09-05

**Corretto**
- **All’avvio l’app segnalava un errore** («Script error.»). `columns.js` e `inspector.js` erano stati messi **dopo** `import-export.js`, che in fondo contiene `init()`: quando l’avvio disegnava la prima vista quei due file non erano ancora stati letti, e la chiamata a `inspectorClear()` dentro `setView()` trovava il vuoto. La vista si disegnava lo stesso — l’eccezione arriva in coda — ma il pannello non si popolava e partiva l’avviso. I due script ora stanno prima, e `import-export.js` è tornato l’ultimo, com’è scritto nella sua stessa intestazione.
- Il messaggio era muto («Script error.», senza riga né stack) perché aprendo `index.html` con un doppio click gli script arrivano da `file://`, che per il browser è un’origine opaca: dei propri script non racconta niente. Vale la pena saperlo per la prossima volta: un «Script error.» secco, in locale, è quasi sempre un’eccezione vera in uno degli script dell’app.

**Aggiunto**
- Tre controlli in `test/scripts.test.js` che rendono impossibile ripeterlo: `import-export.js` deve restare l’ultimo script, la sequenza caricata dalla suite deve essere **identica** a quella di `index.html`, e ogni script dichiarato deve esistere. La suite non se n’era accorta perché nel suo contesto il `document` finto si installa **dopo** il caricamento: `init()` non parte, e l’ordine sbagliato non si vedeva.

### 0.51.0 — 2026-09-05

**Aggiunto**
- **Selezione multipla e azioni di massa** negli elenchi con il pannello. `Ctrl+click` aggiunge una riga, `Maiusc+click` prende tutto quello che sta in mezzo, `Maiusc+freccia` fa lo stesso da tastiera. Con più righe scelte il pannello cambia mestiere: mostra quanti sono e di che tipo, e offre le azioni che hanno senso su un mucchio di articoli qualsiasi.
- Le azioni: **segna come non più utilizzabili** (o il contrario), **preferiti**, **esporta la selezione** in Excel e PDF, **elimina**. Marcare obsoleti quaranta codici uno per uno è il lavoro che si rimanda per sempre, e l’anagrafica resta sporca.
- Il pannello **elenca le righe scelte**: agire su venti articoli senza vederne l’elenco è firmare senza leggere.

**Note**
- Le regole non cambiano perché il gesto è uno solo: stesse guardie di ruolo, stesso `touch()` sull’autore, stesso cestino. Chi è in sola lettura vede solo gli export.
- Chi è **usato in una distinta non si elimina**, come da sempre: la conferma dice prima quanti resteranno fuori, invece di lasciarlo scoprire a gesto fatto. E il conto di quanti sono cambiati **davvero** viene detto sempre: chi ne sceglie quaranta e ne vede cambiare trentotto deve sapere che due non si potevano toccare.
- Il ripristino è uno solo per tutto il gesto: chi si pente si pente dell’intero blocco, non di una riga.
- L’export della selezione riusa la specifica della vista con la scelta come filtro in più, e lo scrive nell’intestazione del file («Selezione: 12 righe scelte a mano»): fra un mese, chi apre quel foglio deve sapere perché contiene quelle righe e non altre.
- Un filtro più stretto non butta via la scelta: cadono le righe che spariscono, restano le altre.

### 0.50.0 — 2026-09-05

**Aggiunto**
- **Colonne a scelta** negli elenchi di Acquisti, Progetto e Magazzino. Il pannello laterale aveva tolto dalle righe i comandi; qui si tolgono le colonne che a una certa persona, in un certo lavoro, non servono — chi compra non guarda il lotto, chi controlla il magazzino non guarda la famiglia. Nascondere non è perdere: l’articolo scelto ha tutto nel pannello, che di spazio ne ha.
- Il pulsante **Colonne** dice quante ne mancano («Colonne (2 nascoste)»): un elenco a cui manca una colonna, senza che nulla lo dica, sembra un elenco rotto. Dentro la scheda le caselle si spuntano e l’effetto è immediato, senza chiuderla.
- Codice e nome **non si nascondono**: sono l’identità della riga, e senza di loro l’elenco non è più pulito, è illeggibile. Restano visibili nella scheda, spenti e spiegati, invece di sparire senza motivo.
- Ogni elenco tiene la **sua** scelta: Acquisti e Progetto disegnano le righe con la stessa funzione, ma sono due elenchi che si guardano per motivi diversi.

**Note**
- Il meccanismo è deliberatamente stupido: ogni cella porta la classe della sua colonna e nascondere è una regola CSS. Nessun ridisegno, nessun conteggio di `<td>` da tenere allineato con i `<th>` — la stessa classe sta su entrambi.
- Una preferenza salvata mesi fa non sopravvive a una colonna tolta dal codice o diventata fissa: al caricamento si scarta ciò che non esiste più.
- **L’export Excel e PDF resta completo**: esporta l’elenco, non la vista. Chi nasconde una colonna per lavorare più comodo non deve ritrovarsi un file monco.
- I due interruttori del fabbisogno («Fabbisogno netto», «Raggruppa per fornitore») usavano già la classe `active` senza che nessuna regola la disegnasse: ora, come il pulsante Colonne, da accesi si vedono azzurri.

### 0.49.0 — 2026-09-05

**Aggiunto**
- **Pannello laterale** (Ctrl+I): una colonna a destra, ridimensionabile trascinandone il bordo, che mostra i comandi eseguibili sulla riga scelta e le schede da consultare. Gli elenchi erano arrivati a nove colonne più una di pulsanti — sei icone mute per riga, che rubavano larghezza ai dati e si spiegavano solo passandoci sopra. Ora quei comandi hanno un posto fisso, con l’etichetta scritta per esteso, e l’elenco torna a essere dati.
- In cima al pannello un **riepilogo** — tipo, costo unitario, giacenza, quanti impieghi diretti — che risponde alle domande veloci senza aprire niente.
- **Selezione da tastiera**: ↑ e ↓ scorrono le righe, Invio apre la scheda completa, Esc deseleziona. Valgono solo mentre si guarda l’elenco: dentro un campo la freccia resta al cursore.
- Larghezza (fra 260 e 720px), apertura e scheda attiva **restano fra una sessione e l’altra**, nel browser di chi lavora.

**Cambiato**
- Con il pannello aperto **la colonna dei pulsanti sparisce** da Acquisti, Progetto e Magazzino: i suoi comandi sono nel pannello. Chiudendo il pannello torna dov’era — nessuna funzione è stata tolta, è cambiato dove si trova.

**Note**
- Il pannello non aggiunge comandi: sono le stesse chiamate che stavano nelle righe, alle stesse condizioni (il listino solo per ciò che si compra, il ciclo solo per le parti). In sola lettura i comandi che modificano non vengono nemmeno disegnati, come già accade nella vista.
- Le schede riusano i corpi che esistono già (`itemInfoBody`, `priceListBody`, `usageBody`): due copie della stessa scheda divergerebbero al primo ritocco.
- Le viste non ancora coperte non hanno pannello e non se ne accorgono. Restano da fare, in ordine: selezione multipla con azioni di massa, scelta delle colonne per vista, selezione nell’indirizzo.

### 0.48.3 — 2026-09-05

**Cambiato**
- Nelle barre di sezione **Esporta Excel** ed **Esporta PDF** vanno a destra, staccati dal titolo e dai comandi che agiscono sui dati: sono l’uscita, non un’azione di lavoro, e da appaiati al titolo sembravano il gesto principale della pagina. Vale per Acquisti, Progetto, Magazzino, Cicli, Costificazione e la testata di un piano di fabbisogno — tutte le barre `.bom-toolbar`. La barra del documento nelle richieste e negli ordini resta com’era: lì i due pulsanti seguono la loro etichetta.

### 0.48.2 — 2026-09-05

**Cambiato**
- Le icone arrivano **in tutta l’app**: Documenti, Fabbisogno, Magazzino, Commesse, Revisioni, Riepilogo, scheda articolo, Gestione, import ed export, e i titoli di sezione di `index.html`. Il set è salito a 50 disegni (aggiunti fabbisogno, ordine, bilancia, azienda, cartella, pagamento, pausa). Anche il logo del login viene ora dallo sprite: nel repo non resta più un solo tracciato scritto a mano fuori da `icons.js`.

**Aggiunto**
- **Ogni icona dice il proprio nome al passaggio del mouse.** Un disegno è muto: chi non lo riconosce non ha modo di scoprire cosa fa se non provandolo, ed è esattamente quello che le emoji non hanno mai offerto. I nomi dicono l’azione e non il disegno — «Elimina», non «cestino» — e dentro un pulsante prendono il testo del pulsante, che è sempre più preciso: «Distinta parte e ciclo di lavorazione» invece di «Lavorazione». Accanto a una parola che già la spiega il suggerimento tace: ripetere lo stesso nome due volte è rumore, non aiuto.
- I pulsanti a sola icona che non avevano un `title` ora ce l’hanno: senza, `a11yFields` non aveva da dove prendere l’etichetta accessibile.

**Note**
- Restano emoji una trentina di simboli che **non possono** diventare icone: i messaggi del toast e i titoli delle conferme (passano da `esc()`), i `title` assegnati via JavaScript, il marchio di obsoleto dentro i `<option>`, le etichette che finiscono in PDF ed Excel, e le caselle ☑/☐ dei due interruttori del fabbisogno — da spente un’icona sparirebbe e la riga ballerebbe a ogni click.

### 0.48.1 — 2026-09-05

**Cambiato**
- Le icone nuove arrivano dove si usano di più: **albero della distinta** (espansione del nodo, dove è usato, ciclo, modifica, elimina, il ⚠ del riferimento ciclico e dell’articolo mancante), **righe delle anagrafiche** (listino, ciclo, dove è usato, modifica, duplica, elimina, i marchi obsoleto e parte acquistata) e **vista Cicli di lavorazione**. Nelle righe la tinta è nuda, senza pastiglia: un pulsante ha già il suo bordo, e la pastiglia dentro sarebbe una scatola in una scatola.
- I titoli delle schede (aggiungi componente, lavorazione, nuova macchina, listino fornitori, dove è usato, nuovo articolo…) portano l’icona in pastiglia: lì lo spazio c’è e serve a riconoscere la scheda prima di leggerne il titolo.
- Le frasi che rimandano a una voce di menu («si gestiscono nella vista Cicli di lavorazione») mostrano ora la stessa icona che si vede nella barra, invece di un’emoji che non le somigliava più.

Restano emoji: le viste Documenti, Fabbisogno, Magazzino, Gestione, Riepilogo e la scheda articolo — il giro successivo. Una resta emoji per forza: il marchio di articolo obsoleto dentro i menu a tendina, perché in un `<option>` non entra né HTML né un’icona.

### 0.48.0 — 2026-09-05

**Aggiunto**
- Un set di icone nostro (`icons.js`): 43 disegni su griglia 24×24, uno sprite SVG unico e `ico(nome)` come solo punto in cui un nome diventa un disegno. Le emoji le disegnava il font di sistema — forma diversa su ogni computer, colore proprio impossibile da cambiare, allineamento a caso; questi sono tracciati, prendono il colore del testo che li circonda e la misura in `em`.
- Ogni icona ha una **tinta di categoria** presa dalle variabili già esistenti: rosso ciò che cancella, verde ciò che produce o conferma, arancio merce e avvisi, viola lavorazioni e tempo, azzurro navigazione. Il colore è mostrato in **pastiglia**, cioè sul fondo dello stesso colore al 15%: un tratto da 1.8 su sedici pixel è poco da distinguere di sfuggita, il fondo dà alla tinta la superficie per farsi leggere.
- `icons-preview.html`, la galleria per giudicare il set: ogni icona accanto all’emoji che sostituisce, le misure da 13 a 32px, le tre varianti di colore e la barra di navigazione in posa. Non fa parte dell’app.

**Cambiato**
- Barra di navigazione, i tre pulsanti dell’header (cerca, stampa, password) e la lente delle dodici caselle di ricerca passano alle icone nuove. Logo e pulsante Esci, che erano già SVG scritti a mano dentro `index.html`, ora vengono dallo sprite come tutti gli altri.
- La lente non sta più dentro il `placeholder`: un placeholder è testo, e quell’emoji finiva nella traduzione e in ciò che leggono gli screen reader. Ora è un disegno di sfondo, che è quello che è sempre stata.
- Lo stato batte la categoria: dentro un pulsante che ha già un colore suo — la voce di menu attiva, un `.mini-btn.danger` — l’icona eredita quello. Lì il colore dice *cosa sta succedendo*, e vince su *di che si tratta*.

Le icone dentro le viste (albero distinta, schede, titoli) sono ancora emoji: `ico()` e le emoji convivono, la sostituzione prosegue a scaglioni.

### 0.47.12 — 2026-09-05

**Cambiato**
- Nei riquadri di costo l'unità di misura appesa al numero (`/pz`) va ora in piccolo, in uno `span` a parte: liberata quella larghezza, la cifra torna grande — anzi un filo più grande di prima (fino a 26px, `clamp(16px, 13cqi, 26px)`).

### 0.47.11 — 2026-09-05

**Corretto**
- I riquadri di costo (Distinta base e Costificazione) sforavano il loro contenitore: il valore era fisso a 24px e con l'unità appesa (`€8951.50/pz`) su sette riquadri in fila non ci stava. Ora il riquadro è un contenitore di query e il valore scala con la sua larghezza (`clamp(14px, 11cqi, 24px)`), restando su una riga sola; padding orizzontale ridotto a 12px e etichetta troncata con i puntini invece di allargare la card.

### 0.47.10 — 2026-08-24

**Corretto**
- Codice e descrizione fornitore erano andati a capo (0.47.9) invece di stare sulla stessa riga come prima. Ora colonna e menu fornitore sono un po' più larghi (330px) e codice/descrizione un po' più stretti (130/170px): ci stanno affiancati su una riga sola, senza sforare né lasciare vuoti.

### 0.47.9 — 2026-08-24

**Corretto**
- Il vuoto fra il menu fornitore e la colonna Prezzo: la colonna Fornitore aveva solo un `min-width`, e con `table-layout` automatico si prendeva parte dello spazio in eccesso della tabella, allargandosi ben oltre il menu al suo interno. Ora ha un `width` fisso (240px) che il browser rispetta; codice e descrizione, insieme più larghi della colonna, vanno a capo su una riga propria invece di sforare.

### 0.47.8 — 2026-08-24

**Corretto**
- Il tentativo precedente (0.47.7) aveva reso la classe `.pl-sub` — condivisa tra la riga codice/descrizione fornitore e la riga unità/costo convertito della cella Prezzo — bersaglio delle stesse regole di larghezza, nascondendo UM e costo calcolato. Codice e descrizione fornitore hanno ora una classe propria (`pl-code`, `pl-desc`), separata da quella riga: si allargano senza più toccare nulla nella cella Prezzo.

### 0.47.7 — 2026-08-24

**Corretto**
- Il menu fornitore, più stretto della riga codice+descrizione sotto di lui, lasciava vuoto a destra fino al bordo della colonna (che si allarga sul contenuto più largo). Ora codice e descrizione vanno a capo invece di stare in fila, così non sforano oltre la larghezza del menu, e il vuoto a destra sparisce.

### 0.47.6 — 2026-08-24

**Corretto**
- Il `min-width` della colonna (0.47.5) non bastava: la tabella si dimensiona sul contenuto più largo, e i campi codice/descrizione sotto sono comunque più larghi di 240px — trascinavano con sé anche il menu fornitore, che eredita `width:100%` dalla cella. Ora il menu ha un tetto proprio (220px), indipendente da quanto si allarga la colonna sotto di lui.

### 0.47.5 — 2026-08-24

**Corretto**
- Allargare i campi «codice»/«descrizione» fornitore (0.47.4) aveva allargato di riflesso anche il menu del fornitore sopra di loro, condividendo lo stesso `min-width` di colonna. Il menu fornitore torna alla larghezza di prima; i due campi sotto restano larghi.

### 0.47.4 — 2026-08-24

**Corretto**
- La correzione precedente (0.47.3) non si vedeva: avevo alzato solo il `max-width` dei campi «codice fornitore»/«descrizione fornitore», ma senza una `width` esplicita restavano fermi alla larghezza predefinita del browser — più stretta sia del limite vecchio che di quello nuovo, quindi il tetto più alto non veniva mai raggiunto. Ora hanno una `width` propria (190px e 260px) e si vedono davvero più larghi.

### 0.47.2 — 2026-08-24

**Corretto**
- Nel listino fornitori, la seconda riga di ogni quotazione (codice fornitore, descrizione, unità di quotazione) era in un carattere più piccolo (11px) di quella sopra (12px). Uniformato: stessa dimensione su entrambe le righe.

### 0.47.1 — 2026-08-24

**Corretto**
- Nel listino fornitori, il selettore dell'unità di quotazione (accanto al prezzo, quando l'articolo ha una doppia unità) era **invisibile**: si vedeva solo la freccina, senza il testo «m»/«kg». Il `<select>` ereditava `width:100%` dentro la riga flessibile che lo contiene insieme al totale convertito, e si schiacciava fino a non lasciare spazio al testo. Ora ha una larghezza propria, come gli altri campi della stessa riga.

### 0.47.0 — 2026-08-24

**Corretto**
- Le righe di **Richiesta d'offerta** e **Ordine**, quando nascono da catalogo (a mano o generate da un piano di fabbisogno), ora sono sempre nell'**unità dell'articolo** — quella con cui si ordina e si riceve davvero (mt, m², pz…) — e mai in quella con cui un fornitore valorizza il listino (es. a chilo). Il prezzo di riga è già il costo **convertito** in quell'unità, non il prezzo grezzo del listino: una barra gestita in metri ma quotata a chilo genera una riga in metri, al prezzo al metro. Prima la riga nasceva nell'unità del fornitore col prezzo grezzo, in contraddizione con quanto l'app stessa dichiarava ("U.M. seguono l'anagrafica articolo"). I documenti già emessi non cambiano.

### 0.46.0 — 2026-08-24

**Aggiunto**
- Il **lotto di riordino** ora sa se è un **multiplo esatto** (una barra da 6 m si compra a 6, 12, 18… — comportamento di sempre, resta il predefinito) oppure una **quantità minima** (es. minimo 50 pezzi, poi liberamente 51, 52…). Si sceglie nella scheda articolo, accanto al lotto. Gli articoli già configurati non cambiano comportamento: senza scelta esplicita restano a multiplo esatto.
- Le righe di **Richiesta d'offerta** e **Ordine** — anche scritte a mano — segnalano ora quando la quantità non rispetta il lotto dell'articolo (badge «↑ lotto» o «↑ minimo», nella tabella e nella modale di modifica riga). È solo un avviso: non blocca né arrotonda da sola la quantità inserita.

### 0.45.3 — 2026-08-23

**Rimosso**
- Il campo **«Consegna richiesta»** nei dati generali dell'ordine a fornitore. Era una data scritta a mano, senza nessun legame con la logica dell'app: gli avvisi di ritardo, il confronto con la conferma del fornitore e il segnale nel Riepilogo si basano tutti sulla data di consegna **di riga**, articolo per articolo — non su questa. Tenerla accanto generava equivoci: sembrava la data che comandava, e non lo era mai stata. Restano invariate la data di riga e tutto ciò che ne dipende.

### 0.45.2 — 2026-08-23

**Corretto**
- L'icona del calendario nei campi data era **nera su sfondo nero**: invisibile, perché il tema dell'app è sempre scuro e l'icona nativa del browser non lo sapeva. Ora è invertita in chiaro nei campi a schermo (torna nera in stampa, dove lo sfondo è bianco).

### 0.45.1 — 2026-08-23

**Cambiato**
- Il pulsante che apre il congelamento della distinta (o del ciclo, per le parti) ora si chiama **📌 Nuova revisione** invece di «Rilascia revisione». Il comportamento non cambia — resta il congelamento della revisione in lavorazione, col costo del giorno, e l'apertura della successiva — ma il nome vecchio suggeriva un'azione verso l'esterno (una pubblicazione, un invio), mentre qui si sta solo aprendo un nuovo capitolo di lavoro sullo stesso articolo.

### 0.45.0 — 2026-08-06

**Gli elenchi si portano via.** Si esportava un *documento* per volta — una distinta, un piano, una richiesta, un ordine — e nessuna *lista*. Chi filtrava il magazzino su «sotto la scorta minima» vedeva la risposta a schermo e non aveva modo di portarsela in officina o di allegarla a una mail. L'unico export di articoli che esisteva è il template d'import, che è un'altra cosa: tutte le colonne, tutti gli articoli, tre fogli di contorno.

**Aggiunto**
- 📗 **Esporta Excel** e 📄 **Esporta PDF** su otto elenchi: **Magazzino**, **Anagrafica Acquisti**, **Anagrafica Progetto**, **Cicli di lavorazione**, **Commesse**, **Richieste di offerta**, **Ordini** e **piani di Fabbisogno**.
- Si esporta **quello che si vede**: filtri attivi applicati, stesse colonne e stesso ordine della tabella. I filtri finiscono scritti nel file — nell'Excel su un foglio **Estrazione** (azienda, data, utente, filtri, righe), nel PDF sotto il titolo. Senza, dopo una settimana nessuno sa più cosa contenga quel foglio.
- Il PDF ha **testata azienda e numero di pagina, su ogni pagina**. Nessun PDF dell'app numerava le pagine: un elenco di trecento righe stampato e poi fatto cadere non si rimette in ordine. Orizzontale sopra le sette colonne.
- Nell'Excel **autofiltro** sull'intestazione e larghezze di colonna, come già faceva l'export del catalogo.

**Cambiato**
- Le viste che filtravano dentro il disegno ora dichiarano la selezione a parte (`stockFilteredRows`, `catalogFilteredRows`, `jobFilteredList`, `planFilteredList`): schermo ed export leggono la **stessa** funzione. Con il filtro scritto due volte, prima o poi il file esportato conterrebbe righe diverse da quelle guardate.
- La paginazione a schermo («Mostra altri 200») **non** limita l'export: difende il ridisegno, non il contenuto. Esportare 200 righe di 900 senza dirlo è il modo più silenzioso di far prendere una decisione su dati monchi.

**Non cambiato, di proposito**
- **Gli otto export che c'erano restano identici.** Distinta, fabbisogno, RFQ e ordini sono documenti già impaginati apposta, alcuni verso i fornitori: funzionano, e riscriverli per uniformarli avrebbe cambiato l'aspetto di quello che esce di qui.
- **Nessun `roleGuard`**: esportare è una lettura, ed è la regola già seguita da tutti gli export tranne quello delle impostazioni, guardato perché elenca nomi ed email degli utenti. Nessuno di questi elenchi contiene dati di utenti.

**Verifica**
- 41 nuovi controlli (suite da 948 a 989). Il grosso sta sulla **specifica** che ogni vista produce, che è la parte pura: ogni riga ha tante celle quante intestazioni, i filtri restringono davvero anche l'export, i numeri restano numeri e la valuta non entra mai in una cella.
- PDF ed Excel avevano **zero copertura** in tutta la storia dell'app. Ora un doppio finto delle due librerie registra come vengono chiamate: ha già colto un difetto che a occhio non si vedeva — con due sezioni sulla stessa pagina la testata veniva scritta due volte sopra sé stessa — e tiene fermi il numero di pagina e l'autofiltro, che si ferma prima della riga dei totali.

### 0.44.0 — 2026-08-06

**Il magazzino ha una pagina.** I numeri c'erano già tutti — esistente, in arrivo, impegnato, libero — ma si vedevano **un articolo per volta**: nella sua scheda, o dentro una riga di fabbisogno. Per rispondere a «cosa è sotto scorta?» bisognava aprire gli articoli a uno a uno, cioè non lo si chiedeva mai. Il riepilogo lo segnalava e mandava all'anagrafica, dove quel dato non compare.

**Aggiunto**
- **📦 Magazzino**, nuovo gruppo in barra e pulsante nel Riepilogo. Una lista sola per **commerciali, materie prime e parti**: il magazzino non conosce la divisione fra acquisti e progetto — sullo stesso scaffale ci sono viti comprate e parti lavorate, e chi fa l'inventario le conta nello stesso giro. Gli assiemi restano fuori: un gruppo si produce, non si stocca, e la sua giacenza sarebbe quella dei componenti contata due volte.
- Per riga: **esistente, in arrivo, impegnato, libero, scorta minima, lotto**, con il ⚠ su chi è sotto scorta e il libero in rosso quando i piani aperti hanno promesso più merce di quanta ne esista. Dalla riga si registra una **rettifica** (⚖) o si apre lo **storico dei movimenti** (🕘), col codice cliccabile e la modifica dell'articolo dove stanno in tutte le altre tabelle.
- **Filtri dell'anagrafica** (testo, tipo, famiglia, sottofamiglia) più uno di **stato**: sotto la scorta minima, giacenza a zero, con giacenza, libero negativo. In testa quattro conteggi che parlano di **tutto** il magazzino e non del filtro attivo — sono lì per dire se c'è qualcosa da guardare, e un numero che cambia col filtro non risponderebbe più a quella domanda.

**Cambiato**
- Il segnale «articoli sotto la scorta minima» del Riepilogo porta al Magazzino invece che all'anagrafica Acquisti: adesso c'è la vista dove quel numero si vede e si corregge.
- Filtri famiglia/sottofamiglia, raggruppamento per famiglia e costo unitario erano scritti dentro `renderCatalog`: sono diventati `syncFamilyFilters`, `catalogGroups` e `itemUnitCost`, usati da anagrafica e magazzino. Nessun cambio di comportamento — due copie della stessa logica si sarebbero disallineate alla prima modifica.

**Non cambiato, di proposito**
- **Nessun campo nuovo sull'articolo.** L'esistente resta *ricevuto sugli ordini + movimenti*, e l'impegnato resta calcolato dai piani aperti: la vista li mette in tabella, non li duplica. Una colonna scrivibile qui darebbe due numeri per la stessa giacenza, e un test verifica che il conteggio dei sotto scorta sia lo stesso del Riepilogo.

**Verifica**
- 15 nuovi controlli (suite da 933 a 948): chi entra nell'elenco e chi no, che il filtro «sotto scorta» selezioni **le stesse righe** che portano il ⚠ (un filtro che ne seleziona altre fa credere di aver guardato), i quattro stati, i conteggi in testa indipendenti dal filtro, e che una rettifica fatta da qui aggiorni la riga senza far cambiare pagina.

### 0.43.2 — 2026-08-03

**Corretto**
- **La protezione aggiunta nella 0.43.1 non funzionava.** In `.gitattributes` vince **l'ultima** regola che corrisponde al file, e la riga generica (`* text=auto`) era scritta sotto quella specifica su `vendor/`: la sovrascriveva senza che niente lo segnalasse, e i file di terze parti sarebbero stati normalizzati lo stesso. Trovato con `git check-attr`, che è il modo di verificarlo invece di crederci. Ordine invertito, con il perché scritto accanto alla riga.

### 0.43.1 — 2026-08-03

**Corretto**
- **Le librerie in `vendor/` restano identiche a quelle pubblicate.** Su Windows un clone le avrebbe riscritte con le fini riga native: avrebbero funzionato lo stesso, ma le impronte scritte in `vendor/LEGGIMI.md` non sarebbero più corrisposte, e una libreria di terze parti che non si può riverificare è il contrario del motivo per cui la si tiene nel repo. Un `.gitattributes` esclude quella cartella dalla normalizzazione. *(La regola era scritta nell'ordine sbagliato e non aveva effetto: vedi 0.43.2.)*

### 0.43.0 — 2026-08-03

**Le librerie di export stanno nella cartella dell'app, e SheetJS è aggiornata.** Erano su un CDN: la versione in uso aveva due vulnerabilità corrette a monte, e i pulsanti di export non funzionavano su un PC senza rete — cioè proprio dove l'app dichiara di funzionare.

**Cambiato**
- **SheetJS dalla 0.18.5 alla 0.20.3.** Le due falle (prototype pollution, corretta nella 0.19.3; ReDoS, nella 0.20.2) stavano su quello che è **input non fidato**: un file Excel arriva da un fornitore, da un cliente, da una mail. L'aggiornamento era rimandato perché SheetJS dopo la 0.18 non pubblica più su cdnjs — non era un cambio di numero e basta.
- **Anche jsPDF entra nel repo**, alla stessa versione di prima: verificata **bit per bit** confrontandone l'impronta con la firma `integrity` che stava nella pagina. Non è «dovrebbe essere la stessa»: è la stessa.
- **Niente più rete.** Copiando la cartella su un altro PC funziona tutto subito, export compresi. Prima serviva un primo caricamento con la connessione, e su una postazione d'officina scollegata i pulsanti erano muti. Non c'è più un terzo dominio da cui l'app dipenda.
- `vendor/LEGGIMI.md` dice versioni, provenienza, impronte e come si aggiornano.

**Verifica**
- 5 nuovi controlli (suite da 928 a 933) su un **file .xlsx vero**: è il buco che tutti gli altri test sull'import lasciavano aperto per scelta — lavorano su righe già lette, perché il binario non è nostro. Ora il giro completo gira nella suite: si esporta come fa l'app, si scrive il file, lo si rilegge con le stesse due chiamate di `readWorkbook()` e lo si reimporta. Accenti, virgolette e trattini lunghi tornano identici, i numeri restano numeri (se tornassero testo, un foglio con la virgola decimale entrerebbe a zero), le celle vuote restano vuote e reimportare lo stesso file non duplica niente.
- Resta da provare a mano un file prodotto **da Excel stesso**: quello nessun test può fabbricarlo.

### 0.42.0 — 2026-08-03

**L'app si usa anche senza mouse, e i campi hanno un nome.** Erano centocinquanta etichette che il browser non sapeva collegare al proprio campo, duecento pulsanti-icona senza nome e una decina di righe cliccabili invisibili alla tastiera. Niente di tutto questo si vedeva usando l'app col mouse — ed è esattamente il motivo per cui era rimasto lì.

**Cambiato**
- **Le etichette sono collegate ai campi.** Cliccare «Fornitore» mette a fuoco il menu, e un lettore di schermo annuncia il campo col suo nome invece di dire «casella di testo». Il collegamento si fa **sulla struttura**, in un punto solo (`a11yFields`): centocinquanta modifiche a mano sarebbero state centocinquanta occasioni di sbagliare un id, e i form che verranno sarebbero ripartiti da zero.
- **I pulsanti a sola icona** (✏ 🗑 🔗 🔧 ★) prendono il nome dal `title` che avevano già: quello che si legge passando il mouse è lo stesso che sente chi il mouse non lo usa.
- **Le schede sono dialoghi dichiarati**: `role="dialog"`, il titolo come nome, il **focus che entra** sul primo campo da compilare — o, nelle conferme, sul pulsante che *non* fa danni — e che **torna da dov'era** alla chiusura. Chi apre una scheda dal ✏ di una riga si ritrova su quel ✏, non a inizio pagina.
- **Le righe cliccabili sono raggiungibili col tabulatore** e rispondono a Invio e alla barra spaziatrice: i segnali del riepilogo, le commesse in elenco, i documenti generati dal fabbisogno, i risultati dei selettori articolo e le lavorazioni in distinta. È lo stesso patto che i codici articolo rispettavano già. Il triangolino che apre un ramo di distinta dice anche se il ramo è aperto o chiuso.

**Verifica**
- 9 nuovi controlli (suite da 919 a 928): il patto degli elementi cliccabili (pulsante, tabulatore, Invio e spazio con la stessa azione, etichetta escapata), le righe reali di riepilogo, commesse e albero distinta, e la garanzia che il collegamento delle etichette non possa mai far fallire un disegno.

### 0.41.0 — 2026-08-03

**Richieste d'offerta e ordini erano due copie quasi identiche: ora ogni regola è scritta una volta sola.** Sono lo stesso oggetto — una testata con un fornitore, delle righe, uno stato e un blocco che dipende dallo stato — e per molte versioni sono stati due elenchi paralleli di funzioni gemelle. Correggere qualcosa significava ricordarsi di correggerlo due volte, e le differenze vere fra i due documenti erano sparse nel codice invece di essere dichiarate.

**Cambiato**
- **Un registro dei due tipi di documento** (`DOC_KINDS`) che dice in un elenco leggibile in cosa differiscono: sulla richiesta il prezzo è la risposta attesa e resta compilabile dopo l'invio, sull'ordine è concordato e dopo l'invio arrivano invece le merci; lo stato della richiesta deriva dai prezzi, quello dell'ordine dai ricevimenti.
- **Una funzione sola per ogni regola**: guardie e blocchi, sblocco, modifica di campi e righe, riga manuale, aggiunta da catalogo, salvataggio, eliminazione, uscita dall'editor. I nomi di sempre (`rfqSetLine`, `ordSetLine`…) restano come adattatori di una riga — sono citati in centinaia di `onclick` nei template e rinominarli avrebbe aggiunto solo rischio.
- **`docPartyLines()`**: l'intestazione «chi ordina / chi riceve» che i quattro export ripetevano identica, con la partita IVA bilingue sui documenti stampati e le righe vuote che cadono da sole.

**Come funziona, e perché così**
- **Il file non si è accorciato** (1063 → 1072 righe di codice) e non era quello lo scopo: il registro documentato costa quanto le copie tolte. Il guadagno è che una modifica si fa in un punto invece che in due, e che le differenze fra i due documenti si leggono in un elenco invece di doverle cercare confrontando venti funzioni a mano.
- **La presentazione resta duplicata di proposito**: i due editor e i quattro export PDF/Excel non hanno un test, ed è esattamente il motivo per cui questo lavoro era rimandato. Si toccheranno dopo aver scritto i test, non prima.

**Verifica**
- 7 nuovi controlli (suite da 912 a 919), sopra i 29 della versione precedente che facevano da rete: il registro conosce entrambi i tipi (e un tipo inventato non fa esplodere niente), lo stesso campo è governato da blocchi diversi nei due documenti, la guardia respinge allo stesso modo su entrambi, l'intestazione salta le righe vuote ed è bilingue sui documenti stampati.
- Tutti i 29 controlli su stati, ricevimenti e blocchi passano **senza essere stati toccati**: è la prova che il comportamento non è cambiato.

### 0.40.0 — 2026-08-03

**La rete sotto i documenti.** `views-docs.js` è il file più lungo dell'app e il più duplicato, e proprio le sue tre cose più delicate — stati, ricevimenti e blocchi — non avevano un solo test. Finché è così, qualunque riordino di quel file è un salto senza rete: adesso la rete c'è, e la prossima versione può riscriverlo.

**Verifica**
- Nuovo `test/docs-state.test.js`: **29 controlli** (suite da 883 a 912). Coprono cosa deve continuare a succedere, non com'è scritto oggi.
  - **Stato derivato dell'ordine**: ricevuto in parte → Parziale, ricevuto tutto → Evaso, ricevimenti azzerati → si torna a Inviato o a Confermato secondo che la conferma del fornitore sia arrivata; non si riceve più di quanto ordinato (si tronca); «ricevi tutto» chiude in un gesto; Bozza e Annullato restano scelte di chi scrive e non si derivano mai.
  - **Stato derivato della richiesta**: tutte le righe con prezzo → Offerta ricevuta, un prezzo tolto → torna Inviata; una bozza non diventa «ricevuta» solo perché ha i prezzi, e una richiesta senza righe non è un'offerta tornata.
  - **Blocchi**: a richiesta inviata la quantità è chiusa e il prezzo aperto; a ordine inviato il prezzo è chiuso e i ricevimenti aperti; note e stato restano sempre modificabili; un documento annullato o chiuso è sola lettura; lo sblocco vale per un documento solo e si perde tornando all'elenco; il ruolo viene prima del blocco di stato.
  - **Numerazione**: progressiva per anno e per tipo, riprende dal massimo (i buchi delle eliminazioni non si riusano) e gli anni precedenti non la spostano.
  - **Richiesta → ordine**: eredita fornitore, condizioni, righe e prezzi offerti, azzera i ricevimenti, tiene la tracciabilità, nasce in bozza; la richiesta uscita si chiude da sé, una bozza no.
- Due comportamenti che i test hanno reso espliciti (erano già così, non erano scritti da nessuna parte): su un ordine già uscito **quantità e righe sono protette** — modificarle richiede lo sblocco esplicito — e la **data confermata dal fornitore** si registra a ordine inviato, perché arriva dopo l'invio per definizione.

### 0.39.0 — 2026-08-03

**Ridisegnare senza far perdere il posto, con una regola sola.** Ogni gesto nell'app riscrive per intero l'HTML della vista, e un ridisegno integrale butta via tre cose che l'utente sta usando: la posizione dello scroll, il campo a fuoco e il punto in cui stava scrivendo. Quattro viste si erano scritte da sole la stessa toppa, ognuna diversa; ora la regola sta in un punto e le quattro la usano.

**Cambiato**
- **Nuovo `renderInto(contenitore, htmlFn)`** in `core.js`: ridisegna preservando scroll, campo a fuoco (ritrovato per id), valore digitato e punto di inserimento. Se a fuoco c'è un **menu a tendina**, non ridisegna affatto e lo dice al chiamante — un elenco che si rimescola mentre lo si sta aprendo non si può "ripristinare", si può solo non rompere.
- **I quattro punti che lo facevano a mano ora passano da lì**: la lista dei documenti sotto i filtri, il corpo della finestra «Dove è usato» durante la simulazione di costo, il menu prodotti della costificazione e il filtro macchine della distinta. Comportamento uguale o migliore, un terzo del codice.

**Come funziona, e perché così**
- Il campo a fuoco si ritrova **per id**: un input senza id non è ripristinabile e il ridisegno glielo toglie, come prima. È il patto da conoscere per usare l'helper in una vista nuova.
- Il DOM finto della suite ha ora un focus coerente (`document.activeElement`, `contains`, selezione): serviva a poter verificare queste cose senza jsdom e senza dipendenze, com'è per tutto il resto.

**Verifica**
- 7 nuovi controlli (suite da 876 a 883): il ridisegno normale, il menu a fuoco che resta intatto, il campo di testo che conserva valore-focus-cursore, lo scroll che non torna in cima, il focus fuori dal contenitore che non viene toccato, più i due casi reali — la costificazione che non rimescola il menu mentre lo si usa e il filtro documenti che ridisegna la lista senza toccare la barra.

### 0.38.0 — 2026-08-03

**Prestazioni sui percorsi caldi: stessi numeri, molto meno lavoro.** Quattro punti riesplodevano distinte o rifacevano cloni dentro cicli; ora il lavoro pesante si fa una volta e si riusa. Nessun valore mostrato cambia — è la proprietà verificata dai test.

**Cambiato**
- **La home ricava le righe di fabbisogno da `commitIndex()`**, che ha già esploso tutti i piani aperti per calcolare gli impegni: prima li riesplodeva una seconda volta con `mrpBuyRows`, raddoppiando il costo della schermata mostrata a ogni accesso.
- **La simulazione di costo entra ed esce una sola volta**: con N assiemi di testa impattati faceva 2N azzeramenti delle cache globali e 2N rollup da zero — a ogni carattere digitato. Ora un solo `withTempCost` attorno a tutte le cime.
- **Lo storico revisioni fotografa la distinta attuale una volta**, non tre deep-clone e un rollup di costo per ogni revisione in elenco.
- **La scheda articolo usa un indice articolo → piani** (`planUseIndex`, stesso ciclo di vita degli altri indici) invece di riesplodere ogni piano a ogni apertura — ed è il gesto più frequente dell'app. L'indice copre anche i piani chiusi: la domanda della scheda è storica, e i piani chiusi ne fanno parte.

**Verifica**
- 2 nuovi controlli (suite da 874 a 876): la simulazione in blocco dà gli stessi costi di una chiamata per cima (e fuori dalla simulazione il costo vero torna), e la scheda articolo continua a elencare i piani chiusi in cui l'articolo compare esploso. Il benchmark (`node test/bench.js`) resta invariato: guadagno 82× sulla risalita.

### 0.37.0 — 2026-08-03

**Correttezza e guardie: quattro difetti trovati da un controllo generale del codice.** Nessuna funzionalità nuova; cambia che alcuni numeri ora sono giusti per costruzione e alcune porte che sembravano chiuse ora lo sono davvero.

**Corretto**
- **La Gestione è protetta nei mutatori, non solo nel menu.** Venti funzioni (termini di trasporto e pagamento, dati azienda, fornitori, famiglie e sottofamiglie, centri di lavoro, unità di misura) modificavano i dati senza chiedere `roleGuard('manage')`: un pannello rimasto aperto mentre il ruolo cambiava scriveva lo stesso. Ora rifiutano e lo dicono, come già facevano le funzioni sugli utenti. Anche `releaseRevision` è guardata dentro (`bom`): era globale e contava sui chiamanti.
- **La home conta il fabbisogno sempre al netto** di giacenza e impegni. Prima leggeva il toggle lordo/netto lasciato acceso nella vista Fabbisogno: due utenti sulla stessa base dati leggevano numeri diversi, e nessuno dei due se ne accorgeva. Il netto è il numero azionabile — cosa manca davvero da ordinare.
- **«Da dove viene questo costo» risolve gli articoli per id, non per codice.** Con due articoli dallo stesso codice (esistono, e la Gestione li elenca apposta) la finestra fondeva voci distinte o scartava una foglia scambiandola per l'assieme omonimo. Ora ogni articolo conta per sé; le righe di lavorazione (🔧) non compaiono più tra i contributi — stanno nelle barre di incidenza, come la finestra ha sempre dichiarato — e una parte prodotta in casa conta con le righe del suo ciclo, non due volte.
- **La scheda articolo escapa i valori per costruzione.** `itemInfoRows` era l'unico helper del repo con il contratto rovesciato («il chiamante escapa»): una voce nuova aggiunta senza pensarci diventava un'iniezione HTML silenziosa. Ora il testo si escapa dentro l'helper e i valori che sono davvero HTML lo dichiarano (`rawHtml`). Stesso principio sul banner di sblocco documenti: il gestore del click si compone da un tipo noto, non arriva più come JavaScript grezzo dal chiamante.

**Verifica**
- 11 nuovi controlli (suite da 863 a 874): i ruoli non-admin respinti dai mutatori di Gestione e l'admin che passa, il rilascio revisione negato al lettore e concesso alla progettazione, la home identica con il toggle in entrambe le posizioni (e muta quando il magazzino copre il piano), la foglia col codice di un assieme che non sparisce dal conto e i due omonimi che restano due voci.

### 0.36.1 — 2026-08-03

**Il changelog vive in un file suo.** Il README era diventato per l'80% storico delle versioni (oltre 100 KB): la parte descrittiva — avvio, funzionalità, modello di costo — era sommersa. Ora `README.md` descrive l'app e rimanda qui; questo file, `CHANGELOG.md`, tiene lo storico completo. Nessuna voce è andata persa e la convenzione non cambia: versione in cima allineata ad `APP_VERSION`, `0.MINOR.PATCH`, voci datate.

### 0.36.0 — 2026-08-03

**Nei documenti verso i fornitori si applica sempre il listino applicabile: la quotazione più recente del fornitore a cui il documento è intestato.** Prima si applicava la quotazione **in uso** — quella scelta per la costificazione — a prescindere da chi fosse l'intestatario. Un ordine a Bianchi partiva col prezzo di Rossi, nell'unità di Rossi: un numero sbagliato dall'aria giusta, che si scopre alla fattura.

**Cambiato**
- **Prezzo, unità di misura, codice e descrizione vengono tutti dalla stessa riga di listino**: la quotazione più recente di quel fornitore. Se quota a chilo, l'ordine parte in chili al suo €/kg. A parità di data vince l'ultima registrata.
- **Se quel fornitore non ha l'articolo a listino non si applica niente.** La riga nasce senza prezzo, nell'unità di gestione, e lo dice: badge **⚠ non a listino** in riga, e il toast dell'aggiunta da catalogo conta quante righe sono partite vuote e perché. Una casella vuota si vede; il prezzo di un altro no.
- **Vale per tutte e quattro le strade**: «+ Da catalogo» su ordine e su richiesta, e i documenti generati dal fabbisogno. La richiesta d'offerta continua a non portare prezzo — è la domanda, non la risposta — ma ora lo chiede nell'unità in cui quel fornitore quota.
- **Anche i giorni di consegna** seguono la stessa riga: sono termini del fornitore come il prezzo. Se a febbraio ha detto 90 giorni, pianificare sui 21 di gennaio è pianificare su termini scaduti, e la commessa slitta senza che nessuno l'abbia vista arrivare.
- **Il fornitore cambiato a documento avviato si segnala in riga.** I prezzi non si riscrivono da soli — nessun prezzo cambia da sé, in quest'app, ed è la regola su cui poggia tutto il resto — ma una riga rimasta col listino di un altro porta un **⚠** che dice quanto quota il fornitore attuale.
- **Nel fabbisogno**, quando il listino applicabile dice un prezzo diverso da quello di costificazione, il pannello di generazione lo mostra (**⇄ a listino …**) e l'anteprima dell'importo è quella che il documento porterà davvero. La costificazione non si tocca: risponde a un'altra domanda — quanto vale l'articolo nei nostri conti, non quanto ce lo fa oggi quel fornitore.

**Come funziona, e perché così**
- Una porta sola, `supplierPriceRow(it, fornitore)`, e da lì passano documenti, unità, minimi di riga, tempi di consegna e riferimenti. Il fornitore da cui si compra lo decide ancora la quotazione **in uso** — è la scelta che qualcuno ha fatto — ma il *listino* che gli si applica è il suo più recente.
- **La quotazione in uso non ha privilegio nei documenti.** Riguarda la costificazione, che è un'altra domanda; confonderle è ciò che mandava fuori il prezzo di un fornitore diverso.
- La forma «fornitore e prezzo sui campi dell'articolo, listino vuoto» è quella dei database precedenti al listino: `migrateDB()` la converte in una quotazione all'avvio, quindi un database vecchio genera ordini col prezzo giusto. C'è un test che parte proprio da lì.

**Verifica**
- 9 nuovi controlli (suite da 854 a 863) e due riscritti sulla regola nuova: il prezzo e l'unità di ciascun fornitore sul proprio documento, la quotazione più recente che vince anche su una sua più vecchia in uso, il fornitore senza listino che non eredita niente, i tempi di consegna che seguono il fornitore giusto e non l'ultima quotazione di chiunque, i tre stati del segnale quando l'intestatario cambia, e un ordine generato da un database vecchio migrato all'avvio.

### 0.35.2 — 2026-08-03

**Codice e descrizione «presso il fornitore» escono sul documento del fornitore giusto, e sono quelli aggiornati.** Non sono dati dell'articolo: sono il modo in cui *quel* fornitore lo chiama. Rossi lo chiama `ROSSI-1`, Bianchi lo chiama `BIA-9`, e la stessa riga d'ordine deve stampare l'uno o l'altro a seconda di a chi è intestata. Sbagliarli non è un dettaglio estetico: è un codice d'ordine che il fornitore prende per buono, e su cui spedisce il pezzo di qualcun altro.

**Corretto**
- **Un ordine al secondo fornitore lasciava la casella vuota** pur avendo il dato a listino. La ricerca guardava solo la quotazione **in uso**: rispondeva a «come lo chiama il fornitore da cui compro di solito?» invece che a «come lo chiama questo qui?». Ora la coincidenza si verifica dentro il listino, sulla quotazione di quel fornitore.
- **Correggere un refuso nel codice fornitore non arrivava ai documenti.** L'articolo ne tiene una copia — è il "prezzo in uso" — e si riallineava solo quando cambiava il prezzo o l'unità. Un codice corretto nel listino restava vecchio sull'ordine, e in giro c'erano due codici di cui uno sbagliato che nessuna schermata mostrava come tale.
- **Nella scheda articolo la tabella del listino mostrava il solo codice**, non la descrizione: ora entrambi, riga per riga, con l'intestazione che dice di chi sono.

**Come funziona, e perché così**
- `supplierPriceRow(it, fornitore)` è l'unica porta: cerca fra le quotazioni quella di **quel** fornitore. Se ne ha più d'una vince quella in uso; fra le altre, la più recente — è l'ultima volta che ci si è parlati.
- La regola resta quella di prima, applicata sul serio: **se il fornitore non coincide non esce niente**. Nessuna quotazione sua, nessun riferimento — meglio una casella vuota di un codice di qualcun altro. Vale anche per un documento senza fornitore e per le righe manuali.
- Codice e descrizione si leggono ora **dalla quotazione** anche nella scheda articolo e nel riepilogo prezzo: gli stessi valori di prima, ma da un posto solo. I campi `supplierCode`/`supplierDesc` restano sull'articolo (sono nello schema cloud) e continuano a seguire la quotazione in uso, ora anche quando la si corregge.

**Verifica**
- 15 nuovi controlli (suite da 839 a 854): il riferimento di ciascun fornitore sul proprio documento, il silenzio su quello di un altro, le quotazioni multiple dello stesso fornitore, la correzione che arriva fino all'ordine, e i tre casi in cui non deve uscire niente (nessun fornitore, riga manuale, articolo cancellato).

### 0.35.1 — 2026-08-03

**Ogni numero a schermo dice di cosa parla.** Le unità c'erano dove capitava: la scheda articolo scriveva la giacenza in chilogrammi ma la scorta minima nuda, il fabbisogno metteva la colonna U.M. e poi segnalava «impegnato 40» senza dire quaranta di cosa, la modale «Aggiungi componente» chiedeva una «Quantità» che poteva essere di pezzi o di metri a seconda dell'articolo che si stava per scegliere. Un numero senza unità non è ambiguo per chi lo scrive — è ambiguo per chi lo legge tre settimane dopo, o per il fornitore che riceve il PDF, e l'errore che ne segue è di un fattore, plausibile, e non se ne accorge nessuno.

**Cambiato**
- **Quantità, costi ed etichette portano l'unità.** Giacenze, impegni, movimenti, scorta minima, lotto di riordino, quantità minima del listino, righe di distinta, ciclo, confronto revisioni: dove non c'è una colonna `U.M.` accanto, l'unità sta nel numero. I costi unitari portano il denominatore (`€10.00/kg`), quelli che sono totali no.
- **Le etichette dei campi seguono l'unità che si sta scegliendo.** Nella scheda articolo «Scorta minima» diventa «Scorta minima (kg)» appena si sceglie l'U.M., e cambia se la si cambia; il «Fattore di conversione» diventa «Fattore di conversione (kg in 1 m)». Nella modale di componente l'etichetta della quantità si completa quando si sceglie l'articolo. Nelle righe di richiesta e ordine, «Quantità (m)» e «Prezzo unitario (€/m)».
- **Le intestazioni dicono la valuta.** `Prezzo unit. (€/U.M.)`, `Importo (€)`, `Costo un. (€/U.M.)` nelle tabelle di anagrafica, listino, fabbisogno, richieste e ordini.
- **Sui documenti che escono di qui** — PDF e Excel di richieste e ordini — il prezzo unitario esce con il suo denominatore, e nei fogli la valuta si dichiara in intestazione (i numeri restano numeri, sommabili).
- **Corretto: il confronto offerte scriveva «pz» su ogni riga**, letteralmente, anche per una barra quotata al chilo. Ora usa l'unità della riga d'offerta — confrontare `€/kg` con `€/m` senza dirlo è peggio che non confrontare.
- **Corretto: nella scheda articolo il prezzo d'acquisto usciva come `€12.00 €/pz`**, con il simbolo due volte.

**Come funziona, e perché così**
- Le tre forme stanno in `core.js`, una volta sola: `fmtUom(15,'m')` → `15 m`, `fmtPer(3.2,'kg')` → `€3.20/kg`, `labelUom('Scorta minima','kg')` → `Scorta minima (kg)`. Con loro è rientrata a casa anche `fmtQty`, che viveva in due copie identiche per caso in `views-mrp.js` e `views-docs.js`.
- **Un articolo senza U.M. resta un numero nudo**: niente `15 ` con lo spazio in fondo, niente `Scorta minima ()`. L'unità assente non si finge.
- **Le intestazioni dei fogli d'import non cambiano.** Sono la chiave con cui l'import riconosce le colonne (`normHeader` toglie tutto ciò che non è lettera o cifra): scriverci dentro `(€/h)` renderebbe illeggibile ogni file già in giro. L'unità si dichiara nel foglio **Istruzioni**, che è dove si guarda prima di compilare.
- Dove una colonna `U.M.` è già in tabella — righe d'ordine, fabbisogno, albero di distinta — l'unità non si ripete su ogni cella: si dice in intestazione. Ripeterla renderebbe illeggibile proprio la colonna dei numeri.

**Verifica**
- 10 nuovi controlli (suite da 829 a 839): le tre forme e il caso dell'unità vuota, la scheda articolo che porta l'unità su giacenze e costi, e il confronto offerte che non scrive più «pz».

### 0.35.0 — 2026-08-02

**Gli articoli si esportano e si importano in due file, uno per mestiere: Acquisti e Progetto.** Il foglio era uno solo per tutti e sei i tipi, con una colonna `Tipo` da indovinare e una trentina di colonne di cui la maggior parte non riguardava la tua riga. Chi compilava doveva sapere quali celle valessero per cosa; chi caricava scopriva gli errori a database già scritto. E dell'export non esisteva niente: il catalogo non si portava via, quindi non c'era nemmeno un file da cui partire.

**Cambiato**
- **Due file, la stessa divisione dell'Anagrafica.** `Acquisti` (fogli `Commerciali`, `Materie prime`) e `Progetto` (fogli `Macchine`, `Gruppi`, `Sottogruppi`, `Parti`). Sono due mestieri diversi — l'ufficio acquisti compila fornitori e prezzi, la progettazione compila sigle e appartenenze — e due file si mandano a due persone senza spiegare quali fogli non toccare.
- **Il tipo è il foglio.** Niente colonna `Tipo`, e ogni foglio ha **solo le colonne del suo tipo**: una macchina non ha più accanto le celle del listino, un commerciale non ha più quelle della codifica gerarchica.
- **Dal foglio si costruisce una macchina.** Sigla, schema di codifica, macchina e gruppo di appartenenza sono finalmente colonne: prima nessuna delle due cose era importabile, e una parte caricata da Excel restava fuori da ogni macchina e da ogni numerazione. I fogli si applicano **in ordine** — Macchine → Gruppi → Sottogruppi → Parti — così un gruppo può puntare a una macchina definita nello stesso file, e il codice si genera dallo schema di quella macchina appena creata.
- **🔍 Verifica senza importare.** Fa l'import per intero, mostra il report — creati, aggiornati, avvisi, errori con foglio e riga, e l'elenco dei codici che nascerebbero — e poi **annulla tutto**. Dal report si procede con «Importa davvero», senza rifar scegliere il file.
- **L'export è il template.** Si esporta il catalogo vero, si modifica in Excel, si ricarica. Ogni file porta un foglio **Liste** con tutti i valori ammessi (unità, fornitori, coppie famiglia/sottofamiglia, macchine e gruppi coi loro codici, concetti, approvvigionamento) e un foglio **Istruzioni**.
- **Anche da Excel un prezzo nasce nel listino.** Fornitore e prezzo creano o aggiornano una **quotazione** e la rendono quella in uso, invece di scrivere il prezzo sull'articolo come faceva l'import fino a ieri. Un articolo con più quotazioni le porta nel foglio `Listino`, e la riga articolo le lascia vuote: il giro export → import → export non perde e non duplica niente.
- **Nel file delle impostazioni le famiglie si dividono in tre fogli** — `Famiglie commerciali`, `Famiglie materie prime`, `Famiglie parti` — per la stessa ragione: l'ambito è il foglio, non una colonna da sbagliare.

**Come funziona, e perché così**
- **Menu a tendina veri non ce ne sono**, e non è una dimenticanza: la libreria Excel dell'app (edizione community) non sa scrivere le convalide dati. Il foglio `Liste` tiene gli elenchi contigui, pronti per `Dati → Convalida → Elenco → =Liste!$B$2:$B$40`, ed è il posto a cui rimandano i messaggi d'errore: «concetto "PIASTRA " non in elenco — vedi foglio Liste, colonna Concetti». Un errore che dice dove sta la risposta vale più di una tendina.
- **L'import non cancella mai niente**: né articoli né quotazioni. Una riga tolta dal foglio e un foglio compilato a metà sono indistinguibili, e la differenza la pagherebbero articoli e listini ancora referenziati. Si elimina dall'app, che sa dire se una voce è ancora in uso.
- **Colonna assente ≠ colonna vuota**: la prima lascia il campo com'era, la seconda lo svuota. Così un foglio ridotto alle due colonne che interessano non azzera indirizzi, scorte e note di tutto il catalogo. E una scorta svuotata torna «non impostata», non zero.
- **I concetti non si creano dall'import.** Fornitori, famiglie e unità di misura sì (le U.M. nuove finiscono elencate nel report: è quasi sempre un refuso), ma il concetto finisce *dentro* il nome della parte e da lì in poi è congelato — un refuso resterebbe per sempre.
- Le **regole della scheda articolo valgono anche da un foglio**: sigla macchina unica, sigla gruppo conforme allo schema della sua macchina e unica su quella macchina, codice univoco. Un gruppo senza sigla e senza codice **non nasce** con un codice inventato: si segnala.
- La **🔍 Verifica** annulla ripristinando il database e azzerando gli indici, con l'adapter di persistenza staccato: nemmeno un salvataggio dimenticato può toccare il disco. E non dichiara sincronizzato niente, che sarebbe un errore invisibile e permanente.
- I file nel **formato precedente** (foglio unico con colonna `Tipo`) si leggono ancora, e passano dallo stesso lettore: ereditano gratis la regola nuova sui prezzi. Le righe dell'altro mestiere si saltano con **un avviso**, non con cinquecento righe rosse.

**Verifica**
- 68 nuovi controlli (suite da 761 a 829), fra cui: che l'export contenga solo le colonne del tipo di ogni foglio, che il file esportato reimportato su un database vuoto ricostruisca lo stesso catalogo — listino, doppia unità e costo convertito compresi — che **reimportarlo due volte non duplichi niente**, che un gruppo trovi la macchina definita nello stesso file, che la 🔍 Verifica lasci il database **identico byte per byte** e non scriva su localStorage, e che dopo l'annullamento nessun indice punti più agli oggetti del giro annullato.

### 0.34.0 — 2026-08-02

**Le impostazioni di Gestione si portano via in un foglio Excel, una scheda per foglio.** Fornitori, famiglie, centri di lavoro, unità di misura, concetti, condizioni d'offerta, dati azienda, parametri e utenti si rifacevano a mano a ogni installazione nuova. Il backup JSON li portava tutti, ma è tutto o niente: sovrascrive anche articoli, distinte, richieste e ordini — inutilizzabile per allestire una seconda postazione senza cancellarne i dati.

**Cambiato**
- **⬇ Esporta impostazioni** in *Gestione → ⬆ Import* produce un file con **nove fogli**: `Azienda`, `Utenti`, `Fornitori`, `Condizioni offerta`, `Famiglie`, `Concetti`, `Centri di lavoro`, `Unità di misura`, `Impostazioni`, più `Istruzioni`. Contiene ciò che c'è davvero, non un esempio.
- **⬆ Carica impostazioni** rilegge lo stesso file: l'export **è** il template. Si esporta, si modifica in Excel — anche solo per aggiungere trenta fornitori in blocco — e si ricarica.
- **Report di esito** come per articoli e distinte: creati, aggiornati, invariati **per foglio**, fogli assenti dichiarati, e l'elenco delle righe rifiutate con il motivo.

**Come funziona, e perché così**
- **L'import è additivo: non cancella mai niente.** Una voce assente dal foglio non viene eliminata, perché «riga tolta apposta» e «foglio compilato a metà» sono indistinguibili — e la differenza la pagherebbero fornitori e famiglie ancora referenziati dagli articoli. Chi vuole eliminare lo fa dalla scheda di Gestione, dove l'app sa dire se la voce è ancora in uso.
- **Un foglio assente viene saltato**, non trattato come vuoto: si può caricare anche una sola scheda. Allo stesso modo, una **colonna assente** lascia il campo com'è, mentre una colonna **presente ma vuota** lo svuota — così un foglio ridotto alle due colonne che interessano non azzera indirizzi e condizioni di tutti i fornitori.
- **Le password non entrano e non escono.** Nel foglio non c'è nulla da cui ricavarle: un utente creato dall'import nasce **senza**, e non accede finché un amministratore non gliene imposta una (*Utenti → 🔑*). Le due invarianti della scheda Utenti valgono riga per riga anche qui: **deve restare almeno un amministratore attivo**, e **ruolo e stato del proprio account non si cambiano da un foglio** — un file Excel non è un buon posto da cui chiudersi fuori dall'app.
- Le **chiavi di riconoscimento** sono quelle naturali, non gli id interni: email per gli utenti, nome per fornitori e centri di lavoro, ambito + nome per le famiglie, codice per le unità di misura, il nome stesso per i concetti. Un file scritto a mano funziona quanto uno esportato.
- Il **codice di un'unità di misura non si rinomina da qui**: un codice diverso crea un'unità nuova. La rinomina resta in Gestione, che propaga il nuovo codice ad articoli e documenti — cosa che un foglio non può fare.
- I nomi dei fogli e delle colonne si riconoscono **ignorando accenti, maiuscole e punteggiatura**, con i sinonimi più probabili; i fogli sconosciuti (`Istruzioni` compreso) si ignorano in silenzio.

**Verifica**
- 37 nuovi controlli (suite da 747 a 784), fra cui: che l'export contenga tutte le schede e **nessuna traccia di hash o salt**, che il file esportato reimportato su un database vuoto ricostruisca lo stesso stato, che **reimportarlo due volte non duplichi niente**, che una colonna assente non cancelli un campo, che l'ultimo amministratore attivo non si declassi da un foglio e che i messaggi d'errore siano escapati (nel foglio ci può stare qualunque cosa).

### 0.33.0 — 2026-08-02

**Ogni codice è cliccabile, e apre la scheda completa dell'articolo.** Le informazioni c'erano tutte, ma sparse in sei posti e raggiungibili solo passando dalla vista giusta: il costo in costificazione, il prezzo nel listino, la giacenza nell'anagrafica, gli impieghi in *Dove è usato*, la composizione nell'albero, i documenti negli elenchi. Chi leggeva un codice in una lista d'acquisto o in un ordine e si chiedeva «ma questo cos'è?» doveva ricordarsi dove andare, uscire da dove stava lavorando e poi tornarci.

**Cambiato**
- **Un click su un codice — in qualunque tabella — apre la scheda 🔎.** Vale nella distinta base, nella costificazione, nel fabbisogno (righe di piano, da acquistare, da fabbricare), nelle anagrafiche, nelle righe di richieste e ordini, nel confronto offerte, in *Dove è usato*, in *Da dove viene il costo* e nella scheda di generazione documenti. Il codice si riconosce dalla sottolineatura punteggiata, e si raggiunge anche da tastiera.
- **La scheda dice tutto in una finestra**: anagrafica e codifica · acquisto, fornitore e **listino completo** (con la quotazione in uso evidenziata e la più bassa segnalata) · ripartizione del **costo** e prezzo di vendita · **magazzino** con esistente, in arrivo, impegnato e libero · **composizione** (componenti di un assieme, oppure distinta parte e ciclo) · **dove è usato**, fino alle macchine impattate · **documenti e piani** in cui l'articolo compare · **revisioni** rilasciate col costo congelato · e chi l'ha creato e aggiornato.
- **Non modifica niente**, e non è una limitazione da togliere più avanti: è la ragione per cui la si può aprire senza pensarci, in mezzo a qualunque lavoro, anche mentre un form è aperto dietro. Una scheda che non scrive non ha uno stato da salvare, non chiede conferme all'uscita e non può rovinare niente per un click di troppo. Le modifiche restano dove stanno — anagrafica, listino, distinta — dove chi le fa ci è arrivato apposta.
- **Si naviga come in un browser**: cliccare un codice *dentro* la scheda la sostituisce invece di impilare finestre, e **← Indietro** riporta da dove si veniva. Chiudendo, la strada percorsa si dimentica.

**Come funziona, e perché così**
- I codici nascono tutti da una funzione sola (`codeLink`): cambiare cosa fa un click su un codice è una modifica sola, e nessuna tabella ripete lo stile o il gesto.
- Il click **non fa scattare anche il gesto della riga** che lo contiene — nella distinta la riga si espande, nella scheda documenti la riga si spunta — perché altrimenti un click ne farebbe due, di cui uno indesiderato.
- Un codice **senza articolo a catalogo resta testo**: le righe manuali dei documenti hanno un codice che non punta a niente, e un link che non porta da nessuna parte è peggio di nessun link. Vale anche per gli articoli cancellati.
- La ricerca globale (Ctrl+K) resta com'era: lì il codice **naviga** alla vista, ed è un gesto diverso da «fammi vedere cos'è».

**Verifica**
- 26 nuovi controlli (suite da 721 a 747), fra cui: che la scheda non contenga nessun campo di inserimento su nessun tipo di articolo, che le uniche azioni siano chiudere/indietro/aprire un altro codice, che aprirla e navigarci dentro **non tocchi il database**, che navigare non impili finestre, che un codice senza articolo resti testo e che quel testo sia escapato (i codici arrivano anche dai fogli importati).

### 0.32.0 — 2026-08-02

**La giacenza che vedi non è tutta tua.** Il fabbisogno netto sottraeva esistente e in arrivo, ma non sapeva nulla degli altri piani: con 100 pezzi a magazzino e due piani aperti che ne chiedevano 80 ciascuno, **entrambi si dichiaravano coperti** — con la stessa merce. Nessuno dei due sbagliava un conto; semplicemente nessuno dei due sapeva dell'altro, e l'errore si scopriva quando il secondo andava in produzione e il materiale non c'era.

**Cambiato**
- **Colonna «Impegnato»** nella lista d'acquisto in modalità netta, fra *Esistente* e *In arrivo*, con sotto il **libero** (`esistente + in arrivo − impegnato`). Il conto diventa **lordo + scorta minima + impegnato − esistente − in arrivo**, sempre arrotondato al lotto di riordino.
- **Badge 🔒 su ogni riga contesa**, anche col netto spento: il tooltip elenca **quali piani** se la sono presa e per quanto. Un numero che toglie merce senza dire chi se l'è presa non si può contestare, e quindi neanche credere. Col netto spento l'impegno non si applica — ma si vede, perché è un fatto vero sull'articolo a prescindere da come si sta guardando la lista.
- **Il piano non fa concorrenza a sé stesso**: si conta solo ciò che hanno promesso gli *altri* piani. Sottrargli il proprio fabbisogno gli farebbe comprare tutto due volte.
- **I piani si aprono e si chiudono** (🔓/🔒, dall'elenco o dalla testata). È l'unico stato che un piano ha, ed esiste per una ragione sola: **un piano aperto impegna materiale, uno chiuso no.** Senza l'interruttore ogni piano mai creato continuerebbe a promettere merce per sempre, e dopo qualche mese nessun articolo risulterebbe più disponibile. Chiudere non cancella e non blocca niente — il piano resta leggibile ed esportabile — e i piani chiusi spariscono anche dai segnali della home, dove erano allarmi che nessuno poteva più spegnere.
- **Nella scheda articolo** compaiono i riquadri *Impegnato* e *Libero*, con l'elenco dei piani che lo impegnano; il libero **può andare sotto zero** e in quel caso è scritto in rosso: i piani aperti hanno promesso più merce di quanta ne esista, e nasconderlo non la fa comparire.
- **L'export Excel porta la colonna Impegnato** in modalità netta: il conto è cambiato, e un foglio che non lo mostra non permette più di rifarlo.

**Come funziona, e perché così**
- L'impegno è **calcolato**, come l'esistente e per la stessa ragione: si esplodono le distinte dei piani aperti e si somma. Nessun campo `impegnato` da tenere allineato a mano, nessuna prenotazione da ricordarsi di sciogliere — un piano che si chiude libera la sua merce da sé, e uno che si elimina pure.
- Nel conto l'impegnato sta **dalla parte del fabbisogno**, accanto alla scorta minima, non dalla parte del magazzino. Il numero sarebbe lo stesso; la domanda no — «quanto me ne serve» invece di «quanto ne ho».
- I piani già salvati si aprono **aperti**: sono i piani in corso di chi aggiorna, e dichiararli chiusi lascerebbe promettere due volte la stessa merce proprio nel momento del passaggio di versione.

**Verifica**
- 20 nuovi controlli (suite da 701 a 721): che due piani non si dichiarino coperti entrambi, che il secondo compri davvero quando la merce non basta per due, che un piano non impegni sé stesso, che chiudere e riaprire liberi e riprenda la quota, che l'indice si aggiorni quando cambia *l'altro* piano (altrimenti sarebbe un campo scrivibile travestito da calcolo), che il libero possa andare negativo, che il documento generato porti la quantità giusta, e che un piano salvato prima di questa versione risulti aperto.

### 0.31.0 — 2026-08-01

**Nel fabbisogno il pulsante «Genera documenti» diventa due:** *📨 Genera richieste* e *🧾 Genera ordini*.

**Cambiato**
- Il tipo di documento si sceglie **prima**, dal pulsante che si preme, e il menu a tendina dentro la scheda sparisce. Sono due gesti diversi — «chiedo quanto costa» e «compro» — e metterli in un menu li faceva sembrare la stessa cosa scelta due volte, con la scelta più impegnativa a un click di distanza da quella innocua.
- **La scheda si apre già giusta.** Con il tipo deciso, le righe finite in un documento *di quel tipo* risultano bloccate fin dall'apertura: prima bisognava cambiare il selettore per scoprire quali fossero, e l'elenco si riscriveva sotto gli occhi.
- **Ogni pulsante porta il numero di righe che restano da mettere** in quel tipo di documento — *Genera ordini (2)* — e si **spegne** quando non ne restano. Quanto lavoro c'è da fare si vede prima di aprire la scheda; e un pulsante che si può premere ma non fa niente è peggio di uno spento, perché costringe a scoprirlo aprendo.

**Verifica**
- 4 nuovi controlli (suite da 697 a 701): che ciascun pulsante conti il proprio lavoro rimasto in modo indipendente (generare un ordine non consuma la strada delle richieste), che si spenga a lavoro finito, e che il tipo generato sia quello del pulsante premuto.

### 0.30.0 — 2026-08-01

**Dallo stesso fabbisogno non si ordina due volte la stessa cosa.** Era l'errore facile: si sceglie un fornitore, si genera l'ordine, si torna indietro per il fornitore successivo — e le righe di prima sono ancora lì, spuntate, identiche. Il doppio ordine si scopriva alla consegna.

**Cambiato**
- **Gli articoli già finiti in un documento del piano sono segnalati e non si riselezionano.** Nella scheda *Genera documenti* restano visibili — sapere che c'è già è un'informazione, nasconderli no — ma in grigio, con 🔒 e il numero del documento, e la spunta disabilitata. Il gruppo del fornitore dice «tutto già documentato» quando non resta niente.
- **Nella lista del fabbisogno ogni riga mostra dove è già finita** (📄 con il numero del documento): la domanda «l'ho già ordinato?» si risponde dove si guarda per primo, senza aprire la generazione.
- Il blocco vale **per tipo di documento**, e la distinzione non è un dettaglio: chiedere un'offerta e *poi* ordinare è il flusso normale, quello che l'app accompagna dalla 0.21.0. Bloccare l'ordine perché esiste già una richiesta renderebbe impossibile proprio il percorso che si vuole incoraggiare. Si impedisce di rifare **lo stesso tipo** di documento; l'altro resta consentito, e l'articolo mostra comunque dove è già finito.

**Come funziona, e perché così**
- Il conto si fa **leggendo i documenti del piano**, non contrassegnando gli articoli: nessun campo nuovo, nessuna divergenza possibile fra ciò che è segnato e ciò che esiste davvero.
- Ne discende il comportamento giusto senza doverlo programmare: un ordine **eliminato** o **annullato** libera le sue righe da solo — quell'ordine non esiste più, e quel materiale è di nuovo da comprare. Non c'è nessun contrassegno da ricordarsi di ripulire.
- Le righe **manuali** di un documento (quelle senza articolo a catalogo) non bloccano niente: non vengono dal fabbisogno.
- Per cambiare quantità o fornitore di qualcosa di già documentato si modifica quel documento, oppure lo si elimina e si rigenera. L'app lo dice quando non resta più niente da selezionare.

**Verifica**
- 11 nuovi controlli (suite da 686 a 697), fra cui che la guardia stia **anche accanto alla scrittura** e non solo nell'interfaccia: forzando la selezione di un articolo già ordinato non nasce nessun documento, mentre le righe ancora libere presenti nella stessa selezione passano regolarmente.

### 0.29.0 — 2026-08-01

**Quattro cose che non cambiano un numero**, ma cambiano quanto costa capire cosa si sta guardando e rimediare a uno sbaglio.

**Aggiunto**
- **Riepilogo** come schermata iniziale. Si atterrava sulla distinta base, cioè su uno strumento: l'app diceva «ecco gli attrezzi», non «ecco cosa c'è da fare». Eppure i segnali li aveva già tutti — commesse oltre la data, righe di fabbisogno da ordinare subito, ordini confermati in ritardo, articoli senza prezzo, sotto scorta, codici duplicati — sparsi in cinque viste, ognuno visibile solo a chi andava a cercarlo.
  - Non calcola niente di nuovo: mette in fila quello che le altre viste già sanno, e **ogni riga porta dove si risolve**. Un riepilogo che chiede di essere letto e basta non serve a nessuno.
  - Le voci a zero **non si mostrano**: un elenco pieno di zeri rassicuranti nasconde le due righe che contano.
  - In fondo, il **risparmio possibile**: su quanti articoli il listino contiene una quotazione più bassa di quella in uso. Come sempre, non si applica niente da solo.
- **L'indirizzo segue la vista aperta.** Il tasto Indietro del browser usciva dall'app, un refresh riportava sempre alla stessa schermata, e non c'era modo di mandare a un collega il punto in cui si sta guardando. Ora Indietro/Avanti funzionano, un link porta dove deve, e ricaricando si resta dov'eravamo.
- **Cestino.** Le eliminazioni non spariscono più: restano **30 giorni** e si rimettono a posto da *Gestione → Backup*. Passata quella finestra se ne vanno da sole al caricamento successivo — il cestino non deve diventare il posto dove il database cresce senza che nessuno guardi.
  - È una collezione a parte, non un contrassegno sul record: un contrassegno obbligherebbe **ogni** lettura del database a ricordarsi di escluderlo, e chi se ne dimenticasse farebbe ricomparire un articolo cancellato dentro una distinta.
- **«↶ Annulla» nell'avviso** subito dopo un'eliminazione. È l'unico momento in cui l'undo serve davvero, perché è l'unico in cui si sa ancora cosa si è appena fatto. Andarlo a cercare nel cestino domani mattina è un'altra cosa, e infatti il cestino c'è lo stesso.
- **«🔍 Da dove viene questo costo»** nella Costificazione. I riquadri dicono *quanto* costa e le barre *di che tipo* è la spesa, ma non **chi** la fa: su una distinta a cinque livelli la risposta andava cercata a mano nella tabella esplosa. Ora si vedono i dieci articoli che pesano di più, sommati su tutta la distinta — lo stesso componente in tre rami conta una volta sola, con la somma — ciascuno con la sua quota.

**Verifica**
- 35 nuovi controlli (suite da 651 a 686). Sul cestino in particolare: che l'eliminato esca davvero da indici ed elenchi, che ripristinare due volte non duplichi, che si ripristini **quello giusto** e non l'ultimo per data (due eliminazioni nello stesso millisecondo hanno la stessa data), e che le voci scadute si svuotino da sole. Sulla spiegazione del costo: che la somma dei contributi torni al totale — se non torna, o si conta due volte o si perde qualcosa.

### 0.28.0 — 2026-08-01

**L'app impara le date.** Sapeva *cosa* serve e *quanto*, mai *per quando* — e i giorni di consegna, scritti a listino da versioni, non entravano in nessun conto: c'era scritto che il fornitore ci mette 21 giorni e nessuno se ne faceva niente.

**Aggiunto**
- **Ogni riga di piano dice quando deve essere pronta**, e la data scende lungo la distinta: se una macchina serve per il 30 settembre, i suoi componenti servono per il 30 settembre. La testata del piano propone la data alle righe nuove, che restano modificabili una per una.
  - Quando lo stesso articolo arriva da più righe con date diverse si tiene **la più vicina**: ordinare per la data più stretta copre anche le altre, il contrario no.
  - Volutamente **niente time-phasing**: nessun fabbisogno diviso per settimane. Sarebbe un altro strumento, e prometterlo a metà è peggio che non averlo.
- **«Ordinare entro»**: la data in cui serve meno i giorni di consegna del fornitore in uso. È l'unica data su cui si può ancora fare qualcosa, ed è quella su cui si misura l'urgenza — non quella in cui serve. Un materiale che serve fra 30 giorni da un fornitore che ne impiega 60 **è già in ritardo oggi**, e adesso l'app lo dice.
- **Semaforo sulle righe del fabbisogno**: ⚠ in ritardo, ⏱ da ordinare (meno di 7 giorni di margine), oppure niente. Le due date stanno in colonna accanto ai giorni di consegna.
- **La consegna richiesta finisce sulle righe dei documenti.** Era sempre vuota: chi generava un ordine dal fabbisogno doveva riscriverla a mano su ogni riga, cioè non la scriveva.
- **Data confermata dal fornitore** sulle righe d'ordine, accanto a quella richiesta, con lo scarto in giorni. La risposta del fornitore restava in una mail; ora sta sull'ordine, e in testata compare il **ritardo peggiore** — perché è quello a decidere se la commessa slitta.
- **Commesse** (nuova voce in *Documenti*). Numerate `COM-2026-001`, con cliente, riferimento cliente, stato e data di consegna. Un piano ne dichiara una, e da lì la citazione **scende su richieste e ordini**: la scheda della commessa elenca fabbisogni, richieste e ordini collegati, con ordinato / già ricevuto / ancora atteso, e si apre ciascuno con un click.
  - L'app sapeva già collegare fabbisogno → richiesta → ordine; mancava l'anello a monte, cioè **per chi** e **per quando**. Alla domanda «cosa abbiamo ordinato per la commessa 240?» si rispondeva aprendo gli ordini a uno a uno.
  - Una commessa che regge piani o documenti **non si cancella**: lascerebbe riferimenti a un numero inesistente. Le commesse chiuse spariscono dal menu di scelta ma restano visibili a chi le aveva già collegate.

**Corretto**
- **Le date d'ordine erano anticipate di un giorno.** Il calcolo partiva dalla mezzanotte *locale* e tornava in UTC: a est di Greenwich si perdeva un giorno a ogni operazione, e `addDays(data, 0)` restituiva il giorno prima. Uno sbaglio che guardando lo schermo non si nota — la data c'è, è plausibile, ed è sbagliata. Ora i conti sono in UTC: qui non esistono orari, sono date, e le date non hanno fuso. Trovato dai test alla prima esecuzione.

**Verifica**
- 40 nuovi controlli (suite da 611 a 651): aritmetica delle date (mesi, anni bisestili, valori illeggibili), propagazione lungo la distinta, lead time preso dalla quotazione **in uso** e non dalla migliore, semaforo misurato sulla data d'ordine, confronto richiesta/confermata col ritardo peggiore, e la catena commessa → piano → ordine percorsa nei due versi.

### 0.27.0 — 2026-08-01

**Si gestisce in metri, si compra a chilo.** Capita su barre, lamiere, profilati: l'articolo va in distinta e a magazzino in un'unità, ma il fornitore quota in un'altra. Fino a ieri il prezzo del listino finiva tale e quale nel costo, che risultava in €/kg mentre le quantità erano in metri: **il costo era sbagliato di un fattore, in silenzio.** È l'errore peggiore che questa app potesse fare — il numero c'era, era plausibile, ed era falso.

**Aggiunto**
- **U.M. d'acquisto e fattore di conversione** nella scheda di commerciali, materie prime e parti. Il fattore dice quante unità d'acquisto stanno in una di gestione: una barra in <span style="font-family:monospace">m</span> che pesa 5,55 kg al metro ha U.M. d'acquisto <span style="font-family:monospace">kg</span> e fattore <span style="font-family:monospace">5,55</span>.
  - Stanno **sull'articolo** perché sono fisica, non commercio: una barra pesa quel che pesa, uguale per tutti i fornitori. Duplicare il fattore su ogni quotazione vorrebbe dire poterlo sbagliare in un posto solo su cinque.
- **Ogni riga di listino dichiara la propria unità**, perché quella sì è una scelta del fornitore: due fornitori possono quotare lo stesso articolo diversamente, e accanto al prezzo si legge il costo convertito.
- **La conversione avviene in un punto solo**, dove una quotazione diventa il costo dell'articolo. Il motore di costo non sa niente di unità di misura: riceve già tutto nell'unità di gestione e continua a moltiplicare un costo per una quantità. Nessuna regola di costificazione è stata toccata.
- **Richieste e ordini nascono nell'unità del fornitore**, col suo prezzo: 20 m di barra diventano 111 kg a 1,80 €/kg. Un ordine di «20 m» a chi vende a chilo è un ordine da rifare al telefono. L'importo è lo stesso da entrambe le parti.
- **I ricevimenti tornano indietro convertiti**: il fornitore consegna 111 kg, il magazzino carica 20 m. Senza, la giacenza — e con lei il fabbisogno netto della 0.26.0 — sarebbe sbagliata di un fattore.
- **Import Excel**: colonne `UMAcquisto` e `Fattore`, con una riga d'esempio nel template. Valgono solo insieme: un'unità senza fattore non converte niente, un fattore senza unità non si applica a niente, e nel dubbio è meglio nessuna conversione che una inventata.

**Corretto**
- **Il confronto fra quotazioni ignorava le unità.** «2 €/kg» risultava più conveniente di «5 €/m» su una barra che pesa 8 kg/m, e la segnalazione di risparmio nel fabbisogno **consigliava il fornitore più caro** — errore silenzioso e per giunta a effetto opposto. Ora il confronto è sui costi convertiti.
- **Il minimo d'ordine del fornitore** è espresso nella sua unità: confrontarlo con i metri quando lui vende a chili faceva scattare l'allarme «sotto il minimo» in entrambi i versi sbagliati.

**Compatibilità**
- **Nessuna migrazione, nessun dato cambia.** Articoli senza U.M. d'acquisto e righe senza unità si comportano esattamente come prima: fattore 1, nessuna conversione. Le righe d'ordine scritte prima della 0.27.0, che non portano l'unità, valgono come unità di gestione.
- Fuori portata, dichiarato: il fornitore che quota «a barra da 6 m», cioè una terza unità di confezionamento. Il modello non lo impedisce, semplicemente non lo copre ancora.

**Verifica**
- 38 nuovi controlli (suite da 573 a 611), fra cui il giro completo del caso reale: si dichiara il peso al metro, si registra la quotazione al chilo, si verifica il costo in costificazione, si genera l'ordine, lo si riceve e si controlla che il magazzino conti metri e che il piano risulti coperto.

### 0.26.0 — 2026-08-01

**Il fabbisogno smette di essere solo lordo.** Diceva quanto serve, non quanto serve *comprare*: chi lo usava riordinava materiale che era già a magazzino o già in arrivo da un ordine mandato la settimana prima, e se ne accorgeva alla consegna.

**Aggiunto**
- **Fabbisogno netto**, dal pulsante ☐ nella lista d'acquisto. Il conto è in chiaro: **lordo + scorta minima − esistente − in arrivo**, arrotondato al lotto di riordino.
  - Il **lordo non sparisce mai**: nel netto resta in colonna, accanto a esistente e in arrivo. Vedere «servono 40, ne hai 25, ne compri 15» è tutt'altra cosa che vedere 15 e doversi fidare. Il lordo serve a capire il prodotto, il netto a capire cosa comprare — sono due domande diverse e l'app risponde a entrambe.
  - Le righe **già coperte** restano visibili, in grigio e marcate ✓, invece di sparire: che una cosa non serva comprarla è un'informazione, non un vuoto.
  - I documenti generati dal piano portano la quantità **che è stata mostrata**, e la scheda di generazione dice quale delle due sta usando.
- **Giacenze e movimenti.** Nella scheda di un articolo compaiono esistente, in arrivo e scorta minima, con **✏ Rettifica giacenza** e **🕘 Movimenti**.
  - **L'esistente non è un campo che qualcuno aggiorna: è calcolato.** È lo stesso errore già corretto una volta con i prezzi nella 0.21.0 — se lo stesso numero si può scrivere in due posti, prima o poi i due posti dicono cose diverse e non si sa a quale credere. Qui esistente = **ricevuto sugli ordini + movimenti**, e ogni pezzo ha un padrone solo: il ricevuto vive sull'ordine, dove già viveva, quindi correggere un ricevimento sbagliato corregge anche la giacenza senza doversi ricordare di farlo due volte.
  - La **rettifica d'inventario** si inserisce come quantità *contata* e viene registrata come **differenza**: lo storico deve dire cosa è cambiato, non cosa c'era.
  - Una conseguenza da conoscere: **cancellare un ordine ricevuto toglie la sua merce dal magazzino.** È coerente — quel carico esisteva perché esisteva quell'ordine — ma va saputo prima, non dopo.
- **Scorta minima** e **lotto di riordino** per articolo. La scorta minima è quanto si vuole lasciare a magazzino *dopo* aver coperto il piano; il lotto arrotonda per eccesso quello che si compra, perché mezzo lotto non lo vende nessuno. Solo su ciò che si tiene a scorta: un assieme si produce, e la sua giacenza sarebbe quella dei componenti contata due volte.
- **Export coerenti**: in modalità netta l'Excel porta anche le colonne Lordo / Esistente / In arrivo, e il PDF mette il lordo fra parentesi. Chi riceve il foglio deve poter rifare il conto senza tornare all'app.

**Verifica**
- 39 nuovi controlli (suite da 534 a 573): il conto del netto isolato dai dati intorno (compreso l'arrotondamento al lotto, che con i float sbaglia facilmente per eccesso), la provenienza dell'esistente ordine per ordine e stato per stato — una **bozza non è in arrivo**, un ordine annullato non porta niente, un evaso non è più atteso ma la sua merce resta — e la corrispondenza fra la quantità mostrata e quella che finisce nel documento.

### 0.25.0 — 2026-08-01

**Le distinte hanno una storia.** Fino a ieri modificarne una riscriveva il passato: un costo calcolato tre mesi fa non era più riproducibile, e un ordine emesso su una distinta poi cambiata non era più giustificabile — restava il documento, ma non ciò su cui era stato deciso.

**Aggiunto**
- **Rilascio di una revisione.** Nella vista Distinta (e nei Cicli, per le parti) compare la revisione in lavorazione — **Rev. A** su tutto ciò che c'è già, senza toccare i dati — con il pulsante **📌 Rilascia revisione**. Rilasciare congela la distinta com'è, **col costo di quel giorno**, e apre la successiva: la A resta consultabile e non cambia più, si continua a lavorare sulla B.
  - Il verso è deliberato. La strada ovvia sarebbe bloccare la distinta rilasciata e obbligare ad aprirne una nuova per modificarla: blocca il lavoro di tutti i giorni per un beneficio che si vede una volta ogni tanto, e chi lavora impara a evitarla. Qui **quella su cui si lavora è sempre modificabile**, e la revisione rilasciata è immutabile perché è una fotografia, non perché un lucchetto lo impedisce.
  - Al rilascio si scrive il **motivo**: è quello che si legge fra un anno per capire perché la distinta è cambiata.
  - Se dall'ultimo rilascio non è cambiato niente, l'app lo dice invece di lasciar creare una revisione identica alla precedente.
- **🕘 Storico revisioni**: l'elenco dei rilasci con data, autore, motivo e il costo di allora.
- **⇄ Confronto** fra una revisione e la distinta attuale: righe **aggiunte**, **rimosse** e **quantità cambiate** (con il valore di prima accanto a quello di adesso), più il **delta di costo**. Se la distinta non è cambiata ma il costo sì, lo dice esplicitamente — è cambiato un prezzo, non il prodotto.
  - Le righe si confrontano per articolo, sommando le quantità quando lo stesso componente compare più volte: è la domanda che ci si fa davvero guardando due revisioni («di questo, quanti ne servono adesso?»), non «la terza riga è cambiata».
- **Anche le parti**: il ciclo di lavorazione definisce il costo quanto una distinta, e congelare l'una senza l'altro lascerebbe metà storico.

**Verifica**
- 32 nuovi controlli (suite da 502 a 534). Il più importante, che da solo giustifica la funzionalità: **modificare la distinta domani non cambia la revisione di ieri** — se cambiasse, lo storico sarebbe peggio del niente, perché racconterebbe una cosa falsa con l'aria di essere autorevole. Verificato anche che cambiare un prezzo dopo il rilascio non tocca il costo registrato, e che una revisione resta leggibile quando l'articolo che citava è stato eliminato dal catalogo.
- Le revisioni sono una collezione come le altre nel registro dello schema, e sopravvivono al giro verso la forma normalizzata. La fotografia però **resta un blocco unico**: normalizzarla vorrebbe dire darle la stessa forma dei dati vivi, cioè invitare qualcuno a modificarla.

### 0.24.0 — 2026-08-01

Terza tappa verso il database condiviso: le **fondamenta della migrazione**. A schermo non cambia niente e non c'è una riga di rete — l'app resta locale e si apre ancora con un doppio click. Cambia che le domande difficili della condivisione hanno adesso una risposta scritta e verificata, presa con calma invece che di corsa a metà migrazione.

**Aggiunto**
- **Registro dello schema** (`store.js`): le nove collezioni, i loro array annidati e come ciascuno va trattato quando i dati saranno condivisi, in un posto solo. Prima quei nomi erano cablati in sei punti diversi — migrazioni, validazione, azzeramento, backup — e ogni aggiunta ne dimenticava qualcuno.
  - La decisione che porta con sé non è tecnica ma di merito: **il listino e le righe dei documenti si fondono riga per riga**, perché due colleghi che registrano una quotazione sullo stesso articolo stanno lavorando, non litigando; **distinte, lavorazioni e cicli si sostituiscono per intero**, perché metà distinta di uno e metà dell'altro è un prodotto che nessuno ha progettato.
- **Conto delle modifiche non ancora inviate** (`Store.pendingChanges()`): quali record sono nati, cambiati o spariti dall'ultimo allineamento. Serve a mandare al server solo ciò che si è toccato — mandare tutto significa cancellare il lavoro degli altri in silenzio. Guarda **lo stato, non le chiamate**: copre anche l'import massivo e le migrazioni, che nessuno si ricorderebbe di strumentare.
- **`cloud-map.js`**: traduzione fra la forma annidata locale e le tabelle del futuro database. Funzioni pure, nessuna rete, verificabili per intero senza un server.
- **Seam dell'adapter** (`Store.adapter`): dove finiscono i byte è ora un oggetto sostituibile. Nessuna vista sa dove vanno i dati, e nessuna deve saperlo.

**Cambiato**
- Le creazioni e le eliminazioni di articoli, fornitori, famiglie, centri di lavoro, utenti, piani, richieste e ordini passano da `Store.insert` / `Store.remove` invece di modificare le liste a mano. Comportamento identico; l'intenzione, però, adesso è scritta. Gli inserimenti in blocco (import massivo, generazione documenti da un piano) restano come sono di proposito: passare di lì significherebbe un salvataggio per riga, e su cinquemila righe è un'altra cosa.

**Verifica**
- 39 nuovi controlli (suite da 463 a 502), di cui il più importante è **«due client, un server»**: due copie dell'app contro un server finto, sui tre casi veri — due quotazioni sullo stesso articolo, due documenti creati nello stesso minuto, uno che cancella ciò che l'altro sta modificando. Nessuna riga di rete coinvolta.
- Il giro completo annidato → tabelle → annidato è verificato campo per campo su un database che tocca tutte le forme, e **sui dati di esempio che l'app crea da sola**.
- Due difetti trovati proprio da questi test, prima che costassero qualcosa: l'ordine degli array (senza una colonna di posizione, i componenti di una distinta e le righe di un ordine si rimescolano a ogni lettura dal server) e la differenza fra un array figlio **vuoto** e uno **assente** — che in una tabella non esiste, e che avrebbe fatto sparire il campo `components` da un assieme con la distinta svuotata, mandando in errore l'aggiunta del componente successivo.

### 0.23.0 — 2026-08-01

Seconda tappa verso il database condiviso: **l'integrità dei dati**. Sono le cose che oggi passano inosservate e che, il giorno in cui i dati stanno su un server, diventano vincoli che fanno fallire salvataggi che ieri funzionavano — su dati che nel frattempo si sono sporcati. Vanno chiuse adesso, non dopo.

**Cambiato**
- **Il codice articolo non si può più duplicare.** Non lo controllava nessuno, ma tutto ciò che cerca un articolo per codice — l'import massivo per primo — dà per scontato che sia unico e risolve **sul primo trovato, in silenzio**: reimportando un foglio, le righe di un codice doppio finivano tutte sullo stesso articolo e le altre restavano indietro senza una segnalazione. Ora salvando una scheda con un codice già in uso l'app dice **quale articolo lo occupa**.
  - La regola è precisa: si impedisce di *introdurre* un duplicato, **non** si blocca chi sta correggendo altro su un articolo che era già duplicato prima. Chi ha dati sporchi può continuare a lavorare mentre li ripulisce.
- **Importando un backup si vede cosa sta per entrare** prima di confermare: articoli, fornitori, richieste, ordini, piani e utenti del file, accanto a quello che c'è adesso. Dai numeri si riconosce al volo un backup sbagliato o vecchio di mesi.

**Aggiunto**
- **Controllo dati in *Gestione → Backup*: i codici duplicati già a catalogo.** Li elenca raggruppati, con il pulsante per aprire ciascun articolo. L'app **non li rinomina da sola**: quel codice sta su disegni e ordini già emessi, e sceglierne uno al posto tuo sarebbe peggio del problema.

**Corretto**
- **Un backup danneggiato non entra più.** La guardia controllava solo che ci fosse l'elenco articoli: un file troncato a metà — download interrotto, chiavetta estratta — o il JSON di tutt'altro programma passava, **sostituiva l'intero database**, e l'errore usciva molto dopo in una vista a caso, quando i dati veri erano già stati sovrascritti. Ora si verifica la forma di tutte le collezioni e la versione dello schema, e il messaggio dice cosa non va. Un file prodotto da una **revisione più recente dell'app** viene fermato invece di essere degradato in silenzio: le migrazioni sanno salire, non scendere.
- **Il controllo anti-ciclo copre anche la distinta parte.** Guardava solo i componenti degli assiemi e si fermava sulle parti; la vista *Cicli di lavorazione* non aveva alcun controllo. Non era sfruttabile — nella distinta parte entrano solo commerciali e materie prime, che non contengono nulla — ma era una difesa che nessuno aveva scritto, e sarebbe caduta il giorno in cui si fosse allargato quell'elenco. Un anello in distinta manda il calcolo del costo in ricorsione.
- **Un codice generato automaticamente non sovrascrive più un articolo esistente.** La generazione guarda solo i codici che seguono il proprio schema: se qualcuno ne aveva inserito a mano uno che coincideva, l'import successivo risolveva sull'articolo sbagliato. Ora la collisione viene rilevata, si assegna un codice provvisorio e lo si segnala nel report di import.

**Prestazioni**
- **Import massivo: eliminata la scansione lineare per riga.** Ogni riga cercava il proprio articolo scorrendo tutto il catalogo: un foglio da 5.000 righe su 5.000 articoli erano ~50 milioni di confronti, e il costo cresceva col quadrato. Ora c'è un indice per codice, che l'import aggiorna mano a mano che crea articoli — così anche le righe successive ritrovano ciò che le precedenti hanno appena inserito. Lo stesso indice regge il controllo di unicità, che altrimenti sarebbe costato una scansione a ogni salvataggio.

**Verifica**
- 39 nuovi controlli (suite da 424 a 463): indice per codice e sua invalidazione, raggruppamento dei duplicati, la regola del «non introdurre nuovi duplicati», rifiuto di nove forme diverse di backup danneggiato, anelli che passano per la distinta parte, e una rete sui tempi di import (400 righe su 400 articoli) che fallisce se l'indice smette di funzionare.

### 0.22.0 — 2026-08-01

Prima tappa del percorso verso il database condiviso: **niente di nuovo a schermo, si guadagna la capacità di accorgersi dei guasti**. Fuori da `store.js` non esisteva nessuna rete — un errore dentro un disegno lasciava mezza tabella e nessun messaggio — e i due file che decidono chi entra e che riscrivono il catalogo in blocco non avevano un solo test.

**Aggiunto**
- **Gli errori non previsti si vedono.** Prima un'eccezione dentro il disegno di una vista lasciava la pagina a metà in silenzio: l'app sembrava ferma e non c'era modo di sapere cos'era successo, né di raccontarlo a chi doveva ripararla. Ora compare un avviso che dice chiaramente **che quello a schermo può essere incompleto e che i dati salvati non sono stati toccati**, con il pulsante per ricaricare. La finestra si mostra una volta sola, poi restano il messaggio breve e il registro.
- **Registro errori scaricabile**, in *Gestione → Backup*: gli ultimi 20 errori della sessione con data, vista aperta e revisione dell'app. Si azzera ricaricando la pagina, quindi va scaricato prima di ricaricare.
- **La sessione salvata può scadere.** «Ricordami su questo PC» valeva per sempre: su una postazione condivisa in officina restava aperta sull'utente di chi l'aveva usata mesi prima. Nuova impostazione **Durata della sessione salvata**, in *Gestione → Impostazioni*, **30 giorni** di serie; **0 = non scade mai**, come si comportava fino alla 0.21.0.
- **Verifica automatica a ogni modifica** (GitHub Actions): la suite gira da sola su ogni push, invece di dipendere dal ricordarsi di lanciarla.

**Sicurezza**
- **Le tre librerie caricate da CDN ora sono verificate** (`integrity`/SRI): il browser controlla l'impronta del file e lo rifiuta se non corrisponde. Un CDN compromesso non può più iniettare codice in un'app che maneggia listini e ordini. Cambiando versione di una libreria va rigenerato anche l'hash, altrimenti non si carica — e l'app lo dice, invece di tacere.
- Tolto `unescape()`, deprecato, dal calcolo dell'hash delle password. **Gli hash restano identici**: nessuno deve rifare la propria password.

**Corretto**
- **Il template di import Articoli proponeva una dicitura che l'import stesso rifiutava.** La riga di esempio scaricabile dice *Componente commerciale*, ma erano ammessi solo *Commerciale*, *Commerciali* e *Comm*: chi compilava il template partendo dall'esempio si vedeva rifiutare le righe senza capire perché. Ora sono accettate entrambe, insieme al plurale *Materie prime*.

**Verifica**
- **80 nuovi test** su import Excel e accesso — i due file che ne erano completamente privi. La suite passa da 340 a 424 controlli. Coperti: risoluzione dei tipi e delle colonne del foglio, upsert per codice e sua idempotenza, creazione al volo di fornitori e famiglie, rifiuto delle righe che romperebbero la distinta (tipo non ammesso, padre o figlio inesistenti, anelli); hash e salt delle password, primo amministratore, messaggio unico per email inesistente e password errata, scadenza e recupero della sessione, matrice dei ruoli.

### 0.21.0 — 2026-07-31

**Cambiato**
- **Il calcolo del costo di una parte non è più una scelta a parte.** C'erano due interruttori che rispondevano alla stessa domanda per metà: il *modo di calcolo* nella vista Cicli (solo costo unitario / solo ciclo / la somma dei due) e, da questa versione, l'*approvvigionamento* nella scheda articolo. Potevano contraddirsi — comprare la parte da un terzista ma continuare a costificarla dal ciclo interno — e tenerli d'accordo era un lavoro a mano. Ora la domanda è una sola: **la parte la facciamo o la compriamo?**
  - **Produzione interna** → il costo lo determinano distinta parte e ciclo di lavorazione (se sono vuoti, vale il prezzo a listino).
  - **Acquisto da fornitore** → il costo è il prezzo scelto nel listino, e la distinta non si esplode nel fabbisogno.
  - Il selettore *Calcolo del costo della parte* sparisce dalla vista Cicli, che al suo posto **dice da dove viene il costo** e rimanda alla scheda articolo. Distinta e ciclo di una parte acquistata restano salvati e consultabili.
- **Fornitore e prezzo d'acquisto escono dalla scheda articolo.** Prima lo stesso dato si poteva scrivere in due posti — nella scheda e nel listino — e un prezzo corretto a mano nella scheda spariva senza lasciare traccia: lo storico aveva buchi proprio dove serviva. Ora c'è **una porta sola, il listino 💶**. La scheda mostra prezzo, fornitore, codice e descrizione presso il fornitore **in sola lettura**, con un pulsante che apre il listino; creando un articolo che si compra, il listino si apre da solo. Un prezzo senza fornitore resta possibile: è una quotazione con il fornitore vuoto, marcata *a mano*.
- **Nel listino si può scrivere anche la descrizione presso il fornitore**, accanto al codice: è il campo che prima stava nella scheda articolo. Ora vive dove sta il resto della quotazione, e cambia insieme al fornitore invece di restare quello dell'ultimo.
- **Il costo unitario di una materia prima o di una parte si imposta dal listino**, come il prezzo di un commerciale. Un articolo già esistente col suo costo se lo ritrova come prima quotazione, senza perdere niente.

**Aggiunto**
- **Le parti hanno il listino, come i commerciali.** Molte si comprano già lavorate da terzi: adesso si possono registrare più fornitori, confrontare le quotazioni e tenerne lo storico, **senza toccare i cicli di lavorazione**, che restano come sono. Su una parte prodotta in casa, scegliere una quotazione **chiede prima di segnarla come acquistata**: il costo non si sposta mai di nascosto.
- **Ogni parte dichiara se si produce o si compra.** Nuovo campo *Approvvigionamento* nella scheda parte. Con *Acquisto da fornitore* la parte finisce nel **fabbisogno fra le cose da acquistare**, col suo fornitore, e la sua distinta non viene esplosa — quel materiale e quelle lavorazioni li mette il fornitore. Il ciclo resta salvato: serve a confrontare quanto costerebbe farla in casa. In elenco la parte acquistata si riconosce dal segno 🛒.
  - Le parti **nuove nascono da acquisto**; il valore proposto si cambia in *Gestione → Impostazioni*. Le parti **già a catalogo non si toccano**, così nessun fabbisogno già calcolato si muove da solo.
- **Dal fabbisogno si generano richieste di offerta e ordini.** Il piano sapeva già cosa comprare e da chi, ma la lista si riscriveva a mano nei documenti. Il pulsante **📄 Genera documenti** apre una scheda con le righe raggruppate per fornitore: si spuntano fornitori e singole righe, si sceglie *richiesta* o *ordine*, e nasce **un documento per fornitore**. Le righe senza fornitore fanno gruppo a sé, «Da assegnare».
  - Le **richieste nascono senza prezzo** — è quello che si sta chiedendo. Gli **ordini portano il prezzo in uso** nella costificazione.
  - Prima di generare si vedono i problemi: righe **senza prezzo** e quantità **sotto il minimo** del fornitore sono segnalate nella scheda, non dopo aver mandato l'ordine.
  - Il legame resta scritto: il piano elenca i documenti che ha generato, e ogni documento dice da quale fabbisogno viene. Un ordine generato da una richiesta nata da un piano conserva la catena intera.
- **Filtri nella distinta base.** La vista aveva solo un menu a tendina, inservibile oltre il centinaio di assiemi. Ora una barra filtra per **testo**, **livello** (macchine / gruppi / sottogruppi) e **macchina di appartenenza**, con il conteggio «N di M». La distinta aperta resta sempre nel menu anche se il filtro la escluderebbe: restringere la ricerca non chiude più l'albero sotto le mani.

**Corretto**
- **La finestra *Dove è usato* era lentissima sui cataloghi grandi**: per ogni articolo ricontrollava l'intero catalogo, e la simulazione del costo lo rifaceva a ogni riga. Ora la risalita usa un indice: sul banco di prova (700 articoli) è passata da **8 secondi a un decimo di secondo**. Stesso trattamento per fornitori e centri di lavoro, cercati fin qui uno per uno a ogni riga disegnata.
- **Un fornitore si poteva cancellare anche se citato solo nei listini, nei cicli o nei documenti**, lasciando uno storico prezzi che puntava nel vuoto. Ora l'app controlla tutti i posti e dice esattamente dove è ancora usato.
- **Gli export PDF ed Excel morivano in silenzio senza connessione.** Le librerie arrivano da internet al primo caricamento: senza, il pulsante sembrava semplicemente non funzionare. Ora compare un messaggio che spiega cosa manca. Stessa cosa per un file d'importazione illeggibile.
- Nell'albero della distinta e in *Dove è usato*, una riga di ciclo salvata **senza tipo esplicito** ora conta come articolo, come già faceva il motore di costo: le due letture non possono più divergere.

**Per chi aggiorna**
- Non serve fare nulla: i dati esistenti si adeguano da soli al primo avvio. Costi e prezzi già inseriti diventano la prima quotazione a listino e restano quelli in uso nella costificazione.
- Il vecchio modo di calcolo di ogni parte diventa il suo approvvigionamento, **conservando insieme il costo e il comportamento nel fabbisogno**:

  | Modo di calcolo (prima) | Approvvigionamento (ora) | Cosa cambia |
  |---|---|---|
  | Solo costo unitario | 🛒 Acquisto da fornitore | nulla: costava già il campo manuale e la distinta non si esplodeva |
  | Solo valore ciclo | 🏭 Produzione interna | nulla |
  | Costo unitario + valore ciclo | 🏭 Produzione interna | **il costo scende**: resta il valore del ciclo, si perde la quota manuale che ci si sommava |

  L'ultima riga è l'unico caso in cui un numero si muove. Se avevi parti impostate sulla somma, controllale: ora il ciclo è il costo del farle, e quello che prima era la quota aggiuntiva va portato in una riga di ciclo, oppure la parte va segnata come acquistata.
- Le parti **già a catalogo mantengono il comportamento di prima**: solo le nuove nascono da acquisto.

### 0.20.0 — 2026-07-30

**Aggiunto**
- **Ogni riga della distinta ha il suo numero di posizione**: `1`, `1.1`, `1.1.1`, `1.2`, `2`… Prima il livello si leggeva solo dal rientro, e su una distinta profonda — o peggio, su un foglio stampato — non si riusciva a citare una riga né a capire da chi dipendesse. Ora si dice «guarda la 1.2.1» e si guarda tutti la stessa cosa.
  - La numerazione **riparte da 1 sotto ogni padre**, senza limite di profondità. La macchina in testa all'albero resta senza numero: i suoi componenti sono `1`, `2`, `3`…
  - Quando si apre una **parte**, gli articoli della sua distinta parte continuano la numerazione del padre (`2.1`, `2.2`…); con il calcolo «costo unitario + ciclo» la quota manuale chiude la serie. Le **fasi di lavorazione 🔧 restano senza numero** — sono operazioni, non pezzi da citare in distinta — e non consumano una posizione: la serie degli articoli prosegue senza buchi anche quando una fase sta in mezzo.
  - Lo stesso numero compare **ovunque**: nell'albero di *Gestione DB*, nella colonna **Pos.** della distinta esplosa in *Visualizza DB*, negli **export Excel e PDF** (dove diventa la prima colonna, accanto al Livello già presente) e in stampa. Una riga si chiama allo stesso modo in ufficio tecnico e dal fornitore.

**Cambiato**
- Nella distinta esplosa di *Visualizza DB* il **rientro dei livelli è passato dalla descrizione al codice** — a video, in Excel e in PDF. I codici disegnano l'albero, le descrizioni ripartono tutte dallo stesso margine e si leggono in colonna invece che a scalini.

### 0.19.0 — 2026-07-29

**Cambiato**
- **La barra dei comandi passa da nove pulsanti a cinque gruppi.** Le voci del gruppo aperto compaiono su una **seconda riga** sotto l'intestazione, sempre visibili: si cambia vista con un clic solo, senza menu da aprire e chiudere.

  | Gruppo | Contiene |
  |---|---|
  | 📇 Anagrafica | Acquisti · Progetto |
  | 🔧 Cicli di lavorazione | — |
  | 🌳 Distinta base | **Gestione DB** (la distinta di prima) · **Visualizza DB** (la costificazione di prima) |
  | 📨 Documenti | Fabbisogno · Richieste offerta · Ordini |
  | ⚙ Gestione | — |

- **Dov'è finita la Costificazione**: in *Distinta base → Visualizza DB*. Le *Distinte base* sono *Distinta base → Gestione DB*. Nessuna vista è cambiata dentro: è cambiato solo come ci si arriva.
- Ogni gruppo **ricorda l'ultima voce usata**: se stavi sugli Ordini e passi in Anagrafica, tornando su Documenti ritrovi gli Ordini. Vale per la sessione, non si salva.
- I gruppi con una voce sola (Cicli, Gestione) non mostrano la seconda riga, e l'intestazione stampata ora dice da dove viene il foglio (*Distinta base › Visualizza DB*).

### 0.18.1 — 2026-07-29

**Cambiato**
- Il codice dell'app, arrivato a 5.400 righe in un file solo, è stato **diviso in undici file** per area (motore di costo, distinte, anagrafiche, documenti, gestione, import/export…). Nell'app non cambia nulla: nessuna funzione è stata riscritta, le righe sono solo state spostate, e le 261 verifiche automatiche passano invariate.
- **Se copi l'app su un altro PC**, copia l'intera cartella: ora `index.html` carica più file, non più solo `app.js`. Non serve installare nulla, si apre sempre con un doppio click.

### 0.18.0 — 2026-07-29

**Aggiunto**
- **🔎 Cerca ovunque, con Ctrl+K** (o il pulsante nell'intestazione): un campo solo che cerca tra **articoli, richieste, ordini e piani**. Si scorre con ↑ ↓ e si apre con Invio; ogni risultato porta dove ha senso guardarlo — un assieme nella sua distinta, un articolo nella sua scheda, un documento nel suo editor. Chi sta scrivendo un codice se lo ritrova in cima all'elenco.
- **🖨 Stampa della vista aperta** dal pulsante nell'intestazione o con il **Ctrl+P** del browser: esce quello che si sta guardando, senza barra di navigazione, filtri e pulsanti, con intestazione (azienda, sezione, documento aperto, data e chi ha stampato) e righe che non si spezzano tra due fogli.
- **Chi ha modificato cosa**: in fondo alla scheda articolo e agli editor di richieste, ordini e piani compare *Creato da … il … · aggiornato da … il …*. Il dato era registrato da sempre, ma non si era mai potuto vedere.

**Cambiato**
- **Le conferme non sono più finestre del browser.** «Eliminare questo componente?» e le altre venti domande sono ora schede dell'app, con un titolo che dice di cosa si tratta e un pulsante che dice cosa succede (*Elimina*, *Sblocca*, *Importa e sovrascrivi*) invece di un OK generico.
- L'**azzeramento totale** mostra cosa sta per cancellare (quanti articoli, documenti e piani, quanti MB), offre il pulsante per esportare subito un backup e chiede di scrivere **AZZERA** nella scheda stessa.

### 0.17.0 — 2026-07-29

**Aggiunto**
- **📋 Fabbisogno materiali** — nuova voce di menu. Si crea un **piano di produzione** (3 × una macchina, 2 × un'altra) e l'app esplode le distinte fino alle foglie, sommando lo stesso articolo ovunque compaia: ne esce la **lista di ciò che serve comprare**, con quantità totale, fornitore, prezzo in uso e importo. Prima l'unico modo era aprire le distinte e sommare a mano, sapendo che lo stesso cuscinetto sta in tre gruppi diversi.
- **Raggruppa per fornitore** — la lista si riordina per fornitore con il subtotale di ciascuno: è la forma in cui si passa a chiedere i prezzi.
- **🏭 Da fabbricare** — elenco a parte delle parti richieste dal piano, con quantità, costo unitario e importo: quello che va in officina.
- **Segnalazione del risparmio** — dove a listino esiste una quotazione più bassa di quella in uso, la riga mostra ↓ con la differenza sulla quantità di piano, e in cima si legge quanto scenderebbe il totale. Nessun prezzo cambia da sé: si sceglie sempre dal listino dell'articolo.
- Avviso ⚠ quando la quantità richiesta è **sotto la quantità minima** del fornitore.
- **Export Excel** (due fogli, Acquisti e Produzione) e **PDF** del fabbisogno.
- I piani si **salvano**, si riaprono e si **duplicano** (📋): rifare il piano del mese prima è un click.

**Come si comporta**

Il fabbisogno usa le stesse regole della costificazione: lo scarto entra nelle quantità, e distinta parte e ciclo di una parte si esplodono solo quando concorrono al costo (col calcolo *solo costo unitario* restano documentali). Su un riferimento ciclico si ferma e lo segnala, invece di dare numeri troncati per buoni.

### 0.16.0 — 2026-07-29

**Aggiunto**
- **🔧 Cicli di lavorazione** — nuova voce di menu, dedicata alle parti. In alto si sceglie la parte, filtrando per **famiglia**, **sottofamiglia** e testo; sotto ci sono due elenchi distinti: la **distinta parte** (le materie prime e i commerciali che servono) e il **ciclo di lavorazione** (le fasi). Prima erano un elenco solo, dentro una scatoletta in fondo alla scheda articolo, e per passare da una parte all'altra bisognava chiudere e riaprire la scheda.
- **Riordino delle lavorazioni** con le frecce **↑ ↓** e numerazione di **fase 10, 20, 30…** ricalcolata dall'ordine. L'ordine è documentale: spostare una fase non cambia di un centesimo il costo della parte.
- Pulsante **🔧** sulle parti, nel catalogo *Progetto* e nell'albero delle distinte: apre direttamente la parte nella nuova vista.
- Il riepilogo in cima separa **quanto pesa la distinta parte** e **quanto pesano le lavorazioni**, oltre al costo della parte.

**Cambiato**
- La scheda articolo di una parte non contiene più l'editor del ciclo: al suo posto c'è il riassunto del contenuto e il pulsante per aprire la vista. Anche la scelta del **calcolo del costo della parte** si è spostata lì, accanto a ciò che governa.
- Nella nuova vista **ogni modifica si salva subito**, come nelle Distinte base: non c'è più un *Salva* dell'articolo da ricordarsi di premere perché il ciclo non vada perso.
- Nulla da rifare sui dati esistenti: distinta e ciclo restano la stessa cosa di prima, solo mostrata in due elenchi. Duplicando una parte (📋) la copia si porta dietro entrambi.

### 0.15.0 — 2026-07-28

**Aggiunto**
- **Schede mobili al posto delle finestre modali** — le schede non oscurano più la pagina. Si **trascinano per il titolo**, si **ridimensionano** dall'angolo in basso a destra e si chiudono con la **✕**, con *Chiudi/Annulla* o con **Esc**. Sotto, la pagina resta pienamente utilizzabile: si può tenere aperto il **listino di un articolo** mentre si sfoglia una distinta, o affiancare *Dove è usato* a un form.
- Più schede aperte insieme, una per tipo: listino, *Dove è usato*, avviso di salvataggio e form convivono. Riaprire lo **stesso** tipo di scheda riusa la finestra invece di duplicarla — lo stato di una scheda è uno solo, due listini affiancati finirebbero per scriversi addosso.
- Con un form già aperto, aprirne un altro chiede **conferma** prima di perdere le modifiche non salvate: senza il velo scuro davanti, un click su un'altra riga non deve buttare via il lavoro fatto.

Su schermi stretti (sotto 640 px) le schede occupano la pagina come prima, senza trascinamento.

### 0.14.1 — 2026-07-28

**Cambiato**
- **Listino fornitori più compatto** — la riga di una quotazione era lunga nove colonne e usciva dalla finestra. Ora i numeri stanno in colonne strette (i giorni di consegna nella colonna *GG*, quattro cifre al massimo) e **codice fornitore** e **origine** scendono sotto al nome del fornitore, su una seconda riga: stessi campi, metà larghezza.
- I giorni di consegna vengono riportati a 9999 se si digita un valore più lungo.

### 0.14.0 — 2026-07-27

**Aggiunto**
- **💶 Listino fornitori e storico prezzi** — nuovo pulsante su commerciali e materie prime. Lo stesso articolo può ora avere **più quotazioni**, ognuna con fornitore, prezzo, quantità minima, giorni di consegna, codice fornitore e data. La quotazione **più bassa** è marcata con ↓, quella **in uso** con ✓.
- **Registrazione dei prezzi dalle richieste di offerta** — nell'editor di una richiesta, il pulsante *💶 Registra a listino* trasforma i prezzi tornati con l'offerta in quotazioni degli articoli, con data e numero della richiesta di provenienza. Una riga già registrata non viene duplicata: richieste successive allo stesso fornitore costruiscono lo **storico**.
- Le anagrafiche segnalano quanti prezzi ha un articolo (es. *3 quotazioni*) nella colonna Dettaglio.

**Come si comporta**

Il listino è **memoria, non un secondo calcolo**: il prezzo che entra nella costificazione resta quello nei campi dell'articolo. Registrare un'offerta **non cambia il costo** — un prezzo si mette in uso solo premendo *✓ Usa* sulla quotazione scelta, e solo allora il costo delle macchine si aggiorna. Così un'offerta ricevuta non sposta i preventivi già fatti senza che nessuno l'abbia deciso.

Chi aveva già un fornitore sull'articolo lo ritrova come prima voce di listino, marcata in uso: nulla da rifare a mano.

### 0.13.0 — 2026-07-27

**Aggiunto**
- **🔗 Dove è usato** — nuovo pulsante su ogni riga delle anagrafiche e dell'albero di distinta. Apre una finestra che risale la distinta invece di scenderla: mostra gli **impieghi diretti** (chi contiene l'articolo, con la quantità) e le **macchine impattate**, con la quantità complessiva necessaria per una macchina, il costo attuale e il prezzo di vendita. Da ogni riga si può risalire ancora, di livello in livello.
- **Simulazione del costo (what-if)** — nella stessa finestra, per materie prime, commerciali e parti a costo manuale, un campo *"Simula un costo diverso"*: digitando un prezzo compaiono due colonne con il **costo simulato** di ogni macchina e la **differenza** rispetto a oggi (in rosso se sale, in verde se scende). Il valore **non viene salvato**: serve solo a rispondere a "se il fornitore aumenta del 10%, quanto mi costa la macchina?".
- Quando si prova a eliminare un articolo ancora in uso, ora si apre direttamente il *Dove è usato* invece di elencare i codici in un messaggio.

### 0.12.0 — 2026-07-27

**Migliorato**
- **Le anagrafiche non si impastano più durante la digitazione.** I campi di ricerca (cataloghi, elenchi di richieste e ordini, finestre di selezione articolo) aspettano una breve pausa prima di ridisegnare, invece di rifare tutto a ogni carattere.
- **Il catalogo si disegna a blocchi di 200 articoli**, con i pulsanti *Mostra altri* e *Mostra tutti* in fondo. Il titolo di ogni gruppo indica sempre quanti articoli contiene per intero (es. `Riduttori (200 di 340)`), e il limite riparte da capo a ogni cambio di filtro. Con poche centinaia di articoli non cambia nulla; con qualche migliaio evita al browser di impaginare l'intero elenco a ogni battuta.
- **Ricerca nei documenti più rapida**: il testo cercabile di ogni richiesta e ordine — righe comprese — viene ricostruito solo quando il documento cambia davvero, non a ogni carattere digitato.
- L'**orologio** dell'intestazione si aggiorna al cambio di minuto invece che ogni secondo.

### 0.11.0 — 2026-07-27

**Aggiunto**
- **Indicatore "Modifiche non salvate"** nell'header: compare quando il browser rifiuta di salvare e resta lì finché il salvataggio non riesce di nuovo. Prima l'app continuava a mostrare i dati aggiornati senza conservarli, avvisando con un messaggio che spariva dopo due secondi e mezzo: chiudendo la scheda si perdeva tutto il lavoro fatto da quel momento.
- Quando il salvataggio fallisce compare una **finestra che spiega il motivo** — spazio esaurito, navigazione privata, dati non salvabili — con il pulsante per **esportare subito un backup JSON**, che funziona anche a spazio pieno perché lavora sui dati in memoria.
- **Spazio occupato dal database** in *Gestione → 💾 Backup*, con avviso in rosso oltre i 4 MB: il limite del browser è circa 5 MB e ora lo si vede arrivare.
- **Suite di test** (`node test/run.js`, 105 verifiche) su motore di costificazione, migrazioni e salvataggio. Nessuna dipendenza da installare.

**Migliorato**
- **Costificazione molto più veloce** su distinte profonde con componenti riusati: i sotto-assiemi già calcolati non vengono più ricalcolati da capo, e la ricerca degli articoli non scorre più tutto l'elenco. Su una distinta di prova con 700 articoli e 5 livelli, disegnare il catalogo passa da circa 163 ms a 2 ms.

**Corretto**
- **Valori negativi e non numerici** nei campi numerici. Costi, prezzi, quantità, ore e tariffe negativi ora **fermano il salvataggio con un messaggio** invece di finire nei calcoli; scarto (0–100%), spese generali e margine (0–1000%) vengono riportati dentro l'intervallo.
- Nella registrazione dei ricevimenti **non si può più ricevere più di quanto ordinato**: prima l'ordine passava a "evaso" con numeri incoerenti.
- Un **riferimento ciclico nel ciclo di lavorazione di una parte** ora viene rilevato. Non è costruibile dall'interfaccia, ma poteva arrivare da un import Excel o da un backup, e produceva un costo troncato presentato come valido.
- Le **famiglie predefinite** di materie prime e parti nascevano senza sigla al primo caricamento, e la codifica automatica per famiglia (`MAT-ACC-LAM-001`) la usa subito: la sigla arrivava solo al riavvio successivo.

### 0.10.0 — 2026-07-24

**Aggiunto**
- **Flag Obsoleto** su commerciali, materie prime e parti: marca un articolo come non più utilizzabile. Nel catalogo l'articolo obsoleto è attenuato e mostra il simbolo **⛔**.
- I flag **Preferito ★** (solo commerciali e materie prime) e **Obsoleto** si impostano ora direttamente nella **scheda articolo** (in fondo, sopra le note). La stella ★ resta anche nell'elenco Acquisti come scorciatoia.
- I badge **★** e **⛔** compaiono in **ogni selezione** dell'articolo: picker dei componenti di distinta, ciclo di lavorazione, duplicazione, "Aggiungi da catalogo" di richieste e ordini, e menu a tendina (con prefisso ★/⛔).

### 0.9.0 — 2026-07-24

**Aggiunto**
- **Concetto nel nome delle parti** — il nome di un articolo di tipo **parte** si compone ora di un **concetto** in **maiuscolo** scelto da un elenco gestito (*Gestione → 🏷 Concetti*, es. `ALBERO`, `FLANGIA`, `STAFFA`) più una **descrizione libera**: concetto `ALBERO` + `motore 20×100` → nome `ALBERO motore 20×100`. Il concetto è **obbligatorio** per le parti; gli altri tipi mantengono il campo Nome libero. Nella modale è mostrata l'anteprima del nome composto.
- Nuovo pannello *Gestione → 🏷 Concetti* (elenco con conteggio utilizzi, aggiunta, modifica ed eliminazione): un concetto **in uso non può essere rinominato né eliminato**, così i nomi delle parti già composte restano stabili. Un set di concetti meccanici tipici è precaricato.
- Le parti create prima della funzione conservano il vecchio nome come descrizione libera: basta scegliere il concetto in modifica per completarle. Il nome resta il campo mostrato ovunque (cataloghi, distinte, costificazione, PDF/Excel), quindi nessuna regressione sui documenti esistenti.

### 0.8.1 — 2026-07-22

- **Barra superiore alleggerita**: via il pulsante Backup (resta in *Gestione → 💾 Backup*), cambio password 🔑 e uscita ridotti a icone. A sinistra della pill utente **data per esteso sopra e ora sotto** (ore e minuti).
- La barra resta sempre **su una riga sola**: al restringersi della finestra cede nell'ordine il ruolo nella pill, le etichette del menu (che diventa a sole icone, con la vista attiva evidenziata) e solo per ultima la data.

### 0.8.0 — 2026-07-22

**Aggiunto**
- **Utenti, accesso e ruoli** — schermata di accesso con email e password (al primo avvio crea l'amministratore, senza credenziali predefinite), sessione con "Ricordami", cambio password e pill utente nell'header. Nuovo pannello *Gestione → 👥 Utenti* con creazione, modifica, sospensione, reset password ed eliminazione, e l'invariante dell'ultimo amministratore attivo.
- **Quattro ruoli** — Amministratore, Ufficio acquisti, Progettazione, Lettore — che limitano la scrittura per area (articoli, distinte, documenti, gestione), con banner di sola lettura nelle sezioni non modificabili. Vedi [Utenti e ruoli](#utenti-e-ruoli), **avvertenza sui limiti inclusa**.
- **Tracciabilità** `createdBy`/`updatedBy` su ogni record, popolata dall'utente della sessione (nessuna UI: serve alla migrazione).
- Struttura pensata per **Supabase**: nomi e flusso (`submitLogin`/`doLogin`/`logout`) ricalcano l'app TimeTrack già migrata, così passare ad `auth.users` + `profiles` è una sostituzione localizzata — mappatura in [docs/cloud-schema.md](docs/cloud-schema.md).

**Modificato**
- `AZZERA TUTTO` conserva l'utente che lo esegue, ricreandolo come amministratore; ripristino dei dati di esempio e import di un backup riconciliano la sessione (se il backup contiene altri utenti si torna alla schermata di accesso).

### 0.7.0 — 2026-07-22

**Aggiunto**
- **Anagrafiche separate** — il Catalogo unico si divide in due viste: **📦 Acquisti** (commerciali e materie prime) e **🏗 Progetto** (macchine, gruppi, sottogruppi, parti). Ogni vista ha i propri filtri e la creazione di articoli ristretta ai tipi di sua competenza, così il menu "Tipo" non propone più sei voci di cui cinque fuori contesto.
- **Calcolo del costo parte configurabile** — solo costo unitario, solo valore del ciclo di lavorazione, o la somma dei due; per singola parte, con default in *Gestione → Impostazioni*. Vedi [Modello di costo](#modello-di-costo).
- **Preferiti ★** su commerciali e materie prime, con filtro "solo preferiti" nella vista Acquisti.
- **Note interne** su richieste di offerta e ordini: non vengono stampate su PDF ed Excel, passano dalla richiesta all'ordine generato e restano modificabili in ogni stato del documento.
- **Sottogruppi annidati** — un sottogruppo può contenere altri sottogruppi; il controllo anti-ciclo continua a impedire le auto-inclusioni.
- **Filtri negli elenchi di richieste e ordini** — per stato, per fornitore (compreso "senza fornitore") e per testo. La ricerca guarda numero, oggetto, fornitore, note e **righe del documento**, così si risale all'ordine partendo dal codice acquistato. Accanto ai filtri il conteggio dei documenti mostrati e un pulsante per azzerarli.
- **🗑 AZZERA TUTTO** in *Gestione → Backup*: svuota completamente il database (articoli, documenti, anagrafiche, famiglie, U.M. e impostazioni) senza ricaricare i dati di esempio. Doppia conferma, la seconda da digitare.

### 0.6.0 — 2026-07-21

**Aggiunto**
- **Unità di misura gestite** — nuovo pannello *Gestione → 📏 Unità di misura* con elenco di codici e descrizioni, U.M. predefinita ★, conteggio degli utilizzi e rinomina propagata ad articoli e documenti. Tutti i campi U.M. dell'app (anagrafica articolo, testata macchina, righe RFQ e ODA) sono passati da testo libero a menu a tendina. Le U.M. già presenti nei dati e quelle incontrate nell'import Excel entrano automaticamente in elenco, così nessun valore storico va perso.
- **Note di riga** in richieste di offerta e ordini, compilabili all'inserimento della riga e stampate sui documenti: nel PDF sotto la descrizione, nell'Excel in una colonna *Nota*. Le note viaggiano dalla richiesta all'ordine generato.
- **Modifica delle righe** già inserite, con il pulsante ✏ su ogni riga: sulle righe manuali si correggono codice, descrizione, U.M., quantità e prezzo; sulle righe da catalogo restano modificabili quantità, prezzo e nota (codice e descrizione seguono l'anagrafica).
- **Stati automatici** per RFQ e ODA e **blocco delle modifiche** sui documenti già inviati, con sblocco a un click — vedi [Stati dei documenti](#stati-dei-documenti-e-blocco-modifiche). Nuovo stato RFQ *Offerta ricevuta*.
- **Badge di stato** colorato nell'elenco e nell'editor di richieste e ordini, e **versione dell'app** nell'header.

**Modificato**
- Il totale dell'ordine, gli importi di riga e il residuo si aggiornano subito alla modifica di quantità, prezzo o ricevuto (prima restavano fermi fino al salvataggio).
- L'eliminazione di una richiesta o di un ordine non in bozza avverte dello stato nel messaggio di conferma, segnalando anche le quantità già ricevute.

### 0.5.0 — 2026-07-21

- **Ordini a fornitore (ODA)** — nuova vista con numerazione progressiva per anno, generazione da una richiesta di offerta, righe con prezzo/importo/consegna, registrazione dei ricevimenti (ricevuto e residuo per riga, "segna tutto ricevuto"), totale imponibile ed export PDF/Excel bilingue.

### 0.4.0 — 2026-07-20

- **Richieste di offerta (RFQ)** — modello a fornitore singolo, righe da catalogo (con filtri per tipo/famiglia/fornitore) o manuali, condizioni di trasporto e pagamento precompilabili, documento bilingue IT/EN in PDF ed Excel, compilazione di prezzi e date al ritorno dell'offerta e **confronto offerte** tra più richieste.
- **Dati azienda** e anagrafica fornitori estesa (indirizzo strutturato, P.IVA, referente, condizioni predefinite), stampati come intestazione sui documenti.

### 0.3.0 — 2026-07-12

- **Codifica gerarchica** macchina › gruppo › sottogruppo/parte, con schema configurabile per singola macchina (lunghezza e tipo della sigla gruppo, cifre dei progressivi).
- *Gestione → Impostazioni*: separazione tra **Costi e margini** e **Codifica automatica articoli**.
- **Catalogo**: filtri famiglia/sottofamiglia dipendenti dal tipo di articolo selezionato.

### 0.2.0 — 2026-07-12

- Estrazione del layer dati in `store.js` (`Store` come API repository) e **migrazione schema v2**: ID UUID al posto degli interi legacy, timestamp `createdAt`/`updatedAt` su ogni record, migrazioni idempotenti.
- Contratto per il futuro backend condiviso documentato in `docs/cloud-schema.md`.

### 0.1.0 — 2026-07-12

- Prima versione: distinte base multi-livello, catalogo articoli, costificazione con rollup ricorsivo, export PDF/Excel, import massivo da Excel, backup JSON. App monolitica su localStorage.
