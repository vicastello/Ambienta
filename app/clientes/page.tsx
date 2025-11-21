import { AppLayout } from '@/components/layout/AppLayout';

export default function ClientesPage() {
  return (
    <AppLayout title="Clientes">
      <div className="surface-panel p-6 mb-4 space-y-4">
        <h3 className="text-sm font-semibold text-[var(--text-main)]">Filtros</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Nome
            </label>
            <input className="w-full app-input" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Tipo
            </label>
            <select className="w-full app-input">
              <option>Todos</option>
              <option>Cliente</option>
              <option>Fornecedor</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Cidade
            </label>
            <input className="w-full app-input" />
          </div>
        </div>
      </div>

      <div className="surface-panel p-6">
        <h3 className="text-sm font-semibold text-[var(--text-main)] mb-2">Lista de clientes (exemplo)</h3>
        <div className="overflow-hidden rounded-3xl border border-white/20 dark:border-white/5">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-card-soft)] text-muted">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Nome</th>
                <th className="text-left px-4 py-3 font-semibold">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold">Documento</th>
                <th className="text-left px-4 py-3 font-semibold">Cidade/UF</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-white/20 dark:border-white/5">
                <td className="px-4 py-3">Maria Silva</td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 text-[11px] font-semibold px-3 py-0.5">
                    Cliente
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">***.***.***-**</td>
                <td className="px-4 py-3 text-muted">Pedreira/SP</td>
              </tr>
              <tr className="border-t border-white/20 dark:border-white/5">
                <td className="px-4 py-3">Plasmont</td>
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-300 text-[11px] font-semibold px-3 py-0.5">
                    Fornecedor
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">**.***.***/****-**</td>
                <td className="px-4 py-3 text-muted">Santa Catarina/SC</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}