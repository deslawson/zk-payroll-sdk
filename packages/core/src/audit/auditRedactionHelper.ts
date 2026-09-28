/**
 * Sensitive fields default mask set for audit package redaction.
 */
export const DEFAULT_SENSITIVE_KEYS: string[] = [
  "viewKey",
  "viewingKey",
  "privateKey",
  "secret",
  "secretKey",
  "salaryAmount",
  "ssn",
  "taxId",
  "creditCard",
  "bankAccount",
];

export interface RedactionMaskOptions {
  /** Additional key names to scrub from audit packages. */
  additionalKeys?: string[];
  /** Custom replacement placeholder text (default: "[REDACTED]"). */
  placeholder?: string;
  /** Whether to redact recursively through nested objects and arrays (default: true). */
  recursive?: boolean;
}

export interface AuditPackageRedactionResult<T = unknown> {
  redactedData: T;
  redactedFieldCount: number;
  redactedKeys: string[];
}

/**
 * Helper class for redacting sensitive privacy-preserving fields from audit packages
 * before they are logged, exported, or rendered in UI interfaces.
 */
export class AuditPackageRedactor {
  private sensitiveKeys: Set<string>;
  private placeholder: string;
  private recursive: boolean;

  constructor(options?: RedactionMaskOptions) {
    const keys = [...DEFAULT_SENSITIVE_KEYS, ...(options?.additionalKeys ?? [])];
    this.sensitiveKeys = new Set(keys.map((k) => k.toLowerCase()));
    this.placeholder = options?.placeholder ?? "[REDACTED]";
    this.recursive = options?.recursive ?? true;
  }

  /**
   * Redacts sensitive privacy fields from any audit package object or structure.
   */
  public redact<T = any>(packageData: T): AuditPackageRedactionResult<T> {
    const redactedKeysSeen: Set<string> = new Set();
    let count = 0;

    const processValue = (val: any): any => {
      if (val === null || val === undefined) return val;

      if (Array.isArray(val)) {
        return this.recursive ? val.map((item) => processValue(item)) : val;
      }

      if (typeof val === "object" && !(val instanceof Date) && !(val instanceof RegExp)) {
        const copy: Record<string, any> = {};
        for (const [key, itemVal] of Object.entries(val)) {
          if (this.sensitiveKeys.has(key.toLowerCase())) {
            copy[key] = this.placeholder;
            redactedKeysSeen.add(key);
            count++;
          } else if (this.recursive) {
            copy[key] = processValue(itemVal);
          } else {
            copy[key] = itemVal;
          }
        }
        return copy;
      }

      return val;
    };

    const redactedData = processValue(packageData);

    return {
      redactedData,
      redactedFieldCount: count,
      redactedKeys: Array.from(redactedKeysSeen),
    };
  }
}

/**
 * Functional shorthand helper to redact an audit package with optional custom settings.
 */
export function redactAuditPackage<T = any>(
  packageData: T,
  options?: RedactionMaskOptions
): AuditPackageRedactionResult<T> {
  const redactor = new AuditPackageRedactor(options);
  return redactor.redact(packageData);
}
