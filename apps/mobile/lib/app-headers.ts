import Constants from "expo-constants";
import { useSyncExternalStore } from "react";

/** The app's own version; the API turns old builds away with 426 UPGRADE_REQUIRED. */
export function appVersion(): string {
  return Constants.expoConfig?.version ?? "0.0.0";
}

/** Sent on every API call so the API can apply the mobile minimum-version gate. */
export function appHeaders(): Record<string, string> {
  return { "X-App-Client": "mobile", "X-App-Version": appVersion() };
}

let upgradeRequired = false;
const listeners = new Set<() => void>();

/** Call with every API response status; a 426 switches the whole app to the "Update the app" screen. */
export function noteResponseStatus(status: number): void {
  if (status !== 426 || upgradeRequired) return;
  upgradeRequired = true;
  for (const l of [...listeners]) l();
}

export function isUpgradeRequired(): boolean {
  return upgradeRequired;
}

export function subscribeUpgradeRequired(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUpgradeRequired(): boolean {
  return useSyncExternalStore(subscribeUpgradeRequired, isUpgradeRequired, isUpgradeRequired);
}

export function __resetUpgradeForTests(): void {
  upgradeRequired = false;
  listeners.clear();
}
