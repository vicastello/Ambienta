// app/layout.tsx
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { ToastProvider } from '@/app/components/ui/Toast';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const themeScript = `
  (function() {
    try {
      var storageKey = 'theme-mode';
      var mode = localStorage.getItem(storageKey);
      var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var dark = false;
      if (mode === 'dark') dark = true;
      else if (mode === 'light') dark = false;
      else dark = prefersDark;
      if (dark) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    } catch (e) {}
  })();
`;

export const metadata = {
  title: 'Ambienta – Painel Tiny',
  description: 'Dashboard de e-commerce integrado ao Tiny ERP.',
  icons: {
    icon: '/favicon.ico',
    apple: '/favicon.ico',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${inter.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/favicon.ico" />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
