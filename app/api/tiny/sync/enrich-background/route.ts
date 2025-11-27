// @ts-nocheck
/* eslint-disable */
// app/api/tiny/sync/enrich-background/route.ts
import { NextResponse } from 'next/server';
import { runFreteEnrichment } from '@/lib/freteEnricher';
import { normalizeMissingOrderChannels } from '@/lib/channelNormalizer';
import { sincronizarItensAutomaticamente } from '@/lib/pedidoItensHelper';
import { getAccessTokenFromDbOrRefresh } from '@/lib/tinyAuth';
import { enrichCidadeUfMissing } from '@/lib/cidadeUfEnricher';

export const maxDuration = 300;

/**
 * Background enrichment endpoint
 * Processes the newest unenriched orders first so cron jobs
 * can chip away from "today" towards the backlog.
 */
export async function GET() {
  try {
    const accessToken = await getAccessTokenFromDbOrRefresh();

    const itens = await sincronizarItensAutomaticamente(accessToken, {
      limit: 8,
      maxRequests: 8, // manter a chamada rápida para não estourar timeout do pg_net
    });

    // Se ainda tiver itens pendentes, o cron vai rodar novamente (pg_cron) e avançar aos poucos

    const result = await runFreteEnrichment({
      limit: 8,
      batchSize: 2,
      batchDelayMs: 1500,
      maxRequests: 8,
      newestFirst: true,
    });

    const channel = await normalizeMissingOrderChannels({ includeOutros: true });
    const cidadeUf = await enrichCidadeUfMissing({ limit: 100 });

    return NextResponse.json({
      ...result,
      enriched: result.updated,
      total: result.processed,
      itens,
      channel,
      cidadeUf,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
// @ts-nocheck
