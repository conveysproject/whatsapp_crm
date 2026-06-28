import type { DocCategory } from "./types";
import { gettingStarted } from "./content/getting-started";
import { inbox } from "./content/inbox";
import { contacts } from "./content/contacts";
import { templates } from "./content/templates";
import { campaigns } from "./content/campaigns";
import { automation } from "./content/automation";
import { analytics } from "./content/analytics";
import { deals } from "./content/deals";
import { settings } from "./content/settings";
import { trustScore } from "./content/trust-score";
import { messages } from "./content/messages";

export const registry: DocCategory[] = [
  gettingStarted,
  inbox,
  contacts,
  templates,
  campaigns,
  automation,
  analytics,
  deals,
  settings,
  trustScore,
  messages,
];
