import Link from "next/link";
import type { JSX } from "react";
import type { Metadata } from "next";
import { ConveysFooter } from "@/components/conveys-footer";
import { ConveysHeader } from "@/components/conveys-header";

export const metadata: Metadata = {
  title: "Sitemap",
  description: "All pages on conveys.in.",
  alternates: { canonical: "https://conveys.in/sitemap" },
};

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/#about", label: "About" },
  { href: "/#contact", label: "Contact" },
  { href: "/services/web-development", label: "Web Development" },
  { href: "/services/mobile-app-development", label: "Mobile App Development" },
  { href: "/services/whatsapp-crm", label: "WhatsApp CRM" },
  { href: "/services/ai-solutions", label: "AI Solutions" },
  { href: "/blog", label: "Blog" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/cancellation", label: "Cancellation & Refund Policy" },
  { href: "/sitemap", label: "Sitemap" },
] as const;

export default function SitemapPage(): JSX.Element {
  return (
    <>
      <ConveysHeader />
      <main id="main-content" className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Sitemap</h1>
        <p className="mt-3 text-slate-600">Marketing pages for Conveys.</p>
        <ul className="mt-8 space-y-3 text-base font-medium text-indigo-600">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="hover:underline">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-10">
          <Link href="/" className="font-semibold text-indigo-600 hover:text-indigo-700">
            ← Back to home
          </Link>
        </p>
      </main>
      <ConveysFooter />
    </>
  );
}
