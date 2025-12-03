#!/usr/bin/env tsx
import process from 'node:process';
import { supabaseAdmin } from '../lib/supabaseAdmin';

async function main() {
  const codigo = process.argv[2];
  if (!codigo) {
    console.error('Uso: npx tsx scripts/inspectProduto.ts <codigo>');
    process.exit(1);
  }

  const { data, error } = await supabaseAdmin
    .from('tiny_produtos')
    .select('id_produto_tiny,codigo,nome,tipo,raw_payload')
    .ilike('codigo', codigo);

  if (error) {
    console.error('Erro ao buscar produto:', error.message);
    process.exit(1);
  }

  if (!data?.length) {
    console.error(`Produto ${codigo} não encontrado.`);
    process.exit(1);
  }

  console.log(`Encontrados ${data.length} registros:`);
  for (const produto of data) {
    console.log({
      id_produto_tiny: produto.id_produto_tiny,
      codigo: produto.codigo,
      nome: produto.nome,
      tipo: produto.tipo,
      raw_payload: produto.raw_payload,
    });
  }
}

main();
