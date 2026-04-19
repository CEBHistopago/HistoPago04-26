import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { FirebaseMessagingProvider } from '@/components/FirebaseMessagingProvider';

export const metadata: Metadata = {
  title: 'HistoPago',
  description: 'Tu historial de pagos en un solo lugar.',
  manifest: '/manifest.json',
  themeColor: '#3B82F6',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'HistoPago',
  },
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0',
  icons: {
    icon: [
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' }
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="HistoPago" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <link rel="shortcut icon" href="/icon-192x192.png" />
      </head>
      <body className="font-body antialiased">
        <FirebaseClientProvider>
          <FirebaseMessagingProvider>
            {children}
          </FirebaseMessagingProvider>
          <Toaster />
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
