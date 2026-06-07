"use client";
import { JSX, useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSocket } from "@/lib/socket";
import { useRouter } from "next/navigation";

interface Notification {
  id: string;
  type: string;
  message: string | null;
  action: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  data: Notification[];
  unreadCount: number;
}

export function NotificationBell(): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const qc = useQueryClient();

  const { data } = useQuery<NotificationsResponse>({
    queryKey: ["notifications"],
    queryFn: () =>
      fetch("/api/v1/notifications").then((r) => r.json() as Promise<NotificationsResponse>),
    refetchInterval: 30_000, // fallback poll every 30s
  });

  // Real-time: refetch on socket notification event
  useEffect(() => {
    const socket = getSocket();
    function onNotification() {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    }
    socket.on("notification", onNotification);
    return () => { socket.off("notification", onNotification); };
  }, [qc]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function markAllRead() {
    await fetch("/api/v1/notifications/read-all", { method: "PUT" });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function handleNotificationClick(n: Notification) {
    await fetch(`/api/v1/notifications/${n.id}/read`, { method: "PUT" });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
    setOpen(false);
    if (n.action) router.push(n.action);
  }

  const notifications = data?.data ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const typeLabel: Record<string, string> = {
    conversation_assigned: "Assigned to you",
    new_message: "New message",
  };

  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-1.5 text-gray-500 hover:text-gray-700 focus:outline-none rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-sm text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => void markAllRead()}
                className="text-xs text-blue-600 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 && (
              <p className="px-4 py-8 text-sm text-center text-gray-400">
                No notifications yet
              </p>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => void handleNotificationClick(n)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3 ${
                  !n.readAt ? "bg-blue-50/60" : ""
                }`}
              >
                <span
                  className={`mt-1 flex-shrink-0 w-2 h-2 rounded-full ${
                    !n.readAt ? "bg-blue-500" : "bg-transparent"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-500 mb-0.5">
                    {typeLabel[n.type] ?? n.type}
                  </p>
                  <p className="text-sm text-gray-800 leading-snug">{n.message}</p>
                  <p className="text-xs text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
