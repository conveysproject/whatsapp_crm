"use client";
import { JSX, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const BRANDING_SLOTS = [
  { slug: "logo", label: "Logo (Light)", hint: "Shown in top navigation on light background" },
  { slug: "small-logo", label: "Small Logo (Light)", hint: "Used as favicon-sized icon in light mode" },
  { slug: "favicon", label: "Favicon", hint: "Browser tab icon" },
  { slug: "dark-logo", label: "Logo (Dark)", hint: "Shown on dark backgrounds" },
  { slug: "dark-favicon", label: "Favicon (Dark)", hint: "Browser tab icon for dark mode" },
] as const;

async function uploadToStorage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const json = await res.json() as { url: string };
  return json.url;
}

export default function BrandingPage(): JSX.Element {
  const qc = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async ({ slug, file }: { slug: string; file: File }) => {
      const url = await uploadToStorage(file);
      return fetch(`/api/v1/organizations/branding/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      }).then((r) => r.json());
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org"] }),
  });

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Branding</h1>
        <p className="text-sm text-gray-500 mt-1">Upload your logo and favicon for both light and dark themes.</p>
      </div>
      <div className="grid grid-cols-1 gap-6">
        {BRANDING_SLOTS.map((slot) => (
          <BrandingSlot
            key={slot.slug}
            slug={slot.slug}
            label={slot.label}
            hint={slot.hint}
            onUpload={(file) => uploadMutation.mutate({ slug: slot.slug, file })}
            isUploading={uploadMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
}

interface SlotProps {
  slug: string;
  label: string;
  hint: string;
  onUpload: (f: File) => void;
  isUploading: boolean;
}

function BrandingSlot({ slug, label, hint, onUpload, isUploading }: SlotProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="border rounded-lg p-4 flex items-center gap-4">
      <div className="flex-1">
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-gray-500">{hint}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        id={`upload-${slug}`}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
        className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-50"
      >
        Upload
      </button>
    </div>
  );
}
