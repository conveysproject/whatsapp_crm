"use client";

import { useState } from "react";
import type { FormEvent, JSX } from "react";
import Link from "next/link";
import { nextStep, postAuth } from "@/lib/auth/flows";
import {
  buildSignUpBody,
  nextSignupId,
  validateBusinessScreen,
  validateIdentityScreen,
  type BusinessValues,
  type FieldErrors,
  type IdentityValues,
} from "@/lib/auth/signup-steps";
import { BusinessFields } from "./BusinessFields";
import { CodeStep } from "./CodeStep";
import { TURNSTILE_ENABLED, Turnstile } from "./Turnstile";
import { ErrorText, SubmitButton, TextField, styles } from "./fields";

type Screen = "identity" | "business" | "code";

const EMPTY_BUSINESS: BusinessValues = {
  companyName: "",
  companyWebsite: "",
  companyLocation: "",
  industry: "",
  subCategory: "",
  revenue: "",
  termsAccepted: false,
};

export function SignUpForm(): JSX.Element {
  const [screen, setScreen] = useState<Screen>("identity");
  const [identity, setIdentity] = useState<IdentityValues>({ firstName: "", lastName: "", email: "", password: "" });
  const [business, setBusiness] = useState<BusinessValues>(EMPTY_BUSINESS);
  const [identityErrors, setIdentityErrors] = useState<FieldErrors<IdentityValues>>({});
  const [businessErrors, setBusinessErrors] = useState<FieldErrors<BusinessValues>>({});
  const [signupId, setSignupId] = useState<string | null>(null); // component state only, never persisted
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tsKey, setTsKey] = useState(0);
  const s = styles("light");

  function setId(patch: Partial<IdentityValues>): void {
    setIdentity((v) => ({ ...v, ...patch }));
    setIdentityErrors((e) => {
      const n = { ...e };
      for (const k of Object.keys(patch)) delete n[k as keyof IdentityValues];
      return n;
    });
  }

  function setBiz(patch: Partial<BusinessValues>): void {
    setBusiness((v) => ({ ...v, ...patch }));
    setBusinessErrors((e) => {
      const n = { ...e };
      for (const k of Object.keys(patch)) delete n[k as keyof BusinessValues];
      return n;
    });
  }

  function onContinue(e: FormEvent): void {
    e.preventDefault();
    const errs = validateIdentityScreen(identity);
    setIdentityErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setError(null);
    setScreen("business");
  }

  /** Posts the registration; on success moves to the code screen with the new signupId. */
  async function register(): Promise<void> {
    setPending(true);
    setError(null);
    const res = await postAuth("sign-up", buildSignUpBody(identity, business, token));
    setPending(false);
    setTsKey((k) => k + 1);
    setToken(null);
    const step = nextStep(res);
    const id = nextSignupId(null, res);
    if (step.kind === "error" || !id) {
      setError(step.kind === "error" ? step.message : "Something went wrong. Please try again.");
      return;
    }
    setSignupId(id);
    setExpired(false);
    setScreen("code");
  }

  async function onCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    const errs = validateBusinessScreen(business);
    setBusinessErrors(errs);
    if (Object.keys(errs).length > 0) return;
    await register();
  }

  async function verify(code: string): Promise<string | null> {
    const step = nextStep(await postAuth("sign-up/verify", { signupId, email: identity.email.trim(), code }));
    if (step.kind === "error") {
      if (/expired/i.test(step.message)) setExpired(true);
      return step.message;
    }
    window.location.assign("/dashboard");
    return null;
  }

  function startAgain(): void {
    setSignupId(null);
    setExpired(false);
    setError(null);
    setScreen("identity");
  }

  async function sendNewCode(): Promise<void> {
    // Keep the current signupId until a re-send succeeds (register sets the new one).
    // The Turnstile token is single-use and its widget lives on screen 2.
    if (TURNSTILE_ENABLED) {
      setError("Complete the check to send a new code.");
      setScreen("business");
      return;
    }
    await register();
  }

  if (screen === "code") {
    return (
      <div className="space-y-4">
        <h1 className={s.title}>Check your email</h1>
        {expired ? (
          <>
            <ErrorText message="Your sign-up expired. Please start again." theme="light" />
            <button type="button" onClick={startAgain} className={s.button}>
              Start again
            </button>
          </>
        ) : (
          <>
            <CodeStep
              key={signupId ?? "none"}
              intro={`We sent a 6-digit code to ${identity.email.trim()}. Enter it to finish creating your account.`}
              submitLabel="Verify"
              onSubmit={verify}
            />
            <ErrorText message={error} theme="light" />
            <p className={s.muted}>
              Didn&apos;t get it?{" "}
              <button type="button" disabled={pending} onClick={() => void sendNewCode()} className={s.link}>
                Send a new code
              </button>
            </p>
          </>
        )}
      </div>
    );
  }

  if (screen === "business") {
    return (
      <form onSubmit={(e) => void onCreate(e)} className="space-y-4">
        <h1 className={s.title}>Tell us about your business</h1>
        <BusinessFields values={business} errors={businessErrors} onChange={setBiz} />
        <Turnstile onToken={setToken} resetKey={tsKey} />
        <ErrorText message={error} theme="light" />
        <SubmitButton pending={pending} theme="light" disabled={TURNSTILE_ENABLED && !token}>
          Create account
        </SubmitButton>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setScreen("identity");
          }}
          className={s.link}
        >
          Back
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onContinue} className="space-y-4" noValidate>
      <h1 className={s.title}>Create your account</h1>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <TextField id="first-name" label="First name" value={identity.firstName} onChange={(v) => setId({ firstName: v })} autoComplete="given-name" theme="light" />
          <ErrorText message={identityErrors.firstName ?? null} theme="light" />
        </div>
        <div>
          <TextField id="last-name" label="Last name" value={identity.lastName} onChange={(v) => setId({ lastName: v })} autoComplete="family-name" theme="light" />
          <ErrorText message={identityErrors.lastName ?? null} theme="light" />
        </div>
      </div>
      <div>
        <TextField id="email" label="Email" type="email" value={identity.email} onChange={(v) => setId({ email: v })} autoComplete="email" theme="light" />
        <ErrorText message={identityErrors.email ?? null} theme="light" />
      </div>
      <div>
        <TextField id="password" label="Password" type="password" value={identity.password} onChange={(v) => setId({ password: v })} autoComplete="new-password" theme="light" />
        <ErrorText message={identityErrors.password ?? null} theme="light" />
      </div>
      <button type="submit" className={s.button}>
        Continue
      </button>
      <p className={s.muted}>
        Already have an account?{" "}
        <Link href="/sign-in" className={s.link}>
          Log in
        </Link>
      </p>
    </form>
  );
}
