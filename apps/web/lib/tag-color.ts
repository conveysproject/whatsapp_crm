const PALETTE = [
  { bg: "bg-blue-100",   text: "text-blue-700"   },
  { bg: "bg-green-100",  text: "text-green-700"  },
  { bg: "bg-purple-100", text: "text-purple-700" },
  { bg: "bg-orange-100", text: "text-orange-700" },
  { bg: "bg-pink-100",   text: "text-pink-700"   },
  { bg: "bg-teal-100",   text: "text-teal-700"   },
  { bg: "bg-red-100",    text: "text-red-700"    },
  { bg: "bg-yellow-100", text: "text-yellow-700" },
  { bg: "bg-indigo-100", text: "text-indigo-700" },
  { bg: "bg-cyan-100",   text: "text-cyan-700"   },
] as const;

export function getTagColor(tag: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash += tag.charCodeAt(i);
  return PALETTE[hash % PALETTE.length]!;
}
