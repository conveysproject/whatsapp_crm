"use client";

import { JSX, useState, useRef, useEffect } from "react";
import type { Conversation } from "@/hooks/useConversations";
import { useInboxLabels } from "@/hooks/useInboxLabels";

const STATUS_OPTIONS = [
  { value: "open", label: "Open", color: "text-green-600" },
  { value: "pending", label: "Pending", color: "text-amber-600" },
  { value: "resolved", label: "Resolved", color: "text-gray-400" },
] as const;

const NAME_RE = /^[a-zA-Z0-9 -]{1,22}$/;

export interface Agent {
  id: string;
  fullName: string;
  email: string;
}

interface Props {
  conversation: Conversation;
  contact: { id: string; firstName: string | null; lastName: string | null; phoneNumber: string; tags: string[] } | null;
  contactName: string;
  agents: Agent[];
  onStatusChange: (status: string) => Promise<void>;
  onLabelChange: (name: string | null) => Promise<void>;
  onAssign: (userId: string | null) => Promise<void>;
}

export function ConversationHeader({
  conversation,
  contact,
  contactName,
  agents,
  onStatusChange,
  onLabelChange,
  onAssign,
}: Props): JSX.Element {
  const [statusOpen, setStatusOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const [labelQuery, setLabelQuery] = useState("");
  const [labelUpdating, setLabelUpdating] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignQuery, setAssignQuery] = useState("");
  const [assigning, setAssigning] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const assignRef = useRef<HTMLDivElement>(null);
  const { data: allLabels = [] } = useInboxLabels();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
      if (labelRef.current && !labelRef.current.contains(e.target as Node)) {
        setLabelOpen(false);
        setLabelQuery("");
      }
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) {
        setAssignOpen(false);
        setAssignQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleAssignSelect(userId: string | null) {
    setAssignOpen(false);
    setAssignQuery("");
    setAssigning(true);
    try { await onAssign(userId); } finally { setAssigning(false); }
  }

  const currentAssignee = agents.find((a) => a.id === conversation.assignedTo) ?? null;
  const filteredAgents = assignQuery.trim()
    ? agents.filter((a) => a.fullName.toLowerCase().includes(assignQuery.toLowerCase()) || a.email.toLowerCase().includes(assignQuery.toLowerCase()))
    : agents;

  async function handleStatusSelect(value: string) {
    setStatusOpen(false);
    setUpdating(true);
    try { await onStatusChange(value); } finally { setUpdating(false); }
  }

  async function handleLabelSelect(name: string) {
    setLabelOpen(false);
    setLabelQuery("");
    setLabelUpdating(true);
    try { await onLabelChange(name); } finally { setLabelUpdating(false); }
  }

  async function handleLabelClear() {
    setLabelUpdating(true);
    try { await onLabelChange(null); } finally { setLabelUpdating(false); }
  }

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === conversation.status) ?? STATUS_OPTIONS[0];
  const currentLabel = conversation.label ?? null;

  const filteredLabels = labelQuery.trim()
    ? allLabels.filter((l) => l.name.toLowerCase().includes(labelQuery.toLowerCase()))
    : allLabels;

  const trimmedQuery = labelQuery.trim();
  const showCreate = trimmedQuery.length > 0
    && NAME_RE.test(trimmedQuery)
    && !allLabels.some((l) => l.name.toLowerCase() === trimmedQuery.toLowerCase());

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-200 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center shrink-0">
          <span className="text-xs font-semibold text-green-700">
            {(contactName)[0]?.toUpperCase() ?? "?"}
          </span>
        </div>

        {/* Name + status + tags + label */}
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{contactName}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {/* Status dropdown */}
            <div className="relative" ref={statusRef}>
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

            {/* Conversation label */}
            {currentLabel && <span className="text-gray-200">·</span>}
            <div className="relative" ref={labelRef}>
              {currentLabel ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setLabelOpen((v) => !v); setLabelQuery(""); }}
                    disabled={labelUpdating}
                    className="inline-flex items-center gap-1 h-4 px-1.5 rounded-full text-[10px] font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: currentLabel.color }}
                  >
                    {currentLabel.name}
                  </button>
                  <button
                    onClick={() => { void handleLabelClear(); }}
                    disabled={labelUpdating}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                    title="Clear label"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setLabelOpen((v) => !v); setLabelQuery(""); }}
                  disabled={labelUpdating}
                  className="text-[10px] text-gray-400 hover:text-gray-600 disabled:opacity-50"
                >
                  {labelUpdating ? "…" : "+ Add label"}
                </button>
              )}

              {labelOpen && (
                <div className="absolute top-full left-0 mt-1 w-52 bg-white rounded-lg border border-gray-200 shadow-lg z-20">
                  <div className="p-2">
                    <input
                      autoFocus
                      value={labelQuery}
                      onChange={(e) => setLabelQuery(e.target.value.slice(0, 22))}
                      placeholder="Search or create label…"
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {filteredLabels.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => { void handleLabelSelect(l.name); }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-gray-50"
                      >
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                        {l.name}
                      </button>
                    ))}
                    {showCreate && (
                      <button
                        onClick={() => { void handleLabelSelect(trimmedQuery); }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-gray-50 text-brand-600 font-medium border-t border-gray-100"
                      >
                        + Create &quot;{trimmedQuery}&quot;
                      </button>
                    )}
                    {filteredLabels.length === 0 && !showCreate && (
                      <p className="px-3 py-2 text-xs text-gray-400">No labels found</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action icons */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Assign dropdown */}
        <div className="relative" ref={assignRef}>
          <button
            onClick={() => { setAssignOpen((v) => !v); setAssignQuery(""); }}
            disabled={assigning}
            title={currentAssignee ? `Assigned to ${currentAssignee.fullName}` : "Assign agent"}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${
              currentAssignee
                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            }`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {assigning ? "…" : (currentAssignee ? currentAssignee.fullName.split(" ")[0] : "Assign")}
          </button>
          {assignOpen && (
            <div className="absolute top-full right-0 mt-1 w-56 bg-white rounded-lg border border-gray-200 shadow-lg z-20">
              <div className="p-2">
                <input
                  autoFocus
                  value={assignQuery}
                  onChange={(e) => setAssignQuery(e.target.value)}
                  placeholder="Search agents…"
                  className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div className="max-h-48 overflow-y-auto">
                {currentAssignee && (
                  <button
                    onClick={() => { void handleAssignSelect(null); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-gray-50 text-red-500"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Unassign
                  </button>
                )}
                {filteredAgents.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400">No agents found</p>
                ) : (
                  filteredAgents.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => { void handleAssignSelect(a.id); }}
                      className={`flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-gray-50 ${conversation.assignedTo === a.id ? "bg-emerald-50 text-emerald-700 font-medium" : "text-gray-700"}`}
                    >
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-semibold shrink-0 text-[10px]">
                        {a.fullName.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate">{a.fullName}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
