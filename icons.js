// ─── Icone ───
//
// Le emoji sparse nei template le disegna il font di sistema: cambiano forma fra
// Windows, Mac e telefono, non ereditano il colore del testo — un cestino dentro
// un pulsante `.danger` resta grigio invece che rosso — e non si allineano alla
// linea di base. Qui i disegni sono nostri: tracciati su griglia 24×24, tratto
// 1.8, terminazioni tonde, nessuna dipendenza esterna e nessun font da caricare.
//
// I tracciati stanno in un unico sprite nascosto in fondo alla pagina; ogni
// icona sul DOM è un `<use>` che lo referenzia, quindi disegnare duecento righe
// di distinta non significa ripetere duecento volte le stesse curve. Il colore
// arriva da `currentColor` e la misura da `1em`: l'icona segue il testo che la
// circonda, senza una regola CSS per ogni posto in cui compare.
const ICONS = {
  // Navigazione
  home: '<path d="M3 10.6 12 3.2l9 7.4"/><path d="M5.6 9.4V19.8a1 1 0 0 0 1 1h10.8a1 1 0 0 0 1-1V9.4"/><path d="M9.6 20.8v-6.2h4.8v6.2"/>',
  contacts: '<rect x="5.5" y="3" width="15" height="18" rx="2"/><path d="M5.5 7.5h-2M5.5 12h-2M5.5 16.5h-2"/><circle cx="13" cy="10.2" r="2.3"/><path d="M9.3 17.2c.5-2 1.9-3 3.7-3s3.2 1 3.7 3"/>',
  package: '<path d="M3.2 7.6 12 3.1l8.8 4.5L12 12.1z"/><path d="M3.2 7.6v8.8L12 20.9l8.8-4.5V7.6"/><path d="M12 12.1v8.8"/><path d="M7.6 5.3l8.8 4.6"/>',
  wrench: '<path d="M15.4 3.4a5 5 0 0 0-3.6 6.7L4.4 17.5a2.1 2.1 0 0 0 3 3l7.4-7.4a5 5 0 0 0 6.7-3.6l-3.2 1.5-2.6-1.1-1.1-2.6z"/>',
  tree: '<rect x="8.8" y="3" width="6.4" height="5" rx="1.2"/><rect x="2.6" y="16" width="6.4" height="5" rx="1.2"/><rect x="15" y="16" width="6.4" height="5" rx="1.2"/><path d="M12 8v3.6"/><path d="M5.8 16v-4.4h12.4V16"/>',
  mail: '<rect x="2.8" y="5" width="18.4" height="14" rx="2"/><path d="m3.8 7.2 7.3 5.1a1.6 1.6 0 0 0 1.8 0l7.3-5.1"/>',
  settings: '<path d="M13.6 2.6h-3.2l-.4 2.4-2 .8-2-1.3-2.3 2.3 1.3 2-.8 2-2.4.4v3.2l2.4.4.8 2-1.3 2 2.3 2.3 2-1.3 2 .8.4 2.4h3.2l.4-2.4 2-.8 2 1.3 2.3-2.3-1.3-2 .8-2 2.4-.4v-3.2l-2.4-.4-.8-2 1.3-2-2.3-2.3-2 1.3-2-.8z"/><circle cx="12" cy="12" r="3.1"/>',

  // Azioni
  edit: '<path d="M4 20h4.2L18.9 9.3a2.2 2.2 0 0 0-3.1-3.1L5 16.9V20z"/><path d="m14.6 7.4 3.1 3.1"/>',
  trash: '<path d="M4 6.4h16"/><path d="M9.5 6.4V4.6a1.1 1.1 0 0 1 1.1-1.1h2.8a1.1 1.1 0 0 1 1.1 1.1v1.8"/><path d="m6.4 6.4.9 13.1a1.2 1.2 0 0 0 1.2 1.1h7a1.2 1.2 0 0 0 1.2-1.1l.9-13.1"/><path d="M10.4 10v7M13.6 10v7"/>',
  link: '<path d="M10.2 13.8a4.2 4.2 0 0 0 6 0l2.9-2.9a4.2 4.2 0 0 0-6-6l-1.7 1.7"/><path d="M13.8 10.2a4.2 4.2 0 0 0-6 0l-2.9 2.9a4.2 4.2 0 0 0 6 6l1.7-1.7"/>',
  search: '<circle cx="10.6" cy="10.6" r="6.6"/><path d="m15.4 15.4 5.1 5.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="8.6" y="8.6" width="11.9" height="11.9" rx="2"/><path d="M5.6 15.4H4.5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1h9.9a1 1 0 0 1 1 1v1.1"/>',
  check: '<path d="m4.6 12.4 5 5L19.4 6.6"/>',
  close: '<path d="m6.2 6.2 11.6 11.6M17.8 6.2 6.2 17.8"/>',
  chevronRight: '<path d="m9.5 5.5 7 6.5-7 6.5"/>',
  chevronDown: '<path d="m5.5 9.5 6.5 7 6.5-7"/>',
  refresh: '<path d="M20.3 12a8.3 8.3 0 1 1-2.6-6"/><path d="M20.5 3.5V9h-5.5"/>',
  eye: '<path d="M2.5 12S6.3 5.5 12 5.5 21.5 12 21.5 12 17.7 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.9"/>',
  // Il pulsante del tema mostra dove si va, non dove si è: di giorno la luna.
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.4M12 19v2.4M21.4 12H19M5 12H2.6M18.6 5.4l-1.7 1.7M7.1 16.9l-1.7 1.7M18.6 18.6l-1.7-1.7M7.1 7.1 5.4 5.4"/>',
  moon: '<path d="M20.4 14.2A8.6 8.6 0 0 1 9.8 3.6a8.6 8.6 0 1 0 10.6 10.6z"/>',

  // Stato
  warning: '<path d="M12 3.6 2.9 19.5a1.1 1.1 0 0 0 1 1.6h16.2a1.1 1.1 0 0 0 1-1.6z"/><path d="M12 9.4v4.8M12 17.4h.01"/>',
  lock: '<rect x="4.6" y="10.4" width="14.8" height="10.2" rx="2"/><path d="M8.1 10.4V7.6a3.9 3.9 0 0 1 7.8 0v2.8"/>',
  unlock: '<rect x="4.6" y="10.4" width="14.8" height="10.2" rx="2"/><path d="M8.1 10.4V7.6a3.9 3.9 0 0 1 7.5-1.4"/>',
  clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 6.9v5.4l3.5 2"/>',
  blocked: '<circle cx="12" cy="12" r="8.6"/><path d="m5.9 5.9 12.2 12.2"/>',
  pin: '<path d="M14.5 2.8 21.2 9.5l-2.6 1-1.4 4.2-6.9-6.9 4.2-1.4z"/><path d="m10.3 13.7-6.6 6.6"/>',

  // Documenti e denaro
  file: '<path d="M13.4 3.4H6.9a1.6 1.6 0 0 0-1.6 1.6v14a1.6 1.6 0 0 0 1.6 1.6h10.2a1.6 1.6 0 0 0 1.6-1.6V8.4z"/><path d="M13.4 3.4v5h5.3"/><path d="M8.6 13h6.8M8.6 16.6h4.8"/>',
  sheet: '<rect x="3.4" y="4.4" width="17.2" height="15.2" rx="1.8"/><path d="M3.4 9.6h17.2M3.4 14.6h17.2M9.6 4.4v15.2"/>',
  cart: '<path d="M2.6 3.6h2.7l2.4 11.1a1.5 1.5 0 0 0 1.5 1.2h8.1a1.5 1.5 0 0 0 1.5-1.2l1.4-6.6H6.1"/><circle cx="9.6" cy="19.6" r="1.5"/><circle cx="17.2" cy="19.6" r="1.5"/>',
  euro: '<path d="M18.2 6.4a7.5 7.5 0 1 0 0 11.2"/><path d="M4.6 10.4h9.2M4.6 13.9h9.2"/>',
  truck: '<path d="M2.8 6.4h9.9v10.2H2.8z"/><path d="M12.7 9.8h3.9l3.4 3.4v3.4h-7.3"/><circle cx="7" cy="18.4" r="1.8"/><circle cx="16.6" cy="18.4" r="1.8"/>',
  factory: '<path d="M2.8 20.6h18.4"/><path d="M4.6 20.6V9.8l5 3.4V9.8l5 3.4V5.8h4.8v14.8"/><path d="M8.2 17.2h1.6M13.2 17.2h1.6"/>',
  tag: '<path d="M11.7 3.4H4.6a1.2 1.2 0 0 0-1.2 1.2v7.1a1.2 1.2 0 0 0 .35.85l8.2 8.2a1.2 1.2 0 0 0 1.7 0l7.1-7.1a1.2 1.2 0 0 0 0-1.7l-8.2-8.2a1.2 1.2 0 0 0-.85-.35z"/><circle cx="8" cy="8" r="1.4"/>',
  clipboard: '<rect x="5.4" y="4.6" width="13.2" height="16" rx="1.8"/><path d="M9 4.6V3.4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.2"/><path d="M9 10.6h6M9 14.4h6M9 18h3.5"/>',
  list: '<path d="M9 6.4h11.4M9 12h11.4M9 17.6h11.4"/><path d="M4.4 6.4h.01M4.4 12h.01M4.4 17.6h.01"/>',
  // I due menu dell'intestazione stretta: le sezioni (☰) e i comandi (⋯).
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  receipt: '<path d="M5.4 2.8h13.2v18.4l-2.6-1.6-2.6 1.6-2.6-1.6-2.6 1.6-2.8-1.6z"/><path d="M9 7.8h6M9 11.6h6M9 15.2h3.4"/>',
  scale: '<path d="M12 4.4v15.2M7.4 20.6h9.2M4.6 6.6h14.8"/><path d="M4.6 6.6 2.2 12.4h4.8zM19.4 6.6 17 12.4h4.8"/><path d="M2.2 12.4a2.4 2.4 0 0 0 4.8 0M17 12.4a2.4 2.4 0 0 0 4.8 0"/>',
  chart: '<path d="M3.6 20.4h16.8"/><path d="M6.8 20.4v-6.6M11.6 20.4V7.6M16.4 20.4v-9.4"/>',
  building: '<path d="M4.2 20.8V4.6a1.4 1.4 0 0 1 1.4-1.4h8.4a1.4 1.4 0 0 1 1.4 1.4v16.2"/><path d="M15.4 9.4h3.2a1.4 1.4 0 0 1 1.4 1.4v10M2.8 20.8h18.4"/><path d="M7.6 7.4h4M7.6 11.4h4M7.6 15.4h4M18 13.4h.01M18 17h.01"/>',
  folder: '<path d="M3.4 6.6a1.6 1.6 0 0 1 1.6-1.6h4.2l2 2.6h7.4a1.6 1.6 0 0 1 1.6 1.6v9.2a1.6 1.6 0 0 1-1.6 1.6H5a1.6 1.6 0 0 1-1.6-1.6z"/>',
  card: '<rect x="2.8" y="5.4" width="18.4" height="13.2" rx="2"/><path d="M2.8 10h18.4M6.4 14.6h3.4"/>',
  pause: '<path d="M9.4 5.4v13.2M14.6 5.4v13.2"/>',
  save: '<path d="M5.4 3.6h11l3.2 3.2v13a1.8 1.8 0 0 1-1.8 1.8H5.4a1.8 1.8 0 0 1-1.8-1.8V5.4a1.8 1.8 0 0 1 1.8-1.8z"/><path d="M7.8 3.6v5.6h8V3.6"/><path d="M7.8 21.6v-6.4h8.4v6.4"/>',
  download: '<path d="M12 3.6v11.8"/><path d="m7.4 11 4.6 4.6 4.6-4.6"/><path d="M4.4 18.4v1.2a1.2 1.2 0 0 0 1.2 1.2h12.8a1.2 1.2 0 0 0 1.2-1.2v-1.2"/>',
  upload: '<path d="M12 15.4V3.6"/><path d="m7.4 8.2 4.6-4.6 4.6 4.6"/><path d="M4.4 18.4v1.2a1.2 1.2 0 0 0 1.2 1.2h12.8a1.2 1.2 0 0 0 1.2-1.2v-1.2"/>',
  users: '<circle cx="9.4" cy="8.4" r="3.4"/><path d="M3.4 20c.6-3.6 3-5.6 6-5.6s5.4 2 6 5.6"/><path d="M16 5.4a3.4 3.4 0 0 1 0 6.6"/><path d="M17.4 14.8c2 .7 3.3 2.5 3.7 5.2"/>',
  ruler: '<path d="M4.2 14.4 14.4 4.2a1.4 1.4 0 0 1 2 0l3.4 3.4a1.4 1.4 0 0 1 0 2L9.6 19.8a1.4 1.4 0 0 1-2 0l-3.4-3.4a1.4 1.4 0 0 1 0-2z"/><path d="m8.4 10.2 2.2 2.2M11.4 7.2l2.2 2.2M14.4 4.2l2.2 2.2M5.4 13.2l2.2 2.2"/>',

  // Header
  printer: '<path d="M6.8 8.6V3.4h10.4v5.2"/><path d="M6.8 17.6H5a1.6 1.6 0 0 1-1.6-1.6v-5a1.6 1.6 0 0 1 1.6-1.6h14a1.6 1.6 0 0 1 1.6 1.6v5a1.6 1.6 0 0 1-1.6 1.6h-1.8"/><rect x="6.8" y="14.4" width="10.4" height="6.2" rx="1.2"/>',
  qr: '<rect x="3.4" y="3.4" width="6.6" height="6.6" rx="1"/><rect x="14" y="3.4" width="6.6" height="6.6" rx="1"/><rect x="3.4" y="14" width="6.6" height="6.6" rx="1"/><path d="M14 14h2.6v2.6H14zM18 18h2.6v2.6H18zM14 20.6h1.4M20.6 14v1.4"/>',
  cloud: '<path d="M7.2 18.6h10a4.1 4.1 0 0 0 .7-8.1 5.7 5.7 0 0 0-11-1.3 4.7 4.7 0 0 0 .3 9.4z"/>',
  key: '<circle cx="7.8" cy="15.8" r="3.8"/><path d="m10.6 13.1 9.6-9.6"/><path d="m17.4 6.3 2.4 2.4M15 8.7l2.4 2.4"/>',
  logout: '<path d="M9 20.6H5.4a1.9 1.9 0 0 1-1.9-1.9V5.3a1.9 1.9 0 0 1 1.9-1.9H9"/><path d="m16 16.8 4.8-4.8L16 7.2"/><path d="M20.5 12H9"/>',
  logo: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7"/><path d="M12 11v10"/>',
  book: '<path d="M4.4 4.8a1.8 1.8 0 0 1 1.8-1.8h11.4a1.8 1.8 0 0 1 1.8 1.8v14.4a1.8 1.8 0 0 1-1.8 1.8H6.2a1.8 1.8 0 0 1-1.8-1.8z"/><path d="M7.8 3v18"/><path d="M10.8 7.8h5.4M10.8 11.2h5.4M10.8 14.6h3.4"/>',
};

// ─── Colore ───
//
// Il colore di un'icona non è decorazione: è la scorciatoia che fa trovare la
// riga giusta senza leggerla. Vale però solo se è **costante** — il cestino
// rosso ovunque, l'Excel verde ovunque — e se resta dentro la tavolozza
// dell'app, altrimenti diventa rumore. Ogni icona ha quindi una tinta sola,
// scelta fra le variabili già esistenti, e chi non ce l'ha eredita il colore
// del testo intorno.
//
// La tinta si applica solo dove serve: `ico('trash', 'tinted')`. Nei pulsanti
// che hanno già un colore loro (`.mini-btn.danger`, la voce di menu attiva)
// l'icona continua a ereditarlo, che è il comportamento giusto: lì il colore
// dice lo *stato*, e lo stato vince sulla categoria.
const ICON_TINT = {
  // Navigazione: ogni gruppo il suo colore, come le linee di una metropolitana
  home: 'accent', contacts: 'accent', package: 'orange', wrench: 'purple',
  tree: 'green', mail: 'accent', settings: 'text-dim',
  // Azioni
  edit: 'accent', trash: 'red', link: 'purple', search: 'accent', plus: 'green',
  copy: 'accent', check: 'green', close: 'red', refresh: 'accent', eye: 'accent',
  // Stato
  warning: 'orange', lock: 'orange', unlock: 'green', clock: 'purple',
  blocked: 'red', pin: 'orange',
  // Documenti e denaro
  file: 'red', sheet: 'green', cart: 'orange', euro: 'green', truck: 'accent',
  factory: 'purple', tag: 'orange', clipboard: 'accent', chart: 'purple',
  list: 'accent', receipt: 'accent', scale: 'orange',
  building: 'accent', folder: 'orange', card: 'green', pause: 'orange',
  save: 'accent', download: 'green', upload: 'accent', users: 'accent', ruler: 'purple',
  // Header
  printer: 'text-dim', qr: 'accent', key: 'orange', logout: 'red', logo: 'accent', book: 'text-dim',
  menu: 'text-dim', more: 'text-dim',
};

// Le regole di tinta si generano dalla mappa qui sopra: la tavolozza resta in
// un posto solo, e aggiungere un'icona non significa ricordarsi di un secondo
// file da aggiornare.
// La tinta passa da una variabile (`--ic-tint`) invece di essere scritta dentro
// la regola del colore: così un contesto che vuole ridipingere le icone — la
// stampa, una variante da provare — riscrive una riga sola e non 43.
function iconTintCss() {
  return '.ico.tinted{color:var(--ic-tint,currentColor)}'
    + Object.keys(ICON_TINT)
      .map(k => `.ico.ic-${k}{--ic-tint:var(--${ICON_TINT[k]})}`).join('');
}

// ─── Il testo che compare al passaggio del mouse ───
//
// Un disegno è muto: chi non lo riconosce non ha modo di scoprire cosa fa se
// non provandolo. Ogni icona ha quindi un nome, e il nome compare come
// suggerimento passandoci sopra — è quello che l'emoji non ha mai avuto.
//
// I nomi dicono l'**azione**, non il disegno: «Elimina», non «cestino». A chi
// guarda non interessa cosa raffigura, interessa cosa succede se ci clicca.
const ICON_LABEL = {
  home: 'Riepilogo', contacts: 'Anagrafica', package: 'Magazzino',
  wrench: 'Lavorazione', tree: 'Distinta base', mail: 'Documenti', settings: 'Gestione',
  edit: 'Modifica', trash: 'Elimina', link: 'Dove è usato', search: 'Cerca',
  plus: 'Aggiungi', copy: 'Duplica', check: 'Fatto', close: 'Chiudi',
  chevronRight: 'Espandi', chevronDown: 'Comprimi', refresh: 'Ricalcola', eye: 'Sola lettura',
  sun: 'Tema chiaro', moon: 'Tema scuro',
  warning: 'Attenzione', lock: 'Bloccato', unlock: 'Sbloccato', clock: 'Storico',
  blocked: 'Non più utilizzabile', pin: 'Revisione',
  file: 'PDF', sheet: 'Excel', cart: 'Acquisto', euro: 'Prezzi e listino',
  truck: 'Consegna', factory: 'Produzione interna', tag: 'Codice',
  clipboard: 'Commessa', chart: 'Report', save: 'Salva',
  list: 'Fabbisogno', receipt: 'Ordine', scale: 'Rettifica giacenza',
  building: 'Azienda', folder: 'Famiglia', card: 'Pagamento', pause: 'Sospendi',
  download: 'Esporta', upload: 'Importa', users: 'Utenti', ruler: 'Unità di misura',
  printer: 'Stampa', qr: 'Codice QR', key: 'Password', logout: 'Esci', logo: 'Bomtrack',
};

// Il nome di un'icona è dato dal codice, mai da chi usa l'app: se non esiste è
// un errore di scrittura, e un riquadro vuoto lo fa notare senza rompere la
// pagina intorno.
//
// `label` è il suggerimento: assente prende il nome di serie, esplicito lo
// sostituisce — dentro un pulsante conviene ripetere il testo del pulsante, che
// è sempre più preciso («Distinta parte e ciclo» batte «Lavorazione»). La
// stringa vuota lo toglie del tutto, per l'icona che sta accanto a un testo che
// la spiega già: ripetere lo stesso nome due volte è rumore, non aiuto.
//
// Il suggerimento sta su uno `<span>` e non sull'`<svg>`: l'attributo `title`
// su un elemento SVG non apre nessun riquadro, è un attributo HTML in casa
// d'altri. Lo span, per giunta, non ha testo, quindi non disturba il calcolo
// dell'etichetta accessibile dei pulsanti a sola icona (vedi `a11yFields`).
function ico(name, cls, label) {
  if (!ICONS[name]) return '';
  const svg = `<svg class="ico ic-${name}${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#ic-${name}"></use></svg>`;
  const t = label === undefined ? ICON_LABEL[name] : label;
  // Il title passa da esc() come ogni altro testo che finisce in un attributo.
  // Oggi tutti i chiamanti passano stringhe scritte nel codice, quindi non c'è
  // niente da sfruttare — ma questa è una funzione che invita a ricevere testo
  // dinamico (un ico('wrench', '', wc.name) sembra la cosa più naturale del
  // mondo), ed era l'unico punto del disegno fuori dalla convenzione.
  return t ? `<span class="ico-w" title="${esc(t)}">${svg}</span>` : svg;
}

function iconSprite() {
  const symbols = Object.keys(ICONS)
    .map(k => `<symbol id="ic-${k}" viewBox="0 0 24 24">${ICONS[k]}</symbol>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">${symbols}</svg>`;
}

// Lo sprite si monta da sé quando il file viene incluso in una pagina vera. Il
// DOM finto della suite di test non ha `insertAdjacentHTML`: lì la guardia non
// passa, `ico()` resta comunque disponibile e nessun test si accorge di niente.
if (typeof document !== 'undefined' && document.body && document.body.insertAdjacentHTML) {
  document.body.insertAdjacentHTML('afterbegin', iconSprite());
  const st = document.createElement('style');
  st.id = 'icon-tints';
  st.textContent = iconTintCss();
  document.head.appendChild(st);
}
