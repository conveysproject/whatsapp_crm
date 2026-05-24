"use client";
import { useState, type JSX } from "react";
import { Badge } from "@/components/ui/Badge";
import { TemplateActions } from "./TemplateActions";

export interface TemplateData {
  id: string;
  name: string;
  category: string;
  language: string;
  status: "pending" | "approved" | "rejected";
  components: Array<{
    type?: string;
    format?: string;
    cards?: Array<{ components?: Array<{ type?: string; format?: string }> }>;
  }>;
  // Extracted from components at sync
  headerFormat: string | null;
  headerText: string | null;
  bodyText: string | null;
  footerText: string | null;
  buttonCount: number | null;
  // Meta API fields
  qualityScore: string | null;
  qualityDate: string | null;
  qualityReasons: string[] | null;
  rejectedReason: string | null;
  correctCategory: string | null;
  parameterFormat: string | null;
  messageSendTtlSeconds: number | null;
  ctaUrlTrackingOptedOut: boolean | null;
  libraryTemplateName: string | null;
  lastEditedTime: string | null;
  metaTemplateId: string | null;
  createdAt: string;
  updatedAt: string;
}

const statusVariant: Record<string, "yellow" | "green" | "red"> = {
  pending: "yellow",
  approved: "green",
  rejected: "red",
};

const qualityColor: Record<string, string> = {
  GREEN: "bg-green-500",
  YELLOW: "bg-yellow-400",
  RED: "bg-red-500",
};

function formatTtl(seconds: number): string {
  if (seconds % 86400 === 0) return `${seconds / 86400} day${seconds / 86400 !== 1 ? "s" : ""}`;
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds / 3600 !== 1 ? "s" : ""}`;
  return `${seconds}s`;
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-sm text-gray-800 break-all">{value}</span>
    </div>
  );
}

export function TemplateRow({ template: t }: { template: TemplateData }): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const qualityDotClass = t.qualityScore ? (qualityColor[t.qualityScore] ?? null) : null;

  const headerFormat = t.headerFormat && t.headerFormat !== "NONE" ? t.headerFormat : null;

  const imageCardCount = (t.components ?? [])
    .find((c) => c.type?.toUpperCase() === "CAROUSEL")
    ?.cards?.filter((card) =>
      (card.components ?? []).some(
        (cc) =>
          cc.type?.toUpperCase() === "HEADER" &&
          ["IMAGE", "VIDEO", "DOCUMENT"].includes((cc.format ?? "").toUpperCase())
      )
    ).length ?? 0;

  const hasDetail =
    t.bodyText || t.headerText || t.footerText ||
    t.qualityScore || t.rejectedReason || t.correctCategory ||
    t.parameterFormat || t.messageSendTtlSeconds ||
    t.ctaUrlTrackingOptedOut != null || t.libraryTemplateName ||
    t.lastEditedTime || t.metaTemplateId;

  return (
    <div className="divide-y divide-gray-50">
      {/* Compact row */}
      <div className="flex items-center px-4 py-3">
        {/* Name */}
        <div className="flex-1 min-w-0 pr-3">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
            {headerFormat && (
              <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono">
                {headerFormat}
              </span>
            )}
          </div>
          {t.status === "rejected" && t.rejectedReason && (
            <p className="text-xs text-red-400 truncate">{t.rejectedReason.replace(/_/g, " ").toLowerCase()}</p>
          )}
        </div>

        {/* Language */}
        <span className="w-20 shrink-0 text-sm text-gray-600">{t.language}</span>

        {/* Category */}
        <span className="w-28 shrink-0 text-sm text-gray-600 capitalize">{t.category.toLowerCase()}</span>

        {/* Status */}
        <div className="w-24 shrink-0 flex items-center gap-1.5">
          <Badge variant={statusVariant[t.status] ?? "gray"}>{t.status}</Badge>
          {qualityDotClass && (
            <span className={`inline-block w-2 h-2 rounded-full ${qualityDotClass}`} title={`Quality: ${t.qualityScore}`} />
          )}
        </div>

        {/* Updated On */}
        <span className="w-32 shrink-0 text-sm text-gray-500">
          {new Date(t.updatedAt).toLocaleDateString()}
        </span>

        {/* Action */}
        <div className="w-20 shrink-0 flex items-center justify-end gap-1">
          <TemplateActions
            templateId={t.id}
            templateName={t.name}
            headerFormat={
              (t.components ?? []).find(
                (c) =>
                  c.type?.toUpperCase() === "HEADER" &&
                  ["IMAGE", "VIDEO", "DOCUMENT"].includes((c.format ?? "").toUpperCase())
              )?.format?.toUpperCase()
            }
            imageCardCount={imageCardCount}
          />
          {hasDetail && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-gray-400 hover:text-gray-600 transition-transform duration-150"
              style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              ›
            </button>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {expanded && (
        <div className="px-4 py-4 bg-gray-50 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left — template content */}
          <div className="space-y-4">
            {t.bodyText && (
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Body</p>
                <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono bg-white border border-gray-100 rounded p-2 max-h-40 overflow-y-auto">
                  {t.bodyText}
                </pre>
              </div>
            )}
            {t.headerText && (
              <DetailField label="Header text" value={t.headerText} />
            )}
            {t.footerText && (
              <DetailField label="Footer" value={t.footerText} />
            )}
            {(t.buttonCount ?? 0) > 0 && (
              <DetailField label="Buttons" value={`${t.buttonCount} button${t.buttonCount !== 1 ? "s" : ""}`} />
            )}
          </div>

          {/* Right — Meta metadata */}
          <div className="space-y-3">
            {t.qualityScore && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Quality</span>
                <div className="flex items-center gap-1.5">
                  {qualityDotClass && <span className={`w-2 h-2 rounded-full ${qualityDotClass}`} />}
                  <span className="text-sm text-gray-800">{t.qualityScore}</span>
                  {t.qualityDate && (
                    <span className="text-xs text-gray-400">({new Date(t.qualityDate).toLocaleDateString()})</span>
                  )}
                </div>
                {t.qualityReasons && t.qualityReasons.length > 0 && (
                  <ul className="mt-1 text-xs text-gray-500 list-disc list-inside space-y-0.5">
                    {t.qualityReasons.map((r) => <li key={r}>{r.replace(/_/g, " ").toLowerCase()}</li>)}
                  </ul>
                )}
              </div>
            )}
            {t.rejectedReason && (
              <DetailField label="Rejection reason" value={t.rejectedReason.replace(/_/g, " ").toLowerCase()} />
            )}
            {t.correctCategory && t.correctCategory.toLowerCase() !== t.category && (
              <DetailField label="Suggested category" value={t.correctCategory.toLowerCase()} />
            )}
            {t.parameterFormat && (
              <DetailField label="Parameter format" value={t.parameterFormat.toLowerCase()} />
            )}
            {t.messageSendTtlSeconds != null && (
              <DetailField label="Message TTL" value={formatTtl(t.messageSendTtlSeconds)} />
            )}
            {t.ctaUrlTrackingOptedOut != null && (
              <DetailField label="CTA URL tracking" value={t.ctaUrlTrackingOptedOut ? "opted out" : "enabled"} />
            )}
            {t.libraryTemplateName && (
              <DetailField label="Library template" value={t.libraryTemplateName} />
            )}
            {t.lastEditedTime && (
              <DetailField label="Last edited" value={new Date(t.lastEditedTime).toLocaleString()} />
            )}
            {t.metaTemplateId && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-gray-400 uppercase tracking-wide">Meta ID</span>
                <code className="text-xs text-gray-700 font-mono bg-white border border-gray-100 rounded px-1.5 py-0.5 select-all">
                  {t.metaTemplateId}
                </code>
              </div>
            )}
            <DetailField
              label="Synced"
              value={new Date(t.updatedAt).toLocaleString()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
