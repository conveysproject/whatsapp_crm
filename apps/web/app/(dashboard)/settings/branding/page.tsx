"use client";

import type { JSX } from "react";
import { ParentGate } from "@/components/parent/ParentGate";
import { BrandingSettings } from "@/components/brand/settings/BrandingSettings";

/** Parent admins only (the API enforces it too); anyone else sees the same "not available" state as the Clients pages. */
export default function BrandingPage(): JSX.Element {
  return (
    <ParentGate>
      <BrandingSettings />
    </ParentGate>
  );
}
