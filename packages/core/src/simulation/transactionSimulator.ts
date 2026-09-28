import { createHash } from "crypto";
import type {
  TransactionSimulationConfig,
  SimulatedPaymentOutcome,
  SimulatedPaymentStatus,
  SimulationEmployeeRecord,
} from "./types";

/**
 * A simulated transaction that was "submitted" to the mock network.
 */
export interface SimulatedTransaction {
  /** Pseudo-transaction hash */
  txHash: string;
  /** Employee ID this transaction pays */
  employeeId: string;
  /** Stellar address of the recipient */
  address: string;
  /** Asset identifier */
  asset: string;
  /** Current simulated status */
  status: SimulatedPaymentStatus;
  /** Error message if failed */
  error?: string;
  /** Recovery hint for dashboard/CLI consumers */
  recoveryHint?: string;
  /** Timestamp when the transaction was "submitted" */
  submittedAt: number;
}

/**
 * Builds a simulated transaction for an employee payment.
 *
 * Does not produce a real XDR transaction — instead generates a deterministic
 * pseudo-hash and metadata that mirrors what a real submission would return.
 */
export function buildSimulatedTransaction(
  employee: SimulationEmployeeRecord,
  commitmentHash: string,
  _config?: TransactionSimulationConfig
): SimulatedTransaction {
  const payload = [
    "zkpayroll-tx-v1",
    employee.id,
    employee.address,
    employee.salaryAmount.toString(),
    employee.asset,
    commitmentHash,
    Date.now().toString(),
  ].join("|");

  const txHash = `sim_tx:${createHash("sha256").update(payload).digest("hex").slice(0, 32)}`;

  return {
    txHash,
    employeeId: employee.id,
    address: employee.address,
    asset: employee.asset,
    status: "submitted",
    submittedAt: Date.now(),
  };
}

/**
 * Simulates the confirmation polling phase for a transaction.
 *
 * Returns the terminal status based on the configuration — either
 * confirmed, timed out, or failed.
 */
export async function simulatePolling(
  tx: SimulatedTransaction,
  config?: TransactionSimulationConfig
): Promise<SimulatedPaymentOutcome> {
  const start = Date.now();

  if (config?.simulatedLatencyMs) {
    await sleep(config.simulatedLatencyMs);
  }

  if (config?.shouldTimeout) {
    return {
      employeeId: tx.employeeId,
      address: tx.address,
      asset: tx.asset,
      status: "failed",
      txHash: tx.txHash,
      error: "Transaction timed out during confirmation polling",
      recoveryHint:
        "The transaction may still be processing on-chain. Check the transaction status manually before retrying. Do not resubmit without confirming the original transaction's fate.",
      durationMs: Date.now() - start,
    };
  }

  if (config?.shouldFail) {
    return {
      employeeId: tx.employeeId,
      address: tx.address,
      asset: tx.asset,
      status: "failed",
      txHash: tx.txHash,
      error: config.failureMessage ?? "Transaction submission failed",
      recoveryHint:
        "The transaction was rejected by the network. Verify that the contract has sufficient allowance and the proof is valid before retrying.",
      durationMs: Date.now() - start,
    };
  }

  return {
    employeeId: tx.employeeId,
    address: tx.address,
    asset: tx.asset,
    status: "confirmed",
    txHash: tx.txHash,
    durationMs: Date.now() - start,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
