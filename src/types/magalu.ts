// Tipos simplificados para pedidos do Magalu Marketplace (IntegraCommerce).
// Subset necessário para o dashboard; não espelha todo o schema oficial.

export interface MagaluOrderProduct {
  IdSku: string;
  Name?: string | null;
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
