# Reconciliation Diffs

`generateReconciliationDiff` (`@zk-payroll/core`, `src/reconciliation/`)
compares a payroll run's *expected* results — a `PayrollExecutionSummary`,
recorded client-side as payments were processed — against *observed*
on-chain/contract state, gathered independently (e.g. by re-querying
`getTransaction` or a contract balance for each recipient after the fact).

This exists because the two can genuinely disagree:

- A payment recorded as `"pending"` may have since confirmed or failed
  on-chain.
- A submission the client believes failed may actually have landed on-chain
  (see the duplicate-submission risk noted in [RETRY_POLICY.md](./RETRY_POLICY.md)
  — this is exactly the scenario reconciliation is meant to catch).
- An on-chain transaction may exist with no corresponding expected outcome
  in the client's records at all.

## Usage

```ts
import { generateReconciliationDiff } from "@zk-payroll/core";
import type { ObservedPaymentState } from "@zk-payroll/core";

// `summary` comes from PayrollService/createExecutionSummary, recorded
// during the run.
const observed: ObservedPaymentState[] = await Promise.all(
  summary.results.map(async (outcome) => {
    const tx = await lookUpOnChain(outcome.recipient, outcome.txHash);
    return {
      recipient: outcome.recipient,
      asset: outcome.asset,
      amount: tx?.amount,
      onChainStatus: tx ? (tx.success ? "confirmed" : "failed") : "not_found",
      observedAt: Date.now(),
    };
  })
);

const diff = generateReconciliationDiff(summary, observed);

if (!diff.isFullyReconciled) {
  for (const issue of diff.entries.filter(
    (e) => e.category !== "match" && e.category !== "still_pending"
  )) {
    console.warn(issue.category, issue.recipient, issue.reason);
  }
}
```

## Diff categories

| Category | Meaning |
| --- | --- |
| `match` | Expected and observed agree |
| `missing` | A terminal expected outcome has no corresponding on-chain record |
| `failed_mismatch` | Expected success but chain shows failure, or vice versa (the vice-versa case is the duplicate-submission signal) |
| `amount_mismatch` | Both sides agree the payment landed, but for a different amount |
| `still_pending` | Expected outcome hasn't reached a terminal state — nothing to reconcile yet |
| `unexpected` | An observed on-chain payment has no corresponding expected outcome in this run |

`isFullyReconciled` is `true` only when every entry is `match` or
`still_pending` — i.e. nothing in the diff requires admin attention.

## Matching

Expected outcomes and observed states are matched by `(recipient, asset)`,
which assumes at most one payment per recipient/asset pair within a single
run — true for `PayrollExecutionSummary` as produced by this SDK's
execution helpers (`PayrollService.processPayment`,
`PayrollService.processBatchPayments`). Reconcile one run at a time rather
than merging multiple summaries before diffing.
