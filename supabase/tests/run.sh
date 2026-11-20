#!/usr/bin/env bash
# Runs supabase/schema.sql twice on a throwaway local Postgres, then the database tests.
# Needs Postgres installed locally (for example: brew install postgresql@17). Nothing touches Supabase.
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v initdb >/dev/null || ! command -v pg_ctl >/dev/null; then
  echo "Postgres is not installed, skipping the database tests (brew install postgresql@17)."; exit 0
fi
export LC_ALL=C LANG=C
DIR="$(mktemp -d)"; SOCK="$(mktemp -d /tmp/wbpg.XXXX)"; PORT=55432
cleanup() { pg_ctl -D "$DIR" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR" "$SOCK"; }
trap cleanup EXIT
initdb -D "$DIR" -U postgres -A trust >/dev/null
pg_ctl -D "$DIR" -o "-p $PORT -k $SOCK -c listen_addresses=''" -l "$DIR/log" start >/dev/null
PSQL=(psql -h "$SOCK" -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f auth-stub.sql
for run in 1 2; do
  if ! out=$("${PSQL[@]}" -f ../schema.sql 2>&1); then echo "$out" | grep -v NOTICE; echo "schema.sql failed (run $run)"; exit 1; fi
done
echo "ok - schema.sql runs twice without errors"
"${PSQL[@]}" -f grants.sql
if ! out=$("${PSQL[@]}" -f tests.sql 2>&1); then
  echo "$out" | sed -n 's/.*NOTICE:  //p'; echo "$out" | grep -E "ERROR|FAILED" | sed 's/^psql:[^ ]* //'; exit 1
fi
echo "$out" | sed -n 's/.*NOTICE:  //p'
echo "All $(echo "$out" | grep -c 'NOTICE:  ok') database checks passed."
