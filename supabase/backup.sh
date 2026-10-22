#!/usr/bin/env bash
# Copia cifrata dell'archivio condiviso, fuori da Supabase (dalla 0.107.0).
#
# Il piano gratuito di Supabase non fa backup: se il progetto si perde, si
# perde (docs/sostenibilita-free-tier.md). Questo script scarica i dati e li
# cifra con una frase segreta; lo lancia ogni notte
# .github/workflows/supabase-veglia.yml, e si può lanciare a mano.
#
#   SUPABASE_DB_URL=postgresql://…  BACKUP_PASSPHRASE=…  supabase/backup.sh archivio.sql.gz.gpg
#
# Solo i dati: la struttura la rifà supabase/schema.sql. Dentro ci sono lo
# schema public (tutto Bomtrack) e gli utenti di Supabase Auth, perché ogni
# profilo nasce da un utente e senza di loro nessuno rientrerebbe. Gli utenti
# portano gli hash delle password: è uno dei motivi per cui il file esce
# cifrato e non esiste mai in chiaro sul disco.
#
# Le righe sono INSERT … ON CONFLICT DO NOTHING: le voci che schema.sql crea da
# sé (il registro delle tabelle) non fanno fallire il ripristino.
# Si ripristina con supabase/ripristino.sh.
set -euo pipefail

out="${1:?indica il file da scrivere, es. archivio.sql.gz.gpg}"
: "${SUPABASE_DB_URL:?manca SUPABASE_DB_URL}"
: "${BACKUP_PASSPHRASE:?manca BACKUP_PASSPHRASE}"

tabelle_auth=(--table=auth.users)
# auth.identities c'è in ogni progetto Supabase (lega l'utente al modo in cui
# accede); un Postgres di prova può non averla.
if [ "$(psql "$SUPABASE_DB_URL" -Atc "select to_regclass('auth.identities') is not null")" = t ]; then
  tabelle_auth+=(--table=auth.identities)
fi

{
  # Durante il ripristino i trigger non devono riscrivere autori e versioni,
  # né le chiavi esterne pretendere un ordine fra le tabelle: le righe
  # tornano come erano.
  echo 'set session_replication_role = replica;'
  # Due passate: con --table, pg_dump ignora --schema e scarica solo le tabelle
  # nominate. Prima gli utenti, poi Bomtrack.
  for scelta in "${tabelle_auth[*]}" --schema=public; do
    # shellcheck disable=SC2086 # le opzioni vanno spezzate
    pg_dump "$SUPABASE_DB_URL" --data-only $scelta \
      --inserts --rows-per-insert=500 --on-conflict-do-nothing --no-owner --no-privileges
  done
} | gzip -9 | gpg --batch --yes --quiet --pinentry-mode loopback \
      --passphrase-fd 3 --symmetric --cipher-algo AES256 --output "$out" \
      3<<<"$BACKUP_PASSPHRASE"

echo "Backup scritto in $out ($(wc -c <"$out") byte)."
