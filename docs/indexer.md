# Contract State Indexer

The SDK contract-state indexer reconstructs a normalized payroll domain view from
paginated contract readers. It is intended for dashboards, backends, audit jobs,
and reconciliation tools that should not each reinvent contract-state parsing.

## Quick start

```ts
import { ContractStateIndexer, ContractStateReader } from "@zk-payroll/core";

const reader: ContractStateReader = {
  async listCompanies({ cursor, limit }) {
    return contractReader.fetchCompanies({ cursor, limit });
  },
  async listEmployees(companyId, { cursor, limit }) {
    return contractReader.fetchEmployees(companyId, { cursor, limit });
  },
  async listPayrollRuns(companyId, { cursor, limit }) {
    return contractReader.fetchPayrollRuns(companyId, { cursor, limit });
  },
  async listContractEvents(companyId, { cursor, limit }) {
    return contractReader.fetchEvents(companyId, { cursor, limit });
  },
  async listCommitments(companyId, { cursor, limit }) {
    return contractReader.fetchCommitments(companyId, { cursor, limit });
  },
  async listAuditPermissions(companyId, { cursor, limit }) {
    return contractReader.fetchAuditPermissions(companyId, { cursor, limit });
  },
};

const result = await new ContractStateIndexer(reader).index({ pageSize: 100 });

console.log(result.companies);
console.log(result.diagnostics.warnings);
```

## Normalized view

`ContractStateIndexer.index()` returns:

- `companies`
- `employees`
- `payrollRuns`
- `events`
- `commitments`
- `auditPermissions`
- `diagnostics`
- `checkpoint`

Every record is keyed with stable SDK-level identifiers so consumers can build
maps, tables, and reconciliation reports without depending on raw contract
storage layout.

## Diagnostics

The indexer separates consistency findings by severity:

- `warnings`: non-blocking inconsistencies, such as duplicate commitments or
  expired audit permissions.
- `recoverableErrors`: missing references and orphaned records that consumers
  can display or quarantine while continuing to load the rest of the dataset.
- `fatalErrors`: corrupted event data, invalid timestamps, or checkpoint resume
  failures that should stop privileged automation until reviewed.

Handled consistency checks include:

- missing employee references from payroll runs, commitments, and events
- orphan payroll runs
- missing payroll-run references
- mismatched event data
- duplicate commitments
- stale audit permissions
- corrupted event payloads

## Pagination and checkpointing

Readers must honor `{ cursor, limit }` and return `{ items, nextCursor }`.
The indexer walks collections page by page, so large contracts do not require a
single full-state read.

Use `maxPages` for bounded background jobs:

```ts
const firstPass = await indexer.index({ pageSize: 100, maxPages: 20 });

if (!firstPass.checkpoint.complete) {
  await saveCheckpoint(firstPass.checkpoint);
}

const resumed = await indexer.index({
  pageSize: 100,
  checkpoint: await loadCheckpoint(),
});
```

If a checkpoint stops in the middle of a company, implement `getCompany()` on
the reader so the next run can resume that company safely.

## Consumer guidance

Dashboard consumers should show warnings inline and avoid hiding recoverable
errors. Backend consumers should fail closed when `fatalErrors.length > 0`, but
can usually continue read-only reporting when only warnings are present.

For best performance:

- start with `pageSize` between 50 and 200 records
- persist checkpoints for scheduled jobs
- keep raw event payloads available for audit drill-downs
- treat diagnostics as part of the indexed result, not as logs that can be
  discarded
