import type { JSX } from "react";

/** Marks a feature that was added recently. Used for new nav entries and settings. */
export function NewBadge(): JSX.Element {
  return (
    <span className="ml-auto inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-800">
      New
    </span>
  );
}
