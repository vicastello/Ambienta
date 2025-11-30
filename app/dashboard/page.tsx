import dynamic from 'next/dynamic';
import { AppLayout } from '@/components/layout/AppLayout';

const DashboardClient = dynamic(() => import('./DashboardClient'), {
  loading: () => <DashboardSkeleton />,
});

export default function DashboardPage() {
  return (
    <AppLayout title="Dashboard Ambienta">
      <DashboardClient />
    </AppLayout>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 pb-10">
      <div className="rounded-[32px] bg-slate-100/80 dark:bg-slate-900/40 h-48 animate-pulse" />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-[32px] bg-slate-100/70 dark:bg-slate-900/40 h-64 animate-pulse" />
          <div className="rounded-[32px] bg-slate-100/70 dark:bg-slate-900/40 h-[420px] animate-pulse" />
        </div>
        <div className="space-y-4">
          <div className="rounded-[32px] bg-slate-100/70 dark:bg-slate-900/40 h-72 animate-pulse" />
          <div className="rounded-[32px] bg-slate-100/70 dark:bg-slate-900/40 h-72 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
