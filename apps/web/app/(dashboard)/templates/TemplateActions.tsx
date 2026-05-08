"use client";
import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";

interface Props {
  templateId: string;
  templateName: string;
}

export function TemplateActions({ templateId, templateName }: Props): JSX.Element {
  const [showModal, setShowModal] = useState(false);
  const [contactId, setContactId] = useState("");
  const [sent, setSent] = useState(false);

  const sendToContact = useMutation({
    mutationFn: () =>
      fetch(`/api/v1/templates/${templateId}/send-to-contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, variables: [] }),
      }).then((r) => r.json()),
    onSuccess: () => {
      setSent(true);
      setTimeout(() => { setShowModal(false); setSent(false); setContactId(""); }, 1500);
    },
  });

  return (
    <>
      <Link href={`/templates/${templateId}/analytics`} className="text-xs text-blue-600 hover:underline">
        Analytics
      </Link>
      <button
        onClick={() => setShowModal(true)}
        className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 border rounded"
      >
        Send to Contact
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-lg p-6 max-w-sm w-full space-y-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-sm">Send &quot;{templateName}&quot; to Contact</h3>
            {sent ? (
              <p className="text-green-600 text-sm text-center py-2">Sent successfully!</p>
            ) : (
              <>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="Contact ID"
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => sendToContact.mutate()}
                    disabled={!contactId || sendToContact.isPending}
                    className="flex-1 py-2 bg-green-600 text-white text-sm rounded disabled:opacity-50"
                  >
                    {sendToContact.isPending ? "Sending..." : "Send"}
                  </button>
                  <button onClick={() => setShowModal(false)} className="flex-1 py-2 border text-sm rounded">
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
