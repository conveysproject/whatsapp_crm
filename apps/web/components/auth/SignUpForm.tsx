"use client";

import { useState } from "react";
import type { FormEvent, JSX } from "react";
import Link from "next/link";
import { nextStep, postAuth } from "@/lib/auth/flows";
import { CodeStep } from "./CodeStep";
import { TURNSTILE_ENABLED, Turnstile } from "./Turnstile";
import { ErrorText, SubmitButton, TextField, styles } from "./fields";

export function SignUpForm(): JSX.Element {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tsKey, setTsKey] = useState(0);
  const s = styles("light");

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setPending(true);
    setError(null);
    const payload: Record<string, unknown> = {
      email: email.trim(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
    };
    if (token) payload["turnstileToken"] = token;
    const step = nextStep(await postAuth("sign-up", payload));
    setPending(false);
    setTsKey((k) => k + 1);
    if (step.kind === "error") {
      setError(step.message);
      return;
    }
    setVerifying(true);
  }

  async function verify(code: string): Promise<string | null> {
    const step = nextStep(await postAuth("sign-up/verify", { email: email.trim(), code }));
    if (step.kind === "error") return step.message;
    window.location.assign("/business-details");
    return null;
  }

  if (verifying) {
    return (
      <div className="space-y-4">
        <h1 className={s.title}>Check your email</h1>
        <CodeStep
          intro={`We sent a 6-digit code to ${email.trim()}. Enter it to finish creating your account.`}
          submitLabel="Verify"
          onSubmit={verify}
        />
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <h1 className={s.title}>Create your account</h1>
      <div className="grid grid-cols-2 gap-3">
        <TextField id="first-name" label="First name" value={firstName} onChange={setFirstName} autoComplete="given-name" theme="light" />
        <TextField id="last-name" label="Last name" value={lastName} onChange={setLastName} autoComplete="family-name" theme="light" />
      </div>
      <TextField id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" theme="light" />
      <TextField id="password" label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" theme="light" />
      <Turnstile onToken={setToken} resetKey={tsKey} />
      <ErrorText message={error} theme="light" />
      <SubmitButton pending={pending} theme="light" disabled={TURNSTILE_ENABLED && !token}>
        Create account
      </SubmitButton>
      <p className={s.muted}>
        Already have an account?{" "}
        <Link href="/sign-in" className={s.link}>
          Log in
        </Link>
      </p>
    </form>
  );
}
