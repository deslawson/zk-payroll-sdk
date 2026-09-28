import type { ArchivedRecord, ArchivedRecordFilter } from "./types";

/**
 * Applies an `ArchivedRecordFilter` to an array of archived records.
 *
 * This is the low-level filter — it only handles the `status` dimension.
 * For richer filtering (period, employee, asset, amount bounds), use
 * `ArchiveFilterBuilder` + `getArchivedPayrollPage`.
 *
 * @param records - The records to filter.
 * @param filter  - The filter to apply.
 * @returns A new array containing only matching records. The input array
 *          is never mutated.
 *
 * @example
 * ```ts
 * const completed = filterArchivedRecords(records, { status: "completed" });
 * const all       = filterArchivedRecords(records, {});
 * ```
 */
export function filterArchivedRecords(
  records: ArchivedRecord[],
  filter: ArchivedRecordFilter
): ArchivedRecord[] {
  if (filter.status === undefined) {
    // No status constraint — return a shallow copy to avoid mutation
    return records.slice();
  }
  return records.filter((r) => r.status === filter.status);
}
