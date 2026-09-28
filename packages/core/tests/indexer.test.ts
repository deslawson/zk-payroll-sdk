import {
  ContractStateIndexer,
  ContractStatePage,
  ContractStateReader,
  IndexedAuditPermission,
  IndexedCommitmentRecord,
  IndexedCompany,
  IndexedContractEvent,
  IndexedEmployee,
  IndexedPayrollRun,
} from "../src/indexer";

type CollectionName =
  "companies" | "employees" | "payrollRuns" | "events" | "commitments" | "auditPermissions";

interface MockState {
  companies: IndexedCompany[];
  employees: Record<string, IndexedEmployee[]>;
  payrollRuns: Record<string, IndexedPayrollRun[]>;
  events: Record<string, IndexedContractEvent[]>;
  commitments: Record<string, IndexedCommitmentRecord[]>;
  auditPermissions: Record<string, IndexedAuditPermission[]>;
}

class MockContractStateReader implements ContractStateReader {
  public readonly calls: Array<{ collection: CollectionName; companyId?: string; limit: number }> =
    [];

  constructor(private readonly state: MockState) {}

  async getCompany(companyId: string): Promise<IndexedCompany | undefined> {
    return this.state.companies.find((company) => company.id === companyId);
  }

  async listCompanies(request: {
    cursor?: string;
    limit: number;
  }): Promise<ContractStatePage<IndexedCompany>> {
    this.calls.push({ collection: "companies", limit: request.limit });
    return this.page(this.state.companies, request);
  }

  async listEmployees(
    companyId: string,
    request: { cursor?: string; limit: number }
  ): Promise<ContractStatePage<IndexedEmployee>> {
    this.calls.push({ collection: "employees", companyId, limit: request.limit });
    return this.page(this.state.employees[companyId] ?? [], request);
  }

  async listPayrollRuns(
    companyId: string,
    request: { cursor?: string; limit: number }
  ): Promise<ContractStatePage<IndexedPayrollRun>> {
    this.calls.push({ collection: "payrollRuns", companyId, limit: request.limit });
    return this.page(this.state.payrollRuns[companyId] ?? [], request);
  }

  async listContractEvents(
    companyId: string,
    request: { cursor?: string; limit: number }
  ): Promise<ContractStatePage<IndexedContractEvent>> {
    this.calls.push({ collection: "events", companyId, limit: request.limit });
    return this.page(this.state.events[companyId] ?? [], request);
  }

  async listCommitments(
    companyId: string,
    request: { cursor?: string; limit: number }
  ): Promise<ContractStatePage<IndexedCommitmentRecord>> {
    this.calls.push({ collection: "commitments", companyId, limit: request.limit });
    return this.page(this.state.commitments[companyId] ?? [], request);
  }

  async listAuditPermissions(
    companyId: string,
    request: { cursor?: string; limit: number }
  ): Promise<ContractStatePage<IndexedAuditPermission>> {
    this.calls.push({ collection: "auditPermissions", companyId, limit: request.limit });
    return this.page(this.state.auditPermissions[companyId] ?? [], request);
  }

  private page<T>(
    items: T[],
    request: { cursor?: string; limit: number }
  ): Promise<ContractStatePage<T>> {
    const start = request.cursor ? Number(request.cursor) : 0;
    const end = start + request.limit;
    return Promise.resolve({
      items: items.slice(start, end),
      nextCursor: end < items.length ? String(end) : undefined,
    });
  }
}

function makeCompleteState(): MockState {
  return {
    companies: [
      {
        id: "company-1",
        name: "Acme",
        treasury: { id: "treasury-1", asset: "USDC", address: "GASSET" },
        active: true,
      },
    ],
    employees: {
      "company-1": [
        {
          id: "employee-1",
          companyId: "company-1",
          walletAddress: "GEMPLOYEE1",
          status: "active",
          salary: 1_000n,
          token: "USDC",
        },
        {
          id: "employee-2",
          companyId: "company-1",
          walletAddress: "GEMPLOYEE2",
          status: "active",
          salary: 2_000n,
          token: "USDC",
        },
      ],
    },
    payrollRuns: {
      "company-1": [
        {
          id: "run-1",
          companyId: "company-1",
          employeeIds: ["employee-1", "employee-2"],
          status: "executed",
          totalAmount: 3_000n,
          commitmentIds: ["commitment-1", "commitment-2"],
          eventIds: ["event-1"],
        },
      ],
    },
    events: {
      "company-1": [
        {
          id: "event-1",
          type: "payroll_run_executed",
          companyId: "company-1",
          payrollRunId: "run-1",
          amount: 3_000n,
          occurredAt: 1_800_000_000,
          payload: { payrollRunTotal: 3_000n },
        },
      ],
    },
    commitments: {
      "company-1": [
        {
          id: "commitment-1",
          companyId: "company-1",
          employeeId: "employee-1",
          payrollRunId: "run-1",
          commitmentHash: "hash-1",
          amount: 1_000n,
        },
        {
          id: "commitment-2",
          companyId: "company-1",
          employeeId: "employee-2",
          payrollRunId: "run-1",
          commitmentHash: "hash-2",
          amount: 2_000n,
        },
      ],
    },
    auditPermissions: {
      "company-1": [
        {
          id: "audit-1",
          companyId: "company-1",
          auditor: "GAUDITOR",
          scope: "payroll:read",
          grantedAt: 1_700_000_000,
          expiresAt: 1_900_000_000,
        },
      ],
    },
  };
}

describe("ContractStateIndexer", () => {
  it("reconstructs a normalized payroll domain view from complete contract state", async () => {
    const reader = new MockContractStateReader(makeCompleteState());
    const result = await new ContractStateIndexer(reader).index({
      pageSize: 2,
      indexedAt: 1_800_000_001,
    });

    expect(result.companies).toHaveLength(1);
    expect(result.employees).toHaveLength(2);
    expect(result.payrollRuns).toHaveLength(1);
    expect(result.events).toHaveLength(1);
    expect(result.commitments).toHaveLength(2);
    expect(result.auditPermissions).toHaveLength(1);
    expect(result.diagnostics.all).toHaveLength(0);
    expect(result.checkpoint.complete).toBe(true);
  });

  it("reports recoverable missing references without crashing", async () => {
    const state = makeCompleteState();
    state.payrollRuns["company-1"][0].employeeIds.push("missing-employee");
    state.commitments["company-1"].push({
      id: "orphan-commitment",
      companyId: "company-1",
      employeeId: "missing-employee",
      payrollRunId: "missing-run",
      commitmentHash: "hash-orphan",
    });

    const result = await new ContractStateIndexer(new MockContractStateReader(state)).index({
      indexedAt: 1_800_000_001,
    });

    expect(result.diagnostics.warnings.map((d) => d.code)).toContain("MISSING_EMPLOYEE_REFERENCE");
    expect(result.diagnostics.recoverableErrors.map((d) => d.code)).toEqual(
      expect.arrayContaining(["MISSING_EMPLOYEE_REFERENCE", "MISSING_PAYROLL_RUN_REFERENCE"])
    );
    expect(result.diagnostics.fatalErrors).toHaveLength(0);
  });

  it("detects duplicate commitments and stale audit permissions", async () => {
    const state = makeCompleteState();
    state.commitments["company-1"].push({
      id: "commitment-duplicate",
      companyId: "company-1",
      employeeId: "employee-1",
      payrollRunId: "run-1",
      commitmentHash: "hash-1",
    });
    state.auditPermissions["company-1"][0].expiresAt = 1_799_999_999;

    const result = await new ContractStateIndexer(new MockContractStateReader(state)).index({
      indexedAt: 1_800_000_001,
    });

    expect(result.diagnostics.warnings.map((d) => d.code)).toEqual(
      expect.arrayContaining(["DUPLICATE_COMMITMENT", "STALE_AUDIT_PERMISSION"])
    );
  });

  it("emits typed fatal errors for corrupted event data", async () => {
    const state = makeCompleteState();
    state.events["company-1"].push({
      id: "corrupt-event",
      type: "payment_executed",
      companyId: "company-1",
      employeeId: "employee-1",
      payrollRunId: "run-1",
      amount: -1n,
      occurredAt: 1_800_000_001,
    });

    const result = await new ContractStateIndexer(new MockContractStateReader(state)).index({
      indexedAt: 1_800_000_001,
    });

    expect(result.diagnostics.fatalErrors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "CORRUPTED_EVENT_DATA",
          recordId: "corrupt-event",
        }),
      ])
    );
  });

  it("detects mismatched event data against payroll run membership", async () => {
    const state = makeCompleteState();
    state.events["company-1"].push({
      id: "mismatched-event",
      type: "payment_executed",
      companyId: "company-1",
      employeeId: "employee-3",
      payrollRunId: "run-1",
      amount: 100n,
      occurredAt: 1_800_000_001,
    });
    state.employees["company-1"].push({
      id: "employee-3",
      companyId: "company-1",
      walletAddress: "GEMPLOYEE3",
      status: "active",
    });

    const result = await new ContractStateIndexer(new MockContractStateReader(state)).index();

    expect(result.diagnostics.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MISMATCHED_EVENT_DATA",
          recordId: "mismatched-event",
        }),
      ])
    );
  });

  it("uses pagination for large datasets instead of assuming full-state reads", async () => {
    const state = makeCompleteState();
    state.employees["company-1"] = Array.from({ length: 250 }, (_, index) => ({
      id: `employee-${index}`,
      companyId: "company-1",
      walletAddress: `GEMPLOYEE${index}`,
      status: "active" as const,
    }));
    state.payrollRuns["company-1"][0].employeeIds = state.employees["company-1"].map(
      (employee) => employee.id
    );
    state.commitments["company-1"] = [];

    const reader = new MockContractStateReader(state);
    const result = await new ContractStateIndexer(reader).index({ pageSize: 50 });
    const employeeReads = reader.calls.filter((call) => call.collection === "employees");

    expect(result.employees).toHaveLength(250);
    expect(employeeReads).toHaveLength(5);
    expect(employeeReads.every((call) => call.limit === 50)).toBe(true);
    expect(result.checkpoint.complete).toBe(true);
  });

  it("returns an incomplete checkpoint when page budget is exhausted", async () => {
    const reader = new MockContractStateReader(makeCompleteState());
    const result = await new ContractStateIndexer(reader).index({ pageSize: 1, maxPages: 2 });

    expect(result.checkpoint.complete).toBe(false);
    expect(result.checkpoint.activeCompanyId).toBe("company-1");
    expect(result.checkpoint.companyCursors["company-1"].employeesCursor).toBe("1");
  });
});
