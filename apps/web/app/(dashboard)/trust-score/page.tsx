"use client";
import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";

interface TrustScoreData {
  score: number;
  breakdown: { category: string; score: number; maxScore: number; description: string }[];
  recommendations: string[];
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-500";
  return "text-red-500";
}

function getGaugeRingColor(score: number): string {
  if (score >= 80) return "stroke-green-500";
  if (score >= 60) return "stroke-yellow-400";
  return "stroke-red-500";
}

function getGradeText(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Needs Attention";
}

function getBarColor(score: number, maxScore: number): string {
  const pct = maxScore > 0 ? score / maxScore : 0;
  if (pct >= 0.8) return "bg-green-500";
  if (pct >= 0.6) return "bg-yellow-400";
  return "bg-red-500";
}

function ScoreGauge({ score }: { score: number }): JSX.Element {
  // SVG circle gauge: radius 54, circumference ~339
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const clampedScore = Math.max(0, Math.min(100, score));
  const dashOffset = circumference * (1 - clampedScore / 100);

  return (
    <div className="relative flex items-center justify-center w-40 h-40">
      <svg
        className="absolute inset-0 -rotate-90"
        width="160"
        height="160"
        viewBox="0 0 160 160"
      >
        {/* Track */}
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="12"
        />
        {/* Progress */}
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={getGaugeRingColor(score)}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="flex flex-col items-center">
        <span className={`text-4xl font-bold leading-none ${getScoreColor(score)}`}>
          {Math.round(clampedScore)}
        </span>
        <span className="text-xs text-gray-400 mt-1">out of 100</span>
      </div>
    </div>
  );
}

function BreakdownRow({
  category,
  score,
  maxScore,
  description,
}: {
  category: string;
  score: number;
  maxScore: number;
  description: string;
}): JSX.Element {
  const pct = maxScore > 0 ? Math.min(100, (score / maxScore) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700">{category}</span>
        <span className="text-gray-500 tabular-nums">
          {score}/{maxScore}
        </span>
      </div>
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${getBarColor(score, maxScore)}`}
          style={{ width: `${pct}%`, transition: "width 0.5s ease" }}
        />
      </div>
      {description ? (
        <p className="text-xs text-gray-400">{description}</p>
      ) : null}
    </div>
  );
}

export default function TrustScorePage(): JSX.Element {
  const { getToken } = useAuth();
  const [data, setData] = useState<TrustScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        const apiUrl =
          process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
        const res = await fetch(`${apiUrl}/v1/trust-score`, {
          headers: { Authorization: `Bearer ${token ?? ""}` },
        });
        if (!res.ok) {
          if (!cancelled) {
            setError("Trust score data is not available yet.");
            setLoading(false);
          }
          return;
        }
        const json = (await res.json()) as TrustScoreData;
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Network error loading trust score.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-400">Calculating trust score...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      {/* Header */}
      <h1 className="text-2xl font-semibold">Trust Score</h1>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Empty state — no error, no data */}
      {!loading && !error && !data && (
        <p className="text-sm text-gray-400">No trust score data is available yet.</p>
      )}

      {/* Gauge + breakdown + recommendations — only when data is present */}
      {!loading && !error && data && (
        <>
          {/* Score gauge card */}
          <div className="bg-white border rounded-xl p-8 flex flex-col items-center gap-3 shadow-sm">
            <ScoreGauge score={data.score} />
            <p className={`text-lg font-semibold ${getScoreColor(data.score)}`}>
              {getGradeText(data.score)}
            </p>
            <p className="text-sm text-gray-500 text-center">
              Your organisation&apos;s trust score reflects messaging quality,
              engagement, and compliance.
            </p>
          </div>

          {/* Score Breakdown */}
          {data.breakdown.length > 0 && (
            <div className="bg-white border rounded-xl p-6 shadow-sm space-y-5">
              <h2 className="text-base font-semibold text-gray-800">
                Score Breakdown
              </h2>
              {data.breakdown.map((item) => (
                <BreakdownRow
                  key={item.category}
                  category={item.category}
                  score={item.score}
                  maxScore={item.maxScore}
                  description={item.description}
                />
              ))}
            </div>
          )}

          {/* Recommendations */}
          {data.recommendations.length > 0 && (
            <div className="bg-white border rounded-xl p-6 shadow-sm">
              <h2 className="text-base font-semibold text-gray-800 mb-4">
                Recommendations
              </h2>
              <ul className="space-y-2">
                {data.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-blue-500 font-bold shrink-0">&rarr;</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
