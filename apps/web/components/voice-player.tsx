"use client";

import { JSX, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";

interface Props {
  mediaUrl: string;
  messageId: string;
  duration?: number;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m)}:${String(s).padStart(2, "0")}`;
}

function resolveUrl(mediaUrl: string): string {
  return mediaUrl.startsWith("wamid:") ? `/api/v1/media/${mediaUrl.slice(6)}` : mediaUrl;
}

export function VoicePlayer({ mediaUrl, messageId, duration }: Props): JSX.Element {
  const audioSrc = resolveUrl(mediaUrl);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState<number>(duration ?? 0);
  const [showTranscript, setShowTranscript] = useState(false);

  const { getToken } = useAuth();

  const { data: transcriptionData, isLoading: transcriptLoading } = useQuery({
    queryKey: ["transcription", messageId],
    queryFn: async (): Promise<string | null> => {
      const token = await getToken();
      const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
      const res = await fetch(`${api}/v1/messages/${messageId}/transcribe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!res.ok) return null;
      const json = await res.json() as { data: { transcript: string } };
      return json.data.transcript;
    },
    enabled: showTranscript,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

  function handlePlayPause(): void {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => { setIsPlaying(false); });
      setIsPlaying(true);
    }
  }

  function handleTimeUpdate(): void {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime);
    if (audio.duration && !isNaN(audio.duration)) {
      setTotalDuration(audio.duration);
    }
  }

  function handleEnded(): void {
    setIsPlaying(false);
    setCurrentTime(0);
  }

  function handleLoadedMetadata(): void {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.duration && !isNaN(audio.duration)) {
      setTotalDuration(audio.duration);
    }
  }

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>): void {
    const audio = audioRef.current;
    if (!audio || !totalDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    const newTime = fraction * totalDuration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }

  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  let transcriptContent: JSX.Element;
  if (transcriptLoading) {
    transcriptContent = (
      <p className="text-xs text-gray-400 italic">Transcribing...</p>
    );
  } else {
    transcriptContent = (
      <p className={transcriptionData ? "text-xs text-gray-600" : "text-xs text-gray-400 italic"}>
        {transcriptionData ?? "No transcript available."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 min-w-[200px]">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={audioSrc}
        preload="none"
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onLoadedMetadata={handleLoadedMetadata}
        className="hidden"
      />

      {/* Controls row */}
      <div className="flex items-center gap-2">
        {/* Play/pause button */}
        <button
          onClick={handlePlayPause}
          className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center hover:bg-green-600 transition-colors"
          aria-label={isPlaying ? "Pause" : "Play"}
          type="button"
        >
          {isPlaying ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="white"
              className="w-4 h-4"
            >
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="white"
              className="w-4 h-4 ml-0.5"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Progress bar + time */}
        <div className="flex flex-col gap-1 flex-1">
          {/* Progress track */}
          <div
            className="relative h-1.5 bg-gray-200 rounded-full cursor-pointer"
            onClick={handleProgressClick}
          >
            <div
              className="absolute inset-y-0 left-0 bg-green-500 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Time display */}
          <p className="text-[10px] text-gray-400 leading-none">
            {formatDuration(currentTime)} / {formatDuration(totalDuration)}
          </p>
        </div>
      </div>

      {/* Transcript toggle */}
      <button
        type="button"
        onClick={() => { setShowTranscript((prev) => !prev); }}
        className="text-[10px] text-green-600 hover:text-green-700 self-start underline"
      >
        {showTranscript ? "Hide transcript" : "Show transcript"}
      </button>

      {/* Transcript content */}
      {showTranscript && (
        <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
          {transcriptContent}
        </div>
      )}
    </div>
  );
}
