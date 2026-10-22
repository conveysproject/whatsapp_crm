import type { JSX } from "react";
import { REAPPROVAL_WARNING, type BannerState } from "@/lib/brand-settings";

/** Where the brand stands: waiting for a super admin, live for clients, or switched off by a change. */
export function BrandStatusBanner({ state }: { state: BannerState }): JSX.Element {
  if (state === "reapproval") {
    return (
      <div role="alert" data-status="reapproval" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Pending approval</p>
        <p className="mt-1">{REAPPROVAL_WARNING}</p>
      </div>
    );
  }
  if (state === "live") {
    return (
      <div data-status="live" className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900">
        <p className="font-medium">Live</p>
        <p className="mt-1">Your brand is approved and your clients see it. Changing the name, web address or an image switches it off until it is approved again.</p>
      </div>
    );
  }
  return (
    <div data-status="pending" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-medium">Pending approval</p>
      <p className="mt-1">A super admin must approve your brand before your clients see it. Until then your clients see the standard look.</p>
    </div>
  );
}
