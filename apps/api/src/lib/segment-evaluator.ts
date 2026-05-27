import type { PrismaClient } from "@prisma/client";

export type MatchMode = "all" | "any";

export type FilterRule =
  | { field: "firstName" | "lastName" | "email" | "phoneNumber"; operator: "contains" | "equals" | "startsWith" | "isEmpty" | "isNotEmpty"; value?: string }
  | { field: "lifecycleStage"; operator: "equals" | "isNot"; value: string }
  | { field: "tags"; operator: "contains" | "doesNotContain"; value: string }
  | { field: "countryCode" | "languageCode"; operator: "equals" | "isNot"; value: string }
  | { field: "companyName"; operator: "contains" | "equals" | "isEmpty" | "isNotEmpty"; value?: string }
  | { field: "assignedUserId"; operator: "equals" | "isNot" | "isEmpty"; value?: string }
  | { field: "groups"; operator: "memberOf" | "notMemberOf"; value: string }
  | { field: "whatsappOptOut" | "disableBot"; operator: "isTrue" | "isFalse" }
  | { field: "createdAt" | "lastMessageAt"; operator: "after" | "before" | "between"; value: string; valueTo?: string }
  | { field: "customField"; operator: "contains" | "equals" | "isEmpty"; customFieldId: string; value?: string };

export interface EvaluateResult {
  count: number;
  contacts: Array<{
    id: string;
    firstName: string | null;
    lastName: string | null;
    phoneNumber: string;
    lifecycleStage: string | null;
  }>;
}

function buildClause(rule: FilterRule): Record<string, unknown> {
  switch (rule.field) {
    case "firstName":
    case "lastName":
    case "email":
    case "phoneNumber": {
      const col = rule.field;
      if (rule.operator === "isEmpty") return { [col]: null };
      if (rule.operator === "isNotEmpty") return { NOT: { [col]: null } };
      if (rule.operator === "contains") return { [col]: { contains: rule.value, mode: "insensitive" } };
      if (rule.operator === "startsWith") return { [col]: { startsWith: rule.value, mode: "insensitive" } };
      return { [col]: { equals: rule.value, mode: "insensitive" } };
    }
    case "lifecycleStage":
      if (rule.operator === "isNot") return { NOT: { lifecycleStage: rule.value } };
      return { lifecycleStage: rule.value };
    case "tags":
      if (rule.operator === "doesNotContain") return { NOT: { tags: { has: rule.value } } };
      return { tags: { has: rule.value } };
    case "countryCode":
    case "languageCode": {
      const col = rule.field;
      if (rule.operator === "isNot") return { NOT: { [col]: rule.value } };
      return { [col]: rule.value };
    }
    case "companyName":
      if (rule.operator === "isEmpty") return { companyId: null };
      if (rule.operator === "isNotEmpty") return { NOT: { companyId: null } };
      if (rule.operator === "contains") return { company: { name: { contains: rule.value, mode: "insensitive" } } };
      return { company: { name: { equals: rule.value, mode: "insensitive" } } };
    case "assignedUserId":
      if (rule.operator === "isEmpty") return { assignedUserId: null };
      if (rule.operator === "isNot") return { NOT: { assignedUserId: rule.value } };
      return { assignedUserId: rule.value };
    case "groups":
      if (rule.operator === "notMemberOf") return { NOT: { groupContacts: { some: { groupId: rule.value } } } };
      return { groupContacts: { some: { groupId: rule.value } } };
    case "whatsappOptOut":
      return { whatsappOptOut: rule.operator === "isTrue" };
    case "disableBot":
      return { disableBot: rule.operator === "isTrue" };
    case "createdAt":
      if (rule.operator === "between") return { createdAt: { gte: new Date(rule.value), lte: new Date(rule.valueTo!) } };
      if (rule.operator === "after") return { createdAt: { gte: new Date(rule.value) } };
      return { createdAt: { lte: new Date(rule.value) } };
    case "lastMessageAt":
      if (rule.operator === "between") return { conversations: { some: { createdAt: { gte: new Date(rule.value), lte: new Date(rule.valueTo!) } } } };
      if (rule.operator === "after") return { conversations: { some: { createdAt: { gte: new Date(rule.value) } } } };
      return { conversations: { some: { createdAt: { lte: new Date(rule.value) } } } };
    case "customField": {
      if (rule.operator === "isEmpty") return { NOT: { customFieldValues: { some: { fieldId: rule.customFieldId } } } };
      const valueClause =
        rule.operator === "contains"
          ? { contains: rule.value, mode: "insensitive" }
          : { equals: rule.value };
      return { customFieldValues: { some: { fieldId: rule.customFieldId, fieldValue: valueClause } } };
    }
  }
}

export async function evaluateSegment(
  prisma: PrismaClient,
  organizationId: string,
  filters: FilterRule[],
  match: MatchMode = "all"
): Promise<EvaluateResult> {
  const clauses = filters.map(buildClause);
  const matchKey = match === "any" ? "OR" : "AND";

  const contacts = await prisma.contact.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(clauses.length > 0 ? { [matchKey]: clauses } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phoneNumber: true,
      lifecycleStage: true,
    },
  });

  return { count: contacts.length, contacts };
}
