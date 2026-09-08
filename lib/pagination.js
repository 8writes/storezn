// Shared pagination convention for list endpoints: 1-indexed `page`,
// `pageSize` capped so a client can't force an unbounded table scan.
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function parsePagination(searchParams) {
  const page = Math.max(1, parseInt(searchParams.get("page"), 10) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(searchParams.get("pageSize"), 10) || DEFAULT_PAGE_SIZE));
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}
