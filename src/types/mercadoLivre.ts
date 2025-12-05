// Tipos simplificados para pedidos do Mercado Livre (orders/search).
// Subset necessário para o dashboard; não espelha todo o schema oficial.

export interface MeliOrderItem {
  item: {
    id: string;
    title: string;
    category_id?: string | null;
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
  total_amount: number;
  currency_id: string;
  buyer: {
    id: number;
    nickname: string;
  };
  order_items: MeliOrderItem[];
  shipping?: {
    id?: number | null;
    shipping_mode?: string | null;
    receiver_address?: {
      city?: { name?: string };
      state?: { id?: string; name?: string };
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
