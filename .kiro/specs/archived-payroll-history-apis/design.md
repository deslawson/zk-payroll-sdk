# Design Document

## Overview

This design introduces the `archived/` module — a new, additive module inside `packages/core/src/` — that provides reporting-oriented helper APIs for accessing archived payroll history. All new code sits on top of the existing `pagination.ts`, `filters/`, and `summary/` modules without modifying their contracts.

The module exposes:
- Typed `ArchivedRecord` and `ArchivedRecordFilter` shapes
- `ArchiveFilterBuilder` — a fluent query builder scoped to settled (archived) data
- `filterArchivedRecords` — low-level status + field filter
- `getArchivedPayrollPage` — filter-then-paginate helper
- `archiveIterator` — async streaming generator for large datasets
- `buildArchiveSummaryReport` — privacy-safe aggregate report

All symbols are re-exported from `@zk-payroll/core` via the package `index.ts`.

---

## Architecture

### Module layout

```
packages/core/src/
└── archived/
    ├── types.ts                  ← ArchivedRecord, ArchivedRecordFilter,
    │                               ArchiveQuery, ArchiveSummaryReport
    ├── ArchiveFilterBuilder.ts   ← fluent builder → ArchiveQuery
    ├── filters.ts                ← filterArchivedRecords (low-level)
    ├── query.ts                  ← getArchivedPayrollPage, archiveIterator
    ├── summary.ts                ← buildArchiveSummaryReport
    └── index.ts                  ← barrel — re-exports everything
```

The existing modules are **not modified**. The `archived/` module only imports from them.

### Dependency graph

```
archived/types.ts
  └── (no SDK imports — self-contained type definitions)

archived/filters.ts
  └── archived/types.ts

archived/ArchiveFilterBuilder.ts
  ├── archived/types.ts
  ├── pagination.ts           (PaginationOptions)
  └── core/errors.ts          (ValidationError)

archived/query.ts
  ├── archived/types.ts
  ├── archived/filters.ts
  ├── archived/ArchiveFilterBuilder.ts
  ├── pagination.ts           (paginate, resolvePageSize, decodeCursor)
  └── core/errors.ts          (ValidationError)

archived/summary.ts
  ├── archived/types.ts
  ├── archived/filters.ts
  └── core/errors.ts          (ValidationError)

archived/index.ts
  ├── archived/types.ts
  ├── archived/filters.ts
  ├── archived/ArchiveFilterBuilder.ts
  ├── archived/query.ts
  ├── archived/summary.ts
  └── pagination.ts           (PaginatedResult, PaginationMeta — re-exported)
```

---

## Data Models

### `ArchivedRecord`

Extends `PayrollRecord` with two required fields that mark an in-flight record as settled.

```ts
// packages/core/src/types/index.ts (existing)
interface PayrollRecord {
  id: string;
  recipient: string;
  amount: bigint;   // stroops
  timestamp: number; // Unix seconds
}

// packages/core/src/archived/types.ts (new)
interface ArchivedRecord extends PayrollRecord {
  /** Unix seconds when the record was archived */
  archivedAt: number;
  /** Settled terminal status — never "pending" or "processing" */
  status: "completed" | "failed";
  /** Asset identifier — required for asset breakdown in summary reports */
  asset?: string;
}
```

The `asset` field is declared optional on the base type (it does not exist on `PayrollRecord`) but is strongly encouraged — records missing `asset` are counted under the key `"unknown"` in `ArchiveSummaryReport.assetBreakdown`.

### `ArchivedRecordFilter`

Minimal filter shape for `filterArchivedRecords`. Deliberately separate from `PayrollHistoryFilter` to avoid coupling archived-specific semantics to the general history filter.

```ts
interface ArchivedRecordFilter {
  status?: "completed" | "failed";
}
```

### `ArchiveQuery`

Immutable snapshot produced by `ArchiveFilterBuilder.build()`. Internal state is private; consumers interact only via `toParams()`.

```ts
interface ArchiveQuery {
  /** Serialize the query to a plain object suitable for API route params. */
  toParams(): Record<string, string>;
  // Internal fields are private — access only through toParams()
}
```

`toParams()` output keys and their serialization rules:

| Key | Source | Serialization |
|---|---|---|
| `periodStart` | `forPeriod(start, _)` | ISO 8601 string verbatim |
| `periodEnd` | `forPeriod(_, end)` | ISO 8601 string verbatim |
| `employeeIds` | `forEmployee` / `forEmployees` accumulated | comma-joined string |
| `assets` | `withAsset` / `withAssets` accumulated | comma-joined string |
| `status` | `withStatus` | `"completed"` or `"failed"` |
| `minAmount` | `withMinAmount` | decimal string (bigint → string) |
| `maxAmount` | `withMaxAmount` | decimal string (bigint → string) |
| `pageSize` | `paginate({ pageSize })` | decimal string |
| `cursor` | `paginate({ cursor })` | base64 string verbatim |

Keys absent from the builder's state are omitted from the output.

### `ArchiveSummaryReport`

Aggregate-only shape. Deliberately excludes `recipient` and `amount` fields.

```ts
interface ArchiveSummaryReport {
  periodStart: string;      // verbatim from query, or "" if no period set
  periodEnd: string;        // verbatim from query, or "" if no period set
  totalCount: number;
  completedCount: number;
  failedCount: number;
  assetBreakdown: Record<string, {
    totalCount: number;
    completedCount: number;
    failedCount: number;
  }>;
  generatedAt: number;      // epoch milliseconds (Date.now())
}
```

---

## Component Design

### `ArchiveFilterBuilder`

Fluent builder following the same pattern as the existing `HistoryFilterBuilder`, with these differences:
- `withStatus` replaces (not accumulates) — only one settled status makes sense per query
- `forPeriod` replaces (not accumulates) — same as existing `HistoryFilterBuilder`
- Amount bounds are stored as `bigint` internally and serialized to decimal strings in `toParams()`
- `ValidationError` is thrown eagerly on `withMinAmount(< 0n)` and `withMaxAmount(< minAmount)` — not deferred to `build()`

```
ArchiveFilterBuilder
  private state:
    employeeIds: Set<string>
    assets: Set<string>
    periodStart?: string
    periodEnd?: string
    status?: "completed" | "failed"
    minAmount?: bigint
    maxAmount?: bigint
    pagination?: PaginationOptions  (from pagination.ts)

  public methods:
    forPeriod(start, end) → this      (replaces)
    forEmployee(id) → this            (accumulates into Set)
    forEmployees(ids) → this          (accumulates into Set)
    withAsset(asset) → this           (accumulates into Set)
    withAssets(assets) → this         (accumulates into Set)
    withStatus(status) → this         (replaces)
    withMinAmount(amount) → this      (replaces; throws if < 0n)
    withMaxAmount(amount) → this      (replaces; throws if < minAmount when set)
    paginate(options) → this          (replaces)
    reset() → this                    (clears all state)
    build() → ArchiveQuery            (returns immutable snapshot)
```

`build()` takes a deep snapshot of the current state (no JSON.stringify because bigint is not JSON-serializable — use a manual copy). The returned `ArchiveQuery` closes over the snapshot; subsequent builder mutations do not affect it.

### `filterArchivedRecords`

Pure function — applies `ArchivedRecordFilter` predicates to an array.

```ts
function filterArchivedRecords(
  records: ArchivedRecord[],
  filter: ArchivedRecordFilter
): ArchivedRecord[]
```

Predicate logic:
1. If `filter.status` is defined, keep only records where `record.status === filter.status`
2. Otherwise return all records unchanged

This is the only filter applied at this layer. All richer filtering (period, employee, asset, amount) is applied inside `getArchivedPayrollPage` and `buildArchiveSummaryReport` using internal helpers that read from `ArchiveQuery`.

### `applyArchiveQuery` (internal helper)

All three consumer functions (`getArchivedPayrollPage`, `archiveIterator`, `buildArchiveSummaryReport`) share a common filtering step. A private `applyArchiveQuery` function handles the full `ArchiveQuery` filter chain:

```
function applyArchiveQuery(records: ArchivedRecord[], query: ArchiveQuery): ArchivedRecord[]

Filter steps (order matters for short-circuit efficiency):
  1. status        → exact match
  2. employeeIds   → record.id in Set (treated as employee-scoped ID)
  3. assets        → record.asset in Set (skip if no asset filter)
  4. periodStart   → record.timestamp >= Date.parse(periodStart) / 1000
  5. periodEnd     → record.timestamp <= Date.parse(periodEnd) / 1000
  6. minAmount     → record.amount >= minAmount
  7. maxAmount     → record.amount <= maxAmount
```

`employeeIds` is matched against `record.id` because `ArchivedRecord` extends `PayrollRecord` which uses `id: string`. Consumers who need employee-ID filtering should ensure their `ArchivedRecord.id` carries the employee ID, which is the expected convention for reporting consumers.

Period comparison converts ISO 8601 strings to Unix seconds via `Date.parse() / 1000`, matching the `timestamp` field's unit.

### `getArchivedPayrollPage`

```ts
function getArchivedPayrollPage(
  records: ArchivedRecord[],
  query: ArchiveQuery,
  options?: PaginationOptions
): PaginatedResult<ArchivedRecord>
```

Implementation:
1. Validate `query.periodStart < query.periodEnd` if both are set — throw `ValidationError` if inverted
2. Call `applyArchiveQuery(records, query)` to get filtered array
3. Merge `options` (from call site) with any pagination set inside `query` — call-site `options` takes precedence
4. Call `paginate(filtered, mergedOptions)` from `pagination.ts` — handles cursor decode, page size clamping, and cursor generation
5. Return `PaginatedResult<ArchivedRecord>`

Malformed cursor: `decodeCursor` inside `paginate` returns `null` for invalid cursors and falls back to index 0 — no additional handling needed.

### `archiveIterator`

```ts
async function* archiveIterator(
  records: ArchivedRecord[],
  query: ArchiveQuery,
  options?: Omit<PaginationOptions, "cursor">
): AsyncGenerator<PaginatedResult<ArchivedRecord>>
```

Implementation mirrors `paginateIterator` from `pagination.ts` but applies `applyArchiveQuery` first, then delegates to `getArchivedPayrollPage` with cursor chaining:

```
filtered = applyArchiveQuery(records, query)
cursor = undefined
loop:
  page = paginate(filtered, { ...options, cursor })
  yield page
  cursor = page.meta.nextCursor
  break when cursor is undefined
```

Only one page's worth of data is in memory at a time (the slice from `paginate`). The full filtered array is computed once upfront and reused across pages — this is acceptable because the records array is already in-memory; the "no buffering" requirement refers to not accumulating all pages before yielding the first one.

### `buildArchiveSummaryReport`

```ts
function buildArchiveSummaryReport(
  records: ArchivedRecord[],
  query: ArchiveQuery
): ArchiveSummaryReport
```

Implementation:
1. Validate period ordering — throw `ValidationError` if `periodStart > periodEnd`
2. `filtered = applyArchiveQuery(records, query)` — applies ALL query filters
3. Count totals and per-asset breakdowns in a single pass:
   ```
   for each record in filtered:
     increment totalCount
     increment completedCount or failedCount based on record.status
     key = record.asset ?? "unknown"
     increment assetBreakdown[key].totalCount
     increment assetBreakdown[key].completedCount or .failedCount
   ```
4. Extract `periodStart`/`periodEnd` from the query's `toParams()` output (or `""` if not set)
5. Return `ArchiveSummaryReport` with `generatedAt: Date.now()`

---

## File-by-File Implementation Plan

### `packages/core/src/archived/types.ts`

Exports: `ArchivedRecord`, `ArchivedRecordFilter`, `ArchiveQuery`, `ArchiveSummaryReport`

No SDK imports. Pure TypeScript type definitions.

### `packages/core/src/archived/filters.ts`

Exports: `filterArchivedRecords`

Imports: `ArchivedRecord`, `ArchivedRecordFilter` from `./types`

### `packages/core/src/archived/ArchiveFilterBuilder.ts`

Exports: `ArchiveFilterBuilder`

Imports:
- `./types` → `ArchiveQuery`
- `../pagination` → `PaginationOptions`
- `../core/errors` → `ValidationError`

Contains the internal `applyArchiveQuery` helper as a non-exported function used by this module and `query.ts`/`summary.ts`. To avoid circular imports, `applyArchiveQuery` is placed in a shared internal file.

### `packages/core/src/archived/internal.ts` (not exported)

Contains `applyArchiveQuery` — shared between `query.ts` and `summary.ts` without re-exposing it to consumers.

Imports: `./types`, `./ArchiveFilterBuilder` (for the private state accessor)

Since `ArchiveQuery` exposes only `toParams()`, `applyArchiveQuery` reads filter state through `toParams()` to avoid exposing private fields.

### `packages/core/src/archived/query.ts`

Exports: `getArchivedPayrollPage`, `archiveIterator`

Imports:
- `./types`
- `./internal` → `applyArchiveQuery`
- `../pagination` → `paginate`, `PaginationOptions`, `PaginatedResult`
- `../core/errors` → `ValidationError`

### `packages/core/src/archived/summary.ts`

Exports: `buildArchiveSummaryReport`

Imports:
- `./types`
- `./internal` → `applyArchiveQuery`
- `../core/errors` → `ValidationError`

### `packages/core/src/archived/index.ts`

Barrel file. Exports everything the consumer needs:

```ts
export type { ArchivedRecord, ArchivedRecordFilter, ArchiveQuery, ArchiveSummaryReport } from "./types";
export { filterArchivedRecords } from "./filters";
export { ArchiveFilterBuilder } from "./ArchiveFilterBuilder";
export { getArchivedPayrollPage, archiveIterator } from "./query";
export { buildArchiveSummaryReport } from "./summary";
// Re-exports from pagination.ts for single-import convenience
export type { PaginatedResult, PaginationMeta } from "../pagination";
```

### `packages/core/src/index.ts`

Add one line to the existing barrel:

```ts
// ── Archived Payroll History Helpers ────────────────────────────────────────
export * from "./archived";
```

---

## Key Design Decisions

**1. `applyArchiveQuery` reads through `toParams()`**

`ArchiveQuery` is intentionally opaque — only `toParams()` is public. Rather than casting to a private interface, `applyArchiveQuery` deserializes `toParams()` to reconstruct filter predicates. This preserves the immutability guarantee and avoids `as unknown as InternalType` casts.

The deserialization cost is negligible compared to the filter pass over records.

**2. `withStatus` replaces rather than accumulates**

`ArchiveQuery` targets settled data only — the two statuses (`"completed"` / `"failed"`) are mutually exclusive in a single query context. Accumulating both would be equivalent to no filter. Replacement matches user expectation for a status constraint.

**3. Period comparison uses `Date.parse() / 1000`**

`ArchivedRecord.timestamp` is Unix seconds. ISO 8601 period strings are parsed with `Date.parse()` (returns ms) and divided by 1000 for comparison. Edge case: if `Date.parse` returns `NaN` (malformed date string), the comparison `record.timestamp >= NaN` evaluates to `false`, effectively excluding all records. This is the correct safe-fail behavior.

**4. `archiveIterator` applies query filters once upfront**

The full `applyArchiveQuery` pass happens before the first `yield`. For truly streaming behavior without any upfront filtering, a different approach (e.g., streaming from a DB) would be needed — but since the design targets in-memory `ArchivedRecord[]` arrays (the stated use case), this is appropriate and consistent with `paginateIterator`.

**5. `ArchiveSummaryReport` has no `totalAmount`**

The requirements explicitly prohibit exposing per-amount data. An aggregate total amount would technically be aggregate, but it would still reveal the sum of payments for a period — a figure that requires a view key under the SDK's privacy model. Count-based metrics are always safe; amount-based metrics are not.

**6. Compatibility with `HistoryFilterBuilder` pagination**

`HistoryFilterBuilder.paginate()` uses `FilterPaginationOptions` (page, limit, cursor) while `getArchivedPayrollPage` uses `pagination.ts::PaginationOptions` (page, pageSize, cursor). The `limit` field maps to `pageSize`. Requirement 6.2 is met by consumers remapping `limit → pageSize` when bridging between the two builders — this is documented in usage examples. We do not silently alias `limit` to `pageSize` to avoid hiding the type mismatch from TypeScript.

---

## Usage Examples

### Basic period + status query

```ts
import { ArchiveFilterBuilder, getArchivedPayrollPage } from "@zk-payroll/core";

const query = new ArchiveFilterBuilder()
  .forPeriod("2024-01-01", "2024-03-31")
  .withStatus("completed")
  .build();

const page = getArchivedPayrollPage(archivedRecords, query, { pageSize: 50 });
console.log(`${page.meta.total} completed records in Q1 2024`);
```

### Streaming large datasets to a warehouse

```ts
import { ArchiveFilterBuilder, archiveIterator } from "@zk-payroll/core";

const query = new ArchiveFilterBuilder()
  .forPeriod("2024-01-01", "2024-12-31")
  .withAsset("USDC")
  .build();

for await (const page of archiveIterator(archivedRecords, query, { pageSize: 200 })) {
  await warehouse.bulkInsert(page.data);
}
```

### Privacy-safe dashboard aggregation

```ts
import { ArchiveFilterBuilder, buildArchiveSummaryReport } from "@zk-payroll/core";

const query = new ArchiveFilterBuilder()
  .forPeriod("2024-Q1", "2024-Q4")
  .build();

const report = buildArchiveSummaryReport(archivedRecords, query);
// report has no recipient or amount fields — safe for BI export
console.log(report.assetBreakdown);
```

### Mapping `PayrollExecutionSummary` outcomes to archived records

```ts
import { createExecutionSummary, buildArchiveSummaryReport, ArchiveFilterBuilder } from "@zk-payroll/core";
import type { ArchivedRecord } from "@zk-payroll/core";

const summary = createExecutionSummary(outcomes, durationMs);
const now = Math.floor(Date.now() / 1000);

const archived: ArchivedRecord[] = summary.results
  .filter((o) => o.status !== "pending")
  .map((o) => ({
    id: `${summary.timestamp}-${o.recipient}`,
    recipient: o.recipient,
    amount: o.amount,
    asset: o.asset,
    timestamp: now,
    archivedAt: now,
    status: o.status === "success" ? "completed" : "failed",
  }));

const report = buildArchiveSummaryReport(archived, new ArchiveFilterBuilder().build());
// report.completedCount === summary.successCount
// report.failedCount   === summary.failureCount
```

---

## Related Documentation

- [Requirements](./requirements.md) — full EARS-compliant requirements
- [Pagination Helpers](../../docs/pagination.md) — `paginate`, `paginateIterator`, cursor encoding
- [Archived Payroll Analytics](../../docs/ARCHIVED_PAYROLL_ANALYTICS.md) — reporting patterns and privacy boundaries
- [API Reference](../../docs/API.md) — full export listing
