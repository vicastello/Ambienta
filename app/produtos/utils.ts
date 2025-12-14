export const formatBRL = (value: number | null) => {
  if (value === null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
};

export const formatNumber = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return "—";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
};

export const formatDeltaPercent = (delta?: number | null) => {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return "—";
  return `${delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} ${Math.abs(delta).toFixed(0)}%`;
};

export const calculateDiscount = (preco: number | null, precoPromocional: number | null): { percent: number; value: number } => {
  if (!preco || !precoPromocional || precoPromocional >= preco) {
    return { percent: 0, value: 0 };
  }
  const percent = Math.max(0, Math.round((1 - precoPromocional / preco) * 100));
  const value = preco - precoPromocional;
  return { percent, value };
};
