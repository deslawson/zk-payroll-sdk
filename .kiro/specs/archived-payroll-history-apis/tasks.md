# Implementation Plan: Archived Payroll History APIs

## Overview

Add a new `packages/core/src/archived/` module that exposes reporting-oriented helper APIs for archived payroll data. The module is built on top of the existing `pagination.ts`, `filters/`, and `summary/` modules without modifying their contracts. All symbols are re-exported from `@zk-payroll/core` via a single barrel export line added to `packages/core/src/index.ts`.

## Tasks

- [x] 1. Define core types for the archived module
  - [x] 1.1 Create `packages/core/src/archived/types.ts` with all four type definitions
    - Export `ArchivedRecord` extending `PayrollRecord` with `archivedAt: number`, `status: "completed" | "failed"`, and optional `asset?: string`
    - Export `ArchivedRecordFilter` with a single optional `status?: "completed" | "failed"` field
    - Export `ArchiveQuery` interface with `toParams(): Record<string, string>` as its only public method
    - Export `ArchiveSummaryReport` with fields: `periodStart`, `periodEnd`, `totalCount`, `completedCount`, `failedCount`, `assetBreakdown`, and `generatedAt`; no `recipient` or `amount` fields
    - _Requirements: 1.1, 1.2, 2.8, 5.2, 5.3_

- [x] 2. Implement `filterArchivedRecords` and the low-level filter layer
  - [x] 2.1 Create `packages/core/src/archived/filters.ts`
    - Implement `filterArchivedRecords(records: ArchivedRecord[], filter: ArchivedRecordFilter): ArchivedRecord[]`
    - When `filter.status` is `"completed"`, return only records with `status === "completed"`
    - When `filter.status` is `"failed"`, return only records with `status === "failed"`
    - When `filter.status` is `undefined`, return all records unchanged
    - _Requirements: 1.3, 1.4, 1.5_

  - [x]* 2.2 Write unit tests for `filterArchivedRecords`
    - Test all three status filter branches (completed, failed, undefined)
    - Test with empty input array
    - Test that output is a new array (no mutation)
    - _Requirements: 1.3, 1.4, 1.5_

- [x] 3. Implement `ArchiveFilterBuilder` and the internal query helper
  - [x] 3.1 Create `packages/core/src/archived/ArchiveFilterBuilder.ts`
    - Implement `ArchiveFilterBuilder` class with private state: `employeeIds: Set<string>`, `assets: Set<string>`, `periodStart?: string`, `periodEnd?: string`, `status?: "completed" | "failed"`, `minAmount?: bigint`, `maxAmount?: bigint`, `pagination?: PaginationOptions`
    - Implement `forPeriod(start, end)` — replaces period on each call
    - Implement `forEmployee(id)` and `forEmployees(ids)` — accumulate into the `employeeIds` Set
    - Implement `withAsset(asset)` and `withAssets(assets)` — accumulate into the `assets` Set
    - Implement `withStatus(status)` — replaces on each call (not accumulate)
    - Implement `withMinAmount(amount)` — replaces; throw `ValidationError` with `field: "minAmount"` and message containing `"non-negative"` if `amount < 0n`
    - Implement `withMaxAmount(amount)` — replaces; throw `ValidationError` with `field: "maxAmount"` and message containing `"maxAmount"` and `"minAmount"` if `minAmount` is already set and `amount < minAmount`
    - Implement `paginate(options: PaginationOptions)` — replaces on each call
    - Implement `reset()` — clears all state
    - Implement `build()` — take a deep snapshot of current state (manual copy, not `JSON.stringify`, because `bigint` is not JSON-serializable); return an `ArchiveQuery` whose `toParams()` serializes: employee IDs as comma-joined string under `"employeeIds"`, assets under `"assets"`, period under `"periodStart"` / `"periodEnd"`, status under `"status"`, amount bounds as decimal strings under `"minAmount"` / `"maxAmount"`, pagination as `"pageSize"` (decimal string) and `"cursor"`; omit keys with no value set
    - The returned `ArchiveQuery` must close over its snapshot so subsequent builder mutations have no effect on it
    - Import `PaginationOptions` from `../pagination` and `ValidationError` from `../core/errors`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 7.3, 7.4_

  - [x]* 3.2 Write property test for `ArchiveFilterBuilder` — round-trip toParams consistency
    - **Property 1: Round-trip `toParams` consistency**
    - For any `ArchiveQuery` `q` produced by `build()`, parsing `q.toParams()` back into a new builder and calling `build().toParams()` must deeply equal `q.toParams()`
    - Generate random combinations of: period strings, employee ID arrays, asset arrays, status values, pagination options
    - **Validates: Requirements 2.10**

  - [x]* 3.3 Write unit tests for `ArchiveFilterBuilder`
    - Test `forPeriod` replace semantics (second call overwrites first)
    - Test `forEmployee` / `forEmployees` accumulation (IDs deduplicated via Set)
    - Test `withAsset` / `withAssets` accumulation
    - Test `withStatus` replace semantics
    - Test `withMinAmount` throws `ValidationError` for `amount < 0n`
    - Test `withMaxAmount` throws when `minAmount` is set and `maxAmount < minAmount`
    - Test `withMaxAmount` does NOT throw when no `minAmount` is set
    - Test `reset()` returns builder to empty state
    - Test `build()` snapshot is immutable (mutate builder after build; verify query unchanged)
    - Test `toParams()` omits keys for unset fields
    - Test `paginate` replace semantics
    - _Requirements: 2.1–2.9, 7.3, 7.4_

- [x] 4. Implement the internal `applyArchiveQuery` helper
  - [x] 4.1 Create `packages/core/src/archived/internal.ts` (not exported from barrel)
    - Implement `applyArchiveQuery(records: ArchivedRecord[], query: ArchiveQuery): ArchivedRecord[]`
    - Read filter state by calling `query.toParams()` and deserializing the result
    - Apply filters in order: status, employeeIds, assets, periodStart, periodEnd, minAmount, maxAmount
    - Malformed date strings are treated as unsatisfiable constraints — all records excluded (safe-fail)
    - Do not export this function from `internal.ts` or from the module barrel
    - _Requirements: 3.2, 4.2, 5.4_

  - [x]* 4.2 Write unit tests for `applyArchiveQuery`
    - Test each filter dimension in isolation
    - Test that malformed date strings exclude all records
    - Test that an empty query (no filters set) returns all records
    - Test combined filter (multiple dimensions applied together, AND semantics)
    - _Requirements: 3.2, 5.4_

- [x] 5. Implement `getArchivedPayrollPage`
  - [x] 5.1 Create `packages/core/src/archived/query.ts` with `getArchivedPayrollPage`
    - Signature: `(records: ArchivedRecord[], query: ArchiveQuery, options?: PaginationOptions) => PaginatedResult<ArchivedRecord>`
    - Validates period ordering; applies query filters; merges pagination options; delegates to `paginate()`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 7.1, 7.5_

  - [x]* 5.2 Write property test for `getArchivedPayrollPage` — pagination completeness
    - **Property 2: Pagination completeness** — validates Requirements 3.6

  - [x]* 5.3 Write property test for `getArchivedPayrollPage` — no duplication across pages
    - **Property 3: No duplication across pages** — validates Requirements 3.6, 4.2

  - [x]* 5.4 Write unit tests for `getArchivedPayrollPage`
    - _Requirements: 3.3, 3.4, 3.5, 7.1, 7.5_

- [x] 6. Checkpoint — All archived tests pass ✓

- [x] 7. Implement `archiveIterator`
  - [x] 7.1 Add `archiveIterator` to `packages/core/src/archived/query.ts`
    - Signature: `async function* archiveIterator(...): AsyncGenerator<PaginatedResult<ArchivedRecord>>`
    - Applies query filters once upfront; uses cursor-chaining loop; yields immediately per page
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x]* 7.2 Write property test for `archiveIterator` — streaming completeness and no duplication
    - **Property 4: Streaming completeness and no duplication** — validates Requirements 4.2

  - [x]* 7.3 Write unit tests for `archiveIterator`
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 8. Implement `buildArchiveSummaryReport`
  - [x] 8.1 Create `packages/core/src/archived/summary.ts`
    - Signature: `(records: ArchivedRecord[], query: ArchiveQuery) => ArchiveSummaryReport`
    - Validates period; applies all filters; single-pass count loop with per-asset breakdown; no recipient/amount fields
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.8, 5.9, 6.4, 7.2_

  - [x]* 8.2 Write property test — totalCount invariant
    - **Property 5: totalCount = completedCount + failedCount** — validates Requirements 5.6

  - [x]* 8.3 Write property test — assetBreakdown partition invariant
    - **Property 6: assetBreakdown partition invariant** — validates Requirements 5.7

  - [x]* 8.4 Write unit tests for `buildArchiveSummaryReport`
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 6.4, 7.2_

- [x] 9. Create the barrel index and wire up the package export
  - [x] 9.1 Create `packages/core/src/archived/index.ts`
    - _Requirements: 1.6, 6.3_

  - [x] 9.2 Add archived module export to `packages/core/src/index.ts`
    - _Requirements: 1.6, 6.3_

  - [x]* 9.3 Write smoke tests for the public surface area
    - _Requirements: 1.6, 6.3_

- [x] 10. Final checkpoint — All archived tests pass ✓

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- `applyArchiveQuery` in `internal.ts` intentionally reads through `toParams()` rather than casting to a private type — this preserves the `ArchiveQuery` immutability guarantee
- `bigint` amounts must be serialized/deserialized carefully: `toParams()` converts to decimal strings; `applyArchiveQuery` converts back with `BigInt(str)`
- Period comparison uses `Date.parse(str) / 1000` to get Unix seconds matching `ArchivedRecord.timestamp`; a malformed date string produces `NaN` → treated as unsatisfiable constraint, all records excluded (safe-fail)
- The `withStatus` method replaces (not accumulates) because `"completed"` and `"failed"` are mutually exclusive in a single query context
- `archiveIterator` applies `applyArchiveQuery` once upfront and then pages over the filtered slice — acceptable because records are already in-memory
- Each task references specific requirements for full traceability
