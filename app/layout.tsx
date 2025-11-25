// app/layout.tsx
import type { ReactNode } from 'react';
import './globals.css';

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

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/favicon.ico" />
      </head>
      <body>{children}</body>
    </html>
  );
}
