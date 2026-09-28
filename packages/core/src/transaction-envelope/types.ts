/**
 * Transaction envelope summarizer types.
 *
 * Summarizes a payroll transaction envelope into readable metadata
 * before wallet signing so users know what they are authorizing.
 */

export type EnvelopeOperationType =
  "private_pay" | "grant_view_key" | "revoke_view_key" | "update_treasury" | "unknown";

export interface EnvelopeOperationSummary {
  /** Detected operation type. */
  type: EnvelopeOperationType;
  /** Human-readable description of the operation. */
  description: string;
  /** Whether this operation involves sensitive data. */
  sensitive: boolean;
}

export interface TransactionEnvelopeSummary {
  /** Source account of the transaction. */
  sourceAccount: string;
  /** Network passphrase. */
  networkPassphrase: string;
  /** Base fee in stroops. */
  fee: bigint;
  /** Sequence number of the source account. */
  sequenceNumber: string;
  /** Time bounds for the transaction. */
  timeBounds?: { minTime: string; maxTime: string };
  /** Summarized operations in the envelope. */
  operations: EnvelopeOperationSummary[];
  /** Total number of operations. */
  operationCount: number;
  /** Human-readable summary suitable for wallet signing prompt. */
  summaryText: string;
  /** Whether any operation in the envelope is sensitive. */
  hasSensitiveOperations: boolean;
}

export interface RawOperation {
  type?: string;
  functionName?: string;
  contractId?: string;
  args?: Record<string, unknown>;
}

export interface TransactionEnvelopeInput {
  sourceAccount?: string;
  networkPassphrase?: string;
  fee?: number | bigint | string;
  sequenceNumber?: number | bigint | string;
  timeBounds?: { minTime: string; maxTime: string };
  operations?: RawOperation[];
}
