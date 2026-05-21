import type { JSX } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConveysHeader } from "@/components/conveys-header";
import { ConveysFooter } from "@/components/conveys-footer";
import { SERVICE_NAV, SERVICES } from "@/lib/services-data";
import { ServicePage, buildMetadata } from "@/components/service-page";

// Slugs that have their own static page.tsx — excluded from this dynamic route
const STATIC_SLUGS = new Set([
  "web-development",
  "mobile-app-development",
  "whatsapp-crm",
  "ai-solutions",
  "site-migration",
]);

export function generateStaticParams(): Array<{ slug: string }> {
  return SERVICE_NAV
    .filter((s) => !STATIC_SLUGS.has(s.slug))
    .map((s) => ({ slug: s.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const fullData = SERVICES.find((s) => s.slug === slug);
  if (fullData) return buildMetadata(fullData);

  const service = SERVICE_NAV.find((s) => s.slug === slug);
  if (!service) return {};
  const url = `https://conveys.in/services/${slug}`;
  return {
    title: `${service.title} Services in India | Conveys`,
    description: `${service.title} services for Indian businesses — expert team, fixed pricing, and proven delivery. Get a free quote today.`,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { title: `${service.title} | Conveys`, url, siteName: "Conveys", locale: "en_IN", type: "website" },
  };
}

export default async function ServiceSlugPage(
  { params }: { params: Promise<{ slug: string }> }
): Promise<JSX.Element> {
  const { slug } = await params;
  const service = SERVICE_NAV.find((s) => s.slug === slug);
  if (!service || STATIC_SLUGS.has(slug)) notFound();

  // Full page — render template when data is ready
  const fullData = SERVICES.find((s) => s.slug === slug);
  if (fullData) return <ServicePage data={fullData} />;

  // Coming-soon fallback for services not yet populated
  return (
    <>
      <ConveysHeader />

      <section className="relative overflow-hidden bg-slate-900">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full bg-blue-700/20 blur-3xl" />
          <div className="absolute -right-20 top-10 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-xs text-slate-400">
            <Link href="/" className="hover:text-white">Home</Link>
            <span>/</span>
            <Link href="/#services" className="hover:text-white">Services</Link>
            <span>/</span>
            <span className="text-slate-200">{service.title}</span>
          </nav>
          <div className="max-w-2xl">
            <span className="inline-block rounded-full bg-blue-700/20 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-sky-400">
              {service.column}
            </span>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              {service.title}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-300">
              Expert {service.title.toLowerCase()} services for Indian businesses — in-house team, fixed pricing, and proven delivery.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/#contact"
                className="inline-flex items-center rounded-full bg-white px-7 py-3.5 text-sm font-bold text-blue-700 shadow-lg transition hover:bg-blue-50"
              >
                Get a Free Quote →
              </Link>
            </div>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" aria-hidden="true" />
      </section>

      <main id="main-content">
        <section className="bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <p className="text-sm font-bold uppercase tracking-widest text-blue-600">Coming Soon</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900">
              Full {service.title} Page in Progress
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-500">
              We&apos;re putting together detailed information about our {service.title.toLowerCase()} services. In the meantime, reach out directly and we&apos;ll scope your project same day.
            </p>
            <div className="mt-8">
              <Link
                href="/#contact"
                className="inline-flex items-center rounded-full bg-blue-700 px-8 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-blue-800"
              >
                Contact Us →
              </Link>
            </div>
          </div>
        </section>
      </main>

      <ConveysFooter />
    </>
  );
}
