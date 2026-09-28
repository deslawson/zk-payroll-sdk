import { PayrollValidation } from "../src/core/validation";
import { ValidationError } from "../src/core/errors";
import { PaymentParams } from "../src/types";

describe("PayrollValidation", () => {
  const validParams: PaymentParams = {
    recipient: "GBXYZ...",
    amount: 10000000n,
    asset: "native",
  };

  it("should validate correct parameters", () => {
    const result = PayrollValidation.validatePaymentParams(validParams);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);

    expect(() => PayrollValidation.assertValidPaymentParams(validParams)).not.toThrow();
  });

  it("should detect missing recipient", () => {
    const params = { ...validParams, recipient: "" };
    const result = PayrollValidation.validatePaymentParams(params);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ field: "recipient" }));

    expect(() => PayrollValidation.assertValidPaymentParams(params)).toThrow(ValidationError);
  });

  it("should detect invalid amount", () => {
    const params = { ...validParams, amount: 0n };
    const result = PayrollValidation.validatePaymentParams(params);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ field: "amount" }));
  });

  it("should detect missing asset", () => {
    const params = { ...validParams, asset: "  " };
    const result = PayrollValidation.validatePaymentParams(params);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ field: "asset" }));
  });

  describe("batch validation", () => {
    it("should validate a valid batch payload", () => {
      const entries = [
        { recipient: "GA1", amount: 100n, asset: "native" },
        { recipient: "GB2", amount: 200n, asset: "native" },
      ];
      const errors = PayrollValidation.validateBatchPayload(entries);
      expect(errors).toHaveLength(0);

      const built = PayrollValidation.assertValidBatchPayload(entries);
      expect(built.entries).toHaveLength(2);
      expect(built.totalAmount).toBe(300n);
    });

    it("should reject invalid batch payload with structured errors", () => {
      const entries = [
        { recipient: "GA1", amount: 100n, asset: "native" },
        { recipient: "GA1", amount: 0n, asset: "" },
      ];
      const errors = PayrollValidation.validateBatchPayload(entries);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.code === "DUPLICATE_RECIPIENT")).toBe(true);
      expect(errors.some((e) => e.code === "INVALID_AMOUNT")).toBe(true);
      expect(errors.some((e) => e.code === "MISSING_ASSET")).toBe(true);

      expect(() => PayrollValidation.assertValidBatchPayload(entries)).toThrow();
    });
  });
});
