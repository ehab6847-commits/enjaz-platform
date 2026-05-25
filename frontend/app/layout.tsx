import type { Metadata } from 'next';
import { Cairo, Tajawal } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { QueryProvider } from '@/contexts/QueryProvider';
import { AuthProvider } from '@/contexts/AuthContext';
import { SocketProvider } from '@/contexts/SocketContext';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-cairo',
  display: 'swap',
  weight: ['200', '300', '400', '500', '600', '700', '800', '900'],
});

const tajawal = Tajawal({
  subsets: ['arabic', 'latin'],
  variable: '--font-tajawal',
  display: 'swap',
  weight: ['200', '300', '400', '500', '700', '800', '900'],
});

export const metadata: Metadata = {
  title: 'منصة إنجاز | لوحة التحكم',
  description: 'منصة إنجاز - نظام إدارة البوت الذكي للمختصين',
  icons: { icon: '/favicon.ico' },
  keywords: ['إنجاز', 'بوت', 'تيليجرام', 'مختصون', 'عربي'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" className={`${cairo.variable} ${tajawal.variable} dark`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0F172A" />
      </head>
      <body className="font-cairo bg-background text-text antialiased">
        <QueryProvider>
          <AuthProvider>
            <SocketProvider>
              {children}
              <Toaster
                position="top-center"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: '#1E293B',
                    color: '#E2E8F0',
                    border: '1px solid #334155',
                    borderRadius: '12px',
                    fontFamily: 'Cairo, sans-serif',
                    direction: 'rtl',
                    fontSize: '14px',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                  },
                  success: {
                    iconTheme: { primary: '#10B981', secondary: '#1E293B' },
                    style: {
                      background: '#1E293B',
                      color: '#E2E8F0',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                    },
                  },
                  error: {
                    iconTheme: { primary: '#EF4444', secondary: '#1E293B' },
                    style: {
                      background: '#1E293B',
                      color: '#E2E8F0',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                    },
                  },
                }}
              />
            </SocketProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
