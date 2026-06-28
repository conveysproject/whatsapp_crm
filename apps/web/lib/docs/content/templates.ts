import type { DocCategory } from "../types";

export const templates: DocCategory = {
  title: "Templates",
  slug: "templates",
  description:
    "Create, manage, and analyse WhatsApp Message Templates — the pre-approved formats required for outbound messaging.",
  icon: "📋",
  colorHex: "#7C3AED",
  bgHex: "#EDE9FE",
  articles: [
    {
      title: "What Are WhatsApp Templates?",
      slug: "what-are-templates",
      description:
        "Understand why Meta requires pre-approved templates and how they enable outbound messaging.",
      sections: [
        {
          heading: "The 24-Hour Messaging Window",
          paragraphs: [
            "WhatsApp allows businesses to send free-form messages to a contact only within 24 hours of the contact's last message to you. This is the customer service window. Once that window closes, you must use a pre-approved Message Template to initiate or re-open a conversation.",
            "Templates are reviewed by Meta before you can use them. This ensures outbound business messages meet WhatsApp's content policies.",
          ],
        },
        {
          heading: "Template Categories",
          paragraphs: [
            "Every template belongs to one of three categories:",
          ],
          steps: [
            "Marketing — promotions, offers, announcements, and re-engagement campaigns. Most business outreach templates are Marketing.",
            "Utility — transactional messages tied to an action the contact has taken, such as order confirmations, appointment reminders, or account alerts.",
            "Authentication — one-time passcodes (OTP) and verification codes.",
          ],
          note: "Choosing the wrong category is a common rejection reason. A discount offer must be Marketing, not Utility — even if the contact placed a recent order.",
        },
        {
          heading: "Template Statuses",
          paragraphs: [
            "After you submit a template for review, it moves through these statuses: Pending (under Meta review), Approved (ready to use in campaigns and messages), Rejected (needs changes before resubmission), or Disabled (paused by Meta due to low quality scores).",
            "Use the Sync button on the Templates page to pull the latest status from Meta if a template has not updated automatically.",
          ],
        },
      ],
    },
    {
      title: "Template Library",
      slug: "template-library",
      description:
        "Browse and add Meta's pre-built templates to your account without starting from scratch.",
      sections: [
        {
          heading: "Using the Template Library",
          paragraphs: [
            "WBMSG provides access to Meta's library of pre-made templates. Go to Templates and click the Template Library tab.",
            "Browse the available templates, preview their content, and select ones you want to use. Adding a library template copies it to your account where you can use it in campaigns and messages.",
            "Library templates save time compared to writing templates from scratch and are already structured to pass Meta's review.",
          ],
        },
      ],
    },
    {
      title: "Creating a Message Template",
      slug: "create-template",
      description:
        "Step-by-step guide to building a WhatsApp template in WBMSG and submitting it to Meta for approval.",
      sections: [
        {
          heading: "Steps to Create a Template",
          steps: [
            "Go to Templates in the left sidebar.",
            "Click New Template.",
            "Enter a Template Name — lowercase letters, numbers, and underscores only, no spaces (e.g. order_confirmation). The name is for internal use only and is never shown to contacts.",
            "Select a Category: Marketing, Utility, or Authentication.",
            "For Marketing templates, optionally choose a Template Type: Standard, Coupon Code, Limited-Time Offer, or Carousel.",
            "Select a Language. You must create a separate template for each language you want to send in.",
            "Choose a variable format: Positional ({{1}}, {{2}}) or Named ({{first_name}}, {{last_name}}).",
            "Add a Header (optional): None, Text, Image, Video, Document, or Location. Text headers accept up to 60 characters.",
            "Write the Body text (required, up to 1,024 characters). Insert variables using the chosen format.",
            "Add Footer text (optional, up to 60 characters, no variables).",
            "Add Buttons (optional) — see the Template Buttons article for types and limits.",
            "Click Submit to send the template to Meta for review.",
          ],
          warning: "Template names cannot contain spaces or uppercase letters. Use underscores instead of spaces, e.g. order_update not Order Update.",
          tip: "Provide example values for all variables — Meta requires sample text to review templates that contain placeholders.",
        },
        {
          heading: "After Submission",
          paragraphs: [
            "The template status shows as Pending in your Templates list. Meta typically reviews within a few minutes for straightforward templates but can take longer during busy periods.",
            "Once reviewed, the status changes to Approved (ready to use) or Rejected (a reason is shown — fix the issue and resubmit).",
          ],
        },
      ],
    },
    {
      title: "Using Variables in Templates",
      slug: "template-variables",
      description:
        "Personalise templates with dynamic placeholders that are replaced with real contact data when messages are sent.",
      sections: [
        {
          heading: "Variable Formats",
          paragraphs: [
            "WBMSG supports two variable formats. Choose one when creating the template:",
          ],
          steps: [
            "Positional — use {{1}}, {{2}}, {{3}}, etc. in the order they appear in the text. When sending a campaign, you map each number to a contact field or a fixed value.",
            "Named — use {{first_name}}, {{last_name}}, or any other name you define. Named variables make the template easier to read and are recommended when your team shares template management.",
          ],
        },
        {
          heading: "Where Variables Can Be Used",
          paragraphs: [
            "Variables work in the Body text and in Text-type Header fields. Variables cannot be used in the Footer or in button labels.",
            "Always fill in the Example Values section for each variable. Meta requires realistic sample text for every placeholder — templates without examples are rejected.",
          ],
        },
        {
          heading: "Mapping Variables When Sending",
          paragraphs: [
            "When you use a template in a campaign or a one-on-one send, WBMSG shows a variable mapping step. For each variable placeholder, choose:",
          ],
          steps: [
            "A contact field — WBMSG pulls the value from each recipient's profile at send time (e.g. First Name, Email, or any custom field).",
            "Fixed text — a static value sent to every recipient (e.g. a promo code).",
            "A fallback value — used when the mapped contact field is empty for a particular recipient.",
          ],
          tip: "Always set a meaningful fallback. A message reading 'Hi , your order is ready' because the name field was empty looks unprofessional.",
        },
      ],
    },
    {
      title: "Syncing Templates with Meta",
      slug: "sync-templates",
      description:
        "Keep your template statuses up to date and know what to do when templates are approved or rejected.",
      sections: [
        {
          heading: "When to Sync",
          paragraphs: [
            "After submitting a template, Meta reviews it on their servers. WBMSG polls for status updates automatically, but if you need the latest status immediately — for example right after submitting a template — click the Sync Templates button on the Templates page to trigger a manual refresh.",
          ],
        },
        {
          heading: "Running a Sync",
          steps: [
            "Go to Templates in the left sidebar.",
            "Click Sync Templates.",
            "WBMSG calls Meta's API and updates the status of every template in your account.",
            "Approved templates become available for use. Rejected templates show a rejection reason.",
          ],
        },
        {
          heading: "Common Rejection Reasons",
          steps: [
            "Wrong category — a promotional offer submitted as Utility instead of Marketing.",
            "Missing or unrealistic variable examples — placeholders without sample values, or examples that don't reflect real use.",
            "Policy-violating content — content that violates WhatsApp's messaging policies for your region.",
            "Broken or placeholder URLs — CTA buttons with URLs that don't resolve or use placeholder domains like example.com.",
            "Shortened URLs — link shorteners like bit.ly are not permitted in buttons.",
          ],
          warning: "Do not resubmit a rejected template without making changes. Submitting identical content repeatedly can result in your WhatsApp Business Account being flagged by Meta.",
        },
        {
          heading: "Editing and Resubmitting a Rejected Template",
          steps: [
            "Click the rejected template to open it.",
            "Read the rejection reason shown in the status area.",
            "Click Edit Template.",
            "Make changes that address the rejection reason.",
            "Click Submit — the status resets to Pending for a new review.",
          ],
        },
      ],
    },
    {
      title: "Template Analytics",
      slug: "template-analytics",
      description:
        "See delivery and read metrics for each template to understand which ones perform best.",
      sections: [
        {
          heading: "Viewing Analytics",
          steps: [
            "Go to Templates in the left sidebar.",
            "Click on a template name to open it.",
            "Select the Analytics tab.",
            "The analytics page shows four metrics: Sent, Delivered, Read, and Failed.",
          ],
        },
        {
          heading: "What the Metrics Mean",
          steps: [
            "Sent — the total number of times this template was dispatched from your account across all campaigns and one-off sends.",
            "Delivered — messages that were successfully received by the contact's device.",
            "Read — delivered messages that the contact opened (requires the contact to have read receipts enabled).",
            "Failed — messages that could not be delivered, for example due to an invalid number or a blocked contact.",
          ],
        },
        {
          heading: "Using Analytics to Improve Templates",
          paragraphs: [
            "A high Delivered count but low Read count suggests the header or opening line of the body is not compelling enough to open. Consider revising the header text or the first sentence.",
            "A high Failed count relative to Sent may indicate your contact list contains many invalid or inactive numbers.",
          ],
          tip: "Compare similar templates side by side — for example the same offer with two different headers — to see which opening drives more reads.",
        },
      ],
    },
  ],
};
