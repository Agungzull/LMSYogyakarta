import { siteConfig } from '@/src/config/site';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-3">
            <img
              src={siteConfig.logos[0].src}
              alt={siteConfig.logos[0].alt}
              className="h-12 w-12 rounded-xl bg-white object-contain p-1"
            />
            <div>
              <p className="text-lg font-bold text-slate-800">{siteConfig.siteName}</p>
              <p className="text-xs text-slate-500">{siteConfig.tagline}</p>
            </div>
          </a>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t border-slate-200 bg-white px-4 py-5 text-center text-sm text-slate-500">
        © 2026 / Learning Management System Cakrawala. All rights reserved.
      </footer>
    </div>
  );
}
