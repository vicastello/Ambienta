import { NextResponse } from 'next/server';

import {
  getAiSettings,
  updateAiSettings,
  type AiSettingsUpdate,
} from '@/src/repositories/aiSettingsRepository';
import {
  AI_PROVIDER_CATALOG,
  type AiProviderId,
} from '@/src/config/aiProviders';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  return undefined;
};

const toNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  return value;
};

const resolveEnvKey = (providerId: AiProviderId) => {
  const meta = AI_PROVIDER_CATALOG.find((item) => item.id === providerId);
  if (!meta?.envKey) return '';
  return process.env[meta.envKey] ?? '';
};

const buildPublicSettings = async () => {
  const settings = await getAiSettings();
  const providers = AI_PROVIDER_CATALOG.map((provider) => {
    const config = settings.providers[provider.id] ?? {};
    const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : '';
    const configured = Boolean(apiKey || resolveEnvKey(provider.id));
    return {
      id: provider.id,
      label: provider.label,
      description: provider.description,
      baseUrl: config.baseUrl ?? provider.defaultBaseUrl,
      modelQuick: config.modelQuick ?? provider.defaultModelQuick ?? provider.defaultModel,
      modelDeep: config.modelDeep ?? provider.defaultModelDeep ?? provider.defaultModel,
      enabled: config.enabled ?? true,
      configured,
      defaultBaseUrl: provider.defaultBaseUrl,
      defaultModelQuick: provider.defaultModelQuick ?? provider.defaultModel,
      defaultModelDeep: provider.defaultModelDeep ?? provider.defaultModel,
    };
  });

  return {
    activeProvider: settings.activeProvider,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    allowActions: settings.allowActions,
    providers,
  };
};

export async function GET() {
  const payload = await buildPublicSettings();
  return NextResponse.json(payload);
}

export async function PUT(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (!isRecord(rawBody)) {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
  }

  const patch: AiSettingsUpdate = {};

  if ('activeProvider' in rawBody) {
    if (!AI_PROVIDER_CATALOG.some((item) => item.id === rawBody.activeProvider)) {
      return NextResponse.json({ error: 'activeProvider inválido' }, { status: 400 });
    }
    patch.activeProvider = rawBody.activeProvider as AiProviderId;
  }

  if ('temperature' in rawBody) {
    const value = toNumber(rawBody.temperature);
    if (value === undefined) {
      return NextResponse.json({ error: 'temperature inválido' }, { status: 400 });
    }
    patch.temperature = value;
  }

  if ('maxTokens' in rawBody) {
    const value = toNumber(rawBody.maxTokens);
    if (value === undefined) {
      return NextResponse.json({ error: 'maxTokens inválido' }, { status: 400 });
    }
    patch.maxTokens = value;
  }

  if ('allowActions' in rawBody) {
    if (!isRecord(rawBody.allowActions)) {
      return NextResponse.json({ error: 'allowActions inválido' }, { status: 400 });
    }
    const allowPatch: { sync?: boolean; filters?: boolean } = {};
    if ('sync' in rawBody.allowActions) {
      const value = toBoolean(rawBody.allowActions.sync);
      if (typeof value !== 'boolean') {
        return NextResponse.json({ error: 'allowActions.sync inválido' }, { status: 400 });
      }
      allowPatch.sync = value;
    }
    if ('filters' in rawBody.allowActions) {
      const value = toBoolean(rawBody.allowActions.filters);
      if (typeof value !== 'boolean') {
        return NextResponse.json({ error: 'allowActions.filters inválido' }, { status: 400 });
      }
      allowPatch.filters = value;
    }
    if (Object.keys(allowPatch).length) {
      patch.allowActions = allowPatch as any;
    }
  }

  if ('providers' in rawBody) {
    if (!isRecord(rawBody.providers)) {
      return NextResponse.json({ error: 'providers inválido' }, { status: 400 });
    }
    patch.providers = {};
    const providersRaw = rawBody.providers as Record<string, unknown>;
    AI_PROVIDER_CATALOG.forEach((provider) => {
      const providerRaw = providersRaw[provider.id];
      if (!isRecord(providerRaw)) return;
      const update: Record<string, unknown> = {};

      if ('apiKey' in providerRaw) {
        if (providerRaw.apiKey === null) {
          update.apiKey = null;
        } else if (typeof providerRaw.apiKey === 'string') {
          update.apiKey = providerRaw.apiKey.trim();
        } else {
          return;
        }
      }

      if ('baseUrl' in providerRaw) {
        if (typeof providerRaw.baseUrl !== 'string') return;
        update.baseUrl = providerRaw.baseUrl.trim();
      }

      if ('model' in providerRaw) {
        if (typeof providerRaw.model !== 'string') return;
        update.modelQuick = providerRaw.model.trim();
        update.modelDeep = providerRaw.model.trim();
      }

      if ('modelQuick' in providerRaw) {
        if (typeof providerRaw.modelQuick !== 'string') return;
        update.modelQuick = providerRaw.modelQuick.trim();
      }

      if ('modelDeep' in providerRaw) {
        if (typeof providerRaw.modelDeep !== 'string') return;
        update.modelDeep = providerRaw.modelDeep.trim();
      }

      if ('enabled' in providerRaw) {
        const value = toBoolean(providerRaw.enabled);
        if (typeof value === 'boolean') update.enabled = value;
      }

      if (Object.keys(update).length) {
        patch.providers![provider.id] = update as any;
      }
    });
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'Nenhum campo válido informado' }, { status: 400 });
  }

  await updateAiSettings(patch);
  const payload = await buildPublicSettings();
  return NextResponse.json(payload);
}

export const POST = PUT;
