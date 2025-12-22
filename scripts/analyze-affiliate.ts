// Análise do pedido 251206NBQVBF56

const orderValue = 53.90; // discounted_price
const escrowAmount = 30.47;
const totalDeductions = orderValue - escrowAmount; // 23.43

console.log('=== Análise do Pedido 251206NBQVBF56 ===\n');
console.log('Valor do pedido:', orderValue);
console.log('Escrow amount:', escrowAmount);
console.log('Total deduzido:', totalDeductions);
console.log('');

// Sem o desconto de afiliado (6,76), as taxas normais seriam:
// Comissão+Campanha (23.5%) + Custo Fixo (4)
const commissionCampaign = orderValue * 0.235;
const fixedCost = 4;
const normalTaxes = commissionCampaign + fixedCost;
const normalExpectedNet = orderValue - normalTaxes;

console.log('=== Cálculo SEM afiliado ===');
console.log('Comissão+Campanha (23.5%):', commissionCampaign.toFixed(2));
console.log('Custo fixo:', fixedCost);
console.log('Total taxas normais:', normalTaxes.toFixed(2));
console.log('Net esperado normal:', normalExpectedNet.toFixed(2));
console.log('');

// Diferença entre o que seria e o que realmente foi pago
const affiliateFee = escrowAmount - normalExpectedNet;
console.log('=== Diferença ===');
console.log('Net normal:', normalExpectedNet.toFixed(2));
console.log('Escrow real:', escrowAmount);
console.log('Diferença (possível taxa afiliado):', affiliateFee.toFixed(2));
console.log('');

// Se o afiliado é R$6,76:
const affiliateReported = 6.76;
console.log('=== Verificação ===');
console.log('Taxa afiliado reportada pelo usuário:', affiliateReported);
console.log('Diferença do cálculo:', affiliateFee.toFixed(2));
console.log('Match?', Math.abs(affiliateFee - (-affiliateReported)) < 0.10 ? 'SIM!' : 'NÃO');
console.log('');

// Recalculando COM a taxa de afiliado
const taxasComAfiliado = normalTaxes + affiliateReported;
const netComAfiliado = orderValue - taxasComAfiliado;
console.log('=== Cálculo COM afiliado ===');
console.log('Taxas normais:', normalTaxes.toFixed(2));
console.log('+ Taxa afiliado:', affiliateReported);
console.log('= Total taxas:', taxasComAfiliado.toFixed(2));
console.log('Net calculado:', netComAfiliado.toFixed(2));
console.log('Escrow real:', escrowAmount);
console.log('Match?', Math.abs(netComAfiliado - escrowAmount) < 0.10 ? 'SIM!' : 'NÃO');
