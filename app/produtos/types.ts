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

export type ProdutoSeriePreset = "30d" | "month" | "year";

export type ProdutoSeriePresetOption = {
  value: ProdutoSeriePreset;
  label: string;
};

export type ProdutoTrendDatum = {
  label: string;
  receita: number;
  quantidade: number;
};

export type ProdutoDesempenhoPoint = {
  data: string;
  quantidade: number;
  receita: number;
};

export type ProdutoDesempenhoMeta = {
  aggregatedIds: number[];
  aggregatedCodes: string[];
  matchedIds: number[];
  matchedCodes: string[];
  consolidatedChildren: number;
  childSource: "variacoes" | "kit" | null;
  usedCodigoFallback: boolean;
};

export type ProdutoDesempenhoResponse = {
  produtoId: number;
  preset: ProdutoSeriePreset;
  startDate: string;
  endDate: string;
  totalQuantidade: number;
  totalReceita: number;
  serie: ProdutoDesempenhoPoint[];
  melhorDia: ProdutoDesempenhoPoint | null;
  meta?: ProdutoDesempenhoMeta;
};
