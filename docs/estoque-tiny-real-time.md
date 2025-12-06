# Estoque quase em tempo real (Tiny v3)

Este fluxo complementa o espelho de produtos (`tiny_produtos`) com uma consulta "live" ao Tiny (API v3 `/estoque/{idProduto}`), exposta via rota interna.

## Rota

`GET /api/tiny/produtos/[idProdutoTiny]/estoque`

Query `source`:
- `cache` → lê apenas Supabase (`tiny_produtos`).
- `live` → consulta Tiny v3 diretamente (pode demorar/errar se o Tiny estiver fora).
- `hybrid` (default) → retorna cache se `data_atualizacao_tiny` for recente; caso contrário, atualiza Supabase ao vivo e devolve o snapshot.

Resposta de sucesso:

```jsonc
{
  "ok": true,
  "source": "cache" | "live" | "hybrid-cache" | "hybrid-live",
  "data": {
    "idProdutoTiny": 123,
    "saldo": 10,
    "reservado": 2,
    "disponivel": 8,
    "depositos": [
      { "id": 1, "nome": "Central", "desconsiderar": false, "saldo": 5, "reservado": 1, "disponivel": 4 }
    ],
    "updatedAt": "2025-12-05T10:00:00.000Z"
  }
}
```

Erro Tiny:

```jsonc
{
  "ok": false,
  "error": {
    "code": "TINY_ESTOQUE_ERROR",
    "message": "Falha ao consultar estoque no Tiny",
    "details": "Tiny estoque error (status ...)"
  }
}
```

## Uso rápido (server-side fetch)

```ts
const res = await fetch(
  `${process.env.NEXT_PUBLIC_BASE_URL}/api/tiny/produtos/123/estoque?source=hybrid`,
  { cache: 'no-store' }
);
const json = await res.json();
```

- `source=hybrid` tenta o cache e atualiza ao vivo se o dado estiver velho (>10 min) ou inexistente.
- Apenas leitura; não altera estoque no Tiny.

