"use client";

import { createContext, useContext, JSX, ReactNode } from "react";

export interface OnboardingStatus {
  provisioned: boolean;
  wabaConnected: boolean;
  numberProvisioned: boolean;
  allDone: boolean;
}

const OnboardingContext = createContext<OnboardingStatus | null>(null);

interface ProviderProps {
  status: Omit<OnboardingStatus, "allDone">;
  children: ReactNode;
}

export function OnboardingProvider({ status, children }: ProviderProps): JSX.Element {
  const value: OnboardingStatus = {
    ...status,
    allDone: status.wabaConnected && status.numberProvisioned,
  };
  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboardingStatus(): OnboardingStatus {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboardingStatus must be used inside OnboardingProvider");
  return ctx;
}
