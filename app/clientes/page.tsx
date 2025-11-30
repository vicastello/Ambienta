import { Users } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';

const clientesMock = [
  { nome: 'Maria Silva', tipo: 'Cliente', documento: '***.***.***-**', cidade: 'Pedreira/SP', badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' },
  { nome: 'Plasmont', tipo: 'Fornecedor', documento: '**.***.***/****-**', cidade: 'Joinville/SC', badge: 'bg-sky-500/15 text-sky-600 dark:text-sky-300' },
];

const FILTER_LABEL_CLASS = 'block text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-2';

export default function ClientesPage() {
  const totalClientes = clientesMock.filter((cliente) => cliente.tipo === 'Cliente').length;
  const totalFornecedores = clientesMock.filter((cliente) => cliente.tipo === 'Fornecedor').length;

  return (
    <AppLayout title="Clientes">
      <div className="space-y-6">
        <section className="glass-panel glass-tint rounded-[32px] border border-white/60 dark:border-white/15 p-6 md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-3 rounded-full border border-white/40 dark:border-white/10 bg-white/70 dark:bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
                <Users className="w-4 h-4 text-[#009DA8]" />
                Carteira
              </div>
              <h2 className="mt-4 text-3xl font-semibold text-slate-900 dark:text-white">
                Relacionamento com clientes e fornecedores
              </h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
                Acompanhe quem mais compra, organize contatos estratégicos e mantenha filtros rápidos alinhados com o visual glass do painel.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 min-w-[240px]">
              <div className="app-card p-5 text-center">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Clientes</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">{totalClientes.toString().padStart(2, '0')}</p>
              </div>
              <div className="app-card p-5 text-center">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Fornecedores</p>
                <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-white">{totalFornecedores.toString().padStart(2, '0')}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="glass-panel glass-tint rounded-[32px] border border-white/60 dark:border-white/15 p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Filtros rápidos</p>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Encontre contatos em segundos</h3>
            </div>
            <button className="app-btn-primary px-6">Limpar filtros</button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className={FILTER_LABEL_CLASS}>Nome</label>
              <input className="w-full app-input" placeholder="Ex: Maria Silva" />
            </div>
            <div>
              <label className={FILTER_LABEL_CLASS}>Tipo</label>
              <select className="w-full app-input">
                <option>Todos</option>
                <option>Cliente</option>
                <option>Fornecedor</option>
              </select>
            </div>
            <div>
              <label className={FILTER_LABEL_CLASS}>Cidade</label>
              <input className="w-full app-input" placeholder="Filtrar por cidade" />
            </div>
          </div>
        </section>

        <section className="glass-panel glass-tint rounded-[32px] border border-white/60 dark:border-white/15 p-0">
          <div className="border-b border-white/30 dark:border-white/10 px-6 py-5">
            <div className="flex flex-col gap-1">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Lista</p>
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Clientes e fornecedores (exemplo)</h3>
            </div>
          </div>

          <div className="md:hidden space-y-3 px-4 py-5">
            {clientesMock.map((cliente) => (
              <article key={cliente.nome} className="app-card p-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{cliente.nome}</p>
                  <p className="text-xs text-slate-500">{cliente.documento}</p>
                  <p className="text-xs text-slate-500">{cliente.cidade}</p>
                </div>
                <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${cliente.badge}`}>
                  {cliente.tipo}
                </span>
              </article>
            ))}
          </div>

          <div className="hidden md:block overflow-hidden rounded-[32px]">
            <table className="w-full text-sm">
              <thead className="app-table-header uppercase text-[11px] tracking-[0.3em] text-slate-500">
                <tr>
                  <th className="text-left px-6 py-4">Nome</th>
                  <th className="text-left px-6 py-4">Tipo</th>
                  <th className="text-left px-6 py-4">Documento</th>
                  <th className="text-left px-6 py-4">Cidade/UF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/20 dark:divide-white/5">
                {clientesMock.map((cliente) => (
                  <tr key={cliente.nome}>
                    <td className="px-6 py-4 text-slate-900 dark:text-white font-semibold">{cliente.nome}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${cliente.badge}`}>
                        {cliente.tipo}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{cliente.documento}</td>
                    <td className="px-6 py-4 text-slate-500">{cliente.cidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
