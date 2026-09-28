/* eslint-disable no-console */
/**
 * Batch Payload Validation Example
 *
 * Demonstrates validating batch payroll payloads prior to contract submission:
 *   - Creating and validating batch payloads with BatchPayloadBuilder
 *   - Handling structured validation errors (EMPTY_BATCH, DUPLICATE_RECIPIENT, INVALID_AMOUNT, MISSING_ASSET)
 *   - Integrating validation into PayrollValidation and PayrollService
 *
 * Run:
 *   npx tsx examples/batch-payload-validation.ts
 */

import {
  BatchPayloadBuilder,
  validateBatchPayload,
  BatchValidationFailedError,
  PayrollValidation,
} from "../packages/core/src";

function runExample() {
  console.log("=== SDK Batch Payload Validation Demo ===\n");

  // 1. Valid Batch Payload
  console.log("1. Validating a valid batch payload...");
  const validEntries = [
    { recipient: "GABC12345678901234567890123456789012345678901234567890123", amount: 1000000n, asset: "native" },
    { recipient: "GDEF12345678901234567890123456789012345678901234567890123", amount: 2500000n, asset: "native" },
  ];

  const validationErrors = validateBatchPayload(validEntries);
  if (validationErrors.length === 0) {
    console.log("✅ Batch payload is valid!");
    const payload = new BatchPayloadBuilder().addMany(validEntries).build();
    console.log(`   Total Entries: ${payload.entries.length}`);
    console.log(`   Total Amount: ${payload.totalAmount.toString()} stroops\n`);
  }

  // 2. Invalid Batch Payload with Multiple Errors
  console.log("2. Validating an invalid batch payload...");
  const invalidEntries = [
    { recipient: "GABC12345678901234567890123456789012345678901234567890123", amount: 100n, asset: "native" },
    { recipient: "GABC12345678901234567890123456789012345678901234567890123", amount: -50n, asset: "" },
  ];

  const errors = PayrollValidation.validateBatchPayload(invalidEntries);
  console.log(`⚠️ Detected ${errors.length} validation error(s):`);
  errors.forEach((err) => {
    console.log(`   - [${err.code}] Field: "${err.field}" (Index: ${err.index ?? "N/A"}): ${err.message}`);
  });

  // 3. Catching BatchValidationFailedError
  console.log("\n3. Attempting to build invalid batch payload...");
  try {
    PayrollValidation.assertValidBatchPayload(invalidEntries);
  } catch (error) {
    if (error instanceof BatchValidationFailedError) {
      console.log(`❌ Caught BatchValidationFailedError: ${error.message}`);
      console.log("   Structured errors ready for UI display:");
      console.table(error.validationErrors);
    }
  }

  console.log("\n=== Demo Complete ===");
}

runExample();
