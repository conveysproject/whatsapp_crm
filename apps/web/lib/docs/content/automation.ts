import type { DocCategory } from "../types";

export const automation: DocCategory = {
  title: "Automation",
  slug: "automation",
  description:
    "Automate responses and build multi-step conversation flows — from simple toggles to visual drag-and-drop workflows.",
  icon: "⚡",
  colorHex: "#DC2626",
  bgHex: "#FEE2E2",
  articles: [
    {
      title: "Automation Overview",
      slug: "automation-overview",
      description:
        "The four automation layers available in WBMSG and when to use each one.",
      sections: [
        {
          image: {
            src: "/docs/screenshots/automation/flows.png",
            alt: "WBMSG automation flows page",
            caption: "The Flows page — all automation tools in one place",
          },
        },
        {
          heading: "Automation in WBMSG",
          paragraphs: [
            "WBMSG has four levels of automation:",
            "1. Basic Automation — simple on/off toggles for common scenarios: out-of-office, welcome messages, and delayed replies.",
            "2. Auto-Replies — keyword-triggered instant replies.",
            "3. Flow Builder — a visual drag-and-drop editor for multi-step automated workflows.",
            "4. AI Intent Matching — AI-powered intent detection that triggers the right automation based on what a contact says.",
            "All automation tools are found under the Flows section in the sidebar.",
          ],
        },
      ],
    },
    {
      title: "Basic Automation",
      slug: "basic-automation",
      description:
        "Configure business hours, out-of-office replies, welcome messages, and delayed responses.",
      sections: [
        {
          heading: "Where to Find It",
          paragraphs: ["Go to Flows > Basic Automation."],
        },
        {
          heading: "Business Hours",
          paragraphs: [
            "Set your working hours per day of the week.",
            "Set open and close times for each day.",
            "Business Hours are used by Out-of-Office to know when to activate.",
            "Timezone applies from your account settings.",
          ],
        },
        {
          heading: "Out-of-Office (OOO)",
          paragraphs: [
            "Enable or disable with a toggle.",
            "Write an OOO message text.",
            "Optionally attach media to the OOO message.",
            "Fires automatically outside your configured Business Hours.",
            "Sends once per conversation session — not on every message the contact sends.",
          ],
        },
        {
          heading: "Welcome Messages",
          paragraphs: [
            "Enable or disable with a toggle.",
            "Personalized option (Yes or No): if Yes, write separate messages for new contacts and returning contacts; if No, one general welcome message is sent to everyone.",
            "Optionally link to a Flow to run after the welcome message.",
            "Fires when a contact messages you for the first time (new contact) or when a returning contact messages again.",
          ],
        },
        {
          heading: "Delayed Response",
          paragraphs: [
            "Enable or disable with a toggle.",
            "Set the delay in minutes (default: 30 minutes).",
            "Write the message to send after the delay.",
            "Optionally attach media.",
            "Toggle: 'Also send if OOO is enabled' — controls whether the delayed reply fires alongside an OOO reply.",
            "The timer resets if the contact sends another message before the delay expires.",
          ],
          note: "The delayed reply is cancelled if an agent replies first.",
        },
      ],
    },
    {
      title: "Auto-Replies (Keyword Triggers)",
      slug: "auto-replies",
      description:
        "Create keyword rules that send an instant reply when a contact's message matches.",
      sections: [
        {
          heading: "Setting Up Auto-Replies",
          paragraphs: [
            "Go to Flows > Auto-Replies.",
            "Create rules that trigger an instant reply when a contact's message matches a keyword.",
            "Each rule has: one or more keywords, reply text, optional media, and an Active/Inactive status.",
            "Actions available: Create, Edit, Enable/Disable, Delete.",
          ],
          tip: "Use Auto-Replies for common FAQs — for example, keywords like 'price', 'hours', or 'location'.",
        },
      ],
    },
    {
      title: "Visual Flow Builder",
      slug: "flow-builder",
      description:
        "Design multi-step automated conversation journeys with a drag-and-drop canvas.",
      sections: [
        {
          heading: "Getting Started",
          paragraphs: [
            "Go to Flows > New Flow. Creating and editing flows requires Admin or Manager role.",
            "The canvas is a visual drag-and-drop editor.",
          ],
          warning:
            "Deactivating a flow mid-run may leave some contacts mid-flow. Review active runs before deactivating.",
        },
        {
          heading: "Trigger Nodes",
          paragraphs: [
            "A Trigger node defines what starts the flow. Supported triggers:",
            "New Conversation, Incoming Message, Keyword Match, Button Reply, Contact Created, Label Added, Lead Status Changed, Conversation Resolved, Conversation Assigned, No Reply (after a delay).",
          ],
        },
        {
          heading: "Action Nodes",
          paragraphs: [
            "Action nodes define what the flow does: send a message, update a contact, delay, make a webhook call, assign an agent, or add a tag.",
          ],
        },
        {
          heading: "Condition Nodes",
          paragraphs: [
            "Condition nodes add branching logic based on contact field values or message content.",
          ],
        },
        {
          heading: "Building and Managing Flows",
          paragraphs: [
            "Connect nodes by dragging between them.",
            "Use the Activate/Deactivate toggle on the flow detail page to enable or disable a flow.",
            "The flows list shows: Name, Trigger type, Run count, and Active/Inactive status.",
          ],
        },
      ],
    },
    {
      title: "AI Intent Matching",
      slug: "ai-intent-matching",
      description:
        "Use AI to detect what a contact is asking and automatically trigger the right automation.",
      sections: [
        {
          heading: "How It Works",
          paragraphs: [
            "Go to Flows > AI Intent Matching.",
            "Toggle to enable or disable.",
            "The AI semantically understands customer messages — going beyond simple keyword matching.",
            "When a customer's message matches a defined intent, the AI triggers the linked auto-reply or flow.",
            "Flow: customer sends a message → AI analyses the intent → the correct automation fires.",
          ],
        },
        {
          heading: "Setup",
          paragraphs: [
            "Set up your Auto-Replies and Flows before enabling AI Intent Matching — the feature routes incoming messages to existing automations.",
            "Pricing is charged per successful intent match. The current rate is shown in the UI.",
          ],
          note: "AI Intent Matching works best when you have descriptive auto-replies and flows already configured.",
        },
      ],
    },
  ],
};
