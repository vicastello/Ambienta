#!/usr/bin/env tsx
/**
 * Enrich all orders: frete + normalize channels including "Outros"
 * Fixed version with proper env loading
 */

// CRITICAL: Set env vars BEFORE any imports
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://znoiauhdrujwkfryhwiz.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpub2lhdWhkcnVqd2tmcnlod2l6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzM5ODEyNywiZXhwIjoyMDc4OTc0MTI3fQ.J1GFCdU1Fb9Jc5NlQSHkI7vsvXPWbE3l6h-17KLPsZQ';
process.env.TINY_CLIENT_ID = 'tiny-api-96c52ae7713211e99e3d9fd50ee4385d928437a7-1763324548';
process.env.TINY_CLIENT_SECRET = 'vTDeowXckMitwa9brXA2w8CX64m9Axdh';

export {};

async function main() {
  // Import AFTER env vars are set
  const { runFreteEnrichment } = await import('../lib/freteEnricher');
  const { normalizeMissingOrderChannels } = await import('../lib/channelNormalizer');

  console.log('🚀 Starting full enrichment...\n');

  // 1. Enrich frete in multiple passes
  console.log('📦 Enriching frete (multiple passes)...');
  let pass = 1;
  while (pass <= 10) {
    const freteResult = await runFreteEnrichment({
      limit: 100,
      batchSize: 20,
      batchDelayMs: 3000,
      newestFirst: true,
    });

    console.log(`  Pass ${pass}:`, freteResult);

    if (!freteResult.requested || freteResult.remaining === 0) {
      console.log('  ✅ No more orders to enrich frete\n');
      break;
    }

    pass++;
  }

  // 2. Normalize channels including "Outros"
  console.log('🏷️  Normalizing channels (including "Outros")...');
  let channelPass = 1;
  while (channelPass <= 30) {
    const channelResult = await normalizeMissingOrderChannels({
      limit: 500,
      includeOutros: true,
    });

    console.log(`  Pass ${channelPass}:`, channelResult);

    if (!channelResult.requested || channelResult.remaining === 0) {
      console.log('  ✅ All channels normalized\n');
      break;
    }

    channelPass++;
  }

  console.log('✨ Enrichment complete!');
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
