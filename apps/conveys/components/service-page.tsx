import type { JSX } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConveysHeader } from "@/components/conveys-header";
import { ConveysFooter } from "@/components/conveys-footer";
import type { ServiceData } from "@/lib/services-data";
import { SERVICE_NAV } from "@/lib/services-data";
import { TrackedServiceCTA } from "@/components/tracked-link";

// ─── Metadata helper (call from each page's generateMetadata) ────────────────
export function buildMetadata(data: ServiceData): Metadata {
  const url = `https://conveys.in/services/${data.slug}`;
  return {
    title: data.metaTitle,
    description: data.metaDescription,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      title: data.metaTitle,
      description: data.metaDescription,
      url,
      siteName: "Conveys",
      locale: "en_US",
      type: "website",
    },
    twitter: { card: "summary_large_image", title: data.metaTitle },
  };
}

// ─── JSON-LD builder ──────────────────────────────────────────────────────────
function buildJsonLd(data: ServiceData) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": `https://conveys.in/services/${data.slug}#service`,
        name: data.title,
        provider: { "@id": "https://conveys.in/#organization" },
        areaServed: { "@type": "AdministrativeArea", name: "Worldwide" },
        description: data.metaDescription,
        url: `https://conveys.in/services/${data.slug}`,
      },
      {
        "@type": "FAQPage",
        mainEntity: data.faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: "https://conveys.in" },
          { "@type": "ListItem", position: 2, name: "Services", item: "https://conveys.in/#services" },
          { "@type": "ListItem", position: 3, name: data.title, item: `https://conveys.in/services/${data.slug}` },
        ],
      },
    ],
  };
}

// ─── Icon renderer ────────────────────────────────────────────────────────────
function Icon({ path, className = "h-6 w-6" }: { path: string; className?: string }): JSX.Element {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={path} />
    </svg>
  );
}

// ─── Main template ────────────────────────────────────────────────────────────
export function ServicePage({ data }: { data: ServiceData }): JSX.Element {
  const jsonLd = buildJsonLd(data);
  const related = data.relatedSlugs
    .map((slug) => SERVICE_NAV.find((s) => s.slug === slug))
    .filter(Boolean) as typeof SERVICE_NAV;

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
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-xs text-slate-400">
            <Link href="/" className="hover:text-white">Home</Link>
            <span>/</span>
            <Link href="/#services" className="hover:text-white">Services</Link>
            <span>/</span>
            <span className="text-slate-200">{data.title}</span>
          </nav>

          <div className="max-w-3xl">
            <span className="inline-block rounded-full bg-blue-700/20 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-sky-400">
              {data.column}
            </span>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              {data.tagline}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-300">
              {data.overview[0]}
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/#contact"
                className="inline-flex items-center rounded-full bg-white px-7 py-3.5 text-sm font-bold text-blue-700 shadow-lg transition hover:bg-blue-50"
              >
                Get a Free Quote →
              </Link>
              <Link
                href="#process"
                className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/10"
              >
                See Our Process
              </Link>
            </div>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" aria-hidden="true" />
      </section>

      <main id="main-content">

        {/* ── Overview ── */}
        {data.overview.length > 1 && (
          <section className="bg-white py-14 sm:py-16">
            <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-4">
              {data.overview.slice(1).map((para, i) => (
                <p key={i} className="text-base leading-relaxed text-slate-600">{para}</p>
              ))}
            </div>
          </section>
        )}

        {/* ── Key Offerings ── */}
        <section className="bg-slate-50 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-bold uppercase tracking-widest text-blue-600">What We Deliver</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                {data.title} Services
              </h2>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {data.offerings.map((o) => (
                <div
                  key={o.title}
                  className="group rounded-2xl border border-slate-100 bg-white p-7 shadow-sm transition hover:border-blue-200 hover:shadow-md"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-700 transition group-hover:bg-blue-700 group-hover:text-white">
                    <Icon path={o.icon} />
                  </div>
                  <h3 className="mt-5 text-base font-bold text-slate-900">{o.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{o.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Our Process ── */}
        <section id="process" className="scroll-mt-20 bg-slate-900 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-bold uppercase tracking-widest text-sky-400">How It Works</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                Our {data.title} Process
              </h2>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {data.process.map((p) => (
                <div
                  key={p.step}
                  className="rounded-2xl border border-white/10 bg-white/5 p-7 backdrop-blur-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-4xl font-extrabold text-blue-700/50">{p.step}</span>
                    <span className="rounded-full bg-sky-900/50 px-3 py-1 text-xs font-semibold text-sky-400">
                      {p.duration}
                    </span>
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
            <p className="text-center text-sm font-bold uppercase tracking-widest text-slate-400">
              Technologies We Use
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {data.techStack.map((t) => (
                <div
                  key={t.name}
                  className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2"
                >
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
              {data.faqs.map((item) => (
                <details
                  key={item.q}
                  className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm open:shadow-md"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-bold text-slate-900">
                    {item.q}
                    <svg
                      className="h-5 w-5 flex-shrink-0 text-blue-600 transition group-open:rotate-180"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <p className="mt-4 text-sm leading-relaxed text-slate-600">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Related Services ── */}
        {related.length > 0 && (
          <section className="bg-white py-16">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <p className="text-center text-sm font-bold uppercase tracking-widest text-slate-400">
                You Might Also Need
              </p>
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {related.map((r) => (
                  <Link
                    key={r.slug}
                    href={`/services/${r.slug}`}
                    className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-6 transition hover:border-blue-300 hover:bg-white hover:shadow-md"
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{r.column}</p>
                      <p className="mt-1 text-base font-bold text-slate-800 group-hover:text-blue-700">{r.title}</p>
                    </div>
                    <svg className="h-5 w-5 text-slate-300 transition group-hover:text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── CTA Banner ── */}
        <section className="bg-blue-700 py-16">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-3xl font-extrabold text-white">Ready to Get Started?</h2>
            <p className="mt-3 text-base text-blue-200">
              Tell us about your project and we&apos;ll respond within 24 hours with a scoped proposal.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <TrackedServiceCTA
                title={data.title}
                className="inline-flex items-center rounded-full bg-white px-8 py-3.5 text-sm font-bold text-blue-700 shadow-lg transition hover:bg-blue-50"
              >
                Get a Free Quote →
              </TrackedServiceCTA>
            </div>
          </div>
        </section>

      </main>
      <ConveysFooter />
    </>
  );
}
