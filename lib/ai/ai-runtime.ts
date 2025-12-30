import { GroqClient } from '@/lib/ai/groq-client';
import {
  AI_PROVIDER_CATALOG,
  DEFAULT_AI_PROVIDER_ID,
  type AiProviderId,
} from '@/src/config/aiProviders';
import { getAiSettings } from '@/src/repositories/aiSettingsRepository';

export type AiRuntimeConfig = {
  providerId: AiProviderId;
  apiKey: string;
  baseUrl: string;
  modelQuick: string;
  modelDeep: string;
  temperature: number;
  maxTokens: number;
  allowActions: {
    sync: boolean;
    filters: boolean;
  };
};

const resolveEnvKey = (providerId: AiProviderId) => {
  const item = AI_PROVIDER_CATALOG.find((provider) => provider.id === providerId);
  if (!item?.envKey) return '';
  return process.env[item.envKey] ?? '';
};

export async function resolveAiRuntimeConfig(): Promise<AiRuntimeConfig> {
  const settings = await getAiSettings();
  const preferredId = settings.activeProvider ?? DEFAULT_AI_PROVIDER_ID;

  const buildRuntime = (providerId: AiProviderId): AiRuntimeConfig => {
    const providerMeta =
      AI_PROVIDER_CATALOG.find((provider) => provider.id === providerId) ??
      AI_PROVIDER_CATALOG[0];
    const providerConfig = settings.providers[providerMeta.id] ?? {};

    const apiKey = (providerConfig.apiKey ?? '').trim() || resolveEnvKey(providerMeta.id);
    const baseUrl =
      (providerConfig.baseUrl ?? providerMeta.defaultBaseUrl ?? '').trim() ||
      providerMeta.defaultBaseUrl;
    const modelQuick =
      (providerConfig.modelQuick ?? providerMeta.defaultModelQuick ?? providerMeta.defaultModel ?? '').trim() ||
      providerMeta.defaultModelQuick ||
      providerMeta.defaultModel;
    const modelDeep =
      (providerConfig.modelDeep ?? providerMeta.defaultModelDeep ?? providerMeta.defaultModel ?? '').trim() ||
      providerMeta.defaultModelDeep ||
      providerMeta.defaultModel;

    return {
      providerId: providerMeta.id,
      apiKey,
      baseUrl,
      modelQuick,
      modelDeep,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      allowActions: settings.allowActions,
    };
  };

  const preferred = buildRuntime(preferredId);
  const preferredEnabled = settings.providers?.[preferred.providerId]?.enabled !== false;
  if (preferred.apiKey && preferredEnabled) {
    return preferred;
  }

  const fallback = AI_PROVIDER_CATALOG
    .filter((provider) => provider.id !== preferredId)
    .map((provider) => buildRuntime(provider.id))
    .find((candidate) => {
      const enabled = settings.providers?.[candidate.providerId]?.enabled !== false;
      return enabled && Boolean(candidate.apiKey);
    });

  if (fallback) {
    console.warn('[AI] Provedor ativo sem chave. Usando fallback:', fallback.providerId);
    return fallback;
  }

  return preferred;
}

export function createOpenAICompatibleClient(runtime: AiRuntimeConfig) {
  return new GroqClient({
    apiKey: runtime.apiKey,
    baseUrl: runtime.baseUrl,
    model: runtime.modelDeep || runtime.modelQuick,
  });
}

export const resolveModelForMode = (runtime: AiRuntimeConfig, mode: 'quick' | 'deep') => {
  return mode === 'quick' ? runtime.modelQuick : runtime.modelDeep;
};
