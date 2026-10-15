import { siteConfig } from '@/src/config/site';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {siteConfig.logos.map((logo) => (
                <img key={logo.src} src={logo.src} alt={logo.alt} className="h-12 w-12 rounded-xl bg-white object-contain p-1" />
              ))}
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800">{siteConfig.siteName}</p>
              <p className="text-xs text-slate-500">{siteConfig.tagline}</p>
            </div>
          </div>

          <a
            href="/login"
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            Login
          </a>
        </div>
      </header>

      <section className="bg-slate-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-20">
          <div>
            <span className="inline-flex rounded-full border border-blue-400/40 bg-blue-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-100">
              {siteConfig.heroBadge}
            </span>
            <h1 className="mt-6 text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">
              {siteConfig.heroTitle}
            </h1>
            <p className="mt-4 max-w-xl text-base text-slate-300 sm:text-lg">{siteConfig.heroSubtitle}</p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a href="/login" className="rounded-xl bg-white px-6 py-3 font-semibold text-slate-900 shadow-lg transition hover:bg-slate-100">
                Mulai belajar
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white px-4 py-5 text-center text-sm text-slate-500">
        © 2026 / Learning Management System Cakrawala. All rights reserved.
      </footer>
    </main>
  );
}
