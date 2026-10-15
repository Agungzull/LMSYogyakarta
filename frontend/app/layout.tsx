import './globals.css';
import type { Metadata } from 'next';
import { siteConfig } from '@/src/config/site';

export const metadata: Metadata = {
  title: {
    default: siteConfig.siteName,
    template: `%s | ${siteConfig.siteName}`
  },
  description: siteConfig.tagline,
  icons: {
    icon: siteConfig.favicon
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-slate-100 text-slate-900">{children}</body>
    </html>
  );
}
