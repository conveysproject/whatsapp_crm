"use client";

import { useState, useEffect, type FormEvent, type JSX } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth/client";
import Link from "next/link";
import { invitationNextStep, signedInAcceptStep } from "@/lib/auth/invitation";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface InvitationMeta {
  email: string;
  role: string;
}

export default function AcceptInvitationPage(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  const { isSignedIn, getToken } = useAuth();

  const [meta, setMeta] = useState<InvitationMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [accountExists, setAccountExists] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/v1/invitations/${token}`);
        if (!res.ok) { setMetaError("This invitation link is invalid or has expired."); return; }
        const json = await res.json() as { data: InvitationMeta };
        setMeta(json.data);
      } catch {
        setMetaError("Could not load invitation details.");
      }
    })();
  }, [token]);

  // ── Already signed in ────────────────────────────────────────────────────
  async function acceptWithCurrentUser() {
    setLoading(true);
    setError(null);
    try {
      const accessToken = await getToken();
      const res = await fetch(`${API_URL}/v1/invitations/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken ?? ""}` },
        body: JSON.stringify({ fullName }),
      });
      const step = signedInAcceptStep(res.status, await res.json().catch(() => null));
      if (step.kind === "error") { setError(step.message); return; }
      window.location.assign("/checklist");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── New user sign-up (server-side, no OTP) ───────────────────────────────
  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    if (!meta) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/invitations/accept/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), password }),
      });
      const step = invitationNextStep(res.status, await res.json().catch(() => null));
      if (step.kind === "account_exists") { setAccountExists(true); return; }
      if (step.kind === "error") { setError(step.message); return; }
      window.location.assign("/checklist");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (metaError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-gray-200 shadow p-8 w-full max-w-md text-center space-y-3">
          <p className="text-sm text-red-600 font-medium">{metaError}</p>
          <Link href="/sign-in" className="text-sm text-green-600 hover:underline">Go to sign in</Link>
        </div>
      </div>
    );
  }

  // ── Already signed in ────────────────────────────────────────────────────
  if (isSignedIn) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-gray-200 shadow p-8 w-full max-w-md space-y-4">
          <h1 className="text-xl font-semibold text-gray-900">Accept Invitation</h1>
          <p className="text-sm text-gray-500">You&apos;re already signed in. Click below to join the organization.</p>
          {meta && (
            <p className="text-sm text-gray-700">
              Invited as <span className="font-medium">{meta.email}</span> · <span className="capitalize">{meta.role}</span>
            </p>
          )}
          <input
            type="text"
            placeholder="Your full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={() => { void acceptWithCurrentUser(); }}
            disabled={loading || !fullName}
            className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? "Joining…" : "Join Organization"}
          </button>
        </div>
      </div>
    );
  }

  // ── Sign-up form ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl border border-gray-200 shadow p-8 w-full max-w-md space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">You&apos;ve been invited</h1>
        <p className="text-sm text-gray-500">Create your account to join your team on WBMSG.</p>

        <form onSubmit={(e) => { void handleSignUp(e); }} className="space-y-3">
          <input
            type="text"
            placeholder="First name"
            required
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <input
            type="text"
            placeholder="Last name"
            required
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <input
            type="email"
            value={meta?.email ?? ""}
            readOnly
            disabled={!meta}
            placeholder={meta ? undefined : "Loading…"}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
          />
          <input
            type="password"
            placeholder="Password (min 8 characters)"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {accountExists && (
            <p className="text-sm text-gray-700">
              You already have an account.{" "}
              <Link
                href={`/sign-in?redirect_url=${encodeURIComponent(`/invitations/${token}/accept`)}`}
                className="text-green-600 hover:underline"
              >
                Sign in to accept this invitation.
              </Link>
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !meta}
            className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? "Creating account…" : "Create Account & Join"}
          </button>
        </form>

        <p className="text-xs text-center text-gray-400">
          Already have an account?{" "}
          <Link
            href={`/sign-in?redirect_url=${encodeURIComponent(`/invitations/${token}/accept`)}`}
            className="text-green-600 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
