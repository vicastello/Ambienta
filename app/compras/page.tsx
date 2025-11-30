import dynamic from 'next/dynamic';
import { AppLayout } from '@/components/layout/AppLayout';

const ComprasClient = dynamic(() => import('./ComprasClient'), {
  loading: () => <ComprasSkeleton />,
});

export default function ComprasPage() {
  return (
    <AppLayout title="Sugestão de Compras">
      <ComprasClient />
    </AppLayout>
  );
}

function ComprasSkeleton() {
  return (
    <div className="space-y-6 pb-6">
      <div className="h-48 rounded-[32px] glass-panel glass-tint border border-white/40 dark:border-white/10 animate-pulse" />
      <div className="h-[520px] rounded-[32px] glass-panel glass-tint border border-white/40 dark:border-white/10 animate-pulse" />
    </div>
  );
}
