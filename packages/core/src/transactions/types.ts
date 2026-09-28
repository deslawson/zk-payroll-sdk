export type PayrollTransactionStatus =
  "pending" | "confirmed" | "failed" | "expired" | "unknown" | "retryable";

export interface NormalizedTransactionStatus {
  /** The normalized business status of the transaction */
  status: PayrollTransactionStatus;
  /** The original status returned by the RPC or Stellar SDK */
  rawStatus?: string;
  /** The hash of the transaction, if available */
  txHash?: string;
  /** The ledger in which the transaction was included, if confirmed */
  ledger?: number;
  /** The timestamp when the transaction was created, if available */
  createdAt?: number;
  /** Any preserved diagnostic or error metadata */
  errorDetails?: unknown;
}
