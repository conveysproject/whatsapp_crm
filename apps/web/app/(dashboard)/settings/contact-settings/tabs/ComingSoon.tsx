import { JSX } from "react";

export default function ComingSoon({ label }: { label: string }): JSX.Element {
  return (
    <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
      <p className="text-sm font-medium text-gray-900">{label}</p>
      <p className="text-xs text-gray-400 mt-1">Coming soon.</p>
    </div>
  );
}
