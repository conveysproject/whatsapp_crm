"use client";

import { JSX, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWizard } from "../ImportWizard";
import { Button } from "@/components/ui/Button";
import type { ImportProgress } from "@WBMSG/shared";

export function Step4Progress(): JSX.Element {
  const { state, reset } = useWizard();
  const router = useRouter();
  const [progress, setProgress] = useState<ImportProgress>({
    processed: 0,
    total: state.totalRows,
    created: 0,
    updated: 0,
    skipped: 0,
    status: "pending",
  });
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const latestProgressRef = useRef(progress);

  useEffect(() => {
    if (!state.importJobId) return;
    let es: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let finished = false;

    function connect() {
      es = new EventSource(
        `${process.env["NEXT_PUBLIC_API_URL"]}/v1/contacts/import/${state.importJobId}/progress?token=${encodeURIComponent(state.importToken ?? "")}`
      );

      es.onmessage = (event: MessageEvent<string>) => {
        const data = JSON.parse(event.data) as Partial<ImportProgress> & { event?: string; status?: string };
        if (data.event === "done" || data.status === "completed" || data.status === "failed") {
          finished = true;
          es?.close();
          const isFailed = data.status === "failed";
          if (!isFailed) {
            const final = { ...latestProgressRef.current, ...data } as ImportProgress;
            setProgress({ ...final, status: "completed" });
          }
          setFailed(isFailed);
          setDone(true);
          return;
        }
        setProgress((prev) => {
          const next = { ...prev, ...data } as ImportProgress;
          latestProgressRef.current = next;
          return next;
        });
      };

      es.onerror = () => {
        es?.close();
        if (!finished) {
          reconnectTimeout = setTimeout(connect, 2000);
        }
      };
    }

    connect();

    return () => {
      finished = true;
      es?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.importJobId]);

  const percent = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
  const totalActioned = progress.created + progress.updated;
  const allSkipped = done && !failed && totalActioned === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">
          {done && !failed ? "Import complete" : failed ? "Import failed" : "Importing contacts…"}
        </h2>
        {!done && <p className="text-sm text-gray-500 mt-1">Keep this page open. Large files may take a few minutes.</p>}
      </div>

      {/* Progress bar — frozen when done */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>{progress.processed.toLocaleString()} of {progress.total.toLocaleString()} rows processed</span>
          <span className="font-medium">{percent}%</span>
        </div>
        <div className="h-3 rounded-full bg-gray-200 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${failed ? "bg-red-500" : "bg-brand-600"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Live counters */}
      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <div className="rounded-lg border border-gray-100 bg-green-50 p-3">
          <p className="text-xl font-bold text-green-700">{progress.created.toLocaleString()}</p>
          <p className="text-gray-500 text-xs mt-0.5">Created</p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-blue-50 p-3">
          <p className="text-xl font-bold text-blue-700">{progress.updated.toLocaleString()}</p>
          <p className="text-gray-500 text-xs mt-0.5">Updated</p>
        </div>
        <div className="rounded-lg border border-gray-100 p-3">
          <p className="text-xl font-bold text-gray-400">{progress.skipped.toLocaleString()}</p>
          <p className="text-gray-500 text-xs mt-0.5">Skipped</p>
        </div>
      </div>

      {/* Inline results after completion */}
      {done && !failed && (
        <div className="border-t border-gray-200 pt-5 space-y-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${allSkipped ? "bg-amber-100" : "bg-green-100"}`}>
            <span className={`text-xl font-bold ${allSkipped ? "text-amber-600" : "text-green-600"}`}>
              {allSkipped ? "!" : "✓"}
            </span>
          </div>
          <p className="text-sm text-gray-600">
            {allSkipped
              ? "No contacts were imported — all rows were skipped or had invalid phone numbers."
              : "Your contacts have been imported successfully."}
          </p>
          {(progress.errorCount ?? 0) > 0 && (
            <a
              href={`${process.env["NEXT_PUBLIC_API_URL"]}/v1/contacts/import/${state.importJobId}/errors?token=${encodeURIComponent(state.importToken ?? "")}`}
              download
              className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:text-red-800 font-medium underline"
            >
              Download {progress.errorCount} failed row{(progress.errorCount ?? 0) !== 1 ? "s" : ""} as CSV
            </a>
          )}
          <div className="flex gap-3">
            <Button onClick={() => router.push("/contacts")}>View Contacts</Button>
            <Button variant="secondary" onClick={reset}>Import Another File</Button>
          </div>
        </div>
      )}

      {failed && (
        <div className="border-t border-gray-200 pt-5">
          <p className="text-sm text-gray-500">An error occurred during processing. Please try again or contact support.</p>
        </div>
      )}
    </div>
  );
}
