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
        <div className="h-8 w-60 rounded-2xl bg-slate-100/70 dark:bg-slate-900/40 animate-pulse" />
        <div className="space-y-4">
          {[1, 2, 3].map((card) => (
            <div
              key={card}
              className="rounded-3xl bg-slate-100/60 dark:bg-slate-900/40 border border-white/40 dark:border-slate-800/40 p-6"
            >
              <div className="h-6 w-40 rounded-2xl bg-slate-200/80 dark:bg-slate-800/60 mb-4 animate-pulse" />
              <div className="h-16 rounded-2xl bg-slate-200/60 dark:bg-slate-800/40 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
