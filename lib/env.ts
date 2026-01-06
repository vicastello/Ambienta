const stripWrappingQuotes = (value: string) => {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

export const normalizeEnvValue = (value?: string) => {
  if (!value) return '';
  let normalized = stripWrappingQuotes(value);
  normalized = normalized.replace(/\\n/g, '').replace(/\\r/g, '').trim();
  return normalized;
};
