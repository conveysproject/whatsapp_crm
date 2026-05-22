"use client";

import Link from "next/link";
import Image from "next/image";
import type { JSX } from "react";
import { useState } from "react";
import { ServicesMegaMenu, ServicesMobileAccordion } from "@/components/services-mega-menu";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/#about", label: "About" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/blog", label: "Blog" },
  { href: "/#contact", label: "Contact" },
] as const;

export function ConveysHeader(): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 shadow-sm backdrop-blur-md">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-blue-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/conveys-logo.png" alt="Conveys Information Technology" width={160} height={48} className="h-10 w-auto object-contain" priority />
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex" aria-label="Primary">
          <Link href="/" className="transition hover:text-blue-700">Home</Link>
          <ServicesMegaMenu />
          {NAV_LINKS.slice(1).map((item) => (
            <Link key={item.href} href={item.href} className="transition hover:text-blue-700">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/#contact"
            className="hidden rounded-full bg-blue-700 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 sm:inline-flex"
          >
            Get a Quote
          </Link>
          <button
            type="button"
            aria-label="Toggle navigation"
            className="inline-flex rounded-md border border-slate-200 p-2 text-slate-700 md:hidden"
            aria-expanded={open}
            aria-controls="conveys-mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="sr-only">Menu</span>
            {open ? (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {open ? (
        <div id="conveys-mobile-nav" className="border-t border-slate-100 bg-white px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-1 text-sm font-medium text-slate-700" aria-label="Mobile">
            <Link href="/" onClick={() => setOpen(false)} className="rounded-md py-2 hover:text-blue-700">Home</Link>
            <ServicesMobileAccordion onClose={() => setOpen(false)} />
            {NAV_LINKS.slice(1).map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="rounded-md py-2 hover:text-blue-700">
                {item.label}
              </Link>
            ))}
            <Link
              href="/#contact"
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex justify-center rounded-full bg-blue-700 px-4 py-2 text-center font-semibold text-white"
            >
              Get a Quote
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
