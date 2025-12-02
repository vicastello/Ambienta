'use client';

import { useState } from 'react';
import { GlassVerticalNav } from '@/src/components/navigation/GlassVerticalNav';

export default function GlassNavPlaygroundPage() {
  const [active, setActive] = useState(1);
  const labels = ['Home', 'Perfil', 'Presentes', 'Enviar'];

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#e2e2e2] px-4 py-10">
      <div className="absolute inset-0">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.65),transparent_38%)] opacity-70" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(255,255,255,0.45),transparent_40%)] opacity-70" />
      </div>

      <div className="relative flex flex-col items-center gap-6">
        <GlassVerticalNav activeIndex={active} onChange={setActive} />
        <div className="rounded-full bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 shadow-md backdrop-blur">
          {labels[active]}
        </div>
      </div>
    </div>
  );
}
