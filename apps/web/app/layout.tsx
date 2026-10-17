import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/jetbrains-mono';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Recibido', template: '%s · Recibido' },
  description:
    'El agente de cuentas por pagar que paga las cuentas de servicios solo por el trabajo que puede probar.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f4f1' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1412' },
  ],
};

/** Applies the stored or system theme before the first paint (no flash). Key: theme.tsx. */
const themeScript = `(function(){try{var t=localStorage.getItem('recibido:theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light')}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
