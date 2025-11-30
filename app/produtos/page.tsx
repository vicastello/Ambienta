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
      <div className="rounded-[32px] bg-slate-100/80 dark:bg-slate-900/40 h-44 animate-pulse" />
      <div className="rounded-[32px] bg-slate-100/70 dark:bg-slate-900/40 h-[560px] animate-pulse" />
    </div>
  );
}
