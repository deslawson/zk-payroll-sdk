/**
 * Payroll payload normalization.
 *
 * Converts user-provided payroll payloads (varying key names, whitespace,
 * casing, amount formatting) into the SDK's canonical shape before
 * validation, proof preparation, or transaction building.
 *
 * ```ts
 * import { normalizePayrollPayload } from "@zk-payroll/core";
 *
 * const { entries, issues } = normalizePayrollPayload({
 *   entries: [{ employee_id: " E-1 ", wallet: "gabc...", asset: "xlm", amount: "1,000.50" }],
 * });
 * ```
 */
export * from "./types";
export * from "./normalizer";
