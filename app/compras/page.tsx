'use client';

import dynamic from 'next/dynamic';
import { AppLayout } from '@/components/layout/AppLayout';

const ComprasClient = dynamic(() => import('./ComprasClient'), {
  loading: () => <ComprasSkeleton />,
  // Carrega apenas no cliente para evitar qualquer flicker/hidratação indevida
  ssr: false,
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
    <div className="space-y-8 pb-10">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[36px] glass-panel glass-tint border border-white/40 dark:border-white/10 h-[360px] animate-pulse" />
        <div className="space-y-4">
          <div className="rounded-[32px] glass-panel glass-tint border border-white/40 dark:border-white/10 h-40 animate-pulse" />
          <div className="rounded-[32px] glass-panel glass-tint border border-white/40 dark:border-white/10 h-40 animate-pulse" />
        </div>
      </section>
      <div className="rounded-[32px] glass-panel glass-tint border border-white/40 dark:border-white/10 h-[520px] animate-pulse" />
    </div>
  );
}
