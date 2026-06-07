"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { getSocket } from "@/lib/socket";

export function useSocket(organizationId: string | undefined, userId?: string): void {
  const { getToken } = useAuth();

  useEffect(() => {
    if (!organizationId) return;

    const socket = getSocket();

    function joinRooms() {
      socket.emit("join-org", organizationId);
      if (userId) socket.emit("join-user", userId);
    }

    async function connect() {
      const token = await getToken();
      socket.auth = { token };
      socket.on("connect", joinRooms);
      socket.connect();
    }

    void connect();

    return () => {
      socket.off("connect", joinRooms);
      socket.emit("leave-org", organizationId);
      if (userId) socket.emit("leave-user", userId);
      socket.disconnect();
    };
  }, [organizationId, userId, getToken]);
}
