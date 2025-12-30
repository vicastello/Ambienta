'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Brain, KeyRound, Save, SlidersHorizontal, ShieldCheck, Sparkles, RefreshCw } from 'lucide-react';

type AiProvider = {
  id: string;
  label: string;
  description: string;
  baseUrl: string;
  modelQuick: string;
  modelDeep: string;
  enabled: boolean;
  configured: boolean;
  defaultBaseUrl: string;
  defaultModelQuick: string;
  defaultModelDeep: string;
};

type AiSettingsResponse = {
  activeProvider: string;
  temperature: number;
  maxTokens: number;
  allowActions: {
    sync: boolean;
    filters: boolean;
  };
  providers: AiProvider[];
};

export default function ConfigAI() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AiSettingsResponse | null>(null);
  const [draft, setDraft] = useState<AiSettingsResponse | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [clearKeys, setClearKeys] = useState<Record<string, boolean>>({});

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/configuracoes/ai', { cache: 'no-store' });
      if (!res.ok) throw new Error('Erro ao carregar configurações');
      const data = (await res.json()) as AiSettingsResponse;
      setSettings(data);
      setDraft(data);
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível carregar as configurações de IA');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const providers = useMemo(() => draft?.providers ?? [], [draft]);
  const handleActiveProvider = (providerId: string) => {
    if (!draft) return;
    setDraft({
      ...draft,
      activeProvider: providerId,
      providers: draft.providers.map((provider) => ({
        ...provider,
        enabled: provider.id === providerId,
      })),
    });
  };

  const handleProviderChange = (
    providerId: string,
    key: 'baseUrl' | 'modelQuick' | 'modelDeep',
    value: string
  ) => {
    if (!draft) return;
    setDraft({
      ...draft,
      providers: draft.providers.map((provider) =>
        provider.id === providerId ? { ...provider, [key]: value } : provider
      ),
    });
  };

  const handleResetDefaults = (provider: AiProvider) => {
    if (!draft) return;
    setDraft({
      ...draft,
      providers: draft.providers.map((item) =>
        item.id === provider.id
          ? {
            ...item,
            baseUrl: provider.defaultBaseUrl,
            modelQuick: provider.defaultModelQuick,
            modelDeep: provider.defaultModelDeep,
          }
          : item
      ),
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const providersPayload: Record<string, Record<string, unknown>> = {};
      const activeProviderId = draft.activeProvider;
      draft.providers.forEach((provider) => {
        const payload: Record<string, unknown> = {
          baseUrl: provider.baseUrl,
          modelQuick: provider.modelQuick,
          modelDeep: provider.modelDeep,
          enabled: provider.id === activeProviderId,
        };
        const apiKey = apiKeys[provider.id];
        if (typeof apiKey === 'string' && apiKey.trim().length) {
          payload.apiKey = apiKey.trim();
        } else if (clearKeys[provider.id]) {
          payload.apiKey = null;
        }
        providersPayload[provider.id] = payload;
      });

      const res = await fetch('/api/configuracoes/ai', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeProvider: draft.activeProvider,
          temperature: draft.temperature,
          maxTokens: draft.maxTokens,
          allowActions: draft.allowActions,
          providers: providersPayload,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Erro ao salvar');
      }

      const saved = (await res.json()) as AiSettingsResponse;
      setSettings(saved);
      setDraft(saved);
      setApiKeys({});
      setClearKeys({});
      toast.success('Configurações de IA salvas');
    } catch (error) {
      console.error(error);
      toast.error('Falha ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !draft) {
    return (
      <div className="text-muted text-sm">Carregando configurações de IA...</div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-2xl bg-accent/10">
          <Brain className="w-6 h-6 text-accent" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-main">IA Revolucionária</h2>
          <p className="text-sm text-muted">
            Troque o motor de IA, ajuste parâmetros e autorize ações automáticas.
          </p>
        </div>
      </div>

      <div className="glass-panel glass-tint p-6 rounded-3xl border border-white/10 space-y-4">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-accent" />
          <div>
            <h3 className="text-lg font-semibold text-main">Motor ativo</h3>
            <p className="text-xs text-muted">
              A IA selecionada será usada em todos os insights e conversas.
            </p>
            <p className="text-[11px] text-muted mt-1">
              Selecionar um provedor desativa os demais.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {providers.map((provider) => {
            const isActive = draft.activeProvider === provider.id;
            return (
              <button
                key={provider.id}
                onClick={() => handleActiveProvider(provider.id)}
                className={`text-left rounded-2xl border px-4 py-3 transition ${isActive
                    ? 'border-accent bg-accent/10 text-main'
                    : 'border-white/10 hover:border-white/20 text-muted'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-main">{provider.label}</p>
                    <p className="text-xs text-muted">{provider.description}</p>
                  </div>
                  <span className={`text-[11px] font-semibold ${provider.configured ? 'text-emerald-500' : 'text-orange-400'}`}>
                    {provider.configured ? 'Configurado' : 'Sem chave'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="glass-panel glass-tint p-6 rounded-3xl border border-white/10 space-y-4">
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="w-5 h-5 text-accent" />
            <div>
              <h3 className="text-lg font-semibold text-main">Parâmetros globais</h3>
              <p className="text-xs text-muted">Afetam chat, insights e resumos.</p>
            </div>
          </div>

          <label className="text-sm font-semibold text-main">
            Temperatura
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={draft.temperature}
              onChange={(e) => setDraft({ ...draft, temperature: Number(e.target.value) || 0 })}
              className="mt-2 w-full rounded-2xl border border-white/20 bg-white/50 px-4 py-2 text-sm text-main focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>

          <label className="text-sm font-semibold text-main">
            Máx. tokens por resposta
            <input
              type="number"
              min={128}
              max={4000}
              step={50}
              value={draft.maxTokens}
              onChange={(e) => setDraft({ ...draft, maxTokens: Number(e.target.value) || 128 })}
              className="mt-2 w-full rounded-2xl border border-white/20 bg-white/50 px-4 py-2 text-sm text-main focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
        </div>

        <div className="glass-panel glass-tint p-6 rounded-3xl border border-white/10 space-y-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-accent" />
            <div>
              <h3 className="text-lg font-semibold text-main">Permissões da IA</h3>
              <p className="text-xs text-muted">
                Defina até onde a IA pode agir diretamente no Tiny → Supabase.
              </p>
            </div>
          </div>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 rounded border-white/30 text-accent focus:ring-accent"
              checked={draft.allowActions.sync}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  allowActions: { ...draft.allowActions, sync: e.target.checked },
                })
              }
            />
            <div>
              <p className="text-sm font-semibold text-main">Executar syncs automaticamente</p>
              <p className="text-xs text-muted">
                Permite disparar /api/tiny/sync e /api/admin/cron/run-sync.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 rounded border-white/30 text-accent focus:ring-accent"
              checked={draft.allowActions.filters}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  allowActions: { ...draft.allowActions, filters: e.target.checked },
                })
              }
            />
            <div>
              <p className="text-sm font-semibold text-main">Ajustar filtros e canais do dashboard</p>
              <p className="text-xs text-muted">
                A IA pode alterar filtros visuais sem tocar no banco.
              </p>
            </div>
          </label>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-main">APIs configuradas</h3>
            <p className="text-xs text-muted">
              Salve as chaves e ajustes de modelo para cada provedor.
            </p>
          </div>
          <button
            onClick={fetchSettings}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl glass-panel text-sm text-main hover:bg-white/10"
            disabled={loading}
          >
            <RefreshCw className="w-4 h-4" />
            Recarregar
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className="glass-panel glass-tint p-5 rounded-3xl border border-white/10 space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-base font-semibold text-main">{provider.label}</h4>
                  <p className="text-xs text-muted">{provider.description}</p>
                </div>
                <span className={`text-[11px] font-semibold ${provider.configured ? 'text-emerald-500' : 'text-orange-400'}`}>
                  {provider.configured ? 'Chave salva' : 'Sem chave'}
                </span>
              </div>

              <label className="text-xs font-semibold text-muted">
                API Key
                <div className="mt-2 flex items-center gap-2">
                  <div className="relative flex-1">
                    <KeyRound className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      placeholder={provider.configured ? 'Chave configurada (digite para substituir)' : 'Insira a chave'}
                      value={apiKeys[provider.id] ?? ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setApiKeys((prev) => ({ ...prev, [provider.id]: value }));
                        if (clearKeys[provider.id]) {
                          setClearKeys((prev) => ({ ...prev, [provider.id]: false }));
                        }
                      }}
                      className="w-full pl-9 pr-3 py-2 rounded-2xl border border-white/20 bg-white/60 text-sm text-main focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                  <button
                    onClick={() =>
                      setClearKeys((prev) => ({ ...prev, [provider.id]: true }))
                    }
                    className="px-3 py-2 text-xs rounded-2xl border border-white/20 text-muted hover:text-main"
                    type="button"
                  >
                    Limpar
                  </button>
                </div>
              </label>

              <label className="text-xs font-semibold text-muted">
                Base URL
                <input
                  type="text"
                  value={provider.baseUrl}
                  onChange={(e) => handleProviderChange(provider.id, 'baseUrl', e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/20 bg-white/60 px-3 py-2 text-sm text-main focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </label>

              <label className="text-xs font-semibold text-muted">
                Modelo rápido (GPT‑5 nano)
                <input
                  type="text"
                  value={provider.modelQuick}
                  onChange={(e) => handleProviderChange(provider.id, 'modelQuick', e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/20 bg-white/60 px-3 py-2 text-sm text-main focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </label>

              <label className="text-xs font-semibold text-muted">
                Modelo profundo (GPT‑5 mini)
                <input
                  type="text"
                  value={provider.modelDeep}
                  onChange={(e) => handleProviderChange(provider.id, 'modelDeep', e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/20 bg-white/60 px-3 py-2 text-sm text-main focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </label>

              <button
                onClick={() => handleResetDefaults(provider)}
                className="text-xs text-muted hover:text-main"
                type="button"
              >
                Restaurar padrão do provedor
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-white font-semibold transition ${saving ? 'bg-slate-400 cursor-wait' : 'bg-accent hover:bg-accent-dark'
            }`}
        >
          <Save className="w-5 h-5" />
          {saving ? 'Salvando...' : 'Salvar configurações'}
        </button>

        {settings && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              {settings.activeProvider.toUpperCase()} ativo
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
