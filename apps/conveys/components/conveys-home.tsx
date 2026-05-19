"use client";

import { useState } from "react";
import type { ChangeEvent, FormEvent, JSX } from "react";
import Link from "next/link";

const STATS = [
  { value: "50+", label: "Projects Delivered" },
  { value: "100+", label: "Happy Clients" },
  { value: "5+", label: "Years of Experience" },
  { value: "4", label: "Core Services" },
] as const;

const SERVICES = [
  {
    href: "/services/web-development",
    label: "Web & App Development",
    description:
      "From idea to launch, we engineer fast, scalable websites and web applications tailored to your business goals. Responsive, SEO-ready, and built to convert.",
    bullets: [
      "Responsive, SEO-ready websites",
      "Custom web applications & portals",
      "E-commerce & booking platforms",
      "Performance-optimised & accessible",
    ],
    accent: "bg-blue-600",
    badge: "text-blue-700 bg-blue-100",
    visualBg: "from-blue-600 to-blue-800",
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    ),
    visual: (
      <div className="relative h-full min-h-[260px] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-blue-900 p-8">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "28px 28px" }} />
        <div className="relative space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 backdrop-blur-sm">
            <div className="h-3 w-3 rounded-full bg-red-400" />
            <div className="h-3 w-3 rounded-full bg-yellow-400" />
            <div className="h-3 w-3 rounded-full bg-green-400" />
            <div className="ml-2 flex-1 rounded bg-white/20 h-3" />
          </div>
          <div className="space-y-2 rounded-lg bg-white/10 p-4 backdrop-blur-sm">
            <div className="h-2 w-3/4 rounded bg-white/50" />
            <div className="h-2 w-1/2 rounded bg-white/30" />
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[1,2,3,4,5,6].map(i => <div key={i} className="h-12 rounded-lg bg-white/20" />)}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-8 flex-1 rounded-lg bg-white/20" />
            <div className="h-8 w-20 rounded-lg bg-blue-400/60" />
          </div>
        </div>
      </div>
    ),
  },
  {
    href: "/services/mobile-app-development",
    label: "Mobile App Development",
    description:
      "iOS and Android apps engineered for real-world performance. We own the full lifecycle — UX design, development, QA testing, and App Store submission.",
    bullets: [
      "Native iOS & Android apps",
      "Full UX design & prototyping",
      "QA testing & App Store submission",
      "Post-launch maintenance & updates",
    ],
    accent: "bg-indigo-600",
    badge: "text-indigo-700 bg-indigo-100",
    visualBg: "from-indigo-600 to-indigo-900",
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3" />
      </svg>
    ),
    visual: (
      <div className="relative h-full min-h-[260px] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-900 p-8 flex items-center justify-center">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "28px 28px" }} />
        <div className="relative mx-auto w-36">
          <div className="rounded-[2rem] border-4 border-white/30 bg-white/10 p-3 backdrop-blur-sm shadow-2xl">
            <div className="mb-2 mx-auto h-4 w-16 rounded-full bg-white/30" />
            <div className="space-y-2 rounded-2xl bg-white/10 p-3">
              <div className="h-2 w-3/4 rounded bg-white/50" />
              <div className="h-2 w-1/2 rounded bg-white/30" />
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {[1,2,3,4].map(i => <div key={i} className="h-10 rounded-xl bg-white/20" />)}
              </div>
              <div className="h-8 w-full rounded-xl bg-indigo-400/50 mt-2" />
            </div>
            <div className="mt-2 mx-auto h-3 w-10 rounded-full bg-white/30" />
          </div>
        </div>
      </div>
    ),
  },
  {
    href: "/services/whatsapp-crm",
    label: "WhatsApp CRM & Business API",
    description:
      "Turn WhatsApp into your most powerful sales channel. Automate conversations, run targeted campaigns, and manage your entire customer pipeline — all in one platform.",
    bullets: [
      "Automated conversation flows",
      "Targeted broadcast campaigns",
      "Full customer pipeline management",
      "Meta Business API integration",
    ],
    accent: "bg-emerald-600",
    badge: "text-emerald-700 bg-emerald-100",
    visualBg: "from-emerald-600 to-teal-800",
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    ),
    visual: (
      <div className="relative h-full min-h-[260px] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-900 p-8">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "28px 28px" }} />
        <div className="relative space-y-3 max-w-[220px] ml-auto">
          {[
            { msg: "Hi! I'm interested in your services.", self: false },
            { msg: "Great! Let me send you our portfolio.", self: true },
            { msg: "Automated: Here's our latest work 👇", self: true },
            { msg: "This looks amazing! Can we schedule a call?", self: false },
          ].map((b, i) => (
            <div key={i} className={`flex ${b.self ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-xs font-medium text-white shadow ${b.self ? "rounded-tr-sm bg-emerald-400/70" : "rounded-tl-sm bg-white/20 backdrop-blur-sm"}`}>
                {b.msg}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    href: "/services/ai-solutions",
    label: "AI Solutions",
    description:
      "Embed intelligent automation into your business. From AI-powered chatbots and document processing to custom LLM integrations — we build AI that works in the real world.",
    bullets: [
      "Custom AI chatbots & virtual assistants",
      "Document & data extraction pipelines",
      "LLM integrations (Claude, GPT, Gemini)",
      "AI-powered analytics & recommendations",
    ],
    accent: "bg-violet-600",
    badge: "text-violet-700 bg-violet-100",
    visualBg: "from-violet-600 to-purple-900",
    icon: (
      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423L16.5 15.75l.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
      </svg>
    ),
    visual: (
      <div className="relative h-full min-h-[260px] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 to-purple-900 p-8">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "28px 28px" }} />
        <div className="relative space-y-3">
          {/* AI prompt/response mockup */}
          <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-6 w-6 rounded-full bg-violet-400/60 flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-white" />
              </div>
              <div className="h-2 w-20 rounded bg-white/40" />
            </div>
            <div className="space-y-1.5">
              <div className="h-2 w-full rounded bg-white/30" />
              <div className="h-2 w-5/6 rounded bg-white/30" />
              <div className="h-2 w-4/6 rounded bg-white/30" />
            </div>
          </div>
          <div className="rounded-xl bg-violet-400/30 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-6 w-6 rounded-full bg-white/30 flex items-center justify-center">
                <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" /></svg>
              </div>
              <div className="h-2 w-16 rounded bg-white/40" />
            </div>
            <div className="space-y-1.5">
              <div className="h-2 w-full rounded bg-white/50" />
              <div className="h-2 w-3/4 rounded bg-white/50" />
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5">
            <div className="h-2 flex-1 rounded bg-white/20" />
            <div className="h-6 w-6 rounded-lg bg-violet-400/60" />
          </div>
        </div>
      </div>
    ),
  },
] as const;

const WHY_US = [
  { title: "Fast Delivery", body: "Ship in weeks, not months — with weekly progress updates so you're never in the dark." },
  { title: "Transparent Pricing", body: "Flat-rate quotes with no hidden costs or surprise invoices. What you see is what you pay." },
  { title: "In-House Team", body: "Designers, developers, and QA engineers all under one roof. No outsourcing, full accountability." },
  { title: "Long-Term Support", body: "We stay with you after launch — maintenance, updates, and improvements on demand." },
] as const;

const STEPS = [
  { num: "01", title: "Discover", body: "We learn your goals, users, and constraints before writing a single line of code." },
  { num: "02", title: "Design", body: "Wireframes and prototypes built around your brand and your customers' needs." },
  { num: "03", title: "Build", body: "Agile development with regular check-ins — you see real progress every week." },
  { num: "04", title: "Deliver", body: "Launch, handover, and ongoing support so your product keeps performing long-term." },
] as const;

const TESTIMONIALS = [
  {
    name: "Naman Gupta",
    quote: "Conveys built our internal tool from scratch. Clean code, on time, and they actually understood what we needed.",
  },
  {
    name: "Ramya Joshi",
    quote: "The WhatsApp automation they set up completely changed how we follow up with leads. Night and day difference.",
  },
  {
    name: "Mudit Thakkar",
    quote: "Professional team with real technical depth. They didn't just build what we asked — they improved on it.",
  },
  {
    name: "Reena Maheshwari",
    quote: "Great experience end to end. The website they designed for us gets genuine compliments from our customers.",
  },
] as const;

export function ConveysHome(): JSX.Element {
  const [form, setForm] = useState({ name: "", email: "", phone: "", service: "", message: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error ?? "Something went wrong, please try again.");
      } else {
        setStatus("success");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please check your connection and try again.");
    }
  }

  return (
    <main id="main-content">

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-slate-900">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full bg-blue-700/25 blur-3xl" />
          <div className="absolute -right-32 top-0 h-96 w-96 rounded-full bg-sky-500/15 blur-3xl" />
          <div className="absolute bottom-0 left-1/2 h-64 w-[40rem] -translate-x-1/2 rounded-full bg-blue-600/20 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 pb-28 pt-24 text-center sm:px-6 sm:pb-36 sm:pt-32 lg:px-8 lg:pt-40">
          <span className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-sky-400">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            Conveys Information Technology
          </span>
          <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            We Build Digital Products That Move{" "}
            <span className="bg-gradient-to-r from-sky-400 to-blue-400 bg-clip-text text-transparent">
              Businesses Forward
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
            From custom web apps to WhatsApp automation — we engineer technology that drives real growth for SMBs and enterprises across India.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <a
              href="#contact"
              className="inline-flex items-center justify-center rounded-full bg-white px-8 py-3.5 text-sm font-bold text-blue-700 shadow-lg transition hover:bg-blue-50"
            >
              Start a Project →
            </a>
            <a
              href="#services"
              className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-8 py-3.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/10"
            >
              See Our Services
            </a>
          </div>
        </div>

        {/* Stats floating over the section break */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent" aria-hidden="true" />
      </section>

      {/* ── Stats Bar ── */}
      <section className="relative z-10 -mt-8 bg-transparent" aria-label="Stats">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <dl className="grid grid-cols-2 divide-x divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-xl md:grid-cols-4 md:divide-y-0">
            {STATS.map((s) => (
              <div key={s.label} className="flex flex-col items-center px-8 py-6 text-center">
                <dt className="text-4xl font-extrabold text-blue-700">{s.value}</dt>
                <dd className="mt-1 text-sm font-medium text-slate-500">{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Services ── */}
      <section id="services" className="scroll-mt-20 bg-white py-24 sm:py-32">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-blue-600">What We Build</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              End-to-End Technology Solutions
            </h2>
            <p className="mt-3 text-base text-slate-500">
              Designed, built, and delivered in-house — no outsourcing, no surprises.
            </p>
          </div>

          <div className="mt-20 space-y-20">
            {SERVICES.map((service, i) => (
              <div
                key={service.label}
                className={`grid items-center gap-12 lg:grid-cols-2 ${i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""}`}
              >

                {/* Text side */}
                <div>
                  <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${service.badge}`}>
                    <span className="flex h-5 w-5 items-center justify-center">{service.icon}</span>
                    {service.label}
                  </span>
                  <h3 className="mt-4 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                    {service.label}
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-slate-500">{service.description}</p>
                  <ul className="mt-6 space-y-3">
                    {service.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-3 text-sm text-slate-700">
                        <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                        </svg>
                        {b}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={service.href}
                    className="mt-8 inline-flex items-center gap-2 rounded-full bg-slate-900 px-6 py-3 text-sm font-bold text-white transition hover:bg-blue-700"
                  >
                    Learn More
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </Link>
                </div>

                {/* Visual side */}
                <div className="h-full">{service.visual}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Conveys ── */}
      <section id="about" className="scroll-mt-20 bg-slate-50 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-blue-600">Why Conveys</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
                Why Businesses Choose Us
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-500">
                We&apos;re not just a vendor — we&apos;re your long-term technology partner. Every solution we build is designed around your business outcomes, not generic templates or cookie-cutter approaches.
              </p>
              <Link
                href="/#contact"
                className="mt-8 inline-flex rounded-full bg-blue-700 px-6 py-3 text-sm font-bold text-white shadow-md transition hover:bg-blue-800"
              >
                Work With Us →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {WHY_US.map((w) => (
                <div key={w.title} className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                  <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
                    <svg className="h-4 w-4 text-blue-700" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{w.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">{w.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Mid CTA Strip ── */}
      <section className="bg-blue-700 py-14" aria-label="Call to action">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-6 text-center sm:flex-row sm:text-left">
            <div>
              <h2 className="text-2xl font-extrabold text-white">Have a project in mind?</h2>
              <p className="mt-1 text-sm text-blue-200">Tell us about it — we respond within 24 hours.</p>
            </div>
            <a
              href="#contact"
              className="inline-flex flex-shrink-0 items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-bold text-blue-700 shadow-lg transition hover:bg-blue-50"
            >
              Book a Free Call
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* ── How We Work ── */}
      <section className="bg-slate-900 py-20 sm:py-24" aria-label="How We Work">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-sky-400">Our Process</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              How We Work
            </h2>
          </div>
          <div className="relative mt-14">
            {/* connector line */}
            <div className="absolute left-0 right-0 top-8 hidden h-px bg-white/10 lg:block" aria-hidden="true" />
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step) => (
                <div key={step.num} className="relative flex flex-col">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/5 text-xl font-extrabold text-blue-400 backdrop-blur-sm">
                    {step.num}
                  </div>
                  <h3 className="mt-5 text-base font-bold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-blue-600">Testimonials</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              What Our Clients Say
            </h2>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {TESTIMONIALS.map((t) => (
              <figure key={t.name} className="relative flex flex-col rounded-2xl border border-slate-100 bg-slate-50 p-6 shadow-sm">
                <span className="absolute -top-3 left-6 text-6xl font-extrabold leading-none text-blue-100 select-none" aria-hidden="true">&ldquo;</span>
                <blockquote className="relative z-10 mt-4 flex-1 text-sm leading-relaxed text-slate-600">
                  {t.quote}
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-700 text-xs font-bold text-white">
                    {t.name[0]}
                  </div>
                  <p className="text-sm font-bold text-slate-900">{t.name}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── Contact ── */}
      <section id="contact" className="scroll-mt-20 bg-gradient-to-br from-blue-800 via-blue-700 to-sky-600 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-start gap-12 lg:grid-cols-2">
            <div className="text-white">
              <p className="text-sm font-bold uppercase tracking-widest text-blue-200">Get In Touch</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
                Ready to Build Something Great?
              </h2>
              <p className="mt-4 text-base leading-relaxed text-blue-100">
                Tell us about your project and we&apos;ll get back to you within 24 hours.
              </p>
              <div className="mt-8 space-y-4 rounded-2xl bg-white/10 p-6 text-sm backdrop-blur-sm">
                <div>
                  <p className="font-bold text-white">Conveys Information Technology</p>
                  <p className="mt-1 text-blue-100">
                    SwaminarayanCity, Dombivli West
                    <br />
                    Mumbai, Maharashtra 421202
                  </p>
                </div>
                <a href="mailto:info@conveys.in" className="block text-blue-100 hover:text-white">
                  info@conveys.in
                </a>
                <a href="tel:+919907072035" className="block font-bold text-white hover:text-blue-200">
                  +91 99070 72035
                </a>
              </div>
            </div>

            <form
              className="rounded-2xl bg-white p-8 shadow-xl"
              onSubmit={handleSubmit}
            >
              <h3 className="text-lg font-bold text-slate-900">Send a Message</h3>

              {status === "success" ? (
                <div className="mt-6 flex flex-col items-center py-8 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                    <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h4 className="mt-4 text-lg font-bold text-slate-900">Message sent!</h4>
                  <p className="mt-2 text-sm text-slate-500">We&apos;ll reply within 24 hours. Talk soon!</p>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="cf-name" className="sr-only">Name</label>
                    <input
                      id="cf-name"
                      name="name"
                      required
                      placeholder="Your name"
                      value={form.name}
                      onChange={handleChange}
                      disabled={status === "loading"}
                      className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                  <div>
                    <label htmlFor="cf-email" className="sr-only">Email</label>
                    <input
                      id="cf-email"
                      name="email"
                      type="email"
                      required
                      placeholder="Email address"
                      value={form.email}
                      onChange={handleChange}
                      disabled={status === "loading"}
                      className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                  <div>
                    <label htmlFor="cf-phone" className="sr-only">Phone</label>
                    <input
                      id="cf-phone"
                      name="phone"
                      type="tel"
                      placeholder="Phone number (optional)"
                      value={form.phone}
                      onChange={handleChange}
                      disabled={status === "loading"}
                      className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                  <div>
                    <label htmlFor="cf-service" className="sr-only">Service interested in</label>
                    <select
                      id="cf-service"
                      name="service"
                      required
                      value={form.service}
                      onChange={handleChange}
                      disabled={status === "loading"}
                      className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      <option value="" disabled>Service interested in…</option>
                      <option>Web &amp; App Development</option>
                      <option>Mobile App Development</option>
                      <option>WhatsApp CRM &amp; Business API</option>
                      <option>AI Solutions</option>
                      <option>Other / General Enquiry</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="cf-msg" className="sr-only">Message</label>
                    <textarea
                      id="cf-msg"
                      name="message"
                      rows={4}
                      required
                      placeholder="Tell us about your project…"
                      value={form.message}
                      onChange={handleChange}
                      disabled={status === "loading"}
                      className="w-full resize-none rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                  {status === "error" && (
                    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {errorMsg}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="w-full rounded-lg bg-blue-700 py-3.5 text-sm font-bold text-white shadow transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {status === "loading" ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Sending…
                      </span>
                    ) : "Send Message"}
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      </section>

    </main>
  );
}
