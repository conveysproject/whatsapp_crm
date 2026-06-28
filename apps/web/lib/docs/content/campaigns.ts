import type { DocCategory } from "../types";

export const campaigns: DocCategory = {
  title: "Campaigns",
  slug: "campaigns",
  description:
    "Broadcast messages to multiple contacts at once using WhatsApp templates or custom text.",
  icon: "📢",
  colorHex: "#B45309",
  bgHex: "#FEF3C7",
  articles: [
    {
      title: "What Are Campaigns?",
      slug: "what-are-campaigns",
      description:
        "Understand how broadcast campaigns work on WhatsApp and when to use them.",
      sections: [
        {
          image: {
            src: "/docs/screenshots/campaigns/campaigns-list.png",
            alt: "WBMSG campaigns list",
            caption: "The Campaigns page — view all broadcasts by status",
          },
        },
        {
          heading: "Campaigns",
          paragraphs: [
            "A campaign is a broadcast message sent to multiple contacts at once.",
            "There are two campaign types: Template-based (uses a Meta-approved template) and Text-based (custom text with optional media).",
            "Meta requires template-based messages when messaging contacts outside the 24-hour customer service window. If a contact has messaged you within the last 24 hours, you can use a text-based campaign.",
          ],
        },
        {
          heading: "Campaign Status Tabs",
          paragraphs: [
            "The Campaigns page organises campaigns into status tabs: All, Draft, Upcoming, Running, Paused, Completed, Aborted, and Archived.",
          ],
        },
      ],
    },
    {
      title: "Creating a Campaign",
      slug: "create-campaign",
      description: "Step-by-step guide to setting up and launching a campaign.",
      sections: [
        {
          heading: "Steps",
          steps: [
            "Go to Campaigns > New Campaign.",
            "Enter a Campaign name.",
            "Choose campaign type: Template-based or Text-based.",
            "If Template-based: select an approved template, then map template variables to contact fields.",
            "If Text-based: write your custom message text and optionally add media.",
            "Select recipients — choose from: Segment, Contact Groups (multi-select), or Contact Labels (multi-select).",
            "Set schedule: Send Immediately or pick a date and time.",
            "Optionally set a Message Interval to rate-limit delivery (e.g. 1 message per second).",
            "Review and launch.",
          ],
          tip: "Use Segments for the most precise audience targeting — you can build complex filter rules per segment.",
          warning:
            "Only contacts with WhatsApp Opt-out set to false will receive messages.",
        },
      ],
    },
    {
      title: "Managing Campaigns",
      slug: "campaign-actions",
      description:
        "Edit, pause, resume, archive, and track the status of your campaigns.",
      sections: [
        {
          heading: "Campaign List",
          paragraphs: [
            "The campaigns list shows: Name, Scheduled time, Status badge, and available Actions.",
            "Click a campaign name to open its details page.",
          ],
        },
        {
          heading: "Available Actions by Status",
          paragraphs: [
            "Draft / Upcoming: Edit, Delete.",
            "Running: Pause, Abort.",
            "Paused: Resume, Abort.",
            "Completed / Aborted: Archive.",
            "Archived: Unarchive.",
            "Any status: View details.",
          ],
        },
      ],
    },
    {
      title: "Campaign Logs & Analytics",
      slug: "campaign-analytics",
      description:
        "Track delivery status, measure engagement, and export logs for every campaign.",
      sections: [
        {
          heading: "Details Page",
          paragraphs: [
            "Open a campaign to see its details page: recipient count, scheduled time, status, and a message preview.",
            "Aggregate metrics shown: sent count, delivery stats, and read stats.",
          ],
        },
        {
          heading: "Delivery Statuses Per Contact",
          paragraphs: [
            "Each recipient has an individual delivery status: Sent, Delivered, Read, Replied, or Failed.",
            "Failed messages show the reason (e.g. invalid number, contact blocked your account).",
          ],
        },
        {
          heading: "Exporting Logs",
          paragraphs: [
            "Export the full campaign log as a CSV from the campaign details page.",
          ],
        },
      ],
    },
  ],
};
