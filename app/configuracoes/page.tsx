'use client';

import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';

type SyncJob = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  error: string | null;
  params: any;
  total_requests: number | null;
  total_orders: number | null;
};

type SyncLog = {
  id: number;
  job_id: string;
  created_at: string;
  level: string;
  message: string;
  meta: any;
};

type SyncSettings = {
  auto_sync_enabled: boolean;
  auto_sync_window_days: number;
};

export default function ConfiguracoesPage() {
  // Tiny OAuth
  const [connecting, setConnecting] = useState(false);

  function handleConnectTiny() {
    setConnecting(true);
    window.location.href = '/api/tiny/auth/login';
  }

  // Sync + logs
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncErro, setSyncErro] = useState<string | null>(null);
  const [syncOk, setSyncOk] = useState<string | null>(null);
  // Enriquecimento manual (itens/imagens)
  const [enrichLastNumber, setEnrichLastNumber] = useState<number>(10);
  const [enrichNumeroPedido, setEnrichNumeroPedido] = useState<string>('');
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichResult, setEnrichResult] = useState<any>(null);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Settings (auto sync)
  const [settings, setSettings] = useState<SyncSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Progresso mensal (carga por mês)
  type MonthProgress = {
    year: number;
    month: number;
    start: string;
    end: string;
    db_count: number;
    tiny_total: number | null;
    percent: number | null;
  };

  const now = new Date();
  const anoAtual = now.getFullYear();
  const mesAtual = now.getMonth() + 1; // 1-12
  const [progressYear, setProgressYear] = useState<number>(anoAtual);
  const [progress, setProgress] = useState<MonthProgress[]>([]);
  const [progressLoading, setProgressLoading] = useState<boolean>(false);
  const [progressErro, setProgressErro] = useState<string | null>(null);

  function monthLabel(year: number, month: number) {
    return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
  }

  function pad2(n: number) {
    return n < 10 ? `0${n}` : String(n);
  }

  async function carregarProgresso(ano?: number) {
    try {
      setProgressLoading(true);
      setProgressErro(null);
      const y = typeof ano === 'number' ? ano : progressYear;
      const months = Array.from({ length: 12 }, (_, i) => i + 1).join(',');
      const res = await fetch(
        `/api/tiny/sync/monthly/progress?year=${y}&months=${months}`
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json?.details || json?.message || 'Erro ao carregar progresso mensal.'
        );
      }
      setProgress(json.months || []);
    } catch (e: any) {
      setProgressErro(e?.message ?? 'Erro inesperado ao carregar progresso.');
      setProgress([]);
    } finally {
      setProgressLoading(false);
    }
  }

  async function carregarSettings() {
    try {
      const res = await fetch('/api/tiny/sync/settings');
      const json = await res.json();

      if (!res.ok) {
        throw new Error(
          json?.details ||
            json?.message ||
            'Erro ao carregar configurações.'
        );
      }

      setSettings({
        auto_sync_enabled: !!json.auto_sync_enabled,
        auto_sync_window_days:
          Number(json.auto_sync_window_days ?? 2) || 2,
      });
    } catch (e) {
      console.error(e);
    }
  }

  async function updateSettings(patch: Partial<SyncSettings>) {
    if (!settings) return;
    try {
      setSavingSettings(true);
      const body: any = {};
      if (patch.auto_sync_enabled !== undefined) {
        body.auto_sync_enabled = patch.auto_sync_enabled;
      }
      if (patch.auto_sync_window_days !== undefined) {
        body.auto_sync_window_days = patch.auto_sync_window_days;
      }

      const res = await fetch('/api/tiny/sync/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(
          json?.details ||
            json?.message ||
            'Erro ao salvar configurações.'
        );
      }

      setSettings({
        auto_sync_enabled: !!json.auto_sync_enabled,
        auto_sync_window_days:
          Number(json.auto_sync_window_days ?? 2) || 2,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setSavingSettings(false);
    }
  }

  async function carregarLogs() {
    try {
      setLogsLoading(true);
      const res = await fetch('/api/tiny/sync/logs');
      const json = await res.json();

      if (!res.ok) {
        throw new Error(
          json?.details ||
            json?.message ||
            'Erro ao carregar logs.'
        );
      }

      setJobs(json.jobs ?? []);
      setLogs(json.logs ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLogsLoading(false);
    }
  }

  async function dispararSync(extraBody?: any) {
    try {
      setSyncLoading(true);
      setSyncErro(null);
      setSyncOk(null);

      const body: any = extraBody ? { ...extraBody } : {};

      // se não veio modo, ou for 'range', usa o intervalo do formulário
      if (!body.mode || body.mode === 'range') {
        body.mode = 'range';
        if (dataInicial) body.dataInicial = dataInicial;
        if (dataFinal) body.dataFinal = dataFinal;
      }

      const res = await fetch('/api/tiny/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(
          json?.details ||
            json?.message ||
            'Erro ao iniciar sincronização.'
        );
      }

      setSyncOk(
        `Job ${json.jobId} (${json.mode}) iniciado. Pedidos lidos: ${json.totalOrders}`
      );
      await carregarLogs();
    } catch (e: any) {
      setSyncErro(e?.message ?? 'Erro inesperado ao sincronizar.');
    } finally {
      setSyncLoading(false);
    }
  }

  useEffect(() => {
    carregarSettings();
    carregarLogs();
    carregarProgresso(anoAtual);
  }, []);

  const ultimoJob = jobs[0];
  const janelaPadrao =
    settings?.auto_sync_window_days && settings.auto_sync_window_days > 0
      ? settings.auto_sync_window_days
      : 2;

  return (
    <AppLayout title="Configurações">
      <div className="app-shell">
        <div className="app-shell-inner max-w-5xl">
          <h1 className="text-2xl font-semibold tracking-tight mb-2">
            Configurações
          </h1>

          {/* Card: conexão com Tiny v3 */}
          <div className="app-card p-4 space-y-3">
            <h2 className="text-sm font-semibold">
              Conexão com Tiny API v3
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Clique no botão abaixo para conectar este painel à sua
              conta Tiny, usando o fluxo de autorização (OAuth2) da API v3.
            </p>
            <button
              disabled={connecting}
              onClick={handleConnectTiny}
              className="px-4 py-2 rounded-2xl bg-sky-500 text-white text-xs font-semibold disabled:opacity-60 shadow-lg shadow-sky-500/40 hover:bg-sky-400"
            >
              {connecting
                ? 'Redirecionando para o Tiny...'
                : 'Conectar com Tiny v3'}
            </button>
          </div>

          {/* Card: sincronização para o banco + auto sync */}
          <div className="app-card p-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold">
                  Sincronizar pedidos do Tiny para o banco
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Aqui você puxa os pedidos do Tiny v3 e grava em um banco
                  próprio (Supabase). O dashboard lê desse banco, sem bater
                  na API do Tiny toda vez. A sincronização respeita os limites
                  de requisição do Tiny.
                </p>
              </div>

              {/* Toggle auto sync */}
              <div className="flex flex-col items-end gap-1 text-xs">
                <span className="text-[var(--text-muted)]">
                  Sincronização automática
                </span>
                <button
                  disabled={!settings || savingSettings}
                  onClick={() =>
                    settings &&
                    updateSettings({
                      auto_sync_enabled: !settings.auto_sync_enabled,
                    })
                  }
                  className={
                    'flex items-center px-3 py-1 rounded-full border text-[11px] transition-colors ' +
                    (settings?.auto_sync_enabled
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-slate-800 text-slate-200 border-slate-600')
                  }
                >
                  <span className="mr-1">
                    {settings?.auto_sync_enabled ? 'Ativada' : 'Desativada'}
                  </span>
                </button>
                <span className="text-[10px] text-[var(--text-muted)] text-right">
                  Em produção, a ideia é um cron chamar
                  <br />
                  <code className="text-[10px] text-slate-700 dark:text-slate-200">
                    POST /api/tiny/sync {'{ mode: "recent" }'}
                  </code>{' '}
                  quando isso estiver ativado.
                </span>
              </div>
            </div>
              {/* Enriquecer últimos X pedidos / pedido específico */}
              <div className="border-t app-border-subtle pt-3 space-y-2 text-xs">
                <p className="text-[var(--text-muted)] font-medium">
                  Enriquecer itens/imagens manualmente
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-[var(--text-muted)] text-[12px]">Últimos</label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={enrichLastNumber}
                      onChange={(e) => setEnrichLastNumber(Number(e.target.value || '1'))}
                      className="w-20 rounded-xl border app-border-subtle bg-[var(--bg-card-soft)] px-3 py-1 text-xs outline-none"
                    />
                    <button
                      onClick={async () => {
                        setEnrichLoading(true);
                        setEnrichError(null);
                        setEnrichResult(null);
                        try {
                          // 500ms delay => ~120 req/min
                          const res = await fetch('/api/tiny/enrich', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ mode: 'last', last: enrichLastNumber, delayMs: 500 }),
                          });
                          const json = await res.json();
                          if (!res.ok) throw new Error(json?.message || json?.details || 'Erro');
                          setEnrichResult(json);
                        } catch (e: any) {
                          setEnrichError(e?.message ?? 'Erro ao enriquecer');
                        } finally {
                          setEnrichLoading(false);
                          carregarLogs();
                        }
                      }}
                      disabled={enrichLoading}
                      className="px-3 py-1 rounded-xl bg-emerald-500 text-slate-950 text-[11px] hover:bg-emerald-400 disabled:opacity-60"
                    >
                      {enrichLoading ? 'Enriquecendo…' : `Enriquecer últimos ${enrichLastNumber}`}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-[var(--text-muted)] text-[12px]">Pedido (nº)</label>
                    <input
                      type="text"
                      value={enrichNumeroPedido}
                      onChange={(e) => setEnrichNumeroPedido(e.target.value)}
                      placeholder="Ex: 251122F76FT7PJ ou 22844"
                      className="w-48 rounded-xl border app-border-subtle bg-[var(--bg-card-soft)] px-3 py-1 text-xs outline-none"
                    />
                    <button
                      onClick={async () => {
                        if (!enrichNumeroPedido) return setEnrichError('Informe o número do pedido');
                        setEnrichLoading(true);
                        setEnrichError(null);
                        setEnrichResult(null);
                        try {
                          const res = await fetch('/api/tiny/enrich', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ mode: 'numero', numeroPedido: enrichNumeroPedido, delayMs: 500 }),
                          });
                          const json = await res.json();
                          if (!res.ok) throw new Error(json?.message || json?.details || 'Erro');
                          setEnrichResult(json);
                        } catch (e: any) {
                          setEnrichError(e?.message ?? 'Erro ao enriquecer');
                        } finally {
                          setEnrichLoading(false);
                          carregarLogs();
                        }
                      }}
                      disabled={enrichLoading}
                      className="px-3 py-1 rounded-xl bg-sky-500 text-slate-950 text-[11px] hover:bg-sky-400 disabled:opacity-60"
                    >
                      {enrichLoading ? 'Enriquecendo…' : 'Enriquecer pedido'}
                    </button>
                  </div>
                </div>

                {enrichError && <p className="text-xs text-rose-500">{enrichError}</p>}
                {enrichResult && (
                  <div className="text-xs text-emerald-500">
                    Enriquecimento finalizado. Resultado: {JSON.stringify(enrichResult)}
                  </div>
                )}
              </div>
            {/* Janela padrão */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-[var(--text-muted)]">
                  Janela padrão para sync automático (dias)
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  className="w-20 rounded-xl border app-border-subtle bg-[var(--bg-card-soft)] px-3 py-1 text-xs outline-none"
                  value={janelaPadrao}
                  onChange={(e) => {
                    const v = Number(e.target.value || '1');
                    if (!settings) return;
                    updateSettings({
                      auto_sync_window_days: v,
                    });
                  }}
                />
              </div>
            </div>

            {/* Ações rápidas */}
            <div className="border-t app-border-subtle pt-3 space-y-3 text-xs">
              <p className="text-[var(--text-muted)] font-medium">
                Ações rápidas de sincronização
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => dispararSync({ mode: 'full' })}
                  disabled={syncLoading}
                  className="px-4 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-100 disabled:opacity-60"
                >
                  Carga inicial completa (todos os pedidos)
                </button>
                <button
                  onClick={() =>
                    dispararSync({
                      mode: 'recent',
                      diasRecentes: janelaPadrao,
                    })
                  }
                  disabled={syncLoading}
                  className="px-4 py-2 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-xs text-slate-950 disabled:opacity-60"
                >
                  Sincronizar agora (últimos {janelaPadrao} dias)
                </button>
                <button
                  onClick={() =>
                    dispararSync({
                      mode: 'repair',
                      diasRecentes: 90,
                    })
                  }
                  disabled={syncLoading}
                  className="px-4 py-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-xs text-slate-950 disabled:opacity-60"
                >
                  Reparar últimos 90 dias
                </button>
              </div>
            </div>

            {/* Sincronização por período específico */}
            <div className="border-t app-border-subtle pt-3 space-y-2 text-xs">
              <p className="text-[var(--text-muted)] font-medium">
                Sincronizar por período específico
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[var(--text-muted)]">
                    Data inicial
                  </label>
                  <input
                    type="date"
                    className="rounded-xl border app-border-subtle bg-[var(--bg-card-soft)] px-3 py-1 text-xs outline-none"
                    value={dataInicial}
                    onChange={(e) => setDataInicial(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[var(--text-muted)]">
                    Data final
                  </label>
                  <input
                    type="date"
                    className="rounded-xl border app-border-subtle bg-[var(--bg-card-soft)] px-3 py-1 text-xs outline-none"
                    value={dataFinal}
                    onChange={(e) => setDataFinal(e.target.value)}
                  />
                </div>

                <button
                  onClick={() => dispararSync({ mode: 'range' })}
                  disabled={syncLoading}
                  className="px-4 py-2 rounded-2xl bg-sky-500 text-slate-950 text-xs font-semibold hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-sky-500/30"
                >
                  Sincronizar intervalo
                </button>
              </div>
            </div>

            {syncErro && (
              <p className="text-xs text-rose-500">{syncErro}</p>
            )}
            {syncOk && (
              <p className="text-xs text-emerald-500">{syncOk}</p>
            )}

            {ultimoJob && (
              <div className="mt-2 text-xs text-slate-700 dark:text-slate-200 space-y-1">
                <p className="font-semibold">Último job</p>
                <p>
                  ID:{' '}
                  <span className="text-slate-500 dark:text-slate-400">
                    {ultimoJob.id}
                  </span>
                </p>
                <p>
                  Status:{' '}
                  <span
                    className={
                      ultimoJob.status === 'finished'
                        ? 'text-emerald-500'
                        : ultimoJob.status === 'error'
                        ? 'text-rose-500'
                        : 'text-sky-500'
                    }
                  >
                    {ultimoJob.status}
                  </span>
                </p>
                <p>
                  Início:{' '}
                  {new Date(
                    ultimoJob.started_at
                  ).toLocaleString('pt-BR')}
                </p>
                {ultimoJob.finished_at && (
                  <p>
                    Fim:{' '}
                    {new Date(
                      ultimoJob.finished_at
                    ).toLocaleString('pt-BR')}
                  </p>
                )}
                <p>
                  Requisições:{' '}
                  {ultimoJob.total_requests ?? 0} · Pedidos gravados:{' '}
                  {ultimoJob.total_orders ?? 0}
                </p>
                {ultimoJob.error && (
                  <p className="text-rose-500">
                    Erro: {ultimoJob.error}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Card: logs da sincronização */}
          <div className="app-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                Logs da sincronização
              </h2>
              <button
                onClick={carregarLogs}
                disabled={logsLoading}
                className="px-3 py-1 rounded-2xl bg-[var(--bg-card-soft)] text-xs text-[var(--text-main)] hover:bg-slate-200/70 dark:hover:bg-slate-800/80 disabled:opacity-60"
              >
                {logsLoading ? 'Atualizando...' : 'Atualizar'}
              </button>
            </div>

            <div className="max-h-80 overflow-auto">
              <table className="w-full text-[11px]">
                <thead className="app-table-header">
                  <tr>
                    <th className="text-left px-2 py-1 text-[var(--text-muted)]">
                      Horário
                    </th>
                    <th className="text-left px-2 py-1 text-[var(--text-muted)]">
                      Nível
                    </th>
                    <th className="text-left px-2 py-1 text-[var(--text-muted)]">
                      Mensagem
                    </th>
                    <th className="text-left px-2 py-1 text-[var(--text-muted)]">
                      Meta
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      className="border-t app-border-subtle align-top"
                    >
                      <td className="px-2 py-1">
                        {new Date(
                          log.created_at
                        ).toLocaleTimeString('pt-BR')}
                      </td>
                      <td className="px-2 py-1">
                        <span
                          className={
                            log.level === 'error'
                              ? 'text-rose-500'
                              : log.level === 'warn'
                              ? 'text-amber-500'
                              : 'text-emerald-500'
                          }
                        >
                          {log.level}
                        </span>
                      </td>
                      <td className="px-2 py-1">{log.message}</td>
                      <td className="px-2 py-1 text-slate-500 dark:text-slate-400 max-w-xs truncate">
                        {log.meta
                          ? JSON.stringify(log.meta)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                  {!logs.length && (
                    <tr>
                      <td
                        className="px-2 py-2 text-[var(--text-muted)]"
                        colSpan={4}
                      >
                        Nenhum log ainda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      {/* Card: Progresso mensal por mês */}
      <div className="app-shell">
        <div className="app-shell-inner max-w-5xl">
          <div className="app-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Progresso de carga mensal</h2>
              <div className="flex items-center gap-2 text-xs">
                <select
                  className="rounded-xl border app-border-subtle bg-[var(--bg-card-soft)] px-3 py-1 text-xs outline-none"
                  value={progressYear}
                  onChange={(e) => setProgressYear(Number(e.target.value))}
                >
                  {Array.from({ length: 5 }, (_, i) => anoAtual - i).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => carregarProgresso()}
                  disabled={progressLoading}
                  className="px-3 py-1 rounded-2xl bg-[var(--bg-card-soft)] text-xs text-[var(--text-main)] hover:bg-slate-200/70 dark:hover:bg-slate-800/80 disabled:opacity-60"
                >
                  {progressLoading ? 'Atualizando…' : 'Atualizar'}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-[var(--text-muted)]">
              Mostra, para cada mês do ano selecionado, quantos pedidos estão
              gravados no banco e a estimativa total no Tiny. Clique em
              “Carregar mês” para sincronizar o período.
            </p>

            <div className="grid gap-3 md:grid-cols-2">
              {progress.map((m) => {
                const total = m.tiny_total ?? 0;
                const pct = m.percent ?? null;
                const isCurrentMonth = m.year === anoAtual && m.month === mesAtual;
                return (
                  <div key={`${m.year}-${m.month}`} className="p-3 rounded-2xl border app-border-subtle bg-[var(--bg-card-soft)]">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium">
                        {monthLabel(m.year, m.month)}
                        {isCurrentMonth && (
                          <span className="ml-2 text-[10px] text-sky-500">(mês atual)</span>
                        )}
                      </div>
                      <button
                        onClick={() =>
                          dispararSync({
                            mode: 'range',
                            dataInicial: `${m.year}-${pad2(m.month)}-01`,
                            dataFinal: m.end,
                          })
                        }
                        className="px-3 py-1 rounded-xl bg-emerald-500 text-slate-950 text-[11px] hover:bg-emerald-400"
                      >
                        Carregar mês
                      </button>
                    </div>

                    <div className="h-2 w-full rounded-full bg-slate-200/60 dark:bg-slate-800/60 overflow-hidden">
                      <div
                        className="h-full bg-sky-500"
                        style={{ width: pct ? `${Math.min(100, Math.max(0, pct))}%` : '0%' }}
                      />
                    </div>
                    <div className="mt-2 text-[11px] text-[var(--text-muted)] flex items-center justify-between">
                      <span>
                        Banco: <span className="text-[var(--text-main)]">{m.db_count.toLocaleString('pt-BR')}</span>
                      </span>
                      <span>
                        Tiny:{' '}
                        <span className="text-[var(--text-main)]">
                          {total ? total.toLocaleString('pt-BR') : '—'}
                        </span>
                        {pct !== null && (
                          <span className="ml-2 text-sky-500 font-medium">{pct}%</span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}

              {!progress.length && !progressLoading && (
                <div className="text-xs text-[var(--text-muted)]">Sem dados de progresso para o ano selecionado.</div>
              )}
            </div>

            {progressErro && (
              <p className="text-xs text-rose-500">{progressErro}</p>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}