# Payroll Payload Normalization

SDK consumers rarely hand the SDK data in exactly one shape: key names vary
(`recipient` vs. `walletAddress` vs. `wallet`), amounts arrive as
comma-formatted strings or raw numbers, addresses get pasted in lowercase,
and fields carry stray whitespace from a CSV import. `normalizePayrollPayload`
converts any of these variations into one canonical shape before validation,
proof preparation, or transaction building — so the rest of the SDK only
ever has to reason about one format.

## Core concepts

| Concept | What it is |
|---|---|
| `RawPayrollEntry` | The loosely-typed shape a consumer may supply — several key aliases are accepted per field. |
| `CanonicalPayrollEntry` | The normalized, internal shape: trimmed `employeeId`, uppercased `walletAddress`, canonical `asset`/`amount` strings, optional `period`/`department`, and a `source` back-reference. |
| `NormalizationIssue` | A record of a required field that could not be cleanly resolved, tagged with the entry's original index. |
| `normalizePayrollPayload` | Converts a `RawPayrollPayload` (`{ entries: RawPayrollEntry[] }`) into a `NormalizedPayrollPayload` (`{ entries, issues }`). |

```ts
import { normalizePayrollPayload } from "@zk-payroll/core";

const { entries, issues } = normalizePayrollPayload({
  entries: [
    { employee_id: "  E-42  ", wallet: "gabc123def", asset: "xlm", amount: "1,000.50" },
  ],
});

console.log(entries[0]);
// {
//   employeeId: "E-42",
//   walletAddress: "GABC123DEF",
//   asset: "native",
//   amount: "1000.50",
//   source: { index: 0, raw: { employee_id: "  E-42  ", wallet: "gabc123def", ... } },
// }
console.log(issues); // []
```

## Field normalization rules

| Canonical field | Accepted aliases | What normalization does |
|---|---|---|
| `employeeId` | `employeeId`, `employee_id`, `id` | Coerces string/number/bigint input, trims whitespace. |
| `walletAddress` | `recipient`, `walletAddress`, `wallet_address`, `wallet`, `address` | Trims whitespace, uppercases (Stellar strkeys are always uppercase). |
| `asset` | `asset`, `assetId`, `asset_id`, `token` | Trims whitespace; collapses `"xlm"` / `"lumens"` (any casing) to the SDK's reserved `"native"` id. Contract-ID-style values are trimmed only — their casing is significant and left untouched. |
| `period` (optional) | `period`, `periodId`, `period_id`, `payPeriod` | Trims whitespace. Omitted entirely from the canonical entry when not supplied — no issue is raised. |
| `amount` | `amount`, `salaryAmount`, `salary_amount` | Stringifies `bigint`/`number` input; for strings, strips thousands separators, currency symbols (`$€£¥`), and internal/surrounding whitespace, and drops a redundant leading `+`. |

`department` is passed through as a trimmed string when present and omitted
otherwise; the SDK does not interpret it further.

When more than one alias is present on the same raw entry, the first match
(in the order listed above) wins.

## Required fields and issues

`employeeId`, `walletAddress`, `asset`, and `amount` are required. Normalization
never throws and never drops an entry: every input entry produces exactly one
canonical entry, in the same order, even when required data is missing or
malformed.

- If a required field has no usable value, the canonical field is set to
  `""` and a `NormalizationIssue` with `code: "MISSING"` is recorded for that
  entry's index.
- If `amount` normalizes to a non-numeric string (e.g. `"not-a-number"`),
  the cleaned string is still kept on the canonical entry, but a
  `NormalizationIssue` with `code: "UNPARSEABLE_AMOUNT"` is recorded so the
  bad value stays visible instead of silently passing through.

```ts
const { entries, issues } = normalizePayrollPayload({
  entries: [{ period: "2025-Q2-P1" }], // missing employeeId, walletAddress, asset, amount
});

entries[0]; // { employeeId: "", walletAddress: "", asset: "", amount: "", period: "2025-Q2-P1", source: {...} }
issues;     // 4 MISSING issues, one per required field, all with index: 0
```

Run `normalizePayrollPayload` before validation and treat any entry whose
index appears in `issues` as invalid — validation should not need to
re-discover that the data was missing.

## Preserving original input for validation errors

Every canonical entry carries a `source: { index, raw }` back-reference to
the exact object it was derived from. Validation code that rejects a
normalized entry can use `source.index` and `source.raw` to point a caller
back at *their* original input — including the original casing, whitespace,
and key names — rather than only showing the cleaned-up canonical value.

```ts
for (const issue of issues) {
  const original = entries[issue.index].source.raw;
  console.warn(`Entry ${issue.index} (${issue.field}): ${issue.message}`, original);
}
```

## Already-normalized payloads

Payloads that already match the canonical shape (uppercase addresses,
plain decimal amount strings, `"native"` for XLM) pass through unchanged —
normalization is idempotent for well-formed input.
