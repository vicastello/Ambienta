import { AppLayout } from '@/components/layout/AppLayout';

export default function ClientesPage() {
  return (
    <AppLayout title="Clientes">
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <h3 className="text-sm font-semibold mb-3">Filtros</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium mb-1">
              Nome
            </label>
            <input className="w-full border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Tipo
            </label>
            <select className="w-full border rounded px-2 py-1 text-sm">
              <option>Todos</option>
              <option>Cliente</option>
              <option>Fornecedor</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Cidade
            </label>
            <input className="w-full border rounded px-2 py-1 text-sm" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-semibold mb-2">Lista de clientes (exemplo)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2">Nome</th>
                <th className="py-2">Tipo</th>
                <th className="py-2">Documento</th>
                <th className="py-2">Cidade/UF</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b last:border-0">
                <td className="py-2">Maria Silva</td>
                <td>Cliente</td>
                <td>***.***.***-**</td>
                <td>Pedreira/SP</td>
              </tr>
              <tr className="border-b last:border-0">
                <td className="py-2">Plasmont</td>
                <td>Fornecedor</td>
                <td>**.***.***/****-**</td>
                <td>Santa Catarina/SC</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}