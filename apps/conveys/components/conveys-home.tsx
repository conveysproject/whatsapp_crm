"use client";

import Link from "next/link";
import type { JSX } from "react";

const STATS = [
  { value: "50+", label: "Projects Delivered" },
  { value: "100+", label: "Happy Clients" },
  { value: "5+", label: "Years of Experience" },
  { value: "3", label: "Core Services" },
] as const;

const SERVICES: Array<{ title: string; description: string; icon: JSX.Element }> = [
  {
    title: "Web & App Development",
    description:
      "From idea to launch, we engineer fast, scalable websites and web applications tailored to your business goals. Responsive, SEO-ready, and built to convert.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    ),
  },
  {
    title: "Mobile App Development",
    description:
      "iOS and Android apps engineered for real-world performance. We own the full lifecycle — UX design, development, QA testing, and App Store submission.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3" />
      </svg>
    ),
  },
  {
    title: "WhatsApp CRM & Business API",
    description:
      "Turn WhatsApp into your most powerful sales channel. Automate conversations, run targeted campaigns, and manage your entire customer pipeline — all in one platform.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    ),
  },
];

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
  return (
    <main id="main-content">

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-slate-900">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full bg-blue-700/25 blur-3xl" />
          <div className="absolute -right-32 top-0 h-96 w-96 rounded-full bg-sky-500/15 blur-3xl" />
          <div className="absolute bottom-0 left-1/2 h-64 w-[40rem] -translate-x-1/2 rounded-full bg-blue-600/20 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 py-24 text-center sm:px-6 sm:py-32 lg:px-8 lg:py-40">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-sky-400">
            Conveys Information Technology
          </p>
          <h1 className="mx-auto mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
            We Build Digital Products That Move Businesses Forward
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
            From custom web apps to WhatsApp automation — we engineer technology that drives real growth for SMBs and enterprises across India.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <a
              href="#contact"
              className="inline-flex items-center justify-center rounded-full bg-white px-7 py-3.5 text-sm font-bold text-blue-700 shadow-lg transition hover:bg-blue-50"
            >
              Start a Project
            </a>
            <a
              href="#services"
              className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/10"
            >
              See Our Services
            </a>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent" aria-hidden="true" />
      </section>

      {/* ── Stats Bar ── */}
      <section className="bg-white py-16" aria-label="Stats">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <dl className="grid grid-cols-2 gap-10 md:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <dt className="text-4xl font-extrabold text-blue-700">{s.value}</dt>
                <dd className="mt-1 text-sm font-medium text-slate-500">{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Services ── */}
      <section id="services" className="scroll-mt-20 bg-slate-50 py-20 sm:py-24">
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
          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            {SERVICES.map((s) => (
              <div
                key={s.title}
                className="group rounded-2xl border border-transparent bg-white p-8 shadow-sm ring-1 ring-slate-100 transition hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700 transition group-hover:bg-blue-700 group-hover:text-white">
                  {s.icon}
                </div>
                <h3 className="mt-5 text-lg font-bold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why Conveys ── */}
      <section id="about" className="scroll-mt-20 bg-white py-20 sm:py-24">
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
                Work With Us
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {WHY_US.map((w) => (
                <div key={w.title} className="rounded-2xl border border-slate-100 bg-slate-50 p-6 shadow-sm">
                  <div className="mb-3 h-1.5 w-8 rounded-full bg-blue-600" aria-hidden="true" />
                  <h3 className="text-sm font-bold text-slate-900">{w.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{w.body}</p>
                </div>
              ))}
            </div>
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
          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.num} className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                <p className="text-5xl font-extrabold text-blue-700/40">{step.num}</p>
                <h3 className="mt-3 text-base font-bold text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section className="bg-slate-50 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-blue-600">Testimonials</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              What Our Clients Say
            </h2>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {TESTIMONIALS.map((t) => (
              <figure key={t.name} className="flex flex-col rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-700 text-sm font-bold text-white">
                  {t.name[0]}
                </div>
                <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-slate-600">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <figcaption className="mt-4 border-t border-slate-100 pt-4">
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
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <h3 className="text-lg font-bold text-slate-900">Send a Message</h3>
              <div className="mt-5 space-y-4">
                <div>
                  <label htmlFor="cf-name" className="sr-only">Name</label>
                  <input
                    id="cf-name"
                    name="name"
                    required
                    placeholder="Your name"
                    className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
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
                    className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label htmlFor="cf-phone" className="sr-only">Phone</label>
                  <input
                    id="cf-phone"
                    name="phone"
                    type="tel"
                    placeholder="Phone number (optional)"
                    className="w-full rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label htmlFor="cf-msg" className="sr-only">Message</label>
                  <textarea
                    id="cf-msg"
                    name="message"
                    rows={4}
                    required
                    placeholder="Tell us about your project…"
                    className="w-full resize-none rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-blue-700 py-3.5 text-sm font-bold text-white shadow transition hover:bg-blue-800"
                >
                  Send Message
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

    </main>
  );
}
