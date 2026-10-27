import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Provider } from '@/components/provider';
import './global.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains',
});

export const metadata: Metadata = {
  title: { default: 'au1h', template: '%s · au1h' },
  description: 'One auth server for all of your apps. Self-hosted, open source, built on Better Auth.',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${mono.variable} font-sans`}
      suppressHydrationWarning
    >
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
