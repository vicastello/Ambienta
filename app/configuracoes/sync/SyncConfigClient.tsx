"use client";

import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/errors";
import type { SyncOverviewResponse } from "@/app/api/admin/sync/overview/route";
import type { SyncProdutosResult } from "@/src/lib/sync/produtos";
import type { FreteEnrichmentResult } from "@/lib/freteEnricher";

const OVERVIEW_URL = "/api/admin/sync/overview";
const SYNC_PEDIDOS_URL = "/api/tiny/sync";
const ENRICH_BG_URL = "/api/tiny/sync/enrich-background";
const SYNC_PRODUTOS_URL = "/api/produtos/sync";

const glass = "glass-panel glass-tint rounded-3xl border border-white/20 p-6 mb-8";
const accent = "text-[#009ca6] border-[#009ca6]";

type SyncPedidosResponse = {
  result?: {
    totalOrders?: number;
  };
};

export default function SyncConfigClient() {
  const [overview, setOverview] = useState<SyncOverviewResponse | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [errOverview, setErrOverview] = useState<string | null>(null);

  const [diasPedidos, setDiasPedidos] = useState(30);
  const [loadingPedidos, setLoadingPedidos] = useState(false);
  const [resultPedidos, setResultPedidos] = useState<SyncPedidosResponse | null>(null);
  const [errPedidos, setErrPedidos] = useState<string | null>(null);

  const [loadingEnrich, setLoadingEnrich] = useState(false);
  const [resultEnrich, setResultEnrich] = useState<FreteEnrichmentResult | null>(null);
  const [errEnrich, setErrEnrich] = useState<string | null>(null);

  const [diasProdutos, setDiasProdutos] = useState(30);
  const [loadingProdutos, setLoadingProdutos] = useState(false);
  const [resultProdutos, setResultProdutos] = useState<SyncProdutosResult | null>(null);
  const [errProdutos, setErrProdutos] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true);
    setErrOverview(null);
    try {
      const res = await fetch(OVERVIEW_URL);
      if (!res.ok) throw new Error("Erro ao buscar overview");
      const data = (await res.json()) as SyncOverviewResponse;
      setOverview(data);
    } catch (error: unknown) {
      setErrOverview(getErrorMessage(error));
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  const syncPedidos = async () => {
    setLoadingPedidos(true);
    setErrPedidos(null);
    setResultPedidos(null);
    try {
      const res = await fetch(SYNC_PEDIDOS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "recent", diasRecentes: diasPedidos }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Erro ao sincronizar pedidos");
      setResultPedidos(data);
      void fetchOverview();
    } catch (error: unknown) {
      setErrPedidos(getErrorMessage(error));
    } finally {
      setLoadingPedidos(false);
    }
  };

  const enrichBackground = async () => {
    setLoadingEnrich(true);
    setErrEnrich(null);
    setResultEnrich(null);
    try {
      const res = await fetch(ENRICH_BG_URL, {
        method: "GET",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao rodar enrich");
      setResultEnrich(data as FreteEnrichmentResult);
      void fetchOverview();
    } catch (error: unknown) {
      setErrEnrich(getErrorMessage(error));
    } finally {
      setLoadingEnrich(false);
    }
  };

  const syncProdutos = async () => {
    setLoadingProdutos(true);
    setErrProdutos(null);
    setResultProdutos(null);
    try {
      const res = await fetch(SYNC_PRODUTOS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "recent", diasRecentes: diasProdutos }),
      });
      const data = (await res.json()) as SyncProdutosResult | { message?: string };
      if (!res.ok) {
        const message = typeof (data as { message?: string }).message === "string"
          ? (data as { message?: string }).message
          : "Erro ao sincronizar produtos";
        throw new Error(message);
      }
      setResultProdutos(data as SyncProdutosResult);
      void fetchOverview();
    } catch (error: unknown) {
      setErrProdutos(getErrorMessage(error));
    } finally {
      setLoadingProdutos(false);
    }
  };

  const remainingEnrich = resultEnrich?.remaining ?? 0;

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-start py-12 px-2 bg-gradient-to-br from-[#e0f7fa] via-[#f5fafd] to-[#e0f7fa]">
      <h1 className="text-3xl font-bold mb-8 text-[#009ca6]">Sincronização Tiny / Ambienta</h1>
      <div className="w-full max-w-3xl space-y-8">
        {errOverview && (
          <div className="text-red-600 text-sm text-center">{errOverview}</div>
        )}
        {loadingOverview && (
          <div className="text-sm text-gray-600 text-center">Atualizando overview...</div>
        )}
        <div className={glass}>
          <h2 className="text-xl font-medium mb-2">Pedidos Tiny</h2>
          <div className="flex items-end gap-4 mb-4">
            <div>
              <label className="block text-sm mb-1">Últimos X dias</label>
              <input
                type="number"
                min={1}
                max={365}
                value={diasPedidos}
                onChange={(e) => setDiasPedidos(Number(e.target.value))}
                className={`w-24 px-2 py-1 rounded border ${accent} focus:outline-none focus:ring-2 focus:ring-[#009ca6] bg-white/70`}
              />
            </div>
            <button
              onClick={syncPedidos}
              disabled={loadingPedidos}
              className="px-4 py-2 rounded-lg font-semibold bg-[#009ca6] text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {loadingPedidos ? "Sincronizando..." : "Sincronizar pedidos"}
            </button>
          </div>
          {errPedidos && <div className="text-red-600 mb-2">{errPedidos}</div>}
          {resultPedidos && (
            <div className="text-green-700 mb-2">
              Sincronização concluída!
              {resultPedidos?.result?.totalOrders
                ? ` Pedidos processados: ${resultPedidos.result.totalOrders}`
                : null}
            </div>
          )}
          <div className="text-sm text-gray-700 mt-2">
            <div>
              Total de pedidos: <span className="font-semibold">{overview?.orders?.total ?? "-"}</span>
            </div>
            <div>
              Primeira data: <span className="font-semibold">{overview?.orders?.firstDate ?? "-"}</span>
            </div>
            <div>
              Última data: <span className="font-semibold">{overview?.orders?.lastDate ?? "-"}</span>
            </div>
          </div>
        </div>

        <div className={glass}>
          <h2 className="text-xl font-medium mb-2">Enriquecimento (itens + frete)</h2>
          <div className="flex items-end gap-4 mb-4">
            <button
              onClick={enrichBackground}
              disabled={loadingEnrich}
              className="px-4 py-2 rounded-lg font-semibold bg-[#009ca6] text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {loadingEnrich ? "Processando..." : "Rodar enrich em background"}
            </button>
          </div>
          {errEnrich && <div className="text-red-600 mb-2">{errEnrich}</div>}
          {resultEnrich && (
            <div className="text-green-700 mb-2">
              Rodada concluída!
              {resultEnrich?.processed ? ` Pedidos processados: ${resultEnrich.processed}` : null}
            </div>
          )}
          <div className="text-sm text-gray-700 mt-2">
            Rode isso em sequência até o overview mostrar tudo ok.
            <br />
            {remainingEnrich > 0 && (
              <span className="text-[#009ca6]">
                Ainda faltam {remainingEnrich} pedidos para enriquecer.
              </span>
            )}
          </div>
        </div>

        <div className={glass}>
          <h2 className="text-xl font-medium mb-2">Produtos Tiny</h2>
          <div className="flex items-end gap-4 mb-4">
            <div>
              <label className="block text-sm mb-1">Últimos X dias</label>
              <input
                type="number"
                min={1}
                max={365}
                value={diasProdutos}
                onChange={(e) => setDiasProdutos(Number(e.target.value))}
                className={`w-24 px-2 py-1 rounded border ${accent} focus:outline-none focus:ring-2 focus:ring-[#009ca6] bg-white/70`}
              />
            </div>
            <button
              onClick={syncProdutos}
              disabled={loadingProdutos}
              className="px-4 py-2 rounded-lg font-semibold bg-[#009ca6] text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {loadingProdutos ? "Sincronizando..." : "Sincronizar produtos"}
            </button>
          </div>
          {errProdutos && <div className="text-red-600 mb-2">{errProdutos}</div>}
          {resultProdutos && <div className="text-green-700 mb-2">Sincronização concluída!</div>}
          <div className="text-sm text-gray-700 mt-2">
            <div>
              Total de produtos: <span className="font-semibold">{overview?.produtos?.total ?? "-"}</span>
            </div>
            <div>
              Última atualização: <span className="font-semibold">{overview?.produtos?.lastUpdatedAt ?? "-"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
