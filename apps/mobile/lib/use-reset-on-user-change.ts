import { useEffect, useRef } from "react";

/** Calls onChange whenever the signed-in user id changes (including sign-out to null). Not called on the first render, nor when auth finishes loading (undefined -> id). */
export function useResetOnUserChange(userId: string | null | undefined, onChange: () => void): void {
  const previous = useRef(userId);

  useEffect(() => {
    const prev = previous.current;
    if (prev === userId) return;
    previous.current = userId;
    if (prev === undefined) return; // auth was still loading; nothing cached belongs to another user
    onChange();
  }, [userId, onChange]);
}
