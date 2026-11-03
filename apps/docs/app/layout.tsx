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
  metadataBase: new URL('https://au1h.dev'),
  title: {
    default: 'au1h — One auth server for all of your apps',
    template: '%s · au1h',
  },
  description:
    'One auth server for all of your apps. Self-hosted, open source, built on Better Auth.',
  applicationName: 'au1h',
  keywords: [
    'auth',
    'authentication',
    'multi-tenant',
    'self-hosted',
    'Better Auth',
    'JWT',
    'OAuth',
    'developer tools',
    'open source',
    'Postgres',
    'Redis',
    'gateway',
    'proxy',
  ],
  authors: [{ name: 'au1h', url: 'https://au1h.dev' }],
  creator: 'au1h',
  publisher: 'au1h',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://au1h.dev',
    siteName: 'au1h',
    title: 'au1h — One auth server for all of your apps',
    description:
      'One auth server for all of your apps. Self-hosted, open source, built on Better Auth.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'au1h — One auth server for all of your apps',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'au1h — One auth server for all of your apps',
    description:
      'One auth server for all of your apps. Self-hosted, open source, built on Better Auth.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/site.webmanifest',
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'au1h',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Any',
  description:
    'One auth server for all of your apps. Self-hosted, open source, built on Better Auth.',
  url: 'https://au1h.dev',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${mono.variable} font-sans`}
      suppressHydrationWarning
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
