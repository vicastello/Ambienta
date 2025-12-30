import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { callInternalJson } from '@/lib/internalApi';
import { resolveAiRuntimeConfig } from '@/lib/ai/ai-runtime';
import { insertAiActionLog } from '@/src/repositories/aiActionLogsRepository';

export const dynamic = 'force-dynamic';

type AiActionPayload =
  | { type: 'run_sync_pipeline'; diasRecentes?: number; enrichEnabled?: boolean; produtosEnabled?: boolean; produtosLimit?: number; produtosEnrichEstoque?: boolean; estoqueOnly?: boolean }
  | { type: 'sync_recent_orders'; diasRecentes: number }
  | { type: 'sync_orders_range'; dataInicial: string; dataFinal: string }
  | { type: 'sync_produtos'; limit?: number; estoqueOnly?: boolean; enrichEstoque?: boolean };

type ActionRequestBody = {
  action: AiActionPayload;
  screen?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (!isRecord(rawBody) || !isRecord(rawBody.action)) {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
  }

  const action = rawBody.action as AiActionPayload;
  const screen = typeof rawBody.screen === 'string' ? rawBody.screen : null;
  const runtime = await resolveAiRuntimeConfig();

  if (!runtime.allowActions.sync) {
    return NextResponse.json({ error: 'Ações de sync desativadas em /configuracoes.' }, { status: 403 });
  }

  const logBase = {
    action_type: action.type,
    payload: action as unknown as Record<string, unknown>,
    screen,
  };

  try {
    await insertAiActionLog({ ...logBase, status: 'pending' });

    if (action.type === 'run_sync_pipeline') {
      const result = await callInternalJson('/api/admin/cron/run-sync', {
        method: 'POST',
        body: JSON.stringify({
          diasRecentes: action.diasRecentes,
          enrich: typeof action.enrichEnabled === 'boolean' ? { enabled: action.enrichEnabled } : undefined,
          produtos: typeof action.produtosEnabled === 'boolean'
            || typeof action.produtosLimit === 'number'
            || typeof action.produtosEnrichEstoque === 'boolean'
            || typeof action.estoqueOnly === 'boolean'
            ? {
              enabled: typeof action.produtosEnabled === 'boolean' ? action.produtosEnabled : undefined,
              limit: typeof action.produtosLimit === 'number' ? action.produtosLimit : undefined,
              enrichEstoque: typeof action.produtosEnrichEstoque === 'boolean' ? action.produtosEnrichEstoque : undefined,
              estoqueOnly: typeof action.estoqueOnly === 'boolean' ? action.estoqueOnly : undefined,
            }
            : undefined,
        }),
      });

      await insertAiActionLog({ ...logBase, status: 'ok', result: result as Record<string, unknown> });
      return NextResponse.json({ ok: true, result });
    }

    if (action.type === 'sync_recent_orders') {
      const result = await callInternalJson('/api/tiny/sync', {
        method: 'POST',
        body: JSON.stringify({ mode: 'recent', diasRecentes: action.diasRecentes }),
      });
      await insertAiActionLog({ ...logBase, status: 'ok', result: result as Record<string, unknown> });
      return NextResponse.json({ ok: true, result });
    }

    if (action.type === 'sync_orders_range') {
      const result = await callInternalJson('/api/tiny/sync', {
        method: 'POST',
        body: JSON.stringify({ mode: 'range', dataInicial: action.dataInicial, dataFinal: action.dataFinal }),
      });
      await insertAiActionLog({ ...logBase, status: 'ok', result: result as Record<string, unknown> });
      return NextResponse.json({ ok: true, result });
    }

    if (action.type === 'sync_produtos') {
      const result = await callInternalJson('/api/produtos/sync', {
        method: 'POST',
        body: JSON.stringify({
          limit: action.limit,
          estoqueOnly: action.estoqueOnly,
          enrichEstoque: action.enrichEstoque,
        }),
      });
      await insertAiActionLog({ ...logBase, status: 'ok', result: result as Record<string, unknown> });
      return NextResponse.json({ ok: true, result });
    }

    await insertAiActionLog({ ...logBase, status: 'error', error: 'Tipo de ação não suportado' });
    return NextResponse.json({ error: 'Ação não suportada' }, { status: 400 });
  } catch (error) {
    const message = getErrorMessage(error) || 'Erro ao executar ação';
    await insertAiActionLog({ ...logBase, status: 'error', error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
