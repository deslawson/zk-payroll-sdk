import { estimateFee, estimateBatchFees, totalBatchFee } from "../src/fee-estimation";

describe("Fee Estimation Helper", () => {
  describe("estimateFee", () => {
    it("estimates payroll_submission for a single payment", () => {
      const result = estimateFee("payroll_submission");

      expect(result.operation).toBe("payroll_submission");
      expect(result.totalFee).toBeGreaterThan(0n);
      expect(result.operationCount).toBe(2);
      expect(result.exact).toBe(true);
      expect(typeof result.breakdown).toBe("string");
    });

    it("estimates payroll_submission for a batch of payments", () => {
      const result = estimateFee("payroll_submission", { batchSize: 5 });

      expect(result.operationCount).toBe(10);
      expect(result.totalFee).toBeGreaterThan(0n);
    });

    it("estimates audit_grant for a single grant", () => {
      const result = estimateFee("audit_grant");

      expect(result.operation).toBe("audit_grant");
      expect(result.totalFee).toBeGreaterThan(0n);
      expect(result.operationCount).toBe(1);
    });

    it("estimates audit_grant for multiple grants", () => {
      const result = estimateFee("audit_grant", { grantCount: 3 });

      expect(result.operationCount).toBe(3);
      expect(result.totalFee).toBeGreaterThan(0n);
    });

    it("estimates treasury_update for a single update", () => {
      const result = estimateFee("treasury_update");

      expect(result.operation).toBe("treasury_update");
      expect(result.totalFee).toBeGreaterThan(0n);
      expect(result.operationCount).toBe(2);
    });

    it("respects baseFeeOverride", () => {
      const customBase = 200n;
      const result = estimateFee("payroll_submission", {
        batchSize: 1,
        baseFeeOverride: customBase,
      });

      expect(result.baseFee).toBe(customBase * 2n);
    });

    it("includes breakdown string", () => {
      const result = estimateFee("payroll_submission", { batchSize: 2 });

      expect(result.breakdown).toContain("Base:");
      expect(result.breakdown).toContain("Computational:");
      expect(result.breakdown).toContain("Total:");
      expect(result.breakdown).toContain("stroops");
    });
  });

  describe("estimateBatchFees", () => {
    it("returns an estimate for each operation", () => {
      const results = estimateBatchFees(["payroll_submission", "audit_grant", "treasury_update"]);

      expect(results).toHaveLength(3);
      expect(results[0].operation).toBe("payroll_submission");
      expect(results[1].operation).toBe("audit_grant");
      expect(results[2].operation).toBe("treasury_update");
    });

    it("passes options through to each estimate", () => {
      const results = estimateBatchFees(["payroll_submission", "treasury_update"], {
        batchSize: 3,
      });

      expect(results[0].operationCount).toBe(6); // 2 ops * 3 batch
    });
  });

  describe("totalBatchFee", () => {
    it("sums fees across multiple estimates", () => {
      const estimates = estimateBatchFees(["payroll_submission", "audit_grant", "treasury_update"]);

      const total = totalBatchFee(estimates);

      expect(total).toBe(estimates[0].totalFee + estimates[1].totalFee + estimates[2].totalFee);
    });

    it("returns 0n for empty array", () => {
      expect(totalBatchFee([])).toBe(0n);
    });
  });
});
