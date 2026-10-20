"use client";

import { useEffect, useState, type JSX } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth/client";
import { ClientAcceptMessage, ClientAcceptView } from "@/components/parent/ClientAcceptView";
import {
  NOT_AVAILABLE_MESSAGE, ParentApiError, acceptClientInvitation, fetchClientInvitation,
  type AcceptForm, type ClientInvitationMeta,
} from "@/lib/parent-orgs";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export default function AcceptClientInvitationPage(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [meta, setMeta] = useState<ClientInvitationMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchClientInvitation(API_URL, token)
      .then(setMeta)
      .catch((err: unknown) => {
        // Unknown, used, revoked and expired links are indistinguishable by design; flag off is a 404 too.
        setMetaError(err instanceof ParentApiError && err.code === "INVALID_TOKEN"
          ? "This invitation link is invalid or has expired."
          : err instanceof ParentApiError && err.status === 404 ? NOT_AVAILABLE_MESSAGE : "Could not load the invitation. Please try again.");
      });
  }, [token]);

  async function accept(form: AcceptForm) {
    setBusy(true);
    setError(null);
    try {
      const accessToken = await getToken();
      if (!accessToken) throw new ParentApiError(401, "UNAUTHORIZED", "Please sign in to accept this invitation.");
      await acceptClientInvitation(API_URL, token, accessToken, form);
      window.location.assign("/dashboard");
    } catch (err) {
      setError(err instanceof ParentApiError ? err.message : "Network error. Please try again.");
      setBusy(false);
    }
  }

  if (metaError) return <ClientAcceptMessage message={metaError} />;
  if (!meta || !isLoaded) return <ClientAcceptMessage message="Loading invitation..." />;

  return (
    <ClientAcceptView
      meta={meta}
      signedIn={isSignedIn}
      busy={busy}
      error={error}
      redirectPath={`/client-invitations/${encodeURIComponent(token)}/accept`}
      onSubmit={(form) => { void accept(form); }}
    />
  );
}
