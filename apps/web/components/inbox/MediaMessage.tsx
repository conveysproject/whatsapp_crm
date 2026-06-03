"use client";

import { JSX } from "react";

interface Props {
  mediaUrl: string;
  contentType: string;
  filename?: string;
}

function resolveUrl(mediaUrl: string): string {
  return mediaUrl.startsWith("wamid:") ? `/api/v1/media/${mediaUrl.slice(6)}` : mediaUrl;
}

export function MediaMessage({ mediaUrl, contentType, filename }: Props): JSX.Element {
  const src = resolveUrl(mediaUrl);
  if (contentType === "image") {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={filename ?? "image"}
          className="max-w-[240px] max-h-[240px] rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
        />
      </a>
    );
  }

  if (contentType === "video") {
    return (
      <video
        src={src}
        controls
        className="max-w-[240px] rounded-lg"
      />
    );
  }

  if (contentType === "document") {
    return (
      <a
        href={src}
        download={filename}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors text-sm"
      >
        <svg className="w-5 h-5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <span className="truncate max-w-[160px] text-gray-700">{filename ?? "Document"}</span>
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </a>
    );
  }

  // Fallback for unknown media types
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-brand-600 underline"
    >
      {filename ?? "View media"}
    </a>
  );
}
