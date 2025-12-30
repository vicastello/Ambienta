export type AiProviderId =
  | 'groq'
  | 'openai'
  | 'deepseek'
  | 'perplexity'
  | 'mistral'
  | 'together'
  | 'custom';

export type AiProviderCatalogItem = {
  id: AiProviderId;
  label: string;
  description: string;
  defaultBaseUrl: string;
  defaultModel: string;
  defaultModelQuick: string;
  defaultModelDeep: string;
  envKey?: string;
};

export const AI_PROVIDER_CATALOG: AiProviderCatalogItem[] = [
  {
    id: 'groq',
    label: 'Groq',
    description: 'OpenAI-compatível com latência baixa (Llama 3.3).',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    defaultModelQuick: 'llama-3.3-70b-versatile',
    defaultModelDeep: 'llama-3.3-70b-versatile',
    envKey: 'GROQ_API_KEY',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPTs oficiais via API OpenAI.',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5-mini',
    defaultModelQuick: 'gpt-5-nano',
    defaultModelDeep: 'gpt-5-mini',
    envKey: 'OPENAI_API_KEY',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    description: 'OpenAI-compatível com foco em custo/benefício.',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    defaultModelQuick: 'deepseek-chat',
    defaultModelDeep: 'deepseek-chat',
    envKey: 'DEEPSEEK_API_KEY',
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    description: 'Modelos Sonar (OpenAI-compatível).',
    defaultBaseUrl: 'https://api.perplexity.ai',
    defaultModel: 'sonar-pro',
    defaultModelQuick: 'sonar-pro',
    defaultModelDeep: 'sonar-pro',
    envKey: 'PPLX_API_KEY',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    description: 'Modelos Mistral via API OpenAI-compatível.',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
    defaultModelQuick: 'mistral-large-latest',
    defaultModelDeep: 'mistral-large-latest',
    envKey: 'MISTRAL_API_KEY',
  },
  {
    id: 'together',
    label: 'Together',
    description: 'OpenAI-compatível (Llama/Mixtral etc.).',
    defaultBaseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    defaultModelQuick: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    defaultModelDeep: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    envKey: 'TOGETHER_API_KEY',
  },
  {
    id: 'custom',
    label: 'OpenAI-compatível (Custom)',
    description: 'Qualquer gateway OpenAI-compatível (inclui Azure/Ollama).',
    defaultBaseUrl: '',
    defaultModel: '',
    defaultModelQuick: '',
    defaultModelDeep: '',
  },
];

export const DEFAULT_AI_PROVIDER_ID: AiProviderId = 'groq';
