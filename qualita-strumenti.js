// ═══════════════════════════════════════════════════════════
//  BOMTRACK — qualita-strumenti.js  (modulo Taratura strumenti, dalla 0.153.0)
// ═══════════════════════════════════════════════════════════
// Gli strumenti con cui si collauda, le loro tarature, e il legame con il
// collaudo che li usa.
//
// ── Il problema ──
// Fino alla 0.151 lo strumento era una parola nella caratteristica del piano:
// «Calibro», «tampone 20 H7». Nessuno sapeva quale calibro, se era tarato, né
// in quali collaudi era passato. La ISO 9001 (7.1.5.2) chiede tre cose che con
// una parola non si fanno: strumenti tarati a intervalli stabiliti, il loro
// stato riconoscibile, e — quando uno risulta fuori — sapere se le misure
// prese prima valgono ancora.
//
// ── Come funziona ──
// Ogni strumento ha un codice (quello inciso o sull'etichetta), un tipo e una
// prossima taratura. Lo **stato** non si scrive: si legge dalla scadenza e da
// quello che è successo (in taratura, fuori servizio, dismesso). La taratura
// registrata è l'unico gesto che rimette lo strumento in uso e sposta la
// scadenza, come l'esito del collaudo è l'unico gesto che libera la merce.
//
// Il piano di controllo chiede un **tipo** di strumento («micrometro»); chi
// collauda sceglie **quale** fra quelli validi oggi, e il collaudo ne tiene una
// fotografia (codice e scadenza). Uno strumento scaduto non fa registrare
// l'esito, o lo fa con un avviso: lo decide Gestione → Qualità.
//
// Una taratura che trova lo strumento fuori (as found non conforme) apre una
// non conformità di tipo *Strumento* con i collaudi in cui è stato usato
// dall'ultima taratura buona. Per ogni misura l'app dice se resta valida anche
// spostata dell'errore trovato; la decisione finale resta a chi chiude la NC.
//
// I tipi di strumento stanno nelle impostazioni (come le causali delle NC),
// con id leggibili: si scelgono nel piano e si cambiano in Gestione.

function struAttivo() { return typeof moduloAttivo === 'function' && moduloAttivo('tarature'); }

const STRU_STATI = { attivo: 'In uso', in_taratura: 'In taratura', fuori_servizio: 'Fuori servizio', dismesso: 'Dismesso' };
const STRU_CONTROLLI = { esterna: 'Taratura esterna', interna: 'Verifica interna', nessuna: 'Nessuna, solo indicativo' };
const STRU_PROPRIETARI = { nostro: 'Nostro', cliente: 'Del cliente', fornitore: 'Del fornitore', personale: 'Personale dell\'operatore' };
const TAR_TIPI = { esterna: 'Esterna (laboratorio)', interna: 'Interna' };
const TAR_ESITI = { conforme: 'Conforme', non_conforme: 'Non conforme' };
// Lo stato letto, con l'etichetta e il colore del badge.
const STRU_STATI_VISTA = {
  valido: ['Valido', 'st-evaso'],
  in_scadenza: ['In scadenza', 'st-corso'],
  scaduto: ['Scaduto', 'st-annullato'],
  da_tarare: ['Da tarare', 'st-annullato'],
  in_taratura: ['In taratura', 'st-attesa'],
  fuori_servizio: ['Fuori servizio', 'st-annullato'],
  dismesso: ['Dismesso', 'st-bozza'],
  indicativo: ['Solo indicativo', 'st-bozza'],
};
const STRU_PREAVVISO_SERIE = 30;
const STRU_MESI_SERIE = 12;
// I tipi di serie: quelli di un'officina meccanica. Gli id restano gli stessi
// quando si salvano in Gestione, così un piano che li cita li ritrova.
const STRU_TIPI_SERIE = [
  ['tt-calibro', 'Calibro a corsoio', 12], ['tt-micrometro', 'Micrometro', 12], ['tt-comparatore', 'Comparatore', 12],
  ['tt-tampone', 'Tampone liscio', 12], ['tt-filettato', 'Calibro filettato', 12], ['tt-anello', 'Anello di riscontro', 24],
  ['tt-altimetro', 'Truschino o altimetro', 12], ['tt-durometro', 'Durometro', 12], ['tt-dinamometrica', 'Chiave dinamometrica', 12],
  ['tt-blocchetti', 'Blocchetti piano-paralleli', 24],
].map(([id, name, months]) => ({ id, name, months }));

// ─── Le impostazioni ───
function struTipi() {
  const l = db.settings && Array.isArray(db.settings.qcToolTypes) ? db.settings.qcToolTypes.filter(t => t && t.id && t.name) : null;
  return l && l.length ? l : STRU_TIPI_SERIE;
}
function struTipo(id) { return id ? struTipi().find(t => t.id === id) || null : null; }
function struPreavviso() {
  const g = parseInt(db.settings && db.settings.qcToolWarnDays, 10);
  return g >= 0 && g <= 365 ? g : STRU_PREAVVISO_SERIE;
}
// 'blocca' (di serie) o 'avviso': che cosa fa uno strumento non valido nel collaudo.
function struRegola() { return db.settings && db.settings.qcToolRule === 'avviso' ? 'avviso' : 'blocca'; }

// ─── Leggere ───
function struTutti() { return (db.instruments || []).filter(s => s && s.active !== false); }
function struGet(id) { return id ? (db.instruments || []).find(s => s.id === id) || null : null; }
function struPerCodice(codice) {
  const k = String(codice == null ? '' : codice).trim().toLowerCase();
  if (!k) return null;
  return struTutti().find(s => String(s.code || '').trim().toLowerCase() === k) || struGet(codice);
}
function tarTutte() { return (db.calibrations || []).filter(c => c && c.active !== false); }
function tarGet(id) { return tarTutte().find(c => c.id === id) || null; }
// Le tarature di uno strumento, dalla più recente.
function tarDi(instrumentId) {
  return tarTutte().filter(c => c.instrumentId === instrumentId)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

// Una data più tanti mesi. Il 31 gennaio più un mese è il 28 (o 29) febbraio:
// lo strumento scade prima, mai dopo.
function struPiuMesi(iso, mesi) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  const y = Number(m[1]), mo = Number(m[2]) - 1 + (Math.round(Number(mesi)) || 0), d = Number(m[3]);
  const primo = new Date(Date.UTC(y, mo, 1));
  const fine = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const p = n => String(n).padStart(2, '0');
  return `${primo.getUTCFullYear()}-${p(primo.getUTCMonth() + 1)}-${p(Math.min(d, fine))}`;
}
function struPiuGiorni(iso, giorni) {
  const d = new Date((iso || oggiISO()) + 'T12:00:00');
  d.setDate(d.getDate() + (Number(giorni) || 0));
  return d.toISOString().slice(0, 10);
}
function struMesi(s) {
  const n = parseInt(s && s.intervalMonths, 10);
  if (n > 0) return n;
  const t = struTipo(s && s.typeId);
  return t && Number(t.months) > 0 ? Number(t.months) : STRU_MESI_SERIE;
}

// ─── Lo stato ───
// Calcolato, mai scritto: una scadenza passata stanotte non aspetta che
// qualcuno se ne accorga.
function struStato(s, oggi) {
  if (!s || s.active === false || s.status === 'dismesso') return 'dismesso';
  if (s.status === 'fuori_servizio') return 'fuori_servizio';
  if (s.status === 'in_taratura') return 'in_taratura';
  if (s.control === 'nessuna') return 'indicativo';
  if (!s.nextDue) return 'da_tarare';
  const g = oggi || oggiISO();
  if (s.nextDue < g) return 'scaduto';
  if (s.nextDue <= struPiuGiorni(g, struPreavviso())) return 'in_scadenza';
  return 'valido';
}
// Si può usare per collaudare: valido, anche se scade fra poco.
function struUsabile(s, oggi) { const st = struStato(s, oggi); return st === 'valido' || st === 'in_scadenza'; }
function struBadge(s) {
  const [t, c] = STRU_STATI_VISTA[struStato(s)] || ['—', ''];
  return `<span class="doc-badge ${c}">${esc(t)}</span>`;
}
// La riga grande in testa alla scheda: si legge da lontano.
function struStatoTesto(s) {
  const st = struStato(s);
  const d = s && s.nextDue ? fmtDateIt(s.nextDue) : '';
  return {
    valido: `Valido fino al ${d}`,
    in_scadenza: `In scadenza: valido fino al ${d}`,
    scaduto: `Scaduto il ${d}: non si usa per collaudare`,
    da_tarare: 'Mai tarato: non si usa per collaudare',
    in_taratura: `In taratura${s && s.sentOn ? ' dal ' + fmtDateIt(s.sentOn) : ''}`,
    fuori_servizio: 'Fuori servizio: non si usa per collaudare',
    dismesso: 'Dismesso',
    indicativo: 'Solo indicativo: non si usa per collaudare',
  }[st] || '';
}
// Il motivo per cui non si può usare, detto in poche parole.
function struMotivo(s, oggi) {
  const st = struStato(s, oggi);
  return { scaduto: 'scaduto', da_tarare: 'mai tarato', in_taratura: 'in taratura', fuori_servizio: 'fuori servizio',
    dismesso: 'dismesso', indicativo: 'solo indicativo' }[st] || '';
}
function struScaduti() {
  const g = oggiISO();
  return struTutti().filter(s => ['scaduto', 'da_tarare'].includes(struStato(s, g)));
}
function struInScadenza() { const g = oggiISO(); return struTutti().filter(s => struStato(s, g) === 'in_scadenza'); }

// ─── Dove è stato usato ───
// Le misure di tutti i collaudi che lo citano: { insp, check, data }.
function struUsi(instrumentId) {
  const out = [];
  (typeof qcTutti === 'function' ? qcTutti() : []).forEach(insp => (insp.checks || []).forEach(c => {
    if (c.instrumentId === instrumentId) out.push({ insp, check: c, data: c.instrumentAt || insp.date || '' });
  }));
  return out.sort((a, b) => String(b.data).localeCompare(String(a.data)));
}

// ─── Scrivere ───
// Lo scrive chi scrive in Qualità: l'ufficio e chi collauda in magazzino.
// Intervallo, dismissione ed eliminazione restano all'amministratore.
function struGuard() { return typeof roleGuardShop === 'function' ? roleGuardShop('docs') : roleGuard('docs'); }
function struPuoScrivere() { return canWrite('docs') || (typeof canWriteShop === 'function' && canWriteShop('docs')); }
function struCodiceProssimo() {
  const max = (db.instruments || []).reduce((m, s) => {
    const r = /^STR-(\d+)$/i.exec(String(s.code || '').trim());
    return r ? Math.max(m, parseInt(r[1], 10)) : m;
  }, 0);
  return 'STR-' + String(max + 1).padStart(4, '0');
}
function struCodiceLibero(code, tranne) {
  const k = String(code || '').trim().toLowerCase();
  return !(db.instruments || []).some(s => s.id !== tranne && s.active !== false && String(s.code || '').trim().toLowerCase() === k);
}
// `dati` = { code, name, typeId, control, serial, location, nextDue }.
function struCrea(dati) {
  if (!struGuard()) return null;
  const d = dati || {};
  const code = String(d.code || '').trim() || struCodiceProssimo();
  if (!struCodiceLibero(code)) { showToast(`Il codice ${code} è già di un altro strumento`, 'error'); return null; }
  const tipo = struTipo(d.typeId);
  const name = String(d.name || '').trim() || (tipo ? tipo.name : '');
  if (!name) { showToast('Scrivi che strumento è', 'error'); return null; }
  const nextDue = /^\d{4}-\d{2}-\d{2}$/.test(String(d.nextDue || '')) ? d.nextDue : '';
  return Store.insert('instruments', {
    code, name, typeId: tipo ? tipo.id : '', brand: '', model: '', serial: String(d.serial || '').trim(), rangeText: '',
    resolution: null, ema: null, uom: 'mm', location: String(d.location || '').trim(), holder: '', owner: 'nostro',
    control: STRU_CONTROLLI[d.control] ? d.control : 'esterna', intervalMonths: tipo ? Number(tipo.months) || STRU_MESI_SERIE : STRU_MESI_SERIE,
    labId: null, status: 'attivo', lastCal: '', nextDue, sentOn: '', notes: '', active: true,
  });
}
const STRU_CAMPI = ['code', 'name', 'typeId', 'brand', 'model', 'serial', 'rangeText', 'resolution', 'ema', 'uom', 'location',
  'holder', 'owner', 'control', 'intervalMonths', 'labId', 'notes', 'nextDue', 'lastCal'];
// Ritorna vero se ha scritto. Le date si correggono a mano solo finché non c'è
// una taratura registrata: dopo le scrive la taratura, e un ritocco a mano
// sarebbe una scadenza senza prova.
function struSet(id, campo, valore) {
  if (!struGuard()) return false;
  const s = struGet(id); if (!s || !STRU_CAMPI.includes(campo)) return false;
  if (s.status === 'dismesso') { showToast('Lo strumento è dismesso', 'error'); return false; }
  let v = valore == null ? '' : String(valore).trim();
  if (campo === 'code') {
    if (!v) { showToast('Il codice non può essere vuoto', 'error'); return false; }
    if (!struCodiceLibero(v, id)) { showToast(`Il codice ${v} è già di un altro strumento`, 'error'); return false; }
  }
  if (campo === 'name' && !v) { showToast('Il nome non può essere vuoto', 'error'); return false; }
  if (campo === 'intervalMonths') {
    if (!isAdmin()) { showToast('L\'intervallo di taratura lo cambia l\'amministratore', 'error'); return false; }
    v = parseInt(v, 10);
    if (!(v >= 1 && v <= 120)) { showToast('L\'intervallo va da 1 a 120 mesi', 'error'); return false; }
  }
  if (campo === 'resolution' || campo === 'ema') {
    if (v === '') v = null;
    else {
      v = Number(v.replace(',', '.'));
      if (!isFinite(v) || v < 0) { showToast('Numero non valido', 'error'); return false; }
    }
  }
  if (campo === 'typeId') v = struTipo(v) ? v : '';
  if (campo === 'labId') v = v || null;
  if (campo === 'owner' && !STRU_PROPRIETARI[v]) v = 'nostro';
  if (campo === 'control' && !STRU_CONTROLLI[v]) v = 'esterna';
  if (campo === 'nextDue' || campo === 'lastCal') {
    if (tarDi(id).length) { showToast('Le date le scrive la taratura registrata', 'error'); return false; }
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { showToast('Data non valida', 'error'); return false; }
  }
  const patch = { [campo]: v };
  // Una prima taratura scritta a mano: la prossima viene da sola, se manca.
  if (campo === 'lastCal' && v && !s.nextDue) patch.nextDue = struPiuMesi(v, struMesi(s));
  Store.update('instruments', id, patch);
  return true;
}
function struMandaInTaratura(id) {
  if (!struGuard()) return false;
  const s = struGet(id); if (!s || ['dismesso', 'in_taratura'].includes(s.status)) return false;
  Store.update('instruments', id, { status: 'in_taratura', sentOn: oggiISO() });
  showToast(`${s.code} in taratura: torna in uso quando registri la taratura`);
  struRidisegna();
  return true;
}
// Un'ultima taratura che lo ha lasciato non conforme non si scavalca: serve
// una taratura conforme.
function struRimettiInUso(id) {
  if (!struGuard()) return false;
  const s = struGet(id); if (!s || !['in_taratura', 'fuori_servizio'].includes(s.status)) return false;
  const ultima = tarDi(id)[0];
  if (ultima && ultima.asLeft === 'non_conforme') { showToast('L\'ultima taratura lo ha trovato non conforme: registra una taratura conforme', 'error'); return false; }
  Store.update('instruments', id, { status: 'attivo', sentOn: '' });
  struRidisegna();
  return true;
}
function struFuoriServizio(id) {
  if (!struGuard()) return;
  const s = struGet(id); if (!s || s.status === 'dismesso' || s.status === 'fuori_servizio') return;
  askConfirm(`Mettere ${s.code} fuori servizio?\nNon si potrà usare per collaudare finché non torna in uso.`, () => {
    Store.update('instruments', id, { status: 'fuori_servizio' });
    struRidisegna();
  }, { title: 'Fuori servizio', ok: 'Sì, fuori servizio' });
}
function struDismetti(id) {
  if (!isAdmin()) { showToast('Uno strumento lo dismette l\'amministratore', 'error'); return; }
  const s = struGet(id); if (!s || s.status === 'dismesso') return;
  askConfirm(`Dismettere ${s.code}?\nResta nell'archivio con le sue tarature e i collaudi in cui è stato usato, ma non si usa più.`, () => {
    Store.update('instruments', id, { status: 'dismesso', sentOn: '' });
    struRidisegna();
  }, { title: 'Dismettere lo strumento', ok: 'Sì, dismetti' });
}
// Si elimina solo uno strumento mai tarato e mai usato: uno scritto per sbaglio.
function struElimina(id) {
  if (!isAdmin()) { showToast('Uno strumento lo elimina l\'amministratore', 'error'); return; }
  const s = struGet(id); if (!s) return;
  if (tarDi(id).length || struUsi(id).length) { showToast('Ha tarature o collaudi: dismettilo invece di eliminarlo', 'error'); return; }
  askConfirm(`Eliminare lo strumento ${s.code}?`, () => {
    if (struCurrentId === id) struCurrentId = null;
    removeConUndo('instruments', id, `Strumento ${s.code} eliminato`, () => struRidisegna());
  });
}

// ═══════════════════════════════════════════════════════════
//  La taratura
// ═══════════════════════════════════════════════════════════
// I punti misurati: [{ nominal, found }] con tutti e due i numeri. L'errore
// di un punto è letto meno vero; il massimo, in valore assoluto, è quello che
// si confronta con l'EMA e con i margini dei collaudi.
function tarPunti(l) {
  return (Array.isArray(l) ? l : []).map(p => ({
    nominal: Number(String(p && p.nominal != null ? p.nominal : '').replace(',', '.')),
    found: Number(String(p && p.found != null ? p.found : '').replace(',', '.')),
    vuoto: p == null || String(p.nominal == null ? '' : p.nominal).trim() === '' || String(p.found == null ? '' : p.found).trim() === '',
  })).filter(p => !p.vuoto && isFinite(p.nominal) && isFinite(p.found)).map(p => ({ nominal: p.nominal, found: p.found }));
}
function tarErroreMax(punti) {
  const l = tarPunti(punti);
  if (!l.length) return null;
  return Math.round(Math.max(...l.map(p => Math.abs(p.found - p.nominal))) * 1e6) / 1e6;
}
// Conforme se l'errore resta entro l'EMA; '' quando mancano l'uno o l'altro.
function tarEsitoDaErrore(errore, ema) {
  if (errore == null || errore === '' || ema == null || ema === '' || !isFinite(Number(ema))) return '';
  return Number(errore) <= Number(ema) + 1e-9 ? 'conforme' : 'non_conforme';
}
// `dati` = { date, kind, supplierId, certNo, points, errMax, asFound,
// adjusted, asLeft, nextDue, cost, note }. Ritorna la taratura, o null.
// Una taratura trovata fuori apre la non conformità (qualita-strumenti, più
// sotto): ritorna lo stesso la taratura, la NC arriva per conto suo.
function tarRegistra(instrumentId, dati) {
  if (!struGuard()) return null;
  const s = struGet(instrumentId);
  if (!s) return null;
  if (s.status === 'dismesso') { showToast('Lo strumento è dismesso', 'error'); return null; }
  const d = dati || {};
  const date = String(d.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { showToast('Scrivi la data della taratura', 'error'); return null; }
  if (date > oggiISO()) { showToast('La data della taratura non può essere nel futuro', 'error'); return null; }
  const points = tarPunti(d.points);
  let errMax = tarErroreMax(points);
  if (errMax == null && d.errMax !== '' && d.errMax != null) {
    const n = Number(String(d.errMax).replace(',', '.'));
    if (!isFinite(n) || n < 0) { showToast('Errore massimo non valido', 'error'); return null; }
    errMax = Math.abs(n);
  }
  const calcolato = tarEsitoDaErrore(errMax, s.ema);
  const asFound = TAR_ESITI[d.asFound] ? d.asFound : calcolato;
  if (!asFound) { showToast('Di\' se lo strumento era conforme quando è arrivato in taratura', 'error'); return null; }
  const adjusted = !!d.adjusted;
  const asLeft = adjusted ? (TAR_ESITI[d.asLeft] ? d.asLeft : 'conforme') : asFound;
  let nextDue = '';
  if (asLeft === 'conforme') {
    nextDue = /^\d{4}-\d{2}-\d{2}$/.test(String(d.nextDue || '')) ? d.nextDue : struPiuMesi(date, struMesi(s));
    if (nextDue <= date) { showToast('La prossima taratura deve venire dopo questa', 'error'); return null; }
  }
  const cost = Math.max(0, Number(String(d.cost == null ? '' : d.cost).replace(',', '.')) || 0);
  const cal = Store.insert('calibrations', {
    instrumentId: s.id, date, kind: TAR_TIPI[d.kind] ? d.kind : (s.control === 'interna' ? 'interna' : 'esterna'),
    supplierId: d.supplierId || null, certNo: String(d.certNo || '').trim(), certPath: '',
    points, errMax, ema: s.ema == null || s.ema === '' ? null : Number(s.ema), asFound, adjusted, asLeft, nextDue, cost,
    ncId: null, note: String(d.note || '').trim(), active: true,
  });
  const patch = { lastCal: date, sentOn: '' };
  if (asLeft === 'conforme') Object.assign(patch, { nextDue, status: 'attivo' });
  else patch.status = 'fuori_servizio';
  Store.update('instruments', s.id, patch);
  showToast(asLeft === 'conforme' ? `${s.code}: valido fino al ${fmtDateIt(nextDue)}` : `${s.code}: non conforme, fuori servizio`, asLeft === 'conforme' ? undefined : 'error');
  if (asFound === 'non_conforme') struNcDaTaratura(tarGet(cal.id));
  return cal;
}
// La riga che dice che cosa succederà, sotto il modulo della taratura.
function tarConseguenzaTesto(s, asFound, asLeft, date, nextDue) {
  if (!s) return '';
  const parti = [];
  if (asLeft === 'conforme') parti.push(`${esc(s.code)} torna valido fino al ${esc(fmtDateIt(nextDue || struPiuMesi(date || oggiISO(), struMesi(s))))}.`);
  else if (asLeft === 'non_conforme') parti.push(`${esc(s.code)} va fuori servizio finché una taratura non lo trova conforme.`);
  if (asFound === 'non_conforme') {
    const n = struImpatto(s.id, date || oggiISO(), null).length;
    parti.push(`Era fuori quando è arrivato: si apre una non conformità${n ? ` con ${n} misur${n === 1 ? 'a' : 'e'} da rivedere` : ''}.`);
  }
  return parti.join(' ');
}

// ─── Il certificato ───
// Il PDF del laboratorio sta nella cartella d'archivio comune: gli allegati
// custoditi nel browser non viaggiano fra i PC, e il certificato serve a tutti.
function tarCertificatoNome(s, cal) {
  const pulito = t => String(t || '').replace(/[\\/:*?"<>|]+/g, '-').trim();
  return `Tarature/${pulito(s.code) || 'strumento'}/${cal.date}${cal.certNo ? ' ' + pulito(cal.certNo) : ''}.pdf`;
}
function tarCertificatoSalva(calId, file) {
  const cal = tarGet(calId), s = cal ? struGet(cal.instrumentId) : null;
  if (!cal || !s || !file) return Promise.resolve(null);
  if (typeof archivioStato !== 'function' || archivioStato() !== 'configurato') {
    showToast('Per allegare il certificato serve la cartella d\'archivio (Gestione → Backup, da Chrome o Edge)', 'error');
    return Promise.resolve(null);
  }
  return archivioSalvaIn(tarCertificatoNome(s, cal), file).then(path => {
    if (!path) { showToast('Il certificato non è stato salvato nella cartella d\'archivio', 'error'); return null; }
    Store.update('calibrations', calId, { certPath: path });
    showToast('Certificato salvato in archivio');
    struRidisegna();
    return path;
  });
}
function tarCertificatoScelto(ev, calId) {
  if (!struGuard()) return null;
  const f = ev && ev.target && ev.target.files && ev.target.files[0];
  if (!f) return null;
  return tarCertificatoSalva(calId, f);
}
function tarCertificatoApri(calId) {
  const cal = tarGet(calId);
  if (!cal || !cal.certPath) return Promise.resolve('nessuno');
  return archivioApri(cal.certPath).then(esito => {
    if (esito === 'non-supportato') showToast('Questo browser non può leggere l\'archivio: servono Chrome o Edge', 'error');
    else if (esito === 'non-configurato') showToast('Archivio non impostato su questo PC: scegli la cartella da Gestione → Backup', 'error');
    else if (esito === 'negato') showToast('Permesso negato sulla cartella d\'archivio', 'error');
    else if (esito === 'assente') showToast(`CERTIFICATO NON TROVATO — "${cal.certPath}" non è in ${archivioNome() || 'archivio'}`, 'error');
    else if (esito === 'errore') showToast('Certificato non apribile', 'error');
    return esito;
  });
}

// ═══════════════════════════════════════════════════════════
//  Il fuori tolleranza: le misure da rivedere
// ═══════════════════════════════════════════════════════════
// L'ultima data in cui lo strumento è stato lasciato conforme prima di `data`
// (esclusa la taratura `tranne`): da lì in poi le sue misure sono sospette.
function struUltimaBuona(instrumentId, data, tranne) {
  const t = tarDi(instrumentId).find(c => c.id !== tranne && c.date <= data && c.asLeft === 'conforme');
  return t ? t.date : '';
}
// La distanza dal limite più vicino: dentro o fuori, è quanto l'errore dello
// strumento dovrebbe spostare la misura per cambiare il giudizio.
function struMargine(c) {
  if (!c || c.kind === 'ok' || typeof qcLimiti !== 'function') return null;
  const lim = qcLimiti(c);
  const v = Number(String(c.value == null ? '' : c.value).replace(',', '.'));
  if (!lim || c.value === '' || c.value == null || !isFinite(v)) return null;
  return Math.round(Math.min(Math.abs(v - lim.min), Math.abs(lim.max - v)) * 1e6) / 1e6;
}
// Le misure prese con lo strumento fra l'ultima taratura buona e `data`, con
// il giudizio dell'app: 'valida' se il margine supera l'errore trovato,
// 'rivedere' altrimenti (e sempre per un passa/non passa, dove un margine non
// c'è). [{ id, inspectionId, number, checkId, name, value, margin, esito, decision }]
function struImpatto(instrumentId, data, cal) {
  const da = struUltimaBuona(instrumentId, data, cal ? cal.id : null);
  const err = cal && cal.errMax != null && cal.errMax !== '' ? Number(cal.errMax) : null;
  return struUsi(instrumentId).filter(u => (!da || u.data >= da) && u.data <= data && String(u.check.value == null ? '' : u.check.value) !== '')
    .map(u => {
      const margin = struMargine(u.check);
      const esito = margin != null && err != null && margin > err + 1e-9 ? 'valida' : 'rivedere';
      return { id: gid(), inspectionId: u.insp.id, number: u.insp.number || '', checkId: u.check.id, name: u.check.name || '',
        value: String(u.check.value), margin, esito, decision: esito === 'valida' ? 'nessun_impatto' : '' };
    });
}
const STRU_DECISIONI = { '': 'Da decidere', nessun_impatto: 'Nessun impatto', ricontrollare: 'Da ricontrollare' };
// La NC dello strumento: una per taratura. Ritorna la NC o una promessa
// (con l'archivio condiviso il numero lo dà il server).
function struNcDaTaratura(cal) {
  if (!cal || typeof ncCrea !== 'function' || cal.ncId) return null;
  const s = struGet(cal.instrumentId); if (!s) return null;
  const impact = struImpatto(s.id, cal.date, cal);
  const rivedere = impact.filter(r => r.esito === 'rivedere').length;
  const testo = [`Strumento ${s.code} ${s.name || ''}`.trim() + ` trovato fuori tolleranza alla taratura del ${fmtDateIt(cal.date)}`,
    cal.errMax != null ? `errore massimo ${fmtQtyIt(cal.errMax)} ${s.uom || ''}`.trim() + (s.ema != null && s.ema !== '' ? ` (EMA ${fmtQtyIt(s.ema)})` : '') : '',
    cal.certNo ? `certificato ${cal.certNo}` : '',
    impact.length ? `${impact.length} misur${impact.length === 1 ? 'a' : 'e'} dall'ultima taratura buona, ${rivedere} da rivedere` : 'nessuna misura dall\'ultima taratura buona',
  ].filter(Boolean).join(' · ');
  const r = ncCrea({ source: 'strumento', description: testo, cause: STRU_CAUSA, gravita: rivedere ? 'maggiore' : 'minore',
    instrumentId: s.id, calibrationId: cal.id, impact });
  const lega = nc => { if (nc) Store.update('calibrations', cal.id, { ncId: nc.id }); return nc; };
  return r && typeof r.then === 'function' ? r.then(lega) : lega(r);
}
const STRU_CAUSA = 'Strumento di misura fuori tolleranza';
function struImpattoSet(ncId, rigaId, decisione) {
  if (typeof ncGuard === 'function' && !ncGuard()) return false;
  const x = typeof ncGet === 'function' ? ncGet(ncId) : null;
  if (!x || x.status === 'chiusa' || STRU_DECISIONI[decisione] === undefined) return false;
  Store.update('nonconformities', ncId, { impact: (x.impact || []).map(r => r.id === rigaId ? Object.assign({}, r, { decision: decisione }) : r) });
  return true;
}
// Chiudere una NC di strumento chiede una decisione su ogni misura.
function struImpattoAperto(x) { return x && x.source === 'strumento' ? (x.impact || []).filter(r => !r.decision).length : 0; }
// La card nella scheda della NC.
function struNcHtml(x, scrive) {
  if (!x || x.source !== 'strumento') return '';
  const s = struGet(x.instrumentId), cal = tarGet(x.calibrationId);
  const dis = scrive && x.status !== 'chiusa' ? '' : 'disabled';
  const righe = (x.impact || []).map(r => `<tr class="${r.esito === 'rivedere' && r.decision !== 'nessun_impatto' ? 'qc-row-ko' : ''}">
      <td><a href="#" onclick="qcApriDaAltrove('${r.inspectionId}');return false">${esc(r.number || '—')}</a></td>
      <td>${esc(r.name || '—')}</td><td class="num">${esc(String(r.value || '').replace('.', ','))}</td>
      <td class="num">${r.margin == null ? '—' : esc(fmtQtyIt(r.margin))}</td>
      <td>${r.esito === 'valida' ? '<span class="doc-badge st-evaso">Resta valida</span>' : '<span class="doc-badge st-annullato">Da rivedere</span>'}</td>
      <td><select ${dis} onchange="struImpattoSet('${x.id}','${r.id}',this.value);ncRidisegna()" aria-label="Decisione per ${esc(r.number)} ${esc(r.name)}">
        ${Object.keys(STRU_DECISIONI).map(k => `<option value="${k}" ${(r.decision || '') === k ? 'selected' : ''}>${esc(STRU_DECISIONI[k])}</option>`).join('')}</select></td></tr>`).join('');
  return `<div class="qc-card">
    <h3>Strumento e misure da rivedere</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Strumento</label><div class="qc-val">${s ? `<a href="#" onclick="struApriDaAltrove('${s.id}');return false">${esc(s.code)}</a> ${esc(s.name || '')}` : '—'}</div></div>
      <div class="modal-field"><label>Taratura</label><div class="qc-val">${cal ? esc(fmtDateIt(cal.date)) + (cal.certNo ? ' · ' + esc(cal.certNo) : '') : '—'}</div></div>
      <div class="modal-field"><label>Errore massimo trovato</label><div class="qc-val">${cal && cal.errMax != null ? esc(fmtQtyIt(cal.errMax)) + ' ' + esc((s && s.uom) || '') : '—'}${s && s.ema != null && s.ema !== '' ? ` · EMA ${esc(fmtQtyIt(s.ema))}` : ''}</div></div>
    </div>
    ${righe ? `<div class="table-wrap"><table class="qc-table">
      <thead><tr><th scope="col">Collaudo</th><th scope="col">Caratteristica</th><th scope="col" class="num">Rilevato</th><th scope="col" class="num">Margine</th><th scope="col">L'app dice</th><th scope="col">Decisione</th></tr></thead>
      <tbody>${righe}</tbody></table></div>
      <p class="empty-text qc-hint">Il margine è la distanza della misura dal limite più vicino. Se supera l'errore trovato, il giudizio di allora non cambia e la misura resta valida. Un passa/non passa va sempre rivisto. La merce già libera non si blocca da sola: lo decide questa NC.</p>`
    : '<p class="empty-text qc-hint">Nessun collaudo ha usato questo strumento dall\'ultima taratura buona.</p>'}
  </div>`;
}

// ═══════════════════════════════════════════════════════════
//  Nel piano e nel collaudo
// ═══════════════════════════════════════════════════════════
// Il tipo di strumento di una caratteristica: quello scelto, o — per i piani
// scritti prima — quello che ha lo stesso nome del testo libero.
function qcCarTipoId(c) {
  if (!c) return '';
  if (c.toolTypeId && struTipo(c.toolTypeId)) return c.toolTypeId;
  const k = String(c.tool || '').trim().toLowerCase();
  const t = k ? struTipi().find(x => x.name.toLowerCase() === k) : null;
  return t ? t.id : '';
}
// Dal piano: la scelta del tipo scrive anche il testo, che resta quello che
// leggono il rapporto e chi ha il modulo spento.
function qcCarSetTipo(planId, carId, typeId) {
  if (typeof qcPianoGuard === 'function' && !qcPianoGuard()) return false;
  const p = typeof qcPianoGet === 'function' ? qcPianoGet(planId) : null; if (!p) return false;
  if (typeId === '__libero') return false;
  const t = struTipo(typeId);
  Store.update('qualityPlans', planId, { characteristics: (p.characteristics || []).map(c => c.id === carId
    ? Object.assign({}, c, { toolTypeId: t ? t.id : '', tool: t ? t.name : '' }) : c) });
  return true;
}
function qcCarTipoHtml(p, c, dis) {
  const sel = qcCarTipoId(c);
  const libero = !sel && c.tool ? `<option value="__libero" selected>«${esc(c.tool)}» (testo libero)</option>` : '';
  return `<div class="modal-field"><label>Strumento</label>
    <select ${dis} onchange="qcCarSetTipo('${p.id}','${c.id}',this.value)">
      <option value="" ${!sel && !c.tool ? 'selected' : ''}>— nessuno —</option>${libero}
      ${struTipi().map(t => `<option value="${esc(t.id)}" ${sel === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>`;
}
// Gli strumenti fra cui scegliere in una riga del collaudo: quelli usabili del
// tipo chiesto (tutti gli usabili se il piano non chiede un tipo).
function struScelte(typeId) {
  return struTutti().filter(s => struUsabile(s) && (!typeId || s.typeId === typeId))
    .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
}
function qcSetStrumento(inspId, checkId, instrumentId) {
  if (!qcGuard()) return false;
  const insp = qcGet(inspId); if (!insp || insp.status !== 'aperto') return false;
  const s = instrumentId ? struGet(instrumentId) : null;
  if (instrumentId && !s) return false;
  const riga = (insp.checks || []).find(c => c.id === checkId); if (!riga) return false;
  const foto = s ? { instrumentId: s.id, instrumentCode: s.code || '', instrumentDue: s.nextDue || '', instrumentAt: oggiISO() }
    : { instrumentId: null, instrumentCode: '', instrumentDue: '', instrumentAt: '' };
  // Scelto uno strumento, le altre righe dello stesso tipo ancora senza lo
  // prendono anche loro: chi misura col micrometro misura tutto con quello.
  const tipo = s ? qcCarTipoId(riga) : '';
  const checks = (insp.checks || []).map(c => {
    if (c.id === checkId) return Object.assign({}, c, foto);
    if (s && tipo && !c.instrumentId && qcCarTipoId(c) === tipo) return Object.assign({}, c, foto);
    return c;
  });
  Store.update('inspections', inspId, { checks });
  return true;
}
// La cella «Strumento» della tabella misure.
function struCellaHtml(x, c, scrivibile) {
  const tipo = qcCarTipoId(c);
  const t = struTipo(tipo);
  const s = c.instrumentId ? struGet(c.instrumentId) : null;
  if (!scrivibile) {
    if (!c.instrumentCode) return esc(c.tool || '—');
    return `<span style="font-family:var(--mono)">${esc(c.instrumentCode)}</span>${c.instrumentDue ? `<div class="qc-str-sub">scad. ${esc(fmtDateIt(c.instrumentDue))}</div>` : ''}`;
  }
  const scelte = struScelte(tipo);
  const fuori = s && !struUsabile(s) ? `<option value="${s.id}" selected>${esc(s.code)} — ${esc(struMotivo(s))}</option>` : '';
  const nome = esc(c.name || 'caratteristica');
  return `<select class="${s && !struUsabile(s) ? 'qc-ko-val' : ''}" onchange="qcSetStrumento('${x.id}','${c.id}',this.value);renderCollaudi()" aria-label="Strumento per ${nome}">
      <option value="" ${!c.instrumentId ? 'selected' : ''}>${t ? esc(t.name) + ': scegli' : '— scegli —'}</option>${fuori}
      ${scelte.map(o => `<option value="${o.id}" ${o.id === c.instrumentId ? 'selected' : ''}>${esc(o.code)}${o.name ? ' ' + esc(o.name) : ''} · scad. ${esc(fmtDateIt(o.nextDue))}</option>`).join('')}
    </select>${!scelte.length && !s ? `<div class="qc-str-sub">${t ? 'nessun ' + esc(t.name.toLowerCase()) + ' valido' : 'nessuno strumento valido'}</div>` : ''}`;
}
// Il controllo prima dell'esito: '' se va bene, altrimenti il motivo. Conta
// solo le righe misurate: una riga vuota non ha usato nessuno strumento.
function struControllaCollaudo(insp) {
  if (!struAttivo() || !insp) return '';
  for (const c of insp.checks || []) {
    const misurata = String(c.value == null ? '' : c.value) !== '' || c.verdict === 'ok' || c.verdict === 'ko';
    if (!misurata) continue;
    const nome = c.name || 'caratteristica';
    if (!c.instrumentId) {
      if (qcCarTipoId(c)) return `Scegli lo strumento usato per «${nome}»`;
      continue;
    }
    const s = struGet(c.instrumentId);
    if (!s || !struUsabile(s, c.instrumentAt || oggiISO())) {
      const chi = c.instrumentCode ? `Lo strumento ${c.instrumentCode}` : 'Lo strumento';
      return `${chi} usato per «${nome}» è ${s ? struMotivo(s, c.instrumentAt) : 'stato eliminato'}: scegline un altro`;
    }
  }
  return '';
}
// Dentro qcRegistraEsito: vero se si può registrare. Con la regola «avviso»
// il motivo si dice e si va avanti.
function struConsenteEsito(insp) {
  const m = struControllaCollaudo(insp);
  if (!m) return true;
  if (struRegola() === 'avviso') { showToast(m + ' (registrato lo stesso)', 'error'); return true; }
  showToast(m, 'error');
  return false;
}
// Lo strumento come lo scrive il rapporto: il codice e la scadenza di quel
// giorno, o il testo del piano.
function qcStrumentoTesto(c) {
  if (!c) return '';
  if (!c.instrumentCode) return c.tool || '';
  return `${c.instrumentCode}${c.instrumentDue ? ' (scad. ' + fmtDateIt(c.instrumentDue) + ')' : ''}`;
}

// ═══════════════════════════════════════════════════════════
//  La vista
// ═══════════════════════════════════════════════════════════
let struCurrentId = null;
let struFiltro = { q: '', stato: 'dafare' };
const STRU_FILTRI = {
  dafare: 'Da fare', valido: 'Validi', scaduto: 'Scaduti o mai tarati', in_scadenza: 'In scadenza', in_taratura: 'In taratura',
  fuori_servizio: 'Fuori servizio', dismesso: 'Dismessi', '': 'Tutti',
};
function struRidisegna() { if (typeof activeView !== 'undefined' && activeView === 'strumenti') renderStrumenti(); }
function struSearchInput() { struFiltro.q = val('stru-search'); ridisegnaCercando('stru-search', renderStrumenti); }
function struStatoChange() { struFiltro.stato = val('stru-stato'); renderStrumenti(); }
function struApri(id) { struCurrentId = id; renderStrumenti(); }
function struApriDaAltrove(id) { struCurrentId = id; setView('strumenti'); }
function struChiudiScheda() { struCurrentId = null; renderStrumenti(); }
function struNelFiltro(s, filtro, g) {
  const st = struStato(s, g);
  if (filtro === '') return true;
  if (filtro === 'dafare') return ['scaduto', 'da_tarare', 'in_scadenza', 'in_taratura'].includes(st);
  if (filtro === 'scaduto') return st === 'scaduto' || st === 'da_tarare';
  if (filtro === 'valido') return st === 'valido' || st === 'in_scadenza';
  return st === filtro;
}
function struFiltrati() {
  const q = (struFiltro.q || '').trim().toLowerCase();
  const g = oggiISO();
  return (db.instruments || []).filter(s => s && struNelFiltro(s, struFiltro.stato, g)).filter(s => {
    if (!q) return true;
    const t = struTipo(s.typeId);
    return [s.code, s.name, s.serial, s.location, s.holder, t && t.name].some(v => String(v || '').toLowerCase().includes(q));
  }).sort((a, b) => String(a.nextDue || '0').localeCompare(String(b.nextDue || '0')) || String(a.code || '').localeCompare(String(b.code || '')));
}
function renderStrumenti() {
  const el = document.getElementById('view-strumenti'); if (!el) return;
  const righe = struFiltrati();
  const corrente = struCurrentId ? struGet(struCurrentId) : null;
  const scrive = struPuoScrivere();
  const g = oggiISO();
  const conta = k => (db.instruments || []).filter(s => s && struNelFiltro(s, k, g)).length;
  const nuovo = scrive ? `<button class="add-btn-sm" onclick="struNuovoModal()">${ico('plus', 'tinted', '')} Nuovo strumento</button>` : '';
  const etichette = righe.length ? `<button class="btn-outline" onclick="struEtichette()" title="Le etichette QR degli strumenti in elenco">${ico('qr', 'tinted', '')} Etichette</button>` : '';
  el.innerHTML = worklistHtml({
    titolo: 'Strumenti di misura', icona: 'gauge', listaId: 'stru-list', comandi: nuovo + etichette,
    filtri: `<input type="text" class="search" id="stru-search" placeholder="Cerca codice, nome, matricola, dove sta…" value="${esc(struFiltro.q)}" oninput="struSearchInput()">
      <select id="stru-stato" onchange="struStatoChange()" aria-label="Stato">
        ${Object.keys(STRU_FILTRI).map(k => `<option value="${k}" ${struFiltro.stato === k ? 'selected' : ''}>${esc(STRU_FILTRI[k])}${k ? ` (${conta(k)})` : ''}</option>`).join('')}
      </select>`,
    righe: righe.length ? righe.map(s => {
      const t = struTipo(s.typeId);
      return worklistRow({
        numero: s.code, badge: struBadge(s), sel: corrente && corrente.id === s.id, spenta: s.status === 'dismesso',
        titolo: s.name || (t ? t.name : ''),
        meta: [t ? esc(t.name) : '', s.location || s.holder ? esc(s.location || s.holder) : '', s.nextDue ? 'scad. ' + esc(fmtDateIt(s.nextDue)) : 'mai tarato'].filter(Boolean).join(' · '),
        azione: `struApri('${s.id}')`, etichetta: `Apri lo strumento ${s.code}`,
      });
    }).join('') : `<p class="empty-text">Nessuno strumento${struFiltro.stato === 'dafare' ? ' da tarare: tutto in regola' : ''}.</p>`,
    nota: worklistCount(righe.length, (db.instruments || []).length, 'strumento', 'strumenti'),
    doc: corrente ? struSchedaHtml(corrente, scrive) : '',
    vuoto: {
      titolo: 'Strumenti di misura',
      testo: 'Calibri, micrometri, tamponi: ogni strumento con cui si collauda, con la sua <strong>scadenza di taratura</strong> e il suo stato. Il piano di controllo chiede un tipo di strumento, chi collauda sceglie quale fra quelli validi, e il collaudo ne tiene il codice. Uno strumento trovato fuori alla taratura apre una non conformità con le misure da rivedere.',
      comandi: nuovo,
    },
  });
  a11yFields(el);
}

function struSchedaHtml(s, scrive) {
  const vivo = s.status !== 'dismesso';
  const dis = scrive && vivo ? '' : 'disabled';
  const tarature = tarDi(s.id);
  const set = campo => `onchange="struSet('${s.id}','${campo}',this.value);struRidisegna()"`;
  const campo = (etichetta, k, attr) => `<div class="modal-field"><label>${esc(etichetta)}</label>
      <input value="${esc(s[k] == null ? '' : String(s[k]).replace(/^(\d+)\.(\d+)$/, '$1,$2'))}" ${attr || ''} ${dis} ${set(k)}></div>`;
  const scelta = (etichetta, k, opzioni, attr) => `<div class="modal-field"><label>${esc(etichetta)}</label>
      <select ${attr || ''} ${dis} ${set(k)}>${opzioni}</select></div>`;
  const opz = (mappa, v) => Object.keys(mappa).map(k => `<option value="${k}" ${v === k ? 'selected' : ''}>${esc(mappa[k])}</option>`).join('');
  const tipi = `<option value="">—</option>` + struTipi().map(t => `<option value="${esc(t.id)}" ${s.typeId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  const lab = `<option value="">—</option>` + (db.suppliers || []).filter(f => f.active !== false || f.id === s.labId)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'it'))
    .map(f => `<option value="${f.id}" ${s.labId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
  const st = struStato(s);
  const colore = { valido: 'green', in_scadenza: 'orange', in_taratura: 'text-dim', dismesso: 'text-dim', indicativo: 'text-dim' }[st] || 'red';
  const archivio = typeof archivioStato === 'function' && archivioStato() === 'configurato';
  const storico = tarature.map(c => {
    const nc = c.ncId && typeof ncGet === 'function' ? ncGet(c.ncId) : null;
    const cert = c.certPath
      ? `<button class="mini-btn" onclick="tarCertificatoApri('${c.id}')" title="Apri il certificato">${ico('file', 'tinted', '')} ${esc(c.certNo || 'Apri')}</button>`
      : (scrive && archivio ? `${esc(c.certNo || '')} <label class="mini-btn" title="Allega il PDF del certificato">${ico('upload', 'tinted', '')} PDF<input type="file" accept="application/pdf,.pdf" style="display:none" onchange="tarCertificatoScelto(event,'${c.id}')"></label>` : esc(c.certNo || '—'));
    return `<tr class="${c.asFound === 'non_conforme' ? 'qc-row-ko' : ''}">
      <td>${esc(fmtDateIt(c.date))}</td><td>${esc(c.kind === 'interna' ? 'Interna' : supplierName(c.supplierId) || 'Esterna')}</td>
      <td>${cert}</td>
      <td class="num">${c.errMax == null || c.errMax === '' ? '—' : esc(fmtQtyIt(c.errMax))}</td>
      <td>${esc(TAR_ESITI[c.asFound] || '—')}${c.adjusted ? ' → regolato, ' + esc((TAR_ESITI[c.asLeft] || '').toLowerCase()) : ''}</td>
      <td>${c.nextDue ? esc(fmtDateIt(c.nextDue)) : '—'}</td>
      <td>${nc ? `<a href="#" onclick="ncApriDaAltrove('${nc.id}');return false">${esc(nc.number || 'NC')}</a>` : ''}</td></tr>`;
  }).join('');
  const usi = struUsi(s.id);
  const usiHtml = usi.slice(0, 20).map(u => `<tr><td><a href="#" onclick="qcApriDaAltrove('${u.insp.id}');return false">${esc(u.insp.number || '—')}</a></td>
      <td>${esc(u.check.name || '—')}</td><td class="num">${esc(String(u.check.value == null ? '' : u.check.value).replace('.', ',') || '—')}</td><td>${esc(fmtDateIt(u.data))}</td></tr>`).join('');
  const comandi = [];
  if (scrive && vivo) comandi.push(`<button class="add-btn-sm" onclick="tarModal('${s.id}')">${ico('check', 'tinted', '')} Registra taratura</button>`);
  if (scrive && ['attivo'].includes(s.status) && s.control !== 'nessuna') comandi.push(`<button class="btn-outline" onclick="struMandaInTaratura('${s.id}')" title="Lo strumento parte per il laboratorio: non si usa finché non torna">${ico('truck', 'tinted', '')} Manda in taratura</button>`);
  if (scrive && ['in_taratura', 'fuori_servizio'].includes(s.status)) comandi.push(`<button class="btn-outline" onclick="struRimettiInUso('${s.id}')">${ico('refresh', 'tinted', '')} Rimetti in uso</button>`);
  if (scrive && s.status === 'attivo') comandi.push(`<button class="btn-outline" onclick="struFuoriServizio('${s.id}')" title="Rotto, caduto, sigillo rotto: non si usa finché non torna in uso">${ico('blocked', 'tinted', '')} Fuori servizio</button>`);
  comandi.push(`<button class="btn-outline" onclick="qrEtichetteModal(['${s.id}'], 'str')" title="L'etichetta QR da attaccare allo strumento">${ico('qr', 'tinted', '')} Etichetta</button>`);
  if (isAdmin() && vivo) comandi.push(`<button class="btn-outline" onclick="struDismetti('${s.id}')" title="Non si usa più: resta in archivio">${ico('close', 'tinted', '')} Dismetti</button>`);
  if (isAdmin() && !tarature.length && !usi.length) comandi.push(`<button class="btn-outline danger" onclick="struElimina('${s.id}')" title="Elimina (solo se mai tarato e mai usato)">${ico('trash', 'tinted', 'Elimina')}</button>`);
  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      <div class="bom-toolbar-left">
        ${worklistCloseBtn('struChiudiScheda()', 'lo strumento')}
        <h2 class="section-title" style="font-family:var(--mono)">${esc(s.code || '')}</h2>
        ${struBadge(s)}
      </div>
      <div class="bom-toolbar-right">${comandi.join('')}</div>
    </div>
    <p class="stru-stato" style="color:var(--${colore})">${esc(struStatoTesto(s))}</p>
    <div class="qc-card">
      <h3>Lo strumento</h3>
      <div class="modal-grid">
        ${campo('Codice', 'code', 'maxlength="40"')}
        ${campo('Descrizione', 'name', 'placeholder="es. Calibro 0–150 centesimale"')}
        ${scelta('Tipo', 'typeId', tipi)}
        ${campo('Costruttore', 'brand')}
        ${campo('Modello', 'model')}
        ${campo('Matricola', 'serial')}
        ${campo('Campo di misura', 'rangeText', 'placeholder="es. 0–150 mm"')}
        ${campo('Risoluzione', 'resolution', 'inputmode="decimal" class="num" placeholder="es. 0,01"')}
        ${campo('U.M.', 'uom', 'maxlength="8"')}
        ${campo('Dove sta', 'location', 'placeholder="es. Sala metrologica, armadio 2"')}
        ${campo('Assegnato a', 'holder', 'placeholder="es. Rossi, reparto torni"')}
        ${scelta('Di chi è', 'owner', opz(STRU_PROPRIETARI, s.owner || 'nostro'))}
      </div>
    </div>
    <div class="qc-card">
      <h3>La taratura</h3>
      <div class="modal-grid">
        ${scelta('Come si controlla', 'control', opz(STRU_CONTROLLI, s.control || 'esterna'))}
        ${campo('Ogni (mesi)', 'intervalMonths', `type="number" min="1" max="120" step="1" ${isAdmin() ? '' : 'readonly title="Lo cambia l\'amministratore"'}`)}
        ${campo('EMA, errore massimo ammesso', 'ema', 'inputmode="decimal" class="num" placeholder="es. 0,02"')}
        ${scelta('Laboratorio', 'labId', lab)}
        ${tarature.length
    ? `<div class="modal-field"><label>Ultima taratura</label><div class="qc-val">${esc(fmtDateIt(s.lastCal) || '—')}</div></div>
           <div class="modal-field"><label>Prossima taratura</label><div class="qc-val"><strong>${esc(fmtDateIt(s.nextDue) || '—')}</strong></div></div>`
    : `${campo('Ultima taratura', 'lastCal', 'type="date"')}${campo('Prossima taratura', 'nextDue', 'type="date"')}`}
      </div>
      ${tarature.length ? '' : '<p class="empty-text qc-hint">Per uno strumento che esiste già, scrivi l\'ultima taratura: la prossima si calcola dall\'intervallo. Da quando registri una taratura, le date le scrive lei.</p>'}
      <p class="empty-text qc-hint">L'EMA è l'errore che lo strumento può avere per l'uso che ne fate: la taratura lo confronta con l'errore trovato e propone conforme o non conforme.</p>
    </div>
    <div class="qc-card">
      <h3>Tarature</h3>
      ${storico ? `<div class="table-wrap"><table class="qc-table">
        <thead><tr><th scope="col">Data</th><th scope="col">Chi</th><th scope="col">Certificato</th><th scope="col" class="num">Errore max</th><th scope="col">Esito</th><th scope="col">Prossima</th><th scope="col">NC</th></tr></thead>
        <tbody>${storico}</tbody></table></div>` : '<p class="empty-text qc-hint">Nessuna taratura registrata.</p>'}
    </div>
    <div class="qc-card">
      <h3>Usato in</h3>
      ${usiHtml ? `<div class="table-wrap"><table class="qc-table">
        <thead><tr><th scope="col">Collaudo</th><th scope="col">Caratteristica</th><th scope="col" class="num">Rilevato</th><th scope="col">Il</th></tr></thead>
        <tbody>${usiHtml}</tbody></table></div>${usi.length > 20 ? `<p class="empty-text qc-hint">…e altre ${usi.length - 20} misure.</p>` : ''}`
    : '<p class="empty-text qc-hint">Ancora in nessun collaudo.</p>'}
    </div>
    <div class="qc-card">
      <h3>Note</h3>
      <div class="modal-field"><label class="sr-only">Note</label>
        <textarea rows="2" ${dis} ${set('notes')}>${esc(s.notes || '')}</textarea></div>
    </div>
    ${stampLine(s)}
  </div>`;
}

// ─── Nuovo strumento ───
function struNuovoModal() {
  if (!struGuard()) return;
  openModal(`<h2 class="modal-title">${ico('gauge', 'tinted', '')} Nuovo strumento</h2>
    <div class="modal-grid">
      <div class="modal-field"><label>Codice</label><input id="stru-n-code" value="${esc(struCodiceProssimo())}" maxlength="40"></div>
      <div class="modal-field"><label>Tipo</label><select id="stru-n-tipo"><option value="">—</option>
        ${struTipi().map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></div>
      <div class="modal-field"><label>Descrizione</label><input id="stru-n-name" placeholder="es. Calibro 0–150 centesimale"></div>
      <div class="modal-field"><label>Matricola</label><input id="stru-n-serial"></div>
      <div class="modal-field"><label>Come si controlla</label><select id="stru-n-ctrl">${Object.keys(STRU_CONTROLLI).map(k => `<option value="${k}">${esc(STRU_CONTROLLI[k])}</option>`).join('')}</select></div>
      <div class="modal-field"><label>Prossima taratura</label><input type="date" id="stru-n-due"></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:4px 0">Senza una prossima taratura lo strumento è <strong>da tarare</strong> e non si usa per collaudare. Il codice è quello inciso o scritto sull'etichetta.</p>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="struNuovoSalva()">Crea</button></div>`);
}
function struNuovoSalva() {
  const s = struCrea({ code: val('stru-n-code'), typeId: val('stru-n-tipo'), name: val('stru-n-name'), serial: val('stru-n-serial'),
    control: val('stru-n-ctrl'), nextDue: val('stru-n-due') });
  if (!s) return null;
  closeModal();
  struCurrentId = s.id;
  if (typeof activeView !== 'undefined' && activeView === 'strumenti') renderStrumenti(); else setView('strumenti');
  showToast(`Strumento ${s.code} creato`);
  return s;
}

// ─── Registra taratura ───
const TAR_PUNTI_RIGHE = 5;
function tarModal(instrumentId) {
  if (!struGuard()) return;
  const s = struGet(instrumentId); if (!s) return;
  const oggi = oggiISO();
  const archivio = typeof archivioStato === 'function' && archivioStato() === 'configurato';
  const forn = (db.suppliers || []).filter(f => f.active !== false).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'it'));
  const punti = Array.from({ length: TAR_PUNTI_RIGHE }, (_, i) => `<tr>
      <td><input class="num tar-nom" inputmode="decimal" aria-label="Valore di riferimento ${i + 1}" oninput="tarModalAggiorna('${s.id}')"></td>
      <td><input class="num tar-found" inputmode="decimal" aria-label="Letto dallo strumento ${i + 1}" oninput="tarModalAggiorna('${s.id}')"></td></tr>`).join('');
  openModal(`<h2 class="modal-title">${ico('gauge', 'tinted', '')} Taratura di ${esc(s.code)}</h2>
    <div class="modal-grid">
      <div class="modal-field"><label>Data</label><input type="date" id="tar-date" value="${oggi}" max="${oggi}" onchange="tarModalAggiorna('${s.id}')"></div>
      <div class="modal-field"><label>Chi l'ha fatta</label><select id="tar-kind">${Object.keys(TAR_TIPI).map(k => `<option value="${k}" ${(s.control === 'interna' ? 'interna' : 'esterna') === k ? 'selected' : ''}>${esc(TAR_TIPI[k])}</option>`).join('')}</select></div>
      <div class="modal-field"><label>Laboratorio</label><select id="tar-sup"><option value="">—</option>
        ${forn.map(f => `<option value="${f.id}" ${s.labId === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></div>
      <div class="modal-field"><label>N° certificato</label><input id="tar-cert" placeholder="es. LAT 123 / 4567"></div>
      ${archivio ? '<div class="modal-field"><label>Certificato PDF</label><input type="file" id="tar-file" accept="application/pdf,.pdf"></div>' : ''}
    </div>
    ${archivio ? '' : '<p class="empty-text" style="text-align:left;padding:2px 0 6px">Il PDF del certificato si allega quando su questo PC è scelta la cartella d\'archivio (Gestione → Backup, da Chrome o Edge).</p>'}
    <div class="table-wrap"><table class="qc-table">
      <thead><tr><th scope="col" class="num">Riferimento${s.uom ? ' (' + esc(s.uom) + ')' : ''}</th><th scope="col" class="num">Letto dallo strumento</th></tr></thead>
      <tbody id="tar-punti">${punti}</tbody></table></div>
    <div class="modal-grid">
      <div class="modal-field"><label>Errore massimo trovato${s.uom ? ' (' + esc(s.uom) + ')' : ''}</label><input id="tar-err" inputmode="decimal" class="num" placeholder="dai punti, o scrivilo" oninput="tarModalAggiorna('${s.id}')"></div>
      <div class="modal-field"><label>Com'era all'arrivo</label><select id="tar-found" onchange="tarModalAggiorna('${s.id}')">
        <option value="">— scegli —</option>${Object.keys(TAR_ESITI).map(k => `<option value="${k}">${esc(TAR_ESITI[k])}</option>`).join('')}</select></div>
      <div class="modal-field"><label>Regolato o riparato</label><select id="tar-adj" onchange="tarModalAggiorna('${s.id}')"><option value="">No</option><option value="si">Sì</option></select></div>
      <div class="modal-field" id="tar-left-f" style="display:none"><label>Dopo la regolazione</label><select id="tar-left" onchange="tarModalAggiorna('${s.id}')">
        ${Object.keys(TAR_ESITI).map(k => `<option value="${k}">${esc(TAR_ESITI[k])}</option>`).join('')}</select></div>
      <div class="modal-field"><label>Prossima taratura</label><input type="date" id="tar-next" value="${struPiuMesi(oggi, struMesi(s))}" onchange="tarModalAggiorna('${s.id}')"></div>
      <div class="modal-field"><label>Costo (${esc(cur())})</label><input type="number" id="tar-cost" min="0" step="any" value="0"></div>
    </div>
    <div class="modal-field"><label>Nota</label><textarea id="tar-note" rows="2"></textarea></div>
    <p class="empty-text qc-hint" id="tar-conseguenza">${s.ema != null && s.ema !== '' ? `L'EMA di questo strumento è ${esc(fmtQtyIt(s.ema))}${s.uom ? ' ' + esc(s.uom) : ''}: dai punti l'app propone l'esito.` : 'Lo strumento non ha un EMA: l\'esito lo scegli tu.'}</p>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="tarModalSalva('${s.id}')">Registra</button></div>`);
}
function tarModalPunti() {
  const nom = Array.from(document.querySelectorAll('#tar-punti .tar-nom') || []), trov = Array.from(document.querySelectorAll('#tar-punti .tar-found') || []);
  return nom.map((n, i) => ({ nominal: n.value, found: trov[i] ? trov[i].value : '' }));
}
// A ogni cambio: l'errore dai punti, l'esito proposto e la riga di conseguenza.
function tarModalAggiorna(instrumentId) {
  const s = struGet(instrumentId); if (!s) return;
  const err = tarErroreMax(tarModalPunti());
  const errEl = document.getElementById('tar-err');
  if (errEl && err != null) { errEl.value = String(err).replace('.', ','); errEl.readOnly = true; } else if (errEl) errEl.readOnly = false;
  const errV = err != null ? err : (errEl && errEl.value !== '' ? Number(errEl.value.replace(',', '.')) : null);
  const sel = document.getElementById('tar-found');
  const proposto = tarEsitoDaErrore(errV, s.ema);
  if (sel && proposto && !sel.dataset.mano) sel.value = proposto;
  const adj = val('tar-adj') === 'si';
  const lf = document.getElementById('tar-left-f'); if (lf) lf.style.display = adj ? '' : 'none';
  const asFound = sel ? sel.value : '';
  const asLeft = adj ? val('tar-left') : asFound;
  const p = document.getElementById('tar-conseguenza');
  if (p) p.innerHTML = asFound ? tarConseguenzaTesto(s, asFound, asLeft, val('tar-date'), val('tar-next')) : 'Scegli com\'era lo strumento quando è arrivato in taratura.';
}
function tarModalSalva(instrumentId) {
  const f = document.getElementById('tar-file');
  const file = f && f.files && f.files[0];
  const cal = tarRegistra(instrumentId, {
    date: val('tar-date'), kind: val('tar-kind'), supplierId: val('tar-sup') || null, certNo: val('tar-cert'),
    points: tarModalPunti(), errMax: val('tar-err'), asFound: val('tar-found'), adjusted: val('tar-adj') === 'si',
    asLeft: val('tar-left'), nextDue: val('tar-next'), cost: val('tar-cost'), note: val('tar-note'),
  });
  if (!cal) return null;
  closeModal();
  struRidisegna();
  if (file) tarCertificatoSalva(cal.id, file);
  return cal;
}

// ─── Le etichette ───
function struEtichette() { qrEtichetteModal(struFiltrati().map(s => s.id), 'str'); }
function struEtichettaTesti(s) {
  return { codice: s.code || '', righe: [s.name || '', s.nextDue ? 'Scadenza ' + fmtDateIt(s.nextDue) : 'Da tarare', s.serial ? 'Matr. ' + s.serial : ''] };
}
// La scheda rapida dal QR: lo stato in grande, prima di prendere lo strumento.
function struQrSchedaHtml(s) {
  const bottoni = [qrBtn('Apri lo strumento', 'gauge', `struApriDaAltrove('${s.id}')`, true)];
  if (struPuoScrivere() && s.status !== 'dismesso') bottoni.push(qrBtn('Registra taratura', 'check', `tarModal('${s.id}')`));
  const st = struStato(s);
  const colore = { valido: 'green', in_scadenza: 'orange' }[st] || 'red';
  return `<h3>${ico('gauge', 'tinted pill', '')} ${esc(s.code || '')} ${struBadge(s)}</h3>
    <p><strong>${esc(s.name || '')}</strong>${s.serial ? ' · matr. ' + esc(s.serial) : ''}</p>
    <p class="stru-stato" style="color:var(--${colore})">${esc(struStatoTesto(s))}</p>
    ${s.location || s.holder ? `<p>${esc([s.location, s.holder].filter(Boolean).join(' · '))}</p>` : ''}
    <div class="qr-azioni">${bottoni.join('')}</div>`;
}

// ─── Riepilogo e calendario ───
// Gli avvisi: chi è scaduto (o mai tarato) e chi scade entro il preavviso.
function struAvvisi() {
  return {
    scaduti: struScaduti().map(s => ({ s, testo: `${s.name || ''} — ${s.nextDue ? 'scaduto il ' + fmtDateIt(s.nextDue) : 'mai tarato'}` })),
    vicini: struInScadenza().map(s => ({ s, testo: `${s.name || ''} — scade il ${fmtDateIt(s.nextDue)}` })),
  };
}
function struEventiCalendario(oggi) {
  return struTutti().filter(s => s.nextDue && !['dismesso', 'fuori_servizio'].includes(s.status) && s.control !== 'nessuna')
    .map(s => ({ tipo: 'taratura', data: s.nextDue, icona: 'gauge', testo: `Taratura ${s.code}`, dettaglio: s.name || '',
      gravita: s.nextDue < oggi ? 'alta' : calGravitaData(s.nextDue, oggi), azione: `struApriDaAltrove('${s.id}')` }));
}

// ─── Le impostazioni (Gestione → Qualità) ───
function renderStruSettings() {
  if (!struAttivo()) return '';
  return `<h3 class="settings-group-title">${ico('gauge', 'tinted', '')} Strumenti di misura</h3>
    <div class="modal-field"><label>Tipi di strumento (uno per riga: nome | mesi fra due tarature)</label>
      <textarea id="set-stru-tipi" rows="8">${esc(struTipi().map(t => `${t.name} | ${t.months}`).join('\n'))}</textarea></div>
    <div class="modal-grid">
      <div class="modal-field"><label>Avvisa quanti giorni prima della scadenza</label><input type="number" id="set-stru-pre" min="0" max="365" step="1" value="${struPreavviso()}"></div>
      <div class="modal-field"><label>Strumento scaduto o non scelto nel collaudo</label>
        <select id="set-stru-regola"><option value="blocca" ${struRegola() === 'blocca' ? 'selected' : ''}>Blocca l'esito</option><option value="avviso" ${struRegola() === 'avviso' ? 'selected' : ''}>Avvisa e registra lo stesso</option></select></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Il tipo si sceglie nella caratteristica del piano di controllo; chi collauda sceglie poi lo strumento preciso fra quelli validi di quel tipo. Rinominare un tipo lo stacca dai piani che lo usano: lì resta il vecchio nome come testo.</p>`;
}
// Restituisce '' o il motivo per cui non si salva.
function readStruSettings() {
  const ta = document.getElementById('set-stru-tipi');
  if (!ta) return '';
  const vecchi = struTipi();
  const visti = new Set(), tipi = [];
  for (const riga of String(ta.value || '').split('\n')) {
    const r = riga.trim(); if (!r) continue;
    const [nome, mesi] = r.split('|').map(x => x.trim());
    if (!nome) continue;
    const k = nome.toLowerCase(); if (visti.has(k)) continue;
    visti.add(k);
    const n = mesi === undefined || mesi === '' ? STRU_MESI_SERIE : parseInt(mesi, 10);
    if (!(n >= 1 && n <= 120)) return `Tipo «${nome}»: i mesi vanno da 1 a 120`;
    const v = vecchi.find(t => t.name.toLowerCase() === k);
    tipi.push({ id: v ? v.id : 'tt-' + gid(), name: nome, months: n });
  }
  if (!tipi.length) return 'Serve almeno un tipo di strumento';
  db.settings.qcToolTypes = tipi;
  db.settings.qcToolWarnDays = Math.min(365, Math.max(0, parseInt(val('set-stru-pre'), 10) || 0));
  db.settings.qcToolRule = val('set-stru-regola') === 'avviso' ? 'avviso' : 'blocca';
  return '';
}
