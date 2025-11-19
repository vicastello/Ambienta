import { TinyPedidoListaItem } from './tinyApi';

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

// Mapeia um item de pedido da API v3 para o formato da tabela tiny_orders
export function mapPedidoToOrderRow(p: TinyPedidoListaItem) {
  const canalBruto = (p as any).canalVenda ?? (p as any).ecommerce?.nome ?? null;
  const canal = normalizarCanalTiny(canalBruto);

  return {
    tiny_id: p.id,
    numero_pedido: (p as any).numeroPedido ?? (p as any).numero ?? null,
    situacao: (p as any).situacao ?? null,
    data_criacao: extrairDataISO(p.dataCriacao),
    valor: parseValorTiny(p.valor),
    canal,
    cliente_nome: p.cliente?.nome ?? null,
    raw: p as any,
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
