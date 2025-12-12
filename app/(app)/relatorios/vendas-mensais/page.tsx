"use client";

import { useState, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Package,
  TrendingUp,
  ShoppingCart,
  DollarSign,
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  ChevronDown,
  ChevronRight,
  BarChart3,
  Filter,
  RefreshCw,
  Search,
  Layers,
  Box,
  Store,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

// Types
interface Summary {
  total_pedidos: number;
  total_itens: number;
  quantidade_total: number;
  faturamento_total: number;
  ticket_medio: number;
  pedidos_nao_vinculados: number;
  pedidos_com_problema: number;
}

interface ByChannel {
  canal: string;
  pedidos: number;
  quantidade: number;
  faturamento: number;
  ticket_medio?: number;
  [key: string]: string | number | undefined;
}

interface TopProduct {
  sku: string;
  nome: string;
  quantidade: number;
  faturamento: number;
  pedidos: number;
}

interface SalesItem {
  id: string;
  pedido_id: string | number;
  numero_pedido: string | number;
  data: string;
  canal: string;
  sku: string;
  nome_produto: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  tipo_produto?: string;
  is_kit?: boolean;
  kit_parent_sku?: string;
  cliente_nome?: string;
  situacao?: number;
}

interface PedidoAgrupado {
  pedido_id: string | number;
  numero_pedido: string | number;
  data: string;
  canal: string;
  cliente_nome: string;
  situacao: number;
  itens: number;
  quantidade_total: number;
  valor_total: number;
  items: SalesItem[];
}

interface Pagination {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

type GroupBy = "pedido" | "sku" | "canal";
type ViewMode = "unitario" | "kit";

const CANAIS = [
  { value: "todos", label: "Todos os canais" },
  { value: "magalu", label: "Magalu" },
  { value: "shopee", label: "Shopee" },
  { value: "mercado", label: "Mercado Livre" },
  { value: "loja", label: "Loja Própria" },
];

const SITUACOES = [
  { value: "", label: "Todas as situações" },
  { value: "6", label: "Faturado" },
  { value: "9", label: "Aprovado" },
  { value: "3", label: "Em aberto" },
  { value: "12", label: "Entregue" },
];

const COLORS = ["#009DA8", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8"];

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const formatNumber = (value: number) => {
  return new Intl.NumberFormat("pt-BR").format(value);
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  return date.toLocaleDateString("pt-BR");
};

export default function VendasMensaisPage() {
  // Filtros
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().split("T")[0]);
  const [canal, setCanal] = useState("todos");
  const [situacao, setSituacao] = useState("");
  const [skuFilter, setSkuFilter] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("sku");
  const [viewMode, setViewMode] = useState<ViewMode>("unitario");

  // Dados
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byChannel, setByChannel] = useState<ByChannel[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [data, setData] = useState<(PedidoAgrupado | TopProduct | ByChannel)[]>([]);
  const [items, setItems] = useState<SalesItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, totalItems: 0, totalPages: 0 });
  const [expandedRows, setExpandedRows] = useState<Set<string | number>>(new Set());

  // Export
  const [exporting, setExporting] = useState<string | null>(null);

  const fetchReport = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        dataInicio,
        dataFim,
        canal,
        situacao,
        sku: skuFilter,
        groupBy,
        viewMode,
        page: String(page),
        limit: "50",
      });

      const res = await fetch(`/api/reports/sales?${params}`);
      const result = await res.json();

      if (result.success) {
        setSummary(result.summary);
        setByChannel(result.byChannel);
        setTopProducts(result.topProducts);
        setData(result.data);
        setItems(result.items);
        setPagination(result.pagination);
      } else {
        alert("Erro ao gerar relatório: " + (result.error || "Erro desconhecido"));
      }
    } catch (error) {
      console.error("Erro:", error);
      alert("Erro ao conectar com o servidor");
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, canal, situacao, skuFilter, groupBy, viewMode]);

  // Carregar ao montar
  useEffect(() => {
    fetchReport();
  }, []);

  const handlePageChange = (newPage: number) => {
    fetchReport(newPage);
  };

  const toggleRow = (id: string | number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  // Exportação
  const exportToCSV = async () => {
    setExporting("csv");
    try {
      const headers = ["SKU", "Produto", "Quantidade", "Faturamento", "Pedidos"];
      const rows = items.map((item) => [
        item.sku,
        item.nome_produto,
        item.quantidade,
        item.valor_total.toFixed(2),
        item.numero_pedido,
      ]);

      const csvContent = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
      const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `relatorio-vendas-${dataInicio}-${dataFim}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  const exportToXLSX = async () => {
    setExporting("xlsx");
    try {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(
        items.map((item) => ({
          SKU: item.sku,
          Produto: item.nome_produto,
          Quantidade: item.quantidade,
          "Valor Unitário": item.valor_unitario,
          "Valor Total": item.valor_total,
          Pedido: item.numero_pedido,
          Data: item.data,
          Canal: item.canal,
          Cliente: item.cliente_nome,
        }))
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Vendas");
      XLSX.writeFile(wb, `relatorio-vendas-${dataInicio}-${dataFim}.xlsx`);
    } catch (error) {
      console.error("Erro ao exportar XLSX:", error);
      alert("Erro ao exportar. Verifique se a biblioteca xlsx está instalada.");
    } finally {
      setExporting(null);
    }
  };

  const exportToPDF = async () => {
    setExporting("pdf");
    try {
      const jsPDF = (await import("jspdf")).default;
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF();
      
      // Título
      doc.setFontSize(16);
      doc.text("Relatório de Vendas", 14, 15);
      doc.setFontSize(10);
      doc.text(`Período: ${formatDate(dataInicio)} a ${formatDate(dataFim)}`, 14, 22);
      doc.text(`Modo: ${viewMode === "kit" ? "Apenas Kits" : "Todos os Produtos"}`, 14, 28);

      // Resumo
      if (summary) {
        doc.setFontSize(12);
        doc.text("Resumo", 14, 38);
        doc.setFontSize(10);
        doc.text(`Pedidos: ${formatNumber(summary.total_pedidos)}`, 14, 45);
        doc.text(`Faturamento: ${formatCurrency(summary.faturamento_total)}`, 14, 51);
        doc.text(`Ticket Médio: ${formatCurrency(summary.ticket_medio)}`, 14, 57);
      }

      // Tabela de produtos
      const tableData = topProducts.slice(0, 30).map((p) => [
        p.sku,
        p.nome.substring(0, 40),
        formatNumber(p.quantidade),
        formatCurrency(p.faturamento),
        p.pedidos,
      ]);

      autoTable(doc, {
        head: [["SKU", "Produto", "Qtd", "Faturamento", "Pedidos"]],
        body: tableData,
        startY: 65,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [0, 157, 168] },
      });

      doc.save(`relatorio-vendas-${dataInicio}-${dataFim}.pdf`);
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      alert("Erro ao exportar PDF.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <BarChart3 className="w-7 h-7 text-[#009DA8]" />
              Relatório de Vendas
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
              Analise vendas por pedido, SKU ou canal
            </p>
          </div>

          {/* Botões de exportação */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={exportToCSV}
              disabled={!!exporting || loading || !items.length}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg text-sm transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {exporting === "csv" ? "Exportando..." : "CSV"}
            </button>
            <button
              onClick={exportToXLSX}
              disabled={!!exporting || loading || !items.length}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              {exporting === "xlsx" ? "Exportando..." : "Excel"}
            </button>
            <button
              onClick={exportToPDF}
              disabled={!!exporting || loading || !items.length}
              className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg text-sm transition-colors"
            >
              <FileText className="w-4 h-4" />
              {exporting === "pdf" ? "Exportando..." : "PDF"}
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-[#009DA8]" />
            <h2 className="font-semibold">Filtros</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Data início */}
            <div>
              <label className="block text-sm font-medium mb-1">Data Início</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              />
            </div>

            {/* Data fim */}
            <div>
              <label className="block text-sm font-medium mb-1">Data Fim</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              />
            </div>

            {/* Canal */}
            <div>
              <label className="block text-sm font-medium mb-1">Canal</label>
              <select
                value={canal}
                onChange={(e) => setCanal(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              >
                {CANAIS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Situação */}
            <div>
              <label className="block text-sm font-medium mb-1">Situação</label>
              <select
                value={situacao}
                onChange={(e) => setSituacao(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              >
                {SITUACOES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* SKU */}
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Filtrar por SKU</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={skuFilter}
                  onChange={(e) => setSkuFilter(e.target.value)}
                  placeholder="Digite o SKU..."
                  className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
                />
              </div>
            </div>

            {/* Agrupar por */}
            <div>
              <label className="block text-sm font-medium mb-1">Agrupar por</label>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
              >
                <option value="sku">Por SKU/Produto</option>
                <option value="pedido">Por Pedido</option>
                <option value="canal">Por Canal</option>
              </select>
            </div>

            {/* Botão gerar */}
            <div className="flex items-end">
              <button
                onClick={() => fetchReport(1)}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#009DA8] hover:bg-[#008B96] disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <BarChart3 className="w-4 h-4" />
                )}
                {loading ? "Gerando..." : "Gerar Relatório"}
              </button>
            </div>
          </div>

          {/* Toggle Unitário/Kit */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">Visualização:</span>
              <div className="flex rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
                <button
                  onClick={() => setViewMode("unitario")}
                  className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                    viewMode === "unitario"
                      ? "bg-[#009DA8] text-white"
                      : "bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600"
                  }`}
                >
                  <Box className="w-4 h-4" />
                  Unitário
                </button>
                <button
                  onClick={() => setViewMode("kit")}
                  className={`flex items-center gap-2 px-4 py-2 text-sm transition-colors ${
                    viewMode === "kit"
                      ? "bg-[#009DA8] text-white"
                      : "bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600"
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  Apenas Kits
                </button>
              </div>
              <span className="text-xs text-gray-500">
                {viewMode === "kit"
                  ? "Mostra apenas vendas de kits"
                  : "Mostra todos os produtos vendidos"}
              </span>
            </div>
          </div>
        </div>

        {/* Alertas */}
        {summary && (summary.pedidos_nao_vinculados > 0 || summary.pedidos_com_problema > 0) && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-800 dark:text-amber-200">Atenção</h3>
                <ul className="text-sm text-amber-700 dark:text-amber-300 mt-1 space-y-1">
                  {summary.pedidos_nao_vinculados > 0 && (
                    <li>
                      • {summary.pedidos_nao_vinculados} pedido(s) de marketplace não estão vinculados
                    </li>
                  )}
                  {summary.pedidos_com_problema > 0 && (
                    <li>• {summary.pedidos_com_problema} pedido(s) sem itens cadastrados</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Cards de Resumo */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-2">
                <ShoppingCart className="w-4 h-4" />
                <span className="text-xs font-medium">Pedidos</span>
              </div>
              <p className="text-2xl font-bold">{formatNumber(summary.total_pedidos)}</p>
            </div>

            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-2">
                <Package className="w-4 h-4" />
                <span className="text-xs font-medium">Quantidade</span>
              </div>
              <p className="text-2xl font-bold">{formatNumber(summary.quantidade_total)}</p>
            </div>

            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-2">
                <DollarSign className="w-4 h-4" />
                <span className="text-xs font-medium">Faturamento</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.faturamento_total)}</p>
            </div>

            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-2">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs font-medium">Ticket Médio</span>
              </div>
              <p className="text-2xl font-bold">{formatCurrency(summary.ticket_medio)}</p>
            </div>

            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-2">
                <Store className="w-4 h-4" />
                <span className="text-xs font-medium">Canais</span>
              </div>
              <p className="text-2xl font-bold">{byChannel.length}</p>
            </div>
          </div>
        )}

        {/* Gráficos */}
        {byChannel.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Gráfico de barras - Faturamento por canal */}
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="font-semibold mb-4">Faturamento por Canal</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={byChannel}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="canal" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="faturamento" fill="#009DA8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Gráfico de pizza - Pedidos por canal */}
            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="font-semibold mb-4">Pedidos por Canal</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={byChannel}
                    dataKey="pedidos"
                    nameKey="canal"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {byChannel.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatNumber(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Ranking de Produtos */}
        {topProducts.length > 0 && (
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#009DA8]" />
              Top 10 Produtos Mais Vendidos
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3">#</th>
                    <th className="text-left py-2 px-3">SKU</th>
                    <th className="text-left py-2 px-3">Produto</th>
                    <th className="text-right py-2 px-3">Qtd</th>
                    <th className="text-right py-2 px-3">Faturamento</th>
                    <th className="text-right py-2 px-3">Pedidos</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.slice(0, 10).map((p, i) => (
                    <tr key={p.sku} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-2 px-3 font-bold text-[#009DA8]">{i + 1}</td>
                      <td className="py-2 px-3 font-mono text-xs">{p.sku}</td>
                      <td className="py-2 px-3 truncate max-w-[200px]" title={p.nome}>{p.nome}</td>
                      <td className="py-2 px-3 text-right font-medium">{formatNumber(p.quantidade)}</td>
                      <td className="py-2 px-3 text-right text-green-600">{formatCurrency(p.faturamento)}</td>
                      <td className="py-2 px-3 text-right">{p.pedidos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tabela de Dados (agrupada) */}
        {data.length > 0 && (
          <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <h3 className="font-semibold mb-4">
              {groupBy === "pedido" && "Detalhamento por Pedido"}
              {groupBy === "sku" && "Detalhamento por Produto"}
              {groupBy === "canal" && "Detalhamento por Canal"}
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    {groupBy === "pedido" && (
                      <>
                        <th className="text-left py-2 px-3 w-8"></th>
                        <th className="text-left py-2 px-3">Pedido</th>
                        <th className="text-left py-2 px-3">Data</th>
                        <th className="text-left py-2 px-3">Canal</th>
                        <th className="text-left py-2 px-3">Cliente</th>
                        <th className="text-right py-2 px-3">Itens</th>
                        <th className="text-right py-2 px-3">Qtd</th>
                        <th className="text-right py-2 px-3">Total</th>
                      </>
                    )}
                    {groupBy === "sku" && (
                      <>
                        <th className="text-left py-2 px-3">SKU</th>
                        <th className="text-left py-2 px-3">Produto</th>
                        <th className="text-right py-2 px-3">Quantidade</th>
                        <th className="text-right py-2 px-3">Faturamento</th>
                        <th className="text-right py-2 px-3">Pedidos</th>
                      </>
                    )}
                    {groupBy === "canal" && (
                      <>
                        <th className="text-left py-2 px-3">Canal</th>
                        <th className="text-right py-2 px-3">Pedidos</th>
                        <th className="text-right py-2 px-3">Quantidade</th>
                        <th className="text-right py-2 px-3">Faturamento</th>
                        <th className="text-right py-2 px-3">Ticket Médio</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => {
                    if (groupBy === "pedido") {
                      const pedido = row as PedidoAgrupado;
                      const isExpanded = expandedRows.has(pedido.pedido_id);
                      return (
                        <>
                          <tr
                            key={pedido.pedido_id}
                            className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                            onClick={() => toggleRow(pedido.pedido_id)}
                          >
                            <td className="py-2 px-3">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </td>
                            <td className="py-2 px-3 font-medium">{pedido.numero_pedido}</td>
                            <td className="py-2 px-3">{formatDate(pedido.data)}</td>
                            <td className="py-2 px-3">{pedido.canal}</td>
                            <td className="py-2 px-3 truncate max-w-[150px]">{pedido.cliente_nome}</td>
                            <td className="py-2 px-3 text-right">{pedido.itens}</td>
                            <td className="py-2 px-3 text-right">{formatNumber(pedido.quantidade_total)}</td>
                            <td className="py-2 px-3 text-right text-green-600 font-medium">
                              {formatCurrency(pedido.valor_total)}
                            </td>
                          </tr>
                          {isExpanded &&
                            pedido.items?.map((item) => (
                              <tr
                                key={item.id}
                                className="bg-gray-50 dark:bg-gray-700/30 border-b border-gray-100 dark:border-gray-800"
                              >
                                <td></td>
                                <td className="py-1 px-3 text-xs font-mono text-gray-500">{item.sku}</td>
                                <td colSpan={3} className="py-1 px-3 text-xs truncate">
                                  {item.nome_produto}
                                  {item.kit_parent_sku && (
                                    <span className="ml-2 text-[#009DA8]">(de kit {item.kit_parent_sku})</span>
                                  )}
                                </td>
                                <td></td>
                                <td className="py-1 px-3 text-xs text-right">{item.quantidade}</td>
                                <td className="py-1 px-3 text-xs text-right">{formatCurrency(item.valor_total)}</td>
                              </tr>
                            ))}
                        </>
                      );
                    }

                    if (groupBy === "sku") {
                      const produto = row as TopProduct;
                      return (
                        <tr
                          key={produto.sku}
                          className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        >
                          <td className="py-2 px-3 font-mono text-xs">{produto.sku}</td>
                          <td className="py-2 px-3 truncate max-w-[250px]" title={produto.nome}>
                            {produto.nome}
                          </td>
                          <td className="py-2 px-3 text-right font-medium">{formatNumber(produto.quantidade)}</td>
                          <td className="py-2 px-3 text-right text-green-600">{formatCurrency(produto.faturamento)}</td>
                          <td className="py-2 px-3 text-right">{produto.pedidos}</td>
                        </tr>
                      );
                    }

                    if (groupBy === "canal") {
                      const canalData = row as ByChannel;
                      return (
                        <tr
                          key={canalData.canal}
                          className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        >
                          <td className="py-2 px-3 font-medium">{canalData.canal}</td>
                          <td className="py-2 px-3 text-right">{formatNumber(canalData.pedidos)}</td>
                          <td className="py-2 px-3 text-right">{formatNumber(canalData.quantidade)}</td>
                          <td className="py-2 px-3 text-right text-green-600">{formatCurrency(canalData.faturamento)}</td>
                          <td className="py-2 px-3 text-right">
                            {formatCurrency(canalData.ticket_medio || (canalData.pedidos > 0 ? canalData.faturamento / canalData.pedidos : 0))}
                          </td>
                        </tr>
                      );
                    }

                    return null;
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Página {pagination.page} de {pagination.totalPages} ({formatNumber(pagination.totalItems)} itens)
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1 || loading}
                    className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages || loading}
                    className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Estado vazio */}
        {!loading && data.length === 0 && summary === null && (
          <div className="text-center py-12 text-gray-500">
            <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Selecione os filtros e clique em &quot;Gerar Relatório&quot;</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
