"use client";

import { JSX, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Props {
  contactId: string;
  lazy?: boolean;
}

interface TrustResult {
  score: number;
  label: string;
}

function labelStyle(label: string): { bg: string; text: string; dot: string } {
  if (label === "high")   return { bg: "bg-green-50",  text: "text-green-700",  dot: "bg-green-500" };
  if (label === "medium") return { bg: "bg-yellow-50", text: "text-yellow-700", dot: "bg-yellow-400" };
  if (label === "low")    return { bg: "bg-red-50",    text: "text-red-700",    dot: "bg-red-500" };
  return                         { bg: "bg-gray-50",   text: "text-gray-500",   dot: "bg-gray-400" };
}

export function ContactTrustBadge({ contactId, lazy = false }: Props): JSX.Element {
  const { getToken } = useAuth();
  const [trust, setTrust] = useState<TrustResult | null>(null);
  const [visible, setVisible] = useState(!lazy);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!lazy) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [lazy]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void (async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/${contactId}/trust-score`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok || cancelled) return;
      const json = await res.json() as { data: TrustResult };
      if (!cancelled) setTrust(json.data);
    })();
    return () => { cancelled = true; };
  }, [visible, contactId, getToken]);

  if (!trust) {
    return <span ref={ref} className="inline-block w-10 h-5 bg-gray-100 rounded-full animate-pulse" />;
  }

  const { bg, text, dot } = labelStyle(trust.label);
  const labelText = trust.label === "very_low"
    ? "Very Low"
    : trust.label.charAt(0).toUpperCase() + trust.label.slice(1);

  return (
    <span
      ref={ref}
      className={`inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] font-semibold ${bg} ${text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {labelText}
    </span>
  );
}
