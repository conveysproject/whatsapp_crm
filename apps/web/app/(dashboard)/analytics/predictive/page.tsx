"use client";
import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";

interface PredictiveContact {
  id: string;
  name: string;
  phone: string;
  trustScore: number | null;
  riskLevel: "high" | "medium" | "low";
  prediction: string;
}

interface PredictiveData {
  churnRisk: PredictiveContact[];
  highValue: PredictiveContact[];
  reorderCandidates: PredictiveContact[];
}

const riskBadgeClass: Record<PredictiveContact["riskLevel"], string> = {
  high: "text-red-600 bg-red-50",
  medium: "text-yellow-600 bg-yellow-50",
  low: "text-green-600 bg-green-50",
};

function SectionDot({ color }: { color: string }): JSX.Element {
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color} mr-2`} />;
}

function ContactRow({
  c,
  showTrustScore,
  trustScoreColor,
}: {
  c: PredictiveContact;
  showTrustScore: boolean;
  trustScoreColor?: string;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-medium text-sm truncate">{c.name || c.phone}</span>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${riskBadgeClass[c.riskLevel]}`}
        >
          {c.riskLevel}
        </span>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {showTrustScore && c.trustScore !== null && (
          <span className={`text-sm font-semibold ${trustScoreColor ?? "text-gray-700"}`}>
            {c.trustScore}
          </span>
        )}
        <Link
          href={`/contacts/${c.id}`}
          className="text-xs text-blue-600 hover:underline"
        >
          View
        </Link>
      </div>
    </div>
  );
}

function Section({
  title,
  dotColor,
  contacts,
  emptyMessage,
  showTrustScore,
  trustScoreColor,
}: {
  title: string;
  dotColor: string;
  contacts: PredictiveContact[];
  emptyMessage: string;
  showTrustScore: boolean;
  trustScoreColor?: string;
}): JSX.Element {
  const visible = contacts.slice(0, 10);
  return (
    <div className="bg-white border rounded-lg p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold flex items-center">
          <SectionDot color={dotColor} />
          {title}
        </h2>
        <span className="text-sm text-gray-500">{contacts.length} contacts</span>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-gray-400">{emptyMessage}</p>
      ) : (
        <div>
          {visible.map((c) => (
            <ContactRow
              key={c.id}
              c={c}
              showTrustScore={showTrustScore}
              trustScoreColor={trustScoreColor}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PredictiveAnalyticsPage(): JSX.Element {
  const { getToken } = useAuth();
  const [data, setData] = useState<PredictiveData>({
    churnRisk: [],
    highValue: [],
    reorderCandidates: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        const apiUrl =
          process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
        const res = await fetch(`${apiUrl}/v1/ai/predictive`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (!res.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const json = (await res.json()) as PredictiveData;
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-400">Analysing your contacts...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Predictive Analytics</h1>
      <Section
        title="Churn Risk"
        dotColor="bg-red-500"
        contacts={data.churnRisk}
        emptyMessage="No contacts at churn risk."
        showTrustScore
      />
      <Section
        title="High Value"
        dotColor="bg-green-500"
        contacts={data.highValue}
        emptyMessage="No high-value contacts identified."
        showTrustScore
        trustScoreColor="text-green-600"
      />
      <Section
        title="Reorder Candidates"
        dotColor="bg-blue-500"
        contacts={data.reorderCandidates}
        emptyMessage="No reorder candidates."
        showTrustScore={false}
      />
    </div>
  );
}
