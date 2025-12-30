/**
 * Test Smart Tagger Rule Matching
 * Run: npx ts-node scripts/testSmartTagger.ts
 */

// --- Copy relevant functions from smartTagger.ts ---

type TagRule = {
    pattern: string | RegExp;
    tags: string[];
    priority: number;
};

function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function applySmartTags(
    transactionDescription: string,
    transactionType?: string,
    customRules: TagRule[] = []
) {
    const allTags = new Set<string>();
    const matchedRules: string[] = [];

    const normalizedDesc = normalizeText(transactionDescription);
    const normalizedType = transactionType ? normalizeText(transactionType) : '';
    const fullText = `${normalizedDesc} ${normalizedType}`;

    console.log('  fullText:', fullText);

    // Apply custom rules
    for (const rule of customRules) {
        const pattern = typeof rule.pattern === 'string'
            ? new RegExp(rule.pattern, 'i')
            : rule.pattern;

        console.log('  Testing pattern:', pattern.source);
        console.log('  Match result:', pattern.test(fullText));

        if (pattern.test(fullText)) {
            rule.tags.forEach(tag => allTags.add(tag));
            matchedRules.push(pattern.source);
        }
    }

    return {
        tags: Array.from(allTags),
        matchedRules,
    };
}

function convertDbRulesToTagRules(dbRules: Array<{
    transaction_type_pattern: string;
    tags: string[];
    priority: number;
}>): TagRule[] {
    return dbRules.map(rule => ({
        pattern: new RegExp(rule.transaction_type_pattern, 'i'),
        tags: rule.tags,
        priority: rule.priority,
    }));
}

// --- Test ---

const dbRules = [
    { transaction_type_pattern: '.*Recarga por compra de ADS.*', tags: ['marketing'], priority: 50 },
    { transaction_type_pattern: '.*Saque.*', tags: ['saque', 'retirada'], priority: 50 },
];

const customRules = convertDbRulesToTagRules(dbRules);
console.log('Custom Rules:', JSON.stringify(customRules.map(r => ({ pattern: (r.pattern as RegExp).source, tags: r.tags })), null, 2));

const testCases = [
    { desc: 'Recarga por compra de ADS', type: '' },
    { desc: 'Saque para conta bancária', type: '' },
    { desc: 'Saque', type: 'Saque' },
    { desc: 'Renda do pedido #123', type: 'Renda do pedido' },
];

console.log('\n=== Testing Rule Matching ===\n');

testCases.forEach(tc => {
    console.log('--- Input ---');
    console.log('Description:', tc.desc);
    console.log('Type:', tc.type);
    const result = applySmartTags(tc.desc, tc.type, customRules);
    console.log('Result Tags:', result.tags);
    console.log('Matched Rules:', result.matchedRules);
    console.log('');
});
