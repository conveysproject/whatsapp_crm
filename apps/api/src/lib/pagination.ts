export interface PaginationResult<T> {
  data: T[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
  };
}

export function paginate<T extends { id: string }>(
  items: T[],
  limit: number
): PaginationResult<T> {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? (data[data.length - 1]?.id ?? null) : null;
  return { data, pagination: { next_cursor: nextCursor, has_more: hasMore } };
}

export interface PaginationOptions {
  cursor?: string;
  limit: number;
}

export function parsePaginationParams(
  query: Record<string, string | string[] | undefined>
): PaginationOptions {
  const cursor = typeof query["cursor"] === "string" ? query["cursor"] : undefined;
  const limitRaw = typeof query["limit"] === "string" ? parseInt(query["limit"], 10) : 50;
  const limit = Math.min(Math.max(isNaN(limitRaw) ? 50 : limitRaw, 1), 100);
  return { cursor, limit };
}
