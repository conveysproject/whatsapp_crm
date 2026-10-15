import { useEffect, useRef } from "react";

/** Calls onChange whenever the signed-in user id changes (including sign-out to null). Not called on the first render. */
export function useResetOnUserChange(userId: string | null | undefined, onChange: () => void): void {
  const previous = useRef(userId);

  useEffect(() => {
    if (previous.current === userId) return;
    previous.current = userId;
    onChange();
  }, [userId, onChange]);
}
