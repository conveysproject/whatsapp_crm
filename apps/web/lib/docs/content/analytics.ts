import type { DocCategory } from "../types";

export const analytics: DocCategory = {
  title: "Analytics",
  slug: "analytics",
  description: "Understand your team's performance, conversation trends, and campaign results.",
  icon: "📊",
  colorHex: "#059669",
  bgHex: "#D1FAE5",
  articles: [
    {
      title: "Dashboard Overview",
      slug: "dashboard-overview",
      description: "What you see when you first log in to WBMSG.",
      sections: [
        {
          image: {
            src: "/docs/screenshots/analytics/dashboard.png",
            alt: "WBMSG analytics dashboard",
            caption: "The Analytics dashboard — org metrics, agent performance, and conversation trends",
          },
        },
        {
          paragraphs: [
            "The dashboard greets you with a time-aware message — Good morning, Good afternoon, or Good evening — followed by your first name.",
            "A WhatsApp status badge sits at the top of the page. It shows green 'WhatsApp Connected' when your account is linked and receiving messages, or amber 'WhatsApp Disconnected' when the connection is broken.",
          ],
        },
        {
          heading: "Plan Usage Widget",
          paragraphs: [
            "The Plan Usage widget appears on the dashboard and shows how close your organization is to its plan limits.",
            "At the top of the widget, your current plan tier is shown as a badge.",
            "If your organization has reached a plan limit, an amber warning banner lists the features that are currently unavailable and includes an Upgrade link.",
            "Usage bars show consumption for: Contacts, Campaigns, Bots, Flows, Custom Fields, and Team Members.",
            "Feature toggles display the current state of AI Bot (On or Off) and API Access (On or Off).",
          ],
        },
      ],
    },
    {
      title: "Org Metrics & Charts",
      slug: "org-metrics",
      description: "Organization-wide performance metrics visible to Admin and Manager roles.",
      sections: [
        {
          paragraphs: [
            "Org Metrics are visible to users with the Admin or Manager role. Agents and Viewers do not see organization-wide data.",
          ],
        },
        {
          heading: "Metric Cards",
          paragraphs: [
            "Six metric cards appear at the top of the dashboard:",
            "Open Conversations — the number of conversations currently open across all agents.",
            "Total Contacts — the total number of contacts in your organization.",
            "Messages Today — the count of messages sent and received today.",
            "Campaigns Sent This Month — how many campaigns have been dispatched in the current calendar month.",
            "Average First Response Time — the average time between a customer's first message and an agent's first reply.",
            "Bot Conversations — the number of conversations currently being handled by the AI bot.",
          ],
        },
        {
          heading: "Charts and Feeds",
          paragraphs: [
            "The Conversation Trend Chart shows a time-series graph of conversation volume so you can spot busy periods and patterns.",
            "The Campaign Snapshot section shows a recent summary of campaign delivery results.",
            "The Team Leaderboard lists top-performing agents ranked by response speed and message count.",
            "The Activity Feed is an org-wide event log showing recent actions taken by any team member.",
          ],
        },
      ],
    },
    {
      title: "My Work Section",
      slug: "my-work",
      description: "Personal stats and assigned conversations for the current agent.",
      sections: [
        {
          paragraphs: [
            "The My Work section shows each agent their own personal performance stats and the conversations currently assigned to them.",
            "This section is visible to all roles — every agent sees only their own data, not their teammates'.",
            "Use My Work to stay focused on your own queue without being distracted by org-wide numbers.",
          ],
        },
      ],
    },
    {
      title: "Analytics Tabs",
      slug: "analytics-tabs",
      description: "Detailed analytics across conversations, campaigns, and team performance.",
      sections: [
        {
          paragraphs: [
            "Go to Analytics in the sidebar to open the full analytics view. The page is divided into five tabs.",
          ],
        },
        {
          heading: "Overview Tab",
          paragraphs: [
            "The Overview tab shows the same metric cards, conversation trend chart, campaign snapshot, team leaderboard, and activity feed as the main dashboard.",
          ],
        },
        {
          heading: "Conversations Tab",
          paragraphs: [
            "The Conversations tab shows conversation count broken down by status, response time distribution across your team, and conversation duration statistics.",
          ],
        },
        {
          heading: "Campaigns Tab",
          paragraphs: [
            "The Campaigns tab shows campaign performance metrics, delivery rates across all campaigns, and a list of top-performing campaigns.",
          ],
        },
        {
          heading: "Team Tab",
          paragraphs: [
            "The Team tab shows a per-agent table with four columns: Messages Handled, First Response Time, Resolution Rate, and Active Conversations.",
            "Below the table, the team leaderboard ranks agents by overall performance.",
          ],
        },
        {
          heading: "Predictive Tab",
          paragraphs: [
            "The Predictive tab is a placeholder. No data is shown yet — this feature is coming soon.",
          ],
        },
        {
          tip: "Use the Date Range selector at the top of the Analytics page to filter all tabs by a specific time period.",
        },
      ],
    },
  ],
};
