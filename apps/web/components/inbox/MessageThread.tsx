"use client";

import { JSX, useEffect, useRef, useCallback } from "react";
import { useMessages } from "@/hooks/useMessages";
import { IntentBadge } from "@/components/intent-badge";
import { VoicePlayer } from "@/components/voice-player";
import { MediaMessage } from "./MediaMessage";
import { formatWhatsAppText } from "@/lib/whatsapp-format";

interface Props {
  conversationId: string | null;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function DateSeparator({ label }: { label: string }): JSX.Element {
  return (
    <div className="flex items-center gap-3 my-3 px-2">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-xs text-gray-400 font-medium shrink-0">{label}</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

interface CarouselCard {
  headerFormat?: string | null;
  headerMediaUrl?: string | null;
  body?: string | null;
  buttons?: Array<{ type?: string; text?: string }>;
}

interface TemplateParsed {
  templateName?: string;
  header?: { format?: string; text?: string | null; mediaUrl?: string | null } | null;
  body?: string | null;
  footer?: string | null;
  buttons?: Array<{ type?: string; text?: string }>;
  carousel?: CarouselCard[] | null;
}

function TemplateMessageBubble({ body }: { body: string }): JSX.Element {
  let parsed: TemplateParsed = {};
  let isJson = false;
  try { parsed = JSON.parse(body) as TemplateParsed; isJson = true; } catch { /* raw fallback */ }

  const headerFormat = (parsed.header?.format ?? "TEXT").toUpperCase();
  const headerText = parsed.header?.text;
  const headerMediaUrl = parsed.header?.mediaUrl;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const rawFallback = !isJson && !UUID_RE.test(body.trim()) ? body : undefined;
  const bodyText = parsed.body ?? rawFallback;
  const footerText = parsed.footer;
  const buttons = parsed.buttons ?? [];
  const carousel = parsed.carousel ?? [];

  return (
    <div className="flex flex-col gap-1 min-w-[180px]">
      {headerMediaUrl && (
        <MediaMessage
          mediaUrl={headerMediaUrl}
          contentType={headerFormat.toLowerCase() as "image" | "video" | "document"}
        />
      )}
      {headerText && (
        <p className="font-semibold text-gray-900 leading-snug">{headerText}</p>
      )}
      {bodyText
        ? <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap"
             dangerouslySetInnerHTML={{ __html: formatWhatsAppText(bodyText.replace(/\{\{\d+\}\}/g, "")) }} />
        : !headerText && !headerMediaUrl && <p className="text-xs text-gray-400 italic">Template message</p>
      }
      {footerText && (
        <p className="text-xs text-gray-400 mt-0.5">{footerText}</p>
      )}
      {carousel.length > 0 && (
        <div className="flex gap-2 overflow-x-auto mt-1 pb-1 -mx-1 px-1">
          {carousel.map((card, i) => (
            <div key={i} className="min-w-[140px] max-w-[160px] flex-shrink-0 rounded-lg border border-gray-200 overflow-hidden bg-white">
              {card.headerMediaUrl && (
                <MediaMessage
                  mediaUrl={card.headerMediaUrl}
                  contentType={(card.headerFormat ?? "image").toLowerCase() as "image" | "video" | "document"}
                />
              )}
              {card.body && (
                <p className="text-xs text-gray-800 p-2 leading-snug">{card.body}</p>
              )}
              {(card.buttons ?? []).length > 0 && (
                <div className="border-t border-gray-100 px-2 py-1">
                  {(card.buttons ?? []).map((btn, j) => (
                    <div key={j} className="text-center text-xs text-[#00a884] font-medium py-0.5">
                      {btn.text ?? "Button"}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {buttons.length > 0 && (
        <div className="flex flex-col gap-1 mt-2 border-t border-gray-200 pt-2">
          {buttons.map((btn, i) => (
            <div key={i} className="text-center text-xs text-[#00a884] font-medium py-1 border border-[#00a884]/30 rounded-lg">
              {btn.text ?? "Button"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface InteractiveParsed {
  type?: string;
  header?: { type?: string; text?: string } | null;
  body?: { text?: string } | null;
  footer?: { text?: string } | null;
  action?: {
    buttons?: Array<{ type?: string; reply?: { id?: string; title?: string } }>;
    sections?: Array<{ title?: string; rows?: Array<{ id?: string; title?: string }> }>;
  };
  button_reply?: { id?: string; title?: string };
  list_reply?: { id?: string; title?: string };
}

function InteractiveMessageBubble({ body }: { body: string }): JSX.Element {
  let parsed: InteractiveParsed = {};
  try { parsed = JSON.parse(body) as InteractiveParsed; } catch { /* raw fallback */ }

  // Inbound button/list reply from contact
  const replyTitle = parsed.button_reply?.title ?? parsed.list_reply?.title;
  if (replyTitle) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-gray-800">
        <span className="text-[#00a884] font-bold">✓</span>
        <span>{replyTitle}</span>
      </div>
    );
  }

  const headerText = parsed.header?.text;
  const bodyText = parsed.body?.text;
  const footerText = parsed.footer?.text;
  const replyButtons = parsed.action?.buttons ?? [];
  const listSections = parsed.action?.sections ?? [];

  // Nothing parsed — body is a plain string (e.g. interactive body text from flow runner)
  const hasContent = headerText || bodyText || footerText || replyButtons.length > 0 || listSections.length > 0;
  if (!hasContent) {
    return <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{body}</p>;
  }

  return (
    <div className="flex flex-col gap-1 min-w-[180px]">
      {headerText && (
        <p className="font-semibold text-gray-900 leading-snug">{headerText}</p>
      )}
      {bodyText && (
        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{bodyText}</p>
      )}
      {footerText && (
        <p className="text-xs text-gray-400 mt-0.5">{footerText}</p>
      )}
      {replyButtons.length > 0 && (
        <div className="flex flex-col gap-1 mt-2 border-t border-gray-200 pt-2">
          {replyButtons.map((btn, i) => (
            <div key={i} className="text-center text-xs text-[#00a884] font-medium py-1 border border-[#00a884]/30 rounded-lg">
              {btn.reply?.title ?? "Button"}
            </div>
          ))}
        </div>
      )}
      {listSections.length > 0 && (
        <div className="flex flex-col gap-1 mt-2 border-t border-gray-200 pt-2">
          {listSections.flatMap((s) => s.rows ?? []).slice(0, 3).map((row, i) => (
            <div key={i} className="text-xs text-[#00a884] font-medium py-0.5 px-1">{row.title}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageTicks({ status }: { status?: string | null }): JSX.Element | null {
  if (status === "sending") {
    return <span className="text-gray-400 text-[10px] ml-1">⏱</span>;
  }
  if (status === "failed") {
    return <span className="text-red-400 text-[10px] ml-1">!</span>;
  }
  if (status === "sent") {
    return (
      <svg className="inline w-3 h-3 ml-1 text-gray-400" viewBox="0 0 16 11" fill="currentColor">
        <path d="M11.071.653a.75.75 0 0 1 .033 1.06l-6.5 7a.75.75 0 0 1-1.09.003L.653 5.854a.75.75 0 0 1 1.06-1.061l2.326 2.326 5.972-6.433a.75.75 0 0 1 1.06-.033Z" />
      </svg>
    );
  }
  if (status === "delivered") {
    return (
      <svg className="inline w-4 h-3 ml-1 text-gray-400" viewBox="0 0 20 11" fill="currentColor">
        <path d="M11.071.653a.75.75 0 0 1 .033 1.06l-6.5 7a.75.75 0 0 1-1.09.003L.653 5.854a.75.75 0 0 1 1.06-1.061l2.326 2.326 5.972-6.433a.75.75 0 0 1 1.06-.033Z" />
        <path d="M15.071.653a.75.75 0 0 1 .033 1.06l-6.5 7a.75.75 0 0 1-1.09.003L5.153 6.354a.75.75 0 0 1 1.06-1.061l1.826 1.826 5.972-6.433a.75.75 0 0 1 1.06-.033Z" />
      </svg>
    );
  }
  if (status === "read") {
    return (
      <svg className="inline w-4 h-3 ml-1 text-[#53bdeb]" viewBox="0 0 20 11" fill="currentColor">
        <path d="M11.071.653a.75.75 0 0 1 .033 1.06l-6.5 7a.75.75 0 0 1-1.09.003L.653 5.854a.75.75 0 0 1 1.06-1.061l2.326 2.326 5.972-6.433a.75.75 0 0 1 1.06-.033Z" />
        <path d="M15.071.653a.75.75 0 0 1 .033 1.06l-6.5 7a.75.75 0 0 1-1.09.003L5.153 6.354a.75.75 0 0 1 1.06-1.061l1.826 1.826 5.972-6.433a.75.75 0 0 1 1.06-.033Z" />
      </svg>
    );
  }
  return null;
}

export function MessageThread({ conversationId }: Props): JSX.Element {
  const { messages, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useMessages(conversationId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevScrollHeight = useRef<number>(0);

  const isFirstLoad = useRef(true);

  const lastMessageId = messages[messages.length - 1]?.id;

  // Reset isFirstLoad when conversation changes so initial load scrolls instantly
  useEffect(() => {
    isFirstLoad.current = true;
  }, [conversationId]);

  // Scroll to bottom on initial load (instant) and on new message (smooth)
  useEffect(() => {
    if (!bottomRef.current) return;
    bottomRef.current.scrollIntoView({ behavior: isFirstLoad.current ? "auto" : "smooth" });
    isFirstLoad.current = false;
  }, [conversationId, lastMessageId]);

  // Restore scroll position after older messages are prepended
  useEffect(() => {
    if (isFetchingNextPage || !scrollRef.current) return;
    const el = scrollRef.current;
    el.scrollTop = el.scrollHeight - prevScrollHeight.current;
  }, [isFetchingNextPage]);

  const loadEarlier = useCallback(() => {
    if (!scrollRef.current) return;
    prevScrollHeight.current = scrollRef.current.scrollHeight;
    void fetchNextPage();
  }, [fetchNextPage]);

  if (!conversationId) {
    return (
      <div className="flex items-center justify-center flex-1 text-sm text-gray-400">
        Select a conversation to view messages
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`h-10 w-48 rounded-xl bg-gray-100 animate-pulse ${i % 2 === 0 ? "self-start" : "self-end"}`} />
        ))}
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex flex-col gap-2 p-4 overflow-y-auto flex-1 min-h-0">
      {hasNextPage && (
        <div className="flex justify-center py-1">
          <button
            onClick={loadEarlier}
            disabled={isFetchingNextPage}
            className="text-xs text-[#00a884] font-medium px-3 py-1 rounded-full border border-[#00a884]/30 hover:bg-[#00a884]/5 disabled:opacity-50 transition-colors"
          >
            {isFetchingNextPage ? "Loading…" : "Load earlier messages"}
          </button>
        </div>
      )}
      {messages.map((msg, idx) => {
        const prevMsg = messages[idx - 1];
        const showSeparator =
          !prevMsg ||
          new Date(msg.sentAt).toDateString() !== new Date(prevMsg.sentAt).toDateString();

        return (
          <div key={msg.id}>
            {showSeparator && <DateSeparator label={formatDateLabel(msg.sentAt)} />}
            <div className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}>
              <div
                className={[
                  "max-w-xs lg:max-w-md px-4 py-2 rounded-2xl text-sm",
                  msg.direction === "outbound"
                    ? "bg-wa-light text-gray-900 rounded-br-none"
                    : "bg-white border border-gray-200 text-gray-900 rounded-bl-none shadow-card",
                ].join(" ")}
              >
                {msg.contentType === "audio" && msg.mediaUrl ? (
                  <VoicePlayer mediaUrl={msg.mediaUrl} messageId={msg.id} />
                ) : msg.contentType === "template" && msg.body ? (
                  <TemplateMessageBubble body={msg.body} />
                ) : msg.contentType === "interactive" ? (
                  msg.body
                    ? <InteractiveMessageBubble body={msg.body} />
                    : <span className="text-xs text-gray-400 italic">Interactive message</span>
                ) : msg.mediaUrl != null && msg.contentType !== "text" ? (
                  <MediaMessage mediaUrl={msg.mediaUrl} contentType={msg.contentType ?? "document"} />
                ) : (
                  <>
                    <p dangerouslySetInnerHTML={{ __html: msg.body ? formatWhatsAppText(msg.body) : "[media]" }} />
                    {msg.direction === "inbound" && msg.body && (
                      <IntentBadge messageId={msg.id} text={msg.body} direction={msg.direction} />
                    )}
                  </>
                )}
                <p className="text-xs text-gray-400 mt-1 text-right flex items-center justify-end gap-0.5">
                  {formatTime(msg.sentAt)}
                  {msg.direction === "outbound" && <MessageTicks status={msg.status} />}
                </p>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
