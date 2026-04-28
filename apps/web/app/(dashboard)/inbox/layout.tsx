import { JSX, ReactNode } from "react";

export default function InboxLayout({ children }: { children: ReactNode }): JSX.Element {
  return <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">{children}</div>;
}
