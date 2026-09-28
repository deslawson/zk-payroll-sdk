## Summary

Add a settlement receipt validation helper (`validateSettlementReceipt()`) that gates settlement receipts — produced after payroll finalization — before they enter reconciliation, audit, or archival flows. Closes #532.

## Why this matters

Clear validation and operational states make payroll safer to run without exposing sensitive employee or salary information. Until now, the settlement module only validated receipt *ID format*; there was no lightweight, non-throwing check that a settlement receipt is operationally acceptable (settled status, transaction reference, metadata digest). The full cryptographic verifier exists, but operational views need a fast explicit-result gate whose errors are safe to log and render.

## Changes

- **New helper** — `packages/core/src/settlement/receipt.ts`:
  - `validateSettlementReceipt(receipt, options?)` returns an explicit result — `{ ok: true, receiptId, displayReceiptId, state: "validated" }` or `{ ok: false, code, message, state }` — and never throws.
  - `state` distinguishes `"invalid"` (well-formed receipt failing policy) from `"malformed"` (not a receipt object at all).
  - Stable error codes via `SettlementReceiptErrorCode` (receipt/payroll ID, settlement status, transaction reference, metadata digest).
  - Policy options: `allowedStatuses` (default `["settled", "confirmed"]`), `expectedPayrollId`, and `metadata` for digest content verification.
  - Reuses the canonical receipt ID rules (`validateSettlementReceiptId`) and the shared metadata digest utilities, so there is no duplicated validation logic.
- **Privacy** — rejected values are never echoed: error messages contain no receipt IDs, hashes, payroll IDs, or amounts, and `displayReceiptId` is redacted (e.g. `rcp***def`) for safe logging and UI feedback.
- **Integration** — exported from the package barrel (`@zk-payroll/core`) and available on `PayrollService` as instance and static `validateSettlementReceipt()`; `extractSettlementReceiptTxHash()` exposes the normalized on-chain hash for reconciliation pipelines.
- **Tests** — 17 new tests (`tests/settlement-receipt-validation.test.ts`) covering success paths, every failure path, policy overrides (e.g. accepting `pending` explicitly), a privacy guarantee test asserting no rejected value leaks into messages, and `PayrollService` integration.
- **Docs** — new "Settlement Receipt Validation" section in `docs/SDK_ENHANCEMENTS.md` and an entry in the README's payroll reliability helpers section.

## QA

- `npm run typecheck -w packages/core` — passes.
- `npm run build -w packages/core` — passes.
- Lint on all touched files — clean (repo has pre-existing lint errors elsewhere; untouched).
- New test suite: 17/17 passing.
- Full suite: 171 suites / 3,217 tests passing (the `benchmarks/memory-benchmarks` suite is timing-sensitive and flaky in CI environments; it passes standalone with and without this change and the change does not touch benchmark code).

## Notes

- No existing behavior changed: the helper is additive, all prior exports remain, and no regression risk to existing payroll flows (verified by the full suite).
- Complements, but does not replace, `verifyPayrollReceipt()` — the full cryptographic verifier remains the right tool for tamper-evidence; this helper is the fast operational gate.
