"use client";

import { useEffect, useState, type JSX } from "react";

/** Greeting by the viewer's browser clock (the server clock is UTC on Vercel). */
export function Greeting({ fullName }: { fullName: string }): JSX.Element {
  const first = fullName.split(" ")[0] || fullName || "there";
  // Neutral text for SSR/hydration, then the time-of-day greeting once the browser clock is known.
  const [text, setText] = useState(`Hello, ${first}`);
  useEffect(() => {
    const hour = new Date().getHours();
    const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    setText(`${part}, ${first}`);
  }, [first]);
  return <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 break-words">{text}</h1>;
}
