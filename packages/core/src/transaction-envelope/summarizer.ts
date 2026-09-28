import {
  EnvelopeOperationSummary,
  EnvelopeOperationType,
  TransactionEnvelopeSummary,
  RawOperation,
  TransactionEnvelopeInput,
} from "./types";

/**
 * Summarizes a raw Soroban transaction envelope XDR into readable metadata
 * suitable for display in a wallet signing prompt.
 *
 * This helps users understand what they are authorizing before signing
 * a payroll transaction.
 *
 * @param envelope - The transaction envelope object (XDR-decoded)
 * @returns A structured summary of the transaction
 *
 * @example
 * ```typescript
 * const summary = summarizeTransactionEnvelope(envelope);
 * console.log(summary.summaryText);
 * // "Payroll submission: 3 payments, Total fee: 1500 stroops"
 * ```
 */
export function summarizeTransactionEnvelope(
  envelope: TransactionEnvelopeInput
): TransactionEnvelopeSummary {
  const sourceAccount = envelope.sourceAccount ?? "Unknown";
  const networkPassphrase = envelope.networkPassphrase ?? "Unknown";
  const fee = BigInt(envelope.fee ?? 0);
  const sequenceNumber = String(envelope.sequenceNumber ?? "0");

  const operations = (envelope.operations ?? []).map((op) => summarizeOperation(op));

  const hasSensitiveOperations = operations.some((op) => op.sensitive);
  const operationCount = operations.length;

  const summaryText = buildSummaryText(operations, fee, operationCount);

  return {
    sourceAccount,
    networkPassphrase,
    fee,
    sequenceNumber,
    timeBounds: envelope.timeBounds,
    operations,
    operationCount,
    summaryText,
    hasSensitiveOperations,
  };
}

/**
 * Creates a wallet-friendly prompt string from a transaction summary.
 *
 * @param summary - Output from summarizeTransactionEnvelope
 * @returns A concise prompt for the wallet signing dialog
 */
export function formatWalletPrompt(summary: TransactionEnvelopeSummary): string {
  const lines: string[] = [];

  lines.push(`Source: ${truncateAddress(summary.sourceAccount)}`);
  lines.push(`Fee: ${summary.fee} stroops`);
  lines.push(`Operations: ${summary.operationCount}`);

  for (const op of summary.operations) {
    const prefix = op.sensitive ? "!" : "*";
    lines.push(`  ${prefix} ${op.description}`);
  }

  if (summary.hasSensitiveOperations) {
    lines.push("");
    lines.push("This transaction contains sensitive operations.");
  }

  return lines.join("\n");
}

// ── Internal helpers ────────────────────────────────────────────────────────

function summarizeOperation(op: RawOperation): EnvelopeOperationSummary {
  const opType = classifyOperation(op);

  switch (opType) {
    case "private_pay":
      return {
        type: "private_pay",
        description: "Private payroll payment (ZK-encrypted)",
        sensitive: true,
      };
    case "grant_view_key":
      return {
        type: "grant_view_key",
        description: "Grant audit view key access",
        sensitive: false,
      };
    case "revoke_view_key":
      return {
        type: "revoke_view_key",
        description: "Revoke audit view key access",
        sensitive: false,
      };
    case "update_treasury":
      return {
        type: "update_treasury",
        description: "Update treasury contract state",
        sensitive: true,
      };
    default:
      return {
        type: "unknown",
        description: `Unknown operation (${op.type ?? "unrecognized"})`,
        sensitive: false,
      };
  }
}

function classifyOperation(op: RawOperation): EnvelopeOperationType {
  const type = (op.type ?? "").toLowerCase();
  const func = (op.functionName ?? "").toLowerCase();

  if (func === "private_pay" || (type === "invoke_contract" && func.includes("pay"))) {
    return "private_pay";
  }
  if (func === "grant_view_key" || func.includes("grant")) {
    return "grant_view_key";
  }
  if (func === "revoke_view_key" || func.includes("revoke")) {
    return "revoke_view_key";
  }
  if (func === "update_treasury" || func.includes("treasury")) {
    return "update_treasury";
  }

  return "unknown";
}

function buildSummaryText(
  operations: EnvelopeOperationSummary[],
  fee: bigint,
  operationCount: number
): string {
  if (operationCount === 0) {
    return `Empty transaction — Fee: ${fee} stroops`;
  }

  const descriptions = operations.map((op) => op.description);
  const uniqueDescriptions = [...new Set(descriptions)];

  if (uniqueDescriptions.length === 1) {
    return `${uniqueDescriptions[0]} (${operationCount} op${operationCount > 1 ? "s" : ""}) — Fee: ${fee} stroops`;
  }

  return `Transaction with ${operationCount} operations (${uniqueDescriptions.join(", ")}) — Fee: ${fee} stroops`;
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
