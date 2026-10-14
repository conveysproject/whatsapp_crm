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

    // An auth rejection (middleware error) leaves the socket inactive, so socket.io will not retry by itself.
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function onConnected() {
      attempt = 0;
    }

    function onConnectError(err: Error) {
      if (err.message !== "unauthorized" || socket.active) return;
      const delay = Math.min(2000 * 2 ** attempt, 30000);
      attempt += 1;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        socket.connect();
      }, delay);
    }

    async function connect() {
      // Function form: socket.io calls this on every (re)connect, so an expired Clerk token is never reused.
      socket.auth = (cb: (data: { token: string | null }) => void) => {
        void getToken()
          .then((token) => cb({ token }))
          .catch(() => cb({ token: null }));
      };
      socket.on("connect", joinRooms);
      socket.on("connect", onConnected);
      socket.on("connect_error", onConnectError);
      socket.connect();
    }

    void connect();

    return () => {
      if (timer) clearTimeout(timer);
      socket.off("connect", joinRooms);
      socket.off("connect", onConnected);
      socket.off("connect_error", onConnectError);
      socket.emit("leave-org", organizationId);
      if (userId) socket.emit("leave-user", userId);
      socket.disconnect();
    };
  }, [organizationId, userId, getToken]);
}
