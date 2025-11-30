import dynamic from 'next/dynamic';
import { AppLayout } from '@/components/layout/AppLayout';

const ConfiguracoesClient = dynamic(() => import('./ConfiguracoesClient'), {
  loading: () => <ConfiguracoesSkeleton />,
});

export default function ConfiguracoesPage() {
  return (
    <AppLayout title="Configurações">
      <ConfiguracoesClient />
    </AppLayout>
  );
}

function ConfiguracoesSkeleton() {
  return (
    <div className="app-shell">
      <div className="app-shell-inner max-w-6xl space-y-4">
        <div className="h-8 w-48 rounded-2xl bg-slate-100/70 dark:bg-slate-900/40 animate-pulse" />
        <div className="h-64 rounded-3xl bg-slate-100/60 dark:bg-slate-900/40 animate-pulse" />
        <div className="h-[600px] rounded-3xl bg-slate-100/60 dark:bg-slate-900/40 animate-pulse" />
      </div>
    </div>
  );
}
