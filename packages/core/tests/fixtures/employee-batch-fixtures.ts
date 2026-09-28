import type {
  EmployeeRecord,
  EmployeeBatchValidationError,
} from "../../src/batch/employeeBatchSchemaValidator";

export const FIXTURE_EMPLOYEE_ID_A = "EMP-001";
export const FIXTURE_EMPLOYEE_ID_B = "EMP-002";
export const FIXTURE_EMPLOYEE_ID_C = "EMP-003";

export const FIXTURE_RECIPIENT_A = "GAEMPLOYEEBATCHRECIPIENT1234567890ABCDEFGHIJKLMNOPQRSTUV";
export const FIXTURE_RECIPIENT_B = "GBEMPLOYEEBATCHRECIPIENT1234567890ABCDEFGHIJKLMNOPQRSTUV";
export const FIXTURE_RECIPIENT_C = "GCEMPLOYEEBATCHRECIPIENT1234567890ABCDEFGHIJKLMNOPQRSTUV";

export const FIXTURE_ASSET_USDC = "CUSDC000000000000000000000000000000000000000000";

export const EMPLOYEE_ALICE: EmployeeRecord = {
  employeeId: FIXTURE_EMPLOYEE_ID_A,
  recipient: FIXTURE_RECIPIENT_A,
  salary: 5_000_000_000n,
  asset: "native",
  name: "Alice",
};

export const EMPLOYEE_BOB: EmployeeRecord = {
  employeeId: FIXTURE_EMPLOYEE_ID_B,
  recipient: FIXTURE_RECIPIENT_B,
  salary: 3_000_000_000n,
  asset: "native",
  name: "Bob",
};

export const EMPLOYEE_CAROL: EmployeeRecord = {
  employeeId: FIXTURE_EMPLOYEE_ID_C,
  recipient: FIXTURE_RECIPIENT_C,
  salary: 2_500_000_000n,
  asset: FIXTURE_ASSET_USDC,
  name: "Carol",
};

export const EMPLOYEE_MIN_SALARY: EmployeeRecord = {
  employeeId: "EMP-MIN",
  recipient: FIXTURE_RECIPIENT_C,
  salary: 1n,
  asset: "native",
};

const MSG_EMPTY = "Employee batch must contain at least one employee record";
const MSG_MISSING_EMPLOYEE_ID = "Employee ID is required";
const MSG_DUPLICATE_EMPLOYEE_ID = (a: number, b: number): string =>
  `Duplicate employee ID at indices ${a} and ${b}`;
const MSG_INVALID_RECIPIENT = "Recipient address is required";
const MSG_DUPLICATE_RECIPIENT = (a: number, b: number): string =>
  `Duplicate recipient at indices ${a} and ${b}`;
const MSG_INVALID_SALARY = "Salary must be a positive value";
const MSG_MISSING_ASSET = "Asset identifier is required";

export interface EmployeeBatchValidationScenario {
  readonly name: string;
  readonly input: EmployeeRecord[];
  readonly expected: EmployeeBatchValidationError[];
}

export const SCENARIO_EMPLOYEE_BATCH_VALID: EmployeeBatchValidationScenario = {
  name: "valid-single-employee",
  input: [EMPLOYEE_ALICE],
  expected: [],
};

export const SCENARIO_EMPLOYEE_BATCH_EMPTY: EmployeeBatchValidationScenario = {
  name: "invalid-empty-batch",
  input: [],
  expected: [
    {
      code: "EMPTY_EMPLOYEE_BATCH",
      message: MSG_EMPTY,
      field: "employees",
    },
  ],
};

export const SCENARIO_EMPLOYEE_BATCH_MISSING_ID: EmployeeBatchValidationScenario = {
  name: "invalid-missing-employee-id",
  input: [
    EMPLOYEE_ALICE,
    { employeeId: "", recipient: FIXTURE_RECIPIENT_B, salary: 100n, asset: "native" },
  ],
  expected: [
    {
      code: "MISSING_EMPLOYEE_ID",
      message: MSG_MISSING_EMPLOYEE_ID,
      field: "employeeId",
      index: 1,
    },
  ],
};

export const SCENARIO_EMPLOYEE_BATCH_DUPLICATE_ID: EmployeeBatchValidationScenario = {
  name: "invalid-duplicate-employee-id",
  input: [
    { employeeId: "EMP-001", recipient: FIXTURE_RECIPIENT_A, salary: 100n, asset: "native" },
    { employeeId: "EMP-001", recipient: FIXTURE_RECIPIENT_B, salary: 200n, asset: "native" },
  ],
  expected: [
    {
      code: "DUPLICATE_EMPLOYEE_ID",
      message: MSG_DUPLICATE_EMPLOYEE_ID(0, 1),
      field: "employeeId",
      index: 1,
    },
  ],
};

export const SCENARIO_EMPLOYEE_BATCH_INVALID_RECIPIENT: EmployeeBatchValidationScenario = {
  name: "invalid-empty-recipient",
  input: [
    EMPLOYEE_ALICE,
    { employeeId: "EMP-002", recipient: "  ", salary: 100n, asset: "native" },
  ],
  expected: [
    {
      code: "INVALID_RECIPIENT",
      message: MSG_INVALID_RECIPIENT,
      field: "recipient",
      index: 1,
    },
  ],
};

export const SCENARIO_EMPLOYEE_BATCH_DUPLICATE_RECIPIENT: EmployeeBatchValidationScenario = {
  name: "invalid-duplicate-recipient",
  input: [
    { employeeId: "EMP-001", recipient: FIXTURE_RECIPIENT_A, salary: 100n, asset: "native" },
    { employeeId: "EMP-002", recipient: FIXTURE_RECIPIENT_A, salary: 200n, asset: "native" },
  ],
  expected: [
    {
      code: "DUPLICATE_RECIPIENT",
      message: MSG_DUPLICATE_RECIPIENT(0, 1),
      field: "recipient",
      index: 1,
    },
  ],
};

export const SCENARIO_EMPLOYEE_BATCH_ZERO_SALARY: EmployeeBatchValidationScenario = {
  name: "invalid-zero-salary",
  input: [{ employeeId: "EMP-001", recipient: FIXTURE_RECIPIENT_A, salary: 0n, asset: "native" }],
  expected: [
    {
      code: "INVALID_SALARY",
      message: MSG_INVALID_SALARY,
      field: "salary",
      index: 0,
    },
  ],
};

export const SCENARIO_EMPLOYEE_BATCH_NEGATIVE_SALARY: EmployeeBatchValidationScenario = {
  name: "invalid-negative-salary",
  input: [{ employeeId: "EMP-001", recipient: FIXTURE_RECIPIENT_A, salary: -1n, asset: "native" }],
  expected: [
    {
      code: "INVALID_SALARY",
      message: MSG_INVALID_SALARY,
      field: "salary",
      index: 0,
    },
  ],
};

export const SCENARIO_EMPLOYEE_BATCH_MISSING_ASSET: EmployeeBatchValidationScenario = {
  name: "invalid-missing-asset",
  input: [{ employeeId: "EMP-001", recipient: FIXTURE_RECIPIENT_A, salary: 100n, asset: "" }],
  expected: [
    {
      code: "MISSING_ASSET",
      message: MSG_MISSING_ASSET,
      field: "asset",
      index: 0,
    },
  ],
};

export const SCENARIO_EMPLOYEE_BATCH_MULTIPLE_ERRORS: EmployeeBatchValidationScenario = {
  name: "invalid-multiple-errors",
  input: [{ employeeId: "", recipient: "", salary: 0n, asset: "" }],
  expected: [
    {
      code: "MISSING_EMPLOYEE_ID",
      message: MSG_MISSING_EMPLOYEE_ID,
      field: "employeeId",
      index: 0,
    },
    {
      code: "INVALID_RECIPIENT",
      message: MSG_INVALID_RECIPIENT,
      field: "recipient",
      index: 0,
    },
    {
      code: "INVALID_SALARY",
      message: MSG_INVALID_SALARY,
      field: "salary",
      index: 0,
    },
    {
      code: "MISSING_ASSET",
      message: MSG_MISSING_ASSET,
      field: "asset",
      index: 0,
    },
  ],
};

export const SCENARIO_EMPLOYEE_BATCH_MIXED_ERRORS: EmployeeBatchValidationScenario = {
  name: "invalid-mixed-errors",
  input: [
    { employeeId: "EMP-001", recipient: FIXTURE_RECIPIENT_A, salary: 100n, asset: "native" },
    { employeeId: "EMP-001", recipient: FIXTURE_RECIPIENT_A, salary: 0n, asset: "" },
  ],
  expected: [
    {
      code: "DUPLICATE_EMPLOYEE_ID",
      message: MSG_DUPLICATE_EMPLOYEE_ID(0, 1),
      field: "employeeId",
      index: 1,
    },
    {
      code: "DUPLICATE_RECIPIENT",
      message: MSG_DUPLICATE_RECIPIENT(0, 1),
      field: "recipient",
      index: 1,
    },
    {
      code: "INVALID_SALARY",
      message: MSG_INVALID_SALARY,
      field: "salary",
      index: 1,
    },
    {
      code: "MISSING_ASSET",
      message: MSG_MISSING_ASSET,
      field: "asset",
      index: 1,
    },
  ],
};

export const SCENARIO_EMPLOYEE_BATCH_VALIDATIONS: readonly EmployeeBatchValidationScenario[] = [
  SCENARIO_EMPLOYEE_BATCH_VALID,
  SCENARIO_EMPLOYEE_BATCH_EMPTY,
  SCENARIO_EMPLOYEE_BATCH_MISSING_ID,
  SCENARIO_EMPLOYEE_BATCH_DUPLICATE_ID,
  SCENARIO_EMPLOYEE_BATCH_INVALID_RECIPIENT,
  SCENARIO_EMPLOYEE_BATCH_DUPLICATE_RECIPIENT,
  SCENARIO_EMPLOYEE_BATCH_ZERO_SALARY,
  SCENARIO_EMPLOYEE_BATCH_NEGATIVE_SALARY,
  SCENARIO_EMPLOYEE_BATCH_MISSING_ASSET,
  SCENARIO_EMPLOYEE_BATCH_MULTIPLE_ERRORS,
  SCENARIO_EMPLOYEE_BATCH_MIXED_ERRORS,
];
