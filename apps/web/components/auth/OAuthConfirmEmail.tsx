"use client";

import { useState } from "react";
import type { FormEvent, JSX } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { nextStep, postAuth } from "@/lib/auth/flows";
import { PROVIDER_LABEL, isOAuthProvider } from "@/lib/auth/oauth";
import { CodeStep } from "./CodeStep";
import { ErrorText, SubmitButton, TextField, styles } from "./fields";

/**
 * After Google/Facebook when the email still needs proof (always for Facebook): send a code to the
 * provider's email, or to one the person types when the provider gave none, then finish signing in.
 */
export function OAuthConfirmEmail(): JSX.Element {
  const params = useSearchParams();
  const providerParam = params.get("provider");
  const label = isOAuthProvider(providerParam) ? PROVIDER_LABEL[providerParam] : "your account";
  const masked = params.get("email");
  const s = styles("light");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: FormEvent): Promise<void> {
    e.preventDefault();
    setPending(true);
    setError(null);
    const step = nextStep(await postAuth("oauth/pending/send", masked ? {} : { email: email.trim() }));
    setPending(false);
    if (step.kind === "error") {
      setError(step.message);
      return;
    }
    setSent(true);
  }

  async function verify(code: string): Promise<string | null> {
    const res = await postAuth("oauth/pending/verify", { code });
    const step = nextStep(res);
    if (step.kind === "error") return step.message;
    const to = (res.body as { redirectTo?: unknown } | null)?.redirectTo;
    window.location.assign(typeof to === "string" && to.startsWith("/") && !to.startsWith("//") ? to : "/dashboard");
    return null;
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <h1 className={s.title}>Check your email</h1>
        <CodeStep
          intro={`We sent a 6-digit code to ${masked ?? email.trim()}. Enter it to finish signing in with ${label}.`}
          submitLabel="Continue"
          onSubmit={verify}
        />
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void send(e)} className="space-y-4">
      <h1 className={s.title}>Confirm your email</h1>
      {masked ? (
        <p className={s.muted}>
          To finish signing in with {label}, we&apos;ll email a 6-digit code to <strong>{masked}</strong>.
        </p>
      ) : (
        <>
          <p className={s.muted}>{label} didn&apos;t share an email address. Enter yours and we&apos;ll send you a code.</p>
          <TextField id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" theme="light" />
        </>
      )}
      <ErrorText message={error} theme="light" />
      <SubmitButton pending={pending} theme="light" disabled={!masked && !email.trim()}>
        Send code
      </SubmitButton>
      <p className={s.muted}>
        <Link href="/sign-in" className={s.link}>
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
