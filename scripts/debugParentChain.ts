#!/usr/bin/env tsx
import process from 'node:process';
import { loadProdutoParentMapping, resolveParentChain } from '../lib/productRelationships';

async function main() {
  const identifier = process.argv[2];
  if (!identifier) {
    console.error('Uso: npx tsx scripts/debugParentChain.ts <id-ou-sku>');
    process.exit(1);
  }

  const maybeId = Number(identifier);
  const produtoId = Number.isFinite(maybeId) ? maybeId : null;
  const sku = Number.isFinite(maybeId) ? null : identifier;

  const mapping = await loadProdutoParentMapping();
  const result = resolveParentChain(produtoId, sku, mapping);

  console.log(
    JSON.stringify(
      {
        input: { produtoId, sku },
        chain: result.chain.map((info) => ({
          id: info.parentId,
          codigo: info.parentCodigo,
          nome: info.parentNome,
          tipo: info.parentTipo,
          childSource: info.childSource,
        })),
        finalParent: result.finalParent
          ? {
              id: result.finalParent.parentId,
              codigo: result.finalParent.parentCodigo,
              nome: result.finalParent.parentNome,
              tipo: result.finalParent.parentTipo,
              childSource: result.finalParent.childSource,
            }
          : null,
      },
      null,
      2
    )
  );
}

main();
