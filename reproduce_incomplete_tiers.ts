import { calculateMercadoLivreImpact } from './app/configuracoes/taxas-marketplace/lib/calculations';
import { MERCADO_LIVRE_DEFAULTS } from './app/configuracoes/taxas-marketplace/lib/defaults';

// The user's actual problematic config from debug output
const userConfig = {
    ...MERCADO_LIVRE_DEFAULTS,
    fixed_cost_tiers: [
        { "max": 12.5, "cost": 3.125 },
        { "max": 29, "min": 12.5, "cost": 6.25 },
        { "max": 50, "min": 29, "cost": 6.5 },
        { "max": 79, "min": 50, "cost": 6.75 }
    ]
};

const price = 100;
const impact = calculateMercadoLivreImpact(userConfig, price);

console.log(`With user tiers - Price: ${price}`);
console.log(`Fixed Cost: ${impact.breakdown?.fixedCost}`);
console.log(`Matching tiers for > 79? ${userConfig.fixed_cost_tiers.some(t => !t.max || t.max > 79)}`);
