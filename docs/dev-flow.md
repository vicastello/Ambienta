## Fluxo rápido para migrations v2 (schema public)

1. `supabase migration new descricao_da_mudanca`
2. Edite o SQL em `supabase/migrations/...`
3. `supabase stop --all`
4. `supabase start`
5. `supabase db reset` (LOCAL, **sem** `--linked` — aplica seed + baseline + novas migrations)
6. Validou? Então `supabase db push --linked` para aplicar no projeto remoto.

- Nunca rodar `supabase db reset --linked` em produção.
- A baseline v2 é `supabase/migrations/20251126000000_v2_public_baseline.sql` e **não deve ser alterada**; novas mudanças entram sempre como migrations adicionais.

---

## Arquivos essenciais

- `supabase/migrations/20251126000000_v2_public_baseline.sql` — fotografia do schema `public` atual (baseline v2, only public).
- `supabase-export/schema.sql` — DDL completo exportado.
- `supabase-export/hardening.sql` — revogações/RLS/policies de segurança.
- `src/types/db-public.ts` — tipos `Database` para Supabase v2 (Rows/Insert/Update + Functions).
- `docs/database-overview.md` — visão geral das tabelas, funções e RLS.
- `lib/supabaseClient.ts` / `lib/supabaseAdmin.ts` — clients tipados (`Database`) para anon e service role.

---

## Como escrever código novo com Supabase

- Use os repositórios em `src/repositories/` (por exemplo: tinyProdutos, tinyPedidoItens, tinyOrders, sync) **em vez** de chamar `supabase.from(...)` direto nas rotas.
- Sempre importe tipos de `src/types/db-public.ts` (ex.: `Database`, `TinyProdutosRow`, `TinyOrdersRow`).

Exemplo de serviço usando um repositório:

```ts
import { listProdutos } from '@/src/repositories/tinyProdutosRepository';

export async function buscarProdutosAtivos(busca: string) {
  const { produtos } = await listProdutos({
    search: busca,
    situacao: 'A',
    limit: 50,
    offset: 0,
  });

  // produtos já está tipado como TinyProdutosRow[]
  return produtos;
}
