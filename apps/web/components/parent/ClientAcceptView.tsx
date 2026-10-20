"use client";

import { useState, type FormEvent, type JSX } from "react";
import Link from "next/link";
import { FULL_READ_ACCESS_SENTENCE, type AcceptForm, type ClientInvitationMeta } from "@/lib/parent-orgs";

const input = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

/** Presentational accept screen: the page owns auth state and the request. */
export function ClientAcceptView({
  meta, signedIn, busy, error, redirectPath, onSubmit,
}: {
  meta: ClientInvitationMeta;
  signedIn: boolean;
  busy: boolean;
  error: string | null;
  redirectPath: string;
  onSubmit: (form: AcceptForm) => void;
}): JSX.Element {
  const [fullName, setFullName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const next = encodeURIComponent(redirectPath);

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ fullName, organizationName, mobileNumber });
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow p-8 w-full max-w-md space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">{meta.parentName} invited you to WBMSG</h1>
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{FULL_READ_ACCESS_SENTENCE}</p>
        {signedIn ? (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-sm text-gray-500">Invited as <span className="font-medium text-gray-700">{meta.email}</span></p>
            <input type="text" required placeholder="Your full name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={input} />
            <input type="text" required placeholder="Organization name" autoComplete="organization" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} className={input} />
            <input type="tel" placeholder="Mobile number (optional)" autoComplete="tel" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} className={input} />
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={busy || !fullName.trim() || !organizationName.trim()} className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {busy ? "Creating account..." : "Accept and create account"}
            </button>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Sign in or create an account with <span className="font-medium">{meta.email}</span> to accept this invitation.
            </p>
            <Link href={`/sign-in?redirect_url=${next}`} className="block w-full rounded-lg bg-green-600 py-2.5 text-center text-sm font-medium text-white hover:bg-green-700">
              Sign in
            </Link>
            <Link href={`/sign-up?redirect_url=${next}`} className="block w-full rounded-lg border border-gray-200 py-2.5 text-center text-sm font-medium text-gray-700 hover:bg-gray-50">
              Create an account
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export function ClientAcceptMessage({ message }: { message: string }): JSX.Element {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow p-8 w-full max-w-md text-center space-y-3">
        <p className="text-sm text-gray-700">{message}</p>
        <Link href="/sign-in" className="text-sm text-green-600 hover:underline">Go to sign in</Link>
      </div>
    </div>
  );
}
