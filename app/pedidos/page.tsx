import { AppLayout } from '@/components/layout/AppLayout';

export default function PedidosPage() {
  return (
    <AppLayout title="Pedidos">
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <h3 className="text-sm font-semibold mb-3">Filtros</h3>
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="block text-xs font-medium mb-1">
              Buscar (pedido ou cliente)
            </label>
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              placeholder="Ex: 1234 ou Maria"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Status
            </label>
            <select className="w-full border rounded px-2 py-1 text-sm">
              <option>Todos</option>
              <option>Em aberto</option>
              <option>Faturado</option>
              <option>Cancelado</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Data inicial
            </label>
            <input type="date" className="w-full border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Data final
            </label>
            <input type="date" className="w-full border rounded px-2 py-1 text-sm" />
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button className="px-3 py-1 text-sm rounded bg-blue-600 text-white">
            Filtrar
          </button>
          <button className="px-3 py-1 text-sm rounded border">
            Limpar
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-semibold mb-2">Lista de pedidos (exemplo)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2">Pedido</th>
                <th className="py-2">Cliente</th>
                <th className="py-2">Data</th>
                <th className="py-2">Status</th>
                <th className="py-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b last:border-0">
                <td className="py-2">#1001</td>
                <td>Maria Silva</td>
                <td>17/11/2025</td>
                <td>Faturado</td>
                <td className="text-right">R$ 259,90</td>
              </tr>
              <tr className="border-b last:border-0">
                <td className="py-2">#1000</td>
                <td>João Santos</td>
                <td>17/11/2025</td>
                <td>Em aberto</td>
                <td className="text-right">R$ 89,90</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}