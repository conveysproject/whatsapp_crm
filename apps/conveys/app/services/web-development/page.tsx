import type { JSX } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConveysHeader } from "@/components/conveys-header";
import { ConveysFooter } from "@/components/conveys-footer";

export const metadata: Metadata = {
  title: "Web Development Company in India | Fast, SEO-Ready Websites | Conveys",
  description:
    "Professional website development for businesses in India. Mobile-friendly, fast-loading, SEO-optimised websites with fixed pricing. 100% in-house team. Get a free quote.",
  alternates: { canonical: "https://conveys.in/services/web-development" },
  openGraph: { url: "https://conveys.in/services/web-development" },
};

const OFFERINGS = [
  {
    title: "Landing Pages & Corporate Sites",
    description:
      "Brand-aligned websites that load fast, rank on Google, and turn visitors into enquiries. Every page is mobile-first, accessible, and server-side rendered.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582" />
      </svg>
    ),
  },
  {
    title: "Custom Web Applications",
    description:
      "Complex portals, dashboards, booking systems, and internal tools — designed and engineered from scratch to match your exact business logic and workflows.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    ),
  },
  {
    title: "E-commerce Stores",
    description:
      "Online stores with Razorpay and Stripe payment integration, inventory management, order tracking, and admin panels. Built for conversion, not just aesthetics.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
      </svg>
    ),
  },
  {
    title: "CMS & Self-Managed Sites",
    description:
      "We build custom admin panels or integrate Sanity CMS so your team can update content independently — no developer needed for routine changes.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
      </svg>
    ),
  },
  {
    title: "API & Backend Engineering",
    description:
      "REST APIs, webhook integrations, database design, and third-party service connections. We architect backends that scale with your business.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
  {
    title: "Performance & SEO Audits",
    description:
      "Core Web Vitals optimisation, structured data implementation, sitemap generation, and Lighthouse score improvement for existing websites.",
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
    title: "Discovery Call",
    duration: "Day 1–3",
    body: "We map your goals, target audience, technical requirements, and existing infrastructure. You get a detailed project scope with timeline and fixed-price quote.",
  },
  {
    step: "02",
    title: "Wireframes & Design",
    duration: "Week 1–2",
    body: "High-fidelity Figma prototypes for every key page. We iterate on design until you're satisfied — development doesn't start until the design is approved.",
  },
  {
    step: "03",
    title: "Development",
    duration: "Week 2–6",
    body: "Agile two-week sprints. You get a staging URL from day one and see real progress every week. No black boxes, no surprises.",
  },
  {
    step: "04",
    title: "QA & Review",
    duration: "Week 6–7",
    body: "Cross-browser and cross-device testing, Lighthouse performance audit, accessibility checks (WCAG 2.1 AA), and a complete content review.",
  },
  {
    step: "05",
    title: "Launch",
    duration: "Week 7–8",
    body: "Deployment to Vercel or Railway, DNS setup, SSL, Google Analytics 4, Search Console, and sitemap submission. We stay on-call for 48 hours post-launch.",
  },
  {
    step: "06",
    title: "Ongoing Support",
    duration: "Post-launch",
    body: "30-day free bug-fix period. After that, monthly retainer or per-change billing. We're always a message away.",
  },
] as const;

const TECH = [
  { name: "Next.js 15", category: "Framework" },
  { name: "React 19", category: "UI Library" },
  { name: "TypeScript", category: "Language" },
  { name: "Tailwind CSS", category: "Styling" },
  { name: "PostgreSQL", category: "Database" },
  { name: "Prisma ORM", category: "ORM" },
  { name: "Vercel", category: "Hosting" },
  { name: "Cloudflare", category: "CDN" },
  { name: "Razorpay", category: "Payments" },
  { name: "Stripe", category: "Payments" },
  { name: "Sanity CMS", category: "CMS" },
  { name: "Fastify", category: "Backend" },
] as const;

const FAQ = [
  {
    q: "How long does a website project take?",
    a: "A standard marketing website or landing page takes 3–4 weeks. A custom web application with backend integration typically takes 8–12 weeks. After the discovery call, we give you a precise timeline before any work begins.",
  },
  {
    q: "What CMS do you recommend for content management?",
    a: "For most marketing sites, we either build a lightweight custom admin panel or integrate Sanity CMS — a headless CMS that's easy for non-technical users. For content-heavy blogs, we use Next.js with MDX. We always recommend the tool that matches your team's comfort level.",
  },
  {
    q: "Will my website rank on Google?",
    a: "SEO is built into our process, not added as an afterthought. Every site we deliver includes server-side rendering for maximum indexability, structured data (JSON-LD), an XML sitemap, Core Web Vitals optimisation, and correct canonical URLs. We also submit the sitemap to Google Search Console at launch.",
  },
  {
    q: "Do you handle hosting and domain setup?",
    a: "Yes. We deploy to Vercel (for Next.js apps) or Railway (for backend APIs), configure your custom domain, set up SSL certificates, and connect Cloudflare for CDN and DDoS protection. Hosting fees are paid directly to the provider — typically ₹800–3,500/month depending on traffic.",
  },
  {
    q: "What if I need changes after the site launches?",
    a: "We provide a 30-day free bug-fix period after launch for any defects in the delivered work. For new features, content updates, or design changes, we offer monthly retainer plans starting at ₹8,000/month, or we can bill per change request.",
  },
] as const;

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Service",
      "@id": "https://conveys.in/services/web-development#service",
      name: "Web Development & Design Services",
      provider: { "@id": "https://conveys.in/#organization" },
      areaServed: { "@type": "Country", name: "India" },
      description:
        "Custom websites, web apps, and e-commerce for Indian businesses. Next.js, React, TypeScript — SEO-ready, fast, and built to convert.",
      url: "https://conveys.in/services/web-development",
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

export default function WebDevelopmentPage(): JSX.Element {
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
              Websites That Work as Hard as You Do
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-300">
              From landing pages to complex web applications — we engineer fast, scalable, and SEO-ready websites for Indian businesses. In-house team, fixed pricing, zero outsourcing.
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

          {/* Browser illustration */}
          <div className="hidden lg:block" aria-hidden="true">
            <svg viewBox="0 0 540 380" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full drop-shadow-2xl">
              <rect width="540" height="380" rx="16" fill="#1e293b" />
              <rect width="540" height="46" rx="16" fill="#334155" />
              <rect y="30" width="540" height="16" fill="#334155" />
              <circle cx="26" cy="23" r="7" fill="#ef4444" />
              <circle cx="50" cy="23" r="7" fill="#f59e0b" />
              <circle cx="74" cy="23" r="7" fill="#22c55e" />
              <rect x="100" y="13" width="340" height="20" rx="10" fill="#475569" />
              <text x="270" y="27" textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="monospace">https://yoursite.com</text>
              {/* Hero section */}
              <rect x="20" y="62" width="500" height="110" rx="10" fill="#3b82f6" />
              <rect x="80" y="82" width="240" height="14" rx="7" fill="white" opacity="0.9" />
              <rect x="110" y="103" width="180" height="10" rx="5" fill="white" opacity="0.55" />
              <rect x="95" y="122" width="80" height="26" rx="13" fill="white" />
              <rect x="185" y="122" width="80" height="26" rx="13" fill="rgba(255,255,255,0.2)" />
              {/* Cards */}
              <rect x="20" y="186" width="152" height="76" rx="10" fill="#334155" />
              <rect x="184" y="186" width="152" height="76" rx="10" fill="#334155" />
              <rect x="348" y="186" width="152" height="76" rx="10" fill="#334155" />
              <circle cx="55" cy="208" r="12" fill="#3b82f6" opacity="0.6" />
              <circle cx="219" cy="208" r="12" fill="#8b5cf6" opacity="0.6" />
              <circle cx="383" cy="208" r="12" fill="#10b981" opacity="0.6" />
              <rect x="36" y="228" width="116" height="7" rx="3.5" fill="#64748b" />
              <rect x="36" y="241" width="90" height="5" rx="2.5" fill="#475569" />
              <rect x="200" y="228" width="116" height="7" rx="3.5" fill="#64748b" />
              <rect x="200" y="241" width="90" height="5" rx="2.5" fill="#475569" />
              <rect x="364" y="228" width="116" height="7" rx="3.5" fill="#64748b" />
              <rect x="364" y="241" width="90" height="5" rx="2.5" fill="#475569" />
              {/* Text block */}
              <rect x="20" y="276" width="500" height="7" rx="3.5" fill="#334155" />
              <rect x="20" y="290" width="460" height="7" rx="3.5" fill="#334155" />
              <rect x="20" y="304" width="380" height="7" rx="3.5" fill="#334155" />
              {/* Footer */}
              <rect x="20" y="328" width="500" height="36" rx="8" fill="#1e3a5f" />
              <rect x="40" y="340" width="60" height="6" rx="3" fill="#475569" />
              <rect x="180" y="340" width="60" height="6" rx="3" fill="#475569" />
              <rect x="320" y="340" width="60" height="6" rx="3" fill="#475569" />
              <rect x="460" y="340" width="40" height="6" rx="3" fill="#475569" />
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
              <p className="text-sm font-bold uppercase tracking-widest text-blue-600">What We Deliver</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                Web Development Services
              </h2>
              <p className="mt-3 text-base text-slate-500">
                Every engagement is scoped, priced, and delivered — not templated and resold.
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
                Our Web Development Process
              </h2>
              <p className="mt-3 text-base text-slate-400">
                Six stages from first call to launch — each with clear deliverables and owner.
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
            <p className="text-center text-sm font-bold uppercase tracking-widest text-slate-400">Technologies We Use</p>
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
            <h2 className="text-3xl font-extrabold text-white">Ready to Build Your Website?</h2>
            <p className="mt-3 text-base text-blue-200">Tell us about your project and we&apos;ll get back within 24 hours with a scoped proposal.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href="/#contact" className="inline-flex items-center rounded-full bg-white px-8 py-3.5 text-sm font-bold text-blue-700 shadow-lg transition hover:bg-blue-50">
                Get a Free Quote →
              </Link>
              <Link href="/services/mobile-app-development" className="inline-flex items-center rounded-full border border-white/30 bg-white/10 px-8 py-3.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/20">
                Mobile Development →
              </Link>
            </div>
          </div>
        </section>

      </main>
      <ConveysFooter />
    </>
  );
}
