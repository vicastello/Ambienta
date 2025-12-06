// Tipos simplificados para pedidos do Mercado Livre (orders/search).
// Subset necessário para o dashboard; não espelha todo o schema oficial.

export interface MeliOrderItem {
  item: {
    id: string;
    title: string;
    category_id?: string | null;
    variation_id?: string | null;
    seller_custom_field?: string | null;
    seller_sku?: string | null;
    thumbnail?: string | null;
    secure_thumbnail?: string | null;
    pictures?: Array<{ url?: string | null; secure_url?: string | null }>;
    variation_attributes?: Array<{
      id: string;
      name: string;
      value_id?: string | null;
      value_name?: string | null;
    }>;
    attributes?: Array<{
      id: string;
      name: string;
      value_id?: string | null;
      value_name?: string | null;
    }>;
  };
  quantity: number;
  unit_price: number;
  currency_id: string;
}

export interface MeliOrder {
  id: string | number;
  status: string;
  date_created: string;
  date_closed?: string | null;
  date_last_updated?: string | null;
  total_amount: number;
  total_amount_with_shipping?: number | null;
  total_shipping?: number | null;
  currency_id: string;
  tags?: string[] | null;
  buyer: {
    id: number;
    nickname: string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  };
  seller?: {
    id?: number;
  };
  order_items: MeliOrderItem[];
  shipping?: {
    id?: number | null;
    shipping_mode?: string | null;
    receiver_address?: {
      city?: { id?: string | null; name?: string | null };
      state?: { id?: string | null; name?: string | null };
    };
  };
}

export interface MeliOrdersSearchResponse {
  query: string;
  results: MeliOrder[];
  paging: {
    total: number;
    offset: number;
    limit: number;
  };
}

export function extractMeliSku(orderItem: MeliOrderItem): string | null {
  const item = orderItem.item;
  if (item.seller_sku) return item.seller_sku;

  const fromVarAttr = item.variation_attributes?.find((a) => a.id === 'SELLER_SKU')?.value_name;
  if (fromVarAttr) return fromVarAttr;

  const fromAttr = item.attributes?.find((a) => a.id === 'SELLER_SKU')?.value_name;
  if (fromAttr) return fromAttr;

  return item.seller_custom_field ?? null;
}
