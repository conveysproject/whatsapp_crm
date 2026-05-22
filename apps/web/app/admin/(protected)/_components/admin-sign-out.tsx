"use client";
import { useClerk } from "@clerk/nextjs";

export function AdminSignOutButton({ email }: { email: string }) {
  const { signOut } = useClerk();

  return (
    <div className="flex items-center gap-4">
      <span className="text-xs text-gray-400">{email}</span>
      <button
        onClick={() => void signOut({ redirectUrl: "/admin/sign-in" })}
        className="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-white"
      >
        Sign Out
      </button>
    </div>
  );
}
