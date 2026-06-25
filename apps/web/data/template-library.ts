import type { TemplateCategory } from "@/app/(dashboard)/templates/new/templateFormTypes";

export type LibraryDisplayCategory =
  | "INFORMATIVE"
  | "PROMOTIONAL"
  | "TRANSACTIONAL"
  | "SERVICE_ALERTS"
  | "LEAD_QUALIFICATION"
  | "OCCASION_BASED";

export interface LibraryButton {
  text: string;
  type: "quick_reply";
}

export interface LibraryTemplate {
  id: string;
  displayCategory: LibraryDisplayCategory;
  title: string;
  name: string;
  body: string;
  buttons: LibraryButton[];
  metaCategory: TemplateCategory;
}

export const LIBRARY_DISPLAY_LABELS: Record<LibraryDisplayCategory, string> = {
  INFORMATIVE: "INFORMATIVE",
  PROMOTIONAL: "PROMOTIONAL",
  TRANSACTIONAL: "TRANSACTIONAL",
  SERVICE_ALERTS: "SERVICE ALERTS",
  LEAD_QUALIFICATION: "LEAD QUALIFICATION",
  OCCASION_BASED: "OCCASION BASED",
};

export const DISPLAY_CATEGORY_ORDER: LibraryDisplayCategory[] = [
  "INFORMATIVE",
  "PROMOTIONAL",
  "TRANSACTIONAL",
  "SERVICE_ALERTS",
  "LEAD_QUALIFICATION",
  "OCCASION_BASED",
];

export const TEMPLATE_LIBRARY: LibraryTemplate[] = [
  // ── INFORMATIVE ──────────────────────────────────────────────────────────────
  {
    id: "welcome_new_customer",
    displayCategory: "INFORMATIVE",
    title: "Welcome Aboard!",
    name: "welcome_new_customer",
    body: "Hi {{1}} 👋,\nWelcome to {{2}}! We're thrilled to have you with us.\n\nFeel free to reach out anytime — our team is always here to help you.",
    buttons: [{ text: "Say Hello", type: "quick_reply" }],
    metaCategory: "utility",
  },

  // ── PROMOTIONAL ──────────────────────────────────────────────────────────────
  {
    id: "promo_offer_announcement",
    displayCategory: "PROMOTIONAL",
    title: "Limited-Time Deal Inside",
    name: "promo_offer_announcement",
    body: "Hey {{1}}! 🎁\nWe've got something special lined up just for you — a limited-time offer you won't want to miss.\n\nTap below to see what's waiting. Hurry, it won't last long!",
    buttons: [
      { text: "See Offer", type: "quick_reply" },
      { text: "STOP", type: "quick_reply" },
    ],
    metaCategory: "marketing",
  },
  {
    id: "new_arrivals_announcement",
    displayCategory: "PROMOTIONAL",
    title: "Something New Just Dropped",
    name: "new_arrivals_announcement",
    body: "Hi {{1}},\nFresh arrivals are here and they're exactly what you've been looking for! Browse our newest collection before it sells out. ✨",
    buttons: [
      { text: "Browse Now", type: "quick_reply" },
      { text: "STOP", type: "quick_reply" },
    ],
    metaCategory: "marketing",
  },
  {
    id: "product_recommendation",
    displayCategory: "PROMOTIONAL",
    title: "Picked Just for You",
    name: "product_recommendation",
    body: "Hello {{1}},\nWe put together a list of items we think you'll love based on your history with us. Take a peek — your next favourite might be in there! 💡",
    buttons: [
      { text: "View Picks", type: "quick_reply" },
      { text: "STOP", type: "quick_reply" },
    ],
    metaCategory: "marketing",
  },

  // ── TRANSACTIONAL ─────────────────────────────────────────────────────────────
  {
    id: "order_confirmation",
    displayCategory: "TRANSACTIONAL",
    title: "Order Received — We're On It",
    name: "order_confirmation",
    body: "Hi {{1}},\nGreat news — we've received your order #{{2}} and it's being prepared. We'll send you an update as soon as it ships. 📦\n\nQuestions? Just reply here.",
    buttons: [{ text: "Track My Order", type: "quick_reply" }],
    metaCategory: "utility",
  },
  {
    id: "payment_successful",
    displayCategory: "TRANSACTIONAL",
    title: "Payment Confirmed ✅",
    name: "payment_successful",
    body: "Hi {{1}},\nWe've confirmed your payment for order #{{2}}. Everything is in order and we're getting it ready for you. 🙌\n\nNeed anything? We're a message away.",
    buttons: [{ text: "Contact Us", type: "quick_reply" }],
    metaCategory: "utility",
  },
  {
    id: "subscription_renewal_reminder",
    displayCategory: "TRANSACTIONAL",
    title: "Your Subscription Renews Soon",
    name: "subscription_renewal_reminder",
    body: "Hello {{1}},\nA quick heads-up — your subscription renews on {{2}}. Renew now to keep things running smoothly without any interruption. 🔄",
    buttons: [
      { text: "Renew Now", type: "quick_reply" },
      { text: "Get Help", type: "quick_reply" },
    ],
    metaCategory: "utility",
  },

  // ── SERVICE ALERTS ────────────────────────────────────────────────────────────
  {
    id: "shipping_update",
    displayCategory: "SERVICE_ALERTS",
    title: "Your Order is on Its Way",
    name: "shipping_update",
    body: "Good news, {{1}}! 🚚\nYour order #{{2}} has been dispatched and is heading your way. Reply to this message if you have any questions while you wait.",
    buttons: [{ text: "Track Shipment", type: "quick_reply" }],
    metaCategory: "utility",
  },
  {
    id: "service_downtime_alert",
    displayCategory: "SERVICE_ALERTS",
    title: "Scheduled Maintenance Notice",
    name: "service_downtime_alert",
    body: "Hi {{1}},\nWe'll be performing scheduled maintenance on {{2}}. Some features may be briefly unavailable during this window. We appreciate your patience and will be back to full speed quickly. 🔧",
    buttons: [{ text: "Learn More", type: "quick_reply" }],
    metaCategory: "utility",
  },
  {
    id: "account_security_alert",
    displayCategory: "SERVICE_ALERTS",
    title: "New Sign-In Detected",
    name: "account_security_alert",
    body: "Hi {{1}},\nWe noticed a sign-in to your account from a new device or location. If that was you, you're all set. If not, please secure your account right away. 🔐",
    buttons: [{ text: "Secure Account", type: "quick_reply" }],
    metaCategory: "utility",
  },

  // ── LEAD QUALIFICATION ────────────────────────────────────────────────────────
  {
    id: "customer_feedback_request",
    displayCategory: "LEAD_QUALIFICATION",
    title: "How Did We Do?",
    name: "customer_feedback_request",
    body: "Hi {{1}},\nWe'd love to hear about your experience with us. Your honest feedback helps us serve you better — it only takes a minute! 📝",
    buttons: [
      { text: "Share Feedback", type: "quick_reply" },
      { text: "STOP", type: "quick_reply" },
    ],
    metaCategory: "marketing",
  },

  // ── OCCASION BASED ────────────────────────────────────────────────────────────
  {
    id: "birthday_wishes",
    displayCategory: "OCCASION_BASED",
    title: "Happy Birthday! 🎂",
    name: "birthday_wishes",
    body: "Dear {{1}},\nWishing you a wonderful birthday! 🎉 We hope your day is as special as you are. Thank you for being part of our journey.",
    buttons: [
      { text: "Thank You", type: "quick_reply" },
      { text: "STOP", type: "quick_reply" },
    ],
    metaCategory: "marketing",
  },
  {
    id: "event_invitation",
    displayCategory: "OCCASION_BASED",
    title: "You're Invited! 🎈",
    name: "event_invitation",
    body: "Hello {{1}},\nWe're hosting something exciting and we'd love for you to join us! Come connect, learn, and have a great time with us. Save the date! 📅",
    buttons: [
      { text: "Count Me In", type: "quick_reply" },
      { text: "STOP", type: "quick_reply" },
    ],
    metaCategory: "marketing",
  },
  {
    id: "special_thank_you_message",
    displayCategory: "OCCASION_BASED",
    title: "A Big Thank You 🌟",
    name: "special_thank_you_message",
    body: "Dear {{1}},\nWe just wanted to take a moment to say — thank you. Your trust and support genuinely mean everything to us. We look forward to continuing to serve you well.",
    buttons: [
      { text: "Always Welcome", type: "quick_reply" },
      { text: "STOP", type: "quick_reply" },
    ],
    metaCategory: "marketing",
  },
];

export function getLibraryTemplate(id: string): LibraryTemplate | undefined {
  return TEMPLATE_LIBRARY.find((t) => t.id === id);
}

export function groupByCategory(
  templates: LibraryTemplate[]
): Record<LibraryDisplayCategory, LibraryTemplate[]> {
  const groups = {} as Record<LibraryDisplayCategory, LibraryTemplate[]>;
  for (const cat of DISPLAY_CATEGORY_ORDER) {
    groups[cat] = [];
  }
  for (const t of templates) {
    groups[t.displayCategory].push(t);
  }
  return groups;
}
