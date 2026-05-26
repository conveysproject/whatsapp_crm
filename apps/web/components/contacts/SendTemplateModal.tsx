"use client";

import { JSX } from "react";
import { TemplatePicker } from "@/components/inbox/TemplatePicker";

interface Props {
  contactId: string;
  onClose: () => void;
  onSent: () => void;
}

export function SendTemplateModal({ contactId, onClose, onSent }: Props): JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-start p-6 pointer-events-none">
      <div className="pointer-events-auto relative w-[420px]">
        <TemplatePicker contactId={contactId} onSent={onSent} onClose={onClose} />
      </div>
    </div>
  );
}
