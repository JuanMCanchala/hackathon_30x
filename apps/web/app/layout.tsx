import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import './globals.css';

// Self-hosted variable fonts (OFL, see app/fonts): no network needed to build or run.
const archivo = localFont({
  src: './fonts/Archivo.woff2',
  variable: '--font-archivo',
  weight: '100 900',
  display: 'swap',
  declarations: [{ prop: 'font-stretch', value: '62% 125%' }],
});

const newsreader = localFont({
  src: './fonts/Newsreader.woff2',
  variable: '--font-newsreader',
  weight: '200 800',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Mandato', template: '%s · Mandato' },
  description:
    'El agente de cuentas por pagar que paga lo acordado y le pregunta a una persona todo lo demás.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eef2ee' },
    { media: '(prefers-color-scheme: dark)', color: '#0c1815' },
  ],
};

/** Applies the stored or system theme before the first paint (no flash). */
const themeScript = `(function(){try{var t=localStorage.getItem('mandato:theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light')}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      className={`${archivo.variable} ${newsreader.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
