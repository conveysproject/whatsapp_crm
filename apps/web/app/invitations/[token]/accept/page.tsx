"use client";

import { useState, useEffect, type FormEvent, type JSX } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface InvitationMeta {
  email: string;
  role: string;
}

export default function AcceptInvitationPage(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { isSignedIn, getToken, userId } = useAuth();

  const [meta, setMeta] = useState<InvitationMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
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
      const clerkToken = await getToken();
      const res = await fetch(`${API_URL}/v1/invitations/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${clerkToken ?? ""}` },
        body: JSON.stringify({ clerkUserId: userId, fullName }),
      });
      if (!res.ok) {
        const json = await res.json() as { error?: { message?: string } };
        setError(json.error?.message ?? "Failed to accept invitation.");
        return;
      }
      router.replace("/onboarding/checklist");
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
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, fullName, password }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { setError(json.error ?? "Failed to create account."); return; }
      // Success — redirect to sign-in so they can log in with their new credentials
      router.replace("/sign-in?invitation=accepted");
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
            placeholder="Full name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
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
          <Link href="/sign-in" className="text-green-600 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
