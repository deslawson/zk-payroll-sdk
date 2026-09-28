import {
  DEFAULT_SETTLED_STATUSES,
  SettlementReceiptErrorCode,
  extractSettlementReceiptTxHash,
  isSettlementReceiptValid,
  validateSettlementReceipt,
} from "../src/settlement";
import { PayrollService } from "../src";
import { computeMetadataDigest } from "../src/receipts/digest";
import type { PayrollReceipt } from "../src/receipts/types";

/** Builds a structurally valid, settled receipt with no sensitive values. */
function buildReceipt(overrides: Partial<PayrollReceipt> = {}): PayrollReceipt {
  const metadata = {
    period: "2026-09",
    department: "engineering",
    runSequence: 12,
  };

  return {
    receiptId: "rcpt_9876543210abcdef",
    payrollId: "pr_run_2026_09",
    settlementStatus: "settled",
    transactionReference: {
      txHash: "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
      ledger: 987654,
      network: "testnet",
    },
    metadataDigest: computeMetadataDigest(metadata),
    metadata,
    issuedAt: Date.now() - 60_000,
    ...overrides,
  };
}

describe("Settlement Receipt Validation Helper (#532)", () => {
  describe("success paths", () => {
    it("validates a well-formed settled receipt and redacts the display ID", () => {
      const result = validateSettlementReceipt(buildReceipt());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.state).toBe("validated");
        expect(result.receiptId).toBe("rcpt_9876543210abcdef");
        expect(result.displayReceiptId).toBe("rcp***def");
      }
    });

    it("accepts the confirmed status alongside settled", () => {
      const result = validateSettlementReceipt(buildReceipt(), {
        settlementStatus: "confirmed",
      } as Partial<PayrollReceipt>);

      expect(result.ok).toBe(true);
    });

    it("exposes the default settled statuses", () => {
      expect(DEFAULT_SETTLED_STATUSES).toContain("settled");
      expect(DEFAULT_SETTLED_STATUSES).toContain("confirmed");
    });

    it("extracts the normalized transaction hash for reconciliation", () => {
      const receipt = buildReceipt();
      expect(extractSettlementReceiptTxHash(receipt)).toBe(
        "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0"
      );
    });

    it("verifies metadata content against the recorded digest", () => {
      const metadata = { batch: "september-cycle" };
      const result = validateSettlementReceipt(
        buildReceipt({ metadata, metadataDigest: computeMetadataDigest(metadata) }),
        { metadata }
      );

      expect(result.ok).toBe(true);
    });

    it("isSettlementReceiptValid mirrors the ok flag", () => {
      expect(isSettlementReceiptValid(buildReceipt())).toBe(true);
      expect(isSettlementReceiptValid(null)).toBe(false);
    });
  });

  describe("failure paths", () => {
    it("rejects non-object receipts as malformed", () => {
      for (const bad of [null, undefined, "receipt", 42, []]) {
        const result = validateSettlementReceipt(bad);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe(SettlementReceiptErrorCode.RECEIPT_REQUIRED);
          expect(result.state).toBe("malformed");
        }
      }
    });

    it("rejects invalid receipt IDs with a sanitized message", () => {
      const result = validateSettlementReceipt(buildReceipt({ receiptId: "short" }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SettlementReceiptErrorCode.RECEIPT_ID_INVALID);
        expect(result.state).toBe("invalid");
        expect(result.message).not.toContain("short");
      }
    });

    it("rejects missing payroll IDs", () => {
      const result = validateSettlementReceipt(buildReceipt({ payrollId: "" }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SettlementReceiptErrorCode.PAYROLL_ID_REQUIRED);
      }
    });

    it("rejects payroll ID mismatches without echoing either value", () => {
      const result = validateSettlementReceipt(buildReceipt(), {
        expectedPayrollId: "pr_other_run",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SettlementReceiptErrorCode.PAYROLL_ID_REQUIRED);
        expect(result.message).not.toContain("pr_run_2026_09");
        expect(result.message).not.toContain("pr_other_run");
      }
    });

    it("rejects missing or unrecognized settlement statuses", () => {
      const missing = validateSettlementReceipt(
        buildReceipt({ settlementStatus: "" as PayrollReceipt["settlementStatus"] })
      );
      expect(missing.ok).toBe(false);
      if (!missing.ok) {
        expect(missing.code).toBe(SettlementReceiptErrorCode.SETTLEMENT_STATUS_REQUIRED);
      }

      const failed = validateSettlementReceipt(buildReceipt({ settlementStatus: "failed" }));
      expect(failed.ok).toBe(false);
      if (!failed.ok) {
        expect(failed.code).toBe(SettlementReceiptErrorCode.SETTLEMENT_STATUS_NOT_SETTLED);
      }
    });

    it("rejects receipts without a usable transaction reference", () => {
      const withoutRef = validateSettlementReceipt(buildReceipt({ transactionReference: "" }));
      expect(withoutRef.ok).toBe(false);
      if (!withoutRef.ok) {
        expect(withoutRef.code).toBe(SettlementReceiptErrorCode.TRANSACTION_REFERENCE_REQUIRED);
      }

      const emptyObjectRef = validateSettlementReceipt(
        buildReceipt({ transactionReference: {} as PayrollReceipt["transactionReference"] })
      );
      expect(emptyObjectRef.ok).toBe(false);
      if (!emptyObjectRef.ok) {
        expect(emptyObjectRef.code).toBe(SettlementReceiptErrorCode.TRANSACTION_REFERENCE_REQUIRED);
      }
    });

    it("rejects missing or malformed metadata digests", () => {
      const missing = validateSettlementReceipt(buildReceipt({ metadataDigest: "" }));
      expect(missing.ok).toBe(false);
      if (!missing.ok) {
        expect(missing.code).toBe(SettlementReceiptErrorCode.METADATA_DIGEST_REQUIRED);
      }

      const malformed = validateSettlementReceipt(buildReceipt({ metadataDigest: "not-a-digest" }));
      expect(malformed.ok).toBe(false);
      if (!malformed.ok) {
        expect(malformed.code).toBe(SettlementReceiptErrorCode.METADATA_DIGEST_REQUIRED);
      }
    });

    it("rejects metadata payloads that do not match the recorded digest", () => {
      const metadata = { batch: "september-cycle" };
      const result = validateSettlementReceipt(
        buildReceipt({ metadata, metadataDigest: computeMetadataDigest(metadata) }),
        { metadata: { batch: "tampered-cycle" } }
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(SettlementReceiptErrorCode.METADATA_DIGEST_MISMATCH);
      }
    });

    it("accepts pending only when explicitly allowed by policy", () => {
      const allowed = validateSettlementReceipt(buildReceipt({ settlementStatus: "pending" }), {
        allowedStatuses: ["pending", "settled", "confirmed"],
      });
      expect(allowed.ok).toBe(true);

      const rejected = validateSettlementReceipt(buildReceipt({ settlementStatus: "pending" }));
      expect(rejected.ok).toBe(false);
    });
  });

  describe("privacy guarantees", () => {
    it("never echoes rejected receipt IDs, hashes, or metadata into messages", () => {
      const secretHash = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
      const result = validateSettlementReceipt(
        buildReceipt({
          receiptId: "x".repeat(64),
          transactionReference: { txHash: secretHash },
        }),
        { metadata: { salary: "990000" } }
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).not.toContain("x".repeat(10));
        expect(result.message).not.toContain(secretHash);
        expect(result.message).not.toContain("990000");
        expect(result.message).not.toContain("salary");
      }
    });
  });

  describe("PayrollService integration", () => {
    it("exposes instance and static settlement validation helpers", () => {
      const service = new PayrollService(
        {} as never,
        {} as never,
        { sign: jest.fn(), getPublicKey: () => "G..." } as never,
        "testnet"
      );

      const valid = buildReceipt();
      const instanceResult = service.validateSettlementReceipt(valid);
      expect(instanceResult.ok).toBe(true);

      const staticResult = PayrollService.validateSettlementReceipt(valid);
      expect(staticResult.ok).toBe(true);

      const invalid = PayrollService.validateSettlementReceipt(null);
      expect(invalid.ok).toBe(false);
    });
  });
});
