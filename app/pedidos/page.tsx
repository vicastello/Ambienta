import dynamic from "next/dynamic";
import { AppLayout } from "@/components/layout/AppLayout";

const PedidosClient = dynamic(() => import("./PedidosClient"), {
  loading: () => <PedidosSkeleton />,
});

export default function PedidosPage() {
  return (
    <AppLayout title="Pedidos">
      <PedidosClient />
    </AppLayout>
  );
}

function PedidosSkeleton() {
  return (
    <div className="space-y-6 pb-10">
      <div className="rounded-[36px] glass-panel glass-tint border border-white/60 dark:border-white/10 h-44 animate-pulse" />
      <section className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="rounded-[32px] glass-panel glass-tint border border-white/60 dark:border-white/10 h-72 animate-pulse" />
        <div className="space-y-4">
          <div className="rounded-[32px] glass-panel glass-tint border border-white/60 dark:border-white/10 h-40 animate-pulse" />
          <div className="rounded-[36px] glass-panel glass-tint border border-white/60 dark:border-white/10 h-[520px] animate-pulse" />
        </div>
      </section>
    </div>
  );
}
