import type { JSX } from "react";
import { ConfirmDialog } from "@/components/parent/ConfirmDialog";
import { NewBadge } from "@/components/ui/NewBadge";
import {
  BRAND_SLOTS, bannerState, previewBrand, viewAsClient,
  type BrandFormValues, type BrandSettings, type FormErrors, type SlotName,
} from "@/lib/brand-settings";
import type { ConfirmState } from "@/lib/parent-orgs";
import { BrandForm } from "./BrandForm";
import { BrandImageSlot } from "./BrandImageSlot";
import { BrandPreview } from "./BrandPreview";
import { BrandStatusBanner } from "./BrandStatusBanner";

export interface SlotUiState { busy: boolean; error: string | null }

export interface BrandingSettingsViewProps {
  settings: BrandSettings;
  values: BrandFormValues;
  errors: FormErrors;
  formError: string | null;
  saving: boolean;
  /** True while any save, upload or remove is running: the other controls are disabled. */
  locked?: boolean;
  /** A background refresh failed; the form stays and a small notice shows. */
  refreshFailed?: boolean;
  reapprovalRequired: boolean;
  origin: string | null;
  slotState: Partial<Record<SlotName, SlotUiState>>;
  /** The slot waiting for a "remove" confirmation, if any. */
  removeSlot: SlotName | null;
  removeState: ConfirmState;
  removeError: string | null;
  onChange: (patch: Partial<BrandFormValues>) => void;
  onSave: () => void;
  onFile: (slot: SlotName, file: File) => void;
  onRequestRemove: (slot: SlotName) => void;
  onCancelRemove: () => void;
  onConfirmRemove: () => void;
}

export function BrandingSettingsView(p: BrandingSettingsViewProps): JSX.Element {
  const view = viewAsClient(p.settings);
  const slot = (name: SlotName) => {
    const def = BRAND_SLOTS.find((s) => s.slot === name)!;
    return (
      <BrandImageSlot
        key={name}
        def={def}
        url={p.settings[def.urlField]}
        busy={p.slotState[name]?.busy === true}
        locked={p.locked === true}
        error={p.slotState[name]?.error ?? null}
        onFile={(file) => p.onFile(name, file)}
        onRemove={() => p.onRequestRemove(name)}
      />
    );
  };
  const removing = p.removeSlot ? BRAND_SLOTS.find((s) => s.slot === p.removeSlot) : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Branding</h1>
          <NewBadge />
        </div>
        <p className="mt-1 text-sm text-gray-500">Show your clients your own name, logo and colors.</p>
      </div>

      {p.refreshFailed && <p role="status" className="text-xs text-amber-700">Could not refresh. Showing the last loaded details.</p>}

      <BrandStatusBanner state={bannerState(p.settings, p.reapprovalRequired)} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4">
          <h2 className="font-medium">Details</h2>
          <BrandForm values={p.values} errors={p.errors} formError={p.formError} saving={p.saving} locked={p.locked === true} origin={p.origin} onChange={p.onChange} onSubmit={p.onSave} />
        </section>

        <section className="space-y-4">
          <h2 className="font-medium">Preview</h2>
          <BrandPreview brand={previewBrand(p.values, p.settings)} />
          <div className="flex items-center gap-3">
            {view.href ? (
              <a href={view.href} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                View as client
              </a>
            ) : (
              <button type="button" disabled className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 opacity-50">
                View as client
              </button>
            )}
            {view.reason && <p className="text-xs text-gray-500">{view.reason}</p>}
          </div>
        </section>
      </div>

      <section className="space-y-4">
        <h2 className="font-medium">Images</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {BRAND_SLOTS.filter((s) => !s.dark).map((s) => slot(s.slot))}
        </div>
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium text-gray-700">Dark mode images</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {BRAND_SLOTS.filter((s) => s.dark).map((s) => slot(s.slot))}
          </div>
        </details>
      </section>

      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.label.toLowerCase()}?`}
          confirmLabel="Remove"
          busy={p.removeState === "running"}
          error={p.removeError}
          onConfirm={p.onConfirmRemove}
          onCancel={p.onCancelRemove}
        >
          <p>This image will no longer be shown to your clients.</p>
          {p.settings.whiteLabelEnabled && <p>Your brand will be switched off until a super admin approves it again.</p>}
        </ConfirmDialog>
      )}
    </div>
  );
}
