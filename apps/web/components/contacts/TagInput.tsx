"use client";

import { JSX, KeyboardEvent, useState } from "react";
import { Badge } from "@/components/ui/Badge";

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export function TagInput({ tags, onChange }: TagInputProps): JSX.Element {
  const [input, setInput] = useState("");

  function addTag() {
    const tag = input.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
    if (e.key === "Backspace" && !input && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg border border-gray-300 px-3 py-2 focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent">
      {tags.map((tag) => (
        <span key={tag} className="flex items-center gap-1">
          <Badge variant="blue">{tag}</Badge>
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="text-gray-400 hover:text-gray-600 text-xs leading-none"
          >
            ×
          </button>
        </span>
      ))}
      <input
        className="flex-1 min-w-24 text-sm outline-none bg-transparent placeholder-gray-400"
        placeholder={tags.length ? "" : "Add tag, press Enter"}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        onBlur={addTag}
      />
    </div>
  );
}
