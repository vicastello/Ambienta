
export type Sugestao = {
    id_produto_tiny: number;
    codigo: string | null;
    nome: string | null;
    gtin: string | null;
    imagem_url: string | null;
    fornecedor_codigo: string | null;
    fornecedor_nome: string | null;
    embalagem_qtd: number;
    saldo: number;
    reservado: number;
    disponivel: number;
    consumo_periodo: number;
    consumo_mensal: number;
    sugestao_base: number;
    sugestao_ajustada: number;
    alerta_embalagem: boolean;
    observacao_compras: string | null;
    preco_custo: number;
    lead_time_dias?: number | null;
    categoria?: string | null;
    originalIndex?: number;
};

export type EstoqueSnapshot = {
    saldo: number;
    reservado: number;
    disponivel: number;
    updatedAt?: string | null;
    source?: string | null;
};

export type SortDirection = 'asc' | 'desc';
export type SortKey =
    | 'nome'
    | 'codigo'
    | 'fornecedor_codigo'
    | 'embalagem_qtd'
    | 'disponivel'
    | 'diasAteRuptura'
    | 'consumo_periodo'
    | 'consumo_mensal'
    | 'sugestao_base'
    | 'sugestao_ajustada';

export type AutoSavePayload = {
    fornecedor_codigo?: string | null;
    embalagem_qtd?: number | null;
    observacao_compras?: string | null;
    lead_time_dias?: number | null;
};

export type ProdutoDerivado = Sugestao & {
    originalIndex: number;
    consumoDiario: number;
    pontoMinimo: number;
    coberturaAtualDias: number | null;
    precisaRepor: boolean;
    quantidadeNecessaria: number;
    statusCobertura: string;
    sugestao_calculada: number;
    total_valor_calculado: number;
    diasAteRuptura: number | null;
    curvaABC: 'A' | 'B' | 'C';
    isDefaultLeadTime: boolean;
};

export type FornecedorOption = {
    value: string;
    label: string;
};

export type ManualEntry = {
    nome: string;
    fornecedor_codigo: string;
    quantidade: string;
    observacao: string;
};

export type ManualItem = {
    id: number;
    nome: string;
    fornecedor_codigo: string;
    quantidade: number;
    observacao: string;
};
