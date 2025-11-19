import { AppLayout } from '@/components/layout/AppLayout';

export default function ProdutosPage() {
  return (
    <AppLayout title="Produtos">
      <div className="bg-white rounded-lg shadow p-4 mb-4">
        <h3 className="text-sm font-semibold mb-3">Filtros</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium mb-1">
              Buscar (nome ou SKU)
            </label>
            <input
              className="w-full border rounded px-2 py-1 text-sm"
              placeholder="Ex: marmita 1,4L"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Categoria
            </label>
            <select className="w-full border rounded px-2 py-1 text-sm">
              <option>Todas</option>
              <option>Vasos</option>
              <option>Organização</option>
              <option>Cozinha</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Estoque
            </label>
            <select className="w-full border rounded px-2 py-1 text-sm">
              <option>Todos</option>
              <option>Com estoque</option>
              <option>Estoque baixo</option>
              <option>Sem estoque</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-semibold mb-2">Lista de produtos (exemplo)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2">SKU</th>
                <th className="py-2">Produto</th>
                <th className="py-2">Categoria</th>
                <th className="py-2 text-right">Preço</th>
                <th className="py-2 text-right">Estoque</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b last:border-0">
                <td className="py-2">VASO-21-BR</td>
                <td>Vaso Plástico Cuia 21 Branco</td>
                <td>Vasos</td>
                <td className="text-right">R$ 8,90</td>
                <td className="text-right">124</td>
              </tr>
              <tr className="border-b last:border-0">
                <td className="py-2">MARM-14-PT</td>
                <td>Marmita 1,4L Preta</td>
                <td>Cozinha</td>
                <td className="text-right">R$ 19,90</td>
                <td className="text-right">47</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}