"use client";

import { useEffect, useState } from "react";
import type { FormEvent, JSX } from "react";
import Link from "next/link";
import { useBrand } from "@/hooks/useBrand";
import { nextStep, postAuth, postSignInDestination } from "@/lib/auth/flows";
import { safeRedirect } from "@/lib/auth/redirect";
import { oauthErrorMessage } from "@/lib/auth/oauth";
import { SocialButtons, useAuthMethods } from "./SocialButtons";
import { CodeStep } from "./CodeStep";
import { ResetPasswordForm } from "./ResetPasswordForm";
import { TURNSTILE_ENABLED, Turnstile } from "./Turnstile";
import { ErrorText, SubmitButton, TextField, styles } from "./fields";
import type { Theme } from "./fields";

type View = "password" | "code_email" | "code_enter" | "new_device" | "set_password" | "wa_phone" | "wa_code";

/**
 * variant "vendor": goes to redirect_url / dashboard. variant "admin": reloads /admin/sign-in so the
 * existing super-admin check runs with the fresh session.
 */
export function SignInForm({
  variant = "vendor",
  forgotHref = "/forgot-password",
}: {
  variant?: "vendor" | "admin";
  /** Where "Forgot password?" goes; the branded sign-in page keeps people on its own route. */
  forgotHref?: string;
}): JSX.Element {
  const brand = useBrand();
  const theme: Theme = variant === "admin" ? "dark" : brand.isDefault ? "light" : "brand";
  const s = styles(theme);
  const [view, setView] = useState<View>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [tsKey, setTsKey] = useState(0);
  const [phone, setPhone] = useState("");
  // Social and WhatsApp sign-in are for customers only; super admins use the admin page with a code every time.
  const allMethods = useAuthMethods();
  const methods = variant === "vendor" ? allMethods : { whatsapp: false, google: false, facebook: false };

  const [redirectUrl, setRedirectUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (variant !== "vendor") return;
    const q = new URLSearchParams(window.location.search);
    const msg = oauthErrorMessage(q.get("oauth_error"));
    if (msg) setError(msg);
    const raw = q.get("redirect_url");
    if (raw) setRedirectUrl(safeRedirect(raw));
  }, [variant]);

  function finish(mustSetPassword = false): void {
    const raw = new URLSearchParams(window.location.search).get("redirect_url");
    window.location.assign(
      postSignInDestination({ variant, mustSetPassword, email: email.trim(), redirectTarget: safeRedirect(raw) }),
    );
  }

  async function submitPassword(e: FormEvent): Promise<void> {
    e.preventDefault();
    setPending(true);
    setError(null);
    const step = nextStep(await postAuth("sign-in/password", { email: email.trim(), password }));
    if (step.kind === "error") {
      setError(step.message);
      setPending(false);
      return;
    }
    if (step.kind === "done") {
      finish();
      return;
    }
    setChallengeId(step.challengeId);
    setView(step.kind);
    setPending(false);
  }

  async function requestCode(e: FormEvent): Promise<void> {
    e.preventDefault();
    setPending(true);
    setError(null);
    const payload: Record<string, unknown> = { email: email.trim() };
    if (token) payload["turnstileToken"] = token;
    const step = nextStep(await postAuth("sign-in/code/request", payload));
    setPending(false);
    setTsKey((k) => k + 1);
    if (step.kind === "error") {
      setError(step.message);
      return;
    }
    setView("code_enter");
  }

  async function verifyCode(code: string): Promise<string | null> {
    const res = await postAuth("sign-in/code/verify", { email: email.trim(), code });
    const step = nextStep(res);
    if (step.kind === "error") return step.message;
    const body = res.body as { mustSetPassword?: boolean } | null;
    finish(body?.mustSetPassword === true);
    return null;
  }

  async function requestWhatsapp(e: FormEvent): Promise<void> {
    e.preventDefault();
    setPending(true);
    setError(null);
    const payload: Record<string, unknown> = { phone: phone.trim() };
    if (token) payload["turnstileToken"] = token;
    const step = nextStep(await postAuth("sign-in/whatsapp/request", payload));
    setPending(false);
    setTsKey((k) => k + 1);
    if (step.kind === "error") {
      setError(step.message);
      return;
    }
    setView("wa_code");
  }

  async function verifyWhatsapp(code: string): Promise<string | null> {
    const res = await postAuth("sign-in/whatsapp/verify", { phone: phone.trim(), code });
    const step = nextStep(res);
    if (step.kind === "error") return step.message;
    const body = res.body as { mustSetPassword?: boolean } | null;
    finish(body?.mustSetPassword === true);
    return null;
  }

  async function verifyNewDevice(code: string): Promise<string | null> {
    const step = nextStep(await postAuth("sign-in/new-device", { challengeId, code }));
    if (step.kind === "error") return step.message;
    finish();
    return null;
  }

  if (view === "set_password") {
    return (
      <div className="space-y-4">
        <h1 className={s.title}>Set a new password</h1>
        <ResetPasswordForm
          initialEmail={email.trim()}
          lockEmail
          note="For your security, set a new password. We emailed you a 6-digit code."
          target={variant === "admin" ? "/admin/sign-in" : "/dashboard"}
          theme={theme}
        />
      </div>
    );
  }

  if (view === "new_device") {
    return (
      <div className="space-y-4">
        <h1 className={s.title}>Confirm it is you</h1>
        <CodeStep
          intro="We do not recognise this device. We emailed you a 6-digit code."
          submitLabel="Continue"
          onSubmit={verifyNewDevice}
          theme={theme}
        />
      </div>
    );
  }

  if (view === "code_enter") {
    return (
      <div className="space-y-4">
        <h1 className={s.title}>Check your email</h1>
        <CodeStep
          intro="If an account exists for that email, we've sent a 6-digit code."
          submitLabel="Sign in"
          onSubmit={verifyCode}
          theme={theme}
        />
      </div>
    );
  }

  if (view === "wa_code") {
    return (
      <div className="space-y-4">
        <h1 className={s.title}>Check WhatsApp</h1>
        <CodeStep
          intro={`If this number is verified on a ${brand.name} account, we've sent a 6-digit code on WhatsApp.`}
          submitLabel="Sign in"
          onSubmit={verifyWhatsapp}
          theme={theme}
        />
        <p className={s.muted}>
          <button
            type="button"
            className={s.link}
            onClick={() => {
              setError(null);
              setView("code_email");
            }}
          >
            Didn&apos;t get it? Email me a code instead
          </button>
        </p>
      </div>
    );
  }

  if (view === "wa_phone") {
    return (
      <form onSubmit={(e) => void requestWhatsapp(e)} className="space-y-4">
        <h1 className={s.title}>Sign in with WhatsApp</h1>
        <p className={s.muted}>Works if you verified your WhatsApp number in Settings → Security.</p>
        <TextField id="phone" label="WhatsApp number (with country code)" type="tel" value={phone} onChange={setPhone} autoComplete="tel" theme={theme} />
        <Turnstile onToken={setToken} resetKey={tsKey} />
        <ErrorText message={error} theme={theme} />
        <SubmitButton pending={pending} theme={theme} disabled={TURNSTILE_ENABLED && !token}>
          Send code on WhatsApp
        </SubmitButton>
        <p className={s.muted}>
          <button
            type="button"
            className={s.link}
            onClick={() => {
              setError(null);
              setView("password");
            }}
          >
            Use my email instead
          </button>
        </p>
      </form>
    );
  }

  if (view === "code_email") {
    return (
      <form onSubmit={(e) => void requestCode(e)} className="space-y-4">
        <h1 className={s.title}>Email me a code</h1>
        <TextField id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" theme={theme} />
        <Turnstile onToken={setToken} resetKey={tsKey} />
        <ErrorText message={error} theme={theme} />
        <SubmitButton pending={pending} theme={theme} disabled={TURNSTILE_ENABLED && !token}>
          Send code
        </SubmitButton>
        <p className={s.muted}>
          <button
            type="button"
            className={s.link}
            onClick={() => {
              setError(null);
              setView("password");
            }}
          >
            Use my password instead
          </button>
        </p>
      </form>
    );
  }

  // Provider buttons are their own forms, so they sit after (never inside) the password form.
  return (
    <div className="space-y-4">
      <form onSubmit={(e) => void submitPassword(e)} className="space-y-4">
        <h1 className={s.title}>Sign in</h1>
        <TextField id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" theme={theme} />
        <TextField id="password" label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" theme={theme} />
        <ErrorText message={error} theme={theme} />
        <SubmitButton pending={pending} theme={theme}>
          Sign in
        </SubmitButton>
        <div className={`flex justify-between ${s.muted}`}>
          <button
            type="button"
            className={s.link}
            onClick={() => {
              setError(null);
              setView("code_email");
            }}
          >
            Email me a code instead
          </button>
          <Link href={forgotHref} className={s.link}>
            Forgot password?
          </Link>
        </div>
        {methods.whatsapp && (
          <p className={s.muted}>
            <button
              type="button"
              className={s.link}
              onClick={() => {
                setError(null);
                setView("wa_phone");
              }}
            >
              Send code on WhatsApp
            </button>
          </p>
        )}
      </form>
      <SocialButtons methods={methods} redirectUrl={redirectUrl} theme={theme} />
    </div>
  );
}
