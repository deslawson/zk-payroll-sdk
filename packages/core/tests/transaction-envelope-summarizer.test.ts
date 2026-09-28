import {
  summarizeTransactionEnvelope,
  formatWalletPrompt,
  TransactionEnvelopeInput,
} from "../src/transaction-envelope";

describe("Transaction Envelope Summarizer", () => {
  const BASE_ENVELOPE: TransactionEnvelopeInput = {
    sourceAccount: "GABC1234567890DEFABCDEF",
    networkPassphrase: "Test SDF Network ; September 2015",
    fee: 100,
    sequenceNumber: "12345",
  };

  describe("summarizeTransactionEnvelope", () => {
    it("returns a TransactionEnvelopeSummary with all required fields", () => {
      const result = summarizeTransactionEnvelope(BASE_ENVELOPE);

      expect(result).toHaveProperty("sourceAccount");
      expect(result).toHaveProperty("networkPassphrase");
      expect(result).toHaveProperty("fee");
      expect(result).toHaveProperty("sequenceNumber");
      expect(result).toHaveProperty("operations");
      expect(result).toHaveProperty("operationCount");
      expect(result).toHaveProperty("summaryText");
      expect(result).toHaveProperty("hasSensitiveOperations");
    });

    it("extracts source account correctly", () => {
      const result = summarizeTransactionEnvelope(BASE_ENVELOPE);
      expect(result.sourceAccount).toBe("GABC1234567890DEFABCDEF");
    });

    it("extracts fee correctly", () => {
      const result = summarizeTransactionEnvelope(BASE_ENVELOPE);
      expect(result.fee).toBe(100n);
    });

    it("extracts sequence number correctly", () => {
      const result = summarizeTransactionEnvelope(BASE_ENVELOPE);
      expect(result.sequenceNumber).toBe("12345");
    });

    it("handles empty operations", () => {
      const result = summarizeTransactionEnvelope(BASE_ENVELOPE);
      expect(result.operations).toHaveLength(0);
      expect(result.operationCount).toBe(0);
      expect(result.summaryText).toContain("Empty transaction");
    });

    it("summarizes private_pay operations as sensitive", () => {
      const envelope: TransactionEnvelopeInput = {
        ...BASE_ENVELOPE,
        operations: [{ type: "invoke_contract", functionName: "private_pay" }],
      };

      const result = summarizeTransactionEnvelope(envelope);
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0].type).toBe("private_pay");
      expect(result.operations[0].sensitive).toBe(true);
      expect(result.hasSensitiveOperations).toBe(true);
    });

    it("summarizes grant_view_key operations", () => {
      const envelope: TransactionEnvelopeInput = {
        ...BASE_ENVELOPE,
        operations: [{ type: "invoke_contract", functionName: "grant_view_key" }],
      };

      const result = summarizeTransactionEnvelope(envelope);
      expect(result.operations[0].type).toBe("grant_view_key");
      expect(result.operations[0].sensitive).toBe(false);
    });

    it("summarizes revoke_view_key operations", () => {
      const envelope: TransactionEnvelopeInput = {
        ...BASE_ENVELOPE,
        operations: [{ type: "invoke_contract", functionName: "revoke_view_key" }],
      };

      const result = summarizeTransactionEnvelope(envelope);
      expect(result.operations[0].type).toBe("revoke_view_key");
    });

    it("summarizes update_treasury operations as sensitive", () => {
      const envelope: TransactionEnvelopeInput = {
        ...BASE_ENVELOPE,
        operations: [{ type: "invoke_contract", functionName: "update_treasury" }],
      };

      const result = summarizeTransactionEnvelope(envelope);
      expect(result.operations[0].type).toBe("update_treasury");
      expect(result.operations[0].sensitive).toBe(true);
    });

    it("classifies unknown operations", () => {
      const envelope: TransactionEnvelopeInput = {
        ...BASE_ENVELOPE,
        operations: [{ type: "invoke_contract", functionName: "something_else" }],
      };

      const result = summarizeTransactionEnvelope(envelope);
      expect(result.operations[0].type).toBe("unknown");
      expect(result.operations[0].sensitive).toBe(false);
    });

    it("counts multiple operations", () => {
      const envelope: TransactionEnvelopeInput = {
        ...BASE_ENVELOPE,
        operations: [
          { type: "invoke_contract", functionName: "private_pay" },
          { type: "invoke_contract", functionName: "private_pay" },
          { type: "invoke_contract", functionName: "grant_view_key" },
        ],
      };

      const result = summarizeTransactionEnvelope(envelope);
      expect(result.operationCount).toBe(3);
    });

    it("builds summary text with operation description and fee", () => {
      const envelope: TransactionEnvelopeInput = {
        ...BASE_ENVELOPE,
        fee: 300,
        operations: [{ type: "invoke_contract", functionName: "private_pay" }],
      };

      const result = summarizeTransactionEnvelope(envelope);
      expect(result.summaryText).toContain("payroll");
      expect(result.summaryText).toContain("300");
      expect(result.summaryText).toContain("stroops");
    });

    it("includes time bounds when present", () => {
      const timeBounds = { minTime: "1000", maxTime: "2000" };
      const envelope: TransactionEnvelopeInput = {
        ...BASE_ENVELOPE,
        timeBounds,
      };

      const result = summarizeTransactionEnvelope(envelope);
      expect(result.timeBounds).toEqual(timeBounds);
    });

    it("defaults missing fields gracefully", () => {
      const result = summarizeTransactionEnvelope({});
      expect(result.sourceAccount).toBe("Unknown");
      expect(result.fee).toBe(0n);
      expect(result.sequenceNumber).toBe("0");
    });
  });

  describe("formatWalletPrompt", () => {
    it("formats a readable wallet prompt", () => {
      const envelope: TransactionEnvelopeInput = {
        ...BASE_ENVELOPE,
        fee: 500,
        operations: [
          { type: "invoke_contract", functionName: "private_pay" },
          { type: "invoke_contract", functionName: "private_pay" },
        ],
      };

      const summary = summarizeTransactionEnvelope(envelope);
      const prompt = formatWalletPrompt(summary);

      expect(prompt).toContain("Source:");
      expect(prompt).toContain("Fee: 500 stroops");
      expect(prompt).toContain("Operations: 2");
      expect(prompt).toContain("sensitive");
    });

    it("truncates long source addresses", () => {
      const summary = summarizeTransactionEnvelope({
        sourceAccount: "GABCDEF1234567890GHIJKL",
        fee: 100,
        operations: [],
      });

      const prompt = formatWalletPrompt(summary);
      expect(prompt).toContain("...");
    });
  });
});
