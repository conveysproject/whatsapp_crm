"use client";

import { useState, useEffect, type FormEvent, type JSX } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useSignUp } from "@clerk/nextjs/legacy";
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
  const { signUp, isLoaded } = useSignUp();

  const [meta, setMeta] = useState<InvitationMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch invitation details so we can pre-fill and lock the email
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/v1/invitations/${token}`);
        if (!res.ok) {
          setMetaError("This invitation link is invalid or has expired.");
          return;
        }
        const json = await res.json() as { data: InvitationMeta };
        setMeta(json.data);
      } catch {
        setMetaError("Could not load invitation details.");
      }
    })();
  }, [token]);

  async function acceptWithCurrentUser() {
    setLoading(true);
    setError(null);
    try {
      const clerkToken = await getToken();
      const res = await fetch(`${API_URL}/v1/invitations/${token}/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${clerkToken ?? ""}`,
        },
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

  async function handleSignUpAndAccept(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded || !signUp || !meta) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signUp.create({
        emailAddress: meta.email,
        password,
        firstName: fullName.split(" ")[0],
        lastName: fullName.split(" ").slice(1).join(" "),
      });
      const clerkUserId = result.createdUserId;
      if (!clerkUserId) { setError("Sign-up failed. Please try again."); return; }

      const res = await fetch(`${API_URL}/v1/invitations/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clerkUserId, fullName }),
      });
      if (!res.ok) {
        const json = await res.json() as { error?: { message?: string } };
        setError(json.error?.message ?? "Failed to accept invitation.");
        return;
      }
      router.replace("/sign-in");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-up failed.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // Invalid / expired invitation
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

  // Already signed in — just accept
  if (isSignedIn) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-gray-200 shadow p-8 w-full max-w-md space-y-4">
          <h1 className="text-xl font-semibold text-gray-900">Accept Invitation</h1>
          <p className="text-sm text-gray-500">
            You&apos;re signed in. Click below to join the organization.
          </p>
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

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl border border-gray-200 shadow p-8 w-full max-w-md space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">You&apos;ve been invited</h1>
        <p className="text-sm text-gray-500">Create an account to join your team on WBMSG.</p>

        <form onSubmit={(e) => { void handleSignUpAndAccept(e); }} className="space-y-3">
          <input
            type="text"
            placeholder="Full name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {/* Email is pre-filled from the invitation and locked — user cannot change it */}
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
            placeholder="Password"
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
