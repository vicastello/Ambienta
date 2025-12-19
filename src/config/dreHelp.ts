export type DreHelpEntry = {
  url?: string;
  tooltip?: string;
};

export type DreHelpMap = Record<string, DreHelpEntry>;

export const DRE_HELP_STORAGE_KEY = 'dre_help_v1';

export const defaultDreHelp: DreHelpMap = {
  VENDAS: {
    url: 'https://erp.olist.com/relatorio_vendas',
    tooltip: 'Verificar no link',
  },
  REEMBOLSOS_DEVOLUCOES: {
    url: 'https://erp.olist.com/devolucoes_vendas#list',
    tooltip: 'Desconsiderar as que têm o pedido cancelado',
  },
  RESSARCIMENTO_DEVOLUCOES: {
    url: 'https://erp.olist.com/devolucoes_vendas#list',
    tooltip: 'Verificar pelas tags "creditado"',
  },
  CMV_IMPOSTOS: {
    url: 'https://erp.olist.com/relatorio_vendas',
    tooltip:
      'Verificar se a % de imposto está correta em Ajustes. Filtros: baseado em Pedidos, Agrupar Produto, remover Dados incompletos/Cancelado, Exibir devoluções=Sim, Data do pedido. Salvar em: Dados Atuais/Tiny - Relatório de Vendas do Mês.xlsx',
  },
  TARIFAS_SHOPEE: {
    url: 'https://seller.shopee.com.br/portal/sale/order',
    tooltip: 'Salvar em: Dados Atuais/ Shopee - Todos os Pedidos.xlsx',
  },
  TARIFAS_MERCADO_LIVRE: {
    url: 'https://erp.olist.com/relatorio_custos_ecommerce',
    tooltip: 'Sem comentários',
  },
  TARIFAS_MAGALU: {
    url: 'https://seller.magalu.com/pedidos/relatorio',
    tooltip: 'Criar relatório e baixar',
  },
  COOP_FRETES_MAGALU: {
    url: 'https://blank',
    tooltip: 'Sem comentários',
  },
  FRETES: {
    url: 'https://blank',
    tooltip: 'Sem comentários',
  },
};

