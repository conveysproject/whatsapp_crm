"use client";

import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Check } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  className?: string;
  disabled?: boolean;
}

export function Dropdown({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchable = false,
  className = "",
  disabled = false,
}: DropdownProps): React.JSX.Element {
  const [search, setSearch] = useState("");
  const selected = options.find((o) => o.value === value);
  const filtered = searchable
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <DropdownMenu.Root onOpenChange={(open) => { if (!open) setSearch(""); }}>
      <DropdownMenu.Trigger
        disabled={disabled}
        className={`flex min-w-[120px] items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        <span className="truncate text-left">{selected?.label ?? <span className="text-gray-400">{placeholder}</span>}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-500" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[8rem] overflow-hidden rounded-lg border border-gray-200 bg-white p-1 shadow-lg animate-in fade-in-0 zoom-in-95"
          sideOffset={4}
          align="start"
        >
          {searchable && (
            <div className="px-2 pb-1 pt-1">
              <input
                type="text"
                autoFocus
                className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          )}

          {filtered.map((o) => (
            <DropdownMenu.Item
              key={o.value}
              className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm text-gray-800 outline-none hover:bg-[#1D4B3E] hover:text-white focus:bg-[#1D4B3E] focus:text-white data-[highlighted]:bg-[#1D4B3E] data-[highlighted]:text-white"
              onSelect={() => onChange(o.value)}
            >
              <span>{o.label}</span>
              {o.value === value && <Check className="h-3.5 w-3.5" style={{ color: "currentColor" }} />}
            </DropdownMenu.Item>
          ))}

          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400">No results</div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
