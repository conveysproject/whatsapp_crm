"use client";

import { useState, type FormEvent, type JSX } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useBrand } from "@/hooks/useBrand";
import {
  FULL_READ_ACCESS_SENTENCE,
  type AcceptForm, type AcceptViewMode, type ClientInvitationMeta, type NewAccountForm,
} from "@/lib/parent-orgs";

const input = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";
const button = "w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50";
// A brand uses its own color scale; the default brand keeps the green classes (identical markup).
const brandButton = "w-full bg-brand-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-brand-700 disabled:opacity-50";

/**
 * Presentational accept screen: the page owns auth state and the requests.
 * - signedIn: the signed-in person (an account without a workspace) names the new organization.
 * - newAccount: a brand-new person sets a password here; the account, organization and link are created together.
 * - signIn: an account already exists for the invited email, so the person signs in first and comes back.
 */
export function ClientAcceptView({
  meta, mode, busy, error, redirectPath, onSubmit, onCreateAccount,
}: {
  meta: ClientInvitationMeta;
  mode: AcceptViewMode;
  busy: boolean;
  error: string | null;
  redirectPath: string;
  onSubmit: (form: AcceptForm) => void;
  onCreateAccount: (form: NewAccountForm) => void;
}): JSX.Element {
  const [fullName, setFullName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const next = encodeURIComponent(redirectPath);
  const brand = useBrand();
  const btn = brand.isDefault ? button : brandButton;
  const link = brand.isDefault ? "text-green-600 hover:underline" : "text-brand-600 hover:underline";
  const signInLinkClass = `block w-full rounded-lg ${brand.isDefault ? "bg-green-600 hover:bg-green-700" : "bg-brand-600 hover:bg-brand-700"} py-2.5 text-center text-sm font-medium text-white`;

  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ fullName, organizationName, mobileNumber });
  }
  function submitNew(e: FormEvent) {
    e.preventDefault();
    onCreateAccount({ firstName, lastName, password, organizationName, mobileNumber });
  }

  const orgAndMobile = (
    <>
      <input type="text" required placeholder="Organization name" autoComplete="organization" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} className={input} />
      <input type="tel" placeholder="Mobile number (optional)" autoComplete="tel" maxLength={30} value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} className={input} />
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow p-8 w-full max-w-md space-y-4">
        {!brand.isDefault && (
          <div className="flex justify-center">
            <BrandLogo height={40} />
          </div>
        )}
        <h1 className="text-xl font-semibold text-gray-900">{`${meta.parentName} invited you to ${brand.name}`}</h1>
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{FULL_READ_ACCESS_SENTENCE}</p>
        {mode === "signedIn" && (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-sm text-gray-500">Invited as <span className="font-medium text-gray-700">{meta.email}</span></p>
            <input type="text" required placeholder="Your full name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={input} />
            {orgAndMobile}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={busy || !fullName.trim() || !organizationName.trim()} className={btn}>
              {busy ? "Creating account..." : "Accept and create account"}
            </button>
          </form>
        )}
        {mode === "newAccount" && (
          <form onSubmit={submitNew} className="space-y-3">
            <p className="text-sm text-gray-500">Create your account to accept this invitation.</p>
            <input type="text" required placeholder="First name" autoComplete="given-name" maxLength={100} value={firstName} onChange={(e) => setFirstName(e.target.value)} className={input} />
            <input type="text" required placeholder="Last name" autoComplete="family-name" maxLength={100} value={lastName} onChange={(e) => setLastName(e.target.value)} className={input} />
            <input type="email" value={meta.email} readOnly className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed" />
            <input type="password" required placeholder="Password (min 8 characters)" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
            {orgAndMobile}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={busy || !firstName.trim() || !lastName.trim() || !password || !organizationName.trim()} className={btn}>
              {busy ? "Creating account..." : "Accept and create account"}
            </button>
            <p className="text-xs text-center text-gray-400">
              Already have an account?{" "}
              <Link href={`/sign-in?redirect_url=${next}`} className={link}>Sign in</Link>
            </p>
          </form>
        )}
        {mode === "signIn" && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              You already have an account with <span className="font-medium">{meta.email}</span>. Sign in to accept this invitation.
            </p>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <Link href={`/sign-in?redirect_url=${next}`} className={signInLinkClass}>
              Sign in
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
