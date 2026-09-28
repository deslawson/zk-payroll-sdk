/**
 * Settlement Receipt Validation Helper
 *
 * Lightweight, dependency-free validation for settlement receipts flowing
 * through the payroll workflow (post-finalization, pre-reconciliation).
 *
 * ## Why This Matters
 * Clear validation and operational states make payroll safer to run without
 * exposing sensitive employee or salary information. Rejected values are never
 * echoed back in error messages; only stable machine-readable codes and
 * sanitized text are returned.
 */

import { computeMetadataDigest, isValidHexDigest } from "../receipts/digest";
import { extractReceiptTxHash } from "../receipts/receiptVerifier";
import type { PayrollReceipt } from "../receipts/types";
import { redactReceiptId, validateSettlementReceiptId } from "./receiptId";

/** Stable machine-readable codes emitted by {@link validateSettlementReceipt}. */
export const SettlementReceiptErrorCode = {
  RECEIPT_REQUIRED: "SETTLEMENT_RECEIPT_REQUIRED",
  RECEIPT_ID_INVALID: "SETTLEMENT_RECEIPT_ID_INVALID",
  PAYROLL_ID_REQUIRED: "SETTLEMENT_RECEIPT_PAYROLL_ID_REQUIRED",
  SETTLEMENT_STATUS_REQUIRED: "SETTLEMENT_RECEIPT_SETTLEMENT_STATUS_REQUIRED",
  SETTLEMENT_STATUS_NOT_SETTLED: "SETTLEMENT_RECEIPT_STATUS_NOT_SETTLED",
  TRANSACTION_REFERENCE_REQUIRED: "SETTLEMENT_RECEIPT_TX_REFERENCE_REQUIRED",
  METADATA_DIGEST_REQUIRED: "SETTLEMENT_RECEIPT_METADATA_DIGEST_REQUIRED",
  METADATA_DIGEST_MISMATCH: "SETTLEMENT_RECEIPT_METADATA_DIGEST_MISMATCH",
} as const;

export type SettlementReceiptErrorCode =
  (typeof SettlementReceiptErrorCode)[keyof typeof SettlementReceiptErrorCode];

/** Settlement states accepted by the default validation policy. */
export type SettledReceiptStatus = "settled" | "confirmed";

/** Operational state describing where a settlement receipt stands. */
export type SettlementReceiptOperationalState = "validated" | "invalid" | "malformed";

/** Explicit validation result — never throws, never echoes rejected input. */
export type SettlementReceiptValidation =
  | {
      ok: true;
      /** Normalized (trimmed) receipt ID. */
      receiptId: string;
      /** Redacted receipt ID safe for logs and UI (e.g. `rcp***def`). */
      displayReceiptId: string;
      state: "validated";
    }
  | {
      ok: false;
      /** Stable machine-readable failure code. */
      code: SettlementReceiptErrorCode;
      /** Sanitized, actionable message — sensitive values are never included. */
      message: string;
      state: SettlementReceiptOperationalState;
    };

/** Default statuses accepted as proof of settlement. */
export const DEFAULT_SETTLED_STATUSES: readonly SettledReceiptStatus[] = ["settled", "confirmed"];

/** Options for {@link validateSettlementReceipt}. */
export interface SettlementReceiptValidationOptions {
  /**
   * Statuses accepted as settled. Defaults to `["settled", "confirmed"]`.
   * Pass `["pending", "settled", "confirmed"]` to also accept in-flight
   * settlements during reconciliation windows.
   */
  allowedStatuses?: readonly string[];
  /**
   * Expected payroll ID. When provided, `receipt.payrollId` must match.
   * Mismatch is reported with a sanitized message that does not echo values.
   */
  expectedPayrollId?: string;
  /**
   * Metadata payload to digest-check against `receipt.metadataDigest`.
   * When provided, the canonical SHA-256 of this object must equal the digest
   * recorded on the receipt.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Normalize a settlement status value for comparison (lowercase, trimmed).
 */
function normalizeStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Validate a settlement receipt before it is accepted by the payroll workflow
 * (reconciliation, audit views, or archival).
 *
 * The check is intentionally lightweight and synchronous: it complements the
 * full cryptographic verifier (`verifyPayrollReceipt`) for fast operational
 * gates where a full digest recomputation is unnecessary.
 *
 * Privacy: rejected values are never reflected in messages. Receipt IDs are
 * redacted via {@link redactReceiptId} wherever they are surfaced.
 *
 * @param receipt - Untrusted settlement receipt candidate.
 * @param options - Optional policy (allowed statuses, expected payroll ID, metadata digest check).
 * @returns Explicit `SettlementReceiptValidation` result — never throws.
 *
 * @example
 * ```typescript
 * const result = validateSettlementReceipt(untrustedReceipt);
 * if (!result.ok) {
 *   console.error(result.code, result.message); // safe to log
 * }
 * ```
 */
export function validateSettlementReceipt(
  receipt: unknown,
  options: SettlementReceiptValidationOptions = {}
): SettlementReceiptValidation {
  // 1. Structural gate — must be an object resembling a payroll receipt.
  if (typeof receipt !== "object" || receipt === null || Array.isArray(receipt)) {
    return {
      ok: false,
      code: SettlementReceiptErrorCode.RECEIPT_REQUIRED,
      message:
        "Settlement receipt must be an object with receiptId, payrollId, settlementStatus, transactionReference, and metadataDigest.",
      state: "malformed",
    };
  }

  const candidate = receipt as Partial<PayrollReceipt> & Record<string, unknown>;

  // 2. Receipt ID — reuse the canonical settlement receipt ID rules.
  const idResult = validateSettlementReceiptId(candidate.receiptId);
  if (!idResult.isValid) {
    return {
      ok: false,
      code: SettlementReceiptErrorCode.RECEIPT_ID_INVALID,
      message: `Settlement receipt ID is invalid (${idResult.code ?? "UNKNOWN"}).`,
      state: "invalid",
    };
  }
  const receiptId = idResult.sanitizedReceiptId!;

  // 3. Payroll ID — required; optionally matched against an expected value.
  const payrollId = typeof candidate.payrollId === "string" ? candidate.payrollId.trim() : "";
  if (payrollId.length === 0) {
    return {
      ok: false,
      code: SettlementReceiptErrorCode.PAYROLL_ID_REQUIRED,
      message: "Settlement receipt is missing the payroll identifier.",
      state: "invalid",
    };
  }
  if (options.expectedPayrollId && payrollId !== options.expectedPayrollId.trim()) {
    return {
      ok: false,
      code: SettlementReceiptErrorCode.PAYROLL_ID_REQUIRED,
      message: "Settlement receipt payroll identifier does not match the expected payroll run.",
      state: "invalid",
    };
  }

  // 4. Settlement status — must be an allowed settled state.
  const status = normalizeStatus(candidate.settlementStatus);
  if (status.length === 0) {
    return {
      ok: false,
      code: SettlementReceiptErrorCode.SETTLEMENT_STATUS_REQUIRED,
      message: "Settlement receipt is missing the settlement status.",
      state: "invalid",
    };
  }
  const allowed = options.allowedStatuses ?? DEFAULT_SETTLED_STATUSES;
  if (!allowed.map(normalizeStatus).includes(status)) {
    return {
      ok: false,
      code: SettlementReceiptErrorCode.SETTLEMENT_STATUS_NOT_SETTLED,
      message:
        "Settlement receipt status is not an accepted settled state; the payroll run must settle before reconciliation.",
      state: "invalid",
    };
  }

  // 5. Transaction reference — string form or structured { txHash } form.
  const txRef: unknown = candidate.transactionReference;
  let txHash = "";
  if (typeof txRef === "string") {
    txHash = txRef.trim();
  } else if (
    typeof txRef === "object" &&
    txRef !== null &&
    typeof (txRef as Record<string, unknown>).txHash === "string"
  ) {
    txHash = ((txRef as Record<string, unknown>).txHash as string).trim();
  }
  if (txHash.length === 0) {
    return {
      ok: false,
      code: SettlementReceiptErrorCode.TRANSACTION_REFERENCE_REQUIRED,
      message:
        "Settlement receipt is missing a transaction reference (txHash) for the settled payment.",
      state: "invalid",
    };
  }

  // 6. Metadata digest — format check, plus content match when metadata is supplied.
  const digest =
    typeof candidate.metadataDigest === "string" ? candidate.metadataDigest.trim() : "";
  if (digest.length === 0) {
    return {
      ok: false,
      code: SettlementReceiptErrorCode.METADATA_DIGEST_REQUIRED,
      message: "Settlement receipt is missing the metadata digest.",
      state: "invalid",
    };
  }
  if (!isValidHexDigest(digest)) {
    return {
      ok: false,
      code: SettlementReceiptErrorCode.METADATA_DIGEST_REQUIRED,
      message:
        "Settlement receipt metadata digest must be a 64-character hexadecimal SHA-256 string.",
      state: "invalid",
    };
  }
  if (options.metadata !== undefined) {
    const computed = computeMetadataDigest(options.metadata);
    if (digest.toLowerCase() !== computed.toLowerCase()) {
      return {
        ok: false,
        code: SettlementReceiptErrorCode.METADATA_DIGEST_MISMATCH,
        message: "Settlement receipt metadata digest does not match the supplied metadata payload.",
        state: "invalid",
      };
    }
  }

  return {
    ok: true,
    receiptId,
    displayReceiptId: redactReceiptId(receiptId),
    state: "validated",
  };
}

/**
 * Boolean predicate form of {@link validateSettlementReceipt}.
 *
 * @param receipt - Untrusted settlement receipt candidate.
 * @param options - Optional validation policy.
 * @returns True when the receipt passes all settlement checks.
 */
export function isSettlementReceiptValid(
  receipt: unknown,
  options: SettlementReceiptValidationOptions = {}
): boolean {
  return validateSettlementReceipt(receipt, options).ok;
}

/**
 * Extract the normalized transaction hash from a validated settlement receipt.
 * Convenience for downstream reconciliation pipelines that need the on-chain
 * reference without re-parsing the reference shape.
 *
 * @param receipt - Receipt whose transaction hash should be extracted.
 * @returns Trimmed transaction hash, or an empty string when absent.
 */
export function extractSettlementReceiptTxHash(receipt: PayrollReceipt): string {
  return extractReceiptTxHash(receipt);
}
