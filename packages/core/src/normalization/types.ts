/**
 * Canonical payroll payload types.
 *
 * SDK consumers may supply payroll data in slightly different shapes
 * (different key names, extra whitespace, comma-formatted amounts, mixed
 * casing on addresses, etc). The normalizer in this module converts any of
 * those shapes into one canonical form used internally by validation, proof
 * preparation, and transaction building.
 */

/**
 * Loosely-typed payroll entry as it may arrive from a consumer (CSV import,
 * HR system export, hand-written object literal, ...). Field names are
 * intentionally permissive — {@link normalizePayrollPayload} accepts several
 * common aliases for each canonical field.
 */
export interface RawPayrollEntry {
  employeeId?: unknown;
  employee_id?: unknown;
  id?: unknown;

  recipient?: unknown;
  walletAddress?: unknown;
  wallet_address?: unknown;
  wallet?: unknown;
  address?: unknown;

  asset?: unknown;
  assetId?: unknown;
  asset_id?: unknown;
  token?: unknown;

  period?: unknown;
  periodId?: unknown;
  period_id?: unknown;
  payPeriod?: unknown;

  amount?: unknown;
  salaryAmount?: unknown;
  salary_amount?: unknown;

  department?: unknown;

  [key: string]: unknown;
}

/** A raw payroll payload as supplied by an SDK consumer. */
export interface RawPayrollPayload {
  entries: RawPayrollEntry[];
}

/** Points back to the original input an entry was normalized from. */
export interface PayrollEntrySource {
  /** Position of this entry in the original `entries` array. */
  index: number;
  /** The untouched, original entry object. */
  raw: RawPayrollEntry;
}

/**
 * The canonical shape for a single payroll entry, used internally by the SDK
 * for validation, proof preparation, and transaction building.
 *
 * Required fields (`employeeId`, `walletAddress`, `asset`, `amount`) are
 * always present as strings — normalization never drops them. When the
 * source data was missing or unusable, the field is set to `""` and a
 * corresponding {@link NormalizationIssue} is recorded so validation can
 * still surface a clear, positioned error instead of silently accepting bad
 * data.
 */
export interface CanonicalPayrollEntry {
  /** Trimmed employee identifier. */
  employeeId: string;
  /** Trimmed, uppercased wallet address (Stellar strkeys are uppercase). */
  walletAddress: string;
  /** Trimmed asset identifier; common XLM aliases collapse to `"native"`. */
  asset: string;
  /** Trimmed period identifier, if provided. */
  period?: string;
  /** Amount as a canonical numeric string (formatting artifacts stripped). */
  amount: string;
  /** Trimmed department label, if provided. */
  department?: string;
  /** Reference back to the original input, for error reporting. */
  source: PayrollEntrySource;
}

/** Machine-readable reason a field could not be cleanly normalized. */
export type NormalizationIssueCode = "MISSING" | "UNPARSEABLE_AMOUNT";

/** A field on a specific entry that normalization could not fully resolve. */
export interface NormalizationIssue {
  /** Position of the affected entry in the original `entries` array. */
  index: number;
  /** Canonical field the issue applies to. */
  field: "employeeId" | "walletAddress" | "asset" | "amount";
  code: NormalizationIssueCode;
  message: string;
}

/** Result of normalizing a raw payroll payload. */
export interface NormalizedPayrollPayload {
  /** Canonical entries, one per input entry, in the same order. */
  entries: CanonicalPayrollEntry[];
  /**
   * Issues found while normalizing required fields. Empty when every entry
   * had usable data for `employeeId`, `walletAddress`, `asset`, and `amount`.
   * Downstream validation should treat entries referenced here as invalid.
   */
  issues: NormalizationIssue[];
}
