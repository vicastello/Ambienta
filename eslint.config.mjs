import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  {
    ignores: [
      "app/api/tiny/**",
      "app/api/admin/cron/**",
      "app/api/admin/migrate-produtos/route.ts",
      "app/api/orders/route.ts",
      "lib/channelNormalizer.ts",
      "lib/cidadeUfEnricher.ts",
      "lib/freteEnricher.ts",
      "lib/pedidoItensHelper.ts",
      "lib/syncProcessor.ts",
      ".next",
      "node_modules",
      "supabase/functions",
      "scripts",
    ],
  },
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
