import { JSX } from "react";
import { MetricCard } from "./MetricCard";

function formatDuration(secs: number): string {
  if (secs === 0) return "—";
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

interface OrgMetricCardsProps {
  openConversations: number;
  totalContacts: number;
  messagesToday: number;
  campaignsSentThisMonth: number;
  avgFirstResponseTime: number;
  botConversations: number;
}

export function OrgMetricCards(props: OrgMetricCardsProps): JSX.Element {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <MetricCard label="Open Conversations" value={props.openConversations} />
      <MetricCard label="Total Contacts" value={props.totalContacts} />
      <MetricCard label="Messages Today" value={props.messagesToday} />
      <MetricCard label="Campaigns This Month" value={props.campaignsSentThisMonth} />
      <MetricCard label="Avg First Response" value={formatDuration(props.avgFirstResponseTime)} />
      <MetricCard label="Bot Conversations" value={props.botConversations} />
    </div>
  );
}
