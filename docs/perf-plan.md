<!--
Performance Trim Plan (2025-11-29)
1. app/dashboard/page.tsx – move layout/data fetching logic to server wrapper, lazy-load charts (BrazilSalesMap, Recharts widgets) via dynamic imports, hoist constants to reduce re-renders.
2. app/produtos/page.tsx – convert to server component shell and push filters/table interactivity into a smaller client child; memoize column configs and fetch params.
3. app/pedidos/page.tsx – same split: server-driven data fetch with lightweight client filter panel; ensure list pagination stays server-side.
4. components/BrazilSalesMap.tsx – turn into client-only dynamic import, deferring until map section visible.
5. components/MultiSelectDropdown.tsx – review hooks/props to memoize option lists and avoid recreating handlers every render.
-->
