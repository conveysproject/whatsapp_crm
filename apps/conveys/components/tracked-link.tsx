"use client";

import type { ReactNode, JSX } from "react";
import { trackCTAClick } from "@/lib/analytics";

interface TrackedLinkProps {
  href: string;
  onTrack: () => void;
  className?: string;
  children: ReactNode;
}

export function TrackedLink({ href, onTrack, className, children }: TrackedLinkProps): JSX.Element {
  return (
    <a href={href} className={className} onClick={() => onTrack()}>
      {children}
    </a>
  );
}

interface TrackedServiceCTAProps {
  title: string;
  className?: string;
  children: ReactNode;
}

export function TrackedServiceCTA({ title, className, children }: TrackedServiceCTAProps): JSX.Element {
  return (
    <a
      href="/#contact"
      className={className}
      onClick={() => trackCTAClick(title, "/#contact", "service-page")}
    >
      {children}
    </a>
  );
}
