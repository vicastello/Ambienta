'use client';

import type { ReactNode } from 'react';
import { ToastProvider } from '@/app/components/ui/Toast';
import { Toaster } from '@/components/ui/Toaster';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <>
      <ToastProvider>{children}</ToastProvider>
      <Toaster />
    </>
  );
}
