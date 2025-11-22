import fs from 'fs';
import path from 'path';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const PAGE_SIZE = 500;

function toIsoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function fetchAllOrders(dataInicialISO: string, dataFinalISO: string) {
  const all: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const rangeStart = offset;
    const rangeEnd = offset + PAGE_SIZE - 1;
    const { data, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('id, uf, cidade, valor, data_criacao')
      .gte('data_criacao', dataInicialISO)
      .lte('data_criacao', dataFinalISO)
      .order('id', { ascending: true })
      .range(rangeStart, rangeEnd);

    if (error) throw error;

    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

async function main() {
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 29); // last 30 days

    const dataInicialISO = `${toIsoDate(start)}T00:00:00Z`;
    const dataFinalISO = `${toIsoDate(end)}T23:59:59Z`;

    console.log('Carregando pedidos de', dataInicialISO, 'até', dataFinalISO);
    const orders = await fetchAllOrders(dataInicialISO, dataFinalISO);
    console.log('Pedidos carregados:', orders.length);

    const mapaUF = new Map<string, { totalValor: number; totalPedidos: number }>();
    const mapaCidade = new Map<string, { uf: string | null; totalValor: number; totalPedidos: number }>();

    for (const o of orders) {
      const valor = typeof o.valor === 'number' ? o.valor : Number(o.valor) || 0;
      const uf = o.uf ? ('' + o.uf).trim().toUpperCase().slice(0, 2) : null;
      const cidade = o.cidade ? ('' + o.cidade).trim() : null;

      if (uf) {
        const cur = mapaUF.get(uf) ?? { totalValor: 0, totalPedidos: 0 };
        cur.totalValor += valor;
        cur.totalPedidos += 1;
        mapaUF.set(uf, cur);
      }

      if (cidade) {
        const key = `${cidade.toLowerCase()}|${uf ?? ''}`;
        const cur = mapaCidade.get(key) ?? { uf: uf ?? null, totalValor: 0, totalPedidos: 0 };
        cur.totalValor += valor;
        cur.totalPedidos += 1;
        mapaCidade.set(key, cur);
      }
    }

    const mapaVendasUF = Array.from(mapaUF.entries()).map(([uf, info]) => ({ uf, totalValor: info.totalValor, totalPedidos: info.totalPedidos })).sort((a, b) => b.totalValor - a.totalValor);
    const mapaVendasCidade = Array.from(mapaCidade.entries()).map(([key, info]) => ({ cidade: key.split('|')[0], uf: info.uf, totalValor: info.totalValor, totalPedidos: info.totalPedidos })).sort((a, b) => b.totalValor - a.totalValor);

    const out = {
      periodo: { dataInicial: toIsoDate(start), dataFinal: toIsoDate(end) },
      mapaVendasUF,
      mapaVendasCidade: mapaVendasCidade.slice(0, 500), // limit
    };

    const outPath = path.join(process.cwd(), 'public', 'data');
    if (!fs.existsSync(outPath)) fs.mkdirSync(outPath, { recursive: true });
    const file = path.join(outPath, 'mapa-vendas.json');
    fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf-8');
    console.log('Arquivo gerado:', file);
  } catch (e: any) {
    console.error('Erro ao gerar mapa de vendas:', e?.message || e);
    process.exit(1);
  }
}

main();
