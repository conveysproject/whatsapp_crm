"use client";

import { JSX } from "react";

interface VoiceMessageProps {
  transcript: string | null;
  direction: "inbound" | "outbound";
}

export function VoiceMessage({ transcript, direction }: VoiceMessageProps): JSX.Element {
  return (
    <div className={`max-w-xs rounded-2xl px-4 py-2 ${
      direction === "outbound" ? "bg-wa-light rounded-br-none" : "bg-white border border-gray-200 rounded-bl-none shadow-card"
    }`}>
      <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
        <span>🎤</span>
        <span>Voice message</span>
      </div>
      {transcript ? (
        <p className="text-sm text-gray-800 italic">&ldquo;{transcript}&rdquo;</p>
      ) : (
        <p className="text-xs text-gray-400">Transcribing…</p>
      )}
    </div>
  );
}
