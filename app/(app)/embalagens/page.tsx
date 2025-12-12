"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Box,
  Edit2,
  Package,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import type { Embalagem, EmbalagemInput } from "@/src/types/embalagens";

const formatCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const formatNumber = (value: number) =>
  value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export default function EmbalagensPage() {
  const [embalagens, setEmbalagens] = useState<Embalagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingEmbalagem, setEditingEmbalagem] = useState<Embalagem | null>(null);
  const [formData, setFormData] = useState<EmbalagemInput>({
    codigo: "",
    nome: "",
    descricao: "",
    altura: 0,
    largura: 0,
    comprimento: 0,
    preco_unitario: 0,
    estoque_atual: 0,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchEmbalagens = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/embalagens");
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Erro ao carregar embalagens");
      }
      setEmbalagens(json.embalagens || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar embalagens";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmbalagens();
  }, [fetchEmbalagens]);

  const filteredEmbalagens = useMemo(() => {
    if (!searchTerm.trim()) return embalagens;
    const term = searchTerm.toLowerCase();
    return embalagens.filter(
      (e) =>
        e.codigo.toLowerCase().includes(term) ||
        e.nome.toLowerCase().includes(term) ||
        (e.descricao?.toLowerCase().includes(term) ?? false)
    );
  }, [embalagens, searchTerm]);

  const metrics = useMemo(() => {
    const total = embalagens.length;
    const valorTotalEstoque = embalagens.reduce(
      (sum, e) => sum + Number(e.preco_unitario) * Number(e.estoque_atual),
      0
    );
    const estoqueTotal = embalagens.reduce((sum, e) => sum + Number(e.estoque_atual), 0);
    const semEstoque = embalagens.filter((e) => Number(e.estoque_atual) === 0).length;

    return { total, valorTotalEstoque, estoqueTotal, semEstoque };
  }, [embalagens]);

  const openCreateModal = () => {
    setEditingEmbalagem(null);
    setFormData({
      codigo: "",
      nome: "",
      descricao: "",
      altura: 0,
      largura: 0,
      comprimento: 0,
      preco_unitario: 0,
      estoque_atual: 0,
    });
    setSubmitError(null);
    setShowModal(true);
  };

  const openEditModal = (embalagem: Embalagem) => {
    setEditingEmbalagem(embalagem);
    setFormData({
      codigo: embalagem.codigo,
      nome: embalagem.nome,
      descricao: embalagem.descricao || "",
      altura: Number(embalagem.altura),
      largura: Number(embalagem.largura),
      comprimento: Number(embalagem.comprimento),
      preco_unitario: Number(embalagem.preco_unitario),
      estoque_atual: Number(embalagem.estoque_atual),
    });
    setSubmitError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingEmbalagem(null);
    setSubmitError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      const url = editingEmbalagem
        ? `/api/embalagens/${editingEmbalagem.id}`
        : "/api/embalagens";
      const method = editingEmbalagem ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Erro ao salvar embalagem");
      }

      await fetchEmbalagens();
      closeModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar embalagem";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, nome: string) => {
    if (!confirm(`Tem certeza que deseja excluir a embalagem "${nome}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/embalagens/${id}`, { method: "DELETE" });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Erro ao deletar embalagem");
      }

      await fetchEmbalagens();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao deletar embalagem";
      alert(message);
    }
  };

  return (
    <AppLayout title="Embalagens">
      <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
              Embalagens
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Gerencie suas embalagens e caixas
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchEmbalagens}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-60"
            >
              <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/30 hover:shadow-xl hover:shadow-orange-500/40 transition-all"
            >
              <Plus className="w-4 h-4" />
              Nova Embalagem
            </button>
          </div>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            icon={Package}
            label="Total de Embalagens"
            value={metrics.total.toString()}
            color="blue"
            loading={loading}
          />
          <MetricCard
            icon={Box}
            label="Estoque Total"
            value={formatNumber(metrics.estoqueTotal)}
            color="green"
            loading={loading}
          />
          <MetricCard
            icon={AlertCircle}
            label="Sem Estoque"
            value={metrics.semEstoque.toString()}
            color="red"
            loading={loading}
          />
          <MetricCard
            icon={Package}
            label="Valor em Estoque"
            value={formatCurrency(metrics.valorTotalEstoque)}
            color="purple"
            loading={loading}
          />
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por código, nome ou descrição..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
          />
        </div>

        {/* Erro */}
        {error && (
          <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900 dark:text-red-100">Erro</p>
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Tabela */}
        {loading && embalagens.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCcw className="w-8 h-8 animate-spin text-orange-600" />
          </div>
        ) : filteredEmbalagens.length === 0 ? (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-12 text-center">
            <Package className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">
              {searchTerm
                ? "Nenhuma embalagem encontrada com esse termo"
                : "Nenhuma embalagem cadastrada"}
            </p>
            {!searchTerm && (
              <button
                onClick={openCreateModal}
                className="mt-4 inline-flex items-center gap-2 text-orange-600 hover:text-orange-700 font-semibold"
              >
                <Plus className="w-4 h-4" />
                Cadastrar primeira embalagem
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Código
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Dimensões (cm)
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Preço Unit.
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Estoque
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {filteredEmbalagens.map((embalagem) => (
                    <tr
                      key={embalagem.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-mono text-sm text-slate-900 dark:text-slate-100">
                          {embalagem.codigo}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {embalagem.nome}
                          </div>
                          {embalagem.descricao && (
                            <div className="text-sm text-slate-600 dark:text-slate-400 truncate max-w-xs">
                              {embalagem.descricao}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-700 dark:text-slate-300">
                          {formatNumber(Number(embalagem.altura))} x{" "}
                          {formatNumber(Number(embalagem.largura))} x{" "}
                          {formatNumber(Number(embalagem.comprimento))}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {formatCurrency(Number(embalagem.preco_unitario))}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-semibold ${
                            Number(embalagem.estoque_atual) === 0
                              ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                              : Number(embalagem.estoque_atual) < 10
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                              : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          }`}
                        >
                          {formatNumber(Number(embalagem.estoque_atual))}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(embalagem)}
                            className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(embalagem.id, embalagem.nome)}
                            className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-all"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {editingEmbalagem ? "Editar Embalagem" : "Nova Embalagem"}
              </h2>
              <button
                onClick={closeModal}
                className="p-2 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {submitError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 p-3">
                  <p className="text-sm text-red-700 dark:text-red-300">{submitError}</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Código *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.codigo}
                    onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                    placeholder="Ex: CX-001"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Nome *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                    placeholder="Ex: Caixa Pequena"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Descrição
                </label>
                <textarea
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all resize-none"
                  placeholder="Descrição detalhada da embalagem..."
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Altura (cm) *
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    value={formData.altura}
                    onChange={(e) => setFormData({ ...formData, altura: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Largura (cm) *
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    value={formData.largura}
                    onChange={(e) => setFormData({ ...formData, largura: Number(e.target.value) })}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Comprimento (cm) *
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    value={formData.comprimento}
                    onChange={(e) =>
                      setFormData({ ...formData, comprimento: Number(e.target.value) })
                    }
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Preço Unitário (R$) *
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    value={formData.preco_unitario}
                    onChange={(e) =>
                      setFormData({ ...formData, preco_unitario: Number(e.target.value) })
                    }
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Estoque Atual *
                  </label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    min="0"
                    value={formData.estoque_atual}
                    onChange={(e) =>
                      setFormData({ ...formData, estoque_atual: Number(e.target.value) })
                    }
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-200 dark:border-slate-700 mt-6">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="px-6 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 font-semibold transition-all disabled:opacity-60 text-base"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 text-white font-bold text-base shadow-xl shadow-orange-500/40 hover:shadow-2xl hover:shadow-orange-500/50 hover:scale-105 transition-all disabled:opacity-60 disabled:hover:scale-100"
                >
                  {submitting ? (
                    <>
                      <RefreshCcw className="w-5 h-5 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>{editingEmbalagem ? "Salvar Alterações" : "Criar Embalagem"}</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

interface MetricCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: "blue" | "green" | "red" | "purple";
  loading?: boolean;
}

function MetricCard({ icon: Icon, label, value, color, loading }: MetricCardProps) {
  const colorClasses = {
    blue: "from-blue-500 to-cyan-500",
    green: "from-green-500 to-emerald-500",
    red: "from-red-500 to-rose-500",
    purple: "from-purple-500 to-pink-500",
  };

  const bgClasses = {
    blue: "bg-blue-50 dark:bg-blue-500/10",
    green: "bg-green-50 dark:bg-green-500/10",
    red: "bg-red-50 dark:bg-red-500/10",
    purple: "bg-purple-50 dark:bg-purple-500/10",
  };

  const iconClasses = {
    blue: "text-blue-600 dark:text-blue-400",
    green: "text-green-600 dark:text-green-400",
    red: "text-red-600 dark:text-red-400",
    purple: "text-purple-600 dark:text-purple-400",
  };

  if (loading) {
    return (
      <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 animate-pulse">
        <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-20 mb-3"></div>
        <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-32"></div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 hover:shadow-lg transition-all duration-300">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{label}</span>
        <div className={`p-2.5 rounded-xl ${bgClasses[color]}`}>
          <Icon className={`w-5 h-5 ${iconClasses[color]}`} />
        </div>
      </div>
      <div className={`text-2xl font-bold bg-gradient-to-r ${colorClasses[color]} bg-clip-text text-transparent`}>
        {value}
      </div>
    </div>
  );
}
