import {
  canonicalizeIntent,
  computeIntentChecksum,
  computeIntentChecksumAsync,
  verifyIntentChecksum,
} from "../src/inspector/intentChecksum";
import type { TransactionSummary } from "../src/inspector/types";

describe("intentChecksum (Issue #228)", () => {
  const mockIntent: TransactionSummary = {
    source: "GSOURCE1234567890",
    fee: "100",
    network: "Testnet Passphrase",
    sequence: "12345",
    hash: "abcdef123456",
    signatureCount: 1,
    signerHints: ["hint1"],
    hasSorobanAuth: false,
    operations: [
      {
        type: "payment",
        description: "Payment operation",
      },
    ],
  };

  it("canonicalizes intent objects deterministically regardless of key insertion order", () => {
    const objA = { b: 2, a: 1, amount: 1000n };
    const objB = { a: 1, amount: 1000n, b: 2 };

    expect(canonicalizeIntent(objA)).toBe(canonicalizeIntent(objB));
  });

  it("computes synchronous checksum and verifies matching intent", () => {
    const checksum = computeIntentChecksum(mockIntent);
    expect(typeof checksum).toBe("string");
    expect(checksum.length).toBeGreaterThan(0);

    expect(verifyIntentChecksum(mockIntent, checksum)).toBe(true);
  });

  it("detects modification or tampering of intent fields", () => {
    const checksum = computeIntentChecksum(mockIntent);

    const tamperedIntent: TransactionSummary = {
      ...mockIntent,
      fee: "200", // Modified fee
    };

    expect(verifyIntentChecksum(tamperedIntent, checksum)).toBe(false);
  });

  it("computes async SHA-256 checksum", async () => {
    const checksumAsync = await computeIntentChecksumAsync(mockIntent);
    expect(typeof checksumAsync).toBe("string");
    expect(checksumAsync).toHaveLength(64);
  });
});
