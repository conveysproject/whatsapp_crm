"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { getSocket } from "@/lib/socket";

export function useSocket(organizationId: string | undefined): void {
  const { getToken } = useAuth();

  useEffect(() => {
    if (!organizationId) return;

    const socket = getSocket();

    function joinOrg() {
      socket.emit("join-org", organizationId);
    }

    async function connect() {
      const token = await getToken();
      socket.auth = { token };
      // Re-join org room on every connect/reconnect
      socket.on("connect", joinOrg);
      socket.connect();
    }

    void connect();

    return () => {
      socket.off("connect", joinOrg);
      socket.emit("leave-org", organizationId);
      socket.disconnect();
    };
  }, [organizationId, getToken]);
}
