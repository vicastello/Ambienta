// app/api/tiny/sync/enrich-background/route.ts
import { NextResponse } from 'next/server';
import { runFreteEnrichment } from '@/lib/freteEnricher';
import { normalizeMissingOrderChannels } from '@/lib/channelNormalizer';

/**
 * Background enrichment endpoint
 * Processes the newest unenriched orders first so cron jobs
 * can chip away from "today" towards the backlog.
 */
export async function GET() {
  try {
    const result = await runFreteEnrichment({
      limit: 40,
      batchSize: 10,
      batchDelayMs: 5000,
      newestFirst: true,
    });

    const channel = await normalizeMissingOrderChannels({ includeOutros: true });

    return NextResponse.json({
      ...result,
      enriched: result.updated,
      total: result.processed,
      channel,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
