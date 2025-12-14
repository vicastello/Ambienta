'use client';

import { memo, useMemo, useState } from "react";
import {
  AlertCircle,
  Box,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  MoreVertical,
  Package,
  RefreshCcw,
} from "lucide-react";

import type { Produto } from "../types";
import { calculateDiscount, formatBRL, formatDeltaPercent, formatNumber } from "../utils";
import { ProdutoTrendChart } from "./ProdutoTrendChart";

const RECEITA_COLOR = "rgb(168, 85, 247)";
const QUANTIDADE_COLOR = "rgb(59, 130, 246)";

type BadgeInfo = {
  label: string;
  color: string;
};

type SituacaoInfo = BadgeInfo & {
  bg: string;
};

type ProdutoSeriePreset = "30d" | "month" | "year";

type ProdutoSeriePresetOption = {
  value: ProdutoSeriePreset;
  label: string;
};

type ProdutoTrendDatum = {
  label: string;
  receita: number;
  quantidade: number;
};

type ProdutoEmFocoCardProps = {
  produto: Produto;
  situacaoInfo: SituacaoInfo | null;
  tipoInfo: BadgeInfo | null;
  alertas: string[];
  estoqueFonteLabel: string;
  estoqueAtualizadoLabel: string;
  estoqueSku: {
    saldo: number | null;
    reservado: number | null;
    disponivel: number | null;
  };
  estoqueTotalPaiVariacoes: number | null;
  estoqueParaRuptura: number;
  mediaDiariaVendas: number;
  estoqueLiveLoading: boolean;
  estoqueLiveError: string | null;
  onRefreshEstoque: () => void;
  trendPreset: ProdutoSeriePreset;
  trendPresetOptions: ProdutoSeriePresetOption[];
  onTrendPresetChange: (preset: ProdutoSeriePreset) => void;
  trendLoading: boolean;
  trendError: string | null;
  trendData: ProdutoTrendDatum[];
  totalReceita: number;
  totalQuantidade: number;
  deltaReceitaPercent: number | null;
  deltaQuantidadePercent: number | null;
  melhorDiaLabel: string | null;
  melhorDiaReceita: number | null;
  melhorDiaQuantidade: number | null;
  consolidacaoMensagem: string | null;
  atualizando: boolean;
  atualizadoAgoraLabel: string | null;
  atualizacaoErro: string | null;
  onZoomImagem: (payload: { url: string; alt: string }) => void;
  onCopy: (text: string, onSuccess?: () => void) => Promise<void>;
  onNotify: (type: "success" | "error", message: string) => void;
};

const DeltaBadge = memo(function DeltaBadge({ value }: { value: number | null }) {
  if (value === null || Number.isNaN(value)) return null;
  const label = formatDeltaPercent(value);
  const positive = value > 0;
  const negative = value < 0;
  const tone = positive
    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100"
    : negative
      ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-100"
      : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
      {label}
    </span>
  );
});

const ProdutoEmFocoCardComponent = ({
  produto,
  situacaoInfo,
  tipoInfo,
  alertas,
  estoqueFonteLabel,
  estoqueAtualizadoLabel,
  estoqueSku,
  estoqueTotalPaiVariacoes,
  estoqueParaRuptura,
  mediaDiariaVendas,
  estoqueLiveLoading,
  estoqueLiveError,
  onRefreshEstoque,
  trendPreset,
  trendPresetOptions,
  onTrendPresetChange,
  trendLoading,
  trendError,
  trendData,
  totalReceita,
  totalQuantidade,
  deltaReceitaPercent,
  deltaQuantidadePercent,
  melhorDiaLabel,
  melhorDiaReceita,
  melhorDiaQuantidade,
  consolidacaoMensagem,
  atualizando,
  atualizadoAgoraLabel,
  atualizacaoErro,
  onZoomImagem,
  onCopy,
  onNotify,
}: ProdutoEmFocoCardProps) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const desconto = useMemo(
    () => calculateDiscount(produto.preco, produto.preco_promocional),
    [produto.preco, produto.preco_promocional]
  );
  const temPromo = desconto.percent > 0;
  const produtoPercentualDesconto = desconto.percent;
  const precoAtual = temPromo ? produto.preco_promocional : produto.preco;

  const produtoDiasParaZerar = useMemo(() => {
    if (!mediaDiariaVendas || mediaDiariaVendas <= 0) return null;
    const raw = estoqueParaRuptura / mediaDiariaVendas;
    if (!Number.isFinite(raw)) return null;
    return Math.max(0, Math.ceil(raw));
  }, [estoqueParaRuptura, mediaDiariaVendas]);
  const rupturaCritica = produtoDiasParaZerar !== null && produtoDiasParaZerar <= 3;
  const rupturaAtencao = produtoDiasParaZerar !== null && produtoDiasParaZerar > 3 && produtoDiasParaZerar <= 7;
  const rupturaStatus = produtoDiasParaZerar === null
    ? null
    : produtoDiasParaZerar <= 3
      ? { label: "Crítico", tone: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-100" }
      : produtoDiasParaZerar <= 7
        ? { label: "Atenção", tone: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-100" }
        : { label: "Ok", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100" };

  const disponivelSku = estoqueSku.disponivel ?? 0;
  const estoqueCriticoSku = disponivelSku > 0 && disponivelSku < 5;
  const embalagemCount = produto.embalagens?.length ?? 0;

  const melhorDiaResumo = useMemo(() => {
    if (!melhorDiaLabel || melhorDiaReceita == null) return "Sem melhor dia";
    const extraQtd = melhorDiaQuantidade != null ? ` · ${formatNumber(melhorDiaQuantidade)} un` : "";
    return `Melhor dia ${melhorDiaLabel} · ${formatBRL(melhorDiaReceita)}${extraQtd}`;
  }, [melhorDiaLabel, melhorDiaReceita, melhorDiaQuantidade]);

  const handleCopy = async (field: string, value: string, message: string) => {
    await onCopy(value, () => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1200);
      onNotify("success", message);
    });
  };

  return (
    <section className="glass-panel glass-tint product-hero rounded-[32px] border border-white/60 dark:border-white/10 overflow-hidden shadow-lg shadow-purple-500/5 min-w-0">
      <div className="p-4 md:p-6 space-y-5 min-w-0">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 lg:gap-6 items-start min-w-0">
          {/* Coluna esquerda: Identidade do produto */}
          <div className="min-w-0 space-y-4">
            <div className="flex items-start gap-3">
              <button
                type="button"
                className="w-16 h-16 rounded-3xl bg-white/80 dark:bg-white/5 border border-white/70 dark:border-white/10 flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-purple-500/40 transition-all disabled:opacity-60 disabled:hover:ring-0 p-0 shadow-none shrink-0"
                onClick={() => produto.imagem_url && onZoomImagem({ url: produto.imagem_url, alt: produto.nome })}
                title={produto.imagem_url ? "Clique para ampliar" : "Sem imagem"}
                aria-label={produto.imagem_url ? "Ampliar imagem do produto" : "Produto sem imagem"}
                disabled={!produto.imagem_url}
              >
                {produto.imagem_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={produto.imagem_url} alt={produto.nome} className="w-full h-full object-cover" />
                ) : (
                  <Package className="w-6 h-6 text-slate-400" />
                )}
              </button>

              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-300">
                    Produto em foco
                  </span>
                  {situacaoInfo && (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${situacaoInfo.bg} ${situacaoInfo.color}`}
                    >
                      {situacaoInfo.label}
                    </span>
                  )}
                  {tipoInfo && (
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${tipoInfo.color}`}
                    >
                      {tipoInfo.label}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-base md:text-lg font-semibold text-slate-900 dark:text-white leading-snug">
                    <span className="line-clamp-2">{produto.nome}</span>
                    <a
                      href={`https://erp.tiny.com.br/produto/${produto.id_produto_tiny}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-400 hover:text-slate-600 dark:text-slate-300"
                      title="Abrir no Tiny"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </h2>
                  <div className="mt-1 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-300">
                      {produto.fornecedor_nome ? (
                        <span className="truncate max-w-[240px]">{produto.fornecedor_nome}</span>
                      ) : (
                        <span>Fornecedor —</span>
                      )}
                      <span className="text-slate-300 dark:text-slate-600">·</span>
                      <span>{produto.unidade || "Un"}</span>
                    </div>
                    {produto.codigo ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopy("codigo", produto.codigo!, `${produto.codigo} copiado!`)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm group"
                          title="Copiar código"
                          aria-label={`Copiar código ${produto.codigo}`}
                        >
                          <span className="font-mono font-semibold text-sm text-slate-700 dark:text-slate-200">{produto.codigo}</span>
                          {copiedField === "codigo" ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 dark:opacity-70 transition-opacity" />
                          )}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600 dark:text-slate-300">
              {produto.gtin && (
                <button
                  type="button"
                  onClick={() => handleCopy("gtin", produto.gtin!, `GTIN ${produto.gtin} copiado!`)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 dark:bg-white/10 border border-white/60 dark:border-white/10 px-3 py-1.5 hover:bg-slate-200/80 dark:hover:bg-white/15 transition-all group shadow-none"
                  title="Copiar GTIN"
                  aria-label={`Copiar GTIN ${produto.gtin}`}
                >
                  <span className="font-semibold">GTIN {produto.gtin}</span>
                  {copiedField === "gtin" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 dark:opacity-70 transition-opacity" />
                  )}
                </button>
              )}
            </div>

            {alertas.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-amber-800 dark:text-amber-200">
                {alertas.map((info) => (
                  <span
                    key={info}
                    className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-500/15 px-2.5 py-1 font-semibold border border-amber-200/80 dark:border-amber-500/25"
                  >
                    <AlertCircle className="w-3 h-3" />
                    {info}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Coluna direita: Prioridade negócio */}
          <div className="min-w-0 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500 dark:text-slate-300">
                  Preço
                </p>
                <div className="mt-1 flex items-center gap-3 min-w-0">
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`text-2xl sm:text-3xl font-bold truncate ${
                        temPromo ? "text-emerald-700 dark:text-emerald-200" : "text-slate-900 dark:text-white"
                      }`}
                    >
                      {formatBRL(precoAtual)}
                    </span>
                    {temPromo ? (
                      <span className="text-sm font-semibold text-slate-500 line-through dark:text-slate-400">{formatBRL(produto.preco)}</span>
                    ) : null}
                    {temPromo && (
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-300">
                        Economia de <span className="font-semibold">{formatBRL(desconto.value)}</span>
                      </p>
                    )}
                  </div>

                  {temPromo && (
                    <span className="self-center inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100 px-2.5 py-1 text-sm font-semibold">
                      -{produtoPercentualDesconto}%
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onRefreshEstoque}
                  className="inline-flex items-center justify-center rounded-full w-9 h-9 p-0 bg-white/80 dark:bg-white/5 border border-white/70 dark:border-white/10 text-slate-700 dark:text-slate-100 hover:bg-white dark:hover:bg-white/10 transition shadow-none"
                  title="Atualizar estoque"
                  aria-label="Atualizar estoque"
                  disabled={estoqueLiveLoading}
                >
                  <RefreshCcw className={`w-4 h-4 ${estoqueLiveLoading ? "animate-spin" : ""}`} />
                </button>

                <button
                  type="button"
                  onClick={() => produto.codigo && handleCopy("codigo", produto.codigo, `Código ${produto.codigo} copiado!`)}
                  className="inline-flex items-center justify-center rounded-full w-9 h-9 p-0 bg-white/80 dark:bg-white/5 border border-white/70 dark:border-white/10 text-slate-700 dark:text-slate-100 hover:bg-white dark:hover:bg-white/10 transition shadow-none disabled:opacity-60"
                  title={produto.codigo ? "Copiar código" : "Sem código"}
                  aria-label={produto.codigo ? "Copiar código" : "Sem código"}
                  disabled={!produto.codigo}
                >
                  {copiedField === "codigo" ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>

                <a
                  href={`https://erp.tiny.com.br/produto/${produto.id_produto_tiny}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-full w-9 h-9 p-0 bg-purple-100 dark:bg-purple-500/20 border border-purple-200/80 dark:border-purple-500/30 text-purple-700 dark:text-purple-200 hover:bg-purple-200/80 dark:hover:bg-purple-500/30 transition shadow-none"
                  title="Abrir no Tiny"
                  aria-label="Abrir no Tiny"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>

                {/**
                 * Placeholder: se no futuro existir handler/link dedicado diferente,
                 * colocar aqui sem alterar a lógica de fetch.
                 */}
              </div>
            </div>

            <div className="rounded-2xl bg-white/85 dark:bg-white/5 border border-white/70 dark:border-white/10 p-3 md:p-4 overflow-hidden min-w-0 min-h-0 h-full flex flex-col lg:flex-row gap-4 lg:items-stretch">
              <div className="min-w-0 lg:flex-none lg:w-[70%] h-full">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">Trend de vendas</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-300 truncate">{melhorDiaResumo}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RECEITA_COLOR }} />
                      Receita
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: QUANTIDADE_COLOR }} />
                      Unidades
                    </span>
                  </div>
                </div>

                <div className="inline-flex rounded-full bg-white/80 dark:bg-white/5 border border-white/70 dark:border-white/10 p-1 shadow-none shrink-0">
                  {trendPresetOptions.map((opt) => {
                    const active = trendPreset === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => onTrendPresetChange(opt.value)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-full transition shadow-none ${
                          active
                            ? "bg-purple-600 text-white"
                            : "bg-transparent text-slate-600 hover:text-slate-900 hover:bg-white/70 dark:text-slate-200 dark:hover:bg-white/10"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 flex-1 min-h-0">
                {trendLoading ? (
                  <div className="h-48 sm:h-64 lg:h-full rounded-2xl bg-slate-100/80 dark:bg-white/5 animate-pulse border border-white/70 dark:border-white/10" />
                ) : trendError ? (
                  <p className="text-xs font-semibold text-rose-600 dark:text-rose-200">{trendError}</p>
                ) : trendData.length ? (
                  <ProdutoTrendChart data={trendData} containerClassName="h-48 sm:h-64 lg:h-full min-w-0" />
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-300">Sem vendas registradas.</p>
                )}
              </div>
              </div>

            {/* metrics grid moved into right column for proper 70/30 layout */}

            <div className="min-w-0 min-h-0 lg:flex-none lg:w-[30%] h-full grid gap-3">

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/95 dark:bg-slate-900/60 border border-white/60 dark:border-white/10 p-3 min-h-0 flex flex-col justify-between h-full">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Disponível</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{formatNumber(estoqueSku.disponivel)}</p>
                  <p className="text-[11px] text-slate-500">Reservado {formatNumber(estoqueSku.reservado ?? 0)} · Saldo {formatNumber(estoqueSku.saldo ?? 0)}</p>
                </div>
                <div className="rounded-2xl bg-white/95 dark:bg-slate-900/60 border border-white/60 dark:border-white/10 p-3 min-h-0 flex flex-col justify-between h-full">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Ruptura</p>
                  <p className="text-xl font-semibold text-emerald-700 dark:text-emerald-200">{produtoDiasParaZerar === null ? 'Sem giro' : produtoDiasParaZerar}</p>
                  <p className="text-[11px] text-slate-500">Média {formatNumber(mediaDiariaVendas)} un/dia</p>
                </div>
                <div className="rounded-2xl bg-white/95 dark:bg-slate-900/60 border border-white/60 dark:border-white/10 p-3 min-h-0 flex flex-col justify-between h-full">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Receita</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-lg font-semibold text-slate-900 dark:text-white">{formatBRL(totalReceita)}</span>
                  </div>
                </div>
                <div className="rounded-2xl bg-white/95 dark:bg-slate-900/60 border border-white/60 dark:border-white/10 p-3 min-h-0 flex flex-col justify-between h-full">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Unidades</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-lg font-semibold text-slate-900 dark:text-white">{formatNumber(totalQuantidade)}</span>
                  </div>
                </div>
              </div>

              <details className="group rounded-2xl bg-white/80 dark:bg-white/5 border border-white/70 dark:border-white/10 p-3">
                <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-2xl bg-white/80 dark:bg-white/10 border border-white/60 dark:border-white/10">
                      <Box className="w-4 h-4 text-blue-600 dark:text-blue-300" />
                    </span>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Embalagens</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-300">
                      {embalagemCount ? `${embalagemCount} vinculada${embalagemCount === 1 ? "" : "s"}` : "Nenhuma"}
                    </span>
                    <ChevronDown className="w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform" />
                  </div>
                </summary>

                <div className="mt-3 rounded-2xl glass-panel glass-tint border border-white/60 dark:border-white/10 p-3 md:p-4">
                  <div className="flex flex-col gap-2">
            {produto.embalagens?.length ? (
              produto.embalagens.map((emb) => (
                <div
                  key={emb.embalagem_id}
                  className="flex items-center justify-between gap-2 rounded-2xl bg-white/80 dark:bg-white/5 border border-white/70 dark:border-white/10 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Box className="w-4 h-4 text-blue-600 dark:text-blue-300" />
                      <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {emb.embalagem?.nome || "Embalagem"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-300">
                      {emb.embalagem?.codigo ? `Código ${emb.embalagem.codigo}` : "Sem código"} · {emb.quantidade}x
                    </p>
                  </div>
                  {emb.embalagem?.codigo && (
                    <button
                      type="button"
                      onClick={() => handleCopy("embalagem", emb.embalagem!.codigo, `Código ${emb.embalagem?.codigo} copiado!`)}
                      className="inline-flex items-center justify-center rounded-full bg-slate-100/80 dark:bg-white/10 border border-white/60 dark:border-white/10 w-9 h-9 p-0 hover:bg-slate-200/80 dark:hover:bg-white/15 transition shadow-none"
                      title="Copiar código da embalagem"
                      aria-label={`Copiar código da embalagem ${emb.embalagem.codigo}`}
                    >
                      <Copy className="w-4 h-4 text-slate-600 dark:text-slate-200" />
                    </button>
                  )}
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-slate-100/70 dark:bg-white/5 border border-white/70 dark:border-white/10 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
                Nenhuma embalagem vinculada.
              </div>
            )}
                  </div>
                </div>
              </details>

              {/* Ações removidas per request: Editar / Pedidos / Movimentações */}
            </div>

            <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-300">
              <div className="flex flex-wrap items-center gap-2">
                {consolidacaoMensagem && <span className="font-semibold">{consolidacaoMensagem}</span>}
                {atualizacaoErro && <span className="font-semibold text-rose-600 dark:text-rose-200">{atualizacaoErro}</span>}
                {(consolidacaoMensagem || atualizacaoErro) && <span className="text-slate-300 dark:text-slate-600">·</span>}
                <span>{estoqueFonteLabel} • {estoqueAtualizadoLabel}</span>
              </div>
              <div className="flex items-center gap-2">
                {atualizando ? (
                  <span className="inline-flex items-center gap-2 font-semibold">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600 dark:text-purple-300" />
                    Atualizando...
                  </span>
                ) : atualizadoAgoraLabel ? (
                  <span className="font-semibold">{atualizadoAgoraLabel}</span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </section>
  );
};

export const ProdutoEmFocoCard = memo(ProdutoEmFocoCardComponent);
