#!/bin/bash

# Carregar variáveis do .env.local
set -a
source .env.local
set +a

# Executar o backfill
npx tsx scripts/backfill-complete-working.ts
