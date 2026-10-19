// ═══════════════════════════════════════════════════════════
//  BOMTRACK — import-export.js
// ═══════════════════════════════════════════════════════════
// Import massivo da Excel, backup JSON e avvio dell'applicazione.
// L'avvio (init) sta in fondo all'ultimo script caricato: quando parte, tutte
// le funzioni degli altri file esistono già.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  IMPORT MASSIVO DA EXCEL (Articoli e Distinte)
// ═══════════════════════════════════════════════════════════
function catalogImportBlock(scope) {
  const buy = scope === 'buy';
  const id = 'imp-cat-' + scope;
  return `<div>
      <strong>${buy ? ico('cart', 'tinted', '') + ' Articoli — Acquisti' : ico('tree', 'tinted', '') + ' Articoli — Progetto'}</strong>
      <p>${buy
    ? 'Commerciali e materie prime, <b>un foglio per tipo</b>: <span style="font-family:var(--mono)">Commerciali, Materie prime, Listino</span>. Fornitore e prezzo entrano come <b>quotazione nel listino</b> dell\'articolo e diventano il prezzo in uso.'
    : 'Macchine, gruppi, sottogruppi e parti, <b>un foglio per tipo</b>. I fogli si applicano in ordine, così un gruppo può puntare a una macchina definita nello stesso file: si caricano sigle, appartenenze e schema di codifica. <b>La distinta base non è in questo file</b>: si carica qui sotto.'}</p>
      <p>Il file esportato <b>è anche il template</b>. Contiene un foglio <b>Liste</b> con tutti i valori ammessi e un foglio <b>Istruzioni</b>. Il <b>Codice</b> è la chiave: se esiste l'articolo viene aggiornato, se è vuoto viene generato. L'import non elimina mai niente.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <button class="btn-outline" onclick="exportCatalogXlsx('${scope}')">${ico('download', 'tinted', '')} Esporta ${buy ? 'Acquisti' : 'Progetto'}</button>
        <button class="btn-outline" onclick="document.getElementById('${id}-check').click()">${ico('search', 'tinted', '')} Verifica un file</button>
        <input type="file" id="${id}-check" accept=".xlsx,.xls" style="display:none" onchange="onCatalogFile(event,'${scope}',true)">
        <button class="add-btn-sm" onclick="document.getElementById('${id}-file').click()">${ico('upload', 'tinted', '')} Carica ${buy ? 'Acquisti' : 'Progetto'}</button>
        <input type="file" id="${id}-file" accept=".xlsx,.xls" style="display:none" onchange="onCatalogFile(event,'${scope}',false)">
      </div>
    </div>`;
}
function renderImport() {
  return `<div class="cloud-section" style="flex-direction:column;align-items:stretch;gap:18px">
    ${catalogImportBlock('buy')}
    <div style="border-top:1px solid var(--border, #2a2a2a);padding-top:16px">
      ${catalogImportBlock('design')}
    </div>
    <div style="border-top:1px solid var(--border, #2a2a2a);padding-top:16px">
      <strong>${ico('tree', 'tinted', '')} Import Distinte</strong>
      <p>Carica un foglio Excel con le relazioni <b>padre-figlio</b> per costruire le distinte. Gli articoli (padri e figli) devono già esistere in catalogo — importali prima con i due file qui sopra. Per ogni padre presente nel file i componenti vengono <b>sostituiti</b> (reimport idempotente); le lavorazioni non vengono toccate. Colonne: <span style="font-family:var(--mono)">CodicePadre, CodiceFiglio, Qta, Scarto%</span>.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <button class="btn-outline" onclick="downloadBomTemplate()">${ico('download', 'tinted', '')} Scarica template Distinte</button>
        <button class="add-btn-sm" onclick="document.getElementById('imp-bom-file').click()">${ico('upload', 'tinted', '')} Carica file Distinte</button>
        <input type="file" id="imp-bom-file" accept=".xlsx,.xls,.csv" style="display:none" onchange="onImportBom(event)">
      </div>
    </div>
    <div style="border-top:1px solid var(--border, #2a2a2a);padding-top:16px">
      <strong>${ico('settings', 'tinted', '')} Impostazioni di Gestione</strong>
      <p>Porta via e rimetti tutto ciò che si configura qui dentro, in <b>un foglio per scheda</b>: <span style="font-family:var(--mono)">Azienda, Utenti, Fornitori, Condizioni offerta, Famiglie commerciali, Famiglie materie prime, Famiglie parti, Concetti, Centri di lavoro, Unità di misura, Impostazioni</span>. Il file esportato <b>è anche il template</b>: si esporta, si modifica, si ricarica — comodo per allestire una postazione nuova senza rifare le anagrafiche a mano.</p>
      <p>L'import è <b>additivo</b>: aggiorna ciò che riconosce, crea ciò che manca, <b>non cancella niente</b>. Un foglio assente viene saltato, quindi si può caricare anche una sola scheda. Le <b>password non sono nel file</b>: un utente creato dall'import nasce senza, e non accede finché non gliene imposti una.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <button class="btn-outline" onclick="exportSettingsXlsx()">${ico('download', 'tinted', '')} Esporta impostazioni</button>
        <button class="add-btn-sm" onclick="document.getElementById('imp-settings-file').click()">${ico('upload', 'tinted', '')} Carica impostazioni</button>
        <input type="file" id="imp-settings-file" accept=".xlsx,.xls" style="display:none" onchange="onImportSettings(event)">
      </div>
    </div></div>`;
}

// ─── Lettura foglio Excel → array di oggetti riga ───
// ─── La codifica di un .csv ───
// I fogli veri (.xlsx) portano la codifica dentro di sé. I .csv no, e arrivano
// in tre forme: la CP1252 di Excel italiano e l'UTF-8 **con BOM** (il «CSV
// UTF-8» del menu di salvataggio) SheetJS le riconosce da sé. Resta fuori
// l'UTF-8 nudo — quello che scrive un editor di testo, o un gestionale che non
// gira su Windows — che senza BOM viene letto come CP1252: «Perché» diventa
// «PerchÃ©», e l'articolo entra a catalogo con la descrizione storpiata.
//
// Riconoscerlo è una domanda sola: i byte sono UTF-8 valido, e c'è almeno un
// carattere multibyte? In CP1252 quelle sequenze non si formano quasi mai per
// caso — «é » è 0xE9 0x20, che in UTF-8 non è una sequenza valida — quindi la
// risposta affermativa è quasi sempre giusta, e quando sbaglia sbaglia su un
// file che sarebbe stato illeggibile comunque.
function utf8Nudo(b) {
  let multibyte = false;
  for (let i = 0; i < b.length;) {
    const c = b[i];
    if (c < 0x80) { i++; continue; }
    const n = c >= 0xF0 ? 3 : c >= 0xE0 ? 2 : c >= 0xC2 ? 1 : -1;
    if (n < 0 || i + n >= b.length) return false;
    for (let k = 1; k <= n; k++) if ((b[i + k] & 0xC0) !== 0x80) return false;
    multibyte = true;
    i += n + 1;
  }
  return multibyte;   // tutto ASCII: non c'è niente da decidere
}
function opzioniLettura(file, bytes) {
  const opt = { type: 'array' };
  if (!/\.csv$/i.test((file && file.name) || '')) return opt;
  const bom = bytes.length > 2 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF;
  if (!bom && utf8Nudo(bytes)) opt.codepage = 65001;
  return opt;
}
// ─── Leggere un file Excel ───
// Le due porte d'ingresso differivano di tre righe — un foglio solo o tutti — e
// ripetevano identiche l'apertura, la gestione dell'errore di lettura e quella
// del file illeggibile. Ora la parte comune sta qui e `estrai` dice cosa
// tirarne fuori: chi ne aggiunge una terza non ricopia anche i due messaggi.
function leggiFile(file, estrai, cb) {
  if (!requireXlsx()) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const bytes = new Uint8Array(reader.result);
      cb(estrai(XLSX.read(bytes, opzioniLettura(file, bytes))));
    } catch (e) { console.error(e); showToast('File non valido', 'error'); }
  };
  // Un file illeggibile (disco rimosso, permessi) non deve restare in silenzio
  reader.onerror = () => { console.error(reader.error); showToast('Impossibile leggere il file', 'error'); };
  reader.readAsArrayBuffer(file);
}
// Il primo foglio, come array di righe.
function readSheet(file, cb) {
  leggiFile(file, wb => {
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error('foglio vuoto');
    return XLSX.utils.sheet_to_json(ws, { defval: '' });
  }, cb);
}
// Normalizza un'intestazione: minuscolo, senza spazi/accenti/punteggiatura
function normHeader(s) {
  return String(s == null ? '' : s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
// Legge il primo valore non vuoto tra più nomi colonna alternativi (tollerante a varianti)
function pick(row, ...names) {
  const wanted = names.map(normHeader);
  for (const k of Object.keys(row)) {
    if (wanted.includes(normHeader(k))) {
      const v = row[k];
      if (v !== '' && v != null) return v;
    }
  }
  return '';
}
// Delega a catNumOf (import-catalog.js, caricato prima di questo file): faceva
// `parseFloat(v.replace(',', '.'))`, che su "1.234,56" si ferma al punto delle
// migliaia e restituisce 1,234 — un prezzo plausibile, e falso. Il parser giusto
// era già scritto e commentato là, per lo stesso difetto; mancava solo di
// usarlo anche qui. `def` resta il valore di ripiego, che catNumOf non ha.
function numOr(v, def) { const n = catNumOf(v); return isNaN(n) ? def : n; }

// Mappa un valore "Tipo" (label IT o chiave interna) al tipo articolo canonico
function resolveType(raw) {
  const n = normHeader(raw);
  if (!n) return '';
  for (const t of ALL_TYPES) {
    if (normHeader(t) === n || normHeader(TYPE_LABELS[t]) === n || normHeader(TYPE_SHORTS[t]) === n) return t;
  }
  // Sinonimi. `componentecommerciale` non è un vezzo: è la dicitura che scrive
  // il template scaricabile qui sotto, e fino alla 0.21.0 l'import rifiutava le
  // righe del proprio esempio. `materieprime` è il plurale che si usa davvero.
  if (n === 'materiaprima' || n === 'materiaprime' || n === 'materieprime' || n === 'mp') return 'materiale';
  if (n === 'commerciale' || n === 'commerciali' || n === 'comm'
    || n === 'componentecommerciale' || n === 'componenticommerciali') return 'acquistato';
  return '';
}
// Trova (o crea) un fornitore per nome
// ─── Fornitori e famiglie per nome, durante un import (B1) ───
// Erano una ricerca lineare per riga: su un foglio da 5.000 righe con
// centinaia di fornitori, milioni di confronti. Un indice per nome, con la
// stessa regola di codeIndex(): vale finché l'array è lo stesso e non ha
// cambiato lunghezza, e chi crea un record durante l'import ce lo aggiunge a
// mano — altrimenti ogni creazione lo farebbe ricostruire da capo. Vince il
// primo, come faceva il `.find()` che sostituisce.
const _nomeIdx = { arr: null, len: -1, map: null };
const _famNomeIdx = { arr: null, len: -1, map: null };
function indiceNomi(cache, arr, chiave) {
  if (cache.map && cache.arr === arr && cache.len === arr.length) return cache.map;
  const m = new Map();
  arr.forEach(x => { const k = chiave(x); if (!m.has(k)) m.set(k, x); });
  cache.arr = arr; cache.len = arr.length; cache.map = m;
  return m;
}
function aggiungiANomi(cache, arr, chiave, x) {
  if (!cache.map || cache.arr !== arr) return;
  const k = chiave(x);
  if (!cache.map.has(k)) cache.map.set(k, x);
  cache.len = arr.length;
}
// Azzerati da invalidateCaches(), a ogni salvataggio, come gli indici di
// core.js: un fornitore rinominato in Gestione non cambia la lunghezza
// dell'elenco, e un indice tenuto da un import all'altro lo cercherebbe ancora
// col nome vecchio.
function invalidateNomiImport() { _nomeIdx.map = null; _famNomeIdx.map = null; }
const chiaveFornitore = x => String((x && x.name) || '').toLowerCase();
const chiaveFamiglia = x => String((x && x.name) || '').toLowerCase() + '\u0000' + ((x && x.kind) || 'acquistato');
function findOrCreateSupplier(name, report) {
  const n = String(name).trim(); if (!n) return '';
  let s = indiceNomi(_nomeIdx, db.suppliers, chiaveFornitore).get(n.toLowerCase());
  if (!s) {
    s = stampNew({ id: gid(), name: n, referente: '', email: '', active: true });
    db.suppliers.push(s); report.createdSuppliers++;
    aggiungiANomi(_nomeIdx, db.suppliers, chiaveFornitore, s);
  }
  return s.id;
}
// Le sigle già occupate nel campo di gara di chi sta per nascere: l'ambito per
// una macrofamiglia, la famiglia che la contiene per una sottofamiglia.
function sigleFamiglia(kind) {
  return new Set((db.families || [])
    .filter(f => (f.kind || 'acquistato') === kind)
    .map(f => siglaKey(f.sigla || siglaFromName(f.name))));
}
function sigleSottofamiglia(f) {
  return new Set(((f && f.subs) || []).map(s => siglaKey(s.sigla || siglaFromName(s.name))));
}
// Qui non c'è nessuno a cui chiedere: se la sigla collide ci si scosta alla
// prima libera, ma lo si dichiara nel report — dai codici ci si accorgerebbe
// troppo tardi. `avvisa` è il canale avvisi del report, quando c'è.
function siglaImport(nome, proposta, prese, avvisa, cosa) {
  const voluta = siglaKey(proposta) || siglaFromName(nome);
  const sigla = siglaLibera(nome, voluta, prese);
  if (sigla !== voluta && avvisa) {
    // `nome` è testo di una cella, e i blocchi che stampano il report lo
    // mettono in innerHTML: senza esc() una macrofamiglia chiamata come un tag
    // eseguirebbe. Tutti gli altri avvisi del repo passano già di qui.
    avvisa(`${esc(cosa)} "${esc(nome)}": sigla ${esc(voluta)} già in uso, assegnata ${esc(sigla)}`);
  }
  return sigla;
}
// Trova (o crea) famiglia e sottofamiglia per nome, coerenti col tipo
function findOrCreateFamily(famName, subName, type, report) {
  const fn = String(famName).trim();
  const result = { familyId: '', subFamilyId: '' };
  if (!fn) return result;
  const kind = type;
  const avvisa = report && report.warnings ? (m => report.warnings.push(m)) : null;
  if (!db.families) db.families = [];
  let f = indiceNomi(_famNomeIdx, db.families, chiaveFamiglia).get(chiaveFamiglia({ name: fn, kind }));
  if (!f) {
    const sigla = siglaImport(fn, '', sigleFamiglia(kind), avvisa, 'Macrofamiglia');
    f = stampNew({ id: gid(), name: fn, kind, sigla, subs: [] }); db.families.push(f); report.createdFamilies++;
    aggiungiANomi(_famNomeIdx, db.families, chiaveFamiglia, f);
  }
  result.familyId = f.id;
  const sn = String(subName).trim();
  if (sn) {
    let s = (f.subs || []).find(x => x.name.toLowerCase() === sn.toLowerCase());
    if (!s) {
      const sigla = siglaImport(sn, '', sigleSottofamiglia(f), avvisa, 'Sottofamiglia');
      s = stampNew({ id: gid(), name: sn, sigla }); (f.subs = f.subs || []).push(s); report.createdSubFamilies++;
    }
    result.subFamilyId = s.id;
  }
  return result;
}

// ─── Import Distinte (righe padre-figlio) ───
function onImportBom(ev) {
  const file = ev.target.files[0]; ev.target.value = '';
  if (!file) return;
  readSheet(file, rows => { showImportReport(importBom(rows)); });
}
function findByCode(code) { return getItemByCode(code) || null; }
function importBom(rows) {
  const report = { added: 0, parents: 0, skipped: 0, restored: 0, errors: [] };
  // padre → la distinta che aveva prima. L'azzeramento resta dov'era, perché
  // il controllo dei cicli deve vedere la distinta che il file sta costruendo e
  // non quella di prima; ma tenersi da parte l'originale permette di rimetterlo
  // se il file, per quel padre, non produce nemmeno una riga buona.
  const clearedParents = new Map();
  rows.forEach((row, i) => {
    const ln = i + 2;
    const pCode = String(pick(row, 'CodicePadre', 'Padre', 'Parent')).trim();
    const cCode = String(pick(row, 'CodiceFiglio', 'Figlio', 'Child', 'Componente')).trim();
    if (!pCode && !cCode) { report.skipped++; return; } // riga vuota
    const parent = findByCode(pCode);
    if (!parent) { report.errors.push(`Riga ${ln}: padre "${esc(pCode)}" non trovato in catalogo`); return; }
    if (!isAssembly(parent.type)) { report.errors.push(`Riga ${ln}: "${esc(pCode)}" è ${typeLabel(parent.type)}, non può avere una distinta`); return; }
    const child = findByCode(cCode);
    if (!child) { report.errors.push(`Riga ${ln}: figlio "${esc(cCode)}" non trovato in catalogo`); return; }
    if (!isAllowedChild(parent.type, child.id)) {
      report.errors.push(`Riga ${ln}: ${typeLabel(child.type)} non ammesso in ${typeLabel(parent.type)}`); return;
    }
    // Azzera i componenti del padre alla prima riga valida che lo riguarda
    if (!clearedParents.has(parent.id)) {
      clearedParents.set(parent.id, parent.components || []);
      parent.components = [];
      report.parents++;
    }
    if (createsCycle(parent.id, child.id)) {
      report.errors.push(`Riga ${ln}: "${esc(cCode)}" in "${esc(pCode)}" creerebbe un ciclo`); return;
    }
    parent.components.push({ itemId: child.id, qty: numOr(pick(row, 'Qta', 'Quantità', 'Qty', 'Quantita'), 1), scrapPct: numOr(pick(row, 'Scarto%', 'Scarto', 'ScrapPct'), 0) });
    touch(parent);
    report.added++;
  });
  // Un padre le cui righe sono state tutte rifiutate resterebbe senza distinta:
  // l'azzeramento è già avvenuto e un messaggio d'errore non la rimette a posto.
  // Il file, per lui, non ha prodotto niente — quindi la sua distinta è ancora
  // quella di prima. Cancellarla sarebbe punire chi ha provato a importare.
  clearedParents.forEach((prima, id) => {
    const p = getItem(id);
    if (!p || p.components.length || !prima.length) return;
    p.components = prima;
    report.parents--;
    report.restored++;
    report.errors.push(`"${esc(p.code || '')}": nessuna riga valida nel file, la distinta esistente è stata lasciata com'era`);
  });
  saveDB();
  return report;
}

// ─── Template scaricabili ───
function downloadBomTemplate() {
  const data = [['CodicePadre', 'CodiceFiglio', 'Qta', 'Scarto%'],
    ['MAC-100', 'GRP-100', 1, 0],
    ['GRP-100', 'PRT-100', 2, 0],
    ['GRP-100', 'SGR-100', 1, 0],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 16 }, { wch: 16 }, { wch: 8 }, { wch: 10 }];
  const info = XLSX.utils.aoa_to_sheet([
    ['ISTRUZIONI — Import Distinte'],
    [],
    ['Ogni riga collega un padre (assieme) a un suo componente figlio.'],
    ['I codici di padre e figlio devono già esistere in catalogo (importa prima gli Articoli).'],
    ['Per ogni padre presente nel file i componenti vengono SOSTITUITI (le lavorazioni restano).'],
    ['Le relazioni non ammesse o cicliche vengono segnalate e saltate.'],
    [],
    ['Colonna', 'Descrizione'],
    ['CodicePadre', 'Codice dell\'assieme (macchina/gruppo/sottogruppo).'],
    ['CodiceFiglio', 'Codice del componente contenuto.'],
    ['Qta', 'Quantità del figlio dentro il padre, nell\'UM del figlio (default 1).'],
    ['Scarto%', 'Percentuale di scarto, in % (default 0).'],
  ]);
  info['!cols'] = [{ wch: 16 }, { wch: 70 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Distinte');
  XLSX.utils.book_append_sheet(wb, info, 'Istruzioni');
  XLSX.writeFile(wb, 'Template_Distinte.xlsx');
  showToast('Template scaricato');
}

// ═══════════════════════════════════════════════════════════
//  IMPOSTAZIONI DI GESTIONE ⇄ EXCEL (un foglio per scheda)
// ═══════════════════════════════════════════════════════════
// Le anagrafiche di servizio (fornitori, famiglie, centri di lavoro, unità di
// misura, concetti, condizioni, parametri, utenti) si rifanno a mano a ogni
// installazione nuova: il backup JSON le porta tutte, ma è tutto o niente —
// sovrascrive anche articoli, distinte e documenti. Qui si portano via le sole
// impostazioni, in un file leggibile e modificabile a mano.
//
// L'import è **additivo**: aggiorna ciò che riconosce e crea ciò che manca, non
// cancella mai niente. Un foglio assente viene semplicemente saltato, così si
// può importare anche solo la scheda che interessa. Il motivo è che eliminare
// da un foglio è indistinguibile da un foglio compilato a metà, e la differenza
// la pagherebbero fornitori e famiglie ancora referenziati dagli articoli.

const COMPANY_FIELDS = [
  ['Ragione sociale', 'name'], ['Referente', 'referente'], ['Email', 'email'],
  ['Telefono', 'phone'], ['P.IVA / C.F.', 'vat'], ['Via / indirizzo', 'street'],
  ['Numero civico', 'streetNumber'], ['CAP', 'zip'], ['Città', 'city'],
  ['Provincia', 'province'], ['Stato', 'country'],
];
// [etichetta, chiave in db.settings, tipo, min, max]
const SETTINGS_PARAMS = [
  ['Spese generali / overhead (%)', 'overheadPct', 'num', 0, 1000, 'Numero da 0 a 1000'],
  ['Margine / markup (%)', 'marginPct', 'num', 0, 1000, 'Numero da 0 a 1000'],
  ['Simbolo valuta', 'currency', 'text', 0, 0, 'Massimo 3 caratteri (es. €)'],
  ['Approvvigionamento parte (default)', 'partSourcingDefault', 'sourcing', 0, 0, 'make = Produzione interna · buy = Acquisto da fornitore'],
  ['Cifre parte incrementale codice', 'codeDigits', 'int', 1, 10, 'Numero intero da 1 a 10'],
  ['Prefisso codice — Commerciali', 'codePrefixAcquistato', 'upper', 0, 0, 'Sigla, resa maiuscola (es. CMM)'],
  ['Prefisso codice — Materie prime', 'codePrefixMateriale', 'upper', 0, 0, 'Sigla, resa maiuscola (es. MAT)'],
  ['Prefisso codice — Parti', 'codePrefixParte', 'upper', 0, 0, 'Sigla, resa maiuscola (es. PRT)'],
  ['Durata della sessione salvata (giorni)', 'sessionDays', 'num', 0, 365, '0 = la sessione non scade mai'],
];
const FAMILY_KIND_LABELS = { acquistato: 'Commerciali', materiale: 'Materie prime', parte: 'Parti' };
// Le famiglie stanno in tre fogli, uno per ambito, come le tre schede di
// Gestione. Il foglio unico "Famiglie" con la colonna Ambito è quello dei file
// esportati dalla 0.34.0: si continua a leggerlo, non a scriverlo.
const FAMILY_SHEETS = [
  { key: 'fam-acquistato', kind: 'acquistato', name: 'Famiglie commerciali' },
  { key: 'fam-materiale', kind: 'materiale', name: 'Famiglie materie prime' },
  { key: 'fam-parte', kind: 'parte', name: 'Famiglie parti' },
];
const FAMILY_LEGACY_SHEET = 'Famiglie';
const TERMS_KIND_LABELS = { transport: 'Trasporto', payment: 'Pagamento' };

// ─── Lettura tollerante di una cella ───
// `null` = colonna assente dal foglio (il campo non si tocca), '' = colonna
// presente e vuota (il campo si svuota). Senza questa distinzione un foglio
// ridotto alle sole colonne che interessano cancellerebbe tutto il resto.
function hasCol(row, ...names) {
  const w = names.map(normHeader);
  return Object.keys(row).some(k => w.includes(normHeader(k)));
}
function cell(row, ...names) {
  return hasCol(row, ...names) ? String(pick(row, ...names)).trim() : null;
}
function boolCell(row, ...names) {
  const v = cell(row, ...names);
  if (v === null || v === '') return null;
  const n = normHeader(v);
  if (['si', 'sì', 's', 'x', '1', 'true', 'vero', 'y', 'yes', 'attivo'].includes(n)) return true;
  if (['no', 'n', '0', 'false', 'falso', 'sospeso'].includes(n)) return false;
  return null;
}
function siNo(v) { return v === false ? 'No' : 'Sì'; }
// Ambito famiglia e ruolo utente arrivano come etichetta a schermo o chiave interna
function resolveFamilyKind(raw) {
  const n = normHeader(raw);
  if (!n) return '';
  for (const k of Object.keys(FAMILY_KIND_LABELS)) {
    if (normHeader(k) === n || normHeader(FAMILY_KIND_LABELS[k]) === n) return k;
  }
  if (n === 'commerciale' || n === 'commerciali' || n === 'acquistati') return 'acquistato';
  if (n === 'materiaprima' || n === 'materieprime' || n === 'materiali') return 'materiale';
  if (n === 'parti') return 'parte';
  return '';
}
function resolveTermsKind(raw) {
  const n = normHeader(raw);
  if (!n) return '';
  for (const k of Object.keys(TERMS_KIND_LABELS)) {
    if (normHeader(k) === n || normHeader(TERMS_KIND_LABELS[k]) === n) return k;
  }
  if (n === 'resa' || n === 'trasportoresa' || n === 'tipiditrasportoresa') return 'transport';
  if (n === 'pagamenti' || n === 'tipidipagamento') return 'payment';
  return '';
}
function resolveRole(raw) {
  const n = normHeader(raw);
  if (!n) return '';
  for (const k of Object.keys(ROLES)) {
    if (normHeader(k) === n || normHeader(ROLES[k]) === n) return k;
  }
  return '';
}

// ─── I fogli, in uscita ───
// Il file esportato è anche il template dell'import: si esporta, si modifica, si
// ricarica. Nessun foglio "vuoto per esempio": si porta via ciò che c'è davvero.
function settingsSheets() {
  const s = db.settings || {};
  const co = s.company || {};
  const out = [];
  out.push({ key: 'company', name: 'Azienda', cols: [{ wch: 30 }, { wch: 46 }],
    aoa: [['Campo', 'Valore']].concat(COMPANY_FIELDS.map(([l, f]) => [l, co[f] || ''])) });

  out.push({ key: 'users', name: 'Utenti', cols: [{ wch: 26 }, { wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 10 }, { wch: 8 }],
    aoa: [['Nome', 'Email', 'Username', 'Ruolo', 'Colore', 'Attivo']].concat(
      userList().map(u => [u.name || '', u.email || '', u.username || '', roleLabel(u.role), safeColor(u.color), siNo(u.active)])) });

  out.push({ key: 'suppliers', name: 'Fornitori',
    cols: [{ wch: 28 }, { wch: 20 }, { wch: 26 }, { wch: 16 }, { wch: 16 }, { wch: 26 }, { wch: 8 }, { wch: 8 }, { wch: 18 }, { wch: 6 }, { wch: 12 }, { wch: 22 }, { wch: 22 }, { wch: 8 }, { wch: 14 }],
    aoa: [['Nome', 'Referente', 'Email', 'Telefono', 'P.IVA / C.F.', 'Via / indirizzo', 'Numero civico', 'CAP', 'Città', 'Provincia', 'Stato', 'Pagamento predefinito', 'Trasporto predefinito', 'Attivo', 'Trasporto CL gg']].concat(
      (db.suppliers || []).map(f => [f.name || '', f.referente || '', f.email || '', f.phone || '', f.vat || '',
        f.street || '', f.streetNumber || '', f.zip || '', f.city || '', f.province || '', f.country || '',
        f.defaultPayment || '', f.defaultTransport || '', siNo(f.active), Number(f.transitDays) || 0])) });

  out.push({ key: 'customers', name: 'Clienti',
    cols: [{ wch: 28 }, { wch: 20 }, { wch: 26 }, { wch: 16 }, { wch: 16 }, { wch: 26 }, { wch: 8 }, { wch: 8 }, { wch: 18 }, { wch: 6 }, { wch: 12 }, { wch: 30 }, { wch: 8 }],
    aoa: [['Nome', 'Referente', 'Email', 'Telefono', 'P.IVA / C.F.', 'Via / indirizzo', 'Numero civico', 'CAP', 'Città', 'Provincia', 'Stato', 'Note', 'Attivo']].concat(
      (db.customers || []).map(c => [c.name || '', c.referente || '', c.email || '', c.phone || '', c.vat || '',
        c.street || '', c.streetNumber || '', c.zip || '', c.city || '', c.province || '', c.country || '',
        c.notes || '', siNo(c.active)])) });

  const terms = [];
  Object.keys(TERMS_KIND_LABELS).forEach(k => {
    (s[k + 'Options'] || []).forEach(o => terms.push([TERMS_KIND_LABELS[k], o, o === s[k + 'Default'] ? 'Sì' : '']));
  });
  out.push({ key: 'terms', name: 'Condizioni offerta', cols: [{ wch: 16 }, { wch: 34 }, { wch: 12 }],
    aoa: [['Tipo', 'Voce', 'Predefinita']].concat(terms) });

  // Un foglio per ambito, come le tre schede di Gestione: l'ambito è il foglio,
  // e una colonna in meno è una colonna in meno da sbagliare.
  FAMILY_SHEETS.forEach(fs => {
    const fams = [];
    (db.families || []).filter(f => (f.kind || 'acquistato') === fs.kind).forEach(f => {
      const sig = f.sigla || siglaFromName(f.name);
      if (!(f.subs || []).length) fams.push([f.name || '', sig, '', '']);
      (f.subs || []).forEach(sub => fams.push([f.name || '', sig, sub.name || '', sub.sigla || siglaFromName(sub.name)]));
    });
    out.push({ key: fs.key, name: fs.name, cols: [{ wch: 28 }, { wch: 12 }, { wch: 28 }, { wch: 12 }],
      aoa: [['Macrofamiglia', 'Sigla macro', 'Sottofamiglia', 'Sigla sotto']].concat(fams) });
  });

  out.push({ key: 'concepts', name: 'Concetti', cols: [{ wch: 30 }],
    aoa: [['Concetto']].concat(conceptList().map(c => [c.name || ''])) });

  // «Attivo» come per Fornitori, Clienti e Utenti: senza, un centro sospeso
  // rinasceva attivo su una postazione nuova, e le sue ore tornavano a costare.
  // I tempi per la programmazione a ritroso (0.88.0) stanno in coda, prima di
  // «Attivo» no: un foglio vecchio, senza quelle colonne, li lascia com'erano.
  out.push({ key: 'workcenters', name: 'Centri di lavoro', cols: [{ wch: 30 }, { wch: 16 }, { wch: 18 }, { wch: 8 }, { wch: 12 }, { wch: 16 }, { wch: 10 }],
    aoa: [['Nome', 'Tariffa oraria', 'Capacità h/sett', 'Attivo', 'Ore/giorno', 'Attrezzaggio h', 'Coda gg']].concat((db.workCenters || [])
      .map(w => [w.name || '', Number(w.hourlyRate) || 0, Number(w.capacityHours) || 0, siNo(w.active),
        Number(w.hoursPerDay) || 0, Number(w.setupHours) || 0, Number(w.queueDays) || 0])) });

  out.push({ key: 'uoms', name: 'Unità di misura', cols: [{ wch: 12 }, { wch: 30 }, { wch: 12 }],
    aoa: [['Codice', 'Descrizione', 'Predefinita']].concat(
      uomList().map(u => [u.code || '', u.name || '', u.code === s.uomDefault ? 'Sì' : ''])) });

  out.push({ key: 'params', name: 'Impostazioni', cols: [{ wch: 38 }, { wch: 18 }, { wch: 52 }],
    aoa: [['Parametro', 'Valore', 'Valori ammessi']].concat(
      SETTINGS_PARAMS.map(([l, k, t, , , nota]) => [l, paramOut(k, t), nota])) });

  return out;
}
function paramOut(key, type) {
  const v = (db.settings || {})[key];
  if (type === 'num' || type === 'int') return Number(v) || 0;
  return v == null ? '' : String(v);
}
function settingsInfoAoa() {
  return [
    ['ISTRUZIONI — Impostazioni di Gestione'],
    [],
    ['Questo file è insieme l\'esportazione e il template: modificalo e ricaricalo da Gestione → Import.'],
    ['L\'import è additivo: aggiorna ciò che riconosce, crea ciò che manca, non cancella mai niente.'],
    ['Un foglio assente viene saltato: si può importare anche una sola scheda per volta.'],
    ['Una colonna assente lascia il campo com\'è; una colonna presente ma vuota lo svuota.'],
    [],
    ['Foglio', 'Chiave di riconoscimento e note'],
    ['Azienda', 'Coppie Campo/Valore. I nomi dei campi sono quelli della colonna: non rinominarli.'],
    ['Utenti', 'Chiave: Email. Le password NON sono esportate né importate: un utente nuovo nasce senza password e non può accedere finché un amministratore non gliene imposta una (Gestione → Utenti → 🔑). Deve restare almeno un amministratore attivo, e non puoi cambiare ruolo o stato a te stesso.'],
    ['Fornitori', 'Chiave: Nome (maiuscole/minuscole ignorate).'],
    ['Clienti', 'Chiave: Nome (maiuscole/minuscole ignorate). Il nome è anche ciò che la commessa cita: da qui non si rinomina un cliente — si rinomina in Gestione → Clienti, che allinea le commesse — e un nome diverso crea un cliente nuovo.'],
    ['Condizioni offerta', 'Tipo = Trasporto o Pagamento. Predefinita = Sì sulla voce che precompila le nuove richieste.'],
    ['Famiglie (tre fogli)', 'Un foglio per ambito — ' + FAMILY_SHEETS.map(f => f.name).join(', ') + ' — così l\'ambito è il foglio e non una colonna da sbagliare. Chiave: Macrofamiglia. Una riga per sottofamiglia; riga con Sottofamiglia vuota = solo macrofamiglia. Si legge ancora anche il vecchio foglio unico "Famiglie" con la colonna Ambito.'],
    ['Concetti', 'Sempre in MAIUSCOLO. Chiave: il nome stesso.'],
    // L'unità non si può scrivere nell'intestazione: normHeader() la userebbe
    // per il riconoscimento e un file esportato non si riaprirebbe più. Va detta
    // qui, che è dove si guarda prima di compilare la colonna.
    ['Centri di lavoro', 'Chiave: Nome (maiuscole/minuscole ignorate). La tariffa oraria è in ' + cur() + ' per ora, e non può essere negativa. La capacità è in ore a settimana e serve al Carico centri: zero significa «non dichiarata», non «nessuna capacità». Attivo = Sì/No; vuoto lascia lo stato invariato.'],
    ['Unità di misura', 'Chiave: Codice. Il codice non si rinomina da qui (si rinomina in Gestione, che propaga il nuovo codice ad articoli e documenti): un codice diverso crea una nuova unità.'],
    ['Impostazioni', 'Coppie Parametro/Valore. La colonna "Valori ammessi" è solo un promemoria: non viene letta.'],
  ];
}

// ─── Esporta ───
function exportSettingsXlsx() {
  // Il foglio Utenti elenca nomi, email e ruoli: come il backup, solo agli amministratori
  if (!roleGuardRuolo('manage')) return;
  if (!requireXlsx()) return;
  const wb = XLSX.utils.book_new();
  settingsSheets().forEach(sh => {
    const ws = XLSX.utils.aoa_to_sheet(sh.aoa);
    if (sh.cols) ws['!cols'] = sh.cols;
    XLSX.utils.book_append_sheet(wb, ws, sh.name);
  });
  const info = XLSX.utils.aoa_to_sheet(settingsInfoAoa());
  info['!cols'] = [{ wch: 22 }, { wch: 96 }];
  XLSX.utils.book_append_sheet(wb, info, 'Istruzioni');
  XLSX.writeFile(wb, `bomtrack_impostazioni_${oggiISO()}.xlsx`);
  showToast('Impostazioni esportate');
}

// ─── Importa ───
function onImportSettings(ev) {
  const file = ev.target.files[0]; ev.target.value = '';
  if (!file) return;
  if (!roleGuard('manage')) return;
  readWorkbook(file, sheets => { showSettingsReport(importSettingsSheets(sheets)); });
}
// Come readSheet, ma consegna tutti i fogli: qui il nome del foglio è il dato
// Tutti i fogli, per nome. È la forma che serve agli import a più fogli.
function readWorkbook(file, cb) {
  leggiFile(file, wb => {
    const out = {};
    wb.SheetNames.forEach(n => { out[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' }); });
    return out;
  }, cb);
}
const SETTINGS_SHEET_DEFS = [
  { key: 'company', name: 'Azienda', apply: (r, rep) => applyCompanySheet(r, rep) },
  { key: 'params', name: 'Impostazioni', apply: (r, rep) => applyParamsSheet(r, rep) },
  { key: 'terms', name: 'Condizioni offerta', apply: (r, rep) => applyTermsSheet(r, rep) },
  { key: 'uoms', name: 'Unità di misura', apply: (r, rep) => applyUomsSheet(r, rep) },
  { key: 'concepts', name: 'Concetti', apply: (r) => applyConceptsSheet(r) },
  { key: 'workcenters', name: 'Centri di lavoro', apply: (r, rep) => applyWorkCentersSheet(r, rep) },
].concat(FAMILY_SHEETS.map(fs => ({
  key: fs.key, name: fs.name, apply: (r, rep) => applyFamiliesSheet(r, rep, fs),
}))).concat([
  { key: 'suppliers', name: 'Fornitori', apply: (r, rep) => applySuppliersSheet(r, rep) },
  { key: 'customers', name: 'Clienti', apply: (r, rep) => applyCustomersSheet(r, rep) },
  { key: 'users', name: 'Utenti', apply: (r, rep) => applyUsersSheet(r, rep) },
]);
// `byName`: { 'Nome foglio': [righe già lette] }. I fogli si riconoscono dal
// nome normalizzato — accenti e maiuscole non contano — e quelli sconosciuti
// (Istruzioni compreso) si ignorano senza rumore.
function importSettingsSheets(byName) {
  const rep = { sheets: [], missing: [], errors: [], warnings: [] };
  const norm = {};
  Object.keys(byName || {}).forEach(n => { norm[normHeader(n)] = byName[n]; });
  // Foglio unico "Famiglie" con la colonna Ambito: è il formato dei file
  // esportati fino alla 0.34.0. Si legge ancora, e in quel caso i tre fogli per
  // ambito non si dichiarano mancanti — mancherebbero per costruzione.
  const legacyFam = norm[normHeader(FAMILY_LEGACY_SHEET)];
  const saltaFam = Array.isArray(legacyFam);
  SETTINGS_SHEET_DEFS.forEach(def => {
    const rows = norm[normHeader(def.name)];
    if (!Array.isArray(rows)) {
      if (!(saltaFam && FAMILY_SHEETS.some(f => f.key === def.key))) rep.missing.push(def.name);
      return;
    }
    const r = def.apply(rows, rep) || {};
    rep.sheets.push({ name: def.name, created: r.created || 0, updated: r.updated || 0, skipped: r.skipped || 0 });
  });
  if (saltaFam) {
    const r = applyFamiliesSheet(legacyFam, rep) || {};
    rep.sheets.push({ name: FAMILY_LEGACY_SHEET + ' (formato precedente)',
      created: r.created || 0, updated: r.updated || 0, skipped: r.skipped || 0 });
  }
  saveDB();
  return rep;
}
function _stat() { return { created: 0, updated: 0, skipped: 0 }; }
// Assegna solo se il valore è cambiato: i conteggi del report devono dire
// quante righe hanno fatto qualcosa, non quante ne sono state lette.
function _assign(obj, field, v) {
  if (v === null || String(obj[field] == null ? '' : obj[field]) === v) return false;
  obj[field] = v; return true;
}

function applyCompanySheet(rows, rep) {
  const out = _stat();
  const co = db.settings.company = db.settings.company || {};
  rows.forEach((row, i) => {
    const label = cell(row, 'Campo', 'Parametro', 'Field');
    if (!label) { out.skipped++; return; }
    const f = COMPANY_FIELDS.find(([l]) => normHeader(l) === normHeader(label));
    if (!f) { rep.errors.push(`Azienda, riga ${i + 2}: campo sconosciuto "${esc(label)}"`); return; }
    let v = cell(row, 'Valore', 'Value');
    if (v === null) { out.skipped++; return; }
    if (f[1] === 'province') v = v.toUpperCase();
    if (_assign(co, f[1], v)) out.updated++; else out.skipped++;
  });
  return out;
}
function applyParamsSheet(rows, rep) {
  const out = _stat();
  rows.forEach((row, i) => {
    const label = cell(row, 'Parametro', 'Campo', 'Impostazione');
    if (!label) { out.skipped++; return; }
    const p = SETTINGS_PARAMS.find(([l, k]) => normHeader(l) === normHeader(label) || normHeader(k) === normHeader(label));
    if (!p) { rep.errors.push(`Impostazioni, riga ${i + 2}: parametro sconosciuto "${esc(label)}"`); return; }
    const raw = cell(row, 'Valore', 'Value');
    if (raw === null) { out.skipped++; return; }
    const [, key, type, min, max] = p;
    let v;
    if (type === 'num' || type === 'int') {
      const n = numOr(raw, NaN);
      if (isNaN(n)) { rep.errors.push(`Impostazioni, riga ${i + 2}: "${esc(label)}" non è un numero ("${esc(raw)}")`); return; }
      v = Math.min(Math.max(type === 'int' ? Math.round(n) : n, min), max);
    } else if (type === 'sourcing') {
      const k = normHeader(raw);
      v = Object.keys(PART_SOURCING).find(x => normHeader(x) === k || normHeader(PART_SOURCING[x]) === k);
      if (!v) { rep.errors.push(`Impostazioni, riga ${i + 2}: approvvigionamento sconosciuto "${esc(raw)}"`); return; }
    } else if (type === 'upper') {
      v = raw.toUpperCase();
      if (!v) { rep.errors.push(`Impostazioni, riga ${i + 2}: "${esc(label)}" non può restare vuoto`); return; }
    } else {
      v = raw.slice(0, 3);
      if (!v) { rep.errors.push(`Impostazioni, riga ${i + 2}: "${esc(label)}" non può restare vuoto`); return; }
    }
    if (String(db.settings[key]) !== String(v)) { db.settings[key] = v; out.updated++; } else out.skipped++;
  });
  return out;
}
function applyTermsSheet(rows, rep) {
  const out = _stat();
  rows.forEach((row, i) => {
    const kindRaw = cell(row, 'Tipo', 'Categoria', 'Kind');
    const voce = cell(row, 'Voce', 'Valore', 'Descrizione');
    if (!kindRaw && !voce) { out.skipped++; return; }
    const kind = resolveTermsKind(kindRaw);
    if (!kind) { rep.errors.push(`Condizioni offerta, riga ${i + 2}: tipo non valido ("${esc(kindRaw || '')}")`); return; }
    if (!voce) { rep.errors.push(`Condizioni offerta, riga ${i + 2}: voce mancante`); return; }
    const key = kind + 'Options';
    const arr = db.settings[key] = db.settings[key] || [];
    if (!arr.includes(voce)) { arr.push(voce); out.created++; } else out.skipped++;
    if (boolCell(row, 'Predefinita', 'Predefinito', 'Default') === true) db.settings[kind + 'Default'] = voce;
  });
  return out;
}
function applyUomsSheet(rows, rep) {
  const out = _stat();
  let def = null;
  rows.forEach((row, i) => {
    const code = cell(row, 'Codice', 'Code', 'UM');
    const name = cell(row, 'Descrizione', 'Nome', 'Name');
    if (!code) { if (name) rep.errors.push(`Unità di misura, riga ${i + 2}: codice mancante`); else out.skipped++; return; }
    if (!Array.isArray(db.settings.uoms)) db.settings.uoms = [];
    let u = db.settings.uoms.find(x => x.code === code);
    if (!u) { u = { code, name: name || '' }; db.settings.uoms.push(u); out.created++; }
    else if (_assign(u, 'name', name)) out.updated++;
    else out.skipped++;
    if (boolCell(row, 'Predefinita', 'Predefinito', 'Default') === true) def = code;
  });
  if (def !== null) db.settings.uomDefault = def;
  return out;
}
// Un concetto in uso è congelato anche qui: la chiave è il nome stesso, quindi
// dal foglio si possono solo aggiungere concetti nuovi — rinominarne uno
// riscriverebbe il nome delle parti già composte con quel concetto.
function applyConceptsSheet(rows) {
  const out = _stat();
  rows.forEach(row => {
    const name = (cell(row, 'Concetto', 'Nome', 'Name') || '').toUpperCase();
    if (!name) { out.skipped++; return; }
    if (!Array.isArray(db.settings.concepts)) db.settings.concepts = [];
    if (db.settings.concepts.some(c => c.name === name)) { out.skipped++; return; }
    db.settings.concepts.push({ id: gid(), name });
    out.created++;
  });
  return out;
}
function applyWorkCentersSheet(rows, rep) {
  const out = _stat();
  rows.forEach((row, i) => {
    const name = cell(row, 'Nome', 'Centro di lavoro', 'Name');
    if (!name) { out.skipped++; return; }
    const rateRaw = cell(row, 'Tariffa oraria', 'Tariffa', 'HourlyRate');
    let rate = null;
    if (rateRaw !== null && rateRaw !== '') {
      rate = numOr(rateRaw, NaN);
      if (isNaN(rate) || rate < 0) { rep.errors.push(`Centri di lavoro, riga ${i + 2}: tariffa non valida ("${esc(rateRaw)}")`); return; }
    }
    const capRaw = cell(row, 'Capacità h/sett', 'Capacità', 'Capacity');
    let cap = null;
    if (capRaw !== null && capRaw !== '') {
      cap = numOr(capRaw, NaN);
      if (isNaN(cap) || cap < 0) { rep.errors.push(`Centri di lavoro, riga ${i + 2}: capacità non valida ("${esc(capRaw)}")`); return; }
    }
    // I tempi: colonna assente = invariato, come la capacità.
    const tempi = {};
    for (const [campo, nomi, etichetta] of [['hoursPerDay', ['Ore/giorno', 'Ore al giorno'], 'ore al giorno'],
      ['setupHours', ['Attrezzaggio h', 'Attrezzaggio'], 'attrezzaggio'], ['queueDays', ['Coda gg', 'Coda'], 'coda']]) {
      const raw = cell(row, ...nomi);
      if (raw === null || raw === '') continue;
      const n = numOr(raw, NaN);
      if (isNaN(n) || n < 0) { rep.errors.push(`Centri di lavoro, riga ${i + 2}: ${etichetta} non valida ("${esc(raw)}")`); return; }
      tempi[campo] = campo === 'queueDays' ? Math.round(n) : n;
    }
    if (!Array.isArray(db.workCenters)) db.workCenters = [];
    const w = db.workCenters.find(x => (x.name || '').toLowerCase() === name.toLowerCase());
    if (!w) {
      const attNuovo = boolCell(row, 'Attivo', 'Active');
      db.workCenters.push(stampNew(Object.assign({ id: gid(), name, hourlyRate: rate == null ? 0 : rate,
        capacityHours: cap == null ? 0 : cap, hoursPerDay: 0, setupHours: 0, queueDays: 0, active: attNuovo !== false }, tempi)));
      out.created++;
    } else {
      // La chiave è il nome, quindi il nome non si rinomina da qui (come per i
      // fornitori): si aggiornano tariffa e stato, e ognuno dei due da solo
      // conta come aggiornamento.
      let cambiato = false;
      if (rate != null && Number(w.hourlyRate) !== rate) { w.hourlyRate = rate; cambiato = true; }
      if (cap != null && Number(w.capacityHours) !== cap) { w.capacityHours = cap; cambiato = true; }
      Object.keys(tempi).forEach(k => { if (Number(w[k]) !== tempi[k]) { w[k] = tempi[k]; cambiato = true; } });
      const att = boolCell(row, 'Attivo', 'Active');
      if (att !== null && w.active !== att) { w.active = att; cambiato = true; }
      if (cambiato) { touch(w); out.updated++; } else out.skipped++;
    }
  });
  return out;
}
function applyFamiliesSheet(rows, rep, fs) {
  const out = _stat();
  // `fs` = il foglio dell'ambito (Famiglie commerciali/materie prime/parti).
  // Senza, si sta leggendo il foglio unico dei file esportati fino alla 0.34.0,
  // e l'ambito lo dice la colonna.
  const foglio = fs ? fs.name : FAMILY_LEGACY_SHEET;
  rows.forEach((row, i) => {
    const kindRaw = fs ? '' : cell(row, 'Ambito', 'Tipo', 'Kind');
    const famName = cell(row, 'Macrofamiglia', 'Famiglia', 'Family');
    const subName = cell(row, 'Sottofamiglia', 'SubFamily');
    if (!kindRaw && !famName && !subName) { out.skipped++; return; }
    const kind = fs ? fs.kind : resolveFamilyKind(kindRaw);
    if (!kind) { rep.errors.push(`${foglio}, riga ${i + 2}: ambito non valido ("${esc(kindRaw || '')}")`); return; }
    if (!famName) { rep.errors.push(`${foglio}, riga ${i + 2}: macrofamiglia mancante`); return; }
    if (!Array.isArray(db.families)) db.families = [];
    // La sigla del foglio vale, ma non può calpestare quella di un'altra
    // macrofamiglia dello stesso ambito: il codice non saprebbe più distinguerle.
    const avvisa = m => rep.warnings.push(`${foglio}, riga ${i + 2}: ${m}`);
    let f = db.families.find(x => (x.kind || 'acquistato') === kind && (x.name || '').toLowerCase() === famName.toLowerCase());
    const famSigla = cell(row, 'Sigla macro', 'SiglaMacro', 'Sigla');
    if (!f) {
      const sigla = siglaImport(famName, famSigla, sigleFamiglia(kind), avvisa, 'Macrofamiglia');
      f = stampNew({ id: gid(), name: famName, kind, sigla, subs: [] });
      db.families.push(f);
      out.created++;
    } else {
      if (!f.subs) f.subs = [];
      if (famSigla && siglaKey(f.sigla) !== siglaKey(famSigla)) {
        const prese = sigleFamiglia(kind); prese.delete(siglaKey(f.sigla));
        f.sigla = siglaImport(famName, famSigla, prese, avvisa, 'Macrofamiglia');
        touch(f); out.updated++;
      } else if (!subName) out.skipped++;
    }
    if (!subName) return;
    const subSigla = cell(row, 'Sigla sotto', 'SiglaSotto', 'SiglaSottofamiglia');
    const s = (f.subs || []).find(x => (x.name || '').toLowerCase() === subName.toLowerCase());
    if (!s) {
      const sigla = siglaImport(subName, subSigla, sigleSottofamiglia(f), avvisa, 'Sottofamiglia');
      (f.subs = f.subs || []).push(stampNew({ id: gid(), name: subName, sigla }));
      touch(f); out.created++;
    } else if (subSigla && siglaKey(s.sigla) !== siglaKey(subSigla)) {
      const prese = sigleSottofamiglia(f); prese.delete(siglaKey(s.sigla));
      s.sigla = siglaImport(subName, subSigla, prese, avvisa, 'Sottofamiglia');
      touch(f); out.updated++;
    } else out.skipped++;
  });
  return out;
}
const SUPPLIER_COLS = [
  ['name', ['Nome', 'Fornitore', 'Name']], ['referente', ['Referente', 'Contatto']],
  ['email', ['Email']], ['phone', ['Telefono', 'Phone']], ['vat', ['P.IVA / C.F.', 'PIVA', 'PartitaIVA', 'Vat']],
  ['street', ['Via / indirizzo', 'Via', 'Indirizzo']], ['streetNumber', ['Numero civico', 'Civico']],
  ['zip', ['CAP']], ['city', ['Città']], ['province', ['Provincia']], ['country', ['Stato', 'Paese']],
  ['defaultPayment', ['Pagamento predefinito', 'Pagamento']], ['defaultTransport', ['Trasporto predefinito', 'Trasporto']],
];
function applySuppliersSheet(rows, rep) {
  const out = _stat();
  rows.forEach((row, i) => {
    const name = cell(row, 'Nome', 'Fornitore', 'Name');
    if (!name) {
      if (Object.values(row).some(v => String(v).trim())) rep.errors.push(`Fornitori, riga ${i + 2}: nome mancante`);
      else out.skipped++;
      return;
    }
    if (!Array.isArray(db.suppliers)) db.suppliers = [];
    let s = db.suppliers.find(x => (x.name || '').toLowerCase() === name.toLowerCase());
    const isNew = !s;
    if (isNew) {
      s = stampNew({ id: gid(), name, referente: '', email: '', phone: '', vat: '', street: '', streetNumber: '',
        zip: '', city: '', province: '', country: '', defaultTransport: '', defaultPayment: '', active: true });
      db.suppliers.push(s);
    }
    let cambiato = false;
    SUPPLIER_COLS.forEach(([field, names]) => {
      if (field === 'name') return;   // è la chiave: si cambia in Gestione, non da qui
      let v = cell(row, ...names);
      if (v !== null && field === 'province') v = v.toUpperCase();
      if (_assign(s, field, v)) cambiato = true;
    });
    const att = boolCell(row, 'Attivo', 'Active');
    if (att !== null && s.active !== att) { s.active = att; cambiato = true; }
    // Giorni di trasporto verso il terzista: colonna assente = invariato.
    const trRaw = cell(row, 'Trasporto CL gg', 'Trasporto conto lavoro');
    if (s.transitDays == null) s.transitDays = 0;
    if (trRaw !== null && trRaw !== '') {
      const n = numOr(trRaw, NaN);
      if (isNaN(n) || n < 0) rep.errors.push(`Fornitori, riga ${i + 2}: giorni di trasporto non validi ("${esc(trRaw)}")`);
      else if (Number(s.transitDays) !== Math.round(n)) { s.transitDays = Math.round(n); cambiato = true; }
    }
    if (isNew) out.created++;
    else if (cambiato) { touch(s); out.updated++; }
    else out.skipped++;
  });
  return out;
}
const CUSTOMER_COLS = [
  ['name', ['Nome', 'Cliente', 'Name']], ['referente', ['Referente', 'Contatto']],
  ['email', ['Email']], ['phone', ['Telefono', 'Phone']], ['vat', ['P.IVA / C.F.', 'PIVA', 'PartitaIVA', 'Vat']],
  ['street', ['Via / indirizzo', 'Via', 'Indirizzo']], ['streetNumber', ['Numero civico', 'Civico']],
  ['zip', ['CAP']], ['city', ['Città']], ['province', ['Provincia']], ['country', ['Stato', 'Paese']],
  ['notes', ['Note']],
];
function applyCustomersSheet(rows, rep) {
  const out = _stat();
  rows.forEach((row, i) => {
    const name = cell(row, 'Nome', 'Cliente', 'Name');
    if (!name) {
      if (Object.values(row).some(v => String(v).trim())) rep.errors.push(`Clienti, riga ${i + 2}: nome mancante`);
      else out.skipped++;
      return;
    }
    if (!Array.isArray(db.customers)) db.customers = [];
    let c = db.customers.find(x => (x.name || '').toLowerCase() === name.toLowerCase());
    const isNew = !c;
    if (isNew) {
      c = stampNew({ id: gid(), name, referente: '', email: '', phone: '', vat: '', street: '', streetNumber: '',
        zip: '', city: '', province: '', country: '', notes: '', active: true });
      db.customers.push(c);
    }
    let cambiato = false;
    CUSTOMER_COLS.forEach(([field, names]) => {
      if (field === 'name') return;   // è la chiave: si cambia in Gestione, che allinea le commesse
      let v = cell(row, ...names);
      if (v !== null && field === 'province') v = v.toUpperCase();
      if (_assign(c, field, v)) cambiato = true;
    });
    const att = boolCell(row, 'Attivo', 'Active');
    if (att !== null && c.active !== att) { c.active = att; cambiato = true; }
    if (isNew) out.created++;
    else if (cambiato) { touch(c); out.updated++; }
    else out.skipped++;
  });
  return out;
}
// Le password non entrano e non escono: nel foglio non c'è nulla da cui
// ricavarle, e un utente creato da qui nasce senza — non può accedere finché un
// amministratore non gliene imposta una. Le due invarianti della scheda Utenti
// (resta almeno un amministratore attivo, non ci si tocca da soli) valgono anche
// qui, riga per riga: un foglio non è un buon posto da cui chiudersi fuori.
function applyUsersSheet(rows, rep) {
  const out = _stat();
  rows.forEach((row, i) => {
    const email = cell(row, 'Email');
    const name = cell(row, 'Nome', 'Name');
    if (!email && !name) { out.skipped++; return; }
    if (!email) { rep.errors.push(`Utenti, riga ${i + 2}: email mancante`); return; }
    const roleRaw = cell(row, 'Ruolo', 'Role');
    const role = roleRaw ? resolveRole(roleRaw) : null;
    if (roleRaw && !role) { rep.errors.push(`Utenti, riga ${i + 2}: ruolo sconosciuto ("${esc(roleRaw)}")`); return; }
    const attivo = boolCell(row, 'Attivo', 'Active');
    const u = findUserByEmail(email);
    if (!u) {
      if (!name) { rep.errors.push(`Utenti, riga ${i + 2}: nome richiesto per creare "${esc(email)}"`); return; }
      // Con l'archivio condiviso un utente esiste solo se Supabase lo conosce:
      // uno creato qui il server lo rifiuterebbe, e fermerebbe in coda tutto
      // quello che questo PC manda dopo (dalla 0.105.5).
      if (typeof cloudInUso === 'function' && cloudInUso()) {
        rep.errors.push(`Utenti, riga ${i + 2}: "${esc(email)}" non c'è. Con l'archivio condiviso un collega nuovo si aggiunge da Gestione → Utenti, che gli manda l'invito`);
        return;
      }
      Store.insert('users', { id: gid(), name, email, username: cell(row, 'Username') || '',
        role: role || 'lettore', color: safeColor(cell(row, 'Colore', 'Color')), active: attivo !== false });
      out.created++;
      return;
    }
    const io = currentUser && u.id === currentUser.id;
    const nuovoRuolo = role && role !== u.role ? role : null;
    const nuovoStato = attivo !== null && attivo !== (u.active !== false) ? attivo : null;
    if (io && (nuovoRuolo || nuovoStato !== null)) {
      rep.errors.push(`Utenti, riga ${i + 2}: ruolo e stato del tuo account non si cambiano da un foglio`);
      return;
    }
    // Chi sta per smettere di essere amministratore attivo lascia scoperta la Gestione?
    const perdeAdmin = u.role === 'admin' && u.active !== false
      && ((nuovoRuolo && nuovoRuolo !== 'admin') || nuovoStato === false);
    if (perdeAdmin && !activeAdmins(u.id).length) {
      rep.errors.push(`Utenti, riga ${i + 2}: deve restare almeno un amministratore attivo`);
      return;
    }
    let cambiato = false;
    if (_assign(u, 'name', name)) cambiato = true;
    if (_assign(u, 'username', cell(row, 'Username'))) cambiato = true;
    const col = cell(row, 'Colore', 'Color');
    if (col !== null && safeColor(col) !== safeColor(u.color)) { u.color = safeColor(col); cambiato = true; }
    if (nuovoRuolo) { u.role = nuovoRuolo; cambiato = true; }
    if (nuovoStato !== null) { u.active = nuovoStato; cambiato = true; }
    if (cambiato) { touch(u); out.updated++; } else out.skipped++;
  });
  return out;
}

// ─── Report di esito (impostazioni) ───
function showSettingsReport(rep) {
  const tot = rep.sheets.reduce((a, s) => ({ created: a.created + s.created, updated: a.updated + s.updated }), { created: 0, updated: 0 });
  const cards = [['Voci create', tot.created], ['Voci aggiornate', tot.updated], ['Fogli letti', rep.sheets.length], ['Errori', rep.errors.length]]
    .map(([l, v]) => `<div class="kpi-card ${l === 'Errori' && v ? 'orange' : ''}"><div class="kpi-value">${v}</div><div class="kpi-label">${l}</div></div>`).join('');
  const righe = rep.sheets.map(s => `<div class="mgmt-item">
      <span class="mgmt-item-name">${esc(s.name)}</span>
      <span class="mgmt-item-meta">${s.created} creat${s.created === 1 ? 'a' : 'e'} · ${s.updated} aggiornat${s.updated === 1 ? 'a' : 'e'} · ${s.skipped} invariat${s.skipped === 1 ? 'a' : 'e'}</span>
    </div>`).join('') || '<div class="empty-text">Nessun foglio riconosciuto: controlla i nomi dei fogli.</div>';
  const mancanti = rep.missing.length
    ? `<p class="empty-text" style="text-align:left;padding:6px 0">Fogli assenti dal file, saltati: ${esc(rep.missing.join(', '))}.</p>` : '';
  // Errori e avvisi arrivano già escapati da chi li scrive: vale la stessa
  // convenzione del report articoli, e chi aggiunge un push deve rispettarla.
  const errBlock = rep.errors.length
    ? `<div style="margin-top:12px"><strong style="color:var(--red)">Righe con problemi (${rep.errors.length}):</strong>
        <div class="picker-results" style="max-height:240px;margin-top:6px">${rep.errors.map(e => `<div class="picker-row">${e}</div>`).join('')}</div></div>`
    : `<p class="empty-text" style="padding:8px 0">Nessun errore. ${ico('check', 'tinted', '')}</p>`;
  // Gli avvisi non sono righe perse: la riga è entrata, ma non esattamente
  // com'era scritta. In arancio, non in rosso, e sotto gli errori.
  const avvBlock = (rep.warnings || []).length
    ? `<div style="margin-top:12px"><strong style="color:var(--orange)">Righe entrate con una modifica (${rep.warnings.length}):</strong>
        <div class="picker-results" style="max-height:200px;margin-top:6px">${rep.warnings.map(w => `<div class="picker-row">${w}</div>`).join('')}</div></div>`
    : '';
  openModal(`<h3>${ico('settings', 'tinted pill', '')} Esito import Impostazioni</h3>
    <div class="cost-summary">${cards}</div>
    <div class="mgmt-list" style="margin-top:12px">${righe}</div>${mancanti}${errBlock}${avvBlock}
    <div class="modal-actions"><button class="add-btn-sm" onclick="closeSettingsReport()">Chiudi</button></div>`);
}
function closeSettingsReport() {
  closeModal();
  // Il foglio Utenti può aver toccato anche chi lo sta importando (nome, colore)
  if (currentUser) {
    const mio = getUser(currentUser.id);
    if (mio) { currentUser = mio; renderUserPill(); renderNav(); }
  }
  renderManage();
  showToast('Impostazioni importate');
}

// ─── Report di esito import distinte ───
// Gli articoli hanno il loro (showCatalogReport, in import-catalog.js): contano
// per foglio, distinguono avvisi da errori e sanno dire cosa *non* è successo
// dopo una verifica. Qui basta molto meno.
function showImportReport(r) {
  const stats = [['Componenti aggiunti', r.added], ['Distinte aggiornate', r.parents],
    ['Distinte non toccate', r.restored || 0],
    ['Saltati (vuote)', r.skipped], ['Errori', r.errors.length]];
  const cards = stats.map(([l, v]) => `<div class="kpi-card ${l === 'Errori' && v ? 'orange' : ''}"><div class="kpi-value">${v}</div><div class="kpi-label">${l}</div></div>`).join('');
  const errBlock = r.errors.length
    ? `<div style="margin-top:12px"><strong style="color:var(--red)">Righe con problemi (${r.errors.length}):</strong>
        <div class="picker-results" style="max-height:240px;margin-top:6px">${r.errors.map(e => `<div class="picker-row">${e}</div>`).join('')}</div></div>`
    : `<p class="empty-text" style="padding:8px 0">Nessun errore. ${ico('check', 'tinted', '')}</p>`;
  openModal(`<h3>${ico('list', 'tinted pill', '')} Esito import Distinte</h3>
    <div class="cost-summary">${cards}</div>${errBlock}
    <div class="modal-actions"><button class="add-btn-sm" onclick="closeImportReport()">Chiudi</button></div>`);
}
function closeImportReport() {
  closeModal();
  currentBomId = null; reportBomId = null;
  renderManage();
  showToast('Import completato');
}

// Lo spazio di localStorage è circa 5 MB per sito: oltre i 4 conviene saperlo
// prima di sbatterci contro, non quando il salvataggio comincia a fallire.
// Il Riepilogo avvisa prima, al 70%: lì è un promemoria, qui un allarme.
//
// Con l'archivio in IndexedDB (dalla 0.87.0) il limite è lo spazio che il
// browser concede al sito, che chiede navigator.storage.estimate(): di solito
// una frazione del disco, cioè gigabyte. Lì conta l'uso di tutto il sito,
// allegati compresi, non solo l'archivio.
const DB_SPAZIO_MB = 5;
const DB_SIZE_WARN_MB = 4;
let _stimaSpazio = null;   // { usoMB, quotaMB } da navigator.storage.estimate()
function aggiornaStimaSpazio() {
  const st = typeof navigator !== 'undefined' && navigator.storage;
  if (!st || !st.estimate) return Promise.resolve(null);
  return st.estimate().then(e => {
    _stimaSpazio = e && e.quota ? { usoMB: (e.usage || 0) / 1048576, quotaMB: e.quota / 1048576 } : null;
    return _stimaSpazio;
  }).catch(() => null);
}
const inIndexedDb = () => Store.archivio === 'indexeddb';
// { usatoMB, limiteMB } — limiteMB null se non si sa.
function dbSpazio() {
  if (inIndexedDb()) return _stimaSpazio ? { usatoMB: _stimaSpazio.usoMB, limiteMB: _stimaSpazio.quotaMB } : { usatoMB: Store.sizeInfo().mb, limiteMB: null };
  return { usatoMB: Store.sizeInfo().mb, limiteMB: DB_SPAZIO_MB };
}
function dbSpazioPct() { const s = dbSpazio(); return s.limiteMB ? Math.round(s.usatoMB / s.limiteMB * 100) : 0; }
function fmtMB(mb) { return mb >= 1024 ? (mb / 1024).toFixed(1).replace('.', ',') + ' GB' : mb.toFixed(2) + ' MB'; }
function dbSizeLine() {
  const { mb } = Store.sizeInfo();
  if (inIndexedDb()) {
    const s = dbSpazio(), pct = dbSpazioPct();
    return `<p style="margin-top:6px">Spazio occupato dall'archivio: <strong${pct >= 90 ? ' style="color:var(--red)"' : ''}>${mb.toFixed(2)} MB</strong>,
      nel database del browser (IndexedDB)${s.limiteMB ? ` — il sito usa ${fmtMB(s.usatoMB)} sui ${fmtMB(s.limiteMB)} che il browser gli concede` : ''}.</p>`;
  }
  const vicino = mb >= DB_SIZE_WARN_MB;
  return `<p style="margin-top:6px">Spazio occupato: <strong${vicino ? ' style="color:var(--red)"' : ''}>${mb.toFixed(2)} MB</strong>
    ${vicino ? '— vicino al limite del browser (circa 5 MB). Esporta un backup e alleggerisci il database.' : 'sui circa 5 MB che il browser riserva a questa app.'}</p>`;
}

// ─── Quando è stato fatto l'ultimo backup ───
// L'archivio esiste solo in questo browser, e nessuno si ricorda di esportarlo
// finché non serve. La data sta in localStorage e non nel database: riguarda
// questa copia, e dentro il database viaggerebbe col backup stesso, dicendo il
// falso su ogni PC dove lo si ripristina.
// Il riferimento (`…_dal`) è il primo giorno in cui l'app ha contato: senza,
// un'installazione nuova partirebbe già «senza backup da sempre».
const BACKUP_DATA_KEY = 'bomtrack_ultimo_backup';
const BACKUP_DAL_KEY = 'bomtrack_ultimo_backup_dal';
const BACKUP_AVVISO_GG = 7, BACKUP_ALLARME_GG = 30;
function _lsLeggi(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
function _lsScrivi(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
function ultimoBackup() { return _lsLeggi(BACKUP_DATA_KEY); }
function registraBackup() { _lsScrivi(BACKUP_DATA_KEY, oggiISO()); }
// { data, giorni, mai }: `giorni` dall'ultimo backup, o dal primo giorno contato
// se non ce n'è mai stato uno.
function statoBackup() {
  const data = ultimoBackup();
  let rif = data;
  if (!rif) {
    rif = _lsLeggi(BACKUP_DAL_KEY);
    if (!rif) { rif = oggiISO(); _lsScrivi(BACKUP_DAL_KEY, rif); }
  }
  const g = giorniTra(rif.slice(0, 10), oggiISO());
  return { data, giorni: Math.max(0, g == null ? 0 : g), mai: !data };
}
function backupLine() {
  const s = statoBackup();
  const vecchio = s.giorni >= BACKUP_AVVISO_GG;
  const testo = s.mai ? 'Nessun backup esportato da questo browser.'
    : `Ultimo backup: <strong>${fmtDateIt(s.data)}</strong>${s.giorni ? ` (${s.giorni === 1 ? 'ieri' : s.giorni + ' giorni fa'})` : ' (oggi)'}.`;
  return `<p style="margin-top:6px"${vecchio ? ' class="backup-vecchio"' : ''}>${testo}</p>`;
}

// ─── Archiviazione persistente ───
// Quando il disco si riempie, il browser può cancellare da solo i dati dei
// siti «non persistenti», partendo dai meno usati. Chiedere la persistenza lo
// impedisce; Chrome la concede senza domande a un'app installata o usata
// spesso, Firefox chiede all'utente. L'esito si mostra in Backup.
let _persistenza = null;   // null = non si sa (API assente o non ancora risposto)
function richiediPersistenza() {
  const st = typeof navigator !== 'undefined' && navigator.storage;
  if (!st || !st.persisted || !st.persist) return Promise.resolve(null);
  return st.persisted()
    .then(gia => gia || st.persist())
    .then(ok => { _persistenza = !!ok; return _persistenza; })
    .catch(() => null);
}
function persistenzaLine() {
  if (_persistenza === null) return '';
  return _persistenza
    ? '<p style="margin-top:6px">Il browser tiene questi dati come <strong>persistenti</strong>: non li cancella da solo quando il disco si riempie.</p>'
    : '<p style="margin-top:6px">Il browser <strong>può cancellare questi dati da solo</strong> se il disco si riempie: un motivo in più per i backup. Installare l\'app (icona nella barra degli indirizzi) di solito lo evita.</p>';
}
// ─── Backup automatico in una cartella ───
// Il promemoria del Riepilogo dice *quando* esportare, ma resta un gesto a
// mano, e il giorno in cui il disco si rompe è quasi sempre il giorno dopo
// quello in cui ci si è dimenticati. Qui l'app scrive da sola una copia JSON in
// una cartella scelta una volta: all'avvio, ogni mezz'ora se qualcosa è
// cambiato, e quando si passa a un'altra finestra. Un file al giorno
// (`bomtrack_backup_AAAA-MM-GG.json`, lo stesso nome dell'export a mano, che
// si ripristina da Importa JSON), riscritto durante la giornata; si tengono gli
// ultimi BACKUP_AUTO_TENERE e i più vecchi si cancellano. Solo i file con quel
// nome esatto: il resto della cartella non è nostro e non si tocca.
//
// La cartella migliore è fuori dal browser *e* fuori dal PC: quella locale di
// OneDrive, Dropbox o di un disco di rete. È un'impostazione di questo PC, come
// la cartella dell'archivio (archivio.js) e per le stesse ragioni: il
// riferimento sta in IndexedDB, il nome in localStorage, e serve Chrome o Edge
// da un indirizzo https o localhost.
//
// Il permesso: il browser ricorda la cartella ma non sempre il permesso di
// scriverci, e lo può richiedere solo su un clic. All'avvio quindi si prova
// **senza chiedere**; se non c'è, il backup è «in pausa» e il Riepilogo lo
// dice con un pulsante che lo riprende — il clic è il gesto che serve.
const BACKUP_AUTO_KEY = 'cartellaBackup';
const BACKUP_AUTO_NOME_KEY = 'bomtrack_backup_cartella_nome';
const BACKUP_AUTO_TENERE = 14;
const BACKUP_AUTO_OGNI_MS = 30 * 60 * 1000;
const BACKUP_AUTO_FILE_RE = /^bomtrack_backup_\d{4}-\d{2}-\d{2}\.json$/;
// Esito dell'ultimo tentativo di questa sessione: { stato, ora, file, errore }.
// `stato`: 'ok' | 'pausa' (manca il permesso) | 'errore' | null (non ancora provato).
let _backupAuto = { stato: null };
let _backupAutoScritto = '';   // l'ultimo contenuto scritto: uguale, non si riscrive
let _backupAutoInCorso = null;
function _oraLocale() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function backupAutoNome() { return localPref(BACKUP_AUTO_NOME_KEY) || ''; }
function backupAutoAttivo() { return archivioSupportato() && !!backupAutoNome(); }
function backupAutoEsito() { return _backupAuto; }
function backupAutoHandle() {
  if (!archivioSupportato()) return Promise.resolve(null);
  return _archivioTx('readonly', st => st.get(BACKUP_AUTO_KEY)).catch(() => null);
}
// Va chiamata da un clic. Scelta la cartella, il primo backup parte subito:
// è la prova, sotto gli occhi di chi l'ha appena configurato, che funziona.
function backupAutoScegli() {
  if (!roleGuardRuolo('manage')) return Promise.resolve(false);
  if (!archivioSupportato()) {
    showToast('Questo browser non consente di collegare una cartella: servono Chrome o Edge', 'error');
    return Promise.resolve(false);
  }
  return window.showDirectoryPicker({ id: 'bomtrack-backup', mode: 'readwrite' })
    .then(h => _archivioTx('readwrite', st => st.put(h, BACKUP_AUTO_KEY)).then(() => {
      try { localStorage.setItem(BACKUP_AUTO_NOME_KEY, String(h.name || 'cartella')); } catch (e) { /* niente da rompere */ }
      _backupAutoScritto = '';
      return backupAutoEsegui(true);
    }))
    .then(esito => {
      if (esito && esito.stato === 'ok') showToast('Backup automatico attivo: primo backup salvato');
      if (typeof activeView !== 'undefined' && activeView === 'manage') renderManage();
      return !!(esito && esito.stato === 'ok');
    })
    .catch(e => {
      if (e && e.name === 'AbortError') return false;
      console.error('Cartella dei backup non collegata:', e);
      showToast('Cartella dei backup non collegata', 'error');
      return false;
    });
}
function backupAutoDisattiva() {
  if (!roleGuardRuolo('manage')) return Promise.resolve(false);
  try { localStorage.removeItem(BACKUP_AUTO_NOME_KEY); } catch (e) { /* niente da rompere */ }
  _backupAuto = { stato: null }; _backupAutoScritto = '';
  return _archivioTx('readwrite', st => st.delete(BACKUP_AUTO_KEY)).catch(() => null).then(() => {
    showToast('Backup automatico disattivato: i file già salvati restano nella cartella');
    if (typeof activeView !== 'undefined' && activeView === 'manage') renderManage();
    return true;
  });
}
// Toglie i backup oltre gli ultimi `tenere`. Il nome porta la data, quindi
// l'ordine alfabetico è quello cronologico.
function _backupAutoPota(dir, tenere) {
  const nomi = [];
  return _perOgniVoce(dir, (nome, h) => { if (h.kind === 'file' && BACKUP_AUTO_FILE_RE.test(nome)) nomi.push(nome); })
    .then(() => {
      nomi.sort();
      const via = nomi.slice(0, Math.max(0, nomi.length - tenere));
      if (!via.length || typeof dir.removeEntry !== 'function') return [];
      return via.reduce((p, n) => p.then(() => dir.removeEntry(n)).catch(() => null), Promise.resolve()).then(() => via);
    })
    .catch(() => []);
}
// Scrive il backup del giorno. `chiedi`: su un clic si può chiedere il
// permesso; all'avvio e dal timer no. `forza` riscrive anche se non è cambiato
// niente. Torna l'esito, e non lancia mai: è un lavoro di fondo, e un suo
// guasto non deve rompere niente di ciò che l'utente sta facendo.
function backupAutoEsegui(chiedi, forza) {
  if (!backupAutoAttivo()) return Promise.resolve(_backupAuto);
  if (_backupAutoInCorso) return _backupAutoInCorso;
  // Non quando in memoria non c'è l'archivio vero (dalla 0.105.3): dopo un
  // archivio illeggibile l'app mostra i dati d'esempio, e una scheda superata da
  // un'altra ha dati vecchi. Il backup di oggi veniva riscritto con quelli, e il
  // promemoria dei sette giorni taceva.
  const finto = (typeof dbLoadError !== 'undefined' && dbLoadError) ? 'archivio non letto: il backup di oggi resta com\'era'
    : (Store.superata && Store.superata()) ? 'Bomtrack è aperto in un\'altra scheda più recente' : '';
  if (finto) { _backupAuto = { stato: 'pausa', ora: _oraLocale(), errore: finto }; return Promise.resolve(_backupAuto); }
  let payload;
  try { payload = Store.exportSnapshot(); }
  catch (e) { _backupAuto = { stato: 'errore', ora: _oraLocale(), errore: String(e && e.message || e) }; return Promise.resolve(_backupAuto); }
  if (!forza && payload === _backupAutoScritto && _backupAuto.stato === 'ok') return Promise.resolve(_backupAuto);
  const file = `bomtrack_backup_${oggiISO()}.json`;
  _backupAutoInCorso = backupAutoHandle()
    .then(h => {
      if (!h) return { stato: 'errore', ora: _oraLocale(), errore: 'cartella non disponibile' };
      return _permesso(h, !!chiedi).then(ok => {
        if (!ok) return { stato: 'pausa', ora: _oraLocale() };
        return h.getFileHandle(file, { create: true })
          .then(fh => fh.createWritable())
          .then(w => Promise.resolve(w.write(payload)).then(() => w.close()))
          .then(() => _backupAutoPota(h, BACKUP_AUTO_TENERE))
          .then(() => {
            _backupAutoScritto = payload;
            registraBackup();
            return { stato: 'ok', ora: _oraLocale(), file };
          });
      });
    })
    .catch(e => {
      console.error('Backup automatico non riuscito:', e);
      return { stato: 'errore', ora: _oraLocale(), errore: String(e && e.message || e) };
    })
    .then(esito => { _backupAuto = esito; _backupAutoInCorso = null; return esito; });
  return _backupAutoInCorso;
}
// Il pulsante «Riprendi» del Riepilogo e «Salva ora» della scheda Backup.
function backupAutoOra() {
  if (!roleGuardRuolo('manage')) return Promise.resolve(null);
  return backupAutoEsegui(true, true).then(e => {
    if (e.stato === 'ok') showToast('Backup salvato in ' + backupAutoNome());
    else if (e.stato === 'pausa') showToast('Il browser non ha concesso di scrivere nella cartella dei backup', 'error');
    else showToast('Backup non salvato: ' + (e.errore || 'errore'), 'error');
    if (typeof activeView !== 'undefined') {
      if (activeView === 'home' && typeof renderHome === 'function') renderHome();
      if (activeView === 'manage') renderManage();
    }
    return e;
  });
}
// Avvio: un tentativo subito, poi ogni mezz'ora e a ogni cambio di finestra.
// Fuori dal browser (test) non parte niente.
function backupAutoAvvia() {
  if (!backupAutoAttivo()) return;
  // Il Riepilogo è già disegnato quando l'esito arriva: se il backup è fermo
  // lo si ridisegna, o l'avviso comparirebbe solo al prossimo cambio di vista.
  backupAutoEsegui(false).then(e => {
    if (e.stato !== 'ok' && typeof activeView !== 'undefined' && activeView === 'home' && typeof renderHome === 'function') renderHome();
  });
  if (typeof setInterval === 'function') setInterval(() => backupAutoEsegui(false), BACKUP_AUTO_OGNI_MS);
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') backupAutoEsegui(false); });
  }
}
// ─── Una copia prima di buttare via tutto (dalla 0.105.6) ───
// Importa JSON, Ripristina dati esempio e Azzera tutto sostituiscono l'intero
// archivio. La conferma c'era, ma chiedeva «hai esportato un backup?» e si
// fidava della risposta. Adesso la copia la fa l'app, prima, con i due mezzi
// che ha già:
//   - con il backup automatico attivo, un file a parte nella sua cartella,
//     `bomtrack_prima_di_<cosa>_AAAA-MM-GG_HHMM.json`. Non il file del giorno:
//     quello si riscrive da solo nella mezz'ora successiva con i dati nuovi, e
//     la copia sparirebbe proprio quando serve. Un nome diverso, quindi, che la
//     potatura degli ultimi quattordici non tocca;
//   - altrimenti, il download del JSON, come Esporta JSON.
// Se la cartella non risponde lo si dice e si chiede se scaricare il file e
// proseguire: senza una copia l'operazione non parte.
//
// Niente copia se in memoria c'è un archivio illeggibile (i dati d'esempio al
// posto di quelli veri): salvarli non proteggerebbe niente, e importare un
// backup è proprio il modo di uscirne. L'originale lo protegge già loadDB().
//
// `fn` riceve il nome della copia, o '' quando non se n'è fatta nessuna.
function copiaPrimaDi(cosa, fn) {
  if (typeof dbLoadError !== 'undefined' && dbLoadError) return Promise.resolve(fn(''));
  let payload;
  try { payload = Store.exportSnapshot(); }
  catch (e) {
    showToast('Copia di sicurezza non riuscita (' + (e && e.message || e) + '): operazione annullata', 'error');
    return Promise.resolve(null);
  }
  const d = new Date();
  const ora = String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
  const nome = `bomtrack_prima_di_${cosa}_${oggiISO()}_${ora}.json`;
  const scarica = () => {
    scaricaJson(nome, payload);
    return fn(nome);
  };
  if (!backupAutoAttivo()) return Promise.resolve(scarica());
  return backupAutoHandle()
    .then(h => {
      if (!h) throw new Error('cartella non disponibile');
      return _permesso(h, true).then(ok => {
        if (!ok) throw new Error('il browser non ha concesso di scriverci');
        return h.getFileHandle(nome, { create: true })
          .then(fh => fh.createWritable())
          .then(w => Promise.resolve(w.write(payload)).then(() => w.close()));
      });
    })
    .then(() => {
      showToast('Copia di sicurezza salvata in ' + backupAutoNome() + ': ' + nome);
      return fn(nome);
    }, e => {
      console.error('Copia di sicurezza non riuscita:', e);
      return new Promise(fatto => {
        askConfirm(`La copia di sicurezza nella cartella ${backupAutoNome()} non è riuscita (${String(e && e.message || e)}).\n\nPosso scaricarla come file e proseguire, oppure fermarmi qui.`,
          () => fatto(scarica()), { title: 'Copia di sicurezza non riuscita', ok: 'Scarica e prosegui' });
      });
    });
}
// Lo stesso <a download> usa e getta di Esporta JSON.
function scaricaJson(nome, testo) {
  const url = URL.createObjectURL(new Blob([testo], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  a.click(); URL.revokeObjectURL(url);
}
function backupAutoLine() {
  if (!archivioSupportato()) {
    return '<p style="margin-top:6px"><strong>Backup automatico:</strong> non disponibile in questo browser. Servono Chrome o Edge, con Bomtrack aperta da un indirizzo https o localhost.</p>';
  }
  const nome = backupAutoNome();
  if (!nome) {
    return `<p style="margin-top:6px"><strong>Backup automatico:</strong> spento. Scegli una cartella — meglio quella di OneDrive, Dropbox o un disco di rete — e Bomtrack ci salverà da sola una copia al giorno, tenendo le ultime ${BACKUP_AUTO_TENERE}.</p>
      <div style="margin-top:6px"><button class="btn-outline" onclick="backupAutoScegli()">${ico('folder', 'tinted', '')} Attiva backup automatico</button></div>`;
  }
  const e = _backupAuto;
  const stato = e.stato === 'ok' ? `ultimo salvataggio <strong>${esc(e.file || '')}</strong> alle ${esc(e.ora || '')}`
    : e.stato === 'pausa' ? '<strong style="color:var(--red)">in pausa</strong>: il browser chiede di riconfermare il permesso sulla cartella'
    : e.stato === 'errore' ? `<strong style="color:var(--red)">non riuscito</strong> (${esc(e.errore || 'errore')})`
    : 'nessun salvataggio ancora in questa sessione';
  return `<p style="margin-top:6px"><strong>Backup automatico</strong> nella cartella <strong>${esc(nome)}</strong>: ${stato}. Si tengono gli ultimi ${BACKUP_AUTO_TENERE} giorni.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
      <button class="btn-outline" onclick="backupAutoOra()">${ico('save', 'tinted', '')} ${e.stato === 'pausa' ? 'Riprendi' : 'Salva ora'}</button>
      <button class="btn-outline" onclick="backupAutoScegli()">${ico('folder', 'tinted', '')} Cambia cartella</button>
      <button class="btn-outline" onclick="backupAutoDisattiva()">Disattiva</button>
    </div>`;
}
function renderBackup() {
  return `${renderArchivioCondiviso()}<div class="cloud-section">
    <div style="flex:1">
      <strong>${ico('save', 'tinted', '')} Backup locale</strong>
      <p>I dati sono salvati nel browser (${inIndexedDb() ? 'IndexedDB' : 'localStorage'}). Esporta un file JSON per conservare un backup o trasferire i dati su un altro PC. L'import sovrascrive i dati attuali.</p>
      <p><strong>I documenti d'archivio sì, i vecchi file no.</strong> Di un documento d'archivio il backup porta il <em>percorso</em> dentro la cartella, che è un dato come gli altri: ripristinandolo su un PC che ha la sua copia dell'archivio i collegamenti valgono ancora. I file caricati <em>dentro</em> Bomtrack prima della 0.78.0 restano invece fuori dal JSON — sono byte, e nel JSON non ci starebbero — quindi il backup ne porta l'<em>elenco</em> e non il contenuto: si vede che cosa manca invece di trovare una scheda vuota. Prima di trasferirsi su un altro PC vanno riscaricati a mano dalla scheda Allegati di ciascun articolo.</p>
      ${dbSizeLine()}
      ${backupLine()}
      ${persistenzaLine()}
      ${backupAutoLine()}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <button class="add-btn-sm" onclick="exportBackup()">${ico('download', 'tinted', '')} Esporta JSON</button>
        <button class="btn-outline" onclick="document.getElementById('import-file').click()">${ico('upload', 'tinted', '')} Importa JSON</button>
        <input type="file" id="import-file" accept="application/json,.json" style="display:none" onchange="importBackup(event)">
        <button class="btn-outline" onclick="allegatiPulisci()">${ico('trash', 'tinted', '')} Recupera spazio allegati</button>
        <button class="btn-outline" style="color:var(--red);border-color:var(--red)" onclick="resetDB()">↺ Ripristina dati esempio</button>
      </div>
    </div></div>
  ${renderArchivio()}
  ${renderTrash()}
  ${renderStorico()}
  ${renderDuplicateCodes()}
  ${renderSerieDocumenti()}
  <div class="cloud-section" style="margin-top:16px">
    <div style="flex:1">
      <strong>${ico('warning', 'tinted', '')} Registro errori</strong>
      <p>Gli errori non previsti di questa sessione (al massimo gli ultimi ${ERROR_LOG_MAX}). Serve a chi ripara: si azzera ricaricando la pagina, quindi va scaricato prima.
        ${appErrorLog().length ? `<strong style="color:var(--red)">${appErrorLog().length} errori registrati.</strong>` : 'Nessun errore finora.'}</p>
      <div style="margin-top:8px">
        <button class="btn-outline" onclick="downloadErrorLog()">${ico('download', 'tinted', '')} Scarica registro errori</button>
      </div>
    </div></div>
  <div class="cloud-section" style="border-color:var(--red);margin-top:16px">
    <div style="flex:1">
      <strong style="color:var(--red)">${ico('trash', 'tinted', '')} Azzera tutto</strong>
      <p>Svuota completamente il database: articoli, distinte, richieste, ordini, fornitori, famiglie, centri di lavoro, unità di misura, dati azienda e impostazioni. Non restano nemmeno i dati di esempio. <strong>L'operazione è irreversibile</strong>: esporta prima un backup JSON.</p>
      <div style="margin-top:8px">
        <button class="btn-outline" style="color:var(--red);border-color:var(--red)" onclick="wipeAll()">${ico('trash', 'tinted', '')} AZZERA TUTTO</button>
      </div>
    </div></div>`;
}
// ─── Cestino ───
// Le eliminazioni non spariscono più: restano qui per TRASH_DAYS giorni, poi se
// ne vanno da sole al caricamento successivo. L'annulla nel toast copre il
// pentimento immediato; questo copre quello di domani mattina.
const TRASH_LABELS = { items: 'Articolo', suppliers: 'Fornitore', customers: 'Cliente', workCenters: 'Centro di lavoro',
  families: 'Macrofamiglia', rfqs: 'Richiesta', orders: 'Ordine', workOrders: 'Ordine di lavoro', plans: 'Piano', users: 'Utente',
  jobs: 'Commessa', movements: 'Movimento', receipts: 'Ricevimento', revisions: 'Revisione',
  prodOrders: 'Ordine di produzione', prodDecls: 'Dichiarazione di produzione', reminders: 'Promemoria' };
function trashDescr(t) {
  const r = t.record || {};
  return r.number || r.code || r.name || r.title || '(senza nome)';
}
function renderTrash() {
  const voci = Store.trashList();
  if (!voci.length) {
    return `<div class="cloud-section" style="margin-top:16px">
      <div style="flex:1">
        <strong>${ico('trash', 'tinted', '')} Cestino</strong>
        <p>Vuoto. Ciò che elimini resta qui <strong>${TRASH_DAYS} giorni</strong> e si può rimettere a posto; passati quelli sparisce da solo.</p>
      </div></div>`;
  }
  const righe = voci.map(t => `<div class="mgmt-item">
      <span style="width:140px">${esc(TRASH_LABELS[t.coll] || t.coll)}</span>
      <span style="flex:1;font-family:var(--mono)">${esc(trashDescr(t))}</span>
      <span class="empty-text" style="padding:0">${esc(String(t.deletedAt || '').slice(0, 10))}${t.deletedBy ? ' · ' + esc(actorName(t.deletedBy)) : ''}</span>
      <button class="btn-ghost" onclick="restoreFromTrash('${t.id}')">↶ Ripristina</button>
      <button class="mini-btn danger" title="Elimina definitivamente" onclick="purgeFromTrash('${t.id}')">${ico('trash', 'tinted', 'Elimina definitivamente')}</button>
    </div>`).join('');
  return `<div class="cloud-section" style="margin-top:16px">
    <div style="flex:1">
      <strong>${ico('trash', 'tinted', '')} Cestino — ${voci.length} ${voci.length === 1 ? 'elemento' : 'elementi'}</strong>
      <p>Eliminazioni degli ultimi <strong>${TRASH_DAYS} giorni</strong>, recuperabili. Passata quella finestra spariscono da sole al caricamento successivo: il cestino non deve diventare il posto dove il database cresce senza che nessuno guardi.</p>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">${righe}</div>
      <div style="margin-top:10px"><button class="btn-outline" style="color:var(--red);border-color:var(--red)" onclick="emptyTrashConfirm()">Svuota il cestino</button></div>
    </div></div>`;
}
function restoreFromTrash(trashId) {
  if (!roleGuard('manage')) return;
  const t = Store.restore(trashId);
  renderManage();
  showToast(t ? `${TRASH_LABELS[t.coll] || t.coll} "${trashDescr(t)}" ripristinato` : (Store.rifiutoRipristino() || 'Voce non trovata'), t ? 'success' : 'error');
}
function purgeFromTrash(trashId) {
  if (!roleGuard('manage')) return;
  askConfirm('Eliminare definitivamente questa voce? Da qui in poi non si recupera più.', () => {
    Store.purge(trashId); renderManage(); savedToast('Eliminato definitivamente');
  });
}
function emptyTrashConfirm() {
  if (!roleGuard('manage')) return;
  const n = Store.trashList().length;
  askConfirm(`Svuotare il cestino? ${n} ${n === 1 ? 'elemento' : 'elementi'} non saranno più recuperabili.`, () => {
    Store.emptyTrash(); renderManage(); savedToast('Cestino svuotato');
  });
}

// ─── Controllo dati: codici articolo duplicati ───
// Da questa versione l'app impedisce di crearne di nuovi, ma i duplicati già a
// catalogo restano, e vanno sciolti a mano prima che il codice diventi un
// vincolo del database condiviso. Qui si mostrano; a decidere quale tenere è
// una persona — rinominarli in automatico cambierebbe un identificativo
// aziendale di nascosto, e quel codice sta su disegni e ordini già emessi.
function renderDuplicateCodes() {
  const gruppi = duplicateCodeGroups();
  const bordo = gruppi.length ? 'var(--red)' : 'var(--border, #2a2a2a)';
  if (!gruppi.length) {
    return `<div class="cloud-section" style="margin-top:16px">
      <div style="flex:1">
        <strong>${ico('search', 'tinted', '')} Controllo dati</strong>
        <p>Nessun codice articolo duplicato. È la condizione che l'import massivo dà per scontata: cercando un codice risolve sempre sul primo articolo trovato.</p>
      </div></div>`;
  }
  const quanti = gruppi.reduce((n, g) => n + g.items.length, 0);
  const righe = gruppi.map(g => `<div class="mgmt-item" style="display:block">
      <div style="font-family:var(--mono);font-weight:700;color:var(--red)">${esc(g.code)} — ${g.items.length} articoli</div>
      ${g.items.map(i => `<div style="display:flex;align-items:center;gap:8px;margin-top:4px">
          <span class="picker-type">${typeLabel(i.type)}</span>
          <span style="flex:1">${esc(i.name || '(senza nome)')}</span>
          <button class="btn-ghost" onclick="editItemModal('${i.id}')">${ico('edit', 'tinted', '')} Apri</button>
        </div>`).join('')}
    </div>`).join('');
  return `<div class="cloud-section" style="border-color:${bordo};margin-top:16px">
    <div style="flex:1">
      <strong style="color:var(--red)">${ico('search', 'tinted', '')} Controllo dati — ${gruppi.length} codici duplicati</strong>
      <p><strong>${quanti} articoli condividono ${gruppi.length} codici.</strong> L'import massivo cerca gli articoli per codice e risolve sempre sul primo trovato: reimportando un foglio, le righe di questi codici finiscono tutte sullo stesso articolo e le altre restano indietro, senza segnalazione.</p>
      <p>Vanno sciolti a mano: apri ciascun articolo e dagli un codice suo. L'app non li rinomina da sola — quel codice sta su disegni e ordini già emessi, e sceglierne uno al posto tuo sarebbe peggio del problema.</p>
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:10px">${righe}</div>
    </div></div>`;
}

// Lo stesso controllo per i numeri dei documenti (dalla 0.105.6): doppioni e
// buchi delle serie di quest'anno e dell'anno scorso — vedi
// controlloSerieDocumenti() in core.js. Come per i codici, l'app non rinumera
// niente da sola: un numero sta già su un ordine spedito o su una fattura.
const SERIE_APRI = {
  RFQ: id => { setView('rfq'); openRfqEdit(id); },
  ODA: id => { setView('orders'); openOrderEdit(id); },
  ODL: id => { setView('odl'); openOdlEdit(id); },
  ODP: id => { setView('odp'); openOdpEdit(id); },
  FAB: id => { setView('mrp'); openPlanEdit(id); },
  COM: id => { setView('jobs'); openJobEdit(id); },
  // Una modifica tecnica sta dentro la sua revisione: si apre l'articolo.
  MT: id => { const r = getRevision(id); if (r) apriAnelloDistinta(r.itemId); },
};
function apriDocumentoDiSerie(sigla, id) { if (SERIE_APRI[sigla]) SERIE_APRI[sigla](id); }
function renderSerieDocumenti() {
  const anno = new Date().getFullYear();
  const serie = controlloSerieDocumenti([anno, anno - 1]);
  if (!serie.length) {
    return `<div class="cloud-section" style="margin-top:16px"><div style="flex:1">
      <strong>${ico('search', 'tinted', '')} Numeri dei documenti</strong>
      <p>Nessun numero doppio e nessun buco nelle serie del ${anno} e del ${anno - 1}.</p>
    </div></div>`;
  }
  const MAX_BUCHI = 30;
  const blocchi = serie.map(s => {
    const doppi = s.doppi.map(d => `<div style="margin-top:4px">
        <span style="font-family:var(--mono);font-weight:700;color:var(--red)">${esc(d.numero)}</span> — ${d.docs.length} documenti:
        ${d.docs.map((doc, i) => `<button class="btn-ghost" onclick="apriDocumentoDiSerie('${s.sigla}', ${esc(JSON.stringify(String(doc.id)))})">${ico('edit', 'tinted', '')} ${i + 1}°${doc.date ? ' del ' + esc(String(doc.date).slice(0, 10)) : ''}</button>`).join(' ')}
      </div>`).join('');
    const buchi = s.buchi.length
      ? `<div style="margin-top:4px">${s.buchi.length === 1 ? 'Manca 1 numero' : `Mancano ${s.buchi.length} numeri`} sotto il ${String(s.massimo).padStart(3, '0')}:
          <span style="font-family:var(--mono)">${s.buchi.slice(0, MAX_BUCHI).map(n => String(n).padStart(3, '0')).join(', ')}${s.buchi.length > MAX_BUCHI ? ` e altri ${s.buchi.length - MAX_BUCHI}` : ''}</span></div>`
      : '';
    return `<div class="mgmt-item" style="display:block">
      <div style="font-family:var(--mono);font-weight:700">${esc(s.prefisso)}…</div>${doppi}${buchi}</div>`;
  }).join('');
  const conDoppi = serie.some(s => s.doppi.length);
  return `<div class="cloud-section" style="border-color:${conDoppi ? 'var(--red)' : 'var(--orange)'};margin-top:16px">
    <div style="flex:1">
      <strong style="color:${conDoppi ? 'var(--red)' : 'var(--orange)'}">${ico('search', 'tinted', '')} Numeri dei documenti — ${serie.length} serie da guardare</strong>
      <p>Un numero doppio nasce da un ripristino o da due PC che numeravano ciascuno per conto suo; un buco da una prenotazione dell'archivio condiviso mai usata. L'app non rinumera niente da sola: quel numero può essere già su un ordine spedito. Apri i documenti, decidi quale tiene il numero e, se serve, annota il buco per chi controlla.</p>
      <div style="margin-top:10px;display:flex;flex-direction:column;gap:10px">${blocchi}</div>
    </div></div>`;
}

// Il riquadro dell'archivio condiviso, in testa al Backup: dice dove stanno
// i dati e porta alla scheda del collegamento (cloud.js).
function renderArchivioCondiviso() {
  const c = cloudConfig();
  return `<div class="cloud-section" style="margin-bottom:16px"><div style="flex:1">
    <strong>${ico('cloud', 'tinted', '')} Archivio condiviso</strong>
    ${c ? `<p>Questo PC lavora sull'archivio condiviso di <strong>${esc(c.url)}</strong>. I dati di questo browser sono la sua copia: le modifiche partono da sole, e quelle dei colleghi arrivano ogni 25 secondi.</p>`
      : `<p>Oggi i dati stanno solo in questo browser. Con un progetto Supabase diventano un archivio unico per tutti i colleghi, con i permessi dei ruoli applicati dal server. Prima di collegare: un PC solo porta i dati buoni, gli altri li scaricano.</p>`}
    <div style="margin-top:8px"><button class="${c ? 'btn-outline' : 'add-btn-sm'}" onclick="cloudPannello()">${ico('cloud', 'tinted', '')} ${c ? 'Stato e collegamento' : 'Collega un archivio condiviso'}</button></div>
  </div></div>`;
}
function exportBackup() {
  // Il backup contiene tutto, utenti e hash compresi: solo agli amministratori
  if (!roleGuardRuolo('manage')) return;
  const blob = new Blob([Store.exportSnapshot()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `bomtrack_backup_${oggiISO()}.json`;
  a.click(); URL.revokeObjectURL(url);
  registraBackup();
  showToast('Backup esportato');
}
function importBackup(ev) {
  if (!roleGuard('manage')) return;
  if (cloudBlocca(ev)) return;
  const file = ev.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    // Il JSON illeggibile e il JSON valido ma non nostro sono due problemi
    // diversi, e chi sta importando ha bisogno di sapere quale dei due ha.
    try { data = JSON.parse(reader.result); }
    catch (e) { showToast('Il file non è un JSON leggibile: potrebbe essere troncato', 'error'); return; }
    const err = validateSnapshot(data);
    if (err) { showToast('Backup non valido: ' + err, 'error'); return; }
    // Si dice cosa sta per entrare PRIMA di sovrascrivere: dai numeri si
    // riconosce al volo un backup sbagliato o vecchio di mesi.
    const n = snapshotCounts(data);
    const cosa = [`${n.items} articoli`, `${n.suppliers} fornitori`, `${n.rfqs} richieste`,
      `${n.orders} ordini`, `${n.plans} piani`, `${n.users} utenti`].join(', ');
    const attuale = `${db.items.length} articoli, ${db.suppliers.length} fornitori, ${db.rfqs.length} richieste, ${db.orders.length} ordini`;
    askConfirm(`Il backup contiene: ${cosa}.\n\nSostituirà i dati attuali (${attuale}). Prima ne salvo una copia.`, () => copiaPrimaDi('import', copia => {
      try {
        Store.importSnapshot(data);
      } catch (e) { showToast('Import non riuscito: ' + e.message, 'error'); return; }
      resetViewState();
      if (!reconcileSession()) return;   // il backup può contenere altri utenti
      setView('bom'); showToast(copia ? 'Backup importato. I dati di prima sono in ' + copia : 'Backup importato');
    }), { title: '📥 Importa backup', ok: 'Importa e sovrascrivi' });
  };
  reader.onerror = () => { console.error(reader.error); showToast('Impossibile leggere il file', 'error'); };
  reader.readAsText(file);
  ev.target.value = '';
}
function resetDB() {
  if (cloudBlocca()) return;
  if (!roleGuard('manage')) return;
  askConfirm('Ripristinare i dati di esempio? I dati attuali saranno sostituiti: prima ne salvo una copia.', () => copiaPrimaDi('ripristino', copia => {
    Store.reset();
    resetViewState();
    if (!reconcileSession()) return;
    setView('bom'); showToast(copia ? 'Dati ripristinati. Quelli di prima sono in ' + copia : 'Dati ripristinati');
  }), { title: '↩ Ripristina dati di esempio', ok: 'Ripristina' });
}
// Dopo un reset o un import il database sotto i piedi è cambiato: l'utente della
// sessione può non esserci più. Se il nuovo database non ha utenti si ricrea
// (chi ha appena ripristinato resta dentro); se ne ha altri si esce e si rientra.
function reconcileSession() {
  if (!currentUser) return true;
  const mine = getUser(currentUser.id);
  if (mine) { currentUser = mine; renderUserPill(); return true; }
  if (!userList().length) {
    const u = JSON.parse(JSON.stringify(currentUser));
    u.role = 'admin'; u.active = true;
    Store.insert('users', u);
    currentUser = u; renderUserPill(); return true;
  }
  showToast('Il database importato ha altri utenti: accedi di nuovo', 'error');
  logout();
  return false;
}
// Azzeramento totale: doppia conferma, la seconda va digitata (il click distratto non basta).
function wipeAll() {
  if (!roleGuard('manage')) return;
  if (cloudBlocca()) return;
  const size = Store.sizeInfo();
  openModal(`<h3>${ico('warning', 'tinted pill', '')} Azzera tutto</h3>
    <p class="confirm-text">Il database verrà svuotato <strong>completamente</strong> e in modo <strong>irreversibile</strong>:
      ${db.items.length} articoli, ${db.rfqs.length} richieste, ${db.orders.length} ordini, ${(db.plans || []).length} piani
      (${size.mb.toFixed(2)} MB). Resti dentro come amministratore, tutto il resto sparisce.</p>
    <p class="confirm-text">Prima di azzerare ne salvo una copia: nella cartella del backup automatico, se è attivo, altrimenti come file scaricato. Scrivi <strong>AZZERA</strong> qui sotto per confermare.</p>
    <div class="modal-field"><input id="wipe-word" placeholder="AZZERA" autocomplete="off"
      style="text-transform:uppercase;font-family:var(--mono);font-weight:700"></div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="btn-outline" onclick="exportBackup()">${ico('save', 'tinted', '')} Esporta backup ora</button>
      <button class="add-btn-sm btn-danger" onclick="wipeAllConfirm()">Azzera tutto</button>
    </div>`, false, 'confirm');
}
function wipeAllConfirm() {
  if (!roleGuard('manage')) return;
  if (val('wipe-word').toUpperCase() !== 'AZZERA') { showToast('Scrivi AZZERA per confermare', 'error'); return; }
  closeModal();
  return copiaPrimaDi('azzera', copia => {
    // L'utente che azzera sopravvive come amministratore: la sessione resta valida
    Store.clearAll(currentUser ? JSON.parse(JSON.stringify(currentUser)) : null);
    currentUser = currentUser ? getUser(currentUser.id) : null;
    resetViewState();
    renderUserPill();
    setView('bom'); showToast(copia ? 'Database azzerato. I dati di prima sono in ' + copia : 'Database azzerato');
  });
}
// Nessun documento o articolo sopravvive a un reset: azzera anche ciò che le viste tengono aperto
function resetViewState() {
  currentBomId = null; reportBomId = null;
  currentRfqId = null; currentOrderId = null;
  rfqView = 'list'; orderView = 'list';
  rfqUnlockedId = null; orderUnlockedId = null;
  rfqDirty = false; orderDirty = false;
  rfqCompareSel = []; bomExpanded = new Set(); favOnly = false;
  // Dalla funzione che li disegna, non a mano: scritti qui, i due estremi del
  // filtro per periodo erano già rimasti fuori il giorno stesso in cui sono nati.
  docFilters.rfq = docFiltersVuoti();
  docFilters.order = docFiltersVuoti();
}

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
// Async per un solo motivo: aprire l'archivio in IndexedDB richiede di
// aspettare. Da lì in poi tutto è sincrono come prima.
async function init() {
  await Store.preparaArchivio();
  if (Store.archivio === 'indexeddb') aggiornaStimaSpazio();
  Store.load();
  // Un anello ricevuto nella sessione precedente è ancora lì: l'avviso deve
  // tornare anche dopo aver ricaricato la pagina (dalla 0.105.6).
  controllaAnelliDopoArrivo();
  cloudAvvio();
  const ver = 'v' + APP_VERSION;
  ['app-version', 'app-version-login'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = ver;
  });
  // Sessione salvata → si rientra diretti; altrimenti accesso (o setup del primo admin)
  // Un link d'invito, di recupero password o di collegamento prende lui la
  // schermata d'accesso (cloud.js).
  if (cloudAllAvvio()) renderLogin();
  else if (!restoreSession()) renderLogin();
  richiediPersistenza();
  backupAutoAvvia();
}
// Nel browser parte da sé; sotto test (Node, nessun DOM) il file si carica
// senza avviare l'app, così la suite può pilotare Store e il motore di costo.
if (typeof document !== 'undefined') init();
