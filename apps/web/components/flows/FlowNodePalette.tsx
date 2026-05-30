"use client";

import { JSX } from "react";

interface PaletteItem {
  type: string;
  icon: string;
  label: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  new_conversation: "New Conversation",
  keyword_match:    "Keyword Match",
  contact_created:  "Contact Created",
  tag_added:        "Label Added",
  lifecycle_change: "Stage Changed",
  inbound_message:  "Incoming Message",
};

const ACTION_ITEMS: PaletteItem[] = [
  { type: "send_text",          icon: "💬", label: "Send Text" },
  { type: "send_image",         icon: "🖼️",  label: "Send Image" },
  { type: "send_video",         icon: "🎬", label: "Send Video" },
  { type: "send_document",      icon: "📎", label: "Send Document" },
  { type: "send_buttons",       icon: "🔘", label: "Send Buttons" },
  { type: "send_list",          icon: "📋", label: "Send List" },
  { type: "send_template",      icon: "📨", label: "Send Template" },
  { type: "cta_url",            icon: "🔗", label: "CTA URL Button" },
  { type: "ask_question",       icon: "❓", label: "Ask Question" },
  { type: "condition",          icon: "🔀", label: "Condition" },
  { type: "wait",               icon: "⏱️",  label: "Wait / Delay" },
  { type: "add_label",          icon: "🏷️",  label: "Add Label" },
  { type: "remove_label",       icon: "🗑️",  label: "Remove Label" },
  { type: "opt_in",             icon: "✔️",  label: "Opt In (Marketing)" },
  { type: "opt_out",            icon: "🚫", label: "Opt Out (Marketing)" },
  { type: "toggle_bot",         icon: "🤖", label: "Toggle Bot" },
  { type: "update_stage",       icon: "📈", label: "Update Stage" },
  { type: "assign_agent",       icon: "👤", label: "Assign Agent" },
  { type: "close_conversation", icon: "✅", label: "Close Chat" },
  { type: "end",                icon: "🔚", label: "End Flow" },
];

interface FlowNodePaletteProps {
  triggerType: string;
  onAddNode: (type: string) => void;
  onDragStart: (event: React.DragEvent, nodeType: string) => void;
}

export function FlowNodePalette({ triggerType, onAddNode, onDragStart }: FlowNodePaletteProps): JSX.Element {
  return (
    <aside className="w-60 h-full bg-white border-r border-gray-200 flex flex-col overflow-y-auto shrink-0">
      <div className="px-4 py-4 border-b border-gray-100">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Trigger</p>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-50 border border-brand-100">
          <span className="text-sm">⚡</span>
          <span className="text-sm font-medium text-brand-800 leading-tight">
            {TRIGGER_LABELS[triggerType] ?? triggerType.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      <div className="px-4 py-4 flex-1">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Actions</p>
        <div className="space-y-0.5">
          {ACTION_ITEMS.map((item) => (
            <button
              key={item.type}
              onClick={() => onAddNode(item.type)}
              draggable
              onDragStart={(e) => onDragStart(e, item.type)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-grab active:cursor-grabbing group"
            >
              <span className="text-sm leading-none">{item.icon}</span>
              <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors">
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
