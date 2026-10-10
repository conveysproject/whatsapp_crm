import { JSX } from "react";
import { MetricCard } from "./MetricCard";
import { formatDuration } from "@/lib/format";


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
