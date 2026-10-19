// ═══════════════════════════════════════════════════════════
//  BOMTRACK — Edge Function «bomtrack-utenti» (dalla 0.105.0)
// ═══════════════════════════════════════════════════════════
// Gli utenti dall'app, senza passare dal pannello di Supabase: l'amministratore
// crea un collega o gli genera un link per reimpostare la password, e il link
// lo gira lui (WhatsApp, Teams, email). Nessuna email parte da qui.
//
// Gira sul server Supabase con la chiave di servizio, che non passa mai dal
// browser. Due regole la tengono stretta:
//  - la chiama solo un **amministratore attivo**: lo si verifica dal suo token,
//    sul suo profilo;
//  - il ruolo del collega **non** passa dai metadati dell'utente Auth (che
//    chiunque si registri può scrivere): il profilo nasce lettore sospeso dal
//    trigger profilo_da_utente, e ruolo e stato li scrive poi l'amministratore,
//    **con il suo token**, sotto le stesse policy e lo stesso trigger di guardia
//    di ogni altra modifica dall'app.
//
// Pubblicazione (una volta, e a ogni nuova versione di questo file):
//   Supabase → Edge Functions → Deploy a new function → «Via Editor»,
//   nome `bomtrack-utenti`, incolla tutto il file, Deploy.
// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY le fornisce
// Supabase da sé.
//
// Richieste (POST, JSON, con il token dell'amministratore):
//   { azione: 'invita', email, nome, ruolo, ritorno }  → { link, id }
//   { azione: 'reimposta', id, ritorno }               → { link }
// `ritorno` è l'indirizzo dell'app: deve stare fra i Redirect URLs del
// progetto, altrimenti Supabase usa il Site URL.

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const RUOLI = ["admin", "acquisti", "progettazione", "officina", "lettore"];

function risposta(stato: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status: stato, headers: { ...CORS, "Content-Type": "application/json" } });
}
const errore = (stato: number, messaggio: string) => risposta(stato, { error: messaggio });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return errore(405, "Metodo non consentito");

  const url = Deno.env.get("SUPABASE_URL")!;
  const servizio = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return errore(401, "Accesso richiesto");
  const { data: chi, error: chiErr } = await servizio.auth.getUser(token);
  if (chiErr || !chi?.user) return errore(401, "Sessione non valida: accedi di nuovo");
  const { data: io } = await servizio.from("profiles").select("id, role, active").eq("id", chi.user.id).maybeSingle();
  if (!io || io.role !== "admin" || io.active === false) return errore(403, "Solo un amministratore gestisce gli utenti");
  // Le scritture sui profili passano come l'amministratore: policy e trigger
  // di guardia valgono anche qui.
  const comeAdmin = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });

  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return errore(400, "Richiesta senza JSON"); }
  const azione = String(corpo.azione || "");
  const ritorno = typeof corpo.ritorno === "string" && /^https?:\/\//.test(corpo.ritorno) ? corpo.ritorno : undefined;

  if (azione === "invita") {
    const email = String(corpo.email || "").trim().toLowerCase();
    const nome = String(corpo.nome || "").trim();
    const ruolo = String(corpo.ruolo || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errore(400, "Email non valida");
    if (!nome) return errore(400, "Serve il nome");
    if (!RUOLI.includes(ruolo)) return errore(400, "Ruolo non valido");
    // Nei metadati solo il nome: il ruolo non passa mai di qui.
    const { data, error } = await servizio.auth.admin.generateLink({
      type: "invite", email, options: { data: { name: nome }, redirectTo: ritorno },
    });
    if (error || !data?.user) {
      if (error && /already|registered|exists/i.test(error.message)) {
        return errore(409, "Questa email ha già un utente: per farlo rientrare genera un link per reimpostare la password");
      }
      return errore(400, error ? error.message : "Invito non riuscito");
    }
    const ora = new Date().toISOString();
    const { error: profErr } = await comeAdmin.from("profiles")
      .update({ name: nome, role: ruolo, active: true, updated_at: ora, updated_by: io.id })
      .eq("id", data.user.id);
    if (profErr) return errore(400, "Utente creato, ma il ruolo non è stato assegnato: " + profErr.message + ". Assegnalo da Gestione → Utenti");
    return risposta(200, { link: data.properties.action_link, id: data.user.id });
  }

  if (azione === "reimposta") {
    const id = String(corpo.id || "");
    const { data: lui } = await servizio.from("profiles").select("id, email, role, active").eq("id", id).maybeSingle();
    if (!lui) return errore(404, "Utente non trovato");
    // Con il link di un altro amministratore si entrerebbe al suo posto: lui
    // usa «Password dimenticata?» dalla schermata d'accesso.
    if (lui.role === "admin" && lui.id !== io.id) {
      return errore(403, "La password di un altro amministratore non si reimposta da qui: usi «Password dimenticata?» dalla schermata d'accesso");
    }
    // L'email si prende dall'utente di Supabase Auth, non dal profilo: è
    // quella che decide chi entra con il link. Un'email del profilo cambiata
    // con quella dell'amministratore porterebbe il link al suo account.
    const { data: au, error: auErr } = await servizio.auth.admin.getUserById(id);
    if (auErr || !au?.user?.email) return errore(404, "Utente non trovato");
    const { data, error } = await servizio.auth.admin.generateLink({
      type: "recovery", email: au.user.email, options: { redirectTo: ritorno },
    });
    if (error) return errore(400, error.message);
    return risposta(200, { link: data.properties.action_link });
  }

  return errore(400, "Azione sconosciuta");
});
