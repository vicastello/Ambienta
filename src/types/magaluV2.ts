// Tipos para a Nova API Magalu OAuth 2.0
// Base: https://api.magalu.com

// ============ TOKENS ============

export interface MagaluTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  created_at?: number;
}

// ============ PEDIDOS ============

export interface MagaluOrderSku {
  code: string;
  name: string;
  image?: string;
}

export interface MagaluOrderItemV2 {
  code: string;
  sku: MagaluOrderSku;
  quantity: number;
  unit_price: {
    total: number;
    freight: number;
    discount: number;
  };
}

export interface MagaluRecipient {
  name: string;
  phone?: string;
  document_number?: string;
}

export interface MagaluAddress {
  city: string;
  state: string;
  neighborhood?: string;
  street?: string;
  number?: string;
  complement?: string;
  zip_code?: string;
  country?: string;
}

export interface MagaluDeliveryV2 {
  code: string;
  type: string; // 'conventional', 'express', etc.
  status?: string;
  delivered_carrier_date?: string;
  estimate_delivery_date?: string;
  recipient: MagaluRecipient;
  address: MagaluAddress;
  items: MagaluOrderItemV2[];
  tracking?: {
    code?: string;
    url?: string;
  };
}

export interface MagaluPayment {
  method: string;
  installments: number;
  value: number;
}

export interface MagaluCustomer {
  document_number?: string;
  name: string;
  email?: string;
  phone?: string;
}

export interface MagaluHandlingTime {
  limit_date: string;
}

export interface MagaluOrderTotal {
  order: number;
  freight: number;
  discount: number;
}

export interface MagaluChannel {
  id: string;
  name?: string;
}

export interface MagaluOrderV2 {
  code: string;
  channel: MagaluChannel;
  placed_at: string;
  updated_at: string;
  approved_at?: string;
  status: string;
  sub_status?: string;
  customer: MagaluCustomer;
  handling_time?: MagaluHandlingTime;
  total: MagaluOrderTotal;
  deliveries: MagaluDeliveryV2[];
  payments?: MagaluPayment[];
}

export interface MagaluPaginationMeta {
  page: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface MagaluOrderListResponseV2 {
  data: MagaluOrderV2[];
  meta: MagaluPaginationMeta;
}

// ============ STATUS DE PEDIDOS ============

export type MagaluOrderStatus =
  | 'new'           // Novo pedido
  | 'approved'      // Aprovado para processamento
  | 'invoiced'      // Nota fiscal emitida
  | 'shipped'       // Enviado
  | 'delivered'     // Entregue
  | 'canceled'      // Cancelado
  | 'unavailable';  // Indisponível

// ============ DB TYPES ============

export interface MagaluOrderDb {
  id: number;
  id_order: string;
  id_order_marketplace: string | null;
  order_status: string | null;
  marketplace_name: string | null;
  store_name: string | null;
  tenant_id: string | null;
  
  // Datas
  inserted_date: string | null;
  purchased_date: string | null;
  approved_date: string | null;
  updated_date: string | null;
  estimated_delivery_date: string | null;
  handling_time_limit: string | null;
  
  // Valores
  total_amount: number | null;
  total_freight: number | null;
  total_discount: number | null;
  
  // Cliente
  receiver_name: string | null;
  customer_mail: string | null;
  delivery_address_city: string | null;
  delivery_address_state: string | null;
  delivery_address_full: string | null;
  delivery_mode: string | null;
  
  // Metadata
  raw_payload: MagaluOrderV2 | null;
  synced_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface MagaluOrderItemDb {
  id: number;
  id_order: string;
  id_sku: string | null;
  id_order_package: number | null;
  product_name: string | null;
  quantity: number | null;
  price: number | null;
  freight: number | null;
  discount: number | null;
  raw_payload: MagaluOrderItemV2 | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface MagaluTokensDb {
  id: number;
  access_token: string;
  refresh_token: string;
  token_type: string | null;
  expires_in: number | null;
  expires_at: string | null;
  scope: string | null;
  tenant_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface MagaluSyncCursorDb {
  id: number;
  last_sync_at: string | null;
  sync_status: string | null;
  total_orders_synced: number | null;
  error_message: string | null;
  updated_at: string | null;
}

// ============ EXPORTS LEGADOS ============
// Manter compatibilidade com código existente

export interface MagaluOrderProduct {
  IdSku: string;
  Quantity: number;
  Price: string;
  Freight?: string | null;
  Discount?: string | null;
  IdOrderPackage?: number | null;
}

export interface MagaluOrderPayment {
  Name: string;
  Installments: number;
  Amount: number;
}

export interface MagaluOrder {
  OrderStatus: string;
  IdOrder: string;
  EstimatedDeliveryDate?: string | null;
  TotalAmount: string;
  TotalFreight?: string | null;
  TotalDiscount?: string | null;
  ApprovedDate?: string | null;
  ReceiverName: string;
  CustomerMail?: string | null;
  IdOrderMarketplace: string;
  InsertedDate?: string;
  PurchasedDate?: string;
  UpdatedDate?: string;
  MarketplaceName?: string;
  StoreName?: string;
  DeliveryAddressCity?: string;
  DeliveryAddressState?: string;
  Products: MagaluOrderProduct[];
  Payments: MagaluOrderPayment[];
}

export interface MagaluOrdersResponse {
  Page: number;
  PerPage: number;
  Total: number;
  Orders: MagaluOrder[];
}
