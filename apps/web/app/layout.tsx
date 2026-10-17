import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import './globals.css';

// Self-hosted variable font (OFL, see app/fonts). Archivo's width axis does the work of two
// families: expanded for headlines, condensed for figures.
const archivo = localFont({
  src: './fonts/Archivo.woff2',
  variable: '--font-archivo',
  weight: '100 900',
  display: 'swap',
  declarations: [{ prop: 'font-stretch', value: '62% 125%' }],
});

export const metadata: Metadata = {
  title: { default: 'Radar 30X', template: '%s · Radar 30X' },
  description:
    'Qué temas de IA están despegando en redes, por qué funcionan y cómo los cuenta 30X: el parte de olas del contenido.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0d4a55' },
    { media: '(prefers-color-scheme: dark)', color: '#0a3a44' },
  ],
};

/** Applies the stored or system theme before the first paint (no flash). */
const themeScript = `(function(){try{var t=localStorage.getItem('radar:theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light')}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={archivo.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
