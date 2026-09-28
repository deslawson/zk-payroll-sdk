import { paginate, resolvePageSize } from "../pagination";
import type { PaginationOptions, PaginatedResult } from "../pagination";
import { ValidationError } from "../core/errors";
import type { ArchivedRecord, ArchiveQuery } from "./types";
import { applyArchiveQuery } from "./internal";

// ---------------------------------------------------------------------------
// Period validation helper (shared between getArchivedPayrollPage and
// buildArchiveSummaryReport)
// ---------------------------------------------------------------------------

/**
 * Throws a `ValidationError` if the query has both periodStart and periodEnd
 * set and periodStart is chronologically later than periodEnd.
 * @internal
 */
export function validatePeriodOrdering(query: ArchiveQuery): void {
  const params = query.toParams();
  const start = params["periodStart"];
  const end = params["periodEnd"];
  if (start !== undefined && end !== undefined) {
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (!isNaN(startMs) && !isNaN(endMs) && startMs > endMs) {
      throw new ValidationError(
        `periodStart ("${start}") must not be later than periodEnd ("${end}")`,
        "periodStart"
      );
    }
  }
}

// ---------------------------------------------------------------------------
// getArchivedPayrollPage
// ---------------------------------------------------------------------------

/**
 * Applies an `ArchiveQuery` to an in-memory array of archived records and
 * returns a single paginated page.
 *
 * Filters are applied before pagination, so `meta.total` reflects the
 * filtered count rather than the raw input length.
 *
 * Invalid cursors fall back to the first page silently (handled by the
 * underlying `paginate` function from `pagination.ts`).
 *
 * @param records - Full in-memory array of archived records.
 * @param query   - Immutable query descriptor from `ArchiveFilterBuilder.build()`.
 * @param options - Optional pagination options; takes precedence over any
 *                  pagination embedded in the query.
 *
 * @throws {ValidationError} if the query's `periodStart` is later than `periodEnd`.
 *
 * @example
 * ```ts
 * const query = new ArchiveFilterBuilder()
 *   .forPeriod("2024-01-01", "2024-03-31")
 *   .withStatus("completed")
 *   .build();
 *
 * const page = getArchivedPayrollPage(records, query, { pageSize: 25 });
 * ```
 */
export function getArchivedPayrollPage(
  records: ArchivedRecord[],
  query: ArchiveQuery,
  options?: PaginationOptions
): PaginatedResult<ArchivedRecord> {
  // Step 1: validate period ordering
  validatePeriodOrdering(query);

  // Step 2: apply all filters from the query
  const filtered = applyArchiveQuery(records, query);

  // Step 3: merge pagination — call-site options override query-embedded pagination
  const params = query.toParams();
  const queryPageSize =
    params["pageSize"] !== undefined ? parseInt(params["pageSize"], 10) : undefined;
  const queryCursor = params["cursor"];

  const mergedOptions: PaginationOptions = {
    // query-embedded pagination as baseline
    ...(queryPageSize !== undefined ? { pageSize: queryPageSize } : {}),
    ...(queryCursor !== undefined ? { cursor: queryCursor } : {}),
    // call-site options take precedence
    ...options,
  };

  // Step 4: paginate (handles cursor decode, page-size clamping, cursor generation)
  return paginate(filtered, mergedOptions);
}

// ---------------------------------------------------------------------------
// archiveIterator
// ---------------------------------------------------------------------------

/**
 * Async generator that streams archived records page by page without
 * loading all matching records into memory before yielding the first page.
 *
 * Applies `query` filters once upfront, then uses cursor-based chaining
 * to yield successive pages. Each page is yielded immediately after
 * computation — no buffering across pages.
 *
 * @param records - Full in-memory array of archived records.
 * @param query   - Immutable query descriptor from `ArchiveFilterBuilder.build()`.
 * @param options - Optional pagination options (cursor is not accepted here;
 *                  the iterator manages its own cursor chain).
 *
 * @example
 * ```ts
 * for await (const page of archiveIterator(records, query, { pageSize: 100 })) {
 *   await warehouse.bulkInsert(page.data);
 * }
 * ```
 */
export async function* archiveIterator(
  records: ArchivedRecord[],
  query: ArchiveQuery,
  options?: Omit<PaginationOptions, "cursor">
): AsyncGenerator<PaginatedResult<ArchivedRecord>> {
  // Apply query filters once upfront
  const filtered = applyArchiveQuery(records, query);

  // Resolve and clamp page size
  const pageSize = resolvePageSize(options?.pageSize);

  let cursor: string | undefined;

  do {
    const result = paginate(filtered, { pageSize, cursor });
    yield result;
    cursor = result.meta.nextCursor;
  } while (cursor !== undefined);
}
