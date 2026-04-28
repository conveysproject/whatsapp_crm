import type { JSX } from "react";
import { api } from "../../../../lib/api.js";
import Link from "next/link";

export default async function MembersPage(): Promise<JSX.Element> {
  const users = await api.users.list();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Members</h1>
        <Link
          href="/settings"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to settings
        </Link>
      </div>

      <div className="bg-white rounded-lg border divide-y">
        {users.map((user) => (
          <div key={user.id} className="flex items-center justify-between px-6 py-4">
            <div>
              <p className="font-medium text-gray-900">{user.fullName}</p>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>
            <span className="capitalize rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
              {user.role}
            </span>
          </div>
        ))}
        {users.length === 0 && (
          <p className="px-6 py-8 text-center text-gray-500">No members yet.</p>
        )}
      </div>
    </div>
  );
}
