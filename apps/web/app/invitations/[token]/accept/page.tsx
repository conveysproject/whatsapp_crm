"use client";

import type { JSX } from "react";
import { useParams } from "next/navigation";
import { AcceptInvitation } from "@/components/invitations/AcceptInvitation";

export default function AcceptInvitationPage(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  return <AcceptInvitation token={token} />;
}
