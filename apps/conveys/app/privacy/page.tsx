import type { JSX } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConveysFooter } from "@/components/conveys-footer";
import { ConveysHeader } from "@/components/conveys-header";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Conveys Information Technology collects, uses, and protects your personal data.",
  alternates: { canonical: "https://conveys.in/privacy" },
  openGraph: { url: "https://conveys.in/privacy" },
};

export default function PrivacyPage(): JSX.Element {
  return (
    <>
      <ConveysHeader />

      <section className="bg-gradient-to-b from-indigo-50/80 via-white to-white">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">Legal</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">Privacy Policy</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
              Effective: 1 August 2024
            </span>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              Conveys Information Technology
            </span>
          </div>
          <p className="mt-5 text-sm leading-relaxed text-slate-600">
            Conveys Information Technology is committed to safeguarding your privacy. This policy outlines how we collect, use, disclose, and protect your information when you use our services.
          </p>
        </div>
      </section>

      <main id="main-content" className="mx-auto max-w-3xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="space-y-4">

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">1</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Information We Collect</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">We gather the following types of information:</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  <li className="flex gap-2">
                    <span className="mt-0.5 flex-shrink-0 text-indigo-500">•</span>
                    <span><strong className="text-slate-800">Personal Data:</strong> Name, email address, phone number, company information, and any other information you provide directly.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 flex-shrink-0 text-indigo-500">•</span>
                    <span><strong className="text-slate-800">Automatically Collected:</strong> IP addresses, browser details, operating system data, and usage patterns.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 flex-shrink-0 text-indigo-500">•</span>
                    <span><strong className="text-slate-800">Third-Party Data:</strong> Information shared through WhatsApp per their privacy terms.</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">2</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">How We Use Your Information</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Data is used to operate and improve our services, communicate with users, distribute product updates, analyse usage patterns, and resolve technical concerns.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">3</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Legal Basis for Processing</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Processing relies on user consent, contract necessity, legal compliance, and legitimate business interests.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">4</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Data Sharing and Disclosure</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Personal data is shared only with your permission, through trusted service partners bound by confidentiality, for legal compliance, or to protect the rights and safety of our users.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">5</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Data Security</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  We implement industry-standard security measures to protect your data. Please note that no method of transmission over the internet or electronic storage is 100% secure.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">6</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Data Retention</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  We retain your data only for as long as necessary to fulfil the purposes for which it was collected, or as required by applicable law.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">7</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Your Rights</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Depending on your location, you may have the right to access, correct, delete, restrict, port, or object to the processing of your personal data. Contact us to exercise any of these rights.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-sm font-bold text-indigo-700">8</span>
              <div>
                <h2 className="text-base font-bold text-slate-900">Changes to This Policy</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  We may update this Privacy Policy from time to time. Changes are posted on this page and take effect immediately. Please review periodically.
                </p>
              </div>
            </div>
          </div>

        </div>

        <div className="mt-6 overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-700 p-6 text-white shadow-md">
          <h2 className="text-base font-bold">Contact Us</h2>
          <p className="mt-1 text-sm text-indigo-100">For privacy-related queries or to exercise your data rights, reach out to us.</p>
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
          <Link href="/terms" className="text-slate-500 hover:text-indigo-600">Terms of Service</Link>
          <Link href="/cancellation" className="text-slate-500 hover:text-indigo-600">Cancellation Policy</Link>
        </div>
      </main>

      <ConveysFooter />
    </>
  );
}
