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
        <div className="h-10 w-48 rounded-2xl glass-panel glass-tint border border-white/40 dark:border-white/10 animate-pulse" />
        <div className="h-64 rounded-[32px] glass-panel glass-tint border border-white/30 dark:border-white/10 animate-pulse" />
        <div className="h-[600px] rounded-[32px] glass-panel glass-tint border border-white/30 dark:border-white/10 animate-pulse" />
      </div>
    </div>
  );
}
