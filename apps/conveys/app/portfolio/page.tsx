import type { JSX } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConveysHeader } from "@/components/conveys-header";
import { ConveysFooter } from "@/components/conveys-footer";

export const metadata: Metadata = {
  title: "Portfolio — Web & App Projects",
  description:
    "See what we've built for Indian businesses — stock market training platforms, WhatsApp CRM systems, and more. Custom web development by Conveys IT, Mumbai.",
  alternates: { canonical: "https://conveys.in/portfolio" },
  openGraph: { url: "https://conveys.in/portfolio" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Conveys IT Portfolio",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      item: {
        "@type": "CreativeWork",
        name: "MyFinWork",
        description:
          "Stock market training platform with course discovery, expert profiles, and lead generation — serving 1,250+ enrolled students across India.",
        url: "https://myfinwork.com",
        creator: { "@id": "https://conveys.in/#organization" },
      },
    },
  ],
};

const PROJECTS = [
  {
    name: "MyFinWork",
    category: "Web Development",
    description:
      "Stock market training platform with course discovery, expert profiles, and lead generation — serving 1,250+ enrolled students across India.",
    url: "https://myfinwork.com",
    image: "/portfolio/MyFinWork.png",
    tags: ["WordPress", "GoDaddy Hosting", "MySQL", "SMTP", "DNS"],
  },
] as const;

export default function PortfolioPage(): JSX.Element {
  return (
    <>
      <style>{`
        @keyframes portfolioScroll {
          from { transform: translateY(0); }
          to   { transform: translateY(calc(-100% + 380px)); }
        }
      `}</style>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ConveysHeader />

      <main id="main-content">
        {/* Hero */}
        <section className="bg-slate-900 py-20 sm:py-28">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-indigo-400">Our Work</p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Projects we&apos;ve built for Indian businesses
            </h1>
            <p className="mt-5 mx-auto max-w-2xl text-lg leading-relaxed text-slate-300">
              From stock market training platforms to WhatsApp CRM systems — here&apos;s what we&apos;ve shipped.
            </p>

            {/* MacBook mockup */}
            <div className="mt-16 mx-auto w-full max-w-2xl select-none">
              {/* Lid */}
              <div className="relative rounded-t-[16px] bg-[#2a2a2a] px-4 pb-4 pt-7 shadow-[0_40px_100px_rgba(0,0,0,0.7)] ring-1 ring-white/5">
                {/* Camera dot */}
                <div className="absolute top-[10px] left-1/2 h-[6px] w-[6px] -translate-x-1/2 rounded-full bg-[#111] ring-1 ring-black/60" />
                {/* Screen — overflow-hidden clips the scrolling image */}
                <div className="overflow-hidden rounded-[6px] bg-black" style={{ height: "380px" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/portfolio/MyFinWork.png"
                    alt="MyFinWork — stock market training platform built by Conveys IT"
                    className="w-full block"
                    style={{ animation: "portfolioScroll 22s ease-in-out infinite alternate" }}
                  />
                </div>
              </div>
              {/* Hinge strip */}
              <div className="h-[8px] bg-gradient-to-b from-[#555] to-[#3a3a3a]" />
              {/* Base */}
              <div className="h-[18px] rounded-b-[10px] bg-gradient-to-b from-[#d0d0d0] to-[#b8b8b8] shadow-lg" />
              {/* Taper foot */}
              <div className="mx-auto h-[4px] w-[88%] rounded-b-[6px] bg-[#a8a8a8]" />
            </div>
          </div>
        </section>

        {/* Project cards */}
        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">All projects</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {PROJECTS.map((project) => (
                <div
                  key={project.name}
                  className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md"
                >
                  <span className="inline-block self-start rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-indigo-600">
                    {project.category}
                  </span>
                  <h3 className="mt-4 text-xl font-bold text-slate-900">{project.name}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">
                    {project.description}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {project.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <Link
                    href={project.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    View site →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-indigo-600 py-16">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-2xl font-extrabold text-white">Ready to be on this list?</h2>
            <p className="mt-3 text-indigo-100">Let&apos;s build something great together.</p>
            <Link
              href="/#contact"
              className="mt-6 inline-flex items-center rounded-full bg-white px-7 py-3 text-sm font-bold text-indigo-600 shadow-sm transition hover:bg-indigo-50"
            >
              Get in touch →
            </Link>
          </div>
        </section>
      </main>

      <ConveysFooter />
    </>
  );
}
