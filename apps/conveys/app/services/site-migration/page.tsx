import type { JSX } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConveysHeader } from "@/components/conveys-header";
import { ConveysFooter } from "@/components/conveys-footer";

export const metadata: Metadata = {
  title: "Site Migration Services | Zero Downtime, Fixed Price | Conveys",
  description:
    "Site migration services — cPanel to cloud, HTTP to HTTPS, domain transfers, and CMS migrations. Zero downtime cutover, fixed pricing, in-house team.",
  alternates: { canonical: "https://conveys.in/services/site-migration" },
  openGraph: { url: "https://conveys.in/services/site-migration" },
};

const OFFERINGS = [
  {
    title: "CMS to Modern Stack",
    description:
      "Move from WordPress, Joomla, or Wix to a Next.js or headless CMS setup. We migrate all content, images, redirects, and SEO metadata — with zero broken links.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    ),
  },
  {
    title: "Hosting & Server Migration",
    description:
      "Lift and shift from cPanel shared hosting to AWS, Cloudflare, Railway, or Vercel. We handle DNS cutover, SSL reinstallation, and email MX record continuity.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
      </svg>
    ),
  },
  {
    title: "Database Migration",
    description:
      "Migrate from MySQL to PostgreSQL, MongoDB to a relational schema, or any legacy DB to a modern ORM-managed database — with data validation and rollback scripts.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 2.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
      </svg>
    ),
  },
  {
    title: "SEO-Safe Redirects",
    description:
      "Every old URL gets a 301 redirect to the new equivalent. We audit crawl data, map URL structures, and submit updated sitemaps so rankings are preserved during cutover.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
      </svg>
    ),
  },
  {
    title: "Zero-Downtime Cutover",
    description:
      "DNS TTL reduction, blue-green staging, and traffic validation before the final switch. Most migrations complete with under 60 seconds of actual downtime — often none.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
    ),
  },
  {
    title: "Post-Migration Monitoring",
    description:
      "48-hour war-room after cutover — we watch crawl errors, Core Web Vitals, uptime alerts, and search rankings. Any regressions are fixed before we hand off.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
] as const;

const PROCESS = [
  {
    step: "01",
    title: "Audit & Inventory",
    duration: "Day 1–2",
    body: "We crawl your existing site, export URL lists, identify all assets, database tables, DNS records, and email configurations. Nothing moves until we have a complete map.",
  },
  {
    step: "02",
    title: "Staging Environment",
    duration: "Day 3–7",
    body: "We spin up the new environment and run a full data migration in staging. You review the migrated site at a temporary URL — content, forms, and user flows all validated before go-live.",
  },
  {
    step: "03",
    title: "SEO Redirect Mapping",
    duration: "Day 5–7",
    body: "Every old URL is mapped to its new equivalent. We generate and test 301 redirect rules, update canonical tags, and regenerate the sitemap for Google.",
  },
  {
    step: "04",
    title: "DNS Preparation",
    duration: "Day 6–7",
    body: "DNS TTL is dropped to 60 seconds 24 hours before cutover. We document every DNS record — A, CNAME, MX, TXT — and prepare the new zone file.",
  },
  {
    step: "05",
    title: "Cutover & Validation",
    duration: "Day 8",
    body: "DNS flipped in a maintenance window. SSL issued. Uptime monitors triggered. We run a full smoke-test of every critical page and form before announcing completion.",
  },
  {
    step: "06",
    title: "Post-Launch Watch",
    duration: "Day 8–10",
    body: "48-hour monitoring of crawl errors, 404s, Core Web Vitals, and search impressions. Any issues are fixed on the spot — you get a final sign-off report.",
  },
] as const;

const TECH = [
  { name: "Next.js 15", category: "Framework" },
  { name: "Vercel", category: "Hosting" },
  { name: "Railway", category: "Hosting" },
  { name: "Cloudflare", category: "DNS / CDN" },
  { name: "PostgreSQL", category: "Database" },
  { name: "Prisma ORM", category: "ORM" },
  { name: "AWS S3", category: "Storage" },
  { name: "Sanity CMS", category: "CMS" },
  { name: "Google Search Console", category: "SEO" },
  { name: "Screaming Frog", category: "Crawl Audit" },
] as const;

const FAQ = [
  {
    q: "Will my Google rankings drop during migration?",
    a: "A properly executed migration with 301 redirects preserves virtually all ranking equity. We see a temporary 5–10% fluctuation in the first two weeks (normal with any domain or URL change), then recovery. We have not lost a client's long-term rankings on any migration we have managed.",
  },
  {
    q: "How long does a site migration take?",
    a: "A straightforward CMS or hosting migration takes 7–10 days. Large e-commerce platforms with thousands of SKUs, complex database schemas, or multiple subdomains can take 3–4 weeks. We give you a precise timeline after the audit.",
  },
  {
    q: "Can you migrate my emails too?",
    a: "Yes. We migrate G Suite / Google Workspace, Zoho Mail, or cPanel webmail by updating MX records, SPF, DKIM, and DMARC entries. Email is typically the trickiest part of a DNS cutover — we test continuity on staging before touching production.",
  },
  {
    q: "What if something breaks after the migration?",
    a: "We include a 30-day post-migration support period. Any bug or regression that is a direct result of the migration is fixed at no additional cost. We also maintain a rollback snapshot of the old server for 14 days.",
  },
  {
    q: "Do you migrate WooCommerce / Shopify stores?",
    a: "Yes. We migrate WooCommerce to a custom Next.js + PostgreSQL stack, or between Shopify plans, or from Shopify to a self-hosted solution. Product catalogue, orders, and customer data are all migrated with validation checks against row counts.",
  },
] as const;

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Service",
      "@id": "https://conveys.in/services/site-migration#service",
      name: "Site Migration Services",
      provider: { "@id": "https://conveys.in/#organization" },
      areaServed: { "@type": "Country", name: "India" },
      description:
        "Migrate your website, CMS, database, or hosting stack without losing traffic, data, or SEO rankings.",
      url: "https://conveys.in/services/site-migration",
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ],
};

export default function SiteMigrationPage(): JSX.Element {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ConveysHeader />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-slate-900">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full bg-blue-700/20 blur-3xl" />
          <div className="absolute -right-20 top-10 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
        </div>
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-28">
          <div>
            <Link href="/#services" className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-sky-400 hover:text-sky-300">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              All Services
            </Link>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Move Your Site Without Losing a Single Visitor
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-300">
              CMS upgrades, cloud migrations, database moves — handled end-to-end with zero downtime, full SEO continuity, and a 30-day post-launch guarantee.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/#contact" className="inline-flex items-center rounded-full bg-white px-7 py-3.5 text-sm font-bold text-blue-700 shadow-lg transition hover:bg-blue-50">
                Get a Free Quote →
              </Link>
              <Link href="#process" className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/10">
                See Our Process
              </Link>
            </div>
          </div>

          {/* Migration illustration */}
          <div className="hidden lg:block" aria-hidden="true">
            <svg viewBox="0 0 540 380" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full drop-shadow-2xl">
              <rect width="540" height="380" rx="16" fill="#1e293b" />
              {/* Old server */}
              <rect x="30" y="80" width="160" height="220" rx="12" fill="#334155" />
              <rect x="46" y="100" width="128" height="16" rx="6" fill="#475569" />
              <rect x="46" y="124" width="100" height="8" rx="4" fill="#475569" />
              <rect x="46" y="140" width="116" height="8" rx="4" fill="#475569" />
              <rect x="46" y="156" width="90" height="8" rx="4" fill="#475569" />
              <rect x="46" y="180" width="128" height="40" rx="8" fill="#1e293b" />
              <rect x="54" y="188" width="60" height="6" rx="3" fill="#64748b" />
              <rect x="54" y="200" width="80" height="6" rx="3" fill="#3b82f6" opacity="0.6" />
              <rect x="54" y="212" width="50" height="6" rx="3" fill="#64748b" />
              <text x="110" y="270" textAnchor="middle" fill="#64748b" fontSize="11" fontFamily="monospace">Old Stack</text>
              <rect x="46" y="244" width="128" height="28" rx="8" fill="#ef444420" />
              <text x="110" y="262" textAnchor="middle" fill="#ef4444" fontSize="10" fontFamily="monospace">Legacy Server</text>
              {/* Arrow */}
              <path d="M196 190 L344 190" stroke="#3b82f6" strokeWidth="2.5" strokeDasharray="6 4" />
              <polygon points="344,185 356,190 344,195" fill="#3b82f6" />
              <rect x="238" y="175" width="64" height="30" rx="8" fill="#1e3a5f" />
              <text x="270" y="194" textAnchor="middle" fill="#60a5fa" fontSize="10" fontFamily="monospace">migrate</text>
              {/* New server */}
              <rect x="360" y="80" width="160" height="220" rx="12" fill="#1e3a5f" />
              <rect x="376" y="100" width="128" height="16" rx="6" fill="#1d4ed8" />
              <rect x="376" y="124" width="100" height="8" rx="4" fill="#334155" />
              <rect x="376" y="140" width="116" height="8" rx="4" fill="#334155" />
              <rect x="376" y="156" width="90" height="8" rx="4" fill="#334155" />
              <rect x="376" y="180" width="128" height="40" rx="8" fill="#0f172a" />
              <rect x="384" y="188" width="60" height="6" rx="3" fill="#475569" />
              <rect x="384" y="200" width="80" height="6" rx="3" fill="#22c55e" opacity="0.8" />
              <rect x="384" y="212" width="50" height="6" rx="3" fill="#475569" />
              <text x="440" y="270" textAnchor="middle" fill="#60a5fa" fontSize="11" fontFamily="monospace">New Stack</text>
              <rect x="376" y="244" width="128" height="28" rx="8" fill="#16a34a20" />
              <text x="440" y="262" textAnchor="middle" fill="#22c55e" fontSize="10" fontFamily="monospace">Zero Downtime</text>
              {/* Status bar */}
              <rect x="30" y="326" width="480" height="32" rx="8" fill="#0f172a" />
              <circle cx="58" cy="342" r="6" fill="#22c55e" />
              <text x="74" y="346" fill="#94a3b8" fontSize="10" fontFamily="monospace">All systems operational · Uptime 100%</text>
            </svg>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" aria-hidden="true" />
      </section>

      <main id="main-content">

        {/* ── What We Offer ── */}
        <section className="bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-bold uppercase tracking-widest text-blue-600">What We Handle</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                Site Migration Services
              </h2>
              <p className="mt-3 text-base text-slate-500">
                Every migration type covered — from a simple hosting move to a full platform rebuild with data transformation.
              </p>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {OFFERINGS.map((o) => (
                <div key={o.title} className="group rounded-2xl border border-slate-100 bg-slate-50 p-7 transition hover:border-blue-200 hover:bg-white hover:shadow-md">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700 transition group-hover:bg-blue-700 group-hover:text-white">
                    {o.icon}
                  </div>
                  <h3 className="mt-5 text-base font-bold text-slate-900">{o.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{o.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Process ── */}
        <section id="process" className="scroll-mt-20 bg-slate-900 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-bold uppercase tracking-widest text-sky-400">How It Works</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                Our Migration Process
              </h2>
              <p className="mt-3 text-base text-slate-400">
                Six stages from audit to sign-off — every step documented and shared with you in real time.
              </p>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {PROCESS.map((p) => (
                <div key={p.step} className="rounded-2xl border border-white/10 bg-white/5 p-7 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-4xl font-extrabold text-blue-700/50">{p.step}</span>
                    <span className="rounded-full bg-sky-900/50 px-3 py-1 text-xs font-semibold text-sky-400">{p.duration}</span>
                  </div>
                  <h3 className="mt-4 text-base font-bold text-white">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Tech Stack ── */}
        <section className="bg-white py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <p className="text-center text-sm font-bold uppercase tracking-widest text-slate-400">Technologies We Migrate To</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {TECH.map((t) => (
                <div key={t.name} className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2">
                  <span className="text-sm font-semibold text-slate-800">{t.name}</span>
                  <span className="text-xs text-slate-400">{t.category}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="bg-slate-50 py-20 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <p className="text-sm font-bold uppercase tracking-widest text-blue-600">FAQ</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                Common Questions
              </h2>
            </div>
            <div className="mt-10 space-y-4">
              {FAQ.map((item) => (
                <details key={item.q} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm open:shadow-md">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-bold text-slate-900">
                    {item.q}
                    <svg className="h-5 w-5 flex-shrink-0 text-blue-600 transition group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <p className="mt-4 text-sm leading-relaxed text-slate-600">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="bg-blue-700 py-16">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-3xl font-extrabold text-white">Ready to Migrate Without the Risk?</h2>
            <p className="mt-3 text-base text-blue-200">Tell us about your current setup and we&apos;ll send you a migration plan and fixed-price quote within 24 hours.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href="/#contact" className="inline-flex items-center rounded-full bg-white px-8 py-3.5 text-sm font-bold text-blue-700 shadow-lg transition hover:bg-blue-50">
                Get a Free Quote →
              </Link>
              <Link href="/services/cloud-infrastructure-setup" className="inline-flex items-center rounded-full border border-white/30 bg-white/10 px-8 py-3.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/20">
                Cloud Infrastructure →
              </Link>
            </div>
          </div>
        </section>

      </main>
      <ConveysFooter />
    </>
  );
}
