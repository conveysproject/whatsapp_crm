"use client";

import { useEffect } from "react";

const TAWK_SRC = "https://embed.tawk.to/6a8d9f787f08c0344498a708/1k0sjdsk2";

type TawkApi = { showWidget?: () => void; hideWidget?: () => void };
type TawkWindow = Window & { Tawk_API?: TawkApi; Tawk_LoadStart?: Date; __tawkLoaded?: boolean };

/** Tawk.to live chat — rendered on the public home page only. */
export default function TawkChat(): null {
  useEffect(() => {
    const w = window as TawkWindow;
    if (w.__tawkLoaded) {
      w.Tawk_API?.showWidget?.();
    } else {
      w.__tawkLoaded = true;
      w.Tawk_API = w.Tawk_API ?? {};
      w.Tawk_LoadStart = new Date();
      const s = document.createElement("script");
      s.async = true;
      s.src = TAWK_SRC;
      s.charset = "UTF-8";
      s.setAttribute("crossorigin", "*");
      document.head.appendChild(s);
    }
    // Navigating from home into the app must not leave the widget on screen.
    return () => w.Tawk_API?.hideWidget?.();
  }, []);

  return null;
}
