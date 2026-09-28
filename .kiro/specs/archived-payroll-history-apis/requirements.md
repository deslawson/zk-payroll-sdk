# Requirements Document

## Introduction

This feature adds a dedicated set of helper APIs for accessing **archived payroll history** in reporting-oriented tools. Reporting consumers (BI dashboards, ETL pipelines, compliance exporters) have a fundamentally different access pattern from real-time operational flows: they query large, stable, already-settled datasets by period, employee, asset, or status; they need safe aggregation helpers that respect ZK privacy boundaries; and they need ergonomic, typed access without being forced to compose raw filter primitives by hand.

The new helpers are additive — they sit on top of the existing `pagination.ts`, `filters/`, `summary/`, and `reconciliation/` modules without changing their contracts. The feature is delivered as a new `archived/` module inside `packages/core/src/` and exported from the package root under `@zk-payroll/core`.

---

## Glossary

- **ArchivedPayrollHistory_API**: The collective name for the helper functions, types, and classes introduced by this feature.
- **ArchivedRecord**: A `PayrollRecord`-compatible object that has been persisted and is considered settled — i.e., its `status` is `"completed"` or `"failed"` and it will not change.
- **ArchiveQuery**: A typed, immutable query descriptor produced by `ArchiveFilterBuilder.build()` and consumed by the archive helper functions.
- **ArchiveFilterBuilder**: A fluent query builder, scoped to reporting use cases, that composes period, employee, asset, status, and amount constraints into an `ArchiveQuery`.
- **ArchivePage**: A `PaginatedResult<ArchivedRecord>` — a single page of archive query results including pagination metadata.
- **ArchiveSummaryReport**: An aggregate report derived from a set of `ArchivedRecord` objects, containing period totals, per-asset breakdowns, and success/failure counts. Contains no per-recipient or per-amount detail.
- **ArchivedRecordFilter**: The plain-object filter argument accepted by `filterArchivedRecords`, with an optional `status` field typed as `"completed" | "failed"`.
- **PayrollRecord**: The existing in-memory record shape with at minimum `id`, `recipient`, `amount` (bigint, stroops), and `timestamp` (Unix seconds).
- **PayrollExecutionSummary**: The existing summary type produced by `createExecutionSummary` — the archival unit for a single run.
- **HistoryFilterBuilder**: The existing fluent builder from `filters/` that targets API-route composition.
- **Reporting_Consumer**: Any tool or process (dashboard, ETL pipeline, audit exporter) that reads historical payroll data for non-operational purposes.
- **Privacy_Boundary**: The rule that per-recipient and per-amount data may only be accessed with a valid audit view key; aggregate-only data is accessible without one.
- **Stroops**: The base unit of Stellar Lumens (XLM); 1 XLM = 10,000,000 stroops.

---

## Requirements

### Requirement 1: Archive Record Type and Status Filtering

**User Story:** As a reporting consumer, I want a clearly typed `ArchivedRecord` shape with a settled status field, so that my code can distinguish archived data from in-flight operational records without guessing.

#### Acceptance Criteria

1. THE ArchivedPayrollHistory_API SHALL define an `ArchivedRecord` type that extends `PayrollRecord` with a required `archivedAt` field (Unix seconds, number) and a `status` field constrained to `"completed" | "failed"`.
2. THE ArchivedPayrollHistory_API SHALL define an `ArchivedRecordFilter` type with a single optional field: `status?: "completed" | "failed"`.
3. WHEN `filterArchivedRecords(records: ArchivedRecord[], filter: ArchivedRecordFilter)` is called with `filter.status` equal to `"completed"`, THE ArchivedPayrollHistory_API SHALL return only the records from `records` whose `status` equals `"completed"`.
4. WHEN `filterArchivedRecords` is called with `filter.status` equal to `"failed"`, THE ArchivedPayrollHistory_API SHALL return only the records from `records` whose `status` equals `"failed"`.
5. WHEN `filterArchivedRecords` is called with a `filter` object that does not include a `status` property (i.e., `filter.status` is `undefined`), THE ArchivedPayrollHistory_API SHALL return all records in the input array without applying any status constraint.
6. THE ArchivedPayrollHistory_API SHALL export `ArchivedRecord` and `ArchivedRecordFilter` as named exports from `@zk-payroll/core` so that Reporting_Consumer tools can import them without referencing internal module paths.

---

### Requirement 2: Archive Filter Builder

**User Story:** As a reporting developer, I want a fluent builder scoped to archived data queries, so that I can compose period, employee, asset, status, and amount constraints in a readable, type-safe way without constructing raw filter objects.

#### Acceptance Criteria

1. THE ArchiveFilterBuilder SHALL support a `forPeriod(start: string, end: string)` method that sets an inclusive date range for the query; both `start` and `end` SHALL be ISO 8601 date strings (e.g. `"2024-01-01"`), and calling `forPeriod` a second time SHALL replace the previously set period.
2. THE ArchiveFilterBuilder SHALL support `forEmployee(id: string)` and `forEmployees(ids: string[])` methods; each call SHALL add the provided IDs to an internal set, so successive calls accumulate IDs rather than replacing them.
3. THE ArchiveFilterBuilder SHALL support `withAsset(asset: string)` and `withAssets(assets: string[])` methods; each call SHALL add the provided asset identifiers to an internal set, so successive calls accumulate identifiers rather than replacing them.
4. THE ArchiveFilterBuilder SHALL support a `withStatus(status: "completed" | "failed")` method that sets the status constraint; calling `withStatus` a second time SHALL replace the previously set value (not accumulate).
5. THE ArchiveFilterBuilder SHALL support `withMinAmount(amount: bigint)` and `withMaxAmount(amount: bigint)` methods that set lower and upper bounds on `ArchivedRecord.amount` (in stroops); each method SHALL replace any previously set value for that bound.
6. THE ArchiveFilterBuilder SHALL support a `paginate(options: PaginationOptions)` method that accepts the `PaginationOptions` interface from `packages/core/src/pagination.ts` (fields: `pageSize?: number`, `cursor?: string`); calling `paginate` a second time SHALL replace the previously set pagination options.
7. WHEN `build()` is called, THE ArchiveFilterBuilder SHALL return an `ArchiveQuery` object whose filter state cannot be mutated by subsequent calls to the builder or by any method on the returned object.
8. THE `ArchiveQuery` object returned by `build()` SHALL expose a `toParams()` method that returns a plain `Record<string, string>` where: employee IDs are serialized as a comma-separated string under key `"employeeIds"`, asset identifiers under `"assets"`, period bounds under `"periodStart"` and `"periodEnd"`, status under `"status"`, amount bounds as decimal strings under `"minAmount"` and `"maxAmount"`, and pagination fields as `"pageSize"` (decimal string) and `"cursor"`; only keys with set values SHALL appear in the output.
9. WHEN `reset()` is called on the builder, THE ArchiveFilterBuilder SHALL discard all accumulated and set values (employees, assets, period, status, amount bounds, pagination), returning the builder to the same state as a freshly constructed instance.
10. FOR ANY `ArchiveQuery` object `q` produced by `build()`, constructing a new `ArchiveFilterBuilder`, calling its setter methods using the values parsed from `q.toParams()`, then calling `build().toParams()` SHALL return a plain object that is deeply equal to `q.toParams()`.

---

### Requirement 3: Paginated Archive Query Helper

**User Story:** As a reporting developer, I want a single helper function that applies an `ArchiveQuery` to an in-memory array and returns a paginated result, so that I do not have to compose filter and pagination calls manually.

#### Acceptance Criteria

1. THE ArchivedPayrollHistory_API SHALL provide a `getArchivedPayrollPage` function with the signature `(records: ArchivedRecord[], query: ArchiveQuery, options?: PaginationOptions) => PaginatedResult<ArchivedRecord>`, where `PaginationOptions` and `PaginatedResult` are from `packages/core/src/pagination.ts`.
2. WHEN `getArchivedPayrollPage` is called, THE ArchivedPayrollHistory_API SHALL apply all filter criteria from `query` to `records` first, then paginate the filtered results, so that `meta.total` equals the count of records that pass all filters — not the length of the raw input array.
3. WHEN `getArchivedPayrollPage` is called with a `cursor` value equal to `meta.nextCursor` from a previous call made with the same `records` array and same `query`, THE ArchivedPayrollHistory_API SHALL return the next page of the same filtered result set, treating the `records` array as stable (same reference and order) across calls.
4. WHEN `getArchivedPayrollPage` is called with a `pageSize` less than 1, THE ArchivedPayrollHistory_API SHALL clamp it to 1; WHEN called with a `pageSize` greater than 100, THE ArchivedPayrollHistory_API SHALL clamp it to 100; in both cases no error SHALL be thrown.
5. WHEN `getArchivedPayrollPage` is called with an empty `records` array, THE ArchivedPayrollHistory_API SHALL return a `PaginatedResult` with `data` equal to `[]`, `meta.total` equal to `0`, and `meta.hasNextPage` equal to `false`.
6. FOR ANY non-empty `ArchivedRecord[]` array `records` and any `ArchiveQuery` `query`, exhaustively iterating all pages of `getArchivedPayrollPage` by following successive `meta.nextCursor` values until `meta.hasNextPage` is `false` SHALL yield a combined `data` array that contains every record from `records` passing the query's filters exactly once, in the same relative order as they appear in `records`.

---

### Requirement 4: Async Streaming Iterator for Archive Data

**User Story:** As a data pipeline developer, I want an async iterator that streams archived records page by page, so that I can process large history datasets without loading the entire filtered set into memory.

#### Acceptance Criteria

1. THE ArchivedPayrollHistory_API SHALL provide an `archiveIterator` async generator function with the signature `(records: ArchivedRecord[], query: ArchiveQuery, options?: Omit<PaginationOptions, "cursor">) => AsyncGenerator<PaginatedResult<ArchivedRecord>>`; if `options.pageSize` is not provided it SHALL default to `20`; if provided outside [1, 100] it SHALL be clamped to the nearest bound without throwing.
2. WHEN `archiveIterator` is iterated to completion, THE ArchivedPayrollHistory_API SHALL apply `query` filters to `records` and yield every resulting page exactly once, with no record appearing in more than one yielded page and every matching record appearing in exactly one page.
3. WHEN `archiveIterator` is called with an empty `records` array, THE ArchivedPayrollHistory_API SHALL yield exactly one `PaginatedResult` with `data` equal to `[]`, `meta.total` equal to `0`, and `meta.hasNextPage` equal to `false`, then complete.
4. THE `archiveIterator` implementation SHALL yield each page immediately upon computing it using cursor-based chaining (passing the previous page's `meta.nextCursor` to the next `getArchivedPayrollPage` call) and SHALL NOT buffer more than one page's worth of records in memory at any point before yielding.

---

### Requirement 5: Privacy-Safe Aggregate Summary Report

**User Story:** As a BI analyst, I want a helper that derives an aggregate `ArchiveSummaryReport` from a set of archived records without exposing per-recipient or per-amount detail, so that I can build dashboards and compliance exports that stay within the SDK's Privacy_Boundary.

#### Acceptance Criteria

1. THE ArchivedPayrollHistory_API SHALL provide a `buildArchiveSummaryReport` function with the signature `(records: ArchivedRecord[], query: ArchiveQuery) => ArchiveSummaryReport`.
2. THE `ArchiveSummaryReport` type SHALL contain exactly these fields: `periodStart: string`, `periodEnd: string`, `totalCount: number`, `completedCount: number`, `failedCount: number`, `assetBreakdown: Record<string, { totalCount: number; completedCount: number; failedCount: number }>`, and `generatedAt: number` (Unix epoch milliseconds).
3. THE `ArchiveSummaryReport` type SHALL NOT contain any field that exposes individual `recipient` addresses or individual `amount` values; in particular, the fields `recipient`, `amount`, `recipients`, and `amounts` SHALL NOT be present on the type.
4. WHEN `buildArchiveSummaryReport` is called, THE ArchivedPayrollHistory_API SHALL apply ALL filters from `query` (period, employee, asset, status, and amount bounds) to `records` before computing any counts or breakdowns.
5. WHEN `buildArchiveSummaryReport` is called and the filtered record set is empty, THE ArchivedPayrollHistory_API SHALL return an `ArchiveSummaryReport` with `totalCount`, `completedCount`, and `failedCount` all equal to `0`, and `assetBreakdown` equal to `{}`.
6. FOR ANY `ArchivedRecord[]` array whose elements each have `status` equal to `"completed"` or `"failed"`, the `totalCount` in the returned `ArchiveSummaryReport` SHALL equal `completedCount + failedCount`.
7. FOR ANY `ArchivedRecord[]` array whose elements each have `status` equal to `"completed"` or `"failed"` and an `asset` field that is a non-empty string, the sum of `assetBreakdown[asset].totalCount` across all keys in `assetBreakdown` SHALL equal `ArchiveSummaryReport.totalCount`; records missing an `asset` field SHALL be counted under the key `"unknown"`.
8. WHEN `buildArchiveSummaryReport` is called with an `ArchiveQuery` that has no period set, THE ArchivedPayrollHistory_API SHALL set `periodStart` and `periodEnd` in the returned report to the empty string `""`, and SHALL still apply all non-period filters from `query`.
9. WHEN `buildArchiveSummaryReport` is called with an `ArchiveQuery` that has a period set (both `periodStart` and `periodEnd` are non-empty), THE ArchivedPayrollHistory_API SHALL copy those strings verbatim into `report.periodStart` and `report.periodEnd` without reformatting.

---

### Requirement 6: Compatibility with Existing History and Filter Utilities

**User Story:** As an SDK integrator, I want the new archive helpers to interoperate with existing pagination, filter, and summary utilities, so that I can mix-and-match them in my reporting pipeline without conversion layers.

#### Acceptance Criteria

1. THE ArchivedPayrollHistory_API SHALL accept as a valid `ArchivedRecord` any object that structurally satisfies the `PayrollRecord` interface (has `id: string`, `recipient: string`, `amount: bigint`, `timestamp: number`) and additionally has `archivedAt: number` and `status: "completed" | "failed"`.
2. WHEN `getArchivedPayrollPage` is called with a `PaginationOptions` object that contains a `pageSize` field (number) and an optional `cursor` field (string), as returned by `HistoryFilterBuilder`'s pagination helper, THE ArchivedPayrollHistory_API SHALL use `pageSize` as the page size and `cursor` as the starting position without throwing or losing records.
3. THE ArchivedPayrollHistory_API SHALL re-export the `PaginatedResult` and `PaginationMeta` types from `packages/core/src/pagination.ts` as named exports, so that Reporting_Consumer tools can import them from `@zk-payroll/core/archived` without a separate import from `@zk-payroll/core/pagination`.
4. WHEN a `PayrollExecutionSummary.results` array (of `PaymentExecutionOutcome` objects, each with a `status` of `"success"`, `"failure"`, or `"pending"`) is mapped to `ArchivedRecord` shape by converting `"success"` → `status: "completed"` and `"failure"` → `status: "failed"` and excluding outcomes with `status: "pending"`, THEN calling `buildArchiveSummaryReport` with those mapped records SHALL produce a report whose `completedCount` equals the number of `"success"` outcomes and whose `failedCount` equals the number of `"failure"` outcomes in the original array.

---

### Requirement 7: Error Handling for Malformed Inputs

**User Story:** As a developer integrating the archive helpers, I want descriptive errors when I pass invalid inputs, so that I can fix issues quickly without silent data corruption.

#### Acceptance Criteria

1. IF `getArchivedPayrollPage` is called with a `query` whose `periodStart` string is chronologically later than its `periodEnd` string, THEN THE ArchivedPayrollHistory_API SHALL throw a `ValidationError` whose `field` property equals `"periodStart"` and whose `message` property contains both the string `"periodStart"` and the string `"periodEnd"`.
2. IF `buildArchiveSummaryReport` is called with a `query` whose `periodStart` string is chronologically later than its `periodEnd` string, THEN THE ArchivedPayrollHistory_API SHALL throw a `ValidationError` whose `field` property equals `"periodStart"` and whose `message` property contains both the string `"periodStart"` and the string `"periodEnd"`.
3. IF `ArchiveFilterBuilder.withMinAmount` is called with a bigint value less than `0n`, THEN THE ArchiveFilterBuilder SHALL throw a `ValidationError` whose `field` property equals `"minAmount"` and whose `message` contains the string `"non-negative"`.
4. IF `ArchiveFilterBuilder.withMaxAmount` is called with a bigint value strictly less than the `minAmount` value that is already set on the builder, THEN THE ArchiveFilterBuilder SHALL throw a `ValidationError` whose `field` property equals `"maxAmount"` and whose `message` contains both `"maxAmount"` and `"minAmount"`; if no `minAmount` has been set yet, `withMaxAmount` SHALL NOT throw regardless of the value passed.
5. IF `getArchivedPayrollPage` is called with a `cursor` string that cannot be parsed as a valid cursor by the underlying `paginate` function, THEN THE ArchivedPayrollHistory_API SHALL return the first page of filtered results (index 0) without throwing an error and without emitting any console output.
