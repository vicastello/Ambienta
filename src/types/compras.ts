export type SavedOrderProduct = {
  id_produto_tiny: number;
  nome: string | null;
  codigo: string | null;
  fornecedor_nome: string | null;
  fornecedor_codigo: string | null;
  gtin: string | null;
  quantidade: number;
  observacao: string | null;
};

export type SavedOrderManualItem = {
  id: number;
  nome: string;
  fornecedor_codigo: string;
  quantidade: number;
  observacao: string;
};

export type SavedOrder = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  periodDays: number;
  targetDays: number;
  produtos: SavedOrderProduct[];
  manualItems: SavedOrderManualItem[];
};
