"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import type { FormEvent, JSX } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/client";
import { authProvider } from "@/lib/auth/config";
import { clientLabel, deviceTitle, passwordMode, relativeTime, type DeviceSession } from "@/lib/security-settings";
import { useAuthMethods } from "@/components/auth/SocialButtons";
import { ConnectedAccountsSection, WhatsAppNumberSection, type SignInMethodsInfo } from "@/components/settings/SecuritySignInMethods";

interface SecurityInfo extends SignInMethodsInfo { email: string; hasPassword: boolean; mustSetPassword: boolean }

const IMPERSONATING = "Not available while viewing as another user.";
const inputCls = "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";
const btnCls = "px-3 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50";

async function errorCode(res: Response): Promise<string> {
  try { return ((await res.json()) as { error?: { code?: string } }).error?.code ?? ""; } catch { return ""; }
}

function PasswordSection({ info, onChanged }: { info: SecurityInfo; onChanged: () => void }): JSX.Element {
  const params = useSearchParams();
  const mode = passwordMode(info);
  const setMode = mode === "set";
  const heading = setMode || params.get("set") === "1" ? "Set your password" : "Password";
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true); setError(null); setDone(false);
    try {
      const body: { currentPassword?: string; newPassword: string } = { newPassword: next };
      if (!setMode) body.currentPassword = current;
      const res = await fetch("/api/v1/auth/password/change", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (res.ok) {
        setCurrent(""); setNext(""); setDone(true); onChanged();
        return;
      }
      const code = await errorCode(res);
      if (code === "NO_SESSION") setError(IMPERSONATING);
      else if (code === "WEAK_PASSWORD") setError("That password is too weak. Use a longer, less common password.");
      else if (res.status === 401) setError(setMode ? "Something went wrong. Please sign in again." : "Your current password is incorrect.");
      else setError("Could not update your password. Please try again.");
    } catch {
      setError("Could not update your password. Please try again.");
    } finally { setBusy(false); }
  }

  if (mode === "no_password" && !done) {
    return (
      <section className="border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold">{heading}</h2>
        <p className="text-sm text-gray-600">
          You don&apos;t have a password yet. Use Forgot password on the sign-in page to create one.{" "}
          <Link href="/forgot-password" className="text-green-700 hover:underline">Forgot password</Link>
        </p>
      </section>
    );
  }

  return (
    <section className="border rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold">{heading}</h2>
      <form onSubmit={(e) => void submit(e)} className="space-y-3 max-w-sm">
        {!setMode && (
          <label className="block text-sm">
            <span className="text-gray-600">Current password</span>
            <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={inputCls} />
          </label>
        )}
        <label className="block text-sm">
          <span className="text-gray-600">New password</span>
          <input type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {done && <p role="status" className="text-sm text-green-700">Password updated. Other devices were signed out.</p>}
        <button type="submit" disabled={busy || !next || (!setMode && !current)} className={btnCls}>
          {busy ? "Saving…" : setMode ? "Set password" : "Change password"}
        </button>
      </form>
    </section>
  );
}

function DevicesSection({ refreshKey }: { refreshKey: number }): JSX.Element {
  const { signOut } = useAuth();
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/auth/sessions", { cache: "no-store" });
      if (!res.ok) {
        setError((await errorCode(res)) === "NO_SESSION" ? IMPERSONATING : "Could not load your devices.");
        return;
      }
      setSessions(((await res.json()) as { data: DeviceSession[] }).data);
      setError(null);
    } catch { setError("Could not load your devices."); }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  async function signOutDevice(s: DeviceSession): Promise<void> {
    setBusyId(s.id);
    try {
      const res = await fetch(`/api/v1/auth/sessions/${encodeURIComponent(s.id)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) { toast.error("Could not sign out that device."); return; }
      if (s.current) { await signOut({ redirectUrl: "/sign-in" }); return; }
      await load();
    } catch { toast.error("Could not sign out that device."); }
    finally { setBusyId(null); }
  }

  async function signOutOthers(): Promise<void> {
    if (!confirm("Sign out of every other device? You will stay signed in here.")) return;
    setBusyId("all");
    try {
      const res = await fetch("/api/v1/auth/sessions/revoke-all", { method: "POST" });
      if (!res.ok) { toast.error("Could not sign out other devices."); return; }
      toast.success("Signed out of other devices.");
      await load();
    } catch { toast.error("Could not sign out other devices."); }
    finally { setBusyId(null); }
  }

  const now = new Date();
  const hasOthers = (sessions ?? []).some((s) => !s.current);
  return (
    <section className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Signed-in devices</h2>
        {hasOthers && (
          <button type="button" disabled={busyId !== null} onClick={() => void signOutOthers()} className="text-sm text-red-600 hover:underline disabled:opacity-50">
            Sign out everywhere else
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!error && sessions === null && <p className="text-sm text-gray-500">Loading…</p>}
      <ul className="divide-y">
        {(sessions ?? []).map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {deviceTitle(s)}
                <span className="ml-2 text-xs font-normal text-gray-500">{clientLabel(s.client)}</span>
                {s.current && <span className="ml-2 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">This device</span>}
              </p>
              <p className="text-xs text-gray-500">{s.ip ?? "Unknown IP"} · Last used {relativeTime(now, s.lastUsedAt).toLowerCase()}</p>
            </div>
            <button type="button" disabled={busyId !== null} onClick={() => void signOutDevice(s)} className="shrink-0 text-sm text-gray-700 hover:underline disabled:opacity-50">
              Sign out
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function WbmsgSecurity(): JSX.Element {
  const [info, setInfo] = useState<SecurityInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const methods = useAuthMethods();

  const loadInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/auth/me/security", { cache: "no-store" });
      if (!res.ok) {
        setError((await errorCode(res)) === "NO_SESSION" ? IMPERSONATING : "Could not load your security settings.");
        return;
      }
      setInfo((await res.json()) as SecurityInfo);
    } catch { setError("Could not load your security settings."); }
  }, []);

  useEffect(() => { void loadInfo(); }, [loadInfo]);

  if (error) return <p role="alert" className="text-sm text-gray-600">{error}</p>;
  if (!info) return <p className="text-sm text-gray-500">Loading…</p>;
  return (
    <>
      <PasswordSection info={info} onChanged={() => { setRefreshKey((k) => k + 1); void loadInfo(); }} />
      <ConnectedAccountsSection info={info} methods={methods} onChanged={() => void loadInfo()} />
      <WhatsAppNumberSection info={info} enabled={methods.whatsapp} onChanged={() => void loadInfo()} />
      <DevicesSection refreshKey={refreshKey} />
    </>
  );
}

export default function SecuritySettingsPage(): JSX.Element {
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Security</h1>
      {authProvider() === "wbmsg" ? (
        <Suspense fallback={null}><WbmsgSecurity /></Suspense>
      ) : (
        <p className="text-sm text-gray-600">Your sign-in settings are managed in your profile menu.</p>
      )}
    </div>
  );
}
