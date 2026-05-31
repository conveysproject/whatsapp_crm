"use client";
import { JSX, useState } from "react";
import { useQuery } from "@tanstack/react-query";

type Tab = "all" | "messages" | "deals";

interface MessageItem {
  id: string;
  body: string | null;
  direction: string;
  createdAt: string;
}

interface DealItem {
  id: string;
  title: string;
  stage: string;
  createdAt: string;
}

type TimelineItem =
  | { type: "message"; id: string; body: string | null; direction: string; createdAt: string }
  | { type: "deal"; id: string; title: string; stage: string; createdAt: string };

interface TemplateParsed {
  templateName?: string;
  header?: { format?: string; text?: string | null } | null;
  body?: string | null;
  footer?: string | null;
  buttons?: Array<{ type?: string; text?: string }>;
}

interface InteractiveParsed {
  header?: { text?: string } | null;
  body?: { text?: string } | null;
  footer?: { text?: string } | null;
  action?: {
    buttons?: Array<{ reply?: { title?: string } }>;
    sections?: Array<{ rows?: Array<{ title?: string }> }>;
  };
}

function parseBody(body: string | null): { kind: "template"; parsed: TemplateParsed } | { kind: "interactive"; parsed: InteractiveParsed } | { kind: "text"; text: string } {
  if (!body) return { kind: "text", text: "" };
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (typeof parsed.templateName === "string") return { kind: "template", parsed: parsed as TemplateParsed };
    if (parsed.body && typeof parsed.body === "object") return { kind: "interactive", parsed: parsed as InteractiveParsed };
  } catch { /* not JSON */ }
  return { kind: "text", text: body };
}

function MessageBody({ body }: { body: string | null }): JSX.Element {
  const parsed = parseBody(body);

  if (parsed.kind === "template") {
    const { header, body: bodyText, footer, buttons = [] } = parsed.parsed;
    return (
      <div className="flex flex-col gap-1">
        {header?.text && <p className="font-semibold text-gray-900 text-sm leading-snug">{header.text}</p>}
        {bodyText && <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{bodyText}</p>}
        {footer && <p className="text-xs text-gray-400">{footer}</p>}
        {buttons.length > 0 && (
          <div className="flex flex-col gap-1 mt-1 border-t border-gray-200 pt-1">
            {buttons.map((btn, i) => (
              <div key={i} className="text-center text-xs text-[#00a884] font-medium py-0.5 border border-[#00a884]/30 rounded-lg">
                {btn.text ?? "Button"}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (parsed.kind === "interactive") {
    const { header, body: bodyObj, footer, action } = parsed.parsed;
    const replyButtons = action?.buttons ?? [];
    return (
      <div className="flex flex-col gap-1">
        {header?.text && <p className="font-semibold text-gray-900 text-sm leading-snug">{header.text}</p>}
        {bodyObj?.text && <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{bodyObj.text}</p>}
        {footer?.text && <p className="text-xs text-gray-400">{footer.text}</p>}
        {replyButtons.length > 0 && (
          <div className="flex flex-col gap-1 mt-1 border-t border-gray-200 pt-1">
            {replyButtons.map((btn, i) => (
              <div key={i} className="text-center text-xs text-[#00a884] font-medium py-0.5 border border-[#00a884]/30 rounded-lg">
                {btn.reply?.title ?? "Button"}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const text = parsed.text;
  return <p className="text-sm text-gray-700">{text.length > 120 ? text.slice(0, 120) + "…" : text || "(media)"}</p>;
}

export function ContactTimeline({ contactId }: { contactId: string }): JSX.Element {
  const [tab, setTab] = useState<Tab>("all");

  const { data: messagesData } = useQuery<{ data: MessageItem[] }>({
    queryKey: ["contact-messages", contactId],
    queryFn: () => fetch(`/api/v1/messages/log?contactId=${contactId}&page=1`).then((r) => r.json()),
  });

  const { data: dealsData } = useQuery<{ data: DealItem[] }>({
    queryKey: ["contact-deals", contactId],
    queryFn: () => fetch(`/api/v1/deals?contactId=${contactId}`).then((r) => r.json()),
  });

  const timeline: TimelineItem[] = [
    ...(messagesData?.data ?? []).map((m): TimelineItem => ({
      type: "message",
      id: m.id,
      body: m.body,
      direction: m.direction,
      createdAt: m.createdAt,
    })),
    ...(dealsData?.data ?? []).map((d): TimelineItem => ({
      type: "deal",
      id: d.id,
      title: d.title,
      stage: d.stage,
      createdAt: d.createdAt,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const filtered = timeline.filter((item) => tab === "all" || item.type + "s" === tab);

  const dotColor: Record<string, string> = {
    message: "bg-blue-400",
    deal: "bg-green-400",
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-card space-y-4">
      <h2 className="font-semibold text-gray-900">Activity Timeline</h2>

      <div className="flex gap-2">
        {(["all", "messages", "deals"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 text-xs rounded-full capitalize transition-colors ${
              tab === t ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">No activity yet.</p>
      )}

      <div className="space-y-3">
        {filtered.map((item) => (
          <div key={`${item.type}-${item.id}`} className="flex gap-3 text-sm">
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${dotColor[item.type] ?? "bg-gray-400"}`} />
            <div>
              {item.type === "message" && (
                <div>
                  <MessageBody body={item.body} />
                  <span className="text-xs text-gray-400 capitalize">{item.direction}</span>
                </div>
              )}
              {item.type === "deal" && (
                <p className="text-gray-700">
                  Deal: <strong>{item.title}</strong> — {item.stage}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date(item.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
