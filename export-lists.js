// ═══════════════════════════════════════════════════════════
//  BOMTRACK — export-lists.js
// ═══════════════════════════════════════════════════════════
// Portare via un elenco: PDF ed Excel di quello che si sta guardando.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
//
// ── Il problema ──
// L'app esportava un **documento** per volta — una distinta, un piano, una
// richiesta, un ordine — e nessun **elenco**. Chi filtrava il magazzino su
// «sotto la scorta minima» vedeva la risposta a schermo e non aveva modo di
// portarsela in officina o di allegarla a una mail. L'unica esportazione di
// articoli che esisteva è il template d'import: tutte le colonne, tutti gli
// articoli, tre fogli di contorno. Non è l'elenco che si stava guardando.
//
// ── Una specifica sola, due traduttori ──
// Il rischio, con otto elenchi per due formati, sono sedici funzioni che col
// tempo dicono cose diverse: la colonna aggiunta all'Excel e non al PDF, il
// filtro applicato di qua e non di là. Qui ogni vista descrive il proprio
// elenco **una volta**, come dati:
//
//   { titolo, slug, filtri: [[etichetta, valore]], sezioni: [{ nome, colonne, righe }] }
//
// e due funzioni sole traducono quella descrizione in un file. Le due uscite
// non possono divergere perché leggono lo stesso oggetto. È anche la parte che
// la suite verifica: la specifica è pura, il file no.
//
// ── Cosa entra nel file ──
// Le righe **filtrate**, tutte. Il limite di disegno delle viste lunghe
// («Mostra altri 200») difende il ridisegno, non il contenuto: esportare 200
// righe di 900 senza dirlo sarebbe il modo più silenzioso di far prendere una
// decisione sbagliata. E i filtri attivi finiscono scritti nel file: senza,
// dopo una settimana nessuno sa più cosa contenga quel foglio.

// Il titolo di una specifica è **testo semplice**: niente emoji. I font
// standard di jsPDF non le hanno, e quello che a schermo è 📦 sul PDF diventa
// un quadratino o due caratteri accidentali. Le icone restano sui pulsanti.
function listRows(spec) {
  return (spec.sezioni || []).reduce((n, s) => n + (s.righe || []).length, 0);
}
// Solo i filtri davvero impostati, con l'etichetta leggibile: il valore interno
// (`sotto`, `acquistato`) non dice niente a chi apre il file fra un mese.
function listFiltersText(spec) {
  const attivi = (spec.filtri || []).filter(f => f && f[1] !== '' && f[1] != null);
  return attivi.length ? attivi.map(f => f[0] + ': ' + f[1]).join(' · ') : 'nessun filtro';
}
// Stessa convenzione degli export che c'erano già (`bomtrack_acquisti_<data>`):
// i file di più estrazioni si mettono in ordine da soli in una cartella.
// Lo slug può contenere un codice articolo scritto dall'utente (il confronto
// distinte): una barra o due punti farebbero fallire il salvataggio, e uno
// spazio spezzerebbe il nome. Dalla 0.101.1 passa da nomeFileSicuro.
// Un documento singolo (`spec.nomeFile`, l'ODP) si chiama invece come i suoi
// fratelli ODA e ODL: numero e riferimento, senza prefisso né data.
function listExportName(spec, ext) {
  if (spec.nomeFile) return nomeFileSicuro(spec.nomeFile, 'documento') + '.' + ext;
  const slug = nomeFileSicuro(spec.slug, 'elenco').replace(/\s+/g, '-');
  return `bomtrack_${slug}_${oggiISO()}.${ext}`;
}

// ─── Le colonne che si stanno guardando (dalla 0.105.6) ───
// Anagrafiche e magazzino hanno la scelta delle colonne («Colonne», columns.js).
// L'export ne scriveva un insieme fisso: le colonne accese a schermo — il
// fornitore, la scorta minima, le note — non arrivavano nel file, e quelle
// spente ci finivano lo stesso. Ora il file porta le colonne visibili, nello
// stesso ordine, con codice e descrizione sempre (sono `fissa` nel registro).
// `registro` dà per ogni chiave l'intestazione e il valore: { h, w, num?, v(it) }.
// Una colonna del registro delle viste senza voce qui (gli indicatori, che a
// schermo sono icone) resta fuori dal file.
function listColonneVisibili(vista, registro) {
  const cols = (colsFor(vista) || []).filter(c => registro[c.key] && (c.fissa || !colIsHidden(vista, c.key)));
  return {
    colonne: cols.map(c => { const r = registro[c.key]; return { h: typeof r.h === 'function' ? r.h() : r.h, w: r.w, num: r.num }; }),
    riga: it => cols.map(c => registro[c.key].v(it)),
  };
}

// ─── Il testo che sembra una formula ───
// Una cella di testo che comincia con =, +, @ (o con un trattino davanti a una
// parola, o con un tab) alcuni fogli di calcolo la prendono per una formula
// appena la si tocca, e alcuni appena il file si apre. I testi vengono dagli
// archivi — il nome di un articolo, di un fornitore, una nota — e li scrive chi
// vuole: un «=HYPERLINK(…)» piantato in un nome partirebbe dal foglio di chi lo
// riceve, non da Bomtrack. Un apice davanti lo lascia testo (dalla 0.105.6).
// Un trattino solo («-», il vuoto) e un numero negativo scritto restano come sono.
function xlsxTesto(v) {
  if (typeof v !== 'string') return v;
  return /^(?:[=+@\t\r]|-(?![\d\s.,]|$))/.test(v) ? "'" + v : v;
}

// ─── Excel ───
// Il foglio dati comincia dall'intestazione, in riga 1. La tentazione è
// scriverci sopra due righe di contesto: rompe l'autofiltro, rompe qualunque
// rilettura del foglio e rompe l'import. Il contesto sta in un foglio suo.
function listInfoAoa(spec) {
  const co = (db.settings && db.settings.company) || {};
  const righe = [
    ['Estrazione', spec.titolo],
    ['Azienda', co.name || ''],
    ['Data', new Date().toLocaleString('it-IT')],
    ['Utente', (currentUser && currentUser.name) || ''],
    ['Filtri attivi', listFiltersText(spec)],
    ['Righe esportate', listRows(spec)],
  ];
  (spec.sezioni || []).forEach(s => righe.push(['— ' + s.nome, (s.righe || []).length + ' righe']));
  righe.push(['', '']);
  righe.push(['Nota', 'Contiene le righe che erano a schermo con i filtri qui sopra, non tutto l\'archivio.']);
  return righe;
}
// Excel accetta al massimo 31 caratteri e non accetta : \ / ? * [ ]. I nomi
// delle sezioni sono nostri e stanno larghi, ma tagliare qui costa una riga e
// evita un file che non si apre.
function sheetName(nome) { return String(nome || 'Foglio').replace(/[:\\/?*[\]]/g, ' ').slice(0, 31); }

// ─── Le colonne di data ───
// Una colonna dichiarata `data: true` porta nelle righe la data **ISO**, non il
// «06/09/2026» già scritto: la formattazione è un fatto del formato di uscita,
// e i due traduttori la fanno ognuno a modo suo. Scritta come testo, in Excel
// non si ordinava né si filtrava per data — e proprio negli elenchi dove la
// domanda è «cosa è passato a settembre».
const XLSX_FMT_DATA = 'dd/mm/yyyy';
function listCellData(v) {
  const g = String(v || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g)) return v || '';
  // Mezzogiorno UTC: costruita a mezzanotte, un fuso a ovest la farebbe
  // scivolare al giorno prima nella cella.
  const d = new Date(g + 'T12:00:00Z');
  return isNaN(d.getTime()) ? (v || '') : d;
}

function exportListXlsx(spec) {
  if (!listRows(spec)) { showToast('Niente da esportare con questi filtri', 'error'); return false; }
  if (!requireXlsx()) return false;
  const wb = XLSX.utils.book_new();
  (spec.sezioni || []).forEach(s => {
    const dataCols = s.colonne.map(c => !!c.data);
    const conv = r => r.map((v, k) => (dataCols[k] ? listCellData(v) : xlsxTesto(v)));
    const aoa = [s.colonne.map(c => c.h)].concat((s.righe || []).map(conv));
    if (s.totali) aoa.push(s.totali.map(xlsxTesto));
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    ws['!cols'] = s.colonne.map(c => ({ wch: c.w || 14 }));
    // Il formato italiano sulle celle di data: senza, SheetJS le scrive col
    // formato di serie (m/d/yy) e in officina si legge il mese al posto del giorno.
    dataCols.forEach((isData, k) => {
      if (!isData) return;
      for (let r = 1; r < aoa.length; r++) {
        const cella = ws[XLSX.utils.encode_cell({ r, c: k })];
        if (cella && (cella.t === 'd' || cella.t === 'n')) cella.z = XLSX_FMT_DATA;
      }
    });
    // Filtro automatico sull'intestazione, come nell'export del catalogo: con
    // qualche centinaio di righe è la differenza fra un foglio che si usa e uno
    // che si guarda. La riga dei totali resta fuori dall'intervallo: dentro,
    // un ordinamento se la porterebbe in mezzo ai dati.
    const ultima = aoa.length - (s.totali ? 2 : 1);
    if (ultima > 0) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: ultima, c: s.colonne.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, sheetName(s.nome));
  });
  const info = XLSX.utils.aoa_to_sheet(listInfoAoa(spec));
  info['!cols'] = [{ wch: 22 }, { wch: 96 }];
  info['!protect'] = { password: '' };   // è da leggere, non da compilare
  XLSX.utils.book_append_sheet(wb, info, 'Estrazione');
  XLSX.writeFile(wb, listExportName(spec, 'xlsx'));
  showToast('Excel esportato');
  return true;
}

// ─── PDF ───
// Testata su **ogni** pagina, non solo sulla prima: un elenco lungo si stampa,
// si sfoglia e si passa a qualcuno, e la pagina 3 da sola deve dire di che
// azienda e di che estrazione fa parte. Per la stessa ragione c'è il numero di
// pagina, che finora nessun PDF dell'app aveva: fogli caduti a terra si
// rimettono in ordine solo se sono numerati.
const PDF_LIST_LANDSCAPE_COLS = 7;   // oltre, in verticale le colonne si schiacciano

// Dove finisce la testata si deve sapere **prima** di disegnarla, per dire ad
// autoTable dove può cominciare su ogni pagina. Il conto sta qui una volta
// sola: due formule gemelle, una per misurare e una per disegnare, si
// scollerebbero alla prima riga aggiunta e la tabella finirebbe sopra il
// titolo senza che niente lo segnali.
function pdfListLayout(spec) {
  const co = (db.settings && db.settings.company) || {};
  const azienda = docPartyLines(co);
  const yAzienda = 14;
  const yTitolo = yAzienda + (azienda.length ? 4.5 + Math.max(0, azienda.length - 1) * 3.6 + 2.5 : 0);
  const yFiltri = yTitolo + 5.5;
  const yData = yFiltri + 4;
  return { azienda, yAzienda, yTitolo, yFiltri, yData, top: yData + 5 };
}
function pdfListHead(doc, spec) {
  const L = pdfListLayout(spec);
  let y = L.yAzienda;
  if (L.azienda.length) {
    doc.setFontSize(11); doc.setTextColor(30);
    doc.text(String(L.azienda[0]), 14, y);
    y += 4.5;
    doc.setFontSize(7.5); doc.setTextColor(130);
    L.azienda.slice(1).forEach(t => { doc.text(String(t), 14, y); y += 3.6; });
  }
  doc.setFontSize(14); doc.setTextColor(30);
  doc.text(spec.titolo, 14, L.yTitolo);
  doc.setFontSize(8); doc.setTextColor(90);
  doc.text('Filtri: ' + listFiltersText(spec), 14, L.yFiltri);
  doc.setTextColor(130);
  doc.text(`${new Date().toLocaleString('it-IT')}${currentUser && currentUser.name ? ' · ' + currentUser.name : ''} · ${listRows(spec)} righe`, 14, L.yData);
  // Il documento che ha un QR (l'ordine di produzione) lo porta in alto a
  // destra, su ogni pagina: il foglio che gira in officina apre la sua scheda.
  if (spec.qr && typeof qrPdfDraw === 'function') qrPdfDraw(doc, spec.qr, doc.internal.pageSize.getWidth() - 14 - 20, 5, 20);
}

function exportListPdf(spec) {
  if (!listRows(spec)) { showToast('Niente da esportare con questi filtri', 'error'); return false; }
  const jsPDF = requirePdf(); if (!jsPDF) return false;
  const maxCol = (spec.sezioni || []).reduce((m, s) => Math.max(m, s.colonne.length), 0);
  const doc = new jsPDF(maxCol > PDF_LIST_LANDSCAPE_COLS ? { orientation: 'landscape' } : undefined);
  const top = pdfListLayout(spec).top;
  const larghezza = doc.internal.pageSize.getWidth();
  const altezza = doc.internal.pageSize.getHeight();
  // `didDrawPage` scatta una volta per pagina **per tabella**: con due sezioni
  // sulla stessa pagina la testata verrebbe scritta due volte sopra sé stessa,
  // e il numero di pagina pure. Si tiene il conto di quelle già fatte.
  const fatte = new Set();
  let y = top;
  (spec.sezioni || []).forEach((s, i) => {
    // Con una sezione sola il suo nome ripeterebbe il titolo: si tace.
    if ((spec.sezioni || []).length > 1) {
      if (i > 0) y += 4;
      doc.setFontSize(10); doc.setTextColor(60); doc.text(s.nome, 14, y);
      y += 2;
    }
    const styles = {};
    s.colonne.forEach((c, k) => { if (c.num) styles[k] = { halign: 'right' }; });
    doc.autoTable({
      startY: y,
      head: [s.colonne.map(c => c.h)],
      // Un numero con la virgola, e senza il rumore dei float (0,3 e non
      // 0.30000000000000004): è un foglio che si legge, non un dato.
      body: (s.righe || []).map(r => r.map((v, k) => (v == null ? ''
        : (s.colonne[k] && s.colonne[k].data ? fmtDateIt(v)
          : (typeof v === 'number' && !Number.isInteger(v) ? String(+v.toFixed(4)).replace('.', ',') : v))))),
      foot: s.totali ? [s.totali.map(v => (v == null ? '' : v))] : undefined,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [58, 123, 232] },
      footStyles: { fillColor: [238, 241, 245], textColor: 30, fontStyle: 'bold' },
      columnStyles: styles,
      margin: { top, left: 14, right: 14 },
      // La testata si disegna su ogni pagina nuova, compresa la prima.
      didDrawPage: () => {
        const pag = doc.internal.getNumberOfPages();
        if (fatte.has(pag)) return;
        fatte.add(pag);
        pdfListHead(doc, spec);
        doc.setFontSize(8); doc.setTextColor(140);
        doc.text(`pag. ${pag} di {total_pages}`, larghezza / 2, altezza - 8, { align: 'center' });
      },
    });
    y = doc.lastAutoTable.finalY + 6;
  });
  // Il totale delle pagine si conosce solo alla fine: jsPDF sostituisce il
  // segnaposto lasciato dal piè di pagina.
  if (typeof doc.putTotalPages === 'function') doc.putTotalPages('{total_pages}');
  doc.save(listExportName(spec, 'pdf'));
  showToast('PDF esportato');
  return true;
}

// ─── I pulsanti ───
// Una coppia sola, resa da una funzione: otto viste che scrivono a mano lo
// stesso markup sono otto occasioni di dimenticare una classe.
// Dalla 0.94.0 la coppia sta in un menu «Esporta ▾» (vedi tendina in shell.js).
function listExportButtons(fnSpec) {
  return menuEsporta(`exportListXlsx(${fnSpec}())`, `exportListPdf(${fnSpec}())`);
}
