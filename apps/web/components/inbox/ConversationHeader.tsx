"use client";

import { JSX, useState, useRef, useEffect } from "react";
import type { Conversation } from "@/hooks/useConversations";

const STATUS_OPTIONS = [
  { value: "open", label: "Open", color: "text-green-600" },
  { value: "pending", label: "Pending", color: "text-amber-600" },
  { value: "resolved", label: "Resolved", color: "text-gray-400" },
] as const;

interface Props {
  conversation: Conversation;
  contact: { id: string; firstName: string | null; lastName: string | null; phoneNumber: string; tags: string[] } | null;
  contactName: string;
  onToggleContactPanel: () => void;
  onStatusChange: (status: string) => Promise<void>;
}

export function ConversationHeader({ conversation, contact, contactName, onToggleContactPanel, onStatusChange }: Props): JSX.Element {
  const [statusOpen, setStatusOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setStatusOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleStatusSelect(value: string) {
    setStatusOpen(false);
    setUpdating(true);
    try {
      await onStatusChange(value);
    } finally {
      setUpdating(false);
    }
  }

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === conversation.status) ?? STATUS_OPTIONS[0];

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-green-700">
            {(contactName)[0]?.toUpperCase() ?? "?"}
          </span>
        </div>

        {/* Name + status + tags */}
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{contactName}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {/* Status dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setStatusOpen((v) => !v)}
                disabled={updating}
                className={`text-xs capitalize font-medium ${currentStatus?.color ?? "text-gray-500"} hover:underline disabled:opacity-50`}
              >
                {updating ? "…" : (currentStatus?.label ?? conversation.status)} ▾
              </button>
              {statusOpen && (
                <div className="absolute top-full left-0 mt-1 w-32 bg-white rounded-lg border border-gray-200 shadow-lg z-20 overflow-hidden">
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => { void handleStatusSelect(opt.value); }}
                      className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-gray-50 ${opt.color} ${conversation.status === opt.value ? "bg-gray-50" : ""}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tag pills */}
            {contact?.tags && contact.tags.length > 0 && (
              <>
                <span className="text-gray-200">·</span>
                {contact.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="inline-flex items-center h-4 px-1.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">{tag}</span>
                ))}
                {contact.tags.length > 3 && (
                  <span className="text-[10px] text-gray-400">+{contact.tags.length - 3}</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action icons */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Assign placeholder */}
        <button
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title="Assign (coming soon)"
          disabled
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </button>

        {/* Toggle contact panel */}
        <button
          onClick={onToggleContactPanel}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title="Contact details"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
