import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import './globals.css';

// Self-hosted variable fonts (OFL, see app/fonts): Bricolage Grotesque gives the voice, Inter
// keeps data readable, Caveat writes the hand-drawn notes.
const bricolage = localFont({
  src: './fonts/Bricolage.woff2',
  variable: '--font-bricolage',
  weight: '200 800',
  display: 'swap',
});

const inter = localFont({
  src: './fonts/Inter.woff2',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap',
});

const caveat = localFont({
  src: './fonts/Caveat.woff2',
  variable: '--font-caveat',
  weight: '400 700',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Mandato', template: '%s · Mandato' },
  description:
    'El agente de cuentas por pagar que paga lo acordado y le pregunta a una persona todo lo demás.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f3f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0f2b' },
  ],
};

/** Applies the stored or system theme before the first paint (no flash). */
const themeScript = `(function(){try{var t=localStorage.getItem('mandato:theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light')}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      className={`${bricolage.variable} ${inter.variable} ${caveat.variable}`}
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
