import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Types for marketplace_order_links table
export interface MarketplaceOrderLink {
  id: number;
  marketplace: 'magalu' | 'shopee' | 'mercado_livre';
  marketplace_order_id: string;
  tiny_order_id: number;
  linked_at: string;
  linked_by: string | null;
  confidence_score: number | null;
  notes: string | null;
}

export interface MarketplaceOrderLinkInsert {
  marketplace: 'magalu' | 'shopee' | 'mercado_livre';
  marketplace_order_id: string;
  tiny_order_id: number;
  linked_by?: string;
  confidence_score?: number;
  notes?: string;
}

// Types for marketplace_sku_mapping table
export interface MarketplaceSkuMapping {
  id: number;
  marketplace: 'magalu' | 'shopee' | 'mercado_livre';
  marketplace_sku: string;
  marketplace_product_name: string | null;
  tiny_product_id: number;
  mapping_type: 'manual' | 'auto' | 'verified';
  created_at: string;
  updated_at: string;
  created_by: string | null;
  notes: string | null;
}

export interface MarketplaceSkuMappingInsert {
  marketplace: 'magalu' | 'shopee' | 'mercado_livre';
  marketplace_sku: string;
  marketplace_product_name?: string;
  tiny_product_id: number;
  mapping_type?: 'manual' | 'auto' | 'verified';
  created_by?: string;
  notes?: string;
}

// Types for view vw_marketplace_orders_linked
export interface LinkedOrderView {
  link_id: number;
  marketplace: string;
  marketplace_order_id: string;
  tiny_order_id: number;
  linked_at: string;
  linked_by: string | null;
  confidence_score: number | null;
  tiny_numero_pedido: number;
  tiny_situacao: number;
  tiny_data_criacao: string;
  tiny_valor_total: number;
  tiny_canal: string;
  tiny_cliente_nome: string;
  marketplace_order_display_id: string;
  marketplace_order_status: string;
  marketplace_total_amount: number;
  marketplace_order_date: string;
}

// Types for view vw_marketplace_sku_mappings
export interface SkuMappingView {
  id: number;
  marketplace: string;
  marketplace_sku: string;
  marketplace_product_name: string | null;
  tiny_product_id: number;
  mapping_type: string;
  created_at: string;
  updated_at: string;
  tiny_codigo: string;
  tiny_nome: string;
  tiny_tipo: string;
  tiny_situacao: string;
  tiny_preco: number;
  tiny_saldo: number;
  tiny_gtin: string;
}

/**
 * Create a link between a marketplace order and a Tiny order
 */
export async function createOrderLink(link: MarketplaceOrderLinkInsert): Promise<MarketplaceOrderLink> {
  const { data, error } = await supabaseAdmin
    .from('marketplace_order_links')
    .insert(link as any)
    .select()
    .single();

  if (error) {
    console.error('[orderLinkingRepository] createOrderLink error', error);
    throw error;
  }

  return data as MarketplaceOrderLink;
}

/**
 * Get order link by marketplace order ID
 */
export async function getOrderLinkByMarketplaceOrder(
  marketplace: 'magalu' | 'shopee' | 'mercado_livre',
  marketplaceOrderId: string
): Promise<MarketplaceOrderLink | null> {
  const { data, error } = await supabaseAdmin
    .from('marketplace_order_links')
    .select('*')
    .eq('marketplace', marketplace)
    .eq('marketplace_order_id', marketplaceOrderId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('[orderLinkingRepository] getOrderLinkByMarketplaceOrder error', error);
    throw error;
  }

  return data as MarketplaceOrderLink;
}

/**
 * Get all order links for a Tiny order
 */
export async function getOrderLinksByTinyOrder(tinyOrderId: number): Promise<MarketplaceOrderLink[]> {
  const { data, error } = await supabaseAdmin
    .from('marketplace_order_links')
    .select('*')
    .eq('tiny_order_id', tinyOrderId);

  if (error) {
    console.error('[orderLinkingRepository] getOrderLinksByTinyOrder error', error);
    throw error;
  }

  return (data ?? []) as MarketplaceOrderLink[];
}

/**
 * Delete an order link
 */
export async function deleteOrderLink(linkId: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('marketplace_order_links')
    .delete()
    .eq('id', linkId);

  if (error) {
    console.error('[orderLinkingRepository] deleteOrderLink error', error);
    throw error;
  }
}

/**
 * Get all linked orders using the view (with full details)
 */
export async function getLinkedOrdersView(params?: {
  marketplace?: 'magalu' | 'shopee' | 'mercado_livre';
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}): Promise<LinkedOrderView[]> {
  const { marketplace, dateFrom, dateTo, limit = 100, offset = 0 } = params || {};

  let query = supabaseAdmin
    .from('vw_marketplace_orders_linked')
    .select('*');

  if (marketplace) {
    query = query.eq('marketplace', marketplace);
  }

  if (dateFrom) {
    query = query.gte('marketplace_order_date', dateFrom);
  }

  if (dateTo) {
    query = query.lte('marketplace_order_date', dateTo);
  }

  query = query
    .order('marketplace_order_date', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error } = await query;

  if (error) {
    console.error('[orderLinkingRepository] getLinkedOrdersView error', error);
    throw error;
  }

  return (data ?? []) as LinkedOrderView[];
}

/**
 * Create or update a SKU mapping
 */
export async function upsertSkuMapping(mapping: MarketplaceSkuMappingInsert): Promise<MarketplaceSkuMapping> {
  const { data, error } = await supabaseAdmin
    .from('marketplace_sku_mapping')
    .upsert(mapping as any, { onConflict: 'marketplace,marketplace_sku' })
    .select()
    .single();

  if (error) {
    console.error('[orderLinkingRepository] upsertSkuMapping error', error);
    throw error;
  }

  return data as MarketplaceSkuMapping;
}

/**
 * Get SKU mapping by marketplace SKU
 */
export async function getSkuMapping(
  marketplace: 'magalu' | 'shopee' | 'mercado_livre',
  marketplaceSku: string
): Promise<MarketplaceSkuMapping | null> {
  const { data, error } = await supabaseAdmin
    .from('marketplace_sku_mapping')
    .select('*')
    .eq('marketplace', marketplace)
    .eq('marketplace_sku', marketplaceSku)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('[orderLinkingRepository] getSkuMapping error', error);
    throw error;
  }

  return data as MarketplaceSkuMapping;
}

/**
 * Get all SKU mappings for a marketplace
 */
export async function getSkuMappingsByMarketplace(
  marketplace: 'magalu' | 'shopee' | 'mercado_livre',
  limit = 1000,
  offset = 0
): Promise<SkuMappingView[]> {
  const { data, error } = await supabaseAdmin
    .from('vw_marketplace_sku_mappings')
    .select('*')
    .eq('marketplace', marketplace)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[orderLinkingRepository] getSkuMappingsByMarketplace error', error);
    throw error;
  }

  return (data ?? []) as SkuMappingView[];
}

/**
 * Get all SKU mappings for a Tiny product
 */
export async function getSkuMappingsByTinyProduct(tinyProductId: number): Promise<SkuMappingView[]> {
  const { data, error } = await supabaseAdmin
    .from('vw_marketplace_sku_mappings')
    .select('*')
    .eq('tiny_product_id', tinyProductId);

  if (error) {
    console.error('[orderLinkingRepository] getSkuMappingsByTinyProduct error', error);
    throw error;
  }

  return (data ?? []) as SkuMappingView[];
}

/**
 * Delete a SKU mapping
 */
export async function deleteSkuMapping(mappingId: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from('marketplace_sku_mapping')
    .delete()
    .eq('id', mappingId);

  if (error) {
    console.error('[orderLinkingRepository] deleteSkuMapping error', error);
    throw error;
  }
}

/**
 * Get unlinked marketplace orders (orders that don't have a link to Tiny)
 */
export async function getUnlinkedMarketplaceOrders(params: {
  marketplace: 'magalu' | 'shopee' | 'mercado_livre';
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}): Promise<any[]> {
  const { marketplace, dateFrom, dateTo, limit = 100, offset = 0 } = params;

  // Query depends on marketplace
  let query;

  if (marketplace === 'magalu') {
    query = supabaseAdmin
      .from('magalu_orders')
      .select(`
        *,
        link:marketplace_order_links!left(id)
      `)
      .is('marketplace_order_links.id', null);

    if (dateFrom) query = query.gte('purchased_date', dateFrom);
    if (dateTo) query = query.lte('purchased_date', dateTo);
    query = query.order('purchased_date', { ascending: false });
  } else if (marketplace === 'shopee') {
    query = supabaseAdmin
      .from('shopee_orders')
      .select(`
        *,
        link:marketplace_order_links!left(id)
      `)
      .is('marketplace_order_links.id', null);

    if (dateFrom) query = query.gte('create_time', dateFrom);
    if (dateTo) query = query.lte('create_time', dateTo);
    query = query.order('create_time', { ascending: false });
  } else if (marketplace === 'mercado_livre') {
    query = supabaseAdmin
      .from('meli_orders')
      .select(`
        *,
        link:marketplace_order_links!left(id)
      `)
      .is('marketplace_order_links.id', null);

    if (dateFrom) query = query.gte('date_created', dateFrom);
    if (dateTo) query = query.lte('date_created', dateTo);
    query = query.order('date_created', { ascending: false });
  }

  if (query) {
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      console.error('[orderLinkingRepository] getUnlinkedMarketplaceOrders error', error);
      throw error;
    }

    return data ?? [];
  }

  return [];
}

/**
 * Batch create SKU mappings
 */
export async function batchUpsertSkuMappings(mappings: MarketplaceSkuMappingInsert[]): Promise<void> {
  if (!mappings.length) return;

  const { error } = await supabaseAdmin
    .from('marketplace_sku_mapping')
    .upsert(mappings as any[], { onConflict: 'marketplace,marketplace_sku' });

  if (error) {
    console.error('[orderLinkingRepository] batchUpsertSkuMappings error', error);
    throw error;
  }
}
