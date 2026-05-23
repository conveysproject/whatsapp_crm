"use client";

import { JSX, useEffect, useRef } from "react";
import { useMessages } from "@/hooks/useMessages";
import { IntentBadge } from "@/components/intent-badge";
import { VoicePlayer } from "@/components/voice-player";
import { MediaMessage } from "./MediaMessage";
import { formatWhatsAppText } from "@/lib/whatsapp-format";

interface TemplatePayload {
  templateName: string;
  header: { format: string; text: string | null } | null;
  body: string;
  footer: string | null;
  buttons: Array<{ type?: string; text?: string; url?: string; phone_number?: string }>;
}

function parseTemplateBody(raw: string | null): TemplatePayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "templateName" in parsed) {
      return parsed as TemplatePayload;
    }
  } catch { /* not JSON */ }
  return null;
}

function DoubleTick(): JSX.Element {
  return (
    <svg className="inline-block w-4 h-4 ml-0.5" style={{ color: "var(--wa-timestamp)" }} viewBox="0 0 16 11" fill="currentColor">
      <path d="M11.071.653a.75.75 0 0 1 .011 1.06l-6.867 7a.75.75 0 0 1-1.082-.013L.622 6.087a.75.75 0 0 1 1.106-1.013l1.98 2.16 6.303-6.57a.75.75 0 0 1 1.06-.011z"/>
      <path d="M14.071.653a.75.75 0 0 1 .011 1.06l-6.867 7a.75.75 0 0 1-1.06-.011.75.75 0 0 1 .011-1.06l6.867-7a.75.75 0 0 1 1.038.011z"/>
    </svg>
  );
}

function TemplateCard({ payload }: { payload: TemplatePayload }): JSX.Element {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-2xl rounded-br-none text-sm min-w-[220px] max-w-xs lg:max-w-md shadow-sm wa-bubble-out"
    >
      {payload.header?.format === "TEXT" && payload.header.text && (
        <div className="px-4 pt-3 pb-1 font-semibold" style={{ color: "var(--wa-text-primary)" }}>
          {payload.header.text}
        </div>
      )}
      {payload.header?.format === "IMAGE" && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-1 text-xs" style={{ color: "var(--wa-text-secondary)" }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          Image
        </div>
      )}
      <p
        className="px-4 py-2 whitespace-pre-wrap"
        style={{ color: "var(--wa-text-primary)" }}
        dangerouslySetInnerHTML={{ __html: formatWhatsAppText(payload.body) }}
      />
      {payload.footer && (
        <p className="px-4 pb-2 text-xs" style={{ color: "var(--wa-text-secondary)" }}>{payload.footer}</p>
      )}
      {payload.buttons.length > 0 && (
        <div style={{ borderTop: "1px solid rgba(0,0,0,0.1)" }}>
          {payload.buttons.map((btn, i) => (
            <div
              key={i}
              className="flex items-center justify-center gap-1 py-2 text-sm font-medium"
              style={{ color: "#0070BA", borderBottom: i < payload.buttons.length - 1 ? "1px solid rgba(0,0,0,0.08)" : "none" }}
            >
              {btn.type === "URL" && (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              )}
              {btn.type === "PHONE_NUMBER" && (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 7V5z" /></svg>
              )}
              {btn.text ?? ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  conversationId: string | null;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function MessageThread({ conversationId }: Props): JSX.Element {
  const { data: messages, isLoading } = useMessages(conversationId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!conversationId) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4" style={{ backgroundColor: "var(--wa-bg)" }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: "var(--wa-green)" }}>
          <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.118 1.535 5.845L.057 23.082a.75.75 0 00.933.932l5.231-1.474A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.907 0-3.694-.5-5.241-1.376l-.375-.214-3.882 1.094 1.095-3.883-.214-.375A9.958 9.958 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
          </svg>
        </div>
        <p className="text-sm" style={{ color: "var(--wa-text-secondary)" }}>Select a conversation to start messaging</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4 flex-1 wa-chat-bg">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`h-10 w-48 rounded-xl animate-pulse ${i % 2 === 0 ? "self-start" : "self-end"}`} style={{ backgroundColor: "rgba(0,0,0,0.08)" }} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-4 py-3 overflow-y-auto flex-1 wa-chat-bg">
      {messages?.map((msg) => {
        const isOut = msg.direction === "outbound";

        if (msg.contentType === "template") {
          const tpl = parseTemplateBody(msg.body);
          return (
            <div key={msg.id} className="flex justify-end mb-1">
              <div className="flex flex-col items-end gap-0.5">
                {tpl ? <TemplateCard payload={tpl} /> : (
                  <div className="max-w-xs lg:max-w-md px-3 py-2 rounded-2xl rounded-br-none text-sm wa-bubble-out" style={{ color: "var(--wa-text-primary)" }}>
                    <p>{msg.body}</p>
                  </div>
                )}
                <div className="flex items-center gap-1 pr-1">
                  <span className="text-[11px]" style={{ color: "var(--wa-timestamp)" }}>{formatTime(msg.sentAt)}</span>
                  <DoubleTick />
                </div>
              </div>
            </div>
          );
        }

        return (
          <div
            key={msg.id}
            className={`flex mb-1 ${isOut ? "justify-end" : "justify-start"}`}
          >
            <div
              className={[
                "max-w-xs lg:max-w-md px-3 py-2 rounded-2xl text-sm shadow-sm",
                isOut ? "wa-bubble-out rounded-br-none" : "wa-bubble-in rounded-bl-none",
              ].join(" ")}
              style={{ color: "var(--wa-text-primary)" }}
            >
              {msg.contentType === "audio" && msg.mediaUrl ? (
                <VoicePlayer mediaUrl={msg.mediaUrl} messageId={msg.id} />
              ) : msg.mediaUrl != null && msg.contentType !== "text" ? (
                <MediaMessage mediaUrl={msg.mediaUrl} contentType={msg.contentType ?? "document"} />
              ) : (
                <>
                  <p dangerouslySetInnerHTML={{ __html: msg.body ? formatWhatsAppText(msg.body) : "[media]" }} />
                  {!isOut && msg.body && (
                    <IntentBadge messageId={msg.id} text={msg.body} direction={msg.direction} />
                  )}
                </>
              )}
              <div className={`flex items-center gap-1 mt-0.5 ${isOut ? "justify-end" : "justify-end"}`}>
                <span className="text-[11px]" style={{ color: "var(--wa-timestamp)" }}>{formatTime(msg.sentAt)}</span>
                {isOut && <DoubleTick />}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
