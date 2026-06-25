export type MatchMode = "all" | "any";

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
export type FilterTab = "tags" | "fields" | "events";

export interface RowState {
  id: string;
  tab: FilterTab;
  rule: FilterRule;
}
