import type { JSX } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConveysHeader } from "@/components/conveys-header";
import { ConveysFooter } from "@/components/conveys-footer";

export const metadata: Metadata = {
  title: "iOS & Android App Development — Mumbai",
  description:
    "Native and cross-platform mobile app development in Mumbai. Full lifecycle — UX design, development, QA, and App Store submission. React Native & Expo.",
  alternates: { canonical: "https://conveys.in/services/mobile-app-development" },
  openGraph: { url: "https://conveys.in/services/mobile-app-development" },
};

const OFFERINGS = [
  {
    title: "iOS App Development",
    description:
      "Native Swift apps designed to meet Apple's Human Interface Guidelines. We target the latest iOS versions and handle App Store submission and review end-to-end.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3" />
      </svg>
    ),
  },
  {
    title: "Android App Development",
    description:
      "Kotlin-powered Android apps optimised for the full device ecosystem — phones, tablets, and foldables. Published to Google Play with full release management.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
      </svg>
    ),
  },
  {
    title: "Cross-Platform with React Native",
    description:
      "One codebase, both platforms. React Native with Expo delivers near-native performance for most business apps while significantly reducing cost and time-to-market.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
  },
  {
    title: "UX Design & Prototyping",
    description:
      "User research, information architecture, wireframes, and high-fidelity Figma prototypes — tested with real users before a line of code is written.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
      </svg>
    ),
  },
  {
    title: "Backend & API Integration",
    description:
      "REST and GraphQL API development, push notification services, real-time data sync, authentication, and third-party service integrations (payment gateways, maps, CRM).",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
      </svg>
    ),
  },
  {
    title: "QA Testing & App Store Submission",
    description:
      "Automated and manual QA across real devices. We handle the complete App Store and Google Play submission process including screenshots, descriptions, and compliance.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
] as const;

const PROCESS = [
  {
    step: "01",
    title: "Discovery & Research",
    duration: "Week 1",
    body: "User research, competitive analysis, and feature prioritisation. We define the MVP scope so you launch fast and validate early — not over-engineered from day one.",
  },
  {
    step: "02",
    title: "UX Design",
    duration: "Week 2–3",
    body: "User flows, information architecture, and interactive Figma prototypes. We test the prototype with real users and iterate before development begins.",
  },
  {
    step: "03",
    title: "Development Sprints",
    duration: "Week 3–10",
    body: "Two-week sprints with testable builds delivered after each sprint. You install the beta app and give direct feedback — no waiting until the end to see results.",
  },
  {
    step: "04",
    title: "QA & Device Testing",
    duration: "Week 10–12",
    body: "Testing on 10+ real iOS and Android devices covering different screen sizes, OS versions, and network conditions. Performance profiling and crash testing included.",
  },
  {
    step: "05",
    title: "App Store Submission",
    duration: "Week 12–13",
    body: "We handle the full submission: Apple App Store (typically 1–3 day review) and Google Play (1–7 day review). We've never had a first-time rejection for policy violations.",
  },
  {
    step: "06",
    title: "Post-Launch Support",
    duration: "Ongoing",
    body: "3-month free bug-fix period. We monitor crash analytics (Sentry), handle OS update compatibility, and can plan the next feature release cycle.",
  },
] as const;

const TECH = [
  { name: "React Native", category: "Framework" },
  { name: "Expo", category: "Toolchain" },
  { name: "Swift", category: "iOS Native" },
  { name: "Kotlin", category: "Android Native" },
  { name: "TypeScript", category: "Language" },
  { name: "Firebase", category: "Backend" },
  { name: "Fastify", category: "API" },
  { name: "PostgreSQL", category: "Database" },
  { name: "Sentry", category: "Monitoring" },
  { name: "Razorpay SDK", category: "Payments" },
  { name: "Clerk Auth", category: "Auth" },
  { name: "Figma", category: "Design" },
] as const;

const FAQ = [
  {
    q: "Do you build for iOS only, Android only, or both?",
    a: "We build for both platforms. For most business apps, we use React Native with Expo — a single codebase that runs on both iOS and Android with near-native performance. This significantly reduces development cost. If your app requires platform-specific features unavailable in React Native (advanced AR, hardware integrations), we build native Swift/Kotlin.",
  },
  {
    q: "How long does App Store approval take?",
    a: "Apple App Store reviews typically take 1–3 business days for new apps and 1 day for updates. Google Play reviews take 1–7 days for new apps. We submit all required metadata, screenshots, and privacy policy upfront to avoid review delays.",
  },
  {
    q: "Can you integrate with our existing backend or software?",
    a: "Yes. We integrate with any backend that has a REST or GraphQL API. If your existing system doesn't have an API, we can build a lightweight API layer on top of it. We've integrated with Tally, Salesforce, Shopify, and custom-built backends.",
  },
  {
    q: "Do you design the UI/UX, or do we need to provide designs?",
    a: "Full UI/UX design is included in every project. We do the user research, create wireframes, build interactive prototypes in Figma, and test with real users — all before development begins. If you already have designs, we can work from them.",
  },
  {
    q: "What happens after launch if the app needs updates?",
    a: "We provide a 3-month free bug-fix period after launch. For ongoing development — new features, OS compatibility updates, or performance improvements — we offer monthly retainer plans or project-based billing for specific features.",
  },
] as const;

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  "@id": "https://conveys.in/services/mobile-app-development#service",
  name: "iOS & Android App Development",
  provider: { "@id": "https://conveys.in/#organization" },
  areaServed: { "@type": "Country", name: "India" },
  description:
    "Native and cross-platform mobile app development in Mumbai. Full lifecycle — UX design, development, QA, and App Store submission.",
  url: "https://conveys.in/services/mobile-app-development",
};

export default function MobileAppDevelopmentPage(): JSX.Element {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: { "@type": "Answer", text: item.a },
            })),
          }),
        }}
      />
      <ConveysHeader />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-indigo-950">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-32 -top-32 h-[30rem] w-[30rem] rounded-full bg-indigo-700/20 blur-3xl" />
          <div className="absolute -right-20 top-20 h-64 w-64 rounded-full bg-violet-500/15 blur-3xl" />
        </div>
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-28">
          <div>
            <Link href="/#services" className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-indigo-300 hover:text-indigo-200">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              All Services
            </Link>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Native Apps Your Users Will Actually Love
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-indigo-200">
              iOS and Android apps built for real-world performance. We own the full lifecycle from UX design and development to QA testing and App Store submission — all under one roof.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/#contact" className="inline-flex items-center rounded-full bg-white px-7 py-3.5 text-sm font-bold text-indigo-700 shadow-lg transition hover:bg-indigo-50">
                Get a Free Quote →
              </Link>
              <Link href="#process" className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/10">
                See Our Process
              </Link>
            </div>
          </div>

          {/* Phone illustration */}
          <div className="flex justify-center" aria-hidden="true">
            <svg viewBox="0 0 320 420" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-56 drop-shadow-2xl">
              {/* Phone body */}
              <rect x="10" y="10" width="180" height="340" rx="30" fill="#1e1b4b" stroke="#4338ca" strokeWidth="3" />
              {/* Notch */}
              <rect x="65" y="16" width="60" height="18" rx="9" fill="#312e81" />
              {/* Screen */}
              <rect x="20" y="48" width="160" height="288" rx="12" fill="#0f172a" />
              {/* Status bar */}
              <rect x="30" y="58" width="50" height="6" rx="3" fill="#4338ca" opacity="0.6" />
              <rect x="130" y="58" width="40" height="6" rx="3" fill="#334155" />
              {/* App header */}
              <rect x="20" y="78" width="160" height="40" fill="#312e81" />
              <rect x="36" y="91" width="80" height="8" rx="4" fill="white" opacity="0.9" />
              <circle cx="162" cy="98" r="10" fill="rgba(255,255,255,0.2)" />
              {/* Content cards */}
              <rect x="30" y="130" width="140" height="54" rx="10" fill="#1e293b" />
              <circle cx="50" cy="157" r="14" fill="#6366f1" opacity="0.7" />
              <rect x="72" y="145" width="80" height="8" rx="4" fill="#64748b" />
              <rect x="72" y="159" width="60" height="6" rx="3" fill="#475569" />
              <rect x="30" y="194" width="140" height="54" rx="10" fill="#1e293b" />
              <circle cx="50" cy="221" r="14" fill="#8b5cf6" opacity="0.7" />
              <rect x="72" y="209" width="80" height="8" rx="4" fill="#64748b" />
              <rect x="72" y="223" width="60" height="6" rx="3" fill="#475569" />
              <rect x="30" y="258" width="140" height="54" rx="10" fill="#1e293b" />
              <circle cx="50" cy="285" r="14" fill="#06b6d4" opacity="0.7" />
              <rect x="72" y="273" width="80" height="8" rx="4" fill="#64748b" />
              <rect x="72" y="287" width="60" height="6" rx="3" fill="#475569" />
              {/* Bottom nav */}
              <rect x="20" y="316" width="160" height="20" fill="#312e81" />
              <circle cx="60" cy="326" r="6" fill="white" opacity="0.7" />
              <circle cx="100" cy="326" r="6" fill="rgba(255,255,255,0.3)" />
              <circle cx="140" cy="326" r="6" fill="rgba(255,255,255,0.3)" />
              {/* Home indicator */}
              <rect x="75" y="344" width="50" height="4" rx="2" fill="#4338ca" opacity="0.8" />
              {/* Second phone shadow */}
              <rect x="140" y="50" width="160" height="300" rx="28" fill="#1e1b4b" stroke="#4338ca" strokeWidth="2" opacity="0.5" />
              <rect x="150" y="78" width="140" height="244" rx="10" fill="#0f172a" opacity="0.5" />
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
              <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">What We Deliver</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                Mobile App Development Services
              </h2>
              <p className="mt-3 text-base text-slate-500">
                From consumer apps to enterprise tools — we build apps people actually use.
              </p>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {OFFERINGS.map((o) => (
                <div key={o.title} className="group rounded-2xl border border-slate-100 bg-slate-50 p-7 transition hover:border-indigo-200 hover:bg-white hover:shadow-md">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 transition group-hover:bg-indigo-700 group-hover:text-white">
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
        <section id="process" className="scroll-mt-20 bg-indigo-950 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-bold uppercase tracking-widest text-indigo-300">How It Works</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                From Idea to App Store
              </h2>
              <p className="mt-3 text-base text-indigo-300">
                A 12–13 week process with a working beta in your hands by week four.
              </p>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {PROCESS.map((p) => (
                <div key={p.step} className="rounded-2xl border border-white/10 bg-white/5 p-7 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-4xl font-extrabold text-indigo-700/50">{p.step}</span>
                    <span className="rounded-full bg-indigo-900/60 px-3 py-1 text-xs font-semibold text-indigo-300">{p.duration}</span>
                  </div>
                  <h3 className="mt-4 text-base font-bold text-white">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-indigo-200">{p.body}</p>
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
              <p className="text-sm font-bold uppercase tracking-widest text-indigo-600">FAQ</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Common Questions</h2>
            </div>
            <div className="mt-10 space-y-4">
              {FAQ.map((item) => (
                <details key={item.q} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm open:shadow-md">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-bold text-slate-900">
                    {item.q}
                    <svg className="h-5 w-5 flex-shrink-0 text-indigo-600 transition group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
        <section className="bg-indigo-700 py-16">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-3xl font-extrabold text-white">Ready to Build Your App?</h2>
            <p className="mt-3 text-base text-indigo-200">Share your idea and we&apos;ll scope it out — for free, with no commitment.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href="/#contact" className="inline-flex items-center rounded-full bg-white px-8 py-3.5 text-sm font-bold text-indigo-700 shadow-lg transition hover:bg-indigo-50">
                Get a Free Quote →
              </Link>
              <Link href="/services/whatsapp-crm" className="inline-flex items-center rounded-full border border-white/30 bg-white/10 px-8 py-3.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/20">
                WhatsApp CRM →
              </Link>
            </div>
          </div>
        </section>

      </main>
      <ConveysFooter />
    </>
  );
}
