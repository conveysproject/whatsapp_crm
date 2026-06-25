import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { PermissionGate } from "@/components/PermissionGate";
import { BusinessHoursCard } from "./business-hours-card";
import { OooCard } from "./ooo-card";
import { WelcomeCard } from "./welcome-card";
import { DelayedCard } from "./delayed-card";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Flow {
  id: string;
  name: string;
  isActive: boolean;
}

async function getFlows(token: string): Promise<Flow[]> {
  try {
    const res = await fetch(`${API_URL}/v1/flows`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    return res.ok ? (await res.json() as { data: Flow[] }).data : [];
  } catch {
    return [];
  }
}

interface MediaData {
  mediaId: string;
  contentType: "image" | "video" | "document";
  filename: string;
}

interface AutomationSettings {
  oooEnabled: boolean;
  oooMessage: string | null;
  oooMessageData: MediaData | null;
  welcomeEnabled: boolean;
  welcomePersonalized: boolean;
  welcomeMessage: string | null;
  welcomeMessageData: MediaData | null;
  welcomeNewMessage: string | null;
  welcomeNewData: MediaData | null;
  welcomeReturningMessage: string | null;
  welcomeReturningData: MediaData | null;
  welcomeFlowId: string | null;
  delayedEnabled: boolean;
  delayedMinutes: number;
  delayedMessage: string | null;
  delayedMessageData: MediaData | null;
  delayedSendWithOoo: boolean;
}

async function getAutomationSettings(token: string): Promise<AutomationSettings | null> {
  try {
    const res = await fetch(`${API_URL}/v1/automation/settings`, {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json() as { data: AutomationSettings }).data;
  } catch {
    return null;
  }
}

export default async function BasicAutomationPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const token = (await getToken()) ?? "";

  const [flows, automationSettings] = await Promise.all([
    getFlows(token),
    getAutomationSettings(token),
  ]);

  const defaultSettings: AutomationSettings = {
    oooEnabled: false,
    oooMessage: null,
    oooMessageData: null,
    welcomeEnabled: false,
    welcomePersonalized: false,
    welcomeMessage: null,
    welcomeMessageData: null,
    welcomeNewMessage: null,
    welcomeNewData: null,
    welcomeReturningMessage: null,
    welcomeReturningData: null,
    welcomeFlowId: null,
    delayedEnabled: false,
    delayedMinutes: 30,
    delayedMessage: null,
    delayedMessageData: null,
    delayedSendWithOoo: false,
  };

  const settings = automationSettings ?? defaultSettings;

  return (
    <PermissionGate permission="automation_access">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Basic Automation</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Out of office, welcome messages, and delayed response settings
          </p>
        </div>
        <BusinessHoursCard />
        <OooCard
          initial={{
            oooEnabled: settings.oooEnabled,
            oooMessage: settings.oooMessage,
            oooMessageData: settings.oooMessageData,
          }}
          token={token}
        />
        <WelcomeCard
          initial={{
            welcomeEnabled: settings.welcomeEnabled,
            welcomePersonalized: settings.welcomePersonalized,
            welcomeMessage: settings.welcomeMessage,
            welcomeNewMessage: settings.welcomeNewMessage,
            welcomeReturningMessage: settings.welcomeReturningMessage,
            welcomeFlowId: settings.welcomeFlowId,
          }}
          flows={flows.filter((f) => f.isActive)}
          token={token}
        />
        <DelayedCard
          initial={{
            delayedEnabled: settings.delayedEnabled,
            delayedMinutes: settings.delayedMinutes,
            delayedMessage: settings.delayedMessage,
            delayedMessageData: settings.delayedMessageData,
            delayedSendWithOoo: settings.delayedSendWithOoo,
          }}
          token={token}
        />
      </div>
    </PermissionGate>
  );
}
