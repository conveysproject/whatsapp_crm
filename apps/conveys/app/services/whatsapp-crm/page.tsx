import type { JSX } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConveysHeader } from "@/components/conveys-header";
import { ConveysFooter } from "@/components/conveys-footer";

export const metadata: Metadata = {
  title: "WhatsApp CRM & Business API for Small Business",
  description:
    "Set up WhatsApp Business API for your business. Automate conversations, run broadcast campaigns, and manage your entire customer pipeline on WhatsApp.",
  alternates: { canonical: "https://conveys.in/services/whatsapp-crm" },
  openGraph: { url: "https://conveys.in/services/whatsapp-crm", locale: "en_US" },
};

const OFFERINGS = [
  {
    title: "WhatsApp Business API Setup",
    description:
      "End-to-end Meta Business Manager verification, WhatsApp Business Account creation, phone number registration, and webhook configuration. We handle the compliance paperwork so you don't have to.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    title: "Broadcast Campaigns",
    description:
      "Send personalised messages to thousands of opted-in contacts simultaneously. Segment by location, purchase history, or any custom attribute. Track open rates and replies in real time.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73m0-3.46a24.347 24.347 0 010 3.46" />
      </svg>
    ),
  },
  {
    title: "Automated Conversation Flows",
    description:
      "Build no-code chatbot flows that qualify leads, answer FAQs, take orders, or book appointments — automatically, 24/7. Escalate to a human agent when needed.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    ),
  },
  {
    title: "Contact Management & CRM",
    description:
      "Import your existing contacts via CSV, segment them into smart lists, track conversation history, add notes, and assign contacts to team members — all in one inbox.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    ),
  },
  {
    title: "Message Template Management",
    description:
      "Create, submit, and manage Meta-approved message templates for transactional notifications, order updates, appointment reminders, and promotional campaigns.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    title: "Analytics & Reporting",
    description:
      "Track message delivery rates, read rates, reply rates, and campaign ROI. Identify your best-performing message templates and optimise your outreach over time.",
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
    title: "Business Verification",
    duration: "Week 1–2",
    body: "We guide you through Meta Business Manager verification and WhatsApp Business Account creation. We've done this dozens of times and know exactly what documentation Meta requires.",
  },
  {
    step: "02",
    title: "Phone Number Registration",
    duration: "Week 2",
    body: "Register your business phone number on the WhatsApp Cloud API. We configure webhooks, test message delivery, and ensure your number is in the correct messaging tier.",
  },
  {
    step: "03",
    title: "Template Creation & Approval",
    duration: "Week 2–3",
    body: "We write your message templates in Meta's approved format and submit them for review. Marketing templates typically take 24–48 hours; utility templates are approved in minutes.",
  },
  {
    step: "04",
    title: "Contact Import & Segmentation",
    duration: "Week 3",
    body: "Import your existing contacts from CSV or your CRM. We set up segments based on your business logic — by city, product purchased, lead stage, or any other field.",
  },
  {
    step: "05",
    title: "Automation Setup",
    duration: "Week 3–4",
    body: "Build your chatbot flows and automated follow-up sequences. We test every path in the flow with real messages before going live.",
  },
  {
    step: "06",
    title: "Team Training & Handoff",
    duration: "Week 4–5",
    body: "We train your team on the platform, document every flow and template, and stay available for the first 30 days to handle any questions or adjustments.",
  },
] as const;

const FAQ = [
  {
    q: "How do I get started with the WhatsApp Business API?",
    a: "We handle the entire setup process — Meta Business Manager verification, WhatsApp Business Account creation, phone number registration, and webhook configuration. Most businesses are live within 2–3 weeks. You don't need a technical team on your side.",
  },
  {
    q: "How much does it cost to send WhatsApp messages?",
    a: "Meta charges per conversation (a 24-hour window), not per message. Rates vary by country — typically $0.003–$0.09 USD per conversation depending on category (marketing, utility, or authentication). Our platform subscription fee is separate from these Meta charges.",
  },
  {
    q: "Can I import my existing customer contacts?",
    a: "Yes. We support bulk import via CSV or Excel with custom field mapping. Contacts must have opted in to receive WhatsApp messages from your business — we'll walk you through compliant opt-in collection methods.",
  },
  {
    q: "Is this compliant with WhatsApp's policies?",
    a: "Yes. All templates go through Meta's approval process before use. We ensure your opt-in collection, template content, and message frequency follow WhatsApp's Business Messaging Policy. Non-compliance can result in number suspension, which we proactively help you avoid.",
  },
  {
    q: "How many messages can I send per day?",
    a: "WhatsApp uses a phone number tier system. New numbers start at 250 conversations/day and can scale to 1,000 → 10,000 → 100,000/day based on message volume and quality ratings. We help you scale quickly by maintaining a high message quality score.",
  },
] as const;

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  "@id": "https://conveys.in/services/whatsapp-crm#service",
  name: "WhatsApp CRM & Business API",
  provider: { "@id": "https://conveys.in/#organization" },
  areaServed: { "@type": "AdministrativeArea", name: "Worldwide" },
  description:
    "Set up WhatsApp Business API for your business. Automate conversations, run broadcast campaigns, and manage your entire customer pipeline on WhatsApp.",
  url: "https://conveys.in/services/whatsapp-crm",
};

export default function WhatsAppCRMPage(): JSX.Element {
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
      <section className="relative overflow-hidden bg-emerald-950">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-32 top-0 h-[30rem] w-[30rem] rounded-full bg-emerald-700/20 blur-3xl" />
          <div className="absolute right-0 bottom-0 h-64 w-64 rounded-full bg-teal-500/15 blur-3xl" />
        </div>
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-28">
          <div>
            <Link href="/#services" className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-emerald-300 hover:text-emerald-200">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              All Services
            </Link>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Turn WhatsApp Into Your Best Sales Channel
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-emerald-100">
              Automate conversations, broadcast personalised campaigns, and manage your entire customer pipeline on the platform your customers already use every day — WhatsApp.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/#contact" className="inline-flex items-center rounded-full bg-white px-7 py-3.5 text-sm font-bold text-emerald-700 shadow-lg transition hover:bg-emerald-50">
                Get Started →
              </Link>
              <Link href="#process" className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/10">
                See Our Process
              </Link>
            </div>
          </div>

          {/* WhatsApp chat illustration */}
          <div className="flex justify-center" aria-hidden="true">
            <svg viewBox="0 0 320 400" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-60 drop-shadow-2xl">
              {/* Phone frame */}
              <rect x="10" y="10" width="190" height="380" rx="30" fill="#064e3b" stroke="#059669" strokeWidth="2.5" />
              {/* Screen */}
              <rect x="20" y="44" width="170" height="332" rx="12" fill="#f0fdf4" />
              {/* WhatsApp header */}
              <rect x="20" y="44" width="170" height="52" fill="#075e54" rx="12" />
              <rect x="20" y="72" width="170" height="24" fill="#075e54" />
              <circle cx="44" cy="70" r="14" fill="#128c7e" />
              <rect x="64" y="62" width="80" height="8" rx="4" fill="white" opacity="0.9" />
              <rect x="64" y="74" width="50" height="5" rx="2.5" fill="rgba(255,255,255,0.5)" />
              {/* Chat messages */}
              <rect x="30" y="108" width="110" height="30" rx="12" fill="#dcf8c6" />
              <text x="40" y="127" fontSize="8" fill="#333">Hi! I saw your ad on Instagram</text>
              <rect x="100" y="148" width="82" height="30" rx="12" fill="#128c7e" />
              <text x="108" y="167" fontSize="8" fill="white">Hello! How can I help?</text>
              <rect x="30" y="188" width="120" height="30" rx="12" fill="#dcf8c6" />
              <text x="40" y="207" fontSize="8" fill="#333">I need a new website</text>
              <rect x="88" y="228" width="102" height="42" rx="12" fill="#128c7e" />
              <text x="96" y="243" fontSize="7.5" fill="white">Great! We offer web</text>
              <text x="96" y="254" fontSize="7.5" fill="white">development starting</text>
              <text x="96" y="265" fontSize="7.5" fill="white">at $299. Let me share</text>
              <rect x="30" y="280" width="130" height="24" rx="12" fill="#dcf8c6" />
              <text x="40" y="296" fontSize="8" fill="#333">Can I see your portfolio?</text>
              {/* Automated reply badge */}
              <rect x="88" y="314" width="102" height="36" rx="10" fill="#128c7e" />
              <rect x="92" y="318" width="40" height="5" rx="2.5" fill="rgba(255,255,255,0.4)" />
              <text x="96" y="333" fontSize="7" fill="rgba(255,255,255,0.7)">🤖 Auto-reply</text>
              <text x="96" y="343" fontSize="7.5" fill="white">conveys.in/portfolio →</text>
              {/* Input bar */}
              <rect x="20" y="356" width="170" height="20" fill="#f0f0f0" />
              <rect x="28" y="360" width="120" height="12" rx="6" fill="white" />
              <circle cx="178" cy="366" r="8" fill="#128c7e" />
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
              <p className="text-sm font-bold uppercase tracking-widest text-emerald-600">What We Deliver</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                WhatsApp CRM Features
              </h2>
              <p className="mt-3 text-base text-slate-500">
                Everything you need to acquire, engage, and retain customers over WhatsApp.
              </p>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {OFFERINGS.map((o) => (
                <div key={o.title} className="group rounded-2xl border border-slate-100 bg-slate-50 p-7 transition hover:border-emerald-200 hover:bg-white hover:shadow-md">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 transition group-hover:bg-emerald-700 group-hover:text-white">
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
        <section id="process" className="scroll-mt-20 bg-emerald-950 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-bold uppercase tracking-widest text-emerald-300">How It Works</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                From Signup to First Campaign
              </h2>
              <p className="mt-3 text-base text-emerald-300">
                Most clients send their first broadcast within 4–5 weeks of kickoff.
              </p>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {PROCESS.map((p) => (
                <div key={p.step} className="rounded-2xl border border-white/10 bg-white/5 p-7 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-4xl font-extrabold text-emerald-700/50">{p.step}</span>
                    <span className="rounded-full bg-emerald-900/60 px-3 py-1 text-xs font-semibold text-emerald-300">{p.duration}</span>
                  </div>
                  <h3 className="mt-4 text-base font-bold text-white">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-emerald-100">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="bg-slate-50 py-20 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <p className="text-sm font-bold uppercase tracking-widest text-emerald-600">FAQ</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Common Questions</h2>
            </div>
            <div className="mt-10 space-y-4">
              {FAQ.map((item) => (
                <details key={item.q} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm open:shadow-md">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-bold text-slate-900">
                    {item.q}
                    <svg className="h-5 w-5 flex-shrink-0 text-emerald-600 transition group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
        <section className="bg-emerald-700 py-16">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-3xl font-extrabold text-white">Ready to Grow on WhatsApp?</h2>
            <p className="mt-3 text-base text-emerald-100">We&apos;ll set up the API, templates, and first campaign — you focus on the conversations.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href="/#contact" className="inline-flex items-center rounded-full bg-white px-8 py-3.5 text-sm font-bold text-emerald-700 shadow-lg transition hover:bg-emerald-50">
                Get Started →
              </Link>
              <Link href="/services/ai-solutions" className="inline-flex items-center rounded-full border border-white/30 bg-white/10 px-8 py-3.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/20">
                AI Solutions →
              </Link>
            </div>
          </div>
        </section>

      </main>
      <ConveysFooter />
    </>
  );
}
