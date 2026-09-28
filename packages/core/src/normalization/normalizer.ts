import {
  CanonicalPayrollEntry,
  NormalizationIssue,
  NormalizedPayrollPayload,
  RawPayrollEntry,
  RawPayrollPayload,
} from "./types";

const EMPLOYEE_ID_KEYS = ["employeeId", "employee_id", "id"];
const WALLET_ADDRESS_KEYS = ["recipient", "walletAddress", "wallet_address", "wallet", "address"];
const ASSET_KEYS = ["asset", "assetId", "asset_id", "token"];
const PERIOD_KEYS = ["period", "periodId", "period_id", "payPeriod"];
const AMOUNT_KEYS = ["amount", "salaryAmount", "salary_amount"];

/** Aliases that collapse to the SDK's reserved native-asset identifier. */
const NATIVE_ASSET_ALIASES = new Set(["native", "xlm", "lumens"]);

const NUMERIC_AMOUNT_PATTERN = /^-?\d+(\.\d+)?$/;

/** Returns the first defined, non-null value among `keys` on `entry`. */
function pick(entry: RawPayrollEntry, keys: string[]): unknown {
  for (const key of keys) {
    const value = entry[key];
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

/** Coerces string/number/bigint input to a string; anything else is unusable. */
function coerceString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") return value.toString();
  return undefined;
}

/**
 * Normalizes an employee identifier: coerces to string and trims whitespace.
 * Returns `undefined` when no usable value was supplied.
 */
export function normalizeEmployeeId(value: unknown): string | undefined {
  const trimmed = coerceString(value)?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Normalizes a wallet address: coerces to string, trims whitespace, and
 * uppercases it (Stellar strkeys are always uppercase). Returns `undefined`
 * when no usable value was supplied.
 */
export function normalizeWalletAddress(value: unknown): string | undefined {
  const trimmed = coerceString(value)?.trim();
  return trimmed ? trimmed.toUpperCase() : undefined;
}

/**
 * Normalizes an asset identifier: coerces to string, trims whitespace, and
 * collapses common XLM aliases (`"xlm"`, `"lumens"`, any casing) to the SDK's
 * reserved `"native"` identifier. Any other value (e.g. a Soroban contract
 * ID) is trimmed but otherwise left untouched, since its casing is
 * significant. Returns `undefined` when no usable value was supplied.
 */
export function normalizeAssetId(value: unknown): string | undefined {
  const trimmed = coerceString(value)?.trim();
  if (!trimmed) return undefined;
  return NATIVE_ASSET_ALIASES.has(trimmed.toLowerCase()) ? "native" : trimmed;
}

/**
 * Normalizes a payroll period identifier: coerces to string and trims
 * whitespace. Returns `undefined` when no usable value was supplied.
 */
export function normalizePeriod(value: unknown): string | undefined {
  const trimmed = coerceString(value)?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Normalizes an amount to a canonical numeric string: `bigint`/`number`
 * inputs are stringified; string inputs have thousands separators, currency
 * symbols, and surrounding/internal whitespace stripped, and a redundant
 * leading `+` removed.
 *
 * This does not validate that the result is numeric — {@link
 * normalizePayrollPayload} records an `UNPARSEABLE_AMOUNT` issue for results
 * that don't look like a plain decimal number, while still preserving the
 * cleaned string so validation errors can reference what was supplied.
 *
 * Returns `undefined` when no usable value was supplied.
 */
export function normalizeAmount(value: unknown): string | undefined {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return Number.isFinite(value) ? value.toString() : undefined;
  if (typeof value !== "string") return undefined;

  const cleaned = value
    .trim()
    .replace(/[$€£¥]/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .replace(/^\+/, "");

  return cleaned ? cleaned : undefined;
}

/**
 * Converts a user-provided payroll payload into the SDK's canonical shape.
 *
 * Normalization is deliberately non-throwing: every input entry produces
 * exactly one canonical entry, in the same order, even when required fields
 * are missing or malformed. Problems are instead surfaced via the returned
 * `issues` array (indexed and field-tagged) and by preserving each entry's
 * original input under `source`, so validation run afterward can still
 * produce clear, positioned errors — normalization never silently drops
 * required data.
 *
 * @example
 * ```ts
 * const { entries, issues } = normalizePayrollPayload({
 *   entries: [
 *     { employee_id: "  E-1  ", wallet: "gabc...", asset: "XLM", amount: "1,000.50" },
 *   ],
 * });
 * // entries[0] => { employeeId: "E-1", walletAddress: "GABC...", asset: "native", amount: "1000.50", ... }
 * ```
 */
export function normalizePayrollPayload(input: RawPayrollPayload): NormalizedPayrollPayload {
  const entries: CanonicalPayrollEntry[] = [];
  const issues: NormalizationIssue[] = [];

  input.entries.forEach((raw, index) => {
    const employeeId = normalizeEmployeeId(pick(raw, EMPLOYEE_ID_KEYS));
    if (employeeId === undefined) {
      issues.push({
        index,
        field: "employeeId",
        code: "MISSING",
        message: "Employee id is required but was missing or empty.",
      });
    }

    const walletAddress = normalizeWalletAddress(pick(raw, WALLET_ADDRESS_KEYS));
    if (walletAddress === undefined) {
      issues.push({
        index,
        field: "walletAddress",
        code: "MISSING",
        message: "Wallet address is required but was missing or empty.",
      });
    }

    const asset = normalizeAssetId(pick(raw, ASSET_KEYS));
    if (asset === undefined) {
      issues.push({
        index,
        field: "asset",
        code: "MISSING",
        message: "Asset identifier is required but was missing or empty.",
      });
    }

    const rawAmount = pick(raw, AMOUNT_KEYS);
    const amount = normalizeAmount(rawAmount);
    if (amount === undefined) {
      issues.push({
        index,
        field: "amount",
        code: "MISSING",
        message: "Amount is required but was missing or empty.",
      });
    } else if (!NUMERIC_AMOUNT_PATTERN.test(amount)) {
      issues.push({
        index,
        field: "amount",
        code: "UNPARSEABLE_AMOUNT",
        message: `Amount "${String(rawAmount)}" could not be parsed as a numeric value.`,
      });
    }

    const period = normalizePeriod(pick(raw, PERIOD_KEYS));
    const department = coerceString(raw.department)?.trim() || undefined;

    entries.push({
      employeeId: employeeId ?? "",
      walletAddress: walletAddress ?? "",
      asset: asset ?? "",
      amount: amount ?? "",
      ...(period !== undefined ? { period } : {}),
      ...(department !== undefined ? { department } : {}),
      source: { index, raw },
    });
  });

  return { entries, issues };
}
