import dynamic from "next/dynamic";
import { AppLayout } from "@/components/layout/AppLayout";

const SyncConfigClient = dynamic(() => import("./SyncConfigClient"), {
  loading: () => <SyncConfigSkeleton />,
});

export default function SyncConfigPage() {
  return (
    <AppLayout title="Sincronização">
      <SyncConfigClient />
    </AppLayout>
  );
}

function SyncConfigSkeleton() {
  return (
    <div className="app-shell">
      <div className="app-shell-inner max-w-4xl space-y-6">
        <div className="h-10 w-60 rounded-2xl glass-panel glass-tint border border-white/40 dark:border-white/10 animate-pulse" />
        <div className="space-y-4">
          {[1, 2, 3].map((card) => (
            <div
              key={card}
              className="rounded-[32px] glass-panel glass-tint border border-white/30 dark:border-white/10 p-6"
            >
              <div className="h-6 w-40 rounded-2xl glass-panel glass-tint border border-white/30 dark:border-white/10 mb-4 animate-pulse" />
              <div className="h-16 rounded-2xl glass-panel glass-tint border border-white/20 dark:border-white/10 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
