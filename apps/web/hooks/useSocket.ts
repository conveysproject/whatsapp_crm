"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { getSocket } from "@/lib/socket";

export function useSocket(organizationId: string | undefined): void {
  const { getToken } = useAuth();

  useEffect(() => {
    if (!organizationId) return;

    const socket = getSocket();

    async function connect() {
      const token = await getToken();
      socket.auth = { token };
      socket.connect();
      socket.emit("join-org", organizationId);
    }

    void connect();

    return () => {
      socket.emit("leave-org", organizationId);
      socket.disconnect();
    };
  }, [organizationId, getToken]);
}
