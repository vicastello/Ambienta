import { config } from 'dotenv';
import { resolve } from 'path';

// Force load .env.local first
config({ path: resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/db-public';

// Create supabase client inline
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing required env vars');
  process.exit(1);
}

const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
  },
});

interface LinkResult {
  total_processed: number;
  total_linked: number;
  total_already_linked: number;
  total_not_found: number;
  errors: string[];
}

/**
 * Extrai o ID do pedido do marketplace do raw_payload ou coluna numero_pedido_ecommerce
 */
function extractMarketplaceOrderId(
  rawPayload: any,
  numeroPedidoEcommerce?: string | null
): string | null {
  // Primeiro tenta a coluna numero_pedido_ecommerce
  if (numeroPedidoEcommerce && typeof numeroPedidoEcommerce === 'string') {
    const trimmed = numeroPedidoEcommerce.trim();
    if (trimmed) return trimmed;
  }

  // Se não tiver, tenta o raw_payload
  if (!rawPayload) return null;

  const numeroEcommerce = rawPayload.ecommerce?.numeroPedidoEcommerce;
  if (numeroEcommerce && typeof numeroEcommerce === 'string') {
    return numeroEcommerce.trim();
  }

  return null;
}

/**
 * Vincula pedidos do Shopee desde 01/11/2025
 */
async function linkShopeeOrders(): Promise<LinkResult> {
  const result: LinkResult = {
    total_processed: 0,
    total_linked: 0,
    total_already_linked: 0,
    total_not_found: 0,
    errors: [],
  };

  console.log('\n=== VINCULANDO PEDIDOS SHOPEE DESDE 01/11/2025 ===\n');

  const startDate = '2025-11-01';

  // Buscar pedidos do Tiny do canal Shopee desde 01/11/2025
  const { data: tinyOrders, error: tinyError } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, numero_pedido, canal, data_criacao, raw_payload, numero_pedido_ecommerce')
    .gte('data_criacao', startDate)
    .eq('canal', 'Shopee')
    .order('data_criacao', { ascending: false });

  if (tinyError) {
    console.error('Erro ao buscar pedidos do Tiny:', tinyError);
    result.errors.push(`Erro ao buscar pedidos: ${tinyError.message}`);
    return result;
  }

  console.log(`Encontrados ${tinyOrders?.length || 0} pedidos do Tiny no canal Shopee\n`);

  for (const tinyOrder of tinyOrders || []) {
    result.total_processed++;

    // Extrair ID do marketplace
    const marketplaceOrderId = extractMarketplaceOrderId(
      tinyOrder.raw_payload,
      (tinyOrder as any).numero_pedido_ecommerce
    );

    if (!marketplaceOrderId) {
      console.log(`  ⊘ Pedido Tiny #${tinyOrder.numero_pedido}: sem ID do marketplace`);
      result.total_not_found++;
      continue;
    }

    // Verificar se já existe vínculo
    const { data: existingLink } = await supabaseAdmin
      .from('marketplace_order_links')
      .select('id')
      .eq('marketplace', 'shopee')
      .eq('marketplace_order_id', marketplaceOrderId)
      .maybeSingle();

    if (existingLink) {
      console.log(`  ○ Pedido ${marketplaceOrderId}: já vinculado`);
      result.total_already_linked++;
      continue;
    }

    // Verificar se o pedido existe no Shopee
    const { data: shopeeOrder } = await supabaseAdmin
      .from('shopee_orders')
      .select('order_sn')
      .eq('order_sn', marketplaceOrderId)
      .maybeSingle();

    if (!shopeeOrder) {
      console.log(`  ✗ Pedido ${marketplaceOrderId}: não encontrado no Shopee`);
      result.total_not_found++;
      continue;
    }

    // Criar vínculo
    const { error: linkError } = await supabaseAdmin
      .from('marketplace_order_links')
      .insert({
        marketplace: 'shopee',
        marketplace_order_id: marketplaceOrderId,
        tiny_order_id: tinyOrder.id,
        linked_by: 'auto-link-from-nov-script',
        confidence_score: 1.0,
        notes: `Vinculação automática desde 01/11/2025`,
      });

    if (linkError) {
      console.error(`  ✗ Erro ao vincular ${marketplaceOrderId}:`, linkError.message);
      result.errors.push(`${marketplaceOrderId}: ${linkError.message}`);
      continue;
    }

    console.log(`  ✓ Vinculado: Shopee ${marketplaceOrderId} → Tiny #${tinyOrder.numero_pedido} (ID: ${tinyOrder.id})`);
    result.total_linked++;
  }

  return result;
}

/**
 * Vincula pedidos do Magalu desde 01/11/2025
 */
async function linkMagaluOrders(): Promise<LinkResult> {
  const result: LinkResult = {
    total_processed: 0,
    total_linked: 0,
    total_already_linked: 0,
    total_not_found: 0,
    errors: [],
  };

  console.log('\n=== VINCULANDO PEDIDOS MAGALU DESDE 01/11/2025 ===\n');

  const startDate = '2025-11-01';

  const { data: tinyOrders, error: tinyError } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, numero_pedido, canal, data_criacao, raw_payload, numero_pedido_ecommerce')
    .gte('data_criacao', startDate)
    .eq('canal', 'Magalu')
    .order('data_criacao', { ascending: false });

  if (tinyError) {
    console.error('Erro ao buscar pedidos do Tiny:', tinyError);
    result.errors.push(`Erro: ${tinyError.message}`);
    return result;
  }

  console.log(`Encontrados ${tinyOrders?.length || 0} pedidos do Tiny no canal Magalu\n`);

  for (const tinyOrder of tinyOrders || []) {
    result.total_processed++;

    const marketplaceOrderId = extractMarketplaceOrderId(
      tinyOrder.raw_payload,
      (tinyOrder as any).numero_pedido_ecommerce
    );

    if (!marketplaceOrderId) {
      console.log(`  ⊘ Pedido Tiny #${tinyOrder.numero_pedido}: sem ID do marketplace`);
      result.total_not_found++;
      continue;
    }

    // Normalizar ID (remover prefixo LU- se tiver)
    const normalizedId = marketplaceOrderId.startsWith('LU-')
      ? marketplaceOrderId.replace(/^LU-/, '')
      : marketplaceOrderId;

    // Verificar vínculo existente
    const { data: existingLink } = await supabaseAdmin
      .from('marketplace_order_links')
      .select('id')
      .eq('marketplace', 'magalu')
      .eq('marketplace_order_id', normalizedId)
      .maybeSingle();

    if (existingLink) {
      console.log(`  ○ Pedido ${normalizedId}: já vinculado`);
      result.total_already_linked++;
      continue;
    }

    // Verificar se existe no Magalu
    const { data: magaluOrder } = await supabaseAdmin
      .from('magalu_orders')
      .select('order_id')
      .eq('order_id', normalizedId)
      .maybeSingle();

    if (!magaluOrder) {
      console.log(`  ✗ Pedido ${normalizedId}: não encontrado no Magalu`);
      result.total_not_found++;
      continue;
    }

    // Criar vínculo
    const { error: linkError } = await supabaseAdmin
      .from('marketplace_order_links')
      .insert({
        marketplace: 'magalu',
        marketplace_order_id: normalizedId,
        tiny_order_id: tinyOrder.id,
        linked_by: 'auto-link-from-nov-script',
        confidence_score: 1.0,
        notes: `Vinculação automática desde 01/11/2025`,
      });

    if (linkError) {
      console.error(`  ✗ Erro ao vincular ${normalizedId}:`, linkError.message);
      result.errors.push(`${normalizedId}: ${linkError.message}`);
      continue;
    }

    console.log(`  ✓ Vinculado: Magalu ${normalizedId} → Tiny #${tinyOrder.numero_pedido} (ID: ${tinyOrder.id})`);
    result.total_linked++;
  }

  return result;
}

/**
 * Vincula pedidos do Mercado Livre desde 01/11/2025
 */
async function linkMercadoLivreOrders(): Promise<LinkResult> {
  const result: LinkResult = {
    total_processed: 0,
    total_linked: 0,
    total_already_linked: 0,
    total_not_found: 0,
    errors: [],
  };

  console.log('\n=== VINCULANDO PEDIDOS MERCADO LIVRE DESDE 01/11/2025 ===\n');

  const startDate = '2025-11-01';

  const { data: tinyOrders, error: tinyError } = await supabaseAdmin
    .from('tiny_orders')
    .select('id, numero_pedido, canal, data_criacao, raw_payload, numero_pedido_ecommerce')
    .gte('data_criacao', startDate)
    .eq('canal', 'Mercado Livre')
    .order('data_criacao', { ascending: false });

  if (tinyError) {
    console.error('Erro ao buscar pedidos do Tiny:', tinyError);
    result.errors.push(`Erro: ${tinyError.message}`);
    return result;
  }

  console.log(`Encontrados ${tinyOrders?.length || 0} pedidos do Tiny no canal Mercado Livre\n`);

  for (const tinyOrder of tinyOrders || []) {
    result.total_processed++;

    const marketplaceOrderId = extractMarketplaceOrderId(
      tinyOrder.raw_payload,
      (tinyOrder as any).numero_pedido_ecommerce
    );

    if (!marketplaceOrderId) {
      console.log(`  ⊘ Pedido Tiny #${tinyOrder.numero_pedido}: sem ID do marketplace`);
      result.total_not_found++;
      continue;
    }

    // Verificar vínculo existente
    const { data: existingLink } = await supabaseAdmin
      .from('marketplace_order_links')
      .select('id')
      .eq('marketplace', 'mercado_livre')
      .eq('marketplace_order_id', marketplaceOrderId)
      .maybeSingle();

    if (existingLink) {
      console.log(`  ○ Pedido ${marketplaceOrderId}: já vinculado`);
      result.total_already_linked++;
      continue;
    }

    // Verificar se existe no Mercado Livre (tanto meli_order_id quanto pack_id)
    const { data: mlOrder } = await supabaseAdmin
      .from('mercado_livre_orders')
      .select('order_id')
      .eq('order_id', parseInt(marketplaceOrderId))
      .maybeSingle();

    if (!mlOrder) {
      console.log(`  ✗ Pedido ${marketplaceOrderId}: não encontrado no Mercado Livre`);
      result.total_not_found++;
      continue;
    }

    // Criar vínculo
    const { error: linkError } = await supabaseAdmin
      .from('marketplace_order_links')
      .insert({
        marketplace: 'mercado_livre',
        marketplace_order_id: marketplaceOrderId,
        tiny_order_id: tinyOrder.id,
        linked_by: 'auto-link-from-nov-script',
        confidence_score: 1.0,
        notes: `Vinculação automática desde 01/11/2025`,
      });

    if (linkError) {
      console.error(`  ✗ Erro ao vincular ${marketplaceOrderId}:`, linkError.message);
      result.errors.push(`${marketplaceOrderId}: ${linkError.message}`);
      continue;
    }

    console.log(`  ✓ Vinculado: Mercado Livre ${marketplaceOrderId} → Tiny #${tinyOrder.numero_pedido} (ID: ${tinyOrder.id})`);
    result.total_linked++;
  }

  return result;
}

async function main() {
  console.log('====================================');
  console.log('AUTO-LINKING DESDE 01/11/2025');
  console.log('====================================');

  // Vincular Shopee
  const shopeeResult = await linkShopeeOrders();

  // Vincular Magalu
  const magaluResult = await linkMagaluOrders();

  // Vincular Mercado Livre
  const mlResult = await linkMercadoLivreOrders();

  // Resumo final
  console.log('\n====================================');
  console.log('RESUMO FINAL');
  console.log('====================================\n');

  const total = {
    processed: shopeeResult.total_processed + magaluResult.total_processed + mlResult.total_processed,
    linked: shopeeResult.total_linked + magaluResult.total_linked + mlResult.total_linked,
    already_linked: shopeeResult.total_already_linked + magaluResult.total_already_linked + mlResult.total_already_linked,
    not_found: shopeeResult.total_not_found + magaluResult.total_not_found + mlResult.total_not_found,
    errors: shopeeResult.errors.length + magaluResult.errors.length + mlResult.errors.length,
  };

  console.log('SHOPEE:');
  console.log(`  Processados: ${shopeeResult.total_processed}`);
  console.log(`  Vinculados: ${shopeeResult.total_linked}`);
  console.log(`  Já vinculados: ${shopeeResult.total_already_linked}`);
  console.log(`  Não encontrados: ${shopeeResult.total_not_found}`);
  console.log(`  Erros: ${shopeeResult.errors.length}\n`);

  console.log('MAGALU:');
  console.log(`  Processados: ${magaluResult.total_processed}`);
  console.log(`  Vinculados: ${magaluResult.total_linked}`);
  console.log(`  Já vinculados: ${magaluResult.total_already_linked}`);
  console.log(`  Não encontrados: ${magaluResult.total_not_found}`);
  console.log(`  Erros: ${magaluResult.errors.length}\n`);

  console.log('MERCADO LIVRE:');
  console.log(`  Processados: ${mlResult.total_processed}`);
  console.log(`  Vinculados: ${mlResult.total_linked}`);
  console.log(`  Já vinculados: ${mlResult.total_already_linked}`);
  console.log(`  Não encontrados: ${mlResult.total_not_found}`);
  console.log(`  Erros: ${mlResult.errors.length}\n`);

  console.log('TOTAL:');
  console.log(`  Processados: ${total.processed}`);
  console.log(`  Vinculados: ${total.linked}`);
  console.log(`  Já vinculados: ${total.already_linked}`);
  console.log(`  Não encontrados: ${total.not_found}`);
  console.log(`  Erros: ${total.errors}`);
}

main().catch(console.error);
