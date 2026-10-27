// ═══════════════════════════════════════════════════════════
//  BOMTRACK — import-catalog.js
// ═══════════════════════════════════════════════════════════
// Articoli ⇄ Excel, in due file: **Acquisti** (commerciali e materie prime) e
// **Progetto** (macchine, gruppi, sottogruppi, parti). È la stessa divisione che
// l'app ha già in Anagrafica (CATALOG_SCOPES) e nei ruoli, e sono due mestieri
// diversi: l'ufficio acquisti compila fornitori e prezzi, la progettazione
// compila sigle e appartenenze. Due file si mandano a due persone senza dover
// spiegare quali fogli non toccare.
//
// Dentro ogni file **il tipo è il foglio**: niente colonna "Tipo" da sbagliare,
// e ogni foglio ha solo le colonne che valgono per quel tipo. Nel file Progetto
// l'ordine dei fogli è il contratto — Macchine → Gruppi → Sottogruppi → Parti —
// perché gruppi e parti referenziano la macchina *per codice*, e quel codice può
// nascere nello stesso file.
//
// L'export produce i dati veri, ed è anche il template: si esporta, si modifica,
// si ricarica. Prima di scrivere c'è 🔍 Verifica, che fa l'import per intero e
// poi annulla tutto: gli errori si leggono prima, non dopo.
//
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  DIZIONARIO DELLE COLONNE
// ═══════════════════════════════════════════════════════════
// Intestazioni e lettori nascono qui, in un punto solo: l'export scrive queste
// stringhe e l'import cerca queste stringhe, quindi non possono divergere.
//
// Le obbligatorie sono marcate con " *", e non costa niente: normHeader() toglie
// tutto ciò che non è a-z0-9, quindi "Descrizione *" e "Descrizione" sono la
// stessa chiave. Attenzione a inventare colonne nuove: la chiave è il nome
// *normalizzato*, e "Codice articolo" NON è "Codice". Oggi sono tutte distinte
// — Codice, Codice macchina, Codice gruppo, Codice fornitore, Codice articolo;
// UM, UM acquisto, UM prezzo; Data, Data prezzo; Descrizione, Descrizione composta.
//
// "Descrizione *" è la stessa chiave per Commerciali/Materie prime/Macchine/
// Gruppi/Sottogruppi (il nome dell'articolo, prima chiamata "Nome *") e per
// Parti (la parte libera del nome, accanto a "Concetto *"): fogli diversi, le
// due colonne non si incontrano mai nello stesso foglio. Gli alias includono
// ancora "Nome"/"Name"/"Denominazione" perché un file esportato prima di
// questa rinomina continui a importare senza dover essere ritoccato a mano.
const CAT_ALIAS = {
  'Codice': ['Code'],
  'UM *': ['UM', 'U.M.', 'Unità', 'UnitaDiMisura'],
  'UM acquisto': ['UMAcquisto', 'UnitaAcquisto'],
  'Fattore': ['FattoreConversione', 'Conversione'],
  'Macrofamiglia': ['Famiglia', 'Family'],
  'Sottofamiglia': ['SubFamily'],
  'Fornitore': ['Supplier'],
  'Prezzo': ['PrezzoAcquisto', 'Price'],
  'UM prezzo': ['UMPrezzo'],
  'Q.tà min': ['QtaMin', 'Quantità minima', 'MinQty'],
  'GG consegna': ['GiorniConsegna', 'LeadDays', 'Consegna'],
  'Codice fornitore': ['CodiceFornitore', 'SupplierCode'],
  'Descrizione fornitore': ['DescrizioneFornitore', 'SupplierDesc'],
  'Data prezzo': ['DataPrezzo'],
  'In uso': ['InUso', 'Prezzo in uso'],
  'Scorta minima': ['ScortaMinima', 'SafetyStock'],
  'Lotto riordino': ['LottoRiordino', 'LotSize', 'Lotto'],
  'Preferito': ['Favorite'],
  'Obsoleto': ['Obsolete'],
  'Note': ['Notes'],
  'Sigla': ['SiglaCodice'],
  'Codice macchina *': ['Codice macchina', 'Macchina', 'CodiceMacchina'],
  'Codice macchina': ['Macchina', 'CodiceMacchina'],
  'Codice gruppo': ['Gruppo', 'CodiceGruppo'],
  'N° car. sigla gruppo': ['CaratteriSiglaGruppo', 'gCodeLen'],
  'Tipo sigla gruppo': ['TipoSiglaGruppo', 'gCodeType'],
  'Cifre progressivo S': ['CifreProgressivo', 'incrDigitsS'],
  'Cifre numerazione': ['CifreNumerazione', 'incrDigitsN'],
  'Concetto *': ['Concetto', 'Concept'],
  'Descrizione *': ['Descrizione', 'DescrizioneLibera', 'Nome', 'Name', 'Denominazione'],
  // La descrizione libera delle parti, che non è obbligatoria: un file di prima
  // della 0.117.0 la chiama ancora «Descrizione *».
  'Descrizione': ['Descrizione *', 'DescrizioneLibera', 'Nome', 'Name', 'Denominazione'],
  'Approvvigionamento': ['Sourcing'],
};
function catNames(h) { return [h].concat(CAT_ALIAS[h] || []); }
function catCell(row, h) { return cell(row, ...catNames(h)); }
function catBool(row, h) { return boolCell(row, ...catNames(h)); }

// Un numero come lo scrive davvero un foglio italiano. `numOr` da solo
// sostituisce la prima virgola e lascia i punti: "1.234,56" diventava 1.234 —
// un prezzo plausibile, e falso. Le celle numeriche vere arrivano già come
// numeri e non passano di qui.
function catNum(row, h) {
  const v = catCell(row, h);
  if (v === null || v === '') return v;
  return catNumOf(v);
}
function catNumOf(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  let s = String(v).trim().replace(/\s|'| /g, '');
  const ic = s.lastIndexOf(','), ip = s.lastIndexOf('.');
  if (ic >= 0 && ip >= 0) {
    // Vince l'ultimo separatore: è quello decimale, l'altro sono le migliaia
    if (ic > ip) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (ic >= 0) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}
// Una data da Excel arriva come seriale (45658), non come "2025-01-10". Si
// accettano seriale, Date e testo; si restituisce sempre yyyy-mm-dd, che è il
// formato con cui bestPriceRow() confronta le quotazioni.
function catDate(row, h) {
  const v = catCell(row, h);
  if (v === null || v === '') return v;
  return catDateOf(v);
}
function catDateOf(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  // ISO, anche con mese o giorno a una cifra ("2026-1-5"): scriverlo così non è
  // sbagliato, e prima cadeva fra le maglie fino al ramo del seriale.
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  // gg/mm/aaaa e gg/mm/aa. L'anno a due cifre è del Duemila: un listino datato
  // 1926 non esiste, uno datato 2026 è quello di quest'anno.
  const it = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (it) {
    const anno = it[3].length === 2 ? String(2000 + Number(it[3])) : it[3];
    return `${anno}-${it[2].padStart(2, '0')}-${it[1].padStart(2, '0')}`;
  }
  // Il seriale di Excel — ma solo se la cella è un numero e nient'altro.
  // Senza questa guardia "31/01/26" arrivava lo stesso qui: parseFloat si ferma
  // alla barra e restituisce 31, che diventava il 30 gennaio 1900. E siccome la
  // data è la chiave d'identità della quotazione (catUpsertQuote), nasceva un
  // doppione datato 1900 che bestPriceRow considerava vecchissimo. In silenzio,
  // e con 120 anni di scarto.
  if (/^\d+([.,]\d+)?$/.test(s)) {
    const n = catNumOf(s);
    if (!isNaN(n) && n > 0 && n < 300000) {
      // Epoca Excel: il giorno 1 è il 1900-01-01, con il 1900 bisestile inesistente
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
      return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    }
  }
  return '';
}
// Il fuso conta: la data è l'identità di una quotazione (catUpsertQuote), e
// fra mezzanotte e le due toISOString() ne dava una di ieri — cioè una riga
// nuova al posto di un aggiornamento.
function catToday() { return oggiISO(); }
// In export: un numero resta numero, un campo non impostato resta vuoto (le
// scorte distinguono "nessun valore" da "zero", e uno 0 finto le riempirebbe).
function catNumOut(v) { return v === '' || v == null ? '' : (Number(v) || 0); }
// Il vuoto come «no». Va bene dove la colonna indica quale riga fra tante è
// quella scelta ("In uso"): là il no è ovvio e scriverlo trentadue volte è
// rumore.
// Il no scritto, per i flag che si devono poter **spegnere** da file. boolCell
// legge la cella vuota come «non toccare»: un articolo a cui si è tolto il
// Preferito, esportato e ricaricato su un'altra postazione, restava preferito
// per sempre — e il file diceva il vero, solo che nessuno lo ascoltava. Scritto,
// il no è un'istruzione; vuoto era un silenzio.
function catSiNoEsplicito(v) { return v ? 'Sì' : 'No'; }
function catSupplierName(id) { const s = getSupplier(id); return s ? (s.name || '') : ''; }

// ─── Colonne per tipo ───
// Il prezzo sta sulla riga dell'articolo ed è la quotazione in uso (dalla
// 0.117.0). Il foglio Listino, con tutte le quotazioni, non c'è più: le altre
// restano nell'app, e l'import non ne cancella nessuna.
// [intestazione, valore in export]. L'import legge per intestazione, quindi
// l'ordine qui dentro è solo l'ordine con cui si presentano nel foglio.
const CAT_COL_PRICE = [
  ['Fornitore', (it, q) => q ? catSupplierName(q.supplierId) : ''],
  ['Prezzo', (it, q) => q ? catNumOut(q.price) : ''],
  ['UM prezzo', (it, q) => q ? (q.priceUom || '') : ''],
  ['Q.tà min', (it, q) => q ? catNumOut(q.minQty) : ''],
  ['GG consegna', (it, q) => q ? catNumOut(q.leadDays) : ''],
  ['Codice fornitore', (it, q) => q ? (q.code || '') : ''],
  ['Descrizione fornitore', (it, q) => q ? (q.desc || '') : ''],
  ['Data prezzo', (it, q) => q ? (q.date || '') : ''],
  // La nota della quotazione. Si chiama «Note prezzo» e non «Note» perché nello
  // stesso foglio c'è già la nota dell'articolo: un articolo con una sola
  // quotazione si esporta in linea, e senza questa colonna la sua nota non
  // finiva in nessuna cella del file — persa al primo giro su una postazione nuova.
  ['Note prezzo', (it, q) => q ? (q.note || '') : ''],
  // Sì = la quotazione della riga va in uso; vuoto o No = si aggiunge al
  // listino e basta. In export è sempre Sì: sulla riga c'è quella in uso.
  ['In uso', (it, q) => q ? 'Sì' : ''],
];
const CAT_COL_STOCK = [
  ['Scorta minima', it => catNumOut(it.safetyStock)],
  ['Lotto riordino', it => catNumOut(it.lotSize)],
];
// Macro e sotto si scrivono col nome e la sigla fra quadre, «Meccanico [MEC]»
// (dalla 0.117.0): la sigla è quella che finisce nel codice, e chi sceglie
// dalla tendina deve vederla. L'import legge il nome e usa la sigla solo per
// una famiglia nuova; il solo nome, come nei file di prima, vale ancora.
function catSiglaFam(x) { return x ? (x.sigla || siglaFromName(x.name)) : ''; }
function catFamValore(x) { return x ? `${x.name || ''} [${catSiglaFam(x)}]` : ''; }
function catFamLeggi(v) {
  const m = /^(.*?)\s*\[\s*([^\]]*?)\s*\]\s*$/.exec(String(v == null ? '' : v));
  return m && m[1] ? { nome: m[1].trim(), sigla: m[2] } : { nome: String(v == null ? '' : v).trim(), sigla: '' };
}
const CAT_COL_FAMILY = [
  ['Macrofamiglia', it => catFamValore(getFamily(it.familyId))],
  ['Sottofamiglia', it => { const f = getFamily(it.familyId); return catFamValore(f && (f.subs || []).find(x => x.id === it.subFamilyId)); }],
];
const CAT_COL_ALTUOM = [
  ['UM acquisto', it => it.altUom || ''],
  ['Fattore', it => catNumOut(it.altFactor)],
];
// Commerciali e materie prime condividono tutto: usesFamily, hasPriceList,
// hasStock e canFavorite li trattano allo stesso modo. Una definizione, due fogli.
const CAT_COLS_BUY = [
  ['Codice', it => it.code || ''],
  ['Descrizione *', it => it.name || ''],
  ['UM *', it => it.uom || ''],
].concat(CAT_COL_ALTUOM, CAT_COL_FAMILY, CAT_COL_PRICE, CAT_COL_STOCK, [
  ['Preferito', it => catSiNoEsplicito(it.favorite)],
  ['Obsoleto', it => catSiNoEsplicito(it.obsolete)],
  ['Note', it => it.notes || ''],
]);
const CAT_COLS_MACCHINA = [
  ['Codice', it => it.code || ''],
  ['Sigla', it => it.sigla || ''],
  ['Descrizione *', it => it.name || ''],
  ['UM *', it => it.uom || ''],
  ['N° car. sigla gruppo', it => catNumOut(it.gCodeLen)],
  ['Tipo sigla gruppo', it => it.gCodeType || ''],
  ['Cifre progressivo S', it => catNumOut(it.incrDigitsS)],
  ['Cifre numerazione', it => catNumOut(it.incrDigitsN)],
  ['Note', it => it.notes || ''],
];
const CAT_COLS_GRUPPO = [
  ['Codice', it => it.code || ''],
  ['Codice macchina *', it => catItemCode(it.machineItemId)],
  ['Sigla', it => it.sigla || ''],
  ['Descrizione *', it => it.name || ''],
  ['UM *', it => it.uom || ''],
  ['Note', it => it.notes || ''],
];
const CAT_COLS_SOTTOGRUPPO = [
  ['Codice', it => it.code || ''],
  ['Codice macchina', it => catItemCode(it.machineItemId)],
  ['Codice gruppo', it => catItemCode(it.groupItemId)],
  ['Descrizione *', it => it.name || ''],
  ['UM *', it => it.uom || ''],
  ['Note', it => it.notes || ''],
];
const CAT_COLS_PARTE = [
  ['Codice', it => it.code || ''],
  ['Codice macchina', it => catItemCode(it.machineItemId)],
  ['Codice gruppo', it => catItemCode(it.groupItemId)],
  ['Concetto *', it => conceptName(it.conceptId)],
  // Facoltativa dalla 0.117.0: il nome di una parte può essere il solo concetto.
  ['Descrizione', it => it.nameFree || ''],
  ['UM *', it => it.uom || ''],
  ['Approvvigionamento', it => PART_SOURCING[partSourcing(it)] || ''],
].concat(CAT_COL_FAMILY, CAT_COL_ALTUOM, CAT_COL_PRICE, CAT_COL_STOCK, [
  ['Obsoleto', it => catSiNoEsplicito(it.obsolete)],
  ['Note', it => it.notes || ''],
  // Di sola lettura: il nome di una parte si compone da concetto + descrizione
  // (composePartName). Scriverlo qui non cambierebbe niente, e l'import lo ignora.
  ['Descrizione composta (calcolato)', it => it.name || ''],
]);
const CAT_COLS = {
  acquistato: CAT_COLS_BUY, materiale: CAT_COLS_BUY, macchina: CAT_COLS_MACCHINA,
  gruppo: CAT_COLS_GRUPPO, sottogruppo: CAT_COLS_SOTTOGRUPPO, parte: CAT_COLS_PARTE,
};
function catItemCode(id) { const it = getItem(id); return it ? (it.code || '') : ''; }

// ─── I fogli dei due file ───
// L'ordine è il contratto: gruppi, sottogruppi e parti si agganciano a codici
// che possono essere stati creati dai fogli precedenti dello stesso file.
const CATALOG_SHEET_DEFS = {
  buy: [
    { name: 'Commerciali', type: 'acquistato' },
    { name: 'Materie prime', type: 'materiale' },
  ],
  design: [
    { name: 'Macchine', type: 'macchina' },
    { name: 'Gruppi', type: 'gruppo' },
    { name: 'Sottogruppi', type: 'sottogruppo' },
    { name: 'Parti', type: 'parte' },
  ],
};
// Il foglio dei file fino alla 0.116.0: se c'è si dice che non si legge più.
const CAT_PRICE_SHEET = 'Listino';
const CAT_SCOPE_LABEL = { buy: 'Acquisti', design: 'Progetto' };
function catScopeOf(scope) { return CATALOG_SHEET_DEFS[scope] ? scope : 'buy'; }
function catItemsOfType(type) { return (db.items || []).filter(i => i.type === type); }

// ═══════════════════════════════════════════════════════════
//  EXPORT — i dati veri, che sono anche il template
// ═══════════════════════════════════════════════════════════
function catInlineQuote(it) { return activePriceRow(it); }
function catalogSheets(scope) {
  scope = catScopeOf(scope);
  const out = [];
  CATALOG_SHEET_DEFS[scope].forEach(def => {
    const cols = CAT_COLS[def.type];
    const items = catItemsOfType(def.type);
    out.push({
      name: def.name, type: def.type,
      aoa: [cols.map(c => c[0])].concat(items.map(it => {
        const q = hasPriceList(it) ? catInlineQuote(it) : null;
        return cols.map(c => c[1](it, q));
      })),
      cols: cols.map(c => ({ wch: catWidth(c[0]) })),
    });
  });
  return out;
}
function catWidth(h) {
  if (h === 'Note' || h === 'Descrizione fornitore') return 38;
  if (h === 'Descrizione *' || h === 'Descrizione' || h === 'Descrizione composta (calcolato)') return 34;
  if (h === 'Fornitore' || h === 'Macrofamiglia' || h === 'Sottofamiglia' || h === 'Approvvigionamento') return 24;
  if (h.indexOf('Codice') === 0) return 18;
  return 13;
}
// ─── Foglio Liste ───
// Il vocabolario a cui rimandano i messaggi d'errore dell'import, da leggere.
// Le tendine vere (dalla 0.117.0) prendono gli stessi valori dal foglio
// nascosto Tendine: vedi catTendine e scriviXlsxConTendine in core.js.
function catListeAoa(scope) {
  const colonne = [];
  const push = (titolo, valori) => colonne.push([titolo].concat(valori));
  push('UM', uomList().map(u => u.code));
  const attivi = (db.suppliers || []).filter(s => s.active !== false).map(s => s.name);
  if (scope === 'buy') {
    push('Fornitori', attivi);
    [['acquistato', 'commerciali'], ['materiale', 'materie prime']].forEach(([kind, et]) => {
      const macro = [], sotto = [];
      (db.families || []).filter(f => (f.kind || 'acquistato') === kind).forEach(f => {
        if (!(f.subs || []).length) { macro.push(catFamValore(f)); sotto.push(''); }
        (f.subs || []).forEach(s => { macro.push(catFamValore(f)); sotto.push(catFamValore(s)); });
      });
      // Macro e sotto stanno appaiate perché sono dipendenti: due elenchi piatti
      // direbbero che qualunque sottofamiglia sta sotto qualunque macrofamiglia.
      push('Macrofamiglia ' + et, macro);
      push('Sottofamiglia ' + et, sotto);
    });
  } else {
    const mac = machineItems();
    push('Codice macchina', mac.map(m => m.code || ''));
    push('Macchina', mac.map(m => m.name || ''));
    const grp = catItemsOfType('gruppo');
    push('Codice gruppo', grp.map(g => g.code || ''));
    push('Gruppo', grp.map(g => g.name || ''));
    push('Macchina del gruppo', grp.map(g => catItemCode(g.machineItemId)));
    push('Concetti', conceptList().map(c => c.name));
    push('Approvvigionamento', Object.values(PART_SOURCING));
    push('Tipo sigla gruppo', Object.values(CODE_TYPES));
    const macro = [], sotto = [];
    (db.families || []).filter(f => (f.kind || 'acquistato') === 'parte').forEach(f => {
      if (!(f.subs || []).length) { macro.push(catFamValore(f)); sotto.push(''); }
      (f.subs || []).forEach(s => { macro.push(catFamValore(f)); sotto.push(catFamValore(s)); });
    });
    push('Macrofamiglia parti', macro);
    push('Sottofamiglia parti', sotto);
    push('Fornitori', attivi);
  }
  push('Sì / No', ['Sì', 'No']);
  const righe = Math.max(...colonne.map(c => c.length));
  const aoa = [];
  for (let r = 0; r < righe; r++) aoa.push(colonne.map(c => (c[r] === undefined ? '' : c[r])));
  return aoa;
}
// ─── Menu a tendina (dalla 0.117.0) ───
// Le stesse liste del foglio Liste, agganciate alle colonne da compilare. Dove
// l'import crea ciò che manca (fornitori, famiglie, unità) la tendina avvisa e
// lascia scrivere; dove non lo crea (concetti, Sì/No, valori fissi) blocca.
// Macchine e gruppi puntano alle colonne Codice dei fogli dello stesso file,
// così vale anche una macchina appena aggiunta in fondo al foglio Macchine.
function catCoppieFamiglia(kind) {
  const chiavi = [], valori = [];
  (db.families || []).filter(f => (f.kind || 'acquistato') === kind).forEach(f => {
    (f.subs || []).forEach(s => { chiavi.push(catFamValore(f)); valori.push(catFamValore(s)); });
  });
  return [chiavi, valori];
}
function catMacro(kind) { return (db.families || []).filter(f => (f.kind || 'acquistato') === kind).map(catFamValore); }
function catTendine(scope) {
  scope = catScopeOf(scope);
  const liste = [['UM', uomList().map(u => u.code)],
    ['Fornitori', (db.suppliers || []).filter(s => s.active !== false).map(s => s.name)],
    ['Sì / No', ['Sì', 'No']]];
  const regole = [];
  const r = (foglio, colonna, lista, o) => regole.push(Object.assign({ foglio, colonna, lista }, o));
  const avviso = { avviso: true };
  const famiglie = (foglio, kind) => {
    const [chiavi, valori] = catCoppieFamiglia(kind);
    liste.push(['Macrofamiglie ' + kind, catMacro(kind)], ['Sottofamiglie ' + kind, valori, chiavi]);
    r(foglio, 'Macrofamiglia', 'Macrofamiglie ' + kind, avviso);
    r(foglio, 'Sottofamiglia', 'Sottofamiglie ' + kind, Object.assign({ dipendeDa: 'Macrofamiglia' }, avviso));
  };
  const prezzo = foglio => {
    r(foglio, 'Fornitore', 'Fornitori', avviso);
    r(foglio, 'UM prezzo', 'UM', avviso);
    r(foglio, 'In uso', 'Sì / No');
  };
  CATALOG_SHEET_DEFS[scope].forEach(def => {
    const f = def.name;
    r(f, 'UM *', 'UM', avviso);
    if (def.type === 'acquistato' || def.type === 'materiale') {
      r(f, 'UM acquisto', 'UM', avviso);
      famiglie(f, def.type);
      prezzo(f);
      r(f, 'Preferito', 'Sì / No');
      r(f, 'Obsoleto', 'Sì / No');
    } else if (def.type === 'macchina') {
      r(f, 'Tipo sigla gruppo', 'Tipo sigla gruppo');
    } else if (def.type === 'gruppo') {
      r(f, 'Codice macchina *', null, { rif: { foglio: 'Macchine', colonna: 'Codice' }, avviso: true,
        messaggio: 'Codice non presente nel foglio Macchine: l\'import lo cerca comunque in catalogo.' });
    } else {
      r(f, 'Codice macchina', null, { rif: { foglio: 'Macchine', colonna: 'Codice' }, avviso: true,
        messaggio: 'Codice non presente nel foglio Macchine: l\'import lo cerca comunque in catalogo.' });
      r(f, 'Codice gruppo', null, { rif: { foglio: 'Gruppi', colonna: 'Codice' }, avviso: true,
        messaggio: 'Codice non presente nel foglio Gruppi: l\'import lo cerca comunque in catalogo.' });
    }
    if (def.type === 'parte') {
      r(f, 'Concetto *', 'Concetti', { messaggio: 'Il concetto deve esistere già (Gestione → Concetti): l\'import non lo crea.' });
      r(f, 'Approvvigionamento', 'Approvvigionamento');
      r(f, 'UM acquisto', 'UM', avviso);
      famiglie(f, 'parte');
      prezzo(f);
      r(f, 'Obsoleto', 'Sì / No');
    }
  });
  if (scope === 'design') {
    liste.push(['Concetti', conceptList().map(c => c.name)],
      ['Approvvigionamento', Object.values(PART_SOURCING)],
      ['Tipo sigla gruppo', Object.values(CODE_TYPES)]);
  }
  return { liste, regole };
}
function catInfoAoa(scope) {
  const comune = [
    [],
    ['Come si usa', ''],
    ['', 'Questo file è insieme l\'esportazione e il template: modificalo e ricaricalo da Gestione → Import.'],
    ['', 'Prima di caricare usa 🔍 Verifica: fa l\'import per intero e poi annulla tutto, così gli errori si leggono prima di scrivere.'],
    ['', 'Il tipo di articolo è il FOGLIO: non spostare righe da un foglio all\'altro.'],
    ['', 'Le intestazioni con * sono obbligatorie. Non rinominare le intestazioni.'],
    ['', 'Il Codice è la chiave: se esiste, l\'articolo viene aggiornato; se è vuoto, viene generato.'],
    ['', 'Una colonna cancellata lascia il campo com\'è; una colonna presente ma vuota lo svuota.'],
    ['', 'L\'import non elimina mai articoli né quotazioni: si eliminano dall\'app.'],
    ['', 'Le colonne con valori ammessi (UM, famiglie, fornitori, concetti, macchine, gruppi, Sì/No…) hanno un menu a tendina; il foglio Liste li elenca tutti.'],
    ['', 'Sottofamiglia propone solo quelle della Macrofamiglia scelta. Dove l\'import crea ciò che manca (fornitori, famiglie, unità) si può anche scrivere un valore nuovo.'],
    ['', 'Decimali con la virgola o con il punto: vanno bene entrambi. Le date come 2025-01-31 o 31/01/2025.'],
    [],
    ['Unità di misura', ''],
    // Le intestazioni non si possono arricchire con l'unità — sono la chiave con
    // cui l'import riconosce le colonne, e rinominarle romperebbe i file già in
    // giro. L'unità si dichiara qui, dove si legge prima di compilare.
    ['', 'Scorta minima, Lotto riordino e le quantità sono nell\'UM dell\'articolo (colonna UM).'],
    ['', 'Q.tà min è invece nell\'UM della quotazione (UM prezzo, se valorizzata; altrimenti UM).'],
    ['', 'GG consegna è in giorni lavorativi, o di calendario se così impostato in Gestione › Calendario di fabbrica.'],
    [],
    ['Prezzi', ''],
    ['', 'Prezzo e fornitore sulla riga articolo creano una QUOTAZIONE nel listino e diventano il prezzo in uso.'],
    ['', 'Il prezzo è per una unità: nell\'UM prezzo se valorizzata, altrimenti nell\'UM dell\'articolo.'],
    ['', 'Sulla riga c\'è una quotazione sola: quella in uso. Le altre restano nell\'app (Listino fornitori) e l\'import non le tocca.'],
    ['', 'Per lo stesso fornitore entra solo una Data prezzo PIÙ RECENTE di quelle già a listino: una data più vecchia non entra (avviso nel report).'],
    ['', 'Stessa data e stesso fornitore = la stessa quotazione: se è uguale non succede niente, se è diversa non viene sovrascritta (avviso). Un prezzo nuovo vuole una data nuova.'],
    ['', 'In uso = Sì: la quotazione della riga diventa quella in uso. Vuoto o No: si aggiunge al listino e basta (ma la prima quotazione di un articolo va comunque in uso).'],
    ['', 'Data prezzo vuota = oggi.'],
    ['', 'Una quotazione senza fornitore azzera il fornitore dell\'articolo.'],
    ['', 'UM prezzo vale solo se coincide con UM acquisto dell\'articolo; qualunque altro valore viene ignorato.'],
  ];
  if (scope === 'buy') {
    return [['ISTRUZIONI — Articoli: Acquisti (commerciali e materie prime)']].concat(comune, [
      [],
      ['Colonna', 'Descrizione'],
      ['Codice', 'Chiave. Vuoto = generato dalla famiglia (es. CMM-MEC-CUS-001).'],
      ['Descrizione *', 'Obbligatoria.'],
      ['UM *', 'Unità di gestione: quella con cui l\'articolo va in distinta e a magazzino.'],
      ['UM acquisto', 'Solo se il fornitore quota in un\'altra unità (barra gestita a metri, comprata a chilo).'],
      ['Fattore', 'Quante UM acquisto stanno in una UM (es. 5,55 kg per ogni metro). Vale insieme a UM acquisto: da soli non valgono.'],
      ['Macrofamiglia / Sottofamiglia', 'Nome e sigla, come «Meccanico [MEC]»: la sigla è quella del codice automatico. Create se non esistono, con la sigla fra quadre se libera.'],
      ['Fornitore', 'Creato se non esiste.'],
      ['Scorta minima / Lotto riordino', 'Vuoto = non impostato (diverso da 0).'],
      ['Preferito / Obsoleto', "Sì oppure No. Cella vuota = lascia il valore invariato."],
      ['Esempio', 'Codice vuoto · Cuscinetto SKF 6204 · pz · famiglia Meccanico/Cuscinetti · fornitore SKF · prezzo 12,50'],
    ]);
  }
  return [['ISTRUZIONI — Articoli: Progetto (macchine, gruppi, sottogruppi, parti)']].concat(comune, [
    [],
    ['Attenzione', 'Questo file NON contiene la distinta base: una macchina importata nasce senza componenti.'],
    ['', 'La distinta si carica a parte, con il foglio Distinte (colonne CodicePadre, CodiceFiglio, Qta, Scarto%).'],
    [],
    ['I fogli si applicano in ordine', 'Macchine → Gruppi → Sottogruppi → Parti.'],
    ['', 'Un gruppo può quindi puntare a una macchina definita in questo stesso file.'],
    [],
    ['Colonna', 'Descrizione'],
    ['Sigla (macchina)', 'Solo A-Z e 0-9, unica fra le macchine. Senza sigla non c\'è codice automatico.'],
    ['N° car. sigla gruppo', 'Quanti caratteri deve avere la sigla dei suoi gruppi (1-10).'],
    ['Tipo sigla gruppo', 'Alfabetico, Numerico o Alfanumerico.'],
    ['Cifre progressivo S', 'Cifre del progressivo S## di macchine e gruppi (1-6).'],
    ['Cifre numerazione', 'Cifre del progressivo ### di sottogruppi e parti (1-6).'],
    ['Codice macchina', 'Codice di una macchina già a catalogo o presente nel foglio Macchine.'],
    ['Codice gruppo', 'Codice di un gruppo di QUELLA macchina.'],
    ['Sigla (gruppo)', 'Deve rispettare lo schema della sua macchina ed essere unica su quella macchina.'],
    ['Concetto *', 'Obbligatorio. Deve esistere già (Gestione → Concetti). Non viene creato dall\'import: finisce dentro il nome della parte, e un refuso resterebbe per sempre.'],
    ['Descrizione', 'Facoltativa: la parte libera del nome. Nome parte = Concetto + Descrizione.'],
    ['Macrofamiglia / Sottofamiglia', 'Nome e sigla, come «Lamiere [LAM]»: la sigla è quella del codice. Create se non esistono.'],
    ['Approvvigionamento', 'Produzione interna oppure Acquisto da fornitore. Su una parte a produzione interna con ciclo, il prezzo di listino non diventa costo.'],
    ['Esempio', 'Parti: codice vuoto · macchina TRN-S00 · gruppo TRN-BAS-S00 · concetto ALBERO · descrizione motore 20x100 · UM pz'],
  ]);
}
function exportCatalogXlsx(scope) {
  scope = catScopeOf(scope);
  if (!requireXlsx()) return;
  scriviXlsxConTendine(catalogWorkbook(scope), `bomtrack_${scope === 'buy' ? 'acquisti' : 'progetto'}_${catToday()}.xlsx`, catTendine(scope));
  showToast('Articoli esportati');
}
function catalogWorkbook(scope) {
  scope = catScopeOf(scope);
  const wb = XLSX.utils.book_new();
  catalogSheets(scope).forEach(sh => {
    const ws = XLSX.utils.aoa_to_sheet(sh.aoa);
    if (sh.cols) ws['!cols'] = sh.cols;
    // Filtro automatico sull'intestazione: con qualche migliaio di righe è la
    // differenza fra un foglio che si usa e uno che si guarda.
    if (sh.aoa.length > 1) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sh.aoa.length - 1, c: sh.aoa[0].length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, sh.name);
  });
  const liste = XLSX.utils.aoa_to_sheet(catListeAoa(scope));
  liste['!protect'] = { password: '' };   // non si compila: è solo da leggere e copiare
  XLSX.utils.book_append_sheet(wb, liste, 'Liste');
  const info = XLSX.utils.aoa_to_sheet(catInfoAoa(scope));
  info['!cols'] = [{ wch: 30 }, { wch: 110 }];
  info['!protect'] = { password: '' };
  XLSX.utils.book_append_sheet(wb, info, 'Istruzioni');
  return wb;
}

// ═══════════════════════════════════════════════════════════
//  IMPORT
// ═══════════════════════════════════════════════════════════
// Due fasi, e l'ordine non è un dettaglio:
//   A. i fogli articolo, nell'ordine dichiarato;
//   C. la quotazione in uso, una volta per articolo e non una per riga.
// (La fase B era il foglio Listino, tolto nella 0.117.0.)
// Gli stessi tre contatori di _stat() in import-export.js, che è dove vivono i
// contatori dei report: un nome solo per un oggetto solo.
function catStat() { return _stat(); }
function importCatalogSheets(byName, scope, opts) {
  scope = catScopeOf(scope);
  const o = opts || {};
  const rep = { scope, dryRun: !!o.dryRun, sheets: [], missing: [], foreign: [], legacy: false,
    errors: [], warnings: [], createdSuppliers: 0, createdFamilies: 0, createdSubFamilies: 0,
    createdUoms: [], preview: [], nuoviCodici: [] };
  const ctx = { rep, scope, seen: new Map(), touched: new Map() };
  const norm = {};
  Object.keys(byName || {}).forEach(n => { norm[normHeader(n)] = byName[n]; });

  const esegui = () => {
    codeIndex();   // costruito una volta: poi ogni articolo nuovo entra con codeIndexAdd
    const defs = CATALOG_SHEET_DEFS[scope];
    let trovati = 0;
    defs.forEach(def => {
      const rows = norm[normHeader(def.name)];
      if (!Array.isArray(rows)) { rep.missing.push(def.name); return; }
      trovati++;
      const st = catStat();
      rows.forEach((row, i) => catApplyItemRow(row, def, ctx, i + 2, st));
      rep.sheets.push(Object.assign({ name: def.name }, st));
    });
    // File caricato dal pulsante sbagliato: dirlo, invece di lasciar credere che
    // il file sia illeggibile.
    const altro = scope === 'buy' ? 'design' : 'buy';
    CATALOG_SHEET_DEFS[altro].forEach(def => {
      if (Array.isArray(norm[normHeader(def.name)])) rep.foreign.push(def.name);
    });
    const listino = norm[normHeader(CAT_PRICE_SHEET)];
    // Il ripiego sul formato precedente vale solo per un file che non ha
    // **nessun** foglio nostro: con il solo Listino leggerlo come foglio unico
    // di articoli sarebbe un modo raffinato di sbagliare tutto.
    if (!trovati && !rep.foreign.length && !Array.isArray(listino)) catLegacySheets(byName, ctx);
    // Dalla 0.117.0 il prezzo si legge solo dalla riga dell'articolo. Un file di
    // prima porta ancora il foglio: non si legge, ma lo si dice, perché chi
    // l'ha compilato si aspetta di vedere quei prezzi entrare.
    if (Array.isArray(listino) && listino.some(r => Object.values(r).some(v => String(v == null ? '' : v).trim()))) {
      rep.warnings.push(`foglio ${CAT_PRICE_SHEET} ignorato: il prezzo si importa solo dalla riga dell'articolo (una quotazione per articolo, quella in uso)`);
    }
    catFinalizePrices(ctx);
    return rep;
  };

  if (o.dryRun) return catWithRollback(esegui);
  // L'applicazione parziale riga per riga è voluta: su un foglio da 5.000 righe
  // le buone devono entrare. Un'eccezione imprevista no: quella lascerebbe il
  // database scritto a metà, e finora lo salvava pure.
  try {
    esegui();
  } catch (e) {
    console.error(e);
    throw e;
  }
  saveDB();
  return rep;
}
// Adapter che non scrive da nessuna parte: cintura di sicurezza del dry-run,
// perché un saveDB() dimenticato dentro un ramo non deve poter toccare il disco.
const CAT_NULL_ADAPTER = { name: 'nulla', read() { return null; }, write() {}, size() { return 0; } };
function catWithRollback(fn) {
  const backup = JSON.stringify(db);
  const prima = Store.adapter;
  Store.adapter = CAT_NULL_ADAPTER;
  try {
    return fn();
  } finally {
    db = JSON.parse(backup);
    // Obbligatoria: gli indici di fornitori, centri di lavoro e padri non si
    // accorgono da soli del ripristino e resterebbero puntati agli oggetti del
    // giro annullato. markSynced() invece NON va chiamata — dichiarerebbe
    // sincronizzate modifiche mai inviate.
    invalidateCaches();
    Store.adapter = prima;
  }
}

// ─── Una riga di foglio articolo ───
function catApplyItemRow(row, def, ctx, ln, st) {
  const rep = ctx.rep, type = def.type, foglio = def.name;
  const err = m => rep.errors.push(`${foglio}, riga ${ln}: ${m}`);
  const avviso = m => rep.warnings.push(`${foglio}, riga ${ln}: ${m}`);
  if (!Object.values(row).some(v => String(v == null ? '' : v).trim())) { st.skipped++; return; }

  // Colonna Tipo di troppo (o riga incollata da un altro foglio)
  const tipoRaw = cell(row, 'Tipo', 'Type');
  if (tipoRaw) {
    const t = resolveType(tipoRaw);
    if (t !== type) { err(`la colonna Tipo dice "${esc(tipoRaw)}" ma questo è il foglio ${foglio}`); return; }
  }
  const code = catCell(row, 'Codice') || '';
  if (code) {
    const k = itemCodeKey(code);
    if (ctx.seen.has(k)) { err(`codice "${esc(code)}" già usato alla riga ${ctx.seen.get(k)} di questo file`); return; }
    ctx.seen.set(k, ln);
  }
  let it = code ? getItemByCode(code) : null;
  if (it && it.type !== type) { err(`il codice "${esc(code)}" è già di ${typeLabel(it.type)}: il tipo di un articolo non si cambia da un foglio`); return; }
  const isNew = !it;
  if (isNew && code && codicePresoAltrove(code)) { err(`codice "${esc(code)}" appena preso da un collega sull'archivio condiviso`); return; }
  if (isNew) {
    it = { id: gid(), type, active: true };
    if (isAssembly(type)) { it.components = []; it.operations = []; }
    if (type === 'parte') { it.cycle = []; it.sourcing = defaultPartSourcing(); }
    if (hasPriceList(it)) { it.priceList = []; it.priceListSeeded = true; }
  }
  // Un articolo che c'è già si modifica su una copia, e la copia entra solo se
  // la riga arriva in fondo senza errori (dalla 0.105.5): prima una riga
  // segnalata come errore restava applicata a metà. E un articolo già usato
  // tiene codice, famiglia, codifica, unità e — per chi non amministra — il
  // nome, come nella sua scheda: l'import li scavalcava.
  const orig = isNew ? null : it;
  if (!isNew) it = JSON.parse(JSON.stringify(orig));
  const lock = isNew ? { structLocked: false, nameLocked: false } : itemLockState(orig);

  // ── Descrizione ──
  if (type === 'parte') {
    const cn = catCell(row, 'Concetto *');
    const descr = catCell(row, 'Descrizione');
    if (isNew && !cn) { err('concetto mancante'); return; }
    if (cn === '') { err('il concetto non può restare vuoto'); return; }
    if (cn !== null && cn !== '') {
      const c = conceptList().find(x => (x.name || '').toUpperCase() === cn.toUpperCase());
      // Il concetto non si crea dall'import: finisce dentro il nome della parte
      // e da lì in poi è congelato, quindi un refuso resterebbe per sempre.
      if (!c) { err(`concetto "${esc(cn)}" non in elenco — vedi foglio Liste, colonna Concetti`); return; }
      it.conceptId = c.id;
    }
    if (descr !== null) it.nameFree = descr;
    it.name = composePartName(it.conceptId, it.nameFree);
  } else {
    const nome = catCell(row, 'Descrizione *');
    if (isNew && !nome) { err('descrizione mancante'); return; }
    if (nome !== null && nome !== '') it.name = nome;
    else if (nome === '') { err('la descrizione non può restare vuota'); return; }
  }

  // ── U.M. e doppia unità (prima del prezzo: la conversione dipende da qui) ──
  const conversionePrima = [it.uom || '', altUomOf(it) || '', altFactorOf(it)].join('|');
  const um = catCell(row, 'UM *');
  if (um) it.uom = catEnsureUom(um, ctx);
  else if (isNew) it.uom = defaultUom();
  if (hasPriceList(it)) {
    const au = catCell(row, 'UM acquisto');
    const afRaw = catNum(row, 'Fattore');
    if (au !== null || afRaw !== null) {
      const au2 = au === null ? altUomOf(it) : au;
      const af = afRaw === null || afRaw === '' ? altFactorOf(it) : afRaw;
      if (au2 && !isNaN(af) && af > 0 && au2 !== it.uom) { it.altUom = catEnsureUom(au2, ctx); it.altFactor = af; }
      else {
        // Togliere la doppia unità è legittimo — si svuotano le due celle — ma
        // arrivarci per un refuso no: "5,5 kg" o "circa 8" nel Fattore davano
        // NaN e cadevano qui dentro, e l'articolo perdeva la conversione
        // d'acquisto in silenzio, col costo che cambiava senza traccia. Lo
        // stesso isNaN, venti righe più giù, produce un errore di riga.
        const scritto = afRaw !== null && afRaw !== '' && isNaN(af);
        if (scritto) {
          err(`"Fattore" non è un numero: la doppia unità di ${esc(it.code || '')} è stata lasciata com'era`);
        } else {
          delete it.altUom; delete it.altFactor;
        }
      }
    }
  }
  // Cambiata la conversione, il costo della quotazione in uso va ricalcolato
  // anche se la riga non porta un prezzo (dalla 0.105.3): restava al valore
  // vecchio, sbagliato del rapporto fra il fattore vecchio e il nuovo. Si
  // segna qui e si fa quando la riga entra.
  const conversioneDopo = () => [it.uom || '', altUomOf(it) || '', altFactorOf(it)].join('|');

  // ── Codifica gerarchica ──
  if (type === 'macchina') {
    const sigla = catCell(row, 'Sigla');
    if (sigla) {
      const s = sigla.toUpperCase();
      if (!/^[A-Z0-9]+$/.test(s)) { err('la sigla macchina ammette solo A-Z e 0-9'); return; }
      if (machineItems().some(m => m.sigla === s && m.id !== it.id)) { err(`sigla macchina "${esc(s)}" già in uso`); return; }
      it.sigla = s;
    }
    const nums = [['N° car. sigla gruppo', 'gCodeLen', 1, 10], ['Cifre progressivo S', 'incrDigitsS', 1, 6],
      ['Cifre numerazione', 'incrDigitsN', 1, 6]];
    for (const [h, campo, min, max] of nums) {
      const v = catNum(row, h);
      if (v === null || v === '') continue;
      if (isNaN(v) || v < min || v > max) { err(`${h}: valore non valido (ammessi ${min}-${max})`); return; }
      if (!isNew && Number(it[campo] || 0) !== Math.round(v)) {
        avviso(`schema di codifica cambiato: i codici dei gruppi già a catalogo su "${esc(it.code || it.name)}" non vengono rifatti`);
      }
      it[campo] = Math.round(v);
    }
    const gt = catCell(row, 'Tipo sigla gruppo');
    if (gt) {
      const k = Object.keys(CODE_TYPES).find(x => normHeader(x) === normHeader(gt) || normHeader(CODE_TYPES[x]) === normHeader(gt));
      if (!k) { err(`tipo sigla gruppo "${esc(gt)}" sconosciuto — vedi foglio Liste`); return; }
      it.gCodeType = k;
    }
  } else if (type !== 'acquistato' && type !== 'materiale') {
    const macCode = catCell(row, type === 'gruppo' ? 'Codice macchina *' : 'Codice macchina');
    if (macCode) {
      const mac = getItemByCode(macCode);
      if (!mac) { err(`macchina "${esc(macCode)}" non trovata — vedi foglio Liste, colonna Codice macchina`); return; }
      if (mac.type !== 'macchina') { err(`"${esc(macCode)}" è ${typeLabel(mac.type)}, non una macchina`); return; }
      it.machineItemId = mac.id;
    } else if (macCode === '') it.machineItemId = '';
    if (type === 'gruppo') {
      if (isNew && !it.machineItemId) { err('codice macchina mancante'); return; }
      const sigla = catCell(row, 'Sigla');
      if (sigla) {
        const s = sigla.toUpperCase();
        const sm = machineScheme(getItem(it.machineItemId));
        const e = validateCodeFormat(s, sm.gLen, sm.gType);
        if (e) { err(e); return; }
        if (groupItemsFor(it.machineItemId).some(g => g.sigla === s && g.id !== it.id)) {
          err(`sigla gruppo "${esc(s)}" già usata su questa macchina`); return;
        }
        it.sigla = s;
      }
    } else {
      const grpCode = catCell(row, 'Codice gruppo');
      if (grpCode) {
        const grp = getItemByCode(grpCode);
        if (!grp) { err(`gruppo "${esc(grpCode)}" non trovato — vedi foglio Liste, colonna Codice gruppo`); return; }
        if (grp.type !== 'gruppo') { err(`"${esc(grpCode)}" è ${typeLabel(grp.type)}, non un gruppo`); return; }
        if (it.machineItemId && grp.machineItemId !== it.machineItemId) {
          err(`il gruppo "${esc(grpCode)}" non appartiene alla macchina indicata`); return;
        }
        it.groupItemId = grp.id;
        if (!it.machineItemId) it.machineItemId = grp.machineItemId;
      } else if (grpCode === '') it.groupItemId = '';
    }
  }

  // ── Approvvigionamento, scorte, flag, note ──
  if (type === 'parte') {
    const so = catCell(row, 'Approvvigionamento');
    if (so) {
      const k = Object.keys(PART_SOURCING).find(x => normHeader(x) === normHeader(so) || normHeader(PART_SOURCING[x]) === normHeader(so));
      if (!k) { err(`approvvigionamento "${esc(so)}" sconosciuto — vedi foglio Liste`); return; }
      it.sourcing = k;
    }
  }
  if (hasStock(it)) {
    for (const [h, campo] of [['Scorta minima', 'safetyStock'], ['Lotto riordino', 'lotSize']]) {
      const v = catNum(row, h);
      if (v === null) continue;
      if (v === '') { it[campo] = null; continue; }   // vuoto = non impostato, non zero
      if (isNaN(v) || v < 0) { err(`${h}: valore non valido`); return; }
      it[campo] = v;
    }
  }
  if (canFavorite(type)) { const f = catBool(row, 'Preferito'); if (f !== null) it.favorite = f; }
  if (usesFamily(type)) { const ob = catBool(row, 'Obsoleto'); if (ob !== null) it.obsolete = ob; }
  const note = catCell(row, 'Note');
  if (note !== null) it.notes = note;

  // ── Famiglia ── (dopo i controlli: una riga sbagliata non crea famiglie)
  if (usesFamily(type)) {
    const famRaw = catCell(row, 'Macrofamiglia');
    const subRaw = catCell(row, 'Sottofamiglia');
    const famL = catFamLeggi(famRaw), subL = catFamLeggi(subRaw);
    const fam = famRaw === null ? null : famL.nome;
    const sub = subRaw === null ? null : subL.nome;
    if ((fam !== null || sub !== null) && !lock.structLocked) {
      if (fam) {
        const f = findOrCreateFamily(fam, sub || '', type, rep, famL.sigla, subL.sigla);
        it.familyId = f.familyId; it.subFamilyId = f.subFamilyId;
      } else if (fam === '') { it.familyId = ''; it.subFamilyId = ''; }
    } else if (fam && lock.structLocked) {
      const attuale = (db.families || []).find(f => f.id === it.familyId);
      if (!attuale || String(attuale.name || '').toLowerCase() !== String(fam).trim().toLowerCase()) it.__famigliaDiversa = true;
    }
  }

  // ── Codice ──
  // Lo stesso codice scritto in un altro modo (minuscole) non lo rinomina.
  if (code && !(orig && itemCodeKey(code) === itemCodeKey(orig.code))) it.code = code;
  else if (isNew) {
    const auto = genItemCode(it);
    if (!auto) {
      // codeGenError dice il motivo quando ce n'è uno preciso (la numerazione
      // esaurita); altrimenti manca un dato, e l'elenco lo spiega.
      err(codeGenError || (type === 'gruppo' || type === 'macchina'
        ? 'codice mancante e non generabile: serve la sigla (e la macchina) oppure un codice scritto a mano'
        : 'codice mancante e non generabile: servono macchina e gruppo, oppure la macrofamiglia, oppure un codice scritto a mano'));
      return;
    }
    if (getItemByCode(auto)) { err(`codice automatico "${esc(auto)}" già in uso`); return; }
    it.code = auto;
    ctx.seen.set(itemCodeKey(auto), ln);
  }

  // Il prezzo si controlla qui, prima che la riga entri: un prezzo sbagliato
  // scoperto dopo lasciava l'articolo già scritto, con un errore nel report.
  const prezzo = hasPriceList(it) ? catNum(row, 'Prezzo') : null;
  if (prezzo !== null && prezzo !== '' && (isNaN(prezzo) || prezzo < 0)) { err('prezzo non valido'); return; }

  if (!isNew) {
    const bloccati = [];
    const tieni = (campi, etichetta) => {
      if (campi.some(k => JSON.stringify(it[k] == null ? '' : it[k]) !== JSON.stringify(orig[k] == null ? '' : orig[k]))) bloccati.push(etichetta);
      campi.forEach(k => { if (k in orig) it[k] = orig[k]; else delete it[k]; });
    };
    if (lock.structLocked) {
      tieni(['code'], 'codice');
      if (it.__famigliaDiversa) bloccati.push('famiglia');
      tieni(['familyId', 'subFamilyId'], 'famiglia');
      tieni(['machineItemId', 'groupItemId', 'sigla'], 'codifica');
      tieni(['uom'], 'unità di misura');
    }
    if (lock.nameLocked) tieni(['name', 'conceptId', 'nameFree'], 'descrizione');
    delete it.__famigliaDiversa;
    if (bloccati.length) avviso(`${esc(orig.code || '')} è già usato: ${Array.from(new Set(bloccati)).join(', ')} restano com'erano`);
    const cambiaConversione = activePriceRow(orig) && conversionePrima !== conversioneDopo();
    Object.keys(orig).forEach(k => { if (!(k in it)) delete orig[k]; });
    Object.assign(orig, it);
    it = orig;
    if (cambiaConversione) {
      const s = catStage(ctx, it);
      if (!s.inline) s.inline = activePriceRow(it);
    }
  }
  delete it.__famigliaDiversa;

  if (isNew) {
    stampNew(it);
    db.items.push(it);
    codeIndexAdd(it);
    rep.nuoviCodici.push(it.code);
    st.created++;
    if (rep.preview.length < 20) rep.preview.push(`${it.code} — ${it.name}`);
  } else { touch(it); st.updated++; }

  // ── Quotazione sulla riga articolo ──
  if (hasPriceList(it)) {
    if (prezzo !== null && prezzo !== '') {
      // Lo stato si fotografa PRIMA di toccare il listino: catStage registra
      // se l'articolo aveva già quotazioni, e dopo la creazione sarebbe tardi.
      const s = catStage(ctx, it);
      const q = catUpsertQuote(it, row, ctx, foglio, ln, prezzo);
      // «In uso» = Sì la mette in uso; vuoto o No la aggiunge soltanto. Senza
      // la colonna (i file di prima della 0.117.0) la riga era per definizione
      // la quotazione in uso, e tale resta.
      const inUso = catBool(row, 'In uso');
      if (q && (inUso === true || (inUso === null && catCell(row, 'In uso') === null))) s.inline = q;
      else if (inUso === true) avviso(`${esc(it.code)}: «In uso» è Sì, ma la quotazione non è entrata: resta in uso quella di prima`);
    }
  }
}
function catEnsureUom(code, ctx) {
  const c = String(code || '').trim();
  if (c && !uomList().some(u => u.code === c) && ctx.rep.createdUoms.indexOf(c) < 0) ctx.rep.createdUoms.push(c);
  return ensureUom(c);
}
function catStage(ctx, it) {
  let s = ctx.touched.get(it.id);
  // `aveva` fotografa la situazione PRIMA di questo import: serve a non
  // attivare da soli una quotazione su un articolo che ne aveva già e che
  // qualcuno aveva deliberatamente lasciato senza prezzo in uso.
  if (!s) { s = { it, inline: null, aveva: priceRows(it).length > 0 }; ctx.touched.set(it.id, s); }
  return s;
}
// La quotazione della riga (dalla 0.117.0). Identità = (articolo, fornitore,
// data): l'id non sta nel foglio — un uuid fra le mani di chi compila è solo
// rumore. Le regole:
//   · per lo stesso fornitore entra solo una data PIÙ RECENTE di tutte le sue
//     quotazioni già a listino; una data più vecchia non entra, e lo si dice;
//   · la stessa data è la stessa quotazione: uguale, non succede niente (è il
//     file esportato e ricaricato); diversa, non si sovrascrive — un prezzo
//     cambiato è una quotazione nuova, con la sua data;
//   · non si cancella mai niente.
// Restituisce la quotazione della riga (nuova o già presente), o null.
function catUpsertQuote(it, row, ctx, foglio, ln, prezzo) {
  const rep = ctx.rep;
  const avviso = m => rep.warnings.push(`${foglio}, riga ${ln}: ${m}`);
  const supName = catCell(row, 'Fornitore');
  const supplierId = supName ? findOrCreateSupplier(supName, rep) : (supName === '' ? null : undefined);
  const dataCella = catCell(row, 'Data prezzo');
  const data = catDate(row, 'Data prezzo') || catToday();
  // Ripiegare su oggi va bene per una cella vuota, non per una cella scritta
  // male: la data è l'identità della quotazione, e sostituirla di nascosto
  // significa creare una riga nuova al posto di aggiornarne una.
  if (dataCella && !catDate(row, 'Data prezzo')) {
    avviso(`data "${esc(String(dataCella))}" non riconosciuta, si usa oggi (${data})`);
  }
  if (!Array.isArray(it.priceList)) it.priceList = [];
  // Colonna Fornitore assente: il foglio non dice niente sul fornitore, e «una
  // colonna cancellata lascia il campo com'è». Si prende quello della
  // quotazione in uso, o nessuno.
  const sid = supplierId === undefined ? ((activePriceRow(it) || {}).supplierId || null) : supplierId;
  const suoi = it.priceList.filter(x => (x.supplierId || null) === sid);
  const chi = sid ? `di ${esc(catSupplierName(sid))}` : 'senza fornitore';

  // La quotazione come la vuole la riga, su una copia.
  const r = { supplierId: sid, price: prezzo, priceUom: undefined, minQty: '', leadDays: '', code: '', desc: '', note: '' };
  const pu = catCell(row, 'UM prezzo');
  if (pu) {
    // Solo l'unità di acquisto dell'articolo converte davvero (priceUomOf):
    // qualunque altra verrebbe ignorata in silenzio, e il silenzio qui è un
    // prezzo giusto nell'unità sbagliata. L'unità di gestione vuol dire
    // «prezzo nella mia unità».
    if (pu === altUomOf(it)) r.priceUom = pu;
    else if (pu !== it.uom) avviso(`"UM prezzo" ${esc(pu)} non è l'unità di acquisto di ${esc(it.code)}: ignorata`);
  }
  for (const [h, campo] of [['Q.tà min', 'minQty'], ['GG consegna', 'leadDays']]) {
    const v = catNum(row, h);
    if (v !== null) r[campo] = v === '' || isNaN(v) ? '' : v;
  }
  const sc = catCell(row, 'Codice fornitore'); if (sc !== null) r.code = sc;
  const sd = catCell(row, 'Descrizione fornitore'); if (sd !== null) r.desc = sd;
  // «Note» è già la nota dell'articolo: quella della quotazione è «Note prezzo».
  const nt = catCell(row, 'Note prezzo'); if (nt !== null) r.note = nt;

  const stessa = suoi.find(x => (x.date || '') === data);
  if (stessa) {
    const n = v => (v === '' || v == null ? '' : String(v));
    const uguale = Number(stessa.price) === Number(prezzo) && n(stessa.priceUom) === n(r.priceUom) &&
      n(stessa.minQty) === n(r.minQty) && n(stessa.leadDays) === n(r.leadDays) &&
      (sc === null || n(stessa.code) === n(r.code)) && (sd === null || n(stessa.desc) === n(r.desc)) &&
      (nt === null || n(stessa.note) === n(r.note));
    if (!uguale) avviso(`${esc(it.code)}: c'è già una quotazione ${chi} del ${data}, diversa: non aggiornata. Per un prezzo nuovo serve una data più recente.`);
    return stessa;
  }
  const ultima = suoi.reduce((m, x) => ((x.date || '') > m ? x.date : m), '');
  if (ultima && data < ultima) {
    avviso(`${esc(it.code)}: quotazione ${chi} del ${data} non importata, a listino ce n'è una più recente (${ultima})`);
    return null;
  }
  const nuova = stampNew({ id: gid(), supplierId: sid, price: prezzo, minQty: r.minQty, leadDays: r.leadDays,
    code: r.code, desc: r.desc, date: data, rfqId: null, note: r.note });
  if (r.priceUom) nuova.priceUom = r.priceUom;
  it.priceList.push(nuova);
  return nuova;
}
// ─── Fase C: quale quotazione va in uso ───
function catFinalizePrices(ctx) {
  ctx.touched.forEach(s => {
    const it = s.it;
    let riga = s.inline;
    // Ripiego per l'articolo che non ne aveva nessuna: una sola quotazione e
    // nessuno che dica quale usare vuol dire quella.
    if (!riga && !s.aveva && priceRows(it).length === 1) riga = priceRows(it)[0];
    if (!riga) return;
    applyPriceRow(it, riga);
    touch(it);
    // Su una parte prodotta in casa il costo viene dal ciclo: la quotazione
    // entra a listino ma non muove il costo, e tacerlo sembrerebbe un bug.
    if (!costField(it)) {
      ctx.rep.warnings.push(`${esc(it.code)}: la parte è a produzione interna, il prezzo è registrato a listino ma non diventa costo`);
    }
  });
}
// ─── File nel formato precedente (foglio unico con colonna Tipo) ───
// Non è una seconda implementazione: è solo un'altra mappatura di colonne sopra
// lo stesso applicatore di riga, così i file già in giro ereditano gratis la
// regola nuova — prezzo e fornitore diventano una quotazione a listino. Le
// intestazioni di allora (Nome, UM, UMAcquisto, PrezzoAcquisto) sono già fra gli
// alias di CAT_ALIAS: l'unica che cambia significato è CostoUnitario.
function catLegacySheets(byName, ctx) {
  const primo = Object.keys(byName || {}).find(n => Array.isArray(byName[n]) && byName[n].length);
  if (!primo) return;
  ctx.rep.legacy = true;
  const st = catStat();
  let altri = 0;
  byName[primo].forEach((row, i) => {
    const ln = i + 2;
    const tipoRaw = pick(row, 'Tipo', 'Type');
    const type = resolveType(tipoRaw);
    if (!type) {
      if (Object.values(row).some(v => String(v == null ? '' : v).trim())) {
        ctx.rep.errors.push(`${esc(primo)}, riga ${ln}: tipo non valido ("${esc(tipoRaw)}")`);
      } else st.skipped++;
      return;
    }
    // Le righe dell'altro mestiere non sono un errore: il foglio unico di prima
    // li teneva insieme. Si saltano, e si dice da quale pulsante caricarle —
    // una riga d'avviso, non cinquecento righe rosse.
    if (!CATALOG_SHEET_DEFS[ctx.scope].some(d => d.type === type)) { altri++; st.skipped++; return; }
    const riga = Object.assign({}, row);
    // Il vecchio foglio chiamava "CostoUnitario" il prezzo delle materie prime
    if ((type === 'materiale' || type === 'parte') && pick(row, 'CostoUnitario', 'Costo') !== '') {
      riga['Prezzo'] = pick(row, 'CostoUnitario', 'Costo');
    }
    catApplyItemRow(riga, { name: esc(primo), type }, ctx, ln, st);   // i messaggi del report sono HTML già escapato
  });
  if (altri) {
    const altro = ctx.scope === 'buy' ? 'Progetto' : 'Acquisti';
    ctx.rep.warnings.push(`${esc(primo)}: ${altri} righe sono di tipi che appartengono al file ${altro} — ricarica lo stesso file dal pulsante ${altro}.`);
  }
  ctx.rep.sheets.push(Object.assign({ name: primo + ' (formato precedente)' }, st));
}

// ═══════════════════════════════════════════════════════════
//  INTERFACCIA
// ═══════════════════════════════════════════════════════════
function onCatalogFile(ev, scope, dryRun) {
  const file = ev.target.files[0]; ev.target.value = '';
  if (!file) return;
  if (!roleGuard('catalog')) return;
  readWorkbook(file, byName => {
    window.__lastCatalogImport = { scope: catScopeOf(scope), byName };
    catRunImport(!!dryRun);
  });
}
function catRunImport(dryRun) {
  const pending = window.__lastCatalogImport;
  if (!pending) { showToast('Nessun file da importare', 'error'); return; }
  if (!roleGuard('catalog')) return;
  if (!dryRun && cloudCondiviso()) return catImportaImpegnando(pending);
  let rep;
  try {
    rep = importCatalogSheets(pending.byName, pending.scope, { dryRun });
  } catch (e) {
    console.error(e);
    showToast('Import non riuscito: ' + e.message, 'error');
    return;
  }
  showCatalogReport(rep);
}
// Con l'archivio condiviso i codici nuovi si impegnano sul server prima di
// scrivere: una prova a vuoto dice quali sarebbero, il server dice quali sono
// già di un collega, e si riprova finché non ne resta nessuno conteso. I codici
// automatici si ricalcolano da soli (codicePresoAltrove), quelli scritti nel
// foglio diventano errori della loro riga. Intanto i giri di sincronizzazione
// aspettano: un articolo arrivato fra la prova e l'import vero cambierebbe i
// codici automatici rispetto a quelli impegnati.
async function catImportaImpegnando(pending) {
  _cloud.pausa++;
  // Tutto ciò che si è impegnato strada facendo: alla fine quello che l'import
  // non ha usato torna libero, o resterebbe un buco nella codifica.
  const impegnati = new Set();
  let usati = [];
  try {
    for (let giro = 0; giro < 6; giro++) {
      const prova = importCatalogSheets(pending.byName, pending.scope, { dryRun: true });
      const presi = prova.nuoviCodici.length ? await cloudImpegnaCodici(prova.nuoviCodici.map(codice => ({ codice }))) : [];
      const rifiutati = new Set(presi.map(itemCodeKey));
      prova.nuoviCodici.forEach(c => { if (!rifiutati.has(itemCodeKey(c))) impegnati.add(c); });
      if (presi.length) continue;
      const rep = importCatalogSheets(pending.byName, pending.scope, {});
      usati = rep.nuoviCodici;
      showCatalogReport(rep);
      return rep;
    }
    showToast('I codici continuano a essere presi da qualcun altro: riprova fra poco', 'error');
  } catch (e) {
    if (e && e.cloud) cloudErroreRiserva(e, 'i codici degli articoli');
    else { console.error(e); showToast('Import non riuscito: ' + e.message, 'error'); }
  } finally {
    _cloud.pausa--;
    const tenuti = new Set(usati.map(itemCodeKey));
    await cloudLiberaCodici([...impegnati].filter(c => !tenuti.has(itemCodeKey(c))));
  }
  return null;
}
// «Saltate», non «vuote»: in `skipped` finiscono tre cose diverse — la riga
// davvero vuota, quella senza un tipo riconoscibile e quella che appartiene
// all'altro ambito. Chiamarle tutte «vuote» faceva dire al report «312 righe
// vuote» di un file pieno, e chi legge conclude che il file è sbagliato quando
// invece l'import ha fatto esattamente il suo mestiere. Quante siano del terzo
// tipo lo dice già l'avviso aggregato, che nomina anche il pulsante giusto.
function showCatalogReport(rep) {
  const tot = rep.sheets.reduce((a, s) => ({ c: a.c + s.created, u: a.u + s.updated }), { c: 0, u: 0 });
  const cards = [['Creati', tot.c], ['Aggiornati', tot.u], ['Avvisi', rep.warnings.length], ['Errori', rep.errors.length]]
    .map(([l, v]) => `<div class="kpi-card ${(l === 'Errori' || l === 'Avvisi') && v ? 'orange' : ''}"><div class="kpi-value">${v}</div><div class="kpi-label">${l}</div></div>`).join('');
  const righe = rep.sheets.map(s => `<div class="mgmt-item">
      <span class="mgmt-item-name">${esc(s.name)}</span>
      <span class="mgmt-item-meta">${s.created} creati · ${s.updated} aggiornati · ${s.skipped} righe saltate</span>
    </div>`).join('') || '<div class="empty-text">Nessun foglio riconosciuto.</div>';
  const note = [];
  if (rep.foreign.length) {
    const altro = rep.scope === 'buy' ? 'Progetto' : 'Acquisti';
    note.push(`<strong style="color:var(--red)">Questo sembra il file ${altro}</strong> (contiene ${esc(rep.foreign.join(', '))}): caricalo dal pulsante ${altro}.`);
  }
  if (rep.legacy) note.push('File nel <strong>formato precedente</strong> (foglio unico con colonna Tipo), letto in compatibilità.');
  if (rep.missing.length) note.push('Fogli assenti dal file, saltati: ' + esc(rep.missing.join(', ')) + '.');
  const auto = [];
  if (rep.createdSuppliers) auto.push(`${rep.createdSuppliers} fornitori`);
  if (rep.createdFamilies) auto.push(`${rep.createdFamilies} famiglie`);
  if (rep.createdSubFamilies) auto.push(`${rep.createdSubFamilies} sottofamiglie`);
  if (auto.length) note.push('Creati automaticamente: ' + auto.join(', ') + '.');
  if (rep.createdUoms.length) note.push(`<strong>Unità di misura nuove</strong>: ${esc(rep.createdUoms.join(', '))} — se è un refuso, correggilo in Gestione → Unità di misura.`);
  // Le voci arrivano già escapate da chi le scrive — è la convenzione di tutti
  // gli errori e avvisi del repo, e va rispettata a monte: qui si stampa in
  // innerHTML, e escapare una seconda volta mostrerebbe "&lt;" al posto di "<".
  const blocco = (titolo, voci, colore) => voci.length
    ? `<div style="margin-top:12px"><strong style="color:${colore}">${titolo} (${voci.length}):</strong>
        <div class="picker-results" style="max-height:200px;margin-top:6px">${voci.map(e => `<div class="picker-row">${e}</div>`).join('')}</div></div>` : '';
  const anteprima = rep.dryRun && rep.preview.length
    ? `<div style="margin-top:12px"><strong>Articoli che verrebbero creati</strong> (primi ${rep.preview.length}):
        <div class="picker-results" style="max-height:160px;margin-top:6px">${rep.preview.map(p => `<div class="picker-row" style="font-family:var(--mono)">${esc(p)}</div>`).join('')}</div></div>`
    : '';
  const azioni = rep.dryRun
    ? `<button class="btn-ghost" onclick="closeModal()">Chiudi</button>
       <button class="add-btn-sm" onclick="catRunImport(false)">${ico('upload', 'tinted', '')} Importa davvero</button>`
    : `<button class="add-btn-sm" onclick="closeCatalogReport()">Chiudi</button>`;
  openModal(`<h3>${rep.dryRun ? ico('search', 'tinted pill', '') + ' Verifica' : ico('list', 'tinted pill', '') + ' Esito import'} — Articoli ${esc(CAT_SCOPE_LABEL[rep.scope])}</h3>
    ${rep.dryRun ? '<p class="empty-text" style="text-align:left;padding:0 0 10px"><strong>Nessun dato è stato modificato.</strong> Questa è una prova: correggi il foglio e riprova, oppure procedi.</p>' : ''}
    <div class="cost-summary">${cards}</div>
    <div class="mgmt-list" style="margin-top:12px">${righe}</div>
    ${note.map(n => `<p class="empty-text" style="text-align:left;padding:6px 0">${n}</p>`).join('')}
    ${anteprima}
    ${blocco('Righe con problemi', rep.errors, 'var(--red)')}
    ${blocco('Avvisi', rep.warnings, 'var(--orange, #d98a3a)')}
    ${!rep.errors.length && !rep.warnings.length ? `<p class="empty-text" style="padding:8px 0">Nessun errore. ${ico('check', 'tinted', '')}</p>` : ''}
    <div class="modal-actions">${azioni}</div>`);
}
function closeCatalogReport() {
  closeModal();
  window.__lastCatalogImport = null;
  renderManage();
  showToast('Import completato');
}
