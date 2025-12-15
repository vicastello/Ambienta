#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "❌ SUPABASE_DB_URL não está definido.\n"
  echo "Como obter: Supabase Dashboard -> Project Settings -> Database -> Connection string (psql)."
  echo "Exemplo de uso:"
  echo "  export SUPABASE_DB_URL='postgresql://postgres:***@db.[ref].supabase.co:5432/postgres?sslmode=require'"
  echo "  bash scripts/apply_all_migrations_psql.sh"
  exit 1
fi

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
MIG_DIR="$ROOT_DIR/supabase/migrations"

if [[ ! -d "$MIG_DIR" ]]; then
  echo "❌ Pasta não encontrada: $MIG_DIR"
  exit 1
fi

ERRORS=0
TOTAL=0

# Ordena por nome (timestamp no prefixo)
while IFS= read -r -d '' file; do
  ((TOTAL++)) || true
  echo "\n════════════════════════════════════════════"
  echo "▶️  Aplicando: $(basename "$file")"
  echo "════════════════════════════════════════════"
  if ! psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$file" >/dev/null; then
    echo "❌ Erro ao aplicar $(basename "$file")"
    ((ERRORS++)) || true
  else
    echo "✅ OK: $(basename "$file")"
  fi

done < <(find "$MIG_DIR" -maxdepth 1 -type f -name '*.sql' -print0 | sort -z)

echo "\n════════════════════════════════════════════"
echo "RESULTADO"
echo "════════════════════════════════════════════"
echo "Arquivos processados: $TOTAL"
if [[ $ERRORS -gt 0 ]]; then
  echo "Com erros: $ERRORS"
  exit 2
else
  echo "Todos aplicados com sucesso."
fi
