import type { JSX } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConveysHeader } from "@/components/conveys-header";
import { ConveysFooter } from "@/components/conveys-footer";

export const metadata: Metadata = {
  title: "About Conveys Information Technology — Mumbai",
  description:
    "Conveys Information Technology is a software development company in Dombivli West, Mumbai. We build web apps, mobile apps, WhatsApp CRM, AI solutions, and SaaS products for Indian businesses.",
  alternates: { canonical: "https://conveys.in/about" },
  openGraph: { url: "https://conveys.in/about" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  "@id": "https://conveys.in/about#page",
  url: "https://conveys.in/about",
  name: "About Conveys Information Technology",
  about: {
    "@type": "Organization",
    "@id": "https://conveys.in/#organization",
    name: "Conveys Information Technology",
    foundingDate: "2022",
    url: "https://conveys.in",
    email: "info@conveys.in",
    telephone: "+919907072035",
    address: {
      "@type": "PostalAddress",
      streetAddress: "SwaminarayanCity",
      addressLocality: "Dombivli West",
      addressRegion: "Maharashtra",
      postalCode: "421202",
      addressCountry: "IN",
    },
    areaServed: { "@type": "Country", name: "India" },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Software Development Services",
      itemListElement: [
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "WhatsApp CRM & Business API", url: "https://conveys.in/services/whatsapp-crm" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Web Development & Design", url: "https://conveys.in/services/web-development" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Mobile App Development", url: "https://conveys.in/services/mobile-app-development" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "AI Solutions & LLM Integration", url: "https://conveys.in/services/ai-solutions" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "SaaS & MVP Development", url: "https://conveys.in/services/saas-product-development" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Digital Marketing", url: "https://conveys.in/services/digital-marketing" } },
      ],
    },
  },
};

const SERVICES = [
  { title: "WhatsApp CRM & Business API", href: "/services/whatsapp-crm", description: "End-to-end WhatsApp API setup, broadcasts, chatbots, and multi-agent inbox." },
  { title: "Web Development & Design", href: "/services/web-development", description: "Marketing sites, web apps, e-commerce, and portals in Next.js + Node.js." },
  { title: "Mobile App Development", href: "/services/mobile-app-development", description: "iOS, Android, and cross-platform apps with React Native." },
  { title: "AI Solutions & LLM Integration", href: "/services/ai-solutions", description: "AI chatbots, RAG systems, document processing, and LLM-powered workflows." },
  { title: "SaaS & MVP Development", href: "/services/saas-product-development", description: "Full-stack SaaS products with multi-tenancy, billing, and admin dashboards." },
  { title: "Digital Marketing", href: "/services/digital-marketing", description: "SEO, WhatsApp campaigns, Google Ads, and content marketing for Indian SMBs." },
] as const;

const TECH = [
  "Next.js 15", "React", "TypeScript", "Node.js", "Fastify",
  "PostgreSQL", "Prisma", "Redis", "React Native", "Flutter",
  "Anthropic Claude API", "OpenAI GPT-4", "WhatsApp Cloud API",
  "Stripe", "Razorpay", "Vercel", "Railway", "AWS S3",
] as const;

export default function AboutPage(): JSX.Element {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ConveysHeader />

      <main id="main-content">
        {/* Hero */}
        <section className="bg-slate-900 py-20 sm:py-28">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <p className="text-sm font-bold uppercase tracking-widest text-sky-400">About Us</p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Building Technology for Indian Businesses
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-slate-300">
              Conveys Information Technology is a software development company based in Dombivli West, Mumbai. We build custom web applications, mobile apps, WhatsApp CRM systems, AI-powered tools, and SaaS products for Indian SMBs and startups.
            </p>
          </div>
        </section>

        {/* Who We Are */}
        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Who We Are</h2>
            <div className="mt-6 space-y-4 text-base leading-relaxed text-slate-600">
              <p>
                We are a full-stack software development team specialising in the technology stacks most relevant to Indian businesses in 2025 — WhatsApp Business API, modern web frameworks (Next.js, React), cross-platform mobile development (React Native), and AI/LLM integration.
              </p>
              <p>
                Our clients are typically Indian SMBs, funded startups, and businesses that have outgrown off-the-shelf tools and need custom software built precisely for their workflows. We work across industries — retail, real estate, education, healthcare, fintech, and e-commerce.
              </p>
              <p>
                We are based in Dombivli West, Mumbai, Maharashtra (421202), and serve clients remotely across India and internationally.
              </p>
            </div>
          </div>
        </section>

        {/* Services */}
        <section className="bg-slate-50 py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">What We Build</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {SERVICES.map((s) => (
                <Link
                  key={s.title}
                  href={s.href}
                  className="group rounded-xl border border-slate-200 bg-white p-6 transition hover:border-indigo-200 hover:shadow-md"
                >
                  <h3 className="font-bold text-slate-900 group-hover:text-indigo-700">{s.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{s.description}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Tech Stack */}
        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Technology We Use</h2>
            <p className="mt-3 text-slate-500">
              We use modern, production-proven technologies. No outdated stacks, no framework experiments.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {TECH.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Why Conveys */}
        <section className="bg-indigo-600 py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-extrabold tracking-tight text-white">Why Businesses Choose Us</h2>
            <ul className="mt-6 space-y-3">
              {[
                "India-focused — we understand Indian business workflows, payment systems (Razorpay, UPI), and regulatory context",
                "WhatsApp-first — WhatsApp is India's primary business communication channel, and it's our speciality",
                "Full-stack in-house team — no outsourcing, no freelancers; the same team that builds also maintains",
                "Fixed pricing — no hourly billing surprises; every project has a defined scope and price",
                "Modern tech stack — Next.js, TypeScript, PostgreSQL, React Native; no legacy PHP or jQuery",
              ].map((point) => (
                <li key={point} className="flex items-start gap-3 text-indigo-100">
                  <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-sm leading-relaxed">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Contact CTA */}
        <section className="bg-white py-16">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-2xl font-extrabold text-slate-900">Get in Touch</h2>
            <p className="mt-3 text-slate-500">Tell us what you&apos;re building. We&apos;ll respond within 24 hours.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-4">
              <Link href="/#contact" className="inline-flex items-center rounded-full bg-indigo-600 px-7 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700">
                Contact Us →
              </Link>
              <Link href="/" className="inline-flex items-center rounded-full border border-slate-200 px-7 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                ← Back to Home
              </Link>
            </div>
          </div>
        </section>
      </main>

      <ConveysFooter />
    </>
  );
}
