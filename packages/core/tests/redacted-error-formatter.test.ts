import {
  ZkPayrollError,
  ContractExecutionError,
  ContractErrorCode,
  WalletError,
  WalletErrorCode,
  formatRedactedError,
} from "../src/errors";

describe("formatRedactedError", () => {
  it("returns a FormattedError with all required fields", () => {
    const err = new Error("test error");
    const result = formatRedactedError(err);

    expect(result).toHaveProperty("message");
    expect(result).toHaveProperty("code");
    expect(result).toHaveProperty("context");
    expect(result).toHaveProperty("category");
    expect(result).toHaveProperty("retryable");
  });

  it("redacts recipient value from error message", () => {
    const err = new Error("Payment failed: recipient=GABC1234567890ADDRESS is invalid");
    const result = formatRedactedError(err);

    expect(result.message).not.toContain("GABC1234567890ADDRESS");
    expect(result.message).toContain("[redacted]");
  });

  it("redacts amount value from error message", () => {
    const err = new Error("Overflow: amount=9500000 exceeds max");
    const result = formatRedactedError(err);

    expect(result.message).not.toContain("9500000");
    expect(result.message).toContain("[redacted]");
  });

  it("redacts privateKey value from error message", () => {
    const err = new Error("Auth failed: privateKey=S_SECRET_VALUE rejected");
    const result = formatRedactedError(err);

    expect(result.message).not.toContain("S_SECRET_VALUE");
    expect(result.message).toContain("[redacted]");
  });

  it("uses custom placeholder", () => {
    const err = new Error("recipient=GABC123 secret=MY_SECRET");
    const result = formatRedactedError(err, "***");

    expect(result.message).not.toContain("GABC123");
    expect(result.message).not.toContain("MY_SECRET");
    expect(result.message).toContain("***");
  });

  it("preserves non-sensitive parts of the message", () => {
    const err = new Error("Contract revert: recipient=GABC123 — code 403");
    const result = formatRedactedError(err);

    expect(result.message).toContain("Contract revert");
    expect(result.message).toContain("code 403");
  });

  it("extracts code from ZkPayrollError", () => {
    const err = new ContractExecutionError("sim failed", ContractErrorCode.SIMULATION_FAILED, {
      transactionId: "tx_123",
    });
    const result = formatRedactedError(err);

    expect(result.code).toBe("SIMULATION_FAILED");
  });

  it("sets category based on error code", () => {
    const err = new ContractExecutionError("sim failed", ContractErrorCode.SIMULATION_FAILED);
    const result = formatRedactedError(err);
    expect(result.category).toBe("Simulation");
  });

  it("marks retryable errors correctly", () => {
    const timeoutErr = new ContractExecutionError("timeout", ContractErrorCode.TRANSACTION_TIMEOUT);
    expect(formatRedactedError(timeoutErr).retryable).toBe(true);

    const revertErr = new ContractExecutionError("revert", ContractErrorCode.CONTRACT_REVERT);
    expect(formatRedactedError(revertErr).retryable).toBe(false);
  });

  it("redacts sensitive fields from context", () => {
    const err = new ZkPayrollError("test", "TEST", {
      recipient: "GABC123",
      amount: 5000n,
      transactionId: "tx_safe",
    });
    const result = formatRedactedError(err);

    expect(result.context.recipient).toBe("[redacted]");
    expect(result.context.amount).toBe("[redacted]");
    expect(result.context.transactionId).toBe("tx_safe");
  });

  it("handles WalletError with wallet-specific code", () => {
    const err = new WalletError("signing rejected", WalletErrorCode.SIGNING_REJECTED, "freighter");
    const result = formatRedactedError(err);

    expect(result.code).toBe("WALLET_SIGNING_REJECTED");
    expect(result.category).toBe("Wallet");
  });

  it("handles plain string errors", () => {
    const result = formatRedactedError("something went wrong");
    expect(result.message).toBe("something went wrong");
    expect(result.code).toBe("UNKNOWN_RPC_ERROR");
  });

  it("handles non-Error values gracefully", () => {
    const result = formatRedactedError(42);
    expect(result.message).toBeTruthy();
    expect(result.code).toBeTruthy();
  });

  it("handles null/undefined input", () => {
    const result = formatRedactedError(null);
    expect(result.message).toBeTruthy();

    const result2 = formatRedactedError(undefined);
    expect(result2.message).toBeTruthy();
  });
});
