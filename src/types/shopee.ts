// Tipos alinhados com a Shopee Open Platform v2 (subset usado pelo projeto).
// Não é espelho completo do schema oficial, apenas os campos necessários para nossa sincronização.

export type ShopeeOrderStatus =
  | 'UNPAID'
  | 'READY_TO_SHIP'
  | 'PROCESSED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'TO_RETURN'
  | 'IN_CANCEL';

export interface ShopeeOrderItem {
  item_id: number;
  item_name: string;
  model_id: number;
  model_name: string;
  item_sku: string | null;
  model_sku: string | null;
  variation_original_price: string;
  variation_discounted_price: string;
  is_wholesale: boolean;
}

export interface ShopeeRecipientAddress {
  name: string;
  phone: string;
  full_address: string;
}

export interface ShopeeOrder {
  order_sn: string;
  order_status: ShopeeOrderStatus;
  create_time: number;
  update_time: number;
  total_amount: string;
  currency: string;
  cod: boolean;
  order_items: ShopeeOrderItem[];
  shipping_carrier?: string | null;
  recipient_address?: ShopeeRecipientAddress;
}

export interface ShopeeOrderListResponse {
  orders: ShopeeOrder[];
  has_more: boolean;
  next_cursor?: string;
}

// Resposta crua da API v2 (usa response.order_list)
export interface ShopeeOrderListApiResponse {
  response: {
    order_list: ShopeeOrder[];
    more: boolean;
    next_cursor?: string;
  };
  error?: string;
  message?: string;
}
