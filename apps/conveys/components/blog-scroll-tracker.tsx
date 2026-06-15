"use client";

import { useEffect, useRef } from "react";
import { trackBlogScroll } from "@/lib/analytics";

interface BlogScrollTrackerProps {
  postSlug: string;
  postTitle: string;
}

const MILESTONES = [25, 50, 75, 90] as const;

export function BlogScrollTracker({ postSlug, postTitle }: BlogScrollTrackerProps): null {
  const firedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    function handleScroll(): void {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const pct = Math.round((window.scrollY / scrollable) * 100);
      for (const milestone of MILESTONES) {
        if (pct >= milestone && !firedRef.current.has(milestone)) {
          firedRef.current.add(milestone);
          trackBlogScroll(milestone, postSlug, postTitle);
        }
      }
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [postSlug, postTitle]);

  return null;
}
