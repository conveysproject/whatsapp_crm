"use client";

import { useState, useCallback, useEffect, JSX } from "react";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/Button";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Slot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface DayRow {
  dayOfWeek: number;
  label: string;
  enabled: boolean;
  slots: Array<{ startTime: string; endTime: string }>;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function slotsToRows(slots: Slot[]): DayRow[] {
  const rows: DayRow[] = DAY_LABELS.map((label, i) => ({
    dayOfWeek: i,
    label,
    enabled: false,
    slots: [],
  }));
  for (const s of slots) {
    const row = rows[s.dayOfWeek];
    if (row) {
      row.enabled = true;
      row.slots.push({ startTime: s.startTime, endTime: s.endTime });
    }
  }
  // Ensure each enabled row has at least one slot
  for (const row of rows) {
    if (row.enabled && row.slots.length === 0) {
      row.slots.push({ startTime: "09:00", endTime: "18:00" });
    }
  }
  return rows;
}

function rowsToSlots(rows: DayRow[]): Slot[] {
  return rows
    .filter((r) => r.enabled)
    .flatMap((r) =>
      r.slots.map((s) => ({ dayOfWeek: r.dayOfWeek, startTime: s.startTime, endTime: s.endTime }))
    );
}

const DEFAULT_ROWS: DayRow[] = DAY_LABELS.map((label, i) => ({
  dayOfWeek: i,
  label,
  enabled: i >= 1 && i <= 5, // Mon–Fri enabled by default
  slots: [{ startTime: "09:00", endTime: "18:00" }],
}));

export function BusinessHoursCard(): JSX.Element {
  const { getToken } = useAuth();
  const [rows, setRows] = useState<DayRow[]>(DEFAULT_ROWS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/v1/automation/business-hours`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (res.ok) {
          const body = await res.json() as { data: Array<{ id: string; dayOfWeek: number; startTime: string; endTime: string }> };
          if (body.data.length > 0) {
            setRows(slotsToRows(body.data));
          }
        }
      } catch {
        // silently fall back to defaults
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleDay = useCallback((dayIndex: number) => {
    setRows((prev) =>
      prev.map((r) =>
        r.dayOfWeek === dayIndex
          ? {
              ...r,
              enabled: !r.enabled,
              slots: r.slots.length === 0 ? [{ startTime: "09:00", endTime: "18:00" }] : r.slots,
            }
          : r
      )
    );
    setSaved(false);
  }, []);

  const updateSlot = useCallback(
    (dayIndex: number, slotIndex: number, field: "startTime" | "endTime", value: string) => {
      setRows((prev) =>
        prev.map((r) =>
          r.dayOfWeek === dayIndex
            ? {
                ...r,
                slots: r.slots.map((s, i) => (i === slotIndex ? { ...s, [field]: value } : s)),
              }
            : r
        )
      );
      setSaved(false);
    },
    []
  );

  const addSlot = useCallback((dayIndex: number) => {
    setRows((prev) =>
      prev.map((r) =>
        r.dayOfWeek === dayIndex
          ? { ...r, slots: [...r.slots, { startTime: "09:00", endTime: "18:00" }] }
          : r
      )
    );
    setSaved(false);
  }, []);

  const removeSlot = useCallback((dayIndex: number, slotIndex: number) => {
    setRows((prev) =>
      prev.map((r) =>
        r.dayOfWeek === dayIndex
          ? { ...r, slots: r.slots.filter((_, i) => i !== slotIndex) }
          : r
      )
    );
    setSaved(false);
  }, []);

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const slots = rowsToSlots(rows);
      const res = await fetch(`${API_URL}/v1/automation/business-hours`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ slots }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Save failed");
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-card p-6">
        <p className="text-sm text-gray-400">Loading business hours…</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-card p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-1">Business Hours</h2>
      <p className="text-sm text-gray-500 mb-4">
        Define when your team is available. OOO and Delayed Response use this schedule.
      </p>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.dayOfWeek} className="flex flex-col gap-2">
            <div className="flex items-start gap-3">
              {/* Day toggle */}
              <button
                type="button"
                onClick={() => toggleDay(row.dayOfWeek)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 mt-1 ${
                  row.enabled ? "bg-green-500" : "bg-gray-200"
                }`}
                aria-label={`Toggle ${row.label}`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    row.enabled ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
              <span className="w-8 text-sm font-medium text-gray-700 mt-0.5">{row.label}</span>

              {row.enabled ? (
                <div className="flex flex-col gap-1 flex-1">
                  {row.slots.map((slot, si) => (
                    <div key={si} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={slot.startTime}
                        onChange={(e) => updateSlot(row.dayOfWeek, si, "startTime", e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      <span className="text-gray-400 text-sm">to</span>
                      <input
                        type="time"
                        value={slot.endTime}
                        onChange={(e) => updateSlot(row.dayOfWeek, si, "endTime", e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                      {row.slots.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSlot(row.dayOfWeek, si)}
                          className="text-gray-400 hover:text-red-500 transition-colors text-xs px-1"
                          aria-label="Remove slot"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addSlot(row.dayOfWeek)}
                    className="text-xs text-brand-600 hover:underline text-left mt-0.5"
                  >
                    + Add slot
                  </button>
                </div>
              ) : (
                <span className="text-sm text-gray-400 italic mt-0.5">Closed</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

      <div className="mt-5 flex items-center gap-3">
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {saved && <span className="text-sm text-green-600">Saved!</span>}
      </div>
    </div>
  );
}
