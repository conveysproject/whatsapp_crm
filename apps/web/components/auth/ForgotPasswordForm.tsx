"use client";

import { useEffect, useState } from "react";
import type { FormEvent, JSX } from "react";
import Link from "next/link";
import { nextStep, postAuth } from "@/lib/auth/flows";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { TURNSTILE_ENABLED, Turnstile } from "./Turnstile";
import { ErrorText, SubmitButton, TextField, styles } from "./fields";

export function ForgotPasswordForm(): JSX.Element {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tsKey, setTsKey] = useState(0);
  const s = styles("light");

  useEffect(() => {
    const prefill = new URLSearchParams(window.location.search).get("email");
    if (prefill) setEmail((cur) => cur || prefill);
  }, []);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setPending(true);
    setError(null);
    const payload: Record<string, unknown> = { email: email.trim() };
    if (token) payload["turnstileToken"] = token;
    const step = nextStep(await postAuth("password/forgot", payload));
    setPending(false);
    setTsKey((k) => k + 1);
    if (step.kind === "error") {
      setError(step.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <h1 className={s.title}>Reset your password</h1>
        <ResetPasswordForm
          initialEmail={email.trim()}
          note="If an account exists for that email, we've sent a 6-digit code. Enter it with your new password."
        />
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <h1 className={s.title}>Forgot your password?</h1>
      <p className={s.muted}>Enter your email and we will send you a code.</p>
      <TextField id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" theme="light" />
      <Turnstile onToken={setToken} resetKey={tsKey} />
      <ErrorText message={error} theme="light" />
      <SubmitButton pending={pending} theme="light" disabled={TURNSTILE_ENABLED && !token}>
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
