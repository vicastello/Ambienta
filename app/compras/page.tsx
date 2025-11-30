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
    <div className="space-y-6 pb-4">
      <div className="h-24 rounded-3xl bg-slate-100/80 dark:bg-slate-900/40 animate-pulse" />
      <div className="h-[540px] rounded-[32px] bg-slate-100/70 dark:bg-slate-900/40 animate-pulse" />
    </div>
  );
}
