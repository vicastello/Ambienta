"use client";

import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Link,
  Unlink,
  Search,
  RefreshCcw,
  CheckCircle2,
  AlertCircle,
  Package,
  ShoppingBag,
  Calendar,
  TrendingUp,
  Zap,
} from "lucide-react";

type Marketplace = 'magalu' | 'shopee' | 'mercado_livre';

interface UnlinkedOrder {
  // Magalu
  id_order?: string;
  order_status?: string;
  purchased_date?: string;
  total_amount?: number;
  receiver_name?: string;

  // Shopee
  order_sn?: string;
  create_time?: string;
  recipient_name?: string;

  // Mercado Livre
  meli_order_id?: number;
  date_created?: string;
  buyer_full_name?: string;
  status?: string;
}

interface TinyOrder {
  id: number;
  numero_pedido: number;
  situacao: number;
  data_criacao: string;
  valor_total_pedido: number;
  cliente_nome: string;
  canal: string;
}

interface LinkedOrder {
  link_id: number;
  marketplace: string;
  marketplace_order_id: string;
  tiny_order_id: number;
  linked_at: string;
  tiny_numero_pedido: number;
  marketplace_order_status: string;
  marketplace_total_amount: number;
  marketplace_order_date: string;
}

export default function VinculosPage() {
  const [marketplace, setMarketplace] = useState<Marketplace>('magalu');
  const [unlinkedOrders, setUnlinkedOrders] = useState<UnlinkedOrder[]>([]);
  const [linkedOrders, setLinkedOrders] = useState<LinkedOrder[]>([]);
  const [tinyOrders, setTinyOrders] = useState<TinyOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [selectedMarketplaceOrder, setSelectedMarketplaceOrder] = useState<string | null>(null);
  const [selectedTinyOrder, setSelectedTinyOrder] = useState<number | null>(null);
  const [searchTiny, setSearchTiny] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [stats, setStats] = useState({
    total_unlinked: 0,
    total_linked: 0,
  });
  const [autoLinking, setAutoLinking] = useState(false);

  useEffect(() => {
    loadData();
  }, [marketplace, dateFrom, dateTo]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load unlinked orders
      const unlinkedParams = new URLSearchParams({
        marketplace,
        ...(dateFrom && { dateFrom }),
        ...(dateTo && { dateTo }),
      });
      const unlinkedRes = await fetch(`/api/reports/unlinked-orders?${unlinkedParams}`);
      const unlinkedData = await unlinkedRes.json();
      setUnlinkedOrders(unlinkedData.orders || []);
      setStats(prev => ({ ...prev, total_unlinked: unlinkedData.count || 0 }));

      // Load linked orders
      const linkedParams = new URLSearchParams({
        marketplace,
        ...(dateFrom && { dateFrom }),
        ...(dateTo && { dateTo }),
      });
      const linkedRes = await fetch(`/api/reports/order-links?${linkedParams}`);
      const linkedData = await linkedRes.json();
      setLinkedOrders(linkedData.links || []);
      setStats(prev => ({ ...prev, total_linked: linkedData.count || 0 }));

      // Load Tiny orders (for linking)
      const tinyParams = new URLSearchParams({
        limit: '500',
        ...(dateFrom && { dataInicio: dateFrom }),
        ...(dateTo && { dataFim: dateTo }),
      });
      const tinyRes = await fetch(`/api/tiny/pedidos?${tinyParams}`);
      const tinyData = await tinyRes.json();
      setTinyOrders(tinyData.pedidos || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLink = async () => {
    if (!selectedMarketplaceOrder || !selectedTinyOrder) {
      alert('Selecione um pedido do marketplace e um pedido do Tiny');
      return;
    }

    setLinking(true);
    try {
      const res = await fetch('/api/reports/order-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketplace,
          marketplace_order_id: selectedMarketplaceOrder,
          tiny_order_id: selectedTinyOrder,
          linked_by: 'manual',
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(`Erro ao vincular: ${error.error}`);
        return;
      }

      // Success - reload data
      setSelectedMarketplaceOrder(null);
      setSelectedTinyOrder(null);
      await loadData();
    } catch (error) {
      console.error('Error linking orders:', error);
      alert('Erro ao vincular pedidos');
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (linkId: number) => {
    if (!confirm('Tem certeza que deseja desvincular este pedido?')) {
      return;
    }

    try {
      const res = await fetch(`/api/reports/order-links?linkId=${linkId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        alert('Erro ao desvincular');
        return;
      }

      await loadData();
    } catch (error) {
      console.error('Error unlinking:', error);
      alert('Erro ao desvincular pedido');
    }
  };

  const handleAutoLink = async () => {
    if (!confirm('Executar vinculação automática dos últimos 90 dias?\n\nIsso irá vincular automaticamente todos os pedidos que têm correspondência exata de ID entre os marketplaces e o Tiny.')) {
      return;
    }

    setAutoLinking(true);
    try {
      const res = await fetch('/api/reports/auto-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          daysBack: 90,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(`Erro: ${data.error}`);
        return;
      }

      const { result } = data;
      alert(
        `Vinculação automática concluída!\n\n` +
        `✓ Vinculados: ${result.total_linked}\n` +
        `• Já existentes: ${result.total_already_linked}\n` +
        `• Não encontrados: ${result.total_not_found}\n` +
        `• Erros: ${result.errors.length}`
      );

      await loadData();
    } catch (error) {
      console.error('Error auto-linking:', error);
      alert('Erro ao executar vinculação automática');
    } finally {
      setAutoLinking(false);
    }
  };

  const getOrderId = (order: UnlinkedOrder) => {
    return order.id_order || order.order_sn || String(order.meli_order_id);
  };

  const getOrderDate = (order: UnlinkedOrder) => {
    const date = order.purchased_date || order.create_time || order.date_created;
    return date ? new Date(date).toLocaleDateString('pt-BR') : '-';
  };

  const getOrderCustomer = (order: UnlinkedOrder) => {
    return order.receiver_name || order.recipient_name || order.buyer_full_name || '-';
  };

  const getOrderStatus = (order: UnlinkedOrder) => {
    return order.order_status || order.status || '-';
  };

  const filteredTinyOrders = tinyOrders.filter(order => {
    if (!searchTiny) return true;
    const search = searchTiny.toLowerCase();
    return (
      String(order.numero_pedido).includes(search) ||
      order.cliente_nome?.toLowerCase().includes(search) ||
      order.canal?.toLowerCase().includes(search)
    );
  });

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
                <Link className="w-8 h-8" />
                Vincular Pedidos dos Marketplaces
              </h1>
              <p className="text-gray-600">
                Vincule pedidos do Magalu, Shopee e Mercado Livre com pedidos do Tiny para relatórios precisos
              </p>
            </div>
            <button
              onClick={handleAutoLink}
              disabled={autoLinking}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-semibold"
            >
              <Zap className={`w-5 h-5 ${autoLinking ? 'animate-pulse' : ''}`} />
              {autoLinking ? 'Vinculando...' : 'Vinculação Automática (90d)'}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-yellow-700 font-medium">Não Vinculados</p>
                <p className="text-2xl font-bold text-yellow-900">{stats.total_unlinked}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-yellow-500" />
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-700 font-medium">Vinculados</p>
                <p className="text-2xl font-bold text-green-900">{stats.total_linked}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-700 font-medium">Taxa de Vinculação</p>
                <p className="text-2xl font-bold text-blue-900">
                  {stats.total_linked + stats.total_unlinked > 0
                    ? Math.round((stats.total_linked / (stats.total_linked + stats.total_unlinked)) * 100)
                    : 0}%
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-blue-500" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Marketplace
              </label>
              <select
                value={marketplace}
                onChange={(e) => setMarketplace(e.target.value as Marketplace)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="magalu">Magalu</option>
                <option value="shopee">Shopee</option>
                <option value="mercado_livre">Mercado Livre</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data Início
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data Fim
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={loadData}
                disabled={loading}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
            </div>
          </div>
        </div>

        {/* Linking Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Unlinked Orders */}
          <div className="bg-white border rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5" />
              Pedidos Não Vinculados
            </h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {unlinkedOrders.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Nenhum pedido não vinculado</p>
              ) : (
                unlinkedOrders.map((order) => {
                  const orderId = getOrderId(order);
                  return (
                    <div
                      key={orderId}
                      onClick={() => setSelectedMarketplaceOrder(orderId)}
                      className={`p-3 border rounded-md cursor-pointer transition-colors ${
                        selectedMarketplaceOrder === orderId
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{orderId}</p>
                          <p className="text-xs text-gray-600">{getOrderCustomer(order)}</p>
                          <p className="text-xs text-gray-500 mt-1">{getOrderDate(order)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">
                            R$ {(order.total_amount || 0).toFixed(2)}
                          </p>
                          <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                            {getOrderStatus(order)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Tiny Orders */}
          <div className="bg-white border rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Package className="w-5 h-5" />
              Pedidos do Tiny
            </h2>
            <div className="mb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por número, cliente ou canal..."
                  value={searchTiny}
                  onChange={(e) => setSearchTiny(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {filteredTinyOrders.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Nenhum pedido encontrado</p>
              ) : (
                filteredTinyOrders.map((order) => (
                  <div
                    key={order.id}
                    onClick={() => setSelectedTinyOrder(order.id)}
                    className={`p-3 border rounded-md cursor-pointer transition-colors ${
                      selectedTinyOrder === order.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium text-sm">#{order.numero_pedido}</p>
                        <p className="text-xs text-gray-600">{order.cliente_nome}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(order.data_criacao).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          R$ {(order.valor_total_pedido || 0).toFixed(2)}
                        </p>
                        <span className="text-xs px-2 py-1 bg-blue-100 rounded">
                          {order.canal || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Link Button */}
        <div className="flex justify-center mb-6">
          <button
            onClick={handleLink}
            disabled={!selectedMarketplaceOrder || !selectedTinyOrder || linking}
            className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-semibold"
          >
            <Link className="w-5 h-5" />
            {linking ? 'Vinculando...' : 'Vincular Pedidos Selecionados'}
          </button>
        </div>

        {/* Linked Orders Table */}
        <div className="bg-white border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            Pedidos Vinculados
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Marketplace</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">ID Marketplace</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Pedido Tiny</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Data</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Valor</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Vinculado em</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-700">Ações</th>
                </tr>
              </thead>
              <tbody>
                {linkedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      Nenhum pedido vinculado ainda
                    </td>
                  </tr>
                ) : (
                  linkedOrders.map((link) => (
                    <tr key={link.link_id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium">
                          {link.marketplace}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">{link.marketplace_order_id}</td>
                      <td className="px-4 py-3 text-sm font-medium">#{link.tiny_numero_pedido}</td>
                      <td className="px-4 py-3 text-sm">
                        {new Date(link.marketplace_order_date).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold">
                        R$ {(link.marketplace_total_amount || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(link.linked_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleUnlink(link.link_id)}
                          className="text-red-600 hover:text-red-800 p-1 hover:bg-red-50 rounded"
                          title="Desvincular"
                        >
                          <Unlink className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
