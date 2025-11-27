import { TinyPedidoListaItem } from './tinyApi';

function firstNonEmptyString(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length) return trimmed;
  }
  return null;
}

// Converte valor do Tiny (string ou number) em number.
export function parseValorTiny(valor: string | number | null): number {
  if (!valor) return 0;

  // Se já é número, retorna direto
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;

  // Se é string
  const temVirgula = valor.includes(',');
  const temPonto = valor.includes('.');

  let normalizado = valor;

  if (temVirgula) {
    normalizado = valor.replace(/\./g, '').replace(',', '.');
  } else if (temPonto && !temVirgula) {
    normalizado = valor;
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : 0;
}

// Extrai yyyy-mm-dd de uma data válida, senão null
export function extrairDataISO(dataStr: string | null): string | null {
  if (!dataStr) return null;
  const raw = String(dataStr).trim();
  if (!raw) return null;

  // 1) ISO-like: 2025-11-10 or 2025-11-10T12:34:56[Z]
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  // 2) dd/MM/yyyy HH:mm(:ss)? or dd/MM/yyyy
  const m = raw.match(/^([0-3]?\d)\/([0-1]?\d)\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const dd = Number(m[1]);
    const MM = Number(m[2]);
    const yyyy = Number(m[3]);
    const HH = m[4] ? Number(m[4]) : 0;
    const mm = m[5] ? Number(m[5]) : 0;
    const ss = m[6] ? Number(m[6]) : 0;
    const d = new Date(yyyy, MM - 1, dd, HH, mm, ss);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  // 3) Fallback Date parser (último recurso)
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

// Normaliza canal de venda a partir de campos possíveis no Tiny
export function normalizarCanalTiny(raw: string | null | undefined): string {
  if (!raw) return 'Outros';

  const v = raw.toLowerCase().trim();

  if (v.includes('shopee')) return 'Shopee';
  if (v.includes('mercado')) return 'Mercado Livre';
  if (v.includes('magalu') || v.includes('magazine')) return 'Magalu';
  if (v.includes('olist')) return 'Olist';
  if (v.includes('amazon')) return 'Amazon';
  if (v.includes('site') || v.includes('loja') || v.includes('ambienta')) {
    return 'Loja própria';
  }

  return raw;
}

export function deriveCanalFromRaw(raw: any): string {
  const canalBruto = firstNonEmptyString(
    raw?.canal,
    raw?.canalVenda,
    raw?.ecommerce?.canal,
    raw?.ecommerce?.nome,
    raw?.origem
  );
  return normalizarCanalTiny(canalBruto);
}

// Extrai cidade e UF do objeto bruto do Tiny (melhor esforço)
export function extractCidadeUfFromRaw(raw: any): { cidade: string | null; uf: string | null } {
  try {
    const endereco =
      raw?.cliente?.endereco ||
      raw?.cliente?.enderecoEntrega ||
      raw?.enderecoEntrega ||
      raw?.entrega?.endereco ||
      raw?.destinatario?.endereco ||
      raw?.pedido?.cliente?.endereco ||
      null;

    const ufRaw: string | null = (endereco?.uf ?? endereco?.estado ?? endereco?.estadoUF ?? endereco?.ufCliente ?? raw?.cliente?.uf ?? raw?.cliente?.estado ?? null) as any;
    const cidadeRaw: string | null = (endereco?.cidade ?? endereco?.municipio ?? raw?.cliente?.cidade ?? null) as any;

    const uf = typeof ufRaw === 'string' ? ufRaw.trim().toUpperCase().slice(0, 2) : null;
    const cidade = typeof cidadeRaw === 'string' ? cidadeRaw.trim() : null;
    return { cidade, uf };
  } catch {
    return { cidade: null, uf: null };
  }
}

// Mapeia situação numérica do Tiny para descrição legível
// Retorna objeto com codigo e descricao para melhor UX
export function descricaoSituacao(situacao: number | null | undefined): string {
  const mapa: Record<number, string> = {
    8: 'Dados incompletos',
    0: 'Aberta',
    3: 'Aprovada',
    4: 'Preparando envio',
    1: 'Faturada',
    7: 'Pronto para envio',
    5: 'Enviada',
    6: 'Entregue',
    2: 'Cancelada',
    9: 'Não entregue',
  };
  return mapa[situacao ?? -1] ?? 'Desconhecido';
}

// Retorna todas as situações disponíveis com seus códigos
export const TODAS_SITUACOES = [
  { codigo: 0, descricao: 'Aberta' },
  { codigo: 1, descricao: 'Faturada' },
  { codigo: 2, descricao: 'Cancelada' },
  { codigo: 3, descricao: 'Aprovada' },
  { codigo: 4, descricao: 'Preparando envio' },
  { codigo: 5, descricao: 'Enviada' },
  { codigo: 6, descricao: 'Entregue' },
  { codigo: 7, descricao: 'Pronto para envio' },
  { codigo: 8, descricao: 'Dados incompletos' },
  { codigo: 9, descricao: 'Não entregue' },
] as const;

// Extrai valor de frete do raw data do Tiny
export function extrairFreteFromRaw(raw: any): number {
  // Prioridade: valorFrete direto > transportador.valorFrete > transportador.valor_frete
  const frete = 
    raw?.valorFrete ??
    raw?.transportador?.valorFrete ??
    raw?.transportador?.valor_frete ??
    raw?.valor_frete ??
    null;
  
  return parseValorTiny(frete);
}

// Mapeia um item de pedido da API v3 para o formato da tabela tiny_orders
export function mapPedidoToOrderRow(p: TinyPedidoListaItem) {
  const canal = deriveCanalFromRaw(p);
  const valorFrete = extrairFreteFromRaw(p);
  const { cidade, uf } = extractCidadeUfFromRaw(p);

  // Deriva forma_pagamento conforme Swagger: prioridade
  // 1. p.formaPagamento
  // 2. p.pagamento?.formaPagamento?.descricao
  // 3. p.pagamento?.formaPagamento?.formaPagamento
  // 4. null
  let forma_pagamento: string | null = null;
  if (typeof (p as any).formaPagamento === 'string') {
    forma_pagamento = (p as any).formaPagamento;
  } else if ((p as any).pagamento?.formaPagamento?.descricao) {
    forma_pagamento = (p as any).pagamento.formaPagamento.descricao;
  } else if ((p as any).pagamento?.formaPagamento?.formaPagamento) {
    forma_pagamento = (p as any).pagamento.formaPagamento.formaPagamento;
  } else {
    forma_pagamento = null;
  }

  // Mapeia todos os campos relevantes do pedido Tiny v3
  // Datas do Tiny: garantir formato ISO (timestamptz) para *_faturamento, *_atualizacao
  // Valor: garantir number
  return {
    tiny_id: p.id,
    numero_pedido: (p as any).numeroPedido ?? (p as any).numero ?? null,
    situacao: (p as any).situacao ?? null,
    data_criacao: extrairDataISO(p.dataCriacao),
    // Novos campos:
    tiny_data_prevista: extrairDataISO((p as any).dataPrevista ?? null),
    tiny_data_faturamento: (p as any).dataFaturamento ? new Date((p as any).dataFaturamento).toISOString() : null,
    tiny_data_atualizacao: (p as any).dataAtualizacao ? new Date((p as any).dataAtualizacao).toISOString() : null,
    valor: parseValorTiny((p as any).valor),
    valor_frete: valorFrete,
    valor_total_pedido: parseValorTiny((p as any).valorTotalPedido ?? (p as any).valorTotal ?? null),
    valor_total_produtos: parseValorTiny((p as any).valorTotalProdutos ?? null),
    valor_desconto: parseValorTiny((p as any).valorDesconto ?? (p as any).desconto ?? null),
    valor_outras_despesas: parseValorTiny((p as any).valorOutrasDespesas ?? (p as any).outrasDespesas ?? null),
    canal,
    cliente_nome: (p as any).cliente?.nome ?? null,
    cidade: cidade ?? null,
    uf: uf ?? null,
    forma_pagamento,
    transportador_nome: (p as any).transportador?.nome ?? null,
    // Armazena o payload completo no campo raw_payload SEMPRE
    raw_payload: p,
  } as const;
}

// Filtra itens por período opcional e já mapeia para rows
export function filtrarEMapearPedidos(
  itens: TinyPedidoListaItem[],
  opts?: { dataInicial?: string; dataFinal?: string }
) {
  const { dataInicial, dataFinal } = opts || {};

  return itens
    .map((p) => {
      const row = mapPedidoToOrderRow(p);
      if (!row.data_criacao) return null;
      if (dataInicial && row.data_criacao < dataInicial) return null;
      if (dataFinal && row.data_criacao > dataFinal) return null;
      return row;
    })
    .filter(Boolean) as Array<ReturnType<typeof mapPedidoToOrderRow>>;
}
