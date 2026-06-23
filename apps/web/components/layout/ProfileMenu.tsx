"use client";
import { JSX, useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useClerk, useUser, useAuth } from "@clerk/nextjs";
import { AvailabilityConfirmModal } from "./AvailabilityConfirmModal";

interface UserMe {
  id: string;
  fullName: string | null;
  email: string;
  role: string;
  availability: string;
}

interface OrgMe {
  id: string;
  name: string;
  planTier: string;
  phone: string | null;
}

function initials(name: string | null | undefined, email: string): string {
  if (name) {
    const parts = name.trim().split(" ");
    return parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : name.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function ProfileMenu(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { signOut, openUserProfile } = useClerk();
  const { user: clerkUser } = useUser();
  const { orgRole } = useAuth();
  const qc = useQueryClient();

  const { data: userData } = useQuery<{ data: UserMe }>({
    queryKey: ["user-me"],
    queryFn: () => fetch("/api/v1/users/me").then((r) => r.json() as Promise<{ data: UserMe }>),
  });

  const { data: orgData } = useQuery<{ data: OrgMe }>({
    queryKey: ["org-me"],
    queryFn: () => fetch("/api/v1/organizations/me").then((r) => r.json() as Promise<{ data: OrgMe }>),
  });

  const setAvailability = useMutation({
    mutationFn: (availability: string) =>
      fetch("/api/v1/users/me/availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availability }),
      }).then((r) => r.json()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["user-me"] }),
  });

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  // Close panel on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const user = userData?.data;
  const org = orgData?.data;
  const isOnline = user?.availability !== "away";
  const userInitials = initials(user?.fullName, user?.email ?? "");
  const imageUrl = clerkUser?.imageUrl;

  function handleAvailabilityToggle() {
    if (isOnline) {
      setShowOfflineModal(true);
    } else {
      setAvailability.mutate("online");
    }
  }

  function confirmGoOffline() {
    setShowOfflineModal(false);
    setAvailability.mutate("away");
  }

  function copyOrgId() {
    if (org?.id) {
      void navigator.clipboard.writeText(org.id);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      setCopied(true);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    }
  }

  const planLabel: Record<string, string> = {
    starter: "Starter",
    growth: "Growth",
    professional: "Professional",
    scale: "Scale",
    enterprise: "Enterprise",
  };

  // Platform role drives all access control (DB User.role). Clerk role is identity-only.
  const platformRoleLabel: Record<string, string> = {
    superAdmin: "Super Admin",
    admin: "Admin",
    manager: "Manager",
    agent: "Agent",
    viewer: "Viewer",
  };
  function clerkRoleLabel(r: string | null | undefined): string {
    if (!r) return "—";
    const base = r.replace(/^org:/, "");
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  return (
    <>
      {showOfflineModal && (
        <AvailabilityConfirmModal
          onConfirm={confirmGoOffline}
          onCancel={() => setShowOfflineModal(false)}
        />
      )}

      <div className="relative" ref={ref}>
        {/* Avatar button */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="relative flex items-center justify-center w-9 h-9 rounded-full bg-emerald-500 text-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-400 overflow-hidden"
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={user?.fullName ?? "avatar"} className="w-full h-full object-cover" />
          ) : (
            userInitials
          )}
          {/* Online/Away dot */}
          <span
            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${
              isOnline ? "bg-emerald-400" : "bg-gray-400"
            }`}
          />
        </button>

        {/* Panel */}
        {open && (
          <div className="absolute right-0 top-11 w-80 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
            {/* USER DETAILS */}
            <div className="px-5 pt-5 pb-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                User Details
              </p>
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-shrink-0 w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-white font-bold text-base overflow-hidden">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt={user?.fullName ?? "avatar"} className="w-full h-full object-cover" />
                  ) : (
                    userInitials
                  )}
                  <span
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                      isOnline ? "bg-emerald-400" : "bg-gray-400"
                    }`}
                  />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">
                    {user?.fullName ?? user?.email ?? "—"}
                  </p>
                  <p className="text-xs text-emerald-500 flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full inline-block ${isOnline ? "bg-emerald-500" : "bg-gray-400"}`} />
                    {isOnline ? "Online" : "Away"}
                  </p>
                </div>
              </div>

              {/* Roles: platform (access control) + Clerk (identity) */}
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium px-2 py-0.5">
                  Platform: {platformRoleLabel[user?.role ?? ""] ?? user?.role ?? "—"}
                </span>
                <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5">
                  Clerk: {clerkRoleLabel(orgRole)}
                </span>
              </div>

              {/* Availability toggle */}
              <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2.5">
                <span className="text-sm text-gray-700 font-medium">Set Your Availability</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{isOnline ? "Online" : "Away"}</span>
                  <button
                    type="button"
                    onClick={handleAvailabilityToggle}
                    disabled={setAvailability.isPending}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-60 ${
                      isOnline ? "bg-emerald-500" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        isOnline ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* ACCOUNT SUMMARY */}
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                Account Summary
              </p>

              {/* Org card */}
              <div className="bg-gray-900 rounded-lg px-4 py-3 mb-3 flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold text-sm truncate max-w-[140px]">
                    {org?.name ?? "—"}
                  </p>
                  <button
                    onClick={copyOrgId}
                    className="text-xs text-gray-400 hover:text-white transition-colors mt-0.5 flex items-center gap-1"
                  >
                    {copied ? "Copied!" : "Copy Org ID"}
                    {!copied && (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">
                    {planLabel[org?.planTier ?? ""] ?? org?.planTier ?? "—"} Plan
                  </p>
                  <a
                    href="/settings/billing"
                    className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    Manage →
                  </a>
                </div>
              </div>

              {/* WA Number */}
              {org?.phone && (
                <div className="flex items-center gap-2 py-2">
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M11.97 0C5.357 0 0 5.358 0 11.97c0 2.104.547 4.079 1.504 5.798L0 24l6.404-1.48A11.932 11.932 0 0011.97 23.94C18.582 23.94 24 18.582 24 11.97 24 5.358 18.582 0 11.97 0zm0 21.894a9.896 9.896 0 01-5.038-1.374l-.361-.214-3.741.981.998-3.648-.235-.374A9.869 9.869 0 012.07 11.97c0-5.464 4.446-9.91 9.9-9.91 5.453 0 9.9 4.446 9.9 9.91 0 5.453-4.447 9.924-9.9 9.924z"/>
                  </svg>
                  <span className="text-sm text-gray-700">{org.phone}</span>
                </div>
              )}
            </div>

            {/* Manage Account */}
            <div className="px-5 py-3 border-b border-gray-100">
              <button
                onClick={() => { setOpen(false); openUserProfile(); }}
                className="flex items-center justify-between w-full text-sm text-gray-700 hover:text-gray-900 py-1 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Manage Account
                </span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Log Out */}
            <div className="px-5 py-3">
              <button
                onClick={() => void signOut({ redirectUrl: "/sign-in" })}
                className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 transition-colors w-full py-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Log Out
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
