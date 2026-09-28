import {
  ContractStateIndexerOptions,
  ContractStateIndexResult,
  ContractStatePage,
  ContractStateReader,
  IndexedCommitmentRecord,
  IndexedCompany,
  IndexedContractEvent,
  IndexedPayrollDomainView,
  IndexedRecordId,
  IndexerDiagnostic,
  IndexingCheckpoint,
} from "./types";

const DEFAULT_INDEXER_PAGE_SIZE = 100;

interface ReadBudget {
  remainingPages?: number;
}

interface ReadPagesResult<T> {
  items: T[];
  nextCursor?: string;
}

export class ContractStateIndexer {
  constructor(private readonly reader: ContractStateReader) {}

  async index(options: ContractStateIndexerOptions = {}): Promise<ContractStateIndexResult> {
    const pageSize = options.pageSize ?? DEFAULT_INDEXER_PAGE_SIZE;
    const indexedAt = options.indexedAt ?? Math.floor(Date.now() / 1000);
    const budget: ReadBudget = {
      remainingPages: options.maxPages,
    };

    const checkpoint = this.createCheckpoint(options.checkpoint, indexedAt);
    const domain: IndexedPayrollDomainView = {
      companies: [],
      employees: [],
      payrollRuns: [],
      events: [],
      commitments: [],
      auditPermissions: [],
    };
    const diagnostics: IndexerDiagnostic[] = [];

    if (checkpoint.activeCompanyId) {
      const resumed = await this.resumeActiveCompany(
        checkpoint.activeCompanyId,
        checkpoint,
        domain,
        pageSize,
        budget,
        diagnostics
      );
      if (!resumed) {
        return this.toResult(domain, diagnostics, checkpoint, indexedAt);
      }
    }

    const companyPages = await this.readPages(
      (request) => this.reader.listCompanies(request),
      pageSize,
      budget,
      checkpoint.companyCursor
    );
    domain.companies.push(...companyPages.items);
    checkpoint.companyCursor = companyPages.nextCursor;

    for (const company of companyPages.items) {
      if (this.isBudgetExhausted(budget)) {
        checkpoint.activeCompanyId = company.id;
        checkpoint.complete = false;
        return this.toResult(domain, diagnostics, checkpoint, indexedAt);
      }

      if (checkpoint.completedCompanyIds.includes(company.id)) {
        continue;
      }

      const complete = await this.indexCompany(company, checkpoint, domain, pageSize, budget);
      if (!complete) {
        checkpoint.activeCompanyId = company.id;
        checkpoint.complete = false;
        return this.toResult(domain, diagnostics, checkpoint, indexedAt);
      }

      checkpoint.completedCompanyIds.push(company.id);
      checkpoint.companyCursors[company.id] = { complete: true };
    }

    checkpoint.activeCompanyId = undefined;
    checkpoint.complete = checkpoint.companyCursor === undefined;

    this.addConsistencyDiagnostics(domain, diagnostics, indexedAt);
    return this.toResult(domain, diagnostics, checkpoint, indexedAt);
  }

  private async resumeActiveCompany(
    companyId: IndexedRecordId,
    checkpoint: IndexingCheckpoint,
    domain: IndexedPayrollDomainView,
    pageSize: number,
    budget: ReadBudget,
    diagnostics: IndexerDiagnostic[]
  ): Promise<boolean> {
    if (!this.reader.getCompany) {
      diagnostics.push({
        severity: "fatal_error",
        code: "CHECKPOINT_REQUIRES_COMPANY_LOOKUP",
        message:
          "Cannot resume an active company checkpoint because the reader does not implement getCompany().",
        companyId,
      });
      checkpoint.complete = false;
      return false;
    }

    const company = await this.reader.getCompany(companyId);
    if (!company) {
      diagnostics.push({
        severity: "fatal_error",
        code: "MISSING_COMPANY_REFERENCE",
        message: `Cannot resume checkpoint because company ${companyId} is no longer readable.`,
        companyId,
      });
      checkpoint.complete = false;
      return false;
    }

    domain.companies.push(company);
    const complete = await this.indexCompany(company, checkpoint, domain, pageSize, budget);
    if (complete) {
      checkpoint.completedCompanyIds.push(company.id);
      checkpoint.companyCursors[company.id] = { complete: true };
      checkpoint.activeCompanyId = undefined;
    }

    return complete;
  }

  private async indexCompany(
    company: IndexedCompany,
    checkpoint: IndexingCheckpoint,
    domain: IndexedPayrollDomainView,
    pageSize: number,
    budget: ReadBudget
  ): Promise<boolean> {
    const companyCheckpoint = checkpoint.companyCursors[company.id] ?? {};
    checkpoint.companyCursors[company.id] = companyCheckpoint;

    const employees = await this.readPages(
      (request) => this.reader.listEmployees(company.id, request),
      pageSize,
      budget,
      companyCheckpoint.employeesCursor
    );
    domain.employees.push(...employees.items);
    companyCheckpoint.employeesCursor = employees.nextCursor;
    if (employees.nextCursor) return false;

    const payrollRuns = await this.readPages(
      (request) => this.reader.listPayrollRuns(company.id, request),
      pageSize,
      budget,
      companyCheckpoint.payrollRunsCursor
    );
    domain.payrollRuns.push(...payrollRuns.items);
    companyCheckpoint.payrollRunsCursor = payrollRuns.nextCursor;
    if (payrollRuns.nextCursor) return false;

    const events = await this.readPages(
      (request) => this.reader.listContractEvents(company.id, request),
      pageSize,
      budget,
      companyCheckpoint.eventsCursor
    );
    domain.events.push(...events.items);
    companyCheckpoint.eventsCursor = events.nextCursor;
    if (events.nextCursor) return false;

    const commitments = await this.readPages(
      (request) => this.reader.listCommitments(company.id, request),
      pageSize,
      budget,
      companyCheckpoint.commitmentsCursor
    );
    domain.commitments.push(...commitments.items);
    companyCheckpoint.commitmentsCursor = commitments.nextCursor;
    if (commitments.nextCursor) return false;

    const auditPermissions = await this.readPages(
      (request) => this.reader.listAuditPermissions(company.id, request),
      pageSize,
      budget,
      companyCheckpoint.auditPermissionsCursor
    );
    domain.auditPermissions.push(...auditPermissions.items);
    companyCheckpoint.auditPermissionsCursor = auditPermissions.nextCursor;
    companyCheckpoint.complete = auditPermissions.nextCursor === undefined;

    return companyCheckpoint.complete === true;
  }
  private async readPages<T>(
    readPage: (request: { cursor?: string; limit: number }) => Promise<ContractStatePage<T>>,
    limit: number,
    budget: ReadBudget,
    cursor?: string
  ): Promise<ReadPagesResult<T>> {
    const items: T[] = [];
    let nextCursor = cursor;

    do {
      if (this.isBudgetExhausted(budget)) {
        return { items, nextCursor };
      }

      const page = await readPage({ cursor: nextCursor, limit });
      this.consumePage(budget);
      items.push(...page.items);
      nextCursor = page.nextCursor;
    } while (nextCursor !== undefined);

    return { items };
  }

  private createCheckpoint(
    input: IndexingCheckpoint | undefined,
    indexedAt: number
  ): IndexingCheckpoint {
    return {
      companyCursor: input?.companyCursor,
      activeCompanyId: input?.activeCompanyId,
      companyCursors: { ...(input?.companyCursors ?? {}) },
      completedCompanyIds: [...(input?.completedCompanyIds ?? [])],
      complete: false,
      updatedAt: indexedAt,
    };
  }

  private addConsistencyDiagnostics(
    domain: IndexedPayrollDomainView,
    diagnostics: IndexerDiagnostic[],
    indexedAt: number
  ): void {
    const companyIds = new Set(domain.companies.map((company) => company.id));
    const employeeKeys = new Set(
      domain.employees.map((employee) => this.employeeKey(employee.companyId, employee.id))
    );
    const payrollRunKeys = new Set(
      domain.payrollRuns.map((run) => this.payrollRunKey(run.companyId, run.id))
    );
    const commitmentKeys = new Map<string, IndexedCommitmentRecord>();

    for (const employee of domain.employees) {
      if (!companyIds.has(employee.companyId)) {
        diagnostics.push({
          severity: "recoverable_error",
          code: "MISSING_COMPANY_REFERENCE",
          message: `Employee ${employee.id} references missing company ${employee.companyId}.`,
          companyId: employee.companyId,
          employeeId: employee.id,
          recordId: employee.id,
        });
      }
    }

    for (const run of domain.payrollRuns) {
      if (!companyIds.has(run.companyId)) {
        diagnostics.push({
          severity: "recoverable_error",
          code: "ORPHAN_PAYROLL_RUN",
          message: `Payroll run ${run.id} references missing company ${run.companyId}.`,
          companyId: run.companyId,
          payrollRunId: run.id,
          recordId: run.id,
        });
      }

      for (const employeeId of run.employeeIds) {
        if (!employeeKeys.has(this.employeeKey(run.companyId, employeeId))) {
          diagnostics.push({
            severity: "warning",
            code: "MISSING_EMPLOYEE_REFERENCE",
            message: `Payroll run ${run.id} references missing employee ${employeeId}.`,
            companyId: run.companyId,
            employeeId,
            payrollRunId: run.id,
            recordId: run.id,
          });
        }
      }
    }

    for (const commitment of domain.commitments) {
      if (!companyIds.has(commitment.companyId)) {
        diagnostics.push({
          severity: "recoverable_error",
          code: "MISSING_COMPANY_REFERENCE",
          message: `Commitment ${commitment.id} references missing company ${commitment.companyId}.`,
          companyId: commitment.companyId,
          recordId: commitment.id,
        });
      }

      if (!employeeKeys.has(this.employeeKey(commitment.companyId, commitment.employeeId))) {
        diagnostics.push({
          severity: "recoverable_error",
          code: "MISSING_EMPLOYEE_REFERENCE",
          message: `Commitment ${commitment.id} references missing employee ${commitment.employeeId}.`,
          companyId: commitment.companyId,
          employeeId: commitment.employeeId,
          payrollRunId: commitment.payrollRunId,
          recordId: commitment.id,
        });
      }

      if (
        commitment.payrollRunId &&
        !payrollRunKeys.has(this.payrollRunKey(commitment.companyId, commitment.payrollRunId))
      ) {
        diagnostics.push({
          severity: "recoverable_error",
          code: "MISSING_PAYROLL_RUN_REFERENCE",
          message: `Commitment ${commitment.id} references missing payroll run ${commitment.payrollRunId}.`,
          companyId: commitment.companyId,
          employeeId: commitment.employeeId,
          payrollRunId: commitment.payrollRunId,
          recordId: commitment.id,
        });
      }

      const duplicateKey = [
        commitment.companyId,
        commitment.employeeId,
        commitment.payrollRunId ?? "",
        commitment.commitmentHash,
      ].join(":");
      const existing = commitmentKeys.get(duplicateKey);
      if (existing) {
        diagnostics.push({
          severity: "warning",
          code: "DUPLICATE_COMMITMENT",
          message: `Commitments ${existing.id} and ${commitment.id} share the same employee/run/hash identity.`,
          companyId: commitment.companyId,
          employeeId: commitment.employeeId,
          payrollRunId: commitment.payrollRunId,
          recordId: commitment.id,
          details: { duplicateOf: existing.id },
        });
      } else {
        commitmentKeys.set(duplicateKey, commitment);
      }
    }

    for (const event of domain.events) {
      this.validateEvent(event, domain, companyIds, employeeKeys, payrollRunKeys, diagnostics);
    }

    for (const permission of domain.auditPermissions) {
      if (!companyIds.has(permission.companyId)) {
        diagnostics.push({
          severity: "recoverable_error",
          code: "MISSING_COMPANY_REFERENCE",
          message: `Audit permission ${permission.id} references missing company ${permission.companyId}.`,
          companyId: permission.companyId,
          recordId: permission.id,
        });
      }

      const isExpired = permission.expiresAt !== undefined && permission.expiresAt <= indexedAt;
      const isRevoked = permission.revokedAt !== undefined && permission.revokedAt <= indexedAt;
      if (isExpired || isRevoked) {
        diagnostics.push({
          severity: "warning",
          code: "STALE_AUDIT_PERMISSION",
          message: `Audit permission ${permission.id} is ${isRevoked ? "revoked" : "expired"}.`,
          companyId: permission.companyId,
          recordId: permission.id,
          details: { expiresAt: permission.expiresAt, revokedAt: permission.revokedAt },
        });
      }
    }
  }

  private validateEvent(
    event: IndexedContractEvent,
    domain: IndexedPayrollDomainView,
    companyIds: Set<string>,
    employeeKeys: Set<string>,
    payrollRunKeys: Set<string>,
    diagnostics: IndexerDiagnostic[]
  ): void {
    if (!event.id || !event.type || !Number.isFinite(event.occurredAt)) {
      diagnostics.push({
        severity: "fatal_error",
        code: "CORRUPTED_EVENT_DATA",
        message: `Event ${event.id || "<unknown>"} is missing a stable id, type, or timestamp.`,
        recordId: event.id,
      });
      return;
    }

    if (event.amount !== undefined && event.amount < 0n) {
      diagnostics.push({
        severity: "fatal_error",
        code: "CORRUPTED_EVENT_DATA",
        message: `Event ${event.id} contains a negative amount.`,
        companyId: event.companyId,
        employeeId: event.employeeId,
        payrollRunId: event.payrollRunId,
        recordId: event.id,
      });
    }

    if (event.companyId && !companyIds.has(event.companyId)) {
      diagnostics.push({
        severity: "recoverable_error",
        code: "MISSING_COMPANY_REFERENCE",
        message: `Event ${event.id} references missing company ${event.companyId}.`,
        companyId: event.companyId,
        recordId: event.id,
      });
    }

    if (
      event.companyId &&
      event.employeeId &&
      !employeeKeys.has(this.employeeKey(event.companyId, event.employeeId))
    ) {
      diagnostics.push({
        severity: "recoverable_error",
        code: "MISSING_EMPLOYEE_REFERENCE",
        message: `Event ${event.id} references missing employee ${event.employeeId}.`,
        companyId: event.companyId,
        employeeId: event.employeeId,
        payrollRunId: event.payrollRunId,
        recordId: event.id,
      });
    }

    if (
      event.companyId &&
      event.payrollRunId &&
      !payrollRunKeys.has(this.payrollRunKey(event.companyId, event.payrollRunId))
    ) {
      diagnostics.push({
        severity: "recoverable_error",
        code: "MISSING_PAYROLL_RUN_REFERENCE",
        message: `Event ${event.id} references missing payroll run ${event.payrollRunId}.`,
        companyId: event.companyId,
        employeeId: event.employeeId,
        payrollRunId: event.payrollRunId,
        recordId: event.id,
      });
      return;
    }

    const payrollRun = domain.payrollRuns.find(
      (run) => run.companyId === event.companyId && run.id === event.payrollRunId
    );
    if (payrollRun && event.employeeId && !payrollRun.employeeIds.includes(event.employeeId)) {
      diagnostics.push({
        severity: "warning",
        code: "MISMATCHED_EVENT_DATA",
        message: `Event ${event.id} references employee ${event.employeeId}, which is not part of payroll run ${payrollRun.id}.`,
        companyId: event.companyId,
        employeeId: event.employeeId,
        payrollRunId: event.payrollRunId,
        recordId: event.id,
      });
    }

    if (payrollRun?.totalAmount !== undefined && event.amount !== undefined) {
      const payloadTotal = event.payload?.payrollRunTotal;
      const expectedTotal =
        typeof payloadTotal === "bigint" ? payloadTotal : payrollRun.totalAmount;
      if (expectedTotal !== payrollRun.totalAmount) {
        diagnostics.push({
          severity: "warning",
          code: "MISMATCHED_EVENT_DATA",
          message: `Event ${event.id} reports a payroll total that differs from payroll run ${payrollRun.id}.`,
          companyId: event.companyId,
          employeeId: event.employeeId,
          payrollRunId: event.payrollRunId,
          recordId: event.id,
        });
      }
    }
  }

  private toResult(
    domain: IndexedPayrollDomainView,
    diagnostics: IndexerDiagnostic[],
    checkpoint: IndexingCheckpoint,
    indexedAt: number
  ): ContractStateIndexResult {
    return {
      ...domain,
      indexedAt,
      checkpoint,
      diagnostics: {
        warnings: diagnostics.filter((d) => d.severity === "warning"),
        recoverableErrors: diagnostics.filter((d) => d.severity === "recoverable_error"),
        fatalErrors: diagnostics.filter((d) => d.severity === "fatal_error"),
        all: diagnostics,
      },
    };
  }

  private employeeKey(companyId: IndexedRecordId, employeeId: IndexedRecordId): string {
    return `${companyId}:${employeeId}`;
  }

  private payrollRunKey(companyId: IndexedRecordId, payrollRunId: IndexedRecordId): string {
    return `${companyId}:${payrollRunId}`;
  }

  private isBudgetExhausted(budget: ReadBudget): boolean {
    return budget.remainingPages !== undefined && budget.remainingPages <= 0;
  }

  private consumePage(budget: ReadBudget): void {
    if (budget.remainingPages !== undefined) {
      budget.remainingPages -= 1;
    }
  }
}
