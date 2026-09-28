/**
 * Tests for filterArchivedRecords (Task 2.2)
 * Requirements: 1.3, 1.4, 1.5
 */
import { filterArchivedRecords } from "../src/archived/filters";
import type { ArchivedRecord } from "../src/archived/types";

function makeRecord(
  id: string,
  status: "completed" | "failed",
  overrides: Partial<ArchivedRecord> = {}
): ArchivedRecord {
  return {
    id,
    recipient: `recipient-${id}`,
    amount: 1000n,
    timestamp: 1700000000,
    archivedAt: 1700000001,
    status,
    ...overrides,
  };
}

const completed1 = makeRecord("c1", "completed");
const completed2 = makeRecord("c2", "completed");
const failed1 = makeRecord("f1", "failed");
const failed2 = makeRecord("f2", "failed");
const mixed = [completed1, failed1, completed2, failed2];

describe("filterArchivedRecords", () => {
  describe("status: 'completed'", () => {
    it("returns only completed records", () => {
      const result = filterArchivedRecords(mixed, { status: "completed" });
      expect(result).toHaveLength(2);
      expect(result.every((r) => r.status === "completed")).toBe(true);
    });

    it("returns ids c1 and c2", () => {
      const result = filterArchivedRecords(mixed, { status: "completed" });
      expect(result.map((r) => r.id)).toEqual(["c1", "c2"]);
    });
  });

  describe("status: 'failed'", () => {
    it("returns only failed records", () => {
      const result = filterArchivedRecords(mixed, { status: "failed" });
      expect(result).toHaveLength(2);
      expect(result.every((r) => r.status === "failed")).toBe(true);
    });

    it("returns ids f1 and f2", () => {
      const result = filterArchivedRecords(mixed, { status: "failed" });
      expect(result.map((r) => r.id)).toEqual(["f1", "f2"]);
    });
  });

  describe("no status filter", () => {
    it("returns all records when status is undefined", () => {
      const result = filterArchivedRecords(mixed, {});
      expect(result).toHaveLength(4);
    });

    it("returns all records preserving order", () => {
      const result = filterArchivedRecords(mixed, {});
      expect(result.map((r) => r.id)).toEqual(["c1", "f1", "c2", "f2"]);
    });
  });

  describe("empty input", () => {
    it("returns empty array for completed filter on empty input", () => {
      expect(filterArchivedRecords([], { status: "completed" })).toEqual([]);
    });

    it("returns empty array for no filter on empty input", () => {
      expect(filterArchivedRecords([], {})).toEqual([]);
    });
  });

  describe("no mutation", () => {
    it("does not mutate the input array", () => {
      const input = [completed1, failed1];
      const original = [...input];
      filterArchivedRecords(input, { status: "completed" });
      expect(input).toEqual(original);
    });

    it("returns a new array reference", () => {
      const input = [completed1, failed1];
      const result = filterArchivedRecords(input, {});
      expect(result).not.toBe(input);
    });
  });
});
