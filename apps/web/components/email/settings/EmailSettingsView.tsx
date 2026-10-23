import type { FormEvent, JSX } from "react";
import { ConfirmDialog } from "@/components/parent/ConfirmDialog";
import { NewBadge } from "@/components/ui/NewBadge";
import {
  PICKER_OPTIONS, PLAIN_WARNING, PRIVACY_HELP, SECURITY_OPTIONS, SMTP_PORT_OPTIONS, SPAM_HELP,
  bannerInfo, providerFields, providerHelp, secretLabel, secretPlaceholder, testDisabledReason,
  type EmailFormValues, type EmailSettings, type FieldKey, type FormErrors, type PickerId, type Security,
} from "@/lib/email-settings";
import type { ConfirmState } from "@/lib/parent-orgs";

export interface TestMessage { ok: boolean; text: string }

export interface EmailSettingsViewProps {
  /** The saved settings, or null when nothing is saved. Only non-secret fields are ever read from it. */
  settings: EmailSettings | null;
  values: EmailFormValues;
  errors: FormErrors;
  formError: string | null;
  saving: boolean;
  testing: boolean;
  /** True while a save, test or remove runs: every control is disabled. */
  locked: boolean;
  dirty: boolean;
  /** A background refresh failed; the form stays and a small notice shows. */
  refreshFailed?: boolean;
  testMessage: TestMessage | null;
  removeState: ConfirmState;
  removeError: string | null;
  onChange: (patch: Partial<EmailFormValues>, fields: FieldKey[]) => void;
  onChoice: (choice: PickerId) => void;
  onSesRegion: (region: string) => void;
  onSecurity: (security: Security) => void;
  onSave: () => void;
  onTest: () => void;
  onRequestRemove: () => void;
  onCancelRemove: () => void;
  onConfirmRemove: () => void;
}

const input = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60";
const labelCls = "mb-1 block text-sm font-medium text-gray-700";

function FieldError({ id, message }: { id: string; message?: string }): JSX.Element | null {
  return message ? <p id={id} role="alert" className="mt-1 text-xs text-red-600">{message}</p> : null;
}

const BANNER_STYLE = {
  none: "border-gray-300 bg-gray-50 text-gray-800",
  unverified: "border-amber-300 bg-amber-50 text-amber-900",
  verified: "border-green-300 bg-green-50 text-green-900",
  failing: "border-red-300 bg-red-50 text-red-900",
} as const;

export function EmailSettingsView(p: EmailSettingsViewProps): JSX.Element {
  const v = p.values;
  const fields = providerFields(v.choice);
  const has = (f: FieldKey) => fields.includes(f);
  const banner = bannerInfo(p.settings);
  const off = p.locked;
  const testBlock = testDisabledReason({ saved: p.settings !== null, dirty: p.dirty, busy: p.locked });
  const smtp = has("host");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Email</h1>
          <NewBadge />
        </div>
        <p className="mt-1 text-sm text-gray-500">Send your emails from your own address, through your own email provider.</p>
      </div>

      {p.refreshFailed && <p role="status" className="text-xs text-amber-700">Could not refresh. Showing the last loaded details.</p>}

      <div data-status={banner.state} role="status" className={`rounded-lg border p-4 text-sm ${BANNER_STYLE[banner.state]}`}>
        <p className="font-medium">{banner.title}</p>
        {banner.detail && <p className="mt-1">{banner.detail}</p>}
      </div>

      <form noValidate onSubmit={(e: FormEvent) => { e.preventDefault(); p.onSave(); }} className="space-y-5">
        <div>
          <label htmlFor="email-provider" className={labelCls}>Email provider</label>
          <select id="email-provider" value={v.choice} disabled={off} onChange={(e) => p.onChoice(e.target.value as PickerId)} className={input}>
            {(["SMTP presets", "Email services"] as const).map((group) => (
              <optgroup key={group} label={group}>
                {PICKER_OPTIONS.filter((o) => o.group === group).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </optgroup>
            ))}
          </select>
          <p data-testid="provider-help" className="mt-1 text-xs text-gray-500">{providerHelp(v.choice)}</p>
        </div>

        {has("sesRegion") && (
          <div>
            <label htmlFor="email-ses-region" className={labelCls}>AWS region</label>
            <input id="email-ses-region" type="text" value={v.sesRegion} disabled={off} spellCheck={false} autoCapitalize="none" placeholder="us-east-1"
              onChange={(e) => p.onSesRegion(e.target.value.trim())} aria-invalid={!!p.errors.sesRegion} className={`${input} font-mono`} />
            <FieldError id="email-ses-region-error" message={p.errors.sesRegion} />
          </div>
        )}

        {has("domain") && (
          <div>
            <label htmlFor="email-domain" className={labelCls}>Sending domain</label>
            <input id="email-domain" type="text" value={v.domain} disabled={off} spellCheck={false} autoCapitalize="none" placeholder="mg.example.com"
              onChange={(e) => p.onChange({ domain: e.target.value }, ["domain"])} aria-invalid={!!p.errors.domain} className={input} />
            <FieldError id="email-domain-error" message={p.errors.domain} />
          </div>
        )}

        {has("region") && (
          <div>
            <label htmlFor="email-region" className={labelCls}>Region</label>
            <select id="email-region" value={v.region} disabled={off} onChange={(e) => p.onChange({ region: e.target.value === "eu" ? "eu" : "us" }, ["region"])} className={input}>
              <option value="us">United States</option>
              <option value="eu">Europe</option>
            </select>
            <FieldError id="email-region-error" message={p.errors.region} />
          </div>
        )}

        {smtp && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label htmlFor="email-host" className={labelCls}>SMTP server</label>
                <input id="email-host" type="text" value={v.host} disabled={off} spellCheck={false} autoCapitalize="none" placeholder="smtp.example.com"
                  onChange={(e) => p.onChange({ host: e.target.value }, ["host"])} aria-invalid={!!p.errors.host} className={input} />
                <FieldError id="email-host-error" message={p.errors.host} />
              </div>
              <div>
                <label htmlFor="email-port" className={labelCls}>Port</label>
                <select id="email-port" value={v.port} disabled={off} onChange={(e) => p.onChange({ port: e.target.value }, ["port"])} aria-invalid={!!p.errors.port} className={input}>
                  {!(SMTP_PORT_OPTIONS as readonly number[]).includes(Number(v.port)) && <option value={v.port}>{v.port}</option>}
                  {SMTP_PORT_OPTIONS.map((n) => <option key={n} value={String(n)}>{n}</option>)}
                </select>
                <FieldError id="email-port-error" message={p.errors.port} />
              </div>
            </div>

            <div>
              <label htmlFor="email-security" className={labelCls}>Security</label>
              <select id="email-security" value={v.security} disabled={off} onChange={(e) => p.onSecurity(e.target.value as Security)} className={input}>
                {SECURITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <FieldError id="email-security-error" message={p.errors.security} />
            </div>

            {v.security === "plain" && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p>{PLAIN_WARNING}</p>
                <label className="mt-2 flex items-center gap-2">
                  <input type="checkbox" checked={v.allowPlain} disabled={off} onChange={(e) => p.onChange({ allowPlain: e.target.checked }, ["allowPlain"])} />
                  Allow unencrypted connection
                </label>
                <FieldError id="email-allow-plain-error" message={p.errors.allowPlain} />
              </div>
            )}

            <div>
              <label htmlFor="email-user" className={labelCls}>Username</label>
              <input id="email-user" type="text" value={v.user} disabled={off} spellCheck={false} autoCapitalize="none" autoComplete="off"
                onChange={(e) => p.onChange({ user: e.target.value }, ["user"])} aria-invalid={!!p.errors.user} className={input} />
              <FieldError id="email-user-error" message={p.errors.user} />
            </div>
          </>
        )}

        {has("secret") && (
          <div>
            <label htmlFor="email-secret" className={labelCls}>{secretLabel(v.choice)}</label>
            <input id="email-secret" type="password" value={v.secret} disabled={off} autoComplete="new-password" spellCheck={false}
              placeholder={secretPlaceholder(v, p.settings)}
              onChange={(e) => p.onChange({ secret: e.target.value }, ["secret"])} aria-invalid={!!p.errors.secret} className={input} />
            <p className="mt-1 text-xs text-gray-500">It is stored encrypted and never shown again.</p>
            <FieldError id="email-secret-error" message={p.errors.secret} />
          </div>
        )}

        <div>
          <label htmlFor="email-from" className={labelCls}>From address</label>
          <input id="email-from" type="email" value={v.fromAddress} disabled={off} onChange={(e) => p.onChange({ fromAddress: e.target.value }, ["fromAddress"])}
            aria-invalid={!!p.errors.fromAddress} className={input} />
          <FieldError id="email-from-error" message={p.errors.fromAddress} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="email-from-name" className={labelCls}>From name (optional)</label>
            <input id="email-from-name" type="text" value={v.fromName} disabled={off} onChange={(e) => p.onChange({ fromName: e.target.value }, ["fromName"])}
              aria-invalid={!!p.errors.fromName} className={input} />
            <FieldError id="email-from-name-error" message={p.errors.fromName} />
          </div>
          <div>
            <label htmlFor="email-reply-to" className={labelCls}>Reply-to (optional)</label>
            <input id="email-reply-to" type="email" value={v.replyTo} disabled={off} onChange={(e) => p.onChange({ replyTo: e.target.value }, ["replyTo"])}
              aria-invalid={!!p.errors.replyTo} className={input} />
            <FieldError id="email-reply-to-error" message={p.errors.replyTo} />
          </div>
        </div>

        {p.formError && <p role="alert" className="text-sm text-red-600">{p.formError}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={off} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {p.saving ? "Saving..." : "Save"}
          </button>
          <button type="button" data-testid="send-test" disabled={testBlock !== null} onClick={p.onTest}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {p.testing ? "Sending..." : "Send test email to me"}
          </button>
          {p.settings && (
            <button type="button" data-testid="remove-connection" disabled={off} onClick={p.onRequestRemove}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50">
              Remove connection
            </button>
          )}
        </div>
        {testBlock && !p.locked && <p data-testid="test-hint" className="text-xs text-gray-500">{testBlock}</p>}
        {p.testMessage && (
          <p role="status" data-testid="test-result" data-ok={p.testMessage.ok ? "true" : "false"} className={`text-sm ${p.testMessage.ok ? "text-green-700" : "text-red-600"}`}>
            {p.testMessage.text}
          </p>
        )}
      </form>

      <section className="space-y-2 rounded-lg border p-4 text-sm text-gray-600">
        <h2 className="font-medium text-gray-800">Good to know</h2>
        <p>{SPAM_HELP}</p>
        <p>{PRIVACY_HELP}</p>
      </section>

      {p.removeState !== "idle" && (
        <ConfirmDialog
          title="Remove the email connection?"
          confirmLabel="Remove"
          busy={p.removeState === "running"}
          error={p.removeError}
          onConfirm={p.onConfirmRemove}
          onCancel={p.onCancelRemove}
        >
          <p>Your emails will be sent from our address again. Your saved credentials are deleted.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
