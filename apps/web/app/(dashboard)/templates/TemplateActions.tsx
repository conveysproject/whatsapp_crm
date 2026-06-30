"use client";
import { useState, useEffect, useRef, useCallback, type JSX } from "react";
import Link from "next/link";

interface Contact {
  id: string;
  name: string | null;
  phoneNumber: string;
  email: string | null;
}

interface TagStat {
  tag: string;
  count: number;
}

interface SendResult {
  contactId: string;
  name: string | null;
  ok: boolean;
  error?: string;
}

type ModalStep = "pick" | "media" | "confirm" | "sending" | "result";

const MAX_SELECT = 20;

export function TemplateActions({
  templateId,
  templateName,
  headerFormat,
  headerExampleUrl,
  imageCardCount = 0,
  status,
  onRefresh,
}: {
  templateId: string;
  templateName: string;
  headerFormat?: string;
  headerExampleUrl?: string;
  imageCardCount?: number;
  status?: string;
  onRefresh?: () => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showExamplePrompt, setShowExamplePrompt] = useState(false);
  const [exampleImageUrl, setExampleImageUrl] = useState("");

  const isMediaHeader = ["IMAGE", "VIDEO", "DOCUMENT"].includes(headerFormat?.toUpperCase() ?? "");
  // Only prompt if media header has no example URL already stored in components
  const needsExamplePrompt = isMediaHeader && !headerExampleUrl;

  function handleSubmitClick(): void {
    setActionError(null);
    if (needsExamplePrompt) {
      setShowExamplePrompt(true);
    } else {
      void handleSubmitToMeta();
    }
  }

  async function handleSubmitToMeta(imageUrl?: string): Promise<void> {
    setSubmitting(true);
    setActionError(null);
    try {
      const body = imageUrl ? JSON.stringify({ exampleImageUrl: imageUrl }) : undefined;
      const res = await fetch(`/api/v1/templates/${templateId}/submit`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body,
      });
      if (!res.ok) {
        const resBody = await res.json().catch(() => ({})) as { error?: { message?: string } };
        setActionError(resBody.error?.message ?? "Submit failed");
        return;
      }
      setShowExamplePrompt(false);
      onRefresh?.();
    } catch {
      setActionError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!confirm(`Delete "${templateName}"? This cannot be undone.`)) return;
    setDeleting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/v1/templates/${templateId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
        setActionError(body.error?.message ?? "Delete failed");
        return;
      }
      onRefresh?.();
    } catch {
      setActionError("Network error");
    } finally {
      setDeleting(false);
    }
  }

  const isDraft = status === "draft";

  return (
    <>
      {actionError && <span className="text-xs text-red-500 mr-1">{actionError}</span>}

      {/* Example image prompt for IMAGE/VIDEO/DOCUMENT header templates */}
      {showExamplePrompt && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowExamplePrompt(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900">Example {headerFormat} for Meta Review</h3>
            <p className="text-xs text-gray-500">
              Meta requires a sample image so reviewers can see how the template will look. Provide a publicly accessible image URL.
            </p>
            <input
              autoFocus
              type="url"
              placeholder="https://example.com/image.jpg"
              value={exampleImageUrl}
              onChange={(e) => setExampleImageUrl(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            {actionError && <p className="text-xs text-red-500">{actionError}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowExamplePrompt(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
              <button
                disabled={!exampleImageUrl.trim() || submitting}
                onClick={() => { void handleSubmitToMeta(exampleImageUrl.trim()); }}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded disabled:opacity-40 hover:bg-green-700"
              >
                {submitting ? "Submitting…" : "Submit to Meta"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isDraft ? (
        <>
          <Link
            href={`/templates/${templateId}/edit`}
            className="text-xs text-blue-600 hover:underline"
          >
            Edit
          </Link>
          <button
            onClick={handleSubmitClick}
            disabled={submitting}
            className="text-xs text-green-700 hover:text-green-900 px-2 py-1 border border-green-300 rounded disabled:opacity-40 font-medium"
          >
            {submitting ? "Submitting…" : "Submit to Meta"}
          </button>
          <button
            onClick={() => { void handleDelete(); }}
            disabled={deleting}
            className="text-xs text-red-400 hover:text-red-600 disabled:opacity-40"
          >
            {deleting ? "…" : "Delete"}
          </button>
        </>
      ) : (
        <>
          <Link href={`/templates/${templateId}/analytics`} className="text-xs text-blue-600 hover:underline">
            Analytics
          </Link>
          <button
            onClick={() => setOpen(true)}
            className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 border rounded"
          >
            Send to Contact
          </button>
        </>
      )}
      {open && <SendModal templateId={templateId} templateName={templateName} headerFormat={headerFormat} imageCardCount={imageCardCount} onClose={() => setOpen(false)} />}
    </>
  );
}

function SendModal({ templateId, templateName, headerFormat, imageCardCount = 0, onClose }: { templateId: string; templateName: string; headerFormat?: string; imageCardCount?: number; onClose: () => void }): JSX.Element {
  const [step, setStep] = useState<ModalStep>("pick");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [tags, setTags] = useState<TagStat[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [contactsError, setContactsError] = useState(false);
  const [results, setResults] = useState<SendResult[]>([]);
  const [mediaUrl, setMediaUrl] = useState("");
  const [cardMediaUrls, setCardMediaUrls] = useState<string[]>(() => Array(imageCardCount).fill(""));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load all tags once on open
  useEffect(() => {
    fetch("/api/v1/tags")
      .then((r) => r.json())
      .then((body: { data: TagStat[] }) => setTags(body.data ?? []))
      .catch(() => {});
  }, []);

  const fetchContacts = useCallback((q: string, tf: string): void => {
    // Don't fetch until user has typed or picked a tag
    if (!q.trim() && !tf) {
      setContacts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setContactsError(false);

    const params = new URLSearchParams({ limit: "20" });
    if (q.trim()) params.set("q", q.trim());
    if (tf) params.set("tag", tf);

    fetch(`/api/v1/contacts?${params.toString()}`)
      .then((r) => r.json())
      .then((body: { data: Contact[] }) => setContacts(body.data ?? []))
      .catch(() => setContactsError(true))
      .finally(() => setLoading(false));
  }, []);

  // Debounce search; react immediately to tag changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchContacts(search, tagFilter), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, tagFilter, fetchContacts]);

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_SELECT) {
        next.add(id);
      }
      return next;
    });
  }

  async function handleSend(): Promise<void> {
    setStep("sending");
    const targets = contacts.filter((c) => selected.has(c.id));
    const settled = await Promise.allSettled(
      targets.map((c) =>
        fetch(`/api/v1/templates/${templateId}/send-to-contact`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId: c.id,
            variables: [],
            ...(mediaUrl ? { mediaUrl } : {}),
            ...(cardMediaUrls.some((u) => u) ? { cardMediaUrls } : {}),
          }),
        }).then(async (r) => {
          if (r.ok) return { c, ok: true as const, error: undefined };
          const body = await r.json().catch(() => ({})) as { error?: { message?: string } };
          return { c, ok: false as const, error: body.error?.message ?? "Failed to send" };
        })
      )
    );
    const res: SendResult[] = settled.map((s, i) => ({
      contactId: targets[i].id,
      name: targets[i].name,
      ok: s.status === "fulfilled" && s.value.ok,
      error: s.status === "fulfilled" ? s.value.error : "Request failed",
    }));
    setResults(res);
    setStep("result");
    if (res.every((r) => r.ok)) {
      setTimeout(onClose, 2000);
    }
  }

  const selectedContacts = contacts.filter((c) => selected.has(c.id));
  const atMax = selected.size >= MAX_SELECT;

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md flex flex-col"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b">
          <h3 className="font-semibold text-sm text-gray-900">
            Send &quot;{templateName}&quot; to Contacts
          </h3>
        </div>

        {/* Pick step */}
        {step === "pick" && (
          <>
            <div className="px-5 pt-4 space-y-2">
              <input
                autoFocus
                className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                placeholder="Search by name or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="w-full border rounded px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-green-500"
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
              >
                <option value="">All tags</option>
                {tags.map(({ tag }) => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>

            {/* Contact list */}
            <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0" style={{ maxHeight: 300 }}>
              {loading && (
                <p className="text-xs text-gray-400 text-center py-6">Loading...</p>
              )}
              {!loading && contactsError && (
                <div className="text-center py-6">
                  <p className="text-xs text-red-500 mb-2">Could not load contacts.</p>
                  <button
                    className="text-xs text-green-600 underline"
                    onClick={() => fetchContacts(search, tagFilter)}
                  >
                    Retry
                  </button>
                </div>
              )}
              {!loading && !contactsError && contacts.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6">
                  {search.trim() || tagFilter ? "No contacts found." : "Type a name or phone number to search."}
                </p>
              )}
              {!loading && !contactsError && contacts.map((c) => {
                const checked = selected.has(c.id);
                const disabled = !checked && atMax;
                return (
                  <label
                    key={c.id}
                    className={`flex items-center gap-3 py-2 px-1 rounded cursor-pointer hover:bg-gray-50 ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(c.id)}
                      className="accent-green-600 w-4 h-4 shrink-0"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-800 truncate">
                        {c.name ?? "Unnamed"}
                      </span>
                      <span className="block text-xs text-gray-400">{c.phoneNumber}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t flex items-center justify-between gap-3">
              <span className="text-xs text-gray-500">
                {selected.size} selected
                {atMax && <span className="text-orange-500 ml-1">(max {MAX_SELECT})</span>}
              </span>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  disabled={selected.size === 0}
                  onClick={() => setStep(headerFormat || imageCardCount > 0 ? "media" : "confirm")}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded disabled:opacity-40 hover:bg-green-700"
                >
                  Next →
                </button>
              </div>
            </div>
          </>
        )}

        {/* Media URL step — shown for IMAGE/VIDEO/DOCUMENT header templates and carousels */}
        {step === "media" && (
          <div className="px-5 py-6 flex flex-col gap-4">
            {imageCardCount > 0 ? (
              <>
                <p className="text-sm text-gray-700">
                  This carousel has <span className="font-semibold">{imageCardCount}</span> image card{imageCardCount !== 1 ? "s" : ""}. Provide a publicly accessible image URL for each:
                </p>
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {Array.from({ length: imageCardCount }, (_, i) => (
                    <div key={i}>
                      <label className="block text-xs text-gray-500 mb-1">Card {i + 1} image URL</label>
                      <input
                        autoFocus={i === 0}
                        type="url"
                        placeholder="https://example.com/image.jpg"
                        value={cardMediaUrls[i] ?? ""}
                        onChange={(e) => {
                          const next = [...cardMediaUrls];
                          next[i] = e.target.value;
                          setCardMediaUrls(next);
                        }}
                        className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                      />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-700">
                  This template has a <span className="font-semibold">{headerFormat}</span> header. Provide a publicly accessible URL:
                </p>
                <input
                  autoFocus
                  type="url"
                  placeholder="https://example.com/image.jpg"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </>
            )}
            <div className="flex gap-2 pt-2">
              <button onClick={() => setStep("pick")} className="flex-1 py-2 text-sm border rounded hover:bg-gray-50">
                Back
              </button>
              <button
                disabled={
                  imageCardCount > 0
                    ? cardMediaUrls.slice(0, imageCardCount).some((u) => !u.trim())
                    : !mediaUrl.trim()
                }
                onClick={() => setStep("confirm")}
                className="flex-1 py-2 text-sm bg-green-600 text-white rounded disabled:opacity-40 hover:bg-green-700"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Confirm step */}
        {step === "confirm" && (
          <div className="px-5 py-6 flex flex-col gap-4">
            <p className="text-sm text-gray-700">
              Send <span className="font-semibold">&quot;{templateName}&quot;</span> to{" "}
              <span className="font-semibold">{selected.size} contact{selected.size !== 1 ? "s" : ""}</span>?
            </p>
            <ul className="text-xs text-gray-500 space-y-1 max-h-40 overflow-y-auto">
              {selectedContacts.map((c) => (
                <li key={c.id}>{c.name ?? "Unnamed"} — {c.phoneNumber}</li>
              ))}
            </ul>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setStep(headerFormat || imageCardCount > 0 ? "media" : "pick")} className="flex-1 py-2 text-sm border rounded hover:bg-gray-50">
                Back
              </button>
              <button
                onClick={() => { void handleSend(); }}
                className="flex-1 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700"
              >
                Confirm
              </button>
            </div>
          </div>
        )}

        {/* Sending step */}
        {step === "sending" && (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-gray-600">
              Sending to {selected.size} contact{selected.size !== 1 ? "s" : ""}...
            </p>
          </div>
        )}

        {/* Result step */}
        {step === "result" && (
          <div className="px-5 py-6 flex flex-col gap-4">
            {results.every((r) => r.ok) ? (
              <p className="text-sm text-green-600 font-medium text-center">
                Sent to {results.length} contact{results.length !== 1 ? "s" : ""}!
              </p>
            ) : (
              <>
                <p className="text-sm text-gray-700">
                  Sent to {results.filter((r) => r.ok).length}/{results.length} contacts.
                </p>
                <ul className="text-xs space-y-2 max-h-48 overflow-y-auto">
                  {results.map((r) => (
                    <li key={r.contactId}>
                      <span className={r.ok ? "text-green-600" : "text-red-500"}>
                        {r.ok ? "✓" : "✗"} {r.name ?? "Unnamed"}
                      </span>
                      {!r.ok && r.error && (
                        <span className="block pl-4 text-red-400 mt-0.5">{r.error}</span>
                      )}
                    </li>
                  ))}
                </ul>
                <button onClick={onClose} className="mt-2 px-4 py-2 text-sm border rounded hover:bg-gray-50 self-end">
                  Close
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
