import {
  normalizeAmount,
  normalizeAssetId,
  normalizeEmployeeId,
  normalizePayrollPayload,
  normalizePeriod,
  normalizeWalletAddress,
} from "../src/normalization/normalizer";
import { RawPayrollEntry } from "../src/normalization/types";

describe("field normalizers", () => {
  describe("normalizeEmployeeId", () => {
    it("trims surrounding whitespace", () => {
      expect(normalizeEmployeeId("  E-100  ")).toBe("E-100");
    });

    it("coerces numbers to strings", () => {
      expect(normalizeEmployeeId(42)).toBe("42");
    });

    it("returns undefined for missing/empty values", () => {
      expect(normalizeEmployeeId(undefined)).toBeUndefined();
      expect(normalizeEmployeeId(null)).toBeUndefined();
      expect(normalizeEmployeeId("   ")).toBeUndefined();
      expect(normalizeEmployeeId("")).toBeUndefined();
    });
  });

  describe("normalizeWalletAddress", () => {
    it("trims whitespace and uppercases", () => {
      expect(normalizeWalletAddress("  gabc123def  ")).toBe("GABC123DEF");
    });

    it("leaves an already-uppercase address unchanged", () => {
      expect(normalizeWalletAddress("GABC123DEF")).toBe("GABC123DEF");
    });

    it("returns undefined for missing/empty values", () => {
      expect(normalizeWalletAddress(undefined)).toBeUndefined();
      expect(normalizeWalletAddress("   ")).toBeUndefined();
    });
  });

  describe("normalizeAssetId", () => {
    it("collapses common XLM aliases (any casing) to 'native'", () => {
      expect(normalizeAssetId("xlm")).toBe("native");
      expect(normalizeAssetId("XLM")).toBe("native");
      expect(normalizeAssetId("Lumens")).toBe("native");
      expect(normalizeAssetId("  native  ")).toBe("native");
    });

    it("trims but preserves case for contract-id-style assets", () => {
      expect(normalizeAssetId("  CABCDEF123  ")).toBe("CABCDEF123");
    });

    it("returns undefined for missing/empty values", () => {
      expect(normalizeAssetId(undefined)).toBeUndefined();
      expect(normalizeAssetId("")).toBeUndefined();
    });
  });

  describe("normalizePeriod", () => {
    it("trims whitespace", () => {
      expect(normalizePeriod("  2025-Q2-P1  ")).toBe("2025-Q2-P1");
    });

    it("returns undefined when absent", () => {
      expect(normalizePeriod(undefined)).toBeUndefined();
    });
  });

  describe("normalizeAmount", () => {
    it("stringifies bigint and number amounts", () => {
      expect(normalizeAmount(1000n)).toBe("1000");
      expect(normalizeAmount(1000.5)).toBe("1000.5");
    });

    it("strips thousands separators, currency symbols, and whitespace", () => {
      expect(normalizeAmount("1,000.50")).toBe("1000.50");
      expect(normalizeAmount("$1,000.50")).toBe("1000.50");
      expect(normalizeAmount(" 1 000.50 ")).toBe("1000.50");
      expect(normalizeAmount("€1,234")).toBe("1234");
    });

    it("drops a redundant leading plus sign", () => {
      expect(normalizeAmount("+500")).toBe("500");
    });

    it("returns undefined for non-finite numbers and missing values", () => {
      expect(normalizeAmount(NaN)).toBeUndefined();
      expect(normalizeAmount(Infinity)).toBeUndefined();
      expect(normalizeAmount(undefined)).toBeUndefined();
      expect(normalizeAmount("   ")).toBeUndefined();
    });

    it("leaves an already-clean amount string unchanged", () => {
      expect(normalizeAmount("1000.50")).toBe("1000.50");
    });
  });
});

describe("normalizePayrollPayload", () => {
  it("normalizes whitespace, casing, and amount formatting across every field", () => {
    const raw: RawPayrollEntry = {
      employeeId: "  E-42  ",
      recipient: "  gabc123def  ",
      asset: " xlm ",
      period: "  2025-Q2-P1  ",
      amount: " 1,000.50 ",
      department: "  Engineering  ",
    };

    const { entries, issues } = normalizePayrollPayload({ entries: [raw] });

    expect(issues).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      employeeId: "E-42",
      walletAddress: "GABC123DEF",
      asset: "native",
      period: "2025-Q2-P1",
      amount: "1000.50",
      department: "Engineering",
    });
  });

  it("accepts common key aliases for each field", () => {
    const raw: RawPayrollEntry = {
      employee_id: "E-1",
      wallet: "gdef456",
      assetId: "USDC",
      periodId: "2025-Q3-P1",
      salaryAmount: "2500",
    };

    const { entries, issues } = normalizePayrollPayload({ entries: [raw] });

    expect(issues).toEqual([]);
    expect(entries[0]).toMatchObject({
      employeeId: "E-1",
      walletAddress: "GDEF456",
      asset: "USDC",
      period: "2025-Q3-P1",
      amount: "2500",
    });
  });

  it("leaves an already-normalized payload unchanged", () => {
    const raw: RawPayrollEntry = {
      employeeId: "E-1",
      recipient: "GABC123DEF",
      asset: "native",
      period: "2025-Q2-P1",
      amount: "1000.5000000",
    };

    const { entries, issues } = normalizePayrollPayload({ entries: [raw] });

    expect(issues).toEqual([]);
    expect(entries[0]).toMatchObject({
      employeeId: "E-1",
      walletAddress: "GABC123DEF",
      asset: "native",
      period: "2025-Q2-P1",
      amount: "1000.5000000",
    });
  });

  it("normalizes bigint and number amounts already in canonical form", () => {
    const raw: RawPayrollEntry = {
      employeeId: "E-1",
      recipient: "GABC",
      asset: "native",
      amount: 1000n,
    };

    const { entries, issues } = normalizePayrollPayload({ entries: [raw] });

    expect(issues).toEqual([]);
    expect(entries[0].amount).toBe("1000");
  });

  it("omits optional fields (period, department) when absent, without an issue", () => {
    const raw: RawPayrollEntry = {
      employeeId: "E-1",
      recipient: "GABC",
      asset: "native",
      amount: "100",
    };

    const { entries, issues } = normalizePayrollPayload({ entries: [raw] });

    expect(issues).toEqual([]);
    expect(entries[0].period).toBeUndefined();
    expect(entries[0].department).toBeUndefined();
    expect("period" in entries[0]).toBe(false);
  });

  it("does not silently drop entries with missing required fields", () => {
    const raw: RawPayrollEntry = {
      period: "2025-Q2-P1",
    };

    const { entries, issues } = normalizePayrollPayload({ entries: [raw] });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      employeeId: "",
      walletAddress: "",
      asset: "",
      amount: "",
    });

    const fields = issues.map((i) => i.field).sort();
    expect(fields).toEqual(["amount", "asset", "employeeId", "walletAddress"]);
    expect(issues.every((i) => i.code === "MISSING")).toBe(true);
  });

  it("flags unparseable amounts while preserving the cleaned value for review", () => {
    const raw: RawPayrollEntry = {
      employeeId: "E-1",
      recipient: "GABC",
      asset: "native",
      amount: "not-a-number",
    };

    const { entries, issues } = normalizePayrollPayload({ entries: [raw] });

    expect(entries[0].amount).toBe("not-a-number");
    expect(issues).toEqual([
      {
        index: 0,
        field: "amount",
        code: "UNPARSEABLE_AMOUNT",
        message: 'Amount "not-a-number" could not be parsed as a numeric value.',
      },
    ]);
  });

  it("preserves the original input and index on each entry's source", () => {
    const rawA: RawPayrollEntry = {
      employeeId: "E-1",
      recipient: "GA",
      asset: "native",
      amount: "1",
    };
    const rawB: RawPayrollEntry = {
      employeeId: "  ",
      recipient: "GB",
      asset: "native",
      amount: "2",
    };

    const { entries, issues } = normalizePayrollPayload({ entries: [rawA, rawB] });

    expect(entries[0].source).toEqual({ index: 0, raw: rawA });
    expect(entries[1].source).toEqual({ index: 1, raw: rawB });

    // A validation error for the second entry can point straight back at the
    // original input via the recorded index and preserved raw object.
    expect(issues[0].index).toBe(1);
    expect(entries[issues[0].index].source.raw).toBe(rawB);
  });

  it("processes multiple entries independently, preserving order", () => {
    const entriesInput: RawPayrollEntry[] = [
      { employeeId: "E-1", recipient: "GA", asset: "native", amount: "100" },
      { employeeId: "E-2", recipient: "GB", asset: "native", amount: "abc" },
      { recipient: "GC", asset: "native", amount: "300" },
    ];

    const { entries, issues } = normalizePayrollPayload({ entries: entriesInput });

    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.employeeId)).toEqual(["E-1", "E-2", ""]);
    expect(issues).toEqual([
      {
        index: 1,
        field: "amount",
        code: "UNPARSEABLE_AMOUNT",
        message: 'Amount "abc" could not be parsed as a numeric value.',
      },
      {
        index: 2,
        field: "employeeId",
        code: "MISSING",
        message: "Employee id is required but was missing or empty.",
      },
    ]);
  });

  it("returns empty entries and issues for an empty payload", () => {
    const { entries, issues } = normalizePayrollPayload({ entries: [] });
    expect(entries).toEqual([]);
    expect(issues).toEqual([]);
  });
});
