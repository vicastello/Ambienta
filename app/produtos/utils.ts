export type DiscountInfo = {
  percent: number;
  original: number | null;
  atual: number | null;
};

export const calculateDiscount = (
  preco: number | null,
  precoPromocional: number | null
): DiscountInfo => {
  const original = typeof preco === "number" && Number.isFinite(preco) ? preco : null;
  const atual = typeof precoPromocional === "number" && Number.isFinite(precoPromocional) ? precoPromocional : null;

  if (original == null || atual == null) return { percent: 0, original, atual };
  if (original <= 0) return { percent: 0, original, atual };
  if (atual >= original) return { percent: 0, original, atual };

  const percent = Math.max(0, Math.round((1 - atual / original) * 100));
  return { percent, original, atual };
};

export const formatBRL = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
};

export const formatNumber = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
};

export const formatDeltaPercent = (value: number) => {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(0)}%`;
};
