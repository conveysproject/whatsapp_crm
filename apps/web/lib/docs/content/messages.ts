import type { DocCategory } from "../types";

export const messages: DocCategory = {
  title: "Messages",
  slug: "messages",
  description: "View and audit all messages sent and received across your organization.",
  icon: "📨",
  colorHex: "#0284C7",
  bgHex: "#E0F2FE",
  articles: [
    {
      title: "Message Log",
      slug: "message-log",
      description: "Browse every message sent and received across your organization in one place.",
      sections: [
        {
          paragraphs: [
            "Go to Messages in the sidebar to open the Message Log.",
            "The log shows every message sent and received across your entire organization.",
          ],
          image: {
            src: "/docs/screenshots/messages/messages-log.png",
            alt: "WBMSG message log",
            caption: "The Message Log — filter, search, and audit all messages across your organization",
          },
        },
        {
          heading: "Filters",
          paragraphs: [
            "From Date and To Date — narrow the log to a specific time range.",
            "Direction — filter by All, Inbound only, or Outbound only.",
          ],
        },
        {
          heading: "Table Columns",
          paragraphs: [
            "Contact Name — the contact the message is associated with.",
            "Message Preview — a truncated preview of the message content.",
            "Type — the message type: text, image, video, document, audio, voice, sticker, template, or interactive.",
            "Direction — color-coded indicator of Inbound or Outbound.",
            "Status — the delivery status: sending, sent, delivered, read, failed, or pending.",
            "Timestamp — when the message was sent or received.",
          ],
        },
        {
          paragraphs: [
            "The log is paginated at 50 messages per page. The total message count is shown above the table.",
          ],
        },
        {
          tip: "Use the date filter to audit message delivery during a specific campaign window or investigate a reported delivery issue.",
        },
      ],
    },
    {
      title: "Message Gaps (Failed Deliveries)",
      slug: "message-gaps",
      description: "Find and recover messages that failed to appear in your inbox.",
      sections: [
        {
          paragraphs: [
            "The Message Gaps tab shows messages that were received by WhatsApp but failed to appear in your WBMSG inbox.",
          ],
        },
        {
          heading: "Failure Types",
          paragraphs: [
            "Queued but worker failed (shown in yellow) — the message arrived in the queue but the processing worker encountered an error.",
            "Never queued — shown in red — the message never reached the inbox queue at all.",
          ],
        },
        {
          heading: "Filters",
          paragraphs: [
            "From Date and To Date — narrow the gaps list to a specific time range.",
          ],
        },
        {
          heading: "Table Columns",
          paragraphs: [
            "Checkbox — select one or more rows for bulk actions.",
            "From Phone — the phone number the message was sent from.",
            "Message Preview — a truncated preview of the message content.",
            "Content Type — the type of content in the message.",
            "Queued Status — whether the message was queued or never reached the queue.",
            "Received Timestamp — when WhatsApp received the message.",
            "Re-queue Button — re-process this individual message.",
          ],
        },
        {
          heading: "Re-queuing Messages",
          paragraphs: [
            "Re-queue individual — click the Re-queue button on a single row.",
            "Bulk Re-queue — select multiple rows using the checkboxes, then click Bulk Re-queue.",
            "Re-queue All — processes up to 500 messages at once regardless of selection.",
            "After re-queuing, a success toast notification shows how many messages were re-queued.",
          ],
        },
        {
          tip: "Check Message Gaps if a customer reports that they sent you a message but you never received it in the inbox.",
        },
      ],
    },
  ],
};
