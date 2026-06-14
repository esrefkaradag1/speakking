#!/usr/bin/env bash
# Uzak Supabase Postgres'e SQL uygular (CLI link gerekmez).
# Kullanim:
#   export SUPABASE_DB_PASSWORD='...'   # Dashboard → Settings → Database
#   ./scripts/supabase-remote.sh
#   ./scripts/supabase-remote.sh --seed
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REF="${SUPABASE_PROJECT_REF:-lpqtzmjhhmuyyenjemug}"
PASS="${SUPABASE_DB_PASSWORD:-}"
SEED=false

for arg in "$@"; do
  case "$arg" in
    --seed) SEED=true ;;
    --ref=*) REF="${arg#*=}" ;;
    -h|--help)
      echo "Usage: SUPABASE_DB_PASSWORD=... $0 [--seed] [--ref=project_ref]"
      exit 0
      ;;
  esac
done

if [[ -z "$PASS" ]]; then
  echo "Hata: SUPABASE_DB_PASSWORD tanimli degil."
  echo "Supabase Dashboard → Project Settings → Database → Database password"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Hata: psql bulunamadi (brew install postgresql@17)"
  exit 1
fi

HOST="db.${REF}.supabase.co"
export PGPASSWORD="$PASS"

echo "→ Baglanti: $HOST (ref: $REF)"
psql -h "$HOST" -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "select version();" >/dev/null

echo "→ apply-canli-500.sql"
psql -h "$HOST" -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -f "$ROOT/supabase/apply-canli-500.sql"

if $SEED; then
  echo "→ import-from-mongo.sql"
  psql -h "$HOST" -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -f "$ROOT/supabase/import-from-mongo.sql"
fi

echo "→ REST kontrol (anon)"
ANON="${REACT_APP_SUPABASE_ANON_KEY:-}"
URL="${REACT_APP_SUPABASE_URL:-https://${REF}.supabase.co}"
if [[ -n "$ANON" ]]; then
  CODE=$(curl -s -o /tmp/sb-test.json -w "%{http_code}" \
    "${URL}/rest/v1/scenarios?select=id&limit=1" \
    -H "apikey: ${ANON}" -H "Authorization: Bearer ${ANON}" || true)
  echo "   scenarios HTTP $CODE"
  head -c 200 /tmp/sb-test.json 2>/dev/null; echo
fi

echo "Tamam."
