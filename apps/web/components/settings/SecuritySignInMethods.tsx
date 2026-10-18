"use client";
import { useEffect, useState } from "react";
import type { FormEvent, JSX } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ProviderButton } from "@/components/auth/SocialButtons";
import { TURNSTILE_ENABLED, Turnstile } from "@/components/auth/Turnstile";
import {
  PROVIDER_LABEL,
  canUnlink,
  oauthErrorMessage,
  type AuthMethods,
  type OAuthProviderId,
} from "@/lib/auth/oauth";

export interface SignInMethodsInfo {
  hasPassword: boolean;
  mustSetPassword: boolean;
  phone: { e164: string; verified: boolean } | null;
  oauth: { provider: string }[];
}

const inputCls = "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";
const btnCls = "px-3 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50";
const outlineCls = "px-3 py-2 text-sm font-medium rounded-lg border text-gray-800 hover:bg-gray-50 disabled:opacity-50";

const PHONE_ERRORS: Record<string, string> = {
  INVALID_PHONE: "Enter your full WhatsApp number with the country code, for example +91 98765 43210.",
  WHATSAPP_SEND_FAILED: "We couldn't send a WhatsApp message to that number. Check the number and try again.",
  RATE_LIMITED: "Too many attempts. Please wait a while and try again.",
  INVALID_CODE: "That code is not valid. Request a new one.",
  PHONE_IN_USE: "This number is already linked to another account.",
  NO_SESSION: "Not available while viewing as another user.",
  BOT_CHECK_FAILED: "Please complete the check and try again.",
};

async function errorCode(res: Response): Promise<string> {
  try {
    return ((await res.json()) as { error?: { code?: string } }).error?.code ?? "";
  } catch {
    return "";
  }
}

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

/** Verified WhatsApp number for "Send code on WhatsApp" sign-in. Hidden when WhatsApp sign-in is off. */
export function WhatsAppNumberSection({ info, enabled, onChanged }: { info: SignInMethodsInfo; enabled: boolean; onChanged: () => void }): JSX.Element | null {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tsKey, setTsKey] = useState(0);

  if (!enabled) return null;
  const verified = info.phone?.verified ? info.phone.e164 : null;

  async function send(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { phone: phone.trim() };
      if (token) payload["turnstileToken"] = token;
      const res = await postJson("/api/v1/auth/phone/verify/request", payload);
      // Turnstile tokens are single use.
      setTsKey((k) => k + 1);
      setToken(null);
      if (res.ok) setSentTo(phone.trim());
      else setError(PHONE_ERRORS[await errorCode(res)] ?? "Could not send the code. Please try again.");
    } catch {
      setError("Could not send the code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!sentTo) return;
    setBusy(true);
    setError(null);
    try {
      const res = await postJson("/api/v1/auth/phone/verify/confirm", { phone: sentTo, code: code.trim() });
      if (res.ok) {
        setSentTo(null);
        setPhone("");
        setCode("");
        toast.success("WhatsApp number verified.");
        onChanged();
      } else setError(PHONE_ERRORS[await errorCode(res)] ?? "Could not verify the number. Please try again.");
    } catch {
      setError("Could not verify the number. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    if (!confirm_(`Remove ${verified}? You won't be able to sign in with a WhatsApp code until you add a number again.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/phone", { method: "DELETE" });
      if (res.status === 409) toast.error("This is your only way to sign in besides email. Set a password or connect another option first.");
      else if (!res.ok) toast.error("Could not remove the number.");
      else onChanged();
    } catch {
      toast.error("Could not remove the number.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold">WhatsApp number</h2>
      <p className="text-sm text-gray-600">
        {verified ? (
          <>
            Verified: <span className="font-medium text-gray-900">{verified}</span>. You can sign in with a code sent on WhatsApp.
          </>
        ) : (
          "Add your WhatsApp number to sign in with a code sent on WhatsApp."
        )}
      </p>
      {sentTo ? (
        <form onSubmit={(e) => void confirm(e)} className="space-y-3 max-w-sm">
          <p className="text-sm text-gray-600">We sent a 6-digit code on WhatsApp to {sentTo}.</p>
          <label className="block text-sm">
            <span className="text-gray-600">6-digit code</span>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value)} className={inputCls} />
          </label>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !code.trim()} className={btnCls}>{busy ? "Checking…" : "Verify"}</button>
            <button type="button" disabled={busy} onClick={() => { setSentTo(null); setError(null); }} className={outlineCls}>Change number</button>
          </div>
        </form>
      ) : (
        <form onSubmit={(e) => void send(e)} className="space-y-3 max-w-sm">
          <label className="block text-sm">
            <span className="text-gray-600">{verified ? "New WhatsApp number" : "WhatsApp number (with country code)"}</span>
            <input type="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" className={inputCls} />
          </label>
          <Turnstile onToken={setToken} resetKey={tsKey} />
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy || !phone.trim() || (TURNSTILE_ENABLED && !token)} className={btnCls}>{busy ? "Sending…" : "Send code on WhatsApp"}</button>
            {verified && (
              <button type="button" disabled={busy} onClick={() => void remove()} className="px-3 py-2 text-sm text-red-600 hover:underline disabled:opacity-50">
                Remove number
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

// window.confirm, named so it does not clash with the confirm() handler above.
const confirm_ = (msg: string): boolean => window.confirm(msg);

/** Google / Facebook connections. Shows providers that are switched on, plus any still linked. */
export function ConnectedAccountsSection({ info, methods, onChanged }: { info: SignInMethodsInfo; methods: AuthMethods; onChanged: () => void }): JSX.Element | null {
  const params = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const linked = info.oauth.map((l) => l.provider);
  const providers = (["google", "facebook"] as OAuthProviderId[]).filter((p) => methods[p] || linked.includes(p));

  useEffect(() => {
    const ok = params.get("linked");
    if (ok === "google" || ok === "facebook") toast.success(`${PROVIDER_LABEL[ok]} connected.`);
    const err = oauthErrorMessage(params.get("oauth_error"));
    if (err) toast.error(err);
  }, [params]);

  if (providers.length === 0) return null;

  async function disconnect(p: OAuthProviderId): Promise<void> {
    if (!window.confirm(`Disconnect ${PROVIDER_LABEL[p]}? You won't be able to sign in with it any more.`)) return;
    setBusy(p);
    try {
      const res = await fetch(`/api/v1/auth/oauth/${p}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(`${PROVIDER_LABEL[p]} disconnected.`);
        onChanged();
      } else if ((await errorCode(res)) === "LAST_SIGN_IN_METHOD") {
        toast.error("This is your only way to sign in. Set a password or connect another option first.");
      } else toast.error(`Could not disconnect ${PROVIDER_LABEL[p]}.`);
    } catch {
      toast.error(`Could not disconnect ${PROVIDER_LABEL[p]}.`);
    } finally {
      setBusy(null);
    }
  }

  const unlinkInfo = {
    hasPassword: info.hasPassword,
    mustSetPassword: info.mustSetPassword,
    phoneVerified: info.phone?.verified === true,
    whatsappEnabled: methods.whatsapp,
    linked,
  };

  return (
    <section className="border rounded-lg p-4 space-y-3">
      <h2 className="text-sm font-semibold">Connected accounts</h2>
      <ul className="divide-y">
        {providers.map((p) => {
          const isLinked = linked.includes(p);
          const removable = canUnlink(unlinkInfo, p);
          return (
            <li key={p} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{PROVIDER_LABEL[p]}</p>
                <p className="text-xs text-gray-500">
                  {isLinked ? (removable ? "Connected" : "Connected · your only way to sign in") : "Not connected"}
                </p>
              </div>
              {isLinked ? (
                <button type="button" disabled={busy !== null || !removable} onClick={() => void disconnect(p)} className="text-sm text-red-600 hover:underline disabled:opacity-50 disabled:no-underline">
                  Disconnect
                </button>
              ) : methods[p] ? (
                <ProviderButton provider={p} intent="link" label="Connect" className={outlineCls} />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
