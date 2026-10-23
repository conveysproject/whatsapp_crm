"use client";

import { useEffect, useRef, useState, type JSX } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  EMPTY_VALUES, applyChoice, applySecurity, applySesRegion, applyTestOutcome, clearFieldErrors, describeSendReason, fetchEmailSettings,
  formFromSettings, hasUnsavedChanges, isEmailBusy, mapEmailError, mapTestError, removeEmailSettings, saveEmailSettings, testEmailSettings,
  validateEmailForm, type EmailFormValues, type EmailSettings as EmailSettingsData, type FieldKey, type FormErrors, type PickerId, type Security,
} from "@/lib/email-settings";
import { finishConfirm, startConfirm } from "@/lib/brand-settings";
import { confirmReducer, type ConfirmState } from "@/lib/parent-orgs";
import { EmailSettingsView, type TestMessage } from "./EmailSettingsView";

export const EMAIL_SETTINGS_QUERY_KEY = ["email-settings"] as const;

export function EmailSettings(): JSX.Element {
  const qc = useQueryClient();
  // retry: false so a refusal (403) is shown once instead of being retried in a loop.
  const { data, isLoading, isError } = useQuery({
    queryKey: EMAIL_SETTINGS_QUERY_KEY, queryFn: fetchEmailSettings, staleTime: 0, refetchOnWindowFocus: false, retry: false,
  });
  const [values, setValues] = useState<EmailFormValues | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<TestMessage | null>(null);
  const [removeState, setRemoveState] = useState<ConfirmState>("idle");
  const [removeError, setRemoveError] = useState<string | null>(null);
  const seeded = useRef(false);
  const removeRunning = useRef(false);
  const opRunning = useRef(false);
  const latestOp = useRef(0);

  useEffect(() => {
    if (data !== undefined && !seeded.current) {
      seeded.current = true;
      setValues(formFromSettings(data));
    }
  }, [data]);

  if (isLoading || (data !== undefined && !values)) return <div className="py-12 text-center text-sm text-gray-400">Loading...</div>;
  if (data === undefined || !values) return <div className="py-12 text-center text-sm text-red-600">Could not load your email settings. Please reload the page.</div>;
  const stored: EmailSettingsData | null = data;
  const busy = isEmailBusy({ saving, testing, removeState });

  /** Only the latest operation may replace the cached settings. */
  function begin(): number | null {
    if (opRunning.current) return null;
    opRunning.current = true;
    return ++latestOp.current;
  }
  function apply(op: number, next: EmailSettingsData | null) {
    if (op === latestOp.current) qc.setQueryData<EmailSettingsData | null>(EMAIL_SETTINGS_QUERY_KEY, next);
  }

  async function save() {
    if (!values || busy) return;
    const found = validateEmailForm(values, stored);
    setErrors(found);
    setFormError(null);
    setTestMessage(null);
    if (Object.keys(found).length > 0) return;
    const op = begin();
    if (op === null) return;
    setSaving(true);
    try {
      const saved = await saveEmailSettings(values);
      apply(op, saved);
      setValues(formFromSettings(saved)); // the secret box is emptied; it is never shown again
    } catch (err) {
      const m = mapEmailError(err);
      if (m.field) setErrors({ [m.field]: m.message });
      else setFormError(m.message);
    } finally {
      opRunning.current = false;
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!stored || !values || busy || hasUnsavedChanges(values, stored)) return;
    const op = begin();
    if (op === null) return;
    setTesting(true);
    setTestMessage(null);
    setFormError(null);
    try {
      const outcome = await testEmailSettings();
      apply(op, applyTestOutcome(stored, outcome, new Date().toISOString()));
      setTestMessage(outcome.ok
        ? { ok: true, text: "Test email sent. Check your inbox. Your connection is now on." }
        : { ok: false, text: describeSendReason(outcome.reason) });
    } catch (err) {
      setTestMessage({ ok: false, text: mapTestError(err) });
    } finally {
      opRunning.current = false;
      setTesting(false);
    }
  }

  async function confirmRemove() {
    if (removeRunning.current) return;
    const step = startConfirm(removeState);
    if (!step.proceed) return;
    const op = begin();
    if (op === null) return;
    removeRunning.current = true;
    setRemoveState(step.next);
    setRemoveError(null);
    let ok = false;
    try {
      await removeEmailSettings();
      apply(op, null);
      setValues({ ...EMPTY_VALUES });
      setErrors({});
      setTestMessage(null);
      ok = true;
    } catch (err) {
      setRemoveError(mapEmailError(err).message);
    } finally {
      removeRunning.current = false;
      opRunning.current = false;
    }
    setRemoveState(finishConfirm(ok));
  }

  const edit = (next: EmailFormValues, fields: FieldKey[]) => {
    setValues(next);
    setErrors((prev) => clearFieldErrors(prev, fields));
    setTestMessage(null);
  };

  return (
    <EmailSettingsView
      refreshFailed={isError}
      settings={stored}
      values={values}
      errors={errors}
      formError={formError}
      saving={saving}
      testing={testing}
      locked={busy}
      dirty={hasUnsavedChanges(values, stored)}
      testMessage={testMessage}
      removeState={removeState}
      removeError={removeError}
      onChange={(patch, fields) => edit({ ...values, ...patch }, fields)}
      onChoice={(choice: PickerId) => edit(applyChoice(values, choice), ["host", "port", "security", "allowPlain", "user", "secret", "sesRegion", "domain", "region"])}
      onSesRegion={(region) => edit(applySesRegion(values, region), ["sesRegion", "host"])}
      onSecurity={(security: Security) => edit(applySecurity(values, security), ["security", "allowPlain"])}
      onSave={() => { void save(); }}
      onTest={() => { void sendTest(); }}
      onRequestRemove={() => { if (busy) return; setRemoveError(null); setRemoveState(confirmReducer("idle", "request")); }}
      onCancelRemove={() => { if (removeRunning.current) return; setRemoveState("idle"); setRemoveError(null); }}
      onConfirmRemove={() => { void confirmRemove(); }}
    />
  );
}
