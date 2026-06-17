import { JSX, ReactNode } from "react";

export default function InboxLayout({ children }: { children: ReactNode }): JSX.Element {
  return <div className="flex flex-1 min-h-0 overflow-hidden">{children}</div>;
}
