import dynamic from 'next/dynamic';
import { AppLayout } from '@/components/layout/AppLayout';

const ProdutosClient = dynamic(() => import('./ProdutosClient'), {
  loading: () => <ProdutosSkeleton />,
});

export default function ProdutosPage() {
  return (
    <AppLayout title="Produtos">
      <ProdutosClient />
    </AppLayout>
  );
}

function ProdutosSkeleton() {
  return (
    <div className="space-y-6 pb-6">
      <div className="rounded-[32px] glass-panel glass-tint border border-white/40 dark:border-white/10 h-48 animate-pulse" />
      <div className="rounded-[32px] glass-panel glass-tint border border-white/40 dark:border-white/10 h-[560px] animate-pulse" />
    </div>
  );
}
