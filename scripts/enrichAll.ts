#!/usr/bin/env tsx
/**
 * Enrich all orders: frete + normalize channels including "Outros"
 */

// Set env vars before any imports
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://znoiauhdrujwkfryhwiz.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpub2lhdWhkcnVqd2tmcnlod2l6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMTg1NDkxMiwiZXhwIjoyMDQ3NDMwOTEyfQ.DDq1Wq4RzBscyeGq_cJMPUjUlViBVEa4ypDfCEZHAgg';
process.env.TINY_CLIENT_ID = process.env.TINY_CLIENT_ID || '20afd01f-fd85-40e4-9c3f-17dc10e1f99b';
process.env.TINY_CLIENT_SECRET = process.env.TINY_CLIENT_SECRET || '42b7be75-f3e5-40df-88bf-1f11cc19be8a';

export {};

async function main() {
  const { runFreteEnrichment } = await import('../lib/freteEnricher');
  const { normalizeMissingOrderChannels } = await import('../lib/channelNormalizer');

  console.log('🚀 Starting full enrichment...\n');

  // 1. Enrich frete in multiple passes (respecting 100 req/min = 600ms per request)
  console.log('📦 Enriching frete (multiple passes)...');
  let pass = 1;
  while (pass <= 10) {
    const freteResult = await runFreteEnrichment({
      limit: 50,
      batchSize: 10,
      batchDelayMs: 7000,
      newestFirst: true,
    });

    console.log(`  Pass ${pass}:`, freteResult);

    if (!freteResult.requested || freteResult.remaining === 0) {
      console.log('  ✅ No more orders to enrich frete\n');
      break;
    }

    pass++;
    await new Promise(r => setTimeout(r, 2000));
  }

  // 2. Normalize channels including "Outros"
  console.log('🏷️  Normalizing channels (including "Outros")...');
  let channelPass = 1;
  while (channelPass <= 30) {
    const channelResult = await normalizeMissingOrderChannels({
      limit: 200,
      includeOutros: true,
    });

    console.log(`  Pass ${channelPass}:`, channelResult);

    if (!channelResult.requested || channelResult.remaining === 0) {
      console.log('  ✅ All channels normalized\n');
      break;
    }

    channelPass++;
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('✨ Enrichment complete!');
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
