#!/usr/bin/env tsx
import { supabaseAdmin } from '../lib/supabaseAdmin';

const rawArgs = process.argv.slice(2);
const verbose = rawArgs.includes('--verbose');

type OrderRow = {
	id: number;
	tiny_id: number;
	numero_pedido: number | null;
	data_criacao: string | null;
	raw: Record<string, any> | null;
	raw_payload: Record<string, any> | null;
};

function parseArgs(): number[] {
	return rawArgs
		.filter((arg) => arg !== '--verbose')
		.map((raw) => Number(raw))
		.filter((n) => Number.isFinite(n) && n > 0) as number[];
}

async function fetchOrdersByTinyIds(tinyIds: number[]): Promise<OrderRow[]> {
	const { data, error } = await supabaseAdmin
		.from('tiny_orders')
		.select('id, tiny_id, numero_pedido, data_criacao, raw, raw_payload')
		.in('tiny_id', tinyIds);

	if (error) {
		console.error('❌ Erro ao buscar tiny_orders:', error.message);
		process.exit(1);
	}

	return (data ?? []) as OrderRow[];
}

async function fetchRecentOrdersWithoutItens(limit: number): Promise<OrderRow[]> {
	const { data, error } = await supabaseAdmin
		.rpc('orders_missing_itens', { p_limit: limit });

	if (error) {
		// fallback manual caso a função não exista em alguma base
		const { data: fallbackData, error: fallbackErr } = await supabaseAdmin
			.from('tiny_orders')
			.select('id, tiny_id, numero_pedido, data_criacao, raw, raw_payload')
			.order('data_criacao', { ascending: false, nullsLast: true })
			.limit(limit);

		if (fallbackErr) {
			console.error('❌ Erro ao buscar pedidos (fallback):', fallbackErr.message);
			process.exit(1);
		}

		return (fallbackData ?? []) as OrderRow[];
	}

	return (data ?? []) as OrderRow[];
}

async function fetchItensForOrders(orderIds: number[]) {
	if (!orderIds.length) return new Map<number, any[]>();

	const { data, error } = await supabaseAdmin
		.from('tiny_pedido_itens')
		.select('id_pedido, id_produto_tiny, nome_produto, quantidade, valor_total')
		.in('id_pedido', orderIds);

	if (error) {
		console.error('❌ Erro ao buscar tiny_pedido_itens:', error.message);
		process.exit(1);
	}

	const map = new Map<number, any[]>();
	for (const item of data ?? []) {
		const arr = map.get(item.id_pedido) ?? [];
		arr.push(item);
		map.set(item.id_pedido, arr);
	}

	return map;
}

function extractItensFromRaw(order: OrderRow) {
	const raw = order.raw ?? order.raw_payload ?? {};
	const itensRaw = Array.isArray(raw?.itens)
		? raw.itens
		: Array.isArray(raw?.pedido?.itens)
			? raw.pedido.itens
			: Array.isArray(raw?.pedido?.itensPedido)
				? raw.pedido.itensPedido
				: [];
	return itensRaw;
}

async function main() {
	const cliTinyIds = parseArgs();
	let orders: OrderRow[];

	if (cliTinyIds.length) {
		orders = await fetchOrdersByTinyIds(cliTinyIds);
		if (!orders.length) {
			console.log('⚠️  Nenhum pedido encontrado para os IDs informados.');
			return;
		}
	} else {
		orders = await fetchRecentOrdersWithoutItens(10);
		if (!orders.length) {
			console.log('🎉 Nenhum pedido recente sem itens encontrado.');
			return;
		}
	}

	const itensMap = await fetchItensForOrders(orders.map((o) => o.id));

	for (const order of orders) {
		const itens = itensMap.get(order.id) ?? [];
		console.log('\n────────────────────────────────────────');
		console.log(`Pedido tiny_id=${order.tiny_id} numero=${order.numero_pedido ?? 's/numero'}`);
		console.log(`ID local=${order.id} | Data=${order.data_criacao ?? 'n/d'}`);
		console.log(`Itens persistidos: ${itens.length}`);

		if (itens.length) {
			itens.slice(0, 5).forEach((item, idx) => {
				console.log(`  ${idx + 1}. ${item.nome_produto} (qtd ${item.quantidade})`);
			});
			if (verbose) {
				console.log('  itens completos:', JSON.stringify(itens, null, 2));
			}
		}

		const rawItens = extractItensFromRaw(order);
		console.log(`Itens no RAW: ${rawItens.length}`);
		if (rawItens.length) {
			rawItens.slice(0, 5).forEach((item: any, idx: number) => {
				const produto = item.produto ?? item;
				console.log(`  RAW ${idx + 1}. ${produto.descricao ?? produto.nome ?? 'Sem descrição'} (qtd ${item.quantidade ?? 'n/d'})`);
			});
		} else {
			console.log('  RAW também está vazio para este pedido.');
		}

		if (verbose && rawItens.length) {
			console.log('  raw itens completos:', JSON.stringify(rawItens, null, 2));
		}

		if (verbose) {
			const produtoIds = Array.from(
				new Set(
					[
						...itens.map((i) => i.id_produto_tiny).filter(Boolean),
						...rawItens
							.map((item: any) => item?.produto?.id ?? item?.idProduto ?? item?.id)
							.filter((id: any): id is number => Number.isFinite(Number(id)))
					].map((id) => Number(id))
				)
			);

			if (produtoIds.length) {
				const { data: produtos, error: prodErr } = await supabaseAdmin
					.from('tiny_produtos')
					.select('id_produto_tiny, nome')
					.in('id_produto_tiny', produtoIds);
				if (prodErr) {
					console.error('  ❌ Erro ao buscar tiny_produtos:', prodErr.message);
				} else {
					console.log('  Produtos catalogados encontrados:', produtos?.map((p) => p.id_produto_tiny));
				}
			} else {
				console.log('  Nenhum id de produto detectado para consulta.');
			}
		}
	}
}

main().catch((err) => {
	console.error('❌ Erro inesperado:', err?.message ?? err);
	process.exit(1);
});

