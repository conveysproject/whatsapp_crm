import type { DocCategory } from "../types";

export const settings: DocCategory = {
  title: "Settings",
  slug: "settings",
  description: "Configure your workspace, team, integrations, and billing.",
  icon: "⚙️",
  colorHex: "#374D3E",
  bgHex: "#E0EBE5",
  articles: [
    {
      title: "Members & Teams",
      slug: "members-and-teams",
      description: "Invite team members, manage roles, and organize agents into teams.",
      sections: [
        {
          paragraphs: [
            "Go to Settings > Members to manage everyone in your workspace.",
            "The member list shows each person's Name, Email, Role, Created date, and Last Sign-in.",
            "Use the search bar to find a member by name or email.",
          ],
        },
        {
          heading: "Inviting Members",
          paragraphs: [
            "Click Invite, enter the person's email address, and select their role — Admin, Manager, Agent, or Viewer. An invitation email is sent automatically.",
          ],
        },
        {
          heading: "Managing Members",
          paragraphs: [
            "To change a member's role, click their row and use the role dropdown.",
            "To remove a member, click Remove Access. Their data is retained but they can no longer log in.",
          ],
        },
        {
          heading: "Teams",
          paragraphs: [
            "Teams group agents together for routing and visibility purposes.",
            "Create a team by entering a team name, assigning members, and setting a team lead.",
            "When teams are configured, agents can be scoped to see only their team's conversations, and routing rules can assign conversations to a specific team.",
          ],
        },
      ],
    },
    {
      title: "Roles & Permissions",
      slug: "roles-permissions",
      description: "View and edit what each role can access and do in WBMSG.",
      sections: [
        {
          paragraphs: [
            "Go to Settings > Roles to manage role-based access control.",
            "The default roles are: Super Admin, Admin, Manager, Agent, and Viewer.",
            "Click any role to view its permission checklist and make changes.",
          ],
        },
        {
          heading: "Permission Sections",
          paragraphs: [
            "Permissions are grouped into sections: Inbox, Contacts, Templates, Campaigns, Automation, Deals, Analytics, Settings, and Billing.",
            "Each section has sub-permissions — for example, the Contacts section includes contacts_add, contacts_delete, and contacts_export.",
            "The 'Apply to all new members with this role' toggle makes the current permission set the default for anyone invited with that role.",
          ],
        },
        {
          note: "Super Admin and Admin have all permissions and cannot be restricted.",
        },
      ],
    },
    {
      title: "WhatsApp Account Settings",
      slug: "whatsapp-account",
      description: "View your connected WhatsApp Business Account and manage the connection.",
      sections: [
        {
          paragraphs: [
            "Go to Settings > WhatsApp Account to see your connected WABA information.",
            "The page shows your phone number, display name, quality rating, and current connection status.",
            "Use the Sync button to pull the latest phone number data from Meta.",
            "Use the Disconnect button to remove the WhatsApp connection from your workspace.",
          ],
        },
        {
          warning: "Disconnecting your WhatsApp account will stop all message sending and receiving immediately.",
        },
      ],
    },
    {
      title: "Contact Settings",
      slug: "contact-settings",
      description: "Custom fields, lead statuses, and auto-assignment rules for contacts.",
      sections: [
        {
          paragraphs: [
            "Go to Settings > Contact Settings. The page has three tabs.",
          ],
        },
        {
          heading: "Contact Fields Tab",
          paragraphs: [
            "Create, edit, and delete custom fields that appear on every contact record. See the Custom Fields article for full details.",
          ],
        },
        {
          heading: "Lead Statuses Tab",
          paragraphs: [
            "Create custom lead statuses with a name and a color. These statuses appear on contact records and can be used in filters.",
          ],
        },
        {
          heading: "Assignment Rules Tab",
          paragraphs: [
            "Assignment rules automatically assign incoming conversations to a specific agent or team based on conditions you define.",
            "Each rule has a Name, one or more Conditions (IF [field] [operator] [value]), and an Assign To action (User or Team).",
            "You can Create, Edit, Delete, Reorder, Enable, or Disable rules. Rules are evaluated in priority order — the order you set matters.",
          ],
        },
      ],
    },
    {
      title: "Labels",
      slug: "labels-settings",
      description: "Create and manage Contact Labels and Inbox Labels.",
      sections: [
        {
          paragraphs: [
            "WBMSG has two separate label systems.",
            "Contact Labels (Settings > Labels) tag contacts for organization and filtering. The usage count for each label is shown.",
            "Inbox Labels (Settings > Inbox Labels) label conversations in the inbox to help manage queues and routing.",
            "Both label types support create, edit, and delete actions. Each label has a name and a color.",
          ],
        },
        {
          tip: "Use Inbox Labels to route and prioritize conversation queues — for example, labels like 'Urgent' or 'VIP' help agents know which conversations to handle first.",
        },
      ],
    },
    {
      title: "Canned Responses",
      slug: "canned-responses-settings",
      description: "Create shortcut responses your team can insert with a single keystroke.",
      sections: [
        {
          paragraphs: [
            "Go to Settings > Canned Responses to manage your saved reply shortcuts.",
            "The list shows each response's Shortcut, Response Text, and Last Used date.",
          ],
        },
        {
          heading: "Creating a Canned Response",
          paragraphs: [
            "Click Create and enter a shortcut key (for example, !hello), the response text, and optionally attach media.",
            "Response text supports template variables: {{first_name}} and {{last_name}} are substituted automatically when the response is inserted.",
          ],
        },
        {
          heading: "Using Canned Responses in the Inbox",
          paragraphs: [
            "In the inbox compose box, type / to open the canned response picker. Start typing the shortcut to filter the list, then select a response to insert it.",
          ],
        },
        {
          tip: "Keep shortcuts short and memorable — agents rely on them under time pressure.",
        },
      ],
    },
    {
      title: "Media Library",
      slug: "media-library",
      description: "Store and reuse images, videos, documents, and audio across your workspace.",
      sections: [
        {
          paragraphs: [
            "Go to Settings > Media Library to manage your shared media assets.",
            "Assets are displayed in a grid view. Supported file types include images, videos, documents, and audio.",
          ],
        },
        {
          heading: "Actions",
          paragraphs: [
            "Upload New — add a new asset to the library.",
            "Delete — remove an asset permanently.",
            "Copy Link — copy the asset's URL to your clipboard.",
            "Use in Template — open the asset directly in the template editor.",
            "Uploaded assets appear in the Media Asset Picker whenever you are composing a message or building a template.",
          ],
        },
      ],
    },
    {
      title: "Notification Settings",
      slug: "notifications",
      description: "Control which events trigger alerts and how you receive them.",
      sections: [
        {
          paragraphs: [
            "Go to Settings > Notifications to configure your alert preferences.",
            "Toggle sound notifications on or off.",
            "Choose which events trigger alerts: new inbox message, assigned conversation, campaign completed, flow triggered, and others.",
            "Set your desktop notification preferences to control whether browser notifications are shown.",
          ],
        },
      ],
    },
    {
      title: "Webhook Actions",
      slug: "webhook-actions",
      description: "Send HTTP POST payloads to external URLs when events occur in WBMSG.",
      sections: [
        {
          paragraphs: [
            "Go to Settings > Webhook Actions to manage outbound webhooks.",
            "When a trigger event fires, WBMSG sends an HTTP POST to the URL you configure.",
          ],
        },
        {
          heading: "Creating a Webhook",
          paragraphs: [
            "Click Create Webhook, choose the trigger event, enter the destination URL, optionally add a secret token for request signing, and enable the webhook.",
            "Available trigger events include: conversation created, message received, conversation resolved, deal won, and contact created.",
            "Use the Test button to send a sample payload to your URL and verify it is working.",
          ],
        },
        {
          heading: "Managing Webhooks",
          paragraphs: [
            "Edit or delete existing webhooks from the list. Each webhook can be individually enabled or disabled without deleting it.",
          ],
        },
      ],
    },
    {
      title: "Vendor & API Settings",
      slug: "vendor-settings",
      description: "Configure bot timeouts, API tokens, webhook retries, and rate limits.",
      sections: [
        {
          paragraphs: [
            "Go to Settings > Vendor Settings to access advanced configuration options.",
            "Bot Response Timeout — set how many seconds WBMSG waits before considering the bot unresponsive.",
            "API Token — your organization's API key. This field is read-only; use the copy button to copy it.",
            "Webhook Retry Count — how many times WBMSG retries a failed webhook delivery.",
            "Rate Limiting Configuration — control how many API requests are allowed per time window.",
          ],
        },
      ],
    },
    {
      title: "Billing & Subscription",
      slug: "billing",
      description: "View your current plan, usage, invoices, and manage your subscription.",
      sections: [
        {
          paragraphs: [
            "Go to Settings > Billing to manage your subscription.",
            "The page shows your current plan tier and usage metrics with progress bars for each limit — Contacts, Campaigns, and others.",
          ],
        },
        {
          heading: "Subscription Management",
          paragraphs: [
            "WBMSG uses Stripe for subscription billing.",
            "The billing page shows your subscription status and current period end date.",
            "Click Manage Subscription to open the Stripe portal where you can update payment methods, download invoices, and cancel.",
            "Invoice history is listed on the billing page.",
          ],
        },
        {
          heading: "Plans & Transactions",
          paragraphs: [
            "An available plans table shows what each tier includes, with upgrade buttons next to plans above your current tier.",
            "The transaction history table shows each transaction's Date, Amount, Currency, Status, and Payment Gateway.",
          ],
        },
        {
          note: "Pricing is shown in INR or USD depending on your account's currency setting.",
        },
      ],
    },
    {
      title: "Branding Settings",
      slug: "branding",
      description: "Customize your workspace logo, colors, and font.",
      sections: [
        {
          paragraphs: [
            "Go to Settings > Branding to customize how your workspace looks.",
            "Upload a logo and favicon.",
            "Set your primary and secondary brand colors using the color pickers.",
            "Choose a font family from the available options.",
            "A live preview updates as you make changes.",
          ],
        },
        {
          tip: "Branding settings affect how your workspace appears to your team members.",
        },
      ],
    },
    {
      title: "AI Settings",
      slug: "ai-settings",
      description: "Configure the AI chatbot's behavior, personality, and context window.",
      sections: [
        {
          paragraphs: [
            "Go to Settings > AI to configure the AI assistant.",
            "System Prompt — a multi-line text area where you write instructions for the AI chatbot's personality and behavior.",
            "Temperature — a slider from 0 to 1 that controls how creative or consistent the AI's responses are. Lower values produce more predictable replies.",
            "Enable/Disable AI Chatbot toggle — turns the AI bot on or off for your workspace.",
          ],
        },
        {
          heading: "Context Window",
          paragraphs: [
            "When a contact has an existing AI summary saved, the AI reads the last 6 messages to keep token usage low.",
            "For contacts with no prior summary, the AI reads the last 30 messages to build context.",
          ],
        },
        {
          note: "The AI uses a contact's past conversation summary when available to reduce token usage and response latency.",
        },
      ],
    },
    {
      title: "Account Details",
      slug: "account-details",
      description: "Read-only information about your organization's account.",
      sections: [
        {
          paragraphs: [
            "Go to Settings > Account Details to view your organization's account information.",
            "All fields on this page are read-only.",
            "Fields shown: Organization Name, Plan Tier, Created Date, WABA ID, WhatsApp Business Account ID, Organization Status, and Trial End Date (if your account is currently on a trial).",
          ],
        },
      ],
    },
  ],
};
