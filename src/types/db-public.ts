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
