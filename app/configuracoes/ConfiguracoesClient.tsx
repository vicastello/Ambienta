"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { CalendarDayStatus } from "@/app/api/admin/sync/calendar/route";
import type { SyncProdutosResult } from "@/src/lib/sync/produtos";

type SyncOverviewResponse = {
  orders: {
    total: number;
    firstDate: string | null;
    lastDate: string | null;
    withoutItems: number;
    withoutFrete: number;
  };
  produtos: {
    total: number;
    lastUpdatedAt: string | null;
    withoutImage: number;
  };
};

type JsonRecord = Record<string, unknown>;

type SyncMeta = JsonRecord & {
  processed?: number;
  updated?: number;
};

type SyncLogEntry = {
  id: string;
  createdAt: string;
  level: string;
  type: string;
  message: string;
  meta: JsonRecord | null;
  jobId: string | null;
};

type CronStatusStep = {
  name: "orders" | "enrich" | "produtos";
  createdAt: string;
  level: string;
  message: string;
  meta: SyncMeta | null;
  ok: boolean;
};

type CronStatusConfig = {
  cron_dias_recent_orders: number;
  cron_produtos_limit: number;
  cron_enrich_enabled: boolean;
  cron_produtos_enabled: boolean;
  cron_produtos_enrich_estoque: boolean;
};

type CronSettingsState = {
  cronDiasRecentOrders: number;
  cronProdutosLimit: number;
  cronEnrichEnabled: boolean;
  cronProdutosEnabled: boolean;
  cronProdutosEnrichEstoque: boolean;
};

type CronStatusResponse = {
  lastRunAt: string | null;
  lastRunOk: boolean | null;
  lastError: string | null;
  steps: CronStatusStep[];
  cronTrigger: { createdAt: string; message: string; level: string } | null;
  schedule: {
    enabled: boolean;
    expression: string;
    description: string;
    defaults: {
      diasRecentes: number;
      produtosLimit: number;
      enrichEstoque: boolean;
      estoqueOnly?: boolean;
    };
  };
  config?: CronStatusConfig;
};

type ExtendedSyncProdutosResult = SyncProdutosResult & {
  errorMessage?: string;
};

type ProdutosSyncResponse = JsonRecord & {
  ok?: boolean;
  result?: ExtendedSyncProdutosResult | null;
};

type PipelineStepSummary = {
  name: CronStatusStep["name"] | string;
  ok?: boolean | null;
  meta?: SyncMeta | null;
} & JsonRecord;

type CronRunSummary = JsonRecord & {
  steps?: PipelineStepSummary[];
};
type LogFilter = "all" | "orders" | "enrich" | "produtos";

const LOG_FILTERS: { label: string; value: LogFilter }[] = [
  { label: "Todos", value: "all" },
  { label: "Pedidos", value: "orders" },
  { label: "Enrich", value: "enrich" },
  { label: "Produtos", value: "produtos" },
];

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const CALENDAR_STATUS_ORDER: CalendarDayStatus["status"][] = [
  "success",
  "error",
  "none",
];

const CALENDAR_STATUS_META: Record<
  CalendarDayStatus["status"],
  { label: string; badgeClass: string; surfaceClass: string; dotClass: string }
> = {
  success: {
    label: "Sincronizado",
    badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-100",
    surfaceClass: "border-emerald-300 bg-transparent",
    dotClass: "bg-emerald-500",
  },
  error: {
    label: "Erro",
    badgeClass: "bg-red-50 text-red-700 border border-red-100",
    surfaceClass: "border-red-300 bg-transparent",
    dotClass: "bg-red-500",
  },
  none: {
    label: "Sem sync",
    badgeClass: "bg-slate-100 text-slate-600 border border-slate-200",
    surfaceClass: "border-white/20 bg-transparent",
    dotClass: "bg-slate-400",
  },
};

const SECTION_PANEL_CLASS = "glass-panel glass-tint rounded-3xl border border-white/25";
const CARD_PANEL_CLASS = "glass-panel glass-tint rounded-2xl border border-white/15";
const CRON_STEP_LABELS: Record<CronStatusStep["name"], string> = {
  orders: "Pedidos recentes",
  enrich: "Enrich background",
  produtos: "Produtos/estoque",
};
const CRON_SETTINGS_DEFAULTS: CronSettingsState = {
  cronDiasRecentOrders: 2,
  cronProdutosLimit: 30,
  cronEnrichEnabled: true,
  cronProdutosEnabled: true,
  cronProdutosEnrichEstoque: true,
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string") {
      return maybeMessage;
    }
  }
  return "";
};

const formatJobId = (payload: JsonRecord | null | undefined): string => {
  if (!payload) return "n/d";
  const value = (payload as { jobId?: unknown }).jobId;
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toString();
  return "n/d";
};

export default function ConfiguracoesClient() {
  const [connecting, setConnecting] = useState(false);
  const handleConnectTiny = () => {
    setConnecting(true);
    window.location.href = "/api/tiny/auth/login";
  };

  const [overview, setOverview] = useState<SyncOverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const res = await fetch("/api/admin/sync/overview", {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Erro ao consultar overview");
      }
      setOverview(json);
    } catch (error) {
      console.error("[config] overview", error);
      setOverview(null);
      setOverviewError(getErrorMessage(error) || "Erro ao carregar status");
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logFilter, setLogFilter] = useState<LogFilter>("all");
  const [logsError, setLogsError] = useState<string | null>(null);

  const [calendarMonthKey, setCalendarMonthKey] = useState(() =>
    formatMonthKey(new Date()),
  );
  const [calendarDays, setCalendarDays] = useState<CalendarDayStatus[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const calendarMonthDate = useMemo(
    () => parseMonthKey(calendarMonthKey),
    [calendarMonthKey],
  );
  const [cronStatus, setCronStatus] = useState<CronStatusResponse | null>(null);
  const [cronStatusLoading, setCronStatusLoading] = useState(false);
  const [cronStatusError, setCronStatusError] = useState<string | null>(null);
  const [cronSettings, setCronSettings] = useState<CronSettingsState | null>(
    null,
  );
  const [cronSettingsDraft, setCronSettingsDraft] =
    useState<CronSettingsState | null>(null);
  const [cronSettingsLoading, setCronSettingsLoading] = useState(false);
  const [cronSettingsError, setCronSettingsError] = useState<string | null>(
    null,
  );
  const [cronSettingsSaving, setCronSettingsSaving] = useState(false);
  const cronStatusConfig = useMemo<CronSettingsState | null>(() => {
    if (!cronStatus?.config) return null;
    return {
      cronDiasRecentOrders:
        cronStatus.config.cron_dias_recent_orders ??
        CRON_SETTINGS_DEFAULTS.cronDiasRecentOrders,
      cronProdutosLimit:
        cronStatus.config.cron_produtos_limit ??
        CRON_SETTINGS_DEFAULTS.cronProdutosLimit,
      cronEnrichEnabled:
        typeof cronStatus.config.cron_enrich_enabled === "boolean"
          ? cronStatus.config.cron_enrich_enabled
          : CRON_SETTINGS_DEFAULTS.cronEnrichEnabled,
      cronProdutosEnabled:
        typeof cronStatus.config.cron_produtos_enabled === "boolean"
          ? cronStatus.config.cron_produtos_enabled
          : CRON_SETTINGS_DEFAULTS.cronProdutosEnabled,
      cronProdutosEnrichEstoque:
        typeof cronStatus.config.cron_produtos_enrich_estoque === "boolean"
          ? cronStatus.config.cron_produtos_enrich_estoque
          : CRON_SETTINGS_DEFAULTS.cronProdutosEnrichEstoque,
    };
  }, [cronStatus]);
  const cronConfigInUse =
    cronSettings ?? cronStatusConfig ?? CRON_SETTINGS_DEFAULTS;
  const cronFormReady = Boolean(cronSettingsDraft);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (logFilter !== "all") params.set("type", logFilter);
      const res = await fetch(`/api/admin/sync/logs?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Erro ao consultar logs");
      }
      setLogs(json.logs ?? []);
    } catch (error) {
      console.error("[config] logs", error);
      setLogs([]);
      setLogsError(getErrorMessage(error) || "Erro ao carregar logs");
    } finally {
      setLogsLoading(false);
    }
  }, [logFilter]);

  const fetchCalendar = useCallback(async () => {
    setCalendarLoading(true);
    setCalendarError(null);
    try {
      const params = new URLSearchParams();
      params.set("month", calendarMonthKey);
      const res = await fetch(`/api/admin/sync/calendar?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Erro ao consultar calendário");
      }
      setCalendarDays(json.days ?? []);
    } catch (error) {
      console.error("[config] calendar", error);
      setCalendarDays([]);
      setCalendarError(getErrorMessage(error) || "Erro ao carregar calendário");
    } finally {
      setCalendarLoading(false);
    }
  }, [calendarMonthKey]);
  const fetchCronStatus = useCallback(async () => {
    setCronStatusLoading(true);
    setCronStatusError(null);
    try {
      const res = await fetch("/api/admin/cron/status", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Erro ao consultar status do cron");
      }
      setCronStatus(json);
    } catch (error) {
      console.error("[config] cron-status", error);
      setCronStatus(null);
      setCronStatusError(
        getErrorMessage(error) || "Erro ao consultar status automático",
      );
    } finally {
      setCronStatusLoading(false);
    }
  }, []);

  const normalizeCronSettingsResponse = useCallback(
    (payload: JsonRecord | null | undefined): CronSettingsState => {
      const positive = (value: unknown, fallback: number) => {
        const parsed =
          typeof value === "string" ? Number(value) : Number(value ?? NaN);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
      };

      return {
        cronDiasRecentOrders: positive(
          payload?.cron_dias_recent_orders,
          CRON_SETTINGS_DEFAULTS.cronDiasRecentOrders,
        ),
        cronProdutosLimit: positive(
          payload?.cron_produtos_limit,
          CRON_SETTINGS_DEFAULTS.cronProdutosLimit,
        ),
        cronEnrichEnabled:
          typeof payload?.cron_enrich_enabled === "boolean"
            ? payload.cron_enrich_enabled
            : CRON_SETTINGS_DEFAULTS.cronEnrichEnabled,
        cronProdutosEnabled:
          typeof payload?.cron_produtos_enabled === "boolean"
            ? payload.cron_produtos_enabled
            : CRON_SETTINGS_DEFAULTS.cronProdutosEnabled,
        cronProdutosEnrichEstoque:
          typeof payload?.cron_produtos_enrich_estoque === "boolean"
            ? payload.cron_produtos_enrich_estoque
            : CRON_SETTINGS_DEFAULTS.cronProdutosEnrichEstoque,
      };
    },
    [],
  );

  const fetchCronSettings = useCallback(async () => {
    setCronSettingsLoading(true);
    setCronSettingsError(null);
    try {
      const res = await fetch("/api/admin/cron/settings", {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json?.error ?? "Erro ao consultar configurações do cron",
        );
      }
      const normalized = normalizeCronSettingsResponse(json);
      setCronSettings(normalized);
      setCronSettingsDraft(normalized);
    } catch (error) {
      console.error("[config] cron-settings", error);
      setCronSettings(null);
      setCronSettingsDraft(null);
      setCronSettingsError(
        getErrorMessage(error) || "Erro ao carregar configurações automáticas",
      );
    } finally {
      setCronSettingsLoading(false);
    }
  }, [normalizeCronSettingsResponse]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);
  useEffect(() => {
    fetchCronStatus();
  }, [fetchCronStatus]);

  useEffect(() => {
    fetchCronSettings();
  }, [fetchCronSettings]);

  const handleMonthNavigation = (delta: number) => {
    setCalendarMonthKey((current: string) => {
      const base = parseMonthKey(current);
      base.setMonth(base.getMonth() + delta);
      return formatMonthKey(base);
    });
  };

  const [recentDays, setRecentDays] = useState(2);
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [enrichLastCount, setEnrichLastCount] = useState(10);
  const [enrichNumeroPedido, setEnrichNumeroPedido] = useState("");
  const [produtosDays, setProdutosDays] = useState(30);

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSyncingOrders, setIsSyncingOrders] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isSyncingProdutos, setIsSyncingProdutos] = useState(false);
  const [isBackfillingProdutos, setIsBackfillingProdutos] = useState(false);
  const [isSyncingEstoqueOnly, setIsSyncingEstoqueOnly] = useState(false);
  const [produtosSyncResult, setProdutosSyncResult] =
    useState<ExtendedSyncProdutosResult | null>(null);
  const [postSyncRunning, setPostSyncRunning] = useState(false);
  const [syncingDay, setSyncingDay] = useState<string | null>(null);
  const postSyncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<CronRunSummary | null>(
    null,
  );
  const refreshAll = useCallback(() => {
    fetchOverview();
    fetchLogs();
    fetchCalendar();
    fetchCronStatus();
    fetchCronSettings();
  }, [
    fetchOverview,
    fetchLogs,
    fetchCalendar,
    fetchCronStatus,
    fetchCronSettings,
  ]);

  const postJson = useCallback(
    async (
      url: string,
      body?: JsonRecord,
      extraHeaders?: HeadersInit,
    ): Promise<JsonRecord> => {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...extraHeaders,
      };
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body ?? {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json?.details ?? json?.message ?? json?.error ?? "Erro inesperado",
        );
      }
      return json as JsonRecord;
    },
    [],
  );

  const executeBackgroundEnrich = useCallback(async () => {
    const res = await fetch("/api/tiny/sync/enrich-background", {
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.error ?? "Erro ao executar enrich background");
    }
    return json;
  }, []);

  const executeProdutosSync = useCallback(
    async (payload: JsonRecord): Promise<ProdutosSyncResponse> => {
      const res = await fetch("/api/admin/sync/produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload ?? {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.message ?? "Falha ao sincronizar produtos");
      }
      return json as ProdutosSyncResponse;
    },
    [],
  );

  const renderCronStatusBadge = (ok?: boolean | null) => {
    if (ok === undefined || ok === null) {
      return (
        <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-xs font-semibold">
          Sem dados
        </span>
      );
    }
    if (ok) {
      return (
        <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-semibold">
          Sucesso
        </span>
      );
    }
    return (
      <span className="px-3 py-1 rounded-full bg-red-50 text-red-700 border border-red-100 text-xs font-semibold">
        Erro
      </span>
    );
  };

  const formatYesNo = (value: boolean) => (value ? "Sim" : "Não");

  const updateCronSettingsDraft = useCallback(
    (patch: Partial<CronSettingsState>) => {
      setCronSettingsDraft((prev) => {
        const base = prev ?? cronSettings ?? null;
        if (!base) {
          return prev;
        }
        return { ...base, ...patch } as CronSettingsState;
      });
    },
    [cronSettings],
  );

  const handleCronNumberChange = useCallback(
    (field: "cronDiasRecentOrders" | "cronProdutosLimit") =>
      (event: ChangeEvent<HTMLInputElement>) => {
        const raw = event.target.valueAsNumber;
        const sanitized = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
        updateCronSettingsDraft({
          [field]: sanitized,
        } as Partial<CronSettingsState>);
      },
    [updateCronSettingsDraft],
  );

  const handleCronToggleChange = useCallback(
    (
      field:
        | "cronEnrichEnabled"
        | "cronProdutosEnabled"
        | "cronProdutosEnrichEstoque",
    ) =>
      (event: ChangeEvent<HTMLInputElement>) => {
        updateCronSettingsDraft({
          [field]: event.target.checked,
        } as Partial<CronSettingsState>);
      },
    [updateCronSettingsDraft],
  );

  const runManualPipeline = async () => {
    setPipelineRunning(true);
    setPipelineResult(null);
    try {
      const result = await postJson("/api/admin/cron/run-sync", {});
      setPipelineResult(result as CronRunSummary);
      handleActionSuccess("Pipeline completo executado manualmente.");
    } catch (error) {
      handleActionError(error);
    } finally {
      setPipelineRunning(false);
    }
  };

  const handleActionSuccess = useCallback(
    (message: string) => {
      setActionMessage(message);
      setActionError(null);
      refreshAll();
    },
    [refreshAll],
  );

  const handleActionError = useCallback((error: unknown) => {
    setActionError(getErrorMessage(error) || "Erro ao executar ação");
    setActionMessage(null);
  }, []);

  const saveCronSettings = useCallback(async () => {
    if (!cronSettingsDraft) {
      setCronSettingsError("Configurações automáticas ainda não carregadas.");
      return;
    }

    setCronSettingsSaving(true);
    setCronSettingsError(null);

    try {
      const payload = {
        cron_dias_recent_orders: cronSettingsDraft.cronDiasRecentOrders,
        cron_produtos_limit: cronSettingsDraft.cronProdutosLimit,
        cron_enrich_enabled: cronSettingsDraft.cronEnrichEnabled,
        cron_produtos_enabled: cronSettingsDraft.cronProdutosEnabled,
        cron_produtos_enrich_estoque:
          cronSettingsDraft.cronProdutosEnrichEstoque,
      };

      const res = await fetch("/api/admin/cron/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json?.error ?? "Erro ao salvar configurações automáticas",
        );
      }

      const normalized = normalizeCronSettingsResponse(json);
      setCronSettings(normalized);
      setCronSettingsDraft(normalized);
      handleActionSuccess("Configurações automáticas salvas.");
    } catch (error) {
      console.error("[config] save-cron-settings", error);
      setCronSettingsError(
        getErrorMessage(error) || "Erro ao salvar configurações automáticas",
      );
      handleActionError(error);
    } finally {
      setCronSettingsSaving(false);
    }
  }, [
    cronSettingsDraft,
    handleActionError,
    handleActionSuccess,
    normalizeCronSettingsResponse,
  ]);

  const runPostSyncWork = useCallback(async () => {
    setPostSyncRunning(true);
    setActionError(null);
    setActionMessage(
      "Sincronização finalizada. Rodando enrichment automático (frete + produtos)...",
    );

    let hadError = false;
    let freteOk = false;

    try {
      await executeBackgroundEnrich();
      freteOk = true;
    } catch (error) {
      hadError = true;
      setActionError(
        getErrorMessage(error) || "Erro ao enriquecer frete automaticamente",
      );
    }

    let produtosOk = false;

    try {
      const response = await executeProdutosSync({
        mode: "manual",
        limit: produtosDays,
        enrichAtivo: true,
        modeLabel: "manual_post_sync",
      });
      if (response?.ok === false) {
        throw new Error(
          response?.result?.errorMessage ?? "Sync de produtos retornou erro",
        );
      }
      produtosOk = true;
    } catch (error) {
      hadError = true;
      setActionError(
        getErrorMessage(error) ||
          "Erro ao sincronizar produtos automaticamente",
      );
    }

    if (!hadError && freteOk) {
      setActionMessage(
        produtosOk
          ? "Frete e produtos sincronizados automaticamente."
          : "Frete enriquecido automaticamente; verifique o endpoint de produtos.",
      );
    }

    setPostSyncRunning(false);
    refreshAll();
  }, [executeBackgroundEnrich, executeProdutosSync, produtosDays, refreshAll]);

  const triggerPostSyncEnrichment = useCallback(() => {
    postSyncQueueRef.current = postSyncQueueRef.current
      .catch(() => {})
      .then(runPostSyncWork);
    return postSyncQueueRef.current;
  }, [runPostSyncWork]);

  const syncRecentOrders = async () => {
    if (recentDays <= 0) {
      setActionError("Informe um número válido de dias.");
      return;
    }
    setIsSyncingOrders(true);
    try {
      const result = await postJson("/api/tiny/sync", {
        mode: "recent",
        diasRecentes: recentDays,
      });
      handleActionSuccess(
        `Sync de ${recentDays} dias disparada (job ${formatJobId(result)})`,
      );
      await triggerPostSyncEnrichment();
    } catch (error) {
      handleActionError(error);
    } finally {
      setIsSyncingOrders(false);
    }
  };

  const syncFullOrders = async () => {
    setIsSyncingOrders(true);
    try {
      const result = await postJson("/api/tiny/sync", { mode: "full" });
      handleActionSuccess(
        `Carga completa disparada (job ${formatJobId(result)})`,
      );
      await triggerPostSyncEnrichment();
    } catch (error) {
      handleActionError(error);
    } finally {
      setIsSyncingOrders(false);
    }
  };

  const syncRangeOrders = async () => {
    if (!rangeStart || !rangeEnd) {
      setActionError("Informe data inicial e final.");
      return;
    }
    setIsSyncingOrders(true);
    try {
      const result = await postJson("/api/tiny/sync", {
        mode: "range",
        dataInicial: rangeStart,
        dataFinal: rangeEnd,
      });
      handleActionSuccess(
        `Janela ${rangeStart} → ${rangeEnd} sincronizada (job ${formatJobId(result)})`,
      );
      await triggerPostSyncEnrichment();
    } catch (error) {
      handleActionError(error);
    } finally {
      setIsSyncingOrders(false);
    }
  };

  const syncSpecificDay = async (isoDate: string) => {
    setSyncingDay(isoDate);
    try {
      const result = await postJson("/api/tiny/sync", {
        mode: "range",
        dataInicial: isoDate,
        dataFinal: isoDate,
      });
      handleActionSuccess(
        `Dia ${formatDate(isoDate)} sincronizado (job ${formatJobId(result)})`,
      );
      await triggerPostSyncEnrichment();
    } catch (error) {
      handleActionError(error);
    } finally {
      setSyncingDay(null);
    }
  };

  const enrichLastOrders = async () => {
    if (enrichLastCount <= 0) {
      setActionError("Informe um número válido de pedidos.");
      return;
    }
    setIsEnriching(true);
    try {
      await postJson("/api/tiny/enrich", {
        mode: "last",
        last: enrichLastCount,
        delayMs: 500,
      });
      handleActionSuccess(
        `Enriquecimento dos últimos ${enrichLastCount} pedidos iniciado.`,
      );
    } catch (error) {
      handleActionError(error);
    } finally {
      setIsEnriching(false);
    }
  };

  const enrichByNumero = async () => {
    if (!enrichNumeroPedido.trim()) {
      setActionError("Informe o número do pedido Tiny.");
      return;
    }
    setIsEnriching(true);
    try {
      await postJson("/api/tiny/enrich", {
        mode: "numero",
        numeroPedido: enrichNumeroPedido.trim(),
        delayMs: 500,
      });
      handleActionSuccess(
        `Pedido ${enrichNumeroPedido.trim()} colocado na fila de enrichment.`,
      );
      setEnrichNumeroPedido("");
    } catch (error) {
      handleActionError(error);
    } finally {
      setIsEnriching(false);
    }
  };

  const runBackgroundEnrich = async () => {
    setIsEnriching(true);
    try {
      await executeBackgroundEnrich();
      handleActionSuccess("Rodada de enrichment em background concluída.");
    } catch (error) {
      handleActionError(error);
    } finally {
      setIsEnriching(false);
    }
  };

  const syncProdutos = async () => {
    setIsSyncingProdutos(true);
    try {
      const response = await executeProdutosSync({
        mode: "manual",
        limit: produtosDays,
        enrichEstoque: true,
        enrichAtivo: true,
        modeLabel: "manual_full_catalog",
      });
      const resultPayload = (response?.result ??
        response) as ExtendedSyncProdutosResult | null;
      setProdutosSyncResult(resultPayload);
      if (response?.ok === false) {
        throw new Error(
          resultPayload?.errorMessage ?? "Sync de produtos retornou erro",
        );
      }
      const total =
        resultPayload?.totalSincronizados ??
        resultPayload?.totalAtualizados ??
        "—";
      handleActionSuccess(
        `Produtos sincronizados (total processado: ${total}).`,
      );
    } catch (error) {
      console.error("[config] sync-produtos", error);
      setActionError(
        "Falha ao sincronizar produtos. Veja os logs de sincronização.",
      );
      setActionMessage(null);
    } finally {
      setIsSyncingProdutos(false);
    }
  };

  const syncEstoqueOnlyNow = async () => {
    const estoqueLimit = Math.max(1, Math.min(produtosDays || 40, 50));
    setIsSyncingEstoqueOnly(true);
    try {
      const response = await executeProdutosSync({
        mode: "manual",
        limit: estoqueLimit,
        estoqueOnly: true,
        enrichEstoque: true,
        enrichAtivo: true,
        workers: 1,
        modeLabel: "manual_estoque_only",
      });
      const resultPayload = (response?.result ??
        response) as ExtendedSyncProdutosResult | null;
      setProdutosSyncResult(resultPayload);
      if (response?.ok === false) {
        throw new Error(
          resultPayload?.errorMessage ?? "Atualização de estoque retornou erro",
        );
      }
      const total =
        resultPayload?.totalSincronizados ??
        resultPayload?.totalAtualizados ??
        "—";
      handleActionSuccess(`Estoque atualizado (lote processado: ${total}).`);
    } catch (error) {
      console.error("[config] sync-estoque-only", error);
      setActionError("Falha ao atualizar estoque. Consulte os logs.");
      setActionMessage(null);
    } finally {
      setIsSyncingEstoqueOnly(false);
    }
  };

  const backfillProdutos = async () => {
    setIsBackfillingProdutos(true);
    try {
      const response = await executeProdutosSync({
        mode: "backfill",
        backfill: true,
        enrichEstoque: false,
        enrichAtivo: false,
        modeLabel: "manual_backfill",
      });
      const resultPayload = (response?.result ??
        response) as ExtendedSyncProdutosResult | null;
      setProdutosSyncResult(resultPayload);
      if (response?.ok === false) {
        throw new Error(
          resultPayload?.errorMessage ?? "Backfill retornou erro",
        );
      }
      handleActionSuccess(
        "Backfill de produtos disparado. Acompanhe os logs para progresso.",
      );
    } catch (error) {
      console.error("[config] backfill-produtos", error);
      setActionError("Falha ao iniciar backfill de produtos.");
      setActionMessage(null);
    } finally {
      setIsBackfillingProdutos(false);
    }
  };

  const ordersRangeLabel = useMemo(() => {
    if (!overview) return "Sem dados";
    const { firstDate, lastDate } = overview.orders;
    if (!firstDate || !lastDate) return "Sem dados";
    return `${formatDate(firstDate)} → ${formatDate(lastDate)}`;
  }, [overview]);

  const calendarCells = useMemo(
    () => buildCalendarGrid(calendarMonthDate, calendarDays),
    [calendarMonthDate, calendarDays],
  );

  const calendarMonthLabel = useMemo(
    () => formatCalendarLabel(calendarMonthDate),
    [calendarMonthDate],
  );

  const overviewProdutosLastUpdated = overview?.produtos?.lastUpdatedAt ?? null;
  const produtosCursorSource = useMemo(() => {
    return (
      produtosSyncResult?.latestDataAlteracao ??
      produtosSyncResult?.updatedSince ??
      overviewProdutosLastUpdated
    );
  }, [overviewProdutosLastUpdated, produtosSyncResult]);
  const produtosCursorLabel = useMemo(
    () => formatTinyCursor(produtosCursorSource),
    [produtosCursorSource],
  );
  const produtosCounts = useMemo(
    () => ({
      novos: produtosSyncResult?.totalNovos ?? null,
      atualizados: produtosSyncResult?.totalAtualizados ?? null,
    }),
    [produtosSyncResult],
  );

  return (
    <div className="app-shell">
      <div className="app-shell-inner max-w-6xl space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>

        <TinyConnectionCard
          connecting={connecting}
          onConnect={handleConnectTiny}
        />

        <section
          className={`${SECTION_PANEL_CLASS} p-6 md:p-8 space-y-6 text-slate-900`}
        >
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Sincronização automática (Supabase)
              </h2>
              <p className="text-sm text-slate-600">
                O Supabase pg_cron chama{" "}
                <code className="font-mono text-xs">
                  public.cron_run_tiny_sync()
                </code>{" "}
                a cada 15 minutos (expressão
                <code className="ml-1 text-xs">*/15 * * * *</code>) e esse job
                aciona{" "}
                <code className="font-mono text-xs">
                  POST /api/admin/cron/run-sync
                </code>{" "}
                com os defaults abaixo. Essa rotina foca em manter estoque/preço
                atualizados; o cadastro completo (nome, categoria, mídia) segue
                disponível via botões manuais ou jobs diários.
              </p>
            </div>
            {cronStatusError && (
              <p className="text-sm text-red-500">{cronStatusError}</p>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className={`${CARD_PANEL_CLASS} p-5 space-y-4`}>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Status do cron (Supabase)
                    </p>
                    <p className="text-xs text-slate-500">
                      Última execução automática registrada
                    </p>
                  </div>
                  <button
                    onClick={fetchCronStatus}
                    className="inline-flex items-center justify-center px-3 py-1.5 rounded-full text-xs font-medium bg-slate-900/5 hover:bg-slate-900/10 text-slate-900"
                    disabled={cronStatusLoading}
                  >
                    {cronStatusLoading ? "Atualizando..." : "Atualizar"}
                  </button>
                </div>
                <div className="text-2xl font-semibold text-slate-900">
                  {cronStatus?.lastRunAt
                    ? formatDateTime(cronStatus.lastRunAt)
                    : "Sem registros ainda"}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {renderCronStatusBadge(cronStatus?.lastRunOk)}
                  {cronStatus?.cronTrigger && (
                    <span className="text-xs text-slate-500">
                      Trigger pg_cron em{" "}
                      {formatDateTime(cronStatus.cronTrigger.createdAt)}
                    </span>
                  )}
                </div>
                {cronStatus?.lastError && (
                  <p className="text-xs text-red-600">
                    Último erro: {cronStatus.lastError}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-white/20 space-y-2">
                <p className="text-xs font-semibold text-slate-500">
                  Defaults usados automaticamente
                </p>
                <ul className="text-xs text-slate-600 list-disc list-inside space-y-1">
                  <li>
                    Pedidos recentes (mode{" "}
                    <code className="font-mono">recent</code>) olhando os
                    últimos {cronStatus?.schedule?.defaults?.diasRecentes ?? 2}{" "}
                    dias.
                  </li>
                  <li>
                    Enrich background em sequência (itens + frete + canais +
                    cidade/UF).
                  </li>
                  <li>
                    Estoque/preço dos produtos (Tiny v3) atualizado em lotes de{" "}
                    {cronStatus?.schedule?.defaults?.produtosLimit ?? 30} itens
                    com workers=1 e modo estoque-only; o cadastro completo
                    (nome, categorias, imagens) deve ser rodado manualmente ou
                    via job diário.
                  </li>
                </ul>
              </div>

              <div className="pt-3 border-t border-white/20 space-y-2">
                <p className="text-xs font-semibold text-slate-500">
                  Config em uso
                </p>
                {cronSettingsLoading && !cronSettings ? (
                  <p className="text-xs text-slate-500">
                    Carregando configurações salvas...
                  </p>
                ) : (
                  <ul className="text-xs text-slate-600 list-disc list-inside space-y-1">
                    <li>
                      {cronConfigInUse.cronDiasRecentOrders} dias recentes de
                      pedidos
                    </li>
                    <li>
                      Limite de {cronConfigInUse.cronProdutosLimit} produtos por
                      rodada
                    </li>
                    <li>
                      Enrich automático:{" "}
                      {formatYesNo(cronConfigInUse.cronEnrichEnabled)}
                    </li>
                    <li>
                      Rodada automática de estoque:{" "}
                      {formatYesNo(cronConfigInUse.cronProdutosEnabled)}
                    </li>
                    <li>
                      Consultar estoque detalhado do Tiny (enrich):{" "}
                      {formatYesNo(cronConfigInUse.cronProdutosEnrichEstoque)}
                    </li>
                  </ul>
                )}
              </div>

              {cronStatus?.steps?.length ? (
                <div className="pt-3 border-t border-white/20 space-y-2">
                  <p className="text-xs font-semibold text-slate-500">
                    Última execução
                  </p>
                  <div className="space-y-2">
                    {cronStatus.steps.map((step) => (
                      <div
                        key={step.name}
                        className="flex items-center justify-between text-xs"
                      >
                        <div className="text-slate-600">
                          <span className="font-semibold text-slate-800">
                            {CRON_STEP_LABELS[step.name]}
                          </span>
                          <span className="block text-[11px] text-slate-500">
                            {step.meta?.processed ?? step.meta?.updated ?? "--"}{" "}
                            itens
                          </span>
                        </div>
                        {step.ok ? (
                          <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                            OK
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded-full bg-red-50 text-red-700 border border-red-100">
                            Erro
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className={`${CARD_PANEL_CLASS} p-5 space-y-4`}>
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Executar pipeline completo agora
                </h3>
                <p className="text-sm text-slate-600">
                  Replica exatamente o que o cron automático faz (pedidos
                  recentes → enrich → produtos) usando as MESMAS configurações
                  salvas abaixo (dias recentes, limite de produtos, flags de
                  enrich). Use quando precisar adiantar o processamento entre as
                  execuções de 15 min.
                </p>
              </div>
              <button
                onClick={runManualPipeline}
                disabled={pipelineRunning}
                className={`inline-flex items-center justify-center w-full px-4 py-2 rounded-full text-sm font-semibold text-white transition ${
                  pipelineRunning
                    ? "bg-slate-400 cursor-wait"
                    : "bg-slate-900 hover:bg-slate-800"
                }`}
              >
                {pipelineRunning
                  ? "Executando pipeline..."
                  : "Rodar pipeline completo agora"}
              </button>
              {pipelineResult?.steps && (
                <div className="space-y-2 text-xs text-slate-600">
                  {pipelineResult.steps.map((step) => {
                    const label =
                      CRON_STEP_LABELS[step.name as CronStatusStep["name"]] ??
                      step.name;
                    const stepOk = step.ok !== false;
                    return (
                      <div
                        key={step.name}
                        className="flex items-center justify-between"
                      >
                        <span className="font-semibold text-slate-800">
                          {label}
                        </span>
                        <span
                          className={`px-2 py-1 rounded-full ${
                            stepOk
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                              : "bg-red-50 text-red-700 border border-red-100"
                          }`}
                        >
                          {stepOk ? "OK" : "Erro"}
                        </span>
                      </div>
                    );
                  })}
                  <p className="text-[11px] text-slate-500">
                    Resposta completa disponível nos logs abaixo.
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="glass-panel glass-tint rounded-3xl border border-white/20 p-5 md:p-6 space-y-5">
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-slate-900">
                Configurações da sincronização automática
              </h3>
              <p className="text-sm text-slate-600">
                Valores aplicados pelo pg_cron e também pelo botão &ldquo;Rodar
                pipeline completo agora&rdquo;. Ajuste-os para controlar quantos
                dias entram na busca, se o enrich roda em sequência e se os
                produtos/estoque são sincronizados automaticamente.
              </p>
            </div>
            {cronSettingsError && (
              <p className="text-sm text-red-500">{cronSettingsError}</p>
            )}
            {cronSettingsLoading && !cronFormReady && (
              <p className="text-sm text-slate-500">
                Carregando configurações...
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-semibold text-slate-800">
                  Dias recentes para sincronizar pedidos automaticamente
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    className="mt-2 w-full rounded-2xl border border-white/30 bg-white/60 px-4 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500/40"
                    value={
                      cronSettingsDraft
                        ? cronSettingsDraft.cronDiasRecentOrders
                        : ""
                    }
                    onChange={handleCronNumberChange("cronDiasRecentOrders")}
                    disabled={!cronFormReady || cronSettingsSaving}
                  />
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  Usado no modo recent de pedidos. Mantenha baixo para respeitar
                  o rate limit do Tiny.
                </p>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-800">
                  Limite de produtos por rodada (sync automático)
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    className="mt-2 w-full rounded-2xl border border-white/30 bg-white/60 px-4 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500/40"
                    value={
                      cronSettingsDraft
                        ? cronSettingsDraft.cronProdutosLimit
                        : ""
                    }
                    onChange={handleCronNumberChange("cronProdutosLimit")}
                    disabled={!cronFormReady || cronSettingsSaving}
                  />
                </label>
                <p className="mt-1 text-xs text-slate-500">
                  Quantos produtos/estoque são consultados a cada rodada
                  automática.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                  checked={!!cronSettingsDraft?.cronEnrichEnabled}
                  onChange={handleCronToggleChange("cronEnrichEnabled")}
                  disabled={!cronFormReady || cronSettingsSaving}
                />
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    Rodar enrich automaticamente?
                  </p>
                  <p className="text-xs text-slate-500">
                    Executa a etapa de frete/canais/cidade assim que os pedidos
                    recentes terminam.
                  </p>
                </div>
              </label>

              <label className="flex gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                  checked={!!cronSettingsDraft?.cronProdutosEnabled}
                  onChange={handleCronToggleChange("cronProdutosEnabled")}
                  disabled={!cronFormReady || cronSettingsSaving}
                />
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    Sincronizar produtos automaticamente?
                  </p>
                  <p className="text-xs text-slate-500">
                    Quando ligado, cada rodada chama /api/produtos/sync com o
                    limite acima.
                  </p>
                </div>
              </label>

              <label className="flex gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                  checked={!!cronSettingsDraft?.cronProdutosEnrichEstoque}
                  onChange={handleCronToggleChange("cronProdutosEnrichEstoque")}
                  disabled={!cronFormReady || cronSettingsSaving}
                />
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    Atualizar estoque dos produtos no sync automático?
                  </p>
                  <p className="text-xs text-slate-500">
                    Desative se quiser apenas atualizar catálogo sem tocar no
                    saldo em estoque.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-slate-500">
                Salve as alterações antes de rodar o pipeline manual ou aguardar
                o cron.
              </p>
              <button
                onClick={saveCronSettings}
                disabled={!cronFormReady || cronSettingsSaving}
                className={`inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-semibold transition ${
                  !cronFormReady || cronSettingsSaving
                    ? "bg-slate-400 text-white cursor-not-allowed"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
              >
                {cronSettingsSaving
                  ? "Salvando configurações..."
                  : "Salvar configurações de sincronização"}
              </button>
            </div>
          </div>
        </section>

        <section
          className={`${SECTION_PANEL_CLASS} p-6 md:p-8 space-y-6 text-slate-900`}
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Status da sincronização Tiny
              </h2>
              <p className="text-sm text-slate-600">
                Panorama geral dos pedidos e produtos já armazenados no
                Supabase.
              </p>
            </div>
            <button
              onClick={fetchOverview}
              className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-slate-900/5 hover:bg-slate-900/10 text-sm font-medium text-slate-900"
              disabled={overviewLoading}
            >
              {overviewLoading ? "Atualizando..." : "Atualizar status"}
            </button>
          </div>

          {overviewError && (
            <p className="text-sm text-red-500">{overviewError}</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`${CARD_PANEL_CLASS} p-4 space-y-1`}>
              <div className="text-sm text-slate-600">Pedidos</div>
              <div className="text-3xl font-semibold text-slate-900">
                {overview?.orders.total ?? "—"}
              </div>
              <div className="text-xs text-slate-500">
                {overviewLoading ? "Carregando..." : ordersRangeLabel}
              </div>
            </div>

            <div className={`${CARD_PANEL_CLASS} p-4 space-y-1`}>
              <div className="text-sm text-slate-600">Pendências</div>
              <div className="text-lg font-semibold text-slate-900">
                Sem itens: {overview?.orders.withoutItems ?? "—"} • Sem frete:{" "}
                {overview?.orders.withoutFrete ?? "—"}
              </div>
              <div className="text-xs text-slate-500">
                Mantenha itens e frete atualizados antes dos dashboards.
              </div>
            </div>

            <div className={`${CARD_PANEL_CLASS} p-4 space-y-1`}>
              <div className="text-sm text-slate-600">Produtos</div>
              <div className="text-lg font-semibold text-slate-900">
                {overview?.produtos.total ?? "—"}
              </div>
              <div className="text-xs text-slate-500">
                Última:{" "}
                {overview?.produtos.lastUpdatedAt
                  ? formatDateTime(overview.produtos.lastUpdatedAt)
                  : "—"}{" "}
                · Sem imagem: {overview?.produtos.withoutImage ?? "—"}
              </div>
            </div>
          </div>
        </section>

        <section
          className={`${SECTION_PANEL_CLASS} p-6 md:p-8 space-y-5 text-slate-900`}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Calendário de sincronização
              </h2>
              <p className="text-sm text-slate-600">
                Acompanhe o status diário e dispare sincronizações pontuais.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleMonthNavigation(-1)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium bg-slate-900/5 hover:bg-slate-900/10 text-slate-900"
                >
                  ← Mês anterior
                </button>
                <div className="text-sm font-semibold text-slate-900 capitalize whitespace-nowrap">
                  {calendarMonthLabel}
                </div>
                <button
                  onClick={() => handleMonthNavigation(1)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium bg-slate-900/5 hover:bg-slate-900/10 text-slate-900"
                >
                  Próximo mês →
                </button>
              </div>
              <button
                onClick={fetchCalendar}
                className="px-4 py-2 rounded-full text-sm font-medium bg-slate-900 text-white hover:opacity-90"
                disabled={calendarLoading}
              >
                {calendarLoading ? "Atualizando..." : "Atualizar calendário"}
              </button>
            </div>
          </div>

          {calendarError && (
            <p className="text-sm text-red-500">{calendarError}</p>
          )}

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
            {CALENDAR_STATUS_ORDER.map((status) => {
              const meta = CALENDAR_STATUS_META[status];
              return (
                <span key={status} className="inline-flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${meta.dotClass}`}
                  />
                  {meta.label}
                </span>
              );
            })}
            {calendarLoading && (
              <span className="text-xs text-slate-500">Carregando...</span>
            )}
          </div>

          <div className="grid grid-cols-7 gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="text-center py-1">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-3">
            {calendarCells.map((cell) => {
              const meta =
                CALENDAR_STATUS_META[cell.status] ?? CALENDAR_STATUS_META.none;
              const syncingThisDay = syncingDay === cell.isoDate;
              const disabled = syncingThisDay || !cell.inMonth;
              return (
                <div
                  key={cell.isoDate}
                  className={`min-h-[140px] glass-tint rounded-2xl border p-3 flex flex-col gap-2 ${meta.surfaceClass} ${cell.inMonth ? "" : "opacity-50"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-semibold text-slate-900">
                      {cell.dayNumber}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${meta.badgeClass}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {cell.successesCount + cell.errorsCount > 0
                      ? [
                          cell.successesCount > 0
                            ? `${cell.successesCount} sucesso${cell.successesCount > 1 ? "s" : ""}`
                            : null,
                          cell.errorsCount > 0
                            ? `${cell.errorsCount} erro${cell.errorsCount > 1 ? "s" : ""}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : "Sem execuções registradas"}
                  </p>
                  <p
                    className="text-[11px] text-slate-400"
                    title={
                      cell.lastSyncAt
                        ? `Último sync em ${formatDateTime(cell.lastSyncAt)}`
                        : "Sem registros de sync"
                    }
                  >
                    Último sync:{" "}
                    {cell.lastSyncAt ? formatDateTime(cell.lastSyncAt) : "—"}
                  </p>
                  {cell.lastMessage && (
                    <p
                      className="text-[11px] text-slate-500 truncate"
                      title={cell.lastMessage}
                    >
                      {cell.lastMessage}
                    </p>
                  )}
                  <div className="mt-auto">
                    <button
                      onClick={() => syncSpecificDay(cell.isoDate)}
                      disabled={disabled}
                      className={`w-full text-xs font-semibold px-3 py-1.5 rounded-full transition ${disabled ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-slate-900/5 text-slate-900 hover:bg-slate-900/10"}`}
                    >
                      {syncingThisDay ? "Sincronizando..." : "Sincronizar dia"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section
          className={`${SECTION_PANEL_CLASS} p-6 md:p-8 space-y-6 text-slate-900`}
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Painel de operações
              </h2>
              <p className="text-sm text-slate-600">
                Dispare sincronizações pontuais e acompanhe o progresso.
              </p>
            </div>
            <div className="text-right text-sm text-slate-600">
              Pedidos sem itens: {overview?.orders.withoutItems ?? "—"} • Sem
              frete: {overview?.orders.withoutFrete ?? "—"}
            </div>
          </div>

          {(actionMessage || actionError) && (
            <div
              className={`rounded-2xl px-4 py-3 text-sm ${actionError ? "bg-red-50 text-red-700 border border-red-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"}`}
            >
              {actionError ?? actionMessage}
            </div>
          )}
          {postSyncRunning && (
            <p className="text-xs text-slate-500">
              Complementando com enrichment automático...
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className={`${CARD_PANEL_CLASS} p-4 space-y-4`}>
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Pedidos Tiny → banco
                </h3>
                <p className="text-sm text-slate-600">
                  Sincronize pedidos por janelas curtas para evitar timeout.
                </p>
              </div>

              <div className="space-y-3">
                <label className="text-xs text-slate-500">
                  Janela rápida (últimos X dias)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    className="w-20 px-3 py-2 rounded-full bg-white/70 border border-slate-200 text-sm text-slate-900"
                    value={recentDays}
                    onChange={(e) => setRecentDays(Number(e.target.value) || 1)}
                  />
                  <button
                    onClick={syncRecentOrders}
                    disabled={isSyncingOrders}
                    className={`inline-flex items-center justify-center px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-sm font-medium text-white transition ${isSyncingOrders ? "opacity-70 cursor-wait" : ""}`}
                  >
                    Sincronizar últimos {recentDays} dias
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-500">
                  Janela personalizada
                </label>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      className="flex-1 px-3 py-2 rounded-2xl bg-white/70 border border-slate-200 text-sm text-slate-900"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                    />
                    <span className="text-slate-500 text-sm">até</span>
                    <input
                      type="date"
                      className="flex-1 px-3 py-2 rounded-2xl bg-white/70 border border-slate-200 text-sm text-slate-900"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={syncRangeOrders}
                    disabled={isSyncingOrders}
                    className={`inline-flex items-center justify-center px-4 py-2 rounded-full bg-slate-900/5 hover:bg-slate-900/10 text-sm font-medium text-slate-900 ${isSyncingOrders ? "opacity-70 cursor-wait" : ""}`}
                  >
                    Sincronizar intervalo
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={syncFullOrders}
                  disabled={isSyncingOrders}
                  className={`w-full inline-flex items-center justify-center px-4 py-2 rounded-full bg-slate-900/5 hover:bg-slate-900/10 text-sm font-medium text-slate-900 ${isSyncingOrders ? "opacity-70 cursor-wait" : ""}`}
                >
                  Carga inicial completa (todos os pedidos)
                </button>
                <p className="text-xs text-slate-500">
                  Dica: use a carga completa apenas uma vez; depois mantenha com
                  janelas menores.
                </p>
              </div>
            </div>

            <div className={`${CARD_PANEL_CLASS} p-4 space-y-4`}>
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Enriquecimento (itens + frete)
                </h3>
                <p className="text-sm text-slate-600">
                  Gere itens, frete e cidade/UF antes de liberar dashboards.
                </p>
              </div>

              <div className="space-y-3">
                <label className="text-xs text-slate-500">
                  Últimos N pedidos
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    className="w-20 px-3 py-2 rounded-full bg-white/70 border border-slate-200 text-sm text-slate-900"
                    value={enrichLastCount}
                    onChange={(e) =>
                      setEnrichLastCount(Number(e.target.value) || 1)
                    }
                  />
                  <button
                    onClick={enrichLastOrders}
                    disabled={isEnriching}
                    className={`inline-flex items-center justify-center px-4 py-2 rounded-full bg-sky-600 hover:bg-sky-500 text-sm font-medium transition ${isEnriching ? "opacity-70 cursor-wait" : ""}`}
                  >
                    Enriquecer últimos {enrichLastCount}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs text-slate-500">
                  Pedido (nº Tiny)
                </label>
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={enrichNumeroPedido}
                    onChange={(e) => setEnrichNumeroPedido(e.target.value)}
                    placeholder="Ex: 251122F76FT7PJ"
                    className="px-3 py-2 rounded-2xl bg-white/70 border border-slate-200 text-sm text-slate-900"
                  />
                  <button
                    onClick={enrichByNumero}
                    disabled={isEnriching}
                    className={`inline-flex items-center justify-center px-4 py-2 rounded-full bg-slate-900/5 hover:bg-slate-900/10 text-sm font-medium text-slate-900 ${isEnriching ? "opacity-70 cursor-wait" : ""}`}
                  >
                    Enriquecer pedido específico
                  </button>
                </div>
              </div>

              <button
                onClick={runBackgroundEnrich}
                disabled={isEnriching}
                className={`w-full inline-flex items-center justify-center px-4 py-2 rounded-full bg-slate-900/5 hover:bg-slate-900/10 text-sm font-medium text-slate-900 ${isEnriching ? "opacity-70 cursor-wait" : ""}`}
              >
                Rodar enrich em background
              </button>
            </div>

            <div className={`${CARD_PANEL_CLASS} p-4 space-y-4`}>
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Produtos Tiny
                </h3>
                <p className="text-sm text-slate-600">
                  O pg_cron atualiza estoque/preço (Tiny v3) a cada 15 minutos
                  com lotes pequenos. Use estes botões para forçar uma rodada de
                  estoque agora ou para sincronizar o cadastro completo/backfill
                  quando incluir novos produtos.
                </p>
              </div>

              <div className="space-y-3">
                <label className="text-xs text-slate-500">
                  Limite (aprox. últimos X itens)
                </label>
                <input
                  type="number"
                  min={1}
                  className="w-24 px-3 py-2 rounded-full bg-white/70 border border-slate-200 text-sm text-slate-900"
                  value={produtosDays}
                  onChange={(e) =>
                    setProdutosDays(Number(e.target.value) || 10)
                  }
                />
              </div>

              <div className="space-y-1 text-xs text-slate-500">
                <p>
                  Último cursor Tiny:
                  <span className="ml-1 font-semibold text-slate-900">
                    {produtosCursorLabel}
                  </span>
                </p>
                <p>
                  Novos:{" "}
                  <span className="font-semibold text-slate-900">
                    {produtosCounts.novos ?? "—"}
                  </span>{" "}
                  • Atualizados:
                  <span className="ml-1 font-semibold text-slate-900">
                    {produtosCounts.atualizados ?? "—"}
                  </span>
                </p>
              </div>

              <p className="text-xs text-slate-500">
                O token seguro já está configurado no backend; este botão usa o
                endpoint admin protegido.
              </p>

              <button
                onClick={syncEstoqueOnlyNow}
                disabled={
                  isSyncingEstoqueOnly ||
                  isSyncingProdutos ||
                  isBackfillingProdutos
                }
                className={`w-full inline-flex items-center justify-center px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-sm font-medium text-white transition ${isSyncingEstoqueOnly || isSyncingProdutos || isBackfillingProdutos ? "opacity-70 cursor-wait" : ""}`}
              >
                Atualizar estoque agora
              </button>
              <p className="text-[11px] text-slate-500">
                Atualiza apenas saldo/reservado/disponível e preços para até 40
                itens por rodada (workers=1) usando modo estoque-only.
              </p>

              <button
                onClick={syncProdutos}
                disabled={
                  isSyncingProdutos ||
                  isBackfillingProdutos ||
                  isSyncingEstoqueOnly
                }
                className={`w-full inline-flex items-center justify-center px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white transition ${isSyncingProdutos || isBackfillingProdutos || isSyncingEstoqueOnly ? "opacity-70 cursor-wait" : ""}`}
              >
                Sincronizar produtos (cadastro completo)
              </button>

              <button
                onClick={backfillProdutos}
                disabled={
                  isBackfillingProdutos ||
                  isSyncingProdutos ||
                  isSyncingEstoqueOnly
                }
                className={`w-full inline-flex items-center justify-center px-4 py-2 rounded-full bg-slate-900/5 hover:bg-slate-900/10 text-sm font-medium text-slate-900 ${isBackfillingProdutos || isSyncingProdutos || isSyncingEstoqueOnly ? "opacity-70 cursor-wait" : ""}`}
              >
                Backfill de produtos
              </button>

              <p className="text-xs text-amber-600">
                Aviso: o modo backfill avança várias páginas e pode levar
                minutos. Use somente fora do horário de pico.
              </p>

              <p className="text-xs text-slate-500">
                Total: {overview?.produtos.total ?? "—"} • Sem imagem:{" "}
                {overview?.produtos.withoutImage ?? "—"}
              </p>
            </div>
          </div>
        </section>

        <section
          className={`${SECTION_PANEL_CLASS} p-6 md:p-8 space-y-4 text-slate-900`}
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Logs da sincronização
              </h2>
              <p className="text-sm text-slate-600">
                Use para acompanhar jobs e diagnósticos.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {LOG_FILTERS.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setLogFilter(value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border border-slate-200 ${
                    logFilter === value
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={fetchLogs}
                className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-slate-900/5 hover:bg-slate-900/10 text-xs font-medium text-slate-900"
                disabled={logsLoading}
              >
                {logsLoading ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
          </div>

          {logsError && <p className="text-sm text-red-500">{logsError}</p>}

          <div
            className={`${CARD_PANEL_CLASS} rounded-3xl p-4 md:p-6 overflow-x-auto`}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 text-xs uppercase tracking-wide">
                  <th className="py-2 pr-4">Horário</th>
                  <th className="py-2 pr-4">Tipo</th>
                  <th className="py-2 pr-4">Nível</th>
                  <th className="py-2 pr-4">Mensagem</th>
                  <th className="py-2">Meta</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && !logsLoading && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-500">
                      Nenhum log encontrado.
                    </td>
                  </tr>
                )}
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-slate-200">
                    <td className="py-3 pr-4 text-slate-700">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="py-3 pr-4 text-slate-700">{log.type}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${badgeClasses(log.level)}`}
                      >
                        {log.level}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate-900">{log.message}</td>
                    <td className="py-3 text-slate-600">
                      {log.meta ? (
                        <code className="text-xs break-words">
                          {JSON.stringify(log.meta).slice(0, 160)}
                          {JSON.stringify(log.meta).length > 160 ? "..." : ""}
                        </code>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

type CalendarCell = {
  isoDate: string;
  inMonth: boolean;
  dayNumber: number;
  status: CalendarDayStatus["status"];
  lastSyncAt: string | null;
  successesCount: number;
  errorsCount: number;
  lastMessage: string | null;
};

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonthKey(key: string) {
  const [year, month] = key.split("-").map((value) => Number(value));
  if (!Number.isNaN(year) && !Number.isNaN(month)) {
    return new Date(year, Math.min(Math.max(month - 1, 0), 11), 1);
  }
  return new Date();
}

function formatCalendarLabel(date: Date) {
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function buildCalendarGrid(
  referenceDate: Date,
  days: CalendarDayStatus[],
): CalendarCell[] {
  const map = new Map(days.map((day) => [day.date, day]));
  const firstOfMonth = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    1,
  );
  const gridStart = startOfWeek(firstOfMonth);
  const cells: CalendarCell[] = [];

  for (let slot = 0; slot < 42; slot += 1) {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + slot);
    const isoDate = formatIsoDate(current);
    const info = map.get(isoDate) ?? null;
    cells.push({
      isoDate,
      inMonth: current.getMonth() === referenceDate.getMonth(),
      dayNumber: current.getDate(),
      status: info?.status ?? "none",
      lastSyncAt: info?.lastSyncAt ?? null,
      successesCount: info?.successesCount ?? 0,
      errorsCount: info?.errorsCount ?? 0,
      lastMessage: info?.lastMessage ?? null,
    });
  }

  return cells;
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const weekday = result.getDay(); // 0 = domingo
  result.setDate(result.getDate() - weekday);
  return result;
}

function formatIsoDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

type TinyConnectionCardProps = {
  connecting: boolean;
  onConnect: () => void;
};

function TinyConnectionCard({
  connecting,
  onConnect,
}: TinyConnectionCardProps) {
  return (
    <div className="app-card p-4 space-y-3">
      <h2 className="text-sm font-semibold">Conexão com Tiny API v3</h2>
      <p className="text-xs text-[var(--text-muted)]">
        Clique no botão abaixo para conectar este painel à sua conta Tiny,
        usando o fluxo de autorização (OAuth2) da API v3.
      </p>
      <button
        disabled={connecting}
        onClick={onConnect}
        className="px-4 py-2 rounded-2xl bg-sky-500 text-white text-xs font-semibold disabled:opacity-60 hover:bg-sky-400"
      >
        {connecting ? "Redirecionando para o Tiny..." : "Conectar com Tiny v3"}
      </button>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatTinyCursor(value: string | null) {
  if (!value) return "—";
  let candidate = value;
  if (candidate.includes(" ") && !candidate.includes("T")) {
    candidate = candidate.replace(" ", "T");
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(candidate)) {
    candidate = `${candidate}Z`;
  }
  const date = new Date(candidate);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }
  return value;
}

function badgeClasses(level: string) {
  const normalized = level?.toLowerCase();
  if (normalized === "error")
    return "bg-red-50 text-red-700 border border-red-100";
  if (normalized === "warn" || normalized === "warning")
    return "bg-amber-50 text-amber-700 border border-amber-100";
  return "bg-slate-100 text-slate-700 border border-slate-200";
}
