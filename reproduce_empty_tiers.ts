import { calculateMercadoLivreImpact } from './app/configuracoes/taxas-marketplace/lib/calculations';
import { MERCADO_LIVRE_DEFAULTS } from './app/configuracoes/taxas-marketplace/lib/defaults';

// Simulate loaded config with empty tiers (bad data)
const badConfig = {
    ...MERCADO_LIVRE_DEFAULTS,
    fixed_cost_tiers: []
};

const price = 100;
const impact = calculateMercadoLivreImpact(badConfig, price);

console.log(`With empty tiers - Price: ${price}`);
console.log(`Fixed Cost: ${impact.breakdown?.fixedCost}`);
console.log(`Total Fees: ${impact.fees}`);
