export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type GenericSupabaseSchema = {
  Tables: Record<
    string,
    {
      Row: Record<string, unknown>;
      Insert: Record<string, unknown>;
      Update: Record<string, unknown>;
      Relationships: Array<{
        foreignKeyName: string;
        columns: string[];
        referencedRelation: string;
        referencedColumns: string[];
      }>;
    }
  >;
  Views: Record<string, unknown>;
  Functions: Record<
    string,
    {
      Args: Record<string, unknown>;
      Returns: unknown;
    }
  >;
};

/* ============================================================================
 * ROW TYPES (1:1 com as tabelas do Postgres)
 * ========================================================================== */

export interface SyncSettingsRow {
  id: number;
  auto_sync_enabled: boolean;
  auto_sync_window_days: number;
  cron_dias_recent_orders: number | null;
  cron_produtos_limit: number | null;
  cron_enrich_enabled: boolean | null;
  cron_produtos_enabled: boolean | null;
  cron_produtos_enrich_estoque: boolean | null;
  created_at: string | null; // timestamptz
  updated_at: string | null; // timestamptz
  settings?: Json | null;
}

export interface SyncJobsRow {
  id: string; // uuid
  started_at: string; // timestamptz
  finished_at: string | null;
  status: string;
  error: string | null;
  params: Json | null; // jsonb
  total_requests: number | null;
  total_orders: number | null;
}

export interface SyncLogsRow {
  id: number; // bigserial
  job_id: string | null; // uuid FK -> sync_jobs.id
  created_at: string; // timestamptz
  level: string;
  message: string;
  meta: Json | null; // jsonb
}

export interface TinyOrdersRow {
  // Novos campos de negócio do Tiny
  tiny_data_prevista?: string | null;      // date
  tiny_data_faturamento?: string | null;   // timestamptz
  tiny_data_atualizacao?: string | null;   // timestamptz
  valor_total_pedido?: number | null;
  valor_total_produtos?: number | null;
  valor_desconto?: number | null;
  valor_outras_despesas?: number | null;
  transportador_nome?: string | null;
  forma_pagamento?: string | null;
  id: number; // bigint
  tiny_id: number;
  numero_pedido: number | null;
  situacao: number | null;
  data_criacao: string | null; // date
  // data_faturamento removido: usar tiny_data_faturamento
  valor: number | null; // numeric
  canal: string | null;
  cliente_nome: string | null;
  raw: Json | null; // jsonb
  raw_payload: Json | null;
  inserted_at: string | null; // timestamptz
  updated_at: string | null; // timestamptz
  last_sync_check: string | null; // timestamptz
  data_hash: string | null; // varchar(32)
  is_enriched: boolean | null;
  valor_frete: number | null; // numeric
  cidade: string | null;
  uf: string | null;
  cidade_lat: number | null; // double precision
  cidade_lon: number | null; // double precision
}

export interface TinyPedidoItensRow {
  id: number; // bigint
  id_pedido: number; // FK -> tiny_orders.id
  id_produto_tiny: number | null; // FK -> tiny_produtos.id_produto_tiny
  codigo_produto: string | null;
  nome_produto: string;
  quantidade: number; // numeric
  valor_unitario: number; // numeric
  valor_total: number; // numeric
  info_adicional: string | null;
  unidade: string | null;
  raw_payload: Json | null;
  created_at: string | null; // timestamptz
}

export interface TinyProdutosRow {
  id: number; // bigint
  id_produto_tiny: number;
  codigo: string | null;
  nome: string;
  unidade: string | null;
  preco: number | null;
  preco_promocional: number | null;
  saldo: number | null;
  reservado: number | null;
  disponivel: number | null;
  situacao: string | null;
  tipo: string | null;
  gtin: string | null;
  descricao: string | null;
  ncm: string | null;
  origem: string | null;
  peso_liquido: number | null;
  peso_bruto: number | null;
  data_criacao_tiny: string | null; // timestamptz
  data_atualizacao_tiny: string | null; // timestamptz
  created_at: string | null; // timestamptz
  updated_at: string | null; // timestamptz
  imagem_url: string | null;
  fornecedor_codigo: string | null;
  fornecedor_nome: string | null;
  embalagem_qtd: number | null;
  observacao_compras: string | null;
  marca: string | null;
  categoria: string | null;
  raw_payload: Json | null;
}

export interface ComprasSavedOrderRow {
  id: string; // uuid
  name: string;
  period_days: number;
  target_days: number;
  produtos: Json;
  manual_items: Json;
  item_count: number;
  created_at: string; // timestamptz
  updated_at: string; // timestamptz
}

export interface TinyTokensRow {
  id: number;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null; // epoch ms
  scope: string | null;
  token_type: string | null;
  created_at: string | null; // timestamptz
  updated_at: string | null; // timestamptz
}

export interface ProdutosSyncCursorRow {
  cursor_key: string;
  updated_since: string | null; // timestamptz
  latest_data_alteracao: string | null; // timestamptz
  updated_at: string; // timestamptz
}

export interface DrePeriodsRow {
  id: string; // uuid
  year: number;
  month: number;
  label: string;
  status: string;
  target_net_margin: number | null;
  reserve_percent: number | null;
  created_at: string | null; // timestamptz
  updated_at: string | null; // timestamptz
}

export interface DreCategoriesRow {
  id: string; // uuid
  code: string;
  name: string;
  group_type: string;
  sign: string;
  is_default: boolean;
  is_editable: boolean;
  order_index: number;
  channel: string | null;
  parent_code: string | null;
  created_at: string | null; // timestamptz
  updated_at: string | null; // timestamptz
}

export interface DreValuesRow {
  id: string; // uuid
  period_id: string;
  category_id: string;
  amount_auto: number | null;
  amount_manual: number | null;
  final_amount: number;
  auto_source: string | null;
  notes: string | null;
  created_at: string | null; // timestamptz
  updated_at: string | null; // timestamptz
}

export interface MeliOrdersRow {
  meli_order_id: number;
  seller_id: number;
  status: string;
  date_created: string;
  last_updated: string;
  currency_id: string;
  total_amount: string;
  total_amount_with_shipping: string | null;
  shipping_cost: string | null;
  buyer_id: number | null;
  buyer_nickname: string | null;
  buyer_full_name: string | null;
  buyer_email: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  tags: string[] | null;
  raw_payload: Json;
  created_at: string;
  updated_at: string;
}

export type MeliOrdersInsert = {
  meli_order_id: number;
  seller_id: number;
  status: string;
  date_created: string;
  last_updated: string;
  currency_id: string;
  total_amount: string;
  total_amount_with_shipping?: string | null;
  shipping_cost?: string | null;
  buyer_id?: number | null;
  buyer_nickname?: string | null;
  buyer_full_name?: string | null;
  buyer_email?: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
  tags?: string[] | null;
  raw_payload: Json;
};

export type MeliOrdersUpdate = Partial<MeliOrdersInsert>;

export interface MeliOrderItemsRow {
  id: number;
  meli_order_id: number;
  item_id: string;
  title: string;
  sku: string | null;
  quantity: number;
  unit_price: string;
  currency_id: string;
  category_id: string | null;
  variation_id: string | null;
  item_thumbnail_url: string | null;
  raw_payload: Json;
  created_at: string;
  updated_at: string;
}

export type MeliOrderItemsInsert = {
  meli_order_id: number;
  item_id: string;
  title: string;
  sku?: string | null;
  quantity: number;
  unit_price: string;
  currency_id: string;
  category_id?: string | null;
  variation_id?: string | null;
  item_thumbnail_url?: string | null;
  raw_payload: Json;
};

export type MeliOrderItemsUpdate = Partial<MeliOrderItemsInsert>;

/* ============================================================================
 * INSERT / UPDATE TYPES
 * ========================================================================== */

export type SyncSettingsInsert = Omit<
  SyncSettingsRow,
  "id" | "created_at" | "updated_at"
> & {
  id?: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SyncSettingsUpdate = Partial<SyncSettingsRow>;

export type SyncJobsInsert = Omit<
  SyncJobsRow,
  "started_at" | "finished_at" | "total_requests" | "total_orders"
> & {
  started_at?: string;
  finished_at?: string | null;
  total_requests?: number | null;
  total_orders?: number | null;
};

export type SyncJobsUpdate = Partial<SyncJobsRow>;

export type SyncLogsInsert = Omit<SyncLogsRow, "id" | "created_at"> & {
  id?: number;
  created_at?: string;
};

export type SyncLogsUpdate = Partial<SyncLogsRow>;

export interface TinyApiUsageRow {
  id: number;
  created_at: string;
  context: string;
  endpoint: string;
  method: string;
  status_code: number | null;
  success: boolean | null;
  error_code: string | null;
  error_message: string | null;
}

export type TinyApiUsageInsert = {
  id?: number;
  created_at?: string;
  context: string;
  endpoint: string;
  method?: string;
  status_code?: number | null;
  success?: boolean | null;
  error_code?: string | null;
  error_message?: string | null;
};

export type TinyApiUsageUpdate = Partial<TinyApiUsageInsert>;

export type TinyOrdersInsert = Omit<
  TinyOrdersRow,
  | "id"
  | "inserted_at"
  | "updated_at"
  | "last_sync_check"
  | "is_enriched"
  | "data_hash"
> & {
  id?: number;
  inserted_at?: string | null;
  updated_at?: string | null;
  last_sync_check?: string | null;
  is_enriched?: boolean | null;
  data_hash?: string | null;
};

export type TinyOrdersUpdate = Partial<TinyOrdersRow>;

export type TinyPedidoItensInsert = Omit<
  TinyPedidoItensRow,
  "id" | "created_at"
> & {
  id?: number;
  created_at?: string | null;
};

export type TinyPedidoItensUpdate = Partial<TinyPedidoItensRow>;

export type TinyProdutosInsert = Omit<
  TinyProdutosRow,
  "id" | "created_at" | "updated_at"
> & {
  id?: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TinyProdutosUpdate = Partial<TinyProdutosRow>;

export type TinyTokensInsert = Omit<
  TinyTokensRow,
  "id" | "created_at" | "updated_at"
> & {
  id?: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export type TinyTokensUpdate = Partial<TinyTokensRow>;

export type ProdutosSyncCursorInsert = {
  cursor_key: string;
  updated_since?: string | null;
  latest_data_alteracao?: string | null;
  updated_at?: string;
};

export type ProdutosSyncCursorUpdate = Partial<ProdutosSyncCursorRow>;

export type DrePeriodsInsert = Omit<
  DrePeriodsRow,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DrePeriodsUpdate = Partial<DrePeriodsRow>;

export type DreCategoriesInsert = Omit<
  DreCategoriesRow,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DreCategoriesUpdate = Partial<DreCategoriesRow>;

export type DreValuesInsert = Omit<
  DreValuesRow,
  "id" | "final_amount" | "created_at" | "updated_at"
> & {
  id?: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DreValuesUpdate = Partial<Omit<DreValuesRow, "final_amount">>;

export type ComprasSavedOrderInsert = {
  id?: string;
  name: string;
  period_days: number;
  target_days: number;
  produtos?: Json;
  manual_items?: Json;
  created_at?: string;
  updated_at?: string;
};

export type ComprasSavedOrderUpdate = Partial<Omit<ComprasSavedOrderInsert, 'id'>>;

/* ============================================================================
 * DATABASE SHAPE PARA SUPABASE CLIENT
 * ========================================================================== */

export type DatabasePublicSchema = GenericSupabaseSchema & {
  Tables: {
    sync_settings: {
      Row: SyncSettingsRow;
      Insert: SyncSettingsInsert;
      Update: SyncSettingsUpdate;
      Relationships: [];
    };
    sync_jobs: {
      Row: SyncJobsRow;
      Insert: SyncJobsInsert;
      Update: SyncJobsUpdate;
      Relationships: [
        {
          foreignKeyName: "sync_logs_job_id_fkey";
          columns: ["id"];
          referencedRelation: "sync_logs";
          referencedColumns: ["job_id"];
        }
      ];
    };
    sync_logs: {
      Row: SyncLogsRow;
      Insert: SyncLogsInsert;
      Update: SyncLogsUpdate;
      Relationships: [
        {
          foreignKeyName: "sync_logs_job_id_fkey";
          columns: ["job_id"];
          referencedRelation: "sync_jobs";
          referencedColumns: ["id"];
        }
      ];
    };
    tiny_api_usage: {
      Row: TinyApiUsageRow;
      Insert: TinyApiUsageInsert;
      Update: TinyApiUsageUpdate;
      Relationships: [];
    };
    tiny_orders: {
      Row: TinyOrdersRow;
      Insert: TinyOrdersInsert;
      Update: TinyOrdersUpdate;
      Relationships: [
        {
          foreignKeyName: "tiny_pedido_itens_id_pedido_fkey";
          columns: ["id"];
          referencedRelation: "tiny_pedido_itens";
          referencedColumns: ["id_pedido"];
        }
      ];
    };
    tiny_pedido_itens: {
      Row: TinyPedidoItensRow;
      Insert: TinyPedidoItensInsert;
      Update: TinyPedidoItensUpdate;
      Relationships: [
        {
          foreignKeyName: "tiny_pedido_itens_id_pedido_fkey";
          columns: ["id_pedido"];
          referencedRelation: "tiny_orders";
          referencedColumns: ["id"];
        },
        {
          foreignKeyName: "tiny_pedido_itens_id_produto_tiny_fkey";
          columns: ["id_produto_tiny"];
          referencedRelation: "tiny_produtos";
          referencedColumns: ["id_produto_tiny"];
        }
      ];
    };
    tiny_produtos: {
      Row: TinyProdutosRow;
      Insert: TinyProdutosInsert;
      Update: TinyProdutosUpdate;
      Relationships: [
        {
          foreignKeyName: "tiny_pedido_itens_id_produto_tiny_fkey";
          columns: ["id_produto_tiny"];
          referencedRelation: "tiny_pedido_itens";
          referencedColumns: ["id_produto_tiny"];
        }
      ];
    };
    tiny_tokens: {
      Row: TinyTokensRow;
      Insert: TinyTokensInsert;
      Update: TinyTokensUpdate;
      Relationships: [];
    };
    produtos_sync_cursor: {
      Row: ProdutosSyncCursorRow;
      Insert: ProdutosSyncCursorInsert;
      Update: ProdutosSyncCursorUpdate;
      Relationships: [];
    };
    dre_periods: {
      Row: DrePeriodsRow;
      Insert: DrePeriodsInsert;
      Update: DrePeriodsUpdate;
      Relationships: [
        {
          foreignKeyName: "dre_values_period_id_fkey";
          columns: ["id"];
          referencedRelation: "dre_values";
          referencedColumns: ["period_id"];
        }
      ];
    };
    dre_categories: {
      Row: DreCategoriesRow;
      Insert: DreCategoriesInsert;
      Update: DreCategoriesUpdate;
      Relationships: [
        {
          foreignKeyName: "dre_values_category_id_fkey";
          columns: ["id"];
          referencedRelation: "dre_values";
          referencedColumns: ["category_id"];
        }
      ];
    };
    dre_values: {
      Row: DreValuesRow;
      Insert: DreValuesInsert;
      Update: DreValuesUpdate;
      Relationships: [
        {
          foreignKeyName: "dre_values_period_id_fkey";
          columns: ["period_id"];
          referencedRelation: "dre_periods";
          referencedColumns: ["id"];
        },
        {
          foreignKeyName: "dre_values_category_id_fkey";
          columns: ["category_id"];
          referencedRelation: "dre_categories";
          referencedColumns: ["id"];
        }
      ];
    };
    compras_saved_orders: {
      Row: ComprasSavedOrderRow;
      Insert: ComprasSavedOrderInsert;
      Update: ComprasSavedOrderUpdate;
      Relationships: [];
    };
    meli_orders: {
      Row: MeliOrdersRow;
      Insert: MeliOrdersInsert;
      Update: MeliOrdersUpdate;
      Relationships: [
        {
          foreignKeyName: "meli_order_items_meli_order_id_fkey";
          columns: ["meli_order_id"];
          referencedRelation: "meli_order_items";
          referencedColumns: ["meli_order_id"];
        }
      ];
    };
    meli_order_items: {
      Row: MeliOrderItemsRow;
      Insert: MeliOrderItemsInsert;
      Update: MeliOrderItemsUpdate;
      Relationships: [
        {
          foreignKeyName: "meli_order_items_meli_order_id_fkey";
          columns: ["meli_order_id"];
          referencedRelation: "meli_orders";
          referencedColumns: ["meli_order_id"];
        }
      ];
    };
  };
  Views: Record<string, never>;
  Functions: {
    orders_metrics: {
      Args: {
        p_data_inicial?: string | null;
        p_data_final?: string | null;
        p_canais?: string[] | null;
        p_situacoes?: number[] | null;
        p_search?: string | null;
      };
      Returns: {
        total_orders: number;
        total_bruto: number;
        total_frete: number;
        total_liquido: number;
        situacao_counts: Record<string, number>;
      }[];
    };
    set_updated_at: {
      Args: Record<string, never>;
      Returns: unknown;
    };
    update_tiny_produtos_updated_at: {
      Args: Record<string, never>;
      Returns: unknown;
    };
    tiny_orders_auto_sync_itens: {
      Args: Record<string, never>;
      Returns: unknown;
    };
  };
  Enums: Record<string, never>;
  CompositeTypes: Record<string, never>;
};

export type Database = {
  public: DatabasePublicSchema;
};
