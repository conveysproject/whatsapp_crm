import type { FormEvent, JSX } from "react";
import { HIDE_POWERED_BY_LABEL, clientSignInUrl, type BrandFormValues, type FormErrors } from "@/lib/brand-settings";

interface Props {
  values: BrandFormValues;
  errors: FormErrors;
  /** A server message that belongs to no single field. */
  formError: string | null;
  saving: boolean;
  /** Another action (an upload or remove) is running. */
  locked?: boolean;
  /** The page origin once known in the browser (null while rendering on the server). */
  origin: string | null;
  onChange: (patch: Partial<BrandFormValues>) => void;
  onSubmit: () => void;
}

const input = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500";

function FieldError({ id, message }: { id: string; message?: string }): JSX.Element | null {
  return message ? <p id={id} role="alert" className="mt-1 text-xs text-red-600">{message}</p> : null;
}

export function BrandForm({ values, errors, formError, saving, locked, origin, onChange, onSubmit }: Props): JSX.Element {
  const colorOk = /^#[0-9a-fA-F]{6}$/.test(values.color);
  const address = clientSignInUrl(origin, values.slug);
  return (
    <form
      noValidate
      onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit(); }}
      className="space-y-5"
    >
      <div>
        <label htmlFor="brand-name" className="mb-1 block text-sm font-medium text-gray-700">Brand name</label>
        <input id="brand-name" type="text" value={values.name} maxLength={40} onChange={(e) => onChange({ name: e.target.value })}
          aria-invalid={!!errors.name} aria-describedby={errors.name ? "brand-name-error" : undefined} className={input} />
        <FieldError id="brand-name-error" message={errors.name} />
      </div>

      <div>
        <label htmlFor="brand-color-text" className="mb-1 block text-sm font-medium text-gray-700">Primary color</label>
        <div className="flex items-center gap-2">
          <input type="color" aria-label="Pick a color" value={colorOk ? values.color.toLowerCase() : "#000000"}
            onChange={(e) => onChange({ color: e.target.value })} className="h-10 w-12 cursor-pointer rounded border border-gray-200 p-1" />
          <input id="brand-color-text" type="text" value={values.color} maxLength={7} spellCheck={false}
            onChange={(e) => onChange({ color: e.target.value.trim() })}
            aria-invalid={!!errors.color} aria-describedby={errors.color ? "brand-color-error" : undefined} className={`${input} max-w-[10rem] font-mono`} />
        </div>
        <FieldError id="brand-color-error" message={errors.color} />
      </div>

      <div>
        <label htmlFor="brand-email" className="mb-1 block text-sm font-medium text-gray-700">Support email</label>
        <input id="brand-email" type="email" value={values.supportEmail} onChange={(e) => onChange({ supportEmail: e.target.value })}
          aria-invalid={!!errors.supportEmail} aria-describedby="brand-email-help" className={input} />
        <p id="brand-email-help" className="mt-1 text-xs text-gray-500">
          Shown to your clients so they can reach you. Required before your brand can be approved.
        </p>
        <FieldError id="brand-email-error" message={errors.supportEmail} />
      </div>

      <div>
        <label htmlFor="brand-slug" className="mb-1 block text-sm font-medium text-gray-700">Web address</label>
        <input id="brand-slug" type="text" value={values.slug} maxLength={40} spellCheck={false} autoCapitalize="none"
          onChange={(e) => onChange({ slug: e.target.value })}
          aria-invalid={!!errors.slug} aria-describedby="brand-slug-help" className={`${input} font-mono`} />
        <p id="brand-slug-help" className="mt-1 text-xs text-gray-500">
          Lowercase letters, numbers and hyphens. Your clients sign in at{" "}
          <span data-testid="sign-in-address" className="break-all font-mono text-gray-700">{address ?? "your web address (set one above)"}</span>
        </p>
        <FieldError id="brand-slug-error" message={errors.slug} />
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={values.hidePoweredBy} onChange={(e) => onChange({ hidePoweredBy: e.target.checked })} />
        {HIDE_POWERED_BY_LABEL}
      </label>

      {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}

      <button type="submit" disabled={saving || locked === true} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
        {saving ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
