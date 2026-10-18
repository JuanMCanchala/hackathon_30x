import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import './globals.css';

// OndAI's two families, self-hosted (OFL, see app/fonts): Hanken Grotesk for every word,
// JetBrains Mono for the small labels.
const hanken = localFont({
  src: [
    { path: './fonts/HankenGrotesk-300.woff', weight: '300' },
    { path: './fonts/HankenGrotesk-400.woff', weight: '400' },
    { path: './fonts/HankenGrotesk-500.woff', weight: '500' },
    { path: './fonts/HankenGrotesk-700.woff', weight: '700' },
    { path: './fonts/HankenGrotesk-800.woff', weight: '800' },
  ],
  variable: '--font-hanken',
  display: 'swap',
});
const jetbrains = localFont({
  src: [
    { path: './fonts/JetBrainsMono-400.woff', weight: '400' },
    { path: './fonts/JetBrainsMono-500.woff', weight: '500' },
    { path: './fonts/JetBrainsMono-700.woff', weight: '700' },
  ],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'OndAI', template: '%s · OndAI' },
  description:
    'Tu AI trend analyst: lo que despega en redes en otros idiomas, por qué funciona y el borrador listo para tu equipo.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#efebe4' },
    { media: '(prefers-color-scheme: dark)', color: '#140e0d' },
  ],
};

/** Applies the stored or system theme before the first paint (no flash). */
const themeScript = `(function(){try{var t=localStorage.getItem('radar:theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light')}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${hanken.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
