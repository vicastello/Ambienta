"use client";

import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Calendar,
  Download,
  Package,
  TrendingUp,
  ShoppingCart,
  DollarSign,
  FileText,
  ChevronDown,
  ChevronRight,
  Box,
} from "lucide-react";

interface SalesReportItem {
  marketplace: string;
  marketplace_order_id: string;
  marketplace_order_date: string;
  tiny_numero_pedido: number;
  tiny_product_id: number;
  tiny_codigo: string;
  tiny_nome: string;
  tiny_tipo: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  parent_product_id?: number;
  parent_codigo?: string;
  parent_nome?: string;
  parent_tipo?: string;
  is_component?: boolean;
}

interface SalesReportSummary {
  period: {
    year: number;
    month: number;
    startDate: string;
    endDate: string;
  };
  marketplace: string;
  total_orders: number;
  total_items: number;
  total_revenue: number;
  breakdown_by_marketplace: Record<string, {
    orders: number;
    items: number;
    revenue: number;
  }>;
  breakdown_by_product_type: Record<string, {
    count: number;
    quantity: number;
    revenue: number;
  }>;
}

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  S: 'Simples',
  V: 'Variação',
  K: 'Kit',
  F: 'Fabricado',
  M: 'Matéria Prima',
};

const MARKETPLACE_LABELS: Record<string, string> = {
  magalu: 'Magalu',
  shopee: 'Shopee',
  mercado_livre: 'Mercado Livre',
  all: 'Todos',
};

export default function VendasMensaisPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [marketplace, setMarketplace] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<SalesReportSummary | null>(null);
  const [items, setItems] = useState<SalesReportItem[]>([]);
  const [expandedKits, setExpandedKits] = useState<Set<number>>(new Set());

  const handleGenerateReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
        marketplace,
      });

      const res = await fetch(`/api/reports/monthly-sales?${params}`);
      const data = await res.json();

      if (data.success) {
        setSummary(data.summary);
        setItems(data.items || []);
      } else {
        alert('Erro ao gerar relatório: ' + (data.error || 'Erro desconhecido'));
      }
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Erro ao gerar relatório');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!items.length) {
      alert('Nenhum dado para exportar');
      return;
    }

    // CSV headers
    const headers = [
      'Marketplace',
      'ID Pedido Marketplace',
      'Data Pedido',
      'Nº Pedido Tiny',
      'Código Produto',
      'Nome Produto',
      'Tipo',
      'Quantidade',
      'Preço Unitário',
      'Total',
      'É Componente',
      'Produto Pai',
    ];

    // CSV rows
    const rows = items
      .filter(item => !item.is_component) // Only export main items, not kit components
      .map(item => [
        item.marketplace,
        item.marketplace_order_id,
        new Date(item.marketplace_order_date).toLocaleDateString('pt-BR'),
        item.tiny_numero_pedido,
        item.tiny_codigo,
        item.tiny_nome,
        PRODUCT_TYPE_LABELS[item.tiny_tipo] || item.tiny_tipo,
        item.quantity,
        item.unit_price.toFixed(2),
        item.total_price.toFixed(2),
        item.is_component ? 'Sim' : 'Não',
        item.parent_nome || '',
      ]);

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `vendas-${year}-${String(month).padStart(2, '0')}.csv`;
    link.click();
  };

  const toggleKitExpansion = (productId: number) => {
    setExpandedKits(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  // Group items by order for better display
  const groupedItems = items.reduce((acc, item) => {
    if (item.is_component) return acc; // Skip components in main list
    const key = item.marketplace_order_id;
    if (!acc[key]) {
      acc[key] = {
        order: item,
        items: [],
        components: [],
      };
    }
    acc[key].items.push(item);

    // Find components for this item if it's a kit
    if (item.tiny_tipo === 'K') {
      const components = items.filter(
        i => i.is_component && i.parent_product_id === item.tiny_product_id &&
            i.marketplace_order_id === item.marketplace_order_id
      );
      acc[key].components.push(...components);
    }

    return acc;
  }, {} as Record<string, any>);

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
            <FileText className="w-8 h-8" />
            Relatório de Vendas Mensais
          </h1>
          <p className="text-gray-600">
            Relatório completo com vendas por kits, variações e componentes individuais
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white border rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ano
              </label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                min="2020"
                max="2030"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mês
              </label>
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1).toLocaleDateString('pt-BR', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Marketplace
              </label>
              <select
                value={marketplace}
                onChange={(e) => setMarketplace(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todos</option>
                <option value="magalu">Magalu</option>
                <option value="shopee">Shopee</option>
                <option value="mercado_livre">Mercado Livre</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleGenerateReport}
                disabled={loading}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                {loading ? 'Gerando...' : 'Gerar Relatório'}
              </button>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleExportCSV}
                disabled={!items.length}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Exportar CSV
              </button>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-700 font-medium">Total de Pedidos</p>
                  <p className="text-2xl font-bold text-blue-900">{summary.total_orders}</p>
                </div>
                <ShoppingCart className="w-8 h-8 text-blue-500" />
              </div>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-purple-700 font-medium">Total de Itens</p>
                  <p className="text-2xl font-bold text-purple-900">{summary.total_items}</p>
                </div>
                <Package className="w-8 h-8 text-purple-500" />
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-700 font-medium">Receita Total</p>
                  <p className="text-2xl font-bold text-green-900">
                    R$ {summary.total_revenue.toFixed(2)}
                  </p>
                </div>
                <DollarSign className="w-8 h-8 text-green-500" />
              </div>
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-orange-700 font-medium">Ticket Médio</p>
                  <p className="text-2xl font-bold text-orange-900">
                    R$ {(summary.total_revenue / summary.total_orders || 0).toFixed(2)}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-orange-500" />
              </div>
            </div>
          </div>
        )}

        {/* Breakdown by Marketplace */}
        {summary && Object.keys(summary.breakdown_by_marketplace).length > 0 && (
          <div className="bg-white border rounded-lg p-4 mb-6">
            <h2 className="text-lg font-semibold mb-4">Vendas por Marketplace</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(summary.breakdown_by_marketplace).map(([mkt, stats]) => (
                <div key={mkt} className="border rounded-lg p-4">
                  <h3 className="font-medium mb-2">{MARKETPLACE_LABELS[mkt] || mkt}</h3>
                  <div className="space-y-1 text-sm">
                    <p className="flex justify-between">
                      <span className="text-gray-600">Pedidos:</span>
                      <span className="font-semibold">{stats.orders}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-gray-600">Itens:</span>
                      <span className="font-semibold">{stats.items}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-gray-600">Receita:</span>
                      <span className="font-semibold">R$ {stats.revenue.toFixed(2)}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Breakdown by Product Type */}
        {summary && Object.keys(summary.breakdown_by_product_type).length > 0 && (
          <div className="bg-white border rounded-lg p-4 mb-6">
            <h2 className="text-lg font-semibold mb-4">Vendas por Tipo de Produto</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Tipo</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-700">Quantidade Itens</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-700">Quantidade Total</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-700">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary.breakdown_by_product_type).map(([type, stats]) => (
                    <tr key={type} className="border-b">
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                          {PRODUCT_TYPE_LABELS[type] || type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{stats.count}</td>
                      <td className="px-4 py-3 text-right">{stats.quantity}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        R$ {stats.revenue.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Items List */}
        {items.length > 0 && (
          <div className="bg-white border rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">Itens Vendidos</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Data</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Marketplace</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">ID Pedido</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Produto</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Tipo</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-700">Qtd</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-700">Preço Unit.</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-700">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(groupedItems).map(([orderId, group]) => (
                    <>
                      {group.items.map((item: SalesReportItem, idx: number) => {
                        const isKit = item.tiny_tipo === 'K';
                        const isExpanded = expandedKits.has(item.tiny_product_id);
                        const components = group.components.filter(
                          (c: SalesReportItem) => c.parent_product_id === item.tiny_product_id
                        );

                        return (
                          <>
                            <tr key={`${orderId}-${idx}`} className="border-b hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm">
                                {new Date(item.marketplace_order_date).toLocaleDateString('pt-BR')}
                              </td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs">
                                  {MARKETPLACE_LABELS[item.marketplace] || item.marketplace}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm">{item.marketplace_order_id}</td>
                              <td className="px-4 py-3 text-sm">
                                <div className="flex items-center gap-2">
                                  {isKit && (
                                    <button
                                      onClick={() => toggleKitExpansion(item.tiny_product_id)}
                                      className="text-gray-500 hover:text-gray-700"
                                    >
                                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                    </button>
                                  )}
                                  <div>
                                    <p className="font-medium">{item.tiny_codigo}</p>
                                    <p className="text-xs text-gray-600">{item.tiny_nome}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 rounded text-xs ${
                                  item.tiny_tipo === 'K' ? 'bg-orange-100 text-orange-800' :
                                  item.tiny_tipo === 'V' ? 'bg-blue-100 text-blue-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {PRODUCT_TYPE_LABELS[item.tiny_tipo] || item.tiny_tipo}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">{item.quantity}</td>
                              <td className="px-4 py-3 text-right">R$ {item.unit_price.toFixed(2)}</td>
                              <td className="px-4 py-3 text-right font-semibold">
                                R$ {item.total_price.toFixed(2)}
                              </td>
                            </tr>

                            {/* Kit Components */}
                            {isKit && isExpanded && components.map((comp: SalesReportItem, compIdx: number) => (
                              <tr key={`${orderId}-${idx}-comp-${compIdx}`} className="bg-gray-50 border-b">
                                <td className="px-4 py-2"></td>
                                <td className="px-4 py-2"></td>
                                <td className="px-4 py-2"></td>
                                <td className="px-4 py-2 text-sm pl-12">
                                  <div className="flex items-center gap-2">
                                    <Box className="w-3 h-3 text-gray-400" />
                                    <div>
                                      <p className="font-medium text-gray-700">{comp.tiny_codigo}</p>
                                      <p className="text-xs text-gray-500">{comp.tiny_nome}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-2">
                                  <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                                    Componente
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-right text-sm text-gray-600">{comp.quantity}</td>
                                <td className="px-4 py-2 text-right text-sm text-gray-600">-</td>
                                <td className="px-4 py-2 text-right text-sm text-gray-600">-</td>
                              </tr>
                            ))}
                          </>
                        );
                      })}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !items.length && (
          <div className="text-center py-12 text-gray-500">
            <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium">Nenhum relatório gerado ainda</p>
            <p className="text-sm mt-2">Selecione o período e clique em "Gerar Relatório"</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
