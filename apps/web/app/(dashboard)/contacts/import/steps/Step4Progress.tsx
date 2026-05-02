"use client";

import { JSX, useEffect, useRef, useState } from "react";
import { useWizard } from "../ImportWizard";
import type { ImportProgress } from "@trustcrm/shared";

export function Step4Progress(): JSX.Element {
  const { state, setState, nextStep } = useWizard();
  const [progress, setProgress] = useState<ImportProgress>({
    processed: 0,
    total: state.totalRows,
    created: 0,
    updated: 0,
    skipped: 0,
    status: "pending",
  });
  const [failed, setFailed] = useState(false);
  const latestProgressRef = useRef(progress);

  useEffect(() => {
    if (!state.importJobId) return;
    let es: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let done = false;

    function connect() {
      es = new EventSource(
        `${process.env["NEXT_PUBLIC_API_URL"]}/v1/contacts/import/${state.importJobId}/progress?token=${encodeURIComponent(state.importToken ?? "")}`
      );

      es.onmessage = (event: MessageEvent<string>) => {
        const data = JSON.parse(event.data) as Partial<ImportProgress> & { event?: string; status?: string };
        if (data.event === "done") {
          done = true;
          es?.close();
          if (data.status === "failed") {
            setFailed(true);
          } else {
            setState({
              importSummary: {
                processed: (data.processed as number | undefined) ?? latestProgressRef.current.processed,
                total: (data.total as number | undefined) ?? latestProgressRef.current.total,
                created: (data.created as number | undefined) ?? latestProgressRef.current.created,
                updated: (data.updated as number | undefined) ?? latestProgressRef.current.updated,
                skipped: (data.skipped as number | undefined) ?? latestProgressRef.current.skipped,
                status: "completed",
              },
            });
            nextStep();
          }
          return;
        }
        // Fallback: plain progress message with a terminal status (e.g. backend version mismatch)
        if (data.status === "completed" || data.status === "failed") {
          done = true;
          es?.close();
          if (data.status === "failed") {
            setFailed(true);
          } else {
            const next = { ...latestProgressRef.current, ...data } as ImportProgress;
            setState({ importSummary: { ...next, status: "completed" } });
            nextStep();
          }
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
        if (!done) {
          reconnectTimeout = setTimeout(connect, 2000);
        }
      };
    }

    connect();

    return () => {
      done = true;
      es?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.importJobId]);

  const percent = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  if (failed) {
    return (
      <div className="space-y-4 text-center py-4">
        <p className="text-red-600 font-medium text-lg">Import failed</p>
        <p className="text-sm text-gray-500">An error occurred during processing. Please try again or contact support.</p>
        <p className="text-sm text-gray-400">
          Partial results — Created: {progress.created.toLocaleString()} · Updated: {progress.updated.toLocaleString()} · Skipped: {progress.skipped.toLocaleString()}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Importing contacts…</h2>
        <p className="text-sm text-gray-500 mt-1">Keep this page open. Large files may take a few minutes.</p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>{progress.processed.toLocaleString()} of {progress.total.toLocaleString()} rows processed</span>
          <span className="font-medium">{percent}%</span>
        </div>
        <div className="h-3 rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full bg-brand-600 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

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
    </div>
  );
}
