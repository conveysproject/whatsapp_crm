"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { JSX, useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000 } } })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
