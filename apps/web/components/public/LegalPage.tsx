import type { JSX, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

export const LEGAL_LINKS: Array<{ href: string; label: string }> = [
  { href: "/terms", label: "Terms and Conditions" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refund-policy", label: "Refund Policy" },
  { href: "/cancellation-policy", label: "Cancellation Policy" },
  { href: "/contact", label: "Contact Us" },
];

interface Props {
  title: string;
  updated: string;
  children: ReactNode;
}

/** Shared frame for the public legal pages: readable column, link back home, and the full legal link list in the footer. */
export function LegalPage({ title, updated, children }: Props): JSX.Element {
  return (
    <div className="min-h-screen bg-white text-slate-800">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" aria-label="WBMSG home">
            <Image src="/wbmsg_logo.png" alt="WBMSG" width={200} height={56} style={{ height: "32px", width: "auto" }} />
          </Link>
          <Link href="/sign-in" className="text-sm font-medium text-green-700 hover:underline">Sign in</Link>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">Last updated: {updated}</p>
        <div className="mt-8 space-y-6 text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_a]:text-green-700 [&_a]:underline">
          {children}
        </div>
      </main>
      <footer className="border-t border-slate-200 bg-slate-50">
        <nav aria-label="Legal" className="mx-auto flex max-w-3xl flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm sm:px-6">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-slate-600 hover:text-slate-900 hover:underline">{l.label}</Link>
          ))}
        </nav>
        <p className="mx-auto max-w-3xl px-4 pb-6 text-xs text-slate-500 sm:px-6">
          WBMSG is operated by Conveys Information Technology. Contact: <a className="underline" href="mailto:info@conveys.in">info@conveys.in</a>
        </p>
      </footer>
    </div>
  );
}
