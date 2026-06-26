import type { PrismaClient } from "@prisma/client";

export type MatchMode = "all" | "any";

// ── New discriminated union ───────────────────────────────────────────────────

export type TagsRule = {
  type: "tags";
  operator: "is" | "isNot";
  value: string;
};

export type FieldsRule = {
  type: "fields";
  field: string;
  operator: string;
  value?: string;
  valueTo?: string;
  customFieldId?: string;
};

export type EventSubCondition = {
  property: string;
  operator: "is" | "isNot" | "contains" | "doesNotContain" | "isEmpty" | "hasAnyValue";
  value?: string;
};

export type EventsRule = {
  type: "events";
  action: "hasDone";
  eventName: string;
  subConditions: EventSubCondition[];
  subMatch: "and" | "or";
};

export type FilterRule = TagsRule | FieldsRule | EventsRule;

export interface EvaluateResult {
  count: number;
  contacts: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    phoneNumber: string;
    leadStatus: { name: string; color: string } | null;
  }>;
}

// ── Backward compat coercion ──────────────────────────────────────────────────

function normalizeRule(raw: unknown): FilterRule {
  const r = raw as Record<string, unknown>;
  if (r["type"]) return raw as FilterRule;
  // old format — has `field` but no `type`
  if (r["field"] === "tags") {
    const op = r["operator"] === "doesNotContain" ? "isNot" : "is";
    return { type: "tags", operator: op, value: (r["value"] as string) ?? "" };
  }
  return {
    type: "fields",
    field: r["field"] as string,
    operator: r["operator"] as string,
    value: r["value"] as string | undefined,
    valueTo: r["valueTo"] as string | undefined,
    customFieldId: r["customFieldId"] as string | undefined,
  };
}

// ── Clause builders ───────────────────────────────────────────────────────────

function buildTagsClause(rule: TagsRule): Record<string, unknown> {
  if (rule.operator === "isNot") return { NOT: { tags: { has: rule.value } } };
  return { tags: { has: rule.value } };
}

function buildTextClause(col: string, operator: string, value?: string): Record<string, unknown> {
  switch (operator) {
    case "is":
    case "equals":
      return { [col]: { equals: value, mode: "insensitive" } };
    case "isNot":
      return { NOT: { [col]: { equals: value, mode: "insensitive" } } };
    case "contains":
      return { [col]: { contains: value, mode: "insensitive" } };
    case "doesNotContain":
      return { NOT: { [col]: { contains: value, mode: "insensitive" } } };
    case "startsWith":
      return { [col]: { startsWith: value, mode: "insensitive" } };
    case "isEmpty":
      return { [col]: null };
    case "isNotEmpty":
    case "hasAnyValue":
      return { NOT: { [col]: null } };
    default:
      return { [col]: { equals: value, mode: "insensitive" } };
  }
}

function buildDateClause(col: string, operator: string, value?: string, valueTo?: string): Record<string, unknown> {
  const now = new Date();
  switch (operator) {
    case "lessThanDaysAgo": {
      const days = parseInt(value ?? "0", 10);
      const cutoff = new Date(now.getTime() - days * 86400000);
      return { [col]: { gte: cutoff } };
    }
    case "moreThanDaysAgo": {
      const days = parseInt(value ?? "0", 10);
      const cutoff = new Date(now.getTime() - days * 86400000);
      return { [col]: { lte: cutoff } };
    }
    case "after":
      return { [col]: { gte: new Date(value!) } };
    case "before":
      return { [col]: { lte: new Date(value!) } };
    case "on": {
      const d = new Date(value!);
      const start = new Date(d); start.setHours(0, 0, 0, 0);
      const end = new Date(d); end.setHours(23, 59, 59, 999);
      return { [col]: { gte: start, lte: end } };
    }
    case "between":
      return { [col]: { gte: new Date(value!), lte: new Date(valueTo!) } };
    case "isEmpty":
      return { [col]: null };
    case "hasAnyValue":
      return { NOT: { [col]: null } };
    default:
      return {};
  }
}

function buildFieldsClause(rule: FieldsRule): Record<string, unknown> {
  const { field, operator, value, valueTo, customFieldId } = rule;

  if (["firstName", "lastName", "name", "email", "phoneNumber", "externalId", "notes"].includes(field)) {
    return buildTextClause(field, operator, value);
  }

  switch (field) {
    case "leadStatusId":
      if (operator === "isNot") return { NOT: { leadStatusId: value } };
      return { leadStatusId: value };

    case "countryCode":
    case "languageCode":
      if (operator === "isNot") return { NOT: { [field]: value } };
      return { [field]: value };

    case "assignedUserId":
      if (operator === "isEmpty") return { assignedUserId: null };
      if (operator === "isNot") return { NOT: { assignedUserId: value } };
      return { assignedUserId: value };

    case "groups":
      if (operator === "notMemberOf") return { NOT: { groupContacts: { some: { contactGroupId: value } } } };
      return { groupContacts: { some: { contactGroupId: value } } };

    case "whatsappOptOut":
      return { whatsappOptOut: operator === "isTrue" || operator === "is true" };

    case "disableBot":
      return { disableBot: operator === "isTrue" || operator === "is true" };

    case "closureDeadline":
      return buildDateClause("closureDeadline", operator, value, valueTo);

    case "createdAt":
      return buildDateClause("createdAt", operator, value, valueTo);

    case "waBlockedAt":
      if (operator === "isEmpty" || operator === "isFalse") return { waBlockedAt: null };
      return { NOT: { waBlockedAt: null } };

    case "lastMessageAt": {
      if (operator === "isEmpty") return { conversations: { none: {} } };
      if (operator === "hasAnyValue") return { conversations: { some: {} } };
      const clause = buildDateClause("lastMessageAt", operator, value, valueTo);
      return { conversations: { some: { lastMessageAt: (clause["lastMessageAt"] as Record<string, unknown>) } } };
    }

    case "customField": {
      if (operator === "isEmpty") return { NOT: { customFieldValues: { some: { fieldId: customFieldId } } } };
      const valClause = operator === "contains"
        ? { contains: value, mode: "insensitive" }
        : { equals: value };
      return { customFieldValues: { some: { fieldId: customFieldId, fieldValue: valClause } } };
    }

    default:
      return {};
  }
}

function buildSubConditionClause(sub: EventSubCondition): Record<string, unknown> {
  // properties are stored as JSON — we query via path operator
  // Prisma JSON path filter: { path: ["property"], string_contains: value }
  const jsonPath = ["properties", sub.property];
  switch (sub.operator) {
    case "is":
      return { properties: { path: jsonPath, equals: sub.value } };
    case "isNot":
      return { NOT: { properties: { path: jsonPath, equals: sub.value } } };
    case "contains":
      return { properties: { path: jsonPath, string_contains: sub.value } };
    case "doesNotContain":
      return { NOT: { properties: { path: jsonPath, string_contains: sub.value } } };
    case "isEmpty":
      return { NOT: { properties: { path: jsonPath, not: null } } };
    case "hasAnyValue":
      return { properties: { path: jsonPath, not: null } };
    default:
      return {};
  }
}

function buildEventsClause(rule: EventsRule, organizationId: string): Record<string, unknown> {
  if (!rule.eventName) return {};
  const subClauses = rule.subConditions
    .map(buildSubConditionClause)
    .filter((c) => Object.keys(c).length > 0);
  const subMatchKey = rule.subMatch === "or" ? "OR" : "AND";

  return {
    events: {
      some: {
        organizationId,
        name: rule.eventName,
        ...(subClauses.length > 0 ? { [subMatchKey]: subClauses } : {}),
      },
    },
  };
}

function buildClause(rule: FilterRule, organizationId: string): Record<string, unknown> {
  switch (rule.type) {
    case "tags":    return buildTagsClause(rule);
    case "fields":  return buildFieldsClause(rule);
    case "events":  return buildEventsClause(rule, organizationId);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function evaluateSegment(
  prisma: PrismaClient,
  organizationId: string,
  filters: FilterRule[],
  match: MatchMode = "all",
  whatsappOptedOnly = false
): Promise<EvaluateResult> {
  const normalized = filters.map(normalizeRule);
  const clauses = normalized
    .map((r) => buildClause(r, organizationId))
    .filter((c) => Object.keys(c).length > 0);

  const matchKey = match === "any" ? "OR" : "AND";

  const contacts = await prisma.contact.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(whatsappOptedOnly ? { whatsappOptOut: false } : {}),
      ...(clauses.length > 0 ? { [matchKey]: clauses } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phoneNumber: true,
      leadStatus: { select: { name: true, color: true } },
    },
  });

  return { count: contacts.length, contacts };
}
