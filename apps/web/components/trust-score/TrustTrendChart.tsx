"use client";

import { JSX } from "react";

interface Point { score: number; recordedAt: string }

interface Props {
  history: Point[];
}

function getLineColor(lastScore: number): string {
  if (lastScore >= 80) return "#22c55e";
  if (lastScore >= 60) return "#eab308";
  return "#ef4444";
}

export function TrustTrendChart({ history }: Props): JSX.Element {
  if (history.length < 2) {
    return (
      <div className="bg-white border rounded-xl p-6 shadow-sm flex items-center justify-center h-32">
        <p className="text-sm text-gray-400">Not enough history yet — check back tomorrow.</p>
      </div>
    );
  }

  const W = 600;
  const H = 120;
  const PAD = { top: 12, right: 12, bottom: 20, left: 28 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const minScore = 0;
  const maxScore = 100;
  const scoreRange = 100;

  function xPos(i: number): number {
    return PAD.left + (i / (history.length - 1)) * innerW;
  }
  function yPos(score: number): number {
    return PAD.top + innerH - ((score - minScore) / scoreRange) * innerH;
  }

  const polylinePoints = history.map((p, i) => `${xPos(i)},${yPos(p.score)}`).join(" ");
  const lastScore = history[history.length - 1]!.score;
  const color = getLineColor(lastScore);

  const firstLabel = new Date(history[0]!.recordedAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "short",
  });
  const lastLabel = new Date(history[history.length - 1]!.recordedAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "short",
  });

  return (
    <div className="bg-white border rounded-xl p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-800 mb-4">Score Trend</h2>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 120 }}>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line
              x1={PAD.left} y1={yPos(v)} x2={W - PAD.right} y2={yPos(v)}
              stroke="#f3f4f6" strokeWidth={1}
            />
            <text x={PAD.left - 4} y={yPos(v) + 4} textAnchor="end" fontSize={9} fill="#9ca3af">{v}</text>
          </g>
        ))}
        <polyline
          points={polylinePoints}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {history.map((p, i) => (
          <circle key={i} cx={xPos(i)} cy={yPos(p.score)} r={2.5} fill={color} />
        ))}
        <text x={PAD.left} y={H - 4} textAnchor="start" fontSize={9} fill="#9ca3af">{firstLabel}</text>
        <text x={W - PAD.right} y={H - 4} textAnchor="end" fontSize={9} fill="#9ca3af">{lastLabel}</text>
      </svg>
    </div>
  );
}
