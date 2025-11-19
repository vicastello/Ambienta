import { AppLayout } from '@/components/layout/AppLayout';

export default function FinanceiroPage() {
  return (
    <AppLayout title="Financeiro">
      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-slate-500">Total a receber (aberto)</p>
          <p className="text-2xl font-bold mt-1">R$ 12.350,00</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-slate-500">Total a pagar (aberto)</p>
          <p className="text-2xl font-bold mt-1">R$ 5.780,00</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-semibold mb-2">Contas a receber (exemplo)</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2">Cliente</th>
                <th className="py-2">Vencimento</th>
                <th className="py-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b last:border-0">
                <td className="py-2">Loja X</td>
                <td>20/11/2025</td>
                <td className="text-right">R$ 1.250,00</td>
              </tr>
              <tr className="border-b last:border-0">
                <td className="py-2">Cliente Y</td>
                <td>22/11/2025</td>
                <td className="text-right">R$ 320,00</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="text-sm font-semibold mb-2">Contas a pagar (exemplo)</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2">Fornecedor</th>
                <th className="py-2">Vencimento</th>
                <th className="py-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b last:border-0">
                <td className="py-2">Fornecedor A</td>
                <td>19/11/2025</td>
                <td className="text-right">R$ 980,00</td>
              </tr>
              <tr className="border-b last:border-0">
                <td className="py-2">Transportadora B</td>
                <td>25/11/2025</td>
                <td className="text-right">R$ 430,00</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}