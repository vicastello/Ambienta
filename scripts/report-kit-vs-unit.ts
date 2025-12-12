/**
 * Compara faturamento unitário vs kit no handler de vendas.
 * Uso:
 *   set -a && source .env.local && set +a && npx tsx scripts/report-kit-vs-unit.ts 2025-11-01 2025-11-30
 *   # datas são opcionais; defaults: 2025-11-01 a 2025-11-30
 */
import { NextRequest } from 'next/server';
import { GET } from '../app/api/reports/sales/route';

function mkReq(viewMode: 'unitario' | 'kit', dataInicio: string, dataFim: string) {
  return new NextRequest(
    `http://localhost/api/reports/sales?dataInicio=${dataInicio}&dataFim=${dataFim}` +
      `&groupBy=pedido&limit=10000&viewMode=${viewMode}`
  );
}

async function main() {
  const [dataInicio = '2025-11-01', dataFim = '2025-11-30'] = process.argv.slice(2);

  const unit = await (await GET(mkReq('unitario', dataInicio, dataFim)) as any).json();
  const kit = await (await GET(mkReq('kit', dataInicio, dataFim)) as any).json();

  const mapUnit = new Map(unit.data.map((p: any) => [p.pedido_id, p]));
  const mapKit = new Map(kit.data.map((p: any) => [p.pedido_id, p]));

  const deltas: {
    pedido_id: number | string;
    numero_pedido: number | string;
    canal: string;
    unit: number;
    kit: number;
    delta: number;
  }[] = [];

  for (const [pedidoId, up] of mapUnit.entries()) {
    const kp = mapKit.get(pedidoId);
    const du = Number(up?.valor_total ?? 0);
    const dk = Number(kp?.valor_total ?? 0);
    const delta = +(dk - du).toFixed(2);
    if (Math.abs(delta) > 0.01) {
      deltas.push({
        pedido_id: pedidoId,
        numero_pedido: up.numero_pedido,
        canal: up.canal,
        unit: du,
        kit: dk,
        delta,
      });
    }
  }

  const sumUnit = Number(unit.summary.faturamento_total || 0);
  const sumKit = Number(kit.summary.faturamento_total || 0);

  deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  console.log('=== RESUMO ===');
  console.log(`Período: ${dataInicio} -> ${dataFim}`);
  console.log(`Unitário: ${sumUnit.toFixed(2)} | Kit: ${sumKit.toFixed(2)} | Diferença: ${(sumKit - sumUnit).toFixed(2)}`);
  console.log(`Pedidos com diferença: ${deltas.length}`);
  console.log('');
  console.log('Top 20 diferenças (abs):');
  console.table(deltas.slice(0, 20));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
