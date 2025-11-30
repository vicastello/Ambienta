import { ArrowDownRight, ArrowUpRight, DollarSign } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';

const receber = [
  { nome: 'Loja X', vencimento: '20/11/2025', valor: 'R$ 1.250,00' },
  { nome: 'Cliente Y', vencimento: '22/11/2025', valor: 'R$ 320,00' },
];

const pagar = [
  { nome: 'Fornecedor A', vencimento: '19/11/2025', valor: 'R$ 980,00' },
  { nome: 'Transportadora B', vencimento: '25/11/2025', valor: 'R$ 430,00' },
];

export default function FinanceiroPage() {
  return (
    <AppLayout title="Financeiro">
      <div className="space-y-6">
        <section className="glass-panel glass-tint rounded-[32px] border border-white/60 dark:border-white/10 p-6 md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-3 rounded-full border border-white/40 dark:border-white/10 bg-white/70 dark:bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.4em] text-slate-500">
                <DollarSign className="w-4 h-4 text-emerald-500" />
                Tesouraria
              </div>
              <h2 className="mt-4 text-3xl font-semibold text-slate-900 dark:text-white">Fluxo financeiro</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
                Painel inspirado no dashboard com cards translúcidos, indicando o que falta receber/pagar e os vencimentos críticos.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 min-w-[240px]">
              <div className="app-card p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Receber</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">R$ 12.350</p>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  <ArrowUpRight className="w-3 h-3" /> +18% semanal
                </span>
              </div>
              <div className="app-card p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Pagar</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">R$ 5.780</p>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
                  <ArrowDownRight className="w-3 h-3" /> -6% semanal
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <FinanceiroTabela
            titulo="Contas a receber (exemplo)"
            itens={receber}
            badgeClass="bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
          />
          <FinanceiroTabela
            titulo="Contas a pagar (exemplo)"
            itens={pagar}
            badgeClass="bg-rose-500/15 text-rose-600 dark:text-rose-300"
          />
        </section>
      </div>
    </AppLayout>
  );
}

type FinanceiroTabelaProps = {
  titulo: string;
  itens: { nome: string; vencimento: string; valor: string }[];
  badgeClass: string;
};

function FinanceiroTabela({ titulo, itens, badgeClass }: FinanceiroTabelaProps) {
  return (
    <div className="glass-panel glass-tint rounded-[32px] border border-white/60 dark:border-white/10 overflow-hidden">
      <div className="border-b border-white/30 dark:border-white/10 px-6 py-4">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Agenda</p>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{titulo}</h3>
      </div>

      <div className="md:hidden space-y-3 px-4 py-5">
        {itens.map((linha) => (
          <article key={linha.nome} className="app-card p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{linha.nome}</p>
              <p className="text-xs text-slate-500">Vence {linha.vencimento}</p>
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{linha.valor}</p>
          </article>
        ))}
      </div>

      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead className="app-table-header uppercase text-[11px] tracking-[0.3em] text-slate-500">
            <tr>
              <th className="text-left px-6 py-4">Nome</th>
              <th className="text-left px-6 py-4">Vencimento</th>
              <th className="text-right px-6 py-4">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/20 dark:divide-white/5">
            {itens.map((linha) => (
              <tr key={linha.nome}>
                <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">{linha.nome}</td>
                <td className="px-6 py-4 text-slate-500">{linha.vencimento}</td>
                <td className="px-6 py-4 text-right text-slate-900 dark:text-white font-semibold">{linha.valor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-white/20 dark:border-white/5 px-6 py-4 bg-white/40 dark:bg-white/5 flex items-center justify-between text-xs text-slate-500">
        <span>Atualizado há 2 horas</span>
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold ${badgeClass}`}>
          Prioridade automática
        </span>
      </div>
    </div>
  );
}
