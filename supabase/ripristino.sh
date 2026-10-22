#!/usr/bin/env bash
# Rimette in un progetto Supabase un backup fatto da supabase/backup.sh.
#
#   SUPABASE_DB_URL=postgresql://…  BACKUP_PASSPHRASE=…  supabase/ripristino.sh archivio.sql.gz.gpg
#
# Il progetto di destinazione dev'essere **nuovo**, con supabase/schema.sql già
# eseguito e nessun utente: le righe che esistono già non si sovrascrivono.
# Tutto in una transazione: o entra il backup intero, o non entra niente.
set -euo pipefail

file="${1:?indica il backup da ripristinare}"
: "${SUPABASE_DB_URL:?manca SUPABASE_DB_URL}"
: "${BACKUP_PASSPHRASE:?manca BACKUP_PASSPHRASE}"

gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 --decrypt "$file" 3<<<"$BACKUP_PASSPHRASE" \
  | gunzip \
  | psql "$SUPABASE_DB_URL" --quiet --single-transaction -v ON_ERROR_STOP=1 -o /dev/null

echo "Ripristino completato."
