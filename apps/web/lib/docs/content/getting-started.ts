import type { DocCategory } from "../types";

export const gettingStarted: DocCategory = {
  title: "Getting Started",
  slug: "getting-started",
  description: "Everything you need to get up and running with WBMSG.",
  icon: "🚀",
  colorHex: "#059669",
  bgHex: "#D1FAE5",
  articles: [
    {
      title: "What is WBMSG?",
      slug: "what-is-wbmsg",
      description:
        "An introduction to WBMSG — the WhatsApp-first CRM built for small and medium businesses.",
      sections: [
        {
          paragraphs: [
            "WBMSG is a WhatsApp-first CRM designed for small and medium businesses that use WhatsApp to communicate with customers. It connects to your official WhatsApp Business Account via the Meta Business API, giving your whole team access to a single shared inbox.",
            "Multiple agents can handle conversations simultaneously, so no customer message gets missed and no two agents reply to the same thread.",
          ],
        },
        {
          heading: "Key Features",
          steps: [
            "Shared team inbox — all WhatsApp conversations in one place",
            "Contact & deal management — track leads and pipelines",
            "Broadcast campaigns — send approved template messages to segments",
            "Automation flows — trigger message sequences based on events",
            "AI smart replies — context-aware reply suggestions",
            "Analytics — conversation and campaign performance metrics",
            "Trust score — contact engagement and quality indicator",
          ],
        },
        {
          heading: "Plans & Pricing",
          paragraphs: [
            "All plans include a 14-day free trial with no credit card required.",
          ],
          steps: [
            "Starter — $12/month · 3 agents · 1,000 contacts",
            "Growth — $36/month · 10 agents · 10,000 contacts",
            "Scale — $96/month · Unlimited agents · 100,000 contacts",
          ],
        },
      ],
    },
    {
      title: "Creating Your Account",
      slug: "create-account",
      description:
        "How to sign up for WBMSG and complete the business details form.",
      sections: [
        {
          paragraphs: [
            "Go to wbmsg.com/sign-up to create your account. After signing in you will be taken to the Business Details form (Step 2 of 2) to finish setting up your organization.",
          ],
        },
        {
          heading: "Business Details Form",
          steps: [
            "Company Website — enter your website URL (www. is added automatically if omitted)",
            "Company Location — your city, region, or country (maximum 48 characters)",
            "Industry — choose from 15 industry categories, then pick a sub-category",
            "Annual Revenue — select the band that best fits your business (ranges from 'Less than $10K' to 'More than $50M')",
            "Accept the Terms of Service and Privacy Policy checkbox",
            "Click 'Create Account' to complete setup",
          ],
        },
        {
          paragraphs: [
            "Your data is stored securely and is compliant with India's Digital Personal Data Protection (DPDP) Act.",
          ],
          tip: "The 14-day free trial starts the moment you complete this form — no credit card is required.",
        },
      ],
    },
    {
      title: "Connecting Your WhatsApp Business Account",
      slug: "connect-whatsapp",
      description:
        "How to link your Meta WhatsApp Business Account to WBMSG so your team can start messaging.",
      sections: [
        {
          heading: "Before You Begin",
          paragraphs: [
            "You need a Meta Business Account and a WhatsApp Business Account (WABA) before connecting to WBMSG. If you do not have these yet, create them at business.facebook.com.",
          ],
        },
        {
          heading: "Step 1 — Connect Your WABA",
          steps: [
            "Open the onboarding checklist (shown after signup)",
            "Click 'Connect WhatsApp Business Account'",
            "The ConnectWhatsApp modal opens — follow the Meta Embedded Signup flow to authorize WBMSG to access your WABA",
          ],
        },
        {
          heading: "Step 2 — Provision Your Phone Number",
          steps: [
            "After connecting your WABA you are taken to the Provision Phone Number page",
            "Click 'Open Meta Business Manager' to add or verify your phone number in Meta",
            "Once your number is verified and ready, return to WBMSG and click 'Number is ready — continue'",
          ],
          warning:
            "Your phone number must be verified in Meta Business Manager before clicking 'Number is ready — continue'. Skipping this step will prevent messages from being sent or received.",
        },
      ],
    },
    {
      title: "Inviting Team Members",
      slug: "invite-team",
      description:
        "Add agents, managers, and admins to your WBMSG workspace.",
      sections: [
        {
          heading: "How to Invite",
          paragraphs: [
            "You can invite team members from the onboarding checklist ('Invite your team' step) or at any time from Settings > Members > Invite.",
          ],
          steps: [
            "Enter the team member's email address",
            "Select their role from the dropdown (Admin, Manager, Agent, or Viewer)",
            "Click 'Invite' — the invited member is shown with a checkmark once the email has been sent",
          ],
        },
        {
          heading: "Roles Explained",
          steps: [
            "Super Admin / Admin — full access to all features and settings",
            "Manager — most permissions with team-level visibility",
            "Agent — access to inbox, contacts, and core actions only",
            "Viewer — read-only access across the platform",
          ],
          tip: "You can change a member's role at any time from Settings > Members.",
        },
      ],
    },
    {
      title: "Completing the Onboarding Checklist",
      slug: "onboarding-checklist",
      description:
        "A walkthrough of the three-step onboarding checklist shown after signup.",
      sections: [
        {
          paragraphs: [
            "After signing up you are shown a three-step onboarding checklist. Each step links directly to the relevant page so you can complete setup without hunting through menus.",
          ],
        },
        {
          heading: "The Three Steps",
          steps: [
            "Connect WhatsApp Business Account — authorizes WBMSG to access your WABA (/connect-waba)",
            "Provision phone number — verifies your WhatsApp number in Meta Business Manager (/provision-number)",
            "Invite your team — sends email invitations to your agents (/invite-team)",
          ],
        },
        {
          heading: "Progress & Completion",
          paragraphs: [
            "Each step shows a checkmark once it is complete. When all three steps are done, a 'Go to Dashboard' button appears.",
            "A 'Skip for now' option is available once your phone number has been provisioned.",
          ],
          note: "You can return to the checklist at any time if you skipped steps — it remains accessible until all three steps are marked complete.",
        },
      ],
    },
  ],
};
