# UI tokens e padrões da dashboard

- Cards (Liquid Glass):
  - Classes base: `rounded-2xl border border-white/10 dark:border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.35)]`
  - Variantes costumizadas adicionam gradientes leves (`from-white/10 to-white/5`) e padding conforme o bloco.
  - Espaçamentos típicos: `p-4`, `p-5` ou `p-6` dependendo do contexto.

- Títulos e seções:
  - Header de seção: `text-sm font-medium tracking-wide text-zinc-200` com descrição `text-xs text-zinc-400`.
  - Uso frequente de chips/legendas com `rounded-full bg-white/70 dark:bg-slate-900/60 px-3 py-1 text-xs`.

- Gráficos (Recharts) — padrão da dashboard:
  - Componentes: `AreaChart` com `CartesianGrid` (stroke `rgba(148,163,184,0.25)`, dasharray `3 3`, vertical desativado).
  - `Tooltip` com fundo escuro translúcido `rgba(15,23,42,0.95)`, borda `rgba(148,163,184,0.4)`, radius 12.
  - `XAxis`/`YAxis` com stroke `rgba(148,163,184,0.9)`, `tickLine` desabilitado.
  - Áreas/linhas com `strokeWidth` 2, pontos `dot` raio 3.
  - Gradiente primário: cor de destaque `#009DA8`, opacidade 0.8 → 0.1.
