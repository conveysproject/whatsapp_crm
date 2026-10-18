import { useSyncExternalStore } from "react";

const subscribe = (): (() => void) => () => {};

/**
 * False on the server and during hydration, true afterwards. Use it to hold back output that reads the shared
 * TanStack Query cache: another component can fill the cache while React is still hydrating, and rendering that
 * data on the first client pass would differ from the server HTML (React #418).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
