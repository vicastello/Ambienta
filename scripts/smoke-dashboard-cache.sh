#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

assert_eq() {
  local got="$1"
  local expected="$2"
  local label="$3"
  if [[ "$got" != "$expected" ]]; then
    fail "$label: esperado '$expected', obtido '$got'"
  fi
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Comando obrigatório não encontrado: $1"
}

get_header() {
  local headers_file="$1"
  local header_name="$2"
  # Retorna o valor do header (sem CRLF). Caso múltiplas ocorrências, pega a última.
  grep -i "^${header_name}:" "$headers_file" | tail -n 1 | sed -E 's/^[^:]+:[[:space:]]*//I' | tr -d '\r'
}

curl_check() {
  local url="$1"
  local headers_file="$2"

  local status
  status=$(curl -sS -D "$headers_file" -o /dev/null -w '%{http_code}' "$url" || true)
  echo "$status"
}

require_cmd psql
require_cmd curl

DB_URL="${SUPABASE_DB_URL:-${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}}"
DASHBOARD_URL="${DASHBOARD_URL:-http://localhost:3000/api/tiny/dashboard/resumo}"
DASHBOARD_START="${DASHBOARD_START:-2025-12-01}"
DASHBOARD_END="${DASHBOARD_END:-2025-12-07}"

URL="${DASHBOARD_URL}?dataInicial=${DASHBOARD_START}&dataFinal=${DASHBOARD_END}"

PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 -X -q -t -A)

renamed=0
reload_postgrest_schema() {
  # PostgREST (usado pelo supabase-js) mantém schema cache; renomear tabela pode exigir reload.
  "${PSQL[@]}" -c "notify pgrst, 'reload schema';" >/dev/null
  # Pequena espera para o PostgREST aplicar o reload antes do curl.
  sleep 0.5
}

restore_table() {
  if [[ "$renamed" -eq 1 ]]; then
    "${PSQL[@]}" -c "alter table public.dashboard_resumo_cache__tmp_mismatch rename to dashboard_resumo_cache;" >/dev/null
    renamed=0
    reload_postgrest_schema
  fi
}
trap restore_table EXIT

# Preflight: garante que a tabela base existe antes do teste
regclass=$("${PSQL[@]}" -c "select to_regclass('public.dashboard_resumo_cache');")
[[ "$regclass" == "dashboard_resumo_cache" ]] || fail "Tabela public.dashboard_resumo_cache não existe (rode migrations/supabase db reset?)"

# 1) Renomeia public.dashboard_resumo_cache para __tmp_mismatch
"${PSQL[@]}" -c "alter table public.dashboard_resumo_cache rename to dashboard_resumo_cache__tmp_mismatch;" >/dev/null
renamed=1
reload_postgrest_schema

# 2) Faz curl e valida HTTP 200 + X-Dashboard-Cache-Reason: schema_mismatch
headers_1=$(mktemp)
status=$(curl_check "$URL" "$headers_1")
assert_eq "$status" "200" "HTTP status (schema_mismatch)"

reason=$(get_header "$headers_1" "X-Dashboard-Cache-Reason")
[[ -n "$reason" ]] || fail "Header X-Dashboard-Cache-Reason ausente (schema_mismatch). Headers: $(tr -d '\r' < "$headers_1" | tail -n 50)"
assert_eq "$reason" "schema_mismatch" "X-Dashboard-Cache-Reason (schema_mismatch)"

# 3) Renomeia de volta
restore_table

# Limpa a entrada do cache desse período/sem filtros para o teste MISS→HIT ser determinístico
"${PSQL[@]}" -c "delete from public.dashboard_resumo_cache where periodo_inicio = date '${DASHBOARD_START}' and periodo_fim = date '${DASHBOARD_END}' and canais_key = 'all' and situacoes_key = 'all';" >/dev/null

# 4) Faz 2 curls iguais e valida MISS cache_empty na primeira e HIT hit na segunda
headers_2=$(mktemp)
status=$(curl_check "$URL" "$headers_2")
assert_eq "$status" "200" "HTTP status (request 1)"

cache=$(get_header "$headers_2" "X-Dashboard-Cache")
reason=$(get_header "$headers_2" "X-Dashboard-Cache-Reason")
[[ -n "$cache" ]] || fail "Header X-Dashboard-Cache ausente (request 1)."
[[ -n "$reason" ]] || fail "Header X-Dashboard-Cache-Reason ausente (request 1)."
assert_eq "$cache" "MISS" "X-Dashboard-Cache (request 1)"
assert_eq "$reason" "cache_empty" "X-Dashboard-Cache-Reason (request 1)"

headers_3=$(mktemp)
status=$(curl_check "$URL" "$headers_3")
assert_eq "$status" "200" "HTTP status (request 2)"

cache=$(get_header "$headers_3" "X-Dashboard-Cache")
reason=$(get_header "$headers_3" "X-Dashboard-Cache-Reason")
[[ -n "$cache" ]] || fail "Header X-Dashboard-Cache ausente (request 2)."
[[ -n "$reason" ]] || fail "Header X-Dashboard-Cache-Reason ausente (request 2)."
assert_eq "$cache" "HIT" "X-Dashboard-Cache (request 2)"
assert_eq "$reason" "hit" "X-Dashboard-Cache-Reason (request 2)"

echo "OK: smoke-dashboard-cache passou."
