import type { JSX } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConveysFooter } from "@/components/conveys-footer";
import { ConveysHeader } from "@/components/conveys-header";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms and conditions governing use of Conveys Information Technology services.",
  alternates: { canonical: "https://conveys.in/terms" },
  openGraph: { url: "https://conveys.in/terms" },
};

export default function TermsPage(): JSX.Element {
  return (
    <>
      <ConveysHeader />

      <section className="bg-gradient-to-b from-indigo-50/80 via-white to-white">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">Legal</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">Terms of Service</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
              Last Updated: 1 September 2024
            </span>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              Conveys Information Technology
            </span>
          </div>
          <p className="mt-5 text-sm leading-relaxed text-slate-600">
            Welcome to Conveys, operated by Conveys Information Technology. By accessing or using our platform, you agree to be bound by these Terms of Service. Please read them carefully before proceeding.
          </p>
        </div>
      </section>

      <main id="main-content" className="mx-auto max-w-3xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="space-y-4">

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">1</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Acceptance of Terms</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  You must be at least 18 years old with the legal capacity to enter into a binding agreement. By using Conveys on behalf of an organisation, you represent that you have authority to bind that entity to these terms.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">2</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Services Offered</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Conveys provides WhatsApp Business API services, including message automation, customer engagement tools, and analytics. We reserve the right to modify, suspend, or discontinue any aspect of our offerings at any time.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">3</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">User Responsibilities</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">You agree to:</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  <li className="flex gap-2">
                    <span className="mt-0.5 flex-shrink-0 text-indigo-500">•</span>
                    <span>Comply with all applicable laws and regulations.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 flex-shrink-0 text-indigo-500">•</span>
                    <span>Provide accurate and current registration information.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 flex-shrink-0 text-indigo-500">•</span>
                    <span>Refrain from spamming, phishing, or distributing malware through our platform.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">4</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Account Security</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  You are responsible for maintaining the confidentiality of your account credentials. Report any unauthorised access to us immediately at{" "}
                  <a href="mailto:info@conveys.in" className="font-medium text-indigo-600 hover:underline">info@conveys.in</a>.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">5</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Payment Terms</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  By submitting your payment details, you authorise Conveys Information Technology to charge the applicable fees for your selected plan. All fees are stated in Indian Rupees and are exclusive of applicable taxes.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">6</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Intellectual Property</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  All content, trademarks, and other intellectual property on the Conveys platform are owned by Conveys Information Technology or its licensors. You may not use, copy, or distribute them without prior written permission.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">7</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Limitation of Liability</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Services are provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind. Conveys Information Technology shall not be liable for any indirect, incidental, or consequential damages arising from your use of the platform.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">8</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Indemnification</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  You agree to defend, indemnify, and hold harmless Conveys Information Technology and its affiliates from any claims, damages, or expenses arising from your use of the platform or your violation of these terms.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">9</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Changes to Terms</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  We may update these Terms at any time. Changes take effect upon posting to this page. Continued use of the platform after changes constitutes your acceptance of the updated terms.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">10</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Governing Law</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  These Terms are governed by the laws of India. Any disputes shall be resolved in the courts of competent jurisdiction in Mumbai, Maharashtra.
                </p>
              </div>
            </div>
          </div>

        </div>

        <div className="mt-6 overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-700 p-6 text-white shadow-md">
          <h2 className="text-base font-bold">Questions?</h2>
          <p className="mt-1 text-sm text-indigo-100">Reach out to us for any queries regarding these Terms of Service.</p>
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
          <Link href="/cancellation" className="text-slate-500 hover:text-indigo-600">Cancellation Policy</Link>
        </div>
      </main>

      <ConveysFooter />
    </>
  );
}
