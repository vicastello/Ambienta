export const formatFornecedorNome = (input: string | null | undefined): string => {
  if (!input) return '';
  const trimmed = input.trim();
  if (!trimmed) return '';
  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((token) => (token ? token[0]?.toUpperCase() + token.slice(1) : ''))
    .join(' ');
};
