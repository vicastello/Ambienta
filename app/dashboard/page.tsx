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
      <div className="rounded-[32px] glass-panel glass-tint border border-white/40 dark:border-white/10 h-48 animate-pulse" />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-[32px] glass-panel glass-tint border border-white/30 dark:border-white/10 h-64 animate-pulse" />
          <div className="rounded-[32px] glass-panel glass-tint border border-white/30 dark:border-white/10 h-[420px] animate-pulse" />
        </div>
        <div className="space-y-4">
          <div className="rounded-[32px] glass-panel glass-tint border border-white/30 dark:border-white/10 h-72 animate-pulse" />
          <div className="rounded-[32px] glass-panel glass-tint border border-white/30 dark:border-white/10 h-72 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
