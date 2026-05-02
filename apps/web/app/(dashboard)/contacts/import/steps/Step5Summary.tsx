"use client";

import { JSX } from "react";
import { useRouter } from "next/navigation";
import { useWizard } from "../ImportWizard.js";
import { Button } from "@/components/ui/Button";

export function Step5Summary(): JSX.Element {
  const { state, reset } = useWizard();
  const router = useRouter();

  const summary = state.importSummary;

  return (
    <div className="space-y-6 text-center py-2">
      <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
        <span className="text-green-600 text-2xl font-bold">✓</span>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-gray-900">Import complete</h2>
        <p className="text-sm text-gray-500 mt-1">Your contacts have been imported successfully.</p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center text-sm">
        <div className="rounded-lg border border-gray-100 bg-green-50 p-4">
          <p className="text-2xl font-bold text-green-700">{(summary?.created ?? 0).toLocaleString()}</p>
          <p className="text-gray-500 mt-0.5">Created</p>
        </div>
        <div className="rounded-lg border border-gray-100 bg-blue-50 p-4">
          <p className="text-2xl font-bold text-blue-700">{(summary?.updated ?? 0).toLocaleString()}</p>
          <p className="text-gray-500 mt-0.5">Updated</p>
        </div>
        <div className="rounded-lg border border-gray-100 p-4">
          <p className="text-2xl font-bold text-gray-400">{(summary?.skipped ?? 0).toLocaleString()}</p>
          <p className="text-gray-500 mt-0.5">Skipped</p>
        </div>
      </div>

      <div className="flex justify-center gap-3 pt-2">
        <Button onClick={() => router.push("/contacts")}>
          View Contacts
        </Button>
        <Button onClick={reset}>
          Import Another File
        </Button>
      </div>
    </div>
  );
}
