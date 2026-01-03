export const RULE_MARKETPLACES = [
    { id: 'shopee', label: 'Shopee' },
    { id: 'mercado_livre', label: 'Mercado Livre' },
    { id: 'magalu', label: 'Magalu' },
] as const;

export type RuleMarketplace = (typeof RULE_MARKETPLACES)[number]['id'];

export const DEFAULT_RULE_MARKETPLACES: RuleMarketplace[] = RULE_MARKETPLACES.map((mp) => mp.id);

export const RULE_MARKETPLACE_LABELS = RULE_MARKETPLACES.reduce<Record<string, string>>((acc, mp) => {
    acc[mp.id] = mp.label;
    return acc;
}, {});

export function normalizeMarketplaces(input?: string[] | string | null): string[] {
    if (!input || (Array.isArray(input) && input.length === 0)) {
        return [...DEFAULT_RULE_MARKETPLACES];
    }

    const values = Array.isArray(input) ? input : [input];
    const normalized = values
        .map((value) => String(value).trim().toLowerCase())
        .filter((value) => value.length > 0);

    if (normalized.includes('all')) {
        return [...DEFAULT_RULE_MARKETPLACES];
    }

    const unique = Array.from(new Set(normalized));
    const orderedKnown = DEFAULT_RULE_MARKETPLACES.filter((mp) => unique.includes(mp));
    const unknown = unique.filter((mp) => !DEFAULT_RULE_MARKETPLACES.includes(mp as RuleMarketplace));

    return [...orderedKnown, ...unknown];
}

export function isAllMarketplaces(input?: string[] | null): boolean {
    if (!input || input.length === 0) return true;
    return DEFAULT_RULE_MARKETPLACES.every((mp) => input.includes(mp));
}
