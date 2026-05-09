"use client";
import { JSX, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface ConfigEntry {
  id: string;
  key: string;
  value: string | null;
  dataType: string;
}

export default function PlatformConfigPage(): JSX.Element {
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, string>>({});

  const { data } = useQuery<{ data: ConfigEntry[] }>({
    queryKey: ["platform-config"],
    queryFn: () => fetch("/api/v1/admin/platform-config").then((r) => r.json()),
  });

  useEffect(() => {
    if (!data?.data) return;
    const initial: Record<string, string> = {};
    data.data.forEach((c) => { initial[c.key] = c.value ?? ""; });
    setEdits(initial);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      fetch("/api/v1/admin/platform-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configs: Object.entries(edits).map(([key, value]) => ({ key, value })) }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform-config"] }),
  });

  const CONFIG_GROUPS: Record<string, string[]> = {
    "SMTP": ["smtp_host", "smtp_port", "smtp_username", "smtp_password", "smtp_from_name", "smtp_from_email"],
    "Stripe": ["stripe_key", "stripe_secret", "stripe_webhook_secret"],
    "Razorpay": ["razorpay_key_id", "razorpay_key_secret", "razorpay_webhook_secret"],
    "UPI": ["upi_id", "upi_merchant_name"],
    "Branding": ["platform_name", "platform_logo", "support_email"],
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Platform Configuration</h1>
        <button onClick={() => save.mutate()} disabled={save.isPending} className="px-4 py-2 bg-green-600 text-white text-sm rounded disabled:opacity-50">
          {save.isPending ? "Saving..." : "Save All"}
        </button>
      </div>

      {Object.entries(CONFIG_GROUPS).map(([group, keys]) => (
        <section key={group} className="border rounded-lg p-5 space-y-4">
          <h2 className="font-medium">{group}</h2>
          <div className="space-y-3">
            {keys.map((key) => (
              <div key={key}>
                <label className="block text-xs font-medium mb-1 font-mono">{key}</label>
                <input
                  type={key.includes("secret") || key.includes("password") ? "password" : "text"}
                  className="w-full border rounded px-3 py-1.5 text-sm font-mono"
                  value={edits[key] ?? ""}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={`Enter ${key}...`}
                />
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Custom / other keys */}
      <section className="border rounded-lg p-5 space-y-4">
        <h2 className="font-medium">All Config Keys</h2>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {(data?.data ?? []).map((entry) => (
            <div key={entry.id} className="flex items-center gap-3">
              <code className="text-xs text-gray-500 w-48 flex-shrink-0 truncate">{entry.key}</code>
              <input
                type="text"
                className="flex-1 border rounded px-2 py-1 text-xs font-mono"
                value={edits[entry.key] ?? ""}
                onChange={(e) => setEdits((prev) => ({ ...prev, [entry.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
