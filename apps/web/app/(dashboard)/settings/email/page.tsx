"use client";

import type { JSX } from "react";
import { ParentGate } from "@/components/parent/ParentGate";
import { EmailSettings } from "@/components/email/settings/EmailSettings";

/** Parent admins only (the API enforces it too); anyone else sees the same "not available" state as the Clients pages. */
export default function EmailSettingsPage(): JSX.Element {
  return (
    <ParentGate>
      <EmailSettings />
    </ParentGate>
  );
}
