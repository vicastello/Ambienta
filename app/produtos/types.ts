import type { Embalagem } from "@/src/types/embalagens";

export type ProdutoEmbalagem = {
  embalagem_id: string;
  quantidade: number;
  embalagem: Embalagem;
};

export type Produto = {
  id: number;
  id_produto_tiny: number;
  codigo: string | null;
  nome: string;
  unidade: string | null;
  preco: number | null;
  preco_promocional: number | null;
  saldo: number | null;
  reservado: number | null;
  disponivel: number | null;
  disponivel_total?: number | null;
  situacao: string;
  tipo: string;
  fornecedor_nome: string | null;
  gtin: string | null;
  imagem_url: string | null;
  embalagens?: ProdutoEmbalagem[];
};
