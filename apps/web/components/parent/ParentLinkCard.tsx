"use client";

import { useReducer, useState, type JSX } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { ORG_FLAGS_QUERY_KEY, useOrganization } from "@/hooks/useOrganization";
import { confirmReducer, describeError, fetchParentLink, leaveParent, runConfirmed, showParentLinkCard } from "@/lib/parent-orgs";
import { ParentLinkCardView } from "./ParentLinkCardView";

/** Account Details card. Renders nothing unless the org has a parent and the user is an org admin. */
export function ParentLinkCard(): JSX.Element | null {
  const { user } = useCurrentUser();
  const { org } = useOrganization();
  const qc = useQueryClient();
  const visible = showParentLinkCard(user, org);
  const { data, isError } = useQuery({ queryKey: ["parent-link"], queryFn: fetchParentLink, enabled: visible, retry: false });
  const [gate, dispatch] = useReducer(confirmReducer, "idle");
  const [error, setError] = useState<string | null>(null);

  if (!visible || isError || !data?.parent) return null;

  async function confirm() {
    setError(null);
    const current = gate;
    dispatch("confirm");
    try {
      await runConfirmed(current, leaveParent);
      await qc.invalidateQueries({ queryKey: ORG_FLAGS_QUERY_KEY });
      // Legacy envelope cache used by other screens also reflects the org; refresh it too.
      await qc.invalidateQueries({ queryKey: ["org-me"] });
      await qc.invalidateQueries({ queryKey: ["parent-link"] });
    } catch (err) {
      setError(describeError(err));
    }
    dispatch("done");
  }

  return (
    <ParentLinkCardView
      parentName={data.parent.name}
      sessions={data.sessions}
      gate={gate}
      error={error}
      onLeave={() => { setError(null); dispatch("request"); }}
      onConfirm={() => { void confirm(); }}
      onCancel={() => dispatch("cancel")}
    />
  );
}
