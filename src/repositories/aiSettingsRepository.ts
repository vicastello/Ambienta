import {
  AI_PROVIDER_CATALOG,
  DEFAULT_AI_PROVIDER_ID,
  type AiProviderId,
} from '@/src/config/aiProviders';
import { getSyncSettings, upsertSyncSettings } from '@/src/repositories/syncRepository';
import type { Json } from '@/src/types/db-public';

export type AiProviderSettings = {
  apiKey?: string | null;
  baseUrl?: string | null;
  modelQuick?: string | null;
  modelDeep?: string | null;
  enabled?: boolean;
};

export type AiSettings = {
  activeProvider: AiProviderId;
  temperature: number;
  maxTokens: number;
  allowActions: {
    sync: boolean;
    filters: boolean;
  };
  providers: Record<AiProviderId, AiProviderSettings>;
};

export type AiSettingsUpdate = Partial<
  Pick<AiSettings, 'activeProvider' | 'temperature' | 'maxTokens' | 'allowActions'>
> & {
  providers?: Partial<Record<AiProviderId, AiProviderSettings>>;
};

const buildDefaultProviders = (): Record<AiProviderId, AiProviderSettings> => {
  const defaults = {} as Record<AiProviderId, AiProviderSettings>;
  AI_PROVIDER_CATALOG.forEach((provider) => {
    defaults[provider.id] = {
      baseUrl: provider.defaultBaseUrl,
      modelQuick: provider.defaultModelQuick || provider.defaultModel,
      modelDeep: provider.defaultModelDeep || provider.defaultModel,
      enabled: true,
    };
  });
  return defaults;
};

const DEFAULT_AI_SETTINGS: AiSettings = {
  activeProvider: DEFAULT_AI_PROVIDER_ID,
  temperature: 0.7,
  maxTokens: 900,
  allowActions: {
    sync: false,
    filters: false,
  },
  providers: buildDefaultProviders(),
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.min(Math.max(value, min), max);
};

const normalizeAiSettings = (raw: unknown): AiSettings => {
  const base = DEFAULT_AI_SETTINGS;
  if (!isRecord(raw)) return { ...base, providers: { ...base.providers } };

  const rawProviders = isRecord(raw.providers) ? (raw.providers as Record<string, unknown>) : {};
  const providers = buildDefaultProviders();

  AI_PROVIDER_CATALOG.forEach((provider) => {
    const rawProvider = isRecord(rawProviders[provider.id])
      ? (rawProviders[provider.id] as Record<string, unknown>)
      : {};
    providers[provider.id] = {
      ...providers[provider.id],
      apiKey:
        typeof rawProvider.apiKey === 'string'
          ? rawProvider.apiKey
          : providers[provider.id].apiKey ?? null,
      baseUrl:
        typeof rawProvider.baseUrl === 'string'
          ? rawProvider.baseUrl
          : providers[provider.id].baseUrl ?? provider.defaultBaseUrl,
      modelQuick:
        typeof rawProvider.modelQuick === 'string'
          ? rawProvider.modelQuick
          : providers[provider.id].modelQuick ?? provider.defaultModelQuick ?? provider.defaultModel,
      modelDeep:
        typeof rawProvider.modelDeep === 'string'
          ? rawProvider.modelDeep
          : providers[provider.id].modelDeep ?? provider.defaultModelDeep ?? provider.defaultModel,
      enabled:
        typeof rawProvider.enabled === 'boolean'
          ? rawProvider.enabled
          : providers[provider.id].enabled ?? true,
    };
  });

  const allowActions = isRecord(raw.allowActions) ? raw.allowActions : {};

  const activeProvider = AI_PROVIDER_CATALOG.some((item) => item.id === raw.activeProvider)
    ? (raw.activeProvider as AiProviderId)
    : base.activeProvider;

  return {
    activeProvider,
    temperature: clampNumber(raw.temperature, base.temperature, 0, 2),
    maxTokens: clampNumber(raw.maxTokens, base.maxTokens, 128, 4000),
    allowActions: {
      sync: typeof allowActions.sync === 'boolean' ? allowActions.sync : base.allowActions.sync,
      filters:
        typeof allowActions.filters === 'boolean' ? allowActions.filters : base.allowActions.filters,
    },
    providers,
  };
};

export async function getAiSettings(): Promise<AiSettings> {
  const row = await getSyncSettings();
  const settings = (row?.settings as Record<string, unknown> | null) ?? null;
  return normalizeAiSettings(settings?.ai);
}

export async function updateAiSettings(patch: AiSettingsUpdate): Promise<AiSettings> {
  const row = await getSyncSettings();
  const currentSettings = (row?.settings as Record<string, unknown> | null) ?? {};
  const currentAi = normalizeAiSettings((currentSettings as Record<string, unknown>).ai);

  const nextAi: AiSettings = {
    ...currentAi,
    allowActions: { ...currentAi.allowActions },
    providers: { ...currentAi.providers },
  };

  if (patch.activeProvider && AI_PROVIDER_CATALOG.some((item) => item.id === patch.activeProvider)) {
    nextAi.activeProvider = patch.activeProvider;
  }

  if (typeof patch.temperature === 'number') {
    nextAi.temperature = clampNumber(patch.temperature, currentAi.temperature, 0, 2);
  }

  if (typeof patch.maxTokens === 'number') {
    nextAi.maxTokens = clampNumber(patch.maxTokens, currentAi.maxTokens, 128, 4000);
  }

  if (patch.allowActions) {
    if (typeof patch.allowActions.sync === 'boolean') {
      nextAi.allowActions.sync = patch.allowActions.sync;
    }
    if (typeof patch.allowActions.filters === 'boolean') {
      nextAi.allowActions.filters = patch.allowActions.filters;
    }
  }

  if (patch.providers) {
    AI_PROVIDER_CATALOG.forEach((provider) => {
      const update = patch.providers?.[provider.id];
      if (!update || !nextAi.providers[provider.id]) return;
      const currentProvider = nextAi.providers[provider.id];
      nextAi.providers[provider.id] = {
        ...currentProvider,
        apiKey: typeof update.apiKey !== 'undefined' ? update.apiKey : currentProvider.apiKey,
        baseUrl:
          typeof update.baseUrl === 'string' ? update.baseUrl : currentProvider.baseUrl,
        modelQuick:
          typeof update.modelQuick === 'string'
            ? update.modelQuick
            : currentProvider.modelQuick,
        modelDeep:
          typeof update.modelDeep === 'string'
            ? update.modelDeep
            : currentProvider.modelDeep,
        enabled:
          typeof update.enabled === 'boolean' ? update.enabled : currentProvider.enabled,
      };
    });
  }

  const nextSettings = {
    ...(currentSettings as Record<string, unknown>),
    ai: nextAi,
  };

  const saved = await upsertSyncSettings({ settings: nextSettings as Json });
  const savedSettings = (saved.settings as Record<string, unknown> | null) ?? null;
  return normalizeAiSettings(savedSettings?.ai);
}
