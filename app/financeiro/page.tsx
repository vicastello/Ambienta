import { AppLayout } from '@/components/layout/AppLayout';

export default function FinanceiroPage() {
  return (
    <AppLayout title="Financeiro">
      <div className="grid gap-4 md:grid-cols-2 mb-4">
        <div className="surface-card p-5">
          <p className="text-xs text-muted">Total a receber (aberto)</p>
          <p className="text-2xl font-bold mt-1 text-[var(--text-main)]">R$ 12.350,00</p>
        </div>
        <div className="surface-card p-5">
          <p className="text-xs text-muted">Total a pagar (aberto)</p>
          <p className="text-2xl font-bold mt-1 text-[var(--text-main)]">R$ 5.780,00</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="surface-panel p-6">
          <h3 className="text-sm font-semibold text-[var(--text-main)] mb-2">Contas a receber (exemplo)</h3>
          <div className="overflow-hidden rounded-3xl border border-white/20 dark:border-white/5">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-card-soft)] text-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Cliente</th>
                  <th className="text-left px-4 py-3 font-semibold">Vencimento</th>
                  <th className="text-right px-4 py-3 font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-white/20 dark:border-white/5">
                  <td className="px-4 py-3">Loja X</td>
                  <td className="px-4 py-3 text-muted">20/11/2025</td>
                  <td className="text-right px-4 py-3 font-semibold text-[var(--text-main)]">R$ 1.250,00</td>
                </tr>
                <tr className="border-t border-white/20 dark:border-white/5">
                  <td className="px-4 py-3">Cliente Y</td>
                  <td className="px-4 py-3 text-muted">22/11/2025</td>
                  <td className="text-right px-4 py-3 font-semibold text-[var(--text-main)]">R$ 320,00</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="surface-panel p-6">
          <h3 className="text-sm font-semibold text-[var(--text-main)] mb-2">Contas a pagar (exemplo)</h3>
          <div className="overflow-hidden rounded-3xl border border-white/20 dark:border-white/5">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-card-soft)] text-muted">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Fornecedor</th>
                  <th className="text-left px-4 py-3 font-semibold">Vencimento</th>
                  <th className="text-right px-4 py-3 font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-white/20 dark:border-white/5">
                  <td className="px-4 py-3">Fornecedor A</td>
                  <td className="px-4 py-3 text-muted">19/11/2025</td>
                  <td className="text-right px-4 py-3 font-semibold text-[var(--text-main)]">R$ 980,00</td>
                </tr>
                <tr className="border-t border-white/20 dark:border-white/5">
                  <td className="px-4 py-3">Transportadora B</td>
                  <td className="px-4 py-3 text-muted">25/11/2025</td>
                  <td className="text-right px-4 py-3 font-semibold text-[var(--text-main)]">R$ 430,00</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}