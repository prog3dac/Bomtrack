// ═══════════════════════════════════════════════════════════
//  BOMTRACK — cloud-map.js
// ═══════════════════════════════════════════════════════════
// Traduzione fra la forma locale (un documento annidato per collezione) e la
// forma normalizzata del database condiviso (una riga per tabella).
// Funzioni pure: nessun DOM, nessuna rete, nessun accesso a `db`. Si ricevono i
// dati e si restituiscono dati — è ciò che le rende verificabili per intero
// senza un backend, ed è il pezzo con più probabilità di bug silenziosi.
//
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
//
// ── Perché serve `pos` ──
// Gli array JSON sono ordinati, le righe di una tabella no. Senza una colonna
// di posizione, l'ordine dei componenti di una distinta e delle righe di un
// ordine si rimescolerebbe a ogni lettura dal server. Su una richiesta di
// offerta stampata in PDF è un difetto che si vede subito; in una distinta è
// peggio, perché non si vede.
//
// ── Perché serve un id anche dove non c'era ──
// `components`, `operations` e le righe di ciclo non hanno un id proprio: in
// locale la loro identità è la posizione nell'array. Una tabella ha bisogno di
// una chiave primaria, e viene costruita qui in modo deterministico
// (`itemId#nomeArray#posizione`): stesso dato, stessa chiave, a ogni giro. Non
// è un'identità stabile nel tempo — spostare una riga ne cambia la chiave — e
// non pretende di esserlo: quelle tre tabelle si sincronizzano sostituendo
// l'insieme intero (`merge: 'replace'` nel registro dello schema), proprio
// perché un'identità di riga lì non esiste.

// ── Perché serve `childSets` ──
// In una tabella, «nessuna riga» è l'unica rappresentazione possibile del
// vuoto: un array figlio vuoto e un array figlio assente diventano la stessa
// cosa. Sembra una sfumatura e non lo è. Un assieme la cui distinta è stata
// svuotata a mano ha `components: []`; un commerciale non ha `components`
// affatto. Se al ritorno dal server l'assieme si ritrovasse senza il campo,
// un `it.components.push(...)` (aggiunta componente) lancerebbe.
// La riga padre porta quindi l'elenco degli array che aveva davvero. È una
// colonna di testo in più, e risparmia di dover indovinare.
const CHILD_KEY_SEP = '#';
function childRowId(parentId, arrayName, pos) {
  return String(parentId) + CHILD_KEY_SEP + arrayName + CHILD_KEY_SEP + pos;
}

// db annidato → { tabella: [righe] }.
// Ogni riga figlia porta la chiave del padre, la posizione e il proprio id.
// `opts.stripSecrets` toglie i campi che non devono lasciare il browser (gli
// hash delle password): il backend ha la propria autenticazione, e un hash
// spedito è un hash in più in giro per niente.
// `opts.stripDerived` toglie dalle righe figlie i campi che lo Store ricava da
// altre collezioni (`derived` nel registro, oggi `received`): sono una lettura,
// e inviarli farebbe vincere la copia dell'ultimo arrivato sulla somma degli
// eventi. Il giro completo resta esatto senza l'opzione.
function flattenDB(source, opts) {
  const o = opts || {};
  const out = {};
  const schema = (typeof SCHEMA !== 'undefined') ? SCHEMA : {};
  Object.keys(schema).forEach(coll => {
    const def = schema[coll];
    const figli = def.children || {};
    out[def.table] = [];
    Object.keys(figli).forEach(a => { out[figli[a].table] = []; });

    (source[coll] || []).forEach((rec, i) => {
      if (!rec || rec.id == null) return;
      const riga = {};
      const presenti = [];
      Object.keys(rec).forEach(k => {
        if (figli[k]) { if (Array.isArray(rec[k])) presenti.push(k); return; }   // gli array figli vanno nelle loro tabelle
        if (o.stripSecrets && (def.secret || []).includes(k)) return;
        riga[k] = rec[k];
      });
      // `pos` e `childSets` sono nomi che questa traduzione si prende: servono a
      // nestDB() per rimettere le righe nell'ordine e per sapere quali array
      // ricostruire, e nestDB() poi li toglie. Se un record di dominio arrivasse
      // a portare un campo con uno di questi due nomi, il giro completo —
      // nestDB(flattenDB(x)) === x, che test/cloudmap.test.js verifica — smetterebbe
      // di valere in silenzio. Meglio accorgersene qui che dalle righe sbagliate.
      if (rec.pos !== undefined || rec.childSets !== undefined) {
        throw new Error('flattenDB: il record ' + coll + '/' + rec.id
          + ' usa un nome riservato alla traduzione (pos, childSets)');
      }
      riga.pos = i;
      if (presenti.length) riga.childSets = presenti.join(',');
      out[def.table].push(riga);

      Object.keys(figli).forEach(a => {
        const cdef = figli[a];
        (rec[a] || []).forEach((child, j) => {
          if (!child) return;
          const r = Object.assign({}, child);
          if (o.stripDerived) (cdef.derived || []).forEach(k => { delete r[k]; });
          r.parentId = rec.id;
          r.pos = j;
          // Con un id proprio si conserva quello: è l'identità che il merge per
          // riga userà. Senza, se ne costruisce una deterministica.
          if (!(cdef.rowId && r[cdef.rowId] != null)) r.id = childRowId(rec.id, a, j);
          out[cdef.table].push(r);
        });
      });
    });
  });
  return out;
}

// { tabella: [righe] } → db annidato.
// Inverso esatto di flattenDB: `nestDB(flattenDB(x))` deve ridare `x`, ed è la
// proprietà che la suite verifica su tutte le fixture. `pos` decide l'ordine e
// poi sparisce, perché in locale l'ordine è già quello dell'array e tenersi la
// colonna significherebbe due fonti di verità per la stessa cosa.
function nestDB(tables, extra) {
  const out = Object.assign({}, extra || {});
  const schema = (typeof SCHEMA !== 'undefined') ? SCHEMA : {};
  Object.keys(schema).forEach(coll => {
    const def = schema[coll];
    const figli = def.children || {};

    // Righe figlie raggruppate per padre, ordinate per posizione.
    const perPadre = {};
    Object.keys(figli).forEach(a => {
      const cdef = figli[a];
      const gruppi = new Map();
      ordinaPerPos(tables[cdef.table] || []).forEach(r => {
        let l = gruppi.get(r.parentId);
        if (!l) { l = []; gruppi.set(r.parentId, l); }
        const pulita = Object.assign({}, r);
        delete pulita.parentId; delete pulita.pos;
        // L'id costruito da flattenDB non esisteva nel documento locale: si
        // toglie, altrimenti il round-trip aggiungerebbe un campo che prima non
        // c'era e ogni confronto direbbe "cambiato".
        if (!cdef.rowId) delete pulita.id;
        l.push(pulita);
      });
      perPadre[a] = gruppi;
    });

    out[coll] = ordinaPerPos(tables[def.table] || []).map(riga => {
      const rec = Object.assign({}, riga);
      delete rec.pos; delete rec.childSets;
      // Solo gli array che il padre aveva davvero: un articolo commerciale non
      // ha `components`, e inventarglielo vuoto lo farebbe risultare modificato
      // a ogni lettura. `childSets` distingue il vuoto dall'assente; se manca
      // (righe scritte a mano, o da una versione precedente) si ricade sulla
      // presenza di righe figlie, che è l'informazione che resta.
      const dichiarati = riga.childSets != null ? String(riga.childSets).split(',').filter(Boolean) : null;
      Object.keys(figli).forEach(a => {
        const l = perPadre[a].get(riga.id);
        if (dichiarati ? dichiarati.includes(a) : !!l) rec[a] = l || [];
      });
      return rec;
    });
  });
  return out;
}

// Ordinamento stabile per `pos`. Le righe senza posizione (scritte da una
// versione precedente, o da una mano umana) restano nell'ordine in cui sono
// arrivate, in coda: meglio un ordine arbitrario ma ripetibile che uno che
// cambia a ogni lettura.
function ordinaPerPos(righe) {
  return righe.map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const pa = Number.isFinite(a.r.pos) ? a.r.pos : Infinity;
      const pb = Number.isFinite(b.r.pos) ? b.r.pos : Infinity;
      return pa === pb ? a.i - b.i : pa - pb;
    })
    .map(x => x.r);
}

// Le tabelle toccate da un insieme di modifiche (l'esito di Store.pendingChanges()).
// Serve all'adapter per sapere cosa mandare senza rispedire tutto.
//
// Nell'app non la chiama nessuno, e non è una dimenticanza: è il seam del futuro
// adapter cloud, come pendingChanges() e takeChanges(). Sta qui provata e pronta
// perché il giorno in cui il backend arriva non si debba anche inventarla.
function tablesForChanges(changes) {
  const out = [];
  const schema = (typeof SCHEMA !== 'undefined') ? SCHEMA : {};
  Object.keys(changes || {}).forEach(coll => {
    const def = schema[coll];
    if (!def) return;
    out.push(def.table);
    Object.keys(def.children || {}).forEach(a => out.push(def.children[a].table));
  });
  return out;
}

// ═══════════════════════════════════════════════════════════
//  Righe locali ↔ righe del database (nomi delle colonne e tipi)
// ═══════════════════════════════════════════════════════════
// flattenDB() produce righe con i nomi del codice — `unitCost`, `parentId` —
// mentre le tabelle hanno i nomi di SQL: `unit_cost`, `item_id`. E il modello
// locale scrive `''` per «vuoto» anche dove una colonna `numeric`, `date` o
// `uuid` vuole NULL: Postgres rifiuterebbe la riga, e con lei l'intero invio.
// Qui sta la traduzione, in tutte e due le direzioni, separata da flattenDB()
// perché quella resta l'inverso esatto del documento locale e questa no:
// un `''` che va al server come NULL torna come NULL.
//
// La convenzione è una sola — camelCase → snake_case — e le eccezioni sono
// scritte qui sotto, per tabella. Un campo che nessuno ha dichiarato passa con
// il nome convertito: se la colonna non esiste il server lo rifiuta **ad alta
// voce**, che è meglio di un elenco chiuso che lo butterebbe in silenzio.

// La colonna che riporta la riga figlia al padre (`parentId` in flattenDB).
// `rename`: dove la convenzione non basta. Nelle righe di distinta e di ciclo
// `itemId` è il **figlio**, e `item_id` è già il padre; in `item_prices`
// `desc` è una parola riservata di SQL.
// `drop`: campi che servono solo in locale e non hanno una colonna.
// `id`: il tipo della chiave quando non è un uuid — le righe senza identità
// propria hanno una chiave costruita (`itemId#components#0`), che è testo.
// `types`: dove lo stesso nome ha un altro tipo. Negli **eventi** (movimenti,
// dichiarazioni, avanzamenti, revisioni) `date` è l'istante in cui è successo
// (`nowISO()`), non un giorno di calendario: lì è `timestamptz`.
const EVENTO = { date: 'timestamptz' };
const CLOUD_TABLES = {
  items: { drop: ['priceListSeeded'] },
  stock_movements: { types: EVENTO },
  production_declarations: { types: EVENTO },
  productions: { types: EVENTO },
  item_revisions: { types: EVENTO },
  item_components: { parent: 'item_id', rename: { itemId: 'child_item_id' }, id: 'text' },
  item_operations: { parent: 'item_id', id: 'text' },
  item_cycle_rows: { parent: 'item_id', rename: { itemId: 'child_item_id' }, id: 'text' },
  item_prices: { parent: 'item_id', rename: { desc: 'description' } },
  item_alternatives: { parent: 'item_id', rename: { itemId: 'alt_item_id' }, id: 'text' },
  item_options: { parent: 'item_id', id: 'text', types: { choices: 'jsonb' } },
  sub_families: { parent: 'family_id' },
  work_center_suppliers: { parent: 'work_center_id' },
  rfq_lines: { parent: 'rfq_id' },
  order_lines: { parent: 'order_id' },
  work_order_lines: { parent: 'work_order_id' },
  production_plan_lines: { parent: 'plan_id' },
  production_plan_substitutions: { parent: 'plan_id' },
  production_order_phases: { parent: 'production_order_id' },
  production_order_materials: { parent: 'production_order_id' },
};

// Il tipo SQL delle colonne che non sono testo, per nome del campo locale.
// Vale per tutte le tabelle: lo stesso nome ha lo stesso significato ovunque,
// ed è una regola che il modello rispetta già. I campi `…Id` sono uuid
// (eccetto quelli in COLONNE_TESTO_ID); tutto il resto è testo.
const CLOUD_TYPES = (() => {
  const t = {};
  ['qty', 'price', 'minQty', 'leadDays', 'scrapPct', 'hours', 'days', 'rate', 'cost', 'costOverride',
    'unitCost', 'purchasePrice', 'altFactor', 'overheadPctOverride', 'marginPctOverride', 'hourlyRate',
    'capacityHours', 'hoursPerDay', 'queueDays', 'setupHours', 'transitDays', 'assemblyDays', 'received', 'perPezzo', 'scrap', 'lotSize', 'safetyStock', 'size'].forEach(k => { t[k] = 'numeric'; });
  ['pos', 'runFrom', 'runTo', 'seq', 'opIndex', 'passata', 'page', 'incrDigitsN', 'incrDigitsS', 'gCodeLen'].forEach(k => { t[k] = 'int'; });
  ['everyDays', 'everyHours'].forEach(k => { t[k] = 'numeric'; });
  ['date', 'dueDate', 'deliveryDate', 'confirmedDate', 'startDate', 'plannedStart', 'plannedEnd', 'downFrom', 'downTo'].forEach(k => { t[k] = 'date'; });
  ['createdAt', 'updatedAt', 'deletedAt', 'doneAt', 'sentAt', 'codeManualAt', 'startedAt', 'endedAt'].forEach(k => { t[k] = 'timestamptz'; });
  ['active', 'favorite', 'obsolete', 'done', 'codeManual'].forEach(k => { t[k] = 'bool'; });
  ['snapshot', 'record', 'ecoImpact', 'configChoices', 'costSnapshot', 'ricambi'].forEach(k => { t[k] = 'jsonb'; });
  ['createdBy', 'updatedBy', 'deletedBy', 'codeManualBy'].forEach(k => { t[k] = 'uuid'; });
  return t;
})();
// Campi che finiscono in `Id` ma non puntano a un record con chiave uuid: i
// concetti vivono nelle impostazioni, con id leggibili ('cn-albero').
const COLONNE_TESTO_ID = ['conceptId'];
function cloudType(table, campo) {
  const def = CLOUD_TABLES[table] || {};
  if (campo === 'id') return def.id || 'uuid';
  if (def.types && def.types[campo]) return def.types[campo];
  if (CLOUD_TYPES[campo]) return CLOUD_TYPES[campo];
  if (/Id$/.test(campo) && !COLONNE_TESTO_ID.includes(campo)) return 'uuid';
  return 'text';
}

// Al ritorno, NULL torna `''` dove il modello locale scrive `''` per «vuoto»:
// sono le normalizzazioni di migrateDB(), e un `null` lì farebbe risultare
// modificato ogni record al primo confronto. Altrove NULL resta null.
const VUOTO_STRINGA = ['price', 'minQty', 'leadDays', 'deliveryDate', 'dueDate', 'confirmedDate', 'startDate'];
const VUOTO_STRINGA_TABELLA = {
  items: ['familyId', 'subFamilyId', 'groupItemId', 'machineItemId'],
  reminders: ['jobId'],
};

function camelToSnake(k) { return String(k).replace(/[A-Z]/g, c => '_' + c.toLowerCase()); }
function snakeToCamel(k) { return String(k).replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase()); }
const UUID_COLONNA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA_COLONNA = /^\d{4}-\d{2}-\d{2}$/;

// { tabella: [righe di flattenDB] } → { tabella: [righe con i nomi e i tipi del database] }.
// Lancia, con l'elenco dei problemi, se una riga non entrerebbe: un valore che
// non è un numero in una colonna numerica, una data illeggibile, un oggetto
// fuori da una colonna jsonb, un id che non è un uuid. Meglio fermarsi qui,
// tutti insieme e con nome e riga, che alla prima risposta 400 del server.
// `opts.uuid === false` salta il controllo degli id (dati di prova).
function righeCloud(tables, opts) {
  const o = opts || {};
  const out = {};
  const problemi = [];
  const segnala = (tab, r, campo, msg) => { if (problemi.length < 50) problemi.push(`${tab}/${r.id}: ${campo} ${msg}`); };
  Object.keys(tables || {}).forEach(tab => {
    const def = CLOUD_TABLES[tab] || {};
    const via = new Set(def.drop || []);
    out[tab] = (tables[tab] || []).map(r => {
      const riga = {};
      Object.keys(r).forEach(k => {
        if (via.has(k)) return;
        let v = r[k];
        if (v === undefined) return;
        const tipo = k === 'parentId' ? 'uuid' : cloudType(tab, k);
        const col = k === 'parentId' ? (def.parent || 'parent_id')   // ogni tabella figlia è in CLOUD_TABLES; il ripiego è per sicurezza
          : (def.rename && def.rename[k]) || camelToSnake(k);
        if (tipo !== 'text' && v === '') v = null;
        if (v !== null) {
          if (tipo === 'jsonb') { /* qualunque valore */ }
          else if (typeof v === 'object') segnala(tab, r, k, 'è un oggetto, e la colonna non è jsonb');
          else if (tipo === 'numeric' || tipo === 'int') {
            const n = typeof v === 'number' ? v : Number(v);
            if (typeof v === 'boolean' || !Number.isFinite(n)) segnala(tab, r, k, `non è un numero (${JSON.stringify(v)})`);
            else v = n;
          }
          else if (tipo === 'date' && !DATA_COLONNA.test(String(v))) segnala(tab, r, k, `non è una data AAAA-MM-GG (${JSON.stringify(v)})`);
          else if (tipo === 'timestamptz' && !(DATA_COLONNA.test(String(v).slice(0, 10)) && Number.isFinite(Date.parse(v)))) segnala(tab, r, k, `non è un istante leggibile (${JSON.stringify(v)})`);
          else if (tipo === 'bool' && typeof v !== 'boolean') segnala(tab, r, k, `non è vero/falso (${JSON.stringify(v)})`);
          else if (tipo === 'uuid' && o.uuid !== false && !UUID_COLONNA.test(String(v))) segnala(tab, r, k, `non è un uuid (${JSON.stringify(v)})`);
        }
        riga[col] = v;
      });
      return riga;
    });
  });
  if (problemi.length) {
    const e = new Error('righe non valide per il database:\n' + problemi.join('\n'));
    e.problemi = problemi;
    throw e;
  }
  return out;
}

// L'inverso: righe del database → righe come le vuole nestDB().
//
// Due differenze dal giro esatto, entrambe volute:
//  - il server restituisce **ogni** colonna, e quelle che il record locale non
//    aveva tornano `null`. Si tolgono: nel modello locale un campo assente e un
//    campo null dicono la stessa cosa, e dove la presenza conta (`orderId:
//    null` sui movimenti…) la rimette migrateDB(), che gira dopo ogni lettura;
//  - un istante torna come Postgres lo scrive («…+00:00», microsecondi). Si
//    riporta alla forma di toISOString(): l'app confronta le date come
//    stringhe (il cestino, gli ordinamenti), e due forme dello stesso istante
//    si ordinerebbero male.
function righeLocali(tables) {
  const out = {};
  Object.keys(tables || {}).forEach(tab => {
    const def = CLOUD_TABLES[tab] || {};
    const indietro = {};
    Object.keys(def.rename || {}).forEach(k => { indietro[def.rename[k]] = k; });
    const vuoti = new Set(VUOTO_STRINGA.concat(VUOTO_STRINGA_TABELLA[tab] || []));
    out[tab] = (tables[tab] || []).map(r => {
      const riga = {};
      Object.keys(r).forEach(col => {
        const k = (def.parent && col === def.parent) ? 'parentId' : (indietro[col] || snakeToCamel(col));
        let v = r[col];
        if (v === null) {
          if (vuoti.has(k)) riga[k] = '';
          return;
        }
        if (cloudType(tab, k) === 'timestamptz' && typeof v === 'string') {
          const t = Date.parse(v);
          if (Number.isFinite(t)) v = new Date(t).toISOString();
        }
        riga[k] = v;
      });
      return riga;
    });
  });
  return out;
}

// Il percorso intero, nei due sensi. Verso il server si tolgono **sempre** i
// segreti e i campi derivati: queste sono le righe da inviare, non una copia.
function dbVersoCloud(source, opts) {
  return righeCloud(flattenDB(source, { stripSecrets: true, stripDerived: true }), opts);
}
function dbDaCloud(tables, extra) {
  return nestDB(righeLocali(tables), extra);
}
