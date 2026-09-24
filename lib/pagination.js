// Shared pagination convention for list endpoints: 1-indexed `page`,
// `pageSize` capped so a client can't force an unbounded table scan.
const DEFAULT_PAGE_SIZE = 20;
// Keep user-facing lists predictable and bounded. Callers may request a
// smaller page, but never more than the platform-wide 20-row page size.
const MAX_PAGE_SIZE = 20;

export function parsePagination(searchParams) {
  const page = Math.max(1, parseInt(searchParams.get("page"), 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get("pageSize"), 10) || DEFAULT_PAGE_SIZE));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}
