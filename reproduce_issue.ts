import { calculateMercadoLivreImpact } from './app/configuracoes/taxas-marketplace/lib/calculations';
import { MERCADO_LIVRE_DEFAULTS } from './app/configuracoes/taxas-marketplace/lib/defaults';

const config = MERCADO_LIVRE_DEFAULTS;

const testPrices = [10, 50, 78, 79, 80, 100, 139, 140, 150];

console.log("Config Tiers:", JSON.stringify(config.fixed_cost_tiers, null, 2));

testPrices.forEach(price => {
    const impact = calculateMercadoLivreImpact(config, price);
    console.log(`Price: ${price}, Fixed Cost: ${impact.breakdown?.fixedCost}, Total Fees: ${impact.fees}`);
});
