import type { JSX } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ConveysFooter } from "@/components/conveys-footer";
import { ConveysHeader } from "@/components/conveys-header";

export const metadata: Metadata = {
  title: "Data Deletion Status",
  description: "Check the status of your Facebook data deletion request.",
  alternates: { canonical: "https://conveys.in/data-deletion-status" },
  openGraph: { url: "https://conveys.in/data-deletion-status" },
};

export default async function DataDeletionStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}): Promise<JSX.Element> {
  const { code } = await searchParams;

  return (
    <>
      <ConveysHeader />

      <section className="bg-gradient-to-b from-indigo-50/80 via-white to-white">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">Privacy</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">
            Data Deletion Status
          </h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
              Conveys Information Technology
            </span>
          </div>

          <div className="mt-10 space-y-6 text-slate-700">
            {code ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-6">
                <p className="text-base font-semibold text-green-800">
                  Your deletion request has been received.
                </p>
                <p className="mt-2 text-sm text-green-700">
                  Confirmation code:{" "}
                  <span className="font-mono font-medium">{code}</span>
                </p>
                <p className="mt-3 text-sm text-green-700">
                  All personal data associated with your account will be permanently
                  deleted within 30 days. You will not receive a separate confirmation
                  email once deletion is complete.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-base font-semibold text-slate-800">
                  No confirmation code provided.
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  If you submitted a data deletion request via Facebook, you should
                  have received a confirmation link containing a unique code. Please
                  use that link to check your deletion status.
                </p>
              </div>
            )}

            <div className="prose prose-slate max-w-none text-sm">
              <h2 className="text-lg font-bold text-slate-900">What data is deleted?</h2>
              <ul className="mt-2 list-disc pl-5 space-y-1">
                <li>Your Facebook user ID and associated login data</li>
                <li>Any profile information imported from Facebook</li>
                <li>Activity logs tied to your account</li>
              </ul>

              <h2 className="mt-6 text-lg font-bold text-slate-900">How to request deletion manually</h2>
              <p className="mt-2">
                You can also request deletion by emailing{" "}
                <a href="mailto:info@conveys.in" className="text-indigo-600 underline">
                  info@conveys.in
                </a>{" "}
                with the subject line <strong>Data Deletion Request</strong>. Include the
                email address associated with your account. We will process your request
                within 30 days.
              </p>
            </div>

            <p className="text-sm text-slate-500">
              For more information, see our{" "}
              <Link href="/privacy" className="text-indigo-600 underline hover:text-indigo-800">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <ConveysFooter />
    </>
  );
}
