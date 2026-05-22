import type { JSX } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConveysHeader } from "@/components/conveys-header";
import { ConveysFooter } from "@/components/conveys-footer";

export const metadata: Metadata = {
  title: "AI Solutions & LLM Integration — Mumbai",
  description:
    "Custom AI chatbots, document processing, and LLM integrations (Claude, GPT-4) for Indian businesses. Practical AI that solves real operational problems.",
  alternates: { canonical: "https://conveys.in/services/ai-solutions" },
  openGraph: { url: "https://conveys.in/services/ai-solutions" },
};

const OFFERINGS = [
  {
    title: "AI Chatbots & Virtual Assistants",
    description:
      "Intelligent chatbots for customer support, lead qualification, and internal helpdesks. Trained on your business knowledge base and integrated into your website, WhatsApp, or internal tools.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    ),
  },
  {
    title: "Document Processing & Data Extraction",
    description:
      "Automate the extraction of structured data from invoices, purchase orders, contracts, and forms. Connect to your accounting software or ERP to eliminate manual data entry.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    title: "LLM Integration & RAG Systems",
    description:
      "Connect Claude, GPT-4, or Gemini to your internal data using Retrieval-Augmented Generation (RAG). Let your team ask questions against private databases, PDFs, and knowledge bases.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
      </svg>
    ),
  },
  {
    title: "AI-Powered Analytics",
    description:
      "Turn raw business data into natural-language insights. Ask your sales data questions in plain English, get automated weekly summaries, or detect anomalies before they become problems.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    title: "Recommendation Engines",
    description:
      "Product recommendations, content personalisation, and next-best-action suggestions — trained on your customers' behaviour and deployed into your existing storefront or app.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
  },
  {
    title: "AI Workflow Automation",
    description:
      "Automate multi-step business processes — invoice approval chains, content generation pipelines, customer onboarding sequences — using AI agents that act, decide, and escalate intelligently.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
] as const;

const PROCESS = [
  {
    step: "01",
    title: "Problem Definition",
    duration: "Week 1",
    body: "We identify the specific operational problem AI should solve — not 'use AI somewhere', but 'reduce invoice processing time from 3 days to 10 minutes'. Clear outcome, measurable success.",
  },
  {
    step: "02",
    title: "Data & Feasibility Assessment",
    duration: "Week 1–2",
    body: "We assess the quality, volume, and structure of your data. We tell you honestly what AI can and cannot do with what you have — before you spend any money on development.",
  },
  {
    step: "03",
    title: "Prototype",
    duration: "Week 2–4",
    body: "A working prototype in your hands within two weeks. We use the right model for the job (Claude for reasoning tasks, GPT-4 for general tasks, specialised models for vision/audio) and test accuracy against your real data.",
  },
  {
    step: "04",
    title: "Integration",
    duration: "Week 4–7",
    body: "Connect the AI to your existing systems via API, webhook, or direct database access. We build human-in-the-loop workflows for decisions that require oversight.",
  },
  {
    step: "05",
    title: "Testing & Accuracy Tuning",
    duration: "Week 7–8",
    body: "Evaluate performance on edge cases, adversarial inputs, and real production scenarios. Adjust prompts, retrieval strategies, and guardrails until accuracy meets your requirements.",
  },
  {
    step: "06",
    title: "Deployment & Monitoring",
    duration: "Week 8–9",
    body: "Production deployment with logging, performance monitoring, cost tracking, and automatic alerts when the model's behaviour changes. AI systems need ongoing attention — we provide it.",
  },
] as const;

const TECH = [
  { name: "Claude (Anthropic)", category: "LLM" },
  { name: "GPT-4o", category: "LLM" },
  { name: "Gemini 1.5", category: "LLM" },
  { name: "LangChain", category: "Orchestration" },
  { name: "Python 3.11", category: "Language" },
  { name: "FastAPI", category: "API" },
  { name: "Pinecone", category: "Vector DB" },
  { name: "pgvector", category: "Vector DB" },
  { name: "Whisper", category: "Audio AI" },
  { name: "Tesseract OCR", category: "Document AI" },
  { name: "PostgreSQL", category: "Database" },
  { name: "Redis", category: "Cache" },
] as const;

const FAQ = [
  {
    q: "Do you train custom AI models from scratch?",
    a: "Rarely. Training a large model from scratch costs millions of dollars and requires massive datasets. For most business problems, we get better results by prompt-engineering or fine-tuning existing models (Claude, GPT-4, Gemini) on your specific data. We'll tell you honestly when a custom model is justified versus when it's overkill.",
  },
  {
    q: "Where is our business data stored when you use AI APIs?",
    a: "We give you full control. For Anthropic and OpenAI APIs, data is processed in transit but not used for training (with enterprise agreements). For sensitive data, we can deploy open-source models on your own infrastructure so data never leaves your environment. We document exactly how each piece of data flows.",
  },
  {
    q: "Can the AI integrate with our existing software?",
    a: "Yes. We integrate with any system that has a REST API, database access, or file export capability. We've connected AI pipelines to Tally, Zoho CRM, Shopify, custom ERPs, Google Sheets, and WhatsApp. If your software doesn't have an API, we build a lightweight connector.",
  },
  {
    q: "How accurate will the AI responses be?",
    a: "Accuracy depends heavily on the use case and data quality. For structured extraction tasks (invoices, forms), we regularly achieve 95%+ accuracy. For open-ended tasks, we build human review steps into critical paths. We always measure accuracy on your real data during the prototype phase — before any production commitment.",
  },
  {
    q: "Which LLM do you recommend for business use?",
    a: "We typically recommend Claude (Anthropic) for tasks requiring careful reasoning, document analysis, and nuanced responses — it follows instructions precisely and handles long documents well. For general chat and code generation, GPT-4o is also excellent. We benchmark both on your specific use case and recommend based on performance and cost.",
  },
] as const;

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  "@id": "https://conveys.in/services/ai-solutions#service",
  name: "AI Solutions & LLM Integration",
  provider: { "@id": "https://conveys.in/#organization" },
  areaServed: { "@type": "Country", name: "India" },
  description:
    "Custom AI chatbots, document processing, and LLM integrations (Claude, GPT-4) for Indian businesses. Practical AI that solves real operational problems.",
  url: "https://conveys.in/services/ai-solutions",
};

export default function AISolutionsPage(): JSX.Element {
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
      <section className="relative overflow-hidden bg-violet-950">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full bg-violet-700/20 blur-3xl" />
          <div className="absolute right-0 bottom-0 h-80 w-80 rounded-full bg-purple-500/15 blur-3xl" />
        </div>
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-28">
          <div>
            <Link href="/#services" className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-violet-300 hover:text-violet-200">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              All Services
            </Link>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              AI That Solves Real Business Problems
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-violet-100">
              We build AI solutions that cut operational costs, automate repetitive work, and surface insights from your data — using Claude, GPT-4, and purpose-built pipelines tailored to your business.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/#contact" className="inline-flex items-center rounded-full bg-white px-7 py-3.5 text-sm font-bold text-violet-700 shadow-lg transition hover:bg-violet-50">
                Get a Free Consultation →
              </Link>
              <Link href="#process" className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/10">
                See Our Process
              </Link>
            </div>
          </div>

          {/* AI neural network illustration */}
          <div className="hidden lg:flex justify-center" aria-hidden="true">
            <svg viewBox="0 0 480 360" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-sm drop-shadow-2xl">
              {/* Connection lines */}
              <line x1="80" y1="80" x2="200" y2="120" stroke="#7c3aed" strokeWidth="1.5" opacity="0.4" />
              <line x1="80" y1="180" x2="200" y2="120" stroke="#7c3aed" strokeWidth="1.5" opacity="0.4" />
              <line x1="80" y1="280" x2="200" y2="240" stroke="#7c3aed" strokeWidth="1.5" opacity="0.4" />
              <line x1="80" y1="180" x2="200" y2="240" stroke="#7c3aed" strokeWidth="1.5" opacity="0.4" />
              <line x1="80" y1="80" x2="200" y2="240" stroke="#7c3aed" strokeWidth="1" opacity="0.2" />
              <line x1="80" y1="280" x2="200" y2="120" stroke="#7c3aed" strokeWidth="1" opacity="0.2" />
              <line x1="200" y1="120" x2="320" y2="80" stroke="#8b5cf6" strokeWidth="1.5" opacity="0.5" />
              <line x1="200" y1="120" x2="320" y2="180" stroke="#8b5cf6" strokeWidth="1.5" opacity="0.5" />
              <line x1="200" y1="120" x2="320" y2="280" stroke="#8b5cf6" strokeWidth="1" opacity="0.3" />
              <line x1="200" y1="240" x2="320" y2="80" stroke="#8b5cf6" strokeWidth="1" opacity="0.3" />
              <line x1="200" y1="240" x2="320" y2="180" stroke="#8b5cf6" strokeWidth="1.5" opacity="0.5" />
              <line x1="200" y1="240" x2="320" y2="280" stroke="#8b5cf6" strokeWidth="1.5" opacity="0.5" />
              <line x1="320" y1="80" x2="420" y2="180" stroke="#a78bfa" strokeWidth="1.5" opacity="0.5" />
              <line x1="320" y1="180" x2="420" y2="180" stroke="#a78bfa" strokeWidth="2" opacity="0.7" />
              <line x1="320" y1="280" x2="420" y2="180" stroke="#a78bfa" strokeWidth="1.5" opacity="0.5" />
              {/* Input nodes */}
              <circle cx="80" cy="80" r="22" fill="#4c1d95" stroke="#7c3aed" strokeWidth="2" />
              <circle cx="80" cy="180" r="22" fill="#4c1d95" stroke="#7c3aed" strokeWidth="2" />
              <circle cx="80" cy="280" r="22" fill="#4c1d95" stroke="#7c3aed" strokeWidth="2" />
              <text x="80" y="85" textAnchor="middle" fill="#c4b5fd" fontSize="9" fontFamily="monospace">data</text>
              <text x="80" y="185" textAnchor="middle" fill="#c4b5fd" fontSize="9" fontFamily="monospace">docs</text>
              <text x="80" y="285" textAnchor="middle" fill="#c4b5fd" fontSize="9" fontFamily="monospace">APIs</text>
              {/* Hidden layer nodes */}
              <circle cx="200" cy="120" r="26" fill="#5b21b6" stroke="#8b5cf6" strokeWidth="2.5" />
              <circle cx="200" cy="240" r="26" fill="#5b21b6" stroke="#8b5cf6" strokeWidth="2.5" />
              <text x="200" y="116" textAnchor="middle" fill="#ddd6fe" fontSize="8" fontFamily="monospace">embed</text>
              <text x="200" y="128" textAnchor="middle" fill="#ddd6fe" fontSize="8" fontFamily="monospace">&amp;index</text>
              <text x="200" y="236" textAnchor="middle" fill="#ddd6fe" fontSize="8" fontFamily="monospace">retrieve</text>
              <text x="200" y="248" textAnchor="middle" fill="#ddd6fe" fontSize="8" fontFamily="monospace">&amp;rank</text>
              {/* Output layer nodes */}
              <circle cx="320" cy="80" r="22" fill="#4c1d95" stroke="#7c3aed" strokeWidth="2" />
              <circle cx="320" cy="180" r="30" fill="#6d28d9" stroke="#a78bfa" strokeWidth="3" />
              <circle cx="320" cy="280" r="22" fill="#4c1d95" stroke="#7c3aed" strokeWidth="2" />
              <text x="320" y="76" textAnchor="middle" fill="#c4b5fd" fontSize="8" fontFamily="monospace">search</text>
              <text x="320" y="176" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold" fontFamily="monospace">LLM</text>
              <text x="320" y="188" textAnchor="middle" fill="#ddd6fe" fontSize="8" fontFamily="monospace">Claude</text>
              <text x="320" y="276" textAnchor="middle" fill="#c4b5fd" fontSize="8" fontFamily="monospace">filter</text>
              {/* Final output */}
              <rect x="382" y="148" width="76" height="64" rx="12" fill="#7c3aed" stroke="#a78bfa" strokeWidth="2" />
              <text x="420" y="170" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">Answer</text>
              <text x="420" y="184" textAnchor="middle" fill="#ddd6fe" fontSize="7">grounded in</text>
              <text x="420" y="196" textAnchor="middle" fill="#ddd6fe" fontSize="7">your data</text>
              {/* Pulse rings on LLM node */}
              <circle cx="320" cy="180" r="40" stroke="#a78bfa" strokeWidth="1" opacity="0.3" />
              <circle cx="320" cy="180" r="52" stroke="#a78bfa" strokeWidth="0.5" opacity="0.15" />
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
              <p className="text-sm font-bold uppercase tracking-widest text-violet-600">What We Build</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                AI Solutions We Deliver
              </h2>
              <p className="mt-3 text-base text-slate-500">
                Practical AI for real business operations — not experiments, not demos.
              </p>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {OFFERINGS.map((o) => (
                <div key={o.title} className="group rounded-2xl border border-slate-100 bg-slate-50 p-7 transition hover:border-violet-200 hover:bg-white hover:shadow-md">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-700 transition group-hover:bg-violet-700 group-hover:text-white">
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
        <section id="process" className="scroll-mt-20 bg-violet-950 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-bold uppercase tracking-widest text-violet-300">How It Works</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                From Problem to Production
              </h2>
              <p className="mt-3 text-base text-violet-300">
                A prototype in two weeks. Production-ready in eight.
              </p>
            </div>
            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {PROCESS.map((p) => (
                <div key={p.step} className="rounded-2xl border border-white/10 bg-white/5 p-7 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-4xl font-extrabold text-violet-700/50">{p.step}</span>
                    <span className="rounded-full bg-violet-900/60 px-3 py-1 text-xs font-semibold text-violet-300">{p.duration}</span>
                  </div>
                  <h3 className="mt-4 text-base font-bold text-white">{p.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-violet-100">{p.body}</p>
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
              <p className="text-sm font-bold uppercase tracking-widest text-violet-600">FAQ</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Common Questions</h2>
            </div>
            <div className="mt-10 space-y-4">
              {FAQ.map((item) => (
                <details key={item.q} className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm open:shadow-md">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-bold text-slate-900">
                    {item.q}
                    <svg className="h-5 w-5 flex-shrink-0 text-violet-600 transition group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
        <section className="bg-violet-700 py-16">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-3xl font-extrabold text-white">Ready to Put AI to Work?</h2>
            <p className="mt-3 text-base text-violet-200">Tell us what you want to automate — we&apos;ll tell you honestly if AI is the right tool and what it&apos;ll cost.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href="/#contact" className="inline-flex items-center rounded-full bg-white px-8 py-3.5 text-sm font-bold text-violet-700 shadow-lg transition hover:bg-violet-50">
                Get a Free Consultation →
              </Link>
              <Link href="/services/web-development" className="inline-flex items-center rounded-full border border-white/30 bg-white/10 px-8 py-3.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/20">
                Web Development →
              </Link>
            </div>
          </div>
        </section>

      </main>
      <ConveysFooter />
    </>
  );
}
