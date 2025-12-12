#!/usr/bin/env tsx
/**
 * Lê todos os kits cadastrados em tiny_produtos (tipo = 'K') e insere/atualiza
 * os componentes na tabela marketplace_kit_components para todos os marketplaces.
 *
 * Uso:
 *   NODE_OPTIONS='-r dotenv/config' DOTENV_CONFIG_PATH=.env.local npx tsx scripts/seed-kits-from-tiny.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const MARKETPLACES = ['magalu', 'shopee', 'mercado_livre'] as const;

type KitComponent = {
  marketplace: (typeof MARKETPLACES)[number];
  marketplace_sku: string;
  component_sku: string;
  component_qty: number;
};

async function main() {
  console.log('Lendo kits (tiny_produtos.tipo = K)...');
  const { data: kits, error } = await supabase
    .from('tiny_produtos')
    .select('codigo, raw_payload')
    .eq('tipo', 'K');

  if (error) {
    console.error('Erro ao ler kits:', error);
    process.exit(1);
  }

  const rows: KitComponent[] = [];

  for (const kit of kits || []) {
    const kitSku = kit.codigo;
    const kitArray = (kit.raw_payload as any)?.kit;
    if (!kitSku || !Array.isArray(kitArray) || !kitArray.length) continue;

    for (const comp of kitArray) {
      const compSku = comp?.produto?.sku || comp?.produto?.codigo;
      const compQty = Number(comp?.quantidade ?? 1) || 1;
      if (!compSku) continue;
      for (const mkt of MARKETPLACES) {
        rows.push({
          marketplace: mkt,
          marketplace_sku: String(kitSku),
          component_sku: String(compSku),
          component_qty: compQty,
        });
      }
    }
  }

  if (!rows.length) {
    console.log('Nenhum kit encontrado para inserir.');
    return;
  }

  console.log(`Upsert de ${rows.length} mapeamentos (kits x componentes x marketplaces)...`);
  const { error: upsertError } = await supabase
    .from('marketplace_kit_components')
    .upsert(rows, { onConflict: 'marketplace,marketplace_sku,component_sku' });

  if (upsertError) {
    console.error('Erro no upsert:', upsertError);
    process.exit(1);
  }

  console.log('✓ Mapeamentos atualizados.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
