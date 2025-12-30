#!/usr/bin/env tsx
/**
 * Script para importar pedidos do Tiny via CSV exportado do painel.
 * 
 * IMPORTANTE: O CSV do Tiny é itemizado (uma linha por item de pedido).
 * Este script agrega os itens por pedido.
 * 
 * Uso:
 *   npx tsx scripts/importTinyCSV.ts ./pedidos.csv
 *   npx tsx scripts/importTinyCSV.ts ./pedidos.csv --dry-run
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { createReadStream, existsSync } from 'fs';
import { parse } from 'csv-parse';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/db-public';

// Load env from multiple possible locations
const envFiles = [
    '.env.development.local',
    '.env.vercel.production.local',
    '.env.vercel',
    '.env.local',
];

for (const envFile of envFiles) {
    const envPath = resolve(process.cwd(), envFile);
    if (existsSync(envPath)) {
        config({ path: envPath, override: false });
    }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Variáveis de ambiente não configuradas');
    process.exit(1);
}

const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
});

// Mapeamento de situação textual para código numérico
const SITUACAO_MAP: Record<string, number> = {
    'aberta': 0,
    'aberto': 0,
    'faturada': 1,
    'faturado': 1,
    'cancelada': 2,
    'cancelado': 2,
    'aprovada': 3,
    'aprovado': 3,
    'preparando envio': 4,
    'enviada': 5,
    'enviado': 5,
    'entregue': 6,
    'pronto envio': 7,
    'dados incompletos': 8,
    'não entregue': 9,
    'nao entregue': 9,
};

function parseDate(value: string): string | null {
    if (!value) return null;

    // Tenta DD/MM/YYYY
    const brMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (brMatch) {
        return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
    }

    // Tenta YYYY-MM-DD
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        return value.split('T')[0];
    }

    return null;
}

function parseNumber(value: string | undefined): number | null {
    if (!value || value.trim() === '') return null;
    const clean = value
        .replace(/R\$\s*/g, '')
        .replace(/\s/g, '')
        .replace(/\./g, '')
        .replace(',', '.');
    const num = parseFloat(clean);
    return isNaN(num) ? null : num;
}

function parseSituacao(value: string | undefined): number | null {
    if (!value) return null;
    const numVal = parseInt(value);
    if (!isNaN(numVal) && numVal >= 0 && numVal <= 9) return numVal;
    const lower = value.toLowerCase().trim();
    return SITUACAO_MAP[lower] ?? null;
}

interface CsvRow {
    [key: string]: string;
}

interface PedidoAgregado {
    tiny_id: number;
    numero_pedido: number;
    data_criacao: string | null;
    cliente_nome: string | null;
    cidade: string | null;
    uf: string | null;
    valor_frete: number | null;
    situacao: number | null;
    valor_total_pedido: number;
    raw: any;
    numero_pedido_ecommerce: string | null;
    itens: Array<{
        id_produto_tiny: number | null;
        codigo_produto: string | null;
        nome_produto: string;
        quantidade: number;
        valor_unitario: number;
        valor_total: number;
    }>;
}

async function importCSV(filePath: string, dryRun: boolean): Promise<{ pedidos: number; itens: number }> {
    const { deriveCanalFromRaw } = await import('../lib/tinyMapping');
    const absolutePath = resolve(process.cwd(), filePath);

    if (!existsSync(absolutePath)) {
        console.error(`❌ Arquivo não encontrado: ${absolutePath}`);
        process.exit(1);
    }

    console.log(`📄 Arquivo: ${absolutePath}`);
    console.log(`🔧 Modo: ${dryRun ? 'DRY-RUN' : 'PRODUÇÃO'}\n`);

    const rows: CsvRow[] = [];

    await new Promise<void>((resolve, reject) => {
        createReadStream(absolutePath)
            .pipe(parse({
                columns: true,
                skip_empty_lines: true,
                trim: true,
                bom: true,
            }))
            .on('data', (row: CsvRow) => rows.push(row))
            .on('end', () => resolve())
            .on('error', (err) => reject(err));
    });

    console.log(`📊 Linhas lidas: ${rows.length}`);

    if (rows.length === 0) {
        console.log('⚠️  Nenhum dado encontrado no CSV');
        return { pedidos: 0, itens: 0 };
    }

    // Agregar por pedido (ID)
    const pedidosMap = new Map<number, PedidoAgregado>();

    for (const row of rows) {
        const tinyId = parseInt(row['ID']) || null;
        const numeroPedido = parseInt(row['Número do pedido']) || null;

        if (!tinyId || !numeroPedido) continue;

        if (!pedidosMap.has(tinyId)) {
            pedidosMap.set(tinyId, {
                tiny_id: tinyId,
                numero_pedido: numeroPedido,
                data_criacao: parseDate(row['Data']),
                cliente_nome: row['Nome do contato'] || null,
                cidade: row['Município'] || row['Município entrega'] || null,
                uf: row['UF'] || row['UF entrega'] || null,
                valor_frete: parseNumber(row['Frete pedido']),
                situacao: parseSituacao(row['Situação']),
                valor_total_pedido: 0,
                raw: row,
                numero_pedido_ecommerce: row['Número da ordem de compra'] || null,
                itens: [],
            });
        }

        const pedido = pedidosMap.get(tinyId)!;

        // Adicionar item
        const valorUnitario = parseNumber(row['Valor unitário']) || 0;
        const quantidade = parseNumber(row['Quantidade']) || 1;
        const valorTotal = valorUnitario * quantidade;

        pedido.itens.push({
            id_produto_tiny: parseInt(row['ID produto']) || null,
            codigo_produto: row['Código (SKU)'] || null,
            nome_produto: row['Descrição'] || 'Sem nome',
            quantidade,
            valor_unitario: valorUnitario,
            valor_total: valorTotal,
        });

        pedido.valor_total_pedido += valorTotal;
    }

    const pedidos = Array.from(pedidosMap.values());
    console.log(`📦 Pedidos únicos: ${pedidos.length}\n`);

    if (dryRun) {
        console.log('🔍 Primeiros 3 pedidos (preview):');
        for (const p of pedidos.slice(0, 3)) {
            console.log(`  #${p.numero_pedido} - ${p.cliente_nome} - R$${p.valor_total_pedido.toFixed(2)} - ${p.itens.length} itens`);
        }
        console.log('\n⚠️  DRY-RUN: nenhum dado foi inserido');
        return { pedidos: pedidos.length, itens: rows.length };
    }

    // Inserir pedidos
    const BATCH_SIZE = 50;
    let insertedPedidos = 0;
    let insertedItens = 0;

    for (let i = 0; i < pedidos.length; i += BATCH_SIZE) {
        const batch = pedidos.slice(i, i + BATCH_SIZE);

        process.stdout.write(`\r📤 Processando pedidos: ${Math.min(i + BATCH_SIZE, pedidos.length)}/${pedidos.length}`);

        // Preparar rows para tiny_orders
        const orderRows = batch.map(p => ({
            tiny_id: p.tiny_id,
            numero_pedido: p.numero_pedido,
            data_criacao: p.data_criacao,
            cliente_nome: p.cliente_nome,
            cidade: p.cidade,
            uf: p.uf,
            valor_frete: p.valor_frete,
            situacao: p.situacao,
            valor_total_pedido: p.valor_total_pedido,
            valor: p.valor_total_pedido, // alias
            raw: p.raw,
            numero_pedido_ecommerce: p.numero_pedido_ecommerce,
            canal: deriveCanalFromRaw(p.raw),
        }));

        // Buscar existentes para preservar dados enriquecidos
        const tinyIds = batch.map(p => p.tiny_id);
        const { data: existing } = await supabase
            .from('tiny_orders')
            .select('tiny_id, canal, valor_esperado_liquido')
            .in('tiny_id', tinyIds);

        const existingMap = new Map(
            (existing || []).map(e => [e.tiny_id, e])
        );

        // Mesclar preservando dados enriquecidos
        const mergedRows = orderRows.map(row => {
            const ex = existingMap.get(row.tiny_id);
            if (ex) {
                return {
                    ...row,
                    // Prefer derived channel if it found something specific (not 'Outros'), otherwise valid existing channel
                    canal: (row.canal && row.canal !== 'Outros') ? row.canal : ex.canal,
                    valor_esperado_liquido: ex.valor_esperado_liquido, // preservar
                };
            }
            return row;
        });

        const { error: orderError } = await supabase
            .from('tiny_orders')
            .upsert(mergedRows, { onConflict: 'tiny_id' });

        if (orderError) {
            console.error(`\n❌ Erro ao inserir pedidos:`, orderError.message);
            continue;
        }

        insertedPedidos += batch.length;

        // Buscar IDs locais dos pedidos inseridos
        const { data: insertedOrders } = await supabase
            .from('tiny_orders')
            .select('id, tiny_id')
            .in('tiny_id', tinyIds);

        if (!insertedOrders) continue;

        const tinyToLocalId = new Map(insertedOrders.map(o => [o.tiny_id, o.id]));

        // Preparar itens
        const allItens: any[] = [];
        for (const p of batch) {
            const localId = tinyToLocalId.get(p.tiny_id);
            if (!localId) continue;

            for (const item of p.itens) {
                allItens.push({
                    id_pedido: localId,
                    id_produto_tiny: null, // Não vincula produto por FK - evita constraint errors
                    codigo_produto: item.codigo_produto,
                    nome_produto: item.nome_produto,
                    quantidade: item.quantidade,
                    valor_unitario: item.valor_unitario,
                    valor_total: item.valor_total,
                });
            }
        }

        if (allItens.length > 0) {
            const { error: itensError } = await supabase
                .from('tiny_pedido_itens')
                .upsert(allItens, {
                    onConflict: 'id_pedido,codigo_produto,valor_unitario,valor_total',
                    ignoreDuplicates: true
                });

            if (itensError) {
                console.error(`\n⚠️  Erro ao inserir itens (alguns podem já existir):`, itensError.message);
            } else {
                insertedItens += allItens.length;
            }
        }
    }

    console.log(`\n✅ Pedidos: ${insertedPedidos} | Itens: ${insertedItens}`);
    return { pedidos: insertedPedidos, itens: insertedItens };
}

// Main
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const filePath = args.find(a => !a.startsWith('--'));

if (!filePath) {
    console.log('Uso: npx tsx scripts/importTinyCSV.ts <caminho-csv> [--dry-run]');
    process.exit(1);
}

importCSV(filePath, dryRun).catch((err) => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
});

export { importCSV };
