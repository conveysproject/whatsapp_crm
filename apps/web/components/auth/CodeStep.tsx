"use client";

import { useState } from "react";
import type { FormEvent, JSX } from "react";
import { ErrorText, SubmitButton, TextField, styles } from "./fields";
import type { Theme } from "./fields";

/** Collects a 6-digit emailed code. onSubmit resolves to an error message, or null on success. */
export function CodeStep({
  intro,
  submitLabel,
  onSubmit,
  theme = "light",
}: {
  intro: string;
  submitLabel: string;
  onSubmit: (code: string) => Promise<string | null>;
  theme?: Theme;
}): JSX.Element {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = styles(theme);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setPending(true);
    setError(null);
    const msg = await onSubmit(code.trim());
    if (msg) {
      setError(msg);
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <p className={s.muted}>{intro}</p>
      <TextField
        id="code"
        label="6-digit code"
        value={code}
        onChange={setCode}
        autoComplete="one-time-code"
        inputMode="numeric"
        maxLength={6}
        theme={theme}
      />
      <ErrorText message={error} theme={theme} />
      <SubmitButton pending={pending} theme={theme}>
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
