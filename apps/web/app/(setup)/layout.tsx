import type { JSX, ReactNode } from "react";

export default function SetupLayout({ children }: { children: ReactNode }): JSX.Element {
  return <>{children}</>;
}