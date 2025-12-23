// Consistent tag colors and styles for the entire app

// Normalize tag name: lowercase, remove accents for matching
function normalizeTagName(tag: string | null | undefined): string {
    if (!tag) return '';
    return tag
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ''); // Remove accents
}

// Display name: ensure lowercase
export function formatTagName(tag: string | null | undefined): string {
    if (!tag) return '';
    return tag.toLowerCase();
}

// Generate a consistent color based on tag name (hash-based)
export function getTagColor(tagName: string | null | undefined): { bg: string; text: string; border: string } {
    // Default color for null/undefined
    if (!tagName) {
        return {
            bg: 'bg-slate-100 dark:bg-slate-900/30',
            text: 'text-slate-700 dark:text-slate-300',
            border: 'border-slate-200 dark:border-slate-800'
        };
    }
    // Predefined colors for common tags (keys without accents for matching)
    const predefinedColors: Record<string, { bg: string; text: string; border: string }> = {
        'reembolso': {
            bg: 'bg-rose-100 dark:bg-rose-900/30',
            text: 'text-rose-700 dark:text-rose-300',
            border: 'border-rose-200 dark:border-rose-800'
        },
        'devolucao': {
            bg: 'bg-orange-100 dark:bg-orange-900/30',
            text: 'text-orange-700 dark:text-orange-300',
            border: 'border-orange-200 dark:border-orange-800'
        },
        'ajuste': {
            bg: 'bg-amber-100 dark:bg-amber-900/30',
            text: 'text-amber-700 dark:text-amber-300',
            border: 'border-amber-200 dark:border-amber-800'
        },
        'marketing': {
            bg: 'bg-purple-100 dark:bg-purple-900/30',
            text: 'text-purple-700 dark:text-purple-300',
            border: 'border-purple-200 dark:border-purple-800'
        },
        'frete': {
            bg: 'bg-blue-100 dark:bg-blue-900/30',
            text: 'text-blue-700 dark:text-blue-300',
            border: 'border-blue-200 dark:border-blue-800'
        },
        'comissao': {
            bg: 'bg-indigo-100 dark:bg-indigo-900/30',
            text: 'text-indigo-700 dark:text-indigo-300',
            border: 'border-indigo-200 dark:border-indigo-800'
        },
        'promocao': {
            bg: 'bg-pink-100 dark:bg-pink-900/30',
            text: 'text-pink-700 dark:text-pink-300',
            border: 'border-pink-200 dark:border-pink-800'
        },
        'cupom': {
            bg: 'bg-green-100 dark:bg-green-900/30',
            text: 'text-green-700 dark:text-green-300',
            border: 'border-green-200 dark:border-green-800'
        },
        'taxa': {
            bg: 'bg-red-100 dark:bg-red-900/30',
            text: 'text-red-700 dark:text-red-300',
            border: 'border-red-200 dark:border-red-800'
        },
        'afiliado': {
            bg: 'bg-violet-100 dark:bg-violet-900/30',
            text: 'text-violet-700 dark:text-violet-300',
            border: 'border-violet-200 dark:border-violet-800'
        },
    };

    // Normalize tag for matching (removes accents)
    const normalizedTag = normalizeTagName(tagName);

    // Check for predefined colors (case-insensitive, partial match)
    for (const [key, value] of Object.entries(predefinedColors)) {
        if (normalizedTag.includes(key)) {
            return value;
        }
    }

    // Generate color based on string hash for consistency
    const colors = [
        { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-200 dark:border-cyan-800' },
        { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-200 dark:border-teal-800' },
        { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
        { bg: 'bg-lime-100 dark:bg-lime-900/30', text: 'text-lime-700 dark:text-lime-300', border: 'border-lime-200 dark:border-lime-800' },
        { bg: 'bg-sky-100 dark:bg-sky-900/30', text: 'text-sky-700 dark:text-sky-300', border: 'border-sky-200 dark:border-sky-800' },
        { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-200 dark:border-violet-800' },
        { bg: 'bg-fuchsia-100 dark:bg-fuchsia-900/30', text: 'text-fuchsia-700 dark:text-fuchsia-300', border: 'border-fuchsia-200 dark:border-fuchsia-800' },
    ];

    // Simple hash function (uses normalized tag for consistency)
    let hash = 0;
    for (let i = 0; i < normalizedTag.length; i++) {
        hash = ((hash << 5) - hash) + normalizedTag.charCodeAt(i);
        hash = hash & hash; // Convert to 32bit integer
    }

    return colors[Math.abs(hash) % colors.length];
}

// Get CSS class string for a tag
export function getTagClasses(tagName: string, includeBase = true): string {
    const colors = getTagColor(tagName);
    const base = includeBase ? 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ' : '';
    return `${base}${colors.bg} ${colors.text}`;
}
