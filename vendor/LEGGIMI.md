# Librerie di terze parti

Le tre librerie che servono agli export, e dalla 0.99.0 le due dei codici QR, tenute qui dentro invece che su un CDN.
Nessuna è modificata: sono i file ufficiali, scaricati e committati così com'erano.

| File | Versione | Origine |
|---|---|---|
| `xlsx.full.min.js` | **0.20.3** | `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js` |
| `jspdf.umd.min.js` | **4.2.1** | pacchetto npm `jspdf@4.2.1`, file `dist/jspdf.umd.min.js` (MIT) |
| `jspdf.plugin.autotable.min.js` | **5.0.8** | pacchetto npm `jspdf-autotable@5.0.8`, file `dist/jspdf.plugin.autotable.min.js` (MIT) |
| `qrcode.js` | 1.4.4 | pacchetto npm `qrcode-generator@1.4.4`, file `qrcode.js` (MIT, Kazuhiko Arase) |
| `jsQR.js` | 1.4.0 | pacchetto npm `jsqr@1.4.0`, file `dist/jsQR.js` (Apache-2.0) |

Impronte SHA-256 dei file, per poterli riverificare:

```
xlsx.full.min.js                cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41
jspdf.umd.min.js                e6551fcdc32f09d6853b2c5126d18d01d9447e0da618a41a11ebeee0f6c20d54
jspdf.plugin.autotable.min.js   a65dff2c6a8296b16aff24e69f7683cd7dbaed4a4ec26b507d6840ee27d54649
qrcode.js                       18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780
jsQR.js                         bc40c8a15196236b2314db0856f72ca0b49980cd5413b8c852a7349f5fee0859
```

Su Windows quell'impronta corrisponde **solo** perché `.gitattributes` esclude
questa cartella dalla normalizzazione delle fini riga (`vendor/** -text`).
Senza, un clone riscriverebbe i file con CRLF: funzionerebbero lo stesso, ma non
sarebbero più riverificabili — e un file di cui ci si deve fidare sulla parola
è il contrario del motivo per cui sta qui.

I due file jsPDF arrivano dalla 0.105.9 dai pacchetti npm ufficiali: l'impronta
SHA-512 di ciascun pacchetto coincide con il campo `integrity` del registro npm,
e i file sono copiati dalla cartella `dist/` senza toccarli. Fino alla 0.105.8
l'app usava jsPDF 2.5.1 e autotable 3.8.2, gli stessi file che caricava da cdnjs
fino alla 0.42.0; la 2.5.1 aveva dodici vulnerabilità pubblicate (ReDoS, DoS da
immagini malformate, iniezione di oggetti PDF), tutte corrette entro la 4.2.1.
Il passaggio è stato verificato generando ogni PDF dell'app con le due coppie di
librerie e confrontando le pagine rasterizzate: identiche, a parte l'ora di stampa.

## Perché stanno qui

**SheetJS.** Dalla 0.18 non pubblica più su npm né su cdnjs, ma solo sul proprio
CDN. La 0.18.5 che l'app usava ha due vulnerabilità corrette a monte
(prototype pollution, risolta nella 0.19.3; ReDoS, risolta nella 0.20.2), e un
file Excel importato è **input non fidato**: arriva da un fornitore, da un
cliente, da una mail. Restare indietro non era una scelta sostenibile.

**Tutte e tre.** L'app dichiara di aprirsi con un doppio click su `index.html` e
di funzionare offline. Con le librerie su un CDN questo era vero solo dopo che
qualcuno l'aveva aperta almeno una volta con la rete: su un PC in officina senza
collegamento i pulsanti di export erano muti. Dentro il repo non c'è più un
terzo dominio da cui dipendere né di cui fidarsi.

**I due dei QR.** `qrcode.js` disegna i codici (etichette, PDF dei documenti);
`jsQR.js` li legge dalla fotocamera nei browser che non hanno un lettore loro
(`BarcodeDetector` c'è in Chrome su Android, non in Safari né in Firefox). Stanno
qui per la stessa ragione delle altre: le etichette si stampano anche dal PC
dell'officina senza rete.

## Come si aggiornano

Non c'è `npm`, non c'è un build: si scarica il file e si sostituisce.

1. Scaricare la nuova versione dall'indirizzo qui sopra.
2. Sostituire il file in questa cartella e aggiornare la tabella e l'impronta.
3. `node test/run.js` — la suite copre la logica **a valle** del parsing
   (`test/import.test.js`, `test/catalog-xlsx.test.js`), quindi dice subito se
   qualcosa che l'app usa è cambiato.
4. Provare a mano **un import e un export veri**, con un file Excel di quelli
   che girano davvero. I test usano fogli costruiti in memoria: il parsing di un
   `.xlsx` prodotto da Excel è l'unica cosa che non verificano.
