"use client";

import { useEffect, useRef, useState, type JSX } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchBrandSettings, formFromSettings, mapBrandError, preCheckFile, removeBrandAsset, saveBrandSettings, uploadBrandAsset,
  validateBrandForm, type BrandFormValues, type BrandSettings, type FormErrors, type SaveResult, type SlotName,
} from "@/lib/brand-settings";
import { confirmReducer, runConfirmed, type ConfirmState } from "@/lib/parent-orgs";
import { BrandingSettingsView, type SlotUiState } from "./BrandingSettingsView";

export const BRAND_SETTINGS_QUERY_KEY = ["brand-settings"] as const;

export function BrandingSettings(): JSX.Element {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: BRAND_SETTINGS_QUERY_KEY, queryFn: fetchBrandSettings, staleTime: 0 });
  const [values, setValues] = useState<BrandFormValues | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reapproval, setReapproval] = useState(false);
  const [origin, setOrigin] = useState<string | null>(null);
  const [slotState, setSlotState] = useState<Partial<Record<SlotName, SlotUiState>>>({});
  const [removeSlot, setRemoveSlot] = useState<SlotName | null>(null);
  const [removeState, setRemoveState] = useState<ConfirmState>("idle");
  const [removeError, setRemoveError] = useState<string | null>(null);
  const seeded = useRef(false);

  useEffect(() => { setOrigin(window.location.origin); }, []);
  useEffect(() => {
    if (data && !seeded.current) {
      seeded.current = true;
      setValues(formFromSettings(data));
    }
  }, [data]);

  if (isLoading || (data && !values)) return <div className="py-12 text-center text-sm text-gray-400">Loading...</div>;
  if (isError || !data || !values) return <div className="py-12 text-center text-sm text-red-600">Could not load your brand. Please reload the page.</div>;

  function applyResult(r: SaveResult) {
    qc.setQueryData<BrandSettings>(BRAND_SETTINGS_QUERY_KEY, r.data);
    if (r.reapprovalRequired) setReapproval(true);
  }

  function setSlot(slot: SlotName, s: SlotUiState) {
    setSlotState((prev) => ({ ...prev, [slot]: s }));
  }

  async function save() {
    if (!values) return;
    const found = validateBrandForm(values);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      applyResult(await saveBrandSettings(values));
    } catch (err) {
      const m = mapBrandError(err);
      if (m.field) setErrors({ [m.field]: m.message });
      else setFormError(m.message);
    } finally {
      setSaving(false);
    }
  }

  async function onFile(slot: SlotName, file: File) {
    const problem = preCheckFile(slot, { name: file.name, type: file.type, size: file.size });
    if (problem) {
      setSlot(slot, { busy: false, error: problem });
      return;
    }
    setSlot(slot, { busy: true, error: null });
    try {
      applyResult(await uploadBrandAsset(slot, file));
      setSlot(slot, { busy: false, error: null });
    } catch (err) {
      setSlot(slot, { busy: false, error: mapBrandError(err).message });
    }
  }

  async function confirmRemove() {
    const slot = removeSlot;
    if (!slot) return;
    const next = confirmReducer(removeState, "confirm");
    setRemoveState(next);
    setRemoveError(null);
    let ok = false;
    await runConfirmed(removeState, async () => {
      try {
        applyResult(await removeBrandAsset(slot));
        ok = true;
      } catch (err) {
        setRemoveError(mapBrandError(err).message);
      }
    });
    if (ok) {
      setRemoveSlot(null);
      setRemoveState(confirmReducer(next, "done"));
    } else {
      setRemoveState("confirming");
    }
  }

  return (
    <BrandingSettingsView
      settings={data}
      values={values}
      errors={errors}
      formError={formError}
      saving={saving}
      reapprovalRequired={reapproval}
      origin={origin}
      slotState={slotState}
      removeSlot={removeSlot}
      removeState={removeState}
      removeError={removeError}
      onChange={(patch) => { setValues({ ...values, ...patch }); setErrors({}); }}
      onSave={() => { void save(); }}
      onFile={(slot, file) => { void onFile(slot, file); }}
      onRequestRemove={(slot) => { setRemoveSlot(slot); setRemoveError(null); setRemoveState(confirmReducer("idle", "request")); }}
      onCancelRemove={() => { setRemoveSlot(null); setRemoveState("idle"); setRemoveError(null); }}
      onConfirmRemove={() => { void confirmRemove(); }}
    />
  );
}
