import type { DocCategory } from "../types";

export const trustScore: DocCategory = {
  title: "Trust Score",
  slug: "trust-score",
  description: "Understand and improve your organization's WhatsApp account health score.",
  icon: "⭐",
  colorHex: "#B45309",
  bgHex: "#FEF3C7",
  articles: [
    {
      title: "What is Trust Score?",
      slug: "what-is-trust-score",
      description: "How WBMSG calculates your WhatsApp account health and what the score means.",
      sections: [
        {
          paragraphs: [
            "WBMSG calculates a Trust Score between 0 and 100 for your organization's WhatsApp account. The score is displayed as a large circular gauge on the Trust Score page.",
          ],
        },
        {
          heading: "Grade Labels",
          paragraphs: [
            "Excellent — 80 and above",
            "Good — 60 to 79",
            "Fair — 40 to 59",
            "Needs Attention — below 40",
          ],
        },
        {
          heading: "Score Breakdown",
          paragraphs: [
            "The score is divided into categories. Each category shows your current score out of its maximum with a progress bar:",
            "Response Time — how quickly your team responds to customer messages.",
            "Message Quality — the relevance and quality of outbound messages.",
            "Compliance — adherence to WhatsApp policies and opt-out rules.",
            "Other engagement signals — additional factors such as read rates and conversation resolution.",
          ],
        },
        {
          heading: "Recommendations & History",
          paragraphs: [
            "Below the score breakdown, WBMSG shows an actionable list of recommendations to improve your score. Each recommendation links to the relevant settings page.",
            "A trend chart shows your Trust Score history over time so you can see whether your score is improving or declining.",
          ],
        },
        {
          note: "Trust Score reflects your account's health with Meta. A low score can affect message delivery rates and may trigger Meta restrictions on your WhatsApp Business Account.",
        },
      ],
    },
    {
      title: "Improving Your Trust Score",
      slug: "improving-trust-score",
      description: "Specific actions you can take in each category to raise your Trust Score.",
      sections: [
        {
          heading: "Response Time",
          paragraphs: [
            "Respond to customer messages faster. Even a brief acknowledgement reduces your average response time.",
            "Set up Auto-Replies so customers receive an instant response when no agent is available, including outside business hours.",
          ],
        },
        {
          heading: "Message Quality",
          paragraphs: [
            "Avoid sending spammy or irrelevant content. Only send messages customers expect to receive.",
            "Use approved WhatsApp message templates for outbound marketing and transactional messages.",
            "Do not send unsolicited bulk messages to contacts who have not opted in.",
          ],
        },
        {
          heading: "Compliance",
          paragraphs: [
            "Honor opt-out requests immediately — if a contact asks to stop receiving messages, do not message them again.",
            "Do not attempt to message contacts who have blocked your number.",
          ],
        },
        {
          paragraphs: [
            "Your Trust Score is refreshed daily, so improvements you make today will be reflected within 24 hours.",
          ],
        },
        {
          tip: "Enable an Out-of-Office auto-reply so customers always get a response even outside business hours — this directly improves your Response Time score.",
        },
      ],
    },
  ],
};
