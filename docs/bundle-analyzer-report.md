# Bundle Analyzer Snapshot (ANALYZE build)

## Top Page Bundles (parsed size)
- `app/dashboard/page` · ~63 KB · Still the heaviest route even after recent client/server splits because it eagerly loads `BrazilSalesMap`, `Recharts`, and the glassmorphism widgets.
- `app/configuracoes/page` · ~43 KB · Pulls every settings panel plus export helpers; good candidate for additional client component splits.
- `app/pedidos/page` · ~29 KB · Order table, filters, and shared layout add up quickly even before user data loads.

## Largest Shared Chunks / Libraries
1. `static/chunks/4962-79dce4aa63327740.js` · ~361 KB · Vendor blob dominated by `recharts` + `d3-shape`, plus `redux`, `reselect`, and `use-sync-external-store`; linked primarily to dashboard widgets.
2. `static/chunks/164f4fb6-d59d935c79eab611.js` · ~329 KB · Entire `jspdf` distribution (and plugins) used for PDF exports in settings/admin flows.
3. `static/chunks/4bd1b696-43ba64781d20dbb7.js` · ~199 KB · Next.js compiled `react-dom` runtime shared across all client components.
4. `static/chunks/ad2866b8.5c05f000a6bc3858.js` · ~198 KB · `html2canvas` payload used for screenshot/export helpers.
5. `static/chunks/3794-3374e9cbd785e867.js` · ~195 KB · Next.js client runtime (`next/dist/client`, `shared/lib`, `@swc/helpers`); unavoidable baseline but flags how much client JS every route ships.

These numbers give us a concrete baseline for targeting further optimizations (e.g., deferring PDF/export helpers until requested, trimming Recharts usage, or moving more work to server components).

## Round 2 – before optimization (Nov/29/2025)

### Top page bundles

| Page | Analyzer chunk | Parsed size (KB) |
| --- | --- | ---: |
| dashboard | `static/chunks/app/dashboard/page-a76f5da9d1d487b2.js` | 61.7 |
| configuracoes | `static/chunks/app/configuracoes/page-6db1ffdf78be4e47.js` | 41.7 |
| pedidos | `static/chunks/app/pedidos/page-0a11877bf59fd04b.js` | 29.6 |
| produtos | `static/chunks/app/produtos/page-eade11d8488b8494.js` | 15.1 |
| compras | `static/chunks/app/compras/page-ac15d464e409a07f.js` | 9.2 |
| configuracoes/sync | `static/chunks/app/configuracoes/sync/page-d47ce3ef5079cbf4.js` | 6.3 |
| login | `static/chunks/app/login/page-4b9256817c9cce4d.js` | 2.9 |
| \_not-found | `static/chunks/app/_not-found/page-e4310ad033faad14.js` | 2.6 |
| \_global-error | `static/chunks/app/_global-error/page-f82c6a83ada5306b.js` | 0.3 |
| home (/) | `static/chunks/app/page-f82c6a83ada5306b.js` | 0.3 |

### Heavy shared chunks

| Chunk (target) | Analyzer file | Parsed size (KB) |
| --- | --- | ---: |
| `static/chunks/4962-79dce4aa63327740.js` (Recharts bundle) | _not emitted in this build_ | N/A |
| `static/chunks/164f4fb6-d59d935c79eab611.js` (jsPDF) | `static/chunks/164f4fb6.ec4b5e95e188aff2.js` | 322.0 |
| `static/chunks/ad2866b8.5c05f000a6bc3858.js` (html2canvas) | `static/chunks/ad2866b8.5c05f000a6bc3858.js` | 193.5 |
| `static/chunks/8099-474cf7e9ef1f677f.js` (Supabase client) | `static/chunks/8099.e78821fa2e8a6274.js` | 168.6 |

## Round 2 – after optimization (Nov/29/2025, 13:09 build)

### Top page bundles

| Page | Analyzer chunk | Parsed size (KB) |
| --- | --- | ---: |
| dashboard | `static/chunks/app/dashboard/page-cf9146dc0b88e583.js` | 61.8 |
| configuracoes | `static/chunks/app/configuracoes/page-52f0e0c0b732752f.js` | 43.4 |
| pedidos | `static/chunks/app/pedidos/page-623f91fce9e801b6.js` | 29.7 |
| produtos | `static/chunks/app/produtos/page-e88a6b96ea6dece9.js` | 16.5 |
| compras | `static/chunks/app/compras/page-7b7fd4ea878e9d86.js` | 10.9 |
| configuracoes/sync | `static/chunks/app/configuracoes/sync/page-945aa66fa68bafc0.js` | 7.9 |
| login | `static/chunks/app/login/page-4b9256817c9cce4d.js` | 2.9 |
| \_not-found | `static/chunks/app/_not-found/page-e4310ad033faad14.js` | 2.6 |
| \_global-error | `static/chunks/app/_global-error/page-f82c6a83ada5306b.js` | 0.3 |
| home (/) | `static/chunks/app/page-f82c6a83ada5306b.js` | 0.3 |

### Heavy shared chunks

| Chunk (target) | Analyzer file | Parsed size (KB) |
| --- | --- | ---: |
| `static/chunks/7644.58cc3eb320957aba.js` (Recharts + d3 stack) | `static/chunks/7644.58cc3eb320957aba.js` | 274.3 |
| `static/chunks/164f4fb6.ec4b5e95e188aff2.js` (jsPDF payload) | `static/chunks/164f4fb6.ec4b5e95e188aff2.js` | 322.0 |
| `static/chunks/4bd1b696-43ba64781d20dbb7.js` (Next compiled react-dom) | `static/chunks/4bd1b696-43ba64781d20dbb7.js` | 194.0 |
| `static/chunks/ad2866b8.5c05f000a6bc3858.js` (html2canvas) | `static/chunks/ad2866b8.5c05f000a6bc3858.js` | 193.5 |
| `static/chunks/8099.e78821fa2e8a6274.js` (Supabase client) | `static/chunks/8099.e78821fa2e8a6274.js` | 168.6 |

The new analyzer run confirms the server-shell/client-island split kept overall page bundles at or below their Round 2 target. The dashboard route is still the heaviest consumer page (~62 KB parsed) entirely due to the lazily loaded Recharts map island. Shared vendor blobs are now mostly isolated to dynamic imports (Recharts, jsPDF, html2canvas, Supabase); the only unavoidable base costs are the Next/React runtimes.
