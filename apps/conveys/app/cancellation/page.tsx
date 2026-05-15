import type { JSX } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConveysFooter } from "@/components/conveys-footer";
import { ConveysHeader } from "@/components/conveys-header";

export const metadata: Metadata = {
  title: "Cancellation & Refund Policy",
  description: "Understand Conveys Information Technology's cancellation and refund policy before subscribing.",
  alternates: { canonical: "https://conveys.in/cancellation" },
  openGraph: { url: "https://conveys.in/cancellation" },
};

export default function CancellationPage(): JSX.Element {
  return (
    <>
      <ConveysHeader />

      <section className="bg-gradient-to-b from-indigo-50/80 via-white to-white">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">Legal</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">Cancellation &amp; Refund Policy</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
              Conveys Information Technology
            </span>
          </div>
          <p className="mt-5 text-sm leading-relaxed text-slate-600">
            Please read this policy carefully before subscribing. By purchasing a plan, you acknowledge and agree to the terms outlined below.
          </p>
        </div>
      </section>

      <main id="main-content" className="mx-auto max-w-3xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="space-y-4">

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">1</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Cancellation Policy</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  You may cancel your Conveys subscription at any time. Upon cancellation, your access to the platform continues until the end of the current billing period. After that date, your account will be deactivated and access will cease.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-orange-100 bg-orange-50/60 p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-orange-100 text-sm font-bold text-orange-700">2</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Refund Policy</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  All subscriptions require upfront payment. Conveys Information Technology maintains a <strong className="text-slate-800">strict no-refund policy</strong>. No refunds or credits will be issued for:
                </p>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  <li className="flex gap-2">
                    <span className="mt-0.5 flex-shrink-0 text-orange-500">•</span>
                    <span>Mid-cycle cancellations or unused portions of any billing period.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 flex-shrink-0 text-orange-500">•</span>
                    <span>Partial use of services regardless of how much of the plan was utilised.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 flex-shrink-0 text-orange-500">•</span>
                    <span>Change of mind or accidental purchases.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">3</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Meta / WhatsApp-Related Issues</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Conveys provides access to WhatsApp Business API through Meta&apos;s Cloud API infrastructure. We have no control over Meta&apos;s operational decisions, policies, or service interruptions. The following do not entitle you to a refund:
                </p>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  <li className="flex gap-2">
                    <span className="mt-0.5 flex-shrink-0 text-indigo-500">•</span>
                    <span>Account bans or number restrictions imposed by Meta or WhatsApp.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 flex-shrink-0 text-indigo-500">•</span>
                    <span>Platform outages or policy changes originating from Meta&apos;s systems.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">4</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Customer-Related Issues</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Service interruptions caused by the following customer-side factors are not eligible for refunds or liability claims:
                </p>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  <li className="flex gap-2">
                    <span className="mt-0.5 flex-shrink-0 text-indigo-500">•</span>
                    <span>User error or misconfiguration.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 flex-shrink-0 text-indigo-500">•</span>
                    <span>Violations of WhatsApp Business or Conveys platform policies.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 flex-shrink-0 text-indigo-500">•</span>
                    <span>Non-payment of messaging charges or third-party fees.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-200 text-sm font-bold text-slate-700">5</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Consent</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  By subscribing to any Conveys plan, you confirm that you have read, understood, and agreed to this no-refund policy in its entirety, including all scenarios outlined above.
                </p>
              </div>
            </div>
          </div>

        </div>

        <div className="mt-6 overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-700 p-6 text-white shadow-md">
          <h2 className="text-base font-bold">Have a Question?</h2>
          <p className="mt-1 text-sm text-indigo-100">If you have any concerns about this policy, contact us before subscribing.</p>
          <div className="mt-4 space-y-1 text-sm text-indigo-100">
            <p className="font-semibold text-white">Conveys Information Technology</p>
            <p>SwaminarayanCity, Dombivli West, Mumbai 421202</p>
            <p>
              <a href="mailto:info@conveys.in" className="underline hover:text-white">info@conveys.in</a>
            </p>
            <p>
              <a href="tel:+919907072035" className="underline hover:text-white">+91 99070 72035</a>
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-4 text-sm font-semibold">
          <Link href="/" className="text-indigo-600 hover:text-indigo-700">← Back to home</Link>
          <Link href="/privacy" className="text-slate-500 hover:text-indigo-600">Privacy Policy</Link>
          <Link href="/terms" className="text-slate-500 hover:text-indigo-600">Terms of Service</Link>
        </div>
      </main>

      <ConveysFooter />
    </>
  );
}
