#!/usr/bin/env bash
set -euo pipefail

# Aceita SUPABASE_DB_URL diretamente, ou DATABASE_URL, ou ainda usa o pooler-url do Supabase
# (recomendado junto com PGPASSWORD, para não precisar URL-encode da senha).
if [[ -z "${SUPABASE_DB_URL:-}" && -n "${DATABASE_URL:-}" ]]; then
  export SUPABASE_DB_URL="$DATABASE_URL"
fi

POOLER_URL_FILE="supabase/.temp/pooler-url"
if [[ -z "${SUPABASE_DB_URL:-}" && -f "$POOLER_URL_FILE" ]]; then
  pooler_url="$(cat "$POOLER_URL_FILE")"
  if [[ "$pooler_url" != *"sslmode="* ]]; then
    if [[ "$pooler_url" == *"?"* ]]; then
      pooler_url="$pooler_url&sslmode=require"
    else
      pooler_url="$pooler_url?sslmode=require"
    fi
  fi

  if [[ -n "${SUPABASE_DB_PASSWORD:-}" ]]; then
    prefix="${pooler_url%%@*}"
    suffix="${pooler_url#*@}"
    user="${prefix#postgresql://}"
    export SUPABASE_DB_URL="postgresql://${user}:${SUPABASE_DB_PASSWORD}@${suffix}"
  else
    # Se PGPASSWORD estiver setado, o psql usa automaticamente.
    export SUPABASE_DB_URL="$pooler_url"
  fi
fi

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "❌ SUPABASE_DB_URL não está definido (e não foi possível inferir via DATABASE_URL/pooler-url).\n"
  echo "Opções:"
  echo "  1) Exportar a connection string completa (recomendado):"
  echo "     export SUPABASE_DB_URL='postgresql://postgres:***@db.[ref].supabase.co:5432/postgres?sslmode=require'"
  echo "  2) Exportar apenas a senha e usar o pooler-url do repo (evita URL-encode):"
  echo "     export PGPASSWORD='***'"
  echo "     bash scripts/apply_all_migrations_psql.sh"
  echo
  echo "Como obter: Supabase Dashboard -> Project Settings -> Database -> Connection string (psql)."
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
SKIPPED=0

ensure_migrations_table() {
  # Se já existir, não faz nada.
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -qAt >/dev/null <<'SQL'
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'supabase_migrations') then
    create schema supabase_migrations;
  end if;

  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'supabase_migrations'
      and table_name = 'schema_migrations'
  ) then
    create table supabase_migrations.schema_migrations (
      version text primary key,
      inserted_at timestamptz not null default now()
    );
  end if;
end $$;
SQL
}

is_applied() {
  local version_full="$1"
  local version_id="$2"
  local found
  local escaped_full
  local escaped_id
  escaped_full="${version_full//"'"/"''"}"
  escaped_id="${version_id//"'"/"''"}"
  found="$(psql "$SUPABASE_DB_URL" -qAt 2>/dev/null <<SQL || true
\\set v_full '${escaped_full}'
\\set v_id '${escaped_id}'
select 1
from supabase_migrations.schema_migrations
where version in (:'v_full', :'v_id')
limit 1;
SQL
  )"
  [[ "$found" == "1" ]]
}

mark_applied() {
  local version_id="$1"
  local escaped_version
  escaped_version="${version_id//"'"/"''"}"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -qAt >/dev/null <<SQL
\\set version '${escaped_version}'
insert into supabase_migrations.schema_migrations(version)
values (:'version')
on conflict do nothing;
SQL
}

echo "▶️  Garantindo tabela de controle supabase_migrations.schema_migrations..."
ensure_migrations_table

# Ordena por nome (timestamp no prefixo)
while IFS= read -r -d '' file; do
  ((TOTAL++)) || true
  version_full="$(basename "$file" .sql)"
  version_id="${version_full%%_*}"

  if is_applied "$version_full" "$version_id"; then
    echo "\n⏭️  Pulando (já aplicada): $(basename "$file")"
    ((SKIPPED++)) || true
    continue
  fi

  echo "\n════════════════════════════════════════════"
  echo "▶️  Aplicando: $(basename "$file")"
  echo "════════════════════════════════════════════"
  if ! psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$file" >/dev/null; then
    echo "❌ Erro ao aplicar $(basename "$file")"
    ((ERRORS++)) || true
  else
    mark_applied "$version_id"
    echo "✅ OK: $(basename "$file")"
  fi

done < <(find "$MIG_DIR" -maxdepth 1 -type f -name '*.sql' -print0 | sort -z)

echo "\n════════════════════════════════════════════"
echo "RESULTADO"
echo "════════════════════════════════════════════"
echo "Arquivos processados: $TOTAL"
echo "Pulados (já aplicados): $SKIPPED"
if [[ $ERRORS -gt 0 ]]; then
  echo "Com erros: $ERRORS"
  exit 2
else
  echo "Todos aplicados com sucesso."
fi
