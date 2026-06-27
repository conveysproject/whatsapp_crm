"use client";

import { JSX, KeyboardEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { getTagColor } from "@/lib/tag-color";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface TagComboboxProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

export function TagCombobox({ tags, onChange, placeholder = "Add tag…" }: TagComboboxProps): JSX.Element {
  const { getToken } = useAuth();
  const [input, setInput] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/contacts/tags`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (res.ok) {
        const body = (await res.json()) as { data: string[] };
        setAllTags(body.data);
      }
    })();
  }, [getToken]);

  const inputTrimmed = input.trim().toLowerCase();
  const filtered = allTags
    .filter((t) => !tags.includes(t) && t.toLowerCase().includes(inputTrimmed))
    .slice(0, 8);
  const showCreate =
    inputTrimmed.length > 0 &&
    !allTags.some((t) => t.toLowerCase() === inputTrimmed) &&
    !tags.includes(inputTrimmed);
  const options = [...filtered, ...(showCreate ? [`__create__:${inputTrimmed}`] : [])];

  function add(tag: string) {
    const t = tag.trim().toLowerCase();
    if (!t || tags.includes(t)) return;
    onChange([...tags, t]);
    if (!allTags.includes(t)) setAllTags((prev) => [...prev, t]);
    setInput("");
    setOpen(false);
    setHighlighted(0);
  }

  function remove(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const opt = options[highlighted];
      if (opt) {
        add(opt.startsWith("__create__:") ? opt.slice(11) : opt);
      } else if (input.trim()) {
        add(input.trim());
      }
    } else if (e.key === "Backspace" && !input && tags.length > 0) {
      remove(tags[tags.length - 1]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <div
        className="flex flex-wrap gap-1.5 rounded-lg border border-gray-300 px-3 py-2 focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent cursor-text min-h-[42px]"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => {
          const { bg, text } = getTagColor(tag);
          return (
            <span key={tag} className={`flex items-center gap-1 ${bg} ${text} rounded-full text-xs px-2 py-0.5 shrink-0 font-medium`}>
              {tag}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(tag); }}
                className="hover:opacity-70 leading-none ml-0.5"
              >
                &times;
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          className="flex-1 min-w-[80px] text-sm outline-none bg-transparent placeholder-gray-400"
          placeholder={tags.length === 0 ? placeholder : ""}
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); setHighlighted(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKey}
        />
      </div>

      {open && options.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {options.map((opt, i) => {
            const isCreate = opt.startsWith("__create__:");
            const label = isCreate ? opt.slice(11) : opt;
            const { bg, text } = getTagColor(label);
            return (
              <li
                key={opt}
                onMouseDown={() => add(label)}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm transition-colors ${i === highlighted ? "bg-gray-100" : "hover:bg-gray-50"}`}
              >
                {isCreate ? (
                  <>
                    <span className="text-brand-600 font-medium text-xs">+ Create</span>
                    <span className={`${bg} ${text} rounded-full text-xs px-2 py-0.5 font-medium`}>{label}</span>
                  </>
                ) : (
                  <span className={`${bg} ${text} rounded-full text-xs px-2 py-0.5 font-medium`}>{label}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
