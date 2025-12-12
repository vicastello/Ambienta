/**
 * Tipos para gerenciamento de embalagens
 */

export interface Embalagem {
  id: string;
  codigo: string;
  nome: string;
  descricao?: string | null;
  altura: number;
  largura: number;
  comprimento: number;
  preco_unitario: number;
  estoque_atual: number;
  created_at: string;
  updated_at: string;
}

export interface EmbalagemInput {
  codigo: string;
  nome: string;
  descricao?: string;
  altura: number;
  largura: number;
  comprimento: number;
  preco_unitario: number;
  estoque_atual: number;
}

export interface EmbalagemUpdate {
  codigo?: string;
  nome?: string;
  descricao?: string;
  altura?: number;
  largura?: number;
  comprimento?: number;
  preco_unitario?: number;
  estoque_atual?: number;
}

export interface ProdutoEmbalagem {
  id: string;
  produto_id: number;
  embalagem_id: string;
  quantidade: number;
  created_at: string;
  updated_at: string;
}

export interface ProdutoEmbalagemInput {
  produto_id: number;
  embalagem_id: string;
  quantidade: number;
}

export interface EmbalagemWithProdutos extends Embalagem {
  produtos?: Array<{
    produto_id: number;
    quantidade: number;
    produto_nome?: string;
  }>;
}
