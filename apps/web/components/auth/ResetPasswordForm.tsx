"use client";

import { useState } from "react";
import type { FormEvent, JSX, ReactNode } from "react";
import { nextStep, postAuth } from "@/lib/auth/flows";
import { ErrorText, SubmitButton, TextField, styles } from "./fields";
import type { Theme } from "./fields";

/** Code + new password. Posts password/reset, which signs the user in; then a full navigation. */
export function ResetPasswordForm({
  initialEmail = "",
  lockEmail = false,
  note,
  target = "/dashboard",
  theme = "light",
  footer,
}: {
  initialEmail?: string;
  lockEmail?: boolean;
  note?: string;
  target?: string;
  theme?: Theme;
  footer?: ReactNode;
}): JSX.Element {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = styles(theme);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setPending(true);
    setError(null);
    const step = nextStep(
      await postAuth("password/reset", { email: email.trim(), code: code.trim(), newPassword: password }),
    );
    if (step.kind === "error") {
      setError(step.message);
      setPending(false);
      return;
    }
    window.location.assign(target);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      {note && <p className={s.muted}>{note}</p>}
      <TextField id="email" label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" readOnly={lockEmail} theme={theme} />
      <TextField id="code" label="6-digit code" value={code} onChange={setCode} autoComplete="one-time-code" inputMode="numeric" maxLength={6} theme={theme} />
      <TextField id="new-password" label="New password" type="password" value={password} onChange={setPassword} autoComplete="new-password" theme={theme} />
      <ErrorText message={error} theme={theme} />
      <SubmitButton pending={pending} theme={theme}>
        Set password and sign in
      </SubmitButton>
      {footer}
    </form>
  );
}
