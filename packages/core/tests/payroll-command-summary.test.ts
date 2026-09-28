import {
  summarizePayrollCommand,
  formatPayrollCommandPrompt,
} from "../src/summary/PayrollCommandSummary";

describe("summarizePayrollCommand (Issue #227)", () => {
  const ALICE = "GALICE1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123456";
  const BOB = "GBOB1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ123456";

  it("summarizes a single payment accurately", () => {
    const summary = summarizePayrollCommand({
      recipient: ALICE,
      amount: 1000n,
      asset: "native",
      sourceAccount: "GSOURCE123456",
      network: "Testnet",
      memo: "July Salary",
    });

    expect(summary.commandType).toBe("Single Private Payment");
    expect(summary.totalAmount).toBe(1000n);
    expect(summary.recipientCount).toBe(1);
    expect(summary.recipients).toEqual([ALICE]);
    expect(summary.isSensitive).toBe(true);
    expect(summary.warnings).toHaveLength(0);
    expect(summary.summaryText).toContain("Single Private Payment");
    expect(summary.summaryText).toContain("1000");
  });

  it("summarizes a batch payroll command accurately", () => {
    const batch = [
      { recipient: ALICE, amount: 5000n, asset: "native" },
      { recipient: BOB, amount: 3000n, asset: "native" },
    ];

    const summary = summarizePayrollCommand(batch);

    expect(summary.commandType).toBe("Batch Payroll Payment");
    expect(summary.totalAmount).toBe(8000n);
    expect(summary.recipientCount).toBe(2);
    expect(summary.recipients).toEqual([ALICE, BOB]);
    expect(summary.warnings).toHaveLength(0);
  });

  it("detects missing recipients or zero amounts and emits warnings", () => {
    const summary = summarizePayrollCommand({
      recipient: "",
      amount: 0n,
    });

    expect(summary.warnings.length).toBeGreaterThan(0);
    expect(summary.warnings[0]).toContain("missing a recipient");
  });

  it("formats plain language prompt text", () => {
    const summary = summarizePayrollCommand({
      recipient: ALICE,
      amount: 1500n,
      asset: "USDC",
      memo: "Monthly Bonus",
    });

    const promptText = formatPayrollCommandPrompt(summary);
    expect(promptText).toContain("=== Single Private Payment Summary ===");
    expect(promptText).toContain("Monthly Bonus");
  });
});
