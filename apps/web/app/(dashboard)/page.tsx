import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";

interface StatCard {
  label: string;
  value: string;
}

const stats: StatCard[] = [
  { label: "Open Conversations", value: "—" },
  { label: "Contacts",           value: "—" },
  { label: "Messages Sent Today", value: "—" },
  { label: "Pending Invitations", value: "—" },
];

export default async function DashboardPage(): Promise<JSX.Element> {
  await auth.protect();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5 shadow-card">
            <p className="text-sm text-gray-500">{label}</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
