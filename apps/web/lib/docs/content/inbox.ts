import type { DocCategory } from "../types";

export const inbox: DocCategory = {
  title: "Inbox",
  slug: "inbox",
  description:
    "Everything about the WBMSG shared team inbox — managing conversations, labels, canned responses, media, and AI smart replies.",
  icon: "💬",
  colorHex: "#0BBF77",
  bgHex: "#E6F9F1",
  articles: [
    {
      title: "WhatsApp Inbox Overview",
      slug: "inbox-overview",
      description:
        "Understand the layout of the WBMSG inbox and how real-time messaging works.",
      sections: [
        {
          heading: "Three-Panel Layout",
          steps: [
            "Conversation List (left) — all conversations sorted by most recent message",
            "Message Thread (center) — the full conversation history and compose form",
            "Contact Panel (right, toggleable) — contact details, fields, and deal links",
          ],
          image: {
            src: "/docs/screenshots/inbox/inbox-overview.png",
            alt: "WBMSG inbox three-panel layout",
            caption: "The WBMSG inbox: conversation list (left), message thread (center), contact panel (right)",
          },
        },
        {
          paragraphs: [
            "The inbox updates in real time via Socket.io — new messages appear instantly without a page refresh.",
            "When an automation is responding on behalf of your team, an amber banner with a spinner appears at the top of the message thread to indicate the bot is active.",
          ],
        },
      ],
    },
    {
      title: "Using the Conversation List",
      slug: "conversation-list",
      description:
        "How the left-panel conversation list works and how to find conversations quickly.",
      sections: [
        {
          paragraphs: [
            "The left panel shows all conversations for your workspace. Each row displays the contact avatar, contact name, last message preview, timestamp, and an unread message badge.",
            "You can search conversations by contact name using the search bar at the top of the list.",
            "The list is real-time — new messages push conversations to the top as they arrive.",
          ],
        },
      ],
    },
    {
      title: "Managing Conversation Status",
      slug: "conversation-status",
      description:
        "How to use Open, Pending, and Resolved statuses to keep your inbox organised.",
      sections: [
        {
          paragraphs: [
            "Every conversation has a status that reflects where it is in your workflow. Change the status from the Conversation Header dropdown.",
          ],
          steps: [
            "Open (green) — active conversation that needs agent attention",
            "Pending (amber) — waiting on a customer reply",
            "Resolved (gray) — closed or completed conversation",
          ],
        },
      ],
    },
    {
      title: "Assigning Conversations",
      slug: "assigning-conversations",
      description: "How to assign a conversation to a specific agent.",
      sections: [
        {
          paragraphs: [
            "Open a conversation and click the person icon (Assign) in the top-right of the conversation header.",
            "A searchable dropdown appears listing available agents. If your admin has enabled 'Show only same-team members in assignee list' in Team Controls, only your teammates are shown.",
            "Click an agent to assign the conversation to them. The button updates to show the assignee's first name in green.",
            "To unassign, open the dropdown and click Unassign.",
          ],
        },
        {
          tip: "Assigned agents receive an in-app notification when a conversation is assigned to them.",
        },
      ],
    },
    {
      title: "Conversation Labels",
      slug: "labels",
      description:
        "How to apply, filter, and manage labels to organise conversations.",
      sections: [
        {
          paragraphs: [
            "Labels let you categorise conversations — for example 'Urgent', 'Sales', or 'Support'. They appear as badges in the conversation list and can be used to filter the inbox.",
          ],
        },
        {
          heading: "Applying a Label",
          steps: [
            "Open a conversation and click the label dropdown in the Conversation Header",
            "Search existing labels or type a new name",
            "If the typed name does not match any existing label, an option to create it appears inline",
            "Select or create the label to apply it",
            "Use the clear button to remove the label",
          ],
        },
        {
          heading: "Filtering and Managing Labels",
          steps: [
            "Filter the conversation list by label using the label filter above the list",
            "Manage all labels (create, rename, delete) in Settings > Labels",
          ],
        },
      ],
    },
    {
      title: "Sending Messages",
      slug: "sending-messages",
      description:
        "All the ways you can compose and send messages from the inbox.",
      sections: [
        {
          paragraphs: [
            "Type your message in the text input field at the bottom of the message thread, then click Send or press Enter.",
          ],
        },
        {
          heading: "Attachments & Rich Content",
          steps: [
            "Attach media — open the attachment menu to send an image, video, document, or audio file",
            "WhatsApp templates — use the Template Picker to search and insert an approved template",
            "Interactive messages — use the Interactive Message Picker to send button messages, quick replies, or list messages",
            "Media Library — use the Media Asset Picker to select a previously uploaded file",
            "Canned responses — type / (slash) in the compose box to open the canned response shortcut menu, search, and insert",
          ],
        },
      ],
    },
    {
      title: "Using Canned Responses",
      slug: "canned-responses",
      description:
        "How to create and insert pre-written reply shortcuts to speed up common responses.",
      sections: [
        {
          paragraphs: [
            "Canned responses are pre-written message shortcuts agents can insert instantly. Each has a shortcut key (e.g. !hello), response text, and an optional media attachment. The response text supports {{first_name}} and {{last_name}} variables.",
          ],
        },
        {
          heading: "Inserting a Canned Response",
          steps: [
            "Click in the message compose box",
            "Type / (forward slash) to open the canned response menu",
            "Search by shortcut name and select the response to insert it",
            "Review and edit before sending",
          ],
        },
        {
          heading: "Managing Canned Responses",
          paragraphs: [
            "Create and manage canned responses in Settings > Canned Responses.",
          ],
        },
      ],
    },
    {
      title: "AI Smart Replies",
      slug: "smart-replies",
      description:
        "How WBMSG suggests AI-generated replies based on conversation context.",
      sections: [
        {
          paragraphs: [
            "When an AI bot is enabled for your workspace, a Smart Replies panel appears in the inbox. The AI reads the conversation and suggests a reply for the agent to review.",
            "Click a suggestion to insert it into the compose box, then edit or send it.",
          ],
          warning:
            "Always review AI suggestions before sending — AI can make mistakes. Never send a smart reply without confirming it is accurate.",
        },
      ],
    },
    {
      title: "Contact Panel",
      slug: "contact-panel",
      description:
        "How to use the right-side contact panel to view and act on contact details without leaving the inbox.",
      sections: [
        {
          paragraphs: [
            "Toggle the Contact Panel open or closed using the button in the Conversation Header.",
          ],
        },
        {
          heading: "What the Panel Shows",
          steps: [
            "Full name, phone number, and email",
            "Tags and lead status",
            "Assigned agent",
            "Groups the contact belongs to",
            "Custom field values",
            "Conversation status and last message time",
          ],
        },
        {
          heading: "Actions",
          steps: [
            "Click 'Create Deal' to start a deal linked to this contact",
            "Click the link to the full contact profile to edit all contact details",
          ],
        },
      ],
    },
    {
      title: "Media & Voice Messages",
      slug: "media-and-voice",
      description:
        "How to send and receive images, videos, documents, audio, and voice notes in the inbox.",
      sections: [
        {
          heading: "Receiving Media",
          paragraphs: [
            "You can receive any media type customers send via WhatsApp: images, videos, documents, audio files, voice notes, and stickers. All media types display inline in the message thread.",
            "Voice notes received from customers include a built-in audio player — click play to listen.",
          ],
        },
        {
          heading: "Sending Media",
          paragraphs: [
            "Use the attachment menu in the compose form to send images, video, documents, or audio files to customers.",
          ],
          note: "Sending voice notes via the WhatsApp Business API is not supported by Meta. Only regular audio file attachments can be sent, and they will not appear as native voice notes on the customer's device.",
        },
      ],
    },
  ],
};
